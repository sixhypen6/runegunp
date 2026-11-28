/* =========================================================
   RUNEGUN · THE INDEX NURSEFATHER (Yi Sang) — the Prescript
   A pure melee warden: a spider in a black suit, one gold eye,
   a chained blade under his sleeve. Every strike decides a
   prescript the Oracle delivered, and the Oracle does not
   take "no" for an answer.

   THE PRESCRIPT — the Oracle writes MARK OF THE PRESCRIPT on
   Yi Sang's Base Attack Skill for a window of time. Every swing
   inside that window is a marked skill: it feeds PROCURATION
   [HERMES] one stack per swing (eight until Unlock II, then
   nine), and the first marked swing of the window banks one
   Grace of the Prescript. Let the window lapse without a marked
   swing and the Karmic Consequence writes itself instead (+20,
   max 100, −0.4% damage per stack, −40% at the cap).

   GRACE OF THE PRESCRIPT — a ladder, not a pool: PRESCRIPT
   [DEVICE] I caps it at three, the next Device raises the
   ceiling to six, and Device III repeats until PROCURATION
   [HERMES] reaches nine — the moment it does, the last three
   steps of Grace are paid at once. Marked skills deal +2% per
   Grace (max 16%); at nine Grace, Base Skills deal +20%
   instead. Each Unlock adds a guard (+5/10/15% less damage
   taken) and a burst of vitality. Executing at Hermes 9 heals
   8 vitality and pays three Grace; Turn End at Unlock II heals
   4 once.

   PROCURATION [HERMES] — filled by marked swings, capped at
   eight until Unlock II, then nine. At nine it opens Skill 3
   (Furioso-Replica), the [Q] finisher that consumes the meter.

   POISE — every cut banks a Poise, a critical banks two (max 5);
   +6% cut damage per stack. The kit's [On Hit] builds paid out
   in one strike's worth per blow, because our Yi Sang attacks
   alone, without coin-luck or skill-dashboards — the blade is
   the account.

   THE ORACLE DEVICE — a vial of black metallic liquid at his throat.
   Each cut it pours out whichever weapon the Prescript demands
   (Hermes breathes through it): a HATCHET (copper: heavy knock,
   drags the horror slow), a STILETTO (gloom-violet: three Sinking
   Potency and the longest Count), or a BASTARD SWORD (pale steel:
   +18% damage). Every landed cut lays one Sinking Potency — the
   Index's base skills all sank the target; the stiletto is simply
   the vessel that does it properly.

   The blade answers the projectile runes through the shared
   melee remap (data/runes.js: meleeWeaponMods /
   bladeReading); the fan/lane/rear runes become cuts
   exactly as they do for every melee warden.
   ========================================================= */
"use strict";

/* --- the Prescript --- */
const YI_MARK_CD = 9;              // fallback gap between Prescripts (the next name is written soon after)
const YI_MARK_FIRST = 1.1;         // the first mark comes fast — the Oracle does not wait long
const YI_MARK_TIME = 12;           // the mark's window on the Base Attack Skill before the Oracle loses interest

/* --- Grace of the Prescript --- */
const YI_GRACE_MAX = 9;
const YI_GRACE_TIER_3 = 3, YI_GRACE_TIER_6 = 6, YI_GRACE_TIER_9 = 9;
const YI_GRACE_PER_STACK = 0.02;   // +2% damage with marked skills per Grace (max 16%)
const YI_GRACE_BASE_DMG = 0.20;    // at 9 Grace, Base Skills deal +20% instead
const YI_UNLOCK_GUARD = [0, 0.05, 0.10, 0.15];     // Unlock I/II/III: Defence Level +1/+2/+3 as damage taken down
const YI_GRACE_FIRST_PER_PRESCRIPT = 1; // the first marked-skill use of a Prescript banks one Grace
/* PRESCRIPT [DEVICE] I–III: the ceiling Grace may climb to at Device stage 1/2/3/4 */
const YI_GRACE_CAP = [3, 6, 9, 9];
/* PROCURATION [HERMES] — capped at 8 until Unlock II, nine after */
const YI_PROC_MAX = 9;
const YI_PROC_CAP_LOW = 8;
/* the Prescript pays SP-read as vitality when executed with Hermes at 9 */
const YI_EXECUTE_HEAL = 8;
/* Turn End (Unlock II): heal 4 SP → 4 vitality once per turn when the Prescript was executed this turn */
const YI_TURN_HEAL = 4;
/* Skill 3 / Furioso-Replica — the Q-key ability */
const YI_SKILL3_CD = 2.5;             // cooldown between Skill 3 uses
const YI_FURIOSO_CRIT_BONUS = 0.90;   // +90% critical damage
const YI_FURIOSO_BURN_T = 4;          // seconds of Burn
const YI_FURIOSO_BURN_DPS = 6;        // burn damage per second
const YI_FURIOSO_BIND_T = 1.5;        // seconds of Bind / unable to act
const YI_FURIOSO_FRAG_STACKS = 2;     // slash Fragility stacks
const YI_FURIOSO_MARK_BONUS = 0.10;   // +10% damage while the Prescript marks the skill
const YI_FURIOSO_POISE = 3;           // +3 Poise on use
/* FURIOSO-REPLICA's nine coins climb like Limbus: each coin adds power, so
   strike 1 hits at 1.0×, strike 2 at 1.5×, … strike 9 at 5.0× (6 → 9 → … → 30).
   The multiplier is applied on top of the Mark bonus inside yiFuriosoCut. */
/* the three Unlocks the Prescript grants at 3 / 6 / 9 Grace — and the line it speaks */
const YI_UNLOCKS = [
  { tier: 1, name: "UNLOCK - I", line: "Wading through a dream, the self nowhere to be found.", kanji: "無我夢中" },
  { tier: 2, name: "UNLOCK - II", line: "Like the Naraka of Avīci and Raurava.", kanji: "阿鼻叫喚" },
  { tier: 3, name: "UNLOCK - III", line: "Severed and torn until even the form is undone.", kanji: "支離滅裂" },
];
const YI_KARMIC_MAX = 100;
const YI_KARMIC_PER_STACK = 0.004;  // each Consequence drags cuts down 0.4% (40% at 100)
const YI_KARMIC_EXECUTE_CLEAR = 20; // exiting a prescript lifts twenty
const YI_KARMIC_MISS = 20;          // a mark that escapes alive adds twenty

/* --- THE ORACLE'S VERDICT (Unlock - III, late Encounter) ---
   Once the third Unlock is spoken the Oracle reads the target before it names
   the vessel. A horror already below a third of its vitality is answered with
   the heavy vessels only (greatsword, lance, whip, scythe) — the wheel stops
   wasting the opening beats of a kill. And any cut that leaves a non-boss
   horror below a tenth of its vitality is finished outright: SEVERED. */
const YI_VERDICT_HP = 0.30;         // below this fraction the wheel draws heavy vessels
const YI_EXECUTE_HP = 0.12;         // ...and a cut below this ends a non-boss horror
const YI_VERDICT_HEAVY = [5, 6, 7, 8];  // greatsword, lance, whip, scythe

/* --- WOUND-CASING MASK / SIZZLING WOUND ---
   The Index Nurserfather enters each Encounter wearing a casing of the Oracle's
   skin: Offense Level +2, Defense Level -2, and a little less bite from attacks
   he is not turned against. Take a staggering blow while it holds and, at Turn
   End, he recovers from the Stagger and the casing sizzles over into a wound —
   Offense Level +3, Defense Level -3, a deeper guard against unopposed attacks,
   a Burn and a Bleed every Turn Start, +15% with his Base Attacks, faster swings,
   and a storm of dark-blue electric light along every cut. */
const YI_MASK_OFF = 0.20;             // Offense Level +2 → +20% cut damage
const YI_WOUND_OFF = 0.30;            // Offense Level +3 → +30% cut damage
const YI_WOUND_BASE = 0.15;           // Sizzling Wound: +15% with Base Attacks
const YI_MASK_DEF = 0.20;             // Defense Level -2 → +20% damage taken
const YI_WOUND_DEF = 0.30;            // Defense Level -3 → +30% damage taken
const YI_MASK_UNOPPOSED = 0.10;       // -10% from Unopposed Attacks
const YI_WOUND_UNOPPOSED = 0.25;      // -25% from Unopposed Attacks
const YI_WOUND_DOT_T = 6;             // Turn Start: seconds of self Burn & Bleed
const YI_WOUND_DOT_DPS = 2;           // ...and how hard they bite
const YI_MASK_STAGGER_FRAC = 0.18;    // a blow this heavy Staggers him while masked
const YI_WOUND_ANIM_DUR = 0.72;       // Sizzling Wound: swings play 28% faster
const YI_WOUND_RATE = 0.85;           // ...and the next swing comes 15% sooner

/* --- SHIN (心) - FATE ---
   At Unlock - III the Prescript breathes into him: Min & Max Speed +1, +1 more
   Poise from Base Skills, and a read of the spirit — +1% damage per 3 SP over
   the target, capped at +15%. Grace of the Prescript is his SP read (×5, so
   nine Grace is 45 SP and the full +15%); a horror without SP is read at 0. */
const YI_SHIN_SP_PER_GRACE = 5;       // SP read: Grace × 5
const YI_SHIN_SP_STEP = 3;            // +1% per 3 SP of difference
const YI_SHIN_SP_MAX = 0.15;          // cap +15%
const YI_SHIN_SPEED = 1.10;           // Min & Max Speed +1 → +10% stride
const YI_SHIN_ATK = 1.08;             // ...and a touch more swing speed
const YI_DESIRE_BONUS = 0.06;         // Desire for Acknowledgement Sated: +6% with a partner

/* --- INDULGENCE IN PRESCRIPTS ---
   While the Sizzling Wound is open and Furioso-Replica waits on the Dashboard,
   Turn Start grants a single turn of indulgence: Min & Max Speed +5, Furioso's
   cuts sink deeper, and every blow lands 30% harder. It burns out at Turn End. */
const YI_INDULGE_SPEED = 1.50;        // Min & Max Speed +5 → +50% stride
const YI_INDULGE_ATK = 1.40;          // ...and a faster pattern
const YI_INDULGE_DMG = 0.30;          // Deal +30% damage
const YI_INDULGE_SINK_POT = 1;        // Furioso: +1 more Sinking Potency
const YI_INDULGE_SINK_COUNT = 3;      // ...and +3 Sinking Count (once per target)
const YI_INDULGE_POISE = 1;           // ...and +1 more Poise Potency

/* --- Poise --- */
const YI_POISE_MAX = 5;
const YI_POISE_DMG = 0.06;

/* --- the blade itself --- */
const YI_REACH_BASE = 100;
const YI_HALF_ARC = 0.62;
const YI_SLASH_LIFE = 0.22;
const YI_SWEEP_SHARE = 0.5;
const YI_TWIN_GAP = 34;
const YI_TWIN_HALF = 0.18;

/* --- the nine vessels of the Oracle Device (Caduceus) --- */
const YI_WEAPON_HATCHET = 0;      // Blunt — hacking ribs with a bone hatchet
const YI_WEAPON_STILETTO = 1;     // Pierce — penetrating lungs with a stiletto
const YI_WEAPON_BASTARD = 2;      // Slash — cleaving shoulder and skull with a bastard sword
const YI_WEAPON_RAPIER = 3;       // Pierce — punching ten holes with a rapier
const YI_WEAPON_HAMMER = 4;       // Blunt — caving in the back of the skull with a hammer
const YI_WEAPON_GREATSWORD = 5;   // Slash — rending body with a greatsword
const YI_WEAPON_LANCE = 6;        // Pierce — boring a 20-inch hole with a lance
const YI_WEAPON_WHIP = 7;         // Lash — ripping flesh to strips with a whip
const YI_WEAPON_SCYTHE = 8;       // Slash — lacerating through space with a scythe

const YI_WEAPONS = [
  "HATCHET", "STILETTO", "BASTARD SWORD", "RAPIER", "HAMMER",
  "GREATSWORD", "LANCE", "WHIP", "SCYTHE",
];
const YI_WEAPON_BLUNT = [YI_WEAPON_HATCHET, YI_WEAPON_HAMMER];
const YI_WEAPON_PIERCE = [YI_WEAPON_STILETTO, YI_WEAPON_RAPIER, YI_WEAPON_LANCE];
const YI_WEAPON_SLASH = [YI_WEAPON_BASTARD, YI_WEAPON_GREATSWORD, YI_WEAPON_SCYTHE];
/* the whip is its own animal: it is not swung, it is thrown — a wide overhead lash */
const YI_WEAPON_LASH = [YI_WEAPON_WHIP];

/* ---------------------------------------------------------
   ATTACK ANIMATION — every vessel is swung its own way, in
   three beats. The Oracle picks the beat from the horror in
   front of it: an untouched horror takes the opening beat
   (even when one blow would end it), a horror already cut
   takes the follow-through, and a follow-through that will
   end it takes the finisher. A vessel answers three swings
   before the wheel draws another.

   A timeline is normalized to the swing (t 0..1) and read as
   channels, so the same table drives the arm, the stance and
   the light of the cut on every client:
     arm    : shoulder swing, -1..1 (times YI_ARM_ARC radians)
     thrust : hand driven at the target, 0..1
     two    : second hand on the haft, 0..1
     crouch : stance dropped and pulled back, 0..1
     dash   : body carried along the aim, px (a flourish, not a teleport)
     form   : how far the Vial has congealed, 0..1
   fx says when a cut is born: at = start of that beat, d = its share of
   the swing, kind = arc | stab | slam | lash, dir = which way it sweeps.
   push is a real lunge: wait seconds, then spd for t seconds.
   --------------------------------------------------------- */
