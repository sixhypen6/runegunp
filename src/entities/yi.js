/* =========================================================
   RUNEGUN · THE INDEX NURSEFATHER (Yi Sang) — the Prescript
   A pure melee warden: a spider in a black suit, one gold eye,
   a chained blade under his sleeve. Every strike decides a
   prescript the Oracle delivered, and the Oracle does not
   take "no" for an answer.

   THE PRESCRIPT — each Prescript the Oracle marks the
   strongest horror on the board: THE PRESCRIPT'S TARGET.
   That horror takes +10% from The Index (the official mark),
   and the first cut upon it banks Grace of the Prescript. Grace is
   a ladder, not a pool: PRESCRIPT [DEVICE] I caps it at three,
   the next Device raises the ceiling to six, and Device III
   repeats until PROCURATION [HERMES] reaches nine — the moment
   it does, the last three steps of Grace are paid at once.
   Grace pays +10% damage per three stacks, and the Unlock it
   grants adds a guard (+5/10/15% less damage taken). Fell the
   marked horror and the execution completes: +3 Grace, 20
   Karmic lifted. Let the mark pass with the horror standing and
   the Consequence takes him instead: +20 Karmic (max 100, −0.4%
   damage per stack, −40% at the cap).

   PROCURATION [HERMES] — every struck mark also feeds Hermes.
   It is capped at eight until Unlock II, then nine; the gain per
   Prescript is (Unlock stage + 2). At nine the meter completes and
   the next cut comes down as a guaranteed critical that clears
   twenty Karmic.

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
const YI_MARK_CD = 9;              // fallback gap between Prescripts (executions write the next sooner)
const YI_MARK_FIRST = 1.6;         // the first mark comes fast — the Oracle does not wait long
const YI_MARK_TIME = 12;           // the mark's window before the Oracle loses interest
const YI_MARK_BONUS = 0.10;        // the marked horror takes +10% from The Index's cuts

/* --- Grace of the Prescript --- */
const YI_GRACE_MAX = 9;
const YI_GRACE_TIER_3 = 3, YI_GRACE_TIER_6 = 6, YI_GRACE_TIER_9 = 9;
const YI_GRACE_TIER_DMG = [0, 0.10, 0.20, 0.30];   // +1 Offense Level per 3 stacks, read as +10% a tier
const YI_UNLOCK_GUARD = [0, 0.05, 0.10, 0.15];     // Unlock I/II/III: Defence Level +1/+2/+3 as damage taken down
const YI_GRACE_FROM_EXECUTION = 3;  // +Grace for falling the marked horror
/* PRESCRIPT [DEVICE] I–III: the ceiling Grace may climb to at Device stage 1/2/3/4 */
const YI_GRACE_CAP = [3, 6, 9, 9];
/* PROCURATION [HERMES] — capped at 8 until Unlock II, nine after */
const YI_PROC_MAX = 9;
const YI_PROC_CAP_LOW = 8;
/* the three Unlocks the Prescript grants at 3 / 6 / 9 Grace — and the line it speaks */
const YI_UNLOCKS = [
  { tier: 1, name: "UNLOCK - I", line: "Wading through a dream, the self nowhere to be found.", kanji: "無我夢中" },
  { tier: 2, name: "UNLOCK - II", line: "Like the Naraka of Avīci and Raurava.", kanji: "阿鼻叫喚" },
  { tier: 3, name: "UNLOCK - III", line: "Severed and torn until even the form is undone.", kanji: "支離滅裂" },
];
const YI_KARMIC_MAX = 100;
const YI_KARMIC_PER_STACK = 0.004;  // each Consequence drags cuts down 0.4% (40% at 100)
const YI_KARMIC_EXECUTE_CLEAR = 20; // exiting a prescript lifts twenty
const YI_KARMIC_MISS = 20;          // a mark that escapes alive adds twenty

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
const YI_HATCHET_POISE = 2;         // official: on hit, gain 2 Poise
const YI_STILETTO_GLOOM_T = 3;
const YI_STILETTO_GLOOM_DPS = 7;
const YI_BASTARD_DMG = 1.05;        // +5% damage
const YI_RAPIER_DMG = 1.05;         // +5% damage
const YI_RAPIER_DEFDOWN = 0.10;     // defence punctured: +10% damage taken per stack
const YI_RAPIER_DEFDOWN_TIME = 3;
const YI_RAPIER_DEFDOWN_MAX = 2;
const YI_HAMMER_DMG = 1.05;         // +5% damage
const YI_HAMMER_STAGGER = 1.1;      // target can't act for this long
const YI_GREATSWORD_DMG = 1.15;     // +15% damage
const YI_LANCE_DMG = 1.15;          // +15% damage
const YI_WHIP_DMG = 1.15;           // +15% damage
const YI_FRAG_DMG = 0.10;           // typed Fragility: +10% from that damage type per stack
const YI_FRAG_TIME = 4;
const YI_FRAG_MAX = 2;
const YI_SCYTHE_DMG = 1.3;          // +30% damage, guaranteed crit
const YI_OFFENSE_DMG = 0.10;        // each Offense Level adds +10% damage
const YI_OFFENSE_MAX = 2;
const YI_OFFENSE_TIME = 3;

