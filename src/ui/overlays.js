/* =========================================================
   RUNEGUN · UI — codex, pause, vault, settings, menus
   Held-runes codex, pause menu, soul banking, the vault, control-scheme toggles, volume, settings and the menu/death screens.
   ========================================================= */
"use strict";

/* ---------- held codex ---------- */
function renderHeld(gunEl = "gunLine", gridEl = "heldGrid", petEl = null) {
  const p = localPlayer();
  const m = buildWeaponModsFrom(p.runes, p);
  const basicLine =
    "DMG <span>" + Math.round(m.dmg) + "</span> · RATE <span>" + m.rate.toFixed(1) + "/s</span>" +
    " · SHOT <span>×" + (m.count * (1 + m.twin) * (1 + m.mirror)) + "</span> · SPREAD <span>" + Math.round(m.spread * 57) + "°</span>" +
    (m.pierce ? " · PIERCE <span>" + m.pierce + "</span>" : "") +
    (m.bounce ? " · BOUNCE <span>" + m.bounce + "</span>" : "") +
    (m.sawDmg ? " · SAW <span>" + Math.round(m.sawDmg * (m.rate / 5) * (m.shredDmgMul || 1)) + "</span>" : "") +
    (m.moveMul > 1 ? " · SPEED <span>+" + Math.round((m.moveMul - 1) * 100) + "%</span>" : "") +
    (m.shieldMax ? " · SHIELD <span>" + m.shieldMax + "× / " + m.shieldDmg + "</span>" : "") +
    (m.reprieveStacks ? " · SAVE <span>" + ((p.reprieveCd || 0) > 0 ? Math.ceil(p.reprieveCd) + "s" : "READY") + "</span>" : "") +
    (m.execute ? " · REAP <span>&lt;" + Math.round(m.execute * 100) + "%</span>" : "") +
    (m.midas ? " · SOULS <span>+" + Math.round(m.midas * 100) + "%</span>" : "") +
    (Game.chaosMode ? "<br><span style='color:" + CHAOS_COLOR + "'>CHAOS — no seal; every rune keeps answering</span>"
      : p.lockedRunes ? "<br><span style='color:var(--gold)'>PATH SEALED — chests now yield only your " + runeSlotCount(p) + " runes</span>"
      : "<br><span style='color:var(--dim)'>carve " + runeSlotCount(p) + " different runes to seal your path</span>");
  const c = CHARS[p.char];
  const exactLine = Meta.advancedNumbers
    ? "<br><span class='advanced-stat-line'>" + c.name + " · HP " + c.hp + " → " + p.maxHp +
      " · MOVE " + c.speed.toFixed(2) + " → " + p.speed.toFixed(2) + " px/s · DASH " + p.dashCdBase.toFixed(3) +
      "s / " + p.dashDur.toFixed(3) + "s / " + p.dashSpeed.toFixed(1) + " px/s" +
      "<br>GUN · DMG " + m.dmg.toFixed(3) + " · RATE " + m.rate.toFixed(3) + "/s · BULLETS " +
      (m.count * (1 + m.twin) * (1 + m.mirror)).toFixed(2) + " · SPREAD " + (m.spread * 180 / Math.PI).toFixed(3) +
      "° · SIZE " + m.size.toFixed(3) + " · SHOT SPEED " + m.speed.toFixed(2) + " px/s" +
      (m.pierce ? " · PIERCE " + m.pierce : "") + (m.bounce ? " · BOUNCE " + m.bounce : "") +
      (m.sawReach ? " · SAW REACH " + m.sawReach.toFixed(2) : "") + "</span>"
    : "";
  $(gunEl).innerHTML = basicLine + exactLine;
  const grid = $(gridEl);
  grid.innerHTML = "";
  const ids = Object.keys(p.runes).filter(id => p.runes[id] > 0);
  if (ids.length === 0) {
    const d = document.createElement("div");
    d.className = "empty-note";
    d.textContent = "NOTHING CARVED YET — BREAK CHEST SEALS TO FIND RUNES";
    grid.appendChild(d);
  }
  ids.forEach(id => {
    const R = runeDefFor(p, id), n = p.runes[id];
    const d = document.createElement("div");
    d.className = "card";
    d.style.color = R.color;
    d.style.cursor = "default";
    const lines = runeStatLines(p, id);
    const exactLines = Meta.advancedNumbers ? advancedRuneLines(p, id) : [];
    const contrib = lines.length || exactLines.length
      ? "<div class='contrib'>" + lines.map(s => "<span>" + s + "</span>").join("") +
        exactLines.map(s => "<span class='advanced-stat-line'>" + s + "</span>").join("") + "</div>"
      : "";
    d.innerHTML = "<span class='tag'>×" + n + "</span><span class='glyph'>" + R.glyph +
      "</span><div class='nm'>" + R.name + "</div>" + contrib +
      "<div class='ds'>" + R.desc + "</div>";
    grid.appendChild(d);
  });
  if (petEl && $(petEl)) renderPetCard($(petEl));
}

/* Exact marginal changes in the assembled weapon, accounting for rune interactions and caps. */
function advancedRuneLines(p, id) {
  const full = buildWeaponModsFrom(p.runes, p);
  const lessRunes = Object.assign({}, p.runes); delete lessRunes[id];
  const less = buildWeaponModsFrom(lessRunes, p);
  const lines = [];
  const diff = (label, key, digits = 3, unit = "") => {
    const before = less[key] || 0, after = full[key] || 0;
    if (Math.abs(before - after) > 0.0001)
      lines.push(label + " " + before.toFixed(digits) + " → " + after.toFixed(digits) + " (Δ " +
        (after - before >= 0 ? "+" : "") + (after - before).toFixed(digits) + unit + ")");
  };
  diff("DAMAGE", "dmg"); diff("FIRE RATE", "rate", 3, "/s");
  diff("BULLETS/SHOT", "count", 2); diff("PARALLEL SHOTS", "twin", 0);
  diff("SPREAD", "spread", 4, " rad"); diff("BULLET SIZE", "size"); diff("SHOT SPEED", "speed", 2, " px/s");
  diff("PIERCE", "pierce", 0); diff("BOUNCE", "bounce", 0); diff("HOMING", "homing");
  diff("MOVE MULTIPLIER", "moveMul", 4, "×"); diff("MAX HP BONUS", "hpBonus", 2);
  diff("DASH COOLDOWN MULTIPLIER", "dashCdMul", 4, "×"); diff("DASH TRAIL", "dashTrail", 3);
  diff("POISON", "venom", 3); diff("BURN", "ember", 3); diff("CHILL", "frost", 3);
  diff("LIGHTNING", "storm", 3); diff("CORPSE BLAST", "nova", 3); diff("DEATH SHARDS", "splinter", 3);
  diff("LEECH", "leech", 3, " HP/kill"); diff("SOUL BONUS", "midas", 3);
  diff("EXECUTE", "execute", 3); diff("DAMAGE REDUCTION", "dr", 3);
  diff("CRIT CHANCE", "crit", 3); diff("THORNS", "thorns", 3); diff("REGEN", "regen", 3, " HP/s");
  diff("FEAR CHANCE", "fear", 3); diff("TIME FIELD", "timeField", 3);
  diff("THORN AURA", "prickle", 3); diff("SLIME TRAIL", "slime", 3);
  diff("SAW REACH", "sawReach", 2); diff("SAW DAMAGE BONUS", "shredDmgMul", 3, "×");
  return lines;
}
/* Prospective exact values after adding one stack of a rune to the current build. */
function advancedRunePreview(p, id) {
  const current = buildWeaponModsFrom(p.runes, p);
  const nextRunes = Object.assign({}, p.runes, { [id]: (p.runes[id] || 0) + 1 });
  const next = buildWeaponModsFrom(nextRunes, p);
  const c = CHARS[p.char], fmt = n => Number(n).toFixed(2);
  const signed = (a, b) => (b - a >= 0 ? "+" : "") + fmt(b - a);
  const shots = m => m.count * (1 + m.twin) * (1 + m.mirror);
  const dashSpeed = m => clamp((c.dashSpeed || 720) * m.moveMul, 240, 1600);
  return [
    "DMG " + fmt(next.dmg) + " (" + signed(current.dmg, next.dmg) + ") · RATE " + fmt(next.rate) + "/s · SHOT ×" + fmt(shots(next)) + " · BULLET " + fmt(next.speed),
    "MOVE " + fmt(c.speed * next.moveMul) + " · DASH " + fmt(dashSpeed(next)) + " · CD " + fmt(c.dashCd * next.dashCdMul) + "s · SPR " + fmt(next.spread * 180 / Math.PI) + "° · P" + next.pierce + " B" + next.bounce,
  ];
}
/* equipped-companion card for the pause loadout (Meta.pet → PTYPES) */
function renderPetCard(pe) {
  pe.innerHTML = "";
  const P = Meta.pet && PTYPES[Meta.pet];
  if (!P) {
    const d = document.createElement("div");
    d.className = "empty-note";
    d.textContent = "NO COMPANION BOUND — BIND ONE IN THE VAULT";
    pe.appendChild(d);
    return;
  }
  const d = document.createElement("div");
  d.className = "card";
  d.style.color = P.color;
  d.style.cursor = "default";
  d.innerHTML = "<span class='glyph'>" + P.glyph + "</span><div class='nm'>" + P.name +
    "</div><div class='ds'>" + P.desc + "</div>";
  pe.appendChild(d);
}
let heldReturn = "play";
function toggleRunesHeld() {
  if (Game.state === "play" || Game.state === "pause") {
    heldReturn = Game.state;
    renderHeld();
    setState("held");
  } else if (Game.state === "held") setState(heldReturn);
}
$("heldClose").addEventListener("click", () => { if (Game.state === "held") setState(heldReturn); });

/* ---------- pause ---------- */
function togglePause() {
  /* GUEST: the host owns the world clock, so BOTH pausing and resuming are
     requests rather than local acts. Either player may do either — the pause
     screen is shared, not the host's private privilege. */
  if (typeof Net !== "undefined" && Net.role === "guest") {
    if (Game.state === "play") Net.sendR({ t: "pauseReq" });
    else if (Game.state === "pause") Net.sendR({ t: "resumeReq" });
    return;
  }
  if (Game.state === "play") { if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("UI", "paused"); openPausePanel(); setState("pause"); }
  else if (Game.state === "pause") { if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("UI", "resumed"); setState("play"); }
}
/* the pause panel's contents — also used by the guest when the host pauses */
function openPausePanel() {
  renderHeld("gunLinePause", "heldGridPause", "petPause");
  syncVolumeUI(); applyAimMode();
}
$("pauseBtn").addEventListener("click", () => { if (Game.state === "play" || Game.state === "pause") togglePause(); });
/* routed through togglePause so a guest's RESUME asks the host instead of
   unfreezing only its own screen */
