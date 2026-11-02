// Temporary set-piece objects for cutscenes (spirit lights, void mist, rift, rune circles, light pillars, golem
// silhouette, sky lanterns, fireworks). Everything is created lazily into a Stage and disposed with stage.dispose().
// Cheap by design: sprites / one Points cloud / a few planes; no realtime lights (vfx.flash is pooled).
import * as THREE from 'three';
import { ELEMENT_COLORS } from '../core/utils.js';

export const SPIRITS = [
  { el: 'fire', name: '이그니스', title: '화염의 정령', css: '#ff8a3d' },
  { el: 'ice', name: '글라시아', title: '냉기의 정령', css: '#8feaff' },
  { el: 'lightning', name: '볼타', title: '번개의 정령', css: '#d4b4ff' },
  { el: 'wind', name: '실피아', title: '바람의 정령', css: '#9dffcb' },
  { el: 'earth', name: '테라곤', title: '대지의 정령', css: '#f0bd6e' },
];

// ------------------------------------------------------------------ textures (built once, shared)
const TEX = {};
function canvasTex(key, size, draw) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  TEX[key] = t; return t;
}
export function glowTex() {
  return canvasTex('glow', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.75)');
    r.addColorStop(0.45, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
}
export function starTex() {
  return canvasTex('star', 128, (g, s) => {
    const h = s / 2;
    const r = g.createRadialGradient(h, h, 0, h, h, h);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,.6)'); r.addColorStop(0.4, 'rgba(255,255,255,.08)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (const [w, l] of [[3, h * 0.98], [1.6, h * 0.6]]) {
      for (const rot of [0, Math.PI / 2]) {
        g.save(); g.translate(h, h); g.rotate(rot + (l < h * 0.9 ? Math.PI / 4 : 0));
        const lg = g.createLinearGradient(-l, 0, l, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lg; g.fillRect(-l, -w / 2, l * 2, w); g.restore();
      }
    }
  });
}
/** Magic circle: concentric rings, runes, pentagram — white, tinted by material colour. */
export function runeTex() {
  return canvasTex('rune', 512, (g, s) => {
    const h = s / 2; g.translate(h, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.fillStyle = 'rgba(255,255,255,0.95)'; g.shadowColor = '#fff'; g.shadowBlur = 8;
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(h * 0.96, 5); ring(h * 0.88, 2); ring(h * 0.62, 3); ring(h * 0.56, 1.5); ring(h * 0.2, 2);
    // runes between outer rings
    g.font = `${Math.round(s * 0.05)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2; g.save(); g.rotate(a); g.fillText(glyphs[i % glyphs.length], 0, -h * 0.75); g.restore();
    }
    // pentagram + five element nodes
    g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI * 2) / 5; const x = Math.cos(a) * h * 0.56, y = Math.sin(a) * h * 0.56; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 5; g.beginPath(); g.arc(Math.cos(a) * h * 0.56, Math.sin(a) * h * 0.56, h * 0.06, 0, Math.PI * 2); g.lineWidth = 3; g.stroke(); }
    // tick marks
    g.lineWidth = 1.5;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; const r0 = h * 0.88, r1 = h * (i % 3 ? 0.91 : 0.94); g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
  });
}
/** Vertical jagged tear of light (the star rift). */
export function riftTex() {
  return canvasTex('rift', 256, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,220,255,.55)'); r.addColorStop(0.35, 'rgba(190,80,255,.28)'); r.addColorStop(1, 'rgba(60,0,90,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
    g.shadowColor = '#e9b8ff'; g.shadowBlur = 18; g.strokeStyle = 'rgba(255,240,255,1)'; g.lineWidth = 5; g.lineJoin = 'round';
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.beginPath(); g.moveTo(s * 0.5, s * 0.06);
    for (let i = 1; i <= 12; i++) g.lineTo(s * (0.5 + (rnd() - 0.5) * 0.22 * Math.sin((i / 12) * Math.PI)), s * (0.06 + (i / 12) * 0.88));
    g.stroke(); g.lineWidth = 2; g.stroke();
  });
}
function smokeTex() {
  return canvasTex('smoke', 128, (g, s) => {
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 18; i++) {
      const x = s * (0.3 + rnd() * 0.4), y = s * (0.3 + rnd() * 0.4), rr = s * (0.12 + rnd() * 0.2);
      const r = g.createRadialGradient(x, y, 0, x, y, rr);
      r.addColorStop(0, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    }
  });
}

// ------------------------------------------------------------------ stage (owns & disposes temporaries)
export class Stage {
  constructor(game) { this.game = game; this.group = new THREE.Group(); this.group.name = 'cin-stage'; game.scene.add(this.group); this.items = []; this.handles = []; this.mats = []; this.geos = []; }
  add(o) { this.group.add(o); return o; }
  mat(m) { this.mats.push(m); return m; }
  geo(g) { this.geos.push(g); return g; }
  keep(h) { if (h) this.handles.push(h); return h; }
  sprite(color, size, tex = glowTex(), opacity = 1) {
    const m = this.mat(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
    const s = new THREE.Sprite(m); s.scale.setScalar(size); s.renderOrder = 14; return s;
  }
  dispose() {
    for (const h of this.handles) { try { h.stop?.(); } catch (_) { /* */ } }
    for (const it of this.items) it.dispose?.();
    this.group.parent?.remove(this.group);
    for (const m of this.mats) m.dispose(); for (const g of this.geos) g.dispose();
    this.items.length = this.handles.length = this.mats.length = this.geos.length = 0;
  }
}

// ------------------------------------------------------------------ spirit light
/** A wisp: bright core + coloured halo + ribbon trail + sparkle emitter. `obj.position` drives it. */
export function makeSpirit(stage, el, { size = 6, trail = true, trailWidth = 2.2, trailLen = 60, sparkles = true } = {}) {
  const col = ELEMENT_COLORS[el] ?? 0xffffff;
  const obj = new THREE.Group();
  const halo = stage.sprite(col, size * 2.4, glowTex(), 1);
  const core = stage.sprite(new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.55).getHex(), size * 0.7, starTex(), 1);
  const ring = stage.sprite(col, size * 1.2, starTex(), 0.8);
  for (const m of [halo, core, ring]) { m.material.depthTest = false; m.renderOrder = 16; }
  obj.add(halo, core, ring); stage.add(obj);
  const vfx = stage.game.vfx;
  const sp = { el, obj, halo, core, ring, col, size, trailH: null, emH: null, pulse: Math.random() * 6 };
  // trail + sparkles start lazily on first visibility (so they never streak from a stale position)
  const startFx = () => {
    if (trail && !sp.trailH) sp.trailH = stage.keep(vfx?.trail?.(obj, { color: col, width: trailWidth, length: trailLen, fade: 1.4, opacity: 0.9 }));
    if (sparkles && !sp.emH) sp.emH = stage.keep(vfx?.emitter?.({ follow: obj, rate: 26, count: 1, color: [col, 0xffffff], speed: 1.2, spread: 1, size: size * 0.09, sizeEnd: 0, life: 1.4, shape: 'spark', drag: 1.2, gravity: -0.6 }));
  };
  sp.resetFx = () => { sp.trailH?.stop?.(); sp.emH?.stop?.(); sp.trailH = sp.emH = null; };
  sp.setScale = (k) => { halo.scale.setScalar(size * 2.4 * k); core.scale.setScalar(size * 0.7 * k); ring.scale.setScalar(size * 1.2 * k); };
  sp.setOpacity = (a) => {
    halo.material.opacity = a; core.material.opacity = a; ring.material.opacity = 0.8 * a;
    const v = a > 0.01; obj.visible = v;
    if (v) { obj.updateMatrixWorld(); startFx(); } else if (sp.trailH || sp.emH) sp.resetFx();
  };
  sp.update = (t) => { const k = (1 + Math.sin(t * 5 + sp.pulse) * 0.08) * (sp.k ?? 1); ring.material.rotation = t * 1.5 + sp.pulse; core.material.rotation = -t * 0.7; halo.scale.setScalar(size * 2.4 * k); core.scale.setScalar(size * 0.7 * k); ring.scale.setScalar(size * 1.2 * k); };
  sp.stop = () => sp.resetFx();
  return sp;
}

// ------------------------------------------------------------------ rune circle (horizontal additive plane)
export function makeRune(stage, color, radius) {
  const m = stage.mat(new THREE.MeshBasicMaterial({ map: runeTex(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const g = stage.geo(new THREE.PlaneGeometry(2, 2)); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m); mesh.scale.setScalar(radius); mesh.renderOrder = 13; stage.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ light pillar (open cylinder, vertical fade)
const PILLAR_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const PILLAR_FS = `uniform vec3 uColor; uniform float uOpacity, uTime; varying vec2 vUv;
  void main(){ float v = vUv.y; float fade = smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.35, 1.0, v));
    float streak = 0.65 + 0.35 * sin(vUv.x * 37.7 + uTime * 3.0) * sin(vUv.x * 12.6 - uTime * 1.7 + v * 6.0);
    float a = uOpacity * fade * streak; gl_FragColor = vec4(uColor * a * 1.25 + vec3(a * 0.12), 1.0); }`;
export function makePillar(stage, color, radius, height) {
  const m = stage.mat(new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const g = stage.geo(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true)); g.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(g, m); mesh.scale.set(radius, height, radius); mesh.renderOrder = 13; mesh.frustumCulled = false; stage.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ void mist (billboard cloud volume, 1 draw call)
const MIST_VS = `attribute float aSize; attribute float aPhase; uniform float uTime, uScale, uGrow; varying float vA; varying float vPh;
  void main(){ vec3 p = position; float ph = aPhase * 6.283;
    p.x += sin(uTime * 0.23 + ph) * 3.0; p.z += cos(uTime * 0.19 + ph * 1.3) * 3.0; p.y += sin(uTime * 0.31 + ph) * 1.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    float g = clamp(uGrow * 1.25 - aPhase * 0.25, 0.0, 1.0); vA = g; vPh = aPhase;
    gl_PointSize = aSize * g * uScale / max(1.0, -mv.z); }`;
const MIST_FS = `uniform sampler2D uMap; uniform vec3 uColA, uColB; uniform float uOpacity, uTime; varying float vA; varying float vPh;
  void main(){ vec2 c = gl_PointCoord - 0.5; float r = sin(uTime * 0.1 + vPh * 6.0); vec2 uv = vec2(c.x * cos(r) - c.y * sin(r), c.x * sin(r) + c.y * cos(r)) + 0.5;
    vec4 t = texture2D(uMap, uv); float a = t.a * uOpacity * vA * 1.6; vec3 col = mix(uColA, uColB, vPh);
    gl_FragColor = vec4(col, a); }`;
export function makeMist(stage, center, { count = 90, radius = 40, height = 30, size = 34, colA = 0x1a0826, colB = 0x5a1f78 } = {}) {
  const g = stage.geo(new THREE.BufferGeometry());
  const pos = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * height; pos[i * 3 + 2] = Math.sin(a) * r;
    sz[i] = size * (0.6 + Math.random() * 0.8); ph[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = stage.mat(new THREE.ShaderMaterial({
    uniforms: { uMap: { value: smokeTex() }, uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) }, uOpacity: { value: 0.9 }, uTime: { value: 0 }, uScale: { value: 600 }, uGrow: { value: 0 } },
    vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, fog: false,
  }));
  const pts = new THREE.Points(g, m); pts.position.copy(center); pts.frustumCulled = false; pts.renderOrder = 12; stage.add(pts);
  pts.userData.u = m.uniforms;
  pts.userData.tick = (t) => { m.uniforms.uTime.value = t; m.uniforms.uScale.value = stage.game.renderer.domElement.height * 0.9; };
  return pts;
}

// ------------------------------------------------------------------ sky lanterns / glowing motes (Points, 1 draw call)
const MOTE_VS = `attribute float aPhase; uniform float uTime, uScale, uRise, uSize; varying float vPh;
  void main(){ vec3 p = position; float ph = aPhase * 6.283; p.y += mod(uTime * uRise * (0.6 + aPhase * 0.8), 60.0);
    p.x += sin(uTime * 0.5 + ph) * 1.2; p.z += cos(uTime * 0.4 + ph) * 1.2; vPh = aPhase;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uSize * uScale / max(1.0, -mv.z), 28.0); }`;
const MOTE_FS = `uniform sampler2D uMap; uniform vec3 uColA, uColB; uniform float uOpacity, uTime; varying float vPh;
  void main(){ vec4 t = texture2D(uMap, gl_PointCoord); float f = 0.75 + 0.25 * sin(uTime * 7.0 + vPh * 40.0);
    vec3 c = mix(uColA, uColB, vPh); float a = t.a * uOpacity * f; gl_FragColor = vec4(c * a * 1.5, 1.0); }`;
export function makeMotes(stage, center, { count = 40, radius = 30, height = 10, size = 1.6, rise = 1.2, colA = 0xffb050, colB = 0xffe0a0 } = {}) {
  const g = stage.geo(new THREE.BufferGeometry());
  const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * height; pos[i * 3 + 2] = Math.sin(a) * r; ph[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = stage.mat(new THREE.ShaderMaterial({
    uniforms: { uMap: { value: glowTex() }, uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uScale: { value: 600 }, uRise: { value: rise }, uSize: { value: size } },
    vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  const pts = new THREE.Points(g, m); pts.position.copy(center); pts.frustumCulled = false; pts.renderOrder = 13; stage.add(pts);
  pts.userData.u = m.uniforms;
  pts.userData.tick = (t) => { m.uniforms.uTime.value = t; m.uniforms.uScale.value = stage.game.renderer.domElement.height * 0.9; };
  return pts;
}

// ------------------------------------------------------------------ golem silhouette (dark rocks + red eyes)
export function makeColossus(stage, scale = 1) {
  const root = new THREE.Group();
  const m = stage.mat(new THREE.MeshBasicMaterial({ color: 0x07040c, fog: false }));
  const ico = stage.geo(new THREE.IcosahedronGeometry(1, 0));
  const rock = (x, y, z, sx, sy, sz, rz = 0) => { const r = new THREE.Mesh(ico, m); r.position.set(x, y, z); r.scale.set(sx, sy, sz); r.rotation.set(0.3, x * 0.2, rz); root.add(r); return r; };
  rock(0, 12, 0, 6.5, 6, 5); rock(0, 6, 0, 4.5, 3.5, 4);           // torso / pelvis
  rock(0, 19.5, 0.6, 3.2, 2.6, 3);                                   // head
  rock(-8.5, 14, 0, 3.4, 3, 3); rock(8.5, 14, 0, 3.4, 3, 3);         // shoulders
  rock(-10, 8, 0.5, 2.4, 3.6, 2.4, 0.2); rock(10, 8, 0.5, 2.4, 3.6, 2.4, -0.2); // arms
  rock(-10.8, 2.4, 1, 3.2, 3, 3.2); rock(10.8, 2.4, 1, 3.2, 3, 3.2); // fists
  rock(-3.2, 1, 0, 2.6, 3.5, 2.6); rock(3.2, 1, 0, 2.6, 3.5, 2.6);   // legs
  for (const s of [-1, 1]) { const e = stage.sprite(0xff3a20, 2.6, starTex(), 1); e.position.set(s * 1.15, 19.9, 3.3); e.renderOrder = 15; root.add(e); const h = stage.sprite(0xff1a10, 4.5, glowTex(), 0.7); h.position.copy(e.position); root.add(h); }
  const core = stage.sprite(0xa02cff, 9, glowTex(), 0.8); core.position.set(0, 12.5, 5.5); root.add(core);
  root.scale.setScalar(scale); stage.add(root);
  root.userData.eyes = root.children.filter((c) => c.isSprite);
  return root;
}
