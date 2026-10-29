/* =========================================================
   RUNEGUN · Co-op lobby — host/join flow behind the CO-OP button.
   Host: forge a code, hold the gate while up to three guests join.
   Join: keypad in the code. Connected: every warden shown, every
   hand raised, host fires the descent.
   The HOST is authoritative for the roster; guests mirror it.
   State "lobby" is registered in hud.js OVERLAYS as #coopLobby.
   ========================================================= */
"use strict";

const Lobby = {
  view: "entry",           // entry | host | join | ready
  mode: "normal",          // shared descent mode (COOP_MODES) — the host chooses
  code: "",                // join view: what's been typed
  selfReady: false,
  roster: [],              // guest: the host's [{idx, cfg, ready}]
  _pingTimer: 0, _connectTimer: 0, _linkTimer: 0,

  open() {
    if (!firebaseConfigured()) {
      toast("CO-OP NEEDS A FIREBASE CONFIG — SEE src/net/firebase-config.js");
      return;
    }
    this.reset();
    Signal.prewarm();     // wake the socket now, not when they press a button
    setState("lobby");
  },

  reset() {
    Net.hangUp();
    this.view = "entry"; this.code = ""; this.mode = "normal";
    this.selfReady = false; this.roster = [];
    clearInterval(this._pingTimer); this._pingTimer = 0;
    clearInterval(this._linkTimer); this._linkTimer = 0;
    clearTimeout(this._connectTimer); this._connectTimer = 0;
    this.render();
  },

  close() {
    this.reset();
    /* leaving co-op entirely: give the database connection back too, once any
       queued room cleanup has flushed */
    Signal.releaseSoon();
    setState("menu");
  },

  render() {
    for (const [id, v] of [["coopEntry", "entry"], ["coopHostView", "host"], ["coopJoinView", "join"], ["coopReadyView", "ready"]])
      $(id).style.display = this.view === v ? "" : "none";
    if (this.view === "join") this.renderCode();
    if (this.view === "ready") this.renderReady();
  },

  /* ---------- HOST ---------- */
  async host() {
    this.view = "host"; this.render();
    $("coopCode").textContent = "·····";
    $("coopHostStatus").textContent = "FORGING THE GATE…";
    this._wireNet();
    try {
      const code = await Net.host();
      this.code = code;
      $("coopCode").textContent = code;
      this._hostStatusLine();
      this._watchLink();
    } catch (e) {
      $("coopCode").textContent = "·····";
      $("coopHostStatus").textContent = this._errText(e);
      Net.hangUp();
    }
  },

  _hostStatusLine() {
    const n = Net.peers.length;
    $("coopHostStatus").textContent = n
      ? n + " OF " + MAX_GUESTS + " SEATS FILLED — MORE MAY JOIN · THE GATE HOLDS TEN MINUTES"
      : "SPEAK THIS CODE TO YOUR PARTNERS — THE GATE HOLDS TEN MINUTES";
  },

  /* A host can sit on its code for minutes, and the wait for a guest has no
     timeout by design. If the database connection dies underneath it, the code
     silently stops being reachable — so watch and say so rather than letting
     them read out a dead code. */
  _watchLink() {
    clearInterval(this._linkTimer);
    this._linkTimer = setInterval(() => {
      if (Game.state !== "lobby" || this.view !== "host") { clearInterval(this._linkTimer); return; }
      if (Signal.online) return;
      $("coopHostStatus").textContent = "LOST THE GATEKEEPER — THIS CODE IS DEAD, PRESS RETURN AND HOST AGAIN";
    }, 2000);
  },

  /* ---------- JOIN ---------- */
  join() {
    this.view = "join"; this.code = ""; this.render();
    $("coopJoinStatus").textContent = "";
  },
  key(ch) {
    if (this.view !== "join") return;
    /* a full code that failed: the next keypress starts a fresh one */
    if (ch !== "DEL" && this.code.length >= Signal.CODE_LEN) { this.code = ""; $("coopJoinStatus").textContent = ""; }
    if (ch === "DEL") this.code = this.code.slice(0, -1);
    else if (this.code.length < Signal.CODE_LEN) this.code += ch;
    this.renderCode();
    if (this.code.length === Signal.CODE_LEN) this.tryJoin();
  },
  renderCode() {
    let s = "";
    for (let i = 0; i < Signal.CODE_LEN; i++) s += this.code[i] || "─";
    $("coopCodeEntry").textContent = s;
    /* a complete code turns CLEAR into RETRY — a failed attempt is far more
       often a flaky route than a typo, and retyping five marks to find out is
       the wrong tax to charge */
    const b = $("coopPadAlt");
    if (b) b.textContent = this.code.length >= Signal.CODE_LEN ? "RETRY THIS CODE" : "CLEAR";
  },
  async tryJoin() {
    $("coopJoinStatus").textContent = "SEEKING THE GATE…";
    this._wireNet();
    try {
      await Net.join(this.code);
      $("coopJoinStatus").textContent = "GATE FOUND — CROSSING…";
      this._armConnectTimeout();
    } catch (e) {
      $("coopJoinStatus").textContent = this._errText(e);
      /* the code stays on screen: a wrong-code typo is rare next to a transient
         failure, and retyping five characters to retry is pure friction */
      Net.hangUp();
    }
  },

  _errText(e) {
    switch (e && e.message) {
      case "room-not-found": return "NO GATE ANSWERS THAT CODE — CHECK IT, OR ASK FOR A FRESH ONE";
      case "version-mismatch": return "YOUR VERSIONS DIFFER — EVERY PLAYER UPDATES THE GAME";
      case "firebase-unconfigured": return "CO-OP IS NOT CONFIGURED ON THIS BUILD";
      case "room-full": return "THAT GATE ALREADY HOLDS FOUR WARDENS — ASK FOR A SEAT OR A NEW CODE";
      case "room-closed": return "THAT DESCENT HAS ALREADY BEGUN — THE HOST MUST FORGE A NEW GATE";
      /* the socket never came up: no signal, a captive portal, or the service
         is at capacity. Nothing the player typed is at fault — say so. */
      case "offline": return "NO CONNECTION TO THE GATEKEEPER — CHECK YOUR SIGNAL AND TRY AGAIN";
      /* the socket was up but the call never came back — almost always the
         service being over capacity or having a bad moment */
      case "signal-timeout": return "THE GATEKEEPER DID NOT ANSWER — TRY AGAIN IN A MOMENT";
      default: return "THE GATE WOULD NOT OPEN — CHECK YOUR CONNECTION";
    }
  },

  /* The gate was found and the join posted, but no route ever opened. That is
     a NETWORK failure, not a bad code — say so, and say which kind. */
  _routeFailText() {
    /* Not one candidate gathered: the browser itself has no usable network
       path for WebRTC. A firewall, a VPN, or a locked-down corporate network
       is blocking it — and no relay can rescue that either. */
    if (!Net.iceStats.gathered)
      return "NO NETWORK ROUTE FOUND — A FIREWALL OR VPN IS BLOCKING THE GAME";
    /* No relay configured at all (turn-config.js): same-machine and same-LAN
       pairs still connect on host candidates, so a failure here means the two
       sides are behind different NATs — which no amount of retrying fixes. */
    if (!TURN_SERVERS.length)
      return "FOUND YOUR PARTNER, BUT NO ROUTE OPENED — BOTH ON WI-FI, OR CONFIGURE A RELAY";
    if (!Net.iceStats.relay)
      return "FOUND YOUR PARTNER, BUT NO ROUTE OPENED — THE RELAY DID NOT ANSWER";
    return "FOUND YOUR PARTNER, BUT NO ROUTE OPENED — TRY AGAIN, OR BOTH ON WI-FI";
  },

  _armConnectTimeout() {
    clearTimeout(this._connectTimer);
    this._connectTimer = setTimeout(() => {
      if (Game.state !== "lobby" || this.view === "ready") return;
      /* Hang up but STAY on the join view with the code intact, so retrying is
         one tap. The room itself survives — a guest never deletes it (signal.js
         cleanup), so the host's code keeps working. */
      Net.hangUp();
      /* one line for a bug report: how many candidates we gathered, and of
         which kind. `gathered: 0` is a different bug from `relay: 0`. */
      try { console.warn("[co-op] no route — " + JSON.stringify(Net.iceStats)); } catch (e) {}
      if (this.view === "join") $("coopJoinStatus").textContent = this._routeFailText();
      else { $("coopHostStatus").textContent = this._routeFailText() + " — PRESS RETURN, THEN HOST AGAIN"; }
    }, 20000);
  },

  /* ---------- CONNECTED / READY ---------- */
  _wireNet() {
    Net.onConnected = peer => {
      clearTimeout(this._connectTimer);
      if (Game.state !== "lobby") return;
      if (this.view !== "ready") { this.view = "ready"; this.render(); }
      else this.renderReady();
      /* tell a fresh guest which seat it holds before any roster reaches it */
      if (Net.role === "host" && peer) Net.sendRTo(peer, { t: "lobbySlot", idx: peer.idx });
    };
    Net.onPeerHello = (cfg, peer) => {
      if (Game.state !== "lobby") return;
      if (Net.role === "host") this._broadcastRoster();
      else this.renderReady();
    };
    Net.onPeerLost = (why, peer) => this._peerLost(why, peer);
    Net.onMessage = (m, peer) => this._msg(m, peer);
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      if (Game.state !== "lobby" || this.view !== "ready") return;
      const rtt = Net.rtt ? " · LINK " + Net.rtt + "ms" : "";
      if (Net.role === "host")
        $("coopPing").textContent = "GATE " + this.code + " · " + (Net.peers.length + 1) + "/" + MAX_WARDENS + " WARDENS" + rtt;
      else $("coopPing").textContent = "LINK FORGED" + rtt;
    }, 1000);
  },

  _peerLost(why, peer) {
    if (Game.state !== "lobby") return;
    if (why === "version") {
      toast("YOUR VERSIONS DIFFER — EVERY PLAYER UPDATES THE GAME");
      this.reset();
      return;
    }
    /* the host refused the join, or the gate closed under us */
    if (why === "room-full" || why === "room-closed") {
      clearTimeout(this._connectTimer);
      Net.hangUp();
      $("coopJoinStatus").textContent = this._errText({ message: why });
      return;
    }
    /* An ICE failure before we ever paired isn't "the partner left" — it's a
       route that never opened. Keep the view (and the typed code) so a retry
       is immediate instead of dumping them back to the start. */
    if (String(why).indexOf("ice") === 0 && this.view !== "ready") {
      clearTimeout(this._connectTimer);
      if (this.view === "join") $("coopJoinStatus").textContent = this._routeFailText();
      else $("coopHostStatus").textContent = this._routeFailText() + " — PRESS RETURN, THEN HOST AGAIN";
      return;
    }
    if (Net.role === "guest") {
      toast("THE GATE CLOSES — YOUR LINK IS GONE");
      this.reset();
      return;
    }
    /* HOST: one seat empties, the gate stays open for the rest (and for a
       replacement). Seats compact so every guest still lines up with players[]. */
    toast("A WARDEN HAS LEFT THE GATE");
    Net.renumber();
    for (const p of Net.peers) Net.sendRTo(p, { t: "lobbySlot", idx: p.idx });
    this._broadcastRoster();
    if (!Net.peers.length) { this.view = "host"; this.render(); this._hostStatusLine(); }
    else this.renderReady();
  },

  wardenCardHTML(cfg, ready, label) {
    const c = cfg && CHARS[cfg.char];
    return c
      ? "<div class='cw-glyph' style='color:" + (SKINS[cfg.skin] ? SKINS[cfg.skin].color : "#e8e2d0") + "'>" + (c.glyph || "ᛟ") + "</div>" +
        "<div class='cw-name'>" + c.name + "</div>" +
        "<div class='cw-sub'>" + label + (ready ? " · READY" : "") + "</div>"
      : "<div class='cw-glyph'>…</div><div class='cw-name'>WAITING</div><div class='cw-sub'>" + label + "</div>";
  },

  _buildRoster() {
    const out = [{ idx: 0, cfg: localPlayerCfg(), ready: this.selfReady }];
    for (const peer of Net.peers)
      if (peer.cfg) out.push({ idx: peer.idx, cfg: peer.cfg, ready: !!peer.ready });
    out.sort((a, b) => a.idx - b.idx);
    return out;
  },
  _broadcastRoster() {
    this.roster = this._buildRoster();
    Net.sendR({ t: "lobbyRoster", roster: this.roster, mode: this.mode });
    this.renderReady();
  },

  renderReady() {
    const host = Net.role === "host";
    const roster = host ? this._buildRoster() : (this.roster.length ? this.roster.slice() : []);
    /* a guest's own readiness is local until the host echoes the roster back */
    for (const e of roster) if (e.idx === Net.localIdx) e.ready = this.selfReady;
    if (!roster.length) roster.push({ idx: Net.localIdx, cfg: localPlayerCfg(), ready: this.selfReady });

    const box = $("coopCards");
    box.innerHTML = "";
    for (const e of roster) {
      const el = document.createElement("div");
      el.className = "coop-warden" + (e.ready ? " ready" : "");
      const label = e.idx === Net.localIdx ? (host && e.idx === 0 ? "YOU · HOST" : "YOU")
        : (e.idx === 0 ? "HOST" : "WARDEN " + ROMAN(e.idx + 1));
      el.innerHTML = this.wardenCardHTML(e.cfg, e.ready, label);
      box.appendChild(el);
    }
    /* the host sees the empty seats it is holding open */
    if (host) for (let i = roster.length; i < MAX_WARDENS; i++) {
      const el = document.createElement("div");
      el.className = "coop-warden empty";
      el.innerHTML = "<div class='cw-glyph'>·</div><div class='cw-name'>OPEN</div><div class='cw-sub'>WAITING</div>";
      box.appendChild(el);
    }

    $("coopReadyBtn").textContent = this.selfReady ? "READY ✓" : "READY";
    const guests = Net.peers.length;
    if (host) {
      const waiting = Net.peers.filter(p => !p.ready).length;
      $("coopReadyStatus").textContent = !guests
        ? "WAITING FOR A WARDEN TO JOIN — SHARE THE GATE"
        : (this.selfReady && !waiting)
          ? "EVERY WARDEN IS READY — FIRE THE DESCENT"
          : "WAITING ON " + waiting + " WARDEN" + (waiting === 1 ? "…" : "S…");
    } else {
      $("coopReadyStatus").textContent = this.selfReady ? "READY — WAITING FOR THE HOST" : "";
    }
    this.renderModes();
  },

  /* the descent's rules — only the host taps them; guests are told what was chosen */
  renderModes() {
    const host = Net.role === "host";
    for (const b of document.querySelectorAll("#coopModes .coop-mode")) {
      b.classList.toggle("on", b.getAttribute("data-mode") === this.mode);
      b.disabled = !host;
    }
    const hint = $("coopModeHint");
    if (hint) hint.textContent = host
      ? (COOP_MODE_DESC[this.mode] || "")
      : "YOUR HOST'S DESCENT · " + (COOP_MODE_LABEL[this.mode] || "NORMAL");
  },
  setMode(id) {
    if (this.view !== "ready" || Net.role !== "host") return;
    if (!COOP_MODES.includes(id) || id === this.mode) return;
    this.mode = id;
    /* a mode change must be re-confirmed: drop the host's own READY so the
       party can't launch with one hand still raised on the old rules */
    this.selfReady = false;
    this._broadcastRoster();
    this._maybeStart();
  },
  toggleReady() {
    if (this.view !== "ready") return;
    this.selfReady = !this.selfReady;
    if (Net.role === "host") this._broadcastRoster();
    else Net.sendR({ t: "lobbyReady", ready: this.selfReady });
    this.renderReady();
    this._maybeStart();
  },
  _msg(m, peer) {
    if (m.t === "lobbyReady") {
      if (Net.role === "host" && peer) { peer.ready = !!m.ready; this._broadcastRoster(); this._maybeStart(); }
    } else if (m.t === "lobbyRoster") {
      if (Net.role === "guest") {
        this.roster = Array.isArray(m.roster) ? m.roster : [];
        this.mode = COOP_MODES.includes(m.mode) ? m.mode : "normal";
        this.renderReady();
      }
    } else if (m.t === "lobbySlot") {
      if (Net.role === "guest" && Number.isInteger(m.idx)) { Net.localIdx = m.idx; this.renderReady(); }
    } else if (m.t === "start" && Net.role === "guest") Coop.beginGuest(m.cfgs, m.mode);
  },
  _maybeStart() {
    /* the HOST fires the descent once every connected hand is raised */
    if (Net.role !== "host" || this.view !== "ready" || !this.selfReady) return;
    if (!Net.peers.length) return;
    const roster = this._buildRoster();
    if (roster.length !== Net.peers.length + 1) return;          // a guest still saying hello
    if (Net.peers.some(p => !p.ready)) return;
    const cfgs = [];
    for (const e of roster) cfgs[e.idx] = e.cfg;
    /* the gate has served its purpose — retire it before the world starts */
    Signal.closeRoom();
    Net.sendR({ t: "start", cfgs, mode: this.mode });
    Coop.beginHost(cfgs, this.mode);
  },
};

