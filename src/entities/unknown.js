/* =========================================================
   RUNEGUN · THE UNKNOWN — the final stage past floor VIII
   The patient creature from the rift on floor I waits at the very bottom.
   When the Other Gunslingers fall (solo, first time) the rift tears open
   again (hud.js spawnPortal → rift.final), and stepping through lands here:
   the void floor, an abyss at its heart, no seal and no waves.

     walk   → you approach; it waits over the abyss, untouchable
     talk   → letterbox; it speaks five lines ([ E ] moves it along)
     reveal → the bar reads ?????? and scrambles into its name
     fight  → PHASE I  12,000 → 6,000  one rune at a time, 1.4s tell
     sink   → it sinks into the abyss, its HP locked at the gate
     round  → CHALLENGE I: the Chained Warden + the Forge Tyrant (echoes)
     rise   → it rises; PHASE II  6,000 → 3,000  two runes together
     ...    → CHALLENGE II: the Drowned Monarch + the Hourglass Saint
     fight  → PHASE III 3,000 → 0  a chord of three, a third from YOUR runes
     dying  → its runes scatter, a last line, then the ending (startEnding)

   Each rune's attack lives in unknown-runes.js; the art in draw-unknown.js.
   Solo only, like floors VI–VIII: co-op never reaches floor VIII.
   ========================================================= */
"use strict";

/* ease-out cubic: the game has no shared easing helper */
const unkEase = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const UNK_KIND = 8;                                   // boss kind: bestiary "boss:8", the bounty table, ACH[8]
const UNK_X = MAP.w / 2, UNK_Y = MAP.h / 2;            // the abyss sits where a grand seal would
const UNK_ABYSS_R = 112;
const UNK_HP = 12000;                                  // ×1.5 on a hard descent
/* per rune phase: runes per cast, the tell's glow time, the rest after a cast, and
   the HP band it fights in (fractions of max) — `floor` is the gate it locks at */
const UNK_PH = [null,
  { n: 1, windup: 1.4,  rest: 1.6, floor: 0.5,  top: 1 },
  { n: 2, windup: 1.1,  rest: 1.2, floor: 0.25, top: 0.5 },
  { n: 3, windup: 0.85, rest: 0.8, floor: 0,    top: 0.25 },
];
const UNK_ROUNDS = [null, [0, 2], [3, 5]];             // challenge round → the wardens it sends back
const UNK_ECHO_HP = 0.6;                               // they return at 60% of the HP they'd have at this depth
const UNK_TALK = [
  "Tread lightly, I told you.",
  "I carved you one more rune, traveller. I wanted to see what you'd make of it.",
  "Every warden fell. Even the star went dark for you.",
  "You've made it this far, but I'm afraid I cannot let you leave.",
  "Show me what you carved.",
];
const UNK_TALK_SKIPPED = "You walked past my door once. You won't walk past it twice.";   // never took the floor I rift
const UNK_SAY = {
  sink1: "You were never alone down here. Let me return what you broke.",
  rise1: "Still standing. Good.",
  sink2: "The deep remembers its own. So should you.",
  rise2: "Then it's only us.",
  death: "Go, then. Tread lightly.",
};
/* the shootable pieces its runes put on the field (drawn by draw-unknown.js) */
const UNK_MINIONS = new Set(["unkward", "unkorb", "unkhound", "unkwisp"]);
for (const t of UNK_MINIONS) DEEP_TYPES.add(t);

/* =========================================================
   ENTERING — the final rift drops you at the bottom of the arena
   ========================================================= */
function unkRockPlan() {
  /* a loose ring of stone around the abyss: cover for the TITHE, prey for the BOULDER */
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i + 0.5) / 8 * TAU, R = rnd(560, 740);
    const w = rnd(70, 130), h = rnd(70, 130);
    out.push({ x: UNK_X + Math.cos(a) * R * 1.25 - w / 2, y: UNK_Y + Math.sin(a) * R * 0.9 - h / 2, w, h, tone: rnd(0, 1) });
  }
  return out;
}
function makeUnknownBoss() {
  const hp = UNK_HP * (Game.hardMode ? 1.5 : 1);
  return assignId({
    type: "boss", boss: true, kind: UNK_KIND, x: UNK_X, y: UNK_Y - 18, r: 52, hp, maxHp: hp,
    color: "#c9b8ff", score: 400,
    vx: 0, vy: 0, slowMul: 1, slowT: 0, burnT: 0, burnDps: 0, burnTick: 0, hitFlash: 0, spawnT: 0,
    ambush: false, ghost: true, noclip: true, untargetable: false, airborne: false,
    phase: 1, atk: "idle", at: 0, spd: 0, baseSpd: 0, speed: 0,
    /* the shared boss-VFX pass reads these on every warden */
    graves: [], vents: [], meteors: [], cracks: [], wells: [], marks: [],
  });
}
function makeUnknownState(b, rocks) {
  const half = Math.ceil(RUNE_IDS.length / 2);
  return {
    stage: "walk", st: 0, phase: 1, boss: b, vis: 1, nameK: 0,
    /* every rune in the game orbits it in two rings, as it did in the rift */
    halo: RUNE_IDS.map((id, i) => {
      const inner = i % 2 === 0, j = inner ? i / 2 : (i - 1) / 2;
      return { id, a: j / (inner ? half : RUNE_IDS.length - half) * TAU + (inner ? 0 : 0.2),
        orbitR: inner ? 84 : 116, spin: inner ? 0.45 : -0.3, busy: false };
    }),
    /* the tell */
    casts: [], next: null, gap: 1.2, left: 0, gdur: 0, lastIds: [],
    /* what its runes leave behind (unknown-runes.js) */
    zones: [], timers: [], script: null, si: 0, sT: 0, aim: null, dashFrom: null, dashTo: null,
    sheenT: 0, brambleT: 0, brambleCd: 0, mend: null, tether: null, dark: null, coins: [], fields: [],
    reflSfxT: 0, boltSfxT: 0,
    /* the challenge rounds */
    echoes: [], clearT: -1, lockHit: false,
    line: null, lineI: -1, lineT: 0,
    rocks, boom: false,
    hud: { name: "", abyss: false, echo: false, w: [-1, -1], dead: [false, false] },
  };
}

