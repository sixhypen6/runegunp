/* =========================================================
   RUNEGUN · Controls (desktop): rebinding + game controllers
   PC builds only (PC_MODE or ?pc — the desktop build always loads ?pc):
     • the CONTROLS panel (Settings → CONTROLS): rebind each action's key or mouse
       button (primary + alternate) and its controller button
     • game controllers through the standard Gamepad API, read once per frame from
       main.js: left stick / d-pad move, the right stick aims a virtual cursor, bound
       buttons act — so every desktop fire mode works unchanged
     • menus by controller: d-pad / left stick moves a focus ring over the topmost
       panel's buttons, A presses, B steps back, MENU pauses
     • prompts name whichever device was used last ("[ E ]" vs "[ A ]")
   The bindings and their defaults live in input.js; the save keeps only a player's
   own map (Meta.keyBinds / Meta.padBinds).
   ========================================================= */
"use strict";

const PC_CONTROLS = PC_MODE || PC_TEST;

/* ---------- names ---------- */
/* navigator.keyboard's layout map gives the character printed on THIS keyboard for a
   physical key (KeyW is "Z" on AZERTY). Chromium only, secure contexts only — the
   desktop build's app:// origin is one. Without it, the US-layout name. */
let keyLayout = null;
if (PC_CONTROLS && navigator.keyboard && navigator.keyboard.getLayoutMap)
  navigator.keyboard.getLayoutMap().then(m => { keyLayout = m; }, () => {});

const KEY_NAMES = {
  Space: "SPACE", Escape: "ESC", Tab: "TAB", Enter: "ENTER", Backspace: "BKSP", CapsLock: "CAPS",
  ShiftLeft: "L-SHIFT", ShiftRight: "R-SHIFT", ControlLeft: "L-CTRL", ControlRight: "R-CTRL",
  AltLeft: "L-ALT", AltRight: "R-ALT", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Insert: "INS", Delete: "DEL", Home: "HOME", End: "END", PageUp: "PG UP", PageDown: "PG DN",
  Mouse0: "LEFT MOUSE", Mouse1: "MIDDLE MOUSE", Mouse2: "RIGHT MOUSE", Mouse3: "MOUSE 4", Mouse4: "MOUSE 5",
};
function keyName(code) {
  if (!code) return "—";
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  const printed = keyLayout && keyLayout.get(code);
  if (printed && printed.trim()) return printed.toUpperCase();
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "NUM " + code.slice(6).toUpperCase();
  return code.toUpperCase();
}

/* Standard Gamepad layout (W3C): 0-3 face buttons (bottom, right, left, top) · 4/5 bumpers ·
   6/7 triggers · 8 view/back · 9 menu/start · 10/11 stick clicks · 12-15 d-pad · 16 home.
   Chromium maps Xbox (XInput), PlayStation and Switch Pro pads onto it — and so does
   Steam Input — so one index means the same physical spot on all of them; only the
   printed names differ. */
const PAD_NAMES = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "VIEW", "MENU", "LS", "RS", "D-PAD ↑", "D-PAD ↓", "D-PAD ←", "D-PAD →", "GUIDE"],
  ps:   ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "SHARE", "OPTIONS", "L3", "R3", "D-PAD ↑", "D-PAD ↓", "D-PAD ←", "D-PAD →", "PS"],
  nin:  ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "LS", "RS", "D-PAD ↑", "D-PAD ↓", "D-PAD ←", "D-PAD →", "HOME"],
};
function padFamily(id) {
  /* Xbox first: "Xbox Wireless Controller" would otherwise match the DualShock 4's bare
     "Wireless Controller" below */
  if (/xbox|xinput|045e/i.test(id)) return "xbox";
  if (/054c|playstation|dualshock|dualsense|wireless controller/i.test(id)) return "ps";
  if (/057e|nintendo|pro controller|joy-con/i.test(id)) return "nin";
  return "xbox";
}
function padName(i) {
  if (i === null || i === undefined) return "—";
  if (Pad.connected && !Pad.standard) return "BUTTON " + (i + 1);   // unknown pad: raw numbers, still bindable
  return PAD_NAMES[Pad.family][i] || "BUTTON " + (i + 1);
}
/* the prompt for an action on whichever device is in use */
function bindLabel(act) {
  if (Pad.active) return padName(padBind(act));
  const b = keyBinds(act);
  return keyName(b[0] || b[1]);
}
function moveKeysText() {
  const dirs = ["up", "left", "down", "right"], arrows = ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
  const keys = dirs.map(a => keyName(keyBinds(a)[0]));
  const both = dirs.every((a, i) => keyBinds(a)[1] === arrows[i]);
  return (keys.every(k => k.length === 1) ? keys.join("") : keys.join(" ")) + (both ? " OR THE ARROW KEYS" : "");
}
function anyKeyText() { return Pad.active ? "PRESS " + padName(0) : "PRESS ANY KEY"; }

