// Bespoke MELEE forms of the four new-element ultimates and their awakened versions (CONTRACT §12, DESIGN §6.9–6.12),
// registered in the sword FACTORY with game.archetypes.registerImpl(id, 'melee', fn). The caster forms are magic's.
//  water.ult     대홍수        — the blade is driven into the ground; a flood ring r 14 for 10 s, 3 waves × 40
//  water.awakened 대해일 · 각성 — three rolling tsunami slashes × 90, puddles stay 30 s
//  nature.ult    세계수의 분노  — the weapon is planted; root rings erupt outward to 12 m, 6 × 50, root + seed
//  nature.awakened 세계수 강림 · 각성 — a giant thorn sapling + a 12 s overgrowth zone r 10 (roots, seeds, heals 2 %/s)
//  light.ult     새벽의 심판    — a 30 m prism beam from the raised blade for 2.5 s, swept by the aim; judgment on 5-stack targets
//  light.awakened 아스트라의 빛 · 각성 — three beams (gigaflare)
//  shadow.ult    어둠의 심연    — a thrown shadow blade opens a black hole r 8 at the aim point: pull 3 s, implode 150
//  shadow.awakened 영겁의 밤 · 각성 — three black holes in sequence
// UNSCALED base damage; every hit goes through ctx.hit (CONTRACT §8.3).
import * as THREE from 'three';
import { clamp, rand } from '../core/utils.js';

const TWO_PI = Math.PI * 2;

