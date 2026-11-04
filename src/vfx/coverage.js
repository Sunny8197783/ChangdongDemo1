// Player-FX budgets (PLAN v4 §1.2, §2.2, §2.6, §3.3; §9 vfx P0-B(2)). Owner: vfx.
//  - castTable: per-castId accounting {particles, handles, calls, coverage} for vfx.debug.byCast (ring of 128, no allocation).
//  - coverage: a cheap runtime estimator (projected area of every live player / enemy / world FX item, after the size clamp)
//    drives the soft / hard budgets (settings.coverageSoft/Hard × quality.budget.coverageMul): over the soft budget the largest
//    contributor shrinks first (soft sprites → other particles), over the hard budget soft sprites stop emitting.
//    Tests measure the truth with the core counting override (PT.fragments({owner:'player'})).
//  - calls: player-FX draw calls of the frame; over settings.fxCalls (40 at medium) the oldest persistent visuals collapse to
//    linework only (vfx.js does the collapsing).
const RING = 128;

export function createCastTable() {
  const E = [];
  for (let i = 0; i < RING; i++) E.push({ id: -1, particles: 0, handles: 0, calls: 0, mask: 0, cov: 0, peak: 0, generic: false, bursts: 0, t0: 0 });
  const entry = (id, create = true) => {
    const e = E[id & (RING - 1)];
    if (e.id !== id) { if (!create) return null; e.id = id; e.particles = 0; e.handles = 0; e.calls = 0; e.mask = 0; e.cov = 0; e.peak = 0; e.generic = false; e.bursts = 0; e.t0 = 0; }
    return e;
  };
  return {
    entry,
    /** a subsystem (bit) drew something for castId */
    touch(id, bit) { if (!(id > 0)) return; const e = entry(id); if (!(e.mask & bit)) { e.mask |= bit; e.calls++; } },
    particles(id, n) { if (id > 0 && n > 0) entry(id).particles += n; },
    handle(id) { if (id > 0) entry(id).handles++; },
    cover(id, c) { const e = E[id & (RING - 1)]; if (e.id === id) e.cov += c; },
    generic(id) { if (id > 0) entry(id).generic = true; },
    frameEnd() { for (let i = 0; i < RING; i++) { const e = E[i]; if (e.id < 0) continue; if (e.cov > e.peak) e.peak = e.cov; e.cov = 0; } },
    get(id) {
      const e = entry(id, false);
      if (!e) return { particles: 0, handles: 0, calls: 0, coverage: 0, generic: false, bursts: 0 };
      return { particles: e.particles, handles: e.handles, calls: e.calls, coverage: +Math.max(e.peak, e.cov).toFixed(4), generic: e.generic, bursts: e.bursts };
    },
  };
}

export function createBudget(game) {
  const st = {
    soft: 1.5, hard: 2.5, callCap: 40, fxDetail: 1,
    softMul: 1, sizeMul: 1, stopSoft: false,
    player: 0, enemy: 0, world: 0, calls: 0, collapsed: 0, overSoft: 0, overHard: 0, frames: 0,
  };
  function read() {
    const v = game.settings?.values || {}, b = game.quality?.budget || {};
    const cm = Number.isFinite(b.coverageMul) ? b.coverageMul : 1;
    st.soft = (Number.isFinite(v.coverageSoft) ? v.coverageSoft : 1.5) * cm;
    st.hard = (Number.isFinite(v.coverageHard) ? v.coverageHard : 2.5) * cm;
    st.callCap = Number.isFinite(v.fxCalls) ? v.fxCalls : 40;
    st.fxDetail = Number.isFinite(b.fxDetail) ? b.fxDetail : (Number.isFinite(v.fxDetail) ? v.fxDetail : 1);
  }
  /**
   * Once per frame after every subsystem estimated its coverage. cats: {soft, particles, rest} player screens.
   * Returns the new size multipliers (soft sprites, other particles) for the particle material.
   */
  function control(cats, realDt) {
    read();
    st.frames++;
    const total = cats.soft + cats.particles + cats.rest;
    st.player = total;
    if (total > st.soft) {
      st.overSoft++;
      // only the particles can shrink: they answer for the overshoot, but never below their own share
      let over = Math.min(total - st.soft * 0.92, cats.soft + cats.particles - (st.soft * 0.92) * (cats.soft + cats.particles) / Math.max(total, 1e-6));
      if (cats.soft > 1e-4 && over > 0) { const f = Math.max(0.04, (cats.soft - over) / cats.soft); st.softMul = Math.max(0.15, st.softMul * Math.sqrt(f)); over -= cats.soft * (1 - f); }
      if (cats.particles > 1e-4 && over > 0) { const f = Math.max(0.1, (cats.particles - over) / cats.particles); st.sizeMul = Math.max(0.3, st.sizeMul * Math.sqrt(f)); }
    } else {
      const k = Math.min(1, realDt * 1.2);
      st.softMul += (1 - st.softMul) * k; st.sizeMul += (1 - st.sizeMul) * k;
      if (total < st.soft * 0.8) st.stopSoft = false;
    }
    if (total > st.hard) { st.overHard++; st.stopSoft = true; }
    return st;
  }
  return { st, read, control };
}

