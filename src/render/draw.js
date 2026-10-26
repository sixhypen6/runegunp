/* =========================================================
   RUNEGUN · Render — the world
   Drawing a frame of the arena: floor, seal, hazards, boss telegraphs, props, projectiles, enemies, the player and post FX.
   ========================================================= */
"use strict";

/* =========================================================
   RENDER
   ========================================================= */

/* ---------- baked glow sprites: the bullet halo without the blur pass ----------
   Every glowing bullet used to be a live `shadowBlur` draw — a Skia saveLayer
   plus a two-pass Gaussian, per bullet, per frame, 300+ of them in a late
   warden fight. That is the raster workload behind the Adreno driver segfaults
   the GLOW budget in canvas.js exists to contain. Instead, each distinct
   (shape, color, radius, glow) is rendered ONCE, halo baked in, into a tiny
   offscreen canvas; every on-screen bullet is then a plain drawImage — a
   texture blit the driver has no trouble with.
   The current GLOW scale rides in the cache key, so the Settings dial keeps
   working: sprites draw on their own canvases, which the canvas.js shim
   around `cx` never touches. Supersampled ×3 — crisp at DPR 2 × max ZOOM. */
const GLOW_SPRITES = new Map();
const SPRITE_SS = 3;
/* the frame vignette, cached across frames with identical parameters (draw()) */
let _vg = null, _vgKey = "";
function spriteCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * SPRITE_SS); c.height = Math.ceil(h * SPRITE_SS);
  const g = c.getContext("2d");
  g.scale(SPRITE_SS, SPRITE_SS);
  return [c, g];
}
function spriteKeep(key, s) {
  /* a GLOW change re-keys the set; don't hoard the stale generation */
  if (GLOW_SPRITES.size > 64) GLOW_SPRITES.clear();
  GLOW_SPRITES.set(key, s);
  return s;
}
/* enemy bullets: a glowing dot. ox/oy = the bullet centre inside the sprite. */
function glowDotSprite(color, r) {
  const blur = 8 * GLOW;
  const key = "o|" + color + "|" + r + "|" + blur;
  const hit = GLOW_SPRITES.get(key);
  if (hit) return hit;
  const pad = Math.ceil(blur * 1.6) + 2;
  const w = (r + pad) * 2;
  const [cvs, g] = spriteCanvas(w, w);
  if (blur > 0) { g.shadowColor = color; g.shadowBlur = blur; }
  g.fillStyle = color;
  g.beginPath(); g.arc(r + pad, r + pad, r, 0, TAU); g.fill();
  return spriteKeep(key, { cvs, w, h: w, ox: r + pad, oy: r + pad });
}
/* player bullets: the round-capped trail streak, drawn pointing +x with the
   HEAD at (ox, oy) — the caller rotates to the flight direction. */
function glowTrailSprite(color, r) {
  const rq = Math.max(1, Math.round(r * 2) / 2);   // quantized: bounds the cache
  const blur = 8 * GLOW;
  const key = "p|" + color + "|" + rq + "|" + blur;
  const hit = GLOW_SPRITES.get(key);
  if (hit) return hit;
  const pad = Math.ceil(blur * 1.6) + 2;
  const L = rq * 2.4;                              // tail→head, as the live stroke drew it
  const w = L + rq + pad * 2, h = rq + pad * 2;
  const [cvs, g] = spriteCanvas(w, h);
  if (blur > 0) { g.shadowColor = color; g.shadowBlur = blur; }
  g.strokeStyle = color; g.lineWidth = rq; g.lineCap = "round";
  g.beginPath();
  g.moveTo(pad + rq / 2, h / 2); g.lineTo(pad + rq / 2 + L, h / 2);
  g.stroke();
  return spriteKeep(key, { cvs, w, h, ox: pad + rq / 2 + L, oy: h / 2 });
}

/* ---------- PC: the horde's glow in ONE blur ----------
   Each horde body draws under a live shadowBlur — a blur pass per fill, and a spitter
   alone is six fills. A few hundred enemies is over a thousand blur passes a frame, and
   that, not pixels, is what a big horde costs: measured with 500 on screen, removing just
   the body blur took the frame rate from 30 to 77 fps on an RTX 5060 and from 20 to 61 on
   Intel UHD (the GPU waiting on passes — a faster GPU barely moved it, a lower resolution
   not at all).
   So on PC builds, from GLOW_LAYER_MIN live horde bodies up, the bodies and their omen
   halos draw crisp onto one offscreen layer, which is laid down blurred ONCE and then
   sharp on top. Each enemy keeps a glow in its own colour and silhouette; the cost stops
   growing with the horde. Bosses keep their own live glow. Android never takes this path
   — its WebView is where blur workloads have crashed GPU drivers (see canvas.js). */
const GLOW_LAYER_MIN = 24;
let glowLayer = null;
function hordeGlowLayer() {
  if (typeof PC_CONTROLS === "undefined" || !PC_CONTROLS || GLOW <= 0) return null;
  let n = 0;
  for (const e of enemies) if (!e.boss && !e.dead && ++n >= GLOW_LAYER_MIN) break;
  if (n < GLOW_LAYER_MIN) return null;
  if (!glowLayer) {
    const c = document.createElement("canvas"), g = c.getContext("2d");
    /* bodies set shadowBlur as they draw; on the layer it stays 0 — the blur comes once, at the end */
    Object.defineProperty(g, "shadowBlur", { configurable: true, get: () => 0, set() {} });
    glowLayer = { c, g };
  }
  const { c, g } = glowLayer;
  if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; }
  else { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); }
  g.setTransform(cx.getTransform());          // the camera (zoom, shake, DPR) the bodies would have drawn under
  return glowLayer;
}
function compositeGlowLayer(L) {
  cx.save();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.shadowBlur = 0; cx.globalAlpha = 1;
  /* the bodies' shadowBlur 10 is a Gaussian of σ 5 canvas px; the GLOW dial still scales it */
  cx.filter = "blur(" + (5 * GLOW) + "px)";
  cx.drawImage(L.c, 0, 0);
  cx.filter = "none";
  cx.drawImage(L.c, 0, 0);
  cx.restore();
}

/* one enemy's omen halos and body at its place in the world, onto g — the arena, or
   the horde's glow layer */