$("btnCoop").addEventListener("click", () => Lobby.open());
$("coopHostCard").addEventListener("click", () => { if (Lobby.view === "entry") Lobby.host(); });
$("coopJoinCard").addEventListener("click", () => { if (Lobby.view === "entry") Lobby.join(); });
$("coopReadyBtn").addEventListener("click", () => Lobby.toggleReady());
$("coopBack").addEventListener("click", () => Lobby.close());
for (const b of document.querySelectorAll("#coopModes .coop-mode"))
  b.addEventListener("click", () => Lobby.setMode(b.getAttribute("data-mode")));

/* keypad: the code alphabet + DEL, no <input>, no soft keyboard */
{
  const pad = $("coopPad");
  for (const ch of Signal.ALPHABET) {
    const b = document.createElement("button");
    b.textContent = ch;
    b.addEventListener("click", () => Lobby.key(ch));
    pad.appendChild(b);
  }
  const del = document.createElement("button");
  del.textContent = "⌫ DELETE";
  del.className = "wide";
  del.addEventListener("click", () => Lobby.key("DEL"));
  pad.appendChild(del);
  const clr = document.createElement("button");
  clr.id = "coopPadAlt";
  clr.textContent = "CLEAR";
  clr.className = "wide";
  clr.addEventListener("click", () => {
    if (Lobby.code.length >= Signal.CODE_LEN) { Lobby.tryJoin(); return; }
    Lobby.code = ""; $("coopJoinStatus").textContent = ""; Lobby.renderCode();
  });
  pad.appendChild(clr);
}
