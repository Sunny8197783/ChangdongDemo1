// tells sprites (PLAN v4 §5.1, §5.5): ONE instanced batch (1 draw call, 1 program) of camera-facing quads over a
// canvas-drawn mask atlas: glint star (lock; gold for parry), ⚠ (unblockable), ⤒ (jump), ! (strong emphasis),
// rotating diamond sparkles (punish), rising vertical chevrons (safe zones) and the '공격 기회!' world text.
// Atlas channels: R = fill mask, G = outline mask (dilated); colours are per-sprite (linear) → sRGB output.
// Reserved shapes (diamond sparkle, rising chevron) are drawn only here (threat scene), never by player effects.
import * as THREE from 'three';
import { TELLS_TEXT_KO } from './text.js';
import { setRange } from './decals.js';

export const SPRITE_CAP = 64;
const STRIDE = 20;
const AT = 512, CELL = 128;
/** Atlas cells: uv rects in [0, 1]. */
export const CELLS = {
  star: [0, 0], diamond: [1, 0], chevron: [2, 0], warn: [3, 0],
  jump: [0, 1], bang: [1, 1], ring: [2, 1],
  text: [0, 3, 4, 1],            // full-width row
};

const VERT = /* glsl */`
  attribute vec4 s0; attribute vec4 s1; attribute vec4 s2; attribute vec4 s3; attribute vec4 s4;
  uniform float uResY;
  varying vec2 vUv; varying vec4 vCol; varying vec3 vOut;
  void main() {
    vec4 mv = viewMatrix * vec4(s0.xyz, 1.0);
    float size = s0.w;
    float depth = max(0.1, -mv.z);
    float minSize = s4.y * 2.0 * depth / (projectionMatrix[1][1] * uResY);
    size = max(size, minSize);
    vec2 c = position.xy;
    float cr = cos(s3.w), sr = sin(s3.w);
    c = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y);
    mv.xy += c * vec2(size * s4.x, size);
    gl_Position = projectionMatrix * mv;
    vUv = vec2(mix(s1.x, s1.z, position.x + 0.5), mix(s1.w, s1.y, position.y + 0.5));
    vCol = s2; vOut = s3.xyz;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uAtlas;
  varying vec2 vUv; varying vec4 vCol; varying vec3 vOut;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    float a = max(t.r, t.g) * vCol.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vOut, vCol.rgb, t.r / max(1e-3, max(t.r, t.g))), a);
    #include <colorspace_fragment>
  }`;

function drawAtlas() {
  const cv = document.createElement('canvas'); cv.width = AT; cv.height = AT;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, AT, AT);
  x.lineJoin = 'round'; x.lineCap = 'round';
  const FILL = 'rgb(255,0,0)', OUT = 'rgb(0,255,0)';
  // each shape is drawn twice: outline (green, thick stroke + fill) then fill (red) added on top ('lighter')
  const cell = (cx, cy, path, { stroke = 0, outline = 12 } = {}) => {
    x.save(); x.translate(cx * CELL + CELL / 2, cy * CELL + CELL / 2);
    x.globalCompositeOperation = 'lighter';
    x.strokeStyle = OUT; x.fillStyle = OUT; x.lineWidth = (stroke || 0) + outline;
    x.beginPath(); path(); if (!stroke) x.fill(); x.stroke();
    x.strokeStyle = FILL; x.fillStyle = FILL; x.lineWidth = stroke || 0.01;
    x.beginPath(); path(); if (stroke) x.stroke(); else x.fill();
    x.restore();
  };
  // glint star (4 long + 4 short points)
  cell(0, 0, () => {
    const pts = 8;
    for (let i = 0; i <= pts * 2; i++) {
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 9 : (i / 2) % 2 ? 30 : 52;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
  }, { outline: 10 });
  // diamond sparkle
  cell(1, 0, () => { x.moveTo(0, -50); x.lineTo(30, 0); x.lineTo(0, 50); x.lineTo(-30, 0); x.closePath(); }, { outline: 14 });
  // rising chevron (points up)
  cell(2, 0, () => { x.moveTo(-40, 22); x.lineTo(0, -18); x.lineTo(40, 22); }, { stroke: 16, outline: 12 });
  // ⚠ warning triangle with a cut-out bang
  cell(3, 0, () => {
    x.moveTo(0, -50); x.lineTo(54, 44); x.lineTo(-54, 44); x.closePath();
  }, { outline: 12 });
  x.save(); x.globalCompositeOperation = 'destination-out'; x.translate(3 * CELL + CELL / 2, CELL / 2);
  x.fillStyle = 'rgb(0,0,0)'; x.fillRect(-6, -18, 12, 38); x.fillRect(-6, 26, 12, 11); x.restore();
  x.save(); x.globalCompositeOperation = 'lighter'; x.translate(3 * CELL + CELL / 2, CELL / 2);
  x.fillStyle = OUT; x.fillRect(-6, -18, 12, 38); x.fillRect(-6, 26, 12, 11); x.restore();
  // ⤒ jump: bar on top, arrow up
  cell(0, 1, () => {
    x.moveTo(-36, -44); x.lineTo(36, -44);
    x.moveTo(0, 46); x.lineTo(0, -26); x.moveTo(-26, 0); x.lineTo(0, -28); x.lineTo(26, 0);
  }, { stroke: 13, outline: 12 });
  // ! bang
  cell(1, 1, () => { x.moveTo(0, -44); x.lineTo(0, 16); x.moveTo(0, 40); x.lineTo(0, 41); }, { stroke: 18, outline: 12 });
  // small ring (marker accents)
  cell(2, 1, () => { x.arc(0, 0, 40, 0, Math.PI * 2); }, { stroke: 12, outline: 10 });
  // world text
  x.save(); x.translate(AT / 2, 3 * CELL + CELL / 2);
  x.globalCompositeOperation = 'lighter';
  x.font = 'bold 64px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 14; x.strokeStyle = OUT; x.fillStyle = OUT;
  x.strokeText(TELLS_TEXT_KO.punish, 0, 4); x.fillText(TELLS_TEXT_KO.punish, 0, 4);
  x.fillStyle = FILL; x.fillText(TELLS_TEXT_KO.punish, 0, 4);
  x.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  return tex;
}

