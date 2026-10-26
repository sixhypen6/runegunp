/* =========================================================
   RUNEGUN · The Bestiary
   Lore + tactics for every horror and warden, keyed to Meta.slain
   so the main-menu glossary only reveals what you've actually killed.
   key === the kill-token recorded by recordSlain():
     enemies → the enemy type · bosses → "boss:" + kind
   ========================================================= */
"use strict";

const BESTIARY = [
  /* ---- the roaming dead (ETYPES) ---- */
  { tier: "enemy", key: "chaser", name: "REVENANT", glyph: "ᚱ", color: "#ff4d5e",
    desc: "Mindless dead, drawn to anything still warm. It weaves as it charges — never trusts a straight line, so neither should you. Harmless alone, lethal in a swarm." },
  { tier: "enemy", key: "gunner", name: "BONECASTER", glyph: "ᛒ", color: "#ffd23d",
    desc: "Holds the middle distance and spits aimed bolts. Close the gap or break its sightline — it cannot shoot what it cannot see." },
  { tier: "enemy", key: "dasher", name: "STALKER", glyph: "ᚦ", color: "#9d6bff",
    desc: "Creeps close, winds up, then lunges in a single killing dash. The wind-up is your cue: step across its lane, not back from it." },
  { tier: "enemy", key: "slammer", name: "BRUTE", glyph: "ᛗ", color: "#ff8a3d",
    desc: "Slow tonnage that raises its fists and drops a floor-splitting shockwave. Stay clear of the ring when it slams; punish the long recovery." },
  { tier: "enemy", key: "spitter", name: "SPITTER", glyph: "ᛉ", color: "#7dff5e",
    desc: "Keeps its distance and vomits a radial fan of bile. Tuck between the spokes — or kill it before it winds up the next spray." },
  { tier: "enemy", key: "wisp", name: "WISP", glyph: "ᚺ", color: "#c9b8ff",
    desc: "A scrap of the Catacomb's first horror. Blinks in beside you, fires five quick shots, and is gone. Untouchable until it appears — wait for the flicker." },
  { tier: "enemy", key: "summoner", name: "NECROMANCER", glyph: "ᛊ", color: "#b8d68a",
    desc: "A coward that flees and raises the dead behind it. Ignore the tide and run the caster down — the swarm stops the instant it falls." },
  { tier: "enemy", key: "shade", name: "SHADE", glyph: "ᛁ", color: "#b0e8dc",
    desc: "A ghost of the Ossuary's restless dead, and it knows nothing of walls — it drifts through solid stone, always straight at you. Stone stops your shot but never its advance: cut it down in the open, and never let a rock sit between you." },
  { tier: "enemy", key: "cinder", name: "CINDER", glyph: "ᚲ", color: "#ff5e2e",
    desc: "A molten slug that scorches its own trail and bursts into a ring of fire when slain. Whatever you do, don't be hugging it as it dies." },
  { tier: "enemy", key: "slag", name: "SLAGHULK", glyph: "ᛞ", color: "#ffb02e",
    desc: "A boulder of half-cooled slag that stalks you and hurls its whole tonnage skyward. Watch the red ring, not the beast — and know that slaying it only breaks it into four." },
  { tier: "enemy", key: "slagling", name: "SLAGLING", glyph: "ᚢ", color: "#ffb02e",
    desc: "A burning fist of the Slaghulk, freed by its death. Quick, fragile, and it hops at your ankles in a pack. Sweep the shards before they surround you." },
  { tier: "enemy", key: "angler", name: "ANGLER", glyph: "ᚫ", color: "#3ec6d8",
    desc: "It hangs in the murk where the eye slides past, and dangles a little golden light that looks for all the world like treasure. The light is bait. You are the catch. Shoot the dark behind the glint — once it lunges and misses, it lies spent and soft." },
  { tier: "enemy", key: "riptide", name: "RIPTIDE", glyph: "ᛚ", color: "#7de8e0",
    desc: "A wave that hunts. It draws itself up, marks its lane, and breaks across the nave — and anything it catches is carried with it, delivered to whatever waits at the far end. Dash out of the current, or ride it into ruin." },
  { tier: "enemy", key: "mourner", name: "MOURNER", glyph: "ᛙ", color: "#dfefff",
    desc: "A figure of rime caught mid-grief when the hour stopped, hands over its face. It cannot move while you are looking at it. Turn your aim away and it crosses the room in a breath of frost. Keep it in your sights, or kill it." },
  { tier: "enemy", key: "lapse", name: "LAPSE", glyph: "ᛅ", color: "#e6c27a",
    desc: "A stopped moment in a little brass cage, drifting and ticking. Break the cage and the moment spills: for three seconds, everything inside it moves at a third of its speed. Shot, horror and you." },
  { tier: "enemy", key: "lumen", name: "LUMEN", glyph: "ᛐ", color: "#fff3c8",
    desc: "A flame of the escaped light. It draws a hairline toward you, holds it, then fires a lance down the line, and the lance bends off every pane it meets. Read the line, not the flame: the whole path is drawn before it burns." },
  { tier: "enemy", key: "penitent", name: "PENITENT", glyph: "ᛔ", color: "#b8c4d6",
    desc: "It shuffles forward on its knees with a mirror held up before it. Shoot the glass and your shot comes straight back at you. It turns slowly: circle it and strike its back, or bank a shot off a pane to reach around the mirror." },
  { tier: "enemy", key: "drifter", name: "DRIFTER", glyph: "ᚻ", color: "#e8c9a0",
    desc: "One of the gunslingers who came for your runes and never found the way home. It fights the way you do: strafes, ducks behind stone, dashes through your shot on a puff of dust. Its iron holds six. Count them. When it stops to reload, it's yours." },
  { tier: "enemy", key: "carrion", name: "CARRION", glyph: "ᚼ", color: "#c98aa0",
    desc: "Carrion birds of a dying sun. They wheel too high to shoot, and only their shadow crosses the ground. They come down for whatever glitters: a rune orb left lying is a rune orb lost. Bring one down and it drops what it carried." },
  { tier: "enemy", key: "phylactery", name: "PHYLACTERY", glyph: "ᛟ", color: "#d8ffb0",
    desc: "A shard of the Marrow King's soul, set orbiting his body. While any vessel survives he shrugs off nearly all harm — shatter the vessels first." },

  /* ---- the wardens (boss kind 0..4) ---- */
  { tier: "boss", key: "boss:0", name: "THE CHAINED WARDEN", glyph: "ᚷ", color: "#9d6bff",
    floor: "FLOOR I · THE CATACOMB",
    desc: "The jailer. Blinks through its own chains, yanks you into cages of shot, and lays hexes that jam your gun and weigh your feet. Patience first, fury later." },
  { tier: "boss", key: "boss:1", name: "THE MARROW KING", glyph: "ᛏ", color: "#b8d68a",
    floor: "FLOOR II · THE OSSUARY",
    desc: "A lich who turns the bonefields into his graveyard. Raises the dead, drains your soul to mend his own, then scatters into three vessels you must break." },
  { tier: "boss", key: "boss:2", name: "THE FORGE TYRANT", glyph: "▲", color: "#ff8a3d",
    floor: "FLOOR III · THE HELLFORGE",
    desc: "A walking volcano. Carves the floor with rivers of lava, inhales you toward the furnace, then sheds its armor in a meltdown of shrapnel and heat." },
  { tier: "boss", key: "boss:3", name: "THE DROWNED MONARCH", glyph: "ᛘ", color: "#7de8e0",
    floor: "FLOOR IV · THE DROWNED NAVE",
    desc: "The forge's quenching waters drain here, and something wears them as a crown. It slips beneath the floor where no shot can follow, stalks you as a ripple, and erupts. When the sea rears, find the gap; when the nave floods, hold the dry ground." },
  { tier: "boss", key: "boss:4", name: "THE EVENT HORIZON", glyph: "●", color: "#c9b8ff",
    floor: "THE VOID BENEATH",
    desc: "The end of light. Its gravity never lets go; it swallows your own bullets and spits them back wearing your colors, and in its hunger it devours the arena itself." },
  { tier: "boss", key: "boss:5", name: "THE HOURGLASS SAINT", glyph: "ᛪ", color: "#e6c27a",
    floor: "FLOOR VI · THE STILLED HOUR",
    desc: "A saint of frozen light with an hourglass for a heart. It stops the hour to walk where you cannot, turns the glass to send its shot back through you, and at the end it winds the floor itself into a clock. When time stops, keep firing: the hour gives back everything you put into it." },
  { tier: "boss", key: "boss:6", name: "THE THOUSANDFOLD", glyph: "◈", color: "#eef2ff",
    floor: "FLOOR VII · THE GLASS CHOIR",
    desc: "Every light the Horizon swallowed, given back at once and wearing a body. It throws lances through its own glass, splits into reflections that walk the way you walk, and at the last it becomes a white hole, which only gives. Whatever you fed the Horizon, it returns." },
  { tier: "boss", key: "boss:7", name: "THE OTHER GUNSLINGERS", glyph: "✶", color: "#ff5470",
    floor: "FLOOR VIII · THE LAST LIVING STAR",
    desc: "They came for your runes past the last living star and drove you into the dark. Three hollowed things wearing the Vault's shapes. They steal your runes mid-fight, the leader learns from whichever of them you kill first, and at high noon he wants a fair draw." },
  { tier: "boss", key: "boss:8", name: "THE UNKNOWN", glyph: "?", color: "#c9b8ff",
    floor: "PAST THE LAST LIVING STAR",
    desc: "The patient thing from the rift on floor I. It carved you one more rune, then waited at the bottom to see what you made of it. Every rune ever carved answers to it, and each one rises over its head and glows before it strikes, so read the glyph. Wound it deep enough and it hides in the abyss, sending back the wardens you broke." },
];