$("btnResume").addEventListener("click", () => { if (Game.state === "pause") togglePause(); });
$("btnQuit").addEventListener("click", () => {
  if (Game.state !== "pause") return;
  if (typeof Net !== "undefined" && Net.active) {
    /* co-op runs never touch records or leaderboards — just bank and go */
    Net.sendR({ t: Net.role === "host" ? "hostQuit" : "guestQuit" });
    Coop.running = false;
    Net.hangUp();
    bankSouls();
    refreshMenu();
    setState("menu");
    return;
  }
  /* an abandoned run still counts: record bests + post the score, like death does */
  const improved = recordBests();
  Leaderboard.submitRun(improved);
  bankSouls();
  refreshMenu();
  setState("menu");
});

/* ---------- soul banking ---------- */
function bankSouls() {
  if (Game.banked || Game.score <= 0) { Game.banked = true; return 0; }
  Meta.bank += Game.score;
  Game.banked = true;
  metaSave();
  return Game.score;
}

/* ---------- the vault: characters & warpaint ----------
   kind: "char" | "skin" (body warpaint) | "gunskin" (gun warpaint).
   The two warpaint kinds share one unlock key ("skin:<key>") — a colour is bought
   once and may then be worn on the body, the gun, or both. The gun section's free
   "none" card (GUN_STOCK) clears the paint back to rune-tinted bare metal. */
function vaultCard(key, def, kind) {
  const unlockKey = (kind === "gunskin" ? "skin" : kind) + ":" + key;
  const stock = kind === "gunskin" && key === "none";
  const owned = stock || !!Meta.unlocked[unlockKey];
  const selected = kind === "char" ? Meta.char === key
    : kind === "gunskin" ? (Meta.gunSkin || "none") === key
      : Meta.skin === key;
  const advancedChar = kind === "char" && Meta.advancedNumbers
    ? "<div class='ds advanced-stat-line'>BASE · HP " + def.hp + " · MOVE " + def.speed.toFixed(2) + " px/s · DASH CD " + def.dashCd.toFixed(3) +
      "s · DURATION " + (def.dashDur || 0.18).toFixed(3) + "s · SPEED " + (def.dashSpeed || 720).toFixed(1) + " px/s · REROLLS " + def.rerolls +
      " · SLOTS " + (def.runeSlots || 4) +
      (def.weaponBase ? "<br>WEAPON · DMG " + def.weaponBase.dmg.toFixed(2) + " · RATE " + def.weaponBase.rate.toFixed(2) + "/s · SIZE " + def.weaponBase.size.toFixed(2) : "") +
      "</div>" : "";
  const d = document.createElement("div");
  d.className = "card" + (selected ? " sel" : "") + (owned ? "" : " locked");
  d.style.color = def.color;
  d.innerHTML =
    "<span class='tag'>" + (selected ? "EQUIPPED" : owned ? "OWNED" : def.cost + " ◆") + "</span>" +
    "<span class='glyph'>" + (def.glyph || (kind === "gunskin" ? "⌖" : "◉")) + "</span>" +
    "<div class='nm'>" + def.name + "</div>" +
    "<div class='ds'>" + def.desc + (owned || selected ? "" : "<br><b style='color:var(--gold)'>" + def.cost + " SOULS TO UNLOCK</b>") + "</div>" + advancedChar;
  d.addEventListener("click", () => {
    if (!owned) {
      if (Meta.bank < def.cost) { keeperRefuse(d); return; }
      Meta.bank -= def.cost;
      Meta.unlocked[unlockKey] = true;
      keeperSell();
    } else AudioFX.equip();
    if (kind === "char") Meta.char = key;
    else if (kind === "gunskin") Meta.gunSkin = stock ? null : key;
    else Meta.skin = key;
    metaSave();
    renderVault();
  });
  return d;
}
/* a full-width shelf label splitting one tab into sections (BODY / GUN warpaint) */
function vaultSection(label) {
  const h = document.createElement("div");
  h.className = "vsec";
  h.textContent = label;
  return h;
}
/* rerun buffs: a single stackable card — each level adds +1 re-roll to every future run */
const REROLL_BUFF_COST = 4000, REROLL_BUFF_MAX = 10;
function vaultStackCard() {
  const level = Meta.unlocked["buff:rerolls"] || 0;
  const maxed = level >= REROLL_BUFF_MAX;
  const d = document.createElement("div");
  d.className = "card" + (maxed ? " sel" : "");
  d.style.color = "#ffd23d";
  d.innerHTML =
    "<span class='tag'>" + (maxed ? "MAXED" : "LEVEL " + level + " / " + REROLL_BUFF_MAX) + "</span>" +
    "<span class='glyph'>↺</span>" +
    "<div class='nm'>EXTRA RE-ROLLS</div>" +
    "<div class='ds'>+1 re-roll each run per level (you have +" + level + ").</div>" +
    (maxed ? "" : "<div class='ds'><b style='color:var(--gold)'>NEXT: " + REROLL_BUFF_COST + " SOULS</b></div>");
  if (!maxed) d.addEventListener("click", () => {
    if (Meta.bank < REROLL_BUFF_COST) { keeperRefuse(d); return; }
    Meta.bank -= REROLL_BUFF_COST;
    Meta.unlocked["buff:rerolls"] = level + 1;
    keeperSell();
    metaSave();
    renderVault();
  });
  return d;
}

/* pets: buy once, then equip one at a time (click the equipped pet again to remove it) */
function vaultPetCard(key, def) {
  const owned = !!Meta.unlocked["pet:" + key];
  const equipped = Meta.pet === key;
  const d = document.createElement("div");
  d.className = "card" + (equipped ? " sel" : "") + (owned ? "" : " locked");
  d.style.color = def.color;
  d.innerHTML =
    "<span class='tag'>" + (equipped ? "EQUIPPED" : owned ? "OWNED" : def.cost + " ◆") + "</span>" +
    "<span class='glyph'>" + (def.glyph || "◉") + "</span>" +
    "<div class='nm'>" + def.name + "</div>" +
    "<div class='ds'>" + def.desc + (owned ? "" : "<br><b style='color:var(--gold)'>" + def.cost + " SOULS TO UNLOCK</b>") + "</div>";
  d.addEventListener("click", () => {
    if (!owned) {
      if (Meta.bank < def.cost) { keeperRefuse(d); return; }
      Meta.bank -= def.cost;
      Meta.unlocked["pet:" + key] = true;
      Meta.pet = key;                       // equip on purchase
      keeperSell();
    } else {
      AudioFX.equip();
      Meta.pet = equipped ? null : key;     // toggle the equipped pet off, or equip this one
    }
    metaSave();
    renderVault();
  });
  return d;
}

/* pet upgrade card — stacking (LVL n/max) or one-time (OWNED). Shown under an owned pet. */
function vaultPetUpgradeCard(petType, key, upg) {
  const idKey = "petbuff:" + petType + ":" + key;
  const level = Meta.unlocked[idKey] || 0;
  const once = !!upg.once;
  const maxed = once ? level > 0 : level >= upg.max;
  const d = document.createElement("div");
  d.className = "card upg" + (maxed ? " sel" : "");
  d.style.color = PTYPES[petType].color;
  const tag = once ? (maxed ? "OWNED" : upg.cost + " ◆") : (maxed ? "MAXED" : "LVL " + level + " / " + upg.max);
  d.innerHTML =
    "<span class='tag'>" + tag + "</span>" +
    "<span class='glyph'>" + (upg.glyph || "+") + "</span>" +
    "<div class='nm'>" + upg.name + "</div>" +
    "<div class='ds'>" + upg.desc + "</div>" +
    (maxed ? "" : "<div class='ds'><b style='color:var(--gold)'>" + (once ? upg.cost + " SOULS" : "NEXT: " + upg.cost + " SOULS") + "</b></div>");
  if (!maxed) d.addEventListener("click", () => {
    if (Meta.bank < upg.cost) { keeperRefuse(d); return; }
    Meta.bank -= upg.cost;
    Meta.unlocked[idKey] = level + 1;
    keeperSell();
    metaSave();
    renderVault();
  });
  return d;
}

/* ---------- the Vault Keeper (unlocked by freeing him from the Warden's chains) ---------- */
function keeperUnlocked() { return !!Meta.unlocked["npc:keeper"]; }

/* ---------- the Keeper as shopkeep ----------
   Every sale is a purchase from HIM. He speaks the way the rift creature speaks —
   italic light hanging in the dark beside him, no box — but in runes (borrowed from
   the carve-able set; he is understood, never read), one word at a time, each word
   landing with its own chime-cluster (AudioFX.keeperWord). The coffer itself reacts
   in drawKeeperPanel. */
const KEEPER_WORD_MS = 270;                  // the cadence of his speech
let _keeperSayT = [], _keeperMood = null;    // mood: {kind:"sell"|"deny"|"greet"|"chat", t0, dur}
function keeperWords(kind) {
  const n = kind === "deny" ? 2                              // a short bark
    : kind === "chat" ? 2 + Math.floor(rnd(3))         // 2–4 words of small talk
      : 2 + Math.floor(rnd(2));
  const out = [];
  for (let w = 0; w < n; w++) {
    let word = "";
    const len = 2 + Math.floor(rnd(3));                      // 2–4 runes per word
    for (let i = 0; i < len; i++) word += RUNES[pick(RUNE_IDS)].glyph;
    out.push(word);
  }
  return out;
}
function keeperSpeak(kind, gloss) {
  const el = $("keeperSpeech"); if (!el || !keeperUnlocked()) return;
  _keeperSayT.forEach(clearTimeout); _keeperSayT = [];       // he never talks over himself
  const words = keeperWords(kind);
  el.classList.toggle("deny", kind === "deny");
  el.textContent = "";
  el.classList.add("on");
  _keeperMood = {
    kind, t0: performance.now(),
    dur: kind === "deny" ? 700 : words.length * KEEPER_WORD_MS + 500
  };
  words.forEach((w, i) => _keeperSayT.push(setTimeout(() => {
    el.insertAdjacentText("beforeend", (i ? " " : "") + w);
    AudioFX.keeperWord(w.length, kind, i);
  }, i * KEEPER_WORD_MS)));
  const done = words.length * KEEPER_WORD_MS;
  if (gloss) _keeperSayT.push(setTimeout(() =>
    el.insertAdjacentHTML("beforeend", "<small>" + gloss + "</small>"), done));
  _keeperSayT.push(setTimeout(() => el.classList.remove("on"), done + 2200));
}
function keeperSell() { AudioFX.pickup(); keeperSpeak("sell"); }
/* the refused card itself shakes red — the "no" must land under the player's finger */
function keeperRefuse(card) {
  keeperSpeak("deny", "NOT ENOUGH BANKED SOULS");
  if (card) {
    card.classList.remove("deny"); void card.offsetWidth;   // retrigger the animation on rapid taps
    card.classList.add("deny");
    setTimeout(() => card.classList.remove("deny"), 450);
  }
}
/* poke the proprietor and he answers — a random string of words, a random string of bells */
$("keeperCanvas").addEventListener("click", () => { if (Game.state === "vault") keeperSpeak("chat"); });

