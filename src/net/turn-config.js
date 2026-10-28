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
   RELAY: metered.ca (workspace `runegunp`, free 50GB/month)
   ---------------------------------------------------------
   The old default was the Open Relay Project. That free service is
   retired: `openrelay.metered.ca` now resolves to 192.0.2.1 / 100::1
   (a blackhole), so every attempt to use it just burned the 20s connect
   timeout and then failed. These credentials replace it.

   The credential is STATIC and ships inside this public bundle, so
   anyone who opens the page can read it. That is the cost of WebRTC
   without a credential server; the damage is bounded by the free quota,
   auto-reload being off, and relay only being used when a direct route
   fails. To rotate: metered.ca dashboard → TURN Server → Credentials →
   revoke, then paste the new triple here and ship.

   NOTE ON PORT 443: restrictive mobile/corporate networks often block
   UDP and non-standard ports outright. The `turns:` (TLS over 443)
   entries look like ordinary HTTPS and get through far more often, so
   all four transports are listed — UDP 80/443 first (fastest), TCP as
   the fallback.
   ========================================================= */
"use strict";

const TURN_SERVERS = [
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "faf399314a0e11b711517cd5",
    credential: "sCuDmJvFgww3acWZ",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: "faf399314a0e11b711517cd5",
    credential: "sCuDmJvFgww3acWZ",
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: "faf399314a0e11b711517cd5",
    credential: "sCuDmJvFgww3acWZ",
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: "faf399314a0e11b711517cd5",
    credential: "sCuDmJvFgww3acWZ",
  },
];

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
