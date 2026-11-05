// Kit linework LW (PLAN v4 §3.4): ONE instanced premultiplied SDF program for ring / arc / poly / star / ticks / rays / spiral /
// crescent / glyph / dots / stipple and the ground decal kinds (crack / scorch / frost / ripple / strata; lichtenberg, flower and
// rune are glyph cells). Every instance is a tight annulus / arc strip (never a full quad); discs only for filled shapes.
// Planes: ground (terrain-conforming through world.heightField in the vertex shader), flat ground, billboard, oriented (quat).
// Screen-space minimum line width via fwidth; back-out scale-in, spin, erosion. Two meshes share the program: player
// (ducked, userData.owner 'player') and other (enemy / world, never ducked) → ≤ 2 draw calls. No hatch, no chevrons.
import * as THREE from 'three';
import { DUCK_PARS } from './duck.js';

export const LW_SHAPES = { ring: 0, arc: 1, poly: 2, star: 3, ticks: 4, rays: 5, spiral: 6, crescent: 7, glyph: 8, dots: 9, stipple: 10,
  crack: 11, scorch: 12, frost: 13, ripple: 15, strata: 18 };
export const PLANE = { ground: 0, billboard: 1, oriented: 2, flat: 3 };
const SEG = 48, RAD = 3;             // angular × radial subdivisions of the annulus strip
const TAU = Math.PI * 2;

function stripGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  const pos = [], idx = [];
  for (let i = 0; i <= SEG; i++) for (let j = 0; j <= RAD; j++) pos.push(i / SEG, j / RAD, 0);
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = i * (RAD + 1) + j, b = a + RAD + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

const VERT = (hfGlsl) => /* glsl */`
  attribute vec4 iA;  // centre xyz, R (scaled)
  attribute vec4 iB;  // r2 / R, half width (m), min width (px), shape
  attribute vec4 iC;  // quaternion
  attribute vec4 iD;  // a0, a1, p1, p2
  attribute vec4 iE;  // rgb, alpha
  attribute vec4 iF;  // rgb2, additive core
  attribute vec4 iG;  // plane, erode, role, rotation
  uniform float uScreenH, uDuck, uHFOn, uLift;
  uniform sampler2D uHF;
  varying vec2 vP; varying vec4 vE; varying vec4 vF; varying vec4 vS; varying vec4 vD; varying float vM; varying float vErode;
  ${DUCK_PARS}
  ${hfGlsl}
  vec3 qrot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
  void main() {
    float R = iA.w, r2 = iB.x * R, hw = iB.y, shape = iB.w;
    vec4 mvC = viewMatrix * vec4(iA.xyz, 1.0);
    float depth = max(-mvC.z, 0.05);
    float mpp = depth * 2.0 / (projectionMatrix[1][1] * uScreenH);
    float w = max(hw, iB.z * 0.5 * mpp);
    float pad = w + 1.5 * mpp;
    float rin = 0.0, rout = R + pad;
    float a0 = 0.0, a1 = 6.2831853;
    if (shape < 0.5 || (shape > 8.5 && shape < 9.5)) { rin = R - pad - (shape > 8.5 ? w * 0.7 : 0.0); rout = R + pad + (shape > 8.5 ? w * 0.7 : 0.0); }
    else if (shape < 1.5) { rin = R - pad; float ext = pad / max(R, 0.01); a0 = iD.x - ext; a1 = iD.y + ext; }
    else if (shape < 2.5) { rin = R * cos(3.14159265 / max(iD.z, 3.0)) - pad; }
    else if (shape < 6.5) { rin = r2 - pad; }
    rin = max(rin, 0.0);
    rout /= cos(3.14159265 / ${SEG}.0);
    float ang = mix(a0, a1, position.x);
    float rad = mix(rin, rout, position.y);
    vec2 lp = vec2(cos(ang), sin(ang)) * rad;
    float c = cos(iG.w), s = sin(iG.w);
    vec2 rp = vec2(c * lp.x - s * lp.y, s * lp.x + c * lp.y);
    vec3 wp; vec4 mv;
    if (iG.x > 0.5 && iG.x < 1.5) { mv = mvC; mv.xy += rp; wp = iA.xyz; }
    else {
      if (iG.x > 1.5 && iG.x < 2.5) wp = iA.xyz + qrot(iC, vec3(rp, 0.0));
      else wp = iA.xyz + qrot(iC, vec3(rp.x, 0.0, rp.y));
      if (iG.x < 0.5 && uHFOn > 0.5) wp.y = awHF(wp.xz) + uLift;
      mv = viewMatrix * vec4(wp, 1.0);
    }
    gl_Position = projectionMatrix * mv;
    vP = lp; vE = iE; vF = iF; vS = vec4(R, r2, w, shape); vD = iD; vErode = iG.y;
    vM = uDuck > 0.5 ? awFxMul(wp, -mv.z, iG.z) : 1.0;
  }`;