export function createSprites(game) {
  const atlas = drawAtlas();
  const uniforms = { uAtlas: { value: atlas }, uResY: game.post?.canvasRes ? { get value() { return game.post.canvasRes.value.y || 360; } } : { value: 360 } };
  const material = new THREE.ShaderMaterial({
    name: 'tells-sprite', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
  });
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
  const arr = new Float32Array(SPRITE_CAP * STRIDE);
  const ib = new THREE.InstancedInterleavedBuffer(arr, STRIDE, 1); ib.setUsage(THREE.DynamicDrawUsage);
  ['s0', 's1', 's2', 's3', 's4'].forEach((n, k) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(ib, 4, k * 4)));
  geo.instanceCount = 0; geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'tells-sprites'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 20; mesh.visible = false;
  const recs = [];
  for (let i = 0; i < SPRITE_CAP; i++) recs.push({ active: false, x: 0, y: 0, z: 0, size: 0.5, cell: 'star', col: new THREE.Color(), outl: new THREE.Color(), alpha: 1, rot: 0, minPx: 0, aspect: 1, kind: '', owner: null });
  const uv = {};
  for (const [k, c] of Object.entries(CELLS)) {
    const w = c[2] || 1, h = c[3] || 1;
    uv[k] = [c[0] * CELL / AT, c[1] * CELL / AT, (c[0] + w) * CELL / AT, (c[1] + h) * CELL / AT];
  }
  let warned = false;
  function alloc(kind) {
    for (const s of recs) if (!s.active) { s.active = true; s.kind = kind || ''; s.alpha = 1; s.rot = 0; s.minPx = 0; s.aspect = 1; s.owner = null; return s; }
    if (!warned) { warned = true; console.warn('[tells] sprite pool full (64)'); }
    return null;
  }
  function free(s) { if (s) { s.active = false; s.owner = null; } }
  let live = 0;
  const range = { start: 0, count: 0 };
  function frame() {
    let n = 0;
    for (let i = 0; i < recs.length; i++) {
      const s = recs[i];
      if (!s.active || s.alpha <= 0.003) continue;
      const b = n * STRIDE, u = uv[s.cell] || uv.star;
      arr[b] = s.x; arr[b + 1] = s.y; arr[b + 2] = s.z; arr[b + 3] = s.size;
      arr[b + 4] = u[0]; arr[b + 5] = u[1]; arr[b + 6] = u[2]; arr[b + 7] = u[3];
      arr[b + 8] = s.col.r; arr[b + 9] = s.col.g; arr[b + 10] = s.col.b; arr[b + 11] = s.alpha;
      arr[b + 12] = s.outl.r; arr[b + 13] = s.outl.g; arr[b + 14] = s.outl.b; arr[b + 15] = s.rot;
      arr[b + 16] = s.aspect; arr[b + 17] = s.minPx; arr[b + 18] = 0; arr[b + 19] = 0;
      n++;
    }
    live = n;
    geo.instanceCount = n; mesh.visible = n > 0;
    if (n > 0) { setRange(ib, range, n * STRIDE); ib.needsUpdate = true; }
  }
  function count(kind) { let n = 0; for (const s of recs) if (s.active && (!kind || s.kind === kind)) n++; return n; }
  return { mesh, material, atlas, recs, alloc, free, frame, count, get live() { return live; } };
}
