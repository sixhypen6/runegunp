/* =========================================================
   RUNEGUN · WARP — the Wayward Passenger's rifts
   The Passenger does not shoot. Two tear-blades open thin purple
   seams in the air, and [R] WARP anchors four rifts around the
   nearest foe in an X. The Passenger falls through opposite pairs
   again and again, every crossing cutting the line between them,
   then leaves the rifts standing: step into one and its twin spits
   you out with a rush of speed and contact bite.
   Host/solo owns the simulation; the guest mirrors rifts and seams
   through the snapshot (src/net/protocol.js).
   ========================================================= */
"use strict";

const WARP_BASE_CD = 6.0;          // seconds at one stack
const WARP_CD_STACK_MUL = 0.88;    // each further stack shortens the clock
const WARP_CD_MIN = 1.6;
const WARP_RANGE = 900;            // how far the nearest anchor may be
const WARP_ORBIT = 86;             // rifts sit this far from the target
const WARP_RIFT_R = 34;            // visual half-height of a tear
const WARP_RIFT_TRIGGER = 26;      // body radius that falls through a rift
const WARP_PORTAL_LIFE = 9;        // seconds the rifts stay open
const WARP_PASS_GAP = 0.11;        // pause between seam cuts
const WARP_SLASH_MUL = 3.0;        // Dimensional Shred: weapon damage × this per pass
const WARP_SLASH_WIDTH = 30;       // how wide the seam bites across the line
const WARP_RUSH_TIME = 5;          // seconds of rush after a crossing
const WARP_RUSH_MAX = 5;           // most stacks one crossing chain can hold
const WARP_RUSH_SPEED = 0.12;      // +12% movement per rush stack
const WARP_CONTACT_TICK = 0.22;    // contact bite cadence while rushing
const WARP_CONTACT_BASE = 0.30;    // weapon damage × this per rush stack
const WARP_CONTACT_PER_STACK = 0.06; // ...plus this much per carved WARP stack
const WARP_CHAIN_MAX = 10;         // rifts the Passenger can keep open at once
const WARP_HOP_GAP = 0.05;         // breath between one rift-pair and the next

/* MELEE — the two blades. Short, wide, and purple. */
const SINNER_REACH_BASE = 78;
const SINNER_HALF_ARC = 1.05;
const SINNER_SLASH_LIFE = 0.24;    // one swing, from the first cut to the last spark
const SINNER_SWEEP_SHARE = 0.45;   // share of the swing spent travelling left → right

function warpAuthority() {
  return typeof reanimatorAuthority === "function" ? reanimatorAuthority()
    : !(typeof Net !== "undefined" && Net.active && Net.role === "guest");
}
function warpStacks(p) {
  if (!p) return 0;
  if (p.mods && p.mods.warp) return p.mods.warp;
  return (p.runes && p.runes.warp) || 0;
}
function warpCanUse(p) {
  return !!p && p.hp > 0 && !p.downed && (p.char === "sinner" || warpStacks(p) > 0);
}
function warpCooldownFor(p) {
  const n = Math.max(1, warpStacks(p));
  return Math.max(WARP_CD_MIN, WARP_BASE_CD * Math.pow(WARP_CD_STACK_MUL, n - 1));
}
/* the movement bonus the open rifts leave behind — read by game/update.js */
function warpSpeedMul(p) {
  if (!p || !(p.warpSpeedT > 0) || !(p.warpSpeedStacks > 0)) return 1;
  return 1 + p.warpSpeedStacks * (WARP_RUSH_SPEED + 0.01 * warpStacks(p));
}

/* ---------------------------------------------------------
   TARGETING
   --------------------------------------------------------- */
