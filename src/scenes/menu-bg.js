/* =========================================================
   RUNEGUN · Scene — menu background
   The living main-menu backdrop: the Event Horizon hanging over the title, bending the catacomb into itself.
   ========================================================= */
"use strict";

/* =========================================================
   MENU BACKGROUND — THE VOID BENEATH, and what waits in it.
   The Event Horizon hangs above the title, already awake:
   the grid of the catacomb bends toward it, stolen starlight
   leans into the drain, and runes spiral down into the dark.
   ========================================================= */
const MENU_BG = { inited: false, t: rnd(0, 40), stars: [], motes: [], ttlTop: 0, ttlEl: null, shots: [], hx: 0, hy: 0, hr: 0 };
let _menuVg = null, _menuVgKey = "";   // the edge vignette, rebuilt only when the viewport changes
const MENU_GLYPHS = "ᛝᚦᛟᛉᚺᛞᛣᚲ";
function menuMote(fresh) {
  const rock = Math.random() < 0.3;
  return {
    rock,
    a: rnd(0, TAU),                                   // angle around the hole
    d: fresh ? rnd(3.4, 5.2) : rnd(1.2, 5.2),         // distance in hole-radii
    spin: rnd(0.3, 0.8) * (Math.random() < 0.5 ? -1 : 1),
    fall: rnd(0.14, 0.3),                             // radii / sec, inward
    rot: rnd(0, TAU), rotSpd: rnd(-2, 2),
    g: MENU_GLYPHS[Math.floor(Math.random() * MENU_GLYPHS.length)],
    col: rock ? FLOORS[4].rockTop : pick(["#9d6bff", "#c9b8ff", "#ffd23d", "#e8e2d0"]),
    sz: rock ? rnd(5, 11) : rnd(12, 21),
  };
}
function menuBGInit() {
  MENU_BG.inited = true;
  MENU_BG.stars = [];
  for (let i = 0; i < 110; i++)
    MENU_BG.stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: rnd(0, TAU) });
  MENU_BG.motes = [];
  for (let i = 0; i < 24; i++) MENU_BG.motes.push(menuMote(false));
}
function menuFrame(dt) {
  if (!MENU_BG.inited) menuBGInit();
  MENU_BG.t += dt;
  const t = MENU_BG.t;
  const F = FLOORS[4];                                          // the Void Beneath

  /* it hangs just above the title, wherever the title lands */
  if (!MENU_BG.ttlEl) MENU_BG.ttlEl = document.querySelector("#menu .title");
  if (MENU_BG.ttlEl) {
    const r = MENU_BG.ttlEl.getBoundingClientRect();
    if (r.height > 0) MENU_BG.ttlTop = r.top;
  }
  const ttl = MENU_BG.ttlTop > 0 ? MENU_BG.ttlTop : H * 0.42;
  let hr = clamp(Math.min(W, H) * 0.17, 56, 165);               // event-horizon radius
  hr = Math.min(hr, Math.max((ttl + 50) / 2.25, 56));           // ...but it must fit above the words
  const hx = W / 2;
  const hy = Math.max(ttl + 16 - hr, hr * 1.02 + 4);            // lower rim grazes the title
  const breathe = 1 + 0.018 * Math.sin(t * 0.9);
  MENU_BG.hx = hx; MENU_BG.hy = hy; MENU_BG.hr = hr;

  /* gravitational warp: every point in the catacomb leans toward the hole */
  const warpX = (px, py) => { const dx = hx - px, dy = hy - py, dd = Math.max(Math.hypot(dx, dy), 1);
    const f = Math.min((hr * hr * 1.5) / (dd * dd), 0.5); return px + dx * f; };
  const warpY = (px, py) => { const dx = hx - px, dy = hy - py, dd = Math.max(Math.hypot(dx, dy), 1);
    const f = Math.min((hr * hr * 1.5) / (dd * dd), 0.5); return py + dy * f; };

  /* the void floor */
  cx.fillStyle = F.floor; cx.fillRect(0, 0, W, H);

  /* stolen starlight, twinkling, drifting toward the drain */
  for (const s of MENU_BG.stars) {
    let sx = s.x * W, sy = s.y * H;
    const dx = hx - sx, dy = hy - sy, dd = Math.max(Math.hypot(dx, dy), 1);
    sx += dx / dd * (340 / dd) * s.z * dt * 60 * 0.18;
    sy += dy / dd * (340 / dd) * s.z * dt * 60 * 0.18;
    s.x = sx / W; s.y = sy / H;
    if (dd < hr * 1.02) { s.x = Math.random(); s.y = Math.random() < 0.5 ? Math.random() * 0.12 : 0.6 + Math.random() * 0.4; }
    const a = (0.2 + 0.5 * s.z) * (0.65 + 0.35 * Math.sin(t * 2 + s.tw));
    cx.fillStyle = "rgba(201,184,255," + a.toFixed(3) + ")";
    cx.fillRect(sx, sy, s.z > 0.7 ? 2 : 1, s.z > 0.7 ? 2 : 1);
  }

  /* the catacomb grid, bent by gravity */
  cx.strokeStyle = F.grid; cx.lineWidth = 1;
  const GS = 72, SEG = 44;
  for (let gx = GS / 2; gx < W; gx += GS) {
    cx.beginPath();
    for (let py = 0; py <= H + SEG; py += SEG) {
      const wx = warpX(gx, py), wy = warpY(gx, py);
      py === 0 ? cx.moveTo(wx, wy) : cx.lineTo(wx, wy);
    }
    cx.stroke();
  }
  for (let gy = GS / 2; gy < H; gy += GS) {
    cx.beginPath();
    for (let px = 0; px <= W + SEG; px += SEG) {
      const wx = warpX(px, gy), wy = warpY(px, gy);
      px === 0 ? cx.moveTo(wx, wy) : cx.lineTo(wx, wy);
    }
    cx.stroke();
  }

  /* torn rubble + runes spiralling down the drain */
  cx.textAlign = "center"; cx.textBaseline = "middle";
  for (let i = 0; i < MENU_BG.motes.length; i++) {
    const m = MENU_BG.motes[i];
    m.a += m.spin * dt * (1.6 / m.d);
    m.d -= m.fall * dt * (1 + 1.4 / m.d);
    m.rot += m.rotSpd * dt;
    if (m.d <= 1.05) { MENU_BG.motes[i] = menuMote(true); continue; }
    const px = hx + Math.cos(m.a) * m.d * hr, py = hy + Math.sin(m.a) * m.d * hr * 0.86;
    const fade = clamp((m.d - 1.05) / 0.8, 0, 1) * clamp((5.2 - m.d) / 0.9, 0, 1);
    cx.save(); cx.translate(px, py); cx.rotate(m.rot); cx.globalAlpha = fade * (m.rock ? 0.85 : 0.7);
    if (m.rock) {
      cx.fillStyle = F.rockA; cx.strokeStyle = F.rockTop; cx.lineWidth = 1.5;
      cx.fillRect(-m.sz, -m.sz * 0.7, m.sz * 2, m.sz * 1.4);
      cx.strokeRect(-m.sz, -m.sz * 0.7, m.sz * 2, m.sz * 1.4);
    } else {
      cx.fillStyle = m.col; cx.shadowColor = m.col; cx.shadowBlur = 10;
      cx.font = m.sz + "px monospace";
      cx.fillText(m.g, 0, 0);
      cx.shadowBlur = 0;
    }
    cx.restore();
  }
  cx.globalAlpha = 1;

  /* update menu shots */
  for (let i = MENU_BG.shots.length - 1; i >= 0; i--) {
    const s = MENU_BG.shots[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0) MENU_BG.shots.splice(i, 1);
  }

  /* ---- THE EVENT HORIZON — the last boss, already waiting ---- */
  cx.save(); cx.translate(hx, hy); cx.scale(breathe, breathe);

  /* a slow hungry pulse, every few seconds */
  const pT = (t % 5.5) / 5.5;
  if (pT < 0.55) {
    cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 2;
    cx.globalAlpha = (1 - pT / 0.55) * 0.22;
    cx.beginPath(); cx.arc(0, 0, hr + pT * hr * 2.4, 0, TAU); cx.stroke();
    cx.globalAlpha = 1;
  }

  /* far gravitational-lensing rings */
  cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 1.5;
  cx.setLineDash([3, 10]);
  for (let k = 0; k < 2; k++) {
    cx.globalAlpha = 0.22 - k * 0.08;
    cx.save(); cx.rotate(t * (k ? -0.4 : 0.55));
    cx.beginPath(); cx.arc(0, 0, hr + hr * 0.5 + k * hr * 0.36, 0, TAU); cx.stroke();
    cx.restore();
  }
  cx.setLineDash([]); cx.globalAlpha = 1;

  /* accretion disc — three tilted arcs of infalling light */
  const discCols = ["#9d6bff", "#ffd23d", "#fff"];
  for (let k = 0; k < 3; k++) {
    cx.save();
    cx.rotate(t * (0.55 + k * 0.3) + k * 2.1);
    cx.strokeStyle = discCols[k];
    cx.globalAlpha = 0.55;
    cx.lineWidth = 5 - k;
    cx.shadowColor = discCols[k]; cx.shadowBlur = 14;
    cx.beginPath();
    cx.ellipse(0, 0, hr * 1.85 - k * hr * 0.12, hr * (0.62 - k * 0.07), 0, 0.3, TAU * 0.72);
    cx.stroke();
    cx.restore();
  }
  cx.shadowBlur = 0; cx.globalAlpha = 1;

  /* photon ring */
  cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 4;
  cx.shadowColor = "#c9b8ff"; cx.shadowBlur = 26;
  cx.beginPath(); cx.arc(0, 0, hr + 3, 0, TAU); cx.stroke();
  cx.shadowBlur = 0;

  /* the void itself — light stops here */
  cx.fillStyle = "#000";
  cx.beginPath(); cx.arc(0, 0, hr, 0, TAU); cx.fill();

  /* a sliver of doppler glint */
  cx.strokeStyle = "#fff"; cx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 5);
  cx.lineWidth = 3;
  cx.beginPath(); cx.arc(0, 0, hr - 4, Math.PI * 1.15, Math.PI * 1.55); cx.stroke();
  cx.globalAlpha = 1;

  /* everything it has already swallowed, circling the drain */
  cx.fillStyle = "#fff3c8"; cx.globalAlpha = 0.7;
  for (let k = 0; k < 12; k++) {
    const aa = t * 2.4 + k / 12 * TAU;
    cx.beginPath(); cx.arc(Math.cos(aa) * hr * 0.6, Math.sin(aa) * hr * 0.36, 2.4, 0, TAU); cx.fill();
  }
  cx.globalAlpha = 1;
  cx.restore();

  /* draw menu shots (bullets fired from the black hole on click) */
  for (const s of MENU_BG.shots) {
    cx.globalAlpha = clamp(s.life / s.maxLife, 0, 1);
    cx.strokeStyle = s.col; cx.lineWidth = 2.5; cx.shadowColor = s.col; cx.shadowBlur = 8;
    cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(s.x - s.vx * 0.07, s.y - s.vy * 0.07); cx.stroke();
    cx.shadowBlur = 0;
  }
  cx.globalAlpha = 1;

  /* ruined catacomb pillars, framing the void from below */
  cx.fillStyle = "rgba(10,7,24,0.9)";
  const pil = [[0.04, 0.34, 46], [0.115, 0.22, 30], [0.9, 0.3, 42], [0.965, 0.18, 26]];
  for (const [fx, fh, pw] of pil) {
    const px = fx * W, ph = fh * H, sway = Math.sin(t * 0.4 + fx * 9) * 2;
    cx.beginPath();
    cx.moveTo(px - pw / 2 + sway, H);
    cx.lineTo(px - pw / 2 + sway, H - ph);
    cx.lineTo(px - pw * 0.2 + sway, H - ph - 16);
    cx.lineTo(px + pw * 0.15 + sway, H - ph + 6);
    cx.lineTo(px + pw / 2 + sway, H - ph - 8);
    cx.lineTo(px + pw / 2 + sway, H);
    cx.closePath(); cx.fill();
  }

  /* vignette — the dark closes in at the edges (cached: it only depends on the
     viewport, and this was a fresh CanvasGradient allocation every frame) */
  const vgKey = W + "|" + H;
  if (vgKey !== _menuVgKey) {
    _menuVgKey = vgKey;
    _menuVg = cx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.32, W / 2, H * 0.42, Math.max(W, H) * 0.78);
    _menuVg.addColorStop(0, "rgba(2,1,8,0)"); _menuVg.addColorStop(1, "rgba(2,1,8,0.6)");
  }
  cx.fillStyle = _menuVg; cx.fillRect(0, 0, W, H);
}