/* the vessel's own multiplier — one table, so the arc and the PvP cut agree */
function yiWeaponMul(w) {
  switch (w) {
    case YI_WEAPON_BASTARD:   return YI_BASTARD_DMG;
    case YI_WEAPON_RAPIER:    return YI_RAPIER_DMG;
    case YI_WEAPON_HAMMER:    return YI_HAMMER_DMG;
    case YI_WEAPON_GREATSWORD:return YI_GREATSWORD_DMG;
    case YI_WEAPON_LANCE:     return YI_LANCE_DMG;
    case YI_WEAPON_WHIP:      return YI_WHIP_DMG;
    case YI_WEAPON_SCYTHE:    return YI_SCYTHE_DMG;
    default:                  return 1;
  }
}
/* which Fragility a vessel lays, and which blades drink from it */
function yiWeaponFragType(w) {
  if (w === YI_WEAPON_BASTARD || w === YI_WEAPON_GREATSWORD || w === YI_WEAPON_SCYTHE) return "slash";
  if (w === YI_WEAPON_STILETTO || w === YI_WEAPON_RAPIER || w === YI_WEAPON_LANCE) return "pierce";
  if (w === YI_WEAPON_HATCHET || w === YI_WEAPON_HAMMER || w === YI_WEAPON_WHIP) return "blunt";
  return "";
}

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
  if (p.yiUnlockTier === undefined) p.yiUnlockTier = 0;
  if (p.yiDevice === undefined) p.yiDevice = 1;
  if (p.yiProc === undefined) p.yiProc = 0;
  if (p.yiProcGain === undefined) p.yiProcGain = 0;
  if (p.yiProcReady === undefined) p.yiProcReady = false;
  if (p.yiProcMaxed === undefined) p.yiProcMaxed = false;
  if (p.yiGraceStruck === undefined) p.yiGraceStruck = false;
  if (p.yiDevice4T === undefined) p.yiDevice4T = 0;
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
  p.yiProcGain = 0;                 // the Prescript is new — Hermes starts its count again
  p.yiGraceStruck = false;          // one name pays one Grace — not one per cut
  /* TURN START: the Device is handed down for the Unlock already earned. Until it
     arrives, the old ceiling holds — Grace can never outrun the Prescript. */
  const dev = Math.max(1, Math.min(4, (p.yiUnlockTier || 0) + 1));
  if (dev > (p.yiDevice || 1)) {
    p.yiDevice = dev;
    if (dev >= 4) p.yiDevice4T = YI_MARK_CD;   // Device IV: empty the room before the next
    if (p === localPlayer()) {
      floatText(p.x, p.y - 52, "PRESCRIPT [DEVICE] " + ["I", "II", "III", "IV"][dev - 1], "#7ec0ff", 14);
    }
  }
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
/* Unlock's defence rider — the guard a stage of Grace holds over him */
function yiUnlockGuard(p) {
  if (!p || p.char !== "yi") return 0;
  return YI_UNLOCK_GUARD[yiGraceTier(p)];
}
/* PRESCRIPT [DEVICE]: the ceiling Grace may reach. The Device itself is only
   handed down at the start of a Prescript, exactly like a turn start. Device III
   repeats until PROCURATION [HERMES] reaches nine — and only then does the sixth
   Grace step open into the ninth. */
function yiGraceCap(p) {
  const d = Math.min(4, Math.max(1, p.yiDevice || 1));
  let cap = YI_GRACE_CAP[d - 1];
  if (cap >= 9 && !p.yiProcMaxed) cap = 6;
  return cap;
}
/* Grace is banked through the Device — it can never overrun its ceiling */
function yiAddGrace(p, n) {
  const cap = yiGraceCap(p);
  const was = Math.min(YI_GRACE_MAX, p.yiGrace || 0);
  const g = was >= cap ? was : Math.min(cap, was + n);
  p.yiGrace = g;
  return g - was;
}
/* PROCURATION [HERMES] — eight until Unlock II, then nine */
function yiProcCap(p) {
  return (p.yiUnlockTier || 0) >= 2 ? YI_PROC_MAX : YI_PROC_CAP_LOW;
}
/* Device III repeats until Hermes is full; the moment it is, the Prescript pays the
   last three steps of Grace. If the Device has not caught up yet, the payment waits. */
function yiGrantHermesGrace(p) {
  if (!p.yiProcMaxed) return 0;
  if (yiGraceCap(p) < YI_GRACE_MAX) return 0;
  const gap = YI_GRACE_MAX - Math.min(YI_GRACE_MAX, p.yiGrace || 0);
  return gap > 0 ? yiAddGrace(p, gap) : 0;
}

/* the turn Grace crosses 3 / 6 / 9, the Prescript grants an Unlock and Yi Sang
   speaks its line. One voiceline per tier; the tally re-arms if Grace ever drops. */
