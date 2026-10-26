/* =========================================================
   RUNEGUN · Update — the simulation step
   The per-frame gameplay tick: movement, interactions, waves, all entity/bullet/puddle integration and the camera.
   ========================================================= */
"use strict";

/* =========================================================
   UPDATE
   ========================================================= */
/* directional sparks thrown off a surface a bullet just struck (wall or foe).
   `ang` is the direction the sparks fan around; colored to the bullet's element. */
let ambientT = 0;   // throttle for the per-floor ambient motes
const PARTICLE_MAX = 900;    // live particles, all sources — the oldest yield (see the particle tick)
const FLOATER_SOFT = 150;    // live floaters past which plain damage / soul numbers stop printing (combat.js)
/* change gates for the two DOM readouts written from inside the sim loop —
   an unchanged textContent/style write still costs a style recalc per frame */
let lastHint = null, lastBossW = -1;

function bulletSparks(b, ang, n) {
  if (particles.length > 600) return;
  const col = b.venom ? "#7dff5e" : b.frost ? "#5ee6ff" : b.ember ? "#ff7a3d" : b.pet ? "#ffe08a" : "#fff3c8";
  for (let k = 0; k < n; k++) {
    const pa = ang + rnd(-0.65, 0.65), sp = rnd(110, 290);
    particles.push({ x: b.x, y: b.y, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp,
      t: 0, life: rnd(0.12, 0.2), r: rnd(1.5, 3), color: col });
  }
}

/* =========================================================
   INPUT FRAMES — one normalized record per warden per frame.
   The local warden's frame samples the device (Input + Meta) and
   consumes the tap latches; a partner's frame comes from Net.frameFor
   (the dev harness in Phase A, the wire in Phase C).
   ========================================================= */
function localInputFrame() {
  let mx = Input.moveX, my = Input.moveY;
  if (!Input.touchMode) {
    mx = (keyHeld("right") ? 1 : 0) - (keyHeld("left") ? 1 : 0);
    my = (keyHeld("down") ? 1 : 0) - (keyHeld("up") ? 1 : 0);
    /* a controller's left stick / d-pad steers instead while it's held (systems/controls.js) */
    if (Pad.moveX || Pad.moveY) { mx = Pad.moveX; my = Pad.moveY; }
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    /* the right stick aims a virtual cursor, so every desktop fire mode (hold / auto-fire /
       auto-aim), the crosshair and the co-op wire all work from it unchanged */
    Pad.aimCursor();
  }
  const f = { mx, my, aimX: Input.aimX, aimY: Input.aimY, aiming: Input.aiming,
    mouseX: Input.mouseX, mouseY: Input.mouseY, mouseDown: Input.touchMode ? Input.mouseDown : fireHeld(),
    touchMode: Input.touchMode, aimMode: Meta.aimMode, deskMode: Meta.deskMode,
    dashTap: Input.dashTap, useTap: Input.useTap };
  Input.dashTap = false; Input.useTap = false;
  return f;
}
function zeroFrame() {
  return { mx: 0, my: 0, aimX: 0, aimY: 0, aiming: false, mouseX: undefined, mouseY: undefined,
    mouseDown: false, touchMode: true, aimMode: "auto", deskMode: "auto", dashTap: false, useTap: false };
}
function inputFrameFor(p) {
  if (p === localPlayer()) return localInputFrame();
  const f = (typeof Net !== "undefined" && Net.frameFor) ? Net.frameFor(p) : null;
  return f || zeroFrame();
}

/* =========================================================
   PER-WARDEN TICK — movement, dash, auras-on-self, aim, gun.
   Extracted verbatim from the old single-player block; `p` is
   the warden, `inp` their input frame for this tick.
   ========================================================= */
function updateShredderSaw(p, dt) {
  if (p.char !== "shredder") { p.sawHitTarget = null; return; }
  const m = p.mods;
  p.sawHitTarget = null;
  /* Guns are holstered in the Singular; the idle Shredder blade must be still too. */
  if (Game.inSaloon) return;
  p.sawRot = (p.sawRot || 0) + dt * (28 + (m.rate - 8) * 4 + (m.speed / 540 - 1) * 10);
  if (p.downed || p.hp <= 0) return;

  const reach = m.sawReach || 76;
  /* SEEKER on a saw build: the blade's hunger bends the room. Prey inside the
     outer ring is dragged toward the grind (never a warden, never a planted foe),
     so a bullet-only rune still answers when the trigger is a whirling blade. */
  const pull = m.homing ? Math.min(80, m.homing * 7) : 0;
  const hourStill = !!(Game.deep && Game.deep.stillT > 0);   // the stopped hour freezes the drag too
  if (pull && !hourStill) {
    const grabR = Math.min(300, reach * 1.6), holdR = reach * 0.7;
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p" || e.boss || e.buffed) continue;
      const d2 = dist2(p.x, p.y, e.x, e.y);
      if (d2 > grabR * grabR || d2 < holdR * holdR) continue;
      const a = angTo(e.x, e.y, p.x, p.y);
      e.x += Math.cos(a) * pull * dt;
      e.y += Math.sin(a) * pull * dt;
      /* a violet mote now and then, torn off the dragged body toward the teeth */
      if (particles.length < 360 && Math.random() < 0.02)
        particles.push({ x: e.x + rnd(-6, 6), y: e.y + rnd(-6, 6),
          vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
          t: 0, life: 0.2, r: rnd(1, 2), color: "#a99bd8" });
    }
  }
  let nearest = Infinity;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d < (reach + e.r) ** 2 && d < nearest) { nearest = d; p.sawHitTarget = e; }
  }

  // Turning the aim accelerates the saw, preserving the original Shredder feel.
  let dAim = Math.abs(p.aim - (p.lastAim === undefined ? p.aim : p.lastAim));
  if (dAim > Math.PI) dAim = Math.abs(dAim - TAU);
  p.lastAim = p.aim;
  p.sawT = (p.sawT || 0) - (dt + Math.min(dAim, 0.4) * 0.4);
  if (p.sawT > 0) return;
  p.sawT = 0.1;
  const damage = (m.sawDmg || m.dmg) * (m.rate / 5) * (m.shredDmgMul || 1) * (p.dashT > 0 ? 2.5 : 1);
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    if (dist2(p.x, p.y, e.x, e.y) >= (reach + e.r) ** 2) continue;
    damageEnemy(e, damage, { owner: p, x: p.x, y: p.y, knock: m.knock * 0.4, melee: true });
    if (particles.length < 480) particles.push({ x: (p.x + e.x) / 2, y: (p.y + e.y) / 2,
      vx: rnd(-120, 120), vy: rnd(-120, 120), t: 0, life: 0.12, r: rnd(1.5, 3), color: "#fff3c8" });
  }
  if (p.sawHitTarget && p.sawHitTarget.dead) {
    p.sawHitTarget = null;
    nearest = Infinity;
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < (reach + e.r) ** 2 && d < nearest) { nearest = d; p.sawHitTarget = e; }
    }
  }
}

