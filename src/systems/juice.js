/* =========================================================
   RUNEGUN · Kill-streak juice — the payout
   The streak the game already tracked (Game.comboN / Game.comboT) made visible:
   escalating callouts over each corpse, a draining window meter on the souls
   tally, soul motes flying corpse -> counter, and a ratcheting audio ladder.

   Everything here is cosmetic EXCEPT streakMul() — the one economy line.
   Meta.juice gates the spectacle: "full" · "lite" (no whole-screen effects) ·
   "off" (byte-for-byte the pre-streak behaviour, multiplier aside).
   ========================================================= */
"use strict";

/* the streak window. Shared with killEnemy so the sim and the meter can never disagree. */
const COMBO_WINDOW = 0.6;

/* hs = hitstop ceiling · shk = shake floor · gold = P(a corpse particle is gold)
   mot = soul motes per kill · sm / fl = tier-ENTRY slowmo / gold flash.
   The colour ramp runs bone -> gold -> ember -> white-gold. Arcane and blood are
   left out on purpose: they already mean CURSED and HURT. */
const STREAK_TIERS = [
  { n: 3,  label: "THREEFOLD",  color: "#e8e2d0", hs: 0.045, shk: 5,  gold: 0,    mot: 2, sm: 0,    fl: 0    },
  { n: 5,  label: "RAMPANT",    color: "#ffd23d", hs: 0.050, shk: 7,  gold: 0.25, mot: 3, sm: 0,    fl: 0    },
  { n: 8,  label: "BUTCHERY",   color: "#ffb03d", hs: 0.055, shk: 9,  gold: 0.50, mot: 4, sm: 0,    fl: 0.10 },
  { n: 12, label: "MASSACRE",   color: "#ff8a3d", hs: 0.060, shk: 11, gold: 0.70, mot: 5, sm: 0,    fl: 0.14 },
  { n: 17, label: "SOUL FLOOD", color: "#fff3c8", hs: 0.065, shk: 13, gold: 0.85, mot: 6, sm: 0.22, fl: 0.18 },
  { n: 24, label: "THE TITHE",  color: "#fff3c8", hs: 0.070, shk: 14, gold: 1,    mot: 7, sm: 0.28, fl: 0.22 },
];
const STREAK_GOLD = ["#ffd23d", "#fff3c8", "#ffb03d"];

function streakTier(n) {
  let t = -1;
  for (let i = 0; i < STREAK_TIERS.length; i++) if (n >= STREAK_TIERS[i].n) t = i;
  return t;
}

/* THE PAYOUT RATE — the only line here that touches the economy.
   x1.00 on the first kill of a streak, climbing to x1.25 at 21 kills and capping.
   Non-boss only (the warden bounty is its own line in bossSlain). */
function streakMul(n) { return 1 + 0.0125 * Math.min(Math.max(n - 1, 0), 20); }

/* ---------- screen flash (colour-carrying) ----------
   Game.flash used to be red-only, painted from a hardcoded literal in draw().
   The streak needs a GOLD flash, so the colour rides along with the amount —
   otherwise a hit landing near a streak flash would paint the damage
   indicator gold, which reads as a bug rather than a flourish. */
const FLASH_RED = "255,40,60", FLASH_GOLD = "255,210,61";
function screenFlash(amt, col) {
  /* >= (not >) preserves the deliberate assignment at the hurt site: an equal
     flash still re-colours, so a hit always wins over a streak of the same weight */
  if (amt >= Game.flash) { Game.flash = amt; Game.flashCol = col || FLASH_RED; }
}

/* ---------- per-run scratch ----------
   All of these are compared against Game.time, which resets to 0 on a new run —
   a stale value would silently suppress the first streak of run #2. */
let lastCalloutT = -1, lastBumpT = -1;
let elScore = null, elWrap = null, elMult = null, elRate = null, elFill = null;
let mOn = false, mN = -1, mV = -1;       // combo-meter change gate
let hudPt = null;                        // cached screen position of the souls counter

