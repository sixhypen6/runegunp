/* =========================================================
   RUNEGUN · Scene — the felt table in THE SINGULAR
   Blackjack dealt in rune cards (render/cards.js), staked with the run's souls.
   The gilded regular deals: you again, on a luckier day. The dealer stands on
   every 17, a natural pays 3 to 2, a two-card hand may double, and there are
   no splits. MIDAS is wild: it always counts as whatever brings its hand
   closest to 21, so its number climbs and falls as the hand changes.
   A state of its own ("blackjack"): the saloon holds still behind a dimmed
   felt painted on the game canvas, and the buttons are DOM (#blackjack).
   ========================================================= */
"use strict";

const BJ_SEAT = { x: 778, y: 974 };     // the empty chair on the near side of the felt
const BJ_REACH = 64;                    // close enough to sit
const BJ_DECKS = 3;                     // the shoe: three rune decks shuffled together
const BJ_CUT = 18;                      // reshuffle the shoe once fewer than this remain
const BJ_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const BJ_FLY = 0.3;                     // seconds a card takes from the shoe to its place
const BJ_FLIP = 0.32;                   // seconds to turn the hole card over
const BJ_BANNER_T = 1.5;                // seconds the outcome holds over the felt before it settles into the centre line
const BJ_QUIPS = {
  sit: ["Sit down, me. I'll deal you out."],
  back: ["Back again? Course you are.", "Your stool. Still warm."],
  deal: ["Cards are runes. Runes are cards.", "Same deck we all fell with.", "Read 'em."],
  midas: ["The house card. Gold changes its mind.", "MIDAS. It counts whatever it likes."],
  bust: ["Every one of us busts eventually.", "Too greedy. I know the feeling."],
  natural: ["A natural. I hate that.", "Twenty-one off the top. Huh."],
  dealerBust: ["Huh. Luck's a rune too.", "Went over. Happens to me."],
  lose: ["House keeps it. House is also you.", "Souls don't care who holds them."],
  win: ["Take it. You'll spend it dying.", "Fair's fair."],
  push: ["Even. Nobody learns anything."],
  broke: ["Pockets empty. Go earn some more."],
};

/* ---------- the rules ---------- */

/* the best total for a hand and what each MIDAS in it counts as. Aces count 1 or 11
   and MIDAS anything from 1 to 11, so together they can reach every total between
   their floor and ceiling: the hand takes the highest that doesn't pass 21 */
function bjScore(cards) {
  let base = 0, aces = 0, wilds = 0;
  for (const c of cards) {
    if (c.suit === "house") { wilds++; base += 1; }
    else if (c.rank === "A") { aces++; base += 1; }
    else base += c.rank;
  }
  let total = base;
  if (base <= 21) {
    if (wilds) total = Math.min(21, base + 10 * (aces + wilds));
    else for (let k = 0; k < aces && total + 10 <= 21; k++) total += 10;
  }
  /* the extra goes to the aces in whole tens first; the wilds take whatever is left */
  let rest = total - base;
  rest -= 10 * Math.min(aces, Math.floor(rest / 10));
  const wild = [];
  for (let k = 0; k < wilds; k++) { const v = Math.min(10, rest); wild.push(1 + v); rest -= v; }
  return { total, wild, natural: cards.length === 2 && total === 21 };
}

function bjShoe() {
  const shoe = [];
  for (let d = 0; d < BJ_DECKS; d++) for (const c of RUNE_DECK) shoe.push(c);
  for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  return shoe;
}

/* the table lives on the saloon record, so every visit starts with a fresh shoe */
function bjTable() {
  const S = Game.saloon;
  if (!S.bj) S.bj = { shoe: bjShoe(), bet: 10, phase: "bet", clock: 0, queue: [],
    hands: { dealer: [], you: [] }, totals: { dealer: bjBadge(), you: bjBadge() },
    stake: 0, banner: null, quip: null, sat: false, panelH: 104 };
  return S.bj;
}

