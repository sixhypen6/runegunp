/* =========================================================
   RUNEGUN · Scene — the void ending
   The cinematic that plays when THE UNKNOWN falls (past floor VIII): gather the runes, then ride out or fall again.
   ========================================================= */
"use strict";

/* =========================================================
   THE ENDING — plays when THE UNKNOWN falls, past the last living star
   (it followed the Event Horizon, then the Other Gunslingers, before that).
   Every rune in the game tears loose from the catacomb and spins
   around the player in two counter-rotating rings. Then the run
   asks its only real question: climb out, or fall forever.
   phases: gather → (player chooses) → deeper | exit
   ========================================================= */
const ENDING = { t: 0, phase: "idle", glyphs: [], rings: [], stars: [], revealed: false, ringT: 0 };

function startEnding() {
  ENDING.t = 0; ENDING.phase = "gather"; ENDING.revealed = false; ENDING.ringT = 0;
  ENDING.rings = []; ENDING.stars = [];
  $("voidChoice").classList.remove("reveal");
  /* CLASSIC runs end here, at THE EVENT HORIZON: no way back down is offered */
  const classic = !!Game.classicMode;
  $("vcTitle").textContent = classic ? "THE EVENT HORIZON COLLAPSES" : "THE UNKNOWN FALLS";
  $("vcSub").textContent = classic
    ? "THE DEEP CLOSES BEHIND YOU — THE DESCENT ENDS WHERE IT ALWAYS DID"
    : "EVERY RUNE EVER CARVED ANSWERS IN CHORUS — CHOOSE";
  $("vcDeeper").style.display = classic ? "none" : "";
  const far = Math.max(W, H) * 0.8;
  ENDING.glyphs = RUNE_IDS.map((id, i) => ({
    id,
    ring: i % 2,                                /* alternate between the two rings */
    a: rnd(0, TAU),                             /* current orbit angle */
    r: far + rnd(0, 320),                       /* start far off screen */
    orbitR: i % 2 ? 132 : 80,                   /* outer / inner ring radius */
    spin: i % 2 ? -1 : 1,                       /* counter-rotation */
    delay: (i % 7) * 0.14 + rnd(0, 0.2),        /* staggered arrival */
    vr: 0, gone: false, lx: 0, ly: 0,
  }));
  bullets.length = 0; ebullets.length = 0; pickups.length = 0; mines.length = 0; shells.length = 0;
  soulMotes.length = 0;   // a payout still in flight would hang over the ending
  AudioFX.bossRoar();
  setState("ending");
}

function drawEndingGlyphs(px, py, alpha, streakLen) {
  cx.font = "bold 22px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
  for (const g of ENDING.glyphs) {
    if (g.gone) continue;
    const R = RUNES[g.id];
    const x = px + Math.cos(g.a) * g.r, y = py + Math.sin(g.a) * g.r;
    if (streakLen > 0 && g.lx) {                /* exit phase: glyphs stretch into comets */
      cx.strokeStyle = R.color; cx.globalAlpha = alpha * 0.55; cx.lineWidth = 2.5;
      cx.beginPath(); cx.moveTo(g.lx, g.ly); cx.lineTo(x, y); cx.stroke();
    }
    cx.shadowColor = R.color; cx.shadowBlur = 16;
    cx.fillStyle = R.color; cx.globalAlpha = alpha;
    cx.fillText(R.glyph, x, y);
    cx.shadowBlur = 0;
    g.lx = x; g.ly = y;
  }
  cx.globalAlpha = 1;
}

function endingVignette(strength) {
  const grad = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.78);
  grad.addColorStop(0, "rgba(7,5,16,0)");
  grad.addColorStop(1, "rgba(7,5,16," + strength + ")");
  cx.fillStyle = grad; cx.fillRect(0, 0, W, H);
}

