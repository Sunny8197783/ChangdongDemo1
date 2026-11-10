// Generic element motifs (PLAN v4 §3.5): the fallback for every element × kind (element-ramped linework + accents), plus the
// physical motifs (vfx-owned). A skill look that relies on a generic motif reports 'generic' (kit.motif marks its castId).
// Each element keeps a distinct primary silhouette even in the fallback (§1.4 IoU), built only from LW / SP / RB / BT.
const UP = { x: 0, y: 1, z: 0 };
export const MOTIF_KINDS = ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon'];

// primary linework per element: [shape, extra spec]
const SIG = {
  fire: { shape: 'rays', n: 8, r2: 0.35, width: 0.09, spark: 'ember', grav: -3 },
  ice: { shape: 'star', points: 6, r2: 0.42, width: 0.035, spark: 'shard', grav: 6 },
  lightning: { shape: 'ticks', n: 6, r2: 0.25, width: 0.03, spark: 'spark', grav: 5, bolt: true },
  wind: { shape: 'spiral', turns: 0.8, arms: 3, r2: 0.12, width: 0.05, spark: 'leaf', grav: 1 },
  water: { shape: 'ring', width: 0.035, ripple: true, spark: 'droplet', grav: 14 },
  earth: { shape: 'poly', sides: 4, width: 0.06, spark: 'rock', grav: 16, decal: 'crack' },
  nature: { shape: 'glyph', glyph: 'flower5', width: 0.04, spark: 'petal', grav: 1.2 },
  light: { shape: 'star', points: 8, r2: 0.2, width: 0.025, spark: 'mote', grav: -0.6, ticks: true },
  shadow: { shape: 'crescent', width: 0.05, spark: 'wisp', grav: -0.5 },
  physical: { shape: 'ticks', n: 8, r2: 0.55, width: 0.03, spark: 'spark', grav: 5 },
};