function drawEnemyBody(g, e) {
  /* omen halos — gold EMPOWERED, red WRATHFUL, ice RIMEBOUND, ember SEARING;
     a horror bearing several wears them as concentric rings, inner to outer
     in HALO_ORDER, each ring riding HALO_GAP outside the last */
  if (!e.boss && (e.buffed || e.wrath || e.rime || e.sear)) {
    g.save(); g.translate(e.x, e.y);
    let haloR = e.r + 7;
    for (const mk of HALO_ORDER) if (e[mk]) { drawHaloMark(g, mk, haloR, Game.time); haloR += HALO_GAP; }
    g.restore();
  }
  g.save(); g.translate(e.x, e.y);
  const eT = e.team === "p" ? combatTarget(e) : nearestPlayer(e.x, e.y);
  drawCreatureBody(g, e, angTo(e.x, e.y, eT.x, eT.y));
  g.restore();
}
/* burn / chill pips and the health sliver — always on the arena, never blurred */
function drawEnemyBars(e) {
  cx.shadowBlur = 0;
  if (e.burnT > 0) { cx.fillStyle = "#ff4d2e"; cx.fillRect(e.x - 4, e.y - e.r - 12, 8, 4); }
  if (e.slowT > 0) { cx.fillStyle = "#5ee6ff"; cx.fillRect(e.x - 4, e.y - e.r - 18, 8, 4); }
  if (e.hp < e.maxHp && !e.boss) {
    cx.fillStyle = "rgba(0,0,0,0.6)"; cx.fillRect(e.x - e.r, e.y + e.r + 4, e.r * 2, 3);
    cx.fillStyle = e.team === "p" ? "#9d6bff" : e.ambush ? "#ff4d5e" : "#e8e2d0";
    cx.fillRect(e.x - e.r, e.y + e.r + 4, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
}

/* CHAOS: the last horror of a normal wave is the one carrying the wave-clear
   rune. One pulsing dashed ring and four ticks — no blur, no extra pass — so
   the kill you need is unmistakable even in a crowded room. */
function drawChaosLastMark(g, e) {
  const t = Game.time, pulse = 0.5 + 0.5 * Math.sin(t * 5);
  g.save();
  g.translate(e.x, e.y);
  g.globalAlpha = 0.62 + pulse * 0.32;
  g.strokeStyle = typeof CHAOS_COLOR !== "undefined" ? CHAOS_COLOR : "#ff6bd6";
  g.lineWidth = 2.5;
  g.setLineDash([7, 6]);
  g.lineDashOffset = -t * 26;
  g.beginPath(); g.arc(0, 0, e.r + 9 + pulse * 2, 0, TAU); g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 0.9;
  g.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    g.rotate(TAU / 4);
    g.beginPath(); g.moveTo(0, -e.r - 4); g.lineTo(0, -e.r - 14); g.stroke();
  }
  g.restore();
}

/* One creature's body silhouette, drawn at the origin — the caller translates to
   (e.x, e.y) first. aimA is a parameter (not read from a live `player`) so the
   main-menu glossary can reuse the exact in-game art with a stub creature. */
function drawCreatureBody(cx, e, aimA) {
  const flash = e.hitFlash > 0;
  cx.shadowColor = e.color; cx.shadowBlur = e.boss ? 22 : (e.summoned ? 0 : 10);
  cx.fillStyle = flash ? "#ffffff" : e.color;
  /* floors VI–VIII: the deep wardens and horrors draw themselves (draw-deep.js) */
  if (!(e.boss && e.airborne) && (e.boss ? e.kind >= 5 : DEEP_TYPES.has(e.type)) && drawDeepBody(cx, e, aimA, flash)) return;
  if (e.boss) {
    if (e.airborne) {
      /* ascending: swells and fades as it rises above the floor */
      const frac = clamp(1 - e.airT / 2.2, 0, 1);
      const sc = 1 + frac * 0.55;
      cx.globalAlpha = clamp(0.9 - frac * 0.72, 0.1, 0.9);
      cx.scale(sc, sc);
      const spinSpd = 0.4 + frac * 1.4;
      cx.rotate(Game.time * spinSpd);
      for (let k = 0; k < 8; k++) {
        cx.rotate(TAU / 8);
        cx.font = "16px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillText("ᛝᚦᛟᛉᚺᛞᛣᚲ"[k], 0, -e.r - 14);
      }
      cx.rotate(-Game.time * spinSpd);
      cx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
      cx.fillStyle = "#0b0b14";
      cx.font = "30px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText("ᛝ", 0, 2);
      cx.globalAlpha = 1;
    } else {
      /* grounded body — a distinct silhouette per boss */
      if (e.kind === 0) {
        /* CHAINED WARDEN — octagon manacle, orbiting chain-links, a single slitted eye */
        cx.save();
        cx.rotate(Game.time * 0.9);
        cx.globalAlpha = 0.9; cx.strokeStyle = flash ? "#fff" : e.color; cx.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const aa = k / 6 * TAU, lx = Math.cos(aa) * (e.r + 18), ly = Math.sin(aa) * (e.r + 18);
          cx.beginPath(); cx.arc(lx, ly, 5, 0, TAU); cx.stroke();
          if (k > 0) { const pa = (k - 1) / 6 * TAU; cx.beginPath(); cx.moveTo(Math.cos(pa) * (e.r + 18), Math.sin(pa) * (e.r + 18)); cx.lineTo(lx, ly); cx.stroke(); }
        }
        cx.restore();
        cx.globalAlpha = 1; cx.fillStyle = flash ? "#fff" : e.color;
        cx.rotate(aimA);
        cx.beginPath();
        for (let i = 0; i < 8; i++) { const aa = i / 8 * TAU; const rr = e.r * (i % 2 ? 0.78 : 1); i === 0 ? cx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : cx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
        cx.closePath(); cx.fill();
        cx.fillStyle = e.atk === "hex" ? "#fff" : "#0b0b14";
        cx.beginPath(); cx.ellipse(e.r * 0.3, 0, e.r * 0.5, e.r * 0.22, 0, 0, TAU); cx.fill();
        cx.fillStyle = e.atk === "hex" ? e.color : "#ff4d5e";
        cx.beginPath(); cx.arc(e.r * 0.45, 0, e.r * 0.16, 0, TAU); cx.fill();

      } else if (e.kind === 1) {
        /* MARROW KING — a floating lich: tattered robe, exposed ribcage,
           hollow-eyed skull beneath a levitating crown, bone shards orbiting
           like loyal courtiers */
        const bob = Math.sin(Game.time * 2.3) * 4;
        cx.translate(0, bob);
        /* orbiting bone shards */
        cx.save();
        cx.strokeStyle = "#e8e2d0"; cx.lineWidth = 4; cx.lineCap = "round"; cx.globalAlpha = 0.85;
        for (let k = 0; k < 5; k++) {
          const aa = Game.time * 1.6 + k / 5 * TAU;
          const ox = Math.cos(aa) * (e.r + 20), oy = Math.sin(aa) * (e.r + 20) * 0.6;
          cx.save(); cx.translate(ox, oy); cx.rotate(aa + Game.time * 3);
          cx.beginPath(); cx.moveTo(-6, 0); cx.lineTo(6, 0); cx.stroke();
          cx.restore();
        }
        cx.restore(); cx.globalAlpha = 1; cx.lineCap = "butt";
        /* tattered robe, hem whipping in a wind that isn't there */
        cx.fillStyle = flash ? "#fff" : e.color;
        cx.beginPath();
        cx.moveTo(0, -e.r * 0.55);
        cx.quadraticCurveTo(e.r * 0.95, -e.r * 0.4, e.r * 0.75, e.r * 0.35);
        const hems = 5;
        for (let k = 0; k <= hems; k++) {
          const t = k / hems;
          cx.lineTo(lerp(e.r * 0.75, -e.r * 0.75, t),
                    e.r * (k % 2 ? 0.6 : 1.05) + Math.sin(Game.time * 4 + k) * 3);
        }
        cx.quadraticCurveTo(-e.r * 0.95, -e.r * 0.4, 0, -e.r * 0.55);
        cx.closePath(); cx.fill();
        /* exposed ribcage */
        cx.strokeStyle = flash ? "#fff" : "#e8e2d0"; cx.lineWidth = 2.5; cx.globalAlpha = 0.9;
        for (let k = 0; k < 3; k++) {
          cx.beginPath(); cx.arc(0, -e.r * 0.05 + k * e.r * 0.22, e.r * (0.5 - k * 0.08), 0.25, Math.PI - 0.25); cx.stroke();
        }
        cx.globalAlpha = 1;
        /* the skull */
        const sy = -e.r * 0.62;
        const siphoning = e.atk === "siphon";
        cx.fillStyle = flash ? "#fff" : "#e8e2d0";
        cx.beginPath(); cx.arc(0, sy, e.r * 0.42, 0, TAU); cx.fill();
        cx.fillRect(-e.r * 0.22, sy + e.r * 0.28, e.r * 0.44, e.r * 0.18);
        cx.fillStyle = "#0d110c";
        cx.beginPath(); cx.arc(-e.r * 0.16, sy - e.r * 0.04, e.r * 0.13, 0, TAU); cx.fill();
        cx.beginPath(); cx.arc(e.r * 0.16, sy - e.r * 0.04, e.r * 0.13, 0, TAU); cx.fill();
        cx.fillStyle = siphoning ? "#fff" : e.color;
        if (siphoning) { cx.shadowColor = "#fff"; cx.shadowBlur = 12; }
        cx.beginPath(); cx.arc(-e.r * 0.16, sy - e.r * 0.04, e.r * 0.06, 0, TAU); cx.fill();
        cx.beginPath(); cx.arc(e.r * 0.16, sy - e.r * 0.04, e.r * 0.06, 0, TAU); cx.fill();
        cx.shadowBlur = 0;
        /* levitating crown */
        const cy2 = sy - e.r * 0.62 + Math.sin(Game.time * 3.1) * 3;
        cx.fillStyle = flash ? "#fff" : "#ffd23d";
        cx.beginPath();
        cx.moveTo(-e.r * 0.4, cy2);
        for (let k = 0; k < 4; k++) {
          const x0 = -e.r * 0.4 + k / 4 * e.r * 0.8;
          cx.lineTo(x0 + e.r * 0.1, cy2 - e.r * 0.26);
          cx.lineTo(x0 + e.r * 0.2, cy2);
        }
        cx.closePath(); cx.fill();
        /* phylactery ward shimmer */
        if (e.shielded) {
          cx.strokeStyle = "#d8ffb0"; cx.lineWidth = 2;
          cx.globalAlpha = 0.4 + 0.3 * Math.sin(Game.time * 6);
          cx.setLineDash([8, 6]);
          cx.beginPath(); cx.arc(0, 0, e.r + 14, 0, TAU); cx.stroke();
          cx.setLineDash([]); cx.globalAlpha = 1;
        }

      } else if (e.kind === 2) {
        /* FORGE TYRANT — a walking volcano: a raw magma heart caged in armor
           plates that crack apart and finally blast off in the meltdown */
        const swing = e.atk === "hammer" || e.atk === "sweep";
        cx.save(); cx.rotate(aimA);
        /* the magma heart */
        const heat = 0.6 + 0.4 * Math.sin(Game.time * (e.aura ? 11 : 6));
        const coreR = e.r * (e.phase >= 3 ? 0.95 : 0.72);
        cx.fillStyle = "#ff5e2e";
        cx.beginPath(); cx.arc(0, 0, coreR, 0, TAU); cx.fill();
        cx.globalAlpha = heat; cx.fillStyle = "#ffd23d";
        cx.beginPath(); cx.arc(0, 0, coreR * 0.62, 0, TAU); cx.fill();
        cx.globalAlpha = heat * 0.8; cx.fillStyle = "#fff3c8";
        cx.beginPath(); cx.arc(0, 0, coreR * (0.3 + heat * 0.08), 0, TAU); cx.fill();
        cx.globalAlpha = 1;
        if (e.phase < 3) {
          /* armor shell — whole at first, plates missing once cracked */
          const plates = 6;
          cx.fillStyle = flash ? "#fff" : "#2a1410";
          cx.strokeStyle = "#ff5e2e"; cx.lineWidth = 2;
          for (let k = 0; k < plates; k++) {
            if (e.phase === 2 && k % 3 === 0) continue;
            const a0 = k / plates * TAU + 0.07, a1 = (k + 1) / plates * TAU - 0.07;
            cx.beginPath();
            cx.arc(0, 0, e.r, a0, a1);
            cx.arc(0, 0, coreR + 3, a1, a0, true);
            cx.closePath(); cx.fill(); cx.stroke();
          }
        } else {
          /* MELTDOWN: bare heart wreathed in whirling flame spikes */
          cx.fillStyle = flash ? "#fff" : "#ff5e2e";
          for (let k = 0; k < 8; k++) {
            const aa = k / 8 * TAU + Game.time * 2.2;
            const fr = e.r + 9 + Math.sin(Game.time * 9 + k) * 5;
            cx.save(); cx.rotate(aa);
            cx.beginPath(); cx.moveTo(e.r * 0.78, -6); cx.lineTo(fr, 0); cx.lineTo(e.r * 0.78, 6); cx.closePath(); cx.fill();
            cx.restore();
          }
        }
        /* furnace-slit eyes */
        cx.fillStyle = "#fff3c8";
        cx.shadowColor = "#ffd23d"; cx.shadowBlur = 8;
        cx.fillRect(e.r * 0.3, -e.r * 0.32, e.r * 0.3, e.r * 0.13);
        cx.fillRect(e.r * 0.3, e.r * 0.19, e.r * 0.3, e.r * 0.13);
        cx.shadowBlur = 0;
        /* the great hammer, head veined with heat */
        cx.rotate(swing ? Math.sin(Game.time * 14) * 0.55 : 0.22);
        cx.fillStyle = flash ? "#fff" : "#1a1a1a";
        cx.fillRect(e.r * 0.55, -e.r * 1.0, e.r * 1.05, e.r * 0.55);
        cx.strokeStyle = "#ff8a3d"; cx.lineWidth = 3; cx.strokeRect(e.r * 0.55, -e.r * 1.0, e.r * 1.05, e.r * 0.55);
        cx.fillStyle = "#ffd23d"; cx.globalAlpha = heat;
        cx.fillRect(e.r * 0.62, -e.r * 0.92, e.r * 0.9, e.r * 0.1);
        cx.globalAlpha = 1;
        cx.restore();

      } else if (e.kind === 3) {
        /* THE DROWNED MONARCH — a bloated king the water wears as a crown.
           Submerged he is no body at all: only a wake, ripples and running foam. */
        if (e.submerged) {
          cx.shadowBlur = 0;
          cx.strokeStyle = e.color;
          if (e.atk === "geyser") {
            /* the warning ring tightens — get off the spot */
            const p = 1 - clamp((e.at || 0) / 0.55, 0, 1);
            cx.globalAlpha = 0.4 + 0.5 * p;
            cx.lineWidth = 3;
            cx.setLineDash([6, 6]);
            cx.beginPath(); cx.arc(0, 0, e.r + 40 - p * 30, 0, TAU); cx.stroke();
            cx.setLineDash([]);
          }
          cx.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            const p = (Game.time * 0.9 + k / 3) % 1;
            cx.globalAlpha = 0.55 * (1 - p);
            cx.beginPath(); cx.arc(0, 0, e.r * (0.4 + p * 1.2), 0, TAU); cx.stroke();
          }
          /* the foam V trailing against its heading */
          cx.rotate(Math.atan2(e.vy || 0, e.vx || 1));
          cx.globalAlpha = 0.6;
          cx.beginPath(); cx.moveTo(4, 0); cx.lineTo(-e.r * 1.5, e.r * 0.85); cx.stroke();
          cx.beginPath(); cx.moveTo(4, 0); cx.lineTo(-e.r * 1.5, -e.r * 0.85); cx.stroke();
          cx.globalAlpha = 1;
        } else {
          /* surfaced: sagging waterlogged robes, kelp epaulettes, a crown gone askew */
          cx.translate(0, Math.sin(Game.time * 1.7) * 3);
          /* kelp strands swaying from the shoulders */
          cx.strokeStyle = flash ? "#fff" : "#1e6e5e";
          cx.lineWidth = 3; cx.lineCap = "round"; cx.globalAlpha = 0.85;
          for (let k = 0; k < 4; k++) {
            const kx = (k - 1.5) * e.r * 0.42;
            cx.beginPath();
            cx.moveTo(kx, -e.r * 0.35);
            cx.quadraticCurveTo(kx + Math.sin(Game.time * 2 + k) * 6, e.r * 0.35,
                                kx + Math.sin(Game.time * 1.4 + k * 2) * 10, e.r * 0.95);
            cx.stroke();
          }
          cx.lineCap = "butt"; cx.globalAlpha = 1;
          /* the bloated body — a sagging dome with a dragging waterlogged hem */
          cx.fillStyle = flash ? "#fff" : e.color;
          cx.beginPath();
          cx.moveTo(-e.r * 0.9, e.r * 0.5);
          cx.quadraticCurveTo(-e.r * 1.05, -e.r * 0.5, 0, -e.r * 0.78);
          cx.quadraticCurveTo(e.r * 1.05, -e.r * 0.5, e.r * 0.9, e.r * 0.5);
          const hems = 6;
          for (let k = 0; k <= hems; k++) {
            const t = k / hems;
            cx.lineTo(lerp(e.r * 0.9, -e.r * 0.9, t),
                      e.r * (k % 2 ? 0.62 : 1.0) + Math.sin(Game.time * 3 + k) * 3);
          }
          cx.closePath(); cx.fill();
          /* drowned-pale eyes glowing beneath the brow */
          cx.fillStyle = flash ? "#fff" : "#d8fffa";
          cx.shadowColor = "#d8fffa"; cx.shadowBlur = 12;
          cx.beginPath(); cx.arc(-e.r * 0.26, -e.r * 0.3, e.r * 0.1, 0, TAU); cx.fill();
          cx.beginPath(); cx.arc(e.r * 0.26, -e.r * 0.3, e.r * 0.1, 0, TAU); cx.fill();
          cx.shadowBlur = 0;
          /* a wailing dark mouth */
          cx.fillStyle = flash ? "#fff" : "#07131a";
          cx.beginPath(); cx.ellipse(0, -e.r * 0.02, e.r * 0.16, e.r * 0.22 * (1 + Math.sin(Game.time * 2.2) * 0.3), 0, 0, TAU); cx.fill();
          /* the crown, tilted and tarnished — the deep respects no throne */
          cx.save();
          cx.translate(e.r * 0.12, -e.r * 0.82 + Math.sin(Game.time * 2.6) * 2);
          cx.rotate(0.22);
          cx.fillStyle = flash ? "#fff" : "#ffd23d";
          cx.beginPath();
          cx.moveTo(-e.r * 0.38, 0);
          for (let k = 0; k < 4; k++) {
            const x0 = -e.r * 0.38 + k / 4 * e.r * 0.76;
            cx.lineTo(x0 + e.r * 0.095, -e.r * 0.24);
            cx.lineTo(x0 + e.r * 0.19, 0);
          }
          cx.closePath(); cx.fill();
          cx.restore();
        }

      } else {
        /* THE EVENT HORIZON — an absolute black sphere ringed in stolen light,
           dressed in a whirling accretion disc */
        const feast = e.feasting;
        const sc2 = feast ? 1.12 + 0.04 * Math.sin(Game.time * 12) : 1;
        cx.save(); cx.scale(sc2, sc2);
        /* far gravitational-lensing rings */
        cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 1.5;
        cx.setLineDash([3, 10]);
        for (let k = 0; k < 2; k++) {
          cx.globalAlpha = 0.22 - k * 0.08 + (feast ? 0.15 : 0);
          cx.save(); cx.rotate(Game.time * (k ? -0.4 : 0.55));
          cx.beginPath(); cx.arc(0, 0, e.r + 34 + k * 26, 0, TAU); cx.stroke();
          cx.restore();
        }
        cx.setLineDash([]); cx.globalAlpha = 1;
        /* accretion disc — three tilted arcs of infalling light */
        const discCols = ["#9d6bff", "#ffd23d", "#fff"];
        for (let k = 0; k < 3; k++) {
          cx.save();
          cx.rotate(Game.time * (1.1 + k * 0.5) * (feast ? 1.8 : 1) + k * 2.1);
          cx.strokeStyle = discCols[k];
          cx.globalAlpha = 0.55 + (feast ? 0.25 : 0);
          cx.lineWidth = 4 - k;
          cx.shadowColor = discCols[k]; cx.shadowBlur = 10;
          cx.beginPath();
          cx.ellipse(0, 0, e.r * 1.85 - k * 9, e.r * (0.62 - k * 0.07), 0, 0.3, TAU * 0.72);
          cx.stroke();
          cx.restore();
        }
        cx.shadowBlur = 0; cx.globalAlpha = 1;
        /* photon ring */
        cx.strokeStyle = flash ? "#fff" : (feast ? "#fff3c8" : "#c9b8ff");
        cx.lineWidth = 3;
        cx.shadowColor = "#c9b8ff"; cx.shadowBlur = 18 + (feast ? 10 : 0);
        cx.beginPath(); cx.arc(0, 0, e.r + 2, 0, TAU); cx.stroke();
        cx.shadowBlur = 0;
        /* the void itself — light stops here */
        cx.fillStyle = "#000";
        cx.beginPath(); cx.arc(0, 0, e.r, 0, TAU); cx.fill();
        /* a sliver of doppler glint */
        cx.strokeStyle = "#fff"; cx.globalAlpha = 0.5 + 0.3 * Math.sin(Game.time * 5);
        cx.lineWidth = 2;
        cx.beginPath(); cx.arc(0, 0, e.r - 3, Math.PI * 1.15, Math.PI * 1.55); cx.stroke();
        cx.globalAlpha = 1;
        /* the bullets it swallowed, circling the drain */
        if (e.stored > 0) {
          const motes = Math.min(e.stored, 14);
          cx.fillStyle = "#fff3c8"; cx.globalAlpha = 0.75;
          for (let k = 0; k < motes; k++) {
            const aa = Game.time * 3 + k / motes * TAU;
            cx.beginPath(); cx.arc(Math.cos(aa) * e.r * 0.6, Math.sin(aa) * e.r * 0.36, 2.2, 0, TAU); cx.fill();
          }
          cx.globalAlpha = 1;
        }
        cx.restore();
      }
    }
  } else if (e.type === "chaser") {
    cx.rotate(aimA);
    cx.beginPath(); cx.moveTo(e.r + 4, 0); cx.lineTo(-e.r, e.r * 0.8); cx.lineTo(-e.r * 0.4, 0); cx.lineTo(-e.r, -e.r * 0.8); cx.closePath(); cx.fill();
  } else if (e.type === "gunner") {
    cx.beginPath(); cx.arc(0, 0, e.r, 0, TAU); cx.fill();
    cx.fillStyle = flash ? "#fff" : "#0b0b14";
    cx.fillRect(Math.cos(aimA) * 6 - 3, Math.sin(aimA) * 6 - 3, 6, 6);
  } else if (e.type === "dasher") {
    cx.rotate(e.phase === "dash" ? Math.atan2(e.vy, e.vx) : aimA);
    const stretch = e.phase === "dash" ? 1.6 : e.phase === "wind" ? 0.8 + 0.15 * Math.sin(Game.time * 40) : 1;
    cx.scale(stretch, 1 / stretch);
    cx.beginPath();
    cx.moveTo(e.r + 3, 0); cx.lineTo(0, e.r); cx.lineTo(-e.r, 0); cx.lineTo(0, -e.r); cx.closePath(); cx.fill();
    if (e.phase === "wind") { cx.strokeStyle = "#fff"; cx.lineWidth = 2; cx.stroke(); }
  } else if (e.type === "slammer") {
    const sq = e.phase === "raise" ? 1 + (0.7 - Math.max(0, e.pt)) * 0.3 : 1;
    cx.scale(sq, 2 - sq);
    cx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
    cx.fillStyle = flash ? "#fff" : "#0b0b14";
    cx.fillRect(-e.r * 0.5, -e.r * 0.4, e.r * 0.3, e.r * 0.3);
    cx.fillRect(e.r * 0.2, -e.r * 0.4, e.r * 0.3, e.r * 0.3);
    if (e.phase === "raise") { cx.strokeStyle = "#ff8a3d"; cx.lineWidth = 2; cx.setLineDash([4, 4]);
      cx.beginPath(); cx.arc(0, 0, 170 / sq, 0, TAU); cx.stroke(); cx.setLineDash([]); }
  } else if (e.type === "spitter") {
    cx.rotate(e.spin || 0);
    for (let k = 0; k < 5; k++) { cx.rotate(TAU / 5);
      cx.beginPath(); cx.arc(e.r * 0.7, 0, e.r * 0.55, 0, TAU); cx.fill(); }
    cx.beginPath(); cx.arc(0, 0, e.r * 0.8, 0, TAU); cx.fill();
  } else if (e.type === "wisp") {
    if (e.phase === "tele") { /* arrival ring */
      cx.strokeStyle = e.color; cx.setLineDash([4, 4]); cx.lineWidth = 2;
      cx.globalAlpha = 0.8;
      cx.beginPath(); cx.arc(0, 0, e.r + 8 + e.pt * 30, 0, TAU); cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
    } else {
      cx.globalAlpha = 0.9;
      cx.beginPath(); cx.arc(0, 0, e.r, 0, TAU); cx.fill();
      cx.globalAlpha = 0.4;
      cx.beginPath(); cx.arc(0, 0, e.r + 5 + Math.sin(Game.time * 8) * 3, 0, TAU); cx.fill();
      cx.globalAlpha = 1;
    }
  } else if (e.type === "summoner") {
    cx.rotate(Math.sin(Game.time * 2) * 0.15);
    cx.beginPath(); /* hooded triangle */
    cx.moveTo(0, -e.r - 5); cx.lineTo(e.r, e.r); cx.lineTo(-e.r, e.r); cx.closePath(); cx.fill();
    cx.fillStyle = flash ? "#fff" : "#0d110c";
    cx.beginPath(); cx.arc(0, 0, e.r * 0.35, 0, TAU); cx.fill();
  } else if (e.type === "shade") {
    /* a torn shroud adrift. It breathes in and out of this world — opacity swells
       and thins so it always LOOKS like something you could put a hand through —
       but it never fades out entirely; dimmest while wading through solid stone. */
    const t = Game.time * 4 + (e.bob || 0);
    const breathe = 0.55 + 0.3 * Math.sin(t * 1.1);
    cx.translate(0, Math.sin(t * 0.7) * 3);
    cx.globalAlpha = breathe * (e.inRock ? 0.5 : 1);
    cx.shadowColor = e.color; cx.shadowBlur = 10 + breathe * 10;
    cx.beginPath();
    cx.moveTo(-e.r, e.r * 0.55);
    cx.lineTo(-e.r, -e.r * 0.1);
    cx.arc(0, -e.r * 0.1, e.r, Math.PI, 0);
    cx.lineTo(e.r, e.r * 0.55);
    for (let k = 1; k <= 5; k++)   /* the rippling hem */
      cx.lineTo(e.r - k / 5 * e.r * 2, e.r * (k % 2 ? 0.25 : 0.6) + Math.sin(t * 2 + k) * 2);
    cx.closePath(); cx.fill();
    /* hollow eyes and a wailing mouth */
    cx.fillStyle = flash ? "#fff" : "#0d110c";
    cx.beginPath(); cx.ellipse(-e.r * 0.34, -e.r * 0.22, e.r * 0.15, e.r * 0.24, 0, 0, TAU); cx.fill();
    cx.beginPath(); cx.ellipse(e.r * 0.34, -e.r * 0.22, e.r * 0.15, e.r * 0.24, 0, 0, TAU); cx.fill();
    cx.beginPath(); cx.ellipse(0, e.r * 0.28, e.r * 0.13, e.r * 0.2 * (1 + Math.sin(t * 1.3) * 0.35), 0, 0, TAU); cx.fill();
    cx.globalAlpha = 1; cx.shadowBlur = 0;
  } else if (e.type === "angler") {
    /* the murk given teeth. Lurking, the body is barely a suggestion — but the
       lure burns bright and gold and looks JUST like treasure. That is the point.
       (phase falls back to the bestiary stub's 1 → draws fully visible) */
    const lurking = e.phase === "lurk";
    const t = Game.time * 3 + (e.lureBob || 0);
    cx.rotate(aimA);
    cx.globalAlpha = lurking ? 0.15 : 1;
    /* body: a wide-mawed lurker, all shoulder and jaw */
    cx.beginPath();
    cx.moveTo(e.r * 1.05, -e.r * 0.15);
    cx.quadraticCurveTo(0, -e.r * 1.05, -e.r, -e.r * 0.35);
    cx.quadraticCurveTo(-e.r * 1.25, 0, -e.r, e.r * 0.35);
    cx.quadraticCurveTo(0, e.r * 1.05, e.r * 1.05, e.r * 0.15);
    cx.quadraticCurveTo(e.r * 0.55, 0, e.r * 1.05, -e.r * 0.15);
    cx.closePath(); cx.fill();
    if (e.phase === "wind") { cx.strokeStyle = "#fff"; cx.lineWidth = 2; cx.stroke(); }
    /* the zigzag tooth-line of the waiting maw */
    cx.strokeStyle = flash ? "#fff" : "#0d1a1f"; cx.lineWidth = 2;
    cx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const mx = e.r * (1.0 - k * 0.1), my = (k % 2 ? -1 : 1) * e.r * 0.13;
      k === 0 ? cx.moveTo(mx, my) : cx.lineTo(mx, my);
    }
    cx.stroke();
    /* a dead little eye */
    cx.fillStyle = flash ? "#fff" : "#0d1a1f";
    cx.beginPath(); cx.arc(-e.r * 0.15, -e.r * 0.4, e.r * 0.13, 0, TAU); cx.fill();
    cx.globalAlpha = 1;
    /* the lure — full brightness even while the body hides; false gold */
    const lx = e.r * 1.15 + 8, ly = -e.r * 0.55;
    cx.strokeStyle = e.color; cx.globalAlpha = lurking ? 0.35 : 0.9; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(e.r * 0.35, -e.r * 0.55);
    cx.quadraticCurveTo(e.r * 0.9, -e.r * 1.1, lx, ly); cx.stroke();
    cx.globalAlpha = 1;
    cx.fillStyle = "#ffd23d"; cx.shadowColor = "#ffd23d"; cx.shadowBlur = 10;
    cx.beginPath(); cx.arc(lx, ly, 2.5 + Math.sin(t * 2.3), 0, TAU); cx.fill();
    cx.shadowBlur = 0;
  } else if (e.type === "riptide") {
    /* a breaking wave that hunts: a curling crescent under a foam cap.
       Winding up it marks its lane; rushing it stretches down it. */
    const t = Game.time * 5 + e.r;
    if (e.phase === "wind") {
      cx.save();
      cx.rotate(e.rushAng || 0);
      cx.globalAlpha = 0.3 + 0.35 * Math.sin(Game.time * 24);
      cx.strokeStyle = e.color; cx.lineWidth = 3; cx.setLineDash([10, 8]);
      cx.beginPath(); cx.moveTo(e.r, 0); cx.lineTo(700, 0); cx.stroke();
      cx.setLineDash([]);
      cx.restore(); cx.globalAlpha = 1;
    }
    const rushing = e.phase === "rush";
    cx.rotate(rushing ? (e.rushAng || 0) : aimA);
    if (rushing) cx.scale(1.5, 0.8);
    /* the swelling body, curling forward over its own lip */
    cx.globalAlpha = 0.85;
    cx.beginPath();
    cx.moveTo(-e.r, e.r * 0.6);
    cx.quadraticCurveTo(-e.r * 0.6, -e.r * 1.1, e.r * 0.7, -e.r * 0.35);
    cx.quadraticCurveTo(e.r * 1.15, -e.r * 0.05, e.r * 0.8, e.r * 0.15);
    cx.quadraticCurveTo(e.r * 0.4, 0, e.r * 0.45, e.r * 0.3);
    cx.quadraticCurveTo(e.r, e.r * 0.45, e.r * 0.7, e.r * 0.6);
    cx.closePath(); cx.fill();
    if (e.phase === "wind") { cx.strokeStyle = "#fff"; cx.lineWidth = 2; cx.stroke(); }
    /* foam riding the crest */
    cx.strokeStyle = flash ? "#fff" : "#eafffb";
    cx.lineWidth = 2.5; cx.lineCap = "round"; cx.globalAlpha = 0.9;
    for (let k = 0; k < 4; k++) {
      const fx = -e.r * 0.5 + k * e.r * 0.38 + Math.sin(t + k) * 2;
      const fy = -e.r * (0.95 - k * 0.18) + Math.cos(t * 1.3 + k) * 2;
      cx.beginPath(); cx.moveTo(fx, fy); cx.lineTo(fx + e.r * 0.22, fy + e.r * 0.06); cx.stroke();
    }
    cx.lineCap = "butt"; cx.globalAlpha = 1;
  } else if (e.type === "cinder") {
    const sq = 1 + Math.sin(Game.time * 6) * 0.12;
    cx.scale(sq, 2 - sq);
    cx.beginPath(); cx.arc(0, 0, e.r, 0, TAU); cx.fill();
    cx.fillStyle = flash ? "#fff" : "#ffd23d";
    cx.beginPath(); cx.arc(0, 0, e.r * 0.45, 0, TAU); cx.fill();
  } else if (e.type === "slag" || e.type === "slagling") {
    /* a jagged boulder of half-cooled slag; mid-leap the body rides a sine arc
       while a grounded shadow keeps its true footprint honest.
       (jag/rockA fall back for the bestiary portrait's bare mock) */
    const big = e.type === "slag";
    const jag = e.jag || [1.05, 0.9, 1.1, 0.85, 1.08, 0.92, 1.02, 0.88];
    let hop = 0;
    if (e.phase === "leap") {
      const p = 1 - clamp(e.pt / e.leapDur, 0, 1);
      hop = Math.sin(p * Math.PI) * (big ? 74 : 34);
    }
    if (hop > 0) {
      cx.shadowBlur = 0; cx.fillStyle = "rgba(0,0,0,0.35)";
      const shr = 1 - hop / (big ? 300 : 140);
      cx.beginPath(); cx.ellipse(0, e.r * 0.5, e.r * shr, e.r * 0.45 * shr, 0, 0, TAU); cx.fill();
      cx.translate(0, -hop);
      const sc = 1 + hop / (big ? 260 : 120);
      cx.scale(sc, sc);
      cx.shadowColor = e.color; cx.shadowBlur = 10;
      cx.fillStyle = flash ? "#fff" : e.color;
    }
    if (e.phase === "crouch") {   // coils flat before the spring
      const q = 1 - 0.22 * (1 - Math.max(0, e.pt) / e.crouchDur);
      cx.scale(2 - q, q);
    }
    cx.rotate(e.rockA || 0);
    cx.beginPath();
    for (let k = 0; k < 8; k++) {
      const aa = k / 8 * TAU, rr = e.r * jag[k];
      k === 0 ? cx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : cx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
    }
    cx.closePath(); cx.fill();
    /* dark crust riding the melt */
    cx.fillStyle = flash ? "#fff" : "#2a1410";
    cx.beginPath();
    for (let k = 0; k < 8; k++) {
      const aa = k / 8 * TAU, rr = e.r * jag[k] * 0.62;
      k === 0 ? cx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : cx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
    }
    cx.closePath(); cx.fill();
    /* the molten heart glaring through */
    cx.fillStyle = flash ? "#fff" : "#ffd23d";
    cx.beginPath(); cx.arc(0, 0, e.r * (big ? 0.3 : 0.34) * (1 + Math.sin(Game.time * 7) * 0.12), 0, TAU); cx.fill();
  } else if (e.type === "phylactery") {
    /* the Marrow King's soul vessel — a glass shard caging green soulfire */
    const pulse = 0.65 + 0.35 * Math.sin(Game.time * 7 + (e.bob || 0));
    cx.rotate(Math.sin(Game.time * 3 + (e.bob || 0)) * 0.2);
    cx.strokeStyle = flash ? "#fff" : e.color; cx.lineWidth = 2.5;
    cx.beginPath(); cx.moveTo(0, -e.r - 5); cx.lineTo(e.r, 0); cx.lineTo(0, e.r + 5); cx.lineTo(-e.r, 0); cx.closePath(); cx.stroke();
    cx.globalAlpha = pulse; cx.fillStyle = flash ? "#fff" : e.color;
    cx.beginPath(); cx.arc(0, 0, e.r * 0.5, 0, TAU); cx.fill();
    cx.globalAlpha = 0.35 * pulse;
    cx.beginPath(); cx.arc(0, 0, e.r * 0.8, 0, TAU); cx.fill();
    cx.globalAlpha = 1;
  }
}

