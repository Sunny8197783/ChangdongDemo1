// CASTER implementations of all 24 archetypes (CONTRACT §7.3, DESIGN §6.14), registered in the spells FACTORY with
// game.archetypes.registerArchetype(name, 'caster', fn). Each reads ctx.params only (already merged with modifiers by
// skills.effectiveParams), builds hits with ctx.hit({...}) (skillId/slot/tier/castMul), passes UNSCALED base damage
// (combat scales, §8.3) and never calls hitFeel/hitstop per hit. Presentation: bow = arrows from the string, totem = wisps,
// hammer radius ×1.2 / speed ×0.85, daggers radius ×0.85 / speed ×1.25 (when a melee class falls back to the caster form).
// Every active also does its world "twist" (DESIGN §13.1): terrain, surfaces, objects, platforms, colliders, updrafts.
import * as THREE from 'three';
import { glint } from './palette.js';
import { elColor, elDef } from '../core/elements.js';
import { fresnelMat } from './assets.js';

const OPTIONAL_FX = new Set(['groundDecal', 'runeCircle', 'flashSprite', 'dome', 'debris']);

export const ARCHETYPES = ['projectile', 'volley', 'lob', 'crawler', 'beam', 'cone', 'nova', 'zone', 'wall', 'pillar', 'chain', 'rain',
  'summon', 'blink', 'dash', 'leapslam', 'grapple', 'buff', 'mark', 'chainbind', 'tether', 'lane', 'mine', 'bubble'];

const STYLE = { hammer: { r: 1.2, v: 0.85 }, daggers: { r: 0.85, v: 1.25 } };
const UP = new THREE.Vector3(0, 1, 0);
const SELF_ZONES = new Set(['spring', 'holy', 'rain', 'flood', 'overgrowth']);
const shape = (el) => elDef(el)?.shapes?.[0] || 'spark';

/** Base damage of a param block at charge 0..1 (unscaled; mirrors skills' baseDamage). */
export function baseOf(p, charge = 1) {
  if (!p) return 0;
  if (p.dmgMin != null && p.dmgMax != null) return p.dmgMin + (p.dmgMax - p.dmgMin) * Math.max(0, Math.min(1, charge ?? 1));
  return p.dmg ?? p.implode?.dmg ?? p.popDmg ?? p.orb?.dmg ?? p.slam?.dmg ?? p.burst?.dmg ?? p.bloom?.dmg ?? p.tick ?? 0;
}

