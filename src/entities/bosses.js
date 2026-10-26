/* =========================================================
   RUNEGUN · Wardens — the bosses
   Boss spawning, phase-transition map mutations, and the full per-boss attack state machine.
   ========================================================= */
"use strict";

/* =========================================================
   THE WARDENS — what sleeps under each grand seal
   Phase 1: patient rings of shot. Phase 2: it remembers how
   to charge. Phase 3: it stops being patient.
   ========================================================= */
// per-boss feel: Warden squishy+fast · Marrow King a relentless lich · Forge Tyrant a walking volcano · Drowned Monarch the patient tide · Event Horizon a slow inevitability
function bossProfile(kind) {
  return [
    { r: 38, hpMul: 0.86, spd: 86 },   // Chained Warden  — the jailer
    { r: 46, hpMul: 1.15, spd: 84 },   // Marrow King     — the lich
    { r: 54, hpMul: 1.85, spd: 66 },   // Forge Tyrant    — the volcano; extra tonnage since cover melts only when he walks
    { r: 48, hpMul: 1.6,  spd: 72 },   // Drowned Monarch — the tide
    { r: 46, hpMul: 1.9,  spd: 30 },   // Event Horizon   — the end
  ][kind] || DEEP_PROF[kind - 5];       // VI–VIII: the Hourglass Saint, the Thousandfold, the Other Gunslingers (deep.js)
}
function spawnBoss() {
  const F = floorDef();
  const kind = Game.mapIdx;
  const b = makeBoss(kind, SEAL.x, SEAL.y, 1);
  enemies.push(b);
  Game.boss = b;
  if (kind >= 5) deepBossInit(b);       // the deep wardens carry their own state (and the posse rides in)
  SEAL.state = "spent";
  $("bossName").textContent = F.boss + (Game.loop ? " +" + Game.loop : "");
  $("bossBar").classList.add("on");
  /* cinematic framing: letterbox bars slide in, the name card slams, the mix ducks */
  document.body.classList.add("bossOn");
  const bt = $("bossTitle");
  bt.textContent = F.boss;
  bt.classList.remove("show"); void bt.offsetWidth; bt.classList.add("show");
  AudioFX.duck();
  Game.shake = 14;
  AudioFX.bossRoar();
  const intro = ["THE CHAINED WARDEN WAKES — IT HUNGERS TO BIND YOU",
                 "THE MARROW KING RISES — YOUR BONES ARE HIS BIRTHRIGHT",
                 "THE FORGE TYRANT IGNITES — THE MOUNTAIN WALKS",
                 "THE DROWNED MONARCH SURFACES — THE DEEP CLAIMS ITS OWN",
                 "THE EVENT HORIZON OPENS — EVEN YOUR BULLETS BELONG TO IT"][kind] || DEEP_INTRO[kind - 5];
  toast(intro);
}

/* one warden of `kind` at (x, y), its vitality scaled to the current depth. hpMul
   trims it — THE UNKNOWN's challenge rounds send back echoes at 0.6. */
function makeBoss(kind, x, y, hpMul) {
  const prof = bossProfile(kind);
  const b = {
    type: "boss", boss: true, kind, x, y, r: prof.r,
    hp: 650 * prof.hpMul * (1 + depth() * 0.55) * (1 + Game.wave * 0.03) * (Game.hardMode ? 1.5 : 1) * hpMul,
    color: FLOORS[kind].wallGlow, score: 400,
    vx: 0, vy: 0, slowMul: 1, slowT: 0, burnT: 0, burnDps: 0, burnTick: 0,
    hitFlash: 0, spawnT: 1.4, ambush: false, ghost: false,
    speed: prof.spd, baseSpd: prof.spd, phase: 1, atk: "idle", at: 2, spin: 0, minionT: 6, spd: prof.spd,
    graves: [], vents: [], airborne: false,
    riverT: 6, hexT: 4.5, marks: [], raisedGraveyard: false,
    /* Marrow King */ shielded: false, siphonTick: 0, siphonHits: 0,
    /* Forge Tyrant */ meteors: [], aura: false, auraTick: 0, emberT: 0, cracks: [], carved: 0,
    /* Drowned Monarch */ submerged: false, tideAng: 0, tideX: 0, tideY: 0, flooded: false,
    /* Event Horizon */ stored: 0, feasting: false, wells: [], jetT: 0, jetAng: rnd(0, TAU), wobble: rnd(0, TAU), radT: 2.5,
  };
  b.maxHp = b.hp;
  return assignId(b);
}

/* The moment a warden finishes clawing its way in (its spawn telegraph ends):
   a hard jolt, twin shock-rings in its own colour and an erupting halo — so the
   arrival lands like the threat it is, not a quiet pop-in. */
function bossArrives(b) {
  Game.shake = Math.max(Game.shake, 18);
  AudioFX.slam();
  shockwaves.push({ x: b.x, y: b.y, r: b.r, max: 380, speed: 760, dmg: 0, hostile: false, hit: true, hitSet: new Set(), color: b.color });
  shockwaves.push({ x: b.x, y: b.y, r: b.r, max: 300, speed: 560, dmg: 0, hostile: false, hit: true, hitSet: new Set(), color: b.color, delay: 0.08 });
  for (let k = 0; k < 44; k++) {
    const a = k / 44 * TAU;
    particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * rnd(220, 460), vy: Math.sin(a) * rnd(220, 460),
      t: 0, life: rnd(0.45, 0.95), r: rnd(2, 6), color: b.color });
  }
  floatText(b.x, b.y - b.r - 26, "AWAKENS", b.color);
  if (b.kind >= 5) deepBossArrives(b);
  if (b.kind === 2) {
    /* the Hellforge answers its master: a heat wave rolls out from his landing
       and every rock barrier it touches runs into standing lava */
    igniteHellforge(b);
    AudioFX.forgeMelt();
    Game.shake = Math.max(Game.shake, 24);
    toast("THE HELLFORGE ANSWERS ITS MASTER — THE STONE ITSELF RUNS");
  }
}