function warpNearestFoe(p, cx, cy) {
  const x = cx === undefined ? p.x : cx;
  const y = cy === undefined ? p.y : cy;
  /* a rune chest's ambush is what WARP is for: anchor on its foes before any
     other horror — the FARTHEST or NEAREST of them, per the setting */
  const wantAmbush = typeof Meta === "undefined" || Meta.ambushPriority !== false;
  if (wantAmbush) {
    const far = !(typeof Meta !== "undefined" && Meta.warpPick === "near");
    let pick = null, pd = far ? -1 : Infinity;
    for (const e of enemies) {
      if (!e.ambush || e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      const d = dist2(x, y, e.x, e.y);
      if (d > WARP_RANGE * WARP_RANGE) continue;
      if (far ? d > pd : d < pd) { pd = d; pick = e; }
    }
    if (pick) return pick;
  }
  let best = null, bd = WARP_RANGE * WARP_RANGE;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  /* VERSUS: a rival warden is as good an anchor as any horror */
  if (Game.pvpMode) for (const foe of players) {
    if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
    const d = dist2(x, y, foe.x, foe.y);
    if (d < bd) { bd = d; best = foe; }
  }
  return best;
}

/* ---------------------------------------------------------
   RIFTS
   --------------------------------------------------------- */
function warpAddPortal(p, x, y, nx, ny) {
  const o = {
    id: Game.nextId++,
    x: clamp(x, 40, MAP.w - 40), y: clamp(y, 40, MAP.h - 40),
    t: 0, life: WARP_PORTAL_LIFE, owner: p, twin: 0,
    nx: nx || 0, ny: ny || 0, rot: rnd(-0.32, 0.32), seed: rnd(0, TAU),
  };
  warpPortals.push(o);
  /* a long chain leaves a trail — keep only the most recent rifts, and take
     a dropped rift's twin with it so no rift is left holding a dead link */
  const mine = warpPortals.filter(q => q.owner === p);
  while (mine.length > WARP_CHAIN_MAX) {
    const old = mine.shift();
    const i = warpPortals.indexOf(old);
    if (i >= 0) warpPortals.splice(i, 1);
    const j = warpPortals.findIndex(q => q.id === old.twin);
    if (j >= 0) warpPortals.splice(j, 1);
  }
  return o;
}
function warpOpenSet(p, cx, cy, keep) {
  /* the X closes over the one horror that would not fall; unless the chain is
     still running, the last set is swept away first */
  if (!keep) for (let i = warpPortals.length - 1; i >= 0; i--) if (warpPortals[i].owner === p) warpPortals.splice(i, 1);
  const set = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;   // the X: four diagonal corners
    const nx = Math.cos(a), ny = Math.sin(a);
    set.push(warpAddPortal(p, cx + nx * WARP_ORBIT, cy + ny * WARP_ORBIT, nx, ny));
  }
  set[0].twin = set[2].id; set[2].twin = set[0].id;
  set[1].twin = set[3].id; set[3].twin = set[1].id;
  p.warpPortalSet = set;
  return set;
}
/* the rifts follow the foe between passes without changing identity */
function warpMoveSet(set, cx, cy) {
  if (!set) return;
  for (let i = 0; i < set.length; i++) {
    const o = set[i];
    const a = Math.PI / 4 + i * Math.PI / 2;
    const nx = Math.cos(a), ny = Math.sin(a);
    o.x = clamp(cx + nx * WARP_ORBIT, 40, MAP.w - 40);
    o.y = clamp(cy + ny * WARP_ORBIT, 40, MAP.h - 40);
    o.nx = nx; o.ny = ny;
  }
}
/* step out of a rift, not back into its mouth */
function warpExitPoint(o, p) {
  const d = WARP_RIFT_TRIGGER + (p ? p.r : 13) + 4;
  return { x: clamp(o.x + (o.nx || 0) * d, 24, MAP.w - 24),
    y: clamp(o.y + (o.ny || 0) * d, 24, MAP.h - 24) };
}
function warpGrantRush(p, n) {
  p.warpSpeedStacks = Math.min(WARP_RUSH_MAX, (p.warpSpeedStacks || 0) + (n || 1));
  p.warpSpeedT = WARP_RUSH_TIME;
}
/* one link of the chain: a rift where the Passenger stands, its twin beyond the
   horror — the seam between them is the cut */
function warpLink(p, fromX, fromY, foe) {
  const dx = foe.x - fromX, dy = foe.y - fromY;
  const dl = Math.hypot(dx, dy) || 1;
  const ux = dx / dl, uy = dy / dl;
  const entry = warpAddPortal(p, fromX, fromY, -ux, -uy);
  const exit = warpAddPortal(p, foe.x + ux * WARP_ORBIT, foe.y + uy * WARP_ORBIT, ux, uy);
  entry.twin = exit.id; exit.twin = entry.id;
  entry.link = exit.link = true;
  return { entry, exit, ux, uy };
}

/* ---------------------------------------------------------
   SEAMS — the purple cut between two rifts
   --------------------------------------------------------- */
function warpSegDist2(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const len = vx * vx + vy * vy;
  let t = len > 0 ? ((px - x1) * vx + (py - y1) * vy) / len : 0;
  t = clamp(t, 0, 1);
  const dx = px - (x1 + vx * t), dy = py - (y1 + vy * t);
  return dx * dx + dy * dy;
}
function warpSlash(x1, y1, x2, y2, p) {
  warpSlashes.push({ x1, y1, x2, y2, t: 0, life: 0.42, owner: p || null });
  if (warpSlashes.length > 40) warpSlashes.splice(0, warpSlashes.length - 40);
}
function warpLineDamage(p, x1, y1, x2, y2, width, dmg) {
  const m = p.mods;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const crit = () => m.crit > 0 && Math.random() < m.crit;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    if (warpSegDist2(e.x, e.y, x1, y1, x2, y2) > (width + e.r) ** 2) continue;
    const isCrit = crit();
    damageEnemy(e, dmg * (isCrit ? m.critMul : 1), {
      owner: p, x: mx, y: my, knock: m.knock, melee: true, critHit: isCrit,
    });
    if (!e.dead && m.bleed > 0) {
      e.bleedT = Math.max(e.bleedT || 0, bleedTime(m.bleed));
      e.bleedDps = Math.max(e.bleedDps || 0, bleedDps(m.bleed));
      e.bleedBy = p;
    }
    if (!e.dead && m.venom > 0 && typeof dropVenomPool === "function") dropVenomPool(e.x, e.y, m.venom, p);
  }
  /* VERSUS: the seam cuts a rival warden caught across it */
  if (Game.pvpMode) for (const foe of players) {
    if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
    if (warpSegDist2(foe.x, foe.y, x1, y1, x2, y2) > (width + foe.r) ** 2) continue;
    const isCrit = crit();
    hurtPlayer(foe, dmg * (isCrit ? m.critMul : 1), { x: mx, y: my, knock: m.knock * 0.5 });
  }
}

