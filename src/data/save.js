/* =========================================================
   RUNEGUN · Persistent meta (the vault save)
   Meta state (bank, unlocks, equipped char/skin, control prefs) and its localStorage load/save.
   ========================================================= */
"use strict";


/* ---------- persistent meta (vault) ---------- */
const Meta = {
  bank: 0, volume: 0.8,
  textSize: "large",   // small-print scale: "normal" · "large" (default) · "huge" — see ui/overlays.js
  schemaV: 4,         // save-shape version — bump when stored keys change meaning (see the metaLoad migration)
  deaths: 0,          // lifetime accepted deaths — paces the run-end interstitial
  seenTutorial: false, // has the first-launch how-to-play walkthrough played once
  seenCutscene: false, // has the intro fall cutscene played once
  unlocked: { "char:gunsmith": true, "skin:bone": true },
  slain: {},          // bestiary: every enemy type / "boss:<kind>" ever put down
  slainFlawless: {},  // the untouched-run twin: "boss:<kind>" ever felled with the run unscarred.
                      // Bosses only — it exists to back the FLAWLESS Play Games achievements,
                      // which are re-asserted from here at every sign-in (see leaderboard.js).
  runesSeen: {},      // glossary: every rune id ever carved into a gun
  char: "gunsmith", skin: "bone",
  boardName: "",      // generated callsign shown on the online score board (Firebase) — never a Google name
  gunSkin: null,      // warpaint worn on the GUN (SKINS key) or null = unpainted, rune-tinted barrels
  pet: null,          // equipped pet type (PTYPES key) or null for none
  aimMode: "auto",   // mobile: "auto" = 1 stick (move) + auto-aim (default) · "twin" = 2 sticks (move + aim/fire)
  deskMode: "hold",  // desktop: "hold" = aim cursor, fire on hold · "cursor" = aim cursor, auto-fire · "auto" = auto-aim + auto-fire
  keyBinds: null,    // desktop CONTROLS: null = KEY_DEFAULTS (input.js) · else {action: [primary, alt]} of
                     // KeyboardEvent.code ("KeyW" — the physical key) or "Mouse<button>"; null slot = unbound
  padBinds: null,    // desktop controller: null = PAD_DEFAULTS (input.js) · else {action: Standard Gamepad button index}
  ctrlScheme: "buttons", // mobile action controls: "buttons" (repositionable DASH/SEAL) · "gestures" (tap anywhere)
  btnLayout: null,   // null = stock CSS button layout · else {dash:{x,y}, seal:{x,y}} viewport FRACTIONS 0..1
  btnSize: "medium", // mobile DASH/SEAL size: "small"(54) · "medium"(68, default) · "large"(82)
  gestureSwap: false, // gestures scheme: false = tap→seal / 2×→dash (default) · true = tap→dash / 2×→seal
  haptics: true,      // vibration pulses on key combat beats (mobile only; navigator.vibrate)
  shake: true,        // screen shake: false zeroes it where it's drawn (draw() and the intro cutscene)
  advancedNumbers: false, // show exact character stats and marginal rune contributions
  showRuneDescriptions: true, // hide rune-choice prose for a compact, stable card layout
  showHiddenRunes: false,     // easter-egg runes only appear for hidden wardens unless toggled on
  glow: "full",       // neon halo budget: "full" (default — the intended look) · "half" · "off".
                      // Trades the glow for GPU raster load; see the glow lever in canvas.js.
  juice: "full",      // kill-streak feedback: "full" · "lite" (no whole-screen effects) · "off".
                      // "lite" keeps every INFORMATIONAL element and drops every whole-screen
                      // one — the same axis serves low-end GPUs and photosensitivity.
  juiceSet: false,    // has the player chosen explicitly? OS reduced-motion only sets the
                      // default while this is false — an explicit choice always outranks it.
  runTimer: true,     // speedrun clock in the HUD — display only; records are kept either way
  speedrun: false,    // SPEEDRUN mode: guarantee WARD in the first rune choice (independent of the clock)
  speedBests: {},     // fastest COMPLETED descent per warden id and mode, seconds (0/absent = never cleared)
  bests: {            // personal records (local leaderboard — you vs your own past runs)
    score: 0,               // max Game.score
    survivedSec: 0,         // longest single run, floor(Game.time)
    wave: 0,                // max Game.wave
    depth: 0,               // max depth() (raw; display as +1)
    speedSec: 0,            // fastest completed descent (THE UNKNOWN felled), seconds
    voidKills: 0,           // lifetime count of void bosses slain
    fastestVoidClearSec: 0, // min run-time at first void kill; 0 = never
    longestAfterVoidSec: 0, // max survival AFTER the void clear ("how long they last if they continue")
    /* the loadout that PRODUCED score — shown beside the online board's top
       rows. Recorded only when the score improves, so it can never describe a
       different run than the number next to it. */
    char: "gunsmith",       // CHARS key
    runes: "",              // comma-separated rune ids, acquisition order
  },
  bestsHard: {        // personal records on HARD descents (lifetime void stats stay in bests above)
    score: 0,               // max Game.score on hard runs
    survivedSec: 0,         // longest single hard run
    wave: 0,                // max wave on hard
    depth: 0,               // max depth on hard
    speedSec: 0,            // fastest completed hard descent, seconds
    char: "gunsmith",
    runes: "",
  },
  bestsClassic: {     // personal records on CLASSIC descents — the run ends at THE EVENT HORIZON
    score: 0,
    survivedSec: 0,
    wave: 0,
    depth: 0,
    speedSec: 0,
  },
  bestsChaos: {       // personal records on CHAOS descents — local only, no Play Games board
    score: 0,
    survivedSec: 0,
    wave: 0,
    depth: 0,
    speedSec: 0,            // fastest completed chaos descent, seconds
    char: "gunsmith",
    runes: "",
  },
};
const SAVE_KEY = "runegun.meta.v2";
let storageOk = true;
function metaSave() {
  /* a TEST TOOLS run writes nothing; its snapshot is restored when it ends (systems/devtools.js) */
  if (typeof Game !== "undefined" && Game.devRun) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Meta)); }
  catch (e) { storageOk = false; }
}
function metaLoad() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Meta.bank = d.bank | 0;
      Meta.deaths = d.deaths | 0;
      Meta.seenTutorial = !!d.seenTutorial;
      Meta.seenCutscene = !!d.seenCutscene;
      Meta.volume = typeof d.volume === "number" ? clamp(d.volume, 0, 1) : 0.8;
      /* saves from before TEXT SIZE existed get the new, more readable default */
      if (d.textSize === "normal" || d.textSize === "large" || d.textSize === "huge") Meta.textSize = d.textSize;
      Object.assign(Meta.unlocked, d.unlocked || {});
      Object.assign(Meta.slain, d.slain || {});
      Object.assign(Meta.slainFlawless, d.slainFlawless || {});
      Object.assign(Meta.runesSeen, d.runesSeen || {});
      /* grandfather returning players: anyone who already broke the Chained Warden keeps their
         Vault open (and skips the new unchaining cutscene) — the Keeper counts as already freed. */
      if (Meta.slain["boss:0"] && !Meta.unlocked["npc:keeper"]) Meta.unlocked["npc:keeper"] = true;
      if (Meta.slain["boss:8"] && !Meta.unlocked["char:theUnknown"]) Meta.unlocked["char:theUnknown"] = true;
      if (d.char && CHARS[d.char]) Meta.char = d.char;
      if (d.skin && SKINS[d.skin]) Meta.skin = d.skin;
      /* the online board callsign — only a well-formed WARDEN-XXXX survives, so a
         hand-edited save can't put a weird string in front of other players */
      if (typeof d.boardName === "string" && /^WARDEN-[A-Z2-9]{4}$/.test(d.boardName)) Meta.boardName = d.boardName;
      if (d.gunSkin && SKINS[d.gunSkin]) Meta.gunSkin = d.gunSkin;
      if (d.pet && PTYPES[d.pet]) Meta.pet = d.pet;
      if (d.aimMode === "twin" || d.aimMode === "auto") Meta.aimMode = d.aimMode;
      if (d.deskMode === "hold" || d.deskMode === "cursor" || d.deskMode === "auto") Meta.deskMode = d.deskMode;
      /* bindings keep only well-formed slots; an action missing here falls back to its default */
      if (d.keyBinds && typeof d.keyBinds === "object") {
        const kb = {}, slot = v => (typeof v === "string" && v.length < 32) ? v : null;
        for (const a in d.keyBinds) if (Array.isArray(d.keyBinds[a])) kb[a] = [slot(d.keyBinds[a][0]), slot(d.keyBinds[a][1])];
        Meta.keyBinds = kb;
      }
      if (d.padBinds && typeof d.padBinds === "object") {
        const pb = {};
        for (const a in d.padBinds) { const v = d.padBinds[a]; pb[a] = (Number.isInteger(v) && v >= 0 && v < 32) ? v : null; }
        Meta.padBinds = pb;
      }
      if (d.ctrlScheme === "buttons" || d.ctrlScheme === "gestures") Meta.ctrlScheme = d.ctrlScheme;
      if (d.btnSize === "small" || d.btnSize === "medium" || d.btnSize === "large") Meta.btnSize = d.btnSize;
      Meta.gestureSwap = !!d.gestureSwap;
      Meta.haptics = d.haptics !== false;   // default on for saves from before the toggle existed
      Meta.shake = d.shake !== false;       // likewise
      Meta.advancedNumbers = !!d.advancedNumbers;
      Meta.showRuneDescriptions = d.showRuneDescriptions !== false;
      /* saves from before the glow toggle existed simply keep "full" — the look they already had */
      if (d.glow === "full" || d.glow === "half" || d.glow === "off") Meta.glow = d.glow;
      /* likewise: saves from before the streak juice existed default to "full" */
      if (d.juice === "full" || d.juice === "lite" || d.juice === "off") Meta.juice = d.juice;
      Meta.juiceSet = !!d.juiceSet;
      /* hidden runes toggle — defaults off for returning saves */
      Meta.showHiddenRunes = d.showHiddenRunes === true;
      /* speedrun clock — on for returning saves unless they explicitly hid it */
      Meta.runTimer = d.runTimer !== false;
      /* SPEEDRUN mode is opt-in: saves from before it existed start with it off */
      Meta.speedrun = d.speedrun === true;
      if (d.speedBests && typeof d.speedBests === "object")
        for (const k in d.speedBests) {
          const base = String(k).split(":")[0];   // "gunsmith" or "gunsmith:classic"
          if (CHARS[base] && typeof d.speedBests[k] === "number" && d.speedBests[k] > 0)
            Meta.speedBests[k] = d.speedBests[k];
        }
      if (d.btnLayout && typeof d.btnLayout === "object") {
        const L = d.btnLayout, ok = p => p && typeof p.x === "number" && typeof p.y === "number";
        if (ok(L.dash) && ok(L.seal))
          Meta.btnLayout = { dash: { x: clamp(L.dash.x, 0, 1), y: clamp(L.dash.y, 0, 1) },
                             seal: { x: clamp(L.seal.x, 0, 1), y: clamp(L.seal.y, 0, 1) } };
      }
      if (d.bests && typeof d.bests === "object") {
        for (const k in Meta.bests)
          if (typeof d.bests[k] === "number" && d.bests[k] >= 0) Meta.bests[k] = d.bests[k];
      }
      if (d.bestsHard && typeof d.bestsHard === "object") {
        for (const k in Meta.bestsHard)
          if (typeof d.bestsHard[k] === "number" && d.bestsHard[k] >= 0) Meta.bestsHard[k] = d.bestsHard[k];
      }
      if (d.bestsClassic && typeof d.bestsClassic === "object") {
        for (const k in Meta.bestsClassic)
          if (typeof d.bestsClassic[k] === "number" && d.bestsClassic[k] >= 0) Meta.bestsClassic[k] = d.bestsClassic[k];
      }
      if (d.bestsChaos && typeof d.bestsChaos === "object") {
        for (const k in Meta.bestsChaos)
          if (typeof d.bestsChaos[k] === "number" && d.bestsChaos[k] >= 0) Meta.bestsChaos[k] = d.bestsChaos[k];
      }
      /* the loadout tags beside each record are strings, so the numeric loops
         above skip them — restore those explicitly, and only if they're sane */
      const loadTag = (src, dst) => {
        if (!src || typeof src !== "object") return;
        if (typeof src.char === "string" && CHARS[src.char]) dst.char = src.char;
        if (typeof src.runes === "string") dst.runes = src.runes.slice(0, 96);
      };
      loadTag(d.bests, Meta.bests);
      loadTag(d.bestsHard, Meta.bestsHard);
      loadTag(d.bestsChaos, Meta.bestsChaos);
      /* v3 migration: THE DROWNED NAVE was wedged in before the void, pushing the
         Event Horizon from kind/floor-index 3 to 4 — carry the old void records over.
         Old depth = loop*4 + idx decomposes exactly, old idx 3 (the void) is now 4. */
      if ((d.schemaV | 0) < 3) {
        if (Meta.slain["boss:3"]) { delete Meta.slain["boss:3"]; Meta.slain["boss:4"] = true; }
        const remapDepth = v => Math.floor(v / 4) * 5 + (v % 4 === 3 ? 4 : v % 4);
        Meta.bests.depth = remapDepth(Meta.bests.depth);
        Meta.bestsHard.depth = remapDepth(Meta.bestsHard.depth);
      }
      /* v4 migration: floors VI–VIII were added after the Void, so a lap is eight floors.
         Old depth = loop*5 + idx; the first five floors keep their index. */
      if ((d.schemaV | 0) < 4) {
        const remapDepth = v => Math.floor(v / 5) * 8 + v % 5;
        Meta.bests.depth = remapDepth(Meta.bests.depth);
        Meta.bestsHard.depth = remapDepth(Meta.bestsHard.depth);
      }
    }
  } catch (e) { storageOk = false; }
}

