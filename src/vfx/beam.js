// Jagged lightning bolts / straight beams built as camera-facing quad strips (pooled).
import * as THREE from 'three';

const MAXP = 120;     // max points per bolt (main path + branches)
const MAXSTRIPS = 10;

const VERT = /* glsl */`
  attribute float aW;   // alpha/width factor along strip
  varying vec2 vUv; varying float vW;
  void main() {
    vUv = uv; vW = aW;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity, uCore;
  varying vec2 vUv; varying float vW;
  void main() {
    float d = abs(vUv.y * 2.0 - 1.0);
    float glow = pow(1.0 - d, 2.2);
    float core = smoothstep(uCore, uCore * 0.35, d);
    vec3 col = uColor * (glow * 1.5 + pow(1.0 - d, 8.0) * 0.6) + vec3(1.0) * core * 0.9;
    float a = uOpacity * vW;
    gl_FragColor = vec4(col * a, 1.0);
  }`;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p1 = new THREE.Vector3(),
  _p2 = new THREE.Vector3(), _side = new THREE.Vector3(), _view = new THREE.Vector3(), _tan = new THREE.Vector3(),
  _cam = new THREE.Vector3();

class Bolt {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 2 * 3);
    this.uv = new Float32Array(MAXP * 2 * 2);
    this.w = new Float32Array(MAXP * 2);
    this.idx = new Uint16Array(MAXP * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aW', new THREE.BufferAttribute(this.w, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 }, uCore: { value: 0.3 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 11; this.mesh.name = 'vfx-beam';
    scene.add(this.mesh);
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    // path buffers: points (x,y,z), width factor; strips: [start,count]
    this.px = new Float32Array(MAXP * 3); this.pw = new Float32Array(MAXP); this.pt = new Float32Array(MAXP);
    this.strips = new Int32Array(MAXSTRIPS * 2); this.nStrips = 0; this.nPts = 0;
    this.active = false; this.t = 0; this.dur = 0.2; this.rebuildT = 0; this.born = 0;
  }
}

export class Beams {
  constructor(game) {
    this.game = game;
    this.pool = [];
    for (let i = 0; i < 18; i++) this.pool.push(new Bolt(game.scene));
    this.serial = 0;
  }

  beam(from, to, opts = {}) {
    let b = null, oldest = this.pool[0];
    for (const x of this.pool) { if (!x.active) { b = x; break; } if (x.born < oldest.born) oldest = x; }
    if (!b) b = oldest;
    b.born = ++this.serial;
    b.from.copy(from); b.to.copy(to);
    b.width = opts.width ?? 0.35;
    b.dur = opts.duration ?? 0.25;
    b.jagged = opts.jagged ?? 1;
    const len = b.from.distanceTo(b.to);
    b.segments = Math.min(40, Math.max(2, opts.segments ?? Math.round(Math.min(32, 4 + len * 1.6))));
    b.branches = Math.min(MAXSTRIPS - 1, opts.branches ?? (b.jagged > 0 ? Math.min(4, Math.round(len / 3)) : 0));
    b.flicker = opts.flicker ?? (b.jagged > 0);
    b.material.uniforms.uColor.value.setHex(opts.color ?? 0xc9a4ff);
    b.material.uniforms.uCore.value = opts.core ?? 0.2;
    b.opacity = opts.opacity ?? 1;
    b.follow = opts.follow || null; // optional {from:Object3D,to:Object3D}
    b.t = 0; b.rebuildT = 0; b.active = true; b.mesh.visible = true;
    this._build(b);
    return { stop: () => { b.t = Math.max(b.t, b.dur * 0.7); }, setEnds: (f, t) => { b.from.copy(f); b.to.copy(t); } };
  }

