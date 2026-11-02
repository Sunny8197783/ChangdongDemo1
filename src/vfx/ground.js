// Terrain-conforming shockwave rings, spherical domes and ground decals (pooled).
import * as THREE from 'three';

const GRID = 18;

const RING_VERT = /* glsl */`
  varying vec2 vL;
  #include <fog_pars_vertex>
  void main() {
    vL = uv * 2.0 - 1.0;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const RING_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uProg, uOpacity, uThick, uAdd;
  varying vec2 vL;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vL);
    float p = 1.0 - pow(1.0 - uProg, 3.0);      // ease-out expansion
    float R = 0.04 + 0.96 * p;
    float w = uThick * (0.6 + 0.6 * p);
    float d = R - r;                            // >0 inside
    float outer = smoothstep(-0.025, 0.0, d);    // crisp leading edge
    float inner = d > 0.0 ? pow(clamp(1.0 - d / w, 0.0, 1.0), 2.2) : 1.0;
    float band = outer * inner;
    float fill = (d > 0.0 ? 0.10 * (1.0 - r / max(R, 1e-3)) : 0.0) * (1.0 - p);
    float fade = pow(1.0 - uProg, 1.4);
    float a = (band + fill) * fade * uOpacity;
    // angular streak breakup for a painterly edge
    float ang = atan(vL.y, vL.x);
    a *= 0.8 + 0.2 * sin(ang * 23.0 + r * 9.0) * sin(ang * 7.0 - 1.3);
    if (a < 0.003) discard;
    vec3 col = mix(uColor, vec3(1.0), pow(band, 6.0) * 0.45 * fade);
    if (uAdd > 0.5) {
      gl_FragColor = vec4(col * a, 1.0);
    } else {
      gl_FragColor = vec4(col, a);
    }
    vec3 pre = gl_FragColor.rgb;
    #include <fog_fragment>
    #ifdef USE_FOG
      if (uAdd > 0.5) gl_FragColor.rgb = pre * (1.0 - fogFactor);
    #endif
  }`;

const DOME_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
    gl_Position = projectionMatrix * mv;
  }`;
const DOME_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uProg, uOpacity;
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, 2.5);
    float fade = pow(1.0 - uProg, 1.6);
    float a = (rim * 0.9 + 0.06) * fade * uOpacity * smoothstep(-0.05, 0.25, vY);
    vec3 col = mix(uColor, vec3(1.0), pow(rim, 5.0) * 0.4);
    gl_FragColor = vec4(col * a, 1.0);
  }`;

