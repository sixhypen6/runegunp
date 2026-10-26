/* =========================================================
   RUNEGUN · THE UNKNOWN — what each rune becomes in its hands
   Thirty-three attacks, one per rune in the game, each the rune's own idea
   turned on you. `phase` is when the rune joins its rotation (it stays after).
   cast() fires the attack and returns about how long it holds the arena.

   The floor warnings ("zones") live here too: lanes, lances, bolts, circles,
   wedges, beams, a checkerboard, crosshairs, wells and slow fields. Every
   warning is drawn in its rune's own colour (draw-unknown.js), so a colour
   means the same thing on the glyph, the floor and the shot.
   ========================================================= */
"use strict";

const unkB = () => Game.unk.boss;
const unkP = () => { const b = unkB(); return nearestPlayer(b.x, b.y); };
const unkCX = x => clamp(x, 70, MAP.w - 70), unkCY = y => clamp(y, 70, MAP.h - 70);
/* where a warden was a beat ago — THE HAIL aims there */
const unkLag = (P, s) => ({ x: P.x - (P.ivx || 0) * s, y: P.y - (P.ivy || 0) * s });
function unkShot(x, y, a, sp, r, dmg, color, extra) { return deepShot(x, y, a, sp, r, dmg, color, extra); }
function unkRing(x, y, n, sp, r, dmg, color, extra) {
  const off = rnd(0, TAU);
  for (let i = 0; i < n; i++) unkShot(x, y, off + i / n * TAU, sp, r, dmg, color, extra);
}
function unkZone(o) {
  const z = Object.assign({ t: 0, delay: 0, warn: 0.6, active: 0.3, hit: new Set() }, o);
  Game.unk.zones.push(z);
  return z;
}
/* a lane drawn from where it stands to the far wall: the warning for a shot that follows */
function unkLane(x, y, a, w, warn, c, extra) {
  return unkZone(Object.assign({ type: "lane", x1: x, y1: y, x2: x + Math.cos(a) * 1900, y2: y + Math.sin(a) * 1900, w, warn, active: 0, c }, extra));
}

