/* =========================================================
   RUNEGUN · Scene — THE SINGULAR
   The saloon past the Event Horizon. Inside the void there is only you: a
   multiverse of yous, every one of them fighting to climb back out. One of
   them quit long enough to build a bar from the wreckage and pour for the
   next. You walk in after the Horizon falls, take the first round on the
   house (+10 vitality — healing only, the max never moves), buy more at ten
   souls a glass if you like (no healing, just the room tilting), talk to
   yourselves, and leave by the portal at the right end of the bar.
   Solo only, like the rift and the void ending: co-op rolls straight on.
   ========================================================= */
"use strict";

const SALOON_HEAL = 10;            // the first round, on the house — current vitality, capped at max
const SALOON_ROUND = 10;           // souls for every round after it
const SAL_ROUND_GAP = 0.9;         // seconds between rounds: a held key mustn't drain the souls in a blink
const SAL_LINE_T = 2.6;            // seconds each of the barkeep's answer lines holds
/* the drink: each round adds one, up to DRUNK_MAX; DRUNK_HOLD seconds after the last
   it starts wearing off, DRUNK_SOBER a second. It rides on Game, not the saloon, so
   whatever you're still carrying walks out the door with you. */
const DRUNK_MAX = 10;
const DRUNK_HOLD = 4;
const DRUNK_SOBER = 0.2;
/* past the tenth glass the room can't spin any harder — another round buys TIME
   instead of a level: each one adds this many seconds to the hold before sobriety
   starts eroding the stack. */
const DRUNK_HOLD_EXTEND = 8;
/* tier names for the HUD readout (index 0 = sober) */
const DRUNK_NAMES = ["", "COURAGE", "BLURRED AIM", "STAGGER STEP", "DAREDEVIL", "BLOODTHIRST",
  "IRON LIVER", "HOLLOW VESSEL", "RECKLESS", "BLACKOUT", "THE SINGULAR"];

/* drunk buffs: one per drunk tier (1..10). applied on top of the weapon build,
   fade as sobriety returns. each tier stronger than the last — the drink is a
   bargain, not just a tax. */
const DRUNK_BUFFS = [
  null,
  { dmgMul: 1.08 },      // 1 · LIQUID COURAGE — hits a little harder
  { rateMul: 1.12 },     // 2 · BLURRED AIM — fires faster than sense allows
  { moveMul: 1.10 },     // 3 · STAGGER STEP — quick on your feet
  { dashCdMul: 0.85 },   // 4 · DASHING DAREDEVIL — dash recharges quicker
  { leech: 0.20 },       // 5 · BLOODTHIRST — kills restore vitality
  { dr: 0.10 },          // 6 · IRON LIVER — blows land softer
  { shield: 1 },         // 7 · HOLLOW VESSEL — an extra ward charge
  { dmgMul: 1.15 },      // 8 · RECKLESS ABANDON — danger sharpens the strike
  { pierce: 2 },         // 9 · BLACKOUT — bullets punch through more
  { dmgMul: 1.20, execute: 0.50 }, // 10 · THE SINGULAR — you are the bar now
];

/* ---------- the room: a 1400×860 hall in the middle of the arena, the void outside its walls ---------- */
const SAL_ROOM = { x: 600, y: 470, w: 1400, h: 860 };
const SAL_BAR = { x: 760, y: 555, w: 860, h: 50 };       // the counter
const SAL_SHELF = { x: 760, y: 470, w: 860, h: 30 };     // the rune bottles
const SAL_KEEP = { x: 1190, y: 528 };                    // behind the counter
const SAL_DOOR = { x: 1760, y: 600 };                    // the portal at the bar's right end
const SAL_SPAWN = { x: 1300, y: 1270 };                  // just inside the swinging doors
/* the front wall is split around this gap; a solid "door" barrier fills it
   while you are inside, and is lifted once you are out in the void so the
   way back in never needs another dash. */
const SAL_DOORWAY = { x: 1220, y: 1330, w: 200, h: 40 };
/* the cameo waiting beyond the doors — pure lore, no fight, no reward */
const SAL_UNKNOWN = { x: 1300, y: 1560 };
const SAL_PIANO = { x: 600, y: 1240, w: 210, h: 90 };
const SAL_TABLES = [
  { x: 700, y: 830, w: 180, h: 110, felt: true },        // the blackjack table (scenes/blackjack.js)
  { x: 1160, y: 880, w: 120, h: 90, glasses: true },     // five glasses in a row
  { x: 1560, y: 860, w: 120, h: 90, spilt: true },       // the one who fed it
];
const SAL_STOOLS = [830, 900, 1040, 1180, 1320, 1420, 1500];   // x along the counter, y 642

/* ---------- what the barkeep says ---------- */
const SAL_ASKS = [
  { ask: "WHAT'S THIS?", lines: [
    "This? The Singular. Only bar in the void.",
    "Everyone who falls in here is you.",
    "Different guns. Different paint. Same fall.",
    "All of us clawing for the way out.",
    "I quit long enough to pour for the next me.",
    "That door goes deeper. Only way out is down."] },
  { ask: "WHO ARE THEY?", lines: [
    "Yous. Mes. Us. At least the ones still standing.",
    "Some rest a while. Some never get up.",
    "The ones who stopped drinking went hollow.",
    "You'll meet them at the bottom. Don't hesitate."] },
  { ask: "HOW DO I GET OUT?", lines: [
    "Down. Past a clock that stopped.",
    "Through glass that walks like you.",
    "To the last living star. Then you choose."] },
];
const SAL_FIRST_ROUND = "House rule: first's on me. The rest are ten souls.";
const SAL_BROKE = "Ten souls a round. Come back when you've got them.";
/* every paid round after the first, by how deep you are once it's down: 1 … 9 */
const SAL_ROUNDS = [
  "Ten souls. Sip it this time.",
  "Pace yourself. I never did.",
  "You're starting to sway like me.",
  "Two of you now? Still one tab.",
  "Door's that way. Mostly.",
  "Easy. The floor's not going anywhere.",
  "You've got my hiccups. I want them back.",
  "I've seen this. I was this.",
  "Last one I'd pour me. Pouring anyway."];
/* ten deep the room can't spin any faster — but every glass still buys more time */
const SAL_CAPPED = ["Room can't spin any faster. The buzz lasts longer, though.",
  "Bottom of the glass. Same souls, more time.",
  "Keep paying. The buzz is the only thing left to buy."];
const SAL_IDLE = [
  "Wipe your boots. Some of that's Horizon.",
  "Table's open, if you've souls to lose.",
  "No tab. You'd only run it up again.",
  "You look like me on a bad day. So, any day.",
  "Door's there when you want it."];

/* ---------- what waits outside the walls ----------
   THE UNKNOWN has no fight out here and gives nothing: it only answers.
   The lines change with what the run has already cost you. */
