// Sword-owned visual effects (all pooled, no per-frame allocation):
//  - SlashArcs: crisp toon crescents (vertex-shader built arcs) whose leading edge carries the element motif (v4 §3.6)
//  - BladeTrail: Catmull-Rom smoothed ribbon swept between blade base and tip (ramp colours, thin edge)
//  - Spikes: instanced prism / strata rock / thorn spikes erupting from the ground (ice lines, fissures, ice flower)
//  - StoneSwords: giant falling stone swords (대지의 심판)
//  - OrbitBlades: spectral wind blades orbiting the hero (폭풍 검진)
//  - Dragon: flame dragon made from a chain of flame tongues (종말의 화룡검)
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const _e = new THREE.Euler();

// v4 (PLAN §3.1, §3.6): every sword material is created ONCE here (0 per move), premultiplied or normal-blended, colours from the
// 4-step element ramps (game.elements.fx; no white), emissive ≤ 1.2, depthWrite:false in the transparent pass, owner tag 'player'.
// opts.onMat(material, role) lets the engine route each private material through vfx.applyPlayerFx (side effect only).

// element → leading-edge motif of the slash ribbon (§3.6 "smear arc carries the element motif on its leading edge")
export const EDGE_KIND = { physical: 0, fire: 1, ice: 2, lightning: 3, wind: 4, water: 5, earth: 6, nature: 7, light: 8, shadow: 9, void: 9 };
const FALLBACK_RAMP = { hi: 0xf4f1ea, light: 0xcfc8ba, mid: 0x8a8274, dark: 0x2e2a24 };
const _rc = new Map();
/** {hi, light, mid, dark} numbers for an element (game.elements.fx when present). */
export function rampOf(game, el) {
  let r = _rc.get(el);
  if (r) return r;
  try { r = game?.elements?.fx?.(el) || null; } catch (_) { r = null; }
  if (!r || r.mid == null) r = FALLBACK_RAMP;
  _rc.set(el, r);
  return r;
}
const tagFx = (o, name) => { o.name = name; o.userData.owner = 'player'; o.userData.noCameraCollide = true; o.castShadow = false; o.receiveShadow = false; return o; };
const PREMUL = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

