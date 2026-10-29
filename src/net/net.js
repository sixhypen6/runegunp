/* =========================================================
   RUNEGUN · Net — the co-op session.
   Who this client is (role/localIdx), one WebRTC peer connection per
   partner (up to MAX_GUESTS guests on a star around the host), and the
   seam the sim reads a partner's input from (frameFor).
   Signaling lives in signal.js; the lobby drives connect().

   Channels (one pair per peer):
     "u" — unreliable/unordered: inputs + snapshots (latest-wins)
     "r" — reliable/ordered:     hello, lifecycle events, control

   A guest holds exactly one peer (the host, idx 0). A host holds one
   peer per connected guest; peer.idx is that guest's seat in players[].
   ========================================================= */
"use strict";

/* 2: packed array wire format + first-sight statics (round-1 playtest fixes).
   3: the shared descent's mode rides start/retry and the lobby's mode messages.
   4: rooms hold up to four wardens; per-peer hello/slot/ready messages and the
      party-scaled rules both sides agree on.
   Mismatched builds refuse each other with a clear message, so this must be
   bumped whenever the snapshot layout OR the rules a party agrees on change. */
const PROTOCOL_VERSION = 4;
const MAX_WARDENS = 4;                 // host + three guests
const MAX_GUESTS = MAX_WARDENS - 1;