function salUnknownLines(me) {
  const beaten = !!(Meta.slain && Meta.slain["boss:" + UNK_KIND]) ||
                 !!(Game.unknownConquered);
  if (me && me.char === "theUnknown") return [
    "You're wearing my face. Put it back.",
    "I let you win once. I wanted to see what you'd do with it.",
    "Go back inside. The drink is kinder than I am.",
    "When you meet me below, don't hesitate. I won't.",
  ];
  if (beaten) return [
    "You killed me. Or you will. Out here the tenses don't agree.",
    "You took my face as a prize. Wear it better than I did.",
    "There's a door in the wall behind you. Use it. I don't entertain.",
    "The wall was meant to hold. You were not meant to be fast.",
  ];
  return [
    "You're not supposed to be out here.",
    "The wall was meant to hold. You were not meant to be fast.",
    "Go back inside. The drink is better than the truth.",
    "I'm not the one you'll meet below. I'm the one who waits after.",
    "When you meet me down there, don't hesitate. I won't.",
  ];
}

/* ---------- the regulars: every one of them is you, on a different Vault character ---------- */
const SAL_REGULARS = [
  { id: "high", char: "gunsmith", skin: "gilded", x: 790, y: 806, aim: Math.PI / 2, lines: [
    "Bought this paint with every soul I had.",
    "Rerolled for SCATTER four times. Got MIDAS four times.",
    "I always stand on sixteen. It's how I got here.",
    "Sit down, me. I'll deal you out."] },
  { id: "restless", char: "wraith", skin: "witch", x: 1420, y: 642, alt: 1500, aim: -Math.PI / 2, lines: [
    "Sat down eleven times. Keep dashing out of the chair.",
    "Seventy vitality. You get used to it. You don't.",
    "The Horizon tried to eat my bullets. I don't have any.",
    "See me twice, that's normal. Three times, leave."] },
  { id: "big", char: "juggernaut", skin: "gore", x: 900, y: 646, aim: -Math.PI / 2, lines: [
    "Hundred and sixty vitality. Lost to a wisp.",
    "Stool's reinforced. Ask me how I know.",
    "One slug, one drink. I keep it simple.",
    "Hit the Monarch when he surfaces. That's all I've got."] },
  { id: "shredder", char: "shredder", skin: "voidt", x: 1080, y: 646, aim: -Math.PI / 2, lines: [
    "I don't need to fire. The saw handles the crowd.",
    "Fastest clear I've ever had. The blade never lets up.",
    "Keep moving, keep cutting. That's the whole sermon.",
    "They say I'm overpowered. The horrors can file a complaint."] },
  { id: "under", char: "demolitionist", skin: "emberg", x: 840, y: 938, aim: Math.PI / 2, under: true, lines: [
    "Don't step there. Or there. I got bored.",
    "Mined the piano. Kidding. Mostly.",
    "The Tyrant melts cover. I make craters. Respect.",
    "Every crater down here has my name in it."] },
  { id: "reads", char: "alchemist", skin: "toxin", x: 1220, y: 856, aim: Math.PI / 2, lines: [
    "Five slots. Five glasses. Symmetry.",
    "Mixed VENOM and SLIME once. Never again.",
    "Every one of us is the same person. I'm the one who reads.",
    "Below here the clocks stop. Bring a patient gun."] },
  { id: "piano", char: "gunsmith", skin: "rime", x: 705, y: 1214, aim: Math.PI / 2, lines: [
    "I know one song. You know it too.",
    "Requests? No.",
    "Where you're going, even the music stops.",
    "Bar takes ten a glass. The table takes the rest."] },
  { id: "fed", char: "gunsmith", skin: "voidt", x: 1620, y: 836, aim: Math.PI / 2 + 0.6, lines: [
    "Shot the Horizon while it fed. It all came back.",
    "Every bullet I gave it, I'm still owed.",
    "What you fed it isn't gone. It's waiting further down.",
    "Voidtouch. The Horizon looked back. This is what it left."] },
  { id: "back", char: "gunsmith", skin: "hex", x: 1880, y: 760, aim: 0, faceDoor: true, lines: [
    "I went through that door once. I came back.",
    "There's glass down there that walks like you.",
    "Some of us stopped coming in. They went hollow.",
    "Meet us at the bottom, don't hesitate. We won't."] },
  { id: "reanimator", char: "necromancer", skin: "bone", x: 1500, y: 700, aim: Math.PI / 4, lines: [
    "They keep rising. I keep putting them down.",
    "Half vitality, all loyalty. A fair trade.",
    "The dead make better company. They don't talk back.",
    "Four thralls. That's the cap. I've counted."] },
];
/* each body murmurs at its own pitch when it speaks */
const SAL_VOICE = { gunsmith: 200, wraith: 270, juggernaut: 120, demolitionist: 170, alchemist: 235, necromancer: 180 };
/* the piano player's one song, a little wrong: [Hz, seconds] — 0 is a rest */
const SAL_TUNE = [[392, 0.28], [440, 0.28], [523, 0.28], [659, 0.56], [587, 0.28], [523, 0.28], [440, 0.56],
  [392, 0.28], [523, 0.28], [659, 0.28], [784, 0.56], [698, 0.28], [659, 0.28], [587, 0.84], [0, 0.9]];

const SAL_NOHINT = { hint: null, act: null };

/* the saloon follows the Horizon only in a solo descent — co-op has no stage sync for it yet */
function saloonAvailable() { return !(Game.coopLap || (typeof Net !== "undefined" && Net.active)); }

/* fully inside the four walls (not standing in a doorway or a wall gap) */
function saloonInsideRoom(p) {
  return p.x > SAL_ROOM.x + p.r && p.x < SAL_ROOM.x + SAL_ROOM.w - p.r &&
         p.y > SAL_ROOM.y + p.r && p.y < SAL_ROOM.y + SAL_ROOM.h - p.r;
}

/* the middle of the front wall: solid while you're in the room, lifted while
   you're out in the void so a fast dash is a one-way ticket you can walk back
   from. The swinging doors stay painted either way. */
function salSetDoor(open) {
  const has = MAP.rocks.some(rc => rc.sal === "door");
  if (open) {
    if (has) MAP.rocks = MAP.rocks.filter(rc => rc.sal !== "door");
  } else if (!has) {
    MAP.rocks.push(assignId({ x: SAL_DOORWAY.x, y: SAL_DOORWAY.y, w: SAL_DOORWAY.w, h: SAL_DOORWAY.h,
      tone: 0.5, sal: "door" }));
  }
}

/* a player-shaped record drawWarden() can paint, never added to players[] */
function salFolk(char, skin, x, y, aim) {
  return { x, y, r: 13, char, skin, gunSkin: null, pet: null, runes: {}, mods: {},
    aim, kickT: 0, hp: 1, maxHp: 1, iframes: 0, veilT: 0, dashT: 0,
    dashCd: 0, dashCdBase: 1, fireT: 0, veilCdBase: 0, shield: 0, shieldMax: 0,
    downed: false, gone: false, voice: SAL_VOICE[char] || 200, sway: rnd(0, TAU) };
}

