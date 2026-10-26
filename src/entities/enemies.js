/* =========================================================
   RUNEGUN · Enemies
   Enemy archetypes (stats + per-frame AI), the spawner, wave composition and the chest/health-box ambushes.
   ========================================================= */
"use strict";

/* =========================================================
   ENEMIES — base archetypes + one new horror per floor
   (the Hellforge fields a second: the slaghulk and its shards)
   ========================================================= */
/* how many revenants a single NECROMANCER (summoner) may raise in its lifetime,
   after which its well is dry — keeps the Ossuary clearable without wave-clear runes */
const SUMMONER_RAISE_CAP = 4;
const REANIMATOR_THRALL_CAP = 8;
function reanimatorThrallCount(owner) {
  if (!owner) return 0;
  let n = 0;
  for (const e of enemies) if (e.team === "p" && e.owner === owner && e.summoned && !e.dead) n++;
  return n;
}

function thrallFollowAI(e) {
  const owner = e.owner;
  if (!owner) { e.vx = e.vy = 0; return; }
  const tx = owner.x + Math.cos(owner.aim) * 240;
  const ty = owner.y + Math.sin(owner.aim) * 240;
  const angle = angTo(e.x, e.y, tx, ty);
  const d = dist2(e.x, e.y, tx, ty);
  let moveAngle = angle;
  if (lineBlocked(e.x, e.y, tx, ty)) {
    for (const offset of [0.5, -0.5, 1, -1]) {
      const testAngle = angle + offset;
      if (!lineBlocked(e.x, e.y, e.x + Math.cos(testAngle) * 40, e.y + Math.sin(testAngle) * 40)) {
        moveAngle = testAngle; break;
      }
    }
  }
  if (d > 40 * 40) {
    e.vx = Math.cos(moveAngle) * e.speed * 0.8;
    e.vy = Math.sin(moveAngle) * e.speed * 0.8;
  } else { e.vx *= 0.8; e.vy *= 0.8; }
}

/* shared brain of the SLAGHULK and its slaglings: stalk the player, coil, then a
   ballistic leap that sails clean over rock and shot alike — ghosted while
   airborne, it comes down exactly where the warning ring says it will. */
function slagAI(e, dt) {
  const P = combatTarget(e);
  e.pt -= dt; e.jumpCd -= dt;
  if (e.phase === "stalk") {
    const a = angTo(e.x, e.y, P.x, P.y);
    e.vx = Math.cos(a) * e.speed * e.slowMul;
    e.vy = Math.sin(a) * e.speed * e.slowMul;
    e.rockA += (e.vx >= 0 ? 1 : -1) * dt * 2.4;   // the boulder rolls as it walks
    contactHurt(e, 2, e.contactDmg);
    if (e.jumpCd <= 0 && dist2(e.x, e.y, P.x, P.y) < e.jumpRange ** 2) {
      e.phase = "crouch"; e.pt = e.crouchDur;
    }
  } else if (e.phase === "crouch") {
    e.vx *= 0.75; e.vy *= 0.75;
    if (e.pt <= 0) {
      e.phase = "leap"; e.pt = e.leapDur;
      e.ghost = true; e.airLeap = true;           // untouchable and unblockable while airborne
      e.lx = clamp(P.x, 60, MAP.w - 60);
      e.ly = clamp(P.y, 60, MAP.h - 60);
      e.vx = (e.lx - e.x) / e.leapDur;
      e.vy = (e.ly - e.y) / e.leapDur;
      if (e.waveDmg) {                            // the heavy one marks its crater
        shockwaves.push({ x: e.lx, y: e.ly, r: 4, max: 52, speed: 70, dmg: 0,
          hostile: false, color: "#ff4d5e", hitSet: new Set() });
        AudioFX.dash();
      }
    }
  } else { /* leap — committed; the landing frame is the payoff */
    if (e.pt <= 0) {
      e.phase = "stalk"; e.ghost = false; e.airLeap = false;
      e.vx = e.vy = 0;
      e.jumpCd = rnd(e.cdMin, e.cdMax);
      for (let i = 0; i < (e.waveDmg ? 10 : 4); i++) particles.push({
        x: e.x + rnd(-e.r, e.r), y: e.y + rnd(-6, 6), vx: rnd(-120, 120), vy: rnd(-60, -10),
        t: 0, life: rnd(0.25, 0.5), r: rnd(1.5, 3), color: e.color });
      if (e.waveDmg) {
        shockwaves.push({ x: e.x, y: e.y, r: 10, max: e.waveMax, speed: 420, dmg: e.waveDmg,
          hit: false, hostile: true, wrath: e.wrath, rime: e.rime, sear: e.sear });
        Game.shake = Math.max(Game.shake, 9); AudioFX.slam();
      }
      contactHurt(e, 6, e.contactDmg);
    }
  }
}

