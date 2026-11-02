// CPU-simulated, GPU-billboarded particle system using instanced quads.
// Supports per-particle color-over-life, size-over-life, alpha fade, rotation, atlas frame,
// velocity-stretched quads, gravity, drag, swirl (curl around a vertical axis) and ground collision.
import * as THREE from 'three';
import { ATLAS_COLS } from './textures.js';

const VERT = /* glsl */`
  attribute vec4 iPos;    // xyz, size
  attribute vec4 iVel;    // xyz velocity, stretch factor
  attribute vec4 iCol;    // rgb, alpha
  attribute vec2 iMisc;   // rotation, frame
  varying vec2 vUv;
  varying vec4 vCol;
  uniform float uCols;
  #include <fog_pars_vertex>
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
    vec2 corner = position.xy; // -0.5..0.5
    float size = iPos.w;
    vec2 q;
    if (iVel.w > 0.0) {
      // orient along projected velocity, stretch by speed
      vec3 vv = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xyz;
      // perspective-correct direction of motion on screen
      vec2 dir = vv.xy - mv.xy * (vv.z / min(mv.z, -0.01));
      float l = length(dir);
      dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
      float stretch = 1.0 + length(iVel.xyz) * iVel.w;
      vec2 nrm = vec2(-dir.y, dir.x);
      q = dir * corner.x * size * stretch + nrm * corner.y * size;
    } else {
      float c = cos(iMisc.x), s = sin(iMisc.x);
      q = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
    }
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
    float f = iMisc.y;
    vec2 cell = vec2(mod(f, uCols), floor(f / uCols));
    vec2 uv = position.xy + 0.5;
    vUv = (cell + vec2(uv.x, 1.0 - uv.y)) / uCols;
    vUv.y = 1.0 - vUv.y;
    vCol = iCol;
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uAdditive, uBoost;
  varying vec2 vUv;
  varying vec4 vCol;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a * vCol.a;
    if (a < 0.003) discard;
    vec3 col = vCol.rgb * t.rgb;
    if (uAdditive > 0.5) {
      // hot core: brightest part of the texture pushes toward white
      float core = smoothstep(0.6, 1.0, t.a) * min(vCol.a, 1.0);
      col = mix(col, vec3(1.0), core * 0.2);
      gl_FragColor = vec4(col * a * uBoost, 1.0);
    } else {
      gl_FragColor = vec4(col, a);
    }
    vec3 pre = gl_FragColor.rgb;
    #include <fog_fragment>
    #ifdef USE_FOG
      if (uAdditive > 0.5) gl_FragColor.rgb = pre * (1.0 - fogFactor);
    #endif
  }`;

const FIELDS = 26;
// field offsets in the SoA-in-AoS float buffer
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9,
  R0 = 10, G0 = 11, B0 = 12, R1 = 13, G1 = 14, B1 = 15, AMAX = 16, ROT = 17, ROTV = 18,
  FRAME = 19, GRAV = 20, DRAG = 21, STRETCH = 22, FADEIN = 23, CURL = 24, FLAGS = 25;
// flags bits
export const F_GROUND = 1, F_FLICKER = 2, F_SWAY = 4;