const YI_ARM_ARC = 0.78;
const YI_ANIM_CH = ["arm", "thrust", "two", "crouch", "dash", "form"];
const YI_COMBO_ANIM = [
  /* ---- HATCHET — low and angled, then a big upswing; then a side cut;
     the finisher is the upswing again with his weight behind it ---- */
  [
    { life: 0.34, keys: [
      { t: 0.00, arm: -0.20 },
      { t: 0.22, arm: -0.95, two: 0.15, crouch: 0.30 },
      { t: 0.42, arm: -1.00, crouch: 0.35 },
      { t: 0.62, arm: 0.55, crouch: 0.05 },
      { t: 0.74, arm: 1.00 },
      { t: 1.00, arm: 0.70 }],
      fx: [{ at: 0.50, kind: "arc", dir: -1, scale: 1.05 }] },
    { life: 0.32, keys: [
      { t: 0.00, arm: 0.85 },
      { t: 0.30, arm: 0.95, crouch: 0.20 },
      { t: 0.55, arm: -0.25 },
      { t: 0.72, arm: -0.95 },
      { t: 1.00, arm: -0.80 }],
      fx: [{ at: 0.42, kind: "arc", dir: 1 }] },
    { life: 0.40, keys: [
      { t: 0.00, arm: -0.20 },
      { t: 0.20, arm: -0.95, crouch: 0.30 },
      { t: 0.38, arm: -1.00, crouch: 0.35 },
      { t: 0.56, arm: 0.50, dash: 10 },
      { t: 0.70, arm: 1.00, dash: 26 },
      { t: 1.00, arm: 0.80, dash: 18 }],
      fx: [{ at: 0.46, kind: "arc", dir: -1, scale: 1.15 },
           { at: 0.70, kind: "arc", dir: -1, scale: 1.30, d: 0.26 }],
      push: { wait: 0.10, spd: 520, t: 0.26 }, hold: 0.12 },
  ],
  /* ---- STILETTO — only ever a thrust. The finisher carries him in ---- */
  [
    { life: 0.22, keys: [
      { t: 0.00, thrust: 0.00, arm: 0.05 },
      { t: 0.18, thrust: 0.10, arm: 0.12 },
      { t: 0.45, thrust: 1.00, arm: 0.00 },
      { t: 0.70, thrust: 0.35 },
      { t: 1.00, thrust: 0.00 }],
      fx: [{ at: 0.28, kind: "stab", d: 0.30 }],
      push: { wait: 0.02, spd: 150, t: 0.12 } },
    { life: 0.22, keys: [
      { t: 0.00, thrust: 0.00 },
      { t: 0.16, thrust: 0.12 },
      { t: 0.42, thrust: 1.00 },
      { t: 0.68, thrust: 0.30 },
      { t: 1.00, thrust: 0.00 }],
      fx: [{ at: 0.26, kind: "stab", d: 0.30 }],
      push: { wait: 0.02, spd: 175, t: 0.12 } },
    { life: 0.32, keys: [
      { t: 0.00, thrust: 0.00, crouch: 0.10 },
      { t: 0.14, thrust: 0.12, crouch: 0.20 },
      { t: 0.40, thrust: 1.15, dash: 16 },
      { t: 0.72, thrust: 0.90, dash: 34 },
      { t: 1.00, thrust: 0.15, dash: 30 }],
      fx: [{ at: 0.24, kind: "stab", scale: 1.15, d: 0.34 }],
      push: { wait: 0.06, spd: 470, t: 0.24 }, hold: 0.10 },
  ],
  /* ---- BASTARD SWORD — raised, then down; then two fast side cuts,
     the first carrying him behind the target; then both hands ---- */
  [
    { life: 0.32, keys: [
      { t: 0.00, arm: 0.20 },
      { t: 0.30, arm: 0.95, crouch: 0.15, two: 0.30 },
      { t: 0.45, arm: 1.05, two: 0.30 },
      { t: 0.62, arm: -0.20 },
      { t: 0.78, arm: -1.00 },
      { t: 1.00, arm: -0.85 }],
      fx: [{ at: 0.52, kind: "arc", dir: 1, scale: 1.05 }] },
    { life: 0.38, keys: [
      { t: 0.00, arm: 0.70 },
      { t: 0.14, arm: 1.00, two: 0.20 },
      { t: 0.30, arm: -0.60, dash: 30 },
      { t: 0.44, arm: -1.00, dash: 45 },
      { t: 0.56, arm: -0.85, dash: 40 },
      { t: 0.70, arm: 0.90, dash: 14 },
      { t: 0.84, arm: 1.00, dash: 6 },
      { t: 1.00, arm: 0.60, dash: 0 }],
      fx: [{ at: 0.16, kind: "arc", dir: 1 },
           { at: 0.62, kind: "arc", dir: -1 }] },
    { life: 0.44, keys: [
      { t: 0.00, arm: 0.15, two: 0.70 },
      { t: 0.32, arm: 1.00, two: 1, crouch: 0.20 },
      { t: 0.50, arm: 1.10, two: 1 },
      { t: 0.68, arm: -0.40, two: 1 },
      { t: 0.82, arm: -1.05, two: 0.90, crouch: 0.15 },
      { t: 1.00, arm: -0.80, two: 0.50 }],
      fx: [{ at: 0.55, kind: "arc", dir: 1, scale: 1.15 }], hold: 0.10 },
  ],
  /* ---- RAPIER — the long puncture that lifts; a flurry of needles;
     the last thrust throws him through ---- */
  [
    { life: 0.26, keys: [
      { t: 0.00, thrust: 0.00, arm: -0.10, crouch: 0.20 },
      { t: 0.20, thrust: 0.15, arm: -0.20, crouch: 0.35 },
      { t: 0.45, thrust: 1.10, arm: 0.35 },
      { t: 0.70, thrust: 0.60, arm: 0.45 },
      { t: 1.00, thrust: 0.00, arm: 0.20 }],
      fx: [{ at: 0.28, kind: "stab", scale: 1.15, d: 0.34 }] },
    { life: 0.36, keys: [
      { t: 0.00, thrust: 0.00 },
      { t: 0.18, thrust: 0.90 },
      { t: 0.30, thrust: 0.25 },
      { t: 0.46, thrust: 0.95 },
      { t: 0.58, thrust: 0.30 },
      { t: 0.74, thrust: 1.00 },
      { t: 0.88, thrust: 0.40 },
      { t: 1.00, thrust: 0.10 }],
      fx: [{ at: 0.12, kind: "stab", d: 0.22 },
           { at: 0.40, kind: "stab", d: 0.20 },
           { at: 0.68, kind: "stab", scale: 1.10, d: 0.22 }],
      push: { wait: 0.04, spd: 120, t: 0.14 } },
    { life: 0.38, keys: [
      { t: 0.00, thrust: 0.00, crouch: 0.25 },
      { t: 0.18, thrust: 0.15, crouch: 0.40 },
      { t: 0.40, thrust: 1.20, dash: 20 },
      { t: 0.70, thrust: 1.20, dash: 48 },
      { t: 1.00, thrust: 0.20, dash: 44 }],
      fx: [{ at: 0.24, kind: "stab", scale: 1.30, d: 0.40 }],
      push: { wait: 0.08, spd: 560, t: 0.30 }, hold: 0.12 },
  ],
  /* ---- HAMMER — one swing, three times. The finisher plants its feet ---- */
  [
    { life: 0.36, keys: [
      { t: 0.00, arm: 0.40, two: 0.30 },
      { t: 0.34, arm: 1.05, crouch: 0.30 },
      { t: 0.46, arm: 1.15, crouch: 0.32 },
      { t: 0.64, arm: -0.55 },
      { t: 0.80, arm: -1.05, crouch: 0.20 },
      { t: 1.00, arm: -0.90 }],
      fx: [{ at: 0.54, kind: "slam", scale: 1.10 }] },
    { life: 0.36, keys: [
      { t: 0.00, arm: 0.40, two: 0.30 },
      { t: 0.34, arm: 1.05, crouch: 0.30 },
      { t: 0.46, arm: 1.15, crouch: 0.32 },
      { t: 0.64, arm: -0.55 },
      { t: 0.80, arm: -1.05, crouch: 0.20 },
      { t: 1.00, arm: -0.90 }],
      fx: [{ at: 0.54, kind: "slam", scale: 1.10 }] },
    { life: 0.42, keys: [
      { t: 0.00, arm: 0.40, two: 0.70 },
      { t: 0.34, arm: 1.05, two: 1, crouch: 0.36 },
      { t: 0.46, arm: 1.15, two: 1, crouch: 0.38 },
      { t: 0.64, arm: -0.55, two: 1 },
      { t: 0.80, arm: -1.05, two: 0.90, crouch: 0.26 },
      { t: 1.00, arm: -0.90, two: 0.60 }],
      fx: [{ at: 0.54, kind: "slam", scale: 1.25 }], hold: 0.10 },
  ],
  /* ---- GREATSWORD — a held caduceus, then the blade; a side cut;
     then the whole mass of it ---- */
  [
    { life: 0.40, keys: [
      { t: 0.00, arm: 0.00, thrust: 0.15, form: 0.15 },
      { t: 0.16, arm: -0.05, thrust: 0.20, form: 0.15 },
      { t: 0.30, arm: 0.90, form: 1, two: 0.40, crouch: 0.15 },
      { t: 0.44, arm: 1.05, form: 1, two: 0.50 },
      { t: 0.62, arm: -0.30, form: 1, two: 0.50 },
      { t: 0.80, arm: -1.05, form: 1, two: 0.40 },
      { t: 1.00, arm: -0.85, form: 1, two: 0.20 }],
      fx: [{ at: 0.54, kind: "arc", dir: 1, scale: 1.10 }] },
    { life: 0.36, keys: [
      { t: 0.00, arm: 0.80, form: 1, two: 0.40 },
      { t: 0.28, arm: 1.00, form: 1, two: 0.50, crouch: 0.15 },
      { t: 0.60, arm: -0.70, form: 1, two: 0.30 },
      { t: 0.82, arm: -1.00, form: 1, two: 0.20 },
      { t: 1.00, arm: -0.85, form: 1, two: 0.20 }],
      fx: [{ at: 0.44, kind: "arc", dir: 1, scale: 1.10 }] },
    { life: 0.48, keys: [
      { t: 0.00, arm: 0.10, form: 0.60, two: 0.80 },
      { t: 0.30, arm: 0.95, form: 1, two: 1, crouch: 0.20 },
      { t: 0.46, arm: 1.10, form: 1, two: 1 },
      { t: 0.66, arm: -0.50, form: 1, two: 1 },
      { t: 0.82, arm: -1.10, form: 1, two: 0.80, crouch: 0.20 },
      { t: 1.00, arm: -0.90, form: 1, two: 0.60 }],
      fx: [{ at: 0.56, kind: "arc", dir: 1, scale: 1.22 }], hold: 0.14 },
  ],
  /* ---- LANCE — the propelling point. Only the last one carries him
     all the way past the target ---- */
  [
    { life: 0.28, keys: [
      { t: 0.00, thrust: 0.00, crouch: 0.15 },
      { t: 0.22, thrust: 0.15, crouch: 0.25 },
      { t: 0.48, thrust: 1.00, arm: 0.05 },
      { t: 0.74, thrust: 0.40 },
      { t: 1.00, thrust: 0.00 }],
      fx: [{ at: 0.30, kind: "stab", scale: 1.10, d: 0.34 }] },
    { life: 0.32, keys: [
      { t: 0.00, thrust: 0.00, crouch: 0.12 },
      { t: 0.20, thrust: 0.18, crouch: 0.22 },
      { t: 0.46, thrust: 1.05, arm: 0.04 },
      { t: 0.72, thrust: 0.45 },
      { t: 1.00, thrust: 0.00 }],
      fx: [{ at: 0.28, kind: "stab", scale: 1.15, d: 0.34 }] },
    { life: 0.44, keys: [
      { t: 0.00, thrust: 0.00, crouch: 0.30 },
      { t: 0.20, thrust: 0.20, crouch: 0.40 },
      { t: 0.46, thrust: 1.25, dash: 10 },
      { t: 0.72, thrust: 1.25, dash: 90 },
      { t: 1.00, thrust: 0.20, dash: 110 }],
      fx: [{ at: 0.26, kind: "stab", scale: 1.38, d: 0.44 }],
      push: { wait: 0.08, spd: 620, t: 0.30 }, hold: 0.14 },
  ],
  /* ---- WHIP — two cracks; one crack; a storm of side cracks that
     finishes overhead ---- */
  [
    { life: 0.32, keys: [
      { t: 0.00, arm: 0.60 },
      { t: 0.20, arm: 1.00, crouch: 0.10 },
      { t: 0.34, arm: -0.60 },
      { t: 0.46, arm: -0.95 },
      { t: 0.58, arm: 0.80 },
      { t: 0.74, arm: 1.00 },
      { t: 1.00, arm: 0.40 }],
      fx: [{ at: 0.10, kind: "lash", dir: 1, d: 0.24 },
           { at: 0.58, kind: "lash", dir: -1, d: 0.24 }] },
    { life: 0.24, keys: [
      { t: 0.00, arm: 0.80 },
      { t: 0.24, arm: 1.00 },
      { t: 0.60, arm: -0.90 },
      { t: 1.00, arm: -0.60 }],
      fx: [{ at: 0.28, kind: "lash", dir: 1, d: 0.30 }] },
    { life: 0.52, keys: [
      { t: 0.00, arm: 0.70 },
      { t: 0.14, arm: 1.00 },
      { t: 0.26, arm: -0.80 },
      { t: 0.38, arm: -1.00 },
      { t: 0.50, arm: 0.90 },
      { t: 0.62, arm: 1.00 },
      { t: 0.74, arm: -0.50 },
      { t: 0.82, arm: 1.15, crouch: 0.10 },
      { t: 0.92, arm: -0.95, crouch: 0.30 },
      { t: 1.00, arm: -0.70, crouch: 0.25 }],
      fx: [{ at: 0.06, kind: "lash", dir: -1, d: 0.20 },
           { at: 0.28, kind: "lash", dir: 1, d: 0.20 },
           { at: 0.48, kind: "lash", dir: -1, d: 0.20 },
           { at: 0.84, kind: "slam", scale: 1.10, d: 0.20 }],
      hold: 0.10 },
  ],
  /* ---- SCYTHE — a cut that halts halfway and then thinks better of it;
     a side cut; then the long Reaper finish that leaves him crouched.
     The fourth entry is Furioso-Replica's own vastly different cut. ---- */
  [
    { life: 0.30, keys: [
      { t: 0.00, arm: 0.60 },
      { t: 0.24, arm: 0.90 },
      { t: 0.46, arm: -0.15 },
      { t: 0.62, arm: -0.18 },
      { t: 0.82, arm: -0.95 },
      { t: 1.00, arm: -0.80 }],
      fx: [{ at: 0.34, kind: "arc", dir: 1, scale: 0.90, d: 0.28 },
           { at: 0.64, kind: "arc", dir: 1, scale: 1.10, d: 0.30 }] },
    { life: 0.26, keys: [
      { t: 0.00, arm: -0.80 },
      { t: 0.30, arm: -0.95 },
      { t: 0.62, arm: 0.70 },
      { t: 0.84, arm: 1.00 },
      { t: 1.00, arm: 0.80 }],
      fx: [{ at: 0.36, kind: "arc", dir: -1, scale: 1.00 }] },
    { life: 0.52, keys: [
      { t: 0.00, arm: 0.50 },
      { t: 0.12, arm: 0.95 },
      { t: 0.24, arm: -0.70 },
      { t: 0.36, arm: -1.00 },
      { t: 0.46, arm: 0.85 },
      { t: 0.58, arm: 1.00 },
      { t: 0.68, arm: -0.20, crouch: 0.30 },
      { t: 0.78, arm: 0.60, crouch: 0.50, dash: 18 },
      { t: 0.86, arm: -1.00, crouch: 0.80, dash: 55 },
      { t: 1.00, arm: -1.10, crouch: 1.00, dash: 60 }],
      fx: [{ at: 0.04, kind: "arc", dir: -1, d: 0.20 },
           { at: 0.26, kind: "arc", dir: 1, d: 0.20 },
           { at: 0.44, kind: "arc", dir: -1, d: 0.20 },
           { at: 0.60, kind: "arc", dir: 1, d: 0.18 },
           { at: 0.74, kind: "arc", dir: -1, scale: 1.20, d: 0.24 },
           { at: 0.86, kind: "slam", scale: 1.30, d: 0.22 }],
      push: { wait: 0.10, spd: 620, t: 0.32 }, hold: 0.55 },
    { life: 0.64, furioso: true, keys: [
      { t: 0.00, arm: 0.30, crouch: 0.40 },
      { t: 0.12, arm: 0.70, crouch: 0.60 },
      { t: 0.20, arm: -1.20, crouch: 0.80 },
      { t: 0.30, arm: 1.20 },
      { t: 0.42, arm: -1.20 },
      { t: 0.54, arm: 1.20 },
      { t: 0.66, arm: -1.20 },
      { t: 0.78, arm: 1.20, dash: 30 },
      { t: 0.90, arm: -1.40, crouch: 1.00, dash: 50 },
      { t: 1.00, arm: -1.40, crouch: 1.00, dash: 55 }],
      fx: [{ at: 0.10, kind: "arc", dir: 1, d: 0.20 }],
      push: { wait: 0.12, spd: 580, t: 0.34 }, hold: 0.40 },
  ],
];
/* fill the channels a key does not name, and nail the ends down */
function yiNormAnims() {
  for (const family of YI_COMBO_ANIM) for (const def of family) {
    let cur = { arm: 0, thrust: 0, two: 0, crouch: 0, dash: 0, form: 1 };
    for (const key of def.keys) {
      for (const ch of YI_ANIM_CH)
        key[ch] = key[ch] === undefined ? cur[ch] : key[ch];
      cur = key;
    }
    const first = def.keys[0], last = def.keys[def.keys.length - 1];
    if (first.t > 0) def.keys.unshift(Object.assign({}, first, { t: 0 }));
    if (last.t < 1) def.keys.push(Object.assign({}, last, { t: 1 }));
    if (def.life === undefined) def.life = YI_SLASH_LIFE;
  }
}
yiNormAnims();

function yiComboAnim(w, i) {
  const family = YI_COMBO_ANIM[w] || YI_COMBO_ANIM[YI_WEAPON_BASTARD];
  return family[Math.max(0, Math.min(family.length - 1, i | 0))];
}
/* smoothstep between the two keys that bracket this instant */
function yiSampleAnim(keys, k) {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= k) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t;
  let u = span > 0 ? (k - a.t) / span : 1;
  u = clamp(u, 0, 1);
  u = u * u * (3 - 2 * u);
  const out = {};
  for (const ch of YI_ANIM_CH) out[ch] = a[ch] + (b[ch] - a[ch]) * u;
  return out;
}
/* the pose at this instant. Pure in (weapon, combo, swing clock), so the
   host and every guest read the same frame without syncing keyframes. */
function yiAnimState(p) {
  const w = p.yiWeapon == null ? YI_WEAPON_BASTARD : clamp(p.yiWeapon | 0, 0, 8);
  const def = yiComboAnim(w, p.yiComboIdx || 0);
  const life = (p.yiAnimLife > 0) ? p.yiAnimLife : def.life;
  const swinging = (p.yiSlashT || 0) > 0;
  const holding = !swinging && (p.yiHoldT || 0) > 0;
  const k = swinging ? clamp(1 - p.yiSlashT / life, 0, 1) : (holding ? 1 : 0);
  const s = swinging || holding ? yiSampleAnim(def.keys, k)
    : { arm: 0, thrust: 0, two: 0, crouch: 0, dash: 0, form: 1 };
  s.k = k;
  s.life = life;
  s.swinging = swinging || holding;
  s.holding = holding;
  s.weapon = w;
  s.def = def;
  s.furioso = !!def.furioso;
  return s;
}
function yiFxKind(w) {
  if (YI_WEAPON_PIERCE.indexOf(w) >= 0) return "stab";
  if (YI_WEAPON_LASH.indexOf(w) >= 0) return "lash";
  if (YI_WEAPON_BLUNT.indexOf(w) >= 0) return "slam";
  return "arc";
}

/* per-weapon ledger — damage, rate (× base), reach, knock, and the rider
   each cut pays out. rate > 1 swings faster; reach in px; knock × base. */
const YI_WEAPON_DATA = [
  /* HATCHET — blunt, +50% knock, slows, 2 Poise. The opening wheel has no dud:
     even the lightest vessel still cuts a little harder than the bare blade. */
  { type: "blunt", dmg: 1.04, rate: 0.9, reach: 100, knock: 1.5, poise: 2, slow: 0.6 },
  /* STILETTO — pierce, lays three Sinking Potency (1 base + 2) and a longer Count */
  { type: "pierce", dmg: 1.04, rate: 1.2, reach: 90, knock: 1.0 },
  /* BASTARD SWORD — slash, +7.5% dmg, Offense Level +1 */
  { type: "slash", dmg: 1.075, rate: 1.0, reach: 105, knock: 1.1, offense: 1 },
  /* RAPIER — pierce, +7.5% dmg, Defence Level Down +1 */
  { type: "pierce", dmg: 1.075, rate: 1.1, reach: 110, knock: 0.9, defDown: 1 },
  /* HAMMER — blunt, +7.5% dmg, Stagger */
  { type: "blunt", dmg: 1.075, rate: 0.75, reach: 95, knock: 1.8, stagger: 1.1 },
  /* GREATSWORD — slash, +15% dmg, Slash Fragility */
  { type: "slash", dmg: 1.15, rate: 0.7, reach: 125, knock: 1.3, frag: "slash" },
  /* LANCE — pierce, +15% dmg, Pierce Fragility, self-propelling */
  { type: "pierce", dmg: 1.15, rate: 0.85, reach: 140, knock: 1.1, frag: "pierce", propel: 1.5 },
  /* WHIP — blunt, +15% dmg, Blunt Fragility, multi-hit */
  { type: "blunt", dmg: 1.15, rate: 1.15, reach: 115, knock: 0.8, frag: "blunt", multi: true },
  /* SCYTHE — slash, +30% dmg, guaranteed crit */
  { type: "slash", dmg: 1.3, rate: 0.8, reach: 130, knock: 1.2, crit: true },
];
function yiWeaponData(w) { return YI_WEAPON_DATA[w] || YI_WEAPON_DATA[0]; }
function yiWeaponRate(w) { return yiWeaponData(w).rate; }
function yiWeaponReach(w) { return yiWeaponData(w).reach; }
function yiWeaponKnock(w) { return yiWeaponData(w).knock; }       // more knockback on the heavy cuts
const YI_HATCHET_SLOW = 0.6;
const YI_HATCHET_POISE = 2;         // official: on hit, gain 2 Poise
const YI_SINKING_T = 4;             // seconds a plain cut's Sinking lasts (RUNEGUN's Count)
const YI_SINKING_DPS = 4;           // damage per Sinking Potency per second
const YI_SINKING_MAX = 5;           // Sinking Potency soft cap
const YI_HIT_SINKING = 1;           // every landed cut lays one Sinking Potency (his base skills all sank)
const YI_STILETTO_SINKING = 2;      // the stiletto lays two more — three Potency in one thrust
const YI_STILETTO_SINK_T = 6;       // ...and holds a longer Count than a plain cut
const YI_RAPIER_DEFDOWN = 0.10;     // defence punctured: +10% damage taken per stack
const YI_RAPIER_DEFDOWN_TIME = 3;
const YI_RAPIER_DEFDOWN_MAX = 2;
const YI_HAMMER_STAGGER = 1.1;      // target can't act for this long
const YI_FRAG_DMG = 0.10;           // typed Fragility: +10% from that damage type per stack
const YI_FRAG_TIME = 4;
const YI_FRAG_MAX = 2;
const YI_OFFENSE_DMG = 0.10;        // each Offense Level adds +10% damage
const YI_OFFENSE_MAX = 2;
const YI_OFFENSE_TIME = 3;

/* the vessel's own multiplier — one table, so the arc and the PvP cut agree */
function yiWeaponMul(w) { return yiWeaponData(w).dmg; }
/* which Fragility a vessel lays, and which blades drink from it */
function yiWeaponFragType(w) {
  if (w === YI_WEAPON_BASTARD || w === YI_WEAPON_GREATSWORD || w === YI_WEAPON_SCYTHE) return "slash";
  if (w === YI_WEAPON_STILETTO || w === YI_WEAPON_RAPIER || w === YI_WEAPON_LANCE) return "pierce";
  if (w === YI_WEAPON_HATCHET || w === YI_WEAPON_HAMMER || w === YI_WEAPON_WHIP) return "blunt";
  return "";
}

/* --- the arc's color tracks the weapon it was swung with --- */
function yiArcColor(w) {
  switch (w) {
    case YI_WEAPON_HATCHET:   return "#e0915a"; // copper
    case YI_WEAPON_STILETTO:  return "#8f6bff"; // gloom violet
    case YI_WEAPON_BASTARD:   return "#f2f4f6"; // pale steel
    case YI_WEAPON_RAPIER:    return "#b9c8e2"; // cold steel-blue
    case YI_WEAPON_HAMMER:    return "#9e9ea2"; // iron
    case YI_WEAPON_GREATSWORD:return "#d4d8de"; // greatsword steel
    case YI_WEAPON_LANCE:     return "#a8d4ff"; // pale blue lance
    case YI_WEAPON_WHIP:      return "#ff9a3d"; // hot whip
    case YI_WEAPON_SCYTHE:    return "#b8f6ff"; // scythe-white
    default:                  return "#f2f4f6";
  }
}
function yiArcTail(w) {
  switch (w) {
    case YI_WEAPON_HATCHET:   return "#c07a44";
    case YI_WEAPON_STILETTO:  return "#5f3bd8";
    case YI_WEAPON_BASTARD:   return "#c8ccd2";
    case YI_WEAPON_RAPIER:    return "#8290ac";
    case YI_WEAPON_HAMMER:    return "#646468";
    case YI_WEAPON_GREATSWORD:return "#a6abb4";
    case YI_WEAPON_LANCE:     return "#6a93b8";
    case YI_WEAPON_WHIP:      return "#c06624";
    case YI_WEAPON_SCYTHE:    return "#7ad4e4";
    default:                  return "#c8ccd2";
  }
}
const YI_COL = {
  suit: "#17171c", suitHi: "#2b2b33", suitDark: "#0d0d11",
  shirt: "#f2efe8", glove: "#f2efe8", skin: "#efe7da",
  gold: "#d9b65c", glass: "#ffdf8a", glassDeep: "#a97a2f",
  blood: "#a3212a", bloodHi: "#c9353d",
  gloom: "#7a5bd8",
  arc: "#ffe9a8", arcEdge: "#fffdf2", arcTail: "#caa95c",
  mark: "#7ec0ff", markCore: "#101016",
};

function yiVitals(p) {
  if (!p) return;
  if (p.yiSlashT === undefined) p.yiSlashT = 0;
  if (p.yiGrace === undefined) p.yiGrace = 0;
  if (p.yiKarmic === undefined) p.yiKarmic = 0;
  if (p.yiMarkT === undefined) p.yiMarkT = 0;
  if (p.yiMarkCd === undefined) p.yiMarkCd = YI_MARK_FIRST;
  if (p.yiMarkId === undefined) p.yiMarkId = null;
  if (p.yiWeapon === undefined) p.yiWeapon = YI_WEAPON_BASTARD;
  if (p.yiSlashAng === undefined) p.yiSlashAng = 0;
  if (p.yiSlashDir === undefined) p.yiSlashDir = 1;
  if (p.yiSlashReach === undefined) p.yiSlashReach = YI_REACH_BASE;
  if (p.yiComboIdx === undefined) p.yiComboIdx = 0;
  if (p.yiAnimLife === undefined) p.yiAnimLife = YI_SLASH_LIFE;
  if (p.yiHoldT === undefined) p.yiHoldT = 0;
  if (p.yiComboGap === undefined) p.yiComboGap = 0;
  if (p.yiPropelWait === undefined) p.yiPropelWait = 0;
  if (p.yiPropelDur === undefined) p.yiPropelDur = 0;
  if (p.yiPoise === undefined) p.yiPoise = 0;
  if (p.yiOffenseS === undefined) p.yiOffenseS = 0;
  if (p.yiOffenseT === undefined) p.yiOffenseT = 0;
  if (p.yiUnlockTier === undefined) p.yiUnlockTier = 0;
  if (p.yiDevice === undefined) p.yiDevice = 1;
  if (p.yiProc === undefined) p.yiProc = 0;
  if (p.yiProcReady === undefined) p.yiProcReady = false;
  if (p.yiProcMaxed === undefined) p.yiProcMaxed = false;
  if (p.yiDevice4T === undefined) p.yiDevice4T = 0;
  if (p.yiGraceStruck === undefined) p.yiGraceStruck = false;
  if (p.yiTurnHermesGained === undefined) p.yiTurnHermesGained = false;
  if (p.yiTurnHealed === undefined) p.yiTurnHealed = false;
  if (p.yiDevice4T === undefined) p.yiDevice4T = 0;
  /* the casing: 0 none, 1 Wound-casing Mask, 2 Sizzling Wound */
  if (p.yiWoundState === undefined) p.yiWoundState = 0;
  if (p.yiSizzleVoice === undefined) p.yiSizzleVoice = 1;
  if (p.yiMaskWave === undefined) p.yiMaskWave = -1;
  if (p.yiMaskStagger === undefined) p.yiMaskStagger = false;
  if (p.yiShinSeen === undefined) p.yiShinSeen = false;
  if (p.yiWoundDotT === undefined) p.yiWoundDotT = 0;
  if (p.yiWoundDotTick === undefined) p.yiWoundDotTick = 0;
  if (p.yiWoundDotDps === undefined) p.yiWoundDotDps = 0;
  /* Indulgence in Prescripts — a turn-long blessing; Furioso's first use marks
     the Encounter so the casing can burn through at Turn End */
  if (p.yiIndulge === undefined) p.yiIndulge = false;
  if (p.yiFuriosoSeen === undefined) p.yiFuriosoSeen = false;
}