/* ---------------------------------------------------------
   MELEE — two tear-blades; called from spawnShot
   --------------------------------------------------------- */
/* one blade's cut: a short forward arc, tested against the horde (and a rival) */
function sinnerSlashArc(p, x, y, aim, halfArc, reach) {
  const m = p.mods;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    const crit = m.crit > 0 && Math.random() < m.crit;
    damageEnemy(e, m.dmg * (crit ? m.critMul : 1), {
      owner: p, x, y, knock: m.knock, melee: true, critHit: crit,
    });
    if (!e.dead && m.bleed > 0) {
      e.bleedT = Math.max(e.bleedT || 0, bleedTime(m.bleed));
      e.bleedDps = Math.max(e.bleedDps || 0, bleedDps(m.bleed));
      e.bleedBy = p;
    }
  }
  /* VERSUS: the same forward arc catches a rival warden */
  if (Game.pvpMode) for (const foe of players) {
    if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
    const dx = foe.x - x, dy = foe.y - y;
    if (dx * dx + dy * dy > (reach + foe.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    const crit = m.crit > 0 && Math.random() < m.crit;
    hurtPlayer(foe, m.dmg * (crit ? m.critMul : 1), { x, y, knock: m.knock });
  }
}
/* the sweep's bite is purple violence; the trail is thrown along the cut */
function sinnerSlashTrail(x, y, aim, reach, amount) {
  if (particles.length >= 560) return;
  for (let i = 0; i < amount; i++) {
    const a = aim + rnd(-SINNER_HALF_ARC, SINNER_HALF_ARC);
    const d = rnd(reach * 0.3, reach + 8);
    particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * rnd(70, 260), vy: Math.sin(a) * rnd(70, 260),
      t: 0, life: rnd(0.14, 0.3), r: rnd(1.2, 3), color: pick(["#c86bff", "#f3e6ff", "#7a3bbd"]) });
  }
}
function sinnerSlash(p, x, y, aim) {
  const m = p.mods;
  const reach = SINNER_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.75;
  p.sinnerSlashT = SINNER_SLASH_LIFE;
  p.sinnerSlashAng = aim;
  p.sinnerSlashReach = reach;
  /* two arms: the pair sweeps left → right on one swing, right → left on the next */
  p.sinnerSlashDir = Math.random() < 0.5 ? -1 : 1;
  p.sinnerSlash2T = 0;
  sinnerSlashArc(p, x, y, aim, SINNER_HALF_ARC, reach);
  sinnerSlashTrail(x, y, aim, reach, 9);
  return true;
}
/* PHASE / BLINKSTEP on the Passenger: the dash cuts twice — both tear-blades
   sweep the dash line in a crossed X instead of the single forward arc. */
function sinnerPhaseDash(p) {
  if (!p || p.char !== "sinner" || !p.mods || !(p.mods.dashTrail > 0)) return false;
  const m = p.mods;
  const aim = p.dashAng;
  const reach = SINNER_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.75;
  const spread = 0.42;
  const halfArc = SINNER_HALF_ARC * 0.72;
  p.sinnerSlashT = SINNER_SLASH_LIFE; p.sinnerSlashAng = aim - spread; p.sinnerSlashReach = reach;
  p.sinnerSlashDir = 1;
  p.sinnerSlash2T = SINNER_SLASH_LIFE; p.sinnerSlash2Ang = aim + spread;
  p.sinnerSlash2Dir = -1;
  /* each blade cuts once, so a horror held in the crossing takes both */
  sinnerSlashArc(p, p.x, p.y, aim - spread, halfArc, reach);
  sinnerSlashArc(p, p.x, p.y, aim + spread, halfArc, reach);
  sinnerSlashTrail(p.x, p.y, aim - spread, reach, 7);
  sinnerSlashTrail(p.x, p.y, aim + spread, reach, 7);
  Game.shake = Math.max(Game.shake, 3);
  return true;
}

/* ---------------------------------------------------------
   WARP — cast, shred sequence, portal rides, contact
   --------------------------------------------------------- */
function warpActivate(p) {
  if (!warpCanUse(p) || p.warpSeq || Game.inSaloon) return false;
  if ((p.warpCd || 0) > 0) {
    if (p === localPlayer()) toast("WARP RE-CHARGE — " + p.warpCd.toFixed(1) + "s");
    return false;
  }
  const tgt = warpNearestFoe(p);
  if (!tgt) {
    if (p === localPlayer()) toast("NO ANCHOR FOR THE RIP");
    return false;
  }
  /* the chain opens with a pair: one rift at the Passenger, its twin beyond the
     first horror. Every kill links another pair; a horror that holds gets the X. */
  const n = warpStacks(p);
  p.warpSeq = {
    mode: "chain", pass: 0, left: Math.min(12, 4 + Math.floor(n / 3)),
    wait: WARP_HOP_GAP, foe: tgt, lastX: p.x, lastY: p.y, hop: null, cx: tgt.x, cy: tgt.y,
  };
  p.warpSeq.hop = warpLink(p, p.x, p.y, tgt);
  p.warpCd = warpCooldownFor(p);
  p.warpPortalCd = 0.35;
  Game.shake = Math.max(Game.shake, 4);
  Game.hitstop = Math.max(Game.hitstop, 0.02);
  AudioFX.dash();
  if (particles.length < 520) for (let i = 0; i < 18; i++) {
    const a = rnd(0, TAU), d = rnd(10, 70);
    particles.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
      vx: Math.cos(a) * rnd(60, 240), vy: Math.sin(a) * rnd(60, 240),
      t: 0, life: rnd(0.2, 0.45), r: rnd(1.5, 3.5), color: pick(["#c86bff", "#e6c8ff", "#9d6bff"]) });
  }
  return true;
}