const UNK_RUNES = {
  /* ================= PHASE I · THE TELLING — one rune at a time ================= */
  scatter: { phase: 1, name: "FANFARE", cast() {
    /* three fans aimed where you stand, each wider and softer than the last */
    [[7, 0.5], [9, 0.85], [11, 1.2]].forEach(([n, sp], k) => unkLater(k * 0.38, () => {
      const b = unkB(), P = unkP(), a = angTo(b.x, b.y, P.x, P.y);
      for (let i = 0; i < n; i++) unkShot(b.x, b.y, a - sp / 2 + sp * i / (n - 1), 300 - k * 25, 7 - k, 13 - k, "#ffd23d");
      AudioFX.enemyShoot();
    }));
    return 2.4; } },
  heavy: { phase: 1, name: "HAND-CANNON", cast() {
    /* one slug the size of a barrel, slow enough to watch; it smashes stone and throws you */
    const b = unkB(), P = unkP(), x = b.x, y = b.y, a = angTo(x, y, P.x, P.y);
    unkLane(x, y, a, 60, 0.6, "#ff8a3d");
    unkLater(0.6, () => {
      unkShot(x, y, a, 300, 26, 26, "#ff8a3d", { pierceRock: true, unkKnock: 230, unkCrush: true });
      AudioFX.slam(); Game.shake = Math.max(Game.shake, 8);
    });
    return 3; } },
  rapid: { phase: 1, name: "THE HAIL", cast() {
    /* three seconds of fast pellets, trailing where you were half a beat ago */
    for (let i = 0; i < 30; i++) unkLater(i * 0.1, () => {
      const b = unkB(), L = unkLag(unkP(), 0.35);
      unkShot(b.x, b.y, angTo(b.x, b.y, L.x, L.y) + rnd(-0.05, 0.05), 520, 5, 10, "#ffffff");
      if (i % 3 === 0) AudioFX.enemyShoot();
    });
    return 3.4; } },
  venom: { phase: 1, name: "BLIGHT RAIN", cast() {
    /* six globs arc into marked circles and leave poison standing for eight seconds */
    const b = unkB(), P = unkP();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + rnd(-0.3, 0.3), d = i === 0 ? 0 : rnd(110, 240);
      unkZone({ type: "circle", x: unkCX(P.x + Math.cos(a) * d), y: unkCY(P.y + Math.sin(a) * d), r: 64,
        warn: 0.9 + i * 0.08, active: 0.05, c: "#7dff5e", lob: { x: b.x, y: b.y },
        onActive: z => puddles.push({ x: z.x, y: z.y, r: 64, t: 0, life: 8, team: "e", dmg: 6, color: "#7dff5e", tickMap: {} }) });
    }
    return 3; } },
  ember: { phase: 1, name: "PYRE CROSS", cast() {
    /* four walls of fire crawl out of it in a cross and slowly turn */
    const b = unkB(), P = unkP();
    unkZone({ type: "spokes", x: b.x, y: b.y, n: 4, rot: angTo(b.x, b.y, P.x, P.y) + Math.PI / 4, rotSpd: 0.45,
      len: 620, w: 32, warn: 0.55, active: 4.2, fade: 0.4, c: "#ff4d2e", follow: true, dmg: 12, brand: true });
    AudioFX.sizzle();
    return 4.6; } },
  frost: { phase: 1, name: "WHITE RING", cast() {
    /* a ring of frost rolls out (it chills); ice spikes up where you stood a second later */
    const b = unkB();
    shockwaves.push({ x: b.x, y: b.y, r: b.r, max: 1000, speed: 300, dmg: 12, hit: false, hostile: true, color: "#5ee6ff", rime: true });
    [1.1, 1.75].forEach(t => unkLater(t, () => {
      const P = unkP();
      unkZone({ type: "circle", x: P.x, y: P.y, r: 56, warn: 0.6, active: 0.35, c: "#5ee6ff", blast: true, spikes: true, dmg: 14, rime: true });
    }));
    AudioFX.stillHour();
    return 3; } },
  pierce: { phase: 1, name: "THE LANCES", cast() {
    /* five lances drawn across the whole arena, then fired — straight through stone */
    const P = unkP(), base = rnd(0, Math.PI);
    for (let i = 0; i < 5; i++) {
      const a = base + i * Math.PI / 5 + rnd(-0.12, 0.12), off = (i % 2 ? 1 : -1) * rnd(70, 200);
      const cxp = P.x - Math.sin(a) * off, cyp = P.y + Math.cos(a) * off;
      unkZone({ type: "line", x1: cxp - Math.cos(a) * 1900, y1: cyp - Math.sin(a) * 1900, x2: cxp + Math.cos(a) * 1900, y2: cyp + Math.sin(a) * 1900,
        w: 16, warn: 0.85 + i * 0.07, active: 0.3, c: "#e8e2d0", dmg: 18, sfx: "lance" });
    }
    return 2; } },
  ricochet: { phase: 1, name: "MIRROR HALL", cast() {
    /* eight orbs that bounce off the walls and the stone three times each */
    const b = unkB();
    unkRing(b.x, b.y, 8, 340, 9, 13, "#9d6bff", { unkBounce: 3 });
    AudioFX.enemyShoot();
    return 3.5; } },
  seeker: { phase: 1, name: "THE HOUNDS", cast() {
    /* six slow orbs curve after you for four seconds — your bullets can pop them */
    const b = unkB(), P = unkP(), a0 = angTo(b.x, b.y, P.x, P.y) + Math.PI;
    for (let i = 0; i < 6; i++) {
      const a = a0 + (i - 2.5) * 0.45;
      const h = unkMinion("unkhound", b.x + Math.cos(a) * 70, b.y + Math.sin(a) * 70);
      h.head = a;
    }
    AudioFX.portal();
    return 4.5; } },
  storm: { phase: 1, name: "THE CHORUS", cast() {
    /* lightning in every direction: twelve bolts, then twelve more turned half a step */
    const b = unkB(), a0 = rnd(0, TAU);
    for (let v = 0; v < 2; v++) for (let i = 0; i < 12; i++)
      unkZone({ type: "bolt", x: b.x, y: b.y, a: a0 + (i + v * 0.5) / 12 * TAU, len: 920,
        delay: v * 0.8, warn: 0.5, active: 0.3, c: "#bfe3ff", dmg: 16, follow0: true });
    unkLater(0.5, () => { Game.shake = Math.max(Game.shake, 7); AudioFX.zap(); });
    unkLater(1.3, () => { Game.shake = Math.max(Game.shake, 7); AudioFX.zap(); });
    return 2.2; } },
  nova: { phase: 1, name: "SUNBURST", cast() {
    /* five embers land around you and detonate a second later */
    const b = unkB(), P = unkP();
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + rnd(0, 1), d = rnd(50, 160);
      unkZone({ type: "circle", x: unkCX(P.x + Math.cos(a) * d), y: unkCY(P.y + Math.sin(a) * d), r: 92,
        warn: 1.0 + i * 0.06, active: 0.25, c: "#ffae5e", lob: { x: b.x, y: b.y }, blast: true, dmg: 18, sfx: "nova" });
    }
    return 2; } },
  splinter: { phase: 1, name: "SHATTERGLASS", cast() {
    /* four crystal shells land on the floor and burst into rings of shrapnel */
    const b = unkB(), P = unkP();
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + rnd(-0.4, 0.4), d = rnd(140, 260);
      unkZone({ type: "circle", x: unkCX(P.x + Math.cos(a) * d), y: unkCY(P.y + Math.sin(a) * d), r: 26,
        warn: 0.9, active: 0.12, c: "#d0c4ff", lob: { x: b.x, y: b.y },
        onActive: z => { unkRing(z.x, z.y, 10, 270, 6, 11, "#d0c4ff"); AudioFX.pane(1046); } });
    }
    return 3; } },
  titan: { phase: 1, name: "THE BOULDER", cast() {
    /* a boulder rolls at you and flattens every rock in its lane; it can't turn */
    const b = unkB(), P = unkP(), x = b.x, y = b.y, a = angTo(x, y, P.x, P.y);
    unkLane(x, y, a, 100, 0.7, "#c9b27a");
    unkLater(0.7, () => {
      unkShot(x, y, a, 280, 46, 24, "#c9b27a", { pierceRock: true, unkKnock: 260, unkCrush: true, unkBoulder: true });
      AudioFX.slam(); Game.shake = Math.max(Game.shake, 10);
    });
    return 3.5; } },

  /* ================= PHASE II · THE PAIRING — two runes at once ================= */
  twin: { phase: 2, name: "PARALLELS", cast() {
    /* two beams sweep around it side by side; walk inside the gap */
    const b = unkB(), P = unkP();
    unkZone({ type: "twinbeam", x: b.x, y: b.y, a0: angTo(b.x, b.y, P.x, P.y) - 1.3, sweep: 2.6, gap: 104, len: 1100,
      warn: 0.6, active: 2.4, c: "#a0ffe6", follow: true, dmg: 14 });
    AudioFX.lance();
    return 3.2; } },
  swift: { phase: 2, name: "THE RUSH", cast() {
    /* three dashes straight at you; each leaves a cutting afterimage for two seconds */
    const steps = [];
    for (let k = 0; k < 3; k++) steps.push({ type: "aim", dur: 0.42, c: "#9effc4" }, { type: "dash", dur: 0.22, trail: "#9effc4" });
    steps.push({ type: "home", dur: 0.7 });
    unkScript(steps);
    return 3.4; } },
  phase: { phase: 2, name: "BLINKSTEP", cast() {
    /* three marks around you; it blinks to each and bursts a ring of shot */
    const P = unkP(), marks = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + rnd(-0.5, 0.5), d = rnd(150, 220);
      const m = { x: unkCX(P.x + Math.cos(a) * d), y: unkCY(P.y + Math.sin(a) * d) };
      if (dist2(m.x, m.y, UNK_X, UNK_Y) < (UNK_ABYSS_R + 30) ** 2) { m.x = unkCX(P.x - Math.cos(a) * d); m.y = unkCY(P.y - Math.sin(a) * d); }
      marks.push(m);
      unkZone({ type: "mark", x: m.x, y: m.y, r: 40, warn: 0.6 + i * 0.5, active: 0, c: "#7ad7ff" });
    }
    const steps = [{ type: "wait", dur: 0.6 }];
    marks.forEach(m => steps.push(
      { type: "blink", to: m, then: () => { unkRing(m.x, m.y, 12, 260, 7, 12, "#7ad7ff"); AudioFX.enemyShoot(); } },
      { type: "wait", dur: 0.5 }));
    steps.push({ type: "blink", to: null });
    unkScript(steps);
    return 3; } },
  velocity: { phase: 2, name: "HELD BREATH", cast() {
    /* thirty bullets hang still in a ring around you, then all launch at once */
    const P = unkP(), cxp = P.x, cyp = P.y, gapAt = rnd(0, TAU);
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * TAU;
      if (Math.abs(angDiff(a, gapAt)) < 0.3) continue;   // the one gap to slip through
      ebullets.push({ x: cxp + Math.cos(a) * 260, y: cyp + Math.sin(a) * 260, vx: 0, vy: 0, r: 7, dmg: 12, t: 0, color: "#fff89e",
        unkHold: 1.15, unkLaunch: s => { const aa = angTo(s.x, s.y, cxp, cyp); s.vx = Math.cos(aa) * 470; s.vy = Math.sin(aa) * 470; } });
    }
    unkLater(1.15, () => AudioFX.lance());
    return 2.6; } },
  puncture: { phase: 2, name: "THE NEEDLE", cast() {
    /* a gold sight line flashes and a needle follows at triple speed — three in a row */
    for (let k = 0; k < 3; k++) unkLater(k * 0.6, () => {
      const b = unkB(), P = unkP(), x = b.x, y = b.y, a = angTo(x, y, P.x, P.y);
      unkLane(x, y, a, 4, 0.42, "#ffd23d", { flash: true });
      unkLater(0.42, () => { unkShot(x, y, a, 1300, 5, 20, "#ffd23d"); AudioFX.crit(); });
    });
    return 2.4; } },
  quarry: { phase: 2, name: "THE HUNT", cast() {
    /* four crosshairs slide in from the edges of your sight and fire where they lock */
    const L = Game.cam.x + 40, T = Game.cam.y + 40, R = Game.cam.x + VW - 40, B = Game.cam.y + VH - 40;
    [[L, T], [R, T], [L, B], [R, B]].forEach(([sx, sy], i) =>
      unkZone({ type: "reticle", sx, sy, x: sx, y: sy, warn: 1.1 + i * 0.12, active: 0.22, lockAt: 0.78, r: 60, c: "#b6ff4d", dmg: 18 }));
    return 2; } },
  reaper: { phase: 2, name: "THE SCYTHE", cast() {
    /* a dim wedge covers three quarters of the circle around it; then the blade sweeps */
    const b = unkB(), safe = rnd(0, TAU);
    unkZone({ type: "wedge", x: b.x, y: b.y, r: 520, a0: safe + Math.PI / 4, a1: safe + Math.PI / 4 + TAU * 0.75,
      warn: 0.95, active: 0.45, c: "#c4c9d4", follow: true, dmg: 22, sfx: "slam" });
    return 2; } },
  maelstrom: { phase: 2, name: "THE WELL", cast() {
    /* a gravity well opens under you; a ring of shot converges on its heart */
    const P = unkP(), x = P.x, y = P.y;
    unkZone({ type: "well", x, y, r: 260, warn: 0.3, active: 2.4, c: "#8a6bff", pull: 220 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      ebullets.push({ x: x + Math.cos(a) * 340, y: y + Math.sin(a) * 340, vx: 0, vy: 0, r: 7, dmg: 12, t: 0, color: "#8a6bff",
        unkHold: 1.4, unkLaunch: s => { s.vx = -Math.cos(a) * 230; s.vy = -Math.sin(a) * 230; } });
    }
    AudioFX.portal();
    return 3.2; } },
  slime: { phase: 2, name: "THE SLICK", cast() {
    /* it slithers a loop around the abyss, leaving caustic slime for ten seconds */
    const a0 = rnd(0, TAU), pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, a = a0 + t * TAU, rr = 330 + 140 * (0.5 + 0.5 * Math.sin(t * TAU * 3));
      pts.push({ x: unkCX(UNK_X + Math.cos(a) * rr * 1.25), y: unkCY(UNK_Y + Math.sin(a) * rr * 0.88) });
    }
    const b = unkB();
    pts.unshift({ x: b.x, y: b.y });
    unkScript([{ type: "path", pts, dur: 3.0 }, { type: "home", dur: 0.6 }]);
    AudioFX.sizzle();
    return 4; } },
  prickle: { phase: 2, name: "THORN GRID", cast() {
    /* the floor lights in a checkerboard; lit tiles spike, then the other half lights */
    unkZone({ type: "grid", parity: 0, size: 130, warn: 0.75, active: 0.35, c: "#d6e85a", dmg: 14 });
    unkZone({ type: "grid", parity: 1, size: 130, delay: 1.2, warn: 0.75, active: 0.35, c: "#d6e85a", dmg: 14 });
    return 2.6; } },

  /* ================= PHASE III · THE UNMAKING — a chord of three ================= */
  mirror: { phase: 3, name: "THE REFLECTION", cast() {
    /* a violet sheen for four seconds: bullets that hit it come straight back */
    const b = unkB();
    Game.unk.sheenT = 4;
    floatText(b.x, b.y - b.r - 40, "STOP FIRING", "#f3c4ff", 18, { outline: "#0b0b14", life: 1.4, vy: 14 });
    AudioFX.pane(1046);
    return 4.2; } },
  bramble: { phase: 3, name: "THE RETORT", cast() {
    /* five seconds in which every hit you land bursts a barbed ring out of it */
    const b = unkB();
    Game.unk.brambleT = 5; Game.unk.brambleCd = 0;
    floatText(b.x, b.y - b.r - 40, "THE RETORT — BACK OFF", "#ff6b8a", 16, { outline: "#0b0b14", life: 1.4, vy: 14 });
    return 5; } },
  aegis: { phase: 3, name: "THE CARAPACE", cast() {
    /* four ward glyphs orbit it; it takes 80% less until you shoot all four down */
    const b = unkB();
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      const w = unkMinion("unkward", b.x + Math.cos(a) * 150, b.y + Math.sin(a) * 135);
      w.orbA = a;
    }
    floatText(b.x, b.y - b.r - 40, "WARDED", "#bcd0ff", 18, { outline: "#0b0b14", life: 1.2, vy: 14 });
    AudioFX.chest();
    return 5; } },
  bulwark: { phase: 3, name: "THE SHIELDS", cast() {
    /* three shield orbs circle a warden and close in; each bursts when it arrives */
    const P = unkP();
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      const o = unkMinion("unkorb", P.x + Math.cos(a) * 240, P.y + Math.sin(a) * 240);
      o.orbA = a; o.rr = 240; o.tgt = P.idx;
    }
    AudioFX.equip();
    return 3.6; } },
  leech: { phase: 3, name: "THE TITHE", cast() {
    /* a red tether latches on; while it holds, it heals 1% of its vitality a second */
    Game.unk.tether = { t: 0, dur: 3.6, tick: 1.0 };
    AudioFX.zap();
    return 3.8; } },
  mend: { phase: 3, name: "THE KNITTING", cast() {
    /* it kneels and knits 2.5% back over three seconds — 400 damage breaks it */
    const b = unkB();
    Game.unk.mend = { t: 0, dur: 3, dmg: 0, need: 400 * b.maxHp / UNK_HP };
    floatText(b.x, b.y - b.r - 40, "IT KNITS ITSELF", "#8effb0", 16, { outline: "#0b0b14", life: 1.2, vy: 14 });
    return 3.2; } },
  dread: { phase: 3, name: "THE BLIND DARK", cast() {
    /* the light shrinks to a circle around you while wisps close in from the dark */
    Game.unk.dark = { t: 0, dur: 5 };
    const L = Game.cam.x + 30, T = Game.cam.y + 30, R = Game.cam.x + VW - 30, B = Game.cam.y + VH - 30;
    [[L, T], [R, T], [L, B], [R, B]].forEach(([x, y], i) => unkLater(0.3 + i * 0.5, () => {
      if (Game.unk && Game.unk.dark) unkMinion("unkwisp", x, y);
    }));
    AudioFX.bossRoar();
    return 5.5; } },
  midas: { phase: 3, name: "FOOL'S GOLD", cast() {
    /* ten soul coins spill across the floor; half are mimics. Real coins spin. */
    const P = unkP(), U = Game.unk;
    U.coins = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + rnd(-0.2, 0.2), d = rnd(160, 380);
      let x = unkCX(P.x + Math.cos(a) * d), y = unkCY(P.y + Math.sin(a) * d);
      if (dist2(x, y, UNK_X, UNK_Y) < (UNK_ABYSS_R + 30) ** 2) { x = unkCX(P.x - Math.cos(a) * d); y = unkCY(P.y - Math.sin(a) * d); }
      U.coins.push({ x, y, real: i % 2 === 0, t: 0, boom: rnd(2.4, 5.2), ph: rnd(0, TAU) });
    }
    floatText(P.x, P.y - 50, "SOULS SPILL", "#ffd23d", 16, { outline: "#0b0b14", life: 1.2, vy: 14 });
    AudioFX.coinTick && AudioFX.coinTick();
    return 6; } },
  wrath: { phase: 3, name: "THE TEMPER", cast() {
    /* red shockwaves, each faster than the last: four at 25%, six near death */
    const b = unkB(), f = b.hp / b.maxHp;
    const n = Math.round(4 + 2 * clamp(1 - f / 0.25, 0, 1));
    for (let k = 0; k < n; k++) unkLater(k * 0.42, () => {
      const B = unkB();
      shockwaves.push({ x: B.x, y: B.y, r: B.r, max: 1100, speed: 320 + k * 60, dmg: 14, hit: false, hostile: true, color: "#ff3d2e" });
      Game.shake = Math.max(Game.shake, 5); AudioFX.slam();
    });
    return 3.6; } },
  stillpoint: { phase: 3, name: "STILLED FIELDS", cast() {
    /* teal bubbles bloom; inside them you move at 40% — its shots don't slow */
    const P = unkP(), U = Game.unk, a0 = rnd(0, TAU);
    U.fields = [];
    for (let i = 0; i < 5; i++) {
      const a = a0 + i / 5 * TAU, d = i < 2 ? rnd(170, 260) : rnd(300, 460);
      let x = unkCX(P.x + Math.cos(a) * d), y = unkCY(P.y + Math.sin(a) * d);
      U.fields.push({ x, y, r: 140, t: 0, life: 6 });
    }
    unkLater(0.9, () => { const b = unkB(); unkRing(b.x, b.y, 16, 210, 7, 12, "#6be0d4"); AudioFX.enemyShoot(); });
    AudioFX.stillHour();
    return 6; } },
};

