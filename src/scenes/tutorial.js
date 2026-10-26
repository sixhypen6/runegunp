/* =========================================================
   RUNEGUN · Scene — first-time onboarding walkthrough
   A skippable, paged "how to play" shown once on the very first descent
   (right after the fall cutscene) and re-watchable from Settings.
   Same visual language as the intro cutscene: dark void, letterbox,
   spaced runic captions. Tap / click / any key advances a panel.
   ========================================================= */
"use strict";

/* =========================================================
   ONBOARDING WALKTHROUGH (skippable, replayable)
   ========================================================= */
const TUT = { t: 0, page: 0, pageT: 0, ret: "play", stars: [] };
let tutLastAdv = 0;   // debounce: swallow the synthetic mouse tap that trails a touch

function startTutorial(returnState) {
  TUT.t = 0; TUT.page = 0; TUT.pageT = 0;
  TUT.ret = returnState || "play";
  TUT.stars = [];
  for (let i = 0; i < 90; i++)
    TUT.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8 });
  document.body.classList.add("tut");
  setState("tutorial");
}

function tutorialAdvance() {
  if (Game.state !== "tutorial") return;
  const now = performance.now();
  if (now - tutLastAdv < 240) return;          // one tap = one page
  tutLastAdv = now;
  TUT.page++; TUT.pageT = 0;
  if (TUT.page >= TUT_PANELS.length) { endTutorial(); return; }
  AudioFX.unlock();
}

function tutorialSkip() { endTutorial(); }

function endTutorial() {
  if (Game.state !== "tutorial") return;
  Meta.seenTutorial = true; metaSave();
  document.body.classList.remove("tut");
  if (TUT.ret === "play") {                     // first-launch: shared play-entry tail (see cutscene.js)
    enterPlay();
  } else {
    setState(TUT.ret);
    if (TUT.ret === "menu") refreshMenu();
  }
}

/* the SKIP button and tap-to-advance (touch). The button lives in index.html
   and only shows while body.tut is set. */
$("btnTutSkip") && $("btnTutSkip").addEventListener("click", tutorialSkip);
window.addEventListener("touchstart", e => {
  if (Game.state !== "tutorial") return;
  if (e.target && e.target.closest && e.target.closest("#btnTutSkip")) return;  // let the button handle it
  tutorialAdvance();
}, { passive: true });

/* ---------- little diagram helpers (all self-contained canvas draws) ---------- */
const tutEase = p => p * p * (3 - 2 * p);                       // smoothstep

