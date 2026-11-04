// 화염 fire motifs (PLAN v4 §3.5, magic): soft-edged toon lathe flame tongues (3 sizes) with a thin `hi` core, crescent
// flame petals for impacts (ring of 8 opening in 0.2 s), ember streaks, scorch linework. Never: orange puffs, faceted orbs,
// white cores, threat crimson, hatch. Registered with game.vfx.kit from the spells factory. Owner: magic.
import * as THREE from 'three';
import { lathe, merge, slab, faceted, groundAt, nearGround, qUp, qYawTilt, rng, flatDir, arcPoints, v3, TAU, H } from './common.js';

export const SHAPES = ['fire.flame', 'fire.tongue', 'fire.comet', 'fire.petal', 'fire.meteor'];

function shapes() {
  // tall tongue: bulb at the base, three swept lobes toward the tip, base `light` → tip `dark`; thin hi core inside
  const tongue = (h, r, lobes, twist) => lathe([[0.02, 0], [r * 0.8, h * 0.08], [r, h * 0.22], [r * 0.85, h * 0.4], [r * 0.55, h * 0.62], [r * 0.25, h * 0.84], [0.0, h]], 10,
    { grad: (t) => 0.98 - 0.95 * t, mod: (th, t) => 1 + 0.22 * Math.cos(lobes * th) * t, twist });
  const core = (h, r) => lathe([[0.01, h * 0.04], [r, h * 0.16], [r * 0.6, h * 0.34], [0, h * 0.5]], 6, { grad: () => 1.7 });
  const flame = merge([core(1, 0.06), tongue(1, 0.26, 3, 1.1)]);
  const short = merge([core(0.55, 0.07), tongue(0.55, 0.3, 3, 0.6)]);
  // projectile body along +Z: soft head, 3 swept tongues trailing to −Z
  const comet = (() => {
    const g = lathe([[0.0, -0.95], [0.1, -0.7], [0.19, -0.42], [0.25, -0.15], [0.26, 0.02], [0.2, 0.16], [0.0, 0.26]], 12,
      { grad: (t) => 0.1 + 0.95 * t, mod: (th, t) => 1 + 0.3 * Math.cos(3 * th) * (1 - t), twist: 1.6 });
    const c = lathe([[0.0, -0.1], [0.08, 0.0], [0.06, 0.1], [0.0, 0.16]], 6, { grad: () => 1.7 });
    const m = merge([c, g]); m.rotateX(Math.PI / 2);   // +Y → +Z
    return m;
  })();
  // flame petal: curved crescent blade standing on +Y, opening toward +Z
  const petal = (() => {
    const pts = []; const N = 9;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push([Math.sin(t * Math.PI) * 0.22 * (1 - t * 0.3), t * 0.9]); }
    for (let i = N; i >= 0; i--) { const t = i / N; pts.push([-Math.sin(t * Math.PI) * 0.12, t * 0.9]); }
    const g = slab(pts.map(([x, y]) => [x, y]), 0.035, (x, z) => 0.95 - z * 0.9);   // slab is in XZ: map y → z then stand it up
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + y * y * 0.35); }
    g.computeVertexNormals();
    return g;
  })();
  // meteor: dark strata rock (faceted), light only on the upper facets
  const meteor = faceted(new THREE.DodecahedronGeometry(0.5, 1), (x, y) => 0.08 + 0.35 * Math.max(0, y + 0.2));
  { const p = meteor.attributes.position, r = rng(7); for (let i = 0; i < p.count; i += 3) { const k = 0.85 + r() * 0.3; for (let j = 0; j < 3; j++) { p.setX(i + j, p.getX(i + j) * k); p.setZ(i + j, p.getZ(i + j) * (2 - k)); } } meteor.computeVertexNormals(); }
  return { flame, short, comet, petal, meteor };
}

