/* =========================================================
   RUNEGUN · THE INDEX NURSEFATHER (Yi Sang) — the Prescript
   A pure melee warden: a spider in a black suit, one gold eye,
   a chained blade under his sleeve. Every strike decides a
   prescript the Oracle delivered, and the Oracle does not
   take "no" for an answer.

   THE PRESCRIPT — every nine seconds the Oracle marks the
   strongest horror on the board: THE PRESCRIPT'S TARGET.
   That horror takes +20% from every cut, and each cut upon
   it banks Grace of the Prescript (up to nine): at three
   his edge sharpens to Unlock I, at six Unlock II, at nine
   the full payout comes due (+30%). Fell the marked horror
   while it still holds the mark and the execution completes:
   +3 Grace, and the Karmic Consequence lifts. Let the mark
   pass with the horror standing, and the Consequence takes
   him instead: +2 Karmic Consequence (max 10, −4% damage
   per stack).

   POISE — every cut banks a Poise, a critical banks two (max 5);
   +6% cut damage per stack. The kit's [On Hit] builds paid out
   in one strike's worth per blow, because our Yi Sang attacks
   alone, without coin-luck or skill-dashboards — the blade is
   the account.

   THE ORACLE DEVICE — a vial of black metallic liquid at his throat.
   Each cut it pours out whichever weapon the Prescript demands
   (Hermes breathes through it): a HATCHET (copper: heavy knock,
   drags the horror slow), a STILETTO (gloom-violet: a gloom-bleed
   that never closes), or a BASTARD SWORD (pale steel: +18% damage).

   The blade answers the projectile runes through the shared
   melee remap (data/runes.js: meleeWeaponMods /
   bladeReading); the fan/lane/rear runes become cuts
   exactly as they do for every melee warden.
   ========================================================= */
"use strict";

/* --- the Prescript --- */
const YI_MARK_CD = 9;              // seconds between marks landing
const YI_MARK_FIRST = 1.6;         // the first mark comes fast — the Oracle does not wait long
const YI_MARK_TIME = 12;           // the mark's window before the Oracle loses interest
const YI_MARK_BONUS = 0.20;        // the marked horror takes +20% from every cut

/* --- Grace of the Prescript --- */
const YI_GRACE_MAX = 9;
const YI_GRACE_TIER_3 = 3, YI_GRACE_TIER_6 = 6, YI_GRACE_TIER_9 = 9;
const YI_GRACE_TIER_DMG = [0, 0.08, 0.16, 0.30];   // by tier 0/1/2/3
const YI_GRACE_FROM_EXECUTION = 3;  // +Grace for falling the marked horror
const YI_KARMIC_MAX = 10;
const YI_KARMIC_PER_STACK = 0.04;  // each Consequence drags cuts down 4%
const YI_KARMIC_EXECUTE_CLEAR = 2; // exiting a prescript clears two stacks
const YI_KARMIC_MISS = 2;          // a mark that escapes alive adds two

/* --- Poise --- */
const YI_POISE_MAX = 5;
const YI_POISE_DMG = 0.06;

/* --- the blade itself --- */
const YI_REACH_BASE = 100;
const YI_HALF_ARC = 0.62;
const YI_SLASH_LIFE = 0.22;
const YI_SWEEP_SHARE = 0.5;
const YI_TWIN_GAP = 34;
const YI_TWIN_HALF = 0.18;

/* --- the nine vessels of the Oracle Device (Caduceus) --- */
const YI_WEAPON_HATCHET = 0;      // Blunt — hacking ribs with a bone hatchet
const YI_WEAPON_STILETTO = 1;     // Pierce — penetrating lungs with a stiletto
const YI_WEAPON_BASTARD = 2;      // Slash — cleaving shoulder and skull with a bastard sword
const YI_WEAPON_RAPIER = 3;       // Pierce — punching ten holes with a rapier
const YI_WEAPON_HAMMER = 4;       // Blunt — caving in the back of the skull with a hammer
const YI_WEAPON_GREATSWORD = 5;   // Slash — rending body with a greatsword
const YI_WEAPON_LANCE = 6;        // Pierce — boring a 20-inch hole with a lance
const YI_WEAPON_WHIP = 7;         // Blunt — ripping flesh to strips with a whip
const YI_WEAPON_SCYTHE = 8;       // Slash — lacerating through space with a scythe

const YI_WEAPONS = [
  "HATCHET", "STILETTO", "BASTARD SWORD", "RAPIER", "HAMMER",
  "GREATSWORD", "LANCE", "WHIP", "SCYTHE",
];
const YI_WEAPON_BLUNT = [YI_WEAPON_HATCHET, YI_WEAPON_HAMMER, YI_WEAPON_WHIP];
const YI_WEAPON_PIERCE = [YI_WEAPON_STILETTO, YI_WEAPON_RAPIER, YI_WEAPON_LANCE];
const YI_WEAPON_SLASH = [YI_WEAPON_BASTARD, YI_WEAPON_GREATSWORD, YI_WEAPON_SCYTHE];

