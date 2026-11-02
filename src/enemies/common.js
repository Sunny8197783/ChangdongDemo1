// Shared helpers for the enemies module: geometry merging, toon meshes, springs, canvas textures,
// ground telegraph rings, physics integration.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat, addOutline } from '../core/utils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

/** Part descriptor for mergeParts. */
export const P = (geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => ({ geo, color, p, r, s });

/** Bake a list of primitive parts into one vertex-colored geometry (1 draw call + 1 outline). */
export function mergeParts(list) {
  const geos = [];
  for (const it of list) {
    let g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    _e.set(it.r[0], it.r[1], it.r[2]); _q.setFromEuler(_e);
    _m.compose(_p.set(it.p[0], it.p[1], it.p[2]), _q, _s.set(it.s[0], it.s[1], it.s[2]));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(it.color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const out = mergeGeometries(geos);
  out.computeBoundingSphere();
  return out;
}

let _vcMat = null;
/** Shared vertex-colored toon material. */
export function vcMat() { return _vcMat || (_vcMat = toonMat(0xffffff, { vertexColors: true })); }
let _vcFlat = null;
export function vcFlatMat() { return _vcFlat || (_vcFlat = toonMat(0xffffff, { vertexColors: true, flatShading: true })); }

/** Mesh with outline + shadow. */
export function mk(geo, mat, outline = 0.025, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  if (outline) addOutline(m, outline);
  return m;
}

/** Pivot group helper. */
export function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

/** Faceted noisy rock. Smooth normals (outline-safe), flat-shaded via material. */
export function rockGeo(r, seed = 1, squash = [1, 1, 1], detail = 1, moss = 0x7fae4e, stone = 0x8f887a) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) + Math.sin(v.z * 3.7 + seed * 2.3) * 0.6;
    v.multiplyScalar(1 + n * 0.11);
    v.x *= squash[0]; v.y *= squash[1]; v.z *= squash[2];
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, col = new Float32Array(pos.count * 3);
  const cs = new THREE.Color(stone), cm = new THREE.Color(moss), cd = new THREE.Color(stone).multiplyScalar(0.78), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; const rnd = h - Math.floor(h);
    tmp.copy(cs).lerp(cd, rnd * 0.6);
    if (moss != null && ny > 0.55) tmp.lerp(cm, Math.min(1, (ny - 0.55) * 3.2));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Damped spring scalar. */
export class Spring {
  constructor(k = 180, d = 12) { this.x = 0; this.v = 0; this.k = k; this.d = d; }
  update(dt, target = 0) {
    const steps = dt > 1 / 50 ? 2 : 1, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (target - this.x) * this.k - this.v * this.d;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  }
  kick(v) { this.v += v; }
  reset(x = 0) { this.x = x; this.v = 0; }
}

// ------------------------------------------------------------------ canvas textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _tex = null;
export function textures() {
  if (_tex) return _tex;
  const glyph = (ch, fill) => canvasTex(128, 128, (g, w, h) => {
    g.font = '900 104px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#2a1408'; g.strokeText(ch, w / 2, h / 2 + 6);
    const gr = g.createLinearGradient(0, 16, 0, 112); gr.addColorStop(0, '#fff6a8'); gr.addColorStop(1, fill);
    g.fillStyle = gr; g.fillText(ch, w / 2, h / 2 + 6);
  });
  _tex = {
    alert: glyph('!', '#ff8a1a'),
    question: glyph('?', '#9fd8ff'),
    star: canvasTex(64, 64, (g) => {
      g.translate(32, 32); g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 27, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fillStyle = '#ffe766'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#7a4a10'; g.stroke();
    }),
    glow: canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }),
  };
  return _tex;
}

export function glowSpriteMat(color, opacity = 1) {
  return new THREE.SpriteMaterial({ map: textures().glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });
}

