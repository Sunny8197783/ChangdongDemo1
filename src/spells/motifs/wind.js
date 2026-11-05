// 바람 wind motifs (PLAN v4 §3.5, magic): tapered RB streamlines with a crisp leading edge, thin crescent air blades (alpha body,
// `hi` leading edge), polar-coordinate spirals on the ground, ≤ 20 leaf flecks following the curl. Everything translucent.
// Never: fog walls, opaque tornado cylinders, mint puffs, upward chevrons. Owner: magic.
import { slab, merge, groundAt, nearGround, qFwd, rng, flatDir, arcPoints, helixPoints, v3, TAU, H } from './common.js';

export const SHAPES = ['wind.crescent', 'wind.leaf'];

function shapes() {
  // thin crescent blade in the XZ plane, bulging toward +Z; aGrad high on the outer (leading) edge
  const N = 18, pts = [];
  for (let i = 0; i <= N; i++) { const a = -1.25 + (i / N) * 2.5; pts.push([Math.sin(a) * 0.9, Math.cos(a) * 0.9 - 0.55]); }
  for (let i = N; i >= 0; i--) { const a = -1.25 + (i / N) * 2.5, w = Math.cos(a * 0.8) * 0.2; pts.push([Math.sin(a) * (0.9 - w), Math.cos(a) * (0.9 - w) - 0.62]); }
  const crescent = slab(pts, 0.03, (x, z) => 0.3 + 0.9 * Math.max(0, (z + 0.6) / 0.95));
  const leaf = (() => { const q = []; for (let i = 0; i <= 8; i++) { const t = i / 8; q.push([Math.sin(t * Math.PI) * 0.09, t * 0.3 - 0.15]); } for (let i = 8; i >= 0; i--) { const t = i / 8; q.push([-Math.sin(t * Math.PI) * 0.09, t * 0.3 - 0.15]); } return slab(q, 0.01, (x, z) => 0.6 + z); })();
  return { crescent: merge([crescent]), leaf };
}

