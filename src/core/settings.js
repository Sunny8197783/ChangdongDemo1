// Persistent player settings (graphics / controls / audio / gameplay / assist). game.settings.
// Emits 'settingsChanged' {key, value, settings} on game.events. Modules apply what they own:
//   main.js / core → renderScale, shadows, bloom, quality, autoQuality, dynamicRes, fpsCap, difficulty, keybinds,
//                    enemySpeed (game.enemyTime), the game.assist getter (PLAN v4 §5.12)
//   world     → grassDensity, drawDistance, shadowQuality (shadow map size / distance), v4 preset keys (grass*, tree*, flora*)
//   vfx       → particleScale, effectQuality, fxIntensity, screenShake, flashReduce, v4 caps (particleCap, coverage*)
//   tells     → threatEmphasis, tellMul, teachSlowmo, colorblind
//   player    → mouseSens, invertY, iframeMul, perfectMul, witchSlowmo, cameraDist, aimAssist (P1)
//   audio     → volMaster, volMusic, volSfx
//   ui        → showFps, damageNumbers, hints, offscreenArrows, uiScale, autoAllocate, introShort
//   skills    → holdToCast
// Storage: aw_settings_v3 (v4 adds keys, same storage key). Migration (CONTRACT §19): read v3; if absent, copy
// aw_settings_v2 into v3 ONCE (v2 untouched). v4 migrations: damageNumbers true → 'merged', false → 'off'; a stored
// non-custom quality re-applies that preset's (v4) values on load.
export const KEY = 'aw_settings_v3';
export const KEY_V2 = 'aw_settings_v2';

/**
 * Quality presets v4 (PLAN §2.2). Medium is the default for every GPU tier (integrated-GPU laptop target).
 * v3 keys keep their names (renderScale, shadows, shadowQuality, bloom, grassDensity, drawDistance, particleScale,
 * effectQuality); v4 keys are additive. msaa / shadowType / pointLights apply on reload only (program keys).
 */
export const PRESETS = {
  low: {
    grassDensity: 0.25, shadows: false, shadowQuality: 'low', renderScale: 0.85, bloom: false, drawDistance: 0.6, particleScale: 0.6, effectQuality: 'low',
    budgetPx: 0.6, dynResMin: 0.70, msaa: 0, fxaa: true, shadowType: 'pcf', shadowSize: 1024, shadowEvery: 1,
    shadowCalls: 0, shadowTris: 0, bloomMips: 3, bloomStrength: 0.40, pointLights: false,
    grassNearFade: 0.6, grassReceiveShadow: false, treeDist: 120, floraOutlineDist: 20, enemyOutlineDist: 15, enemyLodDist: 18,
    particleCap: 500, additiveCap: 150, coverageSoft: 1.0, coverageHard: 1.5, fxCalls: 30, fxDetail: 0,
  },
  medium: {
    grassDensity: 0.4, shadows: true, shadowQuality: 'medium', renderScale: 1.0, bloom: true, drawDistance: 0.8, particleScale: 0.85, effectQuality: 'medium',
    budgetPx: 1.0, dynResMin: 0.80, msaa: 0, fxaa: true, shadowType: 'pcf', shadowSize: 1024, shadowEvery: 1,
    shadowCalls: 30, shadowTris: 50000, bloomMips: 3, bloomStrength: 0.40, pointLights: false,
    grassNearFade: 0.7, grassReceiveShadow: false, treeDist: 200, floraOutlineDist: 35, enemyOutlineDist: 25, enemyLodDist: 25,
    particleCap: 1000, additiveCap: 300, coverageSoft: 1.5, coverageHard: 2.5, fxCalls: 40, fxDetail: 1,
  },
  high: {
    grassDensity: 0.85, shadows: true, shadowQuality: 'high', renderScale: 1.0, bloom: true, drawDistance: 1.0, particleScale: 1.0, effectQuality: 'high',
    budgetPx: 1.6, dynResMin: 0.85, msaa: 4, fxaa: false, shadowType: 'pcfsoft', shadowSize: 2048, shadowEvery: 1,
    shadowCalls: 45, shadowTris: 90000, bloomMips: 5, bloomStrength: 0.45, pointLights: true,
    grassNearFade: 1.0, grassReceiveShadow: true, treeDist: 350, floraOutlineDist: 55, enemyOutlineDist: 40, enemyLodDist: 35,
    particleCap: 2000, additiveCap: 600, coverageSoft: 3, coverageHard: 5, fxCalls: 60, fxDetail: 2,
  },
};
/** Preset keys that change program keys: they apply on reload only (settings shows "재시작 후 적용"). */
export const RELOAD_KEYS = ['msaa', 'shadowType', 'pointLights'];
/** Quality values stored in settings.quality. '자동' is NOT a value: it is the separate autoQuality toggle. */
export const QUALITY_VALUES = ['low', 'medium', 'high', 'custom'];

