/* =========================================================
   RUNEGUN · Combat
   Targeting, firing the gun and the Wraith's veil burst, applying damage / elements / on-kill effects, the shield, getting hurt, and floor transitions.
   ========================================================= */
"use strict";

/* global multiplier on souls (score) gained per kill — tune to pace unlocks */
const SOUL_RATE = 0.25;
/* FLAWLESS: extra souls when a warden falls with the whole run still damageless —
   bonus = bounty × SOUL_RATE × this (midas applies on top, same as the bounty) */
const FLAWLESS_MUL = 1;

/* =========================================================
   COMBAT
   ========================================================= */
/* auto-aim target: nearest live enemy, preferring ones with clear line of sight */
function nearestEnemy(x, y) {
  let open = null, openD = Infinity, blocked = null, blockedD = Infinity;
  for (const e of enemies) {
    /* `untargetable`: still solid to a bullet, but the auto-aim looks away (THE REFLECTION) */
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p" || e.untargetable) continue;
    const d = dist2(x, y, e.x, e.y);
    if (lineBlocked(x, y, e.x, e.y)) {
      if (d < blockedD) { blockedD = d; blocked = e; }
    } else if (d < openD) { openD = d; open = e; }
  }
  return open || blocked;
}

/* claw/body contact vs EVERY living warden — an enemy chasing one player still
   mauls the other if they stand in its path. Solo this is the old single check. */
function contactHurt(e, pad, dmg) {
  if (e.team === "p") {
    if ((e.friendlyHitAt || 0) > Game.time) return;
    for (const target of enemies) {
      if (target === e || target.dead || target.ghost || target.spawnT > 0 || target.team === "p") continue;
      if (dist2(e.x, e.y, target.x, target.y) < (e.r + target.r + pad) ** 2) {
        e.friendlyHitAt = Game.time + 0.55;
        damageEnemy(target, dmg, { owner: e.owner, x: e.x, y: e.y, knock: 18 });
        break;
      }
    }
    return;
  }
  for (const p of players) {
    if (p.hp <= 0 || p.downed) continue;
    if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r + pad) ** 2) hurtPlayer(p, dmg, e);
  }
  for (const ally of enemies) {
    if (ally.team !== "p" || ally.dead || ally.ghost || ally.spawnT > 0 || (ally.friendlyHitAt || 0) > Game.time) continue;
    if (dist2(e.x, e.y, ally.x, ally.y) < (e.r + ally.r + pad) ** 2) {
      ally.friendlyHitAt = Game.time + 0.55;
      damageEnemy(ally, dmg, { x: e.x, y: e.y });
    }
  }
}

/* Spawn one full weapon shot (mirror copies, scatter fan, twin parallels) from (x, y)
   with warden `p`'s mods. Shared by the gun and by VEIL BURST corpse-discharges. */
function spawnShot(p, x, y, baseAim, skip) {
  const m = p.mods;
  /* the shredder's debris must live long enough to cross its saw's reach even
     when HEAVY / TITAN have slowed the shards to a crawl */
  const shredLife = p.char === "shredder" ? Math.max(1.5, (m.sawReach || 76) * 1.8 / Math.max(120, m.speed)) : 1.5;
  const dirs = [baseAim];
  for (let i = 0; i < m.mirror; i++) dirs.push(baseAim + Math.PI + rnd(-0.06, 0.06));
  for (let d = 0; d < dirs.length; d++) {
    const baseA = dirs[d];
    /* MIRROR's rear copies share the stack curve's damage once they pile up past the full stacks */
    const dmg = d ? m.dmg * m.mirrorDmg : m.dmg;
    const shots = [];
    for (let i = 0; i < m.count; i++) {
      const off = m.count > 1 ? (i / (m.count - 1) - 0.5) * m.spread * 2 : 0;
      shots.push(baseA + off + rnd(-m.spread, m.spread) * 0.5);
    }
    for (const a of shots) {
      const mk = (ox, oy) => bullets.push({
        x: x + Math.cos(a) * 18 + ox, y: y + Math.sin(a) * 18 + oy,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        r: p.char === "shredder" ? 5 + m.size * 0.35 : m.size, dmg, t: 0, life: shredLife,
        pierce: m.pierce, bounce: m.bounce, homing: m.homing,
        venom: m.venom, ember: m.ember, frost: m.frost, storm: m.storm,
        execute: m.execute, knock: m.knock,
        crit: m.crit, critMul: m.critMul, fear: m.fear, fearDur: m.fearDur,
        owner: p,
        /* allocated lazily on first hit (update.js): at RAPID+TWIN fire rates this
           spawn path runs 100+ times/sec, and most bullets die on a wall having
           never needed the Set. `skip` bullets need theirs immediately — pre-seeded. */
        hitSet: skip ? new Set([skip]) : null,
      });
      mk(0, 0);
      for (let i = 0; i < m.twin; i++) {
        const side = (i % 2 === 0) ? 1 : -1;
        const dd = 10 * (Math.floor(i / 2) + 1);
        mk(Math.cos(a + Math.PI / 2) * dd * side, Math.sin(a + Math.PI / 2) * dd * side);
      }
    }
  }
  if (bullets.length > 450) bullets.splice(0, bullets.length - 450); // perf guard on extreme stacks
}

