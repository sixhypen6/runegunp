/* =========================================================
   RUNEGUN · Global leaderboard — one board, two providers
   The SCORES live on Firebase (src/systems/leaderboard-firebase.js) so the
   browser build and the Android build share one board; Play Games Services
   still owns ACHIEVEMENTS and the official overlay on the signed APK.

   The Firebase provider is a second implementation with the same shape as
   the @ni2khanna/capacitor-game-connect shim (plugin key
   "CapacitorGameConnect"), so everything below — the custom "THE RECKONING"
   UI, the "· YOU" row, the projected-rank line — talks to one interface.
   Flip BOARD_BACKEND to "playgames" to restore the native-only board.

   Free on both paths. Models the two things the run cares about:
     · felling each warden       → ACHIEVEMENTS (Play Games, native only)
     · the all-time high score   → the online NUMERIC board (best souls, or
                                   best HARD souls on the hard board)
   Both fire at RUN END (not at the kill) so native popups never collide with
   the void-ending cinematic. Each provider keeps each player's best.
   ========================================================= */
"use strict";

const Leaderboard = (() => {
  /* --- Play Console IDs (blank = feature OFF) ---
     Paste the IDs generated in Play Console here. While ALL are blank the whole
     feature is inert: init() never signs in, so the Play Games native SDK is
     never invoked — which also means the build can't crash for a missing
     APP_ID before Play Console is set up. Filling any ID in flips it on. */
  const LB_HIGHSCORE      = "CgkIqeTCoo4FEAIQAg";  // "Highscore" — numeric, larger-is-better, score = Game.score (souls)
  const LB_HIGHSCORE_HARD = "CgkIqeTCoo4FEAIQAw";  // "Hard Highscore" — same board, HARD descents only

  /* ---- Warden achievements — indexed by boss kind (= Game.mapIdx = FLOORS index) ----
     Two standard (one-shot) achievements per warden: `plain` for the kill,
     `flawless` for felling it with the run still untouched. A blank id is simply
     skipped, so a warden whose achievement isn't published yet costs nothing. */
  const ACH = [
    { plain: "CgkIqeTCoo4FEAIQBA", flawless: "CgkIqeTCoo4FEAIQBQ" },   // 0 · THE CHAINED WARDEN
    { plain: "CgkIqeTCoo4FEAIQBg", flawless: "CgkIqeTCoo4FEAIQBw" },   // 1 · THE MARROW KING
    { plain: "CgkIqeTCoo4FEAIQCA", flawless: "CgkIqeTCoo4FEAIQCQ" },   // 2 · THE FORGE TYRANT
    { plain: "CgkIqeTCoo4FEAIQCg", flawless: "CgkIqeTCoo4FEAIQCw" },   // 3 · THE DROWNED MONARCH
    { plain: "CgkIqeTCoo4FEAIQAQ", flawless: "CgkIqeTCoo4FEAIQDA" },   // 4 · THE EVENT HORIZON — "Defeated the Void Beneath"
    /* floors VI–VIII: create these six in Play Console, then paste the ids — blank ids are skipped */
    { plain: "", flawless: "" },                                        // 5 · THE HOURGLASS SAINT
    { plain: "", flawless: "" },                                        // 6 · THE THOUSANDFOLD
    { plain: "", flawless: "" },                                        // 7 · THE OTHER GUNSLINGERS
    { plain: "", flawless: "" },                                        // 8 · THE UNKNOWN — the final stage past floor VIII
  ];
  const CONFIGURED = !!(LB_HIGHSCORE || LB_HIGHSCORE_HARD || ACH.some(a => a.plain || a.flawless));

  /* ---- Which board carries the SCORES? ----
     "firebase"  one shared online board — browser, Android WebView and APK.
                 Play Games keeps achievements + the official overlay only.
     "playgames" the pre-Firebase behaviour: scores AND achievements on Play
                 Games, which only works inside the signed Android build.
     Flip this constant to go back; nothing else branches on it.

     The Firebase provider is loaded later in the page (after the SDK), so it
     is resolved lazily — this file must never assume it exists. */
  const BOARD_BACKEND = "firebase";

  function pg() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorGameConnect) || null;
  }
  function fb() {
    return (typeof FirebaseBoard !== "undefined" && FirebaseBoard && FirebaseBoard.configured()) ? FirebaseBoard : null;
  }
  /* The score provider: Firebase when it's reachable, otherwise the native
     plugin (an APK with Play Games configured but no anonymous auth yet). */
  function board() {
    return BOARD_BACKEND === "playgames" ? pg() : (fb() || pg());
  }

  let signedIn = false;        // the SCORE provider accepted us → the board works
  let nativeSignedIn = false;  // Play Games accepted us → achievements + official overlay
  let playerId = null, playerName = null;   // the SCORE board's identity — drives the "· YOU" row

  /* The id handed to the provider's plugin-shaped calls. Play Games wants the
     real board id; Firebase just needs to know which of the row's two fields
     it is — so the shared call sites never have to branch. */
  function boardId(hard) {
    const p = board();
    if (p && p !== pg()) return hard ? "hard" : "normal";
    return hard ? LB_HIGHSCORE_HARD : LB_HIGHSCORE;
  }
  /* True when this player is on a reachable board. */
  function available() { return !!board() && signedIn; }
  /* True only when Google's own leaderboard overlay can actually be opened. */
  function nativeUI() { return !!pg() && nativeSignedIn; }

  /* ---- Submit stamps: when was THIS best first handed to Play Games? ----
     submitRun re-posts the all-time best at every run end, so a naive "time of
     last submit" would reset forever for an active player. Stamp per board and
     only when the amount improves: the stored time is when the current best was
     FIRST submitted, i.e. how long Play Games has had it. That age is what
     separates normal tally lag (minutes) from a score the public board will
     never show (see isLikelyHidden). localStorage keyed by leaderboard id;
     failures fall back to "no stamp", which just means no veiled diagnosis. */
  const STAMP_PREFIX = "rg.lbTs.";
  function readStamp(id) {
    try {
      const v = JSON.parse(localStorage.getItem(STAMP_PREFIX + id));
      return (v && v.a > 0 && v.t > 0) ? v : null;
    } catch (e) { return null; }
  }
  function stampSubmit(id, amount) {
    const cur = readStamp(id);
    if (cur && cur.a >= amount) return;   // same best re-posted → keep the original clock
    try { localStorage.setItem(STAMP_PREFIX + id, JSON.stringify({ a: amount, t: Date.now() })); } catch (e) {}
  }

  async function submit(id, amount) {
    const p = board();
    if (!p || !signedIn || !id || !(amount > 0)) return;
    /* Tally-age is a Play Games concept (Google ranks the public collection
       minutes to hours after the write). The Firebase board is live, so its
       rows are never "pending" and need no stamp. */
    if (p === pg()) stampSubmit(id, amount);
    try { await p.submitScore({ leaderboardID: id, totalScoreAmount: amount }); } catch (e) {}
  }

  /* Re-post the stored bests the moment sign-in succeeds. A best earned while
     signed out (first sessions before the player accepted Play Games, a launch
     the sign-in failed, or a run played offline) would otherwise wait for the
     NEXT run end to be submitted. Both providers keep the max per player, so
     re-posting is always safe. */
  function resubmitBests() {
    if (typeof Meta === "undefined" || !Meta) return;
    if (Meta.bests && Meta.bests.score > 0) submit(boardId(false), Meta.bests.score);
    if (Meta.bestsHard && Meta.bestsHard.score > 0) submit(boardId(true), Meta.bestsHard.score);
  }

  let initStarted = false;
  async function init() {
    if (initStarted) return;
    const nat = pg(), score = board();
    if (!score && !nat) return;          // no native shell and no Firebase → silent no-op
    if (!CONFIGURED && !fb()) return;    // nothing configured anywhere yet → keep the SDK idle
    initStarted = true;

    /* Play Games first: it owns achievements and the official overlay, and on
       the APK it is the only place those exist. A failure here is not fatal to
       the board — the two sign-ins are independent. */
    if (nat) {
      try {
        const info = await nat.signIn();
        nativeSignedIn = true;
        /* When Play Games IS the score board (no Firebase), its identity is
           also the one the "· YOU" row matches on. */
        if (!score || score === nat) {
          playerId = (info && info.player_id) || null;
          playerName = (info && info.player_name) || null;
        }
      } catch (e) { nativeSignedIn = false; }
    }

    /* Then the board. On a phone both are signed in and the score identity
       must be the BOARD's, or every row would look like a stranger's. */
    if (score && score !== nat) {
      try {
        const info = await score.signIn();
        signedIn = true;
        playerId = (info && info.player_id) || null;
        playerName = (info && info.player_name) || null;
      } catch (e) {
        signedIn = false;
        /* one quiet line, so a browser player (or the devtools-savvy) can tell
           "not configured" from "offline" — the button simply stays hidden */
        if (score === fb() && typeof console !== "undefined" && console.warn)
          console.warn("[runegun] online board sign-in failed:", (e && e.message) || e);
      }
    } else if (score === nat) {
      signedIn = nativeSignedIn;   // one sign-in serves both roles
    }

    if (signedIn) resubmitBests();   // fire-and-forget — heals bests earned before sign-in worked
    if (nativeSignedIn) syncAchievements();   // likewise for wardens felled before sign-in existed
    /* nothing worked → let a later attempt (menu tap, next launch) try again */
    if (!signedIn && !nativeSignedIn) initStarted = false;
    syncMenuButton();
  }

  /* Reveal the menu's LEADERBOARDS button only once sign-in has succeeded. */
  function syncMenuButton() {
    const b = document.getElementById("btnLeaderboard");
    if (b) b.style.display = available() ? "" : "none";
  }

  /* ---- Achievements ----
     Unlocking is idempotent and silent for something already earned, so the
     honest strategy is to re-assert everything the SAVE says was earned rather
     than to fire once at the moment of the kill. That heals the cases a
     kill-time unlock loses forever: a warden felled before this device ever
     signed in, and — the reason it matters right now — every warden felled
     before these achievements existed at all.

     `sent` holds it to one call per id per session. It is deliberately
     in-memory, never localStorage: a call that quietly failed server-side is
     retried on the next launch instead of being written off forever. */
  const sent = new Set();
  async function unlock(id) {
    const p = pg();
    if (!p || !nativeSignedIn || !id || sent.has(id)) return;
    sent.add(id);
    try { await p.unlockAchievement({ achievementID: id }); }
    catch (e) { sent.delete(id); }   // let the next run end / launch try again
  }

  /* Has this save ever put warden `kind` down — flawlessly, if asked?
     Meta.slain is the bestiary (every kind ever killed, all the way back);
     Meta.slainFlawless is its untouched-run twin, written in bossSlain(). The
     void answers to the lifetime voidKills tally too — belt and braces for
     saves that predate the bestiary's boss entries. */
  function slainEver(kind, flawless) {
    if (typeof Meta === "undefined" || !Meta) return false;
    const key = "boss:" + kind;
    if (flawless) return !!(Meta.slainFlawless && Meta.slainFlawless[key]);
    return !!(Meta.slain && Meta.slain[key]) || (kind === 4 && Meta.bests.voidKills > 0);
  }

  /* Assert every earned warden achievement. Fired at sign-in and at RUN END —
     never at the kill, so a native popup can't collide with the void-ending
     cinematic. Fire-and-forget: nothing here is awaited by the run-end screens. */
  function syncAchievements() {
    if (!nativeUI()) return;
    ACH.forEach((a, kind) => {
      if (slainEver(kind, false)) unlock(a.plain);
      if (slainEver(kind, true))  unlock(a.flawless);
    });
  }

  /* Fired from doGameOver + showAscend at the end of every run. Submits the
     ALL-TIME best souls (Meta.bests.score — recordBests() updates it just before
     this call) so a past or crash-lost high run still posts; PGS keeps the max.
     Any warden achievement this run earned lands here too. */
  function submitRun(/* improved */) {
    if (!available() || Game.devRun) return;   // TEST TOOLS runs post nothing and unlock nothing
    if (Game.chaosMode) return;                // CHAOS has no board — its souls would bury every honest score
    const hard = Game.hardMode;   // still holds the run's mode at every run-end sink (incl. mid-run quits)
    const best = hard ? Meta.bestsHard.score : Meta.bests.score;
    submit(boardId(hard), Math.max(Game.score, best));
    syncAchievements();
  }

  /* Open Google's native leaderboard overlay. Kept as a fallback / "official view"
     link even though the custom UI is the primary surface now. Native only — a
     Firebase board has no Google surface to show. */
  async function show({ hard = false } = {}) {
    const p = pg(), id = hard ? LB_HIGHSCORE_HARD : LB_HIGHSCORE;
    if (!p || !nativeSignedIn || !id) return;
    try { await p.showLeaderboard({ leaderboardID: id }); } catch (e) {}
  }

  /* ---- Custom-UI read path: pull ranked entries into our own overlay ----
     Both fetchers resolve { ok, entries } — never reject. ok:false means the
     data couldn't be fetched (off the native shell / not signed in / API error),
     while ok:true with an empty entries array provably means the board is empty
     as far as Play Games knows. The distinction matters to the projected-rank
     simulation below: a failed fetch must never be mistaken for an empty board,
     or we'd foretell a fake "≈1" after a network hiccup. */

  /* Flatten a native { entries:[...] } payload into plain rows the UI renders. */
  function normalizeEntries(res) {
    const arr = (res && res.entries) || (Array.isArray(res) ? res : []);
    return arr.map(e => ({
      rank:     Number(e.rank) || 0,
      name:     e.displayName || "—",
      score:    (e.displayScore != null) ? String(e.displayScore) : String(e.rawScore || 0),
      raw:      Number(e.rawScore) || 0,
      icon:     e.iconImageUri || null,
      playerId: e.playerId || null,
    }));
  }

  /* forceReload=true bypasses Google Play services' on-device cache. That cache
     is per-query — the top page and the player-centered page age independently,
     with no expiry — so without a forced fetch the two tabs drift apart and show
     different scores for the same player. Opening the overlay is Google's
     documented "user-initiated refresh" case, but a player spam-tapping the tabs
     shouldn't hammer the Games API either: force at most one fresh fetch per tab
     per FRESH_MS, and let the in-between taps ride the cache the forced fetch
     just refilled (seconds old at worst). A failed forced fetch re-arms itself
     so the next tap retries fresh instead of serving the stale cache. */
  const FRESH_MS = 60000;
  const lastFresh = { top: -Infinity, nearby: -Infinity, topHard: -Infinity, nearbyHard: -Infinity };
  function wantFresh(kind) {
    const now = performance.now();
    if (now - lastFresh[kind] < FRESH_MS) return false;
    lastFresh[kind] = now;
    return true;
  }

  /* Global top-N. */
  async function getTopScores({ maxResults = 25, hard = false } = {}) {
    const p = board(), id = boardId(hard);
    if (!p || !signedIn || !id || typeof p.loadTopScores !== "function") return { ok: false, entries: [] };
    const key = hard ? "topHard" : "top";
    const forceReload = wantFresh(key);
    try { return { ok: true, entries: normalizeEntries(await p.loadTopScores({ leaderboardID: id, maxResults, forceReload })) }; }
    catch (e) { if (forceReload) lastFresh[key] = -Infinity; return { ok: false, entries: [] }; }
  }

  /* Player-centered — your rank plus the neighbours above/below you. */
  async function getNearbyScores({ maxResults = 25, hard = false } = {}) {
    const p = board(), id = boardId(hard);
    if (!p || !signedIn || !id || typeof p.loadPlayerCenteredScores !== "function") return { ok: false, entries: [] };
    const key = hard ? "nearbyHard" : "nearby";
    const forceReload = wantFresh(key);
    try { return { ok: true, entries: normalizeEntries(await p.loadPlayerCenteredScores({ leaderboardID: id, maxResults, forceReload })) }; }
    catch (e) { if (forceReload) lastFresh[key] = -Infinity; return { ok: false, entries: [] }; }
  }

  function myPlayerId() { return playerId; }
  function myName() { return playerName; }

  /* ---- My score as the SERVER knows it (loadCurrentPlayerLeaderboardScore) ----
     Unlike the public top/nearby buffers, this returns the player's own recorded
     score regardless of their Play Games privacy settings — it is the ground
     truth for "did the submit land". Cached per board for FRESH_MS like the
     other fetchers. ok:false = couldn't ask (off-shell / API error); ok:true
     with score 0 = the server holds no score for this player. */
  const serverBest = { score: {}, at: {} };
  async function getMyServerScore({ hard = false } = {}) {
    const p = board(), id = boardId(hard);
    if (!p || !signedIn || !id || typeof p.getUserTotalScore !== "function") return { ok: false, score: 0 };
    const now = performance.now();
    if (serverBest.at[id] != null && now - serverBest.at[id] < FRESH_MS) return { ok: true, score: serverBest.score[id] };
    try {
      const res = await p.getUserTotalScore({ leaderboardID: id });
      const score = Number(res && res.player_score) || 0;
      serverBest.score[id] = score; serverBest.at[id] = now;
      return { ok: true, score };
    } catch (e) { return { ok: false, score: 0 }; }
  }

  /* ---- The veiled-score diagnosis ----
     Google's public leaderboard collection only contains players whose Play
     Games profile shares gameplay publicly — everyone else's scores are
     recorded but shown to nobody (not even woven into the raw public buffers
     this UI reads, so the pending simulation would otherwise say "yet to tally"
     forever). Verdict here: the server acknowledges a score >= the local best
     (so the submit landed), yet the best was first submitted over
     HIDDEN_GRACE_MS ago and still isn't in the public view. The grace period
     absorbs honest tally lag, which resolves in minutes; a veiled profile
     persists forever, so a generous grace costs nothing. Never rejects. */
  const HIDDEN_GRACE_MS = 30 * 60 * 1000;
  async function isLikelyHidden({ hard = false } = {}) {
    /* Play Games only: a Firebase row is public the instant it's written, and
       its callsign is not tied to a Google profile at all. */
    if (!available() || board() !== pg()) return false;
    const id = boardId(hard), best = localBest(hard);
    if (!id || !(best > 0)) return false;
    const st = readStamp(id);
    if (!st || st.a < best) return false;                     // current best never handed to PGS → can't judge
    if (Date.now() - st.t < HIDDEN_GRACE_MS) return false;    // young submit → normal tally lag, not a veil
    const s = await getMyServerScore({ hard });
    return s.ok && s.score >= best;
  }

  /* ---- Projected placement: instant feedback while PGS lags ----
     submitScore lands server-side immediately, but the public views above are
     cached on-device and rank aggregation can trail by minutes to ~24h. Until
     the server catches up, the UI simulates where the just-submitted best will
     land — clearly marked as pending — and self-heals to the plain server rows
     the moment a fetch shows the score has been tallied. */

  /* recordBests() runs before submitRun() at every run-end sink, so this is
     always exactly the score that was last submitted for the given board. */
  function localBest(hard) { return hard ? Meta.bestsHard.score : Meta.bests.score; }

  /* The one definition of "this row is me" — id match, display-name fallback
     when sign-in returned no id. Highlight, dedup, and the self-heal check all
     share it so they can never diverge. */
  function isMine(e) {
    return (playerId && e.playerId === playerId) || (!playerId && playerName && e.name === playerName);
  }

  /* Pure — no DOM, no fetch. Classifies how the local best relates to one
     fetched window of normalized rows (all math on .raw, never the formatted
     .score string). Returns:
       kind "none"     — nothing to simulate (no local best)
       kind "caughtUp" — server already shows >= local best; render as-is
       kind "insert"   — splice a pending row into `rest` at `index`, rank ≈`rank`
       kind "beyond"   — best falls off a full page; true rank unknowable here
     `rest` is the window with my own (stale) row filtered out, so an insert
     never produces a duplicate YOU. Server rows keep their server ranks —
     renumbering strangers would trade one honest gap for many fabricated ones. */
  function computeProjection(entries, best) {
    const none = { kind: "none", rest: entries, index: 0, rank: 0, orBetter: false, myServerRank: 0 };
    if (!(best > 0)) return none;   // mirrors submit()'s amount > 0 guard
    const mine = entries.filter(isMine);
    const myServerRank = mine.length ? (Number(mine[0].rank) || 0) : 0;
    const staleRaw = mine.length ? Math.max(...mine.map(m => m.raw)) : -1;
    if (staleRaw >= best)   // >= also covers a higher score submitted from another device
      return { kind: "caughtUp", rest: entries, index: 0, rank: 0, orBetter: false, myServerRank };
    const rest = mine.length ? entries.filter(e => !isMine(e)) : entries;
    const pageFull = entries.length >= 25;   // PGS page cap — both call sites request 25
    const i = rest.findIndex(e => e.raw <= best);
    if (i < 0) {   // beats nobody visible
      if (mine.length && myServerRank > 0)   // passed no one → rank unchanged, score pending
        return { kind: "insert", rest, index: rest.length, rank: myServerRank, orBetter: false, myServerRank };
      if (pageFull) return { kind: "beyond", rest, index: 0, rank: 0, orBetter: false, myServerRank };
      // whole board visible (top window / empty board) → competition ranking by count
      return { kind: "insert", rest, index: rest.length, rank: rest.length + 1, orBetter: false, myServerRank };
    }
    let index, rank;
    if (rest[i].raw === best) {
      // tie — PGS shares the rank; sit below the equal block (they got there first)
      rank = Number(rest[i].rank) || 0;
      index = i; while (index < rest.length && rest[index].raw === best) index++;
    } else {
      // strictly beaten — take the displaced row's server rank, minus one when my
      // stale row sat above it (its rank counted me; I'm not above myself)
      rank = (Number(rest[i].rank) || 0) - (staleRaw > rest[i].raw ? 1 : 0);
      index = i;
    }
    if (!(rank > 0)) rank = 1 + rest.slice(0, i).filter(e => e.raw > best).length;   // plugin rank drift → count-based
    // beat the whole visible window and it doesn't start at #1 → never overclaim
    const orBetter = i === 0 && (Number(rest[0].rank) || 0) > 1;
    return { kind: "insert", rest, index, rank, orBetter, myServerRank };
  }

  /* Run-end line (death / ascend screens). Resolves null when nothing can be
     said (off-shell, no best, both fetches failed) — the caller hides the line.
     Riding getTopScores/getNearbyScores also pre-warms the plugin cache, so
     opening THE RECKONING right after death shows the same snapshot. */
  async function getProjectedRank({ hard = false } = {}) {
    if (!available()) return null;
    const best = localBest(hard);
    if (!(best > 0)) return null;
    const top = await getTopScores({ maxResults: 25, hard });
    if (top.ok) {
      const p = computeProjection(top.entries, best);
      if (p.kind === "insert")
        return { rank: p.rank, orBetter: p.orBetter, settled: false, beyond25: false, hidden: await isLikelyHidden({ hard }) };
      if (p.kind === "caughtUp" && p.myServerRank > 0)
        return { rank: p.myServerRank, orBetter: false, settled: true, beyond25: false, hidden: false };
    }
    // off the top page → the player-centered window holds my stale row and can
    // still place me for the many players outside the visible top
    const near = await getNearbyScores({ maxResults: 25, hard });
    if (near.ok && near.entries.length) {
      const p = computeProjection(near.entries, best);
      if (p.kind === "insert")
        return { rank: p.rank, orBetter: p.orBetter, settled: false, beyond25: false, hidden: await isLikelyHidden({ hard }) };
      if (p.kind === "caughtUp" && p.myServerRank > 0)
        return { rank: p.myServerRank, orBetter: false, settled: true, beyond25: false, hidden: false };
    }
    if (top.ok || near.ok)
      return { rank: 0, orBetter: false, settled: false, beyond25: true, hidden: await isLikelyHidden({ hard }) };
    return null;
  }

  return { available, init, submitRun, show, syncMenuButton, syncAchievements,
           getTopScores, getNearbyScores, myPlayerId, myName,
           localBest, isMine, computeProjection, getProjectedRank,
           getMyServerScore, isLikelyHidden,
           nativeUI, backend: () => BOARD_BACKEND };
})();

/* Sign-in is kicked off from main.js boot — after the save is loaded, and after
   every script (including the Firebase SDK) has been parsed. Calling it here
   would run before the provider file exists. */

/* A launch that began offline would otherwise hide the board for the whole
   session (the menu button only appears once sign-in lands). init() is a no-op
   when it already succeeded, so listening for connectivity costs nothing. */
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("online", () => { if (!Leaderboard.available()) Leaderboard.init(); });
}