// ------------------------------------------------------------------ telegraph rings
const RING_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RING_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uProg; uniform float uAlpha; uniform float uTime;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    if (r > 1.0) discard;
    float edge = smoothstep(0.90, 0.96, r) * (1.0 - smoothstep(0.98, 1.0, r));
    float fill = step(r, uProg) * 0.32 * (0.6 + 0.4 * smoothstep(uProg - 0.25, uProg, r));
    float pulse = 0.75 + 0.25 * sin(uTime * 18.0);
    float hatch = 0.08 * step(0.5, fract((p.x + p.y) * 6.0 - uTime * 1.5)) * step(r, 0.9);
    float a = (edge * pulse + fill + hatch) * uAlpha;
    gl_FragColor = vec4(uColor * (1.0 + edge), a);
  }`;

export class Telegraphs {
  constructor(scene, n = 10) {
    this.items = [];
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xff3a22) }, uProg: { value: 0 }, uAlpha: { value: 0 }, uTime: { value: 0 } },
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4,
      });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 5; m.frustumCulled = false;
      scene.add(m);
      this.items.push({ mesh: m, t: 0, dur: 1, active: false, fade: 0 });
    }
  }
  /** Show a warning ring that fills over `dur` seconds. Returns handle {stop()}. */
  show(pos, radius, dur, color = 0xff3a22) {
    let it = this.items.find((x) => !x.active) || this.items[0];
    it.active = true; it.t = 0; it.dur = dur; it.fade = 0;
    it.mesh.position.set(pos.x, pos.y + 0.12, pos.z); it.mesh.scale.set(radius, 1, radius);
    it.mesh.material.uniforms.uColor.value.setHex(color);
    it.mesh.visible = true;
    return it;
  }
  update(dt, time) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const u = it.mesh.material.uniforms;
      u.uTime.value = time; u.uProg.value = Math.min(1, it.t / it.dur);
      let a = Math.min(1, it.t * 6);
      if (it.t > it.dur) a = Math.max(0, 1 - (it.t - it.dur) * 6);
      u.uAlpha.value = a;
      if (it.t > it.dur + 0.18) { it.active = false; it.mesh.visible = false; }
    }
  }
}

// ------------------------------------------------------------------ physics
const GRAV = 22;
/**
 * Integrates entity physics: e.move (controlled locomotion, xz) + e.velocity (external).
 * Keeps e.grounded, handles terrain, colliders, water avoidance. Sets e.landed (impact speed) on touchdown.
 */
export function integrate(game, e, dt) {
  if (dt <= 0) return;
  const p = e.object.position, v = e.velocity, mv = e.move, w = game.world;
  const px = p.x, pz = p.z;
  // stuck detection: if we've been trying to move but barely moved for 1s, detour +/-60 degrees for 1.5s
  const want = mv.x * mv.x + mv.z * mv.z;
  if (e.detourT > 0) {
    e.detourT -= dt;
    const a = (e.detourSign || 1) * 1.047, c = Math.cos(a), sn = Math.sin(a);
    const mx = mv.x * c - mv.z * sn, mz = mv.x * sn + mv.z * c; mv.x = mx; mv.z = mz;
  }
  if (want > 0.25 && !e.isBoss) {
    e._stT = (e._stT || 0) + dt;
    if (e._stT >= 1) {
      const moved = Math.hypot(p.x - (e._stX ?? p.x), p.z - (e._stZ ?? p.z));
      if (moved < 0.3 && !(e.detourT > 0)) { e.detourSign = -(e.detourSign || -1); e.detourT = 1.5; }
      e._stT = 0; e._stX = p.x; e._stZ = p.z;
    }
  } else { e._stT = 0; e._stX = p.x; e._stZ = p.z; }
  p.x += (v.x + mv.x) * dt; p.z += (v.z + mv.z) * dt;
  p.y += v.y * dt;
  const gh = w.getHeight(p.x, p.z);
  e.landed = 0;
  if (p.y <= gh || (e.grounded && v.y <= 0.01 && p.y - gh < 0.45)) {
    if (!e.grounded) e.landed = Math.max(0.01, -v.y);
    p.y = gh;
    if (v.y < 0) v.y = 0;
    e.grounded = true;
    const f = Math.exp(-(e.friction ?? 7) * dt);
    v.x *= f; v.z *= f;
  } else {
    e.grounded = false;
    v.y -= GRAV * (e.gravityMul ?? 1) * dt;
    const f = Math.exp(-0.3 * dt); v.x *= f; v.z *= f;
  }
  // keep out of deep water (unless flung)
  if (e.grounded && w.waterDepth && w.waterDepth(p.x, p.z) > 0.7 && w.waterDepth(px, pz) <= 0.7) {
    p.x = px; p.z = pz; p.y = w.getHeight(px, pz);
    e.blocked = true;
    e.waterBlockT = (e.waterBlockT || 0) + dt;
    // can't reach the player across water: give up instead of moonwalking at the shore
    if (e.waterBlockT > 3 && e.aggro && !e.isBoss) { e.waterBlockT = 0; e.giveUp = true; }
  } else { e.blocked = false; e.waterBlockT = Math.max(0, (e.waterBlockT || 0) - dt * 0.5); }
  w.resolveCollision?.(p, e.radius * 0.9);
}
