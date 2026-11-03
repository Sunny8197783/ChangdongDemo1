// Procedural canvas textures for VFX: particle atlas (4x4 frames) + ground decal textures.
import * as THREE from 'three';

export const ATLAS_COLS = 4;
export const FRAMES = {
  soft: 0, glow: 0, spark: 1, star: 1, smoke: 2, shard: 3, ember: 4, snow: 5, leaf: 6, ring: 7,
  streak: 8, crescent: 9, puff: 10, dot: 11, flare: 12, rock: 13, bolt: 14, mote: 15,
};

// Small deterministic value noise for textures.
function makeNoise(seed = 1) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const N = 64, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const at = (x, y) => g[((y & (N - 1)) * N) + (x & (N - 1))];
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, o = 4) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { t += vn(x * f, y * f) * a; f *= 2; a *= 0.5; } return t; };
  return { rnd, vn, fbm };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Draw a frame into atlas cell via per-pixel function returning [r,g,b,a] 0..1 (white-based shapes).
function pixelFrame(ctx, cell, S, fn) {
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
    const o = fn(u, v);
    const i = (y * S + x) * 4;
    d[i] = Math.min(255, o[0] * 255); d[i + 1] = Math.min(255, o[1] * 255); d[i + 2] = Math.min(255, o[2] * 255);
    d[i + 3] = Math.max(0, Math.min(255, o[3] * 255));
  }
  const cx = (cell % ATLAS_COLS) * S, cy = Math.floor(cell / ATLAS_COLS) * S;
  ctx.putImageData(img, cx, cy);
}

