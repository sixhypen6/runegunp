/* =========================================================
   RUNEGUN · Procedural audio
   Web Audio synthesis — every sound effect generated on the fly behind a single master volume.
   ========================================================= */
"use strict";


/* ---------- audio (procedural, master volume) ---------- */
const AudioFX = (() => {
  let ac = null, master = null;
  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = Meta.volume;
        master.connect(ac.destination);
      } catch (e) { return null; }
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  /* Park the audio hardware when the app leaves the foreground. Without this the
     context stays "running" for the whole process lifetime: already-scheduled
     tails (a boss roar is 0.8s) play out over an ad or the home screen, and an
     idle-but-live context keeps an AudioTrack and a real-time render thread alive,
     draining battery while the game is backgrounded. ctx() resumes on the next
     sound, and native.js/input.js drive these on lifecycle events. */
  function suspend() { try { if (ac && ac.state === "running") ac.suspend(); } catch (e) {} }
  function resume() { try { if (ac && ac.state === "suspended") ac.resume(); } catch (e) {} }

  /* Live gain moves with the slider; persistence is deliberately NOT done here.
     This is bound to the range input's `input` event, which fires continuously
     while a finger drags (~60/sec), and metaSave() is a synchronous
     JSON.stringify of the whole Meta blob plus a localStorage write. overlays.js
     saves once on `change`, when the finger lifts. */
  function setVolume(v) { Meta.volume = clamp(v, 0, 1); if (master) master.gain.value = Meta.volume; }
  /* momentarily pull the master down and let it swell back — a boss-arrival breath */
  function duck() {
    if (!ac || !master) return;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, Meta.volume * 0.25), t);
    master.gain.linearRampToValueAtTime(Meta.volume, t + 0.9);
  }
  function blip(freq, dur, type, vol, slide) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(master);
    o.start(); o.stop(a.currentTime + dur);
  }
  /* One shared white-noise bed, built once and replayed from a random offset.
     This used to allocate a fresh AudioBuffer and fill it with a per-sample JS
     loop on EVERY call — and hit() fires once per damage instance, unguarded, so
     a nova hitting 30 enemies meant ~86k Math.random() calls and ~345KB of
     throwaway Float32Array in the frame that was already the most expensive.
     The old per-sample (1 - i/len) decay now rides the gain envelope instead. */
  let noiseBed = null;
  function bed(a) {
    if (!noiseBed) {
      const len = Math.floor(a.sampleRate * 2);   // 2s of noise — long enough that
      noiseBed = a.createBuffer(1, len, a.sampleRate);   // repeats are inaudible
      const d = noiseBed.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBed;
  }
  function noise(dur, vol, lp) {
    const a = ctx(); if (!a) return;
    const buf = bed(a);
    const s = a.createBufferSource(); s.buffer = buf;
    s.loop = true;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    s.connect(f).connect(g).connect(master);
    s.start(a.currentTime, Math.random() * Math.max(0, buf.duration - dur));   // random slice
    s.stop(a.currentTime + dur);
  }
  /* Rate-limited at THIS call site rather than inside noise(): hit() is the one
     that fans out per damage instance (a nova, a chain, DoT ticks across every
     afflicted enemy — dozens in a single frame). The distinct one-shots that also
     use noise() — bossRoar, slam, nova, chest, hurt — must never be swallowed by
     an unrelated hit that happened to land 30ms earlier. */
  let lastHitT = -Infinity;
  function hitNoise() {
    const a = ctx(); if (!a) return;
    if (a.currentTime - lastHitT < 0.03) return;   // inaudible collapse; they'd phase anyway
    lastHitT = a.currentTime;
    noise(0.06, 0.12, 1800);
  }
  /* a deep struck bell — the Vault Keeper's only tongue. A fundamental plus faintly
     inharmonic partials, fast strike, long fade. `when` offsets the notes of one
     utterance against each other on the audio clock; `profile` picks the metal. */
  const BELL_PROFILES = [
    [[1, 1], [2.02, 0.28], [2.98, 0.1]],      // iron
    [[1, 1], [2.42, 0.22], [3.83, 0.07]],     // hollow bronze
    [[1, 1], [1.5, 0.18], [3.01, 0.12]],      // warm, a fifth in the overtones
  ];
  function chime(freq, when, dur, vol, profile) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (when || 0);
    for (const [mul, k] of (profile || BELL_PROFILES[0])) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(freq * mul, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol * k, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + dur);
    }
  }
  /* one spoken rune-word: `len` quick syllable-chimes in a randomly-picked bell metal,
     the register set by the mood and the word's place `i` in the sentence — sells climb,
     refusals fall flat and sour, greetings wake slowly, idle chatter wanders. */
  const KEEPER_BELLS = [65.41, 73.42, 82.41, 98.0, 110.0, 130.81];   // C2 D2 E2 G2 A2 C3
  function keeperWord(len, mood, i) {
    const prof = pick(BELL_PROFILES);
    let idx, step = 1, gap = 0.075, dur = 1.0, vol = 0.12;
    if (mood === "deny")       { idx = 3 - i * 2; step = -1; dur = 1.2; vol = 0.15; }
    else if (mood === "greet") { idx = i * 2; gap = 0.13; dur = 1.5; }
    else if (mood === "sell")  { idx = 1 + i; }
    else                       { idx = Math.floor(rnd(4)); step = rnd() < 0.5 ? -1 : 1; }  // chat
    for (let s = 0; s < len; s++) {
      const f = KEEPER_BELLS[clamp(idx, 0, KEEPER_BELLS.length - 1)]
                * (mood === "deny" ? 0.94 : 1) * rnd(0.99, 1.01);
      chime(f, s * gap, dur, vol, prof);
      idx += rnd() < 0.3 ? -step : step;   // mostly walks the mood's way, sometimes stumbles
    }
  }
  /* Hellforge meltdown. forgeMelt is the one-shot as the heat wave ignites: a
     long tectonic sub-groan under a rising shimmer and a steam-roar swell.
     meltBurst fires per rock as it collapses to lava — rate-limited because the
     wave can pop several rocks in the same beat and they'd just phase. */
  function forgeMelt() {
    blip(38, 2.2, "sawtooth", 0.24, 0.5);       // the mountain groans, pitch sagging
    blip(55, 1.6, "triangle", 0.16, 2.8);       // heat shimmer climbing out of it
    noise(2.0, 0.2, 240);                        // deep rumble bed
    setTimeout(() => noise(1.2, 0.16, 900), 500); // the steam-roar arrives late
  }
  let lastMeltT = -Infinity;
  function meltBurst() {
    const a = ctx(); if (!a) return;
    if (a.currentTime - lastMeltT < 0.09) return;
    lastMeltT = a.currentTime;
    noise(0.5, 0.16, 700);                       // stone flashing to liquid
    blip(70, 0.4, "sine", 0.14, 0.5);            // the gut-punch of the collapse
    blip(rnd(1400, 1900), 0.25, "sawtooth", 0.03, 0.25);  // a thin steam shriek
  }
  /* ---------- the kill-streak ratchet ----------
     streakChord stamps a tier as it opens · coinTick is the payout ladder, one
     semitone per landing soul mote · streakLost is the sigh when the window closes.
     The between-tier kills keep the original `combo` blip, so the two never overlap. */
  const TIER_ROOTS = [196, 233, 262, 311, 349, 415];   // G3 A#3 C4 D#4 F4 G#4 — a minor climb
  function streakChord(tier) {
    const f = TIER_ROOTS[Math.min(tier, TIER_ROOTS.length - 1)];
    blip(f, 0.16, "triangle", 0.07, 1.0);
    blip(f * 1.5, 0.18, "triangle", 0.05, 1.0);        // the fifth stacked over it
    if (tier >= 3) chime(f * 2, 0.04, 0.5, 0.05);      // a bell caps the high tiers
    if (tier >= 4) noise(0.10, 0.05, 3200);            // a thin cha-ching hiss
  }
  let tickIdx = 0, lastTickT = -Infinity;
  function coinTick() {
    const a = ctx(); if (!a) return;
    if (a.currentTime - lastTickT > 0.45) tickIdx = 0;   // a new payout restarts the ladder
    if (a.currentTime - lastTickT < 0.028) return;       // simultaneous arrivals would just phase
    lastTickT = a.currentTime;
    blip(880 * Math.pow(2, Math.min(tickIdx++, 14) / 12), 0.045, "square", 0.035, 1.0);
  }
  function streakLost(tier) {
    const f = TIER_ROOTS[Math.min(tier, TIER_ROOTS.length - 1)];
    blip(f, 0.18, "triangle", 0.06, 0.75);
    setTimeout(() => blip(f * 0.75, 0.22, "triangle", 0.05, 0.7), 90);
    setTimeout(() => blip(f * 0.5, 0.34, "sine", 0.05, 0.8), 200);
    noise(0.22, 0.05, 700);
  }
  /* The per-event sounds fire once per enemy shot / kill / lightning jump / blast, and a
     big horde or a chain build fires them by the hundred each second (measured 150–320
     new voices/s). Copies landing within `gap` seconds of each other collapse into one —
     the same inaudible collapse hitNoise() already makes; stacked they only phase and clip. */
  function collapse(fn, gap) {
    let last = -1;
    return (...args) => {
      const a = ctx(); if (!a) return;
      if (a.currentTime - last < gap) return;
      last = a.currentTime;
      fn(...args);
    };
  }

  return {
    unlock: () => ctx(), setVolume, suspend, resume,
    forgeMelt, meltBurst,
    streakChord, coinTick, streakLost,
    shoot: () => blip(rnd(420, 520), 0.07, "square", 0.05, 0.4),
    enemyShoot: collapse(() => blip(rnd(180, 230), 0.1, "sawtooth", 0.04, 0.5), 0.03),
    hit: hitNoise,
    hurt: () => { blip(140, 0.2, "sawtooth", 0.12, 0.4); noise(0.12, 0.15, 900); },
    kill: collapse(() => { noise(0.16, 0.16, 1200); blip(90, 0.18, "triangle", 0.1, 0.5); }, 0.03),
    dash: () => blip(700, 0.12, "sine", 0.06, 2.2),
    pickup: () => { blip(660, 0.09, "square", 0.07); setTimeout(() => blip(990, 0.12, "square", 0.07), 70); },
    chest: () => { blip(110, 0.4, "sawtooth", 0.12, 0.6); noise(0.3, 0.12, 500); },
    equip: () => blip(520, 0.12, "triangle", 0.08, 1.5),
    slam: () => { noise(0.35, 0.22, 400); blip(60, 0.35, "sine", 0.18, 0.6); },
    zap: collapse(() => blip(rnd(900, 1300), 0.08, "sawtooth", 0.05, 0.3), 0.025),
    nova: collapse(() => { noise(0.25, 0.18, 800); blip(180, 0.25, "square", 0.1, 0.4); }, 0.04),
    waveUp: () => { blip(330, 0.14, "square", 0.07); setTimeout(() => blip(440, 0.14, "square", 0.07), 110); setTimeout(() => blip(660, 0.2, "square", 0.07), 220); },
    bossRoar: () => { blip(55, 0.8, "sawtooth", 0.22, 1.6); noise(0.6, 0.2, 300); },
    portal: () => { blip(220, 0.5, "sine", 0.1, 3); blip(110, 0.5, "sine", 0.08, 3); },
    reroll: () => blip(880, 0.15, "triangle", 0.08, 0.5),
    click: () => blip(700, 0.05, "triangle", 0.035, 0.8),
    crit: collapse(() => { blip(1250, 0.09, "square", 0.09, 0.5); noise(0.05, 0.08, 2600); }, 0.04),
    combo: n => blip(280 + 55 * Math.min(n, 9), 0.07, "square", 0.05, 1.3),
    calm: () => { blip(523, 0.16, "sine", 0.06, 0.9); setTimeout(() => blip(392, 0.22, "sine", 0.05, 0.9), 130); },
    sizzle: collapse(() => noise(0.18, 0.13, 1200), 0.04),
    /* REANIMATOR rites: the pack snapping home, and the wet tithe of spent thralls */
    recall: () => { blip(300, 0.18, "sine", 0.06, 2.4); setTimeout(() => blip(620, 0.16, "triangle", 0.05, 1.6), 70); },
    sacrifice: () => { blip(150, 0.38, "triangle", 0.1, 1.8); noise(0.26, 0.12, 700); setTimeout(() => blip(430, 0.22, "sine", 0.06, 1.4), 90); },
    keeperWord,
    duck,
    /* THE SINGULAR: a mumbled voice under a line of speech, and the saloon piano */
    murmur: (base, n) => { for (let i = 0; i < n; i++) setTimeout(() => blip(base * rnd(0.85, 1.2), 0.06, "triangle", 0.03, 0.92), i * 60); },
    piano: f => { blip(f, 0.5, "triangle", 0.035); blip(f * 2.003, 0.25, "sine", 0.008); },
    hic: () => { blip(rnd(330, 400), 0.08, "triangle", 0.06, 1.9); noise(0.04, 0.03, 1600); },   // seven rounds deep
    /* the blackjack table: a card off the shoe, the hole card turning, MIDAS counting (pitch follows its value) */
    deal: () => noise(0.07, 0.08, 2800),
    flip: () => { noise(0.05, 0.07, 1800); blip(520, 0.05, "triangle", 0.03, 1.2); },
    midasStep: v => blip(330 * Math.pow(2, v / 12), 0.05, "square", 0.03),
    /* floors VI–VIII: the Saint's bell and stopped hour, the choir's panes, the star's swell */
    bell: () => { blip(196, 1.4, "sine", 0.12, 0.985); blip(392.5, 0.9, "sine", 0.045, 0.99); blip(587, 0.6, "triangle", 0.02, 0.99); },
    stillHour: () => { blip(880, 0.5, "sine", 0.08, 0.5); blip(440, 0.9, "triangle", 0.05, 0.98); },
    rewind: () => blip(200, 0.6, "sawtooth", 0.06, 3),
    pane: f => blip(f, 0.35, "sine", 0.02),
    lance: () => { blip(1600, 0.25, "sawtooth", 0.05, 0.4); noise(0.2, 0.08, 3000); },
    starSwell: () => { blip(110, 1.8, "sawtooth", 0.05, 2.2); noise(1.2, 0.05, 600); },
  };
})();
