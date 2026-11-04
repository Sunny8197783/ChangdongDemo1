import * as THREE from 'three';
import { createComposer4 } from './core/post4.js';
import { Emitter } from './core/events.js';
import { Input } from './core/input.js';
import { stubs } from './core/stubs.js';
import { createSettings, computeAssist, PRESETS, DEFAULT_KEYBINDS } from './core/settings.js';
import { createProgression } from './core/progression.js';
import { ELEMENTS_API } from './core/elements.js';
import { CLASSES_API, CLASS_DEFS, familyOf } from './core/classes.js';
import { createStats } from './core/stats.js';
import { createSave } from './core/save.js';
import { createArchetypes } from './core/archetypes.js';
import { createInteract } from './core/interact.js';
import { createTimeScale } from './core/timescale.js';
import { createDebug } from './core/debug.js';
import { KEYS, keymapMode, createKeymap } from './core/keymap.js';
import { DIFFICULTY } from './core/settings.js';
import { createRender } from './core/render.js';
import { detectGpu, baseScale as gpuBaseScale } from './core/gpu.js';
import { createQuality } from './core/quality.js';

const params = new URLSearchParams(location.search);
const isTest = params.has('test');
// v4 test params (PLAN §7.6; ?test=1 implied). prod=1 = production render settings in test (checkShaderErrors off,
// MSAA per preset). governor off in test unless governor=1. seed=N makes Math.random deterministic (rotations, AI, glyphs).
const testParams = {
  prod: isTest && params.get('prod') === '1',
  governor: !isTest || params.get('governor') === '1',
  budgetPx: isTest && params.has('budgetPx') ? +params.get('budgetPx') : null,
  refresh: isTest && params.has('refresh') ? +params.get('refresh') : null,
  seed: isTest && params.has('seed') ? (+params.get('seed') || 0) : null,
  gpu: isTest ? params.get('gpu') : null,
};
let seedRandom = null;   // test only: re-seed the PRNG (game.seedRandom(n)); the rAF loop consumes a boot-dependent number of draws
if (testParams.seed != null) {
  // mulberry32: same sequence for the same seed in every run
  let a = (testParams.seed >>> 0) || 1;
  seedRandom = (n) => { a = (n >>> 0) || 1; };
  Math.random = function seededRandom() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Pixel-ratio cap depends on the quality preset (high-DPI laptops at 'medium' would otherwise render 2.25x pixels).
const prCap = () => (isTest ? 1 : (game.settings?.values?.quality === 'high' ? 1.5 : 1.0));
const basePR = () => Math.min(devicePixelRatio, prCap());

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTest ? 1 : 1.0));   // v4: render scale is a viewport (post4), not the pixel ratio
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // decided per preset at boot (applyBootRender)
// checkShaderErrors costs a synchronous getProgramInfoLog per program: on only in (non-prod) tests or with &shaderCheck
renderer.debug.checkShaderErrors = (isTest && !testParams.prod) || params.has('shaderCheck');
app.appendChild(renderer.domElement);

// NaN guard for every shader. On real GPUs pow(x<0, y) and sqrt(x<0) return NaN. With MSAA, varyings such as a
// strip's uv can land slightly outside [0,1] at triangle edges, so effect shaders doing pow(1.0 - d, k) emit NaN
// pixels. Bloom then smears that NaN across the frame, which shows up as the screen going black during big effects.
// Clamping the base at the GLSL source level fixes every shader (ours and three's) in one place.
{
  const gl = renderer.getContext();
  const origSource = gl.shaderSource.bind(gl);
  const GUARD = '\n#define pow(a, b) pow(max((a), 0.0), (b))\n#define sqrt(a) sqrt(max((a), 0.0))\n';
  gl.shaderSource = (shader, src) => {
    if (typeof src === 'string' && !src.includes('#define pow(a, b)')) {
      const nl = src.startsWith('#version') ? src.indexOf('\n') + 1 : 0;
      src = src.slice(0, nl) + GUARD + src.slice(nl);
    }
    return origSource(shader, src);
  };
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 10, 30);
scene.add(camera);

// v4 render path (PLAN §2.4, src/core/post4.js): scene → HalfFloat target (viewport = dynamic resolution, DepthTexture),
// BloomPass4 (¼-area bright, 3/5 mips, texture only) and one merged FinalPass to the canvas. Created after the settings
// (MSAA and bloom mips are boot decisions); `composer` is declared here so the closures below can reference it.
let composer = null, bloomPass = null;

// raw compile (no target binding): game.render.warm binds the right target itself
const rawCompile = renderer.compile.bind(renderer);
const rawCompileAsync = renderer.compileAsync ? renderer.compileAsync.bind(renderer) : null;
// Every renderer.compile() (modules pre-warm their pools with it) must build the variant that is actually drawn:
// with no target bound three r160 compiles the tone-mapped sRGB canvas variant, but the scene is drawn into the
// composer's linear HalfFloat target. Bind that target for the compile when the caller didn't bind one.
for (const fn of ['compile', 'compileAsync']) {
  const orig = renderer[fn]?.bind(renderer);
  if (!orig) continue;
  renderer[fn] = (...a) => {
    if (renderer.getRenderTarget()) return orig(...a);
    renderer.setRenderTarget(composer.renderTarget1);
    try { return orig(...a); } finally { renderer.setRenderTarget(null); }
  };
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  sizeComposer();
});