/* one pass of the chain: out of a rift, into its twin past the horror, cutting
   the line between them. A kill links the next pair on toward the next horror;
   a horror that survives gets the four-rift X closed around it. */
function warpShredStep(p, dt) {
  const seq = p.warpSeq;
  if (!seq) return;
  seq.wait -= dt;
  if (seq.wait > 0) return;
  const m = p.mods;

  if (seq.mode === "chain") {
    /* the last horror fell — run the chain on toward the next one */
    if (!seq.foe || seq.foe.hp <= 0 || seq.foe.dead || seq.foe.gone) {
      const next = warpNearestFoe(p, seq.lastX, seq.lastY);
      if (!next || seq.left <= 0) { warpSeqEnd(p); return; }
      seq.foe = next;
    }
    if (!seq.hop) {
      /* the pair opens first — the fall follows on the next beat */
      seq.hop = warpLink(p, seq.lastX, seq.lastY, seq.foe);
      seq.wait = WARP_HOP_GAP;
      return;
    }
    const hop = seq.hop;
    const out = warpExitPoint(hop.exit, p);
    p.x = out.x; p.y = out.y;
    collideWorld(p);
    p.warpPortalCd = 0.5;
    warpGrantRush(p, 1);
    /* the seam is cut between the two rift CENTRES, straight through the foe */
    warpSlash(hop.entry.x, hop.entry.y, hop.exit.x, hop.exit.y, p);
    warpLineDamage(p, hop.entry.x, hop.entry.y, hop.exit.x, hop.exit.y,
      WARP_SLASH_WIDTH, m.dmg * WARP_SLASH_MUL);
    warpCutSparks(hop.entry, hop.exit);
    Game.shake = Math.max(Game.shake, 5);
    AudioFX.hit();
    const killed = !seq.foe || seq.foe.hp <= 0 || seq.foe.dead || seq.foe.gone;
    seq.lastX = hop.exit.x; seq.lastY = hop.exit.y;
    seq.hop = null;
    seq.pass++;
    seq.left--;
    if (killed) {
      seq.wait = WARP_HOP_GAP;          // link the next pair on the next tick
      if (seq.left <= 0) warpSeqEnd(p);
      return;
    }
    /* it held through the cut: the X closes around it */
    seq.mode = "x";
    seq.cx = seq.foe.x; seq.cy = seq.foe.y;
    warpOpenSet(p, seq.cx, seq.cy, true);
    seq.wait = WARP_PASS_GAP;
    return;
  }

  /* X mode: opposite pairs, recentred on the horror each pass */
  const tgt = warpNearestFoe(p, seq.cx, seq.cy);
  if (tgt) { seq.cx = tgt.x; seq.cy = tgt.y; }
  warpMoveSet(p.warpPortalSet, seq.cx, seq.cy);
  const set = p.warpPortalSet || [];
  if (set.length < 4) { p.warpSeq = null; return; }
  const ai = seq.pass % 4;
  const a = set[ai], b = set[(ai + 2) % 4];
  /* the Passenger leaves through b, not into the mouth of a rift */
  const exit = warpExitPoint(b, p);
  p.x = exit.x; p.y = exit.y;
  collideWorld(p);
  p.warpPortalCd = 0.5;
  warpGrantRush(p, 1);
  warpSlash(a.x, a.y, b.x, b.y, p);
  warpLineDamage(p, a.x, a.y, b.x, b.y, WARP_SLASH_WIDTH, m.dmg * WARP_SLASH_MUL);
  warpCutSparks(a, b);
  Game.shake = Math.max(Game.shake, 5);
  AudioFX.hit();
  seq.pass++;
  seq.left--;
  seq.wait = WARP_PASS_GAP;
  if (seq.left <= 0) warpSeqEnd(p);
}

/* sparks thrown off a seam */
function warpCutSparks(a, b) {
  if (particles.length >= 620) return;
  for (let i = 0; i < 12; i++) {
    const k = Math.random();
    const px = a.x + (b.x - a.x) * k, py = a.y + (b.y - a.y) * k;
    const nx = -(b.y - a.y), ny = b.x - a.x;
    const nl = Math.hypot(nx, ny) || 1;
    const side = rnd(-1, 1), sp = rnd(40, 190);
    particles.push({ x: px, y: py, vx: nx / nl * sp * side, vy: ny / nl * sp * side,
      t: 0, life: rnd(0.18, 0.4), r: rnd(1.5, 3.5), color: pick(["#c86bff", "#f0dcff", "#7a3bbd"]) });
  }
}
function warpSeqEnd(p) {
  p.warpSeq = null;
  Game.hitstop = Math.max(Game.hitstop, 0.03);
  Game.shake = Math.max(Game.shake, 8);
  AudioFX.slam();
}