let yiUnlockSounds = null;
let yiVoiceTimer = null;
/* the three lines are short files under public/audio — loaded lazily, once */
function yiUnlockVoices() {
  if (yiUnlockSounds || typeof Audio === "undefined") return yiUnlockSounds;
  yiUnlockSounds = [
    new Audio("audio/mugamuchu.wav"),
    new Audio("audio/abikyokan.wav"),
    new Audio("audio/shirimetsuretsu.wav"),
  ];
  for (const a of yiUnlockSounds) a.preload = "auto";
  return yiUnlockSounds;
}
function yiPlayUnlockVoice(tier) {
  try {
    const list = yiUnlockVoices();
    if (!list) return;
    const a = list[tier - 1];
    if (!a) return;
    /* one voice at a time — a second Unlock cuts the first short */
    for (const v of list) {
      if (v === a) continue;
      try { v.pause(); v.currentTime = 0; } catch (e) { /* never loaded */ }
    }
    a.currentTime = 0;
    a.volume = 0.8;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});
  } catch (e) { /* a muted device is no reason to break the turn */ }
}
function yiSayUnlock(u) {
  yiPlayUnlockVoice(u.tier);
  if (typeof document === "undefined" || typeof $ !== "function") return;
  const box = $("yiVoice");
  if (!box) return;
  const tierEl = $("yiVoiceTier"), lineEl = $("yiVoiceLine"), kanjiEl = $("yiVoiceKanji");
  if (tierEl) tierEl.textContent = u.name;
  if (lineEl) lineEl.textContent = u.line;
  if (kanjiEl) kanjiEl.textContent = u.kanji;
  box.className = "on t" + u.tier;
  clearTimeout(yiVoiceTimer);
  yiVoiceTimer = setTimeout(() => { box.className = "t" + u.tier; }, 5200);
}
function yiCheckUnlock(p) {
  const tier = yiGraceTier(p);
  const seen = p.yiUnlockTier || 0;
  if (tier <= seen) {
    if (tier < seen) p.yiUnlockTier = tier;
    return;
  }
  p.yiUnlockTier = tier;
  /* the Unlock's own riders: Defence Level (a guard, applied in hurtPlayer)
     and the combat-end SP heal, read here as a burst of vitality */
  const heal = [0, 5, 10, 15][tier] || 0;
  if (heal > 0 && p.hp > 0 && !(typeof Net !== "undefined" && Net.role === "guest"))
    p.hp = Math.min(p.maxHp, p.hp + heal);
  if (typeof localPlayer === "function" && p !== localPlayer()) return;
  yiSayUnlock(YI_UNLOCKS[tier - 1]);
  if (heal > 0) floatText(p.x, p.y - 40, "+" + heal, "#8ef0a0", 14);
}

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
  yiAddGrace(p, YI_GRACE_FROM_EXECUTION);
  p.yiKarmic = Math.max(0, (p.yiKarmic || 0) - YI_KARMIC_EXECUTE_CLEAR);
  yiClearMark(p);
  p.yiMarkCd = 2.5;                  // the next name is written soon after an execution
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
  const weapDmg = yiWeaponMul(weapon);
  const fragType = yiWeaponFragType(weapon);
  let bite = yiBite(p) * (biteMul || 1) * (1 + bitEm)
    * weapDmg
    * (crit ? critMul : 1);
  /* target is Fragile to a damage type — only that blade class drinks from it */
  if (e.fragT > 0 && e.fragStacks > 0 && fragType && e.fragType === fragType)
    bite *= 1 + YI_FRAG_DMG * e.fragStacks;
  damageEnemy(e, bite, {
    owner: p, x, y, melee: true, critHit: crit,
    knock: (m.knock || 0) * (weapon === YI_WEAPON_HATCHET ? YI_HATCHET_KNOCK : 1) * (forceCrit ? 1.6 : 1),
  });
  /* GUEST: the host settles the ledger; the guest's cut is only a picture */
  if (typeof Net !== "undefined" && Net.role === "guest") return;
  /* every landed cut banks Poise — [On Hit] in his kit — and a critical banks an extra;
     the Oracle counts true strikes, and Yi Sang stacks them like a debt-book */
  if (!e.dead && (p.yiPoise || 0) < YI_POISE_MAX) {
    /* the hatchet's own line: +2 Poise on hit; every other cut banks one */
    const gain = (weapon === YI_WEAPON_HATCHET ? YI_HATCHET_POISE : 1) + (crit ? 1 : 0);
    p.yiPoise = Math.min(YI_POISE_MAX, (p.yiPoise || 0) + gain);
    if (p === localPlayer() && (crit || p.yiPoise >= YI_POISE_MAX))
      floatText(e.x, e.y - e.r - 16, "POISE " + p.yiPoise + "/" + YI_POISE_MAX, "#d9b65c", 13);
  }
  /* the first cut into the mark banks its Grace — one per named horror, not one
     per swing. Further cuts feed Hermes but never the ladder. */
  if (!e.dead && yiIsMarked(p, e)) {
    if (!p.yiGraceStruck && yiAddGrace(p, 1) > 0) {
      p.yiGraceStruck = true;
      if (p === localPlayer())
        floatText(p.x, p.y - 54, "GRACE " + p.yiGrace + "/" + yiGraceCap(p), "#7ec0ff", 12);
    }
    /* PROCURATION [HERMES] — (Unlock stage + 2) may be banked per Prescript */
    const allow = (p.yiUnlockTier || 0) + 2;
    const pcap = yiProcCap(p);
    if (!p.yiProcReady && (p.yiProcGain || 0) < allow && (p.yiProc || 0) < pcap) {
      p.yiProc = Math.min(pcap, (p.yiProc || 0) + 1);
      p.yiProcGain = (p.yiProcGain || 0) + 1;
      /* only a full nine opens Hermes — eight is the ceiling, not a trigger */
      if (p.yiProc >= YI_PROC_MAX) {
        p.yiProcReady = true;
        p.yiProcMaxed = true;        // the ninth step of Grace stays open for good
        /* the Prescript completes: the last three steps of Grace land at once */
        const got = yiGrantHermesGrace(p);
        if (p === localPlayer()) {
          floatText(p.x, p.y - 46, "PROCURATION [HERMES]", "#ffedb8", 14);
          if (got > 0) floatText(p.x, p.y - 62, "GRACE +" + got, "#7ec0ff", 14);
          if (typeof toast === "function") toast("PROCURATION [HERMES] — THE PRESCRIPT COMPLETES");
        }
      }
    }
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
  /* [Rapier] — the guard is punctured: Def Level Down, so the horror takes
     +10% from every blade for a spell (damageEnemy reads e.defDown) */
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
  /* [Greatsword, Lance, Whip] — lay a typed Fragility into the foe;
     fragile flesh gives way to that class of blade, and only that class */
  if (!e.dead && (weapon === YI_WEAPON_GREATSWORD || weapon === YI_WEAPON_LANCE || weapon === YI_WEAPON_WHIP)) {
    const t = yiWeaponFragType(weapon);
    if (e.fragT <= 0 || e.fragType !== t) {
      e.fragType = t;          // a different blade opens a different seam
      e.fragStacks = 1;
    } else {
      e.fragStacks = Math.min(YI_FRAG_MAX, (e.fragStacks || 0) + 1);
    }
    e.fragT = Math.max(e.fragT || 0, YI_FRAG_TIME);
    if (p === localPlayer())
      floatText(e.x, e.y - e.r - 26, t.toUpperCase() + " FRAGILE ×" + e.fragStacks, "#ff9a3d", 12);
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
    let crit = !!forceCrit || (m.crit > 0 && Math.random() < m.crit);
    if (weapon === YI_WEAPON_SCYTHE) crit = true;
    const critMul = m.critMul || 2.2;
    /* the rapier's puncture lands on wardens as a straight exposure */
    const expose = weapon === YI_WEAPON_RAPIER ? 1 + YI_RAPIER_DEFDOWN : 1;
    hurtPlayer(foe, yiBite(p) * (biteMul || 1) * yiWeaponMul(weapon) * expose * (crit ? critMul : 1),
      { x, y, knock: (m.knock || 0) * (weapon === YI_WEAPON_HATCHET ? 0.9 : 0.6) });
  }
  return best;
}

