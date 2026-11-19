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
const YI_WEAPON_WHIP = 7;         // Lash — ripping flesh to strips with a whip
const YI_WEAPON_SCYTHE = 8;       // Slash — lacerating through space with a scythe

const YI_WEAPONS = [
  "HATCHET", "STILETTO", "BASTARD SWORD", "RAPIER", "HAMMER",
  "GREATSWORD", "LANCE", "WHIP", "SCYTHE",
];
const YI_WEAPON_BLUNT = [YI_WEAPON_HATCHET, YI_WEAPON_HAMMER];
const YI_WEAPON_PIERCE = [YI_WEAPON_STILETTO, YI_WEAPON_RAPIER, YI_WEAPON_LANCE];
const YI_WEAPON_SLASH = [YI_WEAPON_BASTARD, YI_WEAPON_GREATSWORD, YI_WEAPON_SCYTHE];
/* the whip is its own animal: it is not swung, it is thrown — a wide overhead lash */
const YI_WEAPON_LASH = [YI_WEAPON_WHIP];

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

/* a rail of light thrown by a piercing weapon — a straight lance out from the arm on the strike.
   kind: 'thrust' style — white hot core, colour to the sides, a punched tail behind it. */
function drawYiStabFx(px, py, ang, reach, k, weapon) {
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  /* three breaths: windup has almost nothing, the strike is the full beam, the afterburner fades it */
  const tip = reach + 22;
  const prog = Math.pow(clamp(k, 0, 1), 1.25);
  const fade = k < 0.22 ? k / 0.22 : 1 - Math.max(0, (k - 0.55)) * 1.7;
  if (fade <= 0.02) return;
  cx.save();
  cx.translate(px, py);
  cx.rotate(ang);
  cx.lineCap = "round";
  /* the colour bloom */
  cx.globalAlpha = fade * 0.38;
  cx.strokeStyle = col; cx.shadowColor = col; cx.shadowBlur = 24;
  cx.lineWidth = 7.5;
  cx.beginPath(); cx.moveTo(-14, 0); cx.lineTo(tip * (0.35 + 0.65 * prog), 0); cx.stroke();
  /* a hot core */
  cx.globalAlpha = fade * 0.95;
  cx.strokeStyle = "#ffffff"; cx.shadowBlur = 12; cx.lineWidth = 2.4;
  cx.beginPath(); cx.moveTo(-8, 0); cx.lineTo(tip * (0.5 + 0.5 * prog), 0); cx.stroke();
  /* the punched tail — short wedges behind the beam that shrink with the strike */
  cx.shadowBlur = 0;
  cx.strokeStyle = colTail;
  cx.globalAlpha = fade * 0.72;
  const tailLen = 26 * (1 - prog * 0.6);
  for (let i = -1; i <= 1; i++) {
    if (i === 0) continue;
    cx.lineWidth = Math.abs(i) === 1 ? 3.4 : 1.4;
    cx.beginPath();
    cx.moveTo(-(12 + tailLen * 0.55), i * 3.4);
    cx.lineTo(-(4 + tailLen * 0.3), i * 1.2);
    cx.stroke();
  }
  /* the tip flare at the strike moment */
  if (prog > 0.42 && prog < 0.92) {
    const f = 1 - Math.abs(prog - 0.68) * 2.6;
    if (f > 0) {
      cx.globalAlpha = fade * f * 0.85;
      cx.fillStyle = "#ffffff"; cx.shadowColor = "#ffffff"; cx.shadowBlur = 16;
      cx.beginPath(); cx.ellipse(tip * (0.5 + 0.5 * prog), 0, 9 * f, 4.6 * f, 0, 0, TAU); cx.fill();
    }
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* a slam burst raised by a crushing weapon — a shockwave ring and radiating spokes
   at the far point of the blow */
function drawYiSlamFx(px, py, ang, reach, k, weapon) {
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  /* the burst appears in the first half of the strike and collapses by the end */
  const appear = k < 0.24 ? k / 0.24 : 1 - Math.max(0, k - 0.52) * 1.75;
  if (appear <= 0.02) return;
  const grow = 8 + (1 - Math.abs(k - 0.22) * 1.6) * 16;
  const cxP = px + Math.cos(ang) * reach * 0.78;
  const cyP = py + Math.sin(ang) * reach * 0.78;
  cx.save();
  cx.translate(cxP, cyP);
  cx.lineCap = "round";
  /* the shockwave ring */
  cx.shadowColor = col; cx.shadowBlur = 14;
  cx.globalAlpha = appear * 0.85;
  cx.strokeStyle = col; cx.lineWidth = 4.4;
  cx.beginPath(); cx.arc(0, 0, grow, 0, TAU); cx.stroke();
  cx.globalAlpha = appear * 0.95;
  cx.strokeStyle = "#ffffff"; cx.shadowBlur = 6; cx.lineWidth = 1.6;
  cx.beginPath(); cx.arc(0, 0, grow * 0.88, 0, TAU); cx.stroke();
  /* radiating spokes — six cracks fly outwards */
  cx.shadowBlur = 0;
  cx.strokeStyle = colTail;
  for (let i = 0; i < 7; i++) {
    const a = ang + (i / 7 - 0.5) * 1.8;
    const inner = grow * 0.75, outer = grow * (1.35 + (i % 2) * 0.35);
    cx.globalAlpha = appear * (0.72 + (i % 2) * 0.25);
    cx.lineWidth = i % 2 ? 1.1 : 2.3;
    cx.beginPath();
    cx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    cx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    cx.stroke();
  }
  cx.globalAlpha = appear * 0.6;
  cx.fillStyle = "#fff";
  cx.beginPath(); cx.arc(0, 0, grow * 0.42, 0, TAU); cx.fill();
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* the lash — the chain's own path thrown past its barbed head as a thread of light.
   It reads as length, not as a cut: the whole chain is in the strike. */
function drawYiLashFx(P, px, py, ang, reach, k, weapon, dir) {
  const col = yiArcColor(weapon);
  const colTail = yiArcTail(weapon);
  const d = dir < 0 ? -1 : 1;
  /* the crack: nothing on the windup, full at the throw, a long bleeding afterimage */
  const appear = k < 0.16 ? k / 0.16 : 1 - Math.max(0, k - 0.48) * 1.65;
  if (appear <= 0.02) return;
  const pts = P && P.yiWhipPts;
  cx.save();
  cx.translate(px, py);
  cx.lineCap = "round";
  if (pts && pts.length > 2) {
    const head = pts[pts.length - 1];
    const ha = P.yiWhipAng || ang;
    const ux = Math.cos(ha), uy = Math.sin(ha);
    /* the smear is the orbit of the chain's head — it starts where the head is and trails behind,
       so it can never float free of the iron */
    const R = Math.max(10, Math.hypot(head[0], head[1]));
    const aHead = Math.atan2(head[1], head[0]);
    const span = (0.62 + 0.62 * Math.min(1, k * 1.4));
    const a0 = aHead - d * span;
    const lo = Math.min(a0, aHead), hi = Math.max(a0, aHead);
    const arc = (from, style, width, alpha, blur) => {
      cx.globalAlpha = appear * alpha;
      cx.strokeStyle = style; cx.shadowColor = style; cx.shadowBlur = blur; cx.lineWidth = width;
      cx.beginPath(); cx.arc(0, 0, R, lo + (hi - lo) * from, hi); cx.stroke();
    };
    arc(0.34, colTail, 6, 0.05, 13);
    arc(0.5, colTail, 2.6, 0.10, 10);
    arc(0.58, "#0b0b11", 1.2, 0.26, 0);
    arc(0.6, col, 1.1, 0.9, 10);
    arc(0.74, "#ffffff", 0.42, 0.95, 5);
    /* the head itself cracks past the tip, along the chain's own line */
    const over = 12 + 34 * Math.min(1, k * 1.5);
    /* a short streak off the barbs */
    cx.globalAlpha = appear * 0.85;
    cx.strokeStyle = "#ffffff"; cx.shadowColor = col; cx.shadowBlur = 12; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(head[0] + ux * 13, head[1] + uy * 13);
    cx.lineTo(head[0] + ux * (13 + over * 0.62), head[1] + uy * (13 + over * 0.62)); cx.stroke();
    /* the point flash, then gone */
    if (k > 0.28 && k < 0.96) {
      const f = 1 - Math.abs(k - 0.56) * 2.3;
      if (f > 0) {
        const tx = head[0] + ux * (13 + over * 0.55), ty = head[1] + uy * (13 + over * 0.55);
        const vx2 = -uy, vy2 = ux;
        cx.globalAlpha = appear * f * 0.95;
        cx.shadowColor = "#ffffff"; cx.shadowBlur = 20;
        cx.fillStyle = "#ffffff";
        cx.beginPath();
        cx.moveTo(tx + ux * 16 * f, ty + uy * 16 * f);
        cx.lineTo(tx + vx2 * 5.2 * f, ty + vy2 * 5.2 * f);
        cx.lineTo(tx - ux * 3.4 * f, ty - uy * 3.4 * f);
        cx.lineTo(tx - vx2 * 5.2 * f, ty - vy2 * 5.2 * f);
        cx.closePath(); cx.fill();
        /* a few sparks thrown off the point */
        cx.shadowBlur = 0; cx.fillStyle = col;
        for (let s = 0; s < 3; s++) {
          const sa = ha + (s - 1) * 0.5;
          cx.globalAlpha = appear * f * 0.6;
          cx.beginPath();
          cx.arc(tx + Math.cos(sa) * (12 + s * 5) * f, ty + Math.sin(sa) * (12 + s * 5) * f,
            1.6 * f, 0, TAU);
          cx.fill();
        }
      }
    }
  } else {
    /* no chain path this frame — a thin straight whip-line instead */
    const headA = ang + d * (-0.55 + 1.45 * Math.min(1, Math.min(1, k / YI_SWEEP_SHARE) * 1.1));
    cx.globalAlpha = appear * 0.5;
    cx.strokeStyle = colTail; cx.shadowColor = colTail; cx.shadowBlur = 16; cx.lineWidth = 8;
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(Math.cos(headA) * reach * 0.9, Math.sin(headA) * reach * 0.9); cx.stroke();
    cx.globalAlpha = appear * 0.9;
    cx.strokeStyle = col; cx.shadowBlur = 10; cx.lineWidth = 2.2;
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(Math.cos(headA) * reach * 0.95, Math.sin(headA) * reach * 0.95); cx.stroke();
  }
  cx.restore();
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* the marked horror, seen by its own Yi Sang only — the flower of the Index, six burning petals around a blue heart */
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

  /* the Vial congeals — one of nine weapons this swing answers the Prescript with */
  const swing = P.yiSlashT > 0 ? clamp(1 - P.yiSlashT / YI_SLASH_LIFE, 0, 1) : 0;
  const sweep = P.yiSlashT > 0 ? Math.min(1, swing / YI_SWEEP_SHARE) : 0;
  const armDir = P.yiSlashDir < 0 ? -1 : 1;
  const bladeSweep = armDir * (-0.75 + 1.5 * sweep);
  const weapon = P.yiWeapon == null ? YI_WEAPON_BASTARD : P.yiWeapon;
  const isPierce = YI_WEAPON_PIERCE.indexOf(weapon) >= 0;
  const isSlash = YI_WEAPON_SLASH.indexOf(weapon) >= 0;
  const isBlunt = YI_WEAPON_BLUNT.indexOf(weapon) >= 0;
  const isLash = YI_WEAPON_LASH.indexOf(weapon) >= 0;
  /* idle: the weapon is held low, whatever it is — family poses only exist while swinging */
  const swinging = P.yiSlashT > 0;
  const active = swinging ? 1 : 0;
  /* pierce weapons thrust straight forward — no arc of the arm */
  const armExt = isPierce ? Math.sin(Math.PI * Math.min(1, sweep * 1.02)) * 7 : 0;
  /* blunt weapons crash down from above — raised, then swung through */
  const bluntSweep = (isBlunt ? (-1.42 + 2.08 * Math.min(1, sweep * 1.12)) : bladeSweep) * active;
  /* the lash is a short throw of the arm; the chain does the travelling */
  const lashSweep = (isLash ? (-0.55 + 1.45 * Math.min(1, sweep * 1.1)) : bladeSweep) * active;
  const arcSweep = bladeSweep * active;
  cx.save();
  cx.translate(px, py);
  if (isPierce) cx.translate(Math.cos(aim) * armExt, Math.sin(aim) * armExt);
  const ba = isPierce
    ? aim + (swinging ? 0 : 0.06)
    : aim + armDir * (isLash ? lashSweep : isBlunt ? bluntSweep : arcSweep) + (swinging ? 0 : 0.22);
  const cosA = Math.cos(ba), sinA = Math.sin(ba);
  const hand = 7;
  /* each weapon carries its own length — a rapier is long and thin, a hammer is beastly */
  const len = weapon === YI_WEAPON_RAPIER ? 88
            : weapon === YI_WEAPON_LANCE ? 86
            : weapon === YI_WEAPON_HAMMER ? 44
            : weapon === YI_WEAPON_SCYTHE ? 74
            : weapon === YI_WEAPON_HATCHET ? 44
            : weapon === YI_WEAPON_WHIP ? 86
            : weapon === YI_WEAPON_GREATSWORD ? 64
            : weapon === YI_WEAPON_STILETTO ? 52
            : 54 + 12 * Math.sin(Math.PI * sweep);
  const hiltX = cosA * hand, hiltY = sinA * hand;
  const tipX = cosA * len, tipY = sinA * len;
  let edge = tint || yiArcColor(weapon);
  if (!P.gunSkin && !(P.runes && Object.keys(P.runes).length)) edge = yiArcColor(weapon);
  cx.lineCap = "round";
  cx.shadowColor = edge; cx.shadowBlur = (P.yiSlashT > 0 || P.yiMarkT > 0) ? 12 : 7;
  /* dim back, pale face, white hot edge — organs in three tones */
  cx.strokeStyle = YI_COL.suitDark; cx.lineWidth = 3.9;
  /* weapon-specific silhouettes — they read from across the arena */
  if (weapon === YI_WEAPON_HATCHET) {
    /* short haft, and the wedge head — with an eye in it */
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(cosA * (len * 0.62), sinA * (len * 0.62)); cx.stroke();
    cx.strokeStyle = "#2a2a30"; cx.lineWidth = 4.5;
    cx.beginPath(); cx.moveTo(cosA * (len * 0.58), sinA * (len * 0.58)); cx.lineTo(cosA * len, sinA * len); cx.stroke();
    /* the axe head */
    const ax = cosA * len, ay = sinA * len, perpA = ba + Math.PI / 2;
    const px = Math.cos(perpA), py = Math.sin(perpA);
    cx.fillStyle = "#3c3c44"; cx.strokeStyle = "#3c3c44"; cx.lineWidth = 1.4;
    cx.beginPath();
    cx.moveTo(ax - cosA * 8 - px * 5, ay - sinA * 8 - py * 5);
    cx.lineTo(ax - cosA * 8 + px * 5, ay - sinA * 8 + py * 5);
    cx.lineTo(ax - cosA * 2 + px * 5, ay - sinA * 2 + py * 5);
    cx.lineTo(ax - cosA * 2 - px * 5, ay - sinA * 2 - py * 5);
    cx.closePath(); cx.fill();
    cx.stroke();
    /* pale edge */
    cx.strokeStyle = YI_COL.slash; cx.shadowBlur = 6; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(ax - cosA * 8 + px * 4.6, ay - sinA * 8 + py * 4.6);
    cx.lineTo(ax - cosA * 2.2 + px * 2, ay - sinA * 2.2 + py * 2); cx.stroke();
  } else if (weapon === YI_WEAPON_STILETTO) {
    /* a needle — thin shadow, thinner body, barely there edge */
    cx.strokeStyle = "#14141a"; cx.lineWidth = 2.4;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#cfd6dd"; cx.shadowBlur = 10; cx.lineWidth = 1.3;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#ffffff"; cx.shadowBlur = 4; cx.lineWidth = 0.6;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 3, hiltY + sinA * 3); cx.lineTo(tipX - cosA * 1, tipY - sinA * 1); cx.stroke();
  } else if (weapon === YI_WEAPON_BASTARD) {
    /* classic longe — dark fuller, pale face, white bite */
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = YI_COL.slash; cx.shadowBlur = 9; cx.lineWidth = 2.2;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2); cx.lineTo(tipX - cosA * 1.5, tipY - sinA * 1.5); cx.stroke();
    cx.strokeStyle = YI_COL.arcEdge; cx.shadowBlur = 5; cx.lineWidth = 0.95;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 3, hiltY + sinA * 3); cx.lineTo(tipX - cosA * 3, tipY - sinA * 3); cx.stroke();
    /* wrap at grip */
    cx.strokeStyle = "#2b2b33"; cx.shadowBlur = 0; cx.lineWidth = 4.2;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(hiltX + cosA * 6, hiltY + sinA * 6); cx.stroke();
  } else if (weapon === YI_WEAPON_RAPIER) {
    /* the thin needle — a smoking absinthe sliver, silver light on a steel thread */
    cx.strokeStyle = "#0e0e13"; cx.lineWidth = 1.7;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#e6ecf2"; cx.shadowBlur = 12; cx.lineWidth = 1.1;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 2, hiltY + sinA * 2); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#ffffff"; cx.shadowBlur = 4; cx.lineWidth = 0.45;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 4, hiltY + sinA * 4); cx.lineTo(tipX - cosA * 2, tipY - sinA * 2); cx.stroke();
    /* king-guard: a ring at the hilt */
    cx.shadowBlur = 0; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.4;
    const perpA = ba + Math.PI / 2;
    cx.beginPath(); cx.ellipse(hiltX + cosA * 2, hiltY + sinA * 2, 4.6, 2.6, perpA, 0, TAU); cx.stroke();
  } else if (weapon === YI_WEAPON_HAMMER) {
    /* the skull-breaker — handle wide, head wider, an iron meat-grinder of an idol */
    cx.strokeStyle = "#2b2b33"; cx.lineWidth = 4.4;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(cosA * (len * 0.62), sinA * (len * 0.62)); cx.stroke();
    const hx = cosA * len, hy = sinA * len, perpA = ba + Math.PI / 2;
    const px = Math.cos(perpA) * 10, py = Math.sin(perpA) * 10;
    cx.fillStyle = "#3c3c44"; cx.strokeStyle = "#3c3c44"; cx.lineWidth = 1.6;
    /* the barrel of the hammer, drawn foreshortened as two stacked blocks */
    cx.beginPath();
    cx.moveTo(hx - cosA * 3 - px, hy - sinA * 3 - py);
    cx.lineTo(hx - cosA * 3 + px, hy - sinA * 3 + py);
    cx.lineTo(hx - cosA * 14 + px, hy - sinA * 14 + py);
    cx.lineTo(hx - cosA * 14 - px, hy - sinA * 14 - py);
    cx.closePath(); cx.fill();
    cx.stroke();
    /* glowing spike on the hammer face */
    cx.shadowBlur = 9; cx.fillStyle = "#873e3e";
    cx.beginPath(); cx.arc(hx - cosA * 4, hy - sinA * 4, 2.3, 0, TAU); cx.fill();
    cx.shadowBlur = 0; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.4;
    cx.beginPath(); cx.moveTo(cosA * (len * 0.52), sinA * (len * 0.52)); cx.lineTo(cosA * (len * 0.58), sinA * (len * 0.58)); cx.stroke();
  } else if (weapon === YI_WEAPON_GREATSWORD) {
    /* the flat wall — big flat face, thick body, massive brow */
    cx.strokeStyle = "#14141a"; cx.lineWidth = 5;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
    cx.strokeStyle = "#dadee4"; cx.shadowBlur = 13; cx.lineWidth = 3.4;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 3, hiltY + sinA * 3); cx.lineTo(tipX - cosA * 2, tipY - sinA * 2); cx.stroke();
    cx.strokeStyle = YI_COL.arcEdge; cx.shadowBlur = 6; cx.lineWidth = 1.3;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 5, hiltY + sinA * 5); cx.lineTo(tipX - cosA * 4, tipY - sinA * 4); cx.stroke();
    /* a mark down the fuller */
    cx.strokeStyle = "#5a5a62"; cx.shadowBlur = 0; cx.lineWidth = 1.1;
    cx.beginPath(); cx.moveTo(hiltX + cosA * (len * 0.32), hiltY + sinA * (len * 0.32)); cx.lineTo(hiltX + cosA * (len * 0.66), hiltY + sinA * (len * 0.66)); cx.stroke();
  } else if (weapon === YI_WEAPON_LANCE) {
    /* the bullhorn — the great boring cone widens to the end, not a point.
       Faceted, iron-dark, with a luminous slit down the centre. */
    const perpA = ba + Math.PI / 2;
    const px = Math.cos(perpA), py = Math.sin(perpA);
    /* the shaft — dark rod */
    cx.strokeStyle = "#1a1a22"; cx.lineWidth = 4;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(cosA * (len * 0.74), sinA * (len * 0.74)); cx.stroke();
    /* the cone: widest at the striking face, narrowing to the shaft join */
    const coneBase = len * 0.70;
    const coneTip = len + 3;
    /* outer dark facet */
    cx.fillStyle = "#181820"; cx.strokeStyle = "#2b2b33"; cx.lineWidth = 1.3;
    cx.beginPath();
    cx.moveTo(cosA * coneBase - px * 2.6, sinA * coneBase - py * 2.6);
    cx.lineTo(cosA * coneBase + px * 2.6, sinA * coneBase + py * 2.6);
    cx.lineTo(cosA * coneTip + px * 10.4, sinA * coneTip + py * 10.4);
    cx.lineTo(cosA * coneTip - px * 10.4, sinA * coneTip - py * 10.4);
    cx.closePath(); cx.fill();
    cx.stroke();
    /* faceted plates on the cone face */
    cx.fillStyle = "#22222c";
    cx.beginPath();
    cx.moveTo(cosA * (coneBase + 4) - px * 0.7, sinA * (coneBase + 4) - py * 0.7);
    cx.lineTo(cosA * (coneBase + 4) + px * 0.7, sinA * (coneBase + 4) + py * 0.7);
    cx.lineTo(cosA * coneTip + px * 7.2, sinA * coneTip + py * 7.2);
    cx.lineTo(cosA * coneTip - px * 7.2, sinA * coneTip - py * 7.2);
    cx.closePath(); cx.fill();
    /* the luminous slit down the centre — the part that bores */
    cx.shadowColor = edge; cx.shadowBlur = 16;
    cx.strokeStyle = "#d8e8f0"; cx.lineWidth = 1.8;
    cx.beginPath(); cx.moveTo(cosA * (coneBase + 1), sinA * (coneBase + 1));
    cx.lineTo(cosA * (coneTip - 1), sinA * (coneTip - 1)); cx.stroke();
    cx.fillStyle = "#e8f4f8";
    cx.beginPath(); cx.ellipse(cosA * (coneTip - 1.2), sinA * (coneTip - 1.2), 3.6, 2.1, perpA, 0, TAU); cx.fill();
    cx.shadowBlur = 0;
    /* gold ring at the shaft-face junction */
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.7;
    cx.beginPath(); cx.ellipse(cosA * coneBase, sinA * coneBase, 3.2, 2.1, perpA, 0, TAU); cx.stroke();
  } else if (weapon === YI_WEAPON_WHIP) {
    /* THE LASH — eight straight rods of black iron joined by four-point spike collars,
       ending in a broad barbed arrowhead. Gold ring where it leaves the glove.
       It does not hang from the hand: it is thrown, and it cracks at the far end. */
    const segN = 8;
    const step = len / segN;
    /* while the lash is out, an S travels down the chain — the tip is always a beat behind */
    const lashK = P.yiSlashT > 0 ? Math.min(1, sweep * 1.25) : 0;
    const rest = P.yiSlashT > 0 ? 0 : 1;
    /* an S runs down the chain as it is thrown, then dies out at full extension */
    const whipK = P.yiSlashT > 0 ? Math.sin(Math.PI * Math.min(1, swing * 1.15)) : 0;
    const joints = [];
    let jx = hiltX, jy = hiltY;
    let ja = ba;
    for (let i = 0; i <= segN; i++) {
      const f = i / segN;
      joints.push([jx, jy]);
      /* a slow wave so the chain breathes at rest, and a hard curl when it is thrown */
      const wave = Math.sin(t * 5.4 - f * 4.4) * (0.05 + rest * 0.03);
      const curl = (f - 0.4) * 0.42 * (1 - lashK) * (1 + rest * 0.55);
      ja += wave + curl - Math.cos(f * 4.6 + 0.6) * 0.34 * whipK;
      jx += Math.cos(ja) * step;
      jy += Math.sin(ja) * step;
    }
    /* the rods */
    cx.shadowColor = edge; cx.shadowBlur = 6; cx.lineCap = "round";
    for (let i = 0; i < segN; i++) {
      const a0 = joints[i], a1 = joints[i + 1];
      cx.strokeStyle = "#0e0e13"; cx.lineWidth = 3.1;
      cx.beginPath(); cx.moveTo(a0[0], a0[1]); cx.lineTo(a1[0], a1[1]); cx.stroke();
      cx.strokeStyle = "#33333e"; cx.lineWidth = 1.1;
      cx.beginPath(); cx.moveTo(a0[0] + Math.cos(ja) * 0.6, a0[1] + Math.sin(ja) * 0.6);
      cx.lineTo(a1[0], a1[1]); cx.stroke();
    }
    /* the four-point spike collars — one at every joint, largest nearest the tip */
    cx.shadowBlur = 4;
    for (let i = 1; i < segN; i++) {
      const j = joints[i];
      const dirA = Math.atan2(joints[i + 1][1] - j[1], joints[i + 1][0] - j[0]);
      const ux = Math.cos(dirA), uy = Math.sin(dirA);
      const vx = -uy, vy = ux;
      const s = 3.1 + i * 0.22;
      cx.fillStyle = "#101016"; cx.strokeStyle = "#454550"; cx.lineWidth = 0.75;
      cx.beginPath();
      cx.moveTo(j[0] + ux * s * 1.35, j[1] + uy * s * 1.35);
      cx.lineTo(j[0] + vx * s * 0.62, j[1] + vy * s * 0.62);
      cx.lineTo(j[0] - ux * s * 1.35, j[1] - uy * s * 1.35);
      cx.lineTo(j[0] - vx * s * 0.62, j[1] - vy * s * 0.62);
      cx.closePath(); cx.fill(); cx.stroke();
      /* the collar's four barbs, biting out of the corners */
      cx.strokeStyle = "#2b2b33"; cx.lineWidth = 1.1;
      cx.beginPath();
      cx.moveTo(j[0] + vx * s * 1.55, j[1] + vy * s * 1.55);
      cx.lineTo(j[0] + vx * s * 0.5 + ux * s * 0.5, j[1] + vy * s * 0.5 + uy * s * 0.5);
      cx.moveTo(j[0] - vx * s * 1.55, j[1] - vy * s * 1.55);
      cx.lineTo(j[0] - vx * s * 0.5 + ux * s * 0.5, j[1] - vy * s * 0.5 + uy * s * 0.5);
      cx.stroke();
    }
    /* the barbed arrowhead at the far end */
    const last = joints[segN], prev = joints[segN - 1];
    const ha = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    /* the FX reads the chain's own path, so the motion trail never lies about where it is */
    P.yiWhipPts = joints;
    P.yiWhipAng = ha;
    const hux = Math.cos(ha), huy = Math.sin(ha);
    const hvx = -huy, hvy = hux;
    cx.shadowColor = edge; cx.shadowBlur = 8;
    cx.fillStyle = "#101016"; cx.strokeStyle = "#4a4a56"; cx.lineWidth = 0.9;
    cx.beginPath();
    cx.moveTo(last[0] + hux * 14, last[1] + huy * 14);
    cx.lineTo(last[0] + hvx * 3.4, last[1] + hvy * 3.4);
    cx.lineTo(last[0] - hux * 3.2, last[1] - huy * 3.2);
    cx.lineTo(last[0] - hvx * 3.4, last[1] - hvy * 3.4);
    cx.closePath(); cx.fill(); cx.stroke();
    /* swept wings behind the heads */
    cx.fillStyle = "#14141a";
    for (const side of [1, -1]) {
      cx.beginPath();
      cx.moveTo(last[0] + hvx * side * 3.2, last[1] + hvy * side * 3.2);
      cx.lineTo(last[0] + hux * 3.2 + hvx * side * 8.4, last[1] + huy * 3.2 + hvy * side * 8.4);
      cx.lineTo(last[0] + hux * 7.6 + hvx * side * 3.4, last[1] + huy * 7.6 + hvy * side * 3.4);
      cx.closePath(); cx.fill();
    }
    /* the pale edge of the point */
    cx.strokeStyle = edge; cx.lineWidth = 1.1; cx.shadowBlur = 7;
    cx.beginPath(); cx.moveTo(last[0] + hux * 4, last[1] + huy * 4);
    cx.lineTo(last[0] + hux * 13.4, last[1] + huy * 13.4); cx.stroke();
    cx.shadowBlur = 0;
    /* the gold ring where it leaves the glove */
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.5;
    cx.beginPath(); cx.ellipse(hiltX, hiltY, 4.2, 2.2, ba + Math.PI / 2, 0, TAU); cx.stroke();
  } else if (weapon === YI_WEAPON_SCYTHE) {
    /* the long haft with the great sweeping blade — crescent of a god */
    cx.strokeStyle = "#14141a"; cx.lineWidth = 3.4;
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(cosA * (len * 0.78), sinA * (len * 0.78)); cx.stroke();
    cx.strokeStyle = "#2a2a30"; cx.lineWidth = 1.8;
    cx.beginPath(); cx.moveTo(hiltX + cosA * 4, hiltY + sinA * 4); cx.lineTo(cosA * (len * 0.78), sinA * (len * 0.78)); cx.stroke();
    /* the scythe blade — a crescent, drawn from the haft outwards */
    const sc = len;
    const perpA = ba + Math.PI / 2;
    const perpX = Math.cos(perpA), perpY = Math.sin(perpA);
    const bladeLen = 42;
    cx.shadowColor = edge; cx.shadowBlur = 15;
    // dark back
    cx.strokeStyle = "#14141a"; cx.lineWidth = 4.2;
    cx.beginPath();
    cx.moveTo(cosA * (len * 0.76), sinA * (len * 0.76));
    cx.quadraticCurveTo(cosA * (sc * 0.96) - perpX * (bladeLen * 0.55), sinA * (sc * 0.96) - perpY * (bladeLen * 0.55), cosA * sc - perpX * bladeLen, sinA * sc - perpY * bladeLen);
    cx.stroke();
    // pale face
    cx.strokeStyle = "#e0e4ec"; cx.lineWidth = 1.9;
    cx.beginPath();
    cx.moveTo(cosA * (len * 0.78) + 1, sinA * (len * 0.78) + 1);
    cx.quadraticCurveTo(cosA * (sc * 0.97) - perpX * (bladeLen * 0.55) + 1, sinA * (sc * 0.97) - perpY * (bladeLen * 0.55) + 1, cosA * sc - perpX * bladeLen + 1.4, sinA * sc - perpY * bladeLen + 1.4);
    cx.stroke();
    /* white edge — the part that bites */
    cx.strokeStyle = "#ffffff"; cx.lineWidth = 0.85;
    cx.beginPath();
    cx.moveTo(cosA * (len * 0.80) + 1.4, sinA * (len * 0.80) + 1.4);
    cx.quadraticCurveTo(cosA * (sc * 0.97) - perpX * (bladeLen * 0.45) + 1.5, sinA * (sc * 0.97) - perpY * (bladeLen * 0.45) + 1.5, cosA * sc - perpX * (bladeLen - 1) + 1.2, sinA * sc - perpY * (bladeLen - 1) + 1.2);
    cx.stroke();
    cx.shadowBlur = 0;
    /* gold spring at the pivot */
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.8;
    cx.beginPath(); cx.ellipse(cosA * (len * 0.74), sinA * (len * 0.74), 2.6, 1.6, perpA, 0, TAU); cx.stroke();
  } else {
    /* fallback — weapon 0 == HATCHET, no other weapon is meant to hit this path */
    cx.beginPath(); cx.moveTo(hiltX, hiltY); cx.lineTo(tipX, tipY); cx.stroke();
  }
  /* gold guard — always */
  cx.strokeStyle = YI_COL.gold; cx.lineWidth = 2.1; cx.shadowBlur = 0;
  const perpA2 = ba + Math.PI / 2;
  const perpX2 = Math.cos(perpA2) * 4.4, perpY2 = Math.sin(perpA2) * 4.4;
  cx.beginPath(); cx.moveTo(hiltX - perpX2, hiltY - perpY2); cx.lineTo(hiltX + perpX2, hiltY + perpY2); cx.stroke();
  cx.restore();

  /* the swing's FX — slash : crescents ; pierce : a stabbing rail ; blunt : a slam burst ;
     lash : a long whipping thread of light with the chain's collars riding it */
  const reach = P.yiSlashReach || YI_REACH_BASE;
  const weaponFx = P.yiWeapon == null ? YI_WEAPON_BASTARD : P.yiWeapon;
  const isPierceFx = YI_WEAPON_PIERCE.indexOf(weaponFx) >= 0;
  const isBluntFx = YI_WEAPON_BLUNT.indexOf(weaponFx) >= 0;
  const isLashFx = YI_WEAPON_LASH.indexOf(weaponFx) >= 0;
  const isSlashFx = YI_WEAPON_SLASH.indexOf(weaponFx) >= 0;
  const dir = P.yiSlashDir < 0 ? -1 : 1;
  if (P.yiSlashT > 0) {
    if (isPierceFx) {
      const k = clamp(1 - P.yiSlashT / YI_SLASH_LIFE, 0, 1);
      drawYiStabFx(px, py, P.yiSlashAng, reach, k, weaponFx);
    } else if (isLashFx) {
      const k = clamp(1 - P.yiSlashT / YI_SLASH_LIFE, 0, 1);
      drawYiLashFx(P, px, py, P.yiSlashAng, reach, k, weaponFx, dir);
    } else if (isBluntFx) {
      const k = clamp(1 - P.yiSlashT / YI_SLASH_LIFE, 0, 1);
      drawYiSlamFx(px, py, P.yiSlashAng, reach, k, weaponFx);
    } else if (P.yiSlashLanes && P.yiSlashLanes.length) {
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
