/* =========================================================
   RUNEGUN · Speedrun timer
   A millisecond run clock that only advances while the descent is live
   (pauses, the codex and menus freeze it), plus per-warden personal bests
   for a completed descent.
   ========================================================= */
"use strict";

/* states in which the run clock is allowed to advance — an allow-list, so any
   new overlay/state added later freezes the clock until it is opted in */
const RUN_TIMER_STATES = new Set(["play", "blackjack", "rune", "choice", "wait"]);

/* 1:23.456 — minutes unpadded, milliseconds always three digits */
function fmtRunTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}

/* fastest clear for a warden: their own record first, then the mode ledger
   (a returning save may only have the mode-wide record). Every descent keeps
   its own key — NORMAL is the bare warden id, then :hard, :chaos, :classic —
   so a fast NORMAL run can never masquerade as a CHAOS best. */
function runSpeedKey(forChar) {
  if (Game.classicMode) return forChar + ":classic";
  if (Game.chaosMode) return forChar + ":chaos";
  if (Game.hardMode) return forChar + ":hard";
  return forChar;
}
function runModeLabel() {
  return Game.chaosMode ? "CHAOS BEST" : Game.classicMode ? "CLASSIC BEST" : Game.hardMode ? "HARD BEST" : "BEST";
}
function runBestTime(forChar) {
  const per = Meta.speedBests && Meta.speedBests[runSpeedKey(forChar)];
  if (typeof per === "number" && per > 0) return per;
  const b = modeBests();
  return b && b.speedSec > 0 ? b.speedSec : 0;
}

const RunTimer = {
  t: 0,                 // seconds of live run time
  running: false,       // a descent is under way
  done: false,          // the descent was completed (clock frozen for good)
  lastClock: "", lastBest: "",

  reset() {
    this.t = 0; this.running = false; this.done = false;
    this.paint(true);
  },
  /* called from resetRun — the clock starts with the descent, not the menu */
  start() {
    this.t = 0; this.running = true; this.done = false;
    this.lastClock = ""; this.lastBest = "";
    this.paint(true);
  },
  tick(dt) {
    if (this.running && !this.done && RUN_TIMER_STATES.has(Game.state)) this.t += dt;
    this.paint();
  },
  /* death needs no explicit stop — the allow-list freezes the clock in dead/continue,
     so a paid revive steps back into the same running clock. */
  /* THE UNKNOWN falls — the descent is complete; bank the record */
  finish() {
    if (!this.running || this.done) return null;
    this.running = false; this.done = true;
    const sec = this.t, stamp = Math.round(sec * 1000) / 1000;
    let prev = 0, newBest = false;
    if (!Game.devRun && !(typeof Net !== "undefined" && Net.active)) {
      const mode = modeBests();
      prev = mode.speedSec || 0;
      if (!prev || stamp < prev) { mode.speedSec = stamp; newBest = true; }
      if (!Meta.speedBests) Meta.speedBests = {};
      const key = runSpeedKey(Meta.char);
      const per = Meta.speedBests[key] || 0;
      if (!per || stamp < per) { Meta.speedBests[key] = stamp; newBest = true; }
      metaSave();
    }
    this.paint(true);
    const msg = "DESCENT COMPLETE · " + fmtRunTime(sec) + (newBest ? " · NEW BEST" : prev ? " · BEST " + fmtRunTime(prev) : "");
    if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("FINISH", msg);
    /* let the boss-death toast have the screen first */
    setTimeout(() => { if (Game.state === "play") toast(msg); }, 1600);
    return sec;
  },
  /* a floor boundary split — logged for the console, flashed after the descent toast */
  split(label) {
    if (!this.running || this.done) return;
    const at = this.t, name = label || ("FLOOR " + (Game.mapIdx + 1));
    if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("SPLIT", name + " · " + fmtRunTime(at));
    setTimeout(() => {
      if (Game.state === "play" && RunTimer.running && !RunTimer.done) toast("SPLIT · " + name + " · " + fmtRunTime(at));
    }, 1500);
  },
  paint(force) {
    const clock = $("runClock"), bestEl = $("runBest");
    if (!clock) return;
    const txt = fmtRunTime(this.t);
    if (force || txt !== this.lastClock) { clock.textContent = txt; this.lastClock = txt; }
    clock.classList.toggle("done", this.done);
    if (!bestEl) return;
    const pb = runBestTime(Meta.char), bt = pb ? runModeLabel() + " · " + fmtRunTime(pb) : "";
    if (force || bt !== this.lastBest) { bestEl.textContent = bt; this.lastBest = bt; }
  },
};