/* ---------- the controller ---------- */
const PAD_DEAD = 0.22;       // left-stick radial deadzone (rescaled, so movement still starts from 0)
const PAD_AIM_DEAD = 0.35;   // right-stick travel before it re-aims; below it the last aim holds
const PAD_TRIGGER = 0.35;    // analog trigger travel that counts as a press
const PAD_AIM_R = 130;       // virtual cursor distance from the warden, world units

const Pad = {
  connected: false, id: "", family: "xbox", standard: true,
  active: false,       // the controller is the device in use: prompts and the virtual cursor follow it
  moveX: 0, moveY: 0,  // left stick / d-pad, deadzoned — 0 unless active and in play
  fire: false,         // FIRE held
  aimAng: 0,           // right-stick aim, kept when the stick returns to centre
  focus: null,         // the menu element the focus ring is on
  prev: [],            // button states at the last poll — a press is an edge against these
  navDir: null, navRep: 0,

  poll(dt) {
    if (!PC_CONTROLS || !navigator.getGamepads) return;
    let gp = null;
    for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; }
    if (!gp) {
      if (this.connected) { this.connected = false; this.setActive(false); this.prev = []; controlsStatus(); }
      return;
    }
    if (!this.connected || gp.id !== this.id) {
      this.connected = true; this.id = gp.id; this.family = padFamily(gp.id);
      this.standard = gp.mapping === "standard"; this.prev = []; controlsStatus();
    }
    /* an unfocused window can't be meant — read the pad as released (no stuck trigger after alt-tab) */
    const live = document.hasFocus();
    const held = gp.buttons.map(b => live && (b.value > PAD_TRIGGER || (b.pressed && !b.value)));
    const edge = i => i !== null && i !== undefined && !!held[i] && !this.prev[i];
    const axis = i => (live && gp.axes[i]) || 0;
    let lx = axis(0), ly = axis(1);
    const lm = Math.hypot(lx, ly);
    if (lm < PAD_DEAD) lx = ly = 0;
    else { const s = Math.min(1, (lm - PAD_DEAD) / (1 - PAD_DEAD)) / lm; lx *= s; ly *= s; }
    if (this.standard) {
      const dx = (held[15] ? 1 : 0) - (held[14] ? 1 : 0), dy = (held[13] ? 1 : 0) - (held[12] ? 1 : 0);
      if (dx || dy) { lx = dx; ly = dy; }
    }
    const rx = axis(2), ry = axis(3), rm = Math.hypot(rx, ry);

    /* a press or a firm stick push makes the controller the device in use */
    const woke = !this.active && (held.some((h, i) => h && !this.prev[i]) || lm > 0.5 || rm > 0.5);
    if (woke) this.setActive(true);

    /* a CONTROLS rebind waiting for its button takes the first press; MENU cancels */
    if (BindCap && BindCap.kind === "pad") {
      for (let i = 0; i < held.length; i++) if (edge(i)) { padCapture(i); break; }
      this.prev = held; return;
    }

    /* one branch per poll, decided by the state at its start: an A that presses RESUME
       must not also land as SEAL on the first frame of play */
    const st = Game.state;
    this.moveX = this.moveY = 0; this.fire = false;
    if (this.active && st === "play") {
      this.moveX = lx; this.moveY = ly;
      this.fire = !!held[padBind("fire")];
      if (rm > PAD_AIM_DEAD) this.aimAng = Math.atan2(ry, rx);
      if (edge(padBind("dash"))) Input.dashTap = true;
      if (edge(padBind("use"))) Input.useTap = true;
      if (edge(padBind("runes"))) toggleRunesHeld();
      if (edge(9)) uiBack();                          // MENU pauses, like Escape
    } else if (this.active) {
      this.menuInput(st, edge, lx, ly, dt, woke);
    }
    this.prev = held;
  },

  /* menus, overlays and the letterboxed scenes. `woke`: this poll's press only switched
     to the controller — on a panel it shows where the ring is rather than pressing
     something the player hasn't seen yet. */
  menuInput(st, edge, lx, ly, dt, woke) {
    if (st === "tutorial" || st === "cutscene" || st === "vaultcut") {
      const skip = edge(1) || edge(9), go = edge(0);    // as Escape / any other key
      if (st === "tutorial") { if (skip) tutorialSkip(); else if (go) tutorialAdvance(); }
      else if (st === "cutscene") { if (skip) endCutscene(); else if (go) cutsceneTap(); }
      else { if (skip) endVaultCutscene(); else if (go) vaultCutsceneTap(); }
      return;
    }
    const layer = navLayer();
    if (!layer) { this.setFocus(null); return; }
    const f = this.focus;
    if (!(f && layer.contains(f) && !f.disabled && f.getClientRects().length)) {
      const items = navTargets(layer);
      this.setFocus(items.length ? navDefault(items) : null);
    }
    let dir = null;
    if (Math.max(Math.abs(lx), Math.abs(ly)) > 0.5)
      dir = Math.abs(ly) >= Math.abs(lx) ? (ly < 0 ? "up" : "down") : (lx < 0 ? "left" : "right");
    if (woke) { this.navDir = dir; this.navRep = 0.38; return; }   // a held wake-up push only repeats later
    if (dir !== this.navDir) { this.navDir = dir; this.navRep = 0.38; if (dir) this.navStep(dir, layer); }
    else if (dir && (this.navRep -= dt) <= 0) { this.navRep = 0.11; this.navStep(dir, layer); }
    if (edge(0)) { if (this.focus && this.focus.type !== "range") this.focus.click(); }
    else if (edge(1) || edge(9)) padBack(st);
  },

  navStep(dir, layer) {
    const el = this.focus;
    if (el && el.type === "range" && (dir === "left" || dir === "right")) {
      const lo = Number(el.min) || 0, hi = Number(el.max) || 100;
      el.value = String(clamp(Number(el.value) + (dir === "right" ? 1 : -1) * (hi - lo) / 20, lo, hi));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const next = navNext(el, dir, navTargets(layer));
    if (next) this.setFocus(next);
  },

  setFocus(el) {
    if (el === this.focus) return;
    if (this.focus) this.focus.classList.remove("padfocus");
    this.focus = el;
    if (!el) return;
    el.classList.add("padfocus");
    try { el.focus({ preventScroll: true }); } catch (e) {}
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  },

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    document.body.classList.toggle("padmode", on);
    if (on) {                                         // pick up the gun where it points — no snap
      const p = typeof localPlayer === "function" ? localPlayer() : null;
      if (p && typeof p.aim === "number") this.aimAng = p.aim;
    } else {
      this.setFocus(null); this.moveX = this.moveY = 0; this.fire = false; this.navDir = null;
    }
  },

  /* the right stick's aim as a cursor position (localInputFrame calls this each tick) */
  aimCursor() {
    if (!this.active) return;
    const p = localPlayer(); if (!p) return;
    Input.mouseX = (p.x - Game.cam.x + Math.cos(this.aimAng) * PAD_AIM_R) * ZOOM;
    Input.mouseY = (p.y - Game.cam.y + Math.sin(this.aimAng) * PAD_AIM_R) * ZOOM;
  },
};

