/* =========================================================
   RUNEGUN · Reanimator — the Necromancer's thrall rites
   Two timers ride the playable REANIMATOR (characters.js):
     · RECALL      — every few seconds the whole pack is pulled back into a
                     ring around its master (also on demand with the recall bind)
     · SOUL TITHE  — while bleeding out, a surplus of thralls is spent for a
                     doubled share of the healing a normal thrall death pays
   Every number lives in REANIMATOR below. Tune the whole kit from here.
   ========================================================= */
"use strict";

const REANIMATOR = {
  /* recall rite */
  recallEvery: 24,          // seconds between automatic recalls
  recallRadius: 74,         // how far out the ring lands, in world units
  /* soul tithe (emergency sacrifice) */
  sacrificeEvery: 10,       // seconds between checks
  sacrificeBelow: 0.35,     // vitality fraction that opens the rite
  sacrificeMinThralls: 5,   // the warden must hold MORE than this many
  sacrificeMax: 3,          // thralls offered per check
  sacrificeKeep: 3,         // …never leaving fewer than this many
  sacrificeHealMul: 2,      // per-thrall healing vs a normal SOUL FEED
};

/* the ordinary thrall-death healing roll, shared by combat.js and the tithe */
const SOUL_FEED = { min: 2, max: 7 };
function soulFeedHeal() { return Math.floor(rnd(SOUL_FEED.min, SOUL_FEED.max)); }

function isReanimator(p) {
  return !!p && p.char === "necromancer" && p.hp > 0 && !p.downed;
}

/* The host owns the living world in a shared descent; the guest only predicts
   its own body. Timer-driven thrall rites must not run on both sides. */
function reanimatorAuthority() {
  return !(typeof Net !== "undefined" && Net.active && Net.role === "guest");
}

function livingThralls(owner) {
  const out = [];
  if (!owner) return out;
  for (const e of enemies) {
    if (e.team === "p" && e.owner === owner && e.summoned && !e.dead) out.push(e);
  }
  return out;
}

/* Pull every living thrall into a ring around its master. Returns how many
   answered the call (0 when the pack is empty, so the caller can leave the
   cooldown alone). */
function reanimatorRecall(p) {
  const thralls = livingThralls(p);
  const n = thralls.length;
  if (!n) return 0;
  const base = p.aim || 0;
  for (let i = 0; i < n; i++) {
    const e = thralls[i];
    const a = base + (i / n) * TAU + rnd(-0.12, 0.12);
    const rr = REANIMATOR.recallRadius + (i % 2 ? 20 : 0);
    let x = clamp(p.x + Math.cos(a) * rr, 40 + e.r, MAP.w - 40 - e.r);
    let y = clamp(p.y + Math.sin(a) * rr, 40 + e.r, MAP.h - 40 - e.r);
    if (MAP.rocks.some(rc => circleRect(x, y, e.r + 2, rc))) {
      const s = openSpotNear(p, REANIMATOR.recallRadius * 0.55, REANIMATOR.recallRadius * 1.5);
      x = s.x; y = s.y;
    }
    /* a tear at both ends of the jump — the body leaves a little of itself behind */
    for (let k = 0; k < 5; k++) {
      particles.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8),
        vx: rnd(-90, 90), vy: rnd(-130, -30), t: 0, life: rnd(0.22, 0.5),
        r: rnd(1.5, 3.5), color: "#8a86a0" });
      particles.push({ x: x + rnd(-8, 8), y: y + rnd(-8, 8),
        vx: rnd(-70, 70), vy: rnd(-110, -20), t: 0, life: rnd(0.2, 0.45),
        r: rnd(1.5, 3), color: "#b9a8ff" });
    }
    e.x = x; e.y = y; e.vx = e.vy = 0;
  }
  shockwaves.push({ x: p.x, y: p.y, r: 8, max: REANIMATOR.recallRadius + 34, speed: 520,
    dmg: 0, hostile: false, color: "#9d6bff", hitSet: new Set() });
  floatText(p.x, p.y - 44, "THRALLS RECALLED", "#b9a8ff", 13);
  AudioFX.recall();
  return n;
}

/* On-demand recall: works whenever the pack exists, but pays for the privilege
   by restarting the automatic timer. */
