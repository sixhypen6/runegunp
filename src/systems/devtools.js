/* =========================================================
   RUNEGUN · Test tools — jump anywhere, carve anything
   A play-testing panel. Once the run console turns it on (`devtools on`), it
   opens from the main menu or the pause menu (TEST TOOLS). Off by default.

   START A TEST RUN: any gunslinger, normal, hard or chaos, any lap and wave, straight
   to any floor (optionally with its warden already awake), the floor I rift,
   the saloon, or any stage of THE UNKNOWN — with hand-picked runes and stacks.

   THIS RUN (from the pause menu): god mode, ×20 damage, heal, set your runes,
   wake / kill the warden, clear the horrors, next floor; and in THE UNKNOWN:
   cast any rune now, skip to the next gate, kill the echoes.

   A test run never touches the save. Meta is snapshotted when it starts,
   nothing is written while it runs, and the snapshot comes back when it ends:
   no souls banked, no records, no bestiary or achievements, no leaderboard
   post, no interstitial. (Settings changed during a test run are not kept.)

   TEST TOOLS ARE OFF BY DEFAULT. The run console is the only door:
     F9 / ` → devtools on     (devtools off hides them again)
   The choice lives in its own localStorage key, never in the save, so a build
   handed to a player starts with no TEST TOOLS button anywhere.
   ========================================================= */
"use strict";

const DEV_FLAG_KEY = "runegun.devtools.v1";
let DEV_TOOLS = (() => { try { return localStorage.getItem(DEV_FLAG_KEY) === "1"; } catch (e) { return false; } })();

/* the hooks the rest of the game reads (inert unless a test run turns them on) */
const Dev = { god: false, dmgMul: 1, snap: null, prevHard: false, prevChaos: false, prevClassic: false, prevClassicLoop: false, prevChallenge: null, built: false, from: "menu", cfg: null };
const DEV_KEY = "runegun.dev.v1";
const DEV_MAX_STACKS = 32;   // deep enough to feel the stack taper (data/runes.js) at a full descent's worth of runes
const DEV_DEFAULT = { char: "gunsmith", hard: false, chaos: false, classic: false, lap: 0, wave: "", dest: "unk:p1", wake: true,
  runes: {}, seal: true, god: true, dmg: false };
const DEV_UNK_STAGES = [
  ["walk", "WALK-UP"], ["p1", "PHASE I"], ["c1", "CHALLENGE I · WARDEN + TYRANT"],
  ["p2", "PHASE II"], ["c2", "CHALLENGE II · MONARCH + SAINT"], ["p3", "PHASE III"],
];

/* ---------- config, remembered between sessions (its own key, never the save) ---------- */
function devLoadCfg() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(DEV_KEY) || "{}") || {}; } catch (e) { c = {}; }
  const cfg = Object.assign({}, DEV_DEFAULT, c);
  cfg.runes = Object.assign({}, c.runes || {});
  if (!CHARS[cfg.char]) cfg.char = DEV_DEFAULT.char;
  return cfg;
}
function devSaveCfg() { try { localStorage.setItem(DEV_KEY, JSON.stringify(Dev.cfg)); } catch (e) {} }
function devDestLabel(dest) {
  const [k, a] = dest.split(":");
  if (k === "floor") return ROMAN(+a + 1) + " · " + FLOORS[+a].name;
  if (k === "rift") return "I · THE RIFT";
  if (k === "saloon") return "THE SINGULAR";
  const s = DEV_UNK_STAGES.find(x => x[0] === a);
  return "THE UNKNOWN · " + (s ? s[1] : a);
}
/* a wave count that roughly matches arriving there in a real run (it scales HP) */
function devAutoWave(dest) {
  const [k, a] = dest.split(":");
  if (k === "floor") return 3 + 4 * (+a);
  if (k === "saloon") return 19;
  if (k === "unk") return 31;
  return 3;
}

