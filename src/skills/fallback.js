// Generic fallback effect (CONTRACT §7.2 step 3, last resort; rule 11). Used only when neither a bespoke impl, a legacy
// path nor any archetype implementation (melee or caster) is registered — e.g. before magic/melee land, or with spells
// stubbed. It keeps every skill usable: damage + statuses in the archetype's footprint, buff/heal sources, and a simple
// pooled VFX call. Logged once per archetype/family by the runtime. Never scales damage (combat.dealDamage does, §8.3).
import * as THREE from 'three';

const SELF = new Set(['nova', 'buff', 'leapslam', 'summon', 'dash', 'blink']);
const LINE = new Set(['crawler', 'dash', 'blink', 'lane', 'tether', 'beam']);
const DEF_DUR = { burning: 4, wet: 8, chilled: 4, frozen: 2.5, shocked: 5, stunned: 1, encrusted: 6, seeded: 8, radiant: 10, corroded: 8,
  dazzled: 3, rooted: 2, hexed: 10, marked: 6 };

/** Base damage of a param block at charge 0..1 (unscaled). */
export function baseDamage(p, charge = 1) {
  if (!p) return 0;
  if (p.dmgMin != null && p.dmgMax != null) return p.dmgMin + (p.dmgMax - p.dmgMin) * Math.max(0, Math.min(1, charge ?? 1));
  return p.dmg ?? p.implode?.dmg ?? p.popDmg ?? p.orb?.dmg ?? p.slam?.dmg ?? p.burst?.dmg ?? p.bloom?.dmg ?? p.tick ?? 0;
}