// ---------- game object ----------
const game = {
  THREE, renderer, scene, camera, composer: null, bloomPass: null,   // set right after the boot render decisions
  events: new Emitter(),
  input: new Input(renderer.domElement),
  state: 'title',
  time: 0, realTime: 0,
  entities: [],
  isTest,
  _hitstop: 0,
  // legacy read-only views of the time-scale stack (player.timeComp in v2 reads these)
  get _slowScale() { return this.timeScale.value(); },
  get _slowTime() { let t = 0; for (const e of this.timeScale.active()) t = Math.max(t, e.left); return t; },
  _hitstopFrames: 0,
  /**
   * Hitstop v4 (PLAN §2.5, §5.10): hitstop(seconds, {tier, target}) → granted:boolean.
   *  - per-entity: freezes the struck `target` (target.hitstopUntil, game.realTime seconds; enemies skip their update
   *    and tells extends their TellHandles) and the player's animation (game.playerHitstopUntil); other enemies,
   *    telegraphs and projectiles keep running.
   *  - tiers 'ult' and 'kill' freeze globally (≤ 0.10 s). A call without options (legacy v3 signature) is a global freeze too.
   *  - caps: 0.10 s per request (0.12 for break / parry); the 3–4 frame floor only below 50 fps; a rolling 1 s window may
   *    be frozen ≤ 80 ms in total, except ult / break / parry / kill (always granted). Over-budget requests are dropped.
   * Every request is logged (game.debug.hitstopLog()).
   */
  hitstop(s, opts) {
    const legacy = opts == null;
    const tier = opts?.tier || (legacy ? 'legacy' : null), target = opts?.target || null;
    let sec = Math.max(0, +s || 0);
    const exempt = tier === 'ult' || tier === 'break' || tier === 'parry' || tier === 'kill' || (legacy && sec >= 0.1);
    sec = Math.min(sec, tier === 'break' || tier === 'parry' ? 0.12 : legacy ? 0.16 : 0.10);
    const fpsLow = hsFrameDt > 1 / 50 + 1e-6;   // the current frame's real delta (below 50 fps)
    if (fpsLow && sec > 0) sec = Math.max(sec, Math.min(0.12, (sec >= 0.1 ? 4 : 3) * (hsFrameDt || 1 / 60)));
    let granted = sec > 0;
    if (granted && !exempt && hsBudgetUsed(this.realTime) + sec > HS_BUDGET + 1e-9) granted = false;
    if (granted) {
      hsBudgetPush(this.realTime, sec);
      const global = legacy || tier === 'ult' || tier === 'kill';
      if (global) {
        this._hitstop = Math.max(this._hitstop, sec);
        if (fpsLow) this._hitstopFrames = Math.max(this._hitstopFrames, sec >= 0.1 ? 4 : 3);
      }
      const until = this.realTime + sec;
      if (target) target.hitstopUntil = Math.max(target.hitstopUntil || 0, until);
      if (target !== this.player?.entity) this.playerHitstopUntil = Math.max(this.playerHitstopUntil || 0, until);
    }
    hitstopLogPush(this.realTime, sec, tier, granted, target);
    return granted;
  },
  /** true while `e` is frozen by a per-entity hitstop (enemies skip their update; player animation pauses for the player). */
  isHitstopped(e) { return !!e && e.hitstopUntil > this.realTime; },
  playerHitstopUntil: 0,
  /** v2 shim → game.timeScale.set('legacy', scale, s) (CONTRACT §3.3). */
  slowmo(scale, s) { this.timeScale.set('legacy', scale, Math.max(this.timeScale.timeLeft('legacy'), s)); },
  setState(s) {
    const prev = this.state; if (prev === s) return;
    this.state = s; this.events.emit('stateChange', { state: s, prev });
  },
  start() {
    this.audio?.resume?.();
    if (!isTest) this.input.requestLock();
    this.setState('playing');
  },
  pause() { if (this.state === 'playing') { this.setState('paused'); this.input.exitLock(); } },
  resume() { if (this.state === 'paused') { if (!isTest) this.input.requestLock(); this.setState('playing'); } },
  restart() {
    try { sessionStorage.setItem('aw_skipTitle', '1'); } catch (_) {}
    location.reload();
  },
  /** Title → 모험 시작: lore intro cutscene, then the village and the story begins. */
  newGame({ skipIntro = false, clearSave = false } = {}) {
    this.audio?.resume?.();
    if (clearSave) this.save.clear();
    this.progression.reset();
    this.stats.clearPrefix('buff:');
    const begin = () => {
      this.player?.placeInVillage?.();
      if (!isTest) this.input.requestLock();
      this.setState('playing');
      this.story?.begin?.();
    };
    if (skipIntro || !this.cinematic?.playIntro) begin();
    else { this.setState('cutscene'); this.cinematic.playIntro(begin); }
  },
  /** 이어하기: start playing from the v3 save (spawns at the last gate / village with full HP). */
  continueGame() {
    this.audio?.resume?.();
    this.progression.reset();
    this.stats.clearPrefix('buff:');
    this.player?.placeInVillage?.();
    const ok = this.save.load();
    if (!ok || !this.story?.deserialize) this.story?.begin?.();
    if (!isTest) this.input.requestLock();
    this.setState('playing');
    return ok;
  },
  /** The skill provider: game.skills (v3), else the v2 switch via familyOf (stub fallback, CONTRACT §2). */
  activeSkills() {
    if (this.skills && !this.skills.isStub) return this.skills;
    return familyOf(this.progression?.cls) === 'melee' ? this.sword : this.spells;
  },
};
window.game = game;
// ---------- hitstop budget: ≤ 80 ms frozen per rolling second (exempt tiers excluded), ring of granted requests ----------
const HS_BUDGET = 0.08;
const HS_T = new Float64Array(64), HS_S = new Float64Array(64); let hsBHead = 0;
let hsFrameDt = 1 / 60;
function hsBudgetPush(t, sec) { HS_T[hsBHead] = t; HS_S[hsBHead] = sec; hsBHead = (hsBHead + 1) & 63; }
function hsBudgetUsed(now) {
  // frozen time inside [now − 1, now]: each request covers [t, t + sec]
  let sum = 0;
  for (let i = 0; i < 64; i++) { const t = HS_T[i], s = HS_S[i]; if (s <= 0 || t + s < now - 1) continue; sum += Math.min(t + s, now + 1) - Math.max(t, now - 1); }
  return sum;
}
// ---------- hitstop log (game.debug.hitstopLog: the last 64 requests, reused records) ----------
const HS_LOG = Array.from({ length: 64 }, () => ({ t: 0, sec: 0, tier: null, granted: false, target: null }));
let hsHead = 0, hsCount = 0;
function hitstopLogPush(t, sec, tier, granted, target) {
  const r = HS_LOG[hsHead]; hsHead = (hsHead + 1) % HS_LOG.length; if (hsCount < HS_LOG.length) hsCount++;
  r.t = t; r.sec = sec; r.tier = tier; r.granted = granted;
  r.target = target ? (target.type || target.kind || target.id || 'entity') : null;
}
function hitstopLog() {
  const out = [];
  for (let i = 0; i < hsCount; i++) { const r = HS_LOG[(hsHead - hsCount + i + HS_LOG.length) % HS_LOG.length]; out.push({ t: r.t, sec: r.sec, tier: r.tier, granted: r.granted, target: r.target }); }
  return out;
}
// Core services exist BEFORE any module factory runs (CONTRACT §2, PLAN v4 §7.3).
game.testParams = testParams;
if (seedRandom) game.seedRandom = seedRandom;
game.KEYS = KEYS;
game.keymapMode = keymapMode(game);
game.elements = ELEMENTS_API;
game.classes = CLASSES_API;
game.timeScale = createTimeScale(game);
game.settings = createSettings(game);
applyTestSettings();
// game.assist (§5.12): difficulty row × assist settings, recomputed on settingsChanged; consumers read it each use
{
  const assist = computeAssist(game.settings.values, {});
  Object.defineProperty(game, 'assist', { get() { return assist; }, enumerable: true });
  game.events.on('settingsChanged', () => computeAssist(game.settings.values, assist));
}
game.input.keymap = createKeymap(game, DEFAULT_KEYBINDS);
game.enemyTime = 0;                                        // enemy-speed-scaled game seconds (tells time base)
game.frame = { step: 0, n: 1, lastStep: true, frameDt: 0 }; // sub-step info for playing modules (§2.5)
{ let castSeq = 0; game.nextCastId = () => ++castSeq; }
// render state decided at boot (program keys): MSAA, shadow type, point lights (PLAN §2.2: apply on reload only)
const bootPreset = PRESETS[game.settings.values.quality] || PRESETS.medium;
const gpuInfo = detectGpu(renderer);
if (testParams.gpu && ['integrated', 'discrete', 'unknown'].includes(testParams.gpu)) gpuInfo.tier = testParams.gpu;
if (!isTest) { try { game.settings.set('gpuTier', gpuInfo.tier, { silent: true }); } catch (_) { /* */ } }
const bootMsaa = (isTest && !testParams.prod) ? 0 : (game.settings.values.quality === 'custom' ? (game.settings.values.msaa ?? 0) : (bootPreset.msaa ?? 0));
const SHADOW_TYPES = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, pcfsoft: THREE.PCFSoftShadowMap };
const bootShadowType = SHADOW_TYPES[game.settings.values.shadowType] ? game.settings.values.shadowType : (bootPreset.shadowType || 'pcf');
renderer.shadowMap.type = SHADOW_TYPES[bootShadowType];
const bootPointLights = game.settings.values.quality === 'custom' ? !!game.settings.values.pointLights : !!bootPreset.pointLights;
composer = createComposer4(renderer, scene, camera, { msaa: bootMsaa, bloomMips: bootPreset.bloomMips ?? 3 });
bloomPass = composer.bloomPass;
game.composer = composer; game.bloomPass = bloomPass;
/** Allocate the composer at the maximum render size (drawing buffer × renderScale); boot, resize, renderScale only. */
const _db = new THREE.Vector2();
function sizeComposer() {
  renderer.getDrawingBufferSize(_db);
  const rs = Math.max(0.5, Math.min(1, +game.settings.values.renderScale || 1));
  composer.setSize(_db.x, _db.y, rs);
  renderScaleState.alloc = rs; renderScaleState.dirty = true;
}
/** Render scale (fraction of the drawing buffer): pixel-budget base × governor dynamic scale (§2.2, §2.3). */
const renderScaleState = { alloc: 1, base: 1, total: 1, dirty: true };
function updateRenderScale() {
  const v = game.settings.values, q = game.quality;
  renderer.getDrawingBufferSize(_db);
  const budgetPx = testParams.budgetPx > 0 ? testParams.budgetPx : (+v.budgetPx || (PRESETS[v.quality] || PRESETS.medium).budgetPx || 1.0);
  // the drawing buffer already carries the pixel ratio: pr = 1 here
  const base = gpuBaseScale(_db.x, _db.y, 1, budgetPx, renderScaleState.alloc);
  const dyn = q ? Math.max(0.25, Math.min(1, +q.scale || 1)) : 1;
  const total = Math.max(0.25, base * dyn);
  if (q) q.baseScale = base;
  if (!renderScaleState.dirty && Math.abs(total - renderScaleState.total) < 1e-4) return;
  renderScaleState.base = base; renderScaleState.total = total; renderScaleState.dirty = false;
  composer.setScale(total / renderScaleState.alloc);
}
game.render = createRender(game, {
  renderer, scene, camera, rawCompile, sceneTarget: () => composer.readBuffer, gpu: gpuInfo,
  msaa: bootMsaa, pointLights: bootPointLights, shadowType: bootShadowType,
});
game.quality = createQuality(game, { renderSize: (out) => { out.w = composer.viewport.w; out.h = composer.viewport.h; return out; } });
game.quality.gpuTimer.init(renderer);
game.stats = createStats(game);
game.progression = createProgression(game);
game.archetypes = createArchetypes(game);
game.interact = createInteract(game);
game.save = createSave(game);
game.debug = createDebug(game);
game.debug.hitstopLog = hitstopLog;
game.quality.perf = () => perfReport();
if (isTest) game.debug.events.enable();

