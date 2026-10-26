/* =========================================================
   RUNEGUN · Scene — The Unchaining
   Plays once, when the player takes the first portal after breaking the Chained Warden.
   The player frees the Vault Keeper — a coffer bound in the Warden's chains — which unseals
   THE VAULT on the main menu forever after. Skippable; same visual language as the intro
   cutscene (dark void, letterbox, spaced runic captions, tap/press to advance).
   The Keeper figure itself is drawVaultKeeper() (src/ui/overlays.js).
   ========================================================= */
"use strict";

/* phases: "bound" (waiting for the player to break the chains) → "breaking" (scripted snap)
   → "freed" (waiting to descend, auto-continues after a beat). */
const VCUT = { t: 0, phase: "bound", brk: 0, eye: 0, preview: false, stars: [] };
let vcutLastTap = 0;

function startVaultCutscene(preview) {
  VCUT.t = 0; VCUT.phase = "bound"; VCUT.brk = 0; VCUT.eye = 0;
  VCUT.preview = !!preview;   // DEBUG: menu preview — return to menu instead of resuming a run
  VCUT.stars = [];
  for (let i = 0; i < 90; i++)
    VCUT.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8 });
  AudioFX.bossRoar();
  setState("vaultcut");
}

/* finish (natural end or full skip) — the Keeper is freed, then resume the deferred descent */
function endVaultCutscene() {
  if (Game.state !== "vaultcut") return;
  if (VCUT.preview) { setState("menu"); refreshMenu(); return; }   // DEBUG preview: nothing to resume
  Meta.unlocked["npc:keeper"] = true; metaSave();   // freed → the Vault is unsealed on the menu
  nextFloor();                                       // guard now passes → performs the real advance
  setState("play");
}

function vaultCutsceneTap() {
  if (Game.state !== "vaultcut") return;
  const now = performance.now();
  if (now - vcutLastTap < 240) return;               // swallow the synthetic mouse tap after a touch
  vcutLastTap = now;
  if (VCUT.phase === "bound") { VCUT.phase = "breaking"; VCUT.t = 0; AudioFX.portal(); return; }
  if (VCUT.phase === "freed") { endVaultCutscene(); return; }
  /* during "breaking" a tap is ignored — let the snap play out */
}
window.addEventListener("touchstart", () => { if (Game.state === "vaultcut") vaultCutsceneTap(); }, { passive: true });

function vaultCutsceneFrame(dt) {
  VCUT.t += dt;
  const t = VCUT.t;

  /* advance the scripted break */
  if (VCUT.phase === "breaking") {
    VCUT.brk = clamp(t / 1.1, 0, 1);
    VCUT.eye = clamp((t - 0.3) / 0.9, 0, 1);
    if (t >= 1.3) { VCUT.phase = "freed"; VCUT.t = 0; }
  } else if (VCUT.phase === "freed") {
    VCUT.eye = 1;
    if (t >= 3.6) { endVaultCutscene(); return; }    // auto-descend after a beat (no soft-lock)
  }

  /* ---- background: the void ---- */
  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#04030c"); grad.addColorStop(0.5, "#080615"); grad.addColorStop(1, "#04030c");
  cx.fillStyle = grad; cx.fillRect(0, 0, W, H);
  for (const st of VCUT.stars) {
    st.x -= (8 + st.z * 22) * dt; if (st.x < -4) { st.x = W + 4; st.y = Math.random() * H; }
    cx.fillStyle = "rgba(220,215,255," + (0.12 + st.z * 0.3) + ")";
    cx.beginPath(); cx.arc(st.x, st.y, st.z * 1.3, 0, TAU); cx.fill();
  }

  const cxm = W / 2, cym = H * 0.46;
  /* the Grand Seal glows behind the pair (reuse the tutorial helper) */
  if (typeof tutGrandSeal === "function") tutGrandSeal(cxm + 40, cym + 6, Math.min(W, H) * 0.12, t * 0.3);

  /* a shockwave ring at the instant the chains snap */
  if (VCUT.phase !== "bound") {
    const wr = VCUT.brk;
    cx.globalAlpha = (1 - wr) * 0.6;
    cx.strokeStyle = "#ffd23d"; cx.lineWidth = 3; cx.shadowColor = "#ffd23d"; cx.shadowBlur = 16;
    cx.beginPath(); cx.arc(cxm + 74, cym, 18 + wr * 130, 0, TAU); cx.stroke();
    cx.shadowBlur = 0; cx.globalAlpha = 1;
  }

  /* the Keeper — chained coffer on the right, bobbing more once freed */
  cx.save();
  cx.translate(cxm + 74, cym + Math.sin(t * 1.5) * (VCUT.phase === "freed" ? 5 : 2));
  cx.scale(1.7, 1.7);
  drawVaultKeeper(cx, { chained: true, brk: VCUT.brk, eye: VCUT.eye, t });
  cx.restore();

  /* the player — facing the Keeper, muzzle flaring as the chains break */
  cutDrawChar(cxm - 96, cym + Math.sin(t * 1.1) * 6, 0, 1.5, 1.5, skinColor(), 1,
              VCUT.phase === "breaking" ? 1.4 : 0.5, Meta.char);

  /* ---- letterbox ---- */
  const bar = H * 0.085 * (VCUT.phase === "bound" ? clamp(t / 0.4, 0, 1) : 1);
  cx.fillStyle = "#000"; cx.fillRect(0, 0, W, bar); cx.fillRect(0, H - bar, W, bar);

  /* ---- caption (per phase, fades in) ---- */
  cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = "13px monospace";
  const cap = VCUT.phase === "bound"    ? "SOMETHING LIES CHAINED BENEATH THE GRAND SEAL"
            : VCUT.phase === "breaking" ? "YOU BREAK THE WARDEN'S CHAINS"
            :                             "THE VAULT KEEPER IS FREED — HIS HOARD IS OPEN FOR TRADE";
  cx.fillStyle = "rgba(232,228,216," + clamp(t / 0.4, 0, 1) + ")";
  cx.fillText(cap.split("").join(" "), W / 2, H - bar - 30);

  /* ---- action / continue hint ---- */
  const touch = Input.touchMode;
  let hint = "";
  if (VCUT.phase === "bound") hint = (touch ? "TAP TO BREAK THE CHAINS" : anyKeyText() + " TO BREAK THE CHAINS") + "  ▸";
  else if (VCUT.phase === "freed") hint = (touch ? "TAP TO DESCEND" : anyKeyText() + " TO DESCEND") + "  ▸";
  if (hint) {
    cx.font = "10px monospace"; cx.textAlign = "right";
    cx.fillStyle = "rgba(180,175,195," + (0.55 + Math.sin(t * 4) * 0.25) + ")";
    cx.fillText(hint, W - 18, H - bar - 14);
    cx.textAlign = "left";
  }
}
