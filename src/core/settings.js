// Persistent player settings (graphics / controls / audio). game.settings.
// Emits 'settingsChanged' {key, value, settings} on game.events. Modules apply what they own:
//   main.js   → renderScale, shadows (renderer), bloom
//   world     → grassDensity, drawDistance, shadowQuality (shadow map size / distance)
//   vfx       → particleScale
//   player    → mouseSens, invertY
//   audio     → volMaster, volMusic, volSfx
//   ui        → showFps
const KEY = 'aw_settings_v2';

export const PRESETS = {
  low:    { grassDensity: 0.3, shadows: true,  shadowQuality: 'low',    renderScale: 0.75, bloom: false, drawDistance: 0.6, particleScale: 0.6 },
  medium: { grassDensity: 0.6, shadows: true,  shadowQuality: 'medium', renderScale: 1.0,  bloom: true,  drawDistance: 0.8, particleScale: 0.85 },
  high:   { grassDensity: 1.0, shadows: true,  shadowQuality: 'high',   renderScale: 1.0,  bloom: true,  drawDistance: 1.0, particleScale: 1.0 },
};

const DEFAULTS = {
  quality: 'medium',
  ...PRESETS.medium,
  showFps: false,
  mouseSens: 1.0,      // multiplier
  invertY: false,
  volMaster: 0.9, volMusic: 0.6, volSfx: 1.0,
};

export function createSettings(game) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { saved = {}; }
  const values = { ...DEFAULTS, ...saved };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (_) {} };

  const api = {
    values,
    get(k) { return values[k]; },
    /** Set one setting. Changing any preset-governed key switches quality to 'custom'. */
    set(k, v, { silent = false } = {}) {
      if (values[k] === v) return;
      values[k] = v;
      if (k !== 'quality' && k in PRESETS.medium && values.quality !== 'custom') {
        const p = PRESETS[values.quality];
        if (p && p[k] !== v) values.quality = 'custom';
      }
      save();
      if (!silent) game.events.emit('settingsChanged', { key: k, value: v, settings: values });
    },
    /** Apply a quality preset ('low'|'medium'|'high'); emits settingsChanged for each changed key. */
    applyPreset(q) {
      const p = PRESETS[q]; if (!p) return;
      values.quality = q;
      for (const [k, v] of Object.entries(p)) {
        if (values[k] !== v) { values[k] = v; game.events.emit('settingsChanged', { key: k, value: v, settings: values }); }
      }
      save();
      game.events.emit('settingsChanged', { key: 'quality', value: q, settings: values });
    },
    reset() { Object.assign(values, DEFAULTS); save(); game.events.emit('settingsChanged', { key: '*', value: null, settings: values }); },
  };
  return api;
}