const YI_HATCHET_KNOCK = 1.5;       // more knockback on the heavy cuts
const YI_HATCHET_SLOW = 0.6;
const YI_STILETTO_GLOOM_T = 3;
const YI_STILETTO_GLOOM_DPS = 7;
const YI_BASTARD_DMG = 1.15;        // +15% damage
const YI_RAPIER_DEFDOWN = 0.25;     // -25% damage dealt by target
const YI_RAPIER_DEFDOWN_TIME = 3;
const YI_RAPIER_DEFDOWN_MAX = 2;
const YI_HAMMER_STAGGER = 1.1;      // target can't act for this long
const YI_GREATSWORD_DMG = 1.2;      // +20% damage
const YI_LANCE_DMG = 1.15;          // +15% damage
const YI_WHIP_DMG = 1.15;           // +15% damage
const YI_FRAG_DMG = 0.25;           // target takes +25% damage per Fragility stack
const YI_FRAG_TIME = 4;
const YI_FRAG_MAX = 2;
const YI_SCYTHE_DMG = 1.3;          // +30% damage, guaranteed crit
const YI_OFFENSE_DMG = 0.25;        // each Offense stack adds +25% damage
const YI_OFFENSE_MAX = 2;
const YI_OFFENSE_TIME = 3;

/* --- the arc's color tracks the weapon it was swung with --- */
function yiArcColor(w) {
  switch (w) {
    case YI_WEAPON_HATCHET:   return "#e0915a"; // copper
    case YI_WEAPON_STILETTO:  return "#8f6bff"; // gloom violet
    case YI_WEAPON_BASTARD:   return "#f2f4f6"; // pale steel
    case YI_WEAPON_RAPIER:    return "#b9c8e2"; // cold steel-blue
    case YI_WEAPON_HAMMER:    return "#9e9ea2"; // iron
    case YI_WEAPON_GREATSWORD:return "#d4d8de"; // greatsword steel
    case YI_WEAPON_LANCE:     return "#a8d4ff"; // pale blue lance
    case YI_WEAPON_WHIP:      return "#ff9a3d"; // hot whip
    case YI_WEAPON_SCYTHE:    return "#b8f6ff"; // scythe-white
    default:                  return "#f2f4f6";
  }
}
function yiArcTail(w) {
  switch (w) {
    case YI_WEAPON_HATCHET:   return "#c07a44";
    case YI_WEAPON_STILETTO:  return "#5f3bd8";
    case YI_WEAPON_BASTARD:   return "#c8ccd2";
    case YI_WEAPON_RAPIER:    return "#8290ac";
    case YI_WEAPON_HAMMER:    return "#646468";
    case YI_WEAPON_GREATSWORD:return "#a6abb4";
    case YI_WEAPON_LANCE:     return "#6a93b8";
    case YI_WEAPON_WHIP:      return "#c06624";
    case YI_WEAPON_SCYTHE:    return "#7ad4e4";
    default:                  return "#c8ccd2";
  }
}
const YI_COL = {
  suit: "#17171c", suitHi: "#2b2b33", suitDark: "#0d0d11",
  shirt: "#f2efe8", glove: "#f2efe8", skin: "#efe7da",
  gold: "#d9b65c", glass: "#ffdf8a", glassDeep: "#a97a2f",
  blood: "#a3212a", bloodHi: "#c9353d",
  gloom: "#7a5bd8",
  arc: "#ffe9a8", arcEdge: "#fffdf2", arcTail: "#caa95c",
  mark: "#7ec0ff", markCore: "#101016",
};

function yiVitals(p) {
  if (!p) return;
  if (p.yiSlashT === undefined) p.yiSlashT = 0;
  if (p.yiGrace === undefined) p.yiGrace = 0;
  if (p.yiKarmic === undefined) p.yiKarmic = 0;
  if (p.yiMarkT === undefined) p.yiMarkT = 0;
  if (p.yiMarkCd === undefined) p.yiMarkCd = YI_MARK_FIRST;
  if (p.yiMarkId === undefined) p.yiMarkId = null;
  if (p.yiWeapon === undefined) p.yiWeapon = YI_WEAPON_BASTARD;
  if (p.yiSlashAng === undefined) p.yiSlashAng = 0;
  if (p.yiSlashDir === undefined) p.yiSlashDir = 1;
  if (p.yiSlashReach === undefined) p.yiSlashReach = YI_REACH_BASE;
  if (p.yiPoise === undefined) p.yiPoise = 0;
  if (p.yiOffenseS === undefined) p.yiOffenseS = 0;
  if (p.yiOffenseT === undefined) p.yiOffenseT = 0;
}

