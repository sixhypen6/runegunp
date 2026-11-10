/* =========================================================
   RUNEGUN · ONLINE VERSUS (test build)
   The smallest thing that works: a host turns a shared descent into a duel,
   each warden spends a pool of points on runes, and the last one standing wins.
   No menus — the `pvp` console command drives the whole mode.
   ========================================================= */
"use strict";

/* how many points every warden gets to carve a loadout */
const PVP_POINTS = 12;

/* base price of the first stack of each rune. REPRIEVE is special-cased below. */
const PVP_RUNE_COST = {
  /* 1 — small, self-contained */
  bulwark: 1, swift: 1, velocity: 1, frost: 1, pierce: 1, ward: 1, prickle: 1,
  /* 2 — the workhorses */
  rapid: 2, heavy: 2, ember: 2, ricochet: 2, seeker: 2, twin: 2, leech: 2,
  splinter: 2, phase: 2, mirror: 2, bramble: 2, mend: 2, dread: 2, bleed: 2,
  /* 3 — the build-definers */
  scatter: 3, venom: 3, titan: 3, nova: 3, storm: 3, reaper: 3, quarry: 3,
  puncture: 3, wrath: 3, aegis: 3, maelstrom: 3, stillpoint: 3, slime: 3,
  vampire: 3, reprieve: 3,
  /* 4 — the run-enders */
  exterminate: 4, runegun: 4,
};

/* per-warden price changes. `set` replaces a price outright; `mul` scales the
   base; `all` scales everything. */
const PVP_CHAR_COST = {
  /* the SHREDDER has no trigger — pellet runes are a tax, its blade runes are a bargain */
  shredder: {
    set: { heavy: 1, swift: 1, velocity: 1, venom: 2, bleed: 2, prickle: 1 },
    mul: { scatter: 2, rapid: 2, twin: 2, pierce: 2, ricochet: 2, seeker: 2, splinter: 2, frost: 2, ember: 2 },
  },
  /* no pack rises in versus, so the whole rite list is discounted */
  necromancer: { all: 0.75, set: { reprieve: 2 } },
  /* the rifle already finds seams: PIERCE is cheap, PUNCTURE is not */
  sniper: { set: { pierce: 1, puncture: 2 } },
};

/* the Reanimator's thralls do not rise in a duel — pay the loss back in points */
const PVP_CHAR_BONUS_POINTS = { necromancer: 4 };

/* the first REPRIEVE stack is worth more than every later one */
const PVP_REPRIEVE_FIRST = 3;
const PVP_REPRIEVE_NEXT = 2;

function pvpBasePoints(p) {
  return PVP_POINTS + (PVP_CHAR_BONUS_POINTS[p.char] || 0);
}

/* price of the `nextStack`-th stack (1-based) for this warden */
function pvpRuneCost(p, id, nextStack) {
  let c = PVP_RUNE_COST[id];
  if (c == null) c = 2;
  if (id === "reprieve") c = nextStack <= 1 ? PVP_REPRIEVE_FIRST : PVP_REPRIEVE_NEXT;
  const mod = PVP_CHAR_COST[p.char];
  if (mod) {
    if (mod.set && mod.set[id] != null) c = mod.set[id];
    const mul = (mod.mul && mod.mul[id] != null) ? mod.mul[id] : mod.all;
    if (mul != null) c = Math.round(c * mul);
  }
  return Math.max(1, c);
}

function pvpSpent(p) {
  let total = 0;
  for (const id in p.runes) {
    const n = p.runes[id] || 0;
    for (let i = 1; i <= n; i++) total += pvpRuneCost(p, id, i);
  }
  return total;
}

function pvpPointsLeft(p) {
  return pvpBasePoints(p) - pvpSpent(p);
}

/* returns how many stacks actually fit in the remaining points */
function pvpBuy(p, id, n) {
  if (!RUNES[id]) throw new Error("Unknown rune: " + id);
  if (Game.pvpMode) throw new Error("The match has begun — the loadout is sealed.");
  n = Math.max(1, Math.floor(n || 1));
  const before = p.runes[id] || 0;
  let bought = 0;
  for (let k = 0; k < n; k++) {
    const cost = pvpRuneCost(p, id, before + k + 1);
    if (pvpPointsLeft(p) < cost) break;
    p.runes[id] = (p.runes[id] || 0) + 1;
    bought++;
  }
  if (bought) recalc(p);
  return bought;
}

/* refunds the top stacks — the points return to the pool */
function pvpSell(p, id, n) {
  const held = p.runes[id] || 0;
  n = Math.min(held, Math.max(0, Math.floor(n || 1)));
  if (n) {
    p.runes[id] = held - n;
    if (!p.runes[id]) delete p.runes[id];
    recalc(p);
  }
  return n;
}

function pvpReset(p) {
  p.runes = {};
  p.lockedRunes = null;
  recalc(p);
}

/* the whole price list for one warden, cheapest first */
function pvpCostList(p) {
  return Object.keys(RUNES)
    .filter(id => !RUNES[id].hidden || p.runes[id])
    .map(id => ({ id, name: RUNES[id].name, cost: pvpRuneCost(p, id, (p.runes[id] || 0) + 1), held: p.runes[id] || 0 }))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

/* the host flips a shared descent into a duel: clear the horde, lift every
   warden, and set them on opposite sides of the arena. */
function pvpStart() {
  if (typeof Net !== "undefined" && Net.active && Net.role !== "host")
    throw new Error("Only the host starts a versus match.");
  if (!players || players.length < 2)
    throw new Error("A versus match needs at least two wardens.");
  Game.pvpMode = true;
  Game.pvpWinner = null;
  /* thralls and the horde have no place in a test duel */
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.hp = 0; e.dead = true;
    enemies.splice(i, 1);
  }
  Game.boss = null;
  ebullets.length = 0;
  const cy = MAP.h / 2;
  players.forEach((p, i) => {
    p.hp = p.maxHp; p.downed = false; p.gone = false;
    p.iframes = 1.2; p.dashT = 0; p.veilT = 0; p.autoFire = false;
    p.thrallMode = "ai"; p.thrallCursor = null;
    p.pvpNovaT = 0;
    const side = i % 2 === 0 ? -260 : 260;
    p.x = clamp(MAP.w / 2 + side, 60, MAP.w - 60);
    p.y = cy;
    p.vx = p.vy = 0;
  });
  Game.state = "play";
  toast("VERSUS — LAST WARDEN STANDING");
}

function pvpStop() {
  Game.pvpMode = false;
  Game.pvpWinner = null;
  toast("VERSUS OFF");
}

/* REPLACEMENT RITE — in versus the Reanimator has no pack, so Q becomes a
   close-range soul burst instead of a useless command toggle. */
function pvpNecroSurge(p) {
  if ((p.pvpNovaT || 0) > 0) return;
  p.pvpNovaT = 2.4;
  const dmg = 26 + (p.mods ? p.mods.dmg * 0.8 : 0);
  shockwaves.push({ x: p.x, y: p.y, r: 10, max: 210, speed: 620, dmg,
    hostile: false, color: "#8a86a0", hitSet: new Set(), owner: p });
  floatText(p.x, p.y - 30, "SOUL BURST", "#b9a8ff");
  AudioFX.nova();
}
