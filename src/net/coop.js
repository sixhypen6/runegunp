/* =========================================================
   RUNEGUN · Coop — the host/guest game orchestration.
   HOST: runs the real update(), ships snapshots ~15Hz + lifecycle
   events, synthesizes the guest warden's input frames from the wire.
   GUEST: updateGuest() — applies snapshots with a small interpolation
   buffer, predicts its own warden's movement + gunfire cosmetically,
   and runs a visual-only world tick (bullets, particles, juice).
   ========================================================= */
"use strict";

/* 12Hz is deliberately LOWER than the original 15: with the dead-reckoning
   below, motion is continuous between packets, so a lower rate looks better
   than the old higher one did while costing a fifth less traffic. */
const SNAP_HZ = 12, INPUT_HZ = 30;
/* how hard the rendered position chases its authoritative target. Framerate
   independent: the fraction of remaining error closed per second. */
const CHASE = 0.0001;

/* The shared descent is floors I–V (loopLen in floors.js): the saloon, the deep
   floors and THE UNKNOWN have no guest-side sync yet. These are the rules a pair
   may lay over that lap — chosen by the host in the lobby. */
const COOP_MODES = ["normal", "hard", "classic", "classicloop", "chaos"];
const COOP_MODE_LABEL = {
  normal: "NORMAL", hard: "HARD", classic: "CLASSIC", classicloop: "CLASSIC LOOP", chaos: "CHAOS",
};
const COOP_MODE_DESC = {
  normal: "The catacomb as it hungers. The lap returns and returns.",
  hard: "Half again the vitality in every horror and warden.",
  classic: "The old descent: the run ends when THE EVENT HORIZON falls.",
  classicloop: "The old descent's rune rules, but the lap never ends.",
  chaos: "No seal on either gun. Every rune answers — and kills leave orbs.",
};

/* Rune pause policy — the largest party that still freezes the run for a pick.
   0 = never pause · 2 = only pairs pause · 4 = every party pauses (default).
   The SETTINGS toggle (Meta.runePause, "PAUSE FOR RUNE PICKS") is the real
   switch; this constant is the tuning ceiling above which a big party never
   freezes even with the toggle on. The HOST owns the answer in a shared run
   and passes it in the start message, so host and guests can never disagree. */
window.RUNE_PAUSE_MAX_PLAYERS = 4;

function coopPartySize() {
  if (typeof players === "undefined" || !players || !players.length) return 1;
  const n = players.filter(p => !p.gone).length;
  return n || 1;
}

function runePauseFor(party) {
  /* the player's own setting ("PAUSE FOR RUNE PICKS" in SETTINGS) */
  if (typeof Meta !== "undefined" && Meta.runePause === false) return false;
  return (party || 1) <= window.RUNE_PAUSE_MAX_PLAYERS;
}

function shouldPauseForRune() {
  /* guest: obey the host's choice for this descent */
  if (typeof Net !== "undefined" && Net.active && Net.role === "guest" &&
      typeof Coop !== "undefined" && Coop.runePause != null)
    return !!Coop.runePause;
  return runePauseFor(coopPartySize());
}

