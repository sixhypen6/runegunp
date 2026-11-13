/* =========================================================
   RUNEGUN · VERSUS MATCHMAKING
   The front door to a duel that does not pass through the co-op lobby:
   pick a warden + loadout in ui/pvp-panel.js, press FIND MATCH, and the
   game forges its own gate on the same public board co-op uses.

   Two searchers may forge a gate at the same moment, so the board is
   arbitrated deterministically: the LOWEST room code keeps its gate and
   every other searcher crosses to it. The loser deletes its own room
   before joining, so only one gate ever survives. A versus gate seats
   exactly one guest (Net.maxGuests = 1); the host then seals both
   drafts, fires the shared descent and flips it into pvpStart().

   The wire carries the guest's draft as one reliable "pvpDraft" message;
   the host validates the spend with the same pvpApplyRunes() the live
   editor uses, so a hand-made message can never buy past the pool.
   ========================================================= */
"use strict";

/* ---------- drafts ---------- */

/* a menu-side warden: enough shape for the pricing helpers and recalc(),
   but no seat in players[] until the duel actually begins */
function pvpDraftFromLocal() {
  const cfg = localPlayerCfg();
  const d = {
    char: cfg.char, skin: cfg.skin, gunSkin: cfg.gunSkin, pet: cfg.pet,
    boardName: cfg.boardName || "", rerollBuff: cfg.rerollBuff || 0,
    hp: 1, maxHp: 1, shield: 0, shieldMax: 0,
    runes: {}, lockedRunes: null,
  };
  pvpReset(d);              // the warden's native kit, free of the point pool
  return d;
}

/* a wire draft is untrusted: known warden, known runes, sane stack counts */
function pvpSanitizeDraft(raw, peer) {
  const cfg = (peer && peer.cfg) || {};
  const char = raw && CHARS[raw.char] ? raw.char
    : (CHARS[cfg.char] ? cfg.char : Object.keys(CHARS)[0]);
  const runes = {};
  if (raw && raw.runes && typeof raw.runes === "object") {
    for (const id of RUNE_IDS) {
      const n = raw.runes[id] | 0;
      if (n > 0) runes[id] = Math.min(99, n);
    }
  }
  return {
    char,
    skin: raw && typeof raw.skin === "string" ? raw.skin.slice(0, 32) : (cfg.skin || ""),
    gunSkin: raw && typeof raw.gunSkin === "string" ? raw.gunSkin.slice(0, 32) : (cfg.gunSkin || ""),
    pet: raw && typeof raw.pet === "string" ? raw.pet.slice(0, 32) : null,
    boardName: raw && typeof raw.boardName === "string" ? raw.boardName.slice(0, 20) : (cfg.boardName || ""),
    rerollBuff: 0,
    runes,
  };
}

/* what a draft sends as its seat config — the runes ride separately */
function pvpDraftCfg(d) {
  const cfg = localPlayerCfg();
  const src = d || cfg;
  return {
    char: src && CHARS[src.char] ? src.char : cfg.char,
    skin: src && typeof src.skin === "string" ? src.skin : cfg.skin,
    gunSkin: src && typeof src.gunSkin === "string" ? src.gunSkin : cfg.gunSkin,
    pet: src && typeof src.pet === "string" ? src.pet : null,
    boardName: src && typeof src.boardName === "string" ? src.boardName : (cfg.boardName || ""),
    rerollBuff: cfg.rerollBuff || 0,
  };
}

function pvpDraftRunes(d) {
  const out = {};
  if (d && d.runes && typeof d.runes === "object")
    for (const id of RUNE_IDS) if ((d.runes[id] | 0) > 0) out[id] = Math.min(99, d.runes[id] | 0);
  return out;
}

function pvpMatchErrorText(e) {
  switch (e && e.message) {
    case "room-not-found": return "THAT GATE VANISHED — FIND MATCH AGAIN";
    case "version-mismatch": return "YOUR VERSIONS DIFFER — EVERY PLAYER UPDATES THE GAME";
    case "firebase-unconfigured": return "ONLINE VERSUS IS NOT CONFIGURED ON THIS BUILD";
    case "room-full": return "THAT GATE FILLED FIRST";
    case "room-closed": return "THAT GATE ALREADY CLOSED";
    case "link-lost": return "THE RIVAL'S LINK BROKE";
    case "offline": return "NO CONNECTION TO THE GATEKEEPER — CHECK YOUR SIGNAL";
    case "signal-timeout": return "THE GATEKEEPER DID NOT ANSWER — TRY AGAIN IN A MOMENT";
    default: return "THE LINK WOULD NOT OPEN — TRY AGAIN";
  }
}