const FRAG = /* glsl */`
  uniform sampler2D uGlyph; uniform float uGlyphCols, uTime;
  varying vec2 vP; varying vec4 vE; varying vec4 vF; varying vec4 vS; varying vec4 vD; varying float vM; varying float vErode;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.17)); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
  vec2 fold(vec2 p, float n) { float s = 6.2831853 / n; float a = atan(p.y, p.x); a = mod(a + s * 0.5, s) - s * 0.5; return length(p) * vec2(cos(a), abs(sin(a))); }
  float hexEdge(vec2 p, float cs) {   // distance to the edges of a hex grid of cell size cs
    p /= cs; vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b;
    g = abs(g); return (0.5 - max(dot(g, normalize(vec2(1.0, 1.7320508))), g.x)) * cs;
  }
  void main() {
    float R = vS.x, r2 = vS.y, w = vS.z, shape = vS.w;
    vec2 p = vP; float l = length(p);
    float px = max(0.7 * length(fwidth(p)), 1e-5);
    w = max(w, px * 0.5);
    float d = 1e3;          // signed distance (m): < 0 inside the drawn mark
    float glyphA = -1.0;
    float n1 = vD.z, n2 = vD.w;
    if (shape < 0.5) d = abs(l - R) - w;
    else if (shape < 1.5) {
      float a = atan(p.y, p.x); float span = vD.y - vD.x; float rel = mod(a - vD.x, 6.2831853);
      if (rel <= span) d = abs(l - R) - w;
      else d = min(length(p - R * vec2(cos(vD.x), sin(vD.x))), length(p - R * vec2(cos(vD.y), sin(vD.y)))) - w;
    }
    else if (shape < 2.5) { float n = max(n1, 3.0); vec2 q = fold(p, n); float c = cos(3.14159265 / n), s = sin(3.14159265 / n); d = sdSeg(q, vec2(R * c, 0.0), vec2(R * c, R * s)) - w; }
    else if (shape < 3.5) { float n = max(n1, 3.0); vec2 q = fold(p, n); d = sdSeg(q, vec2(R, 0.0), r2 * vec2(cos(3.14159265 / n), sin(3.14159265 / n))) - w; }
    else if (shape < 4.5) { vec2 q = fold(p, max(n1, 1.0)); d = sdSeg(q, vec2(r2, 0.0), vec2(R, 0.0)) - w; }
    else if (shape < 5.5) { vec2 q = fold(p, max(n1, 1.0)); float k = clamp((q.x - r2) / max(R - r2, 1e-3), 0.0, 1.0); d = max(q.y - w * 1.6 * (1.0 - k) - px * 0.5, max(r2 - q.x, q.x - R)); }
    else if (shape < 6.5) {
      float turns = max(n1, 0.25), arms = max(n2, 1.0); float b = (R - r2) / (turns * 6.2831853);
      float a = atan(p.y, p.x);
      for (int k = 0; k < 4; k++) {
        if (float(k) >= arms) break;
        float th = mod(a - float(k) * 6.2831853 / arms, 6.2831853);
        float j = clamp(floor((l - r2 - b * th) / (6.2831853 * b) + 0.5), 0.0, ceil(turns));
        float tn = min(th + 6.2831853 * j, turns * 6.2831853);
        d = min(d, abs(l - (r2 + b * tn)) - w * (0.4 + 0.6 * tn / (turns * 6.2831853)));
      }
    }
    else if (shape < 7.5) d = max(l - R, -(length(p - vec2(R * 0.38, 0.0)) - R * 0.84));
    else if (shape < 8.5) {
      if (l > R) discard;
      float gi = n1; vec2 cell = vec2(mod(gi, uGlyphCols), floor(gi / uGlyphCols));
      vec2 uv = (cell + vec2(p.x / (2.0 * R) + 0.5, 0.5 - p.y / (2.0 * R))) / uGlyphCols;
      float sd = texture2D(uGlyph, uv).r + n2;
      float fw = max(fwidth(sd), 1e-4);
      glyphA = smoothstep(0.5 - fw, 0.5 + fw, sd);
      d = (0.5 - sd) * 0.0625 * 2.0 * R;
    }
    else if (shape < 9.5) { vec2 q = fold(p, max(n1, 1.0)); d = length(q - vec2(R, 0.0)) - w * 1.6; }
    else if (shape < 10.5) {
      if (l > R) discard;
      float cs = max(w * 7.0, 0.04); vec2 c = floor(p / cs); vec2 o = h22(c + vD.x * 3.1);
      float on = step(o.x, n2 > 0.0 ? n2 : 0.45);
      d = on > 0.5 ? length(p - (c + 0.2 + 0.6 * o) * cs) - w : 1e3;
    }
    else {
      if (l > R) discard;
      float fadeR = 1.0 - smoothstep(0.65 * R, R, l);
      if (shape < 11.5) {        // crack: Voronoi edges
        vec2 q = p / (R * 0.36); vec2 g = floor(q); float f1 = 9.0, f2 = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y); vec2 c = g + o + h22(g + o + vD.x); float dd = length(q - c); if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd; }
        d = (f2 - f1) * R * 0.18 - w * (0.4 + 0.8 * fadeR);
      } else if (shape < 12.5) {  // scorch: broken concentric rings + ember stipple
        float a = atan(p.y, p.x);
        for (int i = 0; i < 3; i++) { float ri = R * (0.34 + 0.26 * float(i)); float gap = step(0.28, fract(a * (3.0 + float(i)) / 6.2831853 + h21(vec2(float(i), vD.x)))); if (gap > 0.5) d = min(d, abs(l - ri) - w * (1.0 - 0.25 * float(i))); }
        float cs = max(w * 6.0, 0.05); vec2 c = floor(p / cs); vec2 o = h22(c + 7.0);
        if (o.x < 0.22) d = min(d, length(p - (c + 0.25 + 0.5 * o) * cs) - w * 0.8);
      } else if (shape < 13.5) d = hexEdge(p, R * 0.3) - w;          // frost: hex grid
      else if (shape < 15.5) { float sp = R / 3.2; float x = mod(l - vD.y * sp, sp); d = abs(x - sp * 0.5) - w * fadeR; }   // ripple: rings
      else { float y = p.y + sin(p.x * 6.0 / R + vD.x) * R * 0.05; float sp = R / 4.5; d = abs(mod(y, sp) - sp * 0.5) - w * (0.7 + 0.3 * fadeR); }   // strata
      d += (1.0 - fadeR) * w * 1.5;
    }
    float a = glyphA >= 0.0 ? glyphA : clamp(0.5 - d / px, 0.0, 1.0);
    vec3 col = vE.rgb;
    if (vErode > 0.0) {
      float n = vnoise(p * (3.0 / max(R, 0.3)) * 4.0 + vD.x);
      if (n < vErode) discard;
      if (n < vErode + 0.06) col = mix(col, vF.rgb, 0.7);
    }
    a *= vE.a * vM;
    if (a < 0.004) discard;
    float core = vF.a > 0.0 ? vF.a * clamp(1.0 - abs(d + w) / max(w, px), 0.0, 1.0) : 0.0;
    gl_FragColor = vec4(col * a + vF.rgb * core * a, a);
  }`;

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _fw = new THREE.Vector3(), _cam = new THREE.Vector3();
const backOut = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

