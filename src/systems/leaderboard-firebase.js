/* =========================================================
   RUNEGUN · Online score board — Firebase Realtime Database
   A provider with the SAME shape as the Play Games plugin shim, so
   systems/leaderboard.js can point at either one without the UI knowing:

     signIn() · submitScore() · loadTopScores() · loadPlayerCenteredScores()
     getUserTotalScore() · showLeaderboard() · unlockAchievement()

   Why it exists: Play Games Services only runs inside the signed Android
   build. The browser build (and the Android WebView, which is the same
   bundle) needs one board everyone can reach — this is it. Scores live at

     /scores/<auth.uid> = {
       name, display, place, updatedAt,
      score, hardScore, classicScore, chaosScore,
      normalClearMs, hardClearMs, classicClearMs, chaosClearMs,
       normal: { char, runes },               // the loadout behind that best
       hard:   { char, runes },
       chaos:  { char, runes },
       normalClear: { char, runes },          // the loadout behind that fastest clear
       hardClear:   { char, runes },
       classicClear:{ char, runes },
       chaosClear:  { char, runes },
     }

   The mode objects are cosmetic tags: WHICH warden and which runes the run
   that set the record was holding. They are written only when the score
   itself improves, so a tag never describes a different run than the number
   beside it, and they are written in a SECOND request — an older rules tree
   without those fields must never cost a player their score.

    The score tag (`normal`, ...) and the clear-time tag (`normalClear`, ...)
    are separate records: a fast SHREDDER clear must not be labelled with the
    GUNSMITH loadout that happens to hold the souls record, and vice versa.

   `name` is a generated WARDEN-XXXX callsign stored in Meta.boardName.
   `display` is an optional manual display handle to override the callsign.
   `place` indicates the submission source (e.g. github, vscode live server).

   SETUP (one time, Firebase console → project runegunp):
     1. Build → Authentication → Sign-in method → Anonymous → Enable.
        Without this, sign-in fails with CONFIGURATION_NOT_FOUND and the
        LEADERBOARDS button simply never appears (everything else works).
        (Already enabled on runegunp.)
     2. Realtime Database → Rules → paste firebase.rules.json (repo root).
        That file is the complete tree: the co-op `rooms` block and the
        `scores` block. Nothing else in the database is used by this game.
     3. Nothing else: the database already backs co-op signaling.

   A second NAMED app instance is used on purpose. Co-op calls goOffline()
   on its own handle when a room is done (net/signal.js release()), and
   that switch is per database INSTANCE — sharing it would silently strand
   every score read/write for the rest of the session. Separate app, separate
   socket, separate offline switch.
   ========================================================= */
"use strict";

