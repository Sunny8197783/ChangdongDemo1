// game.quality (PLAN v4 §2.3, §7.4.1). Owned by core.
// P0a: the API, the L0–L5 budget table, set/lock/history, the qualityLevel event, pre-emptive headroom and a simple
// benchmark; the refresh-aware governor controller (misses, probing, dynamic resolution) lands in P0b in this file.
//   game.quality = { level, preset, scale, renderSize() → {w, h}, budget:{…}, set(level, reason), lock(on), history(),
//                    benchmark({seconds}) → Promise<BenchResult>, headroom(sec) }
// Runtime only, never persisted. Consumers read game.quality.budget lazily each use (the object is reused).
import { PRESETS } from './settings.js';
import { budgetSize } from './gpu.js';

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
  const api = {
    LEVELS,
    get level() { return level; },
    get preset() { return game.settings?.values?.quality || 'medium'; },
    scale: 1,             // dynamic-resolution scale (× base); written by the governor (P0b)
    baseScale: 1,         // pixel-budget base scale (P0b: gpu.js)
    budget,
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
      level = n; recompute();
      hist.push({ t: +(game.realTime || 0).toFixed(3), level, reason });
      if (hist.length > 64) hist.shift();
      try { game.events.emit('qualityLevel', { level, scale: api.scale, reason }); } catch (_) { /* */ }
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
    /**
     * P0a benchmark: renders `seconds` of frames from the current state and reports fps / CPU ms (the scripted §2.8
     * scene lands with src/core/bench.js in P0b). Restores the frozen state it found.
     */
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
  recompute();
  hist.push({ t: 0, level: 0, reason: 'boot' });
  game.events?.on?.('settingsChanged', ({ key }) => { if (key === 'quality' || key === '*' || key in PRESETS.medium) recompute(); });
  game.events?.on?.('bossSpawn', () => api.headroom(4));
  game.events?.on?.('skillCast', (p) => { if (p && (p.slot === 'ultimate' || p.slot === 'finisher' || p.slot === 'ult')) api.headroom(4); });
  return api;
}
