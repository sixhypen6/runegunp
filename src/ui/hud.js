/* =========================================================
   RUNEGUN · UI — HUD, state machine, rune & boss choices
   The overlay state machine, HUD readouts, toasts, the rune-strip, the pick-a-rune screen and the boss reward choice.
   ========================================================= */
"use strict";

/* =========================================================
   UI — HUD, rune choice, boss choice, held codex, pause,
   vault, menus, state machine
   ========================================================= */
const OVERLAYS = { menu: "menu", vault: "vault", glossary: "glossary", leaderboard: "leaderboardScreen", lobby: "coopLobby", wait: "partnerWait", pause: "pause", held: "runesHeld", rune: "runeChoice", choice: "bossChoice", continue: "continueScreen", resume: "resumeScreen", dead: "death", ending: "voidChoice", ascend: "ascend", blackjack: "blackjack" };
function setState(s) {
  /* leaving a TEST TOOLS run for the menu hands the real save back */
  if (s === "menu" && Game.devRun) devEndRun();
  Game.state = s;
  /* a hitstop set in the same frame a state change froze the sim would otherwise
     survive the overlay and burn as a dead ~0.2s freeze on resume */
  if (s === "play") Game.hitstop = 0;
  for (const k in OVERLAYS) $(OVERLAYS[k]).classList.toggle("on", k === s);
  const inGame = s === "play" || s === "pause" || s === "held" || s === "rune" || s === "choice" || s === "wait" || s === "blackjack";
  /* the souls counter moves (or vanishes) with the HUD, so any cached target is stale;
     a payout still in flight would otherwise hang frozen behind the overlay */
  markHudDirty();
  if (!inGame) soulMotes.length = 0;
  $("hud").classList.toggle("on", inGame);
  /* the dash/seal touch buttons sit OUTSIDE #hud (fixed siblings), so they need their
     own gate — without it they bleed through the menu's transparent gradient */
  document.body.classList.toggle("inGame", inGame);
  document.body.classList.toggle("bjOn", s === "blackjack");   // the saloon's table: only the souls counter stays up
}

function updateHp() {
  const p = localPlayer();
  if (!p) return;
  const pct = clamp(p.hp / p.maxHp * 100, 0, 100) + "%";
  $("hpFill").style.width = pct;
  $("hpChip").style.width = pct;   // the pale chip eases after the fill — the bite lingers
  $("hpNum").textContent = Math.ceil(p.hp) + " / " + p.maxHp;
  document.querySelector(".hp-wrap").classList.toggle("low", p.hp > 0 && p.hp / p.maxHp < 0.3);
  /* co-op: one smaller bar per living partner underneath (up to three) */
  const stack = $("partnerStack");
  if (!stack) return;
  const mates = (typeof Net !== "undefined" && Net.active)
    ? players.filter(o => o !== p && !o.gone)
    : [];
  for (const [idx, row] of hudPartnerRows)
    if (!mates.some(o => o.idx === idx)) { row.remove(); hudPartnerRows.delete(idx); }
  for (const mate of mates) {
    const row = partnerRowFor(mate);
    row._name.textContent = (CHARS[mate.char] ? CHARS[mate.char].name : "WARDEN") + (mate.downed ? " · DOWN" : "");
    row._num.textContent = mate.downed ? "✚" : Math.ceil(mate.hp);
    row._fill.style.width = clamp(mate.hp / mate.maxHp * 100, 0, 100) + "%";
    stack.appendChild(row);          // keep rows in seat order
  }
}

/* the partner bars are built once per seat and then updated in place — this
   runs on every hurt, so it must not rebuild the DOM */
const hudPartnerRows = new Map();
function partnerRowFor(p) {
  let row = hudPartnerRows.get(p.idx);
  if (row) return row;
  row = document.createElement("div");
  row.className = "partner-row";
  row.innerHTML =
    "<div class='hp-label' style='font-size:calc(9px * var(--text-scale, 1));margin-top:4px'>" +
      "<span class='p-name'></span><span class='p-num'></span></div>" +
    "<div class='hp-bar' style='height:6px'><div class='hp-fill'></div></div>";
  row._name = row.querySelector(".p-name");
  row._num = row.querySelector(".p-num");
  row._fill = row.querySelector(".hp-fill");
  hudPartnerRows.set(p.idx, row);
  return row;
}

