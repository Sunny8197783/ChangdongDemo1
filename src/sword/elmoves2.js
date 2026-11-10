// New-element melee presentations (DESIGN §6.9–6.12) + the shared element payload used by every melee moveset.
//  - fourth[el](ctx)  : the longsword 4th combo hit for water / nature / light / shadow (classic ones live in moves.js)
//  - heavy[el](f)     : the longsword charged attack for water / nature / light / shadow
//  - payload(el, p, o): one element burst at p (paladin 3rd hammer slam, shadowblade 6th hit, charged endings, archetype
//                       finishers). Data-driven per element (ELEMENT_DEFS status + a melee-only visual), safe for unknown ids.
// All damage numbers are UNSCALED base amounts (combat.dealDamage scales, CONTRACT §8.3).
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { palOf } from './weapons.js';

const TWO_PI = Math.PI * 2;

/** Statuses a payload applies, per element ({dur} / {stacks} schema, CONTRACT §7.1). Unknown → none. */
export const PAYLOAD_STATUS = {
  fire: { burning: { dur: 4 } },
  ice: { chilled: { stacks: 2 } },
  lightning: { shocked: { dur: 4 } },
  wind: null,
  earth: { encrusted: { dur: 6 } },
  water: { wet: { dur: 8 } },
  nature: { seeded: { stacks: 2 } },
  light: { radiant: { stacks: 1 }, dazzled: { dur: 1 } },
  shadow: { corroded: { stacks: 1 }, marked: { stacks: 1 } },
};

