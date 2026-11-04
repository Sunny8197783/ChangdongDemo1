// Kit bolts BT (PLAN v4 §3.4; upgrade of vfx/beam.js). Owner: vfx. Recursive midpoint displacement (seeded per castId),
// 2–3 forks, thin core in `hi` + halo in `light`, regenerated every 2–3 frames for life (2–3 frames), then a 0.25 s afterglow
// line in `mid`. Straight beams (jagged 0) use the same strips. All bolts live in strip batches (≤ 3 calls).
import * as THREE from 'three';
import { createStripBatch, stripMaterial } from './ribbon.js';

const BOLT_FRAG = /* glsl */`
  varying vec4 vT; varying vec3 vC; varying vec3 vC2; varying float vM;
  void main() {
    float s = abs(vT.y);
    float px = max(fwidth(s), 1e-4);
    float coreW = max(vT.w, px * 1.2);
    float core = 1.0 - smoothstep(coreW - px, coreW + px, s);
    float halo = pow(max(1.0 - s, 0.0), 2.2) * 0.32;
    float a = (core * 0.85 + halo) * vT.z * vM;
    if (a < 0.004) discard;
    vec3 col = (vC2 * core * 0.85 + vC * halo) * vT.z * vM;
    gl_FragColor = vec4(col, a * 0.8);
  }`;

