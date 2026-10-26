/* =========================================================
   RUNEGUN · Scene — THE UNKNOWN
   The optional rift that tears open beside the way down after the first Warden
   falls. Pay half your vitality to enter a silent stage: no enemies, just a
   patient creature wreathed in runes that carves you one more rune slot.
   Playing AS THE UNKNOWN, the creature is not home — three of its runes hang
   in the hush instead. Take ONE; the path it widens by two slots.
   ========================================================= */
"use strict";

const RIFT_LINE = "Tread lightly in the unknown, traveller";
/* how near you must stand to one of the three runes to take it */
const RIFT_PICK_R = 30;
const RIFT_PICK_SLOTS = 2;          // the real unknown's absence pays better than its rite

/* step through the small portal: pay half your max vitality, descend into the hush */
function enterRift() {
  rift = null;
  const p = localPlayer();
  p.maxHpMul = 0.5;
  recalc(p);                                 // halves max vitality, clamps current hp to it
  AudioFX.bossRoar();
  setupRiftStage();
  /* sacrifice feedback AFTER the stage reset — setupRiftStage wipes the
     floaters array and zeroes the shake, so anything set before it is lost */
  screenFlash(0.4);
  Game.shake = Math.max(Game.shake, 12);
  floatText(player.x, player.y - 26, "HALF GIVEN", "#ff4d5e");
}

/* build the silent stage: empty arena, player at the bottom, the creature at its heart.
   AS THE UNKNOWN the creature is absent: its three runes hang in the middle instead. */
function setupRiftStage() {
  Game.inRift = true;
  Game.riftDone = true;
  MAP.rocks = [];
  enemies = []; bullets = []; ebullets = []; puddles = [];
  particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
  soulMotes = [];
  portal = null; rift = null;
  pets = [];                                  // the unknown is entered alone — no familiar in the hush
  Game.ambush = null; Game.boss = null; Game.shake = 0;
  Game.comboN = 0; Game.comboT = 0; Game.streakTier = -1;
  Game.bossRocks.length = 0;
  Game.chestsTotal = 0; Game.chestsOpened = 0;
  SEAL.state = "spent";                       // no seal answers in the unknown
  player.x = MAP.w / 2; player.y = MAP.h - 170;
  player.iframes = 2;
  const me = localPlayer();
  if (me && me.char === "theUnknown") {
    /* the real unknown is not home. Three of its runes wait where it would sit;
       take one and the warden's path widens by two slots. */
    const ids = genThreeRunes(me);
    const mx = MAP.w / 2, my = MAP.h / 2 + 80;
    const offs = [[-210, 24], [0, -46], [210, 24]];   // a shallow fan: all three read at once
    Game.riftCreature = null;
    Game.riftPicks = {
      t: 0, chosen: null, openT: -1,
      picks: ids.map((id, i) => ({
        id, x: mx + offs[i][0], y: my + offs[i][1],
        ph: i * 2.1, t: 0, taken: false, fade: 1,
        /* baked here, during the stage change, so the first live frame never builds one */
        spr: riftGlyphSprite(runeDefFor(me, id)),
      })),
    };
    $("mapName").textContent = "??????";
    updateSeals();
    $("bossBar").classList.remove("on");
    setState("play");
    toast("THE UNKNOWN IS NOT HERE — THREE OF ITS RUNES REMAIN");
    AudioFX.portal();
    return;
  }
  Game.riftPicks = null;
  Game.riftCreature = {
    x: MAP.w / 2, y: MAP.h / 2, r: 34, t: 0,
    phase: "wait", spin: 1, fade: 1, ritualT: 0, speakT: 0, granted: false,
    glyphs: RUNE_IDS.map((id, i) => ({
      id, a: rnd(0, TAU), orbitR: i % 2 ? 78 : 46, spin: i % 2 ? -1 : 1,
    })),
  };
  $("mapName").textContent = "??????";
  updateSeals();
  $("bossBar").classList.remove("on");
  setState("play");
  toast("YOU STEP INTO THE UNKNOWN");
  AudioFX.portal();
}

/* the one pick: the rune is carved, the warden's path widens by two slots, the
   other two runes gutter out and the way onward opens. */