/* walls, counter, shelf, tables and piano — solid like any rock, painted by drawSaloonUnder() */
function saloonRocks() {
  const R = (x, y, w, h, sal) => assignId({ x, y, w, h, tone: 0.5, sal });
  const rocks = [
    R(560, 380, 1480, 90, "wall"),                            // back wall: the wanted posters
    R(560, 1330, 660, 40, "wall"),                            // front wall, left of the swinging doors
    R(1420, 1330, 620, 40, "wall"),                           // front wall, right of them
    R(SAL_DOORWAY.x, SAL_DOORWAY.y, SAL_DOORWAY.w, SAL_DOORWAY.h, "door"),   // the closed doors
    R(560, 470, 40, 860, "wall"),
    R(2000, 470, 40, 860, "wall"),
    R(SAL_SHELF.x, SAL_SHELF.y, SAL_SHELF.w, SAL_SHELF.h, "shelf"),
    R(760, 500, 36, 55, "bar"), R(1584, 500, 36, 55, "bar"), // counter ends close off the barkeep's side
    R(SAL_BAR.x, SAL_BAR.y, SAL_BAR.w, SAL_BAR.h, "bar"),
    R(SAL_PIANO.x, SAL_PIANO.y, SAL_PIANO.w, SAL_PIANO.h, "piano"),
  ];
  for (const t of SAL_TABLES) rocks.push(R(t.x, t.y, t.w, t.h, t.felt ? "felt" : "table"));
  return rocks;
}

function makeSaloon(hello) {
  const me = localPlayer();
  /* the barkeep is you: your character, your paint, your gun, your runes — plus an apron */
  const keep = salFolk(me.char, me.skin, SAL_KEEP.x, SAL_KEEP.y, Math.PI / 2);
  keep.gunSkin = me.gunSkin; keep.runes = Object.assign({}, me.runes); keep.voice = 150;
  /* no regular wears your exact character + paint; they may wear paints you don't own yet */
  const taken = new Set([me.char + "|" + me.skin]);
  const regs = SAL_REGULARS.map(R => {
    let skin = R.skin;
    if (taken.has(R.char + "|" + skin)) skin = pick(Object.keys(SKINS).filter(k => !taken.has(R.char + "|" + k)));
    taken.add(R.char + "|" + skin);
    const aim = R.faceDoor ? angTo(R.x, R.y, SAL_DOOR.x, SAL_DOOR.y) : R.aim;
    return { id: R.id, npc: salFolk(R.char, skin, R.x, R.y, aim), aim, lines: R.lines,
      li: Math.floor(rnd(0, R.lines.length)), cd: 0, under: !!R.under, alt: R.alt, home: R.x };
  });
  /* the reanimator's thralls: a few grey minions hovering near their master */
  const thralls = [];
  for (let i = 0; i < 4; i++) {
    const a = rnd(0, Math.PI * 2), d = rnd(24, 52);
    thralls.push({ x: 1500 + Math.cos(a) * d, y: 700 + Math.sin(a) * d, r: rnd(6, 9) });
  }
  /* the thing beyond the doors: bigger than a warden, quieter than the piano */
  const unk = salFolk("theUnknown", "voidt", SAL_UNKNOWN.x, SAL_UNKNOWN.y, -Math.PI / 2);
  unk.r = 17; unk.voice = 96;

  return { t: 0, keep, regs, thralls, speech: [], hello, greet: 0, greetT: 0.9, talk: null, asked: 0, rounds: 0, roundT: 0, capI: 0, calledT: 4.5, bj: null,
    idleT: 9, idleI: 0, chatT: 2.0, holsterT: 0, scoldT: 0, warnedDoor: false,
    pianoT: 1.2, pianoI: 0, blinkT: 3,
    /* the void behind the saloon */
    unk, unkSeen: false, unkIdx: 0, unkSpoke: false,
    outside: false, murmurT: 0 };
}

/* the Horizon's way down opens onto the saloon instead of the next floor */
function enterSaloon() {
  const first = !Game.saloonVisits && (Meta.bests.voidKills || 0) <= 1;
  const hello = Game.saloonVisits ? "Round two? Kept your stool warm."
              : first ? "Well. Look who finally fell in."
              : "Back again. You never learn. Neither did I.";
  Game.saloonVisits = (Game.saloonVisits || 0) + 1;
  Game.inSaloon = true;
  Game.inRift = false; Game.riftCreature = null; Game.riftPicks = null;
  MAP.rocks = saloonRocks();
  enemies = []; bullets = []; ebullets = []; puddles = [];
  particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
  soulMotes = [];
  rift = null;
  Game.ambush = null; Game.boss = null; Game.shake = 0;
  Game.comboN = 0; Game.comboT = 0; Game.streakTier = -1;
  Game.bossRocks.length = 0;
  Game.chestsTotal = 0; Game.chestsOpened = 0;
  SEAL.state = "spent";                       // no seal answers in the saloon
  for (const p of players) {
    p.x = SAL_SPAWN.x + (p.idx ? 44 : 0); p.y = SAL_SPAWN.y;
    p.aim = -Math.PI / 2; p.dashT = 0; p.iframes = 1;
  }
  pets = [];
  for (const p of players) if (p.pet && PTYPES[p.pet]) pets.push(assignId(spawnPet(p.pet, p)));
  portal = { x: SAL_DOOR.x, y: SAL_DOOR.y, r: 46, t: 0 };   // open from the moment you arrive
  setupDeepFloor();                                          // no ice, no star, no stopped hour in here
  Game.saloon = makeSaloon(hello);
  Game.floorFade = 1;
  $("mapName").textContent = "THE SINGULAR";
  updateSeals();
  $("sealCount").textContent = "REST A WHILE";   // updateSeals() reads zero seals as the void floor
  $("bossBar").classList.remove("on");
  document.body.classList.remove("bossOn");
  setState("play");
  toast("YOU STEP INTO THE SINGULAR — EVERY FACE HERE IS YOURS");
  AudioFX.portal();
}

/* one line over a speaker's head; a new line from the same mouth replaces the old */
function salSay(who, txt, life) {
  const S = Game.saloon; if (!S) return;
  for (let i = S.speech.length - 1; i >= 0; i--) if (S.speech[i].who === who) S.speech.splice(i, 1);
  S.speech.push({ who, txt, t: 0, life: life || 3.0 });
  AudioFX.murmur(who.voice || 200, Math.min(9, 3 + Math.floor(txt.length / 7)));
}

/* [ E ] outside: the thing that waits behind the saloon answers, one line at a time */
function salUnknownTalk() {
  const S = Game.saloon; if (!S || !S.unk) return;
  const lines = salUnknownLines(localPlayer());
  S.unkSeen = true;
  salSay(S.unk, lines[S.unkIdx++ % lines.length], 3.6);
  AudioFX.click();
}

/* [ E ] at the bar: ask the next question, or hurry the current answer along */
function salAsk() {
  const S = Game.saloon; if (!S) return;
  if (S.talk) { S.talk.t = SAL_LINE_T; return; }
  if (S.asked < SAL_ASKS.length) {
    const A = SAL_ASKS[S.asked++];
    S.talk = { lines: A.lines, i: 0, t: 0 };
    salSay(S.keep, A.lines[0], SAL_LINE_T + 0.3);
  } else { if (S.roundT > 0) return; salRound(); }
  AudioFX.click();
}

/* the questions answered, [ E ] buys another round: ten souls, no healing, one more glass of effect */
function salRound() {
  const S = Game.saloon, me = localPlayer();
  S.roundT = SAL_ROUND_GAP;
  if (Game.score < SALOON_ROUND) { salSay(S.keep, SAL_BROKE, 3.0); return; }
  Game.score -= SALOON_ROUND; updateScore();
  floatText(me.x, me.y - 30, "−" + SALOON_ROUND + " SOULS", "#ffd23d", 14, { life: 1.3, vy: 24, outline: "#0b0b14" });
  const extended = salDrink();
  if (extended) floatText(me.x, me.y - 48, "+" + DRUNK_HOLD_EXTEND + "s DRUNK", "#f2b36d", 12, { life: 1.4, vy: 22, outline: "#0b0b14" });
  const lvl = Math.floor(Game.drunk);
  salSay(S.keep, S.rounds++ === 0 ? SAL_FIRST_ROUND
               : lvl >= DRUNK_MAX ? SAL_CAPPED[S.capI++ % SAL_CAPPED.length]
               : SAL_ROUNDS[Math.max(0, lvl - 1)], 2.8);
  AudioFX.pickup();
}

