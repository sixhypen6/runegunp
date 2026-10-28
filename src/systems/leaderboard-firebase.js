/* =========================================================
   RUNEGUN · Online score board — Firebase Realtime Database
   A provider with the SAME shape as the Play Games plugin shim, so
   systems/leaderboard.js can point at either one without the UI knowing:

     signIn() · submitScore() · loadTopScores() · loadPlayerCenteredScores()
     getUserTotalScore() · showLeaderboard() · unlockAchievement()

   Why it exists: Play Games Services only runs inside the signed Android
   build. The browser build (and the Android WebView, which is the same
   bundle) needs one board everyone can reach — this is it. Scores live at

     /scores/<auth.uid> = { name, score, hardScore, updatedAt }

   `name` is a generated WARDEN-XXXX callsign stored in Meta.boardName.
   Play Games display names are never written here: they are private, and
   an anonymous board should not leak them.

   SETUP (one time, Firebase console → project runegun-8b5b2):
     1. Build → Authentication → Sign-in method → Anonymous → Enable.
        Without this, sign-in fails with CONFIGURATION_NOT_FOUND and the
        LEADERBOARDS button simply never appears (everything else works).
     2. Realtime Database → Rules → merge the `scores` block from
        firebase.rules.scores.json. DO NOT replace the file wholesale —
        the `rooms` rules for co-op live there too.
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

  let app = null, db = null, auth = null;
  let uid = null, callsign = null;
  let signedIn = false;
  let initPromise = null;
  let lastError = null;
  const cache = { normal: null, hard: null, at: { normal: 0, hard: 0 } };

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
      /* persistence can be refused (private mode / blocked storage) and the
         callback would then never fire a user — but it always fires ONCE with
         null, so this is only a last-resort net */
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
  /* The save is the source of a player's callsign; the row is the backup. A
     cleared save re-adopts the name the board still holds (ensureRow), so a
     returning player keeps the name their friends recognise. */
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

  const field = hard => hard ? "hardScore" : "score";
  const isHard = leaderboardID => leaderboardID === "hard";
  const stamp = () => firebase.database.ServerValue.TIMESTAMP;

  function rowRef() { return db.ref(SCORES + "/" + uid); }

  /* Create or adopt this player's row. Existing rows win: the name on the
     board is what other players have already seen, and the scores are the
     player's own history — neither may be reset by a fresh local save. */
  async function ensureRow() {
    const snap = await guard(rowRef().get(), "row");
    const row = (snap && snap.val && snap.val()) || null;
    if (row && typeof row.name === "string" && row.name) {
      setCallsign(row.name.slice(0, 20));
      return;
    }
    const name = ensureCallsign();
    const patch = { name, updatedAt: stamp() };
    if (!row) { patch.score = 0; patch.hardScore = 0; }
    await guard(rowRef().update(patch), "claim");
  }

  /* ---- plugin-shaped API ---- */

  /* Resolves { player_id, player_name } exactly like the native signIn. */
  async function signIn() {
    if (!boot()) throw new Error("board-unconfigured");
    if (signedIn && uid) return { player_id: uid, player_name: callsign };
    if (initPromise) return initPromise;
    initPromise = (async () => {
      let user = auth.currentUser || await restoredUser();
      if (!user) {
        /* compat signInAnonymously resolves a UserCredential ({ user, ... }) */
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

  /* Best-score-only, like Play Games: the board never moves down. The rule
     enforces the same thing server-side (a tampered client can't wipe or
     lower an honest score), this pre-check just avoids a rejected write. */
  async function submitScore({ leaderboardID, totalScoreAmount } = {}) {
    if (!signedIn || !uid) return;
    const amount = Math.floor(Number(totalScoreAmount) || 0);
    if (!(amount > 0) || amount > SCORE_CAP) return;
    const key = field(isHard(leaderboardID));
    let cur = 0;
    try {
      const snap = await guard(rowRef().child(key).get(), "best");
      cur = Number(snap && snap.val && snap.val()) || 0;
    } catch (e) { /* read failed — try the write anyway, the rule is the referee */ }
    if (amount <= cur) return;
    await guard(rowRef().update({ [key]: amount, updatedAt: stamp() }), "submit");
    cache.normal = cache.hard = null;          // next open shows the new row
    cache.at.normal = cache.at.hard = 0;
  }

  /* ---- reads ----
     The whole visible board is one ordered read, cached briefly. Ranking is
     done here (competition ranking: equal scores share a rank) so every row
     the UI sees carries its TRUE rank — the "≈N" projection, the death-screen
     line and the "· YOU" row all depend on that. SCAN_CAP bounds the cost:
     a player ranked deeper than 500 simply falls off the ranked window and
     the UI's existing "beyond the top" path takes over. */
  function toEntry(id, row, key) {
    const raw = Math.max(0, Math.floor(Number(row && row[key]) || 0));
    return {
      rank: 0,
      displayName: (row && typeof row.name === "string" && row.name) || "WARDEN",
      displayScore: "",
      rawScore: raw,
      playerId: id,
    };
  }
  function rankRows(rows) {
    rows.sort((a, b) => b.rawScore - a.rawScore ||
      (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));
    let rank = 0, prev = null;
    rows.forEach((r, i) => {
      if (prev === null || r.rawScore !== prev) { rank = i + 1; prev = r.rawScore; }
      r.rank = rank;
      r.displayScore = r.rawScore.toLocaleString("en-US");
    });
    return rows;
  }
  async function rowsFor(hard) {
    const key = field(hard);
    const slot = hard ? "hard" : "normal";
    const now = Date.now();
    if (cache[slot] && now - cache.at[slot] < CACHE_MS) return cache[slot];
    const snap = await guard(db.ref(SCORES).orderByChild(key).limitToLast(SCAN_CAP).get(), "top");
    const val = (snap && snap.val && snap.val()) || {};
    const rows = Object.keys(val)
      .map(id => toEntry(id, val[id], key))
      .filter(r => r.rawScore > 0);       // a row with no score on this board isn't ranked
    cache[slot] = rankRows(rows);
    cache.at[slot] = now;
    return cache[slot];
  }

  async function loadTopScores({ leaderboardID, maxResults = 25 } = {}) {
    if (!signedIn) throw new Error("board-signed-out");
    const rows = await rowsFor(isHard(leaderboardID));
    return { entries: rows.slice(0, Math.max(1, maxResults)).map(r => ({ ...r })) };
  }

  /* Player-centered window. If this player is on the scanned board the window
     is centered on their true rank; if not (no score yet / below SCAN_CAP) an
     empty list is honest — the overlay already knows how to place them from
     the top page. */
  async function loadPlayerCenteredScores({ leaderboardID, maxResults = 25 } = {}) {
    if (!signedIn || !uid) throw new Error("board-signed-out");
    const rows = await rowsFor(isHard(leaderboardID));
    const i = rows.findIndex(r => r.playerId === uid);
    if (i < 0) return { entries: [] };
    const half = Math.max(3, Math.floor((Math.max(1, maxResults) - 1) / 2));
    const from = Math.max(0, i - half);
    const to = Math.min(rows.length, i + half + 1);
    return { entries: rows.slice(from, to).map(r => ({ ...r })) };
  }

  /* The player's own recorded score — ground truth regardless of the window. */
  async function getUserTotalScore({ leaderboardID } = {}) {
    if (!signedIn || !uid) throw new Error("board-signed-out");
    const snap = await guard(rowRef().child(field(isHard(leaderboardID))).get(), "mine");
    return { player_score: Number(snap && snap.val && snap.val()) || 0 };
  }

  /* No native overlay to open — THE RECKONING is the board. Present so the
     shared call sites stay provider-agnostic. */
  async function showLeaderboard() {}
  /* Achievements are Play Games only; a custom board cannot award them. */
  async function unlockAchievement() {}

  function callsignOf() { return callsign || storedCallsign() || ""; }
  function status() {
    return {
      backend: "firebase", configured: configured(), signedIn,
      uid, callsign: callsignOf(), error: lastError,
    };
  }

  return { configured, signIn, submitScore, loadTopScores, loadPlayerCenteredScores,
           getUserTotalScore, showLeaderboard, unlockAchievement, status,
           callsign: callsignOf, uid: () => uid };
})();