/* step into a standing rift and its twin throws you out */
function warpRide(p) {
  if ((p.warpPortalCd || 0) > 0 || p.dashT > 0) return;
  for (const o of warpPortals) {
    if (o.owner !== p || o.t < 0.18) continue;
    if (dist2(p.x, p.y, o.x, o.y) > (WARP_RIFT_TRIGGER + p.r * 0.5) ** 2) continue;
    const twin = warpPortals.find(q => q.id === o.twin);
    if (!twin) continue;
    const exit = warpExitPoint(twin, p);
    p.x = exit.x; p.y = exit.y;
    collideWorld(p);
    p.warpPortalCd = 0.5;
    warpGrantRush(p, 1);
    warpSlash(o.x, o.y, twin.x, twin.y, p);
    warpLineDamage(p, twin.x, twin.y, twin.x, twin.y, 44, p.mods.dmg * 0.9);
    Game.shake = Math.max(Game.shake, 3);
    AudioFX.dash();
    break;
  }
}

/* while the rush holds, brushing a horror bites it */
function warpContact(p, dt) {
  if (!(p.warpSpeedT > 0) || !(p.warpSpeedStacks > 0)) return;
  p.warpContactT = Math.max(0, (p.warpContactT || 0) - dt);
  if (p.warpContactT > 0) return;
  p.warpContactT = WARP_CONTACT_TICK;
  const m = p.mods;
  const dmg = m.dmg * (WARP_CONTACT_BASE + WARP_CONTACT_PER_STACK * warpStacks(p)) * p.warpSpeedStacks;
  warpLineDamage(p, p.x, p.y, p.x, p.y, p.r + 22, dmg);
}

function warpTick(p, dt) {
  if (!warpCanUse(p)) { if (p.warpSeq) p.warpSeq = null; return; }
  if (!warpAuthority()) return;
  warpShredStep(p, dt);
  warpRide(p);
  warpContact(p, dt);
}

/* global rift/seam clocks — one tick per frame, host/solo only */
function warpWorldTick(dt) {
  if (!warpAuthority()) return;
  for (let i = warpPortals.length - 1; i >= 0; i--) {
    const o = warpPortals[i];
    o.t += dt;
    if (o.t >= o.life) warpPortals.splice(i, 1);
  }
  for (let i = warpSlashes.length - 1; i >= 0; i--) {
    const s = warpSlashes[i];
    s.t += dt;
    if (s.t >= s.life) warpSlashes.splice(i, 1);
  }
}

/* ---------------------------------------------------------
   HUD — the WARP clock and the mobile button
   --------------------------------------------------------- */