/* the marked horror, from the live object (host/solo) or the synced id (guest) */
function yiMarkedFoe(p) {
  if (!p || !(p.yiMarkT > 0)) return null;
  const o = p.yiMark;
  if (o && !o.dead && o.hp > 0) return o;
  if (p.yiMarkId != null) {
    for (const e of enemies) if (e.id === p.yiMarkId && !e.dead && e.hp > 0) return e;
  }
  return null;
}

function yiIsMarked(p, e) {
  if (!p || !(p.yiMarkT > 0)) return false;
  if (p.yiMark === e) return true;
  if (p.yiMarkId != null && e.id === p.yiMarkId) return true;
  return false;
}

/* the Oracle chooses the strongest horror standing — never a corpse */
function yiPickMark(p, x, y) {
  let best = null, bestHp = -1;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const hp = e.maxHp || e.hp || 0;
    if (hp > bestHp) { bestHp = hp; best = e; }
  }
  return best;
}

function yiFallMark(p, e) {
  p.yiMark = e || null;
  p.yiMarkId = e ? e.id : null;
  p.yiMarkT = YI_MARK_TIME;
}

function yiClearMark(p) {
  p.yiMark = null; p.yiMarkId = null; p.yiMarkT = 0;
}

/* Grace of the Prescript — three unlocks and the full payout */
function yiGraceTier(p) {
  const g = p.yiGrace || 0;
  if (g >= YI_GRACE_TIER_9) return 3;
  if (g >= YI_GRACE_TIER_6) return 2;
  if (g >= YI_GRACE_TIER_3) return 1;
  return 0;
}
function yiGraceBonus(p) { return YI_GRACE_TIER_DMG[yiGraceTier(p)]; }

/* one cut's bite — Poise sharpens, Grace deepens, Karmic drags, the BASTARD SWORD
   hones his Offense stacks */
function yiBite(p) {
  const m = p.mods || {};
  const off = Math.min(YI_OFFENSE_MAX, p.yiOffenseS || 0);
  const bite = meleeBite(m)
    * (1 + (p.yiPoise || 0) * YI_POISE_DMG)
    * (1 + yiGraceBonus(p))
    * (1 + off * YI_OFFENSE_DMG)
    * (1 - Math.min(0.4, (p.yiKarmic || 0) * YI_KARMIC_PER_STACK));
  return bite;
}

/* felling the marked horror completes the execution */
function yiFallenMark(p, e) {
  if (!p || p.char !== "yi") return;
  yiVitals(p);
  if ((p.yiGrace || 0) < YI_GRACE_MAX)
    p.yiGrace = Math.min(YI_GRACE_MAX, (p.yiGrace || 0) + YI_GRACE_FROM_EXECUTION);
  p.yiKarmic = Math.max(0, (p.yiKarmic || 0) - YI_KARMIC_EXECUTE_CLEAR);
  yiClearMark(p);
  if (p === localPlayer()) {
    floatText(p.x, p.y - 38, "EXECUTED", "#ffe9a8", 17);
    if (typeof toast === "function") toast("THE PRESCRIPT IS EXECUTED — THE KARMIC LEDGER LIFTS");
  }
  AudioFX.chest();
}