/* the freed Keeper presiding at the top of the vault panel — its own DOM canvas, idle-animated
   while the vault is open (bob + eye-glow pulse). Mirrors the bestiary drawCreatureIcon pattern. */
let _keeperRAF = 0;
function drawKeeperPanel() {
  const cv = $("keeperCanvas"); if (!cv) return;
  /* he fills his quarter of the screen — display size follows the column's width */
  const side = $("vaultKeeper");
  const disp = clamp(Math.floor((side ? side.clientWidth : 150) * 0.78), 84, 236);
  /* DPR capped at 2 to match the game canvas (canvas.js) — a 3× phone was allocating a
     2.25× larger texture than a 2× phone for a figure that is at most 236 CSS px wide. */
  const buf = disp * 2.4, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv._disp !== disp || cv._dpr !== dpr) {                // only re-alloc the buffer on a real resize
    cv._disp = disp; cv._dpr = dpr;
    cv.width = Math.round(buf * dpr); cv.height = Math.round(buf * dpr);
    cv.style.width = disp + "px"; cv.style.height = disp + "px";
  }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, buf, buf);
  const t = performance.now() / 1000, s = buf / 264;         // motion + figure scale with the buffer
  let bob = Math.sin(t * 1.6) * 5, eye = 0.72 + Math.sin(t * 2.2) * 0.28, sway = 0;
  if (_keeperMood) {
    const k = (performance.now() - _keeperMood.t0) / _keeperMood.dur;
    if (k >= 1) _keeperMood = null;
    else if (_keeperMood.kind === "deny") { sway = Math.sin(k * TAU * 2.5) * 4 * (1 - k); eye = 0.2; }  // a head-shake, eyes gone cold
    else { eye = 1; if (_keeperMood.kind !== "greet") bob -= Math.sin(k * Math.PI) * 8; }               // a pleased hop, eyes ablaze
  }
  g.save(); g.translate(buf / 2 + sway * s, buf / 2 + bob * s); g.scale(1.55 * s, 1.55 * s);
  drawVaultKeeper(g, { chained: false, brk: 1, eye, t });
  g.restore();
}
function keeperLoop() {
  if (Game.state !== "vault" || !keeperUnlocked()) { _keeperRAF = 0; return; }
  drawKeeperPanel();
  _keeperRAF = requestAnimationFrame(keeperLoop);
}

/* the shelves — one tab per section; the last-viewed tab is kept for the session */
const VAULT_TABS = ["chars", "skins", "buffs", "pets"];
const VAULT_TAB_BTN = { chars: "vtabChars", skins: "vtabSkins", buffs: "vtabBuffs", pets: "vtabPets" };
let vaultTab = "chars";
function renderVault() {
  const vk = $("vaultKeeper"); if (vk) vk.style.display = keeperUnlocked() ? "" : "none";
  tweenNum($("bankVault"), Meta.bank, 400);   // the purse rolls down as he counts your souls
  VAULT_TABS.forEach(tab => { const b = $(VAULT_TAB_BTN[tab]); if (b) b.classList.toggle("on", vaultTab === tab); });
  const grid = $("vaultGrid"); grid.innerHTML = "";
  if (vaultTab === "chars") for (const k in CHARS) {
    /* hidden wardens stay out of the shelves unless the easter-egg toggle is on
       (or one is already equipped, so the player isn't stranded on an invisible pick) */
    if (CHARS[k].hidden && !Meta.showHiddenRunes && Meta.char !== k) continue;
    grid.appendChild(vaultCard(k, CHARS[k], "char"));
  }
  else if (vaultTab === "skins") {
    /* one palette, two places to wear it: every colour is bought once ("skin:<key>")
       and equips independently to the body and to the gun */
    grid.appendChild(vaultSection("BODY WARPAINT"));
    for (const k in SKINS) grid.appendChild(vaultCard(k, SKINS[k], "skin"));
    grid.appendChild(vaultSection("GUN WARPAINT — the same paints, bought once, worn on either"));
    grid.appendChild(vaultCard("none", GUN_STOCK, "gunskin"));
    for (const k in SKINS) grid.appendChild(vaultCard(k, SKINS[k], "gunskin"));
  }
  else if (vaultTab === "buffs") grid.appendChild(vaultStackCard());
  else for (const k in PTYPES) {
    grid.appendChild(vaultPetCard(k, PTYPES[k]));
    /* an owned pet reveals its upgrade cards right beneath it */
    if (Meta.unlocked["pet:" + k] && PTYPES[k].upgrades)
      for (const u in PTYPES[k].upgrades) grid.appendChild(vaultPetUpgradeCard(k, u, PTYPES[k].upgrades[u]));
  }
}
function vaultShowTab(tab) { vaultTab = tab; renderVault(); }
VAULT_TABS.forEach(tab => $(VAULT_TAB_BTN[tab]).addEventListener("click", () => vaultShowTab(tab)));
function openVault() {
  if (!keeperUnlocked()) return;                 // the Vault stays sealed until the Keeper is freed
  if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("VAULT", "opened");
  renderVault(); setState("vault");
  keeperSpeak("greet");                           // the proprietor stirs as you enter
  if (!_keeperRAF) keeperLoop();                  // draw immediately, then self-schedule
}
function closeVault() {
  if (_keeperRAF) { cancelAnimationFrame(_keeperRAF); _keeperRAF = 0; }
  _keeperSayT.forEach(clearTimeout); _keeperSayT = [];   // his voice doesn't follow you out
  refreshMenu(); setState("menu");
  if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("VAULT", "closed");
}
$("btnVault").addEventListener("click", openVault);
$("vaultClose").addEventListener("click", closeVault);

/* ---------- the glossary: a record of every beast slain and rune carved ---------- */
/* a small static portrait of one creature, drawn with the REAL in-game art.
   It renders into a big buffer then CSS-downscales, so the creature's colour-glow
   softens proportionally instead of swamping a tiny icon. */
function drawCreatureIcon(cv, entry) {
  /* DPR capped at 2 to match the game canvas (canvas.js). A 3× phone was allocating a
     480×480 buffer per portrait — nineteen of them, ~17MB of texture — to show 60 CSS px.
     Capped it is 320×320, still ~1.8× supersampled at the display size, so nothing softens.
     Note `buf` stays 160: it is the logical unit the figure is laid out in, and shadowBlur
     is NOT scaled by the transform, so changing it would resize every glow relative to
     the creature — the exact swamping this render-big-then-downscale exists to avoid. */
  const disp = 60, buf = 160, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(buf * dpr);
  /* Portraits are cached and re-shown across glossary opens (see bestiaryCard). The pose is
     pinned by renderGlossary (Game.time = 0.7), so a redraw is byte-identical — skip it. */
  if (cv.width === px && cv._drawn) return;
  if (cv.width !== px) { cv.width = px; cv.height = px; }
  cv.style.width = disp + "px"; cv.style.height = disp + "px";
  /* willReadFrequently puts these on a CPU-backed surface. They are drawn once and never
     animated, so they have no business holding GPU textures — which keeps them entirely
     out of the WebView raster path that the Adreno driver crash came from. */
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, buf, buf);
  const isBoss = entry.tier === "boss";
  /* OMEN cards borrow another creature's body to hang a halo on (entry.art), so the
     figure drawn is not necessarily the entry's own key. */
  const art = entry.art || entry.key;
  const kind = isBoss ? Number(entry.key.slice(5)) : -1;
  const r = isBoss ? [38, 46, 54, 48, 46, 44, 40, 30][kind] || 44 : (ETYPES[art] ? ETYPES[art].r : 14);
  const e = {
    type: isBoss ? "boss" : art, kind, boss: isBoss, r, color: entry.artColor || entry.color,
    hitFlash: 0, phase: 1, atk: "idle", airborne: false, aura: false, shielded: false,
    feasting: false, stored: 0, spin: 0, bob: 0, vx: 0, vy: 0, pt: 0, airT: 0, hp: 1, maxHp: 1,
    submerged: false
  };
  /* A marked portrait reserves room for the widest halo the arena can draw (the outer
     red ring of BOTH, r+15, plus its spikes and breath) — and reserves the SAME room
     for a single ring, so gold on one card sits at the radius gold sits at on another. */
  const extent = entry.mark ? r + 22 : (isBoss ? r * 2.0 : r * 1.7);
  const s = (buf * 0.46) / extent;
  g.save(); g.translate(buf / 2, buf / 2); g.scale(s, s);
  /* haloes first, then the body over them — the arena's own order (draw.js);
     "both" is the gold+red pair, every other mark is a single ring at the shared radius */
  if (entry.mark === "both") {
    drawHaloMark(g, "buffed", r + 7, Game.time);
    drawHaloMark(g, "wrath", r + 7 + HALO_GAP, Game.time);
  } else if (entry.mark) {
    drawHaloMark(g, entry.mark, r + 7, Game.time);
  }
  drawCreatureBody(g, e, 0);
  g.restore();
  cv._drawn = true;
}

/* ---------- THE VAULT KEEPER figure — a "chained coffer" ----------
   An iron strongbox bound in the Chained Warden's chains. Reused by the vault panel (freed)
   and the unchaining cutscene (chained → snapping). Draws centred on the current origin;
   the caller sets translate/scale (cf. drawCreatureBody). All canvas primitives, house style.
   opts: { chained:bool, brk:0..1 chain-break progress, eye:0..1 eye-glow, t:seconds } */
function kRoundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/* a run of Warden chain-links (arc links joined by segments); as brk→1 the links scatter + fade */
function drawKeeperChain(g, x1, y1, x2, y2, brk, seed) {
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    let lx = x1 + (x2 - x1) * f, ly = y1 + (y2 - y1) * f;
    if (brk > 0) {
      const ang = seed * 1.7 + i * 2.399;                 // stable per-link scatter direction
      const fly = brk * brk * (13 + (i % 3) * 7);
      lx += Math.cos(ang) * fly; ly += Math.sin(ang) * fly + brk * brk * 9;   // + a little gravity
    }
    g.globalAlpha = 1 - brk;
    g.beginPath(); g.arc(lx, ly, 2.5, 0, TAU); g.stroke();
    if (i > 0 && brk < 0.32) {                            // connective segments only while intact
      const pf = (i - 1) / n, pxl = x1 + (x2 - x1) * pf, pyl = y1 + (y2 - y1) * pf;
      g.beginPath(); g.moveTo(pxl, pyl); g.lineTo(lx, ly); g.stroke();
    }
  }
  g.globalAlpha = 1;
}
function drawVaultKeeper(g, opts) {
  opts = opts || {};
  const chained = !!opts.chained, brk = clamp(opts.brk || 0, 0, 1);
  const eye = opts.eye == null ? 1 : clamp(opts.eye, 0, 1);
  const t = opts.t || 0;
  const IRON = "#8a86a0", BAND = "#5a5e6b", RIVET = "#c9cdd8", DARK = "#0b0b14";
  const GOLD = "#ffd23d", CHAIN = "#9d6bff";
  const w = 62, h = 76, r = 11;

  g.save();
  /* body — a soft gold halo that brightens as he wakes */
  g.shadowColor = GOLD; g.shadowBlur = 7 + eye * 19;
  g.fillStyle = IRON; kRoundRect(g, -w / 2, -h / 2, w, h, r); g.fill();
  g.shadowBlur = 0;

  /* lid seam + lower iron band, with rivets */
  g.fillStyle = BAND;
  g.fillRect(-w / 2, -h * 0.20, w, 6);
  g.fillRect(-w / 2, h * 0.20, w, 7);
  g.fillStyle = RIVET;
  for (const rx of [-w / 2 + 6, w / 2 - 6]) for (const ry of [-h * 0.20 + 3, h * 0.20 + 3.5]) { g.beginPath(); g.arc(rx, ry, 2, 0, TAU); g.fill(); }

  /* eye slot — a deep near-black recess the eyes peer out from */
  g.fillStyle = "#06040a"; g.fillRect(-w / 2 + 7, -h * 0.08, w - 14, 15);
  const ey = -h * 0.08 + 8;
  /* two ominous pale eyes with a gold glow, slowly pulsing — echoing the rift creature in the
     secret room. Pale (#fff3c8) so they read distinct from the gold padlock below. */
  const eyePulse = 0.6 + 0.4 * Math.sin(t * 3);
  g.fillStyle = "#fff3c8"; g.shadowColor = "#ffd23d"; g.shadowBlur = (7 + eye * 13) * eyePulse;
  g.globalAlpha = (0.22 + eye * 0.78) * eyePulse;
  for (const ex of [-11, 11]) { g.beginPath(); g.arc(ex, ey, 4.5, 0, TAU); g.fill(); }
  g.globalAlpha = 1; g.shadowBlur = 0;
  g.fillStyle = IRON;                                    // lids drop over the eyes when bound
  g.fillRect(-w / 2 + 7, -h * 0.08, w - 14, 5 - eye * 4);

  /* central padlock + keyhole */
  g.strokeStyle = GOLD; g.lineWidth = 3.5; g.shadowColor = GOLD; g.shadowBlur = 5 + eye * 8;
  g.beginPath(); g.arc(0, h * 0.02, 8, Math.PI, 0); g.stroke();     // shackle
  g.shadowBlur = 0; g.fillStyle = GOLD; kRoundRect(g, -9, h * 0.02, 18, 16, 3); g.fill();
  g.fillStyle = DARK;
  g.beginPath(); g.arc(0, h * 0.02 + 7, 2.6, 0, TAU); g.fill();
  g.fillRect(-1.3, h * 0.02 + 7, 2.6, 6);

  /* the Warden's binding chains — taut when bound, snapping and scattering as brk rises */
  if (chained) {
    g.strokeStyle = CHAIN; g.lineWidth = 2;
    g.shadowColor = CHAIN; g.shadowBlur = 6;
    drawKeeperChain(g, -w * 0.62, -h * 0.52, w * 0.62, h * 0.44, brk, 0);
    drawKeeperChain(g, w * 0.62, -h * 0.52, -w * 0.62, h * 0.44, brk, 3);
    g.shadowBlur = 0;
  }
  g.restore();
}

/* One portrait canvas per creature, kept for the life of the page.
   renderGlossary wipes its grids with innerHTML = "" on every open, so a fresh
   canvas per card meant nineteen new backing buffers each time the glossary was
   opened — piling up generations faster than GC reclaimed them. appendChild MOVES
   an existing node, so re-showing the cached one is all that is needed. */
const _creatureIcons = {};   // entry.key -> its one <canvas>
function bestiaryCard(entry) {
  const slain = !!Meta.slain[entry.key];
  const d = document.createElement("div");
  d.className = "card" + (slain ? "" : " locked");
  d.style.cursor = "default";
  if (slain) {
    d.style.color = entry.color;
    let cv = _creatureIcons[entry.key];
    if (!cv) {
      cv = _creatureIcons[entry.key] = document.createElement("canvas");
      cv.className = "creature-icon";
    }
    d.appendChild(cv);
    const info = document.createElement("div");
    info.innerHTML =
      "<span class='tag'>SLAIN</span>" +
      "<div class='nm'>" + entry.name + "</div>" +
      (entry.floor ? "<div class='ds' style='padding-top:2px;color:" + entry.color + "'>" + entry.floor + "</div>" : "") +
      "<div class='ds'>" + entry.desc + "</div>";
    d.appendChild(info);
    drawCreatureIcon(cv, entry);
  } else {
    d.style.color = "#3a3850";
    d.innerHTML =
      "<span class='glyph'>?</span>" +
      "<div class='nm' style='color:var(--dim)'>— UNKNOWN —</div>" +
      "<div class='ds'>Not yet slain. Put it down once and its lore is recorded here.</div>";
  }
  return d;
}

/* An omen card — the halo itself, drawn with the arena's own call over a REVENANT so
   the ring is recognised on sight. Never locked: a player who has not yet met one of
   these is precisely the player who needs to read it. */
function omenCard(o) {
  const d = document.createElement("div");
  d.className = "card";
  d.style.cursor = "default";
  d.style.color = o.color;
  let cv = _creatureIcons[o.key];
  if (!cv) {
    cv = _creatureIcons[o.key] = document.createElement("canvas");
    cv.className = "creature-icon";
  }
  d.appendChild(cv);
  const info = document.createElement("div");
  info.innerHTML =
    "<span class='tag'>OMEN</span>" +
    "<div class='nm'>" + o.name + "</div>" +
    "<div class='ds' style='padding-top:2px;color:" + o.color + "'>" + o.ring + "</div>" +
    "<div class='ds'>" + o.desc + "</div>";
  d.appendChild(info);
  drawCreatureIcon(cv, o);
  return d;
}

function runeCard(id) {
  const R = RUNES[id], seen = !!Meta.runesSeen[id];
  const d = document.createElement("div");
  d.className = "card" + (seen ? "" : " locked");
  d.style.cursor = "default";
  if (seen) {
    d.style.color = R.color;
    d.innerHTML =
      "<span class='tag'>CARVED</span>" +
      "<span class='glyph'>" + R.glyph + "</span>" +
      "<div class='nm'>" + R.name + "</div>" +
      "<div class='ds'>" + R.desc + "</div>";
  } else {
    d.style.color = "#3a3850";
    d.innerHTML =
      "<span class='glyph'>?</span>" +
      "<div class='nm' style='color:var(--dim)'>— UNKNOWN —</div>" +
      "<div class='ds'>Not yet carved. Collect this rune in a descent to record it.</div>";
  }
  return d;
}

function renderGlossary() {
  const savedTime = Game.time; Game.time = 0.7;   // a calm, consistent pose for every portrait
  const og = $("bestOmenGrid"); og.innerHTML = "";
  OMENS.forEach(o => og.appendChild(omenCard(o)));
  const eg = $("bestEnemyGrid"); eg.innerHTML = "";
  BESTIARY.filter(b => b.tier === "enemy").forEach(b => eg.appendChild(bestiaryCard(b)));
  const bg = $("bestBossGrid"); bg.innerHTML = "";
  BESTIARY.filter(b => b.tier === "boss").forEach(b => bg.appendChild(bestiaryCard(b)));
  Game.time = savedTime;
  const rg = $("glossRuneGrid"); rg.innerHTML = "";
  RUNE_IDS.forEach(id => rg.appendChild(runeCard(id)));
  const bFound = BESTIARY.filter(b => Meta.slain[b.key]).length;
  const rFound = RUNE_IDS.filter(id => Meta.runesSeen[id]).length;
  $("glossProgress").textContent =
    "BESTIARY " + bFound + "/" + BESTIARY.length + " · RUNES " + rFound + "/" + RUNE_IDS.length;
}
function glossShowPage(page) {
  const onBest = page !== "runes";
  $("glossPageBestiary").style.display = onBest ? "" : "none";
  $("glossPageRunes").style.display = onBest ? "none" : "";
  $("tabBestiary").classList.toggle("on", onBest);
  $("tabRunes").classList.toggle("on", !onBest);
}
function openGlossary() { renderGlossary(); glossShowPage("bestiary"); setState("glossary"); }
function closeGlossary() { refreshMenu(); setState("menu"); }
$("btnGlossary").addEventListener("click", openGlossary);
$("glossaryClose").addEventListener("click", closeGlossary);
$("tabBestiary").addEventListener("click", () => glossShowPage("bestiary"));
$("tabRunes").addEventListener("click", () => glossShowPage("runes"));

/* ---------- the reckoning: custom in-game leaderboard ---------- */
let lbTab = "global", lbMode = "normal";   // scope (global|nearby) × mode (normal|hard|chaos)

/* "gunsmith" → "GUNSMITH"; anything unknown is shown as-is (a row may carry a
   character from a newer build than this one). */
function lbCharName(id) {
  if (!id) return "";
  return (typeof CHARS !== "undefined" && CHARS[id] && CHARS[id].name) ? CHARS[id].name : String(id).toUpperCase();
}
/* "warp,hex" → "ᚥ ᛜ". A rune this build doesn't know becomes its raw id, so a
   row never renders as blank glyph soup. */
function lbRuneGlyphs(csv) {
  if (!csv) return "";
  return csv.split(",").slice(0, 8).map(id => {
    const R = (typeof RUNES !== "undefined") ? RUNES[id] : null;
    return R && R.glyph ? R.glyph : id;
  }).join(" ");
}