function riftTakePick(q) {
  const rp = Game.riftPicks, p = localPlayer();
  if (!rp || rp.chosen || !p || q.taken) return;
  rp.chosen = q; q.taken = true;
  const R = runeDefFor(p, q.id);
  /* widen the path BEFORE the carve: grantRune() re-seals, and it must seal at
     the new, two-slot-wider count rather than shut the rune out */
  p.bonusRuneSlots = (p.bonusRuneSlots || 0) + RIFT_PICK_SLOTS;
  p.lockedRunes = null;
  grantRune(p, q.id);
  rp.openT = 1.1;
  Game.shake = Math.max(Game.shake, 10);
  screenFlash(0.28); AudioFX.nova();
  floatText(p.x, p.y - 36, R.name, R.color, 18);
  floatText(p.x, p.y - 60, "+" + RIFT_PICK_SLOTS + " RUNE SLOTS", "#ffd23d", 15);
  toast("THE RUNE IS YOURS — TWO SLOTS OPEN");
  for (let k = 0; k < 26; k++) {
    const aa = rnd(0, TAU);
    particles.push({ x: p.x, y: p.y, vx: Math.cos(aa) * rnd(120, 320), vy: Math.sin(aa) * rnd(120, 320),
      t: 0, life: rnd(0.4, 0.8), r: rnd(2, 5), color: pick([R.color, "#ffd23d", "#fff"]) });
  }
}

/* commune with the creature — begins the rite that opens a new rune slot */
function riftRitual() {
  const rc = Game.riftCreature;
  if (!rc || rc.phase !== "wait") return;
  rc.phase = "ritual"; rc.ritualT = 0;
  AudioFX.chest();
  floatText(rc.x, rc.y - rc.r - 18, "IT KNOWS YOU", "#c9b8ff");
}

/* the CHAOS rite: three runes the warden doesn't carry yet (stacks, once they carry them all) */
function riftChaosGift(p) {
  const pool = RUNE_IDS.filter(id => !p.runes[id]);
  for (let i = 0; i < 3; i++) {
    const id = pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : pick(RUNE_IDS);
    grantRune(p, id, true);
  }
  toast("THE RIFT POURS THREE RUNES INTO YOUR GUN");
}

/* per-frame rift tick: animates the small portal + the creature, returns any
   interaction hint for update() to surface */
function updateRift(dt) {
  let hint = null, act = null;

  /* the small portal pulses beside the grand seal until taken */
  if (rift) {
    rift.t += dt;
    if (dist2(rift.x, rift.y, player.x, player.y) < (rift.r + 46) ** 2 && !Game.ambush) {
      /* past floor VIII the same rift is the only way on, and it asks no toll this time */
      if (rift.final) { hint = "?????? — [ E ] STEP INTO THE UNKNOWN"; act = enterUnknown; }
      else { hint = "?????? — [ E ] SACRIFICE HALF YOUR MAX VITALITY AND ENTER"; act = enterRift; }
    }
  }

  /* AS THE UNKNOWN: the creature is absent — three of its runes wait instead */
  const rp = Game.riftPicks;
  if (rp) {
    rp.t += dt;
    const me = localPlayer();
    if (!rp.chosen) {
      let best = null, bestD = Infinity;
      for (const q of rp.picks) {
        q.t += dt;
        if (!me) continue;
        const d = dist2(q.x, q.y, me.x, me.y);
        if (d < (RIFT_PICK_R + me.r) ** 2 && d < bestD) { best = q; bestD = d; }
      }
      if (best && me) {
        hint = runeDefFor(me, best.id).name + " — [ E ] TAKE THE RUNE";
        act = () => riftTakePick(best);
      }
      /* a slow drift of motes off the three glyphs (kept sparse for the phone) */
      if (me && particles.length < 420 && Math.random() < 0.18) {
        const q = pick(rp.picks);
        particles.push({ x: q.x + rnd(-16, 16), y: q.y + rnd(-16, 16), vx: rnd(-18, 18), vy: rnd(-34, -8),
          t: 0, life: rnd(0.5, 1.0), r: rnd(1.5, 2.8), color: pick([runeDefFor(me, q.id).color, "#fff3c8"]) });
      }
    } else {
      /* the two not taken gutter out; the taken one sinks into the warden */
      for (const q of rp.picks) if (q !== rp.chosen) q.fade = Math.max(0, q.fade - dt * 1.8);
      rp.chosen.fade = Math.max(0, rp.chosen.fade - dt * 0.5);
      if (rp.openT > 0) {
        rp.openT -= dt;
        if (rp.openT <= 0 && !portal) {
          portal = { x: MAP.w / 2, y: MAP.h / 2 + 80, r: 46, t: 0 };
          AudioFX.portal(); Game.shake = Math.max(Game.shake, 8);
          toast("THE WAY ONWARD OPENS");
        }
      }
      if (rp.openT <= 0 && portal) Game.riftPicks = null;
    }
  }

  const rc = Game.riftCreature;
  if (rc) {
    rc.t += dt;
    for (const g of rc.glyphs) g.a += g.spin * rc.spin * dt;
    /* ambient violet motes drifting around it */
    if (Math.random() < 0.35) {
      const ga = rnd(0, TAU), gd = rc.r + rnd(18, 80);
      particles.push({ x: rc.x + Math.cos(ga) * gd, y: rc.y + Math.sin(ga) * gd,
        vx: Math.cos(ga + 1.4) * 22, vy: Math.sin(ga + 1.4) * 22, t: 0, life: rnd(0.4, 0.9),
        r: rnd(1.5, 3), color: pick(["#c9b8ff", "#9d6bff", "#fff3c8"]) });
    }

    if (rc.phase === "wait") {
      if (dist2(rc.x, rc.y, player.x, player.y) < (rc.r + 72) ** 2 && !hint) {
        hint = "[ E ] ??????";
        act = riftRitual;
      }

    } else if (rc.phase === "ritual") {
      rc.ritualT += dt;
      rc.spin = 1 + rc.ritualT * 4;
      /* runes spiral inward and a current pours from the creature into the player */
      for (const g of rc.glyphs) g.orbitR = lerp(g.orbitR, 10, 1 - Math.pow(0.04, dt));
      if (Math.random() < 0.9) {
        const t = rnd(0, 1);
        particles.push({ x: lerp(rc.x, player.x, t) + rnd(-10, 10), y: lerp(rc.y, player.y, t) + rnd(-10, 10),
          vx: (player.x - rc.x) * 0.6, vy: (player.y - rc.y) * 0.6, t: 0, life: 0.35,
          r: rnd(2, 4), color: pick(["#c9b8ff", "#ffd23d"]) });
      }
      /* halfway through the rite, the new slot is carved */
      if (rc.ritualT > 1.5 && !rc.granted) {
        rc.granted = true;
        /* CHAOS never seals, so a slot would be no gift — the creature pours in three runes you lack */
        if (Game.chaosMode) riftChaosGift(localPlayer());
        else grantRiftSlot(localPlayer());
        Game.shake = Math.max(Game.shake, 12); screenFlash(0.3);
        AudioFX.nova();
        floatText(player.x, player.y - 34, Game.chaosMode ? "THE RIFT POURS IN" : "A SLOT OPENS", "#ffd23d");
        for (let k = 0; k < 28; k++) {
          const aa = rnd(0, TAU);
          particles.push({ x: player.x, y: player.y, vx: Math.cos(aa) * rnd(120, 320), vy: Math.sin(aa) * rnd(120, 320),
            t: 0, life: rnd(0.4, 0.8), r: rnd(2, 5), color: pick(["#ffd23d", "#c9b8ff", "#fff"]) });
        }
      }
      if (rc.ritualT > 2.4) { rc.phase = "speak"; rc.speakT = 0; AudioFX.bossRoar(); }

    } else if (rc.phase === "speak") {
      rc.speakT += dt;
      if (rc.speakT > 1.4) rc.fade = clamp(1 - (rc.speakT - 1.4) / 1.3, 0, 1);
      /* once it has finished speaking and faded, a way onward opens where it stood */
      if (rc.speakT > 2.9 && !portal) {
        portal = { x: rc.x, y: rc.y, r: 46, t: 0 };
        AudioFX.portal(); Game.shake = Math.max(Game.shake, 8);
        toast("THE WAY ONWARD OPENS");
      }
      if (rc.fade <= 0.01 && portal) Game.riftCreature = null;
    }
  }

  return { hint, act };
}

