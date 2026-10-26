/* =========================================================
   RUNEGUN · Rune cards — the deck on the saloon's felt
   Thirty-three runes, thirty-three cards. Four suits of eight, sorted by what
   the rune does to the gun, and MIDAS alone as the house card. A card's rank
   follows the rune's weight: the hand-cannons are tens, the quick little runes
   are twos, and each suit's ace is its signature.
   Every face is painted once into a cached canvas and only blitted after that,
   so no per-frame shadowBlur or gradients (the mobile raster budget, canvas.js).
   ========================================================= */
"use strict";

/* the suits: which part of the gun a rune speaks to. Each paints its own pip (cardPip) */
const CARD_SUITS = {
  rounds: { name: "ROUNDS" },   // how the gun fires: a cartridge
  hunt:   { name: "HUNT" },     // finding the mark and finishing it: a gunsight
  blight: { name: "BLIGHT" },   // what a hit leaves behind: a flame
  ward:   { name: "WARD" },     // the body behind the gun: a shield
  house:  { name: "HOUSE" },    // MIDAS on its own: a soul coin
};
/* rank per position, low to high. A suit averages 7.4 with the ace at 11; a standard deck averages 7.3 */
const CARD_RANKS = ["A", 2, 4, 6, 7, 9, 10, 10];
const CARD_LAYOUT = {
  rounds: ["twin", "rapid", "velocity", "mirror", "scatter", "pierce", "heavy", "titan"],   // TWIN's ace: one bullet, or 1 1
  hunt:   ["reaper", "leech", "seeker", "ricochet", "quarry", "dread", "puncture", "wrath"], // REAPER takes the death card
  blight: ["ember", "slime", "venom", "frost", "splinter", "storm", "nova", "maelstrom"],
  ward:   ["aegis", "swift", "prickle", "mend", "bramble", "phase", "bulwark", "stillpoint"],
};
const RUNE_DECK = [];
for (const suit in CARD_LAYOUT) CARD_LAYOUT[suit].forEach((id, i) => RUNE_DECK.push({ id, suit, rank: CARD_RANKS[i] }));
RUNE_DECK.push({ id: "midas", suit: "house", rank: "W" });   // the house card: wild
const RUNE_CARD = {};
for (const c of RUNE_DECK) RUNE_CARD[c.id] = c;

/* ---------- painting, on a 100×140 grid that the sprite scales ---------- */
const CARD_W = 100, CARD_H = 140;
const CARD_STOCK = "#e8e2d0", CARD_FACE = "#141022", CARD_INK = "#0b0b14", CARD_GOLD = "#e3c46e";
const CARD_FONT = "'Courier New', ui-monospace, monospace";

function cardRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + (n >> 16) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
}
function cardRound(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* a suit's pip, centred on the origin and pointing up, s = half its height. Uses the current fill and stroke */
function cardPip(g, suit, s) {
  g.beginPath();
  if (suit === "rounds") {
    const w = s * 0.46;
    g.moveTo(-w, s * 0.78); g.lineTo(-w, -s * 0.1);
    g.quadraticCurveTo(-w, -s, 0, -s); g.quadraticCurveTo(w, -s, w, -s * 0.1);
    g.lineTo(w, s * 0.78); g.closePath(); g.fill();
    g.fillRect(-w * 1.3, s * 0.72, w * 2.6, s * 0.28);   // the rim
  } else if (suit === "hunt") {
    g.lineWidth = s * 0.26;
    g.arc(0, 0, s * 0.6, 0, TAU);
    g.moveTo(0, -s); g.lineTo(0, -s * 0.3); g.moveTo(0, s); g.lineTo(0, s * 0.3);
    g.moveTo(-s, 0); g.lineTo(-s * 0.3, 0); g.moveTo(s, 0); g.lineTo(s * 0.3, 0);
    g.stroke();
    g.beginPath(); g.arc(0, 0, s * 0.14, 0, TAU); g.fill();
  } else if (suit === "blight") {
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.3, -s * 0.5, s * 0.8, -s * 0.1, s * 0.72, s * 0.36);
    g.bezierCurveTo(s * 0.64, s * 0.84, s * 0.24, s, 0, s);
    g.bezierCurveTo(-s * 0.24, s, -s * 0.64, s * 0.84, -s * 0.72, s * 0.36);
    g.bezierCurveTo(-s * 0.8, -s * 0.1, -s * 0.3, -s * 0.5, 0, -s);
    g.fill();
  } else if (suit === "ward") {
    const w = s * 0.82;
    g.moveTo(-w, -s * 0.82); g.lineTo(w, -s * 0.82); g.lineTo(w, -s * 0.1);
    g.quadraticCurveTo(w, s * 0.62, 0, s); g.quadraticCurveTo(-w, s * 0.62, -w, -s * 0.1);
    g.closePath(); g.fill();
  } else {
    g.arc(0, 0, s * 0.86, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, 0, s * 0.52, 0, TAU);
    g.lineWidth = s * 0.2; g.strokeStyle = CARD_INK; g.stroke();
  }
}

