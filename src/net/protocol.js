/* =========================================================
   RUNEGUN · Protocol — snapshot encode (host) / apply (guest).
   The host ships authoritative state ~15Hz on the unreliable channel;
   the guest deserializes straight back into the same globals draw()
   reads, interpolating transforms between the two newest snapshots.

   Deliberately NOT in snapshots: player bullets (guest predicts its
   own, partner's arrive once via `bNew`), enemy bullets (once via
   `ebNew`, then guest-simulated), particles/floaters/zaps/veils
   (guest-local juice; floaters replayed from the `fx` batch).
   ========================================================= */
"use strict";

/* =========================================================
   WIRE FORMAT NOTES

   The hot arrays (enemies, puddles) ship as FLAT ARRAYS, not keyed
   objects. At ~50 enemies the key names were most of the payload —
   `{"x":1234.567,"y":...}` repeated fifty times — and every entity also
   cost an object allocation on encode and another on parse, 15 times a
   second, on both phones. That garbage is what read as "the whole game
   is low-FPS" on Android.

   Positions are whole pixels: sub-pixel precision is invisible at this
   zoom and `1234.567` is twice the characters of `1235`.

   Fields that never change after an entity is first seen (type, radius,
   colour, maxHp) ride only in the FIRST packet that mentions its id —
   the guest keeps them. `seen` below is the host's ledger of which ids
   have already had their statics delivered.
   ========================================================= */

/* enemy STATIC head, sent once per id: [id, type, r, maxHp, boss] */
/* enemy DYNAMIC row, every snapshot: [id, x, y, vx, vy, hp, flags, spawnT, hitFlash, slowT, burnT, fearT] */
const EF = { ID: 0, X: 1, Y: 2, VX: 3, VY: 4, HP: 5, FLAGS: 6, SPAWNT: 7, HITF: 8, SLOWT: 9, BURNT: 10, FEART: 11 };
/* bit flags packed into one number instead of six booleans */
const EFLAG = { GHOST: 1, BUFFED: 2, WRATH: 4, RIME: 8, SEAR: 16, AMBUSH: 32, NOCLIP: 64, AIRLEAP: 128 };

/* enemy fields every archetype ships (transform + status tints) */
const ENEMY_COMMON = ["id", "type", "x", "y", "vx", "vy", "r", "hp", "maxHp", "hitFlash",
  "spawnT", "ghost", "boss", "buffed", "wrath", "rime", "sear", "slowT", "burnT", "fearT", "ambush"];
/* per-archetype extras draw.js reads for telegraphs and poses */
const ENEMY_EXTRA = {
  chaser: ["wob"],
  gunner: ["cd"],
  dasher: ["phase", "pt"],
  slammer: ["phase", "pt", "cd"],
  spitter: ["cd", "spin"],
  wisp: ["phase", "pt", "shots"],
  summoner: ["cd", "raised"],
  shade: ["noclip", "bob", "inRock"],
  cinder: ["trailT"],
  slag: ["phase", "pt", "rockA", "jag", "lx", "ly", "airLeap", "jumpCd"],
  slagling: ["phase", "pt", "rockA", "jag", "lx", "ly", "airLeap", "jumpCd"],
  angler: ["phase", "pt", "lureBob", "strikeAng"],
  riptide: ["phase", "pt", "rushAng"],
  phylactery: ["orbA", "orbR", "bob"],
};
/* boss props that must NOT ship (object refs / host-only bookkeeping) */
const BOSS_SKIP = new Set(["airDst", "convergePos"]);

const PLAYER_FIELDS = ["x", "y", "vx", "vy", "hp", "maxHp", "shield", "shieldMax", "aim", "autoFire",
  "fireT", "dashT", "dashAng", "dashCd", "dashCdBase", "veilT", "veilCdBase", "kickT", "iframes",
  "downed", "reviveT", "puddleTick", "thrallRecallT", "reprieveCd"];

const NUM3 = v => typeof v === "number" ? Math.round(v * 100) / 100 : v;
const QI = v => Math.round(v) || 0;                       // whole pixels
const Q2 = v => Math.round(v * 100) / 100 || 0;           // angles / short timers