/* signature map mutation + line whenever a boss crosses a phase gate */
function onBossPhase(b) {
  const lines = [
    ["THE WARDEN SLIPS ITS CHAINS", "THE WARDEN UNRAVELS — IT WILL BIND YOU"],
    ["THE MARROW KING RAISES A GRAVEYARD", "HIS SOUL FLEES INTO THREE VESSELS — SHATTER THEM"],
    ["THE FORGE TYRANT STOKES THE COALS", "MELTDOWN — HIS ARMOR FAILS, HIS FURY DOES NOT"],
    ["THE WATERS RISE — CHANNELS OPEN THROUGH THE NAVE", "THE NAVE FLOODS — THE DRY GROUND DROWNS"],
    ["THE HORIZON WIDENS — GRAVITY DEEPENS", "NOTHING ESCAPES — THE ARENA ITSELF IS DEVOURED"],
  ][b.kind];
  toast(b.phase === 2 ? lines[0] : lines[1]);

  if (b.kind === 0 && b.phase === 2) {
    /* Chained Warden: raise a loose cage of prison pillars around the heart */
    const n = 6, R = 360;
    for (let i = 0; i < n; i++) {
      const aa = i / n * TAU + rnd(-0.25, 0.25);
      raiseBossWall(MAP.w / 2 + Math.cos(aa) * R - 26, MAP.h / 2 + Math.sin(aa) * R - 46, 52, 92, 0.7);
    }
    AudioFX.slam(); Game.shake = 14;
    toast("PRISON PILLARS ERUPT FROM THE STONE");

  } else if (b.kind === 1 && b.phase === 2 && !b.raisedGraveyard) {
    /* Marrow King: the arena becomes a graveyard — tombstones + fresh graves.
       The tombstones matter: they're also your cover from his soul siphon. */
    b.raisedGraveyard = true;
    for (let i = 0; i < 9; i++) { const p = openSpot(150, 90); raiseBossWall(p.x - 16, p.y - 22, 32, 44, 0.3); }
    for (let i = 0; i < 3; i++) { const p = openSpot(180, 0); b.graves.push({ x: p.x, y: p.y, t: 0, life: 3.2 }); }
    AudioFX.slam(); Game.shake = 14;

  } else if (b.kind === 1 && b.phase === 3 && !b.scattered) {
    /* Marrow King: his soul scatters into three orbiting phylacteries.
       While any survive, he shrugs off most damage. One-shot: the soul
       only scatters once, however the phase gate is crossed. */
    b.scattered = true;
    for (let i = 0; i < 3; i++) {
      const ph = spawnEnemy("phylactery", b.x, b.y);
      ph.orbA = i / 3 * TAU; ph.spawnT = 0.3;
      enemies.push(ph);
    }
    b.shielded = true;
    AudioFX.bossRoar(); Game.shake = 14;

  } else if (b.kind === 2 && b.phase === 2) {
    /* Forge Tyrant: score a burning cross across the whole arena — the seams
       glow first, then split into lava that stands until he falls */
    b.cracks.push({ x1: 60, y1: MAP.h / 2, x2: MAP.w - 60, y2: MAP.h / 2, t: 0, life: 1.3 });
    b.cracks.push({ x1: MAP.w / 2, y1: 60, x2: MAP.w / 2, y2: MAP.h - 60, t: 0, life: 1.3 });
    toast("THE STONE GLOWS ALONG THE TYRANT'S CROSS — MOVE");
    AudioFX.slam(); Game.shake = 14;

  } else if (b.kind === 2 && b.phase === 3) {
    /* Forge Tyrant: MELTDOWN — armor plates blast off as a ring of shrapnel,
       he speeds up and radiates a searing heat aura */
    const n = 18;
    for (let i = 0; i < n; i++) {
      const aa = i / n * TAU;
      ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 310, vy: Math.sin(aa) * 310, r: 7, dmg: 14, t: 0, color: "#ffd23d" });
    }
    b.baseSpd += 55; b.aura = true;
    AudioFX.nova(); Game.shake = 16;

  } else if (b.kind === 3 && b.phase === 2) {
    /* Drowned Monarch: the quenching waters find their old channels — two
       flooded lanes cross the nave and stand until he falls */
    floodChannel(120, 200, MAP.w - 120, MAP.h - 200, Infinity);
    floodChannel(120, MAP.h - 200, MAP.w - 120, 200, Infinity);
    AudioFX.slam(); Game.shake = 14;

  } else if (b.kind === 3 && b.phase === 3 && !b.flooded) {
    /* Drowned Monarch: the nave itself floods — the rim drowns and the dry
       ground shrinks toward the middle, where he waits */
    b.flooded = true;
    const inset = 150, step = 170;
    for (let x = inset; x <= MAP.w - inset; x += step) {
      for (const y of [inset, MAP.h - inset])
        puddles.push({ x: x + rnd(-14, 14), y: y + rnd(-14, 14), r: rnd(70, 95), t: 0, life: Infinity, team: "e", dmg: 0, color: "#2ea8b8", tickMap: {}, water: true });
    }
    for (let y = inset + step; y <= MAP.h - inset - step; y += step) {
      for (const x of [inset, MAP.w - inset])
        puddles.push({ x: x + rnd(-14, 14), y: y + rnd(-14, 14), r: rnd(70, 95), t: 0, life: Infinity, team: "e", dmg: 0, color: "#2ea8b8", tickMap: {}, water: true });
    }
    AudioFX.bossRoar(); Game.shake = 16;

  } else if (b.kind === 4 && b.phase === 3) {
    /* Event Horizon: it eats the arena — every rock is torn loose and devoured */
    for (const rc of MAP.rocks.slice()) {
      for (let k = 0; k < 6; k++) {
        const px = rc.x + rnd(0, rc.w), py = rc.y + rnd(0, rc.h);
        const aa = angTo(px, py, b.x, b.y);
        particles.push({ x: px, y: py, vx: Math.cos(aa) * rnd(260, 520), vy: Math.sin(aa) * rnd(260, 520), t: 0, life: rnd(0.5, 1.1), r: rnd(3, 7), color: floorDef().rockTop });
      }
    }
    MAP.rocks.length = 0; Game.bossRocks.length = 0;
    AudioFX.bossRoar(); Game.shake = 18;
  }
}

