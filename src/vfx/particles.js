// CPU-simulated, GPU-billboarded particles (v4, PLAN §3.4 SP / §9 vfx P0-B(1)). Owner: vfx.
// ONE premultiplied instanced mesh per owner group (player | other = enemy + world): additive and normal particles share the
// draw call (additive particles output alpha 0 under ONE / ONE_MINUS_SRC_ALPHA). Per particle: colour over life, size over
// life, rotation, atlas frame, velocity stretch, gravity, drag, swirl, ground collision, castId, a duck factor (fxMulAt once
// per frame, player only) and a projected-size clamp in the vertex shader (12 % of screen height for soft / smoke / puff /
// glow / flare, 20 % otherwise). uBoost 1.0, no push toward white. Live-range uploads only.
import * as THREE from 'three';
import { ATLAS_COLS } from './textures.js';

const VERT = /* glsl */`
  attribute vec4 iPos;    // xyz, size
  attribute vec4 iVel;    // xyz velocity, stretch factor
  attribute vec4 iCol;    // rgb, alpha (duck folded in)
  attribute vec2 iMisc;   // rotation, frame code (frame + 64·additive + 128·soft + 256·styled)
  varying vec2 vUv; varying vec4 vCol; varying float vAdd; varying float vStyled;
  uniform float uCols, uSoftMul, uSizeMul;
  #include <fog_pars_vertex>
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
    float code = iMisc.y;
    float styled = step(255.5, code); code -= styled * 256.0;
    float soft = step(127.5, code); code -= soft * 128.0;
    vec2 corner = soft > 0.5 ? position.xy : sign(position.xy) * 0.5;
    float add = step(63.5, code); code -= add * 64.0;
    float zc = max(-mv.z, 0.05);
    float size = iPos.w * mix(uSizeMul, uSoftMul, soft);
    float maxS = mix(0.20, 0.12, soft) * 2.0 * zc / projectionMatrix[1][1];
    size = min(size, maxS);
    vec2 q;
    if (iVel.w > 0.0) {
      vec3 vv = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xyz;
      vec2 dir = vv.xy - mv.xy * (vv.z / min(mv.z, -0.01));
      float l = length(dir);
      dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
      float stretch = min(1.0 + length(iVel.xyz) * iVel.w, maxS * 1.2 / max(size, 1e-4));
      vec2 nrm = vec2(-dir.y, dir.x);
      q = dir * corner.x * size * max(stretch, 1.0) + nrm * corner.y * size;
    } else {
      float c = cos(iMisc.x), s = sin(iMisc.x);
      q = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
    }
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
    vec2 cell = vec2(mod(code, uCols), floor(code / uCols));
    vec2 uv = corner + 0.5;
    vUv = (cell + vec2(uv.x, 1.0 - uv.y)) / uCols;
    vUv.y = 1.0 - vUv.y;
    vCol = iCol; vAdd = add; vStyled = styled;
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uBoost;
  varying vec2 vUv; varying vec4 vCol; varying float vAdd; varying float vStyled;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a * vCol.a;
    if (a < 0.003) discard;
    vec3 col = vCol.rgb * t.rgb;
    if (vStyled > 0.5) col = mix(col, col * 0.16, smoothstep(0.35, 0.9, t.a));   // enemy style: dark core, element rim
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #ifdef USE_FOG
      if (vAdd > 0.5) gl_FragColor.rgb = col * (1.0 - fogFactor);
    #endif
    gl_FragColor = vAdd > 0.5 ? vec4(gl_FragColor.rgb * a * uBoost, 0.0) : vec4(gl_FragColor.rgb * a, a);
  }`;

const FIELDS = 28;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9,
  R0 = 10, G0 = 11, B0 = 12, R1 = 13, G1 = 14, B1 = 15, AMAX = 16, ROT = 17, ROTV = 18,
  FRAME = 19, GRAV = 20, DRAG = 21, STRETCH = 22, FADEIN = 23, CURL = 24, FLAGS = 25, CAST = 26, KIND = 27;