function pluck(src, fields, out) {
  out = out || {};
  for (const f of fields) if (src[f] !== undefined) out[f] = NUM3(src[f]);
  return out;
}

const Protocol = {
  _fx: [],            // floatText replays queued since the last snapshot (host)
  _snapN: 0,
  _seen: new Set(),   // host: entity ids whose static head has been delivered
  /* guest: last HUD values pushed to the DOM, so an unchanged readout is not
     rewritten (and re-tweened, and re-reflowed) on every arriving packet */
  _uiHp: "", _uiScore: -1, _uiSeal: "",

  /* a floor change wipes the guest's world, so every static must be re-sent —
     and the HUD gate below must forget what it thinks is on screen */
  resetSeen() { this._seen.clear(); this._uiHp = ""; this._uiScore = -1; this._uiSeal = ""; },

  /* Host: floatText calls funnel here (hooked in coop.js).
     Ordinary damage numbers are NOT worth wire bytes — the guest already
     detects its own cosmetic bullet hits and can print them itself. Only
     callouts it could never infer (crits, REAPED, boss lines, streaks)
     are worth shipping, and even those are capped hard. */
  queueFx(f) { if (this._fx.length < 8) this._fx.push(f); },
  /* a plain damage number is a bare numeric string in the default colour */
  fxWorthSending(txt, color) {
    if (color !== "#e8e2d0") return true;                 // anything tinted is a callout
    return !/^\d+$/.test(String(txt));                    // plain numbers: skip
  },

  /* ---------------- HOST: encode ---------------- */
  encodeSnapshot() {
    this._snapN++;
    const s = {
      t: "s", n: this._snapN, time: NUM3(Game.time),
      g: {
        state: Game.state, wave: Game.wave, score: Game.score, kills: Game.kills,
        intermission: NUM3(Game.intermission), hitstop: NUM3(Game.hitstop), slowmo: NUM3(Game.slowmo),
        ceremonyT: NUM3(Game.ceremonyT), comboN: Game.comboN, comboT: NUM3(Game.comboT),
        streakTier: Game.streakTier, mapIdx: Game.mapIdx, loop: Game.loop,
        chestsTotal: Game.chestsTotal, chestsOpened: Game.chestsOpened,
        flawless: Game.flawless, bossId: Game.boss ? Game.boss.id : 0,
        pickupBy: Game.pendingPickupBy,
        seal: SEAL.state,
      },
      pl: players.map(p => {
        const o = pluck(p, PLAYER_FIELDS);
        o.curses = p.curses;
        return o;
      }),
      en: [], enew: [], eb: [], bn: [], pu: [], punew: [], mn: [], sh: [],
      pets: pets.map(pt => ({ type: pt.type, o: pt.owner.idx, x: NUM3(pt.x), y: NUM3(pt.y), orbA: NUM3(pt.orbA), block: pt.block })),
      ch: chests.map(c => [c.id, c.state]),
      hb: healthBoxes.map(h => [h.id, h.state]),
      pk: pickups.map(k => [k.id, NUM3(k.x), NUM3(k.y)]),
      po: portal ? { x: portal.x, y: portal.y, t: NUM3(portal.t) } : null,
      fx: this._fx,
    };
    this._fx = [];
    for (const e of enemies) {
      if (e.dead) continue;
      /* first sighting: the fields that never change again */
      if (!this._seen.has(e.id)) {
        this._seen.add(e.id);
        s.enew.push([e.id, e.type, QI(e.r), QI(e.maxHp), e.boss ? 1 : 0, e.color,
          e.team === "p" ? 1 : 0, e.owner && e.owner.idx !== undefined ? e.owner.idx : -1]);
      }
      let flags = 0;
      if (e.ghost) flags |= EFLAG.GHOST;
      if (e.buffed) flags |= EFLAG.BUFFED;
      if (e.wrath) flags |= EFLAG.WRATH;
      if (e.rime) flags |= EFLAG.RIME;
      if (e.sear) flags |= EFLAG.SEAR;
      if (e.ambush) flags |= EFLAG.AMBUSH;
      if (e.noclip) flags |= EFLAG.NOCLIP;
      if (e.airLeap) flags |= EFLAG.AIRLEAP;
      const row = [e.id, QI(e.x), QI(e.y), QI(e.vx), QI(e.vy), QI(e.hp), flags,
        Q2(e.spawnT), Q2(e.hitFlash), Q2(e.slowT), Q2(e.burnT), Q2(e.fearT)];
      /* per-archetype telegraph state rides as a trailing object at index 12,
         and only when the type actually has some — most rows end at 11 */
      const ex = ENEMY_EXTRA[e.type];
      if (ex) {
        const extra = pluck(e, ex);
        if (Object.keys(extra).length) row.push(extra);
      }
      s.en.push(row);
      if (e.boss) {   /* the boss is one entity — keyed object is fine and readable */
        const o = pluck(e, ENEMY_COMMON);
        for (const k in e) {
          if (o[k] !== undefined || BOSS_SKIP.has(k)) continue;
          const v = e[k];
          const ty = typeof v;
          if (ty === "function" || (ty === "object" && v !== null && !Array.isArray(v))) continue;
          o[k] = Array.isArray(v) ? v : NUM3(v);
        }
        /* sub-arrays drive telegraphs but mutate slowly — every 3rd snapshot */
        if (this._snapN % 3 === 1) {
          for (const k of ["graves", "vents", "meteors", "cracks", "marks", "wells"])
            if (Array.isArray(e[k])) o[k] = e[k];
        }
        if (e.airDst) o.airDst = { x: QI(e.airDst.x), y: QI(e.airDst.y) };
        s.boss = o;
      }
    }
    /* NEW enemy bullets since the last snapshot — shipped once, then guest-simulated.
       Packed: [x, y, vx, vy, r, colorIdx-or-string, homing] */
    for (const b of ebullets) {
      if (b._sent) continue;
      b._sent = true;
      s.eb.push([QI(b.x), QI(b.y), QI(b.vx), QI(b.vy), b.r, b.color, Q2(b.homing || 0)]);
    }
    /* NEW host-side player bullets that are NOT the guest's own gun (those it predicts) */
    for (const b of bullets) {
      if (b._sent) continue;
      b._sent = true;
      if (b.owner && b.owner.idx !== 0) continue;   // guest's own fire — it already drew it
      let bf = 0;
      if (b.pet) bf |= 1;
      if (b.shard) bf |= 2;
      s.bn.push([QI(b.x), QI(b.y), QI(b.vx), QI(b.vy), b.r, Q2(b.life),
        b.venom || 0, b.ember || 0, b.frost || 0, bf]);
    }
    /* puddles: a pool's look never changes after it forms, so only its id and
       fading `t` need repeating. Floor-3 lava rivers can be 100+ of these. */
    for (const pu of puddles) {
      if (!pu.id) assignId(pu);
      if (!this._seen.has(pu.id)) {
        this._seen.add(pu.id);
        let pf = 0;
        if (pu.lava) pf |= 1;
        if (pu.water) pf |= 2;
        if (pu.vortex) pf |= 4;
        if (pu.phase) pf |= 8;
        if (pu.slime) pf |= 16;
        s.punew.push([pu.id, QI(pu.x), QI(pu.y), QI(pu.r), pu.color, pf,
          pu.life === Infinity ? -1 : Q2(pu.life)]);
      }
      s.pu.push([pu.id, Q2(pu.t)]);
    }
    for (const mn of mines) {
      s.mn.push({ x: NUM3(mn.x), y: NUM3(mn.y), t: NUM3(mn.t), life: mn.life, armT: NUM3(mn.armT),
        pulse: NUM3(mn.pulse), o: mn.owner ? mn.owner.idx : 0 });
    }
    for (const sl of shells) {
      s.sh.push({ sx: sl.sx, sy: sl.sy, x: NUM3(sl.x), y: NUM3(sl.y), lx: sl.lx, ly: sl.ly,
        t: NUM3(sl.t), T: sl.T, r: sl.r, o: sl.owner ? sl.owner.idx : 0 });
    }
    /* terrain reconciliation rides every 15th snapshot (~1Hz) — rocks change rarely */
    if (this._snapN % 15 === 1) {
      s.rk = MAP.rocks.map(rc => ({ id: rc.id, x: rc.x, y: rc.y, w: rc.w, h: rc.h, tone: rc.tone, boss: !!rc.boss }));
    }
    return s;
  },

  /* ---------------- GUEST: apply ---------------- */
  /* Entities are matched by id and their transforms LERPED toward the
     snapshot (the buffer in coop.js decides the render time); everything
     non-positional is copied straight. */
  applySnapshot(s, blend) {
    const g = s.g;
    Game.wave = g.wave; Game.score = g.score; Game.kills = g.kills;
    Game.intermission = g.intermission; Game.hitstop = 0;   // guest never freezes on host hitstop
    Game.slowmo = g.slowmo; Game.ceremonyT = g.ceremonyT;
    Game.comboN = g.comboN; Game.comboT = g.comboT; Game.streakTier = g.streakTier;
    Game.mapIdx = g.mapIdx; Game.loop = g.loop;
    Game.chestsTotal = g.chestsTotal; Game.chestsOpened = g.chestsOpened;
    Game.flawless = g.flawless;
    Game.pendingPickupBy = g.pickupBy;
    SEAL.state = g.seal;

    /* players: the partner fully; own warden's non-predicted fields only */
    for (let i = 0; i < s.pl.length && i < players.length; i++) {
      const p = players[i], o = s.pl[i];
      const own = i === Net.localIdx;
      if (!own) {
        /* the partner gets the same target-and-chase treatment as enemies —
           snapping them on each snapshot is what made them judder */
        if (p._tx === undefined) { p.x = o.x; p.y = o.y; }
        p._tx = o.x; p._ty = o.y;
        for (const f of PLAYER_FIELDS) if (f !== "x" && f !== "y" && o[f] !== undefined) p[f] = o[f];
      } else {
        /* authoritative health/status; position stays predicted unless it diverges hard */
        const err = Math.hypot(p.x - o.x, p.y - o.y);
        if (err > 48) { p.x = o.x; p.y = o.y; }
        else if (err > 4) { p.x = lerp(p.x, o.x, 0.08); p.y = lerp(p.y, o.y, 0.08); }
        for (const f of ["hp", "maxHp", "shield", "shieldMax", "iframes", "downed", "reviveT"])
          if (o[f] !== undefined) p[f] = o[f];
      }
      p.curses = o.curses || {};
    }

    /* enemies: static heads first, then one packed row each */
    const byId = new Map();
    for (const e of enemies) byId.set(e.id, e);
    for (const h of s.enew) {
      let e = byId.get(h[0]);
      if (!e) {
        e = { id: h[0], vx: 0, vy: 0, slowMul: 1, slowT: 0, burnT: 0, burnDps: 0, burnTick: 0,
          hitFlash: 0, dead: false, x: 0, y: 0, _tx: 0, _ty: 0, _fresh: true };
        enemies.push(e); byId.set(e.id, e);
      }
      e.type = h[1]; e.r = h[2]; e.maxHp = h[3]; e.boss = !!h[4]; e.color = h[5];
      e.team = h[6] ? "p" : "e";
      e.owner = h[7] >= 0 ? players[h[7]] : null;
      if (e.boss) { e.graves = e.graves || []; e.vents = e.vents || []; e.meteors = e.meteors || [];
        e.cracks = e.cracks || []; e.marks = e.marks || []; e.wells = e.wells || []; }
    }
    const seen = new Set();
    for (const row of s.en) {
      const e = byId.get(row[EF.ID]);
      if (!e) continue;                       // row before its head — next snapshot fixes it
      seen.add(row[EF.ID]);
      const tx = row[EF.X], ty = row[EF.Y];
      /* the authoritative position becomes the TARGET; _cosmeticWorld advances
         and chases it every frame so motion is continuous between snapshots */
      if (e._fresh) { e.x = tx; e.y = ty; e._fresh = false; }
      e._tx = tx; e._ty = ty;
      e.vx = row[EF.VX]; e.vy = row[EF.VY];
      e.hp = row[EF.HP];
      const f = row[EF.FLAGS];
      e.ghost = !!(f & EFLAG.GHOST); e.buffed = !!(f & EFLAG.BUFFED); e.wrath = !!(f & EFLAG.WRATH);
      e.rime = !!(f & EFLAG.RIME); e.sear = !!(f & EFLAG.SEAR); e.ambush = !!(f & EFLAG.AMBUSH);
      e.noclip = !!(f & EFLAG.NOCLIP); e.airLeap = !!(f & EFLAG.AIRLEAP);
      e.spawnT = row[EF.SPAWNT]; e.hitFlash = row[EF.HITF];
      e.slowT = row[EF.SLOWT]; e.burnT = row[EF.BURNT]; e.fearT = row[EF.FEART];
      e.slowMul = e.slowT > 0 ? (e.boss ? 0.7 : 0.45) : 1;
      const extra = row[12];                  // per-archetype telegraph state, when present
      if (extra) for (const k in extra) e[k] = extra[k];
    }
    /* the boss rides as a keyed object — one entity, and its telegraphs are fiddly */
    if (s.boss) {
      const b = byId.get(s.boss.id);
      if (b) {
        for (const k in s.boss) {
          if (k === "x" || k === "y" || k === "id") continue;
          b[k] = s.boss[k];
        }
        b._tx = s.boss.x; b._ty = s.boss.y;
        if (b._fresh) { b.x = s.boss.x; b.y = s.boss.y; b._fresh = false; }
        seen.add(b.id);
        Game.boss = b;
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!seen.has(enemies[i].id)) enemies.splice(i, 1);   // death FX arrive via the kill event
    }
    if (g.bossId === 0) Game.boss = null;

    /* one-shot spawns: enemy bullets + partner bullets → guest-local cosmetic sim */
    for (const b of s.eb)
      ebullets.push({ x: b[0], y: b[1], vx: b[2], vy: b[3], r: b[4], dmg: 0, t: 0, color: b[5], homing: b[6] });
    for (const b of s.bn)
      bullets.push({ x: b[0], y: b[1], vx: b[2], vy: b[3], r: b[4], dmg: 0, t: 0, life: b[5],
        pierce: 0, bounce: 0, homing: 0, venom: b[6], ember: b[7], frost: b[8], storm: 0,
        execute: 0, knock: 0, pet: !!(b[9] & 1), shard: !!(b[9] & 2), cosmetic: true });

    /* puddles: static head once, then just id + age */
    const puById = new Map();
    for (const pu of puddles) if (pu.id) puById.set(pu.id, pu);
    for (const h of s.punew) {
      let pu = puById.get(h[0]);
      if (!pu) { pu = { id: h[0], tickMap: {}, team: "e", dmg: 0, t: 0 }; puddles.push(pu); puById.set(pu.id, pu); }
      pu.x = h[1]; pu.y = h[2]; pu.r = h[3]; pu.color = h[4];
      pu.lava = !!(h[5] & 1); pu.water = !!(h[5] & 2); pu.vortex = !!(h[5] & 4);
      pu.phase = !!(h[5] & 8); pu.slime = !!(h[5] & 16);
      pu.life = h[6] === -1 ? Infinity : h[6];
    }
    const puSeen = new Set();
    for (const row of s.pu) {
      puSeen.add(row[0]);
      const pu = puById.get(row[0]);
      if (pu) pu.t = row[1];
    }
    for (let i = puddles.length - 1; i >= 0; i--) if (!puSeen.has(puddles[i].id)) puddles.splice(i, 1);

    /* mines/shells: authoritative copies EXCEPT the guest's own (locally predicted) */
    mines = mines.filter(m => m.owner === localPlayer());
    for (const o of s.mn) if (o.o !== Net.localIdx)
      mines.push({ x: o.x, y: o.y, r: 11, t: o.t, life: o.life, armT: o.armT, pulse: o.pulse });
    shells = shells.filter(m => m.owner === localPlayer());
    for (const o of s.sh) if (o.o !== Net.localIdx)
      shells.push({ sx: o.sx, sy: o.sy, x: o.x, y: o.y, lx: o.lx, ly: o.ly, t: o.t, T: o.T, r: o.r, dmg: 0, hitSet: new Set() });

    /* pets snap to their owner-relative orbits */
    for (let i = 0; i < s.pets.length; i++) {
      const o = s.pets[i];
      let pt = pets[i];
      if (!pt || pt.type !== o.type) {
        pets.length = 0;
        for (const q of s.pets) pets.push(Object.assign(spawnPet(q.type, players[q.o] || players[0]), { x: q.x, y: q.y }));
        break;
      }
      pt._tx = o.x; pt._ty = o.y;
      if (pt._fresh === undefined) { pt.x = o.x; pt.y = o.y; pt._fresh = false; }
      pt.orbA = o.orbA; pt.block = o.block;
    }

    /* chests / health boxes / pickups / portal */
    for (const [id, state] of s.ch) { const c = chests.find(c => c.id === id); if (c) c.state = state; }
    for (const [id, state] of s.hb) { const h = healthBoxes.find(h => h.id === id); if (h) h.state = state; }
    const pkSeen = new Set(s.pk.map(k => k[0]));
    for (let i = pickups.length - 1; i >= 0; i--) if (!pkSeen.has(pickups[i].id)) pickups.splice(i, 1);
    for (const [id, x, y] of s.pk) if (!pickups.find(k => k.id === id)) pickups.push({ id, x, y, r: 20, ids: null, t: 0 });
    portal = s.po ? Object.assign(portal || {}, { x: s.po.x, y: s.po.y, r: 46, t: s.po.t }) : null;

    /* terrain reconciliation */
    if (s.rk) {
      const have = new Set(MAP.rocks.map(rc => rc.id));
      const want = new Set(s.rk.map(rc => rc.id));
      for (let i = MAP.rocks.length - 1; i >= 0; i--) if (!want.has(MAP.rocks[i].id)) MAP.rocks.splice(i, 1);
      for (const rc of s.rk) if (!have.has(rc.id)) MAP.rocks.push(rc);
    }

    /* the host's floaters replay verbatim — damage numbers, callouts, all of it */
    for (const f of s.fx) floatText(f.x, f.y, f.txt, f.color, f.size, f.opt);

    /* =========================================================
       HUD, only when it actually moved.

       These three were called unconditionally on every packet. That is a dozen
       times a second, every second of a co-op run, and they are not cheap:
       updateHp() runs a document.querySelector and rewrites four elements,
       updateSeals() filters the health-box array, and updateScore() forces a
       synchronous reflow (`void offsetWidth`) and then RESTARTS a
       requestAnimationFrame tween that writes textContent every frame until it
       lands. The tween never got to finish before the next packet restarted it,
       so the guest carried a permanent extra rAF loop plus a reflow storm —
       felt as general co-op jank rather than anything nameable. Gate them on a
       cheap signature and they fire only on real change.
       ========================================================= */
    const me = localPlayer(), mate = players.find(o => o !== me);
    const hpSig = (me ? me.hp + "/" + me.maxHp + "/" + me.shield : "-") + "|" +
                  (mate ? mate.hp + "/" + mate.maxHp + "/" + (mate.downed ? 1 : 0) : "-");
    if (hpSig !== this._uiHp) { this._uiHp = hpSig; updateHp(); }
    if (Game.score !== this._uiScore) { this._uiScore = Game.score; updateScore(); }
    const sealSig = Game.chestsOpened + "/" + Game.chestsTotal + "/" +
                    (healthBoxes ? healthBoxes.length : 0) + "/" +
                    (healthBoxes ? healthBoxes.reduce((n, h) => n + (h.state === "sealed" ? 1 : 0), 0) : 0);
    if (sealSig !== this._uiSeal) { this._uiSeal = sealSig; updateSeals(); }
  },
};
