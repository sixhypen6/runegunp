/* =========================================================
   RUNEGUN · Signaling — join codes over Firebase Realtime DB.
   The DB is a one-shot mailbox: the host claims a short code and
   keeps it open while guests join, each guest posts a join key, the
   host posts one offer per guest key, the guest answers, and both
   trade ICE candidates per key. The room is deleted when the host
   starts the descent (or leaves the lobby).

   RTDB layout:
     /rooms/<CODE>/host                     { v, createdAt, open }
     /rooms/<CODE>/joins/<jid>              { v, at }            guest asks to join
     /rooms/<CODE>/peers/<jid>/offer        host's SDP for that guest
     /rooms/<CODE>/peers/<jid>/answer       guest's SDP
     /rooms/<CODE>/peers/<jid>/hc/<push>    host ICE candidate (JSON string)
     /rooms/<CODE>/peers/<jid>/gc/<push>    guest ICE candidate (JSON string)
     /rooms/<CODE>/peers/<jid>/reject       "full" / "closed" when the host refuses a join
     /open/<CODE>                           { v, mode, char, skin, seats, at }  DISPLAY ONLY

   One key per guest keeps the mailbox flat: no slot negotiation, no
   collisions, and a guest that retries simply brings a fresh key.

   /open is a public bulletin board, not a second room: it carries only
   what a browse list shows (the host's warden, the mode, how many are
   seated) and a heartbeat. Joining still goes through /rooms/<CODE>, so
   the gate itself remains the single source of truth and a stale or
   forged listing can never grant access. Entries whose heartbeat stops
   are pruned by every reader after OPEN_TTL_MS.
   ========================================================= */
"use strict";

