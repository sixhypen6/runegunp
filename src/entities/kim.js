/* =========================================================
   RUNEGUN · BAMBOO-HATTED KIM — the long blade
   A pure melee warden: one very long, very narrow cut. His gun is a
   sheathed jikdo — a straight blade with a red tassel at the pommel —
   and the trigger swings it.

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

/* --- the man himself ---
   Black robe soaked through with old blood, a pale bone beak, one blue
   flame of an eye, and a long pale blade that has not been cleaned. */
const KIM_COL = {
  robe: "#1b1c22", robeHi: "#2b2d35", robeDark: "#111218",
  mask: "#e4decd", maskShade: "#a9a392",
  hat: "#3a332c", hatHi: "#6a5b49", hatDark: "#211d19",
  blood: "#6e1218", bloodHi: "#9c2027",
  eye: "#5ac8ff", eyeCore: "#e8faff",
  steel: "#d2d6d6", steelDark: "#33363b", steelEdge: "#eef8ff",
  arc: "#8fc7ea", arcEdge: "#eef8ff", arcTail: "#bfe3f7",
  mark: "#8fd0f0",
};

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
      floatText(p.x, p.y - 36, "POISE " + p.kimPoise + "/" + KIM_POISE_MAX, KIM_COL.mark);
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

/* the cold sparks thrown along a cut, and the blood they carry */
function kimTrail(x, y, aim, reach, amount, draw) {
  if (particles.length >= 560) return;
  for (let i = 0; i < amount; i++) {
    const a = aim + rnd(-0.9, 0.9) + (draw ? rnd(0, TAU) : 0);
    const d = rnd(reach * 0.25, reach + 8);
    const blood = Math.random() < (draw ? 0.3 : 0.16);
    particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * rnd(70, 240), vy: Math.sin(a) * rnd(70, 240),
      t: 0, life: rnd(0.14, 0.3), r: rnd(1.2, 3),
      color: blood ? pick([KIM_COL.blood, KIM_COL.bloodHi, "#c23a30"])
        : pick(draw ? [KIM_COL.arcTail, KIM_COL.steelEdge, KIM_COL.arc]
                    : [KIM_COL.arc, "#dff3ff", "#4d7f9c"]) });
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
    if (p === localPlayer()) floatText(p.x, p.y - 34, "DRAW", KIM_COL.mark);
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
   RENDER — the ring of the draw, the cold line of the swing, the mark
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
  /* the cold bloom the cut drags through the air */
  cx.globalAlpha = fade * (cheap ? 0.35 : 0.5);
  cx.strokeStyle = KIM_COL.arc;
  cx.shadowColor = KIM_COL.arc; cx.shadowBlur = cheap ? 8 : 18;
  cx.lineWidth = cheap ? 3 : 6;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* the white edge — a blade, not a smear */
  cx.globalAlpha = fade * 0.95;
  cx.strokeStyle = KIM_COL.arcEdge;
  cx.shadowBlur = 5; cx.lineWidth = cheap ? 1.4 : 2.2;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* a fainter outer whisper of the same arc */
  cx.globalAlpha = fade * 0.22;
  cx.strokeStyle = KIM_COL.arcTail; cx.shadowBlur = 0; cx.lineWidth = 1.2;
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
  cx.strokeStyle = KIM_COL.arc;
  cx.shadowColor = KIM_COL.arc; cx.shadowBlur = 20;
  cx.lineWidth = 7;
  cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
  cx.globalAlpha = fade;
  cx.strokeStyle = "#ffffff";
  cx.shadowBlur = 9; cx.lineWidth = 2.4;
  cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
  /* droplets thrown off the rim */
  cx.shadowBlur = 0;
  cx.strokeStyle = KIM_COL.arcTail; cx.lineWidth = 2;
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
  g.strokeStyle = KIM_COL.mark;
  g.shadowColor = KIM_COL.eye; g.shadowBlur = 12;
  g.lineWidth = 2;
  g.setLineDash([5, 5]);
  g.lineDashOffset = -t * 30;
  g.beginPath(); g.arc(0, 0, e.r + 8 + pulse * 2, 0, TAU); g.stroke();
  g.setLineDash([]);
  /* four notches, turning slowly */
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

  /* the robe streams behind him like smoke — one dark ribbon, one of old blood */
  const sway = Math.sin(t * 2.7 + px * 0.013) * 2.2;
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim + Math.PI);
  cx.globalAlpha = 0.62;
  cx.fillStyle = KIM_COL.robe;
  cx.beginPath();
  cx.moveTo(4, -9);
  cx.quadraticCurveTo(19, -14 + sway, 28, -3 + sway);
  cx.quadraticCurveTo(20, 2, 26, 11 - sway);
  cx.quadraticCurveTo(11, 9, 4, 9);
  cx.closePath(); cx.fill();
  cx.globalAlpha = 0.4;
  cx.fillStyle = KIM_COL.robeHi;
  cx.beginPath();
  cx.moveTo(3, -3);
  cx.quadraticCurveTo(14, -7 - sway, 21, 1 + sway * 0.5);
  cx.quadraticCurveTo(13, 5, 3, 6);
  cx.closePath(); cx.fill();
  /* a thin smear of blood carried on the cloth */
  cx.globalAlpha = 0.5;
  cx.strokeStyle = KIM_COL.blood; cx.lineWidth = 2.4; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(7, 5); cx.quadraticCurveTo(16, 7 + sway, 22, 4 - sway); cx.stroke();
  cx.restore();
  cx.globalAlpha = 1;

  /* body: a narrow swordsman's silhouette, black and soaked through */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = KIM_COL.robe;
  cx.beginPath();
  cx.moveTo(6, -6.5);
  cx.quadraticCurveTo(-2, -9.5, -11, -6);
  cx.quadraticCurveTo(-14.5, 0, -11, 6);
  cx.quadraticCurveTo(-2, 9.5, 6, 6.5);
  cx.quadraticCurveTo(9.5, 0, 6, -6.5);
  cx.closePath(); cx.fill();
  cx.strokeStyle = KIM_COL.robeDark; cx.lineWidth = 1.2; cx.stroke();

  /* old blood soaked into the chest and sleeve */
  cx.fillStyle = KIM_COL.blood;
  for (const [bx, by, br] of [[-3, -4, 3.4], [-6, 3.2, 2.6], [2.5, 4.6, 2.2], [1, -5.4, 1.8]]) {
    cx.globalAlpha = 0.85;
    cx.beginPath(); cx.ellipse(bx, by, br, br * 0.68, 0.5, 0, TAU); cx.fill();
  }
  cx.globalAlpha = 0.9; cx.fillStyle = KIM_COL.bloodHi;
  cx.beginPath(); cx.ellipse(-3.4, -4.2, 1.4, 0.95, 0.5, 0, TAU); cx.fill();
  cx.beginPath(); cx.ellipse(-5.6, 3.4, 1.1, 0.8, 0.5, 0, TAU); cx.fill();
  cx.globalAlpha = 1;

  drawCracks(cx, hpFrac, 11);

  /* the bone beak, jutting out ahead of the hat */
  cx.fillStyle = KIM_COL.mask;
  cx.beginPath();
  cx.moveTo(5, -4.6);
  cx.quadraticCurveTo(12, -3.6, 19, 0);
  cx.quadraticCurveTo(12, 3.6, 5, 4.6);
  cx.closePath(); cx.fill();
  cx.strokeStyle = KIM_COL.maskShade; cx.lineWidth = 0.9; cx.stroke();
  /* the seam running down the beak */
  cx.beginPath(); cx.moveTo(6, 0); cx.lineTo(18, 0); cx.stroke();
  cx.restore();

  /* the hat: broad, ragged, black-brown, sitting low over the mask */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = KIM_COL.hat;
  cx.shadowColor = KIM_COL.hat; cx.shadowBlur = 6;
  cx.beginPath();
  const brim = 22;
  for (let i = 0; i < brim; i++) {
    const a = i / brim * TAU;
    const jag = 1 - 0.14 * Math.abs(Math.sin(i * 2.7));
    const ex = -4 + Math.cos(a) * 13.8 * jag;
    const ey = Math.sin(a) * 9.2 * jag;
    i === 0 ? cx.moveTo(ex, ey) : cx.lineTo(ex, ey);
  }
  cx.closePath(); cx.fill();
  cx.shadowBlur = 0;
  cx.strokeStyle = KIM_COL.hatDark; cx.lineWidth = 1.6; cx.stroke();
  /* the weave: two rings of rushes and a few ribs out to the brim */
  cx.strokeStyle = KIM_COL.hatHi; cx.globalAlpha = 0.5; cx.lineWidth = 1;
  for (const f of [0.5, 0.76]) {
    cx.beginPath(); cx.ellipse(-4, 0, 13.8 * f, 9.2 * f, 0, 0, TAU); cx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2;
    cx.beginPath();
    cx.moveTo(-4 + Math.cos(a) * 5.2, Math.sin(a) * 3.6);
    cx.lineTo(-4 + Math.cos(a) * 12.6, Math.sin(a) * 8.4);
    cx.stroke();
  }
  cx.globalAlpha = 1;
  /* the crown */
  cx.fillStyle = KIM_COL.hatDark;
  cx.beginPath(); cx.ellipse(-4, 0, 4.8, 3.6, 0, 0, TAU); cx.fill();

  /* one blue flame of an eye, burning out from under the brim */
  const flick = 0.72 + 0.28 * Math.sin(t * 11);
  cx.shadowColor = KIM_COL.eye; cx.shadowBlur = 14 * flick;
  cx.fillStyle = KIM_COL.eye; cx.globalAlpha = 0.95;
  cx.beginPath(); cx.ellipse(10.8, -1.9, 2.1, 1.4, 0.25, 0, TAU); cx.fill();
  cx.fillStyle = KIM_COL.eyeCore; cx.globalAlpha = 1;
  cx.beginPath(); cx.ellipse(11.1, -1.9, 0.9, 0.7, 0.25, 0, TAU); cx.fill();
  cx.shadowBlur = 0;
  /* the other socket, long since dark */
  cx.fillStyle = "rgba(20,22,26,0.85)";
  cx.beginPath(); cx.ellipse(10.2, 2.1, 1.4, 0.95, -0.25, 0, TAU); cx.fill();
  cx.restore();

  /* the long blade — pale, straight, and not yet cleaned */
  const swing = P.kimSlashT > 0 ? clamp(1 - P.kimSlashT / KIM_SLASH_LIFE, 0, 1) : 0;
  const sweep = P.kimSlashT > 0 ? Math.min(1, swing / KIM_SWEEP_SHARE) : 0;
  const armDir = P.kimSlashDir < 0 ? -1 : 1;
  const bladeSweep = armDir * (-0.7 + 1.4 * sweep);
  cx.save();
  cx.translate(px, py);
  const ba = aim + bladeSweep + (P.kimSlashT > 0 ? 0 : 0.24);
  const hand = 8;
  const len = 58 + 10 * Math.sin(Math.PI * sweep);
  const cosA = Math.cos(ba), sinA = Math.sin(ba);
  const hiltX = cosA * hand, hiltY = sinA * hand;
  const tipX = cosA * len, tipY = sinA * len;
  /* the ruling rune or warpaint tints the haze around the steel */
  let edge = tint || KIM_COL.arc;
  if (!P.gunSkin && !(P.runes && Object.keys(P.runes).length)) edge = KIM_COL.arc;
  cx.lineCap = "round";
  /* the dark back of the blade */
  cx.strokeStyle = KIM_COL.steelDark;
  cx.shadowColor = edge; cx.shadowBlur = drawReady ? 16 : 9;
  cx.lineWidth = 3.8;
  cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
  /* the pale steel */
  cx.strokeStyle = KIM_COL.steel;
  cx.shadowBlur = drawReady ? 14 : 7; cx.lineWidth = 2.2;
  cx.beginPath(); cx.moveTo(hiltX, hiltY);
  cx.lineTo(tipX - cosA * 1.5, tipY - sinA * 1.5); cx.stroke();
  /* the hot edge */
  cx.strokeStyle = KIM_COL.steelEdge;
  cx.shadowBlur = 4; cx.lineWidth = 0.9;
  cx.beginPath(); cx.moveTo(hiltX, hiltY);
  cx.lineTo(tipX - cosA * 3, tipY - sinA * 3); cx.stroke();
  /* blood dried along the last third */
  cx.shadowBlur = 0; cx.globalAlpha = 0.85;
  cx.strokeStyle = KIM_COL.blood; cx.lineWidth = 1.5;
  cx.beginPath();
  cx.moveTo(cosA * (len * 0.62) - sinA * 0.9, sinA * (len * 0.62) + cosA * 0.9);
  cx.lineTo(cosA * (len * 0.86) - sinA * 0.9, sinA * (len * 0.86) + cosA * 0.9);
  cx.stroke();
  cx.strokeStyle = KIM_COL.bloodHi; cx.lineWidth = 1.1;
  cx.beginPath();
  cx.moveTo(cosA * (len * 0.70) + sinA * 0.8, sinA * (len * 0.70) - cosA * 0.8);
  cx.lineTo(cosA * (len * 0.80) + sinA * 0.8, sinA * (len * 0.80) - cosA * 0.8);
  cx.stroke();
  cx.globalAlpha = 1;
  /* the brass guard, and the wrapped grip */
  cx.strokeStyle = "#b08d4a"; cx.lineWidth = 2.2;
  const perpX = Math.cos(ba + Math.PI / 2) * 4.6, perpY = Math.sin(ba + Math.PI / 2) * 4.6;
  cx.beginPath(); cx.moveTo(hiltX - perpX, hiltY - perpY); cx.lineTo(hiltX + perpX, hiltY + perpY); cx.stroke();
  cx.strokeStyle = KIM_COL.hatDark; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(hiltX - perpX * 0.55, hiltY - perpY * 0.55);
  cx.lineTo(hiltX + perpX * 0.55, hiltY + perpY * 0.55); cx.stroke();
  cx.restore();

  /* the red tassel at the pommel — it hangs against the world, not the blade */
  const pomX = px + cosA * 3, pomY = py + sinA * 3;
  const tsway = Math.sin(t * 5 + px * 0.02) * 2.6;
  cx.save();
  cx.translate(pomX, pomY);
  cx.fillStyle = "#b08d4a";
  cx.beginPath(); cx.ellipse(0, 0, 1.7, 1.3, 0, 0, TAU); cx.fill();
  cx.strokeStyle = "#7d1018"; cx.lineWidth = 1.5; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(0, 1); cx.quadraticCurveTo(tsway * 0.4, 5, tsway, 8.5); cx.stroke();
  cx.fillStyle = "#a3161f";
  cx.beginPath(); cx.ellipse(tsway, 9.3, 1.7, 1.2, 0, 0, TAU); cx.fill();
  cx.strokeStyle = "#c0282f"; cx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    cx.beginPath();
    cx.moveTo(tsway + i * 0.85, 9.6);
    cx.lineTo(tsway + i * 1.15, 14.5 + Math.abs(i) * 0.7);
    cx.stroke();
  }
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
