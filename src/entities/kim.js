/* =========================================================
   RUNEGUN · BAMBOO-HATTED KIM — the long blade
   A pure melee warden: one very long, very narrow cut. His gun is a
   sheathed katana, and the trigger swings it.

   THE DRAW — every fourth cut is a full circle of steel instead of a
   forward arc: guaranteed critical, longer reach, and it MARKS the
   strongest horror it touches. A marked horror takes +30% from every
   following cut until the mark fades or the horror falls.

   POISE — felling a marked horror banks one Poise (up to five), each
   worth +6% cut damage for the rest of the descent. Dashing banks one
   cut toward the next draw.

   The blade answers the projectile runes through the shared melee remap
   (data/runes.js: meleeWeaponMods / bladeReading); the fan/lane/rear
   runes become cuts exactly as they do for the Wayward Passenger.
   ========================================================= */
"use strict";

/* --- the draw --- */
const KIM_DRAW_EVERY = 4;          // normal cuts banked before a draw
const KIM_DRAW_MUL = 1.7;          // draw bite, as a multiple of one cut
const KIM_DRAW_REACH = 1.16;       // draw radius, as a multiple of the blade's reach
const KIM_DRAW_LIFE = 0.34;        // seconds the ring of steel is on screen

/* --- the mark --- */
const KIM_MARK_TIME = 8;           // seconds the draw's mark holds
const KIM_MARK_BONUS = 0.30;       // every following cut into the marked horror

/* --- poise --- */
const KIM_POISE_MAX = 5;
const KIM_POISE_DMG = 0.06;        // +6% cut damage per stack

/* --- the blade itself --- */
const KIM_REACH_BASE = 112;        // longer than anyone else's steel
const KIM_HALF_ARC = 0.58;         // and much narrower — it is a line, not a fan
const KIM_SLASH_LIFE = 0.22;
const KIM_SWEEP_SHARE = 0.5;
const KIM_TWIN_GAP = 32;           // px between parallel cut lanes
const KIM_TWIN_HALF = 0.18;        // how narrow each twin lane's cut is

function kimVitals(p) {
  if (!p) return;
  if (p.kimDraw === undefined) p.kimDraw = 0;
  if (p.kimPoise === undefined) p.kimPoise = 0;
  if (p.kimMarkT === undefined) p.kimMarkT = 0;
  if (p.kimMarkId === undefined) p.kimMarkId = null;
  if (p.kimSlashT === undefined) p.kimSlashT = 0;
  if (p.kimDrawT === undefined) p.kimDrawT = 0;
}

/* the marked horror, from the live object (host/solo) or the synced id (guest) */
function kimMarkedFoe(p) {
  if (!p || !(p.kimMarkT > 0)) return null;
  const o = p.kimMark;
  if (o && !o.dead && o.hp > 0) return o;
  if (p.kimMarkId != null) {
    for (const e of enemies) if (e.id === p.kimMarkId && !e.dead && e.hp > 0) return e;
  }
  return null;
}
function kimIsMarked(p, e) {
  if (!p || !e || !(p.kimMarkT > 0)) return false;
  return e === p.kimMark || (p.kimMarkId != null && e.id === p.kimMarkId);
}
function kimSetMark(p, e) {
  if (!p || !e) return;
  p.kimMark = e;
  p.kimMarkId = e.id;
  p.kimMarkT = KIM_MARK_TIME;
}
function kimClearMark(p) {
  p.kimMark = null; p.kimMarkId = null; p.kimMarkT = 0;
}

/* one cut's bite: the blade, deepened by Poise, sharpened against the mark */
function kimBite(p, e) {
  const m = p.mods || {};
  let bite = meleeBite(m) * (1 + (p.kimPoise || 0) * KIM_POISE_DMG);
  if (kimIsMarked(p, e)) bite *= 1 + KIM_MARK_BONUS;
  return bite;
}

