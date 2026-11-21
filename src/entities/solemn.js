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
const SL_BFLY_MAX = 15;        // Butterfly potency/count cap
const SL_BFLY_TURN = 4.0;      // seconds per Butterfly "turn" tick
const SL_SHIELD_PCT = 0.20;    // FromTheCoffin shield cap
const SL_HASTE_T = 2.0;        // Haste granted on reload, once per turn
const SL_GLOOM_CAP = 30;       // gloom dmg cap

function slVitals(p) {
  if (!p) return;
  if (p.slLiving === undefined) p.slLiving = SL_AMMO_START;
  if (p.slDeparted === undefined) p.slDeparted = SL_AMMO_START;
  if (p.slReloadT === undefined) p.slReloadT = 0;
  if (p.slHasteTurn === undefined) p.slHasteTurn = false;
  if (p.slCombatStart === undefined) p.slCombatStart = false;
}

function slAmmoTotal(p) { return (p.slLiving || 0) + (p.slDeparted || 0); }

/* spend 1 ammo: Living first, then Departed. Returns spent (1) or -1 if empty. */
function slSpendOne(p) {
  slVitals(p);
  if ((p.slLiving || 0) > 0) { p.slLiving--; return 1; }
  if ((p.slDeparted || 0) > 0) { p.slDeparted--; return 1; }
  return -1;
}

/* spend all ammo; returns amount spent */
function slSpendAll(p) {
  slVitals(p);
  const spent = (p.slLiving || 0) + (p.slDeparted || 0);
  p.slLiving = 0; p.slDeparted = 0;
  return spent;
}

/* try to reload: restore pools, grant haste once per turn */
function slTryReload(p, force) {
  slVitals(p);
  const empty = slAmmoTotal(p) <= 0;
  if (!force && !empty) return false;
  p.slLiving = SL_AMMO_START;
  p.slDeparted = SL_AMMO_START;
  p.slReloadT = 0;
  if (!p.slHasteTurn) {
    p.hasteT = Math.max(p.hasteT || 0, SL_HASTE_T);
    p.slHasteTurn = true;
    if (p === localPlayer()) {
      floatText(p.x, p.y - 40, "RELOAD — HASTE", "#e8e2d0", 14);
      if (typeof toast === "function") toast("RELOAD — HASTE NEXT TURN");
    }
  }
  if (p === localPlayer() && force) floatText(p.x, p.y - 40, "RELOAD", "#e8e2d0", 14);
  return true;
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

/* S3 / Goodbye Now — spend all ammo, empowered pierce, +3 sinking (+Butterfly) on kill, reload + haste. */
function slTrySkill3(p) {
  if (!p || p.char !== "solemn") return;
  const guest = typeof Net !== "undefined" && Net.role === "guest";
  if (guest) return;
  if ((p.slReloadT || 0) > 0) return;
  const spent = slSpendAll(p);
  if (spent <= 0) { slTryReload(p, true); return; }
  const m = p.mods || {};
  const mul = 1 + Math.min(2, spent / 10);                 // +1 per 10 ammo, max +2
  const reach = 560 + Math.max(0, (m.size || 4) - 4) * 4;
  const dmg = (m.dmg || 30) * mul;
  let killed = false;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - p.aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > 0.9) continue;
    slInflictButterfly(e, p, spent);
    const before = e.hp;
    damageEnemy(e, dmg, { owner: p, x: p.x, y: p.y, knock: m.knock, crit: m.crit, critMul: m.critMul });
    if (e.dead && before > 0) killed = true;
  }
  if (killed) {
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      e.sinkingT = Math.max(e.sinkingT || 0, 4);
      e.sinkingStacks = Math.min(5, (e.sinkingStacks || 0) + 3 + Math.min(5, (e.bflyDeparted || 0)));
      e.sinkingDps = YI_SINKING_DPS;
      e.sinkingBy = p;
    }
  }
  p.slReloadT = 0.6;
  slTryReload(p, true);
  if (p === localPlayer()) {
    floatText(p.x, p.y - 44, "GOODBYE NOW", "#e8e2d0", 16);
    if (typeof toast === "function") toast("GOODBYE NOW — AMMO EXPENDED, RELOADING");
  }
}

/* per-frame player tick: reload cooldown */
function slTick(p, dt) {
  if (!p) return;
  if (p.char !== "solemn") return;
  slVitals(p);
  if ((p.slReloadT || 0) > 0) p.slReloadT = Math.max(0, p.slReloadT - dt);
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
  let txt = "THE LIVING " + living + "/" + SL_AMMO_MAX
    + " · THE DEPARTED " + departed + "/" + SL_AMMO_MAX;
  if (reloading) txt += " · RELOADING " + (p.slReloadT || 0).toFixed(1) + "s";
  else txt += " · SKILL 3 [E]";
  const cls = "on" + (reloading ? " reload" : "");
  if (lastSolemnCue !== txt + cls) {
    lastSolemnCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}
