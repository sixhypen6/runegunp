/* =========================================================
   RUNEGUN · Runes — stacking weapon mods
   Every rune and its stacking modifier, the loot pool / path-sealing rules, weapon-stat assembly and recompute.
   ========================================================= */
"use strict";


/* =========================================================
   STACK CURVE — diminishing returns on piled-up stacks
   The first STACK_FULL stacks of a rune count in full; every stack after that
   counts for less (a square-root taper) but never for nothing. Multiplying runes
   compound only through the full stacks, then grow additively on the curve —
   so 12 HEAVY is a monster, not a one-shot for every warden.
   ========================================================= */
const STACK_FULL = 3;
/* CLASSIC descents predate the taper: every stack past the third keeps its full
   value, exactly as it did before 7.0 (see stackCurve / stackMul below). */
function classicStacks() { return typeof Game !== "undefined" && Game.classicMode === true; }
/* n stacks → effective stacks: 1, 2, 3, then 3.8, 4.4, 5 … (12 ≈ 7.3, 24 ≈ 10.4).
   CLASSIC: no curve at all — n stacks are n effective stacks. */
function stackCurve(n) { return classicStacks() || n <= STACK_FULL ? n : STACK_FULL + 2 * (Math.sqrt(n - STACK_FULL + 1) - 1); }
/* a per-stack multiplier k over n stacks: k^n through the full stacks, then +(k−1)·k^STACK_FULL
   per effective stack. A cost (k < 1) tapers the same way, as the inverse of the matching gain.
   CLASSIC: plain k^n at every stack — the old, uncapped growth. */
function stackMul(k, n) {
  if (classicStacks()) return Math.pow(k, n);
  if (k < 1) return 1 / stackMul(1 / k, n);
  return n <= STACK_FULL ? Math.pow(k, n) : Math.pow(k, STACK_FULL) * (1 + (k - 1) * (stackCurve(n) - STACK_FULL));
}
/* the runes on the taper — the rest are hard-capped or saturate on their own.
   The rune card warns once a stack would land past STACK_FULL (ui/hud.js). */
const TAPERED_RUNES = new Set(["scatter", "heavy", "rapid", "venom", "ember", "titan", "nova", "storm",
  "splinter", "swift", "bulwark", "phase", "mirror", "velocity", "midas", "quarry", "wrath", "bramble",
  "mend", "dread", "prickle", "slime"]);

/* =========================================================
   REPRIEVE — the death-save's tuning
   One source for the save itself (entities/combat.js), the hold in the
   enemy loop (game/update.js), the rune card and the held codex.
   A lethal blow is refused; more stacks heal deeper, hold the horde
   longer, ward you longer, and shorten the wait before it can save again.
   ========================================================= */
const REPRIEVE_HEAL = 0.5;            // share of max vitality restored by the save
const REPRIEVE_HEAL_PER_STACK = 0.01;
const REPRIEVE_HEAL_CAP = 0.8;
const REPRIEVE_FREEZE = 1;            // seconds the horde holds still, per stack
const REPRIEVE_FREEZE_CAP = 3;        // 7.0's cap: a hold this long already wins the fight
const REPRIEVE_INVUL = 0.67;          // seconds of untouchability per stack
const REPRIEVE_INVUL_FLOOR = 0.9;     // never less than a normal hit's grace
const REPRIEVE_INVUL_CAP = 2;
const REPRIEVE_CD = 18;               // seconds before it can save you again
const REPRIEVE_CD_PER_STACK = 1.5;    // each stack past the first
const REPRIEVE_CD_FLOOR = 10;
function reprieveHealFrac(n) { return Math.min(REPRIEVE_HEAL_CAP, REPRIEVE_HEAL + REPRIEVE_HEAL_PER_STACK * n); }
function reprieveFreezeSecs(n) { return Math.min(REPRIEVE_FREEZE_CAP, REPRIEVE_FREEZE * n); }
function reprieveInvulSecs(n) { return Math.min(REPRIEVE_INVUL_CAP, Math.max(REPRIEVE_INVUL_FLOOR, REPRIEVE_INVUL * n)); }
function reprieveCooldown(n) { return Math.max(REPRIEVE_CD_FLOOR, REPRIEVE_CD - REPRIEVE_CD_PER_STACK * (n - 1)); }

/* =========================================================
   RUNES — every rune stacks: mod(m, n) where n = stacks held
   ========================================================= */