/* the Prescript's quarry — the strongest horror standing, tracked for the
   Device ledger and the Karmic miss check. The mechanical Mark of the
   Prescript rides Yi's Base Attack Skill (yiMarkT > 0), not this enemy. */
function yiPickMark(p) {
  let best = null, bestHp = -1;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const hp = e.maxHp || e.hp || 0;
    if (hp > bestHp) { bestHp = hp; best = e; }
  }
  return best;
}

function yiFallMark(p) {
  /* MARK OF THE PRESCRIPT on the Base Attack Skill: Yi's basic swing is the
     marked skill for YI_MARK_TIME seconds. No enemy is debuffed. */
  p.yiMarkT = YI_MARK_TIME;
  p.yiMarkId = null;              // no enemy target this iteration
  p.yiGraceStruck = false;        // one Grace per Prescript — the first marked-skill use pays it
  p.yiTurnHermesGained = false;   // has the Prescript been executed this turn (window)?
  p.yiTurnHealed = false;         // Turn End 4-vitality heal already paid this turn?
  /* TURN START — entering this Encounter for the first time, the casing closes
     over him. A new wave is a new Encounter, so the mask is fresh each one. */
  const waveKey = (Game.loop || 0) * 1000 + (Game.wave || 0);
  if (p.yiMaskWave !== waveKey) {
    p.yiMaskWave = waveKey;
    p.yiWoundState = 1;
    p.yiMaskStagger = false;
    p.yiWoundDotT = 0;
    p.yiIndulge = false;
    p.yiFuriosoSeen = false;
    if (p === localPlayer())
      floatText(p.x, p.y - 46, "WOUND-CASING MASK", "#c9a44e", 14);
  }
  /* Sizzling Wound — Turn Start: gain 1 Burn and 1 Bleed */
  if ((p.yiWoundState | 0) === 2) {
    p.yiWoundDotT = YI_WOUND_DOT_T;
    p.yiWoundDotTick = 0;
    p.yiWoundDotDps = YI_WOUND_DOT_DPS;
    if (p === localPlayer())
      floatText(p.x, p.y - 62, "SIZZLING WOUND — BURN & BLEED", "#ff6b3d", 12);
    /* INDULGENCE IN PRESCRIPTS — the wound and Furioso on the Dashboard together
       grant one turn of indulgence */
    const online = (p.yiProc || 0) >= YI_PROC_MAX && !p.yiFuriosoUsed;
    if (online && !p.yiIndulge) {
      p.yiIndulge = true;
      if (p === localPlayer()) {
        floatText(p.x, p.y - 78, "INDULGENCE IN PRESCRIPTS", "#ff9ad5", 14);
        if (typeof toast === "function") toast("INDULGENCE IN PRESCRIPTS — SPEED +5, FURIOSO DEEPENS");
      }
    } else if (!online) {
      p.yiIndulge = false;
    }
  } else {
    p.yiIndulge = false;
  }
  /* TURN START: the Device is handed down for the Unlock already earned. */
  const dev = Math.max(1, Math.min(4, (p.yiUnlockTier || 0) + 1));
  if (dev > (p.yiDevice || 1)) {
    p.yiDevice = dev;
    if (dev >= 4) p.yiDevice4T = YI_MARK_CD;   // Device IV: empty the room before the next
    if (p === localPlayer()) {
      floatText(p.x, p.y - 52, "PRESCRIPT [DEVICE] " + ["I", "II", "III", "IV"][dev - 1], "#7ec0ff", 14);
    }
  }
}

function yiClearMark(p) {
  p.yiMarkT = 0;
  p.yiTurnHermesGained = false;
  p.yiTurnHealed = false;
  p.yiFuriosoUsed = false;      // once-per-turn Furioso re-arms next Prescript window
}

/* Skill 3 / Furioso-Replica — the [Q] ability. At Hermes 9 it becomes
   Furioso-Replica: nine consecutive scythe strikes that burn, bind, and fray
   everything they touch, then must be re-earned. Cancel if nothing is near. */
function yiTrySkill3(p) {
  if (!p || p.char !== "yi") return;
  const guest = typeof Net !== "undefined" && Net.role === "guest";
  if (guest) return;
  if ((p.yiSkill3Cd || 0) > 0) return;
  const furioso = (p.yiProc || 0) >= YI_PROC_MAX && !p.yiFuriosoUsed;
  /* FURIOSO-REPLICA — nine consecutive strikes. If nothing is near enough to
     cut, abort entirely: no Hermes spent, no cooldown paid. */
  if (furioso) {
    const m = p.mods || {};
    const reach = YI_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.8;
    const near = enemies.some(e => !e.dead && !e.ghost && e.spawnT <= 0 && e.team !== "p"
      && Math.hypot(e.x - p.x, e.y - p.y) <= reach + e.r);
    if (!near) return;
  }
  p.yiSkill3Cd = YI_SKILL3_CD;
  yiSkill3Swing(p, p.x, p.y, p.aim, furioso);
}

function yiSkill3Swing(p, x, y, aim, furioso) {
  const m = p.mods || {};
  const weapon = furioso ? YI_WEAPON_SCYTHE : (Math.random() * 9) | 0;
  const reach = YI_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.8;
  const crit = furioso || weapon === YI_WEAPON_SCYTHE;
  const critMul = furioso ? (m.critMul || 2.2) * (1 + YI_FURIOSO_CRIT_BONUS) : (m.critMul || 2.2);
  const marked = p.yiMarkT > 0;
  /* the [Q] cut has its own timeline: S3 is the vessel's finisher, and
     Furioso-Replica is the scythe's fourth and vastly different pattern */
  const comboIdx = furioso ? 3 : 2;
  const anim = yiComboAnim(weapon, comboIdx);
  const animDur = yiWoundAnimDur(p);
  const animLife = anim.life * animDur;
  p.yiWeapon = weapon;
  p.yiComboIdx = comboIdx;
  p.yiAnimLife = animLife;
  p.yiSlashT = animLife;
  p.yiHoldT = (anim.hold || 0) * animDur;
  p.yiSlashAng = aim;
  p.yiSlashDir = Math.random() < 0.5 ? -1 : 1;
  p.yiSlashLanes = null;
  const guestNow = typeof Net !== "undefined" && Net.role === "guest";
  if (anim.push && !guestNow && !furioso) {
    p.yiPropelAng = aim;
    p.yiPropelSpd = anim.push.spd;
    p.yiPropelDur = anim.push.t;
    p.yiPropelWait = anim.push.wait || 0.04;
    p.yiPropelT = 0;
  }
  /* FURIOSO-REPLICA — nine consecutive strikes played one after another.
     Strikes 1-8 each draw a random Oracle weapon; only the ninth is the
     guaranteed scythe with its vastly different finisher animation. The
     burst is queued and driven by yiFuriosoTick, so every strike has its own
     silhouette. Hermes is consumed up front and (9 - hits) is paid back when
     the burst ends. Cancel entirely if nothing is near — no cost. */
  if (furioso) {
    /* GUEST: the host settles the ledger; the guest only sees the animation */
    if (guestNow) {
      yiFuriosoAnim(p, YI_WEAPON_SCYTHE, true, aim);
      return;
    }
    const queue = [];
    for (let s = 0; s < 9; s++) queue.push(s === 8 ? YI_WEAPON_SCYTHE : (Math.random() * 9) | 0);
    p.yiProc = 0;                // spent up front, repaid at the end
    p.yiProcReady = false;
    p.yiFuriosoUsed = true;      // once per Prescript window
    p.yiFuriosoSeen = true;      // the first Furioso of this Encounter burns the casing
    p.yiFuriosoQ = { w: queue, i: 0, t: 0.04, gap: 0.10, hits: 0, struck: [] };
    yiFuriosoAnim(p, queue[0], false, aim);
    if (p === localPlayer()) {
      floatText(p.x, p.y - 44, "FURIOSO-REPLICA", "#ffedb8", 16);
      if (typeof toast === "function") toast("FURIOSO-REPLICA — NINE STRIKES" + (marked ? " · MARKED" : ""));
      /* CLASH START voiceline — the Will of Hermes if the Sizzling Wound is open */
      if (typeof AudioFX !== "undefined" && typeof AudioFX.playVoice === "function") {
        const sizzle = (p.yiWoundState | 0) === 2;
        AudioFX.playVoice(sizzle ? "the-will-of-hermes-furioso-clash-start.wav" : "furioso-clash-start.wav");
      }
    }
    return;
  }
  /* normal Skill 3 — one vessel's finisher */
  const hit = [];
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > YI_HALF_ARC) continue;
    /* Furioso-Replica keeps its own marked rider; basic marked swings are
       scaled only by Grace of the Prescript (+2% per stack, +20% at nine) */
    yiHitEnemy(p, e, x, y, crit, (furioso && marked) ? 1 + YI_FURIOSO_MARK_BONUS : 1, weapon);
    hit.push(e);
  }
  if (Game.pvpMode) {
    for (const foe of players) {
      if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
      const dx = foe.x - x, dy = foe.y - y;
      if (dx * dx + dy * dy > (reach + foe.r) ** 2) continue;
      let delta = Math.atan2(dy, dx) - aim;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(delta) > YI_HALF_ARC) continue;
      hurtPlayer(foe, yiBite(p) * yiWeaponMul(weapon) * (crit ? critMul : 1),
        { x, y, knock: (m.knock || 0) * 0.6 });
    }
  }
  /* GUEST: the host settles the ledger */
  if (typeof Net !== "undefined" && Net.role === "guest") return;
}

/* one beat of Furioso-Replica: the vessel is drawn, the body snaps into its
   silhouette, and the clock starts. The ninth strike is the scythe finisher. */
function yiFuriosoAnim(p, w, last, aim) {
  const animDur = yiWoundAnimDur(p);
  /* strikes 1-8 roll their own beat too; the finisher always uses the scythe's
     fourth, vastly different pattern */
  const comboIdx = last ? 3 : ((Math.random() * 3) | 0);
  const anim = yiComboAnim(w, comboIdx);
  p.yiWeapon = w;
  p.yiComboIdx = comboIdx;
  p.yiAnimLife = anim.life * animDur;
  p.yiSlashT = p.yiAnimLife;
  p.yiHoldT = (anim.hold || 0) * animDur;
  p.yiSlashAng = aim;
  p.yiSlashDir = Math.random() < 0.5 ? -1 : 1;
  p.yiSlashLanes = null;
  if (last && anim.push) {
    p.yiPropelAng = aim;
    p.yiPropelSpd = anim.push.spd;
    p.yiPropelDur = anim.push.t;
    p.yiPropelWait = anim.push.wait || 0.04;
    p.yiPropelT = 0;
  }
}

/* one connecting beat of the burst: every foe in the arc eats the vessel's cut */
function yiFuriosoCut(p, x, y, aim, w, last, q) {
  const m = p.mods || {};
  const reach = YI_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.8;
  const critMul = last ? (m.critMul || 2.2) * (1 + YI_FURIOSO_CRIT_BONUS) : (m.critMul || 2.2);
  let swingHit = false;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > YI_HALF_ARC) continue;
    yiHitEnemy(p, e, x, y, true,
      (1 + YI_FURIOSO_MARK_BONUS) * ((q.i + 2) / 2), w);
    if (!q.struck.includes(e)) q.struck.push(e);
    swingHit = true;
  }
  if (Game.pvpMode) {
    for (const foe of players) {
      if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
      const dx = foe.x - x, dy = foe.y - y;
      if (dx * dx + dy * dy > (reach + foe.r) ** 2) continue;
      let delta = Math.atan2(dy, dx) - aim;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(delta) > YI_HALF_ARC) continue;
      hurtPlayer(foe, yiBite(p) * yiWeaponMul(w) * critMul,
        { x, y, knock: (m.knock || 0) * 0.6 });
      swingHit = true;
    }
  }
  if (swingHit) q.hits++;
}

/* close the burst: bank Poise, repay the strikes that found nothing, and let
   burn / bind / slash Fragility (plus Indulgence's Sinking) settle on everyone
   the flurry touched */
function yiFuriosoFinish(p) {
  const q = p.yiFuriosoQ;
  if (!q) return;
  p.yiFuriosoQ = null;
  const hits = q.hits;
  const refund = Math.max(0, 9 - hits);
  if (typeof Net !== "undefined" && Net.role === "guest") return;
  p.yiProc = Math.min(YI_PROC_MAX, refund);
  p.yiProcReady = false;
  p.yiFuriosoUsed = true;      // once per Prescript window
  p.yiFuriosoSeen = true;      // the first Furioso of this Encounter burns the casing
  p.yiPoise = Math.min(YI_POISE_MAX, (p.yiPoise || 0) + YI_FURIOSO_POISE);
  const indulge = !!p.yiIndulge;
  for (const e of q.struck) {
    if (e.dead) continue;
    e.burnT = Math.max(e.burnT || 0, YI_FURIOSO_BURN_T);
    e.burnDps = Math.max(e.burnDps || 0, YI_FURIOSO_BURN_DPS);
    e.burnBy = p;
    e.paralyzeT = Math.max(e.paralyzeT || 0, YI_FURIOSO_BIND_T);
    if (e.fragT <= 0 || e.fragType !== "slash") { e.fragType = "slash"; e.fragStacks = 1; }
    else { e.fragStacks = Math.min(YI_FRAG_MAX, (e.fragStacks || 0) + 1); }
    e.fragT = Math.max(e.fragT || 0, YI_FRAG_TIME);
    if (indulge) {
      /* +1 Sinking Potency, +3 Sinking Count (once per target), and Poise */
      e.sinkingStacks = Math.min(9, (e.sinkingStacks || 0) + YI_INDULGE_SINK_POT);
      e.sinkingT = Math.min(12, (e.sinkingT || 0) + YI_INDULGE_SINK_COUNT);
      e.sinkingDps = Math.max(e.sinkingDps || 0, YI_SINKING_DPS);
      e.sinkingBy = p;
      p.yiPoise = Math.min(YI_POISE_MAX, (p.yiPoise || 0) + YI_INDULGE_POISE);
    }
  }
  if (p === localPlayer()) {
    if (refund > 0) floatText(p.x, p.y - 60, "+" + refund + " HERMES", "#7ec0ff", 13);
    if (typeof toast === "function") toast("FURIOSO-REPLICA — " + hits + "/9 STRIKES, +" + refund + " HERMES");
    /* AFTER ATTACK voiceline — when the Sizzling Wound is open, Yi hears the waves */
    if (typeof AudioFX !== "undefined" && typeof AudioFX.playVoice === "function") {
      const sizzle = (p.yiWoundState | 0) === 2;
      AudioFX.playVoice(sizzle ? "sizzle-furioso-after.wav" : "furioso-after-last-coin.wav");
    }
  }
}

/* drive the queued burst: one strike per gap, each re-aimed at whatever is
   nearest so the flurry tracks the target he has actually chosen */
function yiFuriosoTick(p, dt) {
  const q = p.yiFuriosoQ;
  if (!q) return;
  if ((p.hp || 0) <= 0 || p.downed || p.gone) { p.yiFuriosoQ = null; return; }
  q.t -= dt;
  if (q.t > 0) return;
  const last = q.i >= q.w.length - 1;
  const w = q.w[q.i] || YI_WEAPON_SCYTHE;
  /* re-aim each beat at the closest body still standing in reach */
  const m = p.mods || {};
  const reach = YI_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.8;
  let aim = p.yiSlashAng || p.aim || 0;
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = dx * dx + dy * dy;
    if (d > (reach + e.r) ** 2) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) aim = Math.atan2(best.y - p.y, best.x - p.x);
  yiFuriosoAnim(p, w, last, aim);
  yiFuriosoCut(p, p.x, p.y, aim, w, last, q);
  /* LAST COIN voiceline — the ninth strike of Furioso-Replica (only with Sizzling Wound open) */
  if (last && p === localPlayer() && typeof AudioFX !== "undefined" && typeof AudioFX.playVoice === "function") {
    if ((p.yiWoundState | 0) === 2) AudioFX.playVoice("furioso-last-coin-sizzle.wav");
  }
  q.i++;
  if (q.i >= q.w.length) { yiFuriosoFinish(p); return; }
  q.t = q.gap;
}

/* Grace of the Prescript — three unlocks and the full payout */
function yiGraceTier(p) {
  const g = p.yiGrace || 0;
  if (g >= YI_GRACE_TIER_9) return 3;
  if (g >= YI_GRACE_TIER_6) return 2;
  if (g >= YI_GRACE_TIER_3) return 1;
  return 0;
}
/* Grace damage on marked skills: +2% per Grace (max 16%). At 9 Grace,
   Base Skills deal +20% instead. Only applies while the Prescript marks
   the Base Attack Skill (yiMarkT > 0). */
function yiGraceBonus(p) {
  const g = p.yiGrace || 0;
  if (g >= YI_GRACE_TIER_9) return YI_GRACE_BASE_DMG;
  if (p.yiMarkT > 0) return Math.min(0.16, g * YI_GRACE_PER_STACK);
  return 0;
}
/* Unlock's defence rider — the guard a stage of Grace holds over him */
function yiUnlockGuard(p) {
  if (!p || p.char !== "yi") return 0;
  return YI_UNLOCK_GUARD[yiGraceTier(p)];
}
/* PRESCRIPT [DEVICE]: the ceiling Grace may reach. Handed down at the start
   of a Prescript (turn start). Device III repeats until PROCURATION [HERMES]
   reaches nine — only then does the sixth Grace step open into the ninth. */
function yiGraceCap(p) {
  const d = Math.min(4, Math.max(1, p.yiDevice || 1));
  let cap = YI_GRACE_CAP[d - 1];
  if (cap >= 9 && !p.yiProcMaxed) cap = 6;
  return cap;
}
/* Grace is banked through the Device — it can never overrun its ceiling */
function yiAddGrace(p, n) {
  const cap = yiGraceCap(p);
  const was = Math.min(YI_GRACE_MAX, p.yiGrace || 0);
  const g = was >= cap ? was : Math.min(cap, was + n);
  p.yiGrace = g;
  return g - was;
}
/* PROCURATION [HERMES] — eight until Unlock II, then nine */
function yiProcCap(p) {
  return (p.yiUnlockTier || 0) >= 2 ? YI_PROC_MAX : YI_PROC_CAP_LOW;
}
/* Device III repeats until Hermes is full; the moment it is, the Prescript pays
   the last steps of Grace up to the ceiling. If the Device has not caught up,
   the payment waits. */
function yiGrantHermesGrace(p) {
  if (!p.yiProcMaxed) return 0;
  if (yiGraceCap(p) < YI_GRACE_MAX) return 0;
  const gap = YI_GRACE_MAX - Math.min(YI_GRACE_MAX, p.yiGrace || 0);
  return gap > 0 ? yiAddGrace(p, gap) : 0;
}

/* the turn Grace crosses 3 / 6 / 9, the Prescript grants an Unlock and Yi Sang
   speaks its line. One voiceline per tier; the tally re-arms if Grace ever drops. */
let yiUnlockSounds = null;
let yiVoiceTimer = null;
/* the three lines are short files under public/audio — loaded lazily, once */
function yiUnlockVoices() {
  if (yiUnlockSounds || typeof Audio === "undefined") return yiUnlockSounds;
  yiUnlockSounds = [
    new Audio("audio/mugamuchu.wav"),
    new Audio("audio/abikyokan.wav"),
    new Audio("audio/shirimetsuretsu.wav"),
  ];
  for (const a of yiUnlockSounds) a.preload = "auto";
  return yiUnlockSounds;
}
function yiPlayUnlockVoice(tier) {
  try {
    const list = yiUnlockVoices();
    if (!list) return;
    const a = list[tier - 1];
    if (!a) return;
    /* one voice at a time — a second Unlock cuts the first short */
    for (const v of list) {
      if (v === a) continue;
      try { v.pause(); v.currentTime = 0; } catch (e) { /* never loaded */ }
    }
    a.currentTime = 0;
    a.volume = 0.8;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});
  } catch (e) { /* a muted device is no reason to break the turn */ }
}
function yiSayUnlock(u) {
  yiPlayUnlockVoice(u.tier);
  if (typeof document === "undefined" || typeof $ !== "function") return;
  const box = $("yiVoice");
  if (!box) return;
  const tierEl = $("yiVoiceTier"), lineEl = $("yiVoiceLine"), kanjiEl = $("yiVoiceKanji");
  if (tierEl) tierEl.textContent = u.name;
  if (lineEl) lineEl.textContent = u.line;
  if (kanjiEl) kanjiEl.textContent = u.kanji;
  box.className = "on t" + u.tier;
  clearTimeout(yiVoiceTimer);
  yiVoiceTimer = setTimeout(() => { box.className = "t" + u.tier; }, 5200);
}
function yiCheckUnlock(p) {
  const tier = yiGraceTier(p);
  const seen = p.yiUnlockTier || 0;
  if (tier <= seen) {
    if (tier < seen) p.yiUnlockTier = tier;
    return;
  }
  p.yiUnlockTier = tier;
  /* the Unlock's own riders: Defence Level (a guard, applied in hurtPlayer)
     and the combat-end SP heal, read here as a burst of vitality */
  const heal = [0, 5, 10, 15][tier] || 0;
  if (heal > 0 && p.hp > 0 && !(typeof Net !== "undefined" && Net.role === "guest"))
    p.hp = Math.min(p.maxHp, p.hp + heal);
  if (typeof localPlayer === "function" && p !== localPlayer()) return;
  yiSayUnlock(YI_UNLOCKS[tier - 1]);
  if (heal > 0) floatText(p.x, p.y - 40, "+" + heal, "#8ef0a0", 14);
  /* SHIN (心) - FATE arrives with Unlock III */
  if (tier >= 3 && !p.yiShinSeen) {
    p.yiShinSeen = true;
    floatText(p.x, p.y - 58, "SHIN (心) - FATE", "#ffe9a8", 15);
    if (typeof toast === "function") toast("SHIN (心) - FATE — THE SPIRIT READS THE HORROR");
  }
}

