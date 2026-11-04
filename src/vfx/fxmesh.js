// Kit effect meshes FM:<el>.<shape> (PLAN v4 §3.4). Owner: vfx. Element geometries are authored by the motif owners and
// registered with kit.registerShape('<el>.<shape>', geometry, {blend, outline, max, emissiveBand}); every element keeps ONE
// merged shape atlas and ONE InstancedMesh selecting the shape per instance (the vertex shader collapses the others), plus
// an optional inverted-hull outline InstancedMesh sharing the instance buffers → ≤ 2 draw calls per element.
// Shared toon program (4-step ramp uniforms per element material, gradient attribute aGrad), emissive band ≤ 1.2, per-instance
// life → erosion discard with a 0.04 rim band in `light`, depthWrite:false (transparent pass), back-to-front instance sort ≤ 64.
import * as THREE from 'three';
import { DUCK_PARS } from './duck.js';

const MAX_SHAPES = 16;
const VERT = /* glsl */`
  attribute float aShape; attribute float aGrad;
  attribute vec4 iLife;   // erode, alpha, shape index, style (0 player, 1 enemy style: no duck)
  attribute vec4 iTint;   // tint rgb, tint amount
  uniform float uOutline, uOutlineW;
  varying vec3 vN; varying vec3 vObj; varying float vGrad; varying vec4 vLife; varying vec4 vTint; varying float vM; varying vec3 vView;
  ${DUCK_PARS}
  void main() {
    if (abs(aShape - iLife.z) > 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    vec3 p = position;
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    float sc = length(im[0].xyz);
    if (uOutline > 0.5) p += normal * uOutlineW / max(sc, 1e-3);
    vec4 wp = modelMatrix * im * vec4(p, 1.0);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    vN = normalize(mat3(modelMatrix * im) * normal);
    vObj = position; vGrad = aGrad; vLife = iLife; vTint = iTint; vView = normalize(cameraPosition - wp.xyz);
    vM = iLife.w > 0.5 ? 1.0 : awFxMul(wp.xyz, -mv.z, 0.0);
  }`;
const FRAG = /* glsl */`
  uniform vec3 uHi, uLight, uMid, uDark, uSun;
  uniform float uEmissive, uOutline;
  uniform float uBlend[${MAX_SHAPES}];
  varying vec3 vN; varying vec3 vObj; varying float vGrad; varying vec4 vLife; varying vec4 vTint; varying float vM; varying vec3 vView;
  float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
  void main() {
    float er = vLife.x;
    float nz = n3(vObj * 5.0);
    if (er > 0.0 && nz < er) discard;
    float a = vLife.y * vM;
    vec3 col;
    bool enemy = vLife.w > 0.5;
    if (uOutline > 0.5) {
      col = uDark * 0.8;
    } else {
      vec3 n = normalize(vN);
      float band = dot(n, uSun) * 0.5 + 0.5;
      float t = clamp(vGrad * 0.55 + band * 0.55, 0.0, 1.0);
      col = t < 0.32 ? mix(uDark, uMid, smoothstep(0.24, 0.32, t)) : (t < 0.78 ? uMid : mix(uMid, uLight, smoothstep(0.78, 0.86, t)));
      if (!enemy && t > 0.95) col = mix(col, uHi, 0.6);
      float rim = pow(1.0 - abs(dot(n, normalize(vView))), 3.0);
      col = mix(col, enemy ? uMid : uLight, rim * 0.55);
      if (enemy) col = mix(uDark, col, rim * 0.9 + 0.1);
      col = mix(col, vTint.rgb, vTint.a);
      col *= uEmissive;
      if (er > 0.0 && nz < er + 0.04) col = enemy ? uMid : uLight;
    }
    int si = int(vLife.z + 0.5);
    float bl = 0.0;
    for (int k = 0; k < ${MAX_SHAPES}; k++) if (k == si) bl = uBlend[k];
    float alpha = bl < 0.5 ? a : (bl < 1.5 ? a * 0.75 : a * 0.6);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * alpha, alpha);
  }`;

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(),
  _cam = new THREE.Vector3(), _fw = new THREE.Vector3(), _ax = new THREE.Vector3(0, 1, 0);