const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function buildAtlas() {
  const S = 128;
  const c = canvas(S * ATLAS_COLS, S * ATLAS_COLS);
  const ctx = c.getContext('2d');
  const nz = makeNoise(7);
  const out = [0, 0, 0, 0];
  const W = (a, l = 1) => { out[0] = l; out[1] = l; out[2] = l; out[3] = a; return out; };

  // 0 soft glow: gaussian with hot core
  pixelFrame(ctx, 0, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const a = Math.exp(-r * r * 5.5) * sat(1 - r);
    return W(a);
  });
  // 1 sharp 4-point star spark
  pixelFrame(ctx, 1, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const ax = Math.abs(u), ay = Math.abs(v);
    const rays = Math.exp(-ay * 26) * sat(1 - ax) + Math.exp(-ax * 26) * sat(1 - ay);
    const diag = 0.35 * (Math.exp(-Math.abs(u - v) * 30) + Math.exp(-Math.abs(u + v) * 30)) * sat(1 - r * 1.6);
    const core = Math.exp(-r * r * 40);
    return W(sat(rays * 0.9 + diag + core) * sat(1 - r));
  });
  // 2 smoke puff (noisy, lumpy)
  pixelFrame(ctx, 2, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const n = nz.fbm(u * 2.4 + 9, v * 2.4 + 3, 5);
    const edge = 1 - sstep(0.35, 1.0, r + (n - 0.5) * 0.7);
    const shade = 0.72 + 0.28 * sat(1 - (u * 0.5 + v * 0.7 + 0.4)) ; // lit from top-left
    return W(edge * (0.55 + 0.45 * n), shade);
  });
  // 3 ice shard: elongated diamond with facet shading
  pixelFrame(ctx, 3, S, (u, v) => {
    // elongated along u (x) so velocity-stretched quads align the shard with its motion
    const ax = Math.abs(v) / 0.3, ay = Math.abs(u) / 0.95;
    const d = ax + ay;
    if (d > 1) return W(0);
    const facet = v > 0 ? 1.0 : 0.72;
    const edge = sstep(1, 0.82, d);
    const rim = sstep(0.75, 0.98, d) * 0.6;
    const l = facet * (0.75 + 0.25 * (1 - ay)) + rim;
    return W(edge, l);
  });
  // 4 ember: small bright core with flicker tail
  pixelFrame(ctx, 4, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const a = Math.exp(-r * r * 22) + 0.35 * Math.exp(-r * r * 6);
    return W(sat(a) * sat(1 - r));
  });
  // 5 snowflake: 6 arms with ticks
  {
    const cx = 1 * S, cy = 1 * S;
    ctx.save(); ctx.translate(cx + S / 2, cy + S / 2);
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 3);
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -52); ctx.stroke();
      ctx.lineWidth = 4;
      for (const t of [22, 36]) {
        const l = t === 22 ? 16 : 11;
        ctx.beginPath(); ctx.moveTo(0, -t); ctx.lineTo(l, -t - l); ctx.moveTo(0, -t); ctx.lineTo(-l, -t - l); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 6 leaf: almond shape with midrib, two-tone (used normal-blended, tinted)
  pixelFrame(ctx, 6, S, (u, v) => {
    const y = v / 0.9;
    const w = 0.42 * Math.sqrt(sat(1 - y * y)) * (1 - 0.25 * y);
    const ax = Math.abs(u);
    if (ax > w || Math.abs(y) > 1) {
      // stem
      if (y > 0.95 && y < 1.1 && ax < 0.03) return W(1, 0.6);
      return W(0);
    }
    const rib = Math.exp(-ax * 60) * 0.35;
    const vein = 0.12 * Math.exp(-Math.abs(((ax * 6 - y * 3) % 1 + 1) % 1 - 0.5) * 18) * sstep(0.02, 0.06, ax);
    const l = (u > 0 ? 0.95 : 0.78) + rib + vein;
    const a = sstep(w, w - 0.04, ax);
    return W(a, l);
  });
  // 7 ring
  pixelFrame(ctx, 7, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const a = Math.exp(-Math.pow((r - 0.78) / 0.09, 2)) + 0.25 * Math.exp(-Math.pow((r - 0.78) / 0.22, 2));
    return W(sat(a));
  });
  // 8 streak: horizontal line (used for velocity-stretched sparks; quad x axis follows velocity)
  pixelFrame(ctx, 8, S, (u, v) => {
    const a = Math.exp(-v * v * 30) * sat(1 - u * u) * (1 - 0.3 * u);
    const core = Math.exp(-v * v * 160) * sat(1 - u * u * 1.4);
    return W(sat(a * 0.8 + core));
  });
  // 9 crescent: swoosh arc (wind)
  pixelFrame(ctx, 9, S, (u, v) => {
    const r = Math.sqrt(u * u + (v + 0.15) * (v + 0.15));
    const ang = Math.atan2(v + 0.15, u);           // -pi..pi
    const t = sat((ang + Math.PI * 0.95) / (Math.PI * 0.9)); // 0..1 across the top arc
    if (v + 0.15 > 0.15) return W(0);
    const thick = 0.04 + 0.13 * Math.sin(t * Math.PI);
    const band = Math.exp(-Math.pow((r - 0.7) / thick, 2));
    return W(sat(band * Math.sin(t * Math.PI) * 1.2));
  });
  // 10 puff: rounder dense cloud (dust)
  pixelFrame(ctx, 10, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const n = nz.fbm(u * 3.1 + 21, v * 3.1 + 11, 4);
    const a = (1 - sstep(0.25, 0.95, r + (n - 0.5) * 0.45)) * (0.75 + 0.25 * n);
    return W(a, 0.8 + 0.2 * n);
  });
  // 11 dot: small hard circle
  pixelFrame(ctx, 11, S, (u, v) => { const r = Math.sqrt(u * u + v * v); return W(sstep(0.6, 0.45, r)); });
  // 12 flare: big glow with wide halo & core (flash sprites)
  pixelFrame(ctx, 12, S, (u, v) => {
    const r = Math.sqrt(u * u + v * v);
    const a = 0.65 * Math.exp(-r * r * 12) + 0.35 * Math.exp(-r * 3.2) * sat(1 - r);
    const rays = 0.25 * (Math.exp(-Math.abs(v) * 40) + Math.exp(-Math.abs(u) * 40)) * sat(1 - r);
    return W(sat(a + rays) * sat(1.05 - r));
  });
  // 13 rock chip silhouette (dust/gravel)
  pixelFrame(ctx, 13, S, (u, v) => {
    const ang = Math.atan2(v, u), r = Math.sqrt(u * u + v * v);
    const rr = 0.55 + 0.18 * Math.sin(ang * 3 + 1) + 0.1 * Math.sin(ang * 5 + 2);
    const a = sstep(rr, rr - 0.05, r);
    return W(a, 0.7 + 0.3 * sat(-u * 0.5 - v * 0.5 + 0.5));
  });
  // 14 bolt: jagged little zigzag (electric crackle)
  {
    const cx = 2 * S, cy = 3 * S;
    ctx.save(); ctx.translate(cx + S / 2, cy + S / 2);
    ctx.strokeStyle = '#fff'; ctx.lineJoin = 'miter'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
    const pts = [[-56, -10], [-30, 8], [-12, -14], [8, 12], [26, -6], [56, 10]];
    for (const [lw, al] of [[9, 0.35], [4, 1]]) {
      ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
    ctx.restore();
  }
  // 15 mote: soft tiny glow with sharper falloff
  pixelFrame(ctx, 15, S, (u, v) => { const r = Math.sqrt(u * u + v * v); return W(sat(Math.exp(-r * r * 14) * 1.2) * sat(1 - r)); });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = false;
  return tex;
}