/**
 * DESIGN §16 / PLAN v4 §6.8 난이도. `telegraphMul` is a legacy alias fixed at 1 (the real stretch is tellMul, applied
 * by tells to the actual windup). `checkAdd` is a legacy alias of `checkAddSec`.
 */
export const DIFFICULTY = {
  story:  { id: 'story',  nameKo: '이야기', descKo: '이야기를 즐기고 싶다면. 적이 느리고 약하며, 쓰러져도 그 자리에서 일어납니다.',
            hpMul: 0.6, dmgMul: 0.4, tellMul: 1.5, perfectMul: 2.0, iframeMul: 1.5, enemySpeed: 0.85, autoRevive: true,
            checkAddSec: 6, checkAdd: 6, regenCombatMul: 1.5, autoAllocate: true, telegraphMul: 1 },
  easy:   { id: 'easy',   nameKo: '쉬움',   descKo: '여유 있게. 공격 예고가 길고 완벽 판정이 넓습니다.',
            hpMul: 0.7, dmgMul: 0.6, tellMul: 1.3, perfectMul: 1.4, iframeMul: 1.25, enemySpeed: 1.0, autoRevive: false,
            checkAddSec: 4, checkAdd: 4, regenCombatMul: 1, autoAllocate: false, telegraphMul: 1 },
  normal: { id: 'normal', nameKo: '보통',   descKo: '처음이라면 추천. 균형 잡힌 기본 난이도예요.',
            hpMul: 1.0, dmgMul: 1.0, tellMul: 1.0, perfectMul: 1.0, iframeMul: 1.0, enemySpeed: 1.0, autoRevive: false,
            checkAddSec: 0, checkAdd: 0, regenCombatMul: 1, autoAllocate: false, telegraphMul: 1 },
  hard:   { id: 'hard',   nameKo: '어려움', descKo: '숙련자용. 적이 강하고 판정이 엄격합니다.',
            hpMul: 1.3, dmgMul: 1.25, tellMul: 0.9, perfectMul: 0.75, iframeMul: 1.0, enemySpeed: 1.0, autoRevive: false,
            checkAddSec: 0, checkAdd: 0, regenCombatMul: 0.8, autoAllocate: false, telegraphMul: 1 },
};
/** Display order of the difficulty cards (새 게임). */
export const DIFFICULTY_ORDER = ['story', 'easy', 'normal', 'hard'];
/** effectQuality → particle multiplier (vfx reads this). */
export const EFFECT_QUALITY_MUL = { low: 0.5, medium: 0.8, high: 1.0 };

/** Default key bindings of the v4 keymap actions (game.input.keymap). Mouse<n> = mouse button index n. */
export const DEFAULT_KEYBINDS = {
  dodge: 'KeyQ', dodgeAlt: 'Mouse3', defend: 'KeyE', jump: 'Space', sprint: 'ShiftLeft',
  interact: 'KeyF', skills: 'KeyK', codex: 'Tab', confirm: 'Enter',
};

export const DEFAULTS = {
  quality: 'medium',
  ...PRESETS.medium,
  autoQuality: true, dynamicRes: true, fpsCap: 60, showFps: false, gpuTier: 'unknown', highOffered: false,
  mouseSens: 1.0,      // multiplier
  invertY: false,
  volMaster: 0.9, volMusic: 0.6, volSfx: 1.0,
  difficulty: 'normal', holdToCast: true,
  // v4 §6.8 assist / accessibility / game
  fxIntensity: 1.0, threatEmphasis: 'normal', tellMul: 1, enemySpeed: 1.0, iframeMul: 1, perfectMul: 1,
  witchSlowmo: true, offscreenArrows: true, teachSlowmo: true, hints: true, aimAssist: 'off',
  colorblind: 'off', flashReduce: false, screenShake: 0.6, uiScale: 1.0,
  damageNumbers: 'merged', cameraDist: 'normal', autoAllocate: false, introShort: true,
  keybinds: { ...DEFAULT_KEYBINDS },
};

/**
 * Menu metadata for every v4 key (PLAN §6.8). ux builds the settings menu from this table (Korean labels live here,
 * rule 6). `values` = [{v, labelKo}] in display order; `range` = [min, max, step] for sliders; `reload` = applies on reload.
 */
