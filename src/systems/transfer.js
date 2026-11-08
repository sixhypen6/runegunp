/* =========================================================
   RUNEGUN · progress transfer
   A one-time code carries the whole vault save between devices. The code
   itself lives in Firebase (systems/leaderboard-firebase.js): eight characters
   from the same unambiguous alphabet as the board callsign, valid for ten
   minutes, and burned the moment it is redeemed.

   Why a code instead of a file: a pasted save file can be edited and a static
   "export code" can be reused forever. This is a bearer token with a short
   life; the sender can revoke it, and a successful receive deletes it before
   the save is applied.

   Replacing the save is deliberately done through localStorage + metaLoad():
   that path already knows every migration and sanity check the game has, so
   an imported save from an older build arrives through the same gate as one
   from the player's own previous session.
   ========================================================= */
"use strict";

const ProgressTransfer = (() => {
  const INCOMING_KEY = SAVE_KEY + ".incoming";
  const CODE_LEN = 8;
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const LINEAGE_LEN = 16;
  const MAX_CHARS = 60000;

  let lastCode = "";
  let lastExpiresAt = 0;
  let tickTimer = 0;
  let pending = null;       // { code, payload } after a successful lookup
  let busy = false;

  function inRun() {
    return typeof Game !== "undefined" &&
      ["play", "pause", "held", "rune", "choice", "wait", "continue"].includes(Game.state);
  }
  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function normalizeCode(input) {
    return String(input == null ? "" : input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function validCode(code) {
    if (code.length !== CODE_LEN) return false;
    for (let i = 0; i < code.length; i++) if (CODE_ALPHABET.indexOf(code[i]) < 0) return false;
    return true;
  }
  function validLineage(id) {
    if (typeof id !== "string" || id.length !== LINEAGE_LEN) return false;
    for (let i = 0; i < id.length; i++) if (CODE_ALPHABET.indexOf(id[i]) < 0) return false;
    return true;
  }
  function newLineage() {
    const bytes = new Uint8Array(LINEAGE_LEN);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < LINEAGE_LEN; i++) bytes[i] = Math.floor(Math.random() * 256);
    let id = "";
    for (let i = 0; i < LINEAGE_LEN; i++) id += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return id;
  }
  /* The lineage is minted once, on the first device that ever transfers this
     save, and then travels inside it. The server ledger keyed by this id is
     what stops the same descent from being handed to b, then c, then d. */
  function ensureTransferId() {
    const current = String(Meta.transferId || "");
    if (validLineage(current)) return current;
    const id = newLineage();
    Meta.transferId = id;
    if (typeof metaSave === "function") metaSave();
    return id;
  }
  function fmtCode(code) {
    return code.length === CODE_LEN ? code.slice(0, 4) + "-" + code.slice(4) : code;
  }
  function status(id, text, bad) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || "";
    el.style.color = bad ? "var(--blood)" : "";
  }
  function setDisabled(id, off) {
    const el = $(id);
    if (el) el.disabled = !!off;
  }
  function show(id, on) {
    const el = $(id);
    if (el) el.style.display = on ? "" : "none";
  }
  async function copyText(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try { await navigator.clipboard.writeText(value); return true; } catch (e) {}
    }
    let ta = null;
    try {
      ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, value.length);
      return !!document.execCommand("copy");
    } catch (e) { return false; }
    finally { if (ta && ta.parentNode) ta.parentNode.removeChild(ta); }
  }

  /* ---- views ---- */
  function open(which) {
    if (typeof AudioFX !== "undefined" && AudioFX.equip) AudioFX.equip();
    const recv = which === "receive";
    show("transferSendView", !recv);
    show("transferRecvView", recv);
    $("transfer").classList.add("on");
    if (recv) {
      pending = null;
      show("transferRecvIntro", true);
      show("transferConfirmView", false);
      const inp = $("transferInput");
      if (inp) { inp.value = ""; setTimeout(() => inp.focus(), 60); }
      status("transferRecvStatus", "");
    } else {
      status("transferSendStatus", "");
      if (lastCode && lastExpiresAt > Date.now()) {
        show("transferSendIntro", false);
        show("transferCodeWrap", true);
        renderCode();
      } else {
        resetSend();
      }
    }
  }
  function close() {
    $("transfer").classList.remove("on");
    stopTick();
    pending = null;
  }
  function resetSend() {
    stopTick();
    lastCode = "";
    lastExpiresAt = 0;
    show("transferSendIntro", true);
    show("transferCodeWrap", false);
    status("transferSendStatus", "");
  }
  function renderCode() {
    $("transferCode").textContent = fmtCode(lastCode);
    show("transferSendIntro", false);
    show("transferCodeWrap", true);
    startTick();
  }
  function startTick() {
    stopTick();
    const paint = () => {
      const left = Math.max(0, lastExpiresAt - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const el = $("transferExpiry");
      if (el) el.textContent = left > 0
        ? "VALID FOR " + m + ":" + String(s).padStart(2, "0")
        : "CODE EXPIRED";
      if (left <= 0) {
        stopTick();
        lastCode = "";
        lastExpiresAt = 0;
        status("transferSendStatus", "THE CODE EXPIRED — FORGE ANOTHER", true);
        show("transferCodeWrap", false);
        show("transferSendIntro", true);
      }
    };
    paint();
    tickTimer = setInterval(paint, 1000);
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  /* ---- send ---- */
  function buildPayload() {
    /* A JSON clone, not a live reference: Meta keeps changing during a run. */
    const meta = JSON.parse(JSON.stringify(Meta));
    return {
      app: "runegun",
      kind: "progress",
      v: 1,
      schemaV: Number(meta.schemaV) || 0,
      exportedAt: Date.now(),
      meta,
    };
  }
  async function forge() {
    if (busy) return;
    if (typeof Leaderboard === "undefined" || !Leaderboard.createTransfer) {
      status("transferSendStatus", "THE VOID DOES NOT ANSWER — ONLINE BOARD UNAVAILABLE", true);
      return;
    }
    busy = true;
    setDisabled("transferSendBtn", true);
    status("transferSendStatus", "FORGING THE CODE…");
    try {
      const lineage = ensureTransferId();
      const st = await Leaderboard.transferStatus(lineage);
      if (st.remaining <= 0) throw new Error("transfer-exhausted");
      const res = await Leaderboard.createTransfer(buildPayload());
      lastCode = res.code;
      lastExpiresAt = res.expiresAt;
      renderCode();
      status("transferSendStatus", "ONE CROSSING · THIS DESCENT HAS " + st.remaining + " LEFT");
    } catch (e) {
      status("transferSendStatus", failure(e), true);
    } finally {
      busy = false;
      setDisabled("transferSendBtn", false);
    }
  }
  async function revoke() {
    if (busy || !lastCode) return;
    busy = true;
    setDisabled("transferRevoke", true);
    try {
      await Leaderboard.consumeTransfer(lastCode);
      status("transferSendStatus", "CODE REVOKED");
      resetSend();
    } catch (e) {
      status("transferSendStatus", failure(e), true);
    } finally {
      busy = false;
      setDisabled("transferRevoke", false);
    }
  }
  async function copy() {
    if (!lastCode) return;
    const ok = await copyText(fmtCode(lastCode));
    status("transferSendStatus", ok ? "CODE COPIED" : "SELECT THE CODE ABOVE TO COPY", !ok);
  }

  /* ---- receive ---- */
  function preview(meta, st) {
    const souls = Math.max(0, Number(meta && meta.bank) || 0);
    const unlocked = (meta && meta.unlocked && typeof meta.unlocked === "object")
      ? Object.keys(meta.unlocked).length : 0;
    const best = Math.max(0, Number(meta && meta.bests && meta.bests.score) || 0);
    return "SOULS " + souls.toLocaleString("en-US") +
      " · " + unlocked + " UNLOCKS" +
      " · BEST " + best.toLocaleString("en-US") +
      (st ? " · CROSSINGS LEFT " + st.remaining + " / " + st.limit : "");
  }
  function payloadMeta(payload) {
    if (!payload || typeof payload !== "object") throw new Error("transfer-damaged");
    const meta = payload.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("transfer-damaged");
    return meta;
  }
  async function lookup() {
    if (busy) return;
    const code = normalizeCode($("transferInput") ? $("transferInput").value : "");
    if (!validCode(code)) {
      status("transferRecvStatus", "THAT CODE IS NOT VALID — EIGHT MARKS, NO O/0/I/1", true);
      return;
    }
    busy = true;
    setDisabled("transferRedeem", true);
    status("transferRecvStatus", "READING THE CODE…");
    try {
      const res = await Leaderboard.fetchTransfer(code);
      const meta = payloadMeta(res.payload);
      const lineage = meta.transferId;
      if (!validLineage(lineage)) throw new Error("transfer-no-lineage");
      const st = await Leaderboard.transferStatus(lineage);
      if (st.remaining <= 0) throw new Error("transfer-exhausted");
      pending = { code: res.code, payload: res.payload, lineage, remaining: st.remaining };
      const pv = $("transferPreview");
      if (pv) pv.textContent = preview(meta, st);
      status("transferRecvStatus", "CODE FOUND · ONE CROSSING");
      show("transferRecvIntro", false);
      show("transferConfirmView", true);
    } catch (e) {
      status("transferRecvStatus", failure(e), true);
    } finally {
      busy = false;
      setDisabled("transferRedeem", false);
    }
  }
  function cancelLookup() {
    pending = null;
    show("transferConfirmView", false);
    show("transferRecvIntro", true);
    status("transferRecvStatus", "CODE NOT CONSUMED — IT STAYS VALID UNTIL IT EXPIRES");
  }
  async function confirm() {
    if (busy || !pending) return;
    if (inRun()) {
      status("transferRecvStatus", "FINISH OR ABANDON THE RUN BEFORE RECEIVING", true);
      return;
    }
    busy = true;
    setDisabled("transferConfirm", true);
    status("transferRecvStatus", "SECURING THE SAVE…");
    try {
      const meta = payloadMeta(pending.payload);
      if (!validLineage(meta.transferId)) throw new Error("transfer-no-lineage");
      const json = JSON.stringify(meta);
      if (json.length > MAX_CHARS) throw new Error("transfer-too-large");
      /* Park the incoming save before the crossing is claimed: if the code
         dies and the write then fails, the payload is still recoverable
         instead of being lost between the two steps. */
      localStorage.setItem(INCOMING_KEY, json);
      let redeemed;
      try {
        /* claims the descent's one crossing and burns the code together */
        redeemed = await Leaderboard.redeemTransfer(pending.code);
      } catch (e) {
        try { localStorage.removeItem(INCOMING_KEY); } catch (e2) {}
        throw e;
      }
      const landed = payloadMeta(redeemed.payload);
      localStorage.setItem(SAVE_KEY, JSON.stringify(landed));
      try { localStorage.removeItem(INCOMING_KEY); } catch (e) {}
      if (typeof metaLoad === "function") metaLoad();
      if (typeof metaSave === "function") metaSave();
      pending = null;
      status("transferRecvStatus", "PROGRESS RESTORED — RELOADING…");
      /* The callsign is cosmetic; never let a slow rename hold the reload. */
      try {
        if (meta.boardName && Leaderboard.adoptCallsign) {
          await Promise.race([Leaderboard.adoptCallsign(meta.boardName), delay(2000)]);
        }
      } catch (e) {}
      setTimeout(() => { try { location.reload(); } catch (e) {} }, 550);
    } catch (e) {
      status("transferRecvStatus", failure(e), true);
    } finally {
      busy = false;
      setDisabled("transferConfirm", false);
    }
  }

  function failure(e) {
    const raw = String((e && (e.code || e.message)) || e || "unknown");
    if (/permission|denied/i.test(raw)) return "TRANSFER SERVICE IS NOT ENABLED — DEPLOY firebase.rules.json";
    if (/timeout/i.test(raw)) return "THE VOID DOES NOT ANSWER — TRY AGAIN";
    if (/transfer-invalid/.test(raw)) return "THAT CODE IS NOT VALID — EIGHT MARKS, NO O/0/I/1";
    if (/transfer-missing/.test(raw)) return "NO PROGRESS WAITS ON THAT CODE";
    if (/transfer-expired/.test(raw)) return "THAT CODE HAS EXPIRED";
    if (/transfer-too-large/.test(raw)) return "THIS SAVE IS TOO LARGE TO SEND";
    if (/transfer-damaged/.test(raw)) return "THAT SAVE ARRIVED DAMAGED";
    if (/transfer-no-lineage/.test(raw)) return "THAT SAVE HAS NO DESCENT IDENTITY — IT CANNOT CROSS";
    if (/transfer-exhausted/.test(raw)) return "THIS DESCENT HAS ALREADY CROSSED — NO TRANSFERS LEFT";
    if (/transfer-code-exhausted/.test(raw)) return "COULD NOT FORGE A CODE — TRY AGAIN";
    if (/transfer-unavailable/.test(raw)) return "THE VOID DOES NOT ANSWER — ONLINE BOARD UNAVAILABLE";
    return "TRANSFER FAILED — " + raw.toUpperCase();
  }

  /* ---- wiring ---- */
  $("btnTransferSend").addEventListener("click", () => open("send"));
  $("btnTransferRecv").addEventListener("click", () => open("receive"));
  $("transferSendBtn").addEventListener("click", forge);
  $("transferCopy").addEventListener("click", copy);
  $("transferRevoke").addEventListener("click", revoke);
  $("transferRedeem").addEventListener("click", lookup);
  $("transferConfirm").addEventListener("click", confirm);
  $("transferCancel").addEventListener("click", cancelLookup);
  $("transferClose").addEventListener("click", close);
  $("transferInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); lookup(); }
  });

  return { open, close };
})();
