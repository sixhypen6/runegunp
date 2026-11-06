/* =========================================================
   RUNEGUN · Pets
   Vault-bought companions that fight beside you. One equipped pet
   (Meta.pet) is spawned per floor in setupFloor and driven each frame
   by updatePet / drawn by drawPet. The combat pets reuse the core combat
   helpers (damageEnemy, nearestEnemy) and the shared bullets array.

   Each pet also has purchasable UPGRADES (Vault → PETS, shown under a
   pet once owned). Stat upgrades stack to `max`; one-time buffs (`once`)
   unlock a special power. Levels live in Meta.unlocked under
   "petbuff:<type>:<key>" and are baked onto the pet in spawnPet.
   ========================================================= */
"use strict";

/* SEEKER — the compass companion's tuning. It is a navigator first: its needle
   finds sealed rune chests, and it can be sent to break one from across the
   floor. Tune its reach, its errand and its marks here. */
const SEEKER_FIND_RANGE = 3200;     // how far the needle can find a sealed rune chest
const SEEKER_VITAL_RANGE = 3200;    // how far LIFE LODE can find a sealed vitality box
const SEEKER_SEAL_CD = 2;           // seconds the locator goes dark after a seal breaks
const SEEKER_ORBIT_R = 38;          // how far the compass floats from its warden

const PTYPES = {
  orbiter: {
    name: "SENTINEL ORB", glyph: "ᛟ", color: "#7ad7ff", cost: 10000,
    desc: "A bound orb that wheels in a tight ring around you, grinding any horror it grazes. Its ward upgrade also pulses a shockwave.",
    r: 10, dmg: 8, orbR: 74, orbSpeed: 3.2,
    upgrades: {
      speed: { name: "ORB HASTE", glyph: "»", cost: 4000, max: 5, desc: "+0.8 orbit speed per level — spins faster, grinds more often." },
      dmg:   { name: "ORB EDGE",  glyph: "◆", cost: 4000, max: 5, desc: "+4 orb damage per level." },
      block: { name: "ORB WARD",  glyph: "◉", cost: 10000, once: true, desc: "The orb shatters enemy shots and periodically pulses a small shockwave." },
    } },
  hunter: {
    name: "WISPLING", glyph: "ᛉ", color: "#c9a0ff", cost: 16000,
    desc: "A restless spirit that darts to the nearest horror within reach and tears at it, then drifts back to your side.",
    r: 8, dmg: 9, speed: 320, range: 360,
    upgrades: {
      range: { name: "FAR HUNT",    glyph: "»", cost: 4000, max: 5, desc: "+80 hunting range per level — strikes foes further out." },
      dmg:   { name: "WISP FANGS",  glyph: "◆", cost: 4000, max: 5, desc: "+4 wispling damage per level." },
      heal:  { name: "SOUL SIPHON", glyph: "+", cost: 10000, once: true, desc: "Restores 0.5 vitality each time the wispling slays a horror." },
    } },
  gunner: {
    name: "GUN IMP", glyph: "ᛊ", color: "#ffd23d", cost: 22000,
    desc: "A little marksman that hovers at your shoulder and spits lead at anything that strays too close. Its rune upgrade passes supported weapon effects into each shot.",
    r: 9, dmg: 14, range: 420, rate: 1.1, shotSpeed: 620,
    upgrades: {
      rate:  { name: "HAIL OF LEAD",     glyph: "»", cost: 4000, max: 5, desc: "Fires ~20% faster per level." },
      runes: { name: "RUNE-ETCHED SHOT", glyph: "ᛟ", cost: 12000, once: true, desc: "The imp's bullets inherit supported weapon effects — burn, chill, poison, chain lightning, pierce, and more." },
    } },
  seeker: {
    name: "SEEKER", glyph: "✦", color: "#9fe8ff", cost: 20000,
    desc: "A needle-bound compass spirit that circles your shoulder. Its needle always finds the nearest sealed rune chest — [ E ] sends it across the floor to break that seal, or marks the way when the box is too far. Each seal it breaks leaves the needle dark for a breath.",
    r: 9,
    upgrades: {
      speed:  { name: "SWIFT NEEDLE", glyph: "»", cost: 4000, max: 5,
        desc: "+90 travel speed per level when sent to break a sealed rune chest." },
      ambush: { name: "TRAP SIGHT", glyph: "◉", cost: 12000, once: true,
        desc: "The first mark key (1) toggles a red sigil over every foe a rune chest's ambush sends at you." },
      vital:  { name: "LIFE LODE",  glyph: "❤", cost: 12000, once: true,
        desc: "The second mark key (2) turns the needle and an edge-arrow toward the nearest sealed vitality box." },
    } },
};

