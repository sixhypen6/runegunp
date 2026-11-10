/* =========================================================
   RUNEGUN · ONLINE VERSUS (test build)
   A host turns a shared descent into a duel: each warden switches warden,
   spends a pool of points on runes (ui/pvp-panel.js, the console `pvp`
   command still works), and the last one standing wins.
   ========================================================= */
"use strict";

/* how many points every warden gets to carve a loadout */
const PVP_POINTS = 18;

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
  /* THE WRAITH has no gun: its veil answers to RAPID (cooldown), HEAVY/TITAN
     (circle size + damage) and the elements. Those are cut; the pure bullet
     runes only answer through a veil kill, so they cost more. */
  wraith: {
    set: { rapid: 1, swift: 1, phase: 1, frost: 1, velocity: 1, ember: 2, titan: 2, aegis: 2 },
    mul: { pierce: 2, ricochet: 2, seeker: 2, twin: 2, splinter: 2, scatter: 2 },
  },
  /* the pack is only four bodies in versus — the rites that keep it (and its
     master) alive are cheap, the deep bullet tree is not */
  necromancer: { set: { reprieve: 2, vampire: 2, mend: 1, leech: 1 } },
  /* the rifle already finds seams: PIERCE is cheap, PUNCTURE is not */
  sniper: { set: { pierce: 1, puncture: 2, velocity: 1, quarry: 2 } },
  /* one slow, enormous slug: make the slug runes cheap and the spam/trickle runes dear */
  juggernaut: { set: { heavy: 1, titan: 2, velocity: 1, swift: 1, rapid: 3, twin: 3, scatter: 3 } },
  /* mortar + mines: area and element runes are the kit, single-target seams are not */
  demolitionist: { set: { scatter: 2, venom: 2, nova: 2, titan: 2, pierce: 3, ricochet: 3, seeker: 3 } },
  /* the flask-and-pool warden: VENOM / NOVA / STORM are its language */
  alchemist: { set: { venom: 2, nova: 2, storm: 2, frost: 2, scatter: 2, heavy: 3, titan: 3 } },
  /* steel + hardblood: bleed and the healing draws are cheap */
  sancho: { set: { bleed: 1, vampire: 2, leech: 1, rapid: 1 } },
};

/* the Reanimator now enters a duel WITH a pack (see pvpSeedNecroPack), so it
   no longer needs the old "no pack" compensation. Kept as the one place a
   future warden-specific bonus would live. */
const PVP_CHAR_BONUS_POINTS = {};

/* ready-made loadouts — each one is bought in order with whatever points fit.
   The names are the play-style, not a number, so the panel reads at a glance. */
const PVP_LOADOUTS = [
  { name: "ELEMENTAL / STATUS", desc: "QUARRY ×2 · BLEED ×2 · FROST ×2 · EMBER · VAMPIRE",
    runes: { quarry: 2, bleed: 2, frost: 2, ember: 1, vampire: 1 } },
  { name: "IMMORTALITY", desc: "MEND · REPRIEVE · AEGIS · BULWARK · WARD · LEECH",
    runes: { mend: 1, reprieve: 1, aegis: 1, bulwark: 1, ward: 1, leech: 1 } },
  { name: "GUNSLINGER", desc: "RAPID ×2 · PIERCE · RICOCHET · SEEKER · VELOCITY · TWIN",
    runes: { rapid: 2, pierce: 1, ricochet: 1, seeker: 1, velocity: 1, twin: 1 } },
  { name: "SIEGE / AREA", desc: "SCATTER · VENOM · NOVA · STORM · TITAN",
    runes: { scatter: 1, venom: 1, nova: 1, storm: 1, titan: 1 } },
  { name: "DUELIST", desc: "RAPID · HEAVY · AEGIS · REPRIEVE · BLEED",
    runes: { rapid: 1, heavy: 1, aegis: 1, reprieve: 1, bleed: 1 } },
];

/* the first REPRIEVE stack is worth more than every later one */
const PVP_REPRIEVE_FIRST = 3;
const PVP_REPRIEVE_NEXT = 2;

function pvpBasePoints(p) {
  return PVP_POINTS + (PVP_CHAR_BONUS_POINTS[p.char] || 0);
}

/* The stacks a warden is born with (Sancho's bleed/vampire, John's runegun,
   the Passenger's warp) are part of the character, not the point pool. */