export const F_GROUND = 1, F_FLICKER = 2, F_SWAY = 4;
export const K_ADD = 1, K_SOFT = 2, K_STYLED = 4;
const _pp = { x: 0, y: 0, z: 0 };

export class ParticleSystem {
  constructor(game, texture, { capacity = 2000, renderOrder = 11, owner = 'player', duck = null, castTable = null } = {}) {
    this.game = game;
    this.cap = capacity;           // hard capacity (allocated)
    this.limit = capacity;         // live cap (budget), set every frame by vfx
    this.addLimit = capacity;
    this.count = 0; this.addCount = 0;
    this.owner = owner; this.duck = duck; this.castTable = castTable;
    this.data = new Float32Array(capacity * FIELDS);
    this.cx = new Float32Array(capacity); this.cz = new Float32Array(capacity);
    this.dropped = 0; this.spawned = 0; this.coverage = 0; this.softCoverage = 0; this.peak = 0;
    const quad = new THREE.InstancedBufferGeometry();
    // P1: octagon inscribed in the unit quad (flat sides on the quad edges, contains the r = 0.5 circle): soft sprites draw ~17 %
    // fewer fragments; every other frame snaps the 8 vertices to the 4 quad corners in the vertex shader (a plain quad)
    const oct = [];
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4, r = 0.5 / Math.cos(Math.PI / 8); oct.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
    quad.setAttribute('position', new THREE.Float32BufferAttribute(oct, 3));
    quad.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7]);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(4); this.aVel = mk(4); this.aCol = mk(4); this.aMisc = mk(2);
    quad.setAttribute('iPos', this.aPos); quad.setAttribute('iVel', this.aVel);
    quad.setAttribute('iCol', this.aCol); quad.setAttribute('iMisc', this.aMisc);
    quad.instanceCount = 0;
    this._attrs = [this.aPos, this.aVel, this.aCol, this.aMisc];
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = quad;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: texture }, uCols: { value: ATLAS_COLS }, uBoost: { value: 1.0 }, uSoftMul: { value: 1 }, uSizeMul: { value: 1 },
      }]),
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.material.uniforms.map.value = texture;
    this.material.name = owner === 'player' ? 'vfx-particles' : 'vfx-particles-enemy';
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = owner === 'player' ? 'vfx-particles' : 'vfx-particles-enemy';
    this.mesh.userData.owner = owner === 'player' ? 'player' : 'enemy';
    this.mesh.matrixAutoUpdate = false;
    game.scene.add(this.mesh);
  }

  /** Room for one more particle of this kind under the live caps. */
  room(additive) { return this.count < Math.min(this.limit, this.cap) && (!additive || this.addCount < this.addLimit); }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, alpha, frame, grav, drag, stretch, rot, rotv, fadeIn, curl, cx, cz, flags, kind = 0, castId = 0) {
    if (!this.room(kind & K_ADD)) { this.dropped++; return -1; }
    const i = this.count++;
    if (kind & K_ADD) this.addCount++;
    if (this.count > this.peak) this.peak = this.count;
    this.spawned++;
    const d = this.data, o = i * FIELDS;
    d[o + PX] = x; d[o + PY] = y; d[o + PZ] = z;
    d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
    d[o + AGE] = 0; d[o + LIFE] = Math.max(0.01, life);
    d[o + S0] = s0; d[o + S1] = s1;
    d[o + R0] = c0.r; d[o + G0] = c0.g; d[o + B0] = c0.b;
    d[o + R1] = c1.r; d[o + G1] = c1.g; d[o + B1] = c1.b;
    d[o + AMAX] = alpha; d[o + ROT] = rot; d[o + ROTV] = rotv; d[o + FRAME] = frame;
    d[o + GRAV] = grav; d[o + DRAG] = drag; d[o + STRETCH] = stretch; d[o + FADEIN] = fadeIn;
    d[o + CURL] = curl; d[o + FLAGS] = flags; d[o + CAST] = castId; d[o + KIND] = kind;
    this.cx[i] = cx; this.cz[i] = cz;
    return i;
  }

  _kill(i) {
    const d = this.data;
    if (d[i * FIELDS + KIND] & K_ADD) this.addCount--;
    const last = --this.count;
    if (i !== last) {
      d.copyWithin(i * FIELDS, last * FIELDS, last * FIELDS + FIELDS);
      this.cx[i] = this.cx[last]; this.cz[i] = this.cz[last];
    }
  }

  clear() { this.count = 0; this.addCount = 0; }

  /** proj = {cx, cy, cz, fx, fy, fz, p00, p11} camera position / forward + projection (coverage estimate). */
  update(dt, getHeight, time, proj) {
    const d = this.data;
    const P = this.aPos.array, V = this.aVel.array, C = this.aCol.array, M = this.aMisc.array;
    const duck = this.duck, ct = this.castTable;
    const softMul = this.material.uniforms.uSoftMul.value, sizeMul = this.material.uniforms.uSizeMul.value;
    let cov = 0, covSoft = 0;
    const k4 = proj ? proj.p00 * proj.p11 * 0.25 * 0.7 : 0;   // (soft sprites: octagon ≈ 0.83 of the quad, × discard)
    let i = 0;
    while (i < this.count) {
      const o = i * FIELDS;
      const age = d[o + AGE] + dt;
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
      const fi = d[o + FADEIN];
      const ft = t < 0.35 ? 0 : (t - 0.35) / 0.65;
      let a = d[o + AMAX] * (fi > 0 && t < fi ? t / fi : 1) * (1 - ft * ft * (3 - 2 * ft));
      if (d[o + FLAGS] & F_FLICKER) a *= 0.6 + 0.4 * Math.sin(age * 45 + i * 3.1);
      const kind = d[o + KIND];
      if (duck) { _pp.x = d[o + PX]; _pp.y = d[o + PY]; _pp.z = d[o + PZ]; a *= duck(_pp); }
      const st = 1 - (1 - t) * (1 - t);
      const size = d[o + S0] + (d[o + S1] - d[o + S0]) * st;
      const j4 = i * 4, j2 = i * 2;
      P[j4] = d[o + PX]; P[j4 + 1] = d[o + PY]; P[j4 + 2] = d[o + PZ]; P[j4 + 3] = size;
      V[j4] = vx; V[j4 + 1] = vy; V[j4 + 2] = vz; V[j4 + 3] = d[o + STRETCH];
      const ctt = t < 0.85 ? t / 0.85 : 1;
      C[j4] = d[o + R0] + (d[o + R1] - d[o + R0]) * ctt;
      C[j4 + 1] = d[o + G0] + (d[o + G1] - d[o + G0]) * ctt;
      C[j4 + 2] = d[o + B0] + (d[o + B1] - d[o + B0]) * ctt;
      C[j4 + 3] = a > 0 ? a : 0;
      M[j2] = d[o + ROT]; M[j2 + 1] = d[o + FRAME] + ((kind & K_ADD) ? 64 : 0) + ((kind & K_SOFT) ? 128 : 0) + ((kind & K_STYLED) ? 256 : 0);
      // coverage estimate (screens): quad area × projected density, after the projected-size clamp
      if (proj && a > 0.004) {
        const z = (d[o + PX] - proj.cx) * proj.fx + (d[o + PY] - proj.cy) * proj.fy + (d[o + PZ] - proj.cz) * proj.fz;
        if (z > 0.05) {
          const soft = kind & K_SOFT;
          let s = size * (soft ? softMul : sizeMul);
          const maxS = (soft ? 0.12 : 0.20) * 2 * z / proj.p11;
          if (s > maxS) s = maxS;
          let str = 1; const sf = d[o + STRETCH];
          if (sf > 0) { str = Math.min(1 + Math.sqrt(vx * vx + vy * vy + vz * vz) * sf, maxS * 1.2 / Math.max(s, 1e-4)); if (str < 1) str = 1; }
          const c = s * s * str * k4 / (z * z);
          cov += c; if (soft) covSoft += c;
          const cid = d[o + CAST];
          if (cid > 0 && ct) ct.cover(cid, c);
        }
      }
      i++;
    }
    this.coverage = cov; this.softCoverage = covSoft;
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