/* a trigger pulled in here: nothing fires, and the bar notices */
function saloonHolster(p) {
  const S = Game.saloon; if (!S) return;
  if (S.holsterT <= 0) {
    S.holsterT = 1.8;
    floatText(p.x, p.y - 28, "HOLSTERED", "#f2b36d", 13, { life: 1.1, vy: 24, outline: "#0b0b14" });
  }
  if (S.scoldT <= 0 && !S.talk && S.greet === 2) { S.scoldT = 9; salSay(S.keep, "Not in my saloon.", 2.4); }
}

/* the first round, on the house: +10 to whatever vitality you have, never past your max */
function salPour() {
  const S = Game.saloon, me = localPlayer();
  salSay(S.keep, me.hp >= me.maxHp ? "You look fine. First round's on me anyway." : "First round's on me.", 2.8);
  for (const p of alivePlayers()) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + SALOON_HEAL);
    const got = Math.round(p.hp - before);
    floatText(p.x, p.y - 30, got > 0 ? "+" + got + " VITALITY" : "FULL", "#7dff5e", 16, { life: 1.6, vy: 26, outline: "#0b0b14" });
    if (got > 0) healFlare(p.x, p.y);
  }
  updateHp();
  salDrink();
  AudioFX.pickup();
}

/* ---------- the drink: every round softens the room a little more ----------
   Game.drunk counts rounds' worth of effect, 0 … DRUNK_MAX (fractional while it
   wears off), and every few rounds one more thing goes wrong with the world:
     1  a soft blur and a slow sway        3  double vision
     5  the edges close in, warm and dark  7  hiccups
   Past DRUNK_MAX the glasses keep coming but the room can't get any worse.
   No ctx.filter and no shadowBlur, both heavy on phone GPUs: the blur is the frame
   shrunk to a sliver and stretched back over itself. Kill feedback OFF (also the
   OS reduced-motion default) keeps the blur but holds the room still. */
function salDrink() {
  /* past the tenth the room is already at its worst — the round extends the buzz
     instead of adding a tier the game can't show */
  const capped = Game.drunk >= DRUNK_MAX;
  if (capped) Game.drunkHold = Math.max(0, Game.drunkHold) + DRUNK_HOLD_EXTEND;
  else {
    Game.drunk = Math.min(DRUNK_MAX, Game.drunk + 1);
    Game.drunkHold = DRUNK_HOLD;
  }
  Game.drunkSpan = drunkRemain();          // the HUD bar measures against the glass just poured
  paintDrunkHud();
  return capped;
}

/* seconds until sober: the hold still to run, then the stack eroding at DRUNK_SOBER */
function drunkRemain() {
  return Math.max(0, (Game.drunkHold || 0) + Math.max(0, Game.drunk || 0) / DRUNK_SOBER);
}
function fmtDrunkTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
/* the HUD readout under the rune/curse strips — level, tier name, draining clock.
   Only touches the DOM when the visible text or bar actually changes. */
let _drunkHudKey = "";
function paintDrunkHud() {
  const box = $("drunkHud"); if (!box) return;
  const D = Game.drunk || 0;
  box.classList.toggle("on", D > 0);
  if (D <= 0) { _drunkHudKey = ""; return; }
  const lvl = Math.min(DRUNK_MAX, Math.floor(D));
  const remain = drunkRemain();
  const span = Game.drunkSpan > 0 ? Game.drunkSpan : remain;
  const key = lvl + "|" + Math.ceil(remain) + "|" + span.toFixed(1);
  if (key === _drunkHudKey) return;
  _drunkHudKey = key;
  const nm = $("drunkName"), tm = $("drunkTime"), fl = $("drunkFill");
  if (nm) nm.textContent = "DRUNK ×" + lvl + " · " + (DRUNK_NAMES[lvl] || "");
  if (tm) tm.textContent = "SOBER IN " + fmtDrunkTime(remain);
  if (fl) fl.style.width = (clamp(span > 0 ? remain / span : 1, 0, 1) * 100).toFixed(1) + "%";
}

/* apply the current drunk tier's buffs on top of the player's weapon build.
   only runs when the tier changes so it doesn't rebuild mods every frame. */
function applyDrunkBuffs(p) {
  const lvl = Math.floor(Game.drunk);
  const B = DRUNK_BUFFS[lvl];
  if (!B) return;
  p = p || localPlayer();
  if (!p || !p.mods) return;
  const m = p.mods;
  if (B.dmgMul) m.dmg *= B.dmgMul;
  if (B.rateMul) m.rate *= B.rateMul;
  if (B.moveMul) m.moveMul *= B.moveMul;
  if (B.dashCdMul) m.dashCdMul *= B.dashCdMul;
  if (B.leech) m.leech = Math.min(1, m.leech + B.leech);
  if (B.dr) m.dr = Math.min(0.6, m.dr + B.dr);
  if (B.shield) m.shield = Math.min(3, m.shield + B.shield);
  if (B.pierce) m.pierce += B.pierce;
  if (B.execute) m.execute = Math.min(0.6, m.execute + B.execute);
}

/* from update() and the blackjack table: the sway's clock, the hiccups, the slow way back */
function tickDrunk(dt) {
  if (Game.drunk <= 0) {
    paintDrunkHud();
    if ((Game.drunkBuffLvl || 0) > 0) {
      Game.drunkBuffLvl = 0;
      const p = localPlayer();
      if (p) { recalc(p); toast("SOBER — DRUNK BUFFS FADED", 2.4); }
    }
    return;
  }
  Game.drunkT += dt;
  Game.drunkJolt = Math.max(0, Game.drunkJolt - dt * 2.5);
  if (Game.drunkHold > 0) Game.drunkHold -= dt;
  else Game.drunk = Math.max(0, Game.drunk - DRUNK_SOBER * dt);
  const newLvl = Math.floor(Game.drunk);
  if (newLvl !== (Game.drunkBuffLvl || 0)) {
    Game.drunkBuffLvl = newLvl;
    const p = localPlayer();
    if (p) {
      /* recalc() rebuilds the build AND re-applies this tier's buffs (see data/runes.js) */
      recalc(p);
      if (newLvl === 0) {
        /* the glass that finally empties is handled HERE, not on the next tick —
           by then drunkBuffLvl is already 0 and the fade notice would never fire */
        toast("SOBER — DRUNK BUFFS FADED", 2.4);
      } else {
        const B = DRUNK_BUFFS[newLvl];
        if (B && Game.state === "play") {
          const names = [];
          if (B.dmgMul) names.push("DMG ×" + B.dmgMul.toFixed(2));
          if (B.rateMul) names.push("RATE ×" + B.rateMul.toFixed(2));
          if (B.moveMul) names.push("SPD ×" + B.moveMul.toFixed(2));
          if (B.dashCdMul) names.push("DASH ×" + B.dashCdMul.toFixed(2));
          if (B.leech) names.push("LEECH +" + B.leech);
          if (B.dr) names.push("RES +" + B.dr);
          if (B.shield) names.push("SHIELD +1");
          if (B.pierce) names.push("PIERCE +" + B.pierce);
          if (B.execute) names.push("EXECUTE +" + B.execute);
          toast("DRUNK · TIER " + newLvl + " · " + names.join(" + "), 2.6);
        }
      }
    }
  }
  paintDrunkHud();
  /* seven deep, the hiccups start: a lurch, a word, a chirp */
  if (Game.drunk < 7) { Game.drunkHic = 1.2; return; }
  Game.drunkHic -= dt;
  if (Game.drunkHic > 0 || Game.state !== "play") return;
  Game.drunkHic = rnd(3, 6);
  const me = localPlayer();
  if (me) floatText(me.x + rnd(-12, 12), me.y - 34, "hic!", "#f2b36d", 13, { life: 0.9, vy: 30, outline: "#0b0b14" });
  if (Meta.juice !== "off") { Game.drunkJolt = 1; Game.shake = Math.max(Game.shake, 3); }
  AudioFX.hic();
}

