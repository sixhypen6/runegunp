/* =========================================================
   RUNEGUN · SOLEMN LAMENT (Yi Sang) — the ranged warden
   A black-coated Yi Sang with a coffin strapped to his back and a
   pair of butterfly-marked gun-swords. RANGED. This file currently
   holds only the body sprite; the kit comes later.
   ========================================================= */

const SOLEMN_COL = {
  coat: "#0f0f14", coatHi: "#22222c", coatDark: "#07070a",
  trim: "#d9b65c", trimHi: "#f0d488",
  cuff: "#2f7d5b", cuffHi: "#57c08a",
  shaft: "#efe7da",         // white shirt / collar peeking at the throat
  hair: "#111117", hairHi: "#2a2a34",
  skin: "#efe7da",
  coffin: "#0a0a0e", coffinHi: "#16161d", coffinEdge: "#d9b65c",
  butterfly: "#efe7da", butterflyCore: "#c9b6ff",
  gun: "#1a1a22", gunHi: "#2c2c38", gunEdge: "#c9c9d2", blade: "#eef1f6",
};

/* a small butterfly — the Index/Solemn Lament mark, two wings and a spine */
function drawSolemnButterfly(g, s, col, core) {
  g.save();
  g.fillStyle = col;
  /* upper wings */
  g.beginPath(); g.ellipse(-s * 0.55, -s * 0.42, s * 0.55, s * 0.72, -0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.55, -s * 0.42, s * 0.55, s * 0.72, 0.5, 0, TAU); g.fill();
  /* lower wings */
  g.beginPath(); g.ellipse(-s * 0.42, s * 0.6, s * 0.4, s * 0.5, 0.35, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.42, s * 0.6, s * 0.4, s * 0.5, -0.35, 0, TAU); g.fill();
  /* spine */
  g.fillStyle = core || col;
  g.beginPath(); g.ellipse(0, s * 0.05, s * 0.12, s * 0.85, 0, 0, TAU); g.fill();
  g.restore();
}