/** Test params that are settings (PLAN §7.6): applied transiently (never persisted). */
function applyTestSettings() {
  if (!isTest) return;
  const S = game.settings, t = { silent: true, persist: false };
  const q = params.get('quality');
  if (q && PRESETS[q]) { for (const [k, v] of Object.entries(PRESETS[q])) S.set(k, v, t); S.set('quality', q, t); }
  if (params.has('fx')) { const v = +params.get('fx'); if ([1, 0.7, 0.4].includes(v)) S.set('fxIntensity', v, t); }
  if (params.get('difficulty') && DIFFICULTY[params.get('difficulty')]) S.set('difficulty', params.get('difficulty'), t);
  if (params.get('witch') === '0') S.set('witchSlowmo', false, t);
  const cb = params.get('colorblind'); if (cb && ['protan', 'deutan', 'tritan', 'off'].includes(cb)) S.set('colorblind', cb, t);
  if (params.get('threat') === 'strong') S.set('threatEmphasis', 'strong', t);
  if (params.get('hints') === '0') S.set('hints', false, t);
}

// ---------- post hooks (core-owned; fx only calls these) ----------
const GRADES = {
  none:    { tint: [1, 1, 1], sat: 1, contrast: 1 },
  void:    { tint: [0.86, 0.8, 1.12], sat: 0.6, contrast: 1.12 },
  memory:  { tint: [1.08, 0.98, 0.84], sat: 0.45, contrast: 0.95 },
  holy:    { tint: [1.1, 1.05, 0.9], sat: 1.08, contrast: 1.0 },
  cold:    { tint: [0.9, 1.0, 1.12], sat: 0.8, contrast: 1.04 },
  boss:    { tint: [1.03, 0.96, 0.95], sat: 0.92, contrast: 1.12 },
  finale:  { tint: [0.9, 0.84, 1.1], sat: 0.72, contrast: 1.16 },
  dawn:    { tint: [1.08, 1.0, 0.92], sat: 1.1, contrast: 1.02 },
  break:   { tint: [1.0, 1.0, 1.0], sat: 0.35, contrast: 1.2 },
  witch:   { tint: [0.97, 0.99, 1.04], sat: 0.5, contrast: 1.04 },   // v4 witch time: × strength 0.6 → 30 % desaturation
  dusk:    { tint: [0.92, 0.95, 1.1], sat: 0.82, contrast: 1.04 },   // Elderwood (world zones)
  golden:  { tint: [1.08, 1.02, 0.88], sat: 1.06, contrast: 1.02 },  // Mirwen / ending light
};
{
  const U = composer.finalPass.uniforms;   // uChroma / uRadial / uGrade* keep their v3 names (FinalPass4)
  const pulse = { chroma: 0, radial: 0, dur: 0.2, left: 0, peakC: 0, peakR: 0 };
  const grade = { name: 'none', target: { tint: new THREE.Vector3(1, 1, 1), sat: 1, contrast: 1, mix: 0 }, rate: 4 };
  // v4 setGrade(id, strength, {priority, durReal}) entries; the legacy grade() is the cinematic priority (10)
  const GRADE_PRIORITY = { witch: 1, cinematic: 10 };
  const layers = new Map();   // id → {strength, priority, left}
  const legacy = { name: 'none', mix: 0, rate: 4 };
  const NONE = GRADES.none;
  function pickGrade() {
    let id = null, g = null, mix = 0, rate = legacy.rate;
    if (legacy.name !== 'none' && legacy.mix > 0) { id = legacy.name; g = GRADES[legacy.name]; mix = legacy.mix; }
    else {
      let best = -Infinity;
      for (const [lid, L] of layers) if (L.left > 0 && L.strength > 0 && L.priority > best && GRADES[lid]) { best = L.priority; id = lid; g = GRADES[lid]; mix = L.strength; rate = L.rate; }
    }
    if (!g) { g = NONE; id = 'none'; mix = 0; }
    grade.name = id;
    grade.target.tint.set(g.tint[0], g.tint[1], g.tint[2]); grade.target.sat = g.sat; grade.target.contrast = g.contrast;
    grade.target.mix = Math.max(0, Math.min(1, mix)); grade.rate = rate;
  }
  const v2 = (x = 0, y = 0) => ({ value: new THREE.Vector2(x, y) });
  game.post = {
    GRADES, GRADE_PRIORITY,
    // v4 overlay / depth uniforms (§2.4), updated every frame by main before the composer renders
    sceneDepth: { value: null }, uvScale: v2(1, 1), sceneRes: v2(1, 1), canvasRes: v2(1, 1),
    cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
    projInv: { value: camera.projectionMatrixInverse }, camWorld: { value: camera.matrixWorld },
    bloomTex: { value: null },
    /** Base bloom strength (preset bloomStrength; × 0.75 while ≥ 3 enemies are aggroed). Returns the current base. */
    bloomStrength(v) { if (v != null && bloomPass) bloomPass.strength = Math.max(0, +v); return bloomPass?.strength ?? 0; },
    /**
     * Priority-arbitrated colour grade layer. strength 0 removes it; durReal (real s) auto-expires it. The legacy
     * post.grade(name, …) always wins (cinematic priority). GRADES[id] must exist.
     */
    setGrade(id, strength = 1, { priority, durReal, fade = 0.25 } = {}) {
      if (!id) return;
      if (!(strength > 0)) { layers.delete(id); pickGrade(); return; }
      layers.set(id, { strength: Math.min(1, +strength), priority: priority ?? GRADE_PRIORITY[id] ?? 5, left: durReal > 0 ? durReal : Infinity, rate: fade > 0 ? 3 / fade : 1000 });
      pickGrade();
    },
    /** Chromatic + radial pulse that decays over durReal (real seconds). opts.radial overrides the blur amount. */
    pulse(amount = 0.5, durReal = 0.25, opts = {}) {
      const scale = game.settings?.values?.screenShake ?? 1;
      const a = Math.max(0, Math.min(2, amount)) * (scale > 0 ? 1 : 0.4);
      pulse.peakC = Math.max(pulse.left > 0 ? U.uChroma.value : 0, a);
      pulse.peakR = Math.max(pulse.left > 0 ? U.uRadial.value : 0, opts.radial ?? a * 0.6);
      pulse.dur = Math.max(0.05, durReal); pulse.left = pulse.dur;
      U.uChroma.value = pulse.peakC; U.uRadial.value = pulse.peakR;
    },
    /** Blend toward a named grade (see GRADES). blend 0 removes it. dur = fade time in real seconds. */
    grade(name = 'none', blend = 1, dur = 0.6) {
      legacy.name = GRADES[name] ? name : 'none';
      legacy.mix = legacy.name === 'none' ? 0 : Math.max(0, Math.min(1, blend));
      legacy.rate = dur > 0 ? 3 / dur : 1000;
      pickGrade();
      if (legacy.name === 'none') grade.rate = legacy.rate;
    },
    get gradeName() { return grade.name; },
    update(realDt) {
      let expired = false;
      for (const [lid, L] of layers) if (L.left !== Infinity) { L.left -= realDt; if (L.left <= 0) { layers.delete(lid); expired = true; } }
      if (expired) pickGrade();
      if (pulse.left > 0) {
        pulse.left = Math.max(0, pulse.left - realDt);
        const k = pulse.left / pulse.dur, e = k * k;
        U.uChroma.value = pulse.peakC * e; U.uRadial.value = pulse.peakR * e;
      } else if (U.uChroma.value !== 0 || U.uRadial.value !== 0) { U.uChroma.value = 0; U.uRadial.value = 0; }
      const t = 1 - Math.exp(-grade.rate * realDt), T = grade.target;
      U.uGradeMix.value += (T.mix - U.uGradeMix.value) * t;
      if (Math.abs(U.uGradeMix.value - T.mix) < 1e-3) U.uGradeMix.value = T.mix;
      U.uGradeSat.value += (T.sat - U.uGradeSat.value) * t;
      U.uGradeContrast.value += (T.contrast - U.uGradeContrast.value) * t;
      U.uGradeTint.value.lerp(T.tint, t);
    },
    uniforms: U,
  };
}

