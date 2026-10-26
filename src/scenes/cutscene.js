/* =========================================================
   RUNEGUN · Scene — intro cutscene
   The skippable opening: the fall into the void, chased by the other gunslingers.
   ========================================================= */
"use strict";

/* =========================================================
   INTRO CUTSCENE — the fall into the void (skippable)
   ========================================================= */
const CUT = { t: 0, stars: [], chasers: [], shots: [], trail: [], sndHole: false, sndSuck: false,
  phase: "fall", line: 0, lineT: 0, driftT: 0, ret: "play" };
const CUT_CHASE = 2.4, CUT_HOLE = 6.0, CUT_SUCK = 8.6, CUT_END = 12.2;

/* the confused monologue that plays after the fall — the player, adrift and disoriented.
   Advanced one line per tap (see cutsceneTap). Mixed-case, quoted: he's talking to himself. */
const MONO = [
  "…where am I?",
  "The gunners chasing me… they've lost my trail.",
  "But I sense danger ahead.",
];

function startCutscene(returnState) {
  CUT.t = 0; CUT.shots = []; CUT.trail = [];
  CUT.sndHole = CUT.sndSuck = false;
  CUT.phase = "fall"; CUT.line = 0; CUT.lineT = 0; CUT.driftT = 0;
  CUT.ret = returnState || "play";   // "play" = descend into a run · "menu" = replayed from Settings
  CUT.stars = [];
  for (let i = 0; i < 150; i++)
    CUT.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8 });
  const charOrder = ["gunsmith", "wraith", "juggernaut", "alchemist", "gunsmith"];
  CUT.chasers = charOrder.map((char, i) => ({
    char, col: CHARS[char].color, lane: (i - 2) * 52, off: 130 + (i % 3) * 55,
    sway: Math.random() * 6, fireT: 0.4 + Math.random() * 0.5, x: -240, y: H / 2,
  }));
  setState("cutscene");
}

/* the fall hands off to the drifting monologue instead of ending the scene */
function beginDrift() {
  CUT.phase = "drift"; CUT.driftT = 0; CUT.line = 0; CUT.lineT = 0;
}

function enterPlay() {   // shared play-entry tail (also used by endTutorial + startGame)
  AudioFX.portal();
  Game.intermission = Math.max(Game.intermission || 0, 0.9);
  setState("play");
  toast("CARVE YOUR WAY BACK TO THE LIGHT");
}

function endCutscene() {   // finish the whole opening (natural end of the monologue, or a full skip)
  if (Game.state !== "cutscene") return;
  Meta.seenCutscene = true; metaSave();
  if (CUT.ret === "menu") { setState("menu"); refreshMenu(); return; }  // replayed from Settings
  if (!Meta.seenTutorial) { startTutorial("play"); return; }            // first descent: teach the ropes first
  enterPlay();
}

let cutLastTap = 0;
function cutsceneTap() {   // tap / click / any key while in the cutscene
  if (Game.state !== "cutscene") return;
  const now = performance.now();
  if (now - cutLastTap < 240) return;                     // swallow the synthetic mouse tap trailing a touch
  cutLastTap = now;
  if (CUT.phase === "fall") { beginDrift(); return; }     // tap during the fall → jump to the monologue
  CUT.line++; CUT.lineT = 0;
  if (CUT.line >= MONO.length) { endCutscene(); return; } // past the last line → finish the opening
}
window.addEventListener("touchstart", () => { if (Game.state === "cutscene") cutsceneTap(); }, { passive: true });