/* Hull damage cracks in unit body-space; scaled by body radius at the call site.
   Must be called inside a body's save/translate/rotate block — it zeroes the
   shadow, which the body's cx.restore() undoes for the barrel draw after. */
const CRACKS_HALF = [
  [[0.15,-0.85],[0.05,-0.35],[0.42,-0.05],[0.30,0.42]],
  [[-0.72,0.30],[-0.30,0.15],[-0.36,-0.28]],
];
const CRACKS_CRIT = CRACKS_HALF.concat([
  [[0.58,0.55],[0.20,0.30],[0.36,-0.12]],
  [[-0.20,0.82],[-0.08,0.35],[-0.46,0.10]],
  [[0.05,-0.38],[-0.16,-0.05],[0.00,0.36]],
]);
function drawCracks(cx, hpFrac, s) {
  if (hpFrac > 0.5) return;
  const crit = hpFrac < 0.3;
  cx.shadowBlur = 0;
  cx.strokeStyle = "#0b0b14"; cx.lineCap = "butt"; cx.lineJoin = "miter";
  cx.lineWidth = crit ? 1.7 : 1.1;
  cx.beginPath();
  for (const poly of (crit ? CRACKS_CRIT : CRACKS_HALF)) {
    cx.moveTo(poly[0][0] * s, poly[0][1] * s);
    for (let i = 1; i < poly.length; i++) cx.lineTo(poly[i][0] * s, poly[i][1] * s);
  }
  cx.stroke();
  /* exposed wiring: electric arcs snap across the worst cracks in stuttering bursts */
  if (crit) {
    const fl = Math.sin(Game.time * 31) * Math.sin(Game.time * 17.3);
    if (fl > 0.35) {
      const j = Math.sin(Game.time * 53) * 0.14;
      cx.strokeStyle = "#ffd23d"; cx.shadowColor = "#ffd23d"; cx.shadowBlur = 6;
      cx.lineWidth = 1; cx.globalAlpha = 0.9;
      cx.beginPath();
      cx.moveTo(0.30 * s, 0.42 * s);
      cx.lineTo((0.44 + j) * s, (0.58 - j) * s);
      cx.lineTo((0.36 - j) * s, (0.76 + j) * s);
      cx.moveTo(-0.46 * s, 0.10 * s);
      cx.lineTo((-0.60 + j) * s, (0.28 + j) * s);
      cx.lineTo((-0.52 - j) * s, (0.44 - j) * s);
      cx.stroke();
      cx.globalAlpha = 1;
    }
  }
}