const FirebaseBoard = (() => {
  const APP_NAME = "runegun-scores";      // named app → its own DB connection (see header)
  const SCORES = "scores";
  const SCORE_CAP = 100000000;            // mirrors the rule; a forged number never leaves the device
  const OP_TIMEOUT_MS = 12000;            // RTDB never fails fast — see the guard below
  const CACHE_MS = 20000;                 // board snapshot reuse across tab taps
  const SCAN_CAP = 500;                   // deepest board we rank exactly (see rowsFor)
  const NAME_PREFIX = "WARDEN-";
  const NAME_LEN = 4;
  /* no O/0/I/1 — these are read off a screen, and 0/O is the only ambiguity
     anyone ever argues about */
  const NAME_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  /* one board per mode; the value is the row field that carries its score */
  const FIELDS = { normal: "score", hard: "hardScore", classic: "classicScore", chaos: "chaosScore" };
  const CLEAR_FIELDS = {
    normal: "normalClearMs", hard: "hardClearMs",
    classic: "classicClearMs", chaos: "chaosClearMs",
  };
  /* the loadout behind each fastest clear — deliberately separate from the
     score tags above, because the run that set the time is not necessarily the
     run that set the souls record */
  const CLEAR_TAG_FIELDS = {
    normal: "normalClear", hard: "hardClear",
    classic: "classicClear", chaos: "chaosClear",
  };
  const slotOf = id => (FIELDS[id] ? id : "normal");

  let app = null, db = null, auth = null;
  let uid = null, callsign = null;
  let signedIn = false;
  let initPromise = null;
  let lastError = null;
  const cache = {};                       // mode → { rows, at } (CACHE_MS reuse)

  function sdk() {
    return (typeof firebase !== "undefined" && firebase) ? firebase : null;
  }

  /* Cheap and safe to call before any SDK has been loaded — leaderboard.js
     asks this while deciding which provider to use. */
  function configured() {
    const f = sdk();
    return !!(f && typeof firebaseConfigured === "function" && firebaseConfigured() &&
              typeof f.initializeApp === "function" &&
              typeof f.database === "function" &&
              typeof f.auth === "function");
  }

  /* The Realtime Database client queues reads and writes forever when the
     socket is down or refused; the promise never settles. Every network call
     therefore races a timeout so the UI can say "the void does not answer"
     instead of spinning on "CONSULTING THE VOID…" for the whole session. */
  function guard(promise, label) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        const e = new Error("board-timeout:" + (label || "op"));
        lastError = e.message;
        reject(e);
      }, OP_TIMEOUT_MS);
      promise.then(v => {
        if (done) return;
        done = true; clearTimeout(timer); resolve(v);
      }, e => {
        if (done) return;
        done = true; clearTimeout(timer);
        lastError = (e && e.message) || String(e);
        reject(e);
      });
    });
  }

  /* ---- SDK boot: one named app, shared by auth + database ---- */
  function boot() {
    if (db && auth) return true;
    const f = sdk();
    if (!f || !configured()) return false;
    try {
      try { app = f.app(APP_NAME); }
      catch (e) { app = f.initializeApp(FIREBASE_CONFIG, APP_NAME); }
      db = f.database(app);
      auth = f.auth(app);
      return !!(db && auth);
    } catch (e) {
      lastError = (e && e.message) || "board-boot-failed";
      app = db = auth = null;
      return false;
    }
  }

  /* Resolve the persisted anonymous user before creating a new one. Creating
     a fresh anonymous account on every launch would hand the player a new uid
     — and therefore a new row, a new callsign and an empty-looking board —
     every single time they opened the game. */
  function restoredUser() {
    return new Promise(resolve => {
      let done = false;
      let unsub = () => {};
      const finish = u => {
        if (done) return;
        done = true;
        try { unsub(); } catch (e) {}
        resolve(u || null);
      };
      try {
        unsub = auth.onAuthStateChanged(finish, () => finish(null));
      } catch (e) { finish(null); }
      setTimeout(() => finish(auth.currentUser || null), 4000);
    });
  }

  /* ---- callsign ---- */
  function validCallsign(s) {
    return typeof s === "string" && /^WARDEN-[A-Z2-9]{4}$/.test(s);
  }
  function newCallsign() {
    let code = "";
    const bytes = new Uint8Array(NAME_LEN);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < NAME_LEN; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < NAME_LEN; i++) code += NAME_ALPHABET[bytes[i] % NAME_ALPHABET.length];
    return NAME_PREFIX + code;
  }
  function storedCallsign() {
    if (typeof Meta !== "undefined" && Meta && validCallsign(Meta.boardName)) return Meta.boardName;
    return null;
  }
  function setCallsign(name) {
    callsign = name;
    if (typeof Meta === "undefined" || !Meta) return;
    if (Meta.boardName === name) return;
    Meta.boardName = name;
    if (typeof metaSave === "function") metaSave();
  }
  function ensureCallsign() {
    if (callsign) return callsign;
    const known = storedCallsign();
    setCallsign(known || newCallsign());
    return callsign;
  }

  const field = mode => FIELDS[slotOf(mode)];
  const stamp = () => firebase.database.ServerValue.TIMESTAMP;

  function cleanTag(tag) {
    const char = (tag && typeof tag.char === "string") ? tag.char.slice(0, 24) : "";
    const runes = (tag && typeof tag.runes === "string") ? tag.runes.slice(0, 96) : "";
    const pet = (tag && typeof tag.pet === "string") ? tag.pet.slice(0, 24) : "";
    const out = { char: char || "gunsmith", runes };
    if (pet) out.pet = pet;
    const challenge = (tag && typeof tag.challenge === "string") ? tag.challenge.slice(0, 24) : "";
    if (challenge) out.challenge = challenge;
    return out;
  }

  function rowRef() { return db.ref(SCORES + "/" + uid); }

  async function ensureRow() {
    const snap = await guard(rowRef().get(), "row");
    const row = (snap && snap.val && snap.val()) || null;
    if (row && typeof row.name === "string" && row.name) {
      setCallsign(row.name.slice(0, 20));
      return;
    }
    const name = ensureCallsign();
    const patch = { name, updatedAt: stamp() };
    if (!row) {
      patch.score = 0; patch.hardScore = 0; patch.classicScore = 0; patch.chaosScore = 0;
    }
    await guard(rowRef().update(patch), "claim");
  }

  /* ---- plugin-shaped API ---- */

  async function signIn() {
    if (!boot()) throw new Error("board-unconfigured");
    if (signedIn && uid) return { player_id: uid, player_name: callsign };
    if (initPromise) return initPromise;
    initPromise = (async () => {
      let user = auth.currentUser || await restoredUser();
      if (!user) {
        const cred = await guard(auth.signInAnonymously(), "auth");
        user = (cred && cred.user) || auth.currentUser || (cred && cred.uid ? cred : null);
      }
      if (!user || !user.uid) throw new Error("board-no-user");
      uid = user.uid;
      await ensureRow();
      signedIn = true;
      lastError = null;
      return { player_id: uid, player_name: callsign };
    })();
    try { return await initPromise; }
    finally { initPromise = null; }
  }

  /* Accepts optional `place` and manual `display` fields during score submission */
  async function submitScore({ leaderboardID, totalScoreAmount, tag, place, display } = {}) {
    if (!signedIn || !uid) return;
    const amount = Math.floor(Number(totalScoreAmount) || 0);
    if (!(amount > 0) || amount > SCORE_CAP) return;
    const slot = slotOf(leaderboardID), key = field(slot);
    let cur = 0;
    try {
      const snap = await guard(rowRef().child(key).get(), "best");
      cur = Number(snap && snap.val && snap.val()) || 0;
    } catch (e) {}
    if (amount < cur) return;

    const updatePayload = {};
    if (amount > cur) updatePayload[key] = amount;
    if (amount > cur) updatePayload.updatedAt = stamp();
    if (place) updatePayload.place = place;
    if (display) updatePayload.display = display; // Manual display name override

    if (Object.keys(updatePayload).length) {
      await guard(rowRef().update(updatePayload), "submit");
      cache[slot] = null;
      cache.allRows = null;
    }
    if (tag) {
      try {
        await guard(rowRef().child(slot).set(cleanTag(tag)), "tag");
        cache[slot] = null;
        cache.allRows = null;
      }
      catch (e) {
        if (typeof console !== "undefined" && console.warn)
          console.warn("[runegun] leaderboard loadout tag was rejected; verify the deployed Firebase rules allow /scores/" + slot, (e && e.message) || e);
      }
    }
  }

  async function submitClearTime(mode, timeMs, place, platform, tag) {
    if (!signedIn || !uid || !CLEAR_FIELDS[mode]) return;
    const amount = Math.round(Number(timeMs) || 0);
    if (!(amount > 0) || amount > 86400000) return;
    const key = CLEAR_FIELDS[mode];
    let cur = 0;
    try {
      const snap = await guard(rowRef().child(key).get(), "clear-best");
      cur = Number(snap && snap.val && snap.val()) || 0;
    } catch (e) {}
    const better = !(cur > 0) || amount < cur;
    /* A tie is not a new record, but it IS the one chance an older mis-tagged
       row gets to be relabelled — so accept a supplied tag on an exact tie. */
    if (!better && !(cur > 0 && amount === cur && tag)) return;
    const updatePayload = {};
    if (better) {
      updatePayload[key] = amount;
      updatePayload.updatedAt = stamp();
      if (typeof place === "string" && place) updatePayload.place = place.slice(0, 80);
      if (typeof platform === "string" && platform) updatePayload.platform = platform.slice(0, 40);
    }
    if (Object.keys(updatePayload).length) {
      await guard(rowRef().update(updatePayload), "clear-submit");
      cache[mode + ":clear"] = null;
      cache.allRows = null;
    }
    if (tag) {
      try {
        await guard(rowRef().child(CLEAR_TAG_FIELDS[mode]).set(cleanTag(tag)), "clear-tag");
        cache[mode + ":clear"] = null;
        cache.allRows = null;
      } catch (e) {
        if (typeof console !== "undefined" && console.warn)
          console.warn("[runegun] clear-time loadout tag was rejected; verify the deployed Firebase rules allow /scores/" + CLEAR_TAG_FIELDS[mode], (e && e.message) || e);
      }
    }
  }

  /* ---- reads ---- */
