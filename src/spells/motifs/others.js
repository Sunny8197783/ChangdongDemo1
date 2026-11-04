// Caster-side stand-ins for the melee-owned element motifs (earth, nature, light, shadow; PLAN v4 §3.5 authoring split).
// They are NOT registered with the kit: the caster looks call kit.motif(el, kind) whenever melee has registered that motif
// (src/sword/motifs/<el>.js) and fall back to these only while it is absent, so a caster skill of those elements never relies on
// the vfx generic fallback. Built from LW / RB / BT / SP and the vfx physical FM shapes tinted with the element ramp, following
// the §3.5 rows (earth: strata chunks + cracks; nature: flower/leaf glyphs + petals + vine ribbons; light: ivory rays, halo
// rings with ticks, 4-point glints, slow motes; shadow: dark crescents with violet rims, ink ribbons, inward wisps).
// Also registers the bow arrow head `<el>.arrow` (FM) for every element: ranger arrows carry element fletching (§3.6). Owner: magic.
import * as THREE from 'three';
import { lathe, merge, faceted, groundAt, nearGround, rng, flatDir, arcPoints, helixPoints, v3, TAU, H } from './common.js';
import { EL9 } from '../palette.js';

function arrowGeo() {
  // shaft + leaf head + 3 fletching vanes, along +Z (head at +Z)
  const shaft = lathe([[0.022, -0.8], [0.022, 0.3]], 5, { grad: () => 0.35 });
  const head = lathe([[0.0, 0.26], [0.07, 0.34], [0.05, 0.48], [0.0, 0.62]], 6, { grad: (t) => 0.7 + 0.4 * t });
  const vanes = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry();
    const P = [0, 0, -0.55, 0, 0.13, -0.75, 0, 0, -0.85, 0, 0, -0.55, 0, 0, -0.85, 0, 0.13, -0.75];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.rotateZ(i * TAU / 3); vanes.push(faceted(g, () => 1.05));
  }
  const g = merge([shaft, head, ...vanes]); g.rotateX(Math.PI / 2); g.rotateX(-Math.PI / 2);
  return g;
}

export function installArrows(kit) {
  const g = arrowGeo();
  for (const el of EL9) kit.registerShape(el + '.arrow', g, { blend: 'solid', outline: true });
}