/* the sway: a drift for the camera (world units) and a slight roll, easing in with the first glass */
const DRUNK_SWAY = { x: 0, y: 0, roll: 0 };
function drunkSway() {
  const S = DRUNK_SWAY, D = Game.drunk;
  if (D <= 0 || Meta.juice === "off") { S.x = S.y = S.roll = 0; return S; }
  const t = Game.drunkT, k = Math.min(1, D), a = k * (8 + 2.4 * D);
  S.x = a * (Math.sin(t * 0.9) + 0.35 * Math.sin(t * 2.3 + 1.1));
  S.y = a * 0.55 * Math.sin(t * 1.3 + 0.7);
  S.roll = k * (0.005 + 0.002 * D) * Math.sin(t * 0.7 + 0.4) + 0.03 * Game.drunkJolt * Math.sin(t * 9);
  return S;
}
/* draw(), before the camera: lean the whole world about the middle of the screen */
function drunkRoll() {
  const r = drunkSway().roll;
  if (!r) return;
  cx.translate(W / 2, H / 2); cx.rotate(r); cx.translate(-W / 2, -H / 2);
}

/* draw(), once the world is down and before the vignette: blur, double vision, the closing edges */
let _drunkBuf = null, _drunkVg = null, _drunkVgKey = "";
function drawDrunkFX() {
  const D = Game.drunk; if (D <= 0) return;
  const t = Game.drunkT, k = Math.min(1, D), still = Meta.juice === "off";
  if (!_drunkBuf) { const c = document.createElement("canvas"); _drunkBuf = { c, g: c.getContext("2d") }; }
  const { c, g } = _drunkBuf, div = clamp(Math.round(3.5 * DPR), 3, 8);
  const bw = Math.max(1, Math.round(cv.width / div)), bh = Math.max(1, Math.round(cv.height / div));
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  g.drawImage(cv, 0, 0, bw, bh);
  cx.save();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalAlpha = k * Math.min(0.62, 0.28 + 0.034 * D);
  cx.drawImage(c, 0, 0, cv.width, cv.height);
  /* from the third round, a soft second room drifting off the first — drawn a
     touch oversized so its edges never show */
  const dv = clamp((D - 2) / 6, 0, 1);
  if (dv > 0) {
    const off = (3 + 14 * dv) * DPR;
    const ox = still ? off : Math.cos(t * 0.8) * off, oy = still ? 0 : Math.sin(t * 1.15) * off * 0.5;
    cx.globalAlpha = 0.15 + 0.25 * dv;
    cx.drawImage(c, ox - off, oy - off, cv.width + 2 * off, cv.height + 2 * off);
  }
  cx.restore();
  /* from the fifth, the edges close in: warm and dark, breathing */
  const tv = clamp((D - 4) / 5, 0, 1);
  if (tv > 0) {
    const key = W + "|" + H;
    if (key !== _drunkVgKey) {
      _drunkVgKey = key;
      _drunkVg = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.62);
      _drunkVg.addColorStop(0, "rgba(28,12,0,0)");
      _drunkVg.addColorStop(1, "rgba(28,12,0,0.88)");
    }
    cx.globalAlpha = tv * (still ? 0.85 : 0.72 + 0.28 * Math.sin(t * 1.4));
    cx.fillStyle = _drunkVg; cx.fillRect(0, 0, W, H);
    cx.globalAlpha = 1;
  }
}

/* per-frame saloon tick, called from update()'s interaction pass. Returns the
   LOCAL warden's hint/act, the same shape updateRift() returns. */
