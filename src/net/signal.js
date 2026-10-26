/* =========================================================
   RUNEGUN · Signaling — join codes over Firebase Realtime DB.
   The DB is a one-shot mailbox: host posts an offer under a short
   code, guest posts the answer, both trade ICE candidates, and the
   room is deleted the moment the DataChannel opens.

   RTDB layout:
     /rooms/<CODE>/host  { v, createdAt, offer }
     /rooms/<CODE>/guest { v, answer }
     /rooms/<CODE>/hc/<push>  host ICE candidate (JSON string)
     /rooms/<CODE>/gc/<push>  guest ICE candidate (JSON string)
   ========================================================= */
"use strict";

const Signal = {
  /* code alphabet: A-Z + 2-9 minus lookalikes O/0/I/1 */
  ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  CODE_LEN: 5,
  ROOM_TTL_MS: 10 * 60 * 1000,

  app: null, db: null,
  code: null,
  owner: null,        // "host" if WE created this room — only the owner may delete it
  _refs: [],          // listeners to detach on cleanup
  _skew: 0,           // serverTime - deviceTime, so a wrong device clock can't expire rooms
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
    this.db.ref("/.info/serverTimeOffset").on("value", s => { this._skew = s.val() || 0; });
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
     more. Re-opened automatically by the next createRoom/fetchOffer. */
  release() {
    if (!this.db) return;
    try { this.db.goOffline(); this.online = false; } catch (e) {}
  },
  /* cleanup() queues a room delete, and cutting the socket underneath it would
     strand that write — leaving an orphan room to sit until its TTL. Give the
     delete a moment to flush, then hand the connection back. */
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

  roomRef(code) { return this.db.ref("rooms/" + code); },

  /* HOST: claim a fresh code (retry on collision with a live room) and
     post the offer. Returns the code. */
  async createRoom(offerSdp) {
    if (!this.init()) throw new Error("firebase-unconfigured");
    this._wake();                       // a previous session may have released the socket
    await this._ready();                // ...and goOnline() lands asynchronously
    for (let tries = 0; tries < 6; tries++) {
      const code = this.genCode();
      const ref = this.roomRef(code);
      const snap = await this._guard(ref.child("host/createdAt").get(), "probe");
      const stale = !snap.exists() || snap.val() < this.now() - this.ROOM_TTL_MS;
      if (!stale) continue;
      await this._guard(ref.set({ host: { v: PROTOCOL_VERSION, createdAt: firebase.database.ServerValue.TIMESTAMP, offer: offerSdp } }), "claim");
      /* Deliberately NO onDisconnect().remove(): on mobile a momentary RTDB
         socket blip makes the server fire it and destroy a room the host is
         still displaying a code for. The TTL above retires abandoned rooms. */
      this.code = code;
      this.owner = "host";
      return code;
    }
    throw new Error("no-free-code");
  },

  /* GUEST: fetch the host's offer for a code. Throws "room-not-found" /
     "room-taken" / "version-mismatch". */
  async fetchOffer(code) {
    if (!this.init()) throw new Error("firebase-unconfigured");
    this._wake();
    await this._ready();
    code = code.toUpperCase();
    const ref = this.roomRef(code);
    const snap = await this._guard(ref.get(), "fetch");
    const room = snap.val();
    if (!room || !room.host || !room.host.offer ||
        room.host.createdAt < this.now() - this.ROOM_TTL_MS) throw new Error("room-not-found");
    if (room.host.v !== PROTOCOL_VERSION) throw new Error("version-mismatch");
    /* A stale answer is almost always OUR OWN abandoned attempt (the join timed
       out and we came back to retry), not a third player. Reclaim it rather than
       refusing — the previous behaviour made one failed attempt poison the code. */
    if (room.guest && room.guest.answer) await this._guard(ref.child("guest").remove(), "reclaim");
    this.code = code;
    this.owner = "guest";
    return room.host.offer;
  },

  async postAnswer(answerSdp) {
    await this._guard(this.roomRef(this.code).child("guest").set({ v: PROTOCOL_VERSION, answer: answerSdp }), "answer");
  },

  /* HOST: resolve once a guest posts an answer.
     Deliberately NOT time-limited — the host may sit on the code for minutes
     while reading it out. The lobby watches `Signal.online` to notice if the
     socket dies underneath this wait. */
  waitForAnswer() {
    return new Promise(resolve => {
      const ref = this.roomRef(this.code).child("guest/answer");
      const cb = snap => { if (snap.exists()) { ref.off("value", cb); resolve(snap.val()); } };
      ref.on("value", cb);
      this._refs.push([ref, "value", cb]);
    });
  },

  /* trade ICE: push mine under my key, stream the peer's from theirs */
  pushCandidate(mine, cand) {
    const key = mine === "host" ? "hc" : "gc";
    this.roomRef(this.code).child(key).push(JSON.stringify(cand));
  },
  onCandidates(theirs, fn) {
    const key = theirs === "host" ? "hc" : "gc";
    const ref = this.roomRef(this.code).child(key);
    const cb = snap => { try { fn(JSON.parse(snap.val())); } catch (e) {} };
    ref.on("child_added", cb);
    this._refs.push([ref, "child_added", cb]);
  },

  /* The handshake is done (or abandoned): drop listeners and tidy up.
     OWNERSHIP MATTERS. Only the host created the room, so only the host may
     delete it. A guest that tears down (failed ICE, cancelled join, hang-up)
     must leave the room standing and merely withdraw its own answer, or it
     destroys the room its partner is still advertising a code for — which is
     what made every retry report "no gate answers that code". */
  cleanup(deleteRoom) {
    for (const [ref, ev, cb] of this._refs) { try { ref.off(ev, cb); } catch (e) {} }
    this._refs = [];
    if (this.code && this.db) {
      const ref = this.roomRef(this.code);
      if (deleteRoom && this.owner === "host") { try { ref.remove(); } catch (e) {} }
      else if (this.owner === "guest") { try { ref.child("guest").remove(); } catch (e) {} }
    }
    this.code = null;
    this.owner = null;
  },
};