// Decal textures: R channel = mask (alpha), G = glow mask, B = detail lightness.
function buildDecal(kind) {
  const S = 256;
  const c = canvas(S, S); const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S); const d = img.data;
  const nz = makeNoise(kind.length * 13 + 5);
  // crack network precompute (for 'crack')
  const cracks = [];
  if (kind === 'crack' || kind === 'frost') {
    const n = kind === 'crack' ? 9 : 14;
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + nz.rnd() * 0.5, x = 0, y = 0;
      const pts = [[x, y]];
      const steps = 6 + Math.floor(nz.rnd() * 4);
      for (let s = 0; s < steps; s++) {
        a += (nz.rnd() - 0.5) * 0.9; const l = 0.08 + nz.rnd() * 0.08;
        x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]);
        if (kind === 'frost' && nz.rnd() < 0.5) { // side branch
          const ba = a + (nz.rnd() < 0.5 ? 1 : -1) * (0.6 + nz.rnd() * 0.5), bl = 0.05 + nz.rnd() * 0.08;
          cracks.push([[x, y], [x + Math.cos(ba) * bl, y + Math.sin(ba) * bl]]);
        }
      }
      cracks.push(pts);
    }
  }
  const segDist = (px, py) => {
    let best = 9;
    for (const pts of cracks) for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay; const t = sat(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
      const ex = px - ax - dx * t, ey = py - ay - dy * t; const dd = Math.sqrt(ex * ex + ey * ey);
      if (dd < best) best = dd;
    }
    return best;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
    const r = Math.sqrt(u * u + v * v), ang = Math.atan2(v, u);
    const n = nz.fbm(u * 4 + 3, v * 4 + 7, 5);
    let m = 0, g = 0, l = 1;
    if (kind === 'scorch') {
      const edge = 0.62 + 0.25 * nz.fbm(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5, 3);
      m = (1 - sstep(edge * 0.55, edge, r)) * (0.65 + 0.35 * n);
      // radial splat streaks
      m += 0.35 * sstep(0.55, 0.9, nz.vn(ang * 6 + 40, 1)) * sat(1 - r * 1.05) * sstep(0.2, 0.5, r);
      g = sstep(0.55, 0.85, n) * (1 - sstep(0.1, edge * 0.9, r)) + 0.5 * Math.exp(-r * r * 18);
      l = 0.4 + 0.6 * n;
    } else if (kind === 'frost') {
      const cd = segDist(u, v);
      const crystal = Math.exp(-cd * 70) * sat(1 - r);
      const base = (1 - sstep(0.35, 0.95, r + (n - 0.5) * 0.4)) * 0.55;
      m = sat(base + crystal * 0.9);
      g = crystal * 0.8 + 0.3 * Math.exp(-r * r * 10);
      l = 0.75 + 0.25 * n;
    } else if (kind === 'crack') {
      const cd = segDist(u, v);
      const crack = Math.exp(-cd * 90) * sat(1.1 - r);
      const dent = (1 - sstep(0.15, 0.6, r + (n - 0.5) * 0.3)) * 0.55;
      const dust = (1 - sstep(0.3, 1.0, r + (n - 0.5) * 0.5)) * 0.35;
      m = sat(crack + dent + dust);
      g = crack * sstep(0.7, 0.2, r);
      l = 0.5 + 0.5 * n;
    } else if (kind === 'rune') {
      const ring = (rr, w) => Math.exp(-Math.pow((r - rr) / w, 2));
      let a = ring(0.92, 0.025) + ring(0.8, 0.018) + 0.6 * ring(0.42, 0.02);
      // glyph ticks between rings
      const seg = ((ang / (Math.PI * 2)) * 24 + 24) % 1;
      if (r > 0.82 && r < 0.9) a += sstep(0.4, 0.3, Math.abs(seg - 0.5)) * 0.9 * (Math.floor((ang + 4) * 3.8) % 3 ? 1 : 0.3);
      // hexagram lines
      for (let k = 0; k < 6; k++) {
        const t = k * Math.PI / 3; const px = Math.cos(t), py = Math.sin(t);
        const dist = Math.abs(u * py - v * px - 0) ; // through center
        const dl = Math.abs((u * Math.cos(t + Math.PI / 2) + v * Math.sin(t + Math.PI / 2)) - 0.4);
        a += Math.exp(-dl * dl * 6000) * (r < 0.8 ? 1 : 0) * 0.8;
        void dist;
      }
      a += 0.15 * Math.exp(-r * r * 3);
      m = sat(a); g = m; l = 1;
    } else { // soft
      m = Math.exp(-r * r * 3) * sat(1 - r); g = m; l = 1;
    }
    m *= sstep(1.0, 0.92, r);
    const i = (y * S + x) * 4;
    d[i] = sat(m) * 255; d[i + 1] = sat(g) * 255; d[i + 2] = sat(l) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function createTextures() {
  const atlas = buildAtlas();
  const decals = {};
  for (const k of ['scorch', 'frost', 'crack', 'rune', 'soft']) decals[k] = buildDecal(k);
  // Standalone glow texture for sprites (projectile cores)
  const gc = canvas(128, 128); const g = gc.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const glow = new THREE.CanvasTexture(gc); glow.colorSpace = THREE.SRGBColorSpace;
  return { atlas, decals, glow, frames: FRAMES };
}
