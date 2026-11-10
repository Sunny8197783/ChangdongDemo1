// Player-VFX ducking (PLAN v4 §5.4, R8). Owner: vfx.
//   game.vfx.shared = {uPlayerFxMul, uThreat (Vector4[16] = 8 footprints × 2), uThreatN, uCamPos, uPlayerPos} — uniform objects shared
//   by reference by every patched material and by the kit's own shaders.
//   applyPlayerFx(material, {additive, role}) patches a PRIVATE player-FX material at construction (side effect only): chains any
//   existing onBeforeCompile, extends customProgramCacheKey with the role, refuses material.userData.shared.
//   fxMulAt(worldPos, role) is the CPU equivalent (particles, emitters); fxFactor(id, mul, durReal) multiplies uPlayerFxMul.
// The factor m is computed per vertex / per instance; the fragment stage only multiplies by it.
import * as THREE from 'three';

const MAXF = 8;
export const ROLE = { fill: 0, line: 1, particle: 2 };

/** GLSL: shared uniforms + awFxMul(world, viewDepth, role). Footprint kinds (tells/shapes.js FOOT_KIND): 1 circle, 2 ring, 3 cone, 4 line, 5 capsule. */
export const DUCK_PARS = /* glsl */`
uniform float uPlayerFxMul;
uniform vec4 uThreat[16];
uniform int uThreatN;
uniform vec3 uCamPos;
uniform vec3 uPlayerPos;
float awInThreat(vec2 p) {
  for (int i = 0; i < 8; i++) {
    if (i >= uThreatN) break;
    vec4 a = uThreat[2 * i]; vec4 b = uThreat[2 * i + 1];
    vec2 d = p - a.xy; float k = a.z; float l = length(d);
    if (k < 1.5) { if (l < a.w + 0.5) return 1.0; }
    else if (k < 2.5) { if (l < a.w + 0.5 && l > b.z - 0.5) return 1.0; }
    else if (k < 3.5) {
      if (l < a.w + 0.5) {
        if (l < 0.5) return 1.0;
        float ang = acos(clamp(dot(d / l, b.xy), -1.0, 1.0));
        if (ang <= b.z || l * sin(min(ang - b.z, 1.5707)) < 0.5) return 1.0;
      }
    } else {
      float t = dot(d, b.xy);
      if (k < 4.5) { if (t > -0.5 && t < b.w + 0.5 && length(d - b.xy * t) < a.w + 0.5) return 1.0; }
      else { t = clamp(t, 0.0, b.w); if (length(d - b.xy * t) < a.w + 0.5) return 1.0; }
    }
  }
  return 0.0;
}
float awFxMul(vec3 wp, float viewDepth, float role) {
  float base = uPlayerFxMul;
  float m = base * (awInThreat(wp.xz) > 0.5 ? 0.5 : 1.0);
  vec3 ab = uPlayerPos - uCamPos;
  float st = clamp(dot(wp - uCamPos, ab) / max(dot(ab, ab), 1e-4), 0.0, 0.9);
  if (length(wp - (uCamPos + ab * st)) < 1.0) m *= 0.3;
  if (role > 0.5 && role < 1.5) m = max(m, 0.7 * base);
  return m * smoothstep(1.5, 4.0, viewDepth);
}
`;

