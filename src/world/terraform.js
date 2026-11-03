// v3 terraform (CONTRACT §13 ground rule): Mirwen basin, Elderwood glade/hollow/root ridges, the ascent valley, the
// Kalis ledge, the root plateau with its 5 root-pillar spires, and the root ramps — all baked into the existing height
// grid (no resize), so every world.getHeight call site sees them. Pure functions; used by terrain.js while baking.
import * as THREE from 'three';
import { TF, WATER, ARENA_DEFS, GATE_DEFS } from './zones.js';
import { vnoise, fbm, sstep, smin } from './noise.js';

const M = TF.mirwen, E = TF.elderwood, LD = TF.ledge, PL = TF.plateau, PI = TF.pillars, V = TF.valley;
const TAU = Math.PI * 2;

/** Polyline distance with an arc-length parameter (u in 0..1). */
function polyDist(x, z, pts, lens, total, out) {
  let best = Infinity, bu = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
    const l2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) { best = d; bu = (acc + t * lens[i]) / total; }
    acc += lens[i];
  }
  if (out) out.u = bu;
  return Math.sqrt(best);
}
function prepLine(pts) {
  const lens = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  return { pts, lens, total, box: { x0, x1, z0, z1 } };
}
const inBox = (b, x, z, m) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;

const VALLEY = prepLine(V.pts);
const RAMPS = TF.ramps.map((r) => Object.assign(prepLine(r.pts), r));
const _o = { u: 0 };

/** The 5 root-pillar spire centres on the plateau (shared with plateau.js and the arena data). */
export const PILLARS = Array.from({ length: PI.count }, (_, k) => {
  const a = PI.a0 + (k / PI.count) * TAU;
  return { x: PL.x + Math.cos(a) * PI.r, z: PL.z + Math.sin(a) * PI.r, a, top: PL.top + PI.h };
});
/** Hydra arena ruin pillars (6 at r 14) poking out of the lake. */
export const HYDRA_PILLARS = Array.from({ length: ARENA_DEFS.hydra.pillarCount }, (_, k) => {
  const H = ARENA_DEFS.hydra, a = 0.3 + (k / H.pillarCount) * TAU;
  return { x: H.x + Math.cos(a) * H.pillarR, z: H.z + Math.sin(a) * H.pillarR, a, top: H.pillarTop };
});

/** Ridge gaps → the rot wall placements (centre, tangent yaw, span). */
export const RIDGE_GAPS = [];
for (const R of E.ridges) for (const g of R.gaps) {
  RIDGE_GAPS.push({ x: R.x + Math.cos(g) * R.r, z: R.z + Math.sin(g) * R.r, a: g, ridge: R, half: E.gapHalfM, h: R.h, w: R.w });
}

function angIn(a, a0, a1) {   // a in [a0, a1] (a1 may exceed 2π)
  let t = a; while (t < a0) t += TAU; while (t > a0 + TAU) t -= TAU;
  return t <= a1;
}
/** Additive root-ridge height at (x, z). */
function ridgeAdd(x, z) {
  let add = 0;
  for (let i = 0; i < E.ridges.length; i++) {
    const R = E.ridges[i];
    const dx = x - R.x, dz = z - R.z; const d = Math.hypot(dx, dz);
    const dr = Math.abs(d - R.r); if (dr > R.w + 1.5) continue;
    const a = Math.atan2(dz, dx);
    if (!angIn(a, R.a0, R.a1)) continue;
    let gapK = 1;
    for (const g of R.gaps) {
      let da = Math.abs(a - g) % TAU; if (da > Math.PI) da = TAU - da;
      const m = da * R.r;   // metres along the ring from the gap centre
      gapK = Math.min(gapK, sstep(E.gapHalfM - 0.4, E.gapHalfM + 1.6, m));
    }
    // ends of an open arc taper down
    let endK = 1;
    if (R.a1 - R.a0 < TAU - 0.01) {
      let t = a; while (t < R.a0) t += TAU;
      endK = sstep(0, 0.12, t - R.a0) * sstep(0, 0.12, R.a1 - t);
    }
    const n = 0.8 + 0.4 * vnoise(x * 0.21, z * 0.21, 404);
    const prof = sstep(R.w + 1.4, R.w * 0.45, dr + vnoise(x * 0.5, z * 0.5, 405) * 0.5);
    add = Math.max(add, R.h * n * prof * gapK * endK);
  }
  return add;
}