/* one baked sprite per rune: soft violet halo + glowing glyph. Rendered once and
   reused every frame, so no shadowBlur and no gradient allocs sit in draw(). */
function riftGlyphSprite(R) {
  const S = 160, ss = 2;
  const c = document.createElement("canvas");
  c.width = c.height = S * ss;
  const g = c.getContext("2d");
  g.setTransform(ss, 0, 0, ss, 0, 0);
  g.translate(S / 2, S / 2);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 76);
  halo.addColorStop(0, "rgba(201,184,255,0.26)");
  halo.addColorStop(1, "rgba(201,184,255,0)");
  g.fillStyle = halo;
  g.beginPath(); g.arc(0, 0, 76, 0, TAU); g.fill();
  g.fillStyle = R.color; g.shadowColor = R.color; g.shadowBlur = 18;
  g.font = "bold 32px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(R.glyph, 0, 1);
  return c;
}

/* world-space render: the small rift portal, the creature, its rune halo and its parting words */
function drawRift() {
  /* the small ominous portal beside the grand seal */
  if (rift) {
    const t = rift.t;
    cx.save(); cx.translate(rift.x, rift.y);
    for (let k = 0; k < 3; k++) {
      cx.rotate(-t * (1.4 + k * 0.6));
      cx.strokeStyle = ["#ff4d5e", "#9d6bff", "#3a3654"][k];
      cx.globalAlpha = 0.75;
      cx.lineWidth = 3;
      cx.beginPath(); cx.arc(0, 0, rift.r - k * 7, t, t + TAU * 0.66); cx.stroke();
    }
    cx.globalAlpha = 1;
    cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 22;
    cx.fillStyle = "#06040a";
    cx.beginPath(); cx.arc(0, 0, rift.r - 18, 0, TAU); cx.fill();
    cx.shadowBlur = 0;
    cx.fillStyle = "#ff4d5e"; cx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
    cx.font = "16px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText("?", 0, 1);
    cx.globalAlpha = 1;
    cx.restore();
  }

  /* AS THE UNKNOWN: three of its runes hang where the creature would sit.
     The glyph + halo are baked into a sprite ONCE per rune: on Android WebView
     per-frame shadowBlur and per-frame radial gradients are the expensive part,
     and this path runs every frame for three runes at once. */
  const rp = Game.riftPicks;
  if (rp) for (const q of rp.picks) {
    if (q.fade <= 0.01) continue;
    const me = localPlayer();
    const R = me ? runeDefFor(me, q.id) : RUNES[q.id];
    if (!R) continue;
    const bob = Math.sin(q.t * 1.6 + q.ph) * 7;
    cx.save(); cx.translate(q.x, q.y + bob);
    /* the baked halo + glowing glyph */
    if (!q.spr) q.spr = riftGlyphSprite(R);
    cx.globalAlpha = q.fade;
    cx.shadowBlur = 0;
    cx.drawImage(q.spr, -80, -80, 160, 160);
    /* the ring it turns in (three cheap live strokes carry the motion) */
    cx.strokeStyle = R.color; cx.lineWidth = 2; cx.globalAlpha = q.fade * 0.7;
    for (let k = 0; k < 3; k++) {
      const a0 = q.t * (0.7 + k * 0.3) + k * TAU / 3;
      cx.beginPath(); cx.arc(0, 0, 30, a0, a0 + TAU * 0.22); cx.stroke();
    }
    /* its light pooling on the stone */
    cx.globalAlpha = q.fade * 0.16;
    cx.fillStyle = R.color;
    cx.beginPath(); cx.ellipse(0, 54, 27, 8, 0, 0, TAU); cx.fill();
    cx.globalAlpha = 1;
    cx.restore();
  }

  const rc = Game.riftCreature;
  if (rc) {
    const a = rc.fade;
    cx.save(); cx.translate(rc.x, rc.y);

    /* soft halo */
    const halo = cx.createRadialGradient(0, 0, 0, 0, 0, rc.r * 3.4);
    halo.addColorStop(0, "rgba(201,184,255," + (0.32 * a) + ")");
    halo.addColorStop(1, "rgba(201,184,255,0)");
    cx.fillStyle = halo;
    cx.beginPath(); cx.arc(0, 0, rc.r * 3.4, 0, TAU); cx.fill();

    /* the body: a dark cowled core with two patient eyes */
    cx.globalAlpha = a;
    cx.fillStyle = "#0a0818";
    cx.shadowColor = "#9d6bff"; cx.shadowBlur = 26;
    cx.beginPath(); cx.arc(0, 0, rc.r, 0, TAU); cx.fill();
    cx.shadowBlur = 0;
    cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 2; cx.globalAlpha = a * 0.8;
    cx.beginPath(); cx.arc(0, 0, rc.r, 0, TAU); cx.stroke();
    const eyeGlow = 0.6 + 0.4 * Math.sin(rc.t * 3);
    cx.globalAlpha = a * eyeGlow;
    cx.fillStyle = "#fff3c8"; cx.shadowColor = "#ffd23d"; cx.shadowBlur = 12;
    cx.beginPath(); cx.arc(-9, -3, 3.4, 0, TAU); cx.fill();
    cx.beginPath(); cx.arc(9, -3, 3.4, 0, TAU); cx.fill();
    cx.shadowBlur = 0;

    /* the rune halo — every glyph in the game, orbiting */
    cx.font = "bold 18px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    for (const g of rc.glyphs) {
      const R = RUNES[g.id];
      const gx = Math.cos(g.a) * g.orbitR, gy = Math.sin(g.a) * g.orbitR;
      cx.globalAlpha = a;
      cx.fillStyle = R.color; cx.shadowColor = R.color; cx.shadowBlur = 12;
      cx.fillText(R.glyph, gx, gy);
    }
    cx.shadowBlur = 0;
    cx.globalAlpha = 1;
    cx.restore();

    /* its parting words, hanging in the dark above it */
    if (rc.phase === "speak") {
      const ta = clamp(rc.speakT < 0.4 ? rc.speakT / 0.4 : 1, 0, 1) * clamp(rc.fade + 0.25, 0, 1);
      cx.globalAlpha = ta;
      cx.fillStyle = "#e8e2d0"; cx.shadowColor = "#9d6bff"; cx.shadowBlur = 16;
      cx.font = "italic 22px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(RIFT_LINE, rc.x, rc.y - rc.r - 64);
      cx.shadowBlur = 0; cx.globalAlpha = 1;
    }
  }
}