const PTS = 17;   // 2^4 + 1 points per strip
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(),
  _cam = new THREE.Vector3(), _tan = new THREE.Vector3(), _w = new THREE.Vector3(), _side = new THREE.Vector3(), _fw = new THREE.Vector3();

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function createBolts(game, hooks) {
  const shared = hooks.shared;
  const matP = stripMaterial(game, BOLT_FRAG, shared, true); matP.name = 'kit-bolt';
  const matE = stripMaterial(game, BOLT_FRAG, shared, false); matE.name = 'kit-bolt-enemy';
  const batches = [
    createStripBatch(game, { blocks: 24, pts: PTS, material: matP, name: 'kit-bolt-0' }),
    createStripBatch(game, { blocks: 24, pts: PTS, material: matP, name: 'kit-bolt-1' }),
    createStripBatch(game, { blocks: 12, pts: PTS, material: matE, name: 'kit-bolt-enemy', owner: 'enemy' }),
  ];
  for (const b of batches) for (let i = 0; i < b.blocks; i++) b.clear(i);
  const recs = [];
  let serial = 0;
  const path = new Float32Array(PTS * 3), off = new Float32Array(PTS * 2);

  function freeBlocks(enemy, need) {
    const out = [];
    const list = enemy ? [batches[2]] : [batches[0], batches[1]];
    for (const b of list) {
      let cnt = 0; for (let i = 0; i < b.blocks; i++) if (!b.used[i]) cnt++;
      if (cnt < need) continue;
      for (let i = 0; i < b.blocks && out.length < need; i++) if (!b.used[i]) { b.used[i] = 1; out.push(i); }
      return [b, out];
    }
    return null;
  }
  function release(r) {
    r.alive = false; hooks.onKill?.(r);
    const i = recs.indexOf(r); if (i >= 0) recs.splice(i, 1);
    for (const k of r.blocks) { r.batch.clear(k); r.batch.used[k] = 0; }
  }

  /** rec from kit.bolt(): from, to, forks, width, halo, life, afterglow, jagged, cHi, cLight, cMid, seed, enemy */
  function add(rec) {
    const need = 1 + Math.max(0, Math.min(3, rec.forks | 0));
    let slot = freeBlocks(rec.enemy, need);
    if (!slot) {   // recycle the oldest of this owner
      let old = null; for (const r of recs) if (r.enemy === rec.enemy && (!old || r.born < old.born)) old = r;
      if (old) release(old);
      slot = freeBlocks(rec.enemy, need);
      if (!slot) return null;
    }
    rec.batch = slot[0]; rec.blocks = slot[1]; rec.born = ++serial; rec.alive = true; rec.t = 0; rec.frame = 0;
    rec.rand = rng((rec.seed ?? 0) * 2654435761 + serial);
    recs.push(rec);
    build(rec);
    return rec;
  }

  // midpoint displacement of a strip into `path` (PTS points), perpendicular amplitude amp
  function displace(r, ax, ay, az, bx, by, bz, amp) {
    _d.set(bx - ax, by - ay, bz - az);
    _p1.set(_d.y, -_d.x, 0); if (_p1.lengthSq() < 1e-6) _p1.set(0, _d.z, -_d.y);
    _p1.normalize(); _p2.crossVectors(_d, _p1).normalize();
    off.fill(0);
    let step = PTS - 1, a = amp;
    while (step > 1) {
      const h = step >> 1;
      for (let i = h; i < PTS; i += step) {
        const l = i - h, rr = i + h;
        off[i * 2] = (off[l * 2] + off[rr * 2]) * 0.5 + (r.rand() - 0.5) * 2 * a;
        off[i * 2 + 1] = (off[l * 2 + 1] + off[rr * 2 + 1]) * 0.5 + (r.rand() - 0.5) * 2 * a;
      }
      step = h; a *= 0.55;
    }
    for (let i = 0; i < PTS; i++) {
      const t = i / (PTS - 1), j = i * 3;
      path[j] = ax + _d.x * t + _p1.x * off[i * 2] + _p2.x * off[i * 2 + 1];
      path[j + 1] = ay + _d.y * t + _p1.y * off[i * 2] + _p2.y * off[i * 2 + 1];
      path[j + 2] = az + _d.z * t + _p1.z * off[i * 2] + _p2.z * off[i * 2 + 1];
    }
  }
  function build(r) {
    const f = r.from, t = r.to;
    const len = f.distanceTo(t);
    r.len = len;
    displace(r, f.x, f.y, f.z, t.x, t.y, t.z, r.jagged * len * 0.09);
    if (!r.main) r.main = new Float32Array(PTS * 3);
    r.main.set(path);
    if (!r.fork) r.fork = Array.from({ length: 3 }, () => new Float32Array(PTS * 3));
    for (let k = 1; k < r.blocks.length; k++) {
      const si = 3 + Math.floor(r.rand() * (PTS - 7)), j = si * 3;
      _a.set(t.x - f.x, t.y - f.y, t.z - f.z).normalize();
      _b.set(r.rand() - 0.5, r.rand() - 0.5, r.rand() - 0.5).normalize();
      _a.addScaledVector(_b, 1.0).normalize();
      const bl = len * (0.22 + r.rand() * 0.22);
      displace(r, r.main[j], r.main[j + 1], r.main[j + 2], r.main[j] + _a.x * bl, r.main[j + 1] + _a.y * bl, r.main[j + 2] + _a.z * bl, r.jagged * bl * 0.12);
      r.fork[k - 1].set(path);
    }
  }
  function write(r, k, src, wScale, alpha, glow) {
    const B = r.batch, o = r.blocks[k] * PTS * 2;
    const cBody = glow ? r.cMid : r.cLight, cCore = glow ? r.cMid : r.cHi;
    const halfW = Math.max(r.halo, r.width) * 0.5 * wScale * (glow ? 0.35 : 1);
    const coreFrac = glow ? 0.9 : Math.min(0.9, r.width / Math.max(r.halo, r.width));
    for (let s = 0; s < PTS; s++) {
      const a = Math.max(0, s - 1) * 3, b = Math.min(PTS - 1, s + 1) * 3, j = s * 3;
      _tan.set(src[b] - src[a], src[b + 1] - src[a + 1], src[b + 2] - src[a + 2]);
      _w.set(_cam.x - src[j], _cam.y - src[j + 1], _cam.z - src[j + 2]);
      _side.crossVectors(_tan, _w);
      const t = s / (PTS - 1);
      const taper = k === 0 ? (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05))) : (1 - t);
      const w = halfW * taper / (_side.length() || 1);
      for (let q = 0; q < 2; q++) {
        const sg = q ? -1 : 1, vi = (o + s * 2 + q) * 3, ti = (o + s * 2 + q) * 4;
        B.P[vi] = src[j] + _side.x * w * sg; B.P[vi + 1] = src[j + 1] + _side.y * w * sg; B.P[vi + 2] = src[j + 2] + _side.z * w * sg;
        B.T[ti] = t; B.T[ti + 1] = sg; B.T[ti + 2] = alpha * (k === 0 ? 1 : 0.8); B.T[ti + 3] = coreFrac;
        B.C[vi] = cBody.r; B.C[vi + 1] = cBody.g; B.C[vi + 2] = cBody.b;
        B.C2[vi] = cCore.r; B.C2[vi + 1] = cCore.g; B.C2[vi + 2] = cCore.b;
      }
    }
  }

  function update(dt) {
    const cam = game.camera; cam.getWorldPosition(_cam); cam.getWorldDirection(_fw);
    const e = cam.projectionMatrix.elements, p00 = e[0], p11 = e[5];
    let cover = 0;
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      r.t += dt; r.frame++;
      const total = r.life + r.afterglow;
      if (r.t >= total) { release(r); continue; }
      if (r.followFrom?.parent) r.followFrom.getWorldPosition(r.from);
      if (r.followTo?.parent) r.followTo.getWorldPosition(r.to);
      const glow = r.t > r.life;
      if (!glow && r.jagged > 0 && r.frame % (2 + (r.born & 1)) === 0) build(r);
      else if (r.jagged <= 0 || r.ends) { build(r); r.ends = false; }
      const al = (glow ? 0.9 * (1 - (r.t - r.life) / Math.max(r.afterglow, 1e-3)) : 1) * r.userAlpha;
      write(r, 0, r.main, r.userScale, al, glow);
      for (let k = 1; k < r.blocks.length; k++) { if (glow) r.batch.clear(r.blocks[k]); else write(r, k, r.fork[k - 1], r.userScale * 0.7, al, false); }
      const mx = (r.from.x + r.to.x) * 0.5, my = (r.from.y + r.to.y) * 0.5, mz = (r.from.z + r.to.z) * 0.5;
      const z = Math.max(0.5, (mx - _cam.x) * _fw.x + (my - _cam.y) * _fw.y + (mz - _cam.z) * _fw.z);
      const bw = (glow ? r.width : Math.max(r.halo, r.width) * 0.45) * r.userScale;
      let c = r.len * bw * (1 + 0.4 * (r.blocks.length - 1)) * p00 * p11 / (4 * z * z) * al;
      if (hooks.proj) c = hooks.proj.poly(r.main, PTS, bw) * (1 + 0.4 * (glow ? 0 : r.blocks.length - 1)) * al;
      r.cov = c; if (!r.enemy) cover += c; else hooks.onOtherCover?.(c, r);
    }
    let calls = 0;
    for (const b of batches) calls += b.flush();
    return { cover, calls };
  }
  const count = () => recs.length;
  function clear() { while (recs.length) release(recs[recs.length - 1]); }
  return { add, update, release, count, clear, materials: [matP, matE], recs };
}