const Signal = {
  /* code alphabet: A-Z + 2-9 minus lookalikes O/0/I/1 */
  ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  CODE_LEN: 5,
  JOIN_LEN: 10,
  ROOM_TTL_MS: 10 * 60 * 1000,
  /* the public index is only as honest as its heartbeat: a host refreshes
     while its gate stands, and a reader hides anything older than this */
  OPEN_TTL_MS: 90 * 1000,
  OPEN_REFRESH_MS: 25 * 1000,
  OPEN_MAX: 24,          // rows a browse list will show (flood guard)

  app: null, db: null,
  code: null,
  owner: null,        // "host" if WE created this room — only the owner may delete it
  joinId: null,       // a guest's key inside the room (null on the host)
  _refs: [],          // listeners to detach on cleanup
  _skew: 0,           // serverTime - deviceTime, so a wrong device clock can't expire rooms
  _skewKnown: false,  // has the offset actually arrived? (see _openRow's pruning)
  online: false,      // is the RTDB socket actually up right now
  OP_TIMEOUT_MS: 12000,

  init() {
    if (this.db) return true;
    if (!firebaseConfigured()) return false;
    this.app = firebase.initializeApp(FIREBASE_CONFIG);
    this.db = firebase.database();
    /* `/.info/serverTimeOffset` is exempt from security rules and is the only
       honest clock here: createdAt is written with ServerValue.TIMESTAMP, so
       comparing it against a device Date.now() expires rooms wrongly whenever
       the phone's clock drifts. */
    this.db.ref("/.info/serverTimeOffset").on("value", s => {
      this._skew = s.val() || 0;
      this._skewKnown = true;
    });
    /* `/.info/connected` is how we tell "the database is unreachable" apart from
       "that code doesn't exist" — the SDK itself never errors on a refused or
       dropped connection, it just retries in silence forever. */
    this.db.ref("/.info/connected").on("value", s => { this.online = !!s.val(); });
    return true;
  },
  /* server-clock "now" — use this for every TTL comparison */
  now() { return Date.now() + this._skew; },

  /* Opening the lobby is the earliest honest signal that co-op is wanted, so
     start the socket now: by the time a code is typed the connection is up,
     and _ready() below returns instantly instead of waiting. */
  prewarm() {
    if (!this.init()) return;
    this._wake();
  },

  /* =========================================================
     WHY EVERY CALL BELOW IS WRAPPED

     The Realtime Database client does not fail fast. If the socket is
     refused — no signal, captive portal, Firebase down, or the Spark
     plan's 100-connection ceiling reached — pending reads and writes are
     simply queued and retried, forever. The promise never settles, so a
     bare `await ref.set(...)` leaves the player staring at "FORGING THE
     GATE…" with no error and no way to know why.

     Everything that touches the network therefore races a timeout, and
     reports which kind of failure it was.
     ========================================================= */
  _guard(promise, label) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        /* if the socket was never up, this is connectivity (or capacity),
           not anything the player typed */
        reject(new Error(this.online ? "signal-timeout" : "offline"));
      }, this.OP_TIMEOUT_MS);
      promise.then(v => {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(v);
      }, e => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(this.online ? e : new Error("offline"));
      });
    });
  },

  /* Release the socket once the peers are talking directly. Without this the
     SDK holds the connection for the rest of the app session, and 100 of those
     is the whole Spark allowance — roughly 1,800 co-op starts a day. Freed
     after ~5 seconds instead, the same allowance covers orders of magnitude
     more. Re-opened automatically by the next createRoom/joinRoom. */
  release() {
    if (!this.db) return;
    try { this.db.goOffline(); this.online = false; } catch (e) {}
  },
  /* cleanup() queues a room delete, and cutting the socket underneath it would
     strand that write — leaving an orphan room to sit until its TTL. Give the
     delete a moment to flush, then hand the connection back. A lobby that is
     still accepting guests keeps the socket; only closeRoom/leaveRoom release. */
  releaseSoon(ms) {
    clearTimeout(this._relTimer);
    this._relTimer = setTimeout(() => this.release(), ms || 2000);
  },
  _wake() {
    if (!this.db) return;
    clearTimeout(this._relTimer);      // a pending release must not cut a new handshake
    try { this.db.goOnline(); } catch (e) {}
  },

  /* =========================================================
     WAIT FOR THE SOCKET BEFORE TOUCHING THE DATABASE

     goOnline() is asynchronous. On a COLD start the SDK is merely
     "connecting", so it queues reads and flushes them once the socket
     lands — which is why the very first co-op session always worked.
     After an explicit goOffline() it is deliberately offline instead,
     and a get() fails (or answers from cache) rather than queueing. So
     every session AFTER the first raced its own reconnect and reported
     a connection error.

     Nothing may talk to the database until this resolves.
     ========================================================= */
  _ready(ms) {
    if (this.online) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ref = this.db.ref("/.info/connected");
      let done = false;
      const cb = s => {
        if (done || !s.val()) return;
        done = true; clearTimeout(timer);
        try { ref.off("value", cb); } catch (e) {}
        this.online = true;
        resolve();
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { ref.off("value", cb); } catch (e) {}
        reject(new Error("offline"));
      }, ms || this.OP_TIMEOUT_MS);
      ref.on("value", cb);
    });
  },

  genCode() {
    let c = "";
    for (let i = 0; i < this.CODE_LEN; i++) c += this.ALPHABET[Math.floor(Math.random() * this.ALPHABET.length)];
    return c;
  },
  genJoinId() {
    let c = "";
    for (let i = 0; i < this.JOIN_LEN; i++) c += this.ALPHABET[Math.floor(Math.random() * this.ALPHABET.length)];
    return c;
  },
  /* a real gate code and nothing else — the public index is written by
     strangers, so every key read back from it is checked before use */
  validCode(c) {
    if (typeof c !== "string" || c.length !== this.CODE_LEN) return false;
    for (const ch of c) if (this.ALPHABET.indexOf(ch) === -1) return false;
    return true;
  },

  roomRef(code) { return this.db.ref("rooms/" + code); },
  peerRef(jid) { return this.roomRef(this.code).child("peers/" + jid); },
  openRef(code) { return this.db.ref("open/" + code); },

  /* One-shot listener: fire once, then detach every listener it owns. */
  _offRef(ref, ev, cb) {
    try { ref.off(ev, cb); } catch (e) {}
    this._refs = this._refs.filter(r => !(r[0] === ref && r[1] === ev && r[2] === cb));
  },

  /* =========================================================
     HOST
     ========================================================= */

  /* Claim a fresh code (retry on collision with a live room). The room holds
     no offer yet: one is minted per guest as they arrive, so a 4-player gate
     never needs a pre-baked slot layout. */
  async createRoom() {
    if (!this.init()) throw new Error("firebase-unconfigured");
    this._wake();                       // a previous session may have released the socket
    await this._ready();                // ...and goOnline() lands asynchronously
    for (let tries = 0; tries < 6; tries++) {
      const code = this.genCode();
      const ref = this.roomRef(code);
      const snap = await this._guard(ref.child("host/createdAt").get(), "probe");
      const stale = !snap.exists() || snap.val() < this.now() - this.ROOM_TTL_MS;
      if (!stale) continue;
      await this._guard(ref.set({ host: {
        v: PROTOCOL_VERSION, createdAt: firebase.database.ServerValue.TIMESTAMP, open: true,
      } }), "claim");
      /* Deliberately NO onDisconnect().remove(): on mobile a momentary RTDB
         socket blip makes the server fire it and destroy a room the host is
         still displaying a code for. The TTL above retires abandoned rooms. */
      this.code = code;
      this.owner = "host";
      this.joinId = null;
      this._openPublished = false;
      return code;
    }
    throw new Error("no-free-code");
  },

  /* Host: hear about every guest that knocks. child_added also replays the
     guests who joined while the listener was still being attached. */
  watchJoins(fn) {
    const ref = this.roomRef(this.code).child("joins");
    const cb = snap => { if (snap.exists()) fn(snap.key, (snap.val() || {}).at); };
    ref.on("child_added", cb);
    this._refs.push([ref, "child_added", cb]);
  },

  /* Host: drop a knock that can never be served (stale, or refused). The guest
     already holds everything it needs under peers/<jid>, so the join key is
     only clutter — and leaving it would replay the knock on the next attach. */
  dropJoin(jid) {
    try { this.roomRef(this.code).child("joins/" + jid).remove(); } catch (e) {}
  },

  async postOffer(jid, offerSdp) {
    await this._guard(this.peerRef(jid).child("offer").set({ v: PROTOCOL_VERSION, sdp: offerSdp }), "offer");
  },

  /* Resolve once the guest answers our offer. Deliberately NOT time-limited:
     the host may sit on the code for minutes while the guest sets up. */
  waitForAnswer(jid) {
    return new Promise(resolve => {
      const ref = this.peerRef(jid).child("answer/sdp");
      const cb = snap => { if (snap.exists()) { this._offRef(ref, "value", cb); resolve(snap.val()); } };
      ref.on("value", cb);
      this._refs.push([ref, "value", cb]);
    });
  },

  /* Host: refuse a join (gate already full, or the descent has begun). */
  async rejectJoin(jid, reason) {
    try { await this.peerRef(jid).child("reject").set(reason || "closed"); } catch (e) {}
    this.dropJoin(jid);
  },

  /* =========================================================
     GUEST
     ========================================================= */

  /* Ask to join a code. Throws "room-not-found" / "version-mismatch" /
     "room-closed". Returns this guest's join key. */
  async joinRoom(code) {
    if (!this.init()) throw new Error("firebase-unconfigured");
    this._wake();
    await this._ready();
    code = String(code || "").toUpperCase();
    const ref = this.roomRef(code);
    const snap = await this._guard(ref.get(), "fetch");
    const room = snap.val();
    if (!room || !room.host || !room.host.createdAt ||
        room.host.createdAt < this.now() - this.ROOM_TTL_MS) throw new Error("room-not-found");
    if (room.host.v !== PROTOCOL_VERSION) throw new Error("version-mismatch");
    if (room.host.open === false) throw new Error("room-closed");
    const jid = this.genJoinId();
    await this._guard(ref.child("joins/" + jid).set({
      v: PROTOCOL_VERSION, at: firebase.database.ServerValue.TIMESTAMP,
    }), "join");
    this.code = code;
    this.owner = "guest";
    this.joinId = jid;
    return jid;
  },

  /* Guest: resolve when the host mints our offer (or reject us). */
  watchOffer(jid, onOffer, onReject) {
    const base = this.peerRef(jid);
    const off = snap => { if (snap.exists()) { offVal(); offRej(); onOffer(snap.val().sdp); } };
    const rej = snap => { if (snap.exists()) { offVal(); offRej(); onReject && onReject(snap.val()); } };
    const refO = base.child("offer"), refR = base.child("reject");
    const offVal = () => { this._offRef(refO, "value", off); };
    const offRej = () => { this._offRef(refR, "value", rej); };
    refO.on("value", off);
    refR.on("value", rej);
    this._refs.push([refO, "value", off], [refR, "value", rej]);
  },

  async postAnswer(jid, answerSdp) {
    await this._guard(this.peerRef(jid).child("answer").set({ v: PROTOCOL_VERSION, sdp: answerSdp }), "answer");
  },

  /* =========================================================
     ICE — one bucket pair per guest key
     ========================================================= */
  pushCandidate(jid, side, cand) {
    this.peerRef(jid).child(side === "host" ? "hc" : "gc").push(JSON.stringify(cand));
  },
  onCandidates(jid, side, fn) {
    const ref = this.peerRef(jid).child(side === "host" ? "hc" : "gc");
    const cb = snap => { try { fn(JSON.parse(snap.val())); } catch (e) {} };
    ref.on("child_added", cb);
    this._refs.push([ref, "child_added", cb]);
  },

  /* =========================================================
     THE OPEN GATES INDEX
     ========================================================= */

  /* Host: (re)publish this gate to the public board. Display metadata plus a
     heartbeat — nothing a guest could use to skip the real handshake. Called
     on creation, on every roster/mode change, and on a slow timer; failures
     are swallowed because the index is a convenience, not the gate itself
     (a room whose rules block /open still works perfectly by code). */
  publishOpen(info) {
    if (this.owner !== "host" || !this.code || !this.init()) return;
    this._wake();
    const row = {
      v: PROTOCOL_VERSION,
      mode: (info && info.mode) || "normal",
      char: (info && info.char) || "",
      skin: (info && info.skin) || "",
      seats: Math.max(1, (info && info.seats) | 0),
      at: firebase.database.ServerValue.TIMESTAMP,
    };
    const code = this.code;
    this._guard(this.openRef(code).set(row), "open")
      .then(() => {
        /* a publish that lands after the gate closed must not re-arm the
           cleanup flag for a room that no longer exists */
        if (this.code === code && this.owner === "host") this._openPublished = true;
      }, () => {});
  },

  /* Read the board. Returns an unsubscribe fn. Rows are sorted newest first,
     capped, and every stale entry is retired as it is noticed — the board
     cleans itself without a server-side job. */
  watchOpen(fn) {
    if (!this.init()) { fn([]); return () => {}; }
    this._wake();
    const ref = this.db.ref("open");
    const cb = snap => {
      const rows = [];
      snap.forEach(ch => {
        const row = this._openRow(ch);
        if (row) rows.push(row);
      });
      rows.sort((a, b) => b.at - a.at);
      fn(rows.slice(0, this.OPEN_MAX));
    };
    /* no /open rules yet, or the socket is down: an empty board, not an error */
    const err = () => fn([]);
    ref.on("value", cb, err);
    return () => { try { ref.off("value", cb); } catch (e) {} };
  },

  _openRow(ch) {
    const v = ch.val() || {};
    const stale = typeof v.at !== "number" || v.at < this.now() - this.OPEN_TTL_MS;
    if (stale) {
      /* Hide at once, but only RETIRE when the server clock has told us how
         wrong this device's clock is. A phone five minutes fast would
         otherwise sweep live gates off the board for everyone. */
      if (this._skewKnown) { try { ch.ref.remove().catch(() => {}); } catch (e) {} }
      return null;
    }
    /* the key is the only thing that decides which gate is opened; a junk key
       is dropped before it can reach the UI list */
    if (!this.validCode(ch.key)) return null;
    return {
      code: ch.key,
      at: v.at,
      mode: typeof v.mode === "string" ? v.mode : "normal",
      char: typeof v.char === "string" ? v.char : "",
      skin: typeof v.skin === "string" ? v.skin : "",
      seats: Math.min(MAX_WARDENS, Math.max(1, v.seats | 0)),
    };
  },

  /* =========================================================
     TEARDOWN
     ========================================================= */
  /* The handshake is done (or abandoned): drop listeners and tidy up.
     OWNERSHIP MATTERS. Only the host created the room, so only the host may
     delete it. A guest that tears down (failed ICE, cancelled join, hang-up)
     must leave the room standing and merely withdraw its own join key, or it
     destroys the gate its partners are still walking through. */
  cleanup(deleteRoom) {
    for (const [ref, ev, cb] of this._refs) { try { ref.off(ev, cb); } catch (e) {} }
    this._refs = [];
    if (this.code && this.db) {
      const ref = this.roomRef(this.code);
      if (deleteRoom && this.owner === "host") {
        try { ref.remove(); } catch (e) {}
        /* the public listing dies with its gate, so nobody browses into a
           room that no longer exists */
        if (this._openPublished) {
          try { this.openRef(this.code).remove().catch(() => {}); } catch (e) {}
        }
      } else if (this.owner === "guest" && this.joinId) {
        try { ref.child("joins/" + this.joinId).remove(); } catch (e) {}
        try { ref.child("peers/" + this.joinId).remove(); } catch (e) {}
      }
    }
    this.code = null;
    this.owner = null;
    this.joinId = null;
    this._openPublished = false;
  },

  /* Host: the descent is firing — retire the gate and give the socket back. */
  closeRoom() {
    this.cleanup(true);
    this.releaseSoon();
  },
  /* Guest: step away without disturbing the gate. */
  leaveRoom() {
    this.cleanup(false);
    this.releaseSoon();
  },
};