/* text spread out along a line, squeezed to fit maxW — a long name shrinks rather than touch its letters */
function cardSpaced(g, txt, x, y, maxW, size) {
  const n = txt.length, sp = Math.min(size * 0.8, maxW / n);
  g.font = "bold " + Math.min(size, sp / 0.64) + "px " + CARD_FONT;
  for (let i = 0; i < n; i++) g.fillText(txt[i], x + (i - (n - 1) / 2) * sp, y);
}

/* the house card's index mark: a four-point star */
function cardStar(g, x, y, s) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? s * 0.32 : s;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
}

/* the corner index: rank over pip, top-left. The bottom-right one is this, turned over */
function cardIndex(g, card, col) {
  g.fillStyle = col; g.strokeStyle = col;
  g.textAlign = "center"; g.textBaseline = "middle";
  if (card.suit === "house") cardStar(g, 17, 18, 8);
  else {
    const rk = String(card.rank);
    g.font = "bold 21px " + CARD_FONT;
    g.save(); g.translate(17, 19);
    if (rk.length > 1) g.scale(0.7, 1);
    g.fillText(rk, 0, 0);
    g.restore();
  }
  g.save(); g.translate(17, 35); cardPip(g, card.suit, 4.6); g.restore();
}

/* k = sprite pixels per grid unit. shadowBlur works in pixels, so it scales by k */
function paintCardFace(g, card, k) {
  const R = RUNES[card.id], house = card.suit === "house", ace = card.rank === "A";
  const col = house ? CARD_GOLD : R.color, MX = 50, MY = 62;
  /* the stock, the face, the rune's light pooled in the middle */
  cardRound(g, 0, 0, CARD_W, CARD_H, 8); g.fillStyle = house ? CARD_GOLD : CARD_STOCK; g.fill();
  cardRound(g, 4, 4, CARD_W - 8, CARD_H - 8, 5); g.fillStyle = house ? "#1c140a" : CARD_FACE; g.fill();
  g.save(); g.clip();
  const pool = g.createRadialGradient(MX, MY, 2, MX, MY, 76);
  pool.addColorStop(0, cardRgba(col, 0.34)); pool.addColorStop(1, cardRgba(col, 0));
  g.fillStyle = pool; g.fillRect(0, 0, CARD_W, CARD_H);
  g.restore();
  cardRound(g, 7.5, 7.5, CARD_W - 15, CARD_H - 15, 3);
  g.strokeStyle = cardRgba(col, 0.42); g.lineWidth = 1; g.stroke();

  /* the medallion, and round it one pip per point, like rounds in a cylinder */
  g.beginPath(); g.arc(MX, MY, ace ? 26 : 23, 0, TAU);
  g.fillStyle = house ? CARD_GOLD : CARD_INK; g.fill();
  g.strokeStyle = cardRgba(col, 0.85); g.lineWidth = 1.4; g.stroke();
  g.fillStyle = col; g.strokeStyle = col;
  if (house) {
    /* a soul coin, milled edge and all, ringed by the twenty-one it can make */
    g.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU;
      g.moveTo(MX + Math.cos(a) * 21, MY + Math.sin(a) * 21); g.lineTo(MX + Math.cos(a) * 23, MY + Math.sin(a) * 23);
    }
    g.strokeStyle = "#8a6a2a"; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.arc(MX, MY, 18, 0, TAU); g.stroke();
    for (let i = 0; i < 21; i++) {
      const a = -Math.PI / 2 + i / 21 * TAU;
      g.beginPath(); g.arc(MX + Math.cos(a) * 31, MY + Math.sin(a) * 31, 1.7, 0, TAU); g.fill();
    }
  } else if (ace) {
    /* the signature rune: a second ring, milled like a dial */
    g.beginPath(); g.arc(MX, MY, 31, 0, TAU);
    g.strokeStyle = cardRgba(col, 0.55); g.lineWidth = 1; g.stroke();
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, r0 = i % 2 ? 31 : 29.5;
      g.moveTo(MX + Math.cos(a) * r0, MY + Math.sin(a) * r0); g.lineTo(MX + Math.cos(a) * 34, MY + Math.sin(a) * 34);
    }
    g.stroke();
  } else {
    const n = card.rank;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i / n * TAU;
      g.save(); g.translate(MX + Math.cos(a) * 32, MY + Math.sin(a) * 32); g.rotate(a + Math.PI / 2);
      cardPip(g, card.suit, 3.6);
      g.restore();
    }
  }

  /* the rune itself, lit */
  g.font = (ace ? 36 : 32) + "px " + CARD_FONT; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = house ? "#3a2a10" : col;
  if (!house) { g.shadowColor = col; g.shadowBlur = 9 * k; g.fillText(R.glyph, MX, MY + 1); g.shadowBlur = 0; }
  g.fillText(R.glyph, MX, MY + 1);

  g.fillStyle = house ? CARD_GOLD : CARD_STOCK;
  cardSpaced(g, R.name, MX, 106, 48, 8.5);   // 48 wide keeps a long name clear of the bottom-right pip

  cardIndex(g, card, col);
  g.save(); g.translate(CARD_W, CARD_H); g.rotate(Math.PI); cardIndex(g, card, col); g.restore();
}