/* --- Shin (心) - Fate: active from Unlock III (Grace 9) --- */
function yiShinActive(p) {
  return (p.yiUnlockTier || 0) >= 3;
}
/* his SP read: Grace × 5, so nine Grace is 45 SP and the full +15% */
function yiShinSp(p) {
  return Math.max(0, (p.yiGrace || 0) * YI_SHIN_SP_PER_GRACE);
}
function yiShinSpBonus(p) {
  if (!yiShinActive(p)) return 0;
  /* horrors without SP are read at 0, so the difference is simply his own read */
  const sp = yiShinSp(p);
  return Math.min(YI_SHIN_SP_MAX, Math.floor(sp / YI_SHIN_SP_STEP) * 0.01);
}
function yiShinSpeedMul(p) {
  let m = yiShinActive(p) ? YI_SHIN_SPEED : 1;
  if (p.yiIndulge) m *= YI_INDULGE_SPEED;
  return m;
}
function yiShinAtkMul(p) {
  let m = yiShinActive(p) ? YI_SHIN_ATK : 1;
  if (p.yiIndulge) m *= YI_INDULGE_ATK;
  return m;
}

/* --- Wound-casing Mask / Sizzling Wound --- */
function yiWoundAtkMul(p) {
  const st = p.yiWoundState | 0;
  if (st === 1) return 1 + YI_MASK_OFF;
  if (st === 2) return 1 + YI_WOUND_OFF + YI_WOUND_BASE;
  return 1;
}
/* how a blow lands on him: the Defense Level drop deepens every hit, while
   attacks he is not turned against (bullets, waves, pools) bite a little less */
function yiWoundDmgMul(p, src) {
  const st = p.yiWoundState | 0;
  if (!st) return 1;
  let m = 1 + (st === 2 ? YI_WOUND_DEF : YI_MASK_DEF);
  const opposed = src && typeof enemies !== "undefined" && enemies.indexOf(src) >= 0;
  if (!opposed) m *= 1 - (st === 2 ? YI_WOUND_UNOPPOSED : YI_MASK_UNOPPOSED);
  return m;
}
/* Sizzling Wound quickens the pattern itself */
function yiWoundAnimDur(p) {
  return (p.yiWoundState | 0) === 2 ? YI_WOUND_ANIM_DUR : 1;
}
function yiWoundRateMul(p) {
  return (p.yiWoundState | 0) === 2 ? YI_WOUND_RATE : 1;
}
/* a staggering blow landed while the casing still holds */
function yiMaskStaggerHit(p, dmg) {
  if (!p || p.char !== "yi") return;
  if ((p.yiWoundState | 0) !== 1 || p.yiMaskStagger) return;
  if (dmg >= (p.maxHp || 0) * YI_MASK_STAGGER_FRAC) {
    p.yiMaskStagger = true;
    if (p === localPlayer())
      floatText(p.x, p.y - 40, "THE CASING HOLDS — STAGGERED", "#ffd27a", 13);
  }
}
/* Desire for Acknowledgement Sated — another warden on the field kindles him */
function yiDesireBonus(p) {
  if (Game.pvpMode) return 0;
  if (typeof players === "undefined") return 0;
  for (const q of players) {
    if (q === p || q.hp <= 0 || q.downed || q.gone) continue;
    return YI_DESIRE_BONUS;
  }
  return 0;
}

/* one cut's bite — Poise sharpens, Grace deepens, Karmic drags, the BASTARD SWORD
   hones his Offense stacks */
function yiBite(p) {
  const m = p.mods || {};
  const off = Math.min(YI_OFFENSE_MAX, p.yiOffenseS || 0);
  const bite = meleeBite(m)
    * (1 + (p.yiPoise || 0) * YI_POISE_DMG)
    * (1 + yiGraceBonus(p))
    * (1 + off * YI_OFFENSE_DMG)
    /* the casing and the wound: Offense Level, +15% Base Attacks */
    * yiWoundAtkMul(p)
    /* Shin (心) - Fate reads the spirit; a partner kindles acknowledgement */
    * (1 + yiShinSpBonus(p))
    * (1 + yiDesireBonus(p))
    * (1 + (p.yiIndulge ? YI_INDULGE_DMG : 0))
    * (1 - Math.min(0.4, (p.yiKarmic || 0) * YI_KARMIC_PER_STACK));
  return bite;
}

/* one wound, with every blade rider in one place */
function yiHitEnemy(p, e, x, y, forceCrit, biteMul, weapon) {
  const m = p.mods || {};
  let crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
  if (weapon === YI_WEAPON_SCYTHE) crit = true;          // the scythe always finds the gap
  const critMul = m.critMul || 2.2;
  const weapDmg = yiWeaponMul(weapon);
  const fragType = yiWeaponFragType(weapon);
  let bite = yiBite(p) * (biteMul || 1)
    * weapDmg
    * (crit ? critMul : 1);
  /* target is Fragile to a damage type — only that blade class drinks from it */
  if (e.fragT > 0 && e.fragStacks > 0 && fragType && e.fragType === fragType)
    bite *= 1 + YI_FRAG_DMG * e.fragStacks;
  damageEnemy(e, bite, {
    owner: p, x, y, melee: true, critHit: crit,
    knock: (m.knock || 0) * yiWeaponKnock(weapon) * (forceCrit ? 1.6 : 1),
  });
  /* THE ORACLE'S VERDICT — at Unlock III, a cut that leaves a non-boss horror
     below a tenth of its vitality ends it outright. The ledger does not keep
     half-finished names. */
  if (!e.dead && !e.boss && (p.yiUnlockTier || 0) >= 3 && e.maxHp > 0
      && e.hp > 0 && e.hp / e.maxHp <= YI_EXECUTE_HP) {
    e.hp = 0;
    if (p === localPlayer()) floatText(e.x, e.y - e.r - 14, "SEVERED", "#c4c9d4", 15);
    killEnemy(e, p);
  }
  /* the Oracle remembers where its first cut landed: the next blow on this
     horror follows through, and the blow that ends it is the finisher. Set
     before the guest's early return so a guest's own Yi reads the same. */
  if (!e.dead) e.yiStruck = true;
  /* THE PRESCRIPT'S TARGET — an enemy cut while the Prescript window stands
     (yiMarkT > 0) is the Oracle's marked quarry. Only it pays out the voiceline
     when it falls. */
  if (!e.dead && p.yiMarkT > 0) e.yiMarked = true;
  /* GUEST: the host settles the ledger; the guest's cut is only a picture */
  if (typeof Net !== "undefined" && Net.role === "guest") return;
  /* every landed cut banks Poise — [On Hit] in his kit — and a critical banks an extra;
     the Oracle counts true strikes, and Yi Sang stacks them like a debt-book */
  if (!e.dead && (p.yiPoise || 0) < YI_POISE_MAX) {
    /* the hatchet's own line: +2 Poise on hit; every other cut banks one.
       Shin (心) - Fate adds one more from every Base Skill. */
    const gain = (weapon === YI_WEAPON_HATCHET ? YI_HATCHET_POISE : 1)
      + (crit ? 1 : 0) + (yiShinActive(p) ? 1 : 0);
    p.yiPoise = Math.min(YI_POISE_MAX, (p.yiPoise || 0) + gain);
    if (p === localPlayer() && (crit || p.yiPoise >= YI_POISE_MAX))
      floatText(e.x, e.y - e.r - 16, "POISE " + p.yiPoise + "/" + YI_POISE_MAX, "#d9b65c", 13);
  }
  /* [Hatchet] — bruise the target into a sluggish step */
  if (!e.dead && weapon === YI_WEAPON_HATCHET) {
    e.slowT = Math.max(e.slowT || 0, YI_HATCHET_SLOW);
  }
  /* [Stiletto] — every cut opens the gloom, but the stiletto does it properly:
     one Sinking Potency on any landed hit (the Index's base skills all sank),
     plus two more and a longer Count when the thrust is the stiletto itself. */
  if (!e.dead) {
    const extra = weapon === YI_WEAPON_STILETTO ? YI_STILETTO_SINKING : 0;
    const cur = e.sinkingStacks || 0;
    /* never strip the deeper stacks Indulgence in Prescripts can lay */
    const cap = Math.max(YI_SINKING_MAX, cur);
    e.sinkingStacks = Math.min(cap, cur + YI_HIT_SINKING + extra);
    e.sinkingT = Math.max(e.sinkingT || 0,
      extra ? YI_STILETTO_SINK_T : YI_SINKING_T);
    e.sinkingDps = Math.max(e.sinkingDps || 0, YI_SINKING_DPS);
    e.sinkingBy = p;
  }
  /* [Bastard Sword] — hone for two stacks of Offense (Hermes answers the honing) */
  if (!e.dead && weapon === YI_WEAPON_BASTARD) {
    p.yiOffenseS = Math.min(YI_OFFENSE_MAX, (p.yiOffenseS || 0) + 1);
    p.yiOffenseT = YI_OFFENSE_TIME;
    if (p === localPlayer())
      floatText(p.x, p.y - 40, "OFFENSE " + p.yiOffenseS + "/" + YI_OFFENSE_MAX, "#ffedb8", 13);
  }
  /* [Rapier] — the guard is punctured: Def Level Down, so the horror takes
     +10% from every blade for a spell (damageEnemy reads e.defDown) */
  if (!e.dead && weapon === YI_WEAPON_RAPIER) {
    e.defDown = Math.min(YI_RAPIER_DEFDOWN_MAX, (e.defDown || 0) + 1);
    e.defDownT = YI_RAPIER_DEFDOWN_TIME;
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, "DEFENCE DOWN", "#b9c8e2", 12);
  }
  /* [Hammer] — caving in the skull leaves the victim unable to act */
  if (!e.dead && weapon === YI_WEAPON_HAMMER) {
    e.paralyzeT = Math.max(e.paralyzeT || 0, YI_HAMMER_STAGGER);
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, "STAGGERED", "#ffffff", 13);
  }
  /* [Greatsword, Lance, Whip] — lay a typed Fragility into the foe;
     fragile flesh gives way to that class of blade, and only that class */
  if (!e.dead && (weapon === YI_WEAPON_GREATSWORD || weapon === YI_WEAPON_LANCE || weapon === YI_WEAPON_WHIP)) {
    const t = yiWeaponFragType(weapon);
    if (e.fragT <= 0 || e.fragType !== t) {
      e.fragType = t;          // a different blade opens a different seam
      e.fragStacks = 1;
    } else {
      e.fragStacks = Math.min(YI_FRAG_MAX, (e.fragStacks || 0) + 1);
    }
    e.fragT = Math.max(e.fragT || 0, YI_FRAG_TIME);
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, t.toUpperCase() + " FRAGILE ×" + e.fragStacks, "#ff9a3d", 12);
  }
  if (!e.dead) applyMeleeElements(p, e, m);
}

/* a forward cut (or the whole pattern's share of it) */
function yiCutArc(p, x, y, aim, halfArc, reach, forceCrit, mark, biteMul, weapon) {
  const m = p.mods || {};
  let best = null, bestHp = -1;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    yiHitEnemy(p, e, x, y, forceCrit, biteMul, weapon);
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
    let crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
    if (weapon === YI_WEAPON_SCYTHE) crit = true;
    const critMul = m.critMul || 2.2;
    /* the rapier's puncture lands on wardens as a straight exposure */
    const expose = weapon === YI_WEAPON_RAPIER ? 1 + YI_RAPIER_DEFDOWN : 1;
    hurtPlayer(foe, yiBite(p) * (biteMul || 1) * yiWeaponMul(weapon) * expose * (crit ? critMul : 1),
      { x, y, knock: (m.knock || 0) * (weapon === YI_WEAPON_HATCHET ? 0.9 : 0.6) });
    /* the rival has been opened: the next cut follows through */
    if (foe.hp > 0) foe.yiStruck = true;
  }
  return best;
}

/* per-frame bookkeeping: the swing's afterglow, the mark, and the Oracle's clock */
function yiTick(p, dt) {
  if (!p) return;
  /* the Oracle keeps its accounts for Yi Sang alone — a Kim or a Fortress must not
     inherit the mark, the Grace pips or the Karmic ledger */
  if (p.char !== "yi") return;
  yiVitals(p);
  /* GUEST: the host writes the Prescript. A guest only keeps the swing's afterglow
     alive for its own frame; the mark, Grace and Karmic arrive through snapshots. */
  if (typeof Net !== "undefined" && Net.role === "guest") {
    p.yiSlashT = Math.max(0, p.yiSlashT - dt);
    if (p.yiSlashT <= 0 && (p.yiHoldT || 0) > 0) p.yiHoldT = Math.max(0, p.yiHoldT - dt);
    return;
  }
  /* Sizzling Wound — the Burn and the Bleed gnaw at him each turn (never to death) */
  if ((p.yiWoundDotT || 0) > 0) {
    p.yiWoundDotT = Math.max(0, p.yiWoundDotT - dt);
    p.yiWoundDotTick = (p.yiWoundDotTick || 0) - dt;
    if (p.yiWoundDotTick <= 0) {
      p.yiWoundDotTick = 1;
      const drain = Math.max(1, Math.round(p.yiWoundDotDps || 0));
      if (p.hp > 1) p.hp = Math.max(1, p.hp - drain);
      if (p === localPlayer() && typeof updateHp === "function") updateHp();
    }
  }
  if (p.yiSlashT > 0) p.yiSlashT = Math.max(0, p.yiSlashT - dt);
  else if ((p.yiHoldT || 0) > 0) p.yiHoldT = Math.max(0, p.yiHoldT - dt);
  /* FURIOSO-REPLICA — the queued nine-strike flurry plays beat by beat */
  yiFuriosoTick(p, dt);
  /* the blow lands on its beat, not on the tap */
  if (p.yiCutPlan) {
    if ((p.hp || 0) <= 0) p.yiCutPlan = null;
    else if ((p.yiAnimLife || YI_SLASH_LIFE) - p.yiSlashT >= p.yiCutPlan.at) {
      const plan = p.yiCutPlan;
      p.yiCutPlan = null;
      yiResolveCut(p, plan);
    }
  }
  /* the Oracle's grip lapses if the pattern is left hanging — the next swing
     draws a fresh vessel from the wheel */
  if ((p.yiComboGap || 0) > 0) {
    p.yiComboGap = Math.max(0, p.yiComboGap - dt);
    if (p.yiComboGap <= 0) { p.yiComboN = 0; p.yiComboWeapon = -1; }
  }
  /* the BASTARD SWORD hones but for a while */
  if (p.yiOffenseT > 0) {
    p.yiOffenseT -= dt;
    if (p.yiOffenseT <= 0) p.yiOffenseS = 0;
  }
  if ((p.yiSkill3Cd || 0) > 0) p.yiSkill3Cd = Math.max(0, p.yiSkill3Cd - dt);
  /* final-hit propulsion: the strike lands, then Yi Sang carries through the
     target (host only). A short wait lets the blow read before the body follows. */
  if ((p.yiPropelWait || 0) > 0) {
    p.yiPropelWait = Math.max(0, p.yiPropelWait - dt);
    if (p.yiPropelWait <= 0) p.yiPropelT = p.yiPropelDur || 0.28;
  }
  if ((p.yiPropelT || 0) > 0) {
    p.yiPropelT = Math.max(0, p.yiPropelT - dt);
    const spd = p.yiPropelSpd || 0;
    p.x += Math.cos(p.yiPropelAng) * spd * dt;
    p.y += Math.sin(p.yiPropelAng) * spd * dt;
    collideWorld(p);
    if (p.yiPropelT <= 0) p.yiPropelSpd = 0;
  }
  if (p.yiMarkT > 0) {
    p.yiMarkT = Math.max(0, p.yiMarkT - dt);
    if (p.yiMarkT <= 0) {
      /* the Prescript window lapses — clear the mark on every horror so a
         later kill doesn't pay out for an old target */
      for (const e of enemies) { e.yiMarked = false; }
      /* TURN END — the Prescript window closes. Resolve it once. */
      /* a casing that took a staggering blow — or witnessed its first
         Furioso-Replica this Encounter — recovers from the Stagger and sizzles
         over into the wound at Turn End */
      const furiosoFirst = !!p.yiFuriosoSeen;
      if ((p.yiWoundState | 0) === 1 && (p.yiMaskStagger || furiosoFirst)) {
        p.yiWoundState = 2;
        p.yiMaskStagger = false;
        p.paralyzeT = 0;
        if (p.slowT) p.slowT = 0;
        if (p === localPlayer()) {
          floatText(p.x, p.y - 46, "SIZZLING WOUND", "#ff6b3d", 15);
          if (typeof toast === "function") toast("SIZZLING WOUND — THE CASING BURNS THROUGH");
          /* SIZZLING WOUND gained voiceline */
          if (typeof AudioFX !== "undefined" && typeof AudioFX.playVoice === "function") {
            AudioFX.playVoice(p.yiSizzleVoice === 1 ? "sizzling2.wav" : "sizzling1.wav");
            p.yiSizzleVoice = p.yiSizzleVoice === 1 ? 2 : 1;
          }
        }
      }
      /* INDULGENCE IN PRESCRIPTS expires with the turn */
      if (p.yiIndulge) {
        p.yiIndulge = false;
        if (p === localPlayer()) floatText(p.x, p.y - 60, "INDULGENCE LAPSES", "#8f9bb0", 12);
      }
      const executed = !!p.yiTurnHermesGained;
      const atUnlock2 = yiGraceTier(p) >= 2;
      if (executed && atUnlock2 && !p.yiTurnHealed) {
        /* Prescript: [Device] was executed this turn — heal 4 SP → 4 vitality, once per turn */
        p.hp = Math.min(p.maxHp, (p.hp || 0) + YI_TURN_HEAL);
        p.yiTurnHealed = true;
        if (p === localPlayer()) {
          floatText(p.x, p.y - 40, "+" + YI_TURN_HEAL, "#8ef0a0", 14);
          if (typeof toast === "function") toast("TURN END — PRESCRIPT EXECUTED, VITALITY MENDED");
        }
      }
      if (executed) {
        /* a Prescript carried out lifts twenty from the Karmic ledger — without
           this the Consequence was a one-way debt and a long fight buried his
           cuts under a permanent -40% */
        const before = p.yiKarmic || 0;
        if (before > 0) {
          p.yiKarmic = Math.max(0, before - YI_KARMIC_EXECUTE_CLEAR);
          if (p === localPlayer()) {
            floatText(p.x, p.y - 54, "KARMIC -" + (before - p.yiKarmic), "#8ef0a0", 13);
          }
        }
      } else {
        /* the Prescript lapsed unexecuted — the Karmic Consequence takes him */
        p.yiKarmic = Math.min(YI_KARMIC_MAX, (p.yiKarmic || 0) + YI_KARMIC_MISS);
        if (p === localPlayer()) floatText(p.x, p.y - 40, "KARMIC +" + YI_KARMIC_MISS, "#ff6b6b", 14);
      }
      yiClearMark(p);
      p.yiMarkCd = 3;                 // a breath, then the Oracle writes again
    }
  } else {
    /* no name is written: the Oracle's clock runs, then delivers the next Prescript */
    p.yiMarkCd = Math.max(0, (p.yiMarkCd || 0) - dt);
    if (p.yiMarkCd <= 0 && enemies.length) {
      const e = yiPickMark(p);
      if (e) {
        yiFallMark(p);
        p.yiMarkCd = YI_MARK_CD;
        if (p === localPlayer()) {
          floatText(p.x, p.y - 40, "THE PRESCRIPT", "#7ec0ff", 17);
        }
      }
    }
  }
  /* PRESCRIPT [DEVICE] IV — after Unlock III the Oracle sets a contract:
     empty the room before the next Prescript arrives */
  if (p.yiDevice4T > 0) {
    const alive = enemies.some(e => !e.dead && !e.ghost && e.spawnT <= 0 && e.team !== "p");
    if (!alive) {
      p.yiDevice4T = 0;
      p.yiKarmic = 0;
      if (p === localPlayer()) {
        floatText(p.x, p.y - 44, "PRESCRIPT FULFILLED", "#8ef0a0", 16);
        if (typeof toast === "function") toast("THE PRESCRIPT IS FULFILLED — THE LEDGER IS CLEAN");
      }
    } else {
      p.yiDevice4T = Math.max(0, p.yiDevice4T - dt);
      if (p.yiDevice4T <= 0) {
        /* the contract lapses — the next Prescript simply arrives, no ledger entry */
        if (p === localPlayer()) floatText(p.x, p.y - 44, "THE PRESCRIPT MOVES ON", "#8f9bb0", 13);
      }
    }
  }
  /* the Prescript pays Hermes the instant its last step is open */
  const hermesPaid = yiGrantHermesGrace(p);
  if (hermesPaid > 0 && p === localPlayer()) floatText(p.x, p.y - 62, "GRACE +" + hermesPaid, "#7ec0ff", 14);
  /* Grace of the Prescript — 3 / 6 / 9 speaks the Unlock line */
  yiCheckUnlock(p);
}

/* the horror this cut is meant for — the nearest one inside the wedge.
   In VERSUS a rival warden answers to the same read. */
