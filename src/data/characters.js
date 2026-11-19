/* =========================================================
   RUNEGUN · Characters & skins
   Vault unlockables: playable characters (stats/loadout) and warpaint skins.
   ========================================================= */
"use strict";


/* SNIPER — the range rider's tuning. Damage climbs with the distance the shot
   has travelled, then stops at the cap. Tune the whole warden from here. */
const SNIPER_RANGE_DMG = 0.15;    // +15% damage per range step
const SNIPER_RANGE_STEP = 100;    // px per step
const SNIPER_RANGE_CAP = 0.9;     // never more than +90% (600 px)
const SNIPER_PIERCE = 2;          // extra bodies a rifle round passes through
/* PUNCTURE answers the rifle at full strength: the same five stacks that stop
   at 60% for everyone else find a gap every single shot, and the round that
   finds it bites harder. */
const SNIPER_CRIT_STEP = 0.20;    // PUNCTURE chance per stack (others: 12%)
const SNIPER_CRIT_CAP = 1;        // five stacks = every shot punctures
const SNIPER_CRIT_MUL = 2.5;      // the gap the rifle finds strikes for ×2.5
/* The scope's reach: SNIPER sees more of the arena, and the camera leans a
   long way toward the aim so the shot can be lined up from outside the pack. */
const SNIPER_ZOOM = 0.82;         // multiplier on the device's base zoom
const SNIPER_CAM_LEAD = 240;      // world px the camera may drift toward the aim
const SNIPER_PET_ORDER_RANGE = 1500;   // how far a sealed box may be and still be sent for
const SNIPER_PET_ORDER_SPEED = 430;    // companion's travel speed on the errand
const SNIPER_PET_ORDER_REACH = 34;     // px from the box that counts as "there"
/* THE SCOPE'S INSTINCT — when the crosshair drifts near a horror, the rifle
   settles onto it by itself. Among the bodies under the crosshair the one with
   the longest line of horrors behind (or in front of) it wins, so a single
   round spends its pierce; a warden in reach always outranks the horde. */
const SNIPER_LOCK_RADIUS = 90;        // world px from the crosshair to a body's edge
const SNIPER_LOCK_BOSS_MUL = 1.6;     // wardens pull from this much farther out
const SNIPER_LOCK_CORRIDOR = 16;      // px of slop around the shot line when counting bodies
const SNIPER_LOCK_TIE_PX = 6;         // cursor distance that counts as a tie (keeps the mark steady)
/* FORTRESS — the war-machine's thrusters. Holding SHIFT drives the hull toward
   its boosted top speed through a soft acceleration curve, so it leans into a
   turn instead of snapping; releasing SHIFT lets it coast down on its own. */
const FORTRESS_BOOST_MUL = 2.4;        // multiplier on base speed while thrusting
const FORTRESS_BOOST_ACCEL = 6;        // how fast velocity chases the thrust (1/s)
const FORTRESS_BOOST_DRAG = 1.6;       // how slowly momentum bleeds off after release
const FORTRESS_BOOST_STOP = 2;         // px/s below which the hull is considered still
const FORTRESS_RAM_DMG = 14;           // contact damage while boosting (per hit tick)
const FORTRESS_RAM_TICK = 0.22;        // seconds between boost ram hits on the same frame pass
const FORTRESS_RAM_KNOCK = 120;        // knockback applied by a boost ram hit


