/* =========================================================
   RUNEGUN · Pets
   Vault-bought companions that fight beside you. One equipped pet
   (Meta.pet) is spawned per floor in setupFloor and driven each frame
   by updatePet / drawn by drawPet. All three reuse the core combat
   helpers (damageEnemy, nearestEnemy) and the shared bullets array.

   Each pet also has purchasable UPGRADES (Vault → PETS, shown under a
   pet once owned). Stat upgrades stack to `max`; one-time buffs (`once`)
   unlock a special power. Levels live in Meta.unlocked under
   "petbuff:<type>:<key>" and are baked onto the pet in spawnPet.
   ========================================================= */
"use strict";

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
};

const petLvl = (type, key) => Meta.unlocked["petbuff:" + type + ":" + key] || 0;

function spawnPet(type, owner) {
  const T = PTYPES[type];
  const p = { type, owner, x: owner.x, y: owner.y, r: T.r, dmg: T.dmg,
    orbA: rnd(0, TAU), hitT: 0, fireT: 0,
    orbR: T.orbR, orbSpeed: T.orbSpeed, speed: T.speed, range: T.range, rate: T.rate,
    block: false, lifesteal: 0, inherit: false };
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

function updatePet(pet, dt) {
  const T = PTYPES[pet.type];
  const ow = pet.owner;
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
    const tgt = nearestEnemy(pet.x, pet.y);
    let tx, ty;
    if (tgt && dist2(ow.x, ow.y, tgt.x, tgt.y) < pet.range * pet.range) {
      tx = tgt.x; ty = tgt.y;                  // hunt the nearest horror in reach
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
