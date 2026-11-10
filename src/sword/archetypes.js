// Melee implementations of all 24 skill archetypes (CONTRACT §7.3), registered in the sword FACTORY with
// game.archetypes.registerArchetype(name, 'melee', fn).
//  - Melee-native forms (DESIGN §6.14 / CONTRACT §7.3 table): projectile = slash wave from the blade, crawler = ground wave
//    from a low slash, cone = wide sweep, nova = weapon-plant ring, blink = dash-slash, dash = lunge, leapslam = plunge,
//    grapple = vine whip, tether = whip channel.
//  - "Default ok" ones: a melee action whose strike frame runs the CASTER archetype from the weapon tip when magic registered
//    one; otherwise a self-contained melee form (zones via spells.api when present, world colliders / platforms / updrafts,
//    pooled sword fx), so every skill works with magic missing or stubbed (rule 5 / 11).
// Hammer radius ×1.2 / speed ×0.85, daggers radius ×0.85 / speed ×1.25 (the engine applies speed; radii use weapon.reachMul).
// Every hit carries UNSCALED base damage and goes through ctx.hit (skillId, slot, source, tier) → combat.dealDamage.
import * as THREE from 'three';
import { clamp, rand } from '../core/utils.js';
import { palOf } from './weapons.js';

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_MINES = 6;   // DESIGN §12 mine pool

export const MELEE_ARCHETYPES = ['projectile', 'volley', 'lob', 'crawler', 'beam', 'cone', 'nova', 'zone', 'wall', 'pillar', 'chain', 'rain',
  'summon', 'blink', 'dash', 'leapslam', 'grapple', 'buff', 'mark', 'chainbind', 'tether', 'lane', 'mine', 'bubble'];