/* a number that counts its way to each new value: MIDAS's worth, and each hand's total */
function bjBadge() { return { shown: 0, from: 0, to: 0, t: 0, dur: 0, dir: 0, settle: -1, on: false }; }
function bjBadgeTo(b, v, from) {
  if (b.on && b.to === v) return;
  b.from = from !== undefined ? from : (b.on ? b.shown : v);
  b.shown = b.from; b.to = v; b.on = true;
  b.t = 0; b.dur = b.from === v ? 0 : 0.08 + 0.075 * Math.abs(v - b.from);
  b.dir = Math.sign(v - b.from); b.settle = b.dur ? -1 : 0;
}
function bjBadgeTick(b, dt, midas) {
  if (!b.on) return;
  if (b.t < b.dur) {
    b.t = Math.min(b.dur, b.t + dt);
    const n = Math.round(b.from + (b.to - b.from) * (b.t / b.dur));
    if (n !== b.shown) { b.shown = n; if (midas) AudioFX.midasStep(n); }
    if (b.t >= b.dur) b.settle = 0;
  } else if (b.settle >= 0) b.settle += dt;
}
/* swell while counting up, shrink while counting down, then spring back */
function bjBadgeScale(b, amp) {
  if (!b.dir) return 1;
  if (b.t < b.dur) return 1 + b.dir * amp * Math.min(1, b.t / 0.12);
  return 1 + b.dir * amp * Math.exp(-b.settle * 9) * Math.cos(b.settle * 16);
}

/* ---------- the dealer's voice ---------- */
function bjDealer() { const g = Game.saloon && Game.saloon.regs.find(r => r.id === "high"); return g && g.npc; }
function bjQuip(kind) {
  const T = bjTable(), lines = BJ_QUIPS[kind];
  T.quip = { txt: pick(lines), t: 0 };
  const d = bjDealer();
  AudioFX.murmur(d ? d.voice : 200, Math.min(8, 3 + Math.floor(T.quip.txt.length / 8)));
}

/* ---------- sequencing: each step waits for its delay AND for the felt to settle ----------
   A deal only waits for cards in motion; a decision (loose = false) also waits for every
   number to finish counting, so MIDAS lands on its value before anyone acts on it */
function bjAfter(delay, fn, loose) { const T = bjTable(); T.queue.push({ at: T.clock + delay, fn, loose: !!loose }); }
function bjIdle(T, loose) {
  for (const who in T.hands) for (const c of T.hands[who]) {
    if (c.fly < 1 || (c.flipping && c.flip < 1)) return false;
    if (!loose && c.badge.on && c.badge.t < c.badge.dur) return false;
  }
  return true;
}

function bjDeal(who, faceUp) {
  const T = bjTable();
  if (T.shoe.length < 1) T.shoe = bjShoe();
  const card = T.shoe.pop();
  T.hands[who].push({ c: card, up: faceUp, fly: 0, flip: faceUp ? 1 : 0, flipping: false,
    rot: rnd(-0.07, 0.07), x: 0, y: 0, landed: false, badge: bjBadge() });
  AudioFX.deal();
}
/* what each hand shows: its face-up cards. MIDAS badges and totals count to their new values */
function bjRescore(who) {
  const T = bjTable(), hand = T.hands[who];
  const seen = hand.filter(c => c.landed && c.up && c.flip >= 0.5);
  const sc = bjScore(seen.map(c => c.c));
  let w = 0, midasNew = false;
  for (const c of seen) if (c.c.suit === "house") {
    if (!c.badge.on) midasNew = true;
    bjBadgeTo(c.badge, sc.wild[w++], c.badge.on ? undefined : 1);   // a new MIDAS counts up from 1
  }
  if (midasNew && T.phase !== "bet") bjQuip("midas");
  bjBadgeTo(T.totals[who], sc.total, T.totals[who].on ? undefined : 0);
  return sc;
}
const bjFull = who => bjScore(bjTable().hands[who].map(c => c.c));

function bjReveal() {
  const T = bjTable();
  for (const c of T.hands.dealer) if (!c.up) { c.up = true; c.flipping = true; c.flip = 0; AudioFX.flip(); }
}

