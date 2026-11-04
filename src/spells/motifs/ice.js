// 빙결 ice motifs (PLAN v4 §3.5, magic): hexagonal prisms (2–3 sizes, flat-shaded, inner gradient + fresnel edge line in
// `light`), bipyramid shards, frost hex-grid linework, 6-spoke stars. 6-fold symmetry everywhere; crystals grow with overshoot
// (FM back-out scale-in) and shatter into shard debris. Never: octahedron blobs, white frost floors, snow noise. Owner: magic.
import { prism, bipyramid, merge, groundAt, nearGround, qUp, qYawTilt, rng, flatDir, v3, TAU, H } from './common.js';

export const SHAPES = ['ice.prism', 'ice.stub', 'ice.shard', 'ice.lance'];

function shapes() {
  const tall = prism(6, 0.16, 0.85, 0.28);
  const stub = prism(6, 0.24, 0.32, 0.2, { taper: 0.85 });
  const shard = bipyramid(6, 0.1, 0.62, { back: 0.35 });
  const lance = merge([bipyramid(6, 0.13, 2.4, { back: 0.25 }), (() => { const g = bipyramid(6, 0.055, 0.9, { back: 0.5 }); g.translate(0, 0, 1.45); return g; })()]);
  return { tall, stub, shard, lance };
}