function cutDrawChar(x, y, rot, sx, sy, col, alpha, flame, charType) {
  /* the gun's warpaint follows the character into every scene; unpainted barrels
     match the body here (no run, no runes to tint them) */
  const gun = gunSkinColor() || col;
  cx.save(); cx.translate(x, y); cx.rotate(rot); cx.scale(sx, sy);
  cx.globalAlpha = alpha;
  const backX = charType === "juggernaut" ? -13 : -11;
  if (flame > 0) {
    const f = 14 + Math.random() * 12 * flame;
    cx.fillStyle = "#ffd23d"; cx.shadowColor = "#ff5e2e"; cx.shadowBlur = 14;
    cx.beginPath(); cx.moveTo(backX, -4); cx.lineTo(backX - f, 0); cx.lineTo(backX, 4); cx.closePath(); cx.fill();
    cx.shadowBlur = 0;
  }
  cx.fillStyle = col;
  if (charType === "gunsmith") {
    /* pentagon body pointing right + double barrel */
    cx.beginPath();
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; i === 0 ? cx.moveTo(Math.cos(a)*12, Math.sin(a)*12) : cx.lineTo(Math.cos(a)*12, Math.sin(a)*12); }
    cx.closePath(); cx.fill();
    cx.fillStyle = "#0a0a14"; cx.fillRect(-3, -2.5, 9, 5);
    cx.strokeStyle = gun; cx.lineWidth = 2.5; cx.lineCap = "round";
    for (const s of [-3.5, 3.5]) { cx.beginPath(); cx.moveTo(10, s); cx.lineTo(22, s); cx.stroke(); }
  } else if (charType === "wraith") {
    /* diamond body + ghost tendrils + single barrel */
    cx.beginPath(); cx.moveTo(14, 0); cx.lineTo(0, 10); cx.lineTo(-13, 0); cx.lineTo(0, -10); cx.closePath(); cx.fill();
    cx.strokeStyle = col; cx.lineWidth = 1.5; cx.lineCap = "round"; cx.globalAlpha = alpha * 0.45;
    for (const oy of [-7, 0, 7]) { cx.beginPath(); cx.moveTo(-13, 0); cx.quadraticCurveTo(-20, oy * 0.4, -28, oy); cx.stroke(); }
    cx.globalAlpha = alpha;
    cx.fillStyle = "#0a0a14"; cx.beginPath(); cx.arc(3, 0, 3, 0, TAU); cx.fill();
    cx.strokeStyle = gun; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(14, 0); cx.lineTo(28, 0); cx.stroke();
  } else if (charType === "juggernaut") {
    /* hexagon body + shoulder bumps + block barrel */
    cx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; i === 0 ? cx.moveTo(Math.cos(a)*13, Math.sin(a)*13) : cx.lineTo(Math.cos(a)*13, Math.sin(a)*13); }
    cx.closePath(); cx.fill();
    cx.beginPath(); cx.arc(0, -13, 5, 0, TAU); cx.fill();
    cx.beginPath(); cx.arc(0, 13, 5, 0, TAU); cx.fill();
    cx.fillStyle = "#0a0a14"; cx.fillRect(-1, -3, 9, 6);
    cx.strokeStyle = gun; cx.lineWidth = 8; cx.lineCap = "square";
    cx.beginPath(); cx.moveTo(13, 0); cx.lineTo(25, 0); cx.stroke();
    cx.strokeStyle = "#0a0a14"; cx.lineWidth = 3;
    cx.beginPath(); cx.moveTo(19, 0); cx.lineTo(26, 0); cx.stroke();
  } else if (charType === "demolitionist") {
    /* squat octagon + stub mortar + spare mine on the back */
    cx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; i === 0 ? cx.moveTo(Math.cos(a)*12, Math.sin(a)*12) : cx.lineTo(Math.cos(a)*12, Math.sin(a)*12); }
    cx.closePath(); cx.fill();
    cx.fillStyle = "#0a0a14"; cx.fillRect(0, -2.5, 9, 5);
    cx.beginPath(); cx.arc(-8, 0, 4, 0, TAU); cx.fill();
    cx.fillStyle = "#ffd23d"; cx.beginPath(); cx.arc(-8, 0, 1.6, 0, TAU); cx.fill();
    cx.strokeStyle = gun; cx.lineWidth = 6; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(11, 0); cx.lineTo(21, 0); cx.stroke();
    cx.strokeStyle = "#0a0a14"; cx.lineWidth = 2.5;
    cx.beginPath(); cx.moveTo(16, 0); cx.lineTo(22, 0); cx.stroke();
  } else if (charType === "theUnknown") {
    /* void-ring body with orbiting rune glyphs */
    const ua = t * 0.9;
    for (let k = 0; k < 3; k++) {
      const a = ua + k * TAU / 3;
      cx.fillStyle = "rgba(201,184,255," + (0.35 + 0.25 * Math.sin(t * 2 + k)) + ")";
      cx.beginPath(); cx.arc(Math.cos(a) * 14, Math.sin(a) * 14, 3, 0, TAU); cx.fill();
    }
    cx.fillStyle = "#0a0818";
    cx.beginPath(); cx.arc(0, 0, 13, 0, TAU); cx.fill();
    cx.strokeStyle = col; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(0, 0, 11, 0, TAU); cx.stroke();
    cx.fillStyle = col; cx.font = "bold 12px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText("?", 0, 1);
    cx.strokeStyle = gun; cx.lineWidth = 2.5; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(11, 0); cx.lineTo(24, 0); cx.stroke();
  } else {
    /* alchemist: triangle body + forked barrel */
    cx.beginPath(); cx.moveTo(14, 0); cx.lineTo(-11, 11); cx.lineTo(-11, -11); cx.closePath(); cx.fill();
    cx.fillStyle = "#0a0a14"; cx.fillRect(10, -3, 5, 6);
    cx.strokeStyle = gun; cx.lineWidth = 2; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(8, 0); cx.lineTo(20, 0); cx.stroke();
    for (const s of [-1, 1]) { cx.beginPath(); cx.moveTo(20, 0); cx.lineTo(25, s * 4); cx.stroke(); }
  }
  cx.restore();
}