/* ---------- a hand, from the wager to the payout ---------- */
function bjStart() {
  const T = bjTable();
  if (T.phase !== "bet" && T.phase !== "done") return;
  T.bet = clamp(Math.floor(T.bet), 1, Game.score);
  if (Game.score < 1 || T.bet < 1) { bjQuip("broke"); return; }
  Game.score -= T.bet; T.stake = T.bet; updateScore();
  if (T.shoe.length < BJ_CUT) T.shoe = bjShoe();
  T.hands.dealer = []; T.hands.you = [];
  T.totals.dealer = bjBadge(); T.totals.you = bjBadge();
  T.banner = null; T.queue = [];
  T.phase = "deal";
  bjSyncUI();
  bjAfter(0, () => bjDeal("you", true), true);
  bjAfter(0.05, () => bjDeal("dealer", true), true);
  bjAfter(0.05, () => bjDeal("you", true), true);
  bjAfter(0.05, () => bjDeal("dealer", false), true);
  bjAfter(0.3, bjAfterDeal);
  if (Math.random() < 0.35) bjQuip("deal");
}

function bjAfterDeal() {
  const T = bjTable(), you = bjFull("you"), dealer = bjFull("dealer");
  if (you.natural || dealer.natural) {
    bjReveal();
    bjAfter(0.5, () => {
      if (you.natural && dealer.natural) bjSettle("push");
      else if (you.natural) bjSettle("natural");
      else bjSettle("dealerNatural");
    });
    T.phase = "reveal"; bjSyncUI();
    return;
  }
  T.phase = "player"; bjSyncUI();
}

function bjHit() {
  const T = bjTable(); if (T.phase !== "player") return;
  T.phase = "drawing"; bjSyncUI();
  bjDeal("you", true);
  bjAfter(0.2, bjAfterHit);
}
function bjAfterHit() {
  const T = bjTable(), you = bjFull("you");
  if (you.total > 21) { bjReveal(); T.phase = "reveal"; bjSyncUI(); bjAfter(0.45, () => bjSettle("bust")); }
  else if (you.total === 21 || T.doubled) bjDealerTurn();
  else { T.phase = "player"; bjSyncUI(); }
}
function bjStand() { if (bjTable().phase === "player") bjDealerTurn(); }
function bjCanDouble() { const T = bjTable(); return T.phase === "player" && T.hands.you.length === 2 && Game.score >= T.stake; }
function bjDouble() {
  const T = bjTable(); if (!bjCanDouble()) return;
  Game.score -= T.stake; T.stake *= 2; T.doubled = true; updateScore();
  T.phase = "drawing"; bjSyncUI();
  bjDeal("you", true);
  bjAfter(0.2, bjAfterHit);
}

/* the dealer turns the hole card and draws to 17 */
function bjDealerTurn() {
  const T = bjTable();
  T.phase = "dealer"; bjSyncUI();
  bjReveal();
  bjAfter(0.4, bjDealerStep);
}
function bjDealerStep() {
  const d = bjFull("dealer");
  if (d.total < 17) { bjDeal("dealer", true); bjAfter(0.4, bjDealerStep); return; }
  const you = bjFull("you").total;
  if (d.total > 21) bjSettle("dealerBust");
  else if (you > d.total) bjSettle("win");
  else if (you < d.total) bjSettle("lose");
  else bjSettle("push");
}

const BJ_OUTCOME = {
  natural:       { txt: "BLACKJACK", pay: s => s + Math.ceil(s * 1.5), col: "#ffd23d", quip: "natural" },
  win:           { txt: "YOU WIN", pay: s => s * 2, col: "#ffd23d", quip: "win" },
  dealerBust:    { txt: "DEALER BUSTS", pay: s => s * 2, col: "#ffd23d", quip: "dealerBust" },
  push:          { txt: "PUSH", pay: s => s, col: "#e8e2d0", quip: "push" },
  lose:          { txt: "DEALER WINS", pay: () => 0, col: "#ff4d5e", quip: "lose" },
  dealerNatural: { txt: "DEALER BLACKJACK", pay: () => 0, col: "#ff4d5e", quip: "lose" },
  bust:          { txt: "BUST", pay: () => 0, col: "#ff4d5e", quip: "bust" },
};
function bjSettle(kind) {
  const T = bjTable(), O = BJ_OUTCOME[kind], back = O.pay(T.stake);
  const net = back - T.stake;
  if (back > 0) { Game.score += back; updateScore(600); }
  T.banner = { txt: O.txt, sub: net > 0 ? "+" + net + " SOULS" : net < 0 ? "−" + (-net) + " SOULS" : "STAKE RETURNED", col: O.col, t: 0 };
  T.stake = 0; T.doubled = false;
  T.phase = "done";
  if (net > 0) { kind === "natural" ? AudioFX.streakChord(4) : AudioFX.pickup(); for (let i = 0; i < 6; i++) setTimeout(AudioFX.coinTick, 80 + i * 60); }
  else if (net < 0) AudioFX.streakLost(1);
  else AudioFX.calm();
  bjQuip(Game.score < 1 && back === 0 ? "broke" : O.quip);
  T.bet = Math.min(T.bet, Math.max(1, Game.score));
  bjSyncUI();
}

