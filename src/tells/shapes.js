// tells shapes (PLAN v4 §5.2, §7.4.4): normalised shape records, decal quads and footprint packing.
// Hit geometry is the core reference (core/tellgeom.js) so tells.hitTest is identical to the stub (T3).
// Angles: radians, HALF-angle. Ground plane = XZ.
import { hitTest as refHitTest, shapeDistance as refDistance } from '../core/tellgeom.js';

export const hitTest = refHitTest;
export const shapeDistance = refDistance;

/** Decal shape codes (shader `kind`). */
export const SHAPE_CODE = { circle: 0, ring: 1, cone: 2, line: 3, capsule: 4, conecap: 5 };
/** Families: radial decals (circle/ring/cone) and linear decals (line/capsule/conecap) use different grids. */
export const SHAPE_FAMILY = { circle: 'radial', ring: 'radial', cone: 'radial', line: 'linear', capsule: 'linear', conecap: 'linear' };
/** Tell kind codes (shader palette index). */
export const TELL_CODE = { danger: 0, parry: 1, unblockable: 2, jump: 3, projectile: 4, hazard: 5, safe: 6, punish: 7 };
export const TELL_KINDS = ['danger', 'parry', 'unblockable', 'jump', 'projectile', 'hazard', 'safe', 'punish'];

/**
 * Footprint kinds written into tells.footprints().data (8 floats per footprint: x, z, kind, r, dirX, dirZ, param, len).
 *   1 circle  (r)                       2 ring (r = outer, param = inner)
 *   3 cone    (r, dir, param = half-angle rad)
 *   4 line    (dir, len, r = half width; starts at x, z)
 *   5 capsule (x, z = start, dir = unit toward end, len = segment length, r = half width)
 * A conecap writes a capsule and a cone footprint. Safe zones and winding-up bodies are circles.
 */
export const FOOT_KIND = { circle: 1, ring: 2, cone: 3, line: 4, capsule: 5 };

const EDGE_MARGIN = 0.45;       // quad margin around the true shape for the outer band (≥ 0.12 m or 3 px)

/** Mutable shape record with own vectors (no aliasing of the caller's objects). */
export function makeShape() {
  return { kind: 'circle', px: 0, py: 0, pz: 0, dx: 0, dz: 1, r: 3, inner: 0, angle: Math.PI / 4, len: 8, width: 1.6, ex: 0, ez: 0, hasEnd: false,
    // the object handed to the core reference geometry ({kind, pos, dir, r, inner, angle, len, width, end})
    ref: { kind: 'circle', pos: { x: 0, y: 0, z: 0 }, dir: null, r: 3, inner: 0, angle: Math.PI / 4, len: 8, width: 1.6, end: null },
    _end: { x: 0, y: 0, z: 0 }, _dir: { x: 0, y: 0, z: 1 }, dirExplicit: false };
}

/** Copy a spec shape ({kind, pos, dir, r, inner, angle, len, width, end}) into a record; fallbackPos for a missing pos. */
export function setShape(S, sh, fallbackPos, fallbackDir) {
  const k = sh && SHAPE_CODE[sh.kind] != null ? sh.kind : 'circle';
  S.kind = k;
  const p = (sh && sh.pos) || fallbackPos;
  S.px = p ? p.x : 0; S.py = p ? (p.y || 0) : 0; S.pz = p ? p.z : 0;
  const d = (sh && sh.dir) || fallbackDir;
  S.dirExplicit = !!(sh && sh.dir);
  setDir(S, d ? d.x : 0, d ? d.z : 1);
  S.r = +(sh?.r ?? (k === 'ring' ? 5 : k === 'cone' || k === 'conecap' ? 4 : 3));
  S.inner = +(sh?.inner ?? (k === 'ring' ? S.r * 0.5 : 0));
  S.angle = +(sh?.angle ?? Math.PI / 4);
  S.len = +(sh?.len ?? 8);
  S.width = +(sh?.width ?? 1.6);
  if (sh && sh.end) { S.ex = sh.end.x; S.ez = sh.end.z; S.hasEnd = true; }
  else if (k === 'capsule' || k === 'conecap') { S.ex = S.px + S.dx * S.len; S.ez = S.pz + S.dz * S.len; S.hasEnd = true; }
  else S.hasEnd = false;
  syncRef(S);
  return S;
}
export function setDir(S, x, z) {
  const l = Math.sqrt(x * x + z * z);
  if (l < 1e-6) { S.dx = 0; S.dz = 1; } else { S.dx = x / l; S.dz = z / l; }
}
/** Keep the reference-geometry view in sync (call after any mutation). */
export function syncRef(S) {
  const R = S.ref;
  R.kind = S.kind; R.pos.x = S.px; R.pos.y = S.py; R.pos.z = S.pz; S._dir.x = S.dx; S._dir.z = S.dz;
  R.dir = S.kind === 'conecap' && !S.dirExplicit ? null : S._dir;
  R.r = S.r; R.inner = S.inner; R.angle = S.angle; R.len = S.len; R.width = S.width;
  if (S.hasEnd) { S._end.x = S.ex; S._end.z = S.ez; R.end = S._end; } else R.end = null;
  // conecap: the cone points along dir when given explicitly, else along pos → end (reference rule)
  return R;
}

/**
 * Decal quad of a shape (local frame: origin O, forward F = dir (or pos→end), right R = (F.z, −F.x)).
 * out = {ox, oz, fx, fz, aMin, aMax, half, p0, p1, p2, p3, coneRot, fillLen}  (metres; coneRot = conecap cone dir in the local frame, rad)
 */
