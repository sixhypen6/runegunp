/* =========================================================
   RUNEGUN · Rendering — THE UNKNOWN
   The abyss, the creature and its halo of every rune, the tell (a glyph
   lifting over its head, glowing, then striking), every floor warning its
   runes draw, and its words. Phone-safe like draw-deep.js: glows are cached
   radial sprites, never a per-object shadowBlur.
   ========================================================= */
"use strict";

const _unkGlow = new Map();
/* a soft radial glow in `color`, baked once per colour */
function unkGlowSprite(color) {
  let c = _unkGlow.get(color);
  if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _unkGlow.set(color, c);
  return c;
}
let _unkAbyss = null;
function unkAbyssSprite() {
  if (_unkAbyss) return _unkAbyss;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.6, "rgba(1,0,4,0.97)"); gr.addColorStop(1, "rgba(5,3,12,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return (_unkAbyss = c);
}

/* ---------- under everything that stands ---------- */
function drawUnknownUnder() {
  const U = Game.unk; if (!U) return;
  const t = Game.time, R = UNK_ABYSS_R;
  cx.save();
  /* the abyss: a pit of nothing with ripples falling into it */
  cx.drawImage(unkAbyssSprite(), UNK_X - R - 70, UNK_Y - R - 70, (R + 70) * 2, (R + 70) * 2);
  cx.strokeStyle = "#9d6bff"; cx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.3 + k / 3) % 1;
    cx.globalAlpha = 0.35 * p;
    cx.beginPath(); cx.arc(UNK_X, UNK_Y, R * (1 - p) + 6, 0, TAU); cx.stroke();
  }
  cx.globalAlpha = 0.45; cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 2; cx.setLineDash([3, 14]);
  cx.save(); cx.translate(UNK_X, UNK_Y); cx.rotate(-t * 0.15);
  cx.beginPath(); cx.arc(0, 0, R + 8, 0, TAU); cx.stroke();
  cx.restore(); cx.setLineDash([]);
  /* hidden in the abyss: only its eyes, watching */
  const hid = 1 - (U.stage === "done" ? 1 : U.vis);
  if (hid > 0.02 && U.stage !== "done" && U.stage !== "dying") {
    const blink = (t % 3.7) < 0.14;
    cx.globalAlpha = hid * (0.55 + 0.35 * Math.sin(t * 2.2));
    cx.fillStyle = "#fff3c8";
    for (const s of [-1, 1]) {
      cx.beginPath();
      if (blink) cx.rect(UNK_X + s * 14 - 5, UNK_Y - 8, 10, 2); else cx.arc(UNK_X + s * 14, UNK_Y - 6, 4, 0, TAU);
      cx.fill();
    }
  }
  cx.globalAlpha = 1;
  /* the floor warnings */
  for (const z of U.zones) if (UNK_GROUND.has(z.type)) drawUnkZone(U, z);
  /* STILLED FIELDS */
  for (const f of U.fields) {
    const k = clamp(f.t / 0.4, 0, 1) * clamp((f.life - f.t) / 0.6, 0, 1);
    cx.globalAlpha = 0.14 * k; cx.fillStyle = "#6be0d4";
    cx.beginPath(); cx.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, TAU); cx.fill();
    cx.globalAlpha = 0.6 * k; cx.strokeStyle = "#6be0d4"; cx.lineWidth = 2; cx.setLineDash([4, 9]); cx.stroke(); cx.setLineDash([]);
    cx.globalAlpha = 0.75 * k; cx.font = "bold 13px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillStyle = "#6be0d4"; cx.fillText("40% SPEED", f.x, f.y);
  }
  /* FOOL'S GOLD: real coins spin, mimics sit still */
  for (const c of U.coins) {
    const warn = !c.real && c.boom - c.t < 0.6;
    const wob = c.real ? Math.abs(Math.cos(c.t * 6 + c.ph)) : 1;
    cx.globalAlpha = 1;
    cx.drawImage(unkGlowSprite("#ffd23d"), c.x - 26, c.y - 26, 52, 52);
    cx.fillStyle = warn ? "#ff8a3d" : "#ffd23d"; cx.strokeStyle = "#7a5a10"; cx.lineWidth = 2;
    cx.beginPath(); cx.ellipse(c.x + (warn ? Math.sin(t * 60) * 2 : 0), c.y, 11 * wob + 1, 11, 0, 0, TAU); cx.fill(); cx.stroke();
  }
  cx.globalAlpha = 1;
  cx.restore();
}

