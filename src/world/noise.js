// Deterministic noise / RNG helpers for world generation.

export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iz, seed = 0) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const v = a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  return v * 2 - 1;
}

export function fbm(x, z, oct = 4, seed = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, z * f, seed + i * 17);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]. */
export function ridge(x, z, oct = 4, seed = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0, prev = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 31));
    n *= n;
    sum += n * amp * prev;
    prev = n;
    norm += amp; amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}

export const sstep = (a, b, v) => {
  let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};

export function smin(a, b, k) {
  let h = 0.5 + 0.5 * (b - a) / k; h = h < 0 ? 0 : h > 1 ? 1 : h;
  return b + (a - b) * h - k * h * (1 - h);
}

/** Distance from (x,z) to polyline pts [[x,z],...]; writes segment param to out if given. */
export function distPolyline(x, z, pts, out) {
  let best = Infinity, bestT = 0, bestI = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) { best = d; bestT = t; bestI = i; }
  }
  if (out) { out.i = bestI; out.t = bestT; out.u = (bestI + bestT) / (pts.length - 1); }
  return Math.sqrt(best);
}