const RUNES = {
  scatter: { name: "SCATTER", glyph: "ᛋ", color: "#ffd23d",
    desc: "+2 bullets per stack in a widening fan. Each bullet hits a little softer.",
    /* the fan's total bite: (1+2n)·0.8^n through the full stacks, then +0.4 per effective
       stack — it keeps growing, so piling on pellets never weakens the gun */
    mod: (m, n) => {
      const pellets = Math.min(m.count + 2 * n, 40);
      /* CLASSIC: the pre-7.0 fan — +2 pellets and +0.3 spread per stack, every pellet
         20% softer, for every stack. No fan-flattening past the third. */
      if (classicStacks()) {
        const soft = Math.pow(0.8, n);
        m.count = pellets; m.spread += 0.3 * n; m.dmg *= soft;
        m.scatterSplit = (m.scatterSplit || 1) * soft;   // the SHREDDER's saw recovers this
        return;
      }
      const fan = n <= STACK_FULL ? (1 + 2 * n) * Math.pow(0.8, n)
        : (1 + 2 * STACK_FULL) * Math.pow(0.8, STACK_FULL) + 0.4 * (stackCurve(n) - STACK_FULL);
      m.count = pellets; m.spread += 0.3 * stackCurve(n); m.dmg *= fan / pellets;
      m.scatterSplit = (m.scatterSplit || 1) * (fan / pellets);   // the SHREDDER's saw recovers this
    } },
  heavy: { name: "HEAVY", glyph: "ᚺ", color: "#ff8a3d",
    desc: "A hand-cannon. Per stack: huge damage and brutal knockback, but it fires much slower. One devastating slug at a time.",
    mod: (m, n) => { m.dmg *= stackMul(1.9, n); m.rate *= stackMul(0.7, n); m.size *= stackMul(1.08, n); m.knock *= stackMul(1.6, n); } },
  rapid: { name: "RAPID", glyph: "ᚱ", color: "#ffffff",
    desc: "Per stack: fire rate way up, damage a touch down.",
    mod: (m, n) => { m.rate *= stackMul(1.45, n); m.dmg *= stackMul(0.92, n); m.spread += 0.04 * stackCurve(n); } },
  venom: { name: "VENOM", glyph: "ᛢ", color: "#7dff5e",
    desc: "Bullets burst into poison puddles. Stacks widen the puddles and sharpen the poison.",
    mod: (m, n) => { m.venom += stackCurve(n); } },
  ember: { name: "EMBER", glyph: "ᛟ", color: "#ff4d2e",
    desc: "Hits set enemies on fire. Stacks make the burn fiercer and longer.",
    mod: (m, n) => { m.ember += stackCurve(n); } },
  frost: { name: "FROST", glyph: "ᛁ", color: "#5ee6ff",
    desc: "Hits chill enemies. Stacks deepen and lengthen the slow.",
    mod: (m, n) => { m.frost += n; } },
  pierce: { name: "PIERCE", glyph: "ᛏ", color: "#e8e2d0",
    desc: "Bullets punch through 3 extra bodies per stack.",
    mod: (m, n) => { m.pierce += 3 * n; } },
  ricochet: { name: "RICOCHET", glyph: "ᛉ", color: "#9d6bff",
    desc: "Bullets bounce off stone 3 extra times per stack.",
    mod: (m, n) => { m.bounce += 3 * n; } },
  seeker: { name: "SEEKER", glyph: "ᛇ", color: "#ff6bd6",
    desc: "Bullets curve toward enemies. Stacks tighten the curve.",
    mod: (m, n) => { m.homing += 4.5 * n; } },
  titan: { name: "TITAN", glyph: "ᚦ", color: "#c9b27a",
    desc: "Per stack: fires a slow, enormous boulder that bulldozes through +4 more foes and hurls them aside. Modest punch per hit — it's about flattening the crowd, not the single kill.",
    mod: (m, n) => { m.size *= stackMul(1.6, n); m.speed *= stackMul(0.8, n); m.pierce += 4 * n; m.knock *= stackMul(1.6, n); m.dmg *= stackMul(1.12, n); } },
  twin: { name: "TWIN", glyph: "ᛗ", color: "#a0ffe6",
    desc: "One extra parallel bullet per stack (up to six). Further stacks add 8% damage each, with diminishing returns.",
    mod: (m, n) => { m.twin += n; } },
  leech: { name: "LEECH", glyph: "ᛚ", color: "#ff4d5e",
    desc: "Kills restore 0.2 vitality per stack, up to a maximum of 1 vitality per kill.",
    mod: (m, n) => { m.leech += 0.2 * n; } },
  nova: { name: "NOVA", glyph: "ᛞ", color: "#ffae5e",
    desc: "Slain enemies detonate, scorching everything nearby. Stacks grow the blast.",
    mod: (m, n) => { m.nova += stackCurve(n); } },
  storm: { name: "STORM", glyph: "ᛣ", color: "#bfe3ff",
    desc: "Hits arc lightning to nearby enemies. Stacks add jumps and voltage.",
    mod: (m, n) => { m.storm += stackCurve(n); } },
  splinter: { name: "SPLINTER", glyph: "ᚲ", color: "#d0c4ff",
    desc: "Slain enemies burst into shrapnel that wounds their kin. Stacks add shards.",
    mod: (m, n) => { m.splinter += stackCurve(n); } },
  swift: { name: "SWIFT", glyph: "ᚾ", color: "#9effc4",
    desc: "+12% movement speed per stack. Also accelerates your shots and dash.",
    mod: (m, n) => { m.moveMul *= stackMul(1.12, n); } },
  bulwark: { name: "BULWARK", glyph: "ᛒ", color: "#e0a86b",
    desc: "A shield orbits you, soaking one hit then bursting to sear nearby foes. Each stack holds one more charge — up to 3 — and further stacks deepen the blast. Spent charges return one at a time.",
    mod: (m, n) => { m.shield = n; } },
  phase: { name: "PHASE", glyph: "ᚷ", color: "#7ad7ff",
    desc: "Dash recharges faster and leaves a cutting wake that carries your elements — burning, chilling, poisoning and shocking whatever you dash through. Stacks sharpen both.",
    mod: (m, n) => { m.dashCdMul *= stackMul(0.85, n); m.dashTrail += stackCurve(n); } },
  mirror: { name: "MIRROR", glyph: "ᛖ", color: "#f3c4ff",
    desc: "Fires a copy of your shot backwards per stack. Watch your six — it's armed.",
    /* every stack still adds a whole rear copy; past the full stacks the copies share
       the curve's damage between them (spawnShot reads mirrorDmg) */
    mod: (m, n) => { m.mirror += n; m.mirrorDmg = stackCurve(n) / n; } },
  velocity: { name: "VELOCITY", glyph: "ᚢ", color: "#fff89e",
    desc: "Per stack: bullets fly 20% faster and hit 8% harder.",
    mod: (m, n) => { m.speed *= stackMul(1.2, n); m.dmg *= stackMul(1.08, n); } },
  reaper: { name: "REAPER", glyph: "ᛦ", color: "#c4c9d4",
    desc: "Hits execute weakened enemies outright. Stacks raise the threshold. Wardens resist.",
    mod: (m, n) => { m.execute = Math.min(0.5, m.execute + 0.08 * n); } },
  midas: { name: "MIDAS", glyph: "ᚠ", color: "#ffd23d",
    desc: "+25% souls from every kill per stack.",
    mod: (m, n) => { m.midas += 0.25 * stackCurve(n); } },
  quarry: { name: "QUARRY", glyph: "ᚩ", color: "#b6ff4d",
    desc: "Your gun savors the wounded — bullets bite +20% harder per stack into anything burning or chilled. The finisher every elemental build was missing.",
    mod: (m, n) => { m.prey *= stackMul(1.2, n); } },
  puncture: { name: "PUNCTURE", glyph: "ᛈ", color: "#ffd23d",
    desc: "Every shot can find the gap in the armor — a chance to strike for more than double. Each stack raises the odds, up to 60%. Bosses bleed too.",
    mod: (m, n) => { m.crit = Math.min(0.6, m.crit + 0.12 * n); } },
  wrath: { name: "WRATH", glyph: "ᚨ", color: "#ff3d2e",
    desc: "The closer to death, the deadlier the gun — up to +50% damage per stack, scaling from nothing at full vitality to its peak near death. Zero risk while healthy.",
    mod: (m, n) => { m.wrath += 0.5 * stackCurve(n); } },
  aegis: { name: "AEGIS", glyph: "ᛝ", color: "#bcd0ff",
    desc: "Carved wards bleed the force from every blow before it lands. Each stack shaves 12% off the damage you take, up to a 60% ward — never enough to make you untouchable.",
    mod: (m, n) => { m.dr = Math.min(0.6, m.dr + 0.12 * n); } },
  bramble: { name: "BRAMBLE", glyph: "ᛕ", color: "#ff6b8a",
    desc: "Strike the warded and the wards strike back. When something wounds you, a ring of barbed force erupts and tears into whatever dared. Stacks sharpen the barbs.",
    mod: (m, n) => { m.thorns += stackCurve(n); } },
  mend: { name: "MEND", glyph: "ᚧ", color: "#8effb0",
    desc: "Your wounds knit closed when you go untouched. Each stack mends a little faster and shortens the lull before the mending begins. Taking a hit stalls it.",
    mod: (m, n) => { m.regen += 0.35 * stackCurve(n); m.regenDelay = Math.max(1.8, 3 - 0.3 * n); } },
  reprieve: { name: "REPRIEVE", glyph: "ᛤ", color: "#bcd0ff",
    desc: "When a blow would end you, the hour holds its breath: the horde freezes, your wounds close, and a ward keeps the next hit from following you home. One save per cooldown — stacks heal deeper, hold longer, ward longer and return sooner.",
    mod: (m, n) => { m.reprieveStacks = n; } },
  maelstrom: { name: "MAELSTROM", glyph: "ᚳ", color: "#8a6bff",
    desc: "Some slain foes tear open a brief gravity well that gently gathers the living into a knot. It deals no damage — it only sets the table for whatever you bring next. Stacks make wells form more often and reach wider.",
    mod: (m, n) => { m.vortex = Math.min(4, m.vortex + n); } },
  dread: { name: "DREAD", glyph: "ᚹ", color: "#9d9db8",
    desc: "Some wounds carry a whisper of the void. Struck foes may break and flee, running blind — gunners stop firing, swarms scatter. Stacks make terror take hold more often and linger.",
    mod: (m, n) => { m.fear = Math.min(0.5, m.fear + 0.1 * n); m.fearDur = 1 + 0.35 * stackCurve(n); } },
  stillpoint: { name: "STILLPOINT", glyph: "ᚤ", color: "#6be0d4",
    desc: "The air around you thickens — time drags within arm's reach. Enemies and even their bullets crawl inside the bubble. Stacks widen the field and deepen the lull.",
    mod: (m, n) => { m.timeField = Math.min(3, m.timeField + n); m.timeR = 110 + 42 * m.timeField; m.timeMul = Math.max(0.35, 0.6 - 0.08 * m.timeField); } },
  prickle: { name: "PRICKLE", glyph: "ᛡ", color: "#d6e85a",
    desc: "A bristling thornfield rings you, pricking any foe that strays too close for a slow trickle of damage. Each stack widens the ring of barbs.",
    mod: (m, n) => { m.prickle += stackCurve(n); m.prickleR = 50 + 16 * m.prickle; } },
  slime: { name: "SLIME", glyph: "ᛠ", color: "#86d020",
    desc: "You leave a slick of caustic slime in your wake that lingers, then fades. Anything that wades through it festers with damage over time. Stacks thicken and widen the trail.",
    mod: (m, n) => { m.slime += stackCurve(n); } },
};