const ETYPES = {
  chaser: {
    hp: 24, r: 12, speed: 150, color: "#ff4d5e", score: 10,
    init: e => { e.wob = rnd(0, TAU); e.contactCd = 0; },
    ai: (e, dt) => {
      const P = combatTarget(e);
      e.wob += dt * 7;
      const a = angTo(e.x, e.y, P.x, P.y) + Math.sin(e.wob) * 0.35;
      e.vx = Math.cos(a) * e.speed * e.slowMul;
      e.vy = Math.sin(a) * e.speed * e.slowMul;
      if (e.team === "p") {
        if ((e.friendlyHitAt || 0) <= Game.time) for (const target of enemies) {
          if (target === e || target.dead || target.ghost || target.spawnT > 0 || target.team === "p") continue;
          if (dist2(e.x, e.y, target.x, target.y) < (e.r + target.r + 2) ** 2) {
            e.friendlyHitAt = Game.time + 0.55;
            damageEnemy(target, 10, { owner: e.owner, x: e.x, y: e.y, knock: 18 });
            if (e.inherit && e.owner && e.owner.mods) {
              const m = e.owner.mods;
              if (m.ember) { target.burnT = Math.max(target.burnT || 0, 1 + m.ember * 0.5); target.burnDps = Math.max(target.burnDps || 0, 1 + m.ember); target.burnBy = e.owner; }
              if (m.frost) { target.slowT = Math.max(target.slowT || 0, 0.5 + 0.35 * m.frost); }
              if (m.venom && puddles.length < 140) puddles.push({ x: target.x, y: target.y, r: 15 + 5 * m.venom * 0.5, t: 0, life: 1.5, team: "p", dmg: 1 + m.venom * 0.5, color: "#7dff5e", tickMap: {}, owner: e.owner });
              if (m.storm && !target.dead) chainStorm(target, Math.max(1, Math.floor(m.storm * 0.5)), new Set([target]), e.owner);
            }
            break;
          }
        }
      } else {
        e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
        if (e.contactCd <= 0) for (const target of alivePlayers()) {
          if (dist2(e.x, e.y, target.x, target.y) < (e.r + target.r + 2) ** 2) {
            hurtPlayer(target, 10, e);
            e.contactCd = 0.85;
            break;
          }
        }
      }
    } },
  gunner: {
    hp: 20, r: 12, speed: 95, color: "#ffd23d", score: 15,
    init: e => { e.cd = rnd(0.8, 1.8); },
    ai: (e, dt) => {
      const P = combatTarget(e);
      const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y));
      const a = angTo(e.x, e.y, P.x, P.y);
      const want = d > 420 ? 1 : d < 280 ? -1 : 0;
      e.vx = Math.cos(a) * e.speed * want * e.slowMul;
      e.vy = Math.sin(a) * e.speed * want * e.slowMul;
      e.cd -= dt;
      if (e.cd <= 0 && d < 700 && !lineBlocked(e.x, e.y, P.x, P.y)) {
        e.cd = rnd(1.4, 2.2);
        const b = { team: e.team, owner: e.owner, x: e.x, y: e.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: 6, dmg: 12, t: 0, color: e.color, wrath: e.wrath, rime: e.rime, sear: e.sear };
        if (e.inherit && e.owner && e.owner.mods) {
          const m = e.owner.mods;
          b.pierce = Math.max(0, Math.floor(m.pierce * 0.5)); b.bounce = Math.max(0, Math.floor(m.bounce * 0.5)); b.homing = m.homing * 0.5;
          b.venom = m.venom * 0.5; b.ember = m.ember * 0.5; b.frost = m.frost * 0.5; b.storm = m.storm * 0.5;
          b.execute = m.execute; b.knock = m.knock || 30;
        }
        ebullets.push(b);
        AudioFX.enemyShoot();
      }
    } },
  dasher: {
    hp: 30, r: 13, speed: 120, color: "#9d6bff", score: 20,
    init: e => { e.phase = "stalk"; e.pt = 0; },
    ai: (e, dt) => {
      const P = combatTarget(e);
      e.pt -= dt;
      if (e.phase === "stalk") {
        const a = angTo(e.x, e.y, P.x, P.y);
        e.vx = Math.cos(a) * e.speed * e.slowMul;
        e.vy = Math.sin(a) * e.speed * e.slowMul;
        if (dist2(e.x, e.y, P.x, P.y) < 300 * 300) { e.phase = "wind"; e.pt = 0.55; e.vx = e.vy = 0; }
      } else if (e.phase === "wind") {
        e.vx *= 0.8; e.vy *= 0.8;
        if (e.pt <= 0) {
          e.phase = "dash"; e.pt = 0.4;
          const a = angTo(e.x, e.y, P.x, P.y);
          e.vx = Math.cos(a) * 620; e.vy = Math.sin(a) * 620;
          AudioFX.dash();
        }
      } else {
        if (e.team === "p") {
          for (const target of enemies) {
            if (target.team === "p" || target.dead || target.ghost || target.spawnT > 0) continue;
            if (dist2(e.x, e.y, target.x, target.y) < (e.r + target.r + 4) ** 2) {
              damageEnemy(target, 16, { owner: e.owner, x: e.x, y: e.y }); e.phase = "stalk"; break;
            }
          }
        } else for (const p of alivePlayers()) {
          if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r + 4) ** 2) { hurtPlayer(p, 16, e); e.phase = "stalk"; break; }
        }
        if (e.pt <= 0) { e.phase = "stalk"; e.pt = 0; }
      }
    } },
  slammer: {
    hp: 70, r: 22, speed: 70, color: "#ff8a3d", score: 35,
    init: e => { e.phase = "walk"; e.pt = 0; e.cd = 1.6; },
    ai: (e, dt) => {
      const P = combatTarget(e);
      e.pt -= dt; e.cd -= dt;
      if (e.phase === "walk") {
        const a = angTo(e.x, e.y, P.x, P.y);
        e.vx = Math.cos(a) * e.speed * e.slowMul;
        e.vy = Math.sin(a) * e.speed * e.slowMul;
        if (e.cd <= 0 && dist2(e.x, e.y, P.x, P.y) < 190 * 190) { e.phase = "raise"; e.pt = 0.7; }
      } else if (e.phase === "raise") {
        e.vx = e.vy = 0;
        if (e.pt <= 0) {
          e.phase = "walk"; e.pt = 0; e.cd = 1.6;
          shockwaves.push({ x: e.x, y: e.y, r: 10, max: 170, speed: 420, dmg: 20, hit: false, hostile: e.team !== "p", owner: e.owner, wrath: e.wrath, rime: e.rime, sear: e.sear });
          Game.shake = Math.max(Game.shake, 9); AudioFX.slam();
        }
      }
    } },
  spitter: {
    hp: 55, r: 16, speed: 60, color: "#7dff5e", score: 40,
    init: e => { e.cd = 1.6; e.spin = rnd(0, TAU); },
    ai: (e, dt) => {
      const P = combatTarget(e);
      const a = angTo(e.x, e.y, P.x, P.y);
      const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y));
      const want = d > 380 ? 1 : -0.5;
      e.vx = Math.cos(a) * e.speed * want * e.slowMul;
      e.vy = Math.sin(a) * e.speed * want * e.slowMul;
      e.cd -= dt;
      if (e.cd <= 0 && d < 760) {
        e.cd = 2.4; e.spin += 0.7;
        for (let i = 0; i < 8; i++) {
          const aa = e.spin + i / 8 * TAU;
          const sb = { team: e.team, owner: e.owner, x: e.x, y: e.y, vx: Math.cos(aa) * 230, vy: Math.sin(aa) * 230, r: 6, dmg: 10, t: 0, color: e.color, wrath: e.wrath, rime: e.rime, sear: e.sear };
          if (e.inherit && e.owner && e.owner.mods) {
            const m = e.owner.mods;
            sb.pierce = Math.max(0, Math.floor(m.pierce * 0.5)); sb.bounce = Math.max(0, Math.floor(m.bounce * 0.5)); sb.homing = m.homing * 0.5;
            sb.venom = m.venom * 0.5; sb.ember = m.ember * 0.5; sb.frost = m.frost * 0.5; sb.storm = m.storm * 0.5;
            sb.execute = m.execute; sb.knock = m.knock || 30;
          }
          ebullets.push(sb);
        }
        AudioFX.enemyShoot();
      }
    } },

  /* --- floor 1: WISP — blinks beside you, three quick shots, gone again --- */
  wisp: {
    hp: 18, r: 10, speed: 0, color: "#c9b8ff", score: 30,
    init: e => { e.phase = "gone"; e.pt = rnd(0.6, 1.4); e.shots = 0; e.ghost = true; },
    ai: (e, dt) => {
      e.pt -= dt;
      if (e.phase === "gone") {
        e.ghost = true; e.vx = e.vy = 0;
        if (e.pt <= 0) {
          const P = combatTarget(e);
          const a = rnd(0, TAU), d = rnd(180, 300);
          e.x = clamp(P.x + Math.cos(a) * d, 60, MAP.w - 60);
          e.y = clamp(P.y + Math.sin(a) * d, 60, MAP.h - 60);
          e.phase = "tele"; e.pt = 0.45;
        }
      } else if (e.phase === "tele") { // visible warning ring, still untouchable
        e.ghost = true;
        if (e.pt <= 0) { e.phase = "in"; e.pt = 0.35; e.shots = 5; e.ghost = false; }
      } else { // in: fire 5 spaced shots, then vanish
        e.ghost = false; e.vx = e.vy = 0;
        if (e.pt <= 0) {
          if (e.shots > 0) {
            e.shots--;
            const P = combatTarget(e);
            const a = angTo(e.x, e.y, P.x, P.y) + rnd(-0.08, 0.08);
            ebullets.push({ team: e.team, owner: e.owner, x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 5, dmg: 9, t: 0, color: e.color, wrath: e.wrath, rime: e.rime, sear: e.sear });
            AudioFX.enemyShoot();
            e.pt = 0.35;
          } else { e.phase = "gone"; e.pt = rnd(1.2, 2.2); e.ghost = true; }
        }
      }
    } },

  /* --- floor 2: SUMMONER — flees and raises a finite host of the dead --- */
  summoner: {
    hp: 45, r: 15, speed: 85, color: "#b8d68a", score: 50,
    /* RAISE_CAP revenants over its whole life, then the well runs dry: clear the
       host and the caster is spent — no longer an endless fountain */
    init: e => { e.cd = 2; e.raised = 0; },
    ai: (e, dt) => {
      const P = combatTarget(e.x, e.y);
      const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y));
      const a = angTo(e.x, e.y, P.x, P.y);
      const want = d < 420 ? -1 : 0.3;
      e.vx = Math.cos(a) * e.speed * want * e.slowMul;
      e.vy = Math.sin(a) * e.speed * want * e.slowMul;
      e.cd -= dt;
      if (e.cd <= 0 && e.raised < SUMMONER_RAISE_CAP) {
        e.cd = 3.2;
        const ownerRoom = e.team === "p" ? REANIMATOR_THRALL_CAP - reanimatorThrallCount(e.owner) : 2;
        const count = Math.min(2, Math.max(0, ownerRoom));
        for (let i = 0; i < count && e.raised < SUMMONER_RAISE_CAP; i++) {
          const aa = rnd(0, TAU);
          const m = spawnEnemy("chaser", clamp(e.x + Math.cos(aa) * 70, 60, MAP.w - 60), clamp(e.y + Math.sin(aa) * 70, 60, MAP.h - 60));
          m.summoned = true; m.ambush = e.ambush; m.team = e.team; m.owner = e.owner;
          if (m.team === "p") m.color = "rgba(138,134,160,0.72)";
          if (e.ambush && Game.ambush) Game.ambush.remaining++;
          enemies.push(m); e.raised++;
        }
        AudioFX.chest();
        floatText(e.x, e.y - e.r - 14, "RISE", "#b8d68a");
      }
    } },

  /* --- floor 2, second horror: SHADE — a ghost that knows nothing of walls.
         It drifts through solid stone, always straight at you; rock stops your
         shot but never its advance. Catch it in the open, or keep running. --- */
  shade: {
    hp: 32, r: 12, speed: 112, color: "#b0e8dc", score: 35,
    init: e => { e.noclip = true; e.bob = rnd(0, TAU); e.inRock = false; },
    ai: (e, dt) => {
      const P = combatTarget(e.x, e.y);
      const a = angTo(e.x, e.y, P.x, P.y);
      e.vx = Math.cos(a) * e.speed * e.slowMul;
      e.vy = Math.sin(a) * e.speed * e.slowMul;
      e.inRock = false;
      for (const rc of MAP.rocks) if (circleRect(e.x, e.y, e.r * 0.5, rc)) { e.inRock = true; break; }
      /* spectral motes peel off the shroud as it drifts */
      if (Math.random() < dt * 9) particles.push({
        x: e.x + rnd(-e.r * 0.6, e.r * 0.6), y: e.y + rnd(-2, e.r * 0.6),
        vx: rnd(-14, 14), vy: rnd(-34, -10), t: 0, life: rnd(0.35, 0.7), r: rnd(1.5, 3), color: e.color });
      contactHurt(e, 2, 12);
    } },

  /* --- floor 3: CINDER — molten slug that scorches its own trail --- */
  cinder: {
    hp: 90, r: 18, speed: 60, color: "#ff5e2e", score: 55,
    init: e => { e.trailT = 0; },
    ai: (e, dt) => {
      const P = combatTarget(e.x, e.y);
      const a = angTo(e.x, e.y, P.x, P.y);
      e.vx = Math.cos(a) * e.speed * e.slowMul;
      e.vy = Math.sin(a) * e.speed * e.slowMul;
      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = 0.4;
        puddles.push({ x: e.x, y: e.y, r: 26, t: 0, life: 3.2, team: "e", dmg: 5, color: "#ff5e2e", tickMap: {}, lava: true, wrath: e.wrath, rime: e.rime, sear: e.sear });
      }
      contactHurt(e, 2, 14);
    },
    onDeath: e => { /* bursts into a ring of fire */
      for (let i = 0; i < 8; i++) {
        const aa = i / 8 * TAU;
        ebullets.push({ team: e.team, owner: e.owner, x: e.x, y: e.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, r: 5, dmg: 8, t: 0, color: e.color, wrath: e.wrath, rime: e.rime, sear: e.sear });
      }
    } },

  /* --- floor 3, second horror: SLAGHULK — half-cooled tonnage that stalks you
         and hurls itself skyward; the crater is the killer, not the beast.
         Slain, it breaks into four SLAGLINGS: quick, hungry shards of itself. --- */
  slag: {
    hp: 150, r: 26, speed: 55, color: "#ffb02e", score: 60,
    init: e => {
      e.phase = "stalk"; e.pt = 0; e.jumpCd = rnd(1.4, 2.2);
      e.crouchDur = 0.55; e.leapDur = 0.62;
      e.jumpRange = 300; e.contactDmg = 18; e.waveDmg = 22; e.waveMax = 150;
      e.cdMin = 2.4; e.cdMax = 3.4;
      e.rockA = rnd(0, TAU);
      e.jag = []; for (let k = 0; k < 8; k++) e.jag.push(rnd(0.82, 1.12));
    },
    ai: (e, dt) => slagAI(e, dt),
    onDeath: e => {
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + rnd(-0.35, 0.35), d = rnd(22, 40);
        const m = spawnEnemy("slagling",
          clamp(e.x + Math.cos(a) * d, 60, MAP.w - 60),
          clamp(e.y + Math.sin(a) * d, 60, MAP.h - 60));
        m.spawnT = 0.5;                    // a breath of telegraph before the shards wake
        m.ambush = e.ambush;
        if (e.ambush && Game.ambush) Game.ambush.remaining++;
        enemies.push(m);
      }
      AudioFX.meltBurst();
      floatText(e.x, e.y - e.r - 14, "IT BREAKS APART", "#ffb02e");
    } },
  /* the shards: fast, fragile, and they hop at your ankles in a pack */
  slagling: {
    hp: 25, r: 10, speed: 175, color: "#ffb02e", score: 15,
    init: e => {
      e.phase = "stalk"; e.pt = 0; e.jumpCd = rnd(0.8, 1.4);
      e.crouchDur = 0.28; e.leapDur = 0.4;
      e.jumpRange = 150; e.contactDmg = 7; e.waveDmg = 0; e.waveMax = 0;
      e.cdMin = 1.4; e.cdMax = 2.2;
      e.rockA = rnd(0, TAU);
      e.jag = []; for (let k = 0; k < 8; k++) e.jag.push(rnd(0.8, 1.15));
    },
    ai: (e, dt) => slagAI(e, dt) },

  /* --- floor 4: ANGLER — it hangs unseen in the murk and dangles a golden
         glint that looks for all the world like loot. Come close and the murk
         closes its jaws. Untouchable until you are near enough to see the truth. --- */
  angler: {
    hp: 70, r: 15, speed: 45, color: "#3ec6d8", score: 50,
    init: e => { e.phase = "lurk"; e.pt = 0; e.lureBob = rnd(0, TAU); e.strikeAng = 0; },
    ai: (e, dt) => {
      const P = combatTarget(e.x, e.y);
      e.lureBob += dt * 7;
      e.pt -= dt;
      const d2p = dist2(e.x, e.y, P.x, P.y);
      if (e.phase === "lurk") {
        /* too far to make out: a shape the eye slides past — only the lure is bright */
        e.ghost = d2p > 240 * 240;
        const a = angTo(e.x, e.y, P.x, P.y);
        e.vx = Math.cos(a) * e.speed * e.slowMul;
        e.vy = Math.sin(a) * e.speed * e.slowMul;
        if (d2p < 150 * 150) { e.phase = "wind"; e.pt = 0.35; e.ghost = false; e.vx = e.vy = 0; AudioFX.dash(); }
      } else if (e.phase === "wind") {
        e.vx = e.vy = 0;
        if (e.pt <= 0) { e.phase = "strike"; e.pt = 0.4; e.strikeAng = angTo(e.x, e.y, P.x, P.y); }
      } else if (e.phase === "strike") {
        e.vx = Math.cos(e.strikeAng) * 540 * e.slowMul;
        e.vy = Math.sin(e.strikeAng) * 540 * e.slowMul;
        let bit = false;
        for (const p of alivePlayers()) {
          if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r + 2) ** 2) { hurtPlayer(p, 16, e); bit = true; break; }
        }
        if (bit || e.pt <= 0) { e.phase = "reveal"; e.pt = 1.6; }
      } else { /* reveal: spent — it backs toward the dark, soft and killable */
        const a = angTo(e.x, e.y, P.x, P.y);
        e.vx = -Math.cos(a) * e.speed * 0.5 * e.slowMul;
        e.vy = -Math.sin(a) * e.speed * 0.5 * e.slowMul;
        if (e.pt <= 0) e.phase = "lurk";
      }
    } },

  /* --- floor 4, second horror: RIPTIDE — a wave that hunts. It marks its lane,
         breaks across the nave, and anything it catches is carried along —
         delivered to whatever waits at the far end. Dash to break the current. --- */
  riptide: {
    hp: 60, r: 14, speed: 90, color: "#7de8e0", score: 45,
    init: e => { e.phase = "flow"; e.pt = 0; e.cd = rnd(1.6, 2.6); e.rushAng = 0; e.dragged = false; },
    ai: (e, dt) => {
      const P = combatTarget(e.x, e.y);
      e.pt -= dt; e.cd -= dt;
      const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y));
      const a = angTo(e.x, e.y, P.x, P.y);
      if (e.phase === "flow") {
        /* band at mid-range, strafing like surf feeling for its moment */
        const want = d < 260 ? -1 : d > 420 ? 1 : 0;
        const strafe = Math.sin(Game.time * 1.7 + e.r) > 0 ? 1 : -1;
        e.vx = (Math.cos(a) * want + Math.cos(a + Math.PI / 2) * strafe * 0.6) * e.speed * e.slowMul;
        e.vy = (Math.sin(a) * want + Math.sin(a + Math.PI / 2) * strafe * 0.6) * e.speed * e.slowMul;
        if (e.cd <= 0 && d < 520) { e.phase = "wind"; e.pt = 0.6; e.rushAng = a; e.vx = e.vy = 0; }
      } else if (e.phase === "wind") {
        e.vx = e.vy = 0;
        if (e.pt <= 0) { e.phase = "rush"; e.pt = 0.55; AudioFX.dash(); }
      } else { /* rush: the wave breaks down its lane, carrying whatever it caught */
        e.vx = Math.cos(e.rushAng) * 640;
        e.vy = Math.sin(e.rushAng) * 640;
        for (const p of alivePlayers()) {
          if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r + 18) ** 2 && p.dashT <= 0 && p.veilT <= 0) {
            if (!e.dragged) { hurtPlayer(p, 8, e); e.dragged = true; }
            p.x += Math.cos(e.rushAng) * 560 * dt;
            p.y += Math.sin(e.rushAng) * 560 * dt;
            collideWorld(p);
          }
        }
        if (e.pt <= 0) { e.phase = "flow"; e.cd = rnd(2.2, 3.2); e.dragged = false; }
      }
    } },

  /* --- PHYLACTERY — the Marrow King's scattered soul. While any survive he is
         warded against nearly all harm. They orbit him; shoot them down. --- */
  phylactery: {
    hp: 55, r: 11, speed: 0, color: "#d8ffb0", score: 45,
    init: e => { e.orbA = rnd(0, TAU); e.orbR = 110; e.bob = rnd(0, TAU); },
    ai: (e, dt) => {
      const B = Game.boss;
      if (!B || B.kind !== 1) { e.hp = 0; e.dead = true; return; }
      e.orbA += dt * 1.4; e.bob += dt * 5;
      const tx = B.x + Math.cos(e.orbA) * e.orbR;
      const ty = B.y + Math.sin(e.orbA) * e.orbR + Math.sin(e.bob) * 6;
      e.vx = (tx - e.x) * 8; e.vy = (ty - e.y) * 8;
    } },
};