function enterUnknown() {
  rift = null;
  Game.inUnknown = true;
  Game.inRift = false; Game.riftCreature = null; Game.riftPicks = null;
  const plan = unkRockPlan();
  MAP.rocks = plan.map(r => assignId(Object.assign({}, r)));
  enemies = []; bullets = []; ebullets = []; puddles = [];
  particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
  soulMotes = [];
  portal = null;
  Game.ambush = null; Game.boss = null; Game.shake = 0;
  Game.comboN = 0; Game.comboT = 0; Game.streakTier = -1;
  Game.bossRocks.length = 0;
  Game.chestsTotal = 0; Game.chestsOpened = 0;
  SEAL.state = "spent";                       // no seal here: it is already awake
  for (const p of players) {
    p.x = UNK_X + (p.idx ? 44 : 0); p.y = UNK_Y + 560;
    p.aim = -Math.PI / 2; p.dashT = 0; p.iframes = 1.5;
  }
  pets = [];
  for (const p of players) if (p.pet && PTYPES[p.pet]) pets.push(assignId(spawnPet(p.pet, p)));
  setupDeepFloor();                           // no ice and no star — but the Saint's echo needs the hour
  const b = makeUnknownBoss();
  enemies.push(b);
  Game.unk = makeUnknownState(b, plan);
  Game.floorFade = 1;
  $("mapName").textContent = "??????";
  updateSeals();
  unknownHud(false);
  $("bossBar").classList.remove("on");
  document.body.classList.remove("bossOn");
  setState("play");
  toast("YOU STEP INTO THE UNKNOWN — IT HAS BEEN WAITING");
  AudioFX.portal();
}

/* =========================================================
   THE STAGE — one tick per frame from update()
   ========================================================= */
function unkSay(txt, life) { if (Game.unk) Game.unk.line = { txt, t: 0, life: life || 3.2 }; }
function unkLater(d, fn) { Game.unk.timers.push({ d, fn }); }

function updateUnknown(dt) {
  const out = { hint: null, act: null };
  const U = Game.unk;
  if (!Game.inUnknown || !U) return out;
  const b = U.boss;
  U.st += dt;
  for (let i = U.timers.length - 1; i >= 0; i--) {
    const tm = U.timers[i]; tm.d -= dt;
    if (tm.d <= 0) { U.timers.splice(i, 1); tm.fn(); }
  }
  for (const h of U.halo) h.a += h.spin * dt * (U.stage === "dying" ? 3 : 1);
  if (U.line) { U.line.t += dt; if (U.line.t > U.line.life) U.line = null; }
  unkKeepOutOfAbyss();

  switch (U.stage) {
    case "walk": {
      unkHover(b, dt);
      const P = localPlayer();
      if (P && dist2(P.x, P.y, b.x, b.y) < 430 * 430) unkBeginTalk();
      break;
    }
    case "talk": {
      unkHover(b, dt);
      U.lineT += dt;
      if (U.lineT > 3.2) unkNextLine();
      else if (U.lineT > 0.5) { out.hint = "[ E ] LISTEN ON"; out.act = unkNextLine; }
      break;
    }
    case "reveal": {
      unkHover(b, dt);
      U.nameK = clamp((U.st - 0.3) / 0.9, 0, 1);
      if (U.st >= 1.4) unkStartFight();
      break;
    }
    case "fight": {
      if (U.script) unkRunScript(dt); else unkHover(b, dt);
      unkTickCasting(dt);
      b.untargetable = U.sheenT > 0;          // THE REFLECTION: auto-aim looks away; a hand-aimed shot still bounces
      if (U.lockHit) { U.lockHit = false; unkBeginSink(); }
      break;
    }
    case "sink": {
      U.vis = 1 - unkEase(clamp(U.st / 2.3, 0, 1));
      const k = 1 - Math.pow(0.08, dt);
      b.x = lerp(b.x, UNK_X, k); b.y = lerp(b.y, UNK_Y, k);
      if (U.st >= 2.6) unkBeginRound();
      break;
    }
    case "round": {
      b.x = UNK_X; b.y = UNK_Y;
      /* each echo wakes already in its second phase — its signature terrain and all */
      for (const e of U.echoes) if (!e.dead && e.spawnT <= 0 && !e.armed) { e.armed = true; unkEchoPhase(e, 2); }
      if (U.clearT >= 0) { U.clearT += dt; if (U.clearT >= 3.4) unkBeginRise(); }
      break;
    }
    case "rise": {
      U.vis = unkEase(clamp(U.st / 2.0, 0, 1));
      unkHover(b, dt);
      /* the rising shockwave shoves you back from the rim — it doesn't hurt */
      if (U.st < 0.5) for (const p of alivePlayers()) {
        const d = Math.sqrt(dist2(p.x, p.y, UNK_X, UNK_Y));
        if (d < 480 && d > 1 && p.dashT <= 0) {
          const a = angTo(UNK_X, UNK_Y, p.x, p.y), push = 760 * (1 - U.st / 0.5) * dt;
          p.x += Math.cos(a) * push; p.y += Math.sin(a) * push; collideWorld(p);
        }
      }
      if (U.st >= 2.2) {
        U.phase++; U.stage = "fight"; U.st = 0; U.vis = 1;
        U.gap = 1.0; U.next = null; U.lastIds = [];
        b.ghost = false;
      }
      break;
    }
    case "dying": {
      U.vis = 1 - unkEase(clamp((U.st - 2.0) / 1.2, 0, 1));
      for (const h of U.halo) h.orbitR += dt * 340 * clamp(U.st - 1.0, 0, 1);
      if (U.st < 2.0 && Math.random() < 0.5)
        particles.push({ x: b.x + rnd(-40, 40), y: b.y + rnd(-40, 40), vx: rnd(-200, 200), vy: rnd(-200, 200),
          t: 0, life: rnd(0.3, 0.7), r: rnd(2, 5), color: pick(["#c9b8ff", "#9d6bff", "#fff3c8"]) });
      if (U.st > 2.0 && !U.boom) {
        U.boom = true;
        for (let k = 0; k < 60; k++) {
          const a = rnd(0, TAU), sp = rnd(160, 460);
          particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rnd(0.5, 1.1), r: rnd(2, 6),
            color: pick(["#ffd23d", "#c9b8ff", "#fff3c8"]) });
        }
        shockwaves.push({ x: b.x, y: b.y, r: 20, max: 520, speed: 700, dmg: 0, hostile: false, hit: true, hitSet: new Set(), color: "#c9b8ff" });
        Game.shake = Math.max(Game.shake, 18); AudioFX.nova(); AudioFX.slam();
      }
      if (U.st >= 3.8) { U.stage = "done"; startEnding(); return out; }
      break;
    }
  }
  unkTickZones(dt);
  unkTickEffects(dt);
  unkTickBullets(dt);
  /* its body is a weapon when it leaves the abyss (THE RUSH, BLINKSTEP, THE SLICK) */
  if (U.stage === "fight" && !b.dead) for (const p of alivePlayers())
    if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r + 2) ** 2) hurtPlayer(p, 18, b);
  unknownHud(true);
  return out;
}