/* ---------- starting and ending a test run ---------- */
function devInRun() { return players.length > 0 && ["play", "pause", "held", "rune", "choice"].includes(Game.state); }
function devStartRun() {
  const c = Dev.cfg;
  if (Game.devRun) devEndRun();
  else if (devInRun()) bankSouls();               // a real run in progress keeps what it earned, as a quit would
  Dev.prevHard = Game.hardMode; Dev.prevChaos = Game.chaosMode; Dev.prevClassic = Game.classicMode;
  Dev.prevClassicLoop = Game.classicLoop;
  Dev.prevChallenge = Game.challenge;
  Dev.snap = JSON.stringify(Meta);
  Game.devRun = true;                             // set first: metaSave() is silent from here on
  AudioFX.unlock();
  Game.hardMode = !!c.hard && !c.chaos && !c.classic;
  Game.chaosMode = !!c.chaos;
  Game.classicMode = !!c.classic && !c.chaos;
  Game.classicLoop = false;
  Game.challenge = null;                          // a test run never carries a challenge multiplier
  resetRun([Object.assign(localPlayerCfg(), { char: c.char })]);
  Game.devRun = true;
  Game.loop = clamp(c.lap | 0, 0, 9);
  Game.wave = c.wave !== "" && c.wave !== null && !isNaN(+c.wave) ? Math.max(0, +c.wave | 0) : devAutoWave(c.dest);
  devSetRunes(localPlayer(), c.runes, c.seal, false);
  Dev.god = !!c.god; Dev.dmgMul = c.dmg ? 20 : 1;
  devGoto(c.dest, c.wake);
  const p = localPlayer(); p.hp = p.maxHp;
  updateHp(); updateScore(); updateRerolls(); refreshRuneStrip();
  $("waveNum").textContent = ROMAN(Math.max(1, Game.wave));
  devClose();
  if (Game.state !== "play") setState("play");
  toast("TEST RUN — " + devDestLabel(c.dest));
}
/* back to the real save: called on the way to the menu and before any real run starts */
function devEndRun() {
  if (!Game.devRun) return;
  Game.devRun = false;
  Dev.god = false; Dev.dmgMul = 1;
  if (Dev.snap) {
    const s = JSON.parse(Dev.snap);
    for (const k of Object.keys(Meta)) delete Meta[k];
    Object.assign(Meta, s);
    Dev.snap = null;
  }
  Game.hardMode = Dev.prevHard; Game.chaosMode = Dev.prevChaos; Game.classicMode = Dev.prevClassic;
  Game.classicLoop = Dev.prevClassicLoop;
  Game.challenge = Dev.prevChallenge || null;
  if (typeof refreshMenu === "function") refreshMenu();
}
/* the run-end screens of a test run say plainly that nothing was kept */
function devRunEndLines(prefix) {
  if (!Game.devRun) return;
  const set = (id, txt) => { const el = $(id); if (el) { el.textContent = txt; el.classList.remove("record"); } };
  set(prefix === "a" ? "aBankedLine" : "bankedLine", "TEST RUN — NOTHING WAS BANKED");
  set(prefix + "BestLine", "TEST RUN — THE LEDGERS KEEP NO RECORD");
  const rk = $(prefix + "RankLine"); if (rk) { rk.textContent = ""; rk.style.display = "none"; }
}

/* ---------- where a test run lands ---------- */
function devGoto(dest, wake) {
  const [k, a] = dest.split(":");
  if (k === "floor") {
    Game.mapIdx = clamp(+a, 0, FLOORS.length - 1);
    setupFloor(false);
    Game.intermission = 1.5;
    if (wake) {
      Game.chestsOpened = Game.chestsTotal;
      SEAL.state = "ready"; updateSeals();
      spawnBoss();
    }
  } else if (k === "rift") {
    Game.mapIdx = 0; setupFloor(false);
    enterRift();
  } else if (k === "saloon") {
    Game.mapIdx = 4; setupFloor(false);
    enterSaloon();
  } else if (k === "unk") {
    Game.mapIdx = 7; setupFloor(false);
    Game.starConquered = true; Game.unknownDue = true;
    enterUnknown();
    devUnkSkip(a);
  }
}
/* straight to a stage of THE UNKNOWN: past the walk-up, its HP at the top of that band */
function devUnkSkip(target) {
  const U = Game.unk;
  if (!U || target === "walk") return;
  const b = U.boss;
  for (const p of players) { p.x = UNK_X + (p.idx ? 44 : 0); p.y = UNK_Y + 330; }
  unkClearCombat();
  if (U.stage === "walk" || U.stage === "talk") unkReveal();
  U.line = null;
  document.body.classList.remove("unkTalk");
  const ph = { p1: 1, c1: 1, p2: 2, c2: 2, p3: 3 }[target] || 1;
  unkStartFight();                                // the name card, the bar, the roar
  U.phase = ph;
  if (target[0] === "c") {
    /* a challenge round: it is already in the abyss, locked at the gate */
    b.hp = UNK_PH[ph].floor * b.maxHp;
    b.ghost = true; U.vis = 0;
    unkBeginRound();
  } else {
    b.hp = UNK_PH[ph].top * b.maxHp;
    U.gap = 1.2;
  }
}