function fireWeapon(p, inp, dt) {
  const m = p.mods;
  p.fireT -= dt;
  let firing = false, aim = p.aim;
  if (inp.touchMode) {
    if (inp.aimMode === "auto") {
      // aim is set each frame in updatePlayer(); just fire while a target exists
      if (p.autoFire) firing = true;
    } else if (inp.aiming) {
      aim = Math.atan2(inp.aimY, inp.aimX); p.aim = aim; firing = true;
    }
  } else if (inp.deskMode === "auto") {
    if (p.autoFire) firing = true;
  } else if (inp.deskMode === "cursor") {
    firing = true;
  } else if (inp.mouseDown) firing = true;
  /* THE SINGULAR: guns stay holstered. Auto-fire just stays quiet; a deliberate
     trigger pull (mouse button / manual aim stick) earns a word from the bar. */
  if (Game.inSaloon) { if (inp.mouseDown || (inp.touchMode && inp.aiming)) saloonHolster(p); return; }
  if (!firing || p.fireT > 0) return;
  const jamMul = curseActive(p, "jam") ? 0.5 : 1;
  /* The Shredder's trigger throws rune-etched debris off the saw's rim at whatever
     the blade is grinding. It used to spawn ON the victim and fly along your aim
     with that victim skipped — which read as the enemy firing somewhere random,
     and meant no bullet rune ever touched the horror in front of you. */
  if (p.char === "shredder") {
    const target = p.sawHitTarget;
    if (!target || target.dead || target.team === "p") return;
    p.fireT = 1 / (m.rate * jamMul);
    const aimAt = angTo(p.x, p.y, target.x, target.y);
    /* start the debris a little inside the blade: spawnShot pushes it 18px out,
       and a horror pressed against you must still be in front of the shards */
    spawnShot(p, p.x - Math.cos(aimAt) * 12, p.y - Math.sin(aimAt) * 12, aimAt);
    p.kickT = 0.07;
    Game.shake = Math.max(Game.shake, 1.5);
    AudioFX.shoot();
    /* flecks torn off the rim, thrown the way the debris goes */
    if (particles.length < 460) {
      const rim = (m.sawReach || 76) * 0.8;
      for (let k = 0; k < 3; k++) {
        const pa = aimAt + rnd(-0.45, 0.45);
        particles.push({ x: p.x + Math.cos(aimAt) * rim, y: p.y + Math.sin(aimAt) * rim,
          vx: Math.cos(pa) * rnd(80, 220), vy: Math.sin(pa) * rnd(80, 220),
          t: 0, life: rnd(0.12, 0.26), r: rnd(1.5, 3), color: pick(["#a99bd8", "#fff3c8", "#7a62bd"]) });
      }
    }
    return;
  }
  /* THE WRAITH does not pull a trigger — it tears the veil */
  if (p.char === "wraith") {
    p.veilCdBase = clamp(6.75 / (m.rate * jamMul), 0.5, 4.5); // base 1.5s · RAPID shortens · JAM lengthens
    p.fireT = p.veilCdBase;
    fireVeil(p);
    return;
  }
  /* THE DEMOLITIONIST works a stub mortar — a fat shell lobbed skyward
     that comes down slag-hulk fashion and SLAMS. The tube bucks hard. */
  if (p.char === "demolitionist") {
    p.fireT = 1 / (m.rate * jamMul);
    launchShell(p, inp, aim);
    p.kickT = 0.09;
    Game.shake = Math.max(Game.shake, 3);
    /* muzzle thump — a cough of ember off the tube's mouth */
    for (let k = 0; k < 4; k++) {
      const pa = aim + rnd(-0.5, 0.5);
      particles.push({ x: p.x + Math.cos(aim) * 22, y: p.y + Math.sin(aim) * 22,
        vx: Math.cos(pa) * rnd(60, 160), vy: Math.sin(pa) * rnd(60, 160) - 40,
        t: 0, life: rnd(0.15, 0.3), r: rnd(2, 3.5), color: pick(["#ff5e2e", "#8a5a3d"]) });
    }
    AudioFX.shoot();
    return;
  }
  p.fireT = 1 / (m.rate * jamMul);
  spawnShot(p, p.x, p.y, aim);
  p.kickT = 0.09;                       // sprite recoils opposite the shot
  Game.shake = Math.max(Game.shake, 2);
  AudioFX.shoot();
  for (let i = 0; i < 3; i++) particles.push({
    x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
    vx: Math.cos(aim + rnd(-0.5, 0.5)) * rnd(60, 180), vy: Math.sin(aim + rnd(-0.5, 0.5)) * rnd(60, 180),
    t: 0, life: 0.15, r: rnd(2, 4), color: "#ffd23d" });
}

/* =========================================================
   VENOM — one poison pool at a point.
   Shared by the bullet path (game/update.js) and the Shredder's blade so both
   speak the same numbers. A pool that mostly overlaps an existing one refreshes
   it instead of piling a new disc on top: a fast weapon can otherwise lay
   hundreds of alpha-blended circles and OOM-kill the WebView on low-RAM phones.
   ========================================================= */
function dropVenomPool(x, y, venom, owner) {
  if (!(venom > 0)) return;
  let near = null;
  for (const pu of puddles) {
    if (pu.team === "p" && !pu.lava && !pu.vortex && !pu.phase && !pu.slime &&
        dist2(x, y, pu.x, pu.y) < (pu.r * 0.5) ** 2) { near = pu; break; }
  }
  if (near) {
    near.t = Math.min(near.t, 0.3); near.life = 4;
    near.r = Math.max(near.r, 26 + 14 * venom);
    near.dmg = Math.max(near.dmg, 3 + 2 * venom);
    return;
  }
  if (puddles.length < 140)
    puddles.push({ x, y, r: 26 + 14 * venom, t: 0, life: 4,
      team: "p", dmg: 3 + 2 * venom, color: "#7dff5e", tickMap: {}, owner });
}

/* =========================================================
   VEIL BURST — the Wraith's auto-attack.
   It slips out of the world for a heartbeat and a hollow circle
   of un-reality snaps open around where it stood. Everything
   caught inside — monster or warden — is wounded, and the gun's
   elements (burn / chill / poison / storm) sink straight into them.
   Anything that DIES inside the circle discharges your full gun
   shot from its corpse, so the bullet runes still answer.
   ========================================================= */