const Coop = {
  running: false,
  _snapT: 0, _inputT: 0,
  _buf: [],                          // guest: snapshot buffer (newest last)
  _inputs: new Map(),                // host: player idx -> { m, at } (one per guest)
  _taps: new Map(),                  // host: player idx -> consumed tap counters
  _floorReady: false,
  _prevWave: 0,

  /* ---------------- lifecycle ---------------- */
  /* Lay this descent's mode over the run. Both sides call it, so the rules that
     read Game.hardMode / classicMode / chaosMode agree on every client. */
  applyMode(mode) {
    const m = COOP_MODES.includes(mode) ? mode : "normal";
    this.mode = m;
    Game.hardMode = m === "hard";
    Game.classicMode = m === "classic" || m === "classicloop";
    Game.classicLoop = m === "classicloop";
    Game.chaosMode = m === "chaos";
    Game.challenge = null;              // challenges are a solo CHAOS concern
    Game.coopVictory = false;
  },
  /* the host's rune-pause answer for THIS descent — also sent with `start` so
     every guest freezes or keeps fighting exactly when the host does */
  pausePolicy(party) {
    this.runePause = runePauseFor(party || coopPartySize());
    return this.runePause;
  },
  beginHost(cfgs, mode) {
    this.cfgs = cfgs;                   // kept so DESCEND AGAIN can rebuild the same party
    this._start("host");
    this.applyMode(mode);
    /* seats with no live peer do not count toward the pause ceiling */
    const live = cfgs.filter((c, i) => i === 0 || !!Net.peerByIdx(i)).length || 1;
    this.runePause = runePauseFor(live);
    resetRun(cfgs);
    this._markAbsent();
    updateHp();                          // absent seats get no partner bar
    Game.riftOffered = true;              // no rift in co-op
    setState("play");
    this.sendFloor();
    toast("YOU DESCEND TOGETHER" + (this.mode !== "normal" ? " — " + COOP_MODE_LABEL[this.mode] : ""));
    AudioFX.portal();
  },
  beginGuest(cfgs, mode, runePause) {
    this.cfgs = cfgs;
    this._start("guest");
    this.applyMode(mode);
    /* the host's policy rides in the start message; a host from an older build
       sends nothing, so fall back to this client's own setting */
    this.runePause = typeof runePause === "boolean" ? runePause : null;
    resetRun(cfgs);
    Game.riftOffered = true;
    this._floorReady = false;
    setState("wait");
    $("waitTitle").textContent = "CROSSING OVER…";
  },
  _start(role) {
    this.running = true;
    this._buf = []; this._inputs.clear(); this._taps.clear();
    this._snapT = 0; this._inputT = 0;
    this._dashN = 0; this._useN = 0; this._recallN = 0;   // guest outgoing counters
    this._prevWave = 0;
    this._stateN = 0;      // newest host-state packet acted on (see _stale)
    Net.onMessage = (m, peer) => this._onMsg(m, peer);
    Net.onPeerLost = (why, peer) => this._peerLost(why, peer);
    Protocol._snapN = 0; Protocol._fx = [];
    this._resetRetryBtn();
    /* reset any stale per-player rune choices from a previous descent */
    if (Game.pendingPickups) Game.pendingPickups.length = 0;
    else Game.pendingPickups = [];
    Game.pendingPickup = null; Game.pendingPickupBy = 0;
    if (typeof hideRuneOverlay === "function") hideRuneOverlay();
  },

  /* A seat with no live peer (a leaver on DESCEND AGAIN, or a host that
     started before the gate filled) slumps and stops drawing aggro, but keeps
     its array index so every other seat stays aligned. */
  _markAbsent() {
    if (Net.role !== "host") return;
    for (const p of players) {
      if (p.idx === 0) continue;
      if (!Net.peerByIdx(p.idx)) { p.gone = true; p.downed = true; p.hp = 0; }
    }
  },
  _peerByIdx(idx) {
    return Net.peers.find(p => p.idx === idx);
  },
  /* may this warden answer a rune hand right now? Pause mode: only the one the
     host froze on. No-pause mode: whoever holds an open entry. */
  _canPick(idx) {
    if (typeof idx !== "number") return false;
    if (shouldPauseForRune()) return idx === Game.pendingPickupBy && !!Game.pendingPickup;
    return Game.pendingPickups.some(e => e.by === idx);
  },
  end() {
    this.running = false;
    Net.hangUp();
  },

  /* Both wardens fell. The run is over but the LINK is not — DESCEND AGAIN
     rebuilds the same pair rather than dropping whoever pressed it into a solo
     run. The host owns the reset; the guest asks for one and waits.
     Returns false if the link is already gone, so the caller falls back to solo. */
  retry() {
    if (Net.role === "host") {
      const runePause = this.pausePolicy();
      Net.sendR({ t: "start", cfgs: this.cfgs, mode: this.mode, runePause });
      this.beginHost(this.cfgs, this.mode);
      return true;
    }
    if (Net.role === "guest") {
      Net.sendR({ t: "retryReq" });
      const b = $("btnRetry");
      if (b) { b.textContent = "WAITING FOR THE HOST…"; b.disabled = true; }
      return true;
    }
    return false;
  },
  /* CLASSIC: THE EVENT HORIZON is the last warden of the shared descent. The run
     is over but the link is not — DESCEND AGAIN starts the pair again. */
  finish() {
    Game.coopVictory = true;
    if (typeof RunTimer !== "undefined") RunTimer.finish();
    if (Net.role === "host" && this.running) Net.sendR({ t: "victory" });
    doGameOver();
  },
  _resetRetryBtn() {
    const b = $("btnRetry");
    if (b) { b.textContent = "DESCEND AGAIN"; b.disabled = false; }
  },

  /* ---------------- HOST side ---------------- */
  hostTick(dt) {
    if (!this.running || Net.role !== "host") return;
    this._runeWatchdog(dt);
    this._snapT -= dt;
    if (this._snapT > 0) return;
    /* A frozen world has no state worth streaming, but the guest still needs to
       know WHY it's frozen — so send a two-field beacon instead of a snapshot.
       That keeps the mirroring (and the guest's deadlock detector) alive for a
       fraction of the bytes. */
    if (Game.state !== "play") {
      this._snapT = 1 / 3;
      /* the beacon shares the snapshot counter: both carry the host's state, so
         both must be orderable against each other on arrival (see `case "st"`) */
      const beacon = { t: "st", n: ++Protocol._snapN, state: Game.state };
      /* a frozen host waiting on a rune tells the party WHOSE hand it waits on,
         so only that warden re-asks for the offer while the rest just watch */
      if (shouldPauseForRune()) beacon.picker = Game.pendingPickupBy;
      Net.sendU(beacon);
      return;
    }
    this._snapT = 1 / SNAP_HZ;
    Net.sendU(Protocol.encodeSnapshot());
  },

  /* a guest warden's input frame, synthesized from that peer's last wire msg */
  guestFrame(idx) {
    const rec = this._inputs.get(idx);
    const m = rec && rec.m;
    const stale = !m || performance.now() - rec.at > 250;
    let taps = this._taps.get(idx);
    if (!taps) { taps = { dash: 0, use: 0, recall: 0 }; this._taps.set(idx, taps); }
    const f = zeroFrame();
    if (m && !stale) {
      f.mx = m.mx; f.my = m.my;
      f.aiming = !!m.fire;
      f.aimX = Math.cos(m.aim); f.aimY = Math.sin(m.aim);
      f.aimMode = "manual";
      if (m.dashN > taps.dash) { f.dashTap = true; taps.dash = m.dashN; }
      if (m.useN > taps.use) { f.useTap = true; taps.use = m.useN; }
      if (m.recallN > taps.recall) { f.recallTap = true; taps.recall = m.recallN; }
    } else if (m) {
      /* stale link: stand still but keep the last aim */
      f.aimX = Math.cos(m.aim); f.aimY = Math.sin(m.aim);
    }
    return f;
  },

  sendFloor() {
    /* the guest wipes its world on a floor change, so every entity it meets
       next is new to it — the static-head ledger has to start over */
    Protocol.resetSeen();
    Net.sendR({
      t: "floor", mapIdx: Game.mapIdx, loop: Game.loop, seal: SEAL.state,
      chestsTotal: Game.chestsTotal, chestsOpened: Game.chestsOpened,
      rocks: MAP.rocks.map(rc => ({ id: rc.id, x: rc.x, y: rc.y, w: rc.w, h: rc.h, tone: rc.tone, boss: !!rc.boss })),
      chests: chests.map(c => ({ id: c.id, x: c.x, y: c.y, state: c.state })),
      hbs: healthBoxes.map(h => ({ id: h.id, x: h.x, y: h.y, state: h.state })),
      haz: puddles.map(pu => { if (!pu.id) assignId(pu); return { id: pu.id, x: pu.x, y: pu.y, r: pu.r,
        life: pu.life === Infinity ? -1 : pu.life, dmg: pu.dmg, color: pu.color, lava: !!pu.lava, water: !!pu.water }; }),
      runes: players.map(p => p.runes),
      rerolls: players.map(p => p.rerolls),
      px: players.map(p => [p.x, p.y]),
    });
  },

  /* The saloon is a stage change, not a floor: same mapIdx, different room. The
     guest wipes its world and rebuilds the barkeep/regulars from these rocks,
     then follows the live state in snapshots (`sal`). */
  sendSaloon() {
    const S = Game.saloon;
    if (!this.running || Net.role !== "host" || !S) return;
    Protocol.resetSeen();
    Net.sendR({
      t: "saloon", mapIdx: Game.mapIdx, loop: Game.loop,
      hello: S.hello,
      rocks: MAP.rocks.map(rc => {
        const o = { id: rc.id, x: rc.x, y: rc.y, w: rc.w, h: rc.h, tone: rc.tone, boss: !!rc.boss };
        if (rc.sal) o.sal = rc.sal;
        return o;
      }),
      portal: portal ? { x: portal.x, y: portal.y, t: portal.t } : null,
      runes: players.map(p => p.runes),
      rerolls: players.map(p => p.rerolls),
      px: players.map(p => [p.x, p.y]),
      downed: players.map(p => !!p.downed),
    });
  },

  /* The console edits runes / the warden mid-descent, and snapshots do not
     carry either. The host sends this once after an edit so the guest's book
     (and its body) matches the world the host is actually simulating. */
  resyncEdit() {
    if (!this.running || Net.role !== "host") return;
    Net.sendR({ t: "edit", pl: players.map(p => ({
      char: p.char, skin: p.skin, gunSkin: p.gunSkin, pet: p.pet,
      runes: p.runes, lockedRunes: p.lockedRunes,
      hp: p.hp, maxHp: p.maxHp, rerolls: p.rerolls,
      bonusRuneSlots: p.bonusRuneSlots || 0, dashDur: p.dashDur,
    })) });
  },

  /* ---------------- GUEST side ---------------- */
  updateGuest(dt) {
    if (!this.running) return;
    Game.time += dt;
    this._drainSnapshots();
    const self = localPlayer();
    if (!self) return;
    const f = localInputFrame();
    if (f.dashTap) this._dashN++;
    if (f.useTap) this._useN++;
    if (f.recallTap) this._recallN++;
    this._sendInput(f, dt);
    if (Game.state !== "play" || !this._floorReady) return;

    /* own warden: full movement + cosmetic gunfire prediction */
    f.dashTap = f.dashTap && self.dashCd <= 0;   // mirror the host's gate for feel
    updatePlayer(self, f, dt);
    this._guestHints(self, f);
    this._cosmeticWorld(dt);

    /* camera + juice decay — same feel as the host loop */
    const camP = localPlayer();
    /* a few glasses in, the camera won't hold still (scenes/saloon.js) */
    const sway = typeof drunkSway === "function" ? drunkSway() : { x: 0, y: 0 };
    Game.cam.x = lerp(Game.cam.x, clamp(camP.x - VW / 2 + sway.x, 0, MAP.w - VW), 1 - Math.pow(0.001, dt));
    Game.cam.y = lerp(Game.cam.y, clamp(camP.y - VH / 2 + sway.y, 0, MAP.h - VH), 1 - Math.pow(0.001, dt));
    Game.shake = Math.max(0, Game.shake - dt * 30);
    Game.flash = Math.max(0, Game.flash - dt);
    if (Game.flash === 0) Game.flashCol = null;
    Game.floorFade = Math.max(0, Game.floorFade - dt / 1.1);
  },

  _drainSnapshots() {
    if (!this._buf.length) return;
    /* render INTERP_DELAY behind the newest snapshot; blend by frame gap */
    const newest = this._buf[this._buf.length - 1];
    /* only the newest matters: it carries absolute state, and the reckoning
       above keeps motion continuous between arrivals */
    while (this._buf.length > 2) this._buf.shift();
    const prevHp = localPlayer() ? localPlayer().hp : 0;
    const prevWave = Game.wave;
    const prevDowned = players.map(p => !!p.downed);
    Protocol.applySnapshot(newest, 0.35);
    this._buf.length = 0;
    this._applyHostState(newest.g.state);
    /* ouch feedback: authoritative hp fell → flash + shake like a local hit */
    const self = localPlayer();
    if (self && self.hp < prevHp - 0.5) {
      screenFlash(0.25); Game.shake = Math.max(Game.shake, 8); AudioFX.hurt(); haptic(40);
    }
    /* downed banners, from each client's OWN perspective */
    for (let i = 0; i < players.length; i++) {
      if (players[i].downed && !prevDowned[i]) {
        toast(i === Net.localIdx ? "YOU ARE DOWN — A PARTNER CAN LIFT YOU"
                                 : "A WARDEN IS DOWN — REACH THEM");
        screenFlash(0.2);
      }
      if (!players[i].downed && prevDowned[i])
        toast(i === Net.localIdx ? "YOU RISE — FIGHT ON" : "A WARDEN RISES");
    }
    if (Game.wave > prevWave && Game.wave > 1) {
      $("waveNum").textContent = ROMAN(Game.wave);
      const wb = $("waveBanner");
      wb.textContent = "WAVE " + ROMAN(Game.wave);
      wb.classList.remove("show"); void wb.offsetWidth; wb.classList.add("show");
      AudioFX.waveUp();
    }
    if (Game.boss) {
      const bw = clamp(Game.boss.hp / Game.boss.maxHp * 100, 0, 100);
      $("bossFill").style.width = bw + "%";
    }
    this._starveCheck(newest.g.state);
  },

  /* Deadlock detector, guest side. The host reports "wait" only while it is
     waiting on US to choose — so if we're sitting there holding nothing to
     pick, the offer never arrived. Ask again rather than freezing forever. */
  _starveCheck(hostState, picker) {
    /* only the warden the host is actually waiting on should re-ask; the rest
       of the party merely sees the frozen world */
    const onMe = picker === Net.localIdx ||
                 (picker === undefined && Game.pendingPickupBy === Net.localIdx);
    if (hostState === "wait" && onMe && !this._hasMyOffer()) {
      this._starveT = (this._starveT || 0) + 1;
      if (this._starveT >= 6) { this._starveT = 0; Net.sendR({ t: "reofferReq", pickerIdx: Net.localIdx }); }
    } else this._starveT = 0;
  },

  /* =========================================================
     OUT-OF-ORDER GUARD (guest)

     Snapshots and beacons ride the UNRELIABLE, UNORDERED channel while the
     rune handshake rides the reliable one, and there is no ordering guarantee
     BETWEEN the two. So a snapshot stamped `state:"play"`, sent a beat before
     the host froze to wait on us, could arrive AFTER the runeOffer that opened
     our rune screen — and _applyHostState would dutifully close it, dropping
     both players into a frozen world with nothing to pick. Anything older than
     the newest state we have already acted on is history: discard it.
     ========================================================= */
  _stale(m) {
    if (!m.n) return false;                 // unstamped (older build): take it as-is
    if (m.n <= this._stateN) return true;
    this._stateN = m.n;
    return false;
  },

  /* the guest's state is a pure function of the host's */
  _applyHostState(hs, picker) {
    if (!this._floorReady) return;
    const mine = Game.state;
    if (mine === "held") return;   // the guest may browse its codex while the world runs
    let want;
    if (hs === "play") want = "play";
    else if (hs === "wait") {
      /* the host is frozen on ONE warden's pick (the beacon's `picker`). Only
         that warden sees cards; everyone else gets the spectator notice. */
      const mineToPick = this._hasMyOffer() &&
        (picker === Net.localIdx || (picker === undefined && Game.pendingPickupBy === Net.localIdx));
      if (mineToPick) want = "rune";
      else { want = "wait"; $("waitTitle").textContent = "YOUR PARTNER IS CHOOSING A RUNE"; }
    }
    else if (hs === "rune" || hs === "choice") { want = "wait"; $("waitTitle").textContent = "YOUR PARTNER IS CHOOSING"; }
    /* a pause is SHARED: the guest gets the real pause screen, not a spectator
       notice, and its RESUME asks the host to start the world again */
    else if (hs === "pause") { want = "pause"; if (mine !== "pause") openPausePanel(); }
    else if (hs === "held") { want = "wait"; $("waitTitle").textContent = "YOUR PARTNER IS CHECKING THEIR RUNES"; }
    else if (hs === "dead") want = "dead";
    else want = mine;
    /* The runeOffer message opens the rune screen, not the snapshot — but if we
       are ALREADY holding an unanswered offer and the screen is not up, it was
       closed out from under us (a late packet, a floor wipe, a stray setState).
       The host is frozen waiting on a pick that can now never come, so put the
       cards back rather than sitting it out until its watchdog fires. */
    if (want === "rune" && mine !== "rune") {
      if (this._hasMyOffer()) {
        setState("rune");
        renderRuneChoice(Game.pendingPickups.some(e => e.by === Net.localIdx)
          ? Net.localIdx : Game.pendingPickupBy);
      }
      return;
    }
    if (want !== mine && !(want === "dead" && mine === "dead")) {
      if (want === "dead") return;                  // the `over` event owns the death screen
      setState(want);
    }
  },
  /* am I holding a rune offer that has not been answered yet? */
  _hasMyOffer() {
    if (Game.pendingPickups && Game.pendingPickups.some(e => e.by === Net.localIdx)) return true;
    return !!(Game.pendingPickup && Game.pendingPickupBy === Net.localIdx);
  },

  _sendInput(f, dt) {
    this._inputT -= dt;
    if (this._inputT > 0) return;
    this._inputT = 1 / INPUT_HZ;
    const self = localPlayer();
    /* fire intent mirrors fireWeapon's own decision inputs */
    let fire = false;
    if (f.touchMode) fire = f.aimMode === "auto" ? !!self.autoFire : f.aiming;
    else if (f.deskMode === "auto") fire = !!self.autoFire;
    else if (f.deskMode === "cursor") fire = true;
    else fire = f.mouseDown;
    Net.sendU({ t: "i", mx: f.mx, my: f.my, aim: self.aim, fire, dashN: this._dashN, useN: this._useN, recallN: this._recallN });
  },

  /* interaction hints (display only — the host executes on our useTap) */
  _guestHints(self, f) {
    let hint = null;
    if (!Game.ambush) {
      for (const c of chests) if (c.state === "sealed" && dist2(c.x, c.y, self.x, self.y) < 64 * 64) hint = "[ E ] BREAK THE SEAL";
      for (const h of healthBoxes) if (h.state === "sealed" && dist2(h.x, h.y, self.x, self.y) < 64 * 64) hint = "[ E ] TAKE THE VITALITY";
      if (SEAL.state === "ready" && dist2(SEAL.x, SEAL.y, self.x, self.y) < (SEAL.r + 40) ** 2) hint = "[ E ] WAKE WHAT SLEEPS BELOW";
    }
    /* THE SINGULAR: the host owns the state, but this screen still has to show
       its own warden what their [ E ] would do. Blackjack is solo-only. */
    const S = Game.saloon;
    if (Game.inSaloon && S) {
      const nearUnk = !!(S.unk && S.outside && dist2(self.x, self.y, S.unk.x, S.unk.y) < 240 * 240);
      const atBar = self.x > SAL_BAR.x && self.x < SAL_BAR.x + SAL_BAR.w && self.y < SAL_BAR.y + SAL_BAR.h + 74;
      if (nearUnk) hint = "[ E ] THE UNKNOWN";
      else if (atBar && S.greet === 2) {
        hint = S.talk ? "[ E ] GO ON"
             : S.asked < SAL_ASKS.length ? "[ E ] ASK: " + SAL_ASKS[S.asked].ask
             : "[ E ] ANOTHER ROUND · " + SALOON_ROUND + " SOULS";
      }
    }
    if (hint) hint = hint.replace("[ E ]", "[ " + (Input.touchMode ? "SEAL" : bindLabel("use")) + " ]");
    if (hint !== lastHint) {
      lastHint = hint;
      const el = $("interactHint");
      el.textContent = hint || "";
      el.style.opacity = hint ? 1 : 0;
    }
  },

  /* =========================================================
     DEAD RECKONING — why the guest used to stutter.
     Snapshots arrive 12 times a second; frames render 60. Previously
     nothing moved in between, so every enemy teleported in discrete
     steps. Here each entity carries a target (_tx/_ty) which advances
     by its own velocity every frame, and the drawn position chases that
     target. A snapshot only corrects the target, so motion stays smooth
     no matter how the packets land.
     ========================================================= */
  _reckon(dt) {
    const k = 1 - Math.pow(CHASE, dt);
    for (const e of enemies) {
      if (e._tx === undefined) { e._tx = e.x; e._ty = e.y; }
      /* the target keeps moving between packets at the last known velocity */
      e._tx += e.vx * dt; e._ty += e.vy * dt;
      e.x = lerp(e.x, e._tx, k); e.y = lerp(e.y, e._ty, k);
    }
    for (const p of players) {
      if (p === localPlayer() || p._tx === undefined) continue;   // own warden is predicted
      p.x = lerp(p.x, p._tx, k); p.y = lerp(p.y, p._ty, k);
    }
    for (const pt of pets) {
      if (pt._tx === undefined) continue;
      pt.x = lerp(pt.x, pt._tx, k); pt.y = lerp(pt.y, pt._ty, k);
    }
  },

  /* visual-only world tick: everything moves, nothing deals damage */
  _cosmeticWorld(dt) {
    this._reckon(dt);
    for (const c of chests) c.pulse += dt * 2;
    for (const h of healthBoxes) h.pulse += dt * 2;
    SEAL.pulse += dt * 1.5;
    for (const pk of pickups) pk.t += dt;
    if (portal) portal.t += dt;
    /* own + partner bullets: fly, bounce, pop on foes (visual only) */
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let dead = b.t > b.life;
      let bounced = false;
      if (b.x < 32 || b.x > MAP.w - 32) { b.vx *= -1; b.x = clamp(b.x, 33, MAP.w - 33); bounced = true; }
      if (b.y < 32 || b.y > MAP.h - 32) { b.vy *= -1; b.y = clamp(b.y, 33, MAP.h - 33); bounced = true; }
      if (!bounced) for (const rc of MAP.rocks) {
        if (circleRect(b.x, b.y, b.r, rc)) { bounced = true; break; }
      }
      if (bounced) { if (b.bounce > 0) b.bounce--; else dead = true; }
      if (!dead) for (const e of enemies) {
        if (e.ghost || e.spawnT > 0) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
          bulletSparks(b, Math.atan2(-b.vy, -b.vx), 4);
          e.hitFlash = Math.max(e.hitFlash || 0, 0.08);
          if (b.pierce > 0) b.pierce--; else dead = true;
          break;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    /* enemy bullets: guest-simulated after the one-shot spawn */
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i]; b.t += dt;
      if (b.homing) {
        const HP = nearestPlayer(b.x, b.y);
        const want = angTo(b.x, b.y, HP.x, HP.y);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        const turn = clamp(diff, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      let dead = b.t > 4 || b.x < 32 || b.x > MAP.w - 32 || b.y < 32 || b.y > MAP.h - 32;
      if (!dead) for (const rc of MAP.rocks) if (circleRect(b.x, b.y, b.r, rc)) { dead = true; break; }
      /* visual pop on any warden — the HURT arrives from the host's authority */
      if (!dead) for (const p of alivePlayers()) {
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) { dead = true; break; }
      }
      if (dead) ebullets.splice(i, 1);
    }
    /* own shells lob + slam visually */
    for (let i = shells.length - 1; i >= 0; i--) {
      const sh = shells[i]; sh.t += dt;
      const pr = Math.min(sh.t / sh.T, 1);
      sh.x = lerp(sh.sx, sh.lx, pr);
      sh.y = lerp(sh.sy, sh.ly, pr);
      if (pr >= 1) { shells.splice(i, 1); if (sh.owner) shellSlam(sh); }
    }
    for (let i = mines.length - 1; i >= 0; i--) {
      const mn = mines[i]; mn.t += dt;
      if (mn.armT > 0) mn.armT -= dt;
      if (mn.t > mn.life) mines.splice(i, 1);
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      if (sw.delay > 0) { sw.delay -= dt; continue; }
      if (!isFinite(sw.r) || !isFinite(sw.speed) || !isFinite(sw.max) || sw.max <= 0) {
        shockwaves.splice(i, 1); continue;
      }
      sw.r = Math.max(0, sw.r + sw.speed * dt);
      if (sw.r > sw.max) shockwaves.splice(i, 1);
    }
    for (let i = puddles.length - 1; i >= 0; i--) {
      const pu = puddles[i];
      if (pu.lava && Math.random() < dt * 1.2 && particles.length < 500) {
        particles.push({ x: pu.x + rnd(-pu.r * 0.6, pu.r * 0.6), y: pu.y + rnd(-pu.r * 0.6, pu.r * 0.6),
          vx: rnd(-25, 25), vy: rnd(-120, -40), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 5), color: "#ff5e2e" });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) particles.splice(i, 1); }
    for (let i = veils.length - 1; i >= 0; i--) { veils[i].t += dt; if (veils[i].t > veils[i].life) veils.splice(i, 1); }
    for (let i = floaters.length - 1; i >= 0; i--) { const fl = floaters[i]; fl.t += dt; fl.y -= (fl.vy === undefined ? 40 : fl.vy) * dt; if (fl.t > (fl.life || 0.7)) floaters.splice(i, 1); }
    for (let i = zaps.length - 1; i >= 0; i--) { zaps[i].t += dt; if (zaps[i].t > 0.15) zaps.splice(i, 1); }
    if (soulMotes.length) tickSoulMotes(dt);
    /* the saloon breathes only in cosmetics here — the host owns its state */
    if (Game.inSaloon && typeof saloonGuestTick === "function") saloonGuestTick(dt);
  },

  /* ---------------- messages (both roles) ---------------- */
  _onMsg(m, peer) {
    switch (m.t) {
      /* --- host receives (peer identifies WHICH guest spoke) --- */
      case "i":
        if (Net.role === "host" && peer) this._inputs.set(peer.idx, { m, at: performance.now() });
        break;
      case "runePick": if (Net.role === "host") {
        const from = m.pickerIdx ?? (peer && peer.idx);
        if (this._canPick(from)) this._hostGrant(m.id, from);
      } break;
      case "reroll": if (Net.role === "host") {
        const from = m.pickerIdx ?? (peer && peer.idx);
        if (this._canPick(from)) this._hostReroll(m.slot, from);
      } break;
      /* explicit rather than a toggle: a pause request that raced the host's own
         pause must not resume the game instead */
      case "pauseReq": if (Net.role === "host" && Game.state === "play") togglePause(); break;
      case "resumeReq": if (Net.role === "host" && Game.state === "pause") setState("play"); break;
      /* a guest pressed DESCEND AGAIN — the host performs the reset for everyone.
         Ignored once a restart is already under way, so a late request can't
         reset a run that has just begun. */
      case "retryReq": if (Net.role === "host" && !this.running) this.retry(); break;
      /* a guest is frozen with nothing to choose — resend what it's owed */
      case "reofferReq": if (Net.role === "host") this._sendRuneOffer(m.pickerIdx ?? (peer && peer.idx)); break;
      case "guestQuit": this._peerLost("quit", peer); break;

      /* --- guest receives --- */
      /* a fresh descent: the first one comes from the lobby, later ones from
         the host's DESCEND AGAIN (the lobby's handler is long gone by then) */
      case "start": if (Net.role === "guest") this.beginGuest(m.cfgs, m.mode, m.runePause); break;
      case "s": if (Net.role === "guest") {
        if (this._stale(m)) break;
        this._buf.push(m);
        while (this._buf.length > 3) this._buf.shift();   // never grow while frozen
        /* The frame loop only drains this buffer in the live states. Sitting on
           a shared pause it does not run at all — so a snapshot arriving here IS
           the news that the host resumed, and has to be acted on directly or the
           guest stays frozen forever. */
        if (Game.state === "pause") this._applyHostState(m.g.state);
      } break;
      /* the frozen-world beacon: mirror the host's state, and notice if we are
         the one it's waiting on while holding nothing to choose */
      case "st": if (Net.role === "guest") {
        if (this._stale(m)) break;
        this._applyHostState(m.state, m.picker); this._starveCheck(m.state, m.picker);
      } break;
      case "floor": if (Net.role === "guest") this._applyFloor(m); break;
      case "saloon": if (Net.role === "guest") this._applySaloon(m); break;
      /* a host console edit: new runes / warden, applied at once */
      case "edit": if (Net.role === "guest") this._applyEdit(m); break;
      case "kill": if (Net.role === "guest") this._guestKill(m); break;
      case "chestOpen": if (Net.role === "guest") {
        AudioFX.chest(); AudioFX.pickup(); Game.shake = Math.max(Game.shake, 6);
        toast(m.opened >= m.total ? "EVERY SEAL IS BROKEN — THE GRAND SEAL STIRS" : "THE SEAL YIELDS A RUNE");
      } break;
      case "ambush": if (Net.role === "guest") { screenFlash(0.25); Game.shake = Math.max(Game.shake, 10); AudioFX.bossRoar(); toast("THE SEAL BREAKS — SURVIVE"); } break;
      case "bossSpawn": if (Net.role === "guest") this._guestBossIntro(m); break;
      case "runeOffer": if (Net.role === "guest") this._guestRuneOffer(m); break;
      case "runeGranted": if (Net.role === "guest") {
        grantRune(players[m.idx], m.id, m.idx !== Net.localIdx);
        const mine = (m.pickerIdx ?? m.idx) === Net.localIdx;
        if (mine) {
          Game.pendingPickups = Game.pendingPickups.filter(e => e.by !== Net.localIdx);
          Game.pendingPickup = null; Game.pendingPickupBy = 0;
          hideRuneOverlay();
          if (Game.state === "rune") setState("play");
        }
      } break;
      case "over": if (Net.role === "guest") { doGameOver(); } break;
      /* CLASSIC: the host felled THE EVENT HORIZON — the shared descent is complete */
      case "victory": if (Net.role === "guest") {
        Game.coopVictory = true;
        if (typeof RunTimer !== "undefined") RunTimer.finish();
        doGameOver();
      } break;
      case "hostQuit": this._peerLost("quit"); break;
    }
  },

  /* =========================================================
     RUNE HANDSHAKE WATCHDOG
     The exchange is one `runeOffer` out and one `runePick` back. Either
     can be lost — Net._send silently drops anything queued while a
     channel isn't open — and the old code then froze BOTH players
     forever with no way out but abandoning the run. Nothing here is
     free to hang: re-offer after a few seconds, and if the partner is
     truly unreachable, take the choice ourselves and carry on.
     ========================================================= */
  _runeWatchdog(dt) {
    const noPause = typeof shouldPauseForRune === "function" && !shouldPauseForRune();
    if (noPause) {
      /* per-player watchdog: each pending pickup is independent.
         If a player leaves while they have an open offer, drop it.
         If they don't answer within ~12s, grant the first rune for them. */
      for (let i = Game.pendingPickups.length - 1; i >= 0; i--) {
        const entry = Game.pendingPickups[i];
        /* the host's own hand is never rushed — its cards are on screen and the
           host owns the clock (the run keeps simulating either way) */
        if (entry.by === Net.localIdx) continue;
        const ch = players[entry.by];
        if (!ch || ch.gone) {
          Game.pendingPickups.splice(i, 1);
          continue;
        }
        if (entry.state !== "offered") continue;
        entry._waitT = (entry._waitT || 0) + dt;
        if (entry._waitT > 3 && entry._reoffers < 4) {
          entry._waitT = 0; entry._reoffers = (entry._reoffers || 0) + 1;
          this._sendRuneOffer(entry.by);
          continue;
        }
        if (entry._reoffers >= 4 && entry._waitT > 3) {
          const id = entry.pk.ids && entry.pk.ids[0];
          toast("A WARDEN DID NOT ANSWER — THE RUNE CHOSE ITSELF");
          if (id) this._hostGrant(id, entry.by);
          else { Game.pendingPickups.splice(i, 1); }
        }
      }
      return;
    }
    /* pause mode: legacy single-slot watchdog */
    const chooser = players[Game.pendingPickupBy];
    /* the hand belonged to a warden who has left: nobody can answer it, so
       release the run rather than re-offering into the dark */
    if (Game.pendingPickup && chooser && chooser.gone) {
      Game.pendingPickup = null; this._waitT = 0; this._reoffers = 0;
      if (Game.state === "wait") setState("play");
      return;
    }
    const waiting = Game.state === "wait" && Game.pendingPickup &&
                    chooser && chooser !== localPlayer();
    if (!waiting) { this._waitT = 0; this._reoffers = 0; return; }
    this._waitT = (this._waitT || 0) + dt;
    if (this._waitT > 3 && this._reoffers < 4) {
      this._waitT = 0; this._reoffers = (this._reoffers || 0) + 1;
      this._sendRuneOffer();
      return;
    }
    /* four unanswered offers (~12s): the partner cannot answer. Grant them the
       first rune so their build still moves forward, and unfreeze the run. */
    if (this._reoffers >= 4 && this._waitT > 3) {
      const ch = players[Game.pendingPickupBy];
      const id = Game.pendingPickup.ids && Game.pendingPickup.ids[0];
      toast("YOUR PARTNER DID NOT ANSWER — THE RUNE CHOSE ITSELF");
      if (id) this._hostGrant(id); else { Game.pendingPickup = null; setState("play"); }
      this._waitT = 0; this._reoffers = 0;
    }
  },
  _sendRuneOffer(pickerIdx) {
    const paused = shouldPauseForRune();
    let ch, pk;
    if (!paused) {
      if (typeof pickerIdx !== "number") return;    // no hand to re-offer
      const entry = Game.pendingPickups.find(e => e.by === pickerIdx);
      if (!entry) return;
      ch = players[pickerIdx];
      pk = entry.pk;
    } else {
      ch = players[Game.pendingPickupBy];
      pk = Game.pendingPickup;
    }
    if (!ch || !pk) return;
    if (!pk.ids) pk.ids = genThreeRunes(ch);       // never offer an empty hand
    Net.sendR({ t: "runeOffer", idx: ch.idx, ids: pk.ids, rerolls: ch.rerolls, pickerIdx: ch.idx });
  },

  /* ---------------- rune choice over the wire ---------------- */
  /* Idempotent on purpose: keyed off "is a pickup pending" rather than an exact
     state, so a pick that arrives a frame late — or twice, after a re-offer —
     resolves once and is then harmlessly ignored. */
  _hostGrant(id, pickerIdx) {
    const paused = shouldPauseForRune();
    let ch, pk;
    if (!paused) {
      if (typeof pickerIdx !== "number") return;      // nothing to answer
      const entry = Game.pendingPickups.find(e => e.by === pickerIdx);
      if (!entry) return;
      ch = players[pickerIdx];
      pk = entry.pk;
      if (!ch || !pk) return;
    } else {
      ch = players[Game.pendingPickupBy];
      pk = Game.pendingPickup;
      if (!ch || !pk) return;
    }
    const idx = pickups.indexOf(pk);
    if (idx !== -1) pickups.splice(idx, 1);
    if (paused) {
      Game.pendingPickup = null;
      this._waitT = 0; this._reoffers = 0;
    } else {
      Game.pendingPickups = Game.pendingPickups.filter(e => e.by !== pickerIdx);
      if (pickerIdx === Net.localIdx) hideRuneOverlay(pickerIdx);
    }
    grantRune(ch, id, true);
    Net.sendR({ t: "runeGranted", idx: ch.idx, id, pickerIdx });
    if (paused) setState("play");
  },
  _hostReroll(slot, pickerIdx) {
    const paused = shouldPauseForRune();
    let ch, pk;
    if (!paused) {
      if (typeof pickerIdx !== "number") return;
      const entry = Game.pendingPickups.find(e => e.by === pickerIdx);
      if (!entry) return;
      ch = players[pickerIdx];
      pk = entry.pk;
    } else {
      ch = players[Game.pendingPickupBy];
      pk = Game.pendingPickup;
    }
    if (!ch || !pk || !pk.ids || ch.rerolls <= 0) return;
    ch.rerolls--;
    const pool = runePool(ch);
    const onScreen = new Set(pk.ids);
    let avail = pool.filter(id => !onScreen.has(id));
    if (!avail.length) avail = pool.filter(id => id !== pk.ids[slot]);
    if (avail.length) pk.ids[slot] = pick(avail);
    if (paused) { this._waitT = 0; this._reoffers = 0; }
    Net.sendR({ t: "runeOffer", idx: ch.idx, ids: pk.ids, rerolls: ch.rerolls, pickerIdx });
    /* the host rerolled its OWN hand: refresh the overlay in place */
    if (!paused && pickerIdx === Net.localIdx) {
      localPlayer().rerolls = ch.rerolls;
      renderRuneChoice(pickerIdx);
    }
  },
  _guestRuneOffer(m) {
    const pickerIdx = m.pickerIdx ?? m.idx;
    if (pickerIdx !== Net.localIdx) return;           // somebody else's hand
    if (!Array.isArray(m.ids) || m.ids.length < 3) {
      Net.sendR({ t: "reofferReq", pickerIdx });
      return;
    }
    const paused = shouldPauseForRune();
    /* a re-offer for a hand already on screen must not reset the cards under the
       player's finger — only adopt it if something actually changed */
    const entry = paused ? { pk: Game.pendingPickup }
                         : Game.pendingPickups.find(e => e.by === pickerIdx);
    const onScreen = paused ? Game.state === "rune" : Game.runeOverlayBy === pickerIdx;
    const same = onScreen && entry && entry.pk && entry.pk.ids &&
                 String(entry.pk.ids) === String(m.ids);
    if (same) { localPlayer().rerolls = m.rerolls; return; }
    const pk = { ids: m.ids.slice() };
    localPlayer().rerolls = m.rerolls;
    if (paused) {
      Game.pendingPickup = pk;
      Game.pendingPickupBy = pickerIdx;
      setState("rune");
      renderRuneChoice(pickerIdx);
    } else {
      /* ride the choice over live play — no world freeze */
      const existing = Game.pendingPickups.findIndex(e => e.by === pickerIdx);
      const e = { pk, by: pickerIdx, state: "offered" };
      if (existing >= 0) Game.pendingPickups[existing] = e;
      else Game.pendingPickups.push(e);
      showRuneOverlay(pickerIdx);
    }
  },

  /* ---------------- guest-side event juice ---------------- */
  _guestKill(m) {
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].id === m.id) enemies.splice(i, 1);
    const pn = m.boss ? 50 : 14;
    for (let i = 0; i < pn && particles.length < 520; i++) {
      particles.push({ x: m.x, y: m.y, vx: rnd(-260, 260), vy: rnd(-260, 260),
        t: 0, life: rnd(0.3, 0.9), r: rnd(2, 6), color: m.color });
    }
    Game.shake = Math.max(Game.shake, m.boss ? 16 : 4);
    AudioFX.kill();
    if (m.boss) {
      $("bossBar").classList.remove("on");
      document.body.classList.remove("bossOn");
      AudioFX.bossRoar();
    }
  },
  _guestBossIntro(m) {
    $("bossName").textContent = m.name;
    $("bossBar").classList.add("on");
    document.body.classList.add("bossOn");
    const bt = $("bossTitle");
    bt.textContent = m.name;
    bt.classList.remove("show"); void bt.offsetWidth; bt.classList.add("show");
    AudioFX.duck(); AudioFX.bossRoar();
    Game.shake = 14;
  },

  /* The host console edited the run. Rebuild each warden from the host's
     authoritative loadout, then let recalc() derive the stats and the body. */
  _applyEdit(m) {
    if (!m || !Array.isArray(m.pl)) return;
    for (let i = 0; i < m.pl.length && i < players.length; i++) {
      const p = players[i], o = m.pl[i];
      if (!p || !o) continue;
      if (typeof o.char === "string" && CHARS[o.char]) p.char = o.char;
      if (typeof o.skin === "string" && SKINS[o.skin]) p.skin = o.skin;
      if (o.gunSkin === null || (typeof o.gunSkin === "string" && SKINS[o.gunSkin])) p.gunSkin = o.gunSkin;
      p.runes = o.runes || {};
      p.lockedRunes = Array.isArray(o.lockedRunes) ? o.lockedRunes.slice() : null;
      if (typeof o.bonusRuneSlots === "number") p.bonusRuneSlots = o.bonusRuneSlots;
      if (typeof o.rerolls === "number") p.rerolls = o.rerolls;
      if (typeof o.dashDur === "number") p.dashDur = o.dashDur;
      recalc(p);
      if (typeof o.maxHp === "number") p.maxHp = o.maxHp;
      if (typeof o.hp === "number") p.hp = Math.max(0, Math.min(o.hp, p.maxHp));
      /* a familiar is an entity, not a stat: rebuild it only when the type
         actually changed, so an unrelated edit does not re-poof every pet */
      if (o.pet !== undefined && (o.pet || null) !== (p.pet || null))
        equipPet(p, o.pet);
    }
    updateHp(); updateRerolls(); refreshRuneStrip();
    toast("THE HOST REWRITES THE RUN");
  },

  /* THE SINGULAR, co-op: rebuild the same room on the guest. The host's entry
     message carries the static furniture; snapshots then stream the room's
     live state (see `encodeSaloon`/`applySaloonState`). */
  _applySaloon(m) {
    Game.inSaloon = true;
    Game.mapIdx = m.mapIdx; Game.loop = m.loop;
    MAP.rocks = m.rocks;
    enemies = []; bullets = []; ebullets = []; puddles = [];
    particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
    soulMotes = [];
    Game.ambush = null; Game.boss = null; Game.shake = 0;
    Game.bossRocks.length = 0;
    Game.chestsTotal = 0; Game.chestsOpened = 0;
    rift = null;
    portal = m.portal ? { x: m.portal.x, y: m.portal.y, r: 46, t: m.portal.t || 0 } : null;
    pets = [];
    for (const p of players) if (p.pet && PTYPES[p.pet]) pets.push(spawnPet(p.pet, p));
    /* authoritative builds, bodies and downed states — the saloon does NOT
       revive anyone; only the next floor does that */
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      p.runes = m.runes[i] || {};
      p.rerolls = m.rerolls[i];
      recalc(p);
      if (m.px[i]) { p.x = m.px[i][0]; p.y = m.px[i][1]; }
      p.iframes = 1.5;
      if (m.downed) p.downed = !!m.downed[i];
    }
    SEAL.state = "spent"; SEAL.pulse = 0;
    Game.saloon = makeSaloon(m.hello);
    Game.pendingPickups = []; Game.pendingPickup = null; Game.pendingPickupBy = 0;
    if (Game.runeOverlayBy != null && typeof hideRuneOverlay === "function") hideRuneOverlay();
    $("mapName").textContent = "THE SINGULAR";
    updateSeals();
    $("sealCount").textContent = "REST A WHILE";
    $("bossBar").classList.remove("on");
    document.body.classList.remove("bossOn");
    Game.floorFade = 1;
    this._floorReady = true;
    setState("play");
    toast("YOU STEP INTO THE SINGULAR — EVERY FACE HERE IS YOURS");
    AudioFX.portal();
  },

  _applyFloor(m) {
    Game.inSaloon = false; Game.saloon = null;
    Game.mapIdx = m.mapIdx; Game.loop = m.loop;
    Game.chestsTotal = m.chestsTotal; Game.chestsOpened = m.chestsOpened;
    MAP.rocks = m.rocks;
    SEAL.state = m.seal; SEAL.pulse = 0;
    enemies = []; bullets = []; ebullets = []; puddles = [];
    particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
    soulMotes = [];
    portal = null; rift = null;
    Game.ambush = null; Game.boss = null; Game.shake = 0;
    Game.bossRocks.length = 0;
    for (const c of m.chests) chests.push({ id: c.id, x: c.x, y: c.y, r: 18, state: c.state, pulse: rnd(0, TAU) });
    for (const h of m.hbs) healthBoxes.push({ id: h.id, x: h.x, y: h.y, r: 16, state: h.state, pulse: rnd(0, TAU) });
    for (const pu of m.haz) puddles.push({ id: pu.id, x: pu.x, y: pu.y, r: pu.r, t: 0,
      life: pu.life === -1 ? Infinity : pu.life, team: "e", dmg: pu.dmg, color: pu.color,
      lava: pu.lava, water: pu.water, tickMap: {} });
    pets = [];
    for (const p of players) if (p.pet && PTYPES[p.pet]) pets.push(spawnPet(p.pet, p));
    /* authoritative starting builds + spawn spots */
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      p.runes = m.runes[i] || {};
      p.rerolls = m.rerolls[i];
      recalc(p);
      if (m.px[i]) { p.x = m.px[i][0]; p.y = m.px[i][1]; }
      p.iframes = 1.5;
      if (p.downed) { p.downed = false; p.reviveT = 0; }
    }
    const F = floorDef();
    $("mapName").textContent = F.name + (Game.loop ? " +" + Game.loop : "");
    updateSeals(); updateHp(); updateScore(); updateRerolls(); refreshRuneStrip();
    $("bossBar").classList.remove("on");
    document.body.classList.remove("bossOn");
    Game.floorFade = 1;
    if (this._floorReady) { toast("YOU DESCEND INTO " + F.name); AudioFX.portal(); }
    else toast("YOU DESCEND TOGETHER");
    this._floorReady = true;
    setState("play");
  },

  /* ---------------- a partner is gone ---------------- */
  _peerLost(why, peer) {
    if (!this.running) { Net.hangUp(); return; }
    /* a guest's only link is the host: losing it ends this screen's run */
    if (Net.role === "guest") {
      this.running = false;
      Net.hangUp();
      if (Game.state === "menu" || Game.state === "lobby") return;
      /* lost on the tally screen: nothing to salvage, but DESCEND AGAIN must stop
         promising a shared run — it falls back to a solo descent from here */
      if (Game.state === "dead") {
        this._resetRetryBtn();
        toast("THE HOST HAS GONE — THE NEXT DESCENT IS YOURS ALONE");
        return;
      }
      toast("CONNECTION LOST");
      if (Game.state !== "dead") doGameOver();
      return;
    }
    /* HOST: one seat is lost, the rest of the party fights on. The fallen
       warden slumps and stops drawing aggro; the run stays record-gated
       because it began as a shared descent. */
    const p = peer && players[peer.idx];
    if (p) { p.gone = true; p.downed = true; p.hp = 0; }
    /* a rune hand that belonged to the departed warden can never be answered */
    if (p && Game.pendingPickupBy === p.idx) Game.pendingPickup = null;
    if (p && Game.pendingPickups) {
      Game.pendingPickups = Game.pendingPickups.filter(e => e.by !== p.idx);
      if (Game.runeOverlayBy === p.idx) hideRuneOverlay();
    }
    if (Game.state === "wait" || Game.state === "pause") setState("play");
    if (typeof updateHp === "function") updateHp();
    if (Net.peers.length > 0) toast("A WARDEN IS LOST TO THE DARK — FIGHT ON");
    else toast("YOUR PARTNERS ARE LOST TO THE DARK — FIGHT ON");
  },
};