/* one wound, with every blade rider in one place */
function yiHitEnemy(p, e, x, y, forceCrit, biteMul, weapon) {
  const m = p.mods || {};
  let crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
  if (weapon === YI_WEAPON_SCYTHE) crit = true;          // the scythe always finds the gap
  const critMul = m.critMul || 2.2;
  const bitEm = yiIsMarked(p, e) ? YI_MARK_BONUS : 0;
  const weapDmg = weapon === YI_WEAPON_BASTARD ? YI_BASTARD_DMG
                : weapon === YI_WEAPON_GREATSWORD ? YI_GREATSWORD_DMG
                : weapon === YI_WEAPON_LANCE ? YI_LANCE_DMG
                : weapon === YI_WEAPON_WHIP ? YI_WHIP_DMG
                : weapon === YI_WEAPON_SCYTHE ? YI_SCYTHE_DMG
                : 1;
  let bite = yiBite(p) * (biteMul || 1) * (1 + bitEm)
    * weapDmg
    * (crit ? critMul : 1);
  /* target is Fragile — it takes +25% damage for every stack */
  if (e.fragT > 0 && e.fragStacks > 0) bite *= 1 + YI_FRAG_DMG * e.fragStacks;
  damageEnemy(e, bite, {
    owner: p, x, y, melee: true, critHit: crit,
    knock: (m.knock || 0) * (weapon === YI_WEAPON_HATCHET ? YI_HATCHET_KNOCK : 1) * (forceCrit ? 1.6 : 1),
  });
  /* every landed cut banks Poise — [On Hit] in his kit — and a critical banks an extra;
     the Oracle counts true strikes, and Yi Sang stacks them like a debt-book */
  if (!e.dead && (p.yiPoise || 0) < YI_POISE_MAX) {
    const gain = crit ? 2 : 1;   // crit = 1 + [On Crit] extra
    p.yiPoise = Math.min(YI_POISE_MAX, (p.yiPoise || 0) + gain);
    if (p === localPlayer() && (crit || p.yiPoise >= YI_POISE_MAX))
      floatText(e.x, e.y - e.r - 16, "POISE " + p.yiPoise + "/" + YI_POISE_MAX, "#d9b65c", 13);
  }
  /* cut into the mark, and the Oracle grants you more of it */
  if (!e.dead && yiIsMarked(p, e) && (p.yiGrace || 0) < YI_GRACE_MAX) {
    p.yiGrace = (p.yiGrace || 0) + 1;
  }
  /* [Hatchet] — bruise the target into a sluggish step */
  if (!e.dead && weapon === YI_WEAPON_HATCHET) {
    e.slowT = Math.max(e.slowT || 0, YI_HATCHET_SLOW);
  }
  /* [Stiletto] — a gloom-bleed that never closes */
  if (!e.dead && weapon === YI_WEAPON_STILETTO) {
    e.gloomT = Math.max(e.gloomT || 0, YI_STILETTO_GLOOM_T);
    e.gloomDps = Math.max(e.gloomDps || 0, YI_STILETTO_GLOOM_DPS);
    e.gloomBy = p;
  }
  /* [Bastard Sword] — hone for two stacks of Offense (Hermes answers the honing) */
  if (!e.dead && weapon === YI_WEAPON_BASTARD) {
    p.yiOffenseS = Math.min(YI_OFFENSE_MAX, (p.yiOffenseS || 0) + 1);
    p.yiOffenseT = YI_OFFENSE_TIME;
    if (p === localPlayer())
      floatText(p.x, p.y - 40, "OFFENSE " + p.yiOffenseS + "/" + YI_OFFENSE_MAX, "#ffedb8", 13);
  }
  /* [Rapier] — puncture the armor of Catche's guard — it takes the next hits softer too;
     in our terms, the enemy's blows deal less damage */
  if (!e.dead && weapon === YI_WEAPON_RAPIER) {
    e.defDown = Math.min(YI_RAPIER_DEFDOWN_MAX, (e.defDown || 0) + 1);
    e.defDownT = YI_RAPIER_DEFDOWN_TIME;
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, "DEFENCE DOWN", "#b9c8e2", 12);
  }
  /* [Hammer] — caving in the skull leaves the victim unable to act */
  if (!e.dead && weapon === YI_WEAPON_HAMMER) {
    e.paralyzeT = Math.max(e.paralyzeT || 0, YI_HAMMER_STAGGER);
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, "STAGGERED", "#ffffff", 13);
  }
  /* [Greatsword, Lance, Whip] — lay a Fragility into the foe;
     fragile flesh gives way to every blade that lands */
  if (!e.dead && (weapon === YI_WEAPON_GREATSWORD || weapon === YI_WEAPON_LANCE || weapon === YI_WEAPON_WHIP)) {
    e.fragT = Math.max(e.fragT || 0, YI_FRAG_TIME);
    e.fragStacks = Math.min(YI_FRAG_MAX, (e.fragStacks || 0) + 1);
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, "FRAGILE ×" + e.fragStacks, "#ff9a3d", 12);
  }
  if (!e.dead) applyMeleeElements(p, e, m);
}

/* a forward cut (or the whole pattern's share of it) */
function yiCutArc(p, x, y, aim, halfArc, reach, forceCrit, mark, biteMul, weapon) {
  const m = p.mods || {};
  let best = null, bestHp = -1;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (reach + e.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    yiHitEnemy(p, e, x, y, forceCrit, biteMul, weapon);
    if (e.dead || e.hp <= 0) continue;
    const hp = e.maxHp || e.hp || 0;
    if (hp > bestHp) { bestHp = hp; best = e; }
  }
  /* VERSUS: the same arc cuts a rival warden */
  if (Game.pvpMode) for (const foe of players) {
    if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
    const dx = foe.x - x, dy = foe.y - y;
    if (dx * dx + dy * dy > (reach + foe.r) ** 2) continue;
    let delta = Math.atan2(dy, dx) - aim;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > halfArc) continue;
    const crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
    const critMul = m.critMul || 2.2;
    hurtPlayer(foe, yiBite(p) * (biteMul || 1) * (weapon === YI_WEAPON_BASTARD ? 1.18 : 1) * (crit ? critMul : 1),
      { x, y, knock: (m.knock || 0) * (weapon === YI_WEAPON_HATCHET ? 0.9 : 0.6) });
  }
  return best;
}

