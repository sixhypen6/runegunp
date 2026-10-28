/* =========================================================
   RUNEGUN · Run & floor setup
   Resetting a run, building a floor's contents, and spawning chests / health boxes / rune pickups / floating text.
   ========================================================= */
"use strict";


/* monotonic entity id — every synced entity gets one at its spawn site */
function assignId(e) { e.id = Game.nextId++; return e; }

/* one warden, built from a {char, skin, pet, rerollBuff} config (co-op guests
   send theirs over the wire; solo builds one from the local Meta) */
function makePlayer(cfg, idx) {
  const c = CHARS[cfg.char];
  return { idx, char: cfg.char, skin: cfg.skin || "bone", gunSkin: cfg.gunSkin || null, pet: cfg.pet || null,
    x: MAP.w / 2 + (idx ? 44 : 0), y: MAP.h / 2 + 220, r: 13, hp: c.hp, maxHp: c.hp,
    vx: 0, vy: 0, speed: c.speed, aim: 0, fireT: 0, iframes: 0,
    dashT: 0, dashCd: 0, dashCdBase: c.dashCd, dashDur: c.dashDur || 0.18, dashSpeed: c.dashSpeed || 720, dashAng: 0, puddleTick: 0, autoFire: false,
    sawT: 0, sawRot: 0, sawHitTarget: null,
    veilT: 0, veilCdBase: 0,
    curses: {}, brandTick: 0, shield: 0, shieldMax: 0, shieldT: 0,
    /* the build — each warden carves their own path */
    runes: {}, lockedRunes: null, mods: null,
    rerolls: c.rerolls + (cfg.rerollBuff || 0),
    maxHpMul: 1, bonusRuneSlots: 0,
    /* downed / revive (co-op): crawling, waiting on a partner's hands */
    downed: false, reviveT: 0,
    /* REPRIEVE: the save's cooldown and the horde-hold it leaves behind */
    reprieveCd: 0, reprieveFreezeT: 0,
    /* RUNELESS: seconds of stride left from a rune box */
    hasteT: 0,
    /* SPEEDRUN: has this warden's first rune offer already shown WARD? */
    wardOffered: false };
}
function localPlayerCfg() {
  return { char: Meta.char, skin: Meta.skin, gunSkin: Meta.gunSkin, pet: Meta.pet,
    rerollBuff: Meta.unlocked["buff:rerolls"] || 0 };
}

function resetRun(cfgs) {
  /* Freeze the run's flavour here: a descent that began as a shared one keeps
     the five-floor lap even after the partner leaves, so the survivor never
     wanders into the deep floors, the saloon or THE UNKNOWN mid-run. */
  Game.coopLap = typeof Net !== "undefined" && Net.active;
  Game.mapIdx = 0; Game.loop = 0; Game.wave = 0;
  Game.score = 0; Game.kills = 0; Game.time = 0;
  if (typeof RunTimer !== "undefined") RunTimer.start();   // the speedrun clock starts with the descent
  Game.hitstop = 0; Game.flash = 0; Game.slowmo = 0; Game.ceremonyT = 0;
  Game.comboN = 0; Game.comboT = 0; Game.floorFade = 0; Game.voidImproved = null;
  Game.streakTier = -1; Game.hsReadyT = 0; Game.streakFlashT = -1; Game.flashCol = null;
  Game.soulFrac = 0;
  Game.nextId = 1;
  resetJuice();   // the juice scratch is keyed to Game.time, which resets to 0 below
  Game.banked = false; Game.continuesUsed = 0; Game.voidConquered = false; Game.voidKillTime = -1;
  Game.flawless = true; Game.flawlessToast = 0; Game.flawlessAward = 0;
  Game.riftOffered = false; Game.riftDone = false; Game.inRift = false; Game.riftCreature = null; Game.riftPicks = null;
  Game.inSaloon = false; Game.saloon = null; Game.saloonVisits = 0;
  Game.drunk = 0; Game.drunkHold = 0; Game.drunkSpan = 0; Game.drunkJolt = 0;
  Game.starConquered = false; Game.horizonFed = 0;
  Game.unknownDue = false; Game.unknownConquered = false;
  if (!cfgs) cfgs = [localPlayerCfg()];
  if (typeof DEV_P2 !== "undefined" && DEV_P2 && cfgs.length === 1) cfgs.push(Object.assign({}, DEV_P2_CFG));
  players = cfgs.map((cfg, i) => makePlayer(cfg, i));
  player = players[0];   // legacy alias for shell/scene code
  setupFloor(true);
  for (const p of players) {
    const c = CHARS[p.char];
    /* CHAOS challenges bend the starting build: RUNELESS grants nothing, ONE RUNE
       grants only the first rune (which immediately seals the path to it). */
    const runeless = Game.challenge === "runeless";
    const oneRune = Game.challenge === "onerune";
    let started = 0;
    if (!runeless) {
      if (c.startLoadout) for (const id of c.startLoadout) {
        if (oneRune && started >= 1) break;
        grantRune(p, id, true); started++;
      }
      for (let i = 0; i < (c.startRunes || 0); i++) {
        if (oneRune && started >= 1) break;
        grantRune(p, pick(runePool(p)), true); started++;
      }
    }
    recalc(p);
  }
  Game.intermission = 1.2;
  updateScore(); updateRerolls();
}

