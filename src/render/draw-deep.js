/* =========================================================
   RUNEGUN · Rendering — the deep floors (VI–VIII)
   Floor art (the Stilled Hour's clock, the Glass Choir's panes, the Last Living
   Star's glow and shadows), the six horrors' and three wardens' bodies, and the
   world-space telegraphs. Phone-safe by construction: no per-object shadowBlur,
   no per-frame gradient allocation (cached sprites), shadows re-cast at ~3Hz.
   ========================================================= */
"use strict";

let _starGlow = null;
function starGlowSprite() {
  if (_starGlow) return _starGlow;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,226,160,0.55)"); gr.addColorStop(0.35, "rgba(255,84,112,0.30)"); gr.addColorStop(1, "rgba(255,84,112,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return (_starGlow = c);
}

/* ---------- under everything that stands: floor art, shadows, the Saint's hands ---------- */
function drawDeepUnder() {
  const D = Game.deep;
  if (Game.inSaloon || !D) return;
  /* THE UNKNOWN keeps floor VIII's index, not its star — but the Saint's echo brings its clock */
  const mi = Game.inUnknown ? -1 : Game.mapIdx, t = Game.time;
  const cL = Game.cam.x, cT = Game.cam.y;
  const saint = Game.inUnknown ? enemies.find(e => e.boss && !e.dead && e.kind === DEEP_HOUR && e.spawnT <= 0) : Game.boss;
  if (mi === DEEP_HOUR || (Game.inUnknown && saint)) {
    /* the floor is a stopped clock: twelve runic numerals ring the dial */
    const X = MAP.w / 2, Y = MAP.h / 2;
    cx.save();
    cx.strokeStyle = "rgba(230,194,122,0.22)"; cx.lineWidth = 4;
    cx.beginPath(); cx.arc(X, Y, HAND_LEN, 0, TAU); cx.stroke();
    cx.strokeStyle = "rgba(230,194,122,0.1)"; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(X, Y, HAND_LEN - 120, 0, TAU); cx.stroke();
    cx.beginPath();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU, r0 = i % 5 === 0 ? HAND_LEN - 40 : HAND_LEN - 18;
      cx.moveTo(X + Math.cos(a) * r0, Y + Math.sin(a) * r0); cx.lineTo(X + Math.cos(a) * HAND_LEN, Y + Math.sin(a) * HAND_LEN);
    }
    cx.strokeStyle = "rgba(230,194,122,0.3)"; cx.lineWidth = 3; cx.stroke();
    cx.font = "44px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillStyle = "rgba(230,194,122,0.4)";
    const NUM = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ";
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + i * TAU / 12; cx.fillText(NUM[i], X + Math.cos(a) * (HAND_LEN - 80), Y + Math.sin(a) * (HAND_LEN - 80)); }
    /* the hands, once wound (Phase 2+) — brass blades with a frost wake */
    const B = saint;
    if (B && B.kind === DEEP_HOUR && B.handOn) {
      const hands = [[B.handA, HAND_LEN, 14]];
      if (B.hourOn) hands.push([B.hourA, HOUR_LEN, 20]);
      for (const [ha, hl, w] of hands) {
        cx.fillStyle = "rgba(191,230,255,0.07)";
        cx.beginPath(); cx.moveTo(X, Y); cx.arc(X, Y, hl, ha - 0.3, ha); cx.closePath(); cx.fill();
        cx.lineCap = "round";
        cx.strokeStyle = D.stillT > 0 ? "#bfe6ff" : "#e6c27a"; cx.lineWidth = w;
        cx.beginPath(); cx.moveTo(X, Y); cx.lineTo(X + Math.cos(ha) * hl, Y + Math.sin(ha) * hl); cx.stroke();
        cx.strokeStyle = "#fff3d6"; cx.lineWidth = 4;
        cx.beginPath(); cx.moveTo(X, Y); cx.lineTo(X + Math.cos(ha) * hl, Y + Math.sin(ha) * hl); cx.stroke();
      }
      cx.lineCap = "butt";
      cx.fillStyle = "#e6c27a"; cx.beginPath(); cx.arc(X, Y, 24, 0, TAU); cx.fill();
    }
    cx.restore();
  } else if (mi === DEEP_STAR) {
    /* the last living star beyond the top wall: its glow, the flare, and every shadow it casts */
    cx.save();
    const sw = D.flareSt === "flare" ? 1 : D.flareSt === "warn" ? 0.7 + 0.3 * Math.sin(t * 14) : 0.5;
    cx.globalAlpha = sw;
    cx.drawImage(starGlowSprite(), D.starX - 1500, -1500 - 300, 3000, 3000);
    cx.globalAlpha = 1;
    if (D.flareSt === "flare" || D.highNoon) { cx.fillStyle = D.flareSt === "flare" ? "rgba(255,226,160,0.16)" : "rgba(255,226,160,0.05)"; cx.fillRect(cL, cT, VW, VH); }
    else if (D.flareSt === "warn") { cx.fillStyle = "rgba(255,84,112," + (0.05 + 0.04 * Math.sin(t * 14)).toFixed(3) + ")"; cx.fillRect(cL, cT, VW, VH); }
    cx.fillStyle = D.flareSt === "flare" ? "rgba(6,2,6,0.78)" : "rgba(6,2,6,0.5)";
    for (const s of D.shadows) {
      if (s.x1 < cL || s.x0 > cL + VW || s.y1 < cT || s.y0 > cT + VH) continue;
      cx.beginPath();
      for (let i = 0; i < s.poly.length; i++) { const q = s.poly[i]; if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); }
      cx.closePath(); cx.fill();
    }
    cx.restore();
  }
  /* stasis fields: a faint clock face ticking over the spilled moment */
  for (const pu of D.lapses) {
    cx.save(); cx.translate(pu.x, pu.y);
    cx.strokeStyle = "rgba(230,194,122,0.55)"; cx.lineWidth = 2;
    cx.beginPath();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; cx.moveTo(Math.cos(a) * (pu.r - 12), Math.sin(a) * (pu.r - 12)); cx.lineTo(Math.cos(a) * pu.r, Math.sin(a) * pu.r); }
    cx.stroke();
    cx.rotate(pu.t * 0.6);
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -pu.r * 0.7); cx.stroke();
    cx.restore();
  }
}

