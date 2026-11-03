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
const sanitizePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
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
  _hitstop: 0, _slowScale: 1, _slowTime: 0,
  _hitstopFrames: 0,
  hitstop(s) {
    this._hitstop = Math.max(this._hitstop, Math.min(s, 0.25));
    // minimum frozen frame count so the freeze still reads on low-FPS machines
    if (s > 0) this._hitstopFrames = Math.max(this._hitstopFrames, s >= 0.1 ? 4 : 3);
  },
  slowmo(scale, s) { this._slowScale = scale; this._slowTime = Math.max(this._slowTime, s); },
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
  newGame({ skipIntro = false } = {}) {
    this.audio?.resume?.();
    this.progression.reset();
    const begin = () => {
      this.player?.placeInVillage?.();
      if (!isTest) this.input.requestLock();
      this.setState('playing');
      this.story?.begin?.();
    };
    if (skipIntro || !this.cinematic?.playIntro) begin();
    else { this.setState('cutscene'); this.cinematic.playIntro(begin); }
  },
  /** The skill provider for the current class: game.sword for swordsmen, game.spells otherwise. */
  activeSkills() { return this.progression?.cls === 'sword' ? this.sword : this.spells; },
};
window.game = game;
game.settings = createSettings(game);
game.progression = createProgression(game);

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
const ORDER = ['world', 'vfx', 'combat', 'audio', 'player', 'spells', 'sword', 'enemies', 'story', 'cinematic', 'ui'];
const FILES = {
  world: ['./world.js', 'createWorld'], vfx: ['./vfx.js', 'createVFX'], combat: ['./combat.js', 'createCombat'],
  audio: ['./audio.js', 'createAudio'], player: ['./player.js', 'createPlayer'], spells: ['./spells.js', 'createSpells'],
  sword: ['./sword.js', 'createSword'], enemies: ['./enemies.js', 'createEnemies'], story: ['./story.js', 'createStory'],
  cinematic: ['./cinematic.js', 'createCinematic'], ui: ['./ui.js', 'createUI'],
};
game.stubbed = [];

async function boot() {
  const loaded = {};
  await Promise.all(ORDER.map(async (name) => {
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
    // ?test=1[&cls=mage|sword][&path=all|master][&el=fire][&quest=<stageId>][&intro=1]
    // Default: skip intro, mage, all elements, story jumped to the free-roam combat stage.
    if (params.has('intro')) game.newGame();
    else {
      game.newGame({ skipIntro: true });
      if (params.get('cls') !== 'none') {
        game.progression.choose(params.get('cls') || 'mage', params.get('path') || 'all', params.get('el') || 'fire');
        game.story?.debugSkip?.(params.get('quest') || 'camps');
      }
    }
  } else if (skip) game.events.emit('skipTitle', {});

  game.ready = true;
  requestAnimationFrame(loop);
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
  game.input.update();
  game.realTime += realDt;

  let dt = 0;
  const st = game.state;
  if (st === 'playing') {
    let scale = 1;
    if (game._slowTime > 0) { game._slowTime -= realDt; scale = game._slowScale; if (game._slowTime <= 0) game._slowScale = 1; }
    if (game._hitstop > 0 || game._hitstopFrames > 0) { game._hitstop -= realDt; if (game._hitstopFrames > 0) game._hitstopFrames--; scale *= 0.03; }
    if (game.cinematic?.active) scale *= game.cinematic.timeScale ?? 1;
    dt = Math.min(realDt, 1 / 20) * scale;
    game.time += dt;
    call('player', dt, realDt);
    call('spells', dt, realDt);
    call('sword', dt, realDt);
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
  frame(realDt);
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
