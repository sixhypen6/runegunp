/* =========================================================
   RUNEGUN · THE GAUNTLET — BOSS RUSH
   Nine seats at the altar: the eight wardens in floor order, then
   THE UNKNOWN. No waves, no chests, no gates — only the fight, one
   after another. Spend 5 tithe points on runes at THE TITHE; each
   warden who falls pays 2 more. What was carved at an altar is
   locked the moment the fight begins; the altar sells, it never
   buys back. Solo only — a gauntlet is one body's reckoning.
   ========================================================= */
"use strict";

const BOSS_RUSH_FIGHTS = [
  { kind: 0, name: "THE CHAINED WARDEN", arena: 0 },
  { kind: 1, name: "THE MARROW KING", arena: 1 },
  { kind: 2, name: "THE FORGE TYRANT", arena: 2 },
  { kind: 3, name: "THE DROWNED MONARCH", arena: 3 },
  { kind: 4, name: "THE EVENT HORIZON", arena: 4 },
  { kind: 5, name: "THE HOURGLASS SAINT", arena: 5 },
  { kind: 6, name: "THE THOUSANDFOLD", arena: 6 },
  { kind: 7, name: "THE OTHER GUNSLINGERS", arena: 7 },
  { kind: 8, name: "THE UNKNOWN", arena: -1 },
];
const BOSS_RUSH_TITHE_START = 5;
const BOSS_RUSH_TITHE_PER_BOSS = 2;

/* the altar's flat price list — every warden pays the same, the SHREDDER's
   bargain hunter and the juggernaut's discount do not apply here */
function gauntletFlatCost(id, nextStack) {
  let c = PVP_RUNE_COST[id];
  if (c == null) c = 2;
  if (id === "reprieve") c = (nextStack | 0) <= 1 ? PVP_REPRIEVE_FIRST : PVP_REPRIEVE_NEXT;
  return Math.max(1, c);
}
function gauntletSpent(p) {
  let total = 0;
  for (const id in p.runes) {
    const n = p.runes[id] | 0;
    for (let i = 1; i <= n; i++) total += gauntletFlatCost(id, i);
  }
  return total;
}
function bossRushPool() { return BOSS_RUSH_TITHE_START + BOSS_RUSH_TITHE_PER_BOSS * (Game.gauntletStep || 0); }

/* ---------- the gauntlet begins ---------- */
function startBossRush() {
  if (Game.devRun && typeof devEndRun === "function") devEndRun();
  if (typeof Net !== "undefined" && Net.active) {
    if (typeof Coop !== "undefined") Coop.running = false;
    Net.hangUp();
  }
  AudioFX.unlock();
  if (typeof Ads !== "undefined") Ads.preload();
  resetRun();                    // the bookkeeping; the floor it spawns is never seen — the altar is
  Game.bossRush = true;
  Game.gauntletStep = 0; Game.gauntletLocked = null;
  Game.gauntletWon = false; Game.gauntletTime = 0; Game.gauntletSouls = 0;
  updateHp(); updateScore(); updateRerolls();
  $("waveNum").textContent = "I";
  if (typeof openGauntletTithe === "function") openGauntletTithe();
  else setupGauntletArena(0);    // belt-and-braces: no altar, no interruption
}

/* the warden wakes — the gate was taken */
function gauntletWake(step) {
  const spec = BOSS_RUSH_FIGHTS[step];
  if (!spec || spec.kind === 8) return;   // THE UNKNOWN stages itself
  spawnBoss(spec.kind);                   // the arrival, the toast, the banner — all of it
}

/* one arena, one warden: tear down whatever resetRun or the last fight left,
   dress the floor for the next seat, and open the way in */
function setupGauntletArena(step) {
  const spec = BOSS_RUSH_FIGHTS[step];
  if (!spec) return;
  Game.gauntletStep = step;
  enemies = []; bullets = []; ebullets = []; puddles = [];
  particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
  warpPortals = []; warpSlashes = []; soulMotes = [];
  portal = null; rift = null; pets = [];
  Game.boss = null; Game.ambush = null; Game.shake = 0;
  Game.inRift = false; Game.riftCreature = null; Game.riftPicks = null;
  Game.bossRocks.length = 0;
  Game.chestsTotal = 0; Game.chestsOpened = 0;   // no chests in the gauntlet — no waves, no seals, no boxes
  if (spec.kind === 8) {
    Game.mapIdx = 4;                             // the void is the only sky the abyss knows
    enterUnknown();                              // the stage owns its own dressing — the warden walks in
    $("mapName").textContent = "THE GAUNTLET · IX OF IX — THE UNKNOWN";
    $("waveNum").textContent = "IX";
    return;
  }
  Game.mapIdx = spec.kind;
  genMap();                                      // the floor's own palette and stone — nothing else spawns
  for (const p of players) {
    p.x = MAP.w / 2 + p.idx * 44; p.y = MAP.h / 2 + 220;
    p.iframes = 1.5; p.dashT = 0; p.veilT = 0;
  }
  SEAL.state = "spent";                          // no seal: the fight begins with the ritual — the way opens, then the warden wakes
  for (const p of players) if (p.pet && PTYPES[p.pet]) pets.push(assignId(spawnPet(p.pet, p)));
  $("mapName").textContent = "THE GAUNTLET · " + ROMAN(step + 1) + " OF IX — " + FLOORS[spec.kind].name;
  $("waveNum").textContent = ROMAN(step + 1);
  /* the way in: the arena waits empty, the gate hangs open — step through it to wake the warden */
  portal = { x: MAP.w / 2, y: MAP.h / 2, r: 46, t: 0 };
  AudioFX.portal();
}

