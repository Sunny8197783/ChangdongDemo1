// Rune circles (DESIGN §9 A10) + weapon smear crescents (A1) + wind lines. Owner: combat. Pools: runes 6, smears 4.
// runeCircle(pos, {element, r, dur, rotSpeed}) → handle: rotates, scales in with overshoot, fades. One shared shader.
// smear(weapon:'arc'|'wide'|'twin', origin, quat, scale, element): 1–2 frame crescent during the strike.
// windLines(on, intensity): a pooled streak tunnel around the camera (glide / light rings).
import * as THREE from 'three';
import { elColor } from '../core/elements.js';

const RUNE_FRAG = /* glsl */`
  uniform sampler2D map; uniform vec3 uColor; uniform float uAlpha, uRot, uTime;
  varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float c = cos(uRot), s = sin(uRot);
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    if (dot(r, r) > 1.0) discard;
    vec4 t = texture2D(map, r * 0.5 + 0.5);
    float pulse = 0.85 + 0.15 * sin(uTime * 6.0 + length(q) * 10.0);
    float a = t.r * uAlpha * pulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), t.g * 0.45) * a, 1.0);
  }`;
const PLAIN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SMEAR_VERT = /* glsl */`
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SMEAR_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha, uArc, uInner;
  varying vec2 vP;
  void main() {
    float r = length(vP); float a = atan(vP.y, vP.x);
    float t = clamp(a / uArc, 0.0, 1.0);                  // 0 tail .. 1 leading edge
    float band = smoothstep(uInner, uInner + 0.12, r) * (1.0 - smoothstep(0.88, 1.0, r));
    float k = pow(t, 1.6) * band * uAlpha;
    vec3 col = mix(uColor, vec3(1.0), smoothstep(0.75, 1.0, t) * smoothstep(0.7, 0.95, r));
    gl_FragColor = vec4(col * k, 1.0);
  }`;

