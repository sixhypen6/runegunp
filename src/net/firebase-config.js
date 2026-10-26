/* =========================================================
   RUNEGUN · Firebase config — co-op signaling only.
   The Realtime Database carries ONLY the WebRTC handshake for the
   join-code flow; once the peers connect, the room is deleted and
   all game traffic is phone-to-phone.

   SETUP (one time):
   1. console.firebase.google.com → Add project (no Analytics needed)
   2. Build → Realtime Database → Create database → locked mode
   3. Rules tab → paste the contents of firebase.rules.json (repo root)
   4. Project settings → Your apps → Web app (</>) → copy the config
      object over the placeholder below (these values are public
      identifiers, not secrets — shipping them in source is normal)
   ========================================================= */
"use strict";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDWN7DsOAoMU3wfD47Epx5UDUNGJ0-6Ebg",
  authDomain: "runegun-8b5b2.firebaseapp.com",
  databaseURL: "https://runegun-8b5b2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "runegun-8b5b2",
  storageBucket: "runegun-8b5b2.firebasestorage.app",
  messagingSenderId: "30857778312",
  appId: "1:30857778312:web:51190fd9b8ba60bbdcfb3d",
};
/* measurementId is deliberately omitted — no Analytics SDK is loaded, so it
   would be dead weight. storageBucket / messagingSenderId are unused too, but
   kept so this object still matches what the Firebase console shows you. */

/* true once a real config has been pasted in — the CO-OP button uses this
   to explain itself instead of failing on a dead endpoint */
function firebaseConfigured() {
  return FIREBASE_CONFIG.apiKey.indexOf("PASTE-") !== 0;
}
