/* =========================================================
   RUNEGUN · Native shell integration (Capacitor + desktop)
   Wires the Android hardware/gesture back button to in-game navigation,
   shows the desktop build's QUIT TO DESKTOP button, and guarantees the
   audio context unlocks on the first user gesture.
   All of this is a no-op in a plain browser — the back button only runs
   inside the Capacitor build (window.Capacitor.Plugins present), the quit
   button only inside the Electron build (window.RunegunDesktop present).
   ========================================================= */
"use strict";

(() => {
  /* ---------- audio unlock (belt-and-suspenders) ----------
     Mobile WebViews start the AudioContext suspended; it can only be
     resumed from inside a user-gesture handler. The input listeners
     already call AudioFX.unlock(), but register a one-time global
     fallback so the very first tap/key anywhere lifts the lock. */
  const unlock = () => { try { AudioFX.unlock(); } catch (e) {} };
  const once = { once: true, passive: true };
  for (const ev of ["touchstart", "mousedown", "keydown"]) {
    window.addEventListener(ev, unlock, once);
  }

  /* ---------- desktop: quit to desktop ----------
     desktop/preload.js exposes window.RunegunDesktop only inside the Electron
     build. A browser tab can't close itself and Android leaves via its back
     button, so everywhere else the button stays hidden. The button lives on the
     main menu only — mid-run, ABANDON banks the souls first, then quit from here. */
  const Desktop = window.RunegunDesktop;
  const quitBtn = $("btnQuitDesktop");
  if (Desktop && typeof Desktop.quit === "function" && quitBtn) {
    quitBtn.style.display = "";
    quitBtn.addEventListener("click", () => {
      try { metaSave(); } catch (e) {}   // already saved on every change — belt-and-braces
      Desktop.quit();
    });
  }

  /* ---------- desktop: fullscreen / windowed ----------
     The shell owns the mode — it has to open the window in it before this page
     exists — and remembers it, with the window's size and position, between
     launches. F11 / Alt+Enter flip it too, so the label follows the shell's
     fullscreen events rather than this button's own clicks. */
  const dispRow = $("displayRow"), dispBtn = $("btnDisplayMode");
  if (Desktop && typeof Desktop.setFullscreen === "function" && dispRow && dispBtn) {
    let full = true;
    const show = on => { full = on; dispBtn.textContent = on ? "DISPLAY: FULLSCREEN" : "DISPLAY: WINDOWED"; };
    dispRow.style.display = "flex";   // not "": .aim-mode-row is display:none outside body.touch
    dispBtn.addEventListener("click", () => Desktop.setFullscreen(!full));
    Desktop.onFullscreen(show);
    Desktop.isFullscreen().then(show, () => {});
  }

  /* ---------- Android back button ---------- */
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!App || !App.addListener) return;   // not running in the native shell

  /* ---------- foreground / background ----------
     The WebView keeps the AudioContext running when the app leaves the
     foreground, so scheduled sound tails bleed over ads and the home screen and
     the audio render thread drains battery in the background. visibilitychange
     (input.js) covers most cases, but Capacitor's appStateChange is the reliable
     signal on Android — notably when an AdMob ad activity covers the WebView. */
  App.addListener("appStateChange", ({ isActive }) => {
    try {
      if (isActive) AudioFX.resume();
      else {
        AudioFX.suspend();
        /* the same lost-focus rule as a background tab (ui/overlays.js) */
        if (typeof pauseForFocusLoss === "function") pauseForFocusLoss();
      }
    } catch (e) {}
  });

  App.addListener("backButton", () => {
    /* Back means exactly what Escape means (uiBack): close the topmost panel,
       else step back one screen. The one thing it adds is the root: on the main
       menu with nothing open, back leaves the app. */
    if (Game.state === "menu" &&
        !$("settings").classList.contains("on") &&
        !$("controls").classList.contains("on") &&
        !$("ctrlEdit").classList.contains("on") &&
        !$("transfer").classList.contains("on") &&
        !$("chat").classList.contains("on") &&
        !$("descentChoice").classList.contains("on") &&
        !$("modeChoice").classList.contains("on") &&
        !$("challengeChoice").classList.contains("on")) {
      App.exitApp();
      return;
    }
    uiBack();
  });
})();