/* =========================================================
   THE UNKNOWN'S RUNES — boss rune mechanics refit for player use.
   When you play as THE UNKNOWN, these replace the normal rune pool.
   Same stacking math, same feel — but every glyph, name and color
   belongs to the thing at the bottom of the abyss.
   ========================================================= */
const UNK_PLAYER_RUNES = {
  scatter: { name: "FANFARE", glyph: "ᛋ", color: "#ffd23d",
    desc: "+2 bullets per stack in a widening fan. Each bullet hits a little softer.",
    mod: (m, n) => {
      const pellets = Math.min(m.count + 2 * n, 40);
      /* CLASSIC: the pre-7.0 fan — +2 pellets and +0.3 spread per stack, every pellet
         20% softer, for every stack. No fan-flattening past the third. */
      if (classicStacks()) {
        const soft = Math.pow(0.8, n);
        m.count = pellets; m.spread += 0.3 * n; m.dmg *= soft;
        m.scatterSplit = (m.scatterSplit || 1) * soft;   // the SHREDDER's saw recovers this
        return;
      }
      const fan = n <= STACK_FULL ? (1 + 2 * n) * Math.pow(0.8, n)
        : (1 + 2 * STACK_FULL) * Math.pow(0.8, STACK_FULL) + 0.4 * (stackCurve(n) - STACK_FULL);
      m.count = pellets; m.spread += 0.3 * stackCurve(n); m.dmg *= fan / pellets;
      m.scatterSplit = (m.scatterSplit || 1) * (fan / pellets);   // the SHREDDER's saw recovers this
    } },
  heavy: { name: "HAND-CANNON", glyph: "ᚺ", color: "#ff8a3d",
    desc: "A hand-cannon. Per stack: huge damage and brutal knockback, but it fires much slower. One devastating slug at a time.",
    mod: (m, n) => { m.dmg *= stackMul(1.9, n); m.rate *= stackMul(0.7, n); m.size *= stackMul(1.08, n); m.knock *= stackMul(1.6, n); } },
  rapid: { name: "THE HAIL", glyph: "ᚱ", color: "#ffffff",
    desc: "Per stack: fire rate way up, damage a touch down.",
    mod: (m, n) => { m.rate *= stackMul(1.45, n); m.dmg *= stackMul(0.92, n); m.spread += 0.04 * stackCurve(n); } },
  venom: { name: "BLIGHT RAIN", glyph: "ᛢ", color: "#7dff5e",
    desc: "Bullets burst into poison puddles. Stacks widen the puddles and sharpen the poison.",
    mod: (m, n) => { m.venom += stackCurve(n); } },
  ember: { name: "PYRE CROSS", glyph: "ᛟ", color: "#ff4d2e",
    desc: "Hits set enemies on fire. Stacks make the burn fiercer and longer.",
    mod: (m, n) => { m.ember += stackCurve(n); } },
  frost: { name: "WHITE RING", glyph: "ᛁ", color: "#5ee6ff",
    desc: "Hits chill enemies. Stacks deepen and lengthen the slow.",
    mod: (m, n) => { m.frost += n; } },
  pierce: { name: "THE LANCES", glyph: "ᛏ", color: "#e8e2d0",
    desc: "Bullets punch through 3 extra bodies per stack.",
    mod: (m, n) => { m.pierce += 3 * n; } },
  ricochet: { name: "MIRROR HALL", glyph: "ᛉ", color: "#9d6bff",
    desc: "Bullets bounce off stone 3 extra times per stack.",
    mod: (m, n) => { m.bounce += 3 * n; } },
  seeker: { name: "THE HOUNDS", glyph: "ᛇ", color: "#ff6bd6",
    desc: "Bullets curve toward enemies. Stacks tighten the curve.",
    mod: (m, n) => { m.homing += 4.5 * n; } },
  titan: { name: "THE BOULDER", glyph: "ᚦ", color: "#c9b27a",
    desc: "Per stack: fires a slow, enormous boulder that bulldozes through +4 more foes and hurls them aside. Modest punch per hit — it's about flattening the crowd, not the single kill.",
    mod: (m, n) => { m.size *= stackMul(1.6, n); m.speed *= stackMul(0.8, n); m.pierce += 4 * n; m.knock *= stackMul(1.6, n); m.dmg *= stackMul(1.12, n); } },
  twin: { name: "PARALLELS", glyph: "ᛗ", color: "#a0ffe6",
    desc: "One extra parallel bullet per stack (up to six). Further stacks add 8% damage each, with diminishing returns.",
    mod: (m, n) => { m.twin += n; } },
  leech: { name: "THE TITHE", glyph: "ᛚ", color: "#ff4d5e",
    desc: "Kills restore 0.2 vitality per stack, up to a maximum of 1 vitality per kill.",
    mod: (m, n) => { m.leech += 0.2 * n; } },
  nova: { name: "SUNBURST", glyph: "ᛞ", color: "#ffae5e",
    desc: "Slain enemies detonate, scorching everything nearby. Stacks grow the blast.",
    mod: (m, n) => { m.nova += stackCurve(n); } },
  storm: { name: "THE CHORUS", glyph: "ᛣ", color: "#bfe3ff",
    desc: "Hits arc lightning to nearby enemies. Stacks add jumps and voltage.",
    mod: (m, n) => { m.storm += stackCurve(n); } },
  splinter: { name: "SHATTERGLASS", glyph: "ᚲ", color: "#d0c4ff",
    desc: "Slain enemies burst into shrapnel that wounds their kin. Stacks add shards.",
    mod: (m, n) => { m.splinter += stackCurve(n); } },
  swift: { name: "THE RUSH", glyph: "ᚾ", color: "#9effc4",
    desc: "+12% movement speed per stack. Also accelerates your shots and dash.",
    mod: (m, n) => { m.moveMul *= stackMul(1.12, n); } },
  bulwark: { name: "THE SHIELDS", glyph: "ᛒ", color: "#e0a86b",
    desc: "A shield orbits you, soaking one hit then bursting to sear nearby foes. Each stack holds one more charge — up to 3 — and further stacks deepen the blast. Spent charges return one at a time.",
    mod: (m, n) => { m.shield = n; } },
  phase: { name: "BLINKSTEP", glyph: "ᚷ", color: "#7ad7ff",
    desc: "Dash recharges faster and leaves a cutting wake that carries your elements — burning, chilling, poisoning and shocking whatever you dash through. Stacks sharpen both.",
    mod: (m, n) => { m.dashCdMul *= stackMul(0.85, n); m.dashTrail += stackCurve(n); } },
  mirror: { name: "THE REFLECTION", glyph: "ᛖ", color: "#f3c4ff",
    desc: "Fires a copy of your shot backwards per stack. Watch your six — it's armed.",
    mod: (m, n) => { m.mirror += n; m.mirrorDmg = stackCurve(n) / n; } },
  velocity: { name: "HELD BREATH", glyph: "ᚢ", color: "#fff89e",
    desc: "Per stack: bullets fly 20% faster and hit 8% harder.",
    mod: (m, n) => { m.speed *= stackMul(1.2, n); m.dmg *= stackMul(1.08, n); } },
  reaper: { name: "THE SCYTHE", glyph: "ᛦ", color: "#c4c9d4",
    desc: "Hits execute weakened enemies outright. Stacks raise the threshold. Wardens resist.",
    mod: (m, n) => { m.execute = Math.min(0.5, m.execute + 0.08 * n); } },
  midas: { name: "FOOL'S GOLD", glyph: "ᚠ", color: "#ffd23d",
    desc: "+25% souls from every kill per stack.",
    mod: (m, n) => { m.midas += 0.25 * stackCurve(n); } },
  quarry: { name: "THE HUNT", glyph: "ᚩ", color: "#b6ff4d",
    desc: "Your gun savors the wounded — bullets bite +20% harder per stack into anything burning or chilled. The finisher every elemental build was missing.",
    mod: (m, n) => { m.prey *= stackMul(1.2, n); } },
  puncture: { name: "THE NEEDLE", glyph: "ᛈ", color: "#ffd23d",
    desc: "Every shot can find the gap in the armor — a chance to strike for more than double. Each stack raises the odds, up to 60%. Bosses bleed too.",
    mod: (m, n) => { m.crit = Math.min(0.6, m.crit + 0.12 * n); } },
  wrath: { name: "THE TEMPER", glyph: "ᚨ", color: "#ff3d2e",
    desc: "The closer to death, the deadlier the gun — up to +50% damage per stack, scaling from nothing at full vitality to its peak near death. Zero risk while healthy.",
    mod: (m, n) => { m.wrath += 0.5 * stackCurve(n); } },
  aegis: { name: "THE CARAPACE", glyph: "ᛝ", color: "#bcd0ff",
    desc: "Carved wards bleed the force from every blow before it lands. Each stack shaves 12% off the damage you take, up to a 60% ward — never enough to make you untouchable.",
    mod: (m, n) => { m.dr = Math.min(0.6, m.dr + 0.12 * n); } },
  bramble: { name: "THE RETORT", glyph: "ᛕ", color: "#ff6b8a",
    desc: "Strike the warded and the wards strike back. When something wounds you, a ring of barbed force erupts and tears into whatever dared. Stacks sharpen the barbs.",
    mod: (m, n) => { m.thorns += stackCurve(n); } },
  mend: { name: "THE KNITTING", glyph: "ᚧ", color: "#8effb0",
    desc: "Your wounds knit closed when you go untouched. Each stack mends a little faster and shortens the lull before the mending begins. Taking a hit stalls it.",
    mod: (m, n) => { m.regen += 0.35 * stackCurve(n); m.regenDelay = Math.max(1.8, 3 - 0.3 * n); } },
  reprieve: { name: "THE STAY", glyph: "ᛤ", color: "#bcd0ff",
    desc: "Death reaches for you — and the dark says not yet. A lethal blow lands, the horde stops where it stands, and you are returned to yourself with the wound closed. One stay per cooldown; stacks deepen it and shorten the wait.",
    mod: (m, n) => { m.reprieveStacks = n; } },
  maelstrom: { name: "THE WELL", glyph: "ᚳ", color: "#8a6bff",
    desc: "Some slain foes tear open a brief gravity well that gently gathers the living into a knot. It deals no damage — it only sets the table for whatever you bring next. Stacks make wells form more often and reach wider.",
    mod: (m, n) => { m.vortex = Math.min(4, m.vortex + n); } },
  dread: { name: "THE BLIND DARK", glyph: "ᚹ", color: "#9d9db8",
    desc: "Some wounds carry a whisper of the void. Struck foes may break and flee, running blind — gunners stop firing, swarms scatter. Stacks make terror take hold more often and linger.",
    mod: (m, n) => { m.fear = Math.min(0.5, m.fear + 0.1 * n); m.fearDur = 1 + 0.35 * stackCurve(n); } },
  stillpoint: { name: "STILLED FIELDS", glyph: "ᚤ", color: "#6be0d4",
    desc: "The air around you thickens — time drags within arm's reach. Enemies and even their bullets crawl inside the bubble. Stacks widen the field and deepen the lull.",
    mod: (m, n) => { m.timeField = Math.min(3, m.timeField + n); m.timeR = 110 + 42 * m.timeField; m.timeMul = Math.max(0.35, 0.6 - 0.08 * m.timeField); } },
  prickle: { name: "THORN GRID", glyph: "ᛡ", color: "#d6e85a",
    desc: "A bristling thornfield rings you, pricking any foe that strays too close for a slow trickle of damage. Each stack widens the ring of barbs.",
    mod: (m, n) => { m.prickle += stackCurve(n); m.prickleR = 50 + 16 * m.prickle; } },
  slime: { name: "THE SLICK", glyph: "ᛠ", color: "#86d020",
    desc: "You leave a slick of caustic slime in your wake that lingers, then fades. Anything that wades through it festers with damage over time. Stacks thicken and widen the trail.",
    mod: (m, n) => { m.slime += stackCurve(n); } },
};