function updatePlayer(p, inp, dt) {
  if (p.hp <= 0 && !p.downed) return;
  const isLocal = p === localPlayer();
  const mx = inp.mx, my = inp.my;
  p.dashCd -= dt;
  p.iframes -= dt;
  /* REPRIEVE: the cooldown between saves, and the hold that keeps the horde still
     (the hold is read by the enemy loop below; bosses only take the slow) */
  p.reprieveCd = Math.max(0, (p.reprieveCd || 0) - dt);
  p.reprieveFreezeT = Math.max(0, (p.reprieveFreezeT || 0) - dt);
  p.kickT = Math.max(0, (p.kickT || 0) - dt);
  /* DOWNED: a slow crawl toward help — no dash, no gun, no interactions */
  if (p.downed) {
    p.x += mx * p.speed * 0.35 * dt;
    p.y += my * p.speed * 0.35 * dt;
    collideWorld(p);
    if ((mx || my) && Math.random() < dt * 8)
      particles.push({ x: p.x + rnd(-6, 6), y: p.y + rnd(-2, 8), vx: rnd(-15, 15), vy: rnd(-30, -8),
        t: 0, life: 0.4, r: rnd(1.5, 3), color: "#ff4d5e" });
    return;
  }
  if (inp.dashTap && p.dashCd <= 0) {
    p.dashT = p.dashDur; p.dashCd = p.dashCdBase;
    if (onIce(p.x, p.y)) p.dashT *= 1.6;   // the Stilled Hour: a dash launched off black ice slides 1.6x as far
    p.dashAng = (mx || my) ? Math.atan2(my, mx) : p.aim;
    p.wasOverLava = false;
    p.mineTrailT = 0;   // DEMOLITIONIST: the first dash-mine drops immediately
    AudioFX.dash();
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += Math.cos(p.dashAng) * (p.dashSpeed || 720) * dt;
    p.y += Math.sin(p.dashAng) * (p.dashSpeed || 720) * dt;
    particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0, life: 0.25, r: 9, color: "rgba(94,230,255,0.5)" });
    if (p.dashT <= 0 && p.char === "wraith") {
      p.iframes = Math.max(p.iframes, 0.35);
    }
    if (p.dashT <= 0 && p.char === "shredder") p.iframes = Math.max(p.iframes, 0.45);
    /* skimming fire: dashing across lava is damage-free but kicks a hissing ember wake */
    p.lavaWakeT = (p.lavaWakeT || 0) - dt;
    let overLava = false;
    for (const pu of puddles) if (pu.lava && dist2(p.x, p.y, pu.x, pu.y) < (pu.r * 0.9) ** 2) { overLava = true; break; }
    if (overLava && p.lavaWakeT <= 0) {
      p.lavaWakeT = 0.06;
      if (!p.wasOverLava) AudioFX.sizzle();
      for (let k = 0; k < 3; k++) {
        const wa = p.dashAng + Math.PI + rnd(-0.5, 0.5);
        particles.push({ x: p.x, y: p.y, vx: Math.cos(wa) * rnd(120, 260), vy: Math.sin(wa) * rnd(120, 260),
          t: 0, life: 0.35, r: rnd(2, 4), color: "#ff5e2e" });
      }
    }
    p.wasOverLava = overLava;
    /* THE DEMOLITIONIST sows its wake — a dash leaves a few mines along the path */
    if (p.char === "demolitionist" && !Game.inSaloon) {   // no mines on the saloon floor
      p.mineTrailT = (p.mineTrailT || 0) - dt;
      if (p.mineTrailT <= 0) { p.mineTrailT = 0.055; placeMine(p, p.x, p.y); }
    }
    /* PHASE rune: cutting wake — carries your elemental kit (burn / chill / poison / storm) */
    if (p.mods.dashTrail) {
      const m = p.mods;
      const col = m.ember ? "#ff7a3d" : m.venom ? "#7dff5e" : m.frost ? "#5ee6ff" : "#7ad7ff";
      puddles.push({ x: p.x, y: p.y, r: 20 + 5 * m.dashTrail, t: 0, life: 1.1,
        team: "p", dmg: 5 + 4 * m.dashTrail, color: col, tickMap: {}, phase: true, owner: p });
    }
  } else {
    const weightMul = curseActive(p, "weight") ? 0.5 : 1;
    /* flood water drags at your boots — dashing skims it, like lava */
    let wadeMul = 1;
    for (const pu of puddles) if (pu.water && dist2(p.x, p.y, pu.x, pu.y) < (pu.r * 0.9) ** 2) { wadeMul = 0.6; break; }
    /* the deep floors: the stopped hour and stasis fields drag at you; black ice keeps
       your momentum — steering grip falls to about a quarter, so you glide and overshoot */
    const dm = deepMoveMul(p.x, p.y);
    let mvx = mx * p.speed * weightMul * wadeMul * dm, mvy = my * p.speed * weightMul * wadeMul * dm;
    if (onIce(p.x, p.y)) {
      const k = 1 - Math.exp(-2.4 * dt);
      p.ivx = (p.ivx || 0) + (mvx - (p.ivx || 0)) * k; p.ivy = (p.ivy || 0) + (mvy - (p.ivy || 0)) * k;
      mvx = p.ivx; mvy = p.ivy;
    } else { p.ivx = mvx; p.ivy = mvy; }
    p.x += mvx * dt;
    p.y += mvy * dt;
    if (wadeMul < 1 && (mx || my) && Math.random() < dt * 10) {
      particles.push({ x: p.x + rnd(-8, 8), y: p.y + rnd(0, 10),
        vx: rnd(-45, 45), vy: rnd(-90, -25), t: 0, life: rnd(0.2, 0.4), r: rnd(1.5, 3), color: "#7de8e0" });
    }
  }
  collideWorld(p);
  /* MEND: wounds knit closed when you go untouched */
  if (p.mods.regen && p.hp < p.maxHp && p.hp > 0) {
    p.regenT = (p.regenT || 0) + dt;
    if (p.regenT >= p.mods.regenDelay) { p.hp = Math.min(p.maxHp, p.hp + p.mods.regen * dt); updateHp(); }
  }
  /* HULL DISTRESS: the battered ship spits yellow sparks at critical HP */
  if (p.hp > 0 && p.hp / p.maxHp < 0.3 && p.veilT <= 0 && particles.length < 480) {
    const frac = p.hp / p.maxHp;
    if (Math.random() < dt * (5 + 15 * (1 - frac / 0.3))) {
      const a = rnd(0, TAU), rr = rnd(6, p.r);
      particles.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr,
        vx: Math.cos(a) * rnd(40, 130), vy: Math.sin(a) * rnd(40, 130) - 30,
        t: 0, life: rnd(0.15, 0.35), r: rnd(1.5, 3.5), color: "#ffd23d" });
    }
  }
  /* SLIME: lay a caustic trail in your wake while you move */
  if (p.mods.slime && (mx || my || p.dashT > 0)) {
    p.slimeT = (p.slimeT || 0) - dt;
    if (p.slimeT <= 0 && puddles.length < 150) {
      p.slimeT = 0.1;
      puddles.push({ x: p.x, y: p.y, r: 13 + 4 * p.mods.slime, t: 0,
        life: 1.4 + 0.3 * p.mods.slime, team: "p", dmg: 2 + p.mods.slime,
        color: "#86d020", tickMap: {}, slime: true, owner: p });
    }
  }
  /* BULWARK shield: every 12s, one spent charge returns — a full refill takes 12s per charge */
  if (p.shieldMax > 0 && p.shield < p.shieldMax) {
    p.shieldT += dt;
    if (p.shieldT >= 12) { p.shieldT = 0; p.shield++; AudioFX.pickup(); }
  } else p.shieldT = 0;
  if (p.veilT > 0) {
    p.veilT = Math.max(0, p.veilT - dt);
    /* a thin trail of mist marks where the vanished wraith drifts */
    if (Math.random() < 0.6) particles.push({ x: p.x + rnd(-8, 8), y: p.y + rnd(-8, 8),
      vx: rnd(-30, 30), vy: rnd(-40, 10), t: 0, life: 0.3, r: rnd(2, 4), color: "rgba(94,230,255,0.4)" });
  }
  /* aim resolution — mouse math is only meaningful on the local screen (Game.cam) */
  if (!inp.touchMode) {
    if (inp.deskMode === "auto") {
      const tgt = nearestEnemy(p.x, p.y);
      if (tgt) { p.aim = angTo(p.x, p.y, tgt.x, tgt.y); p.autoFire = true; }
      else {
        if (isLocal && inp.mouseX !== undefined)
          p.aim = Math.atan2((inp.mouseY / ZOOM + Game.cam.y) - p.y, (inp.mouseX / ZOOM + Game.cam.x) - p.x);
        p.autoFire = false;
      }
    } else if (isLocal && inp.mouseX !== undefined) {
      p.aim = Math.atan2((inp.mouseY / ZOOM + Game.cam.y) - p.y, (inp.mouseX / ZOOM + Game.cam.x) - p.x);
    }
  } else if (inp.aimMode === "auto") {
    const tgt = nearestEnemy(p.x, p.y);
    if (tgt) { p.aim = angTo(p.x, p.y, tgt.x, tgt.y); p.autoFire = true; }
    else p.autoFire = false;
  }
  updateShredderSaw(p, dt);
  fireWeapon(p, inp, dt);
}