/* ---------- the wager ---------- */
function bjStep(dir) {
  const T = bjTable(), max = Game.score;
  if (max < 1) return;
  let b = T.bet;
  if (dir > 0) { const s = BJ_STEPS.find(v => v > b && v <= max); b = s || max; }
  else { const s = BJ_STEPS.filter(v => v < b); b = s.length ? s[s.length - 1] : 1; }
  T.bet = clamp(b, 1, max);
  AudioFX.click(); bjSyncUI();
}
function bjAllIn() { const T = bjTable(); if (Game.score < 1) return; T.bet = Game.score; AudioFX.click(); bjSyncUI(); }

/* ---------- sitting down and getting up ---------- */
function openBlackjack() {
  const S = Game.saloon; if (!S) return;
  const T = bjTable(), me = localPlayer();
  me.x = BJ_SEAT.x; me.y = BJ_SEAT.y; me.aim = -Math.PI / 2; me.dashT = 0;
  S.speech.length = 0;                    // the room holds still while you play; a bubble would freeze mid-word
  T.hands.dealer = []; T.hands.you = []; T.totals.dealer = bjBadge(); T.totals.you = bjBadge();
  T.queue = []; T.banner = null; T.phase = "bet";
  T.bet = clamp(T.bet, 1, Math.max(1, Game.score));
  setState("blackjack");
  bjQuip(Game.score < 1 ? "broke" : T.sat ? "back" : "sit");
  T.sat = true;
  bjSyncUI();
  AudioFX.click();
}
/* only between hands — souls on the felt stay until the hand is played out */
function closeBlackjack() {
  const T = bjTable();
  if (T.phase !== "bet" && T.phase !== "done") return;
  T.hands.dealer = []; T.hands.you = []; T.banner = null;
  setState("play");
  AudioFX.click();
}

/* per-frame, from main.js while the state is "blackjack" */
function tickBlackjack(dt) {
  const T = bjTable();
  T.clock += dt;
  if (T.quip) { T.quip.t += dt; if (T.quip.t > 3.4) T.quip = null; }
  if (T.banner) T.banner.t += dt;
  for (const who in T.hands) {
    for (const c of T.hands[who]) {
      if (c.fly < 1) { c.fly = Math.min(1, c.fly + dt / BJ_FLY); if (c.fly >= 1) { c.landed = true; bjRescore(who); } }
      if (c.flipping && c.flip < 1) {
        const was = c.flip;
        c.flip = Math.min(1, c.flip + dt / BJ_FLIP);
        if (was < 0.5 && c.flip >= 0.5) bjRescore(who);   // the face shows halfway through the turn
      }
      bjBadgeTick(c.badge, dt, true);
    }
    bjBadgeTick(T.totals[who], dt, false);
  }
  /* the next step, once its time has come and nothing is still moving */
  if (T.queue.length && T.queue[0].at <= T.clock && bjIdle(T, T.queue[0].loose)) T.queue.shift().fn();
  /* the piano keeps playing, and the last round keeps wearing off */
  salPianoTick(dt);
  tickDrunk(dt);
}

