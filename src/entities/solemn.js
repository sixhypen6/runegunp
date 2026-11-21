/* =========================================================
   RUNEGUN · SOLEMN LAMENT (Yi Sang) — the ranged warden
   A black-coated Yi Sang with a coffin strapped to his back and a
   pair of butterfly-marked gun-swords. RANGED. This file currently
   holds only the body sprite; the kit comes later.
   ========================================================= */

const SOLEMN_COL = {
  coat: "#0f0f14", coatHi: "#22222c", coatDark: "#07070a",
  trim: "#d9b65c", trimHi: "#f0d488",
  cuff: "#2f7d5b", cuffHi: "#57c08a",
  shaft: "#efe7da",         // white shirt / collar peeking at the throat
  hair: "#111117", hairHi: "#2a2a34",
  skin: "#efe7da",
  coffin: "#0a0a0e", coffinHi: "#16161d", coffinEdge: "#d9b65c",
  butterfly: "#efe7da", butterflyCore: "#c9b6ff",
  gun: "#1a1a22", gunHi: "#2c2c38", gunEdge: "#c9c9d2", blade: "#eef1f6",
};

/* a small butterfly — the Index/Solemn Lament mark, two wings and a spine */
function drawSolemnButterfly(g, s, col, core) {
  g.save();
  g.fillStyle = col;
  /* upper wings */
  g.beginPath(); g.ellipse(-s * 0.55, -s * 0.42, s * 0.55, s * 0.72, -0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.55, -s * 0.42, s * 0.55, s * 0.72, 0.5, 0, TAU); g.fill();
  /* lower wings */
  g.beginPath(); g.ellipse(-s * 0.42, s * 0.6, s * 0.4, s * 0.5, 0.35, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.42, s * 0.6, s * 0.4, s * 0.5, -0.35, 0, TAU); g.fill();
  /* spine */
  g.fillStyle = core || col;
  g.beginPath(); g.ellipse(0, s * 0.05, s * 0.12, s * 0.85, 0, 0, TAU); g.fill();
  g.restore();
}