/* camera framing (update.js): frame the span from the rune over its head down to the
   warden — never pushing the warden out of the middle ~75% of the screen */
function unkCamFocus(P) {
  const U = Game.unk, b = U && U.boss;
  if (!b || U.stage === "round" || U.stage === "done") return P;
  const top = Math.min(b.y - UNK_CAST_Y - 70, P.y - 40), bot = Math.max(b.y + 70, P.y + 40);
  const ox = clamp((b.x - P.x) * 0.5, -VW * 0.32, VW * 0.32);
  const oy = clamp((top + bot) / 2 - P.y, -VH * 0.38, VH * 0.38);
  return { x: P.x + ox, y: P.y + oy };
}
/* the highest a readout over its head may sit: under the top of the screen and the letterbox */
function unkTopLimit(room) {
  const bar = document.body.classList.contains("unkTalk") ? 0.12 : document.body.classList.contains("bossOn") ? 0.06 : 0;
  return Game.cam.y + VH * bar + room;
}

/* it hovers over the abyss, drifting a little, never touching the floor */
function unkHover(b, dt) {
  const tx = UNK_X + Math.sin(Game.time * 0.37) * 46, ty = UNK_Y - 18 + Math.sin(Game.time * 0.53) * 16;
  const k = 1 - Math.pow(0.05, dt);
  b.x = lerp(b.x, tx, k); b.y = lerp(b.y, ty, k);
}
/* the abyss is a pit: nothing that walks may stand in it — until it is dead, and the
   abyss itself becomes the way down (hud.js spawnPortal opens the portal there) */
function unkKeepOutOfAbyss() {
  if (Game.unk.stage === "done") return;
  for (const p of players) {
    if (p.gone) continue;
    const d = Math.sqrt(dist2(p.x, p.y, UNK_X, UNK_Y)), min = UNK_ABYSS_R + p.r;
    if (d < min) {
      const a = d > 0.5 ? angTo(UNK_X, UNK_Y, p.x, p.y) : Math.PI / 2;
      p.x = UNK_X + Math.cos(a) * min; p.y = UNK_Y + Math.sin(a) * min;
    }
  }
}

/* ---------- the walk-up ---------- */
function unkBeginTalk() {
  const U = Game.unk;
  U.stage = "talk"; U.st = 0; U.lineI = -1;
  document.body.classList.add("unkTalk");
  AudioFX.duck();
  unkNextLine();
}
function unkNextLine() {
  const U = Game.unk;
  if (!U || U.stage !== "talk") return;
  U.lineI++; U.lineT = 0;
  if (U.lineI >= UNK_TALK.length) { unkReveal(); return; }
  const txt = U.lineI === 1 && !Game.riftDone ? UNK_TALK_SKIPPED : UNK_TALK[U.lineI];
  unkSay(txt, 3.4);
  AudioFX.murmur(85, Math.min(9, 3 + Math.floor(txt.length / 8)));
}
function unkReveal() {
  const U = Game.unk;
  U.stage = "reveal"; U.st = 0; U.line = null; U.nameK = 0;
  Game.boss = U.boss;
  document.body.classList.remove("unkTalk");
  document.body.classList.add("bossOn");
  $("bossBar").classList.add("on", "unk");
  $("bossName").textContent = "??????";
  $("mapName").textContent = "THE UNKNOWN";
}
function unkStartFight() {
  const U = Game.unk, b = U.boss;
  U.stage = "fight"; U.st = 0; U.phase = 1; U.gap = 1.0; U.nameK = 1;
  b.ghost = false;
  const bt = $("bossTitle");
  bt.textContent = "THE UNKNOWN";
  bt.classList.remove("show"); void bt.offsetWidth; bt.classList.add("show");
  toast("THE UNKNOWN UNFOLDS — EVERY RUNE ANSWERS TO IT");
  shockwaves.push({ x: b.x, y: b.y, r: b.r, max: 520, speed: 700, dmg: 0, hostile: false, hit: true, hitSet: new Set(), color: "#c9b8ff" });
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * TAU;
    particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * rnd(200, 420), vy: Math.sin(a) * rnd(200, 420), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 5), color: pick(["#c9b8ff", "#9d6bff", "#ffd23d"]) });
  }
  Game.shake = 14; AudioFX.bossRoar(); AudioFX.slam();
}