/* ---------- the DOM controls ---------- */
function bjSyncUI() {
  const T = bjTable(), betting = T.phase === "bet" || T.phase === "done", playing = T.phase === "player";
  const broke = Game.score < 1;
  $("bjBetRow").style.display = betting ? "" : "none";
  $("bjBetActs").style.display = betting ? "" : "none";
  $("bjPlayActs").style.display = betting ? "none" : "";
  $("bjBet").textContent = broke ? "0" : String(T.bet);
  $("bjDeal").textContent = T.phase === "done" ? "DEAL AGAIN" : "DEAL";
  $("bjDeal").disabled = broke;
  $("bjLess").disabled = broke || T.bet <= 1;
  $("bjMore").disabled = broke || T.bet >= Game.score;
  $("bjAll").disabled = broke || T.bet >= Game.score;
  $("bjHit").disabled = !playing;
  $("bjStand").disabled = !playing;
  $("bjDouble").disabled = !bjCanDouble();
  $("bjDouble").textContent = "DOUBLE" + (T.stake ? " · " + T.stake : "");
  /* measured only while betting, its tallest layout, so the felt keeps one size through a hand */
  if (betting) T.panelH = $("bjPanel").offsetHeight || T.panelH;
}
$("bjLess").addEventListener("click", () => bjStep(-1));
$("bjMore").addEventListener("click", () => bjStep(1));
$("bjAll").addEventListener("click", bjAllIn);
$("bjDeal").addEventListener("click", bjStart);
$("bjLeave").addEventListener("click", closeBlackjack);
$("bjHit").addEventListener("click", bjHit);
$("bjStand").addEventListener("click", bjStand);
$("bjDouble").addEventListener("click", bjDouble);
window.addEventListener("resize", () => { if (Game.state === "blackjack") bjSyncUI(); });

/* keys at the table: ←/→ the wager, ENTER deals, H/S/D play, ESC gets up */
function bjKey(e) {
  if (e.repeat) return;                 // the E held down to sit must not roll straight into a deal
  const T = bjTable(), k = e.code;
  if (k === "Escape" || k === "KeyQ") closeBlackjack();
  else if (k === "ArrowLeft" || k === "Minus" || k === "NumpadSubtract") { if (T.phase === "bet" || T.phase === "done") bjStep(-1); }
  else if (k === "ArrowRight" || k === "Equal" || k === "NumpadAdd") { if (T.phase === "bet" || T.phase === "done") bjStep(1); }
  else if (k === "Enter" || k === "Space" || k === "KeyE") { if (T.phase === "player") bjStand(); else bjStart(); }
  else if (k === "KeyH") bjHit();
  else if (k === "KeyS") bjStand();
  else if (k === "KeyD") bjDouble();
  else return;
  e.preventDefault();
}

/* ---------- drawing: screen space, over the frozen saloon ---------- */
/* where everything sits. A tall felt stacks the dealer's row over yours; a short, wide one
   (a phone held sideways) seats the hands side by side, so the cards stay big and clear */