/* =========================================================
   SEPARATION — overlapping bodies shoulder apart.
   Every pair used to be tested every frame: n²/2, which at a 500-strong horde is
   125k distance checks a frame. A horde now goes through a spatial grid instead —
   cells two max-radii wide, so only bodies in neighbouring cells can overlap — which
   cuts that to a few thousand. Below SEP_GRID_MIN the plain loop runs, exactly as it
   always has.
   ========================================================= */
const SEP_GRID_MIN = 64;
const sepCells = new Map();   // cell key → enemy indices; the arrays are reused frame to frame
/* cell coords pack into one number (unique while |cell| < 32768 — maps are a few dozen cells wide) */
function cellKey(gx, gy) { return (gx + 32768) * 65536 + (gy + 32768); }
function separatePair(a, b) {
  if (a.ghost || b.ghost || a.noclip || b.noclip) return;   // the incorporeal shoulder past everything
  const d2 = dist2(a.x, a.y, b.x, b.y), min = a.r + b.r;
  if (d2 < min * min && d2 > 0.01) {
    const d = Math.sqrt(d2), push = (min - d) / 2, ang = angTo(b.x, b.y, a.x, a.y);
    a.x += Math.cos(ang) * push; a.y += Math.sin(ang) * push;
    b.x -= Math.cos(ang) * push; b.y -= Math.sin(ang) * push;
  }
}
function separateEnemies() {
  const n = enemies.length;
  if (n < SEP_GRID_MIN) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) separatePair(enemies[i], enemies[j]);
    return;
  }
  let maxR = 0;
  for (const e of enemies) if (e.r > maxR) maxR = e.r;
  const cs = Math.max(32, maxR * 2);
  for (const cell of sepCells.values()) cell.length = 0;
  for (let i = 0; i < n; i++) {
    const e = enemies[i], k = cellKey(Math.floor(e.x / cs), Math.floor(e.y / cs));
    let cell = sepCells.get(k);
    if (!cell) sepCells.set(k, cell = []);
    cell.push(i);
  }
  /* each pair once: from the lower index to the higher, across the 3×3 neighbourhood */
  for (let i = 0; i < n; i++) {
    const a = enemies[i], gx = Math.floor(a.x / cs), gy = Math.floor(a.y / cs);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const cell = sepCells.get(cellKey(gx + ox, gy + oy));
      if (cell) for (const j of cell) if (j > i) separatePair(a, enemies[j]);
    }
  }
  if (sepCells.size > 4096) sepCells.clear();   // don't hoard empty cells across a long run
}

/* =========================================================
   SHOT → BODY candidates. Every player bullet used to test every enemy each frame:
   a RAPID+SCATTER+TWIN build (~440 shots) against a 300-strong horde is 130k tests a
   frame (measured 4.4ms of update). With a horde on the field, the bullets now ask a
   grid for the bodies near them instead. The answer is the same: candidates come back
   in enemies[] order, and a shot still takes the FIRST body it overlaps, so which
   enemy a bullet strikes is exactly what the full scan picked.
   Bosses and other big bodies skip the grid — they'd inflate every cell — and are
   always candidates. HIT_SLACK covers a body shoved by knockback (≤ ~30px) earlier in
   the same frame; past that, the hit lands a frame later rather than not at all.
   ========================================================= */
const HIT_GRID_MIN = 64, HIT_BIG_R = 40, HIT_SLACK = 48;
const hitCells = new Map(), hitBig = [], hitIdx = [], hitList = [];
let hitCS = 48, hitMaxR = 0;
function hitGridBuild() {
  if (enemies.length < HIT_GRID_MIN || bullets.length < 8) return false;
  hitMaxR = 0; hitBig.length = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.boss || e.r > HIT_BIG_R) hitBig.push(i); else if (e.r > hitMaxR) hitMaxR = e.r;
  }
  hitCS = Math.max(48, hitMaxR * 2);
  for (const cell of hitCells.values()) cell.length = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.boss || e.r > HIT_BIG_R) continue;
    const k = cellKey(Math.floor(e.x / hitCS), Math.floor(e.y / hitCS));
    let cell = hitCells.get(k);
    if (!cell) hitCells.set(k, cell = []);
    cell.push(i);
  }
  if (hitCells.size > 4096) hitCells.clear();
  return true;
}
/* the bodies bullet b could touch this frame, in enemies[] order (one shared array —
   the caller is done with it before it asks again) */
function hitCandidates(grid, b) {
  if (!grid) return enemies;
  const reach = Math.ceil((b.r + hitMaxR + HIT_SLACK) / hitCS);
  const gx = Math.floor(b.x / hitCS), gy = Math.floor(b.y / hitCS);
  hitIdx.length = 0;
  for (const j of hitBig) hitIdx.push(j);
  for (let ox = -reach; ox <= reach; ox++) for (let oy = -reach; oy <= reach; oy++) {
    const cell = hitCells.get(cellKey(gx + ox, gy + oy));
    if (cell) for (const j of cell) hitIdx.push(j);
  }
  hitIdx.sort((p, q) => p - q);
  hitList.length = 0;
  for (const j of hitIdx) hitList.push(enemies[j]);
  return hitList;
}