/* ---------- the marks worn by empowered / wrathful horrors ----------
   A spiked halo drawn centred on the CURRENT origin (the caller translates), so the
   world pass and the glossary's OMENS portraits (overlays.js) share one source of
   truth — the ring a player studies in the codex is the ring they meet in the dark.
   kind: "buffed" (gold, clockwise) | "wrath" (red, counter-clockwise) |
   "rime" (ice-blue, clockwise) | "sear" (ember-orange, counter-clockwise);
   each kind's spikes ride a different fraction of a step round the ring and its wobble
   breathes out of phase, so stacked rings on one horror read as distinct.
   baseR: the radius the ring rides at, before its breathing wobble. */
const HALO_STYLES = {
  buffed: { color: "#ffd23d", dir:  1, off: 0,    ph: 0 },
  wrath:  { color: "#ff3d2e", dir: -1, off: 0.5,  ph: 2 },
  rime:   { color: "#5ee6ff", dir:  1, off: 0.25, ph: 4 },
  sear:   { color: "#ff8a3d", dir: -1, off: 0.75, ph: 6 },
};
/* draw order + spacing shared by the arena and the glossary portraits */
const HALO_ORDER = ["buffed", "wrath", "rime", "sear"];
const HALO_GAP = 8;
function drawHaloMark(g, kind, baseR, t) {
  const st = HALO_STYLES[kind], spikes = 8;
  const rr = baseR + Math.sin(t * 6 + st.ph) * 2;
  g.save();
  g.rotate(st.dir * t * 1.2);
  g.strokeStyle = st.color;
  g.shadowColor = g.strokeStyle; g.shadowBlur = 12;
  g.lineWidth = 2; g.globalAlpha = 0.85;
  g.beginPath();
  for (let k = 0; k < spikes; k++) {
    const a = (k + st.off) / spikes * TAU;
    g.moveTo(Math.cos(a) * (rr - 4), Math.sin(a) * (rr - 4));
    g.lineTo(Math.cos(a) * (rr + 4), Math.sin(a) * (rr + 4));
  }
  g.stroke();
  g.beginPath(); g.arc(0, 0, rr - 4, 0, TAU); g.stroke();
  g.restore();
}