function cutsceneFrame(dt) {
  if (CUT.phase === "drift") { driftFrame(dt); return; }
  CUT.t += dt;
  const t = CUT.t;
  if (t >= CUT_END) { beginDrift(); return; }

  const hx = W * 0.84, hy = H * 0.5;
  const g = clamp((t - CUT_HOLE) / 1.6, 0, 1);                 /* hole formation */
  const s = clamp((t - CUT_SUCK) / 2.4, 0, 1);                 /* suck-in progress */
  const holeR = (g * 0.30 + s * 0.10) * Math.min(W, H) * (1 + Math.sin(t * 5) * 0.012);
  if (g > 0 && !CUT.sndHole) { CUT.sndHole = true; AudioFX.portal(); }
  if (s > 0 && !CUT.sndSuck) { CUT.sndSuck = true; AudioFX.bossRoar(); }

  /* ---------- ship position ---------- */
  const e = s * s;                                             /* ease-in fall */
  const bx = W * 0.36, by = H * 0.5 + Math.sin(t * 1.7) * 16 + Math.sin(t * 4.3) * 5;
  const shipX = bx + (hx - bx) * e, shipY = by + (hy - by) * e;
  const shipRot = e * 9 + Math.sin(t * 2) * 0.06;
  const stretch = 1 + e * 2.4, squash = 1 - e * 0.8;           /* spaghettification */
  const shipA = 1 - clamp((s - 0.82) / 0.18, 0, 1);

  /* ---------- update stars ---------- */
  for (const st of CUT.stars) {
    st.x -= (40 + st.z * 260) * (1 + (t > CUT_CHASE ? 0.8 : 0)) * dt;
    if (g > 0) {
      const dx = hx - st.x, dy = hy - st.y, d = Math.hypot(dx, dy) || 1;
      const pull = g * (90 + 900 * s) * clamp(1 - d / (W * 0.95), 0, 1);
      st.x += (dx / d * pull - dy / d * pull * 0.55) * dt;
      st.y += (dy / d * pull + dx / d * pull * 0.55) * dt;
      if (d < holeR * 0.55) { st.x = Math.random() * W * 0.4; st.y = Math.random() * H; }
    }
    if (st.x < -12) { st.x = W + 12; st.y = Math.random() * H; }
  }

  /* ---------- update chasers + shots ---------- */
  const arrive = clamp((t - CUT_CHASE) / 1.1, 0, 1);
  CUT.chasers.forEach((c, i) => {
    const s2 = clamp((t - CUT_SUCK - 0.35) / 1.7, 0, 1), e2 = s2 * s2;
    const tx = bx - c.off * (1.6 - 0.6 * arrive) - (1 - arrive) * 380;
    const ty = H * 0.5 + c.lane + Math.sin(t * 2.2 + c.sway) * 30;
    c.x = tx + (hx - tx) * e2; c.y = ty + (hy - ty) * e2;
    c.rot = e2 * (11 + i); c.scale = 0.82 * (1 - e2 * 0.85); c.a = 1 - clamp((s2 - 0.75) / 0.25, 0, 1);
    c.fireT -= dt;
    if (arrive >= 1 && t < CUT_SUCK + 0.4 && c.fireT <= 0) {   /* they fire past you */
      c.fireT = 0.32 + Math.random() * 0.35;
      CUT.shots.push({ x: c.x + 22, y: c.y, vy: (shipY - c.y) * 0.6 + rnd(-60, 60), col: c.col });
      if (i === 0) AudioFX.enemyShoot();
    }
  });
  for (let i = CUT.shots.length - 1; i >= 0; i--) {
    const sh = CUT.shots[i];
    sh.x += 980 * dt; sh.y += sh.vy * dt;
    if (g > 0) { sh.vy += (hy - sh.y) * 1.6 * g * dt; }
    if (sh.x > W + 60) CUT.shots.splice(i, 1);
  }

  /* ---------- ship trail ---------- */
  CUT.trail.push({ x: shipX - 14, y: shipY, life: 0.5 });
  for (let i = CUT.trail.length - 1; i >= 0; i--) { CUT.trail[i].life -= dt; if (CUT.trail[i].life <= 0) CUT.trail.splice(i, 1); }

  /* ============================ DRAW ============================ */
  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#03020a"); grad.addColorStop(0.5, "#070512"); grad.addColorStop(1, "#03020a");
  cx.fillStyle = grad; cx.fillRect(0, 0, W, H);

  cx.save();
  if (s > 0 && Meta.shake !== false) cx.translate(rnd(-7, 7) * s, rnd(-7, 7) * s);     /* shake while falling */

  for (const st of CUT.stars) {                                /* streaking starfield */
    const len = 6 + st.z * 26 * (1 + (t > CUT_CHASE ? 0.9 : 0) + s * 2);
    cx.strokeStyle = "rgba(220,215,255," + (0.25 + st.z * 0.55) + ")";
    cx.lineWidth = st.z * 1.6;
    let ang = 0;
    if (g > 0) { const d = Math.hypot(hx - st.x, hy - st.y); ang = Math.atan2(hy - st.y, hx - st.x) * clamp(1 - d / (W * 0.95), 0, 1) * g; }
    cx.beginPath(); cx.moveTo(st.x, st.y);
    cx.lineTo(st.x + Math.cos(Math.PI + ang) * -len, st.y + Math.sin(ang) * len * 0.3 - 0);
    cx.stroke();
  }

  /* ---------- the black hole ---------- */
  if (g > 0) {
    cx.save(); cx.translate(hx, hy);
    const R = holeR;
    const halo = cx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 2.4);
    halo.addColorStop(0, "rgba(157,107,255,0.30)"); halo.addColorStop(1, "rgba(157,107,255,0)");
    cx.fillStyle = halo; cx.beginPath(); cx.arc(0, 0, R * 2.4, 0, 7); cx.fill();
    cx.strokeStyle = "rgba(201,184,255,0.5)"; cx.lineWidth = 1.5; cx.setLineDash([10, 14]);
    cx.beginPath(); cx.arc(0, 0, Math.max(0, R * 1.7 + Math.sin(t * 3) * 6), t * 0.6, t * 0.6 + 7); cx.stroke();
    cx.setLineDash([]);
    for (let k = 0; k < 3; k++) {                              /* accretion arcs */
      cx.save(); cx.rotate(t * (0.8 + k * 0.35 + s * 1.6) + k * 2.1); cx.scale(1, 0.34 + k * 0.1);
      cx.strokeStyle = ["#9d6bff", "#ffd23d", "#ffffff"][k]; cx.lineWidth = 2.5 - k * 0.6;
      cx.shadowColor = "#9d6bff"; cx.shadowBlur = 16;
      cx.beginPath(); cx.arc(0, 0, R * (1.18 + k * 0.16), 0.4, 2.5); cx.stroke();
      cx.restore();
    }
    cx.shadowColor = g > 0.7 ? "#c9b8ff" : "transparent"; cx.shadowBlur = 24;
    cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(0, 0, R, 0, 7); cx.stroke();
    cx.shadowBlur = 0;
    cx.fillStyle = "#000";
    cx.beginPath(); cx.arc(0, 0, R * 0.97, 0, 7); cx.fill();
    cx.restore();
  }

  for (const p of CUT.trail) {                                 /* engine trail */
    cx.globalAlpha = p.life * 1.6; cx.fillStyle = "#ffd23d";
    cx.beginPath(); cx.arc(p.x, p.y, p.life * 5, 0, 7); cx.fill();
  }
  cx.globalAlpha = 1;

  for (const sh of CUT.shots) {                                /* tracer fire whipping past */
    cx.strokeStyle = sh.col; cx.lineWidth = 2.5; cx.shadowColor = sh.col; cx.shadowBlur = 10;
    cx.beginPath(); cx.moveTo(sh.x, sh.y); cx.lineTo(sh.x - 42, sh.y - sh.vy * 0.03); cx.stroke();
    cx.shadowBlur = 0;
  }

  for (const c of CUT.chasers)                                 /* the other gunslingers */
    if (t > CUT_CHASE - 0.4 && c.a > 0) cutDrawChar(c.x, c.y, c.rot || 0, c.scale || 0.82, c.scale || 0.82, c.col, c.a, 1, c.char);

  if (shipA > 0)                                               /* you */
    cutDrawChar(shipX, shipY, shipRot, stretch, squash, skinColor(), shipA, 1 - s * 0.6, Meta.char);

  cx.restore();

  /* ---------- letterbox + captions ---------- */
  const bar = H * 0.085 * clamp(t / 0.6, 0, 1);
  cx.fillStyle = "#000";
  cx.fillRect(0, 0, W, bar); cx.fillRect(0, H - bar, W, bar);

  const caps = [
    [0.6, 3.0, "SOMEWHERE PAST THE LAST LIVING STAR"],
    [3.2, 6.2, "THE OTHER GUNSLINGERS CAME FOR YOUR RUNES"],
    [6.6, 9.4, "YOU RAN — BUT THE DARK WAS ALREADY HUNGRY"],
    [9.9, 12.2, "THE VOID BENEATH TAKES WHAT IT IS OWED"],
  ];
  cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = "13px monospace";
  for (const [a, b2, txt] of caps) {
    if (t < a || t > b2) continue;
    const fade = Math.min(clamp((t - a) / 0.4, 0, 1), clamp((b2 - t) / 0.4, 0, 1));
    cx.fillStyle = "rgba(232,228,216," + fade + ")";
    cx.fillText(txt.split("").join(" "), W / 2, H - bar - 30);
  }

  cx.font = "10px monospace"; cx.textAlign = "right";          /* skip hint */
  cx.fillStyle = "rgba(150,145,165," + (0.55 + Math.sin(t * 4) * 0.25) + ")";
  cx.fillText((Input.touchMode ? "TAP TO SKIP" : anyKeyText() + " TO SKIP") + "  ▸▸", W - 18, H - bar - 14);
  cx.textAlign = "left";

  const f = clamp((t - 11.3) / 0.7, 0, 1);                     /* swallowed — flash out */
  if (f > 0) { cx.fillStyle = "rgba(255,255,255," + f + ")"; cx.fillRect(0, 0, W, H); }
}

