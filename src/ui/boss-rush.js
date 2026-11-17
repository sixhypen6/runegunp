/* =========================================================
   RUNEGUN · THE TITHE — the altar of the GAUNTLET
   Buy runes for the next seat at the altar. A carved stack locks
   the moment the fight begins; THE TITHE refunds only what *this*
   visit sold.
   ========================================================= */
"use strict";

/* the altar pool grows with the bracket: 5 + 2 per warden felled */
function gauntletPool() { return BOSS_RUSH_TITHE_START + BOSS_RUSH_TITHE_PER_BOSS * (Game.gauntletStep || 0); }
function gauntletPointsLeft(p) {
  if (!p) return 0;
  return gauntletPool() - (pvpSpent(p) - (Game.gauntletStartSpent || 0));
}
function gauntletLocked(id) { return (Game.gauntletLocked && (Game.gauntletLocked[id] | 0)) || 0; }

const BR_CSS = `
  #gauntletTithe{position:fixed;inset:0;z-index:40;display:none;background:rgba(5,4,12,.985);overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--bone);font-family:inherit;pointer-events:auto;user-select:none}
  #gauntletTithe.on{display:block}
  #gauntletTithe .br-box{max-width:840px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}
  #gauntletTithe .br-head{display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:1;background:rgba(5,4,12,.98);padding:max(10px,env(safe-area-inset-top)) 0 10px;border-bottom:1px solid var(--line)}
  #gauntletTithe .br-title{font-size:13px;letter-spacing:.35em;color:var(--gold);white-space:nowrap}
  #gauntletTithe .br-note{flex:1;min-width:0;font-size:9px;letter-spacing:.12em;color:var(--dim)}
  #gauntletTithe .br-bar{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;padding:12px 0 2px}
  #gauntletTithe .br-points{font-size:22px;letter-spacing:.08em;color:var(--gold)}
  #gauntletTithe .br-meta{font-size:10px;letter-spacing:.16em;color:var(--dim)}
  #gauntletTithe h4{font-size:10px;letter-spacing:.3em;color:var(--arcane);margin:16px 0 8px;font-weight:normal}
  #gauntletTithe .br-chars{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
  #gauntletTithe .br-char{display:flex;align-items:center;gap:7px;min-width:0;font-family:inherit;font-size:9px;letter-spacing:.08em;color:var(--dim);background:#0f0d1c;border:1px solid var(--line);padding:8px 7px;cursor:pointer;text-align:left}
  #gauntletTithe .br-char .g{font-size:16px;line-height:1;color:var(--cc)}
  #gauntletTithe .br-char .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #gauntletTithe .br-char.on{border-color:var(--gold);color:var(--bone);background:rgba(255,210,61,.06)}
  #gauntletTithe .br-char:disabled{opacity:.35;cursor:default}
  #gauntletTithe .br-runes{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}
  #gauntletTithe .br-rune{display:flex;min-width:0;border:1px solid var(--line);background:#0f0d1c}
  #gauntletTithe .br-rune.on{border-color:var(--rc)}
  #gauntletTithe .br-rune.off{opacity:.42}
  #gauntletTithe .br-add{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-family:inherit;font-size:9px;letter-spacing:.06em;color:var(--dim);background:none;border:0;padding:7px 6px;cursor:pointer;text-align:left}
  #gauntletTithe .br-rune.on .br-add{color:var(--bone)}
  #gauntletTithe .br-add .g{font-size:16px;line-height:1;color:var(--rc)}
  #gauntletTithe .br-add .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #gauntletTithe .br-add .c{margin-left:auto;font-size:10px;color:var(--gold);white-space:nowrap}
  #gauntletTithe .br-sub{width:24px;flex:none;font-family:inherit;font-size:14px;color:var(--blood);background:none;border:0;border-left:1px solid var(--line);cursor:pointer}
  #gauntletTithe .br-sub:disabled{opacity:.3;cursor:default}
  #gauntletTithe .br-hint{font-size:9px;letter-spacing:.1em;color:var(--dim);margin-top:8px;line-height:1.7}
  #gauntletTithe .br-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  #gauntletTithe .br-actions{margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
  #gauntletTithe .br-btn{font-family:inherit;font-size:10px;letter-spacing:.16em;color:var(--bone);background:rgba(20,18,38,.85);border:1px solid var(--line);padding:9px 11px;cursor:pointer}
  #gauntletTithe .br-btn:hover,#gauntletTithe .br-btn:active{border-color:var(--arcane);color:#fff}
  #gauntletTithe .br-btn:disabled{opacity:.4;cursor:default}
  #gauntletTithe .br-start{flex:1;min-width:190px;border-color:var(--gold);color:var(--gold)}`;

