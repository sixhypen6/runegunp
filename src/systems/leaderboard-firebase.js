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

     Progress transfer uses two tiny side trees (see systems/transfer.js):

       /transfers/<CODE> = { v, owner, createdAt, expiresAt, payload }
         a one-time, ten-minute code holding the sender's save as JSON text

       /progress/<LINEAGE> = { limit: 1, uses: 0 | 1, createdAt }
         the descent's crossing ledger. The lineage id travels inside the save;
         the first claim increments `uses`, so even if the same save forges a
         second code, that code cannot produce a second copy.

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
        That file is the complete tree: the co-op `rooms` block, the `scores`
        block, and the `progress` / `transfers` blocks used by progress
        transfer. Nothing else in the database is used by this game.
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

  /* ---- progress transfer codes ----
     A code is a bearer token: whoever knows it can read the save once. Keep
     the alphabet equally unambiguous, keep the TTL short, and let the
     redeeming device burn the node immediately after reading it. The payload
     is a JSON string so the RTDB rules can cap its size in one place. */
  const TRANSFERS = "transfers";
  const PROGRESS = "progress";
  const TRANSFER_TTL_MS = 10 * 60 * 1000;
  const TRANSFER_CODE_LEN = 8;
  const TRANSFER_MAX_CHARS = 60000;
  /* One descent crosses once. The lineage id travels inside the save; the
     server ledger keyed by that id is the authority, so forging a second code
     from the same save cannot produce a second copy. */
  const TRANSFER_LIMIT = 1;
  const LINEAGE_LEN = 16;

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

  /* Accepts optional `place`, `platform` and manual `display` fields during score submission */
  async function submitScore({ leaderboardID, totalScoreAmount, tag, place, platform, display } = {}) {
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
    if (place) updatePayload.place = String(place).slice(0, 80);
    if (platform) updatePayload.platform = String(platform).slice(0, 40);
    if (display) updatePayload.display = String(display).slice(0, 32); // Manual display name override

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
      platform: (row && typeof row.platform === "string") ? row.platform : "",
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

  async function setDisplayName(display) {
    if (!signedIn || !uid) throw new Error("board-signed-out");
    const value = (display == null ? "" : String(display)).replace(/\s+/g, " ").trim().slice(0, 20);
    if (value) {
      await guard(rowRef().update({ display: value, updatedAt: stamp() }), "display");
      setCallsign(value); // local preferred handle for this session/device
    } else {
      await guard(rowRef().child("display").remove(), "display-clear");
      try {
        const snap = await guard(rowRef().child("name").get(), "name");
        const n = snap && snap.val && typeof snap.val() === "string" ? snap.val() : "";
        if (n) setCallsign(n);
      } catch (e) {}
    }
    cache.allRows = null;
    for (const k of ["normal", "hard", "classic", "chaos", "normal:clear", "hard:clear", "classic:clear", "chaos:clear"]) cache[k] = null;
    return value;
  }

  /* ---- progress transfer ----
     The sender creates a random code and writes their save under it; the
     receiver signs in (anonymously) just like the board, reads that node and
     removes it. Rules allow create/read/delete but never overwrite, so a code
     cannot be hijacked after it is forged. */
  function normalizeTransferCode(input) {
    return String(input == null ? "" : input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function validTransferCode(code) {
    if (code.length !== TRANSFER_CODE_LEN) return false;
    for (let i = 0; i < code.length; i++) if (NAME_ALPHABET.indexOf(code[i]) < 0) return false;
    return true;
  }
  function newTransferCode() {
    const bytes = new Uint8Array(TRANSFER_CODE_LEN);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < TRANSFER_CODE_LEN; i++) bytes[i] = Math.floor(Math.random() * 256);
    let code = "";
    for (let i = 0; i < TRANSFER_CODE_LEN; i++) code += NAME_ALPHABET[bytes[i] % NAME_ALPHABET.length];
    return code;
  }
  function transferRef(code) { return db.ref(TRANSFERS + "/" + code); }
  function validLineage(id) {
    if (typeof id !== "string" || id.length !== LINEAGE_LEN) return false;
    for (let i = 0; i < id.length; i++) if (NAME_ALPHABET.indexOf(id[i]) < 0) return false;
    return true;
  }
  function progressRef(id) { return db.ref(PROGRESS + "/" + id); }
  function clearBoardCaches() {
    for (const k of ["normal", "hard", "classic", "chaos", "normal:clear", "hard:clear", "classic:clear", "chaos:clear"]) cache[k] = null;
    cache.allRows = null;
  }

  /* The ledger is created on first contact. Every later write only touches
     `uses`; Firebase rules make that a monotonic +1, capped at the limit, so
     the client cannot refund or reset a crossing. */
  async function ensureLineage(id) {
    if (!validLineage(id)) throw new Error("transfer-damaged");
    const snap = await guard(progressRef(id).get(), "lineage");
    const found = snap && snap.val && snap.val();
    if (found && typeof found === "object") return found;
    const init = { limit: TRANSFER_LIMIT, uses: 0, createdAt: Date.now() };
    try {
      await guard(progressRef(id).set(init), "lineage-create");
      return init;
    } catch (e) {
      /* another device may have created it between the read and the write */
      const again = await guard(progressRef(id).get(), "lineage");
      const raced = again && again.val && again.val();
      if (!raced || typeof raced !== "object") throw e;
      return raced;
    }
  }

  async function transferStatus(id) {
    if (!validLineage(id)) throw new Error("transfer-damaged");
    if (!boot()) throw new Error("transfer-unavailable");
    await signIn();
    const v = await ensureLineage(id);
    const limit = Math.max(1, Math.min(TRANSFER_LIMIT, Number(v.limit) || TRANSFER_LIMIT));
    const uses = Math.max(0, Number(v.uses) || 0);
    return { ok: true, uses, limit, remaining: Math.max(0, limit - uses) };
  }

  async function claimLineage(id) {
    if (!validLineage(id)) throw new Error("transfer-damaged");
    if (!boot()) throw new Error("transfer-unavailable");
    if (!signedIn) await signIn();
    await ensureLineage(id);
    const res = await guard(progressRef(id).child("uses").transaction(cur => {
      const used = Math.max(0, Number(cur) || 0);
      if (used >= TRANSFER_LIMIT) return;      // abort: this descent already crossed
      return used + 1;
    }), "lineage-claim");
    if (!res || !res.committed) throw new Error("transfer-exhausted");
    return { ok: true, uses: Math.max(0, Number(res.snapshot && res.snapshot.val && res.snapshot.val()) || 0) };
  }

  async function createTransfer(payload) {
    if (!boot()) throw new Error("transfer-unavailable");
    const meta = payload && payload.meta;
    if (!meta || !validLineage(meta.transferId)) throw new Error("transfer-no-lineage");
    const json = JSON.stringify(payload || {});
    if (json.length > TRANSFER_MAX_CHARS) throw new Error("transfer-too-large");
    await signIn();
    if (!uid) throw new Error("transfer-unavailable");
    /* Forge only while the descent still has a crossing left. Two codes may
       exist at once; the claim transaction decides which one lands. */
    const st = await transferStatus(meta.transferId);
    if (st.remaining <= 0) throw new Error("transfer-exhausted");
    /* A transaction creates only when the slot is empty; a collision aborts
       and the loop forges a fresh code. */
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newTransferCode();
      const now = Date.now();
      const data = {
        v: 1,
        owner: String(uid),
        createdAt: now,
        expiresAt: now + TRANSFER_TTL_MS,
        payload: json,
      };
      const res = await guard(transferRef(code).transaction(cur => (cur === null ? data : undefined)), "transfer-create");
      if (res && res.committed) return { ok: true, code, expiresAt: data.expiresAt };
    }
    throw new Error("transfer-code-exhausted");
  }

  /* Read-only lookup so the UI can preview what will land before replacing
     anything. The node stays until the receiver explicitly confirms. */
  async function fetchTransfer(input) {
    const code = normalizeTransferCode(input);
    if (!validTransferCode(code)) throw new Error("transfer-invalid");
    if (!boot()) throw new Error("transfer-unavailable");
    await signIn();
    const snap = await guard(transferRef(code).get(), "transfer-read");
    const data = (snap && snap.val && snap.val()) || null;
    if (!data) throw new Error("transfer-missing");
    if (!(Number(data.expiresAt) > Date.now())) {
      try { await guard(transferRef(code).remove(), "transfer-expire"); } catch (e) {}
      throw new Error("transfer-expired");
    }
    if (typeof data.payload !== "string" || data.payload.length > TRANSFER_MAX_CHARS)
      throw new Error("transfer-damaged");
    let payload;
    try { payload = JSON.parse(data.payload); } catch (e) { throw new Error("transfer-damaged"); }
    return { ok: true, code, expiresAt: Number(data.expiresAt), payload };
  }

  async function consumeTransfer(input) {
    const code = normalizeTransferCode(input);
    if (!validTransferCode(code)) throw new Error("transfer-invalid");
    if (!boot()) throw new Error("transfer-unavailable");
    if (!signedIn) await signIn();
    await guard(transferRef(code).remove(), "transfer-consume");
    return true;
  }

  /* Redeem = claim the lineage, then burn the code. Claiming first means a
     shared code can only ever produce one save; if the delete then fails the
     code is still dead because the ledger is spent. */
  async function redeemTransfer(input) {
    const code = normalizeTransferCode(input);
    if (!validTransferCode(code)) throw new Error("transfer-invalid");
    if (!boot()) throw new Error("transfer-unavailable");
    if (!signedIn) await signIn();
    const snap = await guard(transferRef(code).get(), "transfer-redeem");
    const data = (snap && snap.val && snap.val()) || null;
    if (!data) throw new Error("transfer-missing");
    if (!(Number(data.expiresAt) > Date.now())) {
      try { await guard(transferRef(code).remove(), "transfer-expire"); } catch (e) {}
      throw new Error("transfer-expired");
    }
    if (typeof data.payload !== "string" || data.payload.length > TRANSFER_MAX_CHARS)
      throw new Error("transfer-damaged");
    let payload;
    try { payload = JSON.parse(data.payload); } catch (e) { throw new Error("transfer-damaged"); }
    const lineage = payload && payload.meta && payload.meta.transferId;
    if (!validLineage(lineage)) throw new Error("transfer-damaged");
    try {
      await claimLineage(lineage);
    } catch (e) {
      /* the descent already crossed: this code is dead too, clean it up */
      try { await guard(transferRef(code).remove(), "transfer-burn"); } catch (e2) {}
      throw e;
    }
    try { await guard(transferRef(code).remove(), "transfer-burn"); } catch (e) {}
    return { ok: true, code, payload, lineage };
  }

  /* Carry the sender's callsign onto this device's own board row. The uid is
     still this device's (anonymous identities cannot move), but the visible
     WARDEN-XXXX follows the save. */
  async function adoptCallsign(name) {
    if (!signedIn || !uid) return "";
    const value = String(name == null ? "" : name).trim();
    if (!validCallsign(value)) return "";
    await guard(rowRef().update({ name: value, updatedAt: stamp() }), "rename");
    setCallsign(value);
    clearBoardCaches();
    return value;
  }

  function callsignOf() { return callsign || storedCallsign() || ""; }
  function status() {
    return {
      backend: "firebase", configured: configured(), signedIn,
      uid, callsign: callsignOf(), error: lastError,
    };
  }

  return {
    configured, signIn, setDisplayName, adoptCallsign, submitScore, submitClearTime, loadTopScores, loadTopClearTimes,
           loadPlayerCenteredScores, loadPlayerCenteredClearTimes,
           getUserTotalScore, showLeaderboard, unlockAchievement, readGate, status,
           createTransfer, fetchTransfer, consumeTransfer, redeemTransfer, transferStatus,
           callsign: callsignOf, uid: () => uid };
})();