/* per-frame bookkeeping: the swing's afterglow, the mark, and the Oracle's clock */
function yiTick(p, dt) {
  if (!p) return;
  /* the Oracle keeps its accounts for Yi Sang alone — a Kim or a Fortress must not
     inherit the mark, the Grace pips or the Karmic ledger */
  if (p.char !== "yi") return;
  yiVitals(p);
  /* GUEST: the host writes the Prescript. A guest only keeps the swing's afterglow
     alive for its own frame; the mark, Grace and Karmic arrive through snapshots. */
  if (typeof Net !== "undefined" && Net.role === "guest") {
    p.yiSlashT = Math.max(0, p.yiSlashT - dt);
    return;
  }
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
      p.yiMarkCd = 3;                 // a breath, then the Oracle writes again
    } else {
      const tgt = yiMarkedFoe(p);
      if (!tgt) { yiClearMark(p); p.yiMarkCd = 2; }   // the horror fell elsewhere — a new name follows
    }
  } else {
    /* no name is written: the Oracle's clock runs, then delivers the next Prescript */
    p.yiMarkCd = Math.max(0, (p.yiMarkCd || 0) - dt);
    if (p.yiMarkCd <= 0 && enemies.length) {
      const e = yiPickMark(p);
      if (e) {
        yiFallMark(p, e);
        p.yiMarkCd = YI_MARK_CD;
        if (p === localPlayer()) {
          floatText(p.x, p.y - 40, "THE PRESCRIPT", "#7ec0ff", 17);
        }
      }
    }
  }
  /* PRESCRIPT [DEVICE] IV — after Unlock III the Oracle sets a contract:
     empty the room before the next Prescript arrives */
  if (p.yiDevice4T > 0) {
    const alive = enemies.some(e => !e.dead && !e.ghost && e.spawnT <= 0 && e.team !== "p");
    if (!alive) {
      p.yiDevice4T = 0;
      p.yiKarmic = 0;
      if (p === localPlayer()) {
        floatText(p.x, p.y - 44, "PRESCRIPT FULFILLED", "#8ef0a0", 16);
        if (typeof toast === "function") toast("THE PRESCRIPT IS FULFILLED — THE LEDGER IS CLEAN");
      }
    } else {
      p.yiDevice4T = Math.max(0, p.yiDevice4T - dt);
      if (p.yiDevice4T <= 0) {
        /* the contract lapses — the next Prescript simply arrives, no ledger entry */
        if (p === localPlayer()) floatText(p.x, p.y - 44, "THE PRESCRIPT MOVES ON", "#8f9bb0", 13);
      }
    }
  }
  /* the Prescript pays Hermes the instant its last step is open */
  const hermesPaid = yiGrantHermesGrace(p);
  if (hermesPaid > 0 && p === localPlayer()) floatText(p.x, p.y - 62, "GRACE +" + hermesPaid, "#7ec0ff", 14);
  /* Grace of the Prescript — 3 / 6 / 9 speaks the Unlock line */
  yiCheckUnlock(p);
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

  /* PROCURATION [HERMES] at nine: this cut comes down perfect (host only) */
  const guest = typeof Net !== "undefined" && Net.role === "guest";
  const proc = !!p.yiProcReady && !guest;
  if (proc) {
    p.yiProcReady = false;
    p.yiProc = 0;
    p.yiProcGain = 0;
    p.yiPoise = YI_POISE_MAX;
    p.yiKarmic = Math.max(0, (p.yiKarmic || 0) - YI_KARMIC_EXECUTE_CLEAR);
    if (p === localPlayer()) {
      floatText(p.x, p.y - 44, "PROCURATION [HERMES]", "#ffedb8", 16);
      if (typeof toast === "function") toast("HERMES ANSWERS — TWENTY KARMIC LIFTED");
    }
  }

  const mark = p.yiMarkT > 0;
  for (let i = 0; i < arcs; i++) {
    const a = arcs === 1 ? aim : aim + (-totalHalf + wedge * (2 * i + 1));
    yiCutArc(p, x, y, a, arcs === 1 ? totalHalf : wedge, reach, proc, mark, null, weapon);
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
      yiCutArc(p, ox, oy, aim, YI_TWIN_HALF, reach, proc, mark, null, weapon);
      p.yiSlashLanes.push({
        dx: perpX * off, dy: perpY * off, ang: aim,
        scale: YI_TWIN_HALF / YI_HALF_ARC, delay: 0.02 + i * 0.012,
        alpha: 0.75, dir, cheap: true, weapon,
      });
      yiTrail(ox, oy, aim, reach, weapon, 3);
    }
    const backHalf = YI_HALF_ARC * 0.8;
    for (let i = 0; i < mirror; i++) {
      yiCutArc(p, x, y, aim + Math.PI, backHalf, reach * 0.9, proc, mark, null, weapon);
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
  yiUnlockVoices();   /* warm the three Unlock lines while he is on the field */
  const g = clamp(p.yiGrace || 0, 0, YI_GRACE_MAX);
  const k = clamp(p.yiKarmic || 0, 0, YI_KARMIC_MAX);
  const cap = yiGraceCap(p);
  /* filled ◆, reachable ◇, and the Device-locked rest as · */
  const pips = "◆".repeat(g)
    + "◇".repeat(Math.max(0, cap - g))
    + "·".repeat(Math.max(0, YI_GRACE_MAX - cap));
  const weapon = YI_WEAPONS[p.yiWeapon] || "BASTARD SWORD";
  let txt = "PRESCRIPT [" + ["I", "II", "III", "IV"][Math.min(4, Math.max(1, p.yiDevice || 1)) - 1] + "] " + pips
    + " · KARMIC " + k + "/" + YI_KARMIC_MAX;
  txt += " · HERMES " + (p.yiProc || 0) + "/" + yiProcCap(p)
    + (p.yiProcReady ? " READY" : (!p.yiProcMaxed && (p.yiDevice || 1) >= 3 ? " · GRACE 9 LOCKED" : ""));
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
  /* the greatsword sheds black shards and smoke along its whole pass */
  if (weapon === YI_WEAPON_GREATSWORD && !cheap) {
    for (let i = 0; i < 5; i++) {
      const a = lo + (hi - lo) * ((i + 0.5) / 5);
      const rr = R + 6 + Math.sin(i * 2.1) * 5;
      const sz = 3.4 + (i % 3) * 1.6;
      cx.globalAlpha = fade * 0.7;
      cx.fillStyle = "#0b0b11"; cx.strokeStyle = col; cx.lineWidth = 0.8;
      cx.shadowColor = col; cx.shadowBlur = 6;
      cx.save();
      cx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
      cx.rotate(a + 1.1);
      cx.beginPath();
      cx.moveTo(-sz, 0); cx.lineTo(0, -sz * 0.5); cx.lineTo(sz * 0.8, 0); cx.lineTo(0, sz * 0.42);
      cx.closePath(); cx.fill(); cx.stroke();
      cx.restore();
    }
    cx.globalAlpha = fade * 0.4;
    cx.strokeStyle = "#2a2a36"; cx.shadowColor = col; cx.shadowBlur = 8; cx.lineWidth = 2.0;
    const mid = (lo + hi) * 0.5;
    for (let i = 0; i < 2; i++) {
      const a = mid + (i ? 0.16 : -0.16);
      const c0 = Math.cos(a), s0 = Math.sin(a);
      cx.beginPath();
      cx.moveTo(c0 * (R - 4), s0 * (R - 4));
      cx.quadraticCurveTo(c0 * (R + 9) - s0 * 6, s0 * (R + 9) + c0 * 6,
                          c0 * (R + 16) - s0 * 2, s0 * (R + 16) + c0 * 2);
      cx.stroke();
    }
  }
  /* the scythe leaves pale splinters of the cut hanging in the air */
  if (weapon === YI_WEAPON_SCYTHE && !cheap) {
    cx.shadowColor = col; cx.shadowBlur = 10;
    for (let i = 0; i < 4; i++) {
      const a = lo + (hi - lo) * ((i + 0.4) / 4);
      const rr = R + 9 + (i % 2) * 6;
      const c0 = Math.cos(a), s0 = Math.sin(a);
      cx.globalAlpha = fade * 0.8;
      cx.strokeStyle = i % 2 ? "#e8fbff" : col; cx.lineWidth = 1.2;
      cx.beginPath();
      cx.moveTo(c0 * rr, s0 * rr);
      cx.lineTo(c0 * (rr + 10) - s0 * 3, s0 * (rr + 10) + c0 * 3);
      cx.stroke();
    }
  }
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
  /* the lance punches a blue star through the hole and drags smoke behind the wound */
  if (weapon === YI_WEAPON_LANCE) {
    const bx = tip * (0.5 + 0.5 * prog);
    const sf = Math.max(0, 1 - Math.abs(prog - 0.62) * 2.2);
    if (sf > 0) {
      cx.globalAlpha = fade * sf * 0.9;
      cx.strokeStyle = col; cx.shadowColor = col; cx.shadowBlur = 18; cx.lineWidth = 2.0;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4;
        cx.beginPath();
        cx.moveTo(bx + Math.cos(a) * 4, Math.sin(a) * 4);
        cx.lineTo(bx + Math.cos(a) * 18, Math.sin(a) * 18);
        cx.stroke();
      }
    }
    cx.globalAlpha = fade * 0.28; cx.strokeStyle = "#2a3240"; cx.shadowBlur = 0; cx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const sw2 = Math.sin(i * 2.4 + prog * 6) * 5;
      cx.beginPath();
      cx.moveTo(bx * 0.5, i ? 8 : -8);
      cx.quadraticCurveTo(bx * 0.3, (i ? 14 : -14) + sw2, bx * 0.12, (i ? 4 : -4) + sw2 * 0.6);
      cx.stroke();
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
/* with nothing to cut, the Oracle's weapon stays in its base form — the Vial does not
   take a shape until the Prescript shows it a target on screen */
function yiHasQuarry(p) {
  if (typeof enemies !== "undefined" && enemies) {
    const cam = Game.cam || { x: 0, y: 0 };
    const pad = 30;
    const L = cam.x - pad, T = cam.y - pad;
    const R = cam.x + VW + pad, B = cam.y + VH + pad;
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
      if (e.x >= L && e.x <= R && e.y >= T && e.y <= B) return true;
    }
  }
  if (Game.pvpMode && typeof players !== "undefined") {
    for (const foe of players) {
      if (foe === p || foe.hp <= 0 || foe.downed || foe.gone) continue;
      return true;
    }
  }
  return false;
}

