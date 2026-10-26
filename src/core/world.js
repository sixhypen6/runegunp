/* =========================================================
   RUNEGUN · World — map, collision, entity collections
   The arena map and grand seal, rock collision / line-of-sight / open-spot queries, boss-raised terrain and lava, and the live entity arrays.
   ========================================================= */
"use strict";


/* ---------- map ---------- */
const MAP = { w: 2600, h: 1800, rocks: [] };
const SEAL = { x: MAP.w / 2, y: MAP.h / 2, r: 64, state: "locked", pulse: 0 }; // locked | ready | spent
function genMap() {
  const F = floorDef();
  MAP.rocks = [];
  for (let i = 0; i < F.rocks; i++) {
    const w = rnd(60, 170), h = rnd(60, 170);
    const x = rnd(120, MAP.w - 120 - w), y = rnd(120, MAP.h - 120 - h);
    if (dist2(x + w / 2, y + h / 2, MAP.w / 2, MAP.h / 2) < 360 * 360) { i--; continue; }
    MAP.rocks.push(assignId({ x, y, w, h, tone: rnd(0, 1) }));
  }
  /* the Glass Choir: some of the stone is mirror — thinned to a pane, it reflects every shot */
  for (let i = 0; i < (F.mirrors || 0) && i < MAP.rocks.length; i++) {
    const rc = MAP.rocks[i];
    if (rc.w >= rc.h) { rc.y += (rc.h - 26) / 2; rc.h = 26; } else { rc.x += (rc.w - 26) / 2; rc.w = 26; }
    rc.mirror = true; rc.pitch = [523, 587, 659, 784, 880, 1046][i % 6];
  }
  SEAL.state = "locked"; SEAL.pulse = 0;
}
function circleRect(px, py, r, rc) {
  const cxp = clamp(px, rc.x, rc.x + rc.w), cyp = clamp(py, rc.y, rc.y + rc.h);
  return dist2(px, py, cxp, cyp) < r * r;
}
function collideWorld(e) {
  e.x = clamp(e.x, 30 + e.r, MAP.w - 30 - e.r);
  e.y = clamp(e.y, 30 + e.r, MAP.h - 30 - e.r);
  for (const rc of MAP.rocks) {
    if (!circleRect(e.x, e.y, e.r, rc)) continue;
    const cxp = clamp(e.x, rc.x, rc.x + rc.w), cyp = clamp(e.y, rc.y, rc.y + rc.h);
    let dx = e.x - cxp, dy = e.y - cyp;
    const d = Math.hypot(dx, dy) || 1;
    if (dx === 0 && dy === 0) { dx = 1; }
    e.x = cxp + dx / d * (e.r + 0.5);
    e.y = cyp + dy / d * (e.r + 0.5);
  }
}
function lineBlocked(x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, px = lerp(x1, x2, t), py = lerp(y1, y2, t);
    for (const rc of MAP.rocks) if (px > rc.x && px < rc.x + rc.w && py > rc.y && py < rc.y + rc.h) return true;
  }
  return false;
}
function openSpot(minDistFromPlayer = 320, avoidSeal = 0, minBoxSep = 0) {
  let fallback = null;                          // best point that cleared player/seal/rocks
  for (let t = 0; t < 80; t++) {
    const x = rnd(100, MAP.w - 100), y = rnd(100, MAP.h - 100);
    let ok = true;
    for (const p of players) if (dist2(x, y, p.x, p.y) <= minDistFromPlayer * minDistFromPlayer) { ok = false; break; }
    if (ok && avoidSeal && dist2(x, y, SEAL.x, SEAL.y) < avoidSeal * avoidSeal) ok = false;
    if (ok) for (const rc of MAP.rocks) if (circleRect(x, y, 40, rc)) { ok = false; break; }
    if (ok && !fallback) fallback = { x, y };   // valid spot, may still be crowded by boxes
    if (ok && minBoxSep) {
      const s2 = minBoxSep * minBoxSep;
      for (const b of chests)               if (dist2(x, y, b.x, b.y) < s2) { ok = false; break; }
      if (ok) for (const b of healthBoxes)  if (dist2(x, y, b.x, b.y) < s2) { ok = false; break; }
      if (ok) for (const b of pickups)      if (dist2(x, y, b.x, b.y) < s2) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return fallback || { x: MAP.w / 4, y: MAP.h / 4 };
}

/* ---- boss map mutation: terrain a boss raises mid-fight, cleaned on death ---- */
function raiseBossWall(x, y, w, h, tone) {
  // don't bury a warden
  for (const p of players) if (circleRect(p.x, p.y, p.r + 18, { x, y, w, h })) return null;
  const rc = assignId({ x, y, w, h, tone: tone == null ? rnd(0, 1) : tone, boss: true, bornAt: Game.time });
  MAP.rocks.push(rc); Game.bossRocks.push(rc);
  for (let k = 0; k < 8; k++)
    particles.push({ x: x + rnd(0, w), y: y + rnd(0, h), vx: rnd(-40, 40), vy: rnd(-130, -40), t: 0, life: rnd(0.3, 0.7), r: rnd(2, 5), color: floorDef().rockTop });
  return rc;
}
function clearBossTerrain() {
  if (!Game.bossRocks.length) return;
  const F = floorDef();
  for (const rc of Game.bossRocks) {
    const i = MAP.rocks.indexOf(rc);
    if (i !== -1) MAP.rocks.splice(i, 1);
    /* the raised stone comes apart with its master — debris, not a silent vanish */
    for (let k = 0; k < 10; k++)
      particles.push({ x: rc.x + rnd(0, rc.w), y: rc.y + rnd(0, rc.h),
        vx: rnd(-120, 120), vy: rnd(-40, 120), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 6),
        color: k % 2 ? F.rockTop : F.rockA });
  }
  Game.shake = Math.max(Game.shake, 10);
  Game.bossRocks.length = 0;
}
/* lava river: a line of overlapping lava pools that denies a lane across the arena */
function lavaRiver(x1, y1, x2, y2, life) {
  const steps = Math.max(3, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 46));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(x1, x2, t) + rnd(-10, 10), y = lerp(y1, y2, t) + rnd(-10, 10);
    puddles.push({ x, y, r: rnd(40, 58), t: 0, life: life + rnd(-0.4, 0.4), team: "e", dmg: 7, color: "#ff5e2e", tickMap: {}, lava: true });
    if (i % 2 === 0)
      particles.push({ x, y, vx: rnd(-30, 30), vy: rnd(-120, -40), t: 0, life: rnd(0.4, 0.9), r: rnd(3, 6), color: "#ff5e2e" });
  }
}
/* flood channel: the Drowned Monarch's water cousin — a lane of standing water
   that wades (slows) the player but never bites. life Infinity = until the boss falls */