export function createDuck(game) {
  const threat = []; for (let i = 0; i < 16; i++) threat.push(new THREE.Vector4(0, 0, 0, 0));
  const shared = {
    uPlayerFxMul: { value: 1 }, uThreat: { value: threat }, uThreatN: { value: 0 },
    uCamPos: { value: new THREE.Vector3() }, uPlayerPos: { value: new THREE.Vector3() },
  };
  // camera matrices for the generic patch (gl_Position → world); core's live references when present
  const projInv = game.post?.projInv || { value: game.camera.projectionMatrixInverse };
  const camWorld = game.post?.camWorld || { value: game.camera.matrixWorld };
  const F = new Float32Array(64); let fn = 0;            // CPU copy of the footprints (same layout as tells.footprints())
  const factors = new Map();                            // id → {mul, until}
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn('[vfx.duck]', k, ...a); } };
  const _cam = new THREE.Vector3(), _fwd = new THREE.Vector3();
  let patched = 0;

  function intensity() {
    const a = game.assist?.fxIntensity;
    const v = Number.isFinite(a) ? a : game.settings?.values?.fxIntensity;
    return Number.isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 1;
  }
  function recomputeMul() {
    let m = intensity();
    const rt = game.realTime || 0;
    for (const [id, f] of factors) { if (rt >= f.until) factors.delete(id); else m *= f.mul; }
    shared.uPlayerFxMul.value = m;
    return m;
  }

  /** fxFactor(id, mul, durReal): multiply uPlayerFxMul by mul for durReal real seconds (witch time 0.6). */
  function fxFactor(id, mul, durReal) {
    if (!id) return;
    if (!(durReal > 0) || mul == null) { factors.delete(id); recomputeMul(); return; }
    factors.set(id, { mul: Math.max(0, +mul), until: (game.realTime || 0) + durReal });
    recomputeMul();
  }

  function inThreat(x, z) {
    for (let i = 0; i < fn; i++) {
      const o = i * 8, k = F[o + 2], r = F[o + 3];
      const dx = x - F[o], dz = z - F[o + 1], l = Math.sqrt(dx * dx + dz * dz);
      if (k < 1.5) { if (l < r + 0.5) return true; }
      else if (k < 2.5) { if (l < r + 0.5 && l > F[o + 6] - 0.5) return true; }
      else if (k < 3.5) {
        if (l < r + 0.5) {
          if (l < 0.5) return true;
          const c = Math.max(-1, Math.min(1, (dx * F[o + 4] + dz * F[o + 5]) / l)), ang = Math.acos(c), half = F[o + 6];
          if (ang <= half || l * Math.sin(Math.min(ang - half, 1.5707)) < 0.5) return true;
        }
      } else {
        let t = dx * F[o + 4] + dz * F[o + 5];
        if (k < 4.5) { if (t > -0.5 && t < F[o + 7] + 0.5) { const px = dx - F[o + 4] * t, pz = dz - F[o + 5] * t; if (px * px + pz * pz < (r + 0.5) * (r + 0.5)) return true; } }
        else { t = Math.max(0, Math.min(F[o + 7], t)); const px = dx - F[o + 4] * t, pz = dz - F[o + 5] * t; if (px * px + pz * pz < (r + 0.5) * (r + 0.5)) return true; }
      }
    }
    return false;
  }

  /** CPU twin of awFxMul. role: 'line' | 'fill' | 'particle' (default particle). */
  function fxMulAt(p, role = 'particle') {
    if (!p) return shared.uPlayerFxMul.value;
    const base = shared.uPlayerFxMul.value;
    let m = base * (fn > 0 && inThreat(p.x, p.z) ? 0.5 : 1);
    const c = shared.uCamPos.value, pl = shared.uPlayerPos.value;
    const abx = pl.x - c.x, aby = pl.y - c.y, abz = pl.z - c.z, ab2 = abx * abx + aby * aby + abz * abz;
    const st = Math.max(0, Math.min(0.9, ((p.x - c.x) * abx + (p.y - c.y) * aby + (p.z - c.z) * abz) / Math.max(ab2, 1e-4)));
    const qx = p.x - (c.x + abx * st), qy = p.y - (c.y + aby * st), qz = p.z - (c.z + abz * st);
    if (qx * qx + qy * qy + qz * qz < 1) m *= 0.3;
    if (role === 'line') m = Math.max(m, 0.7 * base);
    // near-camera fade by view depth
    const vd = (p.x - c.x) * _fwd.x + (p.y - c.y) * _fwd.y + (p.z - c.z) * _fwd.z;
    const t = Math.max(0, Math.min(1, (vd - 1.5) / 2.5));
    return m * t * t * (3 - 2 * t);
  }

  /** Once per frame (after tells.update): footprints → uThreat, camera / player positions, uPlayerFxMul. */
  function update() {
    const cam = game.camera;
    cam.getWorldPosition(_cam); shared.uCamPos.value.copy(_cam);
    cam.getWorldDirection(_fwd);
    const pp = game.player?.object?.position;
    if (pp) shared.uPlayerPos.value.set(pp.x, pp.y + 1.0, pp.z);
    let fp = null;
    try { fp = game.tells?.footprints?.() || null; } catch (_) { fp = null; }
    const n = fp && fp.data ? Math.max(0, Math.min(MAXF, fp.n | 0)) : 0;
    fn = n;
    for (let i = 0; i < n; i++) {
      const o = i * 8, d = fp.data;
      for (let k = 0; k < 8; k++) F[o + k] = d[o + k];
      threat[2 * i].set(d[o], d[o + 1], d[o + 2], d[o + 3]);
      threat[2 * i + 1].set(d[o + 4], d[o + 5], d[o + 6], d[o + 7]);
    }
    shared.uThreatN.value = n;
    recomputeMul();
  }

  // ---------------- foreign player-FX coverage (fix round 1: F-shadowblade 1.86 screens from spell shells the estimator missed)
  const FOREIGN_BIG = 0.06;                      // only items above this many screens are ever shrunk
  const fRecs = new WeakMap(), fList = []; let fDbg = null, fLine = 0, fRun = 0, fAllowed = 1; const fHB = [0, 0, 0], fHS = [0, 0, 0], fHT = [-1e9, -1e9, -1e9]; let fHi = 0; let fFrame = 0, fN = 0, fCover = 0, fShrink = 1, fRaw = 0, fIdle = 0;
  // local surface area of a geometry's drawn triangles (cached per geometry and draw range)
  const areaCache = new WeakMap();
  function surfaceArea(geometry) {
    const pos = geometry.attributes.position; if (!pos || pos.isInterleavedBufferAttribute) return -1;
    const idx = geometry.index, total = idx ? idx.count : pos.count;
    const start = Math.max(0, geometry.drawRange.start), cnt = Math.min(total - start, geometry.drawRange.count);
    let e = areaCache.get(geometry);
    if (e && e.cnt === cnt && e.start === start && e.v === pos.version) return e.A;
    const P = pos.array, st = pos.itemSize, I = idx ? idx.array : null;
    let A = 0;
    for (let t = start; t + 2 < start + cnt; t += 3) {
      const i0 = (I ? I[t] : t) * st, i1 = (I ? I[t + 1] : t + 1) * st, i2 = (I ? I[t + 2] : t + 2) * st;
      const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2];
      const vx = P[i2] - P[i0], vy = P[i2 + 1] - P[i0 + 1], vz = P[i2 + 2] - P[i0 + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      A += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
    }
    if (!e) { e = { cnt: 0, start: 0, v: 0, A: 0 }; areaCache.set(geometry, e); }
    e.cnt = cnt; e.start = start; e.v = pos.version; e.A = A;
    return A;
  }
  /**
   * Screens one draw of a foreign player-FX item rasterizes, from its drawn surface area (mean projected area of a surface =
   * area / 2 for double-sided, / 4 for single-sided; flat items use their real orientation), so sparse arcs, rings and
   * partial rigs are not counted as solid discs. shrinkable: fills / particles only; linework (role 'line') never shrinks.
   */
  function seeForeign(object, geometry, material, shrinkable) {
    let r = fRecs.get(object);
    if (!r) { r = { frame: -1, c: 0, s: false, k: 1 }; fRecs.set(object, r); }
    if (r.frame !== fFrame) {
      r.frame = fFrame; r.s = shrinkable;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bb = geometry.boundingBox, m = object.matrixWorld.elements;
      const hx = (bb.max.x - bb.min.x) * 0.5, hy = (bb.max.y - bb.min.y) * 0.5, hz = (bb.max.z - bb.min.z) * 0.5;
      const lx = (bb.max.x + bb.min.x) * 0.5, ly = (bb.max.y + bb.min.y) * 0.5, lz = (bb.max.z + bb.min.z) * 0.5;
      const cx = m[0] * lx + m[4] * ly + m[8] * lz + m[12], cy = m[1] * lx + m[5] * ly + m[9] * lz + m[13], cz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
      const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
      const ax = hx * sx, ay = hy * sy, az = hz * sz;                 // world half-extents along the item's axes
      const dx = cx - _cam.x, dy = cy - _cam.y, dz = cz - _cam.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
      const z = dx * _fwd.x + dy * _fwd.y + dz * _fwd.z, rad = Math.sqrt(ax * ax + ay * ay + az * az);
      const ux = sx > 1e-6 ? Math.abs(dx * m[0] + dy * m[1] + dz * m[2]) / (sx * d) : 0;
      const uy = sy > 1e-6 ? Math.abs(dx * m[4] + dy * m[5] + dz * m[6]) / (sy * d) : 0;
      const uz = sz > 1e-6 ? Math.abs(dx * m[8] + dy * m[9] + dz * m[10]) / (sz * d) : 0;
      const mn = Math.min(ax, ay, az), mx = Math.max(ax, ay, az), flat = mn < 0.15 * mx;
      let c = 0;
      if (z > 0.1) {                                                   // centre behind / at the camera: only 'inside' counts
        let area;
        const A = object.isSprite ? -1 : surfaceArea(geometry);
        if (A < 0) area = 4 * (ay * az * ux + ax * az * uy + ax * ay * uz) * 0.785;                  // sprites / interleaved
        else {
          const k = mx > 0 ? (ax * ay * az > 0 ? Math.cbrt(sx * sy * sz) : Math.sqrt(Math.max(sx * sy, sy * sz, sx * sz))) : 1;
          const Aw = A * k * k * (object.isInstancedMesh ? Math.max(0, object.count) : 1);
          area = flat ? Aw * (ax === mn ? ux : ay === mn ? uy : uz) : Aw * (material.side === THREE.DoubleSide ? 0.5 : 0.25);
        }
        const zz = Math.max(z, rad * 0.5, 0.3);
        c = Math.min(1.5, area * pP00 * pP11 / (4 * zz * zz));
      }
      if (!flat && rad > 0.5 && d * ux <= ax && d * uy <= ay && d * uz <= az) c = Math.max(c, 1);   // camera inside a closed item
      const op = material.uniforms?.opacity?.value ?? material.uniforms?.uOpacity?.value ?? material.opacity;
      if (typeof op === 'number' && op <= 0.02) c = 0;                   // faded out (most FX shaders discard at ~0 alpha)
      r.c = c;
      if (fDbg && c > 0.05) { let n = object, nm = ''; while (n && !nm) { nm = n.name; n = n.parent; } fDbg.push([nm || object.type, material.name || material.type, +c.toFixed(2), +d.toFixed(1), shrinkable, +z.toFixed(2), +ax.toFixed(2), +ay.toFixed(2), +az.toFixed(2), geometry.drawRange.count, geometry.attributes.position.count, object.visible, material.uniforms?.opacity?.value]); }
      if (fN < 256) fList[fN++] = r;
      // same-frame hard cap: the smoothed factor, tightened when this frame's shrinkable items already used the allowance
      let k = 1;
      if (r.s && c > FOREIGN_BIG) {
        k = fShrink;
        if (fRun + c * k * k > fAllowed) k = Math.max(0.3, Math.min(k, Math.sqrt(Math.max(0, fAllowed - fRun) / c)));
        fRun += c * k * k;
      }
      r.k = k;
    }
    return r.k;
  }
  let pP00 = 1, pP11 = 1;
  /**
   * Once per frame, after the kit / particles estimated their share: allowed = screens left for foreign player FX.
   * Returns the foreign coverage estimate after shrinking (items drawn last frame).
   */
  function foreignUpdate(allowed, realDt) {
    const pe = game.camera.projectionMatrix.elements; pP00 = pe[0]; pP11 = pe[5];
    fAllowed = allowed; fRun = 0; fFrame++;
    if (fN === 0) {                              // nothing drawn since the last update: hold the state over sim-only steps,
      if (++fIdle < 30) return fCover;           // clear it once no foreign item has been drawn for 30 updates
      fCover = 0; fRaw = 0; fLine = 0; fShrink = 1; fHB.fill(0); fHS.fill(0); fHT.fill(-1e9); return 0;
    }
    fIdle = 0;
    // linework (role 'line': rune circles, sigils) is reported but never shrunk and never takes the fills' budget
    let big = 0, small = 0, line = 0;
    for (let i = 0; i < fN; i++) { const r = fList[i], c = r.c; if (!r.s) line += c; else if (c > FOREIGN_BIG) big += c; else small += c; fList[i] = null; }
    fN = 0;
    fRaw = big + small; fLine = line;
    // large rune circles stay whole but leave less room for fills (their estimate is conservative: weight 0.3)
    allowed = Math.max(0.3, allowed - 0.3 * line); fAllowed = allowed;
    // persistence: act on the smallest load of the last 3 drawn frames (a one-frame flash or after-image never shrinks the rest)
    // (only observations of the last 0.1 s real time count: with sparse renders the latest one alone decides)
    const now = game.realTime || 0;
    fHB[fHi] = big; fHS[fHi] = small; fHT[fHi] = now; fHi = (fHi + 1) % 3;
    let b = big, sm = small;
    for (let i = 0; i < 3; i++) if (now - fHT[i] <= 0.1) { if (fHB[i] < b) b = fHB[i]; if (fHS[i] < sm) sm = fHS[i]; }
    let target = 1;
    if (b > 1e-4 && b + sm > allowed) target = Math.max(0.3, Math.sqrt(Math.max(0, allowed - sm) / b));
    // fast down, eased up (no pumping)
    fShrink = target < fShrink ? target : fShrink + (target - fShrink) * Math.min(1, realDt * 4);
    fCover = small + big * fShrink * fShrink;
    return fCover;
  }

  const PROTO_KEY = THREE.Material.prototype.customProgramCacheKey;
  /**
   * Patch a private player-FX material (side effect only). Idempotent. Refuses shared caches (userData.shared) and raw shaders.
   * role: 'line' (primary linework ≥ 70 %) | 'fill' | 'particle'.
   */
  function applyPlayerFx(material, opts = {}) {
    if (!material) return;
    if (Array.isArray(material)) { for (const m of material) applyPlayerFx(m, opts); return; }
    if (material.userData?.shared) { warnOnce('shared:' + (material.name || material.type), 'applyPlayerFx refused a shared material', material.name || material.type); return; }
    if (material.isRawShaderMaterial) { warnOnce('raw', 'applyPlayerFx cannot patch a RawShaderMaterial'); return; }
    if (material.userData.__awFx) return;
    const role = opts.role === 'line' ? 'line' : opts.role === 'fill' ? 'fill' : 'particle';
    const roleN = ROLE[role].toFixed(1);
    material.userData.__awFx = role;
    const awU = material.userData.__awU = { shrink: { value: 1 } };
    // coverage governor for player FX built outside the kit (spell / sword / class objects): each main-camera draw reports
    // its projected size; foreignUpdate() shrinks the largest ones toward their origin when the frame is over budget
    const prevOBR = material.onBeforeRender;
    const hasOBR = typeof prevOBR === 'function' && prevOBR !== THREE.Material.prototype.onBeforeRender;
    material.onBeforeRender = function (renderer, scene, camera, geometry, object, group) {
      if (hasOBR) prevOBR.call(this, renderer, scene, camera, geometry, object, group);
      if (camera === game.camera) awU.shrink.value = seeForeign(object, geometry, this, role !== 'line');
    };
    const prev = material.onBeforeCompile;
    const prevKey = material.customProgramCacheKey;
    const hasPrev = typeof prev === 'function' && prev !== THREE.Material.prototype.onBeforeCompile;
    const baseKey = (typeof prevKey === 'function' && prevKey !== PROTO_KEY) ? () => prevKey.call(material) : () => (hasPrev ? prev.toString() : '');
    material.onBeforeCompile = function (sh, renderer) {
      if (hasPrev) prev.call(this, sh, renderer);
      sh.uniforms.uPlayerFxMul = shared.uPlayerFxMul; sh.uniforms.uThreat = shared.uThreat; sh.uniforms.uThreatN = shared.uThreatN;
      sh.uniforms.uCamPos = shared.uCamPos; sh.uniforms.uPlayerPos = shared.uPlayerPos;
      sh.uniforms.uAwProjInv = projInv; sh.uniforms.uAwCamWorld = camWorld;
      // role and premultiplied/straight output are per-material UNIFORMS (fix round 1: no program-key split per role / blend)
      const b = this.blending;
      const premulRGB = opts.additive === true || (b === THREE.CustomBlending && this.blendSrc === THREE.OneFactor);
      sh.uniforms.uAwRole = { value: +roleN }; sh.uniforms.uAwPremul = { value: premulRGB ? 1 : 0 }; sh.uniforms.uAwShrink = awU.shrink;
      const vs = sh.vertexShader, vi = vs.lastIndexOf('}');
      sh.vertexShader = 'uniform mat4 uAwProjInv; uniform mat4 uAwCamWorld; uniform float uAwRole; uniform float uAwShrink; varying float vAwFxM;\n' + DUCK_PARS + vs.slice(0, vi) +
        '\n  if (uAwShrink < 0.999) gl_Position = mix(projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0), gl_Position, uAwShrink);' +
        '\n  { vec4 awV = uAwProjInv * gl_Position; awV /= awV.w; vec3 awW = (uAwCamWorld * vec4(awV.xyz, 1.0)).xyz; vAwFxM = awFxMul(awW, -awV.z, uAwRole); }\n}\n';
      const fsv = sh.fragmentShader, fi = fsv.lastIndexOf('}');
      sh.fragmentShader = 'uniform float uAwPremul; varying float vAwFxM;\n' + fsv.slice(0, fi) +
        '\n  gl_FragColor = mix(vec4(gl_FragColor.rgb, gl_FragColor.a * vAwFxM), gl_FragColor * vAwFxM, uAwPremul);\n}\n';
    };
    material.customProgramCacheKey = function () { return baseKey() + '|awfx'; };
    material.needsUpdate = true;
    patched++;
  }

  return { shared, applyPlayerFx, fxMulAt, fxFactor, update, intensity, recomputeMul, foreignUpdate, foreignDebug(on) { const o = fDbg; fDbg = on ? [] : null; return o; }, get foreignShrink() { return fShrink; }, get foreignRaw() { return fRaw; }, get foreignLine() { return fLine; }, get patched() { return patched; }, get footprintCount() { return fn; },
    /** test helper: footprints currently mirrored on the CPU */
    _foot: F };
}