/* Build a row with textContent (NOT innerHTML) — player display names come from
   arbitrary players, so they must never be injected as markup. `pending` marks
   the simulated not-yet-tallied row (dashed pulse; rank renders as "≈N"). */
function lbRow(entry, me, pending) {
  const d = document.createElement("div");
  d.className = "lb-row" + (me ? " me" : "") + (pending ? " pending" : "");
  
  const rank = document.createElement("span"); 
  rank.className = "lb-rank"; 
  rank.textContent = entry.rank || "—";
  
  const rowName = entry.displayName || entry.name || "WARDEN";
  const name = document.createElement("span"); 
  name.className = "lb-name"; 
  name.textContent = rowName + (me ? " · YOU" : "");

  /* Loadout details (character, runes, challenge) */
  const who = lbCharName(entry.char), runes = lbRuneGlyphs(entry.runes);
  const chal = (typeof challengeName === "function") ? challengeName(entry.challenge) : "";
  
  if (who || runes || chal) {
    const sub = document.createElement("small");
    sub.textContent = [who, runes, chal].filter(Boolean).join(" · ");
    name.appendChild(sub);
  }

  /* Place indicator (github / vscode live server) displayed right below the name/loadout */
  if (entry.place) {
    const placeSub = document.createElement("small");
    placeSub.className = "lb-place-sub";
    placeSub.textContent = entry.place.toUpperCase();
    placeSub.style.display = "block";
    placeSub.style.opacity = "0.6";
    placeSub.style.fontSize = "0.8em";
    name.appendChild(placeSub);
  }

  const score = document.createElement("span"); 
  score.className = "lb-score"; 
  score.textContent = entry.displayScore || entry.score;
  
  d.append(rank, name, score);
  return d;
}

/* The simulated pending row: the local best at its projected position, with the
   loadout the local record was set with. */
function lbSimRow(rank, best, tag) {
  const host = typeof window !== "undefined" && window.location ? window.location.hostname : "";
  const currentPlace = host.includes("github.io") ? "github" : "live server";

  return lbRow({ 
    rank, 
    displayName: Leaderboard.myDisplayName?.() || Leaderboard.myName() || "WARDEN",
    name: Leaderboard.myName() || "—", 
    score: best.toLocaleString(),
    place: currentPlace, // <--- This passes the place property into lbRow!
    char: tag && tag.char, 
    runes: tag && tag.runes, 
    challenge: tag && tag.challenge 
  }, true, true);
}
function lbHint(list, text) {
  const h = document.createElement("div");
  h.className = "lb-hint";
  h.textContent = text;
  list.appendChild(h);
}
const LB_HINT_PENDING = "≈ FORETOLD — THE VOID HAS YET TO TALLY YOUR LATEST OFFERING";
/* The score IS recorded server-side, but the player's Play Games profile keeps
   it invisible to everyone (Google only lists players who share their gameplay
   publicly). Only the player can fix it, so the hint must teach the exact path. */
const LB_HINT_HIDDEN = "YOUR SCORE IS RECORDED, YET A VEIL HIDES IT FROM OTHER PLAYERS — " +
  "PLAY GAMES APP › SETTINGS › PROFILE VISIBILITY › EVERYONE";

async function renderLeaderboard() {
  const list = $("lbList");
  const tab = lbTab, mode = lbMode;                    // pin the view this request is for
  list.innerHTML = "<div class='lb-empty'>CONSULTING THE VOID…</div>";
  const best = Leaderboard.localBest(mode);   // local data, read at render time — keyed by the overlay's own mode toggle
  const tag = Leaderboard.tagFor(mode);
  /* Fired alongside the entries fetch (never rejects, resolves false unless the
     score is provably recorded yet absent from the public view for good) so the
     pending hints below can say WHY the row still isn't on the board. */
  const hiddenReq = best > 0 ? Leaderboard.isLikelyHidden({ mode }) : Promise.resolve(false);
  const res = (tab === "nearby")
    ? await Leaderboard.getNearbyScores({ maxResults: 25, mode })
    : await Leaderboard.getTopScores({ maxResults: 25, mode });
  if (Game.state !== "leaderboard" || lbTab !== tab || lbMode !== mode) return;   // closed or switched view mid-await
  if (!res.ok) { list.innerHTML = "<div class='lb-empty'>THE VOID DOES NOT ANSWER</div>"; return; }
  const hintPending = (await hiddenReq) ? LB_HINT_HIDDEN : LB_HINT_PENDING;
  if (Game.state !== "leaderboard" || lbTab !== tab || lbMode !== mode) return;   // re-check across the second await

  /* An empty player-centered window is NOT proof of an empty board — a player
     whose first score hasn't been tallied yet has no ranked row to center on
     (exactly the lag this simulation covers). The top page can still place them. */
  if (tab === "nearby" && !res.entries.length && best > 0) {
    const top = await Leaderboard.getTopScores({ maxResults: 25, mode });
    if (Game.state !== "leaderboard" || lbTab !== tab || lbMode !== mode) return;
    list.innerHTML = "";
    if (top.ok) {
      const p = Leaderboard.computeProjection(top.entries, best);
      if (p.kind === "caughtUp") {   // per-query caches drift: top already shows me
        const mine = top.entries.find(Leaderboard.isMine);
        if (mine) { list.appendChild(lbRow(mine, true)); return; }
      }
      list.appendChild(lbSimRow(p.kind === "insert" ? "≈" + p.rank : "…", best, tag));
    } else {
      list.appendChild(lbSimRow("…", best, tag));   // score pending, rank unknowable right now
    }
    lbHint(list, hintPending);
    return;
  }

  const proj = Leaderboard.computeProjection(res.entries, best);
  list.innerHTML = "";
  if (!res.entries.length && proj.kind !== "insert") {
    list.innerHTML = "<div class='lb-empty'>" +
      (mode === "chaos" ? "NO CHAOS RECORDED YET" : "NO SOULS RECORDED YET") + "</div>";
    return;
  }
  /* proj.rest = server rows with my stale row filtered out when a simulation is
     active (never a duplicate YOU); the plain full window otherwise. Server rows
     keep their server ranks — only the injected row is approximate. */
  proj.rest.forEach(e => list.appendChild(lbRow(e, Leaderboard.isMine(e))));
  if (proj.kind === "insert") {
    list.insertBefore(lbSimRow("≈" + proj.rank, best, tag), list.children[proj.index] || null);
    lbHint(list, hintPENDING);
  } else if (proj.kind === "beyond") {
    /* veiled beats "see around you" — a veiled player is unranked in the public
       collection, so the around-you tab would only show the same simulation */
    lbHint(list, hintPending === LB_HINT_HIDDEN ? LB_HINT_HIDDEN
      : tab === "global" ? "YOUR RECKONING PENDS BEYOND THE TOP 25 — SEE AROUND YOU"
        : LB_HINT_PENDING);
  }
}

/* repaint the scope + mode buttons (and the mode's skin), then refetch */
function lbSync() {
  const mode = lbMode;
  /* Play Games has no CHAOS board, so the tab only exists where it can pay off */
  const chaosTab = $("lbModeChaos");
  if (chaosTab) chaosTab.style.display = Leaderboard.modeSupported("chaos") ? "" : "none";
  $("lbTabGlobal").classList.toggle("on", lbTab === "global");
  $("lbTabNearby").classList.toggle("on", lbTab === "nearby");
  $("lbModeNormal").classList.toggle("on", mode === "normal");
  $("lbModeHard").classList.toggle("on", mode === "hard");
  if (chaosTab) chaosTab.classList.toggle("on", mode === "chaos");
  const list = $("lbList");
  list.classList.toggle("hard", mode === "hard");
  list.classList.toggle("chaos", mode === "chaos");
  const sub = $("lbSubtitle");
  sub.textContent = (mode === "hard" ? "HARD · " : mode === "chaos" ? "CHAOS · " : "") +
    (lbTab === "nearby" ? "AROUND YOU" : "GLOBAL TOP");
  /* beats the inline gold style in the markup */
  sub.style.color = mode === "hard" ? "var(--blood)" : mode === "chaos" ? CHAOS_COLOR : "var(--gold)";
  renderLeaderboard();
}
function lbShowTab(tab) { lbTab = (tab === "nearby") ? "nearby" : "global"; lbSync(); }
function lbShowMode(m) { lbMode = (m === "hard" || m === "chaos") ? m : "normal"; lbSync(); }

function openLeaderboard() {
  if (!Leaderboard.available()) { Leaderboard.show(); return; }   // safety fallback (button is hidden when unavailable)
  /* Google's own overlay only exists on the native build. The Firebase board
     renders completely inside THE RECKONING, so this button would be a dead
     end there — hide it instead of leaving a tap that does nothing. */
  const nv = $("lbNativeView");
  if (nv) nv.style.display = Leaderboard.nativeUI() ? "" : "none";
  setState("leaderboard");
  lbTab = "global"; lbMode = "normal";    // always land on the normal global view
  lbSync();
}
function closeLeaderboard() { refreshMenu(); setState("menu"); }

$("lbTabGlobal").addEventListener("click", () => lbShowTab("global"));
$("lbTabNearby").addEventListener("click", () => lbShowTab("nearby"));
$("lbModeNormal").addEventListener("click", () => lbShowMode("normal"));
$("lbModeHard").addEventListener("click", () => lbShowMode("hard"));
$("lbModeChaos").addEventListener("click", () => lbShowMode("chaos"));
$("lbNativeView").addEventListener("click", () => Leaderboard.show({ mode: lbMode }));
$("leaderboardClose").addEventListener("click", closeLeaderboard);

/* Run-end projected-rank line (death + ascend screens; ending.js calls this at
   runtime like it already calls bankSouls). Fire-and-forget right after
   submitRun — the screen never waits on it: the line pops in on success and
   stays hidden on any failure. The monotonic token guards retry loops, where a
   slow response could land while Game.state is "dead" again for a NEW run
   (possibly in the other mode) — the state check alone can't catch that. */
