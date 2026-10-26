/* =========================================================
   RUNEGUN · Co-op lobby — host/join flow behind the CO-OP button.
   Host: forge a code, wait. Join: keypad in the code. Connected:
   both wardens shown, both READY, host fires the descent.
   State "lobby" is registered in hud.js OVERLAYS as #coopLobby.
   ========================================================= */
"use strict";

const Lobby = {
  view: "entry",           // entry | host | join | ready
  code: "",                // join view: what's been typed
  selfReady: false, peerReady: false,
  _pingTimer: 0, _connectTimer: 0,

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
    this.view = "entry"; this.code = "";
    this.selfReady = this.peerReady = false;
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
      $("coopCode").textContent = code;
      $("coopHostStatus").textContent = "SPEAK THIS CODE TO YOUR PARTNER — THE GATE HOLDS TEN MINUTES";
      this._watchLink();
    } catch (e) {
      $("coopCode").textContent = "·····";
      $("coopHostStatus").textContent = this._errText(e);
      Net.hangUp();
    }
  },

  /* A host can sit on its code for minutes, and the wait for an answer has no
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
      case "version-mismatch": return "YOUR VERSIONS DIFFER — BOTH PLAYERS UPDATE THE GAME";
      case "firebase-unconfigured": return "CO-OP IS NOT CONFIGURED ON THIS BUILD";
      /* the socket never came up: no signal, a captive portal, or the service
         is at capacity. Nothing the player typed is at fault — say so. */
      case "offline": return "NO CONNECTION TO THE GATEKEEPER — CHECK YOUR SIGNAL AND TRY AGAIN";
      /* the socket was up but the call never came back — almost always the
         service being over capacity or having a bad moment */
      case "signal-timeout": return "THE GATEKEEPER DID NOT ANSWER — TRY AGAIN IN A MOMENT";
      default: return "THE GATE WOULD NOT OPEN — CHECK YOUR CONNECTION";
    }
  },

  /* The gate was found and the answer posted, but no route ever opened. That is
     a NETWORK failure, not a bad code — say so, and say which kind. */
  _routeFailText() {
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
      if (this.view === "join") $("coopJoinStatus").textContent = this._routeFailText();
      else { $("coopHostStatus").textContent = this._routeFailText() + " — PRESS RETURN, THEN HOST AGAIN"; }
    }, 20000);
  },

  /* ---------- CONNECTED / READY ---------- */
  _wireNet() {
    Net.onConnected = () => {
      clearTimeout(this._connectTimer);
      if (Game.state !== "lobby") return;
      this.view = "ready"; this.render();
    };
    Net.onPeerHello = () => { if (Game.state === "lobby") this.renderReady(); };
    Net.onPeerLost = why => {
      if (Game.state !== "lobby") return;
      if (why === "version") { toast("YOUR VERSIONS DIFFER — BOTH PLAYERS UPDATE THE GAME"); this.reset(); return; }
      /* An ICE failure before we ever paired isn't "the partner left" — it's a
         route that never opened. Keep the view (and the typed code) so a retry
         is immediate instead of dumping them back to the start. */
      if (String(why).indexOf("ice") === 0 && this.view !== "ready") {
        clearTimeout(this._connectTimer);
        if (this.view === "join") $("coopJoinStatus").textContent = this._routeFailText();
        else $("coopHostStatus").textContent = this._routeFailText() + " — PRESS RETURN, THEN HOST AGAIN";
        return;
      }
      toast("YOUR PARTNER IS GONE — THE GATE CLOSES");
      this.reset();
    };
    Net.onMessage = m => this._msg(m);
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      if (Game.state === "lobby" && this.view === "ready")
        $("coopPing").textContent = Net.rtt ? "LINK · " + Net.rtt + "ms" : "LINK FORGED";
    }, 1000);
  },

  wardenCard(el, cfg, ready, label) {
    const c = cfg && CHARS[cfg.char];
    el.innerHTML = c
      ? "<div class='cw-glyph' style='color:" + (SKINS[cfg.skin] ? SKINS[cfg.skin].color : "#e8e2d0") + "'>" + (c.glyph || "ᛟ") + "</div>" +
        "<div class='cw-name'>" + c.name + "</div>" +
        "<div class='cw-sub'>" + label + (ready ? " · READY" : "") + "</div>"
      : "<div class='cw-glyph'>…</div><div class='cw-name'>WAITING</div><div class='cw-sub'>" + label + "</div>";
    el.classList.toggle("ready", !!ready);
  },
  renderReady() {
    this.wardenCard($("coopCardSelf"), localPlayerCfg(), this.selfReady, "YOU");
    this.wardenCard($("coopCardPeer"), Net.peerCfg, this.peerReady, "PARTNER");
    $("coopReadyBtn").textContent = this.selfReady ? "READY ✓" : "READY";
    $("coopReadyStatus").textContent =
      this.selfReady && !this.peerReady ? "WAITING ON YOUR PARTNER…" : "";
  },
  toggleReady() {
    if (this.view !== "ready") return;
    this.selfReady = !this.selfReady;
    Net.sendR({ t: "lobbyReady", ready: this.selfReady });
    this.renderReady();
    this._maybeStart();
  },
  _msg(m) {
    if (m.t === "lobbyReady") { this.peerReady = m.ready; this.renderReady(); this._maybeStart(); }
    else if (m.t === "start" && Net.role === "guest") Coop.beginGuest(m.cfgs);
  },
  _maybeStart() {
    /* the HOST fires the descent once both hands are raised */
    if (Net.role !== "host" || !this.selfReady || !this.peerReady) return;
    const cfgs = [localPlayerCfg(), Net.peerCfg];
    Net.sendR({ t: "start", cfgs });
    Coop.beginHost(cfgs);
  },
};

$("btnCoop").addEventListener("click", () => Lobby.open());
$("coopHostCard").addEventListener("click", () => { if (Lobby.view === "entry") Lobby.host(); });
$("coopJoinCard").addEventListener("click", () => { if (Lobby.view === "entry") Lobby.join(); });
$("coopReadyBtn").addEventListener("click", () => Lobby.toggleReady());
$("coopBack").addEventListener("click", () => Lobby.close());

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
