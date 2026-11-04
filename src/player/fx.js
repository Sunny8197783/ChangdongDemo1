// Player-owned visual effects: rune circle textures, charge magic circle, glide sigil, blink afterimages.
// v4: every material here is private player FX, patched once at construction through game.vfx.applyPlayerFx (threat
// ducking, PLAN §5.4) via the `fx` callback; tints are element ramp steps (never white, multiplier ≤ 1.2).
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
    map, color: 0x8a7a6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Two counter-rotating rune discs. Plane normal = group +Z. */
export class RuneCircle {
  /** fx(material, opts): the player-FX patch (game.vfx.applyPlayerFx), called once per private material. */
  constructor(scene, size = 1.2, fx = null) {
    this.group = new THREE.Group();
    this.group.userData.owner = 'player';
    const geo = new THREE.PlaneGeometry(size, size);
    this.outerMat = circleMat(getRuneTexture());
    this.innerMat = circleMat(getInnerRuneTexture());
    if (fx) { fx(this.outerMat, { additive: true, role: 'line' }); fx(this.innerMat, { additive: true, role: 'line' }); }
    this.outer = new THREE.Mesh(geo, this.outerMat);
    this.inner = new THREE.Mesh(geo, this.innerMat); this.inner.scale.setScalar(0.62); this.inner.position.z = 0.02;
    this.group.add(this.outer, this.inner);
    this.group.visible = false; this.group.renderOrder = 5;
    this.outer.frustumCulled = this.inner.frustumCulled = false;
    scene.add(this.group);
    this.w = 0; this.spin = 0;
  }
  /** c: the element's mid step; c2 (optional): its light step for the inner disc (v3 lerped toward white). */
  setColor(c, c2) { this.outerMat.color.copy(c); if (c2) this.innerMat.color.copy(c2); else this.innerMat.color.copy(c).multiplyScalar(1.15); }
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
    gl_FragColor = vec4(color * (0.5 + 0.7 * r), a);
  }`;

/**
 * Pool of afterimage ghosts. Each ghost is ONE mesh: on spawn the posed live rig (every visible part, in root
 * space) is baked into that ghost's preallocated buffer, so a ghost costs 1 draw call instead of ~80.
 * Ghosts don't animate after spawning, so a bake (~0.2 ms) only happens per spawn.
 */
const _gm = new THREE.Matrix4(), _gn = new THREE.Matrix3(), _gInv = new THREE.Matrix4(), _gv = new THREE.Vector3();
export class Afterimages {
  constructor(scene, liveRoot, count = 5, fx = null) {
    this.items = [];
    this.liveRoot = liveRoot;
    this.parts = [];          // {mesh, start, count}
    let nv = 0, ni = 0;
    const walk = (o) => {
      if (o.isLight || o.isSprite || o.name === 'outline' || o.userData.noGhost) return;
      if (o.isMesh && o.geometry?.attributes?.position && o.geometry.attributes.normal) {
        const g = o.geometry; g.boundingSphere || g.computeBoundingSphere();
        if (g.boundingSphere.radius >= 0.06) {   // small trinkets add triangles, not silhouette
          const c = g.attributes.position.count;
          const ic = g.index ? g.index.count : c;
          this.parts.push({ mesh: o, start: nv, count: c, istart: ni, icount: ic });
          nv += c; ni += ic;
        }
      }
      for (const ch of o.children) walk(ch);
    };
    walk(liveRoot);
    // shared index buffer (topology is static)
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    for (const p of this.parts) {
      const g = p.mesh.geometry;
      if (g.index) for (let i = 0; i < p.icount; i++) idx[p.istart + i] = g.index.array[i] + p.start;
      else for (let i = 0; i < p.icount; i++) idx[p.istart + i] = i + p.start;
    }
    this.masterIdx = idx;
    for (let k = 0; k < count; k++) {
      // per-ghost index buffer: each bake packs only the visible parts' triangles (the rig carries every class's
      // gear, so drawing the full topology cost ~17k mostly degenerate triangles per after-image)
      const index = new THREE.BufferAttribute(new idx.constructor(ni), 1).setUsage(THREE.DynamicDrawUsage);
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 0 } },
        vertexShader: ghostVS, fragmentShader: ghostFS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      });
      if (fx) fx(mat, { additive: true, role: 'fill' });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(index);
      const root = new THREE.Mesh(geo, mat);
      root.frustumCulled = false; root.visible = false; root.renderOrder = 3; root.userData.owner = 'player';
      scene.add(root);
      this.items.push({ root, mat, life: 0, max: 0.4 });
    }
  }
  _visible(o) {
    for (let p = o; p && p !== this.liveRoot; p = p.parent) if (!p.visible) return false;
    return true;
  }
  _bake(geo) {
    const pa = geo.attributes.position.array, na = geo.attributes.normal.array;
    const lr = this.liveRoot;
    lr.updateMatrixWorld(true);
    _gInv.copy(lr.matrixWorld).invert();
    const ix = geo.index.array, mi = this.masterIdx, parts = this.parts;
    let ni = 0, lo = Infinity, hi = 0;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const o = p.mesh, o3 = p.start * 3, n3 = p.count * 3;
      if (!this._visible(o)) continue;   // left out of this ghost's index buffer
      for (let i = 0, s0 = p.istart; i < p.icount; i++) ix[ni + i] = mi[s0 + i];   // (no subarray views per part)
      ni += p.icount;
      if (o3 < lo) lo = o3; if (o3 + n3 > hi) hi = o3 + n3;
      _gm.multiplyMatrices(_gInv, o.matrixWorld);
      _gn.getNormalMatrix(_gm);
      const sp = o.geometry.attributes.position.array, sn = o.geometry.attributes.normal.array;
      const e = _gm.elements, m = _gn.elements;
      for (let i = 0; i < n3; i += 3) {
        const x = sp[i], y = sp[i + 1], z = sp[i + 2];
        pa[o3 + i] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pa[o3 + i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pa[o3 + i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = sn[i], b = sn[i + 1], c = sn[i + 2];
        na[o3 + i] = m[0] * a + m[3] * b + m[6] * c;
        na[o3 + i + 1] = m[1] * a + m[4] * b + m[7] * c;
        na[o3 + i + 2] = m[2] * a + m[5] * b + m[8] * c;
      }
    }
    // live ranges only (the buffers hold every class's gear; a bake fills the visible parts)
    const pA = geo.attributes.position, nA = geo.attributes.normal;
    pA.clearUpdateRanges(); nA.clearUpdateRanges(); geo.index.clearUpdateRanges();
    if (hi > lo) { pA.addUpdateRange(lo, hi - lo); nA.addUpdateRange(lo, hi - lo); } else { pA.addUpdateRange(0, 3); nA.addUpdateRange(0, 3); }
    geo.index.addUpdateRange(0, Math.max(1, ni));
    pA.needsUpdate = true; nA.needsUpdate = true; geo.index.needsUpdate = true;
    geo.setDrawRange(0, ni);
  }
  spawn(position, rotationY, color, life = 0.42, opacity = 0.9) {
    const items = this.items;
    let it = items[0];
    for (let k = 0; k < items.length; k++) { const x = items[k]; if (x.life <= 0) { it = x; break; } else if (x.life < it.life) it = x; }
    this._bake(it.root.geometry);
    it.root.position.copy(position); it.root.rotation.set(0, rotationY, 0);
    it.root.scale.setScalar(1);
    it.mat.uniforms.color.value.copy(color);
    it.life = it.max = life; it.op = opacity;
    it.root.visible = true;
  }
  update(dt) {
    const items = this.items;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.life <= 0) continue;
      it.life -= dt;
      const f = Math.max(0, it.life / it.max);
      it.mat.uniforms.opacity.value = f * f * it.op;
      it.root.scale.setScalar(1 + (1 - f) * 0.06);
      if (it.life <= 0 || f * f * it.op < 0.09) { it.root.visible = false; it.life = 0; }   // the faint tail is invisible anyway
    }
  }
}