let runEndRankReq = 0;
async function fillRunRankLine(elId, wantState) {
  const el = $(elId);
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
  if (!Leaderboard.available() || Game.devRun) return;
  const req = ++runEndRankReq;
  /* pinned before the await — state may move on. CHAOS keeps its mode here
     too: it now owns a board of its own on the shared online board. */
  const mode = Game.chaosMode ? "chaos" : Game.hardMode ? "hard" : "normal";
  const r = await Leaderboard.getProjectedRank({ mode });
  if (req !== runEndRankReq || Game.state !== wantState || !r) return;
  const prefix = mode === "hard" ? "HARD · " : mode === "chaos" ? "CHAOS · " : "";
  el.textContent =
    r.hidden ? prefix + "SCORE RECORDED — HIDDEN BY YOUR PLAY GAMES PRIVACY"   // full how-to lives in THE RECKONING
      : r.beyond25 ? prefix + "THE VOID STILL TALLIES YOUR RANK"
        : r.settled ? prefix + "GLOBAL RANK #" + r.rank            // exact — it's the server's own row
          : prefix + "GLOBAL RANK ≈ #" + r.rank + (r.orBetter ? " OR BETTER" : "");
  el.style.display = "";
}

/* ---------- control scheme (mobile): twin-stick vs one-stick auto-aim ---------- */
function applyAimMode() {
  const auto = Meta.aimMode === "auto";
  document.body.classList.toggle("autoaim", auto);
  const label = "CONTROLS: " + (auto ? "AUTO-AIM" : "TWIN-STICK");
  const note = auto
    ? "one thumb — left moves, gun aims & fires itself"
    : "two thumbs — left moves, right aims & fires";
  { const el = $("btnAimModeSettings"); if (el) el.textContent = label; }
  { const el = $("aimModeNoteSettings"); if (el) el.textContent = note; }
  if (auto) { Input.aiming = false; }      // drop any stale right-stick fire
  else if (player) player.autoFire = false;
}
function toggleAimMode() {
  Meta.aimMode = Meta.aimMode === "auto" ? "twin" : "auto";
  metaSave();
  applyAimMode();
  AudioFX.equip();
}
$("btnAimModeSettings").addEventListener("click", toggleAimMode);

/* ---------- control scheme (desktop): hold-fire vs auto-fire vs auto-aim ---------- */
const DESK_MODES = {
  hold: { label: "HOLD TO FIRE", note: "aim with cursor · hold mouse to fire" },
  cursor: { label: "AUTO-FIRE", note: "aim with cursor · fires on its own" },
  auto: { label: "AUTO-AIM", note: "targets nearest enemy · fires on its own" },
};
const DESK_ORDER = ["hold", "cursor", "auto"];
function applyDeskMode() {
  const m = DESK_MODES[Meta.deskMode] || DESK_MODES.hold;
  const btn = $("btnDeskMode"); if (btn) btn.textContent = m.label;
  const note = $("deskModeNote"); if (note) note.textContent = m.note;
}
function cycleDeskMode() {
  const i = DESK_ORDER.indexOf(Meta.deskMode);
  Meta.deskMode = DESK_ORDER[(i + 1) % DESK_ORDER.length];
  metaSave();
  applyDeskMode();
  if (player) player.autoFire = false;
  AudioFX.equip();
}
$("btnDeskMode").addEventListener("click", cycleDeskMode);

/* ---------- on-screen button size (mobile): small · medium · large ---------- */
const BTN_SIZE_ORDER = ["small", "medium", "large"];
function applyBtnSizeUI() {
  const b = $("btnBtnSize"); if (b) b.textContent = "BUTTON SIZE: " + Meta.btnSize.toUpperCase();
}
function cycleBtnSize() {
  const i = BTN_SIZE_ORDER.indexOf(Meta.btnSize);
  Meta.btnSize = BTN_SIZE_ORDER[(i + 1) % BTN_SIZE_ORDER.length];
  metaSave();
  applyButtonSize();   // resize + re-clamp (input.js)
  applyBtnSizeUI();     // label
  AudioFX.equip();
}
$("btnBtnSize").addEventListener("click", cycleBtnSize);

/* ---------- volume ---------- */
function syncVolumeUI() {
  $("volSettings").value = Math.round(Meta.volume * 100);
}
/* `input` fires continuously under a dragging finger and only moves the live gain;
   `change` fires once when it lifts and is where the save happens. Splitting them
   keeps a drag from writing the whole Meta blob to localStorage ~60 times a second. */
$("volSettings").addEventListener("input", e => AudioFX.setVolume(e.target.value / 100));
$("volSettings").addEventListener("change", metaSave);

/* ---------- text size (the small print: normal · large · huge) ----------
   Browser tab zoom scales the whole page; this setting instead grows only the
   tiny labels (7–11px) and the menu's subtitle/omen, so a zoomed-out or
   high-DPI screen stays readable without inflating titles and big numbers. */
const TEXT_SIZE_ORDER = ["normal", "large", "huge"];
const TEXT_SIZE_SCALE = { normal: 1, large: 1.25, huge: 1.45 };
function textSizeKey() {
  return TEXT_SIZE_SCALE[Meta.textSize] ? Meta.textSize : "large";
}
function applyTextSizeUI() {
  const key = textSizeKey();
  document.documentElement.style.setProperty("--text-scale", String(TEXT_SIZE_SCALE[key]));
  const b = $("btnTextSize");
  if (b) b.textContent = "TEXT SIZE: " + key.toUpperCase();
  /* the title-screen echo: same value, so nobody has to open SETTINGS to find it */
  const m = $("btnMenuTextSize");
  if (m) m.textContent = "TEXT SIZE: " + key.toUpperCase() + " ›";
}
function cycleTextSize() {
  const i = TEXT_SIZE_ORDER.indexOf(textSizeKey());
  Meta.textSize = TEXT_SIZE_ORDER[(i + 1) % TEXT_SIZE_ORDER.length];
  metaSave();
  applyTextSizeUI();
  AudioFX.equip();
}
$("btnTextSize").addEventListener("click", cycleTextSize);
$("btnMenuTextSize").addEventListener("click", cycleTextSize);

/* ---------- haptics (mobile vibration on combat beats) ---------- */
function applyHapticsUI() {
  const b = $("btnHaptics"); if (b) b.textContent = "VIBRATION: " + (Meta.haptics !== false ? "ON" : "OFF");
}
function toggleHaptics() {
  Meta.haptics = Meta.haptics === false;
  metaSave();
  applyHapticsUI();
  if (Meta.haptics) haptic(40);   // taste the setting as it turns on
  AudioFX.equip();
}
$("btnHaptics").addEventListener("click", toggleHaptics);

/* ---------- screen shake (the switch itself is read in draw() and the intro cutscene) ---------- */
function applyShakeUI() {
  const b = $("btnShake"); if (b) b.textContent = "SCREEN SHAKE: " + (Meta.shake !== false ? "ON" : "OFF");
}
function toggleShake() {
  Meta.shake = Meta.shake === false;
  metaSave();
  applyShakeUI();
  AudioFX.equip();
}
$("btnShake").addEventListener("click", toggleShake);

/* ---------- exact numerical readouts ---------- */
function applyAdvancedNumbersUI() {
  const b = $("btnAdvancedNumbers");
  if (b) b.textContent = "ADVANCED NUMBERS: " + (Meta.advancedNumbers ? "ON" : "OFF");
  document.body.classList.toggle("advancedNumbers", !!Meta.advancedNumbers);
}
function toggleAdvancedNumbers() {
  Meta.advancedNumbers = !Meta.advancedNumbers;
  metaSave();
  applyAdvancedNumbersUI();
  if (Game.state === "pause") openPausePanel();
  AudioFX.equip();
}
$("btnAdvancedNumbers").addEventListener("click", toggleAdvancedNumbers);

function applyRuneDescriptionSettingsUI() {
  const show = Meta.showRuneDescriptions !== false;
  const b = $("btnRuneDescriptions");
  if (b) b.textContent = "RUNE DESCRIPTIONS: " + (show ? "ON" : "OFF");
  document.body.classList.toggle("compactRuneCards", !show);
}
function toggleRuneDescriptions() {
  Meta.showRuneDescriptions = Meta.showRuneDescriptions === false;
  metaSave();
  applyRuneDescriptionSettingsUI();
  AudioFX.equip();
}
$("btnRuneDescriptions").addEventListener("click", toggleRuneDescriptions);
applyAdvancedNumbersUI();
applyRuneDescriptionSettingsUI();
applyTextSizeUI();

/* ---------- glow (neon halo budget — the lever itself lives in canvas.js) ----------
   Purely a performance/stability valve for weaker GPUs: "full" is the intended art and
   the default, so nobody who never opens this sees any change. */
const GLOW_MODES = ["full", "half", "off"];
const GLOW_LABEL = { full: "GLOW: FULL", half: "GLOW: SOFT", off: "GLOW: OFF" };
const GLOW_NOTE = {
  full: "the intended look — every halo at full strength",
  half: "halved halos — lighter on older phones",
  off: "no halos at all — the lightest the game draws",
};
function applyGlowUI() {
  const b = $("btnGlow"); if (b) b.textContent = GLOW_LABEL[Meta.glow] || GLOW_LABEL.full;
  const n = $("glowNote"); if (n) n.textContent = GLOW_NOTE[Meta.glow] || GLOW_NOTE.full;
}
function cycleGlow() {
  /* an unrecognised value indexOf's to -1, which lands the cycle back on "full" */
  Meta.glow = GLOW_MODES[(GLOW_MODES.indexOf(Meta.glow) + 1) % GLOW_MODES.length];
  applyGlow();          // takes effect on the very next frame — no reload
  metaSave();
  applyGlowUI();
  AudioFX.equip();
}
$("btnGlow").addEventListener("click", cycleGlow);

/* ---------- kill feedback (the streak juice — the ladder itself lives in juice.js) ----------
   "lite" keeps every INFORMATIONAL element (you can still read your streak and its
   window) and drops every WHOLE-SCREEN one. That single axis happens to be both the
   mobile-GPU axis and the photosensitivity axis. "off" returns the game to exactly
   what it did before the streak existed. */
const JUICE_MODES = ["full", "lite", "off"];
const JUICE_LABEL = { full: "KILL FEEDBACK: FULL", lite: "KILL FEEDBACK: LITE", off: "KILL FEEDBACK: OFF" };
const JUICE_NOTE = {
  full: "streak callouts, soul motes and screen flashes — the intended feel",
  lite: "the streak meter and callouts only — no flashes, no slow-motion",
  off: "no streak feedback beyond the original kill punch",
};
function applyJuiceUI() {
  const b = $("btnJuice"); if (b) b.textContent = JUICE_LABEL[Meta.juice] || JUICE_LABEL.full;
  const n = $("juiceNote"); if (n) n.textContent = JUICE_NOTE[Meta.juice] || JUICE_NOTE.full;
}
function cycleJuice() {
  Meta.juice = JUICE_MODES[(JUICE_MODES.indexOf(Meta.juice) + 1) % JUICE_MODES.length];
  Meta.juiceSet = true;   // an explicit choice outranks the OS reduced-motion default from here on
  document.body.classList.toggle("juiceOff", Meta.juice === "off");
  metaSave();
  applyJuiceUI();
  AudioFX.equip();
}
$("btnJuice").addEventListener("click", cycleJuice);

