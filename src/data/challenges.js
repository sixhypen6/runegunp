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
    desc: "No rune will answer. Rune boxes mend and hasten instead.",
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