/* ---------- characters & skins (vault unlockables) ---------- */
const CHARS = {
  gunsmith:  { name: "GUNSMITH",  glyph: "ᚠ", color: "#e8e2d0", cost: 0,
    desc: "The baseline. 100 vitality, steady hands.",
    hp: 100, speed: 250, dashCd: 1.1, startRunes: 0, rerolls: 3 },
  wraith:    { name: "WRAITH",    glyph: "ᚹ", color: "#5ee6ff", cost: 24000,
    desc: "70 vitality, fast dash that barely cools down — and dashes far longer than anyone else. Fires no bullets — instead it VEIL BURSTS: vanishing between worlds and wounding everything in a circle around it. Foes slain inside the circle discharge your full gun shot.",
    hp: 70, speed: 300, dashCd: 0.75, startRunes: 0, rerolls: 3, dashDur: 0.34 },
  juggernaut:{ name: "JUGGERNAUT",glyph: "ᛞ", color: "#ff8a3d", cost: 36000,
    desc: "160 vitality of stubborn meat. Slow. Fires one MASSIVE slug at a time — a glacial rate of fire, but the hardest-hitting base shot of any gunslinger, and it punches clean through the first body it hits.",
    hp: 160, speed: 210, dashCd: 1.4, startRunes: 0, rerolls: 3,
    weaponBase: { dmg: 44, rate: 1.0, size: 16, count: 1, knock: 160, pierce: 1 } },
  demolitionist: { name: "DEMOLITIONIST", glyph: "ᛥ", color: "#ff5e2e", cost: 46000,
    desc: "110 vitality. Works a stub MORTAR: each round a fat shell lobbed a short arc that clips whatever it crosses mid-air, then SLAMS on arrival — a crater ring, and the charge splinters into flying shot. Dashing sows waiting mines along the whole path; one shard always finds the fool who wakes one. Slow to load — the Juggernaut's glacial cadence.",
    hp: 110, speed: 240, dashCd: 1.2, startRunes: 0, rerolls: 3,
    weaponBase: { dmg: 24, rate: 1.0, size: 6, knock: 90 } },
  alchemist: { name: "ALCHEMIST", glyph: "ᛜ", color: "#7dff5e", cost: 56000,
    desc: "90 vitality. Carves a fifth rune slot the others can't, and gets 4 re-rolls to find the path.",
    hp: 90, speed: 250, dashCd: 1.1, startRunes: 0, rerolls: 4, runeSlots: 5 },
  shredder: { name: "SHREDDER", glyph: "ᛃ", color: "#7a62bd", cost: 40000,
    desc: "80 vitality. Wields a whirling void-saw that grinds nearby horrors and launches rune-etched debris when you fire. Dashing makes the saw hit harder.",
    hp: 80, speed: 300, dashCd: 0.95, dashDur: 0.3, dashSpeed: 920, startRunes: 0, rerolls: 2,
    sawReach: 76, weaponBase: { dmg: 6, rate: 8, size: 4, count: 1 } },
  necromancer: { name: "REANIMATOR", glyph: "ᚻ", color: "#8a86a0", cost: 50000,
    desc: "85 vitality. Slain horrors have a 40% chance to rise as ghost thralls. Thralls carry a share of your gun and your on-hit runes, and fight for you; their deaths feed your soul. The pack's cap grows every 2 floors, and the healthiest half follows you through each gate — the rest are spent for healing. Every 24s the pack is recalled to your side — or press recall. Below 35% vitality, a surplus of thralls is tithed for doubled healing.",
    hp: 85, speed: 257.5, dashCd: 1.0, startRunes: 0, rerolls: 4,
    weaponBase: { dmg: 16, rate: 2.6, size: 4 } },
  sniper: { name: "SNIPER", glyph: "ᚿ", color: "#c8e6a0", cost: 60000,
    desc: "90 vitality. A patient marksman: the farther a shot travels, the harder it bites — +15% damage per 100px, up to +90% at 600px. Base rounds hit +60%, fly +50% faster and punch through 2 bodies, but the rifle cycles 35% slower and NEVER fires itself — hold the trigger. The scope sees farther than anyone, and settles onto a horror under the crosshair — preferring the one with the most horrors lined up behind it, and always a warden. PUNCTURE answers the rifle at full strength: five stacks guarantee the gap for ×2.5. With a companion at your side, [E] sends it to break a distant seal. SCATTER never answers the rifle.",
    hp: 90, speed: 235, dashCd: 1.25, startRunes: 0, rerolls: 3,
    rangeDmg: SNIPER_RANGE_DMG, rangeStep: SNIPER_RANGE_STEP, rangeCap: SNIPER_RANGE_CAP,
    weaponBase: { dmg: 16, rate: 2.925, size: 4, speed: 810, spread: 0.02, knock: 70, pierce: SNIPER_PIERCE } },
  theUnknown: { name: "THE UNKNOWN", glyph: "?", color: "#e8e2d0", cost: 999999,
    desc: "225 vitality. Fires a spread of rune bolts; dashing cuts everything in its path. Every death carves one more rune into its gun.",
    hp: 225, speed: 225, dashCd: 0.75, startRunes: 0, rerolls: 30,
    weaponBase: { dmg: 10, rate: 3.5, size: 5, count: 5, spread: 0.22, knock: 40 } },
  sinner: { name: "WAYWARD PASSENGER", glyph: "ᚥ", color: "#9d6bff", cost: 50000,
    hidden: true, melee: true,
    desc: "A dimensional drifter. Purely melee — two tear-blades rip purple seams through the air with every swing. [R] WARP opens four rifts in an X around the nearest foe and shreds through them, cutting everything in the middle; walk into any rift to be thrown out of its twin, gaining speed and contact bite with each crossing. WARP stacks shorten the cooldown and deepen the rush.\nUNLOCK: Accumulate 35 WARP stacks in a single run.",
    hp: 90, speed: 310, dashCd: 1.1, startRunes: 0, rerolls: 5, runeSlots: 6,
    startLoadout: ["warp"],
    weaponBase: { dmg: 24, rate: 3.2, size: 85, speed: 450, knock: 100 } },
  sancho: { name: "SANCHO", glyph: "ᚦ", color: "#cc0000", cost: 0,
    hidden: true, consoleOnly: true, melee: true,
    desc: "The Second Kindred. Hardblood strengthens her fists, saber and lance; at 5 Hardblood she may switch to a blood bow — safe at range, but her steel hits harder. Her dash is a body-check that bites — by the lance stage it is a skewering run. Starts with BLEED and VAMPIRE. Only granted by the authenticated co-op console.",
    hp: 95, speed: 320, dashCd: 0.65, startRunes: 0, rerolls: 3, runeSlots: 5,
    weaponBase: { dmg: 12, rate: 4.5, size: 16, speed: 400, knock: 80 },
    startLoadout: ["bleed", "vampire", "bleed", "vampire"] },
  john: { name: "JOHN RUNEGUN", glyph: "⦿", color: "#aa8844", cost: 100000,
    hidden: true, runeSlots: 5, rerolls: 10, startRunes: 0,
    desc: "The absolute legend. Every stack of RUNEGUN doubles his damage (up to ×4096). Starts with 10 re-rolls and his signature rune.\nUNLOCK: 100,000 souls in the Keeper's vault. Turn on HIDDEN WARDENS in SETTINGS first so he appears on its shelves.",
    hp: 125, speed: 325, dashCd: 0.95, startRunes: 0, rerolls: 10,
    startLoadout: ["runegun"] },
  kim: { name: "BAMBOO-HATTED KIM", glyph: "ᛁ", color: "#a9c6d8", cost: 44000,
    melee: true,
    desc: "A drifting swordsman under a woven hat, his black robe soaked through with old blood. Purely melee — one long, very narrow cut of a pale jikdo, and every cut opens a bleeding wound. A cut heals him for 10% of its damage (up to half his vitals per swing), and a critical cut heals 25% of its bite. His PUNCTURE reads the rifle's way: +20% crit chance per stack, capped only at five full stacks, and a puncture strikes for ×2.5. Every fourth cut is TO CLAIM THEIR BONES, the draw: a full circle of steel that gains +2 Poise, always crits and MARKS the strongest horror it touches; that horror takes +30% from every following cut for 8s. The draw bites +30% harder on crit (+2% per Poise, max +50%), inflicts 3 Bleed and PARALYZES the strongest horror it touches — 1.2s, and that horror cannot be paralyzed again for 3s after recovering — and never loses Poise — BEARING OF A SALSU pays 3 HP per stack a banked draw would spend (never below 1, and only when at least one foe is struck; a riposte's draw is free), while every cut's critical damage scales with Kim's missing vitals (up to +50%). Felling a marked horror banks POISE (up to 5), each stack sharpening every cut by +6%. Any horror he fells feeds DRINK TO THE FALLEN (up to 4 stacks, +5% cut damage each). And once per floor, a blow that should fell him leaves him at 1 vitality — SWORDPLAY OF THE HOMELAND. Dashing banks one cut toward the next draw. YIELD MY FLESH: every blow Kim suffers arms RIPOSTE — the next cut within 4s becomes TO CLAIM THEIR BONES, counter or no counter; while his Poise stands at 3 or more, each stack also turns aside 3% of incoming damage (max 15%), and the draw cannot be knocked from its own arc.",
    hp: 105, speed: 285, dashCd: 1.0, startRunes: 0, rerolls: 3, runeSlots: 5,
    weaponBase: { dmg: 22, rate: 3.3, size: 16, speed: 400, knock: 90 } },
  yi: { name: "THE INDEX NURSEFATHER", glyph: "ᛝ", color: "#d9b65c", cost: 46000,
    hidden: true, melee: true,
    desc: "The Oracle delivers prescripts; Yi Sang executes them. A spider in a black suit, one gold eye, and a vial of black metallic liquid at his throat — it congeals into whatever the Prescript demands (Hermes breathes through it). Pure melee. Each cut the Vial pours out whichever of the nine Oracle Weapons Hermes wills: a HATCHET (blunt, +50% knock, slows), a STILETTO (pierce, gloom-bleed that never closes), a BASTARD SWORD (slash, +15% damage, +25% damage offense stack up to 2), a RAPIER (pierce, inflict 1 Defense Down on the target — its blows land 25% softer, stacks to 2, 3s), a HAMMER (blunt, +stagger — the target can't act for 1.1s), a GREATSWORD (slash, +20% damage, inflict 1 Fragility — target takes +25% damage, stacks to 2, 4s), a LANCE (pierce, +15% damage, inflict 1 Fragility), a WHIP (blunt, +15% damage, inflict 1 Fragility), or a SCYTHE (slash, +30% damage, guaranteed crit). Every 9 seconds the Prescript claims its target — the strongest horror on the board takes +20% from every cut, and each cut on it banks GRACE OF THE PRESCRIPT (max 9): at 3 his edge sharpens, at 6 his edge bites deeper, at 9 the full payout comes due (+30%). Carry the mark to execution — fell the marked horror — and Grace jumps forward while the Karmic Consequence lifts; let the mark escape and the Karmic Consequence takes him instead (max 10, −4% damage per stack). Every cut banks POISE — a critical banks double (max 5, +6% per stack).",
    hp: 110, speed: 265, dashCd: 1.1, startRunes: 0, rerolls: 3, runeSlots: 5,
    weaponBase: { dmg: 16, rate: 3.0, size: 15, speed: 380, knock: 55 } },
  fortress: { name: "FORTRESS", glyph: "ᛝ", color: "#bcd0ff", cost: 65000,
    desc: "300 vitality of immovable steel. Slow on foot — hold SHIFT to engage the thrusters, building momentum that carries you after you let go. Bristles with three guns: a main cannon firing paired 12-damage rounds, and two side guns at 9 damage each. With a companion at your side, [E] sends it to break a distant seal.",
    hp: 300, speed: 170, dashCd: 1.4, startRunes: 0, rerolls: 3,
    weaponBase: { dmg: 12, rate: 2.5, size: 6, count: 2, spread: 0.08, knock: 100, pierce: 1 } },
};
const charFor = id => CHARS[id] || CHARS.gunsmith;
const charColorFor = id => CHARS[id] ? CHARS[id].color : "#e8e2d0";
;
const charColor = () => CHARS[Meta.char] ? CHARS[Meta.char].color : "#e8e2d0";
;
/* One purchase per colour: an owned warpaint can be worn on the BODY, the GUN, or
   both at once (Meta.skin / Meta.gunSkin — unlock key "skin:<key>" is shared). */
