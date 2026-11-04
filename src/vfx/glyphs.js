// Glyph atlas (PLAN v4 §3.4 GL). Owner: vfx. 1024² single-channel SDF (R8), 4×4 cells of 256 px, generated at boot by a
// distance transform of canvas-drawn glyphs (crispness from the SDF, any size). Edge = 0.5; inside > 0.5; spread 16 px.
import * as THREE from 'three';

export const GLYPHS = ['fire', 'ice', 'lightning', 'wind', 'water', 'earth', 'nature', 'light', 'shadow',
  'hexagram', 'futhark', 'ticks12', 'lichtenberg', 'frosthex', 'flower5', 'feather'];
export const GLYPH_INDEX = Object.fromEntries(GLYPHS.map((g, i) => [g, i]));
const N = 1024, CELL = 256, COLS = 4, SPREAD = 16;

// ---- drawing (each in a 256 cell, centre (128,128), usable radius ~112) ----
const TAU = Math.PI * 2;
function polar(x, a, r) { return [128 + Math.cos(a) * r, 128 + Math.sin(a) * r]; }
function ring(x, r) { x.beginPath(); x.arc(128, 128, r, 0, TAU); x.stroke(); }
const DRAW = {
  fire(x) {   // 3-petal flame inside a ring
    ring(x, 108);
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + k * TAU / 3;
      x.save(); x.translate(128, 128); x.rotate(a + Math.PI / 2);
      x.beginPath(); x.moveTo(0, -8); x.bezierCurveTo(30, -30, 22, -70, 0, -96); x.bezierCurveTo(-22, -70, -30, -30, 0, -8); x.stroke();
      x.beginPath(); x.moveTo(0, -30); x.quadraticCurveTo(10, -50, 0, -68); x.stroke();
      x.restore();
    }
  },
  ice(x) {    // 6-fold snowflake hex
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6;
      const [ex, ey] = polar(x, a, 100);
      x.beginPath(); x.moveTo(128, 128); x.lineTo(ex, ey); x.stroke();
      for (const t of [0.45, 0.72]) {
        const [bx, by] = polar(x, a, 100 * t);
        for (const s of [-1, 1]) { const [cx, cy] = [bx + Math.cos(a + s * 0.8) * 26 * (1.1 - t), by + Math.sin(a + s * 0.8) * 26 * (1.1 - t)]; x.beginPath(); x.moveTo(bx, by); x.lineTo(cx, cy); x.stroke(); }
      }
    }
    x.beginPath(); for (let k = 0; k <= 6; k++) { const [px, py] = polar(x, k * TAU / 6 + Math.PI / 6, 34); if (k) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
  },
  lightning(x) {   // forked rune
    ring(x, 108);
    x.beginPath(); x.moveTo(150, 30); x.lineTo(100, 120); x.lineTo(150, 128); x.lineTo(104, 226); x.stroke();
    x.beginPath(); x.moveTo(126, 124); x.lineTo(70, 150); x.lineTo(84, 186); x.stroke();
    x.beginPath(); x.moveTo(140, 176); x.lineTo(186, 196); x.stroke();
  },
  wind(x) {   // triple spiral
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      for (let i = 0; i <= 60; i++) { const t = i / 60, a = k * TAU / 3 + t * 4.2, r = 10 + t * 92; const px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
  },
  water(x) {  // wave crown
    ring(x, 108);
    for (let row = 0; row < 3; row++) {
      x.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40, px = 44 + t * 168, py = 92 + row * 34 + Math.sin(t * TAU * 2 + row) * 12; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
    x.beginPath(); x.moveTo(84, 70); x.lineTo(100, 42); x.lineTo(128, 64); x.lineTo(156, 42); x.lineTo(172, 70); x.stroke();
  },
  earth(x) {  // strata diamond
    x.beginPath(); x.moveTo(128, 20); x.lineTo(226, 128); x.lineTo(128, 236); x.lineTo(30, 128); x.closePath(); x.stroke();
    for (const y of [92, 128, 164]) { const w = 98 - Math.abs(y - 128) * 0.9; x.beginPath(); x.moveTo(128 - w + 8, y); x.lineTo(128 + w - 8, y); x.stroke(); }
  },
  nature(x) { // 5-leaf
    for (let k = 0, n5 = 5; k < n5; k++) {
      x.save(); x.translate(128, 128); x.rotate(k * TAU / 5);
      x.beginPath(); x.moveTo(0, -10); x.bezierCurveTo(30, -40, 24, -80, 0, -104); x.bezierCurveTo(-24, -80, -30, -40, 0, -10); x.stroke();
      x.beginPath(); x.moveTo(0, -18); x.lineTo(0, -86); x.stroke();
      x.restore();
    }
  },
  light(x) {  // 8-ray star
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8, long = k % 2 === 0 ? 108 : 70;
      const [ex, ey] = polar(x, a, long);
      const [l1x, l1y] = polar(x, a + 0.18, 22), [l2x, l2y] = polar(x, a - 0.18, 22);
      x.beginPath(); x.moveTo(l1x, l1y); x.lineTo(ex, ey); x.lineTo(l2x, l2y); x.stroke();
    }
    ring(x, 22);
  },
  shadow(x) { // crescent eye
    x.beginPath(); x.arc(128, 128, 100, Math.PI * 0.15, Math.PI * 1.85); x.stroke();
    x.beginPath(); x.arc(160, 128, 78, Math.PI * 0.62, Math.PI * 1.38); x.stroke();
    x.beginPath(); x.ellipse(118, 128, 34, 18, 0, 0, TAU); x.stroke();
    x.beginPath(); x.arc(118, 128, 7, 0, TAU); x.fill();
  },
  hexagram(x) {
    ring(x, 112); ring(x, 98);
    for (const off of [0, Math.PI / 3]) { x.beginPath(); for (let k = 0; k <= 3; k++) { const [px, py] = polar(x, off - Math.PI / 2 + k * TAU / 3, 96); if (k) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
    ring(x, 40);
  },
  futhark(x) { // band of runes on a ring
    ring(x, 112); ring(x, 74);
    for (let k = 0; k < 12; k++) {
      x.save(); x.translate(128, 128); x.rotate(k * TAU / 12);
      const v = k % 4;
      x.beginPath(); x.moveTo(0, -80); x.lineTo(0, -106);
      if (v === 0) { x.moveTo(0, -98); x.lineTo(9, -88); }
      else if (v === 1) { x.moveTo(-8, -102); x.lineTo(8, -86); x.moveTo(8, -102); x.lineTo(-8, -86); }
      else if (v === 2) { x.moveTo(0, -104); x.lineTo(9, -96); x.lineTo(0, -90); }
      else { x.moveTo(0, -94); x.lineTo(-9, -84); x.moveTo(0, -94); x.lineTo(9, -84); }
      x.stroke(); x.restore();
    }
  },
  ticks12(x) {
    ring(x, 104);
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; const [ax, ay] = polar(x, a, k % 3 === 0 ? 70 : 84), [bx, by] = polar(x, a, 104); x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); }
  },
  lichtenberg(x) {   // deterministic branching
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const branch = (px, py, a, len, depth) => {
      if (depth > 4 || len < 8) return;
      let cx = px, cy = py;
      x.beginPath(); x.moveTo(cx, cy);
      for (let i = 0; i < 4; i++) { a += (rnd() - 0.5) * 0.9; cx += Math.cos(a) * len / 4; cy += Math.sin(a) * len / 4; x.lineTo(cx, cy); }
      x.stroke();
      branch(cx, cy, a + 0.5, len * 0.62, depth + 1); branch(cx, cy, a - 0.55, len * 0.58, depth + 1);
    };
    for (let k = 0, n5 = 5; k < n5; k++) branch(128, 128, k * TAU / 5 + 0.3, 56, 0);
  },
  frosthex(x) {
    const R = 26, h = R * Math.sqrt(3);
    for (let row = -3; row <= 3; row++) for (let col = -3; col <= 3; col++) {
      const cx = 128 + col * R * 1.5, cy = 128 + row * h + (col & 1 ? h / 2 : 0);
      if (Math.hypot(cx - 128, cy - 128) > 96) continue;
      x.beginPath(); for (let k = 0; k <= 6; k++) { const px = cx + Math.cos(k * TAU / 6) * R, py = cy + Math.sin(k * TAU / 6) * R; if (k) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
    }
  },
  flower5(x) {
    for (let k = 0, n5 = 5; k < n5; k++) { x.save(); x.translate(128, 128); x.rotate(k * TAU / 5); x.beginPath(); x.ellipse(0, -56, 28, 46, 0, 0, TAU); x.stroke(); x.restore(); }
    ring(x, 16);
  },
  feather(x) {
    x.save(); x.translate(128, 128); x.rotate(-0.6);
    x.beginPath(); x.moveTo(0, 104); x.lineTo(0, -104); x.stroke();
    x.beginPath(); x.moveTo(0, -104); x.bezierCurveTo(46, -70, 44, 40, 0, 80); x.moveTo(0, -104); x.bezierCurveTo(-46, -70, -44, 40, 0, 80); x.stroke();
    for (let i = 0; i < 7; i++) { const y = -76 + i * 22; x.beginPath(); x.moveTo(0, y + 10); x.lineTo(30 - Math.abs(i - 3) * 4, y - 6); x.moveTo(0, y + 10); x.lineTo(-30 + Math.abs(i - 3) * 4, y - 6); x.stroke(); }
    x.restore();
  },
};

// ---- 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher) ----
function edt1d(f, d, v, z, n) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
}
function edt2d(grid, w, h) {   // grid: 0 on feature, 1e20 elsewhere → squared distances (in place)
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = grid[y * w + x]; edt1d(f, d, v, z, h); for (let y = 0; y < h; y++) grid[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = grid[y * w + x]; edt1d(f, d, v, z, w); for (let x = 0; x < w; x++) grid[y * w + x] = d[x]; }
}

