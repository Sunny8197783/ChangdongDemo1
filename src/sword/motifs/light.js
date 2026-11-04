// 빛 light motifs (PLAN §3.5; owner melee). Primary FM shapes: `ray` thin wedges / pillars (r ≤ 0.6 m, vertical gradient), `halo` ring
// meshes with ticks, `feather`. Secondary: LW halo rings with tick marks, GL 8-ray star. Accents: ≤ 12 slow descending motes.
// Signature: precise geometry, 4-point star glints, rune-circle craft, IVORY not gold. Never: domes, thick white columns, saturated gold, diamond sparkles.
import * as THREE from 'three';
import { merge, faceted, plate, hash } from './common.js';

const _q = new THREE.Quaternion();

export function installLight(api) {
  const { kit: K, gy } = api;
  // ---- geometry
  { // ray: thin hexagonal wedge column 3 m (radius 0.18 → 0.04), vertical gradient
    const g = new THREE.CylinderGeometry(0.04, 0.18, 3, 6, 4, true); g.translate(0, 1.5, 0);
    K.registerShape('light.ray', faceted(g, (x, y) => 0.95 - y * 0.22), { blend: 'alpha', outline: false });
  }
  { // halo: flat torus with 12 tick blocks (lies in XZ)
    const parts = [new THREE.TorusGeometry(0.6, 0.02, 4, 48)], grads = [0.85];
    for (let i = 0; i < 12; i++) { const t = new THREE.BoxGeometry(0.02, 0.11, 0.02); t.translate(0, 0.66, 0); t.rotateZ((i / 12) * Math.PI * 2); parts.push(t); grads.push(i % 3 === 0 ? 0.95 : 0.6); }
    const g = merge(parts, grads); g.rotateX(Math.PI / 2);
    K.registerShape('light.halo', g, { blend: 'alpha', outline: false });
  }
  { // feather: vane plate with a spine, pointing +Y
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.13, 0.25, 0.04, 0.62); sh.lineTo(0, 0.7); sh.lineTo(-0.03, 0.6); sh.quadraticCurveTo(-0.1, 0.25, 0, 0);
    const vane = plate(sh, 0.012, (x, y) => 0.45 + Math.abs(x) * 2 + y * 0.4);
    const spine = faceted(new THREE.CylinderGeometry(0.008, 0.012, 0.72, 4).translate(0, 0.36, 0), () => 0.95);
    K.registerShape('light.feather', merge([vane, spine], [null, null]), { blend: 'solid', outline: true });
  }

  const G = (p) => K.v3(p.x, gy(p.x, p.z), p.z);
  const cid = (s) => s.castId || 0;
  const motes = (s, p, n) => K.spark(p || s.pos, 'light', Math.min(12, n), K.v3(0, -1, 0), { castId: cid(s), shape: 'mote', gravity: -0.4, speed: 1.2 });
  const star4 = (s, p, r, life = 0.07) => K.line({ shape: 'star', points: 4, r2: 0.14, el: 'light', pos: p, plane: 'billboard', r, width: 0.025, life, tIn: 0, tOut: life * 0.6, castId: cid(s) });
  const haloTicks = (s, p, r, plane = 'ground', life = 0.45, spin = 0.8) => [
    K.line({ shape: 'ring', el: 'light', pos: p, plane, r, width: 0.03, life, tIn: 0.1, tOut: 0.25, scaleIn: 'backOut', castId: cid(s), alpha: 0.85 }),
    K.line({ shape: 'ticks', n: 12, r2: 0.84, el: 'light', pos: p, plane, r: r * 1.12, width: 0.022, life, tIn: 0.12, tOut: 0.25, spin, castId: cid(s), alpha: 0.8 })];

  const M = {
    cast(s) {
      return [K.line({ shape: 'glyph', glyph: 'light', el: 'light', pos: s.pos, follow: s.follow, plane: 'billboard', r: Math.min(0.55, s.r ?? 0.4), life: s.life ?? 0.3, tIn: 0.08, tOut: 0.12, spin: 0.9, castId: cid(s) })];
    },
    trail(s) {
      const out = [];
      if (s.follow) out.push(K.ribbon({ follow: s.follow, width: s.width ?? 0.1, taper: 0.95, life: s.life ?? 0.22, el: 'light', castId: cid(s), maxLen: s.len ?? 3, alpha: 0.75 }));
      return out;
    },
    burst(s) {
      const r = Math.max(0.4, Math.min(s.r ?? 1.1, 4)), out = [];
      out.push(star4(s, s.pos, r * 0.7, 0.08));
      out.push(...haloTicks(s, s.pos, r, 'billboard', 0.42, 1.1));
      out.push(K.line({ shape: 'rays', n: 8, r2: 0.55, el: 'light', pos: s.pos, plane: 'billboard', r: r * 1.5, width: 0.02, life: 0.3, tIn: 0.04, tOut: 0.2, scaleIn: 'expand', castId: cid(s), alpha: 0.7 }));
      motes(s, K.v3(s.pos.x, s.pos.y + 0.6, s.pos.z), Math.min(8, s.n ?? 6));
      return out;
    },
    spark(s) { motes(s, s.pos, Math.min(5, s.n ?? 4)); if ((s.n ?? 4) >= 4) star4(s, s.pos, 0.3, 0.06); return null; },
    zone(s) {
      const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 3, g = G(s.pos);
      return [K.line({ shape: 'glyph', glyph: 'hexagram', el: 'light', pos: g, plane: 'ground', r, width: 0.03, life, tIn: 0.28, tOut: 0.4, spin: 0.15, alpha: 0.34, castId: cid(s), follow: s.follow, role: 'fill' }),
        K.line({ shape: 'ticks', n: 24, r2: 0.9, el: 'light', pos: g, plane: 'ground', r: r * 1.08, width: 0.025, life, tIn: 0.3, tOut: 0.4, spin: -0.25, alpha: 0.35, castId: cid(s), follow: s.follow })];
    },
    pillar(s) {
      const g = G(s.pos), h = Math.min(8, s.h ?? 4), r = Math.min(0.6, s.r ?? 0.5), out = [];
      out.push(K.mesh('light.ray', { pos: g, scale: K.v3(r / 0.18, h / 3, r / 0.18), life: 0.55, tIn: 0.08, tOut: 0.3, erode: false, castId: cid(s), owner: 'player', alpha: 0.7 }));
      out.push(...haloTicks(s, K.v3(g.x, g.y + 0.06, g.z), r * 2.6, 'ground', 0.6, 0.6));
      out.push(K.mesh('light.halo', { pos: K.v3(g.x, g.y + h * 0.75, g.z), scale: r * 2, life: 0.55, tIn: 0.15, tOut: 0.25, erode: false, castId: cid(s), owner: 'player', spin: 1.6 }));
      motes(s, K.v3(g.x, g.y + h * 0.8, g.z), 5);
      return out;
    },
    wave(s) {
      const dir = s.dir || { x: 0, z: 1 }, a = Math.atan2(dir.z, dir.x), half = Math.min(1.2, s.arc ?? 0.6), r = Math.min(s.r ?? 4, 10), g = G(s.pos);
      return [K.line({ shape: 'arc', arc: [a - half, a + half], el: 'light', pos: g, plane: 'ground', r, width: 0.03, life: s.life ?? 0.45, tOut: 0.25, scaleIn: 'expand', castId: cid(s) }),
        K.line({ shape: 'ticks', n: 16, r2: 0.9, el: 'light', pos: g, plane: 'ground', r: r * 0.92, width: 0.02, life: (s.life ?? 0.45) * 0.9, tOut: 0.2, scaleIn: 'expand', castId: cid(s), alpha: 0.7, rot: a })];
    },
    aura(s) {
      const life = s.life ?? 2;
      return [K.mesh('light.halo', { pos: s.pos, follow: s.follow, followOff: K.v3(0, 2.05, 0), scale: 0.55, life, tIn: 0.2, tOut: 0.3, erode: false, castId: cid(s), owner: 'player', spin: 0.9, alpha: 0.8 })];
    },
    summon(s) {
      const g = G(s.pos), out = [];
      out.push(...haloTicks(s, K.v3(g.x, g.y + 0.06, g.z), Math.min(1.4, s.r ?? 1), 'ground', 0.8, 0.5));
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + cid(s) * 0.2; out.push(K.mesh('light.feather', { pos: K.v3(g.x + Math.cos(a) * 0.8, g.y + 1.4, g.z + Math.sin(a) * 0.8), quat: _q.setFromAxisAngle(K.v3(0, 1, 0), a), scale: 0.9, vel: K.v3(0, -0.6, 0), life: 0.9, tIn: 0.15, tOut: 0.35, castId: cid(s), owner: 'player', spin: 1.2 + hash(i) })); }
      return out;
    },
  };
  for (const k of Object.keys(M)) K.registerMotif('light', k, M[k]);
  return M;
}