const VEIL_DMG_MUL = 2.6;   // ring damage = weapon damage × this (HEAVY, VELOCITY etc. scale it)
function fireVeil(p) {
  const m = p.mods;
  const R = clamp(110 + m.size * 9, 90, 340);   // bigger bullets → wider circle (HEAVY / TITAN)
  const ringDmg = m.dmg * VEIL_DMG_MUL;
  p.veilT = 0.45;                          // gone between worlds: invisible & untouchable
  veils.push({ x: p.x, y: p.y, r: R, t: 0, life: 0.55 });
  /* mist rushing inward along the circle's rim */
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, TAU);
    particles.push({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R,
      vx: -Math.cos(a) * rnd(50, 160), vy: -Math.sin(a) * rnd(50, 160),
      t: 0, life: rnd(0.25, 0.5), r: rnd(2, 4), color: "#5ee6ff" });
  }
  const px = p.x, py = p.y;
  const slain = [];
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0) continue;
    if (dist2(e.x, e.y, px, py) > (R + e.r) ** 2) continue;
    damageEnemy(e, ringDmg, { x: px, y: py, knock: m.knock, owner: p });
    if (e.dead) { slain.push(e); continue; }
    /* survivors take the gun's elements directly */
    if (m.ember) { e.burnT = Math.max(e.burnT, 2 + m.ember); e.burnDps = Math.max(e.burnDps, 2 + 2 * m.ember); e.burnBy = p; }
    if (m.frost) { e.slowT = Math.max(e.slowT, 1 + 0.7 * m.frost); floatText(e.x, e.y - e.r - 12, "❄", "#5ee6ff"); }
    if (m.storm && !e.dead) chainStorm(e, m.storm, new Set([e]), p);
    if (m.venom && puddles.length < 140) puddles.push({ x: e.x, y: e.y, r: 20 + 10 * m.venom, t: 0, life: 3,
      team: "p", dmg: 3 + 2 * m.venom, color: "#7dff5e", tickMap: {}, owner: p });
  }
  /* every foe slain inside the circle discharges your full shot at its nearest kin */
  for (const e of slain) {
    let tgt = null, bd = Infinity;
    for (const o of enemies) {
      if (o === e || o.dead || o.ghost || o.spawnT > 0) continue;
      const d = dist2(e.x, e.y, o.x, o.y);
      if (d < bd) { bd = d; tgt = o; }
    }
    spawnShot(p, e.x, e.y, tgt ? angTo(e.x, e.y, tgt.x, tgt.y) : rnd(0, TAU), e);
  }
  Game.shake = Math.max(Game.shake, slain.length ? 6 : 4);
  AudioFX.dash();
  AudioFX.nova();
}

/* =========================================================
   MINES — the Demolitionist's trade.
   A dash sows them along the whole path. A mine waits until
   something steps on it, then splinters into flying shot: one
   shard always at the foot that woke it, the rest flung wild.
   The bare gun's single bullet makes 2 shards — SCATTER and
   friends widen the burst.
   ========================================================= */
const MINE_LIFE = 20;        // seconds a seeded mine waits before fizzling out
const MINE_STACK_R = 26;     // mines closer than this count as "the same spot"
const MINE_STACK_MAX = 5;    // per-spot cap — RAPID stacks refresh instead of piling deeper
const MINE_CAP = 60;         // global cap: the oldest seed dies quietly (perf guard)
function placeMine(p, x, y) {
  /* same spirit as the venom-pool guard: a pile of mines on one spot
     refreshes what's already there instead of stacking without bound */
  let piled = 0, oldest = null;
  for (const mn of mines) {
    if (dist2(x, y, mn.x, mn.y) < MINE_STACK_R ** 2) {
      piled++;
      if (!oldest || mn.t > oldest.t) oldest = mn;
    }
  }
  if (piled >= MINE_STACK_MAX) { oldest.t = 0; return; }
  if (mines.length >= MINE_CAP) mines.shift();
  mines.push({ x, y, r: 11, t: 0, life: MINE_LIFE, armT: 0.22, pulse: rnd(0, TAU), owner: p });
  for (let k = 0; k < 3; k++) particles.push({ x, y, vx: rnd(-50, 50), vy: rnd(-70, -20),
    t: 0, life: 0.2, r: rnd(1.5, 3), color: "#ff5e2e" });
}

function detonateMine(mn, trigger) {
  const p = mn.owner || localPlayer();
  const m = p.mods;
  const shards = Math.min(1 + m.count, 40);   // bare gun: 1 bullet → 2 shards; SCATTER etc. add more
  for (let i = 0; i < shards; i++) {
    /* the first shard always finds the foot that woke the mine; the rest fly wild —
       and skip the trigger, so a point-blank burst still sprays outward */
    const a = i === 0 && trigger ? angTo(mn.x, mn.y, trigger.x, trigger.y) : rnd(0, TAU);
    bullets.push({ x: mn.x, y: mn.y,
      vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
      r: m.size, dmg: m.dmg, t: 0, life: 1.2,
      pierce: m.pierce, bounce: m.bounce, homing: m.homing,
      venom: m.venom, ember: m.ember, frost: m.frost, storm: m.storm,
      execute: m.execute, knock: m.knock,
      crit: m.crit, critMul: m.critMul, fear: m.fear, fearDur: m.fearDur,
      owner: p,
      hitSet: i === 0 || !trigger ? new Set() : new Set([trigger]) });
  }
  if (bullets.length > 450) bullets.splice(0, bullets.length - 450); // perf guard on extreme stacks
  for (let k = 0; k < 10; k++) {
    const a = rnd(0, TAU), sp = rnd(90, 260);
    particles.push({ x: mn.x, y: mn.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, life: rnd(0.15, 0.35), r: rnd(2, 4), color: pick(["#ff5e2e", "#ffd23d"]) });
  }
  Game.shake = Math.max(Game.shake, 4);
  AudioFX.nova();
}

/* =========================================================
   MORTAR SHELLS — the Demolitionist's trigger-pull.
   A fat round lobbed a short arc, slag-hulk fashion: airborne it
   sails clean over rock yet still clips like a bullet whatever it
   crosses; on arrival it SLAMS — a crater ring, then the charge
   splinters into flying shot exactly like a tripped mine.
   Dashes still sow true mines along the path.
   ========================================================= */
const SHELL_RANGE = 180;   // the mortar throws no further — a short, committed lob
const SHELL_SLAM_R = 90;   // reach of the crater ring where the shell comes down
function launchShell(p, inp, aim) {
  const m = p.mods;
  /* the lob lands where you're pointing, capped short: auto-aim drops it on the
     target, cursor aim drops it at the cursor, a bare stick throws full range */
  let d = SHELL_RANGE;
  if (p.autoFire) {
    const tgt = nearestEnemy(p.x, p.y);
    if (tgt) d = Math.sqrt(dist2(p.x, p.y, tgt.x, tgt.y));
  } else if (!inp.touchMode && inp.mouseX !== undefined) {
    d = Math.hypot(inp.mouseX / ZOOM + Game.cam.x - p.x,
                   inp.mouseY / ZOOM + Game.cam.y - p.y);
  }
  d = clamp(d, 50, SHELL_RANGE);
  const lx = clamp(p.x + Math.cos(aim) * d, 40, MAP.w - 40);
  const ly = clamp(p.y + Math.sin(aim) * d, 40, MAP.h - 40);
  const T = clamp(Math.hypot(lx - p.x, ly - p.y) / 360, 0.26, 0.5);
  shells.push({ sx: p.x, sy: p.y, x: p.x, y: p.y, lx, ly,
    t: 0, T, r: m.size + 6, dmg: m.dmg, knock: m.knock, hitSet: new Set(), owner: p });
  /* the warning ring closes on the crater exactly when the shell arrives */
  shockwaves.push({ x: lx, y: ly, r: 4, max: SHELL_SLAM_R, speed: (SHELL_SLAM_R - 4) / T,
    dmg: 0, hostile: false, color: "#ff5e2e", hitSet: new Set() });
}