function floodChannel(x1, y1, x2, y2, life) {
  const steps = Math.max(3, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 46));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(x1, x2, t) + rnd(-10, 10), y = lerp(y1, y2, t) + rnd(-10, 10);
    puddles.push({ x, y, r: rnd(46, 64), t: 0, life, team: "e", dmg: 0, color: "#2ea8b8", tickMap: {}, water: true });
    if (i % 2 === 0)
      particles.push({ x, y, vx: rnd(-30, 30), vy: rnd(-100, -30), t: 0, life: rnd(0.4, 0.8), r: rnd(2, 5), color: "#7de8e0" });
  }
}

/* ---- Hellforge meltdown: the Forge Tyrant's landing superheats the arena ----
   A heat wave rolls outward from where he stands; each rock it reaches glows
   and shudders for meltDur, then collapses into a standing lava pool. */
function igniteHellforge(b) {
  for (const rc of MAP.rocks) {
    if (rc.boss) continue;
    const d = Math.hypot(rc.x + rc.w / 2 - b.x, rc.y + rc.h / 2 - b.y);
    rc.meltAt = Game.time + 0.4 + d / 620 + rnd(0, 0.25);   // the wave travels ~620px/s
    rc.meltDur = rnd(0.75, 1.05);                            // white-hot shudder before it runs
  }
}
function tickForgeMelt(dt) {
  /* the Hellforge — or THE UNKNOWN's floor, when the Tyrant's echo lands there */
  if (Game.mapIdx !== 2 && !Game.inUnknown) return;
  for (let i = MAP.rocks.length - 1; i >= 0; i--) {
    const rc = MAP.rocks[i];
    if (rc.meltAt === undefined || Game.time < rc.meltAt) continue;
    const mx = rc.x + rc.w / 2, my = rc.y + rc.h / 2;
    if (Game.time < rc.meltAt + rc.meltDur) {
      /* still heating: embers stream off the glowing stone */
      if (Math.random() < 0.4)
        particles.push({ x: rc.x + rnd(0, rc.w), y: rc.y + rnd(0, rc.h),
          vx: rnd(-30, 30), vy: rnd(-160, -60), t: 0, life: rnd(0.3, 0.7), r: rnd(2, 4),
          color: Math.random() < 0.5 ? "#ff5e2e" : "#ffb43d" });
      continue;
    }
    /* it runs: the barrier collapses into lava with a burst of slag */
    MAP.rocks.splice(i, 1);
    puddles.push({ x: mx, y: my, r: Math.max(rc.w, rc.h) * 0.55, t: 0, life: Infinity,
      team: "e", dmg: 6, color: "#ff5e2e", tickMap: {}, lava: true });
    shockwaves.push({ x: mx, y: my, r: 8, max: Math.max(rc.w, rc.h) * 0.95, speed: 520,
      dmg: 0, hostile: false, hit: true, hitSet: new Set(), color: "#ff8a3d" });
    for (let k = 0; k < 18; k++) {
      const a = rnd(0, TAU), sp = rnd(60, 280);
      particles.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        t: 0, life: rnd(0.4, 0.9), r: rnd(2, 6), color: k % 3 ? "#ff5e2e" : "#ffd23d" });
    }
    Game.shake = Math.max(Game.shake, 8);
    AudioFX.meltBurst();
  }
}