const petLvl = (type, key) => Meta.unlocked["petbuff:" + type + ":" + key] || 0;

/* wispling targeting: always prefer rune-chest ambush foes (pick the one farthest
   from the warden, so the pet clears distant threats for shredder/wraith), else
   prefer the lowest-health foe in reach; fall back to nearest to the pet. */
function wisplingTarget(pet) {
  const ow = pet.owner, range2 = pet.range * pet.range;
  let ambush = null, ambushD = -1, low = null, lowHp = Infinity, near = null, nearD = Infinity;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p" || e.untargetable) continue;
    if (dist2(ow.x, ow.y, e.x, e.y) >= range2) continue;
    if (e.ambush) {
      const d = dist2(ow.x, ow.y, e.x, e.y);
      if (d > ambushD) { ambushD = d; ambush = e; }
    } else {
      const hp = e.hp != null ? e.hp : Infinity;
      if (hp < lowHp || (hp === lowHp && dist2(pet.x, pet.y, e.x, e.y) < (low ? dist2(pet.x, pet.y, low.x, low.y) : Infinity))) {
        lowHp = hp; low = e;
      }
      const d = dist2(pet.x, pet.y, e.x, e.y);
      if (d < nearD) { nearD = d; near = e; }
    }
  }
  return ambush || low || near;
}

function spawnPet(type, owner) {
  const T = PTYPES[type];
  const p = { type, owner, x: owner.x, y: owner.y, r: T.r, dmg: T.dmg,
    orbA: rnd(0, TAU), hitT: 0, fireT: 0,
    orbR: T.orbR, orbSpeed: T.orbSpeed, speed: T.speed, range: T.range, rate: T.rate,
    block: false, lifesteal: 0, inherit: false, order: null, orderSpeed: 0 };
  if (type === "orbiter") {
    p.orbSpeed = T.orbSpeed + 0.8 * petLvl(type, "speed");
    p.dmg = T.dmg + 4 * petLvl(type, "dmg");
    p.block = petLvl(type, "block") > 0;
  } else if (type === "hunter") {
    p.range = T.range + 80 * petLvl(type, "range");
    p.dmg = T.dmg + 4 * petLvl(type, "dmg");
    p.lifesteal = petLvl(type, "heal") > 0 ? 0.5 : 0;   // vitality restored per kill, half the leech rune's cap
  } else if (type === "gunner") {
    p.rate = T.rate * Math.pow(0.8, petLvl(type, "rate"));
    p.inherit = petLvl(type, "runes") > 0;
  } else if (type === "seeker") {
    p.orderSpeed = 90 * petLvl(type, "speed");            // SWIFT NEEDLE: faster seal errand travel
  }
  /* bind-poof: the companion arrives, it doesn't just blink into existence */
  for (let k = 0; k < 12; k++) particles.push({ x: p.x, y: p.y,
    vx: rnd(-150, 150), vy: rnd(-150, 150), t: 0, life: rnd(0.3, 0.6), r: rnd(2, 4), color: T.color });
  floatText(p.x, p.y - 22, T.name, T.color, 12);
  return p;
}

