/* =========================================================
   RUNEGUN · CHAOS challenges
   A CHAOS descent is already every rune at once. These are the
   prices a warden may add on top of it — chosen on their own
   screen after tapping CHAOS, never alongside normal / hard.

   Each challenge pays a soul multiplier on every combat award
   (kills, bosses, FLAWLESS) and the run's score is what banks,
   so the multiplier reaches the vault too. Score stays the one
   number the HUD, the board and the purse all read.

   The rules themselves live where they act:
     ONE HIT   entities/combat.js  hurtPlayer()
     RUNELESS  entities/spawning.js (no start runes), game/update.js
               (orbs become boons), scenes/rift.js (the rift boons)
     ONE RUNE  data/runes.js (one slot / re-seal), scenes/rift.js
   ========================================================= */
"use strict";

const CHALLENGE_DEFS = [
  {
    id: "onehit", name: "ONE HIT", glyph: "☠", color: "#ff4d5e", mul: 3,
    desc: "A single blow ends the descent. REPRIEVE and BULWARK still answer.",
  },
  {
    id: "runeless", name: "RUNELESS", glyph: "⊘", color: "#7ad7ff", mul: 1.5,
    desc: "Found runes will not answer; rune boxes mend and hasten instead, and the rift pays in lasting vitality and stride. Signature loadouts remain.",
  },
  {
    id: "onerune", name: "ONE RUNE", glyph: "ᚱ", color: "#ffd23d", mul: 1.25,
    desc: "One slot for the whole descent. The first rune you carve is the only one that answers — the rift pours two stacks of it.",
  },
];

/* the runeless orb's boon — the same mend a vitality box gives, plus a short stride */
const RUNELESS_HEAL = 25;
const RUNELESS_HASTE_T = 8;
const RUNELESS_HASTE_MUL = 1.35;
/* The rift cannot hand a rune to a runeless warden, so it pays in lasting
   flesh instead: the vitality toll is returned, the warden is mended whole,
   and the hush's stride stays for the rest of the descent. Tune the gift here. */
const RUNELESS_RIFT_MAXHP = 25;   // permanent max vitality per rift boon
const RUNELESS_RIFT_MOVE = 0.15;  // permanent move speed per rift boon

function challengeDef(id) {
  if (!id) return null;
  return CHALLENGE_DEFS.find(d => d.id === id) || null;
}
/* the challenge this run is carrying (null on a standard chaos descent) */
function activeChallenge() {
  return (typeof Game !== "undefined" && Game.challenge) || null;
}
function soulMul() {
  const d = challengeDef(activeChallenge());
  return d ? d.mul : 1;
}
function challengeName(id) {
  const d = challengeDef(id);
  return d ? d.name : "";
}

/* Pay a combat award. With a multiplier the fraction is CARRIED in Game.soulFrac
   rather than rounded per kill: x1.25 of a 2-soul horror is 2.5, and rounding
   every payout would quietly turn a 1.25x run into a 1.5x one. Returns the whole
   souls actually added, which is what the floater should show. */
function awardSouls(n) {
  if (!(n > 0)) return 0;
  const mul = soulMul();
  if (mul === 1) { Game.score += n; return n; }
  const exact = n * mul + (Game.soulFrac || 0);
  const whole = Math.floor(exact);
  Game.soulFrac = exact - whole;
  Game.score += whole;
  return whole;
}

/* RUNELESS: what a rune source pays instead of a rune — mend + a short stride.
   `p` is the warden who touched it; the HUD/audio only answer for the local one. */
function runelessBoon(p) {
  if (!p) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + RUNELESS_HEAL);
  const healed = Math.max(0, Math.round(p.hp - before));
  p.hasteT = Math.max(p.hasteT || 0, RUNELESS_HASTE_T);
  if (p === (typeof localPlayer === "function" ? localPlayer() : null)) {
    if (healed > 0 && typeof healFlare === "function") healFlare(p.x, p.y);
    /* a warden already at full vitality still gets the stride; only the mend is silent */
    if (healed > 0) floatText(p.x, p.y - 34, "+" + healed + " VITALITY", "#7dff5e", 16);
    floatText(p.x, p.y - (healed > 0 ? 56 : 40), "HASTE", "#7ad7ff", 15);
    toast(healed > 0 ? "THE BOX OPENS — VITALITY AND HASTE" : "THE BOX OPENS — HASTE");
    updateHp();
    if (typeof AudioFX !== "undefined") AudioFX.pickup();
  }
}

/* RUNELESS: the rift's own gift. No rune can answer, so the hush returns the
   vitality toll it charged at the door and leaves a permanent mark instead of
   another blink of haste. */
function runelessRiftBoon(p) {
  if (!p) return;
  const toll = (p.maxHpMul || 1) < 1;
  p.maxHpMul = 1;                                   // give the half-vitality toll back
  p.boonMaxHp = (p.boonMaxHp || 0) + RUNELESS_RIFT_MAXHP;
  p.boonMove = (p.boonMove || 0) + RUNELESS_RIFT_MOVE;
  recalc(p);
  p.hp = p.maxHp;                                   // and step out of the hush whole
  if (p === (typeof localPlayer === "function" ? localPlayer() : null)) {
    if (typeof healFlare === "function") healFlare(p.x, p.y);
    floatText(p.x, p.y - 34, "+" + RUNELESS_RIFT_MAXHP + " MAX VITALITY", "#7dff5e", 16);
    floatText(p.x, p.y - 56, "+" + Math.round(RUNELESS_RIFT_MOVE * 100) + "% STRIDE", "#7ad7ff", 15);
    toast(toll ? "THE HUSH RETURNS THE TOLL — VITALITY AND STRIDE"
      : "THE HUSH GIVES LASTING STRENGTH — VITALITY AND STRIDE");
    updateHp();
    if (typeof AudioFX !== "undefined") AudioFX.chest();
  }
}
