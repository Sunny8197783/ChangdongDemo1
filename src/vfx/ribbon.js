// Kit ribbons RB (PLAN v4 §3.4; upgrade of vfx/trail.js). Owner: vfx. Camera-facing strips batched 8 per mesh (≤ 1 call per 8):
// arc-length resampling, width taper head → tail, head saturated / tail desaturated, alpha body shorter than the additive edge,
// fast → slow UV scroll, premultiplied output, live-range uploads. Also exports the strip batch used by bolt.js.
import * as THREE from 'three';
import { DUCK_PARS } from './duck.js';

export const STRIP_VERT = /* glsl */`
  attribute vec4 aT;     // along (0 head .. 1 tail), side (-1 .. 1), alpha, edge alpha
  attribute vec3 aC;     // body colour (premultiplied later)
  attribute vec3 aC2;    // edge / core colour
  uniform float uDuck;
  varying vec4 vT; varying vec3 vC; varying vec3 vC2; varying float vM;
  ${DUCK_PARS}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vT = aT; vC = aC; vC2 = aC2;
    vM = uDuck > 0.5 ? awFxMul(position, -mv.z, 1.0) : 1.0;
  }`;
const RIB_FRAG = /* glsl */`
  uniform float uTime;
  varying vec4 vT; varying vec3 vC; varying vec3 vC2; varying float vM;
  float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  void main() {
    float s = abs(vT.y), along = vT.x;
    float px = max(fwidth(s), 1e-4);
    float body = (1.0 - smoothstep(0.62 - px, 0.62 + px, s)) * pow(max(1.0 - along, 0.0), 1.6);
    float edge = smoothstep(0.55, 0.85, s) * (1.0 - smoothstep(1.0 - px * 1.5, 1.0, s)) * pow(max(1.0 - along, 0.0), 0.7);
    float u = along * 7.0 - uTime * (2.5 - 1.6 * along);
    float streak = 0.78 + 0.22 * h11(floor(u));
    float a = body * vT.z * streak * vM;
    float e = edge * vT.w * vM;
    if (a + e < 0.004) discard;
    gl_FragColor = vec4(vC * a + vC2 * e, a);
  }`;

const _cam = new THREE.Vector3(), _tan = new THREE.Vector3(), _view = new THREE.Vector3(), _side = new THREE.Vector3(), _w = new THREE.Vector3();

/** A batch of `blocks` strips of `pts` points each in ONE mesh. Block b owns vertices [b·pts·2, (b+1)·pts·2). */
export function createStripBatch(game, { blocks = 8, pts = 32, material, name, owner = 'player' }) {
  const nv = blocks * pts * 2;
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(nv * 3), T = new Float32Array(nv * 4), C = new Float32Array(nv * 3), C2 = new Float32Array(nv * 3);
  const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  const aP = mk(P, 3), aT = mk(T, 4), aC = mk(C, 3), aC2 = mk(C2, 3);
  g.setAttribute('position', aP); g.setAttribute('aT', aT); g.setAttribute('aC', aC); g.setAttribute('aC2', aC2);
  const idx = [];
  for (let b = 0; b < blocks; b++) for (let k = 0; k < pts - 1; k++) { const v = (b * pts + k) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 10; mesh.name = name; mesh.userData.owner = owner; mesh.matrixAutoUpdate = false;
  game.scene.add(mesh);
  const used = new Uint8Array(blocks);
  return {
    mesh, blocks, pts, P, T, C, C2, used,
    /** collapse a block (degenerate: zero-area triangles, alpha 0) */
    clear(b) { const o = b * pts * 2; for (let i = 0; i < pts * 2; i++) { T[(o + i) * 4 + 2] = 0; T[(o + i) * 4 + 3] = 0; P[(o + i) * 3] = 0; P[(o + i) * 3 + 1] = -1e4; P[(o + i) * 3 + 2] = 0; } },
    /** live-range upload: up to the highest used block */
    flush() {
      let hi = -1; for (let b = 0; b < blocks; b++) if (used[b]) hi = b;
      mesh.visible = hi >= 0;
      if (hi < 0) return 0;
      const n = (hi + 1) * pts * 2;
      for (const [a, s] of [[aP, 3], [aT, 4], [aC, 3], [aC2, 3]]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * s); a.needsUpdate = true; }
      g.setDrawRange(0, (hi + 1) * (pts - 1) * 6);
      return 1;
    },
  };
}

export function stripMaterial(game, frag, shared, duck, extraUniforms = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uDuck: { value: duck ? 1 : 0 }, uTime: { value: 0 },
      uPlayerFxMul: shared.uPlayerFxMul, uThreat: shared.uThreat, uThreatN: shared.uThreatN, uCamPos: shared.uCamPos, uPlayerPos: shared.uPlayerPos }, extraUniforms),
    vertexShader: STRIP_VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}