/* =========================================================
   THE TELL — a rune lifts out of the halo, glows over its head, then strikes
   ========================================================= */
const UNK_MOVES = new Set(["swift", "phase", "slime"]);                                   // runes that move its body
const UNK_RULES = new Set(["mirror", "bramble", "aegis", "bulwark", "leech", "mend", "dread", "midas", "stillpoint"]);   // runes that bend the fight
/* a rune whose last casting is still on the field waits its turn */
function unkBusy(id) {
  const U = Game.unk;
  if (UNK_MOVES.has(id) && U.script) return true;
  switch (id) {
    case "mirror": return U.sheenT > 0;
    case "bramble": return U.brambleT > 0;
    case "aegis": return enemies.some(e => e.type === "unkward" && !e.dead);
    case "bulwark": return enemies.some(e => e.type === "unkorb" && !e.dead);
    case "leech": return !!U.tether;
    case "mend": return !!U.mend;
    case "dread": return !!U.dark;
    case "midas": return U.coins.length > 0;
    case "stillpoint": return U.fields.length > 0;
  }
  return false;
}
/* PHASE III reads your path: a third of its picks come from your own sealed runes */
function unkYours() {
  const lp = localPlayer();
  if (!lp || Game.unk.phase < 3) return [];
  return (lp.lockedRunes || heldRuneIds(lp)).filter(id => UNK_RUNES[id]);
}
function unkPickGroup(n) {
  const U = Game.unk;
  const pool = RUNE_IDS.filter(id => UNK_RUNES[id] && UNK_RUNES[id].phase <= U.phase);
  const mine = unkYours();
  const out = []; let mv = 0, rl = 0;
  for (let tries = 0; out.length < n && tries < 300; tries++) {
    const id = mine.length && Math.random() < 0.34 ? pick(mine) : pick(pool);
    if (out.includes(id) || U.lastIds.includes(id) || unkBusy(id)) continue;
    if (UNK_MOVES.has(id) && mv) continue;
    if (UNK_RULES.has(id) && rl) continue;
    if (UNK_MOVES.has(id)) mv++;
    if (UNK_RULES.has(id)) rl++;
    out.push(id);
  }
  return out;
}
function unkHaloPos(h) {
  const U = Game.unk, b = U.boss, R = h.orbitR * (0.35 + 0.65 * U.vis);
  return { x: b.x + Math.cos(h.a) * R, y: b.y + Math.sin(h.a) * R * 0.9 };
}
const UNK_CAST_Y = 168;                                // how high over its head a rune hangs while it glows
/* where a glowing rune hangs: over its head — pulled down if that would leave the screen */
function unkCastAnchorY(b) { return Math.max(b.y - UNK_CAST_Y, unkTopLimit(96)); }
function unkCastPos(c) {
  const b = Game.unk.boss, k = unkEase(c.t / 0.3);
  return { x: lerp(c.from.x, b.x + c.off, k), y: lerp(c.from.y, unkCastAnchorY(b), k), k };
}
function unkStartGroup(ids) {
  const U = Game.unk, ph = UNK_PH[U.phase];
  if (!ids.length) { U.gap = 0.4; return; }
  const offs = ids.length === 1 ? [0] : ids.length === 2 ? [-66, 66] : [-120, 0, 120];
  const mine = unkYours();
  U.left = ids.length; U.gdur = 0;
  ids.forEach((id, i) => {
    const h = U.halo.find(q => q.id === id);
    if (h) h.busy = true;
    U.casts.push({ id, t: 0, windup: ph.windup, delay: ids.length === 3 ? i * 0.4 : 0, off: offs[i],
      from: h ? unkHaloPos(h) : { x: U.boss.x, y: U.boss.y }, fired: false, h, n: ids.length, yours: mine.includes(id) });
  });
  U.lastIds = ids.slice();
  U.next = unkPickGroup(ph.n);
  AudioFX.pane(ids.length > 1 ? 659 : 523);
}
function unkFire(c) {
  const U = Game.unk;
  c.fired = true; c.firedAt = c.t;
  const p = unkCastPos(c), col = RUNES[c.id].color;
  for (let k = 0; k < 18; k++) {
    const a = rnd(0, TAU), sp = rnd(80, 260);
    particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rnd(0.25, 0.55), r: rnd(2, 4), color: col });
  }
  U.zones.push({ type: "flare", x: p.x, y: p.y, t: 0, delay: 0, warn: 0, active: 0.35, c: col, hit: new Set() });
  let dur = 2;
  try { dur = UNK_RUNES[c.id].cast() || 2; } catch (err) { console.error("THE UNKNOWN —", c.id, err); }
  U.gdur = Math.max(U.gdur, dur);
  if (c.h) c.h.busy = false;
  if (--U.left <= 0) {
    const ph = UNK_PH[U.phase];
    U.gap = ph.rest + U.gdur * (ph.n === 1 ? 0.35 : 0.3);   // the next tell starts while the last attack still holds the floor
    U.gdur = 0;
  }
}
function unkTickCasting(dt) {
  const U = Game.unk;
  for (const c of U.casts) {
    c.t += dt;
    if (!c.fired && c.t >= 0.3 + c.windup + c.delay) unkFire(c);
  }
  U.casts = U.casts.filter(c => !c.fired || c.t - c.firedAt < 0.4);
  if (!U.casts.length) {
    U.gap -= dt;
    if (U.gap <= 0) {
      const next = (U.next || []).filter(id => !unkBusy(id));
      unkStartGroup(next.length === (U.next || []).length && next.length ? next : unkPickGroup(UNK_PH[U.phase].n));
    }
  }
}
/* every live thing its runes have put on the field, gone at once (a phase gate, its death) */
function unkClearCombat() {
  const U = Game.unk;
  for (const c of U.casts) if (c.h) c.h.busy = false;
  U.casts = []; U.next = null; U.left = 0; U.gdur = 0;
  U.zones = []; U.timers = []; U.script = null; U.aim = null;
  U.sheenT = 0; U.brambleT = 0; U.mend = null; U.tether = null; U.dark = null; U.coins = []; U.fields = [];
  if (U.boss) U.boss.untargetable = false;
  for (const e of enemies) if (UNK_MINIONS.has(e.type)) e.dead = true;
  ebullets.length = 0;
  for (let i = puddles.length - 1; i >= 0; i--) if (puddles[i].team === "e") puddles.splice(i, 1);
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].hostile) shockwaves.splice(i, 1);
}