/* per-frame bookkeeping: the swing's afterglow, the mark, and the Oracle's clock */
function yiTick(p, dt) {
  if (!p) return;
  yiVitals(p);
  p.yiSlashT = Math.max(0, p.yiSlashT - dt);
  /* the BASTARD SWORD hones but for a while */
  if (p.yiOffenseT > 0) {
    p.yiOffenseT -= dt;
    if (p.yiOffenseT <= 0) p.yiOffenseS = 0;
  }
  if (p.yiMarkT > 0) {
    p.yiMarkT = Math.max(0, p.yiMarkT - dt);
    if (p.yiMarkT <= 0 && p.yiMark) {
      /* the arc closed before the account was settled — the Consequence collects */
      p.yiKarmic = Math.min(YI_KARMIC_MAX, (p.yiKarmic || 0) + YI_KARMIC_MISS);
      if (p === localPlayer()) floatText(p.x, p.y - 40, "KARMIC +" + YI_KARMIC_MISS, "#ff6b6b", 14);
      yiClearMark(p);
    } else {
      const tgt = yiMarkedFoe(p);
      if (!tgt) yiClearMark(p);        // target fell elsewhere — the mark dissolves (an execution flows through killEnemy)
    }
  }
  if (p.yiMarkCd > 0) {
    p.yiMarkCd = Math.max(0, p.yiMarkCd - dt);
    if (p.yiMarkCd <= 0 && p.yiMarkT <= 0 && enemies.length) {
      const e = yiPickMark(p);
      if (e) {
        yiFallMark(p, e);
        p.yiMarkCd = YI_MARK_CD;
        if (p === localPlayer()) {
          floatText(p.x, p.y - 40, "THE PRESCRIPT", "#7ec0ff", 17);
        }
      }
    }
  } else if (p.yiMarkT <= 0 && enemies.length) {
    p.yiMarkCd = Math.min(p.yiMarkCd, 1.2);
  }
}

/* the Oracle delivers its account — one swing of the pattern */
function yiSwing(p, x, y, aim) {
  const m = p.mods;
  yiVitals(p);
  const reach = YI_REACH_BASE + Math.max(0, (m.size || 4) - 4) * 0.8;
  const arcs = Math.max(1, m.meleeArcs || 1);
  const twin = Math.max(0, m.meleeTwin || 0);
  const mirror = Math.max(0, m.meleeMirror || 0);
  const totalHalf = YI_HALF_ARC + Math.max(0, m.meleeSpread || 0);
  const wedge = totalHalf / arcs;
  const dir = Math.random() < 0.5 ? -1 : 1;
  p.yiSlashT = YI_SLASH_LIFE;
  p.yiSlashAng = aim;
  p.yiSlashReach = reach;
  p.yiSlashDir = dir;
  p.yiSlashLanes = null;

  /* the Oracle rules its weapon — one of nine is handed down this swing */
  const weapon = (Math.random() * 9) | 0;
  p.yiWeapon = weapon;

  const mark = p.yiMarkT > 0;
  for (let i = 0; i < arcs; i++) {
    const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
    yiCutArc(p, x, y, a, arcs === 1 ? totalHalf : wedge, reach, false, mark, null, weapon);
  }
  yiTrail(x, y, aim, reach, weapon, arcs === 1 ? 9 : Math.min(9, 5 + arcs));

  /* lanes and rear cuts get their own crescents */
  if (arcs > 1 || twin || mirror) {
    p.yiSlashLanes = [];
    for (let i = 0; i < arcs; i++) {
      const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
      p.yiSlashLanes.push({
        dx: 0, dy: 0, ang: a, scale: (arcs === 1 ? totalHalf : wedge) / YI_HALF_ARC,
        delay: i * 0.012, alpha: 1, dir, weapon,
      });
    }
    const perpX = Math.cos(aim + Math.PI / 2), perpY = Math.sin(aim + Math.PI / 2);
    for (let i = 0; i < twin; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const off = YI_TWIN_GAP * (Math.floor(i / 2) + 1) * side;
      const ox = x + perpX * off, oy = y + perpY * off;
      yiCutArc(p, ox, oy, aim, YI_TWIN_HALF, reach, false, mark, null, weapon);
      p.yiSlashLanes.push({
        dx: perpX * off, dy: perpY * off, ang: aim,
        scale: YI_TWIN_HALF / YI_HALF_ARC, delay: 0.02 + i * 0.012,
        alpha: 0.75, dir, cheap: true, weapon,
      });
      yiTrail(ox, oy, aim, reach, weapon, 3);
    }
    const backHalf = YI_HALF_ARC * 0.8;
    for (let i = 0; i < mirror; i++) {
      yiCutArc(p, x, y, aim + Math.PI, backHalf, reach * 0.9, false, mark, null, weapon);
      p.yiSlashLanes.push({
        dx: 0, dy: 0, ang: aim + Math.PI, scale: backHalf / YI_HALF_ARC,
        delay: 0.03 + i * 0.012, alpha: 0.7, dir: -dir, cheap: true, weapon,
      });
      yiTrail(x, y, aim + Math.PI, reach * 0.9, weapon, 3);
    }
  }
  return true;
}