/**
 * Apply every v3 terraform to the height h at (x, z). `T` = terrain flatten targets (T.glade, T.hollow, T.arena) and
 * `arenaW` = the golem arena flatten weight at this point (the valley never touches the arena itself).
 */
export function terraform(x, z, h, T, arenaW = 0) {
  // ---------------- the ascent valley: carve the mountains between the golem arena, the ledge and the plateau
  if (inBox(VALLEY.box, x, z, V.hw + 14)) {
    const d = polyDist(x, z, VALLEY.pts, VALLEY.lens, VALLEY.total, _o);
    if (d < V.hw + 14) {
      const fl = V.floor + _o.u * 1.2 + fbm(x * 0.05, z * 0.05, 2, 410) * 1.1;
      const w = sstep(V.hw + 14, V.hw, d + vnoise(x * 0.09, z * 0.09, 411) * 4) * (1 - arenaW);
      if (h > fl) h -= (h - fl) * w;
    }
  }
  // ---------------- Mirwen basin (an ellipse below WATER), islands, waterfall cliff, the cave slot, the shore pad
  {
    const dx = (x - M.x) / M.rx, dz = (z - M.z) / M.rz;
    let dn = Math.sqrt(dx * dx + dz * dz);
    if (dn < 1.6) {
      dn += vnoise(x * 0.08, z * 0.08, 420) * 0.07;
      const shape = dn < 0.82 ? M.floor - 0.7 * (1 - (dn / 0.82) * (dn / 0.82)) : M.floor + (dn - 0.82) * 32;
      h = smin(h, shape, 1.6);
      for (let i = 0; i < M.islands.length; i++) {
        const I = M.islands[i];
        const ex = x - I.x, ez = z - I.z; const e2 = ex * ex + ez * ez;
        if (e2 > (I.r + 6) * (I.r + 6)) continue;
        const d = Math.sqrt(e2) + vnoise(x * 0.35, z * 0.35, 421 + i) * 0.9;
        const k = d / I.r;
        const isl = k < 1 ? I.top - k * k * 0.9 + vnoise(x * 0.6, z * 0.6, 430) * 0.15 : I.top - 0.9 - (d - I.r) * 1.5;
        if (isl > h) h = isl;
      }
    }
    // waterfall cliff on the west shore (terraced mesa, absolute top)
    const C = M.cliff;
    const dc = Math.hypot(x - C.x, z - C.z) + vnoise(x * 0.12, z * 0.12, 33) * 2.2;
    if (dc < C.r + 7) {
      const t = sstep(C.r + 5, C.r, dc);
      const step = sstep(0.0, 0.3, t) * 0.4 + sstep(0.5, 0.85, t) * 0.6;
      const top = C.h + fbm(x * 0.08, z * 0.08, 2, 44) * 0.8;
      if (top > h) h += (top - h) * step;
    }
    // slot canyon running into the cliff behind the falls (seed shrine)
    const S = M.cave;
    if (x > S.x0 - 3 && x < S.x1 + 3 && Math.abs(z - S.z) < S.hw + 3) {
      const w = sstep(S.hw + 1.0, S.hw - 0.2, Math.abs(z - S.z)) * sstep(S.x0 - 1.2, S.x0 + 0.4, x) * sstep(S.x1 + 2.5, S.x1, x);
      if (w > 0) h += (S.floor - h) * w;
    }
    const P = M.shorePad;
    const dp = Math.hypot(x - P.x, z - P.z);
    if (dp < P.r + 6) { const w = sstep(P.r + 5, P.r, dp); h += (P.y - h) * w; }
    // hydra arena ruin pillars (stand-on tops; the colliders live in mirwen.js)
    for (let i = 0; i < HYDRA_PILLARS.length; i++) {
      const Q = HYDRA_PILLARS[i]; const ex = x - Q.x, ez = z - Q.z;
      if (ex * ex + ez * ez > 9) continue;
      const w = sstep(2.0, 1.1, Math.hypot(ex, ez));
      if (Q.top > h) h += (Q.top - 0.15 - h) * w;
    }
  }
  // ---------------- Elderwood: 녹스's glade, the treant hollow (the (108,−92) mesa becomes its cliff), root ridges
  {
    const G = E.glade, dg = Math.hypot(x - G.x, z - G.z);
    if (dg < G.r + 8 && T.glade != null) { const w = sstep(G.r + 6, G.r + 0.5, dg + vnoise(x * 0.2, z * 0.2, 440) * 1.5); h += (T.glade - h) * w; }
    const H = E.hollow, dh = Math.hypot(x - H.x, z - H.z);
    if (dh < H.r + 9 && T.hollow != null) { const w = sstep(H.r + 7, H.r + 1, dh + vnoise(x * 0.2, z * 0.2, 441) * 1.8); h += (T.hollow + fbm(x * 0.07, z * 0.07, 2, 442) * 0.35 - h) * w; }
    if (Math.abs(x - E.x) < 48 && Math.abs(z - E.z) < 48) h += ridgeAdd(x, z);
  }
  // ---------------- the Kalis ledge (+24 m) and the root plateau (+38 m): terraced cliffs
  // the plateau first, then the ledge (inside its rim the ledge wins, outside it only raises) — the two rims touch
  h = mesaTo(x, z, h, PL, 460, false);
  h = mesaTo(x, z, h, LD, 450, true);
  // the mirror alcove on the ledge's back rim
  {
    const A = TF.alcove; const dx = x - A.x, dz = z - A.z; const d = Math.hypot(dx, dz);
    const dr = Math.abs(d - A.r);
    if (dr < 3) {
      const a = Math.atan2(dz, dx);
      let da = Math.abs(a - A.gapA) % TAU; if (da > Math.PI) da = TAU - da;
      const gap = sstep(0.42, 0.7, da);
      h += A.h * sstep(1.6, 0.5, dr) * gap;
    }
  }
  // root-pillar spires on the plateau
  if (Math.abs(x - PL.x) < PL.r && Math.abs(z - PL.z) < PL.r) {
    for (let i = 0; i < PILLARS.length; i++) {
      const Q = PILLARS[i]; const ex = x - Q.x, ez = z - Q.z;
      if (ex * ex + ez * ez > (PI.rBase + 1) ** 2) continue;
      const w = sstep(PI.rBase, PI.rTop, Math.hypot(ex, ez));
      if (Q.top > h) h += (Q.top - h) * w;
    }
  }
  // ---------------- root ramps (walkable crowns rising out of the valley)
  for (let i = 0; i < RAMPS.length; i++) {
    const R = RAMPS[i];
    if (!inBox(R.box, x, z, R.hw + 4)) continue;
    const d = polyDist(x, z, R.pts, R.lens, R.total, _o);
    if (d > R.hw + 3.5) continue;
    const u = _o.u, e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
    const ry = R.y0 + (R.y1 - R.y0) * e + Math.sin(u * 23) * 0.12;
    const w = sstep(R.hw + 3.2, R.hw, d);
    if (ry > h) h += (ry - h) * w;
  }
  return h;
}
function mesaTo(x, z, h, D, seed, rimWins) {
  const d = Math.hypot(x - D.x, z - D.z);
  if (d > D.r + D.cliff + 4) return h;
  if (rimWins && d < D.r - 1.5) return D.top + fbm(x * 0.06, z * 0.06, 2, seed + 2) * 0.45;
  const dn = d + vnoise(x * 0.1, z * 0.1, seed) * 2.6 + vnoise(x * 0.35, z * 0.35, seed + 1) * 0.7;
  const t = sstep(D.r + D.cliff, D.r, dn);
  // terraced cliff (three steps + noise) so the side reads as stacked rock and root bands
  const step = sstep(0.0, 0.18, t) * 0.25 + sstep(0.38, 0.55, t) * 0.35 + sstep(0.72, 0.9, t) * 0.4;
  const top = D.top + fbm(x * 0.06, z * 0.06, 2, seed + 2) * 0.45;
  if (rimWins && top < h) return h;   // the ledge skirt never lowers the plateau
  return h + (top - h) * step;
}