/* felling the marked horror banks a Poise and ends the duel */
function kimGainPoise(p) {
  if (!p) return;
  if ((p.kimPoise || 0) < KIM_POISE_MAX) {
    p.kimPoise = (p.kimPoise || 0) + 1;
    if (p === localPlayer())
      floatText(p.x, p.y - 36, "POISE " + p.kimPoise + "/" + KIM_POISE_MAX, "#bff0a0");
  }
  kimClearMark(p);
}

/* one wound, with every blade rider (crit, bleed, elements) in one place */
function kimHitEnemy(p, e, x, y, forceCrit, biteMul) {
  const m = p.mods || {};
  const crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
  const critMul = m.critMul || 2.2;
  damageEnemy(e, kimBite(p, e) * (biteMul || 1) * (crit ? critMul : 1), {
    owner: p, x, y, melee: true, critHit: crit,
    knock: (m.knock || 0) * (forceCrit ? 1.6 : 1),
  });
  if (!e.dead && m.bleed > 0) {
    e.bleedT = Math.max(e.bleedT || 0, bleedTime(m.bleed));
    e.bleedDps = Math.max(e.bleedDps || 0, bleedDps(m.bleed));
    e.bleedBy = p;
  }
  if (!e.dead) applyMeleeElements(p, e, m);
}

/* a forward arc (or the draw's full circle). Returns the strongest horror cut. */
function kimCutArc(p, x, y, aim, halfArc, reach, forceCrit, mark, biteMul) {
  const m = p.mods || {};
  let best = null, bestHp = -1;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    kimHitEnemy(p, e, x, y, forceCrit, biteMul);
    /* the draw marks a horror left standing — never a corpse it just opened */
    if (e.dead || e.hp <= 0) continue;
    const hp = e.maxHp || e.hp || 0;
    if (hp > bestHp) { bestHp = hp; best = e; }
  }
  /* VERSUS: the same arc cuts a rival warden */
  if (Game.pvpMode) for (const foe of players) {
    if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
    const dx = foe.x - x, dy = foe.y - y;
    if (dx * dx + dy * dy > (reach + foe.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    const crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
    hurtPlayer(foe, kimBite(p, foe) * (biteMul || 1) * (crit ? (m.critMul || 2.2) : 1),
      { x, y, knock: (m.knock || 0) * 0.6 });
  }
  if (mark && best) kimSetMark(p, best);
  return best;
}

/* the green sparks thrown along a cut */
function kimTrail(x, y, aim, reach, amount, draw) {
  if (particles.length >= 560) return;
  for (let i = 0; i < amount; i++) {
    const a = aim + rnd(-0.9, 0.9) + (draw ? rnd(0, TAU) : 0);
    const d = rnd(reach * 0.25, reach + 8);
    particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * rnd(70, 240), vy: Math.sin(a) * rnd(70, 240),
      t: 0, life: rnd(0.14, 0.3), r: rnd(1.2, 3),
      color: pick(draw ? ["#d8ffb4", "#ffffff", "#9fe06a"] : ["#9fe06a", "#f4ffe6", "#5d7a3c"]) });
  }
}