/* =========================================================
   HIDDEN RUNES — easter eggs, only answer to hidden wardens.
   Toggleable in settings so they never interfere with a normal descent.
   ========================================================= */
const HIDDEN_RUNES = {
  exterminate: { name: "EXTERMINATE", glyph: "ᛃ", color: "#a30000",
    desc: "Unmatched fire power. Steady damage scaling, smooth speed gains (caps at +100%), and optimized fire rate (caps at +275%). Defense drops 9% per stack (caps at 54% extra damage taken).",
    mod: function(m, n) {
      m.dmg *= Math.pow(1.35, n);
      m.dr -= 0.09 * n;
      if (m.dr < -0.54) m.dr = -0.54;
      let speedMult = Math.pow(1.06, n);
      m.speed *= (speedMult > 2.0) ? 2.0 : speedMult;
      let rateMult = Math.pow(1.5, n);
      m.rate *= (rateMult > 3.75) ? 3.75 : rateMult;
    } },
  runegun: { name: "RUNEGUN", glyph: "⦿", color: "#ffffff",
    desc: "john runegun",
    mod: function(m, n) {
      m.dmg *= Math.pow(2, Math.min(n, 12));
    } },
};
const HIDDEN_RUNE_IDS = Object.keys(HIDDEN_RUNES);

