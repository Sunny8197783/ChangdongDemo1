import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Emitter } from './core/events.js';
import { Input } from './core/input.js';
import { stubs } from './core/stubs.js';

const params = new URLSearchParams(location.search);
const isTest = params.has('test');

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTest ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 10, 30);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.86);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

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
  hitstop(s) { this._hitstop = Math.max(this._hitstop, Math.min(s, 0.25)); },
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
};
window.game = game;

// ---------- modules ----------
const ORDER = ['world', 'vfx', 'combat', 'audio', 'player', 'spells', 'enemies', 'ui'];
const FILES = {
  world: ['./world.js', 'createWorld'], vfx: ['./vfx.js', 'createVFX'], combat: ['./combat.js', 'createCombat'],
  audio: ['./audio.js', 'createAudio'], player: ['./player.js', 'createPlayer'], spells: ['./spells.js', 'createSpells'],
  enemies: ['./enemies.js', 'createEnemies'], ui: ['./ui.js', 'createUI'],
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

  let skip = false;
  try { skip = sessionStorage.getItem('aw_skipTitle') === '1'; sessionStorage.removeItem('aw_skipTitle'); } catch (_) {}
  if (isTest) game.start();
  else if (skip) game.events.emit('skipTitle', {});

  game.ready = true;
  requestAnimationFrame(loop);
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
function loop(now) {
  requestAnimationFrame(loop);
  let realDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  fpsWin.push(realDt); if (fpsWin.length > 60) fpsWin.shift();
  game.fps = fpsWin.length / fpsWin.reduce((a, b) => a + b, 0);

  game.input.update();
  game.realTime += realDt;

  let dt = 0;
  if (game.state === 'playing') {
    let scale = 1;
    if (game._slowTime > 0) { game._slowTime -= realDt; scale = game._slowScale; if (game._slowTime <= 0) game._slowScale = 1; }
    if (game._hitstop > 0) { game._hitstop -= realDt; scale *= 0.03; }
    dt = Math.min(realDt, 1 / 20) * scale;
    game.time += dt;
    call('player', dt, realDt);
    call('spells', dt, realDt);
    call('enemies', dt, realDt);
    call('combat', dt, realDt);
  }
  call('world', dt, realDt);
  call('vfx', dt, realDt);
  call('ui', realDt, realDt);
  call('audio', realDt, realDt);
  composer.render(realDt);
  game.input.endFrame();
}

boot();