/* animate a numeric readout from what it currently shows to `to` */
const numTweens = new Map();
function tweenNum(el, to, dur) {
  const from = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10) || 0;
  const prev = numTweens.get(el);
  if (prev) cancelAnimationFrame(prev.raf);
  const t0 = performance.now(), state = { raf: 0 };
  numTweens.set(el, state);
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(from + (to - from) * k);
    if (k < 1) state.raf = requestAnimationFrame(step); else numTweens.delete(el);
  };
  step(t0);
}
/* `dur` lets a kill stretch the digit roll to cover its soul motes' flight; every
   other caller omits it and keeps the original 300ms */
function updateScore(dur) {
  const el = $("score");
  if (el.textContent !== String(Game.score)) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  tweenNum(el, Game.score, dur || 300);
}
const rerollLabel = n => n === Infinity ? "∞" : "×" + n;
function updateRerolls() { const p = localPlayer(); if (p) $("rerolls").textContent = "RE-ROLLS " + rerollLabel(p.rerolls); }
function updateSeals() {
  $("sealCount").textContent = Game.inUnknown ? "IT WAITS" : Game.chestsTotal === 0 ? "THE VOID WAITS" : "SEALS " + Game.chestsOpened + " / " + Game.chestsTotal;
  /* vitality caches left on the floor, counted like the seals above. The void
     floor stocks none, so the line simply disappears there. */
  const el = $("vitalCount");
  if (!el) return;
  const total = healthBoxes ? healthBoxes.length : 0;
  const left = total ? healthBoxes.filter(h => h.state === "sealed").length : 0;
  el.style.display = total ? "" : "none";
  el.textContent = "VITALS " + left + " / " + total;
}

let toastT = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.style.opacity = 0, 2200);
}

/* The REPRIEVE save's clock, under the vitality bar. Written only when the
   text changes — the countdown redraws once a second, not once a frame. */
