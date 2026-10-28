/* =========================================================
   RUNEGUN · Floors
   The looping floor definitions (palette, rocks, hazards, boss, new enemy) and depth/difficulty scaling.
   ========================================================= */
"use strict";


/* =========================================================
   FLOORS — eight floors that loop forever. Past the Void, the saloon
   (scenes/saloon.js) sits between V and VI; VI–VIII live in entities/deep.js.
   ========================================================= */
const FLOORS = [
  { name: "THE CATACOMB", boss: "THE CHAINED WARDEN",
    floor: "#0b0b14", grid: "rgba(44,42,69,0.5)", wallGlow: "#9d6bff", line: "#2c2a45",
    rockA: "#1b1a30", rockB: "#181729", rockTop: "#23223c",
    rocks: 26, hazards: 0, newEnemy: "wisp" },
  { name: "THE OSSUARY", boss: "THE MARROW KING",
    floor: "#0d110c", grid: "rgba(74,84,58,0.4)", wallGlow: "#b8d68a", line: "#2e3526",
    rockA: "#222a1c", rockB: "#1c2418", rockTop: "#2f3a26",
    rocks: 34, hazards: 0, newEnemy: "summoner" },
  { name: "THE HELLFORGE", boss: "THE FORGE TYRANT",
    floor: "#150b0a", grid: "rgba(94,46,38,0.4)", wallGlow: "#ff8a3d", line: "#43221c",
    rockA: "#33160f", rockB: "#2a120c", rockTop: "#47221a",
    rocks: 20, hazards: 5, newEnemy: "cinder" },
  { name: "THE DROWNED NAVE", boss: "THE DROWNED MONARCH",
    floor: "#07131a", grid: "rgba(46,100,110,0.35)", wallGlow: "#7de8e0", line: "#1d3a45",
    rockA: "#12303b", rockB: "#0e2630", rockTop: "#1e4753",
    rocks: 30, hazards: 7, hazardType: "water", newEnemy: "angler" },
  { name: "THE VOID BENEATH", boss: "THE EVENT HORIZON",
    floor: "#060410", grid: "rgba(70,55,120,0.25)", wallGlow: "#c9b8ff", line: "#241d45",
    rockA: "#15102b", rockB: "#100c22", rockTop: "#241d45",
    rocks: 10, hazards: 0, newEnemy: "wisp" },
  /* ---- past the singularity (entities/deep.js) ---- */
  { name: "THE STILLED HOUR", boss: "THE HOURGLASS SAINT",
    floor: "#0b0e14", grid: "rgba(150,180,215,0.22)", wallGlow: "#e6c27a", line: "#28303f",
    rockA: "#1b2230", rockB: "#161c28", rockTop: "#2c3a4e",
    rocks: 22, hazards: 6, hazardType: "ice", newEnemy: "mourner" },
  { name: "THE GLASS CHOIR", boss: "THE THOUSANDFOLD",
    floor: "#08080d", grid: "rgba(205,210,255,0.13)", wallGlow: "#eef2ff", line: "#23243a",
    rockA: "#181a28", rockB: "#141622", rockTop: "#4a5070",
    rocks: 24, hazards: 0, mirrors: 8, hazardType: "mirror", newEnemy: "lumen" },
  { name: "THE LAST LIVING STAR", boss: "THE OTHER GUNSLINGERS",
    floor: "#130910", grid: "rgba(150,55,75,0.28)", wallGlow: "#ff5470", line: "#3b1726",
    rockA: "#2b1320", rockB: "#230f1a", rockTop: "#3e1c2e",
    rocks: 28, hazards: 0, hazardType: "sun", newEnemy: "drifter" },
];
/* how many floors a lap runs before the Catacomb returns. A run that began as a
   co-op descent keeps the original five for its whole length — Game.coopLap is
   frozen at resetRun — even if the partner leaves: the saloon and floors VI–VIII
   have no guest-side sync, so the survivor must not walk into them mid-run. */
const loopLen = () => (Game.coopLap || (typeof Net !== "undefined" && Net.active)) ? 5 : FLOORS.length;
/* THE SINGULAR — not a floor of the loop but the saloon stage past the Event Horizon
   (scenes/saloon.js). floorDef() hands it out while Game.inSaloon, so the shared
   renderer paints the void outside the saloon's walls; the room draws itself. */
const SALOON_FLOOR = { name: "THE SINGULAR", boss: "",
  floor: "#06040f", grid: "rgba(70,55,120,0.14)", wallGlow: "#f2b36d", line: "#1c110b",
  rockA: "#2a1a12", rockB: "#24170f", rockTop: "#4c3020",
  rocks: 0, hazards: 0, newEnemy: "wisp" };
/* THE UNKNOWN — the final stage past floor VIII (entities/unknown.js): the void floor,
   an abyss at its heart and the rift's creature waiting over it. No seal, no waves. */
const UNKNOWN_FLOOR = { name: "THE UNKNOWN", boss: "THE UNKNOWN",
  floor: "#05030c", grid: "rgba(90,70,150,0.18)", wallGlow: "#c9b8ff", line: "#1f1838",
  rockA: "#15102b", rockB: "#100c22", rockTop: "#2b2350",
  rocks: 0, hazards: 0, newEnemy: "wisp" };
const floorDef = () => Game.inSaloon ? SALOON_FLOOR : Game.inUnknown ? UNKNOWN_FLOOR : FLOORS[Game.mapIdx];
const depth = () => Game.loop * FLOORS.length + Game.mapIdx;   // 0,1,2,3,...
const diffScale = () => 1 + (Game.wave - 1) * 0.14 + depth() * 0.45;