function update(dt) {
  Game.time += dt;
  if (Game.flawlessToast > 0) Game.flawlessToast = Math.max(0, Game.flawlessToast - dt);
  if (Game.hitstop > 0) { Game.hitstop -= dt; return; }
  /* boss-death ceremony: the blasts play out, then the toll is offered */
  if (Game.ceremonyT > 0) {
    Game.ceremonyT -= dt;
    if (Game.ceremonyT <= 0) { Game.ceremonyT = 0; setState("choice"); return; }
  }
  /* boss-death slow-motion: time drags while the corpse comes apart */
  if (Game.slowmo > 0) { Game.slowmo = Math.max(0, Game.slowmo - dt); dt *= 0.35; }
  tickCurses(dt);
  tickDrunk(dt);                           // the saloon's rounds wear off wherever you carry them
  if (Game.state !== "play") return;
  /* floors VI–VIII: the stopped hour, stasis fields, the last living star (entities/deep.js).
     While the hour is STILL, only the Hourglass Saint and the wardens move. */
  const still = deepTick(dt);

  /* --- wardens: input frames, then each takes their tick --- */
  const frames = players.map(p => inputFrameFor(p));
  for (const p of players) {
    updatePlayer(p, frames[p.idx], dt);
    if (Game.state !== "play") return;   // a thorns kill / veil kill can end the frame
  }

  /* --- revive: living hands close on a downed partner --- */
  for (const p of players) {
    if (!p.downed || p.gone) continue;
    let rescuer = null;
    for (const o of alivePlayers()) if (dist2(o.x, o.y, p.x, p.y) < REVIVE_RANGE ** 2) { rescuer = o; break; }
    if (rescuer) {
      p.reviveT += dt;
      if (Math.random() < dt * 12) particles.push({ x: p.x + rnd(-14, 14), y: p.y + rnd(-14, 6),
        vx: rnd(-15, 15), vy: rnd(-70, -25), t: 0, life: rnd(0.3, 0.6), r: rnd(1.5, 3), color: "#7dff5e" });
      if (p.reviveT >= REVIVE_TIME) revivePartner(p);
    } else p.reviveT = Math.max(0, p.reviveT - dt * 2);
  }

  /* --- interactions: chests, grand seal, portal --- */
  for (const c of chests) c.pulse += dt * 2;
  for (const h of healthBoxes) h.pulse += dt * 2;
  SEAL.pulse += dt * 1.5;
  /* THE UNKNOWN — ticked once per frame; only the local warden communes */
  const rh = updateRift(dt);
  /* THE SINGULAR — greeting, chatter and the bar's [ E ] prompt (local warden only) */
  const sh = updateSaloon(dt);
  /* THE UNKNOWN — its walk-up, its runes, its challenge rounds (entities/unknown.js) */
  const uh = updateUnknown(dt);
  if (Game.state !== "play") return;     // its death hands the frame to the ending
  let hint = null;                       // the LOCAL warden's hint (DOM readout)
  for (const p of alivePlayers()) {
    let pHint = null, pAct = null;
    for (const c of chests) {
      if (c.state === "sealed" && dist2(c.x, c.y, p.x, p.y) < 64 * 64 && !Game.ambush) {
        pHint = "[ E ] BREAK THE SEAL"; pAct = () => triggerAmbush(c);
      }
    }
    for (const h of healthBoxes) {
      if (h.state === "sealed" && dist2(h.x, h.y, p.x, p.y) < 64 * 64 && !Game.ambush) {
        pHint = "[ E ] TAKE THE VITALITY"; pAct = () => openHealthBox(h, p);
      }
    }
    if (SEAL.state === "ready" && dist2(SEAL.x, SEAL.y, p.x, p.y) < (SEAL.r + 40) ** 2 && !Game.ambush) {
      pHint = "[ E ] WAKE WHAT SLEEPS BELOW"; pAct = () => spawnBoss();
    }
    if (p === localPlayer()) {
      if (rh.hint && !pHint) { pHint = rh.hint; pAct = rh.act; }
      if (sh.hint && !pHint) { pHint = sh.hint; pAct = sh.act; }
      if (uh.hint && !pHint) { pHint = uh.hint; pAct = uh.act; }
      hint = pHint;
    }
    const f = frames[p.idx];
    if (f && f.useTap && pAct) pAct();
  }
  if (hint) hint = hint.replace("[ E ]", "[ " + (Input.touchMode ? "SEAL" : bindLabel("use")) + " ]");
  if (hint !== lastHint) {
    lastHint = hint;
    const hintEl = $("interactHint");
    hintEl.textContent = hint || "";
    hintEl.style.opacity = hint ? 1 : 0;
  }

  if (portal) {
    portal.t += dt;
    /* motes drawn into the way down — it visibly pulls */
    if (Math.random() < 0.5 && particles.length < 500) {
      const pa = rnd(0, TAU), pd = rnd(60, 130);
      const sx = portal.x + Math.cos(pa) * pd, sy = portal.y + Math.sin(pa) * pd;
      const ia = angTo(sx, sy, portal.x, portal.y);
      particles.push({ x: sx, y: sy, vx: Math.cos(ia) * rnd(70, 140), vy: Math.sin(ia) * rnd(70, 140),
        t: 0, life: 0.5, r: rnd(1.5, 3), color: "#9d6bff" });
    }
    /* either warden stepping through takes them BOTH down */
    if (portal.t > 0.8) for (const p of alivePlayers()) {
      if (dist2(portal.x, portal.y, p.x, p.y) < (portal.r + p.r) ** 2) {
        portal = null;
        Game.floorFade = 1;          // the dark swallows the descent, then releases the new floor
        /* past the Event Horizon the way down leads into the saloon first; the
           saloon's own portal (Game.inSaloon) carries on to the next floor */
        if (Game.mapIdx === 4 && !Game.inSaloon && saloonAvailable()) { enterSaloon(); return; }
        nextFloor();
        return;
      }
    }
  }

  /* --- pickups: whichever warden touches the orb rolls from THEIR pool ---
     One choice at a time. With two orbs down (a chest each, or the boss toll)
     both wardens can touch on the SAME frame, and Game.pendingPickup is a
     single slot — so a second claim while one is unresolved is dropped here
     rather than overwriting the first. The untouched orb simply waits and
     opens its own choice on a later frame. */
  if (!Game.pendingPickup) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i]; pk.t += dt;
      for (const p of alivePlayers()) {
        if (dist2(pk.x, pk.y, p.x, p.y) < (pk.r + p.r + 8) ** 2) {
          Game.pendingPickup = pk;
          Game.pendingPickupBy = p.idx;
          if (!pk.ids) pk.ids = genThreeRunes(p);
          openRuneChoice();
          return;
        }
      }
    }
  } else for (const pk of pickups) pk.t += dt;   // still bob while one is open

  /* --- waves keep coming until the warden falls --- */
  const ambient = enemies.filter(e => !e.ambush && !e.boss && e.team !== "p").length;
  if (!Game.ambush && !Game.boss && ambient === 0 && !portal && !Game.inRift && !Game.inSaloon && !Game.inUnknown && !Game.ceremonyT) {
    Game.intermission -= dt;
    if (Game.intermission <= 0) { startWave(); Game.intermission = 3; }
  }

  /* --- enemies --- */
  /* REPRIEVE: a saved warden's breath stops the horde with them — the same hard
     hold as the stopped hour (bosses are only slowed, set when the save fires) */
  const reprieved = players.some(pl => pl.hp > 0 && (pl.reprieveFreezeT || 0) > 0);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if ((still || reprieved) && !e.boss) continue;
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      if (e.boss) {                                  // a warden tearing its way in
        Game.shake = Math.max(Game.shake, 3);        // a low, building tremor of anticipation
        if (Math.random() < 0.6) {                   // motes spiralling into the seal
          const a = rnd(0, TAU), d = rnd(e.r + 70, e.r + 190);
          const sx = e.x + Math.cos(a) * d, sy = e.y + Math.sin(a) * d;
          const ia = angTo(sx, sy, e.x, e.y) + 0.5;
          particles.push({ x: sx, y: sy, vx: Math.cos(ia) * 230, vy: Math.sin(ia) * 230, t: 0, life: 0.4, r: rnd(2, 4), color: e.color });
        }
        if (e.spawnT <= 0) bossArrives(e);            // it lands
      }
      continue;
    }
    e.slowT -= dt;
    /* STILLPOINT: any warden's time bubble keeps nearby foes mired */
    for (const p of alivePlayers()) {
      if (p.mods.timeField && dist2(e.x, e.y, p.x, p.y) < p.mods.timeR ** 2) { e.slowT = Math.max(e.slowT, 0.12); break; }
    }
    e.slowMul = e.slowT > 0 ? (e.boss ? 0.7 : 0.45) : 1;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) {
        /* the burn keeps its author — their FROST/STORM ride every tick */
        const bm = e.burnBy ? e.burnBy.mods : null;
        e.burnTick = 0.45; damageEnemy(e, e.burnDps, e.burnBy ? { owner: e.burnBy } : undefined);
        particles.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-20, 20), vy: rnd(-90, -40), t: 0, life: 0.4, r: 3, color: "#ff4d2e" });
        if (bm && bm.frost) e.slowT = Math.max(e.slowT, 1 + 0.7 * bm.frost);
        if (bm && bm.storm && !e.dead) chainStorm(e, bm.storm, new Set([e]), e.burnBy);
      }
      if (e.dead) { enemies.splice(i, 1); continue; }
    }
    /* DREAD: a terrified foe drops everything and flees, blind */
    if (e.fearT > 0 && !e.boss) {
      e.fearT -= dt;
      const FP = combatTarget(e);
      const fa = angTo(FP.x, FP.y, e.x, e.y);
      e.vx = Math.cos(fa) * e.speed * e.slowMul; e.vy = Math.sin(fa) * e.speed * e.slowMul;
    } else if (e.boss) bossAI(e, dt);
    else if (e.team === "p") {
      if (hasHostileTarget(e)) ETYPES[e.type].ai(e, dt);
      else thrallFollowAI(e);
    } else ETYPES[e.type].ai(e, dt);
    deepMoveEnemy(e, dt);   // e.x/e.y += velocity — mired by stasis fields, skidding on black ice
    /* a slaghulk mid-leap sails clean over the rocks; a shade simply drifts through them —
       both still honor the arena's outer walls */
    if (!e.airLeap && !e.noclip) collideWorld(e);
    else { e.x = clamp(e.x, 30 + e.r, MAP.w - 30 - e.r); e.y = clamp(e.y, 30 + e.r, MAP.h - 30 - e.r); }
    e.hitFlash -= dt;
    /* MAELSTROM: gravity wells gently gather the living toward a corpse */
    if (!e.boss) {
      for (const pu of puddles) {
        if (!pu.vortex) continue;
        const vd2 = dist2(e.x, e.y, pu.x, pu.y);
        if (vd2 < pu.r * pu.r && vd2 > 1) {
          const vd = Math.sqrt(vd2), va = angTo(e.x, e.y, pu.x, pu.y), pull = 90 * (1 - vd / pu.r) * dt;
          e.x += Math.cos(va) * pull; e.y += Math.sin(va) * pull;
        }
      }
    }
    /* PRICKLE: any warden's thornfield pricks whatever strays in, for very little */
    if (!e.ghost && e.team !== "p") {
      e.prickleTick = (e.prickleTick || 0) - dt;
      if (e.prickleTick <= 0) for (const p of alivePlayers()) {
        if (p.mods.prickle && dist2(e.x, e.y, p.x, p.y) < p.mods.prickleR ** 2) {
          e.prickleTick = 0.4;
          damageEnemy(e, 0.6 + 0.4 * p.mods.prickle, { owner: p });
          break;
        }
      }
    }
    /* friendly puddles bite enemies — shared timer prevents overlapping puddles from stacking */
    if (!e.ghost && e.team !== "p") {
      e.puddleTick = (e.puddleTick || 0) - dt;
      for (const pu of puddles) {
        if (pu.team !== "p" && !(pu.team === undefined)) continue;
        if (!pu.vortex && (pu.team === "p" || pu.venomous) && dist2(e.x, e.y, pu.x, pu.y) < (pu.r + e.r * 0.5) ** 2) {
          if (e.puddleTick <= 0) {
            /* the pool bites with its POURER's elements */
            const pown = pu.owner;
            const m = pown ? pown.mods : null;
            e.puddleTick = 0.4; damageEnemy(e, pu.dmg, pown ? { owner: pown } : undefined);
            if (m && m.ember) { e.burnT = Math.max(e.burnT, 2 + m.ember); e.burnDps = Math.max(e.burnDps, 2 + 2 * m.ember); e.burnBy = pown; }
            if (m && m.frost) e.slowT = Math.max(e.slowT, 1 + 0.7 * m.frost);
            if (m && m.storm && !e.dead) chainStorm(e, m.storm, new Set([e]), pown);
            /* the PHASE wake also seeds poison if you carry VENOM */
            if (pu.phase && m && m.venom && !e.dead && puddles.length < 140) {
              puddles.push({ x: e.x, y: e.y, r: 18 + 8 * m.venom, t: 0, life: 2.2,
                team: "p", dmg: 3 + 2 * m.venom, color: "#7dff5e", tickMap: {}, owner: pown });
            }
          }
          break;
        }
      }
    }
    if (e.dead) enemies.splice(i, 1);
  }
  /* the player may have died to enemy contact mid-loop — stop simulating the
     frame so nothing (pets, stray bullets) can overwrite the death/continue screen */
  if (Game.state !== "play") return;

  /* separation */
  separateEnemies();

  /* --- pets --- */
  if (!still) for (const pet of pets) { if (Game.state !== "play") break; updatePet(pet, dt); }

  /* --- Hellforge meltdown: superheated rocks run into lava once the Tyrant walks --- */
  tickForgeMelt(dt);

  /* --- hostile puddles bite the wardens --- */
  for (const p of alivePlayers()) {
    p.puddleTick -= dt;
    for (const pu of puddles) {
      if (pu.team !== "e") continue;
      if (!pu.dmg) continue;   // the Nave's flood water wades, it doesn't bite
      if (dist2(p.x, p.y, pu.x, pu.y) < (pu.r * 0.9) ** 2 && p.puddleTick <= 0 && p.dashT <= 0 && p.veilT <= 0) {
        p.puddleTick = 0.5;
        /* standing in fire must READ as fire: embers splash off your boots, it hisses */
        if (pu.lava) {
          for (let k = 0; k < 7; k++) particles.push({ x: p.x + rnd(-8, 8), y: p.y + rnd(-4, 10),
            vx: rnd(-90, 90), vy: rnd(-160, -40), t: 0, life: rnd(0.25, 0.45), r: rnd(2, 4), color: "#ff5e2e" });
          AudioFX.sizzle();
        }
        hurtPlayer(p, pu.dmg, null);
      }
    }
  }

  /* --- mines: the Demolitionist's seeded floor waits for a footfall --- */
  for (let i = mines.length - 1; i >= 0; i--) {
    const mn = mines[i]; mn.t += dt;
    if (mn.armT > 0) { mn.armT -= dt; continue; }   // still settling — can't be tripped yet
    if (mn.t > mn.life) {
      /* the charge sours and dies with a dull fizzle */
      for (let k = 0; k < 4; k++) particles.push({ x: mn.x, y: mn.y, vx: rnd(-30, 30), vy: rnd(-60, -15),
        t: 0, life: 0.3, r: rnd(1.5, 3), color: "#8a5a3d" });
      mines.splice(i, 1); continue;
    }
    let trigger = null;
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      if (dist2(mn.x, mn.y, e.x, e.y) < (mn.r + e.r) ** 2) { trigger = e; break; }
    }
    if (trigger) { mines.splice(i, 1); detonateMine(mn, trigger); }
  }

  /* --- mortar shells: the Demolitionist's rounds mid-lob — airborne like a
         slag leap (rock can't stop them) yet still a bullet to whatever they cross --- */
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i]; sh.t += dt;
    const p = Math.min(sh.t / sh.T, 1);
    sh.x = lerp(sh.sx, sh.lx, p);
    sh.y = lerp(sh.sy, sh.ly, p);
    if (p >= 1) { shells.splice(i, 1); shellSlam(sh); continue; }
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p" || sh.hitSet.has(e)) continue;
      if (dist2(sh.x, sh.y, e.x, e.y) < (sh.r + e.r) ** 2) {
        sh.hitSet.add(e);
        damageEnemy(e, sh.dmg, sh);
        bulletSparks(sh, angTo(sh.lx, sh.ly, sh.sx, sh.sy), 4);
      }
    }
    if (Game.state !== "play") return;   // a clip can fell the warden mid-frame
  }

  /* --- player bullets --- */
  const hole = Game.boss && Game.boss.kind === 4 && !Game.boss.airborne && Game.boss.spawnT <= 0 ? Game.boss : null;
  const hitGrid = hitGridBuild();   // false = few enemies or shots: every shot scans them all, as always
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    /* the stopped hour: your shot hangs where it is; new ones stack off the muzzle */
    if (still) { deepBankBullet(b); continue; }
    b.t += dt;
    /* THE EVENT HORIZON bends every shot that strays too close */
    if (hole) {
      const d = Math.sqrt(dist2(b.x, b.y, hole.x, hole.y));
      if (d > 1 && d < 380) {
        const aa = angTo(b.x, b.y, hole.x, hole.y);
        const g = 1500 * (1 - d / 380) * (hole.feasting ? 1.7 : 1);
        b.vx += Math.cos(aa) * g * dt; b.vy += Math.sin(aa) * g * dt;
      }
      /* while it FEASTS, anything that touches it is swallowed — and counted */
      if (hole.feasting && d < hole.r + b.r + 28) {
        hole.stored++;
        Game.horizonFed++;   // THE THOUSANDFOLD remembers every shot you fed the Horizon
        const ia = angTo(b.x, b.y, hole.x, hole.y);
        for (let k = 0; k < 3; k++)
          particles.push({ x: b.x, y: b.y, vx: Math.cos(ia) * rnd(180, 320), vy: Math.sin(ia) * rnd(180, 320), t: 0, life: 0.22, r: 2, color: "#fff3c8" });
        if (hole.stored % 10 === 0) floatText(hole.x, hole.y - hole.r - 24, "FED ×" + hole.stored, "#fff3c8");
        bullets.splice(i, 1);
        continue;
      }
    }
    if (b.homing) {
      let best = null, bd = 380 * 380;
      for (const e of enemies) {
        if (e.spawnT > 0 || e.ghost || e.team === "p") continue;
        const d = dist2(b.x, b.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const want = angTo(b.x, b.y, best.x, best.y);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        const turn = clamp(diff, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
      }
    }
    { const lm = lapseMul(b.x, b.y); b.x += b.vx * dt * lm; b.y += b.vy * dt * lm; }   // a stasis field slows shot too
    let dead = b.t > b.life;
    let bounced = false, mirrored = false;
    if (b.x < 32 || b.x > MAP.w - 32) { b.vx *= -1; b.x = clamp(b.x, 33, MAP.w - 33); bounced = true; }
    if (b.y < 32 || b.y > MAP.h - 32) { b.vy *= -1; b.y = clamp(b.y, 33, MAP.h - 33); bounced = true; }
    if (!bounced) for (const rc of MAP.rocks) {
      if (circleRect(b.x, b.y, b.r, rc)) {
        /* the Glass Choir: a mirror pane gives your shot back — angle in, angle out, nothing spent */
        if (rc.mirror) { deepReflect(b, rc); mirrored = true; }
        else {
          const cxp = clamp(b.x, rc.x, rc.x + rc.w), cyp = clamp(b.y, rc.y, rc.y + rc.h);
          if (Math.abs(b.x - cxp) > Math.abs(b.y - cyp)) b.vx *= -1; else b.vy *= -1;
        }
        bounced = true; break;
      }
    }
    if (bounced) {
      /* the flipped velocity now points off the surface — sparks follow it */
      if (!b.shard) bulletSparks(b, Math.atan2(b.vy, b.vx), 4);
      if (mirrored) { /* reflected, not spent */ }
      else if (b.bounce > 0) { b.bounce--; if (b.hitSet) b.hitSet.clear(); } else dead = true;
    }
    if (!dead) for (const e of hitCandidates(hitGrid, b)) {
      if (e.dead || e.spawnT > 0 || e.ghost || e.team === "p" || (b.hitSet && b.hitSet.has(e))) continue;
      if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
        /* a PENITENT's raised mirror sends the shot straight back at you */
        if (e.type === "penitent" && penitentReflects(e, b)) { penitentBounce(e, b); dead = true; break; }
        /* THE REFLECTION: while the violet sheen is up, your shot comes straight back */
        if (e.boss && e.kind === UNK_KIND && unkReflects(e)) { unkReflect(e, b); dead = true; break; }
        (b.hitSet || (b.hitSet = new Set())).add(e);
        let bdmg = b.dmg;
        /* PUNCTURE: a chance to find the gap and strike for more than double */
        const crit = b.crit && Math.random() < b.crit;
        if (crit) { bdmg *= b.critMul; Game.shake = Math.max(Game.shake, 5); AudioFX.crit(); }
        b.critHit = crit;                                  // damageEnemy prints the number gold + oversized
        damageEnemy(e, bdmg, b);
        b.critHit = false;
        /* impact sparks fan back off the wound along the shot's reverse */
        bulletSparks(b, Math.atan2(-b.vy, -b.vx), crit ? 6 : 4);
        /* DREAD: the hit may break the foe's nerve */
        if (b.fear && !e.boss && Math.random() < b.fear) e.fearT = Math.max(e.fearT || 0, b.fearDur);
        if (b.ember) { e.burnT = 2 + b.ember; e.burnDps = 2 + 2 * b.ember; e.burnBy = b.owner; }
        if (b.frost) { e.slowT = 1 + 0.7 * b.frost; floatText(e.x, e.y - e.r - 12, "❄", "#5ee6ff"); }
        if (b.storm && !e.dead) chainStorm(e, b.storm, new Set([e]), b.owner);
        if (b.pierce > 0) b.pierce--; else dead = true;
        break;
      }
    }
    /* the hit may have felled the EVENT HORIZON — startEnding() empties this very
       array mid-loop, so the frame must stop here, not at the guard below */
    if (Game.state !== "play") return;
    if (dead) {
      if (b.venom) {
        /* RAPID+TWIN can land 100+ venom bullets/sec on one spot — a fresh pool
           per death piles up hundreds of alpha-blended discs and OOM-kills the
           WebView on low-RAM phones. A pool that mostly overlaps an existing one
           refreshes it instead, and brand-new pools respect the shared cap. */
        let near = null;
        for (const pu of puddles) {
          if (pu.team === "p" && !pu.lava && !pu.vortex && !pu.phase && !pu.slime &&
              dist2(b.x, b.y, pu.x, pu.y) < (pu.r * 0.5) ** 2) { near = pu; break; }
        }
        if (near) {
          near.t = Math.min(near.t, 0.3); near.life = 4;
          near.r = Math.max(near.r, 26 + 14 * b.venom);
          near.dmg = Math.max(near.dmg, 3 + 2 * b.venom);
        } else if (puddles.length < 140) {
          puddles.push({ x: b.x, y: b.y, r: 26 + 14 * b.venom, t: 0, life: 4,
            team: "p", dmg: 3 + 2 * b.venom, color: "#7dff5e", tickMap: {}, owner: b.owner });
        }
      }
      if (!b.shard) for (let k = 0; k < 3; k++) particles.push({ x: b.x, y: b.y, vx: rnd(-90, 90), vy: rnd(-90, 90), t: 0, life: 0.2, r: 2, color: b.venom ? "#7dff5e" : "#e8e2d0" });
      bullets.splice(i, 1);
    }
  }
  /* a bullet may have felled the warden (state → "choice") — freeze the rest of the frame */
  if (Game.state !== "play") return;

  /* --- enemy bullets --- */
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    /* the stopped hour: shot hangs in the air — but it still cuts whoever walks into it */
    if (still) {
      if (b.team === "p") {
        for (const e of enemies) {
          if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
          if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
            damageEnemy(e, b.dmg, { owner: b.owner, x: b.x, y: b.y });
            ebullets.splice(i, 1); break;
          }
        }
        continue;
      }
      for (const p of alivePlayers()) {
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) { hurtPlayer(p, b.dmg, b); ebullets.splice(i, 1); break; }
      }
      continue;
    }
    b.t += dt;
    if (b.homing) {
      const HP = nearestPlayer(b.x, b.y);
      const want = angTo(b.x, b.y, HP.x, HP.y);
      const cur = Math.atan2(b.vy, b.vx);
      let diff = want - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
      const turn = clamp(diff, -b.homing * dt, b.homing * dt);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
    }
    /* STILLPOINT: enemy fire crawls inside any warden's bubble — rescaled from a stored base speed so it never compounds */
    {
      let mul = 1, hasField = false;
      for (const p of alivePlayers()) {
        if (!p.mods.timeField) continue;
        hasField = true;
        if (dist2(b.x, b.y, p.x, p.y) < p.mods.timeR ** 2) mul = Math.min(mul, p.mods.timeMul);
      }
      if (hasField) {
        if (b.baseSp === undefined) b.baseSp = Math.hypot(b.vx, b.vy);
        const cur = Math.hypot(b.vx, b.vy) || 1;
        const k = (b.baseSp * mul) / cur;
        b.vx *= k; b.vy *= k;
      }
    }
    { const lm = lapseMul(b.x, b.y); b.x += b.vx * dt * lm; b.y += b.vy * dt * lm; }
    let dead = b.t > 4 || b.x < 32 || b.x > MAP.w - 32 || b.y < 32 || b.y > MAP.h - 32;
    /* the Glass Choir: a prism orb splits into the spectrum after 1s, or on touching stone */
    if (b.prism && !dead && (b.t >= 1 || MAP.rocks.some(rc => circleRect(b.x, b.y, b.r, rc)))) { prismSplit(b); dead = true; }
    if (!dead) for (const rc of MAP.rocks) {
      if (!circleRect(b.x, b.y, b.r, rc)) continue;
      if (b.pierceRock) break;                                            // the posse's slugs punch through stone
      if (rc.mirror && (b.refl = (b.refl || 0) + 1) <= 4) { deepReflect(b, rc); break; }   // mirror panes give it back
      dead = true; break;
    }
    if (!dead && b.team !== "p") for (const ally of enemies) {
      if (ally.team !== "p" || ally.dead || ally.ghost || ally.spawnT > 0) continue;
      if (dist2(b.x, b.y, ally.x, ally.y) < (b.r + ally.r) ** 2) {
        damageEnemy(ally, b.dmg, { x: b.x, y: b.y }); dead = true; break;
      }
    }
    /* THE UNKNOWN's slug and boulder settle their own hits (unkTickBullets) — the boulder rolls on */
    if (!dead && b.team === "p") for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
        damageEnemy(e, b.dmg, { owner: b.owner, x: b.x, y: b.y });
        dead = true; break;
      }
    }
    if (!dead && b.team !== "p" && !b.unkKnock) for (const p of alivePlayers()) {
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) {
        const before = p.hp;
        hurtPlayer(p, b.dmg, b); dead = true;
        if (b.lasso && p.hp < before) posseLasso(p);                     // STICK-UP: the lasso takes a rune
        break;
      }
    }
    if (dead) ebullets.splice(i, 1);
  }

  /* --- shockwaves: hostile rings hit the player, friendly novas hit enemies --- */
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    if (!s) continue;   // bossSlain splices hostile waves mid-loop; the index may overshoot
    if (still) break;   // the stopped hour: every ring hangs where it is
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.r += s.speed * dt;
    if (s.hostile && !s.hit && s.dmg > 0) {
      for (const p of alivePlayers()) {
        const d = Math.sqrt(dist2(s.x, s.y, p.x, p.y));
        if (Math.abs(d - s.r) < 16 + p.r) { hurtPlayer(p, s.dmg, s); s.hit = true; break; }
      }
    }
    if (s.hostile && s.dmg > 0) {
      s.friendHitSet = s.friendHitSet || new Set();
      for (const ally of enemies) {
        if (ally.team !== "p" || ally.dead || ally.ghost || ally.spawnT > 0 || s.friendHitSet.has(ally)) continue;
        if (Math.abs(Math.sqrt(dist2(s.x, s.y, ally.x, ally.y)) - s.r) < 16 + ally.r) {
          s.friendHitSet.add(ally); damageEnemy(ally, s.dmg, { x: s.x, y: s.y });
        }
      }
    }
    if (!s.hostile && s.dmg > 0) {
      for (const e of enemies) {
        if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p" || s.hitSet.has(e)) continue;
        if (dist2(s.x, s.y, e.x, e.y) < (s.r + e.r) ** 2) { s.hitSet.add(e); damageEnemy(e, s.dmg, s.owner ? { owner: s.owner } : undefined); }
      }
      /* a friendly wave may have felled the warden — same mid-frame stop as the bullet loop */
      if (Game.state !== "play") return;
    }
    if (s.r > s.max) shockwaves.splice(i, 1);
  }

  /* --- puddles, particles, floaters, zaps --- */
  if (!still) for (let i = puddles.length - 1; i >= 0; i--) {   // the stopped hour holds every pool as it is
    const p = puddles[i];
    if (p.life !== Infinity) { p.t += dt; if (p.t > p.life) { puddles.splice(i, 1); continue; } }
    else p.t += dt;
    /* lava breathes: idle pools spit rising embers (rate is per-pool — the
       Tyrant's rivers make 100+ pools, so keep it low or they pin the cap) */
    if (p.lava && Math.random() < dt * 1.2 && particles.length < 500) {
      particles.push({ x: p.x + rnd(-p.r * 0.6, p.r * 0.6), y: p.y + rnd(-p.r * 0.6, p.r * 0.6),
        vx: rnd(-25, 25), vy: rnd(-120, -40), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 5), color: "#ff5e2e" });
    }
  }
  if (!still) for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) particles.splice(i, 1); }
  /* hard ceiling: the spawn-side caps don't cover every source — a NOVA chain's corpse
     bursts measured 2,884 live. The oldest go first; they're the nearest to fading anyway. */
  if (particles.length > PARTICLE_MAX) particles.splice(0, particles.length - PARTICLE_MAX);
  for (let i = veils.length - 1; i >= 0; i--) { veils[i].t += dt; if (veils[i].t > veils[i].life) veils.splice(i, 1); }
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; f.y -= (f.vy === undefined ? 40 : f.vy) * dt; if (f.t > (f.life || 0.7)) floaters.splice(i, 1); }
  if (soulMotes.length) tickSoulMotes(dt);   // after particles: motes freeze with hitstop, drag with slowmo
  for (let i = zaps.length - 1; i >= 0; i--) { zaps[i].t += dt; if (zaps[i].t > 0.15) zaps.splice(i, 1); }

  /* --- boss bar --- */
  if (Game.boss) {
    /* the posse's bar counts all three bodies (barFrac, deep.js); every other warden its own */
    const bw = clamp((Game.boss.barFrac !== undefined && Game.boss.kind === 7 ? Game.boss.barFrac : Game.boss.hp / Game.boss.maxHp) * 100, 0, 100);
    /* the CSS width transition (.1s) smooths anything finer than this anyway */
    if (Math.abs(bw - lastBossW) > 0.2) { lastBossW = bw; $("bossFill").style.width = bw + "%"; }
  }

  /* --- camera: locked to the warden THIS screen steers --- */
  const camP = localPlayer();
  /* THE UNKNOWN: the camera leans toward it, so the rune glowing over its head stays in sight */
  const camF = Game.inUnknown ? unkCamFocus(camP) : camP;
  /* a few rounds in, the camera won't hold still (scenes/saloon.js); culling and aim follow it */
  const sway = drunkSway();
  Game.cam.x = lerp(Game.cam.x, clamp(camF.x - VW / 2 + sway.x, 0, MAP.w - VW), 1 - Math.pow(0.001, dt));
  Game.cam.y = lerp(Game.cam.y, clamp(camF.y - VH / 2 + sway.y, 0, MAP.h - VH), 1 - Math.pow(0.001, dt));
  if (MAP.w < VW) Game.cam.x = (MAP.w - VW) / 2;
  if (MAP.h < VH) Game.cam.y = (MAP.h - VH) / 2;
  /* --- ambient floor life: a few drifting motes keyed to the floor's palette --- */
  ambientT -= dt;
  if (ambientT <= 0 && particles.length < 450) {
    ambientT = rnd(0.25, 0.5);
    const ax = Game.cam.x + rnd(0, VW), ay = Game.cam.y + rnd(0, VH);
    const fi = Game.inSaloon ? -1 : (Game.inRift || Game.inUnknown) ? 4 : Game.mapIdx;
    if (fi === 5)      particles.push({ x: ax, y: ay, vx: rnd(-3, 3), vy: rnd(1, 5), t: 0, life: rnd(2.4, 3.6), r: rnd(1.2, 2.6), color: "rgba(235,246,255,0.45)" });   // stilled hour: snow that barely falls
    else if (fi === 6) particles.push({ x: ax, y: ay, vx: rnd(-4, 4), vy: rnd(-4, 4), t: 0, life: rnd(0.8, 1.6), r: rnd(1, 2), color: pick(SPECTRUM) });                    // glass choir: prism glints
    else if (fi === 7) { const D = Game.deep, wa = D ? angTo(D.starX, D.starY, ax, ay) : Math.PI / 2;                                                                 // last living star: ash on the stellar wind
                         particles.push({ x: ax, y: ay, vx: Math.cos(wa) * rnd(30, 70), vy: Math.sin(wa) * rnd(30, 70), t: 0, life: rnd(1.2, 2.2), r: rnd(1, 2.2), color: pick(["rgba(255,190,160,0.4)", "rgba(255,84,112,0.35)"]) }); }
    else if (fi === -1) particles.push({ x: ax, y: ay, vx: rnd(-6, 6), vy: rnd(-14, -4), t: 0, life: rnd(1.6, 2.8), r: rnd(1, 2),   // the singular: dust in the lamplight, still motes in the void outside
                         color: ax > SAL_ROOM.x && ax < SAL_ROOM.x + SAL_ROOM.w && ay > SAL_ROOM.y && ay < SAL_ROOM.y + SAL_ROOM.h ? "rgba(242,179,109,0.35)" : "rgba(201,184,255,0.3)" });
    else if (fi === 0)     particles.push({ x: ax, y: ay, vx: rnd(8, 26), vy: rnd(-8, 8), t: 0, life: rnd(1.2, 2.2), r: rnd(1, 2.2), color: "rgba(157,107,255,0.4)" });      // catacomb: sidelong violet dust
    else if (fi === 1) particles.push({ x: ax, y: ay, vx: rnd(-10, 10), vy: rnd(-38, -16), t: 0, life: rnd(1.2, 2), r: rnd(1.2, 2.4), color: "rgba(184,214,138,0.4)" }); // ossuary: rising bone spores
    else if (fi === 2) particles.push({ x: ax, y: ay, vx: rnd(-14, 14), vy: rnd(-90, -40), t: 0, life: rnd(0.6, 1.2), r: rnd(1.2, 2.6), color: pick(["rgba(255,138,61,0.55)", "rgba(255,210,61,0.4)"]) }); // hellforge: embers
    else if (fi === 3) particles.push({ x: ax, y: ay, vx: rnd(-8, 8), vy: rnd(-34, -12), t: 0, life: rnd(1.4, 2.4), r: rnd(1, 2.4), color: "rgba(125,232,224,0.35)" });  // drowned nave: rising bubbles
    else               particles.push({ x: ax, y: ay, vx: rnd(-6, 6), vy: rnd(-6, 6), t: 0, life: rnd(1.5, 2.6), r: rnd(1, 2), color: "rgba(201,184,255,0.35)" });       // the void: still motes
  }

  Game.shake = Math.max(0, Game.shake - dt * 30);
  Game.flash = Math.max(0, Game.flash - dt);
  if (Game.flash === 0) Game.flashCol = null;   // never let a gold streak flash tint the next hurt
  Game.floorFade = Math.max(0, Game.floorFade - dt / 1.1);
  Game.comboT -= dt;
  if (Game.comboT <= 0) {
    /* only a streak that actually reached a tier gets a send-off — anything lower would nag */
    if (Game.comboN >= 5) streakEnd(Game.comboN, Game.streakTier);
    Game.comboT = 0; Game.comboN = 0; Game.streakTier = -1;
  }
}

