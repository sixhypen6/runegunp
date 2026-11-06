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
    desc: "90 vitality. A patient marksman: the farther a shot travels, the harder it bites — +15% damage per 100px, up to +90% at 600px. Base rounds hit +60%, fly +50% faster and punch through 2 bodies, but the rifle cycles 35% slower and NEVER fires itself — hold the trigger. The scope sees farther than anyone. PUNCTURE answers the rifle at full strength: five stacks guarantee the gap for ×2.5. With a companion at your side, [E] sends it to break a distant seal. SCATTER never answers the rifle.",
    hp: 90, speed: 235, dashCd: 1.25, startRunes: 0, rerolls: 3,
    rangeDmg: SNIPER_RANGE_DMG, rangeStep: SNIPER_RANGE_STEP, rangeCap: SNIPER_RANGE_CAP,
    weaponBase: { dmg: 16, rate: 2.925, size: 4, speed: 810, spread: 0.02, knock: 70, pierce: SNIPER_PIERCE } },
  theUnknown: { name: "THE UNKNOWN", glyph: "?", color: "#e8e2d0", cost: 999999,
    desc: "225 vitality. Fires a spread of rune bolts; dashing cuts everything in its path. Every death carves one more rune into its gun.",
    hp: 225, speed: 225, dashCd: 0.75, startRunes: 0, rerolls: 30,
    weaponBase: { dmg: 10, rate: 3.5, size: 5, count: 5, spread: 0.22, knock: 40 } },
  sinner: { name: "WAYWARD PASSENGER", glyph: "ᚥ", color: "#9d6bff", cost: 50000,
    hidden: true, melee: true,
    desc: "A dimensional drifter. Purely melee — arm blades rip reality with each swing. Deals +100% damage with Dimensional Shred.\nUNLOCK: Accumulate 35 WARP stacks in a single run.",
    hp: 90, speed: 280, dashCd: 1.1, startRunes: 0, rerolls: 3,
    startLoadout: ["warp"],
    weaponBase: { dmg: 24, rate: 3.2, size: 85, speed: 450, knock: 100 } },
  sancho: { name: "SANCHO", glyph: "ᚦ", color: "#cc0000", cost: 0,
    hidden: true, consoleOnly: true, melee: true,
    desc: "The Second Kindred. Hardblood strengthens her fists, saber and lance; at 5 Hardblood she may switch to a blood bow. Her dash is a body-check that bites — by the lance stage it is a skewering run. Starts with BLEED and VAMPIRE. Only granted by the authenticated co-op console.",
    hp: 95, speed: 320, dashCd: 0.65, startRunes: 0, rerolls: 3, runeSlots: 5,
    weaponBase: { dmg: 12, rate: 4.5, size: 16, speed: 400, knock: 80 },
    startLoadout: ["bleed", "vampire", "bleed", "vampire"] },
  john: { name: "JOHN RUNEGUN", glyph: "⦿", color: "#aa8844", cost: 100000,
    hidden: true, runeSlots: 5, rerolls: 10, startRunes: 0,
    desc: "The absolute legend. Every stack of RUNEGUN doubles his damage (up to ×4096). Starts with 10 re-rolls and his signature rune.\nUNLOCK: 100,000 souls in the Keeper's vault. Turn on HIDDEN WARDENS in SETTINGS first so he appears on its shelves.",
    hp: 125, speed: 325, dashCd: 0.95, startRunes: 0, rerolls: 10,
    startLoadout: ["runegun"] },
  fortress: { name: "FORTRESS", glyph: "ᛝ", color: "#bcd0ff", cost: 65000,
    desc: "300 vitality of immovable steel. Slow on foot — hold SHIFT to engage the thrusters, building momentum that carries you after you let go. Bristles with three guns: a main cannon firing paired 12-damage rounds, and two side guns at 9 damage each. With a companion at your side, [E] sends it to break a distant seal.",
    hp: 300, speed: 170, dashCd: 1.4, startRunes: 0, rerolls: 3,
    weaponBase: { dmg: 12, rate: 2.5, size: 6, count: 2, spread: 0.08, knock: 100, pierce: 1 } },
    // whats startRunes? 0 is the default for all characters, but the Unknown has a special rule: it starts with 0 runes, but every time you die, it gains one more rune slot. So if you die 3 times, it will have 3 rune slots on your next run.
    //how is startRunes used in the code? It is used in the character selection screen to determine how many rune slots the character has at the start of the run. It is also used in the game logic to determine how many rune slots the character has when they die and respawn.
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

//how does one make rainbow work :sob

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