/* =========================================================
   DRIFT — the aftermath: adrift in the calm, the player mutters to himself.
   Tap-to-advance monologue (see cutsceneTap); a full skip / the last line ends the opening.
   ========================================================= */
function driftFrame(dt) {
  CUT.driftT += dt; CUT.lineT += dt;
  const t = CUT.driftT;

  for (const st of CUT.stars) {                 /* stars drift slowly by — no black-hole pull now */
    st.x -= (10 + st.z * 26) * dt;
    if (st.x < -12) { st.x = W + 12; st.y = Math.random() * H; }
  }

  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#04030c"); grad.addColorStop(0.5, "#080615"); grad.addColorStop(1, "#04030c");
  cx.fillStyle = grad; cx.fillRect(0, 0, W, H);

  for (const st of CUT.stars) {                 /* soft, near-still starfield */
    cx.globalAlpha = 0.22 + st.z * 0.5 + Math.sin(t * 1.5 + st.x) * 0.06;
    cx.fillStyle = "#d6d7ff";
    cx.fillRect(st.x, st.y, st.z * 1.7, st.z * 1.7);
  }
  cx.globalAlpha = 1;

  const px = W * 0.5, py = H * 0.5 + Math.sin(t * 1.1) * 9;   /* the player, adrift — gentle bob + sway */
  cutDrawChar(px, py, Math.sin(t * 0.7) * 0.06 - 0.05, 1.15, 1.15, skinColor(), 1, 0, Meta.char);

  const line = MONO[CUT.line];                  /* his confused muttering, hanging above him */
  if (line) {
    cx.globalAlpha = clamp(CUT.lineT / 0.4, 0, 1);
    cx.fillStyle = "#e8e2d0"; cx.shadowColor = "#9d6bff"; cx.shadowBlur = 14;
    cx.font = "italic 17px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText("“" + line + "”", px, py - 80);
    cx.shadowBlur = 0; cx.globalAlpha = 1;
  }

  const bar = H * 0.085;                         /* letterbox — same frame as the fall */
  cx.fillStyle = "#000";
  cx.fillRect(0, 0, W, bar); cx.fillRect(0, H - bar, W, bar);

  cx.font = "10px monospace"; cx.textAlign = "right"; cx.textBaseline = "middle";   /* tap-to-continue hint */
  cx.fillStyle = "rgba(150,145,165," + (0.55 + Math.sin(t * 4) * 0.25) + ")";
  cx.fillText((Input.touchMode ? "TAP TO CONTINUE" : anyKeyText()) + "  ▸", W - 18, H - bar - 14);
  cx.textAlign = "left";

  const fin = clamp(1 - t / 1.0, 0, 1);          /* white → clear: waking up from the fall's flash */
  if (fin > 0) { cx.fillStyle = "rgba(255,255,255," + fin + ")"; cx.fillRect(0, 0, W, H); }
}

