/* =========================================================
   RUNEGUN · Continue — revive-on-death ("continue your run")
   On death the gate in overlays.js (gameOver) calls offerContinue();
   if a revive is available and affordable the player may sacrifice souls
   (current-run souls first, then the banked vault) to keep the SAME run
   going. Every revive is followed by an interstitial. The soul cost
   escalates per revive and the run is capped at MAX_CONTINUES. Declining
   runs the normal game-over flow.
   ========================================================= */
"use strict";

const CONTINUE_BASE_COST = 3000;   // first revive; the cost climbs per tier below
const MAX_CONTINUES = 2;           // hard cap of revives per run
const DEATH_INTERSTITIAL_AFTER = 1; // show an interstitial from the Nth accepted death onward — 1 = every death, the very first included
const LATE_AD_MS = 4000;            // an interstitial still loading when asked for may only appear within this window

/* Cost of the NEXT revive: 1500, then 3000, ... */
function continueCost() { return CONTINUE_BASE_COST * (Game.continuesUsed + 1); }
function continuesLeft() { return Game.continuesUsed < MAX_CONTINUES; }
/* Spendable souls = what's in hand this run plus the bank. */
function continueSoulsAvailable() { return Game.score + Meta.bank; }

/* Pay the cost: drain current-run souls first, then the bank for any shortfall. */
function payContinueSouls(cost) {
  const fromScore = Math.min(Game.score, cost);
  Game.score -= fromScore;
  const rest = cost - fromScore;
  if (rest > 0) { Meta.bank -= rest; metaSave(); }
  updateScore();
}

/* The ward you rise under. Longer than the 1.5s new-floor grant — you come back
   standing in whatever killed you. It is spent from the moment the player chooses to
   step back in, NOT from the moment the revive was paid for: the sim is frozen behind
   the resume screen, so a grant set here would otherwise be sitting there in full
   whether they took two seconds to read the floor or two minutes. */
const REVIVE_IFRAMES = 3;

/* Bring the player back: full heal, clear incoming fire, and shove nearby (non-boss)
   foes off so you don't instantly re-die. This does NOT drop the player straight back
   into the fight — it hands off to the resume screen, which is where the run actually
   restarts (see resumeRun). Paying for a revive and being killed in the half-second
   before you had reoriented was the worst way to lose a run. */
function revivePlayer() {
  Game.continuesUsed++;
  player.hp = player.maxHp;
  player.iframes = REVIVE_IFRAMES;            // re-armed on resume; set here so nothing lands in the gap
  player.shield = player.shieldMax;           // restore BULWARK charges if carried
  ebullets.length = 0;                        // the floor "exhales" the incoming volley
  for (const e of enemies) {
    if (e.boss || e.dead) continue;
    if (dist2(e.x, e.y, player.x, player.y) < 320 * 320) {
      const a = angTo(player.x, player.y, e.x, e.y);
      e.x += Math.cos(a) * 180;
      e.y += Math.sin(a) * 180;
      collideWorld(e);
    }
  }
  updateHp(); updateScore();
  renderResume();
  setState("resume");                         // the arena shows through — read it, then step in
}

function renderResume() {
  $("resumeStatLine").textContent =
    "VIGOUR RESTORED  ·  REVIVE " + Game.continuesUsed + " / " + MAX_CONTINUES +
    (continuesLeft() ? "" : "  ·  NO MORE REMAIN");
  $("resumeWardLine").textContent =
    "the volley is scattered and the dead are shoved back — and for " + REVIVE_IFRAMES +
    " SECONDS after you step in, nothing can touch you";
}

/* Step back into the run. The sim has been frozen since the revive, so this is where
   the ward is armed, the ring goes out and the clock starts again. */
function resumeRun() {
  if (Game.state !== "resume") return;
  player.iframes = Math.max(player.iframes, REVIVE_IFRAMES);
  shockwaves.push({ x: player.x, y: player.y, r: 6, max: 300, speed: 900,
    dmg: 0, hostile: false, hitSet: new Set() });   // harmless ring — pure feedback
  try { AudioFX.portal(); } catch (e) {}
  setState("play");
  toast("YOU RISE AGAIN");
}

/* Death gate entry point. Returns true if a continue was offered (overlay
   shown), false if none is available or affordable and the caller should run
   game-over. */