/* ---------- host event hooks: floatText replay + kill events ----------
   floatText is a global function binding — wrap it so every damage number
   and callout the host sees is replayed on the guest for free. */
{
  const _floatText = floatText;
  floatText = function (x, y, txt, color, size, opt) {
    /* Ordinary damage numbers are the bulk of these and the guest already
       prints its own from cosmetic hits — only ship what it can't infer. */
    if (Net.role === "host" && Coop.running && Protocol.fxWorthSending(txt, color))
      Protocol.queueFx({ x: Math.round(x), y: Math.round(y), txt: String(txt), color, size, opt });
    return _floatText(x, y, txt, color, size, opt);
  };

  const _killEnemy = killEnemy;
  killEnemy = function (e, killer) {
    const wasDead = e.dead;
    _killEnemy(e, killer);
    if (!wasDead && e.dead && Net.role === "host" && Coop.running)
      Net.sendR({ t: "kill", id: e.id, x: Math.round(e.x), y: Math.round(e.y), color: e.color, boss: !!e.boss });
  };

  const _openChest = openChest;
  openChest = function (chest) {
    _openChest(chest);
    if (Net.role === "host" && Coop.running)
      Net.sendR({ t: "chestOpen", id: chest.id, opened: Game.chestsOpened, total: Game.chestsTotal });
  };

  const _triggerAmbush = triggerAmbush;
  triggerAmbush = function (chest) {
    _triggerAmbush(chest);
    if (Net.role === "host" && Coop.running) Net.sendR({ t: "ambush", id: chest.id });
  };

  const _spawnBoss = spawnBoss;
  spawnBoss = function () {
    _spawnBoss.apply(this, arguments);
    if (Net.role === "host" && Coop.running) {
      const bk = Game.boss ? Game.boss.kind : Game.mapIdx;
      const F = FLOORS[bk] || floorDef();
      Net.sendR({ t: "bossSpawn", name: F.boss + (Game.loop ? " +" + Game.loop : ""),
        intro: bossWakeLine(bk) });
    }
  };

  const _setupFloor = setupFloor;
  setupFloor = function (first) {
    _setupFloor(first);
    if (!first && Net.role === "host" && Coop.running) Coop.sendFloor();
  };
}

/* the wait overlay's escape hatch: abandon the co-op run from either side */
$("waitLeave").addEventListener("click", () => {
  if (!Coop.running) return;
  Net.sendR({ t: Net.role === "host" ? "hostQuit" : "guestQuit" });
  Coop.running = false;
  Net.hangUp();
  bankSouls();
  refreshMenu();
  setState("menu");
});

/* Net.frameFor: the sim's seam for the guest warden's input on the host */
{
  const _frameFor = Net.frameFor.bind(Net);
  Net.frameFor = function (p) {
    if (this.role === "host" && Coop.running && p.idx !== 0) return Coop.guestFrame(p.idx);
    return _frameFor(p);
  };
}
