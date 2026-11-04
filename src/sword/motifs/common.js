// Shared helpers for the melee motif files (earth / nature / light / shadow). Owner: melee.
// Geometry is authored once at factory time and registered into the element's FM shape atlas (kit.registerShape);
// every motif returns kit handles carrying the cast's castId (owner 'player').
import * as THREE from 'three';

/** Non-indexed merge of geometries (position + normal [+ aGrad]); grads[i] = number | fn(x, y, z) → 0..1 per part. */
export function merge(parts, grads = []) {
  const list = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), G = new Float32Array(n);
  let o = 0;
  list.forEach((g, gi) => {
    if (!g.attributes.normal) g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal, ga = g.attributes.aGrad;
    const gr = grads[gi];
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      P[(o + i) * 3] = x; P[(o + i) * 3 + 1] = y; P[(o + i) * 3 + 2] = z;
      N[(o + i) * 3] = na.getX(i); N[(o + i) * 3 + 1] = na.getY(i); N[(o + i) * 3 + 2] = na.getZ(i);
      G[o + i] = ga ? ga.getX(i) : typeof gr === 'function' ? gr(x, y, z) : (gr ?? 0.5);
    }
    o += pa.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('aGrad', new THREE.BufferAttribute(G, 1));
  return out;
}
/** Flat-shaded copy with an aGrad attribute from fn(x, y, z). */
export function faceted(g, fn) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  const pa = ng.attributes.position, G = new Float32Array(pa.count);
  for (let i = 0; i < pa.count; i++) G[i] = fn(pa.getX(i), pa.getY(i), pa.getZ(i));
  ng.setAttribute('aGrad', new THREE.BufferAttribute(G, 1));
  return ng;
}
/** Deterministic jitter (no Math.random in signature shapes, R7). */
export const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function jitter(g, amt, seed = 1) {
  const p = g.attributes.position;
  // weld by position so facets stay closed
  const key = (i) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  const offs = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = key(i); let o = offs.get(k);
    if (!o) { const h = offs.size + seed; o = [(hash(h) - 0.5) * amt, (hash(h + 17) - 0.5) * amt, (hash(h + 31) - 0.5) * amt]; offs.set(k, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  p.needsUpdate = true;
  return g;
}
/** Tapered tube along points (radius r0 → r1), aGrad along the length. */
export function taperTube(points, r0, r1, seg = 20, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position;
  const ng = g.toNonIndexed();
  const q = ng.attributes.position;
  // TubeGeometry vertices: (seg+1) rings × (radial+1); recompute by nearest curve parameter
  const pts = curve.getSpacedPoints(seg);
  const G = new Float32Array(q.count);
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < q.count; i++) {
    v.set(q.getX(i), q.getY(i), q.getZ(i));
    let best = 0, bd = Infinity;
    for (let k = 0; k <= seg; k++) { const d = pts[k].distanceToSquared(v); if (d < bd) { bd = d; best = k; } }
    const t = best / seg, rr = r0 + (r1 - r0) * t;
    c.copy(pts[best]);
    v.sub(c).multiplyScalar(rr).add(c);
    q.setXYZ(i, v.x, v.y, v.z);
    G[i] = t;
  }
  void p;
  ng.computeVertexNormals();
  ng.setAttribute('aGrad', new THREE.BufferAttribute(G, 1));
  return ng;
}
/** Extruded flat shape (thin plate) in the XY plane, facing +Z. */
export function plate(shape, depth = 0.03, gradFn = null) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -depth * 0.5);
  return faceted(g, gradFn || ((x, y) => Math.min(1, Math.max(0, y * 0.5 + 0.5))));
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _y = new THREE.Vector3(0, 1, 0);
/** Quaternion turning +Y to dir (for upright shapes leaning along a direction). */
export function upTo(dir, out = new THREE.Quaternion()) { _v.set(dir.x, dir.y, dir.z).normalize(); return out.setFromUnitVectors(_y, _v); }
/** Quaternion turning +Z to dir. */
export function fwdTo(dir, out = new THREE.Quaternion()) { _v.set(dir.x, dir.y, dir.z).normalize(); return out.setFromUnitVectors(_z, _v); }
export const yawQuat = (yaw, out = new THREE.Quaternion()) => out.setFromAxisAngle(_y, yaw);
void _q;