function draw() {
  /* A throw anywhere below used to leave the camera transform pushed (the outer
     cx.save() never unwound), so every later frame painted another canvas-width
     off-world — the "broken camera" class of bug. Re-assert the pristine base
     transform and paint state before anything is drawn: a bad frame now costs
     only that frame. */
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.globalAlpha = 1; cx.shadowBlur = 0; cx.setLineDash([]);
  /* driven here, not in update(): update() early-returns on hitstop and never runs
     behind the pause / rune / choice overlays, which would strand the bar mid-drain */
  tickComboMeter();
  const F = floorDef();
  cx.fillStyle = F.floor;
  cx.fillRect(0, 0, W, H);
  /* soft cap: stacked juice must not shake into nausea. SCREEN SHAKE: OFF zeroes it here,
     not where it's set — dozens of sites raise Game.shake and none need to know */
  const sAmp = Meta.shake === false ? 0 : Math.min(Game.shake, 18);
  const sx = sAmp ? rnd(-sAmp, sAmp) : 0;
  const sy = sAmp ? rnd(-sAmp, sAmp) : 0;
  cx.save();
  if (Game.drunk > 0) drunkRoll();         // the saloon's rounds lean the room (scenes/saloon.js)
  cx.scale(ZOOM, ZOOM);
  cx.translate(-Game.cam.x + sx / ZOOM, -Game.cam.y + sy / ZOOM);

  /* ---------- viewport culling bounds ----------
     The camera sees a VW×VH slice of the 2600×1800 arena — most frames that is
     ~15% of it, yet every entity loop below used to run its full path-building
     and shadow-state churn regardless. Each loop skips what lies outside the
     slice plus a margin generous enough for the entity's own extent, its glow,
     and the ±18px screen shake. Only drawing is skipped — update() still
     simulates everything, on- or off-screen. */
  const cullL = Game.cam.x, cullT = Game.cam.y, cullR = Game.cam.x + VW, cullB = Game.cam.y + VH;

  /* floor grid */
  cx.strokeStyle = F.grid;
  cx.lineWidth = 1;
  const g = 90;
  const x0 = Math.floor(Game.cam.x / g) * g, y0 = Math.floor(Game.cam.y / g) * g;
  cx.beginPath();
  for (let x = x0; x < Game.cam.x + VW + g; x += g) { cx.moveTo(x, Game.cam.y - g); cx.lineTo(x, Game.cam.y + VH + g); }
  for (let y = y0; y < Game.cam.y + VH + g; y += g) { cx.moveTo(Game.cam.x - g, y); cx.lineTo(Game.cam.x + VW + g, y); }
  cx.stroke();

  /* walls */
  cx.strokeStyle = F.line; cx.lineWidth = 14;
  cx.strokeRect(23, 23, MAP.w - 46, MAP.h - 46);
  cx.strokeStyle = F.wallGlow; cx.lineWidth = 2; cx.globalAlpha = 0.5;
  cx.strokeRect(30, 30, MAP.w - 60, MAP.h - 60);
  cx.globalAlpha = 1;

  /* THE SINGULAR — the saloon's floor, walls and furniture, over the void */
  if (Game.inSaloon) drawSaloonUnder();
  /* floors VI–VIII: the stopped clock and its hands, the star's glow and shadows, stasis fields */
  drawDeepUnder();
  /* THE UNKNOWN — the abyss, and every floor warning its runes draw (draw-unknown.js) */
  if (Game.inUnknown) drawUnknownUnder();

  /* THE GRAND SEAL — heart of the floor (the saloon stands on top of it; the unknown has none) */
  if (!Game.inSaloon && !Game.inUnknown) {
    const s = SEAL;
    const glow = 0.5 + 0.5 * Math.sin(s.pulse);
    const col = s.state === "ready" ? "#ff4d5e" : s.state === "spent" ? "#3a3654" : F.wallGlow;
    cx.save();
    cx.translate(s.x, s.y);
    cx.globalAlpha = s.state === "spent" ? 0.25 : s.state === "ready" ? 0.6 + glow * 0.4 : 0.3;
    cx.strokeStyle = col; cx.lineWidth = 4;
    cx.beginPath(); cx.arc(0, 0, s.r, 0, TAU); cx.stroke();
    cx.lineWidth = 2;
    cx.beginPath(); cx.arc(0, 0, s.r * 0.72, 0, TAU); cx.stroke();
    cx.rotate(s.pulse * (s.state === "ready" ? 0.6 : 0.12));
    for (let i = 0; i < 6; i++) {
      cx.rotate(TAU / 6);
      cx.font = "20px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = col;
      cx.fillText("ᛝᚦᛟᛉᚺᛞ"[i], 0, -s.r * 0.86);
    }
    cx.rotate(-s.pulse * (s.state === "ready" ? 0.6 : 0.12));
    cx.font = "34px monospace";
    cx.fillStyle = col;
    if (s.state === "ready") { cx.shadowColor = col; cx.shadowBlur = 18 + glow * 10; }
    cx.fillText(s.state === "spent" ? "✕" : "ᛝ", 0, 1);
    cx.shadowBlur = 0;
    cx.restore();
    cx.globalAlpha = 1;
  }

  /* puddles */
  const puLowFx = puddles.length > 100; // the inner ring is the second path per pool
  for (const p of puddles) {
    if (p.x + p.r + 40 < cullL || p.x - p.r - 40 > cullR || p.y + p.r + 40 < cullT || p.y - p.r - 40 > cullB) continue;
    const isLava = p.lava;
    const a = p.life === Infinity ? 1 : p.t < 0.3 ? p.t / 0.3 : p.t > p.life - 0.8 ? clamp((p.life - p.t) / 0.8, 0, 1) : 1;
    cx.globalAlpha = (isLava ? 0.42 : 0.35) * a;
    cx.fillStyle = p.color;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, TAU); cx.fill();
    if (!puLowFx) {
      cx.globalAlpha = 0.7 * a;
      cx.strokeStyle = p.color; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(p.x, p.y, p.r * (0.7 + 0.1 * Math.sin(p.t * 5)), 0, TAU); cx.stroke();
    }
    cx.globalAlpha = 1;
  }

  /* boss world-space VFX: graves, vents, converge target, plunge shadow — for every
     warden standing (THE UNKNOWN's challenge rounds send back two at once) */
  for (const B of enemies) {
    if (!B.boss || B.dead || B.kind === UNK_KIND) continue;
    /* the telegraphs aim at the boss's CURRENT quarry — same pick as bossAI */
    const BT = nearestPlayer(B.x, B.y);
    /* Chained Warden — hex channel: a violet tether to the quarry + warning ring */
    if (B.atk === "hex" && !B.ghost) {
      const pulse = 0.5 + 0.5 * Math.sin(Game.time * 18);
      cx.globalAlpha = 0.35 + 0.45 * pulse;
      cx.strokeStyle = B.color; cx.lineWidth = 2; cx.setLineDash([6, 6]);
      cx.beginPath(); cx.moveTo(B.x, B.y); cx.lineTo(BT.x, BT.y); cx.stroke();
      cx.setLineDash([]);
      cx.lineWidth = 3;
      cx.beginPath(); cx.arc(BT.x, BT.y, 30 + pulse * 10, 0, TAU); cx.stroke();
      cx.globalAlpha = 0.7;
      cx.font = "20px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = B.color; cx.fillText("ᛇ", BT.x, BT.y - 40);
      cx.globalAlpha = 1;
    }
    /* Chained Warden — grasp wind-up: a taut chain snapping toward the quarry */
    if (B.atk === "grasp" && B.at > 0 && !B.ghost) {
      cx.globalAlpha = 0.5 + 0.3 * Math.sin(Game.time * 22);
      cx.strokeStyle = B.color; cx.lineWidth = 3;
      const n = 6;
      cx.beginPath(); cx.moveTo(B.x, B.y);
      for (let k = 1; k <= n; k++) { const t = k / n; cx.lineTo(lerp(B.x, BT.x, t) + rnd(-5, 5), lerp(B.y, BT.y, t) + rnd(-5, 5)); }
      cx.stroke();
      cx.globalAlpha = 1;
    }
    /* Marrow King — pulsing grave markers */
    for (const g of B.graves) {
      const prog = g.t / g.life;
      cx.globalAlpha = 0.35 + 0.45 * Math.sin(g.t * 12);
      cx.strokeStyle = B.color; cx.lineWidth = 2 + prog * 2;
      cx.beginPath(); cx.arc(g.x, g.y, 26 + prog * 10, 0, TAU); cx.stroke();
      cx.lineWidth = 1;
      cx.beginPath(); cx.arc(g.x, g.y, 12, 0, TAU); cx.stroke();
      cx.globalAlpha = 0.55 + 0.3 * prog;
      cx.font = "17px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = B.color;
      cx.fillText("ᛟ", g.x, g.y);
      cx.globalAlpha = 1;
    }
    /* Marrow King — converge ring preview */
    if (B.atk === "converge" && B.convergePos && !B.convergeShot) {
      cx.globalAlpha = 0.45 + 0.25 * Math.sin(Game.time * 10);
      cx.strokeStyle = B.color; cx.lineWidth = 2;
      cx.setLineDash([5, 8]);
      cx.beginPath(); cx.arc(B.convergePos.x, B.convergePos.y, 340, 0, TAU); cx.stroke();
      cx.setLineDash([]);
      cx.lineWidth = 3;
      cx.beginPath(); cx.arc(B.convergePos.x, B.convergePos.y, 9, 0, TAU); cx.stroke();
      cx.globalAlpha = 1;
    }
    /* Forge Tyrant — heat vent warning markers */
    for (const v of B.vents) {
      const prog = v.t / v.life;
      cx.globalAlpha = 0.3 + 0.5 * Math.sin(v.t * 16);
      cx.strokeStyle = "#ff5e2e"; cx.lineWidth = 2 + prog * 3;
      cx.beginPath(); cx.arc(v.x, v.y, 28 + prog * 16, 0, TAU); cx.stroke();
      cx.globalAlpha = 0.6 + 0.3 * Math.sin(v.t * 22);
      cx.font = "16px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = "#ff5e2e";
      cx.fillText("ᛟ", v.x, v.y);
      cx.globalAlpha = 1;
    }
    /* Marrow King — soul siphon: a green tether drinking you dry */
    if (B.atk === "siphon" && !B.ghost) {
      const open = !lineBlocked(B.x, B.y, BT.x, BT.y) && dist2(B.x, B.y, BT.x, BT.y) < 700 * 700;
      const pulse = 0.5 + 0.5 * Math.sin(Game.time * 16);
      cx.globalAlpha = open ? 0.45 + 0.4 * pulse : 0.15;
      cx.strokeStyle = open ? "#7dff5e" : "#3a4a30"; cx.lineWidth = open ? 3 : 1.5;
      const n = 7;
      cx.beginPath(); cx.moveTo(BT.x, BT.y);
      for (let k = 1; k <= n; k++) { const t = k / n; cx.lineTo(lerp(BT.x, B.x, t) + Math.sin(Game.time * 12 + k * 2) * 7, lerp(BT.y, B.y, t) + Math.cos(Game.time * 11 + k * 2) * 7); }
      cx.stroke();
      if (open) {
        cx.lineWidth = 2;
        cx.beginPath(); cx.arc(BT.x, BT.y, 24 + pulse * 8, 0, TAU); cx.stroke();
        cx.globalAlpha = 0.85;
        cx.font = "11px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillStyle = "#7dff5e"; cx.fillText("BREAK LINE OF SIGHT", BT.x, BT.y - 44);
      }
      cx.globalAlpha = 1;
    }
    /* Marrow King — reap wind-up: a bone-white line through your future */
    if (B.atk === "reap" && B.at > 0 && !B.ghost) {
      const aa = angTo(B.x, B.y, BT.x, BT.y);
      cx.globalAlpha = 0.35 + 0.35 * Math.sin(Game.time * 24);
      cx.strokeStyle = "#e8e2d0"; cx.lineWidth = 3; cx.setLineDash([10, 8]);
      cx.beginPath(); cx.moveTo(B.x, B.y); cx.lineTo(B.x + Math.cos(aa) * 800, B.y + Math.sin(aa) * 800); cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
    }
    /* Forge Tyrant — meteor reticles falling from a burning sky */
    for (const m of B.meteors) {
      const prog = clamp(m.t / m.life, 0, 1);
      cx.globalAlpha = 0.35 + 0.5 * Math.sin(m.t * 18);
      cx.strokeStyle = "#ffd23d"; cx.lineWidth = 2 + prog * 3;
      cx.beginPath(); cx.arc(m.x, m.y, 46 - prog * 18, 0, TAU); cx.stroke();
      cx.lineWidth = 1.5; cx.setLineDash([4, 6]);
      cx.beginPath(); cx.arc(m.x, m.y, 18, 0, TAU); cx.stroke();
      cx.setLineDash([]);
      cx.globalAlpha = 0.8 * prog;
      cx.font = "16px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = "#ffd23d"; cx.fillText("☄", m.x, m.y - 30 + prog * 30);
      cx.globalAlpha = 1;
    }
    /* Forge Tyrant — carved seams: the stone glows before it splits.
       Brightens and thickens as the eruption nears — clear the line. */
    for (const c of B.cracks) {
      const prog = clamp(c.t / c.life, 0, 1);
      cx.globalAlpha = (0.25 + 0.55 * prog) * (0.65 + 0.35 * Math.sin(Game.time * 24));
      cx.strokeStyle = prog > 0.6 ? "#ffd23d" : "#ff5e2e";
      cx.lineWidth = 3 + prog * 4;
      cx.setLineDash([14, 10]);
      cx.beginPath(); cx.moveTo(c.x1, c.y1); cx.lineTo(c.x2, c.y2); cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
    }
    /* Forge Tyrant — fissure telegraph: the crack about to open */
    if (B.atk === "fissure" && B.at > 0 && !B.ghost) {
      cx.globalAlpha = 0.4 + 0.4 * Math.sin(Game.time * 26);
      cx.strokeStyle = "#ff5e2e"; cx.lineWidth = 5; cx.setLineDash([14, 10]);
      cx.beginPath();
      cx.moveTo(B.x - Math.cos(B.fissAng) * 200, B.y - Math.sin(B.fissAng) * 200);
      cx.lineTo(B.x + Math.cos(B.fissAng) * 850, B.y + Math.sin(B.fissAng) * 850);
      cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
    }
    /* Forge Tyrant — bellows inhale: a collapsing ring of indrawn air */
    if (B.atk === "bellows" && B.at > 0.15 && !B.ghost) {
      const prog = 1 - clamp(B.at / 1.15, 0, 1);
      cx.globalAlpha = 0.3 + 0.4 * prog;
      cx.strokeStyle = "#ff8a3d"; cx.lineWidth = 3; cx.setLineDash([6, 10]);
      cx.beginPath(); cx.arc(B.x, B.y, 480 - prog * 340, 0, TAU); cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
    }
    /* Event Horizon — lesser singularities tearing open */
    for (const w of B.wells) {
      if (w.t < w.delay) {
        const prog = w.t / w.delay;
        cx.globalAlpha = 0.35 + 0.5 * Math.sin(w.t * 20);
        cx.strokeStyle = w.color || "#c9b8ff"; cx.lineWidth = 2 + prog * 3; cx.setLineDash([5, 7]);
        cx.beginPath(); cx.arc(w.x, w.y, 54 - prog * 28, 0, TAU); cx.stroke();
        cx.setLineDash([]); cx.globalAlpha = 1;
      } else {
        const lt = w.t - w.delay;
        cx.save(); cx.translate(w.x, w.y);
        cx.rotate(lt * 6);
        for (let k = 0; k < 2; k++) {
          cx.strokeStyle = k ? "#fff" : (w.color || "#9d6bff"); cx.lineWidth = 2.5 - k;
          cx.globalAlpha = 0.8;
          cx.beginPath(); cx.arc(0, 0, 20 - k * 6, k * 2, k * 2 + TAU * 0.7); cx.stroke();
        }
        cx.fillStyle = "#000";
        cx.beginPath(); cx.arc(0, 0, 9, 0, TAU); cx.fill();
        cx.strokeStyle = w.color || "#c9b8ff"; cx.lineWidth = 1.5; cx.globalAlpha = 0.5;
        cx.beginPath(); cx.arc(0, 0, 10.5, 0, TAU); cx.stroke();
        cx.restore(); cx.globalAlpha = 1;
      }
    }
    /* Drowned Monarch — tide wind-up: the wave's mark, LOCKED where the player
       stood when he reared. The line stays put; getting off it is the dodge. */
    if (B.atk === "tide" && B.at > 0 && !B.ghost) {
      const ta = B.tideAng || 0, tx = B.tideX || BT.x, ty = B.tideY || BT.y;
      const px2 = Math.cos(ta + Math.PI / 2), py2 = Math.sin(ta + Math.PI / 2);
      cx.globalAlpha = 0.35 + 0.35 * Math.sin(Game.time * 22);
      cx.strokeStyle = "#7de8e0"; cx.lineWidth = 4; cx.setLineDash([12, 9]);
      cx.beginPath();
      cx.moveTo(tx - px2 * 400, ty - py2 * 400);
      cx.lineTo(tx + px2 * 400, ty + py2 * 400);
      cx.stroke();
      cx.setLineDash([]);
      /* chevrons: the way the wave will march */
      cx.lineWidth = 2.5;
      for (let k = -1; k <= 1; k++) {
        const bx = tx + px2 * k * 130 - Math.cos(ta) * 60;
        const by = ty + py2 * k * 130 - Math.sin(ta) * 60;
        cx.beginPath();
        cx.moveTo(bx - Math.cos(ta) * 18 + px2 * 12, by - Math.sin(ta) * 18 + py2 * 12);
        cx.lineTo(bx, by);
        cx.lineTo(bx - Math.cos(ta) * 18 - px2 * 12, by - Math.sin(ta) * 18 - py2 * 12);
        cx.stroke();
      }
      cx.globalAlpha = 1;
    }
    /* Event Horizon — wormhole fold telegraph: you and it, briefly entangled */
    if (B.atk === "wormhole" && B.at > 0) {
      cx.globalAlpha = 0.45 + 0.4 * Math.sin(Game.time * 22);
      cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 2; cx.setLineDash([4, 8]);
      cx.beginPath(); cx.moveTo(B.x, B.y); cx.lineTo(BT.x, BT.y); cx.stroke();
      cx.setLineDash([]);
      for (const pt of [BT, B]) {
        cx.beginPath(); cx.arc(pt.x, pt.y, 34 + Math.sin(Game.time * 14) * 6, 0, TAU); cx.stroke();
      }
      cx.globalAlpha = 1;
    }
    /* Plunge — shadow / target reticle at landing spot */
    if (B.airborne && B.airDst) {
      const frac = clamp(1 - B.airT / 2.2, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(Game.time * (7 + frac * 14));
      cx.globalAlpha = clamp(frac * 0.85 + 0.05, 0, 0.9) * pulse;
      cx.strokeStyle = "#ff4d5e"; cx.lineWidth = 3 + frac * 4;
      cx.beginPath(); cx.arc(B.airDst.x, B.airDst.y, 55 + (1 - frac) * 40, 0, TAU); cx.stroke();
      cx.lineWidth = 1.5; cx.setLineDash([5, 8]);
      cx.beginPath(); cx.arc(B.airDst.x, B.airDst.y, 90 + (1 - frac) * 55, 0, TAU); cx.stroke();
      cx.setLineDash([]);
      cx.globalAlpha = clamp(frac * 1.1 - 0.05, 0, 0.85);
      cx.font = "22px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = "#ff4d5e";
      cx.fillText("✕", B.airDst.x, B.airDst.y);
      cx.globalAlpha = 1;
    }
  }

  /* rocks */
  for (const rc of MAP.rocks) {
    if (rc.sal) continue;   // saloon walls and furniture paint themselves (drawSaloonUnder)
    if (rc.mirror) {        // the Glass Choir's panes (draw-deep.js)
      if (rc.x + rc.w + 10 < cullL || rc.x - 10 > cullR || rc.y + rc.h + 10 < cullT || rc.y - 10 > cullB) continue;
      drawMirrorRock(rc); continue;
    }
    /* 70: the meltdown's white-hot glow (blur up to 44) plus jitter and shake */
    if (rc.x + rc.w + 70 < cullL || rc.x - 70 > cullR || rc.y + rc.h + 70 < cullT || rc.y - 70 > cullB) continue;
    let gy = 0, ga = 1;
    if (rc.boss) {
      const e = clamp((Game.time - rc.bornAt) / 0.45, 0, 1);
      gy = (1 - e) * rc.h;      // slides up out of the floor
      ga = 0.4 + 0.6 * e;
      if (e < 1) { cx.shadowColor = F.wallGlow; cx.shadowBlur = 14; }
    }
    /* Hellforge meltdown: the heat wave has reached this rock — it glows,
       shudders and flashes white-hot before it runs (tickForgeMelt) */
    const heat = rc.meltAt !== undefined ? clamp((Game.time - rc.meltAt) / rc.meltDur, 0, 1) : 0;
    const jx = heat ? Math.sin(Game.time * 46 + rc.x) * 2.4 * heat : 0;
    const jy = heat ? Math.cos(Game.time * 57 + rc.y) * 2.4 * heat : 0;
    if (heat) { cx.shadowColor = heat > 0.75 ? "#ffd23d" : "#ff5e2e"; cx.shadowBlur = 10 + 34 * heat; }
    cx.globalAlpha = ga;
    cx.fillStyle = rc.tone > 0.5 ? F.rockA : F.rockB;
    cx.fillRect(rc.x + jx, rc.y + gy + jy, rc.w, rc.h);
    cx.fillStyle = F.rockTop;
    cx.fillRect(rc.x + jx, rc.y + gy + jy, rc.w, 6);
    if (heat) {
      cx.globalAlpha = ga * (0.2 + 0.8 * heat);
      cx.fillStyle = heat > 0.8 ? "#ffb43d" : "#ff5e2e";
      cx.fillRect(rc.x + jx, rc.y + gy + jy, rc.w, rc.h);
      cx.globalAlpha = ga;
    }
    cx.strokeStyle = heat ? "#ff8a3d" : rc.boss ? F.wallGlow : F.line; cx.lineWidth = 2;
    cx.strokeRect(rc.x + jx, rc.y + gy + jy, rc.w, rc.h);
    cx.globalAlpha = 1; cx.shadowBlur = 0;
  }

  /* chests */
  for (const c of chests) {
    if (c.x + 90 < cullL || c.x - 90 > cullR || c.y + 90 < cullT || c.y - 90 > cullB) continue;
    const glow = 0.5 + 0.5 * Math.sin(c.pulse);
    if (c.state === "sealed") { cx.shadowColor = F.wallGlow; cx.shadowBlur = 10 + glow * 12; cx.fillStyle = "#3a2f63"; }
    else if (c.state === "ambush") { cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 16 + glow * 14; cx.fillStyle = "#5e2230"; }
    else { cx.shadowColor = "#ffd23d"; cx.shadowBlur = 6; cx.fillStyle = "#2a2740"; }
    cx.fillRect(c.x - 18, c.y - 13, 36, 26);
    cx.shadowBlur = 0;
    cx.strokeStyle = c.state === "ambush" ? "#ff4d5e" : c.state === "open" ? "#6a6488" : F.wallGlow;
    cx.lineWidth = 2;
    cx.strokeRect(c.x - 18, c.y - 13, 36, 26);
    if (c.state !== "open") {
      cx.fillStyle = c.state === "ambush" ? "#ff4d5e" : "#c9b8ff";
      cx.font = "16px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText("ᛝ", c.x, c.y + 1);
    }
  }

  /* health boxes */
  for (const h of healthBoxes) {
    if (h.x + 90 < cullL || h.x - 90 > cullR || h.y + 90 < cullT || h.y - 90 > cullB) continue;
    const glow = 0.5 + 0.5 * Math.sin(h.pulse);
    if (h.state === "sealed") {
      cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 10 + glow * 14;
      cx.fillStyle = "#3d1212";
    } else if (h.state === "ambush") {
      cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 18 + glow * 16;
      cx.fillStyle = "#5c1a1a";
    } else {
      cx.shadowColor = "#7dff5e"; cx.shadowBlur = 5;
      cx.fillStyle = "#1a2e1a";
    }
    /* box body */
    cx.fillRect(h.x - 16, h.y - 12, 32, 24);
    cx.shadowBlur = 0;
    /* border */
    cx.strokeStyle = h.state === "open" ? "#2e4a2e" : (h.state === "ambush" ? "#ff6b6b" : "#ff4d5e");
    cx.lineWidth = 2;
    cx.strokeRect(h.x - 16, h.y - 12, 32, 24);
    if (h.state !== "open") {
      /* cross / plus symbol — the classic medkit cross */
      cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 8 + glow * 8;
      cx.fillStyle = h.state === "ambush" ? "#ff6b6b" : "#ff4d5e";
      cx.fillRect(h.x - 3, h.y - 8, 6, 16);   /* vertical bar */
      cx.fillRect(h.x - 8, h.y - 3, 16, 6);   /* horizontal bar */
      cx.shadowBlur = 0;
    } else {
      /* cracked-open: faded heart */
      cx.globalAlpha = 0.35;
      cx.fillStyle = "#7dff5e";
      cx.font = "13px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText("♥", h.x, h.y + 1);
      cx.globalAlpha = 1;
    }
  }

  /* pickups — unlock seal with 3 orbiting rune glyphs */
  for (const p of pickups) {
    if (p.x + 90 < cullL || p.x - 90 > cullR || p.y + 90 < cullT || p.y - 90 > cullB) continue;
    const bob = Math.sin(p.t * 2.8) * 3;
    const pulse = 0.5 + 0.5 * Math.sin(p.t * 3.5);
    cx.save();
    cx.translate(p.x, p.y + bob);
    /* outer pulsing ring */
    cx.shadowColor = "#ffd23d"; cx.shadowBlur = 14 + pulse * 12;
    cx.strokeStyle = "#ffd23d"; cx.lineWidth = 2;
    cx.globalAlpha = 0.28 + pulse * 0.38;
    cx.beginPath(); cx.arc(0, 0, 28 + pulse * 2, 0, TAU); cx.stroke();
    cx.lineWidth = 1;
    cx.globalAlpha = 0.45 + pulse * 0.25;
    cx.beginPath(); cx.arc(0, 0, 18, 0, TAU); cx.stroke();
    /* 3 orbiting rune glyphs */
    cx.save();
    cx.rotate(p.t * 0.75);
    for (let k = 0; k < 3; k++) {
      /* co-op: the orb is unresolved until a warden touches it — "?" until then */
      const R = p.ids ? RUNES[p.ids[k]] : { color: "#ffd23d", glyph: "?" };
      cx.save();
      cx.rotate(k / 3 * TAU);
      cx.globalAlpha = 0.9;
      cx.fillStyle = R.color;
      cx.shadowColor = R.color; cx.shadowBlur = 7;
      cx.font = "13px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(R.glyph, 0, -26);
      cx.restore();
    }
    cx.restore();
    /* center seal glyph */
    cx.globalAlpha = 0.85 + pulse * 0.15;
    cx.fillStyle = "#ffd23d";
    cx.shadowColor = "#ffd23d"; cx.shadowBlur = 10;
    cx.font = "18px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText("ᛝ", 0, 0);
    cx.shadowBlur = 0;
    cx.restore();
  }

  /* portal */
  if (portal) {
    const t = portal.t;
    cx.save(); cx.translate(portal.x, portal.y);
    for (let k = 0; k < 3; k++) {
      cx.rotate(t * (1.2 + k * 0.5));
      cx.strokeStyle = ["#9d6bff", "#5ee6ff", "#e8e2d0"][k];
      cx.globalAlpha = 0.7;
      cx.lineWidth = 3;
      cx.beginPath(); cx.arc(0, 0, portal.r - k * 9, t, t + TAU * 0.7); cx.stroke();
    }
    cx.globalAlpha = 1;
    cx.shadowColor = "#9d6bff"; cx.shadowBlur = 20;
    cx.fillStyle = "#0b0b14";
    cx.beginPath(); cx.arc(0, 0, portal.r - 22, 0, TAU); cx.fill();
    cx.shadowBlur = 0;
    cx.restore();
  }

  /* THE UNKNOWN — the small rift portal and its creature */
  drawRift();

  /* shockwaves */
  for (const s of shockwaves) {
    if (s.delay > 0) continue;
    if (s.x - s.r > cullR + 40 || s.x + s.r < cullL - 40 || s.y - s.r > cullB + 40 || s.y + s.r < cullT - 40) continue;
    cx.strokeStyle = s.color || (s.hostile ? "#ff8a3d" : "#ffae5e");
    cx.globalAlpha = clamp(1 - s.r / s.max, 0, 1);
    cx.lineWidth = s.hostile ? 6 : 4;
    if (s.color) { cx.shadowColor = s.color; cx.shadowBlur = 16; }
    cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, TAU); cx.stroke();
    cx.shadowBlur = 0; cx.globalAlpha = 1;
  }

  /* VEIL BURST — the hollow circle the wraith tears open */
  for (const v of veils) {
    if (v.x + v.r + 60 < cullL || v.x - v.r - 60 > cullR || v.y + v.r + 60 < cullT || v.y - v.r - 60 > cullB) continue;
    const k = clamp(v.t / v.life, 0, 1);
    const rr = v.r * Math.min(1, v.t / 0.1);          // snaps open, then hangs and fades
    cx.save();
    cx.translate(v.x, v.y);
    cx.shadowColor = "#5ee6ff"; cx.shadowBlur = 18;
    cx.strokeStyle = "#5ee6ff";
    cx.globalAlpha = (1 - k) * 0.9;
    cx.lineWidth = 5;
    cx.beginPath(); cx.arc(0, 0, rr, 0, TAU); cx.stroke();
    /* inner runic dashes spinning the wrong way */
    cx.rotate(-v.t * 3);
    cx.strokeStyle = "#c9f4ff"; cx.lineWidth = 2;
    cx.globalAlpha = (1 - k) * 0.55;
    cx.setLineDash([12, 18]);
    cx.beginPath(); cx.arc(0, 0, rr * 0.9, 0, TAU); cx.stroke();
    cx.setLineDash([]);
    cx.shadowBlur = 0; cx.globalAlpha = 1;
    cx.restore();
  }

  /* lightning */
  for (const z of zaps) {
    if (Math.max(z.x1, z.x2) < cullL - 50 || Math.min(z.x1, z.x2) > cullR + 50 ||
        Math.max(z.y1, z.y2) < cullT - 50 || Math.min(z.y1, z.y2) > cullB + 50) continue;
    cx.strokeStyle = "#bfe3ff";
    cx.globalAlpha = clamp(1 - z.t / 0.15, 0, 1);
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(z.x1, z.y1);
    const segs = 4;
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      cx.lineTo(lerp(z.x1, z.x2, t) + rnd(-8, 8), lerp(z.y1, z.y2, t) + rnd(-8, 8));
    }
    cx.lineTo(z.x2, z.y2);
    cx.stroke();
    cx.globalAlpha = 1;
  }

  /* mines — the Demolitionist's seeded floor, blinking as they wait */
  for (const mn of mines) {
    if (mn.x + 50 < cullL || mn.x - 50 > cullR || mn.y + 50 < cullT || mn.y - 50 > cullB) continue;
    const armed = mn.armT <= 0;
    const dying = mn.life - mn.t < 2;                       // about to fizzle: the light panics
    const lit = Math.sin(Game.time * (dying ? 16 : 6) + mn.pulse) > (armed ? 0 : 0.7);
    cx.save();
    cx.globalAlpha = armed ? 0.95 : 0.55;
    cx.fillStyle = "#141018";
    cx.beginPath(); cx.arc(mn.x, mn.y, mn.r, 0, TAU); cx.fill();
    cx.strokeStyle = "#ff5e2e"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(mn.x, mn.y, mn.r, 0, TAU); cx.stroke();
    if (lit) {
      cx.shadowColor = "#ffd23d"; cx.shadowBlur = 8;
      cx.fillStyle = "#ffd23d";
      cx.beginPath(); cx.arc(mn.x, mn.y, 2.2, 0, TAU); cx.fill();
      cx.shadowBlur = 0;
    }
    cx.restore();
  }

  /* mortar shells — the Demolitionist's rounds mid-lob, shadow racing beneath */
  for (const sh of shells) {
    /* 110: the shell rides up to 46px above its ground shadow and swells */
    if (sh.x + 110 < cullL || sh.x - 110 > cullR || sh.y + 110 < cullT || sh.y - 110 > cullB) continue;
    const p = Math.min(sh.t / sh.T, 1);
    const h = Math.sin(p * Math.PI);                        // 0 → apex → 0
    cx.save();
    /* ground shadow shrinks as the shell climbs */
    cx.globalAlpha = 0.4 - 0.25 * h;
    cx.fillStyle = "#000";
    cx.beginPath(); cx.ellipse(sh.x, sh.y, sh.r * (1 - 0.35 * h), sh.r * 0.5 * (1 - 0.35 * h), 0, 0, TAU); cx.fill();
    cx.globalAlpha = 1;
    const yy = sh.y - h * 46;                               // the arc is drawn, not simulated
    const rr = sh.r * (1 + 0.55 * h);                       // swells at the apex — it looms
    cx.shadowColor = "#ff5e2e"; cx.shadowBlur = 12;
    cx.fillStyle = "#141018";
    cx.beginPath(); cx.arc(sh.x, yy, rr, 0, TAU); cx.fill();
    cx.strokeStyle = "#ff5e2e"; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(sh.x, yy, rr, 0, TAU); cx.stroke();
    /* the fuse burns the whole way down */
    cx.fillStyle = "#ffd23d";
    cx.beginPath(); cx.arc(sh.x, yy - rr * 0.4, 2.4, 0, TAU); cx.fill();
    cx.restore();
  }

  /* enemy bullets — a baked glow sprite per (color, radius): a texture blit per
     bullet instead of a Skia blur pass per bullet (see the cache at the top).
     This also retires the old asymmetry where player bullets shed their glow
     past 180 on screen but enemy bullets never did. */
  for (const b of ebullets) {
    if (b.x < cullL - 60 || b.x > cullR + 60 || b.y < cullT - 60 || b.y > cullB + 60) continue;
    const s = glowDotSprite(b.color, b.r);
    cx.drawImage(s.cvs, b.x - s.ox, b.y - s.oy, s.w, s.h);
  }

  /* player bullets — the same baked trail streak at every count; the old >180
     glow cutoff is gone because there is no longer a blur pass to cut */
  for (const b of bullets) {
    if (b.x < cullL - 60 || b.x > cullR + 60 || b.y < cullT - 60 || b.y > cullB + 60) continue;
    const col = b.pet ? "#ffe08a" : b.shard ? "#d0c4ff" : b.venom ? "#7dff5e" : b.frost ? "#5ee6ff" : b.ember ? "#ff7a3d" : (b.owner && b.owner.char === "shredder") ? "#c9b8ff" : "#fff3c8";
    const s = glowTrailSprite(col, b.r);
    cx.save();
    cx.translate(b.x, b.y); cx.rotate(Math.atan2(b.vy, b.vx));
    cx.drawImage(s.cvs, -s.ox, -s.oy, s.w, s.h);
    cx.restore();
  }

  /* enemies — a big horde on PC draws through one glow layer (hordeGlowLayer above) */
  const layer = hordeGlowLayer();
  const after = layer ? [] : null;   // with a layer: bosses (standing over their horde) and every bar wait for it to land
  /* CHAOS: find the single remaining wave horror (the one whose death drops the
     wave-clear rune) — computed once per frame, then marked after the horde lands */
  let chaosLast = null;
  if (Game.chaosMode && !Game.boss && !Game.ambush && !Game.inRift) {
    let found = 0;
    for (const e of enemies) {
      if (e.dead || e.boss || e.ambush || e.team === "p") continue;
      if (++found > 1) { chaosLast = null; break; }
      chaosLast = e;
    }
  }
  for (const e of enemies) {
    if (e.dead) continue;
    /* 240: wide enough for the slammer's 170px raise-telegraph ring, a warden's
       halo spread, and the shake — the largest things an enemy can draw */
    if (e.x < cullL - 240 || e.x > cullR + 240 || e.y < cullT - 240 || e.y > cullB + 240) continue;
    if (e.spawnT > 0) {
      cx.strokeStyle = e.color; cx.globalAlpha = 0.7;
      cx.setLineDash([6, 6]); cx.lineWidth = 2;
      cx.beginPath(); cx.arc(e.x, e.y, e.r + 6 + e.spawnT * 24, 0, TAU); cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
      continue;
    }
    if (e.type === "wisp" && e.phase === "gone") continue;
    if (layer && e.boss) { after.push(e); continue; }
    const enemyCx = layer ? layer.g : cx;
    const isThrall = e.team === "p" && e.summoned;
    if (isThrall) {
      /* thralls: draw directly on main canvas, skip the expensive glow layer
         (shadowBlur=0 above, they're ghostly grey anyway) */
      drawEnemyBody(cx, e);
      drawEnemyBars(e);
    } else if (e.team === "p") {
      enemyCx.save(); enemyCx.globalAlpha = 0.72; drawEnemyBody(enemyCx, e); enemyCx.restore();
      if (layer) after.push(e);
    } else {
      drawEnemyBody(enemyCx, e);
      if (layer) after.push(e);
    }
    if (!layer && !isThrall) drawEnemyBars(e);
  }
  if (layer) {
    compositeGlowLayer(layer);
    for (const e of after) { if (e.boss) drawEnemyBody(cx, e); drawEnemyBars(e); }
  }
  if (chaosLast) drawChaosLastMark(cx, chaosLast);

  /* pets */
  for (const pet of pets) drawPet(cx, pet);

  /* wardens — every player in the run, each in their own paint */
  /* THE SINGULAR — the barkeep and the regulars stand among the wardens */
  if (Game.inSaloon) drawSaloonFolk();

  if (Game.state !== "dead") for (const P of players) drawWarden(P);

  /* ...and their words hang above everyone */
  if (Game.inSaloon) drawSaloonOver();
  /* floors VI–VIII: lances and beams, sight-lines, shell marks, the stopped hour, high noon */
  drawDeepOver();
  /* THE UNKNOWN — beams and bolts, the tether, the dark, its words and the rune it is about to cast */
  if (Game.inUnknown) drawUnknownOver();

  drawAfterWardens();
}