/* ---------- its body leaves the abyss: THE RUSH, BLINKSTEP, THE SLICK ---------- */
function unkScript(steps) { const U = Game.unk; U.script = steps; U.si = -1; unkNextStep(); }
function unkNextStep() {
  const U = Game.unk, b = U.boss;
  U.si++; U.sT = 0;
  const st = U.script && U.script[U.si];
  if (!st) { U.script = null; U.aim = null; return; }
  if (st.type === "blink") {
    unkBlinkFx(b.x, b.y);
    const to = st.to || { x: UNK_X, y: UNK_Y - 18 };
    b.x = to.x; b.y = to.y;
    unkBlinkFx(b.x, b.y);
    AudioFX.dash();
    if (st.then) st.then();
    unkNextStep();
  } else if (st.type === "path") {
    st.lastX = b.x; st.lastY = b.y;
  } else if (st.type === "home") {
    st.from = { x: b.x, y: b.y };
  }
}
function unkBlinkFx(x, y) {
  for (let k = 0; k < 16; k++) {
    const a = rnd(0, TAU);
    particles.push({ x, y, vx: Math.cos(a) * rnd(80, 220), vy: Math.sin(a) * rnd(80, 220), t: 0, life: rnd(0.3, 0.6), r: rnd(2, 5), color: "#7ad7ff" });
  }
}
function unkRunScript(dt) {
  const U = Game.unk, b = U.boss, st = U.script[U.si];
  if (!st) { U.script = null; return; }
  U.sT += dt;
  const k = st.dur ? clamp(U.sT / st.dur, 0, 1) : 1;
  if (st.type === "aim") {
    const P = nearestPlayer(b.x, b.y);
    U.aim = { c: st.c, x: P.x, y: P.y };
    if (k >= 1) {
      const a = angTo(b.x, b.y, P.x, P.y), dd = Math.sqrt(dist2(b.x, b.y, P.x, P.y)) + 110;
      U.dashFrom = { x: b.x, y: b.y };
      U.dashTo = { x: clamp(b.x + Math.cos(a) * dd, 80, MAP.w - 80), y: clamp(b.y + Math.sin(a) * dd, 80, MAP.h - 80) };
      U.aim = null; AudioFX.dash(); unkNextStep();
    }
  } else if (st.type === "dash") {
    const e = unkEase(k);
    b.x = lerp(U.dashFrom.x, U.dashTo.x, e); b.y = lerp(U.dashFrom.y, U.dashTo.y, e);
    particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, t: 0, life: 0.3, r: b.r * 0.7, color: "rgba(158,255,196,0.35)" });
    if (k >= 1) {
      U.zones.push({ type: "cut", x1: U.dashFrom.x, y1: U.dashFrom.y, x2: b.x, y2: b.y, w: 24, t: 0, delay: 0, warn: 0, active: 2,
        fade: 0.4, c: st.trail, dmg: 12, hit: new Set() });
      Game.shake = Math.max(Game.shake, 6);
      unkNextStep();
    }
  } else if (st.type === "wait") {
    if (k >= 1) unkNextStep();
  } else if (st.type === "path") {
    const n = st.pts.length - 1, f = k * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    b.x = lerp(st.pts[i].x, st.pts[i + 1].x, u); b.y = lerp(st.pts[i].y, st.pts[i + 1].y, u);
    /* the slick: a caustic pool every stride, standing for ten seconds */
    if (dist2(b.x, b.y, st.lastX, st.lastY) > 42 * 42) {
      st.lastX = b.x; st.lastY = b.y;
      puddles.push({ x: b.x, y: b.y, r: 38, t: 0, life: 10, team: "e", dmg: 5, color: "#86d020", tickMap: {} });
    }
    if (k >= 1) unkNextStep();
  } else if (st.type === "home") {
    const hx = UNK_X, hy = UNK_Y - 18;
    b.x = lerp(st.from.x, hx, unkEase(k)); b.y = lerp(st.from.y, hy, unkEase(k));
    if (k >= 1) unkNextStep();
  }
}