/* B / MENU outside play: the dev panel, the blackjack table, else Escape's own chain */
function padBack(st) {
  if (typeof devIsOpen === "function" && devIsOpen()) { devClose(); return; }
  if (st === "blackjack" && !$("settings").classList.contains("on")) { closeBlackjack(); return; }
  uiBack();
}

/* ---------- menu focus navigation ---------- */
/* the panel a controller is talking to: the highest open overlay (later in the page wins a tie) */
function navLayer() {
  let top = null, topZ = -Infinity;
  for (const el of document.querySelectorAll(".overlay.on, #devPanel.on")) {
    const z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
    if (z >= topZ) { topZ = z; top = el; }
  }
  if (!top && Game.state === "blackjack") top = $("bjPanel");
  return top;
}
/* buttons, sliders, and the click-to-choose cards that aren't buttons — the descent /
   warden / void choices (.bc-card) and the vault's wares (the same set overlays.js clicks for) */
const NAV_SELECTOR = "button, input[type=range], .bc-card, #vault .card";
function navTargets(layer) {
  const out = [];
  for (const el of layer.querySelectorAll(NAV_SELECTOR))
    if (!el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden") out.push(el);
  return out;
}
/* the panel's main action (DESCEND, RESUME…) when there is one, else its first control */
function navDefault(items) {
  return items.find(el => el.classList.contains("menu-btn") && !el.classList.contains("small")) || items[0];
}
/* spatial: the nearest control in the pushed direction, favouring ones in line with it */
function navNext(from, dir, items) {
  if (!from) return items[0] || null;
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const r = el.getBoundingClientRect();
    const vx = r.left + r.width / 2 - ax, vy = r.top + r.height / 2 - ay;
    const along = vx * dx + vy * dy;
    if (along <= 1) continue;
    const score = along + Math.abs(vx * dy - vy * dx) * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

/* ---------- device switching ----------
   Whichever device was touched last owns the prompts. Capture-phase listeners, so they
   run before anything below could stop the event. A mousemove only counts if the mouse
   really moved — Chromium sends still ones when the page changes under the cursor. */
if (PC_CONTROLS) {
  window.addEventListener("keydown", () => Pad.setActive(false), true);
  window.addEventListener("mousedown", () => Pad.setActive(false), true);
  window.addEventListener("mousemove", e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) Pad.setActive(false);
  }, true);
}