// ---------------------------------------------------------------- terrain colouring (vertex colour loop)
const C = (h) => new THREE.Color(h);
const PAL = {
  mirMoss: C(0x58a184), mirReed: C(0x86b27a), mirStone: C(0x8fa3a8),
  ash: C(0x7a8463), ashDark: C(0x545c48), rot: C(0x6d4b7e), rotDark: C(0x4a3358), glowMoss: C(0x6fd3b0),
  bark: C(0x7a5536), barkDark: C(0x4f3622), moss: C(0x6c9c47), mossBright: C(0x8fc25a),
  crystal: C(0xb9b2cc), crystalBlue: C(0x8e98bd), ledgeMoss: C(0x7ba05a), valley: C(0x74a24e),
};
const _t = new THREE.Color();
/** Recolour (col) and scale grass density for the new zones. Returns the density multiplier. */
export function terraformColor(x, z, h, slope, n1, n2, n3, col) {
  let dens = 1;
  // Mirwen: teal moss shores, reed-green islands, wet stone cliff
  {
    const dx = (x - M.x) / (M.rx + 10), dz = (z - M.z) / (M.rz + 10);
    const w = sstep(1.15, 0.8, Math.sqrt(dx * dx + dz * dz));
    if (w > 0) {
      _t.copy(PAL.mirMoss).lerp(PAL.mirReed, sstep(0.4, 0.8, n2) * 0.6);
      if (slope > 0.25) _t.lerp(PAL.mirStone, sstep(0.25, 0.45, slope));
      col.lerp(_t, w * 0.75);
    }
  }
  // Elderwood: ash moss + violet rot patches; bark on the root ridges
  {
    const d = Math.hypot(x - E.x, z - E.z);
    const w = sstep(E.r + 14, E.r - 4, d);
    if (w > 0) {
      _t.copy(PAL.ash).lerp(PAL.ashDark, sstep(0.35, 0.8, n1) * 0.7);
      const rot = sstep(0.62, 0.8, n2 * 0.7 + n3 * 0.3);
      _t.lerp(PAL.rot, rot * 0.7);
      _t.lerp(PAL.glowMoss, sstep(0.9, 0.97, n3) * 0.5 * (1 - rot));
      col.lerp(_t, w * 0.85);
      const ra = ridgeAdd(x, z);
      if (ra > 0.4) { _t.copy(PAL.bark).lerp(PAL.barkDark, sstep(0.3, 0.8, n3)); _t.lerp(PAL.moss, sstep(3.5, 6.5, ra) * 0.6); col.lerp(_t, sstep(0.4, 2.5, ra)); dens *= 0.4; }
      dens *= 1 - w * 0.45;   // thinner, ashen undergrowth
    }
  }
  // the valley: alpine meadow instead of snow-capped mountain rock
  // ledge: pale crystal stone; plateau: bark cliffs and a mossy crown
  {
    const d = Math.hypot(x - LD.x, z - LD.z);
    if (d < LD.r + LD.cliff + 3) {
      const top = sstep(LD.r + 2, LD.r - 1, d);
      _t.copy(PAL.crystal).lerp(PAL.crystalBlue, sstep(0.4, 0.8, n2) * 0.6);
      _t.lerp(PAL.ledgeMoss, sstep(0.55, 0.85, n1) * 0.55);   // moss between the paving
      col.lerp(_t, Math.max(top * 0.75, slope > 0.3 ? 0.6 : 0));
      dens *= 1 - top * 0.5;
    }
  }
  {
    const d = Math.hypot(x - PL.x, z - PL.z);
    if (d < PL.r + PL.cliff + 4) {
      const top = sstep(PL.r + 1, PL.r - 2, d);
      _t.copy(PAL.moss).lerp(PAL.mossBright, sstep(0.3, 0.8, n1) * 0.5).lerp(PAL.barkDark, sstep(0.75, 0.95, n3) * 0.4);
      col.lerp(_t, top * 0.9);
      if (slope > 0.28) { _t.copy(PAL.bark).lerp(PAL.barkDark, sstep(0.4, 0.8, n2) * 0.7); col.lerp(_t, sstep(0.28, 0.5, slope) * 0.9); }
      dens *= 1 - top * 0.6;
    }
  }
  for (let i = 0; i < RAMPS.length; i++) {
    const R = RAMPS[i]; if (!inBox(R.box, x, z, R.hw + 4)) continue;
    const d = polyDist(x, z, R.pts, R.lens, R.total, null);
    if (d < R.hw + 2.5) { _t.copy(PAL.bark).lerp(PAL.moss, sstep(0.6, 0.9, n3) * 0.5); col.lerp(_t, sstep(R.hw + 2.5, R.hw * 0.5, d) * 0.85); dens *= sstep(R.hw * 0.4, R.hw + 2.5, d); }
  }
  if (inBox(VALLEY.box, x, z, V.hw)) {
    const d = polyDist(x, z, VALLEY.pts, VALLEY.lens, VALLEY.total, null);
    if (d < V.hw && h < V.floor + 6 && slope < 0.25) col.lerp(PAL.valley, sstep(V.hw, V.hw - 8, d) * 0.4);
  }
  return dens;
}