const BossRushTithe = {
  built: false,
  build() {
    if (this.built) return;
    this.built = true;
    const st = document.createElement("style");
    st.textContent = BR_CSS;
    document.head.appendChild(st);
    const el = document.createElement("div");
    el.id = "gauntletTithe";
    el.innerHTML = `
    <div class="br-box">
      <div class="br-head">
        <span class="br-title" id="brTitle">THE TITHE</span>
        <span class="br-note" id="brNote">the altar exacts its price — what it carves, it keeps, and what it keeps never returns</span>
      </div>
      <div class="br-bar">
        <span class="br-points" id="brPoints">5 / 5</span>
        <span class="br-meta" id="brMeta">POINTS LEFT · NEXT: I — THE CHAINED WARDEN</span>
      </div>
      <h4>WARDEN</h4>
      <div class="br-chars" id="brChars"></div>
      <h4>RUNES</h4>
      <div class="br-runes" id="brRunes"></div>
      <div class="br-hint" id="brHint">tap a rune to carve a stack · − refunds what <em>this visit</em> sold · everything carved before this visit is locked in stone · wardens are locked once the first warden falls</div>
      <div class="br-row br-actions">
        <button class="br-btn" id="brClear">REFUND THE VISIT</button>
        <button class="br-btn" id="brRandom">RANDOM</button>
        <button class="br-btn br-start" id="brStart">BEGIN THE GAUNTLET</button>
      </div>
    </div>`;
    document.body.appendChild(el);

    const chars = $("brChars");
    for (const id of Object.keys(CHARS)) {
      const C = CHARS[id], b = document.createElement("button");
      b.className = "br-char"; b.dataset.id = id;
      b.style.setProperty("--cc", C.color);
      b.innerHTML = `<span class="g">${C.glyph}</span><span class="n">${C.name}</span>`;
      b.addEventListener("click", () => BossRushTithe.changeChar(id));
      chars.appendChild(b);
    }

    const grid = $("brRunes");
    for (const id of RUNE_IDS) {
      const R = RUNES[id], d = document.createElement("div");
      d.className = "br-rune"; d.dataset.id = id; d.style.setProperty("--rc", R.color);
      d.innerHTML = `<button class="br-add" title="buy a stack"><span class="g">${R.glyph}</span><span class="n">${R.name}</span><span class="c"></span></button><button class="br-sub" title="refund this visit's stack">−</button>`;
      d.querySelector(".br-add").addEventListener("click", () => BossRushTithe.buy(id));
      d.querySelector(".br-sub").addEventListener("click", () => BossRushTithe.sell(id));
      grid.appendChild(d);
    }

    $("brClear").addEventListener("click", () => BossRushTithe.clear());
    $("brRandom").addEventListener("click", () => BossRushTithe.random());
    $("brStart").addEventListener("click", () => BossRushTithe.start());
  },

  visibleRunes(p) {
    return RUNE_IDS.filter(id => !RUNES[id].hidden || (p.runes[id] | 0) > 0);
  },

  refresh() {
    this.build();
    const p = localPlayer(); if (!p) return;
    /* snapshot on open: everything carved so far is carved forever */
    if (!Game.gauntletLocked) Game.gauntletLocked = Object.assign({}, p.runes);
    const left = gauntletPointsLeft(p), pool = gauntletPool();
    $("brPoints").textContent = left + " / " + pool;
    const spec = BOSS_RUSH_FIGHTS[Game.gauntletStep];
    const cleared = Game.gauntletStep || 0;
    $("brMeta").textContent = "POINTS LEFT · " + (pvpSpent(p) - (Game.gauntletStartSpent || 0)) + " SPENT · "
      + (spec ? "NEXT: " + ROMAN(cleared + 1) + " OF IX — " + spec.name : "THE BRACKET IS COMPLETE");
    $("brStart").textContent = cleared === 0 ? "BEGIN THE GAUNTLET" : "PRESS ONWARD";
    document.querySelectorAll("#brChars .br-char").forEach(b => {
      b.classList.toggle("on", b.dataset.id === p.char);
      b.disabled = cleared > 0;                       // the warden locks with the first fall
    });
    const wanted = new Set(this.visibleRunes(p));
    document.querySelectorAll("#brRunes .br-rune").forEach(d => {
      const id = d.dataset.id, held = p.runes[id] | 0;
      d.style.display = wanted.has(id) ? "" : "none";
      const cost = pvpStackCost(p, id, held + 1);
      d.classList.toggle("on", held > gauntletLocked(id));
      d.classList.toggle("off", held === 0 && cost > left);
      d.querySelector(".c").textContent = held
        ? "×" + held + " · " + cost
        : String(cost);
      d.querySelector(".br-sub").disabled = held <= gauntletLocked(id);
    });
  },

  /* ---------- open / close ---------- */
  open() {
    this.build();
    const p = localPlayer();
    if (!p) { toast("NO WARDEN AT THE ALTAR"); return; }
    /* each visit starts with an honest ledger of what this altar refuses to give back */
    Game.gauntletLocked = Object.assign({}, p.runes);
    Game.gauntletStartSpent = pvpSpent(p);
    this.refresh();
    $("gauntletTithe").classList.add("on");
    AudioFX.click();
  },
  close() {
    const el = $("gauntletTithe");
    if (el) el.classList.remove("on");
  },
  isOpen() {
    const el = $("gauntletTithe");
    return !!(el && el.classList.contains("on"));
  },

  /* ---------- edits ---------- */
  buy(id) {
    const p = localPlayer(); if (!p) return;
    const held = p.runes[id] | 0;
    const cost = pvpStackCost(p, id, held + 1);
    if (gauntletPointsLeft(p) < cost) { toast("NOT ENOUGH POINTS — " + cost + " NEEDED"); return; }
    p.runes[id] = held + 1;
    recalc(p);
    AudioFX.equip();
    this.refresh();
  },
  sell(id) {
    const p = localPlayer(); if (!p) return;
    const held = p.runes[id] | 0;
    if (held <= gauntletLocked(id)) { toast("THAT IS CARVED IN STONE — THE ALTAR KEEPS IT"); return; }
    p.runes[id] = held - 1;
    if (!p.runes[id]) delete p.runes[id];
    recalc(p);
    AudioFX.click();
    this.refresh();
  },
  clear() {
    const p = localPlayer(); if (!p) return;
    for (const id in p.runes) {
      const floor = gauntletLocked(id);
      if (p.runes[id] > floor) p.runes[id] = floor;
    }
    recalc(p);
    AudioFX.click();
    this.refresh();
  },
  random() {
    const p = localPlayer(); if (!p) return;
    const pool = RUNE_IDS.filter(id => !RUNES[id].hidden);
    for (let guard = 0; guard < 80; guard++) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (gauntletPointsLeft(p) < pvpStackCost(p, id, (p.runes[id] | 0) + 1)) continue;
      this.buy(id);
    }
  },
  changeChar(id) {
    const p = localPlayer(); if (!p || !CHARS[id]) return;
    if ((Game.gauntletStep || 0) > 0) { toast("THE WARDEN IS LOCKED — THE FIRST FALL HAS BEEN PAID"); return; }
    if (id === p.char) return;
    p.char = id;
    /* a warden trade refunds the whole altar's bill — every price re-rolls */
    for (const rune in p.runes) {
      const keep = gauntletLocked(rune);
      if (p.runes[rune] > keep) p.runes[rune] = keep;
    }
    recalc(p);
    p.hp = p.maxHp;
    updateHp();
    toast(CHARS[id].name + " TAKES THE ALTAR — THE BILL IS REROLLED");
    AudioFX.equip();
    this.refresh();
  },

  /* ---------- the fights ---------- */
  start() {
    const p = localPlayer(); if (!p) return;
    /* the altar locks the visit when the bell rings */
    Game.gauntletLocked = Object.assign({}, p.runes);
    this.close();
    AudioFX.waveUp();
    setupGauntletArena(Game.gauntletStep);
    gauntletWake(Game.gauntletStep);
    setState("play");
  },
};

function openGauntletTithe() { BossRushTithe.open(); }

/* =========================================================
   I/O helpers used by both modules (kept here because the UI
   and the stage rules share the ledger names)
   ========================================================= */
function gauntletWake(step) {
  const spec = BOSS_RUSH_FIGHTS[step];
  if (!spec || spec.kind === 8) return;   // THE UNKNOWN stages itself
  spawnBoss(spec.kind);                   // the arrival, the toast, the banner — all of it
}