/* once the catacomb hardens, lesser horrors may rise EMPOWERED:
   twice the vitality and unmovable by knockback. */
const BUFF_WAVE = 5;
function buffChance() { return Math.min(0.4, 0.12 + 0.03 * (Game.wave - BUFF_WAVE)); }

/* ...or WRATHFUL: everything they land — claw, bullet, slam, scorch —
   strikes half again as hard. Rolled apart from EMPOWERED; a rare few bear both. */
const WRATH_DMG_MUL = 1.5;

/* ...or marked by an element, one roll shared between two faces that never share a
   body: RIMEBOUND (ice — every blow it lands leadens your legs with the Warden's own
   WEIGHT hex) or SEARING (fire — a blow may leave embers clinging: the BRAND).
   Like WRATH, the mark rides the horror's claws AND everything it hurls, and a bolt
   in flight keeps its chill or its heat after the caster dies. */
const RIME_SLOW_T = 2.0;      // seconds of WEIGHT per landed blow (refreshes, never stacks)
const SEAR_CHANCE = 0.5;      // odds a SEARING blow ignites
const SEAR_BURN_T = 2.5;      // seconds of BRAND when it does

function spawnEnemy(type, x, y) {
  const T = ETYPES[type];
  const s = diffScale() * (Game.hardMode ? 1.5 : 1);   // HARD: half again the vitality
  const e = { type, x, y, r: T.r, hp: T.hp * s, maxHp: T.hp * s,
    speed: T.speed * (1 + depth() * 0.04), color: T.color,
    vx: 0, vy: 0, slowMul: 1, slowT: 0, burnT: 0, burnDps: 0, burnTick: 0,
    hitFlash: 0, spawnT: 0.7, ambush: false, ghost: false, boss: false, buffed: false, wrath: false,
    rime: false, sear: false };
  /* bodies bound to a warden (phylacteries, reflections, the posse) are never empowered */
  const bound = T.bound || type === "phylactery" || type === "reflection" || type === "hollow";
  if (!bound && Game.wave >= BUFF_WAVE && Math.random() < buffChance()) {
    e.buffed = true; e.hp *= 2; e.maxHp *= 2;
  }
  if (!bound && Game.wave >= BUFF_WAVE && Math.random() < buffChance()) {
    e.wrath = true;
  }
  /* the elements share one roll and split it — ice and fire never wear the same body.
     The Stilled Hour is the RIMEBOUND omen's home: there the roll favours ice 3:1. */
  if (!bound && Game.wave >= BUFF_WAVE && Math.random() < buffChance()) {
    if (Game.mapIdx === 5) { if (Math.random() < 0.75) e.rime = true; else e.sear = true; } else
    if (Math.random() < 0.5) e.rime = true; else e.sear = true;
  }
  T.init(e);
  return assignId(e);
}

