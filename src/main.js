import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Emitter } from './core/events.js';
import { Input } from './core/input.js';
import { stubs } from './core/stubs.js';
import { createSettings } from './core/settings.js';
import { createProgression } from './core/progression.js';
import { ELEMENTS_API } from './core/elements.js';
import { CLASSES_API, CLASS_DEFS, familyOf } from './core/classes.js';
import { createStats } from './core/stats.js';
import { createSave } from './core/save.js';
import { createArchetypes } from './core/archetypes.js';
import { createInteract } from './core/interact.js';
import { createTimeScale } from './core/timescale.js';
import { createDebug } from './core/debug.js';
import { KEYS, keymapMode } from './core/keymap.js';
import { DIFFICULTY } from './core/settings.js';

const params = new URLSearchParams(location.search);
const isTest = params.has('test');
// Pixel-ratio cap depends on the quality preset (high-DPI laptops at 'medium' would otherwise render 2.25x pixels).
const prCap = () => (isTest ? 1 : (game.settings?.values?.quality === 'high' ? 1.5 : 1.0));
const basePR = () => Math.min(devicePixelRatio, prCap());

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTest ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

// Canvas MSAA would only cover the final OutputPass quad; anti-alias the scene target itself instead (WebGL2).
const composerRT = (samples) => new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples });
const composer = new EffectComposer(renderer, composerRT(isTest ? 0 : 4));
composer.addPass(new RenderPass(scene, camera));
// Second safety net: scrub any NaN/Inf left in the HDR scene target (e.g. normalize(0) in some shader) before
// bloom can spread it across the frame, and cap extreme additive stacking that would overflow half floats.
// It also carries the core-owned post hooks (CONTRACT §3.3): uChroma (chromatic split) + uRadial (radial blur) for
// game.post.pulse, and a colour grade (tint / saturation / contrast) for game.post.grade. All are uniform branches.
const sanitizePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uChroma: { value: 0 }, uRadial: { value: 0 },
    uGradeTint: { value: new THREE.Vector3(1, 1, 1) }, uGradeSat: { value: 1 }, uGradeContrast: { value: 1 }, uGradeMix: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uChroma; uniform float uRadial;
    uniform vec3 uGradeTint; uniform float uGradeSat; uniform float uGradeContrast; uniform float uGradeMix;
    varying vec2 vUv;
    vec4 safeTex(vec2 uv){ vec4 c = texture2D(tDiffuse, uv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); return c; }
    void main(){
      vec4 c;
      if (uChroma > 0.0005 || uRadial > 0.0005) {
        vec2 d = vUv - 0.5;
        vec4 acc = vec4(0.0);
        for (int i = 0; i < 6; i++) { float t = float(i) / 5.0; acc += safeTex(vUv - d * (uRadial * 0.07 * t)); }
        c = acc / 6.0;
        vec2 off = d * uChroma * 0.018;
        c.r = mix(c.r, safeTex(vUv + off).r, 0.85);
        c.b = mix(c.b, safeTex(vUv - off).b, 0.85);
      } else c = safeTex(vUv);
      if (uGradeMix > 0.001) {
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 g = mix(vec3(l), c.rgb, uGradeSat) * uGradeTint;
        g = (g - 0.18) * uGradeContrast + 0.18;
        c.rgb = mix(c.rgb, max(g, vec3(0.0)), uGradeMix);
      }
      gl_FragColor = clamp(c, 0.0, 512.0);
    }`,
});
composer.addPass(sanitizePass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.86);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

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
  composer.setSize(innerWidth, innerHeight);
});

// ---------- game object ----------
const game = {
  THREE, renderer, scene, camera, composer, bloomPass,
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
  hitstop(s) {
    this._hitstop = Math.max(this._hitstop, Math.min(s, 0.25));
    // minimum frozen frame count so the freeze still reads on low-FPS machines
    if (s > 0) this._hitstopFrames = Math.max(this._hitstopFrames, s >= 0.1 ? 4 : 3);
  },
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
// Core services exist BEFORE any module factory runs (CONTRACT §2).
game.KEYS = KEYS;
game.keymapMode = keymapMode(game);
game.elements = ELEMENTS_API;
game.classes = CLASSES_API;
game.timeScale = createTimeScale(game);
game.settings = createSettings(game);
game.stats = createStats(game);
game.progression = createProgression(game);
game.archetypes = createArchetypes(game);
game.interact = createInteract(game);
game.save = createSave(game);
game.debug = createDebug(game);
if (isTest) game.debug.events.enable();

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
  dusk:    { tint: [0.92, 0.95, 1.1], sat: 0.82, contrast: 1.04 },   // Elderwood (world zones)
  golden:  { tint: [1.08, 1.02, 0.88], sat: 1.06, contrast: 1.02 },  // Mirwen / ending light
};
{
  const U = sanitizePass.uniforms;
  const pulse = { chroma: 0, radial: 0, dur: 0.2, left: 0, peakC: 0, peakR: 0 };
  const grade = { name: 'none', target: { tint: new THREE.Vector3(1, 1, 1), sat: 1, contrast: 1, mix: 0 }, rate: 4 };
  game.post = {
    GRADES,
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
      const g = GRADES[name] || GRADES.none;
      grade.name = GRADES[name] ? name : 'none';
      grade.target.tint.set(g.tint[0], g.tint[1], g.tint[2]);
      grade.target.sat = g.sat; grade.target.contrast = g.contrast;
      grade.target.mix = grade.name === 'none' ? 0 : Math.max(0, Math.min(1, blend));
      grade.rate = dur > 0 ? 3 / dur : 1000;
    },
    get gradeName() { return grade.name; },
    update(realDt) {
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
// Shadows: never toggle renderer.shadowMap.enabled (that changes every program key → full-scene recompile).
// 'off' = shadow camera sees nothing, map rendered once (cleared to far depth) and frozen. 'low' quality =
// shadow map refreshed every 2nd frame (the sun is static and the shadow camera is texel-snapped).
const SHADOW_LAYERS_ALL = 1;   // layer 0 (default); hidden source parts live on other layers
let shadowsOn = true, shadowEvery = 1, shadowFrame = 0;
function applyShadowMode() {
  const v = game.settings.values;
  const on = !!v.shadows;
  const sun = game.world?.sun;
  shadowEvery = v.shadowQuality === 'low' || v.quality === 'low' ? 2 : 1;
  renderer.shadowMap.autoUpdate = false;
  shadowsOn = on;
  if (sun) sun.shadow.camera.layers.mask = on ? SHADOW_LAYERS_ALL : 0;
  renderer.shadowMap.needsUpdate = true;   // off: one clearing pass, then frozen
}
function applyRenderSettings() {
  const v = game.settings.values;
  const msaa = (v.quality === 'low' || isTest) ? 0 : 4;
  if (composer.renderTarget1.samples !== msaa) { composer.renderTarget1.samples = msaa; composer.renderTarget2.samples = msaa; composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  renderer.setPixelRatio(basePR() * (v.renderScale || 1));
  composer.setPixelRatio?.(basePR() * (v.renderScale || 1));
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  applyShadowMode();
  bloomPass.enabled = !!v.bloom;
}
applyRenderSettings();
game.events.on('settingsChanged', ({ key }) => {
  if (['renderScale', 'shadows', 'shadowQuality', 'quality', 'bloom', '*'].includes(key)) applyRenderSettings();
});

// ---------- modules ----------
const ORDER = ['world', 'vfx', 'combat', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui'];
const FILES = {
  world: ['./world.js', 'createWorld'], vfx: ['./vfx.js', 'createVFX'], combat: ['./combat.js', 'createCombat'],
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
  await prewarm();

  let skip = false;
  try { skip = sessionStorage.getItem('aw_skipTitle') === '1'; sessionStorage.removeItem('aw_skipTitle'); } catch (_) {}
  if (isTest) {
    try { await applyTestParams(); } catch (err) { console.error('[boot] test params failed', err); }
  } else if (skip) game.events.emit('skipTitle', {});

  game.ready = true;
  requestAnimationFrame(loop);
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
  try {
    if (renderer.compileAsync && !isTest) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (err) { console.warn('[boot] precompile', err); }
  finally { for (const o of tmp) scene.remove(o); }
}

// ---------- loop ----------
let last = performance.now();
const fpsWin = [];
function call(name, dt, realDt) {
  try { game[name].update(dt, realDt); }
  catch (err) {
    if (!call.errs) call.errs = {};
    if (!call.errs[name]) { console.error(`[loop] ${name}.update:`, err); call.errs[name] = true; }
  }
}
function frame(realDt, render = true) {
  game.timeScale.update(realDt);          // first, in every state (CONTRACT §2)
  game.input.update();
  game.realTime += realDt;

  let dt = 0;
  const st = game.state;
  if (st === 'playing') {
    // F is interact only (CONTRACT §6). In the legacy keymap F keeps its old ultimate meaning when nothing is offered.
    if (game.input.pressed(KEYS.interact) && (game.keymapMode === 'v3' || game.interact.current())) {
      try { game.interact.use(); } catch (err) { console.error('[interact] use', err); }
    }
    let scale = game.timeScale.value();
    if (game._hitstop > 0 || game._hitstopFrames > 0) { game._hitstop -= realDt; if (game._hitstopFrames > 0) game._hitstopFrames--; scale *= 0.03; }
    if (game.cinematic?.active) scale *= game.cinematic.timeScale ?? 1;
    dt = Math.min(realDt, 1 / 20) * scale;
    game.time += dt;
    call('player', dt, realDt);
    try { game.stats.update(dt); } catch (err) { if (!call.statsErr) { console.error('[loop] stats.update:', err); call.statsErr = true; } }
    call('spells', dt, realDt);
    call('sword', dt, realDt);
    call('skills', dt, realDt);   // before enemies: a cast happens in the same frame as its input
    call('enemies', dt, realDt);
    call('combat', dt, realDt);
    call('story', dt, realDt);
    call('cinematic', dt, realDt);   // gameplay-mode cinematics override the camera here
  } else if (st === 'dialogue' || st === 'cutscene') {
    // Gameplay frozen; ambient world keeps moving. Story drives dialogue camera; cinematic drives cutscenes.
    dt = Math.min(realDt, 1 / 20);
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
  call('world', ambientDt, realDt);
  call('vfx', ambientDt, realDt);
  call('ui', realDt, realDt);
  call('audio', realDt, realDt);
  if (render) {
    if (shadowsOn && shadowEvery > 0 && (++shadowFrame % shadowEvery) === 0) renderer.shadowMap.needsUpdate = true;
    composer.render(realDt);
  }
  game.input.endFrame();
}
function loop(now) {
  requestAnimationFrame(loop);
  let realDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (game.frozen) return;
  fpsWin.push(realDt); if (fpsWin.length > 60) fpsWin.shift();
  game.fps = fpsWin.length / fpsWin.reduce((a, b) => a + b, 0);
  governor(realDt);
  frame(realDt);
}
// ---------- dynamic quality governor (DESIGN §12) ----------
// frame-time EMA above 18 ms for 2 s → game.perfScale 0.7 (vfx particle counts and the global VFX draw budget
// scale by it; distant procedural animation runs at half rate); restored after 4 s under 14 ms. Runtime only:
// never written into the persisted settings.
game.perfScale = 1;
var ftEma = 1 / 60, slowT = 0, fastT = 0;   // var: the rAF loop may start before this line runs
function governor(realDt) {
  if (!(ftEma > 0)) { ftEma = 1 / 60; slowT = 0; fastT = 0; }
  if (game.perfScale == null) game.perfScale = 1;
  ftEma += (realDt - ftEma) * 0.08;
  if (game.perfScale >= 1) {
    slowT = ftEma > 0.018 ? slowT + realDt : 0;
    if (slowT >= 2) { game.perfScale = 0.7; slowT = 0; fastT = 0; game.events?.emit?.('perfScale', { scale: 0.7 }); }
  } else {
    fastT = ftEma < 0.014 ? fastT + realDt : 0;
    if (fastT >= 4) { game.perfScale = 1; fastT = 0; slowT = 0; game.events?.emit?.('perfScale', { scale: 1 }); }
  }
}
// ---------- test hooks ----------
// game.freeze(true) stops the rAF loop; game.step(n, dt) advances n frames deterministically without
// rendering (last frame rendered when render=true). Used by tools/shot.js and tools/playtest.js.
game.freeze = (on = true) => { game.frozen = on; if (!on) last = performance.now(); };
game.step = (n = 1, dt = 1 / 60, render = false) => {
  for (let i = 0; i < n; i++) frame(dt, render && i === n - 1);
};
game.renderNow = () => composer.render(0);

boot();
