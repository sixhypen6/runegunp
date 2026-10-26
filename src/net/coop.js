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

const Coop = {
  running: false,
  _snapT: 0, _inputT: 0,
  _buf: [],                          // guest: snapshot buffer (newest last)
  _remote: null,                     // host: latest guest input msg
  _remoteAt: 0,
  _lastDashN: 0, _lastUseN: 0,       // host: consumed tap counters
  _dashN: 0, _useN: 0,               // guest: outgoing tap counters
  _floorReady: false,
  _prevWave: 0,

  /* ---------------- lifecycle ---------------- */
  beginHost(cfgs) {
    this.cfgs = cfgs;                   // kept so DESCEND AGAIN can rebuild the same pair
    this._start("host");
    Game.hardMode = false;              // co-op is normal mode only in v1
    Game.chaosMode = false;
    Game.classicMode = false;
    resetRun(cfgs);
    Game.riftOffered = true;              // no rift in co-op
    setState("play");
    this.sendFloor();
    toast("YOU DESCEND TOGETHER");
    AudioFX.portal();
  },
  beginGuest(cfgs) {
    this.cfgs = cfgs;
    this._start("guest");
    Game.hardMode = false;
    Game.chaosMode = false;
    Game.classicMode = false;
    resetRun(cfgs);
    Game.riftOffered = true;
    this._floorReady = false;
    setState("wait");
    $("waitTitle").textContent = "CROSSING OVER…";
  },
  _start(role) {
    this.running = true;
    this._buf = []; this._remote = null;
    this._snapT = 0; this._inputT = 0;
    this._lastDashN = this._lastUseN = this._dashN = this._useN = 0;
    this._prevWave = 0;
    this._stateN = 0;      // newest host-state packet acted on (see _stale)
    Net.onMessage = m => this._onMsg(m);
    Net.onPeerLost = why => this._peerLost(why);
    Protocol._snapN = 0; Protocol._fx = [];
    this._resetRetryBtn();
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
      Net.sendR({ t: "start", cfgs: this.cfgs });
      this.beginHost(this.cfgs);
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
      Net.sendU({ t: "st", n: ++Protocol._snapN, state: Game.state });
      return;
    }
    this._snapT = 1 / SNAP_HZ;
    Net.sendU(Protocol.encodeSnapshot());
  },

  /* the guest warden's input frame, synthesized from the last wire msg */
  guestFrame() {
    const m = this._remote;
    const stale = !m || performance.now() - this._remoteAt > 250;
    const f = zeroFrame();
    if (m && !stale) {
      f.mx = m.mx; f.my = m.my;
      f.aiming = !!m.fire;
      f.aimX = Math.cos(m.aim); f.aimY = Math.sin(m.aim);
      f.aimMode = "manual";
      if (m.dashN > this._lastDashN) { f.dashTap = true; this._lastDashN = m.dashN; }
      if (m.useN > this._lastUseN) { f.useTap = true; this._lastUseN = m.useN; }
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
    this._sendInput(f, dt);
    if (Game.state !== "play" || !this._floorReady) return;

    /* own warden: full movement + cosmetic gunfire prediction */
    f.dashTap = f.dashTap && self.dashCd <= 0;   // mirror the host's gate for feel
    updatePlayer(self, f, dt);
    this._guestHints(self, f);
    this._cosmeticWorld(dt);

    /* camera + juice decay — same feel as the host loop */
    const camP = localPlayer();
    Game.cam.x = lerp(Game.cam.x, clamp(camP.x - VW / 2, 0, MAP.w - VW), 1 - Math.pow(0.001, dt));
    Game.cam.y = lerp(Game.cam.y, clamp(camP.y - VH / 2, 0, MAP.h - VH), 1 - Math.pow(0.001, dt));
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
        toast(i === Net.localIdx ? "YOU ARE DOWN — YOUR PARTNER CAN LIFT YOU"
                                 : "YOUR PARTNER IS DOWN — REACH THEM");
        screenFlash(0.2);
      }
      if (!players[i].downed && prevDowned[i])
        toast(i === Net.localIdx ? "YOU RISE — FIGHT ON" : "YOUR PARTNER RISES");
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
  _starveCheck(hostState) {
    if (hostState === "wait" && !Game.pendingPickup) {
      this._starveT = (this._starveT || 0) + 1;
      if (this._starveT >= 6) { this._starveT = 0; Net.sendR({ t: "reofferReq" }); }
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
  _applyHostState(hs) {
    if (!this._floorReady) return;
    const mine = Game.state;
    if (mine === "held") return;   // the guest may browse its codex while the world runs
    let want;
    if (hs === "play") want = "play";
    else if (hs === "wait") want = "rune";          // host waits while I choose
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
      if (Game.pendingPickup && Game.pendingPickup.ids && Game.pendingPickupBy === Net.localIdx) {
        setState("rune");
        renderRuneChoice();
      }
      return;
    }
    if (want !== mine && !(want === "dead" && mine === "dead")) {
      if (want === "dead") return;                  // the `over` event owns the death screen
      setState(want);
    }
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
    Net.sendU({ t: "i", mx: f.mx, my: f.my, aim: self.aim, fire, dashN: this._dashN, useN: this._useN });
  },

  /* interaction hints (display only — the host executes on our useTap) */
  _guestHints(self, f) {
    let hint = null;
    if (!Game.ambush) {
      for (const c of chests) if (c.state === "sealed" && dist2(c.x, c.y, self.x, self.y) < 64 * 64) hint = "[ E ] BREAK THE SEAL";
      for (const h of healthBoxes) if (h.state === "sealed" && dist2(h.x, h.y, self.x, self.y) < 64 * 64) hint = "[ E ] TAKE THE VITALITY";
      if (SEAL.state === "ready" && dist2(SEAL.x, SEAL.y, self.x, self.y) < (SEAL.r + 40) ** 2) hint = "[ E ] WAKE WHAT SLEEPS BELOW";
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
      sw.r += sw.speed * dt;
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
  },

  /* ---------------- messages (both roles) ---------------- */
  _onMsg(m) {
    switch (m.t) {
      /* --- host receives --- */
      case "i": this._remote = m; this._remoteAt = performance.now(); break;
      case "runePick": if (Net.role === "host") this._hostGrant(m.id); break;
      case "reroll": if (Net.role === "host") this._hostReroll(m.slot); break;
      /* explicit rather than a toggle: a pause request that raced the host's own
         pause must not resume the game instead */
      case "pauseReq": if (Net.role === "host" && Game.state === "play") togglePause(); break;
      case "resumeReq": if (Net.role === "host" && Game.state === "pause") setState("play"); break;
      /* the guest pressed DESCEND AGAIN — the host performs the reset for both.
         Ignored once a restart is already under way, so a late request can't
         reset a run that has just begun. */
      case "retryReq": if (Net.role === "host" && !this.running) this.retry(); break;
      /* the guest is frozen with nothing to choose — resend what it's owed */
      case "reofferReq": if (Net.role === "host") this._sendRuneOffer(); break;
      case "guestQuit": this._peerLost("quit"); break;

      /* --- guest receives --- */
      /* a fresh descent: the first one comes from the lobby, later ones from
         the host's DESCEND AGAIN (the lobby's handler is long gone by then) */
      case "start": if (Net.role === "guest") this.beginGuest(m.cfgs); break;
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
        this._applyHostState(m.state); this._starveCheck(m.state);
      } break;
      case "floor": if (Net.role === "guest") this._applyFloor(m); break;
      case "kill": if (Net.role === "guest") this._guestKill(m); break;
      case "chestOpen": if (Net.role === "guest") {
        AudioFX.chest(); AudioFX.pickup(); Game.shake = Math.max(Game.shake, 6);
        toast(m.opened >= m.total ? "EVERY SEAL IS BROKEN — THE GRAND SEAL STIRS" : "THE SEAL YIELDS A RUNE");
      } break;
      case "ambush": if (Net.role === "guest") { screenFlash(0.25); Game.shake = Math.max(Game.shake, 10); AudioFX.bossRoar(); toast("THE SEAL BREAKS — SURVIVE"); } break;
      case "bossSpawn": if (Net.role === "guest") this._guestBossIntro(m); break;
      case "runeOffer": if (Net.role === "guest") this._guestRuneOffer(m); break;
      case "runeGranted": if (Net.role === "guest") { grantRune(players[m.idx], m.id, m.idx !== Net.localIdx); } break;
      case "over": if (Net.role === "guest") { doGameOver(); } break;
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
    const waiting = Game.state === "wait" && Game.pendingPickup &&
                    players[Game.pendingPickupBy] && players[Game.pendingPickupBy] !== localPlayer();
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
  _sendRuneOffer() {
    const ch = players[Game.pendingPickupBy];
    const pk = Game.pendingPickup;
    if (!ch || !pk) return;
    if (!pk.ids) pk.ids = genThreeRunes(ch);       // never offer an empty hand
    Net.sendR({ t: "runeOffer", ids: pk.ids, rerolls: ch.rerolls });
  },

  /* ---------------- rune choice over the wire ---------------- */
  /* Idempotent on purpose: keyed off "is a pickup pending" rather than an exact
     state, so a pick that arrives a frame late — or twice, after a re-offer —
     resolves once and is then harmlessly ignored. */
  _hostGrant(id) {
    const ch = players[Game.pendingPickupBy];
    if (!ch || !Game.pendingPickup) return;
    const idx = pickups.indexOf(Game.pendingPickup);
    if (idx !== -1) pickups.splice(idx, 1);
    Game.pendingPickup = null;
    this._waitT = 0; this._reoffers = 0;
    grantRune(ch, id, true);
    Net.sendR({ t: "runeGranted", idx: ch.idx, id });
    setState("play");
  },
  _hostReroll(slot) {
    const ch = players[Game.pendingPickupBy];
    const pk = Game.pendingPickup;
    if (!ch || !pk || ch.rerolls <= 0) return;
    ch.rerolls--;
    const pool = runePool(ch);
    const onScreen = new Set(pk.ids);
    let avail = pool.filter(id => !onScreen.has(id));
    if (!avail.length) avail = pool.filter(id => id !== pk.ids[slot]);
    if (avail.length) pk.ids[slot] = pick(avail);
    this._waitT = 0; this._reoffers = 0;          // they're clearly alive — reset the watchdog
    Net.sendR({ t: "runeOffer", ids: pk.ids, rerolls: ch.rerolls });
  },
  _guestRuneOffer(m) {
    /* a re-offer for a choice already on screen must not reset the cards under
       the player's finger — only adopt it if something actually changed */
    const same = Game.state === "rune" && Game.pendingPickup && Game.pendingPickup.ids &&
                 String(Game.pendingPickup.ids) === String(m.ids);
    if (same) return;
    if (!m.ids || m.ids.length < 3) { Net.sendR({ t: "reofferReq" }); return; }
    Game.pendingPickup = { ids: m.ids.slice() };
    Game.pendingPickupBy = Net.localIdx;
    localPlayer().rerolls = m.rerolls;
    setState("rune");
    renderRuneChoice();
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

  _applyFloor(m) {
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

  /* ---------------- the partner is gone ---------------- */
  _peerLost(why) {
    if (!this.running) { Net.hangUp(); return; }
    this.running = false;
    const wasHost = Net.role === "host";   // captured BEFORE hangUp clears the role
    Net.hangUp();
    if (Game.state === "menu" || Game.state === "lobby") return;
    /* lost on the tally screen: nothing to salvage, but DESCEND AGAIN must stop
       promising a shared run — it falls back to a solo descent from here */
    if (Game.state === "dead") {
      this._resetRetryBtn();
      toast("YOUR PARTNER HAS GONE — THE NEXT DESCENT IS YOURS ALONE");
      return;
    }
    if (wasHost) {
      /* carry on alone: the partner's warden slumps and stops drawing aggro.
         The run stays record-gated — it began as a shared descent. */
      const p2 = players[1];
      if (p2) { p2.gone = true; p2.downed = true; p2.hp = 0; }
      if (Game.state === "wait" || Game.state === "pause") setState("play");
      toast("YOUR PARTNER IS LOST TO THE DARK — FIGHT ON");
    } else {
      toast("CONNECTION LOST");
      if (Game.state !== "dead") doGameOver();
    }
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
    _spawnBoss();
    if (Net.role === "host" && Coop.running) {
      const intro = ["THE CHAINED WARDEN WAKES — IT HUNGERS TO BIND YOU",
                     "THE MARROW KING RISES — YOUR BONES ARE HIS BIRTHRIGHT",
                     "THE FORGE TYRANT IGNITES — THE MOUNTAIN WALKS",
                     "THE DROWNED MONARCH SURFACES — THE DEEP CLAIMS ITS OWN",
                     "THE EVENT HORIZON OPENS — EVEN YOUR BULLETS BELONG TO IT"][Game.mapIdx];
      Net.sendR({ t: "bossSpawn", name: floorDef().boss + (Game.loop ? " +" + Game.loop : ""), intro });
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
    if (this.role === "host" && Coop.running && p.idx === 1) return Coop.guestFrame();
    return _frameFor(p);
  };
}
