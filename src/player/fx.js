// Player-owned visual effects: rune circle textures, charge magic circle, glide sigil, blink afterimages.
import * as THREE from 'three';

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function drawGlyph(g, rnd, s) {
  const n = 2 + Math.floor(rnd() * 3);
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const t = rnd();
    const x0 = (rnd() - 0.5) * s, y0 = (rnd() - 0.5) * s * 1.3;
    if (t < 0.45) { g.moveTo(x0, y0); g.lineTo((rnd() - 0.5) * s, (rnd() - 0.5) * s * 1.3); }
    else if (t < 0.75) { g.moveTo(x0 + s * 0.25, y0); g.arc(x0, y0, s * 0.25, 0, Math.PI * (1 + rnd())); }
    else { g.moveTo(x0, -s * 0.65); g.lineTo(x0, s * 0.65); g.moveTo(x0 - s * 0.3, y0); g.lineTo(x0 + s * 0.3, y0); }
  }
  g.stroke();
  if (rnd() < 0.5) { g.beginPath(); g.arc((rnd() - 0.5) * s, (rnd() - 0.5) * s, 2.2, 0, Math.PI * 2); g.fill(); }
}

let _runeTex = null, _innerTex = null;
export function getRuneTexture() {
  if (_runeTex) return _runeTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const rnd = mulberry(1337);
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 10;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(244, 7); ring(226, 2.5); ring(166, 3.5); ring(156, 1.5); ring(74, 3);
  g.lineWidth = 2;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, r0 = i % 4 === 0 ? 228 : 233;
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 240, Math.sin(a) * 240); g.stroke();
  }
  g.lineWidth = 3.2;
  const N = 20;
  for (let i = 0; i < N; i++) {
    g.save(); g.rotate((i / N) * Math.PI * 2); g.translate(0, -196); drawGlyph(g, rnd, 26); g.restore();
  }
  // hexagram
  g.lineWidth = 3;
  for (let t = 0; t < 2; t++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + t * Math.PI / 3 + i * (Math.PI * 2 / 3); g.lineTo(Math.cos(a) * 156, Math.sin(a) * 156); }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    g.lineWidth = 2.5; g.beginPath(); g.arc(Math.cos(a) * 156, Math.sin(a) * 156, 13, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(Math.cos(a) * 156, Math.sin(a) * 156, 4, 0, Math.PI * 2); g.fill();
  }
  // inner small orbit + center glyph
  g.lineWidth = 2;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.arc(Math.cos(a) * 110, Math.sin(a) * 110, 5, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (_runeTex = tex);
}

export function getInnerRuneTexture() {
  if (_innerTex) return _innerTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const rnd = mulberry(99);
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 6;
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 108, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2.4;
  for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * Math.PI * 2); g.translate(0, -88); drawGlyph(g, rnd, 16); g.restore(); }
  g.lineWidth = 2.5; g.beginPath();
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 4 / 5); g.lineTo(Math.cos(a) * 66, Math.sin(a) * 66); }
  g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return (_innerTex = tex);
}

function circleMat(map) {
  return new THREE.MeshBasicMaterial({
    map, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Two counter-rotating rune discs. Plane normal = group +Z. */
export class RuneCircle {
  constructor(scene, size = 1.2) {
    this.group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(size, size);
    this.outerMat = circleMat(getRuneTexture());
    this.innerMat = circleMat(getInnerRuneTexture());
    this.outer = new THREE.Mesh(geo, this.outerMat);
    this.inner = new THREE.Mesh(geo, this.innerMat); this.inner.scale.setScalar(0.62); this.inner.position.z = 0.02;
    this.group.add(this.outer, this.inner);
    this.group.visible = false; this.group.renderOrder = 5;
    this.outer.frustumCulled = this.inner.frustumCulled = false;
    scene.add(this.group);
    this.w = 0; this.spin = 0;
  }
  setColor(c) { this.outerMat.color.copy(c); this.innerMat.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.35); }
  update(dt, target, scale, spinSpeed = 1.5, opacity = 1) {
    this.w += ((target ? 1 : 0) - this.w) * (1 - Math.exp(-(target ? 10 : 6) * dt));
    const vis = this.w > 0.01;
    this.group.visible = vis;
    if (!vis) return;
    this.spin += dt * spinSpeed;
    this.outer.rotation.z = this.spin;
    this.inner.rotation.z = -this.spin * 1.8;
    const s = scale * (0.55 + 0.45 * this.w);
    this.group.scale.setScalar(s);
    this.outerMat.opacity = this.w * opacity;
    this.innerMat.opacity = this.w * opacity * 0.9;
  }
}

const ghostVS = /* glsl */`
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const ghostFS = /* glsl */`
  uniform vec3 color; uniform float opacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float r = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a = opacity * (0.16 + 0.95 * pow(r, 1.7));
    gl_FragColor = vec4(color * (0.55 + 1.6 * r), a);
  }`;

/** Pool of silhouette clones of the live wizard rig that copy its pose when spawned. */
export class Afterimages {
  constructor(scene, liveRoot, count = 6) {
    this.items = [];
    this.live = [];
    liveRoot.traverse((o) => { this.live.push(o); });
    for (let k = 0; k < count; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 0 } },
        vertexShader: ghostVS, fragmentShader: ghostFS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      });
      const nodes = [];
      const root = this._clone(liveRoot, mat, nodes);
      root.visible = false;
      scene.add(root);
      this.items.push({ root, nodes, mat, life: 0, max: 0.4 });
    }
  }
  _clone(src, mat, nodes) {
    let o;
    if (src.isMesh && !src.userData.noGhost && src.name !== 'outline') { o = new THREE.Mesh(src.geometry, mat); o.frustumCulled = false; }
    else o = new THREE.Object3D();
    nodes.push(o);
    for (const ch of src.children) {
      if (ch.isLight || ch.isSprite || ch.name === 'outline' || ch.userData.noGhost) { nodes.push(null); continue; }
      o.add(this._clone(ch, mat, nodes));
    }
    // keep traversal order aligned with this.live (depth-first, same as traverse)
    return o;
  }
  spawn(position, rotationY, color, life = 0.42, opacity = 0.9) {
    let it = this.items[0];
    for (const x of this.items) if (x.life <= 0) { it = x; break; } else if (x.life < it.life) it = x;
    // copy local transforms: live traversal order == clone order (nulls for skipped subtrees)
    this._copy(this.live[0], it.root);
    it.root.position.copy(position); it.root.rotation.set(0, rotationY, 0);
    it.root.scale.setScalar(1);
    it.mat.uniforms.color.value.copy(color);
    it.life = it.max = life; it.op = opacity;
    it.root.visible = true;
  }
  _copy(src, dst) {
    dst.position.copy(src.position); dst.quaternion.copy(src.quaternion); dst.scale.copy(src.scale);
    let j = 0;
    for (const ch of src.children) {
      if (ch.isLight || ch.isSprite || ch.name === 'outline' || ch.userData.noGhost) continue;
      this._copy(ch, dst.children[j++]);
    }
  }
  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      const f = Math.max(0, it.life / it.max);
      it.mat.uniforms.opacity.value = f * f * it.op;
      it.root.scale.setScalar(1 + (1 - f) * 0.06);
      if (it.life <= 0) it.root.visible = false;
    }
  }
}