function offerContinue() {
  if (!player || !continuesLeft()) return false;
  const cost = continueCost();
  if (continueSoulsAvailable() < cost) return false;
  Ads.preload();                 // the interstitial after a revive / at the run's end must be armed
  renderContinue(cost);
  setState("continue");
  return true;
}

function renderContinue(cost) {
  $("btnContSoul").textContent = "SACRIFICE " + cost + " SOULS";
  $("contStatLine").textContent =
    "YOU HOLD " + continueSoulsAvailable() + " SOULS  ·  REVIVE " +
    (Game.continuesUsed + 1) + " / " + MAX_CONTINUES;
}

/* Every revive is paid for with souls AND an interstitial. The ad plays the moment
   SACRIFICE is tapped (it was preloaded when this overlay opened), and only once it
   has closed are the souls taken and the player raised onto the resume screen — so
   a crash or kill mid-ad costs nothing. If no ad can be had within REVIVE_AD_WAIT_MS
   (no fill, offline) the revive goes through anyway: a missing ad is our problem,
   not the player's. */
const REVIVE_AD_WAIT_MS = 5000;
let reviveAdPending = false;   // the revive's ad is loading/showing — the overlay waits for it
let reviveAdSince = 0;
let reviveAdToken = 0;         // which tap an ad outcome belongs to — a stale one must never revive

/* Last resort. playInterstitial() settles on timers in every phase, so the lock
   should always lift. But while it is set every exit from this overlay is shut, and
   being wrong costs a force-quit and a lost run — so once it outlives the longest
   watchdog, treat it as broken and let the player out. */
const REVIVE_AD_STUCK_MS = 100000;   // > ads.js SHOW_WATCHDOG_MS (90s), plus slack
function reviveAdBlocking() {
  return reviveAdPending && performance.now() - reviveAdSince < REVIVE_AD_STUCK_MS;
}

function acceptSoulContinue() {
  if (Game.state !== "continue" || reviveAdBlocking()) return;
  const cost = continueCost();
  if (continueSoulsAvailable() < cost) { toast("NOT ENOUGH SOULS"); return; }
  if (Game.devRun) { payContinueSouls(cost); revivePlayer(); return; }   // TEST TOOLS runs never show an ad
  reviveAdPending = true;
  reviveAdSince = performance.now();
  const token = ++reviveAdToken;
  if (!Ads.interstitialReady()) toast("LOADING…");   // preloaded → instant, so only say so if it isn't
  Ads.playInterstitial(REVIVE_AD_WAIT_MS)
    .catch(e => { noteCrash("continue.playInterstitial", e); return false; })
    .then(() => {
      if (token !== reviveAdToken || !reviveAdPending) return;   // superseded, or the stuck-lock escape let them out
      reviveAdPending = false;
      if (Game.state !== "continue") return;
      payContinueSouls(cost);
      revivePlayer();
    });
}

function declineContinue() {
  if (Game.state !== "continue" || reviveAdBlocking()) return;
  reviveAdPending = false;   // escaping a stuck lock — don't leave it set behind us
  doGameOver();
}

/* Play an interstitial over a screen the player leaves on their own (the SLAIN
   screen at the end of a run). The ad is normally armed and shows
   at once. One still loading may only appear while that screen is still up and
   within LATE_AD_MS — never over the descent chooser, the menu, or live play.
   No-op off the native Android shell. */
function showBreakAd(state) {
  if (Game.devRun) return;   // TEST TOOLS runs never show an interstitial
  const t0 = performance.now();
  Ads.showInterstitial(() => Game.state === state && !$("modeChoice").classList.contains("on") &&
                             performance.now() - t0 < LATE_AD_MS);
}

/* Called once per run that ends in death (from doGameOver). From the
   DEATH_INTERSTITIAL_AFTER-th accepted death onward (at 1: every death) a
   full-screen interstitial plays. The count is lifetime (persisted in Meta), so it
   does not reset between runs or app restarts. A death undone by a revive never
   gets here — the revive plays its own before it goes through (see acceptSoulContinue). */
function noteAcceptedDeath() {
  if (Game.devRun) return;
  Meta.deaths = (Meta.deaths | 0) + 1;
  metaSave();
  if (Meta.deaths < DEATH_INTERSTITIAL_AFTER) return;
  showBreakAd("dead");
}

/* The overlay markup is parsed before this script runs, so wire the buttons now. */
$("btnContSoul").addEventListener("click", acceptSoulContinue);
$("btnContDecline").addEventListener("click", declineContinue);
$("btnResumeRun").addEventListener("click", resumeRun);