function shellSlam(sh) {
  const p = sh.owner || localPlayer();
  const m = p.mods;
  /* the crater: a friendly ring that washes over everything near the fall */
  shockwaves.push({ x: sh.x, y: sh.y, r: 10, max: SHELL_SLAM_R, speed: 420,
    dmg: m.dmg, hostile: false, hitSet: new Set(), owner: p });
  /* whatever stands nearest the crater eats the aimed shard, mine-fashion */
  let tgt = null, bd = SHELL_SLAM_R ** 2;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0) continue;
    const dd = dist2(sh.x, sh.y, e.x, e.y);
    if (dd < bd) { bd = dd; tgt = e; }
  }
  detonateMine({ x: sh.x, y: sh.y, owner: p }, tgt);
  Game.shake = Math.max(Game.shake, 8);
  AudioFX.slam();
}

function damageEnemy(e, dmg, src) {
  /* GUEST: cosmetic only — the host owns every point of damage */
  if (typeof Net !== "undefined" && Net.role === "guest") { e.hitFlash = Math.max(e.hitFlash || 0, 0.08); return; }
  if (e.dead || e.ghost || e.spawnT > 0) return;
  /* whose gun is speaking — bullets/waves/pools carry their warden as `owner` */
  const ow = src && src.owner;
  const om = ow ? ow.mods : null;
  /* the Marrow King's scattered soul wards him while a phylactery survives */
  if (e.boss && e.kind === 1 && e.shielded) {
    dmg *= 0.2;
    if (Math.random() < 0.12) floatText(e.x, e.y - e.r - 16, "WARDED — BREAK THE VESSELS", "#d8ffb0");
  }
  /* the deep floors: reflections crack one hit at a time; the posse covers its leader */
  dmg = deepDamage(e, dmg);
  /* QUARRY: the gun savors the afflicted — burning or chilled foes take more */
  if (om && om.prey > 1 && (e.burnT > 0 || e.slowT > 0)) dmg *= om.prey;
  /* WRATH: the closer you are to death, the harder you hit */
  if (om && om.wrath) dmg *= 1 + om.wrath * (1 - ow.hp / ow.maxHp);
  if (Dev.dmgMul !== 1 && ow) dmg *= Dev.dmgMul;    // TEST TOOLS: damage ×20 (systems/devtools.js)
  /* THE UNKNOWN: phase locks, its carapace, the retort and the knitting (entities/unknown.js) */
  if (e.boss && e.kind === UNK_KIND) { dmg = unknownDamage(e, dmg); if (dmg <= 0) return; }
  e.hp -= dmg;
  /* heavier blows flash longer (drawn full-white) and freeze the frame a hair */
  e.hitFlash = clamp(0.06 + (dmg / e.maxHp) * 0.5, 0.06, 0.22);
  if (dmg >= 40 && !e.boss) beatHitstop(0.02);   // recurring — inside the freeze budget (juice.js)
  /* empowered horrors plant their feet — knockback does nothing.
     (owner-only srcs carry no position — nothing to knock away from) */
  if (src && src.x !== undefined && !e.boss && !e.buffed) { const a = angTo(src.x, src.y, e.x, e.y); e.x += Math.cos(a) * (src.knock || 0) * 0.05; e.y += Math.sin(a) * (src.knock || 0) * 0.05; }
  const crit = !!(src && src.critHit);
  /* past FLOATER_SOFT live numbers the screen is an unreadable blizzard (a SPLINTER chain
     measured 545) — only crits still print; story text never goes through here */
  if (crit || floaters.length < FLOATER_SOFT)
    floatText(e.x + rnd(-8, 8), e.y - e.r, Math.round(dmg),
      crit ? "#ffd23d" : "#e8e2d0", crit ? 24 : (13 + Math.min(7, dmg * 0.12)) | 0);
  AudioFX.hit();
  /* REAPER: execute the weakened (wardens resist) */
  if (!e.boss && e.hp > 0 && om && om.execute > 0 && e.hp / e.maxHp < om.execute) {
    e.hp = 0;
    floatText(e.x, e.y - e.r - 14, "REAPED", "#c4c9d4");
  }
  if (e.hp <= 0) killEnemy(e, ow);
}