/* one warden's sprite, auras and cooldown readouts. Extracted verbatim from the
   old single-player block; cooldown arcs only draw for the LOCAL warden. */
function drawWarden(P) {
  {
    if (P.gone) return;   // a disconnected partner's body fades from the world
    const isLocal = P === localPlayer();
    /* DOWNED: a dimmed, flattened body and the revive ring closing over it */
    if (P.downed) {
      cx.save();
      cx.globalAlpha = 0.55;
      cx.fillStyle = skinColorFor(P);
      cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 10;
      cx.translate(P.x, P.y);
      cx.scale(1.25, 0.55);                       // collapsed on the stone
      cx.beginPath(); cx.arc(0, 0, P.r, 0, TAU); cx.fill();
      cx.restore();
      cx.save();
      const pulse = 0.5 + 0.3 * Math.sin(Game.time * 4);
      cx.globalAlpha = pulse; cx.strokeStyle = "#ff4d5e"; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(P.x, P.y, P.r + 10, 0, TAU); cx.stroke();
      if (P.reviveT > 0) {
        cx.globalAlpha = 0.95; cx.strokeStyle = "#7dff5e"; cx.lineWidth = 4; cx.lineCap = "round";
        cx.beginPath(); cx.arc(P.x, P.y, P.r + 10, -Math.PI / 2, -Math.PI / 2 + clamp(P.reviveT / REVIVE_TIME, 0, 1) * TAU); cx.stroke();
        cx.lineCap = "butt";
      }
      cx.globalAlpha = 0.8; cx.fillStyle = "#ff4d5e"; cx.font = "bold 9px monospace"; cx.textAlign = "center";
      cx.fillText("DOWN", P.x, P.y - P.r - 16);
      cx.restore(); cx.globalAlpha = 1; cx.shadowBlur = 0;
      return;
    }
    const blink = P.iframes > 0 && Math.floor(Game.time * 14) % 2 === 0;
    if (!blink && P.veilT > 0) {
      /* gone between worlds — only a flickering outline betrays where the wraith drifts */
      cx.globalAlpha = 0.3;
      cx.strokeStyle = "#5ee6ff"; cx.lineWidth = 2;
      cx.setLineDash([3, 7]);
      cx.beginPath(); cx.arc(P.x, P.y, P.r + 3 + Math.sin(Game.time * 22) * 2, 0, TAU); cx.stroke();
      cx.setLineDash([]); cx.globalAlpha = 1;
    }
    if (!blink && P.veilT <= 0) {
      const col = P.dashT > 0 ? "#5ee6ff" : skinColorFor(P);
      const hpFrac = P.maxHp > 0 ? clamp(P.hp / P.maxHp, 0, 1) : 1;
      cx.shadowColor = col; cx.shadowBlur = 14; cx.globalAlpha = 1;
      /* the barrels: gun warpaint wins outright; bare metal takes the ruling rune's hue */
      let tint = gunSkinColorFor(P) || "#8a86a0";
      if (!P.gunSkin) {
        let most = 0;
        for (const id in P.runes) if (P.runes[id] > most) { most = P.runes[id]; tint = runeDefFor(P, id).color; }
      }
      const aim = P.aim;
      const kick = P.kickT > 0 ? (P.kickT / 0.09) * 3 : 0;   // weapon kick: whole sprite recoils
      const px = P.x - Math.cos(aim) * kick, py = P.y - Math.sin(aim) * kick;
      const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
      /* WRATH aura: the gun's fury made visible — the nearer death, the redder the rage */
      if (P.mods && P.mods.wrath > 0 && hpFrac < 0.3) {
        const rage = Math.min(1, P.mods.wrath * (1 - hpFrac));
        const pulse = 0.75 + 0.25 * Math.sin(Game.time * 9);
        const rr = P.r + 8 + 2 * Math.sin(Game.time * 9);
        cx.save();
        cx.shadowColor = "#ff3d2e"; cx.shadowBlur = 18;
        cx.fillStyle = "#ff3d2e"; cx.globalAlpha = (0.10 + 0.14 * rage) * pulse;
        cx.beginPath(); cx.arc(px, py, rr, 0, TAU); cx.fill();
        cx.strokeStyle = "#ff3d2e"; cx.lineWidth = 2.5; cx.globalAlpha = (0.35 + 0.45 * rage) * pulse;
        cx.beginPath(); cx.arc(px, py, rr, 0, TAU); cx.stroke();
        cx.restore();
      }
      cx.fillStyle = col;

      if (P.char === "gunsmith") {
        /* Pentagon shield-body + helmet visor + double barrel */
        cx.save(); cx.translate(px, py); cx.rotate(aim + Math.PI / 2);
        cx.beginPath();
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; i === 0 ? cx.moveTo(Math.cos(a)*13, Math.sin(a)*13) : cx.lineTo(Math.cos(a)*13, Math.sin(a)*13); }
        cx.closePath(); cx.fill();
        cx.fillStyle = "#0b0b14"; cx.fillRect(-7, -2.5, 14, 5);
        drawCracks(cx, hpFrac, 11);
        cx.restore();
        cx.strokeStyle = tint; cx.lineWidth = 3; cx.lineCap = "round";
        for (const s of [-3.5, 3.5]) {
          cx.beginPath();
          cx.moveTo(px + Math.cos(aim)*9 + perpX*s, py + Math.sin(aim)*9 + perpY*s);
          if (hpFrac < 0.3 && s < 0) {
            /* critical damage: the left barrel snaps at mid-length and droops */
            cx.lineTo(px + Math.cos(aim)*18 + perpX*s, py + Math.sin(aim)*18 + perpY*s);
            cx.lineTo(px + Math.cos(aim)*25 + perpX*(s-4.5), py + Math.sin(aim)*25 + perpY*(s-4.5));
          } else {
            cx.lineTo(px + Math.cos(aim)*27 + perpX*s, py + Math.sin(aim)*27 + perpY*s);
          }
          cx.stroke();
        }

      } else if (P.char === "wraith") {
        /* Diamond body + three ghostly trailing tendrils + piercing eye */
        cx.save(); cx.translate(px, py); cx.rotate(aim);
        cx.beginPath(); cx.moveTo(0,-12); cx.lineTo(9,0); cx.lineTo(0,12); cx.lineTo(-9,0); cx.closePath(); cx.fill();
        cx.strokeStyle = col; cx.lineWidth = 2;
        for (const [oy, ex] of [[-7,-27],[0,-30],[7,-27]]) {
          cx.globalAlpha = 0.45;
          cx.beginPath(); cx.moveTo(-9, 0); cx.quadraticCurveTo(-18, oy * 0.4, ex, oy); cx.stroke();
        }
        cx.globalAlpha = 1;
        cx.fillStyle = "#0b0b14"; cx.beginPath(); cx.arc(3, 0, 3, 0, TAU); cx.fill();
        drawCracks(cx, hpFrac, 8);
        cx.restore();
        cx.strokeStyle = tint; cx.lineWidth = 2; cx.lineCap = "round";
        cx.beginPath(); cx.moveTo(px+Math.cos(aim)*10, py+Math.sin(aim)*10);
        if (hpFrac < 0.3) {
          /* critical damage: the barrel kinks mid-way, tip veering off true */
          cx.lineTo(px+Math.cos(aim)*20, py+Math.sin(aim)*20);
          cx.lineTo(px+Math.cos(aim)*28 + perpX*5, py+Math.sin(aim)*28 + perpY*5);
        } else {
          cx.lineTo(px+Math.cos(aim)*31, py+Math.sin(aim)*31);
        }
        cx.stroke();

      } else if (P.char === "juggernaut") {
        /* Chunky hexagon + shoulder pauldrons + slit visor + massive block barrel */
        cx.save(); cx.translate(px, py);
        cx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; i === 0 ? cx.moveTo(Math.cos(a)*17, Math.sin(a)*17) : cx.lineTo(Math.cos(a)*17, Math.sin(a)*17); }
        cx.closePath(); cx.fill();
        for (const s of [-1, 1]) { cx.beginPath(); cx.arc(perpX*17*s, perpY*17*s, 7, 0, TAU); cx.fill(); }
        cx.fillStyle = "#0b0b14"; cx.rotate(aim + Math.PI / 2); cx.fillRect(-10, -2.5, 20, 5);
        drawCracks(cx, hpFrac, 14);
        cx.restore();
        cx.strokeStyle = tint; cx.lineWidth = 10; cx.lineCap = "square";
        if (hpFrac < 0.3) {
          /* critical damage: the block barrel is sheared in two, front half sagging sideways */
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*13, py+Math.sin(aim)*13);
          cx.lineTo(px+Math.cos(aim)*19, py+Math.sin(aim)*19); cx.stroke();
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*21 + perpX*3, py+Math.sin(aim)*21 + perpY*3);
          cx.lineTo(px+Math.cos(aim)*27 + perpX*4.5, py+Math.sin(aim)*27 + perpY*4.5); cx.stroke();
          cx.strokeStyle = "#0b0b14"; cx.lineWidth = 4;
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*22 + perpX*3.5, py+Math.sin(aim)*22 + perpY*3.5);
          cx.lineTo(px+Math.cos(aim)*28 + perpX*4.5, py+Math.sin(aim)*28 + perpY*4.5); cx.stroke();
        } else {
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*13, py+Math.sin(aim)*13); cx.lineTo(px+Math.cos(aim)*27, py+Math.sin(aim)*27); cx.stroke();
          cx.strokeStyle = "#0b0b14"; cx.lineWidth = 4;
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*21, py+Math.sin(aim)*21); cx.lineTo(px+Math.cos(aim)*28, py+Math.sin(aim)*28); cx.stroke();
        }

      } else if (P.char === "demolitionist") {
        /* Squat octagon sapper + slit visor + stub mortar barrel + a lit mine on its back */
        cx.save(); cx.translate(px, py); cx.rotate(aim + Math.PI / 2);
        cx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; i === 0 ? cx.moveTo(Math.cos(a)*14, Math.sin(a)*14) : cx.lineTo(Math.cos(a)*14, Math.sin(a)*14); }
        cx.closePath(); cx.fill();
        cx.fillStyle = "#0b0b14"; cx.fillRect(-6, -3, 12, 5);
        /* the spare charge riding its back, fuse-light winking */
        cx.beginPath(); cx.arc(0, 10, 4.5, 0, TAU); cx.fill();
        if (Math.sin(Game.time * 7) > 0) { cx.fillStyle = "#ffd23d"; cx.beginPath(); cx.arc(0, 10, 1.8, 0, TAU); cx.fill(); }
        drawCracks(cx, hpFrac, 12);
        cx.restore();
        cx.strokeStyle = tint; cx.lineWidth = 7; cx.lineCap = "round";
        if (hpFrac < 0.3) {
          /* critical damage: the stub mortar shears and sags off line */
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*11, py+Math.sin(aim)*11);
          cx.lineTo(px+Math.cos(aim)*17 + perpX*4, py+Math.sin(aim)*17 + perpY*4); cx.stroke();
        } else {
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*11, py+Math.sin(aim)*11); cx.lineTo(px+Math.cos(aim)*21, py+Math.sin(aim)*21); cx.stroke();
          cx.strokeStyle = "#0b0b14"; cx.lineWidth = 3;
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*16, py+Math.sin(aim)*16); cx.lineTo(px+Math.cos(aim)*22, py+Math.sin(aim)*22); cx.stroke();
        }

      } else if (P.char === "shredder") {
        /* SHREDDER: jagged industrial body + independent whirling blade */
        cx.save(); cx.translate(px, py);
        cx.fillStyle = col;

        // 1. Draw the independent saw first (behind the body)
        cx.save();
        const sawR = P.mods.sawReach || 76;
        cx.rotate(P.sawRot || 0); // Use the independent rotation property
        cx.strokeStyle = col; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(0, 0, sawR * 0.65, 0, TAU); cx.stroke();
        cx.fillStyle = col;
        const teeth = 12;
        for (let i = 0; i < teeth; i++) {
          cx.rotate(TAU / teeth);
          cx.beginPath();
          cx.moveTo(sawR * 0.6, -3);
          cx.lineTo(sawR * 0.95, 0);
          cx.lineTo(sawR * 0.6, 3);
          cx.closePath(); cx.fill();
        }
        cx.restore();

        // 2. Draw the body (aligned to aim)
        cx.rotate(aim);
        // Body: heavy industrial trapezoid
        cx.beginPath(); cx.moveTo(-10, -12); cx.lineTo(12, -8); cx.lineTo(12, 8); cx.lineTo(-10, 12); cx.closePath(); cx.fill();
        cx.fillStyle = "#0b0b14"; cx.fillRect(2, -3, 6, 6); // Visor

        // Central hub
        cx.fillStyle = "#0b0b14"; cx.beginPath(); cx.arc(0, 0, 8, 0, TAU); cx.fill();
        cx.fillStyle = tint; cx.font = "bold 9px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillText("ᛃ", 0, 1);

        drawCracks(cx, hpFrac, 12);
        cx.restore();

      } else if (P.char === "necromancer") {
        /* Reanimator: a ragged robe, floating skull, soul core and runic staff. */
        cx.save(); cx.translate(px, py);
        cx.beginPath(); cx.moveTo(0, -10); cx.quadraticCurveTo(12, -8, 10, 8);
        cx.lineTo(-10, 8); cx.quadraticCurveTo(-12, -8, 0, -10); cx.closePath(); cx.fill();
        cx.fillStyle = "#e8e2d0";
        for (const side of [-1, 1]) { cx.beginPath(); cx.arc(side * 9, -5, 4, 0, TAU); cx.fill(); }
        const pulse = 0.6 + 0.4 * Math.sin(Game.time * 5);
        cx.fillStyle = "#9d6bff"; cx.shadowColor = "#9d6bff"; cx.shadowBlur = 10 * pulse;
        cx.beginPath(); cx.arc(0, 0, 4, 0, TAU); cx.fill(); cx.shadowBlur = 0;
        cx.save(); cx.translate(0, -14 + Math.sin(Game.time * 2.5) * 2);
        cx.fillStyle = "#e8e2d0"; cx.beginPath(); cx.arc(0, 0, 5, 0, TAU); cx.fill();
        cx.fillRect(-2.5, 3, 5, 2); cx.fillStyle = "#0b0b14";
        cx.beginPath(); cx.arc(-1.5, 0, 1.2, 0, TAU); cx.fill();
        cx.beginPath(); cx.arc(1.5, 0, 1.2, 0, TAU); cx.fill(); cx.restore();
        cx.rotate(aim); cx.strokeStyle = tint; cx.lineWidth = 2.5;
        cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(24, 0); cx.stroke();
        cx.save(); cx.translate(24, 0); cx.rotate(-aim + Game.time * 2);
        cx.fillStyle = tint; cx.font = "bold 10px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillText("ᚻ", 0, 0); cx.restore();
        drawCracks(cx, hpFrac, 11); cx.restore();

      } else if (P.char === "theUnknown") {
        /* THE UNKNOWN: void-ring body with orbiting rune glyphs, seen from within.
           NOTE: this is the PLAYER body — it must read P.r and Game.time. Older
           code here borrowed the boss's `e`/`t`, which threw after the translate
           and left the camera transform pushed for every later frame. */
        cx.save(); cx.translate(px, py);
        const ua = Game.time * 0.9;
        for (let k = 0; k < 3; k++) {
          const a = ua + k * TAU / 3;
          cx.fillStyle = "rgba(201,184,255," + (0.35 + 0.25 * Math.sin(Game.time * 2 + k)) + ")";
          cx.beginPath(); cx.arc(Math.cos(a) * 14, Math.sin(a) * 14, 3, 0, TAU); cx.fill();
        }
        cx.fillStyle = "#0a0818";
        cx.beginPath(); cx.arc(0, 0, P.r + 2, 0, TAU); cx.fill();
        cx.strokeStyle = col; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(0, 0, P.r, 0, TAU); cx.stroke();
        cx.fillStyle = col; cx.font = "bold 10px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillText("?", 0, 1);
        cx.restore();
      } else {
        /* Alchemist: triangular flask body + orbiting rune + forked barrel */
        cx.save(); cx.translate(px, py); cx.rotate(aim + Math.PI / 2);
        cx.beginPath(); cx.moveTo(0,-13); cx.lineTo(12,11); cx.lineTo(-12,11); cx.closePath(); cx.fill();
        cx.fillStyle = "#0b0b14"; cx.fillRect(-3, -18, 6, 7);
        drawCracks(cx, hpFrac, 9);
        cx.restore();
        cx.save();
        const orbitA = Game.time * 2.8;
        cx.font = "bold 10px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.globalAlpha = 0.85; cx.fillStyle = col;
        cx.fillText("ᛜ", px + Math.cos(orbitA)*21, py + Math.sin(orbitA)*21);
        cx.restore();
        cx.strokeStyle = tint; cx.lineWidth = 2.5; cx.lineCap = "round";
        if (hpFrac < 0.3) {
          /* critical damage: the fork's shaft kinks, one tine splayed wide, the other snapped back */
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*9, py+Math.sin(aim)*9);
          cx.lineTo(px+Math.cos(aim)*16, py+Math.sin(aim)*16);
          cx.lineTo(px+Math.cos(aim)*22 + perpX*2, py+Math.sin(aim)*22 + perpY*2); cx.stroke();
          const bx = px+Math.cos(aim)*22 + perpX*2, by = py+Math.sin(aim)*22 + perpY*2;
          cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(bx + Math.cos(aim)*3 + perpX*8, by + Math.sin(aim)*3 + perpY*8); cx.stroke();
          cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(bx - Math.cos(aim)*1 - perpX*5, by - Math.sin(aim)*1 - perpY*5); cx.stroke();
        } else {
          cx.beginPath(); cx.moveTo(px+Math.cos(aim)*9, py+Math.sin(aim)*9); cx.lineTo(px+Math.cos(aim)*22, py+Math.sin(aim)*22); cx.stroke();
          const tipX = px+Math.cos(aim)*27, tipY = py+Math.sin(aim)*27;
          for (const s of [-1, 1]) {
            cx.beginPath(); cx.moveTo(px+Math.cos(aim)*22, py+Math.sin(aim)*22); cx.lineTo(tipX+perpX*4*s, tipY+perpY*4*s); cx.stroke();
          }
        }
      }

      cx.shadowBlur = 0;
      cx.lineCap = "butt";   // barrel caps (round/square) end with the character draw

      /* --- dash cooldown indicator: reload arc, LOCAL warden only --- */
      if (isLocal && P.dashT <= 0 && P.char !== "shredder") {
        const rr = P.r + 9;
        const cdFrac = P.dashCdBase > 0 ? clamp(P.dashCd / P.dashCdBase, 0, 1) : 0;
        if (cdFrac > 0) {
          /* recharging: dim full track + filling arc */
          cx.globalAlpha = 0.25; cx.strokeStyle = "#5ee6ff"; cx.lineWidth = 3;
          cx.beginPath(); cx.arc(px, py, rr, 0, TAU); cx.stroke();
          cx.globalAlpha = 0.95; cx.lineWidth = 3; cx.lineCap = "round";
          cx.beginPath(); cx.arc(px, py, rr, -Math.PI / 2, -Math.PI / 2 + (1 - cdFrac) * TAU); cx.stroke();
          cx.lineCap = "butt";
          cx.globalAlpha = 0.6; cx.fillStyle = "#5ee6ff"; cx.font = "bold 8px monospace"; cx.textAlign = "center";
          cx.fillText("RELOAD", px, py + rr + 10);
        }
        cx.globalAlpha = 1;
      }

      /* --- VEIL BURST cooldown arc: the wraith's tear recharging (outer violet ring), LOCAL only --- */
      if (isLocal && P.char === "wraith" && P.veilCdBase > 0 && P.fireT > 0) {
        const rv = P.r + 16;
        const f = clamp(P.fireT / P.veilCdBase, 0, 1);
        cx.globalAlpha = 0.2; cx.strokeStyle = "#9d6bff"; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(px, py, rv, 0, TAU); cx.stroke();
        cx.globalAlpha = 0.9; cx.lineCap = "round";
        cx.beginPath(); cx.arc(px, py, rv, -Math.PI / 2, -Math.PI / 2 + (1 - f) * TAU); cx.stroke();
        cx.lineCap = "butt"; cx.globalAlpha = 1;
      }
    }

    /* --- BULWARK shield: orbiting barrier with a pip per remaining charge --- */
    if (P.shield > 0) {
      const px = P.x, py = P.y, rr = P.r + 15;
      const pulse = 0.55 + 0.25 * Math.sin(Game.time * 5);
      cx.save();
      cx.shadowColor = "#e0a86b"; cx.shadowBlur = 14;
      cx.globalAlpha = pulse; cx.strokeStyle = "#e0a86b"; cx.lineWidth = 2.5;
      cx.beginPath(); cx.arc(px, py, rr, 0, TAU); cx.stroke();
      cx.globalAlpha = pulse * 0.18; cx.fillStyle = "#e0a86b";
      cx.beginPath(); cx.arc(px, py, rr, 0, TAU); cx.fill();
      cx.shadowBlur = 8; cx.globalAlpha = 1; cx.fillStyle = "#ffe2b0";
      for (let i = 0; i < P.shield; i++) {
        const a = -Math.PI / 2 + i / Math.max(P.shieldMax, 1) * TAU + Game.time * 0.9;
        cx.beginPath(); cx.arc(px + Math.cos(a) * rr, py + Math.sin(a) * rr, 3.2, 0, TAU); cx.fill();
      }
      cx.restore();
    }

    /* STILLPOINT — the faint bubble where time crawls (drawn under the thorns) */
    if (P.mods && P.mods.timeField) {
      const R = P.mods.timeR;
      cx.save(); cx.translate(P.x, P.y);
      cx.globalAlpha = 0.08; cx.fillStyle = "#6be0d4";
      cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.fill();
      cx.globalAlpha = 0.35 + 0.15 * Math.sin(Game.time * 2);
      cx.strokeStyle = "#6be0d4"; cx.lineWidth = 1.5; cx.setLineDash([3, 9]);
      cx.rotate(Game.time * 0.3);
      cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
      cx.setLineDash([]); cx.restore(); cx.globalAlpha = 1;
    }

    /* PRICKLE — a bristling ring of barbs around the carrier */
    if (P.mods && P.mods.prickle) {
      const R = P.mods.prickleR, spikes = 22 + Math.round(P.mods.prickle * 6);   // tapered stacks run fractional
      cx.save(); cx.translate(P.x, P.y); cx.rotate(Game.time * 0.6);
      cx.strokeStyle = "#d6e85a"; cx.globalAlpha = 0.5 + 0.2 * Math.sin(Game.time * 5);
      cx.lineWidth = 1.5; cx.shadowColor = "#d6e85a"; cx.shadowBlur = 6;
      cx.beginPath();
      for (let k = 0; k < spikes; k++) {
        const a = k / spikes * TAU;
        cx.moveTo(Math.cos(a) * (R - 7), Math.sin(a) * (R - 7));
        cx.lineTo(Math.cos(a) * (R + 4), Math.sin(a) * (R + 4));
      }
      cx.stroke();
      cx.globalAlpha = 0.16;
      cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
      cx.restore(); cx.shadowBlur = 0; cx.globalAlpha = 1;
    }
  }
}