export function buildElMoves2(S, h) {
  const game = S.game;
  const { V, ground, front, flourish } = h;
  const P = () => game.player;
  const vfx = (n, ...a) => S.vcall(n, ...a);
  const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3();
  const _ghost = new THREE.Color();
  const near = [];

  // ------------------------------------------------------------ element payload (visual + damage)
  const FX = {
    fire(p, r, big) {
      vfx('explosion', V(p.x, p.y + 0.5, p.z), { element: 'fire', scale: 0.8 + r * 0.15 });
      const n = big ? 10 : 7;
      for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI; vfx('burst', V(p.x + Math.sin(a) * r * 0.8, p.y + 0.2, p.z + Math.cos(a) * r * 0.8), { count: 3, shape: 'puff', color: [0xffc040, 0xd02008], speed: 3, spread: 0.3, dir: S.UP, size: 0.6, sizeEnd: 1.3, life: 0.6, gravity: -4, drag: 3, alpha: 1 }); }
      vfx('groundDecal', 'scorch', p, r, 7);
      S.terrain('ignite', p, Math.min(3, r * 0.7));
    },
    ice(p, r, big) {
      const n = big ? 12 : 8;
      for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI; S.fx.iceSpikes.spawn(ground(V(p.x + Math.sin(a) * r * 0.75, 0, p.z + Math.cos(a) * r * 0.75)), 0.9 + Math.random() * 0.7, 0.6 + Math.random() * 0.3, 0.02 * i, 1.6, 0.45); }
      vfx('shockwave', p, { color: 0xbff4ff, radius: r + 0.6, duration: 0.4, opacity: 0.85 });
      vfx('groundDecal', 'frost', p, r, 7);
      S.terrain('freeze', p, r);
    },
    lightning(p, r) {
      const top = V(p.x + rand(-1.5, 1.5), p.y + 15, p.z + rand(-1.5, 1.5));
      vfx('beam', top, V(p.x, p.y + 0.3, p.z), { color: 0xd8c4ff, width: 0.4, duration: 0.28, jagged: 1.2, segments: 12, branches: 3 });
      vfx('explosion', V(p.x, p.y + 0.5, p.z), { element: 'lightning', scale: 0.7 + r * 0.12 });
      vfx('groundDecal', 'lichtenberg', p, r, 6);
      vfx('screenFlash', 0xe8dcff, 0.14, 0.15);
    },
    wind(p, r) {
      vfx('burst', V(p.x, p.y + 0.4, p.z), { count: 22, shape: 'soft', color: [0xeafff4, 0x6fffbf], speed: 7, spread: 0.35, dir: S.UP, size: 0.4, sizeEnd: 1.2, life: 0.5, drag: 2.5, alpha: 0.55 });
      vfx('shockwave', p, { color: 0xa0ffd8, radius: r + 0.8, duration: 0.35, opacity: 0.75 });
      S.terrain('wind', p, r + 2, null);
    },
    earth(p, r, big) {
      const n = big ? 10 : 7;
      for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI; S.fx.rockSpikes.spawn(V(p.x + Math.sin(a) * r * 0.7, S.groundAt(p.x + Math.sin(a) * r * 0.7, p.z + Math.cos(a) * r * 0.7) - 0.1, p.z + Math.cos(a) * r * 0.7), 0.9 + Math.random() * 0.6, 0.7 + Math.random() * 0.4, 0.02, 1.4, 0.45); }
      vfx('debris', V(p.x, p.y + 0.2, p.z), { count: 8, size: 0.28, speed: 7, material: 'rock' });
      vfx('shockwave', p, { color: 0xf0c890, radius: r + 1, duration: 0.42, opacity: 0.9, thickness: 0.35 });
      vfx('groundDecal', 'crack', p, r + 0.5, 8);
    },
    water(p, r, big) {
      vfx('burst', V(p.x, p.y + 0.3, p.z), { count: big ? 34 : 24, shape: 'droplet', color: [0xe8d9b0, 0x4fb4ff], speed: 7, spread: 0.45, dir: S.UP, size: 0.16, sizeEnd: 0.05, life: 0.7, gravity: 14, drag: 0.8 });
      vfx('burst', V(p.x, p.y + 0.2, p.z), { count: 10, shape: 'bubble', color: [0xe8f8ff, 0x7fd3ff], speed: 3, spread: 1, size: 0.18, sizeEnd: 0.05, life: 0.6, gravity: -1, drag: 2 });
      vfx('shockwave', p, { color: 0x7fd3ff, radius: r + 0.6, duration: 0.45, opacity: 0.85, thickness: 0.25 });
      vfx('groundDecal', 'ripple', p, r, 6);
      S.zone('water', p, { r: Math.min(3, r), dur: 6 });
    },
    nature(p, r, big) {
      const n = big ? 9 : 6;
      for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI + 0.3; S.fx.crystal.spawn(ground(V(p.x + Math.sin(a) * r * 0.7, 0, p.z + Math.cos(a) * r * 0.7)), 0.8 + Math.random() * 0.6, 0.35 + Math.random() * 0.2, 0.03 * i, 1.5, 0.6, 0x5fbf3a); }
      vfx('burst', V(p.x, p.y + 0.5, p.z), { count: 18, shape: 'leaf', additive: false, color: [0xc8f080, 0x4f9a2a], speed: 5, spread: 1, size: 0.16, sizeEnd: 0.08, life: 0.9, gravity: 2, drag: 1.5 });
      vfx('burst', V(p.x, p.y + 0.6, p.z), { count: 8, shape: 'petal', additive: false, color: [0xffe0f0, 0xff9ac8], speed: 3, spread: 1, size: 0.14, life: 1.0, gravity: 1, drag: 1.2 });
      vfx('groundDecal', 'flowers', p, r, 8);
    },
    light(p, r, big) {
      const n = big ? 10 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TWO_PI;
        vfx('beam', V(p.x, p.y + 0.9, p.z), V(p.x + Math.sin(a) * r, p.y + 0.6, p.z + Math.cos(a) * r), { color: 0xffe9a8, width: 0.16, duration: 0.22, jagged: 0, segments: 2 });
      }
      vfx('burst', V(p.x, p.y + 1, p.z), { count: 20, shape: 'mote', color: [0xe8d9b0, 0xffd36a], speed: 4, spread: 1, size: 0.12, sizeEnd: 0, life: 0.6, gravity: -2, drag: 2 });
      vfx('flashSprite', V(p.x, p.y + 1, p.z), 0xffe9a8, 2.4, 0.12);
      vfx('runeCircle', p, { element: 'light', r: r + 0.4, dur: 0.9, rotSpeed: 2 });
      vfx('groundDecal', 'rune', p, r, 6);
    },
    shadow(p, r, big) {
      for (let i = 0; i < (big ? 8 : 5); i++) { const a = (i / 6) * TWO_PI; S.fx.crystal.spawn(ground(V(p.x + Math.sin(a) * r * 0.6, 0, p.z + Math.cos(a) * r * 0.6)), 0.7 + Math.random() * 0.6, 0.3, 0.02 * i, 1.2, 0.8, 0x5b2a8a); }
      vfx('burst', V(p.x, p.y + 0.8, p.z), { count: 22, shape: 'wisp', color: [0xe2c8ff, 0x5b2a8a], speed: 4, spread: 1, size: 0.3, sizeEnd: 0.6, life: 0.6, gravity: -1, drag: 2.5 });
      vfx('burst', V(p.x, p.y + 0.9, p.z), { count: 6, shape: 'feather', additive: false, color: [0x2a1640, 0x120820], speed: 3.5, spread: 1, size: 0.2, life: 0.9, gravity: 1.5, drag: 1.5 });
      vfx('shockwave', p, { color: 0xb14bff, radius: r + 0.5, duration: 0.4, opacity: 0.85 });
      vfx('groundDecal', 'violet', p, r, 7);
    },
  };
  /**
   * Element burst at ground point p. o: {r=3, dmg=24, kb, launch, big, set, spec (extra hit fields), statusMul}
   * Returns the number of enemies hit.
   */
  function payload(el, p, o = {}) {
    const r = o.r ?? 3, big = !!o.big;
    try { (FX[el] || FX.wind)(p, r, big); } catch (err) { /* presentation only */ }
    const st = PAYLOAD_STATUS[el] || null;
    const spec = { amount: o.dmg ?? 24, kb: o.kb ?? 5, launch: o.launch ?? (el === 'wind' ? 6 : 1.5), status: st || undefined, heavy: true, tier: o.tier || 'heavy',
      dirMode: el === 'nature' && o.pull ? 'in' : 'out', poise: o.poise, ...(o.spec || null) };
    return S.hitCircle(V(p.x, p.y + 0.6, p.z), r, spec, o.set || null, 3, el);
  }

  // ------------------------------------------------------------ longsword 4th hits
  const fourth = {
    water: () => ({
      name: 'c4_water', kind: 'combo', tpl: 'reverseSlash', dur: 0.66, cancel: 0.6, lunge: 2.4, lungeT: [0.1, 0.42], trail: [0.3, 0.75],
      hits: [{ t0: 0.34, t1: 0.52, shape: 'arc', a0: 1.7, a1: -1.6, reach: 2.8, spec: { amount: 16, kb: 3, status: { wet: { dur: 8 } }, onHit: (e, p) => flourish('water', p, true) },
        arc: { tilt: -0.75, h: 1.0, life: 0.34 } }],
      events: [[0.5, (a) => { const p = front(1.8, a.yaw0); payload('water', p, { r: 3, dmg: 22, kb: 6, launch: 1 }); S.sfx('cast_water', { position: p }); S.sfx('explode_water', { position: p, volume: 0.6 }); }]],
    }),
    nature: () => ({
      name: 'c4_nature', kind: 'combo', tpl: 'reverseSlash', dur: 0.7, cancel: 0.62, lunge: 2.2, lungeT: [0.1, 0.42], trail: [0.3, 0.78],
      hits: [{ t0: 0.34, t1: 0.52, shape: 'arc', a0: 1.7, a1: -1.6, reach: 2.7, spec: { amount: 15, kb: 2, status: { seeded: { stacks: 1 } }, onHit: (e, p) => flourish('nature', p, true) },
        arc: { tilt: -0.75, h: 1.0, life: 0.34 } }],
      events: [[0.5, (a) => { vineLash(a.yaw0, 7, 20); S.sfx('cast_nature', { position: S.pos() }); }]],
    }),
    light: () => ({
      name: 'c4_light', kind: 'combo', tpl: 'overhead', dur: 0.66, cancel: 0.62, lunge: 2.8, lungeT: [0.15, 0.48], trail: [0.3, 0.75],
      hits: [{ t0: 0.38, t1: 0.54, shape: 'sector', half: 0.6, reach: 2.9, spec: { amount: 18, kb: 4, status: { radiant: { stacks: 1 } }, onHit: (e, p) => flourish('light', p) },
        arc: { tilt: Math.PI / 2, h: 0.9, a0: 2.0, a1: -1.3, rin: 1.0 }, a0: 2.0, a1: -1.3 }],
      events: [[0.54, (a) => { const p = front(1.9, a.yaw0); payload('light', p, { r: 3, dmg: 24, kb: 4 }); S.sfx('cast_light', { position: p }); }]],
    }),
    shadow: () => ({
      name: 'c4_shadow', kind: 'combo', tpl: 'slashL', dur: 0.62, cancel: 0.56, lunge: 3.2, lungeT: [0.08, 0.36], trail: [0.2, 0.8],
      hits: [
        { t0: 0.3, t1: 0.44, shape: 'arc', a0: 1.6, a1: -1.6, reach: 2.7, spec: { amount: 12, kb: 1, status: { corroded: { stacks: 1 } }, onHit: (e, p) => flourish('shadow', p) }, arc: { tilt: 0.7, h: 1.1, life: 0.3 } },
        { t0: 0.46, t1: 0.6, shape: 'arc', a0: -1.6, a1: 1.6, reach: 2.7, spec: { amount: 16, kb: 4, status: { corroded: { stacks: 1 }, marked: { stacks: 1 } }, heavy: true, onHit: (e, p) => flourish('shadow', p, true) }, arc: { tilt: -0.7, h: 1.1, life: 0.34 } },
      ],
      poseFn: (out, t, a) => { if (t > a.dur * 0.44) S.sampleTpl('slashR', 0.3 + (t / a.dur - 0.44) * 1.2, out); },
      onUpdate: (dt, a) => { if (a.t > 0.1 && a.t < 0.45 && Math.random() < 0.4) P().spawnGhost(_ghost.setHex(0x5b2a8a), 0.3, 0.55); },
      events: [[0.62, (a) => { const p = front(1.7, a.yaw0); payload('shadow', p, { r: 2.6, dmg: 18, kb: 2 }); S.sfx('cast_shadow', { position: p }); }]],
    }),
  };

  /** Vine lash: a vine from the blade to the best target ahead (≤ range), pulls it 4 m toward you and seeds it. */
  function vineLash(yaw, range, dmg, extraStatus) {
    const from = S.pos();
    _d.set(Math.sin(yaw), 0, Math.cos(yaw));
    const tgt = S.findTarget(range, 0.3);
    const tip = P().getWeaponTip ? P().getWeaponTip('main', _t) : P().getSwordTip(_t);
    const to = tgt ? S.centerOf(tgt, V()) : V(from.x + _d.x * range, from.y + 1, from.z + _d.z * range);
    vfx('beam', tip.clone(), to, { color: 0x6fcf4a, width: 0.14, duration: 0.32, jagged: 0.35, segments: 10 });
    vfx('burst', to, { count: 12, shape: 'leaf', additive: false, color: [0xc8f080, 0x4f9a2a], speed: 4, spread: 1, size: 0.16, life: 0.8, gravity: 2, drag: 1.5 });
    if (tgt) {
      _u.subVectors(from, tgt.object.position).setY(0);
      const d = _u.length();
      if (d > 1e-3) _u.multiplyScalar(1 / d); else _u.copy(_d).negate();
      S.applyHit(tgt, { amount: dmg, kb: tgt.isBoss ? 0 : Math.min(4, Math.max(0, d - 1.4)) * 3.2, status: { seeded: { stacks: 1 }, ...(extraStatus || null) }, heavy: true, sound: 'light' }, to, _u.clone(), 'nature');
    }
    return tgt;
  }

  // ------------------------------------------------------------ longsword charged
  const heavy = {
    water(f) { // 수류 일섬: an 8 m water-whip lash
      const len = 8 + 2 * f, dmg = 30 + 40 * f;
      return {
        name: 'heavy_water', kind: 'heavy', tpl: 'chargeSlash', dur: 0.72, cancel: 0.58, lunge: 1.2, lungeT: [0.1, 0.3], target: null, facing: 'camera', trail: [0.18, 0.6], superArmor: true,
        events: [[0.32, (a) => {
          const from = S.pos().clone(), dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0));
          const tip = P().getSwordTip(V());
          const end = V(from.x + dir.x * len, from.y + 1.0, from.z + dir.z * len);
          vfx('beam', tip, end, { color: 0x7fd3ff, width: 0.3, duration: 0.3, jagged: 0.25, segments: 12 });
          S.arc({ yaw: a.yaw0, a0: -1.9, a1: 1.7, rout: 3.4, rin: 1.4, h: 1.0, sweep: 0.07, life: 0.4, tilt: 0.12 });
          for (let d = 1.5; d <= len; d += 1.4) {
            const q = ground(V(from.x + dir.x * d, 0, from.z + dir.z * d));
            S.after(d * 0.012, () => vfx('burst', V(q.x, q.y + 0.4, q.z), { count: 6, shape: 'droplet', color: [0xe8d9b0, 0x4fb4ff], speed: 5, spread: 0.5, dir: S.UP, size: 0.14, life: 0.55, gravity: 12, drag: 1 }));
          }
          S.hitLine(from, dir, len, 2.4, { amount: dmg, kb: 9, status: { wet: { dur: 8 } }, heavy: true, dirMode: 'fwd' }, null, 'water');
          for (let d = 3; d <= len; d += 3.5) S.zone('water', ground(V(from.x + dir.x * d, 0, from.z + dir.z * d)), { r: 2.2, dur: 6 });
          vfx('fovKick', 5, 0.3);
          S.sfx('cast_water', { position: from }); S.sfx('sword_swing_heavy', { pitch: 0.85 });
        }]],
      };
    },
    nature(f) { // 가시 돌진: a dash that seeds every enemy it passes
      const dist = 7 + 3 * f, dmg = 18 + 27 * f;
      let start = null, dir = null, traveled = 0;
      const set = new Set();
      return {
        name: 'heavy_nature', kind: 'heavy', tpl: 'iaido', dur: 0.7, cancel: 0.6, move: 0, target: null, facing: 'camera', trail: [0.02, 0.5], superArmor: true, noGlide: true,
        onUpdate: (dt, a, A) => {
          if (!start) { start = S.pos().clone(); dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0)); }
          if (a.t > 0.03 && a.t < 0.2 && traveled < dist) {
            const sp = dist / 0.17;
            A.vel.copy(dir).multiplyScalar(sp); traveled += sp * dt;
            const p = S.pos();
            if (Math.random() < 0.5) S.fx.crystal.spawn(ground(V(p.x + rand(-0.6, 0.6), 0, p.z + rand(-0.6, 0.6))), 0.6 + Math.random() * 0.5, 0.3, 0.04, 1.3, 0.7, 0x5fbf3a);
            vfx('burst', _t.set(p.x, p.y + 0.5, p.z), { count: 2, shape: 'leaf', additive: false, color: [0xc8f080, 0x4f9a2a], speed: 2, spread: 1, size: 0.14, life: 0.7, gravity: 1.5, drag: 1.5 });
            S.hitLine(start, dir, traveled + 1, 2.4, { amount: dmg, kb: 4, status: { seeded: { stacks: 2 }, rooted: { dur: 0.6 } }, heavy: true, dirMode: 'out' }, set, 'nature');
          }
        },
        events: [[0.03, () => { S.sfx('sword_swing_heavy', { pitch: 0.9 }); vfx('fovKick', 6, 0.3); }],
          [0.3, (a) => { S.arc({ yaw: a.yaw0, a0: -2.0, a1: 1.8, rout: 3.4, rin: 1.2, h: 1.1, sweep: 0.08, life: 0.4 }); payload('nature', S.pos().clone(), { r: 2.5, dmg: 10 + 10 * f, kb: 2 }); }]],
      };
    },
    light(f) { // 광휘 내려치기: an overhead smash that drops a pillar of light
      const dmg = 40 + 40 * f;
      return {
        name: 'heavy_light', kind: 'heavy', tpl: 'chargeOver', dur: 0.86, cancel: 0.68, lunge: 1.4, lungeT: [0.1, 0.35], target: null, facing: 'camera', trail: [0.25, 0.5], superArmor: true,
        events: [[0.42, (a) => {
          const p = front(3.2, a.yaw0);
          S.arc({ yaw: a.yaw0, tilt: Math.PI / 2, a0: 2.0, a1: -1.3, rout: 3.4, rin: 1.0, h: 0.9, sweep: 0.06, life: 0.35 });
          vfx('beam', V(p.x, p.y + 24, p.z), V(p.x, p.y, p.z), { color: 0xfff2c0, width: 1.6, duration: 0.45, jagged: 0, segments: 2 });
          vfx('explosion', V(p.x, p.y + 0.6, p.z), { element: 'light', scale: 1.3 });
          vfx('screenFlash', 0xfff2c0, 0.2, 0.25); vfx('fovKick', 6, 0.35);
          payload('light', p, { r: 3, dmg, kb: 6, launch: 2, big: true, spec: { status: { dazzled: { dur: 2 }, radiant: { stacks: 2 } } } });
          try { game.world?.surface2?.bless?.(p, 3, 4); } catch (_) { /* */ }
          S.sfx('explode_light', { position: p }); S.sfx('cast_light', { position: p, volume: 0.6 });
        }]],
      };
    },
    shadow(f) { // 그림자 일격: dash through 9 m, then reappear behind the target
      const dmg = 34 + 36 * f;
      const set = new Set();
      return {
        name: 'heavy_shadow', kind: 'heavy', tpl: 'iaido', dur: 0.82, cancel: 0.7, move: 0, target: null, facing: 'camera', trail: [0.02, 0.7], superArmor: true, noGlide: true, gravityMul: 0,
        events: [[0.04, (a) => { dashThrough(a, 9, dmg, set, 'shadow', { corroded: { stacks: 2 }, marked: { stacks: 1 } }); }],
          [0.42, (a) => {
            S.arc({ yaw: a.yaw0, a0: 1.8, a1: -1.8, rout: 3.0, rin: 1.0, h: 1.1, sweep: 0.06, life: 0.32, tilt: 0.6 });
            S.arc({ yaw: a.yaw0, a0: -1.8, a1: 1.8, rout: 3.0, rin: 1.0, h: 1.1, sweep: 0.06, life: 0.32, tilt: -0.6 });
            payload('shadow', front(1.4, a.yaw0), { r: 2.6, dmg: 14 + 14 * f, kb: 3 });
          }]],
      };
    },
  };

  /**
   * Dash through up to dist m along the facing (or through the soft-locked target and out behind it).
   * Damages everything on the path once (set), leaves afterimages, turns to face back at the target.
   */
  function dashThrough(a, dist, dmg, set, el, status) {
    const from = S.pos().clone();
    const tgt = S.findTarget(dist + 1, 0.4);
    _d.set(Math.sin(a.yaw0), 0, Math.cos(a.yaw0));
    let len = dist;
    if (tgt) {
      _u.subVectors(tgt.object.position, from).setY(0);
      const dd = _u.length();
      if (dd > 0.2) { _d.copy(_u).multiplyScalar(1 / dd); len = clamp(dd + (tgt.radius || 0.5) + 1.6, 3, dist + 2); }
    }
    const to = V(from.x + _d.x * len, from.y, from.z + _d.z * len);
    for (let k = 0; k < 4; k++) S.after(0.02 * k, () => P().spawnGhost(_ghost.setHex(palOf(el).a), 0.4, 0.7));
    P().teleport(to);
    const back = Math.atan2(-_d.x, -_d.z);
    if (tgt) { P().setFacing(back); a.yaw0 = back; }
    const f1 = from.clone(); f1.y += 1; const t1 = S.pos().clone(); t1.y += 1;
    vfx('beam', f1, t1, { color: palOf(el).a, width: 0.3, duration: 0.22, jagged: 0.15, segments: 6 });
    S.hitLine(from, _d.clone(), len, 2.4, { amount: dmg, kb: 3, status, heavy: true, dirMode: 'out' }, set, el);
    vfx('fovKick', 6, 0.3);
    S.sfx('blink', { position: from, pitch: 0.8 }); S.sfx('sword_swing_heavy', { pitch: 1.1 });
    return tgt;
  }

  const NAMES2 = {
    water: { basic: ['물결 검술', '흐르는 4연격. 4타: 물보라가 반경 3m를 적신다'], heavy: ['수류 일섬', '8m 물의 채찍으로 베어낸다'], ultimate: ['대홍수', '물결의 검무로 주변을 물에 잠기게 한다'], finisher: ['심해의 노래', '물의 레비아탄이 솟구친다'], support: ['정화의 비', '정화의 비구름'] },
    nature: { basic: ['덩굴 검술', '4연격. 4타: 덩굴 채찍이 적을 끌어당긴다'], heavy: ['가시 돌진', '지나간 모든 적에게 씨앗을 심는 돌진'], ultimate: ['세계수의 분노', '거대한 뿌리가 차례로 솟구친다'], finisher: ['영원의 숲', '숲이 깨어난다'], support: ['생명의 꽃', '생명의 꽃이 피어난다'] },
    light: { basic: ['성광 검술', '4연격. 4타: 방사형 빛줄기가 터진다'], heavy: ['광휘 내려치기', '내려찍어 빛의 기둥을 떨어뜨린다'], ultimate: ['새벽의 심판', '검끝에서 거대한 빛의 광선을 쏜다'], finisher: ['여명의 날개', '여섯 날개의 강림'], support: ['축복', '공격력·회복·치명타 증가'] },
    shadow: { basic: ['그림자 검술', '4연격. 4타: 그림자 교차 베기, 표식 +1'], heavy: ['그림자 일격', '적을 관통해 등 뒤에 나타난다'], ultimate: ['어둠의 심연', '검을 꽂아 블랙홀을 연다'], finisher: ['까마귀 군주', '까마귀 날개의 기사가 강림한다'], support: ['그림자 장막', '은신'] },
  };

  return { fourth, heavy, payload, vineLash, dashThrough, NAMES2, FX };
}
