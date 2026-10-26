/* =========================================================
   RUNEGUN · Curses — boss hexes
   Temporary debuffs bosses lay on the player, plus their tick/expiry and HUD strip.
   ========================================================= */
"use strict";


/* =========================================================
   CURSES — temporary hexes bosses lay on the player
   ========================================================= */
const CURSES = {
  jam:    { name: "JAM",    glyph: "ᛃ", color: "#9d6bff", desc: "fire rate halved" },
  weight: { name: "WEIGHT", glyph: "ᛜ", color: "#7ad7ff", desc: "movement leaden" },
  shroud: { name: "SHROUD", glyph: "ᛇ", color: "#5e4d8a", desc: "sight dimmed" },
  brand:  { name: "BRAND",  glyph: "ᛒ", color: "#ff5e2e", desc: "burning" },
};
const CURSE_IDS = Object.keys(CURSES);
function applyCurse(p, type, dur, announce) {
  if (!p) return;
  p.curses[type] = Math.max(p.curses[type] || 0, dur);
  if (announce !== false) {
    if (p === localPlayer()) toast("HEXED — " + CURSES[type].name + ": " + CURSES[type].desc);
    floatText(p.x, p.y - 26, CURSES[type].glyph + " " + CURSES[type].name, CURSES[type].color);
  }
  AudioFX.zap();
}
function curseActive(p, type) { return p && p.curses[type] > 0; }
function tickCurses(dt) {
  for (const p of players) {
    for (const t in p.curses) {
      if (p.curses[t] > 0) {
        p.curses[t] -= dt;
        if (p.curses[t] <= 0) p.curses[t] = 0;
      }
    }
    /* BRAND: burning damage over time, shaken off by time only */
    if (p.curses.brand > 0 && !p.downed) {
      p.brandTick -= dt;
      if (p.brandTick <= 0) {
        p.brandTick = 0.5;
        if (Game.state === "play" && p.dashT <= 0) {
          p.hp -= 3; Game.flawless = false;
          if (p === localPlayer()) screenFlash(0.12);
          if (p.hp <= 0) { p.hp = 0; downPlayer(p); if (Game.state !== "play") return; }
          updateHp();
        }
        for (let k = 0; k < 4; k++)
          particles.push({ x: p.x + rnd(-9, 9), y: p.y + rnd(-9, 9), vx: rnd(-30, 30), vy: rnd(-110, -40), t: 0, life: 0.4, r: rnd(2, 4), color: "#ff5e2e" });
      }
    }
  }
  refreshCurseStrip();
}
function refreshCurseStrip() {
  const el = $("curseStrip"); if (!el) return;
  const p = localPlayer(); if (!p) return;
  let html = "";
  for (const t of CURSE_IDS) {
    const left = p.curses[t];
    if (left > 0) {
      const C = CURSES[t];
      html += "<span class='curse' style='color:" + C.color + ";border-color:" + C.color + "'>" +
        C.glyph + " " + C.name + "<small> " + left.toFixed(1) + "s</small></span>";
    }
  }
  el.innerHTML = html;
}