function endingFrame(dt) {
  ENDING.t += dt;
  const t = ENDING.t;

  /* keep the dead arena breathing underneath */
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) particles.splice(i, 1); }
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; f.y -= (f.vy === undefined ? 40 : f.vy) * dt; if (f.t > (f.life || 0.7)) floaters.splice(i, 1); }
  for (let i = veils.length - 1; i >= 0; i--) { veils[i].t += dt; if (veils[i].t > veils[i].life) veils.splice(i, 1); }
  Game.cam.x = lerp(Game.cam.x, clamp(player.x - VW / 2, 0, MAP.w - VW), 1 - Math.pow(0.001, dt));
  Game.cam.y = lerp(Game.cam.y, clamp(player.y - VH / 2, 0, MAP.h - VH), 1 - Math.pow(0.001, dt));
  if (MAP.w < VW) Game.cam.x = (MAP.w - VW) / 2;
  if (MAP.h < VH) Game.cam.y = (MAP.h - VH) / 2;
  Game.shake = Math.max(0, Game.shake - dt * 30);
  draw();

  /* draw() applies the world->screen ZOOM then restores; the overlay below draws in
     raw screen space, so convert the player's world position the same way draw() does */
  const px = (player.x - Game.cam.x) * ZOOM, py = (player.y - Game.cam.y) * ZOOM;   /* player in screen space */

  if (ENDING.phase === "gather") {
    /* every rune in the game flies in and the chorus accelerates */
    const spin = 1.1 + Math.min(t, 6) * 0.55;
    for (const g of ENDING.glyphs) {
      if (t > g.delay) g.r = lerp(g.r, g.orbitR, 1 - Math.pow(0.04, dt));
      g.a += g.spin * spin * dt;
      if (Math.random() < 0.08 && Math.abs(g.r - g.orbitR) < 30)
        particles.push({ x: player.x + Math.cos(g.a) * g.r, y: player.y + Math.sin(g.a) * g.r,
          vx: rnd(-20, 20), vy: rnd(-20, 20), t: 0, life: 0.35, r: 2, color: RUNES[g.id].color });
    }
    /* faint orbit tracks + a pulse around the chosen one */
    cx.strokeStyle = "#9d6bff"; cx.globalAlpha = 0.18; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(px, py, 80, 0, TAU); cx.stroke();
    cx.beginPath(); cx.arc(px, py, 132, 0, TAU); cx.stroke();
    cx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 4);
    cx.shadowColor = "#c9b8ff"; cx.shadowBlur = 24;
    cx.beginPath(); cx.arc(px, py, 26 + Math.sin(t * 4) * 4, 0, TAU); cx.stroke();
    cx.shadowBlur = 0; cx.globalAlpha = 1;
    drawEndingGlyphs(px, py, Math.min(1, t / 0.6), 0);
    endingVignette(0.45 + 0.25 * Math.min(1, t / 2));
    if (t > 3.0 && !ENDING.revealed) { ENDING.revealed = true; $("voidChoice").classList.add("reveal"); }

  } else if (ENDING.phase === "deeper") {
    /* the runes are devoured — the world funnels into the singularity */
    const k = clamp(t / 2.4, 0, 1);
    for (const g of ENDING.glyphs) {
      if (g.gone) continue;
      g.a += g.spin * (3 + k * 16) * dt;
      g.r = Math.max(0, g.r - (70 + k * 620) * dt);
      if (g.r < 8) {
        g.gone = true;
        for (let i = 0; i < 6; i++) particles.push({ x: player.x, y: player.y,
          vx: rnd(-180, 180), vy: rnd(-180, 180), t: 0, life: 0.3, r: rnd(2, 4), color: RUNES[g.id].color });
        AudioFX.zap();
      }
    }
    drawEndingGlyphs(px, py, 1, 0);
    /* violet tunnel rings rushing inward */
    ENDING.ringT -= dt;
    if (ENDING.ringT <= 0 && ENDING.rings.length < 24) { ENDING.ringT = 0.11; ENDING.rings.push({ r: Math.max(W, H) * 0.85 }); }
    for (let i = ENDING.rings.length - 1; i >= 0; i--) {
      const rg = ENDING.rings[i];
      rg.r -= (650 + k * 1500) * dt;
      if (rg.r <= 4) { ENDING.rings.splice(i, 1); continue; }
      cx.strokeStyle = "#9d6bff"; cx.globalAlpha = clamp(0.1 + k * 0.6, 0, 0.7) * clamp(rg.r / 80, 0, 1);
      cx.lineWidth = 2 + k * 4;
      cx.beginPath(); cx.arc(px, py, rg.r, 0, TAU); cx.stroke();
    }
    cx.globalAlpha = 1;
    /* the dark swallows everything */
    cx.fillStyle = "rgba(5,3,12," + clamp((t - 1.2) / 1.1, 0, 1) + ")";
    cx.fillRect(0, 0, W, H);
    if (t > 2.6) {
      ENDING.phase = "idle";
      setState("choice");
      $("bcTitle").textContent = "THE UNKNOWN YIELDS — THE DESCENT IS ENDLESS";
      $("bcHealDesc").textContent = "Restore " + Math.round(player.maxHp / 2) + " vitality (half your maximum).";
      toast("THE CATACOMB LOOPS — AND IT ONLY GETS HUNGRIER");
      AudioFX.portal();
    }

  } else if (ENDING.phase === "exit") {
    /* escape velocity — the runes become comets, the light takes you */
    for (const g of ENDING.glyphs) {
      g.vr += 1000 * dt;
      g.r += g.vr * dt;
      g.a += g.spin * 0.5 * dt;
    }
    /* radial starfield streaking outward */
    if (ENDING.stars.length < 90) for (let i = 0; i < 3; i++)
      ENDING.stars.push({ a: rnd(0, TAU), r: rnd(10, 90), v: rnd(420, 1300) });
    cx.strokeStyle = "#fff3c8"; cx.lineWidth = 2;
    for (const st of ENDING.stars) {
      st.r += st.v * dt * (1 + t * 0.8);
      const len = 10 + st.r * 0.12;
      cx.globalAlpha = clamp(0.15 + t * 0.3, 0, 0.8);
      cx.beginPath();
      cx.moveTo(px + Math.cos(st.a) * st.r, py + Math.sin(st.a) * st.r);
      cx.lineTo(px + Math.cos(st.a) * (st.r + len), py + Math.sin(st.a) * (st.r + len));
      cx.stroke();
      if (st.r > Math.max(W, H)) { st.r = rnd(10, 60); st.a = rnd(0, TAU); }
    }
    cx.globalAlpha = 1;
    drawEndingGlyphs(px, py, clamp(1 - t / 2.6, 0, 1), 1);
    /* the white-out: light floods in as you breach the horizon */
    const wash = clamp((t - 1.1) / 1.5, 0, 1);
    cx.fillStyle = "rgba(255,250,238," + (wash * wash) + ")";
    cx.fillRect(0, 0, W, H);
    if (t > 3.0) { ENDING.phase = "idle"; showAscend(); }
  }
}