/* ---------- over everyone ---------- */
function drawUnknownOver() {
  const U = Game.unk; if (!U) return;
  const b = U.boss, t = Game.time;
  cx.save();
  cx.lineCap = "round"; cx.lineJoin = "round";
  for (const z of U.zones) if (!UNK_GROUND.has(z.type)) drawUnkZone(U, z);
  /* THE TITHE: a red tether drinking you */
  if (U.tether && b && !b.dead) {
    const P = nearestPlayer(b.x, b.y);
    cx.strokeStyle = "#ff4d5e"; cx.globalAlpha = 0.8; cx.lineWidth = 3 + Math.sin(t * 14);
    cx.beginPath(); cx.moveTo(b.x, b.y); cx.lineTo(P.x, P.y); cx.stroke();
    cx.fillStyle = "#ff4d5e";
    for (let i = 0; i < 7; i++) { const u = (t * 0.8 + i / 7) % 1; cx.beginPath(); cx.arc(lerp(P.x, b.x, u), lerp(P.y, b.y, u), 4, 0, TAU); cx.fill(); }
    cx.globalAlpha = 0.85; cx.font = "bold 11px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText("BREAK IT: DISTANCE OR STONE", P.x, P.y - 44);
  }
  /* THE RUSH: the line it is about to cut */
  if (U.aim && b) {
    cx.strokeStyle = U.aim.c; cx.globalAlpha = 0.75; cx.lineWidth = 3; cx.setLineDash([12, 10]);
    cx.beginPath(); cx.moveTo(b.x, b.y); cx.lineTo(U.aim.x, U.aim.y); cx.stroke(); cx.setLineDash([]);
  }
  /* the body itself, while it dies (the entity is gone from the enemy list by now) */
  if (U.stage === "dying" && b) {
    cx.globalAlpha = 1;
    cx.save(); cx.translate(b.x, b.y);
    drawUnknownBody(cx, b, U.st < 2.0 && Math.sin(U.st * 30) > 0);
    cx.restore();
  }
  /* the halo — every rune in the game; dims to embers in the abyss, scatters as it dies */
  if (b && U.stage !== "done") {
    let a = 0.25 + 0.75 * U.vis;
    if (U.stage === "dying") a = clamp(1 - (U.st - 1.4) / 2.4, 0, 1);
    if (a > 0.01) {
      cx.font = "bold 19px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      for (const h of U.halo) {
        if (h.busy) continue;
        const p = unkHaloPos(h), R = RUNES[h.id];
        cx.globalAlpha = a; cx.fillStyle = R.color; cx.fillText(R.glyph, p.x, p.y);
      }
    }
  }
  /* readouts under its body */
  if (b && !b.dead && U.stage === "fight") {
    cx.globalAlpha = 1; cx.textAlign = "center"; cx.textBaseline = "middle";
    if (U.mend) {
      const k = clamp(U.mend.dmg / U.mend.need, 0, 1), x0 = b.x - 70, y0 = b.y + b.r + 34;
      cx.fillStyle = "#10241a"; cx.fillRect(x0, y0, 140, 7);
      cx.fillStyle = "#8effb0"; cx.fillRect(x0, y0, 140 * k, 7);
      cx.font = "bold 11px monospace"; cx.fillText(Math.round(U.mend.need) + " DAMAGE BREAKS THE KNITTING", b.x, y0 + 20);
    }
    if (enemies.some(w => w.type === "unkward" && !w.dead)) {
      cx.font = "bold 12px monospace"; cx.fillStyle = "#bcd0ff"; cx.fillText("WARDED · −80%", b.x, b.y + b.r + (U.mend ? 76 : 34));
    }
  }
  /* THE BLIND DARK — the tell stays visible above it: you can always read what's coming */
  if (U.dark) {
    const d = U.dark, k = clamp(Math.min(d.t / 0.4, (d.dur - d.t) / 0.5), 0, 1), P = localPlayer();
    cx.globalAlpha = 0.94 * k; cx.fillStyle = "#020106";
    cx.beginPath(); cx.rect(Game.cam.x - 40, Game.cam.y - 40, VW + 80, VH + 80); cx.arc(P.x, P.y, 170, 0, TAU); cx.fill("evenodd");
    cx.globalAlpha = 0.45 * k; cx.strokeStyle = "#020106"; cx.lineWidth = 46;
    cx.beginPath(); cx.arc(P.x, P.y, 170, 0, TAU); cx.stroke();
  }
  drawUnkCasts(U);
  /* its words, hanging in the dark above it */
  if (U.line) {
    const L = U.line, a = clamp(L.t / 0.35, 0, 1) * clamp((L.life - L.t) / 0.45, 0, 1);
    const hid = U.vis < 0.5 || U.stage === "round";
    const x = hid ? UNK_X : b.x, y0 = (hid ? UNK_Y - 200 : b.y - 250);
    cx.font = "italic 24px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    /* hangs over it, but never above the top of the screen or behind the letterbox */
    const lines = unkWrap(L.txt, Math.min(700, VW - 80)), y = Math.max(y0 - (lines.length - 1) * 16, unkTopLimit(40));
    const w = Math.max(...lines.map(s => cx.measureText(s).width)) + 48;
    cx.globalAlpha = 0.6 * a; cx.fillStyle = "#05030c";
    cx.fillRect(x - w / 2, y - 26, w, lines.length * 32 + 20);
    cx.globalAlpha = a; cx.fillStyle = "#e8e2d0";
    lines.forEach((s, i) => cx.fillText(s, x, y + i * 32));
    cx.globalAlpha = 0.5 * a; cx.strokeStyle = "#9d6bff"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(x - w / 2 + 20, y - 26); cx.lineTo(x + w / 2 - 20, y - 26); cx.stroke();
  }
  cx.globalAlpha = 1;
  cx.restore();
}
function unkWrap(text, max) {
  const words = text.split(" "), out = []; let line = "";
  for (const w of words) { const s = line ? line + " " + w : w; if (cx.measureText(s).width > max && line) { out.push(line); line = w; } else line = s; }
  if (line) out.push(line);
  return out;
}