class Pool {
  constructor(game, mat, cap, owner) {
    this.cap = cap; this.n = 0; this.owner = owner;
    const g = stripGeometry();
    const mk = (name) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.A = mk('iA'); this.B = mk('iB'); this.C = mk('iC'); this.D = mk('iD'); this.E = mk('iE'); this.F = mk('iF'); this.G = mk('iG');
    this.dyn = [this.A, this.E, this.G];
    this.stat = [this.B, this.C, this.D, this.F];
    g.instanceCount = 0;
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 6;
    this.mesh.name = owner === 'player' ? 'kit-linework' : 'kit-linework-enemy';
    this.mesh.userData.owner = owner === 'player' ? 'player' : 'enemy';
    this.mesh.matrixAutoUpdate = false;
    game.scene.add(this.mesh);
    this.recs = [];
    this.lo = 1e9; this.hi = -1;
  }
}

export function createLinework(game, glyphs, hooks = {}) {
  const hf = game.world?.heightField;
  const hfOk = !!(hf && hf.tex && typeof hf.glsl === 'string' && hf.glsl.includes('awHeightField'));
  const hfGlsl = hfOk ? hf.glsl + '\nfloat awHF(vec2 xz) { return awHeightField(uHF, xz); }\n' : 'float awHF(vec2 xz) { return 0.0; }\n';
  const shared = hooks.shared;
  const mkMat = (duck) => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uScreenH: hooks.screenH, uDuck: { value: duck ? 1 : 0 }, uHFOn: { value: hfOk ? 1 : 0 }, uLift: { value: 0.05 },
        uHF: { value: hfOk ? hf.tex : null }, uGlyph: { value: glyphs.tex }, uGlyphCols: { value: glyphs.cols }, uTime: hooks.time,
        uPlayerFxMul: shared.uPlayerFxMul, uThreat: shared.uThreat, uThreatN: shared.uThreatN, uCamPos: shared.uCamPos, uPlayerPos: shared.uPlayerPos,
      },
      vertexShader: VERT(hfGlsl), fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide, toneMapped: true,
    });
    m.name = duck ? 'kit-linework' : 'kit-linework-enemy';
    return m;
  };
  const matP = mkMat(true), matE = mkMat(false);
  const pools = { player: new Pool(game, matP, 320, 'player'), enemy: new Pool(game, matE, 128, 'enemy') };
  let serial = 0;

  /** rec: all spec numbers resolved by kit.line(). */
  function add(rec) {
    const P = rec.owner === 'player' ? pools.player : pools.enemy;
    if (P.n >= P.cap) {   // full: recycle the oldest record of this pool
      let oi = 0; for (let i = 1; i < P.n; i++) if (P.recs[i].born < P.recs[oi].born) oi = i;
      kill(P, oi);
    }
    const i = P.n++;
    P.recs[i] = rec; rec.pool = P; rec.slot = i; rec.born = ++serial; rec.alive = true;
    writeStatic(P, i);
    return rec;
  }
  function writeStatic(P, i) {
    const r = P.recs[i], k = i * 4;
    const B = P.B.array, C = P.C.array, D = P.D.array, F = P.F.array;
    B[k] = r.r2 / Math.max(r.r, 1e-4); B[k + 1] = r.width * 0.5; B[k + 2] = r.minPx; B[k + 3] = r.shapeId;
    C[k] = r.quat.x; C[k + 1] = r.quat.y; C[k + 2] = r.quat.z; C[k + 3] = r.quat.w;
    D[k] = r.a0; D[k + 1] = r.a1; D[k + 2] = r.p1; D[k + 3] = r.p2;
    F[k] = r.c2.r; F[k + 1] = r.c2.g; F[k + 2] = r.c2.b; F[k + 3] = r.core;
    if (i < P.lo) P.lo = i; if (i > P.hi) P.hi = i;
  }
  function kill(P, i) {
    const r = P.recs[i]; r.alive = false; r.pool = null;
    hooks.onKill?.(r);
    const last = --P.n;
    if (i !== last) { P.recs[i] = P.recs[last]; P.recs[i].slot = i; writeStatic(P, i); }
    P.recs[last] = null;
  }
  function stop(rec, fade = true) {
    if (!rec.alive) return;
    if (!fade) { kill(rec.pool, rec.slot); return; }
    const left = rec.life - rec.t;
    if (left > rec.tOut) { rec.life = rec.t + rec.tOut; }
    rec.persistent = false;
  }
  function restatic(rec) { if (rec.alive && rec.pool) writeStatic(rec.pool, rec.slot); }

  // per frame (once): animate, write live ranges, coverage estimate
  const proj = { p00: 1, p11: 1, w: 1, h: 1 };
  function update(dt) {
    const cam = game.camera; cam.getWorldPosition(_cam); cam.getWorldDirection(_fw);
    proj.p00 = cam.projectionMatrix.elements[0]; proj.p11 = cam.projectionMatrix.elements[5];
    let cover = 0;
    for (const key in pools) {
      const P = pools[key];
      for (let i = P.n - 1; i >= 0; i--) {
        const r = P.recs[i];
        r.t += dt;
        if (!r.persistent && r.t >= r.life) { kill(P, i); continue; }
        if (r.follow) {
          if (!r.follow.parent) { if (!r.persistent) { kill(P, i); continue; } }
          else { r.follow.getWorldPosition(r.pos); if (r.followOff) r.pos.add(r.followOff); }
        }
      }
      const A = P.A.array, E = P.E.array, G = P.G.array;
      for (let i = 0; i < P.n; i++) {
        const r = P.recs[i], k = i * 4;
        const t = r.t;
        let sc = 1;
        if (r.scaleIn === 2) sc = Math.min(1, t / Math.max(r.life, 1e-3));                       // expand over the whole life
        else if (r.scaleIn === 3) sc = 1 - 0.75 * Math.min(1, t / Math.max(r.life, 1e-3));      // contract (binding)
        else if (t < r.tIn) { const x = t / Math.max(r.tIn, 1e-3); sc = r.scaleIn === 1 ? x : backOut(x); }
        let al = r.alpha * r.userAlpha;
        if (r.tIn > 0 && t < r.tIn) al *= Math.min(1, t / (r.tIn * 0.6));
        let er = 0;
        if (!r.persistent) {
          const left = r.life - t;
          if (left < r.tOut) { const x = 1 - left / Math.max(r.tOut, 1e-3); if (r.erode) { er = x * 0.95; al *= 1 - x * 0.3; } else al *= 1 - x * x; }
        }
        r.rot += r.spin * dt;
        const R = r.r * sc * r.userScale;
        A[k] = r.pos.x; A[k + 1] = r.pos.y; A[k + 2] = r.pos.z; A[k + 3] = R;
        E[k] = r.c.r; E[k + 1] = r.c.g; E[k + 2] = r.c.b; E[k + 3] = al * r.mul;
        G[k] = r.plane; G[k + 1] = er; G[k + 2] = r.role; G[k + 3] = r.rot;
        // coverage estimate (screens): drawn area × projected density
        const dz = (r.pos.x - _cam.x) * _fw.x + (r.pos.y - _cam.y) * _fw.y + (r.pos.z - _cam.z) * _fw.z;
        if (dz > 0.2 && al > 0.01) {
          const z = Math.max(dz, 0.5);
          const mpp = z * 2 / (proj.p11 * Math.max(1, hooks.screenH.value));
          const hw = Math.max(r.width * 0.5, r.minPx * 0.5 * mpp) + mpp * 0.5;
          const area = markArea(r, R, hw) * (1 - er);
          let cosv = 1;
          if (r.plane === 0 || r.plane === 3) cosv = Math.max(0.15, Math.abs((r.pos.y - _cam.y) / Math.max(0.5, Math.hypot(r.pos.x - _cam.x, r.pos.y - _cam.y, r.pos.z - _cam.z))));
          let c = area * proj.p00 * proj.p11 / (4 * z * z) * cosv;
          if (hooks.proj) { const bb = hooks.proj.disc(r.pos.x, r.pos.y, r.pos.z, R + hw, 1) * cosv * Math.min(1, area / (4 * R * R + 1e-6)); if (bb < c) c = bb; }
          r.cov = c; if (key === 'player') cover += c; else hooks.onOtherCover?.(c, r);
        } else r.cov = 0;
      }
      const n = P.n;
      P.geometry.instanceCount = n;
      for (const a of P.dyn) { a.clearUpdateRanges(); if (n > 0) { a.addUpdateRange(0, n * 4); a.needsUpdate = true; } }
      if (P.hi >= P.lo) {
        const lo = P.lo, hi = Math.min(P.hi, Math.max(0, n - 1));
        if (hi >= lo) for (const a of P.stat) { a.clearUpdateRanges(); a.addUpdateRange(lo * 4, (hi - lo + 1) * 4); a.needsUpdate = true; }
        P.lo = 1e9; P.hi = -1;
      }
      P.mesh.visible = n > 0;
    }
    return cover;
  }

  function markArea(r, R, hw) {
    const s = r.shapeId, w2 = 2 * hw;
    switch (s) {
      case 0: return TAU * R * w2;
      case 1: return Math.abs(r.a1 - r.a0) * R * w2;
      case 2: { const n = Math.max(3, r.p1); return n * 2 * R * Math.sin(Math.PI / n) * w2; }
      case 3: { const n = Math.max(3, r.p1); return 2 * n * Math.hypot(R - (r.r2 / r.r) * R * Math.cos(Math.PI / n), (r.r2 / r.r) * R * Math.sin(Math.PI / n)) * w2; }
      case 4: return Math.max(1, r.p1) * R * (1 - r.r2 / r.r) * w2;
      case 5: return Math.max(1, r.p1) * R * (1 - r.r2 / r.r) * w2 * 0.8;
      case 6: return Math.max(1, r.p2) * Math.max(0.25, r.p1) * TAU * R * 0.6 * w2 * 0.7;
      case 7: return 0.35 * Math.PI * R * R;
      case 8: return 0.16 * Math.PI * R * R;
      case 9: return Math.max(1, r.p1) * Math.PI * (1.6 * hw + hw) * (1.6 * hw + hw);
      case 10: return Math.PI * R * R * (r.p2 > 0 ? r.p2 : 0.45) * 0.07;
      default: return 0.14 * Math.PI * R * R;
    }
  }

  function stats() { return { player: pools.player.n, enemy: pools.enemy.n, calls: (pools.player.n > 0 ? 1 : 0) + (pools.enemy.n > 0 ? 1 : 0) }; }
  function clear() { for (const key in pools) { const P = pools[key]; while (P.n > 0) kill(P, P.n - 1); } }
  return { add, stop, restatic, update, stats, clear, pools, materials: [matP, matE], hfOk, _q, _v };
}