const SKINS = {
  bone:   { name: "BONE",        color: "#e8e2d0", cost: 0,   desc: "Pale as what's under the floor." },
  emberg: { name: "EMBERGLOW",   color: "#ff8a3d", cost: 2000, desc: "Forge-orange warpaint." },
  toxin:  { name: "TOXIN",       color: "#7dff5e", cost: 2000, desc: "Don't lick it." },
  rime:   { name: "RIME",        color: "#5ee6ff", cost: 2000, desc: "Cold-blooded." },
  hex:    { name: "HEX",         color: "#9d6bff", cost: 2000, desc: "Seal-violet, the Warden's own shade." },
  gore:   { name: "GORE",        color: "#ff4d5e", cost: 3200, desc: "It isn't paint." },
  fathom: { name: "FATHOM",      color: "#4d7dff", cost: 3200, desc: "Pressure-blue, dredged from beneath the Nave." },
  witch:  { name: "WITCHLIGHT",  color: "#ff6bd6", cost: 3200, desc: "A colour with no honest business underground." },
  gilded: { name: "GILDED",      color: "#ffd23d", cost: 4000, desc: "Soul-gold. Pure vanity. Worth it." },
  quick:  { name: "QUICKSILVER", color: "#b8c4d6", cost: 4000, desc: "Mirror-steel. The horrors see themselves arrive." },
  voidt:  { name: "VOIDTOUCH",   color: "#c9b8ff", cost: 6000, desc: "The Horizon looked back, and it left this." },
  pure:     { name: "SUPERNOVA", color: "#ffffff", cost: 8000, desc: "The blinding radiance of a star at the instant of its collapse." },
  darkness: { name: "ABYSS",     color: "#05050a", cost: 8000, desc: "True nothingness. Not even your own shadow survives here." },
  jade:     { name: "EMERALD",   color: "#2eff8a", cost: 10000, desc: "A sharp, crystalline green that pulses with trapped, ancient life." },
  crimson:  { name: "SANGUINE",  color: "#880011", cost: 12000, desc: "The deep, dark red of a thousand cycles. It smells of ancient iron." },
  nebula:   { name: "NEBULA",    color: "#5d00ff", cost: 14000, desc: "A saturated, deep cosmic purple that seems to pull at the air around it." },
  sulfur:   { name: "SULFUR",    color: "#ccff00", cost: 16000, desc: "A violent, neon yellow-green that warns of imminent danger." },
  rainbow:   { name: "RAINBOW",    color: "#ffffff", cost: 50000, desc: "A shifting spectrum of colours that dances across the surface." },
};

//rainbow when

const skinFor = id => SKINS[id] || SKINS.bone;
const skinColorById = id => SKINS[id] ? SKINS[id].color : "#e8e2d0";
;
const skinColor = () => SKINS[Meta.skin] ? SKINS[Meta.skin].color : "#e8e2d0";
/* the gun's default is NOT a paint: unpainted barrels take the hue of the ruling rune
   (draw.js), so the vault offers this as a free "no paint" card in the gun section */
const GUN_STOCK = { name: "RUNELIGHT", color: "#8a86a0", cost: 0,
  desc: "No paint — bare metal that drinks the hue of whichever rune rules the gun." };
const gunSkinColor = () => Meta.gunSkin && SKINS[Meta.gunSkin] ? SKINS[Meta.gunSkin].color : null;
/* per-warden variants — co-op partners wear their own paint, not this device's Meta */
const skinColorFor = p => p && SKINS[p.skin] ? SKINS[p.skin].color : "#e8e2d0";
const gunSkinColorFor = p => p && p.gunSkin && SKINS[p.gunSkin] ? SKINS[p.gunSkin].color : null;
