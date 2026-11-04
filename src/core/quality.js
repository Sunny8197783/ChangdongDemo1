// game.quality (PLAN v4 §2.3, §7.4.1): budget levels L0–L5 + the refresh-aware governor. Owned by core.
//   game.quality = { level, preset, scale, baseScale, renderSize() → {w, h}, budget:{…}, set(level, reason), lock(on),
//                    history(), headroom(sec), benchmark({seconds}) → Promise<BenchResult> (src/core/bench.js),
//                    titleBenchmark({seconds}) → Promise, frame(dtMs, cpuMs, gpuMs) (main, once per rendered frame),
//                    governor() → state, simulate({frameMs, gpuMs, cpuMs, refresh, seconds}), gpuTimer }
// Governor (replaces the v3 EMA at main.js:527-544):
//   T = 10th-percentile rAF delta over the last 2 s (snapped to common refresh rates; the smallest estimate of the last
//   30 s is kept so a steady 2-vsync cadence cannot pass as the refresh), T = max(T, 1/fpsCap). Miss = delta > 1.5 T.
//   Overload = > 20 % misses over 1 s, or GPU ms > 0.9 T, or CPU work ms > 0.8 T, sustained 1 s → one level down
//   (two when the frame-time EMA > 1.6 T). Probe up after 6 s at a level with < 2 % misses; > 5 % misses within 2 s →
//   revert and double that level's probe delay (6 → 12 → 24 → 48 s). L2+: dynamic resolution (P-controller on GPU ms
//   when EXT_disjoint_timer_query_webgl2 exists, miss-ratio stepping otherwise; changes ≥ 0.02; never reallocates).
// Runtime only, never persisted. Consumers read game.quality.budget lazily each use (the object is reused).
import { PRESETS } from './settings.js';
import { budgetSize, showOffer, maybeOfferHigh } from './gpu.js';

export const LEVELS = 6;   // L0..L5

/** Fill `b` with the budget of `level` on top of the preset `p` (cumulative rows of §2.3). */
export function budgetFor(level, p, b = {}) {
  b.level = level;
  b.particleMul = 1; b.coverageMul = 1; b.flareMul = 1; b.fxDetail = p.fxDetail ?? 1;
  b.enemyOutlineDist = p.enemyOutlineDist ?? 25; b.enemyLodMul = 1; b.floraMul = 1; b.grassMul = 1;
  b.floraOutlineDist = p.floraOutlineDist ?? 35;
  b.shadowEvery = p.shadowEvery ?? 1; b.shadowFrozen = false; b.bloom = !!p.bloom; b.particleCap = p.particleCap ?? 1000;
  b.dynRes = false; b.dynResFloor = p.dynResMin ?? 0.8;
  if (level >= 1) { b.fxDetail = Math.max(0, b.fxDetail - 1); b.coverageMul = 0.6; b.particleMul = 0.6; b.flareMul = 0.7; b.enemyLodMul = 0.8; }
  if (level >= 2) b.dynRes = true;
  if (level >= 3) { b.shadowEvery = Math.max(2, b.shadowEvery); b.enemyOutlineDist = Math.min(b.enemyOutlineDist, 15); b.enemyLodMul = 0.6; }
  if (level >= 4) { b.bloom = false; b.grassMul = 0.5; b.floraMul = 0.6; b.floraOutlineDist = Math.min(b.floraOutlineDist, 20); }
  if (level >= 5) { b.dynResFloor = 0.6; b.shadowFrozen = true; b.particleCap = Math.min(b.particleCap, 300); }
  return b;
}


const REFRESH_HZ = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240];
/** in-place quickselect (k-th smallest of a[0..n)) — no allocation */
function kth(a, n, k) {
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const piv = a[(lo + hi) >> 1]; let i = lo, j = hi;
    while (i <= j) { while (a[i] < piv) i++; while (a[j] > piv) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } }
    if (k <= j) hi = j; else if (k >= i) lo = i; else return a[k];
  }
  return a[k];
}