/* Swap a warden's familiar mid-run: unbind the old one and bind the new.
   Shared by the console and the co-op edit stream, so a host's change reaches
   the guest's pet array as well as its owner record. */
function equipPet(p, type) {
  p.pet = type && PTYPES[type] ? type : null;
  if (typeof pets !== "undefined" && Array.isArray(pets)) {
    for (let i = pets.length - 1; i >= 0; i--) if (pets[i].owner === p) pets.splice(i, 1);
    if (p.pet) pets.push(assignId(spawnPet(p.pet, p)));
  }
  return p.pet;
}

/* orbiter/hunter: grind every enemy currently in contact, on a short re-hit timer.
   With SOUL SIPHON, each horror the wispling slays restores a sliver of vitality. */
function petContactDamage(pet, dt) {
  pet.hitT -= dt;
  if (pet.hitT > 0) return;
  let dealt = 0, kills = 0;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    if (dist2(pet.x, pet.y, e.x, e.y) < (pet.r + e.r) ** 2) {
      damageEnemy(e, pet.dmg, { x: pet.x, y: pet.y, knock: 30, owner: pet.owner });
      dealt += pet.dmg;
      if (e.dead) kills++;
      /* the grind shows: sparks fly where the companion meets flesh */
      for (let k = 0; k < 2; k++) particles.push({ x: (pet.x + e.x) / 2, y: (pet.y + e.y) / 2,
        vx: rnd(-140, 140), vy: rnd(-140, 140), t: 0, life: 0.15, r: rnd(1.5, 3), color: PTYPES[pet.type].color });
    }
  }
  if (dealt <= 0) return;
  pet.hitT = 0.35;
  Game.shake = Math.max(Game.shake, 2);   // the same thud the hero's own shot carries
  const ow = pet.owner;
  if (pet.lifesteal && kills > 0 && ow.hp > 0 && !ow.downed && ow.hp < ow.maxHp) {
    const healed = kills * pet.lifesteal;
    ow.hp = Math.min(ow.maxHp, ow.hp + healed);
    updateHp();
    /* the theft is visible: soul-motes stream from the wound toward the hero */
    const sa = angTo(pet.x, pet.y, ow.x, ow.y);
    for (let k = 0; k < 4; k++) particles.push({ x: pet.x, y: pet.y,
      vx: Math.cos(sa) * rnd(160, 260), vy: Math.sin(sa) * rnd(160, 260),
      t: 0, life: 0.3, r: rnd(2, 3), color: "#7dff5e" });
    floatText(ow.x, ow.y - 30, "+" + (healed % 1 ? healed.toFixed(1) : healed), "#7dff5e", 14);
  }
}

/* ORB WARD: the orb pops any enemy projectile it sweeps through */
function petBlock(pet) {
  const col = PTYPES[pet.type].color;
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    if (dist2(pet.x, pet.y, b.x, b.y) < (pet.r + b.r + 2) ** 2) {
      for (let k = 0; k < 4; k++) particles.push({ x: b.x, y: b.y,
        vx: rnd(-120, 120), vy: rnd(-120, 120), t: 0, life: 0.2, r: rnd(2, 3), color: col });
      ebullets.splice(i, 1);
    }
  }
}

/* =========================================================
   THE SEAL ERRAND — a companion sent to undo a distant seal.
   SNIPER keeps the rifle; the SEEKER lives for this. Either way
   the pet walks the long way, and the ambush springs around the
   box instead of around the warden.
   ========================================================= */