/* ---------- runes ---------- */
/* hand-picked runes and stacks; none picked = keep the gunslinger's usual start */
function devSetRunes(p, runes, seal, live) {
  const ids = RUNE_IDS.filter(id => (runes[id] | 0) > 0);
  if (!ids.length && !live) return;
  p.runes = {};
  p.lockedRunes = null;
  for (const id of ids) p.runes[id] = clamp(runes[id] | 0, 1, DEV_MAX_STACKS);
  recalc(p);
  if (seal && ids.length && !Game.chaosMode) p.lockedRunes = ids.slice();   // CHAOS never seals
  refreshRuneStrip();
  if (live) toast(ids.length ? "RUNES SET — " + ids.map(id => RUNES[id].glyph + (p.runes[id] > 1 ? "×" + p.runes[id] : "")).join(" ") : "RUNES CLEARED");
}

/* ---------- THIS RUN ---------- */
const DEV_LIVE = {
  heal() { for (const p of players) { p.hp = p.maxHp; p.downed = false; } updateHp(); toast("HEALED"); },
  runes() { devSetRunes(localPlayer(), Dev.cfg.runes, Dev.cfg.seal, true); },
  wake() {
    if (Game.boss || Game.inUnknown || Game.inSaloon || Game.inRift) { toast("NO WARDEN TO WAKE HERE"); return; }
    Game.chestsOpened = Game.chestsTotal; SEAL.state = "ready"; updateSeals();
    spawnBoss();
  },
  kill() {
    if (Game.inUnknown) { DEV_LIVE.gate(); return; }
    const b = Game.boss;
    if (!b || b.dead) { toast("NO WARDEN STANDING"); return; }
    b.spawnT = 0; b.ghost = false;
    killEnemy(b, localPlayer());
  },
  clear() {
    for (const e of enemies) if (!e.boss && !e.dead) { e.hp = 0; e.dead = true; }
    ebullets.length = 0;
    toast("THE HORRORS ARE GONE");
  },
  next() {
    portal = null; rift = null;
    Game.floorFade = 1;
    nextFloor();
    toast("SKIPPED TO " + floorDef().name);
  },
  /* THE UNKNOWN */
  cast() {
    const U = Game.unk, id = $("devCastSel").value;
    if (!U || U.stage !== "fight") { toast("IT CASTS ONLY WHILE IT FIGHTS"); return; }
    for (const c of U.casts) if (c.h) c.h.busy = false;
    U.casts = []; U.left = 0;
    unkStartGroup([id]);
  },
  gate() {
    const U = Game.unk;
    if (!U) { toast("NOT IN THE UNKNOWN"); return; }
    const b = U.boss, P = localPlayer();
    if (U.stage === "round") { DEV_LIVE.echoes(); return; }
    if (U.stage !== "fight") { toast("WAIT FOR IT TO FIGHT"); return; }
    if (U.phase >= 3) { damageEnemy(b, b.hp + 10, { owner: P }); return; }
    b.hp = UNK_PH[U.phase].floor * b.maxHp + 1;
    damageEnemy(b, 10, { owner: P });          // crosses the gate the honest way: the lock fires
  },
  echoes() {
    const U = Game.unk;
    if (!U || U.stage !== "round") { toast("NO ECHOES RIGHT NOW"); return; }
    for (const e of U.echoes.slice()) if (!e.dead) { e.spawnT = 0; e.ghost = false; killEnemy(e, localPlayer()); }
  },
};