export function registerMeleeArchetypes(game, E) {
  const S = E.S;
  const R = game.archetypes || game.skills;
  const warned = new Set();
  const warnOnce = (k, err) => { if (!warned.has(k)) { warned.add(k); console.warn('[sword] archetype', k, err); } };
  const P = () => game.player;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const vfx = (n, ...a) => S.vcall(n, ...a);
  const ground = (p) => { p.y = S.groundAt(p.x, p.z); return p; };
  const pos = () => P().object.position;
  const front = (d, yaw) => ground(V(pos().x + Math.sin(yaw) * d, 0, pos().z + Math.cos(yaw) * d));
  const _t = V(), _u = V(), _d = V();
  const ghostC = new THREE.Color();
  const near = [];
  const mines = [];

  // ------------------------------------------------------------------ helpers
  const rm = () => E.weapon.reachMul || 1;
  function dmgOf(ctx, p = ctx.params) {
    if (!p) return 0;
    if (p.dmgMin != null && p.dmgMax != null) return p.dmgMin + (p.dmgMax - p.dmgMin) * clamp(ctx.charge ?? 1, 0, 1);
    return p.dmg ?? 0;
  }
  function aimYaw(ctx) {
    const a = ctx.aim, o = pos();
    const tp = a?.target?.object?.position;
    if (tp) { const dx = tp.x - o.x, dz = tp.z - o.z; if (dx * dx + dz * dz > 0.04) return Math.atan2(dx, dz); }
    if (a?.point) { const dx = a.point.x - o.x, dz = a.point.z - o.z; if (dx * dx + dz * dz > 0.04) return Math.atan2(dx, dz); }
    if (a?.dir && (Math.abs(a.dir.x) + Math.abs(a.dir.z)) > 1e-3) return Math.atan2(a.dir.x, a.dir.z);
    return P().facing;
  }
  /** Aim point (target, else aim point) clamped to range, on the ground. */
  function aimPoint(ctx, range = 16, out = V()) {
    const a = ctx.aim, o = pos();
    const tp = a?.target?.alive !== false ? a?.target?.object?.position : null;
    if (tp) out.copy(tp); else if (a?.point) out.copy(a.point); else { const y = P().facing; out.set(o.x + Math.sin(y) * 6, o.y, o.z + Math.cos(y) * 6); }
    _d.subVectors(out, o).setY(0);
    const L = _d.length();
    if (L > range) out.set(o.x + _d.x / L * range, out.y, o.z + _d.z / L * range);
    return ground(out);
  }
  const kindOf = (ctx) => (ctx.slot === 'ult' || ctx.def?.slot === 'ultimate' ? 'ultimate' : ctx.def?.slot === 'finisher' ? 'finisher' : 'skill');
  /** Hit spec from the params (ctx tags skillId / slot / source / castMul). */
  function spec(ctx, extra) {
    const p = ctx.params || {};
    return { amount: dmgOf(ctx), status: p.status, kb: p.knockback ?? 4, launch: p.launch || 0, heavy: true, ctx, el: ctx.element,
      poise: p.break ?? p.poise, lifesteal: p.lifesteal, ...(extra || null) };
  }
  const tickSpec = (ctx, amount, extra) => ({ amount, status: ctx.params?.status, kb: 0, launch: 0, tier: 'light', tags: ['zone'], ctx, el: ctx.element, sparks: false, sound: false, noCounter: true, ...(extra || null) });
  /**
   * The caster archetype fired from the weapon tip. v4: melee owns the melee look of every skill (PLAN §3.6, §3.7 melee column),
   * so the self-contained melee forms always play (same params: damage, radius, duration); this only runs when a skill def
   * explicitly asks for the caster form (def.melee.caster === true).
   */
  function casterFx(ctx, name, over) {
    if (ctx.def?.melee?.caster !== true) return false;
    const fn = game.archetypes?.getArchetype?.(name, 'caster');
    if (!fn) return false;
    const c2 = Object.create(ctx);
    c2.origin = S.getWeaponPoint('main', V());
    c2.family = 'caster'; c2.meleeFallback = true; c2.meleeStyle = E.weapon.id;
    if (over) Object.assign(c2, over);
    try { fn(c2); return true; } catch (err) { warnOnce('caster:' + name, err); return false; }
  }
  /** Start the melee action for a skill. o: {tpl, dur, hitT, strike(a), update, lunge, setVy, gravityMul, hits, events, move, loop} */
  function begin(ctx, o) {
    E.refreshWeapon();
    if (ctx.element) E.setElementLocal(ctx.element);
    const hitT = clamp(o.hitT ?? ctx.def?.melee?.hitT ?? 0.35, 0.05, 0.95);
    const yaw = o.yaw ?? aimYaw(ctx);
    const evs = [[hitT, (a) => {
      try { o.strike?.(a); } catch (err) { warnOnce('strike:' + ctx.skillId, err); }
      // §5.8: a strike that dealt no damage itself spawned what delivers it (zone, rain, projectile, wall …): the action's own work
      // is done, so the strike frame is its delivery frame and the dodge window opens there (not 0.10 s later, not at the end)
      if (a.dmgT == null && !(o.hits && o.hits.length)) { a.dmgT = a.t; a.deferred = true; }
      E.look?.hook?.('after', a, ctx);
    }]];
    if (o.events) for (const e of o.events) evs.push(e);
    E.tag.skillId = ctx.skillId; E.tag.slot = ctx.slot;
    const dur = o.dur ?? 0.72;
    E.startAction({
      name: 'sk_' + ctx.skillId, kind: kindOf(ctx), tpl: ctx.def?.melee?.tpl || o.tpl || 'slashR', dur, cancel: o.cancel ?? Math.min(dur, Math.max(hitT + 0.2, 0.55) * dur),
      move: o.move ?? 0.12, target: o.target ?? null, facing: yaw, superArmor: o.superArmor ?? true, noGlide: true, lunge: o.lunge, lungeT: o.lungeT,
      trail: o.trail || [Math.max(0, hitT - 0.18), Math.min(1, hitT + 0.22)], events: evs, hits: o.hits, setVy: o.setVy, gravityMul: o.gravityMul,
      onUpdate: o.update, poseFn: o.poseFn, loop: o.loop, spin: o.spin, strikeT: hitT, ctx,
    });
    try { P().playCast?.(ctx.def?.anim || 'basic', ctx.element); } catch (_) { /* presentation */ }
    return E.act;
  }
  /** i-frames for melee movement skills (only when nothing else made the hero invulnerable). */
  function iframes(t) {
    const pl = P(); if (!(t > 0)) return;
    if (typeof pl?.grantIframes === 'function') { try { pl.grantIframes(t); return; } catch (_) { /* fall back */ } }
    const e = pl?.entity; if (!e || e.invulnerable) return;
    e.invulnerable = true;
    E.after(t, () => { e.invulnerable = false; });
  }
  function rider(ctx, mods, dur) { try { game.stats?.set?.('buff:' + ctx.skillId, mods, { duration: dur }); } catch (_) { /* */ } }
  /** Element ground spike at p (ice / rock / tinted crystal). */
  function spikeAt(el, p, h, w, delay = 0, life = 1.4) {
    if (el === 'ice') S.fx.iceSpikes.spawn(p, h, w, delay, life, 0.4);
    else if (el === 'earth') S.fx.rockSpikes.spawn(V(p.x, p.y - 0.1, p.z), h, w * 1.2, delay, life, 0.4);
    else S.fx.crystal.spawn(p, h, w * 0.7, delay, life, 0.5, palOf(el).a);
  }
  function trailFx(el, p) {
    const c = palOf(el);
    vfx('burst', p, { count: 2, shape: el === 'fire' ? 'ember' : el === 'water' ? 'droplet' : el === 'nature' ? 'leaf' : el === 'shadow' ? 'wisp' : 'spark', color: [c.b, c.a], speed: 2, spread: 1, size: 0.12, sizeEnd: 0, life: 0.4, drag: 2, gravity: el === 'water' ? 8 : -1 });
  }
  /** Travelling slash wave (projectile / volley melee form). Returns the travel time. */
  function slashWave(ctx, yaw, o) {
    const el = ctx.element, c = palOf(el);
    const speed = Math.min(o.speed || 30, 42), len = o.len || 16, width = o.width || 2.4;
    const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
    const p0 = pos().clone();
    const R0 = width * 0.75;
    S.arc({ yaw, a0: -1.1, a1: 1.1, rout: R0, rin: R0 * 0.55, h: 1.1, sweep: 0.05, life: len / speed, vel: dir.clone().multiplyScalar(speed), grow: 0.25, el, opacity: o.opacity ?? 1 });
    const set = new Set();
    let d = 0, done = false;
    const sp = spec(ctx, { kb: o.kb ?? 3, dirMode: 'fwd', ...(o.spec || null) });
    S.every(0.03, len / speed + 0.05, () => {
      if (done) return false;
      d += speed * 0.03;
      _t.set(p0.x + dir.x * d, p0.y, p0.z + dir.z * d);
      if (Math.random() < 0.5) trailFx(el, V(_t.x, _t.y + 1.1, _t.z));
      const n = S.hitLine(V(_t.x - dir.x * 1.4, _t.y, _t.z - dir.z * 1.4), dir, 2.0, width, sp, set, el);
      if (n && o.pierce === false) { done = true; o.onEnd?.(_t.clone()); return false; }
      if (d >= len) { done = true; o.onEnd?.(_t.clone()); return false; }
    });
    void c;
    return len / speed;
  }

  // ------------------------------------------------------------------ the 24 archetypes
  const A = {};

  A.projectile = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'slashR', dur: 0.62, strike: (a) => {
      if (p.orb) return orbBolt(ctx, a.yaw0);
      if (!casterFx(ctx, 'projectile')) {
        slashWave(ctx, a.yaw0, { speed: p.speed, len: p.len || p.range || 18, width: (p.r || 1.0) * 2 * rm() + 1.2, pierce: p.pierce ?? true,
          onEnd: p.pillar ? (end) => lightPillar(ctx, ground(end), p.pillar) : null });
      }
      S.arc({ yaw: a.yaw0, a0: -1.6, a1: 1.5, rout: 2.8 * rm(), rin: 1.2, h: 1.05, sweep: 0.06, life: 0.3, el: ctx.element });
    } });
  };
  function lightPillar(ctx, at, o) {
    vfx('beam', V(at.x, at.y + 18, at.z), V(at.x, at.y, at.z), { color: 0xfff2c0, width: 0.9, duration: Math.min(1.2, o.life || 1), jagged: 0, segments: 2 });
    vfx('runeCircle', at, { element: 'light', r: o.blessR || 3, dur: o.life || 6, rotSpeed: 1 });
    S.zone('holy', at, { r: o.blessR || 3, dur: o.life || 6, source: ctx.skillId });
  }
  /** lightning.ball melee form: a slow spark orb released from the blade that zaps the nearest foe. */
  function orbBolt(ctx, yaw) {
    const p = ctx.params, orb = p.orb || {};
    const at = S.getWeaponPoint('main', V());
    const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
    const life = p.life || 6, sp = p.speed || 4;
    let zap = 0;
    S.every(0.05, life, () => {
      at.addScaledVector(dir, sp * 0.05);
      at.y = S.groundAt(at.x, at.z) + 1.2;
      vfx('burst', at, { count: 1, shape: 'spark', color: [0xe8d9b0, palOf(ctx.element).a], speed: 1.5, spread: 1, size: 0.25, sizeEnd: 0, life: 0.15 });
      zap -= 0.05;
      if (zap > 0) return;
      zap = orb.every || 0.5;
      const list = S.foesNear(at, orb.zapR || 6, near);
      let best = null, bd = Infinity;
      for (const e of list) { const d = e.object.position.distanceToSquared(at); if (d < bd) { bd = d; best = e; } }
      if (!best) return;
      const c = S.centerOf(best, V());
      vfx('beam', at.clone(), c, { color: palOf(ctx.element).a, width: 0.12, duration: 0.12, jagged: 0.7, segments: 8 });
      S.applyHit(best, spec(ctx, { amount: orb.dmg ?? p.dmg ?? 10, kb: 0.5, heavy: false, tier: 'light', sound: false }), c, _u.subVectors(c, at).normalize().clone(), ctx.element);
    });
  }

  A.volley = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'slashL', dur: 0.62, strike: (a) => {
      if (casterFx(ctx, 'volley')) return;
      const n = clamp(p.n || 3, 1, 8), spread = (p.spread || 20) * DEG;
      for (let i = 0; i < n; i++) {
        const y = a.yaw0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
        slashWave(ctx, y, { speed: p.speed || 26, len: p.len || 14, width: 1.4 * rm(), pierce: false, opacity: 0.75 });
      }
      if (p.mesh === 'raven') vfx('burst', S.getWeaponPoint('main', V()), { count: 14, shape: 'feather', additive: false, color: [0x2a1640, 0x120820], speed: 7, spread: 0.6, dir: V(Math.sin(a.yaw0), 0.2, Math.cos(a.yaw0)), size: 0.22, life: 0.9, gravity: 1, drag: 1.2 });
    } });
  };

  A.lob = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'slashR', dur: 0.6, strike: () => {
      if (casterFx(ctx, 'lob')) return;
      const from = S.getWeaponPoint('main', V());
      const to = aimPoint(ctx, p.range || 18);
      const T = clamp(from.distanceTo(to) / 22, 0.25, 0.7);
      const el = ctx.element, c = palOf(el);
      let t = 0;
      S.every(0.03, T, () => {
        t += 0.03; const k = Math.min(1, t / T);
        _t.lerpVectors(from, to, k); _t.y += Math.sin(k * Math.PI) * 3;
        vfx('burst', _t, { count: 2, shape: el === 'fire' ? 'ember' : 'spark', color: [c.b, c.a], speed: 1, spread: 1, size: 0.18, sizeEnd: 0, life: 0.3 });
      });
      S.after(T, () => {
        const r = (p.r || 3) * rm();
        E.moves.payload(el, to, { r, dmg: dmgOf(ctx), kb: 4, launch: 1, spec: { status: p.status, ctx } });
        if (p.ignite) S.terrain('ignite', to, r);
        if (p.pods) { const O = game.spells?.api?.objects; for (let i = 0; i < p.pods; i++) { try { O?.spawn?.('pod', V(to.x + rand(-1.5, 1.5), to.y, to.z + rand(-1.5, 1.5)), { element: 'nature', source: ctx.skillId }); } catch (_) { /* */ } } }
      });
    } });
  };

  A.crawler = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'upper', dur: 0.66, strike: (a) => {
      const el = ctx.element;
      const dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0));
      const start = pos().clone();
      const dist = p.dist || 14, speed = Math.max(4, p.speed || 10), r = (p.r || 1.4) * rm();
      const set = new Set();
      const sp = spec(ctx, { dirMode: 'out' });
      let d = 0.8;
      vfx('shockwave', front(1.2, a.yaw0), { color: palOf(el).a, radius: 2, duration: 0.3, opacity: 0.8 });
      S.every(0.045, dist / speed + 0.1, () => {
        if (d > dist) return false;
        const q = ground(V(start.x + dir.x * d, 0, start.z + dir.z * d));
        if (p.boulder) { S.fx.rockSpikes.spawn(V(q.x, q.y - 0.1, q.z), 1.4, 1.4, 0, 0.5, 0.8); vfx('debris', V(q.x, q.y + 0.3, q.z), { count: 2, size: 0.25, speed: 4, material: 'rock' }); }
        else if (el === 'fire') { vfx('burst', V(q.x, q.y + 0.2, q.z), { count: 4, shape: 'puff', color: [0xffc040, 0xd02008], speed: 2.5, spread: 0.4, dir: S.UP, size: 0.6, sizeEnd: 1.3, life: 0.6, gravity: -4, drag: 3, alpha: 1 }); if (p.ignite || p.line) S.terrain('ignite', q, (p.line?.width || 1.2) * 0.8); }
        else spikeAt(el, q, 0.9 + Math.random() * 0.8 + (p.launch || 0) * 0.15, 0.7 + Math.random() * 0.3, 0, 1.3);
        if (p.surface?.kind === 'rubble') { try { game.world?.surface2?.rubble?.(q, 1.4, p.surface.dur || 6); } catch (_) { /* */ } }
        S.hitCircle(V(q.x, q.y + 0.5, q.z), r, sp, set, 3, el);
        d += speed * 0.045;
      });
      if (p.line) {
        const L = p.line;
        S.after(dist / speed, () => S.every(L.every || 0.5, L.dur || 4, () => { S.hitLine(start, dir, dist, L.width || 1.2, tickSpec(ctx, L.tick || 6), null, el); }));
      }
      S.sfx('cast_' + el, { position: start });
    } });
  };

  A.beam = (ctx) => {
    const p = ctx.params;
    const dur = clamp(p.dur || 1.2, 0.2, 3);
    let beam = null, tick = 0;
    const end = V();
    begin(ctx, { tpl: 'thrust', dur: dur + 0.5, hitT: 0.3 / (dur + 0.5), strike: () => {
      if (casterFx(ctx, 'beam')) return;
      const tip = S.getWeaponPoint('main', V());
      beam = vfx('beam', tip, end.copy(tip).addScaledVector(dirOfAim(ctx, _d), p.len || 20), { color: palOf(ctx.element).a, width: (p.width || 1) * 0.6, duration: dur, jagged: 0.08, segments: 8 });
    }, update: (dt, a) => {
      if (!beam || a.t < 0.3 || a.t > dur + 0.3) return;
      const tip = S.getWeaponPoint('main', _t);
      dirOfAim(ctx, _d);
      end.copy(tip).addScaledVector(_d, p.len || 20);
      beam.setEnds?.(tip, end);
      tick -= dt;
      if (tick > 0) return;
      tick = p.tick || 0.1;
      _u.copy(pos()); _d.y = 0; _d.normalize();
      S.hitLine(_u, _d, p.len || 20, (p.width || 1.2) * rm(), tickSpec(ctx, p.dmg || 10, { tags: ['beam'], kb: 0.3 }), null, ctx.element);
    } });
  };
  function dirOfAim(ctx, out) {
    const pl = P();
    if (pl.camForward) out.copy(pl.camForward); else if (ctx.aim?.dir) out.copy(ctx.aim.dir); else out.set(Math.sin(pl.facing), 0, Math.cos(pl.facing));
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    return out.normalize();
  }

  A.cone = (ctx) => {
    const p = ctx.params;
    const len = p.len || 8, half = clamp((p.angle || 70) * DEG * 0.5, 0.2, 1.6);
    begin(ctx, { tpl: 'slashR', dur: 0.66, strike: (a) => {
      const el = ctx.element;
      S.arc({ yaw: a.yaw0, a0: -half - 0.25, a1: half + 0.25, rout: len * rm() * 0.85, rin: 1.0, h: 1.0, sweep: 0.07, life: 0.38, el });
      S.arc({ yaw: a.yaw0, a0: -half, a1: half, rout: len * rm() * 0.6, rin: 0.8, h: 1.2, sweep: 0.06, life: 0.3, el, opacity: 0.6 });
      S.smear(a.yaw0, 0.1, len * rm() * 0.7);
      vfx('burst', front(len * 0.4, a.yaw0).setY(pos().y + 1), { count: 20, shape: el === 'water' ? 'droplet' : 'soft', color: [palOf(el).b, palOf(el).a], speed: 9, spread: half, dir: V(Math.sin(a.yaw0), 0.1, Math.cos(a.yaw0)), size: 0.3, sizeEnd: 0.9, life: 0.45, drag: 2.5, alpha: 0.6 });
      const sp = spec(ctx, { kb: p.knockback ?? 6, dirMode: 'out' });
      const list = S.foesNear(pos(), len * rm() + 1, near);
      for (const e of list) {
        _t.subVectors(e.object.position, pos()).setY(0);
        const d = _t.length(); if (d > len * rm() + (e.radius || 0.5)) continue;
        let ang = Math.atan2(_t.x, _t.z) - a.yaw0; ang -= Math.round(ang / TWO_PI) * TWO_PI;
        if (Math.abs(ang) > half + Math.atan2(e.radius || 0.5, Math.max(0.5, d))) continue;
        const c = S.centerOf(e, V());
        S.applyHit(e, sp, c, _t.normalize().clone(), el);
      }
      if (p.puddle) S.zone('water', front(len * 0.5, a.yaw0), { r: p.puddle.r || 3, dur: p.puddle.dur || 8 });
      if (el === 'wind') S.terrain('wind', front(3, a.yaw0), len, V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0)));
      S.sfx('cast_' + el, { position: pos() });
    } });
  };

  A.nova = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'overhead', dur: 0.78, hitT: ctx.def?.melee?.hitT ?? 0.5, spin: ctx.def?.melee?.tpl === 'spin' ? { t0: 0.3, t1: 0.7, turns: 1 } : undefined, strike: () => {
      const c = ground(pos().clone());
      const r = (p.r || 5) * rm();
      vfx('shockwave', c, { color: palOf(ctx.element).a, radius: r, duration: 0.5, opacity: 0.9, thickness: 0.4 });
      vfx('runeCircle', c, { element: ctx.element, r: Math.min(r, 8), dur: 0.8, rotSpeed: 3 });
      E.moves.payload(ctx.element, c, { r, dmg: dmgOf(ctx), kb: p.knockback ?? 6, launch: p.launch ?? 1.5, big: true, tier: kindOf(ctx) === 'ultimate' ? 'ult' : 'heavy', spec: { status: p.status, ctx } });
      if (p.freezeWater) S.terrain('freeze', c, r);
      vfx('fovKick', 4, 0.3);
      S.sfx('explode_' + ctx.element, { position: c, volume: 0.8 });
    } });
  };

  A.zone = (ctx) => {
    const p = ctx.params;
    const self = p.follow || p.type === 'spring' || p.type === 'holy' || p.type === 'rain' || p.type === 'updraft';
    begin(ctx, { tpl: 'overhead', dur: 0.7, hitT: 0.5, strike: (a) => {
      if (casterFx(ctx, 'zone')) return;
      const c = self ? front(p.type === 'updraft' ? 1.5 : 0.6, a.yaw0) : aimPoint(ctx, 12);
      meleeZone(ctx, c, p);
    } });
  };
  /** Self-contained zone (no magic): visuals + ticks + heal + pulls + world ops. */
  function meleeZone(ctx, c, p) {
    const el = ctx.element;
    const r = (p.r || 4) * rm();
    const dur = p.instant ? 0.6 : Math.min(p.dur || 5, 14);
    const every = p.every || 0.5;
    const follow = !!p.follow;
    S.zone(p.type || el, c, { ...p, r, dur, source: ctx.skillId, element: el });
    vfx('runeCircle', c, { element: el, r: Math.min(r, 9), dur, rotSpeed: 0.8 });
    const decal = { fire: 'scorch', ice: 'frost', lightning: 'lichtenberg', water: 'ripple', nature: 'flowers', light: 'rune', shadow: 'violet' }[el] || 'crack';
    vfx('groundDecal', decal, c, r, dur + 1);
    if (p.type === 'updraft') { try { game.world?.addUpdraft?.({ pos: c, r, h: p.h || 18, strength: p.updraft?.strength || 14, life: dur }); } catch (_) { /* */ } }
    if (p.type === 'holy') { try { game.world?.surface2?.bless?.(c, r, dur); } catch (_) { /* */ } }
    if (p.type === 'water' || p.type === 'flood' || p.type === 'rain' || p.type === 'spring') S.terrain('wet', c, r);
    if (p.dmg && (p.instant || !p.tick)) S.hitCircle(V(c.x, c.y + 0.6, c.z), r, spec(ctx, { kb: 1.5 }), null, 3, el);
    const pl = P();
    let acc = 0;
    S.every(every, dur, () => {
      if (follow) { c.x = pos().x; c.z = pos().z; c.y = pos().y; }
      acc += every;
      if (p.tick) S.hitCircle(V(c.x, c.y + 0.6, c.z), r, tickSpec(ctx, p.tick, { status: acc >= 1 || !p.seedPerSec ? p.status : undefined }), null, 3, el);
      if (p.seedPerSec || p.radiantPerSec) {
        if (acc >= 1) {
          acc = 0;
          for (const e of S.foesNear(c, r, near)) { try { game.combat?.applyStatus?.(e, p.seedPerSec ? 'seeded' : 'radiant', 8, { stacks: 1, source: pl.entity, el }); } catch (_) { /* */ } }
        }
      }
      if (p.pull || p.pullR || p.lift) {
        for (const e of S.foesNear(c, p.pullR || r, near)) {
          if (e.isBoss || !e.velocity) continue;
          _t.subVectors(c, e.object.position).setY(0);
          const d = _t.length(); if (d < 0.4) continue;
          e.velocity.addScaledVector(_t.multiplyScalar(1 / d), 2.2);
          if (p.lift) e.velocity.y = Math.max(e.velocity.y, p.lift * 1.2);
        }
      }
      if (p.healPct && pl.entity?.alive && pl.object.position.distanceTo(c) <= r + 0.5) {
        try { game.combat?.healPlayer?.(pl.maxHp * p.healPct * every, 'skill:' + ctx.skillId, { hot: true }); } catch (_) { /* */ }
      }
      if (Math.random() < 0.6) { const an = Math.random() * TWO_PI, rr = Math.random() * r; trailFx(el, V(c.x + Math.sin(an) * rr, c.y + 0.3, c.z + Math.cos(an) * rr)); }
    });
    // heal-only zones (spring / sanctuary) also heal once on cast so the effect is immediate
    if (p.healPct && pl.entity?.alive) { try { game.combat?.healPlayer?.(pl.maxHp * p.healPct * 0.5, 'skill:' + ctx.skillId, { hot: true }); } catch (_) { /* */ } }
  }

  A.wall = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'overhead', dur: 0.72, hitT: 0.5, strike: (a) => {
      if (casterFx(ctx, 'wall')) return;
      const el = ctx.element;
      if (p.kind === 'grove') {
        const c = aimPoint(ctx, 10), r = (p.r || 6) * rm();
        const n = 14;
        for (let i = 0; i < n; i++) { const an = (i / n) * TWO_PI; spikeAt('nature', ground(V(c.x + Math.sin(an) * r, 0, c.z + Math.cos(an) * r)), 1.6 + Math.random(), 0.6, 0.02 * i, p.life || 8); }
        meleeZone(ctx, c, { type: 'overgrowth', r, dur: p.life || 8, tick: p.tick || 10, every: p.every || 0.5, seedPerSec: p.seedPerSec, status: p.status });
        return;
      }
      const c = front(3.2, a.yaw0), w = (p.w || 6) * rm(), h = p.h || 3;
      const yaw = a.yaw0 + Math.PI / 2;
      try { game.world?.addTempCollider?.({ shape: 'box', pos: c, size: { x: w, y: h, z: 0.9 }, yaw: a.yaw0, life: p.life || 8, blocksProjectiles: !!p.blocksProjectiles, owner: 'player' }); } catch (err) { warnOnce('wall', err); }
      const n = Math.round(w / 0.7);
      for (let i = 0; i < n; i++) {
        const o = (i / (n - 1) - 0.5) * w;
        spikeAt(el, ground(V(c.x + Math.sin(yaw) * o, 0, c.z + Math.cos(yaw) * o)), h * (0.75 + Math.random() * 0.35), 0.9, 0.015 * i, p.life || 8);
      }
      vfx('debris', V(c.x, c.y + 0.3, c.z), { count: 10, size: 0.3, speed: 6, material: 'rock' });
      S.hitLine(V(c.x - Math.sin(yaw) * w / 2, pos().y, c.z - Math.cos(yaw) * w / 2), V(Math.sin(yaw), 0, Math.cos(yaw)), w, 2.4, spec(ctx, { kb: 7, status: p.stagger ? { stunned: { dur: 0.6 } } : p.status }), null, el);
      S.sfx('explode_earth', { position: c, volume: 0.7 });
    } });
  };

  A.pillar = (ctx) => {
    const p = ctx.params;
    const hop = p.selfHop ? [[0.3, 4 + p.selfHop * 3]] : undefined;
    begin(ctx, { tpl: 'overhead', dur: 0.78, setVy: hop, strike: (a) => {
      if (casterFx(ctx, 'pillar')) return;
      const el = ctx.element;
      const r = (p.r || 2.5) * rm();
      if (p.heights) {   // earth.steps: a climb route
        const n = p.n || p.heights.length;
        for (let i = 0; i < n; i++) {
          const q = front(2.5 + i * (p.spacing || 3), a.yaw0), h = p.heights[i] ?? 2 * (i + 1);
          S.fx.rockSpikes.spawn(V(q.x, q.y - 0.2, q.z), h, 2.2, i * 0.08, p.life || 10, 0.05);
          try { game.world?.addPlatform?.({ shape: 'disc', center: { x: q.x, y: q.y, z: q.z }, r: p.r || 1.2, top: q.y + h * 0.92, life: p.life || 10, owner: 'player' }); } catch (_) { /* */ }
          if (p.blocksProjectiles) { try { game.world?.addTempCollider?.({ shape: 'cyl', pos: q, r: (p.r || 1.2) * 0.9, h, life: p.life || 10, blocksProjectiles: true, blocksMovement: false }); } catch (_) { /* */ } }
          S.hitCircle(V(q.x, q.y + 0.5, q.z), 1.6, spec(ctx, { kb: 2 }), null, 3, el);
        }
        return;
      }
      const c = p.meleeRange ? front(p.meleeRange, a.yaw0) : aimPoint(ctx, 12);
      if (el === 'ice') {
        const h = p.h || (p.drop ? 3 : 4);
        S.fx.iceSpikes.spawn(c.clone(), h, p.drop ? 3 : 1.8, 0, p.life || p.platform?.life || 8, 0.05);
        for (let i = 0; i < 6; i++) { const an = (i / 6) * TWO_PI; S.fx.iceSpikes.spawn(ground(V(c.x + Math.sin(an) * r * 0.8, 0, c.z + Math.cos(an) * r * 0.8)), h * 0.35, 0.8, 0.03 * i, 1.6, 0.5); }
        vfx('explosion', V(c.x, c.y + 0.6, c.z), { element: 'ice', scale: 0.8 + r * 0.2 });
      } else if (el === 'earth') {
        S.fx.rockSpikes.spawn(V(c.x, c.y - 0.2, c.z), p.smashRot || p.knockdown ? 4.5 : 3, p.knockdown ? 3.2 : 2, 0, 2.4, 0.1);
        vfx('debris', V(c.x, c.y + 0.4, c.z), { count: 14, size: 0.4, speed: 9, material: 'rock' });
        vfx('shockwave', c, { color: 0xf0c890, radius: r + 1.5, duration: 0.45, opacity: 0.9, thickness: 0.4 });
      } else if (el === 'fire') {
        vfx('burst', V(c.x, c.y + 0.3, c.z), { count: 30, shape: 'puff', color: [0xffe08a, 0xd02008], speed: 9, spread: 0.25, dir: S.UP, size: 0.8, sizeEnd: 1.6, life: 0.8, gravity: -3, drag: 2, alpha: 1 });
        vfx('explosion', V(c.x, c.y + 1, c.z), { element: 'fire', scale: 1.1 });
        S.terrain('ignite', c, r);
      } else {
        vfx('beam', V(c.x, c.y + 20, c.z), V(c.x, c.y, c.z), { color: palOf(el).b, width: r * 0.5, duration: 0.4, jagged: 0, segments: 2 });
        spikeAt(el, c.clone(), 2.4, 1.6, 0, 1.6);
      }
      E.moves.payload(el, c, { r, dmg: dmgOf(ctx), kb: p.knockdown ? 9 : 3, launch: p.launch ?? 2, big: true, spec: { status: p.status, ctx, poise: p.break } });
      const plat = p.platform && (p.platform === true ? { h: p.h || 6, life: p.life || 8 } : p.platform);
      if (plat) { try { game.world?.addPlatform?.({ shape: 'disc', center: { x: c.x, y: c.y, z: c.z }, r: Math.max(1.2, r * 0.6), top: c.y + (plat.h || 2.5), life: plat.life || 8, owner: 'player' }); } catch (_) { /* */ } }
      vfx('fovKick', 4, 0.3);
    } });
  };

  A.chain = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'thrust', dur: 0.6, strike: () => {
      if (casterFx(ctx, 'chain')) return;
      const el = ctx.element;
      let from = S.getWeaponPoint('main', V());
      const hitSet = new Set();
      let cur = ctx.aim?.target?.alive ? ctx.aim.target : S.findTarget(p.range || 8, -0.2);
      const n = clamp((p.n || 2) + (game.stats?.get?.('chainBonus') || 0), 1, 8);
      for (let i = 0; i < n && cur; i++) {
        hitSet.add(cur);
        const c = S.centerOf(cur, V());
        vfx('beam', from.clone(), c, { color: palOf(el).a, width: 0.16, duration: 0.18, jagged: 0.8, segments: 10, branches: 1 });
        S.applyHit(cur, spec(ctx, { kb: 1.5 }), c, _u.subVectors(c, from).normalize().clone(), el);
        from = c;
        let best = null, bd = (p.range || 8) ** 2;
        for (const e of S.foesNear(c, p.range || 8, near)) { if (hitSet.has(e)) continue; const d = e.object.position.distanceToSquared(c); if (d < bd) { bd = d; best = e; } }
        cur = best;
      }
    } });
  };

  A.rain = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'raiseSlam', dur: 0.9, hitT: 0.45, strike: () => {
      if (casterFx(ctx, 'rain')) return;
      const el = ctx.element;
      const c = aimPoint(ctx, 14);
      const area = (p.r || 6) * (p.n ? 1 : 1);
      const every = p.every || 0.3;
      const n = p.n || Math.max(1, Math.round((p.dur || 3) / every));
      const strikeR = p.n ? Math.min(area, 6) : 2.6;
      vfx('runeCircle', c, { element: el, r: Math.min(area, 9), dur: n * every + 0.6, rotSpeed: 1.5 });
      for (let i = 0; i < n; i++) {
        S.after((p.delay || 0.2) + i * every, () => {
          const q = n === 1 ? c : ground(V(c.x + rand(-area, area) * 0.7, 0, c.z + rand(-area, area) * 0.7));
          E.moves.payload(el, q, { r: strikeR, dmg: dmgOf(ctx), kb: 4, tier: kindOf(ctx) === 'ultimate' ? 'ult' : 'heavy', spec: { status: p.status, ctx } });
        });
      }
    } });
  };

  A.summon = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'thrust', dur: 0.7, hitT: ctx.def?.melee?.hitT ?? 0.4, strike: (a) => {
      if (casterFx(ctx, 'summon')) return;
      const el = ctx.element;
      const c = front(2.2, a.yaw0);
      const life = p.life || p.dur || 8;
      if (p.kind === 'totem') S.fx.rockSpikes.spawn(V(c.x, c.y - 0.1, c.z), 2.6, 1.6, 0, life, 0.05);
      else if (p.kind === 'clone') { for (let k = 0; k < 3; k++) S.after(k * 0.05, () => P().spawnGhost(ghostC.setHex(0x7fd3ff), 0.9, 0.8)); }
      else if (p.kind === 'beacon' || p.kind === 'mirror') { vfx('beam', V(c.x, c.y + 6, c.z), V(c.x, c.y, c.z), { color: 0xffe9a8, width: 0.25, duration: 0.6, jagged: 0, segments: 2 }); spikeAt('light', c.clone(), 1.4, 0.6, 0, life); }
      else spikeAt(el, c.clone(), 1.8, 0.8, 0, life);
      vfx('runeCircle', c, { element: el, r: 1.6, dur: Math.min(life, 6), rotSpeed: 2 });
      if (p.taunt || p.tauntR) {
        const fake = { object: { position: c.clone() }, team: 'player', alive: true, isDecoy: true, radius: 0.6, height: 1.6 };
        try { game.enemies?.setTauntTarget?.(fake, life); } catch (_) { /* */ }
        S.after(life, () => { fake.alive = false; });
      }
      if (p.kind === 'rod' && p.puddleR) S.terrain('wet', c, 0.1);
      const b = p.burst || p.slam;
      S.hitCircle(V(c.x, c.y + 0.6, c.z), (b?.r || 3.5) * rm(), spec(ctx, { amount: p.dmg || b?.dmg || 10, kb: 3, status: p.status || b?.status }), null, 3, el);
      if (b && p.burst) S.after(life, () => E.moves.payload(el, c, { r: b.r || 4, dmg: b.dmg || 40, kb: 6, spec: { status: b.status, ctx } }));
    } });
  };

  A.blink = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'iaido', dur: 0.62, hitT: ctx.def?.melee?.hitT ?? 0.2, strike: (a) => {
      const el = ctx.element;
      const from = pos().clone();
      const tgt = ctx.aim?.target?.alive ? ctx.aim.target : S.findTarget(p.range || p.dist || 10, 0.2);
      let to;
      if (p.behind && tgt) {
        const tp = tgt.object.position;
        _d.subVectors(tp, from).setY(0); if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1); _d.normalize();
        to = V(tp.x + _d.x * ((tgt.radius || 0.5) + 1.1), tp.y, tp.z + _d.z * ((tgt.radius || 0.5) + 1.1));
      } else {
        const dist = Math.min(p.dist || p.range || 10, 14);
        to = V(from.x + Math.sin(a.yaw0) * dist, from.y, from.z + Math.cos(a.yaw0) * dist);
      }
      for (let k = 0; k < 4; k++) S.after(0.015 * k, () => P().spawnGhost(ghostC.setHex(palOf(el).a), 0.4, 0.7));
      P().teleport(to);
      if (tgt && p.behind) { const yb = Math.atan2(tgt.object.position.x - pos().x, tgt.object.position.z - pos().z); P().setFacing(yb); a.yaw0 = yb; }
      iframes(p.iframes || 0.25);
      const f1 = from.clone(); f1.y += 1; const t1 = pos().clone(); t1.y += 1;
      vfx('beam', f1, t1, { color: palOf(el).a, width: 0.22, duration: 0.2, jagged: el === 'lightning' ? 0.7 : 0.1, segments: 10, branches: el === 'lightning' ? 1 : 0 });
      _d.subVectors(to, from).setY(0); const L = _d.length(); if (L > 0.1) _d.multiplyScalar(1 / L);
      S.hitLine(from, _d.clone(), L + 1, (p.width || 1.8) * rm(), spec(ctx, { kb: 3, dirMode: 'out' }), null, el);
      if (tgt && p.behind) S.applyHit(tgt, spec(ctx, { kb: 2 }), S.centerOf(tgt, V()), _d.clone(), el);
      S.arc({ yaw: a.yaw0, a0: -1.8, a1: 1.7, rout: 2.8, rin: 1.0, h: 1.1, sweep: 0.05, life: 0.28, el });
      if (p.nextCrit) rider(ctx, { critChance: 1, critMul: (p.nextCrit.mul || 1.5) - 1 }, p.nextCrit.window || 1.5);
      S.sfx('blink', { position: from });
    } });
  };

  A.dash = (ctx) => {
    const p = ctx.params;
    const dist = Math.min(p.dist || 10, 16);
    let start = null, dir = null, traveled = 0;
    const set = new Set();
    const t0 = ctx.def?.melee?.hitT ?? 0.18;
    begin(ctx, { tpl: 'iaido', dur: 0.75, hitT: t0, gravityMul: 0.4, update: (dt, a, A2) => {
      const k = a.t / a.dur;
      if (k < t0 || traveled >= dist) return;
      if (!start) { start = pos().clone(); dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0)); iframes(p.iframes || 0.3); }
      const sp = dist / (0.2 * a.dur / a.speed);
      A2.vel.copy(dir).multiplyScalar(sp); traveled += sp * dt / a.speed;
      const q = pos();
      if (Math.random() < 0.6) P().spawnGhost(ghostC.setHex(palOf(ctx.element).a), 0.3, 0.6);
      trailFx(ctx.element, V(q.x, q.y + 0.6, q.z));
      if (p.ignite) S.terrain('ignite', V(q.x, S.groundAt(q.x, q.z), q.z), 1);
      S.hitLine(start, dir, traveled + 1.2, (p.width || 2) * rm(), spec(ctx, { kb: p.knockback ?? 5, dirMode: 'out' }), set, ctx.element);
    }, strike: (a) => {
      S.sfx('sword_swing_heavy', { pitch: 0.85 }); vfx('fovKick', 6, 0.3);
      S.arc({ yaw: a.yaw0, a0: -2.0, a1: 1.8, rout: 3.2, rin: 1.2, h: 1.1, sweep: 0.08, life: 0.4, el: ctx.element });
      if (p.nextHit) rider(ctx, { atkMul: p.nextHit.mul || 1.3 }, p.nextHit.window || 2);
      if (p.puddles) for (let d = 2; d <= dist; d += 4) { const q = front(d, a.yaw0); S.after(d * 0.02, () => S.zone('water', q, { r: 2, dur: 6 })); }
    } });
  };

  A.leapslam = (ctx) => {
    const p = ctx.params;
    let target = null;
    const up = p.up || 4;
    begin(ctx, { tpl: 'leapSlam', dur: 1.0, hitT: ctx.def?.melee?.hitT ?? 0.6, setVy: [[0.08, 6 + up * 1.4], [0.5, -20]], gravityMul: 0.8,
      events: [[0.06, () => { target = aimPoint(ctx, p.range || 10); vfx('telegraph', { shape: 'circle', pos: target, r: (p.r || 5) * rm(), dur: 0.5, color: 'damage' }); S.sfx('jump', { pitch: 0.8 }); }]],
      update: (dt, a, A2) => {
        const k = a.t / a.dur;
        if (!target || k < 0.08 || k > 0.58) return;
        _t.subVectors(target, pos()).setY(0);
        const d = _t.length();
        if (d > 0.2) A2.vel.copy(_t).multiplyScalar(Math.min(d / Math.max(0.05, (0.58 - k) * a.dur / a.speed), 30) / d);
      },
      strike: () => {
        const c = ground(pos().clone());
        const r = (p.r || 5) * rm();
        vfx('shockwave', c, { color: palOf(ctx.element).a, radius: r + 1, duration: 0.5, opacity: 0.9, thickness: 0.45 });
        vfx('debris', V(c.x, c.y + 0.3, c.z), { count: 12, size: 0.35, speed: 9, material: 'rock' });
        if (ctx.element === 'lightning') vfx('beam', V(c.x, c.y + 22, c.z), c.clone(), { color: 0xe8d8ff, width: 0.6, duration: 0.3, jagged: 1.2, segments: 14, branches: 3 });
        E.moves.payload(ctx.element, c, { r, dmg: dmgOf(ctx), kb: 7, launch: p.launch ?? 3, big: true, spec: { status: p.status, ctx } });
        if (p.electrifyR) S.terrain('wet', c, 0.1);
        vfx('fovKick', 7, 0.4);
        S.sfx('explode_' + ctx.element, { position: c });
      } });
  };

  A.grapple = (ctx) => {
    const p = ctx.params;
    let pullTo = null;
    begin(ctx, { tpl: 'reverseSlash', dur: 0.7, hitT: ctx.def?.melee?.hitT ?? 0.3, update: (dt, a, A2) => {
      if (!pullTo || a.t > a.dur * 0.75) return;
      _t.subVectors(pullTo, pos()).setY(0);
      const d = _t.length();
      if (d > 1.5) A2.vel.copy(_t).multiplyScalar(Math.min(22, d / 0.15) / d);
    }, strike: () => {
      const range = p.range || 16;
      const tip = S.getWeaponPoint('main', V());
      const tgt = ctx.aim?.target?.alive && ctx.aim.target.object.position.distanceTo(pos()) <= range + 1 ? ctx.aim.target : S.findTarget(range, 0.3);
      const small = tgt && !tgt.isBoss && (tgt.mass || 1) <= 2.5;
      const to = tgt ? S.centerOf(tgt, V()) : aimPoint(ctx, range).setY(pos().y + 1);
      vfx('beam', tip, to, { color: 0x6fcf4a, width: 0.13, duration: 0.4, jagged: 0.3, segments: 12 });
      vfx('burst', to, { count: 12, shape: 'leaf', additive: false, color: [0xc8f080, 0x4f9a2a], speed: 4, spread: 1, size: 0.16, life: 0.8, gravity: 2, drag: 1.5 });
      if (tgt) {
        _u.subVectors(pos(), tgt.object.position).setY(0); const d = _u.length(); if (d > 1e-3) _u.multiplyScalar(1 / d);
        S.applyHit(tgt, spec(ctx, { kb: small && p.pullSmall !== false ? Math.min(12, d * 1.6) : 0 }), to, _u.clone(), ctx.element);
      }
      if (!tgt || !small) pullTo = to.clone();
    } });
  };

  A.buff = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'raise', dur: 0.62, hitT: 0.35, strike: () => {
      if (casterFx(ctx, 'buff')) return;
      const el = ctx.element, c = palOf(el);
      const dur = p.dur || 8;
      const mods = { ...(p.mods || null) };
      if (p.nextHit) mods.atkMul = (mods.atkMul || 1) * (p.nextHit.mul || 1.3);
      if (p.firstHit) { mods.atkMul = (mods.atkMul || 1) * (p.firstHit.mul || 1.5); if (p.firstHit.crit) mods.critChance = (mods.critChance || 0) + 1; }
      rider(ctx, mods, dur);
      try { vfx('emitter', { follow: P().object, offset: V(0, 1, 0), rate: 16, count: 1, color: [c.a, c.b], speed: 1.2, spread: 1, size: 0.12, sizeEnd: 0, life: 0.6, shape: 'spark', gravity: -1.5, drag: 1, duration: Math.min(dur, 15) }); } catch (_) { /* */ }
      vfx('shockwave', ground(pos().clone()), { color: c.a, radius: 3.5, duration: 0.5, opacity: 0.8 });
      vfx('runeCircle', ground(pos().clone()), { element: el, r: 2.2, dur: 1, rotSpeed: 3 });
      if (p.dome) vfx('dome', pos().clone(), { color: c.a, radius: p.dome.r || 3, duration: dur });
      if (p.stealth) { try { game.enemies?.setPlayerStealth?.(true, dur); } catch (_) { /* */ } }
      const pl = P();
      if (p.hotPct) S.every(0.5, dur, () => { try { game.combat?.healPlayer?.(pl.maxHp * p.hotPct * 0.5 / dur, 'skill:' + ctx.skillId, { hot: true }); } catch (_) { /* */ } });
      if (p.shieldPct) { try { game.combat?.healPlayer?.(pl.maxHp * p.shieldPct * 0.2, 'skill:' + ctx.skillId); } catch (_) { /* */ } }
      if (p.bloom) S.after(dur, () => {
        try { game.combat?.healPlayer?.(pl.maxHp * (p.bloom.healPct || 0.1), 'skill:' + ctx.skillId); } catch (_) { /* */ }
        E.moves.payload(el, ground(pos().clone()), { r: p.bloom.r || 4, dmg: p.bloom.dmg || 40, kb: 4, spec: { ctx } });
      });
      S.sfx('cast_' + el, { position: pos() }); S.sfx('blessing', { volume: 0.5 });
    } });
  };

  A.mark = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'thrust', dur: 0.62, strike: () => {
      if (casterFx(ctx, 'mark')) return;
      const el = ctx.element;
      const c = aimPoint(ctx, p.range || 14);
      const list = p.r ? S.foesNear(c, p.r * rm(), near).slice() : (ctx.aim?.target?.alive ? [ctx.aim.target] : [S.findTarget(p.range || 14, 0.2)].filter(Boolean));
      vfx('runeCircle', c, { element: el, r: Math.max(1.5, (p.r || 1.5) * rm()), dur: 1.2, rotSpeed: 2 });
      for (const e of list) {
        const q = S.centerOf(e, V());
        E.moves.flourish(el, q, true);
        S.applyHit(e, spec(ctx, { kb: 0.5, poise: e.isBoss ? p.bossBreak : undefined }), q, _u.subVectors(q, pos()).setY(0).normalize().clone(), el);
      }
    } });
  };

  A.chainbind = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'slashR', dur: 0.7, strike: () => {
      if (casterFx(ctx, 'chainbind')) return;
      const el = ctx.element;
      const list = S.foesNear(pos(), (p.range || 10) * rm(), near).slice(0, p.n || 4);
      const dur = p.dur || 3;
      for (const e of list) {
        const q = S.centerOf(e, V());
        S.applyHit(e, spec(ctx, { kb: 0, poise: e.isBoss ? p.bossBreak : undefined }), q, _u.subVectors(q, pos()).setY(0).normalize().clone(), el);
      }
      S.every(0.35, dur, () => {
        const tip = S.getWeaponPoint('main', _t);
        for (const e of list) if (e.alive) vfx('beam', tip.clone(), S.centerOf(e, V()), { color: palOf(el).a, width: 0.08, duration: 0.36, jagged: 0.12, segments: 6 });
      });
    } });
  };

  A.tether = (ctx) => {
    const p = ctx.params;
    const lashes = clamp(p.lashes || 3, 1, 8), dur = clamp(p.dur || 1.2, 0.3, 2.5);
    const every = dur / lashes;
    let n = 0;
    begin(ctx, { tpl: 'slashL', dur: dur + 0.35, hitT: 0.12 / (dur + 0.35), loop: (dur + 0.35) / lashes, strike: () => {
      S.every(every, dur + 0.01, () => {
        if (n >= lashes) return false;
        n++;
        const el = ctx.element;
        const yaw = aimYaw(ctx);
        const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
        const len = (p.len || 10) * (0.9 + 0.1 * rm());
        const tip = S.getWeaponPoint('main', V());
        const end = V(pos().x + dir.x * len, pos().y + 1, pos().z + dir.z * len);
        vfx('beam', tip, end, { color: palOf(el).a, width: 0.2, duration: every * 0.9, jagged: 0.3, segments: 12 });
        S.arc({ yaw, a0: n % 2 ? 1.5 : -1.5, a1: n % 2 ? -1.5 : 1.5, rout: 3.0, rin: 1.0, h: 1.1, sweep: 0.05, life: 0.25, el, tilt: n % 2 ? 0.4 : -0.4 });
        const last = n === lashes;
        const pull = (last && p.pullLast) || p.pullAll;
        const st = p.chillPerLash ? { ...(p.status || null), chilled: { stacks: p.chillPerLash } } : p.status;
        const sp = spec(ctx, { kb: pull ? 8 : 2, dirMode: pull ? 'in' : 'out', status: st, heavy: last, tier: last ? 'heavy' : 'light' });
        S.hitLine(pos().clone(), dir, len, 2.0 * rm(), sp, null, el);
        if (p.extinguish) for (let d = 2; d <= len; d += 3) S.terrain('extinguish', ground(V(pos().x + dir.x * d, 0, pos().z + dir.z * d)), 2);
        S.sfx('sword_swing', { pitch: 1.1 + n * 0.05 });
      });
    } });
  };

  A.lane = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'slashR', dur: 0.66, strike: (a) => {
      if (casterFx(ctx, 'lane')) return;
      const el = ctx.element;
      const len = p.len || 12, w = (p.width || 3) * rm();
      const start = pos().clone(), dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0));
      for (let d = 1; d <= len; d += 1.2) {
        const q = ground(V(start.x + dir.x * d, 0, start.z + dir.z * d));
        S.after(d * 0.02, () => { spikeAt(el, q, 0.35, 1.1, 0, p.dur || 8); if (el === 'ice') S.terrain('freeze', q, w * 0.6); });
      }
      const dur = p.dur || 8;
      S.hitLine(start, dir, len, w, spec(ctx, { kb: 1 }), null, el);
      S.every(1, dur, () => { S.hitLine(start, dir, len, w, tickSpec(ctx, p.dmg ? p.dmg * 0.5 : 2), null, el); });
      if (p.selfMoveMul) rider(ctx, { moveMul: p.selfMoveMul }, dur);
    } });
  };

  A.mine = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'thrust', dur: 0.55, strike: (a) => {
      if (casterFx(ctx, 'mine')) return;
      const el = ctx.element;
      const c = front(2.2 * rm(), a.yaw0);
      while (mines.filter((m) => m.alive).length >= Math.min(MAX_MINES, p.max || 3)) { const old = mines.find((m) => m.alive); if (!old) break; old.alive = false; }
      const m = { alive: true, pos: c, life: p.life || 20, r: p.r || 2.5, el };
      mines.push(m); if (mines.length > MAX_MINES * 2) mines.splice(0, mines.length - MAX_MINES);
      spikeAt(el, c.clone(), 0.7, 0.45, 0, m.life);
      vfx('shockwave', c, { color: palOf(el).a, radius: 1.2, duration: 0.25, opacity: 0.8 });
      const boom = () => {
        if (!m.alive) return; m.alive = false;
        E.moves.payload(el, m.pos, { r: m.r, dmg: dmgOf(ctx), kb: 5, spec: { status: p.status, ctx } });
        S.sfx('explode_' + el, { position: m.pos, volume: 0.8 });
      };
      S.every(0.1, m.life, () => {
        if (!m.alive) return false;
        if (S.foesNear(m.pos, m.r, near).length) { boom(); return false; }
      });
      S.after(m.life, () => { m.alive = false; });
    } });
  };

  A.bubble = (ctx) => {
    const p = ctx.params;
    begin(ctx, { tpl: 'thrust', dur: 0.6, strike: () => {
      if (casterFx(ctx, 'bubble')) return;
      const el = ctx.element;
      const tgt = ctx.aim?.target?.alive ? ctx.aim.target : S.findTarget(p.range || 16, 0.2);
      if (!tgt) { E.moves.payload(el, aimPoint(ctx, 8), { r: p.popR || 3, dmg: p.popDmg || 20, spec: { status: p.status, ctx } }); return; }
      const dur = p.dur || 2.5;
      const q = S.centerOf(tgt, V());
      S.applyHit(tgt, spec(ctx, { amount: p.dmg || 6, kb: 0, launch: tgt.isBoss ? 0 : 3, poise: tgt.isBoss ? p.bossBreak : undefined, tier: 'light' }), q, V(0, 1, 0), el);
      S.every(0.2, dur, () => { if (!tgt.alive) return false; vfx('burst', S.centerOf(tgt, _t), { count: 3, shape: 'bubble', color: [0xe8f8ff, palOf(el).a], speed: 1.2, spread: 1, size: 0.3, sizeEnd: 0.1, life: 0.4, gravity: -1 }); if (!tgt.isBoss && tgt.velocity) tgt.velocity.y = Math.max(tgt.velocity.y, 0.6); });
      S.after(dur, () => { const at = ground(tgt.object.position.clone()); E.moves.payload(el, at, { r: p.popR || 3, dmg: p.popDmg || 30, kb: 3, spec: { status: p.status, ctx } }); });
    } });
  };

  // ------------------------------------------------------------------ registration (factory time)
  let n = 0;
  for (const name of MELEE_ARCHETYPES) {
    const fn = A[name];
    if (!fn) continue;
    // v4: every skill runs inside its cast context (castId from the skills runtime, tier from the def, bespoke row if any)
    const wrapped = (ctx) => {
      const L = E.look;
      const cc = L ? L.begin({ skillId: ctx.skillId, el: ctx.element, castId: ctx.castId, kind: kindOf(ctx), archetype: name }) : null;
      const prev = L ? L.cur : null; if (L) L.cur = cc;
      try { fn(ctx); } catch (err) { warnOnce(name, err); throw err; } finally {
        // a skill that started no engine action still gets its look (start + strike at once)
        if (L && cc && (cc.row || cc.arch) && !cc.started) { cc.started = true; L.hook('start', null, ctx); L.hook('strike', null, ctx); }
        if (L) L.cur = prev;
      }
    };
    try { R?.registerArchetype?.(name, 'melee', wrapped); n++; } catch (err) { warnOnce('register:' + name, err); }
  }
  return {
    names: MELEE_ARCHETYPES.slice(), count: n, mines, impl: A,
    update() { /* mines/zones run on the engine scheduler */ },
    warmup() { return []; },   // archetypes reuse the engine's pooled fx (already pre-warmed)
    helpers: { begin, spec, tickSpec, dmgOf, aimPoint, aimYaw, casterFx, iframes, slashWave, meleeZone, spikeAt, rider, kindOf },
  };
}