function chainStorm(fromE, stacks, alreadyHit, owner) {
  let jumps = 1 + Math.round(stacks), dmg = 5 + 4 * stacks, cur = fromE;   // tapered stacks run fractional
  while (jumps-- > 0) {
    let best = null, bd = 200 * 200;
    for (const e of enemies) {
      if (e === cur || e.dead || e.ghost || e.spawnT > 0 || alreadyHit.has(e)) continue;
      const d = dist2(cur.x, cur.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    zaps.push({ x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, t: 0 });
    alreadyHit.add(best);
    damageEnemy(best, dmg, owner ? { owner } : undefined);
    AudioFX.zap();
    cur = best;
  }
}

/* bestiary: remember the first time we ever put down a given horror.
   `flawless` writes the untouched-run twin ledger instead (bosses only) — the
   durable record the FLAWLESS Play Games achievements are asserted from.
   Only the first kill of each kind touches storage, so this is cheap. */
function recordSlain(key, flawless) {
  const book = flawless ? Meta.slainFlawless : Meta.slain;
  if (book[key]) return;
  book[key] = true;
  metaSave();
}

function killEnemy(e, killer) {
  if (typeof Net !== "undefined" && Net.role === "guest") return;   // host authority
  if (e.dead) return;
  e.dead = true;
  Game.kills++;
  if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("KILL", e.type + (e.boss ? " (BOSS)" : "") + " at wave " + Game.wave);
  /* on-kill runes read the SLAYER's build; an unowned death (map hazard) has none */
  const km = killer ? killer.mods : null;
  /* rapid-kill streak: kills landing inside the window escalate the punch.
     streakKillFX owns the whole ladder now (callout, motes, hitstop, shake, audio);
     with Meta.juice "off" it reproduces the original 0.05 hitstop + blip exactly. */
  Game.comboT = COMBO_WINDOW;
  Game.comboN++;
  streakKillFX(e, Game.comboN);
  if (!e.boss && e.team !== "p") recordSlain(e.type);
  const base = (ETYPES[e.type] ? ETYPES[e.type].score : e.score) * (e.ambush ? 2 : 1);
  /* THE PAYOUT RATE — the streak's one economy effect. Wardens keep their own bounty.
     The bonus is carried as a FRACTION rather than rounded per kill: a common horror is
     worth 2.5 souls, so a x1.14 rate would round straight back to the same integer and
     the meter would advertise a bonus it never paid. Accumulating instead makes the
     advertised rate honest, and leaves the un-streaked gain byte-identical to before. */
  const gainBase = Math.round(base * SOUL_RATE * (1 + (km ? km.midas : 0)));
  let gain = gainBase;
  const mul = e.boss ? 1 : streakMul(Game.comboN);
  if (mul > 1) {
    const bonus = gainBase * (mul - 1) + Game.soulFrac;
    const whole = Math.floor(bonus);
    Game.soulFrac = bonus - whole;
    gain += whole;
  }
  const paid = awardSouls(gain);
  if (paid > 0 && (e.boss || e.ambush || floaters.length < FLOATER_SOFT))
    floatText(e.x, e.y - 16, "+" + paid, "#ffd23d", e.boss || e.ambush ? 16 : 11);
  if (km && km.leech && !killer.downed) { killer.hp = Math.min(killer.maxHp, killer.hp + km.leech); updateHp(); }
  /* type-specific death throes (cinder's fire ring, the slaghulk breaking apart)
     fire BEFORE the ambush ledger, so anything the corpse spawns keeps the trap armed */
  const TD = ETYPES[e.type];
  if (TD && TD.onDeath) TD.onDeath(e);
  if (e.ambush && Game.ambush) {
    Game.ambush.remaining--;
    if (Game.ambush.remaining <= 0) openChest(Game.ambush.chest);
  }
  /* NOVA: corpse detonation */
  if (km && km.nova && !e.boss) {
    const n = km.nova;
    shockwaves.push({ x: e.x, y: e.y, r: 6, max: 60 + 28 * n, speed: 500, dmg: 6 + 3 * n, hostile: false, hitSet: new Set([e]), owner: killer });
    AudioFX.nova();
  }
  /* MAELSTROM: some kills tear a brief, gentle gravity well that gathers the crowd (no damage) */
  if (km && km.vortex && !e.boss && Math.random() < 0.25 + 0.1 * km.vortex) {
    const v = km.vortex;
    puddles.push({ x: e.x, y: e.y, r: 80 + 18 * v, t: 0, life: 0.7 + 0.15 * v,
      team: "p", dmg: 0, vortex: true, color: "#8a6bff", tickMap: {}, owner: killer });
  }
  /* SPLINTER: shrapnel burst */
  if (km && km.splinter && !e.boss) {
    const shards = 3 + Math.round(2 * km.splinter);   // tapered stacks run fractional
    for (let i = 0; i < shards; i++) {
      const a = rnd(0, TAU);
      bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
        r: 3, dmg: 6 + 2 * km.splinter, t: 0, life: 0.5,
        pierce: 0, bounce: 0, homing: 0, venom: 0, ember: 0, frost: 0, storm: 0,
        execute: 0, knock: 20, hitSet: new Set([e]), shard: true, owner: killer });
    }
  }
  /* the burst richens with the streak — and turns to gold as the tithe mounts */
  const st = e.boss || Meta.juice === "off" ? -1 : Game.streakTier;
  const pn = e.boss ? 50 : 14 + Math.max(0, st) * 2;
  const goldP = st >= 0 ? STREAK_TIERS[st].gold : 0;
  for (let i = 0; i < pn; i++) {
    /* the base 14 are never dropped; only the streak's extras yield to the cap */
    if (i >= 14 && particles.length > 520) break;
    particles.push({
      x: e.x, y: e.y, vx: rnd(-260, 260), vy: rnd(-260, 260),
      t: 0, life: rnd(0.3, 0.9), r: rnd(2, 6),
      color: Math.random() < goldP ? pick(STREAK_GOLD) : e.color });
  }
  Game.shake = Math.max(Game.shake, e.boss ? 16 : 4);
  /* a warden's death freezes in full; a horror's is a recurring beat, inside the budget (juice.js) */
  if (e.boss) Game.hitstop = Math.max(Game.hitstop, 0.2); else beatHitstop(0.03);
  AudioFX.kill();
  /* REANIMATOR: its ghost thralls pay their life back as a little healing.
     A thrall spent by the SOUL TITHE rite pays according to its multiplier and
     is tallied by the rite instead of printing its own line. */
  if (e.team === "p" && e.owner && e.owner.char === "necromancer") {
    const owner = e.owner;
    const heal = soulFeedHeal() * (e.sacrifice ? REANIMATOR.sacrificeHealMul : 1);
    owner.hp = Math.min(owner.maxHp, owner.hp + heal);
    if (owner === localPlayer()) updateHp();
    if (e.sacrifice) owner.sacrificeTally = (owner.sacrificeTally || 0) + heal;
    else floatText(owner.x, owner.y - 30, "+" + heal + " SOUL FEED", "#7dff5e", 11);
  }
  /* slain horrors sometimes rise as allied ghosts; summoned units cannot reanimate. */
  const reanimator = killer && killer.char === "necromancer";
  if (reanimator && reanimatorThrallCount(killer) < REANIMATOR_THRALL_CAP &&
      !e.boss && !e.summoned && e.team !== "p" && Math.random() < 0.4) {
    const thrall = spawnEnemy(e.type, e.x, e.y);
    thrall.team = "p"; thrall.owner = killer; thrall.summoned = true;
    thrall.inherit = true;
    thrall.spawnT = 0.25;
    thrall.hp = thrall.maxHp = Math.max(1, Math.floor(thrall.maxHp * 0.5));
    thrall.color = "rgba(138,134,160,0.72)";
    thrall.alerted = true;
    if (Math.random() < 0.15) {
      thrall.buffed = e.buffed; thrall.wrath = e.wrath; thrall.rime = e.rime; thrall.sear = e.sear;
    }
    enemies.push(thrall);
    floatText(e.x, e.y - 20, "THRALL RISEN", "#8a86a0", 12);
  }
  /* the wave's last horror falls — a breath of calm marks the lull
     (ambush kills end on the chest ceremony instead, not this beat) */
    if (!e.boss && !e.ambush && !Game.boss && !Game.ambush && !Game.inRift && players.length &&
      !enemies.some(x => !x.dead && !x.ambush && !x.boss && x.team !== "p")) {
    Game.hitstop = Math.max(Game.hitstop, 0.12);
    Game.shake = Math.max(Game.shake, 8);
    for (const p of players) {
      shockwaves.push({ x: p.x, y: p.y, r: 8, max: 200, speed: 400, dmg: 0,
        hostile: false, color: "#7dff5e", hitSet: new Set() });
      for (let k = 0; k < 10; k++) particles.push({ x: p.x + rnd(-26, 26), y: p.y + rnd(-20, 20),
        vx: rnd(-25, 25), vy: rnd(-90, -35), t: 0, life: rnd(0.5, 0.9), r: rnd(2, 4), color: "#9fe8b8" });
    }
    AudioFX.calm();
    /* CHAOS: the fallen wave leaves a rune orb where its last horror dropped */
    if (Game.chaosMode) spawnPickup(e.x, e.y);
  }
  if (e.boss) bossSlain(e, killer);
  /* stretch the digit roll on a streak so it lands as the last soul mote does */
  updateScore(300 + 40 * Math.max(0, Game.streakTier));
}

