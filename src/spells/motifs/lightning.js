// 번개 lightning motifs (PLAN v4 §3.5, magic): BT bolts are the primary shape (strong zig-zag silhouette, 1–2-frame flashes on
// the bolt only), soft plasma orbs (smooth, crisp `light` rim, no facets), rod spikes with ring fins, violet afterglow lines and
// lichtenberg linework. Never: flare blobs, faceted gems, long screen flashes, a purple-white dome. Owner: magic.
import * as THREE from 'three';
import { lathe, merge, faceted, groundAt, nearGround, rng, flatDir, v3, TAU, H } from './common.js';

export const SHAPES = ['lightning.orb', 'lightning.spike', 'lightning.disc'];

function shapes() {
  const orb = (() => { const g = new THREE.IcosahedronGeometry(0.5, 2); const p = g.attributes.position, a = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) a[i] = 0.55 + 0.35 * Math.max(0, p.getY(i) / 0.5); g.setAttribute('aGrad', new THREE.BufferAttribute(a, 1)); g.deleteAttribute('uv'); g.computeVertexNormals(); return g; })();
  const spike = merge([
    lathe([[0.09, 0], [0.07, 1.6], [0.035, 2.6], [0.0, 3.0]], 6, { grad: (t) => 0.25 + 0.75 * t }),
    ...[0.9, 1.6, 2.2].map((y, i) => { const r = 0.32 - i * 0.07; const g = new THREE.TorusGeometry(r, 0.025, 4, 12); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return faceted(g, () => 0.9); }),
    lathe([[0.36, 0], [0.32, 0.12], [0.1, 0.2]], 8, { grad: () => 0.2 }),
  ]);
  const disc = merge([
    lathe([[0.42, 0], [0.42, 0.06], [0.3, 0.12], [0.0, 0.13]], 10, { grad: (t) => 0.2 + t * 0.4 }),
    (() => { const g = new THREE.TorusGeometry(0.22, 0.02, 3, 6); g.rotateX(Math.PI / 2); g.translate(0, 0.13, 0); return faceted(g, () => 1.0); })(),
  ]);
  return { orb, spike, disc };
}