/* one swing — the trigger's whole work for this warden */
function kimSwing(p, x, y, aim) {
  const m = p.mods;
  kimVitals(p);
  const reach = KIM_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.8;
  const arcs = Math.max(1, m.meleeArcs || 1);
  const twin = Math.max(0, m.meleeTwin || 0);
  const mirror = Math.max(0, m.meleeMirror || 0);
  /* SCATTER widens the whole sweep; the wedges tile that wider arc */
  const totalHalf = KIM_HALF_ARC + Math.max(0, m.meleeSpread || 0);
  const wedge = totalHalf / arcs;
  const dir = Math.random() < 0.5 ? -1 : 1;
  p.kimSlashT = KIM_SLASH_LIFE;
  p.kimSlashAng = aim;
  p.kimSlashReach = reach;
  p.kimSlashDir = dir;
  p.kimSlashLanes = null;

  /* THE DRAW — banked on three cuts (or a dash), spent on the next swing */
  p.kimDraw = (p.kimDraw || 0) + 1;
  if (p.kimDraw >= KIM_DRAW_EVERY) {
    p.kimDraw = 0;
    const dr = reach * KIM_DRAW_REACH;
    p.kimDrawT = KIM_DRAW_LIFE;
    p.kimDrawAng = aim;
    p.kimDrawReach = dr;
    kimCutArc(p, x, y, aim, Math.PI, dr, true, true, KIM_DRAW_MUL);
    kimTrail(x, y, aim, dr, 22, true);
    Game.shake = Math.max(Game.shake, 5);
    Game.hitstop = Math.max(Game.hitstop, 0.03);
    if (p === localPlayer()) floatText(p.x, p.y - 34, "DRAW", "#bff0a0");
    AudioFX.slam();
    return true;
  }

  /* the base cut, or a fan of wedges under SCATTER */
  for (let i = 0; i < arcs; i++) {
    const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
    kimCutArc(p, x, y, a, arcs === 1 ? totalHalf : wedge, reach, false, false);
  }
  kimTrail(x, y, aim, reach, arcs === 1 ? 8 : Math.min(8, 4 + arcs), false);

  /* extra cuts get their own crescents */
  if (arcs > 1 || twin || mirror) {
    p.kimSlashLanes = [];
    for (let i = 0; i < arcs; i++) {
      const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
      p.kimSlashLanes.push({
        dx: 0, dy: 0, ang: a, scale: (arcs === 1 ? totalHalf : wedge) / KIM_HALF_ARC,
        delay: i * 0.012, alpha: 1, dir,
      });
    }
    /* TWIN: parallel cut lanes */
    const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
    for (let i = 0; i < twin; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const off = KIM_TWIN_GAP * (Math.floor(i / 2) + 1) * side;
      const ox = x + perpX * off, oy = y + perpY * off;
      kimCutArc(p, ox, oy, aim, KIM_TWIN_HALF, reach, false, false);
      p.kimSlashLanes.push({
        dx: perpX * off, dy: perpY * off, ang: aim,
        scale: KIM_TWIN_HALF / KIM_HALF_ARC, delay: 0.02 + i * 0.012,
        alpha: 0.75, dir, cheap: true,
      });
      kimTrail(ox, oy, aim, reach, 3, false);
    }
    /* MIRROR: the same long cut comes back behind him */
    const backHalf = KIM_HALF_ARC * 0.8;
    for (let i = 0; i < mirror; i++) {
      kimCutArc(p, x, y, aim + Math.PI, backHalf, reach * 0.9, false, false);
      p.kimSlashLanes.push({
        dx: 0, dy: 0, ang: aim + Math.PI, scale: backHalf / KIM_HALF_ARC,
        delay: 0.03 + i * 0.012, alpha: 0.7, dir: -dir, cheap: true,
      });
      kimTrail(x, y, aim + Math.PI, reach * 0.9, 3, false);
    }
  }
  return true;
}

/* a dash is one cut closer to the draw */
function kimDashCharge(p) {
  if (!p) return;
  kimVitals(p);
  p.kimDraw = Math.min(KIM_DRAW_EVERY, (p.kimDraw || 0) + 1);
}

/* per-frame bookkeeping: the swing's afterglow and the mark's clock */
function kimTick(p, dt) {
  if (!p) return;
  kimVitals(p);
  p.kimSlashT = Math.max(0, p.kimSlashT - dt);
  p.kimDrawT = Math.max(0, p.kimDrawT - dt);
  if (p.kimMarkT > 0) {
    p.kimMarkT = Math.max(0, p.kimMarkT - dt);
    const tgt = p.kimMark;
    if (tgt && (tgt.dead || tgt.hp <= 0)) { kimClearMark(p); return; }
    if (p.kimMarkT <= 0) kimClearMark(p);
  }
}

/* ---------------------------------------------------------
   HUD — IAI pips, Poise, and the mark's clock
   --------------------------------------------------------- */