/* ---------- the CONTROLS panel ---------- */
const BIND_ROWS = [
  ["up", "MOVE UP"], ["down", "MOVE DOWN"], ["left", "MOVE LEFT"], ["right", "MOVE RIGHT"],
  ["fire", "FIRE"], ["dash", "DASH"], ["use", "SEAL / INTERACT"], ["runes", "RUNES HELD"],
];
/* never bindable: pause (Escape / P), the OS key, fullscreen, the test-tools hotkey */
const RESERVED_KEYS = ["Escape", "KeyP", "MetaLeft", "MetaRight", "F11"];
/* the d-pad moves; MENU pauses; HOME belongs to the OS / Steam */
const RESERVED_PAD = [9, 12, 13, 14, 15, 16];
const BIND_HINT = "click a binding, then press the new key or button";

let BindCap = null;           // { kind: "key" | "pad", act, slot } while a binding waits for its input
let bindClickGuard = 0;       // swallow the click that ends a mouse-button capture

function renderControls() {
  const grid = $("bindGrid"); if (!grid) return;
  grid.textContent = "";
  const add = (tag, cls, text) => {
    const el = document.createElement(tag);
    el.className = cls; el.textContent = text; grid.appendChild(el); return el;
  };
  for (const h of ["ACTION", "KEY", "ALT KEY", "CONTROLLER"]) add("div", "bind-h", h);
  for (const [act, label] of BIND_ROWS) {
    add("div", "bind-act", label);
    for (let slot = 0; slot < 2; slot++) {
      const code = keyBinds(act)[slot];
      const b = add("button", "bind-btn" + (code ? "" : " empty"), keyName(code));
      b.setAttribute("aria-label", "Rebind " + label.toLowerCase() + (slot ? " (alternate)" : "") + ", now " + keyName(code));
      b.addEventListener("click", () => startCapture("key", act, slot, b));
    }
    if (act === "up") add("div", "bind-fixed", "LEFT STICK · D‑PAD").style.gridRow = "span 4";
    else if (PAD_ACTIONS.includes(act)) {
      const b = add("button", "bind-btn", padName(padBind(act)));
      b.setAttribute("aria-label", "Rebind " + label.toLowerCase() + " on the controller, now " + padName(padBind(act)));
      b.addEventListener("click", () => startCapture("pad", act, 0, b));
    }
  }
  add("div", "bind-act", "AIM"); add("div", "bind-fixed", "MOUSE"); add("div", "bind-fixed", ""); add("div", "bind-fixed", "RIGHT STICK");
  add("div", "bind-act", "PAUSE"); add("div", "bind-fixed", "ESC"); add("div", "bind-fixed", "P"); add("div", "bind-fixed", padName(9));
  $("bindHint").textContent = BIND_HINT;
}
function controlsStatus() {
  const el = $("padStatus"); if (!el) return;
  el.textContent = Pad.connected
    ? "CONTROLLER: " + ((Pad.id.replace(/\s*\(.*$/, "").trim() || "GAMEPAD").toUpperCase().slice(0, 40))
    : "NO CONTROLLER — CONNECT ONE AND PRESS ANY BUTTON";
  /* button names follow the connected pad's family (A / ✕ / B) */
  if ($("controls").classList.contains("on") && !BindCap) renderControls();
}

function startCapture(kind, act, slot, el) {
  BindCap = { kind, act, slot };
  if (Pad.focus !== el) Pad.setFocus(Pad.active ? el : null);
  el.classList.add("capturing");
  el.textContent = kind === "pad" ? "PRESS A BUTTON…" : "PRESS A KEY…";
  $("bindHint").textContent = kind === "pad"
    ? "press the controller button · " + padName(9) + " or esc cancels"
    : "press a key or mouse button · esc cancels · backspace clears";
}
function endCapture() {
  BindCap = null;
  const focusIdx = Pad.focus ? [...$("bindGrid").children].indexOf(Pad.focus) : -1;
  renderControls();
  /* the grid was rebuilt — keep the focus ring on the same cell */
  if (focusIdx >= 0) Pad.setFocus($("bindGrid").children[focusIdx] || null);
}

/* input.js's keydown hands every key here first; true = it was the rebind's */
function bindCaptureKey(e) {
  if (!BindCap) return false;
  e.preventDefault(); e.stopPropagation();
  if (e.code === "Escape") { endCapture(); return true; }
  if (BindCap.kind !== "key") return true;
  if (e.code === "Backspace" || e.code === "Delete") { setKeyBind(BindCap.act, BindCap.slot, null); return true; }
  if (RESERVED_KEYS.includes(e.code) || (e.code === "Backquote" && typeof DEV_TOOLS !== "undefined" && DEV_TOOLS)) {
    $("bindHint").textContent = keyName(e.code) + " is reserved — press another key · esc cancels";
    return true;
  }
  setKeyBind(BindCap.act, BindCap.slot, e.code);
  return true;
}
function padCapture(i) {
  if (i === 9) { endCapture(); return; }
  if (RESERVED_PAD.includes(i)) { $("bindHint").textContent = padName(i) + " is reserved — press another button"; return; }
  setPadBind(BindCap.act, i);
}

/* A new binding never duplicates: whoever already had it takes the slot's old one (a swap). */
function setKeyBind(act, slot, code) {
  const map = {};
  for (const a of KEY_ACTIONS) map[a] = keyBinds(a).slice();
  const old = map[act][slot];
  if (code) for (const a of KEY_ACTIONS) for (let i = 0; i < 2; i++)
    if ((a !== act || i !== slot) && map[a][i] === code) map[a][i] = old;
  map[act][slot] = code;
  Meta.keyBinds = map; metaSave();
  endCapture();
}
function setPadBind(act, idx) {
  const map = {};
  for (const a of PAD_ACTIONS) map[a] = padBind(a);
  const old = map[act];
  for (const a of PAD_ACTIONS) if (a !== act && map[a] === idx) map[a] = old;
  map[act] = idx;
  Meta.padBinds = map; metaSave();
  endCapture();
}

function openControls() {
  BindCap = null; renderControls(); controlsStatus();
  $("controls").classList.add("on");
}
function closeControls() {
  BindCap = null;
  $("controls").classList.remove("on");
}

if (PC_CONTROLS) {
  /* a mouse button pressed while a binding waits becomes the binding */
  window.addEventListener("mousedown", e => {
    if (!BindCap || BindCap.kind !== "key") return;
    e.preventDefault(); e.stopPropagation();
    /* only the left button ends in a click — guarding any other would eat the NEXT real click */
    bindClickGuard = e.button === 0 ? performance.now() + 600 : 0;
    setKeyBind(BindCap.act, BindCap.slot, "Mouse" + e.button);
  }, true);
  window.addEventListener("click", e => {
    if (performance.now() < bindClickGuard) { bindClickGuard = 0; e.preventDefault(); e.stopPropagation(); }
  }, true);

  const row = $("controlsRow");
  if (row) row.style.display = "flex";
  $("btnControls").addEventListener("click", openControls);
  $("controlsClose").addEventListener("click", closeControls);
  $("bindReset").addEventListener("click", () => {
    Meta.keyBinds = null; Meta.padBinds = null; metaSave();
    endCapture();
  });
}
