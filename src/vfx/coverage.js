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
      let over = total - st.soft * 0.92;
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