/* ---------- a mirror pane (rocks loop) ---------- */
function drawMirrorRock(rc) {
  let ga = 1;
  if (rc.boss) ga = 0.4 + 0.6 * clamp((Game.time - rc.bornAt) / 0.45, 0, 1);
  cx.globalAlpha = ga;
  cx.fillStyle = "#141622"; cx.fillRect(rc.x, rc.y, rc.w, rc.h);
  /* the sheen: a pale band across the glass */
  cx.fillStyle = "rgba(238,242,255,0.16)";
  cx.beginPath();
  if (rc.w >= rc.h) { cx.moveTo(rc.x + rc.w * 0.2, rc.y); cx.lineTo(rc.x + rc.w * 0.42, rc.y); cx.lineTo(rc.x + rc.w * 0.3, rc.y + rc.h); cx.lineTo(rc.x + rc.w * 0.08, rc.y + rc.h); }
  else { cx.moveTo(rc.x, rc.y + rc.h * 0.2); cx.lineTo(rc.x, rc.y + rc.h * 0.42); cx.lineTo(rc.x + rc.w, rc.y + rc.h * 0.3); cx.lineTo(rc.x + rc.w, rc.y + rc.h * 0.08); }
  cx.closePath(); cx.fill();
  const ring = Math.max(rc.ringT || 0, 0), glint = Math.max(rc.glintT || 0, 0);
  if (glint > 0) { cx.fillStyle = "rgba(255,255,255," + (0.25 + 0.5 * Math.abs(Math.sin(Game.time * 30))).toFixed(3) + ")"; cx.fillRect(rc.x, rc.y, rc.w, rc.h); }
  cx.strokeStyle = "#cfd6ff"; cx.lineWidth = 2; cx.strokeRect(rc.x + 1, rc.y + 1, rc.w - 2, rc.h - 2);
  if (ring > 0) {
    cx.globalAlpha = ga * clamp(ring * 3, 0, 1);
    cx.strokeStyle = "#ffffff"; cx.lineWidth = 3;
    cx.strokeRect(rc.x - 4, rc.y - 4, rc.w + 8, rc.h + 8);
  }
  cx.globalAlpha = 1;
}