function bossSlain(e, killer) {
  /* an echo of a warden THE UNKNOWN sent back: no ceremony, the round goes on */
  if (e && e.echo) { unknownEchoFell(e); return; }
  if (e) {
    recordSlain("boss:" + e.kind);
    /* the warden fell with the run still unscarred — the same condition that pays
       the FLAWLESS bounty below. Written here (not at run end) so the record
       survives a crash, and read back by Leaderboard.syncAchievements(). */
    if (Game.flawless && !Game.chaosMode) recordSlain("boss:" + e.kind, true);   // a CHAOS arsenal earns no FLAWLESS achievement
  }
  Game.boss = null;
  $("bossBar").classList.remove("on");
  document.body.classList.remove("bossOn");
  haptic(80);
  clearBossTerrain();
  for (const p of players) p.curses = {};   // hexes lift when the curse-layer dies
  refreshCurseStrip();
  const km = killer ? killer.mods : (localPlayer() && localPlayer().mods);
  /* the hour, the glass and the posse return their runes and stop their clocks */
  if (e && e.kind >= 5) deepBossCleanup(e);
  const bounty = e ? ([400, 400, 400, 400, 1500, 600, 800, 2000, 3000][e.kind] || 400) : 400;
  const award = awardSouls(Math.round(bounty * SOUL_RATE * (1 + (km ? km.midas : 0))));
  /* FLAWLESS: not one hit taken since the run began — the fall pays extra.
     A single scratch anywhere in the run forfeits this for every stage after,
     so the flag stays true across floors only while the run stays untouched. */
  if (Game.flawless) {
    const bonus = awardSouls(Math.round(bounty * SOUL_RATE * FLAWLESS_MUL * (1 + (km ? km.midas : 0))));
    Game.flawlessAward = bonus;
    Game.flawlessToast = 2.0;
    if (e) floatText(e.x, e.y - e.r - 66, "FLAWLESS +" + bonus, "#fff3c8", 24);
    AudioFX.waveUp();
  }
  if (e && e.kind === 4) toast("THE VOID COLLAPSES — " + award + " SOULS SPILL FREE");
  /* the lifetime void records are kept for honest arsenals — CHAOS stays out of them */
  if (e && e.kind === 4 && !Game.chaosMode) {
    /* record the void kill: lifetime count, fastest clear, and the anchor for
       post-void survival — then let Phase 2 unlock the online achievement. */
    Meta.bests.voidKills++;
    Game.voidImproved = Object.assign(Game.voidImproved || {}, { voidKills: true });
    const clr = Math.floor(Game.time);
    if (Game.voidKillTime < 0) Game.voidKillTime = clr;
    if (!Meta.bests.fastestVoidClearSec || clr < Meta.bests.fastestVoidClearSec) {
      Meta.bests.fastestVoidClearSec = clr;
      Game.voidImproved.fastestVoidClearSec = true;
    }
    metaSave();
    /* NOTE: every Play Games achievement is unlocked at RUN END (Leaderboard.submitRun),
       not here — firing the native popup during the void-ending cinematic can crash. */
  }
  /* clear remaining hostiles + bullets — the floor exhales.
     count them for the bestiary too: the warden's fall takes them with it */
  for (const e of enemies) if (!e.boss && !e.dead) { recordSlain(e.type); e.hp = 0; e.dead = true; }
  ebullets.length = 0;
  /* the dead warden's hazards die with it — lingering lava / in-flight rings
     must not bite the player after the victory toast */
  for (let i = puddles.length - 1; i >= 0; i--) if (puddles[i].team === "e") puddles.splice(i, 1);
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].hostile) shockwaves.splice(i, 1);
  /* rocks still heating when the Tyrant fell keep their stone — the melt dies with him */
  for (const rc of MAP.rocks) delete rc.meltAt;
  if (e && e.kind === 4) Game.voidConquered = true;
  /* the FIRST time THE OTHER GUNSLINGERS fall — the bottom of the descent — the way
     out no longer opens here: the toll is paid as usual, then the rift from floor I
     tears open and THE UNKNOWN waits past it (hud.js spawnPortal). A solo rite:
     co-op never reaches floor VIII. */
  if (e && e.kind === 7 && !Game.starConquered) {
    Game.starConquered = true;
    if (!(typeof Net !== "undefined" && Net.active)) Game.unknownDue = true;
  }
  /* CLASSIC descent: THE EVENT HORIZON is the last warden, exactly as before the deep
     floors existed. Solo plays the ending cinematic; a shared descent ends together
     on the tally (Coop.finish tells the guest). */
  if (Game.classicMode && !Game.classicLoop && e && e.kind === 4) {
    if (typeof Net !== "undefined" && Net.active) { Coop.finish(); return; }
    if (typeof RunTimer !== "undefined") RunTimer.finish();
    startEnding();
    return;
  }
  /* THE UNKNOWN falls: its runes scatter, it speaks once more, and the run asks its
     question (unknownSlain → startEnding after the last line) */
  if (e && e.kind === UNK_KIND) { unknownSlain(e, award); return; }
  /* death ceremony: chained blasts ripple out in the warden's color, time drags,
     souls fountain from the corpse — then the toll is offered (update() opens the
     choice overlay when Game.ceremonyT runs out) */
  if (e) {
    for (let k = 0; k < 4; k++)
      shockwaves.push({ x: e.x, y: e.y, r: 10, max: 180 + k * 90, speed: 700, dmg: 0,
        hostile: false, color: e.color, hitSet: new Set(), delay: k * 0.12 });
    for (let k = 0; k < 30; k++)
      particles.push({ x: e.x, y: e.y, vx: rnd(-160, 160), vy: rnd(-330, -90),
        t: 0, life: rnd(0.6, 1.2), r: rnd(2, 5), color: "#ffd23d" });
    floatText(e.x, e.y - e.r - 40, "+" + award + " SOULS", "#ffd23d", 20);
    Game.slowmo = 0.9;
    Game.ceremonyT = 1.25;
  } else setState("choice");
  $("bcTitle").textContent = floorDef().boss + (e && e.kind === 7 ? " FALL" : " FALLS");
  $("bcHealDesc").textContent = "Restore " + Math.round(localPlayer().maxHp / 2) + " vitality (half your maximum).";
}