function toEntry(id, row, key, slot, isClearTime) {
    const raw = Math.max(0, Math.floor(Number(row && row[key]) || 0));
    /* clear-time rows carry their OWN loadout; older rows fall back to the
       score tag only because that is all the database used to hold */
    const tag = (isClearTime && row && row[CLEAR_TAG_FIELDS[slot]])
      || (row && row[slot]) || null;
    
    // Check manual display, then database name, then callsign, fallback to WARDEN
    const preferredName = (row && typeof row.display === "string" && row.display) || 
                          (row && typeof row.name === "string" && row.name) || 
                          "WARDEN";

    return {
      rank: 0,
      displayName: preferredName,
      name: preferredName,
      displayScore: isClearTime ? fmtClearMs(raw) : "",
      rawScore: raw,
      playerId: id,
      place: (row && typeof row.place === "string") ? row.place : "unknown",
      char: (tag && typeof tag.char === "string") ? tag.char : "",
      pet: (tag && typeof tag.pet === "string") ? tag.pet : "",
      runes: (tag && typeof tag.runes === "string") ? tag.runes : "",
      challenge: (tag && typeof tag.challenge === "string") ? tag.challenge : "",
    };
  }

  function fmtClearMs(ms) {
    const total = ms / 1000;
    const m = Math.floor(total / 60), s = total - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
  }

  function rankRows(rows, isClearTime) {
    rows.sort((a, b) => (isClearTime ? a.rawScore - b.rawScore : b.rawScore - a.rawScore) ||
      (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));
    let rank = 0, prev = null;
    rows.forEach((r, i) => {
      if (prev === null || r.rawScore !== prev) { rank = i + 1; prev = r.rawScore; }
      r.rank = rank;
      if (!isClearTime) r.displayScore = r.rawScore.toLocaleString("en-US");
    });
    return rows;
  }

  async function rowsFor(mode, isClearTime = false) {
    const slot = slotOf(mode), key = isClearTime ? CLEAR_FIELDS[slot] : field(slot);
    if (!key) return [];
    const cacheKey = slot + (isClearTime ? ":clear" : "");
    const now = Date.now();
    const hit = cache[cacheKey];
    if (hit && now - hit.at < CACHE_MS) return hit.rows;
    let query = db.ref(SCORES).orderByChild(key);
    if (isClearTime) query = query.startAt(1);
    const snap = await guard((isClearTime ? query.limitToFirst(SCAN_CAP) : query.limitToLast(SCAN_CAP)).get(), "top");
    const val = (snap && snap.val && snap.val()) || {};
    const rows = Object.keys(val)
      .map(id => toEntry(id, val[id], key, slot, isClearTime))
      .filter(r => r.rawScore > 0);
    const ranked = rankRows(rows, isClearTime);
    cache[cacheKey] = { rows: ranked, at: now };
    return ranked;
  }

  async function allRowsFor(mode, isClearTime = false) {
    const slot = slotOf(mode), key = isClearTime ? CLEAR_FIELDS[slot] : field(slot);
    if (!key) return [];
    let hit = cache.allRows;
    if (!hit || Date.now() - hit.at >= CACHE_MS) {
      const snap = await guard(db.ref(SCORES).get(), "around");
      hit = { value: (snap && snap.val && snap.val()) || {}, at: Date.now() };
      cache.allRows = hit;
    }
    return Object.keys(hit.value)
      .map(id => toEntry(id, hit.value[id], key, slot, isClearTime))
      .filter(row => row.rawScore > 0);
  }

  async function centeredRows(mode, isClearTime, maxResults, targetValue) {
    if (!signedIn || !uid) throw new Error("board-signed-out");
    const slot = slotOf(mode), key = isClearTime ? CLEAR_FIELDS[slot] : field(slot);
    const rows = (await allRowsFor(slot, isClearTime)).map(row => ({ ...row }));
    const current = rows.find(row => row.playerId === uid);
    const target = Math.round(Number(targetValue) || 0);
    const better = isClearTime
      ? target > 0 && (!current || target < current.rawScore)
      : target > 0 && (!current || target > current.rawScore);

    // Include a local best not submitted yet, so Around You still centers on
    // this player while a first score/clear is waiting to reach Firebase.
    if (better && target <= (isClearTime ? 86400000 : SCORE_CAP)) {
      const rowData = {
        ...(current || {}),
        name: (current && current.name) || callsign || "WARDEN",
        [key]: target,
      };
      const virtual = toEntry(uid, rowData, key, slot, isClearTime);
      virtual.pending = true;
      const index = rows.findIndex(row => row.playerId === uid);
      if (index >= 0) rows.splice(index, 1);
      rows.push(virtual);
    }

    const ranked = rankRows(rows, isClearTime);
    const center = ranked.findIndex(row => row.playerId === uid);
    if (center < 0) return [];
    const half = Math.max(3, Math.floor((Math.max(1, maxResults) - 1) / 2));
    return ranked.slice(Math.max(0, center - half), Math.min(ranked.length, center + half + 1));
  }

  async function loadTopScores({ leaderboardID, maxResults = 25 } = {}) {
    if (!signedIn) throw new Error("board-signed-out");
    const rows = await rowsFor(leaderboardID);
    return { entries: rows.slice(0, Math.max(1, maxResults)).map(r => ({ ...r })) };
  }

  async function loadTopClearTimes({ leaderboardID, maxResults = 25 } = {}) {
    if (!signedIn) throw new Error("board-signed-out");
    const rows = await rowsFor(leaderboardID, true);
    return { entries: rows.slice(0, Math.max(1, maxResults)).map(r => ({ ...r })) };
  }

  async function loadPlayerCenteredScores({ leaderboardID, maxResults = 25, targetScore = 0 } = {}) {
    return { entries: await centeredRows(leaderboardID, false, maxResults, targetScore) };
  }

  async function loadPlayerCenteredClearTimes({ leaderboardID, maxResults = 25, targetTimeMs = 0 } = {}) {
    return { entries: await centeredRows(leaderboardID, true, maxResults, targetTimeMs) };
  }

  async function getUserTotalScore({ leaderboardID } = {}) {
    if (!signedIn || !uid) throw new Error("board-signed-out");
    const snap = await guard(rowRef().child(field(leaderboardID)).get(), "mine");
    return { player_score: Number(snap && snap.val && snap.val()) || 0 };
  }

  async function readGate(path = "console/coop") {
    if (!boot()) throw new Error("board-unconfigured");
    let user = auth.currentUser || await restoredUser();
    if (!user) {
      const cred = await guard(auth.signInAnonymously(), "auth");
      user = (cred && cred.user) || auth.currentUser || (cred && cred.uid ? cred : null);
    }
    if (!user || !user.uid) throw new Error("board-no-user");
    const snap = await guard(db.ref(String(path)).get(), "gate");
    const value = snap && snap.val && snap.val();
    if (typeof value === "string") return value;
    return (value && typeof value.hash === "string") ? value.hash : "";
  }

  async function showLeaderboard() {}
  async function unlockAchievement() {}

  function callsignOf() { return callsign || storedCallsign() || ""; }
  function status() {
    return {
      backend: "firebase", configured: configured(), signedIn,
      uid, callsign: callsignOf(), error: lastError,
    };
  }

  return { configured, signIn, submitScore, submitClearTime, loadTopScores, loadTopClearTimes,
           loadPlayerCenteredScores, loadPlayerCenteredClearTimes,
           getUserTotalScore, showLeaderboard, unlockAchievement, readGate, status,
           callsign: callsignOf, uid: () => uid };
})();