const Net = {
  role: "none",          // "none" (solo) | "host" | "guest"
  localIdx: 0,           // index into players[] of the warden THIS screen steers
  get active() { return this.role !== "none"; },

  peers: [],             // [{ id, idx, pc, chU, chR, cfg, rtt, lastHeard, opened, ice }]
  peerCfg: null,         // convenience: first partner's cfg (the host's, when guest)
  rtt: 0,                // worst link in the party — what the lobby shows
  _hbTimer: 0,

  /* wired by the lobby / game layer */
  onConnected: null,     // (peer) both channels open, hello sent
  onPeerHello: null,     // (cfg, peer) that partner's cfg arrived
  onPeerLost: null,      // (why, peer) heartbeat silence / ICE failure / close / refused join
  onMessage: null,       // (msg, peer) every non-internal message

  /* debug latency harness: { ms, jitter, loss } */
  fakeLag: null,

  /* what the last connection attempt actually managed — surfaced in the lobby
     so a failure can say WHY instead of blaming the code */
  iceStats: { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" },

  peerByIdx(idx) { return this.peers.find(p => p.idx === idx) || null; },
  peerById(id) { return this.peers.find(p => p.id === id) || null; },

  _newPeer(id, idx) {
    return {
      id, idx, pc: null, chU: null, chR: null, cfg: null, rtt: 0,
      lastHeard: performance.now(), opened: 0, acceptTimer: 0,
      ice: { out: [], inn: [], canSend: false, canAdd: false },
    };
  },
  _nextIdx() {
    for (let i = 1; i <= MAX_GUESTS; i++) if (!this.peerByIdx(i)) return i;
    return MAX_GUESTS;
  },

  /* ---------- connect flows ---------- */
  _newPc(peer) {
    const pc = new RTCPeerConnection({
      iceServers: iceServers(),
      iceCandidatePoolSize: 2,
    });
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      this.iceStats.state = s;
      if (s === "connected" || s === "completed") this._noteRoute(pc);
      if (s === "failed" || s === "closed") this._drop(peer, "ice-" + s);
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
        hit no handler at all and vanished.
     2. INBOUND. addIceCandidate() is only legal once a REMOTE description
        exists. The host has none until the answer arrives, so every guest
        candidate that beat the answer was swallowed.

     Both directions are now buffered per peer and flushed instead of dropped.
     ========================================================= */
  _wireLocalIce(peer) {
    peer.ice.out = []; peer.ice.canSend = false;
    peer.pc.onicecandidate = e => {
      if (!e.candidate) return;
      this._noteCandidate(e.candidate);
      const c = e.candidate.toJSON();
      if (peer.ice.canSend) { try { Signal.pushCandidate(peer.id, this.role, c); } catch (err) {} }
      else peer.ice.out.push(c);
    };
  },
  _iceSendReady(peer) {
    peer.ice.canSend = true;
    this.iceStats.rescued += peer.ice.out.length;
    for (const c of peer.ice.out) { try { Signal.pushCandidate(peer.id, this.role, c); } catch (e) {} }
    peer.ice.out = [];
  },
  _addRemoteIce(peer, c) {
    if (peer.ice.canAdd && peer.pc) peer.pc.addIceCandidate(c).catch(() => {});
    else peer.ice.inn.push(c);
  },
  _iceAddReady(peer) {
    peer.ice.canAdd = true;
    this.iceStats.rescued += peer.ice.inn.length;   // ...same, for the peer's side
    for (const c of peer.ice.inn) peer.pc.addIceCandidate(c).catch(() => {});
    peer.ice.inn = [];
  },

  /* HOST: claim a room code and answer every guest that knocks with its own
     offer. Resolves with the code as soon as the room exists; guests connect
     in the background, one peer record each. */
  async host() {
    this.role = "host"; this.localIdx = 0;
    this.peers = [];
    this.iceStats = { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" };
    const code = await Signal.createRoom();
    Signal.watchJoins(jid => { this._acceptJoin(jid).catch(() => {}); });
    return code;
  },

  async _acceptJoin(jid) {
    if (this.role !== "host" || this.peerById(jid)) return;
    if (this.peers.length >= MAX_GUESTS) { Signal.rejectJoin(jid, "full"); return; }
    const peer = this._newPeer(jid, this._nextIdx());
    this.peers.push(peer);
    /* a join that never opens a channel must not hold a seat forever */
    peer.acceptTimer = setTimeout(() => { if (!peer.opened) this._drop(peer, "join-timeout"); }, 25000);
    try {
      const pc = peer.pc = this._newPc(peer);
      this._wire(pc.createDataChannel("u", { ordered: false, maxRetransmits: 0 }), "u", peer);
      this._wire(pc.createDataChannel("r"), "r", peer);
      this._wireLocalIce(peer);                  // armed before gathering can start
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await Signal.postOffer(jid, offer.sdp);
      this._iceSendReady(peer);                  // peer node exists — flush everything gathered
      Signal.onCandidates(jid, "guest", c => this._addRemoteIce(peer, c));
      Signal.waitForAnswer(jid).then(sdp =>
        pc.setRemoteDescription({ type: "answer", sdp })
          .then(() => this._iceAddReady(peer))   // only NOW may their candidates be added
          .catch(() => this._drop(peer, "answer-bad")));
    } catch (e) {
      this._drop(peer, "offer-bad");
    }
  },

  /* GUEST: ask to join a code. The host answers with an offer; the answer and
     the peer connection follow. */
  async join(code) {
    this.role = "guest"; this.localIdx = 1;
    this.peers = [];
    this.iceStats = { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" };
    const jid = await Signal.joinRoom(code);
    const peer = this._newPeer(jid, 0);
    this.peers = [peer];
    Signal.onCandidates(jid, "host", c => this._addRemoteIce(peer, c));
    Signal.watchOffer(jid,
      sdp => this._acceptOffer(peer, sdp).catch(() => this._drop(peer, "answer-bad")),
      reason => this._drop(peer, reason === "full" ? "room-full" : "room-closed"));
  },

  async _acceptOffer(peer, sdp) {
    const pc = peer.pc = this._newPc(peer);
    pc.ondatachannel = e => this._wire(e.channel, e.channel.label, peer);
    this._wireLocalIce(peer);
    await pc.setRemoteDescription({ type: "offer", sdp });
    this._iceAddReady(peer);                     // remote description in hand from the start
    this._iceSendReady(peer);                    // the room already exists — send at once
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await Signal.postAnswer(peer.id, answer.sdp);
  },

  _wire(ch, label, peer) {
    if (label === "u") peer.chU = ch; else peer.chR = ch;
    ch.onmessage = ev => this._recv(ev.data, peer);
    ch.onopen = () => {
      peer.opened++;
      if (peer.opened >= 2) this._onOpen(peer);
    };
    ch.onclose = () => this._drop(peer, "channel-closed");
  },

  _onOpen(peer) {
    clearTimeout(peer.acceptTimer); peer.acceptTimer = 0;
    peer.lastHeard = performance.now();
    /* the gate stays open while the lobby fills — the room is only retired when
       the host fires the descent (Signal.closeRoom) or leaves */
    this._startHeartbeat();
    this.sendRTo(peer, { t: "hello", v: PROTOCOL_VERSION, cfg: localPlayerCfg() });
    if (this.onConnected) this.onConnected(peer);
  },

  _startHeartbeat() {
    if (this._hbTimer) return;
    this._hbTimer = setInterval(() => this._heartbeat(), 2000);
  },
  _heartbeat() {
    const now = performance.now();
    let worst = 0;
    for (const peer of this.peers.slice()) {
      if (!peer.chU || peer.chU.readyState !== "open") continue;
      this.sendUTo(peer, { t: "ping", ts: now });
      if (now - peer.lastHeard > 8000) { this._drop(peer, "silence"); continue; }
      if (peer.rtt > worst) worst = peer.rtt;
    }
    this.rtt = worst;
  },

  /* ---------- send / receive ---------- */
  _sendData(ch, data) {
    if (!ch || ch.readyState !== "open") return;
    const L = this.fakeLag;
    if (L && this.peers.some(p => p.chU === ch) && Math.random() < (L.loss || 0)) return;
    if (L) setTimeout(() => { try { ch.send(data); } catch (e) {} }, L.ms + Math.random() * (L.jitter || 0));
    else { try { ch.send(data); } catch (e) {} }
  },
  _broadcast(key, obj) {
    if (!this.peers.length) return;
    const data = JSON.stringify(obj);
    for (const peer of this.peers) if (peer[key] && peer[key].readyState === "open") this._sendData(peer[key], data);
  },
  sendU(obj) { this._broadcast("chU", obj); },
  sendR(obj) { this._broadcast("chR", obj); },
  sendUTo(peer, obj) { if (peer) this._sendData(peer.chU, JSON.stringify(obj)); },
  sendRTo(peer, obj) { if (peer) this._sendData(peer.chR, JSON.stringify(obj)); },

  _recv(data, peer) {
    peer.lastHeard = performance.now();
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    switch (m.t) {
      case "ping": this.sendUTo(peer, { t: "pong", ts: m.ts }); return;
      case "pong":
        peer.rtt = Math.round(performance.now() - m.ts);
        if (peer.rtt > this.rtt) this.rtt = peer.rtt;
        return;
      case "hello":
        if (m.v !== PROTOCOL_VERSION) {
          this.sendRTo(peer, { t: "err", code: "version" });
          this._drop(peer, "version");
          return;
        }
        peer.cfg = m.cfg;
        if (!this.peerCfg) this.peerCfg = m.cfg;
        if (this.onPeerHello) this.onPeerHello(m.cfg, peer);
        return;
      case "err":
        this._drop(peer, m.code || "peer-error");
        return;
    }
    if (this.onMessage) this.onMessage(m, peer);
  },

  /* ---------- teardown ---------- */
  _closePeer(peer) {
    clearTimeout(peer.acceptTimer); peer.acceptTimer = 0;
    try { if (peer.chU) peer.chU.close(); } catch (e) {}
    try { if (peer.chR) peer.chR.close(); } catch (e) {}
    try { if (peer.pc) peer.pc.close(); } catch (e) {}
    peer.pc = peer.chU = peer.chR = null;
  },
  /* One partner is gone. The rest of the party keeps its links. */
  _drop(peer, why) {
    const i = this.peers.indexOf(peer);
    if (i === -1) return;
    this.peers.splice(i, 1);
    this._closePeer(peer);
    if (!this.peers.length) { clearInterval(this._hbTimer); this._hbTimer = 0; this.rtt = 0; }
    this.peerCfg = this.peers.length ? this.peers[0].cfg : null;
    const cb = this.onPeerLost;
    if (cb) cb(why, peer);
  },

  hangUp() {
    clearInterval(this._hbTimer); this._hbTimer = 0;
    for (const peer of this.peers.slice()) this._closePeer(peer);
    this.peers = [];
    Signal.cleanup(true);
    Signal.releaseSoon();
    this.peerCfg = null; this.rtt = 0;
    this.role = "none"; this.localIdx = 0;
  },

  /* host only: compact seats after a lobby departure so every connected guest
     still lines up with players[] before the descent starts */
  renumber() {
    if (this.role !== "host") return;
    let i = 1;
    for (const peer of this.peers) peer.idx = i++;
  },

  /* the input frame steering warden `p` this tick when p is not local.
     Phase C feeds each guest's wire input here; DEV_P2 is the couch harness. */
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
