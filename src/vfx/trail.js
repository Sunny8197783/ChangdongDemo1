// Ribbon trails following an Object3D: camera-facing, tapering width, fading alpha, additive.
import * as THREE from 'three';
import { FXB } from './budget.js';

const MAXP = 48;

const VERT = /* glsl */`
  attribute vec2 aT;  // x: 0 head..1 tail, y: side (0/1)
  varying vec2 vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying vec2 vT;
  void main() {
    float d = abs(vT.y * 2.0 - 1.0);
    float along = 1.0 - vT.x;
    float glow = pow(1.0 - d, 1.6);
    float core = smoothstep(0.35, 0.0, d) * pow(along, 2.0);
    vec3 col = uColor * glow * 1.6 + vec3(1.0) * core * 0.6;
    float a = uOpacity * pow(along, 1.3);
    gl_FragColor = vec4(col * a, 1.0);
  }`;

const _w = new THREE.Vector3(), _cam = new THREE.Vector3(), _tan = new THREE.Vector3(), _view = new THREE.Vector3(), _side = new THREE.Vector3();

class Ribbon {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.P = new Float32Array(MAXP * 2 * 3); this.T = new Float32Array(MAXP * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(this.T, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let k = 0; k < MAXP - 1; k++) { const v = k * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 10; this.mesh.name = 'vfx-trail';
    scene.add(this.mesh);
    this.px = new Float32Array(MAXP * 3); this.age = new Float32Array(MAXP); this.n = 0;
    this.active = false; this.stopped = false; this.follow = null; this.born = 0;
  }
}

export class Trails {
  constructor(game) {
    this.game = game; this.pool = [];
    for (let i = 0; i < 20; i++) this.pool.push(new Ribbon(game.scene));
    this.serial = 0;
    FXB.register(this.pool);
  }

  trail(object3D, opts = {}) {
    // quality budget (high 20 / medium 12 / low 7) and the global VFX budget: beyond them, recycle the oldest ribbon
    const q = this.game.settings?.values?.effectQuality || 'medium';
    const budget = q === 'high' ? 20 : q === 'low' ? 7 : 12;
    let r = null, oldest = null, active = 0;
    for (const x of this.pool) { if (x.active) { active++; if (!oldest || x.born < oldest.born) oldest = x; } else if (!r) r = x; }
    if (!r || (oldest && (active >= budget || !FXB.room(this.game)))) r = oldest || r || this.pool[0];
    r.born = ++this.serial;
    r.follow = object3D; r.active = true; r.stopped = false; r.n = 0;
    r.width = opts.width ?? 0.4;
    r.maxLen = opts.length ?? 4;          // meters
    r.fade = opts.fade ?? 0.35;           // seconds a point lives
    r.opacity = opts.opacity ?? 1;
    r.material.uniforms.uColor.value.setHex(opts.color ?? 0xffffff);
    r.material.uniforms.uOpacity.value = r.opacity;
    r.mesh.visible = false;
    const h = { stop: () => { if (r.handle === h) r.stopped = true; }, get alive() { return r.handle === h && r.active && !r.stopped; } };   // a recycled ribbon ignores its old owner
    r.handle = h;
    return h;
  }

  update(dt) {
    const cam = this.game.camera; cam.getWorldPosition(_cam);
    for (const r of this.pool) {
      if (!r.active) continue;
      // age & cull
      let n = r.n;
      for (let i = 0; i < n; i++) r.age[i] += dt;
      while (n > 0 && r.age[n - 1] > r.fade) n--;
      if (!r.stopped && r.follow) {
        if (!r.follow.parent) r.stopped = true;
        else {
          r.follow.getWorldPosition(_w);
          const dx = n ? _w.x - r.px[0] : 1, dy = n ? _w.y - r.px[1] : 0, dz = n ? _w.z - r.px[2] : 0;
          if (n < 2 || dx * dx + dy * dy + dz * dz > 0.008) {
            // shift points back, insert new head
            if (n >= MAXP) n = MAXP - 1;
            r.px.copyWithin(3, 0, n * 3); r.age.copyWithin(1, 0, n);
            n++;
          }
          r.px[0] = _w.x; r.px[1] = _w.y; r.px[2] = _w.z; r.age[0] = 0;
        }
      }
      // limit total length
      let total = 0;
      for (let i = 1; i < n; i++) {
        const j = i * 3, k = j - 3;
        const dx = r.px[j] - r.px[k], dy = r.px[j + 1] - r.px[k + 1], dz = r.px[j + 2] - r.px[k + 2];
        total += Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (total > r.maxLen) { n = i + 1; break; }
      }
      r.n = n;
      if (n < 2) {
        r.mesh.visible = false;
        if (r.stopped) r.active = false;
        continue;
      }
      r.mesh.visible = true;
      const P = r.P, T = r.T;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3;
        _tan.set(r.px[b] - r.px[a], r.px[b + 1] - r.px[a + 1], r.px[b + 2] - r.px[a + 2]);
        _view.set(_cam.x - r.px[j], _cam.y - r.px[j + 1], _cam.z - r.px[j + 2]);
        _side.crossVectors(_tan, _view);
        const t = i / (n - 1);
        const lifeT = Math.min(1, r.age[i] / r.fade);
        const along = Math.max(t, lifeT);
        const w = r.width * 0.5 * (1 - along * 0.85) / (_side.length() || 1);
        const o = i * 6;
        P[o] = r.px[j] + _side.x * w; P[o + 1] = r.px[j + 1] + _side.y * w; P[o + 2] = r.px[j + 2] + _side.z * w;
        P[o + 3] = r.px[j] - _side.x * w; P[o + 4] = r.px[j + 1] - _side.y * w; P[o + 5] = r.px[j + 2] - _side.z * w;
        T[i * 4] = along; T[i * 4 + 1] = 0; T[i * 4 + 2] = along; T[i * 4 + 3] = 1;
      }
      const g = r.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aT.needsUpdate = true;
      g.setDrawRange(0, (n - 1) * 6);
    }
  }

  count() { let c = 0; for (const r of this.pool) c += r.active ? 1 : 0; return c; }
}