export function installGenericMotifs(kit, game) {
  const gy = (p) => { try { return game.world?.getHeight?.(p.x, p.z) ?? 0; } catch (_) { return 0; } };
  const nearGround = (p, h = 1.6) => p.y - gy(p) < h;
  const G = (p) => ({ x: p.x, y: gy(p), z: p.z, isVector3: false });
  const v3 = (o) => kit.v3(o.x, o.y, o.z);
  const sig = (el) => SIG[el] || SIG.physical;

  const fns = {
    cast(el, s) {
      const r = Math.min(0.6, s.r ?? 0.45);
      return [
        kit.line({ shape: 'glyph', glyph: el === 'physical' ? 'ticks12' : el, el, pos: s.pos, follow: s.follow, plane: 'billboard', r, life: s.life ?? 0.35, tIn: 0.1, tOut: 0.15, spin: 1.2, castId: s.castId, color: kit.ramp(el).light }),
        kit.line({ shape: 'dots', n: 12, el, pos: s.pos, follow: s.follow, plane: 'billboard', r: r * 1.25, width: 0.02, life: s.life ?? 0.35, tIn: 0.12, tOut: 0.15, spin: -2, castId: s.castId, alpha: 0.7 }),
      ];
    },
    trail(el, s) {
      const out = [];
      if (s.follow) out.push(kit.ribbon({ follow: s.follow, width: s.width ?? 0.22, taper: 0.9, life: s.life ?? 0.22, el, castId: s.castId, maxLen: s.len ?? 3 }));
      return out;
    },
    burst(el, s) {
      const S = sig(el), r = Math.max(0.3, Math.min(s.r ?? 1.1, 4)), out = [];
      const ground = nearGround(s.pos);
      const gp = ground ? G(s.pos) : s.pos;
      out.push(kit.line({ shape: 'ring', el, pos: gp, plane: ground ? 'ground' : 'billboard', r: r * 1.5, width: 0.04, life: 0.4, tOut: 0.25, scaleIn: 'expand', castId: s.castId, alpha: 0.75 }));
      out.push(kit.line({ ...S, el, pos: s.pos, plane: 'billboard', r, width: S.width, life: 0.42, tIn: 0.08, tOut: 0.25, erode: true, castId: s.castId, color: kit.ramp(el).light, color2: kit.ramp(el).mid, spin: 0.8 }));
      if (S.ripple && ground) out.push(kit.line({ shape: 'ripple', el, pos: gp, plane: 'ground', r: r * 1.6, width: 0.03, life: 0.7, tOut: 0.4, alpha: 0.35, castId: s.castId }));
      if (S.ticks) out.push(kit.line({ shape: 'ticks', n: 12, r2: 0.82, el, pos: s.pos, plane: 'billboard', r: r * 1.25, width: 0.02, life: 0.36, tOut: 0.2, castId: s.castId, spin: -1 }));
      if (S.bolt) for (let i = 0; i < 2; i++) { const a = i * 2.4 + (s.castId || 0); out.push(kit.bolt({ from: s.pos, to: kit.v3(s.pos.x + Math.cos(a) * r * 1.3, s.pos.y + 0.4, s.pos.z + Math.sin(a) * r * 1.3), forks: 1, el, castId: s.castId, seed: (s.castId || 1) * 7 + i })); }
      if (ground && (s.decal ?? true) && S.decal) out.push(kit.decal(S.decal, gp, r, 2.0, { el, castId: s.castId }));
      kit.spark(s.pos, el, Math.min(12, s.n ?? 10), s.dir || null, { castId: s.castId, shape: S.spark, gravity: S.grav, speed: 6 * Math.sqrt(r) });
      return out;
    },
    spark(el, s) { const S = sig(el); kit.spark(s.pos, el, Math.min(8, s.n ?? 6), s.dir || null, { castId: s.castId, shape: S.spark, gravity: S.grav }); return null; },
    zone(el, s) {
      const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 3, gp = G(s.pos);
      return [
        kit.line({ shape: 'glyph', glyph: 'futhark', el, pos: gp, plane: 'ground', r, life, tIn: 0.25, tOut: 0.4, spin: 0.25, alpha: 0.32, castId: s.castId, follow: s.follow, role: 'fill' }),
        kit.line({ shape: 'dots', n: Math.round(10 + r * 6), el, pos: gp, plane: 'ground', r: r * 1.04, width: 0.035, life, tIn: 0.25, tOut: 0.4, spin: -0.4, alpha: 0.35, castId: s.castId, follow: s.follow }),
      ];
    },
    pillar(el, s) {
      const r = Math.min(0.6, s.r ?? 0.5), h = Math.min(8, s.h ?? 4), gp = G(s.pos);
      const top = kit.v3(gp.x, gp.y + h, gp.z), base = kit.v3(gp.x, gp.y, gp.z);
      const out = [kit.bolt({ from: base, to: top, forks: 0, jagged: el === 'lightning' ? 1 : 0, width: 0.08, halo: r, life: 0.35, afterglow: 0.3, el, castId: s.castId })];
      for (let i = 0; i < 2; i++) out.push(kit.line({ shape: 'ring', el, pos: kit.v3(gp.x, gp.y + 0.4 + i * h * 0.4, gp.z), plane: 'flat', r: r * (1.6 - i * 0.4), width: 0.03, life: 0.5, tIn: 0.1 + i * 0.05, tOut: 0.25, castId: s.castId }));
      kit.spark(base, el, 8, UP, { castId: s.castId, shape: sig(el).spark, gravity: -2, speed: 5 });
      return out;
    },
    wave(el, s) {
      const r = Math.min(s.r ?? 4, 10), dir = s.dir || { x: 0, z: 1 }, a = Math.atan2(dir.z, dir.x), half = Math.min(1.4, s.arc ?? 0.7);
      const gp = G(s.pos);
      return [
        kit.line({ shape: 'arc', arc: [a - half, a + half], el, pos: gp, plane: 'ground', r, width: 0.07, life: s.life ?? 0.45, tOut: 0.25, scaleIn: 'expand', castId: s.castId }),
        kit.line({ shape: 'arc', arc: [a - half * 0.8, a + half * 0.8], el, pos: gp, plane: 'ground', r: r * 0.82, width: 0.025, life: (s.life ?? 0.45) * 0.85, tOut: 0.2, scaleIn: 'expand', castId: s.castId, alpha: 0.5 }),
      ];
    },
    aura(el, s) {
      const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
      const off = kit.v3(0, 0.05, 0);
      return [
        kit.line({ shape: 'dots', n: 14, el, pos: s.pos, follow: s.follow, followOff: off, plane: 'flat', r, width: 0.03, life, tIn: 0.2, tOut: 0.3, spin: 1.1, alpha: 0.6, castId: s.castId }),
        kit.line({ shape: 'ticks', n: 8, r2: 0.8, el, pos: s.pos, follow: s.follow, followOff: off, plane: 'flat', r: r * 1.15, width: 0.02, life, tIn: 0.25, tOut: 0.3, spin: -0.6, alpha: 0.45, castId: s.castId }),
      ];
    },
    summon(el, s) {
      const r = Math.min(s.r ?? 1.2, 3), gp = G(s.pos);
      return [
        kit.line({ shape: 'glyph', glyph: 'hexagram', el, pos: gp, plane: 'ground', r, life: s.life ?? 0.9, tIn: 0.28, tOut: 0.3, spin: 0.6, castId: s.castId, alpha: 0.8 }),
        kit.line({ shape: 'ring', el, pos: gp, plane: 'ground', r: r * 1.15, width: 0.03, life: (s.life ?? 0.9) * 0.9, tIn: 0.3, tOut: 0.3, spin: -0.4, castId: s.castId }),
      ];
    },
  };
  void v3;
  return fns;
}