/* the tail of the frame: particles, floaters, vignette and post FX.
   Split out of draw() when the warden block became per-player; the cull
   bounds are recomputed here (same one-liner as draw()'s). */
function drawAfterWardens() {
  const cullL = Game.cam.x, cullT = Game.cam.y, cullR = Game.cam.x + VW, cullB = Game.cam.y + VH;

  /* particles + floaters */
  for (const p of particles) {
    if (p.x + 40 < cullL || p.x - 40 > cullR || p.y + 40 < cullT || p.y - 40 > cullB) continue;
    cx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
    cx.fillStyle = p.color;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, TAU); cx.fill();
  }
  cx.globalAlpha = 1;
  cx.textAlign = "center";
  for (const f of floaters) {
    /* 150: half the widest streak callout at its largest font */
    if (f.x + 150 < cullL || f.x - 150 > cullR || f.y + 60 < cullT || f.y - 60 > cullB) continue;
    cx.globalAlpha = clamp(1 - f.t / (f.life || 0.7), 0, 1);
    cx.font = "bold " + (f.size || 13) + "px monospace";
    /* fast path: the ~50 damage numbers in a busy fight cost exactly what they always
       did — no save/scale/strokeText. Only streak callouts take the branch below. */
    if (!f.pop && !f.outline) { cx.fillStyle = f.color; cx.fillText(f.txt, f.x, f.y); continue; }
    const k = Math.min(1, f.t / 0.12);
    const sc = 1 + f.pop * (1 - k) * (1 - k);       // overshoot, settling to 1.0 in 120ms
    cx.save();
    cx.translate(f.x, f.y); cx.scale(sc, sc);
    if (f.glow) { cx.shadowColor = f.color; cx.shadowBlur = f.glow; }
    if (f.outline) { cx.lineWidth = 3; cx.lineJoin = "round"; cx.strokeStyle = f.outline; cx.strokeText(f.txt, 0, 0); }
    cx.fillStyle = f.color;
    cx.fillText(f.txt, 0, 0);
    cx.restore();                                   // also clears shadowBlur — no leak into the vignette
  }
  cx.globalAlpha = 1;

  cx.restore();

  /* the saloon's rounds: blur, double vision, closing edges — over the world, under everything else */
  if (Game.drunk > 0) drawDrunkFX();

  /* vignette + flash */
  const lp = localPlayer();
  const shroud = lp && lp.curses && lp.curses.shroud > 0;
  /* SHROUD is an absolute override, never a blend: the curse exists to blind you,
     and a gold ring fighting it would read as a bug rather than a flourish */
  const st = shroud ? 0 : streakVignette();
  /* Cached: outside a streak the parameters repeat every frame, and this was a
     fresh CanvasGradient allocation each time. st is quantized to 1/40ths for
     the key — the streak's breathing crosses a step every few frames, far below
     what the eye can pick out of a peripheral tint. */
  const stQ = Math.round(st * 40);
  const vgKey = W + "|" + H + "|" + (shroud ? 1 : 0) + "|" + stQ;
  if (vgKey !== _vgKey) {
    _vgKey = vgKey;
    const stv = stQ / 40;
    _vg = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (shroud ? 0.12 : 0.35), W / 2, H / 2, Math.max(W, H) * (shroud ? 0.55 : 0.75));
    _vg.addColorStop(0, "rgba(0,0,0,0)");
    /* the streak breathes in the periphery — the meter's tension where peripheral
       vision actually lives. Stop 0 stays clear, so the arena centre is never tinted. */
    if (stv > 0) _vg.addColorStop(0.55, `rgba(255,210,61,${(0.05 + 0.09 * stv).toFixed(3)})`);
    _vg.addColorStop(1, shroud ? "rgba(2,0,10,0.92)" : (stv > 0 ? "rgba(38,22,0,0.55)" : "rgba(0,0,0,0.55)"));
  }
  cx.fillStyle = _vg; cx.fillRect(0, 0, W, H);
  /* motes ride ABOVE the vignette — they fly into the top-right corner, which is the
     darkest part of the gradient and would swallow them — but UNDER the flash */
  drawSoulMotes();
  if (Game.flash > 0) { cx.fillStyle = `rgba(${Game.flashCol || FLASH_RED},${Game.flash * 0.9})`; cx.fillRect(0, 0, W, H); }
  /* co-op: an edge chevron marks the partner whenever they're off-screen —
     doubly important when they're DOWN and bleeding out somewhere unseen */
  if (typeof Net !== "undefined" && Net.active && Game.state === "play") {
    const me = localPlayer();
    const partner = players.find(o => o !== me && !o.gone);
    if (partner) {
      const tx = (partner.x - Game.cam.x) * ZOOM, ty = (partner.y - Game.cam.y) * ZOOM;
      if (tx < 20 || tx > W - 20 || ty < 20 || ty > H - 20) {
        const M = 40;
        const dx = tx - W / 2, dy = ty - H / 2;
        const s = Math.min((W / 2 - M) / Math.abs(dx || 0.0001), (H / 2 - M) / Math.abs(dy || 0.0001));
        const ax = W / 2 + dx * s, ay = H / 2 + dy * s, ang = Math.atan2(dy, dx);
        const col = partner.downed ? "#ff4d5e" : skinColorFor(partner);
        cx.save();
        cx.translate(ax, ay); cx.rotate(ang);
        cx.globalAlpha = partner.downed ? 0.65 + 0.35 * Math.sin(Game.time * 8) : 0.8;
        cx.fillStyle = col; cx.shadowColor = col; cx.shadowBlur = 10;
        cx.beginPath(); cx.moveTo(10, 0); cx.lineTo(-6, -8); cx.lineTo(-6, 8); cx.closePath(); cx.fill();
        cx.shadowBlur = 0;
        if (partner.downed) {
          cx.rotate(-ang);
          cx.font = "bold 9px monospace"; cx.textAlign = "center";
          cx.fillText("DOWN", 0, 20);
        }
        cx.restore(); cx.globalAlpha = 1;
      }
    }
  }
  /* objective arrows ride above the vignette (they live at the darkened edges)
     but under the floor-change fade */
  drawGuideArrows();
  /* floor transition: the dark swallows the old floor, then releases the new one */
  if (Game.floorFade > 0) { cx.fillStyle = `rgba(4,3,10,${Math.min(1, Game.floorFade * 1.4)})`; cx.fillRect(0, 0, W, H); }

  /* FLAWLESS banner: a warden fell with the run still untouched — slam in, hold, fade */
  if (Game.flawlessToast > 0) {
    const ft = 2.0 - Game.flawlessToast;                     // time since it appeared
    const inA = clamp(ft / 0.22, 0, 1);
    const outA = clamp(Game.flawlessToast / 0.45, 0, 1);
    cx.save();
    cx.translate(W / 2, H * 0.36);
    const sc = 1 + (1 - inA) * 1.8;
    cx.scale(sc, sc);
    cx.globalAlpha = inA * outA;
    cx.textAlign = "center";
    cx.font = "bold 52px monospace";
    cx.fillStyle = "#ffd23d"; cx.shadowColor = "#ffd23d"; cx.shadowBlur = 28;
    cx.fillText("FLAWLESS", 0, 0);
    cx.shadowBlur = 0;
    cx.font = "bold 15px monospace"; cx.fillStyle = "#fff3c8";
    cx.fillText("UNTOUCHED — +" + Game.flawlessAward + " SOULS", 0, 28);
    cx.restore();
  }

  /* THE SINGULAR's blackjack table, over everything (scenes/blackjack.js) */
  if (Game.state === "blackjack") drawBlackjack();

  if (!Input.touchMode && Game.state === "play") {
    cx.strokeStyle = "#e8e2d0"; cx.lineWidth = 1.5; cx.globalAlpha = 0.9;
    cx.beginPath(); cx.arc(Input.mouseX, Input.mouseY, 9, 0, TAU); cx.stroke();
    cx.beginPath();
    cx.moveTo(Input.mouseX - 14, Input.mouseY); cx.lineTo(Input.mouseX - 5, Input.mouseY);
    cx.moveTo(Input.mouseX + 5, Input.mouseY); cx.lineTo(Input.mouseX + 14, Input.mouseY);
    cx.moveTo(Input.mouseX, Input.mouseY - 14); cx.lineTo(Input.mouseX, Input.mouseY - 5);
    cx.moveTo(Input.mouseX, Input.mouseY + 5); cx.lineTo(Input.mouseX, Input.mouseY + 14);
    cx.stroke(); cx.globalAlpha = 1;
  }
}