function openChest(chest) {
  chest.state = "open";
  Game.ambush = null;
  Game.chestsOpened++;
  updateSeals();
  spawnPickup(chest.x, chest.y - 30);
  for (let i = 0; i < 20; i++) particles.push({
    x: chest.x, y: chest.y, vx: rnd(-260, 260), vy: rnd(-320, -40),
    t: 0, life: rnd(0.4, 0.9), r: rnd(2, 5), color: "#ffd23d" });
  /* ceremony: a gold ring, rays of escaping light, a thump you can feel */
  shockwaves.push({ x: chest.x, y: chest.y, r: 6, max: 170, speed: 520, dmg: 0,
    hostile: false, color: "#ffd23d", hitSet: new Set() });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    particles.push({ x: chest.x, y: chest.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
      t: 0, life: 0.7, r: 2, color: "#fff3c8" });
  }
  Game.shake = Math.max(Game.shake, 6);
  AudioFX.chest();
  if (Game.chestsOpened >= Game.chestsTotal) {
    SEAL.state = "ready";
    toast("EVERY SEAL IS BROKEN — THE GRAND SEAL STIRS");
    /* the last seal escalates: the grand seal itself answers */
    shockwaves.push({ x: SEAL.x, y: SEAL.y, r: 10, max: 260, speed: 480, dmg: 0,
      hostile: false, color: "#ff4d5e", hitSet: new Set() });
    floatText(SEAL.x, SEAL.y - SEAL.r - 24, "THE GRAND SEAL STIRS", "#ff4d5e", 16);
    AudioFX.waveUp();
  } else {
    toast("THE SEAL YIELDS A RUNE");
  }
  AudioFX.pickup();
}

function openHealthBox(hbox, p) {
  hbox.state = "open";
  p = p || localPlayer();
  const heal = 25;
  p.hp = Math.min(p.maxHp, p.hp + heal);
  updateHp();
  /* green bloom of crosses + motes around the warden — they mended, not bled */
  healFlare(p.x, p.y);
  floatText(p.x, p.y - 34, "+" + heal + " VITALITY", "#7dff5e", 16);
  if (p === localPlayer()) toast("THE BOX OPENS — +" + heal + " VITALITY");
  updateSeals();                      // the HUD's VITALS tally drops by one
  AudioFX.pickup();
}

function shieldBurst(p) {
  p.shield--;
  p.shieldT = 0;                       // restart the recharge timer
  p.iframes = 0.9;
  haptic(30);
  Game.shake = Math.max(Game.shake, 12);
  if (p === localPlayer()) screenFlash(0.1);
  shockwaves.push({ x: p.x, y: p.y, r: 8, max: p.mods.shieldR,
    speed: 720, dmg: p.mods.shieldDmg, hostile: false, hitSet: new Set(), owner: p });
  for (let i = 0; i < 26; i++) particles.push({
    x: p.x, y: p.y, vx: rnd(-360, 360), vy: rnd(-360, 360),
    t: 0, life: rnd(0.3, 0.7), r: rnd(2, 5), color: "#e0a86b" });
  floatText(p.x, p.y - 28, "SHIELD BURST", "#e0a86b");
  AudioFX.nova();
  updateHp();
}