export function createQuality(game, { renderSize } = {}) {
  const hist = [];
  const budget = {};
  let level = 0, locked = false, headroomLeft = 0, headroomOn = false;
  const preset = () => PRESETS[game.settings?.values?.quality] || PRESETS.medium;
  const recompute = () => {
    const eff = headroomOn && level < 1 ? 1 : level;
    budgetFor(eff, preset(), budget);
    budget.level = level;                       // the governor level (headroom is budget-only)
    budget.headroom = headroomOn && level < 1;
    game.perfScale = budget.particleMul;        // legacy view (= particle factor)
  };
  const _size = { w: 0, h: 0 };

  // ------------------------------------------------------------ governor state (no per-frame allocation)
  const RING = 512;                                         // > 2 s at 240 Hz
  const ringDt = new Float64Array(RING), ringT = new Float64Array(RING), ringMiss = new Uint8Array(RING);
  const scratch = new Float64Array(RING);
  let head = 0, count = 0;
  const G = {
    t: 0, T: 1 / 60, Tp10: 1 / 60, tEst: 0, Tmins: new Float64Array(60), TminHead: 0, TminN: 0,
    ema: 1 / 60, cpuEma: 0, gpuMs: -1, gpuEma: 0, missRatio: 0, missRatio2: 0,
    overT: 0, levelT: 0, probe: null, delays: [0, 6, 6, 6, 6, 6], resT: 0, upResT: 0, highL2T: 0, offeredDrop: false,
    refresh: game.testParams?.refresh > 0 ? game.testParams.refresh : 0, frames: 0, lastReason: 'boot',
  };
  const probeState = { from: 0, to: 0, t: 0 };
  const enabled = () => game.settings?.values?.autoQuality !== false && !locked;
  const dynOn = () => game.settings?.values?.dynamicRes !== false;
  const floorScale = () => budget.dynResFloor ?? (preset().dynResMin ?? 0.8);

  function snapRefresh(T) {
    for (const hz of REFRESH_HZ) { const t = 1 / hz; if (Math.abs(T - t) / t < 0.06) return t; }
    return T;
  }
  /** windowed stats: miss ratio over the last `win` s (misses counted against the current T) */
  function missRatio(win) {
    let n = 0, m = 0;
    for (let i = 0; i < count; i++) {
      const k = (head - 1 - i + RING) % RING;
      if (G.t - ringT[k] > win) break;
      n++; if (ringDt[k] > 1.5 * G.T) m++;
    }
    return n ? m / n : 0;
  }
  function estimateT() {
    let n = 0;
    for (let i = 0; i < count; i++) {
      const k = (head - 1 - i + RING) % RING;
      if (G.t - ringT[k] > 2) break;
      scratch[n++] = ringDt[k];
    }
    if (n < 8) return;
    const p10 = kth(scratch, n, Math.floor(n * 0.1));
    G.Tp10 = snapRefresh(p10);
    G.Tmins[G.TminHead] = G.Tp10; G.TminHead = (G.TminHead + 1) % G.Tmins.length; if (G.TminN < G.Tmins.length) G.TminN++;
    let tmin = Infinity; for (let i = 0; i < G.TminN; i++) if (G.Tmins[i] < tmin) tmin = G.Tmins[i];
    let T = tmin;
    if (G.refresh > 0) T = 1 / G.refresh;                 // known cadence (test param / simulate)
    const cap = +game.settings?.values?.fpsCap || 0;
    if (cap > 0) T = Math.max(T, 1 / cap - 0.0005);
    G.T = T;
  }
  function setLevel(n, reason) {
    n = Math.max(0, Math.min(LEVELS - 1, n | 0));
    if (n === level) return false;
    const prev = level;
    level = n; recompute();
    hist.push({ t: +(G.t || game.realTime || 0).toFixed(3), level, reason });
    if (hist.length > 64) hist.shift();
    G.levelT = 0; G.overT = 0; G.lastReason = reason;
    if (level < 2 && api.scale !== 1) setScale(1);
    else if (level >= 2 && prev < 2) G.resT = 0;
    if (budget.dynRes && api.scale < floorScale()) setScale(floorScale());
    try { game.events.emit('qualityLevel', { level, scale: api.scale, reason }); } catch (_) { /* */ }
    return true;
  }
  function setScale(s) {
    s = Math.max(0.25, Math.min(1, s));
    if (Math.abs(s - api.scale) < 1e-6) return;
    api.scale = s;
  }
  /** One governor tick (dt seconds of rAF delta; cpu/gpu in ms, gpu < 0 = unknown). */
  function tick(dt, cpuMs, gpuMs) {
    G.t += dt; G.frames++;
    ringDt[head] = dt; ringT[head] = G.t; head = (head + 1) % RING; if (count < RING) count++;
    G.ema += (dt - G.ema) * 0.08;
    G.cpuEma += ((cpuMs || 0) / 1000 - G.cpuEma) * 0.1;
    if (gpuMs >= 0) { G.gpuMs = gpuMs; G.gpuEma = G.gpuEma > 0 ? G.gpuEma + (gpuMs / 1000 - G.gpuEma) * 0.15 : gpuMs / 1000; }
    G.tEst -= dt; if (G.tEst <= 0) { G.tEst = 0.5; estimateT(); }
    if (headroomLeft > 0) { /* budget-only headroom runs on real time in update() */ }
    if (!enabled()) { if (level !== 0) setLevel(0, 'autoQualityOff'); if (api.scale !== 1) setScale(1); G.overT = 0; return; }
    const T = G.T;
    G.levelT += dt;
    const mr = missRatio(1);
    G.missRatio = mr;
    const gpuS = G.gpuMs >= 0 ? G.gpuEma : -1;
    const cpuOver = G.cpuEma > 0.8 * T, gpuOver = gpuS > 0.9 * T, missOver = mr > 0.2;
    // ---- probe in progress: revert on > 5 % misses within 2 s
    if (G.probe) {
      G.probe.t += dt;
      const pm = missRatio(Math.min(2, G.probe.t));
      if (G.probe.t >= 0.25 && (pm > 0.05 || cpuOver || gpuOver)) {
        const to = G.probe.to, from = G.probe.from;
        G.delays[from] = Math.min(48, (G.delays[from] || 6) * 2);   // the level we tried to leave stays longer next time
        G.probe = null; setLevel(from, 'probeRevert');
        return;
      }
      if (G.probe.t >= 2) { G.delays[G.probe.from] = G.delays[G.probe.from] || 6; G.probe = null; }
    }
    // ---- overload → step down (two levels when the EMA > 1.6 T)
    if (missOver || gpuOver || cpuOver) {
      G.overT += dt;
      // with dynamic resolution still above its floor, a GPU/miss overload is first absorbed by the resolution controller
      const resRoom = budget.dynRes && dynOn() && api.scale > floorScale() + 0.02 && !cpuOver;
      if (G.overT >= 1 && !resRoom && level < LEVELS - 1) {
        const jump = G.ema > 1.6 * T ? 2 : 1;
        G.probe = null;
        setLevel(level + jump, jump === 2 ? 'overload2' : 'overload');
        count = 0;                                     // fresh evidence for the next decision
        return;
      }
    } else G.overT = Math.max(0, G.overT - dt * 0.5);
    // ---- probe up after delay with < 2 % misses
    if (!G.probe && level > 0 && G.levelT >= (G.delays[level] || 6) && missRatio(Math.min(6, G.levelT)) < 0.02 && !cpuOver && !gpuOver) {
      G.probe = { from: level, to: level - 1, t: 0 };
      setLevel(level - 1, 'probeUp');
      G.levelT = 0;
      return;
    }
    // ---- dynamic resolution (L2+)
    if (budget.dynRes && dynOn()) {
      const floor = floorScale();
      G.resT += dt; G.upResT += dt;
      if (G.resT >= 0.25) {
        G.resT = 0;
        let s = api.scale;
        if (gpuS > 0) s = Math.max(floor, Math.min(1, s * Math.sqrt((0.85 * T) / gpuS)));
        else if (mr > 0.2) s = Math.max(floor, s * 0.92);
        else if (mr < 0.02 && G.upResT >= 2) { s = Math.min(1, s * 1.03); G.upResT = 0; }
        if (Math.abs(s - api.scale) >= 0.02 || (s === 1 && api.scale !== 1 && Math.abs(s - api.scale) >= 0.005)) setScale(s);
      }
    } else if (api.scale !== 1) setScale(1);
    // ---- running high and stuck at ≥ L2 for 30 s → one drop-back offer per session
    if (game.settings?.values?.quality === 'high' && level >= 2) {
      G.highL2T += dt;
      if (G.highL2T >= 30 && !G.offeredDrop) { G.offeredDrop = true; try { showOffer(game, 'medium'); } catch (_) { /* */ } }
    } else G.highL2T = 0;
  }

  // ------------------------------------------------------------ GPU timer (EXT_disjoint_timer_query_webgl2)
  const gpuTimer = (() => {
    let gl = null, ext = null; const pool = []; let active = null, last = -1;
    const T = {
      get available() { return !!ext; },
      init(renderer) {
        try { gl = renderer.getContext(); ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (_) { ext = null; }
        if (ext) for (let i = 0; i < 4; i++) pool.push({ q: gl.createQuery(), busy: false });
      },
      begin() {
        if (!ext || active) return;
        const slot = pool.find((p) => !p.busy); if (!slot) return;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, slot.q); slot.busy = true; active = slot;
      },
      end() { if (!ext || !active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); active = null; },
      /** latest finished result in ms (−1 when none yet) */
      poll() {
        if (!ext) return -1;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        for (const p of pool) {
          if (!p.busy || p === active) continue;
          if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
          const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT); p.busy = false;
          if (!disjoint) last = ns / 1e6;
        }
        return last;
      },
    };
    return T;
  })();

  const api = {
    LEVELS,
    get level() { return level; },
    get preset() { return game.settings?.values?.quality || 'medium'; },
    scale: 1,             // dynamic-resolution scale (× base); written by the governor
    baseScale: 1,         // pixel-budget base scale (main: gpu.baseScale)
    budget,
    gpuTimer,
    lastOffer: null,
    /**
     * renderSize() → the live render size {w, h} (drawing-buffer px of the scene pass; reused object).
     * renderSize(w, h, pr) → the size the pixel budget of the current preset picks for a w × h CSS-px canvas at pr (L0, scale 1).
     */
    renderSize(w, h, pr = 1) {
      if (w > 0 && h > 0) {
        const v = game.settings?.values || {}, p = preset();
        return budgetSize(w, h, pr, game.testParams?.budgetPx > 0 ? game.testParams.budgetPx : (+v.budgetPx || p.budgetPx || 1), +v.renderScale || p.renderScale || 1, 1, { w: 0, h: 0 });
      }
      const s = renderSize ? renderSize(_size) : null; if (s) return s; const c = game.renderer?.domElement; _size.w = c?.width || 0; _size.h = c?.height || 0; return _size;
    },
    set(l, reason = 'manual') {
      const n = Math.max(0, Math.min(LEVELS - 1, Math.round(+l || 0)));
      if (n === level && hist.length) return level;
      setLevel(n, reason);
      return level;
    },
    lock(on = true) { locked = !!on; },
    get locked() { return locked; },
    history() { return hist.slice(); },
    /** Budget-only pre-emptive headroom: apply L1's budget for sec real seconds when the level is < 1 (§2.3). */
    headroom(sec = 4) { if (level >= 1) return; headroomLeft = Math.max(headroomLeft, sec); if (!headroomOn) { headroomOn = true; recompute(); } },
    update(realDt) {
      if (headroomLeft > 0) { headroomLeft -= realDt; if (headroomLeft <= 0) { headroomLeft = 0; headroomOn = false; recompute(); } }
    },
    /** main: one rendered rAF frame (dtMs = rAF delta, cpuMs = update + submit, gpuMs = last timer result or −1). */
    frame(dtMs, cpuMs, gpuMs = -1) {
      if (sim.on) return;                          // a simulation owns the inputs
      let dt = dtMs / 1000;
      if (G.refresh > 0) { const v = 1 / G.refresh; dt = Math.max(1, Math.round(dt / v)) * v; }   // quantised cadence (test)
      tick(Math.min(dt, 0.25), cpuMs, gpuMs);
    },
    governor() {
      return { level, scale: api.scale, baseScale: api.baseScale, T: +G.T.toFixed(5), Tp10: +G.Tp10.toFixed(5), misses: +G.missRatio.toFixed(3), ema: +G.ema.toFixed(5),
        cpuMs: +(G.cpuEma * 1000).toFixed(2), gpuMs: G.gpuMs >= 0 ? +(G.gpuEma * 1000).toFixed(2) : null, gpuTimer: gpuTimer.available,
        probe: G.probe ? { ...G.probe } : null, delays: G.delays.slice(), enabled: enabled(), dynamicRes: dynOn(), t: +G.t.toFixed(3),
        reason: G.lastReason, history: hist.slice() };
    },
    /**
     * Drive the governor with synthetic frames (C2). spec: {frameMs, gpuMs?, cpuMs?, refresh?, seconds}. Frames are
     * quantised to the refresh cadence (vsync). Returns the governor state after `seconds`. simulate(null) resets the
     * governor (level 0, scale 1, fresh windows, default probe delays).
     */
    simulate(spec) {
      if (!spec) {
        sim.on = false; G.refresh = game.testParams?.refresh > 0 ? game.testParams.refresh : 0; count = 0; G.probe = null; G.delays = [0, 6, 6, 6, 6, 6];
        G.overT = 0; G.levelT = 0; G.TminN = 0; G.gpuMs = -1; G.gpuEma = 0; G.cpuEma = 0; G.ema = 1 / 60; G.T = 1 / 60; G.tEst = 0; G.resT = 0; G.upResT = 0;
        setLevel(0, 'simReset'); setScale(1); return api.governor();
      }
      sim.on = true;
      const refresh = spec.refresh || 60;
      if (G.refresh !== refresh) { G.refresh = refresh; G.TminN = 0; }
      if (spec.gpuMs == null) { G.gpuMs = -1; G.gpuEma = 0; }
      estimateT();
      if (count < 8) { const cap = +game.settings?.values?.fpsCap || 0; G.T = cap > 0 ? Math.max(1 / refresh, 1 / cap - 0.0005) : 1 / refresh; }
      const v = 1 / refresh, seconds = spec.seconds ?? 1;
      let t = 0; const log = spec.log ? [] : null;
      while (t < seconds - 1e-9) {
        const ms = typeof spec.frameMs === 'function' ? spec.frameMs(t) : spec.frameMs;
        const gms = typeof spec.gpuMs === 'function' ? spec.gpuMs(t, api.scale) : (spec.gpuMs ?? -1);
        const cms = spec.cpuMs ?? Math.min(ms, 4);
        const dt = Math.max(1, Math.ceil(ms / 1000 / v - 1e-6)) * v;
        const l0 = level;
        tick(dt, cms, gms);
        t += dt;
        if (log && level !== l0) log.push({ t: +t.toFixed(3), level });
      }
      const st = api.governor(); if (log) st.log = log;
      return st;
    },
    /** End a simulation and keep the current level. */
    endSimulation() { sim.on = false; G.refresh = game.testParams?.refresh > 0 ? game.testParams.refresh : 0; },
    /**
     * Title benchmark (P0, §2.3): `seconds` of real rAF frames behind the title (the village under ux's drifting title
     * camera; `api.benchCam` is set meanwhile); misses + CPU + GPU (timer query, else 1-px readPixels sync on a few frames) pick the start
     * level 0/1/2 and feed the high-tier offer (headroom ≥ 1.6 on a discrete tier). Resolves with the result.
     */
    titleBenchmark({ seconds = 2, apply = true, offer = true } = {}) {
      if (api._titleBench) return api._titleBench;
      api._titleBench = new Promise((resolve) => {
        const R = game.renderer, gl = R?.getContext?.();
        const px = new Uint8Array(4);
        const dts = [], cpus = [], syncs = [];
        let last = performance.now(), t = 0, n = 0;
        api.benchCam = { t: 0 };
        const step = () => {
          const now = performance.now(); const dt = (now - last) / 1000; last = now;
          if (n > 0) dts.push(dt);
          t += dt; n++; api.benchCam.t = t;
          // every 6th frame: one synchronised render (CPU submit + GPU) for a GPU-time estimate without the timer query
          if (n % 6 === 3 && gl) {
            const t0 = performance.now();
            try { game.renderNow?.(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } catch (_) { /* */ }
            syncs.push(performance.now() - t0);
          }
          if (t < seconds) { requestAnimationFrame(step); return; }
          api.benchCam = null;
          const sorted = dts.slice().sort((a, b) => a - b);
          const p10 = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 1 / 60;
          const T = Math.max(snapRefresh(p10), (+game.settings?.values?.fpsCap ? 1 / +game.settings.values.fpsCap : 0) - 0.0005);
          const misses = dts.length ? dts.filter((d) => d > 1.5 * T).length / dts.length : 0;
          syncs.sort((a, b) => a - b);
          const syncMs = syncs.length ? syncs[Math.floor(syncs.length / 2)] : T * 1000;
          const gpuMs = gpuTimer.available ? gpuTimer.poll() : -1;
          const workMs = Math.max(syncMs, gpuMs > 0 ? gpuMs : 0);
          const headroom = workMs > 0 ? (T * 1000) / workMs : 1;
          let lvl = 0;
          if (misses > 0.25 || headroom < 0.75) lvl = 2;
          else if (misses > 0.05 || headroom < 1.0) lvl = 1;
          const res = { level: lvl, misses: +misses.toFixed(3), T: +T.toFixed(5), frames: dts.length, syncMs: +syncMs.toFixed(2), gpuMs: gpuMs > 0 ? +gpuMs.toFixed(2) : null,
            headroom: +headroom.toFixed(2), tier: game.render?.tier || 'unknown', applied: false, offered: false };
          if (apply && enabled()) { setLevel(lvl, 'titleBenchmark'); res.applied = true; }
          if (offer) { try { res.offered = maybeOfferHigh(game, res); } catch (_) { /* */ } }
          api.lastTitleBench = res;
          try { game.events.emit('titleBenchmark', res); } catch (_) { /* */ }
          resolve(res);
        };
        requestAnimationFrame(step);
      });
      return api._titleBench;
    },
    benchCam: null,
    lastTitleBench: null,
    /** P0a fallback benchmark (src/core/bench.js replaces it when present). */
    async benchmark({ seconds = 3 } = {}) {
      const wasFrozen = !!game.frozen;
      const dts = []; let cpu = 0;
      const n = Math.max(10, Math.round(seconds * 60));
      game.freeze?.(true);
      let last = performance.now();
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        game.step?.(1, 1 / 60, true);
        const t1 = performance.now(); cpu += t1 - t0;
        dts.push(t1 - last); last = t1;
        if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
      }
      if (!wasFrozen) game.freeze?.(false);
      dts.sort((a, b) => a - b);
      const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
      const low = dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.99))];
      const rs = api.renderSize();
      return { avgFps: +(1000 / avg).toFixed(1), low1Fps: +(1000 / low).toFixed(1), level, renderW: rs.w, renderH: rs.h,
        gpu: game.render?.rendererName || '', tier: game.render?.tier || 'unknown', cpuMs: +(cpu / n).toFixed(2) };
    },
  };
  const sim = { on: false };
  recompute();
  hist.push({ t: 0, level: 0, reason: 'boot' });
  game.events?.on?.('settingsChanged', ({ key }) => {
    if (key === 'quality' || key === '*' || key in PRESETS.medium) recompute();
    if (key === 'autoQuality' && game.settings.values.autoQuality === false) { setLevel(0, 'autoQualityOff'); setScale(1); }
    if (key === 'dynamicRes' && game.settings.values.dynamicRes === false) setScale(1);
  });
  game.events?.on?.('bossSpawn', () => api.headroom(4));
  game.events?.on?.('skillCast', (p) => { if (p && (p.slot === 'ultimate' || p.slot === 'finisher' || p.slot === 'ult')) api.headroom(4); });
  return api;
}