/* ---------- hidden runes (easter eggs) — off by default, only hidden wardens see them ---------- */
const HIDDEN_RUNES_LABEL = { true: "HIDDEN RUNES: ON", false: "HIDDEN RUNES: OFF" };
function applyHiddenRunesUI() {
  const b = $("btnHiddenRunes"); if (b) b.textContent = HIDDEN_RUNES_LABEL[Meta.showHiddenRunes];
}
function cycleHiddenRunes() {
  Meta.showHiddenRunes = !Meta.showHiddenRunes;
  metaSave();
  applyHiddenRunesUI();
  AudioFX.equip();
}
$("btnHiddenRunes").addEventListener("click", cycleHiddenRunes);

/* ---------- speedrun timer: the HUD clock and its visibility ---------- */
function applyRunTimerUI() {
  const b = $("btnRunTimer"); if (b) b.textContent = "RUN TIMER: " + (Meta.runTimer ? "ON" : "OFF");
  const n = $("runTimerNote");
  if (n) n.textContent = Meta.runTimer
    ? "millisecond run clock · pauses with the game · keeps your fastest clear per warden and mode"
    : "clock hidden — records are still kept while it is off";
  const box = $("runTimer"); if (box) box.classList.toggle("on", !!Meta.runTimer);
  if (typeof RunTimer !== "undefined") RunTimer.paint(true);
}
function cycleRunTimer() {
  Meta.runTimer = !Meta.runTimer;
  metaSave();
  applyRunTimerUI();
  AudioFX.equip();
}
$("btnRunTimer").addEventListener("click", cycleRunTimer);

/* ---------- SPEEDRUN mode: the guaranteed first WARD + the per-mode ledger ---------- */
function fmtSpeedBest(b) {
  return b && b.speedSec > 0 && typeof fmtRunTime === "function" ? fmtRunTime(b.speedSec) : "";
}
function applySpeedrunUI() {
  const b = $("btnSpeedrun");
  if (b) b.textContent = "SPEEDRUN MODE: " + (Meta.speedrun ? "ON" : "OFF");
  const n = $("speedBestsNote");
  if (!n) return;
  const rows = [["NORMAL", Meta.bests], ["HARD", Meta.bestsHard], ["CHAOS", Meta.bestsChaos], ["CLASSIC", Meta.bestsClassic]];
  const parts = rows.filter(r => fmtSpeedBest(r[1])).map(r => r[0] + ": " + fmtSpeedBest(r[1]));
  n.textContent = parts.length ? "RUN BESTS · " + parts.join(" · ") : "RUN BESTS · no completed descent yet";
}
function cycleSpeedrun() {
  Meta.speedrun = !Meta.speedrun;
  metaSave();
  applySpeedrunUI();
  AudioFX.equip();
}
$("btnSpeedrun").addEventListener("click", cycleSpeedrun);

/* ---------- on-screen controls (mobile): scheme · button layout · gestures ---------- */
function applyCtrlSettingsUI() {
  const gestures = Meta.ctrlScheme === "gestures";
  const scheme = $("btnCtrlScheme");
  if (scheme) scheme.textContent = "CONTROLS: " + (gestures ? "TAP GESTURES" : "BUTTONS");
  const bRow = $("touchCtrlRow"), gRow = $("gestureRow");
  if (bRow) bRow.style.display = gestures ? "none" : "flex";
  if (gRow) gRow.style.display = gestures ? "flex" : "none";
  const swap = $("btnGestureSwap");
  if (swap) swap.textContent = Meta.gestureSwap ? "TAP: DASH · 2× SEAL" : "TAP: SEAL · 2× DASH";
}
function toggleCtrlScheme() {
  Meta.ctrlScheme = Meta.ctrlScheme === "gestures" ? "buttons" : "gestures";
  metaSave();
  applyCtrlScheme();
  applyCtrlSettingsUI();
  AudioFX.equip();
}
function toggleGestureSwap() {
  Meta.gestureSwap = !Meta.gestureSwap;
  metaSave();
  applyCtrlSettingsUI();
  AudioFX.equip();
}
$("btnCtrlScheme").addEventListener("click", toggleCtrlScheme);
$("btnGestureSwap").addEventListener("click", toggleGestureSwap);

/* ---------- button-layout editor (drag DASH / SEAL) ---------- */
function openCtrlEdit() {
  document.body.classList.add("editingCtrl");   // force-show buttons before measuring (esp. desktop)
  Meta.btnLayout = Meta.btnLayout
    ? { dash: { ...Meta.btnLayout.dash }, seal: { ...Meta.btnLayout.seal } }
    : defaultButtonRects();
  CtrlEditing = true;
  applyControlLayout();                          // pin buttons to fixed positions, draggable
  $("ctrlEdit").classList.add("on");
}
function closeCtrlEdit(save) {
  CtrlEditing = false;
  document.body.classList.remove("editingCtrl");
  $("ctrlEdit").classList.remove("on");
  if (save) metaSave();                          // Meta.btnLayout already updated live during drag
  applyControlLayout();
}
function resetCtrlLayout() {
  Meta.btnLayout = null;                          // drop custom → stock CSS layout
  applyControlLayout();                           // clears inline styles so flex/stock layout resumes
  Meta.btnLayout = defaultButtonRects();          // measure the TRUE stock rects (getBoundingClientRect flushes reflow)
  applyControlLayout();                           // re-pin as fixed positions, still draggable
}
$("btnCustomizeCtrl").addEventListener("click", openCtrlEdit);
$("ctrlEditDone").addEventListener("click", () => closeCtrlEdit(true));
$("ctrlEditReset").addEventListener("click", resetCtrlLayout);

/* ---------- settings overlay ---------- */
function openSettings() { if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("UI", "settings opened"); syncVolumeUI(); applyDeskMode(); applyAimMode(); applyBtnSizeUI(); applyCtrlSettingsUI(); applyHapticsUI(); applyShakeUI(); applyAdvancedNumbersUI(); applyRuneDescriptionSettingsUI(); applyTextSizeUI(); applyGlowUI(); applyJuiceUI(); applyHiddenRunesUI(); applyRunTimerUI(); applySpeedrunUI(); syncPrivacyOptions(); $("btnReplayCutscene").style.display = (Game.state === "menu") ? "" : "none"; $("settings").classList.add("on"); }
function closeSettings() { $("settings").classList.remove("on"); if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("UI", "settings closed"); }
/* Google requires EEA/UK players to have a persistent way back to the consent
   choice. UMP tells us who needs one; everyone else never sees the button. */
function syncPrivacyOptions() {
  $("btnPrivacyOptions").style.display = Consent.privacyOptionsRequired() ? "" : "none";
}
$("btnPrivacyOptions").addEventListener("click", () => {
  Consent.showPrivacyOptions().then(() => {
    syncPrivacyOptions();
    /* They may have just GRANTED consent after declining at launch. Ads.init() is
       retryable and no-ops once initialized, so this brings the SDK up now instead
       of leaving them ad-free until they restart the app. Withdrawal needs nothing
       here: UMP rewrites the stored consent signal, and the ad SDK serves every
       later request under it. */
    Ads.init();
  });
});
$("btnSettings").addEventListener("click", openSettings);
$("btnSettingsPause").addEventListener("click", openSettings);
$("settingsClose").addEventListener("click", closeSettings);
$("btnHowToPlay").addEventListener("click", () => {          // replay the walkthrough, return where we came from
  const ret = Game.state;   // captured before setState: "menu" from the title, "pause" if opened mid-run
  closeSettings();
  startTutorial(ret === "cutscene" || ret === "tutorial" ? "menu" : ret);
});
$("btnReplayCutscene").addEventListener("click", () => {     // replay the full opening (fall + monologue), menu-only
  closeSettings();
  startCutscene("menu");    // on finish, endCutscene returns to the menu instead of starting a run
});
$("btnLeaderboard").addEventListener("click", openLeaderboard);

/* ---------- menu / death ---------- */
function refreshMenu() {
  $("bankMenu").textContent = Meta.bank;
  /* the Vault stays sealed in the Warden's chains until the Keeper is freed (see cutscene-vault.js) */
  const keeper = keeperUnlocked(), bv = $("btnVault"), note = $("vaultLockNote");
  if (bv) { bv.disabled = !keeper; bv.textContent = keeper ? "THE VAULT" : "THE VAULT ⛓"; }
  if (note) note.style.display = keeper ? "none" : "";
  syncVolumeUI();
  applyAimMode();
}
/* Death gate: offer a continue first; only fall through to the real
   game-over (bank souls + SLAIN screen) if no continue is available or taken. */
