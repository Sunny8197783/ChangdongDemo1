// Reference tell geometry and timing floors (PLAN v4 §5.2, §5.7, §7.4.4). Owned by core; used by the core tells stub
// (core/stubs.js) and importable by the real tells module (T3 asserts tells.hitTest equals this reference on 10,000
// random points). Pure functions, no allocation. Angles in radians, HALF-angle. Ground plane = XZ (y ignored).
//
// shape: { kind:'circle'|'ring'|'cone'|'line'|'capsule'|'conecap', pos:{x,z}, dir?:{x,z}, r?, inner?, angle?, len?, width?, end?:{x,z} }
//   circle  centre pos, radius r
//   ring    centre pos, inner radius inner, outer radius r
//   cone    apex pos, direction dir, radius r, half-angle angle
//   line    starts at pos, extends len along dir, total width width
//   capsule segment pos → end, total width width (round caps)
//   conecap capsule pos → end (width) + cone at end along dir (or along pos→end when dir is absent), radius r, half-angle angle
// hitTest(shape, p, pad) = the distance from p to the shape (0 inside) is ≤ pad.

/** Minimum tell-start → hit seconds per class at normal difficulty (§5.7). `check` = as authored. */
export const TELL_MIN = Object.freeze({ mobLight: 0.75, mobHeavy: 0.85, combo: 0.55, mobRanged: 0.90, elite: 0.80, boss: 1.00, bossAoE: 1.20, unblockable: 1.00, check: 0 });
/** Minimum aim lock before the hit per class (§5.7). */
export const TELL_LOCK = Object.freeze({ mobLight: 0.35, mobHeavy: 0.35, combo: 0.30, mobRanged: 0.35, elite: 0.35, boss: 0.40, bossAoE: 0.40, unblockable: 0.40, check: 0 });
export const DEFAULT_LOCK_AT = 0.35;
export const DEFAULT_PAD = 0.15;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}
function dirOf(shape, out) {
  let x = shape.dir ? shape.dir.x : 0, z = shape.dir ? shape.dir.z : 1;
  const l = Math.sqrt(x * x + z * z);
  if (l < 1e-9) { x = 0; z = 1; } else { x /= l; z /= l; }
  out[0] = x; out[1] = z;
  return out;
}
const _d = [0, 0];

/** Distance from (px, pz) to a sector (apex ax, az; unit dir dx, dz; radius r; half-angle a). 0 inside. */
function sectorDist(px, pz, ax, az, dx, dz, r, a) {
  const vx = px - ax, vz = pz - az, d = Math.sqrt(vx * vx + vz * vz);
  if (d < 1e-9) return 0;
  const cosT = (vx * dx + vz * dz) / d;
  const theta = Math.acos(cosT < -1 ? -1 : cosT > 1 ? 1 : cosT);
  if (a >= Math.PI) return d <= r ? 0 : d - r;
  if (theta <= a) return d <= r ? 0 : d - r;
  // outside the angular range: distance to the nearer edge segment (the arc is never nearer there)
  const c = Math.cos(a), s = Math.sin(a);
  const e1x = dx * c - dz * s, e1z = dx * s + dz * c;      // dir rotated +a
  const e2x = dx * c + dz * s, e2z = -dx * s + dz * c;     // dir rotated −a
  const d1 = segDist(px, pz, ax, az, ax + e1x * r, az + e1z * r);
  const d2 = segDist(px, pz, ax, az, ax + e2x * r, az + e2z * r);
  return d1 < d2 ? d1 : d2;
}

/** Distance (m, ≥ 0) from a ground point to the shape; 0 inside. Unknown kinds → Infinity. */
export function shapeDistance(shape, p) {
  if (!shape || !shape.pos || !p) return Infinity;
  const cx = shape.pos.x, cz = shape.pos.z, px = p.x, pz = p.z;
  switch (shape.kind) {
    case 'circle': {
      const d = Math.hypot(px - cx, pz - cz), r = shape.r ?? 3;
      return d <= r ? 0 : d - r;
    }
    case 'ring': {
      const d = Math.hypot(px - cx, pz - cz), r = shape.r ?? 5, ri = shape.inner ?? 0;
      if (d > r) return d - r;
      if (d < ri) return ri - d;
      return 0;
    }
    case 'cone': {
      dirOf(shape, _d);
      return sectorDist(px, pz, cx, cz, _d[0], _d[1], shape.r ?? 4, shape.angle ?? Math.PI / 4);
    }
    case 'line': {
      dirOf(shape, _d);
      const len = shape.len ?? 8, hw = (shape.width ?? 1.6) / 2;
      const vx = px - cx, vz = pz - cz;
      const u = vx * _d[0] + vz * _d[1];                 // along
      const w = -vx * _d[1] + vz * _d[0];                // across
      const du = u < 0 ? -u : u > len ? u - len : 0;
      const dw = Math.abs(w) > hw ? Math.abs(w) - hw : 0;
      return Math.sqrt(du * du + dw * dw);
    }
    case 'capsule': {
      const e = shape.end || shape.pos, hw = (shape.width ?? 1.6) / 2;
      const d = segDist(px, pz, cx, cz, e.x, e.z);
      return d <= hw ? 0 : d - hw;
    }
    case 'conecap': {
      const e = shape.end || shape.pos, hw = (shape.width ?? 1.6) / 2;
      const dc = segDist(px, pz, cx, cz, e.x, e.z);
      const capD = dc <= hw ? 0 : dc - hw;
      let dx, dz;
      if (shape.dir) { dirOf(shape, _d); dx = _d[0]; dz = _d[1]; }
      else { dx = e.x - cx; dz = e.z - cz; const l = Math.hypot(dx, dz); if (l < 1e-9) { dx = 0; dz = 1; } else { dx /= l; dz /= l; } }
      const coneD = sectorDist(px, pz, e.x, e.z, dx, dz, shape.r ?? 4, shape.angle ?? Math.PI / 4);
      return capD < coneD ? capD : coneD;
    }
    default: return Infinity;
  }
}

/** The reference hit test: true when p lies inside the shape grown by pad (default 0.15 m). */
export function hitTest(shape, p, pad = DEFAULT_PAD) {
  return shapeDistance(shape, p) <= pad;
}

/** dur = max(windup, MIN[cls]) × assist.tellMul × (e.timeMul ?? 1) (§5.7); tellMul never takes it below floor × 0.9. */
export function tellDuration(base, cls, tellMul = 1, timeMul = 1) {
  const floor = TELL_MIN[cls] ?? 0;
  const w = Math.max(+base || 0, floor);
  const mul = Math.max(0.9, +tellMul || 1);
  return w * mul * (+timeMul || 1);
}