/* the back: the Singular's own deck. Six chambers round a black hole, on violet lattice */
function paintCardBack(g) {
  const MX = 50, MY = 70, AMBER = "#f2b36d";
  cardRound(g, 0, 0, CARD_W, CARD_H, 8); g.fillStyle = CARD_STOCK; g.fill();
  cardRound(g, 4, 4, CARD_W - 8, CARD_H - 8, 5); g.fillStyle = "#1a1030"; g.fill();
  g.save(); g.clip();
  g.strokeStyle = cardRgba(AMBER, 0.13); g.lineWidth = 1; g.beginPath();
  for (let d = -CARD_H; d < CARD_W + CARD_H; d += 11) {
    g.moveTo(d, 0); g.lineTo(d + CARD_H, CARD_H); g.moveTo(d + CARD_H, 0); g.lineTo(d, CARD_H);
  }
  g.stroke();
  const pool = g.createRadialGradient(MX, MY, 4, MX, MY, 58);
  pool.addColorStop(0, "rgba(157,107,255,0.42)"); pool.addColorStop(1, "rgba(157,107,255,0)");
  g.fillStyle = pool; g.fillRect(0, 0, CARD_W, CARD_H);
  g.restore();
  cardRound(g, 9, 9, CARD_W - 18, CARD_H - 18, 3); g.strokeStyle = cardRgba(AMBER, 0.75); g.lineWidth = 1.3; g.stroke();
  cardRound(g, 12.5, 12.5, CARD_W - 25, CARD_H - 25, 2); g.strokeStyle = cardRgba(AMBER, 0.3); g.lineWidth = 0.8; g.stroke();
  /* a diamond at each end of the long axis */
  g.fillStyle = AMBER;
  for (const y of [22, CARD_H - 22]) {
    g.beginPath(); g.moveTo(MX, y - 5); g.lineTo(MX + 4, y); g.lineTo(MX, y + 5); g.lineTo(MX - 4, y); g.closePath(); g.fill();
  }
  /* the cylinder */
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i / 6 * TAU;
    g.beginPath(); g.arc(MX + Math.cos(a) * 26, MY + Math.sin(a) * 26, 6.5, 0, TAU);
    g.fillStyle = CARD_INK; g.fill();
    g.strokeStyle = cardRgba(AMBER, 0.65); g.lineWidth = 1.2; g.stroke();
  }
  /* the horizon */
  g.beginPath(); g.arc(MX, MY, 20, 0, TAU); g.strokeStyle = cardRgba(AMBER, 0.32); g.lineWidth = 0.8; g.stroke();
  g.beginPath(); g.arc(MX, MY, 15, 0, TAU); g.fillStyle = "#05030a"; g.fill();
  g.strokeStyle = AMBER; g.lineWidth = 2; g.stroke();
}

/* ---------- the sprite cache ---------- */
const _cardSprites = new Map();
const CARD_SPRITE_CAP = 96;     // 33 faces + a back at a couple of sizes, with room to spare
function cardSprite(id, pw) {
  pw = Math.max(12, Math.ceil(pw / 4) * 4);    // snap sizes so a drifting zoom doesn't mint a sprite per frame
  const face = id && RUNE_CARD[id], key = (face ? id : "back") + "|" + pw;
  let c = _cardSprites.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = pw; c.height = Math.round(pw * CARD_H / CARD_W);
  const g = c.getContext("2d"), k = pw / CARD_W;
  g.scale(k, k);
  if (face) paintCardFace(g, face, k); else paintCardBack(g);
  if (_cardSprites.size >= CARD_SPRITE_CAP) _cardSprites.delete(_cardSprites.keys().next().value);
  _cardSprites.set(key, c);
  return c;
}

/* one card centred on (x, y), w units wide in g's current transform, turned by rot. id null = face down.
   px = device pixels per unit there (DPR × ZOOM in the world), so the sprite is painted at the size it lands */
function drawRuneCard(g, id, x, y, w, rot, px) {
  const s = cardSprite(id, w * (px || 1)), h = w * CARD_H / CARD_W;
  g.save(); g.translate(x, y);
  if (rot) g.rotate(rot);
  g.drawImage(s, -w / 2, -h / 2, w, h);
  g.restore();
}
