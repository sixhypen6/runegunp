/* =========================================================
   RUNEGUN · Game state
   The central mutable Game object: run progress, wave/score, camera, screen-shake and pending interactions.
   ========================================================= */
"use strict";


/* =========================================================
   GAME STATE
   ========================================================= */
const Game = {
  state: "menu",   // menu | vault | play | pause | held | rune | choice | continue | dead
  wave: 0, score: 0, kills: 0, time: 0,
  /* the build (runes / lockedRunes / rerolls / mods / maxHpMul / bonusRuneSlots)
     lives on each player object now — co-op wardens carve separate paths */
  nextId: 1,                    // monotonic entity id, assigned at every spawn (net sync)
  mapIdx: 0, loop: 0,
  chestsTotal: 4, chestsOpened: 0,
  shake: 0, flash: 0, hitstop: 0,
  slowmo: 0,                    // boss-death slow-motion: while > 0, sim dt is scaled down
  ceremonyT: 0,                 // boss-death ceremony countdown; opens the reward choice when it expires
  comboN: 0, comboT: 0,         // rapid-kill streak counter + its decay window
  streakTier: -1,               // highest STREAK_TIERS index the live streak has reached (-1 = none)
  soulFrac: 0,                  // carried fractional streak bonus — see the payout in killEnemy
  hsReadyT: 0,                  // Game.time before which no recurring freeze may start — beatHitstop() in juice.js
  streakFlashT: -1,             // Game.time of the last streak flash — 0.5s photosensitivity floor
  flashCol: null,               // "r,g,b" the screen flash paints with; null = the legacy red
  floorFade: 0,                 // 1 → 0 black fade drawn over the floor swap
  voidImproved: null,           // void records improved this run (merged into recordBests' map)
  cam: { x: 0, y: 0 },
  intermission: 0, ambush: null,
  boss: null, bossPhaseToast: 0,
  bossRocks: [],
  pendingPickup: null,
  pendingPickupBy: 0,     // index into players[] of the warden choosing the rune
  banked: false,
  continuesUsed: 0,      // revives taken this run (souls or ad) — capped at MAX_CONTINUES
  flawless: true,         // no damage taken the ENTIRE run so far — one hit forfeits it for every stage after
  flawlessToast: 0,       // FLAWLESS banner countdown, set when a warden falls with the run still untouched
  flawlessAward: 0,       // bonus souls the banner displays
  /* THE UNKNOWN — the rift offered after the first Warden falls */
  maxHpMul: 1,            // halved (0.5) for the rest of the run if you take the rift
  bonusRuneSlots: 0,      // the unknown carves an extra rune slot
  riftOffered: false, riftDone: false, inRift: false,
  riftCreature: null,
  riftPicks: null,        // playing AS THE UNKNOWN: three of its runes hang in the hush, one may be taken (scenes/rift.js)
  inSaloon: false, saloon: null,   // THE SINGULAR — the saloon stage after the Event Horizon (scenes/saloon.js)
  saloonVisits: 0,                 // times through the saloon this run — the barkeep remembers
  drunk: 0, drunkHold: 0,          // the saloon's rounds: 0–10 rounds' worth of blur and sway · seconds before it starts wearing off
  drunkSpan: 0,                    // the full duration the last glass bought — the HUD's draining bar divides by it
  drunkT: 0, drunkHic: 0, drunkJolt: 0,   // the sway's own clock · the next hiccup · a hiccup's lurch, fading (scenes/saloon.js)
  deep: null,                      // per-floor state of floors VI–VIII (entities/deep.js setupDeepFloor)
  starConquered: false,            // have THE OTHER GUNSLINGERS fallen this run — the run's question is asked once
  /* THE UNKNOWN — the final stage. Once the Other Gunslingers fall (solo, first time), the
     way out runs through the rift's creature; its death asks the run's question. */
  unknownDue: false,               // floor VIII is down and the final rift is owed
  inUnknown: false, unk: null,     // in the final stage · its live state (entities/unknown.js)
  unknownConquered: false,         // THE UNKNOWN has fallen this run
  horizonFed: 0,                   // shots the Event Horizon swallowed this run — THE THOUSANDFOLD gives them back
  voidConquered: false,   // has the Event Horizon (void boss) fallen this run
  voidKillTime: -1,       // Game.time at the FIRST void kill this run (-1 = not yet); anchors post-void survival
  devRun: false,          // a TEST TOOLS run (systems/devtools.js): nothing it does reaches the save
  hardMode: false,        // HARD descent: +50% enemy & warden HP. Set only by the menu mode
                          // chooser; NOT reset in resetRun() so DESCEND/ASCEND AGAIN repeats the mode.
  coopLap: false,         // this run began as a shared descent: it keeps the five-floor lap even
                          // if the partner leaves (frozen at run start by resetRun). Deep floors,
                          // the saloon and THE UNKNOWN stay solo-only for the whole run.
  classicMode: false,     // CLASSIC descent: the run ends at THE EVENT HORIZON, as it did before
                          // the deep floors and THE UNKNOWN were added. Also kept across resetRun().
  classicLoop: false,     // CLASSIC rune rules with NO horizon ending — co-op's endless lap.
                          // Only classicMode decides the rules; this only suppresses the ending.
  chaosMode: false,       // CHAOS descent: the rune seal never closes and every cleared wave drops
                          // an orb. Set only by the mode chooser (unlocked by felling THE UNKNOWN),
                          // never alongside hardMode; its records keep to Meta.bestsChaos.
  challenge: null,        // CHAOS modifier id (src/data/challenges.js) — null on a standard chaos run.
                          // Kept across resetRun(), like the mode flags; chosen with the descent.
  coopVictory: false,     // co-op CLASSIC: THE EVENT HORIZON fell and the shared descent is complete.
                          // Only read by the death screen (it changes the title), never by the sim.
};
