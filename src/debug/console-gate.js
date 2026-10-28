/* =========================================================
   RUNEGUN · Co-op console gate
   The console refuses to edit a shared descent unless the host proves it
   knows the access code. Only a SHA-256 hash of that code lives in Firebase
   (`console/coop`); the code itself is never in the repo.

   This is deliberately an HONOUR-SYSTEM gate: the hash is fetched by an
   authenticated client and compared in the browser. Anyone who can edit the
   running JS can lift it. It exists so a shared run is not ruined by a
   passer-by with a backtick, not to stop a determined cheater.

   Codes are case-insensitive and whitespace-normalised; `auth hash <code>`
   prints the digest to paste into the Firebase console.
   ========================================================= */
"use strict";

const ConsoleGate = {
  STORE_KEY: "runegun.coopConsole",
  GATE_PATH: "console/coop",
  CACHE_MS: 30000,

  _on: false,
  _remote: null,
  _remoteAt: 0,

  /* One code, however it was typed: trimmed, quotes stripped, runs of
     whitespace collapsed, lower-cased. */
  normalize(code) {
    let s = String(code == null ? "" : code).trim();
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")))
      s = s.slice(1, -1).trim();
    return s.replace(/\s+/g, " ").toLowerCase();
  },

  utf8(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        i++;
        c = 0x10000 + (((c & 0x3ff) << 10) | (text.charCodeAt(i) & 0x3ff));
        out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return new Uint8Array(out);
  },

  /* Pure-JS SHA-256 for WebViews where crypto.subtle is missing (an insecure
     origin, or a browser that only allows it on https/localhost). */
  sha256Hex(text) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const msg = this.utf8(text);
    const bitLen = msg.length * 8;
    const total = (((msg.length + 9) + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[msg.length] = 0x80;
    const hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    buf[total - 8] = (hi >>> 24) & 255; buf[total - 7] = (hi >>> 16) & 255;
    buf[total - 6] = (hi >>> 8) & 255;  buf[total - 5] = hi & 255;
    buf[total - 4] = (lo >>> 24) & 255; buf[total - 3] = (lo >>> 16) & 255;
    buf[total - 2] = (lo >>> 8) & 255;  buf[total - 1] = lo & 255;

    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let t = 0; t < 16; t++)
        w[t] = ((buf[off + t * 4] << 24) | (buf[off + t * 4 + 1] << 16) |
                (buf[off + t * 4 + 2] << 8) | buf[off + t * 4 + 3]) >>> 0;
      for (let t = 16; t < 64; t++) {
        const x = w[t - 15], y = w[t - 2];
        const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
        const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(x => x.toString(16).padStart(8, "0")).join("");
  },

  /* Prefer the platform digest; fall back to the JS one. */
  async hashOf(code) {
    const norm = this.normalize(code);
    const subtle = (typeof crypto !== "undefined" && crypto.subtle &&
                    typeof crypto.subtle.digest === "function") ? crypto.subtle : null;
    if (subtle) {
      try {
        const digest = await subtle.digest("SHA-256", this.utf8(norm));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
      } catch (e) { /* insecure origin / blocked digest — use the fallback */ }
    }
    return this.sha256Hex(norm);
  },

  granted() { return this._on; },

  grant() {
    this._on = true;
    try { sessionStorage.setItem(this.STORE_KEY, "1"); } catch (e) {}
  },

  revoke() {
    this._on = false;
    try { sessionStorage.removeItem(this.STORE_KEY); } catch (e) {}
  },

  restore() {
    try { this._on = sessionStorage.getItem(this.STORE_KEY) === "1"; }
    catch (e) { this._on = false; }
  },

  /* The stored digest, with a short cache so repeated attempts don't hammer
     the database. Returns "" when the node has not been created yet. */
  async remoteHash(force) {
    if (typeof FirebaseBoard === "undefined" || typeof FirebaseBoard.readGate !== "function")
      throw new Error("Firebase is not loaded, so the gate cannot be read.");
    const now = Date.now();
    if (!force && this._remote !== null && now - this._remoteAt < this.CACHE_MS) return this._remote;
    const value = await FirebaseBoard.readGate(this.GATE_PATH);
    this._remote = String(value || "").trim().toLowerCase();
    this._remoteAt = now;
    return this._remote;
  },

  /* Compare the typed code with the stored digest. Grants on success only. */
  async verify(code) {
    const norm = this.normalize(code);
    if (!norm) return { ok: false, reason: "empty" };
    let stored;
    try { stored = await this.remoteHash(); }
    catch (e) { return { ok: false, reason: "offline", error: e.message || String(e) }; }
    if (!stored) return { ok: false, reason: "unset" };
    if (!/^[a-f0-9]{64}$/.test(stored)) return { ok: false, reason: "malformed" };
    const got = await this.hashOf(norm);
    if (got !== stored) return { ok: false, reason: "mismatch" };
    this.grant();
    return { ok: true };
  },
};

ConsoleGate.restore();