const RUNE_IDS = Object.keys(RUNES);
const UNK_PLAYER_RUNE_IDS = Object.keys(UNK_PLAYER_RUNES);

/* which rune definitions apply to a given warden: THE UNKNOWN's own runes,
   everyone else's normal ones. Hidden runes only appear for hidden wardens,
   and RUNEGUN is JOHN RUNEGUN exclusive. */
function runeDefFor(p, id) {
  return (p.char === "theUnknown" && UNK_PLAYER_RUNES[id]) ? UNK_PLAYER_RUNES[id]
    : (HIDDEN_RUNES[id] ? HIDDEN_RUNES[id] : RUNES[id]);
}
/* the pool new runes roll from: every rune until the warden seals into four, then only those four.
   Per-player now — every function below takes the warden `p` whose build it touches. */
function runePool(p) {
  if (p.char === "theUnknown") return UNK_PLAYER_RUNE_IDS;
  let ids = p.lockedRunes || RUNE_IDS;
  const isHiddenChar = CHARS[p.char] && CHARS[p.char].hidden;
  if (!Meta.showHiddenRunes || !isHiddenChar) {
    ids = ids.filter(id => !HIDDEN_RUNE_IDS.includes(id));
  } else if (p.char !== "john") {
    ids = ids.filter(id => id !== "runegun");
  }
  return ids;
}
function genThreeRunes(p) {
  const pool = runePool(p);
  const avail = [...pool];
  const ids = [];
  for (let i = 0; i < 3 && avail.length > 0; i++) {
    const idx = Math.floor(Math.random() * avail.length);
    ids.push(avail[idx]);
    avail.splice(idx, 1);
  }
  while (ids.length < 3) ids.push(ids[ids.length - 1]);
  return ids;
}
const heldRuneIds = p => Object.keys(p.runes).filter(id => p.runes[id] > 0);
/* how many distinct runes a character may carve before the gun seals (ALCHEMIST gets a fifth,
   and THE UNKNOWN grants one more on top of that) */