/* =========================================================
   GUIDE ARROWS — "where do I go now?"
   Once the arena is calm (no ambush raging, no warden), point the way to
   what the run has already earned and is currently OFF-screen:
     · a gold diamond leads BACK to each opened seal whose rune still waits —
       an ambush cleared mid-kite ends far from the vessel, and a player at
       launch wandered off and thought the run had stalled
     · a red ring marks the grand seal once it is ready — it IS the way forward
   Still-sealed vessels get NO arrow: finding them is the player's job.
   On-screen targets get none either; they already glow and pulse for themselves.
   ========================================================= */
function drawGuideArrows() {
  if (Game.state !== "play" || Game.ambush || Game.boss || Game.inRift || Game.ceremonyT) return;
  const targets = [];
  /* the saloon points only at the blackjack table, until you've sat down at it once */
  if (Game.inSaloon) {
    if (Game.saloon && !(Game.saloon.bj && Game.saloon.bj.sat)) targets.push({ x: BJ_SEAT.x, y: BJ_SEAT.y, color: "#ffd23d", shape: "card" });
  } else if (Game.inUnknown) {
    /* the walk-up: it waits over the abyss — point the way until it speaks */
    const U = Game.unk;
    if (U && U.stage === "walk") targets.push({ x: UNK_X, y: UNK_Y, color: "#c9b8ff", shape: "ring" });
    for (const h of healthBoxes) if (h.state === "sealed") targets.push({ x: h.x, y: h.y, color: "#ff4d5e", shape: "diamond" });
  } else {
    for (const pk of pickups) targets.push({ x: pk.x, y: pk.y, color: "#ffd23d", shape: "diamond" });
    if (SEAL.state === "ready") targets.push({ x: SEAL.x, y: SEAL.y, color: "#ff4d5e", shape: "ring" });
    /* past floor VIII the rift from floor I is the only way on */
    if (rift && rift.final) targets.push({ x: rift.x, y: rift.y, color: "#c9b8ff", shape: "ring" });
  }
  if (!targets.length) return;

  const M = 46;                                       // inset from the screen edge
  const pulse = 0.6 + 0.25 * Math.sin(Game.time * 5);
  const slide = 3 * Math.sin(Game.time * 5);          // the chevron beckons
  for (const t of targets) {
    const tx = (t.x - Game.cam.x) * ZOOM, ty = (t.y - Game.cam.y) * ZOOM;
    if (tx > 30 && tx < W - 30 && ty > (t.shape === "card" ? 90 : 30) && ty < H - 30) continue;   // visible — no arrow needed (the seat also hides under the HUD's top strip)
    const dx = tx - W / 2, dy = ty - H / 2;
    const s = Math.min((W / 2 - M) / Math.abs(dx || 0.0001), (H / 2 - M) / Math.abs(dy || 0.0001));
    const ax = W / 2 + dx * s, ay = H / 2 + dy * s, ang = Math.atan2(dy, dx);
    cx.save();
    cx.translate(ax, ay); cx.rotate(ang);
    cx.globalAlpha = pulse;
    cx.fillStyle = t.color; cx.shadowColor = t.color; cx.shadowBlur = 10;
    cx.beginPath();
    cx.moveTo(14 + slide, 0); cx.lineTo(-2 + slide, -9); cx.lineTo(2 + slide, 0); cx.lineTo(-2 + slide, 9);
    cx.closePath(); cx.fill();
    /* what kind of thing it points at — the marker stays upright */
    cx.shadowBlur = 0;
    cx.translate(-12 + slide, 0); cx.rotate(-ang);
    if (t.shape === "diamond") { cx.rotate(Math.PI / 4); cx.fillRect(-4, -4, 8, 8); }
    else if (t.shape === "card") { cx.lineWidth = 2; cx.strokeStyle = t.color; cx.strokeRect(-4.5, -6.5, 9, 13); cx.fillRect(-1.5, -2.5, 3, 5); }
    else { cx.lineWidth = 2.5; cx.strokeStyle = t.color; cx.beginPath(); cx.arc(0, 0, 5, 0, TAU); cx.stroke(); }
    cx.restore();
  }
  cx.globalAlpha = 1;
}