function updateSaloon(dt) {
  const S = Game.saloon;
  if (!Game.inSaloon || !S) return SAL_NOHINT;
  S.t += dt;
  const me = localPlayer();

  /* --- beyond the walls ---------------------------------------------------
     A fast enough dash can carry you through any of the four walls or the
     closed doors. Out there the middle of the front wall is lifted so the way
     back in is a walk, not a second trick; step fully inside and the doors
     seal again. A dash that is still in progress does not count — it may end
     with the body shoved back out of the wall. */
  const inside = saloonInsideRoom(me);
  const settled = me.dashT <= 0;
  if (settled && !inside && !S.outside) {
    S.outside = true;
    salSetDoor(true);
    if (!S.unkSeen) {
      S.unkSeen = true;
      S.murmurT = 10;
      toast("THE VOID BEHIND THE SINGULAR — THE AIR IS THINNER OUT HERE");
      AudioFX.murmur(92, 6);
    }
  } else if (settled && inside && S.outside) {
    S.outside = false;
    salSetDoor(false);
    toast("THE SINGULAR'S DOORS SWING SHUT BEHIND YOU");
    AudioFX.click();
  }
  if (S.outside) {
    S.murmurT -= dt;
    if (S.murmurT <= 0) { S.murmurT = rnd(8, 14); AudioFX.murmur(86 + rnd(0, 16), 3); }
  }
  if (S.unk) S.unk.aim = angTo(S.unk.x, S.unk.y, me.x, me.y);
  const nearUnk = !!(S.unk && S.outside && dist2(me.x, me.y, S.unk.x, S.unk.y) < 240 * 240);
  if (nearUnk && !S.unkSpoke) {
    /* it notices you first — the prompt is only for the rest */
    S.unkSpoke = true;
    S.unkIdx = 1;
    salSay(S.unk, salUnknownLines(me)[0], 3.8);
  }

  S.holsterT -= dt; S.scoldT -= dt; S.roundT -= dt;
  for (let i = S.speech.length - 1; i >= 0; i--) { const s = S.speech[i]; s.t += dt; if (s.t >= s.life) S.speech.splice(i, 1); }

  /* the barkeep watches you; the regulars shift on their stools; nobody walks through anybody */
  S.keep.aim = angTo(S.keep.x, S.keep.y, me.x, me.y);
  for (const g of S.regs) {
    const n = g.npc;
    g.cd = Math.max(0, g.cd - dt);
    n.aim = g.aim + Math.sin(S.t * 0.6 + n.sway) * 0.22;
    for (const p of alivePlayers()) {
      const d = Math.hypot(p.x - n.x, p.y - n.y), min = p.r + n.r;
      if (d < min && d > 0.01) { p.x = n.x + (p.x - n.x) / d * min; p.y = n.y + (p.y - n.y) / d * min; collideWorld(p); }
    }
  }

  /* the restless one can't keep a stool */
  S.blinkT -= dt;
  if (S.blinkT <= 0) {
    S.blinkT = rnd(2.6, 4.6);
    const g = S.regs.find(r => r.alt), n = g && g.npc;
    if (n) {
      for (let k = 0; k < 10; k++) particles.push({ x: n.x + rnd(-8, 8), y: n.y + rnd(-8, 8), vx: rnd(-50, 50), vy: rnd(-60, 10),
        t: 0, life: rnd(0.25, 0.5), r: rnd(1.5, 3), color: SKINS[n.skin].color });
      n.x = n.x === g.home ? g.alt : g.home;
      AudioFX.dash();
    }
  }

  /* the greeting: hello, then the drink */
  if (S.greet < 2) {
    S.greetT -= dt;
    if (S.greetT <= 0) {
      if (S.greet === 0) { salSay(S.keep, S.hello, 2.6); S.greet = 1; S.greetT = 2.3; }
      else { salPour(); S.greet = 2; }
    }
  }

  /* a few beats after the drink, the dealer calls you over to the felt (scenes/blackjack.js) */
  if (S.greet === 2 && S.calledT > 0 && !S.talk) {
    S.calledT -= dt;
    if (S.calledT <= 0 && !(S.bj && S.bj.sat)) { const d = bjDealer(); if (d) salSay(d, "Sit down, me. I'll deal you out.", 3.4); }
  }

  /* an answer in progress, one line at a time */
  if (S.talk) {
    S.talk.t += dt;
    if (S.talk.t >= SAL_LINE_T) {
      S.talk.i++; S.talk.t = 0;
      /* done — and a press mashed through the last line mustn't roll straight into buying a round */
      if (S.talk.i >= S.talk.lines.length) { S.talk = null; S.roundT = Math.max(S.roundT, 0.6); }
      else salSay(S.keep, S.talk.lines[S.talk.i], SAL_LINE_T + 0.3);
    }
  }

  const atBar = me.x > SAL_BAR.x && me.x < SAL_BAR.x + SAL_BAR.w && me.y < SAL_BAR.y + SAL_BAR.h + 74;
  const keepTalking = S.speech.some(s => s.who === S.keep);

  /* heading for the door */
  if (!S.warnedDoor && S.greet === 2 && !S.talk && dist2(me.x, me.y, SAL_DOOR.x, SAL_DOOR.y) < 230 * 230) {
    S.warnedDoor = true;
    salSay(S.keep, "Already? Fair. I'd go too.", 2.6);
  }

  /* the barkeep fills the quiet while you're away from the counter */
  if (S.greet === 2 && !S.talk && !atBar && !keepTalking) {
    S.idleT -= dt;
    if (S.idleT <= 0) { S.idleT = 10; salSay(S.keep, SAL_IDLE[S.idleI++ % SAL_IDLE.length], 3.0); }
  }

  /* the regulars: the nearest one within reach says its next line, never over the barkeep */
  S.chatT -= dt;
  if (S.chatT <= 0) {
    S.chatT = 0.3;
    if (!S.talk) {
      let best = null, bd = 180 * 180;
      for (const g of S.regs) { const d = dist2(me.x, me.y, g.npc.x, g.npc.y); if (d < bd) { bd = d; best = g; } }
      if (best && best.cd <= 0) {
        salSay(best.npc, best.lines[best.li++ % best.lines.length], 3.2);
        best.cd = 6; S.chatT = 2.4;
      }
    }
  }

  salPianoTick(dt);

  if (nearUnk) return { hint: "[ E ] THE UNKNOWN", act: salUnknownTalk };
  if (bjNearSeat(me)) return { hint: "[ E ] SIT DOWN · BLACKJACK", act: openBlackjack };
  if (atBar && S.greet === 2) {
    const hint = S.talk ? "[ E ] GO ON"
               : S.asked < SAL_ASKS.length ? "[ E ] ASK: " + SAL_ASKS[S.asked].ask
               : "[ E ] ANOTHER ROUND · " + SALOON_ROUND + " SOULS";
    return { hint, act: salAsk };
  }
  return SAL_NOHINT;
}

/* the piano player's one song: heard up close, seen from anywhere. Also ticked from the blackjack table */
function salPianoTick(dt) {
  const S = Game.saloon, me = localPlayer();
  S.pianoT -= dt;
  if (S.pianoT > 0) return;
  const nt = SAL_TUNE[S.pianoI++ % SAL_TUNE.length];
  S.pianoT = nt[1];
  if (!nt[0]) return;
  if (dist2(me.x, me.y, SAL_PIANO.x + 105, SAL_PIANO.y) < 640 * 640)
    AudioFX.piano(nt[0] * (Math.random() < 0.08 ? 1.06 : 1));   // a little wrong, now and then
  if (Game.state === "play") floatText(SAL_PIANO.x + 105 + rnd(-40, 40), SAL_PIANO.y - 6, "♪", "#f2b36d", 12, { life: 1.1, vy: 34 });
}