function wavePool() {
  const w = Game.wave;
  const pool = ["chaser", "chaser", "gunner"];
  if (w >= 2) pool.push("gunner", "dasher");
  if (w >= 3) pool.push("dasher", "slammer");
  if (w >= 4) pool.push("slammer", "spitter");
  if (w >= 6) pool.push("spitter");
  /* the floor's own horror, weighted in twice */
  const fe = floorDef().newEnemy;
  if (w >= 2 || depth() > 0) pool.push(fe, fe);
  /* the Ossuary fields a second horror: the shade drifts in, weighted once */
  if (Game.mapIdx === 1) pool.push("shade");
  /* the Hellforge fields a second horror: the slaghulk lumbers in, weighted once */
  if (Game.mapIdx === 2) pool.push("slag");
  /* the Drowned Nave fields a second horror: the riptide rolls in, weighted once */
  if (Game.mapIdx === 3) pool.push("riptide");
  /* the deep floors' second horrors: the lapse, the penitent, the carrion */
  if (Game.mapIdx === 5) pool.push("lapse");
  if (Game.mapIdx === 6) pool.push("penitent");
  if (Game.mapIdx === 7) pool.push("carrion");
  /* once you've lapped the catacomb, the floors' horrors roam everywhere */
  if (Game.loop >= 1) pool.push("wisp", "summoner", "shade", "cinder", "slag", "angler", "riptide");
  /* ...the deep floors' too, on a solo descent that has walked them (co-op laps after the Void) */
  if (Game.loop >= 1 && loopLen() === FLOORS.length) pool.push("mourner", "lapse", "lumen", "penitent", "drifter", "carrion");
  return pool;
}