/* ---------- bodies (drawCreatureBody hook) — returns true when it drew the creature ---------- */
function drawDeepBody(g, e, aimA, flash) {
  if (e.boss) {
    if (e.kind === UNK_KIND) { drawUnknownBody(g, e, flash); return true; }   // draw-unknown.js
    if (e.kind === DEEP_HOUR) { drawSaintBody(g, e, flash); return true; }
    if (e.kind === DEEP_GLASS) { drawThousandBody(g, e, flash); return true; }
    if (e.kind === DEEP_STAR) { drawHollowBody(g, "gunsmith", e.r, aimA, flash ? "#fff" : e.color, e.atk === "quickdraw"); drawStolen(g, e); return true; }
    return false;
  }
  const T = e.type, t = Game.time;
  g.shadowBlur = 0;
  if (T === "mourner") {
    /* rime caught mid-grief, hands over its face: white while watched, brass cracks when it moves */
    const moving = !e.watched;
    g.fillStyle = flash ? "#fff" : e.color;
    g.beginPath(); g.moveTo(0, -e.r * 0.4); g.lineTo(e.r, e.r); g.lineTo(-e.r, e.r); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, -e.r * 0.55, e.r * 0.55, 0, TAU); g.fill();
    g.fillStyle = "#9fb6c8"; g.fillRect(-e.r * 0.55, -e.r * 0.7, e.r * 0.45, e.r * 0.35); g.fillRect(e.r * 0.1, -e.r * 0.7, e.r * 0.45, e.r * 0.35);
    if (moving) {
      g.strokeStyle = "#e6c27a"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-e.r * 0.5, e.r * 0.9); g.lineTo(-e.r * 0.1, e.r * 0.2); g.lineTo(e.r * 0.2, e.r * 0.5); g.lineTo(e.r * 0.4, -e.r * 0.1); g.stroke();
    } else {
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, e.r + 5, 0, TAU); g.stroke();
    }
  } else if (T === "lapse") {
    /* a stopped moment in a brass cage */
    const pulse = 0.7 + 0.3 * Math.sin(t * 6 + (e.bob || 0));
    g.globalAlpha = pulse; g.fillStyle = flash ? "#fff" : "#fff3c8";
    g.beginPath(); g.arc(0, 0, e.r * 0.45, 0, TAU); g.fill();
    g.globalAlpha = 1; g.strokeStyle = flash ? "#fff" : e.color; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, e.r, 0, TAU); g.stroke();
    g.beginPath(); for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; g.moveTo(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5); g.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r); } g.stroke();
    g.rotate(Math.floor(t * 2) * (TAU / 12));
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -e.r * 0.85); g.stroke();
  } else if (T === "lumen") {
    /* a flame of escaped light */
    const fl = 1 + 0.12 * Math.sin(t * 17 + e.id);
    const aiming = e.phase === "aim" || e.phase === "burn";
    g.fillStyle = flash ? "#fff" : e.color;
    g.globalAlpha = 0.35; g.beginPath(); g.arc(0, 0, e.r * 1.7 * fl, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.beginPath(); g.moveTo(0, -e.r * 1.5 * fl); g.quadraticCurveTo(e.r, -e.r * 0.2, 0, e.r); g.quadraticCurveTo(-e.r, -e.r * 0.2, 0, -e.r * 1.5 * fl); g.fill();
    g.fillStyle = aiming ? "#ffffff" : "#ffe9a8";
    g.beginPath(); g.arc(0, 0, e.r * 0.4, 0, TAU); g.fill();
  } else if (T === "penitent") {
    /* on its knees behind a raised mirror */
    g.fillStyle = flash ? "#fff" : "#6f7890";
    g.beginPath(); g.arc(0, 0, e.r * 0.85, 0, TAU); g.fill();
    g.rotate(e.faceA || 0);
    const glint = (e.glintT || 3) < 0.35;
    g.strokeStyle = glint ? "#ffffff" : e.color; g.lineWidth = 6; g.lineCap = "round";
    g.beginPath(); g.arc(0, 0, e.r + 5, -Math.PI / 3, Math.PI / 3); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, e.r + 5, -0.5, 0.1); g.stroke();
    g.lineCap = "butt";
  } else if (T === "drifter") {
    drawHollowBody(g, "gunsmith", e.r, aimA, flash ? "#fff" : e.color, false, "#3a2a20");
    if (e.phase === "reload") {
      g.save(); g.translate(0, -e.r - 12); g.rotate(t * 9);
      g.fillStyle = e.color;
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.arc(Math.cos(a) * 5, Math.sin(a) * 5, 1.8, 0, TAU); g.fill(); }
      g.restore();
    }
  } else if (T === "carrion") {
    const flap = Math.sin(t * 11 + e.id) * 0.5;
    if (e.high) {
      /* too high to shoot: only its shadow crosses the ground */
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.beginPath(); g.ellipse(0, 0, e.r * 1.4, e.r * 0.6, 0, 0, TAU); g.fill();
      g.translate(-18, -42); g.globalAlpha = 0.6;
    }
    g.rotate(Math.atan2(e.vy || 0, e.vx || 1));
    g.strokeStyle = flash ? "#fff" : e.color; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(-e.r * 1.4, -e.r * (0.9 + flap)); g.lineTo(0, 0); g.lineTo(-e.r * 1.4, e.r * (0.9 + flap)); g.stroke();
    g.fillStyle = flash ? "#fff" : e.color; g.beginPath(); g.arc(2, 0, e.r * 0.45, 0, TAU); g.fill();
    g.lineCap = "butt"; g.globalAlpha = 1;
    if (e.carry) { g.fillStyle = "#ffd23d"; g.beginPath(); g.arc(0, 6, 7, 0, TAU); g.fill(); }
  } else if (T === "reflection") {
    /* a reflection: dashed glass, cracking with every hit */
    g.rotate(Math.PI / 4 + Math.sin(t * 0.7) * 0.1);
    const h = e.r * 0.85, cracks = 3 - Math.round(e.hp);
    g.globalAlpha = 0.14; g.fillStyle = "#eef2ff"; g.fillRect(-h, -h, h * 2, h * 2);
    g.globalAlpha = flash ? 1 : 0.65; g.setLineDash([7, 6]); g.strokeStyle = "#eef2ff"; g.lineWidth = 3;
    g.strokeRect(-h, -h, h * 2, h * 2); g.setLineDash([]);
    g.lineWidth = 1.5;
    for (let k = 0; k < cracks; k++) { g.beginPath(); g.moveTo(-h * 0.8 + k * h * 0.6, -h); g.lineTo(-h * 0.2 + k * h * 0.4, h * 0.2); g.lineTo(h * 0.3 * (k - 1), h); g.stroke(); }
    g.globalAlpha = 1;
  } else if (T === "hollow") {
    drawHollowBody(g, e.sub, e.r, aimA, flash ? "#fff" : e.color, false);
    if (e.ghost && e.sub === "wraith") { g.globalAlpha = 0.4; }
  } else if (UNK_MINIONS.has(T)) {
    drawUnknownMinion(g, e, flash);   // THE UNKNOWN's wards, shields, hounds and wisps (draw-unknown.js)
  } else return false;
  return true;
}