/* ---------- entities ---------- */
/* `players` holds every warden in the run — solo is an array of one. `player`
   survives only as an alias to players[0] for the few shell/scene files that
   predate co-op; sim code addresses players through the helpers below. */
let players = [];
let player, enemies, bullets, ebullets, puddles, particles, chests, pickups, shockwaves, floaters, zaps, portal, veils, healthBoxes, rift, pets, mines, shells;
/* soul motes ride in SCREEN space (they fly to a DOM counter), so they live apart
   from `particles` and are drawn after draw() restores the world transform */
let soulMotes = [];

/* players still in the fight — downed bodies draw no aggro and hold no auras */
function alivePlayers() {
  const out = [];
  for (const p of players) if (p.hp > 0 && !p.downed) out.push(p);
  return out;
}
/* enemy/boss targeting: nearest living warden. Falls back to ANY player so an
   AI mid-attack never dereferences null while the both-down game-over lands. */
function nearestPlayer(x, y) {
  let best = null, bd = Infinity;
  for (const p of players) {
    if (p.hp <= 0 || p.downed) continue;
    const d = dist2(x, y, p.x, p.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best || players[0];
}
/* Enemy archetype AI can serve reanimated thralls without changing boss targeting. */
function combatTarget(entityOrX, y) {
  const e = typeof entityOrX === "number"
    ? enemies.find(target => target.team === "p" && target.x === entityOrX && target.y === y)
    : entityOrX;
  if (!e || e.team !== "p") return nearestPlayer(e ? e.x : entityOrX, e ? e.y : y);
  let best = null, bd = Infinity;
  for (const target of enemies) {
    if (target === e || target.dead || target.ghost || target.spawnT > 0 || target.team === "p") continue;
    const d = dist2(e.x, e.y, target.x, target.y);
    if (d < bd) { bd = d; best = target; }
  }
  return best || e.owner || nearestPlayer(e.x, e.y);
}
function hasHostileTarget(e) {
  return enemies.some(target => target !== e && !target.dead && !target.ghost && target.spawnT <= 0 && target.team !== "p");
}
/* the warden THIS client steers — camera, HUD and aim math follow only them */
function localPlayer() {
  return players[(typeof Net !== "undefined" && Net.localIdx) || 0] || players[0];
}
