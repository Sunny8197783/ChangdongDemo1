// Small shared toolkit for boss models (geometry shorthands, glow colours, skinned slot builder). Owned by enemies.
import * as THREE from 'three';
import { P, mergeParts, vcMat, vcFlatMat, vcBasicMat, pivot, buildSkin, rockGeo, glowSpriteMat } from '../common.js';

export { THREE, P, mergeParts, vcMat, vcFlatMat, vcBasicMat, pivot, buildSkin, rockGeo, glowSpriteMat };
export const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
export const C = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
export const K = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
export const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const CAP = (r, l, n = 8) => new THREE.CapsuleGeometry(r, l, 4, n);
export const T = (r, t, n = 12, rs = 6) => new THREE.TorusGeometry(r, t, rs, n);
export const OCT = (r) => new THREE.OctahedronGeometry(r, 0);
export const ICO = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

const cache = {};
export const once = (k, f) => cache[k] || (cache[k] = f());
/** Brighten vertex colours (unlit glow slot; > 1 feeds the bloom). */
export function glowify(geo, k) { const c = geo.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] *= k; return geo; }
/** A pivot chain of n bones, each `len` along local +Y of the previous. */
export function chain(parent, n, len, x = 0, y = 0, z = 0) {
  const out = [];
  let p = pivot(parent, x, y, z);
  out.push(p);
  for (let i = 1; i < n; i++) { p = pivot(p, 0, len, 0); out.push(p); }
  return out;
}
/** Shared unlit ring material per colour key (shield glyphs); colour is a uniform, so tinting never recompiles. */
const _ringMats = {};
export function ringMat(key, color) {
  return _ringMats[key] || (_ringMats[key] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
}