function petForOwner(ow) { return pets.find(pt => pt.owner === ow) || null; }
function nearestSealedChestTo(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of chests) {
    if (c.state !== "sealed") continue;
    const d = dist2(c.x, c.y, x, y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestSealedHealthTo(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const h of healthBoxes) {
    if (h.state !== "sealed") continue;
    const d = dist2(h.x, h.y, x, y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
/* Which companions answer the seal errand? SNIPER's kit sends any bound pet;
   the SEEKER exists for nothing else. */
function petSealSeeker(p) {
  return !!(p && p.pet && (p.char === "sniper" || p.char === "fortress" || p.pet === "seeker"));
}
/* the needle's target, in priority order: the seal it was sent to, the seal it
   was asked to mark, the nearest sealed chest, then a vitality box under LIFE LODE */
function seekerNeedleTarget(pet) {
  if (pet.order && pet.order.chest) return pet.order.chest;
  const ow = pet.owner;
  if (!ow) return null;
  if (ow.seekerMarkX != null && ow.seekerMarkY != null) return { x: ow.seekerMarkX, y: ow.seekerMarkY };
  const c = nearestSealedChestTo(pet.x, pet.y, SEEKER_FIND_RANGE);
  if (c) return c;
  if (ow.seekerVital && petLvl("seeker", "vital") > 0)
    return nearestSealedHealthTo(pet.x, pet.y, SEEKER_VITAL_RANGE);
  return null;
}
function orderPetToSeal(p) {
  const pet = petForOwner(p);
  if (!pet) { if (p === localPlayer()) toast("NO COMPANION ANSWERS"); return false; }
  if ((p.seekerCd || 0) > 0) { if (p === localPlayer()) toast("THE NEEDLE IS DARK — " + p.seekerCd.toFixed(1) + "s"); return false; }
  if (pet.order) { if (p === localPlayer()) toast("YOUR COMPANION IS ALREADY SEEKING"); return false; }
  if (Game.ambush) { if (p === localPlayer()) toast("A SEAL ALREADY BREAKS"); return false; }
  const maxD = typeof SNIPER_PET_ORDER_RANGE === "number" ? SNIPER_PET_ORDER_RANGE : 1500;
  const chest = nearestSealedChestTo(p.x, p.y, maxD);
  if (!chest) { if (p === localPlayer()) toast("NO SEALED BOX IN REACH"); return false; }
  if (p.pet === "seeker") { p.seekerMarkX = chest.x; p.seekerMarkY = chest.y; }
  pet.order = { chest, phase: "go" };
  if (p === localPlayer()) {
    floatText(pet.x, pet.y - 20, "SEEK THE SEAL", PTYPES[pet.type].color, 11);
    AudioFX.pickup();
  }
  return true;
}
/* SEEKER's [ E ]: always mark the nearest seal, and send the companion if the
   box is close enough. The mark is a local waypoint; the errand is host-run. */
function seekerSealErrand(p) {
  const pet = petForOwner(p);
  if (!pet) { if (p === localPlayer()) toast("NO COMPANION ANSWERS"); return false; }
  if ((p.seekerCd || 0) > 0) { if (p === localPlayer()) toast("THE NEEDLE IS DARK — " + p.seekerCd.toFixed(1) + "s"); return false; }
  const c = nearestSealedChestTo(p.x, p.y, SEEKER_FIND_RANGE);
  if (!c) { if (p === localPlayer()) toast("THE NEEDLE FINDS NO SEALED BOX"); return false; }
  p.seekerMarkX = c.x; p.seekerMarkY = c.y;
  const maxD = typeof SNIPER_PET_ORDER_RANGE === "number" ? SNIPER_PET_ORDER_RANGE : 1500;
  if (!Game.ambush && !pet.order && dist2(c.x, c.y, p.x, p.y) <= maxD * maxD) return orderPetToSeal(p);
  if (p === localPlayer()) {
    floatText(pet.x, pet.y - 20, "SEAL MARKED", PTYPES.seeker.color, 11);
    toast(Game.ambush ? "THE NEEDLE HOLDS THE MARK"
      : pet.order ? "YOUR COMPANION IS ALREADY SEEKING"
      : "TOO FAR TO SEND — THE NEEDLE POINTS THE WAY");
    AudioFX.pickup();
  }
  return true;
}
/* press-1 toggle: every foe an ambush sends wears a sigil */
function toggleSeekerAmbushMark(p) {
  if (petLvl("seeker", "ambush") <= 0) {
    if (p === localPlayer()) toast("TRAP SIGHT LIES UNBOUGHT IN THE VAULT");
    return false;
  }
  p.seekerAmbush = !p.seekerAmbush;
  if (p === localPlayer()) {
    toast(p.seekerAmbush ? "TRAP SIGHT — EVERY AMBUSH FOE MARKED" : "TRAP SIGHT — THE MARKS FADE");
    AudioFX.pickup();
  }
  return p.seekerAmbush;
}
/* press-2 toggle: the needle points at the nearest sealed vitality box */
function toggleSeekerVitalMark(p) {
  if (petLvl("seeker", "vital") <= 0) {
    if (p === localPlayer()) toast("LIFE LODE LIES UNBOUGHT IN THE VAULT");
    return false;
  }
  if (!p.seekerVital && !nearestSealedHealthTo(p.x, p.y, SEEKER_VITAL_RANGE)) {
    if (p === localPlayer()) toast("NO SEALED VITALITY BOX ANSWERS");
    return false;
  }
  p.seekerVital = !p.seekerVital;
  if (p === localPlayer()) {
    toast(p.seekerVital ? "LIFE LODE — THE NEEDLE SEEKS VITALITY" : "LIFE LODE — THE NEEDLE RESTS");
    AudioFX.pickup();
  }
  return p.seekerVital;
}

function updatePet(pet, dt) {
  const T = PTYPES[pet.type];
  const ow = pet.owner;
  if (pet.order) {
    const ord = pet.order;
    if (ord.phase === "go" && (!ord.chest || ord.chest.state !== "sealed")) ord.phase = "return";
    const go = ord.phase === "go";
    const tx = go ? ord.chest.x : ow.x, ty = go ? ord.chest.y : ow.y;
    const speed = (typeof SNIPER_PET_ORDER_SPEED === "number" ? SNIPER_PET_ORDER_SPEED : 430) + (pet.orderSpeed || 0);
    const reach = typeof SNIPER_PET_ORDER_REACH === "number" ? SNIPER_PET_ORDER_REACH : 34;
    const d = Math.sqrt(dist2(pet.x, pet.y, tx, ty));
    if (d > 0.01) {
      const a = angTo(pet.x, pet.y, tx, ty);
      const step = Math.min(speed * dt, d);
      pet.x += Math.cos(a) * step;
      pet.y += Math.sin(a) * step;
    }
    if (Math.random() < dt * 14 && particles.length < 500)
      particles.push({ x: pet.x, y: pet.y, vx: rnd(-18, 18), vy: rnd(-18, 18),
        t: 0, life: 0.28, r: rnd(1.5, 2.5), color: T.color });
    if (go && d <= reach + speed * dt) {
      ord.phase = "return";
      if (!Game.ambush && ord.chest && ord.chest.state === "sealed") {
        triggerAmbush(ord.chest);
        /* the needle goes dark for a breath after it cuts a seal */
        ow.seekerCd = Math.max(ow.seekerCd || 0, SEEKER_SEAL_CD);
        floatText(ord.chest.x, ord.chest.y - 30, "THE COMPANION BREAKS THE SEAL", T.color, 12);
      }
    } else if (!go && d <= 46) {
      pet.order = null;
    }
    return;
  }
  if (pet.type === "orbiter") {
    pet.orbA += dt * pet.orbSpeed;
    pet.x = ow.x + Math.cos(pet.orbA) * pet.orbR;
    pet.y = ow.y + Math.sin(pet.orbA) * pet.orbR;

    if (pet.block) {
      pet.pulseT = (pet.pulseT || 0) - dt;
      if (pet.pulseT <= 0) {
        pet.pulseT = 2;
        shockwaves.push({ x: pet.x, y: pet.y, r: 8, max: 120, speed: 400,
          dmg: pet.dmg * 2, hostile: false, color: PTYPES.orbiter.color, hitSet: new Set(), owner: ow });
        AudioFX.zap();
      }
    }
    petContactDamage(pet, dt);
    if (pet.block) petBlock(pet);
  } else if (pet.type === "hunter") {
    const tgt = wisplingTarget(pet);
    let tx, ty;
    if (tgt && dist2(ow.x, ow.y, tgt.x, tgt.y) < pet.range * pet.range) {
      tx = tgt.x; ty = tgt.y;                  // hunt: ambush foes (farthest from warden) first, else lowest HP
      /* a violet smear marks the dart, so its signature lunge reads */
      if (Math.random() < 0.7) particles.push({ x: pet.x, y: pet.y, vx: 0, vy: 0,
        t: 0, life: 0.18, r: rnd(2, 3.5), color: PTYPES.hunter.color });
    } else {                                   // nothing near: drift in a slow ring at your side
      pet.orbA += dt * 1.6;
      tx = ow.x + Math.cos(pet.orbA) * 44;
      ty = ow.y + Math.sin(pet.orbA) * 44;
    }
    const a = angTo(pet.x, pet.y, tx, ty);
    const step = Math.min(pet.speed * dt, Math.sqrt(dist2(pet.x, pet.y, tx, ty)));
    pet.x += Math.cos(a) * step; pet.y += Math.sin(a) * step;
    petContactDamage(pet, dt);
  } else if (pet.type === "seeker") {
    /* it circles at your shoulder, needle lifted toward whatever it has found */
    pet.orbA += dt * 1.1;
    const tx = ow.x + Math.cos(pet.orbA) * SEEKER_ORBIT_R;
    const ty = ow.y + Math.sin(pet.orbA) * SEEKER_ORBIT_R - 4;
    const k = 1 - Math.pow(0.0015, dt);
    pet.x = lerp(pet.x, tx, k); pet.y = lerp(pet.y, ty, k);
  } else if (pet.type === "gunner") {
    const tx = ow.x - 26, ty = ow.y - 26;   // hover at your shoulder
    const k = 1 - Math.pow(0.0015, dt);
    pet.x = lerp(pet.x, tx, k); pet.y = lerp(pet.y, ty, k);
    pet.fireT -= dt;
    if (pet.fireT <= 0) {
      const tgt = nearestEnemy(pet.x, pet.y);
      if (tgt && dist2(pet.x, pet.y, tgt.x, tgt.y) < pet.range * pet.range) {
        const a = angTo(pet.x, pet.y, tgt.x, tgt.y);
        const b = { x: pet.x, y: pet.y,
          vx: Math.cos(a) * T.shotSpeed, vy: Math.sin(a) * T.shotSpeed,
          r: 4, dmg: pet.dmg, t: 0, life: 1.2,
          pierce: 0, bounce: 0, homing: 0, venom: 0, ember: 0, frost: 0, storm: 0,
          execute: 0, knock: 30, hitSet: new Set(), pet: true, owner: pet.owner };
        /* RUNE-ETCHED SHOT: fold the owner's rune mods into the imp's bullet */
        if (pet.inherit && ow.mods) {
          const m = ow.mods;
          b.pierce = m.pierce; b.bounce = m.bounce; b.homing = m.homing;
          b.venom = m.venom; b.ember = m.ember; b.frost = m.frost; b.storm = m.storm;
          b.execute = m.execute; b.knock = m.knock || 30;
          b.crit = m.crit; b.critMul = m.critMul; b.fear = m.fear; b.fearDur = m.fearDur;
          b.r = Math.max(4, m.size * 0.7);
        }
        bullets.push(b);
        /* the imp's shot reports: muzzle spray + a little backward kick
           (the lerp-to-shoulder above eases it back into place) */
        for (let k = 0; k < 3; k++) particles.push({
          x: pet.x + Math.cos(a) * (pet.r + 4), y: pet.y + Math.sin(a) * (pet.r + 4),
          vx: Math.cos(a + rnd(-0.5, 0.5)) * rnd(50, 150), vy: Math.sin(a + rnd(-0.5, 0.5)) * rnd(50, 150),
          t: 0, life: 0.12, r: rnd(2, 3), color: "#ffe08a" });
        pet.x -= Math.cos(a) * 3; pet.y -= Math.sin(a) * 3;
        pet.fireT = pet.rate;
      }
    }
  }
}

function drawPet(cx, pet) {
  const T = PTYPES[pet.type];
  if (pet.type === "seeker") { drawSeekerPet(cx, pet); return; }
  cx.save();
  /* ORB WARD hums a faint ring around the sentinel */
  if (pet.block) {
    cx.globalAlpha = 0.5; cx.strokeStyle = T.color; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(pet.x, pet.y, pet.r + 4 + Math.sin(Game.time * 6) * 1.5, 0, TAU); cx.stroke();
    cx.globalAlpha = 1;
  }
  cx.shadowColor = T.color; cx.shadowBlur = 10;
  cx.globalAlpha = 0.92; cx.fillStyle = T.color;
  cx.beginPath(); cx.arc(pet.x, pet.y, pet.r, 0, TAU); cx.fill();
  cx.shadowBlur = 0; cx.globalAlpha = 1;
  cx.fillStyle = "#0b0b14";
  cx.font = "bold " + (pet.r + 3) + "px monospace";
  cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillText(T.glyph, pet.x, pet.y + 1);
  cx.restore();
}

/* the SEEKER's compass: a ticked ring, a needle that leans toward what it has
   found, and a counterweight tail. Purely a reading — the needle is the pet. */
function drawSeekerPet(cx, pet) {
  const T = PTYPES.seeker, col = T.color, t = Game.time;
  const tgt = seekerNeedleTarget(pet);
  const aim = tgt ? angTo(pet.x, pet.y, tgt.x, tgt.y) : t * 0.7;
  cx.save();
  cx.translate(pet.x, pet.y);
  /* dark face */
  cx.shadowColor = col; cx.shadowBlur = 9;
  cx.fillStyle = "#0b0b14"; cx.globalAlpha = 0.9;
  cx.beginPath(); cx.arc(0, 0, pet.r + 1, 0, TAU); cx.fill();
  /* ticked bezel */
  cx.globalAlpha = 0.9; cx.strokeStyle = col; cx.lineWidth = 1.6;
  cx.beginPath(); cx.arc(0, 0, pet.r + 3, 0, TAU); cx.stroke();
  cx.shadowBlur = 0; cx.globalAlpha = 0.6; cx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + t * 0.12;
    const r1 = pet.r + 3, r2 = pet.r + (i % 2 ? 4.5 : 6.5);
    cx.beginPath();
    cx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    cx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    cx.stroke();
  }
  /* needle */
  cx.rotate(aim);
  cx.globalAlpha = 1; cx.fillStyle = col; cx.shadowColor = col; cx.shadowBlur = 8;
  cx.beginPath();
  cx.moveTo(pet.r - 1, 0); cx.lineTo(-2, -3.4); cx.lineTo(-5, 0); cx.lineTo(-2, 3.4);
  cx.closePath(); cx.fill();
  /* counterweight */
  cx.globalAlpha = 0.5; cx.shadowBlur = 0;
  cx.beginPath();
  cx.moveTo(-pet.r + 2, 0); cx.lineTo(0, -2.2); cx.lineTo(0, 2.2);
  cx.closePath(); cx.fill();
  /* the needle's pivot */
  cx.rotate(-aim); cx.globalAlpha = 0.95;
  cx.beginPath(); cx.arc(0, 0, 1.6, 0, TAU); cx.fill();
  cx.restore();
}