/* =========================================================
   DAMAGE — combat.js hands every hit on THE UNKNOWN through here
   ========================================================= */
function unknownDamage(e, dmg) {
  const U = Game.unk;
  if (!U || U.stage !== "fight") return 0;
  /* THE CARAPACE: four ward glyphs bleed 80% of every blow until they fall */
  if (enemies.some(w => w.type === "unkward" && !w.dead)) {
    dmg *= 0.2;
    if (Math.random() < 0.06) floatText(e.x, e.y - e.r - 20, "WARDED — BREAK THE GLYPHS", "#bcd0ff");
  }
  /* THE KNITTING: enough damage during the channel breaks it */
  if (U.mend) U.mend.dmg += dmg;
  /* THE RETORT: every wound bursts a barbed ring out of it */
  if (U.brambleT > 0 && U.brambleCd <= 0) {
    U.brambleCd = 0.45;
    shockwaves.push({ x: e.x, y: e.y, r: e.r, max: 260, speed: 620, dmg: 12, hit: false, hostile: true, color: "#ff6b8a" });
  }
  /* the gates: no burst skips a challenge round — the blow that crosses one stops at it */
  const floor = UNK_PH[U.phase].floor * e.maxHp;
  if (U.phase < 3 && e.hp - dmg <= floor) { dmg = Math.max(0, e.hp - floor); U.lockHit = true; }
  return dmg;
}
/* a heal never lifts it above the top of the phase it is fighting in */
function unkHeal(amt) {
  const U = Game.unk, b = U.boss;
  const top = UNK_PH[U.phase].top * b.maxHp;
  const got = Math.max(0, Math.min(amt, top - b.hp));
  b.hp += got;
  return got;
}
/* THE REFLECTION: is the sheen up, and does a player's shot bounce? */
function unkReflects(e) { const U = Game.unk; return !!(U && U.stage === "fight" && U.sheenT > 0); }
function unkReflect(e, b) {
  const U = Game.unk;
  ebullets.push({ x: b.x, y: b.y, vx: -b.vx * 0.7, vy: -b.vy * 0.7, r: 6, dmg: 10, t: 0, color: "#f3c4ff" });
  e.hitFlash = 0.06;
  if (Game.time - U.reflSfxT > 0.12) { U.reflSfxT = Game.time; AudioFX.pane(1046); }
}

/* =========================================================
   THE CHALLENGE ROUNDS — it hides; what you broke returns
   ========================================================= */