function gameOver() {
  /* co-op has its own second chance — the revive. No paid continues. */
  if (!(typeof Net !== "undefined" && Net.active) && offerContinue()) return;
  if (typeof Net !== "undefined" && Net.role === "host" && Coop.running) Net.sendR({ t: "over" });
  doGameOver();
}
function doGameOver() {
  const coop = typeof Net !== "undefined" && Net.active;
  const banked = bankSouls();
  haptic(120);
  setState("dead");
  /* a shared CLASSIC descent ends on the same tally, but it is a completion, not a death */
  const victory = coop && Game.coopVictory;
  if (!coop) Game.coopVictory = false;
  $("dTitle").textContent = victory ? "THE DESCENT IS COMPLETE" : "SLAIN";
  $("dTitle").style.color = victory ? "#ffd23d" : "";
  $("dTitle").style.textShadow = victory ? "0 0 22px rgba(255,210,61,.55)" : "";
  $("dSub").textContent = victory
    ? "THE HORIZON IS BEHIND YOU — THE LEDGERS KEEP NO RECORD"
    : "THE CATACOMB KEEPS YOUR BONES";
  $("dCoopTag") && ($("dCoopTag").style.display = coop ? "" : "none");
  $("dHardTag").style.display = Game.hardMode ? "" : "none";
  $("dChaosTag").style.display = Game.chaosMode ? "" : "none";
  const cd = (Game.chaosMode && typeof challengeDef === "function") ? challengeDef(Game.challenge) : null;
  const dct = $("dChallengeTag");
  if (dct) {
    dct.style.display = cd ? "" : "none";
    if (cd) {
      dct.textContent = "✸ " + cd.name + " — ×" + cd.mul + " SOULS ✸";
      dct.style.color = dct.style.borderColor = cd.color;
      dct.style.textShadow = "0 0 12px " + cd.color;
    }
  }
  $("dClassicTag") && ($("dClassicTag").style.display = Game.classicMode ? "" : "none");
  $("dWave").textContent = ROMAN(Game.wave);
  $("dDepth").textContent = depth() + 1;
  /* the tally rolls up as the screen settles */
  $("dScore").textContent = "0"; tweenNum($("dScore"), Game.score, 900);
  $("dKills").textContent = "0"; tweenNum($("dKills"), Game.kills, 900);
  /* precise live-run time (pauses excluded), with a millisecond readout for the clock */
  $("dTime").textContent = typeof RunTimer !== "undefined" ? fmtRunTime(RunTimer.t) : (() => {
    const t = Math.floor(Game.time);
    return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  })();
  const dr = $("deathRunes");
  dr.innerHTML = "";
  const dp = localPlayer();
  const ids = dp ? Object.keys(dp.runes).filter(id => dp.runes[id] > 0) : [];
  if (ids.length === 0) dr.innerHTML = "<span style='color:var(--dim);font-size:11px'>— none —</span>";
  ids.forEach(id => {
    const R = runeDefFor(dp, id);
    const s = document.createElement("span");
    s.textContent = R.glyph + (dp.runes[id] > 1 ? "×" + dp.runes[id] : "");
    s.style.color = R.color;
    s.style.textShadow = "0 0 10px " + R.color;
    dr.appendChild(s);
  });
  $("bankedLine").textContent = "+" + banked + " SOULS BANKED — SPEND THEM IN THE VAULT";
  if (coop) {
    /* co-op v1: souls bank, but records / leaderboards / achievements / the
       death interstitial all sit this one out */
    $("dBestLine").textContent = "A SHARED DESCENT — THE LEDGERS KEEP NO RECORD";
    $("dBestLine").classList.remove("record");
    $("dRankLine") && ($("dRankLine").textContent = "");
    /* The sim stops, but the LINK stays up: DESCEND AGAIN restarts the pair
       together (Coop.retry). Only MAIN MENU, a quit, or a lost partner tears
       the connection down. */
    Coop.running = false;
    return;
  }
  const improved = recordBests();
  const bl = $("dBestLine");
  bl.textContent = bestLineText(improved);
  bl.classList.toggle("record", Object.keys(improved).length > 0);
  if (Object.keys(improved).length) { AudioFX.waveUp(); setTimeout(() => AudioFX.slam(), 350); }   // the ascend fanfare
  Leaderboard.submitRun(improved);   // no-op off the native shell / until Phase 2 ships
  fillRunRankLine("dRankLine", "dead");   // async projected rank — never delays the SLAIN screen
  noteAcceptedDeath();   // pace the run-end interstitial (SLAIN screen is up first, behind the ad)
  devRunEndLines("d");   // a TEST TOOLS run says plainly that nothing was kept
}

/* ---------- descent mode: NORMAL, HARD or CHAOS (only the menu DESCEND asks) ---------- */
function hardUnlocked() { return !!Meta.slain["boss:4"] || Meta.bests.voidKills > 0; }
/* CHAOS is the reward for the bottom of everything: THE UNKNOWN felled once */
function chaosUnlocked() { return !!Meta.slain["boss:" + UNK_KIND]; }
/* a fast double-tap on DESCEND would land its second tap on whatever chooser element
   opened underneath the finger (worst case: instantly starting a HARD run) — ignore
   chooser input for a beat after it opens */
let modeChoiceArmT = 0;
function modeChoiceArmed() { return performance.now() - modeChoiceArmT > 250; }
function openModeChoice() {
  modeChoiceArmT = performance.now();
  const unlocked = hardUnlocked(), hard = $("mcHard");
  hard.classList.toggle("locked", !unlocked);
  $("mcHardDesc").textContent = unlocked
    ? "Every horror and warden carries half again the vitality. A reckoning of its own."
    : "⛓ SEALED — collapse THE EVENT HORIZON once to earn this descent.";
  const hb = $("mcHardBest"), hs = Meta.bestsHard.score;
  hb.style.display = unlocked && hs > 0 ? "" : "none";
  if (unlocked && hs > 0) hb.textContent = "YOUR HARD BEST · " + hs + " SOULS" +
    (fmtSpeedBest(Meta.bestsHard) ? " · CLEAR " + fmtSpeedBest(Meta.bestsHard) : "");
  /* CHAOS sits beside the others from the start — sealed until the Void has fallen.
     Showing the locked card mirrors HARD and keeps the chooser's four-way shape. */
  const chaosOpen = chaosUnlocked(), chaos = $("mcChaos");
  chaos.style.display = "";
  chaos.classList.toggle("locked", !chaosOpen);
  $("mcChaosDesc").textContent = chaosOpen
    ? "No seal on the gun. Every rune answers, all at once — and every fallen wave leaves another. Choose a challenge for a richer bounty."
    : "⛓ SEALED — put down THE UNKNOWN to unleash this descent.";
  const cb = $("mcChaosBest"), cs = Meta.bestsChaos.score;
  cb.style.display = chaosOpen && cs > 0 ? "" : "none";
  if (chaosOpen && cs > 0) cb.textContent = "YOUR CHAOS BEST · " + cs + " SOULS" +
    (fmtSpeedBest(Meta.bestsChaos) ? " · CLEAR " + fmtSpeedBest(Meta.bestsChaos) : "");
  /* CLASSIC is always open — it is the short, old descent. Its ending is a spoiler,
     though: the "no deep, no unknown" half only shows to those who have put THE
     UNKNOWN down (the same gate CHAOS uses). Everyone else sees the short line. */
  $("mcClassicDesc").textContent = chaosOpen
    ? "The descent as it used to end — collapse THE EVENT HORIZON and walk away. No deep, no unknown."
    : "The descent as it used to end.";
  const clb = $("mcClassicBest"), cls = Meta.bestsClassic.score;
  clb.style.display = cls > 0 ? "" : "none";
  if (cls > 0) clb.textContent = "YOUR CLASSIC BEST · " + cls + " SOULS" +
    (fmtSpeedBest(Meta.bestsClassic) ? " · CLEAR " + fmtSpeedBest(Meta.bestsClassic) : "");
  $("modeChoice").classList.add("on");
}
function closeModeChoice() { $("modeChoice").classList.remove("on"); }
$("mcNormal").addEventListener("click", () => {
  if (!modeChoiceArmed()) return;
  Game.hardMode = false; Game.chaosMode = false; Game.classicMode = false; Game.classicLoop = false; Game.challenge = null;
  closeModeChoice(); startGame();
});
$("mcClassic").addEventListener("click", () => {
  if (!modeChoiceArmed()) return;
  Game.hardMode = false; Game.chaosMode = false; Game.classicMode = true; Game.classicLoop = false; Game.challenge = null;
  closeModeChoice(); startGame();
});
$("mcHard").addEventListener("click", () => {
  if (!modeChoiceArmed()) return;
  if (!hardUnlocked()) {                      // sealed: shake the card, stay open
    const c = $("mcHard");
    c.classList.remove("deny"); void c.offsetWidth; c.classList.add("deny");
    return;
  }
  Game.hardMode = true; Game.chaosMode = false; Game.classicMode = false; Game.classicLoop = false; Game.challenge = null;
  closeModeChoice(); startGame();
});
$("mcChaos").addEventListener("click", () => {
  if (!modeChoiceArmed()) return;
  if (!chaosUnlocked()) {                     // sealed: shake the card, stay open
    const c = $("mcChaos");
    c.classList.remove("deny"); void c.offsetWidth; c.classList.add("deny");
    return;
  }
  /* chaos asks one more question before it starts: which price to pay for the bounty */
  closeModeChoice(); openChallengeChoice();
});
$("modeChoiceBack").addEventListener("click", () => { if (modeChoiceArmed()) closeModeChoice(); });

/* ---------- the CHAOS challenge screen ---------- */
let challengeArmT = 0;
function challengeArmed() { return performance.now() - challengeArmT > 250; }
function openChallengeChoice() {
  challengeArmT = performance.now();
  $("challengeChoice").classList.add("on");
}
function closeChallengeChoice() { $("challengeChoice").classList.remove("on"); }
function pickChallenge(id) {
  if (!challengeArmed()) return;
  Game.hardMode = false; Game.chaosMode = true; Game.classicMode = false; Game.classicLoop = false;
  Game.challenge = id || null;
  closeChallengeChoice();
  startGame();
}
for (const card of document.querySelectorAll("#challengeChoice .bc-card")) {
  card.addEventListener("click", () => pickChallenge(card.getAttribute("data-challenge") || null));
}
$("challengeBack").addEventListener("click", () => {
  if (!challengeArmed()) return;
  closeChallengeChoice();
  openModeChoice();
});

function startGame() {
  if (Game.devRun) devEndRun();   // a real descent always starts from the real save
  AudioFX.unlock();
  Ads.preload();        // arm the interstitial early so a revive / the run's end shows it instantly
  resetRun();
  updateHp(); updateScore(); updateRerolls();
  $("waveNum").textContent = "I";
  if (!Meta.seenCutscene) startCutscene("play");        // the opening plays once, on the very first descent
  else if (!Meta.seenTutorial) startTutorial("play");   // defensive: cutscene seen but tutorial not
  else enterPlay();                                     // returning player → straight into the run
}
$("btnStart").addEventListener("click", openModeChoice);   // menu DESCEND asks the mode first
$("btnRetry").addEventListener("click", () => {
  /* co-op: descend again TOGETHER in the mode the host chose — no chooser.
     Coop.retry returns false only if the link has already died, in which case
     this falls through to a solo run. */
  if (typeof Net !== "undefined" && Net.active && Coop.retry()) return;
  openModeChoice();          // solo — pick the descent afresh rather than repeating it
});
$("btnDeathMenu").addEventListener("click", () => {
  /* leaving the tally screen is the moment a co-op link is actually done with */
  if (typeof Net !== "undefined" && Net.active) {
    Net.sendR({ t: Net.role === "host" ? "hostQuit" : "guestQuit" });
    Coop.running = false;
    Net.hangUp();
  }
  refreshMenu(); setState("menu");
  if (typeof RunegunConsole !== "undefined") RunegunConsole.logEvent("VAULT", "closed");
});

/* every interactive surface ticks — one delegated listener instead of per-handler sounds */
document.addEventListener("click", e => {
  if (!e.target || !e.target.closest) return;
  if (e.target.closest(".menu-btn, .bc-card, #pauseBtn, #vault .card")) AudioFX.click();
});

