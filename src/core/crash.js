/* =========================================================
   RUNEGUN · Crash recording
   Loads FIRST, before every other script, so it can catch errors thrown while
   the rest of the source is still evaluating.

   A shipped Android build has no console anyone can open: an uncaught error is
   an unreportable black screen. This records what went wrong to localStorage
   under its OWN key (never the save key — a crash must not be able to corrupt
   the vault) so it survives a restart and can be read back with
   `Crash.dump()` from a debug build or `adb shell`.

   Everything here is defensive to the point of paranoia: noteCrash() is called
   from inside catch blocks, so it must never throw, and main.js re-arms the
   frame loop in a `finally` — meaning a persistent error fires ~60×/second.
   Repeats of the same fault are therefore counted, not re-stored, and writes
   are throttled hard.
   ========================================================= */
"use strict";

const Crash = (() => {
  const KEY = "runegun.crash.v1";
  const MAX_ENTRIES = 5;        // keep the first few distinct faults, drop the rest
  const PERSIST_MS = 5000;      // never touch localStorage more often than this

  const counts = new Map();     // signature -> times seen this session
  let entries = [];             // [{ where, msg, stack, at, n }]
  let lastPersist = -Infinity;
  let dirty = false;

  /* Collapse a fault to a stable identity so a per-frame repeat is one row. */
  function signature(where, err) {
    const msg = (err && (err.message || err.reason || err)) + "";
    const top = (err && err.stack ? String(err.stack).split("\n")[1] || "" : "").trim();
    return where + "|" + msg + "|" + top;
  }

  function persist() {
    /* Throttled: a 60fps error storm must not become 60 localStorage writes/sec. */
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
    if (now - lastPersist < PERSIST_MS) return;
    lastPersist = now;
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch (e) {}
  }

  /* Record one fault. Safe to call from anywhere, including a catch block that
     is itself running inside the frame loop. Never throws, never rethrows. */
  function noteCrash(where, err) {
    try {
      const sig = signature(where, err);
      const n = (counts.get(sig) || 0) + 1;
      counts.set(sig, n);

      if (n === 1) {
        if (entries.length < MAX_ENTRIES) {
          entries.push({
            where: String(where),
            msg: ((err && (err.message || err.reason)) || err) + "",
            stack: (err && err.stack ? String(err.stack).slice(0, 900) : ""),
            at: new Date().toISOString(),
            n: 1,
          });
          dirty = true;
        }
      } else {
        const row = entries.find(e => e.where === String(where) &&
                                      e.msg === (((err && (err.message || err.reason)) || err) + ""));
        if (row) { row.n = n; dirty = true; }
      }
      if (dirty) persist();
    } catch (e) { /* recording a crash must never cause one */ }
  }

  /* Read back what was recorded — this session's rows plus anything a previous
     run left behind. `Crash.dump()` in a WebView console / debug build. */
  function dump() {
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) {}
    return { session: entries, stored };
  }

  function clear() {
    entries = []; counts.clear(); dirty = false;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /* Anything that escaped to the top: script-load errors, listener callbacks,
     and any throw the frame loop's own catch did not already see. */
  window.addEventListener("error", e => {
    noteCrash("window", (e && e.error) || (e && e.message) || e);
  });
  /* Floating promise rejections — every native plugin call is a promise, and
     these are otherwise completely invisible on a device. */
  window.addEventListener("unhandledrejection", e => {
    noteCrash("promise", (e && e.reason) || e);
  });

  return { noteCrash, dump, clear };
})();

/* Global shorthand — main.js's frame loop and any other catch block calls this. */
function noteCrash(where, err) { Crash.noteCrash(where, err); }
