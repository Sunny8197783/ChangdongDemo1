// Shared helpers for the caster motif files (PLAN v4 §3.5): geometry builders with the FM `aGrad` attribute
// (0 = dark edge … 1 = light, > 1.1 = thin hi core), seeded randomness (R7: signatures seeded per castId), ground helpers.
// Everything here runs at registration / per cast, never per frame. Owner: magic.
import * as THREE from 'three';

export const UP = new THREE.Vector3(0, 1, 0);
export const ZF = new THREE.Vector3(0, 0, 1);
export const TAU = Math.PI * 2;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function gy(game, x, z) { try { const h = game.world?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; } catch (_) { return 0; } }
/** New ground point under p (+lift). */
export const groundAt = (game, p, lift = 0.04) => v3(p.x, gy(game, p.x, p.z) + lift, p.z);
export const nearGround = (game, p, h = 1.6) => p.y - gy(game, p.x, p.z) < h;
/** Quaternion turning +Y onto dir. */
export const qUp = (dir) => new THREE.Quaternion().setFromUnitVectors(UP, v3(dir.x, dir.y, dir.z).normalize());
/** Quaternion turning +Z onto dir. */
export const qFwd = (dir) => new THREE.Quaternion().setFromUnitVectors(ZF, v3(dir.x, dir.y, dir.z).normalize());
/** Yaw (rad) about +Y as a quaternion, optionally tilted outward by `tilt` around the tangent. */
export function qYawTilt(yaw, tilt = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt));
  return q;
}
/** Seeded PRNG (mulberry32) → function returning [0,1). */
export function rng(seed) {
  let a = (seed | 0) * 2654435761 >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const flatDir = (d, out = v3()) => { out.set(d?.x || 0, 0, d?.z || 0); if (out.lengthSq() < 1e-6) out.set(0, 0, 1); return out.normalize(); };

function withGrad(g, gradFn) {
  const p = g.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = gradFn(p.getX(i), p.getY(i), p.getZ(i), i);
  g.setAttribute('aGrad', new THREE.BufferAttribute(a, 1));
  return g;
}
/** Smooth lathe around +Y. profile: [[r, y], …] bottom → top; mod(theta, t) multiplies the radius; grad(t, theta) → aGrad. */
export function lathe(profile, segs, { grad = (t) => 1 - t, mod = null, twist = 0 } = {}) {
  const rows = profile.length, pos = [], gr = [], idx = [];
  const yMin = profile[0][1], yMax = profile[rows - 1][1];
  for (let j = 0; j < rows; j++) {
    const [r, y] = profile[j], t = (y - yMin) / Math.max(1e-6, yMax - yMin);
    for (let i = 0; i <= segs; i++) {
      const th = (i / segs) * TAU + twist * t;
      const rr = r * (mod ? mod(th - twist * t, t) : 1);
      pos.push(Math.cos(th) * rr, y, Math.sin(th) * rr); gr.push(grad(t, th));
    }
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + segs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aGrad', new THREE.Float32BufferAttribute(gr, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Merge non-indexed copies (keeps aGrad, recomputes nothing). */
export function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), G = new Float32Array(n);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    const ga = g.attributes.aGrad; for (let i = 0; i < g.attributes.position.count; i++) G[o + i] = ga ? ga.getX(i) : 0.6;
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('aGrad', new THREE.BufferAttribute(G, 1));
  return g;
}
/** Flat-shaded faceted solid from an indexed geometry (non-indexed, face normals) with a gradient. */
export function faceted(g, grad) {
  const ni = g.index ? g.toNonIndexed() : g.clone();
  ni.deleteAttribute('uv'); ni.deleteAttribute('normal'); ni.computeVertexNormals();
  return withGrad(ni, grad);
}
/** Hexagonal (n-sided) prism along +Y with a pointed top: base at y = 0, shoulder at h, tip at h + tip. */
export function prism(n = 6, r = 0.2, h = 1, tip = 0.3, { taper = 0.92 } = {}) {
  const g = new THREE.CylinderGeometry(r * taper, r, h, n, 1, false);
  g.translate(0, h / 2, 0);
  const cone = new THREE.ConeGeometry(r * taper, tip, n, 1, true); cone.translate(0, h + tip / 2, 0);
  const H = h + tip;
  return merge([faceted(g, (x, y) => 0.15 + 0.75 * (y / H)), faceted(cone, (x, y) => 0.95 + 0.1 * (y / H))]);
}
/** Bipyramid (n-sided) along +Z (long axis), length L, radius r. */
export function bipyramid(n = 6, r = 0.12, L = 0.6, { back = 0.4 } = {}) {
  const pos = [], gr = [];
  const tipF = L * (1 - back), tipB = -L * back;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    const p0 = [Math.cos(a0) * r, Math.sin(a0) * r, 0], p1 = [Math.cos(a1) * r, Math.sin(a1) * r, 0];
    pos.push(...p0, ...p1, 0, 0, tipF); gr.push(0.55, 0.55, 1.0);
    pos.push(...p1, ...p0, 0, 0, tipB); gr.push(0.45, 0.45, 0.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aGrad', new THREE.Float32BufferAttribute(gr, 1));
  g.computeVertexNormals();
  return g;
}
/** Thin double-sided slab from a 2D outline in the XZ plane (y thickness t). grad(x, z) → aGrad. */
export function slab(outline, t = 0.02, grad = () => 0.6) {
  const s = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, t / 2, 0);   // shape XY → XZ, centred on y = 0
  return faceted(g, (x, y, z) => grad(x, z));
}
/** Curved thin sheet (double-sided) from a cross-section curve [[y, z], …] extruded along X (width w). grad(u 0..1 along the curve). */
export function sheet(curve, w = 2, segX = 8, grad = (u) => u) {
  const pos = [], gr = [], idx = [], rows = curve.length;
  for (let j = 0; j < rows; j++) for (let i = 0; i <= segX; i++) {
    const x = (i / segX - 0.5) * w, [y, z] = curve[j];
    const edge = 1 - Math.pow(Math.abs(i / segX - 0.5) * 2, 4) * 0.5;
    pos.push(x, y * edge, z); gr.push(grad(j / (rows - 1)));
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < segX; i++) {
    const a = j * (segX + 1) + i, b = a + segX + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); front.setAttribute('aGrad', new THREE.Float32BufferAttribute(gr, 1));
  front.setIndex(idx); front.computeVertexNormals();
  const back = front.clone(); const bi = back.index.array;
  for (let k = 0; k < bi.length; k += 3) { const s = bi[k]; bi[k] = bi[k + 2]; bi[k + 2] = s; }
  const bn = back.attributes.normal.array; for (let k = 0; k < bn.length; k++) bn[k] = -bn[k];
  return merge([front, back]);
}
/** Points along a circular arc (ground plane) for static ribbons. */
export function arcPoints(c, r, a0, a1, n = 9, y = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)); out.push(v3(c.x + Math.cos(a) * r, c.y + y, c.z + Math.sin(a) * r)); }
  return out;
}
/** Helix points (rising) for streamlines / columns. */
export function helixPoints(c, r0, r1, h, turns, phase = 0, n = 14) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1), a = phase + t * turns * TAU, r = r0 + (r1 - r0) * t; out.push(v3(c.x + Math.cos(a) * r, c.y + t * h, c.z + Math.sin(a) * r)); }
  return out;
}
/** Collect handles: drops falsy/dead entries. */
export const H = (...a) => a.flat().filter((h) => h && h.alive !== false);