/**
 * Screen-space projector for the coverage estimator (one per frame: begin()). Polylines are measured in pixels (clipped to the
 * near plane and the screen), so items wrapping around or close to the camera are never over-counted.
 */
export function createProjector(game) {
  const e = new Float32Array(16);
  const S = { W: 1, H: 1, p00: 1, p11: 1, cx: 0, cy: 0, cz: 0, fx: 0, fy: 0, fz: 1 };
  const out = { x: 0, y: 0, z: 0 };
  function begin() {
    const cam = game.camera;
    cam.updateMatrixWorld();
    const vp = cam.projectionMatrix.elements, vw = cam.matrixWorldInverse.elements;
    // e = P × V (column-major)
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      e[c * 4 + r] = vp[r] * vw[c * 4] + vp[4 + r] * vw[c * 4 + 1] + vp[8 + r] * vw[c * 4 + 2] + vp[12 + r] * vw[c * 4 + 3];
    }
    const gl = game.renderer?.getContext?.();
    S.W = gl?.drawingBufferWidth || 640; S.H = gl?.drawingBufferHeight || 360;
    S.p00 = vp[0]; S.p11 = vp[5];
    const m = cam.matrixWorld.elements; S.cx = m[12]; S.cy = m[13]; S.cz = m[14]; S.fx = -m[8]; S.fy = -m[9]; S.fz = -m[10];
  }
  /** → out {x, y (pixels), z (view depth)}; false when behind the near plane */
  function project(x, y, z) {
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w < 0.1) return false;
    out.x = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * S.W;
    out.y = ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5) * S.H;
    out.z = w;
    return true;
  }
  const clampX = (v) => Math.max(-S.W * 0.25, Math.min(S.W * 1.25, v)), clampY = (v) => Math.max(-S.H * 0.25, Math.min(S.H * 1.25, v));
  /** screen fraction of a polyline of world width w (Float32Array xyz, n points) */
  function poly(arr, n, w, stride = 3) {
    let px = 0, py = 0, pz = 0, ok = false, len = 0, zs = 0, zn = 0;
    for (let i = 0; i < n; i++) {
      const j = i * stride;
      if (!project(arr[j], arr[j + 1], arr[j + 2])) { ok = false; continue; }
      const x = clampX(out.x), y = clampY(out.y);
      if (ok) len += Math.hypot(x - px, y - py);
      px = x; py = y; pz = out.z; ok = true; zs += pz; zn++;
    }
    if (!zn || len <= 0) return 0;
    const z = Math.max(0.3, zs / zn);
    const wpx = Math.max(1.5, w * S.p11 * S.H * 0.5 / z);
    return len * wpx / (S.W * S.H);
  }
  /** screen fraction of the visible bounding box of a sphere / disc of radius r at (x, y, z), × fill */
  function disc(x, y, z, r, fill = 1) {
    const dz = (x - S.cx) * S.fx + (y - S.cy) * S.fy + (z - S.cz) * S.fz;
    if (dz < -r) return 0;
    const zz = Math.max(0.3, dz);
    const rpx = r * S.p11 * S.H * 0.5 / zz;
    if (!project(x, y, z) && dz < 0.1) return Math.min(1, (rpx * rpx * 4) / (S.W * S.H)) * fill * 0.5;
    const x0 = Math.max(0, out.x - rpx), x1 = Math.min(S.W, out.x + rpx), y0 = Math.max(0, out.y - rpx), y1 = Math.min(S.H, out.y + rpx);
    if (x1 <= x0 || y1 <= y0) return 0;
    return (x1 - x0) * (y1 - y0) / (S.W * S.H) * fill;
  }
  return { begin, project, poly, disc, S };
}