function runeSlotCount(p) { return ((CHARS[p.char] && CHARS[p.char].runeSlots) || 4) + (p.bonusRuneSlots || 0); }
/* CHAOS descent's colour — the chooser card, the HUD chip, the run-end tag */
const CHAOS_COLOR = "#ff6bd6";
/* once that many DIFFERENT runes are carved, the gun seals to them for the rest of the descent.
   A CHAOS descent never seals: every rune keeps answering, all of them at once if you like. */
function checkRuneLock(p) {
  if (p.lockedRunes || Game.chaosMode) return;
  const slots = runeSlotCount(p);
  const distinct = heldRuneIds(p);
  if (distinct.length >= slots) {
    p.lockedRunes = distinct.slice(0, slots);
    const glyphs = p.lockedRunes.map(id => runeDefFor(p, id).glyph).join("  ");
    if (p === localPlayer()) toast("YOUR PATH IS SEALED — ONLY  " + glyphs + "  WILL ANSWER NOW");
    floatText(p.x, p.y - 32, "RUNES SEALED", "#ffd23d");
    AudioFX.chest();
    refreshRuneStrip();
  }
}

function buildWeaponModsFrom(runes, p) {
  const m = { dmg: 10, rate: 4.5, spread: 0.055, speed: 540, size: 4, count: 1,
    pierce: 0, bounce: 0, homing: 0, knock: 60, twin: 0, mirror: 0, mirrorDmg: 1,
    venom: 0, ember: 0, frost: 0, leech: 0,
    nova: 0, storm: 0, splinter: 0, execute: 0, midas: 0,
    moveMul: 1, hpBonus: 0, dashCdMul: 1, dashTrail: 0, shield: 0,
    prey: 1, crit: 0, critMul: 2.2, wrath: 0, dr: 0, thorns: 0,
    regen: 0, regenDelay: 3, vortex: 0, fear: 0, fearDur: 0,
    timeField: 0, timeR: 0, timeMul: 0, prickle: 0, prickleR: 0, slime: 0,
    scatterSplit: 1, sawDmg: 0, reprieveStacks: 0 };
  /* a character may reshape the bare gun before any rune speaks (JUGGERNAUT's massive slow slug) */
  const wb = CHARS[p.char] && CHARS[p.char].weaponBase;
  if (wb) Object.assign(m, wb);
  for (const id in runes) {
    const n = runes[id];
    if (n > 0) { const rd = runeDefFor(p, id); if (rd) rd.mod(m, n); }
  }
  /* fire rate past the 20/s ceiling isn't wasted — the surplus folds into damage,
     so RAPID never turns against you once the trigger can't go any faster */
  if (m.rate > 20) { m.dmg *= m.rate / 20; m.rate = 20; }
    /* Swift accelerates the projectile and dash along with the player's run speed. */
    m.speed *= m.moveMul;
  m.rate = clamp(m.rate, 0.8, 20);
  m.count = Math.min(m.count, 40);
  m.twin = Math.min(m.twin, 6);                           // parallel shots × fire rate is the puddle/perf multiplier
  /* Extra TWIN stacks still matter after the six-parallel cap, but taper like other piled-up bonuses. */
  if (runes.twin > 6) m.dmg *= stackMul(1.08, runes.twin - 6);
  m.size = clamp(m.size, 2, 26);
  m.speed = clamp(m.speed, 120, 1600);
  m.leech = Math.min(m.leech, 1);                         // hard cap: 1 vitality per kill
  m.leechMax = m.leech >= 1;                              // flag for "MAX" display
  m.shieldMax = Math.min(m.shield, 3);                    // charges cap at 3 stacks
  m.shieldDmg = m.shield > 0 ? Math.round(30 + 18 * (stackCurve(m.shield) - 1)) : 0; // every stack deepens the burst
  m.shieldR = 130;
  if (p.char === "shredder") {
    /* The blade translates the bullet runes that have no projectile analogue:
       SCATTER widens the grind and its reach, PIERCE and RICOCHET bite deeper,
       and SEEKER drags prey toward the teeth (game/update.js). The debris itself
       is a real shot now (entities/combat.js), so TWIN / MIRROR / HEAVY /
       VELOCITY / the elements and homing all answer through it.
       Keep saw reach separate from projectile size, which is deliberately capped above. */
    const sawRunes = runes || {};
    const scatter = sawRunes.scatter || 0, pierce = sawRunes.pierce || 0, bounce = sawRunes.ricochet || 0;
    m.shredDmgMul = 1 + scatter * 0.1 + pierce * 0.1 + bounce * 0.1;
    m.sawReach = clamp((CHARS[p.char].sawReach || 76) + (m.size - 4) * 1.5 + Math.max(0, m.speed - 540) * 0.1 + scatter * 60, 48, 220);
    m.dmg *= 1 + m.twin * 0.4;
    m.rate *= 1 + m.twin * 0.25;
    if (m.rate > 20) { m.dmg *= m.rate / 20; m.rate = 20; }
    /* SCATTER splits its bite across the debris pellets — that split is a
       projectile concern and must not soften the blade, so the saw swings with
       the undivided figure. */
    m.sawDmg = m.dmg / (m.scatterSplit || 1);
  }
  return m;
}