function startWave() {
  Game.wave++;
  const raw = 4 + Math.floor(Game.wave * 1.8 + depth() * 1.5);
  const n = Math.max(1, Math.round(raw * (1 - partyWardCut())));
  if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("WAVE", "wave " + Game.wave + " started (" + n + " enemies)");
  const pool = wavePool();
  for (let i = 0; i < n; i++) {
    const p = openSpot(380, 200);
    enemies.push(spawnEnemy(pick(pool), p.x, p.y));
  }
  $("waveNum").textContent = ROMAN(Game.wave);
  const wb = $("waveBanner");
  wb.textContent = "WAVE " + ROMAN(Game.wave);
  wb.classList.remove("show"); void wb.offsetWidth; wb.classList.add("show");
  AudioFX.waveUp();
}

function triggerAmbush(chest) {
  chest.state = "ambush";
  const raw = 6 + Math.floor(Game.wave * 1.3 + depth() * 1.5);
  const n = Math.max(1, Math.round(raw * (1 - partyWardCut())));
  const pool = wavePool();
  let remaining = 0;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), d = rnd(160, 320);
    const x = clamp(chest.x + Math.cos(a) * d, 60, MAP.w - 60);
    const y = clamp(chest.y + Math.sin(a) * d, 60, MAP.h - 60);
    const e = spawnEnemy(pick(pool), x, y);
    e.ambush = true; e.spawnT = 1.0; remaining++;   // longer telegraph — the trap springs, fairly
    enemies.push(e);
    /* a red warning ring marks each eruption point */
    shockwaves.push({ x, y, r: 4, max: 46, speed: 90, dmg: 0,
      hostile: false, color: "#ff4d5e", hitSet: new Set() });
  }
  Game.ambush = { chest, remaining };
  /* the trap springs: a freeze-frame stinger and a wash of danger-red */
  screenFlash(0.25);
  Game.hitstop = Math.max(Game.hitstop, 0.06);
  Game.shake = Math.max(Game.shake, 10);
  AudioFX.chest();
  AudioFX.bossRoar();
  toast("THE SEAL BREAKS — SURVIVE");
}


