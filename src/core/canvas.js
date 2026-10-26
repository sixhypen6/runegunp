/* =========================================================
   RUNEGUN · Canvas & viewport
   The drawing surface and the world->screen zoom that keeps a constant slice of the arena on screen across devices.
   ========================================================= */
"use strict";


/* ---------- canvas ---------- */
const cv = document.getElementById("game");
const cx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1;
let ZOOM = 1, VW = 0, VH = 0;   // ZOOM = world->screen scale · VW/VH = arena slice visible (world units)
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  /* Android fires resize events that change nothing — IME show/hide, system-bar
     transitions, an ad activity covering and revealing the WebView — and setting
     cv.width below drops and reallocates a ~8–16MB GPU backing store each time.
     Reallocating during the memory pressure around an interstitial is a native-
     crash window, so a no-op resize must stay a true no-op. */
  if (W === window.innerWidth && H === window.innerHeight && DPR === dpr) return;
  DPR = dpr;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  cv.style.width = W + "px"; cv.style.height = H + "px";
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  /* keep a roughly constant chunk of the arena on screen no matter the device:
     phones (small min-dimension) zoom OUT so the action isn't in your face,
     big monitors zoom IN a touch so you're not lost in empty floor. */
  ZOOM = Math.max(0.68, Math.min(1.65, Math.min(W, H) / 690));
  VW = W / ZOOM; VH = H / ZOOM;
  /* keep any custom on-screen button layout pinned as the viewport changes
     (guarded: input.js defines this after canvas.js evaluates) */
  if (typeof applyControlLayout === "function") applyControlLayout();
  /* the souls counter just moved — soul motes cache its screen position (same guard:
     juice.js defines this after canvas.js evaluates) */
  if (typeof markHudDirty === "function") markHudDirty();
}
window.addEventListener("resize", resize); resize();


/* ---------- glow budget ----------
   Every neon halo in the game is a canvas `shadowBlur`, and each blurred draw costs Skia a
   scratch render target plus a blur pass. A busy arena runs hundreds of those per frame —
   the workload that has been seen to segfault the Adreno GL driver from inside the WebView's
   raster thread. That is a NATIVE crash: it kills the process outright, so crash.js never
   sees it and the frame loop's catch in main.js can do nothing about it.

   Rather than thread a multiplier through ~70 call sites, the game context's `shadowBlur`
   setter is wrapped once, here. Nothing in the codebase ever READS shadowBlur — only assigns
   it — so scaling on write is the whole story. `= 0` stays 0 whatever the scale, so every
   existing "glow off" line keeps working untouched.

   Deliberately scoped to the GAME canvas only. The glossary and Keeper portraits are one-off
   draws that cost nothing per frame, so their art stays exactly as authored at any setting. */
const GLOW_SCALE = { full: 1, half: 0.5, off: 0 };
let GLOW = 1;                     // default = the intended look; applyGlow() sets it from the save
function applyGlow() {
  /* Meta lives in save.js, which loads AFTER this file — only ever call this post-metaLoad(). */
  const s = GLOW_SCALE[typeof Meta !== "undefined" ? Meta.glow : "full"];
  GLOW = (typeof s === "number") ? s : 1;
}
(() => {
  const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "shadowBlur");
  if (!desc || !desc.set) return;          // exotic engine: leave every halo at its authored value
  Object.defineProperty(cx, "shadowBlur", {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v * GLOW); },
  });
})();