/* What a single rune is actually contributing right now, at its current stack count.
   Computed by diffing the full weapon against the weapon with this rune removed. */
function runeStatLines(p, id) {
  const n = p.runes[id] || 0;
  if (!n) return [];
  const full = buildWeaponModsFrom(p.runes, p);
  const less = Object.assign({}, p.runes); delete less[id];
  const w = buildWeaponModsFrom(less, p);
  const L = [];
  const mul = r => (r >= 1 ? "+" : "\u2212") + Math.round(Math.abs(r - 1) * 100) + "%";
  const di = (a, b) => Math.round(a - b);
  if (Math.abs(full.dmg / w.dmg - 1) > 0.005) L.push("DAMAGE " + mul(full.dmg / w.dmg));
  if (Math.abs(full.rate / w.rate - 1) > 0.005) L.push("FIRE RATE " + mul(full.rate / w.rate));
  if (full.count !== w.count) L.push("+" + di(full.count, w.count) + " BULLETS PER SHOT");
  if (full.twin !== w.twin) L.push("+" + di(full.twin, w.twin) + " PARALLEL SHOT");
  if (full.mirror !== w.mirror) L.push("+" + di(full.mirror, w.mirror) + " REAR SHOT" +
    (full.mirrorDmg < 0.995 ? " AT " + Math.round(full.mirrorDmg * 100) + "% DMG" : ""));
  if (Math.abs(full.spread - w.spread) > 0.001) L.push("SPREAD +" + Math.round((full.spread - w.spread) * 57) + "\u00b0");
  if (Math.abs(full.size / w.size - 1) > 0.005) L.push("BULLET SIZE " + mul(full.size / w.size));
  if (Math.abs(full.speed / w.speed - 1) > 0.005) L.push("BULLET SPEED " + mul(full.speed / w.speed));
  if (full.pierce !== w.pierce) L.push("+" + di(full.pierce, w.pierce) + " PIERCE");
  if (full.bounce !== w.bounce) L.push("+" + di(full.bounce, w.bounce) + " BOUNCE");
  if (Math.abs(full.knock / w.knock - 1) > 0.005) L.push("KNOCKBACK " + mul(full.knock / w.knock));
  if (full.homing !== w.homing) L.push("HOMING PULL " + full.homing.toFixed(1));
  /* the SHREDDER's blade reads the same runes differently — show what they do to the saw */
  if (full.sawReach !== undefined && Math.abs(full.sawReach - w.sawReach) > 0.05) {
    const sd = full.sawReach - w.sawReach;
    L.push("SAW REACH " + (sd > 0 ? "+" : "\u2212") + Math.round(Math.abs(sd)));
  }
  if (full.shredDmgMul !== undefined && Math.abs(full.shredDmgMul - w.shredDmgMul) > 0.005)
    L.push("SAW DAMAGE " + mul(full.shredDmgMul / w.shredDmgMul));
  if (full.sawReach !== undefined && full.homing !== w.homing)
    L.push("SAW PULL " + Math.round(Math.min(80, full.homing * 7)) + " px/s");
  if (Math.abs(full.moveMul / w.moveMul - 1) > 0.005) L.push("MOVE SPEED " + mul(full.moveMul / w.moveMul));
  if (full.hpBonus !== w.hpBonus) L.push("+" + di(full.hpBonus, w.hpBonus) + " MAX VITALITY");
  if (full.shieldMax !== w.shieldMax) L.push("SHIELD ABSORBS " + full.shieldMax + " HIT" + (full.shieldMax === 1 ? "" : "S"));
  if (full.shieldDmg !== w.shieldDmg) L.push("SHIELD BURST " + full.shieldDmg + " DMG");
  if (Math.abs(full.dashCdMul / w.dashCdMul - 1) > 0.005) L.push("DASH COOLDOWN " + mul(full.dashCdMul / w.dashCdMul));
  /* status / on-kill effects — magnitude attributed entirely to this rune */
  /* (tapered stacks run fractional — whole counts round the way combat.js does) */
  if (full.ember !== w.ember) { const e = full.ember; L.push("BURN " + Math.round(2 + 2 * e) + " DMG / 0.45s FOR " + (2 + e).toFixed(1) + "s"); }
  if (full.frost !== w.frost) { const f = full.frost; L.push("CHILL \u2014 SLOW ENEMIES FOR " + (1 + 0.7 * f).toFixed(1) + "s"); }
  if (full.venom !== w.venom) { const v = full.venom; L.push("POISON POOL " + Math.round(3 + 2 * v) + " DMG / TICK"); }
  if (full.storm !== w.storm) { const s = full.storm; L.push("ARC LIGHTNING " + (1 + Math.round(s)) + " JUMPS, " + Math.round(5 + 4 * s) + " DMG"); }
  if (full.nova !== w.nova) { const v = full.nova; L.push("CORPSE BLAST " + Math.round(6 + 3 * v) + " DMG"); }
  if (full.splinter !== w.splinter) { const v = full.splinter; L.push((3 + Math.round(2 * v)) + " DEATH SHARDS, " + Math.round(6 + 2 * v) + " DMG"); }
  if (full.leech !== w.leech) L.push("+" + full.leech.toFixed(1) + " VITALITY / KILL" + (full.leechMax ? " (MAX)" : ""));
  if (full.execute !== w.execute) L.push("REAP ENEMIES UNDER " + Math.round(full.execute * 100) + "% HP");
  if (full.midas !== w.midas) L.push("+" + Math.round(full.midas * 100) + "% SOULS / KILL");
  if (full.dashTrail !== w.dashTrail) L.push("DASH WAKE " + Math.round(5 + 4 * full.dashTrail) + " DMG / TICK");
  if (full.prey !== w.prey) L.push("+" + Math.round((full.prey - 1) * 100) + "% DMG TO BURNING / CHILLED");
  if (full.crit !== w.crit) L.push(Math.round(full.crit * 100) + "% CRIT ×" + full.critMul.toFixed(1));
  if (full.wrath !== w.wrath) L.push("UP TO +" + Math.round(full.wrath * 100) + "% DMG NEAR DEATH");
  if (full.dr !== w.dr) L.push("DAMAGE TAKEN −" + Math.round(full.dr * 100) + "%");
  if (full.thorns !== w.thorns) L.push("THORN BURST " + Math.round(12 + 9 * full.thorns) + " DMG WHEN HIT");
  if (full.regen !== w.regen) L.push("REGEN " + full.regen.toFixed(2) + " HP/s WHEN UNTOUCHED");
  if (full.vortex !== w.vortex) L.push("SLAIN FOES MAY PULL THE CROWD INWARD");
  if (full.fear !== w.fear) L.push(Math.round(full.fear * 100) + "% TO TERRIFY (" + full.fearDur.toFixed(1) + "s)");
  if (full.timeField !== w.timeField) L.push("TIME-SLOW AURA, RADIUS " + Math.round(full.timeR));
  if (full.prickle !== w.prickle) L.push("THORN AURA, RADIUS " + Math.round(full.prickleR));
  if (full.slime !== w.slime) L.push("CAUSTIC SLIME TRAIL " + Math.round(2 + full.slime) + " DMG / TICK");
  if (full.reprieveStacks !== w.reprieveStacks) {
    const rn = full.reprieveStacks;
    L.push("DEATH SAVE — RESTORES " + Math.round(reprieveHealFrac(rn) * 100) + "% VITALITY");
    L.push("HOLDS THE HORDE " + reprieveFreezeSecs(rn).toFixed(1) + "s · INVULN " + reprieveInvulSecs(rn).toFixed(1) + "s (BOSSES ONLY SLOWED)");
    L.push("COOLDOWN " + reprieveCooldown(rn).toFixed(1) + "s");
  }
  if (full.exterminate !== w.exterminate) {
    const x = full.exterminate;
    L.push("EXTERMINATE · DMG ×" + Math.pow(1.35, x).toFixed(2));
    L.push("DR −" + Math.round(x * 9) + "% (capped −54%) · SPD cap 2× · RATE cap 3.75×");
  }
  if (full.runegun !== w.runegun) {
    const r = full.runegun;
    L.push("RUNEGUN · DMG ×2^" + Math.min(r, 12) + " (stack " + r + ")");
  }
  return L;
}