function pvpFreeStacks(char) {
  const c = CHARS[char], out = {};
  if (c && Array.isArray(c.startLoadout))
    for (const id of c.startLoadout) out[id] = (out[id] || 0) + 1;
  return out;
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

/* the pooled price of one stack — innate starter stacks are free */
function pvpStackCost(p, id, nextStack) {
  const free = pvpFreeStacks(p.char)[id] || 0;
  return nextStack <= free ? 0 : pvpRuneCost(p, id, nextStack);
}

function pvpSpent(p) {
  let total = 0;
  for (const id in p.runes) {
    const n = p.runes[id] || 0;
    for (let i = 1; i <= n; i++) total += pvpStackCost(p, id, i);
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
    const cost = pvpStackCost(p, id, before + k + 1);
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
  /* clear back to the warden's native kit — those starter stacks are theirs */
  p.runes = {};
  const c = CHARS[p.char];
  if (c && Array.isArray(c.startLoadout)) {
    for (const id of c.startLoadout) p.runes[id] = (p.runes[id] || 0) + 1;
  }
  p.lockedRunes = null;
  recalc(p);
}

/* Buy a rune map in order, skipping anything the budget no longer covers. */
function pvpApplyRunes(p, runes) {
  if (Game.pvpMode) return 0;
  pvpReset(p);
  let stacks = 0;
  for (const id in runes) {
    if (!RUNES[id]) continue;
    stacks += pvpBuy(p, id, Math.max(1, runes[id] | 0));
  }
  return stacks;
}

/* A named loadout buys its list through the same path as a custom one. */
function pvpApplyLoadout(p, idx) {
  const loadout = PVP_LOADOUTS[idx];
  if (!loadout) return 0;
  return pvpApplyRunes(p, loadout.runes);
}

/* fill the budget with random affordable runes (the devtools RANDOM FOUR idea,
   spending the whole pool instead of a fixed count) */
function pvpRandomLoadout(p) {
  pvpReset(p);
  if (Game.pvpMode) return 0;
  const pool = Object.keys(RUNES).filter(id => !RUNES[id].hidden);
  let picks = 0;
  for (let guard = 0; guard < 90 && picks < 8; guard++) {
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (pvpPointsLeft(p) < pvpStackCost(p, id, (p.runes[id] || 0) + 1)) continue;
    if (pvpBuy(p, id, 1)) picks++;
  }
  return picks;
}

/* the whole price list for one warden, cheapest first */
function pvpCostList(p) {
  return Object.keys(RUNES)
    .filter(id => !RUNES[id].hidden || p.runes[id])
    .map(id => ({ id, name: RUNES[id].name, cost: pvpStackCost(p, id, (p.runes[id] || 0) + 1), held: p.runes[id] || 0 }))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

/* The Reanimator enters a duel with a small pack: four random bodies, all
   empowered (double vitality + one elemental brand), ringed around their
   master. The host spawns them, so `enew` carries team/owner/summoned/inherit
   and the buff flag rides every snapshot to the guest. */
const PVP_NECRO_THRALLS = 4;
const PVP_NECRO_TYPES = ["chaser", "gunner", "dasher", "slammer", "spitter", "wisp", "cinder", "angler"];
function pvpSeedNecroPack(p) {
  if (!p || p.char !== "necromancer") return 0;
  let n = 0;
  for (let i = 0; i < PVP_NECRO_THRALLS; i++) {
    const a = (i / PVP_NECRO_THRALLS) * TAU + rnd(-0.25, 0.25);
    const rr = 64 + rnd(0, 26);
    const x = clamp(p.x + Math.cos(a) * rr, 60, MAP.w - 60);
    const y = clamp(p.y + Math.sin(a) * rr, 60, MAP.h - 60);
    const t = spawnEnemy(pick(PVP_NECRO_TYPES), x, y);
    t.team = "p"; t.owner = p; t.summoned = true; t.inherit = true;
    t.spawnT = 0.35; t.alerted = true;
    /* exactly one buff, however the spawner rolled */
    const baseHp = t.maxHp / (t.buffed ? 2 : 1);
    t.buffed = true;
    t.hp = t.maxHp = Math.max(1, Math.round(baseHp * 2));
    const roll = Math.random();
    if (roll < 0.34) t.wrath = true;
    else if (roll < 0.67) t.rime = true;
    else t.sear = true;
    t.color = "rgba(138,134,160,0.72)";
    enemies.push(t);
    n++;
  }
  return n;
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
  /* the horde has no place in a test duel */
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
  /* the Reanimator's four buffed thralls rise once both wardens are placed */
  if (reanimatorAuthority()) for (const p of players) pvpSeedNecroPack(p);
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