let lastWarpCue = "";
function updateWarpCue(p) {
  const el = typeof document !== "undefined" ? document.getElementById("warpCue") : null;
  const btn = typeof document !== "undefined" ? document.getElementById("btnWarp") : null;
  /* R is shared with the Reanimator's recall and Sancho's refine, so only a
     warden whose ability key is free shows the WARP control */
  const can = warpCanUse(p) && p.char !== "necromancer" && p.char !== "sancho";
  if (btn) btn.style.display = can ? "flex" : "none";
  if (!el) return;
  if (!can) {
    if (lastWarpCue !== "") { el.textContent = ""; el.className = ""; lastWarpCue = ""; }
    return;
  }
  const ready = (p.warpCd || 0) <= 0;
  const key = !Input.touchMode && typeof bindLabel === "function" ? bindLabel("recall") : "";
  let txt = ready ? "WARP READY" + (key ? " [" + key + "]" : "")
    : "WARP " + (p.warpCd || 0).toFixed(1) + "s";
  if (p.warpSpeedT > 0 && p.warpSpeedStacks > 0)
    txt += " · RUSH " + p.warpSpeedStacks + (ready ? "" : "");
  const cls = "on" + (ready ? " ready" : "") + (p.warpSpeedT > 0 ? " rush" : "");
  if (lastWarpCue !== txt + cls) {
    lastWarpCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}

/* mobile: WARP shares the ability latch, exactly like the PACK button */
{
  const b = typeof document !== "undefined" ? document.getElementById("btnWarp") : null;
  if (b) b.addEventListener("click", () => { if (Game.state === "play") Input.recallTap = true; });
}

/* ---------------------------------------------------------
   RENDER — standing rifts, cut seams, and the Passenger body
   --------------------------------------------------------- */
function drawWarpRifts() {
  for (const o of warpPortals) {
    const pulse = 0.5 + 0.5 * Math.sin(Game.time * 3.4 + o.seed);
    const born = clamp(o.t / 0.12, 0, 1);
    const die = clamp((o.life - o.t) / 0.6, 0, 1);
    const a = born * die;
    if (a <= 0.01) continue;
    const h = WARP_RIFT_R * (0.95 + 0.08 * pulse);
    const w = WARP_RIFT_R * 0.2;
    /* the torn edge: each side chewed independently, so the rip never reads as
       a clean mirrored lens — sharp at both tips, ragged along the way */
    const N = 12;
    const right = [], left = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const y = -h + 2 * h * u;
      const taper = Math.pow(Math.sin(u * Math.PI), 0.55);
      const jr = 0.42 + 0.95 * Math.abs(Math.sin(k * 2.7 + o.seed * 3.1 + Game.time * 0.9));
      const jl = 0.42 + 0.95 * Math.abs(Math.sin(k * 3.9 + o.seed * 5.7 + 2.1 - Game.time * 0.7));
      const sway = Math.sin(u * 3.4 + o.seed) * w * 0.45;
      right.push([w * taper * jr + sway, y]);
      left.push([-(w * taper * jl - sway), y]);
    }
    const rip = (sx, sy) => {
      const mx = sx === undefined ? 1 : sx, my = sy === undefined ? 1 : sy;
      cx.beginPath();
      cx.moveTo(0, -h * my);
      for (const e of right) cx.lineTo(e[0] * mx, e[1] * my);
      cx.lineTo(0, h * my);
      for (let k = left.length - 1; k >= 0; k--) cx.lineTo(left[k][0] * mx, left[k][1] * my);
      cx.closePath();
    };
    cx.save();
    cx.translate(o.x, o.y);
    cx.rotate((o.rot || 0) + Math.sin(Game.time * 1.6 + o.seed) * 0.06);
    /* the bloom the rip casts on the air around it */
    cx.globalAlpha = a * 0.55;
    cx.fillStyle = "rgba(150,60,220,0.5)";
    cx.shadowColor = "#c86bff"; cx.shadowBlur = 28;
    rip(1.12); cx.fill();
    /* light spilling through the tear, hot at both tips */
    cx.shadowBlur = 0;
    cx.globalAlpha = a;
    const grd = cx.createLinearGradient(0, -h, 0, h);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.32, "#d9a6ff");
    grd.addColorStop(0.5, "#a04ff0");
    grd.addColorStop(0.68, "#d9a6ff");
    grd.addColorStop(1, "#ffffff");
    cx.fillStyle = grd;
    rip(1); cx.fill();
    /* the dark core: the nothing on the other side */
    cx.globalAlpha = a * 0.92;
    cx.fillStyle = "rgba(12,2,22,0.92)";
    rip(0.42); cx.fill();
    /* the torn lips */
    cx.globalAlpha = a * 0.95;
    cx.shadowColor = "#e6c8ff"; cx.shadowBlur = 14;
    cx.strokeStyle = "#f6e7ff"; cx.lineWidth = 1.8 - pulse * 0.4;
    rip(1); cx.stroke();
    /* filaments licking out of the rip */
    cx.shadowBlur = 0;
    cx.strokeStyle = "rgba(226,198,255,0.75)"; cx.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 1 : -1;
      const yy = -h + 2 * h * (0.24 + 0.18 * k);
      const L = 6 + 8 * Math.abs(Math.sin(o.seed + k * 1.9 + Game.time * 1.4));
      cx.beginPath();
      cx.moveTo(side * w * 0.5, yy);
      cx.quadraticCurveTo(side * (w * 0.5 + L), yy + 4, side * (w * 0.5 + L * 1.7), yy + 9 * Math.sin(k + o.seed));
      cx.stroke();
    }
    cx.restore();
  }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* a straight cut: pinched at both ends, chewed along its length, white-hot
   inside a violet bloom — the line the Passenger falls through */
function drawTornStreak(x1, y1, x2, y2, half, k, alpha, seed) {
  const fade = alpha * Math.pow(1 - k, 0.7);
  if (fade <= 0.01) return;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const N = 16;
  const poly = (hf, grow) => {
    const A = [], B = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const taper = Math.pow(Math.sin(t * Math.PI), 0.5);
      const jag = 1 + 0.3 * Math.sin(i * 3.7 + seed) * (0.2 + 0.8 * taper);
      const hw = hf * taper * jag + grow * taper;
      const px = x1 + dx * t, py = y1 + dy * t;
      A.push([px + nx * hw, py + ny * hw]);
      B.push([px - nx * hw, py - ny * hw]);
    }
    cx.beginPath();
    cx.moveTo(A[0][0], A[0][1]);
    for (let i = 1; i <= N; i++) cx.lineTo(A[i][0], A[i][1]);
    for (let i = N; i >= 0; i--) cx.lineTo(B[i][0], B[i][1]);
    cx.closePath();
  };
  cx.save();
  cx.globalAlpha = fade * 0.55;
  cx.fillStyle = "rgba(170,80,240,0.6)";
  cx.shadowColor = "#c86bff"; cx.shadowBlur = 26;
  poly(half, half * 0.85); cx.fill();
  cx.shadowBlur = 0;
  cx.globalAlpha = fade;
  cx.fillStyle = "#d9a6ff";
  poly(half * 0.62, 0); cx.fill();
  cx.globalAlpha = fade * 0.95;
  cx.fillStyle = "#ffffff";
  cx.shadowColor = "#f0dcff"; cx.shadowBlur = 14;
  poly(half * 0.3, 0); cx.fill();
  /* barbs torn off the cut */
  cx.shadowBlur = 0;
  cx.globalAlpha = fade * 0.8;
  cx.strokeStyle = "#e9cfff"; cx.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const px = x1 + dx * t, py = y1 + dy * t;
    const hf = half * Math.pow(Math.sin(t * Math.PI), 0.5);
    const side = i % 2 ? 1 : -1;
    const L = 5 + 8 * Math.abs(Math.sin(seed + i * 2.1));
    cx.beginPath();
    cx.moveTo(px + nx * hf * side, py + ny * hf * side);
    cx.lineTo(px + nx * (hf + L) * side + dx / len * 4, py + ny * (hf + L) * side + dy / len * 4);
    cx.stroke();
  }
  cx.restore();
}