// ---------- difficulty (DESIGN §16): game.difficulty + stats source 'difficulty' ----------
function applyDifficulty() {
  const d = DIFFICULTY[game.settings.values.difficulty] || DIFFICULTY.normal;
  game.difficulty = d;
  game.stats.set('difficulty', {});
}
if (isTest && params.get('difficulty') && DIFFICULTY[params.get('difficulty')]) game.settings.set('difficulty', params.get('difficulty'), { silent: true, persist: false });
applyDifficulty();
game.events.on('settingsChanged', ({ key }) => { if (key === 'difficulty' || key === '*') applyDifficulty(); });

// ---------- settings owned by main: render scale, shadows, bloom ----------
// Shadows: never toggle renderer.shadowMap.enabled (that changes every program key → full-scene recompile). The map is
// rendered on demand (autoUpdate off): every frame at medium, every 2nd frame at low/L3, frozen at L5. 'off' = one
// render with no casters (clears the map to far depth, see clearShadowMap), then frozen. three r160 tests shadow casters
// against the VIEW camera's layers, so a shadow-camera layer mask does not hide anything (world request).
let shadowsOn = true, shadowEvery = 1, shadowFrame = 0, shadowClear = false;
const CLEAR_LAYER = 31;
function applyShadowMode() {
  const v = game.settings.values;
  const on = !!v.shadows;
  renderer.shadowMap.autoUpdate = false;
  if (shadowsOn && !on) shadowClear = true;
  shadowsOn = on;
  shadowEvery = Math.max(1, (v.shadowQuality === 'low' || v.quality === 'low') ? 2 : (+v.shadowEvery || 1));
  renderer.shadowMap.needsUpdate = on;
  if (!on) shadowClear = true;
}
/** One shadow render with no casters: the view camera sees only layer 31, on which only the sun is enabled for the call. */
const _clearRT = new THREE.WebGLRenderTarget(1, 1);
function clearShadowMap() {
  shadowClear = false;
  const sun = game.world?.sun; if (!sun || !sun.castShadow) return;
  const mask = camera.layers.mask, sunMask = sun.layers.mask, prevRT = renderer.getRenderTarget();
  try {
    camera.layers.set(CLEAR_LAYER); sun.layers.enable(CLEAR_LAYER);
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(_clearRT); renderer.render(scene, camera);
  } catch (err) { console.warn('[shadow clear]', err?.message); }
  finally { camera.layers.mask = mask; sun.layers.mask = sunMask; renderer.setRenderTarget(prevRT); renderer.shadowMap.needsUpdate = false; }
}
/** Bloom per preset (§2.2): threshold 1.0, strength, mips; FXAA off only when MSAA 4 runs. Re-applied after module init. */
function applyBloomPreset() {
  const v = game.settings.values, P = PRESETS[v.quality] || PRESETS.medium;
  bloomPass.enabled = !!v.bloom;
  bloomPass.threshold = 1.0;
  bloomPass.radius = 0.6;
  bloomPass.strength = +(v.bloomStrength ?? P.bloomStrength ?? 0.4);
  composer.setBloomMips(+(v.bloomMips ?? P.bloomMips ?? 3));
  composer.finalPass.uniforms.uFxaa.value = (v.fxaa === false && bootMsaa > 0) ? 0 : 1;
}
function applyRenderSettings() {
  renderer.setPixelRatio(basePR());
  renderer.setSize(innerWidth, innerHeight);
  sizeComposer();
  applyShadowMode();
  applyBloomPreset();
}
applyRenderSettings();
game.events.on('settingsChanged', ({ key }) => {
  if (['renderScale', 'shadows', 'shadowQuality', 'shadowEvery', 'quality', 'bloom', 'bloomStrength', 'bloomMips', 'fxaa', 'budgetPx', '*'].includes(key)) applyRenderSettings();
});