export function install(kit, game) {
  const S = shapes();
  kit.registerShape('ice.prism', S.tall, { blend: 'solid', outline: true, max: 160 });
  kit.registerShape('ice.stub', S.stub, { blend: 'solid', outline: true });
  kit.registerShape('ice.shard', S.shard, { blend: 'solid', outline: true });
  kit.registerShape('ice.lance', S.lance, { blend: 'solid', outline: true });
  const R = kit.ramp('ice');
  const M = {};
  /** One growing prism standing at p (lean = outward tilt toward yaw a). */
  const prismAt = (p, s, life, castId, { a = 0, lean = 0, tIn = 0.16, stub = false, tOut } = {}) =>
    kit.mesh(stub ? 'ice.stub' : 'ice.prism', { pos: p, quat: qYawTilt(Math.PI / 2 - a, lean), scale: s, life, tIn, tOut: tOut ?? Math.min(0.4, life * 0.4), erode: true, castId });
  const debris = (p, n, castId, speed = 5) => {
    const out = [], rnd = rng((castId || 1) * 13 + 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.4, up = 0.4 + rnd() * 0.6;
      out.push(kit.mesh('ice.shard', { pos: p, dir: v3(Math.cos(a), up, Math.sin(a)), scale: 0.45 + rnd() * 0.35, life: 0.5, tIn: 0.02, tOut: 0.25, erode: true, castId,
        vel: v3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed), gravity: 14, drag: 1.2, spin: 6, spinAxis: v3(1, 0, 0) }));
    }
    return out;
  };

  M.cast = (s) => H(
    kit.line({ shape: 'glyph', glyph: 'ice', el: 'ice', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.6, s.r ?? 0.4), width: 0.04, life: s.life ?? 0.24, tIn: 0.08, tOut: 0.12, spin: 0.9, castId: s.castId, color: R.light, color2: R.mid }),
    kit.line({ shape: 'star', points: 6, r2: 0.18, el: 'ice', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.7, (s.r ?? 0.4) * 1.25), width: 0.018, life: s.life ?? 0.24, tIn: 0.1, tOut: 0.1, spin: -0.6, castId: s.castId, alpha: 0.75 }),
  );
  M.trail = (s) => {
    const sc = s.scale ?? 1;
    const out = [kit.mesh(s.shape === 'lance' ? 'ice.lance' : 'ice.shard', { follow: s.follow, pos: s.pos, dir: s.dir, scale: (s.shape === 'lance' ? 0.8 : 1.1) * sc, life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, erode: true, castId: s.castId, spin: s.shape === 'lance' ? 0 : 5, spinAxis: v3(0, 0, 1) })];
    if (s.follow) out.push(kit.ribbon({ follow: s.follow, width: (s.shape === 'lance' ? 0.16 : 0.1) * sc, taper: 1, life: 0.16, maxLen: s.len ?? (s.shape === 'lance' ? 3 : 1.1), el: 'ice', castId: s.castId, tailSat: 0.2 }));
    return H(out);
  };
  /** burst: 6-spoke star (2 frames) + 6 small outward-leaning prisms + shard debris + frost-hex decal. */
  M.burst = (s) => {
    const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos, 0) : null, out = [];
    const rot = ((s.castId || 0) * 0.61) % TAU;
    out.push(kit.line({ shape: 'star', points: 6, r2: 0.16, el: 'ice', pos: s.pos, plane: 'billboard', r: r * 0.55, width: 0.04, life: 0.1, tIn: 0, tOut: 0.05, castId: s.castId, color: R.light, color2: R.hi, additiveCore: 0.6, rot }));
    out.push(kit.line({ shape: 'poly', sides: 6, el: 'ice', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.9, width: 0.03, life: 0.4, tIn: 0.0, tOut: 0.25, scaleIn: 'expand', castId: s.castId, rot }));
    if (gp) {
      const n = s.prisms ?? 6;
      for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; out.push(prismAt(v3(gp.x + Math.cos(a) * r * 0.35, gp.y, gp.z + Math.sin(a) * r * 0.35), Math.min(1.6, 0.35 + r * 0.18) * (i % 2 ? 0.75 : 1), 0.6, s.castId, { a, lean: 0.5, stub: i % 2 === 1, tIn: 0.14 })); }
      if (s.decal !== false) out.push(kit.decal('frost', gp, r * 0.55, s.decalLife ?? 0.8, { el: 'ice', castId: s.castId, alpha: 0.3, rot }));
    }
    out.push(...debris(s.pos, Math.min(6, s.n ?? 6), s.castId, 3 + r));
    return H(out);
  };
  M.spark = (s) => { kit.spark(s.pos, 'ice', Math.min(6, s.n ?? 5), s.dir || null, { castId: s.castId, shape: 'shard', gravity: 8, speed: 4 }); return null; };
  /** zone: frost hex grid (0.3 alpha) + hex rim + ≤ 6 small prisms along the edge. */
  M.zone = (s) => {
    const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 4, gp = groundAt(game, s.pos), out = [];
    const rot = ((s.castId || 0) * 0.61) % TAU;
    out.push(kit.decal('frost', gp, r * 0.62, life, { el: 'ice', castId: s.castId, alpha: 0.3, rot }));
    out.push(kit.line({ shape: 'poly', sides: 6, el: 'ice', pos: gp, plane: 'ground', r: r * 1.02, width: 0.03, life, tIn: 0.25, tOut: 0.5, alpha: 0.35, castId: s.castId, rot }));
    const n = Math.min(6, s.prisms ?? 6), rnd = rng((s.castId || 1) * 7);
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU, rr = r * (0.8 + rnd() * 0.15); out.push(prismAt(groundAt(game, v3(gp.x + Math.cos(a) * rr, 0, gp.z + Math.sin(a) * rr), 0), 0.3 + rnd() * 0.25, life, s.castId, { a, lean: 0.25, stub: i % 2 === 0, tIn: 0.2 + i * 0.04 })); }
    return H(out);
  };
  /** pillar: cluster of 3 prisms (central tall) + frost decal + 6-spoke star at the base. */
  M.pillar = (s) => {
    const h = Math.min(6, s.h ?? 3), r = Math.min(1.5, s.r ?? 0.8), gp = groundAt(game, s.pos, 0), life = s.life ?? 1.0, out = [];
    out.push(prismAt(gp, h / 1.13, life, s.castId, { tIn: 0.16 }));
    for (let i = 0; i < 2; i++) { const a = i * Math.PI + 0.6; out.push(prismAt(v3(gp.x + Math.cos(a) * r * 0.45, gp.y, gp.z + Math.sin(a) * r * 0.45), h * 0.5, life, s.castId, { a, lean: 0.35, tIn: 0.2 + i * 0.04 })); }
    out.push(kit.decal('frost', groundAt(game, s.pos), r * 1.6, Math.max(0.8, life), { el: 'ice', castId: s.castId, alpha: 0.3 }));
    out.push(kit.line({ shape: 'star', points: 6, r2: 0.2, el: 'ice', pos: groundAt(game, s.pos), plane: 'ground', r: r * 1.4, width: 0.03, life: 0.5, tIn: 0.08, tOut: 0.25, castId: s.castId }));
    return H(out);
  };
  /** wave: prisms erupt sequentially along the direction (n) + a frost line of dots. */
  M.wave = (s) => {
    const len = Math.min(s.len ?? s.r ?? 6, 24), d = flatDir(s.dir), side = v3(-d.z, 0, d.x), out = [], n = Math.min(10, s.n ?? Math.round(len / 1.5));
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, off = (i % 2 ? 0.35 : -0.35);
      const p = groundAt(game, v3(s.pos.x + d.x * len * t + side.x * off, 0, s.pos.z + d.z * len * t + side.z * off), 0);
      out.push(prismAt(p, 0.5 + t * 0.9, (s.life ?? 0.9) + t * 0.2, s.castId, { a: Math.atan2(d.z, d.x), lean: 0.35, tIn: 0.06 + t * 0.25, stub: i % 3 === 2 }));
    }
    return H(out);
  };
  /** aura: hex ring at the feet (0.4 alpha) + a 6-spoke star above the head. */
  M.aura = (s) => {
    const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
    return H(
      kit.line({ shape: 'poly', sides: 6, el: 'ice', pos: s.pos, follow: s.follow, followOff: v3(0, 0.05, 0), plane: 'flat', r, width: 0.03, life, tIn: 0.2, tOut: 0.3, spin: 0.6, alpha: 0.4, castId: s.castId }),
      kit.line({ shape: 'star', points: 6, r2: 0.25, el: 'ice', pos: s.pos, follow: s.follow, followOff: v3(0, 2.1, 0), plane: 'billboard', r: 0.28, width: 0.02, life, tIn: 0.2, tOut: 0.3, spin: -0.8, alpha: 0.55, castId: s.castId }),
    );
  };
  M.summon = (s) => {
    const r = Math.min(s.r ?? 1, 3), gp = groundAt(game, s.pos), out = [];
    out.push(kit.line({ shape: 'glyph', glyph: 'frosthex', el: 'ice', pos: gp, plane: 'ground', r, width: 0.035, life: s.life ?? 0.8, tIn: 0.28, tOut: 0.3, spin: 0.5, castId: s.castId, alpha: 0.75 }));
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; out.push(prismAt(groundAt(game, v3(gp.x + Math.cos(a) * r * 0.6, 0, gp.z + Math.sin(a) * r * 0.6), 0), 0.45, 0.7, s.castId, { a, lean: 0.3, tIn: 0.18 + i * 0.05 })); }
    return H(out);
  };
  for (const k in M) kit.registerMotif('ice', k, M[k]);
  return { M, prismAt, debris, qUp };
}