function yiSwingTarget(p, aim, reach, halfArc) {
  let best = null, bestD = Infinity;
  const consider = (e, rival) => {
    if (!e || e === p) return;
    if (e.dead || e.ghost || e.spawnT > 0 || e.hp <= 0) return;
    if (!rival && e.team === "p") return;
    if (rival && (e.downed || e.gone)) return;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + e.r) return;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) return;
    if (d < bestD) { bestD = d; best = e; }
  };
  for (const e of enemies) consider(e, false);
  if (Game.pvpMode) for (const foe of players) consider(foe, true);
  return best;
}

/* what this vessel's cut would take off the horror — the same bite the cut
   deals, with the crit roll folded in as its expectation (the scythe always
   finds the gap), so the finisher answers the blow that is going to end it */
function yiPreviewBite(p, e, weapon) {
  const m = p.mods || {};
  let dmg = yiBite(p) * yiWeaponMul(weapon);
  const critP = weapon === YI_WEAPON_SCYTHE ? 1 : Math.min(1, Math.max(0, m.crit || 0));
  dmg *= 1 + critP * ((m.critMul || 2.2) - 1);
  const ft = yiWeaponFragType(weapon);
  if (e.fragT > 0 && e.fragStacks > 0 && ft && e.fragType === ft)
    dmg *= 1 + YI_FRAG_DMG * e.fragStacks;
  if (e.defDown > 0) dmg *= 1 + Math.min(0.5, e.defDown * YI_RAPIER_DEFDOWN);
  /* the Marrow King's vessels ward him until they break */
  if (e.boss && e.kind === 1 && e.shielded) dmg *= 0.2;
  /* THE ORACLE'S VERDICT — a blow that leaves the horror under the execution
     line reads as lethal to the beat machine, so the finisher answers it */
  if ((p.yiUnlockTier || 0) >= 3 && !e.boss && e.maxHp > 0) {
    const left = e.hp - dmg;
    if (left > 0 && left / e.maxHp <= YI_EXECUTE_HP) dmg = e.hp + 1;
  }
  return dmg;
}

/* the Oracle delivers its account — one swing of the pattern */
function yiSwing(p, x, y, aim) {
  const m = p.mods;
  yiVitals(p);
  const arcs = Math.max(1, m.meleeArcs || 1);
  const twin = Math.max(0, m.meleeTwin || 0);
  const mirror = Math.max(0, m.meleeMirror || 0);
  const totalHalf = YI_HALF_ARC + Math.max(0, m.meleeSpread || 0);
  const wedge = totalHalf / arcs;
  const dir = Math.random() < 0.5 ? -1 : 1;
  p.yiSlashAng = aim;
  p.yiSlashDir = dir;
  p.yiSlashLanes = null;

  /* the Oracle keeps its grip for the pattern — the same vessel answers for
     three swings, then the wheel turns. A lapsed pattern draws a fresh one. */
  const keep = (p.yiComboN || 0) > 0 && p.yiComboWeapon >= 0;
  let weapon;
  if (keep) weapon = p.yiComboWeapon;
  else {
    weapon = (Math.random() * 9) | 0;
    /* THE ORACLE'S VERDICT — past Unlock III, a horror already below a third of
       its vitality is answered with the heavy vessels only, so the wheel no
       longer spends the opening beats of a kill on a stiletto */
    if ((p.yiUnlockTier || 0) >= 3) {
      const reachMax = yiWeaponReach(YI_WEAPON_LANCE) + Math.max(0, (m.size || 4) - 4) * 0.8;
      const broken = yiSwingTarget(p, aim, reachMax, totalHalf);
      if (broken && broken.maxHp > 0 && broken.hp / broken.maxHp <= YI_VERDICT_HP)
        weapon = YI_VERDICT_HEAVY[(Math.random() * YI_VERDICT_HEAVY.length) | 0];
    }
  }
  p.yiWeapon = weapon;
  const wd = yiWeaponData(weapon);
  /* per-weapon attack speed: a heavy greatsword resets slower than a stiletto.
     Shin quickens the hand; a Sizzling Wound quickens the whole pattern. */
  const jamMul = curseActive(p, "jam") ? 0.5 : 1;
  p.fireT = (1 / (m.rate * wd.rate * jamMul * yiShinAtkMul(p))) * yiWoundRateMul(p);
  /* per-weapon reach, scaled by size mods like every melee warden */
  const reach = yiWeaponReach(weapon) + Math.max(0, (m.size || 4) - 4) * 0.8;
  /* the Oracle reads the horror before it cuts. A horror it has not opened
     yet takes the opening beat — even when one blow would end it. A horror
     already bleeding takes the follow-through, and when this blow is enough
     to finish it, the finisher. Each vessel keeps its own three beats (the
     scythe has a fourth: Furioso-Replica). */
  const quarry = yiSwingTarget(p, aim, reach, totalHalf);
  let comboIdx = 0;
  if (quarry && quarry.yiStruck)
    comboIdx = yiPreviewBite(p, quarry, weapon) >= quarry.hp ? 2 : 1;
  const anim = yiComboAnim(weapon, comboIdx);
  /* a Sizzling Wound plays the same beat faster — the clock, the hold and the
     contact frame all shorten together, so the cut still lands on its mark */
  const animDur = yiWoundAnimDur(p);
  const animLife = anim.life * animDur;
  p.yiComboIdx = comboIdx;
  p.yiAnimLife = animLife;
  p.yiSlashT = animLife;
  p.yiHoldT = (anim.hold || 0) * animDur;
  /* the wheel: one vessel answers three swings, then it is drawn again */
  const swung = keep ? (p.yiComboN || 0) : 0;
  p.yiComboWeapon = swung >= 2 ? -1 : weapon;
  p.yiComboN = (swung + 1) % 3;
  p.yiComboGap = 1.6;
  if (anim.push) {
    p.yiPropelAng = aim;
    p.yiPropelSpd = anim.push.spd;
    p.yiPropelDur = anim.push.t;
    p.yiPropelWait = anim.push.wait || 0.04;
    p.yiPropelT = 0;
  } else {
    p.yiPropelWait = 0; p.yiPropelT = 0; p.yiPropelSpd = 0;
  }

  const guest = typeof Net !== "undefined" && Net.role === "guest";
  const mark = p.yiMarkT > 0;

  /* MARK OF THE PRESCRIPT on the Base Attack Skill: using a marked skill
     gains 1 Procuration [Hermes] per swing (host settles the ledger).
     Hermes 9 does NOT auto-execute on basic swings — it unlocks Skill 3
     (Furioso-Replica), which the player fires with [Q] and which consumes
     all Hermes. */
  if (mark && !guest) {
    p.yiTurnHermesGained = true;
    const pcap = yiProcCap(p);
    if ((p.yiProc || 0) < pcap) {
      p.yiProc = Math.min(pcap, (p.yiProc || 0) + 1);
      if (p.yiProc >= YI_PROC_MAX) {
        p.yiProcReady = true;
        p.yiProcMaxed = true;        // the ninth step of Grace stays open for good
        const got = yiGrantHermesGrace(p);
        /* executing at Hermes 9 heals 8 SP (8 vitality) instead of Turn End's 4,
           once per Prescript window */
        let execHeal = 0;
        if (!p.yiTurnHealed) {
          if (p.hp > 0) {
            execHeal = Math.min(YI_EXECUTE_HEAL, Math.max(0, p.maxHp - p.hp));
            if (execHeal > 0) p.hp += execHeal;
          }
          p.yiTurnHealed = true;
        }
        if (p === localPlayer()) {
          floatText(p.x, p.y - 46, "PROCURATION [HERMES]", "#ffedb8", 14);
          if (got > 0) floatText(p.x, p.y - 62, "GRACE +" + got, "#7ec0ff", 14);
          if (execHeal > 0) floatText(p.x, p.y - 78, "+" + execHeal, "#8ef0a0", 14);
          if (typeof toast === "function") toast("PROCURATION [HERMES] — THE PRESCRIPT COMPLETES");
        }
      }
    }
    /* one Grace per Prescript — the first marked-skill use pays the ladder,
       even while Hermes waits at its ceiling */
    if (!p.yiGraceStruck && yiAddGrace(p, YI_GRACE_FIRST_PER_PRESCRIPT) > 0) {
      p.yiGraceStruck = true;
      if (p === localPlayer())
        floatText(p.x, p.y - 54, "GRACE " + p.yiGrace + "/" + yiGraceCap(p), "#7ec0ff", 12);
    }
  }

  /* the cut is dealt at the beat the animation reaches — a hatchet's tap
     hangs a moment before the ribs, a stiletto leaves at once */
  const contact = (anim.fx && anim.fx.length ? anim.fx[0].at : 0.35) * animLife;
  p.yiCutPlan = {
    at: contact, x, y, aim, reach, mark, weapon, dir, arcs, wedge, totalHalf, twin, mirror,
  };
  /* never let the next swing start before this cut's damage lands: at very high
     attack speed fireT can undercut the contact frame and fireWeapon calls
     yiSwing again, overwriting yiCutPlan and losing the previous cut's bite.
     Clamp the reset so every swing resolves. */
  if (p.fireT < contact) p.fireT = contact;

  /* lanes and rear cuts get their own crescents — drawn now, they are light, not harm */
  if (arcs > 1 || twin || mirror) {
    p.yiSlashLanes = [];
    for (let i = 0; i < arcs; i++) {
      const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
      p.yiSlashLanes.push({
        dx: 0, dy: 0, ang: a, scale: (arcs === 1 ? totalHalf : wedge) / YI_HALF_ARC,
        delay: i * 0.012, alpha: 1, dir, weapon,
      });
    }
    const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
    for (let i = 0; i < twin; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const off = YI_TWIN_GAP * (Math.floor(i / 2) + 1) * side;
      p.yiSlashLanes.push({
        dx: perpX * off, dy: perpY * off, ang: aim,
        scale: YI_TWIN_HALF / YI_HALF_ARC, delay: 0.02 + i * 0.012,
        alpha: 0.75, dir, cheap: true, weapon,
      });
    }
    const backHalf = YI_HALF_ARC * 0.8;
    for (let i = 0; i < mirror; i++) {
      p.yiSlashLanes.push({
        dx: 0, dy: 0, ang: aim + Math.PI, scale: backHalf / YI_HALF_ARC,
        delay: 0.03 + i * 0.012, alpha: 0.7, dir: -dir, cheap: true, weapon,
      });
    }
  }
  return true;
}

/* the blow itself, once the weapon's beat arrives */
function yiResolveCut(p, plan) {
  const { x, y, aim, reach, mark, weapon, dir, arcs, wedge, totalHalf, twin, mirror } = plan;
  const proc = false;
  const sizzle = (p.yiWoundState | 0) === 2;
  for (let i = 0; i < arcs; i++) {
    const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
    yiCutArc(p, x, y, a, arcs === 1 ? totalHalf : wedge, reach, false, mark, null, weapon);
  }
  yiTrail(x, y, aim, reach, weapon, arcs === 1 ? 9 : Math.min(9, 5 + arcs), sizzle);
  const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
  for (let i = 0; i < twin; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const off = YI_TWIN_GAP * (Math.floor(i / 2) + 1) * side;
    yiCutArc(p, x + perpX * off, y + perpY * off, aim, YI_TWIN_HALF, reach, proc, mark, null, weapon);
    yiTrail(x + perpX * off, y + perpY * off, aim, reach, weapon, 3, sizzle);
  }
  const backHalf = YI_HALF_ARC * 0.8;
  for (let i = 0; i < mirror; i++) {
    yiCutArc(p, x, y, aim + Math.PI, backHalf, reach * 0.9, proc, mark, null, weapon);
    yiTrail(x, y, aim + Math.PI, reach * 0.9, weapon, 3, sizzle);
  }
}

/* the dark motes thrown along a cut, and the blood the Oracle spilled to price them */
function yiTrail(x, y, aim, reach, weapon, amount, sizzle) {
  if (particles.length >= 560) return;
  const base = weapon === YI_WEAPON_HATCHET ? [YI_COL.blunt, "#ffcf9a", "#8a5630"]
    : weapon === YI_WEAPON_STILETTO ? [YI_COL.pierce, "#c9b6ff", "#4a2f9a"]
    : [YI_COL.slash, "#ffffff", "#8d9099"];
  /* Sizzling Wound — the cut sheds dark-blue embers and violet thorn-light */
  const sizzleCols = ["#3a7bff", "#6fd8ff", "#8fe6ff", "#7a3cff", "#bff0ff"];
  for (let i = 0; i < amount; i++) {
    const a = aim + rnd(-0.9, 0.9);
    const d = rnd(reach * 0.25, reach + 8);
    const hot = !!sizzle && Math.random() < 0.45;
    const blood = !hot && Math.random() < 0.2;
    particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * rnd(70, 240), vy: Math.sin(a) * rnd(70, 240),
      t: 0, life: hot ? rnd(0.18, 0.36) : rnd(0.14, 0.3), r: hot ? rnd(1.4, 3.4) : rnd(1.2, 3.2),
      color: hot ? pick(sizzleCols) : blood ? pick([YI_COL.blood, YI_COL.bloodHi, "#60140f"]) : pick(base) });
  }
}

/* ---------------------------------------------------------
   HUD — PRESCRIPT pips, KARMIC, POISE, and the seal
   --------------------------------------------------------- */