const backOut = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export function createFxMesh(game, hooks = {}) {
  const fams = new Map();       // el → family
  const sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  try { const sd = game.world?.sunDirection; if (sd?.isVector3) sunDir.copy(sd).normalize(); } catch (_) { /* */ }
  const shared = hooks.shared;
  const ramp = hooks.ramp;
  let serial = 0;
  const order = [];               // reused sort index array

  function makeMaterial(el, outline) {
    const R = ramp(el);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uHi: { value: R.hi }, uLight: { value: R.light }, uMid: { value: R.mid }, uDark: { value: R.dark }, uSun: { value: sunDir },
        uEmissive: { value: 1.0 }, uOutline: { value: outline ? 1 : 0 }, uOutlineW: { value: 0.035 },
        uBlend: { value: new Array(MAX_SHAPES).fill(0) },
        uPlayerFxMul: shared.uPlayerFxMul, uThreat: shared.uThreat, uThreatN: shared.uThreatN, uCamPos: shared.uCamPos, uPlayerPos: shared.uPlayerPos,
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: outline ? THREE.BackSide : THREE.FrontSide,
    });
    m.name = 'kit-fm-' + el + (outline ? '-outline' : '');
    return m;
  }

  function family(el) {
    let f = fams.get(el);
    if (f) return f;
    f = { el, shapes: [], byName: new Map(), mesh: null, outline: null, cap: 64, recs: [], n: 0, matBody: makeMaterial(el, false), matOutline: makeMaterial(el, true), geometry: null, attrs: null, hasOutline: false };
    fams.set(el, f);
    return f;
  }

  function rebuild(f) {
    // merged non-indexed geometry: position, normal, aGrad, aShape
    let total = 0; const parts = [];
    for (const s of f.shapes) {
      let g = s.geometry.index ? s.geometry.toNonIndexed() : s.geometry;
      if (!g.attributes.normal) { g = g.clone(); g.computeVertexNormals(); }
      parts.push(g); total += g.attributes.position.count;
    }
    const P = new Float32Array(total * 3), Nn = new Float32Array(total * 3), Gr = new Float32Array(total), Sh = new Float32Array(total);
    let o = 0;
    f.shapes.forEach((s, si) => {
      const g = parts[si], pa = g.attributes.position, na = g.attributes.normal, ga = g.attributes.aGrad;
      let ymin = Infinity, ymax = -Infinity;
      if (!ga) for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      let r2 = 0;
      for (let i = 0; i < pa.count; i++) {
        P[(o + i) * 3] = pa.getX(i); P[(o + i) * 3 + 1] = pa.getY(i); P[(o + i) * 3 + 2] = pa.getZ(i);
        Nn[(o + i) * 3] = na.getX(i); Nn[(o + i) * 3 + 1] = na.getY(i); Nn[(o + i) * 3 + 2] = na.getZ(i);
        Gr[o + i] = ga ? ga.getX(i) : (ymax > ymin ? (pa.getY(i) - ymin) / (ymax - ymin) : 0.5);
        Sh[o + i] = si;
        r2 = Math.max(r2, pa.getX(i) ** 2 + pa.getY(i) ** 2 + pa.getZ(i) ** 2);
      }
      s.radius = Math.sqrt(r2);
      o += pa.count;
      f.matBody.uniforms.uBlend.value[si] = s.blend === 'solid' ? 0 : s.blend === 'alpha' ? 1 : 2;
      if (s.outline) f.hasOutline = true;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    geo.setAttribute('aGrad', new THREE.BufferAttribute(Gr, 1));
    geo.setAttribute('aShape', new THREE.BufferAttribute(Sh, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const cap = f.cap;
    if (!f.attrs) {
      const mk = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
      f.attrs = { life: mk(), tint: mk() };
    }
    geo.setAttribute('iLife', f.attrs.life); geo.setAttribute('iTint', f.attrs.tint);
    const old = f.mesh;
    const mesh = new THREE.InstancedMesh(geo, f.matBody, cap);
    if (old) { mesh.instanceMatrix = old.instanceMatrix; game.scene.remove(old); if (f.outline) game.scene.remove(f.outline); old.geometry.dispose(); }
    else mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 7; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.name = 'kit-fm-' + f.el; mesh.userData.owner = 'player'; mesh.matrixAutoUpdate = false;
    game.scene.add(mesh);
    const om = new THREE.InstancedMesh(geo, f.matOutline, cap);
    om.instanceMatrix = mesh.instanceMatrix;
    om.count = 0; om.frustumCulled = false; om.visible = false; om.renderOrder = 6; om.castShadow = false;
    om.name = 'kit-fm-' + f.el + '-outline'; om.userData.owner = 'player'; om.matrixAutoUpdate = false;
    game.scene.add(om);
    f.mesh = mesh; f.outline = om; f.geometry = geo;
  }

  function registerShape(name, geometry, opts = {}) {
    if (!name || !geometry?.attributes?.position) return false;
    const dot = name.indexOf('.');
    const el = dot > 0 ? name.slice(0, dot) : 'physical';
    const f = family(el);
    if (f.byName.has(name)) {   // re-registration replaces the geometry
      const s = f.byName.get(name); s.geometry = geometry; Object.assign(s, { blend: opts.blend || s.blend, outline: opts.outline ?? s.outline });
    } else {
      if (f.shapes.length >= MAX_SHAPES) { console.warn('[kit] shape atlas full for', el); return false; }
      const s = { name, geometry, blend: opts.blend || 'solid', outline: !!opts.outline, emissiveBand: Math.min(1.2, opts.emissiveBand ?? 1.0), index: f.shapes.length, radius: 1 };
      f.shapes.push(s); f.byName.set(name, s);
      if (opts.max) f.cap = Math.max(f.cap, Math.min(256, opts.max));
    }
    f.matBody.uniforms.uEmissive.value = Math.min(1.2, Math.max(...f.shapes.map((s) => s.emissiveBand)));
    rebuild(f);
    return true;
  }
  const hasShape = (name) => { const dot = name.indexOf('.'); const f = fams.get(dot > 0 ? name.slice(0, dot) : 'physical'); return !!f?.byName.has(name); };

  /** spawn: rec built by kit.mesh() — {shape, fam, pos, quat, scale(Vector3), vel, spin, grow, life, tIn, tOut, erode, tint, tintAmt, alpha, follow, enemy} */
  function add(rec) {
    const f = rec.fam;
    if (f.n >= f.cap) { let oi = 0; for (let i = 1; i < f.n; i++) if (f.recs[i].born < f.recs[oi].born) oi = i; kill(f, oi); }
    f.recs[f.n++] = rec; rec.born = ++serial; rec.alive = true;
    return rec;
  }
  function kill(f, i) {
    const r = f.recs[i]; r.alive = false; hooks.onKill?.(r);
    const last = --f.n; if (i !== last) f.recs[i] = f.recs[last]; f.recs[last] = null;
  }
  function stop(rec, fade = true) {
    if (!rec.alive) return;
    if (!fade) { const f = rec.fam; const i = f.recs.indexOf(rec); if (i >= 0) kill(f, i); return; }
    if (rec.life - rec.t > rec.tOut) rec.life = rec.t + rec.tOut;
    rec.persistent = false;
  }

  function update(dt) {
    const cam = game.camera; cam.getWorldPosition(_cam); cam.getWorldDirection(_fw);
    const e = cam.projectionMatrix.elements, p00 = e[0], p11 = e[5];
    let cover = 0, calls = 0;
    for (const f of fams.values()) {
      if (!f.mesh) continue;
      for (let i = f.n - 1; i >= 0; i--) {
        const r = f.recs[i]; r.t += dt;
        if (!r.persistent && r.t >= r.life) { kill(f, i); continue; }
        if (r.follow) { if (!r.follow.parent && !r.persistent) { kill(f, i); continue; } if (r.follow.parent) { r.follow.getWorldPosition(r.pos); if (r.followOff) r.pos.add(r.followOff); } }
        else if (r.vel) { r.pos.addScaledVector(r.vel, dt); if (r.gravity) r.vel.y -= r.gravity * dt; if (r.drag) r.vel.multiplyScalar(Math.exp(-r.drag * dt)); }
        r.depth = (r.pos.x - _cam.x) * _fw.x + (r.pos.y - _cam.y) * _fw.y + (r.pos.z - _cam.z) * _fw.z;
      }
      const n = f.n;
      order.length = n; for (let i = 0; i < n; i++) order[i] = f.recs[i];
      if (n > 1 && n <= 64) order.sort((a, b) => b.depth - a.depth);    // back to front
      const L = f.attrs.life.array, Tn = f.attrs.tint.array;
      let outlineN = 0;
      for (let i = 0; i < n; i++) {
        const r = order[i];
        let sc = 1;
        if (r.t < r.tIn) sc = backOut(r.t / Math.max(r.tIn, 1e-3));
        if (r.grow && r.grow !== 1) sc *= 1 + (r.grow - 1) * Math.min(1, r.t / Math.max(r.life, 1e-3));
        let al = r.alpha * r.userAlpha, er = 0;
        if (!r.persistent) { const left = r.life - r.t; if (left < r.tOut) { const x = 1 - left / Math.max(r.tOut, 1e-3); if (r.erode) er = x * 0.98; else al *= 1 - x * x; } }
        if (r.spin) { _q2.setFromAxisAngle(r.spinAxis || _ax, r.spin * r.t); _q.copy(r.quat).multiply(_q2); } else _q.copy(r.quat);
        _s.copy(r.scale).multiplyScalar(sc * r.userScale);
        _m.compose(r.pos, _q, _s);
        f.mesh.setMatrixAt(i, _m);
        const k = i * 4;
        L[k] = er; L[k + 1] = al * r.mul; L[k + 2] = r.shape.index; L[k + 3] = r.enemy ? 1 : 0;
        Tn[k] = r.tint.r; Tn[k + 1] = r.tint.g; Tn[k + 2] = r.tint.b; Tn[k + 3] = r.tintAmt;
        if (r.shape.outline && hooks.outlinesOn()) outlineN++;
        const z = Math.max(r.depth, 0.4);
        if (r.depth > 0.1) { const rad = r.shape.radius * Math.max(_s.x, _s.y, _s.z); const c = 0.55 * Math.PI * rad * rad * p00 * p11 / (4 * z * z) * (1 - er) * Math.min(1, al * 1.5); r.cov = c; if (!r.enemy) cover += c; else hooks.onOtherCover?.(c, r); }
        else r.cov = 0;
      }
      f.mesh.count = n; f.outline.count = outlineN > 0 ? n : 0;
      f.mesh.visible = n > 0; f.outline.visible = outlineN > 0 && n > 0;
      if (n > 0) {
        const im = f.mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
        for (const a of [f.attrs.life, f.attrs.tint]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
        calls += 1 + (f.outline.visible ? 1 : 0);
      }
    }
    order.length = 0;
    return { cover, calls };
  }

  function families() { return fams; }
  function shapeOf(name) { const dot = name.indexOf('.'); const f = fams.get(dot > 0 ? name.slice(0, dot) : 'physical'); return f?.byName.get(name) || null; }
  function materials() { const out = []; for (const f of fams.values()) out.push(f.matBody, f.matOutline); return out; }
  function stats() { let n = 0, calls = 0; for (const f of fams.values()) { n += f.n; if (f.n) calls += 1 + (f.outline?.visible ? 1 : 0); } return { instances: n, calls, families: fams.size }; }
  function clear() { for (const f of fams.values()) while (f.n > 0) kill(f, f.n - 1); }
  return { registerShape, hasShape, shapeOf, family, add, stop, update, families, materials, stats, clear };
}
