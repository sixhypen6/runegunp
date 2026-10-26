/* =========================================================
   RUNEGUN · Ads — AdMob wrapper (interstitial, via Capacitor)
   A thin, defensive shim over @capacitor-community/admob. A complete
   no-op anywhere window.Capacitor.Plugins.AdMob is absent (plain web,
   itch.io, Steam/Electron), so the same source builds for every target.

   One placement: a full-screen interstitial at every run-ending death and
   after every soul-bought revive (see continue.js). Ads are PRELOADED so
   they show the instant they are asked for: init(), each run start, each
   death, and the end of every show re-arm the next one.
   ========================================================= */
"use strict";

const Ads = (() => {
  /* ONE switch for the whole ad setup.
     true  → Google's universal TEST unit (always fills test ads, even while your
             AdMob app is "Requires review") + isTesting on.
     false → your real AdMob unit (only serves once the app is approved & live) +
             isTesting off.

     Set true for development and the Play "closed testing" track; false for the
     public release build. Getting this wrong is silent and expensive — test units
     earn $0 — so `npm run build:release` ASSERTS this is false and aborts the
     build if it is not. `npm run build:web` prints whichever mode it shipped.
     See the release checklist in README.md. */
  const TESTING = true; //hi chat xhunter here im gonna leave this on true bc i cant even earn stuff bc idk how to publish it on google play and dont have a credit card also whenever copilot suggests text it yaps alot so i need to stop now

  /* Google's public TEST unit — always available, bypasses account/app review. */
  const TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
  /* Your real AdMob unit — used only when TESTING is false. */
  const LIVE_INTERSTITIAL = "ca-app-pub-1455355390395459/9991717260";

  const INTERSTITIAL_UNIT = TESTING ? TEST_INTERSTITIAL : LIVE_INTERSTITIAL;

  const IN_FAILSHOW   = "interstitialAdFailedToShow";
  const IN_DISMISSED  = "interstitialAdDismissed";

  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  }

  let showing = false;

  /* Interstitial state. Every run-ending death and every soul revive shows one, so
     the next is always loaded well ahead. Readiness is the TIME the armed ad loaded,
     not a flag: Google expires a loaded ad after an hour and its show then fails
     silently, so anything older than IN_MAX_AGE_MS counts as unarmed and is replaced. */
  const IN_MAX_AGE_MS = 50 * 60 * 1000;
  const IN_RETRY_MS = [30000, 60000, 120000, 240000];   // backoff after a failed load (no fill, offline), then wait for the next preload()
  let inLoadedAt = 0;        // Date.now() when the armed ad finished loading; 0 = none armed
  let inLoad = null;         // the in-flight load — shared, so callers never fire a second request
  let inRetries = 0, inRetryTimer = null;

  /* playInterstitial() waits for the ad to be GONE, but the plugin's show() resolves
     the moment the ad starts — the close only arrives as an event. This is the
     hook those events settle. The backstop covers an ad activity killed without
     reporting back: longer than any creative, so it only fires when truly lost. */
  const SHOW_WATCHDOG_MS = 90000;
  let closeWaiter = null;

  function isShowing() { return showing; }

  async function addL(AdMob, ev, fn) {
    try { return await AdMob.addListener(ev, fn); } catch (e) { return null; }
  }

  let initOk = false;        // the SDK is up and ads may be requested
  let initInFlight = null;   // in-flight init() promise — collapses concurrent calls

  /* initialize() returns a PROMISE — it rejects (no Play Services, no network, a
     consent failure) rather than throwing, so a synchronous try/catch around it
     caught nothing and its fallback was dead code. Await it, remember whether it
     actually came up, and only preload once it has: firing preload() against an
     uninitialized SDK just fails silently.

     RETRYABLE ON PURPOSE. This used to latch a `initStarted` flag before consent
     was known, so a player who declined at launch and then granted consent from
     the settings privacy-options button got no ads until they restarted the app.
     Now only SUCCESS is sticky (initOk): a consent refusal or an SDK error leaves
     init() callable again, and overlays.js re-runs it after the privacy form. */
  async function init() {
    const AdMob = plugin();
    if (!AdMob || initOk) return;
    if (initInFlight) return initInFlight;   // never double-initialize
    initInFlight = (async () => {
      /* Consent BEFORE the SDK, per Google's documented order: initializing AdMob
         is what starts reading the advertising ID, so it must not happen until UMP
         says this player may be served ads. Outside the EEA/UK this resolves true
         immediately with no form shown. If it resolves false we return without
         initializing — initOk stays false, and nothing is ever requested or shown. */
      if (!(await Consent.gather())) return;
      try {
        await AdMob.initialize({ initializeForTesting: TESTING });
        initOk = true;
      } catch (e) {
        noteCrash("ads.init", e);
        initOk = false;
        return;   // no listeners, no preload — every later call no-ops on !initOk
      }
      registerListeners(AdMob);
      preload();
    })();
    try { await initInFlight; } finally { initInFlight = null; }
  }

  /* Registered exactly once, on the single successful init — initOk gates re-entry
     and initInFlight collapses concurrent calls, so these cannot stack up. */
  function registerListeners(AdMob) {
    /* Re-arm once the shown ad is gone (Google's recommended point to load the next).
       The load/fail outcome itself is read from prepareInterstitial()'s promise. */
    addL(AdMob, IN_DISMISSED, () => { showing = false; if (closeWaiter) closeWaiter(true); prepareInterstitial(); });
    addL(AdMob, IN_FAILSHOW, () => { showing = false; if (closeWaiter) closeWaiter(false); prepareInterstitial(); });
  }

  function interstitialArmed() { return inLoadedAt > 0 && Date.now() - inLoadedAt < IN_MAX_AGE_MS; }

  /* Load an interstitial unless a fresh one is already armed. Resolves true once one
     is armed, false if it would not load; never rejects. A failure schedules a
     bounded backoff retry, so a no-fill at run start does not leave the next death
     without an ad. The plugin call sits inside a .then so even a synchronous throw
     lands after inLoad is assigned — the .finally can never clear it early. */
  function prepareInterstitial() {
    const AdMob = plugin();
    if (!AdMob || !initOk) return Promise.resolve(false);
    if (interstitialArmed()) return Promise.resolve(true);
    if (inLoad) return inLoad;
    inLoadedAt = 0;   // whatever was armed has expired — never show it
    inLoad = Promise.resolve()
      .then(() => AdMob.prepareInterstitial({ adId: INTERSTITIAL_UNIT, isTesting: TESTING, immersiveMode: true }))
      .then(() => { inLoadedAt = Date.now(); inRetries = 0; return true; },
            () => { retryInterstitial(); return false; })
      .finally(() => { inLoad = null; });
    return inLoad;
  }

  function retryInterstitial() {
    if (inRetryTimer || inRetries >= IN_RETRY_MS.length) return;
    inRetryTimer = setTimeout(() => { inRetryTimer = null; prepareInterstitial(); }, IN_RETRY_MS[inRetries++]);
  }

  /* Pre-load the interstitial. Idempotent; no-op off the native shell or when already
     armed. Also a no-op until init() has succeeded: init() waits on the consent verdict,
     and nothing may be requested before it — an ad preloaded at run start would
     otherwise go out for a player whose consent was never established. */
  function preload() {
    if (!initOk) return;
    prepareInterstitial();
  }

  /* Show one interstitial. Fire-and-forget; resolves true if it showed.
     Normally one is already armed and shows at once. If not, one is requested now,
     but shown only if it arrives while stillWanted() holds: a load that lands after
     the player has moved on must never pop up over gameplay (Google counts that as
     an unexpected interstitial). It then stays armed for the next one instead.
     The Dismissed / FailedToShow listeners re-arm the next one. */
  function showInterstitial(stillWanted) {
    const AdMob = plugin();
    if (!AdMob || !initOk) return Promise.resolve(false);
    return (async () => {
      try {
        if (!interstitialArmed()) {
          if (!(await prepareInterstitial())) return false;
          if (stillWanted && !stillWanted()) return false;
        }
        inLoadedAt = 0;   // consumed — an ad shows once per load
        showing = true;
        await AdMob.showInterstitial();
        return true;
      } catch (e) { showing = false; prepareInterstitial(); return false; }
    })();
  }

  function interstitialReady() { return !!plugin() && initOk && interstitialArmed(); }

  /* Play one interstitial and resolve only once it has CLOSED, so the caller can hold
     its screen until the ad is over (the soul revive waits on this). Resolves true if
     an ad was shown, false if none could be (not armed and no load within maxWaitMs,
     no SDK, failed to show). Never rejects, and always settles: the load wait and the
     show backstop are both on timers — continue.js locks its overlay until this does. */
  function playInterstitial(maxWaitMs) {
    const AdMob = plugin();
    if (!AdMob || !initOk || closeWaiter) return Promise.resolve(false);
    return new Promise(resolve => {
      let done = false, timer = null;
      const finish = shown => {
        if (done) return;
        done = true; clearTimeout(timer); closeWaiter = null;
        resolve(shown);
      };
      timer = setTimeout(() => finish(false), maxWaitMs);   // nothing armed and it won't load in time
      (async () => {
        try {
          if (!interstitialArmed() && !(await prepareInterstitial())) { finish(false); return; }
          if (done) return;   // loaded after the deadline — it stays armed for the next one
          clearTimeout(timer);
          timer = setTimeout(() => finish(true), SHOW_WATCHDOG_MS);
          closeWaiter = finish;
          inLoadedAt = 0;     // consumed — an ad shows once per load
          showing = true;
          await AdMob.showInterstitial();
        } catch (e) { showing = false; finish(false); prepareInterstitial(); }
      })();
    });
  }

  return { init, preload, isShowing, interstitialReady, showInterstitial, playInterstitial };
})();

/* Initialize the SDK and pre-load the first ad at startup (no-op off the native shell). */
Ads.init();