  _path(b, ax, ay, az, bx, by, bz, segs, amp, wStart, wEnd) {
    if (b.nPts + segs + 1 > MAXP || b.nStrips >= MAXSTRIPS) return;
    const start = b.nPts;
    _d.set(bx - ax, by - ay, bz - az);
    // two perpendicular axes
    _p1.set(_d.y, -_d.x, 0); if (_p1.lengthSq() < 1e-6) _p1.set(0, _d.z, -_d.y);
    _p1.normalize(); _p2.crossVectors(_d, _p1).normalize();
    let ox = 0, oy = 0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const env = Math.sin(t * Math.PI);
      if (i > 0 && i < segs) { ox = ox * 0.35 + (Math.random() - 0.5) * 2; oy = oy * 0.35 + (Math.random() - 0.5) * 2; }
      else { ox = 0; oy = 0; }
      const k = amp * env;
      const j = b.nPts * 3;
      b.px[j] = ax + _d.x * t + (_p1.x * ox + _p2.x * oy) * k;
      b.px[j + 1] = ay + _d.y * t + (_p1.y * ox + _p2.y * oy) * k;
      b.px[j + 2] = az + _d.z * t + (_p1.z * ox + _p2.z * oy) * k;
      b.pw[b.nPts] = wStart + (wEnd - wStart) * t;
      b.pt[b.nPts] = t;
      b.nPts++;
    }
    b.strips[b.nStrips * 2] = start; b.strips[b.nStrips * 2 + 1] = segs + 1; b.nStrips++;
  }

  _build(b) {
    b.nPts = 0; b.nStrips = 0;
    const f = b.from, t = b.to;
    const len = f.distanceTo(t);
    const amp = b.jagged * len * 0.07;
    this._path(b, f.x, f.y, f.z, t.x, t.y, t.z, b.segments, amp, 1, b.jagged > 0 ? 0.75 : 1);
    for (let k = 0; k < b.branches; k++) {
      const si = 1 + Math.floor(Math.random() * (b.segments - 1));
      const j = si * 3;
      const sx = b.px[j], sy = b.px[j + 1], sz = b.px[j + 2];
      _a.set(t.x - f.x, t.y - f.y, t.z - f.z).normalize();
      _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      _a.addScaledVector(_b, 1.1).normalize();
      const bl = len * (0.15 + Math.random() * 0.25);
      this._path(b, sx, sy, sz, sx + _a.x * bl, sy + _a.y * bl, sz + _a.z * bl, 3 + Math.floor(Math.random() * 3), b.jagged * bl * 0.12, 0.55, 0.05);
    }
    this._mesh(b);
  }

  _mesh(b) {
    const cam = this.game.camera; cam.getWorldPosition(_cam);
    const P = b.pos, U = b.uv, W = b.w, I = b.idx;
    let vi = 0, ii = 0;
    for (let s = 0; s < b.nStrips; s++) {
      const st = b.strips[s * 2], n = b.strips[s * 2 + 1];
      const base = vi;
      for (let k = 0; k < n; k++) {
        const p = st + k, j = p * 3;
        const kn = Math.min(n - 1, k + 1), kp = Math.max(0, k - 1);
        _tan.set(b.px[(st + kn) * 3] - b.px[(st + kp) * 3], b.px[(st + kn) * 3 + 1] - b.px[(st + kp) * 3 + 1], b.px[(st + kn) * 3 + 2] - b.px[(st + kp) * 3 + 2]);
        _view.set(_cam.x - b.px[j], _cam.y - b.px[j + 1], _cam.z - b.px[j + 2]);
        _side.crossVectors(_tan, _view);
        const sl = _side.length() || 1;
        const w = b.width * (0.35 + 0.65 * b.pw[p]) * 0.5 / sl;
        const o = vi * 3;
        P[o] = b.px[j] + _side.x * w; P[o + 1] = b.px[j + 1] + _side.y * w; P[o + 2] = b.px[j + 2] + _side.z * w;
        P[o + 3] = b.px[j] - _side.x * w; P[o + 4] = b.px[j + 1] - _side.y * w; P[o + 5] = b.px[j + 2] - _side.z * w;
        U[vi * 2] = b.pt[p]; U[vi * 2 + 1] = 0; U[vi * 2 + 2] = b.pt[p]; U[vi * 2 + 3] = 1;
        const a = Math.min(1, b.pw[p] * 1.6);
        W[vi] = a; W[vi + 1] = a;
        vi += 2;
      }
      for (let k = 0; k < n - 1; k++) {
        const v0 = base + k * 2;
        I[ii++] = v0; I[ii++] = v0 + 1; I[ii++] = v0 + 2;
        I[ii++] = v0 + 1; I[ii++] = v0 + 3; I[ii++] = v0 + 2;
      }
    }
    const g = b.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.aW.needsUpdate = true;
    g.index.needsUpdate = true;
    g.setDrawRange(0, ii);
  }

  update(dt) {
    for (const b of this.pool) {
      if (!b.active) continue;
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) { b.active = false; b.mesh.visible = false; continue; }
      if (b.jagged > 0) {
        b.rebuildT -= dt;
        if (b.rebuildT <= 0) { b.rebuildT = 0.045; this._build(b); }
        else if (dt > 0) this._mesh(b);
      } else this._mesh(b);
      let o = b.opacity * (p < 0.08 ? 1 : 1 - Math.pow((p - 0.08) / 0.92, 1.5));
      if (b.flicker && dt > 0) o *= 0.55 + 0.45 * Math.random();
      b.material.uniforms.uOpacity.value = o;
    }
  }

  count() { let n = 0; for (const b of this.pool) n += b.active ? 1 : 0; return n; }
}