function tutText(txt, x, y, size, col, spaced) {
  cx.font = size + "px monospace"; cx.fillStyle = col;
  cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillText(spaced ? txt.split("").join(" ") : txt, x, y);
}
function tutStick(x, y, r, dx, dy) {                            // thumbstick ring + nub
  cx.strokeStyle = "rgba(157,107,255,0.55)"; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.stroke();
  cx.fillStyle = "rgba(157,107,255,0.55)";
  cx.beginPath(); cx.arc(x + dx * r * 0.5, y + dy * r * 0.5, r * 0.42, 0, TAU); cx.fill();
}
function tutBtn(x, y, r, label, col, pressed) {                 // round action button
  cx.beginPath(); cx.arc(x, y, r, 0, TAU);
  cx.fillStyle = pressed ? col : "rgba(20,18,38,0.7)"; cx.fill();
  cx.strokeStyle = col; cx.lineWidth = 2;
  if (pressed) { cx.shadowColor = col; cx.shadowBlur = 16; }
  cx.stroke(); cx.shadowBlur = 0;
  tutText(label, x, y, 9, pressed ? "#0a0a14" : col, false);
}
function tutDashCd(x, y, rr, cdFrac) {                         // dash cooldown ring (draw.js:893)
  cx.save();
  cx.globalAlpha = 0.25; cx.strokeStyle = "#5ee6ff"; cx.lineWidth = 3;   // dim full track
  cx.beginPath(); cx.arc(x, y, rr, 0, TAU); cx.stroke();
  cx.globalAlpha = 0.95; cx.lineCap = "round";                          // the filling arc, 12 o'clock clockwise
  if (cdFrac <= 0) { cx.shadowColor = "#5ee6ff"; cx.shadowBlur = 10; }  // full = dash is up
  cx.beginPath(); cx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + (1 - cdFrac) * TAU); cx.stroke();
  cx.lineCap = "butt"; cx.shadowBlur = 0;
  cx.restore();
}
function tutChest(x, y, k, crack) {                            // the in-game sealed loot cache (chest)
  const w = 36 * k, h = 26 * k;                                // same 36×26 body as draw.js chests
  cx.save(); cx.translate(x + (crack ? rnd(-2, 2) : 0), y);
  cx.fillStyle = crack ? "#4a3d78" : "#3a2f63";               // in-game sealed fill
  cx.shadowColor = crack ? "#ffd23d" : "#9d6bff"; cx.shadowBlur = crack ? 22 : 12;
  cx.fillRect(-w / 2, -h / 2, w, h);
  cx.shadowBlur = 0;
  cx.strokeStyle = crack ? "#ffd23d" : "#9d6bff"; cx.lineWidth = 2;   // wallGlow border
  cx.strokeRect(-w / 2, -h / 2, w, h);
  tutText("ᛝ", 0, 0, h * 0.6, crack ? "#ffd23d" : "#c9b8ff", false);  // the seal sigil
  cx.restore();
}
function tutRuneCard(x, y, w, h, rune, sel) {                   // a pick-one-of-three card
  cx.save();
  cx.beginPath(); cx.rect(x - w / 2, y - h / 2, w, h);
  cx.fillStyle = "rgba(16,14,30,0.9)"; cx.fill();
  cx.strokeStyle = rune ? rune.color : "#9d6bff"; cx.lineWidth = sel ? 3 : 1.5;
  if (sel) { cx.shadowColor = rune ? rune.color : "#9d6bff"; cx.shadowBlur = 18; }
  cx.stroke(); cx.shadowBlur = 0;
  tutText(rune ? rune.glyph : "ᚱ", x, y, h * 0.42, rune ? rune.color : "#c9b8ff", false);
  cx.restore();
}
/* miniature enemies — the same silhouettes drawn in draw.js (no eyes) */
function tutRevenant(x, y, r) {                                // chaser — red dart
  cx.save(); cx.translate(x, y); cx.fillStyle = "#ff4d5e";
  cx.beginPath(); cx.moveTo(r + 2, 0); cx.lineTo(-r, r * 0.8); cx.lineTo(-r * 0.4, 0); cx.lineTo(-r, -r * 0.8); cx.closePath(); cx.fill();
  cx.restore();
}
function tutBonecaster(x, y, r) { cx.fillStyle = "#ffd23d"; cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fill(); }  // gunner — gold circle
function tutBrute(x, y, r, hit) {                              // slammer — orange square (white on hit)
  cx.fillStyle = hit ? "#fff" : "#ff8a3d";
  if (hit) { cx.shadowColor = "#ff8a3d"; cx.shadowBlur = 16; }
  cx.fillRect(x - r, y - r, r * 2, r * 2);
  cx.shadowBlur = 0;
}
function tutGrandSeal(x, y, R, rot) {                          // THE GRAND SEAL, miniature (draw.js:337)
  cx.save(); cx.translate(x, y);
  cx.strokeStyle = "#9d6bff"; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.stroke();
  cx.lineWidth = 1.2; cx.beginPath(); cx.arc(0, 0, R * 0.72, 0, TAU); cx.stroke();
  cx.fillStyle = "#9d6bff"; cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.rotate(rot); cx.font = (R * 0.42) + "px monospace";
  for (let i = 0; i < 6; i++) { cx.rotate(TAU / 6); cx.fillText("ᛝᚦᛟᛉᚺᛞ"[i], 0, -R * 0.86); }
  cx.rotate(-rot); cx.font = (R * 0.72) + "px monospace"; cx.fillText("ᛝ", 0, 1);
  cx.restore();
}
function tutPortal(x, y, R, t) {                               // the way down — descent portal (draw.js:668)
  cx.save(); cx.translate(x, y);
  const cols = ["#9d6bff", "#5ee6ff", "#e8e2d0"];
  for (let k = 0; k < 3; k++) {
    cx.rotate(t * (1.2 + k * 0.5));
    cx.strokeStyle = cols[k]; cx.lineWidth = 2.5;
    cx.beginPath(); cx.arc(0, 0, R - k * 4, t, t + TAU * 0.7); cx.stroke();
  }
  cx.shadowColor = "#9d6bff"; cx.shadowBlur = 12; cx.fillStyle = "#0b0b14";
  cx.beginPath(); cx.arc(0, 0, R - 10, 0, TAU); cx.fill(); cx.shadowBlur = 0;
  cx.restore();
}

