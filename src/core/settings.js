// Persistent player settings (graphics / controls / audio / gameplay). game.settings.
// Emits 'settingsChanged' {key, value, settings} on game.events. Modules apply what they own:
//   main.js   → renderScale, shadows (renderer), bloom, difficulty (game.difficulty + stats source 'difficulty')
//   world     → grassDensity, drawDistance, shadowQuality (shadow map size / distance)
//   vfx       → particleScale, effectQuality (particle multiplier), screenShake
//   player    → mouseSens, invertY
//   audio     → volMaster, volMusic, volSfx
//   ui        → showFps, damageNumbers
//   skills    → holdToCast
// Storage: aw_settings_v3. Migration (CONTRACT §19): read v3; if absent, copy aw_settings_v2 into v3 ONCE (v2 untouched).
export const KEY = 'aw_settings_v3';
export const KEY_V2 = 'aw_settings_v2';

export const PRESETS = {
  low:    { grassDensity: 0.3, shadows: false, shadowQuality: 'low',    renderScale: 0.75, bloom: false, drawDistance: 0.6, particleScale: 0.6, effectQuality: 'low' },
  medium: { grassDensity: 0.6, shadows: true,  shadowQuality: 'medium', renderScale: 1.0,  bloom: true,  drawDistance: 0.8, particleScale: 0.85, effectQuality: 'medium' },
  high:   { grassDensity: 1.0, shadows: true,  shadowQuality: 'high',   renderScale: 1.0,  bloom: true,  drawDistance: 1.0, particleScale: 1.0, effectQuality: 'high' },
};

/** DESIGN §16 난이도. */
export const DIFFICULTY = {
  easy:   { id: 'easy',   nameKo: '쉬움',   hpMul: 0.7, dmgMul: 0.6,  telegraphMul: 1.2, checkAddSec: 4, regenCombatMul: 1 },
  normal: { id: 'normal', nameKo: '보통',   hpMul: 1.0, dmgMul: 1.0,  telegraphMul: 1.0, checkAddSec: 0, regenCombatMul: 1 },
  hard:   { id: 'hard',   nameKo: '어려움', hpMul: 1.3, dmgMul: 1.25, telegraphMul: 1.0, checkAddSec: 0, regenCombatMul: 0.8 },
};
/** effectQuality → particle multiplier (vfx reads this). */
export const EFFECT_QUALITY_MUL = { low: 0.5, medium: 0.8, high: 1.0 };

export const DEFAULTS = {
  quality: 'medium',
  ...PRESETS.medium,
  showFps: false,
  mouseSens: 1.0,      // multiplier
  invertY: false,
  volMaster: 0.9, volMusic: 0.6, volSfx: 1.0,
  difficulty: 'normal', screenShake: 1, damageNumbers: true, holdToCast: true,
};

function readStored() {
  let saved = null;
  try { const s = localStorage.getItem(KEY); if (s) saved = JSON.parse(s); } catch (_) { saved = null; }
  if (saved && typeof saved === 'object') return { saved, migrated: false };
  let v2 = null;
  try { const s = localStorage.getItem(KEY_V2); if (s) v2 = JSON.parse(s); } catch (_) { v2 = null; }
  if (v2 && typeof v2 === 'object') {
    try { localStorage.setItem(KEY, JSON.stringify(v2)); } catch (_) { /* */ }   // copy once; v2 stays untouched
    return { saved: v2, migrated: true };
  }
  return { saved: {}, migrated: false };
}

export function createSettings(game) {
  const { saved, migrated } = readStored();
  const values = { ...DEFAULTS, ...saved };
  if (!PRESETS[values.quality] && values.quality !== 'custom') values.quality = 'medium';
  if (!EFFECT_QUALITY_MUL[values.effectQuality]) values.effectQuality = 'medium';
  if (!DIFFICULTY[values.difficulty]) values.difficulty = 'normal';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (_) {} };

  const api = {
    values, migrated,
    DIFFICULTY, EFFECT_QUALITY_MUL,
    get(k) { return values[k]; },
    /** Set one setting. Changing any preset-governed key switches quality to 'custom'. opts.persist=false skips storage. */
    set(k, v, { silent = false, persist = true } = {}) {
      if (values[k] === v) return;
      values[k] = v;
      if (k !== 'quality' && k in PRESETS.medium && values.quality !== 'custom') {
        const p = PRESETS[values.quality];
        if (p && p[k] !== v) values.quality = 'custom';
      }
      if (persist) save();
      if (!silent) game.events.emit('settingsChanged', { key: k, value: v, settings: values });
    },
    /** Apply a quality preset ('low'|'medium'|'high'), incl. effectQuality; emits settingsChanged for each changed key. */
    applyPreset(q) {
      const p = PRESETS[q]; if (!p) return;
      values.quality = q;
      for (const [k, v] of Object.entries(p)) {
        if (values[k] !== v) { values[k] = v; game.events.emit('settingsChanged', { key: k, value: v, settings: values }); }
      }
      save();
      game.events.emit('settingsChanged', { key: 'quality', value: q, settings: values });
    },
    effectMul() { return EFFECT_QUALITY_MUL[values.effectQuality] ?? 0.8; },
    reset() { Object.assign(values, DEFAULTS); save(); game.events.emit('settingsChanged', { key: '*', value: null, settings: values }); },
  };
  return api;
}
