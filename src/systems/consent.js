/* =========================================================
   RUNEGUN · Ad consent (Google UMP / GDPR)
   Loads BEFORE ads.js — Ads.init() awaits gather() before it will touch the
   AdMob SDK.

   WHY THIS EXISTS: serving ads to a player in the EEA/UK means reading their
   advertising ID, which needs their consent first. Google requires a certified
   CMP (Consent Management Platform) for that traffic — without one they simply
   stop serving ads there. UMP is Google's own free CMP and ships inside the
   AdMob SDK we already bundle (com.google.android.ump:user-messaging-platform,
   pulled in by @capacitor-community/admob), so there is nothing extra to install.

   THE FLOW (Google's documented order):
     requestConsentInfo()  → what does this user need?
     showConsentForm()     → ask them, but only if REQUIRED and a form exists
     canRequestAds         → the SDK's verdict; ONLY initialize AdMob if true

   Outside the EEA/UK, status comes back NOT_REQUIRED and canRequestAds is true,
   so no form is ever shown and nothing changes for those players.

   IMPORTANT — this code is only half of compliance. The form itself is authored
   in the AdMob console (Privacy & messaging → GDPR). Until a message is
   published there, isConsentFormAvailable is false, no form can be shown, and
   EEA players get no ads. See README-ADS.md.
   ========================================================= */
"use strict";

const Consent = (() => {
  /* The consent API lives on the same AdMob plugin object as the ad calls. */
  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  }

  /* Set a debug geography here to test the EEA flow from a non-EEA device.
     `testDeviceIdentifiers` must contain the ID logcat prints on first run
     ("Use RequestConfiguration.Builder.setTestDeviceIds(...)"). Leave this null
     for real builds — a shipped debugGeography would fake every player's region.
     Example:
       const DEBUG = { debugGeography: 1, testDeviceIdentifiers: ["33BE2250B43518CCDA7DE426D04EE231"] };
     (1 = EEA, 3 = regulated US state, 0 = disabled — see the plugin's
      AdmobConsentDebugGeography enum.) */
  const DEBUG = null;

  let info = null;        // last AdmobConsentInfo we saw
  let done = false;       // gather() has run to completion (success or not)

  /* The SDK's own verdict on whether ads may be requested at all. It accounts for
     region, the player's answer, and consent cached from previous launches. */
  function canRequestAds() { return !!(info && info.canRequestAds); }
  function status() { return (info && info.status) || "UNKNOWN"; }

  /* EEA players must be able to CHANGE their mind later, so Google requires a
     persistent entry point when this is REQUIRED. overlays.js shows the settings
     button on the strength of this. */
  function privacyOptionsRequired() {
    return !!(info && info.privacyOptionsRequirementStatus === "REQUIRED");
  }

  /* Ask, and show the form if this player needs to answer. Resolves to whether
     ads may be requested. Never rejects — ads.js gates its whole init on this,
     so a throw here would silently disable monetization. */
  async function gather() {
    if (done) return canRequestAds();
    const p = plugin();
    /* Off the native shell (web / itch / Electron) there is no ad SDK to consent
       to, and no ads are ever shown — so there is nothing to ask about. */
    if (!p || typeof p.requestConsentInfo !== "function") { done = true; return false; }

    try {
      info = await p.requestConsentInfo(DEBUG || { tagForUnderAgeOfConsent: false });
      /* Only interrupt the player when they genuinely have to answer. Outside the
         EEA/UK this is NOT_REQUIRED and we fall straight through. */
      if (info && info.status === "REQUIRED" && info.isConsentFormAvailable) {
        info = await p.showConsentForm();
      }
    } catch (e) {
      /* Fail CLOSED: if we could not establish consent we do not request ads.
         This costs a session of ad revenue on a transient network error, which is
         the right side of the trade — the other way round risks serving ads to an
         EEA player who never consented. The next launch retries. */
      noteCrash("consent.gather", e);
      info = null;
    }
    done = true;
    return canRequestAds();
  }

  /* Re-open the form so a player can withdraw or change consent. Wired to the
     settings button. Re-reads status afterwards so privacyOptionsRequired() and
     canRequestAds reflect the new answer; UMP stores the new consent signal,
     which the ad SDK applies to every later request. */
  async function showPrivacyOptions() {
    const p = plugin();
    if (!p || typeof p.showPrivacyOptionsForm !== "function") return;
    try {
      await p.showPrivacyOptionsForm();
      info = await p.requestConsentInfo(DEBUG || { tagForUnderAgeOfConsent: false });
    } catch (e) { noteCrash("consent.showPrivacyOptions", e); }
  }

  return { gather, canRequestAds, privacyOptionsRequired, showPrivacyOptions, status };
})();