function bossAI(b, dt) {
  /* THE UNKNOWN is moved, cast and staged by updateUnknown() (entities/unknown.js) */
  if (b.kind === UNK_KIND) { b.vx = b.vy = 0; return; }
  /* floors VI–VIII run their own wardens (entities/deep.js) */
  if (b.kind >= 5) { deepBossAI(b, dt); return; }
  /* the warden's quarry this tick: the nearest living player. Aura/pull attacks
     below still reach for EVERY living warden — only aim and pursuit use P. */
  const P = nearestPlayer(b.x, b.y);
  const frac = b.hp / b.maxHp;
  /* latched: a self-heal (Marrow King's siphon) must never regress the phase —
     re-crossing a gate would re-run onBossPhase (fresh phylacteries, re-shield) */
  const newPhase = Math.max(b.phase, frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3);
  if (newPhase !== b.phase) {
    b.phase = newPhase; b.at = 0.8; b.atk = "idle";
    b.feasting = false; b.bellowsFired = false; b.ghost = b.airborne;
    b.submerged = false; b.noclip = false;   // a phase gate hauls the Monarch back to the surface
    Game.shake = 12; AudioFX.bossRoar();
    onBossPhase(b);
  }

  /* ---- AIRBORNE: plunge flight, handled separately ---- */
  if (b.airborne) {
    b.vx = b.vy = 0;
    b.airT -= dt;
    /* Marrow King rains bone impacts during flight */
    if (b.kind === 1 && b.airDropsLeft > 0) {
      b.airDropT -= dt;
      if (b.airDropT <= 0) {
        b.airDropsLeft--;
        b.airDropT = 0.3;
        const aa = rnd(0, TAU), d = rnd(50, 210);
        const tx = clamp(b.airDst.x + Math.cos(aa) * d, 80, MAP.w - 80);
        const ty = clamp(b.airDst.y + Math.sin(aa) * d, 80, MAP.h - 80);
        shockwaves.push({ x: tx, y: ty, r: 6, max: 68, speed: 265, dmg: 13, hit: false, hostile: true, delay: 0.32 });
        for (let k = 0; k < 6; k++)
          particles.push({ x: tx + rnd(-12, 12), y: ty + rnd(-12, 12), vx: rnd(-50, 50), vy: rnd(-80, -20), t: 0, life: 0.35, r: 3, color: b.color });
      }
    }
    if (b.airT <= 0) {
      b.x = b.airDst.x; b.y = b.airDst.y;
      b.airborne = false; b.ghost = false;
      Game.shake = 18; AudioFX.slam();
      if (b.kind === 0) {
        /* Chained Warden lands: 3 shockwaves + 2 wisps tear through */
        for (let k = 0; k < 3; k++) shockwaves.push({ x: b.x, y: b.y, r: 10 + k * 6, max: 240 + k * 60, speed: 400 + k * 50, dmg: 20, hit: false, hostile: true, delay: k * 0.18 });
        for (let k = 0; k < 2; k++) {
          const aa = rnd(0, TAU);
          enemies.push(spawnEnemy("wisp", clamp(b.x + Math.cos(aa) * 130, 60, MAP.w - 60), clamp(b.y + Math.sin(aa) * 130, 60, MAP.h - 60)));
        }
        floatText(b.x, b.y - b.r - 20, "UNRAVELS", b.color);
      } else if (b.kind === 1) {
        /* Marrow King lands: massive shockwave + bone ring + chasers crawl out */
        shockwaves.push({ x: b.x, y: b.y, r: 10, max: 300, speed: 500, dmg: 26, hit: false, hostile: true });
        for (let k = 0; k < 12; k++) {
          const aa = k / 12 * TAU;
          ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 290, vy: Math.sin(aa) * 290, r: 7, dmg: 14, t: 0, color: b.color });
        }
        for (let k = 0; k < 3; k++) {
          const aa = rnd(0, TAU);
          enemies.push(spawnEnemy("chaser", clamp(b.x + Math.cos(aa) * 110, 60, MAP.w - 60), clamp(b.y + Math.sin(aa) * 110, 60, MAP.h - 60)));
        }
        floatText(b.x, b.y - b.r - 20, "RISE", b.color);
      } else {
        /* Forge Tyrant lands: shockwaves + lava pools + rivers blast outward */
        for (let k = 0; k < 3; k++) shockwaves.push({ x: b.x, y: b.y, r: 10 + k * 5, max: 260 + k * 80, speed: 420 + k * 60, dmg: 22, hit: false, hostile: true, delay: k * 0.2 });
        for (let k = 0; k < 6; k++) {
          const aa = k / 6 * TAU + rnd(-0.3, 0.3), d = rnd(40, 175);
          puddles.push({ x: b.x + Math.cos(aa) * d, y: b.y + Math.sin(aa) * d, r: rnd(40, 68), t: 0, life: 6, team: "e", dmg: 7, color: "#ff5e2e", tickMap: {}, lava: true });
        }
        for (let k = 0; k < 2; k++) { const aa = rnd(0, TAU); lavaRiver(b.x, b.y, clamp(b.x + Math.cos(aa) * 600, 60, MAP.w - 60), clamp(b.y + Math.sin(aa) * 600, 60, MAP.h - 60), 4.5); }
        floatText(b.x, b.y - b.r - 20, "ERUPTS", b.color);
      }
      b.atk = "idle"; b.at = 1.8;
    }
    return;
  }

  /* ---- map hazard ticks: graves/marks (Marrow King) / vents (Forge Tyrant) ---- */
  for (let i = b.graves.length - 1; i >= 0; i--) {
    const g = b.graves[i]; g.t += dt;
    if (g.t >= g.life) {
      for (let k = 0; k < 8; k++) {
        const aa = k / 8 * TAU;
        ebullets.push({ x: g.x, y: g.y, vx: Math.cos(aa) * 255, vy: Math.sin(aa) * 255, r: 6, dmg: 11, t: 0, color: b.color });
      }
      const aa = rnd(0, TAU);
      enemies.push(spawnEnemy("chaser", clamp(g.x + Math.cos(aa) * 55, 60, MAP.w - 60), clamp(g.y + Math.sin(aa) * 55, 60, MAP.h - 60)));
      AudioFX.chest(); Game.shake = Math.max(Game.shake, 7);
      floatText(g.x, g.y - 24, "ARISE", b.color);
      b.graves.splice(i, 1);
    }
  }
  for (let i = b.vents.length - 1; i >= 0; i--) {
    const v = b.vents[i]; v.t += dt;
    if (v.t >= v.life) {
      puddles.push({ x: v.x, y: v.y, r: rnd(52, 72), t: 0, life: 4.2, team: "e", dmg: 7, color: "#ff5e2e", tickMap: {}, lava: true });
      for (let k = 0; k < 14; k++)
        particles.push({ x: v.x + rnd(-16, 16), y: v.y + rnd(-16, 16), vx: rnd(-100, 100), vy: rnd(-180, -40), t: 0, life: rnd(0.4, 0.9), r: rnd(3, 7), color: "#ff5e2e" });
      Game.shake = Math.max(Game.shake, 6); AudioFX.slam();
      b.vents.splice(i, 1);
    }
  }

  /* ---- Forge Tyrant: ticking meteor strikes ---- */
  for (let i = b.meteors.length - 1; i >= 0; i--) {
    const m = b.meteors[i]; m.t += dt;
    if (m.t >= m.life) {
      shockwaves.push({ x: m.x, y: m.y, r: 6, max: 95, speed: 420, dmg: 16, hit: false, hostile: true });
      puddles.push({ x: m.x, y: m.y, r: rnd(40, 52), t: 0, life: 4, team: "e", dmg: 7, color: "#ff5e2e", tickMap: {}, lava: true });
      for (let k = 0; k < 10; k++)
        particles.push({ x: m.x + rnd(-14, 14), y: m.y + rnd(-14, 14), vx: rnd(-130, 130), vy: rnd(-200, -40), t: 0, life: rnd(0.4, 0.8), r: rnd(3, 6), color: pick(["#ff5e2e", "#ffd23d"]) });
      Game.shake = Math.max(Game.shake, 7); AudioFX.slam();
      b.meteors.splice(i, 1);
    }
  }

  /* ---- Forge Tyrant: carved seams — a glowing crack, then the floor splits
         into a river of lava that stands until he falls ---- */
  for (let i = b.cracks.length - 1; i >= 0; i--) {
    const c = b.cracks[i]; c.t += dt;
    if (c.t >= c.life) {
      lavaRiver(c.x1, c.y1, c.x2, c.y2, 999);
      Game.shake = Math.max(Game.shake, 9); AudioFX.slam();
      b.cracks.splice(i, 1);
    }
  }

  /* ---- Event Horizon: ticking singularity wells ---- */
  for (let i = b.wells.length - 1; i >= 0; i--) {
    const w = b.wells[i]; w.t += dt;
    if (w.t > w.delay) {
      /* live well: drags every warden in, bites at its heart */
      for (const p of alivePlayers()) {
        const d = Math.sqrt(dist2(w.x, w.y, p.x, p.y));
        if (d < 300 && p.dashT <= 0) {
          const aa = angTo(p.x, p.y, w.x, w.y);
          const pull = 200 * (1 - d / 300);
          p.x += Math.cos(aa) * pull * dt; p.y += Math.sin(aa) * pull * dt;
          if (d < 34) { w.bite = (w.bite || 0) - dt; if (w.bite <= 0) { w.bite = 0.45; hurtPlayer(p, 11, w); } }
        }
      }
      if (Math.random() < 0.5) {
        const sa = rnd(0, TAU), sd = rnd(40, 90);
        const sx2 = w.x + Math.cos(sa) * sd, sy2 = w.y + Math.sin(sa) * sd;
        const ia = angTo(sx2, sy2, w.x, w.y) + 1.1;
        particles.push({ x: sx2, y: sy2, vx: Math.cos(ia) * 160, vy: Math.sin(ia) * 160, t: 0, life: 0.45, r: rnd(1.5, 3), color: w.color || "#c9b8ff" });
      }
    }
    if (w.t >= w.delay + w.life) {
      shockwaves.push({ x: w.x, y: w.y, r: 6, max: 130, speed: 460, dmg: 16, hit: false, hostile: true });
      for (let k = 0; k < 8; k++) {
        const aa = k / 8 * TAU;
        ebullets.push({ x: w.x, y: w.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, r: 6, dmg: 11, t: 0, color: w.color || "#c9b8ff" });
      }
      AudioFX.nova(); Game.shake = Math.max(Game.shake, 8);
      b.wells.splice(i, 1);
    }
  }

  /* ---- Marrow King: track phylactery ward ---- */
  if (b.kind === 1 && b.phase >= 3) {
    const wasShielded = b.shielded;
    b.shielded = enemies.some(x => x.type === "phylactery" && !x.dead);
    if (wasShielded && !b.shielded) {
      toast("THE LAST VESSEL SHATTERS — HIS SOUL IS BARE");
      floatText(b.x, b.y - b.r - 22, "EXPOSED", "#fff");
      Game.shake = Math.max(Game.shake, 10);
    }
  }

  /* ---- Forge Tyrant: meltdown heat aura + chimney embers ---- */
  if (b.kind === 2) {
    b.emberT -= dt;
    if (b.emberT <= 0) {
      b.emberT = 0.18;
      particles.push({ x: b.x + rnd(-b.r * 0.6, b.r * 0.6), y: b.y - b.r * 0.5, vx: rnd(-25, 25), vy: rnd(-130, -60), t: 0, life: rnd(0.5, 1), r: rnd(2, 4), color: pick(["#ff5e2e", "#ffd23d", "#3a3a3a"]) });
    }
    if (b.aura) {
      b.auraTick -= dt;
      if (b.auraTick <= 0) {
        for (const p of alivePlayers()) {
          if (dist2(b.x, b.y, p.x, p.y) < 150 * 150 && p.dashT <= 0) {
            b.auraTick = 0.5;
            hurtPlayer(p, 6, b);
            applyCurse(p, "brand", 2, false);
          }
        }
      }
    }
  }

  /* ---- Event Horizon: constant gravity + infalling starlight ---- */
  if (b.kind === 4) {
    b.wobble += dt;
    if (Game.state === "play") for (const p of alivePlayers()) {
      const d = Math.sqrt(dist2(b.x, b.y, p.x, p.y));
      if (d < 820 && p.dashT <= 0) {
        const aa = angTo(p.x, p.y, b.x, b.y);
        const base = (b.feasting ? 215 : 95) + (b.phase - 1) * 38;
        const pull = base * (1 - d / 820);
        p.x += Math.cos(aa) * pull * dt; p.y += Math.sin(aa) * pull * dt;
      }
    }
    if (Math.random() < (b.feasting ? 0.9 : 0.45)) {
      const sa = rnd(0, TAU), sd = rnd(b.r + 60, b.r + 220);
      const sx2 = b.x + Math.cos(sa) * sd, sy2 = b.y + Math.sin(sa) * sd;
      const ia = angTo(sx2, sy2, b.x, b.y) + 0.9;
      particles.push({ x: sx2, y: sy2, vx: Math.cos(ia) * rnd(150, 260), vy: Math.sin(ia) * rnd(150, 260), t: 0, life: rnd(0.3, 0.6), r: rnd(1.5, 3.5), color: pick(["#c9b8ff", "#ffd23d", "#fff"]) });
    }
    /* stolen light escapes in aimed slivers — a steady drip of shot between
       its attacks, quickening as the horizon widens. Not while it feasts:
       feasting, everything falls IN. */
    if (b.atk !== "feast") {
      b.radT -= dt;
      if (b.radT <= 0) {
        b.radT = clamp(2.6 - b.phase * 0.45, 1.2, 2.6);
        const n = 1 + b.phase;
        const pa = angTo(b.x, b.y, P.x, P.y);
        for (let i = 0; i < n; i++) {
          const aa = pa + (i - (n - 1) / 2) * 0.14;
          ebullets.push({ x: b.x + Math.cos(aa) * (b.r + 8), y: b.y + Math.sin(aa) * (b.r + 8),
            vx: Math.cos(aa) * 300, vy: Math.sin(aa) * 300, r: 6, dmg: 12, t: 0, color: pick(["#c9b8ff", "#fff3c8"]) });
        }
        AudioFX.zap();
      }
    }
  }

  /* ---- signature passive timers ---- */
  if (b.kind === 0) {
    /* Warden periodically interrupts to HEX the player */
    b.hexT -= dt;
    if (b.hexT <= 0 && b.atk === "idle") {
      b.hexT = clamp(10 - b.phase * 1.6, 4.5, 10);
      b.atk = "hex"; b.at = 0.9; b.hexFired = false;
    }
  } else if (b.kind === 2 && b.phase >= 2) {
    /* Tyrant carves the arena apart: seams are scored across the floor, glow,
       then split into standing lava. The ground he takes stays taken — capped
       so a long fight leaves a maze of fire, not an unwinnable lake. */
    b.riverT -= dt;
    if (b.riverT <= 0 && b.carved < 6) {
      b.riverT = clamp(7 - b.phase * 1.5, 3, 7);
      const cxp = rnd(MAP.w * 0.3, MAP.w * 0.7), cyp = rnd(MAP.h * 0.3, MAP.h * 0.7);
      const carve = ang => {
        b.carved++;
        b.cracks.push({ x1: cxp - Math.cos(ang) * 650, y1: cyp - Math.sin(ang) * 650,
                        x2: cxp + Math.cos(ang) * 650, y2: cyp + Math.sin(ang) * 650, t: 0, life: 1.15 });
      };
      const aa = rnd(0, TAU);
      carve(aa);
      /* meltdown: he scores a second seam crossing the first */
      if (b.phase >= 3 && b.carved < 6) carve(aa + Math.PI / 2 + rnd(-0.3, 0.3));
      toast("THE TYRANT SCORES THE STONE — IT WILL RUN MOLTEN");
      AudioFX.zap(); Game.shake = Math.max(Game.shake, 6);
    }
  }

  b.spd = b.baseSpd + (b.phase - 1) * 30;
  b.at -= dt;
  const a = angTo(b.x, b.y, P.x, P.y);

  /* ---- IDLE: drift toward player, pick next attack ---- */
  if (b.atk === "idle") {
    b.vx = Math.cos(a) * b.spd * b.slowMul;
    b.vy = Math.sin(a) * b.spd * b.slowMul;
    if (b.at <= 0) {
      let opts;
      if (b.kind === 0) {            /* CHAINED WARDEN — teleporting jailer */
        opts = ["blink", "hexbolt", "ring"];
        if (b.phase >= 2) opts.push("grasp", "spiral", "blink");
        if (b.phase >= 3) opts.push("plunge", "grasp");
      } else if (b.kind === 1) {     /* MARROW KING — the lich */
        opts = ["grave", "helix", "burst", "siphon"];
        if (b.phase >= 2) opts.push("converge", "mark", "reap", "summonwave");
        if (b.phase >= 3) opts.push("plunge", "reap", "siphon");
      } else if (b.kind === 2) {     /* FORGE TYRANT — the walking volcano */
        opts = ["sweep", "vent", "meteor", "burst"];
        if (b.phase >= 2) opts.push("hammer", "bellows", "fissure", "eruption");
        if (b.phase >= 3) opts.push("plunge", "bellows", "fissure");
      } else if (b.kind === 3) {     /* DROWNED MONARCH — the patient tide */
        opts = ["submerge", "tide", "burst", "ring"];
        if (b.phase >= 2) opts.push("whirlpool", "submerge", "tide");
        if (b.phase >= 3) opts.push("whirlpool", "submerge", "tide");
      } else {                       /* EVENT HORIZON — the end of light */
        opts = ["jets", "feast", "sing", "ring"];
        if (b.phase >= 2) opts.push("wormhole", "sing", "feast");
        if (b.phase >= 3) opts.push("jets", "wormhole", "feast");
      }
      b.atk = pick(opts);
      if      (b.atk === "spiral")     b.at = 1.8;
      else if (b.atk === "hammer")     b.at = 0.7;
      else if (b.atk === "blink")      b.at = 0.55;
      else if (b.atk === "grasp")      b.at = 0.6;
      else if (b.atk === "hexbolt")    b.at = 0.4;
      else if (b.atk === "grave")      b.at = 0.35;
      else if (b.atk === "mark")       b.at = 0.3;
      else if (b.atk === "summonwave") b.at = 0.7;
      else if (b.atk === "converge")   { b.at = 1.2; b.convergeShot = false; b.convergePos = { x: P.x, y: P.y }; }
      else if (b.atk === "vent")       b.at = 0.35;
      else if (b.atk === "eruption")   b.at = 0.8;
      else if (b.atk === "sweep")      { b.at = 0; b.sweepT = 0; b.sweepFireT = 0; b.sweepBaseAng = a - TAU * 0.3; }
      else if (b.atk === "plunge")     b.at = 0.65;
      /* Marrow King */
      else if (b.atk === "helix")      { b.at = 1.7; b.spin = a; b.st = 0; }
      else if (b.atk === "siphon")     { b.at = 2.4; b.siphonTick = 0.25; b.siphonHits = 0; floatText(b.x, b.y - b.r - 20, "HE REACHES FOR YOUR SOUL", b.color); }
      else if (b.atk === "reap")       b.at = 0.55;
      /* Forge Tyrant */
      else if (b.atk === "meteor")     b.at = 0.4;
      else if (b.atk === "bellows")    { b.at = 1.15; floatText(b.x, b.y - b.r - 20, "HE INHALES", b.color); }
      else if (b.atk === "fissure")    { b.at = 0.75; b.fissAng = a; }
      /* Drowned Monarch */
      else if (b.atk === "submerge")   b.at = 0.6;
      else if (b.atk === "tide")       { b.at = 0.9; b.tideAng = a; b.tideX = P.x; b.tideY = P.y; floatText(b.x, b.y - b.r - 20, "THE SEA REARS", b.color); }
      else if (b.atk === "whirlpool")  b.at = 0.5;
      /* Event Horizon */
      else if (b.atk === "jets")       { b.at = 2.3; b.jetT = 0; b.jetAng = rnd(0, TAU); }
      else if (b.atk === "feast")      { b.at = 2.7; b.feasting = true; floatText(b.x, b.y - b.r - 26, "FEED IT IF YOU DARE", b.color); AudioFX.bossRoar(); }
      else if (b.atk === "sing")       b.at = 0.45;
      else if (b.atk === "wormhole")   b.at = 0.6;
      else b.at = 0.1;
    }

  /* ---- SHARED PRIMITIVES: ring, burst, spiral ---- */
  } else if (b.atk === "ring") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const n = 14 + b.phase * 2, off = rnd(0, TAU);
      for (let i = 0; i < n; i++) {
        const aa = off + i / n * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 240, vy: Math.sin(aa) * 240, r: 7, dmg: 13, t: 0, color: b.color });
      }
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = clamp(2.6 - b.phase * 0.4, 1, 3);
    }
  } else if (b.atk === "burst") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      for (let i = -1; i <= 1; i++) {
        const aa = a + i * 0.16;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 340, vy: Math.sin(aa) * 340, r: 7, dmg: 13, t: 0, color: b.color });
      }
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 1.6;
    }
  } else if (b.atk === "spiral") {
    b.vx = b.vy = 0;
    b.spin += dt * 5.2;
    b.st = (b.st || 0) - dt;
    if (b.st <= 0) {
      b.st = 0.09;
      for (let k = 0; k < 2; k++) {
        const aa = b.spin + k * Math.PI;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, r: 6, dmg: 11, t: 0, color: b.color });
      }
    }
    if (b.at <= 0) { b.atk = "idle"; b.at = 1.8; }

  /* ============ CHAINED WARDEN (kind 0) — bind & hex ============ */
  /* blink: intangible teleport, erupts a homing ring at the new spot */
  } else if (b.atk === "blink") {
    b.vx = b.vy = 0; b.ghost = true;
    if (b.at <= 0) {
      b.ghost = false;
      for (let k = 0; k < 18; k++) {
        const ba = rnd(0, TAU);
        particles.push({ x: b.x, y: b.y, vx: Math.cos(ba) * rnd(50, 130), vy: Math.sin(ba) * rnd(50, 130), t: 0, life: rnd(0.3, 0.7), r: rnd(3, 7), color: b.color });
      }
      const p = openSpot(160, 0);
      b.x = p.x; b.y = p.y;
      for (let k = 0; k < 10; k++) {
        const aa = k / 10 * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 250, vy: Math.sin(aa) * 250, r: 6, dmg: 12, t: 0, color: b.color, homing: 1.0 });
      }
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 1.8;
    }
  /* hexbolt: fast, sharply-homing aimed volley */
  } else if (b.atk === "hexbolt") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const n = 3 + b.phase;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.16;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 330, vy: Math.sin(aa) * 330, r: 7, dmg: 13, t: 0, color: b.color, homing: 1.5 });
      }
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 1.5;
    }
  /* grasp: a chain snaps taut and YANKS the quarry in, then cages them in bullets */
  } else if (b.atk === "grasp") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const pa = angTo(P.x, P.y, b.x, b.y);
      P.x += Math.cos(pa) * 150; P.y += Math.sin(pa) * 150;
      collideWorld(P);
      floatText(P.x, P.y - 26, "BOUND", b.color);
      Game.shake = Math.max(Game.shake, 9); AudioFX.slam();
      for (let k = 0; k < 8; k++) {
        const aa = k / 8 * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 150, vy: Math.sin(aa) * 150, r: 9, dmg: 14, t: 0, color: b.color });
      }
      for (let i = -2; i <= 2; i++) {
        const aa = angTo(b.x, b.y, P.x, P.y) + i * 0.18;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 300, vy: Math.sin(aa) * 300, r: 7, dmg: 12, t: 0, color: b.color, homing: 1.2 });
      }
      b.atk = "idle"; b.at = 2.0;
    }
  /* hex: channels, then lays a random CURSE on the quarry + a homing ring */
  } else if (b.atk === "hex") {
    b.vx = b.vy = 0;
    if (!b.hexFired && b.at <= 0.2) {
      const opts = b.phase >= 3 ? ["jam", "weight", "shroud"] : ["jam", "weight"];
      applyCurse(P, pick(opts), b.phase >= 3 ? 7 : 5.5);
      for (let k = 0; k < 12; k++) {
        const aa = k / 12 * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 220, vy: Math.sin(aa) * 220, r: 6, dmg: 10, t: 0, color: b.color, homing: 0.8 });
      }
      b.hexFired = true;
    }
    if (b.at <= 0) { b.atk = "idle"; b.at = 2.2; }

  /* ============ MARROW KING (kind 1) — graves & adds ============ */
  /* grave: stamps a death-mark on the floor — after 2.8s it erupts */
  } else if (b.atk === "grave") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const p = openSpot(80, 0);
      b.graves.push({ x: p.x, y: p.y, t: 0, life: 2.8 });
      floatText(p.x, p.y - 22, "MARK", b.color);
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 2.0;
    }
  /* mark: stamps a fast grave right under the quarry — move or be buried */
  } else if (b.atk === "mark") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      b.graves.push({ x: P.x, y: P.y, t: 0, life: 1.5 });
      floatText(P.x, P.y - 22, "MARKED", b.color);
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 1.6;
    }
  /* summonwave: tears a ring of the dead out of the ground */
  } else if (b.atk === "summonwave") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const n = 4 + b.phase;
      for (let i = 0; i < n; i++) {
        const aa = rnd(0, TAU), d = rnd(90, 190);
        enemies.push(spawnEnemy(pick(["chaser", "dasher"]), clamp(b.x + Math.cos(aa) * d, 60, MAP.w - 60), clamp(b.y + Math.sin(aa) * d, 60, MAP.h - 60)));
      }
      floatText(b.x, b.y - b.r - 18, "ARISE", b.color);
      AudioFX.chest(); Game.shake = Math.max(Game.shake, 8);
      b.atk = "idle"; b.at = 2.6;
    }
  /* converge: rings a spot around the player and fires inward — stand off-centre */
  } else if (b.atk === "converge") {
    b.vx = b.vy = 0;
    if (!b.convergeShot && b.at <= 0.35) {
      const cx2 = b.convergePos.x, cy2 = b.convergePos.y;
      for (let k = 0; k < 8; k++) {
        const aa = k / 8 * TAU;
        const sx = cx2 + Math.cos(aa) * 340, sy = cy2 + Math.sin(aa) * 340;
        const da = angTo(sx, sy, cx2, cy2);
        ebullets.push({ x: sx, y: sy, vx: Math.cos(da) * 320, vy: Math.sin(da) * 320, r: 7, dmg: 16, t: 0, color: b.color });
      }
      AudioFX.enemyShoot();
      b.convergeShot = true;
    }
    if (b.at <= 0) { b.convergeShot = false; b.convergePos = null; b.atk = "idle"; b.at = 2.2; }

  /* ============ FORGE TYRANT (kind 2) — burn the arena ============ */
  /* vent: plants a heat vent — 1.8s later it blooms into a lava pool */
  } else if (b.atk === "vent") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const p = openSpot(80, 0);
      b.vents.push({ x: p.x, y: p.y, t: 0, life: 1.8 });
      for (let k = 0; k < 8; k++)
        particles.push({ x: p.x + rnd(-18, 18), y: p.y + rnd(-18, 18), vx: rnd(-30, 30), vy: rnd(-75, -20), t: 0, life: 0.6, r: 3, color: "#ff5e2e" });
      floatText(p.x, p.y - 22, "VENT", b.color);
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 2.2;
    }
  /* sweep: 0.45s wind-up, then a molten spray rotates across 216 degrees */
  } else if (b.atk === "sweep") {
    b.vx = b.vy = 0;
    b.sweepT += dt; b.sweepFireT -= dt;
    const telegraphDur = 0.45, sweepDur = 1.15, arc = TAU * 0.6;
    const fireT = b.sweepT - telegraphDur;
    if (fireT > 0 && fireT < sweepDur) {
      b.sweepAng = b.sweepBaseAng + (fireT / sweepDur) * arc;
      if (b.sweepFireT <= 0) {
        b.sweepFireT = 0.075;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(b.sweepAng) * 295, vy: Math.sin(b.sweepAng) * 295, r: 7, dmg: 14, t: 0, color: b.color });
        AudioFX.enemyShoot();
      }
    }
    if (b.sweepT >= telegraphDur + sweepDur) { b.sweepT = 0; b.atk = "idle"; b.at = 1.8; }
  /* hammer: a charge that drags a trail of molten slag and slams on impact */
  } else if (b.atk === "hammer") {
    if (b.at > 0.18) { b.vx = b.vy = 0; b.chargeAng = a; }
    else if (b.at > -0.6) {
      b.vx = Math.cos(b.chargeAng) * 600; b.vy = Math.sin(b.chargeAng) * 600;
      if (Math.random() < 0.55)
        puddles.push({ x: b.x, y: b.y, r: rnd(34, 46), t: 0, life: 3.5, team: "e", dmg: 7, color: "#ff5e2e", tickMap: {}, lava: true });
      for (const p of alivePlayers()) {
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r + 6) ** 2) { hurtPlayer(p, 22, b); applyCurse(p, "brand", 4, false); }
      }
    } else {
      shockwaves.push({ x: b.x, y: b.y, r: 10, max: 220, speed: 420, dmg: 18, hit: false, hostile: true });
      Game.shake = Math.max(Game.shake, 10); AudioFX.slam();
      b.atk = "idle"; b.at = 1.4;
    }
  /* eruption: the Tyrant slams and lava rivers radiate out beneath you */
  } else if (b.atk === "eruption") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      for (let k = 0; k < 3; k++) {
        const aa = a + k * (TAU / 3) + rnd(-0.3, 0.3);
        lavaRiver(b.x, b.y, clamp(b.x + Math.cos(aa) * 700, 60, MAP.w - 60), clamp(b.y + Math.sin(aa) * 700, 60, MAP.h - 60), 4.5);
      }
      shockwaves.push({ x: b.x, y: b.y, r: 10, max: 260, speed: 460, dmg: 20, hit: false, hostile: true });
      for (let k = 0; k < 14; k++) {
        const aa = k / 14 * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 250, vy: Math.sin(aa) * 250, r: 6, dmg: 12, t: 0, color: "#ff7a3d" });
      }
      floatText(b.x, b.y - b.r - 20, "ERUPTS", b.color);
      AudioFX.nova(); Game.shake = Math.max(Game.shake, 12);
      b.atk = "idle"; b.at = 2.2;
    }

  /* ============ MARROW KING — new arsenal ============ */
  /* helix: twin spiral arms of bone, denser and faster as phases climb */
  } else if (b.atk === "helix") {
    b.vx = b.vy = 0;
    b.spin += dt * (3.6 + b.phase * 0.7);
    b.st = (b.st || 0) - dt;
    if (b.st <= 0) {
      b.st = 0.08;
      for (let k = 0; k < 2; k++) {
        const aa = b.spin + k * Math.PI;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 275, vy: Math.sin(aa) * 275, r: 6, dmg: 12, t: 0, color: "#e8e2d0" });
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa + 0.35) * 215, vy: Math.sin(aa + 0.35) * 215, r: 5, dmg: 10, t: 0, color: b.color });
      }
    }
    if (b.at <= 0) { b.atk = "idle"; b.at = clamp(1.9 - b.phase * 0.2, 1.1, 1.9); }
  /* siphon: a soul-tether that drains you and FEEDS HIM — break line of sight
     behind his own tombstones to sever it */
  } else if (b.atk === "siphon") {
    b.vx = b.vy = 0;
    b.siphonTick -= dt;
    if (b.siphonTick <= 0) {
      b.siphonTick = 0.3;
      const d2p = dist2(b.x, b.y, P.x, P.y);
      if (d2p < 700 * 700 && !lineBlocked(b.x, b.y, P.x, P.y)) {
        if (P.dashT <= 0 && P.iframes <= 0 && !P.downed) {
          P.hp -= 4; Game.flawless = false;
          if (P === localPlayer()) screenFlash(0.1);
          if (P.hp <= 0) { P.hp = 0; downPlayer(P); if (Game.state !== "play") return; }
          updateHp();
          const heal = Math.min(14, b.maxHp - b.hp);
          b.hp += heal; b.siphonHits++;
          floatText(b.x, b.y - b.r - 14, "+" + Math.round(heal), "#7dff5e");
          for (let k = 0; k < 3; k++) {
            const t = rnd(0.1, 0.5);
            particles.push({ x: lerp(P.x, b.x, t) + rnd(-6, 6), y: lerp(P.y, b.y, t) + rnd(-6, 6),
              vx: (b.x - P.x) * 0.7, vy: (b.y - P.y) * 0.7, t: 0, life: 0.3, r: 2.5, color: "#b8d68a" });
          }
          AudioFX.zap();
        }
      } else if (d2p < 700 * 700) {
        /* line of sight broken — the tether snaps */
        floatText(b.x, b.y - b.r - 14, "SEVERED", "#fff");
        b.atk = "idle"; b.at = 1.6;
      }
    }
    if (b.at <= 0) { b.atk = "idle"; b.at = 1.8; }
  /* reap: the King scythes through your position, shedding walls of bone
     perpendicular to his flight */
  } else if (b.atk === "reap") {
    if (b.at > 0.18) { b.vx = b.vy = 0; b.chargeAng = a; }
    else if (b.at > -0.55) {
      b.vx = Math.cos(b.chargeAng) * 660; b.vy = Math.sin(b.chargeAng) * 660;
      b.st = (b.st || 0) - dt;
      if (b.st <= 0) {
        b.st = 0.07;
        for (const s of [-1, 1]) {
          const pa = b.chargeAng + s * Math.PI / 2;
          ebullets.push({ x: b.x, y: b.y, vx: Math.cos(pa) * 235, vy: Math.sin(pa) * 235, r: 5, dmg: 11, t: 0, color: "#e8e2d0" });
        }
      }
      contactHurt(b, 6, 20);
    } else {
      floatText(b.x, b.y - b.r - 18, "REAPED", b.color);
      b.atk = "idle"; b.at = 1.5;
    }

  /* ============ FORGE TYRANT — new arsenal ============ */
  /* meteor: calls a rain of molten rock — one on your head, the rest scattered close */
  } else if (b.atk === "meteor") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const n = 4 + b.phase;
      for (let i = 0; i < n; i++) {
        let tx, ty;
        /* the volley splits its attention between every living warden */
        const live = alivePlayers();
        const T = i === 0 || !live.length ? P : pick(live);
        if (i === 0) { tx = T.x; ty = T.y; }
        else { const aa = rnd(0, TAU), d = rnd(60, 280); tx = clamp(T.x + Math.cos(aa) * d, 70, MAP.w - 70); ty = clamp(T.y + Math.sin(aa) * d, 70, MAP.h - 70); }
        b.meteors.push({ x: tx, y: ty, t: 0, life: 1.0 + i * 0.13 });
      }
      floatText(P.x, P.y - 30, "THE SKY BURNS", b.color);
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 2.1;
    }
  /* bellows: he inhales — dragging you toward the furnace — then detonates.
     Dash AWAY during the pull or be caught in the blast */
  } else if (b.atk === "bellows") {
    b.vx = b.vy = 0;
    if (b.at > 0.15) {
      /* inhale: drag every warden + visible indrawn air */
      for (const p of alivePlayers()) {
        const d = Math.sqrt(dist2(b.x, b.y, p.x, p.y));
        if (d < 560 && p.dashT <= 0) {
          const aa = angTo(p.x, p.y, b.x, b.y);
          const pull = 250 * (1 - d / 620);
          p.x += Math.cos(aa) * pull * dt; p.y += Math.sin(aa) * pull * dt;
        }
      }
      if (Math.random() < 0.8) {
        const sa = rnd(0, TAU), sd = rnd(120, 340);
        const sx2 = b.x + Math.cos(sa) * sd, sy2 = b.y + Math.sin(sa) * sd;
        const ia = angTo(sx2, sy2, b.x, b.y);
        particles.push({ x: sx2, y: sy2, vx: Math.cos(ia) * 330, vy: Math.sin(ia) * 330, t: 0, life: 0.4, r: rnd(2, 4), color: "#ff8a3d" });
      }
    } else if (b.at > -10 && b.atk === "bellows" && b.at <= 0.15 && !b.bellowsFired) {
      b.bellowsFired = true;
      shockwaves.push({ x: b.x, y: b.y, r: 12, max: 330, speed: 520, dmg: 24, hit: false, hostile: true });
      const n = 16;
      for (let i = 0; i < n; i++) {
        const aa = i / n * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 300, vy: Math.sin(aa) * 300, r: 7, dmg: 13, t: 0, color: "#ff5e2e" });
      }
      for (let k = 0; k < 4; k++) {
        const aa = rnd(0, TAU), d = rnd(50, 170);
        puddles.push({ x: b.x + Math.cos(aa) * d, y: b.y + Math.sin(aa) * d, r: rnd(38, 56), t: 0, life: 5, team: "e", dmg: 7, color: "#ff5e2e", tickMap: {}, lava: true });
      }
      floatText(b.x, b.y - b.r - 22, "EXHALE", b.color);
      AudioFX.nova(); Game.shake = Math.max(Game.shake, 14);
      b.atk = "idle"; b.at = 2.0; b.bellowsFired = false;
    }
  /* fissure: telegraphs a crack aimed straight through you, then the floor
     splits along it — lava and a wave of fire racing both ways */
  } else if (b.atk === "fissure") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const fa = b.fissAng;
      lavaRiver(clamp(b.x - Math.cos(fa) * 200, 60, MAP.w - 60), clamp(b.y - Math.sin(fa) * 200, 60, MAP.h - 60),
                clamp(b.x + Math.cos(fa) * 850, 60, MAP.w - 60), clamp(b.y + Math.sin(fa) * 850, 60, MAP.h - 60), 5);
      for (const dir of [1, -0.25]) {
        for (let k = 0; k < 4; k++) {
          const sp = 200 + k * 70;
          ebullets.push({ x: b.x, y: b.y, vx: Math.cos(fa) * sp * dir, vy: Math.sin(fa) * sp * dir, r: 7, dmg: 13, t: 0, color: "#ffd23d" });
        }
      }
      floatText(b.x, b.y - b.r - 20, "THE FLOOR SPLITS", b.color);
      AudioFX.slam(); Game.shake = Math.max(Game.shake, 11);
      b.atk = "idle"; b.at = clamp(2.0 - b.phase * 0.2, 1.2, 2.0);
    }

  /* ============ EVENT HORIZON — the end of light ============ */
  /* jets: relativistic jets pour from its poles as it slowly rotates */
  } else if (b.atk === "jets") {
    b.vx = b.vy = 0;
    b.jetAng += dt * (0.85 + b.phase * 0.15);
    b.jetT -= dt;
    if (b.jetT <= 0) {
      b.jetT = 0.065;
      const arms = 2 + (b.phase >= 2 ? 1 : 0) + (b.phase >= 3 ? 1 : 0);
      for (let k = 0; k < arms; k++) {
        const aa = b.jetAng + k * TAU / arms;
        ebullets.push({ x: b.x + Math.cos(aa) * (b.r + 6), y: b.y + Math.sin(aa) * (b.r + 6),
          vx: Math.cos(aa) * 350, vy: Math.sin(aa) * 350, r: 6, dmg: 12, t: 0, color: pick(["#c9b8ff", "#fff"]) });
      }
      AudioFX.zap();
    }
    if (b.at <= 0) { b.atk = "idle"; b.at = 1.6; }
  /* feast: it opens wide — gravity surges and EVERY bullet that touches it is
     swallowed instead of dealing damage. Stop shooting, or arm it. */
  } else if (b.atk === "feast") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      b.feasting = false;
      b.atk = "disgorge"; b.at = 0.45;
      floatText(b.x, b.y - b.r - 26, "IT IS FULL", b.color);
    }
  /* disgorge: everything it swallowed comes back — wearing your colors */
  } else if (b.atk === "disgorge") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const total = 14 + Math.min(b.stored, 42);
      for (let i = 0; i < total; i++) {
        const aa = i / total * TAU + rnd(-0.06, 0.06);
        const sp = 240 + (i % 3) * 65;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, r: 6, dmg: 12, t: 0, color: "#fff3c8" });
      }
      const homers = Math.min(Math.floor(b.stored / 3), 10) + (b.phase >= 2 ? 2 : 0) + (b.phase >= 3 ? 4 : 0);
      for (let i = 0; i < homers; i++) {
        const aa = rnd(0, TAU);
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 290, vy: Math.sin(aa) * 290, r: 7, dmg: 13, t: 0, color: "#fff3c8", homing: 1.4 });
      }
      if (b.stored > 0) floatText(b.x, b.y - b.r - 22, "RETURNED TO SENDER ×" + b.stored, "#fff3c8");
      b.stored = 0;
      AudioFX.nova(); Game.shake = Math.max(Game.shake, 12);
      b.atk = "idle"; b.at = clamp(2.4 - b.phase * 0.3, 1.3, 2.4);
    }
  /* sing: tears open a lesser singularity where you stand — it pulls, bites,
     then collapses in a burst */
  } else if (b.atk === "sing") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const lead = 0.45;
      b.wells.push({ x: clamp(P.x + P.vx * lead, 80, MAP.w - 80),
                     y: clamp(P.y + P.vy * lead, 80, MAP.h - 80),
                     t: 0, delay: 0.85, life: 2.4 });
      if (b.phase >= 2) {
        const aa = rnd(0, TAU), d = rnd(140, 260);
        b.wells.push({ x: clamp(P.x + Math.cos(aa) * d, 80, MAP.w - 80),
                       y: clamp(P.y + Math.sin(aa) * d, 80, MAP.h - 80),
                       t: 0, delay: 1.1, life: 2.4 });
      }
      floatText(P.x, P.y - 30, "SPACE TEARS", b.color);
      AudioFX.portal();
      b.atk = "idle"; b.at = 2.0;
    }
  /* wormhole: it folds space — and trades places with YOU. Both ends erupt. */
  } else if (b.atk === "wormhole") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const px2 = P.x, py2 = P.y;
      P.x = b.x; P.y = b.y;
      b.x = px2; b.y = py2;
      collideWorld(P);
      P.iframes = Math.max(P.iframes, 0.8);
      for (const pt of [{ x: P.x, y: P.y }, { x: b.x, y: b.y }]) {
        for (let k = 0; k < 8; k++) {
          const aa = k / 8 * TAU + rnd(-0.1, 0.1);
          ebullets.push({ x: pt.x, y: pt.y, vx: Math.cos(aa) * 215, vy: Math.sin(aa) * 215, r: 6, dmg: 11, t: 0, color: b.color });
        }
        for (let k = 0; k < 12; k++)
          particles.push({ x: pt.x, y: pt.y, vx: rnd(-200, 200), vy: rnd(-200, 200), t: 0, life: 0.5, r: rnd(2, 5), color: "#c9b8ff" });
      }
      floatText(P.x, P.y - 30, "SPACE FOLDS", b.color);
      AudioFX.portal(); Game.shake = Math.max(Game.shake, 10);
      b.atk = "idle"; b.at = 1.8;
    }

  /* ============ DROWNED MONARCH (kind 3) — the patient tide ============ */
  /* submerge: he slips beneath the flood — untouchable — and becomes a wake */
  } else if (b.atk === "submerge") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      b.ghost = true; b.submerged = true; b.noclip = true;
      for (let k = 0; k < 20; k++) {
        const aa = rnd(0, TAU);
        particles.push({ x: b.x + Math.cos(aa) * rnd(0, b.r), y: b.y + Math.sin(aa) * rnd(0, b.r),
          vx: rnd(-60, 60), vy: rnd(-140, -30), t: 0, life: rnd(0.3, 0.7), r: rnd(2, 5), color: "#7de8e0" });
      }
      floatText(b.x, b.y - b.r - 20, "HE SLIPS BENEATH", b.color);
      AudioFX.dash();
      b.atk = "wake"; b.at = 2.0 + b.phase * 0.3;
    }
  /* wake: a ripple beneath the stone, closing fast — it slides under the pews */
  } else if (b.atk === "wake") {
    const wa = angTo(b.x, b.y, P.x, P.y);
    const ws = 240 + b.phase * 30;
    b.vx = Math.cos(wa) * ws; b.vy = Math.sin(wa) * ws;
    if (Math.random() < 0.5)
      particles.push({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r),
        vx: rnd(-25, 25), vy: rnd(-40, -10), t: 0, life: rnd(0.3, 0.6), r: rnd(1.5, 3.5), color: "#7de8e0" });
    if (b.at <= 0) { b.atk = "geyser"; b.at = 0.55; b.vx = b.vy = 0; }
  /* geyser: the warning ring tightens — then he erupts from below */
  } else if (b.atk === "geyser") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      b.ghost = false; b.submerged = false; b.noclip = false;
      shockwaves.push({ x: b.x, y: b.y, r: b.r, max: 250, speed: 480, dmg: 20, hit: false, hostile: true });
      for (let i = 0; i < 12; i++) {
        const aa = i / 12 * TAU;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, r: 6, dmg: 12, t: 0, color: "#7de8e0" });
      }
      puddles.push({ x: b.x, y: b.y, r: 70, t: 0, life: 5, team: "e", dmg: 0, color: "#2ea8b8", tickMap: {}, water: true });
      for (let k = 0; k < 26; k++) {
        const aa = rnd(0, TAU);
        particles.push({ x: b.x, y: b.y, vx: Math.cos(aa) * rnd(80, 300), vy: Math.sin(aa) * rnd(80, 300) - 120,
          t: 0, life: rnd(0.4, 0.9), r: rnd(2, 6), color: pick(["#7de8e0", "#2ea8b8", "#fff"]) });
      }
      floatText(b.x, b.y - b.r - 22, "GEYSER", b.color);
      AudioFX.slam(); Game.shake = Math.max(Game.shake, 12);
      b.atk = "idle"; b.at = 1.8;
    }
  /* tide: the sea rears and breaks — a marching wall of water with one narrow gap.
     The mark is LOCKED where you stood when he reared: moving during the wind-up
     is the dodge, or slip the gap once the wall is rolling. */
  } else if (b.atk === "tide") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      /* spawn shrinks toward the mark near arena walls, then clamps — the wave
         must materialise in bounds or the border cull silently swallows it */
      const inb = (x, y) => x > 40 && x < MAP.w - 40 && y > 40 && y < MAP.h - 40;
      let back = 380;
      while (back > 60 && !inb(b.tideX - Math.cos(b.tideAng) * back, b.tideY - Math.sin(b.tideAng) * back)) back -= 40;
      const ox = clamp(b.tideX - Math.cos(b.tideAng) * back, 40, MAP.w - 40);
      const oy = clamp(b.tideY - Math.sin(b.tideAng) * back, 40, MAP.h - 40);
      const fireWall = (spd, gapAt) => {
        const N = 25, spacing = 30;
        const px = Math.cos(b.tideAng + Math.PI / 2), py = Math.sin(b.tideAng + Math.PI / 2);
        for (let i = 0; i < N; i++) {
          if (i === gapAt || i === gapAt + 1) continue;   // the one dry seam in the wave
          const off = (i - (N - 1) / 2) * spacing;
          ebullets.push({ x: ox + px * off, y: oy + py * off,
            vx: Math.cos(b.tideAng) * spd, vy: Math.sin(b.tideAng) * spd, r: 7, dmg: 13, t: 0, color: "#7de8e0" });
        }
      };
      fireWall(210, 3 + Math.floor(rnd(0, 19)));
      if (b.phase >= 3) fireWall(160, 3 + Math.floor(rnd(0, 19)));   // a second, slower swell — gaps rarely align
      AudioFX.nova(); Game.shake = Math.max(Game.shake, 8);
      b.atk = "idle"; b.at = clamp(2.4 - b.phase * 0.3, 1.4, 2.4);
    }
  /* whirlpool: the water turns where you stand — it pulls, bites, then collapses */
  } else if (b.atk === "whirlpool") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      const lead = 0.45;
      b.wells.push({ x: clamp(P.x + P.vx * lead, 80, MAP.w - 80),
                     y: clamp(P.y + P.vy * lead, 80, MAP.h - 80),
                     t: 0, delay: 0.9, life: 2.6, color: "#7de8e0" });
      if (b.phase >= 2) {
        const aa = rnd(0, TAU), d = rnd(140, 260);
        b.wells.push({ x: clamp(P.x + Math.cos(aa) * d, 80, MAP.w - 80),
                       y: clamp(P.y + Math.sin(aa) * d, 80, MAP.h - 80),
                       t: 0, delay: 1.1, life: 2.6, color: "#7de8e0" });
      }
      floatText(P.x, P.y - 30, "THE WATER TURNS", b.color);
      AudioFX.portal();
      b.atk = "idle"; b.at = 2.0;
    }

  /* ---- PLUNGE (all bosses): brief shudder, then flies up and crashes down ---- */
  } else if (b.atk === "plunge") {
    b.vx = b.vy = 0;
    if (b.at <= 0) {
      b.airborne = true; b.ghost = true;
      b.airT = 2.2;
      b.airDst = { x: clamp(P.x + P.vx * 0.6, 100, MAP.w - 100), y: clamp(P.y + P.vy * 0.6, 100, MAP.h - 100) };
      if (b.kind === 1) { b.airDropT = 0.28; b.airDropsLeft = 6; }
      Game.shake = 10; AudioFX.bossRoar();
      floatText(b.x, b.y - b.r - 20, "ASCENDING", b.color);
    }
  }

  /* minion tide — Marrow King keeps a steady drip; others only when enraged */
  b.minionT -= dt;
  const summons = b.kind === 1 ? (b.phase >= 2) : (b.phase >= 3);
  if (summons && b.minionT <= 0) {
    b.minionT = b.kind === 1 ? 6.5 : 7.5;
    for (let i = 0; i < 3; i++) {
      const aa = rnd(0, TAU);
      const mtype = b.kind === 1 ? "chaser" : b.kind === 4 ? "wisp" : b.kind === 3 ? "angler" : pick(["chaser", "dasher"]);
      enemies.push(spawnEnemy(mtype,
        clamp(b.x + Math.cos(aa) * 120, 60, MAP.w - 60), clamp(b.y + Math.sin(aa) * 120, 60, MAP.h - 60)));
    }
    floatText(b.x, b.y - b.r - 18, b.kind === 4 ? "TORN FROM THE DARK" : b.kind === 3 ? "THE DEEP GIVES UP ITS DEAD" : "RISE", b.color);
  }
  if (!b.ghost) for (const p of alivePlayers()) {
    if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r + 2) ** 2) {
      hurtPlayer(p, b.kind === 4 ? 26 : 16, b);
      if (b.kind === 2) applyCurse(p, "brand", 3.5, false);   /* the Tyrant's touch ignites you */
    }
  }
}