/* ---------- local best-records (you vs your own past runs) ----------
   Called at each run-end sink. Updates any improved personal best, saves,
   and returns a map of which keys improved (for the "NEW BEST!" highlight
   and to signal Phase-2 online submission). */
/* the ledger this run's mode writes to (CHAOS and HARD never share a run) */
const modeBests = () => Game.chaosMode ? Meta.bestsChaos : Game.classicMode ? Meta.bestsClassic : Game.hardMode ? Meta.bestsHard : Meta.bests;
/* The runes held at run end, as a short comma string for the online board.
   Ids only (the stack counts would double the length and tell a reader
   nothing); capped so a modded build can't stuff the row. */
function heldRuneString(p) {
  if (!p || !p.runes) return "";
  const ids = Object.keys(p.runes).filter(id => p.runes[id] > 0);
  return ids.join(",").slice(0, 96);
}
function recordBests() {
  const b = modeBests(), improved = {};
  const survived = Math.floor(Game.time), d = depth();
  const bump = (key, val, better) => { if (better) { b[key] = val; improved[key] = true; } };
  bump("score",       Game.score, Game.score > b.score);
  /* The character + runes belong to the run that set the record — capture them
     in the same breath as the score, or a later run's loadout would be shown
     beside an older number. */
  if (improved.score) {
    b.char = (typeof CHARS !== "undefined" && CHARS[Meta.char]) ? Meta.char : "gunsmith";
    b.runes = heldRuneString(typeof localPlayer === "function" ? localPlayer() : null);
  }
  bump("survivedSec", survived,   survived   > b.survivedSec);
  bump("wave",        Game.wave,  Game.wave  > b.wave);
  bump("depth",       d,          d          > b.depth);
  if (Game.voidKillTime >= 0) {                       // this run reached & beat the void
    const after = Math.max(0, survived - Math.floor(Game.voidKillTime));
    /* lifetime void records live in Meta.bests regardless of mode (bestsHard has no such key) */
    if (after > Meta.bests.longestAfterVoidSec) { Meta.bests.longestAfterVoidSec = after; improved.longestAfterVoidSec = true; }
  }
  /* void records are bumped at kill time (combat.js) — merge their improved
     flags here so a record void clear still lights the NEW BEST star */
  if (Game.voidImproved) Object.assign(improved, Game.voidImproved);
  metaSave();
  return improved;
}

/* Build the "BEST · …" line shown under the run-end stats. */
function bestLineText(improved) {
  const mmss = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  const b = modeBests();
  let s = (Game.chaosMode ? "CHAOS BEST · " : Game.classicMode ? "CLASSIC BEST · " : Game.hardMode ? "HARD BEST · " : "BEST · ") + b.score + " SOULS · " + mmss(b.survivedSec) + " · WAVE " + ROMAN(b.wave) + " · FLOOR " + (b.depth + 1);
  if (b.speedSec > 0 && typeof fmtRunTime === "function") s += " · CLEAR " + fmtRunTime(b.speedSec);
  if (Meta.bests.voidKills > 0)   // lifetime void tally — shared across modes
    s += "  |  VOID ×" + Meta.bests.voidKills + " · CLEAR " + mmss(Meta.bests.fastestVoidClearSec) + " · AFTER " + mmss(Meta.bests.longestAfterVoidSec);
  if (improved && Object.keys(improved).length) s = "★ NEW BEST! — " + s;
  return s;
}
