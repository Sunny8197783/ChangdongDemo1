// Sword-owned visual effects (all pooled, no per-frame allocation):
//  - SlashArcs: crescent slash meshes with an additive element-gradient + noise shader (vertex-shader built arcs)
//  - BladeTrail: Catmull-Rom smoothed ribbon swept between blade base and tip
//  - Spikes: instanced crystal / rock spikes erupting from the ground (ice lines, fissures, ice flower)
//  - StoneSwords: giant falling stone swords (대지의 심판)
//  - OrbitBlades: spectral wind blades orbiting the hero (폭풍 검진)
//  - Dragon: flame dragon made from a chain of glowing segments (종말의 화룡검)
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const _e = new THREE.Euler();

// ------------------------------------------------------------------ slash arcs
const ARC_VS = /* glsl */`
  uniform float uStart, uSpan, uRin, uRout;
  attribute vec2 aUV;
  varying vec2 vUV;
  void main() {
    vUV = aUV;
    float a = uStart + aUV.x * uSpan;
    // crescent: thick in the middle of the sweep, thin at the ends
    float w = 0.12 + 0.88 * pow(sin(3.14159 * aUV.x), 0.7);
    float r = mix(uRout - (uRout - uRin) * w, uRout, aUV.y);
    vec3 p = vec3(sin(a) * r, 0.0, cos(a) * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const ARC_FS = /* glsl */`
  uniform vec3 uColA, uColB; uniform float uProg, uFade, uTime, uNoise, uSeed;
  varying vec2 vUV;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = h(i.x + i.y * 57.0), b = h(i.x + 1.0 + i.y * 57.0), c = h(i.x + (i.y + 1.0) * 57.0), d = h(i.x + 1.0 + (i.y + 1.0) * 57.0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
  void main() {
    float u = vUV.x, v = vUV.y;
    float head = uProg * 1.15;
    if (u > head) discard;
    float tail = smoothstep(head - 1.0, head - 0.05, u);   // fades behind the sweeping head
    float headGlow = smoothstep(head - 0.22, head, u);
    float n = vn(vec2(u * 16.0 + uSeed, v * 2.5 - uTime * 5.0));
    float streak = 0.6 + 0.4 * vn(vec2(u * 46.0 - uTime * 2.0 + uSeed, v * 7.0));
    float body = mix(1.0, 0.35 + n * 1.1, uNoise) * streak;
    float rim = smoothstep(0.78, 0.97, v);                  // white-hot cutting edge
    float a = (0.22 + 0.78 * pow(v, 1.4)) * body + rim * 0.9;
    a *= tail * uFade * smoothstep(0.0, 0.12, v) * smoothstep(0.0, 0.06, u);
    vec3 col = mix(uColA * 1.7, uColB * 2.2, clamp(rim + headGlow * 0.5 * v, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

function arcGeometry(seg = 40, rings = 4) {
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
  constructor(scene, n = 18) {
    this.items = [];
    const geo = arcGeometry();
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uStart: { value: 0 }, uSpan: { value: 2 }, uRin: { value: 0.5 }, uRout: { value: 2 },
          uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() },
          uProg: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uNoise: { value: 0.5 }, uSeed: { value: 0 },
        },
        vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false,
        blending: THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 11;
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      this.items.push({ mesh, mat, t: 0, life: 0, sweep: 0.08, vel: new THREE.Vector3(), grow: 0, alive: false, born: 0 });
    }
    this.serial = 0;
  }
  /**
   * o: {pos, yaw, tilt (roll around forward), pitch, start, span (rad, signed), rin, rout, colA, colB,
   *     sweep (s to reveal), life (s total), noise, vel (Vector3), grow (scale/s)}
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
    u.uColA.value.setHex(o.colA ?? 0xff6a1f); u.uColB.value.setHex(o.colB ?? 0xffffff);
    u.uNoise.value = o.noise ?? 0.5; u.uSeed.value = Math.random() * 100;
    u.uProg.value = 0; u.uFade.value = o.opacity ?? 1;
    it.op = o.opacity ?? 1;
    it.t = 0; it.sweep = Math.max(0.01, o.sweep ?? 0.08); it.life = Math.max(it.sweep + 0.02, o.life ?? 0.24);
    it.vel.copy(o.vel || _v.set(0, 0, 0)); it.grow = o.grow || 0;
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
      u.uFade.value = it.op * (fadeT <= 0 ? 1 : Math.max(0, 1 - fadeT) ** 1.5);
      u.uTime.value = time;
      if (it.vel.lengthSq() > 0) it.mesh.position.addScaledVector(it.vel, dt);
      if (it.grow) it.mesh.scale.multiplyScalar(1 + it.grow * dt);
      if (it.t >= it.life) { it.alive = false; it.mesh.visible = false; }
    }
  }
  clear() { for (const it of this.items) { it.alive = false; it.mesh.visible = false; } }
}

// ------------------------------------------------------------------ blade ribbon trail
// DESIGN §9 A1: 16 samples from hilt and tip, Catmull-Rom to 31 points, a scrolling two-layer noise mask and a
// gradient-mapped element ramp (uColor saturated → uColB hot core near the edge). Per-weapon width / life / noise.
const TR_N = 16, TR_SUB = 2, TR_P = (TR_N - 1) * TR_SUB + 1;
const TRAIL_VS = /* glsl */`
  attribute vec2 aT; varying vec2 vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TRAIL_FS = /* glsl */`
  uniform vec3 uColor, uColB; uniform float uOpacity, uTime, uNoise, uEdge;
  varying vec2 vT; // x: 0 newest..1 oldest, y: 0 base..1 tip
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    float age = vT.x;
    float n1 = vn(vec2(age * 7.0 - uTime * 8.0, vT.y * 3.0));
    float n2 = vn(vec2(age * 15.0 + uTime * 3.0, vT.y * 8.0 + 3.1));
    float mask = mix(1.0, clamp(0.25 + n1 * 0.9 + n2 * 0.55, 0.0, 1.4), uNoise);
    float a = pow(1.0 - age, 1.4) * smoothstep(0.0, 0.45, vT.y) * uOpacity * 0.85 * mask;
    float hot = smoothstep(0.75, 1.0, vT.y) * (1.0 - age) * uEdge;
    vec3 ramp = mix(uColor * 1.6, uColB * 1.7, smoothstep(0.35, 0.98, vT.y) * (1.0 - age * 0.7));
    vec3 col = mix(ramp, vec3(2.0), clamp(hot * 0.8, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(a + hot * 0.3, 0.0, 1.0));
  }`;
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
}
export class BladeTrail {
  constructor(scene) {
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
      uniforms: { uColor: { value: new THREE.Color(0xff6a1f) }, uColB: { value: new THREE.Color(0xffe08a) }, uOpacity: { value: 1 },
        uTime: { value: 0 }, uNoise: { value: 0.55 }, uEdge: { value: 1 } },
      vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.geo = g;
    this.maxAge = 0.16; this.width = 1; this.time = 0;
    this._b = new THREE.Vector3();
  }
  setColor(hex, hexB) { this.mat.uniforms.uColor.value.setHex(hex); if (hexB != null) this.mat.uniforms.uColB.value.setHex(hexB); }
  /** Per-weapon look: {width (×hilt→tip span; >1 reaches past the hilt), life (s), noise (0..1), edge (white-hot rim)}. */
  setProfile(o) {
    if (!o) return;
    this.width = o.width ?? 1; this.maxAge = o.life ?? 0.16;
    this.mat.uniforms.uNoise.value = o.noise ?? 0.55; this.mat.uniforms.uEdge.value = o.edge ?? 1;
  }
  /** active: emit samples this frame. */
  update(dt, active, basePos, tipPos) {
    this.time += dt; this.mat.uniforms.uTime.value = this.time;
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
    // collapse unused tail onto last point
    for (let i = k; i < TR_P; i++) { for (let c = 0; c < 6; c++) P[i * 6 + c] = P[(k - 1) * 6 + c]; T[i * 4] = 1; T[i * 4 + 2] = 1; }
    this.geo.attributes.position.needsUpdate = true; this.aT.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (pts - 1) * 6));
  }
  clear() { this.n = 0; this.mesh.visible = false; }
}

// ------------------------------------------------------------------ instanced ground spikes
export class Spikes {
  /** kind: 'ice' | 'rock' | 'crystal' (tinted per instance: thorns, light crystals, shadow spikes; one draw call). */
  constructor(scene, kind, n = 48) {
    const ice = kind === 'ice';
    const crystal = kind === 'crystal';
    const geo = ice ? new THREE.ConeGeometry(0.35, 1, 5, 1) : new THREE.ConeGeometry(0.45, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    if (!ice) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * (0.8 + 0.4 * Math.abs(Math.sin(i * 12.9)))); } geo.computeVertexNormals(); }
    const mat = ice
      ? new THREE.MeshToonMaterial({ color: 0xbff4ff, emissive: 0x2a8cc0, emissiveIntensity: 0.9, transparent: true, opacity: 0.88 })
      : crystal ? new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x2a2a2a, emissiveIntensity: 0.6 })
        : new THREE.MeshToonMaterial({ color: 0xb88a5a, emissive: 0x3a2412, emissiveIntensity: 0.4 });
    mat.flatShading = true;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.crystal = crystal;
    if (crystal) {
      // CONTRACT §23: tinted instanced meshes set an instance colour at construction (no recompile on the first tint)
      const c = new THREE.Color(0xffffff);
      for (let i = 0; i < n; i++) this.mesh.setColorAt(i, c);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.mesh.instanceColor.needsUpdate = true;
      this._col = new THREE.Color();
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = !ice; this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = Array.from({ length: n }, () => ({ alive: false, pos: new THREE.Vector3(), h: 1, w: 1, t: 0, delay: 0, life: 1, yaw: 0, tiltX: 0, tiltZ: 0, color: 0xffffff }));
    this.ice = ice;
  }
  spawn(pos, h, w, delay = 0, life = 1.6, tilt = 0.25, color = 0xffffff) {
    let it = null;
    for (const x of this.items) if (!x.alive) { it = x; break; }
    if (!it) { it = this.items[0]; for (const x of this.items) if (x.t > it.t) it = x; }
    it.alive = true; it.pos.copy(pos); it.h = h; it.w = w; it.t = -delay; it.life = life; it.color = color;
    it.yaw = Math.random() * 6.28; it.tiltX = (Math.random() - 0.5) * tilt * 2; it.tiltZ = (Math.random() - 0.5) * tilt * 2;
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
      _s.set(it.w, Math.max(0.01, sy), it.w);
      _v.copy(it.pos); _v.y -= sink * it.h * 0.3;
      _m.compose(_v, _q, _s);
      if (this.crystal) this.mesh.setColorAt(c, this._col.setHex(it.color));
      this.mesh.setMatrixAt(c++, _m);
    }
    this.mesh.count = c;
    if (c) { this.mesh.instanceMatrix.needsUpdate = true; if (this.crystal) this.mesh.instanceColor.needsUpdate = true; }
  }
}

// ------------------------------------------------------------------ giant stone swords
function stoneSwordMesh() {
  const g = new THREE.Group();
  const stone = new THREE.MeshToonMaterial({ color: 0xc9a77a, emissive: 0x3b2410, emissiveIntensity: 0.5 });
  stone.flatShading = true;
  const rune = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const blade = new THREE.CylinderGeometry(0.0, 1, 8, 4, 1); blade.scale(1, 1, 0.3); blade.rotateY(Math.PI / 4); blade.translate(0, -4, 0); // tip down at y=-8
  const bm = new THREE.Mesh(blade, stone); bm.castShadow = true; g.add(bm);
  const guard = new THREE.BoxGeometry(4.2, 0.7, 0.9); const gm = new THREE.Mesh(guard, stone); gm.position.y = 0.3; gm.castShadow = true; g.add(gm);
  const grip = new THREE.CylinderGeometry(0.35, 0.4, 2.4, 6); const gr = new THREE.Mesh(grip, stone); gr.position.y = 1.85; g.add(gr);
  const pom = new THREE.IcosahedronGeometry(0.65, 0); const pm = new THREE.Mesh(pom, stone); pm.position.y = 3.3; g.add(pm);
  const rg = new THREE.PlaneGeometry(0.35, 6.5); rg.translate(0, -3.6, 0.17);
  const r1 = new THREE.Mesh(rg, rune); g.add(r1);
  const r2 = new THREE.Mesh(rg, rune); r2.rotation.y = Math.PI; g.add(r2);
  g.visible = false;
  g.userData.rune = rune;
  return g;
}
export class StoneSwords {
  constructor(scene, n = 3) {
    this.items = [];
    for (let i = 0; i < n; i++) { const m = stoneSwordMesh(); scene.add(m); this.items.push({ m, alive: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), fall: 0.45, life: 3, onLand: null, landed: false, s: 1 }); }
  }
  spawn(target, scale = 1, fall = 0.45, onLand = null) {
    const it = this.items.find((x) => !x.alive) || this.items[0];
    it.alive = true; it.t = 0; it.landed = false; it.fall = fall; it.onLand = onLand; it.s = scale;
    it.to.copy(target); it.to.y += 2.2 * scale; // embed tip into the ground
    it.from.copy(it.to); it.from.y += 26;
    it.m.scale.setScalar(scale); it.m.position.copy(it.from); it.m.rotation.set(0, Math.random() * 3, 0.06);
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
      it.m.userData.rune.opacity = 0.9 * (1 - fade) * (0.7 + 0.3 * Math.sin(it.t * 20));
      if (it.t >= it.life) { it.alive = false; it.m.visible = false; }
    }
  }
}

// ------------------------------------------------------------------ orbiting spectral blades
export class OrbitBlades {
  constructor(scene, n = 10) {
    const geo = new THREE.ConeGeometry(0.14, 1.5, 4, 1); geo.rotateX(Math.PI / 2); geo.scale(1, 0.35, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xa8ffd6, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.n = n; this.active = 0; this.t = 0; this.time = 0; this.radius = 2.4; this.spin = 0; this.center = new THREE.Vector3();
    this.pos = Array.from({ length: n }, () => new THREE.Vector3());
  }
  start(count, duration, radius) { this.active = Math.min(this.n, count); this.t = duration; this.dur = duration; this.radius = radius; this.time = 0; }
  stop() { this.t = 0; }
  update(dt, center) {
    if (this.t <= 0) { this.mesh.count = 0; this.active = 0; return; }
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
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mat.opacity = 0.85 * outro;
  }
}

// ------------------------------------------------------------------ flame dragon
export class Dragon {
  constructor(scene, n = 26) {
    this.seg = [];
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.core = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.coreMesh = new THREE.InstancedMesh(geo, this.core, n); this.coreMesh.frustumCulled = false; this.coreMesh.count = 0;
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
    if (!this.active) { this.mesh.count = 0; this.coreMesh.count = 0; return; }
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    for (let i = 0; i < this.n; i++) {
      const kk = Math.max(0, k - i * 0.022);
      this._at(kk, this.path[i]);
      const s = this.scale * (i === 0 ? 1.4 : 1.15 * (1 - i / this.n) + 0.2) * (kk > 0 ? 1 : 0);
      _q.identity(); _s.setScalar(s);
      _m.compose(this.path[i], _q, _s); this.mesh.setMatrixAt(i, _m);
      _s.setScalar(s * 0.55); _m.compose(this.path[i], _q, _s); this.coreMesh.setMatrixAt(i, _m);
    }
    this.head.copy(this.path[0]);
    this.mesh.count = this.n; this.coreMesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true; this.coreMesh.instanceMatrix.needsUpdate = true;
    if (k >= 1) { this.active = false; this.mesh.count = 0; this.coreMesh.count = 0; }
  }
}

/** One instance of every material so renderer.compile() can pre-warm the shaders. */
export function warmGroup(fx) {
  const g = new THREE.Group();
  const items = [fx.arcs.items[0].mesh, fx.trail.mesh, fx.iceSpikes.mesh, fx.rockSpikes.mesh, fx.orbit.mesh, fx.dragon.mesh, fx.dragon.coreMesh, ...fx.stones.items.map((x) => x.m)];
  return { g, items };
}