/* ---- OMENS: the haloes a horror can rise wearing ----
   Deeper in, lesser horrors are marked by the Catacomb (enemies.js · BUFF_WAVE,
   buffChance, WRATH_DMG_MUL). Players kept meeting the gold and red rings with no
   idea what either promised, so the glossary now states it plainly.
   `art` names the creature the portrait is drawn from and `artColor` the body it wears
   — a STALKER in its own arcane purple, deliberately NOT the omen's colour, so the ring
   is the only gold or red on the card and reads as the thing being described. `mark` is
   the halo laid over it (drawHaloMark, draw.js — the same call the arena makes).
   Always shown: an omen you have not yet met is exactly the one worth reading about. */
const OMEN_ART = "dasher", OMEN_ART_COLOR = "#9d6bff";
const OMENS = [
  { key: "omen:buffed", mark: "buffed", art: OMEN_ART, artColor: OMEN_ART_COLOR, name: "EMPOWERED", color: "#ffd23d",
    ring: "A GOLD HALO, TURNING WITH THE CLOCK",
    desc: "It rises with TWICE the vitality of its kin, and it plants its feet — nothing you hit it with will shift it an inch. It strikes no harder than its unmarked kin; it simply takes far longer to put down, and it will not be shoved out of your way while you work. Bring the bigger gun, or leave it and run." },
  { key: "omen:wrath", mark: "wrath", art: OMEN_ART, artColor: OMEN_ART_COLOR, name: "WRATHFUL", color: "#ff3d2e",
    ring: "A RED HALO, TURNING AGAINST IT",
    desc: "It carries the ordinary vitality of its kin and dies just as fast — but everything it lands strikes HALF AGAIN as hard. Claw, bolt and shockwave alike, and its shots keep the fury long after it has hurled them, so a bolt already in the air is no safer for its caster being dead. Cheap to put down, ruinous to leave standing — kill it first." },
  { key: "omen:rime", mark: "rime", art: OMEN_ART, artColor: OMEN_ART_COLOR, name: "RIMEBOUND", color: "#5ee6ff",
    ring: "AN ICE-BLUE HALO, TURNING WITH THE CLOCK",
    desc: "The Catacomb's cold has settled into it, and every blow it lands leaves that cold in YOUR legs: claw or bolt, each hit lays the WEIGHT hex on you for a moment, and its shots keep their chill in flight after the caster is dust. One hit is a stumble; a stream of them will pin you leaden in the open. Do not trade hits with it — break its line of fire first." },
  { key: "omen:sear", mark: "sear", art: OMEN_ART, artColor: OMEN_ART_COLOR, name: "SEARING", color: "#ff8a3d",
    ring: "AN EMBER-ORANGE HALO, TURNING AGAINST IT",
    desc: "It has carried a coal of the Hellforge up through the stone. Half of everything it lands — claw or bolt alike — leaves embers clinging, and you BURN: the BRAND, ticking your vitality away long after the blow itself. The fire cares nothing for who threw it; a searing bolt in the air outlives its caster. The element is rolled apart from gold and red, and ice and fire never mark the same body." },
  { key: "omen:both", mark: "both", art: OMEN_ART, artColor: OMEN_ART_COLOR, name: "BOTH RINGS", color: "#ff8a3d",
    ring: "RED RIDING OUTSIDE GOLD",
    desc: "The two marks are rolled separately, so a rare few horrors wear each: twice the vitality AND half again the damage, with the red ring set outside the gold. Neither omen appears before wave 5, and both grow commoner with every wave after. Treat one of these as a boss that wandered in." },
];