function unkBeginSink() {
  const U = Game.unk, b = U.boss;
  unkClearCombat();
  U.stage = "sink"; U.st = 0;
  b.ghost = true;
  unkSay(U.phase === 1 ? UNK_SAY.sink1 : UNK_SAY.sink2, 3.8);
  toast(U.phase === 1 ? "THE UNKNOWN SINKS — WHAT YOU BROKE RETURNS" : "THE UNKNOWN SINKS AGAIN — THE DEEP SENDS ITS OWN");
  AudioFX.bossRoar(); Game.shake = Math.max(Game.shake, 12);
}
function unkBeginRound() {
  const U = Game.unk, b = U.boss;
  U.stage = "round"; U.st = 0; U.vis = 0; U.clearT = -1;
  b.x = UNK_X; b.y = UNK_Y;
  const kinds = UNK_ROUNDS[U.phase];
  U.echoes = kinds.map((kind, i) => {
    /* they claw up out of the abyss's rim, one either side */
    const e = makeBoss(kind, UNK_X + (i ? 340 : -340), UNK_Y + (i ? 70 : -70), UNK_ECHO_HP);
    e.echo = true; e.phase = 2;
    enemies.push(e);
    if (kind >= 5) deepBossInit(e);
    return e;
  });
  toast(kinds.map(k => FLOORS[k].boss).join(" AND ") + " RISE FROM THE ABYSS");
  AudioFX.bossRoar(); Game.shake = Math.max(Game.shake, 14);
}
/* the phase hooks a warden normally runs when it crosses a gate (bosses.js / deep.js) */
function unkEchoPhase(e, ph) {
  e.phase = ph; e.at = 0.8; e.atk = "idle";
  e.feasting = false; e.bellowsFired = false; e.ghost = e.airborne; e.submerged = false; e.noclip = false;
  if (e.kind >= 5) { e.lances = []; e.stillOn = false; if (Game.deep) Game.deep.stillT = 0; deepBossPhase(e); }
  else onBossPhase(e);
}
/* bossSlain() routes an echo's death here: no ceremony — the survivor rages, or the round ends */
function unknownEchoFell(e) {
  const U = Game.unk;
  if (e.kind >= 5) deepBossCleanup(e);
  for (let k = 0; k < 3; k++)
    shockwaves.push({ x: e.x, y: e.y, r: 10, max: 160 + k * 80, speed: 640, dmg: 0, hostile: false, color: e.color, hitSet: new Set(), delay: k * 0.12 });
  floatText(e.x, e.y - e.r - 40, FLOORS[e.kind].boss + " FALLS AGAIN", e.color, 16, { outline: "#0b0b14", life: 1.6, vy: 18 });
  AudioFX.bossRoar();
  if (!U) return;
  const other = U.echoes.find(o => o !== e && !o.dead);
  if (other) unkEnrage(other);
  else unkRoundCleared();
}
function unkEnrage(o) {
  o.armed = true;
  if (o.phase < 3) unkEchoPhase(o, 3);
  o.baseSpd += 20;
  toast(FLOORS[o.kind].boss + " RAGES ALONE — ITS LAST PHASE");
  floatText(o.x, o.y - o.r - 30, "ENRAGED", "#ff3d2e", 18, { outline: "#0b0b14", life: 1.4, vy: 16 });
  Game.shake = Math.max(Game.shake, 12);
}
function unkRoundCleared() {
  const U = Game.unk;
  U.clearT = 0;
  /* the floor exhales: everything they left behind dies with them */
  for (const e of enemies) if (!e.boss && !e.dead) { e.hp = 0; e.dead = true; }
  ebullets.length = 0;
  for (let i = puddles.length - 1; i >= 0; i--) if (puddles[i].team === "e") puddles.splice(i, 1);
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].hostile) shockwaves.splice(i, 1);
  for (const rc of MAP.rocks) delete rc.meltAt;
  clearBossTerrain();
  for (const p of players) p.curses = {};
  refreshCurseStrip();
  if (Game.deep) Game.deep.stillT = 0;
  /* a breath before it returns: one vitality box at the rim */
  healthBoxes.push(assignId({ x: UNK_X, y: UNK_Y + UNK_ABYSS_R + 96, r: 16, state: "sealed", pulse: 0 }));
  updateSeals();
  toast("BOTH FALL — A BREATH BEFORE IT RETURNS");
  AudioFX.calm();
}
/* the ring of stone grows back where the Tyrant melted it and the boulders broke it */
function unkRestoreRocks() {
  const U = Game.unk;
  for (const r of U.rocks) {
    const cxp = r.x + r.w / 2, cyp = r.y + r.h / 2;
    if (MAP.rocks.some(rc => cxp > rc.x && cxp < rc.x + rc.w && cyp > rc.y && cyp < rc.y + rc.h)) continue;
    if (players.some(p => circleRect(p.x, p.y, p.r + 18, r))) continue;
    /* `boss` only for the rise-from-the-floor draw; it stays out of Game.bossRocks, so it isn't cleared */
    MAP.rocks.push(assignId(Object.assign({}, r, { boss: true, bornAt: Game.time })));
  }
}
function unkBeginRise() {
  const U = Game.unk;
  U.stage = "rise"; U.st = 0; U.clearT = -1; U.echoes = [];
  unkRestoreRocks();
  unkSay(U.phase === 1 ? UNK_SAY.rise1 : UNK_SAY.rise2, 3.2);
  toast(U.phase === 1 ? "THE UNKNOWN RISES — NOW IT PAIRS ITS RUNES" : "THE UNKNOWN RISES — IT READS YOUR SEALED PATH");
  shockwaves.push({ x: UNK_X, y: UNK_Y, r: UNK_ABYSS_R, max: 640, speed: 640, dmg: 0, hostile: false, hit: true, hitSet: new Set(), color: "#c9b8ff" });
  AudioFX.bossRoar(); AudioFX.slam(); Game.shake = Math.max(Game.shake, 16);
}

/* =========================================================
   ITS DEATH — bossSlain() hands over here; the ending follows the last line
   ========================================================= */
function unknownSlain(e, award) {
  const U = Game.unk;
  Game.unknownDue = false; Game.unknownConquered = true;
  /* the descent is complete — stop the speedrun clock and bank the clear */
  if (typeof RunTimer !== "undefined") RunTimer.finish();
  unknownHud(false);
  /* THE UNKNOWN falls — it walks free as a playable warden from here on. */
  Meta.unlocked["char:theUnknown"] = true;
  metaSave();
  if (!U) { startEnding(); return; }
  unkClearCombat();
  U.stage = "dying"; U.st = 0; U.boom = false;
  unkSay(UNK_SAY.death, 3.6);
  floatText(e.x, e.y - e.r - 64, "+" + award + " SOULS", "#ffd23d", 20);
  toast("THE UNKNOWN FALLS — " + award + " SOULS SPILL FREE");
  for (let k = 0; k < 4; k++)
    shockwaves.push({ x: e.x, y: e.y, r: 10, max: 200 + k * 100, speed: 700, dmg: 0, hostile: false, color: "#c9b8ff", hitSet: new Set(), delay: k * 0.14 });
  Game.slowmo = 0.8;
  AudioFX.bossRoar();
}

/* =========================================================
   HUD — its bar (with the 50% / 25% gates) and the echoes' bars
   ========================================================= */