function chooseEndingExit() {
  if (Game.state !== "ending" || ENDING.phase !== "gather") return;
  ENDING.phase = "exit"; ENDING.t = 0;
  for (const g of ENDING.glyphs) { g.vr = 60; g.lx = 0; g.ly = 0; }
  $("voidChoice").classList.remove("reveal");
  AudioFX.waveUp(); AudioFX.slam();
}
function chooseEndingDeeper() {
  if (Game.state !== "ending" || ENDING.phase !== "gather") return;
  if (Game.classicMode) return;                 // a CLASSIC descent has no deeper to fall into
  ENDING.phase = "deeper"; ENDING.t = 0; ENDING.ringT = 0;
  $("voidChoice").classList.remove("reveal");
  AudioFX.bossRoar();
}
$("vcExit").addEventListener("click", chooseEndingExit);
$("vcDeeper").addEventListener("click", chooseEndingDeeper);

/* the victory tally — the only screen in the game you have to earn twice over */
function showAscend() {
  const banked = bankSouls();
  setState("ascend");
  $("aHardTag").style.display = Game.hardMode ? "" : "none";
  $("aChaosTag").style.display = Game.chaosMode ? "" : "none";
  if ($("aClassicTag")) $("aClassicTag").style.display = Game.classicMode ? "" : "none";
  if ($("aSub")) $("aSub").textContent = Game.classicMode
    ? "THE HORIZON IS BEHIND YOU — THE OLD DESCENT IS DONE"
    : "YOU WALKED OUT UNDER THE LAST LIVING STAR";
  $("aWave").textContent = ROMAN(Game.wave);
  $("aDepth").textContent = depth() + 1;
  $("aScore").textContent = Game.score;
  $("aKills").textContent = Game.kills;
  /* the same precise live-run clock the HUD and the death screen use */
  $("aTime").textContent = typeof RunTimer !== "undefined" ? fmtRunTime(RunTimer.t) : (() => {
    const tt = Math.floor(Game.time);
    return Math.floor(tt / 60) + ":" + String(tt % 60).padStart(2, "0");
  })();
  const dr = $("ascendRunes");
  dr.innerHTML = "";
  const ap = localPlayer();
  const ids = ap ? Object.keys(ap.runes).filter(id => ap.runes[id] > 0) : [];
  if (ids.length === 0) dr.innerHTML = "<span style='color:var(--dim);font-size:11px'>— none — the void was beaten bare-handed —</span>";
  ids.forEach(id => {
    const R = runeDefFor(ap, id);
    const sp = document.createElement("span");
    sp.textContent = R.glyph + (ap.runes[id] > 1 ? "×" + ap.runes[id] : "");
    sp.style.color = R.color;
    sp.style.textShadow = "0 0 10px " + R.color;
    dr.appendChild(sp);
  });
  $("aBankedLine").textContent = "+" + banked + " SOULS BANKED — SPEND THEM IN THE VAULT";
  const improved = recordBests();
  $("aBestLine").textContent = bestLineText(improved);
  Leaderboard.submitRun(improved);   // no-op off the native shell / until Phase 2 ships
  fillRunRankLine("aRankLine", "ascend");   // async projected rank — never delays the tally
  devRunEndLines("a");                      // a TEST TOOLS run says plainly that nothing was kept
}
/* same as the death screen's DESCEND AGAIN: choose the descent afresh */
$("btnAscendAgain").addEventListener("click", () => openModeChoice());
$("btnAscendMenu").addEventListener("click", () => { refreshMenu(); setState("menu"); });