/* the dark motes thrown along a cut, and the blood the Oracle spilled to price them */
function yiTrail(x, y, aim, reach, weapon, amount) {
  if (particles.length >= 560) return;
  const base = weapon === YI_WEAPON_HATCHET ? [YI_COL.blunt, "#ffcf9a", "#8a5630"]
    : weapon === YI_WEAPON_STILETTO ? [YI_COL.pierce, "#c9b6ff", "#4a2f9a"]
    : [YI_COL.slash, "#ffffff", "#8d9099"];
  for (let i = 0; i < amount; i++) {
    const a = aim + rnd(-0.9, 0.9);
    const d = rnd(reach * 0.25, reach + 8);
    const blood = Math.random() < 0.2;
    particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * rnd(70, 240), vy: Math.sin(a) * rnd(70, 240),
      t: 0, life: rnd(0.14, 0.3), r: rnd(1.2, 3.2),
      color: blood ? pick([YI_COL.blood, YI_COL.bloodHi, "#60140f"]) : pick(base) });
  }
}

/* ---------------------------------------------------------
   HUD — PRESCRIPT pips, KARMIC, POISE, and the seal
   --------------------------------------------------------- */
let lastYiCue = "";
function updateYiCue(p) {
  const el = typeof document !== "undefined" ? $("yiCue") : null;
  if (!el) return;
  const active = !!p && p.char === "yi";
  el.classList.toggle("on", active);
  if (!active) { lastYiCue = ""; return; }
  const g = clamp(p.yiGrace || 0, 0, YI_GRACE_MAX);
  const k = clamp(p.yiKarmic || 0, 0, YI_KARMIC_MAX);
  const pips = "◆".repeat(g) + "◇".repeat(YI_GRACE_MAX - g);
  const weapon = YI_WEAPONS[p.yiWeapon] || "BASTARD SWORD";
  let txt = "PRESCRIPT " + pips + " · KARMIC " + k + "/" + YI_KARMIC_MAX;
  txt += " · POISE " + (p.yiPoise || 0) + "/" + YI_POISE_MAX;
  txt += " · " + weapon;
  if (p.yiMarkT > 0) txt += " · MARK " + p.yiMarkT.toFixed(1) + "s";
  const tier = yiGraceTier(p);
  const cls = "on" + (tier >= 3 ? " payout" : tier >= 2 ? " unlock2" : tier >= 1 ? " unlock1" : "");
  if (lastYiCue !== txt + cls) {
    lastYiCue = txt + cls;
    el.textContent = txt;
    el.className = cls;
  }
}

/* ---------------------------------------------------------
   RENDER — the seal of the Prescript, the crescent of the cut
   --------------------------------------------------------- */
