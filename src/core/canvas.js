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
let BASE_ZOOM = 1;              // the device's neutral zoom; the warden may widen it (SNIPER's scope)
/* SNIPER sees more of the floor: widen the view without touching the base scale,
   so every device still gets its own sensible slice and a normal warden snaps back. */
function applyViewZoom() {
  const sniper = _viewInRun && _viewChar === "sniper" && typeof SNIPER_ZOOM === "number";
  ZOOM = BASE_ZOOM * (sniper ? SNIPER_ZOOM : 1);
  VW = W / ZOOM; VH = H / ZOOM;
  if (typeof applyControlLayout === "function") applyControlLayout();
  if (typeof markHudDirty === "function") markHudDirty();
}
/* Track the local warden once per frame. Changing ZOOM/VW/VH reflows the DOM and
   invalidates cached screen positions, so only do it when the warden really changes. */
let _viewChar = null, _viewInRun = false;
function syncWardenView() {
  const p = (typeof localPlayer === "function") ? localPlayer() : null;
  const c = p ? p.char : null;
  const inRun = !!p && Game.state !== "menu" && Game.state !== "vault" && Game.state !== "glossary" &&
                Game.state !== "leaderboard" && Game.state !== "lobby";
  const sniper = inRun && c === "sniper";
  if (c === _viewChar && inRun === _viewInRun && sniper === document.body.classList.contains("sniper")) return;
  _viewChar = c; _viewInRun = inRun;
  document.body.classList.toggle("sniper", sniper);
  applyViewZoom();
}
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
  BASE_ZOOM = Math.max(0.68, Math.min(1.65, Math.min(W, H) / 690));
  applyViewZoom();
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