/* ---------- the tell: lift, glow, strike ---------- */
function drawUnkCasts(U) {
  const b = U.boss; if (!b || U.stage !== "fight") return;
  const t = Game.time;
  for (const c of U.casts) {
    if (c.fired) continue;
    const R = RUNES[c.id], p = unkCastPos(c), lift = p.k;
    const wind = clamp((c.t - 0.3) / (c.windup + c.delay), 0, 1), sz = lerp(22, c.n === 3 ? 50 : 60, lift);
    cx.save(); cx.translate(p.x, p.y);
    cx.globalAlpha = 0.3 * lift; cx.strokeStyle = R.color; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(b.x - p.x, b.y - b.r - p.y); cx.lineTo(0, 18); cx.stroke();
    const gs = 74 + 16 * Math.sin(t * 10) * wind;
    cx.globalAlpha = (0.4 + 0.6 * wind) * lift;
    cx.drawImage(unkGlowSprite(R.color), -gs, -gs, gs * 2, gs * 2);
    /* a dark disc behind the glyph: on a short screen the rune can hang over its halo, and must still read */
    cx.globalAlpha = 0.7 * lift; cx.fillStyle = "#05030c";
    cx.beginPath(); cx.arc(0, 0, 40, 0, TAU); cx.fill();
    /* a charge ring closes on it; the arc fills as the tell runs out */
    cx.globalAlpha = lift; cx.lineWidth = 2.5;
    cx.beginPath(); cx.arc(0, 0, lerp(68, 34, wind), 0, TAU); cx.stroke();
    cx.lineWidth = 4;
    cx.beginPath(); cx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + TAU * wind); cx.stroke();
    if (c.yours) { cx.strokeStyle = "#ffd23d"; cx.lineWidth = 2; cx.setLineDash([3, 6]); cx.beginPath(); cx.arc(0, 0, 55, 0, TAU); cx.stroke(); cx.setLineDash([]); }
    cx.fillStyle = wind > 0.85 && Math.sin(t * 40) > 0 ? "#ffffff" : R.color;
    cx.font = "bold " + sz.toFixed(1) + "px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(R.glyph, 0, 2);
    cx.font = "bold " + (c.n === 3 ? 12 : 14) + "px monospace";
    cx.lineWidth = 4; cx.strokeStyle = "#05030c";
    cx.strokeText(R.name, 0, -66); cx.fillStyle = R.color; cx.fillText(R.name, 0, -66);
    if (c.yours) { cx.font = "bold 11px monospace"; cx.strokeText("YOURS", 0, -84); cx.fillStyle = "#ffd23d"; cx.fillText("YOURS", 0, -84); }
    cx.restore();
  }
  /* what comes next, waiting dimly beside its head */
  if (U.next && U.next.length) {
    const x0 = b.x + (U.next.length >= 3 ? 280 : 230), y0 = unkCastAnchorY(b);
    cx.globalAlpha = 0.6; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillStyle = "#8a86a0"; cx.font = "bold 11px monospace"; cx.fillText("NEXT", x0, y0 - 28);
    cx.font = "bold 24px monospace";
    U.next.forEach((id, i) => { cx.fillStyle = RUNES[id].color; cx.fillText(RUNES[id].glyph, x0 + (i - (U.next.length - 1) / 2) * 30, y0); });
    cx.globalAlpha = 1;
  }
}

