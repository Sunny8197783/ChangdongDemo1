// 대지 earth motifs (PLAN §3.5; owner melee). Primary FM shapes: `rock` faceted chunks with strata vertex bands, `spike` wedge spikes,
// `slab` strata blocks (+ `chip`). Secondary: DC crack / strata. Accents: chips with gravity ≤ 12, dust SM ≤ 0.6 s (normal blend, ≤ 0.3 alpha, low).
// Signature: heavy, slow, solid; cracks glow `light` only at the bottom of the line. Never: additive dust, smooth tan cylinders, fire-coloured flashes.
import * as THREE from 'three';
import { faceted, jitter, hash, upTo } from './common.js';

const strata = (bands = 5) => (x, y) => { const b = Math.floor((y + 1) * bands * 0.5); return b % 3 === 0 ? 0.92 : b % 3 === 1 ? 0.55 : 0.2; };
const _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _a = new THREE.Vector3();

export function installEarth(api) {
  const { kit: K, gy } = api;
  // ---- geometry (factory time)
  { const g = jitter(new THREE.DodecahedronGeometry(0.5, 0), 0.16, 3); K.registerShape('earth.rock', faceted(g, strata(6)), { blend: 'solid', outline: true, max: 96 }); }
  { const g = new THREE.ConeGeometry(0.32, 1.6, 5, 3); g.translate(0, 0.8, 0); g.scale(1, 1, 0.62); jitter(g, 0.05, 7);
    K.registerShape('earth.spike', faceted(g, (x, y) => { const b = Math.floor(y * 3.2); return (b % 2 ? 0.6 : 0.25) + y * 0.18; }), { blend: 'solid', outline: true }); }
  { const g = new THREE.BoxGeometry(1.2, 0.6, 0.8, 1, 3, 1); jitter(g, 0.04, 11); K.registerShape('earth.slab', faceted(g, strata(3)), { blend: 'solid', outline: true }); }
  { const g = new THREE.TetrahedronGeometry(0.16, 0); K.registerShape('earth.chip', faceted(g, (x, y) => 0.4 + y), { blend: 'solid', outline: false }); }

  const G = (p) => K.v3(p.x, gy(p.x, p.z), p.z);
  const cid = (s) => s.castId || 0;
  const chips = (s, n, speed = 5) => K.spark(s.pos, 'earth', Math.min(12, n), s.dir || null, { castId: cid(s), shape: 'rock', gravity: 16, speed });
  const dust = (p, s, n = 4) => K.emit?.(K.v3(p.x, p.y + 0.2, p.z), { count: n, shape: 'smoke', additive: false, color: [api.rampOf('earth').light, api.rampOf('earth').mid], speed: 1.6, spread: 0.6,
    dir: K.v3(0, 1, 0), size: 0.45, sizeEnd: 0.9, life: 0.55, drag: 3, alpha: 0.28, owner: 'player', castId: cid(s), el: 'earth' });
  /** n strata rocks bursting radially from p (deterministic layout per castId). */
  function rocks(s, p, n, r, speed = 5) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (cid(s) % 7) * 0.4;
      _d.set(Math.cos(a), 0.9 + hash(i + cid(s)) * 0.6, Math.sin(a)).normalize().multiplyScalar(speed * (0.7 + hash(i * 3 + cid(s)) * 0.5));
      out.push(K.mesh('earth.rock', { pos: K.v3(p.x + Math.cos(a) * r * 0.3, p.y + 0.2, p.z + Math.sin(a) * r * 0.3), scale: 0.35 + 0.25 * hash(i + 5), vel: _d.clone(), gravity: 14, drag: 0.6,
        spin: 3 + hash(i) * 4, spinAxis: K.v3(hash(i + 1) - 0.5, 1, hash(i + 2) - 0.5).normalize(), life: 0.75, tIn: 0.06, tOut: 0.25, castId: cid(s), owner: 'player' }));
    }
    return out;
  }
  function spikeAt(s, p, h, w, dir, delay = 0) {
    _a.set(dir?.x ?? 0, 2.4, dir?.z ?? 0); upTo(_a, _q);
    return K.mesh('earth.spike', { pos: K.v3(p.x, gy(p.x, p.z) - 0.1, p.z), quat: _q, scale: K.v3(w, h / 1.6, w), life: 1.1 + delay, tIn: 0.12 + delay, tOut: 0.35, castId: cid(s), owner: 'player' });
  }

  const M = {
    cast(s) {
      return [K.line({ shape: 'glyph', glyph: 'earth', el: 'earth', pos: s.pos, follow: s.follow, plane: 'billboard', r: Math.min(0.55, s.r ?? 0.4), life: s.life ?? 0.3, tIn: 0.08, tOut: 0.12, castId: cid(s) }),
        K.line({ shape: 'poly', sides: 4, el: 'earth', pos: s.pos, follow: s.follow, plane: 'billboard', r: Math.min(0.7, (s.r ?? 0.4) * 1.3), width: 0.03, life: s.life ?? 0.3, tIn: 0.1, tOut: 0.12, spin: -0.8, castId: cid(s), alpha: 0.7 })];
    },
    trail(s) {
      const out = [];
      if (s.follow) out.push(K.ribbon({ follow: s.follow, width: s.width ?? 0.18, taper: 0.9, life: s.life ?? 0.2, el: 'earth', castId: cid(s), maxLen: s.len ?? 2.5, colors: { head: api.rampOf('earth').mid, edge: api.rampOf('earth').light } }));
      return out;
    },
    burst(s) {
      const r = Math.max(0.4, Math.min(s.r ?? 1.2, 4)), p = s.pos, g = G(p), out = [];
      const big = (s.tier === 'U' || s.tier === 'F') ? 1 : 0;
      out.push(...rocks(s, g, big ? 7 : 5, r, 4.5 + r));
      out.push(K.line({ shape: 'poly', sides: 4, el: 'earth', pos: g, plane: 'ground', r: r * 1.5, width: 0.05, life: 0.45, tIn: 0, tOut: 0.25, scaleIn: 'expand', castId: cid(s), alpha: 0.8, rot: (cid(s) % 5) * 0.3 }));
      out.push(K.decal('crack', g, r * 1.1, big ? 4 : 1.6, { el: 'earth', castId: cid(s), alpha: 0.32 }));
      chips(s, Math.min(8, s.n ?? 6), 6);
      dust(g, s, big ? 6 : 3);
      return out;
    },
    spark(s) { chips(s, Math.min(6, s.n ?? 4), 5); return null; },
    zone(s) {
      const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 3, g = G(s.pos);
      return [K.decal('strata', g, r, life, { el: 'earth', castId: cid(s), alpha: 0.3 }),
        K.line({ shape: 'dots', n: Math.round(12 + r * 5), el: 'earth', pos: g, plane: 'ground', r: r * 1.03, width: 0.04, life, tIn: 0.25, tOut: 0.4, spin: -0.2, alpha: 0.35, castId: cid(s), follow: s.follow })];
    },
    pillar(s) {
      const g = G(s.pos), h = Math.min(6, s.h ?? 2.4), w = Math.min(1.6, Math.max(0.5, s.r ?? 0.8)), out = [];
      out.push(spikeAt(s, g, h, w, null, 0));
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + cid(s); out.push(spikeAt(s, K.v3(g.x + Math.cos(a) * w * 0.9, 0, g.z + Math.sin(a) * w * 0.9), h * 0.55, w * 0.55, { x: Math.cos(a), z: Math.sin(a) }, 0.04 * (i + 1))); }
      out.push(K.decal('crack', g, w * 2.2, 1.6, { el: 'earth', castId: cid(s), alpha: 0.32 }));
      chips(s, 6, 6); dust(g, s, 3);
      return out;
    },
    wave(s) {
      // ground motif from the impact point forward: a row of strata spikes + a crack line
      const dir = s.dir || { x: 0, z: 1 }, L = Math.min(s.r ?? 4, 9), n = Math.max(2, Math.min(5, Math.round(L / 1.4))), out = [];
      const dl = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / dl, dz = dir.z / dl;
      for (let i = 0; i < n; i++) {
        const d = (i + 0.6) * L / n, p = K.v3(s.pos.x + dx * d, 0, s.pos.z + dz * d);
        out.push(spikeAt(s, p, 0.7 + i * 0.25, 0.55 + i * 0.08, { x: dx, z: dz }, i * 0.05));
      }
      out.push(K.line({ shape: 'crack', el: 'earth', pos: G(K.v3(s.pos.x + dx * L * 0.5, 0, s.pos.z + dz * L * 0.5)), plane: 'ground', r: L * 0.55, width: 0.03, life: 1.6, tOut: 0.6, alpha: 0.32, castId: cid(s), erode: true, rot: Math.atan2(dz, dx), role: 'fill' }));
      return out;
    },
    aura(s) {
      const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
      return [K.line({ shape: 'poly', sides: 4, el: 'earth', pos: s.pos, follow: s.follow, followOff: K.v3(0, 0.05, 0), plane: 'ground', r, width: 0.04, life, tIn: 0.2, tOut: 0.3, spin: 0.6, alpha: 0.35, castId: cid(s) }),
        K.line({ shape: 'dots', n: 8, el: 'earth', pos: s.pos, follow: s.follow, followOff: K.v3(0, 0.05, 0), plane: 'ground', r: r * 1.25, width: 0.05, life, tIn: 0.25, tOut: 0.3, spin: -0.9, alpha: 0.35, castId: cid(s) })];
    },
    summon(s) {
      const g = G(s.pos), out = [];
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + cid(s) * 0.3; out.push(K.mesh('earth.slab', { pos: K.v3(g.x + Math.cos(a) * 0.7, g.y + 0.25, g.z + Math.sin(a) * 0.7), quat: _q.setFromAxisAngle(K.v3(0, 1, 0), a), scale: 0.7, life: 0.9, tIn: 0.15 + i * 0.06, tOut: 0.3, castId: cid(s), owner: 'player' })); }
      out.push(K.line({ shape: 'poly', sides: 4, el: 'earth', pos: g, plane: 'ground', r: 1.3, width: 0.04, life: 0.7, tIn: 0.15, tOut: 0.3, castId: cid(s), alpha: 0.6 }));
      chips(s, 4, 3);
      return out;
    },
  };
  for (const k of Object.keys(M)) K.registerMotif('earth', k, M[k]);
  return M;
}