/* ---------- drawing (world space; called from draw()) ---------- */
let _salLamp = null, _salSpill = null;
function salLampSprite() {
  if (_salLamp) return _salLamp;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  gr.addColorStop(0, "rgba(242,179,109,0.30)"); gr.addColorStop(0.5, "rgba(242,179,109,0.09)"); gr.addColorStop(1, "rgba(242,179,109,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return (_salLamp = c);
}
function salSpillSprite() {
  if (_salSpill) return _salSpill;
  const c = document.createElement("canvas"); c.width = 128; c.height = 8;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, "rgba(157,107,255,0.30)"); gr.addColorStop(1, "rgba(157,107,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 8);
  return (_salSpill = c);
}

/* the floor, walls, bottles, posters, furniture — everything under the bodies */
function drawSaloonUnder() {
  const S = Game.saloon; if (!S) return;
  const R = SAL_ROOM, t = Game.time;
  cx.save();
  /* plank floor */
  cx.fillStyle = "#1a120e"; cx.fillRect(R.x, R.y, R.w, R.h);
  cx.strokeStyle = "#2b1d16"; cx.lineWidth = 2;
  cx.beginPath();
  for (let y = R.y + 44, row = 0; y < R.y + R.h; y += 44, row++) {
    cx.moveTo(R.x, y); cx.lineTo(R.x + R.w, y);
    for (let x = R.x + (row % 2 ? 90 : 230); x < R.x + R.w; x += 280) { cx.moveTo(x, y - 44); cx.lineTo(x, y); }
  }
  cx.stroke();
  /* lamplight pools */
  const lamp = salLampSprite(), flick = 0.9 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
  cx.globalAlpha = flick;
  for (const l of [[790, 885, 300], [1220, 925, 240], [1620, 905, 240], [1190, 640, 460], [705, 1250, 220], [1760, 640, 200]])
    cx.drawImage(lamp, l[0] - l[2], l[1] - l[2], l[2] * 2, l[2] * 2);
  cx.globalAlpha = 1;
  /* walls */
  for (const rc of MAP.rocks) {
    if (rc.sal !== "wall") continue;
    cx.fillStyle = "#2a1a12"; cx.fillRect(rc.x, rc.y, rc.w, rc.h);
    cx.strokeStyle = "#4c3020"; cx.lineWidth = 3; cx.strokeRect(rc.x + 1.5, rc.y + 1.5, rc.w - 3, rc.h - 3);
  }
  /* the closed middle of the front wall — drawn only while it is actually
     there, so an escaped warden sees an open doorway instead */
  for (const rc of MAP.rocks) {
    if (rc.sal !== "door") continue;
    cx.fillStyle = "#24170f"; cx.fillRect(rc.x, rc.y, rc.w, rc.h);
    cx.strokeStyle = "#4c3020"; cx.lineWidth = 3; cx.strokeRect(rc.x + 1.5, rc.y + 1.5, rc.w - 3, rc.h - 3);
    cx.fillStyle = "#3a2418"; cx.fillRect(rc.x + rc.w / 2 - 2, rc.y + 4, 4, rc.h - 8);
  }
  /* windows onto the void, set in the side walls: purple spills across the planks */
  const spill = salSpillSprite();
  for (const w of [[640, 1], [980, 1], [900, -1]]) {
    const wy = w[0], left = w[1] > 0, wx = left ? 560 : 2000;
    cx.save(); cx.translate(left ? 600 : 2000, wy); if (!left) cx.scale(-1, 1);
    cx.drawImage(spill, 0, 0, 180, 120); cx.restore();
    cx.fillStyle = "#120c26"; cx.fillRect(wx, wy, 40, 120);
    cx.fillStyle = "#c9b8ff";
    for (let k = 0; k < 5; k++) cx.fillRect(wx + 8 + (k * 13) % 26, wy + 10 + k * 22, 2.5, 2.5);
    cx.strokeStyle = "#4c3020"; cx.lineWidth = 3; cx.strokeRect(wx, wy, 40, 120);
  }
  /* the sign on the roofline, out in the void */
  cx.font = "bold 26px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.lineWidth = 5; cx.lineJoin = "round"; cx.strokeStyle = "#0b0b14"; cx.strokeText("THE SINGULAR", 1300, 352);
  cx.fillStyle = "#f2b36d"; cx.fillText("THE SINGULAR", 1300, 352);
  /* wanted posters: the five wardens behind you crossed out, three more waiting below */
  const wardens = BESTIARY.filter(b => b.tier === "boss");
  for (let i = 0; i < 8; i++) {
    const px = 812 + i * 108, py = 422, beaten = i < 5;   // the five above you crossed out; the three below still waiting
    cx.save(); cx.translate(px, py); cx.rotate(((i % 3) - 1) * 0.04);
    cx.globalAlpha = beaten ? 0.92 : 0.38;
    cx.fillStyle = "#d8c9a8"; cx.fillRect(-23, -30, 46, 60);
    cx.fillStyle = "#3a2418"; cx.font = "bold 8px monospace"; cx.fillText("WANTED", 0, -21);
    cx.font = "22px monospace"; cx.fillText(beaten ? wardens[i].glyph : "?", 0, 4);
    if (beaten) {
      cx.strokeStyle = "rgba(255,61,46,0.85)"; cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(-17, -12); cx.lineTo(17, 22); cx.moveTo(17, -12); cx.lineTo(-17, 22); cx.stroke();
    }
    cx.restore();
  }
  /* the shelf of rune bottles, one per rune, each in its colour */
  cx.fillStyle = "#3a2418"; cx.fillRect(SAL_SHELF.x, SAL_SHELF.y, SAL_SHELF.w, SAL_SHELF.h);
  const step = (SAL_SHELF.w - 20) / RUNE_IDS.length;
  for (let i = 0; i < RUNE_IDS.length; i++) {
    const bx = SAL_SHELF.x + 10 + i * step + step / 2 - 6, col = RUNES[RUNE_IDS[i]].color;
    cx.globalAlpha = 0.18; cx.fillStyle = col; cx.fillRect(bx - 4, 471, 20, 28);
    cx.globalAlpha = 0.9; cx.fillRect(bx, 478, 12, 18); cx.fillRect(bx + 4, 472, 4, 7);
  }
  cx.globalAlpha = 1;
  /* stools along the counter */
  for (const sx of SAL_STOOLS) {
    cx.fillStyle = "#2b1d16"; cx.beginPath(); cx.arc(sx, 642, 15, 0, TAU); cx.fill();
    cx.strokeStyle = "#4c3020"; cx.lineWidth = 3; cx.stroke();
  }
  /* the empty chair at the blackjack table glows; the one under the table, then the tables over them */
  drawBjSeatMarker();
  for (const g of S.regs) if (g.under) drawWarden(g.npc);
  for (const tb of SAL_TABLES) {
    cx.fillStyle = "rgba(0,0,0,0.35)"; cx.fillRect(tb.x + 6, tb.y + 8, tb.w, tb.h);
    cx.fillStyle = tb.felt ? "#1f3a2c" : "#3a2418"; cx.fillRect(tb.x, tb.y, tb.w, tb.h);
    cx.strokeStyle = "#4c3020"; cx.lineWidth = 5; cx.strokeRect(tb.x + 2.5, tb.y + 2.5, tb.w - 5, tb.h - 5);
    if (tb.felt) {
      /* the rune deck (render/cards.js): the shoe, the dealer's hand with the house card up, two cards waiting at the empty chair */
      const px = DPR * ZOOM;
      for (let k = 0; k < 3; k++) drawRuneCard(cx, null, tb.x + 32 - k, tb.y + 36 - k * 1.2, 16, 0, px);
      drawRuneCard(cx, null, tb.x + 80, tb.y + 32, 16, -0.08, px);
      drawRuneCard(cx, "midas", tb.x + 99, tb.y + 33, 16, 0.1, px);
      drawRuneCard(cx, null, tb.x + 72, tb.y + 80, 16, 0.06, px);
      drawRuneCard(cx, null, tb.x + 89, tb.y + 79, 16, -0.05, px);
      for (let k = 0; k < 6; k++) { cx.fillStyle = k % 2 ? "#ffd23d" : "#ff4d5e"; cx.beginPath(); cx.arc(tb.x + 140, tb.y + 30 + k * 4, 7, 0, TAU); cx.fill(); }
    } else if (tb.glasses) {
      for (let k = 0; k < 5; k++) {
        cx.fillStyle = RUNES[["venom", "slime", "ember", "frost", "mend"][k]].color; cx.globalAlpha = 0.8;
        cx.beginPath(); cx.arc(tb.x + 20 + k * 20, tb.y + 45, 7, 0, TAU); cx.fill();
      }
      cx.globalAlpha = 1;
    } else if (tb.spilt) {
      cx.fillStyle = "rgba(201,184,255,0.35)"; cx.beginPath(); cx.ellipse(tb.x + 70, tb.y + 52, 26, 12, 0.3, 0, TAU); cx.fill();
      cx.fillStyle = "#c9b8ff"; cx.save(); cx.translate(tb.x + 50, tb.y + 44); cx.rotate(1.2); cx.fillRect(-5, -9, 10, 18); cx.restore();
    }
  }
  /* the counter, its ends, and the tally of every you who has stood here */
  for (const rc of MAP.rocks) {
    if (rc.sal !== "bar") continue;
    cx.fillStyle = "#3a2418"; cx.fillRect(rc.x, rc.y, rc.w, rc.h);
    cx.fillStyle = "#5a3a26"; cx.fillRect(rc.x, rc.y, rc.w, 8);
    cx.strokeStyle = "#1c110b"; cx.lineWidth = 3; cx.strokeRect(rc.x, rc.y, rc.w, rc.h);
  }
  const tally = Math.max(1, Meta.bests.voidKills || 0);
  cx.strokeStyle = "rgba(242,179,109,0.6)"; cx.lineWidth = 2; cx.beginPath();
  for (let i = 0; i < Math.min(tally, 30); i++) {
    const grp = Math.floor(i / 5), k = i % 5, gx = SAL_BAR.x + 14 + grp * 30;
    if (k < 4) { cx.moveTo(gx + k * 5, SAL_BAR.y + 16); cx.lineTo(gx + k * 5, SAL_BAR.y + 38); }
    else { cx.moveTo(gx - 3, SAL_BAR.y + 36); cx.lineTo(gx + 19, SAL_BAR.y + 18); }
  }
  cx.stroke();
  if (tally > 30) {
    cx.font = "bold 11px monospace"; cx.fillStyle = "#f2b36d"; cx.textAlign = "left";
    cx.fillText("+" + (tally - 30), SAL_BAR.x + 14 + 6 * 30, SAL_BAR.y + 28); cx.textAlign = "center";
  }
  /* the piano */
  const P = SAL_PIANO;
  cx.fillStyle = "#24170f"; cx.fillRect(P.x, P.y, P.w, P.h);
  cx.fillStyle = "#e8e2d0"; cx.fillRect(P.x + 8, P.y + 6, P.w - 16, 16);
  cx.fillStyle = "#1a120e";
  for (let k = 0; k < 13; k++) if (k % 7 !== 2 && k % 7 !== 6) cx.fillRect(P.x + 18 + k * 14, P.y + 6, 7, 9);
  cx.strokeStyle = "#4c3020"; cx.lineWidth = 3; cx.strokeRect(P.x, P.y, P.w, P.h);
  /* swinging doors, still settling from your entrance */
  const sw = 0.9 * Math.abs(Math.sin(S.t * 6)) * Math.max(0, 1 - S.t / 2.2);
  cx.fillStyle = "#5a3a26";
  cx.save(); cx.translate(1240, 1348); cx.rotate(-sw); cx.fillRect(0, -7, 58, 14); cx.restore();
  cx.save(); cx.translate(1360, 1348); cx.rotate(sw); cx.fillRect(-58, -7, 58, 14); cx.restore();
  /* the back door: a frame around the portal at the bar's end */
  const D = SAL_DOOR;
  cx.fillStyle = "#3a2418";
  cx.fillRect(D.x - 66, D.y - 70, 12, 140); cx.fillRect(D.x + 54, D.y - 70, 12, 140); cx.fillRect(D.x - 66, D.y - 78, 132, 12);
  cx.font = "bold 11px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillStyle = "#c9b8ff"; cx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 2.4);
  cx.fillText("THE WAY DEEPER", D.x, D.y + 86);
  cx.restore();
}

/* the barkeep and the regulars, drawn just before the players */
function drawSaloonFolk() {
  const S = Game.saloon; if (!S) return;
  for (const g of S.regs) if (!g.under) drawWarden(g.npc);
  /* the reanimator's grey thralls, hovering near their master */
  for (const thr of S.thralls) {
    cx.save(); cx.translate(thr.x, thr.y);
    const bob = Math.sin(Game.time * 3 + thr.x) * 2;
    cx.fillStyle = "rgba(138,134,160,0.72)";
    cx.beginPath(); cx.arc(0, bob, thr.r, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = "#0b0b14";
    cx.beginPath(); cx.arc(0, bob - thr.r * 0.35, thr.r * 0.45, 0, Math.PI * 2); cx.fill();
    cx.restore();
  }
  drawBjSeatSign();
  /* the cameo outside: a shape the room has no business having */
  if (S.unkSeen && S.unk) {
    const pulse = 0.5 + 0.5 * Math.sin(Game.time * 1.6);
    cx.save();
    cx.globalAlpha = 0.16 + 0.12 * pulse;
    cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(S.unk.x, S.unk.y, 30 + 6 * pulse, 0, TAU); cx.stroke();
    cx.globalAlpha = 0.1;
    cx.beginPath(); cx.arc(S.unk.x, S.unk.y, 48 + 9 * pulse, 0, TAU); cx.stroke();
    cx.restore();
    drawWarden(S.unk);
  }
  const K = S.keep;
  drawWarden(K);
  /* the apron */
  cx.fillStyle = "#efe4c8"; cx.fillRect(K.x - 7, K.y + 3, 14, 10);
  cx.strokeStyle = "#3a2418"; cx.lineWidth = 1.5; cx.strokeRect(K.x - 7, K.y + 3, 14, 10);
}

/* speech, above everyone: fades in, holds, fades out */
function drawSaloonOver() {
  const S = Game.saloon; if (!S || !S.speech.length) return;
  cx.save();
  /* phones zoom the world OUT (ZOOM ~0.68): grow the words in world units so a line
     still reads at ~12 CSS px there, while desktop keeps the 13px look */
  const fs = Math.round(clamp(12 / ZOOM, 13, 19)), bh = fs + 11;
  cx.font = "bold " + fs + "px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
  for (const s of S.speech) {
    const a = clamp(Math.min(s.t / 0.15, (s.life - s.t) / 0.35), 0, 1);
    if (a <= 0) continue;
    const isKeep = s.who === S.keep;
    const w = cx.measureText(s.txt).width + 18;
    /* keep the bubble inside the visible slice — a narrow phone screen must not clip the line */
    const x = clamp(s.who.x, Game.cam.x + w / 2 + 6, Game.cam.x + VW - w / 2 - 6);
    let y = s.who.y - (isKeep ? 30 : 24) - bh / 2 - Math.min(s.t, 0.3) * 10;
    /* the HUD's floor title owns the top ~80 CSS px (most cramped on a phone): a bubble
       that would sit under it hangs BELOW its speaker instead */
    const below = (y - bh / 2 - Game.cam.y) * ZOOM < 80;
    if (below) y = s.who.y + (isKeep ? 30 : 24) + bh / 2;
    const edge = isKeep ? "#f2b36d" : (SKINS[s.who.skin] ? SKINS[s.who.skin].color : "#e8e2d0");
    cx.globalAlpha = a * 0.8; cx.fillStyle = "#0b0b14";
    cx.fillRect(x - w / 2, y - bh / 2, w, bh);
    const tx = clamp(s.who.x, x - w / 2 + 10, x + w / 2 - 10), ty = below ? y - bh / 2 : y + bh / 2, td = below ? -7 : 7;
    cx.beginPath(); cx.moveTo(tx - 6, ty); cx.lineTo(tx + 6, ty); cx.lineTo(tx, ty + td); cx.closePath(); cx.fill();
    cx.globalAlpha = a; cx.strokeStyle = edge; cx.lineWidth = 1.5;
    cx.strokeRect(x - w / 2 + 0.75, y - bh / 2 + 0.75, w - 1.5, bh - 1.5);
    cx.fillStyle = isKeep ? "#f2b36d" : "#e8e2d0";
    cx.fillText(s.txt, x, y + 1);
  }
  cx.restore();
}