const PvpMatch = {
  state: "idle",           // idle | searching | joining | linked | live
  code: "",                // our own gate while searching
  _draft: null,            // our warden/loadout (the panel edits this)
  _remote: null,           // the guest's draft, once the host receives it
  _watch: null,            // /open unsubscribe
  _openTimer: 0,           // board heartbeat
  _startTimer: 0,          // host fallback if the guest draft goes missing
  _retryTimer: 0,
  _joining: false,
  _started: false,
  _retries: 0,
  _lastPub: 0,

  /* ---------- entry / exit ---------- */
  open() {
    if (typeof Coop !== "undefined" && Coop.running) {
      toast("FINISH THIS DESCENT BEFORE SEEKING A RIVAL");
      return;
    }
    if (Game.pvpMode) { toast("A DUEL IS ALREADY LIVE"); return; }
    if (!firebaseConfigured()) {
      toast("ONLINE VERSUS NEEDS A FIREBASE CONFIG");
      return;
    }
    /* a gate left behind by an abandoned session must not hold a seat */
    if (Net.active) Net.hangUp();
    if (!this._draft) this._draft = pvpDraftFromLocal();
    this.state = "idle"; this.code = ""; this._remote = null;
    this._joining = false; this._started = false; this._retries = 0;
    this._clearTimers(); this._stopWatch(); this._stopOpenRefresh();
    PvpPanel.openDraft(this._draft, {
      queue: () => this.find(),
      cancel: () => this.cancel(),
      close: () => this.close(),
      change: () => this._draftChanged(),
    });
    Signal.prewarm();
  },

  close() {
    if (this.state === "live") { PvpPanel.hide(); return; }
    PvpPanel.setDraftState({ locked: false, busy: false });
    PvpPanel.hide();
    this.state = "idle";
    this._stopMatchNet();
  },

  cancel() {
    if (this.state === "live" || this.state === "idle") return;
    PvpPanel.setDraftState({ locked: false, busy: false, queue: "READY — PICK A WARDEN AND A LOADOUT" });
    this.state = "idle";
    this._stopMatchNet();
  },

  /* the panel changed the draft while the gate stands — board text only */
  _draftChanged() {
    if (this.state !== "searching" || Net.role !== "host") return;
    const now = performance.now();
    if (now - this._lastPub < 1500) return;
    this._lastPub = now;
    this._publish();
  },

  /* ---------- searching ---------- */
  async find(auto) {
    if (this.state === "searching" || this.state === "joining" ||
        this.state === "linked" || this.state === "live") return;
    if (!auto) this._retries = 0;
    if (!firebaseConfigured()) {
      PvpPanel.setDraftState({ queue: "ONLINE VERSUS NEEDS A FIREBASE CONFIG" });
      return;
    }
    if (Net.active) Net.hangUp();
    this.state = "searching";
    this.code = ""; this._remote = null;
    this._joining = false; this._started = false;
    PvpPanel.setDraftState({ locked: false, busy: true, queue: "FORGING A GATE…" });
    this._wireNet();
    let code;
    try {
      /* one rival only: a third searcher is refused rather than seated */
      code = await Net.host({ maxGuests: 1 });
    } catch (e) {
      this._fail(e, false);
      return;
    }
    if (this.state !== "searching") { Net.hangUp(); return; }   // cancelled while claiming
    this.code = code;
    this._publish();
    this._startOpenRefresh();
    this._watch = Signal.watchOpen(rows => this._onBoard(rows));
    PvpPanel.setDraftState({ queue: "SEARCHING FOR A RIVAL · GATE " + code });
  },

  _publish() {
    if (Net.role !== "host" || !this.code) return;
    const d = this._draft || {};
    const cfg = localPlayerCfg();
    Signal.publishOpen({
      kind: "pvp",
      mode: "pvp",
      char: d.char || cfg.char,
      skin: d.skin || cfg.skin,
      seats: Net.peers.length + 1,
    });
  },
  _startOpenRefresh() {
    clearInterval(this._openTimer);
    this._openTimer = setInterval(() => {
      if (this.state !== "searching" || Net.role !== "host") {
        clearInterval(this._openTimer); this._openTimer = 0; return;
      }
      this._publish();
    }, Signal.OPEN_REFRESH_MS);
  },
  _stopOpenRefresh() {
    clearInterval(this._openTimer); this._openTimer = 0;
  },
  _stopWatch() {
    if (this._watch) { try { this._watch(); } catch (e) {} this._watch = null; }
  },
  _clearTimers() {
    clearTimeout(this._startTimer); this._startTimer = 0;
    clearTimeout(this._retryTimer); this._retryTimer = 0;
  },
  _stopMatchNet() {
    this._clearTimers();
    this._stopWatch();
    this._stopOpenRefresh();
    if (Net.active) Net.hangUp();
    this.code = "";
    this._remote = null;
    this._joining = false;
    this._started = false;
  },

  /* A set of live versus gates. The lowest code is the one true host; everybody
     else crosses to it immediately, so a simultaneous press cannot deadlock. */
  _onBoard(rows) {
    if (this.state !== "searching" || Net.role !== "host" || !this.code) return;
    const rivals = (rows || []).filter(r =>
      r.kind === "pvp" && r.code !== this.code && r.seats < 2);
    if (!rivals.length) return;
    let target = null;
    for (const r of rivals)
      if (r.code < this.code && (!target || r.code < target.code)) target = r;
    if (target) this._join(target.code);
  },

  async _join(code) {
    if (this.state !== "searching" || this._joining) return;
    this._joining = true;
    this.state = "joining";
    this._stopWatch();
    this._stopOpenRefresh();
    PvpPanel.setDraftState({ busy: true, queue: "MATCH FOUND — CROSSING TO GATE " + code + "…" });
    /* leave our own gate before knocking: only the lowest code may survive */
    if (Net.role === "host") Net.hangUp();
    this._wireNet();
    try {
      await Net.join(code);
      PvpPanel.setDraftState({ queue: "GATE FOUND — FORGING THE LINK…" });
    } catch (e) {
      this._fail(e, true);
    }
  },

  /* ---------- link ---------- */
  _wireNet() {
    Net.onConnected = peer => this._onConnected(peer);
    Net.onPeerHello = (cfg, peer) => {
      if (this.state === "linked" && Net.role === "guest") this._sendDraft();
      if (this.state === "searching" && Net.role === "host") this._publish();
    };
    Net.onPeerLost = (why, peer) => this._onPeerLost(why, peer);
    Net.onMessage = (m, peer) => this._onMsg(m, peer);
  },

  _onConnected(peer) {
    if (this.state !== "joining" && this.state !== "searching") return;
    this.state = "linked";
    this._stopWatch();
    this._stopOpenRefresh();
    AudioFX.waveUp();
    if (Net.role === "host") {
      PvpPanel.setDraftState({ locked: true, busy: true, queue: "MATCH FOUND — SEALING BOTH LOADOUTS…" });
      this._publish();                              // the board now says 2/2
      Net.sendR({ t: "pvpDraftReq" });
      /* the guest's draft may already be here (its message beat our onConnected)
         — otherwise the duel must not hang on one lost reliable frame: start
         shortly with their hello warden if nothing arrives */
      if (this._remote) this._hostStart();
      else {
        clearTimeout(this._startTimer);
        this._startTimer = setTimeout(() => this._hostStart(), 2600);
      }
    } else {
      PvpPanel.setDraftState({ locked: true, busy: true, queue: "MATCH FOUND — WAITING FOR THE HOST…" });
      this._sendDraft();
    }
  },

  _onPeerLost(why, peer) {
    if (this.state === "live") return;              // Coop owns the link from here
    if (why === "version") { this._fail({ message: "version-mismatch" }, false); return; }
    if (this.state === "joining" && (why === "room-full" || why === "room-closed")) {
      this._fail({ message: why }, true);
      return;
    }
    if (this.state === "linked" || this.state === "joining") {
      /* the gate was real but the route never opened, or the rival vanished */
      const hard = String(why).indexOf("ice") === 0;
      this._fail({ message: hard ? "signal-timeout" : "link-lost" }, true);
    }
  },

  _sendDraft() {
    if (Net.role !== "guest" || !this._draft) return;
    const d = this._draft;
    Net.sendR({
      t: "pvpDraft",
      char: d.char, skin: d.skin, gunSkin: d.gunSkin, pet: d.pet,
      boardName: Meta.boardName || "", runes: pvpDraftRunes(d),
    });
  },

  _onMsg(m, peer) {
    if (!m) return;
    if (m.t === "pvpDraftReq" && Net.role === "guest") { this._sendDraft(); return; }
    if (m.t === "pvpDraft" && Net.role === "host") {
      if (this._started) return;
      this._remote = pvpSanitizeDraft(m, peer);
      if (this.state === "linked") this._hostStart();
      return;
    }
    if (m.t === "start" && Net.role === "guest") this._guestStart(m);
  },

  /* ---------- start ---------- */
  _hostStart() {
    if (this._started || Net.role !== "host") return;
    if (!Net.peers.length) { this._fail({ message: "link-lost" }, true); return; }
    if (typeof Coop !== "undefined" && Coop.running) return;
    this._started = true;
    clearTimeout(this._startTimer); this._startTimer = 0;

    const peer = Net.peers[0];
    const other = this._remote || pvpSanitizeDraft((peer && peer.cfg) || {}, peer);
    const cfgs = [pvpDraftCfg(this._draft), pvpDraftCfg(other)];

    /* the gate has served its purpose — retire it and its public listing */
    this._stopWatch();
    this._stopOpenRefresh();
    Signal.closeRoom();
    this.code = "";
    PvpPanel.setDraftState({ locked: true, busy: true, queue: "FORGING THE DUEL…" });

    /* start MUST reach the guest before Coop re-wires onMessage: the guest's
       matchmaker begins the descent, then the live protocol owns the link */
    Net.sendR({ t: "start", cfgs, mode: "normal", runePause: false });
    Coop.beginHost(cfgs, "normal");
    if (players[0]) pvpApplyRunes(players[0], pvpDraftRunes(this._draft));
    if (players[1]) pvpApplyRunes(players[1], pvpDraftRunes(other));
    if (typeof Coop.resyncEdit === "function") Coop.resyncEdit(true);
    try {
      pvpStart();
    } catch (e) {
      toast(String(e && e.message || e).toUpperCase());
    }
    PvpPanel.hide();
    this.state = "live";
    this._remote = null;
  },

  _guestStart(m) {
    if (this.state === "live") return;
    if (!Array.isArray(m.cfgs) || m.cfgs.length < 2) return;
    this._started = true;
    this.state = "live";
    Coop.beginGuest(m.cfgs, m.mode, m.runePause);
    /* the host's edit echo will re-seal both builds; this keeps the local
       warden correct even if that echo is delayed */
    const me = localPlayer();
    if (me && this._draft && typeof pvpApplyRunes === "function")
      pvpApplyRunes(me, pvpDraftRunes(this._draft));
    PvpPanel.hide();
    this.code = "";
    this._remote = null;
    this._clearTimers();
    this._stopWatch();
    this._stopOpenRefresh();
  },

  /* ---------- failure ---------- */
  _fail(e, retry) {
    const msg = pvpMatchErrorText(e);
    this._stopMatchNet();
    if (retry && this._retries < 3) {
      this._retries++;
      this.state = "idle";
      PvpPanel.setDraftState({ locked: false, busy: false, queue: msg + " — SEARCHING AGAIN…" });
      clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        if (PvpPanel.isOpen() && this.state === "idle") this.find(true);
      }, 800 + Math.random() * 700);
      return;
    }
    this.state = "idle";
    PvpPanel.setDraftState({ locked: false, busy: false, queue: msg });
  },
};

/* the descent chooser's third door — no co-op gate, no pause-menu detour */
{
  const card = $("dcPvp");
  if (card) card.addEventListener("click", () => {
    if (typeof descentChoiceArmed === "function" && !descentChoiceArmed()) return;
    if (typeof closeDescentChoice === "function") closeDescentChoice();
    PvpMatch.open();
  });
}