// ------------------------------------------------------------------ slash arcs (the primary shape of every melee move)
const ARC_VS = /* glsl */`
  uniform float uStart, uSpan, uRin, uRout;
  attribute vec2 aUV;
  varying vec2 vUV;
  void main() {
    vUV = vec2(aUV.x, aUV.y * 1.2);
    float a = uStart + aUV.x * uSpan;
    // crescent: thick in the middle of the sweep, tapering to points at both ends
    float w = 0.06 + 0.94 * pow(sin(3.14159 * aUV.x), 0.8);
    float rIn = uRout - (uRout - uRin) * w;
    float r = rIn + (uRout - rIn) * vUV.y;          // vUV.y > 1 → room for edge motifs beyond the rim
    vec3 p = vec3(sin(a) * r, 0.0, cos(a) * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const ARC_FS = /* glsl */`
  uniform vec3 uDark, uMid, uLight, uHi; uniform float uProg, uFade, uSeed, uKind, uOpacity, uTime;
  varying vec2 vUV;
  float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
  float tri(float x) { return 1.0 - abs(fract(x) * 2.0 - 1.0); }
  void main() {
    float u = vUV.x, v = vUV.y;
    float head = uProg * 1.08;
    if (u > head) discard;
    float age = head - u;
    float k = uKind;
    // leading-edge profile e(u) in radial units (1 = rim); deterministic per cast (uSeed)
    float e = 1.0;
    if (k < 1.5 && k > 0.5) { float c = u * 9.0 + uSeed; e = 1.0 + 0.16 * pow(tri(c), 3.0) * (0.6 + 0.4 * h1(floor(c))); }        // fire: flame tongues
    else if (k < 2.5 && k > 1.5) e = 1.0 + 0.13 * tri(u * 14.0 + uSeed);                                                          // ice: frost teeth
    else if (k < 3.5 && k > 2.5) { float c = u * 22.0 + uSeed; e = 1.0 + 0.09 * (h1(floor(c)) * 2.0 - 1.0) * tri(c) + 0.03; }  // lightning: arc-crawl
    else if (k < 5.5 && k > 4.5) e = 1.0 + 0.05 * sin(u * 37.7 + uSeed);                                                          // water: crest
    else if (k < 6.5 && k > 5.5) { float c = u * 11.0 + uSeed; e = 1.0 - 0.12 * step(0.55, h1(floor(c))) * step(0.25, fract(c)); }  // earth: chipped edge
    else if (k < 7.5 && k > 6.5) { float c = u * 8.0 + uSeed; e = 1.0 + 0.18 * pow(max(0.0, 1.0 - abs(fract(c) - 0.5) * 7.0), 1.5) * step(0.4, h1(floor(c))); } // nature: thorns
    float aa = max(fwidth(v), 0.006);
    bool tick = false;
    if (k > 7.5 && k < 8.5) { float f = abs(fract(u * 16.0 + uSeed) - 0.5); tick = v > 1.03 && v < 1.13 && f < 0.07; }            // light: halo ticks
    if (v > e + aa && !tick) discard;
    float t = clamp(v / e, 0.0, 1.0);
    // toon body: dark inner → mid; a crisp light rim band, a thin hi line near the head only (glint, not haze)
    float rimB = smoothstep(e - 0.13, e - 0.11 + aa, v);
    float edgeA = 1.0 - smoothstep(e - aa, e + aa, v);
    // a crisp crescent BAND (not a faint fan): the inner 40 % is empty, the body is the saturated mid step at ≤ 0.7 alpha
    vec3 col = mix(uDark, uMid, smoothstep(0.36, 0.44, t));       // thin dark inner line, saturated mid body
    float body = 0.7 * smoothstep(0.36, 0.5, t);
    if (k > 8.5) { col = mix(uDark, uMid, smoothstep(0.3, 0.6, t)); body = 0.7 * smoothstep(0.3, 0.45, t); }                                                          // shadow: inverted value
    if (k > 3.5 && k < 4.5) { float s = abs(fract(v * 5.0 + u * 0.6) - 0.5); body *= 0.8; rimB = max(rimB, (1.0 - smoothstep(0.03, 0.03 + aa * 5.0, s)) * step(0.45, v) * 0.85); } // wind: streamlines
    col = mix(col, mix(uMid, uLight, 0.55), rimB);
    float hiL = (1.0 - smoothstep(0.0, 0.18, age)) * smoothstep(e - 0.05, e - 0.035, v) * edgeA;
    col = mix(col, uHi, hiL * 0.85);
    float a = max(body, rimB * 0.95) * edgeA;
    if (tick) { col = uLight; a = 0.9; }
    a *= smoothstep(0.0, 0.04, u) * uOpacity;
    // dissipation by erosion of the tail and of the whole crescent (never by haze)
    float n = h1(floor(u * 60.0) + floor(v * 8.0) * 61.0 + uSeed);
    if (n > uFade * 1.25 - 0.1) discard;
    if (n > 1.0 - smoothstep(0.35, 1.0, age)) discard;
    a = min(a, 0.95);
    if (a < 0.12) discard;                                   // no faint haze fragments (coverage, crisp edges)
    gl_FragColor = vec4(col * a, a);
  }`;

function arcGeometry(seg = 48, rings = 6) {
  const uv = [], idx = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= rings; j++) uv.push(i / seg, j / rings);
  for (let i = 0; i < seg; i++) for (let j = 0; j < rings; j++) {
    const a = i * (rings + 1) + j, b = a + rings + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(uv.length / 2 * 3), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
  return g;
}

export class SlashArcs {
  constructor(scene, n = 18, opts = {}) {
    this.items = [];
    this.game = opts.game || null;
    const geo = arcGeometry();
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uStart: { value: 0 }, uSpan: { value: 2 }, uRin: { value: 0.5 }, uRout: { value: 2 },
          uDark: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uLight: { value: new THREE.Color() }, uHi: { value: new THREE.Color() },
          uProg: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uSeed: { value: 0 }, uKind: { value: 0 }, uOpacity: { value: 1 },
        },
        vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, ...PREMUL,
        side: THREE.DoubleSide, toneMapped: true,
      });
      mat.name = 'sword-arc';
      opts.onMat?.(mat, 'line');
      const mesh = tagFx(new THREE.Mesh(geo, mat), 'sword-arc');
      mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 11;
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      this.items.push({ mesh, mat, t: 0, life: 0, sweep: 0.08, vel: new THREE.Vector3(), grow: 0, alive: false, born: 0, castId: 0 });
    }
    this.serial = 0;
  }
  /**
   * o: {pos, yaw, tilt (roll around forward), pitch, start, span (rad, signed), rin, rout, el, sweep (s to reveal), life (s total),
   *     vel (Vector3), grow (scale/s), opacity, castId, seed}
   */
  spawn(o) {
    let it = null, old = this.items[0];
    for (const x of this.items) { if (!x.alive) { it = x; break; } if (x.born < old.born) old = x; }
    it = it || old;
    it.alive = true; it.born = ++this.serial;
    const m = it.mesh, u = it.mat.uniforms;
    m.position.copy(o.pos);
    m.rotation.set(o.pitch || 0, o.yaw || 0, o.tilt || 0, 'YXZ');
    m.scale.setScalar(o.scale || 1);
    u.uStart.value = o.start ?? -1.6; u.uSpan.value = o.span ?? 3.2;
    u.uRin.value = o.rin ?? 0.6; u.uRout.value = o.rout ?? 2.4;
    const el = o.el || 'physical';
    const R = rampOf(this.game, el);
    u.uDark.value.setHex(R.dark); u.uMid.value.setHex(R.mid); u.uLight.value.setHex(R.light); u.uHi.value.setHex(R.hi);
    u.uKind.value = o.kind ?? EDGE_KIND[el] ?? 0;
    u.uSeed.value = ((o.seed ?? o.castId ?? this.serial) * 7.31) % 97;
    u.uProg.value = 0; u.uFade.value = 1; u.uOpacity.value = Math.min(1, o.opacity ?? 1);
    it.t = 0; it.sweep = Math.max(0.01, o.sweep ?? 0.08); it.life = Math.max(it.sweep + 0.02, o.life ?? 0.24);
    it.vel.copy(o.vel || _v.set(0, 0, 0)); it.grow = o.grow || 0; it.castId = o.castId || 0;
    m.visible = true;
    return it;
  }
  update(dt, time) {
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt;
      const u = it.mat.uniforms;
      u.uProg.value = Math.min(1, it.t / it.sweep);
      const fadeT = (it.t - it.sweep) / Math.max(0.01, it.life - it.sweep);
      u.uFade.value = fadeT <= 0 ? 1 : Math.max(0, 1 - fadeT);
      u.uTime.value = time;
      if (it.vel.lengthSq() > 0) it.mesh.position.addScaledVector(it.vel, dt);
      if (it.grow) it.mesh.scale.multiplyScalar(1 + it.grow * dt);
      if (it.t >= it.life) { it.alive = false; it.mesh.visible = false; }
    }
  }
  clear() { for (const it of this.items) { it.alive = false; it.mesh.visible = false; } }
  get live() { let n = 0; for (const it of this.items) if (it.alive) n++; return n; }
}

// ------------------------------------------------------------------ blade ribbon trail
// 16 samples from hilt and tip, Catmull-Rom to 31 points; toon ramp (mid body → light edge, thin hi line at the head only),
// premultiplied, body alpha ≤ 0.6, the alpha trail shorter than the edge; per-weapon width / life (daggers 0.12 s).
const TR_N = 16, TR_SUB = 2, TR_P = (TR_N - 1) * TR_SUB + 1;
const TRAIL_VS = /* glsl */`
  attribute vec2 aT; varying vec2 vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TRAIL_FS = /* glsl */`
  uniform vec3 uDark, uMid, uLight, uHi; uniform float uOpacity, uEdge;
  varying vec2 vT; // x: 0 newest..1 oldest, y: 0 base..1 tip
  void main() {
    float age = vT.x, y = vT.y;
    float aa = max(fwidth(y), 0.01);
    float body = (1.0 - smoothstep(0.0, 0.5, age)) * smoothstep(0.55, 0.7, y) * 0.6;
    float edge = smoothstep(0.86 - aa, 0.9, y) * (1.0 - smoothstep(0.0, 1.0, age)) * uEdge;
    vec3 col = mix(uDark, uMid, smoothstep(0.5, 0.7, y));
    col = mix(col, mix(uMid, uLight, 0.6), edge);
    col = mix(col, uHi, edge * (1.0 - smoothstep(0.0, 0.15, age)) * 0.5);
    float a = min(0.8, max(body, edge * 0.9)) * uOpacity;
    if (a < 0.12) discard;
    gl_FragColor = vec4(col * a, a);
  }`;
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
}
export class BladeTrail {
  constructor(scene, opts = {}) {
    this.game = opts.game || null;
    this.base = Array.from({ length: TR_N }, () => new THREE.Vector3());
    this.tip = Array.from({ length: TR_N }, () => new THREE.Vector3());
    this.age = new Float32Array(TR_N);
    this.n = 0; this.on = false; this.w = 0;
    const g = new THREE.BufferGeometry();
    this.P = new Float32Array(TR_P * 2 * 3);
    const T = new Float32Array(TR_P * 2 * 2), idx = [];
    for (let i = 0; i < TR_P; i++) { T[i * 4] = i / (TR_P - 1); T[i * 4 + 1] = 0; T[i * 4 + 2] = i / (TR_P - 1); T[i * 4 + 3] = 1; }
    for (let i = 0; i < TR_P - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    this.aT = new THREE.BufferAttribute(T, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aT', this.aT);
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uDark: { value: new THREE.Color(0x7a1e0a) }, uMid: { value: new THREE.Color(0xf0661a) }, uLight: { value: new THREE.Color(0xffa53a) },
        uHi: { value: new THREE.Color(0xffe08a) }, uOpacity: { value: 1 }, uEdge: { value: 1 } },
      vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false, ...PREMUL,
      side: THREE.DoubleSide,
    });
    this.mat.name = 'sword-trail';
    opts.onMat?.(this.mat, 'line');
    this.mesh = tagFx(new THREE.Mesh(g, this.mat), 'sword-trail');
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.geo = g;
    this.maxAge = 0.16; this.width = 1; this.time = 0;
    this._b = new THREE.Vector3();
  }
  /** Element colours (4-step ramp). */
  setElement(el) {
    const R = rampOf(this.game, el), u = this.mat.uniforms;
    u.uDark.value.setHex(R.dark); u.uMid.value.setHex(R.mid); u.uLight.value.setHex(R.light); u.uHi.value.setHex(R.hi);
  }
  setColor() { /* v4: colours come from setElement(el) (ramps); kept for API compatibility */ }
  /** Per-weapon look: {width (×hilt→tip span; >1 reaches past the hilt), life (s), noise (0..1), edge (white-hot rim)}. */
  setProfile(o) {
    if (!o) return;
    this.width = o.width ?? 1; this.maxAge = o.life ?? 0.16;
    this.mat.uniforms.uEdge.value = Math.min(1, o.edge ?? 1);
  }
  /** active: emit samples this frame. */
  update(dt, active, basePos, tipPos) {
    this.time += dt;
    if (this.width !== 1 && basePos && tipPos) basePos = this._b.copy(basePos).sub(tipPos).multiplyScalar(this.width).add(tipPos);
    for (let i = 0; i < this.n; i++) this.age[i] += dt;
    while (this.n > 0 && this.age[this.n - 1] > this.maxAge) this.n--;
    if (active && dt > 0) {
      const moved = this.n === 0 || this.tip[0].distanceToSquared(tipPos) > 0.0009;
      if (moved) {
        // shift
        const lb = this.base[TR_N - 1], lt = this.tip[TR_N - 1];
        for (let i = TR_N - 1; i > 0; i--) { this.base[i] = this.base[i - 1]; this.tip[i] = this.tip[i - 1]; this.age[i] = this.age[i - 1]; }
        this.base[0] = lb.copy(basePos); this.tip[0] = lt.copy(tipPos); this.age[0] = 0;
        this.n = Math.min(TR_N, this.n + 1);
      } else { this.base[0].copy(basePos); this.tip[0].copy(tipPos); this.age[0] = 0; }
    }
    this.w = active ? 1 : Math.max(0, this.w - dt * 8);
    if (this.n < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mat.uniforms.uOpacity.value = 0.35 + 0.65 * this.w;
    const P = this.P, T = this.aT.array, n = this.n;
    let k = 0;
    const segs = n - 1, pts = segs * TR_SUB + 1;
    for (let s = 0; s < segs; s++) {
      const i0 = Math.max(0, s - 1), i1 = s, i2 = s + 1, i3 = Math.min(n - 1, s + 2);
      for (let j = 0; j < TR_SUB; j++) {
        const t = j / TR_SUB;
        cr(this.base[i0], this.base[i1], this.base[i2], this.base[i3], t, _v);
        cr(this.tip[i0], this.tip[i1], this.tip[i2], this.tip[i3], t, _v2);
        const age = (this.age[i1] + (this.age[i2] - this.age[i1]) * t) / this.maxAge;
        P[k * 6] = _v.x; P[k * 6 + 1] = _v.y; P[k * 6 + 2] = _v.z;
        P[k * 6 + 3] = _v2.x; P[k * 6 + 4] = _v2.y; P[k * 6 + 5] = _v2.z;
        T[k * 4] = Math.min(1, age); T[k * 4 + 2] = Math.min(1, age);
        k++;
      }
    }
    const L = n - 1;
    P[k * 6] = this.base[L].x; P[k * 6 + 1] = this.base[L].y; P[k * 6 + 2] = this.base[L].z;
    P[k * 6 + 3] = this.tip[L].x; P[k * 6 + 4] = this.tip[L].y; P[k * 6 + 5] = this.tip[L].z;
    T[k * 4] = 1; T[k * 4 + 2] = 1;
    k++;
    // live range only (§2.7): the collapsed tail needs no upload once written
    const pa = this.geo.attributes.position;
    pa.clearUpdateRanges(); pa.addUpdateRange(0, Math.min(TR_P, k + 1) * 6); pa.needsUpdate = true;
    this.aT.clearUpdateRanges(); this.aT.addUpdateRange(0, Math.min(TR_P, k + 1) * 4); this.aT.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (pts - 1) * 6));
  }
  clear() { this.n = 0; this.mesh.visible = false; }
}

