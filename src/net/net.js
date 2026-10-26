/* =========================================================
   RUNEGUN · Net — the co-op session.
   Who this client is (role/localIdx), the WebRTC peer connection and
   its two channels, and the seam the sim reads a partner's input from
   (frameFor). Signaling lives in signal.js; the lobby drives connect().

   Channels:
     "u" — unreliable/unordered: inputs + snapshots (latest-wins)
     "r" — reliable/ordered:     hello, lifecycle events, control
   ========================================================= */
"use strict";

/* 2: packed array wire format + first-sight statics (round-1 playtest fixes).
   Mismatched builds refuse each other with a clear message, so this must be
   bumped whenever the snapshot layout changes. */
const PROTOCOL_VERSION = 2;

const Net = {
  role: "none",          // "none" (solo) | "host" | "guest"
  localIdx: 0,           // index into players[] of the warden THIS screen steers
  get active() { return this.role !== "none"; },

  pc: null, chU: null, chR: null,
  peerCfg: null,         // the partner's { char, skin, gunSkin, pet } from hello
  rtt: 0,
  _lastHeard: 0, _hbTimer: 0, _openCount: 0,

  /* wired by the lobby / game layer */
  onConnected: null,     // both channels open, hello exchanged
  onPeerHello: null,     // partner's cfg arrived (lobby shows their warden)
  onPeerLost: null,      // heartbeat silence / ICE failure / close
  onMessage: null,       // Phase C protocol dispatch — every non-internal msg

  /* debug latency harness (Phase E fills in): { ms, jitter, loss } */
  fakeLag: null,

  /* ---------- connect flows ---------- */
  /* what the last connection attempt actually managed — surfaced in the lobby
     so a failure can say WHY instead of blaming the code */
  iceStats: { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" },

  _newPc() {
    this.iceStats = { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "new", route: "" };
    const pc = new RTCPeerConnection({
      iceServers: iceServers(),
      iceCandidatePoolSize: 2,
    });
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      this.iceStats.state = s;
      if (s === "connected" || s === "completed") this._noteRoute(pc);
      if (s === "failed" || s === "closed") this._lost("ice-" + s);
      /* "disconnected" often self-heals — the heartbeat below is the arbiter */
    };
    return pc;
  },

  /* count our own candidate types as they gather: zero relay candidates means
     the TURN server never answered, which is a very different problem from a
     peer that simply couldn't be reached */
  _noteCandidate(c) {
    this.iceStats.gathered++;
    if (!c || !c.candidate) return;
    if (c.candidate.indexOf(" typ relay") !== -1) this.iceStats.relay++;
    else if (c.candidate.indexOf(" typ srflx") !== -1) this.iceStats.srflx++;
  },
  /* which pair actually won — "relay" here means we're paying for TURN */
  _noteRoute(pc) {
    if (!pc.getStats) return;
    pc.getStats(null).then(report => {
      let pairId = null;
      report.forEach(r => { if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId; });
      report.forEach(r => {
        const isPair = r.type === "candidate-pair" && (r.id === pairId || (!pairId && r.selected));
        if (!isPair) return;
        const local = report.get && report.get(r.localCandidateId);
        if (local) this.iceStats.route = local.candidateType || "";
      });
    }).catch(() => {});
  },

  /* =========================================================
     ICE PLUMBING — two ordering hazards, both of which silently LOSE
     candidates, and a pair that has lost its candidates simply never meets.

     1. OUTBOUND. Gathering starts the instant setLocalDescription() resolves,
        but the room to publish into does not exist until Firebase answers —
        hundreds of milliseconds on mobile. Candidates emitted in that window
        hit no handler at all and vanished. Host-type (local network) candidates
        are the very first to arrive, so the pair that should connect fastest
        was reliably the one thrown away.
     2. INBOUND. addIceCandidate() is only legal once a REMOTE description
        exists. The host has none until the answer arrives, so every guest
        candidate that beat the answer was swallowed by the .catch().

     Both directions are now buffered and flushed instead of dropped.
     ========================================================= */
  _iceOut: [], _iceIn: [], _iceSide: "host", _iceCanSend: false, _iceCanAdd: false,

  _resetIce(side) {
    this._iceOut = []; this._iceIn = [];
    this._iceSide = side; this._iceCanSend = false; this._iceCanAdd = false;
  },
  /* attach BEFORE setLocalDescription — that is the whole point */
  _wireLocalIce(pc) {
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      this._noteCandidate(e.candidate);
      const c = e.candidate.toJSON();
      if (this._iceCanSend) { try { Signal.pushCandidate(this._iceSide, c); } catch (err) {} }
      else this._iceOut.push(c);
    };
  },
  _iceSendReady() {
    this._iceCanSend = true;
    /* every one of these gathered before the room existed — the old code had no
       handler attached yet and dropped them all. Counted because it is the
       difference between a pair that meets and one that times out. */
    this.iceStats.rescued += this._iceOut.length;
    for (const c of this._iceOut) { try { Signal.pushCandidate(this._iceSide, c); } catch (e) {} }
    this._iceOut = [];
  },
  _addRemoteIce(pc, c) {
    if (this._iceCanAdd) pc.addIceCandidate(c).catch(() => {});
    else this._iceIn.push(c);
  },
  _iceAddReady(pc) {
    this._iceCanAdd = true;
    this.iceStats.rescued += this._iceIn.length;   // ...same, for the peer's side
    for (const c of this._iceIn) pc.addIceCandidate(c).catch(() => {});
    this._iceIn = [];
  },

  /* HOST: create channels + offer, claim a room code. Resolves with the code
     as soon as the room exists; the connection completes in the background. */
  async host() {
    this.role = "host"; this.localIdx = 0;
    this._resetIce("host");
    const pc = this.pc = this._newPc();
    this._wire(pc.createDataChannel("u", { ordered: false, maxRetransmits: 0 }), "u");
    this._wire(pc.createDataChannel("r"), "r");
    this._wireLocalIce(pc);                  // armed before gathering can start
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const code = await Signal.createRoom(offer.sdp);
    this._iceSendReady();                    // room exists — flush everything gathered meanwhile
    Signal.onCandidates("guest", c => this._addRemoteIce(pc, c));
    Signal.waitForAnswer().then(sdp =>
      pc.setRemoteDescription({ type: "answer", sdp })
        .then(() => this._iceAddReady(pc))   // only NOW may their candidates be added
        .catch(() => this._lost("answer-bad")));
    return code;
  },

  /* GUEST: fetch the offer for a code and answer it. */
  async join(code) {
    this.role = "guest"; this.localIdx = 1;
    this._resetIce("guest");
    const offerSdp = await Signal.fetchOffer(code);
    const pc = this.pc = this._newPc();
    pc.ondatachannel = e => this._wire(e.channel, e.channel.label);
    this._wireLocalIce(pc);
    /* the room already exists (the host made it) and fetchOffer has just given
       us its code, so our candidates can go out the moment they are gathered —
       no need to wait on postAnswer */
    this._iceSendReady();
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    this._iceAddReady(pc);                   // remote description in hand from the start
    Signal.onCandidates("host", c => this._addRemoteIce(pc, c));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await Signal.postAnswer(answer.sdp);
  },

  _wire(ch, label) {
    if (label === "u") this.chU = ch; else this.chR = ch;
    ch.onmessage = ev => this._recv(ev.data);
    ch.onopen = () => {
      this._openCount++;
      if (this._openCount >= 2) this._onOpen();
    };
    ch.onclose = () => { if (this.active) this._lost("channel-closed"); };
  },

  _onOpen() {
    Signal.cleanup(true);                       // the mailbox has served its purpose
    /* the peers are talking directly now — hand the database connection back
       rather than holding one of the plan's 100 for the whole app session
       (deferred so the room delete queued above actually flushes) */
    Signal.releaseSoon();
    this._lastHeard = performance.now();
    this.sendR({ t: "hello", v: PROTOCOL_VERSION, cfg: localPlayerCfg() });
    this._hbTimer = setInterval(() => this._heartbeat(), 2000);
    if (this.onConnected) this.onConnected();
  },

  _heartbeat() {
    this.sendU({ t: "ping", ts: performance.now() });
    if (performance.now() - this._lastHeard > 8000) this._lost("silence");
  },

  /* ---------- send / receive ---------- */
  _send(ch, obj) {
    if (!ch || ch.readyState !== "open") return;
    const data = JSON.stringify(obj);
    const L = this.fakeLag;
    if (L && ch === this.chU && Math.random() < (L.loss || 0)) return;
    if (L) setTimeout(() => { try { ch.send(data); } catch (e) {} }, L.ms + Math.random() * (L.jitter || 0));
    else { try { ch.send(data); } catch (e) {} }
  },
  sendU(obj) { this._send(this.chU, obj); },
  sendR(obj) { this._send(this.chR, obj); },

  _recv(data) {
    this._lastHeard = performance.now();
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    switch (m.t) {
      case "ping": this.sendU({ t: "pong", ts: m.ts }); return;
      case "pong": this.rtt = Math.round(performance.now() - m.ts); return;
      case "hello":
        if (m.v !== PROTOCOL_VERSION) {
          this.sendR({ t: "err", code: "version" });
          this.hangUp();
          if (this.onPeerLost) this.onPeerLost("version");
          return;
        }
        this.peerCfg = m.cfg;
        if (this.onPeerHello) this.onPeerHello(m.cfg);
        return;
      case "err":
        this.hangUp();
        if (this.onPeerLost) this.onPeerLost(m.code || "peer-error");
        return;
    }
    if (this.onMessage) this.onMessage(m);
  },

  /* ---------- teardown ---------- */
  hangUp() {
    clearInterval(this._hbTimer); this._hbTimer = 0;
    Signal.cleanup(true);
    try { if (this.chU) this.chU.close(); } catch (e) {}
    try { if (this.chR) this.chR.close(); } catch (e) {}
    try { if (this.pc) this.pc.close(); } catch (e) {}
    this.pc = this.chU = this.chR = null;
    this._openCount = 0; this.peerCfg = null; this.rtt = 0;
    this._resetIce("host");     // a retry must not inherit the dead attempt's candidates
    this.role = "none"; this.localIdx = 0;
  },
  _lost(why) {
    if (!this.active) return;
    const cb = this.onPeerLost;
    this.hangUp();
    if (cb) cb(why);
  },

  /* the input frame steering warden `p` this tick when p is not local.
     Phase C feeds the guest's wire input here; DEV_P2 is the couch harness. */
  frameFor(p) {
    if (DEV_P2) return devP2Frame(p);
    return null;   // update() substitutes a zero frame
  },
};

/* =========================================================
   DEV_P2 — couch-test harness (web build only).
   Flip to true (with PC_MODE = true in input.js) and resetRun gains a
   second warden steered by IJKL + ; (dash) + ' (use), auto-aiming.
   Exists purely to exercise every per-player code path with no network.
   ========================================================= */
const DEV_P2 = false;
const DEV_P2_CFG = { char: "gunsmith", skin: "toxin", pet: null, rerollBuff: 0 };
let devP2Dash = false, devP2Use = false;
if (DEV_P2) {
  window.addEventListener("keydown", e => {
    if (e.code === "Semicolon") devP2Dash = true;
    if (e.code === "Quote") devP2Use = true;
  });
}
function devP2Frame() {
  const k = Input.keys;
  let mx = (k.KeyL ? 1 : 0) - (k.KeyJ ? 1 : 0);
  let my = (k.KeyK ? 1 : 0) - (k.KeyI ? 1 : 0);
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  const f = { mx, my, aimX: 0, aimY: 0, aiming: false, mouseX: undefined, mouseY: undefined,
    mouseDown: false, touchMode: true, aimMode: "auto", deskMode: "auto",
    dashTap: devP2Dash, useTap: devP2Use };
  devP2Dash = devP2Use = false;
  return f;
}