function drawSolemnWarden(P, px, py, aim, col, tint, hpFrac) {
  const t = Game.time;
  const C = SOLEMN_COL;
  const sway = Math.sin(t * 2.1 + px * 0.02) * 1.6;

  /* ---- the coffin on his back: a flat black box lying along his spine,
     seen top-down so it reads as a slab, not a steep tower ---- */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  /* "back" is opposite facing; the long axis runs along the way he looks so
     the coffin lies flat behind him instead of fanning out sideways */
  cx.save();
  cx.translate(-12, 0);
  cx.rotate(Math.PI / 2 + sway * 0.006);
  cx.shadowColor = C.coffinEdge; cx.shadowBlur = 5;
  cx.fillStyle = C.coffin;
  cx.strokeStyle = C.coffinEdge; cx.lineWidth = 1.2;
  cx.beginPath();
  cx.moveTo(0, -17);
  cx.lineTo(6, -11.5);
  cx.lineTo(6, 11.5);
  cx.lineTo(0, 17);
  cx.lineTo(-6, 11.5);
  cx.lineTo(-6, -11.5);
  cx.closePath(); cx.fill(); cx.stroke();
  /* inner lid bevel */
  cx.shadowBlur = 0;
  cx.strokeStyle = C.coffinHi; cx.lineWidth = 0.9;
  cx.beginPath();
  cx.moveTo(0, -14); cx.lineTo(4.4, -9.6); cx.lineTo(4.4, 9.6);
  cx.lineTo(0, 14); cx.lineTo(-4.4, 9.6); cx.lineTo(-4.4, -9.6);
  cx.closePath(); cx.stroke();
  /* the butterfly burned into the lid */
  cx.save();
  cx.translate(0, -4);
  cx.shadowColor = C.butterfly; cx.shadowBlur = 4;
  drawSolemnButterfly(cx, 3.6, C.butterfly, C.butterflyCore);
  cx.restore();
  cx.restore();
  cx.restore();
  cx.shadowBlur = 0; cx.globalAlpha = 1;

  /* ---- body: the long black coat, gold trim, green cuff ---- */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = C.coat;
  cx.beginPath();
  cx.moveTo(6.5, -5.4);
  cx.quadraticCurveTo(-2, -7.4, -11, -4.6);
  cx.quadraticCurveTo(-13.8, 0, -11, 4.6);
  cx.quadraticCurveTo(-2, 7.4, 6.5, 5.4);
  cx.quadraticCurveTo(9.6, 0, 6.5, -5.4);
  cx.closePath(); cx.fill();
  cx.strokeStyle = C.coatHi; cx.lineWidth = 1.1; cx.stroke();
  /* the coat's separating seam down the back */
  cx.strokeStyle = C.coatDark; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(-11, 0); cx.lineTo(5, 0); cx.stroke();
  /* gold trim along the hem */
  cx.strokeStyle = C.trim; cx.lineWidth = 1; cx.globalAlpha = 0.85;
  cx.beginPath(); cx.moveTo(-10.5, -4.6); cx.quadraticCurveTo(-13, 0, -10.5, 4.6); cx.stroke();
  cx.globalAlpha = 1;
  /* white collar / cravat at the throat */
  cx.fillStyle = C.shaft;
  cx.beginPath(); cx.moveTo(7.2, -3.2); cx.lineTo(3.8, 0); cx.lineTo(7.2, 3.2); cx.closePath(); cx.fill();
  cx.fillStyle = C.coatDark;
  cx.beginPath(); cx.moveTo(7.2, -1.2); cx.lineTo(3.8, 0); cx.lineTo(7.2, 1.2); cx.closePath(); cx.fill();
  /* the green cuff on the leading arm (the splash's tell) */
  cx.fillStyle = C.cuff;
  cx.beginPath(); cx.ellipse(6.6, 4.4, 1.5, 1.1, -0.5, 0, TAU); cx.fill();
  cx.fillStyle = C.cuffHi; cx.globalAlpha = 0.7;
  cx.beginPath(); cx.ellipse(6.6, 4.4, 0.8, 0.5, -0.5, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  drawWounds(cx, hpFrac, 11);

  /* ---- head: dark hair, pale face, one shadowed eye ---- */
  cx.fillStyle = C.hair;
  cx.beginPath(); cx.ellipse(4.2, 0, 3.7, 3.2, 0, 0, TAU); cx.fill();
  cx.fillStyle = C.hairHi; cx.globalAlpha = 0.5;
  cx.beginPath(); cx.ellipse(3.2, -1.6, 1.8, 1.1, 0.5, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  /* the face plane */
  cx.fillStyle = C.skin; cx.globalAlpha = 0.9;
  cx.beginPath(); cx.ellipse(6.2, 0.4, 1.7, 1.4, 0, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  /* a pale glint where an eye should be */
  cx.shadowColor = "#cfe0ff"; cx.shadowBlur = 5;
  cx.fillStyle = "#cdd9f0";
  cx.beginPath(); cx.ellipse(6.8, -0.5, 0.5, 0.34, 0.3, 0, TAU); cx.fill();
  cx.shadowBlur = 0;
  cx.restore();

  /* ---- the twin gun-swords, held forward along the aim ---- */
  const kick = P.kickT > 0 ? (P.kickT / 0.09) * 1.6 : 0;
  const rec = 1 - kick * 0.04;
  const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  for (const side of [-1, 1]) {
    const oy = side * 4.2;
    const hx = 6 * rec, hy = oy;
    /* the pistol body */
    cx.fillStyle = C.gun;
    cx.strokeStyle = C.gunHi; cx.lineWidth = 0.9;
    cx.beginPath();
    cx.rect(hx, hy - 1.7, 6.5, 3.4);
    cx.fill(); cx.stroke();
    /* the blade that runs out of the barrel */
    cx.strokeStyle = C.blade; cx.lineWidth = 1.5; cx.lineCap = "round";
    cx.shadowColor = C.blade; cx.shadowBlur = 5;
    cx.beginPath();
    cx.moveTo(hx + 6.2, hy);
    cx.lineTo(hx + 6.2 + 15 * rec, hy);
    cx.stroke();
    cx.shadowBlur = 0;
    /* the butterfly etched on the slide */
    cx.save();
    cx.translate(hx + 2.6, hy);
    drawSolemnButterfly(cx, 1.9, C.butterfly, C.butterflyCore);
    cx.restore();
  }
  cx.lineCap = "round";
  cx.restore();

  /* faint aura in the ruling rune's hue so he reads among the wardens */
  cx.globalAlpha = 0.12;
  cx.fillStyle = col || "#e8e2d0";
  cx.beginPath(); cx.arc(px, py, P.r + 6, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  cx.shadowBlur = 0;
}

/* =========================================================
   SOLEMN LAMENT — kit (The Living / The Departed, Butterfly)
   ========================================================= */

const SL_AMMO_START = 10;      // begin 10 Living, 10 Departed
const SL_AMMO_MAX = 10;        // cap per pool
const SL_RELOAD_TIME = 1.2;    // seconds to refill both pools
const SL_BFLY_MAX = 15;        // Butterfly potency/count cap
const SL_BFLY_TURN = 4.0;      // seconds per Butterfly "turn" tick
const SL_SHIELD_PCT = 0.20;    // FromTheCoffin shield cap
const SL_HASTE_T = 2.0;        // Haste granted on reload, once per turn
const SL_SKILL3_CD = 2.5;      // seconds between Goodbye Now uses
const SL_BARRAGE_RATE = 0.07;  // seconds per barrage shot
const SL_BARRAGE_SPREAD = 0.34; // radian spread of the barrage cone
const SL_STRIKE_REACH = 620;   // final strike reach
const SL_STRIKE_HALF = 1.05;   // final strike arc half-angle
const SL_GLOOM_CAP = 30;       // gloom dmg cap

function slVitals(p) {
  if (!p) return;
  if (p.slLiving === undefined) p.slLiving = SL_AMMO_START;
  if (p.slDeparted === undefined) p.slDeparted = SL_AMMO_START;
  if (p.slReloadT === undefined) p.slReloadT = 0;
  if (p.slSkill3Cd === undefined) p.slSkill3Cd = 0;
  if (p.slBarrageT === undefined) p.slBarrageT = 0;
  if (p.slBarrageN === undefined) p.slBarrageN = 0;
  if (p.slBarrageNext === undefined) p.slBarrageNext = 0;
  if (p.slHasteTurn === undefined) p.slHasteTurn = false;
  if (p.slCombatStart === undefined) p.slCombatStart = false;
}

function slAmmoTotal(p) { return (p.slLiving || 0) + (p.slDeparted || 0); }

/* spend 1 ammo: randomly draw from The Living or The Departed pool.
   Returns spent (1) or -1 if both empty. */
function slSpendOne(p) {
  slVitals(p);
  const living = p.slLiving || 0, departed = p.slDeparted || 0;
  if (living <= 0 && departed <= 0) return -1;
  const pickLiving = (living > 0) && (departed <= 0 || Math.random() < 0.5);
  if (pickLiving) { p.slLiving--; return 1; }
  p.slDeparted--; return 1;
}

/* spend all ammo; returns amount spent */
function slSpendAll(p) {
  slVitals(p);
  const spent = (p.slLiving || 0) + (p.slDeparted || 0);
  p.slLiving = 0; p.slDeparted = 0;
  return spent;
}

/* fire one conceptual barrage bullet during S3 (no ammo spend — already spent up front) */
function slFireBarrageShot(p, aim) {
  const m = p.mods || {};
  const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
  p.solemnSide = -(p.solemnSide || 1);
  const off = p.solemnSide * 5;
  const ox = perpX * off, oy = perpY * off;
  bullets.push({
    x: p.x + Math.cos(aim) * 18 + ox, y: p.y + Math.sin(aim) * 18 + oy,
    vx: Math.cos(aim) * m.speed, vy: Math.sin(aim) * m.speed,
    r: m.size, dmg: m.dmg, t: 0, life: 1.5,
    pierce: m.pierce, bounce: m.bounce, homing: m.homing,
    venom: m.venom, ember: m.ember, frost: m.frost, storm: m.storm,
    bleed: m.bleed,
    execute: m.execute, knock: m.knock,
    crit: m.crit, critMul: m.critMul, fear: m.fear, fearDur: m.fearDur,
    owner: p,
    x0: x + Math.cos(aim) * 18 + ox,
    y0: y + Math.sin(aim) * 18 + oy,
    hitSet: null,
    slSpend: 0,
    bflySide: p.solemnSide,
  });
  AudioFX.shoot();
}

/* S3 finale — lunge strike: inflict Butterfly = spent on every enemy in arc, deal damage, reload + haste */
function slFinishBarrage(p, spent) {
  p.slBarrageT = 0; p.slBarrageN = 0;
  const m = p.mods || {};
  const reach = SL_STRIKE_REACH + Math.max(0, (m.size || 4) - 4) * 4;
  const dmg = (m.dmg || 30) * (1 + Math.min(2, spent / 10));
  let hitAny = false;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - p.aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > SL_STRIKE_HALF) continue;
    slInflictButterfly(e, p, spent);
    damageEnemy(e, dmg, { owner: p, x: p.x, y: p.y, knock: m.knock, crit: m.crit, critMul: m.critMul });
    hitAny = true;
  }
  p.slSkill3Cd = SL_SKILL3_CD;
  slTryReload(p, true);
  if (p === localPlayer()) {
    floatText(p.x, p.y - 44, hitAny ? "GOODBYE NOW" : "GOODBYE NOW — MISS", "#e8e2d0", 16);
    if (typeof toast === "function") toast("GOODBYE NOW — ALL BUTTERFLY, RELOADING");
  }
}

/* start a reload timer; ammo refills when the timer runs out (see slTick).
   force: start even if not empty. Returns true when a reload began. */
function slTryReload(p, force) {
  slVitals(p);
  if ((p.slReloadT || 0) > 0) return false;   // already reloading
  if (!force && slAmmoTotal(p) > 0) return false;
  p.slReloadT = SL_RELOAD_TIME;
  if (p === localPlayer() && force) floatText(p.x, p.y - 40, "RELOAD", "#e8e2d0", 14);
  return true;
}

/* finish a reload: restore pools, grant haste once per turn */
function slFinishReload(p) {
  slVitals(p);
  p.slLiving = SL_AMMO_START;
  p.slDeparted = SL_AMMO_START;
  if (!p.slHasteTurn) {
    p.hasteT = Math.max(p.hasteT || 0, SL_HASTE_T);
    p.slHasteTurn = true;
    if (p === localPlayer()) {
      floatText(p.x, p.y - 40, "RELOAD — HASTE", "#e8e2d0", 14);
      if (typeof toast === "function") toast("RELOAD — HASTE NEXT TURN");
    }
  }
}

/* inflict Butterfly on an enemy hit by a solemn shot that spent `spent` ammo.
   Potency = The Living, Count = The Departed (both = spent). */
function slInflictButterfly(e, p, spent) {
  if (!e || !p || spent <= 0) return;
  const living = Math.min(SL_BFLY_MAX, spent);
  const departed = Math.min(SL_BFLY_MAX, spent);
  e.bflyLiving = Math.min(SL_BFLY_MAX, (e.bflyLiving || 0) + living);
  e.bflyDeparted = Math.min(SL_BFLY_MAX, (e.bflyDeparted || 0) + departed);
  e.bflyBy = p;
  e.bflyT = Math.max(e.bflyT || 0, SL_BFLY_TURN);
  /* On hit: attacker heals (The Living / 4) HP, min 1. */
  const heal = Math.max(1, Math.floor(living / 4));
  healPlayer(p, heal, true);
  if (p === localPlayer()) floatText(p.x, p.y - 30, "+" + heal, "#8ef0a0", 13);
}

/* Butterfly turn-end tick for one enemy:
   reset Departed to 0; gain Sinking equal to The Living; convert Living into Departed.
   Expires when both reach 0. */
function slButterflyTurnEnd(e) {
  if (!e) return;
  const living = e.bflyLiving || 0;
  const departed = e.bflyDeparted || 0;
  if (living <= 0 && departed <= 0) { e.bflyLiving = 0; e.bflyDeparted = 0; return; }
  e.bflyDeparted = 0;                                      // reset The Departed
  if (living > 0) {                                        // gain Sinking equal to The Living
    const stacks = Math.min(5, living);
    e.sinkingT = Math.max(e.sinkingT || 0, 4);
    e.sinkingStacks = Math.min(5, (e.sinkingStacks || 0) + stacks);
    e.sinkingDps = YI_SINKING_DPS;
    e.sinkingBy = e.bflyBy;
  }
  e.bflyDeparted = living;                                 // convert Living into Departed
  e.bflyLiving = 0;
  e.bflyT = SL_BFLY_TURN;                                  // next turn
  if (e.bflyLiving <= 0 && e.bflyDeparted <= 0) { e.bflyLiving = 0; e.bflyDeparted = 0; }
}

/* S3 / Goodbye Now — spend all ammo up front, fire a barrage (one shot per
   SL_BARRAGE_RATE seconds), then lunge strike: inflict Butterfly = spent on every
   enemy in arc, deal damage, reload + haste. */
function slTrySkill3(p) {
  if (!p || p.char !== "solemn") return;
  const guest = typeof Net !== "undefined" && Net.role === "guest";
  if (guest) return;
  if ((p.slReloadT || 0) > 0) return;          // can't use while reloading
  if ((p.slSkill3Cd || 0) > 0) return;          // on cooldown
  const spent = slSpendAll(p);
  if (spent <= 0) { slTryReload(p, true); return; }
  p.slBarrageT = spent * SL_BARRAGE_RATE;      // barrage length scales with ammo spent
  p.slBarrageN = spent;
  p.slBarrageNext = SL_BARRAGE_RATE;           // first shot after one interval
  p.slSkill3Cd = SL_SKILL3_CD;
  if (p === localPlayer()) floatText(p.x, p.y - 44, "GOODBYE NOW", "#e8e2d0", 16);
}

/* fire one barrage bullet per interval during S3 */
function slTickBarrage(p, dt) {
  if (!p || p.char !== "solemn") return;
  if ((p.slBarrageT || 0) <= 0) return;
  p.slBarrageT = Math.max(0, p.slBarrageT - dt);
  p.slBarrageNext = Math.max(0, (p.slBarrageNext || 0) - dt);
  if (p.slBarrageNext <= 0 && p.slBarrageT > 0) {
    const aim = p.aim + (Math.random() * 2 - 1) * SL_BARRAGE_SPREAD;
    slFireBarrageShot(p, aim);
    p.slBarrageNext = SL_BARRAGE_RATE;
  }
  if (p.slBarrageT <= 0 && p.slBarrageN > 0) {
    /* barrage finished — lunge strike finale */
    slFinishBarrage(p, p.slBarrageN);
    p.slBarrageN = 0;
  }
}

/* per-frame player tick: reload + skill-3 cooldown + barrage */
function slTick(p, dt) {
  if (!p) return;
  if (p.char !== "solemn") return;
  slVitals(p);
  slTickBarrage(p, dt);
  if ((p.slSkill3Cd || 0) > 0) p.slSkill3Cd = Math.max(0, p.slSkill3Cd - dt);
  if ((p.slReloadT || 0) > 0) {
    p.slReloadT = Math.max(0, p.slReloadT - dt);
    if (p.slReloadT <= 0) slFinishReload(p);
  }
}

/* Combat Start (wave start): reload once/turn + Shield = Butterfly% HP, max 20%/turn. */
function slCombatStart(p) {
  if (!p || p.char !== "solemn") return;
  slVitals(p);
  if (p.slCombatStart) return;
  p.slCombatStart = true;
  p.slHasteTurn = false;                                   // new turn: re-arm haste
  slTryReload(p, true);                                    // reload once per turn
  const shield = p.maxHp * SL_SHIELD_PCT;   // Shield = Butterfly% HP, max 20%/turn (cap at 20%)
  p.shield = Math.max(p.shield || 0, shield);
  p.shieldMax = Math.max(p.shieldMax || 0, shield);
  if (p === localPlayer()) {
    floatText(p.x, p.y - 44, "FROM THE COFFIN", "#e8e2d0", 14);
    if (typeof toast === "function") toast("FROM THE COFFIN — RELOADED + SHIELD");
  }
}

/* HUD — THE LIVING / THE DEPARTED ammo pips */
let lastSolemnCue = "";
function updateSolemnCue(p) {
  const el = typeof document !== "undefined" ? $("solemnCue") : null;
  if (!el) return;
  const active = !!p && p.char === "solemn";
  el.classList.toggle("on", active);
  if (!active) { lastSolemnCue = ""; return; }
  slVitals(p);
  const living = p.slLiving || 0, departed = p.slDeparted || 0;
  const reloading = (p.slReloadT || 0) > 0;
  const s3cd = (p.slSkill3Cd || 0) > 0;
  let txt = "THE LIVING " + living + "/" + SL_AMMO_MAX
    + " · THE DEPARTED " + departed + "/" + SL_AMMO_MAX;
  if (reloading) txt += " · RELOADING " + (p.slReloadT || 0).toFixed(1) + "s";
  else if (s3cd) txt += " · SKILL 3 " + (p.slSkill3Cd || 0).toFixed(1) + "s";
  else txt += " · SKILL 3 [E]";
  const cls = "on" + (reloading ? " reload" : s3cd ? " cd" : "");
  if (lastSolemnCue !== txt + cls) {
    lastSolemnCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}