// ------------------------------------------------------------------ instanced ground spikes
// toon "solid" FX (alpha 1, depthWrite false, transparent pass, flat-shaded facets, dark outline band from the ramp)
export class Spikes {
  /** kind: 'ice' | 'rock' | 'crystal' (tinted per instance: thorns, light crystals, shadow spikes; one draw call). */
  constructor(scene, kind, n = 48, opts = {}) {
    const ice = kind === 'ice';
    const crystal = kind === 'crystal';
    const game = opts.game || null;
    // ice: hexagonal prism with a pointed cap (6-fold); rock: faceted wedge spike with strata; crystal: 5-sided thorn
    const geo = ice ? new THREE.ConeGeometry(0.35, 1, 6, 1) : crystal ? new THREE.ConeGeometry(0.4, 1, 5, 1) : new THREE.ConeGeometry(0.45, 1, 6, 2);
    geo.translate(0, 0.5, 0);
    if (!ice) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * (0.8 + 0.4 * Math.abs(Math.sin(i * 12.9)))); } }
    const ng = geo.toNonIndexed(); ng.computeVertexNormals();
    // strata vertex bands (earth): alternate light / mid / dark by height
    const R = rampOf(game, ice ? 'ice' : crystal ? 'physical' : 'earth');
    const cols = new Float32Array(ng.attributes.position.count * 3), cc = new THREE.Color();
    for (let i = 0; i < ng.attributes.position.count; i++) {
      const y = ng.attributes.position.getY(i);
      if (ice) cc.setHex(y > 0.82 ? R.light : R.mid).lerp(_cl.setHex(R.light), 0.35 * y);
      else if (crystal) cc.setRGB(1, 1, 1).multiplyScalar(0.55 + 0.45 * y);
      else { const band = Math.floor(y * 5 + 0.5) % 3; cc.setHex(band === 0 ? R.light : band === 1 ? R.mid : R.dark).lerp(_cl.setHex(R.mid), 0.35); }
      cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshToonMaterial({ color: 0xf6f6f6, vertexColors: true, emissive: ice ? R.mid : crystal ? 0x000000 : R.dark,
      emissiveIntensity: ice ? 0.35 : 0.25, transparent: true, opacity: ice ? 0.92 : 1, depthWrite: false });
    mat.flatShading = true;
    mat.name = 'sword-spikes-' + kind;
    opts.onMat?.(mat, 'fill');
    this.mesh = tagFx(new THREE.InstancedMesh(ng, mat, n), 'sword-spikes-' + kind);
    this.crystal = crystal;
    if (crystal) {
      // CONTRACT §23: tinted instanced meshes set an instance colour at construction (no recompile on the first tint)
      const c = new THREE.Color(R.mid);
      for (let i = 0; i < n; i++) this.mesh.setColorAt(i, c);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.mesh.instanceColor.needsUpdate = true;
      this._col = new THREE.Color();
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false; this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    this.items = Array.from({ length: n }, () => ({ alive: false, pos: new THREE.Vector3(), h: 1, w: 1, t: 0, delay: 0, life: 1, yaw: 0, tiltX: 0, tiltZ: 0, color: 0x8a8274, castId: 0 }));
    this.ice = ice;
    this.maxLive = n;
  }
  spawn(pos, h, w, delay = 0, life = 1.6, tilt = 0.25, color = 0x8a8274, castId = 0) {
    let it = null;
    for (const x of this.items) if (!x.alive) { it = x; break; }
    if (!it) { it = this.items[0]; for (const x of this.items) if (x.t > it.t) it = x; }
    it.alive = true; it.pos.copy(pos); it.h = h; it.w = w; it.t = -delay; it.life = life; it.color = color; it.castId = castId;
    // deterministic layout per spawn index (R7): no per-spawn randomness in the silhouette
    const k = (++this._serial || (this._serial = 1)) * 2.399;
    it.yaw = k % 6.283; it.tiltX = Math.sin(k * 1.7) * tilt; it.tiltZ = Math.cos(k * 2.3) * tilt;
    return it;
  }
  update(dt) {
    let c = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt;
      if (it.t >= it.life) { it.alive = false; continue; }
      if (it.t < 0) continue;
      const rise = Math.min(1, it.t / 0.09);
      const k = rise < 1 ? 1 - (1 - rise) ** 3 : 1;
      const sink = it.t > it.life - 0.35 ? (it.t - (it.life - 0.35)) / 0.35 : 0;
      const sy = it.h * k * (1 + (rise >= 1 ? Math.max(0, 0.12 - (it.t - 0.09)) : 0)) * (1 - sink * 0.9);
      _e.set(it.tiltX, it.yaw, it.tiltZ);
      _q.setFromEuler(_e);
      _s.set(it.w * (1 - sink * 0.5), Math.max(0.01, sy), it.w * (1 - sink * 0.5));
      _v.copy(it.pos); _v.y -= sink * it.h * 0.3;
      _m.compose(_v, _q, _s);
      if (this.crystal) this.mesh.setColorAt(c, this._col.setHex(it.color));
      this.mesh.setMatrixAt(c++, _m);
    }
    this.mesh.count = c; this.mesh.visible = c > 0;
    if (c) {
      const im = this.mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, c * 16); im.needsUpdate = true;
      if (this.crystal) { const ic = this.mesh.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, c * 3); ic.needsUpdate = true; }
    }
  }
  get live() { let n = 0; for (const it of this.items) if (it.alive) n++; return n; }
}
const _cl = new THREE.Color();