function drawYiSlashArc(px, py, ang, reach, k, alpha, dir, arcScale, weapon, cheap) {
  const scale = arcScale || 1;
  const span = YI_HALF_ARC * 0.9 * scale;
  const prog = k < YI_SWEEP_SHARE ? k / YI_SWEEP_SHARE : 1;
  const d = dir < 0 ? -1 : 1;
  const start = d > 0 ? -span : span;
  const end = -start;
  const head = start + (end - start) * prog;
  const trail = (1.15 * scale) + 0.4;
  const tail = d > 0 ? Math.max(start, head - trail) : Math.min(start, head + trail);
  const linger = k < YI_SWEEP_SHARE ? 1 : 1 - (k - YI_SWEEP_SHARE) / (1 - YI_SWEEP_SHARE);
  const fade = alpha * Math.pow(Math.max(0, linger), 0.8);
  if (fade <= 0.01 || Math.abs(head - tail) < 0.02) return;
  const R = reach * (0.92 + 0.08 * prog);
  const lo = Math.min(head, tail), hi = Math.max(head, tail);
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  cx.lineCap = "round";
  /* the cold bloom of the cut */
  cx.globalAlpha = fade * (cheap ? 0.4 : 0.55);
  cx.strokeStyle = col;
  cx.shadowColor = col; cx.shadowBlur = cheap ? 8 : 16;
  cx.lineWidth = cheap ? 3 : 6;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* the white edge — a blade, not a smear */
  cx.globalAlpha = fade * 0.95;
  cx.strokeStyle = "#ffffff";
  cx.shadowBlur = 5; cx.lineWidth = cheap ? 1.4 : 2.4;
  cx.beginPath(); cx.arc(0, 0, R, lo, hi); cx.stroke();
  /* a fainter outer whisper of the same arc */
  cx.globalAlpha = fade * 0.2;
  cx.strokeStyle = colTail; cx.shadowBlur = 0; cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(0, 0, R + 5, lo, hi); cx.stroke();
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* the marked horror, seen by its own Yi Sang only — the Index's flower, six burning petals around a blue heart */
function drawYiMark(g) {
  if (typeof localPlayer !== "function") return;
  const P = localPlayer();
  if (!P || P.char !== "yi") return;
  const e = yiMarkedFoe(P);
  if (!e) return;
  const t = Game.time, pulse = 0.6 + 0.4 * Math.sin(t * 5.2);
  const R = (e.r + 15) * (1 + 0.08 * pulse);
  g.save();
  g.translate(e.x, e.y);
  g.rotate(t * 0.55);
  /* a slow outer ring — heavy dashed arc, like a seal burnt into the floor */
  g.globalAlpha = 0.85;
  g.strokeStyle = "#8ed0ff";
  g.shadowColor = "#5aa0e0"; g.shadowBlur = 26;
  g.lineWidth = 3.4;
  g.setLineDash([7, 5]);
  g.lineDashOffset = -t * 26;
  g.beginPath(); g.arc(0, 0, R + 5, 0, TAU); g.stroke();
  g.setLineDash([]);
  /* a solid inner rim, like a candle's edge */
  g.globalAlpha = 0.9;
  g.shadowBlur = 14;
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
  /* six petals — the flower of the Index, two rotated layers of three */
  for (let layer = 0; layer < 2; layer++) {
    const off = layer * (Math.PI / 3);
    const size = layer === 0 ? 1 : 0.78;
    g.fillStyle = layer === 0 ? "#86c8ff" : "#c8e4ff";
    g.shadowColor = "#5aa0e0"; g.shadowBlur = 28;
    g.globalAlpha = 0.9;
    for (let i = 0; i < 3; i++) {
      const a = off + i * (TAU / 3);
      g.save();
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, -R * 0.55, R * 0.46 * size, R * 0.88 * size, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }
  /* the heart — big bright disc, the mark's center */
  g.shadowBlur = 26;
  g.fillStyle = "#f0f8ff";
  g.globalAlpha = 1;
  g.beginPath(); g.arc(0, 0, R * 0.32, 0, TAU); g.fill();
  g.shadowColor = "#2e64a0"; g.shadowBlur = 4;
  g.fillStyle = "#4e8cd0";
  g.beginPath(); g.arc(0, 0, R * 0.17, 0, TAU); g.fill();
  g.restore();
  g.globalAlpha = 1; g.shadowBlur = 0;
}

/* the warden's body — drawn from drawWarden() */
function drawYiWarden(P, px, py, aim, col, tint, hpFrac) {
  const t = Game.time;

  /* the coat streams behind him — one black ribbon, one splash of old dark blood */
  const sway = Math.sin(t * 2.3 + px * 0.017) * 2.4;
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim + Math.PI);
  cx.globalAlpha = 0.6;
  cx.fillStyle = YI_COL.suit;
  cx.beginPath();
  cx.moveTo(4, -9);
  cx.quadraticCurveTo(19, -13 + sway, 27, -3 + sway);
  cx.quadraticCurveTo(20, 2, 25, 10 - sway);
  cx.quadraticCurveTo(11, 9, 4, 9);
  cx.closePath(); cx.fill();
  cx.globalAlpha = 0.55;
  cx.strokeStyle = YI_COL.blood; cx.lineWidth = 2.1; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(7, 4.5); cx.quadraticCurveTo(15, 6 + sway, 21, 3 - sway); cx.stroke();
  cx.restore();
  cx.globalAlpha = 1;

  /* body: the long coat, black trimmed with gold */
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  cx.fillStyle = YI_COL.suit;
  cx.beginPath();
  cx.moveTo(6, -6.5);
  cx.quadraticCurveTo(-2, -9, -11, -5.5);
  cx.quadraticCurveTo(-14.5, 0, -11, 5.5);
  cx.quadraticCurveTo(-2, 9, 6, 6.5);
  cx.quadraticCurveTo(9.5, 0, 6, -6.5);
  cx.closePath(); cx.fill();
  cx.strokeStyle = YI_COL.suitDark; cx.lineWidth = 1.1; cx.stroke();

  /* the wound across the right side of his face — the side he kept */
  cx.strokeStyle = YI_COL.blood; cx.lineWidth = 1.6; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(3, -6.4); cx.quadraticCurveTo(6, -4.4, 8.4, -2.6); cx.stroke();
  cx.globalAlpha = 0.9; cx.fillStyle = YI_COL.bloodHi;
  cx.beginPath(); cx.arc(8.6, -2.4, 1.15, 0, TAU); cx.fill(); cx.globalAlpha = 1;

  /* white shirt, black cravat, gold badge at the breast */
  cx.fillStyle = YI_COL.shirt;
  cx.beginPath(); cx.moveTo(7.2, -3.4); cx.lineTo(3.6, 0); cx.lineTo(7.2, 3.4); cx.closePath(); cx.fill();
  cx.fillStyle = YI_COL.suitDark;
  cx.beginPath(); cx.moveTo(7.2, -1.3); cx.lineTo(3.6, 0); cx.lineTo(7.2, 1.3); cx.closePath(); cx.fill();
  cx.fillStyle = YI_COL.gold;
  cx.beginPath(); cx.arc(1, -3.4, 1.15, 0, TAU); cx.fill();

  /* white gloves — the Oracle's fingers are always clean */
  cx.fillStyle = YI_COL.glove;
  cx.beginPath(); cx.ellipse(8.6, -4.6, 1.6, 1.2, 0.5, 0, TAU); cx.fill();
  cx.beginPath(); cx.ellipse(8.6, 4.6, 1.6, 1.2, -0.5, 0, TAU); cx.fill();
  drawCracks(cx, hpFrac, 11);

  /* the head: black hair, one gold eye out of the shadow, glasses' glare */
  cx.fillStyle = "#0d0d11";
  cx.beginPath(); cx.ellipse(4.4, 0, 3.6, 3.1, 0, 0, TAU); cx.fill();
  const gl = 0.55 + 0.45 * Math.sin(t * 9);
  cx.shadowColor = YI_COL.glass; cx.shadowBlur = 8 * gl;
  cx.fillStyle = YI_COL.glass; cx.globalAlpha = 0.9;
  cx.beginPath(); cx.ellipse(6.4, -1.5, 1.15, 0.72, 0.4, 0, TAU); cx.fill();
  cx.globalAlpha = 0.55;
  cx.beginPath(); cx.ellipse(6.7, 1.4, 0.85, 0.5, -0.35, 0, TAU); cx.fill();
  cx.shadowBlur = 0; cx.globalAlpha = 1;
  cx.restore();

  /* the chained blade — it is not a chain, it is the tail of the vial */
  const swing = P.yiSlashT > 0 ? clamp(1 - P.yiSlashT / YI_SLASH_LIFE, 0, 1) : 0;
  const sweep = P.yiSlashT > 0 ? Math.min(1, swing / YI_SWEEP_SHARE) : 0;
  const armDir = P.yiSlashDir < 0 ? -1 : 1;
  const bladeSweep = armDir * (-0.75 + 1.5 * sweep);
  cx.save();
  cx.translate(px, py);
  const ba = aim + bladeSweep + (P.yiSlashT > 0 ? 0 : 0.22);
  const hand = 7;
  const len = 52 + 10 * Math.sin(Math.PI * sweep);
  const cosA = Math.cos(ba), sinA = Math.sin(ba);
  const hiltX = cosA * hand, hiltY = sinA * hand;
  const tipX = cosA * len, tipY = sinA * len;
  /* blade: dark steel, pale edge, gold guard */
  let edge = tint || yiArcColor(P.yiWeapon);
  if (!P.gunSkin && !(P.runes && Object.keys(P.runes).length)) edge = yiArcColor(P.yiWeapon);
  cx.lineCap = "round";
  cx.strokeStyle = YI_COL.suitDark; cx.lineWidth = 3.9;
  cx.shadowColor = edge; cx.shadowBlur = (P.yiSlashT > 0 || P.yiMarkT > 0) ? 12 : 7;
  cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
  cx.strokeStyle = YI_COL.slash; cx.shadowBlur = 9; cx.lineWidth = 2.1;
  cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2);
  cx.lineTo(tipX - cosA * 1.5, tipY - sinA * 1.5); cx.stroke();
  cx.strokeStyle = YI_COL.arcEdge; cx.shadowBlur = 4; cx.lineWidth = 0.9;
  cx.beginPath(); cx.moveTo(hiltX + cosA * 3, hiltY + sinA * 3);
  cx.lineTo(tipX - cosA * 3, tipY - sinA * 3); cx.stroke();
  cx.shadowBlur = 0; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 2.1;
  const perpX = Math.cos(ba + Math.PI / 2) * 4.4, perpY = Math.sin(ba + Math.PI / 2) * 4.4;
  cx.beginPath(); cx.moveTo(hiltX - perpX, hiltY - perpY); cx.lineTo(hiltX + perpX, hiltY + perpY); cx.stroke();
  cx.restore();

  /* the swing's crescents */
  const reach = P.yiSlashReach || YI_REACH_BASE;
  const dir = P.yiSlashDir < 0 ? -1 : 1;
  if (P.yiSlashT > 0) {
    if (P.yiSlashLanes && P.yiSlashLanes.length) {
      for (const L of P.yiSlashLanes) {
        const k = clamp(1 - (P.yiSlashT - (L.delay || 0)) / YI_SLASH_LIFE, 0, 1);
        drawYiSlashArc(px + (L.dx || 0), py + (L.dy || 0), L.ang, reach, k,
          L.alpha == null ? 1 : L.alpha, L.dir == null ? dir : L.dir, L.scale || 1, L.weapon, !!L.cheap);
      }
    } else {
      const k = clamp(1 - P.yiSlashT / YI_SLASH_LIFE, 0, 1);
      drawYiSlashArc(px, py, P.yiSlashAng - 0.18, reach, k, 1, dir, 1, P.yiWeapon);
      drawYiSlashArc(px, py, P.yiSlashAng + 0.18, reach, Math.max(0, k - 0.06), 0.7, dir, 1, P.yiWeapon);
    }
  }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}