/* =========================================================
   ZONES — the floor warnings, and the moment each one bites
   ========================================================= */
function unkTickZones(dt) {
  const U = Game.unk, b = U.boss;
  for (let i = U.zones.length - 1; i >= 0; i--) {
    const z = U.zones[i];
    z.t += dt;
    const lt = z.t - z.delay;
    if (lt < 0) continue;
    if (z.follow && b && !b.dead) { z.x = b.x; z.y = b.y; }
    /* THE CHORUS: a volley's spokes leave from where it stands when the volley is drawn */
    if (z.follow0 && !z.placed) { z.placed = true; if (b && !b.dead) { z.x = b.x; z.y = b.y; } }
    if (z.type === "reticle" && lt < z.warn * z.lockAt) {
      const P = nearestPlayer(z.x, z.y), k = unkEase(lt / (z.warn * z.lockAt));
      z.x = lerp(z.sx, P.x, k); z.y = lerp(z.sy, P.y, k);
    }
    if (lt >= z.warn && !z.on) { z.on = true; unkZoneOn(z); }
    if (z.on && lt <= z.warn + z.active) unkZoneBite(z, lt - z.warn, dt);
    if (lt > z.warn + z.active + (z.fade || 0.3)) U.zones.splice(i, 1);
  }
}
function unkZoneOn(z) {
  const U = Game.unk;
  if (z.onActive) z.onActive(z);
  if (z.type === "bolt") {
    z.pts = [];
    for (let s = 0; s <= 14; s++) {
      const u = s / 14, j = s && s < 14 ? rnd(-20, 20) : 0;
      z.pts.push([z.x + Math.cos(z.a) * z.len * u - Math.sin(z.a) * j, z.y + Math.sin(z.a) * z.len * u + Math.cos(z.a) * j]);
    }
    if (Game.time - U.boltSfxT > 0.1) { U.boltSfxT = Game.time; AudioFX.zap(); }
  }
  if (z.sfx === "lance") AudioFX.lance();
  if (z.sfx === "nova") { AudioFX.nova(); Game.shake = Math.max(Game.shake, 5); }
  if (z.sfx === "slam") { AudioFX.slam(); Game.shake = Math.max(Game.shake, 8); }
  if (z.blast || z.type === "grid" || z.type === "reticle") Game.shake = Math.max(Game.shake, 4);
}
/* one bite per zone per warden for instants; standing ones (fire, beams, the cut) bite on contact */
function unkZoneHurt(z, p, once) {
  if (once) { if (z.hit.has(p)) return; z.hit.add(p); }
  const before = p.hp;
  hurtPlayer(p, z.dmg, { x: z.x !== undefined ? z.x : p.x, y: z.y !== undefined ? z.y : p.y, rime: z.rime });
  if (z.brand && p.hp < before) applyCurse(p, "brand", 2.5, false);
}
function unkZoneBite(z, at, dt) {
  if (!z.dmg && z.type !== "well") return;
  for (const p of alivePlayers()) {
    const pr = p.r;
    switch (z.type) {
      case "circle":
        if (z.blast && dist2(p.x, p.y, z.x, z.y) < (z.r + pr * 0.5) ** 2) unkZoneHurt(z, p, true);
        break;
      case "line":
        if (segDist2(p.x, p.y, z.x1, z.y1, z.x2, z.y2) < (z.w / 2 + pr) ** 2) unkZoneHurt(z, p, true);
        break;
      case "cut":
        if (segDist2(p.x, p.y, z.x1, z.y1, z.x2, z.y2) < (z.w / 2 + pr) ** 2) unkZoneHurt(z, p, false);
        break;
      case "bolt":
        if (beamTouches(z.pts, p.x, p.y, 8 + pr)) unkZoneHurt(z, p, true);
        break;
      case "spokes": {
        const rot = z.rot + z.rotSpd * at, L = z.len * unkEase(at / 0.9);
        for (let k = 0; k < z.n; k++) {
          const a = rot + k / z.n * TAU;
          if (segDist2(p.x, p.y, z.x + Math.cos(a) * 50, z.y + Math.sin(a) * 50, z.x + Math.cos(a) * L, z.y + Math.sin(a) * L) < (z.w / 2 + pr) ** 2) { unkZoneHurt(z, p, false); break; }
        }
        break;
      }
      case "wedge": {
        const d = Math.sqrt(dist2(p.x, p.y, z.x, z.y));
        if (d > z.r + pr || d < 40) break;
        const ba = lerp(z.a0, z.a1, unkEase(at / z.active)), pa = z.a0 + ((angTo(z.x, z.y, p.x, p.y) - z.a0) % TAU + TAU) % TAU;
        if (pa <= ba + 0.08 && pa >= ba - 0.6) unkZoneHurt(z, p, true);   // only where the blade is passing
        break;
      }
      case "twinbeam": {
        const a = z.a0 + z.sweep * clamp(at / z.active, 0, 1), nx = -Math.sin(a), ny = Math.cos(a);
        for (const s of [-1, 1]) {
          const ox = z.x + nx * s * z.gap / 2, oy = z.y + ny * s * z.gap / 2;
          if (segDist2(p.x, p.y, ox + Math.cos(a) * 60, oy + Math.sin(a) * 60, ox + Math.cos(a) * z.len, oy + Math.sin(a) * z.len) < (9 + pr) ** 2) { unkZoneHurt(z, p, false); break; }
        }
        break;
      }
      case "grid": {
        const ix = Math.floor(p.x / z.size), iy = Math.floor(p.y / z.size);
        if ((ix + iy) % 2 === z.parity) unkZoneHurt(z, p, true);
        break;
      }
      case "reticle":
        if (dist2(p.x, p.y, z.x, z.y) < (z.r + pr * 0.5) ** 2) unkZoneHurt(z, p, true);
        break;
      case "well": {
        const d = Math.sqrt(dist2(p.x, p.y, z.x, z.y));
        if (d < z.r && d > 4 && p.dashT <= 0) {
          const a = angTo(p.x, p.y, z.x, z.y), pull = z.pull * (1 - d / z.r) * dt;
          p.x += Math.cos(a) * pull; p.y += Math.sin(a) * pull;
        }
        break;
      }
    }
  }
}

/* =========================================================
   LINGERING EFFECTS — the sheen, the retort, the knitting, the tether,
   the dark, the coins and the slow fields
   ========================================================= */
function unkTickEffects(dt) {
  const U = Game.unk, b = U.boss;
  U.sheenT = Math.max(0, U.sheenT - dt);
  U.brambleT = Math.max(0, U.brambleT - dt);
  U.brambleCd -= dt;
  if (U.mend) {
    const M = U.mend;
    M.t += dt;
    if (M.dmg >= M.need) {
      floatText(b.x, b.y - b.r - 40, "KNITTING BROKEN", "#8effb0", 18, { outline: "#0b0b14", life: 1.4, vy: 14 });
      for (let k = 0; k < 20; k++) particles.push({ x: b.x, y: b.y, vx: rnd(-220, 220), vy: rnd(-220, 220), t: 0, life: 0.5, r: rnd(2, 4), color: "#8effb0" });
      AudioFX.crit(); U.mend = null;
    } else if (M.t >= M.dur) {
      const got = unkHeal(b.maxHp * 0.025);
      if (got > 0) floatText(b.x, b.y - b.r - 40, "+" + Math.round(got), "#8effb0", 20, { outline: "#0b0b14", life: 1.4, vy: 14 });
      U.mend = null;
    } else if (Math.random() < 0.5) {
      particles.push({ x: b.x + rnd(-50, 50), y: b.y + 40, vx: 0, vy: -rnd(40, 100), t: 0, life: 0.8, r: rnd(2, 3.5), color: "#8effb0" });
    }
  }
  if (U.tether) {
    const T = U.tether, P = nearestPlayer(b.x, b.y);
    T.t += dt; T.tick -= dt;
    /* THE TITHE breaks at a distance, or behind stone */
    const broken = dist2(b.x, b.y, P.x, P.y) > 420 * 420 || lineBlocked(b.x, b.y, P.x, P.y);
    if (broken) {
      floatText((b.x + P.x) / 2, (b.y + P.y) / 2, "TETHER BROKEN", "#ff4d5e", 16, { outline: "#0b0b14", life: 1.2, vy: 14 });
      AudioFX.crit(); U.tether = null;
    } else {
      if (T.tick <= 0) {
        T.tick = 1.0;
        const got = unkHeal(b.maxHp * 0.01);
        if (got > 0) floatText(b.x + 50, b.y - b.r - 20, "+" + Math.round(got), "#ff4d5e", 15);
      }
      if (T.t >= T.dur) U.tether = null;
    }
  }
  if (U.dark) { U.dark.t += dt; if (U.dark.t >= U.dark.dur) U.dark = null; }
  for (let i = U.coins.length - 1; i >= 0; i--) {
    const c = U.coins[i];
    c.t += dt;
    let gone = false;
    for (const p of alivePlayers()) {
      const d2 = dist2(p.x, p.y, c.x, c.y);
      if (c.real && d2 < (p.r + 22) ** 2) {
        /* the real ones pay real souls */
        Game.score += 25; updateScore();
        floatText(c.x, c.y - 20, "+25", "#ffd23d", 14);
        AudioFX.pickup(); gone = true; break;
      }
      if (!c.real && c.t > 0.6 && d2 < 84 * 84) c.boom = Math.min(c.boom, c.t);
    }
    if (!gone && !c.real && c.t >= c.boom) {
      /* a mimic: it was never gold */
      unkZone({ type: "circle", x: c.x, y: c.y, r: 84, warn: 0, active: 0.25, c: "#ffd23d", blast: true, dmg: 18, sfx: "nova" });
      for (let k = 0; k < 14; k++) particles.push({ x: c.x, y: c.y, vx: rnd(-240, 240), vy: rnd(-240, 240), t: 0, life: 0.5, r: rnd(2, 4), color: "#ffd23d" });
      gone = true;
    }
    if (c.real && c.t > 7) gone = true;
    if (gone) U.coins.splice(i, 1);
  }
  for (let i = U.fields.length - 1; i >= 0; i--) { const f = U.fields[i]; f.t += dt; if (f.t >= f.life) U.fields.splice(i, 1); }
}
/* STILLED FIELDS: inside a bubble you move at 40% (deep.js deepMoveMul) */
function unkFieldMul(x, y) {
  const U = Game.unk; if (!U || !U.fields.length) return 1;
  for (const f of U.fields) if (f.t > 0.4 && dist2(x, y, f.x, f.y) < f.r * f.r) return 0.4;
  return 1;
}