/* ---------- the panel ---------- */
function devBuild() {
  if (Dev.built) return;
  Dev.built = true;
  const st = document.createElement("style");
  st.textContent = `
  #devPanel{position:fixed;inset:0;z-index:40;display:none;background:rgba(5,4,12,.985);overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--bone);font-family:inherit;pointer-events:auto;user-select:none}
  #devPanel.on{display:block}
  #devPanel .dv-box{max-width:840px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}
  #devPanel .dv-head{display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:1;background:rgba(5,4,12,.98);padding:max(10px,env(safe-area-inset-top)) 0 10px;border-bottom:1px solid var(--line)}
  #devPanel .dv-title{font-size:13px;letter-spacing:.35em;color:var(--gold);white-space:nowrap}
  #devPanel .dv-note{flex:1;min-width:0;font-size:9px;letter-spacing:.12em;color:var(--dim)}
  #devPanel h4{font-size:10px;letter-spacing:.3em;color:var(--arcane);margin:16px 0 8px;font-weight:normal}
  #devPanel .dv-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  #devPanel .dv-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 12px}
  #devPanel .dv-f{display:flex;flex-direction:column;gap:4px;font-size:9px;letter-spacing:.2em;color:var(--dim);min-width:0}
  #devPanel select,#devPanel input[type=number]{font-family:inherit;font-size:12px;background:#0f0d1c;color:var(--bone);border:1px solid var(--line);padding:7px 6px;border-radius:0;min-width:0;width:100%}
  #devPanel .dv-chk{display:inline-flex;gap:7px;align-items:center;font-size:10px;letter-spacing:.14em;cursor:pointer;padding:4px 0}
  #devPanel .dv-chk input{accent-color:#9d6bff;width:16px;height:16px}
  #devPanel .dv-btn{font-family:inherit;font-size:10px;letter-spacing:.16em;color:var(--bone);background:rgba(20,18,38,.85);border:1px solid var(--line);padding:9px 11px;cursor:pointer}
  #devPanel .dv-btn:hover,#devPanel .dv-btn:active{border-color:var(--arcane);color:#fff}
  #devPanel .dv-btn.warn{border-color:#5e2230;color:var(--blood)}
  #devPanel .dv-close{margin-left:auto}
  #devPanel .dv-runes{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}
  #devPanel .dv-rune{display:flex;min-width:0;border:1px solid var(--line);background:#0f0d1c}
  #devPanel .dv-rune.on{border-color:var(--rc)}
  #devPanel .dv-add{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-family:inherit;font-size:9px;letter-spacing:.06em;color:var(--dim);background:none;border:0;padding:7px 6px;cursor:pointer;text-align:left}
  #devPanel .dv-rune.on .dv-add{color:var(--bone)}
  #devPanel .dv-add .g{font-size:16px;line-height:1;color:var(--rc)}
  #devPanel .dv-add .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #devPanel .dv-add .c{margin-left:auto;font-size:11px;color:var(--gold)}
  #devPanel .dv-sub{width:24px;flex:none;font-family:inherit;font-size:14px;color:var(--blood);background:none;border:0;border-left:1px solid var(--line);cursor:pointer}
  #devPanel .dv-hint{font-size:9px;letter-spacing:.1em;color:var(--dim);margin-top:6px}
  #devPanel .dv-start{width:100%;margin-top:16px}
  #devPanel .dv-live{border:1px solid var(--line);padding:4px 12px 12px;margin-top:12px;background:rgba(20,18,38,.5)}`;
  document.head.appendChild(st);

  const destOpts = FLOORS.map((F, i) => `<option value="floor:${i}">${ROMAN(i + 1)} · ${F.name}</option>`).join("");
  const unkOpts = DEV_UNK_STAGES.map(([k, n]) => `<option value="unk:${k}">${n}</option>`).join("");
  const charOpts = Object.keys(CHARS).map(k => `<option value="${k}">${CHARS[k].name}</option>`).join("");
  const castOpts = RUNE_IDS.map(id => `<option value="${id}">${RUNES[id].glyph} ${RUNES[id].name}${typeof UNK_RUNES !== "undefined" && UNK_RUNES[id] ? " → " + UNK_RUNES[id].name : ""}</option>`).join("");
  const el = document.createElement("div");
  el.id = "devPanel";
  el.innerHTML = `
  <div class="dv-box">
    <div class="dv-head">
      <span class="dv-title">TEST TOOLS</span>
      <span class="dv-note">a test run never touches your save, records, achievements or the leaderboard</span>
      <button class="dv-btn dv-close" id="devClose">CLOSE ✕</button>
    </div>
    <div class="dv-live" id="devLive">
      <h4>THIS RUN</h4>
      <div class="dv-row">
        <label class="dv-chk"><input type="checkbox" id="devGodLive"> GOD MODE</label>
        <label class="dv-chk"><input type="checkbox" id="devDmgLive"> DAMAGE ×20</label>
      </div>
      <div class="dv-row" style="margin-top:8px">
        <button class="dv-btn" data-live="heal">HEAL</button>
        <button class="dv-btn" data-live="runes">USE THE RUNES BELOW</button>
        <button class="dv-btn" data-live="wake">WAKE THE WARDEN</button>
        <button class="dv-btn" data-live="kill">KILL THE WARDEN</button>
        <button class="dv-btn" data-live="clear">CLEAR THE HORRORS</button>
        <button class="dv-btn" data-live="next">NEXT FLOOR</button>
      </div>
      <div id="devUnkLive">
        <h4>THE UNKNOWN</h4>
        <div class="dv-row">
          <select id="devCastSel" style="width:auto;max-width:100%">${castOpts}</select>
          <button class="dv-btn" data-live="cast">CAST IT NOW</button>
          <button class="dv-btn" data-live="gate">SKIP TO THE NEXT GATE</button>
          <button class="dv-btn" data-live="echoes">KILL THE ECHOES</button>
        </div>
      </div>
    </div>
    <h4>START A TEST RUN</h4>
    <div class="dv-fields">
      <label class="dv-f">GUNSLINGER<select id="devChar">${charOpts}</select></label>
      <label class="dv-f">GO TO<select id="devDest">
        <optgroup label="THE FLOORS">${destOpts}</optgroup>
        <optgroup label="SIDE STAGES"><option value="rift">I · THE RIFT</option><option value="saloon">THE SINGULAR (SALOON)</option></optgroup>
        <optgroup label="THE UNKNOWN">${unkOpts}</optgroup>
      </select></label>
      <label class="dv-f">DESCENT<select id="devHard"><option value="0">NORMAL</option><option value="1">CLASSIC</option><option value="2">HARD</option><option value="3">CHAOS</option></select></label>
      <label class="dv-f">LAP<select id="devLap"><option value="0">1 (FIRST)</option><option value="1">2</option><option value="2">3</option><option value="3">4</option></select></label>
      <label class="dv-f">WAVE (SCALES HP)<input type="number" id="devWave" min="0" max="200" placeholder="auto"></label>
    </div>
    <div class="dv-row" style="margin-top:8px">
      <label class="dv-chk"><input type="checkbox" id="devWake"> WAKE THE WARDEN ON ARRIVAL (FLOORS)</label>
      <label class="dv-chk"><input type="checkbox" id="devGod"> GOD MODE</label>
      <label class="dv-chk"><input type="checkbox" id="devDmg"> DAMAGE ×20</label>
    </div>
    <h4>RUNES <span id="devRuneSum" style="color:var(--dim)"></span></h4>
    <div class="dv-row" style="margin-bottom:8px">
      <button class="dv-btn" id="devRuneClear">CLEAR</button>
      <button class="dv-btn" id="devRuneRandom">RANDOM FOUR</button>
      <button class="dv-btn" id="devRuneCopy">COPY THIS RUN'S</button>
      <label class="dv-chk"><input type="checkbox" id="devSeal"> SEAL THE PATH TO THESE</label>
    </div>
    <div class="dv-runes" id="devRunes"></div>
    <div class="dv-hint">tap a rune to add a stack (up to ×9) · − takes one away · none picked = the gunslinger's usual start</div>
    <button class="menu-btn dv-start" id="devStart">START TEST RUN</button>
  </div>`;
  document.body.appendChild(el);

  const runesBox = $("devRunes");
  for (const id of RUNE_IDS) {
    const R = RUNES[id], d = document.createElement("div");
    d.className = "dv-rune"; d.dataset.id = id; d.style.setProperty("--rc", R.color);
    d.innerHTML = `<button class="dv-add" title="add a stack"><span class="g">${R.glyph}</span><span class="n">${R.name}</span><span class="c"></span></button><button class="dv-sub" title="remove a stack">−</button>`;
    d.querySelector(".dv-add").addEventListener("click", () => { Dev.cfg.runes[id] = Math.min(DEV_MAX_STACKS, (Dev.cfg.runes[id] | 0) + 1); devRefreshRunes(); devSaveCfg(); });
    d.querySelector(".dv-sub").addEventListener("click", () => { Dev.cfg.runes[id] = Math.max(0, (Dev.cfg.runes[id] | 0) - 1); if (!Dev.cfg.runes[id]) delete Dev.cfg.runes[id]; devRefreshRunes(); devSaveCfg(); });
    runesBox.appendChild(d);
  }
  $("devRuneClear").addEventListener("click", () => { Dev.cfg.runes = {}; devRefreshRunes(); devSaveCfg(); });
  $("devRuneRandom").addEventListener("click", () => {
    Dev.cfg.runes = {};
    const pool = RUNE_IDS.slice();
    for (let i = 0; i < 4; i++) { const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; Dev.cfg.runes[id] = 1 + Math.floor(Math.random() * 3); }
    devRefreshRunes(); devSaveCfg();
  });
  $("devRuneCopy").addEventListener("click", () => {
    const p = players.length ? localPlayer() : null;
    if (!p) { toast("NO RUN TO COPY FROM"); return; }
    Dev.cfg.runes = Object.assign({}, p.runes);
    devRefreshRunes(); devSaveCfg();
  });
  const bind = (id, key, read) => $(id).addEventListener("change", () => { Dev.cfg[key] = read($(id)); devSaveCfg(); });
  bind("devChar", "char", e => e.value);
  bind("devDest", "dest", e => e.value);
  $("devHard").addEventListener("change", () => {
    const v = $("devHard").value;
    Dev.cfg.hard = v === "2"; Dev.cfg.chaos = v === "3"; Dev.cfg.classic = v === "1"; devSaveCfg();
  });
  bind("devLap", "lap", e => +e.value);
  bind("devWave", "wave", e => e.value === "" ? "" : +e.value);
  bind("devWake", "wake", e => e.checked);
  bind("devGod", "god", e => e.checked);
  bind("devDmg", "dmg", e => e.checked);
  bind("devSeal", "seal", e => e.checked);
  $("devGodLive").addEventListener("change", e => { Dev.god = e.target.checked; Dev.cfg.god = Dev.god; $("devGod").checked = Dev.god; devSaveCfg(); });
  $("devDmgLive").addEventListener("change", e => { Dev.dmgMul = e.target.checked ? 20 : 1; Dev.cfg.dmg = e.target.checked; $("devDmg").checked = e.target.checked; devSaveCfg(); });
  el.querySelectorAll("[data-live]").forEach(b => b.addEventListener("click", () => {
    const fn = DEV_LIVE[b.dataset.live];
    devClose();
    if (Game.state === "pause") setState("play");
    try { fn(); } catch (err) { console.error("test tools —", b.dataset.live, err); toast("THAT DIDN'T WORK HERE"); }
  }));
  $("devClose").addEventListener("click", devClose);
  $("devStart").addEventListener("click", devStartRun);
}
function devRefreshRunes() {
  let n = 0;
  document.querySelectorAll("#devRunes .dv-rune").forEach(d => {
    const k = Dev.cfg.runes[d.dataset.id] | 0;
    d.classList.toggle("on", k > 0);
    d.querySelector(".c").textContent = k ? "×" + k : "";
    if (k) n++;
  });
  $("devRuneSum").textContent = n ? "· " + n + " PICKED" : "· NONE PICKED";
}
function devOpen(from) {
  if (!DEV_TOOLS) return;
  devBuild();
  Dev.from = from;
  const c = Dev.cfg;
  $("devChar").value = c.char; $("devDest").value = c.dest; $("devHard").value = c.classic ? "1" : c.chaos ? "3" : c.hard ? "2" : "0";
  $("devLap").value = String(c.lap | 0); $("devWave").value = c.wave;
  $("devWake").checked = !!c.wake; $("devGod").checked = !!c.god; $("devDmg").checked = !!c.dmg; $("devSeal").checked = !!c.seal;
  $("devGodLive").checked = Dev.god; $("devDmgLive").checked = Dev.dmgMul > 1;
  $("devLive").style.display = from === "pause" ? "" : "none";
  $("devUnkLive").style.display = Game.inUnknown ? "" : "none";
  $("devRuneCopy").style.display = from === "pause" ? "" : "none";
  devRefreshRunes();
  $("devPanel").classList.add("on");
}
function devClose() { const el = $("devPanel"); if (el) el.classList.remove("on"); }
function devIsOpen() { const el = $("devPanel"); return !!(el && el.classList.contains("on")); }

/* ---------- wiring ---------- */
Dev.cfg = devLoadCfg();
function devToolsOn() { return DEV_TOOLS; }
function devSyncEntryPoints() {
  for (const id of ["btnDev", "btnDevPause"]) {
    const b = $(id);
    if (b) b.style.display = DEV_TOOLS ? "" : "none";
  }
}
/* the console's `devtools` command flips this; nothing else does */
function devSetTools(on) {
  DEV_TOOLS = !!on;
  try { localStorage.setItem(DEV_FLAG_KEY, DEV_TOOLS ? "1" : "0"); } catch (e) {}
  devSyncEntryPoints();
  if (!DEV_TOOLS) devClose();
  return DEV_TOOLS;
}
devSyncEntryPoints();
for (const [id, from] of [["btnDev", "menu"], ["btnDevPause", "pause"]]) {
  const b = $(id);
  if (b) b.addEventListener("click", () => { if (DEV_TOOLS) devOpen(from); });
}