function hurtPlayer(p, dmg, src) {
  if (typeof Net !== "undefined" && Net.role === "guest") return;   // hp arrives via snapshots
  if (p.iframes > 0 || p.dashT > 0 || p.veilT > 0 || p.downed || Game.state !== "play") return;
  if (Dev.god) return;                                 // TEST TOOLS: god mode (systems/devtools.js)
  if (p.shield > 0) { shieldBurst(p); return; }   // shield soaks the hit, then detonates
  /* WRATHFUL horrors — and everything they hurl — strike half again as hard */
  if (src && src.wrath) dmg *= WRATH_DMG_MUL;
  /* PARTY SCALING: a larger party faces harder blows (data/floors.js) */
  dmg *= partyDmgMul();
  /* AEGIS: wards bleed the force from the blow before it lands */
  if (p.mods.dr) dmg *= 1 - p.mods.dr;
  /* ONE HIT: any blow that lands is the last. BULWARK is checked above (the shield
     eats the hit outright) and REPRIEVE below (a lethal blow is refused), exactly
     as the challenge promises — only the warden's own wards may answer. */
  if (Game.challenge === "onehit" && dmg > 0) dmg *= 1000000;
  p.hp -= dmg;
  Game.flawless = false;                               // the run is scarred — no FLAWLESS bounty from here on
  /* REPRIEVE: a lethal blow is refused. The hour holds its breath — the horde
     freezes mid-step, the wound closes, and a brief ward keeps the next hit from
     following you home. One save per cooldown. */
  if (p.hp <= 0 && p.mods.reprieveStacks > 0 && (p.reprieveCd || 0) <= 0) {
    const n = p.mods.reprieveStacks;
    const freeze = reprieveFreezeSecs(n);
    p.hp = Math.max(1, Math.round(p.maxHp * reprieveHealFrac(n)));
    p.reprieveCd = reprieveCooldown(n);
    p.reprieveFreezeT = freeze;
    p.iframes = Math.max(p.iframes, reprieveInvulSecs(n));
    p.regenT = 0;                                      // the save is a wound, not a lull
    /* the horde stops outright; a warden only wades slower, and its next attack
       is pushed back by the same breath */
    for (const e of enemies) {
      if (e.dead) continue;
      if (!e.boss) continue;
      e.slowT = Math.max(e.slowT || 0, freeze);
      if (e.at !== undefined) e.at += freeze;
    }
    shockwaves.push({ x: p.x, y: p.y, r: 8, max: 240, speed: 520, dmg: 0,
      hostile: false, color: "#bcd0ff", hitSet: new Set() });
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU;
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * rnd(120, 280), vy: Math.sin(a) * rnd(120, 280),
        t: 0, life: rnd(0.35, 0.7), r: rnd(2, 4), color: pick(["#bcd0ff", "#e8f0ff", "#7ad7ff"]) });
    }
    if (p === localPlayer()) { screenFlash(0.3, "188,208,255"); haptic(80); }
    Game.shake = Math.max(Game.shake, 12);
    const saveName = (runeDefFor(p, "reprieve") || RUNES.reprieve).name;
    floatText(p.x, p.y - 30, saveName, "#bcd0ff", 20);
    toast(p === localPlayer() ? saveName + " — THE HOUR HOLDS ITS BREATH" : "YOUR PARTNER IS SAVED");
    AudioFX.chest();
    updateHp();
    return;
  }
  p.iframes = 0.9;
  p.regenT = 0;                                        // MEND: a hit stalls the mending
  /* RIMEBOUND horrors — and their bolts — leave the chill in your legs (WEIGHT hex) */
  if (src && src.rime) {
    applyCurse(p, "weight", RIME_SLOW_T, false);
    floatText(p.x, p.y - 24, "❄ CHILLED", "#5ee6ff");
  }
  /* SEARING horrors may leave embers clinging — the BRAND takes hold */
  if (src && src.sear && Math.random() < SEAR_CHANCE) {
    applyCurse(p, "brand", SEAR_BURN_T, false);
    floatText(p.x, p.y - 24, "IGNITED", "#ff8a3d");
  }
  /* BRAMBLE: the wards lash back at whatever struck you */
  if (p.mods.thorns) {
    shockwaves.push({ x: p.x, y: p.y, r: 8, max: 70 + 26 * p.mods.thorns,
      speed: 700, dmg: 12 + 9 * p.mods.thorns, hostile: false, hitSet: new Set(), owner: p });
    floatText(p.x, p.y - 24, "BRAMBLE", "#ff6b8a");
  }
  if (p === localPlayer()) screenFlash(0.25);
  Game.shake = Math.max(Game.shake, 8);
  if (src && src.x !== undefined) { const a = angTo(src.x, src.y, p.x, p.y); p.x += Math.cos(a) * 14; p.y += Math.sin(a) * 14; }
  if (p === localPlayer()) {
    const bar = document.querySelector(".hp-bar");
    if (bar) { bar.classList.remove("hurt"); void bar.offsetWidth; bar.classList.add("hurt"); }
    haptic(40);
  }
  AudioFX.hurt();
  if (p.hp <= 0) { p.hp = 0; downPlayer(p); }
  updateHp();
}

/* =========================================================
   DOWNED / REVIVE — a fallen warden with a living partner
   crawls, silent and untargeted, until hands reach them.
   Both down (or solo down) → the run truly ends.
   ========================================================= */
const REVIVE_RANGE = 60;     // px a rescuer must close to
const REVIVE_TIME = 3;       // seconds of contact to lift them
const REVIVE_HP_FRAC = 0.4;  // vitality restored on the lift
/* PARTY SCALING (data/floors.js): a bigger party lifts slower and lower, so
   four wardens cannot simply cycle revives forever. A leaver lightens both. */
function reviveTimeFor()   { return REVIVE_TIME + PARTY.reviveTime * partyExtra(); }
function reviveHpFracFor() { return Math.max(0.15, REVIVE_HP_FRAC - PARTY.reviveHp * partyExtra()); }
function downPlayer(p) {
  p.hp = 0;
  const partnerUp = players.some(o => o !== p && o.hp > 0 && !o.downed && !o.gone);
  if (!partnerUp) { gameOver(); return; }
  p.downed = true; p.reviveT = 0;
  p.dashT = 0; p.veilT = 0; p.autoFire = false;
  floatText(p.x, p.y - 26, "DOWN", "#ff4d5e", 20);
  toast(p === localPlayer() ? "YOU ARE DOWN — A WARDEN CAN LIFT YOU"
                            : "A WARDEN IS DOWN — REACH THEM");
  screenFlash(0.2);
  Game.shake = Math.max(Game.shake, 10);
  AudioFX.hurt();
  updateHp();
}
function revivePartner(p) {
  p.downed = false;
  p.hp = Math.max(1, Math.round(p.maxHp * reviveHpFracFor()));
  p.iframes = 2; p.reviveT = 0;
  /* the lift shoves the crowd back — same breath the paid revive grants */
  shockwaves.push({ x: p.x, y: p.y, r: 8, max: 220, speed: 520, dmg: 0,
    hostile: false, color: "#7dff5e", hitSet: new Set() });
  for (const e of enemies) {
    if (e.boss || e.dead) continue;
    const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
    if (d < 260) { const a = angTo(p.x, p.y, e.x, e.y); const push = 260 - d;
      e.x += Math.cos(a) * push; e.y += Math.sin(a) * push; }
  }
  healFlare(p.x, p.y);
  floatText(p.x, p.y - 30, "RISEN", "#7dff5e", 18);
  toast(p === localPlayer() ? "YOU RISE — FIGHT ON" : "YOUR PARTNER RISES");
  AudioFX.pickup();
  updateHp();
}

function nextFloor() {
  /* Leaving floor 1 (the Chained Warden) for the first time, with the Keeper still bound:
     play the unchaining cutscene and DEFER the real descent until it re-enters here. */
  if (Game.mapIdx === 0 && Game.loop === 0 && !keeperUnlocked()) {
    startVaultCutscene();
    return;
  }
  Game.mapIdx++;
  if (Game.mapIdx >= loopLen()) { Game.mapIdx = 0; Game.loop++; }
  setupFloor(false);
  Game.intermission = 2.5;
}