export function install(kit, game) {
  const S = shapes();
  kit.registerShape('lightning.orb', S.orb, { blend: 'alpha', outline: false });
  kit.registerShape('lightning.spike', S.spike, { blend: 'solid', outline: true });
  kit.registerShape('lightning.disc', S.disc, { blend: 'solid', outline: true });
  const R = kit.ramp('lightning');
  const M = {};
  const bolt = (from, to, castId, o = {}) => kit.bolt({ from, to, forks: o.forks ?? 2, width: o.width ?? 0.08, halo: o.halo ?? 0.3, life: o.life ?? 0.06, afterglow: o.afterglow ?? 0.25, el: 'lightning', castId, seed: o.seed ?? castId });

  M.cast = (s) => {
    return H(
      kit.line({ shape: 'glyph', glyph: 'lightning', el: 'lightning', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.55, s.r ?? 0.38), width: 0.04, life: s.life ?? 0.2, tIn: 0.05, tOut: 0.1, spin: 0, castId: s.castId, color: R.mid, color2: R.light }),
      kit.line({ shape: 'ticks', n: 6, r2: 0.6, el: 'lightning', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.7, (s.r ?? 0.38) * 1.35), width: 0.018, life: s.life ?? 0.2, tIn: 0.04, tOut: 0.1, spin: 3.2, castId: s.castId, alpha: 0.75 }),
    );
  };
  /** trail: soft plasma orb (`mid` body, crisp `light` rim) + a thin violet streak ribbon. */
  M.trail = (s) => {
    const sc = s.scale ?? 1;
    const out = [kit.mesh('lightning.orb', { follow: s.follow, pos: s.pos, scale: 0.55 * sc, life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, erode: false, castId: s.castId })];
    if (s.follow) out.push(kit.ribbon({ follow: s.follow, width: 0.08 * sc, taper: 1, life: 0.14, maxLen: s.len ?? 1.4, el: 'lightning', castId: s.castId, tailSat: 0.4 }));
    return H(out);
  };
  /** burst: 3 short forked bolts radiating + 4-point star (2 frames) + crackle tick ring + lichtenberg decal. */
  M.burst = (s) => {
    const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, out = [];
    const rnd = rng((s.castId || 1) * 19 + 11), a0 = rnd() * TAU;
    for (let i = 0; i < 3; i++) { const a = a0 + i * TAU / 3 + rnd() * 0.4; out.push(bolt(s.pos, v3(s.pos.x + Math.cos(a) * r * 1.7, s.pos.y + 0.2 + rnd() * r * 0.5, s.pos.z + Math.sin(a) * r * 1.7), s.castId, { forks: 1, width: 0.07, life: 0.06, seed: (s.castId || 1) * 3 + i })); }
    out.push(kit.line({ shape: 'star', points: 4, r2: 0.12, el: 'lightning', pos: s.pos, plane: 'billboard', r: r * 0.6, width: 0.035, life: 0.08, tIn: 0, tOut: 0.04, castId: s.castId, color: R.mid, color2: R.hi, additiveCore: 0.6, rot: 0.785 }));
    out.push(kit.line({ shape: 'ticks', n: 12, r2: 0.7, el: 'lightning', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 1.05, width: 0.025, life: 0.32, tIn: 0.0, tOut: 0.2, scaleIn: 'expand', spin: 2, castId: s.castId }));
    if (gp && s.decal !== false) out.push(kit.decal('lichtenberg', gp, r * 0.8, s.decalLife ?? 0.6, { el: 'lightning', castId: s.castId, alpha: 0.32 }));
    kit.spark(s.pos, 'lightning', Math.min(4, s.n ?? 4), null, { castId: s.castId, speed: 7, life: 0.2 });
    return H(out);
  };
  /** spark: ≤ 8 arc-crawl sparks + one tiny bolt. */
  M.spark = (s) => {
    kit.spark(s.pos, 'lightning', Math.min(4, s.n ?? 4), s.dir || null, { castId: s.castId, speed: 6, life: 0.18 });
    const a = ((s.castId || 0) * 2.3) % TAU;
    return H(bolt(s.pos, v3(s.pos.x + Math.cos(a) * 0.7, s.pos.y + 0.3, s.pos.z + Math.sin(a) * 0.7), s.castId, { forks: 0, width: 0.04, halo: 0.15, life: 0.04, afterglow: 0.12 }));
  };
  /** zone: rotating dotted ring + lichtenberg glyph (0.32 alpha). */
  M.zone = (s) => {
    const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 4, gp = groundAt(game, s.pos);
    return H(
      kit.decal('lichtenberg', gp, r * 0.9, life, { el: 'lightning', castId: s.castId, alpha: 0.3 }),
      kit.line({ shape: 'dots', n: Math.round(12 + r * 5), el: 'lightning', pos: gp, plane: 'ground', r, width: 0.035, life, tIn: 0.2, tOut: 0.4, spin: 0.5, alpha: 0.35, castId: s.castId }),
      kit.line({ shape: 'ticks', n: 6, r2: 0.82, el: 'lightning', pos: gp, plane: 'ground', r: r * 0.7, width: 0.02, life, tIn: 0.3, tOut: 0.4, spin: -0.8, alpha: 0.3, castId: s.castId }),
    );
  };
  /** pillar: vertical strike from above (2 frames + afterglow) + base ring + lichtenberg. */
  M.pillar = (s) => {
    const h = Math.min(14, s.h ?? 9), gp = groundAt(game, s.pos, 0.05), out = [];
    out.push(bolt(v3(gp.x + 0.6, gp.y + h, gp.z - 0.4), gp, s.castId, { forks: s.forks ?? 2, width: s.width ?? 0.1, halo: 0.32, life: 0.06, afterglow: 0.3 }));
    out.push(kit.line({ shape: 'ring', el: 'lightning', pos: gp, plane: 'ground', r: Math.min(3, s.r ?? 1.2), width: 0.035, life: 0.35, tIn: 0, tOut: 0.25, scaleIn: 'expand', castId: s.castId }));
    if (s.decal !== false) out.push(kit.decal('lichtenberg', gp, Math.min(4, (s.r ?? 1.2) * 1.4), s.decalLife ?? 0.6, { el: 'lightning', castId: s.castId, alpha: 0.32 }));
    kit.spark(gp, 'lightning', Math.min(8, s.n ?? 5), v3(0, 1, 0), { castId: s.castId, speed: 6, life: 0.2 });
    return H(out);
  };
  /** wave: 3 bolts fanning along the direction + a crackling arc front. */
  M.wave = (s) => {
    const r = Math.min(s.r ?? 5, 12), d = flatDir(s.dir), a = Math.atan2(d.z, d.x), half = Math.min(1.4, s.arc ?? 0.6), out = [];
    for (let i = 0; i < 3; i++) { const aa = a + (i - 1) * half * 0.7; out.push(bolt(s.pos, v3(s.pos.x + Math.cos(aa) * r, s.pos.y, s.pos.z + Math.sin(aa) * r), s.castId, { forks: 1, width: 0.07, seed: (s.castId || 1) * 5 + i })); }
    out.push(kit.line({ shape: 'arc', arc: [a - half, a + half], el: 'lightning', pos: groundAt(game, s.pos), plane: 'ground', r, width: 0.035, life: 0.35, tOut: 0.2, scaleIn: 'expand', castId: s.castId }));
    return H(out);
  };
  /** aura: spinning tick ring at the feet + a small crackle; the caller re-plays `spark` every ~0.8 s. */
  M.aura = (s) => {
    const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
    return H(
      kit.line({ shape: 'ticks', n: 9, r2: 0.7, el: 'lightning', pos: s.pos, follow: s.follow, followOff: v3(0, 0.06, 0), plane: 'flat', r, width: 0.03, life, tIn: 0.15, tOut: 0.3, spin: 2.6, alpha: 0.45, castId: s.castId }),
      kit.line({ shape: 'dots', n: 14, el: 'lightning', pos: s.pos, follow: s.follow, followOff: v3(0, 0.06, 0), plane: 'flat', r: r * 1.2, width: 0.02, life, tIn: 0.2, tOut: 0.3, spin: -1.4, alpha: 0.35, castId: s.castId }),
    );
  };
  M.summon = (s) => {
    const r = Math.min(s.r ?? 1, 3), gp = groundAt(game, s.pos);
    return H(
      kit.line({ shape: 'poly', sides: 3, el: 'lightning', pos: gp, plane: 'ground', r, width: 0.035, life: s.life ?? 0.8, tIn: 0.2, tOut: 0.3, spin: 1.2, castId: s.castId, alpha: 0.8 }),
      kit.line({ shape: 'glyph', glyph: 'lightning', el: 'lightning', pos: gp, plane: 'ground', r: r * 0.7, width: 0.03, life: s.life ?? 0.8, tIn: 0.25, tOut: 0.3, spin: -0.6, castId: s.castId, alpha: 0.7 }),
      bolt(v3(gp.x, gp.y + 7, gp.z), gp, s.castId, { forks: 1, width: 0.07, life: 0.05, afterglow: 0.2 }),
    );
  };
  for (const k in M) kit.registerMotif('lightning', k, M[k]);
  return { M, bolt };
}