let lastReprieveCue = null;
function updateReprieveCue(p) {
  const el = $("reprieveCue");
  if (!el) return;
  const stacks = p && p.mods ? (p.mods.reprieveStacks || 0) : 0;
  if (!stacks) {
    if (lastReprieveCue !== "") {
      lastReprieveCue = "";
      el.textContent = "";
      el.className = "";
    }
    return;
  }
  const t = Math.ceil(p.reprieveCd || 0);
  const ready = t <= 0;
  const txt = "REPRIEVE" + (stacks > 1 ? " ×" + stacks : "") + " · " + (ready ? "READY" : "IN " + t + "s");
  const cls = "on" + (ready ? " ready" : "");
  if (lastReprieveCue !== txt + cls) {
    lastReprieveCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}

/* HUD strip: every stack the LOCAL warden carries */
function refreshRuneStrip() {
  const el = $("runeStrip");
  const p = localPlayer();
  el.innerHTML = "";
  if (!p) return;
  if (p.lockedRunes || Game.chaosMode) {
    const d = document.createElement("span");
    d.className = "chip";
    d.style.color = d.style.borderColor = Game.chaosMode ? CHAOS_COLOR : "#ffd23d";
    d.innerHTML = Game.chaosMode ? "<small>CHAOS</small>" : "<small>SEALED</small>";
    el.appendChild(d);
  }
  /* the challenge rides beside CHAOS, in its own colour, so the price is never hidden */
  if (Game.chaosMode && typeof challengeDef === "function") {
    const cd = challengeDef(Game.challenge);
    if (cd) {
      const d = document.createElement("span");
      d.className = "chip";
      d.style.color = d.style.borderColor = cd.color;
      d.innerHTML = "<small>" + cd.name + " ×" + cd.mul + "</small>";
      el.appendChild(d);
    }
  }
  for (const id in p.runes) {
    const n = p.runes[id]; if (!n) continue;
    const R = runeDefFor(p, id);
    if (!R) continue;   // a stale id (e.g. a rune removed since the save) must not break the HUD
    const d = document.createElement("span");
    d.className = "chip";
    d.style.color = R.color;
    if (p.lockedRunes && p.lockedRunes.includes(id)) d.style.borderColor = "#ffd23d";
    d.innerHTML = R.glyph + (n > 1 ? "<small>×" + n + "</small>" : "");
    el.appendChild(d);
  }
}

/* ---------- no-pause rune picks: a choice that rides over live play ----------
   With pausing off, the warden still needs to read three cards while the fight
   goes on. The choice is drawn as an overlay with the sim left in "play", so
   the host keeps simulating (and streaming) for everyone else. */
function showRuneOverlay(idx) {
  Game.runeOverlayBy = idx;
  const el = $("runeChoice");
  if (el) el.classList.add("on");
  document.body.classList.add("inGame");
  renderRuneChoice(idx);
}
function hideRuneOverlay(idx) {
  if (idx !== undefined && Game.runeOverlayBy !== idx) return;
  Game.runeOverlayBy = null;
  const el = $("runeChoice");
  if (el) el.classList.remove("on");
}

/* the rune hand a given warden is holding: the per-player queue when the run
   keeps playing, or the legacy single slot when the world is frozen for the pick */
function runeEntryFor(idx) {
  if (Game.pendingPickups) {
    const e = Game.pendingPickups.find(x => x.by === idx);
    if (e) return e;
  }
  return (Game.pendingPickup && Game.pendingPickupBy === idx) ? { pk: Game.pendingPickup } : null;
}

/* ---------- rune choice: pick one of three, reroll per-slot ---------- */
function openRuneChoice(pickerIdx) {
  /* pickerIdx is the player index who touched the orb.
     If omitted, falls back to legacy single-slot (pause mode). */
  const idx = (typeof pickerIdx === "number") ? pickerIdx : Game.pendingPickupBy;
  const chooser = players[idx] || localPlayer();
  /* RUNELESS: a rune source never asks — it mends and hastens. update() consumes
     orbs on touch, so this is the belt-and-braces path for any other caller. */
  if (Game.challenge === "runeless") {
    const ch = chooser;
    const pk = runeEntryFor(idx)?.pk;
    if (typeof pickerIdx === "number") {
      Game.pendingPickups = Game.pendingPickups.filter(e => e.by !== idx);
    } else {
      Game.pendingPickup = null;
    }
    if (pk) { const pidx = pickups.indexOf(pk); if (pidx !== -1) pickups.splice(pidx, 1); }
    if (ch) runelessBoon(ch);
    return;
  }
  /* an orb always has a hand to roll from by the time it is opened — co-op orbs
     roll on touch, so this is the last line of defence against an empty offer */
  const pk = runeEntryFor(idx)?.pk;
  if (pk && !pk.ids) pk.ids = genThreeRunes(chooser);
  const paused = shouldPauseForRune();
  /* co-op: the offer travels to a remote chooser. With pausing on, this side
     freezes and shows the wait notice; with it off, play simply continues and
     the chooser's own overlay opens on their screen. */
  if (Net.active && chooser !== localPlayer()) {
    if (Net.role === "host") Coop._sendRuneOffer(idx);
    if (paused) {
      $("waitTitle").textContent = "YOUR PARTNER IS CHOOSING A RUNE";
      setState("wait");
    }
    return;
  }
  if (!paused) { showRuneOverlay(idx); return; }
  setState("rune");
  renderRuneChoice(idx);
}
function renderRuneChoice(pickerIdx) {
  const idx = (typeof pickerIdx === "number") ? pickerIdx : Game.pendingPickupBy;
  const p = runeEntryFor(idx)?.pk;
  /* whose hand carves: the warden that touched the orb */
  const ch = players[idx] || localPlayer();
  const container = $("rcCards");
  container.innerHTML = "";
  /* Never leave a blank modal. This runs from a DataChannel callback on the
     guest, so a throw here is swallowed by the browser and strands both
     players staring at an empty choice — the exact playtest freeze. */
  if (!p || !p.ids || p.ids.length < 3 || p.ids.some(id => !runeDefFor(ch, id))) {
    container.innerHTML = "<div class='empty-note'>THE RUNES ARE SLOW TO ANSWER…</div>";
    if (Net.role === "guest") Net.sendR({ t: "reofferReq", pickerIdx: idx });
    else if (p) { p.ids = genThreeRunes(ch); renderRuneChoice(idx); }
    return;
  }
  for (let i = 0; i < 3; i++) {
    const slotIdx = i;
    const id = p.ids[slotIdx];
    const R = runeDefFor(ch, id);
    const own = ch.runes[id] || 0;
    const card = document.createElement("div");
    card.className = "rc-rune-card";
    card.style.color = R.color;
    card.style.animationDelay = (i * 90) + "ms";   // the three cards deal in like a hand
    const numberPreview = Meta.advancedNumbers
      ? "<div class='rc-advanced'>" + advancedRunePreview(ch, id).join("<br>") + "</div>"
      : "";
    const description = Meta.showRuneDescriptions !== false ? "<div class='rc-ds'>" + R.desc + "</div>" : "";
    card.innerHTML =
      "<div class='rc-glyph'>" + R.glyph + "</div>" +
      "<div class='rc-nm'>" + R.name + "</div>" +
      "<div class='rc-own'>" + (own ? "you carry \xd7" + own + " — stacks to \xd7" + (own + 1) +
        (own >= STACK_FULL && TAPERED_RUNES.has(id) && !(typeof Game !== "undefined" && Game.classicMode) ? " · tapers past \xd7" + STACK_FULL : "") : "first of its kind") + "</div>" +
      numberPreview + description;
    const takeBtn = document.createElement("button");
    takeBtn.className = "menu-btn";
    takeBtn.textContent = "CARVE IT IN";
    takeBtn.addEventListener("click", () => {
      if (!p) return;
      const paused = shouldPauseForRune();
      /* GUEST chooser: the pick travels to the host, who grants it */
      if (Net.role === "guest") {
        Net.sendR({ t: "runePick", id: p.ids[slotIdx], pickerIdx: idx });
        AudioFX.equip();
        if (!paused) {
          /* overlay over live play: just fold it away */
          Game.pendingPickups = Game.pendingPickups.filter(e => e.by !== idx);
          hideRuneOverlay(idx);
        } else {
          Game.pendingPickup = null;
          $("waitTitle").textContent = "CARVED — THE DESCENT RESUMES";
          setState("wait");
        }
        return;
      }
      /* HOST chooser: grant immediately */
      const pidx = pickups.indexOf(p);
      if (pidx !== -1) pickups.splice(pidx, 1);
      grantRune(ch, p.ids[slotIdx]);
      if (!paused) {
        Game.pendingPickups = Game.pendingPickups.filter(e => e.by !== idx);
      } else {
        Game.pendingPickup = null;
      }
      /* the carve lands: a flourish in the rune's color as play resumes */
      floatText(ch.x, ch.y - 30, R.name, R.color, 16);
      shockwaves.push({ x: ch.x, y: ch.y, r: 8, max: 160, speed: 640, dmg: 0,
        hostile: false, color: R.color, hitSet: new Set() });
      for (let k = 0; k < 12; k++) particles.push({ x: ch.x, y: ch.y,
        vx: rnd(-220, 220), vy: rnd(-220, 220), t: 0, life: rnd(0.3, 0.6), r: rnd(2, 4), color: R.color });
      AudioFX.equip();
      if (Net.role === "host") Net.sendR({ t: "runeGranted", idx: ch.idx, id: p.ids[slotIdx], pickerIdx: idx });
      if (!paused) hideRuneOverlay(idx);
      else setState("play");
    });
    const rerollBtn = document.createElement("button");
    rerollBtn.className = "menu-btn small";
    rerollBtn.textContent = "RE-ROLL " + rerollLabel(ch.rerolls);
    rerollBtn.disabled = ch.rerolls <= 0;
    rerollBtn.addEventListener("click", () => {
      if (ch.rerolls <= 0 || !p) return;
      /* GUEST chooser: the host owns the pool and the reroll count */
      if (Net.role === "guest") { Net.sendR({ t: "reroll", slot: slotIdx, pickerIdx: idx }); AudioFX.reroll(); return; }
      ch.rerolls--;
      updateRerolls();
      const pool = runePool(ch);
      const onScreen = new Set(p.ids);
      let avail = pool.filter(id => !onScreen.has(id));
      if (!avail.length) avail = pool.filter(id => id !== p.ids[slotIdx]);
      if (avail.length) p.ids[slotIdx] = pick(avail);
      AudioFX.reroll();
      renderRuneChoice(idx);
    });
    card.appendChild(takeBtn);
    card.appendChild(rerollBtn);
    container.appendChild(card);
  }
  /* seal status note */
  const note = $("rcLockNote");
  const slots = runeSlotCount(ch);
  if (Game.chaosMode) {
    note.style.display = "none";            // CHAOS: no seal to warn about
  } else if (ch.lockedRunes) {
    note.style.display = "block";
    note.innerHTML = "PATH SEALED — every rune here is one of your " + slots + ": " +
      ch.lockedRunes.map(id => runeDefFor(ch, id).glyph).join("  ");
  } else {
    const distinct = heldRuneIds(ch).length;
    const hasNew = p.ids.some(id => !ch.runes[id]);
    if (distinct === slots - 1 && hasNew) {
      note.style.display = "block";
      note.innerHTML = "LAST CHANCE — carving a new rune will SEAL your path to those " + slots + ".";
    } else {
      note.style.display = "none";
    }
  }
}

/* ---------- boss choice: mend the flesh or carve a rune ---------- */
function spawnPortal() {
  /* the Other Gunslingers are down: no way down opens — the rift from floor I does,
     and THE UNKNOWN waits past it (entities/unknown.js) */
  if (Game.unknownDue && !Game.inUnknown) {
    rift = { x: SEAL.x, y: SEAL.y, r: 40, t: 0, final: true };
    toast("NO WAY DOWN OPENS — SOMETHING TEARS THE DARK INSTEAD");
    setTimeout(() => { if (rift && rift.final) toast("...IT HAS BEEN WAITING FOR YOU..."); }, 2400);
    AudioFX.bossRoar(); AudioFX.portal();
    Game.shake = Math.max(Game.shake, 10);
    return;
  }
  /* past THE UNKNOWN the abyss itself is the way down — a wider mouth to step into */
  portal = { x: SEAL.x, y: SEAL.y, r: Game.inUnknown ? 96 : 46, t: 0 };
  toast(Game.inUnknown ? "THE ABYSS OPENS — THE CATACOMB WAITS BELOW" : "A WAY DOWN OPENS AT THE GRAND SEAL");
  AudioFX.portal();
  /* the first time the Warden falls, something else tears open beside the way down */
  if (Game.mapIdx === 0 && Game.loop === 0 && !Game.riftDone && !Game.riftOffered) {
    Game.riftOffered = true;
    rift = { x: SEAL.x + 170, y: SEAL.y, r: 28, t: 0 };
    setTimeout(() => { if (rift && !Game.inRift) toast("...SOMETHING ELSE STIRS BESIDE IT..."); }, 1400);
    AudioFX.bossRoar();
  }
}
$("bcHeal").addEventListener("click", () => {
  if (Game.state !== "choice") return;
  /* the toll pays out to EVERY warden — half of each one's own maximum */
  for (const p of players) {
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp / 2));
    floatText(p.x, p.y - 24, "+" + Math.round(p.maxHp / 2), "#ff4d5e");
  }
  updateHp();
  spawnPortal();
  setState("play");
});
$("bcRune").addEventListener("click", () => {
  if (Game.state !== "choice") return;
  /* one orb falls ON each warden — each rolls from its taker's own pool.
     dead-centre on purpose: an offset orb can land outside the map or inside a
     rock (nothing validates the spot here), and the toll would be unclaimable.
     At zero distance update() collects it on the next frame. */
  for (const p of players) spawnPickup(p.x, p.y);
  spawnPortal();
  setState("play");
});