function resetJuice() {
  lastCalloutT = -1; lastBumpT = -1;
  mOn = false; mN = -1; mV = -1;
  hudPt = null;
  if (elWrap) elWrap.classList.remove("streak");
  if (typeof soulMotes !== "undefined" && soulMotes) soulMotes.length = 0;
}

function juiceEls() {
  if (elFill) return;
  elScore = $("score"); elWrap = $("scoreWrap");
  elMult = $("comboMult"); elRate = $("comboRate"); elFill = $("comboFill");
}

/* =========================================================
   THE FREEZE BUDGET
   Hitstop is a full sim freeze. The RECURRING ones — every kill, every heavy hit,
   every streak beat — share one budget: a freeze of s seconds books s / HS_BUDGET of
   game time, and no other recurring freeze may start inside it, so together they
   never hold the sim still more than HS_BUDGET of the time. Past roughly 40%, aiming
   and dodging stop feeling responsive.
   They used to stack instead. The streak beat had its own 0.14s gate, but the per-kill
   and per-heavy-hit freezes ignored it, so a NOVA / SPLINTER chain killing every frame
   kept refreshing them: measured on a refilling horde, the sim stood frozen 59–80% of
   the time (TITAN, NOVA, SPLINTER, STORM+RAPID+SCATTER) — slow, juddering play that
   reads as heavy lag at 100+ fps. Math.max still means a longer freeze already running
   is never cut short. One-off beats — a warden's death, a wave cleared, an ambush
   springing — stay outside the budget and freeze in full.
   ========================================================= */
const HS_BUDGET = 0.3;
function beatHitstop(s) {
  if (Game.time < Game.hsReadyT) return;
  Game.hsReadyT = Game.time + s / HS_BUDGET;
  Game.hitstop = Math.max(Game.hitstop, s);
}

/* =========================================================
   THE KILL — escalation
   ========================================================= */
function streakKillFX(e, n) {
  const tier = streakTier(n);
  if (tier < 0 || e.boss) return;
  Game.streakTier = Math.max(Game.streakTier, tier);
  const J = Meta.juice;

  /* OFF reproduces the original beat: one hitstop floor, one beep — the floor now
     inside the freeze budget like every recurring freeze */
  if (J === "off") {
    beatHitstop(0.05);
    AudioFX.combo(n);
    return;
  }

  const T = STREAK_TIERS[tier];
  const entered = tier > streakTier(n - 1);     // did THIS kill open the tier?
  const lite = J === "lite";

  /* Math.max (never +=) means a NOVA killing eight enemies in one frame still yields
     ONE freeze; the shared budget (beatHitstop, above) bounds a sustained streak */
  beatHitstop(lite ? Math.min(T.hs, 0.05) : T.hs);
  /* the 18px cap in draw() stays the backstop — a streak plus a boss death
     still cannot shake past it */
  Game.shake = Math.max(Game.shake, lite ? Math.min(T.shk, 8) : T.shk);

  /* whole-screen punctuation: tier ENTRY only, full only, and never while a
     warden fight or the death ceremony already owns the screen */
  if (entered && !lite && !Game.boss && !Game.ceremonyT) {
    if (T.sm) Game.slowmo = Math.max(Game.slowmo, T.sm);
    if (T.fl && Game.time - Game.streakFlashT > 0.5) {   // photosensitivity floor
      Game.streakFlashT = Game.time;
      screenFlash(T.fl, FLASH_GOLD);
    }
  }

  /* one voice per beat: the tier chord on entry, the old climbing blip between */
  if (entered) { AudioFX.streakChord(tier); haptic(tier >= 3 ? 22 : 12); }
  else AudioFX.combo(n);

  spawnStreakCallout(e, n, tier, entered, lite);
  spawnSoulMotes(e, lite ? Math.min(T.mot, 3) : T.mot);
}