/* the Hourglass Saint: frozen light in an hourglass; its sand is its life, and the glass turns */
function drawSaintBody(g, e, flash) {
  const s = e.r, D = Game.deep;
  const rot = e.atk === "rewind" ? clamp(1 - e.at / 0.8, 0, 1) * Math.PI : 0;
  g.rotate(rot);
  g.fillStyle = flash ? "#ffffff" : "#1b2230"; g.strokeStyle = flash ? "#ffffff" : e.color; g.lineWidth = 4; g.lineJoin = "round";
  g.beginPath(); g.moveTo(-0.78 * s, -1.05 * s); g.lineTo(0.78 * s, -1.05 * s); g.lineTo(0.12 * s, 0); g.lineTo(0.78 * s, 1.05 * s); g.lineTo(-0.78 * s, 1.05 * s); g.lineTo(-0.12 * s, 0); g.closePath();
  g.fill(); g.shadowBlur = 0; g.stroke();
  const f = e.maxHp ? clamp(e.hp / e.maxHp, 0, 1) : 1;
  const wAt = y => 0.12 * s + 0.66 * s * (-y / (1.05 * s));
  const yT = -0.98 * s * f;
  g.fillStyle = "#bfe6ff";
  if (f > 0.02) { g.beginPath(); g.moveTo(-wAt(yT), yT); g.lineTo(wAt(yT), yT); g.lineTo(0.09 * s, -0.04 * s); g.lineTo(-0.09 * s, -0.04 * s); g.closePath(); g.fill(); }
  const pile = (1 - f) * 0.85 * s;
  g.beginPath(); g.moveTo(-0.68 * s, 0.98 * s); g.lineTo(0.68 * s, 0.98 * s); g.lineTo(0, 0.98 * s - pile - 0.05 * s); g.closePath(); g.fill();
  if (!(D && D.stillT > 0) && f > 0.02) { g.fillRect(-1, 0, 2, 0.98 * s - pile); }
  g.fillStyle = flash ? "#ffffff" : e.color;
  g.fillRect(-0.95 * s, -1.27 * s, 1.9 * s, 0.22 * s); g.fillRect(-0.95 * s, 1.05 * s, 1.9 * s, 0.22 * s);
  if (e.atk === "still" && e.at > 0) {   /* it raises its hands */
    g.strokeStyle = "#fff3c8"; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, s * 1.5 + (0.5 - e.at) * 30, 0, TAU); g.stroke();
  }
}
/* the Thousandfold: every swallowed light in one faceted body */
function drawThousandBody(g, e, flash) {
  const s = e.r;
  if (e.whiteout) {
    g.globalAlpha = 0.25 + 0.1 * Math.sin(Game.time * 6);
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, s * 2.2, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  g.rotate(Math.PI / 4 + Math.sin(Game.time * 0.7) * 0.1);
  const h = s * 0.85;
  if (flash) g.fillStyle = "#ffffff";
  else {
    const gr = g.createLinearGradient(-h, -h, h, h);
    for (let i = 0; i < 7; i++) gr.addColorStop(i / 6, SPECTRUM[i]);
    g.fillStyle = gr;
  }
  g.fillRect(-h, -h, h * 2, h * 2);
  g.shadowBlur = 0;
  g.strokeStyle = "#ffffff"; g.lineWidth = 4; g.strokeRect(-h, -h, h * 2, h * 2);
  g.lineWidth = 1.5; g.beginPath(); g.moveTo(-h, -h); g.lineTo(h, h); g.moveTo(h, -h); g.lineTo(-h, h); g.stroke();
  g.fillStyle = "#ffffff"; g.fillRect(-h * 0.32, -h * 0.32, h * 0.64, h * 0.64);
}
/* a hollow gunslinger: the Vault character's silhouette, emptied — dark, rimmed, eyes lit */
function drawHollowBody(g, char, r, aimA, rim, holstered, fill) {
  g.shadowBlur = 0;
  g.save();
  g.rotate(aimA + Math.PI / 2);
  g.fillStyle = fill || "#1d0c15"; g.strokeStyle = rim; g.lineWidth = 3;
  g.beginPath();
  const n = char === "wraith" ? 4 : char === "juggernaut" ? 6 : char === "demolitionist" ? 8 : 5;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU - Math.PI / 2 + (n === 8 ? Math.PI / 8 : 0);
    const rr = char === "wraith" && i % 2 ? r * 0.7 : r;
    if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath(); g.fill(); g.stroke();
  /* the hat brim */
  g.lineWidth = 4; g.beginPath(); g.moveTo(-r * 1.15, r * 0.15); g.lineTo(r * 1.15, r * 0.15); g.stroke();
  g.fillStyle = "#ffe2a0";
  g.beginPath(); g.arc(-r * 0.28, -r * 0.2, Math.max(2, r * 0.1), 0, TAU); g.arc(r * 0.28, -r * 0.2, Math.max(2, r * 0.1), 0, TAU); g.fill();
  g.restore();
  if (!holstered) {
    g.strokeStyle = rim; g.lineWidth = char === "juggernaut" ? 8 : 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(Math.cos(aimA) * r * 0.7, Math.sin(aimA) * r * 0.7); g.lineTo(Math.cos(aimA) * (r + 16), Math.sin(aimA) * (r + 16)); g.stroke();
    g.lineCap = "butt";
  }
}
/* the runes he took, circling him in their own colours */
function drawStolen(g, e) {
  if (!e.stolen || !e.stolen.length) return;
  g.font = "bold 16px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  for (let i = 0; i < e.stolen.length; i++) {
    const R = RUNES[e.stolen[i].id]; if (!R) continue;
    const a = Game.time * 1.6 + i / e.stolen.length * TAU;
    g.fillStyle = R.color; g.fillText(R.glyph, Math.cos(a) * (e.r + 22), Math.sin(a) * (e.r + 22));
  }
}