/* recompute one warden's weapon + body whenever their stacks change */
function recalc(p) {
  const wasMax = p.maxHp || 0;
  p.mods = buildWeaponModsFrom(p.runes, p);
  /* the saloon's rounds ride on top of every build — reapply the current tier here,
     so a rune carved while drunk doesn't silently pour the buffs away */
  if (typeof Game !== "undefined" && Game.drunk > 0 && typeof applyDrunkBuffs === "function") applyDrunkBuffs(p);
  const c = CHARS[p.char];
  p.maxHp = Math.round((c.hp + p.mods.hpBonus) * (p.maxHpMul || 1));
  if (p.maxHp > wasMax) p.hp += p.maxHp - wasMax; // heal what extra max grants
  p.hp = Math.min(p.hp, p.maxHp);
  p.speed = c.speed * p.mods.moveMul;
  p.dashSpeed = clamp((c.dashSpeed || 720) * p.mods.moveMul, 240, 1600);
  p.dashCdBase = c.dashCd * p.mods.dashCdMul;
  /* BULWARK shield: gaining a stack raises the cap and refills every charge at once */
  const prevShieldMax = p.shieldMax || 0;
  p.shieldMax = p.mods.shieldMax;
  if (p.shieldMax > prevShieldMax) p.shield = p.shieldMax;
  p.shield = Math.min(p.shield, p.shieldMax);
  refreshRuneStrip();
  updateHp();
}

/* THE UNKNOWN cracks open one more rune slot. If your path was already sealed,
   the seal loosens so a brand-new rune can answer the empty slot — then it re-seals
   once the new, wider set is full. */
function grantRiftSlot(p) {
  p.bonusRuneSlots = (p.bonusRuneSlots || 0) + 1;
  p.lockedRunes = null;
  recalc(p);
  checkRuneLock(p);   // re-seal immediately if you were already past the new count
}

/* glossary: remember every rune the player has ever carved, across all descents.
   Only the first time a given rune is seen touches storage. */
function recordRuneSeen(id) {
  if (Meta.runesSeen[id]) return;
  Meta.runesSeen[id] = true;
  metaSave();
}

function grantRune(p, id, silent) {
  /* the glossary only records what the LOCAL warden has personally carved */
  if (p === localPlayer()) recordRuneSeen(id);
  p.runes[id] = (p.runes[id] || 0) + 1;
  recalc(p);
  if (!silent && p === localPlayer()) { toast(runeDefFor(p, id).name + " ×" + p.runes[id] + " CARVED IN"); AudioFX.equip(); }
  if (typeof RunegunConsole !== "undefined" && p === localPlayer()) RunegunConsole.logEvent("RUNE", id + " carved (stack " + p.runes[id] + ")");
  /* UNLOCK: Wayward Passenger (35 WARP stacks in one run) */
  if (p === localPlayer() && id === "warp" && p.runes.warp >= 35 && !Meta.unlocked["char:sinner"]) {
    Meta.unlocked["char:sinner"] = true;
    toast("UNLOCKED: WAYWARD PASSENGER — THE DIMENSIONAL DRIFTER", 3);
    metaSave();
  }
  checkRuneLock(p);
}


// secret runes when... glassCannon, sniper, reprieve, bleed, vampire, eveyrthing's gone :sob:
