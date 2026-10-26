/* =========================================================
   RUNEGUN · The deep floors — past the saloon
     VI   THE STILLED HOUR      black ice · MOURNER · LAPSE · THE HOURGLASS SAINT
     VII  THE GLASS CHOIR       mirror panes · LUMEN · PENITENT · THE THOUSANDFOLD
     VIII THE LAST LIVING STAR  starflare & shade · DRIFTER · CARRION · THE OTHER GUNSLINGERS
   Floor hazards, the six horrors, and the three wardens' state machines.
   Solo only for now (loopLen() in floors.js): a co-op descent still laps after
   the Void, because the stopped hour, mirrored shot and rune theft have no
   guest-side sync yet.
   ========================================================= */
"use strict";

const DEEP_HOUR = 5, DEEP_GLASS = 6, DEEP_STAR = 7;          // FLOORS index = boss kind
const HAND_LEN = 820, HOUR_LEN = 450;                         // the Saint's clock, centred on the seal
const SPECTRUM = ["#ff6b8a", "#ffb35e", "#ffe66b", "#7dff9e", "#5ee6ff", "#7d9bff", "#c18bff"];
const PANE_PITCH = [523, 587, 659, 784, 880, 1046];           // each mirror pane rings its own note
/* the bodies draw-deep.js paints (drawCreatureBody hands these to drawDeepBody) */
const DEEP_TYPES = new Set(["mourner", "lapse", "lumen", "penitent", "drifter", "carrion", "reflection", "hollow"]);

/* ---------- small geometry helpers ---------- */
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return dist2(px, py, ax + dx * t, ay + dy * t);
}
function beamTouches(pts, x, y, rad) {
  if (!pts) return false;
  for (let i = 1; i < pts.length; i++)
    if (segDist2(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) < rad * rad) return true;
  return false;
}
/* a line of light: straight on, bending off mirror panes (up to `bounces`), stopped by stone */
function castBeam(x, y, ang, bounces, maxLen) {
  const pts = [[x, y]], STEP = 6;
  let vx = Math.cos(ang), vy = Math.sin(ang), px = x, py = y, n = 0, len = 0;
  while (len < maxLen) {
    const nx = px + vx * STEP, ny = py + vy * STEP;
    if (nx < 32 || nx > MAP.w - 32 || ny < 32 || ny > MAP.h - 32) break;
    let hit = null;
    for (const rc of MAP.rocks) if (nx > rc.x && nx < rc.x + rc.w && ny > rc.y && ny < rc.y + rc.h) { hit = rc; break; }
    if (hit) {
      pts.push([px, py]);
      if (!hit.mirror || n >= bounces) return pts;
      n++; hit.ringT = 0.3;
      if (px <= hit.x || px >= hit.x + hit.w) vx = -vx; else vy = -vy;
      continue;
    }
    px = nx; py = ny; len += STEP;
  }
  pts.push([px, py]);
  return pts;
}
/* a shot meeting a mirror pane: angle in equals angle out, set back outside the glass */
function deepReflect(b, rc) {
  const cxp = clamp(b.x, rc.x, rc.x + rc.w), cyp = clamp(b.y, rc.y, rc.y + rc.h);
  if (Math.abs(b.x - cxp) > Math.abs(b.y - cyp)) { b.vx *= -1; b.x = b.vx > 0 ? rc.x + rc.w + b.r + 0.5 : rc.x - b.r - 0.5; }
  else { b.vy *= -1; b.y = b.vy > 0 ? rc.y + rc.h + b.r + 0.5 : rc.y - b.r - 0.5; }
  rc.ringT = 0.25;
  if (Game.time - (rc.chimeAt || 0) > 0.12) { rc.chimeAt = Game.time; AudioFX.pane(rc.pitch || 659); }
}
function deepShot(x, y, a, sp, r, dmg, color, extra) {
  const b = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, dmg, t: 0, color };
  if (extra) Object.assign(b, extra);
  ebullets.push(b);
  return b;
}
function deepRing(x, y, n, sp, dmg, color, off, extra) {
  for (let i = 0; i < n; i++) deepShot(x, y, (off || 0) + i / n * TAU, sp, 6, dmg, typeof color === "function" ? color(i) : color, extra);
}
function openSpotNear(P, dMin, dMax) {
  for (let t = 0; t < 14; t++) {
    const a = rnd(0, TAU), d = rnd(dMin, dMax);
    const x = clamp(P.x + Math.cos(a) * d, 110, MAP.w - 110), y = clamp(P.y + Math.sin(a) * d, 110, MAP.h - 110);
    if (!MAP.rocks.some(rc => circleRect(x, y, 56, rc))) return { x, y };
  }
  return { x: clamp(P.x + 300, 110, MAP.w - 110), y: P.y };
}

/* =========================================================
   FLOOR STATE — rebuilt by setupFloor() for every floor
   ========================================================= */
function setupDeepFloor() {
  /* the saloon and THE UNKNOWN keep floor V/VIII's index but none of its weather */
  const F = (Game.inSaloon || Game.inUnknown) ? null : FLOORS[Game.mapIdx];
  Game.deep = {
    stillT: 0, bankN: 0,                                     // the Hourglass Saint's stopped hour
    lapses: [],                                              // live stasis fields (rebuilt per frame)
    ice: puddles.filter(pu => pu.ice),                       // the Stilled Hour's black ice (permanent)
    sun: !!(F && F.hazardType === "sun"),                    // the Last Living Star
    starX: MAP.w / 2, starY: -1100,
    flareSt: "calm", flareT: 12, flareId: 0, flareEvery: 22,
    highNoon: false, shadows: [],
  };
  if (Game.deep.sun) updateShadows(Game.deep);
}
function onIce(x, y) {
  const D = Game.deep; if (!D || !D.ice.length) return false;
  for (const pu of D.ice) if (dist2(x, y, pu.x, pu.y) < (pu.r * 0.92) ** 2) return true;
  return false;
}
function lapseMul(x, y) {
  const D = Game.deep; if (!D || !D.lapses.length) return 1;
  for (const pu of D.lapses) if (dist2(x, y, pu.x, pu.y) < pu.r * pu.r) return 0.3;
  return 1;
}
/* how hard a warden can move here: the stopped hour drags, a stasis field mires */
function deepMoveMul(x, y) {
  const D = Game.deep; if (!D) return 1;
  /* THE UNKNOWN's STILLED FIELDS drag at your boots too (entities/unknown-runes.js) */
  return (D.stillT > 0 ? 0.55 : 1) * lapseMul(x, y) * (Game.inUnknown ? unkFieldMul(x, y) : 1);
}
/* enemy integration: stasis fields mire them, black ice makes them skid */
function deepMoveEnemy(e, dt) {
  let vx = e.vx, vy = e.vy;
  const D = Game.deep;
  if (D) {
    if (D.lapses.length) { const m = lapseMul(e.x, e.y); vx *= m; vy *= m; }
    if (D.ice.length && !e.boss && !e.ghost && !e.noclip && !e.airLeap && onIce(e.x, e.y)) {
      if (e.ivx === undefined) { e.ivx = vx; e.ivy = vy; }
      const k = 1 - Math.exp(-2.6 * dt);
      e.ivx += (vx - e.ivx) * k; e.ivy += (vy - e.ivy) * k;
      vx = e.ivx; vy = e.ivy;
    } else { e.ivx = vx; e.ivy = vy; }
  }
  e.x += vx * dt; e.y += vy * dt;
}

/* per-frame: the stopped hour, stasis fields, the star. Returns true while the hour is STILL. */
function deepTick(dt) {
  const D = Game.deep; if (!D) return false;
  const still = D.stillT > 0;
  if (still) { D.stillT -= dt; if (D.stillT <= 0) { D.stillT = 0; deepHourResumes(); } }
  D.lapses.length = 0;
  for (const pu of puddles) if (pu.lapse) D.lapses.push(pu);
  for (const rc of MAP.rocks) {
    if (rc.ringT > 0) rc.ringT -= dt;
    if (rc.glintT > 0) rc.glintT -= dt;
  }
  if (D.sun && !Game.inSaloon) tickStar(D, dt);
  return still;
}
/* a shot fired into the stopped hour hangs off the muzzle; the next ones stack behind it */
function deepBankBullet(b) {
  if (b.banked) return;
  b.banked = true;
  if (b.t < 0.05) {
    const n = Game.deep.bankN++ % 40, sp = Math.hypot(b.vx, b.vy) || 1;
    b.x += b.vx / sp * n * 6; b.y += b.vy / sp * n * 6;
  }
}
function deepHourResumes() {
  const D = Game.deep;
  const n = bullets.filter(b => b.banked && b.t < 0.05).length;
  D.bankN = 0;
  const p = localPlayer();
  if (n >= 4 && p) floatText(p.x, p.y - 34, "BANKED ×" + n, "#fff3c8", 18, { life: 1.2, vy: 30, outline: "#0b0b14" });
  AudioFX.bell();
  Game.shake = Math.max(Game.shake, 6);
}

/* ---------- THE LAST LIVING STAR: the star, its shadows and its flares ---------- */
function updateShadows(D) {
  D.shadows.length = 0;
  if (D.highNoon) return;
  const dx0 = MAP.w / 2 - D.starX, dy0 = MAP.h / 2 - D.starY, l = Math.hypot(dx0, dy0) || 1;
  const dx = dx0 / l, dy = dy0 / l, L = 300;
  for (const rc of MAP.rocks) {
    const cs = [[rc.x, rc.y], [rc.x + rc.w, rc.y], [rc.x + rc.w, rc.y + rc.h], [rc.x, rc.y + rc.h]];
    const poly = deepHull(cs.concat(cs.map(q => [q[0] + dx * L, q[1] + dy * L])));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    D.shadows.push({ poly, x0, y0, x1, y1 });
  }
}
function deepHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
function inShade(x, y) {
  const D = Game.deep; if (!D || D.highNoon) return false;
  for (const s of D.shadows) {
    if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
    let ins = false;
    const P = s.poly;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if (((P[i][1] > y) !== (P[j][1] > y)) && (x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) ins = !ins;
    }
    if (ins) return true;
  }
  return false;
}
function tickStar(D, dt) {
  D.starX = MAP.w / 2 + MAP.w * 0.42 * Math.sin(Game.time * 0.035);
  /* the star crawls ~40px/s a thousand pixels off — re-cast the shadows a few times a
     second (or when stone comes and goes), not every frame: no per-frame hull churn on phones */
  D.shadowT = (D.shadowT || 0) - dt;
  if (D.shadowT <= 0 || D.shadowN !== MAP.rocks.length) { D.shadowT = 0.3; D.shadowN = MAP.rocks.length; updateShadows(D); }
  const fighting = enemies.some(e => !e.dead);
  D.flareT -= dt;
  if (D.flareSt === "calm") {
    if (D.flareT <= 0) {
      if (fighting) { D.flareSt = "warn"; D.flareT = 2.0; toast(D.highNoon ? "THE STAR SWELLS — THERE IS NO SHADE" : "THE STAR SWELLS — FIND SHADE"); AudioFX.starSwell(); }
      else D.flareT = 1;                                     // it waits for a fight
    }
  } else if (D.flareSt === "warn") {
    if (D.flareT <= 0) { D.flareSt = "flare"; D.flareT = 1.2; D.flareId++; Game.shake = Math.max(Game.shake, 8); AudioFX.nova(); }
  } else {
    /* everything standing in the light catches the BRAND — warden and horror alike */
    for (const p of alivePlayers()) {
      if (p.flareSeen === D.flareId || p.dashT > 0 || p.veilT > 0 || inShade(p.x, p.y)) continue;
      p.flareSeen = D.flareId;
      applyCurse(p, "brand", 3, false);
      floatText(p.x, p.y - 28, "SCORCHED", "#ffe2a0", 14, { outline: "#0b0b14" });
    }
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.flareSeen === D.flareId || inShade(e.x, e.y)) continue;
      e.flareSeen = D.flareId;
      e.burnT = Math.max(e.burnT, 3); e.burnDps = Math.max(e.burnDps, 4 + depth()); e.burnBy = null;
    }
    if (D.flareT <= 0) { D.flareSt = "calm"; D.flareT = D.flareEvery; }
  }
}

/* =========================================================
   THE SIX HORRORS (+ the wardens' bound bodies)
   ========================================================= */
Object.assign(ETYPES, {
  /* --- floor VI: MOURNER — frozen while any warden's aim is on it --- */
  mourner: {
    hp: 60, r: 15, speed: 330, color: "#dfefff", score: 35,
    init: e => { e.watched = true; },
    ai: (e, dt) => {
      let watched = false;
      for (const p of alivePlayers()) {
        if (dist2(e.x, e.y, p.x, p.y) > 700 * 700) continue;
        if (Math.abs(angDiff(angTo(p.x, p.y, e.x, e.y), p.aim)) < 0.61) { watched = true; break; }
      }
      if (watched !== e.watched && !watched) AudioFX.dash();
      e.watched = watched;
      if (watched) { e.vx = e.vy = 0; }
      else {
        const P = nearestPlayer(e.x, e.y), a = angTo(e.x, e.y, P.x, P.y);
        e.vx = Math.cos(a) * e.speed * e.slowMul; e.vy = Math.sin(a) * e.speed * e.slowMul;
        if (Math.random() < dt * 14) particles.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-20, 20), vy: rnd(-30, 0), t: 0, life: 0.35, r: rnd(1.5, 3), color: "#bfe6ff" });
      }
      contactHurt(e, 2, 18);
    } },

  /* --- floor VI, second horror: LAPSE — break the cage and the moment spills --- */
  lapse: {
    hp: 18, r: 10, speed: 60, color: "#e6c27a", score: 15,
    init: e => { e.bob = rnd(0, TAU); },
    ai: (e, dt) => {
      const P = nearestPlayer(e.x, e.y);
      e.bob += dt * 2.5;
      const a = angTo(e.x, e.y, P.x, P.y) + Math.sin(e.bob) * 0.9;
      const want = dist2(e.x, e.y, P.x, P.y) > 260 * 260 ? 1 : -0.4;
      e.vx = Math.cos(a) * e.speed * want * e.slowMul; e.vy = Math.sin(a) * e.speed * want * e.slowMul;
    },
    onDeath: e => {
      puddles.push({ x: e.x, y: e.y, r: 110, t: 0, life: 3, team: "e", dmg: 0, color: "#e6c27a", tickMap: {}, lapse: true });
      floatText(e.x, e.y - 22, "THE MOMENT SPILLS", "#e6c27a", 13, { life: 1.2, vy: 20, outline: "#0b0b14" });
      AudioFX.portal();
    } },

  /* --- floor VII: LUMEN — a hairline, a hold, then a lance that bends off the glass --- */
  lumen: {
    hp: 26, r: 11, speed: 90, color: "#fff3c8", score: 25,
    init: e => { e.phase = "drift"; e.pt = rnd(1.5, 2.6); e.beam = null; },
    ai: (e, dt) => {
      const P = nearestPlayer(e.x, e.y);
      const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y)), a = angTo(e.x, e.y, P.x, P.y);
      e.pt -= dt;
      if (e.phase === "drift") {
        const want = d > 450 ? 1 : d < 300 ? -1 : 0;
        const strafe = Math.sin(Game.time * 1.3 + e.id) > 0 ? 1 : -1;
        e.vx = (Math.cos(a) * want + Math.cos(a + Math.PI / 2) * strafe * 0.5) * e.speed * e.slowMul;
        e.vy = (Math.sin(a) * want + Math.sin(a + Math.PI / 2) * strafe * 0.5) * e.speed * e.slowMul;
        if (e.pt <= 0 && d < 900) { e.phase = "aim"; e.pt = 0.8; e.beam = castBeam(e.x, e.y, a, 2, 1500); e.vx = e.vy = 0; AudioFX.zap(); }
      } else if (e.phase === "aim") {
        e.vx = e.vy = 0;
        if (e.pt <= 0) { e.phase = "burn"; e.pt = 0.15; e.burned = []; AudioFX.lance(); }
      } else {
        e.vx = e.vy = 0;
        for (const p of alivePlayers())
          if (!e.burned.includes(p.idx) && beamTouches(e.beam, p.x, p.y, p.r + 5)) { e.burned.push(p.idx); hurtPlayer(p, 14, e); }
        if (e.pt <= 0) { e.phase = "drift"; e.pt = rnd(2.2, 3.4); e.beam = null; }
      }
    } },

  /* --- floor VII, second horror: PENITENT — shoot its mirror and your shot comes home --- */
  penitent: {
    hp: 80, r: 17, speed: 70, color: "#b8c4d6", score: 40,
    init: e => { e.faceA = rnd(0, TAU); e.glintT = 3; },
    ai: (e, dt) => {
      const P = nearestPlayer(e.x, e.y);
      e.faceA += clamp(angDiff(angTo(e.x, e.y, P.x, P.y), e.faceA), -1.2 * dt, 1.2 * dt);
      e.vx = Math.cos(e.faceA) * e.speed * e.slowMul; e.vy = Math.sin(e.faceA) * e.speed * e.slowMul;
      e.glintT -= dt;
      if (e.glintT <= 0) {
        e.glintT = 3;
        for (const p of alivePlayers())
          if (dist2(e.x, e.y, p.x, p.y) < 160 * 160 && Math.abs(angDiff(angTo(e.x, e.y, p.x, p.y), e.faceA)) < 0.52) hurtPlayer(p, 10, e);
        for (let k = 0; k < 10; k++) {
          const aa = e.faceA + rnd(-0.5, 0.5), sp = rnd(160, 320);
          particles.push({ x: e.x, y: e.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, t: 0, life: 0.3, r: rnd(1.5, 3), color: "#ffffff" });
        }
        AudioFX.zap();
      }
      contactHurt(e, 2, 14);
    } },

  /* --- floor VIII: DRIFTER — a gunslinger who never found the way home. Count to six. --- */
  drifter: {
    hp: 45, r: 13, speed: 150, color: "#e8c9a0", score: 40,
    init: e => { e.phase = "aim"; e.shots = 6; e.pt = rnd(0.8, 1.6); e.dashCd = 1; e.strafe = Math.random() < 0.5 ? 1 : -1; e.dashT = 0; e.dashA = 0; },
    ai: (e, dt) => {
      const P = nearestPlayer(e.x, e.y);
      const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y)), a = angTo(e.x, e.y, P.x, P.y);
      e.pt -= dt; e.dashCd -= dt;
      if (e.dashT > 0) {
        e.dashT -= dt;
        e.vx = Math.cos(e.dashA) * 520; e.vy = Math.sin(e.dashA) * 520;
        if (e.dashT <= 0) e.ghost = false;
        return;
      }
      /* a warden's shot closing in: a puff of dust and it's elsewhere */
      if (e.dashCd <= 0) for (const b of bullets) {
        if (dist2(b.x, b.y, e.x, e.y) < 80 * 80) {
          e.dashA = Math.atan2(b.vy, b.vx) + e.strafe * Math.PI / 2;
          e.dashT = 0.2; e.ghost = true; e.dashCd = 3;
          for (let k = 0; k < 8; k++) particles.push({ x: e.x, y: e.y + 6, vx: rnd(-70, 70), vy: rnd(-40, 10), t: 0, life: rnd(0.3, 0.6), r: rnd(2, 4), color: "#8a6a58" });
          AudioFX.dash();
          return;
        }
      }
      if (Math.random() < dt * 0.4) e.strafe *= -1;
      const want = d > 400 ? 1 : d < 250 ? -1 : 0;
      const sp = e.speed * (e.phase === "reload" ? 0.6 : 1) * e.slowMul;
      e.vx = (Math.cos(a) * want + Math.cos(a + Math.PI / 2) * e.strafe * 0.7) * sp;
      e.vy = (Math.sin(a) * want + Math.sin(a + Math.PI / 2) * e.strafe * 0.7) * sp;
      if (e.phase === "aim") {
        if (e.pt <= 0 && d < 750 && !lineBlocked(e.x, e.y, P.x, P.y)) { e.phase = "fire"; e.pt = 0; }
      } else if (e.phase === "fire") {
        if (e.pt <= 0) {
          e.pt = 0.18; e.shots--;
          const aa = a + rnd(-0.06, 0.06);
          ebullets.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 340, vy: Math.sin(aa) * 340, r: 5, dmg: 11, t: 0, color: "#e8c9a0", wrath: e.wrath, rime: e.rime, sear: e.sear });
          AudioFX.enemyShoot();
          if (e.shots <= 0) { e.phase = "reload"; e.pt = 1.6; floatText(e.x, e.y - e.r - 12, "CLICK", "#e8c9a0", 12); }
        }
      } else if (e.pt <= 0) { e.phase = "aim"; e.shots = 6; e.pt = rnd(0.4, 0.9); }
      contactHurt(e, 2, 10);
    } },

  /* --- floor VIII, second horror: CARRION — wheels out of reach, comes down for what glitters --- */
  carrion: {
    hp: 30, r: 11, speed: 0, color: "#c98aa0", score: 30,
    init: e => { e.phase = "wheel"; e.pt = rnd(3, 5); e.orbA = rnd(0, TAU); e.ghost = true; e.noclip = true; e.high = true; e.carry = null; e.target = null; },
    ai: (e, dt) => {
      const P = nearestPlayer(e.x, e.y);
      e.pt -= dt;
      if (e.phase === "wheel") {
        e.ghost = true; e.noclip = true; e.high = true;
        e.orbA += dt * 0.9;
        const tx = P.x + Math.cos(e.orbA) * 240, ty = P.y + Math.sin(e.orbA) * 240;
        e.vx = clamp((tx - e.x) * 2, -360, 360); e.vy = clamp((ty - e.y) * 2, -360, 360);
        /* a rune orb left lying draws a dive — one bird per orb */
        const orb = pickups.find(k => k.t > 4 && !enemies.some(o => o !== e && (o.carry === k || o.target === k)));
        if (orb) { e.target = orb; e.mx = orb.x; e.my = orb.y; }
        else if (e.pt <= 0) { e.target = null; e.mx = P.x; e.my = P.y; }
        if (orb || e.pt <= 0) {
          e.phase = "dive"; e.pt = 0.7;
          shockwaves.push({ x: e.mx, y: e.my, r: 4, max: 44, speed: 60, dmg: 0, hostile: false, color: "#c98aa0", hitSet: new Set() });
        }
      } else if (e.phase === "dive") {
        const k = Math.max(0.05, e.pt);
        e.vx = (e.mx - e.x) / k; e.vy = (e.my - e.y) / k;
        if (e.pt <= 0) {
          e.x = e.mx; e.y = e.my; e.vx = e.vy = 0;
          e.ghost = false; e.noclip = false; e.high = false;
          const i = e.target ? pickups.indexOf(e.target) : -1;
          if (i >= 0) {
            e.carry = pickups.splice(i, 1)[0]; e.target = null;
            e.phase = "carry"; e.pt = 8;
            floatText(e.x, e.y - 24, "IT TAKES THE RUNE", "#c98aa0", 14, { outline: "#0b0b14" });
            toast("A CARRION HAS YOUR RUNE ORB — BRING IT DOWN");
          } else { e.phase = "ground"; e.pt = 1.5; contactHurt(e, 6, 12); }
        }
      } else if (e.phase === "ground") {
        e.vx = e.vy = 0;
        contactHurt(e, 2, 12);
        if (e.pt <= 0) e.phase = "wheel", e.pt = rnd(4, 6);
      } else {
        /* carrying: low and slow, away from you — shootable */
        const a = angTo(P.x, P.y, e.x, e.y) + Math.sin(Game.time * 2 + e.id) * 0.7;
        e.vx = Math.cos(a) * 130 * e.slowMul; e.vy = Math.sin(a) * 130 * e.slowMul;
        if (e.carry) { e.carry.x = e.x; e.carry.y = e.y; }
        if (e.pt <= 0) {
          /* it gets away with it */
          e.carry = null; e.dead = true;
          toast("THE CARRION ESCAPES WITH YOUR RUNE");
          if (e.ambush && Game.ambush && --Game.ambush.remaining <= 0) openChest(Game.ambush.chest);
        }
      }
    },
    onDeath: e => {
      if (!e.carry) return;
      e.carry.x = e.x; e.carry.y = e.y; e.carry.t = 0;
      pickups.push(e.carry); e.carry = null;
      floatText(e.x, e.y - 24, "DROPPED", "#ffd23d", 14);
    } },

  /* --- THE THOUSANDFOLD's reflection: walks the way you walk, mirrored. Three cracks shatter it. --- */
  reflection: {
    hp: 3, r: 20, speed: 0, color: "#eef2ff", score: 0,
    init: e => { e.noclip = true; e.ax = e.x; e.ay = e.y; e.axis = 0; e.p0x = 0; e.p0y = 0; },
    ai: (e, dt) => {
      const B = Game.boss;
      if (!B || B.kind !== DEEP_GLASS || B.whiteout) {
        /* collapses back into the real body */
        if (B) for (let k = 0; k < 14; k++) {
          const t = rnd(0, 1);
          particles.push({ x: lerp(e.x, B.x, t), y: lerp(e.y, B.y, t), vx: (B.x - e.x) * 0.8, vy: (B.y - e.y) * 0.8, t: 0, life: 0.4, r: rnd(1.5, 3), color: "#ffffff" });
        }
        e.dead = true; return;
      }
      const P = players[0];
      const dx = P.x - e.p0x, dy = P.y - e.p0y;
      const tx = clamp(e.ax + (e.axis === 1 ? dx : -dx), 70, MAP.w - 70);
      const ty = clamp(e.ay + (e.axis === 0 ? dy : -dy), 70, MAP.h - 70);
      e.vx = (tx - e.x) * 10; e.vy = (ty - e.y) * 10;
    },
    onDeath: e => {
      deepRing(e.x, e.y, 8, 240, 10, "#eef2ff", rnd(0, TAU));
      AudioFX.pane(1046); AudioFX.nova();
    } },

  /* --- THE OTHER GUNSLINGERS' lieutenants: hollow copies of the Vault's own --- */
  hollow: {
    hp: 100, r: 22, speed: 120, color: "#ff5470", score: 0,
    init: e => { e.sub = "wraith"; e.phase = "stalk"; e.pt = 2; e.marks = []; },
    ai: (e, dt) => hollowAI(e, dt),
    onDeath: e => {
      const B = Game.boss;
      if (B && B.kind === DEEP_STAR) { B.inherit.push(e.sub); floatText(B.x, B.y - B.r - 30, "HE TAKES UP ITS GUN", "#ff5470", 16, { outline: "#0b0b14" }); }
    } },
});

/* a warden's shot meeting a Penitent's mirror (its front 120°) comes straight back */
function penitentReflects(e, b) {
  return Math.abs(angDiff(angTo(e.x, e.y, b.x, b.y), e.faceA)) < Math.PI / 3;
}
function penitentBounce(e, b) {
  const sp = Math.min(Math.hypot(b.vx, b.vy) || 300, 420), a = Math.atan2(-b.vy, -b.vx);
  ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: clamp(b.r, 4, 7),
    dmg: clamp(b.dmg * 0.5, 4, 16), t: 0, color: "#b8c4d6" });
  e.hitFlash = 0.06;
  AudioFX.pane(880);
}

/* =========================================================
   THE WARDENS — kinds 5..7 run here instead of bosses.js bossAI()
   ========================================================= */
const DEEP_PROF = [
  { r: 44, hpMul: 1.5, spd: 70 },    // 5 · THE HOURGLASS SAINT
  { r: 40, hpMul: 1.4, spd: 80 },    // 6 · THE THOUSANDFOLD
  { r: 30, hpMul: 0.9, spd: 110 },   // 7 · THE HOLLOW GUNSMITH — 45% of the posse's pooled ×2.0
];
const DEEP_INTRO = [
  "THE HOURGLASS SAINT TURNS — THE LAST SECOND IS ITS TO SPEND",
  "THE THOUSANDFOLD WAKES — WHICH OF IT IS REAL?",
  "THE OTHER GUNSLINGERS DRAW — THEY STILL WANT YOUR RUNES",
];

function deepBossInit(b) {
  Object.assign(b, {
    tolls: 0, gapA: 0, swingT: 0, swingBase: 0, handOn: false, handA: -Math.PI / 2, hourOn: false, hourA: -Math.PI / 2,
    strikeT: 12, lastRing: null, stillOn: false, cageT: -1, lastAtk: "",
    lances: [], lanceT: 0, reflT: 8, whiteout: false, choirQ: [], choirT: 0, shatterQ: [], shatterT: 0, spiralN: 0, spiralT: 0, spiralA: 0,
    stolen: [], dmgTaken: 0, covered: false, staggerT: 0, inherit: [], qdT: 0, qdDmg: 0, bellN: 0, barFrac: 1,
    fanN: 0, fanT: 0, fanA: 0, coverT: 0, leanN: 0, shells: [],
  });
  b.minionT = 7.5;
  if (b.kind === DEEP_STAR) spawnPosse(b);
}
function deepBossArrives(b) {
  if (b.kind === DEEP_HOUR) { AudioFX.bell(); floatText(b.x, b.y - b.r - 44, "THE HOUR IS ITS OWN", b.color, 16, { outline: "#0b0b14" }); }
  else if (b.kind === DEEP_GLASS) { for (const rc of MAP.rocks) if (rc.mirror) rc.ringT = 0.9; AudioFX.pane(1046); }
  else { AudioFX.bell(); }
}
/* the warden is down — its stopped hour and its lances die with it */
function deepBossCleanup(b) {
  if (Game.deep) Game.deep.stillT = 0;
  if (b && b.kind === DEEP_STAR) posseReturnRunes(b);
}

function deepBossAI(b, dt) {
  const P = nearestPlayer(b.x, b.y);
  /* phase gates: the Saint and the Thousandfold at 66% / 33%; the posse by bodies */
  let np;
  if (b.kind === DEEP_STAR) { const n = posseLts().length; np = Math.max(b.phase, n >= 2 ? 1 : n === 1 ? 2 : 3); }
  else { const frac = b.hp / b.maxHp; np = Math.max(b.phase, frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3); }
  if (np !== b.phase) {
    b.phase = np; b.at = 0.8; b.atk = "idle"; b.lances = []; b.stillOn = false;
    if (Game.deep) Game.deep.stillT = 0;
    Game.shake = 12; AudioFX.bossRoar();
    deepBossPhase(b);
  }
  if (b.airborne) { deepAirborne(b, dt); return; }
  b.spd = b.baseSpd + (b.phase - 1) * 20;
  b.at -= dt;
  if (b.kind === DEEP_HOUR) saintAI(b, dt, P);
  else if (b.kind === DEEP_GLASS) thousandAI(b, dt, P);
  else posseAI(b, dt, P);
  /* minion tide once enraged */
  b.minionT -= dt;
  if (b.phase >= 3 && b.minionT <= 0) {
    b.minionT = 7.5;
    const mt = b.kind === DEEP_HOUR ? "mourner" : b.kind === DEEP_GLASS ? "lumen" : "drifter";
    for (let i = 0; i < 2; i++) {
      const s = openSpotNear(b, 120, 220);
      enemies.push(spawnEnemy(mt, s.x, s.y));
    }
    floatText(b.x, b.y - b.r - 18, b.kind === DEEP_HOUR ? "MOURN WITH IT" : b.kind === DEEP_GLASS ? "MORE LIGHT" : "RIDE OUT", b.color);
  }
  if (!b.ghost) for (const p of alivePlayers()) {
    if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r + 2) ** 2) {
      hurtPlayer(p, b.kind === DEEP_STAR ? 14 : 16, b);
      if (b.kind === DEEP_HOUR) applyCurse(p, "weight", 1.5, false);
    }
  }
}

function deepBossPhase(b) {
  const D = Game.deep;
  if (b.kind === DEEP_HOUR) {
    if (b.phase === 2) { b.handOn = true; toast("THE HANDS ARE WOUND — THE FLOOR BECOMES A CLOCK"); }
    else { b.handOn = true; b.hourOn = true; b.strikeT = 12; toast("MIDNIGHT — BOTH HANDS RACE"); }
    AudioFX.bell();
  } else if (b.kind === DEEP_GLASS) {
    if (b.phase === 2) {
      toast("IT SPLITS — FIND THE ONE THAT DOES NOT MIRROR YOU");
      /* six new panes rise around the rim */
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + 0.3, vert = k % 2 === 0;
        const x = MAP.w / 2 + Math.cos(a) * MAP.w * 0.36, y = MAP.h / 2 + Math.sin(a) * MAP.h * 0.36;
        const w = vert ? 26 : 150, h = vert ? 150 : 26;
        const rc = raiseBossWall(x - w / 2, y - h / 2, w, h, 0.5);
        if (rc) { rc.mirror = true; rc.pitch = PANE_PITCH[k % PANE_PITCH.length]; }
      }
      for (let k = 0; k < 3; k++) spawnReflection(b, k);
      AudioFX.slam(); Game.shake = 14;
    } else {
      toast("WHITEOUT — THE GLASS BREAKS AND THE LIGHT POURS OUT");
      b.whiteout = true;
      b.shatterQ = MAP.rocks.filter(rc => rc.mirror).sort((p, q) =>
        dist2(p.x + p.w / 2, p.y + p.h / 2, b.x, b.y) - dist2(q.x + q.w / 2, q.y + q.h / 2, b.x, b.y));
      b.shatterT = 0;
      screenFlash(0.3, "255,255,255"); AudioFX.nova();
    }
  } else {
    if (b.phase === 2) {
      toast("ONE FALLS — HE TAKES UP ITS GUN");
      if (D) D.flareEvery = 16;
    } else {
      toast("HIGH NOON — NO SHADE LEFT");
      if (D) { D.highNoon = true; D.flareEvery = 14; D.flareT = Math.min(D.flareT, 6); updateShadows(D); }
    }
    AudioFX.bell();
  }
}

/* PLUNGE (shared shape with bosses.js): rise, hang, crash where the ring says */
function deepStartPlunge(b, P) {
  b.airborne = true; b.ghost = true; b.airT = 2.2;
  b.airDst = { x: clamp(P.x + P.vx * 0.6, 100, MAP.w - 100), y: clamp(P.y + P.vy * 0.6, 100, MAP.h - 100) };
  Game.shake = 10; AudioFX.bossRoar();
  floatText(b.x, b.y - b.r - 20, "ASCENDING", b.color);
}
function deepAirborne(b, dt) {
  b.vx = b.vy = 0;
  b.airT -= dt;
  if (b.airT > 0) return;
  b.x = b.airDst.x; b.y = b.airDst.y;
  b.airborne = false; b.ghost = false;
  Game.shake = 18; AudioFX.slam();
  shockwaves.push({ x: b.x, y: b.y, r: 10, max: 280, speed: 480, dmg: 22, hit: false, hostile: true });
  if (b.kind === DEEP_HOUR) { saintToll(b, rnd(0, TAU)); floatText(b.x, b.y - b.r - 20, "THE HOUR STRIKES", b.color); }
  else { deepRing(b.x, b.y, 16, 250, 12, i => SPECTRUM[i % 7], rnd(0, TAU)); floatText(b.x, b.y - b.r - 20, "SHATTERS", b.color); }
  b.atk = "idle"; b.at = 1.8;
}

/* ---------- VI · THE HOURGLASS SAINT ---------- */
/* a bell: a ring of 24 with one hour-wide gap at gapA */
function saintToll(b, gapA) {
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    if (Math.abs(angDiff(a, gapA)) < 0.29) continue;
    deepShot(b.x, b.y, a, 230, 6, 12, "#bfe6ff");
  }
  b.lastRing = { n: 22, speed: 230, t0: Game.time };
  AudioFX.bell();
}
function saintAI(b, dt, P) {
  const D = Game.deep, still = D && D.stillT > 0;
  const cxs = MAP.w / 2, cys = MAP.h / 2;
  /* the clock hands — a brass blade from the centre to the rim; they stop when the hour does */
  if (b.handOn && !still) {
    b.handA += dt * TAU / (b.phase >= 3 ? 9 : 14);
    if (b.hourOn) {
      const before = angDiff(b.handA, b.hourA);
      b.hourA += dt * TAU / 20;
      const after = angDiff(b.handA, b.hourA);
      if (before < 0 && after >= 0 && Math.abs(before) < 1) {
        /* the hands cross: rime bursts from the crossing */
        const x = cxs + Math.cos(b.hourA) * HOUR_LEN * 0.6, y = cys + Math.sin(b.hourA) * HOUR_LEN * 0.6;
        deepRing(x, y, 10, 220, 12, "#bfe6ff", rnd(0, TAU), { rime: true });
        AudioFX.bell(); Game.shake = Math.max(Game.shake, 8);
      }
    }
    const hands = [[b.handA, HAND_LEN]];
    if (b.hourOn) hands.push([b.hourA, HOUR_LEN]);
    for (const p of alivePlayers()) for (const [ha, hl] of hands) {
      if (segDist2(p.x, p.y, cxs, cys, cxs + Math.cos(ha) * hl, cys + Math.sin(ha) * hl) < (p.r + 10) ** 2 && p.iframes <= 0 && p.dashT <= 0) {
        hurtPlayer(p, 14, null); applyCurse(p, "weight", 2, false);
      }
    }
  }
  /* midnight: the hour strikes on its own between attacks */
  if (b.hourOn && !still) {
    b.strikeT -= dt;
    if (b.strikeT <= 0) { b.strikeT = 12; saintToll(b, rnd(0, TAU)); floatText(b.x, b.y - b.r - 22, "THE HOUR STRIKES", b.color); }
  }
  const a = angTo(b.x, b.y, P.x, P.y);
  if (b.atk === "idle") {
    const d = Math.sqrt(dist2(b.x, b.y, P.x, P.y)), want = d > 320 ? 1 : d < 200 ? -0.6 : 0;
    b.vx = Math.cos(a) * b.spd * want * b.slowMul; b.vy = Math.sin(a) * b.spd * want * b.slowMul;
    if (b.at <= 0) {
      const opts = ["pendulum", "toll", "still", "ring"];
      if (b.phase >= 2) opts.push("rewind", "pendulum", "still");
      if (b.phase >= 3) opts.push("still", "rewind", "plunge");
      let pickA = pick(opts);
      if (pickA === b.lastAtk && pickA === "still") pickA = pick(opts);
      b.atk = pickA; b.lastAtk = pickA;
      if (pickA === "pendulum") { b.swingT = 0; b.swingBase = a; b.st = 0; b.at = 9; }
      else if (pickA === "toll") { b.tolls = 3; b.at = 0.4; b.gapA = rnd(0, TAU); }
      else if (pickA === "still") { b.at = 0.5; floatText(b.x, b.y - b.r - 24, "IT RAISES ITS HANDS", b.color, 14, { outline: "#0b0b14" }); }
      else if (pickA === "ring") b.at = 0.5;
      else if (pickA === "rewind") { b.at = 0.8; floatText(b.x, b.y - b.r - 24, "THE GLASS TURNS", b.color, 14, { outline: "#0b0b14" }); }
      else if (pickA === "plunge") b.at = 0.65;
    }
    return;
  }
  b.vx = b.vy = 0;
  if (b.atk === "pendulum") {
    /* a stream of frost swinging 140°, slowing at each end like a real pendulum */
    b.swingT += dt;
    const t = b.swingT - 0.3;
    if (t > 0) {
      b.swingAng = b.swingBase + 1.22 * Math.sin(TAU * t / 1.1);
      b.st -= dt;
      if (b.st <= 0) { b.st = 0.07; deepShot(b.x, b.y, b.swingAng, 280, 6, 12, "#bfe6ff"); AudioFX.enemyShoot(); }
      if (t >= 2.2) { b.atk = "idle"; b.at = 1.6; }
    }
  } else if (b.atk === "toll") {
    if (b.at <= 0) {
      saintToll(b, b.gapA);
      b.gapA += TAU / 12; b.tolls--;
      b.at = 0.6;
      if (b.tolls <= 0) { b.atk = "idle"; b.at = 1.8; }
    }
  } else if (b.atk === "still") {
    if (!b.stillOn && b.at <= 0) {
      b.stillOn = true; b.cageT = 0.3;
      D.stillT = [1.6, 2.0, 2.4][b.phase - 1]; D.bankN = 0;
      floatText(b.x, b.y - b.r - 26, "THE HOUR STOPS", "#fff3c8", 18, { life: 1.4, vy: 10, outline: "#0b0b14" });
      AudioFX.stillHour(); Game.shake = Math.max(Game.shake, 8);
    }
    if (b.stillOn) {
      if (b.cageT > -1) {
        b.cageT -= dt;
        if (b.cageT <= 0) {
          b.cageT = -9;
          /* it alone walks the stopped hour: a step, then a cage of frozen shot around each warden */
          for (let k = 0; k < 10; k++) particles.push({ x: b.x, y: b.y, vx: rnd(-120, 120), vy: rnd(-120, 120), t: 0, life: 0.5, r: rnd(2, 5), color: b.color });
          const s = openSpotNear(P, 320, 420); b.x = s.x; b.y = s.y;
          for (const p of alivePlayers()) {
            const g1 = rnd(0, TAU), g2 = g1 + rnd(0.9, 2.2);
            for (const [R, gap] of [[170, g1], [240, g2]]) {
              for (let i = 0; i < 18; i++) {
                const ca = i / 18 * TAU;
                if (Math.abs(angDiff(ca, gap)) < 0.36) continue;
                const x = p.x + Math.cos(ca) * R, y = p.y + Math.sin(ca) * R;
                deepShot(x, y, ca + Math.PI, 200, 6, 12, "#fff3c8");
              }
            }
          }
          AudioFX.zap();
        }
      }
      if (!D.stillT) { b.stillOn = false; b.atk = "idle"; b.at = 1.6; }
    }
  } else if (b.atk === "ring") {
    if (b.at <= 0) {
      const n = 14 + b.phase * 2;
      deepRing(b.x, b.y, n, 240, 13, "#e6c27a", rnd(0, TAU));
      b.lastRing = { n, speed: 240, t0: Game.time };
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = clamp(2.6 - b.phase * 0.4, 1, 3);
    }
  } else if (b.atk === "rewind") {
    if (b.at <= 0) {
      /* every hostile shot in flight turns around... */
      for (const s of ebullets) { s.vx = -s.vx; s.vy = -s.vy; }
      /* ...and the last ring it fired re-forms where it reached and falls back into it */
      if (b.lastRing) {
        const R = clamp(b.lastRing.speed * (Game.time - b.lastRing.t0), 120, 650), n = b.lastRing.n;
        for (let i = 0; i < n; i++) {
          const ca = i / n * TAU, x = b.x + Math.cos(ca) * R, y = b.y + Math.sin(ca) * R;
          if (x < 40 || x > MAP.w - 40 || y < 40 || y > MAP.h - 40) continue;
          deepShot(x, y, ca + Math.PI, R / 1.2, 6, 12, "#bfe6ff");
        }
      }
      floatText(b.x, b.y - b.r - 24, "REWOUND", b.color);
      AudioFX.rewind(); Game.shake = Math.max(Game.shake, 8);
      b.atk = "idle"; b.at = 1.8;
    }
  } else if (b.atk === "plunge") {
    if (b.at <= 0) deepStartPlunge(b, P);
  } else { b.atk = "idle"; b.at = 0.5; }
}

/* ---------- VII · THE THOUSANDFOLD ---------- */
function spawnReflection(b, axis) {
  const P = players[0];
  const a = axis / 3 * TAU + rnd(-0.3, 0.3);
  const r = spawnEnemy("reflection", clamp(b.x + Math.cos(a) * 260, 90, MAP.w - 90), clamp(b.y + Math.sin(a) * 260, 90, MAP.h - 90));
  r.hp = r.maxHp = 3;
  r.ax = r.x; r.ay = r.y; r.axis = axis % 3; r.p0x = P.x; r.p0y = P.y;
  r.spawnT = 0.5;
  enemies.push(r);
  for (let k = 0; k < 12; k++) {
    const t = rnd(0, 1);
    particles.push({ x: lerp(b.x, r.x, t), y: lerp(b.y, r.y, t), vx: rnd(-20, 20), vy: rnd(-20, 20), t: 0, life: 0.5, r: rnd(1.5, 3), color: "#eef2ff" });
  }
}
function reflections() { return enemies.filter(e => e.type === "reflection" && !e.dead); }
/* the real body fires, and every reflection fires a half-strength copy */
function tfVolley(b, fn) {
  fn(b, 1);
  for (const r of reflections()) if (r.spawnT <= 0) fn(r, 0.5);
}
function thousandAI(b, dt, P) {
  /* the whiteout: it only gives — a steady push away from the core */
  if (b.whiteout) {
    for (const p of alivePlayers()) {
      const d = Math.sqrt(dist2(b.x, b.y, p.x, p.y));
      if (d < 700 && d > 1 && p.dashT <= 0) {
        const aa = angTo(b.x, b.y, p.x, p.y), push = 120 * (1 - d / 700);
        p.x += Math.cos(aa) * push * dt; p.y += Math.sin(aa) * push * dt;
        collideWorld(p);
      }
    }
    /* the panes shatter outward from it, one after another */
    if (b.shatterQ.length) {
      b.shatterT -= dt;
      if (b.shatterT <= 0) {
        b.shatterT = 0.1;
        const rc = b.shatterQ.shift(), i = MAP.rocks.indexOf(rc);
        if (i >= 0) {
          MAP.rocks.splice(i, 1);
          const j = Game.bossRocks.indexOf(rc); if (j >= 0) Game.bossRocks.splice(j, 1);
          deepRing(rc.x + rc.w / 2, rc.y + rc.h / 2, 10, 230, 10, "#eef2ff", rnd(0, TAU));
          for (let k = 0; k < 10; k++) particles.push({ x: rc.x + rnd(0, rc.w), y: rc.y + rnd(0, rc.h), vx: rnd(-160, 160), vy: rnd(-160, 160), t: 0, life: rnd(0.3, 0.7), r: rnd(1.5, 3.5), color: "#eef2ff" });
          AudioFX.pane(PANE_PITCH[i % PANE_PITCH.length]);
        }
      }
    }
  }
  /* split: a lost reflection steps back out of the real body */
  if (b.phase === 2 && !b.whiteout) {
    const rs = reflections();
    if (rs.length < 3) {
      b.reflT -= dt;
      if (b.reflT <= 0) {
        b.reflT = 8;
        const have = new Set(rs.map(r => r.axis));
        spawnReflection(b, [0, 1, 2].find(k => !have.has(k)) || 0);
      }
    }
  }
  const a = angTo(b.x, b.y, P.x, P.y);
  if (b.atk === "idle") {
    /* it walks its own slow figure — the one body that never answers your steps */
    const wob = Math.sin(Game.time * 0.7) * 1.2;
    const d = Math.sqrt(dist2(b.x, b.y, P.x, P.y)), want = d > 420 ? 1 : d < 260 ? -0.7 : 0.15;
    b.vx = (Math.cos(a) * want + Math.cos(a + Math.PI / 2) * wob * 0.5) * b.spd * b.slowMul;
    b.vy = (Math.sin(a) * want + Math.sin(a + Math.PI / 2) * wob * 0.5) * b.spd * b.slowMul;
    if (b.at <= 0) {
      const opts = ["lance", "spectrum", "glint", "ring"];
      if (b.phase >= 2) opts.push("choir", "lance", "spectrum");
      if (b.phase >= 3) opts.push("return", "lance", "plunge");
      b.atk = pick(opts);
      if (b.atk === "choir" && b.whiteout) b.atk = "lance";
      if (b.atk === "lance") {
        b.lanceT = 0; b.at = 9;
        const spread = b.phase >= 2 ? [-0.17, 0.17] : [0];
        b.lances = spread.map(o => castBeam(b.x, b.y, a + o, 3, 2000));
        AudioFX.zap();
      } else if (b.atk === "spectrum") b.at = 0.4;
      else if (b.atk === "glint") {
        b.at = 0.45;
        let best = null, bd = Infinity;
        for (const rc of MAP.rocks) if (rc.mirror) { const d2 = dist2(rc.x + rc.w / 2, rc.y + rc.h / 2, b.x, b.y); if (d2 < bd) { bd = d2; best = rc; } }
        b.glintRock = best; if (best) best.glintT = 0.5;
      } else if (b.atk === "ring") b.at = 0.5;
      else if (b.atk === "choir") {
        b.choirQ = MAP.rocks.filter(rc => rc.mirror).sort((p, q) =>
          Math.atan2(p.y + p.h / 2 - MAP.h / 2, p.x + p.w / 2 - MAP.w / 2) - Math.atan2(q.y + q.h / 2 - MAP.h / 2, q.x + q.w / 2 - MAP.w / 2));
        b.choirT = 0.3; b.at = 9;
        floatText(b.x, b.y - b.r - 24, "THE CHOIR SINGS", b.color, 14, { outline: "#0b0b14" });
      } else if (b.atk === "return") {
        const fed = Math.min(60, Game.horizonFed || 0);
        b.spiralN = 12 + fed; b.spiralT = 0.5; b.spiralA = a; b.at = 9;
        floatText(b.x, b.y - b.r - 26, fed ? "WHAT YOU FED THE HORIZON, IT GIVES BACK" : "NOTHING TO RETURN", "#fff3c8", 15, { life: 1.6, vy: 14, outline: "#0b0b14" });
      } else if (b.atk === "plunge") b.at = 0.65;
    }
    return;
  }
  b.vx = b.vy = 0;
  if (b.atk === "lance") {
    /* hold the hairline 0.9s, then burn 0.6s — 18 a touch, ticking every 0.3s */
    b.lanceT += dt;
    if (b.lanceT >= 0.9 && !b.lanceBurn) { b.lanceBurn = true; AudioFX.lance(); Game.shake = Math.max(Game.shake, 6); }
    if (b.lanceBurn) for (const p of alivePlayers()) {
      p.lanceTick = (p.lanceTick || 0) - dt;
      if (p.lanceTick <= 0 && b.lances.some(L => beamTouches(L, p.x, p.y, p.r + 6))) { p.lanceTick = 0.3; hurtPlayer(p, 18, null); }
    }
    if (b.lanceT >= 1.5) { b.lances = []; b.lanceBurn = false; b.atk = "idle"; b.at = 1.4; }
  } else if (b.atk === "spectrum") {
    if (b.at <= 0) {
      tfVolley(b, (s, m) => deepShot(s.x, s.y, angTo(s.x, s.y, P.x, P.y), 150, 14, 12 * m, "#ffffff", { prism: true, dmgMul: m }));
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 1.7;
    }
  } else if (b.atk === "glint") {
    if (b.at <= 0) {
      const rc = b.glintRock;
      tfVolley(b, (s, m) => {
        const aa = angTo(s.x, s.y, P.x, P.y);
        for (const o of [-0.08, 0, 0.08]) deepShot(s.x, s.y, aa + o, 420, 4, 10 * m, "#ffffff");
        /* two banked off the pane: aimed at your reflection in its glass */
        let img = null;
        if (rc) {
          if (s.x < rc.x && P.x < rc.x) img = [2 * rc.x - P.x, P.y];
          else if (s.x > rc.x + rc.w && P.x > rc.x + rc.w) img = [2 * (rc.x + rc.w) - P.x, P.y];
          else if (s.y < rc.y && P.y < rc.y) img = [P.x, 2 * rc.y - P.y];
          else if (s.y > rc.y + rc.h && P.y > rc.y + rc.h) img = [P.x, 2 * (rc.y + rc.h) - P.y];
        }
        const ba = img ? angTo(s.x, s.y, img[0], img[1]) : aa;
        for (const o of [-0.04, 0.04]) deepShot(s.x, s.y, ba + o, 420, 4, 10 * m, "#eef2ff");
      });
      AudioFX.zap();
      b.atk = "idle"; b.at = 1.5;
    }
  } else if (b.atk === "ring") {
    if (b.at <= 0) {
      const n = 14 + b.phase * 2, off = rnd(0, TAU);
      tfVolley(b, (s, m) => deepRing(s.x, s.y, n, 240, 13 * m, i => SPECTRUM[i % 7], off));
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = clamp(2.6 - b.phase * 0.4, 1, 3);
    }
  } else if (b.atk === "choir") {
    b.choirT -= dt;
    if (b.choirT <= 0) {
      b.choirT = 0.15;
      const rc = b.choirQ.shift();
      if (rc && MAP.rocks.includes(rc)) {
        rc.ringT = 0.4;
        deepRing(rc.x + rc.w / 2, rc.y + rc.h / 2, 6, 220, 10, "#eef2ff", rnd(0, TAU));
        AudioFX.pane(rc.pitch || 659);
      }
      if (!b.choirQ.length) { b.atk = "idle"; b.at = 1.6; }
    }
  } else if (b.atk === "return") {
    b.spiralT -= dt;
    if (b.spiralT <= 0) {
      b.spiralT = 0.04;
      for (let k = 0; k < 2 && b.spiralN > 0; k++, b.spiralN--) {
        deepShot(b.x, b.y, b.spiralA + k * Math.PI, 260, 6, 12, "#fff3c8");
      }
      b.spiralA += 0.35;
      AudioFX.zap();
      if (b.spiralN <= 0) { b.atk = "idle"; b.at = 2.0; }
    }
  } else if (b.atk === "plunge") {
    if (b.at <= 0) deepStartPlunge(b, P);
  } else { b.atk = "idle"; b.at = 0.5; }
}
/* a prism orb splits into seven coloured bolts aimed at you — after 1s, or on touching stone */
function prismSplit(b) {
  const P = nearestPlayer(b.x, b.y), a = angTo(b.x, b.y, P.x, P.y), m = b.dmgMul || 1;
  for (let i = 0; i < 7; i++) deepShot(b.x, b.y, a + (i - 3) * 0.16, 280, 6, 11 * m, SPECTRUM[i]);
  AudioFX.pane(1046);
}

/* ---------- VIII · THE OTHER GUNSLINGERS ---------- */
const HOLLOW_LOOK = {
  wraith:        { r: 22, color: "#f0b8c8", share: 0.25 },
  juggernaut:    { r: 28, color: "#ff8f6b", share: 0.30 },
  demolitionist: { r: 24, color: "#ffb35e", share: 0.30 },
};
function spawnPosse(b) {
  const me = localPlayer() ? localPlayer().char : "gunsmith";
  /* the lieutenants never wear your face: the Demolitionist takes the seat */
  const subs = ["wraith", "juggernaut"].map(s => s === me ? "demolitionist" : s);
  const pool = b.maxHp / 0.45;
  b.poolMax = pool;                       // the bar counts all three bodies, dead or alive
  subs.forEach((sub, i) => {
    const L = HOLLOW_LOOK[sub];
    const e = spawnEnemy("hollow", clamp(b.x + (i ? 170 : -170), 90, MAP.w - 90), b.y + 40);
    e.sub = sub; e.r = L.r; e.color = L.color;
    e.hp = e.maxHp = pool * (sub === "demolitionist" ? (i ? 0.30 : 0.25) : L.share);
    e.spawnT = 1.4; e.phase = "stalk"; e.pt = rnd(1.5, 2.5);
    enemies.push(e);
  });
}
function posseLts() { return enemies.filter(e => e.type === "hollow" && !e.dead); }
function hollowAI(e, dt) {
  const P = nearestPlayer(e.x, e.y);
  const d = Math.sqrt(dist2(e.x, e.y, P.x, P.y)), a = angTo(e.x, e.y, P.x, P.y);
  e.pt -= dt;
  if (e.sub === "wraith") {
    if (e.phase === "stalk") {
      e.ghost = false;
      e.vx = Math.cos(a) * 140 * e.slowMul; e.vy = Math.sin(a) * 140 * e.slowMul;
      if (e.pt <= 0) { const s = openSpotNear(P, 90, 140); e.tx = s.x; e.ty = s.y; e.phase = "shimmer"; e.pt = 0.5; e.ghost = true; }
    } else if (e.phase === "shimmer") {
      e.vx = e.vy = 0;
      if (e.pt <= 0) {
        for (let k = 0; k < 10; k++) particles.push({ x: e.x, y: e.y, vx: rnd(-90, 90), vy: rnd(-90, 90), t: 0, life: 0.4, r: rnd(2, 4), color: e.color });
        e.x = e.tx; e.y = e.ty; e.ghost = false; e.phase = "burst"; e.pt = 0.45;
      }
    } else if (e.phase === "burst") {
      e.vx = e.vy = 0;
      if (e.pt <= 0) {
        /* VEIL BURST — the hollow circle snaps open */
        for (const p of alivePlayers()) if (dist2(e.x, e.y, p.x, p.y) < 120 * 120) hurtPlayer(p, 20, e);
        shockwaves.push({ x: e.x, y: e.y, r: 10, max: 120, speed: 600, dmg: 0, hostile: false, color: e.color, hitSet: new Set() });
        AudioFX.nova();
        e.phase = "stalk"; e.pt = rnd(2.4, 3.2);
      }
    }
  } else if (e.sub === "juggernaut") {
    if (e.phase === "stalk") {
      const want = d > 360 ? 1 : d < 240 ? -0.5 : 0;
      e.vx = Math.cos(a) * 70 * want * e.slowMul; e.vy = Math.sin(a) * 70 * want * e.slowMul;
      if (e.pt <= 0) { e.phase = "sight"; e.pt = 0.6; }
    } else if (e.phase === "sight") {
      e.vx = e.vy = 0; e.aimA = a;
      if (e.pt <= 0) {
        /* one massive slug — stone doesn't stop it */
        deepShot(e.x, e.y, e.aimA, 360, 14, 24, "#ffe2a0", { pierceRock: true, wrath: e.wrath });
        Game.shake = Math.max(Game.shake, 6); AudioFX.slam();
        e.phase = "stalk"; e.pt = 2.4;
      }
    }
    contactHurt(e, 2, 16);
  } else {
    /* the demolitionist: mortar shells onto marked circles */
    const want = d > 380 ? 1 : d < 260 ? -0.6 : 0.2;
    e.vx = Math.cos(a) * 90 * want * e.slowMul; e.vy = Math.sin(a) * 90 * want * e.slowMul;
    if (e.pt <= 0) {
      e.pt = 3;
      for (let k = 0; k < 3; k++) {
        const s = k ? openSpotNear(P, 40, 160) : { x: P.x, y: P.y };
        e.marks.push({ x: s.x, y: s.y, t: 0, life: 1.0 + k * 0.15 });
      }
      AudioFX.enemyShoot();
    }
    contactHurt(e, 2, 12);
  }
  /* shells in the air (the demolitionist's) */
  for (let i = e.marks.length - 1; i >= 0; i--) {
    const m = e.marks[i]; m.t += dt;
    if (m.t >= m.life) {
      shockwaves.push({ x: m.x, y: m.y, r: 6, max: 90, speed: 420, dmg: 16, hit: false, hostile: true });
      Game.shake = Math.max(Game.shake, 5); AudioFX.slam();
      e.marks.splice(i, 1);
    }
  }
}
/* the lasso landed: one of your runes is his now */
function posseLasso(p) {
  const b = Game.boss;
  if (!b || b.kind !== DEEP_STAR || b.stolen.length >= 3) return;
  const ids = Object.keys(p.runes).filter(id => p.runes[id] > 0);
  if (!ids.length) return;
  const id = pick(ids);
  p.runes[id]--; if (p.runes[id] <= 0) delete p.runes[id];
  recalc(p); refreshRuneStrip();
  b.stolen.push({ id, idx: p.idx });
  floatText(p.x, p.y - 32, "STOLEN " + runeDefFor(p, id).glyph, runeDefFor(p, id).color, 18, { life: 1.4, vy: 24, outline: "#0b0b14" });
  toast("HE TOOK YOUR " + runeDefFor(p, id).name + " — HURT HIM TO TAKE IT BACK");
  for (let k = 0; k < 10; k++) {
    const t = rnd(0, 1);
    particles.push({ x: lerp(p.x, b.x, t), y: lerp(p.y, b.y, t), vx: (b.x - p.x) * 0.6, vy: (b.y - p.y) * 0.6, t: 0, life: 0.4, r: rnd(2, 3), color: runeDefFor(p, id).color });
  }
  AudioFX.zap();
}
function posseGiveBack(b, n) {
  while (n-- > 0 && b.stolen.length) {
    const s = b.stolen.pop(), p = players[s.idx];
    if (!p) continue;
    p.runes[s.id] = (p.runes[s.id] || 0) + 1;
    recalc(p); refreshRuneStrip();
    floatText(p.x, p.y - 32, "RECLAIMED " + runeDefFor(p, s.id).glyph, runeDefFor(p, s.id).color, 18, { life: 1.4, vy: 24, outline: "#0b0b14" });
    AudioFX.pickup();
  }
}
function posseReturnRunes(b) { if (b.stolen && b.stolen.length) posseGiveBack(b, b.stolen.length); }
/* deepDamage (combat.js damageEnemy): the posse's cover, stagger, and what you win back */
function deepDamage(e, dmg) {
  if (e.type === "reflection") return 1;
  if (e.boss && e.kind === DEEP_STAR) {
    if (e.covered) {
      dmg *= 0.25;
      if (Math.random() < 0.1) floatText(e.x, e.y - e.r - 16, "COVERED — DROP HIS POSSE", "#ff5470");
    }
    if (e.staggerT > 0) dmg *= 2;
    if (e.stolen.length) e.dmgTaken += dmg;
    if (e.atk === "quickdraw" && e.qdT >= 0.9 && e.qdT < 1.8) e.qdDmg += dmg;
  }
  return dmg;
}
function posseAI(b, dt, P) {
  const lts = posseLts();
  b.covered = lts.length > 0;
  b.barFrac = (Math.max(0, b.hp) + lts.reduce((s, e) => s + Math.max(0, e.hp), 0)) / (b.poolMax || b.maxHp);
  if (b.staggerT > 0) b.staggerT -= dt;
  /* every 8% of his max you deal while he holds a rune wins one back */
  while (b.stolen.length && b.dmgTaken >= b.maxHp * 0.08) { b.dmgTaken -= b.maxHp * 0.08; posseGiveBack(b, 1); }
  if (!b.stolen.length) b.dmgTaken = 0;
  const pierce = b.inherit.includes("juggernaut");
  const a = angTo(b.x, b.y, P.x, P.y);
  /* his own mortar (inherited from the demolitionist) */
  for (let i = b.shells.length - 1; i >= 0; i--) {
    const m = b.shells[i]; m.t += dt;
    if (m.t >= m.life) { shockwaves.push({ x: m.x, y: m.y, r: 6, max: 90, speed: 420, dmg: 16, hit: false, hostile: true }); AudioFX.slam(); b.shells.splice(i, 1); }
  }
  if (b.atk === "idle") {
    const d = Math.sqrt(dist2(b.x, b.y, P.x, P.y)), want = d > 420 ? 1 : d < 300 ? -1 : 0;
    const strafe = Math.sin(Game.time * 0.9) > 0 ? 1 : -1;
    b.vx = (Math.cos(a) * want + Math.cos(a + Math.PI / 2) * strafe * 0.6) * b.spd * b.slowMul;
    b.vy = (Math.sin(a) * want + Math.sin(a + Math.PI / 2) * strafe * 0.6) * b.spd * b.slowMul;
    if (b.at <= 0) {
      const opts = ["fan", "stickup", "cover", "fan"];
      if (b.phase >= 2) {
        opts.push("stickup");
        if (b.inherit.includes("wraith")) opts.push("blink", "blink");
        if (b.inherit.includes("demolitionist")) opts.push("mortar", "mortar");
      }
      if (b.phase >= 3) opts.push("quickdraw", "fan");
      b.atk = pick(opts);
      if (b.atk === "fan") { b.fanN = 6 + b.stolen.length; b.fanT = 0.25; b.fanA = a - 0.26; b.at = 9; }
      else if (b.atk === "stickup") { b.at = 0.35; floatText(b.x, b.y - b.r - 22, "STICK 'EM UP", "#ffd23d", 14, { outline: "#0b0b14" }); }
      else if (b.atk === "cover") {
        let best = null, bd = Infinity;
        for (const rc of MAP.rocks) { const d2 = dist2(rc.x + rc.w / 2, rc.y + rc.h / 2, b.x, b.y); if (d2 < bd && d2 < 520 * 520) { bd = d2; best = rc; } }
        if (best) {
          const cx0 = best.x + best.w / 2, cy0 = best.y + best.h / 2, ra = angTo(P.x, P.y, cx0, cy0), off = Math.max(best.w, best.h) / 2 + b.r + 24;
          b.coverX = clamp(cx0 + Math.cos(ra) * off, 80, MAP.w - 80); b.coverY = clamp(cy0 + Math.sin(ra) * off, 80, MAP.h - 80);
          b.coverT = 0.6; b.leanN = 3; b.at = 9;
        } else { b.atk = "fan"; b.fanN = 6 + b.stolen.length; b.fanT = 0.25; b.fanA = a - 0.26; b.at = 9; }
      } else if (b.atk === "blink") b.at = 0.5;
      else if (b.atk === "mortar") b.at = 0.3;
      else if (b.atk === "quickdraw") {
        b.qdT = 0; b.bellN = 0; b.qdDmg = 0; b.at = 9;
        floatText(b.x, b.y - b.r - 24, "HE HOLSTERS", "#ffe2a0", 15, { life: 1.2, vy: 10, outline: "#0b0b14" });
      }
    }
    return;
  }
  b.vx = b.vy = 0;
  if (b.atk === "fan") {
    /* fan the hammer: six (plus one per stolen rune) across a tight 30°, then the click */
    b.fanT -= dt;
    if (b.fanT <= 0 && b.fanN > 0) {
      b.fanT = 0.4 / 6;
      const k = b.stolen.length ? b.stolen[b.fanN % b.stolen.length] : null;
      deepShot(b.x, b.y, b.fanA, 360, 6, 12, k && b.fanN <= b.stolen.length ? RUNES[k.id].color : "#ff5470", pierce ? { pierceRock: true } : null);
      b.fanA += 0.52 / 6; b.fanN--;
      AudioFX.enemyShoot();
      if (b.fanN <= 0) { b.atk = "reload"; b.at = 0.8; floatText(b.x, b.y - b.r - 14, "CLICK", "#ff5470", 13); }
    }
  } else if (b.atk === "reload") {
    if (b.at <= 0) { b.atk = "idle"; b.at = 0.9; }
  } else if (b.atk === "stickup") {
    if (b.at <= 0) {
      deepShot(b.x, b.y, a, 200, 9, 10, "#ffd23d", { lasso: true, homing: 1.6 });
      AudioFX.dash();
      b.atk = "idle"; b.at = 1.8;
    }
  } else if (b.atk === "cover") {
    if (b.coverT > 0) {
      b.coverT -= dt;
      const ca = angTo(b.x, b.y, b.coverX, b.coverY), cd = Math.sqrt(dist2(b.x, b.y, b.coverX, b.coverY));
      if (cd > 12) { b.vx = Math.cos(ca) * 700; b.vy = Math.sin(ca) * 700; if (Math.random() < 0.6) particles.push({ x: b.x, y: b.y + 8, vx: rnd(-40, 40), vy: rnd(-30, 0), t: 0, life: 0.4, r: rnd(2, 4), color: "#8a6a58" }); }
      else b.coverT = 0;
      if (b.coverT <= 0) b.st = 0.25;
    } else {
      b.st -= dt;
      if (b.st <= 0 && b.leanN > 0) {
        b.st = 0.22; b.leanN--;
        deepShot(b.x, b.y, a + rnd(-0.04, 0.04), 380, 6, 12, "#ff5470", pierce ? { pierceRock: true } : null);
        AudioFX.enemyShoot();
      }
      if (b.leanN <= 0 && b.st <= 0) { b.atk = "idle"; b.at = 1.2; }
    }
  } else if (b.atk === "blink") {
    if (b.at <= 0) {
      for (let k = 0; k < 12; k++) particles.push({ x: b.x, y: b.y, vx: rnd(-120, 120), vy: rnd(-120, 120), t: 0, life: 0.4, r: rnd(2, 4), color: "#f0b8c8" });
      const s = openSpotNear(P, 150, 190); b.x = s.x; b.y = s.y;
      deepRing(b.x, b.y, 8, 230, 12, "#f0b8c8", rnd(0, TAU));
      AudioFX.portal();
      b.atk = "idle"; b.at = 1.5;
    }
  } else if (b.atk === "mortar") {
    if (b.at <= 0) {
      for (let k = 0; k < 3; k++) { const s = k ? openSpotNear(P, 40, 170) : { x: P.x, y: P.y }; b.shells.push({ x: s.x, y: s.y, t: 0, life: 1.0 + k * 0.15 }); }
      AudioFX.enemyShoot();
      b.atk = "idle"; b.at = 1.8;
    }
  } else if (b.atk === "quickdraw") {
    /* high noon: three bells; on the third he draws. Dash on it — or out-draw him. */
    b.qdT += dt;
    const bells = [0.05, 0.9, 1.8];
    while (b.bellN < 3 && b.qdT >= bells[b.bellN]) {
      floatText(b.x, b.y - b.r - 30, ["ONE", "TWO", "DRAW"][b.bellN], "#ffe2a0", 20, { life: 0.8, vy: 10, outline: "#0b0b14" });
      AudioFX.bell();
      b.bellN++;
      if (b.bellN === 3) {
        if (b.qdDmg >= b.maxHp * 0.03) {
          floatText(b.x, b.y - b.r - 50, "OUT-DRAWN", "#ffffff", 20, { life: 1.4, vy: 16, outline: "#0b0b14" });
          for (let k = 0; k < 16; k++) particles.push({ x: b.x, y: b.y, vx: rnd(-40, 40), vy: rnd(-520, -320), t: 0, life: 0.5, r: 2.5, color: "#ffe2a0" });
          posseGiveBack(b, 1);
          b.staggerT = 2;
        } else {
          const T = nearestPlayer(b.x, b.y);
          deepShot(b.x, b.y, angTo(b.x, b.y, T.x, T.y), 900, 10, 30, "#ffe2a0", { pierceRock: true });
          Game.shake = Math.max(Game.shake, 12); AudioFX.slam();
        }
      }
    }
    if (b.qdT >= 2.2) { b.atk = "idle"; b.at = 1.6; }
  } else { b.atk = "idle"; b.at = 0.5; }
}