/* ---------- the zones ---------- */
const UNK_GROUND = new Set(["circle", "lane", "grid", "well", "mark", "wedge", "spokes"]);
function drawUnkZone(U, z) {
  const lt = z.t - z.delay; if (lt < 0) return;
  const wk = z.warn ? clamp(lt / z.warn, 0, 1) : 1, on = lt >= z.warn;
  const ak = z.active ? clamp((lt - z.warn) / z.active, 0, 1) : 1;
  const fade = on ? clamp(1 - (lt - z.warn - z.active) / (z.fade || 0.3), 0, 1) : 1;
  cx.save();
  cx.strokeStyle = z.c; cx.fillStyle = z.c;
  switch (z.type) {
    case "circle":
      if (!on) {
        cx.globalAlpha = 0.3 + 0.5 * wk; cx.lineWidth = 2.5; cx.setLineDash([8, 8]);
        cx.beginPath(); cx.arc(z.x, z.y, z.r, 0, TAU); cx.stroke(); cx.setLineDash([]);
        cx.globalAlpha = 0.1 + 0.18 * wk; cx.beginPath(); cx.arc(z.x, z.y, z.r * wk, 0, TAU); cx.fill();
        if (z.lob) {
          /* the glob in flight, arcing in from its body */
          const lx = lerp(z.lob.x, z.x, wk), ly = lerp(z.lob.y, z.y, wk) - Math.sin(wk * Math.PI) * 170;
          cx.globalAlpha = 1; cx.beginPath(); cx.arc(lx, ly, 9, 0, TAU); cx.fill();
        }
      } else if (z.blast) {
        cx.globalAlpha = (0.15 + 0.65 * (1 - ak)) * fade;
        cx.beginPath(); cx.arc(z.x, z.y, z.r * (1 + ak * 0.2), 0, TAU); cx.fill();
        if (z.spikes) {
          cx.globalAlpha = fade; cx.fillStyle = "#e8fbff";
          for (let k = 0; k < 7; k++) {
            const a = k / 7 * TAU, s = z.r * 0.9 * (1 - ak * 0.3);
            cx.beginPath(); cx.moveTo(z.x + Math.cos(a - 0.2) * 10, z.y + Math.sin(a - 0.2) * 10);
            cx.lineTo(z.x + Math.cos(a) * s, z.y + Math.sin(a) * s); cx.lineTo(z.x + Math.cos(a + 0.2) * 10, z.y + Math.sin(a + 0.2) * 10); cx.fill();
          }
        }
      }
      break;
    case "lane":
      if (on) break;
      if (z.w >= 20) {
        const a = Math.atan2(z.y2 - z.y1, z.x2 - z.x1), nx = -Math.sin(a) * z.w / 2, ny = Math.cos(a) * z.w / 2;
        cx.globalAlpha = 0.08 + 0.14 * wk;
        cx.beginPath(); cx.moveTo(z.x1 + nx, z.y1 + ny); cx.lineTo(z.x2 + nx, z.y2 + ny); cx.lineTo(z.x2 - nx, z.y2 - ny); cx.lineTo(z.x1 - nx, z.y1 - ny); cx.closePath(); cx.fill();
        cx.globalAlpha = 0.35 + 0.45 * wk; cx.lineWidth = 2; cx.setLineDash([10, 10]);
        cx.beginPath(); cx.moveTo(z.x1 + nx, z.y1 + ny); cx.lineTo(z.x2 + nx, z.y2 + ny); cx.moveTo(z.x1 - nx, z.y1 - ny); cx.lineTo(z.x2 - nx, z.y2 - ny); cx.stroke();
        cx.setLineDash([]);
      } else {
        /* THE NEEDLE's sight line: it flashes */
        cx.globalAlpha = Math.sin(lt * 40) > 0 ? 0.95 : 0.3; cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(z.x1, z.y1); cx.lineTo(z.x2, z.y2); cx.stroke();
      }
      break;
    case "line":
      if (!on) {
        cx.globalAlpha = 0.2 + 0.55 * wk; cx.lineWidth = 2 + wk; cx.setLineDash([14, 10]);
        cx.beginPath(); cx.moveTo(z.x1, z.y1); cx.lineTo(z.x2, z.y2); cx.stroke(); cx.setLineDash([]);
      } else {
        cx.globalAlpha = (1 - ak) * fade; cx.lineWidth = z.w * (1 - ak * 0.5) + 3;
        cx.beginPath(); cx.moveTo(z.x1, z.y1); cx.lineTo(z.x2, z.y2); cx.stroke();
        cx.strokeStyle = "#ffffff"; cx.lineWidth = 3; cx.stroke();
      }
      break;
    case "cut":
      cx.globalAlpha = 0.6 * (1 - ak * 0.6) * fade; cx.lineWidth = z.w;
      cx.beginPath(); cx.moveTo(z.x1, z.y1); cx.lineTo(z.x2, z.y2); cx.stroke();
      cx.strokeStyle = "#ffffff"; cx.globalAlpha *= 0.6; cx.lineWidth = 3; cx.stroke();
      break;
    case "bolt":
      if (!on) {
        cx.globalAlpha = 0.2 + 0.5 * wk; cx.lineWidth = 2; cx.setLineDash([5, 12]);
        cx.beginPath(); cx.moveTo(z.x + Math.cos(z.a) * 64, z.y + Math.sin(z.a) * 64); cx.lineTo(z.x + Math.cos(z.a) * z.len, z.y + Math.sin(z.a) * z.len); cx.stroke(); cx.setLineDash([]);
      } else if (z.pts) {
        cx.globalAlpha = (1 - ak) * fade; cx.lineWidth = 7 * (1 - ak) + 2;
        cx.beginPath(); z.pts.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.stroke();
        cx.strokeStyle = "#ffffff"; cx.lineWidth = 2; cx.stroke();
      }
      break;
    case "spokes": {
      const rot = z.rot + z.rotSpd * Math.max(0, lt - z.warn);
      for (let k = 0; k < z.n; k++) {
        const a = rot + k / z.n * TAU, L = on ? z.len * unkEase((lt - z.warn) / 0.9) : z.len;
        const x1 = z.x + Math.cos(a) * 50, y1 = z.y + Math.sin(a) * 50, x2 = z.x + Math.cos(a) * L, y2 = z.y + Math.sin(a) * L;
        if (!on) { cx.globalAlpha = 0.2 + 0.45 * wk; cx.lineWidth = 2; cx.setLineDash([8, 10]); cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); cx.setLineDash([]); continue; }
        cx.globalAlpha = 0.55 * fade; cx.lineWidth = z.w + Math.sin(Game.time * 20 + k) * 4;
        cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
        cx.strokeStyle = "#ffd23d"; cx.globalAlpha = 0.85 * fade; cx.lineWidth = z.w * 0.35; cx.stroke(); cx.strokeStyle = z.c;
      }
      break;
    }
    case "wedge":
      cx.globalAlpha = on ? 0.12 * fade : 0.06 + 0.14 * wk;
      cx.beginPath(); cx.moveTo(z.x, z.y); cx.arc(z.x, z.y, z.r, z.a0, z.a1); cx.closePath(); cx.fill();
      if (!on) { cx.globalAlpha = 0.5 * wk; cx.lineWidth = 2; cx.setLineDash([8, 10]); cx.stroke(); cx.setLineDash([]); }
      else {
        const ba = lerp(z.a0, z.a1, unkEase(ak));
        cx.globalAlpha = 0.3 * fade; cx.beginPath(); cx.moveTo(z.x, z.y); cx.arc(z.x, z.y, z.r, Math.max(z.a0, ba - 0.6), ba); cx.closePath(); cx.fill();
        cx.globalAlpha = fade; cx.lineWidth = 8;
        cx.beginPath(); cx.moveTo(z.x + Math.cos(ba) * 60, z.y + Math.sin(ba) * 60); cx.lineTo(z.x + Math.cos(ba) * z.r, z.y + Math.sin(ba) * z.r); cx.stroke();
        cx.strokeStyle = "#ffffff"; cx.lineWidth = 3; cx.stroke();
      }
      break;
    case "twinbeam": {
      const a = on ? z.a0 + z.sweep * ak : z.a0, nx = -Math.sin(a), ny = Math.cos(a);
      for (const s of [-1, 1]) {
        const ox = z.x + nx * s * z.gap / 2, oy = z.y + ny * s * z.gap / 2;
        cx.beginPath(); cx.moveTo(ox + Math.cos(a) * 60, oy + Math.sin(a) * 60); cx.lineTo(ox + Math.cos(a) * z.len, oy + Math.sin(a) * z.len);
        if (!on) { cx.globalAlpha = 0.25 + 0.5 * wk; cx.lineWidth = 2; cx.setLineDash([10, 10]); cx.stroke(); cx.setLineDash([]); }
        else { cx.globalAlpha = 0.8 * fade; cx.lineWidth = 14; cx.stroke(); cx.strokeStyle = "#ffffff"; cx.lineWidth = 3; cx.stroke(); cx.strokeStyle = z.c; }
      }
      break;
    }
    case "grid": {
      const s = z.size;
      const i0 = Math.max(0, Math.floor(Game.cam.x / s)), i1 = Math.ceil((Game.cam.x + VW) / s);
      const j0 = Math.max(0, Math.floor(Game.cam.y / s)), j1 = Math.ceil((Game.cam.y + VH) / s);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        if ((i + j) % 2 !== z.parity) continue;
        const x = i * s, y = j * s;
        if (!on) { cx.globalAlpha = 0.05 + 0.18 * wk; cx.fillRect(x + 4, y + 4, s - 8, s - 8); }
        else {
          cx.globalAlpha = (1 - ak) * fade;
          for (let k = 0; k < 4; k++) { const px = x + 18 + k * 31; cx.beginPath(); cx.moveTo(px - 9, y + s - 18); cx.lineTo(px, y + 18); cx.lineTo(px + 9, y + s - 18); cx.fill(); }
        }
      }
      break;
    }
    case "reticle": {
      const locked = lt >= z.warn * z.lockAt;
      if (!on) {
        cx.globalAlpha = 0.6 + 0.4 * (locked ? Math.abs(Math.sin(lt * 20)) : 0); cx.lineWidth = 2.5;
        cx.beginPath(); cx.arc(z.x, z.y, 32, 0, TAU); cx.stroke();
        cx.beginPath(); cx.moveTo(z.x - 46, z.y); cx.lineTo(z.x - 16, z.y); cx.moveTo(z.x + 16, z.y); cx.lineTo(z.x + 46, z.y);
        cx.moveTo(z.x, z.y - 46); cx.lineTo(z.x, z.y - 16); cx.moveTo(z.x, z.y + 16); cx.lineTo(z.x, z.y + 46); cx.stroke();
      } else { cx.globalAlpha = (1 - ak) * fade * 0.8; cx.beginPath(); cx.arc(z.x, z.y, z.r, 0, TAU); cx.fill(); }
      break;
    }
    case "well":
      cx.globalAlpha = (on ? 0.6 : 0.6 * wk) * fade; cx.lineWidth = 2.5;
      for (let k = 0; k < 3; k++) {
        cx.save(); cx.translate(z.x, z.y); cx.rotate(-Game.time * (1.5 + k * 0.6) + k);
        cx.setLineDash([18, 14]); cx.beginPath(); cx.arc(0, 0, z.r * (1 - k * 0.28), 0, TAU); cx.stroke(); cx.restore();
      }
      cx.setLineDash([]);
      cx.globalAlpha = 0.12 * fade; cx.beginPath(); cx.arc(z.x, z.y, z.r, 0, TAU); cx.fill();
      break;
    case "mark":
      cx.globalAlpha = 0.4 + 0.5 * wk; cx.lineWidth = 2.5;
      cx.beginPath(); cx.arc(z.x, z.y, z.r * (1.4 - 0.4 * wk), 0, TAU); cx.stroke();
      cx.font = "bold 22px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText("ᚷ", z.x, z.y + 1);
      break;
    case "flare":
      cx.globalAlpha = 1 - ak; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(z.x, z.y, 18 + ak * 70, 0, TAU); cx.stroke();
      break;
  }
  cx.restore();
}