/* ---------- the panels: title + adaptive body copy + a small live demo ---------- */
const TUT_PANELS = [
  { /* 0 — premise */
    title: "INTO THE VOID",
    lines: () => ["YOU FELL PAST THE LAST LIVING STAR.", "CARVE YOUR WAY BACK TO THE LIGHT —", "HERE IS HOW YOU FIGHT."],
    demo: (lt, x, y) => {
      const glow = cx.createRadialGradient(x, y, 4, x, y, 90);
      glow.addColorStop(0, "rgba(157,107,255,0.28)"); glow.addColorStop(1, "rgba(157,107,255,0)");
      cx.fillStyle = glow; cx.beginPath(); cx.arc(x, y, 90, 0, TAU); cx.fill();
      cutDrawChar(x, y + Math.sin(lt * 2) * 6, Math.sin(lt * 1.3) * 0.08, 1.5, 1.5, skinColor(), 1, 1, Meta.char);
    },
  },
  { /* 1 — move */
    title: "MOVE",
    lines: t => t ? ["LEFT THUMB — DRAG ANYWHERE ON THE", "LEFT SIDE TO GLIDE THROUGH THE DARK."]
                  : Pad.active ? ["THE LEFT STICK", "GLIDES YOU THROUGH THE DARK."]
                  : [moveKeysText(), "TO GLIDE THROUGH THE DARK."],
    demo: (lt, x, y) => {
      const dir = Math.sin(lt * 1.5);                       // -1..1 sweep
      cutDrawChar(x + dir * 78, y, 0, dir >= 0 ? 1.25 : -1.25, 1.25, skinColor(), 1, 0.6, Meta.char);
      if (Input.touchMode) tutStick(x - 128, y + 60, 26, dir, 0.15 * Math.sin(lt * 3));
    },
  },
  { /* 2 — aim & fire */
    title: "AIM & FIRE",
    lines: t => t ? ["YOUR GUN FINDS THE NEAREST HORROR", "AND FIRES ITSELF. PREFER TWO STICKS?", "SWITCH IN SETTINGS."]
                  : Pad.active ? ["AIM WITH THE RIGHT STICK.", "YOUR GUN FIRES ON THE HELD " + bindLabel("fire") + " —", "OR AUTO-AIMS. SET IT IN SETTINGS."]
                  : ["AIM WITH THE CURSOR.", "YOUR GUN FIRES ON THE HELD " + (keyBinds("fire")[0] === "Mouse0" ? "MOUSE" : bindLabel("fire")) + " —", "OR AUTO-AIMS. SET IT IN SETTINGS."],
    demo: (lt, x, y) => {
      const sx = x - 92, ex = x + 96;
      let hot = false;
      for (let k = 0; k < 3; k++) {                          // three tracers in flight
        const f = ((lt * 1.8 + k / 3) % 1);
        const bx = sx + 22 + (ex - sx - 22) * f;
        if (f > 0.9) hot = true;
        cx.fillStyle = "#ffd23d"; cx.shadowColor = "#ff5e2e"; cx.shadowBlur = 8;
        cx.beginPath(); cx.arc(bx, y, 3.2, 0, TAU); cx.fill(); cx.shadowBlur = 0;
      }
      tutBrute(ex, y, 15, hot);
      cutDrawChar(sx, y, 0, 1.25, 1.25, skinColor(), 1, 1, Meta.char);
    },
  },
  { /* 3 — dash */
    title: "DASH",
    lines: t => t ? ["TAP DASH FOR A BURST — DODGE FIRE", "AND SLIP OVER LAVA. SHORT COOLDOWN."]
                  : ["PRESS " + bindLabel("dash") + " FOR A BURST — DODGE FIRE", "AND SLIP OVER LAVA. SHORT COOLDOWN."],
    demo: (lt, x, y) => {
      const L = x - 118, R = x + 118, cyc = lt % 2.0;      // wait · dash right · wait · dash left · repeat
      let px = L, dashing = false, right = true, p = 0;
      if (cyc < 0.6) { px = L; right = true; }                         // wait at the left, facing right
      else if (cyc < 1.0) { dashing = true; right = true; p = (cyc - 0.6) / 0.4; px = lerp(L, R, tutEase(clamp(p, 0, 1))); }
      else if (cyc < 1.6) { px = R; right = false; }                   // wait at the right, facing left
      else { dashing = true; right = false; p = (cyc - 1.6) / 0.4; px = lerp(R, L, tutEase(clamp(p, 0, 1))); }
      /* lava the ship phases over */
      cx.fillStyle = "rgba(255,94,46,0.28)"; cx.strokeStyle = "rgba(255,94,46,0.6)"; cx.lineWidth = 2;
      cx.beginPath(); cx.ellipse(x, y + 20, 62, 16, 0, 0, TAU); cx.fill(); cx.stroke();
      if (dashing) for (let k = 1; k <= 3; k++) {            // afterimages
        cutDrawChar(px + (right ? -1 : 1) * k * 18, y, 0, right ? 1.25 : -1.25, 1.25, skinColor(), 0.18 * (4 - k), 0.4, Meta.char);
      }
      cutDrawChar(px, y, 0, right ? 1.3 : -1.3, 1.3, skinColor(), 1, dashing ? 1.6 : 0.5, Meta.char);
      if (!dashing) {                                        // recharging after each dash: the ring fills, then reads "up"
        const wt = cyc < 0.6 ? cyc : cyc - 1.0;              // time since the last dash ended
        tutDashCd(px, y, 26, clamp(1 - wt / 0.45, 0, 1));
      }
      if (Input.touchMode) tutBtn(x + 120, y + 58, 20, "DASH", "#9d6bff", dashing);
    },
  },
  { /* 4 — seal / interact */
    title: "SEAL",
    lines: t => t ? ["PRESS SEAL TO BREAK CHEST SEALS, TAKE", "VITALITY, AND WAKE THE WARDEN BELOW.", "A BROKEN SEAL UNLEASHES A HORDE —", "CLEAR THEM ALL TO CLAIM THE RUNE INSIDE."]
                  : ["PRESS " + bindLabel("use") + " TO BREAK CHEST SEALS, TAKE", "VITALITY, AND WAKE THE WARDEN BELOW.", "A BROKEN SEAL UNLEASHES A HORDE —", "CLEAR THEM ALL TO CLAIM THE RUNE INSIDE."],
    demo: (lt, x, y) => {
      const cyc = lt % 2.2, crack = cyc > 1.4;
      tutChest(x, y, 1.6, crack);
      if (crack) {                                           // a rune rises from the broken seal
        const rp = (cyc - 1.4) / 0.8;
        cx.globalAlpha = 1 - rp;
        tutText("ᚨ", x, y - 24 - rp * 46, 26, "#ffd23d", false);
        cx.globalAlpha = 1;
      }
      if (Input.touchMode) tutBtn(x + 120, y + 58, 20, "SEAL", "#9d6bff", crack);
    },
  },
  { /* 5 — carve runes */
    title: "CARVE RUNES",
    lines: () => ["EACH BROKEN SEAL YIELDS A RUNE.", "CARVE ONE OF THREE — EACH DOES SOMETHING", "UNIQUE, SO PICK RUNES THAT COMPLEMENT.", "THEY STACK. AFTER FOUR, YOUR PATH SEALS."],
    demo: (lt, x, y) => {
      const R = (typeof RUNES === "object" && RUNES) ? Object.values(RUNES) : [];
      const picks = [R[0], R[2], R[5]];
      const sel = Math.floor(lt * 0.9) % 3;
      for (let i = 0; i < 3; i++) tutRuneCard(x + (i - 1) * 88, y, 66, 88, picks[i], i === sel);
    },
  },
  { /* 6 — the loop */
    title: "THE DESCENT",
    lines: () => ["SURVIVE THE WAVES · BREAK EVERY SEAL", "WAKE THE WARDEN · DESCEND.", "REACH THE LAST LIVING STAR — WALK OUT IF YOU CAN."],
    demo: (lt, x, y) => {
      const step = Math.floor(lt * 1.2) % 4, spread = 96;
      const cxs = [x - spread * 1.5, x - spread * 0.5, x + spread * 0.5, x + spread * 1.5];
      /* arrows between the beats */
      cx.strokeStyle = "rgba(201,184,255,0.35)"; cx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { cx.beginPath(); cx.moveTo(cxs[i] + 28, y); cx.lineTo(cxs[i + 1] - 28, y); cx.stroke(); }
      const on = i => (i === step ? 1 : 0.4);
      /* the waves — a revenant, a bonecaster and a brute */
      cx.globalAlpha = on(0);
      tutRevenant(cxs[0] - 9, y - 6, 6);
      tutBonecaster(cxs[0] + 9, y - 6, 5.5);
      tutBrute(cxs[0], y + 8, 5.5);
      /* break every seal */
      cx.globalAlpha = on(1); tutChest(cxs[1], y, 0.85, false);
      /* wake the warden at the Grand Seal */
      cx.globalAlpha = on(2); tutGrandSeal(cxs[2], y, 17, lt * 0.5);
      /* descend through the way down */
      cx.globalAlpha = on(3); tutPortal(cxs[3], y, 17, lt);
      cx.globalAlpha = 1;
    },
  },
];