// ---------- modules ----------
const ORDER = ['world', 'vfx', 'combat', 'tells', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui'];
const FILES = {
  world: ['./world.js', 'createWorld'], vfx: ['./vfx.js', 'createVFX'], combat: ['./combat.js', 'createCombat'], tells: ['./tells.js', 'createTells'],
  audio: ['./audio.js', 'createAudio'], player: ['./player.js', 'createPlayer'], spells: ['./spells.js', 'createSpells'],
  sword: ['./sword.js', 'createSword'], skills: ['./skills.js', 'createSkills'], enemies: ['./enemies.js', 'createEnemies'], story: ['./story.js', 'createStory'],
  cinematic: ['./cinematic.js', 'createCinematic'], ui: ['./ui.js', 'createUI'],
};
game.stubbed = [];

async function boot() {
  const loaded = {};
  // test hook: &stub=all | &stub=world,vfx,… forces those modules onto their core stubs (boot-safety checks)
  const stubParam = isTest ? (params.get('stub') || '') : '';
  const forceStub = new Set(stubParam === 'all' ? ORDER : stubParam.split(',').filter(Boolean));
  await Promise.all(ORDER.map(async (name) => {
    if (forceStub.has(name)) return;
    try { loaded[name] = await import(FILES[name][0]); }
    catch (err) { console.warn(`[boot] ${name} unavailable, using stub:`, err.message); }
  }));
  for (const name of ORDER) {
    const factory = loaded[name]?.[FILES[name][1]];
    let mod = null;
    if (factory) {
      try { mod = factory(game); }
      catch (err) { console.error(`[boot] ${name} factory failed:`, err); }
    }
    if (!mod) { mod = stubs[name](game); game.stubbed.push(name); }
    game[name] = mod;
  }
  for (const name of ORDER) {
    try { game[name].init?.(); } catch (err) { console.error(`[boot] ${name}.init failed:`, err); }
  }
  if (game.stubbed.length) console.warn('[boot] stubbed modules:', game.stubbed.join(', '));
  applyShadowMode();
  applyBloomPreset();
  await prewarm();

  let skip = false;
  try { skip = sessionStorage.getItem('aw_skipTitle') === '1'; sessionStorage.removeItem('aw_skipTitle'); } catch (_) {}
  if (isTest) {
    try { await applyTestParams(); } catch (err) { console.error('[boot] test params failed', err); }
  } else if (skip) game.events.emit('skipTitle', {});

  game.ready = true;
  requestAnimationFrame(loop);
  // title benchmark (§2.3, P0): 2 s of real frames behind the title pick the governor's start level + the high offer
  if (!isTest && testParams.governor && game.state === 'title') {
    setTimeout(() => { if (game.state === 'title') game.quality.titleBenchmark({ seconds: 2 }).catch?.(() => {}); }, 600);
  }
}

// ---------- test URL params (CONTRACT §21) ----------
// ?test=1[&cls=<6 ids>|none][&level=N][&skills=all|primary|<id,..>|preset:<name>][&equip=q1:<id>,..][&difficulty=..]
//   [&attune=<el>][&unlock=all][&points=inf][&quest=<stage>][&zone=<id>][&boss=<id>][&phase=N][&save=1]
//   legacy: [&path=all|master&el=<el>] → v2 choose() shim (presets legacy_all / legacy_master_<el>, implies unlock=all)
async function applyTestParams() {
  const P = game.progression, D = game.debug;
  if (params.has('intro')) { game.newGame(); return; }
  game.newGame({ skipIntro: true });
  const clsParam = params.get('cls') || 'mage';
  if (clsParam === 'none') return;
  const cls = CLASS_DEFS[clsParam] ? clsParam : 'mage';
  if (params.get('unlock') === 'all') P.debug.ungate = true;
  if (params.get('points') === 'inf') P.debug.infPoints = true;
  const level = params.has('level') ? +params.get('level') : 0;
  if (params.has('path')) {
    P.choose(cls, params.get('path') || 'all', params.get('el') || 'fire');   // legacy: sets ungate
  } else {
    P.setClass(cls);   // emits classChosen (every module listens to it; the v2 pathChosen bridge is gone)
  }
  if (level) P.setLevel(level);
  try { game.story?.debugSkip?.(params.get('quest') || 'camps'); } catch (err) { console.error('[boot] debugSkip', err); }
  if (level && P.level !== level) P.setLevel(level);
  const sk = params.get('skills');
  if (sk) {
    if (sk.startsWith('preset:')) { if (!game.skills?.applyPreset?.(sk.slice(7))) console.warn('[boot] preset unavailable:', sk); }
    else if (sk === 'all') D.learnAll();
    else if (sk === 'primary') {
      const map = {};
      for (const el of CLASS_DEFS[cls].primary) for (const n of P.nodesOf(el)) {
        if (n.type === 'modifier' && n.exclusive && /b$/.test(n.id)) continue;
        map[n.id] = n.maxRank || 1;
      }
      P.setRanks(map, { ignoreBudget: true, ignoreGates: true });
    } else {
      const map = {};
      for (const id of sk.split(',')) if (id) map[id.trim()] = P.node(id.trim())?.maxRank || 1;
      P.setRanks(map, { ignoreBudget: true, ignoreGates: true });
    }
    if (!sk.startsWith('preset:')) { try { game.skills?.autoEquip?.(); } catch (_) { /* */ } }
  }
  const eq = params.get('equip');
  if (eq) for (const pair of eq.split(',')) { const [slot, id] = pair.split(':'); if (slot && id) game.skills?.equip?.(slot, id); }
  if (params.get('attune')) game.skills?.attune?.(params.get('attune'));
  if (params.get('zone')) D.tp(params.get('zone'));
  const bossId = params.get('boss');
  if (bossId) {
    try {
      const r = game.enemies?.spawnBoss?.(bossId);
      if (r && typeof r.then === 'function') await r.catch((err) => console.warn('[boot] spawnBoss', err));
      if (params.has('phase')) D.bossPhase(+params.get('phase'));
    } catch (err) { console.error('[boot] boss param', err); }
  }
}

// Pre-warm every program at boot with the composer's HalfFloat target bound: three r160 picks the program
// variant (tone mapping / output colour space) from the *current* render target, and every scene draw goes into
// the composer target (linear, no tone mapping). Modules may expose prewarm() to add hidden instances of lazily
// created materials first; they are removed again after compiling.
async function prewarm() {
  const tmp = [];
  for (const name of ORDER) {
    try { const objs = game[name]?.prewarm?.(); if (objs) for (const o of [].concat(objs)) if (o && !o.parent) { scene.add(o); tmp.push(o); } }
    catch (err) { console.warn(`[boot] ${name}.prewarm`, err); }
  }
  // (compile visits every material, hidden or not; only lights must be visible to count, as in a real render;
  //  the composer target is bound by the compile wrapper above)
  const tc = performance.now();
  try {
    // KHR_parallel_shader_compile: compileAsync lets the title keep animating while the driver links
    if (renderer.compileAsync && !isTest) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (err) { console.warn('[boot] precompile', err); }
  // threat scene: canvas variant (sRGB output, toneMapped:false materials), never the composer target
  try {
    const th = game.render.threatScene;
    if (th.children.length) {
      renderer.setRenderTarget(null);
      if (renderer.compileAsync && !isTest) await rawCompileAsync(th, game.render.overlayCamera, th);
      else rawCompile(th, game.render.overlayCamera, th);
    }
  } catch (err) { console.warn('[boot] threat precompile', err); }
  // then one real draw per material (64×64 scene target / 1×1 canvas scissor for the threat scene), prewarm objects included
  try { game.render.bootWarm(); } catch (err) { console.warn('[boot] warm draws', err); }
  finally { for (const o of tmp) scene.remove(o); }
  game.bootWarm = { compileMs: +(performance.now() - tc).toFixed(1), ...(game.render.warmStats().boot || {}) };
}

// First-draw warm-up: a program compiled by renderer.compile() still pays its link wait and the driver's
// per-render-state pipeline build the first time it is actually drawn (seconds on software GL, a visible hitch
// on real GPUs). When a boss spawns or changes phase, many objects are drawn for the first time once the camera
// turns, so we render the scene once in four directions from the current camera position, behind the boss
// intro, so those costs are paid before the fight. The normal frame then overwrites the output.
let warmPending = false;
const warmQ = new THREE.Quaternion();
function warmView() {
  warmPending = false;
  warmQ.copy(camera.quaternion);
  const yaw0 = Math.atan2(-camera.matrixWorld.elements[8], -camera.matrixWorld.elements[10]);
  try {
    for (let i = 1; i < 4; i++) {
      camera.rotation.set(-0.12, yaw0 + i * Math.PI / 2, 0, 'YXZ');
      camera.updateMatrixWorld(true);
      if (shadowsOn) renderer.shadowMap.needsUpdate = true;
      composer.render(0);
    }
  } catch (err) { console.warn('[warm]', err?.message); }
  camera.quaternion.copy(warmQ); camera.updateMatrixWorld(true);
  // the warm passes are not part of this frame's cost: keep draw-call stats (autoReset off in tests) for the real render
  renderer.info.reset();
}
game.warmView = () => { warmPending = true; };
game.events.on('bossSpawn', () => { warmPending = true; });
game.events.on('bossPhase', () => { warmPending = true; });

// ---------- loop ----------
let last = performance.now();
const fpsWin = [];
// per-module CPU ms (game.debug.perf(): median over the last 120 frames; sub-steps of one frame are summed)
const PERF_N = 120, PERF_NAMES = ['world', 'vfx', 'combat', 'tells', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui', 'stats', 'render'];
const perfRing = Object.fromEntries(PERF_NAMES.map((n) => [n, new Float32Array(PERF_N)]));
const perfAcc = Object.fromEntries(PERF_NAMES.map((n) => [n, 0]));
let perfHead = 0, perfCount = 0;
function perfCommit() {
  for (const n of PERF_NAMES) { perfRing[n][perfHead] = perfAcc[n]; perfAcc[n] = 0; }
  perfHead = (perfHead + 1) % PERF_N; if (perfCount < PERF_N) perfCount++;
}
const _perfTmp = new Float32Array(PERF_N);
function perfReport() {
  const out = {};
  for (const n of PERF_NAMES) {
    for (let i = 0; i < perfCount; i++) _perfTmp[i] = perfRing[n][i];
    const a = Array.from(_perfTmp.subarray(0, perfCount)).sort((x, y) => x - y);
    out[n] = a.length ? +a[a.length >> 1].toFixed(3) : 0;
  }
  out.frames = perfCount;
  return out;
}
function call(name, dt, realDt) {
  const t0 = performance.now();
  try { game[name].update(dt, realDt); }
  catch (err) {
    if (!call.errs) call.errs = {};
    if (!call.errs[name]) { console.error(`[loop] ${name}.update:`, err); call.errs[name] = true; }
  }
  perfAcc[name] += performance.now() - t0;
}
const FR = game.frame;
let prevSimMs = 0;
// step group order (§7.3): player → stats → spells → sword → skills (before enemies: a cast lands in the frame of its input) → enemies → combat → story → cinematic
const STEP_MODS = ['player', 'stats', 'spells', 'sword', 'skills', 'enemies', 'combat', 'story', 'cinematic'];
function frame(realDt, render = true) {
  game.frameCount = (game.frameCount || 0) + 1;
  game.timeScale.update(realDt);          // first, in every state (CONTRACT §2)
  game.input.update();
  game.realTime += realDt;
  try { game.quality.update(realDt); } catch (_) { /* */ }

  let dt = 0;
  const st = game.state;
  FR.step = 0; FR.n = 1; FR.lastStep = true; FR.frameDt = 0;
  if (st === 'playing') {
    // F is interact only (CONTRACT §6). In the legacy keymap F keeps its old ultimate meaning when nothing is offered.
    if (game.input.pressed(KEYS.interact) && (game.keymapMode === 'v3' || game.interact.current())) {
      try { game.interact.use(); } catch (err) { console.error('[interact] use', err); }
    }
    let scale = game.timeScale.value();
    // global freeze: only hitstop tiers ult / kill (and legacy no-option calls); per-entity hitstop never stops the clock
    const frozen = game._hitstop > 0 || game._hitstopFrames > 0;
    if (frozen) { game._hitstop -= realDt; if (game._hitstopFrames > 0) game._hitstopFrames--; scale *= 0.03; }
    if (game.cinematic?.active) scale *= game.cinematic.timeScale ?? 1;
    // logic-only sub-steps (§2.5): realDt ≤ 0.1, n = min(2, ceil(realDt / (1/30))) so a step is ≤ 1/20 s; n = 1 when the
    // previous frame's simulation took > 8 ms (no CPU spiral). Visual-only work runs on game.frame.lastStep.
    const rdt = Math.min(realDt, 0.1);
    hsFrameDt = rdt;
    const n = prevSimMs > 8 ? 1 : Math.max(1, Math.min(2, Math.ceil(rdt * 30 - 1e-6)));
    const stepDt = (rdt / n) * scale;
    dt = stepDt;
    FR.n = n; FR.frameDt = stepDt * n;
    const simT0 = performance.now();
    const stepReal = realDt / n;
    const enemySpeed = game.assist.enemySpeed;
    const fdt = stepDt * n, freal = realDt;
    for (let i = 0; i < n; i++) {
      FR.step = i; FR.lastStep = i === n - 1;
      if (!frozen) game.enemyTime += stepDt * enemySpeed;
      game.time += stepDt;
      // a module that declares `substeps: true` (it does its visual-only work on game.frame.lastStep) runs every
      // sub-step; any other module runs once per frame on the last step with the whole frame dt (v3-compatible fallback:
      // no slow motion, no doubled visual work)
      for (let k = 0; k < STEP_MODS.length; k++) {
        const name = STEP_MODS[k];
        if (name === 'stats') { try { game.stats.update(stepDt); } catch (err) { if (!call.statsErr) { console.error('[loop] stats.update:', err); call.statsErr = true; } } continue; }
        if (game[name]?.substeps === true) call(name, stepDt, stepReal);
        else if (FR.lastStep) call(name, fdt, freal);
      }
    }
    dt = FR.frameDt;
    prevSimMs = performance.now() - simT0;
  } else if (st === 'dialogue' || st === 'cutscene') {
    // Gameplay frozen; ambient world keeps moving. Story drives dialogue camera; cinematic drives cutscenes.
    dt = Math.min(realDt, 1 / 20);
    FR.frameDt = dt;
    call('story', 0, realDt);
    call('cinematic', dt, realDt);
  } else if (!game.cinematic?.active) {
    // victory / title / dead: let the cinematic overlay & colour grade finish easing out (letterbox retract etc.)
    call('cinematic', 0, realDt);
  }
  if (st !== 'playing') { try { game.stats.flush(); } catch (_) { /* */ } }   // menus see learn/respec changes
  try { game.interact.update(realDt); } catch (_) { /* */ }
  try { game.save.update(realDt); } catch (_) { /* */ }
  game.post.update(realDt);
  const ambientDt = st === 'dialogue' || st === 'cutscene' ? Math.min(realDt, 1 / 20) : dt;
  // once per frame: world → tells → vfx → ui → audio (tells before vfx so footprints are current for ducking)
  call('world', ambientDt, realDt);
  call('tells', ambientDt, realDt);
  call('vfx', ambientDt, realDt);
  call('ui', realDt, realDt);
  call('audio', realDt, realDt);
  if (render) {
    if (warmPending) warmView();
    if (game.render.warmQueue) game.render.flushWarm();
    scheduleShadows();
    const tr = performance.now();
    renderFrame(realDt);
    perfAcc.render += performance.now() - tr;
  }
  perfCommit();
  game.input.endFrame();
}
// ---------- render: composer (scene → bloom → final) → threat scene over the canvas (§2.4) ----------
function scheduleShadows() {
  if (shadowClear) clearShadowMap();
  if (!shadowsOn) return;
  const B = game.quality?.budget;
  if (B?.shadowFrozen) return;
  const every = Math.max(shadowEvery, B?.shadowEvery || 1);
  if ((++shadowFrame % every) === 0) renderer.shadowMap.needsUpdate = true;
}
let aggroT = 0, aggroMany = false;
function updatePostUniforms(realDt) {
  updateRenderScale();
  const P = game.post, rb = composer.readBuffer;
  P.sceneDepth.value = rb.depthTexture;
  P.uvScale.value.copy(composer.uvScale);
  P.sceneRes.value.set(composer.viewport.w, composer.viewport.h);   // live render size (px) of the scene pass
  renderer.getDrawingBufferSize(_sz); P.canvasRes.value.copy(_sz);
  P.cameraNear.value = camera.near; P.cameraFar.value = camera.far;
  P.bloomTex.value = bloomPass.texture;
  // bloom 0.30 (× 0.75 of the preset) while ≥ 3 enemies are aggroed; governor L4 turns it off (uniform only)
  aggroT -= realDt || 0;
  if (aggroT <= 0) { aggroT = 0.25; try { aggroMany = (game.enemies?.aggroCount?.() ?? 0) >= 3; } catch (_) { aggroMany = false; } }
  composer.bloomMul = aggroMany ? 0.75 : 1;
  composer.bloomActive = game.quality?.budget ? game.quality.budget.bloom !== false : true;
}
const _sz = new THREE.Vector2();
function renderFrame(dt) {
  updatePostUniforms(dt);
  composer.render(dt);
  game.render.drawOverlay();
}
function loop(now) {
  requestAnimationFrame(loop);
  if (game.frozen) { last = now; return; }
  // frame cap (fpsCap 60 default / 30 / 0 = 무제한): skip callbacks earlier than 1/fpsCap − 2 ms after the last frame
  const cap = +game.settings.values.fpsCap || 0;
  if (cap > 0 && now - last < 1000 / cap - 2) return;
  let realDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  fpsWin.push(realDt); if (fpsWin.length > 60) fpsWin.shift();
  game.fps = fpsWin.length / fpsWin.reduce((a, b) => a + b, 0);
  const t0 = performance.now();
  const G = game.quality, gov = testParams.governor;
  if (gov) G.gpuTimer.begin();
  frame(realDt);
  if (gov) {
    G.gpuTimer.end();
    try { G.frame(realDt * 1000, performance.now() - t0, G.gpuTimer.poll()); } catch (err) { if (!loop.gErr) { loop.gErr = true; console.error('[governor]', err); } }
  }
}
// ---------- quality governor v4: src/core/quality.js (game.quality.frame above; never persisted) ----------
// ---------- test hooks ----------
// game.freeze(true) stops the rAF loop; game.step(n, dt) advances n frames deterministically without
// rendering (last frame rendered when render=true). Used by tools/shot.js and tools/playtest.js.
game.freeze = (on = true) => { game.frozen = on; if (!on) last = performance.now(); };
game.step = (n = 1, dt = 1 / 60, render = false) => {
  for (let i = 0; i < n; i++) frame(dt, render && i === n - 1);
};
game.renderNow = () => renderFrame(0);

boot();