function drawWarpSlashes() {
  for (const s of warpSlashes) {
    const k = clamp(s.t / s.life, 0, 1);
    drawTornStreak(s.x1, s.y1, s.x2, s.y2, 10, k, 1, 1.7);
  }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* one crescent of the swing. The cut travels across the facing — left to right
   for one arm, right to left for the other — so the blade clears air in front
   of the Passenger instead of blooming there all at once.
   `k` runs 0 → 1 across the cut's life; `dir` is +1 (left → right) or -1. */
function drawSinnerSlashArc(px, py, ang, reach, k, alpha, dir) {
  const span = SINNER_HALF_ARC * 0.85;
  const sweepT = SINNER_SWEEP_SHARE;
  const prog = k < sweepT ? k / sweepT : 1;
  const d = dir < 0 ? -1 : 1;
  const start = d > 0 ? -span : span;
  const end = -start;
  const head = start + (end - start) * prog;
  const trail = 1.7 * (1 - 0.35 * prog);
  const tail = d > 0 ? Math.max(start, head - trail) : Math.min(start, head + trail);
  const linger = k < sweepT ? 1 : 1 - (k - sweepT) / (1 - sweepT);
  const fade = alpha * Math.pow(Math.max(0, linger), 0.75);
  if (fade <= 0.01 || Math.abs(head - tail) < 0.02) return;
  const R = reach * (0.9 + 0.1 * prog);
  const SEG = 9;
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  for (let s = 0; s < SEG; s++) {
    const u0 = s / SEG, u1 = (s + 1) / SEG, um = (u0 + u1) / 2;
    /* u = 0 at the leading edge, 1 at the far tail */
    const a0 = head + (tail - head) * u0;
    const a1 = head + (tail - head) * u1;
    const wgt = Math.pow(1 - um, 1.5);
    const acw = a1 < a0;
    const shape = (hw) => {
      cx.beginPath();
      cx.arc(0, 0, R + hw, a0, a1, acw);
      cx.arc(0, 0, R - hw, a1, a0, !acw);
      cx.closePath();
    };
    cx.globalAlpha = fade * 0.4 * (0.25 + 0.75 * wgt);
    cx.fillStyle = "rgba(170,80,240,0.9)";
    cx.shadowColor = "#c86bff"; cx.shadowBlur = 24;
    shape(4 + 10 * wgt); cx.fill();
    cx.shadowBlur = 0;
    cx.globalAlpha = fade * (0.3 + 0.7 * wgt);
    cx.fillStyle = "#e2b6ff";
    shape(2 + 7 * wgt); cx.fill();
    cx.globalAlpha = fade * (0.45 + 0.55 * wgt);
    cx.fillStyle = "#ffffff";
    shape(0.7 + 2.8 * wgt); cx.fill();
  }
  /* barbs flicked off the leading edge */
  cx.shadowBlur = 0;
  cx.globalAlpha = fade * 0.8;
  cx.strokeStyle = "#f0dcff"; cx.lineWidth = 1.3;
  for (let i = 0; i < 2; i++) {
    const a = head - d * 0.16 * i;
    const r0 = R + 9, L = 6 + 8 * Math.abs(Math.sin(i * 2.3 + k * 3));
    cx.beginPath();
    cx.moveTo(Math.cos(a - 0.035) * r0, Math.sin(a - 0.035) * r0);
    cx.lineTo(Math.cos(a) * (r0 + L), Math.sin(a) * (r0 + L));
    cx.stroke();
  }
  cx.restore();
}

/* the Passenger's body — drawn from drawWarden() */
function drawSinnerWarden(P, px, py, aim, col, tint, hpFrac) {
  const t = Game.time;
  const rush = P.warpSpeedT > 0 && P.warpSpeedStacks > 0;
  /* tendrils trailing opposite the aim */
  cx.save();
  cx.translate(px, py);
  cx.strokeStyle = "#8c1f36"; cx.lineCap = "round";
  for (let i = -2; i <= 2; i++) {
    const base = aim + Math.PI + i * 0.28;
    const sway = Math.sin(t * 5 + i * 1.7) * 0.4;
    cx.globalAlpha = 0.55 - Math.abs(i) * 0.06;
    cx.lineWidth = 2.4 - Math.abs(i) * 0.35;
    cx.beginPath();
    cx.moveTo(Math.cos(base) * 7, Math.sin(base) * 7);
    cx.quadraticCurveTo(
      Math.cos(base + sway * 0.5) * 20, Math.sin(base + sway * 0.5) * 20,
      Math.cos(base + sway) * (30 + Math.abs(i) * 3), Math.sin(base + sway) * (30 + Math.abs(i) * 3));
    cx.stroke();
  }
  cx.restore();
  /* rush afterimages */
  if (rush) {
    cx.save();
    cx.globalAlpha = 0.18 + 0.06 * Math.min(5, P.warpSpeedStacks);
    cx.strokeStyle = "#c86bff"; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(px, py, P.r + 9 + Math.sin(t * 12) * 2, 0, TAU); cx.stroke();
    cx.restore();
  }
  /* cloak body */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = col;
  cx.beginPath();
  cx.moveTo(-10, -11); cx.quadraticCurveTo(11, -10, 12, 0);
  cx.quadraticCurveTo(11, 10, -10, 11);
  cx.quadraticCurveTo(-15, 0, -10, -11);
  cx.closePath(); cx.fill();
  /* high collar */
  cx.fillStyle = "#5c1224";
  cx.beginPath(); cx.moveTo(-10, -11); cx.lineTo(-2, -16); cx.lineTo(-2, 4); cx.closePath(); cx.fill();
  cx.beginPath(); cx.moveTo(-10, 11); cx.lineTo(-2, 16); cx.lineTo(-2, -4); cx.closePath(); cx.fill();
  /* bone mask, turned with the aim */
  cx.fillStyle = "#efe6da";
  cx.beginPath(); cx.ellipse(4, 0, 7, 5.5, 0, 0, TAU); cx.fill();
  cx.fillStyle = "#2a0d16";
  cx.beginPath(); cx.ellipse(6, -2.1, 2.1, 1.1, 0.2, 0, TAU); cx.fill();
  cx.beginPath(); cx.ellipse(6, 2.1, 2.1, 1.1, -0.2, 0, TAU); cx.fill();
  /* the mask's stitched seam */
  cx.strokeStyle = "#a3334f"; cx.lineWidth = 0.8;
  cx.beginPath(); cx.moveTo(4, -5); cx.lineTo(4, 5); cx.stroke();
  drawCracks(cx, hpFrac, 11);
  cx.restore();
  /* two tear-blades, purple with a white edge — both arms sweep the same way
     the cut does: left → right or right → left, picked fresh each swing */
  cx.save();
  cx.translate(px, py);
  const swing = P.sinnerSlashT > 0 ? clamp(1 - P.sinnerSlashT / SINNER_SLASH_LIFE, 0, 1) : 0;
  const sweepProg = P.sinnerSlashT > 0 ? Math.min(1, swing / SINNER_SWEEP_SHARE) : 0;
  const armDir = P.sinnerSlashDir < 0 ? -1 : 1;
  const bladeSweep = armDir * (-0.6 + 1.2 * sweepProg);
  for (const s of [-1, 1]) {
    const ba = aim + bladeSweep + s * 0.14;
    const bx = Math.cos(aim) * 4, by = Math.sin(aim) * 4;
    const len = 31 + 8 * Math.sin(Math.PI * sweepProg);
    cx.strokeStyle = "#c86bff";
    cx.shadowColor = "#c86bff"; cx.shadowBlur = 14;
    cx.lineWidth = 3.6; cx.lineCap = "round";
    cx.beginPath();
    cx.moveTo(bx + Math.cos(ba + Math.PI / 2) * s * 3, by + Math.sin(ba + Math.PI / 2) * s * 3);
    cx.lineTo(bx + Math.cos(ba) * len, by + Math.sin(ba) * len);
    cx.stroke();
    cx.strokeStyle = "#f3e6ff"; cx.shadowBlur = 5; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(bx + Math.cos(ba + Math.PI / 2) * s * 3, by + Math.sin(ba + Math.PI / 2) * s * 3);
    cx.lineTo(bx + Math.cos(ba) * len, by + Math.sin(ba) * len);
    cx.stroke();
  }
  cx.restore();
  cx.shadowBlur = 0;
  /* the swing — a crescent of light that travels across the facing */
  const reach = P.sinnerSlashReach || SINNER_REACH_BASE;
  if (P.sinnerSlashT > 0) {
    const k = clamp(1 - P.sinnerSlashT / SINNER_SLASH_LIFE, 0, 1);
    const dir = P.sinnerSlashDir < 0 ? -1 : 1;
    drawSinnerSlashArc(px, py, P.sinnerSlashAng - 0.24, reach, k, 1, dir);
    drawSinnerSlashArc(px, py, P.sinnerSlashAng + 0.24, reach, Math.max(0, k - 0.07), 0.8, dir);
  }
  if (P.sinnerSlash2T > 0) {
    const k = clamp(1 - P.sinnerSlash2T / SINNER_SLASH_LIFE, 0, 1);
    const dir = P.sinnerSlash2Dir < 0 ? -1 : 1;
    drawSinnerSlashArc(px, py, P.sinnerSlash2Ang - 0.24, reach, k, 1, dir);
    drawSinnerSlashArc(px, py, P.sinnerSlash2Ang + 0.24, reach, Math.max(0, k - 0.07), 0.8, dir);
  }
}
