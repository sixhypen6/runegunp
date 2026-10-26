/* =========================================================
   RUNEGUN · Characters & skins
   Vault unlockables: playable characters (stats/loadout) and warpaint skins.
   ========================================================= */
"use strict";


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
    desc: "85 vitality. Slain horrors have a 40% chance to rise as ghost thralls. Thralls keep half their vitality and fight for you; their deaths feed your soul.",
    hp: 85, speed: 257.5, dashCd: 1.0, startRunes: 0, rerolls: 4,
    weaponBase: { dmg: 16, rate: 2.6, size: 4 } },
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
  rainbow:   { name: "RAINBOW",    color: "#ffffff", cost: 25000, desc: "A shifting spectrum of colours that dances across the surface." },
};
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