export function install(kit, game) {
  const S = shapes();
  kit.registerShape('wind.crescent', S.crescent, { blend: 'premul', outline: false });
  kit.registerShape('wind.leaf', S.leaf, { blend: 'solid', outline: false });
  const R = kit.ramp('wind');
  const M = {};
  const stream = (points, castId, o = {}) => kit.ribbon({ points, width: o.width ?? 0.12, taper: 0.95, life: o.life ?? 0.4, el: 'wind', castId, alpha: o.alpha ?? 0.7, edge: 1, tailSat: 0.25 });
  const leaves = (p, n, castId, dir = null) => kit.spark(p, 'wind', Math.min(12, n), dir, { castId, shape: 'leaf', gravity: 1, speed: 4, life: 0.6, size: 0.14 });

  M.cast = (s) => H(
    kit.line({ shape: 'glyph', glyph: 'wind', el: 'wind', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.6, s.r ?? 0.42), width: 0.04, life: s.life ?? 0.24, tIn: 0.08, tOut: 0.12, spin: 2.2, castId: s.castId, color: R.mid, color2: R.light }),
    kit.line({ shape: 'spiral', turns: 0.9, arms: 3, r2: 0.15, el: 'wind', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.75, (s.r ?? 0.42) * 1.35), width: 0.02, life: s.life ?? 0.24, tIn: 0.1, tOut: 0.1, spin: -3, castId: s.castId, alpha: 0.7 }),
  );
  /** trail: spinning thin crescent blade (alpha body, hi leading edge) + one streamline ribbon. */
  M.trail = (s) => {
    const sc = s.scale ?? 1;
    const q = s.dir ? qFwd(s.dir) : undefined;
    const out = [kit.mesh('wind.crescent', { follow: s.follow, pos: s.pos, quat: q, scale: 0.85 * sc, life: s.life ?? Infinity, tIn: 0.12, tOut: 0.12, erode: true, castId: s.castId, alpha: 0.85 })];
    if (s.follow) out.push(kit.ribbon({ follow: s.follow, width: 0.09 * sc, taper: 1, life: 0.2, maxLen: s.len ?? 1.6, el: 'wind', castId: s.castId, alpha: 0.6, tailSat: 0.2 }));
    return H(out);
  };
  /** burst: 3-arm polar spiral expanding + a crescent + leaf flecks. */
  M.burst = (s) => {
    const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, out = [];
    const rot = ((s.castId || 0) * 0.9) % TAU;
    out.push(kit.line({ shape: 'spiral', turns: 0.7, arms: 3, r2: 0.1, el: 'wind', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 1.1, width: 0.04, life: 0.42, tIn: 0, tOut: 0.25, scaleIn: 'expand', spin: 3, castId: s.castId, rot }));
    out.push(kit.line({ shape: 'crescent', el: 'wind', pos: s.pos, plane: 'billboard', r: r * 0.6, width: 0.035, life: 0.2, tIn: 0, tOut: 0.1, castId: s.castId, color: R.mid, color2: R.hi, additiveCore: 0.6, rot: rot + 1 }));
    for (let i = 0; i < 2; i++) { const a = rot + i * Math.PI; out.push(stream(arcPoints(s.pos, r * 0.7, a, a + 2.2, 8, 0.1), s.castId, { width: 0.08, life: 0.3 })); }
    leaves(s.pos, Math.min(6, s.n ?? 5), s.castId);
    return H(out);
  };
  M.spark = (s) => { kit.spark(s.pos, 'wind', Math.min(6, s.n ?? 4), s.dir || null, { castId: s.castId, shape: 'streak', gravity: 0, speed: 7, life: 0.2 }); return null; };
  /** zone: polar spiral disc (0.32 alpha) + dotted rim; persistent. */
  M.zone = (s) => {
    const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 4, gp = groundAt(game, s.pos);
    return H(
      kit.line({ shape: 'spiral', turns: 1.1, arms: 3, r2: 0.12, el: 'wind', pos: gp, follow: s.follow, plane: 'ground', r, width: 0.035, life, tIn: 0.25, tOut: 0.5, spin: 1.2, alpha: 0.32, castId: s.castId, role: 'fill' }),
      kit.line({ shape: 'dots', n: Math.round(12 + r * 5), el: 'wind', pos: gp, follow: s.follow, plane: 'ground', r: r * 1.03, width: 0.03, life, tIn: 0.25, tOut: 0.5, spin: -0.6, alpha: 0.32, castId: s.castId }),
    );
  };
  /** pillar: 3 helical tapered streamlines rising (0.45 alpha) + a ground spiral. */
  M.pillar = (s) => {
    const h = Math.min(10, s.h ?? 5), r = Math.min(4, s.r ?? 1.2), gp = groundAt(game, s.pos, 0.1), out = [];
    for (let i = 0; i < 3; i++) out.push(stream(helixPoints(gp, r * 0.5, r * (s.flare ?? 1.2), h, 1.4, i * TAU / 3, 16), s.castId, { width: 0.14, life: s.life ?? 0.8, alpha: 0.45 }));
    out.push(kit.line({ shape: 'spiral', turns: 0.8, arms: 3, r2: 0.2, el: 'wind', pos: gp, plane: 'ground', r: r * 1.3, width: 0.03, life: s.life ?? 0.8, tIn: 0.1, tOut: 0.3, spin: 2, castId: s.castId, alpha: 0.5 }));
    return H(out);
  };
  /** wave: 5 curved streamlines sweeping the cone + an expanding arc front + leaves. */
  M.wave = (s) => {
    const r = Math.min(s.r ?? 5, 12), d = flatDir(s.dir), a = Math.atan2(d.z, d.x), half = Math.min(1.4, s.arc ?? 0.7), out = [];
    const o = s.pos, rnd = rng((s.castId || 1) * 23);
    const n = s.streams ?? 5;
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5, aa = a + k * half * 1.6, curl = (k > 0 ? 1 : -1) * 0.35;
      const pts = [];
      for (let j = 0; j < 8; j++) { const t = j / 7, ang = aa + curl * t * t, rr = 0.6 + t * r; pts.push(v3(o.x + Math.cos(ang) * rr, o.y + 0.2 + rnd() * 0.15, o.z + Math.sin(ang) * rr)); }
      out.push(stream(pts, s.castId, { width: 0.11 - Math.abs(k) * 0.04, life: 0.35 + rnd() * 0.08 }));
    }
    out.push(kit.line({ shape: 'arc', arc: [a - half, a + half], el: 'wind', pos: groundAt(game, o), plane: 'ground', r: r * 0.9, width: 0.04, life: 0.4, tOut: 0.25, scaleIn: 'expand', castId: s.castId, alpha: 0.75 }));
    leaves(o, s.leaves ?? 8, s.castId, d);
    return H(out);
  };
  /** aura: two thin crescent arcs circling the shoulders + a ground spiral (buff). */
  M.aura = (s) => {
    const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
    return H(
      kit.line({ shape: 'crescent', el: 'wind', pos: s.pos, follow: s.follow, followOff: v3(0, 1.3, 0), plane: 'flat', r: r * 0.85, width: 0.025, life, tIn: 0.2, tOut: 0.3, spin: 3.2, alpha: 0.45, castId: s.castId }),
      kit.line({ shape: 'spiral', turns: 0.6, arms: 2, r2: 0.3, el: 'wind', pos: s.pos, follow: s.follow, followOff: v3(0, 0.05, 0), plane: 'flat', r, width: 0.025, life, tIn: 0.2, tOut: 0.3, spin: -2, alpha: 0.35, castId: s.castId }),
    );
  };
  M.summon = (s) => {
    const r = Math.min(s.r ?? 1, 3), gp = groundAt(game, s.pos);
    return H(
      kit.line({ shape: 'glyph', glyph: 'wind', el: 'wind', pos: gp, plane: 'ground', r, width: 0.035, life: s.life ?? 0.8, tIn: 0.25, tOut: 0.3, spin: 1.5, castId: s.castId, alpha: 0.8 }),
      stream(helixPoints(gp, r * 0.4, r * 0.9, 2.2, 1.2, 0, 12), s.castId, { width: 0.1, life: 0.6 }),
    );
  };
  for (const k in M) kit.registerMotif('wind', k, M[k]);
  return { M, stream, leaves };
}