/* =========================================================
   FRAME
   ========================================================= */
function tutorialFrame(dt) {
  TUT.t += dt; TUT.pageT += dt;
  const panel = TUT_PANELS[TUT.page]; if (!panel) { endTutorial(); return; }
  const touch = Input.touchMode;

  /* ---- background: the void ---- */
  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#03020a"); grad.addColorStop(0.5, "#070512"); grad.addColorStop(1, "#03020a");
  cx.fillStyle = grad; cx.fillRect(0, 0, W, H);
  for (const st of TUT.stars) {                              // slow drifting starfield
    st.x -= (10 + st.z * 26) * dt; if (st.x < -4) { st.x = W + 4; st.y = Math.random() * H; }
    cx.fillStyle = "rgba(220,215,255," + (0.15 + st.z * 0.35) + ")";
    cx.beginPath(); cx.arc(st.x, st.y, st.z * 1.4, 0, TAU); cx.fill();
  }

  /* ---- the demo ---- */
  const demoCX = W / 2, demoCY = H * 0.34;
  cx.save(); panel.demo(TUT.pageT, demoCX, demoCY); cx.restore();

  /* ---- letterbox ---- */
  const bar = H * 0.085 * clamp(TUT.t / 0.4, 0, 1);
  cx.fillStyle = "#000"; cx.fillRect(0, 0, W, bar); cx.fillRect(0, H - bar, W, bar);

  /* ---- title + body copy ---- */
  const enter = clamp(TUT.pageT / 0.35, 0, 1);               // fade each panel's text in
  cx.globalAlpha = enter;
  tutText(panel.title, W / 2, H * 0.60, 20, "#ffd23d", true);
  const lines = panel.lines(touch);
  lines.forEach((ln, i) => tutText(ln, W / 2, H * 0.685 + i * H * 0.045, 12, "rgba(232,228,216,0.95)", false));
  cx.globalAlpha = 1;

  /* ---- progress dots ---- */
  const n = TUT_PANELS.length, gap = 16, dy = H * 0.85, dx0 = W / 2 - (n - 1) * gap / 2;
  for (let i = 0; i < n; i++) {
    cx.beginPath(); cx.arc(dx0 + i * gap, dy, 3.2, 0, TAU);
    cx.fillStyle = i <= TUT.page ? "#ffd23d" : "rgba(150,145,165,0.5)"; cx.fill();
  }

  /* ---- continue hint ---- */
  const last = TUT.page === n - 1;
  const verb = last ? "BEGIN" : "CONTINUE";
  const hint = (touch ? "TAP TO " + verb : "PRESS ANY KEY TO " + verb) + "  ▸";
  cx.textAlign = "center";
  cx.fillStyle = "rgba(180,175,195," + (0.55 + Math.sin(TUT.t * 4) * 0.25) + ")";
  cx.font = "10px monospace";
  cx.fillText(hint, W / 2, H - bar - 16);
  cx.textAlign = "left";
}