// ------------------------------------------------------------------ giant stone swords (earth ult / finisher)
function stoneSwordMesh(game, onMat) {
  const g = new THREE.Group();
  const R = rampOf(game, 'earth');
  const stone = new THREE.MeshToonMaterial({ color: R.mid, emissive: R.dark, emissiveIntensity: 0.35, transparent: true, opacity: 1, depthWrite: false });
  stone.flatShading = true; stone.name = 'sword-stone';
  // rune strips: thin glowing lines in the earth `light` step (normal blend, no additive dust)
  const rune = new THREE.MeshBasicMaterial({ color: R.light, transparent: true, opacity: 0.85, depthWrite: false });
  rune.name = 'sword-stone-rune';
  onMat?.(stone, 'fill'); onMat?.(rune, 'line');
  const blade = new THREE.CylinderGeometry(0.0, 1, 8, 4, 1); blade.scale(1, 1, 0.3); blade.rotateY(Math.PI / 4); blade.translate(0, -4, 0); // tip down at y=-8
  const bm = new THREE.Mesh(blade, stone); g.add(bm);
  const guard = new THREE.BoxGeometry(4.2, 0.7, 0.9); const gm = new THREE.Mesh(guard, stone); gm.position.y = 0.3; g.add(gm);
  const grip = new THREE.CylinderGeometry(0.35, 0.4, 2.4, 6); const gr = new THREE.Mesh(grip, stone); gr.position.y = 1.85; g.add(gr);
  const pom = new THREE.IcosahedronGeometry(0.65, 0); const pm = new THREE.Mesh(pom, stone); pm.position.y = 3.3; g.add(pm);
  const rg = new THREE.PlaneGeometry(0.12, 6.5); rg.translate(0, -3.6, 0.17);
  const r1 = new THREE.Mesh(rg, rune); g.add(r1);
  const r2 = new THREE.Mesh(rg, rune); r2.rotation.y = Math.PI; g.add(r2);
  g.traverse((o) => { if (o.isMesh) tagFx(o, 'sword-stone'); });
  g.name = 'sword-stone';
  g.visible = false;
  g.userData.rune = rune;
  return g;
}
export class StoneSwords {
  constructor(scene, n = 3, opts = {}) {
    this.items = [];
    for (let i = 0; i < n; i++) { const m = stoneSwordMesh(opts.game, opts.onMat); scene.add(m); this.items.push({ m, alive: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), fall: 0.45, life: 3, onLand: null, landed: false, s: 1 }); }
  }
  spawn(target, scale = 1, fall = 0.45, onLand = null) {
    const it = this.items.find((x) => !x.alive) || this.items[0];
    it.alive = true; it.t = 0; it.landed = false; it.fall = fall; it.onLand = onLand; it.s = scale;
    it.to.copy(target); it.to.y += 2.2 * scale; // embed tip into the ground
    it.from.copy(it.to); it.from.y += 26;
    it.m.scale.setScalar(scale); it.m.position.copy(it.from); it.m.rotation.set(0, (this._k = ((this._k || 0) + 1.3) % 6.28), 0.06);
    it.m.visible = true; it.life = fall + 2.6;
    return it;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.fall);
      it.m.position.lerpVectors(it.from, it.to, k * k);
      if (k >= 1 && !it.landed) { it.landed = true; try { it.onLand?.(it.to); } catch (err) { console.error('[sword] stone sword', err); } }
      const fade = it.t > it.life - 0.6 ? (it.t - (it.life - 0.6)) / 0.6 : 0;
      if (it.landed) it.m.position.y = it.to.y - fade * 6 * it.s;
      it.m.userData.rune.opacity = 0.85 * (1 - fade);
      if (it.t >= it.life) { it.alive = false; it.m.visible = false; }
    }
  }
}

