/* =========================================================
   RUNEGUN · VERSUS LOADOUT (test build)
   The simple front door to game/pvp.js: each warden picks their own character
   and spends the point pool on runes, using the TEST TOOLS rune grid. Named
   loadouts cover the usual play-styles; a player can also save their own.
   The host starts the match; a guest's picks are validated by the host
   (net/coop.js).
   ========================================================= */
"use strict";

/* player-made loadouts live on this device only — they are preferences, not
   match state, so they are never sent to the partner */
const PVP_CUSTOM_KEY = "runegun:pvp:loadouts";
const PVP_CUSTOM_MAX = 12;

function pvpCustomLoadouts() {
  try {
    const raw = JSON.parse(localStorage.getItem(PVP_CUSTOM_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(o => {
      if (!o || typeof o !== "object" || !o.runes) return null;
      const runes = {};
      for (const id in o.runes) {
        const n = o.runes[id] | 0;
        if (RUNES[id] && n > 0) runes[id] = Math.min(99, n);
      }
      if (!Object.keys(runes).length) return null;
      return { name: String(o.name || "CUSTOM").slice(0, 18).toUpperCase(), runes };
    }).filter(Boolean).slice(0, PVP_CUSTOM_MAX);
  } catch (e) { return []; }
}
function pvpCustomSave(list) {
  try { localStorage.setItem(PVP_CUSTOM_KEY, JSON.stringify(list)); } catch (e) {}
}

const PvpPanel = {
  built: false,
  _p: null,

  /* ---------- construction ---------- */
  build() {
    if (this.built) return;
    this.built = true;
    const st = document.createElement("style");
    st.textContent = `
    #pvpPanel{position:fixed;inset:0;z-index:40;display:none;background:rgba(5,4,12,.985);overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--bone);font-family:inherit;pointer-events:auto;user-select:none}
    #pvpPanel.on{display:block}
    #pvpPanel .pv-box{max-width:840px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}
    #pvpPanel .pv-head{display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:1;background:rgba(5,4,12,.98);padding:max(10px,env(safe-area-inset-top)) 0 10px;border-bottom:1px solid var(--line)}
    #pvpPanel .pv-title{font-size:13px;letter-spacing:.35em;color:var(--gold);white-space:nowrap}
    #pvpPanel .pv-note{flex:1;min-width:0;font-size:9px;letter-spacing:.12em;color:var(--dim)}
    #pvpPanel h4{font-size:10px;letter-spacing:.3em;color:var(--arcane);margin:16px 0 8px;font-weight:normal}
    #pvpPanel .pv-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    #pvpPanel .pv-btn{font-family:inherit;font-size:10px;letter-spacing:.16em;color:var(--bone);background:rgba(20,18,38,.85);border:1px solid var(--line);padding:9px 11px;cursor:pointer}
    #pvpPanel .pv-btn:hover,#pvpPanel .pv-btn:active{border-color:var(--arcane);color:#fff}
    #pvpPanel .pv-btn:disabled{opacity:.4;cursor:default}
    #pvpPanel .pv-btn.warn{border-color:#5e2230;color:var(--blood)}
    #pvpPanel .pv-close{margin-left:auto}
    #pvpPanel .pv-bar{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;padding:12px 0 2px}
    #pvpPanel .pv-points{font-size:22px;letter-spacing:.08em;color:var(--gold)}
    #pvpPanel .pv-points.low{color:var(--blood)}
    #pvpPanel .pv-meta{font-size:10px;letter-spacing:.16em;color:var(--dim)}
    #pvpPanel .pv-chars{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
    #pvpPanel .pv-char{display:flex;align-items:center;gap:7px;min-width:0;font-family:inherit;font-size:9px;letter-spacing:.08em;color:var(--dim);background:#0f0d1c;border:1px solid var(--line);padding:8px 7px;cursor:pointer;text-align:left}
    #pvpPanel .pv-char .g{font-size:16px;line-height:1;color:var(--cc)}
    #pvpPanel .pv-char .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #pvpPanel .pv-char.on{border-color:var(--gold);color:var(--bone);background:rgba(255,210,61,.06)}
    #pvpPanel .pv-loadouts{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px}
    #pvpPanel .pv-loadout{display:flex;min-width:0;background:#0f0d1c;border:1px solid var(--line)}
    #pvpPanel .pv-loadout-apply{flex:1;min-width:0;font-family:inherit;font-size:9px;letter-spacing:.08em;color:var(--dim);background:none;border:0;padding:8px 10px;cursor:pointer;text-align:left;line-height:1.55}
    #pvpPanel .pv-loadout-apply b{display:block;font-weight:normal;color:var(--gold);letter-spacing:.18em;font-size:9px}
    #pvpPanel .pv-loadout-apply:hover,#pvpPanel .pv-loadout-apply:active{color:var(--bone)}
    #pvpPanel .pv-loadout:hover,#pvpPanel .pv-loadout:active{border-color:var(--arcane)}
    #pvpPanel .pv-loadout.custom{border-color:rgba(157,107,255,.45)}
    #pvpPanel .pv-loadout-x{width:26px;flex:none;font-family:inherit;font-size:12px;color:var(--blood);background:none;border:0;border-left:1px solid var(--line);cursor:pointer}
    #pvpPanel .pv-custom-none{font-size:9px;letter-spacing:.12em;color:var(--dim);padding:4px 0}
    #pvpPanel .pv-save{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    #pvpPanel .pv-save input{flex:1;min-width:150px;font-family:inherit;font-size:11px;letter-spacing:.12em;background:#0f0d1c;color:var(--bone);border:1px solid var(--line);padding:8px 9px;border-radius:0}
    #pvpPanel .pv-save input::placeholder{color:var(--dim)}
    #pvpPanel .pv-runes{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}
    #pvpPanel .pv-rune{display:flex;min-width:0;border:1px solid var(--line);background:#0f0d1c}
    #pvpPanel .pv-rune.on{border-color:var(--rc)}
    #pvpPanel .pv-rune.off{opacity:.42}
    #pvpPanel .pv-add{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-family:inherit;font-size:9px;letter-spacing:.06em;color:var(--dim);background:none;border:0;padding:7px 6px;cursor:pointer;text-align:left}
    #pvpPanel .pv-rune.on .pv-add{color:var(--bone)}
    #pvpPanel .pv-add .g{font-size:16px;line-height:1;color:var(--rc)}
    #pvpPanel .pv-add .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #pvpPanel .pv-add .c{margin-left:auto;font-size:10px;color:var(--gold);white-space:nowrap}
    #pvpPanel .pv-sub{width:24px;flex:none;font-family:inherit;font-size:14px;color:var(--blood);background:none;border:0;border-left:1px solid var(--line);cursor:pointer}
    #pvpPanel .pv-hint{font-size:9px;letter-spacing:.1em;color:var(--dim);margin-top:8px;line-height:1.7}
    #pvpPanel .pv-actions{margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
    #pvpPanel .pv-start{flex:1;min-width:180px;border-color:var(--gold);color:var(--gold)}
    #pvpPanel .pv-wait{font-size:9px;letter-spacing:.16em;color:var(--dim)}`;
    document.head.appendChild(st);

    const el = document.createElement("div");
    el.id = "pvpPanel";
    el.innerHTML = `
    <div class="pv-box">
      <div class="pv-head">
        <span class="pv-title">VERSUS LOADOUT</span>
        <span class="pv-note" id="pvNote">each warden picks on their own screen · the host starts the match</span>
        <button class="pv-btn pv-close" id="pvClose">CLOSE ✕</button>
      </div>
      <div class="pv-bar">
        <span class="pv-points" id="pvPoints">18 / 18</span>
        <span class="pv-meta" id="pvMeta">POINTS LEFT</span>
      </div>
      <h4>WARDEN <span style="color:var(--dim)" id="pvWardenName"></span></h4>
      <div class="pv-chars" id="pvChars"></div>
      <h4>LOADOUTS</h4>
      <div class="pv-loadouts" id="pvLoadouts"></div>
      <h4>MY LOADOUTS</h4>
      <div class="pv-loadouts" id="pvCustom"></div>
      <div class="pv-save">
        <input id="pvSaveName" maxlength="18" placeholder="NAME THIS LOADOUT" autocomplete="off" spellcheck="false">
        <button class="pv-btn" id="pvSave">SAVE CURRENT</button>
      </div>
      <h4>RUNES</h4>
      <div class="pv-runes" id="pvRunes"></div>
      <div class="pv-hint">tap a rune to buy a stack · − refunds it · switching warden refunds the whole loadout</div>
      <div class="pv-row pv-actions">
        <button class="pv-btn" id="pvClear">CLEAR</button>
        <button class="pv-btn" id="pvRandom">RANDOM</button>
        <button class="pv-btn pv-start" id="pvStart">SEAL &amp; START</button>
        <span class="pv-wait" id="pvWait"></span>
      </div>
    </div>`;
    document.body.appendChild(el);

    /* the warden row — any gunslinger can be tested in versus */
    const chars = $("pvChars");
    for (const id of Object.keys(CHARS)) {
      const C = CHARS[id], b = document.createElement("button");
      b.className = "pv-char"; b.dataset.id = id;
      b.style.setProperty("--cc", C.color);
      b.innerHTML = `<span class="g">${C.glyph}</span><span class="n">${C.name}</span>`;
      b.addEventListener("click", () => PvpPanel.changeChar(id));
      chars.appendChild(b);
    }

    /* built-in loadouts */
    const loadouts = $("pvLoadouts");
    PVP_LOADOUTS.forEach((loadout, i) => {
      const b = document.createElement("button");
      b.className = "pv-loadout-apply";
      b.innerHTML = `<b>${loadout.name}</b>${loadout.desc}`;
      b.addEventListener("click", () => PvpPanel.loadout(i));
      const box = document.createElement("div");
      box.className = "pv-loadout";
      box.appendChild(b);
      loadouts.appendChild(box);
    });

    /* the rune grid — same cell contract as TEST TOOLS */
    const grid = $("pvRunes");
    for (const id of RUNE_IDS) {
      const R = RUNES[id], d = document.createElement("div");
      d.className = "pv-rune"; d.dataset.id = id; d.style.setProperty("--rc", R.color);
      d.innerHTML = `<button class="pv-add" title="buy a stack"><span class="g">${R.glyph}</span><span class="n">${R.name}</span><span class="c"></span></button><button class="pv-sub" title="refund a stack">−</button>`;
      d.querySelector(".pv-add").addEventListener("click", () => PvpPanel.buy(id));
      d.querySelector(".pv-sub").addEventListener("click", () => PvpPanel.sell(id));
      grid.appendChild(d);
    }

    $("pvClose").addEventListener("click", () => PvpPanel.close());
    $("pvClear").addEventListener("click", () => PvpPanel.clear());
    $("pvRandom").addEventListener("click", () => PvpPanel.random());
    $("pvStart").addEventListener("click", () => PvpPanel.start());
    $("pvSave").addEventListener("click", () => PvpPanel.saveCurrent());
    $("pvSaveName").addEventListener("keydown", e => {
      /* typing a name is text, not a game action */
      e.stopPropagation();
      if (e.key === "Enter") PvpPanel.saveCurrent();
    });
  },

  /* ---------- open / close ---------- */
  open() {
    if (typeof Net === "undefined" || !Net.active || typeof Coop === "undefined" || !Coop.running) {
      toast("VERSUS NEEDS A LIVE SHARED DESCENT");
      return;
    }
    this.build();
    this._p = localPlayer() || players[0];
    if (!this._p) { toast("NO WARDEN TO OUTFIT"); return; }
    this.refresh();
    $("pvpPanel").classList.add("on");
    AudioFX.click();
  },
  close() {
    const el = $("pvpPanel");
    if (el) el.classList.remove("on");
  },
  isOpen() {
    const el = $("pvpPanel");
    return !!(el && el.classList.contains("on"));
  },
  /* the snapshot told a guest the host has begun — get out of the way */
  onMatchStart() {
    if (this.isOpen()) this.close();
    toast("VERSUS — LAST WARDEN STANDING");
  },

  /* ---------- state ---------- */
  canEdit() {
    return !Game.pvpMode && typeof Net !== "undefined" && Net.active &&
      typeof Coop !== "undefined" && Coop.running;
  },
  visibleRunes(p) {
    return RUNE_IDS.filter(id => !RUNES[id].hidden || (p.runes[id] | 0) > 0);
  },
  refresh() {
    this.build();
    const p = this._p || localPlayer();
    if (!p) return;
    this._p = p;
    const left = pvpPointsLeft(p), base = pvpBasePoints(p);
    $("pvPoints").textContent = left + " / " + base;
    $("pvPoints").classList.toggle("low", left <= 0);
    $("pvMeta").textContent = "POINTS LEFT · " + pvpSpent(p) + " SPENT";
    $("pvWardenName").textContent = "· " + CHARS[p.char].name;
    document.querySelectorAll("#pvChars .pv-char").forEach(b =>
      b.classList.toggle("on", b.dataset.id === p.char));

    const sealed = !this.canEdit();
    /* hidden runes only earn a place in the grid once one is actually held */
    const wanted = new Set(this.visibleRunes(p));
    document.querySelectorAll("#pvRunes .pv-rune").forEach(d => {
      const id = d.dataset.id, held = p.runes[id] | 0;
      d.style.display = wanted.has(id) ? "" : "none";
      const cost = pvpStackCost(p, id, held + 1);
      d.classList.toggle("on", held > 0);
      d.classList.toggle("off", !sealed && held === 0 && cost > left);
      d.querySelector(".c").textContent = held
        ? "×" + held + (sealed ? "" : " · " + cost)
        : (sealed ? "" : String(cost));
      d.querySelector(".pv-add").disabled = sealed;
      d.querySelector(".pv-sub").disabled = sealed;
    });

    document.querySelectorAll("#pvChars .pv-char").forEach(b => b.disabled = sealed);
    document.querySelectorAll("#pvLoadouts .pv-loadout-apply").forEach(b => b.disabled = sealed);
    $("pvClear").disabled = sealed;
    $("pvRandom").disabled = sealed;
    $("pvSave").disabled = sealed;
    $("pvSaveName").disabled = sealed;
    this.renderCustom();

    const host = typeof Net !== "undefined" && Net.role === "host";
    const start = $("pvStart"), wait = $("pvWait");
    if (Game.pvpMode) {
      start.disabled = true; start.textContent = "MATCH LIVE";
      wait.textContent = "";
    } else if (host) {
      start.disabled = false; start.textContent = "SEAL & START";
      wait.textContent = "the guest's picks are already synced";
    } else {
      start.disabled = true; start.textContent = "WAITING FOR THE HOST";
      wait.textContent = "your loadout is sent to the host as you edit";
    }
  },

  /* draw the saved loadouts; each tile applies, its × deletes */
  renderCustom() {
    const box = $("pvCustom");
    if (!box) return;
    const list = pvpCustomLoadouts();
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = `<div class="pv-custom-none">none saved yet — build a loadout and name it below</div>`;
      return;
    }
    list.forEach((loadout, i) => {
      const ids = Object.keys(loadout.runes);
      const desc = ids.map(id => RUNES[id].glyph + " " + RUNES[id].name +
        (loadout.runes[id] > 1 ? " ×" + loadout.runes[id] : "")).join(" · ");
      const tile = document.createElement("div");
      tile.className = "pv-loadout custom";
      tile.innerHTML = `<button class="pv-loadout-apply"><b></b>${desc}</button><button class="pv-loadout-x" title="delete this loadout">✕</button>`;
      tile.querySelector("b").textContent = loadout.name;
      tile.querySelector(".pv-loadout-apply").addEventListener("click", () => PvpPanel.useCustom(i));
      tile.querySelector(".pv-loadout-x").addEventListener("click", e => {
        e.stopPropagation();
        PvpPanel.deleteCustom(i);
      });
      box.appendChild(tile);
    });
  },

  /* a local edit was made: repaint, then tell the other screen */
  changed() {
    this.refresh();
    if (typeof Net === "undefined" || !Net.active || typeof Coop === "undefined" || !Coop.running) return;
    const p = localPlayer();
    if (!p) return;
    if (Net.role === "host") {
      if (typeof Coop.resyncEdit === "function") Coop.resyncEdit(true);
    } else if (Net.role === "guest") {
      Net.sendR({ t: "pvpLoadout", pl: [{ idx: Net.localIdx, char: p.char, runes: p.runes }] });
    }
  },

  /* ---------- edits ---------- */
  buy(id) {
    const p = localPlayer();
    if (!p || !this.canEdit()) { toast("THE LOADOUT IS SEALED"); return; }
    const cost = pvpStackCost(p, id, (p.runes[id] | 0) + 1);
    if (pvpPointsLeft(p) < cost) { toast("NOT ENOUGH POINTS — " + cost + " NEEDED"); return; }
    if (pvpBuy(p, id, 1)) { AudioFX.equip(); this.changed(); }
  },
  sell(id) {
    const p = localPlayer();
    if (!p || !this.canEdit()) { toast("THE LOADOUT IS SEALED"); return; }
    if (pvpSell(p, id, 1)) { AudioFX.click(); this.changed(); }
  },
  clear() {
    const p = localPlayer();
    if (!p || !this.canEdit()) return;
    pvpReset(p);
    this.changed();
  },
  random() {
    const p = localPlayer();
    if (!p || !this.canEdit()) return;
    pvpRandomLoadout(p);
    AudioFX.pickup();
    this.changed();
  },
  loadout(i) {
    const p = localPlayer();
    if (!p || !this.canEdit()) return;
    const stacks = pvpApplyLoadout(p, i);
    if (stacks) AudioFX.equip();
    else toast("NOTHING IN THAT LOADOUT FIT THE BUDGET");
    this.changed();
  },
  useCustom(i) {
    const p = localPlayer();
    const loadout = pvpCustomLoadouts()[i];
    if (!p || !this.canEdit() || !loadout) return;
    pvpApplyRunes(p, loadout.runes);
    AudioFX.equip();
    this.changed();
  },
  saveCurrent() {
    const p = localPlayer();
    if (!p || !this.canEdit()) return;
    const runes = {};
    for (const id in p.runes) if (RUNE_IDS.includes(id) && (p.runes[id] | 0) > 0) runes[id] = p.runes[id];
    if (!Object.keys(runes).length) { toast("NOTHING TO SAVE — BUY A RUNE FIRST"); return; }
    const list = pvpCustomLoadouts();
    if (list.length >= PVP_CUSTOM_MAX) { toast("LOADOUT LIST FULL — DELETE ONE FIRST"); return; }
    let name = String($("pvSaveName").value || "").trim().toUpperCase().slice(0, 18);
    if (!name) name = "CUSTOM " + (list.length + 1);
    list.push({ name, runes });
    pvpCustomSave(list);
    $("pvSaveName").value = "";
    this.renderCustom();
    toast("LOADOUT SAVED — " + name);
    AudioFX.waveUp();
  },
  deleteCustom(i) {
    const list = pvpCustomLoadouts();
    if (!list[i]) return;
    const name = list[i].name;
    list.splice(i, 1);
    pvpCustomSave(list);
    this.renderCustom();
    toast("DELETED — " + name);
    AudioFX.click();
  },
  /* switching warden refunds the old loadout: every warden prices runes
     differently, so carrying stacks across would be a hidden discount */
  changeChar(id) {
    const p = localPlayer();
    if (!p || !this.canEdit() || !CHARS[id] || id === p.char) return;
    p.char = id;
    pvpReset(p);                 // refunds + recalc
    p.hp = p.maxHp;
    updateHp();
    toast(CHARS[id].name + " TAKES THE FIELD — LOADOUT REFUNDED");
    AudioFX.equip();
    this.changed();
  },

  /* ---------- start ---------- */
  start() {
    if (typeof Net === "undefined" || Net.role !== "host") { toast("ONLY THE HOST STARTS THE MATCH"); return; }
    if (Game.pvpMode) return;
    const p = localPlayer();
    if (!p) return;
    if (typeof Coop !== "undefined" && Coop.running && typeof Coop.resyncEdit === "function")
      Coop.resyncEdit(true);     // the guest's side is current before the freeze
    try {
      pvpStart();
    } catch (err) {
      toast(String(err && err.message || err).toUpperCase());
      return;
    }
    this.close();
    if (Game.state !== "play") setState("play");
  },
};

/* The pause menu's entry point: only a live shared descent can host a duel. */
{
  const b = $("btnPvpPause");
  if (b) b.addEventListener("click", () => PvpPanel.open());
}
function pvpPanelRefreshEntry() {
  const b = $("btnPvpPause");
  if (!b) return;
  const live = typeof Net !== "undefined" && Net.active &&
    typeof Coop !== "undefined" && Coop.running && !Game.pvpMode;
  b.style.display = live ? "" : "none";
}