/** Build the atlas (≈ 60–120 ms once). Returns {tex, uv(name) → [u0, v0, u1, v1], index, GLYPHS}. */
export function createGlyphAtlas() {
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
  GLYPHS.forEach((name, i) => {
    x.save(); x.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
    x.beginPath(); x.rect(0, 0, CELL, CELL); x.clip();
    try { DRAW[name](x); } catch (_) { /* */ }
    x.restore();
  });
  const img = x.getImageData(0, 0, N, N).data;
  const data = new Uint8Array(N * N);
  // per cell SDF (cells are independent: a glyph never bleeds into its neighbour)
  const outside = new Float64Array(CELL * CELL), inside = new Float64Array(CELL * CELL);
  for (let c = 0; c < GLYPHS.length; c++) {
    const ox = (c % COLS) * CELL, oy = Math.floor(c / COLS) * CELL;
    for (let y = 0; y < CELL; y++) for (let xx = 0; xx < CELL; xx++) {
      const on = img[((oy + y) * N + ox + xx) * 4] > 127;
      outside[y * CELL + xx] = on ? 0 : 1e20; inside[y * CELL + xx] = on ? 1e20 : 0;
    }
    edt2d(outside, CELL, CELL); edt2d(inside, CELL, CELL);
    for (let y = 0; y < CELL; y++) for (let xx = 0; xx < CELL; xx++) {
      const k = y * CELL + xx;
      const sd = Math.sqrt(inside[k]) - Math.sqrt(outside[k]);   // > 0 inside the stroke
      data[(oy + y) * N + ox + xx] = Math.max(0, Math.min(255, Math.round((0.5 + sd / (2 * SPREAD)) * 255)));
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.flipY = false; tex.unpackAlignment = 1;
  tex.needsUpdate = true; tex.name = 'kit-glyphs';
  const uvs = {};
  GLYPHS.forEach((g, i) => { const u0 = (i % COLS) / COLS, v0 = Math.floor(i / COLS) / COLS; uvs[g] = [u0, v0, u0 + 1 / COLS, v0 + 1 / COLS]; });
  return { tex, uv: (name) => uvs[name] || null, index: (name) => GLYPH_INDEX[name] ?? -1, GLYPHS, cols: COLS, spread: SPREAD / CELL };
}