function bjLayout(T) {
  /* the dealer's line rides above the felt; a short phone gives up a little of that
     headroom rather than run the felt's rail into the buttons */
  const bottom = H - T.panelH - 30, top = clamp(bottom - 150, 50, 62);
  const fw = Math.min(W - 24, 780), fh = Math.max(150, Math.min(bottom - top, 470));
  const fx = (W - fw) / 2, fy = top + Math.max(0, (bottom - top - fh) / 2);
  let cw = clamp(Math.min((fh - 46) / 2 / 1.4, fw / 7), 38, 108);
  const L = { fx, fy, fw, fh, wide: cw < 64 && fw > fh * 2.6, zone: {} };
  if (L.wide) {
    cw = clamp(Math.min((fh - 66) / 1.4, (fw - 60) / 9), 38, 108);
    const ch = cw * 1.4, shoeX = fx + fw - cw / 2 - 14;
    const l = fx + 16, r = shoeX - cw / 2 - 16, mid = (l + r) / 2, y = fy + 36 + ch / 2;
    L.zone.dealer = { l, r: mid - 12, y };
    L.zone.you = { l: mid + 12, r, y };
    Object.assign(L, { cw, ch, shoeX, shoeY: y, headY: fy + 17, bandY: fy + fh - 13, bannerY: y });
  } else {
    const ch = cw * 1.4, colW = clamp(fw * 0.15, 60, 116), shoeX = fx + fw - cw / 2 - 16;
    const l = fx + colW, r = shoeX - cw / 2 - 14;
    const dy = fy + 14 + ch / 2, yy = fy + fh - 14 - ch / 2;
    L.zone.dealer = { l, r, y: dy };
    L.zone.you = { l, r, y: yy };
    Object.assign(L, { cw, ch, colW, shoeX, shoeY: dy, bandY: (dy + yy) / 2, bannerY: (dy + yy) / 2 });
  }
  return L;
}
function bjSlot(L, who, i, n) {
  const z = L.zone[who], span = z.r - z.l, sp = n > 1 ? Math.min(L.cw * 0.8, (span - L.cw) / (n - 1)) : 0;
  return { x: (z.l + z.r) / 2 - sp * (n - 1) / 2 + sp * i, y: z.y };
}
/* each hand's name, its total (counting like MIDAS does, with a smaller swell) and the stake riding on yours */
function drawBjHeads(T, L) {
  cx.textBaseline = "middle";
  for (const who of ["dealer", "you"]) {
    const z = L.zone[who], b = T.totals[who], name = who === "you" ? "YOU" : "DEALER";
    const stake = who === "you" && T.stake ? "STAKE " + T.stake : "";
    let nx, ny, tx, ty, fs;
    cx.font = "bold 10px monospace";
    if (L.wide) {
      cx.textAlign = "left"; nx = z.l; ny = L.headY;
      tx = z.l + cx.measureText(name).width + 22; ty = L.headY; fs = 20;
    } else {
      cx.textAlign = "center"; nx = L.fx + L.colW / 2 + 2; ny = z.y - 18;
      tx = nx; ty = z.y + 6; fs = 26;
    }
    cx.fillStyle = "rgba(232,226,208,0.6)";
    cx.fillText(name, nx, ny);
    if (b.on) {
      const sc = bjBadgeScale(b, 0.16);
      cx.save(); cx.translate(tx, ty); cx.scale(sc, sc);
      cx.textAlign = "center"; cx.font = "bold " + fs + "px monospace";
      cx.fillStyle = b.shown > 21 ? "#ff4d5e" : b.shown === 21 ? "#ffd23d" : "#e8e2d0";
      cx.fillText(String(b.shown), 0, 0);
      cx.restore();
    }
    if (stake) {
      cx.font = "bold 11px monospace"; cx.fillStyle = "#ffd23d";
      if (L.wide) { cx.textAlign = "right"; cx.fillText(stake, z.r, L.headY); }
      else { cx.textAlign = "center"; cx.fillText(stake, nx, z.y + 30); }
    }
  }
}
const bjEase = k => 1 - Math.pow(1 - k, 3);