export function createArchetypes(S, api, { summons, structures }) {
  const { game } = S;
  const E = game.events;
  const L = S.looks;   // v4 look engine (gate, hooks, cast context)
  // effectQuality 'low' drops the secondary visuals (decals, rune circles, flares, domes, debris): ≤ 10 extra calls per cast (§23)
  const fx = (n, ...a) => { if (OPTIONAL_FX.has(n) && game.settings?.values?.effectQuality === 'low') return null; try { return L ? L.fx(n, a) : game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  /** Run fn with the cast context of record r (deferred per-frame work of a cast). */
  const inCtx = (r, fn) => { if (!L || !r?.cur) return fn(); const p = L.swap(r.cur); try { return fn(); } finally { L.swap(p); } };
  const C = () => S.combat;   // shim: stamps the cast castId on every hit
  const pl = () => game.player;
  const ppos = () => pl()?.object?.position || S.playerPos();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
  const near = [];
  const movers = [], tethers = [], binds = [], bubbles = [], fields = [];
  let iframeUntil = 0, iframeMine = false;

  // ---------------- ctx helpers ----------------
  const P = (ctx) => ctx.params || {};
  const sty = (ctx) => STYLE[ctx.style] || null;
  const rMul = (ctx) => (ctx.meleeFallback || ctx.family === 'melee' ? sty(ctx)?.r || 1 : 1);
  const vMul = (ctx) => (ctx.meleeFallback || ctx.family === 'melee' ? sty(ctx)?.v || 1 : 1);
  const dmgOf = (ctx) => (typeof ctx.baseDamage === 'function' ? ctx.baseDamage() : baseOf(P(ctx), ctx.charge));
  function H(ctx, extra) {
    const p = P(ctx);
    const base = { amount: dmgOf(ctx), element: ctx.element, status: p.status ? cloneStatus(p.status) : undefined, knockback: p.knockback || 0, launch: p.launch || 0 };
    if (ctx.castId != null) base.castId = ctx.castId;
    if (extra) Object.assign(base, extra);
    if (p.knockdown) base.knockback = Math.max(base.knockback || 0, 7);
    if (p.break || p.poise) base.poise = p.break || p.poise;
    const h = typeof ctx.hit === 'function' ? ctx.hit(base) : Object.assign(base, { source: game.player?.entity || 'player', tier: 'heavy' });
    if (!h.source) h.source = game.player?.entity || 'player';
    return h;
  }
  const cloneStatus = (s) => { const o = {}; for (const k in s) o[k] = typeof s[k] === 'object' ? { ...s[k] } : s[k]; return o; };
  const colOf = (el, part = 'mid') => elColor(el, part);
  function fwd(ctx, out = v1) {
    const d = ctx.aim?.dir; out.set(d ? d.x : 0, 0, d ? d.z : 1);
    if (out.lengthSq() < 1e-6) { const f = pl()?.object?.rotation?.y || 0; out.set(Math.sin(f), 0, Math.cos(f)); }
    return out.normalize();
  }
  /** Aim point clamped to range from the player, snapped to the ground. Melee fallback: `meleeRange` in front. */
  function aimPoint(ctx, range = 22, out = v2) {
    const p = P(ctx), pp = ppos();
    if ((ctx.meleeFallback || ctx.family === 'melee') && p.meleeRange) { fwd(ctx, v5); out.copy(pp).addScaledVector(v5, p.meleeRange); }
    else if (ctx.aim?.target?.alive && ctx.aim.target.object) out.copy(ctx.aim.target.object.position);
    else if (ctx.aim?.point) out.copy(ctx.aim.point);
    else { fwd(ctx, v5); out.copy(pp).addScaledVector(v5, Math.min(range, 10)); }
    v5.subVectors(out, pp); v5.y = 0;
    const L = v5.length();
    if (L > range) out.copy(pp).addScaledVector(v5, range / L);
    out.y = S.height(out.x, out.z);
    return out;
  }
  function targetOf(ctx, range = 22) {
    const t = ctx.aim?.target;
    if (t?.alive && t.team !== 'player' && t.object && t.object.position.distanceTo(ppos()) <= range + 2) return t;
    // nearest enemy in front within range
    let best = null, bs = -Infinity;
    const f = fwd(ctx, v5), pp = ppos();
    for (const e of game.entities) {
      if (!e.alive || e.team !== 'enemy' || !e.object || e.isProp) continue;
      const dx = e.object.position.x - pp.x, dz = e.object.position.z - pp.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.1) continue;
      const s = (dx * f.x + dz * f.z) / d * 2 - d / range;
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }
  const center = (e, out) => (C()?.getCenter ? C().getCenter(e, out) : out.copy(e.object.position).setY(e.object.position.y + 1));
  function meshFor(ctx, def) {
    if (ctx.style === 'bow') return 'arrow';
    if (ctx.style === 'totem' && (!def || def === 'orb' || def === 'fireball')) return 'wisp';
    if (def === 'lance' && ctx.element !== 'ice') return 'glance';
    if (def) return def;
    switch (ctx.element) {
      case 'fire': return 'fireball';
      case 'ice': return 'shard';
      case 'wind': return 'blade';
      case 'earth': return 'rock';
      case 'water': return 'bubble';
      case 'nature': return 'thorn';
      case 'light': return 'glance';
      case 'shadow': return 'shadowbolt';
      default: return 'orb';
    }
  }
  /** Cast flourish at the weapon tip (bow: string flash, totem: spirit swirl, staff: gem burst). */
  function castFx(ctx, k = 1) {
    const el = ctx.element, o = ctx.origin || v3.copy(ppos()).setY(ppos().y + 1.5);
    if (L?.on()) { L.castFx(o, { el, k }); return; }
    const c1 = colOf(el, 'core'), c2 = colOf(el, 'mid');
    if (ctx.style === 'bow') {
      fx('burst', o, { count: Math.round(10 * k), shape: 'spark', color: [glint(c2), c2], dir: fwd(ctx, v4), spread: 0.25, speed: 6, size: 0.08, life: 0.22, drag: 3, velocityStretch: true });
    } else if (ctx.style === 'totem') {
      fx('burst', o, { count: Math.round(12 * k), shape: 'wisp', color: [c1, c2], radius: 0.4, tangential: 4, up: 1.2, speed: 0.6, size: 0.2, sizeEnd: 0.05, life: 0.5 });
    } else {
      fx('burst', o, { count: Math.round(14 * k), shape: shape(el), color: [c1, c2], speed: 3.5, spread: 1, size: 0.14, life: 0.35, drag: 2.5 });
    }
    fx('flashSprite', o, c2, 1.2 * k, 0.12, 0.7);
  }
  function impactFx(el, p, scale = 1, big = false) {
    if (L?.on()) { L.impact(p, { el, scale, big }); return; }
    fx('preset', (big ? 'explosion_' : 'impact_') + el, p, { scale });
  }
  function sfx(name, pos, o) { S.sfx(name, Object.assign({ position: pos }, o || {})); }
  function grantIframes(t) {
    const p = pl(); if (!p?.entity || !(t > 0)) return;
    if (typeof p.grantIframes === 'function') { try { p.grantIframes(t); return; } catch (_) { /* */ } }
    if (!p.entity.invulnerable) { p.entity.invulnerable = true; iframeMine = true; }
    iframeUntil = Math.max(iframeUntil, (game.time || 0) + t);
  }
  function statsSet(id, mods, dur) { try { game.stats?.set?.(id, mods, { duration: dur }); return true; } catch (_) { return false; } }
  function heal(frac, src = 'skill') { const mx = pl()?.maxHp || 100; try { return C()?.healPlayer?.(mx * frac, src, { hot: true }) || 0; } catch (_) { return 0; } }
  function status(e, name, dur, stacks, el) { try { C()?.applyStatus?.(e, name, dur, { stacks: stacks || undefined, source: game.player?.entity || 'player', el }); } catch (_) { /* */ } }
  function enemiesNear(pos, r, out = near) { out.length = 0; try { C()?.queryRadius?.(pos, r, '!player', out); } catch (_) { out.length = 0; } for (let i = out.length - 1; i >= 0; i--) if (!out[i]?.alive || out[i].isProp) out.splice(i, 1); return out; }
  const isSmall = (e) => !e.isBoss && !e.isBossPart && (e.maxHp || 100) < 600;
  function pull(e, to, strength) {
    if (!e?.velocity || e.isBoss) return;
    v4.subVectors(to, e.object.position); v4.y = 0; const L = v4.length(); if (L < 0.4) return;
    e.velocity.addScaledVector(v4.multiplyScalar(1 / L), Math.min(16, strength));
  }
  /** Elderwood rot walls within r of p (world.rotWalls; feature-detected). */
  function rotWallsNear(p, r, fn) {
    const list = game.world?.rotWalls; if (!Array.isArray(list)) return;
    for (const w of list) {
      if (!w?.position || w.state !== 'intact') continue;
      const d = Math.hypot(w.position.x - p.x, w.position.z - p.z);
      if (d <= r + (w.span || 4) * 0.5) { try { fn(w); } catch (_) { /* */ } }
    }
  }
  function sightLoss(e, mul, dur) {
    try { if (game.enemies?.setSightMul) { game.enemies.setSightMul(e, mul, dur); return; } } catch (_) { /* */ }
    e.sightMul = mul; e.sightMulUntil = (game.time || 0) + dur;
  }

  // ---------------- movers (dash / blink / leap / grapple) ----------------
  /** Move the player along a path over `dur` (game time); arc: peak height; onStep(pos, k); onEnd(). */
  function move(from, to, dur, { arc = 0, onStep, onEnd, trailEl } = {}) {
    const m = { a: from.clone(), b: to.clone(), t: 0, dur: Math.max(0.05, dur), arc, onStep, onEnd, emitter: null, cur: L?.cur || null };
    const obj = pl()?.object;
    if (trailEl && obj) m.emitter = fx('emitter', { follow: obj, offset: new THREE.Vector3(0, 1, 0), rate: 70, color: [colOf(trailEl, 'core'), colOf(trailEl, 'mid')], shape: shape(trailEl), speed: 1.2, spread: 1, size: 0.2, sizeEnd: 0, life: 0.45, drag: 2, radius: 0.4 });
    movers.push(m);
    return m;
  }
  function updateMovers(dt) {
    const p = pl();
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      v1.lerpVectors(m.a, m.b, e);
      const gy = S.height(v1.x, v1.z);
      if (m.arc > 0) v1.y = Math.max(gy, THREE.MathUtils.lerp(m.a.y, m.b.y, e)) + Math.sin(Math.PI * e) * m.arc;
      else v1.y = Math.max(gy, v1.y);
      try { p?.teleport?.(v1, m.arc <= 0); if (p?.entity?.velocity) p.entity.velocity.set(0, 0, 0); } catch (_) { /* */ }
      try { inCtx(m, () => m.onStep?.(v1, k)); } catch (err) { warn('move.step', err); }
      if (k >= 1) {
        movers.splice(i, 1);
        try { m.emitter?.stop?.(); } catch (_) { /* */ }
        try { p?.teleport?.(v1.set(m.b.x, S.height(m.b.x, m.b.z), m.b.z), true); } catch (_) { /* */ }
        try { inCtx(m, () => m.onEnd?.()); } catch (err) { warn('move.end', err); }
      }
    }
  }
  const warned = new Set();
  function warn(k, err) { if (!warned.has(k)) { warned.add(k); console.warn('[spells.archetypes]', k, err?.message || err); } }
  /** Destination along dir up to dist, stopping before world colliders (resolveCollision snaps it out). */
  function dashTarget(dir, dist, out = v3) {
    const pp = ppos();
    out.copy(pp).addScaledVector(dir, dist);
    try { game.world?.clampToBounds?.(out); } catch (_) { /* */ }
    out.y = S.height(out.x, out.z);
    return out;
  }

  // =====================================================================================================
  const A = {};

  // 1. projectile — a single bolt / arrow / wisp / lance
  A.projectile = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const o = ctx.origin.clone();
    const tgt = ctx.aim?.target?.alive ? ctx.aim.target : null;
    const dir = new THREE.Vector3();
    if (tgt) dir.subVectors(center(tgt, v1), o).normalize();
    else dir.copy(ctx.aim?.dir || fwd(ctx, v1)).normalize();
    const speed = (p.speed || 30) * vMul(ctx);
    const range = p.len || p.range || 40;
    const mesh = meshFor(ctx, p.mesh);
    const big = (p.r || 0) >= 1.5;
    const shots = p.split || 1;
    castFx(ctx, p.dmg > 50 ? 1.6 : 1);
    sfx('cast_' + el, o, { volume: 0.8 });
    for (let s = 0; s < shots; s++) {
      const d = dir.clone();
      if (shots > 1) d.applyAxisAngle(UP, ((s / (shots - 1)) - 0.5) * 0.45);
      const hit = H(ctx, shots > 1 ? { amount: dmgOf(ctx) * (p.splitMul || 0.5) } : null);
      let first = true;
      const isSpear = !!p.pillar;
      S.projectiles.spawn({
        kind: 'skill', element: el, mesh: isSpear && mesh !== 'arrow' ? 'spear' : mesh, pos: o, dir: d, speed, radius: p.r && !big ? p.r * 0.5 : (mesh === 'shadowbolt' ? 0.6 : 0.42),
        scale: isSpear ? 1.1 : mesh === 'arrow' ? 1.1 : mesh === 'shadowbolt' ? 0.9 : 1, damage: hit.amount, life: range / speed, pierce: !!p.pierce, homing: p.homing ? p.homing * 10 : 0, target: tgt,
        status: hit.status, knockback: hit.knockback, launch: hit.launch, hit, tier: hit.tier, bounce: p.bounce || 0, heavy: ctx.def?.slot === 'charged',
        trailWidth: mesh === 'arrow' ? 0.12 : isSpear ? 0.5 : 0.3, trailLength: isSpear ? 22 : 12,
        emitter: { rate: isSpear ? 60 : 24, color: [colOf(el, 'core'), colOf(el, 'mid')], shape: shape(el), speed: 0.8, spread: 1, size: isSpear ? 0.3 : 0.14, sizeEnd: 0, life: 0.35, drag: 2 },
        data: { aoe: big ? p.r : 1.4 },
        onHitEntity(pr, e) {
          if (first && p.firstRadiant) status(e, 'radiant', 10, p.firstRadiant, 'light');
          first = false;
          impactFx(el, pr.pos, 0.7);
        },
        onUpdate: p.orb ? (pr, dt) => orbZap(ctx, pr, dt) : null,
        onImpact(pr, pos) {
          if (big) { api.aoe(pos, p.r * rMul(ctx), hit); impactFx(el, pos, p.r / 3, true); }
          else impactFx(el, pos, 0.8);
          if (isSpear) lightPillar(ctx, pos);
          sfx('impact_' + el, pos, { volume: 0.6 });
        },
        onExpire(pr, pos) { if (isSpear) lightPillar(ctx, pos); },
      });
    }
    return true;
  };
  function orbZap(ctx, pr, dt) {
    const p = P(ctx), orb = p.orb || {};
    pr.data.zapT = (pr.data.zapT ?? 0.2) - dt;
    if (pr.data.zapT > 0) return;
    pr.data.zapT = orb.every || 0.5;
    const e = api.nearestEnemy(pr.pos, orb.zapR || 6);
    if (!e) return;
    const to = center(e, new THREE.Vector3());
    fx('beam', pr.pos.clone(), to, { color: colOf(ctx.element), width: 0.12, duration: 0.18, jagged: 0.6, segments: 8, branches: 1 });
    api.deal(e, api.makeHit(H(ctx, { amount: orb.dmg || 10, tier: 'light' }), e, pr.pos, 0));
    sfx('impact_lightning', to, { volume: 0.35 });
  }
  function lightPillar(ctx, pos) {
    const pp = P(ctx).pillar; if (!pp) return;
    if (ctx._pillarDone) return; ctx._pillarDone = true;
    const g = v3.set(pos.x, S.height(pos.x, pos.z), pos.z);
    summons.spawn('lightpillar', g, { life: pp.life || 6, blessR: pp.blessR || 3, skillId: ctx.skillId, element: 'light' });
    fx('preset', 'explosion_light', g.clone().setY(g.y + 1), { scale: 1 });
  }

  // 2. volley — N spread shots (bounce, ravens)
  A.volley = (ctx) => {
    const p = P(ctx), el = ctx.element, n = Math.max(1, p.n || 3);
    const o = ctx.origin.clone();
    const tgt = ctx.aim?.target?.alive ? ctx.aim.target : null;
    const dir = new THREE.Vector3();
    if (tgt) dir.subVectors(center(tgt, v1), o).normalize(); else dir.copy(ctx.aim?.dir || fwd(ctx, v1)).normalize();
    const spread = THREE.MathUtils.degToRad(p.spread || 10);
    const mesh = meshFor(ctx, p.mesh);
    const speed = (p.speed || 30) * vMul(ctx), range = p.len || 30;
    const hit = H(ctx);
    castFx(ctx, 1 + n * 0.1);
    sfx('cast_' + el, o, { volume: 0.7 });
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : (i / (n - 1)) - 0.5;
      const d = dir.clone().applyAxisAngle(UP, k * spread);
      if (mesh === 'raven') d.y += (Math.random() - 0.3) * 0.25;
      const fire = () => S.projectiles.spawn({
        kind: 'skill', element: el, mesh, pos: o, dir: d, speed: speed * (0.92 + Math.random() * 0.16), radius: mesh === 'raven' ? 0.7 : 0.38, scale: mesh === 'bubble' ? 0.8 : 1,
        damage: hit.amount, life: range / speed, pierce: !!p.pierce, homing: mesh === 'raven' ? 4 : 0, target: tgt, status: hit.status, knockback: hit.knockback, hit, tier: hit.tier,
        bounce: p.bounce || 0, trail: mesh !== 'raven', trailWidth: 0.12, trailLength: 7, ignoreGround: mesh === 'raven',
        onHitEntity(pr, e) {
          if (p.sightMul) sightLoss(e, p.sightMul, p.sightDur || 3);
          impactFx(el, pr.pos, 0.5);
        },
        onUpdate: p.carryMist ? (pr) => { if (!pr.data.mist && api.zones.isInside('miasma', pr.pos)) pr.data.mist = 1; if (pr.data.mist && (pr.data.mistAt = (pr.data.mistAt || 0) + 1) % 12 === 0) api.zones.spawn('miasma', pr.pos, { r: 2.5, dur: 5 }); } : null,
        onImpact(pr, pos) { impactFx(el, pos, 0.6); },
      });
      if (i === 0 || mesh !== 'raven') fire(); else S.later(i * 0.035, fire);
    }
    return true;
  };

  // 3. lob — arc + land effect (ember, seed bomb, pod scatter)
  A.lob = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const o = ctx.origin.clone();
    const to = aimPoint(ctx, p.range || 20, new THREE.Vector3());
    const g = 26;
    const dist = Math.hypot(to.x - o.x, to.z - o.z);
    const T = Math.max(0.4, Math.min(1.1, dist / 17)) / vMul(ctx);
    const vel = new THREE.Vector3((to.x - o.x) / T, (to.y + 0.2 - o.y + 0.5 * g * T * T) / T, (to.z - o.z) / T);
    const speed = vel.length();
    const hit = H(ctx);
    const r = (p.r || 3) * rMul(ctx);
    const mesh = ctx.style === 'bow' ? 'arrow' : p.pods ? 'orb' : el === 'fire' ? 'fireball' : meshFor(ctx, null);
    castFx(ctx, 1.2);
    sfx('cast_' + el, o, { pitch: 0.9 });
    fx('telegraph', { shape: 'circle', pos: to.clone(), r, dur: T, color: 'damage' });
    let landed = false;
    const land = (pos) => {
      if (landed) return; landed = true;
      const gp = v3.set(pos.x, S.height(pos.x, pos.z), pos.z).clone();
      api.aoe(gp.clone().setY(gp.y + 0.5), r, hit);
      impactFx(el, gp.clone().setY(gp.y + 0.4), r / 3, r >= 3);
      fx('shockwave', gp.clone().setY(gp.y + 0.1), { color: colOf(el), radius: r, duration: 0.4, thickness: 0.35 });
      if (p.ignite) {
        api.terrain.ignite(gp, r, 1);
        rotWallsNear(gp, r, (w) => game.world?.burnRotWall?.(w.id));
        if (p.igniteProps) for (const e of enemiesNear(gp, r, [])) if (e.isProp) api.deal(e, api.makeHit({ amount: 5, element: 'fire', tier: 'light' }, e, gp, 0));
        fx('groundDecal', 'scorch', gp, r, 8);
      }
      if (p.zone) api.zones.spawn(p.zone.type, gp, { radius: r, duration: p.zone.dur || 4, r, dur: p.zone.dur || 4 });
      const pods = p.pods || 0;
      for (let i = 0; i < pods; i++) {
        const a = (i / pods) * Math.PI * 2 + Math.random() * 0.4, rr = p.triangle || 1.6;
        v4.set(gp.x + Math.cos(a) * rr, gp.y, gp.z + Math.sin(a) * rr);
        S.later(0.08 * i, ((q) => () => api.objects.spawn('pod', q, { source: hit.source }))(v4.clone()));
      }
      sfx('impact_' + el, gp, { volume: 0.7 });
    };
    S.projectiles.spawn({
      kind: 'lob', element: el, mesh, pos: o, dir: vel, speed, radius: 0.45, scale: mesh === 'fireball' ? 0.7 : 0.9, damage: 0, life: T + 0.6, gravity: g, pierce: true,
      hit, objects: false, trailWidth: 0.2, trailLength: 10,
      emitter: { rate: 30, color: [colOf(el, 'core'), colOf(el, 'mid')], shape: shape(el), speed: 0.6, spread: 1, size: 0.16, sizeEnd: 0, life: 0.4, drag: 2 },
      onImpact(pr, pos) { land(pos); }, onExpire(pr, pos) { land(pos); },
    });
    return true;
  };

  // 4. crawler — a ground-travelling wave (salamander, spikes, boulder)
  const crawlers = [];
  A.crawler = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const pp = ppos();
    const fan = p.fan || 1;
    const hit = H(ctx);
    castFx(ctx, 1.2);
    sfx('cast_' + el, pp, { pitch: 0.85 });
    if (p.ring) {   // earth.m1b: a ring of spikes at the target point, rooting
      const c = aimPoint(ctx, 18, new THREE.Vector3());
      const R = p.ring.r || 4;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; S.props.pillars.spawn(c.x + Math.cos(a) * R, S.height(c.x + Math.cos(a) * R, c.z + Math.sin(a) * R) - 0.2, c.z + Math.sin(a) * R, { height: 1.6 + Math.random(), width: 0.7, delay: i * 0.02, hold: 1.2, tiltX: -Math.cos(a) * 0.3, tiltZ: -Math.sin(a) * 0.3 }); }
      const h2 = Object.assign({}, hit); h2.status = Object.assign({}, hit.status || {}, { rooted: { dur: p.ring.root || 1.2 } });
      api.aoe(c.clone().setY(c.y + 0.6), R + 0.6, h2);
      fx('shockwave', c, { color: colOf(el), radius: R, duration: 0.4, thickness: 0.4 });
      return true;
    }
    for (let f = 0; f < fan; f++) {
      const dir = fwd(ctx, new THREE.Vector3());
      if (fan > 1) dir.applyAxisAngle(UP, ((f / (fan - 1)) - 0.5) * 0.9);
      const start = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(dir, 1.2);
      start.y = S.height(start.x, start.z);
      crawlers.push({ ctx, p, el, hit, dir, pos: start, d: 0, dist: (p.dist || 14), speed: (p.speed || 10) * vMul(ctx), r: (p.r || 1.4) * rMul(ctx),
        hitSet: new Set(), fxT: 0, lineT: 0, stepD: p.n ? (p.dist || 12) / p.n : 0, nextStep: 0, emitter: null, boulder: null, cur: L?.cur || null, look: null, proxy: null });
      const c = crawlers[crawlers.length - 1];
      if (L?.on()) {   // v4: the crawling head is a motif body on a proxy (row override: fire.salamander tongues, earth.spikes …)
        c.proxy = new THREE.Object3D(); c.proxy.position.set(start.x, start.y + 0.35, start.z); game.scene.add(c.proxy);
        c.look = L.crawl(c);
      }
      if (p.boulder) {
        c.boulder = S.projectiles.spawn({ kind: 'boulder', element: 'earth', mesh: 'rock', pos: start.clone().setY(start.y + 0.9), dir, speed: 0.001, radius: 0.1, scale: 1.6, damage: 0, life: c.dist / c.speed + 0.3, ignoreGround: true, objects: false, blockable: false, trail: false });
      }
    }
    return true;
  };
  function updateCrawlers(dt) {
    for (let i = crawlers.length - 1; i >= 0; i--) {
      const c = crawlers[i];
      const prevC = L && c.cur ? L.swap(c.cur) : null;
      try { crawlStep(c, i, dt); } finally { if (prevC !== null || c.cur) L?.swap(prevC); }
    }
  }
  function crawlStep(c, i, dt) {
    {
      const step = c.speed * dt;
      c.d += step; c.pos.addScaledVector(c.dir, step); c.pos.y = S.height(c.pos.x, c.pos.z);
      const el = c.el, p = c.p;
      // hits
      enemiesNear(v1.copy(c.pos).setY(c.pos.y + 0.8), c.r + 0.4, near);
      for (const e of near) {
        if (c.hitSet.has(e)) continue;
        c.hitSet.add(e);
        api.deal(e, api.makeHit(c.hit, e, c.pos, 0));
        if (p.shatter && e.statuses?.frozen) impactFx('ice', center(e, v4), 1.2, true);
      }
      // world: objects / zones on the path
      c.lineT -= dt;
      if (c.lineT <= 0) {
        c.lineT = 0.18;
        api.touch(c.pos, c.r, el, c.hit);
        if (p.ignite) api.terrain.ignite(c.pos, c.r + 0.3, 0.8);
      }
      // visuals
      c.fxT -= dt;
      if (c.proxy) { c.proxy.position.set(c.pos.x, c.pos.y + 0.35, c.pos.z); L.crawlTick?.(c, dt); }
      if (c.fxT <= 0) {
        c.fxT = L?.on() ? 0.16 : 0.05;
        v2.copy(c.pos); v2.y += 0.2;
        if (el === 'fire') {
          fx('burst', v2, { count: 6, shape: 'ember', color: [0xffe080, 0xff5a10], speed: 2, up: 4, spread: 0.4, dir: UP, size: 0.3, sizeEnd: 0.05, life: 0.45, gravity: -2 });
          fx('burst', v2, { count: 1, shape: 'smoke', color: [0x3a2a20, 0x1a1410], alpha: 0.4, additive: false, speed: 0.5, up: 2, size: 0.8, sizeEnd: 1.8, life: 0.8 });
        } else if (c.boulder) {
          fx('burst', v2, { count: 3, shape: 'dust', color: [0xc8a070, 0x6a5030], alpha: 0.5, additive: false, speed: 1.5, up: 1, size: 0.5, sizeEnd: 1.2, life: 0.5 });
        } else {
          fx('burst', v2, { count: 4, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], speed: 2, up: 3, spread: 0.5, dir: UP, size: 0.2, life: 0.4, gravity: 4 });
        }
      }
      if (c.boulder?.mesh) {
        c.boulder.pos.set(c.pos.x, c.pos.y + 0.9, c.pos.z); c.boulder.vel.copy(c.dir).multiplyScalar(0.001);
        const sp = c.boulder.mesh.userData.spin; if (sp) { sp.rotation.x += dt * c.speed / 0.9; }
      }
      if (c.stepD > 0 && c.d >= c.nextStep) {   // erupting spikes every dist/n
        c.nextStep += c.stepD;
        const eru = el === 'ice' ? S.props.spikes : S.props.pillars;
        eru.spawn(c.pos.x, c.pos.y - 0.3, c.pos.z, { height: 1.6 + Math.random() * 0.8, width: 0.9, hold: 0.6, tiltX: (Math.random() - 0.5) * 0.4, tiltZ: (Math.random() - 0.5) * 0.4 });
        fx('debris', v2.copy(c.pos).setY(c.pos.y + 0.4), { count: 4, material: 'rock', color: 0x7a6248, size: 0.18, speed: 5, life: 0.9 });
        if (p.surface?.kind === 'rubble') api.terrain.rubble(c.pos, 1.6, p.surface.dur || 6);
      }
      if (p.line && el === 'fire') {
        c.lineD = (c.lineD || 0) + step;
        if (c.lineD >= 2.4) { c.lineD = 0; api.zones.spawn('fire', c.pos, { radius: (p.line.width || 1.2), duration: p.line.dur || 4 }); }
      }
      if (c.d >= c.dist) {
        crawlers.splice(i, 1);
        if (c.look) { L.stopAll(c.look); c.look = null; }
        if (c.proxy) { const pr = c.proxy; c.proxy = null; S.laterReal(0.4, () => game.scene.remove(pr)); }
        if (p.endBurst) {
          v2.copy(c.pos); v2.y += 0.5;
          api.aoe(v2, p.endBurst.r || 3, Object.assign({}, c.hit, { amount: p.endBurst.dmg || 40, tier: 'heavy' }));
          impactFx(el, v2, 1.1, true);
          sfx('explode_' + el, v2);
        }
        if (c.boulder) { impactFx('earth', v2.copy(c.pos).setY(c.pos.y + 0.8), 1, true); fx('debris', v2, { count: 14, material: 'rock', color: 0x7a6248, size: 0.3, speed: 8, life: 1.2 }); c.boulder.life = 0; }
      }
    }
  }

  // 5. beam — channelled or instant; params.prism refracts (≤ 3 segments)
  A.beam = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const hit = H(ctx, { tags: ['beam'].concat(p.judgmentAt ? ['heavy'] : []) });
    const o = ctx.origin.clone();
    const dir = (ctx.aim?.dir || fwd(ctx, v1)).clone().normalize();
    castFx(ctx, 2);
    fx('flashSprite', o, colOf(el, 'core'), 3, 0.25, 1);
    sfx('cast_' + el, o, { pitch: 0.7 });
    const n = Math.max(1, p.beams || 1);
    for (let b = 0; b < n; b++) {
      const spreadA = n > 1 ? ((b / (n - 1)) - 0.5) * 0.5 : 0;
      api.beam({
        origin: o, dir: dir.clone().applyAxisAngle(UP, spreadA), len: p.len || 20, width: (p.width || 1.2) * rMul(ctx), dur: p.dur ?? 0, tick: p.tick || 0.1, hitSpec: hit, prism: !!p.prism || (el === 'light' && !!game.stats?.get?.('lightRefract')), element: el,
        follow: p.dur > 0 ? (org, d) => {
          const P2 = pl(); if (!P2?.entity?.alive) return false;
          try { P2.getWeaponTip ? P2.getWeaponTip('main', org) : org.copy(ppos()).setY(ppos().y + 1.5); } catch (_) { /* */ }
          let a = null; try { a = P2.getAim?.(); } catch (_) { a = null; }
          if (a?.dir) { d.lerp(a.dir, 0.12).normalize(); if (spreadA) d.applyAxisAngle(UP, spreadA * 0.02); }
          return true;
        } : null,
        onTick(bm) {
          const s = bm.segs[0]; if (!s.on) return;
          let last = s; for (const q of bm.segs) if (q.on) last = q;
          fx('burst', last.b, { count: 4, shape: 'spark', color: [glint(colOf(el)), colOf(el)], speed: 5, spread: 1, size: 0.12, life: 0.25, drag: 2 });
        },
      });
    }
    return true;
  };

  // 6. cone — instant cone (gust, wave, scythe)
  A.cone = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const pp = ppos(), o = v3.copy(pp).setY(pp.y + 1).clone();
    const dir = fwd(ctx, new THREE.Vector3());
    const len = (p.len || 8) * rMul(ctx), ang = p.angle || 60;
    const base = H(ctx);
    const spec = p.execute ? (e) => {
      const frac = (e.hp || 0) / Math.max(1, e.maxHp || 1);
      if (frac <= p.execute && !e.isBoss) return Object.assign({}, base, { amount: Math.max(base.amount, (e.hp || 0) + 1), fixed: true, tags: ['execute'], tier: 'crit' });
      if (frac <= p.execute && e.isBoss) return Object.assign({}, base, { amount: base.amount * (p.bossBelowMul || 1.5) });
      return base;
    } : base;
    api.cone(o, dir, len, ang, spec, { element: el });
    // visuals
    if (L?.on()) L.wave(o, dir, len, ang);
    else if (el === 'wind' || el === 'water') {
      try { S.props.gust(o, dir, len, colOf(el)); } catch (_) { /* */ }
      fx('burst', o, { count: 40, shape: el === 'water' ? 'droplet' : 'leaf', color: [glint(colOf(el)), colOf(el)], dir, spread: ang / 360, speed: len * 2.2, size: 0.2, life: 0.45, drag: 2, gravity: el === 'water' ? 8 : 0 });
    } else {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      fx('smear', 'wide', o, q, len * 0.5, el);
      fx('burst', o, { count: 30, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], dir, spread: ang / 360, speed: len * 1.8, size: 0.22, life: 0.35, drag: 3 });
    }
    sfx('cast_' + el, o);
    // projectile reflection (wind.gust): flip enemy projectiles inside the cone
    if (p.reflect) reflectProjectiles(o, dir, len, ang);
    if (p.puddle) for (let i = 1; i <= 3; i++) { v4.copy(pp).addScaledVector(dir, (len / 3) * i); api.zones.spawn('water', v4, { radius: p.puddle.r || 3, duration: p.puddle.dur || 8 }); }
    if (p.lane) api.zones.spawn('lane', pp, { dir, len: p.lane.len || 10, width: 3, dur: p.lane.dur || 5, laneKind: 'wind', params: { moveMul: p.lane.moveMul || 1.3 } });
    if (el === 'wind') api.terrain.wind(pp, dir, 1.4, len);
    return true;
  };
  function reflectProjectiles(o, dir, len, ang) {
    const list = game.enemies?.projectiles?.active || game.enemies?.projectiles?.list || game.enemyProjectiles || null;
    if (!Array.isArray(list)) { try { game.enemies?.reflectProjectiles?.(o, dir, len, ang); } catch (_) { /* */ } return; }
    const cosH = Math.cos(THREE.MathUtils.degToRad(ang * 0.5));
    for (const pr of list) {
      const pos = pr.pos || pr.position || pr.mesh?.position; const vel = pr.vel || pr.velocity; if (!pos || !vel) continue;
      v4.subVectors(pos, o); v4.y = 0; const d = v4.length(); if (d > len || (d > 0.5 && v4.dot(dir) / d < cosH)) continue;
      if (typeof pr.onReflect === 'function') { try { pr.onReflect(); } catch (_) { /* */ } }
      vel.multiplyScalar(-1); pr.team = 'player'; pr.reflected = true;
    }
  }

  // 7. nova — ring around self
  A.nova = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const pp = ppos(); const c = new THREE.Vector3(pp.x, pp.y + 0.8, pp.z);
    const rings = p.rings || [p.r || 5];
    const hit = H(ctx);
    let total = 0;
    const ring = (R, mul, delay) => S.later(delay, () => {
      const h = mul === 1 ? hit : Object.assign({}, hit, { amount: hit.amount * mul });
      const n = api.aoe(c, R * rMul(ctx), h, { element: el });
      total += n;
      novaFx(el, c, R * rMul(ctx));
      if (p.healPerHit && n > 0) heal(Math.min(p.healMax || 0.12, p.healPerHit * n), 'nova');
    });
    rings.forEach((R, i) => ring(R, 1, i * (p.every || 0.35)));
    if (p.second) ring(rings[rings.length - 1], p.second.mul || 0.6, p.second.delay || 0.4);
    if (p.repeat) ring(rings[0], p.repeat.mul || 0.6, p.repeat.delay || 1);
    if (p.freezeWater || el === 'ice') api.terrain.chill(c, p.r || 5);
    if (el === 'fire') api.terrain.ignite(c, (p.r || 5) * 0.8, 0.6);
    if (p.frostGround) api.zones.spawn('ice', pp, { radius: p.frostGround.r || 6, duration: p.frostGround.dur || 5 });
    if (p.coat) frostCoat(ctx, p.coat);
    sfx('explode_' + el, c, { volume: 0.8 });
    castFx(ctx, 1.5);
    return true;
  };
  function novaFx(el, c, R) {
    if (L?.on()) { L.nova(el, c, R); return; }
    const g = v4.copy(c); g.y = S.height(c.x, c.z) + 0.15;
    fx('shockwave', g.clone(), { color: colOf(el), radius: R, duration: 0.45, thickness: 0.8 });
    fx('shockwave', c.clone(), { color: colOf(el, 'core'), radius: R * 0.6, duration: 0.3, thickness: 0.3, vertical: true });
    fx('burst', g.clone().setY(g.y + 0.4), { count: 50, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], disc: true, radius: 0.6, speed: R * 2.4, drag: 2.5, up: 1, size: 0.22, life: 0.5 });
    fx('groundDecal', el === 'ice' ? 'frost' : el === 'fire' ? 'scorch' : el === 'lightning' ? 'lichtenberg' : el === 'nature' ? 'flowers' : el === 'light' ? 'rune' : el === 'shadow' ? 'violet' : el === 'water' ? 'ripple' : 'crack', g.clone(), R * 0.8, 6);
    fx('flashSprite', c, colOf(el, 'core'), R * 0.8, 0.2, 0.8);
  }
  /** ice.m1b 서리 껍질: the next 2 melee attackers within 6 s are chilled +3 and knocked back. */
  let coat = null;
  function frostCoat(ctx, c) {
    coat = { hits: c.hits || 2, until: (game.time || 0) + (c.dur || 6), chill: c.chill || 3, kb: c.knockback || 4 };
    const obj = pl()?.object;
    if (obj) coat.em = fx('emitter', { follow: obj, offset: new THREE.Vector3(0, 1, 0), rate: 16, duration: c.dur || 6, color: [glint(0x9fe8ff), 0x9fe8ff], shape: 'snow', speed: 0.6, spread: 1, size: 0.14, life: 0.6, radius: 0.7 });
  }
  E.on('damage', (ev) => {
    if (!coat || !ev?.isPlayer || ev.target !== pl()?.entity || ev.dot) return;
    if ((game.time || 0) > coat.until) { coat = null; return; }
    const src = ev.source && typeof ev.source === 'object' && ev.source.alive ? ev.source : null;
    if (!src || !src.object || src.object.position.distanceTo(ppos()) > 4.5) return;
    status(src, 'chilled', 4, coat.chill, 'ice');
    v4.subVectors(src.object.position, ppos()).setY(0).normalize();
    if (src.velocity && !src.isBoss) src.velocity.addScaledVector(v4, coat.kb * 3);
    fx('burst', center(src, v5), { count: 16, shape: 'shard', color: [glint(0x9fe8ff), 0x9fe8ff], speed: 5, spread: 1, size: 0.15, life: 0.4 });
    if (--coat.hits <= 0) { try { coat.em?.stop?.(); } catch (_) { /* */ } coat = null; }
  });

  // 8. zone — placed area via S.zones.spawn
  A.zone = (ctx) => {
    const p = P(ctx), el = ctx.element;
    let type = p.type || 'holy';
    const pp = ppos();
    const self = SELF_ZONES.has(type) || p.follow;
    const at = self ? new THREE.Vector3(pp.x, S.height(pp.x, pp.z), pp.z) : aimPoint(ctx, p.range || 20, new THREE.Vector3()).clone();
    const r = (p.r || 4) * rMul(ctx), dur = p.dur || 6;
    const hit = H(ctx);
    castFx(ctx, 1.4);
    sfx('cast_' + el, at);
    S.props.sigil(v4.copy(at).setY(at.y + 0.06).clone(), { color: colOf(el), radius: Math.min(4, r * 0.7), duration: 0.8, spin: 2.5 });
    let z = null;
    if (type === 'vortex') {
      const count = p.count || 1;
      for (let i = 0; i < count; i++) {
        const q = at.clone(); if (count > 1) { const a = (i / count) * Math.PI * 2; q.x += Math.cos(a) * 4; q.z += Math.sin(a) * 4; }
        const target = p.travel ? aimPoint(ctx, 26, new THREE.Vector3()).clone() : null;
        z = api.zones.spawn('vortex', p.travel ? pp.clone().addScaledVector(fwd(ctx, v5), 3) : q, { radius: r, duration: dur, target, speed: 4, strikeDmg: p.tick, dmgMul: 1 });
        if (z && (p.pullR || p.wander)) wanderPull(z, p);
      }
      if (p.updraft) { try { game.world?.addUpdraft?.({ pos: at.clone(), r: r * 0.6, h: p.updraft.h || 20, strength: p.updraft.lift || 14, life: dur, visual: false }); } catch (_) { /* */ } }
    } else if (type === 'water' && p.pull) {
      z = api.zones.spawn('whirl', at, { r: r * (onWater(at) ? (p.onWaterMul || 1.5) : 1), dur, hit, params: p, source: hit.source });
    } else if (type === 'roots') {
      z = api.zones.spawn('roots', at, { r, dur: Math.max(0.6, p.rootDot ? (p.status?.rooted?.dur || 2) : 0.6), hit, params: p, source: hit.source });
    } else {
      const follow = p.follow ? pl()?.object : null;
      z = api.zones.spawn(type, at, { r, dur, hit, params: p, follow, source: hit.source });
      if (type === 'holy' || type === 'spring' || type === 'rain') fx('dome', at.clone(), { color: colOf(el), radius: r, duration: 0.5 });
    }
    if (p.buff && !p.follow) statsSet('buff:' + ctx.skillId, p.buff, dur);
    return true;
  };
  function onWater(p) { const wl = game.world?.waterLevel; return Number.isFinite(wl) && S.height(p.x, p.z) < wl; }
  /** Wind vortex: extra pull radius (m1a) on top of the v2 tornado. */
  function wanderPull(z, p) {
    fields.push({ kind: 'pull', z, r: p.pullR || 6, t: 0, dur: z.duration || 5, every: 0.25, acc: 0, cur: L?.cur || null });
  }

  // 9. wall — temporary collider (earth wall) or a thorn grove
  A.wall = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const hit = H(ctx);
    castFx(ctx, 1.4);
    if (p.kind === 'grove') {
      const at = aimPoint(ctx, 18, new THREE.Vector3()).clone();
      const R = (p.r || 6) * rMul(ctx);
      api.zones.spawn('grove', at, { r: R, dur: p.life || 8, hit, params: Object.assign({ tick: p.tick || 10 }, p), source: hit.source });
      // thorn walls around the grove edge (temporary colliders)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        v4.set(at.x + Math.cos(a) * R, 0, at.z + Math.sin(a) * R); v4.y = S.height(v4.x, v4.z);
        try { game.world?.addTempCollider?.({ shape: 'cyl', pos: v4.clone(), r: 0.9, h: 2, life: p.life || 8, blocksProjectiles: !!p.blocksProjectiles }); } catch (_) { /* */ }
        S.props.pillars.spawn(v4.x, v4.y - 0.2, v4.z, { height: 1.8, width: 0.6, hold: (p.life || 8) - 0.5, tiltX: Math.cos(a) * 0.3, tiltZ: Math.sin(a) * 0.3 });
        fx('burst', v4, { count: 8, shape: 'thorn', color: [0xb8f070, 0x2f7d3a], dir: UP, spread: 0.3, speed: 6, size: 0.4, sizeEnd: 0.2, life: 0.5, gravity: 10 });
      }
      sfx('cast_nature', at, { pitch: 0.7 });
      return true;
    }
    const pp = ppos(), dir = fwd(ctx, new THREE.Vector3());
    const c = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(dir, 3.5); c.y = S.height(c.x, c.z);
    const w = (p.w || 6) * rMul(ctx);
    const Hd = structures.wall(c, dir, { w, h: p.h || 3, life: p.life || 8, reflect: !!p.reflect, blocksProjectiles: p.blocksProjectiles !== false, kind: el === 'ice' ? 'ice' : 'rock' });
    // enemies caught by the rising wall stagger
    if (p.stagger || hit.amount > 0) api.line(c.clone().addScaledVector(v4.set(dir.z, 0, -dir.x), -w / 2), c.clone().addScaledVector(v4.set(dir.z, 0, -dir.x), w / 2), 2.2, Object.assign({}, hit, { knockback: 6 }));
    if (p.collapse) Hd.onEnd = () => {
      api.cone(c.clone().setY(c.y + 1), dir, p.collapse.len || 6, p.collapse.angle || 60, Object.assign({}, hit, { amount: p.collapse.dmg || 60, tier: 'heavy', knockback: 8 }));
      fx('debris', c.clone().setY(c.y + 1.5), { count: 20, material: 'rock', color: 0x7a6248, size: 0.35, speed: 9, life: 1.3 });
      impactFx('earth', c.clone().addScaledVector(dir, 2).setY(c.y + 0.5), 1.3, true);
    };
    fx('shockwave', c.clone().setY(c.y + 0.1), { color: colOf(el), radius: w * 0.6, duration: 0.4, thickness: 0.5 });
    sfx('explode_earth', c, { volume: 0.8 });
    return true;
  };

  // 10. pillar — knock-up + optional platform (geyser, ice pillar, glacier, steps, colossus fist, smite)
  A.pillar = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const hit = H(ctx);
    castFx(ctx, 1.4);
    if (p.n && p.heights) {  // earth.steps: a climb route of 3 stepping pillars
      const pp = ppos(), dir = fwd(ctx, new THREE.Vector3());
      for (let i = 0; i < p.n; i++) {
        const q = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(dir, 2.5 + i * (p.spacing || 3));
        S.later(i * 0.12, () => {
          const hh = p.heights[i] || 2 + i * 2;
          structures.pillar('step', q, { h: hh, r: p.r || 1.2, life: p.life || 10, platform: true, blocksProjectiles: !!p.blocksProjectiles });
          api.aoe(q.clone().setY(S.height(q.x, q.z) + 0.6), (p.r || 1.2) + 0.6, hit);
          fx('debris', q.clone().setY(S.height(q.x, q.z) + 0.5), { count: 6, material: 'rock', color: 0x7a6248, size: 0.22, speed: 6, life: 1 });
          sfx('impact_earth', q, { volume: 0.5 });
        });
      }
      return true;
    }
    const at = aimPoint(ctx, p.range || 22, new THREE.Vector3()).clone();
    const R = (p.r || 2.5) * rMul(ctx);
    const strike = (mul = 1) => {
      const h = mul === 1 ? hit : Object.assign({}, hit, { amount: hit.amount * mul });
      if (p.smashRot || p.shatter) h.heavy = true;
      if (p.smashRot) h.tags = (h.tags || []).concat(['colossus']);
      api.aoe(at.clone().setY(at.y + 0.8), R, h);
      if (p.break) for (const e of enemiesNear(at, R, [])) { try { C()?.addBreak?.(e, p.break * mul); } catch (_) { /* */ } }
      if (p.smashRot) rotWallsNear(at, R + 1.5, (w) => game.world?.smashRotWall?.(w.id));
    };
    if (p.drop) {   // glacier: falls, lands, stays as a climbable block
      fx('telegraph', { shape: 'circle', pos: at.clone(), r: R, dur: 0.5, color: 'damage' });
      fx('runeCircle', at.clone().setY(at.y + 14), { element: el, r: R, dur: 0.8, rotSpeed: 2 });
      const life = p.platform?.life || 8;
      const Hd = structures.pillar('glacier', at, { h: p.platform?.h || 2.5, r: R, life, platform: true, relay: true });
      Hd.onLand = () => {
        strike(1);
        impactFx('ice', at.clone().setY(at.y + 1), 1.6, true);
        fx('shockwave', at.clone().setY(at.y + 0.1), { color: 0x9fe8ff, radius: R + 2, duration: 0.5, thickness: 1 });
        fx('burst', at.clone().setY(at.y + 0.5), { count: 60, shape: 'snow', color: [glint(0x9fe8ff), 0x9fe8ff], disc: true, radius: 1, speed: R * 3, up: 2, size: 0.25, life: 0.8, drag: 2 });
        fx('groundDecal', 'frost', at.clone(), R + 1, 10);
        api.terrain.chill(at, R + 1);
        fx('shake', 0.35);
        sfx('explode_ice', at);
      };
      if (p.chillAura) fields.push({ kind: 'chill', pos: at.clone(), r: p.chillAura.r || 5, t: 0, dur: life, every: 1, acc: 0, cur: L?.cur || null });
      Hd.onEnd = p.shatter ? () => shards(ctx, at.clone().setY(at.y + 1.2), p.shatter.n || 8, p.shatter.dmg || 20) : null;
      return true;
    }
    if (p.platform) {   // ice pillar (climbable, prism relay)
      const life = p.life || 8;
      const Hd = structures.pillar(el === 'ice' ? 'ice' : 'rock', at, { h: p.h || 6, r: R, life, platform: true, relay: !!p.prismRelay, blocksProjectiles: true });
      strike(1);
      impactFx(el, at.clone().setY(at.y + 1), 1, false);
      fx('burst', at.clone().setY(at.y + 0.3), { count: 40, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], dir: UP, spread: 0.3, speed: 10, size: 0.22, life: 0.6, gravity: 9 });
      if (el === 'ice') api.terrain.chill(at, R + 1);
      if (p.bridge) S.later(0.7, () => iceBridge(ctx, at, p.bridge));
      if (p.explode) Hd.onEnd = null, S.later(p.explode.delay || 4, () => shards(ctx, at.clone().setY(at.y + (p.h || 6) * 0.6), p.explode.n || 8, p.explode.dmg || 15));
      sfx('impact_' + el, at);
      return true;
    }
    if (p.smite) {   // light.charged 심판의 기둥: a pillar of light from the sky
      fx('beam', at.clone().setY(at.y + 24), at.clone(), { color: colOf(el, 'mid'), width: R * 0.9, duration: 0.45, jagged: 0.02, segments: 4 });
      fx('runeCircle', at.clone(), { element: 'light', r: R, dur: 0.7, rotSpeed: 3 });
      S.later(0.08, () => { strike(1); impactFx(el, at.clone().setY(at.y + 1), R / 2.5, true); fx('burst', at.clone().setY(at.y + 0.5), { count: 40, shape: 'star', color: [glint(colOf(el)), colOf(el)], dir: UP, spread: 0.25, speed: 12, size: 0.2, life: 0.5 }); api.terrain.bless(at, R, 4); });
      sfx('cast_light', at, { pitch: 0.8 });
      return true;
    }
    if (p.smashRot || (p.break && p.knockdown)) {   // earth.colossus: the giant fist
      const yaw = Math.atan2(at.x - ppos().x, at.z - ppos().z);
      fx('telegraph', { shape: 'circle', pos: at.clone(), r: R, dur: 0.25, color: 'damage' });
      S.later(0.12, () => {
        structures.pillar('fist', at, { r: R, h: 3, life: 1.8, yaw, collider: false });
        strike(1);
        impactFx('earth', at.clone().setY(at.y + 1.5), 1.8, true);
        fx('debris', at.clone().setY(at.y + 1), { count: 24, material: 'rock', color: 0x7a6248, size: 0.35, speed: 11, life: 1.4 });
        fx('shockwave', at.clone().setY(at.y + 0.1), { color: 0xe0a85a, radius: R + 2.5, duration: 0.5, thickness: 1.2 });
        fx('groundDecal', 'crack', at.clone(), R + 1.5, 10);
        fx('shake', 0.45);
        sfx('explode_earth', at);
        if (p.fissure) { const d = fwd(ctx, new THREE.Vector3()); for (let i = 0; i < 6; i++) { v4.copy(at).addScaledVector(d, i * ((p.fissure.len || 12) / 6)); api.terrain.rubble(v4, 1.6, p.fissure.dur || 8); fx('groundDecal', 'crack', v4.clone().setY(S.height(v4.x, v4.z)), 1.4, p.fissure.dur || 8); } }
      });
      if (p.second) S.later((p.second.delay || 0.6) + 0.12, () => { strike(p.second.mul || 0.6); structures.pillar('fist', at.clone().add(v4.set(1.2, 0, -0.8)), { r: R * 0.8, h: 3, life: 1.4, yaw: yaw + 0.6, collider: false }); impactFx('earth', at.clone().setY(at.y + 1.2), 1.2, true); });
      return true;
    }
    // geyser (fire.rising) and generic eruption
    fx('telegraph', { shape: 'circle', pos: at.clone(), r: R, dur: 0.18, color: 'damage' });
    S.later(0.12, () => {
      strike(1);
      fx('burst', at.clone().setY(at.y + 0.2), { count: 50, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], dir: UP, spread: 0.18, speed: 16, size: 0.32, sizeEnd: 0.05, life: 0.7, gravity: 6 });
      fx('burst', at.clone().setY(at.y + 0.2), { count: 8, shape: 'smoke', color: [0x3a2a20, 0x1a1410], alpha: 0.45, additive: false, dir: UP, spread: 0.2, speed: 6, size: 1.2, sizeEnd: 2.6, life: 1.1 });
      impactFx(el, at.clone().setY(at.y + 1), 1, true);
      fx('shockwave', at.clone().setY(at.y + 0.1), { color: colOf(el), radius: R + 0.8, duration: 0.35, thickness: 0.5 });
      if (el === 'fire') { api.terrain.ignite(at, R, 1); fx('groundDecal', 'scorch', at.clone(), R, 8); }
      else api.terrain.apply(el, at, R);
      sfx('explode_' + el, at, { volume: 0.8 });
    });
    return true;
  };
  function shards(ctx, at, n, dmg) {
    const hit = H(ctx, { amount: dmg, tier: 'light' });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      S.projectiles.spawn({ kind: 'shard', element: 'ice', mesh: 'shard', pos: at, dir: new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a)), speed: 22, radius: 0.4, scale: 0.7, damage: dmg, life: 0.6, hit, status: { chilled: { stacks: 1 } }, trailWidth: 0.12, trailLength: 6 });
    }
    impactFx('ice', at, 1.2, true);
    sfx('explode_ice', at, { volume: 0.7 });
  }
  /** ice.m2a 빙교: the pillar falls forward into a 10 m walkable ice bridge (world platforms + an ice lane visual). */
  function iceBridge(ctx, at, b) {
    const dir = fwd(ctx, new THREE.Vector3()), len = b.len || 10, life = b.life || 8;
    api.zones.spawn('lane', at, { dir, len, width: 2.4, dur: life, laneKind: 'ice', params: { selfMoveMul: 1.2 } });
    const wl = game.world?.waterLevel;
    for (let i = 1; i <= 5; i++) {
      v4.copy(at).addScaledVector(dir, (i / 5) * len);
      let top = S.height(v4.x, v4.z); if (Number.isFinite(wl)) top = Math.max(top, wl);
      try { game.world?.addPlatform?.({ id: 'icebridge', shape: 'disc', center: v4.clone(), r: 1.4, top: top + 0.35, life }); } catch (_) { /* */ }
      S.props.spikes.spawn(v4.x, top - 0.5, v4.z, { height: 1.0, width: 1.2, hold: life - 0.5, tiltX: 1.2 * dir.z, tiltZ: -1.2 * dir.x, delay: i * 0.04 });
    }
    api.terrain.chill(at, 3);
    fx('burst', at.clone().setY(at.y + 1), { count: 30, shape: 'snow', color: [glint(0x9fe8ff), 0x9fe8ff], dir, spread: 0.2, speed: 10, size: 0.2, life: 0.6 });
  }

  // 11. chain — jumps between N targets
  A.chain = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const first = targetOf(ctx, p.range ? p.range * 2.5 : 20);
    const hit = H(ctx);
    let bonus = 0; try { bonus = game.stats?.get?.('chainBonus') || 0; } catch (_) { /* */ }
    const n = (p.n || 3) + bonus;
    castFx(ctx, 1.2);
    sfx('cast_' + el, ctx.origin);
    if (!first) {   // no target: crackle into the aim point
      const to = aimPoint(ctx, 18, new THREE.Vector3()).clone().setY(0); to.y = S.height(to.x, to.z) + 0.5;
      fx('beam', ctx.origin.clone(), to, { color: colOf(el), width: 0.14, duration: 0.3, jagged: 0.6, segments: 12, branches: 2 });
      api.aoe(to, 1.6, hit);
      return true;
    }
    const to = center(first, new THREE.Vector3());
    fx('beam', ctx.origin.clone(), to, { color: colOf(el), width: 0.16, duration: 0.3, jagged: 0.6, segments: 12, branches: 2 });
    const wetRange = (game.progression?.rank?.('lightning.rx') || 0) > 0 ? 12 : p.range || 9;
    api.chain(first, n, p.range || 9, hit, { color: colOf(el), wetRange });
    return true;
  };

  // 12. rain — N strikes over time (ring sequence, waves, meteors, bolts)
  A.rain = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const pp = ppos();
    const c = p.ring ? new THREE.Vector3(pp.x, S.height(pp.x, pp.z), pp.z) : aimPoint(ctx, 26, new THREE.Vector3()).clone();
    const n = p.n || (p.dur ? Math.round(p.dur / (p.every || 0.35)) : 3);
    const R = (p.r || 3) * rMul(ctx);
    const hit = H(ctx);
    castFx(ctx, 2);
    fx('runeCircle', c.clone(), { element: el, r: p.ring ? p.ring * 0.5 : Math.max(R, 4), dur: (p.delay || 0) + n * (p.every || 0.3) + 0.5, rotSpeed: 1.2 });
    for (let i = 0; i < n; i++) {
      const q = new THREE.Vector3();
      if (p.ring) { const a = (i / n) * Math.PI * 2; const rr = p.ring * (0.35 + 0.65 * ((i + 1) / n)); q.set(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr); }
      else if (n > 1 && !p.wave) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * Math.max(R, p.r ? p.r * 0.9 : 4); q.set(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr); }
      else q.copy(c);
      q.y = S.height(q.x, q.z);
      const t = (p.delay || 0.25) + i * (p.every || 0.3);
      fx('telegraph', { shape: 'circle', pos: q.clone(), r: R, dur: Math.max(0.15, t), color: 'damage' });
      S.later(t, () => strikeAt(ctx, el, q, R, hit, p));
    }
    return true;
  };
  function strikeAt(ctx, el, q, R, hit, p) {
    const top = q.clone().setY(q.y + 18);
    if (L?.on()) L.strike(el, q, R, p);
    else if (el === 'lightning' || el === 'light') fx('beam', top, q.clone(), { color: colOf(el), width: el === 'light' ? R * 0.6 : 0.3, duration: 0.3, jagged: el === 'light' ? 0.03 : 0.5, segments: 12, branches: el === 'light' ? 0 : 2 });
    else if (el === 'nature') {
      for (let k = 0; k < 5; k++) { const a = k * 1.26; S.props.pillars.spawn(q.x + Math.cos(a) * R * 0.5, q.y - 0.3, q.z + Math.sin(a) * R * 0.5, { height: 2.2 + Math.random(), width: 0.55, hold: 0.7, tiltX: Math.cos(a) * 0.5, tiltZ: Math.sin(a) * 0.5, delay: k * 0.02 }); }
      fx('burst', q.clone().setY(q.y + 0.3), { count: 26, shape: 'thorn', color: [0xd8ff9a, 0x2f7d3a], dir: UP, spread: 0.3, speed: 9, size: 0.5, sizeEnd: 0.2, life: 0.5, gravity: 12 });
    } else if (el === 'water' && p.wave) {
      fx('shockwave', q.clone().setY(q.y + 0.3), { color: 0x7fd3ff, radius: R * 1.6, duration: 0.7, thickness: 1.6 });
      fx('burst', q.clone().setY(q.y + 0.5), { count: 60, shape: 'droplet', color: [glint(0x4fb4ff), 0x4fb4ff], disc: true, radius: R * 0.3, speed: R * 2.5, up: 6, size: 0.25, life: 0.8, gravity: 10 });
    } else {
      fx('burst', top, { count: 30, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], dir: v4.set(0, -1, 0), spread: 0.05, speed: 40, size: 0.4, life: 0.45, velocityStretch: 0.08 });
    }
    S.later(0.06, () => {
      api.aoe(q.clone().setY(q.y + 0.8), R, hit);
      impactFx(el, q.clone().setY(q.y + 0.6), R / 3, true);
      fx('shockwave', q.clone().setY(q.y + 0.1), { color: colOf(el), radius: R, duration: 0.35, thickness: 0.6 });
      api.terrain.apply(el, q, R);
      if (p.zone) api.zones.spawn(p.zone.type, q, { radius: R, duration: p.zone.dur || 5 });
      if (p.puddle) api.zones.spawn('water', q, { radius: p.puddle.r || 4, duration: p.puddle.dur || 8 });
      sfx('explode_' + el, q, { volume: 0.6 });
    });
  }

  // 13. summon — ally entity / placed device
  A.summon = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const kind = p.kind || 'treant';
    const hit = H(ctx);
    castFx(ctx, 1.6);
    if (kind === 'rod') {
      const at = aimPoint(ctx, 16, new THREE.Vector3()).clone();
      lobThen(ctx, at, 'orb', () => {
        api.objects.spawn('rod', at, { life: p.life || 12, r: p.puddleR || 6, source: hit.source, hit, owner: ctx.skillId });
        api.aoe(at.clone().setY(at.y + 0.8), 1.8, hit);
        fx('beam', at.clone().setY(at.y + 16), at.clone().setY(at.y + 2.3), { color: colOf('lightning'), width: 0.25, duration: 0.25, jagged: 0.5, segments: 10, branches: 2 });
        api.zones.chargeWater(at, p.puddleR || 6);
      });
      return true;
    }
    if (kind === 'fireSpirit') {
      // the orbiting fire spirit that shoots fireballs (master.js support runtime) — shared by every style
      // (bow / totem / melee reach it through the archetype since the legacy path is staff-only)
      let ok = false;
      try { ok = game.spells?.castById?.('fire_support', { free: true, aim: ctx.aim }) !== false; } catch (_) { ok = false; }
      if (!ok) statsSet('buff:' + ctx.skillId, {}, p.dur || 15);
      return true;
    }
    const pp = ppos(), dir = fwd(ctx, new THREE.Vector3());
    let at;
    if (kind === 'beacon') at = aimPoint(ctx, 14, new THREE.Vector3()).clone();
    else if (kind === 'mirror') at = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(dir, 3.5);
    else at = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(dir, kind === 'totem' ? 4 : 3);
    at.y = S.height(at.x, at.z);
    const s = summons.spawn(kind, at, { skillId: ctx.skillId, life: p.life || p.dur || 10, hpFrac: p.hpFrac, taunt: p.taunt || kind === 'totem', tauntR: p.tauntR, burst: p.burst, slam: p.slam, reflect: p.reflect, relay: p.relay,
      hit, element: el, revealR: p.revealR, purifyR: p.purifyR, max: p.max });
    if (hit.amount > 0 && kind !== 'treant') api.aoe(at.clone().setY(at.y + 0.8), 2.2, Object.assign({}, hit, { tier: 'light' }));
    S.props.sigil(at.clone().setY(at.y + 0.06), { color: colOf(el), radius: 2, duration: 1, spin: 2 });
    return !!s || true;
  };
  function lobThen(ctx, at, mesh, fn) {
    const o = ctx.origin.clone();
    const dist = Math.hypot(at.x - o.x, at.z - o.z), T = Math.max(0.3, Math.min(0.8, dist / 20)), g = 26;
    const vel = new THREE.Vector3((at.x - o.x) / T, (at.y - o.y + 0.5 * g * T * T) / T, (at.z - o.z) / T);
    let done = false; const go = () => { if (!done) { done = true; fn(); } };
    S.projectiles.spawn({ kind: 'lob', element: ctx.element, mesh: ctx.style === 'bow' ? 'arrow' : mesh, pos: o, dir: vel, speed: vel.length(), radius: 0.3, scale: 0.6, damage: 0, life: T + 0.4, gravity: g, pierce: true, objects: false, trailWidth: 0.12, trailLength: 8, onImpact: go, onExpire: go });
  }

  // 14. blink — teleport + path damage (뇌신 질주, 그림자 걸음)
  A.blink = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const pp = ppos(); const from = pp.clone();
    const hit = H(ctx);
    let to;
    if (p.behind) {
      const t = targetOf(ctx, p.range || 14);
      if (t) {
        v4.subVectors(t.object.position, pp).setY(0).normalize();
        to = t.object.position.clone().addScaledVector(v4, 1.4 + (t.radius || 0.5));
        to.y = S.height(to.x, to.z);
        try { pl()?.setFacing?.(Math.atan2(-v4.x, -v4.z)); } catch (_) { /* */ }
      } else to = dashTarget(fwd(ctx, v4), Math.min(8, p.range || 14), new THREE.Vector3()).clone();
    } else to = dashTarget(fwd(ctx, v4), (p.dist || 10) * vMul(ctx), new THREE.Vector3()).clone();
    grantIframes(p.iframes || 0.25);
    blinkFx(el, from, to);
    try { pl()?.teleport?.(to, true); } catch (_) { /* */ }
    api.line(from, to, (p.width || 1.6) * rMul(ctx), hit, { element: el });
    if (p.nextCrit || p.nextHit) statsSet('buff:' + ctx.skillId, riderMods(p), p.nextCrit?.window || p.nextHit?.window || 1.5);
    if (p.afterimages && typeof p.afterimages === 'object') afterimages(ctx, from, to, p.afterimages.n || 3, p.afterimages.dmg || 25);
    if (p.shade) shadeCopies(ctx, from, p.shade);
    if (p.returnKnot) knot(ctx, from, p.returnKnot);
    sfx('cast_' + el, to);
    return true;
  };
  function blinkFx(el, from, to) {
    const a = from.clone().setY(from.y + 1), b = to.clone().setY(to.y + 1);
    if (L?.on()) { L.blink(el, a, b); try { pl()?.spawnGhost?.(colOf(el, 'mid'), 0.3, 0.5); } catch (_) { /* */ } return; }
    fx('burst', a, { count: 30, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], speed: 4, spread: 1, size: 0.2, life: 0.4, drag: 2 });
    fx('burst', b, { count: 30, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], radius: 1, inward: true, speed: 5, size: 0.2, life: 0.3 });
    if (el === 'lightning') fx('beam', a, b, { color: colOf(el), width: 0.35, duration: 0.25, jagged: 0.4, segments: 12, branches: 2 });
    else fx('beam', a, b, { color: colOf(el, 'edge'), width: 0.5, duration: 0.2, jagged: 0.05, segments: 4 });
    try { pl()?.spawnGhost?.(colOf(el, 'mid'), 0.4, 0.7); } catch (_) { /* */ }
    fx('flashSprite', b, colOf(el, 'core'), 2.4, 0.15, 0.8);
  }
  function riderMods(p) {
    if (p.nextCrit) return { critChance: 1, critMul: (p.nextCrit.mul || 1.5) - 1, ...(p.mods || {}) };
    if (p.nextHit) return { atkMul: p.nextHit.mul || 1.3, ...(p.mods || {}) };
    if (p.firstHit) return { atkMul: p.firstHit.mul || 1.5, critChance: p.firstHit.crit ? 1 : 0, ...(p.mods || {}) };
    return p.mods || {};
  }
  function afterimages(ctx, from, to, n, dmg) {
    const el = ctx.element, hit = H(ctx, { amount: dmg, tier: 'light' });
    for (let i = 1; i <= n; i++) {
      const q = from.clone().lerp(to, i / (n + 1));
      S.later(0.25 + i * 0.12, () => { api.aoe(q.clone().setY(q.y + 0.9), 2.2, hit); impactFx(el, q.clone().setY(q.y + 1), 0.9, true); });
      fx('burst', q.clone().setY(q.y + 1), { count: 12, shape: shape(el), color: [glint(colOf(el)), colOf(el)], speed: 1, spread: 1, size: 0.3, life: 0.4 });
    }
  }
  /** shadow.m1a 그림자 분신: a shade at the start copies the next 3 player hits at 40%. */
  let shade = null;
  function shadeCopies(ctx, at, s) {
    shade = { pos: at.clone(), left: s.copies || 3, mul: s.mul || 0.4, until: (game.time || 0) + 6, hit: H(ctx, { amount: 0, tier: 'light' }) };
    fx('burst', at.clone().setY(at.y + 1), { count: 24, shape: 'smoke', color: [0x5b2a8a, 0x1a0b2e], alpha: 0.6, additive: false, speed: 1, up: 1, size: 0.9, sizeEnd: 1.6, life: 0.8 });
  }
  E.on('damage', (ev) => {
    if (!shade || !ev?.target || ev.isPlayer || !(ev.amount > 0) || ev.dot) return;
    if ((game.time || 0) > shade.until) { shade = null; return; }
    if (ev.source !== pl()?.entity && ev.source !== 'player') return;
    if (ev.skillId === '_shade') return;
    const t = ev.target; if (!t.alive) return;
    const h = Object.assign({}, shade.hit, { amount: ev.amount * shade.mul, skillId: '_shade', fixed: true, noReaction: true, tags: ['shade'] });
    S.later(0.15, () => { if (t.alive) { api.deal(t, api.makeHit(h, t, shade?.pos || ppos(), 0)); fx('beam', (shade?.pos || ppos()).clone().setY(1), center(t, new THREE.Vector3()), { color: 0x9a5cff, width: 0.2, duration: 0.15, jagged: 0.1 }); } });
    if (--shade.left <= 0) shade = null;
  });
  /** shadow.m1b 그림자 매듭: snap back to the knot when the window ends. */
  function knot(ctx, at, k) {
    S.later(k.window || 3, () => {
      if (!pl()?.entity?.alive) return;
      const from = ppos().clone();
      grantIframes(k.iframes || 0.2);
      blinkFx('shadow', from, at);
      try { pl()?.teleport?.(at, true); } catch (_) { /* */ }
    });
  }

  // 15. dash — self-dash with a body effect (불새 돌진, 질풍 보법, 물살 타기)
  A.dash = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const dir = fwd(ctx, new THREE.Vector3());
    const from = ppos().clone();
    const dist = (p.dist || 10) * vMul(ctx);
    const to = dashTarget(dir, dist, new THREE.Vector3()).clone();
    const hit = H(ctx);
    const width = (p.width || 2) * rMul(ctx);
    const seen = new Set();
    grantIframes(p.iframes || 0.3);
    try { pl()?.setFacing?.(Math.atan2(dir.x, dir.z)); } catch (_) { /* */ }
    castFx(ctx, 1.5);
    const dur = Math.max(0.18, dist / 38);
    let lastPuddle = 0, lastIgn = 0, ghostT = 0;
    move(from, to, dur, {
      trailEl: el,
      onStep(pos, k) {
        api.line(from, pos, width, hit, { seen, element: el, touch: false });
        const d = k * dist;
        if (p.ignite && d - lastIgn > 1.5) { lastIgn = d; api.terrain.ignite(pos, 1.6, 1); }
        if (p.meltIce && d - lastIgn < 0.1) api.terrain.meltIce(pos, 2);
        if (p.puddles && d - lastPuddle > 3.5) { lastPuddle = d; api.zones.spawn('water', pos, { radius: 2.2, duration: 8 }); }
        if (p.crossWater && onWater(pos)) { try { game.world?.addPlatform?.({ id: 'surf', shape: 'disc', center: pos.clone(), r: 2.2, top: (game.world.waterLevel || pos.y) + 0.1, life: p.crossWater }); } catch (_) { /* */ } }
        ghostT -= 1 / 60;
        if ((p.afterimages || el === 'fire' || el === 'wind') && ghostT <= 0) { ghostT = L?.on() ? 0.22 : game.settings?.values?.effectQuality === 'high' ? 0.04 : 0.075; try { pl()?.spawnGhost?.(colOf(el, 'mid'), 0.35, 0.6); } catch (_) { /* */ } }
        if (el === 'fire') fx('burst', v4.copy(pos).setY(pos.y + 1.2), { count: 6, shape: 'ember', color: [0xffe080, 0xff5a10], speed: 3, spread: 1, size: 0.35, sizeEnd: 0, life: 0.5, drag: 1 });
        if (el === 'water') fx('burst', v4.copy(pos).setY(pos.y + 0.3), { count: 8, shape: 'droplet', color: [glint(0x6fc8ff), 0x6fc8ff], speed: 4, up: 3, spread: 1, size: 0.18, life: 0.5, gravity: 9 });
      },
      onEnd() {
        api.touch(to, width, el, hit);
        if (p.endBurst) { api.aoe(v4.copy(to).setY(to.y + 0.8), p.endBurst.r || 4, Object.assign({}, hit, { amount: p.endBurst.dmg || 70, tier: 'heavy' })); impactFx(el, to.clone().setY(to.y + 1), 1.4, true); sfx('explode_' + el, to); }
        if (p.nextHit) statsSet('buff:' + ctx.skillId, riderMods(p), p.nextHit.window || 2);
        if (p.refundDash) { try { pl()?.refundDash?.(p.refundDash); } catch (_) { /* */ } }
        if (p.recast) S.later(0.5, () => {   // 귀환의 불꽃: a second pass back along the path
          const back = from.clone(), seen2 = new Set(), h2 = Object.assign({}, hit, { amount: p.recast.dmg || 40 });
          grantIframes(0.3);
          move(ppos().clone(), back, dur, { trailEl: el, onStep(pos) { api.line(to, pos, width, h2, { seen: seen2, element: el, touch: false }); } });
        });
      },
    });
    sfx('cast_' + el, from);
    return true;
  };

  // 16. leapslam — leap + landing AoE (뇌신 강림, 천공 낙하)
  A.leapslam = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const from = ppos().clone();
    const to = aimPoint(ctx, p.range || 10, new THREE.Vector3()).clone();
    const hit = H(ctx, { tier: 'heavy' });
    const R = (p.r || 5) * rMul(ctx);
    grantIframes(0.55);
    fx('telegraph', { shape: 'circle', pos: to.clone(), r: R, dur: 0.5, color: 'damage' });
    castFx(ctx, 1.4);
    sfx('cast_' + el, from, { pitch: 0.8 });
    move(from, to, 0.5 / vMul(ctx), {
      arc: p.up || 5, trailEl: el,
      onEnd() {
        const c = to.clone().setY(to.y + 0.8);
        api.aoe(c, R, hit);
        impactFx(el, c, R / 3, true);
        novaFx(el, c, R);
        if (el === 'lightning') fx('beam', c.clone().setY(c.y + 20), c.clone(), { color: colOf(el), width: 0.6, duration: 0.35, jagged: 0.4, segments: 14, branches: 3 });
        fx('shake', 0.4);
        sfx('explode_' + el, c);
        if (p.electrifyR) api.zones.chargeWater(to, p.electrifyR);
        if (p.followBolts) { const list = enemiesNear(to, 12, []).slice(0, p.followBolts.n || 3); list.forEach((e, i) => S.later(0.15 + i * 0.12, () => { if (!e.alive) return; const ec = center(e, new THREE.Vector3()); fx('beam', ec.clone().setY(ec.y + 16), ec, { color: colOf(el), width: 0.3, duration: 0.25, jagged: 0.5, segments: 12, branches: 2 }); api.deal(e, api.makeHit(H(ctx, { amount: p.followBolts.dmg || 30, tier: 'light' }), e, ec, 0)); })); }
        if (p.staticField) fields.push({ kind: 'static', pos: to.clone(), r: p.staticField.r || 5, t: 0, dur: p.staticField.dur || 5, every: p.staticField.every || 1, acc: 0, cur: L?.cur || null });
        if (p.tornado) api.zones.spawn('vortex', to, { radius: 3.5, duration: p.tornado.dur || 3 });
        if (p.staminaRefund) { const P2 = pl(); if (P2 && P2.stamina != null) P2.stamina = Math.min(P2.maxStamina || 100, P2.stamina + p.staminaRefund); }
        if (p.glideOut) { try { pl()?.startGlide?.(); } catch (_) { /* */ } }
        if (el === 'wind') api.terrain.wind(to, fwd(ctx, v4), 1.5, R);
      },
    });
    return true;
  };

  // 17. grapple — vine pull to a point, or pull a small target to you
  A.grapple = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const range = p.range || 16;
    const t = targetOf(ctx, range);
    const o = ctx.origin.clone();
    const hit = H(ctx);
    castFx(ctx, 1);
    sfx('cast_' + el, o);
    if (t && p.pullSmall && isSmall(t)) {
      const tc = center(t, new THREE.Vector3());
      vine(o, tc, 0.35);
      api.deal(t, api.makeHit(hit, t, o, 0));
      const pp = ppos();
      v4.subVectors(pp, t.object.position).setY(0); const L = v4.length();
      if (t.velocity && L > 1.5) t.velocity.addScaledVector(v4.multiplyScalar(1 / L), Math.min(22, L * 3.2));
      status(t, 'rooted', 0.4, 0, 'nature');
      return true;
    }
    // pull yourself to the aim point (trees, pillars, mushroom caps, island rocks — anything the aim ray hits)
    const to = aimPoint(ctx, range, new THREE.Vector3()).clone();
    const from = ppos().clone();
    const anchor = ctx.aim?.point ? ctx.aim.point.clone() : to.clone().setY(to.y + 1);
    vine(o, anchor, 0.45);
    const land = to.clone();
    // stop 1.2 m short of the anchor
    v4.subVectors(land, from).setY(0); const L = v4.length(); if (L > 2) land.addScaledVector(v4.multiplyScalar(1 / L), -1.2);
    const top = Math.max(S.height(land.x, land.z), anchor.y - 1);
    land.y = top;
    move(from, land, Math.max(0.25, L / 30), { arc: 1.5, trailEl: el, onEnd() { fx('burst', ppos().clone().setY(ppos().y + 0.5), { count: 14, shape: 'leaf', color: [0xd8ff9a, 0x4f9e3a], speed: 3, spread: 1, size: 0.2, life: 0.6, gravity: 4 }); } });
    return true;
  };
  function vine(a, b, dur) {
    fx('beam', a, b, { color: 0x6fcf4a, width: 0.14, duration: dur, jagged: 0.15, segments: 10 });
    fx('burst', b, { count: 12, shape: 'leaf', color: [0xd8ff9a, 0x4f9e3a], speed: 3, spread: 1, size: 0.2, life: 0.5, gravity: 3 });
  }

  // 18. buff — game.stats source + aura VFX
  const auras = [];
  A.buff = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const dur = p.dur || 8;
    const mods = riderMods(p);
    statsSet('buff:' + ctx.skillId, mods, dur);
    const obj = pl()?.object;
    const pp = ppos();
    // cast flourish + aura emitter (stopped when the buff ends)
    novaFx(el, v4.copy(pp).setY(pp.y + 0.8).clone(), 2.6);
    S.props.sigil(v4.copy(pp).setY(S.height(pp.x, pp.z) + 0.06).clone(), { color: colOf(el), radius: 2.4, duration: 1, spin: 2 });
    if (obj && L?.on()) {
      const hs = L.aura(el, obj, dur);
      auras.push({ em: { stop: () => L.stopAll(hs) }, until: (game.time || 0) + dur, id: 'buff:' + ctx.skillId });
    } else if (obj) {
      const em = fx('emitter', { follow: obj, offset: new THREE.Vector3(0, 1, 0), rate: 14, duration: dur, color: [colOf(el, 'core'), colOf(el, 'mid')], shape: shape(el), speed: 0.8, spread: 1, up: 0.8, size: 0.14, sizeEnd: 0, life: 0.7, drag: 1.5, radius: 0.7 });
      if (em) auras.push({ em, until: (game.time || 0) + dur, id: 'buff:' + ctx.skillId });
    }
    if (p.shieldPct) { api.shield((pl()?.maxHp || 100) * p.shieldPct, dur, el); }
    if (p.dome) {
      fx('dome', pp.clone(), { color: colOf(el), radius: p.dome.r || 3, duration: dur });
      if (p.dome.blocksProjectiles) { try { game.world?.addTempCollider?.({ shape: 'cyl', pos: pp.clone(), r: p.dome.r || 3, h: 4, life: dur, blocksProjectiles: true, onProjectile: (pr) => (pr?.team === 'player' || pr?.source === 'player' ? 'pass' : 'block') }); } catch (_) { /* */ } }
    }
    if (p.hotPct) {   // nature.sup 생명의 꽃: HoT over dur, then the bloom
      const ticks = Math.max(1, Math.round(dur / 0.5));
      for (let i = 1; i <= ticks; i++) S.later(i * 0.5, () => { heal(p.hotPct / ticks, ctx.skillId); fx('burst', v4.copy(ppos()).setY(ppos().y + 1.2), { count: 3, shape: 'petal', color: [0xffd6f0, 0x9be86a], radius: 0.6, speed: 0.6, up: 1.2, size: 0.2, life: 0.8 }); });
      if (p.bloom) S.later(dur, () => {
        const c = ppos().clone().setY(ppos().y + 0.8);
        heal(p.bloom.healPct || 0.1, ctx.skillId);
        api.aoe(c, p.bloom.r || 4, H(ctx, { amount: p.bloom.dmg || 40, tier: 'heavy' }));
        fx('burst', c, { count: 50, shape: 'petal', color: [0xffd6f0, 0x9be86a], disc: true, radius: 0.5, speed: 9, up: 2, size: 0.3, life: 0.9, drag: 2 });
        impactFx('nature', c, 1.3, true);
      });
    }
    if (p.untargetable) {
      const ent = pl()?.entity;
      if (ent) { ent.untargetable = true; S.later(dur, () => { ent.untargetable = false; }); }
      try { game.enemies?.setPlayerStealth?.(0.15, dur); } catch (_) { /* */ }
      fx('groundDecal', 'violet', pp.clone().setY(S.height(pp.x, pp.z)), 1.4, dur);
    }
    if (p.stealth) {
      try { game.enemies?.setPlayerStealth?.(0, dur); } catch (_) { /* */ }
      try { pl()?.spawnGhost?.(0x5b2a8a, 0.8, 0.6); } catch (_) { /* */ }
    }
    if (p.counterFreeze) fx('runeCircle', pp.clone(), { element: 'ice', r: 1.6, dur, rotSpeed: 1 });
    sfx('blessing', pp, { volume: 0.6 }); sfx('cast_' + el, pp, { pitch: 0.8 });
    E.emit('buffStart', { id: ctx.skillId, element: el, duration: dur });
    return true;
  };

  // 19. mark — apply status + target VFX (빙결 감옥, 그림자 낙인)
  A.mark = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const hit = H(ctx);
    castFx(ctx, 1.2);
    if (p.r) {   // area mark around the aim point
      const at = aimPoint(ctx, p.range || 22, new THREE.Vector3()).clone();
      const list = enemiesNear(at, p.r, []);
      api.aoe(at.clone().setY(at.y + 0.8), p.r, hit, { element: el });
      for (const e of list) markFx(el, e, p.dur || 4);
      fx('runeCircle', at.clone(), { element: el, r: p.r, dur: 0.9, rotSpeed: -2 });
      if (p.jumpOnDeath) for (const e of list) e._hexJump = { until: (game.time || 0) + (p.dur || 10), hit };
      if (p.healOnHit) hexHeal = { until: (game.time || 0) + (p.dur || 10), pct: p.healOnHit.pct || 0.02, icd: p.healOnHit.icd || 0.5, t: 0 };
      sfx('cast_' + el, at);
      return true;
    }
    const t = targetOf(ctx, p.range || 22);
    if (!t) { const at = aimPoint(ctx, p.range || 22, new THREE.Vector3()).clone(); impactFx(el, at.clone().setY(at.y + 1), 0.8); return true; }
    const h = Object.assign({}, hit);
    if (t.isBoss && p.bossDur) {
      h.status = cloneStatus(h.status || {}); for (const k in h.status) if (k === 'frozen') h.status[k] = { dur: p.bossDur };
      if (p.bossBreak) { try { C()?.addBreak?.(t, p.bossBreak); } catch (_) { /* */ } }
    }
    if (p.shatterTakenMul) { t.shatterMul = p.shatterTakenMul; t.shatterMulUntil = (game.time || 0) + 4; }
    const tc = center(t, new THREE.Vector3());
    if (el === 'ice') {
      for (let i = 0; i < 6; i++) { const a = i * 1.047; S.props.spikes.spawn(t.object.position.x + Math.cos(a) * 0.7, t.object.position.y - 0.2, t.object.position.z + Math.sin(a) * 0.7, { height: (t.height || 1.6) * 1.15, width: 0.7, hold: t.isBoss ? 0.8 : 3, tiltX: -Math.cos(a) * 0.25, tiltZ: -Math.sin(a) * 0.25, delay: i * 0.02 }); }
    }
    fx('beam', ctx.origin.clone(), tc, { color: colOf(el), width: 0.12, duration: 0.2, jagged: 0.2, segments: 6 });
    api.deal(t, api.makeHit(h, t, ppos(), 0));
    markFx(el, t, 3);
    sfx('impact_' + el, tc);
    return true;
  };
  function markFx(el, e, dur) {
    const c = center(e, v4);
    fx('burst', c, { count: 18, shape: shape(el), color: [colOf(el, 'core'), colOf(el, 'mid')], radius: 0.8, inward: true, speed: 3, size: 0.18, life: 0.4 });
    fx('runeCircle', e.object.position.clone(), { element: el, r: 1, dur: Math.min(3, dur), rotSpeed: 3 });
  }
  let hexHeal = null;
  E.on('damage', (ev) => {
    if (!ev?.target || ev.isPlayer || !(ev.amount > 0)) return;
    const t = ev.target;
    if (hexHeal && t.statuses?.hexed && (ev.source === pl()?.entity || ev.source === 'player')) {
      if ((game.time || 0) > hexHeal.until) hexHeal = null;
      else if ((game.time || 0) >= hexHeal.t) { hexHeal.t = (game.time || 0) + hexHeal.icd; heal(hexHeal.pct, 'hex'); }
    }
    if (ev.killed && t._hexJump && (game.time || 0) < t._hexJump.until) {
      const j = t._hexJump; t._hexJump = null;
      const next = api.nearestEnemy(t.object.position, 10, [t]);
      if (next) { status(next, 'hexed', 10, 0, 'shadow'); status(next, 'corroded', 8, 2, 'shadow'); next._hexJump = j; fx('beam', center(t, new THREE.Vector3()), center(next, new THREE.Vector3()), { color: 0xb14bff, width: 0.15, duration: 0.3, jagged: 0.3, segments: 8 }); markFx('shadow', next, 3); }
    }
  });

  // 20. chainbind — root N targets with tethers (그림자 사슬)
  A.chainbind = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const hit = H(ctx);
    const pp = ppos();
    const list = enemiesNear(v4.copy(pp).setY(pp.y + 1), p.range || 10, []).sort((a, b) => a.object.position.distanceToSquared(pp) - b.object.position.distanceToSquared(pp)).slice(0, p.n || 4);
    castFx(ctx, 1.4);
    sfx('cast_' + el, pp);
    const dur = p.dur || 3;
    const anchor = pp.clone().setY(S.height(pp.x, pp.z) + 0.1);
    const b = { ctx, p, list, t: 0, dur, handles: [], anchor, hit, healAcc: 0, cur: L?.cur || null };
    for (const e of list) {
      api.deal(e, api.makeHit(hit, e, pp, 0));
      if (e.isBoss && p.bossBreak) { try { C()?.addBreak?.(e, p.bossBreak); } catch (_) { /* */ } }
      const ec = center(e, new THREE.Vector3());
      const gp = e.object.position.clone(); gp.y = S.height(gp.x, gp.z);
      b.handles.push(fx('beam', gp, ec, { color: colOf(el, 'edge'), width: 0.14, duration: dur, jagged: 0.08, segments: 8 }));
      b.handles.push(fx('beam', anchor.clone(), ec.clone(), { color: colOf(el, 'mid'), width: 0.1, duration: Math.min(0.6, dur), jagged: 0.2, segments: 10 }));
      fx('runeCircle', gp.clone(), { element: el, r: 1, dur, rotSpeed: 2 });
    }
    binds.push(b);
    return true;
  };
  function updateBinds(dt) {
    for (let i = binds.length - 1; i >= 0; i--) {
      const b = binds[i]; b.t += dt;
      const prevC = L && b.cur ? L.swap(b.cur) : undefined;
      try { bindStep(b, i); } finally { if (prevC !== undefined) L.swap(prevC); }
    }
  }
  function bindStep(b, i) {
    {
      let k = 0;
      for (const e of b.list) {
        const h = b.handles[k]; k += 2;
        if (e.alive && h?.setEnds) { v4.copy(e.object.position); v4.y = S.height(v4.x, v4.z); h.setEnds(v4, center(e, v5)); }
        if (e.alive && e.velocity && !e.isBoss) e.velocity.multiplyScalar(0.5);
      }
      if (b.p.healPct) { b.healAcc += dt; if (b.healAcc >= 0.5) { b.healAcc = 0; const n = b.list.filter((e) => e.alive).length; if (n) heal(b.p.healPct * 0.5 * n, 'chains'); } }
      if (b.t >= b.dur) {
        binds.splice(i, 1);
        for (const h of b.handles) { try { h?.stop?.(); } catch (_) { /* */ } }
        if (b.p.yank) {
          const alive = b.list.filter((e) => e.alive); if (!alive.length) return;
          const c = new THREE.Vector3(); for (const e of alive) c.add(e.object.position); c.multiplyScalar(1 / alive.length);
          for (const e of alive) { pull(e, c, 18); fx('beam', center(e, new THREE.Vector3()), c.clone().setY(c.y + 1), { color: 0xb14bff, width: 0.18, duration: 0.25, jagged: 0.1 }); }
          S.later(0.25, () => { api.aoe(c.clone().setY(c.y + 1), 2.5, Object.assign({}, b.hit, { amount: b.p.yank.dmg || 60, tier: 'heavy', status: undefined })); impactFx('shadow', c.clone().setY(c.y + 1), 1.2, true); });
        }
      }
    }
  }

  // 21. tether — channel link (+ lifesteal / lashes)
  A.tether = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const len = p.len || 12;
    const t = targetOf(ctx, len);
    const hit = H(ctx);
    castFx(ctx, 1);
    sfx('cast_' + el, ctx.origin);
    const dur = (p.dur || 1.5) * (ctx.def?.slot === 'charged' ? Math.max(0.3, ctx.charge ?? 1) : 1);
    const lashes = p.lashes || 0;
    const T = { ctx, p, el, t, len, hit, dur, time: 0, every: lashes ? dur / lashes : (p.tick || 0.2), acc: 0, n: 0, lashes, beam: null, alive: true, cur: L?.cur || null };
    const o = ctx.origin.clone();
    const end = t ? center(t, new THREE.Vector3()) : o.clone().addScaledVector(fwd(ctx, v4), len);
    T.beam = fx('beam', o, end, { color: colOf(el, el === 'shadow' ? 'edge' : 'mid'), width: el === 'water' ? 0.28 : 0.18, duration: dur + 0.1, jagged: el === 'shadow' ? 0.25 : 0.12, segments: 12 });
    if (p.extinguish) { for (let i = 1; i <= 4; i++) { v4.copy(ppos()).addScaledVector(fwd(ctx, v5), (len / 4) * i); api.terrain.extinguish(v4, 2); api.terrain.soak(v4, 2, 8); } }
    tethers.push(T);
    return true;
  };
  function updateTethers(dt) {
    const P2 = pl();
    for (let i = tethers.length - 1; i >= 0; i--) {
      const T = tethers[i];
      const prevC = L && T.cur ? L.swap(T.cur) : undefined;
      try { tetherStep(T, i, dt, P2); } finally { if (prevC !== undefined) L.swap(prevC); }
    }
  }
  function tetherStep(T, i, dt, P2) {
    {
      T.time += dt; T.acc += dt;
      const o = v1; try { P2?.getWeaponTip ? P2.getWeaponTip('main', o) : o.copy(ppos()).setY(ppos().y + 1.5); } catch (_) { o.copy(ppos()).setY(ppos().y + 1.5); }
      const tAlive = T.t?.alive && T.t.object.position.distanceTo(ppos()) <= T.len + 3;
      if (T.t && !tAlive && !T.lashes) T.time = T.dur;   // drain breaks when the target dies or escapes
      const end = tAlive ? center(T.t, v2) : v2.copy(o).addScaledVector(fwd(T.ctx, v4), T.len * Math.min(1, T.time / 0.15));
      if (T.beam?.setEnds) T.beam.setEnds(o, end);
      if (T.acc >= T.every && T.time <= T.dur + 1e-3) {
        T.acc -= T.every; T.n++;
        const p = T.p;
        if (p.costPerSec && !T.ctx._free) { const c = p.costPerSec * T.every; if (P2?.spendMp && !P2.spendMp(c)) { T.time = T.dur; } }
        if (tAlive) {
          const h = Object.assign({}, T.hit);
          if (p.lifesteal) h.lifesteal = p.lifesteal;
          if (p.chillPerLash) h.status = Object.assign({}, h.status || {}, { chilled: { stacks: p.chillPerLash } });
          if (p.freezeWetOn && T.n === p.freezeWetOn && T.t.statuses?.wet) h.status = Object.assign({}, h.status || {}, { frozen: { dur: 2.5 } });
          api.deal(T.t, api.makeHit(h, T.t, o, 0));
          fx('burst', end, { count: T.lashes ? 16 : 6, shape: shape(T.el), color: [colOf(T.el, 'core'), colOf(T.el, 'mid')], speed: T.lashes ? 5 : 2, spread: 1, size: 0.16, life: 0.35, drag: 2 });
          if (p.lifesteal) fx('burst', end, { count: 3, shape: 'wisp', color: [0xe0c8ff, 0x9a5cff], speed: 0.5, size: 0.25, life: 0.5 });
          if ((p.pullAll || (p.pullLast && T.n >= T.lashes)) && T.lashes) pull(T.t, ppos(), 14);
        } else if (T.lashes) {
          // a lash without a target still sweeps the line
          api.line(o, end, 1.6, T.hit, { element: T.el });
        }
      }
      if (T.time >= T.dur) { tethers.splice(i, 1); try { T.beam?.stop?.(); } catch (_) { /* */ } }
    }
  }

  // 22. lane — placed strip surface (빙판길 / 순풍의 길)
  A.lane = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const pp = ppos(), dir = fwd(ctx, new THREE.Vector3());
    const kind = el === 'wind' ? 'wind' : el === 'ice' ? 'ice' : 'frost';
    const start = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(dir, 0.5); start.y = S.height(start.x, start.z);
    api.zones.spawn('lane', start, { dir, len: p.len || 12, width: (p.width || 3) * rMul(ctx), dur: p.dur || 8, laneKind: kind, hit: H(ctx), params: Object.assign({ tick: p.dmg || 0 }, p) });
    fx('burst', start.clone().setY(start.y + 0.4), { count: 40, shape: el === 'ice' ? 'snow' : 'leaf', color: [glint(colOf(el)), colOf(el)], dir, spread: 0.12, speed: 14, size: 0.2, life: 0.7, drag: 1 });
    castFx(ctx, 1);
    sfx('cast_' + el, start);
    return true;
  };

  // 23. mine — placed trap object (뇌전 지뢰)
  A.mine = (ctx) => {
    const p = P(ctx);
    const at = aimPoint(ctx, 14, new THREE.Vector3()).clone();
    const hit = H(ctx);
    castFx(ctx, 1);
    lobThen(ctx, at, 'orb', () => {
      api.objects.spawn('mine', at, { life: p.life || 20, r: p.r || 2.5, hit, source: hit.source, owner: ctx.skillId, max: p.max || 3, chainTrigger: p.chainTrigger || 0, pull: p.pull || 0 });
      sfx('impact_lightning', at, { volume: 0.4 });
    });
    return true;
  };

  // 24. bubble — single-target float CC (거품 감옥)
  const bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
  const bubblePool = [];
  for (let i = 0; i < 3; i++) {
    // v4: FR rim-only shell (kit.fxMaterial: cached, ducked, depthWrite false), else the v3 fresnel
    const kit = game.vfx?.kit;
    const m = new THREE.Mesh(bubbleGeo, kit?.fxMaterial ? kit.fxMaterial({ el: 'water', rimOnly: true }) : fresnelMat(0x9fe0ff, { power: 2.4, intensity: 1.2, core: 0.04 }));
    m.userData.noCameraCollide = true; m.userData.owner = 'player'; m.name = 'spells-bubble';
    m.visible = false; m.renderOrder = 4; m.frustumCulled = false;
    game.scene.add(m); bubblePool.push(m);
  }
  A.bubble = (ctx) => {
    const p = P(ctx), el = ctx.element;
    const t = targetOf(ctx, p.range || 22);
    const hit = H(ctx);
    castFx(ctx, 1);
    if (!t) { const at = aimPoint(ctx, 18, new THREE.Vector3()).clone().setY(0); at.y = S.height(at.x, at.z) + 1; impactFx(el, at, 0.8); api.aoe(at, p.popR || 3, hit); return true; }
    api.deal(t, api.makeHit(hit, t, ppos(), 0));
    if (t.isBoss) { if (p.bossBreak) { try { C()?.addBreak?.(t, p.bossBreak); } catch (_) { /* */ } } status(t, 'wet', 8, 0, 'water'); impactFx(el, center(t, v4), 1.2, true); return true; }
    const m = bubblePool.find((x) => !x.visible) || bubblePool[0];
    m.visible = true; m.scale.setScalar(0.1);
    const B = { ctx, p, t, m, time: 0, dur: p.dur || 2.5, baseY: t.object.position.y, hit, r: Math.max(1, (t.height || 1.6) * 0.75), cur: L?.cur || null };
    status(t, 'airborne', B.dur, 0, null); status(t, 'stunned', B.dur, 0, null);
    bubbles.push(B);
    sfx('cast_water', center(t, v4));
    return true;
  };
  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const B = bubbles[i];
      const prevC = L && B.cur ? L.swap(B.cur) : undefined;
      try { bubbleStep(B, i, dt); } finally { if (prevC !== undefined) L.swap(prevC); }
    }
  }
  function bubbleStep(B, i, dt) {
    {
      B.time += dt;
      const t = B.t;
      const k = Math.min(1, B.time / 0.3);
      if (t.alive) {
        const lift = 1.6 * k + Math.sin(B.time * 3) * 0.12;
        const gy = S.height(t.object.position.x, t.object.position.z);
        t.object.position.y = Math.max(t.object.position.y, gy + lift);
        if (t.velocity) { t.velocity.x *= 0.8; t.velocity.z *= 0.8; t.velocity.y = Math.max(0, t.velocity.y); }
        B.m.position.copy(center(t, v4)); B.m.scale.setScalar(B.r * (0.6 + 0.4 * k) * (1 + Math.sin(B.time * 9) * 0.04));
        B.fxT = (B.fxT || 0) - dt; if (B.fxT <= 0) { B.fxT = 0.25; fx('burst', B.m.position, { count: 2, shape: 'bubble', color: [glint(0x9fe0ff), 0x9fe0ff], radius: B.r, speed: 0.3, up: 0.8, size: 0.2, life: 0.8 }); }
      }
      if (B.time >= B.dur || !t.alive) {
        bubbles.splice(i, 1);
        B.m.visible = false;
        const c = t.alive ? center(t, v4).clone() : B.m.position.clone();
        api.aoe(c, B.p.popR || 3, Object.assign({}, B.hit, { amount: B.p.popDmg || 30, tier: 'heavy', status: { wet: { dur: 8 } } }));
        fx('burst', c, { count: 40, shape: 'droplet', color: [glint(0x6fc8ff), 0x6fc8ff], speed: 6, spread: 1, size: 0.2, life: 0.6, gravity: 9 });
        fx('shockwave', c, { color: 0x9fe0ff, radius: B.p.popR || 3, duration: 0.35, thickness: 0.3 });
        impactFx('water', c, 1, true);
        sfx('explode_water', c, { volume: 0.7 });
      }
    }
  }

  // ---------------- timed fields (chill aura, static field, vortex pull) ----------------
  function updateFields(dt) {
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i]; f.t += dt; f.acc += dt;
      if (f.kind === 'pull' && f.z) { if (!f.z || f.z.time <= 0) { fields.splice(i, 1); continue; } f.pos = f.z.pos; }
      if (f.acc >= f.every) {
        f.acc -= f.every;
        const list = enemiesNear(f.pos, f.r, near);
        for (const e of list) {
          if (f.kind === 'chill') status(e, 'chilled', 3, 1, 'ice');
          else if (f.kind === 'static') { status(e, 'shocked', 2, 0, 'lightning'); status(e, 'stunned', 0.15, 0, null); }
          else if (f.kind === 'pull') pull(e, f.pos, 4);
        }
        if (f.kind === 'static') inCtx(f, () => fx('burst', v4.copy(f.pos).setY(f.pos.y + 0.3), { count: 10, shape: 'spark', color: [glint(0xc9a4ff), 0xc9a4ff], disc: true, radius: f.r * 0.8, speed: 1, size: 0.1, life: 0.25 }));
        if (f.kind === 'chill') inCtx(f, () => fx('burst', v4.copy(f.pos).setY(f.pos.y + 0.3), { count: 6, shape: 'snow', color: [glint(0x9fe8ff), 0x9fe8ff], disc: true, radius: f.r * 0.7, speed: 0.5, up: 0.6, size: 0.14, life: 0.8 }));
      }
      if (f.t >= f.dur) fields.splice(i, 1);
    }
  }

  function update(dt) {
    updateMovers(dt); updateCrawlers(dt); updateTethers(dt); updateBinds(dt); updateBubbles(dt); updateFields(dt);
    if (iframeMine && (game.time || 0) >= iframeUntil) { iframeMine = false; const e = pl()?.entity; if (e) e.invulnerable = false; }
    for (let i = auras.length - 1; i >= 0; i--) {
      const a = auras[i];
      if ((game.time || 0) >= a.until || !game.stats?.has?.(a.id)) { try { a.em?.stop?.(); } catch (_) { /* */ } auras.splice(i, 1); }
    }
  }
  function clear() {
    movers.length = 0; crawlers.length = 0; tethers.length = 0; binds.length = 0; fields.length = 0;
    for (const B of bubbles) B.m.visible = false; bubbles.length = 0;
    for (const a of auras) { try { a.em?.stop?.(); } catch (_) { /* */ } } auras.length = 0;
    coat = null; shade = null; hexHeal = null;
    if (iframeMine) { iframeMine = false; const e = pl()?.entity; if (e) e.invulnerable = false; }
  }
  /** One hidden instance of every archetype-owned visual (bubble prison) for the boot compile. */
  function prewarm() { for (const m of bubblePool) m.visible = true; return null; }
  function afterPrewarm() { for (const m of bubblePool) if (!bubbles.some((B) => B.m === m)) m.visible = false; }

  /** Register every caster archetype (CONTRACT §7.3). Returns the number registered. */
  function register() {
    const R = game.archetypes;
    let n = 0;
    for (const name of ARCHETYPES) {
      const fn = A[name]; if (!fn) continue;
      const wrapped = (ctx) => {
        // v4: one cast context per archetype cast (castId on every hit and visual, tier budgets, bespoke row hooks)
        const prev = L ? L.begin({ castId: ctx.castId, skillId: ctx.skillId, el: ctx.element, style: ctx.style, arch: name, family: ctx.family }) : null;
        try { return fn(ctx); } catch (err) { warn('arch:' + name, err); throw err; } finally { if (L) L.end(prev); }
      };
      try { (R?.registerArchetype || game.skills?.registerArchetype)?.call(R || game.skills, name, 'caster', wrapped); n++; } catch (err) { warn('register:' + name, err); }
    }
    return n;
  }

  return { A, register, update, clear, prewarm, afterPrewarm, move, H, aimPoint, targetOf, fwd, castFx, impactFx, novaFx, strikeAt, grantIframes, fields, heal, status, baseOf, enemiesNear, colOf, shape };
}
