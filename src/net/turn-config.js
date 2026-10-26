/* =========================================================
   RUNEGUN · TURN relay — the fallback route for co-op.

   STUN alone only works when at least one side's NAT can be punched
   through. Two phones on two different MOBILE networks are both behind
   carrier-grade NAT, and that case fails outright — which is exactly
   what the first playtest hit. A TURN server relays the traffic when a
   direct route can't be found, so those pairs can still play.

   Relay is a LAST resort: WebRTC prefers host/srflx candidates and only
   falls back to `typ relay` when nothing else connects. Players who can
   connect directly cost the relay nothing.

   ---------------------------------------------------------
   SHIPPING THIS
   ---------------------------------------------------------
   The default below is the Open Relay Project — free, no signup, good
   for testing. It is a shared public service with NO uptime guarantee,
   so it is the wrong thing to ship to Play. Before release, swap in your
   own credentials from either:

     · metered.ca      — free tier, 50GB/month relayed
     · Cloudflare Calls — free tier TURN

   Both hand you a urls/username/credential triple; drop it in below.
   Nothing else in the codebase needs to change.

   NOTE ON PORT 443: restrictive mobile/corporate networks often block
   UDP and non-standard ports outright. The `turns:` (TLS over 443)
   entries look like ordinary HTTPS and get through far more often, so
   they are listed alongside the plain UDP/TCP ones.
   ========================================================= */
"use strict";

const TURN_SERVERS = [
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turns:openrelay.metered.ca:443",   // TLS — the one that survives hostile networks
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

/* Google's public STUN is fine and free for the direct-route case. */
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function iceServers() {
  return STUN_SERVERS.concat(TURN_SERVERS);
}