function reanimatorRecallNow(p) {
  if (!isReanimator(p)) return false;
  if (!reanimatorRecall(p)) return false;
  p.thrallRecallT = REANIMATOR.recallEvery;
  return true;
}

/* Spend a few of the pack to claw the master back above the brink.
   killEnemy runs the ordinary thrall-death hook with `sacrifice` set, which
   pays REANIMATOR.sacrificeHealMul × SOUL FEED and tallies the total instead
   of printing a line per body. */
function reanimatorSacrifice(p) {
  if (!isReanimator(p)) return 0;
  if (p.hp / p.maxHp >= REANIMATOR.sacrificeBelow) return 0;
  const thralls = livingThralls(p);
  if (thralls.length <= REANIMATOR.sacrificeMinThralls) return 0;
  const offer = Math.min(REANIMATOR.sacrificeMax, thralls.length - REANIMATOR.sacrificeKeep);
  if (offer <= 0) return 0;
  /* spend the most wounded first — the pack keeps its strongest hands */
  thralls.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
  p.sacrificeTally = 0;
  for (let i = 0; i < offer; i++) {
    const e = thralls[i];
    e.sacrifice = true;
    /* the ghost is dragged inward before it comes apart */
    for (let k = 0; k < 10; k++) {
      const a = rnd(0, TAU), d = rnd(6, 26);
      const sx = e.x + Math.cos(a) * d, sy = e.y + Math.sin(a) * d;
      particles.push({ x: sx, y: sy, vx: (p.x - sx) * rnd(1.2, 2.4), vy: (p.y - sy) * rnd(1.2, 2.4),
        t: 0, life: rnd(0.3, 0.6), r: rnd(1.5, 3.5), color: "#ff6bd6" });
    }
    killEnemy(e, p);
  }
  const total = p.sacrificeTally || 0;
  p.sacrificeTally = 0;
  shockwaves.push({ x: p.x, y: p.y, r: 8, max: 130, speed: 420,
    dmg: 0, hostile: false, color: "#ff6bd6", hitSet: new Set() });
  floatText(p.x, p.y - 46, "+" + total + " SOUL TITHE", "#ff6bd6", 16);
  if (total > 0) toast("THE PACK PAYS · +" + total + " VITALITY");
  AudioFX.sacrifice();
  return offer;
}

/* Called once per warden per simulated tick. Keeps both clocks and fires the
   rites. Only the authority should call this (see reanimatorAuthority). */
function reanimatorTick(p, dt) {
  if (!isReanimator(p)) return;
  if (typeof p.thrallRecallT !== "number") p.thrallRecallT = REANIMATOR.recallEvery;
  if (typeof p.thrallSacrificeT !== "number") p.thrallSacrificeT = REANIMATOR.sacrificeEvery;
  p.thrallRecallT = Math.max(0, p.thrallRecallT - dt);
  p.thrallSacrificeT = Math.max(0, p.thrallSacrificeT - dt);
  if (p.thrallRecallT <= 0) {
    p.thrallRecallT = REANIMATOR.recallEvery;
    reanimatorRecall(p);
  }
  if (p.thrallSacrificeT <= 0) {
    p.thrallSacrificeT = REANIMATOR.sacrificeEvery;
    reanimatorSacrifice(p);
  }
}

/* A small HUD line under the vitality bar, written only when its text actually
   changes (the count ticks once a second, not once a frame). */
let lastThrallCue = null;
function updateThrallCue(p) {
  const el = $("thrallCue");
  if (!el) return;
  if (!p || p.char !== "necromancer") {
    if (lastThrallCue !== "") {
      lastThrallCue = "";
      el.textContent = "";
      el.className = "";
    }
    return;
  }
  const n = reanimatorThrallCount(p);
  const t = Math.ceil(p.thrallRecallT || 0);
  const ready = t <= 0;
  const key = ready && !Input.touchMode ? bindLabel("recall") : "";
  const txt = "THRALLS " + n + " / " + REANIMATOR_THRALL_CAP + " · " +
    (ready ? "RECALL READY" + (key ? " [" + key + "]" : "") : "RECALL IN " + t + "s");
  const cls = "on" + (ready && n ? " ready" : "");
  if (lastThrallCue !== txt + cls) {
    lastThrallCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}