function drawBlackjack() {
  const S = Game.saloon; if (!S || !S.bj) return;
  const T = S.bj, L = bjLayout(T), px = DPR;
  cx.save();
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  /* the room falls away; the felt and its rail */
  cx.fillStyle = "rgba(6,4,12,0.62)"; cx.fillRect(0, 0, W, H);
  cx.fillStyle = "rgba(0,0,0,0.4)"; cx.fillRect(L.fx + 8, L.fy + 10, L.fw, L.fh);
  cx.fillStyle = "#3a2418"; cx.fillRect(L.fx - 10, L.fy - 10, L.fw + 20, L.fh + 20);
  cx.strokeStyle = "#5a3a26"; cx.lineWidth = 2; cx.strokeRect(L.fx - 6, L.fy - 6, L.fw + 12, L.fh + 12);
  cx.fillStyle = "#1f3a2c"; cx.fillRect(L.fx, L.fy, L.fw, L.fh);
  cx.strokeStyle = "rgba(242,179,109,0.28)"; cx.lineWidth = 1; cx.strokeRect(L.fx + 6, L.fy + 6, L.fw - 12, L.fh - 12);

  /* the house rules printed on the felt between the hands; once a hand is settled, its outcome */
  const bandFs = clamp(Math.round(L.fw / 62), 9, 13);
  cx.textAlign = "center"; cx.textBaseline = "middle";
  if (T.banner && T.banner.t > BJ_BANNER_T - 0.3) {
    cx.globalAlpha = clamp((T.banner.t - BJ_BANNER_T + 0.3) / 0.3, 0, 1);
    cx.font = "bold " + (bandFs + 2) + "px monospace"; cx.fillStyle = T.banner.col;
    cx.fillText(T.banner.txt + " · " + T.banner.sub, L.fx + L.fw / 2, L.bandY);
    cx.globalAlpha = 1;
  } else if (!T.banner) {
    cx.font = bandFs + "px monospace"; cx.fillStyle = "rgba(242,179,109,0.5)";
    cx.fillText(L.fw > 560 ? "BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17 · MIDAS IS WILD"
                           : "PAYS 3 TO 2 · STANDS ON 17 · MIDAS WILD", L.fx + L.fw / 2, L.bandY);
  }
  /* the dealer talks from across the table, above the rail (the HUD's top centre is hidden here) */
  if (T.quip) {
    const a = clamp(Math.min(T.quip.t / 0.15, (3.4 - T.quip.t) / 0.4), 0, 1), d = bjDealer();
    const txt = "“" + T.quip.txt + "”";
    let fs = 13;
    cx.font = "bold " + fs + "px monospace";
    const room = W - 2 * 96;                     // clear of the souls counter in the top-right corner
    const w = cx.measureText(txt).width;
    if (w > room) { fs = Math.max(9, Math.floor(fs * room / w)); cx.font = "bold " + fs + "px monospace"; }
    cx.globalAlpha = a;
    cx.fillStyle = d && SKINS[d.skin] ? SKINS[d.skin].color : "#ffd23d";
    cx.fillText(txt, W / 2, L.fy - 28);
    cx.globalAlpha = 1;
  }

  /* the shoe */
  const left = T.shoe.length;
  for (let k = Math.min(4, Math.ceil(left / 12)); k >= 0; k--) drawRuneCard(cx, null, L.shoeX + k * 1.5, L.shoeY + k * 1.5, L.cw, 0, px);
  cx.font = "9px monospace"; cx.fillStyle = "rgba(232,226,208,0.45)"; cx.textAlign = "center";
  cx.fillText(left + " LEFT", L.shoeX, L.shoeY + L.ch / 2 + 10);

  /* the hands: each card flies from the shoe, settles into its place, the hole card turns over */
  for (const who of ["dealer", "you"]) {
    const hand = T.hands[who], n = hand.length;
    hand.forEach((c, i) => {
      const s = bjSlot(L, who, i, n);
      if (c.fly < 1) {
        const k = bjEase(c.fly);
        c.x = lerp(L.shoeX, s.x, k); c.y = lerp(L.shoeY, s.y, k);
      } else {
        c.x = lerp(c.x, s.x, 0.25); c.y = lerp(c.y, s.y, 0.25);   // slide over as the hand grows
      }
      const rot = c.fly < 1 ? c.rot + (1 - c.fly) * 0.6 : c.rot;
      const sx = c.flipping ? Math.abs(Math.cos(c.flip * Math.PI)) : 1;
      const faceShown = c.up && c.flip >= 0.5;
      cx.save(); cx.translate(c.x, c.y); cx.rotate(rot); cx.scale(Math.max(0.02, sx), 1);
      drawRuneCard(cx, faceShown ? c.c.id : null, 0, 0, L.cw, 0, px);
      cx.restore();
      /* MIDAS wears what it's worth right now */
      if (faceShown && c.c.suit === "house" && c.badge.on) drawBjMidasBadge(c, L);
    });
  }

  drawBjHeads(T, L);

  /* the outcome slams in over the felt, then settles into the line between the hands */
  if (T.banner && T.banner.t < BJ_BANNER_T) {
    const B = T.banner, a = clamp(Math.min(B.t / 0.18, (BJ_BANNER_T - B.t) / 0.3), 0, 1), pop = 1 + (1 - clamp(B.t / 0.18, 0, 1)) * 0.5;
    const big = clamp(Math.round(L.fw / 26), 18, 30);
    cx.save(); cx.translate(L.fx + L.fw / 2, L.bannerY); cx.scale(pop, pop);
    cx.globalAlpha = a;
    cx.font = "bold " + big + "px monospace";
    const w = Math.max(cx.measureText(B.txt).width, 120) + 40, h = big * 2.2;
    cx.fillStyle = "rgba(8,6,16,0.86)"; cx.fillRect(-w / 2, -h / 2, w, h);
    cx.strokeStyle = B.col; cx.lineWidth = 1.5; cx.strokeRect(-w / 2 + 0.75, -h / 2 + 0.75, w - 1.5, h - 1.5);
    cx.fillStyle = B.col; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(B.txt, 0, -big * 0.32);
    cx.font = "bold " + Math.round(big * 0.48) + "px monospace"; cx.fillStyle = "#e8e2d0";
    cx.fillText(B.sub, 0, big * 0.55);
    cx.restore();
  }
  cx.restore();
}