export function createFallbacks(kit, game) {
  const chunk = (el, o) => kit.mesh('physical.chunk', { el, ...o });
  const shard = (el, o) => kit.mesh('physical.shard', { el, ...o });
  const F = {};
  const glyphCast = (el, glyph, extra) => (s) => H(
    kit.line({ shape: 'glyph', glyph, el, pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.6, s.r ?? 0.42), width: 0.04, life: s.life ?? 0.25, tIn: 0.08, tOut: 0.12, spin: 1, castId: s.castId, color: kit.ramp(el).light, color2: kit.ramp(el).mid }),
    kit.line({ ...extra, el, pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.75, (s.r ?? 0.42) * 1.3), life: s.life ?? 0.25, tIn: 0.1, tOut: 0.1, castId: s.castId, alpha: 0.7 }),
  );
  const zoneOf = (el, a, b) => (s) => {
    const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 4, gp = groundAt(game, s.pos);
    return H(kit.line({ ...a, el, pos: gp, follow: s.follow, plane: 'ground', r, life, tIn: 0.25, tOut: 0.5, alpha: 0.32, castId: s.castId, role: 'fill' }),
      kit.line({ ...b, el, pos: gp, follow: s.follow, plane: 'ground', r: r * (b.k ?? 1.03), life, tIn: 0.3, tOut: 0.5, alpha: 0.32, castId: s.castId }));
  };
  const auraOf = (el, a, b) => (s) => {
    const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
    return H(kit.line({ ...a, el, pos: s.pos, follow: s.follow, followOff: v3(0, 0.05, 0), plane: 'flat', r, life, tIn: 0.2, tOut: 0.3, alpha: 0.42, castId: s.castId }),
      kit.line({ ...b, el, pos: s.pos, follow: s.follow, followOff: v3(0, b.y ?? 2.1, 0), plane: b.plane ?? 'billboard', r: b.r ?? 0.3, life, tIn: 0.2, tOut: 0.3, alpha: 0.5, castId: s.castId }));
  };

  // ---------------------------------------------------------------- earth: strata chunks, cracks, chips
  F.earth = {
    cast: glyphCast('earth', 'earth', { shape: 'poly', sides: 4, width: 0.02, spin: -0.8 }),
    trail: (s) => H(chunk('earth', { follow: s.follow, pos: s.pos, scale: 0.7 * (s.scale ?? 1), life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, erode: true, castId: s.castId, spin: 4, spinAxis: v3(1, 0, 0) }),
      s.follow ? kit.ribbon({ follow: s.follow, width: 0.12 * (s.scale ?? 1), taper: 1, life: 0.15, maxLen: 0.9, el: 'earth', castId: s.castId, alpha: 0.5 }) : null),
    burst: (s) => {
      const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, out = [], rnd = rng((s.castId || 1) * 41);
      out.push(kit.line({ shape: 'poly', sides: 4, el: 'earth', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.9, width: 0.05, life: 0.4, tIn: 0, tOut: 0.25, scaleIn: 'expand', castId: s.castId, rot: rnd() * TAU }));
      for (let i = 0; i < 5; i++) { const a = rnd() * TAU, sp = 3 + r * 1.5; out.push(chunk('earth', { pos: s.pos, scale: 0.25 + rnd() * 0.25, life: 0.6, tIn: 0.02, tOut: 0.25, erode: true, castId: s.castId, vel: v3(Math.cos(a) * sp, 3 + rnd() * 4, Math.sin(a) * sp), gravity: 16, spin: 5 })); }
      if (gp && s.decal !== false) out.push(kit.decal('crack', gp, r * 0.9, s.decalLife ?? 1.2, { el: 'earth', castId: s.castId, alpha: 0.32 }));
      kit.spark(s.pos, 'earth', Math.min(6, s.n ?? 4), null, { castId: s.castId, gravity: 16, speed: 5 });
      return H(out);
    },
    spark: (s) => { kit.spark(s.pos, 'earth', Math.min(6, s.n ?? 4), s.dir || null, { castId: s.castId, gravity: 16, speed: 5 }); return null; },
    zone: zoneOf('earth', { shape: 'crack', width: 0.035, seed: 3 }, { shape: 'poly', sides: 8, width: 0.03 }),
    pillar: (s) => {
      const gp = groundAt(game, s.pos, 0), h = Math.min(5, s.h ?? 2.5), out = [];
      out.push(chunk('earth', { pos: v3(gp.x, gp.y + h * 0.35, gp.z), scale: v3(0.9, h * 0.9, 0.9), life: s.life ?? 1, tIn: 0.14, tOut: 0.3, erode: true, castId: s.castId }));
      out.push(kit.decal('crack', groundAt(game, s.pos), Math.min(3, (s.r ?? 1) * 1.6), 1.2, { el: 'earth', castId: s.castId, alpha: 0.32 }));
      return H(out);
    },
    wave: (s) => {
      const d = flatDir(s.dir), len = Math.min(s.r ?? 5, 12), out = [];
      for (let i = 0; i < 5; i++) { const t = (i + 1) / 5; out.push(shard('earth', { pos: groundAt(game, v3(s.pos.x + d.x * len * t, 0, s.pos.z + d.z * len * t), 0), scale: v3(0.8, 1 + t, 0.8), life: 0.7, tIn: 0.08 + t * 0.2, tOut: 0.3, castId: s.castId })); }
      out.push(kit.decal('crack', groundAt(game, v3(s.pos.x + d.x * len * 0.5, 0, s.pos.z + d.z * len * 0.5)), len * 0.5, 1.2, { el: 'earth', castId: s.castId, alpha: 0.3, rot: Math.atan2(d.z, d.x) }));
      return H(out);
    },
    aura: auraOf('earth', { shape: 'poly', sides: 8, width: 0.035, spin: 0.3 }, { shape: 'poly', sides: 4, width: 0.02, spin: -0.6 }),
    summon: (s) => H(kit.line({ shape: 'glyph', glyph: 'earth', el: 'earth', pos: groundAt(game, s.pos), plane: 'ground', r: Math.min(3, s.r ?? 1), width: 0.035, life: s.life ?? 0.8, tIn: 0.25, tOut: 0.3, castId: s.castId, alpha: 0.8 })),
  };
  // ---------------------------------------------------------------- nature: flower/leaf glyphs, petals, vine ribbons
  const vine = (pts, castId, o = {}) => kit.ribbon({ points: pts, width: o.width ?? 0.08, taper: 0.9, life: o.life ?? 0.9, el: 'nature', castId, alpha: 0.85, edge: 0.9 });
  F.nature = {
    cast: glyphCast('nature', 'nature', { shape: 'dots', n: 10, width: 0.02, spin: -1.4 }),
    trail: (s) => H(shard('nature', { follow: s.follow, pos: s.pos, dir: s.dir, scale: 0.55 * (s.scale ?? 1), life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, castId: s.castId }),
      s.follow ? kit.ribbon({ follow: s.follow, width: 0.08 * (s.scale ?? 1), taper: 1, life: 0.2, maxLen: 1.2, el: 'nature', castId: s.castId, alpha: 0.6 }) : null),
    burst: (s) => {
      const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, out = [];
      out.push(kit.line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.9, width: 0.04, life: 0.6, tIn: 0.12, tOut: 0.3, spin: 0.6, castId: s.castId }));
      for (let i = 0; i < 2; i++) { const a = ((s.castId || 0) + i * 3.1) % TAU; out.push(vine(arcPoints(s.pos, r * 0.6, a, a + 2.4, 8, 0.1), s.castId, { life: 0.5 })); }
      kit.spark(s.pos, 'nature', Math.min(10, s.n ?? 8), null, { castId: s.castId, shape: 'petal', gravity: 1.2, speed: 3 });
      return H(out);
    },
    spark: (s) => { kit.spark(s.pos, 'nature', Math.min(6, s.n ?? 4), s.dir || null, { castId: s.castId, shape: 'petal', gravity: 1, speed: 3 }); return null; },
    zone: zoneOf('nature', { shape: 'glyph', glyph: 'flower5', width: 0.035, spin: 0.15 }, { shape: 'dots', n: 24, width: 0.035, spin: -0.3 }),
    pillar: (s) => { const gp = groundAt(game, s.pos, 0), h = Math.min(5, s.h ?? 2.5), out = [];
      for (let i = 0; i < 3; i++) out.push(vine(helixPoints(gp, 0.35, 0.1, h, 0.8, i * TAU / 3, 10), s.castId, { life: s.life ?? 0.9 }));
      out.push(kit.line({ shape: 'glyph', glyph: 'nature', el: 'nature', pos: groundAt(game, s.pos), plane: 'ground', r: 1.2, width: 0.035, life: 0.8, tIn: 0.2, tOut: 0.3, castId: s.castId, alpha: 0.6 }));
      return H(out); },
    wave: (s) => { const d = flatDir(s.dir), a = Math.atan2(d.z, d.x), r = Math.min(s.r ?? 5, 12), half = Math.min(1.4, s.arc ?? 0.7), gp = groundAt(game, s.pos, 0.2), out = [];
      for (let i = 0; i < 3; i++) out.push(vine(arcPoints(gp, r * (0.5 + i * 0.22), a - half, a + half, 9), s.castId, { life: 0.5, width: 0.07 }));
      kit.spark(gp, 'nature', 8, d, { castId: s.castId, shape: 'leaf', gravity: 1, speed: 6 });
      return H(out); },
    aura: auraOf('nature', { shape: 'glyph', glyph: 'flower5', width: 0.03, spin: 0.5 }, { shape: 'dots', n: 5, width: 0.04, spin: 1.2, plane: 'flat', y: 1.2, r: 0.5 }),
    summon: (s) => H(kit.line({ shape: 'glyph', glyph: 'nature', el: 'nature', pos: groundAt(game, s.pos), plane: 'ground', r: Math.min(3, s.r ?? 1.2), width: 0.035, life: s.life ?? 0.9, tIn: 0.25, tOut: 0.3, spin: 0.4, castId: s.castId, alpha: 0.8 }),
      vine(helixPoints(groundAt(game, s.pos, 0), 0.6, 0.2, 1.8, 1, 0, 10), s.castId)),
  };
  // ---------------------------------------------------------------- light: ivory rays, halo rings with ticks, 4-point glints, motes
  F.light = {
    cast: glyphCast('light', 'light', { shape: 'ticks', n: 12, r2: 0.8, width: 0.015, spin: -0.8 }),
    trail: (s) => H(shard('light', { follow: s.follow, pos: s.pos, dir: s.dir, scale: 0.6 * (s.scale ?? 1), life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, castId: s.castId }),
      s.follow ? kit.ribbon({ follow: s.follow, width: 0.07 * (s.scale ?? 1), taper: 1, life: 0.18, maxLen: 1.6, el: 'light', castId: s.castId, alpha: 0.6 }) : null),
    burst: (s) => {
      const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, R = kit.ramp('light');
      kit.spark(s.pos, 'light', Math.min(6, s.n ?? 4), null, { castId: s.castId, shape: 'mote', gravity: -0.5, speed: 1.5, life: 0.6 });
      return H(kit.line({ shape: 'star', points: 4, r2: 0.1, el: 'light', pos: s.pos, plane: 'billboard', r: r * 0.6, width: 0.03, life: 0.08, tIn: 0, tOut: 0.04, castId: s.castId, color: R.light, color2: R.hi, additiveCore: 0.6 }),
        kit.line({ shape: 'ticks', n: 16, r2: 0.84, el: 'light', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 1.05, width: 0.02, life: 0.45, tIn: 0.05, tOut: 0.25, scaleIn: 'expand', castId: s.castId }),
        kit.line({ shape: 'ring', el: 'light', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.85, width: 0.025, life: 0.4, tIn: 0.04, tOut: 0.25, scaleIn: 'expand', castId: s.castId }));
    },
    spark: (s) => { kit.spark(s.pos, 'light', Math.min(5, s.n ?? 4), s.dir || null, { castId: s.castId, shape: 'mote', gravity: -0.5, speed: 2 }); return null; },
    zone: zoneOf('light', { shape: 'glyph', glyph: 'hexagram', width: 0.03, spin: 0.12 }, { shape: 'ticks', n: 24, r2: 0.9, width: 0.02, spin: -0.2 }),
    pillar: (s) => { const gp = groundAt(game, s.pos, 0.05), h = Math.min(9, s.h ?? 6);
      return H(kit.bolt({ from: v3(gp.x, gp.y + h, gp.z), to: gp, forks: 0, jagged: 0, width: 0.1, halo: Math.min(0.6, s.r ?? 0.5), life: s.life ?? 0.4, afterglow: 0.3, el: 'light', castId: s.castId }),
        kit.line({ shape: 'ticks', n: 12, r2: 0.8, el: 'light', pos: gp, plane: 'ground', r: Math.min(3, (s.r ?? 0.5) * 3), width: 0.025, life: 0.6, tIn: 0.1, tOut: 0.3, spin: 0.6, castId: s.castId })); },
    wave: (s) => { const d = flatDir(s.dir), a = Math.atan2(d.z, d.x), r = Math.min(s.r ?? 5, 12), half = Math.min(1.4, s.arc ?? 0.7);
      return H(kit.line({ shape: 'arc', arc: [a - half, a + half], el: 'light', pos: groundAt(game, s.pos), plane: 'ground', r, width: 0.035, life: 0.45, tOut: 0.25, scaleIn: 'expand', castId: s.castId }),
        kit.line({ shape: 'rays', n: 7, r2: 0.3, el: 'light', pos: groundAt(game, s.pos), plane: 'ground', r: r * 0.9, width: 0.02, life: 0.35, tOut: 0.2, castId: s.castId, rot: a })); },
    aura: auraOf('light', { shape: 'ticks', n: 12, r2: 0.82, width: 0.025, spin: 0.4 }, { shape: 'ring', width: 0.02, spin: 0, plane: 'flat', y: 2.15, r: 0.32 }),
    summon: (s) => H(kit.line({ shape: 'glyph', glyph: 'hexagram', el: 'light', pos: groundAt(game, s.pos), plane: 'ground', r: Math.min(3, s.r ?? 1.2), width: 0.03, life: s.life ?? 0.9, tIn: 0.28, tOut: 0.3, spin: 0.5, castId: s.castId, alpha: 0.8 })),
  };
  // ---------------------------------------------------------------- shadow: dark crescents with violet rims, ink ribbons, wisps inward
  F.shadow = {
    cast: glyphCast('shadow', 'shadow', { shape: 'crescent', width: 0.02, spin: -1.6 }),
    trail: (s) => H(shard('shadow', { follow: s.follow, pos: s.pos, dir: s.dir, scale: 0.6 * (s.scale ?? 1), life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, castId: s.castId }),
      s.follow ? kit.ribbon({ follow: s.follow, width: 0.12 * (s.scale ?? 1), taper: 1, life: 0.22, maxLen: 1.4, el: 'shadow', castId: s.castId, alpha: 0.75, colors: { head: kit.ramp('shadow').dark, tail: kit.ramp('shadow').mid, edge: kit.ramp('shadow').light } }) : null),
    burst: (s) => {
      const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, R = kit.ramp('shadow');
      kit.spark(s.pos, 'shadow', Math.min(8, s.n ?? 6), null, { castId: s.castId, shape: 'wisp', gravity: -0.5, speed: -3, life: 0.5 });
      return H(kit.line({ shape: 'crescent', el: 'shadow', pos: s.pos, plane: 'billboard', r: r * 0.7, width: 0.06, life: 0.35, tIn: 0.04, tOut: 0.2, castId: s.castId, color: R.light, color2: R.dark, rot: ((s.castId || 0) * 1.3) % TAU }),
        kit.line({ shape: 'ring', el: 'shadow', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.9, width: 0.03, life: 0.4, tIn: 0, tOut: 0.25, scaleIn: 'contract', castId: s.castId, color: R.light }));
    },
    spark: (s) => { kit.spark(s.pos, 'shadow', Math.min(6, s.n ?? 4), s.dir || null, { castId: s.castId, shape: 'wisp', gravity: -0.5, speed: 3 }); return null; },
    zone: zoneOf('shadow', { shape: 'spiral', turns: 1.2, arms: 2, r2: 0.1, width: 0.04, spin: -0.6 }, { shape: 'ring', width: 0.03 }),
    pillar: (s) => { const gp = groundAt(game, s.pos, 0.05), h = Math.min(6, s.h ?? 3);
      return H(...[0, 1, 2].map((i) => kit.ribbon({ points: helixPoints(gp, 0.5, 0.15, h, 0.7, i * TAU / 3, 10), width: 0.1, life: s.life ?? 0.8, el: 'shadow', castId: s.castId, alpha: 0.8, colors: { head: kit.ramp('shadow').dark, edge: kit.ramp('shadow').light } }))); },
    wave: (s) => { const d = flatDir(s.dir), a = Math.atan2(d.z, d.x), r = Math.min(s.r ?? 5, 12), half = Math.min(1.4, s.arc ?? 0.7), R = kit.ramp('shadow');
      return H(kit.line({ shape: 'arc', arc: [a - half, a + half], el: 'shadow', pos: groundAt(game, s.pos), plane: 'ground', r, width: 0.06, life: 0.4, tOut: 0.25, scaleIn: 'expand', castId: s.castId, color: R.light, color2: R.dark }),
        kit.ribbon({ points: arcPoints(groundAt(game, s.pos, 0.5), r * 0.75, a - half, a + half, 9), width: 0.14, life: 0.4, el: 'shadow', castId: s.castId, alpha: 0.8, colors: { head: R.dark, edge: R.light } })); },
    aura: auraOf('shadow', { shape: 'crescent', width: 0.03, spin: 1.8 }, { shape: 'ring', width: 0.02, plane: 'flat', y: 0.05, r: 1.1 }),
    summon: (s) => H(kit.line({ shape: 'glyph', glyph: 'shadow', el: 'shadow', pos: groundAt(game, s.pos), plane: 'ground', r: Math.min(3, s.r ?? 1.2), width: 0.035, life: s.life ?? 0.9, tIn: 0.25, tOut: 0.3, spin: -0.5, castId: s.castId, alpha: 0.8 })),
  };
  return F;
}