function spawnStreakCallout(e, n, tier, entered, lite) {
  /* a multi-kill frame (NOVA, SPLINTER, the boss-death sweep) must not stack
     ten callouts on one corpse pile */
  if (floaters.length > 60) return;
  if (Game.time - lastCalloutT < 0.06) return;
  lastCalloutT = Game.time;
  const T = STREAK_TIERS[tier];
  floatText(e.x, e.y - 26, entered ? T.label : "×" + n, T.color,
    entered ? 15 + tier : 12, {
      life: entered ? 0.9 : 0.7,
      vy: entered ? 22 : 30,
      pop: lite ? (entered ? 0.4 : 0.2) : (entered ? 0.9 : 0.45),
      outline: "rgba(0,0,0,0.78)",          // readability comes from the stroke, not blur
      glow: (!lite && entered) ? 10 : 0,
    });
}

/* =========================================================
   THE BREAK — the held breath released
   Deliberately no shake, no hitstop, no flash and no souls: punishing the
   player's screen because a timer expired during a lull is the classic
   over-juice failure. It should feel like an exhale, not a hit taken.
   ========================================================= */
function streakEnd(n, tier) {
  if (Meta.juice === "off") return;   // OFF means OFF — not even the sting
  const t = Math.max(0, tier);
  AudioFX.streakLost(t);
  const jlp = localPlayer();
  if (jlp) {
    floatText(jlp.x, jlp.y - 46, n + " STREAK", STREAK_TIERS[t].color, 15,
      { life: 0.9, vy: 18, pop: 0.5, outline: "rgba(0,0,0,0.78)" });
  }
  juiceEls();
  if (elMult) { elMult.classList.remove("lost"); void elMult.offsetWidth; elMult.classList.add("lost"); }
  if (t >= 3) haptic(18);
}

/* =========================================================
   THE METER — the draining window on the souls tally
   Driven from draw(), NOT update(): update() early-returns on hitstop and is not
   called at all behind the pause / rune / choice overlays, which would strand the
   bar at a stale value. Reading it in draw() means the bar always matches the
   frame you are looking at — and since comboT decays in update(), it correctly
   FREEZES behind an overlay instead of draining while you cannot play.
   ========================================================= */
function tickComboMeter() {
  juiceEls();
  if (!elWrap) return;
  const on = Meta.juice !== "off" && Game.comboN >= 2 && Game.comboT > 0;
  if (on !== mOn) { mOn = on; elWrap.classList.toggle("streak", on); }
  if (!on) return;
  /* textContent CAN dirty layout, so it is written only when the integer moves */
  if (Game.comboN !== mN) {
    mN = Game.comboN;
    elMult.textContent = "×" + mN;
    const pct = Math.round((streakMul(mN) - 1) * 100);
    elRate.textContent = pct > 0 ? "+" + pct + "% SOULS" : "";
    const t = streakTier(mN);
    elWrap.style.setProperty("--combo-col", t < 0 ? "#ffd23d" : STREAK_TIERS[t].color);
  }
  /* transform on a will-change element is a write-only compositor op — it never
     forces layout, which is why this is safe to do every frame on a phone */
  const v = clamp(Game.comboT / COMBO_WINDOW, 0, 1);
  if (Math.abs(v - mV) > 0.008) { mV = v; elFill.style.transform = "scaleX(" + v.toFixed(3) + ")"; }
}

/* the periphery breathes with the drain — the meter's tension, repeated where
   peripheral vision actually lives. Returns 0..1; 0 means "leave the vignette alone". */
function streakVignette() {
  if (Meta.juice === "off" || Game.streakTier < 0) return 0;
  const s = clamp(Game.streakTier / (STREAK_TIERS.length - 1), 0, 1) *
            clamp(Game.comboT / COMBO_WINDOW, 0, 1);
  return Meta.juice === "lite" ? s * 0.5 : s;
}

/* =========================================================
   SOUL MOTES — the payout travelling to the counter
   Screen space, not world space: they are going to a DOM element.
   ========================================================= */
function markHudDirty() { hudPt = null; }

