/* =========================================================
   RUNEGUN · Local run console
   F9 / backtick opens a small, allowlisted command console.
   Commands edit the current local run and — for `vault` / `unlock` — the save;
   no arbitrary JS is evaluated. `devtools on` reveals the TEST TOOLS panel.
   ========================================================= */
"use strict";

const RunegunConsole = {
  open: false,
  paused: false,
  history: [],
  historyIndex: -1,
  output: [],
  maxLines: 100,
  eventLog: [],
  maxEventLines: 200,
  viewMode: "cmd",
  lastDigest: "",
  targetIdx: 0,

  init() {
    const style = document.createElement("style");
    style.textContent = `
      #runegunConsole{position:fixed;inset:8% 6%;z-index:100;display:none;flex-direction:column;
        max-width:900px;max-height:80vh;margin:auto;padding:12px;background:rgba(8,7,17,.97);
        border:1px solid #9d6bff;box-shadow:0 0 32px rgba(157,107,255,.28);color:#e8e2d0;
        font:12px "Courier New",monospace;letter-spacing:.04em;pointer-events:auto;user-select:text;-webkit-user-select:text}
      #runegunConsole.on{display:flex}
      #runegunConsole .rg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;
        padding-bottom:8px;border-bottom:1px solid #2c2a45;color:#c9b8ff}
      #runegunConsole .rg-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      #runegunConsole button{padding:5px 9px;border:1px solid #45415f;background:#171426;color:#e8e2d0;
        font:10px "Courier New",monospace;letter-spacing:.1em}
      #runegunConsole button:active{border-color:#9d6bff}
      #runegunConsole button[disabled]{opacity:.38}
      #runegunConsole .rg-output{flex:1;min-height:120px;overflow:auto;padding:8px 2px;white-space:pre-wrap;
        overflow-wrap:anywhere;color:#c8c4d6;line-height:1.5}
      #runegunConsole .rg-input{display:flex;gap:8px;align-items:center;border-top:1px solid #2c2a45;padding-top:8px;color:#7dff5e}
      #runegunConsole input{flex:1;min-width:0;padding:8px;background:#100e1b;border:1px solid #45415f;
        color:#e8e2d0;font:12px "Courier New",monospace;user-select:text;-webkit-user-select:text}
      #runegunConsole .rg-help{padding-top:6px;color:#8a86a0;font-size:9px}
    `;
    document.head.appendChild(style);
    const box = document.createElement("section");
    box.id = "runegunConsole";
    box.setAttribute("aria-label", "Runegun run console");
    box.innerHTML = `<div class="rg-head"><span>LOCAL RUN CONSOLE · F9 / BACKTICK</span><span class="rg-actions"><button type="button" id="rgCopy" disabled title="Copy the last SHA-256 digest">COPY DIGEST</button><button type="button" id="rgClear">CLEAR</button><button type="button" id="rgToggleView">VIEW: CMD</button><button type="button" id="rgClose">CLOSE</button></span></div>
      <div class="rg-output" id="rgOutput" role="log" aria-live="polite"></div>
      <form class="rg-input" id="rgForm"><span>&gt;</span><input id="rgCommand" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Console command"></form>
      <div class="rg-help">Type help for the full command list · VIEW toggles commands / event log · devtools on reveals TEST TOOLS</div>`;
    document.body.appendChild(box);
    this.box = box;
    this.input = box.querySelector("#rgCommand");
    this.outputEl = box.querySelector("#rgOutput");
    this.copyBtn = box.querySelector("#rgCopy");
    box.querySelector("#rgClose").addEventListener("click", () => this.toggle(false));
    box.querySelector("#rgCopy").addEventListener("click", () => this.copyDigest());
    box.querySelector("#rgClear").addEventListener("click", () => { this.output = []; this.render(); });
    box.querySelector("#rgToggleView").addEventListener("click", () => {
      this.viewMode = this.viewMode === "cmd" ? "events" : "cmd";
      box.querySelector("#rgToggleView").textContent = "VIEW: " + (this.viewMode === "cmd" ? "CMD" : "EVENTS");
      this.render();
    });
    box.querySelector("#rgForm").addEventListener("submit", e => {
      e.preventDefault();
      const command = this.input.value;
      this.input.value = "";
      this.historyIndex = -1;
      this.execute(command);
      this.input.focus();
    });
    this.input.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.historyIndex < this.history.length - 1) this.historyIndex++;
        this.input.value = this.history[this.history.length - 1 - this.historyIndex] || "";
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (this.historyIndex > 0) this.historyIndex--;
        else this.historyIndex = -1;
        this.input.value = this.historyIndex < 0 ? "" : (this.history[this.history.length - 1 - this.historyIndex] || "");
      } else if (e.key === "Escape") {
        e.preventDefault(); this.toggle(false);
      }
    });
    this.input.addEventListener("paste", e => this.onPaste(e));
    window.addEventListener("keydown", e => {
      if (e.key === "F9" || e.code === "Backquote") {
        e.preventDefault();
        this.toggle();
      }
    });
    this.log("Ready. Type help for every command · devtools on reveals TEST TOOLS.");
  },

  toggle(force) {
    this.open = force === undefined ? !this.open : !!force;
    this.box.classList.toggle("on", this.open);
    if (this.open) {
      if (Game.state === "play" && !(typeof Net !== "undefined" && Net.active)) {
        this.paused = true;
        setState("pause");
      }
      this.input.focus();
    } else {
      if (this.paused && Game.state === "pause") setState("play");
      this.paused = false;
    }
  },

  log(text) {
    this.output.push(String(text));
    if (this.output.length > this.maxLines) this.output.shift();
    this.render();
  },
  logEvent(kind, detail) {
    const t = Game ? (Math.floor(Game.time * 10) / 10).toFixed(1) : "0.0";
    const line = `[t${t}] ${kind}: ${detail}`;
    this.eventLog.push(line);
    if (this.eventLog.length > this.maxEventLines) this.eventLog.shift();
    this.render();
  },

  /* The digest is the one console output a player must move into another
     window, and the output pane is re-rendered on every log line — a text
     selection there is fragile. Copy it outright: the async Clipboard API
     where the browser allows it, a hidden textarea + execCommand where it
     does not (an older Android WebView). */
  async copyText(text) {
    const value = String(text || "");
    if (!value) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (e) { /* fall through to the selection copy */ }
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
      const ok = document.execCommand("copy");
      return !!ok;
    } catch (e) {
      return false;
    } finally {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
      if (this.open && this.input) this.input.focus();
    }
  },

  rememberDigest(digest) {
    this.lastDigest = digest || "";
    if (this.copyBtn) this.copyBtn.disabled = !this.lastDigest;
  },

  /* A code can be a passage, not one word. An <input> strips the newlines out
     of a paste outright ("line one" + "line two" → "line oneline two"), which
     would change its hash. The gate treats any run of whitespace as one space,
     so fold a multi-line paste to a single line BEFORE the browser strips it. */
  insertPastedText(text) {
    if (!this.input) return false;
    const value = this.input.value;
    const start = this.input.selectionStart == null ? value.length : this.input.selectionStart;
    const end = this.input.selectionEnd == null ? start : this.input.selectionEnd;
    this.input.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    if (this.input.setSelectionRange) this.input.setSelectionRange(caret, caret);
    return true;
  },

  onPaste(e) {
    const data = e.clipboardData || (typeof window !== "undefined" ? window.clipboardData : null);
    const text = data && data.getData ? data.getData("text") : "";
    /* an ordinary single-line paste behaves exactly as it always has */
    if (!text || !/[\r\n]/.test(text)) return;
    e.preventDefault();
    this.insertPastedText(text.replace(/\s+/g, " ").trim());
  },

  async copyDigest() {
    if (!this.lastDigest) {
      this.log("No digest yet — run `auth hash <code>` first.");
      return false;
    }
    const copied = await this.copyText(this.lastDigest);
    this.log(copied
      ? "DIGEST COPIED TO THE CLIPBOARD · paste it as a String at /console/coop in Firebase."
      : "The clipboard is locked in this browser — select the digest above and copy it by hand, or use COPY DIGEST.");
    return copied;
  },

  render() {
    if (!this.outputEl) return;
    if (this.viewMode === "events") {
      this.outputEl.textContent = this.eventLog.join("\n");
    } else {
      this.outputEl.textContent = this.output.join("\n");
    }
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  },

  /* A shared descent is driven by its host, and the console stays sealed
     until that host authenticates. Read-only reference commands (help, list,
     floors, enemies, unknown, log) stay available without it. */
  coopLock() {
    if (typeof Net === "undefined" || !Net.active) return;
    if (typeof ConsoleGate === "undefined" || !ConsoleGate.granted())
      throw new Error("The shared-run console is sealed. Authenticate first: auth <code>.");
    if (Net.role !== "host")
      throw new Error("Only the host may edit a shared descent — the guest sees the host's world.");
  },

  currentPlayer() {
    return this.targetPlayer();
  },

  /* Which warden a run-edit lands on. Solo has one; a shared descent has two,
     and the host may address either by number. */
  targetPlayer() {
    this.coopLock();
    if (!["play", "pause", "rune", "wait", "held", "choice"].includes(Game.state))
      throw new Error("Start a run before using run-edit commands.");
    if (!players || !players.length) throw new Error("No active warden.");
    if (this.targetIdx >= players.length) this.targetIdx = 0;
    const p = players[this.targetIdx];
    if (!p || !p.runes) throw new Error("No active warden at that slot.");
    return p;
  },

  targetTag(p) {
    const idx = p && typeof p.idx === "number" ? p.idx : this.targetIdx;
    const c = typeof CHARS !== "undefined" && CHARS[p.char] ? CHARS[p.char] : { name: p.char };
    const role = (typeof Net !== "undefined" && Net.active)
      ? (idx === Net.localIdx ? "YOU" : "PARTNER")
      : "WARDEN";
    return "P" + (idx + 1) + " · " + role + " · " + c.name;
  },

  /* log prefix, so a host can see which partner an edit touched */
  editTag(p) {
    return (typeof Net !== "undefined" && Net.active) ? this.targetTag(p) + " · " : "";
  },

  targetList() {
    if (!players || !players.length) return "No wardens in this run.";
    if (this.targetIdx >= players.length) this.targetIdx = 0;
    const lines = players.map((p, i) =>
      "  " + (i + 1) + " · " + this.targetTag(p) + " · HP " + Math.ceil(p.hp) + "/" + p.maxHp + (i === this.targetIdx ? "  ←" : ""));
    return "TARGET: " + this.targetTag(players[this.targetIdx]) + "\n" + lines.join("\n") +
      "\nUse target 1|2 (aliases p1, p2), target me, target partner.";
  },

  setTarget(arg) {
    if (!players || !players.length) throw new Error("Start a run before choosing a target.");
    const raw = String(arg || "").trim().toLowerCase();
    if (!raw) { this.log(this.targetList()); return; }
    const local = (typeof Net !== "undefined" && Net.active) ? Net.localIdx : 0;
    let idx = -1;
    if (raw === "me" || raw === "self" || raw === "host") idx = local;
    else if (raw === "partner" || raw === "guest" || raw === "other") idx = players.length > 1 ? 1 - local : -1;
    else if (/^\d+$/.test(raw)) idx = Number(raw) - 1;
    else {
      const matches = players.map((p, i) => ({ i, key: p.char }))
        .filter(x => x.key === raw || (CHARS[x.key] && CHARS[x.key].name.toLowerCase() === raw));
      if (matches.length === 1) idx = matches[0].i;
      else if (matches.length > 1) throw new Error("More than one warden matches '" + arg + "'. Use target 1 or 2.");
    }
    if (idx < 0 || idx >= players.length) {
      throw new Error(players.length > 1
        ? "Usage: target 1|2, target me, target partner. This run has " + players.length + " wardens."
        : "This run has only one warden — there is no partner to target.");
    }
    this.targetIdx = idx;
    this.log("EDITS NOW LAND ON " + this.targetTag(players[idx]) + ".\n" + this.targetList());
  },

  /* The host owns the sim, and a snapshot does not carry runes or the warden's
     identity. After a host edit that changes either, hand the guest the new
     loadout immediately (net/coop.js resyncEdit). */
  afterEdit() {
    if (typeof Net !== "undefined" && Net.active && Net.role === "host" &&
        typeof Coop !== "undefined" && Coop.running && typeof Coop.resyncEdit === "function")
      Coop.resyncEdit();
  },

  /* `auth <code>` checks the typed code against the SHA-256 stored at
     `console/coop`. `auth hash <code>` prints that digest for the Firebase
     console; `auth off` seals the console again. Never logs the code. */
  async authCode(input) {
    if (typeof ConsoleGate === "undefined") {
      this.log("ERROR: the console gate is not loaded in this build.");
      return;
    }
    const code = String(input || "").trim();
    if (!code) {
      this.log("CO-OP CONSOLE · " + (ConsoleGate.granted() ? "OPEN" : "sealed") +
        "\n  auth <code>        open it (host only)\n" +
        "  auth hash <code>   print the SHA-256 to store in Firebase\n" +
        "  auth off           seal it again");
      return;
    }
    if (code.toLowerCase() === "off") {
      ConsoleGate.revoke();
      this.log("CO-OP CONSOLE SEALED · run edits are locked again.");
      return;
    }
    const hashArg = /^hash(?:\s+([\s\S]+))?$/i.exec(code);
    if (hashArg) {
      const target = String(hashArg[1] || "").trim();
      if (!target) {
        this.log("Usage: auth hash <code> — prints the digest to store at /console/coop.");
        return;
      }
      const digest = await ConsoleGate.hashOf(target);
      this.rememberDigest(digest);
      this.log("SHA-256 · " + digest +
        "\nCodes are case-insensitive. Paste the digest as a string at /console/coop.");
      await this.copyDigest();
      return;
    }
    this.log("CHECKING THE GATE…");
    const r = await ConsoleGate.verify(code);
    if (r.ok) {
      this.log("CO-OP CONSOLE OPEN · host edits are live. The guest receives them through the host's world.");
      return;
    }
    if (r.reason === "mismatch") this.log("ERROR: that code does not open the gate.");
    else if (r.reason === "unset") this.log("ERROR: no digest is set at /console/coop yet — use `auth hash <code>` and paste it into Firebase.");
    else if (r.reason === "malformed") this.log("ERROR: the value at /console/coop is not a SHA-256 digest (64 hex characters).");
    else if (r.reason === "offline") this.log("ERROR: the gate could not be read — " + (r.error || "the void does not answer") + ".");
    else this.log("ERROR: no code given.");
  },

  editRune(command, id, amount) {
    const p = this.currentPlayer();
    if (!Object.prototype.hasOwnProperty.call(RUNES, id)) throw new Error("Unknown rune: " + id);
    const current = p.runes[id] || 0;
    const next = command === "add" ? current + amount : command === "remove" ? Math.max(0, current - amount) : amount;
    if (!Number.isInteger(next) || next < 0 || next > 99) throw new Error("Stacks must be between 0 and 99.");
    if (next) p.runes[id] = next; else delete p.runes[id];
    /* Keep the run's existing seal state. An unsealed run must stay unsealed. */
    if (Array.isArray(p.lockedRunes)) {
      p.lockedRunes = p.lockedRunes.filter(key => p.runes[key] > 0);
      if (!p.lockedRunes.length) p.lockedRunes = null;
    }
    recalc(p);
    this.afterEdit();
    this.log(this.editTag(p) + RUNES[id].name + " ×" + (p.runes[id] || 0) + " · stats recalculated");
  },

  teleportFloor(query) {
    this.currentPlayer();
    if (typeof Net !== "undefined" && Net.active)
      throw new Error("tp is solo-only — a shared descent has no floor sync for a console jump.");
    const value = String(query || "").trim();
    if (!value) throw new Error("Usage: tp <floor number or name>. Use floors to list floors.");
    let index = -1;
    if (/^\d+$/.test(value)) {
      const floorNumber = Number(value);
      if (floorNumber < 1 || floorNumber > FLOORS.length)
        throw new Error("Floor number must be from 1 to " + FLOORS.length + ".");
      index = floorNumber - 1;
    } else {
      const normalize = s => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
      const wanted = normalize(value);
      const matches = FLOORS.map((floor, i) => ({ i, name: normalize(floor.name) }))
        .filter(floor => floor.name === wanted || floor.name.includes(wanted));
      if (!matches.length) throw new Error("No floor matches '" + value + "'. Use floors to list names.");
      if (matches.length > 1) throw new Error("That name is ambiguous. Use a longer floor name.");
      index = matches[0].i;
    }
    const target = FLOORS[index];
    if (Game.inUnknown || Game.inSaloon || Game.inRift) {
      Game.inRift = false; Game.riftCreature = null; Game.riftPicks = null;
    }
    Game.mapIdx = index;
    setupFloor(false);
    Game.intermission = 2.5;
    if (Game.state !== "play" && Game.state !== "pause") setState("play");
    this.log("Teleported to floor " + (index + 1) + ": " + target.name + ".");
  },

  spawnEnemies(type, count) {
    const p = this.currentPlayer();
    if (!Object.prototype.hasOwnProperty.call(ETYPES, type))
      throw new Error("Unknown enemy type. Use enemies to list valid types.");
    if (!Number.isInteger(count) || count < 1 || count > 20)
      throw new Error("Count must be between 1 and 20.");
    if (enemies.length + count > 350) throw new Error("Enemy limit reached; clear some enemies first.");
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + rnd(-0.12, 0.12);
      const radius = 180 + (i % 3) * 36;
      const x = clamp(p.x + Math.cos(a) * radius, 60, MAP.w - 60);
      const y = clamp(p.y + Math.sin(a) * radius, 60, MAP.h - 60);
      enemies.push(spawnEnemy(type, x, y));
    }
    this.log("Spawned " + count + " " + type + (count === 1 ? "" : "s") + " near the player.");
  },

  /* Wake a warden without waiting for the seal. With an argument, any of the
     eight may be called (a name or 1-based number); bare `boss` wakes the one
     this floor keeps. The guest sees the intro through Coop's bossSpawn. */
  spawnWarden(query) {
    this.coopLock();
    if (!["play", "pause"].includes(Game.state))
      throw new Error("Start a run before waking a warden.");
    if (Game.inSaloon || Game.inUnknown || Game.inRift)
      throw new Error("No grand seal here — wake a warden on a descent floor.");
    if (Game.boss && !Game.boss.dead)
      throw new Error("A warden already walks this floor. Fell it first.");
    const q = String(query || "").trim().toLowerCase();
    if (q === "list") {
      const lines = FLOORS.map((f, i) =>
        "  " + (i + 1) + " · " + f.boss + " · " + f.name + (i === Game.mapIdx ? "  ←" : ""));
      this.log("WARDENS\n" + lines.join("\n") + "\nUse boss <number|name>; bare boss wakes this floor's warden.");
      return;
    }
    let kind = Game.mapIdx;
    if (q) {
      if (/^\d+$/.test(q)) kind = Number(q) - 1;
      else {
        const norm = s => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
        const wanted = norm(q);
        const matches = FLOORS.map((f, i) => ({ i, n: norm(f.boss) }))
          .filter(f => f.n === wanted || f.n.includes(wanted));
        if (matches.length === 1) kind = matches[0].i;
        else if (matches.length > 1) throw new Error("That name is ambiguous — use a number (boss list).");
      }
      if (kind < 0 || kind >= FLOORS.length)
        throw new Error("No warden matches '" + query + "'. Use boss list.");
    }
    if (typeof Net !== "undefined" && Net.active && kind > 4)
      throw new Error("Co-op runs floors I–V only — deep wardens cannot be woken in a shared descent.");
    Game.chestsOpened = Game.chestsTotal;
    SEAL.state = "ready"; updateSeals();
    spawnBoss(kind);
    this.log("WARDEN WOKEN · " + FLOORS[kind].boss + " · " + FLOORS[kind].name + ".");
  },

  /* Vault edits must outlive the screen they're made on — and a TEST RUN restores
     the Meta snapshot it took when it ends, so fold the change into that snapshot
     too (otherwise an unlock made mid-test would vanish with the run). The console
     is the one thing allowed to write through a test run's silence. */
  metaKeep() {
    if (typeof Game !== "undefined" && Game.devRun && typeof Dev !== "undefined" && Dev.snap) {
      try { Dev.snap = JSON.stringify(Meta); localStorage.setItem(SAVE_KEY, Dev.snap); } catch (e) {}
    } else metaSave();
    if (typeof refreshMenu === "function") refreshMenu();
    if (Game.state === "vault" && typeof renderVault === "function") renderVault();
  },

  /* every shelf entry the Vault can sell, in Vault order; `max` = stackable level */
  vaultCatalog() {
    const out = [];
    for (const k in CHARS)
      out.push({ key: "char:" + k, name: CHARS[k].name, group: "WARDENS", cost: CHARS[k].cost, max: 0 });
    for (const k in SKINS)
      out.push({ key: "skin:" + k, name: SKINS[k].name, group: "WARPAINT", cost: SKINS[k].cost, max: 0 });
    for (const k in PTYPES) {
      out.push({ key: "pet:" + k, name: PTYPES[k].name, group: "PETS", cost: PTYPES[k].cost, max: 0 });
      const ups = PTYPES[k].upgrades || {};
      for (const u in ups)
        out.push({ key: "petbuff:" + k + ":" + u, name: PTYPES[k].name + " · " + ups[u].name,
          group: "PET UPGRADES", cost: ups[u].cost, max: ups[u].once ? 1 : ups[u].max });
    }
    out.push({ key: "buff:rerolls", name: "EXTRA RE-ROLLS", group: "BUFFS", cost: 4000, max: 10 });
    out.push({ key: "npc:keeper", name: "THE VAULT KEEPER", group: "THE VAULT", cost: 0, max: 0 });
    return out;
  },

  /* one source for the help command, so the list can't fall behind the code */
  helpText() {
    return [
      "RUN CONSOLE — every command",
      "  help                          this list",
      "  status                        current warden, vitality, rune count",
      "  target [1|2|me|partner]       choose which warden edits apply to (p1, p2)",
      "  runes                         runes held by the target",
      "  list                          every carvable rune id",
      "  add <rune> [n]                carve n more stacks (default 1)",
      "  set <rune> <n>                set a rune to an exact stack count",
      "  remove <rune> [n]             take n stacks away",
      "  clear                         drop every rune this run",
      "  heal                          restore the run's vitality",
      "  souls <n>                     add souls to THIS RUN's score",
      "  char <id>                     swap the current run's warden",
      "  floors                        every floor, numbered",
      "  tp <floor number or name>     jump to a floor (alias: teleport)",
      "  enemies                       every horror type",
      "  spawn <enemy> [n]             put horrors around you (max 20)",
      "  boss [kind|name]              wake a warden now (no arg = this floor; boss list)",
      "  pet [type|none]               swap the target's familiar (no arg lists them)",
      "  skin [id]                     repaint the target (no arg lists warpaint)",
      "  gunskin [id|none]             repaint the target's gun (no arg lists paint)",
      "  rerolls [n]                   show / set the target's re-rolls",
      "  unknown                       THE UNKNOWN's attack runes (alias: unkrunes)",
      "  cast <rune>                   force THE UNKNOWN to cast one now",
      "  vault                         show the vault bank",
      "  vault <n> · +n · -n           set / add to / take from the bank",
      "  unlock <key>                  unlock one vault entry (stackables to max)",
      "  unlock hard | chaos           open a descent without felling its warden",
      "  unlock all                    unlock every vault entry and both descents",
      "  unlock list                   every unlock key, by shelf",
      "  devtools [on|off]             show / hide TEST TOOLS (off by default)",
      "  auth <code>                   open the shared-run console (host only)",
      "  auth hash <code>              print the SHA-256 to store in Firebase",
      "  auth off                      seal the shared-run console again",
      "  copy                          copy the last SHA-256 digest",
      "  log · events                  event log view / dump recent events",
    ].join("\n");
  },

  execute(line) {
    const raw = String(line || "").trim();
    if (!raw) return;
    /* commands are case-insensitive; arguments keep their case for `auth`
       (the access code is normalised by ConsoleGate, never by the parser) */
    const tokens = raw.split(/\s+/);
    const command = tokens[0].toLowerCase();
    const rawArgs = tokens.slice(1);
    const args = rawArgs.map(a => a.toLowerCase());
    /* never leave the access code in the visible log or the Up-arrow history */
    let shown = raw;
    if (command === "auth" && rawArgs.length) {
      const sub = rawArgs[0].toLowerCase();
      shown = sub === "off" ? "auth off" : sub === "hash" ? "auth hash <code>" : "auth <code>";
    }
    this.history.push(shown);
    this.log("> " + shown);
    const amount = (value, fallback) => {
      if (value === undefined) return fallback;
      if (!/^\d+$/.test(value)) throw new Error("Stack count must be a whole number.");
      const n = Number(value);
      if (n > 99) throw new Error("Maximum stack count is 99.");
      return n;
    };
    try {
      if (command === "help") {
        this.log(this.helpText());
      } else if (command === "auth") {
        /* fire and forget: the database answer arrives a beat later */
        this.authCode(rawArgs.join(" "));
      } else if (command === "copy") {
        this.copyDigest();
      } else if (command === "devtools" || command === "testtools") {
        this.coopLock();
        const mode = args[0];
        if (mode !== undefined && mode !== "on" && mode !== "off")
          throw new Error("Usage: devtools [on|off]. No argument flips it.");
        if (typeof devSetTools !== "function") throw new Error("Test tools are not loaded in this build.");
        const on = devSetTools(mode === undefined ? !devToolsOn() : mode === "on");
        this.log(on
          ? "TEST TOOLS ON · TEST TOOLS buttons now show in the menu and the pause screen (remembered between sessions)."
          : "TEST TOOLS OFF · every trace hidden. Type devtools on to bring them back.");
      } else if (command === "runes") {
        const p = this.currentPlayer();
        const held = Object.keys(p.runes).filter(id => p.runes[id] > 0);
        this.log(held.length
          ? this.editTag(p) + held.map(id => { const R = runeDefFor(p, id); return R.glyph + " " + id + " ×" + p.runes[id]; }).join("\n")
          : this.editTag(p) + "No runes held.");
      } else if (command === "list") {
        this.log(RUNE_IDS.map(id => RUNES[id].glyph + " " + id).join("\n"));
      } else if (command === "enemies") {
        this.log(Object.keys(ETYPES).join("\n"));
      } else if (command === "spawn") {
        if (!args[0]) throw new Error("Usage: spawn <enemy type> [count], or spawn boss [kind]. Use enemies to list valid types.");
        if (args[0] === "boss" || args[0] === "warden") { this.spawnWarden(rawArgs.slice(1).join(" ")); return; }
        const count = args[1] === undefined ? 1 : amount(args[1], 1);
        this.spawnEnemies(args[0], count);
      } else if (command === "boss" || command === "warden" || command === "spawnboss") {
        this.spawnWarden(rawArgs.join(" "));
      } else if (command === "floors") {
        this.log(FLOORS.map((floor, i) => (i + 1) + ". " + floor.name).join("\n"));
      } else if (command === "unknown" || command === "unkrunes") {
        const ids = Object.keys(UNK_RUNES).sort((a, b) => UNK_RUNES[a].phase - UNK_RUNES[b].phase || a.localeCompare(b));
        this.log(ids.map(id => RUNES[id].glyph + " " + id + " · PHASE " + UNK_RUNES[id].phase + " · " + UNK_RUNES[id].name).join("\n"));
      } else if (command === "cast") {
        this.currentPlayer();
        const id = args[0], U = Game.unk;
        if (!id || !Object.prototype.hasOwnProperty.call(UNK_RUNES, id)) throw new Error("Unknown attack rune. Use unknown to list them.");
        if (!Game.inUnknown || !U || U.stage !== "fight") throw new Error("cast is available only while THE UNKNOWN is in its fight stage.");
        for (const c of U.casts) if (c.h) c.h.busy = false;
        U.casts = []; U.left = 0;
        unkStartGroup([id]);
        this.log("Forced THE UNKNOWN to cast " + id + " (" + UNK_RUNES[id].name + ").");
      } else if (command === "tp" || command === "teleport") {
        this.teleportFloor(args.join(" "));
      } else if (command === "status") {
        const p = this.currentPlayer();
        const pet = p.pet && PTYPES[p.pet] ? " · " + PTYPES[p.pet].name : "";
        const party = partyExtra() > 0
          ? " · PARTY " + partySize() + " · HORDE ×" + partyHpMul().toFixed(2) + " · WARDENS ×" + partyBossHpMul().toFixed(2)
          : "";
        this.log(this.targetTag(p) + " · HP " + Math.ceil(p.hp) + "/" + p.maxHp +
          " · " + Object.keys(p.runes).filter(id => p.runes[id] > 0).length + " runes" +
          " · " + p.rerolls + " rerolls" + pet + party);
      } else if (command === "target" || command === "p1" || command === "p2") {
        this.setTarget(command === "target" ? rawArgs.join(" ") : command.slice(1));
      } else if (command === "souls") {
        this.currentPlayer();
        if (!args[0] || !/^\d+$/.test(args[0])) throw new Error("Usage: souls <positive amount>.");
        const gained = Number(args[0]);
        if (!Number.isSafeInteger(gained) || gained < 1 || gained > 1000000) throw new Error("Amount must be from 1 to 1,000,000.");
        Game.score += gained;
        updateScore();
        this.log("Added " + gained.toLocaleString() + " souls to this run · run total " + Game.score.toLocaleString() + ".");
      } else if (command === "vault" || command === "bank") {
        const raw = args[0];
        if (raw !== undefined) this.coopLock();
        if (raw === undefined) {
          this.log("VAULT BANK · " + Meta.bank.toLocaleString() + " souls" +
            (keeperUnlocked() ? "" : " · the Keeper is still chained — unlock npc:keeper to open the Vault"));
        } else {
          const hit = /^([+-]?)(\d+)$/.exec(raw);
          if (!hit) throw new Error("Usage: vault [amount] · vault +N adds · vault -N takes away · vault N sets.");
          const n = Number(hit[2]);
          if (!Number.isSafeInteger(n) || n > 100000000) throw new Error("Amount must be from 0 to 100,000,000.");
          const before = Meta.bank;
          Meta.bank = hit[1] === "+" ? before + n : hit[1] === "-" ? Math.max(0, before - n) : n;
          this.metaKeep();
          this.log("VAULT BANK · " + before.toLocaleString() + " → " + Meta.bank.toLocaleString() + " souls.");
        }
      } else if (command === "unlock") {
        const what = args[0];
        if (!what) throw new Error("Usage: unlock <key|all|list>. Try unlock list.");
        if (what !== "list") this.coopLock();
        const catalog = this.vaultCatalog();
        if (what === "list") {
          const groups = [];
          for (const item of catalog) {
            let g = groups.find(x => x.name === item.group);
            if (!g) groups.push(g = { name: item.group, items: [] });
            g.items.push(item.key + (item.max ? " (max ×" + item.max + ")" : item.cost ? " (" + item.cost.toLocaleString() + " ◆)" : ""));
          }
          this.log("UNLOCK KEYS — bare ids also work when unambiguous\n" +
            groups.map(g => g.name + "\n  " + g.items.join("\n  ")).join("\n") +
            "\nDESCENTS\n  hard · chaos   (both are also opened by unlock all)");
        } else if (what === "all") {
          let changed = 0;
          for (const item of catalog) {
            const cur = Meta.unlocked[item.key];
            const done = item.max ? (cur || 0) >= item.max : !!cur;
            if (done) continue;
            Meta.unlocked[item.key] = item.max ? item.max : true;
            changed++;
          }
          /* HARD and CHAOS are not Vault entries: their gates are the two felled
             wardens in Meta.slain. "unlock all" means ALL — including those. */
          const opened = [];
          for (const [key, name] of [["boss:4", "HARD"], ["boss:" + UNK_KIND, "CHAOS"]]) {
            if (Meta.slain[key]) continue;
            Meta.slain[key] = true; opened.push(name);
          }
          this.metaKeep();
          this.log((changed
            ? "UNLOCKED " + changed + " vault " + (changed === 1 ? "entry" : "entries") + " · the shelves are yours."
            : "Nothing was still locked — the whole Vault is already open.")
            + (opened.length ? " DESCENTS OPEN: " + opened.join(" · ") + "." : ""));
        } else if (what === "hard" || what === "chaos") {
          const key = what === "hard" ? "boss:4" : "boss:" + UNK_KIND;
          const label = what === "hard" ? "HARD DESCENT" : "CHAOS DESCENT";
          if (Meta.slain[key]) this.log(label + " is already open.");
          else {
            Meta.slain[key] = true;
            this.metaKeep();
            this.log(label + " UNLOCKED.");
          }
        } else {
          let item = catalog.find(x => x.key === what);
          if (!item) {
            const matches = catalog.filter(x => x.key.slice(x.key.lastIndexOf(":") + 1) === what);
            if (matches.length > 1)
              throw new Error("'" + what + "' is ambiguous — " + matches.map(m => m.key).join(" · "));
            item = matches[0];
          }
          if (!item) throw new Error("No vault entry named '" + what + "'. Try unlock list.");
          Meta.unlocked[item.key] = item.max ? item.max : true;
          this.metaKeep();
          this.log(item.group + " · " + item.name + " UNLOCKED" + (item.max ? " (×" + item.max + ")" : "") + ".");
        }
      } else if (command === "add" || command === "set" || command === "remove") {
        if (!args[0]) throw new Error("Specify a rune id. Use runes to list held runes.");
        this.editRune(command, args[0], amount(args[1], command === "set" ? undefined : 1));
      } else if (command === "clear") {
        const p = this.currentPlayer();
        p.runes = {}; p.lockedRunes = null; recalc(p);
        this.afterEdit();
        this.log(this.editTag(p) + "Runes cleared.");
      } else if (command === "heal") {
        const p = this.currentPlayer();
        p.hp = p.maxHp; p.downed = false; updateHp();
        this.log(this.editTag(p) + "Healed to full.");
      } else if (command === "char") {
        const p = this.currentPlayer(), id = args[0];
        if (!id) throw new Error("Usage: char <id>.");
        if (typeof CHARS === "undefined") throw new Error("Character data not loaded.");
        if (!Object.prototype.hasOwnProperty.call(CHARS, id)) throw new Error("Unknown character id: " + id + ".");
        p.char = id;
        p.dashCdBase = CHARS[id].dashCd;
        p.dashDur = CHARS[id].dashDur || 0.18;
        p.dashSpeed = CHARS[id].dashSpeed || 720;
        recalc(p);
        this.afterEdit();
        this.log(this.editTag(p) + "Warden is now " + CHARS[id].name + ".");
      } else if (command === "pet") {
        const p = this.currentPlayer();
        const what = String(rawArgs.join(" ") || "").trim().toLowerCase();
        if (!what || what === "list") {
          const lines = Object.keys(PTYPES).map(k =>
            "  " + k + " · " + PTYPES[k].name + (p.pet === k ? "  ←" : ""));
          this.log("PETS · bound: " + (p.pet && PTYPES[p.pet] ? PTYPES[p.pet].name : "none") +
            "\n" + lines.join("\n") + "\nUse pet <id> or pet none.");
          return;
        }
        if (what !== "none" && !Object.prototype.hasOwnProperty.call(PTYPES, what))
          throw new Error("Unknown familiar '" + what + "'. Run pet with no argument to list them.");
        const type = what === "none" ? null : what;
        equipPet(p, type);
        this.afterEdit();
        this.log(this.editTag(p) + (type ? PTYPES[type].name + " BOUND" : "FAMILIAR RELEASED") + ".");
      } else if (command === "skin") {
        const p = this.currentPlayer();
        const what = args[0];
        if (!what || what === "list") {
          const lines = Object.keys(SKINS).map(k =>
            "  " + k + " · " + SKINS[k].name + (p.skin === k ? "  ←" : ""));
          this.log("WARPAINT · wearing: " + (SKINS[p.skin] ? SKINS[p.skin].name : p.skin) +
            "\n" + lines.join("\n") + "\nUse skin <id>.");
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(SKINS, what))
          throw new Error("Unknown warpaint '" + what + "'. Run skin with no argument to list it.");
        p.skin = what;
        this.afterEdit();
        this.log(this.editTag(p) + "Wearing " + SKINS[what].name + ".");
      } else if (command === "gunskin") {
        const p = this.currentPlayer();
        const what = args[0];
        if (!what || what === "list") {
          const lines = Object.keys(SKINS).map(k =>
            "  " + k + " · " + SKINS[k].name + (p.gunSkin === k ? "  ←" : ""));
          this.log("GUN PAINT · wearing: " + (p.gunSkin && SKINS[p.gunSkin] ? SKINS[p.gunSkin].name : GUN_STOCK.name) +
            "\n  none · " + GUN_STOCK.name + (p.gunSkin ? "  ←" : "") +
            "\n" + lines.join("\n") + "\nUse gunskin <id> or gunskin none.");
          return;
        }
        if (what !== "none" && what !== "stock" && !Object.prototype.hasOwnProperty.call(SKINS, what))
          throw new Error("Unknown gun paint '" + what + "'. Run gunskin with no argument to list it.");
        const type = what === "none" || what === "stock" ? null : what;
        p.gunSkin = type;
        this.afterEdit();
        this.log(this.editTag(p) + (type ? "Gun painted " + SKINS[type].name : "Gun paint stripped") + ".");
      } else if (command === "rerolls") {
        const p = this.currentPlayer();
        if (args[0] === undefined) {
          this.log(this.targetTag(p) + " · " + p.rerolls + " re-roll" + (p.rerolls === 1 ? "" : "s") + " left.");
          return;
        }
        const n = amount(rawArgs[0], undefined);
        p.rerolls = n;
        updateRerolls();
        this.afterEdit();
        this.log(this.editTag(p) + "Re-rolls set to " + n + ".");
      } else if (command === "log") {
        this.viewMode = "events";
        this.box.querySelector("#rgToggleView").textContent = "VIEW: EVENTS";
        this.log("Switched to event log view. Press VIEW: CMD to return.");
      } else if (command === "events") {
        this.viewMode = "events";
        this.box.querySelector("#rgToggleView").textContent = "VIEW: EVENTS";
        this.log("Event log (" + this.eventLog.length + " entries):");
        this.eventLog.slice(-30).forEach(line => this.log("  " + line));
      } else {
        this.log("Unknown command. Type help.");
      }
    } catch (e) {
      this.log("ERROR: " + e.message);
    }
  },
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => RunegunConsole.init());
else RunegunConsole.init();