/* ---------- bodies (drawDeepBody hook, body-local) ---------- */
/* the creature: a dark cowled core with two patient eyes, tendrils trailing into the
   abyss. The bestiary portrait passes a stub creature and gets a still ring of runes. */
function drawUnknownBody(g, e, flash) {
  const U = typeof Game !== "undefined" ? Game.unk : null, live = !!(U && U.boss === e);
  const v = live ? U.vis : 1;
  g.shadowBlur = 0;
  if (v <= 0.01) return;
  const t = Game.time || 0, r = e.r;
  g.save();
  g.globalAlpha = v;
  const sc = 0.35 + 0.65 * v;
  if (live) {
    for (let k = 0; k < 6; k++) {
      const sx = (k - 2.5) * 15 * sc, sy = r * 0.6 * sc;
      const ex = UNK_X - e.x + (k - 2.5) * 26, ey = UNK_Y - e.y + 46 + Math.sin(t * 1.3 + k) * 6;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + Math.sin(t * 1.7 + k * 1.3) * 26, (sy + ey) / 2, ex, ey);
      g.strokeStyle = "#140f26"; g.lineWidth = 11 - Math.abs(k - 2.5) * 1.5; g.stroke();
      g.strokeStyle = "rgba(157,107,255,0.35)"; g.lineWidth = 1.5; g.stroke();
    }
  }
  g.scale(sc, sc);
  if (live && U.mend) g.translate(0, 10);   // it kneels to knit
  g.drawImage(unkGlowSprite("#c9b8ff"), -r * 3.2, -r * 3.2, r * 6.4, r * 6.4);
  g.save(); g.rotate(t * 0.2); g.setLineDash([3, 10]); g.strokeStyle = "rgba(201,184,255,0.5)"; g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, r + 14, 0, TAU); g.stroke(); g.restore();
  g.fillStyle = flash ? "#ffffff" : "#0a0818";
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = "#c9b8ff"; g.lineWidth = 3; g.stroke();
  g.strokeStyle = "rgba(157,107,255,0.6)"; g.lineWidth = 3.5;
  g.beginPath(); g.arc(0, -4, r * 0.72, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  const shut = (live && U.mend) || (t % 4.3) < 0.12;
  g.fillStyle = "#fff3c8";
  g.globalAlpha = v * (0.75 + 0.25 * Math.sin(t * 3));
  for (const s of [-1, 1]) {
    g.beginPath();
    if (shut) g.rect(s * 14 - 6, -6, 12, 2.5); else g.arc(s * 14, -5, 5, 0, TAU);
    g.fill();
  }
  g.globalAlpha = v;
  if (live && U.sheenT > 0) {
    /* THE REFLECTION: a violet shell */
    g.globalAlpha = v * (0.22 + 0.12 * Math.sin(t * 12)); g.fillStyle = "#f3c4ff";
    g.beginPath(); g.arc(0, 0, r + 18, 0, TAU); g.fill();
    g.globalAlpha = v * 0.9; g.strokeStyle = "#f3c4ff"; g.lineWidth = 2.5; g.stroke();
  }
  if (live && U.brambleT > 0) {
    /* THE RETORT: barbs bristle out of it */
    g.fillStyle = "#ff6b8a"; g.globalAlpha = v * 0.9;
    for (let k = 0; k < 16; k++) { g.save(); g.rotate(k / 16 * TAU + t * 0.6); g.beginPath(); g.moveTo(r + 4, -5); g.lineTo(r + 20, 0); g.lineTo(r + 4, 5); g.fill(); g.restore(); }
  }
  if (!live) {
    /* the portrait: a still ring of the runes it answers to */
    g.font = "bold 13px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    const ids = ["storm", "ember", "frost", "venom", "seeker", "titan", "mirror", "nova"];
    ids.forEach((id, i) => { const a = i / ids.length * TAU - Math.PI / 2; g.fillStyle = RUNES[id].color; g.fillText(RUNES[id].glyph, Math.cos(a) * (r + 24), Math.sin(a) * (r + 24)); });
  }
  g.restore();
}
/* its pieces: the CARAPACE's wards, the SHIELDS' orbs, the HOUNDS, the DARK's wisps */
function drawUnknownMinion(g, e, flash) {
  const t = Game.time, r = e.r;
  g.shadowBlur = 0;
  if (e.type === "unkward" || e.type === "unkorb") {
    const col = flash ? "#ffffff" : e.color;
    g.drawImage(unkGlowSprite(e.color), -r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
    g.fillStyle = e.type === "unkward" ? "rgba(188,208,255,0.2)" : "rgba(224,168,107,0.25)";
    g.strokeStyle = col; g.lineWidth = 2.5;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = col; g.font = "bold " + Math.round(r * 1.2) + "px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(e.type === "unkward" ? "ᛝ" : "ᛒ", 0, 1);
  } else if (e.type === "unkhound") {
    g.drawImage(unkGlowSprite(e.color), -r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
    g.rotate(e.head || 0);
    g.fillStyle = flash ? "#ffffff" : e.color;
    g.beginPath(); g.moveTo(r * 1.3, 0); g.lineTo(-r, -r * 0.8); g.lineTo(-r * 0.5, 0); g.lineTo(-r, r * 0.8); g.closePath(); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(r * 0.3, 0, r * 0.3, 0, TAU); g.fill();
  } else if (e.type === "unkwisp") {
    const fl = 1 + 0.15 * Math.sin(t * 15 + e.id);
    g.drawImage(unkGlowSprite("#9d9db8"), -r * 2.4, -r * 2.4, r * 4.8, r * 4.8);
    g.fillStyle = flash ? "#ffffff" : e.color;
    g.beginPath(); g.moveTo(0, -r * 1.5 * fl); g.quadraticCurveTo(r, -r * 0.2, 0, r); g.quadraticCurveTo(-r, -r * 0.2, 0, -r * 1.5 * fl); g.fill();
    g.fillStyle = "#020106"; g.beginPath(); g.arc(-3, -2, 2, 0, TAU); g.moveTo(5, -2); g.arc(3, -2, 2, 0, TAU); g.fill();
  }
}