function setupFloor(first) {
  /* leaving the saloon or the unknown: cleared before genMap(), which reads floorDef() */
  Game.inSaloon = false; Game.saloon = null;
  Game.inUnknown = false; Game.unk = null;
  unknownHud(false);
  if (!first && typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("FLOOR", "entered floor index " + Game.mapIdx + " (depth " + depth() + ")");
  genMap();
  enemies = []; bullets = []; ebullets = []; puddles = [];
  particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
  soulMotes = [];
  portal = null; rift = null;
  pets = [];
  for (const p of players) if (p.pet && PTYPES[p.pet]) pets.push(assignId(spawnPet(p.pet, p)));
  Game.ambush = null; Game.boss = null; Game.shake = 0;
  /* a floor change drops the streak silently — no cash-out sting for walking through a door */
  Game.comboN = 0; Game.comboT = 0; Game.streakTier = -1;
  Game.inRift = false; Game.riftCreature = null; Game.riftPicks = null;
  Game.bossRocks.length = 0;
  Game.chestsTotal = Game.mapIdx === 4 ? 0 : Math.min(6, 4 + Game.loop);
  Game.chestsOpened = 0;
  if (!first) for (const p of players) {
    p.x = MAP.w / 2 + (p.idx ? 44 : 0); p.y = MAP.h / 2 + 220; p.iframes = 1.5;
    /* a floor change never carries a corpse through the portal */
    if (p.downed) { p.downed = false; p.hp = Math.max(p.hp, Math.round(p.maxHp * 0.3)); p.reviveT = 0; }
  }
  for (let i = 0; i < Game.chestsTotal; i++) spawnChest();
  if (Game.mapIdx !== 4) { for (let i = 0; i < 2; i++) spawnHealthBox(); }
  const F = floorDef();
  if (F.hazards) for (let i = 0; i < F.hazards; i++) {
    const p = openSpot(360, 220);
    if (F.hazardType === "water")
      puddles.push({ x: p.x, y: p.y, r: rnd(60, 90), t: 0, life: Infinity, team: "e", dmg: 0, color: "#2ea8b8", tickMap: {}, water: true });
    else if (F.hazardType === "ice")   // the Stilled Hour's black ice: harmless, but it keeps your momentum
      puddles.push({ x: p.x, y: p.y, r: rnd(70, 110), t: 0, life: Infinity, team: "e", dmg: 0, color: "#bfe6ff", tickMap: {}, ice: true });
    else
      puddles.push({ x: p.x, y: p.y, r: rnd(55, 85), t: 0, life: Infinity, team: "e", dmg: 6, color: "#ff5e2e", tickMap: {}, lava: true });
  }
  /* floors VI–VIII: the stopped hour, ice, the star and its flares (entities/deep.js) */
  setupDeepFloor();
  /* the Hellforge keeps its cover only until its master walks: when the Forge
     Tyrant lands, every rock barrier superheats and runs into a standing lava
     pool (igniteHellforge / tickForgeMelt). Until then the rocks stand. */
  if (Game.mapIdx === 4) {
    /* the final floor: no seals to break — the void is already awake */
    SEAL.state = "ready";
    toast("SOMETHING VAST BENDS THE DARK — WAKE IT WHEN YOU DARE");
  }
  $("mapName").textContent = F.name + (Game.loop ? " +" + Game.loop : "");
  updateSeals();
  $("bossBar").classList.remove("on");
  document.body.classList.remove("bossOn");   // letterbox never survives a floor change / new run
  if (!first) {
    toast("YOU DESCEND INTO " + F.name); AudioFX.portal();
    if (typeof RunTimer !== "undefined") RunTimer.split(F.name);   // floor split for the speed clock
  }
}

function spawnChest() {
  const p = openSpot(420, 260, 80);
  chests.push(assignId({ x: p.x, y: p.y, r: 18, state: "sealed", pulse: rnd(0, TAU) }));
}
function spawnHealthBox() {
  const p = openSpot(380, 260, 80);
  healthBoxes.push(assignId({ x: p.x, y: p.y, r: 16, state: "sealed", pulse: rnd(0, TAU) }));
}
/* the three runes roll from the pool of whichever warden TOUCHES the orb.
   Solo there is only one pool, so it rolls now (the orb displays its glyphs);
   in co-op `ids` stays null — drawn as "?" — until touched (update.js rolls it). */
function spawnPickup(x, y) {
  pickups.push(assignId({ x, y, r: 20, ids: players.length === 1 ? genThreeRunes(players[0]) : null, t: 0 }));
}
/* `opt` is purely additive — every existing 3-to-5-arg call lands on defaults that
   reproduce the original numbers exactly, so damage numbers stay on the fast draw path.
     life    seconds before it dies (default 0.7)
     vy      rise speed in px/s (default 40; 0 is legal, hence the undefined check)
     pop     scale overshoot that settles over 120ms — 0 keeps the fast path
     outline strokeText colour: readability without paying for shadowBlur
     glow    shadowBlur radius; scaled by the canvas.js GLOW budget */
function floatText(x, y, txt, color, size, opt) {
  const f = { x, y, txt, color, size, t: 0, life: 0.7, vy: 40, pop: 0, outline: null, glow: 0 };
  if (opt) {
    if (opt.life) f.life = opt.life;
    if (opt.vy !== undefined) f.vy = opt.vy;
    if (opt.pop) f.pop = opt.pop;
    if (opt.outline) f.outline = opt.outline;
    if (opt.glow) f.glow = opt.glow;
  }
  floaters.push(f);
  return f;
}

/* a bloom of green crosses + rising motes around a body that just mended */
function healFlare(x, y) {
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + rnd(-0.25, 0.25), d = rnd(20, 44);
    floatText(x + Math.cos(a) * d, y + Math.sin(a) * d - 4, "+", "#7dff5e", rnd(16, 24) | 0);
  }
  for (let i = 0; i < 20; i++) {
    const a = rnd(0, TAU), sp = rnd(40, 150);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 55,
      t: 0, life: rnd(0.4, 0.95), r: rnd(2, 4.5), color: pick(["#7dff5e", "#b8ff9e", "#5eff7d"]) });
  }
}