function soulTarget() {
  if (hudPt) return hudPt;
  juiceEls();
  const r = elScore && elScore.getBoundingClientRect();
  /* an empty rect means the HUD is hidden — aim at the corner but DON'T cache it,
     or the motes would keep flying at a stale guess once the HUD returns */
  if (!r || (!r.width && !r.height)) return { x: W - 46, y: 44 };
  hudPt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return hudPt;
}

function spawnSoulMotes(e, count) {
  if (Meta.juice === "off") return;
  const cap = Meta.juice === "lite" ? 16 : 40;
  const n = Math.min(count, cap - soulMotes.length);
  /* snapshot the corpse in screen space so a camera pan cannot drag the payout;
     same world->screen conversion draw() applies */
  const sx = (e.x - Game.cam.x) * ZOOM, sy = (e.y - Game.cam.y) * ZOOM;
  for (let i = 0; i < n; i++) {
    soulMotes.push({
      x: sx, y: sy, px: sx, py: sy,
      x0: sx + rnd(-14, 14), y0: sy + rnd(-14, 14),
      cx: 0, cy: 0, x1: 0, y1: 0, res: false,   // arc resolved on first live tick
      t: -i * 0.045,                            // stagger: a ratchet, not one thud
      life: rnd(0.42, 0.62), r: rnd(2.2, 4),
      col: pick(STREAK_GOLD), last: i === n - 1,
    });
  }
}

function tickSoulMotes(dt) {
  const T = soulTarget();
  for (let i = soulMotes.length - 1; i >= 0; i--) {
    const m = soulMotes[i];
    m.t += dt;
    if (m.t < 0) continue;                      // still inside its stagger delay
    if (!m.res) {                               // resolve the arc against the live target
      m.res = true;
      m.x1 = T.x + rnd(-8, 8); m.y1 = T.y + rnd(-6, 6);
      m.cx = lerp(m.x0, m.x1, 0.45) + rnd(-70, 70);
      m.cy = Math.min(m.y0, m.y1) - rnd(60, 140);
    }
    const u = m.t / m.life;
    if (u >= 1) { arriveMote(m); soulMotes.splice(i, 1); continue; }
    const k = u * u, iv = 1 - k;                // accelerate: a lazy float, then sucked in
    m.px = m.x; m.py = m.y;
    m.x = iv * iv * m.x0 + 2 * iv * k * m.cx + k * k * m.x1;
    m.y = iv * iv * m.y0 + 2 * iv * k * m.cy + k * k * m.y1;
  }
}

function arriveMote(m) {
  AudioFX.coinTick();
  /* the souls were committed the instant the enemy died — the mote only fires the
     pop. Re-triggering .bump forces a synchronous reflow, so throttle it hard. */
  juiceEls();
  if (elScore && (m.last || Game.time - lastBumpT > 0.12)) {
    lastBumpT = Game.time;
    elScore.classList.remove("bump"); void elScore.offsetWidth; elScore.classList.add("bump");
  }
  if (m.last) haptic(8);
}

function drawSoulMotes() {
  if (!soulMotes.length) return;
  const glow = Meta.juice === "full";
  cx.save();
  /* ONE blur state for a batch capped at 40 — and the canvas.js GLOW shim still
     scales it, so GLOW: OFF zeroes this for free */
  if (glow) { cx.shadowColor = "#ffd23d"; cx.shadowBlur = 8; }
  cx.lineWidth = 1.5;
  for (const m of soulMotes) {
    if (m.t < 0) continue;
    const u = m.t / m.life;
    cx.globalAlpha = clamp(1 - u * u * 0.2, 0, 1);
    cx.strokeStyle = cx.fillStyle = m.col;
    if (glow) { cx.beginPath(); cx.moveTo(m.px, m.py); cx.lineTo(m.x, m.y); cx.stroke(); }
    cx.beginPath(); cx.arc(m.x, m.y, m.r * (1 - 0.35 * u), 0, TAU); cx.fill();
  }
  cx.restore();
  cx.globalAlpha = 1;
}

window.addEventListener("orientationchange", markHudDirty);