export class ParticleSystem {
  constructor(game, texture, { capacity = 4000, additive = true, renderOrder = 10 } = {}) {
    this.game = game;
    this.cap = capacity;
    this.count = 0;
    this.cursor = 0;
    this.data = new Float32Array(capacity * FIELDS);
    this.cx = new Float32Array(capacity); // swirl center x,z
    this.cz = new Float32Array(capacity);

    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage); return a;
    };
    this.aPos = mk(4); this.aVel = mk(4); this.aCol = mk(4); this.aMisc = mk(2);
    quad.setAttribute('iPos', this.aPos); quad.setAttribute('iVel', this.aVel);
    quad.setAttribute('iCol', this.aCol); quad.setAttribute('iMisc', this.aMisc);
    quad.instanceCount = 0;
    this._attrs = [this.aPos, this.aVel, this.aCol, this.aMisc];
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = quad;

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: texture }, uCols: { value: ATLAS_COLS }, uAdditive: { value: additive ? 1 : 0 }, uBoost: { value: 1.25 },
      }]),
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: true,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    });
    this.material.uniforms.map.value = texture;
    if (additive) {
      // premultiplied additive: src*1 + dst*1
      this.material.blendSrc = THREE.OneFactor; this.material.blendDst = THREE.OneFactor;
      this.material.blendEquation = THREE.AddEquation;
    }
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = additive ? 'vfx-additive' : 'vfx-alpha';
    game.scene.add(this.mesh);
  }

  /** Allocate a particle slot; recycles round-robin when full. Returns base offset. */
  alloc() {
    let i;
    if (this.count < this.cap) i = this.count++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.cap; }
    return i;
  }

  /**
   * Spawn one particle. Arguments are plain numbers to avoid allocation.
   * c0/c1: THREE.Color (start/end), frame: atlas index.
   */
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, alpha, frame, grav, drag, stretch, rot, rotv, fadeIn, curl, cx, cz, flags) {
    const i = this.alloc();
    const d = this.data, o = i * FIELDS;
    d[o + PX] = x; d[o + PY] = y; d[o + PZ] = z;
    d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
    d[o + AGE] = 0; d[o + LIFE] = Math.max(0.01, life);
    d[o + S0] = s0; d[o + S1] = s1;
    d[o + R0] = c0.r; d[o + G0] = c0.g; d[o + B0] = c0.b;
    d[o + R1] = c1.r; d[o + G1] = c1.g; d[o + B1] = c1.b;
    d[o + AMAX] = alpha; d[o + ROT] = rot; d[o + ROTV] = rotv; d[o + FRAME] = frame;
    d[o + GRAV] = grav; d[o + DRAG] = drag; d[o + STRETCH] = stretch; d[o + FADEIN] = fadeIn;
    d[o + CURL] = curl; d[o + FLAGS] = flags;
    this.cx[i] = cx; this.cz[i] = cz;
    return i;
  }

  _kill(i) {
    const last = --this.count;
    if (i !== last) {
      this.data.copyWithin(i * FIELDS, last * FIELDS, last * FIELDS + FIELDS);
      this.cx[i] = this.cx[last]; this.cz[i] = this.cz[last];
    }
    if (this.cursor >= this.count) this.cursor = 0;
  }

  update(dt, getHeight, time) {
    const d = this.data;
    const P = this.aPos.array, V = this.aVel.array, C = this.aCol.array, M = this.aMisc.array;
    let i = 0;
    while (i < this.count) {
      const o = i * FIELDS;
      let age = d[o + AGE] + dt;
      const life = d[o + LIFE];
      if (age >= life) { this._kill(i); continue; }
      d[o + AGE] = age;
      let vx = d[o + VX], vy = d[o + VY], vz = d[o + VZ];
      if (dt > 0) {
        const drag = d[o + DRAG];
        if (drag > 0) { const k = Math.exp(-drag * dt); vx *= k; vy *= k; vz *= k; }
        vy -= d[o + GRAV] * dt;
        const curl = d[o + CURL];
        if (curl !== 0) {
          // rotate velocity around vertical axis and add slight inward pull to orbit swirl center
          const a = curl * dt, c = Math.cos(a), s = Math.sin(a);
          const nx = vx * c - vz * s, nz = vx * s + vz * c; vx = nx; vz = nz;
          const dx = this.cx[i] - d[o + PX], dz = this.cz[i] - d[o + PZ];
          const pull = Math.abs(curl) * 0.35 * dt;
          vx += dx * pull; vz += dz * pull;
        }
        const flags = d[o + FLAGS];
        if (flags & F_SWAY) { vx += Math.sin(time * 3 + i) * 2.2 * dt; vz += Math.cos(time * 2.3 + i * 1.7) * 2.2 * dt; }
        let px = d[o + PX] + vx * dt, py = d[o + PY] + vy * dt, pz = d[o + PZ] + vz * dt;
        if ((flags & F_GROUND) && getHeight) {
          const h = getHeight(px, pz) + 0.04;
          if (py < h) { py = h; vy = Math.abs(vy) * 0.3; vx *= 0.6; vz *= 0.6; if (flags & F_SWAY) { vx *= 0.2; vz *= 0.2; vy = 0; } }
        }
        d[o + PX] = px; d[o + PY] = py; d[o + PZ] = pz;
        d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
        d[o + ROT] += d[o + ROTV] * dt;
      }
      const t = age / life;
      // alpha: fade in then smooth fade out
      const fi = d[o + FADEIN];
      const ft = t < 0.35 ? 0 : (t - 0.35) / 0.65;
      let a = d[o + AMAX] * (fi > 0 && t < fi ? t / fi : 1) * (1 - ft * ft * (3 - 2 * ft));
      if (d[o + FLAGS] & F_FLICKER) a *= 0.6 + 0.4 * Math.sin(age * 45 + i * 3.1);
      const st = 1 - (1 - t) * (1 - t);
      const size = d[o + S0] + (d[o + S1] - d[o + S0]) * st;
      const j4 = i * 4, j2 = i * 2;
      P[j4] = d[o + PX]; P[j4 + 1] = d[o + PY]; P[j4 + 2] = d[o + PZ]; P[j4 + 3] = size;
      V[j4] = vx; V[j4 + 1] = vy; V[j4 + 2] = vz; V[j4 + 3] = d[o + STRETCH];
      const ct = t < 0.85 ? t / 0.85 : 1;
      C[j4] = d[o + R0] + (d[o + R1] - d[o + R0]) * ct;
      C[j4 + 1] = d[o + G0] + (d[o + G1] - d[o + G0]) * ct;
      C[j4 + 2] = d[o + B0] + (d[o + B1] - d[o + B0]) * ct;
      C[j4 + 3] = a > 0 ? a : 0;
      M[j2] = d[o + ROT]; M[j2 + 1] = d[o + FRAME];
      i++;
    }
    const n = this.count;
    this.geometry.instanceCount = n;
    const attrs = this._attrs;
    for (let k = 0; k < attrs.length; k++) {
      const attr = attrs[k];
      attr.clearUpdateRanges(); if (n > 0) { attr.addUpdateRange(0, n * attr.itemSize); attr.needsUpdate = true; }
    }
    this.mesh.visible = n > 0;
  }
}
