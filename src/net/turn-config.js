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
   NO RELAY IS CONFIGURED RIGHT NOW
   ---------------------------------------------------------
   The old default was the Open Relay Project. That free service is
   retired: `openrelay.metered.ca` now resolves to 192.0.2.1 / 100::1
   (a blackhole), so every attempt to use it just burns the 20s connect
   timeout and then fails. Listing it is worse than listing nothing —
   with it gone, a LAN / same-machine pair connects directly on host
   candidates alone.

   Mobile-to-mobile co-op NEEDS a relay. Get a free triple from either:

     · metered.ca      — free tier, 50GB/month relayed
     · Cloudflare Calls — free tier TURN

   Both hand you a urls/username/credential triple; drop it in below.
   Nothing else in the codebase needs to change, and the lobby's failure
   text switches back to "configure a relay / try again" automatically
   once this array is non-empty.

   NOTE ON PORT 443: restrictive mobile/corporate networks often block
   UDP and non-standard ports outright. The `turns:` (TLS over 443)
   entries look like ordinary HTTPS and get through far more often, so
   list them alongside the plain UDP/TCP ones.
   ========================================================= */
"use strict";

/* Empty on purpose — see the note above. Add metered.ca credentials here:
     {
       urls: "turn:standard.relay.metered.ca:80",
       username: "<your username>",
       credential: "<your credential>",
     },
     {
       urls: "turns:standard.relay.metered.ca:443",
       username: "<your username>",
       credential: "<your credential>",
     },
*/
const TURN_SERVERS = [];

/* Public STUN is fine and free for the direct-route case. Cloudflare's
   resolver is fast and reachable on networks that choke on Google. */
const STUN_SERVERS = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function iceServers() {
  return STUN_SERVERS.concat(TURN_SERVERS);
}