export function install(kit, game) {
  const S = shapes();
  kit.registerShape('fire.flame', S.flame, { blend: 'alpha', outline: true, max: 160 });
  kit.registerShape('fire.tongue', S.short, { blend: 'alpha', outline: true });
  kit.registerShape('fire.comet', S.comet, { blend: 'alpha', outline: true });
  kit.registerShape('fire.petal', S.petal, { blend: 'alpha', outline: false });
  kit.registerShape('fire.meteor', S.meteor, { blend: 'solid', outline: true });
  const R = kit.ramp('fire');
  const M = {};
  const tongueAt = (p, s, life, castId, o = {}) => kit.mesh(o.short ? 'fire.tongue' : 'fire.flame', { pos: p, scale: s, quat: o.quat, life, tIn: o.tIn ?? 0.14, tOut: o.tOut ?? Math.min(0.45, life * 0.5), erode: true, castId, spin: o.spin ?? 0.6, follow: o.follow, followOff: o.followOff, vel: o.vel, drag: o.drag, grow: o.grow });

  /** cast: 3-petal flame glyph at the tip + counter-rotating dotted ring (0.2–0.3 s). */
  M.cast = (s) => H(
    kit.line({ shape: 'glyph', glyph: 'fire', el: 'fire', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.6, s.r ?? 0.4), width: 0.05, life: s.life ?? 0.26, tIn: 0.08, tOut: 0.12, spin: 1.4, castId: s.castId, color: R.light, color2: R.mid }),
    kit.line({ shape: 'dots', n: 10, el: 'fire', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.75, (s.r ?? 0.4) * 1.3), width: 0.022, life: s.life ?? 0.26, tIn: 0.1, tOut: 0.12, spin: -2.2, castId: s.castId, alpha: 0.7 }),
  );
  /** trail: soft toon flame body (swept tongues, thin hi core) + tapered ribbon. setDir is driven by the caller. */
  M.trail = (s) => {
    const sc = s.scale ?? 1;
    const out = [kit.mesh('fire.comet', { follow: s.follow, pos: s.pos, dir: s.dir, scale: 0.9 * sc, life: s.life ?? Infinity, tIn: 0.12, tOut: 0.12, erode: true, castId: s.castId, spin: 0 })];
    if (s.follow) out.push(kit.ribbon({ follow: s.follow, width: 0.2 * sc, taper: 0.95, life: 0.22, maxLen: s.len ?? 1.2 * sc + 0.4, el: 'fire', castId: s.castId, tailSat: 0.25 }));
    return H(out);
  };
  /** burst: crescent flare ring (2 frames) + ring of 8 flame petals opening outward + embers + scorch ring. */
  M.burst = (s) => {
    const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null;
    const base = gp || s.pos, out = [];
    const rnd = rng((s.castId || 1) * 31 + 3);
    out.push(kit.line({ shape: 'crescent', el: 'fire', pos: s.pos, plane: 'billboard', r: r * 0.8, width: 0.05, life: 0.1, tIn: 0.0, tOut: 0.06, castId: s.castId, color: R.light, color2: R.hi, additiveCore: 0.6, rot: rnd() * TAU }));
    out.push(kit.line({ shape: 'ring', el: 'fire', pos: base, plane: gp ? 'ground' : 'billboard', r: r * 1.1, width: 0.035, life: 0.32, tIn: 0.0, tOut: 0.22, scaleIn: 'expand', castId: s.castId, alpha: 0.8 }));
    const n = s.petals ?? 8, y0 = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a = y0 + (i / n) * TAU;
      const p = v3(base.x + Math.cos(a) * r * 0.25, base.y + (gp ? 0.02 : -0.2), base.z + Math.sin(a) * r * 0.25);
      out.push(kit.mesh('fire.petal', { pos: p, quat: qYawTilt(-a + Math.PI / 2, 0.55), scale: Math.min(2.4, 0.55 + r * 0.45), life: 0.42, tIn: 0.2, tOut: 0.22, erode: true, castId: s.castId, vel: v3(Math.cos(a) * r * 0.9, 0.2, Math.sin(a) * r * 0.9), drag: 5 }));
    }
    kit.spark(s.pos, 'fire', Math.min(12, s.n ?? 8), null, { castId: s.castId, shape: 'ember', gravity: -3, speed: 4 + r * 1.5, life: 0.45 });
    if (gp && s.decal !== false) out.push(kit.decal('scorch', gp, r * 0.7, s.decalLife ?? 0.9, { el: 'fire', castId: s.castId, alpha: 0.3 }));
    return H(out);
  };
  /** spark (per target): ember streaks + a tiny crescent, no flare. */
  M.spark = (s) => { kit.spark(s.pos, 'fire', Math.min(8, s.n ?? 5), s.dir || null, { castId: s.castId, shape: 'ember', gravity: -2, speed: 5 }); return null; };
  /** zone: scorch linework (broken rings + ember stipple) + ≤ 6 small tongues at the edge. */
  M.zone = (s) => {
    const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 4, gp = groundAt(game, s.pos), out = [];
    out.push(kit.decal('scorch', gp, r, life, { el: 'fire', castId: s.castId, alpha: 0.3 }));
    out.push(kit.line({ shape: 'stipple', el: 'fire', pos: gp, plane: 'ground', r: r * 0.95, width: 0.05, density: 0.35, life, tIn: 0.2, tOut: 0.5, alpha: 0.3, castId: s.castId, role: 'fill', color: R.light }));
    out.push(kit.line({ shape: 'ring', el: 'fire', pos: gp, plane: 'ground', r, width: 0.03, life, tIn: 0.25, tOut: 0.5, alpha: 0.32, castId: s.castId }));
    const n = Math.min(6, s.tongues ?? Math.round(2 + r)), rnd = rng((s.castId || 1) * 17);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.5, rr = r * (0.75 + rnd() * 0.2);
      out.push(tongueAt(groundAt(game, v3(gp.x + Math.cos(a) * rr, 0, gp.z + Math.sin(a) * rr), 0), 0.35 + rnd() * 0.25, life, s.castId, { short: i % 2 === 1, tIn: 0.2 + i * 0.05 }));
    }
    return H(out);
  };
  /** pillar: column of stacked tongues twisting (hot band only at the base) + base ring + rising embers. */
  M.pillar = (s) => {
    const h = Math.min(8, s.h ?? 3.5), r = Math.min(1.4, s.r ?? 0.8), gp = groundAt(game, s.pos, 0), out = [];
    const k = Math.max(3, Math.min(6, Math.round(h / 0.75)));
    for (let i = 0; i < k; i++) {
      const t = i / k, sc = (1 - t * 0.55) * r * 1.4;
      out.push(tongueAt(v3(gp.x, gp.y + t * h * 0.8, gp.z), sc, s.life ?? 0.8, s.castId, { quat: qYawTilt(i * 1.3, 0.08), tIn: 0.08 + i * 0.04, spin: 1.5 + i * 0.4 }));
    }
    out.push(kit.line({ shape: 'ring', el: 'fire', pos: gp, plane: 'ground', r: r * 1.6, width: 0.035, life: (s.life ?? 0.8) * 0.8, tIn: 0.06, tOut: 0.3, castId: s.castId }));
    kit.spark(v3(gp.x, gp.y + 0.3, gp.z), 'fire', Math.min(10, s.n ?? 8), v3(0, 1, 0), { castId: s.castId, shape: 'ember', gravity: -4, speed: 5, life: 0.6 });
    return H(out);
  };
  /** wave: flame ribbon arcs sweeping the direction + tongues on the outer arc + thin shock arc. */
  M.wave = (s) => {
    const r = Math.min(s.r ?? 4, 10), d = flatDir(s.dir), a = Math.atan2(d.z, d.x), half = Math.min(Math.PI, s.arc ?? 0.7), gp = groundAt(game, s.pos, 0.3), out = [];
    for (let k = 0; k < 3; k++) out.push(kit.ribbon({ points: arcPoints(gp, r * (0.55 + k * 0.2), a - half * (0.7 + k * 0.1), a + half * (0.7 + k * 0.1), 9, 0.2 + k * 0.15), width: 0.22 - k * 0.04, life: 0.35 + k * 0.05, el: 'fire', castId: s.castId, taper: 0.7 }));
    out.push(kit.line({ shape: 'arc', arc: [a - half, a + half], el: 'fire', pos: groundAt(game, s.pos), plane: 'ground', r, width: 0.04, life: 0.4, tOut: 0.25, scaleIn: 'expand', castId: s.castId }));
    const n = Math.min(8, s.tongues ?? 6);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, aa = a - half + t * 2 * half; out.push(tongueAt(groundAt(game, v3(gp.x + Math.cos(aa) * r * 0.9, 0, gp.z + Math.sin(aa) * r * 0.9), 0), 0.5, 0.45, s.castId, { short: true, tIn: 0.05 + t * 0.12 })); }
    kit.spark(gp, 'fire', 8, d, { castId: s.castId, shape: 'ember', gravity: -2, speed: 6 });
    return H(out);
  };
  /** aura: rotating dotted ring at the feet + two crescent flames that circle (buff, 0.35 alpha). */
  M.aura = (s) => {
    const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2, off = v3(0, 0.05, 0);
    return H(
      kit.line({ shape: 'dots', n: 12, el: 'fire', pos: s.pos, follow: s.follow, followOff: off, plane: 'flat', r, width: 0.035, life, tIn: 0.2, tOut: 0.3, spin: 1.2, alpha: 0.4, castId: s.castId }),
      kit.line({ shape: 'crescent', el: 'fire', pos: s.pos, follow: s.follow, followOff: v3(0, 1.0, 0), plane: 'flat', r: r * 0.8, width: 0.03, life, tIn: 0.25, tOut: 0.3, spin: -2.4, alpha: 0.35, castId: s.castId }),
    );
  };
  /** summon: flame glyph ring r 1 at the feet + 3 tongues rising. */
  M.summon = (s) => {
    const r = Math.min(s.r ?? 1, 3), gp = groundAt(game, s.pos), out = [];
    out.push(kit.line({ shape: 'glyph', glyph: 'fire', el: 'fire', pos: gp, plane: 'ground', r, width: 0.04, life: s.life ?? 0.8, tIn: 0.28, tOut: 0.3, spin: 0.8, castId: s.castId, alpha: 0.8 }));
    out.push(kit.line({ shape: 'ring', el: 'fire', pos: gp, plane: 'ground', r: r * 1.2, width: 0.03, life: (s.life ?? 0.8) * 0.9, tIn: 0.3, tOut: 0.3, spin: -0.5, castId: s.castId }));
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; out.push(tongueAt(v3(gp.x + Math.cos(a) * r * 0.5, gp.y, gp.z + Math.sin(a) * r * 0.5), 0.45, 0.6, s.castId, { tIn: 0.15 + i * 0.06 })); }
    return H(out);
  };
  for (const k in M) kit.registerMotif('fire', k, M[k]);
  return { M, tongueAt, qUp };
}
