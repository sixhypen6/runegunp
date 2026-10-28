/* =========================================================
   RUNEGUN · Firebase config — co-op signaling only.
   The Realtime Database carries ONLY the WebRTC handshake for the
   join-code flow; once the peers connect, the room is deleted and
   all game traffic is phone-to-phone.

   SETUP (project `runegunp`):
   1. Build → Realtime Database → Rules → paste firebase.rules.json (repo root).
      That file is the complete tree: the co-op `rooms` block and the
      leaderboard `scores` block. Nothing else in the database is used.
   2. Build → Authentication → Sign-in method → Anonymous → Enable.
      Without it sign-in fails with CONFIGURATION_NOT_FOUND and the
      LEADERBOARDS button simply never appears (everything else works).
   3. The config below is already live for `runegunp`. These values are public
      identifiers, not secrets — shipping them in source is normal.
   ========================================================= */
"use strict";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAYNwA6RzUEbfyCWqbT3P27ti705QGfL2c",
  authDomain: "runegunp.firebaseapp.com",
  databaseURL: "https://runegunp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "runegunp",
  storageBucket: "runegunp.firebasestorage.app",
  messagingSenderId: "867814511521",
  appId: "1:867814511521:web:fd00305baa3dce103ef1e0",
};
/* measurementId is deliberately omitted — no Analytics SDK is loaded, so it
   would be dead weight. storageBucket / messagingSenderId are unused too, but
   kept so this object still matches what the Firebase console shows you. */

/* true once a real config has been pasted in — the CO-OP button uses this
   to explain itself instead of failing on a dead endpoint */
function firebaseConfigured() {
  return FIREBASE_CONFIG.apiKey.indexOf("PASTE-") !== 0;
}