const RS = 24;   // resampled points per ribbon (≤ pts)
const HIST = 48; // raw history points

export function createRibbons(game, hooks) {
  const shared = hooks.shared;
  const time = hooks.time;
  const matP = stripMaterial(game, RIB_FRAG, shared, true, { uTime: time }); matP.name = 'kit-ribbon';
  const matE = stripMaterial(game, RIB_FRAG, shared, false, { uTime: time }); matE.name = 'kit-ribbon-enemy';
  const batches = [
    createStripBatch(game, { blocks: 8, pts: RS, material: matP, name: 'kit-ribbon-0' }),
    createStripBatch(game, { blocks: 8, pts: RS, material: matP, name: 'kit-ribbon-1' }),
    createStripBatch(game, { blocks: 8, pts: RS, material: matE, name: 'kit-ribbon-enemy', owner: 'enemy' }),
  ];
  for (const b of batches) { for (let i = 0; i < b.blocks; i++) b.clear(i); b.hist = Array.from({ length: b.blocks }, () => ({ px: new Float32Array(HIST * 3), age: new Float32Array(HIST) })); }
  const recs = [];
  let serial = 0;
  const hx = new Float32Array(HIST * 3), ha = new Float32Array(HIST);   // scratch for resampling
  const rx = new Float32Array(RS * 3), rt = new Float32Array(RS);

  function grab(enemy) {
    const list = enemy ? [batches[2]] : [batches[0], batches[1]];
    for (const b of list) for (let i = 0; i < b.blocks; i++) if (!b.used[i]) { b.used[i] = 1; return [b, i]; }
    // full: recycle the oldest ribbon of that owner
    let old = null; for (const r of recs) if (r.enemy === enemy && (!old || r.born < old.born)) old = r;
    if (!old) return null;
    const slot = [old.batch, old.block]; release(old, false);
    slot[0].used[slot[1]] = 1; return slot;
  }
  function release(r, freeBlock = true) {
    r.alive = false; hooks.onKill?.(r);
    const i = recs.indexOf(r); if (i >= 0) recs.splice(i, 1);
    r.batch.clear(r.block); if (freeBlock) r.batch.used[r.block] = 0;
  }

  /** rec fields from kit.ribbon(): follow, points, width, taper, life, maxLen, c1 (head), c2 (tail), edge, alpha, enemy */
  function add(rec) {
    const slot = grab(rec.enemy);
    if (!slot) return null;
    rec.batch = slot[0]; rec.block = slot[1]; rec.born = ++serial; rec.alive = true;
    const H = rec.batch.hist[rec.block]; rec.px = H.px; rec.age = H.age; rec.n = 0; rec.stopped = false; rec.t = 0;
    if (rec.points) for (const p of rec.points) push(rec, p);
    recs.push(rec);
    return rec;
  }
  function push(r, p) {
    let n = r.n; if (n >= HIST) n = HIST - 1;
    r.px.copyWithin(3, 0, n * 3); r.age.copyWithin(1, 0, n);
    r.px[0] = p.x; r.px[1] = p.y; r.px[2] = p.z; r.age[0] = 0; r.n = n + 1;
  }

  function update(dt) {
    const cam = game.camera; cam.getWorldPosition(_cam);
    let cover = 0;
    const fw = _view; cam.getWorldDirection(fw);
    const e = cam.projectionMatrix.elements, p00 = e[0], p11 = e[5];
    for (let ri = recs.length - 1; ri >= 0; ri--) {
      const r = recs[ri];
      r.t += dt;
      let n = r.n;
      for (let i = 0; i < n; i++) r.age[i] += dt;
      const fade = r.life;
      if (r.static) { if (r.t >= r.life) { release(r); continue; } }
      else {
        while (n > 0 && r.age[n - 1] > fade) n--;
        if (!r.stopped && r.follow) {
          if (!r.follow.parent) r.stopped = true;
          else {
            r.follow.getWorldPosition(_w);
            const dx = n ? _w.x - r.px[0] : 1, dy = n ? _w.y - r.px[1] : 0, dz = n ? _w.z - r.px[2] : 0;
            r.n = n;
            if (n < 2 || dx * dx + dy * dy + dz * dz > 0.01) push(r, _w); else { r.px[0] = _w.x; r.px[1] = _w.y; r.px[2] = _w.z; r.age[0] = 0; }
            n = r.n;
          }
        }
        r.n = n;
        if (n < 2) { if (r.stopped || !r.follow) { release(r); continue; } r.batch.clear(r.block); continue; }
      }
      // arc-length resample (head = index 0), cap total length
      let total = 0;
      hx[0] = r.px[0]; hx[1] = r.px[1]; hx[2] = r.px[2]; ha[0] = 0;
      let m = 1;
      for (let i = 1; i < n; i++) {
        const j = i * 3, k = j - 3;
        const seg = Math.hypot(r.px[j] - r.px[k], r.px[j + 1] - r.px[k + 1], r.px[j + 2] - r.px[k + 2]);
        if (total + seg > r.maxLen) { const f = (r.maxLen - total) / Math.max(seg, 1e-5); hx[m * 3] = r.px[k] + (r.px[j] - r.px[k]) * f; hx[m * 3 + 1] = r.px[k + 1] + (r.px[j + 1] - r.px[k + 1]) * f; hx[m * 3 + 2] = r.px[k + 2] + (r.px[j + 2] - r.px[k + 2]) * f; total = r.maxLen; ha[m] = total; m++; break; }
        total += seg; hx[m * 3] = r.px[j]; hx[m * 3 + 1] = r.px[j + 1]; hx[m * 3 + 2] = r.px[j + 2]; ha[m] = total; m++;
      }
      if (total < 1e-3) { r.batch.clear(r.block); continue; }
      let seg = 0;
      for (let s = 0; s < RS; s++) {
        const target = total * s / (RS - 1);
        while (seg < m - 2 && ha[seg + 1] < target) seg++;
        const f = Math.max(0, Math.min(1, (target - ha[seg]) / Math.max(ha[seg + 1] - ha[seg], 1e-5)));
        rx[s * 3] = hx[seg * 3] + (hx[seg * 3 + 3] - hx[seg * 3]) * f;
        rx[s * 3 + 1] = hx[seg * 3 + 1] + (hx[seg * 3 + 4] - hx[seg * 3 + 1]) * f;
        rx[s * 3 + 2] = hx[seg * 3 + 2] + (hx[seg * 3 + 5] - hx[seg * 3 + 2]) * f;
        rt[s] = s / (RS - 1);
      }
      const B = r.batch, o = r.block * RS * 2;
      const lifeK = r.static ? Math.max(0, 1 - Math.max(0, r.t - r.life * 0.35) / Math.max(r.life * 0.65, 1e-3)) : 1;
      const al = r.alpha * r.userAlpha * lifeK;
      for (let s = 0; s < RS; s++) {
        const a = Math.max(0, s - 1) * 3, b = Math.min(RS - 1, s + 1) * 3, j = s * 3;
        _tan.set(rx[b] - rx[a], rx[b + 1] - rx[a + 1], rx[b + 2] - rx[a + 2]);
        _w.set(_cam.x - rx[j], _cam.y - rx[j + 1], _cam.z - rx[j + 2]);
        _side.crossVectors(_tan, _w);
        const along = rt[s];
        const w = r.width * r.userScale * 0.5 * (1 - along * r.taper) / (_side.length() || 1);
        const v = o + s * 2;
        for (let q = 0; q < 2; q++) {
          const sg = q ? -1 : 1, vi = (v + q) * 3, ti = (v + q) * 4;
          B.P[vi] = rx[j] + _side.x * w * sg; B.P[vi + 1] = rx[j + 1] + _side.y * w * sg; B.P[vi + 2] = rx[j + 2] + _side.z * w * sg;
          B.T[ti] = along; B.T[ti + 1] = sg; B.T[ti + 2] = al; B.T[ti + 3] = al * r.edge;
          const k = Math.pow(along, 0.8);
          B.C[vi] = r.c1.r + (r.c2.r - r.c1.r) * k; B.C[vi + 1] = r.c1.g + (r.c2.g - r.c1.g) * k; B.C[vi + 2] = r.c1.b + (r.c2.b - r.c1.b) * k;
          B.C2[vi] = r.ce.r; B.C2[vi + 1] = r.ce.g; B.C2[vi + 2] = r.ce.b;
        }
      }
      // coverage estimate: length × mean width, projected at the mid point
      const mid = Math.floor(RS / 2) * 3;
      const z = Math.max(0.5, (rx[mid] - _cam.x) * fw.x + (rx[mid + 1] - _cam.y) * fw.y + (rx[mid + 2] - _cam.z) * fw.z);
      let c = total * r.width * r.userScale * (1 - r.taper * 0.5) * 0.7 * p00 * p11 / (4 * z * z) * Math.min(1, al);
      if (hooks.proj) c = hooks.proj.poly(rx, RS, r.width * r.userScale * (1 - r.taper * 0.5) * 0.7) * Math.min(1, al);
      r.cov = c; if (!r.enemy) cover += c; else hooks.onOtherCover?.(c, r);
    }
    let calls = 0;
    for (const b of batches) calls += b.flush();
    return { cover, calls };
  }
  const count = () => recs.length;
  function clear() { while (recs.length) release(recs[recs.length - 1]); }
  return { add, push, release, update, count, clear, materials: [matP, matE], batches, recs };
}