/* a gold coin over the card's top edge with MIDAS's current worth: it swells while
   the number climbs and shrinks while it falls */
function drawBjMidasBadge(c, L) {
  const b = c.badge, r = Math.max(12, L.cw * 0.2), sc = bjBadgeScale(b, 0.34);
  const gx = c.x, gy = c.y - L.ch / 2 - r * 0.25;
  cx.save(); cx.translate(gx, gy); cx.scale(sc, sc);
  cx.fillStyle = "rgba(0,0,0,0.45)"; cx.beginPath(); cx.arc(1.5, 2.5, r, 0, TAU); cx.fill();
  cx.fillStyle = b.t < b.dur ? (b.dir > 0 ? "#ffe9a0" : "#d9a84a") : CARD_GOLD;
  cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
  cx.strokeStyle = "#8a6a2a"; cx.lineWidth = 2; cx.stroke();
  cx.fillStyle = "#3a2a10"; cx.font = "bold " + Math.round(r * 1.15) + "px monospace";
  cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillText(String(b.shown), 0, 1);
  cx.restore();
}

/* ---------- in the saloon: the empty chair calls you over ---------- */
function bjNearSeat(p) { return dist2(p.x, p.y, BJ_SEAT.x, BJ_SEAT.y) < BJ_REACH * BJ_REACH; }

/* under the bodies: a glowing ring on the floor at the empty chair */
function drawBjSeatMarker() {
  const S = Game.saloon; if (!S) return;
  const sat = S.bj && S.bj.sat, t = Game.time, pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
  cx.save();
  cx.globalAlpha = (sat ? 0.3 : 0.55) + 0.25 * pulse;
  cx.strokeStyle = "#ffd23d"; cx.lineWidth = 2.5;
  cx.beginPath(); cx.ellipse(BJ_SEAT.x, BJ_SEAT.y + 4, 22 + 3 * pulse, 11 + 1.5 * pulse, 0, 0, TAU); cx.stroke();
  cx.globalAlpha *= 0.5; cx.lineWidth = 1.5;
  cx.beginPath(); cx.ellipse(BJ_SEAT.x, BJ_SEAT.y + 4, 32 + 6 * pulse, 16 + 3 * pulse, 0, 0, TAU); cx.stroke();
  cx.restore();
}
/* over the bodies: a card bobbing above the chair, and the table's name */
function drawBjSeatSign() {
  const S = Game.saloon; if (!S) return;
  const me = localPlayer(), sat = S.bj && S.bj.sat;
  if (me && bjNearSeat(me)) return;           // the [ E ] prompt has it from here
  const bob = Math.sin(Game.time * 3) * 4, y = BJ_SEAT.y + 44 + bob;
  drawRuneCard(cx, "midas", BJ_SEAT.x, y, 18, Math.sin(Game.time * 1.7) * 0.12, DPR * ZOOM);
  if (!sat) {
    cx.save();
    cx.font = "bold 11px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.lineWidth = 4; cx.lineJoin = "round"; cx.strokeStyle = "#0b0b14"; cx.fillStyle = "#ffd23d";
    cx.globalAlpha = 0.75 + 0.25 * Math.sin(Game.time * 4);
    cx.strokeText("BLACKJACK", BJ_SEAT.x, BJ_SEAT.y + 72); cx.fillText("BLACKJACK", BJ_SEAT.x, BJ_SEAT.y + 72);
    cx.restore();
  }
}