export function registerMeleeBespoke(game, E) {
  const S = E.S;
  const A = game.archetypes || game.skills;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const vfx = (n, ...a) => S.vcall(n, ...a);
  const P = () => game.player;
  const pos = () => P().object.position;
  const ground = (p) => { p.y = S.groundAt(p.x, p.z); return p; };
  const near = [];
  const _t = V(), _u = V(), _d = V();
  const H = () => E.archHelpers;   // shared helpers from archetypes.js (begin / spec / aimPoint …)

  function water(ctx, awakened) {
    const p = ctx.params, h = H();
    h.begin(ctx, { tpl: 'plunge', dur: 1.05, hitT: 0.4, strike: (a) => {
      const c = ground(pos().clone());
      vfx('screenFlash', 0x7fd3ff, 0.18, 0.3); vfx('fovKick', 7, 0.5);
      if (awakened) {
        const n = p.n || 3;
        for (let i = 0; i < n; i++) S.after(i * (p.every || 0.8), () => {
          const yaw = h.aimYaw(ctx);
          vfx('shockwave', ground(pos().clone()), { color: 0x7fd3ff, radius: 5, duration: 0.45, opacity: 0.8 });
          h.slashWave(ctx, yaw, { speed: 18, len: 20, width: (p.r || 7) * 1.6, pierce: true, kb: 12, spec: { tier: 'ult', amount: p.dmg || 90 } });
          for (let d = 4; d <= 20; d += 5) { const q = ground(V(pos().x + Math.sin(yaw) * d, 0, pos().z + Math.cos(yaw) * d)); S.after(d / 18, () => { E.moves.payloadFx('water', q, 2.5); S.zone('water', q, { r: p.puddle?.r || 4, dur: p.puddle?.dur || 30 }); }); }
          S.sfx('cast_water', { position: pos() });
        });
        return;
      }
      const r = p.r || 14, dur = p.dur || 10;
      S.zone('flood', c, { r, dur, source: ctx.skillId, rxBonus: p.rxBonus });
      S.terrain('wet', c, r);
      vfx('runeCircle', c, { element: 'water', r: 9, dur, rotSpeed: 0.6 });
      vfx('groundDecal', 'ripple', c, r, dur);
      const waves = p.waves || 3, every = p.every || 3;
      for (let i = 0; i < waves; i++) S.after(0.25 + i * every, () => {
        const cc = ground(pos().clone());
        vfx('shockwave', cc, { color: 0x7fd3ff, radius: r, duration: 0.8, opacity: 0.85, thickness: 0.5 });
        for (let k = 0; k < 12; k++) { const an = (k / 12) * TWO_PI; vfx('burst', V(cc.x + Math.sin(an) * r * 0.6, cc.y + 0.3, cc.z + Math.cos(an) * r * 0.6), { count: 4, shape: 'droplet', color: [0xe8d9b0, 0x4fb4ff], speed: 6, spread: 0.4, dir: S.UP, size: 0.16, life: 0.7, gravity: 12 }); }
        S.hitCircle(V(cc.x, cc.y + 0.6, cc.z), r, h.spec(ctx, { amount: p.dmg || 40, kb: 7, tier: 'ult', dirMode: 'out' }), null, 4, 'water');
        S.sfx('explode_water', { position: cc });
      });
      // the flood keeps everyone inside wet
      S.every(1, dur, () => { for (const e of S.foesNear(c, r, near)) { try { game.combat?.applyStatus?.(e, 'wet', 3, { source: P().entity, el: 'water' }); } catch (_) { /* */ } } });
    } });
  }

  function nature(ctx, awakened) {
    const p = ctx.params, h = H();
    h.begin(ctx, { tpl: 'overhead', dur: 1.0, hitT: 0.5, strike: () => {
      const c = ground(pos().clone());
      vfx('fovKick', 6, 0.45);
      if (awakened) {
        const at = h.aimPoint(ctx, 8);
        for (let i = 0; i < 7; i++) { const an = (i / 7) * TWO_PI; S.fx.crystal.spawn(ground(V(at.x + Math.sin(an) * 0.9, 0, at.z + Math.cos(an) * 0.9)), 4 + Math.random() * 2, 0.9, 0.05 * i, p.dur || 12, 0.35, 0x3f8f2a); }
        S.fx.crystal.spawn(at.clone(), 7, 1.6, 0, p.dur || 12, 0.05, 0x5fbf3a);
        h.meleeZone(ctx, at, { ...p, type: 'overgrowth' });
        E.moves.payload('nature', at, { r: p.r || 10, dmg: p.dmg || 60, kb: 3, big: true, tier: 'ult', spec: { status: p.status, ctx } });
        return;
      }
      const n = p.n || 6, ring = p.ring || 12, every = p.every || 0.18;
      const sp = h.spec(ctx, { amount: p.dmg || 50, kb: 3, launch: 2, tier: 'ult', dirMode: 'out' });
      for (let i = 0; i < n; i++) S.after(i * every, () => {
        const r0 = (i / n) * ring, r1 = ((i + 1) / n) * ring;
        const cnt = 6 + i * 3;
        for (let k = 0; k < cnt; k++) { const an = (k / cnt) * TWO_PI + i * 0.4, rr = (r0 + r1) * 0.5; S.fx.crystal.spawn(ground(V(c.x + Math.sin(an) * rr, 0, c.z + Math.cos(an) * rr)), 1.4 + Math.random() * 1.2, 0.5 + Math.random() * 0.3, 0, 1.6, 0.5, k % 2 ? 0x5fbf3a : 0x3f8f2a); }
        vfx('shockwave', c, { color: 0x8fe05a, radius: r1, duration: 0.3, opacity: 0.7 });
        for (const e of S.foesNear(c, r1, near)) {
          const d = Math.hypot(e.object.position.x - c.x, e.object.position.z - c.z);
          if (d + (e.radius || 0.5) < r0) continue;
          const q = S.centerOf(e, V());
          S.applyHit(e, sp, q, _u.subVectors(q, c).setY(0).normalize().clone(), 'nature');
        }
        if (i === 0) vfx('groundDecal', 'flowers', c, ring, 8);
      });
      S.sfx('cast_nature', { position: c });
    } });
  }

  function light(ctx, awakened) {
    const p = ctx.params, h = H();
    const dur = clamp(p.dur || 2.5, 0.5, 3.5);
    const nBeams = awakened ? clamp(p.beams || 3, 1, 3) : 1;
    const beams = [];
    const ends = [V(), V(), V()];
    const judged = new Set();
    let tick = 0;
    h.begin(ctx, { tpl: 'raise', dur: dur + 0.7, hitT: 0.4 / (dur + 0.7), cancel: dur + 0.6, move: 0.25,
      strike: () => {
        const tip = S.getWeaponPoint('main', V());
        vfx('flashSprite', tip, 0xfff2c0, 3, 0.3); vfx('screenFlash', 0xfff2c0, 0.2, 0.3);
        try { game.post?.pulse?.(0.4, 0.25); } catch (_) { /* */ }
        for (let i = 0; i < nBeams; i++) beams.push(vfx('beam', tip, ends[i].copy(tip).setY(tip.y + 0.1), { color: i ? 0xffe9a8 : 0xfff6d8, width: (p.width || 1.4) * (i ? 0.45 : 0.6), duration: dur, jagged: 0.04, segments: 10 }));
        vfx('runeCircle', ground(pos().clone()), { element: 'light', r: 2.4, dur, rotSpeed: 3 });
        S.sfx('cast_light', { position: tip }); S.sfx('ultimate', { volume: 0.6 });
      },
      update: (dt, a) => {
        if (!beams.length || a.t < 0.4 || a.t > dur + 0.4) return;
        const tip = S.getWeaponPoint('main', _t);
        const pl = P();
        _d.copy(pl.camForward || V(Math.sin(pl.facing), 0, Math.cos(pl.facing))); _d.y = Math.max(-0.25, Math.min(0.15, _d.y)); _d.normalize();
        const len = p.len || 30;
        tick -= dt;
        const doTick = tick <= 0;
        if (doTick) tick = p.tick || 0.1;
        for (let i = 0; i < beams.length; i++) {
          const yo = i === 0 ? 0 : (i === 1 ? 0.26 : -0.26);
          const cs = Math.cos(yo), sn = Math.sin(yo);
          _u.set(_d.x * cs + _d.z * sn, _d.y, -_d.x * sn + _d.z * cs);
          ends[i].copy(tip).addScaledVector(_u, len);
          beams[i]?.setEnds?.(tip, ends[i]);
          if (!doTick) continue;
          _u.y = 0; _u.normalize();
          const origin = V(pos().x, pos().y, pos().z);
          S.hitLine(origin, _u.clone(), len, (p.width || 1.4) * E.weapon.reachMul, h.tickSpec(ctx, p.dmg || 18, { tags: ['beam', 'prism'], kb: 0.4 }), null, 'light');
          // 새벽의 심판: instant judgment on targets carrying the full radiant stack
          const need = p.judgmentAt || 5;
          for (const e of S.foesNear(V(origin.x + _u.x * len * 0.5, origin.y, origin.z + _u.z * len * 0.5), len * 0.5, near)) {
            if (judged.has(e) || !((e.statuses?.radiant?.stacks || 0) >= need)) continue;
            judged.add(e);
            S.applyHit(e, h.spec(ctx, { amount: p.dmg || 18, tags: ['heavy', 'judgment'], tier: 'ult', kb: 2 }), S.centerOf(e, V()), _u.clone(), 'light');
          }
        }
        if (Math.random() < 0.5) vfx('burst', ends[0], { count: 3, shape: 'mote', color: [0xe8d9b0, 0xffd36a], speed: 4, spread: 1, size: 0.18, life: 0.35 });
      },
    });
  }

  function shadow(ctx, awakened) {
    const p = ctx.params, h = H();
    const count = awakened ? clamp(p.count || 3, 1, 3) : 1;
    h.begin(ctx, { tpl: 'slashR', dur: 0.9, hitT: 0.36, strike: (a) => {
      const base = h.aimPoint(ctx, 12);
      for (let i = 0; i < count; i++) S.after(i * (p.every || 1.2), () => {
        const c = i === 0 ? base : ground(V(base.x + rand(-4, 4), 0, base.z + rand(-4, 4)));
        const tip = S.getWeaponPoint('main', V());
        vfx('beam', tip, V(c.x, c.y + 1, c.z), { color: 0x9a5cff, width: 0.25, duration: 0.25, jagged: 0.2, segments: 8 });
        blackHole(ctx, c, p);
      });
      S.sfx('cast_shadow', { position: pos() });
      void a;
    } });
  }
  function blackHole(ctx, c, p) {
    const h = H();
    const r = p.r || 8, dur = p.dur || 3;
    vfx('runeCircle', c, { element: 'shadow', r: Math.min(r, 9), dur: dur + 0.5, rotSpeed: -3 });
    vfx('groundDecal', 'violet', c, r, dur + 4);
    vfx('dome', V(c.x, c.y + 1.2, c.z), { color: 0x1a0b2e, radius: 1.6, duration: dur });
    S.zone('blackhole', c, { r, dur, source: ctx.skillId });
    let t = 0;
    S.every(0.05, dur, () => {
      t += 0.05;
      for (const e of S.foesNear(c, r, near)) {
        if (e.isBoss || !e.velocity) continue;
        _t.subVectors(c, e.object.position).setY(0);
        const d = _t.length(); if (d < 0.6) continue;
        e.velocity.addScaledVector(_t.multiplyScalar(1 / d), 1.4);
      }
      const an = Math.random() * TWO_PI, rr = r * (0.6 + Math.random() * 0.4);
      _u.set(c.x + Math.sin(an) * rr, c.y + 0.4 + Math.random() * 2, c.z + Math.cos(an) * rr);
      _d.set(c.x - _u.x, c.y + 1.2 - _u.y, c.z - _u.z).normalize();
      vfx('burst', _u, { count: 1, shape: 'wisp', color: [0xe2c8ff, 0x5b2a8a], speed: 7, spread: 0.05, dir: _d, size: 0.3, sizeEnd: 0.05, life: 0.4, drag: 0 });
      if (Math.random() < 0.15) S.fx.crystal.spawn(ground(V(c.x + Math.sin(an) * rr * 0.7, 0, c.z + Math.cos(an) * rr * 0.7)), 0.8, 0.3, 0, 0.6, 0.9, 0x5b2a8a);
    });
    S.after(dur, () => {
      vfx('explosion', V(c.x, c.y + 1, c.z), { element: 'shadow', scale: 2 });
      vfx('shockwave', c, { color: 0xb14bff, radius: r + 1, duration: 0.5, opacity: 0.9, thickness: 0.5 });
      vfx('screenFlash', 0x3a1a5a, 0.22, 0.25);
      try { game.post?.pulse?.(0.5, 0.25); } catch (_) { /* */ }
      E.moves.payload('shadow', c, { r: p.implode?.r || r, dmg: p.implode?.dmg || p.dmg || 150, kb: 10, launch: 3, big: true, tier: 'ult', spec: { status: p.status, ctx } });
      S.sfx('explode_shadow', { position: c });
    });
  }

  const IMPLS = {
    'water.ult': (ctx) => water(ctx, false), 'water.awakened': (ctx) => water(ctx, true),
    'nature.ult': (ctx) => nature(ctx, false), 'nature.awakened': (ctx) => nature(ctx, true),
    'light.ult': (ctx) => light(ctx, false), 'light.awakened': (ctx) => light(ctx, true),
    'shadow.ult': (ctx) => shadow(ctx, false), 'shadow.awakened': (ctx) => shadow(ctx, true),
  };
  const kindOf = (ctx) => (ctx.def?.slot === 'finisher' ? 'finisher' : 'ultimate');
  const wrap = (id, fn) => (ctx) => {
    const L = E.look;
    const cc = L ? L.begin({ skillId: ctx.skillId || id, el: ctx.element, castId: ctx.castId, kind: kindOf(ctx) }) : null;
    const prev = L ? L.cur : null; if (L) L.cur = cc;
    try { fn(ctx); } finally { if (L) L.cur = prev; }
  };
  for (const id in IMPLS) { try { A?.registerImpl?.(id, 'melee', wrap(id, IMPLS[id])); } catch (err) { console.warn('[sword] registerImpl', id, err); } }
  return { ids: Object.keys(IMPLS), warmup() { return []; } };
}