// ------------------------------------------------------------------ orbiting spectral blades (wind)
export class OrbitBlades {
  constructor(scene, n = 10, opts = {}) {
    // thin crescent air blade (alpha body), light leading edge via vertex colours
    const geo = new THREE.ConeGeometry(0.14, 1.5, 4, 1); geo.rotateX(Math.PI / 2); geo.scale(1, 0.35, 1);
    const R = rampOf(opts.game, 'wind');
    this.mat = new THREE.MeshBasicMaterial({ color: R.light, transparent: true, opacity: 0.6, depthWrite: false });
    this.mat.name = 'sword-orbit';
    opts.onMat?.(this.mat, 'line');
    this.mesh = tagFx(new THREE.InstancedMesh(geo, this.mat, n), 'sword-orbit');
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false;
    scene.add(this.mesh);
    this.n = n; this.active = 0; this.t = 0; this.time = 0; this.radius = 2.4; this.spin = 0; this.center = new THREE.Vector3();
    this.pos = Array.from({ length: n }, () => new THREE.Vector3());
  }
  start(count, duration, radius) { this.active = Math.min(this.n, count); this.t = duration; this.dur = duration; this.radius = radius; this.time = 0; }
  stop() { this.t = 0; }
  update(dt, center) {
    if (this.t <= 0) { if (this.mesh.visible) { this.mesh.count = 0; this.mesh.visible = false; } this.active = 0; return; }
    this.t -= dt; this.time += dt;
    this.center.copy(center);
    const n = this.active, intro = Math.min(1, this.time / 0.3), outro = Math.min(1, this.t / 0.3);
    const r = this.radius * (0.4 + 0.6 * intro) * (0.6 + 0.4 * outro);
    this.spin += dt * 7.5;
    for (let i = 0; i < n; i++) {
      const a = this.spin + (i / n) * Math.PI * 2;
      const y = 1.0 + Math.sin(this.time * 4 + i) * 0.25;
      this.pos[i].set(center.x + Math.sin(a) * r, center.y + y, center.z + Math.cos(a) * r);
      _e.set(0, a + Math.PI / 2, Math.sin(this.time * 5 + i) * 0.3);
      _q.setFromEuler(_e);
      _s.setScalar(0.8 + 0.4 * intro * outro);
      _m.compose(this.pos[i], _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = n; this.mesh.visible = n > 0;
    const im = this.mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    this.mat.opacity = 0.6 * outro;
  }
}

// ------------------------------------------------------------------ flame dragon (fire finisher): soft toon flame segments, no glowing spheres
export class Dragon {
  constructor(scene, n = 26, opts = {}) {
    this.seg = [];
    // a flame-tongue teardrop (lathe) instead of an icosahedron blob
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * (1 - t * 0.55) * 0.9, (t - 0.5) * 2.2)); }
    const geo = new THREE.LatheGeometry(pts, 10); geo.rotateX(-Math.PI / 2);
    const R = rampOf(opts.game, 'fire');
    this.mat = new THREE.MeshToonMaterial({ color: R.mid, emissive: R.dark, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, depthWrite: false });
    this.core = new THREE.MeshBasicMaterial({ color: R.light, transparent: true, opacity: 0.55, depthWrite: false });
    this.mat.name = 'sword-dragon'; this.core.name = 'sword-dragon-core';
    opts.onMat?.(this.mat, 'fill'); opts.onMat?.(this.core, 'line');
    this.mesh = tagFx(new THREE.InstancedMesh(geo, this.mat, n), 'sword-dragon'); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false;
    this.coreMesh = tagFx(new THREE.InstancedMesh(geo, this.core, n), 'sword-dragon-core'); this.coreMesh.frustumCulled = false; this.coreMesh.count = 0; this.coreMesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.coreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh, this.coreMesh);
    this.n = n; this.t = 0; this.dur = 0; this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.scale = 1;
    this.path = Array.from({ length: n }, () => new THREE.Vector3());
    this.head = new THREE.Vector3();
  }
  start(from, to, dur = 1.1, scale = 1) { this.from.copy(from); this.to.copy(to); this.t = 0; this.dur = dur; this.scale = scale; this.active = true; }
  _at(k, out) {
    // spiral arc from the hero up into the sky and down onto the target
    const x = this.from.x + (this.to.x - this.from.x) * k, z = this.from.z + (this.to.z - this.from.z) * k;
    const y = this.from.y + (this.to.y - this.from.y) * k + Math.sin(k * Math.PI) * 9 * this.scale;
    const sw = Math.sin(k * Math.PI * 3) * 3 * this.scale * (1 - k);
    const dx = this.to.x - this.from.x, dz = this.to.z - this.from.z, l = Math.hypot(dx, dz) || 1;
    return out.set(x - dz / l * sw, y, z + dx / l * sw);
  }
  update(dt) {
    if (!this.active) { if (this.mesh.visible) { this.mesh.count = 0; this.coreMesh.count = 0; this.mesh.visible = this.coreMesh.visible = false; } return; }
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    for (let i = 0; i < this.n; i++) {
      const kk = Math.max(0, k - i * 0.022);
      this._at(kk, this.path[i]);
      const s = this.scale * (i === 0 ? 1.4 : 1.15 * (1 - i / this.n) + 0.2) * (kk > 0 ? 1 : 0);
      // orient each tongue along the path (lean along motion)
      if (i > 0) { _v2.subVectors(this.path[i - 1], this.path[i]); if (_v2.lengthSq() > 1e-6) _q.setFromUnitVectors(_zf, _v2.normalize()); } else _q.identity();
      _s.set(s * 0.7, s * 0.7, s);
      _m.compose(this.path[i], _q, _s); this.mesh.setMatrixAt(i, _m);
      _s.multiplyScalar(0.45); _m.compose(this.path[i], _q, _s); this.coreMesh.setMatrixAt(i, _m);
    }
    this.head.copy(this.path[0]);
    this.mesh.count = this.n; this.coreMesh.count = this.n; this.mesh.visible = this.coreMesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.coreMesh.instanceMatrix.needsUpdate = true;
    if (k >= 1) { this.active = false; this.mesh.count = 0; this.coreMesh.count = 0; this.mesh.visible = this.coreMesh.visible = false; }
  }
}
const _zf = new THREE.Vector3(0, 0, 1);