export const SETTING_DEFS = [
  // 보조 기능
  { key: 'fxIntensity', tab: 'assist', labelKo: '내 스킬 이펙트 강도', values: [{ v: 1.0, labelKo: '100%' }, { v: 0.7, labelKo: '70%' }, { v: 0.4, labelKo: '40%' }] },
  { key: 'threatEmphasis', tab: 'assist', labelKo: '적 공격 강조', values: [{ v: 'normal', labelKo: '기본' }, { v: 'strong', labelKo: '강함' }] },
  { key: 'tellMul', tab: 'assist', labelKo: '공격 예고 시간', values: [{ v: 1, labelKo: '×1' }, { v: 1.25, labelKo: '×1.25' }, { v: 1.5, labelKo: '×1.5' }] },
  { key: 'enemySpeed', tab: 'assist', labelKo: '적 속도', values: [{ v: 1.0, labelKo: '100%' }, { v: 0.9, labelKo: '90%' }, { v: 0.8, labelKo: '80%' }, { v: 0.7, labelKo: '70%' }] },
  { key: 'iframeMul', tab: 'assist', labelKo: '회피 무적 시간', values: [{ v: 1, labelKo: '×1' }, { v: 1.5, labelKo: '×1.5' }, { v: 2, labelKo: '×2' }] },
  { key: 'perfectMul', tab: 'assist', labelKo: '완벽 회피·패링 판정', values: [{ v: 1, labelKo: '×1' }, { v: 1.5, labelKo: '×1.5' }, { v: 2, labelKo: '×2' }] },
  { key: 'witchSlowmo', tab: 'assist', labelKo: '완벽 회피 슬로 모션', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  { key: 'offscreenArrows', tab: 'assist', labelKo: '화면 밖 공격 표시', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  { key: 'teachSlowmo', tab: 'assist', labelKo: '첫 공격 슬로 모션 안내', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  { key: 'hints', tab: 'assist', labelKo: '도움말', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  { key: 'aimAssist', tab: 'assist', labelKo: '조준 보조', p1: true, values: [{ v: 'off', labelKo: '끔' }, { v: 'weak', labelKo: '약' }, { v: 'strong', labelKo: '강' }] },
  // 접근성
  { key: 'colorblind', tab: 'access', labelKo: '색약 모드', values: [{ v: 'off', labelKo: '끔' }, { v: 'protan', labelKo: '적록' }, { v: 'tritan', labelKo: '청황' }] },
  { key: 'flashReduce', tab: 'access', labelKo: '섬광 줄이기', values: [{ v: false, labelKo: '끔' }, { v: true, labelKo: '켬' }] },
  { key: 'screenShake', tab: 'access', labelKo: '화면 흔들림', range: [0, 1, 0.1] },
  { key: 'uiScale', tab: 'access', labelKo: 'UI 크기', range: [0.9, 1.3, 0.05] },
  // 게임
  { key: 'damageNumbers', tab: 'game', labelKo: '데미지 숫자', values: [{ v: 'all', labelKo: '전체' }, { v: 'merged', labelKo: '합산' }, { v: 'off', labelKo: '끔' }] },
  { key: 'cameraDist', tab: 'game', labelKo: '카메라 거리', values: [{ v: 'near', labelKo: '가까이' }, { v: 'normal', labelKo: '보통' }, { v: 'far', labelKo: '멀리' }] },
  { key: 'autoAllocate', tab: 'game', labelKo: '자동 배분', values: [{ v: false, labelKo: '끔' }, { v: true, labelKo: '켬' }] },
  { key: 'introShort', tab: 'game', labelKo: '짧은 오프닝', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  // 조작
  { key: 'keybinds', tab: 'controls', labelKo: '키 설정', keymap: true },
  // 그래픽
  { key: 'quality', tab: 'graphics', labelKo: '그래픽 품질', values: [{ v: 'low', labelKo: '낮음' }, { v: 'medium', labelKo: '보통' }, { v: 'high', labelKo: '높음' }] },
  { key: 'autoQuality', tab: 'graphics', labelKo: '자동 품질 조절', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  { key: 'dynamicRes', tab: 'graphics', labelKo: '동적 해상도', values: [{ v: true, labelKo: '켬' }, { v: false, labelKo: '끔' }] },
  { key: 'fpsCap', tab: 'graphics', labelKo: '프레임 제한', values: [{ v: 60, labelKo: '60' }, { v: 30, labelKo: '30' }, { v: 0, labelKo: '무제한' }] },
  { key: 'showFps', tab: 'graphics', labelKo: 'FPS 표시', values: [{ v: false, labelKo: '끔' }, { v: true, labelKo: '켬' }] },
];
/** Korean UI strings owned by core settings (rule 6). */
export const SETTINGS_TEXT_KO = {
  tabs: { assist: '보조 기능', access: '접근성', game: '게임', controls: '조작', graphics: '그래픽' },
  reloadNote: '재시작 후 적용',
  renderRes: '렌더 해상도',
  benchmark: '성능 테스트',
  benchmarkConfirm: '20초 동안 성능을 측정합니다. 진행할까요?',
  copy: '복사',
  offerHigh: '그래픽 품질을 높음으로 바꿀까요? (재시작 필요)',
  offerHighYes: '바꾸기', offerHighNo: '그대로',
  offerLow: '보통 품질로 낮출까요? (재시작 필요)',
  autoLevel: '자동 품질',
  benchLine: '성능 테스트: 평균 {avg} fps · 1% 최저 {low} fps · 자동 품질 L{level} · 렌더 {w}×{h} · CPU {cpu} ms{gpuPart} · {gpu} ({tier})',
};

/** v3 boolean damageNumbers → v4 enum. */
function migrateDamageNumbers(v) {
  if (v === true) return 'merged';
  if (v === false) return 'off';
  return ['all', 'merged', 'off'].includes(v) ? v : 'merged';
}
/** Normalise one value before it is stored (both on load and on set). */
function normalize(k, v) {
  if (k === 'damageNumbers') return migrateDamageNumbers(v);
  if (k === 'colorblind' && v === 'deutan') return 'protan';   // 적록 covers protan + deutan (same palette)
  return v;
}

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
  values.keybinds = { ...DEFAULT_KEYBINDS, ...(saved && typeof saved.keybinds === 'object' ? saved.keybinds : {}) };
  if (!QUALITY_VALUES.includes(values.quality)) values.quality = 'medium';
  // presets changed in v4: a stored preset quality takes the v4 preset values (custom keeps the user's own values)
  if (PRESETS[values.quality]) Object.assign(values, PRESETS[values.quality]);
  else for (const [k, v] of Object.entries(PRESETS.medium)) if (values[k] === undefined) values[k] = v;
  if (!EFFECT_QUALITY_MUL[values.effectQuality]) values.effectQuality = 'medium';
  if (!DIFFICULTY[values.difficulty]) values.difficulty = 'normal';
  for (const k of Object.keys(values)) values[k] = normalize(k, values[k]);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (_) {} };

  const api = {
    values, migrated,
    DIFFICULTY, DIFFICULTY_ORDER, EFFECT_QUALITY_MUL, PRESETS, DEFAULTS, SETTING_DEFS, TEXT_KO: SETTINGS_TEXT_KO, RELOAD_KEYS,
    get(k) { return values[k]; },
    /** Set one setting. Changing any preset-governed key switches quality to 'custom'. opts.persist=false skips storage. */
    set(k, v, { silent = false, persist = true } = {}) {
      v = normalize(k, v);
      if (k === 'quality' && !QUALITY_VALUES.includes(v)) v = 'medium';
      if (k === 'keybinds' && v && typeof v === 'object') v = { ...DEFAULT_KEYBINDS, ...v };
      else if (values[k] === v) return;
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
    /** The preset values currently in force (the stored preset, or medium for 'custom'). */
    preset() { return PRESETS[values.quality] || PRESETS.medium; },
    effectMul() { return EFFECT_QUALITY_MUL[values.effectQuality] ?? 0.8; },
    reset() {
      for (const k of Object.keys(values)) delete values[k];
      Object.assign(values, DEFAULTS, { keybinds: { ...DEFAULT_KEYBINDS } });
      save(); game.events.emit('settingsChanged', { key: '*', value: null, settings: values });
    },
  };
  return api;
}

/**
 * game.assist (PLAN §5.12): the difficulty row × the individual assist settings (product for multipliers).
 * Recomputed on settingsChanged (core); consumers read it lazily each use. Fills and returns `out` (reused).
 */
export function computeAssist(values, out = {}) {
  const d = DIFFICULTY[values.difficulty] || DIFFICULTY.normal;
  out.difficulty = d.id;
  out.tellMul = d.tellMul * (+values.tellMul || 1);
  out.enemySpeed = Math.max(0.5, Math.min(1, d.enemySpeed * (+values.enemySpeed || 1)));
  out.iframeMul = d.iframeMul * (+values.iframeMul || 1);
  out.perfectMul = d.perfectMul * (+values.perfectMul || 1);
  out.fxIntensity = values.fxIntensity == null ? 1 : +values.fxIntensity;
  out.threatStrong = values.threatEmphasis === 'strong';
  out.colorblind = values.colorblind && values.colorblind !== 'off' ? values.colorblind : null;
  out.flashReduce = !!values.flashReduce;
  out.teachSlowmo = values.teachSlowmo !== false;
  out.witchSlowmo = values.witchSlowmo !== false;
  out.offscreenArrows = values.offscreenArrows !== false;
  out.autoRevive = !!d.autoRevive;
  return out;
}