export function createRunes(game, vfx, textures) {
  // ---------------- runes ----------------
  const runeGeo = new THREE.PlaneGeometry(2, 2); runeGeo.rotateX(-Math.PI / 2);
  const runes = [];
  let serial = 0;
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: textures.decals.rune }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uRot: { value: 0 }, uTime: { value: 0 } },
      vertexShader: PLAIN_VERT, fragmentShader: RUNE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(runeGeo, mat);
    mesh.visible = false; mesh.renderOrder = 6; mesh.name = 'vfx-rune';
    game.scene.add(mesh);
    const rec = { mesh, active: false, t: 0, dur: 1, r: 2, rot: 0, rotSpeed: 1, born: 0, handle: null };
    rec.handle = { stop() { rec.t = Math.max(rec.t, rec.dur * 0.7); }, get alive() { return rec.active; }, setPos(p) { if (p) rec.mesh.position.copy(p).y += 0.06; } };
    runes.push(rec);
  }
  function runeCircle(pos, o = {}) {
    if (!pos) return null;
    let rec = null, oldest = runes[0];
    for (const r of runes) { if (!r.active) { rec = r; break; } if (r.born < oldest.born) oldest = r; }
    if (!rec) rec = oldest;
    rec.born = ++serial;
    rec.mesh.position.copy(pos);
    try { const h = game.world?.getHeight?.(pos.x, pos.z); if (Number.isFinite(h) && Math.abs(pos.y - h) < 2.5) rec.mesh.position.y = h; } catch (_) { /* */ }
    rec.mesh.position.y += 0.07;
    rec.r = o.r ?? 2; rec.dur = Math.max(0.2, o.dur ?? 1.2); rec.rotSpeed = o.rotSpeed ?? 1.2; rec.rot = Math.random() * 6.28; rec.t = 0;
    rec.mesh.material.uniforms.uColor.value.setHex(typeof o.color === 'number' ? o.color : elColor(o.element || 'light', 'mid'));
    rec.active = true; rec.mesh.visible = true; rec.mesh.scale.setScalar(0.01);
    return rec.handle;
  }
  const backOut = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  // ---------------- smear crescents ----------------
  const ARC = Math.PI * 0.85;
  const smearGeo = new THREE.RingGeometry(0.35, 1, 28, 1, 0, ARC);
  const smears = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uArc: { value: ARC }, uInner: { value: 0.35 } },
      vertexShader: SMEAR_VERT, fragmentShader: SMEAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(smearGeo, mat); mesh.visible = false; mesh.renderOrder = 10; mesh.frustumCulled = false; mesh.name = 'vfx-smear';
    game.scene.add(mesh);
    smears.push({ mesh, t: 0, dur: 0.09, active: false, born: 0 });
  }
  function grabSmear() {
    let s = null, oldest = smears[0];
    for (const x of smears) { if (!x.active) { s = x; break; } if (x.born < oldest.born) oldest = x; }
    return s || oldest;
  }
  const _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
  function smear(weapon = 'arc', origin, quat, scale = 1, element = 'physical') {
    if (!origin) return;
    const n = weapon === 'twin' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = grabSmear(); s.born = ++serial;
      s.mesh.position.copy(origin);
      if (quat) s.mesh.quaternion.copy(quat); else s.mesh.quaternion.identity();
      if (n === 2) { _e.set(0, 0, i ? 0.5 : -0.5); _q2.setFromEuler(_e); s.mesh.quaternion.multiply(_q2); }
      const sc = scale * (weapon === 'wide' ? 1.4 : weapon === 'twin' ? 0.75 : 1);
      s.mesh.scale.set(sc, sc, sc);
      s.mesh.material.uniforms.uInner.value = weapon === 'wide' ? 0.25 : weapon === 'twin' ? 0.6 : 0.4;
      s.mesh.material.uniforms.uColor.value.setHex(element === 'physical' ? 0xfff4e0 : elColor(element, 'mid'));
      s.mesh.material.uniforms.uAlpha.value = 1;
      s.t = 0; s.dur = weapon === 'wide' ? 0.12 : 0.09; s.active = true; s.mesh.visible = true;
    }
  }

  // ---------------- wind lines ----------------
  let windOn = false, windK = 1, windAcc = 0;
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _vd = new THREE.Vector3();
  const windOpts = { count: 1, shape: 'streak', color: [0xffffff, 0xc8ffe9], dir: _vd, spread: 0.02, speed: 34, speedVar: 6, size: 0.5, sizeEnd: 0.2, life: 0.32, lifeVar: 0.08, velocityStretch: 0.09, alpha: 0.5 };
  function windLines(on, intensity = 1) { windOn = !!on; windK = Math.max(0, Math.min(2, intensity)); }
  function updateWind(realDt) {
    if (!windOn || !game.camera) return;
    windAcc += realDt * 70 * windK;
    if (windAcc < 1) return;
    const cam = game.camera;
    cam.getWorldDirection(_f);
    _r.crossVectors(_f, cam.up).normalize(); _u.crossVectors(_r, _f).normalize();
    _vd.copy(_f).negate();
    while (windAcc >= 1) {
      windAcc -= 1;
      const a = Math.random() * Math.PI * 2, rr = 1.6 + Math.random() * 2.6;
      _p.copy(cam.position).addScaledVector(_f, 9 + Math.random() * 6).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr);
      vfx.burst?.(_p, windOpts, true);
    }
  }

  function update(dt, realDt) {
    const rd = realDt || dt;
    for (const r of runes) {
      if (!r.active) continue;
      r.t += dt;
      const p = r.t / r.dur;
      if (p >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const sIn = backOut(Math.min(1, r.t / 0.28));
      r.mesh.scale.setScalar(Math.max(0.01, r.r * sIn));
      r.rot += r.rotSpeed * dt;
      const u = r.mesh.material.uniforms;
      u.uRot.value = r.rot; u.uTime.value += rd;
      u.uAlpha.value = Math.min(1, r.t / 0.12) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
    }
    for (const s of smears) {
      if (!s.active) continue;
      s.t += rd;
      const p = s.t / s.dur;
      if (p >= 1) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.material.uniforms.uAlpha.value = 1 - p * p;
    }
    updateWind(rd);
  }
  return { runeCircle, smear, windLines, update, active: () => runes.filter((r) => r.active).length, get windOn() { return windOn; } };
}