/* =========================================================
   SPECIAL SHOT — held rings, ricochets, and the stone-breakers.
   Runs before update()'s own enemy-bullet pass.
   ========================================================= */
function unkTickBullets(dt) {
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const s = ebullets[i];
    /* HELD BREATH / THE WELL: hangs in the air, then launches */
    if (s.unkHold > 0) {
      s.vx = 0; s.vy = 0;
      s.unkHold -= dt;
      if (s.unkHold <= 0 && s.unkLaunch) { s.unkLaunch(s); s.t = 0; }
      continue;
    }
    /* MIRROR HALL: bounce off the walls and the stone before update() would cull it */
    if (s.unkBounce > 0) {
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      if (nx < 40 || nx > MAP.w - 40) { s.vx = -s.vx; s.unkBounce--; }
      if (ny < 40 || ny > MAP.h - 40) { s.vy = -s.vy; s.unkBounce--; }
      for (const rc of MAP.rocks) {
        if (!circleRect(nx, ny, s.r, rc)) continue;
        const cxp = clamp(s.x, rc.x, rc.x + rc.w), cyp = clamp(s.y, rc.y, rc.y + rc.h);
        if (Math.abs(s.x - cxp) > Math.abs(s.y - cyp)) s.vx = -s.vx; else s.vy = -s.vy;
        s.unkBounce--; break;
      }
    }
    /* HAND-CANNON / THE BOULDER: stone breaks in front of it */
    if (s.unkCrush) {
      for (let k = MAP.rocks.length - 1; k >= 0; k--) {
        const rc = MAP.rocks[k];
        if (rc.mirror || !circleRect(s.x, s.y, s.r, rc)) continue;
        MAP.rocks.splice(k, 1);
        const bi = Game.bossRocks.indexOf(rc); if (bi !== -1) Game.bossRocks.splice(bi, 1);
        for (let q = 0; q < 16; q++) particles.push({ x: rc.x + rnd(0, rc.w), y: rc.y + rnd(0, rc.h), vx: rnd(-200, 200), vy: rnd(-200, 120), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 6), color: q % 2 ? "#2b2350" : "#15102b" });
        floatText(rc.x + rc.w / 2, rc.y - 10, "CRUSHED", "#c9b27a", 14);
        Game.shake = Math.max(Game.shake, 8); AudioFX.slam();
      }
    }
    /* ...and it throws whoever it meets across the room */
    if (s.unkKnock) {
      let hitP = null;
      for (const p of alivePlayers()) if (dist2(s.x, s.y, p.x, p.y) < (s.r + p.r) ** 2) { hitP = p; break; }
      if (hitP) {
        const p = hitP;
        if (p.iframes <= 0 && p.dashT <= 0 && p.veilT <= 0) {
          hurtPlayer(p, s.dmg, s);
          const a = Math.atan2(s.vy, s.vx);
          p.x += Math.cos(a) * s.unkKnock; p.y += Math.sin(a) * s.unkKnock;
          collideWorld(p);
          Game.shake = Math.max(Game.shake, 12);
        }
        /* the boulder rolls on; the slug is spent */
        if (!s.unkBoulder) { ebullets.splice(i, 1); continue; }
      }
    }
  }
}