const DECAL_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uBase, uGlow;
  uniform float uOpacity, uGlowAmt, uAdd, uRot;
  varying vec2 vL;
  #include <fog_pars_fragment>
  void main() {
    float c = cos(uRot), s = sin(uRot);
    vec2 q = vec2(c * vL.x - s * vL.y, s * vL.x + c * vL.y);
    if (dot(q, q) > 1.0) discard;
    vec4 t = texture2D(map, q * 0.5 + 0.5);
    float m = t.r * uOpacity;
    float g = t.g * uGlowAmt;
    if (m + g < 0.004) discard;
    if (uAdd > 0.5) {
      vec3 col = uGlow * (m * 0.7 + g);
      gl_FragColor = vec4(col, 1.0);
    } else {
      vec3 col = uBase * (0.75 + 0.5 * t.b);
      col = mix(col, uGlow * 2.2, clamp(g, 0.0, 1.0));
      gl_FragColor = vec4(col, clamp(m + g * 0.6, 0.0, 1.0));
    }
    vec3 pre = gl_FragColor.rgb;
    #include <fog_fragment>
    #ifdef USE_FOG
      if (uAdd > 0.5) gl_FragColor.rgb = pre * (1.0 - fogFactor);
    #endif
  }`;

function gridGeometry() {
  const g = new THREE.PlaneGeometry(2, 2, GRID, GRID);
  g.rotateX(-Math.PI / 2);
  g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  g.userData.base = Float32Array.from(g.attributes.position.array);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
  return g;
}

/** Conform grid geometry to terrain. mesh is placed at (x, 0, z) and scaled by radius in XZ. */
function conform(mesh, pos, radius, getHeight, lift) {
  const g = mesh.geometry, base = g.userData.base, arr = g.attributes.position.array;
  const ground = getHeight ? getHeight(pos.x, pos.z) : 0;
  const near = getHeight && Math.abs(pos.y - ground) < 2.5;
  mesh.position.set(pos.x, near ? 0 : pos.y, pos.z);
  mesh.scale.set(radius, 1, radius);
  mesh.quaternion.identity();
  for (let i = 0; i < arr.length; i += 3) {
    const lx = base[i], lz = base[i + 2];
    arr[i] = lx; arr[i + 2] = lz;
    arr[i + 1] = near ? getHeight(pos.x + lx * radius, pos.z + lz * radius) + lift : 0;
  }
  g.attributes.position.needsUpdate = true;
  g.boundingSphere.center.set(0, near ? ground : 0, 0);
  g.boundingSphere.radius = 2 + (near ? 4 : 0);
  return near;
}

function flatten(mesh) {
  const g = mesh.geometry, base = g.userData.base, arr = g.attributes.position.array;
  arr.set(base); g.attributes.position.needsUpdate = true;
  g.boundingSphere.center.set(0, 0, 0); g.boundingSphere.radius = 2;
}

const _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

export class GroundFX {
  constructor(game, textures) {
    this.game = game;
    this.textures = textures;
    this.rings = []; this.domes = []; this.decals = [];
    const fogU = THREE.UniformsLib.fog;
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([fogU, {
          uColor: { value: new THREE.Color() }, uProg: { value: 0 }, uOpacity: { value: 1 }, uThick: { value: 0.2 }, uAdd: { value: 1 },
        }]),
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, fog: true,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const m = new THREE.Mesh(gridGeometry(), mat);
      m.visible = false; m.renderOrder = 8; m.frustumCulled = false; m.name = 'vfx-ring';
      game.scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, active: false, follow: null });
    }
    const sphere = new THREE.SphereGeometry(1, 32, 16);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uProg: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(sphere, mat); m.visible = false; m.renderOrder = 9; m.name = 'vfx-dome';
      game.scene.add(m);
      this.domes.push({ mesh: m, t: 0, dur: 1, radius: 1, active: false });
    }
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([fogU, {
          map: { value: null }, uBase: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
          uOpacity: { value: 1 }, uGlowAmt: { value: 1 }, uAdd: { value: 0 }, uRot: { value: 0 },
        }]),
        vertexShader: RING_VERT, fragmentShader: DECAL_FRAG, transparent: true, depthWrite: false, fog: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      const m = new THREE.Mesh(gridGeometry(), mat); m.visible = false; m.renderOrder = 2; m.frustumCulled = false; m.name = 'vfx-decal';
      game.scene.add(m);
      this.decals.push({ mesh: m, t: 0, dur: 1, active: false, born: 0, opacity: 1, glowDur: 1 });
    }
    this._serial = 0;
  }

  _grab(pool) {
    let best = pool[0];
    for (const r of pool) { if (!r.active) return r; if (r.born < best.born) best = r; }
    return best; // recycle oldest
  }

  shockwave(pos, opts = {}) {
    const r = this._grab(this.rings);
    r.born = ++this._serial;
    const radius = opts.radius ?? 3, mesh = r.mesh, u = mesh.material.uniforms;
    const getH = this.game.world?.getHeight;
    if (opts.vertical || opts.normal) {
      flatten(mesh);
      mesh.position.copy(pos); mesh.scale.set(radius, 1, radius);
      if (opts.normal) _n.copy(opts.normal).normalize();
      else { this.game.camera.getWorldDirection(_n).negate(); }
      mesh.quaternion.setFromUnitVectors(_up, _n);
    } else if (opts.flat) {
      flatten(mesh); mesh.position.copy(pos); mesh.scale.set(radius, 1, radius); mesh.quaternion.identity();
    } else {
      conform(mesh, pos, radius, getH, 0.07 + (opts.lift || 0));
    }
    u.uColor.value.setHex(opts.color ?? 0xffffff);
    u.uOpacity.value = opts.opacity ?? 0.9;
    u.uThick.value = opts.thickness ?? 0.18;
    u.uAdd.value = opts.blend === 'normal' ? 0 : 1;
    mesh.material.blending = opts.blend === 'normal' ? THREE.NormalBlending : THREE.CustomBlending;
    mesh.material.blendSrc = THREE.OneFactor; mesh.material.blendDst = THREE.OneFactor;
    u.uProg.value = 0;
    r.t = -(opts.delay || 0); r.dur = opts.duration ?? 0.5; r.active = true;
    mesh.visible = r.t >= 0;
    return r;
  }

  dome(pos, opts = {}) {
    const d = this._grab(this.domes);
    d.born = ++this._serial;
    d.mesh.position.copy(pos);
    d.radius = opts.radius ?? 3; d.t = -(opts.delay || 0); d.dur = opts.duration ?? 0.5; d.active = true;
    d.mesh.scale.setScalar(0.01);
    const u = d.mesh.material.uniforms;
    u.uColor.value.setHex(opts.color ?? 0xffffff); u.uOpacity.value = opts.opacity ?? 0.8; u.uProg.value = 0;
    d.mesh.visible = d.t >= 0;
    return d;
  }

  decal(pos, opts = {}) {
    const getH = this.game.world?.getHeight;
    if (getH && pos.y - getH(pos.x, pos.z) > 3) return null; // too high above ground
    const d = this._grab(this.decals);
    d.born = ++this._serial;
    const radius = opts.radius ?? 1.5, type = opts.type || guessType(opts.color);
    conform(d.mesh, pos, radius, getH, 0.045 + (d.born % 7) * 0.004);
    const u = d.mesh.material.uniforms;
    u.map.value = this.textures.decals[type] || this.textures.decals.soft;
    const cfg = DECAL_STYLE[type] || DECAL_STYLE.soft;
    u.uBase.value.setHex(opts.base ?? cfg.base);
    u.uGlow.value.setHex(opts.color ?? cfg.glow);
    const add = opts.additive ?? cfg.add;
    u.uAdd.value = add ? 1 : 0;
    d.mesh.material.blending = add ? THREE.CustomBlending : THREE.NormalBlending;
    d.mesh.material.blendSrc = THREE.OneFactor; d.mesh.material.blendDst = THREE.OneFactor;
    u.uRot.value = Math.random() * Math.PI * 2;
    d.opacity = (opts.opacity ?? cfg.opacity);
    u.uOpacity.value = d.opacity; u.uGlowAmt.value = 1;
    d.glowDur = opts.glowDuration ?? cfg.glowDur;
    d.t = 0; d.dur = opts.duration ?? 8; d.active = true; d.mesh.visible = true;
    return d;
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      if (r.t < 0) continue;
      r.mesh.visible = true;
      const p = r.t / r.dur;
      if (p >= 1) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.material.uniforms.uProg.value = p;
    }
    for (const d of this.domes) {
      if (!d.active) continue;
      d.t += dt;
      if (d.t < 0) continue;
      d.mesh.visible = true;
      const p = d.t / d.dur;
      if (p >= 1) { d.active = false; d.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - p, 3);
      d.mesh.scale.setScalar(Math.max(0.01, d.radius * (0.15 + 0.85 * e)));
      d.mesh.material.uniforms.uProg.value = p;
    }
    for (const d of this.decals) {
      if (!d.active) continue;
      d.t += dt;
      const p = d.t / d.dur;
      if (p >= 1) { d.active = false; d.mesh.visible = false; continue; }
      const u = d.mesh.material.uniforms;
      const fadeIn = Math.min(1, d.t / 0.08);
      u.uOpacity.value = d.opacity * fadeIn * (p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1);
      u.uGlowAmt.value = Math.max(0, 1 - d.t / d.glowDur) ** 1.5;
    }
  }

  stats() {
    let r = 0, dm = 0, dc = 0;
    for (const x of this.rings) r += x.active ? 1 : 0;
    for (const x of this.domes) dm += x.active ? 1 : 0;
    for (const x of this.decals) dc += x.active ? 1 : 0;
    return { rings: r, domes: dm, decals: dc };
  }
}

const DECAL_STYLE = {
  scorch: { base: 0x1c120c, glow: 0xff7a2a, opacity: 0.85, add: false, glowDur: 1.6 },
  frost: { base: 0xe6fbff, glow: 0x9feeff, opacity: 0.8, add: false, glowDur: 2.5 },
  crack: { base: 0x3b2a1c, glow: 0xffb35a, opacity: 0.85, add: false, glowDur: 1.2 },
  rune: { base: 0xffffff, glow: 0xc9a4ff, opacity: 0.9, add: true, glowDur: 99 },
  soft: { base: 0xffffff, glow: 0xffffff, opacity: 0.5, add: true, glowDur: 99 },
};

const _c = new THREE.Color();
function guessType(color) {
  if (color == null) return 'scorch';
  _c.setHex(color);
  const hsl = {}; _c.getHSL(hsl);
  const h = hsl.h * 360;
  if (hsl.s < 0.15) return 'scorch';
  if (h < 25 || h > 330) return 'scorch';
  if (h < 50) return 'crack';
  if (h < 160) return 'soft';
  if (h < 220) return 'frost';
  return 'scorch';
}
void _v;