function drawSolemnWarden(P, px, py, aim, col, tint, hpFrac) {
  const t = Game.time;
  const C = SOLEMN_COL;
  const sway = Math.sin(t * 2.1 + px * 0.02) * 1.6;

  /* ---- the coffin on his back: a flat black box lying along his spine,
     seen top-down so it reads as a slab, not a steep tower ---- */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  /* "back" is opposite facing; the long axis runs along the way he looks so
     the coffin lies flat behind him instead of fanning out sideways */
  cx.save();
  cx.translate(-12, 0);
  cx.rotate(Math.PI / 2 + sway * 0.006);
  cx.shadowColor = C.coffinEdge; cx.shadowBlur = 5;
  cx.fillStyle = C.coffin;
  cx.strokeStyle = C.coffinEdge; cx.lineWidth = 1.2;
  cx.beginPath();
  cx.moveTo(0, -17);
  cx.lineTo(6, -11.5);
  cx.lineTo(6, 11.5);
  cx.lineTo(0, 17);
  cx.lineTo(-6, 11.5);
  cx.lineTo(-6, -11.5);
  cx.closePath(); cx.fill(); cx.stroke();
  /* inner lid bevel */
  cx.shadowBlur = 0;
  cx.strokeStyle = C.coffinHi; cx.lineWidth = 0.9;
  cx.beginPath();
  cx.moveTo(0, -14); cx.lineTo(4.4, -9.6); cx.lineTo(4.4, 9.6);
  cx.lineTo(0, 14); cx.lineTo(-4.4, 9.6); cx.lineTo(-4.4, -9.6);
  cx.closePath(); cx.stroke();
  /* the butterfly burned into the lid */
  cx.save();
  cx.translate(0, -4);
  cx.shadowColor = C.butterfly; cx.shadowBlur = 4;
  drawSolemnButterfly(cx, 3.6, C.butterfly, C.butterflyCore);
  cx.restore();
  cx.restore();
  cx.restore();
  cx.shadowBlur = 0; cx.globalAlpha = 1;

  /* ---- body: the long black coat, gold trim, green cuff ---- */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = C.coat;
  cx.beginPath();
  cx.moveTo(6.5, -5.4);
  cx.quadraticCurveTo(-2, -7.4, -11, -4.6);
  cx.quadraticCurveTo(-13.8, 0, -11, 4.6);
  cx.quadraticCurveTo(-2, 7.4, 6.5, 5.4);
  cx.quadraticCurveTo(9.6, 0, 6.5, -5.4);
  cx.closePath(); cx.fill();
  cx.strokeStyle = C.coatHi; cx.lineWidth = 1.1; cx.stroke();
  /* the coat's separating seam down the back */
  cx.strokeStyle = C.coatDark; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(-11, 0); cx.lineTo(5, 0); cx.stroke();
  /* gold trim along the hem */
  cx.strokeStyle = C.trim; cx.lineWidth = 1; cx.globalAlpha = 0.85;
  cx.beginPath(); cx.moveTo(-10.5, -4.6); cx.quadraticCurveTo(-13, 0, -10.5, 4.6); cx.stroke();
  cx.globalAlpha = 1;
  /* white collar / cravat at the throat */
  cx.fillStyle = C.shaft;
  cx.beginPath(); cx.moveTo(7.2, -3.2); cx.lineTo(3.8, 0); cx.lineTo(7.2, 3.2); cx.closePath(); cx.fill();
  cx.fillStyle = C.coatDark;
  cx.beginPath(); cx.moveTo(7.2, -1.2); cx.lineTo(3.8, 0); cx.lineTo(7.2, 1.2); cx.closePath(); cx.fill();
  /* the green cuff on the leading arm (the splash's tell) */
  cx.fillStyle = C.cuff;
  cx.beginPath(); cx.ellipse(6.6, 4.4, 1.5, 1.1, -0.5, 0, TAU); cx.fill();
  cx.fillStyle = C.cuffHi; cx.globalAlpha = 0.7;
  cx.beginPath(); cx.ellipse(6.6, 4.4, 0.8, 0.5, -0.5, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  drawWounds(cx, hpFrac, 11);

  /* ---- head: dark hair, pale face, one shadowed eye ---- */
  cx.fillStyle = C.hair;
  cx.beginPath(); cx.ellipse(4.2, 0, 3.7, 3.2, 0, 0, TAU); cx.fill();
  cx.fillStyle = C.hairHi; cx.globalAlpha = 0.5;
  cx.beginPath(); cx.ellipse(3.2, -1.6, 1.8, 1.1, 0.5, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  /* the face plane */
  cx.fillStyle = C.skin; cx.globalAlpha = 0.9;
  cx.beginPath(); cx.ellipse(6.2, 0.4, 1.7, 1.4, 0, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  /* a pale glint where an eye should be */
  cx.shadowColor = "#cfe0ff"; cx.shadowBlur = 5;
  cx.fillStyle = "#cdd9f0";
  cx.beginPath(); cx.ellipse(6.8, -0.5, 0.5, 0.34, 0.3, 0, TAU); cx.fill();
  cx.shadowBlur = 0;
  cx.restore();

  /* ---- the twin gun-swords, held forward along the aim ---- */
  const kick = P.kickT > 0 ? (P.kickT / 0.09) * 1.6 : 0;
  const rec = 1 - kick * 0.04;
  const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  for (const side of [-1, 1]) {
    const oy = side * 4.2;
    const hx = 6 * rec, hy = oy;
    /* the pistol body */
    cx.fillStyle = C.gun;
    cx.strokeStyle = C.gunHi; cx.lineWidth = 0.9;
    cx.beginPath();
    cx.rect(hx, hy - 1.7, 6.5, 3.4);
    cx.fill(); cx.stroke();
    /* the blade that runs out of the barrel */
    cx.strokeStyle = C.blade; cx.lineWidth = 1.5; cx.lineCap = "round";
    cx.shadowColor = C.blade; cx.shadowBlur = 5;
    cx.beginPath();
    cx.moveTo(hx + 6.2, hy);
    cx.lineTo(hx + 6.2 + 15 * rec, hy);
    cx.stroke();
    cx.shadowBlur = 0;
    /* the butterfly etched on the slide */
    cx.save();
    cx.translate(hx + 2.6, hy);
    drawSolemnButterfly(cx, 1.9, C.butterfly, C.butterflyCore);
    cx.restore();
  }
  cx.lineCap = "round";
  cx.restore();

  /* faint aura in the ruling rune's hue so he reads among the wardens */
  cx.globalAlpha = 0.12;
  cx.fillStyle = col || "#e8e2d0";
  cx.beginPath(); cx.arc(px, py, P.r + 6, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  cx.shadowBlur = 0;
}