export function decalQuad(S, out) {
  let fx = S.dx, fz = S.dz;
  const k = S.kind;
  out.ox = S.px; out.oz = S.pz; out.coneRot = 0; out.p2 = 0; out.p3 = 0;
  if (k === 'circle' || k === 'ring') {
    out.aMin = -S.r - EDGE_MARGIN; out.aMax = S.r + EDGE_MARGIN; out.half = S.r + EDGE_MARGIN;
    out.p0 = S.r; out.p1 = k === 'ring' ? Math.min(S.inner, S.r - 0.05) : 0;
    out.fillLen = k === 'ring' ? Math.max(0.05, S.r - out.p1) : S.r;
  } else if (k === 'cone') {
    const a = Math.min(Math.PI, Math.max(0.02, S.angle));
    out.aMin = (a > Math.PI / 2 ? S.r * Math.cos(a) : 0) - EDGE_MARGIN;
    out.aMax = S.r + EDGE_MARGIN;
    out.half = (a >= Math.PI / 2 ? S.r : S.r * Math.sin(a)) + EDGE_MARGIN;
    out.p0 = S.r; out.p1 = a; out.fillLen = S.r;
  } else if (k === 'line') {
    const hw = S.width / 2;
    out.aMin = -EDGE_MARGIN; out.aMax = S.len + EDGE_MARGIN; out.half = hw + EDGE_MARGIN;
    out.p0 = S.len; out.p1 = hw; out.fillLen = S.len;
  } else {
    // capsule / conecap: segment pos → end
    let vx = S.ex - S.px, vz = S.ez - S.pz; const L = Math.sqrt(vx * vx + vz * vz);
    if (L > 1e-5) { vx /= L; vz /= L; fx = vx; fz = vz; }
    const hw = S.width / 2;
    out.p0 = L; out.p1 = hw;
    if (k === 'capsule') {
      out.aMin = -hw - EDGE_MARGIN; out.aMax = L + hw + EDGE_MARGIN; out.half = hw + EDGE_MARGIN; out.fillLen = L + 2 * hw;
    } else {
      const a = Math.min(Math.PI, Math.max(0.02, S.angle));
      out.p2 = S.r; out.p3 = a;
      // cone direction relative to F (explicit dir wins, else along the segment)
      let cdx = fx, cdz = fz;
      if (S.dirExplicit) { cdx = S.dx; cdz = S.dz; }
      const rx = fz, rz = -fx;                                           // R
      out.coneRot = Math.atan2(cdx * rx + cdz * rz, cdx * fx + cdz * fz); // angle from F toward R
      const reach = S.r;
      out.aMin = -Math.max(hw, reach) - EDGE_MARGIN; out.aMax = L + reach + EDGE_MARGIN; out.half = Math.max(hw, reach) + EDGE_MARGIN;
      out.fillLen = L + hw + reach;
    }
  }
  out.fx = fx; out.fz = fz;
  return out;
}

/** Centroid of a shape on the ground (for off-screen arrows and footprint ranking). */
export function centroid(S, out) {
  const k = S.kind;
  if (k === 'circle' || k === 'ring') { out.x = S.px; out.z = S.pz; }
  else if (k === 'cone') { out.x = S.px + S.dx * S.r * 0.5; out.z = S.pz + S.dz * S.r * 0.5; }
  else if (k === 'line') { out.x = S.px + S.dx * S.len * 0.5; out.z = S.pz + S.dz * S.len * 0.5; }
  else { out.x = (S.px + S.ex) * 0.5; out.z = (S.pz + S.ez) * 0.5; }
  out.y = S.py;
  return out;
}

/** Writes the footprint(s) of shape S at data[o…]; returns the number of footprints written (0–2). */
export function writeFootprint(S, data, o, max) {
  if (max <= 0) return 0;
  const k = S.kind;
  const put = (i, x, z, kind, r, dx, dz, param, len) => {
    const b = o + i * 8;
    data[b] = x; data[b + 1] = z; data[b + 2] = kind; data[b + 3] = r; data[b + 4] = dx; data[b + 5] = dz; data[b + 6] = param; data[b + 7] = len;
  };
  if (k === 'circle') { put(0, S.px, S.pz, FOOT_KIND.circle, S.r, S.dx, S.dz, 0, 0); return 1; }
  if (k === 'ring') { put(0, S.px, S.pz, FOOT_KIND.ring, S.r, S.dx, S.dz, S.inner, 0); return 1; }
  if (k === 'cone') { put(0, S.px, S.pz, FOOT_KIND.cone, S.r, S.dx, S.dz, S.angle, 0); return 1; }
  if (k === 'line') { put(0, S.px, S.pz, FOOT_KIND.line, S.width / 2, S.dx, S.dz, 0, S.len); return 1; }
  let vx = S.ex - S.px, vz = S.ez - S.pz; const L = Math.sqrt(vx * vx + vz * vz);
  if (L > 1e-5) { vx /= L; vz /= L; } else { vx = S.dx; vz = S.dz; }
  put(0, S.px, S.pz, FOOT_KIND.capsule, S.width / 2, vx, vz, 0, L);
  if (k === 'conecap' && max > 1) {
    const cx = S.dirExplicit ? S.dx : vx, cz = S.dirExplicit ? S.dz : vz;
    put(1, S.ex, S.ez, FOOT_KIND.cone, S.r, cx, cz, S.angle, 0); return 2;
  }
  return 1;
}