export function createFallback(game) {
  const center = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const hits = [], scratch = [];
  const combatV3 = () => !!(game.combat?.STATUS_DEFS || game.combat?.REACTION_DEFS);

  /** Apply a {name:{dur,stacks}|seconds} status block, compatible with the v2 combat (seconds only). */
  function applyStatuses(t, status, el) {
    const C = game.combat; if (!status || !C?.applyStatus) return;
    for (const name in status) {
      const v = status[name];
      const dur = typeof v === 'number' ? v : (v?.dur ?? DEF_DUR[name] ?? 4);
      const stacks = typeof v === 'object' && v ? (v.stacks || 0) : 0;
      try {
        if (combatV3()) C.applyStatus(t, name, dur, { stacks: stacks || undefined, source: game.player?.entity || 'player', el });
        else { const n = Math.max(1, Math.min(6, stacks || 1)); for (let i = 0; i < n; i++) C.applyStatus(t, name, dur); }
      } catch (_) { /* */ }
    }
  }

  function playerPos(out) {
    const p = game.player?.object?.position || game.player?.entity?.object?.position;
    return p ? out.copy(p) : out.set(0, 0, 0);
  }

  /** Run the generic effect for ctx (runtime-built). Returns true when something happened. */
  function run(ctx) {
    const p = ctx.params || {}, def = ctx.def, a = def.archetype || (def.slot === 'finisher' ? 'nova' : 'projectile');
    const S = game.stats; let did = false;
    // stat / heal effects
    if (a === 'buff' || p.buff) {
      const mods = a === 'buff' ? (p.mods || p.buff || {}) : p.buff;
      try { S?.set?.('buff:' + ctx.skillId, mods, { duration: p.dur || 8 }); did = true; } catch (_) { /* */ }
    }
    // "next hit" riders (consumed by procs.js on the first player hit): shadow.step, wind.step, shadow.sup
    const rider = p.nextCrit ? { critChance: 1, critMul: (p.nextCrit.mul || 1.5) - 1 } : p.nextHit ? { atkMul: p.nextHit.mul || 1.3 } : p.firstHit ? { atkMul: p.firstHit.mul || 1.5, critChance: p.firstHit.crit ? 1 : 0 } : null;
    if (rider && a === 'buff' && p.mods) Object.assign(rider, p.mods);
    if (rider) { try { S?.set?.('buff:' + ctx.skillId, rider, { duration: p.nextCrit?.window || p.nextHit?.window || p.dur || 3 }); did = true; } catch (_) { /* */ } }
    const heal = (p.healPct || 0) + (p.hotPct || 0) + (p.shieldPct ? 0 : 0);
    if (heal > 0 && game.player) {
      const mx = game.player.maxHp || game.player.entity?.maxHp || 100;
      try {
        if (game.combat?.healPlayer) game.combat.healPlayer(mx * heal, 'skill:' + ctx.skillId, { hot: true });
        else { game.player.hp = Math.min(mx, (game.player.hp || 0) + mx * heal); if (game.player.entity) game.player.entity.hp = game.player.hp; }
      } catch (_) { /* */ }
      did = true;
    }
    // footprint
    const aim = ctx.aim;
    if (SELF.has(a) || def.slot === 'finisher') playerPos(center);
    else if (aim?.target?.object) center.copy(aim.target.object.position);
    else if (aim?.point) {
      playerPos(tmp);
      center.copy(aim.point);
      const range = p.range || p.len || p.dist || 22;
      dir.subVectors(center, tmp); dir.y = 0;
      const L = dir.length();
      if (L > range) center.copy(tmp).addScaledVector(dir, range / L);
    } else playerPos(center).z -= 4;
    if (a === 'cone' && aim?.dir) { playerPos(center); dir.copy(aim.dir); dir.y = 0; dir.normalize(); center.addScaledVector(dir, (p.len || 6) * 0.5); }
    const isLine = LINE.has(a) && !!aim?.dir;
    let lineLen = 0;
    if (isLine) {
      playerPos(center); dir.copy(aim.dir); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
      lineLen = Math.min(p.dist || p.len || 10, 30);
    }
    const gy = game.world?.getHeight?.(center.x, center.z);
    center.y = (Number.isFinite(gy) ? gy : center.y) + 0.9;
    const amount = baseDamage(p, ctx.charge) * (p.lashes || 1);
    const r = isLine ? Math.max(1.6, p.width || p.r || 1.6)
      : (p.r || p.popR || p.zapR || p.orb?.zapR || p.tauntR || (a === 'cone' ? (p.len || 6) * 0.55 + 1 : SELF.has(a) ? 5 : 3.2));
    const C = game.combat;
    if (amount > 0 && C?.queryRadius && C?.dealDamage) {
      hits.length = 0;
      try {
        if (isLine) {
          const steps = Math.max(1, Math.ceil(lineLen / 2));
          for (let k = 0; k <= steps; k++) {
            tmp.copy(center).addScaledVector(dir, (k / steps) * lineLen);
            C.queryRadius(tmp, r, 'enemy', scratch);
            for (const e of scratch) if (!hits.includes(e)) hits.push(e);
          }
        } else C.queryRadius(center, Math.min(r, 16), 'enemy', hits);
      } catch (_) { hits.length = 0; }
      const maxN = a === 'mark' || a === 'bubble' ? (p.r ? 12 : 1) : a === 'chainbind' ? (p.n || 4) : a === 'chain' ? (p.n || 3) : 24;
      let n = 0;
      for (let i = 0; i < hits.length && n < maxN; i++) {
        const e = hits[i]; if (!e?.alive || e.team === 'player') continue;
        n++;
        const hit = ctx.hit({ amount, point: e.object.position.clone().setY(e.object.position.y + (e.height || 1.6) * 0.5),
          knockback: p.knockback || 0, launch: p.launch || 0, status: combatV3() ? p.status : undefined, poise: p.poise ?? p.break });
        try { C.dealDamage(e, hit); } catch (err) { /* logged by runtime */ }
        if (!combatV3()) applyStatuses(e, p.status, ctx.element);
        did = true;
      }
    }
    if (isLine) center.addScaledVector(dir, lineLen * 0.5);
    // presentation (pooled vfx; feature-detected)
    try {
      const V = game.vfx;
      if (V) {
        if (amount > 0 && r > 3.5) V.explosion?.(center, { element: ctx.element, scale: Math.min(2, r / 4) });
        else V.impact?.(center, { element: ctx.element });
      }
    } catch (_) { /* */ }
    return did || amount > 0;
  }
  return { run, applyStatuses, baseDamage };
}
