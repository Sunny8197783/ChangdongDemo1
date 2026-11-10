// 자연 nature motifs (PLAN §3.5; owner melee). Primary FM shapes: `vine` tubes grown along S-curve splines (segment-by-segment growth),
// `thorn` spikes, `petal` 5-petal flowers, `leaf`, `pod`. Secondary: DC flower glyph, leaf glyph ring. Accents: petal drift ≤ 16, pollen ≤ 10.
// Signature: S-curves; vines grow over 0.3 s and wither (erode). Never: glare balls, green decals without a dark edge.
import * as THREE from 'three';
import { merge, faceted, taperTube, plate, hash, upTo } from './common.js';

const _q = new THREE.Quaternion(), _a = new THREE.Vector3();

export function installNature(api) {
  const { kit: K, gy } = api;
  // ---- geometry
  { // vine: S-curve tapered tube 1.6 m along +Y (aGrad dark base → light tip) with two leaf nubs
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 1.6) * 0.22, t * 1.6, Math.sin(t * Math.PI * 0.8) * 0.08)); }
    K.registerShape('nature.vine', taperTube(pts, 0.075, 0.012, 18, 5), { blend: 'solid', outline: true, max: 96 });
  }
  { const g = new THREE.ConeGeometry(0.09, 0.55, 5, 1); g.translate(0, 0.275, 0); K.registerShape('nature.thorn', faceted(g, (x, y) => 0.2 + y * 1.3), { blend: 'solid', outline: true, max: 96 }); }
  { // 5-petal flower lying flat (+Y up): five teardrop plates around a centre disc
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(0.16, 0.12, 0.14, 0.42, 0, 0.5); sh.bezierCurveTo(-0.14, 0.42, -0.16, 0.12, 0, 0);
    const parts = [], grads = [];
    for (let i = 0; i <= 4; i++) { const p = plate(sh, 0.02, (x, y) => 0.35 + y * 1.2); p.rotateX(-Math.PI / 2 + 0.25); p.rotateY((i / 5) * Math.PI * 2); parts.push(p); grads.push(null); }
    const c = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8); parts.push(c); grads.push(0.95);
    K.registerShape('nature.petal', merge(parts, grads), { blend: 'solid', outline: true });
  }
  { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.14, 0.2, 0, 0.42); sh.quadraticCurveTo(-0.14, 0.2, 0, 0);
    K.registerShape('nature.leaf', plate(sh, 0.015, (x, y) => 0.2 + y * 1.6), { blend: 'solid', outline: true }); }
  { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 0.22 * (1 - t * 0.3), t * 0.55)); }
    const g = new THREE.LatheGeometry(pts, 7); K.registerShape('nature.pod', faceted(g, (x, y) => 0.25 + y * 1.2), { blend: 'solid', outline: true }); }

  const G = (p) => K.v3(p.x, gy(p.x, p.z), p.z);
  const cid = (s) => s.castId || 0;
  const petals = (s, n, speed = 3) => K.spark(s.pos, 'nature', Math.min(12, n), s.dir || null, { castId: cid(s), shape: 'petal', gravity: 1.2, speed });
  /** vine growing from p along dir (lean), segment by segment: reads as a 0.3 s growth, withers by erosion. */
  function vine(s, p, h = 1.6, lean = null, delay = 0, life = 1.2) {
    _a.set(lean?.x ?? 0, 3, lean?.z ?? 0); upTo(_a, _q);
    return K.mesh('nature.vine', { pos: K.v3(p.x, gy(p.x, p.z) - 0.05, p.z), quat: _q, scale: K.v3(1, h / 1.6, 1), life: life + delay, tIn: 0.3 + delay, tOut: 0.4, castId: cid(s), owner: 'player' });
  }
  function thorn(s, p, h, lean, delay = 0, life = 1) {
    _a.set(lean?.x ?? 0, 2.5, lean?.z ?? 0); upTo(_a, _q);
    return K.mesh('nature.thorn', { pos: K.v3(p.x, gy(p.x, p.z) - 0.04, p.z), quat: _q, scale: K.v3(h * 1.1, h, h * 1.1) , life: life + delay, tIn: 0.1 + delay, tOut: 0.3, castId: cid(s), owner: 'player' });
  }
  function flower(s, p, sc = 1, life = 0.9, delay = 0) {
    return K.mesh('nature.petal', { pos: K.v3(p.x, gy(p.x, p.z) + 0.05, p.z), quat: _q.setFromAxisAngle(K.v3(0, 1, 0), cid(s) * 0.7), scale: sc, life: life + delay, tIn: 0.2 + delay, tOut: 0.3, castId: cid(s), owner: 'player' });
  }

  const M = {
    cast(s) {
      return [K.line({ shape: 'glyph', glyph: 'nature', el: 'nature', pos: s.pos, follow: s.follow, plane: 'billboard', r: Math.min(0.55, s.r ?? 0.4), life: s.life ?? 0.3, tIn: 0.08, tOut: 0.12, spin: 0.6, castId: cid(s) })];
    },
    trail(s) {
      const out = [];
      if (s.follow) out.push(K.ribbon({ follow: s.follow, width: s.width ?? 0.14, taper: 0.95, life: s.life ?? 0.24, el: 'nature', castId: cid(s), maxLen: s.len ?? 2.8 }));
      return out;
    },
    burst(s) {
      const r = Math.max(0.4, Math.min(s.r ?? 1.2, 4)), g = G(s.pos), out = [];
      out.push(flower(s, g, 0.9 + r * 0.6, 0.8));
      const n = (s.tier === 'U' || s.tier === 'F') ? 6 : 4;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + cid(s) * 0.5; out.push(thorn(s, K.v3(g.x + Math.cos(a) * r * 0.9, 0, g.z + Math.sin(a) * r * 0.9), 0.7 + hash(i) * 0.4, { x: Math.cos(a), z: Math.sin(a) }, 0.03 * i, 0.7)); }
      out.push(K.decal('flower', g, r * 1.2, 1.4, { el: 'nature', castId: cid(s), alpha: 0.32 }));
      petals(s, Math.min(10, s.n ?? 8), 3.5);
      return out;
    },
    spark(s) { petals(s, Math.min(6, s.n ?? 4), 3); return null; },
    zone(s) {
      const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 3, g = G(s.pos), out = [];
      out.push(K.line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: g, plane: 'ground', r, width: 0.035, life, tIn: 0.3, tOut: 0.4, spin: 0.12, alpha: 0.32, castId: cid(s), follow: s.follow, role: 'fill', color2: api.rampOf('nature').dark }));
      out.push(K.line({ shape: 'dots', n: Math.round(10 + r * 5), el: 'nature', pos: g, plane: 'ground', r: r * 1.04, width: 0.04, life, tIn: 0.25, tOut: 0.4, spin: -0.3, alpha: 0.35, castId: cid(s), follow: s.follow }));
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + cid(s) * 0.4; out.push(vine(s, K.v3(g.x + Math.cos(a) * r * 0.7, 0, g.z + Math.sin(a) * r * 0.7), 1.1, { x: -Math.cos(a), z: -Math.sin(a) }, 0.05 * i, Math.min(life, 2.5))); }
      return out;
    },
    pillar(s) {
      const g = G(s.pos), h = Math.min(5, s.h ?? 2.2), out = [];
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + cid(s) * 0.3; out.push(vine(s, K.v3(g.x + Math.cos(a) * 0.35, 0, g.z + Math.sin(a) * 0.35), h * (0.85 + 0.1 * i), { x: Math.cos(a + 1.2) * 0.4, z: Math.sin(a + 1.2) * 0.4 }, 0.04 * i, 1.1)); }
      out.push(thorn(s, g, Math.min(1.4, h * 0.45), null, 0.12, 0.9));
      out.push(K.decal('flower', g, 1.2, 1.4, { el: 'nature', castId: cid(s), alpha: 0.3 }));
      petals(s, 5, 2.5);
      return out;
    },
    wave(s) {
      // thorn row from the impact point forward (S-curve offsets)
      const dir = s.dir || { x: 0, z: 1 }, L = Math.min(s.r ?? 4, 9), n = Math.max(3, Math.min(6, Math.round(L / 1.1))), out = [];
      const dl = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / dl, dz = dir.z / dl;
      for (let i = 0; i < n; i++) {
        const d = (i + 0.5) * L / n, side = Math.sin(i * 1.3) * 0.45;
        out.push(thorn(s, K.v3(s.pos.x + dx * d - dz * side, 0, s.pos.z + dz * d + dx * side), 0.55 + i * 0.12, { x: dx, z: dz }, i * 0.04, 0.8));
      }
      return out;
    },
    aura(s) {
      const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
      return [K.line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: s.pos, follow: s.follow, followOff: K.v3(0, 0.05, 0), plane: 'ground', r, width: 0.03, life, tIn: 0.2, tOut: 0.3, spin: 0.5, alpha: 0.35, castId: cid(s), role: 'fill' })];
    },
    summon(s) {
      const g = G(s.pos), out = [];
      out.push(K.line({ shape: 'glyph', glyph: 'nature', el: 'nature', pos: g, plane: 'ground', r: Math.min(1.4, s.r ?? 1), life: 0.8, tIn: 0.2, tOut: 0.3, spin: 0.4, castId: cid(s), alpha: 0.6 }));
      for (let i = 0; i < 3; i++) { const a = i * 2.094; out.push(vine(s, K.v3(g.x + Math.cos(a) * 0.5, 0, g.z + Math.sin(a) * 0.5), 1.2, { x: -Math.cos(a) * 0.6, z: -Math.sin(a) * 0.6 }, 0.06 * i, 0.9)); }
      petals(s, 5, 2);
      return out;
    },
  };
  for (const k of Object.keys(M)) K.registerMotif('nature', k, M[k]);
  return M;
}