function unknownHud(on) {
  const bar = $("bossBar"), eb = $("echoBars");
  if (!bar || !eb) return;
  const U = Game.unk;
  if (!on || !U) {
    bar.classList.remove("unk", "abyss");
    eb.classList.remove("on");
    document.body.classList.remove("unkTalk");
    if (U) U.hud = { name: "", abyss: false, echo: false, w: [-1, -1], dead: [false, false] };
    return;
  }
  if (!Game.boss) return;
  const H = U.hud;
  let name = "THE UNKNOWN";
  if (U.stage === "reveal") {
    const junk = "?ᛋᚺᛣᛁᛟᚦᛉ";
    name = U.nameK <= 0 ? "??????" : name.split("").map((ch, i) => (i / name.length < U.nameK || ch === " ") ? ch : junk[Math.floor(Math.random() * junk.length)]).join("");
  } else if (U.stage === "sink" || U.stage === "round") name = "THE UNKNOWN · IN THE ABYSS";
  if (name !== H.name) { H.name = name; $("bossName").textContent = name; }
  const abyss = U.stage === "sink" || U.stage === "round";
  if (abyss !== H.abyss) { H.abyss = abyss; bar.classList.toggle("abyss", abyss); }
  const echo = U.stage === "round" && U.echoes.length > 0;
  const slots = eb.querySelectorAll(".echo");
  if (echo !== H.echo) {
    H.echo = echo; H.w = [-1, -1]; H.dead = [false, false];
    eb.classList.toggle("on", echo);
    if (echo) U.echoes.forEach((e, i) => {
      if (!slots[i]) return;
      slots[i].style.color = e.color;
      slots[i].querySelector(".en").textContent = FLOORS[e.kind].boss;
      slots[i].classList.remove("dead");
    });
  }
  if (echo) U.echoes.forEach((e, i) => {
    if (!slots[i]) return;
    const w = clamp(e.hp / e.maxHp * 100, 0, 100);
    if (Math.abs(w - H.w[i]) > 0.2) { H.w[i] = w; slots[i].querySelector(".ef").style.width = w + "%"; }
    if (e.dead !== H.dead[i]) { H.dead[i] = e.dead; slots[i].classList.toggle("dead", e.dead); }
  });
}

/* =========================================================
   THE SHOOTABLE PIECES — wards, shields, hounds, wisps
   ========================================================= */
Object.assign(ETYPES, {
  /* THE CARAPACE: four glyphs orbit it; while any stands it takes a fifth of every blow */
  unkward: {
    hp: 30, r: 15, speed: 0, color: "#bcd0ff", score: 0, bound: true,
    init: e => { e.noclip = true; e.orbA = 0; },
    ai: (e, dt) => {
      const U = Game.unk, B = U && U.boss;
      if (!U || U.stage !== "fight" || !B || B.dead) { e.dead = true; return; }
      e.orbA += dt * 1.6;
      const tx = B.x + Math.cos(e.orbA) * 150, ty = B.y + Math.sin(e.orbA) * 135;
      e.vx = (tx - e.x) * 8; e.vy = (ty - e.y) * 8;
    } },
  /* THE SHIELDS: three orbs circle a warden and close in; each bursts on arrival */
  unkorb: {
    hp: 10, r: 13, speed: 0, color: "#e0a86b", score: 0, bound: true,
    init: e => { e.noclip = true; e.orbA = 0; e.rr = 240; e.tgt = 0; },
    ai: (e, dt) => {
      const U = Game.unk;
      if (!U || U.stage !== "fight") { e.dead = true; return; }
      const P = players[e.tgt] && !players[e.tgt].downed ? players[e.tgt] : nearestPlayer(e.x, e.y);
      e.orbA += dt * 2.2; e.rr -= dt * 52;
      const tx = P.x + Math.cos(e.orbA) * e.rr, ty = P.y + Math.sin(e.orbA) * e.rr;
      e.vx = (tx - e.x) * 10; e.vy = (ty - e.y) * 10;
      if (e.rr <= 22) {
        e.dead = true;
        unkZone({ type: "circle", x: P.x, y: P.y, r: 54, warn: 0, active: 0.2, c: "#e0a86b", blast: true, dmg: 14 });
        Game.shake = Math.max(Game.shake, 6); AudioFX.nova();
      }
    } },
  /* THE HOUNDS: six slow orbs that curve after you, then gutter out */
  unkhound: {
    hp: 8, r: 11, speed: 175, color: "#ff6bd6", score: 0, bound: true,
    init: e => { e.noclip = true; e.life = 4.6; e.head = 0; },
    ai: (e, dt) => {
      e.life -= dt;
      if (e.life <= 0 || !Game.unk || Game.unk.stage !== "fight") { e.dead = true; return; }
      const P = nearestPlayer(e.x, e.y);
      const want = angTo(e.x, e.y, P.x, P.y), d = angDiff(want, e.head);
      e.head += clamp(d, -2.0 * dt, 2.0 * dt);
      e.vx = Math.cos(e.head) * e.speed * e.slowMul; e.vy = Math.sin(e.head) * e.speed * e.slowMul;
      if (dist2(e.x, e.y, P.x, P.y) < (e.r + P.r) ** 2) { hurtPlayer(P, 12, e); e.dead = true; }
    } },
  /* THE BLIND DARK: wisps that close in from the edge of the light */
  unkwisp: {
    hp: 10, r: 12, speed: 115, color: "#9d9db8", score: 0, bound: true,
    init: e => { e.noclip = true; e.life = 6.5; },
    ai: (e, dt) => {
      e.life -= dt;
      if (e.life <= 0 || !Game.unk || Game.unk.stage !== "fight") { e.dead = true; return; }
      const P = nearestPlayer(e.x, e.y), a = angTo(e.x, e.y, P.x, P.y);
      e.vx = Math.cos(a) * e.speed * e.slowMul; e.vy = Math.sin(a) * e.speed * e.slowMul;
      if (dist2(e.x, e.y, P.x, P.y) < (e.r + P.r) ** 2) { hurtPlayer(P, 12, e); e.dead = true; }
    } },
});
/* a piece its runes put on the field, appearing at once (no spawn telegraph) */
function unkMinion(type, x, y) {
  const e = spawnEnemy(type, clamp(x, 60, MAP.w - 60), clamp(y, 60, MAP.h - 60));
  e.spawnT = 0;
  enemies.push(e);
  return e;
}