let lastYiCue = "";
function updateYiCue(p) {
  const el = typeof document !== "undefined" ? $("yiCue") : null;
  if (!el) return;
  const active = !!p && p.char === "yi";
  el.classList.toggle("on", active);
  if (!active) { lastYiCue = ""; return; }
  yiUnlockVoices();   /* warm the three Unlock lines while he is on the field */
  const g = clamp(p.yiGrace || 0, 0, YI_GRACE_MAX);
  const k = clamp(p.yiKarmic || 0, 0, YI_KARMIC_MAX);
  const cap = yiGraceCap(p);
  /* filled ◆, reachable ◇, and the Device-locked rest as · */
  const pips = "◆".repeat(g)
    + "◇".repeat(Math.max(0, cap - g))
    + "·".repeat(Math.max(0, YI_GRACE_MAX - cap));
  const weapon = YI_WEAPONS[p.yiWeapon] || "BASTARD SWORD";
  let txt = "PRESCRIPT [" + ["I", "II", "III", "IV"][Math.min(4, Math.max(1, p.yiDevice || 1)) - 1] + "] " + pips
    + " · KARMIC " + k + "/" + YI_KARMIC_MAX;
  txt += " · HERMES " + (p.yiProc || 0) + "/" + yiProcCap(p)
    + (p.yiProcReady ? " READY" : (!p.yiProcMaxed && (p.yiDevice || 1) >= 3 ? " · GRACE 9 LOCKED" : ""));
  txt += " · POISE " + (p.yiPoise || 0) + "/" + YI_POISE_MAX;
  /* the casing, and the Unlock III blessing */
  if ((p.yiWoundState | 0) === 1) txt += " · MASK";
  else if ((p.yiWoundState | 0) === 2) txt += " · SIZZLING WOUND";
  if (p.yiIndulge) txt += " · INDULGENCE";
  if (yiShinActive(p)) txt += " · SHIN";
  txt += " · " + weapon;
  const furioso = (p.yiProc || 0) >= YI_PROC_MAX && !p.yiFuriosoUsed;
  /* Q is the ultimate key; a touch layout has no Q, so its SEAL button carries it */
  const ult = (typeof Input !== "undefined" && Input.touchMode) ? "SEAL" : "Q";
  if (furioso) txt += " · FURIOSO-REPLICA [" + ult + "]";
  else if ((p.yiSkill3Cd || 0) <= 0) txt += " · SKILL 3 [" + ult + "]";
  else txt += " · SKILL 3 " + (p.yiSkill3Cd || 0).toFixed(1) + "s";
  if (p.yiMarkT > 0) {
    const g = p.yiGrace || 0;
    const gPct = g >= YI_GRACE_TIER_9 ? (YI_GRACE_BASE_DMG * 100) : Math.min(16, g * YI_GRACE_PER_STACK * 100);
    txt += g >= YI_GRACE_TIER_9
      ? " · MARK · BASE SKILLS +" + gPct + "%"
      : " · MARK (+ " + gPct + "% on marked skill)";
  }
  const tier = yiGraceTier(p);
  const cls = "on" + (tier >= 3 ? " payout" : tier >= 2 ? " unlock2" : tier >= 1 ? " unlock1" : "");
  if (lastYiCue !== txt + cls) {
    lastYiCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}

/* ---------------------------------------------------------
   RENDER — the seal of the Prescript, the crescent of the cut
   --------------------------------------------------------- */
function drawYiSlashArc(px, py, ang, reach, k, alpha, dir, arcScale, weapon, cheap, a0, a1, sizzle) {
  const scale = arcScale || 1;
  const span = YI_HALF_ARC * 0.9 * scale;
  const prog = k < YI_SWEEP_SHARE ? k / YI_SWEEP_SHARE : 1;
  const d = dir < 0 ? -1 : 1;
  /* the crescent is drawn from the blade's own two ends when the caller
     supplies them, so the light can never lie about where the steel is */
  const start = a0 == null ? (d > 0 ? -span : span) : a0;
  const end = a1 == null ? -start : a1;
  const head = start + (end - start) * prog;
  const trail = (1.15 * scale) + 0.4;
  const tail = end >= start ? Math.max(start, head - trail) : Math.min(start, head + trail);
  const linger = k < YI_SWEEP_SHARE ? 1 : 1 - (k - YI_SWEEP_SHARE) / (1 - YI_SWEEP_SHARE);
  const fade = alpha * Math.pow(Math.max(0, linger), 0.8);
  if (fade <= 0.01 || Math.abs(head - tail) < 0.02) return;
  const R = reach * (0.92 + 0.08 * prog);
  const lo = Math.min(head, tail), hi = Math.max(head, tail);
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  cx.lineCap = "round";
  /* the cold bloom of the cut */
  cx.globalAlpha = fade * (cheap ? 0.4 : 0.55);
  cx.strokeStyle = col;
  cx.shadowColor = col; cx.shadowBlur = cheap ? 8 : 16;
  cx.lineWidth = cheap ? 3 : 6;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* the white edge — a blade, not a smear */
  cx.globalAlpha = fade * 0.95;
  cx.strokeStyle = "#ffffff";
  cx.shadowBlur = 5; cx.lineWidth = cheap ? 1.4 : 2.4;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* a fainter outer whisper of the same arc */
  cx.globalAlpha = fade * 0.2;
  cx.strokeStyle = colTail; cx.shadowBlur = 0; cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(0, 0, R + 5, lo, hi); cx.stroke();
  /* the greatsword sheds black shards and smoke along its whole pass */
  if (weapon === YI_WEAPON_GREATSWORD && !cheap) {
    for (let i = 0; i < 5; i++) {
      const a = lo + (hi - lo) * ((i + 0.5) / 5);
      const rr = R + 6 + Math.sin(i * 2.1) * 5;
      const sz = 3.4 + (i % 3) * 1.6;
      cx.globalAlpha = fade * 0.7;
      cx.fillStyle = "#0b0b11"; cx.strokeStyle = col; cx.lineWidth = 0.8;
      cx.shadowColor = col; cx.shadowBlur = 6;
      cx.save();
      cx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
      cx.rotate(a + 1.1);
      cx.beginPath();
      cx.moveTo(-sz, 0); cx.lineTo(0, -sz * 0.5); cx.lineTo(sz * 0.8, 0); cx.lineTo(0, sz * 0.42);
      cx.closePath(); cx.fill(); cx.stroke();
      cx.restore();
    }
    cx.globalAlpha = fade * 0.4;
    cx.strokeStyle = "#2a2a36"; cx.shadowColor = col; cx.shadowBlur = 8; cx.lineWidth = 2.0;
    const mid = (lo + hi) * 0.5;
    for (let i = 0; i < 2; i++) {
      const a = mid + (i ? 0.16 : -0.16);
      const c0 = Math.cos(a), s0 = Math.sin(a);
      cx.beginPath();
      cx.moveTo(c0 * (R - 4), s0 * (R - 4));
      cx.quadraticCurveTo(c0 * (R + 9) - s0 * 6, s0 * (R + 9) + c0 * 6,
                          c0 * (R + 16) - s0 * 2, s0 * (R + 16) + c0 * 2);
      cx.stroke();
    }
  }
  /* the scythe leaves pale splinters of the cut hanging in the air */
  if (weapon === YI_WEAPON_SCYTHE && !cheap) {
    cx.shadowColor = col; cx.shadowBlur = 10;
    for (let i = 0; i < 4; i++) {
      const a = lo + (hi - lo) * ((i + 0.4) / 4);
      const rr = R + 9 + (i % 2) * 6;
      const c0 = Math.cos(a), s0 = Math.sin(a);
      cx.globalAlpha = fade * 0.8;
      cx.strokeStyle = i % 2 ? "#e8fbff" : col; cx.lineWidth = 1.2;
      cx.beginPath();
      cx.moveTo(c0 * rr, s0 * rr);
      cx.lineTo(c0 * (rr + 10) - s0 * 3, s0 * (rr + 10) + c0 * 3);
      cx.stroke();
    }
  }
  /* Sizzling Wound — the cut drags a dark-blue current along its edge */
  if (sizzle) {
    cx.globalAlpha = fade * 0.5;
    cx.strokeStyle = "#3a7bff"; cx.shadowColor = "#2f6cff"; cx.shadowBlur = 18;
    cx.lineWidth = cheap ? 2.0 : 3.4;
    cx.beginPath(); cx.arc(0, 0, R + 2, lo, hi); cx.stroke();
    cx.globalAlpha = fade * 0.9;
    cx.strokeStyle = "#8fe6ff"; cx.shadowBlur = 8; cx.lineWidth = 1.0;
    cx.beginPath(); cx.arc(0, 0, R - 3, lo, hi); cx.stroke();
    cx.globalAlpha = fade * 0.6;
    cx.strokeStyle = "#7a3cff"; cx.shadowBlur = 10; cx.lineWidth = 1.2;
    cx.beginPath(); cx.arc(0, 0, R + 9, lo, hi); cx.stroke();
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* Sizzling Wound — dark-blue electric thorns crackle across the strike. This is
   drawn for every client (it reads only the warden's own state and the clock), so
   a guest sees the same storm as the host. */
function drawYiSizzleSparks(px, py, ang, reach, k) {
  const fade = k < 0.18 ? k / 0.18 : 1 - Math.max(0, k - 0.6) * 2.4;
  if (fade <= 0.02) return;
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  cx.lineCap = "round";
  /* bolts fanning across the arc, jittering with the beat */
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -0.85 + (i / (n - 1)) * 1.7;
    const r0 = reach * (0.34 + 0.5 * ((i * 0.37) % 1));
    const j = Math.sin(k * 42 + i * 7.1) * 7;
    const x0 = Math.cos(a) * r0, y0 = Math.sin(a) * r0 + j * 0.3;
    const x1 = Math.cos(a) * (r0 + 16 + j), y1 = Math.sin(a) * (r0 + 16) - j;
    cx.globalAlpha = fade * (0.45 + 0.4 * ((i * 0.53) % 1));
    cx.strokeStyle = i % 2 ? "#3a7bff" : "#6fd8ff";
    cx.shadowColor = "#2f6cff"; cx.shadowBlur = 12;
    cx.lineWidth = i % 2 ? 1.3 : 2.1;
    cx.beginPath();
    cx.moveTo(x0, y0);
    cx.lineTo(x0 + Math.cos(a) * 6 + Math.sin(a) * j * 0.7,
              y0 + Math.sin(a) * 6 - Math.cos(a) * j * 0.7);
    cx.lineTo(x1, y1);
    cx.stroke();
  }
  /* dark-violet thorn tendrils — the wound reaching for the horror */
  cx.shadowColor = "#7a3cff"; cx.shadowBlur = 10;
  cx.strokeStyle = "#7a3cff"; cx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    const a = -0.4 + i * 0.8;
    const r = reach * 0.55;
    cx.globalAlpha = fade * 0.6;
    cx.beginPath();
    cx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    cx.quadraticCurveTo(Math.cos(a + 0.3) * (r + 12), Math.sin(a + 0.3) * (r + 12),
                        Math.cos(a + 0.1) * (r + 24), Math.sin(a + 0.1) * (r + 24));
    cx.stroke();
  }
  /* a scatter of sparks at the head */
  cx.shadowColor = "#6fd8ff"; cx.shadowBlur = 8; cx.fillStyle = "#bff0ff";
  for (let s = 0; s < 4; s++) {
    const sa = ang + Math.sin(k * 33 + s * 5.3) * 0.9;
    const d = reach * (0.55 + 0.4 * ((s * 0.33) % 1));
    cx.globalAlpha = fade * 0.8;
    cx.beginPath(); cx.arc(Math.cos(sa) * d, Math.sin(sa) * d, 1.4, 0, TAU); cx.fill();
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* a rail of light thrown by a piercing weapon — a straight lance out from the arm on the strike.
   kind: 'thrust' style — white hot core, colour to the sides, a punched tail behind it. */
function drawYiStabFx(px, py, ang, reach, k, weapon) {
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  /* three breaths: windup has almost nothing, the strike is the full beam, the afterburner fades it */
  const tip = reach + 22;
  const prog = Math.pow(clamp(k, 0, 1), 1.25);
  const fade = k < 0.22 ? k / 0.22 : 1 - Math.max(0, (k - 0.55)) * 1.7;
  if (fade <= 0.02) return;
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  cx.lineCap = "round";
  /* the colour bloom */
  cx.globalAlpha = fade * 0.38;
  cx.strokeStyle = col; cx.shadowColor = col; cx.shadowBlur = 24;
  cx.lineWidth = 7.5;
  cx.beginPath(); cx.moveTo(-14, 0); cx.lineTo(tip * (0.35 + 0.65 * prog), 0); cx.stroke();
  /* a hot core */
  cx.globalAlpha = fade * 0.95;
  cx.strokeStyle = "#ffffff"; cx.shadowBlur = 12; cx.lineWidth = 2.4;
  cx.beginPath(); cx.moveTo(-8, 0); cx.lineTo(tip * (0.5 + 0.5 * prog), 0); cx.stroke();
  /* the punched tail — short wedges behind the beam that shrink with the strike */
  cx.shadowBlur = 0;
  cx.strokeStyle = colTail;
  cx.globalAlpha = fade * 0.72;
  const tailLen = 26 * (1 - prog * 0.6);
  for (let i = -1; i <= 1; i++) {
    if (i === 0) continue;
    cx.lineWidth = Math.abs(i) === 1 ? 3.4 : 1.4;
    cx.beginPath();
    cx.moveTo(-(12 + tailLen * 0.55), i * 3.4);
    cx.lineTo(-(4 + tailLen * 0.3), i * 1.2);
    cx.stroke();
  }
  /* the tip flare at the strike moment */
  if (prog > 0.42 && prog < 0.92) {
    const f = 1 - Math.abs(prog - 0.68) * 2.6;
    if (f > 0) {
      cx.globalAlpha = fade * f * 0.85;
      cx.fillStyle = "#ffffff"; cx.shadowColor = "#ffffff"; cx.shadowBlur = 16;
      cx.beginPath(); cx.ellipse(tip * (0.5 + 0.5 * prog), 0, 9 * f, 4.6 * f, 0, 0, TAU); cx.fill();
    }
  }
  /* the lance punches a blue star through the hole and drags smoke behind the wound */
  if (weapon === YI_WEAPON_LANCE) {
    const bx = tip * (0.5 + 0.5 * prog);
    const sf = Math.max(0, 1 - Math.abs(prog - 0.62) * 2.2);
    if (sf > 0) {
      cx.globalAlpha = fade * sf * 0.9;
      cx.strokeStyle = col; cx.shadowColor = col; cx.shadowBlur = 18; cx.lineWidth = 2.0;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4;
        cx.beginPath();
        cx.moveTo(bx + Math.cos(a) * 4, Math.sin(a) * 4);
        cx.lineTo(bx + Math.cos(a) * 18, Math.sin(a) * 18);
        cx.stroke();
      }
    }
    cx.globalAlpha = fade * 0.28; cx.strokeStyle = "#2a3240"; cx.shadowBlur = 0; cx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const sw2 = Math.sin(i * 2.4 + prog * 6) * 5;
      cx.beginPath();
      cx.moveTo(bx * 0.5, i ? 8 : -8);
      cx.quadraticCurveTo(bx * 0.3, (i ? 14 : -14) + sw2, bx * 0.12, (i ? 4 : -4) + sw2 * 0.6);
      cx.stroke();
    }
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* a slam burst raised by a crushing weapon — a shockwave ring and radiating spokes
   at the far point of the blow */
function drawYiSlamFx(px, py, ang, reach, k, weapon) {
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  /* the burst appears in the first half of the strike and collapses by the end */
  const appear = k < 0.24 ? k / 0.24 : 1 - Math.max(0, k - 0.52) * 1.75;
  if (appear <= 0.02) return;
  const grow = 8 + (1 - Math.abs(k - 0.22) * 1.6) * 16;
  const cxP = px + Math.cos(ang) * reach * 0.78;
  const cyP = py + Math.sin(ang) * reach * 0.78;
  cx.save();
  cx.translate(cxP, cyP);
  cx.lineCap = "round";
  /* the shockwave ring */
  cx.shadowColor = col; cx.shadowBlur = 14;
  cx.globalAlpha = appear * 0.85;
  cx.strokeStyle = col; cx.lineWidth = 4.4;
  cx.beginPath(); cx.arc(0, 0, grow, 0, TAU); cx.stroke();
  cx.globalAlpha = appear * 0.95;
  cx.strokeStyle = "#ffffff"; cx.shadowBlur = 6; cx.lineWidth = 1.6;
  cx.beginPath(); cx.arc(0, 0, grow * 0.88, 0, TAU); cx.stroke();
  /* radiating spokes — six cracks fly outwards */
  cx.shadowBlur = 0;
  cx.strokeStyle = colTail;
  for (let i = 0; i < 7; i++) {
    const a = ang + (i / 7 - 0.5) * 1.8;
    const inner = grow * 0.75, outer = grow * (1.35 + (i % 2) * 0.35);
    cx.globalAlpha = appear * (0.72 + (i % 2) * 0.25);
    cx.lineWidth = i % 2 ? 1.1 : 2.3;
    cx.beginPath();
    cx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    cx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    cx.stroke();
  }
  cx.globalAlpha = appear * 0.6;
  cx.fillStyle = "#fff";
  cx.beginPath(); cx.arc(0, 0, grow * 0.42, 0, TAU); cx.fill();
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* the lash — the chain's own path thrown past its barbed head as a thread of light.
   It reads as length, not as a cut: the whole chain is in the strike. */
function drawYiLashFx(P, px, py, ang, reach, k, weapon, dir) {
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  const d = dir < 0 ? -1 : 1;
  /* the crack: nothing on the windup, full at the throw, a long bleeding afterimage */
  const appear = k < 0.16 ? k / 0.16 : 1 - Math.max(0, k - 0.48) * 1.65;
  if (appear <= 0.02) return;
  const pts = P && P.yiWhipPts;
  cx.save();
  cx.translate(px, py);
  cx.lineCap = "round";
  if (pts && pts.length > 2) {
    const head = pts[pts.length - 1];
    const ha = P.yiWhipAng || ang;
    const ux = Math.cos(ha), uy = Math.sin(ha);
    /* the smear is the orbit of the chain's head — it starts where the head is and trails behind,
       so it can never float free of the iron */
    const R = Math.max(10, Math.hypot(head[0], head[1]));
    const aHead = Math.atan2(head[1], head[0]);
    const span = (0.62 + 0.62 * Math.min(1, k * 1.4));
    const a0 = aHead - d * span;
    const lo = Math.min(a0, aHead), hi = Math.max(a0, aHead);
    const arc = (from, style, width, alpha, blur) => {
      cx.globalAlpha = appear * alpha;
      cx.strokeStyle = style; cx.shadowColor = style; cx.shadowBlur = blur; cx.lineWidth = width;
      cx.beginPath(); cx.arc(0, 0, R, lo + (hi - lo) * from, hi); cx.stroke();
    };
    arc(0.34, colTail, 6, 0.05, 13);
    arc(0.5, colTail, 2.6, 0.10, 10);
    arc(0.58, "#0b0b11", 1.2, 0.26, 0);
    arc(0.6, col, 1.1, 0.9, 10);
    arc(0.74, "#ffffff", 0.42, 0.95, 5);
    /* the head itself cracks past the tip, along the chain's own line */
    const over = 12 + 34 * Math.min(1, k * 1.5);
    /* a short streak off the barbs */
    cx.globalAlpha = appear * 0.85;
    cx.strokeStyle = "#ffffff"; cx.shadowColor = col; cx.shadowBlur = 12; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(head[0] + ux * 13, head[1] + uy * 13);
    cx.lineTo(head[0] + ux * (13 + over * 0.62), head[1] + uy * (13 + over * 0.62)); cx.stroke();
    /* the point flash, then gone */
    if (k > 0.28 && k < 0.96) {
      const f = 1 - Math.abs(k - 0.56) * 2.3;
      if (f > 0) {
        const tx = head[0] + ux * (13 + over * 0.55), ty = head[1] + uy * (13 + over * 0.55);
        const vx2 = -uy, vy2 = ux;
        cx.globalAlpha = appear * f * 0.95;
        cx.shadowColor = "#ffffff"; cx.shadowBlur = 20;
        cx.fillStyle = "#ffffff";
        cx.beginPath();
        cx.moveTo(tx + ux * 16 * f, ty + uy * 16 * f);
        cx.lineTo(tx + vx2 * 5.2 * f, ty + vy2 * 5.2 * f);
        cx.lineTo(tx - ux * 3.4 * f, ty - uy * 3.4 * f);
        cx.lineTo(tx - vx2 * 5.2 * f, ty - vy2 * 5.2 * f);
        cx.closePath(); cx.fill();
        /* a few sparks thrown off the point */
        cx.shadowBlur = 0; cx.fillStyle = col;
        for (let s = 0; s < 3; s++) {
          const sa = ha + (s - 1) * 0.5;
          cx.globalAlpha = appear * f * 0.6;
          cx.beginPath();
          cx.arc(tx + Math.cos(sa) * (12 + s * 5) * f, ty + Math.sin(sa) * (12 + s * 5) * f,
            1.6 * f, 0, TAU);
          cx.fill();
        }
      }
    }
  } else {
    /* no chain path this frame — a thin straight whip-line instead */
    const headA = ang + d * (-0.55 + 1.45 * Math.min(1, Math.min(1, k / YI_SWEEP_SHARE) * 1.1));
    cx.globalAlpha = appear * 0.5;
    cx.strokeStyle = colTail; cx.shadowColor = colTail; cx.shadowBlur = 16; cx.lineWidth = 8;
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(Math.cos(headA) * reach * 0.9, Math.sin(headA) * reach * 0.9); cx.stroke();
    cx.globalAlpha = appear * 0.9;
    cx.strokeStyle = col; cx.shadowBlur = 10; cx.lineWidth = 2.2;
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(Math.cos(headA) * reach * 0.95, Math.sin(headA) * reach * 0.95); cx.stroke();
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* Sizzling Wound's standing storm — a low ring of cyan current and violet thorn-light
   that clings to him between swings. Deterministic from Game.time, so guests agree. */
function drawYiSizzleAura(px, py, t) {
  const pulse = 0.55 + 0.45 * Math.sin(t * 3.1);
  cx.save();
  cx.translate(px, py);
  cx.lineCap = "round";
  /* the ground ring */
  cx.globalAlpha = 0.22 + 0.16 * pulse;
  cx.strokeStyle = "#2f6cff"; cx.shadowColor = "#3a7bff"; cx.shadowBlur = 14; cx.lineWidth = 2.0;
  cx.beginPath(); cx.ellipse(0, 5, 18 + pulse * 4, 6.5 + pulse * 1.6, 0, 0, TAU); cx.stroke();
  cx.globalAlpha = 0.14 + 0.1 * pulse;
  cx.strokeStyle = "#7a3cff"; cx.shadowColor = "#7a3cff"; cx.shadowBlur = 12; cx.lineWidth = 1.2;
  cx.beginPath(); cx.ellipse(0, 5, 24 + pulse * 5, 9 + pulse * 2, 0, 0, TAU); cx.stroke();
  /* orbiting bolts climbing his body */
  for (let i = 0; i < 5; i++) {
    const ph = t * 1.7 + i * 1.26;
    const a = ph % TAU;
    const rx = 13 + Math.sin(ph * 0.7) * 3;
    const ry = 20 + Math.cos(ph * 0.9) * 6;
    const x0 = Math.cos(a) * rx, y0 = Math.sin(a) * ry * 0.55 - 4;
    const x1 = x0 + Math.sin(ph * 5.1) * 5, y1 = y0 - 6 - (i % 3) * 3;
    cx.globalAlpha = 0.35 + 0.3 * ((i * 0.37) % 1);
    cx.strokeStyle = i % 2 ? "#6fd8ff" : "#3a7bff";
    cx.shadowColor = "#2f6cff"; cx.shadowBlur = 9; cx.lineWidth = i % 2 ? 1.0 : 1.6;
    cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo((x0 + x1) * 0.5, (y0 + y1) * 0.5); cx.lineTo(x1, y1); cx.stroke();
  }
  /* a violet thorn curling up off the wound */
  cx.globalAlpha = 0.3 + 0.14 * pulse;
  cx.strokeStyle = "#7a3cff"; cx.shadowColor = "#7a3cff"; cx.shadowBlur = 10; cx.lineWidth = 1.4;
  cx.beginPath();
  cx.moveTo(-4, -6);
  cx.quadraticCurveTo(-9 + Math.sin(t * 2.2) * 3, -16, -3 + Math.sin(t * 3.1) * 4, -26);
  cx.stroke();
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* Furioso-Replica on the Dashboard — black smoke is drawn toward him, pulled off the
   room by the promise of the cut. Deterministic, so it reads the same on every client. */
function drawYiFuriosoSmoke(px, py, t) {
  cx.save();
  cx.translate(px, py);
  cx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const ph = (t * 0.6 + i * 0.37) % 1;
    const a = i * 1.13 + t * 0.25;
    const far = 52 + 26 * ((i * 0.61) % 1);
    const d = far * (1 - ph);
    const x0 = Math.cos(a) * d, y0 = Math.sin(a) * d * 0.7;
    const sway = Math.sin(t * 2.4 + i * 1.7) * 5 * (1 - ph * 0.5);
    cx.globalAlpha = 0.20 * ph * (0.6 + 0.4 * ((i * 0.43) % 1));
    cx.strokeStyle = "#0a0a10"; cx.shadowColor = "#0a0a10"; cx.shadowBlur = 8;
    cx.lineWidth = 3.4 * (1 - ph * 0.6);
    cx.beginPath();
    cx.moveTo(x0 + sway, y0 - 2);
    cx.quadraticCurveTo(x0 * 0.6 + sway * 1.4, y0 * 0.6 - 4, x0 * 0.22, y0 * 0.22 - 2);
    cx.stroke();
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* the warden's body — drawn from drawWarden() */
/* with nothing to cut, the Oracle's weapon stays in its base form — the Vial does not
   take a shape until the Prescript shows it a target on screen */
function yiHasQuarry(p) {
  if (typeof enemies !== "undefined" && enemies) {
    const cam = Game.cam || { x: 0, y: 0 };
    const pad = 30;
    const L = cam.x - pad, T = cam.y - pad;
    const R = cam.x + VW + pad, B = cam.y + VH + pad;
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      if (e.x >= L && e.x <= R && e.y >= T && e.y <= B) return true;
    }
  }
  if (Game.pvpMode && typeof players !== "undefined") {
    for (const foe of players) {
      if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
      return true;
    }
  }
  return false;
}

/* the base form — a sealed canister of the black liquid, gold-banded, on a gold chain,
   hovering above his open glove */
function drawYiVial(px, py, aim, t) {
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  /* the open glove beneath it, fingers fanned */
  cx.fillStyle = YI_COL.glove;
  cx.strokeStyle = "#8f8a80"; cx.lineWidth = 0.7;
  cx.beginPath(); cx.ellipse(9.6, -4.2, 2.7, 1.9, 0.12, 0, TAU); cx.fill(); cx.stroke();
  for (let i = 0; i < 3; i++) {
    cx.beginPath();
    cx.ellipse(11.7 + i * 0.35, -5.7 + i * 1.15, 1.05, 0.66, 0.18, 0, TAU);
    cx.fill(); cx.stroke();
  }
  /* he tosses the Vial and catches it again — the base form never quite sits still.
     This is the same pose as the evade frame: the canister hanging above the open palm. */
  const period = 3.4;
  const u = (t % period) / period;
  const toss = u < 0.42 ? 0 : Math.sin(Math.PI * (u - 0.42) / 0.58);
  const drift = toss * 1.4;
  const lift = toss * 7.2;
  const inHand = -8.2;
  cx.globalAlpha = 0.26 * (1 - toss * 0.8);
  cx.fillStyle = YI_COL.gold;
  cx.beginPath(); cx.ellipse(9.6, -4.2, 3.0, 0.9, 0, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  /* the thread of the throw */
  if (toss > 0.08) {
    cx.globalAlpha = 0.22 * toss;
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 0.8;
    cx.setLineDash([1.4, 2.6]);
    cx.beginPath();
    cx.moveTo(9.6, -5.4);
    cx.quadraticCurveTo(9.6 + drift * 0.4, inHand - lift * 0.5, 9.6 + drift, inHand - lift + 2.0);
    cx.stroke();
    cx.setLineDash([]);
    cx.globalAlpha = 1;
  }

  /* the Vial itself, mid-toss */
  cx.save();
  cx.translate(9.6 + drift, inHand - lift);
  cx.rotate(-0.24 + toss * 0.85 + Math.sin(t * 1.6) * 0.04 * (1 - toss));
  /* the gold chain handle, looped above the canister */
  const arc = (u) => {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return [a * 6.6 + c * -6.8, a * -1.8 + b * -15.2 + c * -1.8];
  };
  cx.strokeStyle = "#c9a44e"; cx.shadowColor = YI_COL.gold; cx.shadowBlur = 0;
  cx.lineWidth = 0.8;
  for (let i = 0; i < 9; i++) {
    const u = (i + 0.5) / 9;
    const p0 = arc(u - 0.012), p1 = arc(u + 0.012);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + (i % 2 ? Math.PI / 2 : 0);
    cx.save();
    cx.translate(p0[0], p0[1]); cx.rotate(ang);
    cx.beginPath(); cx.ellipse(0, 0, 1.0, 0.45, 0, 0, TAU);
    cx.stroke();
    cx.restore();
  }
  /* the clasp where the chain meets the cap */
  cx.fillStyle = "#24252c"; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 0.9;
  cx.beginPath(); cx.arc(6.6, -1.8, 1.05, 0, TAU); cx.fill(); cx.stroke();

  /* the canister body */
  const r = 2.75, half = 7.6;
  cx.shadowColor = "#8a7440"; cx.shadowBlur = 3;
  cx.fillStyle = "#24252c"; cx.strokeStyle = "#6a6d78"; cx.lineWidth = 0.8;
  cx.beginPath();
  cx.moveTo(-half, -r); cx.lineTo(half, -r);
  cx.quadraticCurveTo(half + 1.9, 0, half, r);
  cx.lineTo(-half, r);
  cx.quadraticCurveTo(-half - 1.9, 0, -half, -r);
  cx.closePath(); cx.fill(); cx.stroke();
  cx.shadowBlur = 0;
  const grd = cx.createLinearGradient(0, -r, 0, r);
  grd.addColorStop(0, "#e2e5ea"); grd.addColorStop(0.42, "#a8abb4"); grd.addColorStop(1, "#555761");
  cx.fillStyle = grd;
  cx.beginPath(); cx.rect(-half + 0.7, -r + 0.75, half * 2 - 1.4, r * 2 - 1.5); cx.fill();
  /* gold bands */
  cx.fillStyle = YI_COL.gold; cx.shadowColor = YI_COL.gold; cx.shadowBlur = 2.5;
  for (const bx of [-4.6, 4.6]) cx.fillRect(bx - 0.8, -r + 0.5, 1.6, r * 2 - 1.0);
  /* seam, sheen and the dark window of liquid */
  cx.shadowBlur = 0;
  cx.strokeStyle = "#3c3d45"; cx.lineWidth = 0.7;
  cx.beginPath(); cx.moveTo(-half + 1, 0.5); cx.lineTo(half - 1, 0.5); cx.stroke();
  cx.strokeStyle = "#f4f6fa"; cx.globalAlpha = 0.7; cx.lineWidth = 0.8;
  cx.beginPath(); cx.moveTo(-half + 1.2, -r + 1.15); cx.lineTo(half - 1.2, -r + 1.15); cx.stroke();
  cx.globalAlpha = 1;
  cx.fillStyle = "#0e0e16";
  cx.beginPath(); cx.ellipse(0, 0.15, 2.1, 1.2, 0, 0, TAU); cx.fill();
  cx.fillStyle = "#2b2b3a";
  cx.beginPath(); cx.ellipse(-1.1, -0.85, 0.75, 0.45, 0, 0, TAU); cx.fill();
  cx.restore();
  cx.restore();
}

function drawYiWarden(P, px, py, aim, col, tint, hpFrac) {
  const t = Game.time;
  /* the pattern's pose, and the body it carries: a dash rides the aim, a
     crouch drops the weight back off the front foot */
  const an = yiAnimState(P);
  /* a blow that really carries him needs no drawn lean — the body itself
     travels; the leaned carry is only for flourishes that do not move px */
  const drawDash = an.def.push ? 0 : an.dash;
  const carry = drawDash - an.crouch * 4;
  const bpx = px + Math.cos(aim) * carry;
  const bpy = py + Math.sin(aim) * carry + an.crouch * 1.5;

  /* the standing storm of the Sizzling Wound, and the black smoke that Furioso
     draws off the room while it waits on the Dashboard */
  if ((P.yiWoundState | 0) === 2) drawYiSizzleAura(bpx, bpy, t);
  if ((P.yiProc || 0) >= YI_PROC_MAX && !P.yiFuriosoUsed) drawYiFuriosoSmoke(bpx, bpy, t);

  /* the coat streams behind him — one black ribbon, one splash of old dark blood */
  const sway = Math.sin(t * 2.3 + px * 0.017) * 2.4;
  cx.save();
  cx.translate(bpx, bpy);
  cx.rotate(aim + Math.PI);
  cx.globalAlpha = 0.6;
  cx.fillStyle = YI_COL.suit;
  cx.beginPath();
  cx.moveTo(4, -9);
  cx.quadraticCurveTo(19, -13 + sway, 27, -3 + sway);
  cx.quadraticCurveTo(20, 2, 25, 10 - sway);
  cx.quadraticCurveTo(11, 9, 4, 9);
  cx.closePath(); cx.fill();
  cx.globalAlpha = 0.55;
  cx.strokeStyle = YI_COL.blood; cx.lineWidth = 2.1; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(7, 4.5); cx.quadraticCurveTo(15, 6 + sway, 21, 3 - sway); cx.stroke();
  cx.restore();
  cx.globalAlpha = 1;

  /* body: the long coat, black trimmed with gold */
  cx.save();
  cx.translate(bpx, bpy);
  cx.rotate(aim);
  cx.fillStyle = YI_COL.suit;
  cx.beginPath();
  cx.moveTo(6, -6.5);
  cx.quadraticCurveTo(-2, -9, -11, -5.5);
  cx.quadraticCurveTo(-14.5, 0, -11, 5.5);
  cx.quadraticCurveTo(-2, 9, 6, 6.5);
  cx.quadraticCurveTo(9.5, 0, 6, -6.5);
  cx.closePath(); cx.fill();
  cx.strokeStyle = YI_COL.suitDark; cx.lineWidth = 1.1; cx.stroke();

  /* the wound across the right side of his face — the side he kept */
  cx.strokeStyle = YI_COL.blood; cx.lineWidth = 1.6; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(3, -6.4); cx.quadraticCurveTo(6, -4.4, 8.4, -2.6); cx.stroke();
  cx.globalAlpha = 0.9; cx.fillStyle = YI_COL.bloodHi;
  cx.beginPath(); cx.arc(8.6, -2.4, 1.15, 0, TAU); cx.fill(); cx.globalAlpha = 1;

  /* white shirt, black cravat, gold badge at the breast */
  cx.fillStyle = YI_COL.shirt;
  cx.beginPath(); cx.moveTo(7.2, -3.4); cx.lineTo(3.6, 0); cx.lineTo(7.2, 3.4); cx.closePath(); cx.fill();
  cx.fillStyle = YI_COL.suitDark;
  cx.beginPath(); cx.moveTo(7.2, -1.3); cx.lineTo(3.6, 0); cx.lineTo(7.2, 1.3); cx.closePath(); cx.fill();
  cx.fillStyle = YI_COL.gold;
  cx.beginPath(); cx.arc(1, -3.4, 1.15, 0, TAU); cx.fill();

  /* white gloves — the Oracle's fingers are always clean */
  cx.fillStyle = YI_COL.glove;
  cx.beginPath(); cx.ellipse(8.6, -4.6, 1.6, 1.2, 0.5, 0, TAU); cx.fill();
  cx.beginPath(); cx.ellipse(8.6, 4.6, 1.6, 1.2, -0.5, 0, TAU); cx.fill();
  drawWounds(cx, hpFrac, 11);

  /* the head: black hair, one gold eye out of the shadow, glasses' glare */
  cx.fillStyle = "#0d0d11";
  cx.beginPath(); cx.ellipse(4.4, 0, 3.6, 3.1, 0, 0, TAU); cx.fill();
  const gl = 0.55 + 0.45 * Math.sin(t * 9);
  cx.shadowColor = YI_COL.glass; cx.shadowBlur = 8 * gl;
  cx.fillStyle = YI_COL.glass; cx.globalAlpha = 0.9;
  cx.beginPath(); cx.ellipse(6.4, -1.5, 1.15, 0.72, 0.4, 0, TAU); cx.fill();
  cx.globalAlpha = 0.55;
  cx.beginPath(); cx.ellipse(6.7, 1.4, 0.85, 0.5, -0.35, 0, TAU); cx.fill();
  cx.shadowBlur = 0; cx.globalAlpha = 1;
  /* SIZZLING WOUND — now and then the side of his face he kept goes black, and
     a red smile cuts across it. Deterministic, so every client sees the same. */
  if ((P.yiWoundState | 0) === 2 && Math.sin(t * 0.47 + px * 0.01) > 0.88) {
    cx.save();
    cx.beginPath(); cx.ellipse(4.4, 0, 3.6, 3.1, 0, 0, TAU); cx.clip();
    cx.globalAlpha = 0.94; cx.fillStyle = "#05050a";
    cx.beginPath(); cx.ellipse(5.4, 1.9, 3.6, 2.7, 0.28, 0, TAU); cx.fill();
    cx.globalAlpha = 1;
    cx.strokeStyle = "#e01c2a"; cx.shadowColor = "#ff2b3a"; cx.shadowBlur = 6;
    cx.lineWidth = 1.1; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(4.0, 1.9); cx.quadraticCurveTo(6.4, 3.5, 8.1, 1.1); cx.stroke();
    cx.restore();
  }
  cx.restore();

  /* nothing to cut — the Vial keeps its base form and he tosses it over his palm */
  if (!(P.yiSlashT > 0) && !(P.yiHoldT > 0) && !yiHasQuarry(P)) {
    drawYiVial(px, py, aim, t);
    cx.globalAlpha = 1; cx.shadowBlur = 0;
    return;
  }

  /* the Vial congeals — this swing answers the Prescript with its own vessel
     and its own beat of the pattern (see YI_COMBO_ANIM) */
  const weapon = an.weapon;
  const armDir = P.yiSlashDir < 0 ? -1 : 1;
  const swinging = an.swinging;
  const sweep = an.k / YI_SWEEP_SHARE;
  /* thrust drives the fist at the target; the arm angle comes straight from
     the timeline (positive = raised), mirrored left or right by this swing's roll */
  const armExt = an.thrust * 9;
  cx.save();
  cx.translate(bpx, bpy);
  if (armExt) cx.translate(Math.cos(aim) * armExt, Math.sin(aim) * armExt);
  const ba = swinging
    ? aim - armDir * an.arm * YI_ARM_ARC
    : aim + 0.22;
  const cosA = Math.cos(ba), sinA = Math.sin(ba);
  const hand = 7;
  /* each weapon carries its own length — a rapier is long and thin, a hammer is beastly.
     form scales it while the Vial is still congealing (the greatsword's held caduceus) */
  const fullLen = weapon === YI_WEAPON_RAPIER ? 88
            : weapon === YI_WEAPON_LANCE ? 86
            : weapon === YI_WEAPON_HAMMER ? 44
            : weapon === YI_WEAPON_SCYTHE ? 74
            : weapon === YI_WEAPON_HATCHET ? 44
            : weapon === YI_WEAPON_WHIP ? 86
            : weapon === YI_WEAPON_GREATSWORD ? 64
            : weapon === YI_WEAPON_STILETTO ? 52
            : 54 + 12 * Math.sin(Math.PI * Math.min(1, sweep));
  const len = fullLen * (0.2 + 0.8 * an.form);
  const hiltX = cosA * hand, hiltY = sinA * hand;
  const tipX = cosA * len, tipY = sinA * len;
  let edge = tint || yiArcColor(weapon);
  if (!P.gunSkin && !(P.runes && Object.keys(P.runes).length)) edge = yiArcColor(weapon);
  cx.lineCap = "round";
  cx.shadowColor = edge; cx.shadowBlur = (P.yiSlashT > 0 || P.yiMarkT > 0) ? 12 : 7;
  /* dim back, pale face, white hot edge — organs in three tones */
  cx.strokeStyle = YI_COL.suitDark; cx.lineWidth = 3.9;
  /* weapon-specific silhouettes — they read from across the arena */
  if (weapon === YI_WEAPON_HATCHET) {
    /* short haft, and the wedge head — with an eye in it */
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(cosA * (len * 0.62), sinA * (len * 0.62)); cx.stroke();
    cx.strokeStyle = "#2a2a30"; cx.lineWidth = 4.5;
    cx.beginPath(); cx.moveTo(cosA * (len * 0.58), sinA * (len * 0.58)); cx.lineTo(cosA * len, sinA * len); cx.stroke();
    /* the axe head */
    const ax = cosA * len, ay = sinA * len, perpA = ba + Math.PI / 2;
    const px = Math.cos(perpA), py = Math.sin(perpA);
    cx.fillStyle = "#3c3c44"; cx.strokeStyle = "#3c3c44"; cx.lineWidth = 1.4;
    cx.beginPath();
    cx.moveTo(ax - cosA * 8 - px * 5, ay - sinA * 8 - py * 5);
    cx.lineTo(ax - cosA * 8 + px * 5, ay - sinA * 8 + py * 5);
    cx.lineTo(ax - cosA * 2 + px * 5, ay - sinA * 2 + py * 5);
    cx.lineTo(ax - cosA * 2 - px * 5, ay - sinA * 2 - py * 5);
    cx.closePath(); cx.fill();
    cx.stroke();
    /* pale edge */
    cx.strokeStyle = YI_COL.slash; cx.shadowBlur = 6; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(ax - cosA * 8 + px * 4.6, ay - sinA * 8 + py * 4.6);
    cx.lineTo(ax - cosA * 2.2 + px * 2, ay - sinA * 2.2 + py * 2); cx.stroke();
  } else if (weapon === YI_WEAPON_STILETTO) {
    /* a needle — thin shadow, thinner body, barely there edge */
    cx.strokeStyle = "#14141a"; cx.lineWidth = 2.4;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#cfd6dd"; cx.shadowBlur = 10; cx.lineWidth = 1.3;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#ffffff"; cx.shadowBlur = 4; cx.lineWidth = 0.6;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 3, hiltY + sinA * 3); cx.lineTo(tipX - cosA * 1, tipY - sinA * 1); cx.stroke();
  } else if (weapon === YI_WEAPON_BASTARD) {
    /* classic longe — dark fuller, pale face, white bite */
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = YI_COL.slash; cx.shadowBlur = 9; cx.lineWidth = 2.2;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2); cx.lineTo(tipX - cosA * 1.5, tipY - sinA * 1.5); cx.stroke();
    cx.strokeStyle = YI_COL.arcEdge; cx.shadowBlur = 5; cx.lineWidth = 0.95;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 3, hiltY + sinA * 3); cx.lineTo(tipX - cosA * 3, tipY - sinA * 3); cx.stroke();
    /* wrap at grip */
    cx.strokeStyle = "#2b2b33"; cx.shadowBlur = 0; cx.lineWidth = 4.2;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(hiltX + cosA * 6, hiltY + sinA * 6); cx.stroke();
  } else if (weapon === YI_WEAPON_RAPIER) {
    /* the thin needle — a smoking absinthe sliver, silver light on a steel thread */
    cx.strokeStyle = "#0e0e13"; cx.lineWidth = 1.7;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#e6ecf2"; cx.shadowBlur = 12; cx.lineWidth = 1.1;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#ffffff"; cx.shadowBlur = 4; cx.lineWidth = 0.45;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 4, hiltY + sinA * 4); cx.lineTo(tipX - cosA * 2, tipY - sinA * 2); cx.stroke();
    /* king-guard: a ring at the hilt */
    cx.shadowBlur = 0; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.4;
    const perpA = ba + Math.PI / 2;
    cx.beginPath(); cx.ellipse(hiltX + cosA * 2, hiltY + sinA * 2, 4.6, 2.6, perpA, 0, TAU); cx.stroke();
  } else if (weapon === YI_WEAPON_HAMMER) {
    /* the skull-breaker — handle wide, head wider, an iron meat-grinder of an idol */
    cx.strokeStyle = "#2b2b33"; cx.lineWidth = 4.4;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(cosA * (len * 0.62), sinA * (len * 0.62)); cx.stroke();
    const hx = cosA * len, hy = sinA * len, perpA = ba + Math.PI / 2;
    const px = Math.cos(perpA) * 10, py = Math.sin(perpA) * 10;
    cx.fillStyle = "#3c3c44"; cx.strokeStyle = "#3c3c44"; cx.lineWidth = 1.6;
    /* the barrel of the hammer, drawn foreshortened as two stacked blocks */
    cx.beginPath();
    cx.moveTo(hx - cosA * 3 - px, hy - sinA * 3 - py);
    cx.lineTo(hx - cosA * 3 + px, hy - sinA * 3 + py);
    cx.lineTo(hx - cosA * 14 + px, hy - sinA * 14 + py);
    cx.lineTo(hx - cosA * 14 - px, hy - sinA * 14 - py);
    cx.closePath(); cx.fill();
    cx.stroke();
    /* glowing spike on the hammer face */
    cx.shadowBlur = 9; cx.fillStyle = "#873e3e";
    cx.beginPath(); cx.arc(hx - cosA * 4, hy - sinA * 4, 2.3, 0, TAU); cx.fill();
    cx.shadowBlur = 0; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.4;
    cx.beginPath(); cx.moveTo(cosA * (len * 0.52), sinA * (len * 0.52)); cx.lineTo(cosA * (len * 0.58), sinA * (len * 0.58)); cx.stroke();
  } else if (weapon === YI_WEAPON_GREATSWORD) {
    /* THE COLOSSAL — a black slab nearly as wide as his shoulders, tapering over its whole
       length to a needle point. A long grey plane down one face, three swept guard thorns,
       a barbed pommel-spike behind the fist, and smoke peeling off the spine. */
    const perpA = ba + Math.PI / 2;
    const pxn = Math.cos(perpA), pyn = Math.sin(perpA);
    const at = (a, b) => [cosA * a + pxn * b, sinA * a + pyn * b];
    const root = 8, wid = 9.0, tipL = len;
    cx.shadowColor = edge; cx.shadowBlur = 12;
    /* the slab */
    cx.fillStyle = "#16161f"; cx.strokeStyle = "#454552"; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(...at(root, -wid * 0.7));
    cx.lineTo(...at(root + 4, -wid));
    cx.quadraticCurveTo(...at(tipL * 0.56, -wid * 0.5), ...at(tipL, 0));
    cx.quadraticCurveTo(...at(tipL * 0.54, wid * 0.46), ...at(root + 4, wid));
    cx.lineTo(...at(root, wid * 0.7));
    cx.closePath(); cx.fill(); cx.stroke();
    /* the grey plane down the face — a narrow band of flat steel */
    cx.fillStyle = "#5f5f6d"; cx.shadowBlur = 0;
    cx.beginPath();
    cx.moveTo(...at(root + 5, -wid * 0.30));
    cx.lineTo(...at(root + 5, wid * 0.30));
    cx.lineTo(...at(tipL * 0.84, wid * 0.04));
    cx.lineTo(...at(tipL * 0.82, -wid * 0.07));
    cx.closePath(); cx.fill();
    /* a darker inset inside the plane, like the reference's second facet */
    cx.fillStyle = "#3a3a46";
    cx.beginPath();
    cx.moveTo(...at(root + 7, -wid * 0.16));
    cx.lineTo(...at(root + 7, wid * 0.10));
    cx.lineTo(...at(tipL * 0.60, wid * 0.02));
    cx.lineTo(...at(tipL * 0.58, -wid * 0.03));
    cx.closePath(); cx.fill();
    /* the cutting edge, cold and lit */
    cx.strokeStyle = YI_COL.arcEdge; cx.shadowColor = edge; cx.shadowBlur = 9; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(...at(root + 4.5, wid * 0.96));
    cx.quadraticCurveTo(...at(tipL * 0.54, wid * 0.44), ...at(tipL - 1.4, 0.4));
    cx.stroke();
    /* the notch where the edge steps in near the guard */
    cx.strokeStyle = "#0c0c12"; cx.lineWidth = 1.6; cx.shadowBlur = 0;
    cx.beginPath(); cx.moveTo(...at(root + 10, wid * 0.74)); cx.lineTo(...at(root + 8.6, wid * 0.34)); cx.stroke();
    /* three swept guard thorns, the outer pair longest */
    cx.fillStyle = "#0b0b11"; cx.strokeStyle = "#3a3a46"; cx.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) {
      const bx = 5.5 + i * 5.2;
      const span = 15.5 - i * 3.0;
      const back = 7.0 + i * 3.4;
      for (const sd of [1, -1]) {
        cx.beginPath();
        cx.moveTo(...at(bx, sd * 1.6));
        cx.lineTo(...at(bx - back, sd * span));
        cx.lineTo(...at(bx - back * 0.35, sd * span * 0.5));
        cx.lineTo(...at(bx + 2.6, sd * 3.2));
        cx.closePath(); cx.fill(); cx.stroke();
      }
    }
    /* the pommel-spike — a great barbed thorn behind the fist */
    cx.fillStyle = "#0b0b11"; cx.strokeStyle = "#3a3a46";
    cx.beginPath();
    cx.moveTo(...at(-2, -2.6));
    cx.lineTo(...at(-12, -3.4));
    cx.lineTo(...at(-26, 0));
    cx.lineTo(...at(-12, 3.4));
    cx.lineTo(...at(-2, 2.6));
    cx.closePath(); cx.fill(); cx.stroke();
    /* its barbs */
    for (const sd of [1, -1]) {
      cx.beginPath();
      cx.moveTo(...at(-9, sd * 2.4));
      cx.lineTo(...at(-16, sd * 7.6));
      cx.lineTo(...at(-7.4, sd * 2.0));
      cx.closePath(); cx.fill(); cx.stroke();
    }
    /* the chain of gold links at the grip */
    cx.fillStyle = YI_COL.gold; cx.shadowBlur = 5; cx.shadowColor = YI_COL.gold;
    for (let i = 0; i < 3; i++) {
      const gp = at(-4 - i * 3.6, i % 2 ? 2.6 : -2.6);
      cx.beginPath(); cx.arc(gp[0], gp[1], 1.05, 0, TAU); cx.fill();
    }
    /* black smoke peeling off the spine */
    cx.shadowColor = edge; cx.shadowBlur = 0;
    cx.strokeStyle = "#242430"; cx.lineWidth = 2.0; cx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const f = 0.34 + i * 0.2;
      const w0 = Math.sin(t * 4.1 + i * 2.1) * 3.2;
      const sp = at(tipL * f, -wid * 0.55 - 2.4);
      cx.beginPath();
      cx.moveTo(sp[0], sp[1]);
      cx.quadraticCurveTo(sp[0] - cosA * 5 + pxn * (w0 - 3), sp[1] - sinA * 5 + pyn * (w0 - 3),
                          sp[0] - cosA * 12 + pxn * w0 * 1.7, sp[1] - sinA * 12 + pyn * w0 * 1.7);
      cx.stroke();
    }
  } else if (weapon === YI_WEAPON_LANCE) {
    /* THE BORER — the reed of black liquid runs through the fist and ends at once in a
       colossal kite head: a socket that flares into a wide belly, then a long straight
       taper to a blue-hot needle. Four pale ribs fan from the socket into the blade. */
    const perpA = ba + Math.PI / 2;
    const pxn = Math.cos(perpA), pyn = Math.sin(perpA);
    const at = (a, b) => [cosA * a + pxn * b, sinA * a + pyn * b];
    /* the reed — he grips it just behind the head */
    cx.strokeStyle = "#15151d"; cx.lineWidth = 3.0; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(...at(-12, 0)); cx.lineTo(...at(12, 0)); cx.stroke();
    cx.strokeStyle = "#4c5464"; cx.lineWidth = 0.9;
    cx.beginPath(); cx.moveTo(...at(-11, -0.7)); cx.lineTo(...at(11, -0.7)); cx.stroke();
    /* the head */
    const socket = 9, belly = len * 0.44, wide = 11.4, tipL = len + 6;
    const headPath = new Path2D();
    headPath.moveTo(...at(socket, -1.4));
    headPath.quadraticCurveTo(...at(socket + 5, -5.4), ...at(belly, -wide));
    headPath.lineTo(...at(tipL, 0));
    headPath.lineTo(...at(belly, wide));
    headPath.quadraticCurveTo(...at(socket + 5, 5.4), ...at(socket, 1.4));
    headPath.closePath();
    cx.shadowColor = edge; cx.shadowBlur = 13;
    cx.fillStyle = "#0c0c13"; cx.strokeStyle = "#2f3744"; cx.lineWidth = 1.1;
    cx.fill(headPath); cx.stroke(headPath);
    /* the grey plane on the lower face */
    cx.fillStyle = "#2e2e3b"; cx.shadowBlur = 0;
    cx.beginPath();
    cx.moveTo(...at(socket + 2, 0.5));
    cx.lineTo(...at(belly, wide * 0.62));
    cx.lineTo(...at(tipL * 0.9, wide * 0.10));
    cx.lineTo(...at(tipL * 0.86, -wide * 0.06));
    cx.closePath(); cx.fill();
    /* four pale ribs fanning out of the socket — the reference's white struts */
    cx.save(); cx.clip(headPath);
    cx.strokeStyle = edge; cx.shadowColor = edge; cx.shadowBlur = 8; cx.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      const alongEnd = socket + (belly - socket) * (0.58 + i * 0.14);
      cx.globalAlpha = 0.9 - i * 0.14;
      cx.beginPath();
      cx.moveTo(...at(socket + 1.2, 0));
      cx.lineTo(...at(alongEnd, wide * (0.72 - i * 0.16) * (i % 2 ? 1 : -1)));
      cx.stroke();
    }
    cx.restore();
    cx.globalAlpha = 1;
    /* the long lit edges and the needle point */
    cx.strokeStyle = edge; cx.shadowBlur = 12; cx.lineWidth = 1.15;
    cx.beginPath();
    cx.moveTo(...at(belly, -wide)); cx.lineTo(...at(tipL, 0));
    cx.moveTo(...at(belly, wide)); cx.lineTo(...at(tipL, 0));
    cx.stroke();
    cx.fillStyle = "#eaf6ff";
    cx.beginPath(); cx.arc(...at(tipL, 0), 1.7, 0, TAU); cx.fill();
    /* the silver crossguard just ahead of the fist */
    cx.shadowBlur = 0; cx.strokeStyle = "#9aa2b0"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(...at(11, -7.4)); cx.lineTo(...at(11, 7.4)); cx.stroke();
    /* gold ferrule at the grip */
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.6;
    cx.beginPath(); cx.ellipse(hiltX, hiltY, 3.2, 2.0, perpA, 0, TAU); cx.stroke();
  } else if (weapon === YI_WEAPON_WHIP) {
    /* THE LASH — eight straight rods of black iron joined by four-point spike collars,
       ending in a broad barbed arrowhead. Gold ring where it leaves the glove.
       It does not hang from the hand: it is thrown, and it cracks at the far end. */
    const segN = 8;
    const step = len / segN;
    /* while the lash is out, an S travels down the chain — the tip is always a beat behind */
    const lashK = P.yiSlashT > 0 ? Math.min(1, Math.abs(an.arm) + 0.2) : 0;
    const rest = P.yiSlashT > 0 ? 0 : 1;
    /* an S runs down the chain as it is thrown, then dies out at full extension */
    const whipK = P.yiSlashT > 0 ? Math.sin(Math.PI * Math.min(1, an.k * 1.15)) : 0;
    const joints = [];
    let jx = hiltX, jy = hiltY;
    let ja = ba;
    for (let i = 0; i <= segN; i++) {
      const f = i / segN;
      joints.push([jx, jy]);
      /* a slow wave so the chain breathes at rest, and a hard curl when it is thrown */
      const wave = Math.sin(t * 5.4 - f * 4.4) * (0.05 + rest * 0.03);
      const curl = (f - 0.4) * 0.42 * (1 - lashK) * (1 + rest * 0.55);
      ja += wave + curl - Math.cos(f * 4.6 + 0.6) * 0.34 * whipK;
      jx += Math.cos(ja) * step;
      jy += Math.sin(ja) * step;
    }
    /* the rods */
    cx.shadowColor = edge; cx.shadowBlur = 6; cx.lineCap = "round";
    for (let i = 0; i < segN; i++) {
      const a0 = joints[i], a1 = joints[i + 1];
      cx.strokeStyle = "#0e0e13"; cx.lineWidth = 3.1;
      cx.beginPath(); cx.moveTo(a0[0], a0[1]); cx.lineTo(a1[0], a1[1]); cx.stroke();
      cx.strokeStyle = "#33333e"; cx.lineWidth = 1.1;
      cx.beginPath(); cx.moveTo(a0[0] + Math.cos(ja) * 0.6, a0[1] + Math.sin(ja) * 0.6);
      cx.lineTo(a1[0], a1[1]); cx.stroke();
    }
    /* the four-point spike collars — one at every joint, largest nearest the tip */
    cx.shadowBlur = 4;
    for (let i = 1; i < segN; i++) {
      const j = joints[i];
      const dirA = Math.atan2(joints[i + 1][1] - j[1], joints[i + 1][0] - j[0]);
      const ux = Math.cos(dirA), uy = Math.sin(dirA);
      const vx = -uy, vy = ux;
      const s = 3.1 + i * 0.22;
      cx.fillStyle = "#101016"; cx.strokeStyle = "#454550"; cx.lineWidth = 0.75;
      cx.beginPath();
      cx.moveTo(j[0] + ux * s * 1.35, j[1] + uy * s * 1.35);
      cx.lineTo(j[0] + vx * s * 0.62, j[1] + vy * s * 0.62);
      cx.lineTo(j[0] - ux * s * 1.35, j[1] - uy * s * 1.35);
      cx.lineTo(j[0] - vx * s * 0.62, j[1] - vy * s * 0.62);
      cx.closePath(); cx.fill(); cx.stroke();
      /* the collar's four barbs, biting out of the corners */
      cx.strokeStyle = "#2b2b33"; cx.lineWidth = 1.1;
      cx.beginPath();
      cx.moveTo(j[0] + vx * s * 1.55, j[1] + vy * s * 1.55);
      cx.lineTo(j[0] + vx * s * 0.5 + ux * s * 0.5, j[1] + vy * s * 0.5 + uy * s * 0.5);
      cx.moveTo(j[0] - vx * s * 1.55, j[1] - vy * s * 1.55);
      cx.lineTo(j[0] - vx * s * 0.5 + ux * s * 0.5, j[1] - vy * s * 0.5 + uy * s * 0.5);
      cx.stroke();
    }
    /* the barbed arrowhead at the far end */
    const last = joints[segN], prev = joints[segN - 1];
    const ha = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    /* the FX reads the chain's own path, so the motion trail never lies about where it is */
    P.yiWhipPts = joints;
    P.yiWhipAng = ha;
    const hux = Math.cos(ha), huy = Math.sin(ha);
    const hvx = -huy, hvy = hux;
    cx.shadowColor = edge; cx.shadowBlur = 8;
    cx.fillStyle = "#101016"; cx.strokeStyle = "#4a4a56"; cx.lineWidth = 0.9;
    cx.beginPath();
    cx.moveTo(last[0] + hux * 14, last[1] + huy * 14);
    cx.lineTo(last[0] + hvx * 3.4, last[1] + hvy * 3.4);
    cx.lineTo(last[0] - hux * 3.2, last[1] - huy * 3.2);
    cx.lineTo(last[0] - hvx * 3.4, last[1] - hvy * 3.4);
    cx.closePath(); cx.fill(); cx.stroke();
    /* swept wings behind the heads */
    cx.fillStyle = "#14141a";
    for (const side of [1, -1]) {
      cx.beginPath();
      cx.moveTo(last[0] + hvx * side * 3.2, last[1] + hvy * side * 3.2);
      cx.lineTo(last[0] + hux * 3.2 + hvx * side * 8.4, last[1] + huy * 3.2 + hvy * side * 8.4);
      cx.lineTo(last[0] + hux * 7.6 + hvx * side * 3.4, last[1] + huy * 7.6 + hvy * side * 3.4);
      cx.closePath(); cx.fill();
    }
    /* the pale edge of the point */
    cx.strokeStyle = edge; cx.lineWidth = 1.1; cx.shadowBlur = 7;
    cx.beginPath(); cx.moveTo(last[0] + hux * 4, last[1] + huy * 4);
    cx.lineTo(last[0] + hux * 13.4, last[1] + huy * 13.4); cx.stroke();
    cx.shadowBlur = 0;
    /* the gold ring where it leaves the glove */
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.5;
    cx.beginPath(); cx.ellipse(hiltX, hiltY, 4.2, 2.2, ba + Math.PI / 2, 0, TAU); cx.stroke();
  } else if (weapon === YI_WEAPON_SCYTHE) {
    /* THE REAPER — a crooked black haft banded with arrowhead ferrules, a forked butt-spike,
       and a huge sickle: a broad black leaf curling over him, pale along its inner edge. */
    const perpA = ba + Math.PI / 2;
    const pxn = Math.cos(perpA), pyn = Math.sin(perpA);
    const at = (a, b) => [cosA * a + pxn * b, sinA * a + pyn * b];
    const headAt = len * 0.60;
    /* the crooked haft — five joints, each nudged off the line */
    const haft = [];
    for (let i = 0; i <= 5; i++) {
      const f = i / 5;
      haft.push(at(-18 + f * (headAt + 18), Math.sin(f * 4.0) * 1.9));
    }
    cx.lineCap = "round";
    cx.strokeStyle = "#0d0d14"; cx.lineWidth = 3.6;
    cx.beginPath(); cx.moveTo(haft[0][0], haft[0][1]);
    for (let i = 1; i < haft.length; i++) cx.lineTo(haft[i][0], haft[i][1]);
    cx.stroke();
    cx.strokeStyle = "#34343f"; cx.lineWidth = 1.0;
    cx.beginPath(); cx.moveTo(haft[0][0], haft[0][1]);
    for (let i = 1; i < haft.length; i++) cx.lineTo(haft[i][0], haft[i][1]);
    cx.stroke();
    /* arrowhead ferrules banding the haft */
    cx.fillStyle = "#0d0d14"; cx.strokeStyle = "#3c3c48"; cx.lineWidth = 0.8;
    for (const fk2 of [1, 3, 4]) {
      const f = fk2 / 5;
      const hx2 = -18 + f * (headAt + 18);
      const bend2 = Math.sin(f * 4.0) * 1.9;
      for (const sd of [1, -1]) {
        cx.beginPath();
        cx.moveTo(...at(hx2 - 3.2, bend2));
        cx.lineTo(...at(hx2, bend2 + sd * 3.8));
        cx.lineTo(...at(hx2 + 3.4, bend2));
        cx.closePath(); cx.fill(); cx.stroke();
      }
    }
    /* the forked butt-spike */
    const bt = haft[0];
    cx.beginPath();
    cx.moveTo(bt[0] + pxn * 1.6, bt[1] + pyn * 1.6);
    cx.lineTo(bt[0] - cosA * 20 + pxn * 6.4, bt[1] - sinA * 20 + pyn * 6.4);
    cx.lineTo(bt[0] - cosA * 7 + pxn * 2.2, bt[1] - sinA * 7 + pyn * 2.2);
    cx.lineTo(bt[0] - cosA * 30 - pxn * 0.4, bt[1] - sinA * 30 - pyn * 0.4);
    cx.lineTo(bt[0] - cosA * 7 - pxn * 2.2, bt[1] - sinA * 7 - pyn * 2.2);
    cx.lineTo(bt[0] - cosA * 20 - pxn * 6.4, bt[1] - sinA * 20 - pyn * 6.4);
    cx.closePath(); cx.fill(); cx.stroke();
    /* the sickle — broad at the socket, tapering to a long hooked point */
    const r0 = haft[5];
    const sc = len + 14;
    cx.shadowColor = edge; cx.shadowBlur = 15;
    cx.fillStyle = "#14141d"; cx.strokeStyle = "#464652"; cx.lineWidth = 1.1;
    cx.beginPath();
    cx.moveTo(r0[0] - pxn * 1.2, r0[1] - pyn * 1.2);
    cx.quadraticCurveTo(...at(headAt + 9, -27), ...at(sc, -36));
    cx.quadraticCurveTo(...at(sc - 15, -15), ...at(headAt + 8, 5));
    cx.closePath(); cx.fill(); cx.stroke();
    /* a grey sheen riding the back of the crescent */
    cx.fillStyle = "#5d5d6b"; cx.shadowBlur = 0;
    cx.beginPath();
    cx.moveTo(...at(headAt + 4, -3));
    cx.quadraticCurveTo(...at(headAt + 11, -21), ...at(sc - 2, -34.4));
    cx.quadraticCurveTo(...at(headAt + 12, -14), ...at(headAt + 8, -1.4));
    cx.closePath(); cx.fill();
    /* the pale inner edge — the part that bites */
    cx.strokeStyle = "#d6dbe4"; cx.shadowColor = edge; cx.shadowBlur = 11; cx.lineWidth = 1.25;
    cx.beginPath();
    cx.moveTo(...at(headAt + 7, 3.6));
    cx.quadraticCurveTo(...at(sc - 15, -15), ...at(sc - 0.6, -35.4));
    cx.stroke();
    /* the barbed tip, hooking further round */
    cx.strokeStyle = "#0d0d14"; cx.lineWidth = 2.4; cx.shadowBlur = 6;
    cx.beginPath();
    cx.moveTo(...at(sc, -36));
    cx.quadraticCurveTo(...at(sc + 2.4, -41), ...at(sc - 2.6, -44.4));
    cx.stroke();
    /* the socket barb — a spike sweeping back off the root of the blade */
    cx.fillStyle = "#0d0d14"; cx.strokeStyle = "#3c3c48"; cx.lineWidth = 0.8;
    cx.beginPath();
    cx.moveTo(...at(headAt - 1, -1.4));
    cx.lineTo(...at(headAt - 11, -10.4));
    cx.lineTo(...at(headAt - 2.2, -12.4));
    cx.lineTo(...at(headAt + 4, -3.2));
    cx.closePath(); cx.fill(); cx.stroke();
    /* twin counter-forks under the socket */
    for (const sd of [1, -1]) {
      cx.beginPath();
      cx.moveTo(...at(headAt - 1.2, sd * 1.2));
      cx.lineTo(...at(headAt - 7.4, sd * 6.8));
      cx.lineTo(...at(headAt + 1.6, sd * 2.0));
      cx.closePath(); cx.fill(); cx.stroke();
    }
    /* gold spring at the grip */
    cx.shadowBlur = 0;
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.8;
    cx.beginPath(); cx.ellipse(hiltX, hiltY, 2.8, 1.7, perpA, 0, TAU); cx.stroke();
  } else {
    /* fallback — weapon 0 == HATCHET, no other weapon is meant to hit this path */
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
  }
  /* the off hand comes onto the haft for the heavy two-handed beats */
  if (an.two > 0.05) {
    const gx = hiltX - cosA * 3.4, gy = hiltY - sinA * 3.4;
    cx.globalAlpha = 0.9 * Math.min(1, an.two);
    cx.strokeStyle = YI_COL.suitDark; cx.lineWidth = 2.2; cx.shadowBlur = 0;
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(gx, gy); cx.stroke();
    cx.fillStyle = YI_COL.glove; cx.strokeStyle = "#8f8a80"; cx.lineWidth = 0.65;
    cx.beginPath(); cx.ellipse(gx, gy, 1.9, 1.35, ba + 0.35, 0, TAU); cx.fill(); cx.stroke();
    cx.globalAlpha = 1;
  }
  /* gold guard — always */
  cx.strokeStyle = YI_COL.gold; cx.lineWidth = 2.1; cx.shadowBlur = 0;
  const perpA2 = ba + Math.PI / 2;
  const perpX2 = Math.cos(perpA2) * 4.4, perpY2 = Math.sin(perpA2) * 4.4;
  cx.beginPath(); cx.moveTo(hiltX - perpX2, hiltY - perpY2); cx.lineTo(hiltX + perpX2, hiltY + perpY2); cx.stroke();
  cx.restore();

  /* the pattern's FX — each beat of the timeline is born where it is written:
     a crescent for a cut, a rail for a thrust, a slam for a crush, a thread of
     light for the lash */
  const reach = P.yiSlashReach || YI_REACH_BASE;
  const weaponFx = an.weapon;
  const dir = P.yiSlashDir < 0 ? -1 : 1;
  const sizzling = (P.yiWoundState | 0) === 2;
  if (P.yiSlashT > 0) {
    const fxList = (an.def.fx && an.def.fx.length) ? an.def.fx : [{ at: 0.04, d: 0.4 }];
    for (const f of fxList) {
      const k = clamp((an.k - f.at) / (f.d || 0.34), 0, 1);
      if (k <= 0 || k >= 1) continue;
      const kind = f.kind || yiFxKind(weaponFx);
      const fdir = f.dir == null ? dir : f.dir;
      const scale = f.scale || 1;
      if (kind === "stab") drawYiStabFx(bpx, bpy, P.yiSlashAng, reach * scale, k, weaponFx);
      else if (kind === "lash") drawYiLashFx(P, bpx, bpy, P.yiSlashAng, reach * scale, k, weaponFx, fdir);
      else if (kind === "slam") drawYiSlamFx(bpx, bpy, P.yiSlashAng, reach * scale, k, weaponFx);
      else {
        /* take the crescent's two ends from the blade's own angle at the
           beginning and end of this beat */
        const dur = f.d || 0.34;
        const a0 = -yiSampleAnim(an.def.keys, clamp(f.at, 0, 1)).arm * YI_ARM_ARC * armDir;
        const a1 = -yiSampleAnim(an.def.keys, clamp(f.at + dur, 0, 1)).arm * YI_ARM_ARC * armDir;
        drawYiSlashArc(bpx, bpy, P.yiSlashAng, reach * scale, k,
          f.alpha == null ? 1 : f.alpha, fdir, scale, weaponFx, false, a0, a1, sizzling);
      }
      /* Sizzling Wound — the electric thorns crackle off every kind of strike */
      if (sizzling) {
        const sAng = kind === "lash" ? (P.yiWhipAng || P.yiSlashAng) : P.yiSlashAng;
        drawYiSizzleSparks(bpx, bpy, sAng, reach * scale, k);
      }
    }
    /* Furioso-Replica is not a cut but a room being unmade */
    if (an.furioso) drawYiFuriosoFx(bpx, bpy, reach, an.k, weaponFx, sizzling);
    /* rune lanes and rear cuts keep their own crescents */
    if (P.yiSlashLanes && P.yiSlashLanes.length) {
      for (const L of P.yiSlashLanes) {
        const dk = (L.delay || 0) / (an.life || YI_SLASH_LIFE);
        const k = clamp((an.k - dk) / Math.max(0.15, 1 - dk), 0, 1);
        drawYiSlashArc(bpx + (L.dx || 0), bpy + (L.dy || 0), L.ang, reach, k,
          L.alpha == null ? 1 : L.alpha, L.dir == null ? dir : L.dir, L.scale || 1, L.weapon, !!L.cheap, null, null, sizzling);
      }
    }
  }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* Furioso-Replica's light: the ninefold cut arrives from every bearing at once,
   a white star at the centre, then the room falls quiet */
function drawYiFuriosoFx(px, py, reach, k, weapon, sizzle) {
  const ring = clamp(k / 0.55, 0, 1);
  if (ring <= 0) return;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const local = clamp((k - i * 0.035) / 0.34, 0, 1);
    if (local <= 0 || local >= 1) continue;
    const a = (i / n) * TAU + k * 1.8;
    drawYiSlashArc(px, py, a, reach * (0.78 + 0.16 * (i % 2)),
      local, 0.8, i % 2 ? 1 : -1, 0.72, weapon, true, null, null, sizzle);
  }
  /* the star where the scythe came down */
  const star = Math.max(0, 1 - Math.abs(k - 0.62) * 2.4);
  if (star > 0) {
    cx.save();
    cx.translate(px, py);
    cx.globalAlpha = star * 0.9;
    cx.strokeStyle = "#ffffff"; cx.shadowColor = yiArcColor(weapon); cx.shadowBlur = 22;
    cx.lineWidth = 2.1; cx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const r0 = 10 + (1 - star) * 22, r1 = r0 + 26 + star * 18;
      cx.beginPath();
      cx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      cx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      cx.stroke();
    }
    cx.globalAlpha = star * 0.5;
    cx.strokeStyle = yiArcColor(weapon); cx.lineWidth = 1.2;
    cx.beginPath(); cx.arc(0, 0, 18 + (1 - star) * 40, 0, TAU); cx.stroke();
    cx.restore();
  }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}