/** True where flora must not be scattered (arenas, ramps, plateau/ledge tops, gate pads, the cave slot). */
export function floraBlocked(x, z, margin = 0) {
  const A = ARENA_DEFS;
  for (const k in A) { const a = A[k]; if (k === 'hydra') continue; if (Math.hypot(x - a.x, z - a.z) < a.r + 4 + margin) return true; }
  if (Math.hypot(x - PL.x, z - PL.z) < PL.r + PL.cliff + 3 + margin) return true;
  if (Math.hypot(x - LD.x, z - LD.z) < LD.r + LD.cliff + 3 + margin) return true;
  for (const R of RAMPS) if (inBox(R.box, x, z, 10) && polyDist(x, z, R.pts, R.lens, R.total, null) < R.hw + 5 + margin) return true;
  for (const g of GATE_DEFS) if (Math.hypot(x - g.x, z - g.z) < 6 + margin) return true;
  for (const g of RIDGE_GAPS) if (Math.hypot(x - g.x, z - g.z) < g.half + 4 + margin) return true;
  const S = M.cave; if (x > S.x0 - 4 && x < S.x1 + 6 && Math.abs(z - S.z) < S.hw + 5) return true;
  if (Math.hypot(x - M.shorePad.x, z - M.shorePad.z) < M.shorePad.r + 2) return true;
  if (Math.hypot(x - E.mushroom.x, z - E.mushroom.z) < E.mushroom.capR + 3 + margin) return true;
  return false;
}
/** Elderwood forest weight (for denser, darker woods there). */
export function elderwoodWeight(x, z) { return sstep(E.r + 10, E.r - 6, Math.hypot(x - E.x, z - E.z)); }
export { ridgeAdd };