/* ---------- over everyone: beams, sight-lines, marks, the stopped hour, high noon's dimming ---------- */
function drawDeepOver() {
  const D = Game.deep;
  if (Game.inSaloon || !D) return;
  const t = Game.time, cL = Game.cam.x, cT = Game.cam.y;
  cx.save();
  cx.lineCap = "round"; cx.lineJoin = "round";
  const path = pts => { cx.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) cx.lineTo(pts[i][0], pts[i][1]); else cx.moveTo(pts[i][0], pts[i][1]); } };
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.type === "lumen" && e.beam) {
      if (e.phase === "aim") { cx.setLineDash([12, 10]); cx.strokeStyle = "rgba(255,243,200," + (0.45 + 0.35 * Math.sin(t * 20)).toFixed(3) + ")"; cx.lineWidth = 2; path(e.beam); cx.stroke(); cx.setLineDash([]); }
      else if (e.phase === "burn") { cx.strokeStyle = "rgba(255,243,200,0.35)"; cx.lineWidth = 16; path(e.beam); cx.stroke(); cx.strokeStyle = "#ffffff"; cx.lineWidth = 4; path(e.beam); cx.stroke(); }
    } else if (e.type === "hollow") {
      if (e.sub === "juggernaut" && e.phase === "sight") {
        cx.setLineDash([18, 12]); cx.strokeStyle = "rgba(255,84,112,0.8)"; cx.lineWidth = 2.5;
        cx.beginPath(); cx.moveTo(e.x, e.y); cx.lineTo(e.x + Math.cos(e.aimA) * 1800, e.y + Math.sin(e.aimA) * 1800); cx.stroke(); cx.setLineDash([]);
      } else if (e.sub === "wraith" && e.phase === "shimmer") {
        cx.setLineDash([6, 6]); cx.strokeStyle = e.color; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(e.tx, e.ty, 26, 0, TAU); cx.stroke(); cx.setLineDash([]);
      } else if (e.sub === "wraith" && e.phase === "burst") {
        cx.globalAlpha = 0.35 + 0.5 * (1 - e.pt / 0.45); cx.strokeStyle = e.color; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(e.x, e.y, 120, 0, TAU); cx.stroke(); cx.globalAlpha = 1;
      }
      for (const m of e.marks || []) drawShellMark(m, e.color);
    }
  }
  const B = Game.boss;
  if (B && B.kind === DEEP_GLASS && B.lances.length) {
    for (const L of B.lances) {
      if (!B.lanceBurn) { cx.setLineDash([14, 12]); cx.strokeStyle = "rgba(238,242,255," + (0.5 + 0.3 * Math.sin(t * 22)).toFixed(3) + ")"; cx.lineWidth = 2.5; path(L); cx.stroke(); cx.setLineDash([]); }
      else {
        cx.strokeStyle = "hsla(" + Math.floor((t * 240) % 360) + ",90%,75%,0.3)"; cx.lineWidth = 26; path(L); cx.stroke();
        cx.strokeStyle = "rgba(255,255,255,0.55)"; cx.lineWidth = 11; path(L); cx.stroke();
        cx.strokeStyle = "#ffffff"; cx.lineWidth = 4; path(L); cx.stroke();
      }
    }
  }
  if (B && B.kind === DEEP_STAR) {
    for (const m of B.shells) drawShellMark(m, "#ff5470");
    if (B.atk === "quickdraw") {
      /* high noon: the arena dims around the duel */
      cx.fillStyle = "rgba(5,2,4,0.32)"; cx.fillRect(cL, cT, VW, VH);
      const T = nearestPlayer(B.x, B.y);
      cx.setLineDash([4, 10]); cx.strokeStyle = "rgba(255,226,160,0.5)"; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(B.x, B.y); cx.lineTo(T.x, T.y); cx.stroke(); cx.setLineDash([]);
    }
  }
  if (D.stillT > 0) {
    /* the stopped hour: the world goes pale and holds its breath */
    cx.fillStyle = "rgba(205,232,255,0.08)"; cx.fillRect(cL, cT, VW, VH);
    cx.strokeStyle = "rgba(230,194,122,0.35)"; cx.lineWidth = 10; cx.strokeRect(cL + 5, cT + 5, VW - 10, VH - 10);
  }
  cx.restore();
}
function drawShellMark(m, col) {
  const k = clamp(m.t / m.life, 0, 1);
  cx.strokeStyle = col; cx.globalAlpha = 0.4 + 0.5 * k; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(m.x, m.y, 90, 0, TAU); cx.stroke();
  cx.lineWidth = 3; cx.beginPath(); cx.arc(m.x, m.y, 90 * (1 - k) + 6, 0, TAU); cx.stroke();
  cx.globalAlpha = 1;
}