let lastKimCue = "";
function updateKimCue(p) {
  const el = typeof document !== "undefined" ? $("kimCue") : null;
  if (!el) return;
  const active = !!p && p.char === "kim";
  el.classList.toggle("on", active);
  if (!active) { lastKimCue = ""; return; }
  const banked = clamp(p.kimDraw || 0, 0, KIM_DRAW_EVERY);
  const pips = "\u25c6".repeat(banked) + "\u25c7".repeat(KIM_DRAW_EVERY - banked);
  const ready = banked >= KIM_DRAW_EVERY;
  let txt = "IAI " + pips + (ready ? " · DRAW READY" : "");
  txt += " · POISE " + (p.kimPoise || 0) + "/" + KIM_POISE_MAX;
  if (p.kimMarkT > 0) txt += " · MARK " + p.kimMarkT.toFixed(1) + "s";
  const cls = "on" + (ready ? " ready" : "");
  if (lastKimCue !== txt + cls) {
    lastKimCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}

/* ---------------------------------------------------------
   RENDER — the ring of the draw, the greens of the swing, the mark
   --------------------------------------------------------- */
function drawKimSlashArc(px, py, ang, reach, k, alpha, dir, arcScale, cheap) {
  const scale = arcScale || 1;
  const span = KIM_HALF_ARC * 0.9 * scale;
  const prog = k < KIM_SWEEP_SHARE ? k / KIM_SWEEP_SHARE : 1;
  const d = dir < 0 ? -1 : 1;
  const start = d > 0 ? -span : span;
  const end = -start;
  const head = start + (end - start) * prog;
  const trail = (1.25 * scale) + 0.45;
  const tail = d > 0 ? Math.max(start, head - trail) : Math.min(start, head + trail);
  const linger = k < KIM_SWEEP_SHARE ? 1 : 1 - (k - KIM_SWEEP_SHARE) / (1 - KIM_SWEEP_SHARE);
  const fade = alpha * Math.pow(Math.max(0, linger), 0.8);
  if (fade <= 0.01 || Math.abs(head - tail) < 0.02) return;
  const R = reach * (0.92 + 0.08 * prog);
  const lo = Math.min(head, tail), hi = Math.max(head, tail);
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  cx.lineCap = "round";
  /* the green bloom the cut drags through the air */
  cx.globalAlpha = fade * (cheap ? 0.35 : 0.5);
  cx.strokeStyle = "#9fe06a";
  cx.shadowColor = "#9fe06a"; cx.shadowBlur = cheap ? 8 : 18;
  cx.lineWidth = cheap ? 3 : 6;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* the white edge — a blade, not a smear */
  cx.globalAlpha = fade * 0.95;
  cx.strokeStyle = "#f6ffe8";
  cx.shadowBlur = 5; cx.lineWidth = cheap ? 1.4 : 2.2;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* a fainter outer whisper of the same arc */
  cx.globalAlpha = fade * 0.22;
  cx.strokeStyle = "#d8ffb4"; cx.shadowBlur = 0; cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(0, 0, R + 5, lo, hi); cx.stroke();
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* THE DRAW — one full circle of steel, expanding from the warden */
function drawKimDrawRing(px, py, k, reach) {
  const prog = Math.pow(clamp(k, 0, 1), 0.55);
  const R = reach * prog;
  const fade = Math.pow(1 - clamp(k, 0, 1), 0.7);
  if (fade <= 0.01) return;
  cx.save();
  cx.translate(px, py);
  cx.globalAlpha = fade * 0.5;
  cx.strokeStyle = "#9fe06a";
  cx.shadowColor = "#9fe06a"; cx.shadowBlur = 20;
  cx.lineWidth = 7;
  cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
  cx.globalAlpha = fade;
  cx.strokeStyle = "#ffffff";
  cx.shadowBlur = 9; cx.lineWidth = 2.4;
  cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
  /* petals thrown off the rim */
  cx.shadowBlur = 0;
  cx.strokeStyle = "#d8ffb4"; cx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + k * 1.2;
    cx.globalAlpha = fade * 0.75;
    cx.beginPath();
    cx.moveTo(Math.cos(a) * (R + 2), Math.sin(a) * (R + 2));
    cx.lineTo(Math.cos(a) * (R + 12 + 6 * prog), Math.sin(a) * (R + 12 + 6 * prog));
    cx.stroke();
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* the marked horror, seen by its own Kim only */
function drawKimMark(g) {
  if (typeof localPlayer !== "function") return;
  const P = localPlayer();
  if (!P || P.char !== "kim") return;
  const e = kimMarkedFoe(P);
  if (!e) return;
  const t = Game.time, pulse = 0.5 + 0.5 * Math.sin(t * 6);
  g.save();
  g.translate(e.x, e.y);
  g.globalAlpha = 0.55 + 0.35 * pulse;
  g.strokeStyle = "#bff0a0";
  g.shadowColor = "#9fe06a"; g.shadowBlur = 12;
  g.lineWidth = 2;
  g.setLineDash([5, 5]);
  g.lineDashOffset = -t * 30;
  g.beginPath(); g.arc(0, 0, e.r + 8 + pulse * 2, 0, TAU); g.stroke();
  g.setLineDash([]);
  /* four bamboo notches, turning slowly */
  for (let i = 0; i < 4; i++) {
    const a = t * 0.8 + i * TAU / 4;
    g.beginPath();
    g.moveTo(Math.cos(a) * (e.r + 11), Math.sin(a) * (e.r + 11));
    g.lineTo(Math.cos(a) * (e.r + 17), Math.sin(a) * (e.r + 17));
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1; g.shadowBlur = 0;
}

/* the warden's body — drawn from drawWarden() */
function drawKimWarden(P, px, py, aim, col, tint, hpFrac) {
  const t = Game.time;
  const drawReady = (P.kimDraw || 0) >= KIM_DRAW_EVERY;

  /* the draw's ring sits under the body */
  if (P.kimDrawT > 0) {
    drawKimDrawRing(px, py, 1 - P.kimDrawT / KIM_DRAW_LIFE, P.kimDrawReach || KIM_REACH_BASE);
  }

  /* the robe streams opposite the aim */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim + Math.PI);
  cx.globalAlpha = 0.5;
  cx.fillStyle = col;
  cx.beginPath();
  cx.moveTo(4, -9);
  cx.quadraticCurveTo(20, -14, 27, -2);
  cx.quadraticCurveTo(19, 3, 25, 11);
  cx.quadraticCurveTo(11, 9, 4, 9);
  cx.closePath(); cx.fill();
  cx.globalAlpha = 1;
  cx.restore();

  /* body: a narrow swordsman's silhouette turned with the aim */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim + Math.PI / 2);
  cx.fillStyle = col;
  cx.beginPath();
  cx.moveTo(-8, -7);
  cx.quadraticCurveTo(3, -12, 11, 0);
  cx.quadraticCurveTo(3, 12, -8, 7);
  cx.closePath(); cx.fill();
  /* the sash */
  cx.fillStyle = "#c9b06a";
  cx.fillRect(-5, -7, 3.5, 14);
  drawCracks(cx, hpFrac, 11);
  cx.restore();

  /* the bamboo hat — a wide woven cone, seen from above */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = "#c9a86a";
  cx.shadowColor = "#c9a86a"; cx.shadowBlur = 5;
  cx.beginPath(); cx.ellipse(-3, 0, 14.5, 9.5, 0, 0, TAU); cx.fill();
  cx.shadowBlur = 0;
  cx.strokeStyle = "#8a6d3a"; cx.lineWidth = 1.2;
  cx.beginPath(); cx.ellipse(-3, 0, 14.5, 9.5, 0, 0, TAU); cx.stroke();
  /* the weave */
  for (let i = -2; i <= 2; i++) {
    const oy = i * 2.9;
    const half = 14.5 * Math.sqrt(Math.max(0, 1 - (oy / 9.5) ** 2));
    cx.beginPath(); cx.moveTo(-3 - half, oy); cx.lineTo(-3 + half, oy); cx.stroke();
  }
  /* crown, and the shadow it lays over his eyes */
  cx.fillStyle = "#8a6d3a";
  cx.beginPath(); cx.ellipse(-3, 0, 5.6, 4.2, 0, 0, TAU); cx.fill();
  cx.fillStyle = "rgba(8,10,6,0.88)";
  cx.beginPath(); cx.ellipse(-6, 0, 4.8, 3.1, 0, 0, TAU); cx.fill();
  cx.restore();

  /* the long blade */
  const swing = P.kimSlashT > 0 ? clamp(1 - P.kimSlashT / KIM_SLASH_LIFE, 0, 1) : 0;
  const sweep = P.kimSlashT > 0 ? Math.min(1, swing / KIM_SWEEP_SHARE) : 0;
  const armDir = P.kimSlashDir < 0 ? -1 : 1;
  const bladeSweep = armDir * (-0.7 + 1.4 * sweep);
  cx.save();
  cx.translate(px, py);
  const ba = aim + bladeSweep + (P.kimSlashT > 0 ? 0 : 0.24);
  const hand = 7;
  const len = 46 + 10 * Math.sin(Math.PI * sweep);
  /* the ruling rune or warpaint tints the steel; a bare blade is bamboo-green */
  let edge = tint || "#9fe06a";
  if (!P.gunSkin && !(P.runes && Object.keys(P.runes).length)) edge = "#9fe06a";
  /* the green haze along the steel, hotter when the draw is ready */
  cx.strokeStyle = edge;
  cx.shadowColor = edge; cx.shadowBlur = drawReady ? 16 : 11;
  cx.lineWidth = 3; cx.lineCap = "round";
  cx.beginPath();
  cx.moveTo(Math.cos(ba) * hand, Math.sin(ba) * hand);
  cx.lineTo(Math.cos(ba) * len, Math.sin(ba) * len);
  cx.stroke();
  /* the white edge */
  cx.strokeStyle = "#f6ffe8";
  cx.shadowBlur = 4; cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(Math.cos(ba) * (hand + 2), Math.sin(ba) * (hand + 2));
  cx.lineTo(Math.cos(ba) * (len + 2), Math.sin(ba) * (len + 2));
  cx.stroke();
  /* guard */
  cx.shadowBlur = 0;
  cx.strokeStyle = "#c9a86a"; cx.lineWidth = 2;
  const gx = Math.cos(ba) * hand, gy = Math.sin(ba) * hand;
  const perpX = Math.cos(ba + Math.PI / 2) * 4, perpY = Math.sin(ba + Math.PI / 2) * 4;
  cx.beginPath(); cx.moveTo(gx - perpX, gy - perpY); cx.lineTo(gx + perpX, gy + perpY); cx.stroke();
  cx.restore();

  /* the swing's crescents */
  const reach = P.kimSlashReach || KIM_REACH_BASE;
  const dir = P.kimSlashDir < 0 ? -1 : 1;
  if (P.kimSlashT > 0) {
    if (P.kimSlashLanes && P.kimSlashLanes.length) {
      for (const L of P.kimSlashLanes) {
        const k = clamp(1 - (P.kimSlashT - (L.delay || 0)) / KIM_SLASH_LIFE, 0, 1);
        drawKimSlashArc(px + (L.dx || 0), py + (L.dy || 0), L.ang, reach, k,
          L.alpha == null ? 1 : L.alpha, L.dir == null ? dir : L.dir, L.scale || 1, !!L.cheap);
      }
    } else {
      const k = clamp(1 - P.kimSlashT / KIM_SLASH_LIFE, 0, 1);
      drawKimSlashArc(px, py, P.kimSlashAng - 0.16, reach, k, 1, dir);
      drawKimSlashArc(px, py, P.kimSlashAng + 0.16, reach, Math.max(0, k - 0.06), 0.7, dir);
    }
  }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}