/* the base form — a sealed canister of the black liquid, gold-banded, on a gold chain,
   hovering above his open glove */
function drawYiVial(px, py, aim, t) {
  cx.save();
  cx.translate(px, py);
  cx.rotate(aim);
  /* the open glove beneath it, fingers fanned */
  cx.fillStyle = YI_COL.glove;
  cx.strokeStyle = "#8f8a80"; cx.lineWidth = 0.7;
  cx.beginPath(); cx.ellipse(9.6, -4.2, 2.7, 1.9, 0.12, 0, TAU); cx.fill(); cx.stroke();
  for (let i = 0; i < 3; i++) {
    cx.beginPath();
    cx.ellipse(11.7 + i * 0.35, -5.7 + i * 1.15, 1.05, 0.66, 0.18, 0, TAU);
    cx.fill(); cx.stroke();
  }
  /* he tosses the Vial and catches it again — the base form never quite sits still.
     This is the same pose as the evade frame: the canister hanging above the open palm. */
  const period = 3.4;
  const u = (t % period) / period;
  const toss = u < 0.42 ? 0 : Math.sin(Math.PI * (u - 0.42) / 0.58);
  const drift = toss * 1.4;
  const lift = toss * 7.2;
  const inHand = -8.2;
  cx.globalAlpha = 0.26 * (1 - toss * 0.8);
  cx.fillStyle = YI_COL.gold;
  cx.beginPath(); cx.ellipse(9.6, -4.2, 3.0, 0.9, 0, 0, TAU); cx.fill();
  cx.globalAlpha = 1;
  /* the thread of the throw */
  if (toss > 0.08) {
    cx.globalAlpha = 0.22 * toss;
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 0.8;
    cx.setLineDash([1.4, 2.6]);
    cx.beginPath();
    cx.moveTo(9.6, -5.4);
    cx.quadraticCurveTo(9.6 + drift * 0.4, inHand - lift * 0.5, 9.6 + drift, inHand - lift + 2.0);
    cx.stroke();
    cx.setLineDash([]);
    cx.globalAlpha = 1;
  }

  /* the Vial itself, mid-toss */
  cx.save();
  cx.translate(9.6 + drift, inHand - lift);
  cx.rotate(-0.24 + toss * 0.85 + Math.sin(t * 1.6) * 0.04 * (1 - toss));
  /* the gold chain handle, looped above the canister */
  const arc = (u) => {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return [a * 6.6 + c * -6.8, a * -1.8 + b * -15.2 + c * -1.8];
  };
  cx.strokeStyle = "#c9a44e"; cx.shadowColor = YI_COL.gold; cx.shadowBlur = 0;
  cx.lineWidth = 0.8;
  for (let i = 0; i < 9; i++) {
    const u = (i + 0.5) / 9;
    const p0 = arc(u - 0.012), p1 = arc(u + 0.012);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + (i % 2 ? Math.PI / 2 : 0);
    cx.save();
    cx.translate(p0[0], p0[1]); cx.rotate(ang);
    cx.beginPath(); cx.ellipse(0, 0, 1.0, 0.45, 0, 0, TAU);
    cx.stroke();
    cx.restore();
  }
  /* the clasp where the chain meets the cap */
  cx.fillStyle = "#24252c"; cx.strokeStyle = YI_COL.gold; cx.lineWidth = 0.9;
  cx.beginPath(); cx.arc(6.6, -1.8, 1.05, 0, TAU); cx.fill(); cx.stroke();

  /* the canister body */
  const r = 2.75, half = 7.6;
  cx.shadowColor = "#8a7440"; cx.shadowBlur = 3;
  cx.fillStyle = "#24252c"; cx.strokeStyle = "#6a6d78"; cx.lineWidth = 0.8;
  cx.beginPath();
  cx.moveTo(-half, -r); cx.lineTo(half, -r);
  cx.quadraticCurveTo(half + 1.9, 0, half, r);
  cx.lineTo(-half, r);
  cx.quadraticCurveTo(-half - 1.9, 0, -half, -r);
  cx.closePath(); cx.fill(); cx.stroke();
  cx.shadowBlur = 0;
  const grd = cx.createLinearGradient(0, -r, 0, r);
  grd.addColorStop(0, "#e2e5ea"); grd.addColorStop(0.42, "#a8abb4"); grd.addColorStop(1, "#555761");
  cx.fillStyle = grd;
  cx.beginPath(); cx.rect(-half + 0.7, -r + 0.75, half * 2 - 1.4, r * 2 - 1.5); cx.fill();
  /* gold bands */
  cx.fillStyle = YI_COL.gold; cx.shadowColor = YI_COL.gold; cx.shadowBlur = 2.5;
  for (const bx of [-4.6, 4.6]) cx.fillRect(bx - 0.8, -r + 0.5, 1.6, r * 2 - 1.0);
  /* seam, sheen and the dark window of liquid */
  cx.shadowBlur = 0;
  cx.strokeStyle = "#3c3d45"; cx.lineWidth = 0.7;
  cx.beginPath(); cx.moveTo(-half + 1, 0.5); cx.lineTo(half - 1, 0.5); cx.stroke();
  cx.strokeStyle = "#f4f6fa"; cx.globalAlpha = 0.7; cx.lineWidth = 0.8;
  cx.beginPath(); cx.moveTo(-half + 1.2, -r + 1.15); cx.lineTo(half - 1.2, -r + 1.15); cx.stroke();
  cx.globalAlpha = 1;
  cx.fillStyle = "#0e0e16";
  cx.beginPath(); cx.ellipse(0, 0.15, 2.1, 1.2, 0, 0, TAU); cx.fill();
  cx.fillStyle = "#2b2b3a";
  cx.beginPath(); cx.ellipse(-1.1, -0.85, 0.75, 0.45, 0, 0, TAU); cx.fill();
  cx.restore();
  cx.restore();
}

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
  drawWounds(cx, hpFrac, 11);

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

  /* nothing to cut — the Vial keeps its base form and he tosses it over his palm */
  if (!(P.yiSlashT > 0) && !yiHasQuarry(P)) {
    drawYiVial(px, py, aim, t);
    cx.globalAlpha = 1; cx.shadowBlur = 0;
    return;
  }

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
    /* THE COLOSSAL — a black slab nearly as wide as his shoulders, tapering over its whole
       length to a needle point. A long grey plane down one face, three swept guard thorns,
       a barbed pommel-spike behind the fist, and smoke peeling off the spine. */
    const perpA = ba + Math.PI / 2;
    const pxn = Math.cos(perpA), pyn = Math.sin(perpA);
    const at = (a, b) => [cosA * a + pxn * b, sinA * a + pyn * b];
    const root = 8, wid = 9.0, tipL = len;
    cx.shadowColor = edge; cx.shadowBlur = 12;
    /* the slab */
    cx.fillStyle = "#16161f"; cx.strokeStyle = "#454552"; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(...at(root, -wid * 0.7));
    cx.lineTo(...at(root + 4, -wid));
    cx.quadraticCurveTo(...at(tipL * 0.56, -wid * 0.5), ...at(tipL, 0));
    cx.quadraticCurveTo(...at(tipL * 0.54, wid * 0.46), ...at(root + 4, wid));
    cx.lineTo(...at(root, wid * 0.7));
    cx.closePath(); cx.fill(); cx.stroke();
    /* the grey plane down the face — a narrow band of flat steel */
    cx.fillStyle = "#5f5f6d"; cx.shadowBlur = 0;
    cx.beginPath();
    cx.moveTo(...at(root + 5, -wid * 0.30));
    cx.lineTo(...at(root + 5, wid * 0.30));
    cx.lineTo(...at(tipL * 0.84, wid * 0.04));
    cx.lineTo(...at(tipL * 0.82, -wid * 0.07));
    cx.closePath(); cx.fill();
    /* a darker inset inside the plane, like the reference's second facet */
    cx.fillStyle = "#3a3a46";
    cx.beginPath();
    cx.moveTo(...at(root + 7, -wid * 0.16));
    cx.lineTo(...at(root + 7, wid * 0.10));
    cx.lineTo(...at(tipL * 0.60, wid * 0.02));
    cx.lineTo(...at(tipL * 0.58, -wid * 0.03));
    cx.closePath(); cx.fill();
    /* the cutting edge, cold and lit */
    cx.strokeStyle = YI_COL.arcEdge; cx.shadowColor = edge; cx.shadowBlur = 9; cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(...at(root + 4.5, wid * 0.96));
    cx.quadraticCurveTo(...at(tipL * 0.54, wid * 0.44), ...at(tipL - 1.4, 0.4));
    cx.stroke();
    /* the notch where the edge steps in near the guard */
    cx.strokeStyle = "#0c0c12"; cx.lineWidth = 1.6; cx.shadowBlur = 0;
    cx.beginPath(); cx.moveTo(...at(root + 10, wid * 0.74)); cx.lineTo(...at(root + 8.6, wid * 0.34)); cx.stroke();
    /* three swept guard thorns, the outer pair longest */
    cx.fillStyle = "#0b0b11"; cx.strokeStyle = "#3a3a46"; cx.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) {
      const bx = 5.5 + i * 5.2;
      const span = 15.5 - i * 3.0;
      const back = 7.0 + i * 3.4;
      for (const sd of [1, -1]) {
        cx.beginPath();
        cx.moveTo(...at(bx, sd * 1.6));
        cx.lineTo(...at(bx - back, sd * span));
        cx.lineTo(...at(bx - back * 0.35, sd * span * 0.5));
        cx.lineTo(...at(bx + 2.6, sd * 3.2));
        cx.closePath(); cx.fill(); cx.stroke();
      }
    }
    /* the pommel-spike — a great barbed thorn behind the fist */
    cx.fillStyle = "#0b0b11"; cx.strokeStyle = "#3a3a46";
    cx.beginPath();
    cx.moveTo(...at(-2, -2.6));
    cx.lineTo(...at(-12, -3.4));
    cx.lineTo(...at(-26, 0));
    cx.lineTo(...at(-12, 3.4));
    cx.lineTo(...at(-2, 2.6));
    cx.closePath(); cx.fill(); cx.stroke();
    /* its barbs */
    for (const sd of [1, -1]) {
      cx.beginPath();
      cx.moveTo(...at(-9, sd * 2.4));
      cx.lineTo(...at(-16, sd * 7.6));
      cx.lineTo(...at(-7.4, sd * 2.0));
      cx.closePath(); cx.fill(); cx.stroke();
    }
    /* the chain of gold links at the grip */
    cx.fillStyle = YI_COL.gold; cx.shadowBlur = 5; cx.shadowColor = YI_COL.gold;
    for (let i = 0; i < 3; i++) {
      const gp = at(-4 - i * 3.6, i % 2 ? 2.6 : -2.6);
      cx.beginPath(); cx.arc(gp[0], gp[1], 1.05, 0, TAU); cx.fill();
    }
    /* black smoke peeling off the spine */
    cx.shadowColor = edge; cx.shadowBlur = 0;
    cx.strokeStyle = "#242430"; cx.lineWidth = 2.0; cx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const f = 0.34 + i * 0.2;
      const w0 = Math.sin(t * 4.1 + i * 2.1) * 3.2;
      const sp = at(tipL * f, -wid * 0.55 - 2.4);
      cx.beginPath();
      cx.moveTo(sp[0], sp[1]);
      cx.quadraticCurveTo(sp[0] - cosA * 5 + pxn * (w0 - 3), sp[1] - sinA * 5 + pyn * (w0 - 3),
                          sp[0] - cosA * 12 + pxn * w0 * 1.7, sp[1] - sinA * 12 + pyn * w0 * 1.7);
      cx.stroke();
    }
  } else if (weapon === YI_WEAPON_LANCE) {
    /* THE BORER — the reed of black liquid runs through the fist and ends at once in a
       colossal kite head: a socket that flares into a wide belly, then a long straight
       taper to a blue-hot needle. Four pale ribs fan from the socket into the blade. */
    const perpA = ba + Math.PI / 2;
    const pxn = Math.cos(perpA), pyn = Math.sin(perpA);
    const at = (a, b) => [cosA * a + pxn * b, sinA * a + pyn * b];
    /* the reed — he grips it just behind the head */
    cx.strokeStyle = "#15151d"; cx.lineWidth = 3.0; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(...at(-12, 0)); cx.lineTo(...at(12, 0)); cx.stroke();
    cx.strokeStyle = "#4c5464"; cx.lineWidth = 0.9;
    cx.beginPath(); cx.moveTo(...at(-11, -0.7)); cx.lineTo(...at(11, -0.7)); cx.stroke();
    /* the head */
    const socket = 9, belly = len * 0.44, wide = 11.4, tipL = len + 6;
    const headPath = new Path2D();
    headPath.moveTo(...at(socket, -1.4));
    headPath.quadraticCurveTo(...at(socket + 5, -5.4), ...at(belly, -wide));
    headPath.lineTo(...at(tipL, 0));
    headPath.lineTo(...at(belly, wide));
    headPath.quadraticCurveTo(...at(socket + 5, 5.4), ...at(socket, 1.4));
    headPath.closePath();
    cx.shadowColor = edge; cx.shadowBlur = 13;
    cx.fillStyle = "#0c0c13"; cx.strokeStyle = "#2f3744"; cx.lineWidth = 1.1;
    cx.fill(headPath); cx.stroke(headPath);
    /* the grey plane on the lower face */
    cx.fillStyle = "#2e2e3b"; cx.shadowBlur = 0;
    cx.beginPath();
    cx.moveTo(...at(socket + 2, 0.5));
    cx.lineTo(...at(belly, wide * 0.62));
    cx.lineTo(...at(tipL * 0.9, wide * 0.10));
    cx.lineTo(...at(tipL * 0.86, -wide * 0.06));
    cx.closePath(); cx.fill();
    /* four pale ribs fanning out of the socket — the reference's white struts */
    cx.save(); cx.clip(headPath);
    cx.strokeStyle = edge; cx.shadowColor = edge; cx.shadowBlur = 8; cx.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      const alongEnd = socket + (belly - socket) * (0.58 + i * 0.14);
      cx.globalAlpha = 0.9 - i * 0.14;
      cx.beginPath();
      cx.moveTo(...at(socket + 1.2, 0));
      cx.lineTo(...at(alongEnd, wide * (0.72 - i * 0.16) * (i % 2 ? 1 : -1)));
      cx.stroke();
    }
    cx.restore();
    cx.globalAlpha = 1;
    /* the long lit edges and the needle point */
    cx.strokeStyle = edge; cx.shadowBlur = 12; cx.lineWidth = 1.15;
    cx.beginPath();
    cx.moveTo(...at(belly, -wide)); cx.lineTo(...at(tipL, 0));
    cx.moveTo(...at(belly, wide)); cx.lineTo(...at(tipL, 0));
    cx.stroke();
    cx.fillStyle = "#eaf6ff";
    cx.beginPath(); cx.arc(...at(tipL, 0), 1.7, 0, TAU); cx.fill();
    /* the silver crossguard just ahead of the fist */
    cx.shadowBlur = 0; cx.strokeStyle = "#9aa2b0"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(...at(11, -7.4)); cx.lineTo(...at(11, 7.4)); cx.stroke();
    /* gold ferrule at the grip */
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.6;
    cx.beginPath(); cx.ellipse(hiltX, hiltY, 3.2, 2.0, perpA, 0, TAU); cx.stroke();
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
    /* THE REAPER — a crooked black haft banded with arrowhead ferrules, a forked butt-spike,
       and a huge sickle: a broad black leaf curling over him, pale along its inner edge. */
    const perpA = ba + Math.PI / 2;
    const pxn = Math.cos(perpA), pyn = Math.sin(perpA);
    const at = (a, b) => [cosA * a + pxn * b, sinA * a + pyn * b];
    const headAt = len * 0.60;
    /* the crooked haft — five joints, each nudged off the line */
    const haft = [];
    for (let i = 0; i <= 5; i++) {
      const f = i / 5;
      haft.push(at(-18 + f * (headAt + 18), Math.sin(f * 4.0) * 1.9));
    }
    cx.lineCap = "round";
    cx.strokeStyle = "#0d0d14"; cx.lineWidth = 3.6;
    cx.beginPath(); cx.moveTo(haft[0][0], haft[0][1]);
    for (let i = 1; i < haft.length; i++) cx.lineTo(haft[i][0], haft[i][1]);
    cx.stroke();
    cx.strokeStyle = "#34343f"; cx.lineWidth = 1.0;
    cx.beginPath(); cx.moveTo(haft[0][0], haft[0][1]);
    for (let i = 1; i < haft.length; i++) cx.lineTo(haft[i][0], haft[i][1]);
    cx.stroke();
    /* arrowhead ferrules banding the haft */
    cx.fillStyle = "#0d0d14"; cx.strokeStyle = "#3c3c48"; cx.lineWidth = 0.8;
    for (const fk2 of [1, 3, 4]) {
      const f = fk2 / 5;
      const hx2 = -18 + f * (headAt + 18);
      const bend2 = Math.sin(f * 4.0) * 1.9;
      for (const sd of [1, -1]) {
        cx.beginPath();
        cx.moveTo(...at(hx2 - 3.2, bend2));
        cx.lineTo(...at(hx2, bend2 + sd * 3.8));
        cx.lineTo(...at(hx2 + 3.4, bend2));
        cx.closePath(); cx.fill(); cx.stroke();
      }
    }
    /* the forked butt-spike */
    const bt = haft[0];
    cx.beginPath();
    cx.moveTo(bt[0] + pxn * 1.6, bt[1] + pyn * 1.6);
    cx.lineTo(bt[0] - cosA * 20 + pxn * 6.4, bt[1] - sinA * 20 + pyn * 6.4);
    cx.lineTo(bt[0] - cosA * 7 + pxn * 2.2, bt[1] - sinA * 7 + pyn * 2.2);
    cx.lineTo(bt[0] - cosA * 30 - pxn * 0.4, bt[1] - sinA * 30 - pyn * 0.4);
    cx.lineTo(bt[0] - cosA * 7 - pxn * 2.2, bt[1] - sinA * 7 - pyn * 2.2);
    cx.lineTo(bt[0] - cosA * 20 - pxn * 6.4, bt[1] - sinA * 20 - pyn * 6.4);
    cx.closePath(); cx.fill(); cx.stroke();
    /* the sickle — broad at the socket, tapering to a long hooked point */
    const r0 = haft[5];
    const sc = len + 14;
    cx.shadowColor = edge; cx.shadowBlur = 15;
    cx.fillStyle = "#14141d"; cx.strokeStyle = "#464652"; cx.lineWidth = 1.1;
    cx.beginPath();
    cx.moveTo(r0[0] - pxn * 1.2, r0[1] - pyn * 1.2);
    cx.quadraticCurveTo(...at(headAt + 9, -27), ...at(sc, -36));
    cx.quadraticCurveTo(...at(sc - 15, -15), ...at(headAt + 8, 5));
    cx.closePath(); cx.fill(); cx.stroke();
    /* a grey sheen riding the back of the crescent */
    cx.fillStyle = "#5d5d6b"; cx.shadowBlur = 0;
    cx.beginPath();
    cx.moveTo(...at(headAt + 4, -3));
    cx.quadraticCurveTo(...at(headAt + 11, -21), ...at(sc - 2, -34.4));
    cx.quadraticCurveTo(...at(headAt + 12, -14), ...at(headAt + 8, -1.4));
    cx.closePath(); cx.fill();
    /* the pale inner edge — the part that bites */
    cx.strokeStyle = "#d6dbe4"; cx.shadowColor = edge; cx.shadowBlur = 11; cx.lineWidth = 1.25;
    cx.beginPath();
    cx.moveTo(...at(headAt + 7, 3.6));
    cx.quadraticCurveTo(...at(sc - 15, -15), ...at(sc - 0.6, -35.4));
    cx.stroke();
    /* the barbed tip, hooking further round */
    cx.strokeStyle = "#0d0d14"; cx.lineWidth = 2.4; cx.shadowBlur = 6;
    cx.beginPath();
    cx.moveTo(...at(sc, -36));
    cx.quadraticCurveTo(...at(sc + 2.4, -41), ...at(sc - 2.6, -44.4));
    cx.stroke();
    /* the socket barb — a spike sweeping back off the root of the blade */
    cx.fillStyle = "#0d0d14"; cx.strokeStyle = "#3c3c48"; cx.lineWidth = 0.8;
    cx.beginPath();
    cx.moveTo(...at(headAt - 1, -1.4));
    cx.lineTo(...at(headAt - 11, -10.4));
    cx.lineTo(...at(headAt - 2.2, -12.4));
    cx.lineTo(...at(headAt + 4, -3.2));
    cx.closePath(); cx.fill(); cx.stroke();
    /* twin counter-forks under the socket */
    for (const sd of [1, -1]) {
      cx.beginPath();
      cx.moveTo(...at(headAt - 1.2, sd * 1.2));
      cx.lineTo(...at(headAt - 7.4, sd * 6.8));
      cx.lineTo(...at(headAt + 1.6, sd * 2.0));
      cx.closePath(); cx.fill(); cx.stroke();
    }
    /* gold spring at the grip */
    cx.shadowBlur = 0;
    cx.strokeStyle = YI_COL.gold; cx.lineWidth = 1.8;
    cx.beginPath(); cx.ellipse(hiltX, hiltY, 2.8, 1.7, perpA, 0, TAU); cx.stroke();
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