/* a warden falls. The gauntlet answers with souls, +50% vitality, and a seat
   at THE TITHE — or, if the ninth has fallen, with the end of the bracket */
function bossRushSlain(e, killer) {
  if (e) {
    recordSlain("boss:" + e.kind);
    /* THE GLASS star bestiary stays honest: a gauntlet clear is harder than a descent */
    if (Game.flawless && !Game.chaosMode) recordSlain("boss:" + e.kind, true);
  }
  Game.boss = null;
  $("bossBar").classList.remove("on");
  document.body.classList.remove("bossOn");
  haptic(80);
  if (typeof clearBossTerrain === "function") clearBossTerrain();
  for (const p of players) p.curses = {};
  if (typeof refreshCurseStrip === "function") refreshCurseStrip();
  const km = killer ? killer.mods : (localPlayer() && localPlayer().mods);
  if (e && e.kind >= 5 && typeof deepBossCleanup === "function") deepBossCleanup(e);
  const bounty = e ? ([400, 400, 400, 400, 1500, 600, 800, 2000, 3000][e.kind] || 400) : 400;
  const award = awardSouls(Math.round(bounty * SOUL_RATE * (1 + (km ? km.midas : 0))));
  if (Game.flawless) {
    const bonus = awardSouls(Math.round(bounty * SOUL_RATE * FLAWLESS_MUL * (1 + (km ? km.midas : 0))));
    Game.flawlessAward = bonus;
    Game.flawlessToast = 2.0;
    if (e) floatText(e.x, e.y - e.r - 66, "FLAWLESS +" + bonus, "#fff3c8", 24);
    AudioFX.waveUp();
  }
  Game.gauntletSouls = (Game.gauntletSouls || 0) + award;
  /* the arena exhales — the dead pose no threat, no score, no streak */
  for (const en of enemies) if (!en.boss && !en.dead) { recordSlain(en.type); en.hp = 0; en.dead = true; }
  ebullets.length = 0;
  for (let i = puddles.length - 1; i >= 0; i--) if (puddles[i].team === "e") puddles.splice(i, 1);
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].hostile) shockwaves.splice(i, 1);
  for (const rc of MAP.rocks) delete rc.meltAt;
  /* the fall, sung: rings rolling out in the warden's color, the horde
     shuddering apart, time dragging its heels — the way the descent bows
     before a warden falls. Only when it has played out does the altar ask. */
  if (e && typeof shockwaves !== "undefined") {
    for (let k = 0; k < 4; k++)
      shockwaves.push({ x: e.x, y: e.y, r: 10, max: 180 + k * 90, speed: 700, dmg: 0,
        hostile: false, color: e.color, hitSet: new Set(), delay: k * 0.12 });
    for (let k = 0; k < 30; k++)
      particles.push({ x: e.x, y: e.y, vx: rnd(-160, 160), vy: rnd(-330, -90),
        t: 0, life: rnd(0.6, 1.2), r: rnd(2, 5), color: "#ffd23d" });
  }
  if (e) {
    floatText(e.x, e.y - e.r - 40, "+" + award + " SOULS", "#ffd23d", 20);
    Game.slowmo = 0.9;
    Game.ceremonyT = 1.25;
  }
  Game.gauntletStep++;
  const cleared = Game.gauntletStep;   // matches BOSS_RUSH_FIGHTS index of the NEXT fight
  if (cleared >= BOSS_RUSH_FIGHTS.length) Game.gauntletWinPending = true;
  else Game.gauntletInterlude = true;
}

/* the ceremony has played out: half vitality back, then the altar rises */
function gauntletInterlude() {
  for (const p of players) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.5));
  updateHp();
  if (typeof openGauntletTithe === "function") openGauntletTithe();
  else {
    /* belt-and-braces: no altar, no interruption — move the bracket along */
    setupGauntletArena(Game.gauntletStep);
  }
}

/* the ninth warden falls — the bracket is complete */
function bossRushWin() {
  Game.gauntletWon = true;
  Game.gauntletTime = Math.floor(Game.time || 0);
  const mm = Math.floor(Game.gauntletTime / 60), ss = String(Game.gauntletTime % 60).padStart(2, "0");
  $("gauntletWinTitle").textContent = "THE GAUNTLET IS COMPLETE";
  $("gauntletWinMeta").textContent = "ALL NINE SEATS ARE TAKEN — THE ALTAR HAS NO MORE TO SELL";
  $("gauntletWinBody").innerHTML =
    '<div style="letter-spacing:.15em;color:var(--dim);line-height:2.1">'
    + 'TIME <span style="color:var(--bone)">' + mm + ":" + ss + '</span><br>'
    + 'SOULS BANKED THIS BRACKET <span style="color:var(--gold)">' + Math.round(Game.score || 0) + '</span><br>'
    + 'EVERY WARDEN <span style="color:var(--bone)">FALLEN</span>'
    + '</div>';
  $("gauntletWin").classList.add("on");
  if (typeof AudioFX !== "undefined" && AudioFX.bossRoar) AudioFX.bossRoar();
}
