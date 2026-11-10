// VFX module (v4, owner: vfx; PLAN v4 §3, §5.4, §7.4.3). Pooled particles (one premultiplied call per owner group), the
// shared kit (game.vfx.kit: linework, effect meshes, ribbons, bolts, sparks, decals, motifs), player-FX ducking
// (game.vfx.shared / applyPlayerFx / fxMulAt / fxFactor), coverage + draw-call budgets, enemy style (owner:'enemy'),
// hit feel (only combat.dealDamage calls hitFeel), element / reaction presets, the fixed legacy telegraph, dissolve, rune
// circles, smears, camera juice. No new lights: pooled point lights exist only when game.render.pointLights is true.
// Legacy entry points (shockwave / ring / dome / decal / trail / beam) are routed into the kit (no per-effect meshes).
import * as THREE from 'three';
import { createTextures, FRAMES } from './vfx/textures.js';
import { ParticleSystem, F_GROUND, F_FLICKER, F_SWAY, K_ADD, K_SOFT, K_STYLED } from './vfx/particles.js';
import { Debris } from './vfx/debris.js';
import { installPresets } from './vfx/presets.js';
import { createFeel } from './vfx/feel.js';
import { createTelegraphs } from './vfx/telegraph.js';
import { createDissolve } from './vfx/dissolve.js';
import { createRunes } from './vfx/runes.js';
import { createDuck } from './vfx/duck.js';
import { createKit, BIT } from './vfx/kit.js';
import { createCastTable, createBudget, createProjector } from './vfx/coverage.js';
import { elementOfColor, isReservedHue } from './vfx/enemystyle.js';

const NORMAL_SHAPES = { smoke: 1, puff: 1, leaf: 1, rock: 1, petal: 1, feather: 1, raven: 1, dust: 1 };
const SOFT_SHAPES = { soft: 1, glow: 1, smoke: 1, puff: 1, flare: 1, dust: 1 };
const _c0 = new THREE.Color(), _c1 = new THREE.Color();
const _dir = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _sp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _e = new THREE.Euler(), _camPos = new THREE.Vector3(), _fw = new THREE.Vector3();

export function createVFX(game) {
  const textures = createTextures();
  const screenH = { value: 360 }, uTime = { value: 0 };
  const duck = createDuck(game);
  const cast = createCastTable();
  const budget = createBudget(game);
  const P = new ParticleSystem(game, textures.atlas, { capacity: 2000, renderOrder: 11, owner: 'player', duck: (p) => duck.fxMulAt(p, 'particle'), castTable: cast });
  const O = new ParticleSystem(game, textures.atlas, { capacity: 400, renderOrder: 11, owner: 'other', castTable: null });
  const debrisFx = new Debris(game);
  const proj = { cx: 0, cy: 0, cz: 0, fx: 0, fy: 0, fz: 1, p00: 1, p11: 1 };

  // ---------- colours (no pure white for player effects: white → the nearest element's hi glint) ----------
  const nearWhite = (hex) => ((hex >> 16) & 255) > 238 && ((hex >> 8) & 255) > 238 && (hex & 255) > 238;
  function setColors(color, el) {
    let a, b;
    if (Array.isArray(color)) { a = color[0] ?? 0xcfc8ba; b = color[1] ?? a; } else { a = color ?? 0xcfc8ba; b = a; }
    if (nearWhite(a) || nearWhite(b)) {
      const e = el || elementOfColor(nearWhite(a) ? (nearWhite(b) ? null : b) : a);
      const R = kit.ramp(e || 'physical');
      if (nearWhite(a)) a = R.hi.getHex();
      if (nearWhite(b)) b = R.light.getHex();
    }
    _c0.setHex(a); _c1.setHex(b);
  }
  function basis(d) {
    if (Math.abs(d.y) < 0.99) _t1.crossVectors(d, _up).normalize(); else _t1.set(1, 0, 0);
    _t2.crossVectors(d, _t1);
  }

  // settings.particleScale (0..1.5) scales every burst count / emitter rate (stochastic rounding keeps tiny bursts alive);
  // past 85 % of the live cap new bursts are thinned.
  let pScale = 1;
  const readScale = () => { const v = game.settings?.values?.particleScale; pScale = Number.isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 1; };
  readScale();
  function scaledCount(n, sys) {
    const lim = Math.max(1, Math.min(sys.limit, sys.cap));
    const fill = sys.count / lim;
    const thin = fill > 0.85 ? Math.max(0.15, 1 - (fill - 0.85) / 0.15) : 1;
    const sc = pScale * thin;
    if (sc === 1) return n;
    const x = n * sc, f = Math.floor(x);
    return f + (Math.random() < x - f ? 1 : 0);
  }

  const enemyCol = [0, 0];
  function burst(pos, o = {}, preScaled = false) {
    if (!pos) return;
    const ownerOpt = o.owner;
    const other = ownerOpt === 'enemy' || ownerOpt === 'world';
    const enemy = ownerOpt === 'enemy';
    const sys = other ? O : P;
    let shape = o.shape || 'soft';
    if (enemy && (shape === 'rune' || shape === 'star')) shape = 'spark';
    const soft = !!SOFT_SHAPES[shape];
    if (!other) {
      if (soft && budget.st.stopSoft && !preScaled) return;
      if (duck.fxMulAt(pos, 'particle') < 0.05) return;
    }
    let additive = o.additive ?? !NORMAL_SHAPES[shape];
    if (enemy) additive = false;
    let frame = o.frame ?? FRAMES[shape] ?? 0;
    const stretch = o.velocityStretch === true ? 0.06 : (o.velocityStretch || 0);
    if (stretch > 0 && shape === 'spark') frame = FRAMES.streak;
    const raw = Math.round(o.count ?? 12);
    const count = Math.min(600, Math.max(0, preScaled ? raw : scaledCount(raw, sys)));
    if (count === 0) return;
    const speed = o.speed ?? 3, speedVar = o.speedVar ?? speed * 0.5;
    const spread = o.spread ?? 1;
    let size = o.size ?? 0.3, sizeEnd = o.sizeEnd ?? size;
    const life = o.life ?? 0.6, lifeVar = o.lifeVar ?? life * 0.3;
    const grav = o.gravity ?? 0, drag = o.drag ?? 0;
    let a0 = o.alpha ?? 1;
    const rotSpeed = o.rotSpeed ?? (shape === 'leaf' || shape === 'shard' || shape === 'snow' ? 4 : shape === 'smoke' || shape === 'puff' ? 0.6 : 0);
    const fadeIn = o.fadeIn ?? (shape === 'smoke' || shape === 'puff' ? 0.15 : 0);
    const curl = o.curl ?? 0, radius = o.radius ?? 0;
    const disc = !!o.disc, sizeVar = o.sizeVar ?? 0.3, inward = !!o.inward;
    let flags = 0;
    if (o.ground) flags |= F_GROUND;
    if (o.flicker ?? shape === 'ember') flags |= F_FLICKER;
    if (o.sway ?? (shape === 'leaf' || shape === 'snow')) flags |= F_SWAY;
    let kind = (additive ? K_ADD : 0) | (soft ? K_SOFT : 0);
    if (enemy || o.styled) {
      const R = kit.ramp(o.el || elementOfColor(Array.isArray(o.color) ? o.color[0] : o.color));
      enemyCol[0] = R.mid.getHex(); enemyCol[1] = R.dark.getHex(); setColors(enemyCol);
      kind |= K_STYLED;
      if (soft) { const lim = 1.5 / (1 + (o.sizeVar ?? 0.3)); size = Math.min(size, lim); sizeEnd = Math.min(sizeEnd, lim); a0 = Math.min(a0, 0.6); }
      a0 = Math.min(a0, 0.9);
    } else setColors(o.color, o.el);
    if (soft && !other) a0 = Math.min(a0, shape === 'flare' ? 0.8 : 0.6);
    const castId = o.castId || 0;
    const hasDir = !!o.dir;
    if (hasDir) { _dir.copy(o.dir); if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0); _dir.normalize(); basis(_dir); }
    const cosMax = Math.cos(Math.min(1, spread) * Math.PI);
    const tang = o.tangential ?? 0, upV = o.up ?? 0;
    let made = 0;
    for (let i = 0; i < count; i++) {
      let dx, dy, dz;
      if (disc) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = 0; dz = Math.sin(a); }
      else {
        const ct = cosMax + (1 - cosMax) * Math.random();
        const st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = Math.random() * Math.PI * 2;
        const lx = Math.cos(ph) * st, ly = Math.sin(ph) * st;
        if (hasDir) { dx = _dir.x * ct + _t1.x * lx + _t2.x * ly; dy = _dir.y * ct + _t1.y * lx + _t2.y * ly; dz = _dir.z * ct + _t1.z * lx + _t2.z * ly; }
        else { dx = lx; dy = ct; dz = ly; }
      }
      const sp = Math.max(0, speed + (Math.random() * 2 - 1) * speedVar);
      let x = pos.x, y = pos.y, z = pos.z;
      if (radius > 0) { const r = radius * (disc ? 1 : Math.cbrt(Math.random())); x += dx * r; y += dy * r; z += dz * r; }
      let vx = dx * sp, vy = dy * sp + upV, vz = dz * sp;
      if (inward) { vx = -vx; vy = -dy * sp + upV; vz = -vz; }
      if (tang) { vx += -dz * tang; vz += dx * tang; }
      const s = 1 + (Math.random() * 2 - 1) * sizeVar;
      const k = sys.spawn(x, y, z, vx, vy, vz, Math.max(0.02, life + (Math.random() * 2 - 1) * lifeVar), size * s, sizeEnd * s,
        _c0, _c1, a0, frame, grav, drag, stretch, Math.random() * 6.283, rotSpeed * (Math.random() * 2 - 1), fadeIn,
        curl, pos.x, pos.z, flags, kind, castId);
      if (k < 0) break;
      made++;
    }
    if (castId && made) { cast.particles(castId, made); cast.touch(castId, BIT.sp); }
  }

  // ---------- emitters (routed through the budget: scaled, thinned, ducked) ----------
  const emitters = [];
  function emitter(opts = {}) {
    const e = {
      opts: { ...opts, count: 1 }, rate: opts.rate ?? 30, acc: 0, t: 0,
      duration: opts.duration ?? Infinity, follow: opts.follow || null,
      offset: opts.offset ? opts.offset.clone() : new THREE.Vector3(),
      pos: opts.position ? opts.position.clone() : new THREE.Vector3(), alive: true,
    };
    const handle = { stop() { e.alive = false; handle.alive = false; }, setPosition(v) { e.pos.copy(v); }, setRate(r) { e.rate = r; }, setColor(c) { e.opts.color = c; }, alive: true };
    e.handle = handle;
    emitters.push(e);
    return handle;
  }
  function updateEmitters(dt) {
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      if (e.alive) { e.t += dt; if (e.t >= e.duration) e.alive = false; if (e.follow && !e.follow.parent) e.alive = false; }
      if (!e.alive) { e.handle.alive = false; emitters.splice(i, 1); continue; }
      if (e.follow) { e.follow.getWorldPosition(e.pos); e.pos.add(e.offset); }
      e.acc += e.rate * dt;
      const n = Math.floor(e.acc);
      if (n > 0) { e.acc -= n; e.opts.count = n; burst(e.pos, e.opts, false); }
    }
  }

  // ---------- lights (only when the renderer has point lights: high preset) ----------
  const lights = [];
  const lightsAllowed = game.render?.pointLights === true;
  if (lightsAllowed) {
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xfff4e0, 0, 10, 2); l.castShadow = false; game.scene.add(l);
      lights.push({ light: l, t: 1, dur: 1, i0: 0, born: 0 });
    }
  }
  let lightSerial = 0;
  // Emissive flash sprite (no light). R4 / §3.8: ≤ 1.5 m, ramp-tinted, never white.
  const flareOpts = { count: 1, shape: 'flare', color: 0, size: 1, sizeEnd: 1, life: 0.1, lifeVar: 0, speed: 0, alpha: 0.8, fadeIn: 0, owner: 'player', castId: 0, el: null };
  function flashSprite(pos, color, size = 1.2, duration = 0.1, alpha = 0.8, opts = null) {
    if (!pos) return;
    const flareMul = game.quality?.budget?.flareMul ?? 1;
    flareOpts.color = color ?? 0xffe08a; flareOpts.size = Math.min(1.5, size) * flareMul; flareOpts.sizeEnd = Math.min(1.5, size * 1.15) * flareMul;
    flareOpts.life = Math.max(0.04, Math.min(0.15, duration)); flareOpts.alpha = Math.min(0.8, alpha);
    flareOpts.owner = opts?.owner || 'player'; flareOpts.castId = opts?.castId || 0; flareOpts.el = opts?.el || null;
    burst(pos, flareOpts, true);
  }
  const lightsOn = () => lightsAllowed && game.settings?.values?.effectQuality === 'high';
  function flash(pos, o = {}) {
    if (!pos) return null;
    flashSprite(pos, o.color, Math.min(1.5, 0.8 + (o.distance ?? 6) * 0.08), Math.min(0.12, (o.duration ?? 0.2) * 0.5), 0.55, o);
    if (!lightsOn()) return null;
    return lightPulse(pos, o);
  }
  function lightPulse(pos, o = {}) {
    if (!lights.length) return null;
    let s = null, oldest = lights[0];
    for (const x of lights) { if (x.t >= x.dur) { s = x; break; } if (x.born < oldest.born) oldest = x; }
    if (!s) s = oldest;
    s.born = ++lightSerial; s.light.position.copy(pos); s.light.color.setHex(o.color ?? 0xfff4e0);
    s.light.distance = o.distance ?? 10; s.i0 = Math.min(1.2, (o.intensity ?? 3) * 0.3); s.dur = o.duration ?? 0.25; s.t = 0; s.light.intensity = s.i0;
    return s;
  }
  function updateLights(dt) {
    for (const s of lights) {
      if (s.t >= s.dur) { s.light.intensity = 0; continue; }
      s.t += dt; const p = Math.min(1, s.t / s.dur);
      s.light.intensity = s.i0 * (p < 0.06 ? 0.6 + p / 0.06 * 0.4 : Math.pow(1 - (p - 0.06) / 0.94, 2));
    }
  }

  // ---------- screen flash: tinted, alpha ≤ 0.25, ≤ 0.15 s, off with flashReduce (R4) ----------
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;';
  (document.getElementById('ui')?.parentNode || document.body).appendChild(overlay);
  const sf = { t: 1, dur: 1, a: 0, count: 0, last: null };
  function screenFlash(color, a = 0.2, duration = 0.12) {
    if (game.assist?.flashReduce || game.settings?.values?.flashReduce) return;
    let c = color ?? 0xffe08a;
    if (nearWhite(c)) c = kit.ramp('light').light.getHex();
    overlay.style.background = '#' + (c >>> 0).toString(16).padStart(6, '0');
    sf.a = Math.min(0.25, Math.max(a, sf.t < sf.dur ? sf.a * (1 - sf.t / sf.dur) : 0)); sf.t = 0; sf.dur = Math.max(0.03, Math.min(0.15, duration));
    sf.count++; sf.last = { color: c, alpha: sf.a, dur: sf.dur };
  }

  // ---------- camera shake / fov ----------
  let trauma = 0;
  const shakeState = { appliedPos: new THREE.Vector3(), appliedQuat: new THREE.Quaternion(), lastPos: new THREE.Vector3(), lastQuat: new THREE.Quaternion(), active: false };
  const fovKicks = []; let fovApplied = 0, fovWritten = -1;
  const shakeScale = () => { const v = game.settings?.values?.screenShake; return Number.isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 0.6; };
  /** shake(t): trauma × settings.screenShake (default 0.6 = v4's ×0.6 of v3). */
  function shake(t = 0.3) { trauma = Math.min(1, trauma + Math.max(0, t) * shakeScale()); }
  const _kick = new THREE.Vector3();
  function kick(dir, amt = 0.05) { if (dir) { _kick.addScaledVector(dir, amt); if (_kick.length() > 0.12) _kick.setLength(0.12); } }
  function fovKick(deg = 3, duration = 0.25) {
    if (fovKicks.length > 4) fovKicks.shift();
    fovKicks.push({ deg: Math.min(4, deg), t: 0, dur: Math.max(0.05, duration) });
  }
  function vhash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
  function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return vhash(i) * (1 - u) + vhash(i + 1) * u; }
  function noise(t, s) { return vnoise(t + s * 17.3) * 0.57 + vnoise(t * 2.13 + s * 31.1) * 0.29 + vnoise(t * 4.41 + s * 7.7) * 0.14; }
  function applyCamera(realDt) {
    const cam = game.camera;
    if (shakeState.active && cam.position.equals(shakeState.lastPos) && cam.quaternion.equals(shakeState.lastQuat)) {
      cam.position.copy(shakeState.appliedPos); cam.quaternion.copy(shakeState.appliedQuat);
    }
    shakeState.active = false;
    trauma = Math.max(0, trauma - 1.6 * realDt);
    _kick.multiplyScalar(Math.exp(-16 * realDt));
    const kickOn = _kick.lengthSq() > 1e-6;
    if (trauma > 0.001 || kickOn) {
      const k = trauma * trauma, T = game.realTime * 18;
      shakeState.appliedPos.copy(cam.position); shakeState.appliedQuat.copy(cam.quaternion);
      _sp.set(noise(T, 1.1), noise(T, 7.3), noise(T, 13.7)).multiplyScalar(0.12 * k).applyQuaternion(cam.quaternion);
      cam.position.add(_sp);
      if (kickOn) cam.position.add(_kick);
      _e.set(noise(T, 21.1) * 0.035 * k, noise(T, 31.9) * 0.035 * k, noise(T, 41.3) * 0.0436 * k);
      _cq.setFromEuler(_e); cam.quaternion.multiply(_cq);
      cam.updateMatrixWorld();
      shakeState.lastPos.copy(cam.position); shakeState.lastQuat.copy(cam.quaternion); shakeState.active = true;
    }
    if (fovKicks.length || fovApplied) {
      const base = cam.fov === fovWritten ? cam.fov - fovApplied : cam.fov;
      let k = 0;
      for (let i = fovKicks.length - 1; i >= 0; i--) {
        const f = fovKicks[i]; f.t += realDt;
        const p = f.t / f.dur;
        if (p >= 1) { fovKicks.splice(i, 1); continue; }
        k += f.deg * (p < 0.15 ? p / 0.15 : Math.pow(1 - (p - 0.15) / 0.85, 2));
      }
      fovApplied = k; cam.fov = base + k; fovWritten = cam.fov; cam.updateProjectionMatrix();
    }
  }

  // ---------- entity flash: one cached flash material set per entity (WeakMap), or the entity's shared e.flashUniform ----------
  const flashSets = new WeakMap();      // object → {meshes:[{m, orig, flash}], mats:[flashRec]}
  const flashOf = new WeakMap();        // source material → its flash clone
  const flashing = [];
  let flashClones = 0;
  // flash sets are built when an entity registers (combat.register → prepareFlash), not mid-fight
  const flashQueue = [];
  function prepareFlash(entity) { if (entity && !entity.flashUniform && flashQueue.length < 256) flashQueue.push(entity); }
  function buildQueuedFlash() {
    for (let i = 0; i < flashQueue.length && i < 4; i++) { const e = flashQueue.shift(); const obj = e?.object; if (obj?.traverse && !flashSets.has(obj)) flashSetOf(obj); }
  }
  function flashSetOf(obj) {
    let set = flashSets.get(obj);
    if (set) return set;
    set = { meshes: [], mats: [] };
    obj.traverse((m) => {
      if (!m.isMesh || m.name === 'outline' || !m.material || m.isInstancedMesh) return;
      const own = (mat) => {
        if (!mat || !mat.emissive) return mat;
        let c = flashOf.get(mat);          // one flash clone per SOURCE material, shared by every entity that uses it
        if (!c) {
          c = mat.clone(); flashClones++;
          c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey;
          c.userData.flashRec = { mat: c, e: mat.emissive.getHex(), ei: mat.emissiveIntensity };
          flashOf.set(mat, c);
        }
        if (!set.mats.includes(c.userData.flashRec)) set.mats.push(c.userData.flashRec);
        return c;
      };
      const orig = m.material;
      set.meshes.push({ m, orig, flash: Array.isArray(orig) ? orig.map(own) : own(orig) });
    });
    flashSets.set(obj, set);
    return set;
  }
  // Repeated-hit governor (v4 fix, user point 6): a new pulse starts at most every FLASH_GAP s per entity and its strength falls
  // with the recent hit rate (heat, half-life ≈ 0.4 s) down to FLASH_MIN, so a sustained combo never holds a mob at solid white
  // and its windup pose stays readable. First hit: full pulse.
  const FLASH_GAP = 0.18, FLASH_MIN = 0.35, FLASH_DECAY = 1.7;
  const flashHeat = new WeakMap();      // fu | flash set → {t0, heat, at}
  let flashClock = 0;
  function flashGate(key) {
    let h = flashHeat.get(key);
    if (!h) { h = { t0: -1e9, heat: 0, at: 0 }; flashHeat.set(key, h); }
    h.heat = h.heat * Math.exp(-FLASH_DECAY * Math.max(0, flashClock - h.at)) + 1; h.at = flashClock;
    if (flashClock - h.t0 < FLASH_GAP) return 0;          // inside the dark gap: no new pulse
    h.t0 = flashClock;
    return Math.max(FLASH_MIN, Math.min(1, 1.6 / (h.heat + 0.6)));
  }
  function flashEntity(entity, color, duration = 0.1) {
    const obj = entity?.object || entity;
    if (!obj) return;
    const fu = entity?.flashUniform;
    if (fu && fu.value !== undefined) {   // mobmodels / bosses: one shared uniform (number or {color, amount})
      const amt = flashGate(fu); if (!amt) return;
      let f = flashing.find((x) => x.fu === fu);
      if (!f) { f = { fu, t: 0, dur: 0.1, amt: 1, color: new THREE.Color(), set: null }; flashing.push(f); }
      f.t = 0; f.amt = amt; f.dur = Math.min(0.1, Math.max(0.02, duration)); f.color.setHex(color ?? 0xffe0b0);
      return;
    }
    if (!obj.traverse) return;
    const set = flashSetOf(obj);
    const amt = flashGate(set); if (!amt) return;
    let f = flashing.find((x) => x.set === set);
    if (!f) {
      f = { fu: null, set, t: 0, dur: 0.1, amt: 1, color: new THREE.Color() }; flashing.push(f);
      for (const r of set.meshes) { if (r.m.material === r.orig) r.m.material = r.flash; }
    }
    f.t = 0; f.amt = amt; f.dur = Math.min(0.1, Math.max(0.02, duration)); f.color.setHex(color ?? 0xffe0b0);
  }
  const _fc = new THREE.Color();
  function updateFlashes(realDt) {
    flashClock += realDt;
    for (let i = flashing.length - 1; i >= 0; i--) {
      const f = flashing[i];
      f.t += realDt;
      const p = f.t / f.dur, k = (p >= 1 ? 0 : 1 - p * p) * f.amt;
      if (f.fu) {
        if (typeof f.fu.value === 'number') f.fu.value = k;
        else if (f.fu.value?.isColor) f.fu.value.copy(f.color).multiplyScalar(k);
        else if (f.fu.value && typeof f.fu.value === 'object') { f.fu.value.amount = k; f.fu.value.color?.copy?.(f.color); }
      } else {
        for (const r of f.set.mats) {
          _fc.setHex(r.e).lerp(f.color, k); r.mat.emissive.copy(_fc);
          r.mat.emissiveIntensity = r.ei + (Math.min(1.2, Math.max(r.ei, 1.0)) - r.ei) * k;
        }
        if (p >= 1) for (const r of f.set.meshes) { if (r.m.material === r.flash) r.m.material = r.orig; }
      }
      if (p >= 1) flashing.splice(i, 1);
    }
  }

  // ---------- afterimages (≤ 3 ghosts, ≤ 8 meshes each; no white) ----------
  const ghostMats = [];
  const GHOST_VERT = `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
  const GHOST_FRAG = `uniform vec3 uColor, uEdge; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
    void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = (0.12 + pow(f, 2.0) * 0.7) * uOpacity;
      gl_FragColor = vec4(mix(uColor, uEdge, pow(f, 4.0) * 0.6) * a, a); }`;
  const ghosts = [];
  function spawnAfterimage(object3D, color = 0x8fdcf5, life = 0.4) {
    if (!object3D?.traverse) return null;
    object3D.updateWorldMatrix(true, true);
    const mat = ghostMats.pop() || new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    if (!mat.userData.__awFx) duck.applyPlayerFx(mat, { role: 'fill' });
    const el = elementOfColor(color); const R = kit.ramp(el);
    mat.uniforms.uColor.value.copy(R.mid); mat.uniforms.uEdge.value.copy(R.light); mat.uniforms.uOpacity.value = 1;
    const group = new THREE.Group(); group.matrixAutoUpdate = false; group.name = 'vfx-ghost'; group.userData.owner = 'player';
    const cand = [];
    object3D.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.name === 'outline' || !m.visible || !m.geometry?.attributes?.normal) return;
      if (m.material?.blending === THREE.AdditiveBlending) return;
      cand.push(m);
    });
    cand.sort((a, b) => (b.geometry.attributes.position.count - a.geometry.attributes.position.count));
    for (const m of cand.slice(0, 8)) {
      const g = new THREE.Mesh(m.geometry, mat);
      g.matrixAutoUpdate = false; g.matrix.copy(m.matrixWorld); g.matrixWorld.copy(m.matrixWorld);
      g.frustumCulled = false; g.renderOrder = 9; g.name = 'vfx-ghost'; g.userData.owner = 'player';
      group.add(g);
    }
    game.scene.add(group);
    ghosts.push({ group, mat, t: 0, life: Math.max(0.05, life) });
    while (ghosts.length > 3) killGhost(0);
    return group;
  }
  function killGhost(i) { const g = ghosts[i]; game.scene.remove(g.group); ghostMats.push(g.mat); ghosts.splice(i, 1); }
  function updateGhosts(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]; g.t += dt;
      const p = g.t / g.life;
      if (p >= 1) { killGhost(i); continue; }
      g.mat.uniforms.uOpacity.value = (1 - p) * (1 - p);
    }
  }

  // ---------- glow materials (legacy API for spell objects: ramp-tinted, intensity ≤ 1.2, no white core) ----------
  const GLOW_FRAG = `uniform vec3 uColor, uCoreCol; uniform float uOpacity, uCore; varying vec3 vN; varying vec3 vV;
    void main(){ float ndv = abs(dot(normalize(vN), normalize(vV)));
      float a = (pow(ndv, 1.4) * 0.8 + 0.1) * uOpacity;
      vec3 col = mix(uColor, uCoreCol, pow(ndv, 3.0) * uCore);
      gl_FragColor = vec4(col * a, 1.0); }`;
  function glowMaterial(color = 0xffe08a, opts = {}) {
    if (opts.sprite) return new THREE.SpriteMaterial({ map: textures.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const el = elementOfColor(color);
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uCoreCol: { value: kit.ramp(el).light.clone() }, uOpacity: { value: opts.opacity ?? 1 }, uCore: { value: Math.min(0.6, opts.core ?? 0.5) } },
      vertexShader: GHOST_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.color = m.uniforms.uColor.value;
    Object.defineProperty(m, 'opacity', { get() { return m.uniforms ? m.uniforms.uOpacity.value : 1; }, set(v) { if (m.uniforms) m.uniforms.uOpacity.value = v; }, configurable: true });
    duck.applyPlayerFx(m, { additive: true, role: 'fill' });
    return m;
  }
  function glowSprite(color = 0xffe08a, size = 1) {
    const s = new THREE.Sprite(glowMaterial(color, { sprite: true }));
    s.scale.setScalar(Math.min(size, 2));
    return s;
  }

  // ---------- delayed jobs (gameplay time) ----------
  const jobs = [];
  function after(t, fn) { jobs.push({ t, fn }); }
  function updateJobs(dt) {
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i]; j.t -= dt;
      if (j.t <= 0) { jobs.splice(i, 1); try { j.fn(); } catch (err) { console.error('[vfx job]', err); } }
    }
  }

  // ---------- kit ----------
  const projector = createProjector(game);
  // (exposed to runes.js for its coverage estimate)
  let otherCover = 0;   // enemy-owned kit coverage of the frame (enemy / world linework, FM, ribbons, bolts)
  const kit = createKit(game, { shared: duck.shared, cast, screenH, time: uTime, proj: projector, emit: (pos, o) => burst(pos, o, false), onOtherCover: (c) => { otherCover += c; } });

  // ---------- legacy ground / trail / beam entry points → kit ----------
  const DEADH = { stop() {}, setEnds() {}, setPos() {}, setPosition() {}, alive: false, t: 1, dur: 1 };
  const ownerOf = (o) => (o && (o.owner === 'enemy' || o.owner === 'world') ? o.owner : 'player');
  function shockwave(pos, o = {}) {
    if (!pos) return null;
    if (o.delay > 0) { const p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z); const oo = { ...o, delay: 0 }; after(o.delay, () => shockwave(p, oo)); return DEADH; }
    const el = o.el || elementOfColor(Array.isArray(o.color) ? o.color[0] : o.color);
    const R = kit.ramp(el);
    const radius = Math.max(0.2, o.radius ?? 3);
    const plane = o.vertical ? 'billboard' : o.normal ? 'oriented' : o.flat ? 'flat' : 'ground';
    const width = Math.max(0.03, Math.min(0.12, (o.thickness ?? 0.18) * Math.min(radius, 4) * 0.12));
    return kit.line({ shape: 'ring', pos, plane, normal: o.normal, r: radius, width, color: ownerOf(o) === 'enemy' ? R.mid : R.light, color2: R.mid,
      alpha: Math.min(0.8, o.opacity ?? 0.8), life: Math.max(0.12, o.duration ?? 0.4), tIn: 0, tOut: (o.duration ?? 0.4) * 0.6, scaleIn: 'expand',
      owner: ownerOf(o), castId: o.castId });
  }
  // dome(): linework ring + a rim-only shell ≤ 2 m (never enclosing the camera)
  const shells = [];
  const shellGeo = new THREE.SphereGeometry(1, 24, 12);
  for (let i = 0; i < 3; i++) {
    const mat = kit.fxMaterial({ el: 'physical', rimOnly: true, private: true });
    const mesh = new THREE.Mesh(shellGeo, mat); mesh.visible = false; mesh.renderOrder = 9; mesh.name = 'vfx-shell'; mesh.userData.owner = 'player';
    game.scene.add(mesh);
    shells.push({ mesh, t: 0, dur: 1, r: 1, a: 0.35, active: false, born: 0 });
  }
  let shellSerial = 0;
  function dome(pos, o = {}) {
    if (!pos) return null;
    const el = o.el || elementOfColor(o.color);
    const R = kit.ramp(el);
    const r = Math.min(2, (o.radius ?? 2) * 0.6);
    const ring = kit.line({ shape: 'ring', pos, plane: 'ground', r: Math.min(4, o.radius ?? 2), width: 0.05, el, alpha: 0.7, life: o.duration ?? 0.45, tIn: 0, tOut: 0.3, scaleIn: 'expand', owner: ownerOf(o), castId: o.castId });
    _camPos.setFromMatrixPosition(game.camera.matrixWorld);
    if (_camPos.distanceTo(pos) < r + 1.5) return ring;
    let s = null, old = shells[0];
    for (const x of shells) { if (!x.active) { s = x; break; } if (x.born < old.born) old = x; }
    s = s || old; s.born = ++shellSerial;
    s.mesh.position.copy(pos); s.r = r; s.t = -(o.delay || 0); s.dur = Math.max(0.15, o.duration ?? 0.45); s.a = Math.min(0.35, o.opacity ?? 0.35);
    const u = s.mesh.material.uniforms; u.uLight.value.copy(R.light); u.uMid.value.copy(R.mid); u.uAlpha.value = 0;
    s.active = true; s.mesh.visible = s.t >= 0; s.mesh.scale.setScalar(0.01);
    return ring;
  }
  function updateShells(dt) {
    for (const s of shells) {
      if (!s.active) continue;
      s.t += dt; if (s.t < 0) continue;
      const p = s.t / s.dur;
      if (p >= 1) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.visible = true;
      s.mesh.scale.setScalar(Math.max(0.01, s.r * (0.2 + 0.8 * (1 - Math.pow(1 - p, 3)))));
      s.mesh.material.uniforms.uAlpha.value = s.a * Math.pow(1 - p, 1.4);
    }
  }
  const LEGACY_DECAL = { scorch: 'scorch', frost: 'frost', crack: 'crack', rune: 'rune', soft: 'ripple', lichtenberg: 'lichtenberg', ripple: 'ripple', flowers: 'flower', flower: 'flower', violet: 'violet', strata: 'strata' };
  function decal(pos, o = {}) {
    if (!pos) return null;
    const gh = game.world?.getHeight;
    if (gh && pos.y - gh(pos.x, pos.z) > 3) return null;
    const kind = LEGACY_DECAL[o.type] || (o.type ? null : 'scorch');
    if (!kind) return null;
    const el = o.el || (o.color != null ? elementOfColor(o.color) : undefined);
    return kit.decal(kind, pos, Math.min(5, o.radius ?? 1.5), Math.min(10, o.duration ?? 6), { el, alpha: Math.min(0.35, (o.opacity ?? 0.3)), castId: o.castId, owner: ownerOf(o) });
  }
  function trail(obj, o = {}) {
    if (!obj) return DEADH;
    const el = o.el || elementOfColor(o.color);
    return kit.ribbon({ follow: obj, width: Math.min(0.6, o.width ?? 0.35), maxLen: o.length ?? 4, life: o.fade ?? 0.3, el, alpha: Math.min(0.85, o.opacity ?? 0.85), owner: ownerOf(o), castId: o.castId });
  }
  function beam(from, to, o = {}) {
    if (!from || !to) return DEADH;
    const el = o.el || elementOfColor(o.color ?? 0xb49bff);
    const w = o.width ?? 0.35, dur = o.duration ?? 0.25, jag = o.jagged ?? 1;
    return kit.bolt({ from, to, forks: Math.min(3, o.branches ?? (jag > 0 ? 2 : 0)), width: Math.min(0.12, Math.max(0.05, w * 0.25)), halo: Math.min(0.6, Math.max(0.15, w * 0.7)),
      life: Math.max(0.05, dur * 0.75), afterglow: Math.min(0.25, dur * 0.3), jagged: jag, el, followFrom: o.follow?.from, followTo: o.follow?.to, owner: ownerOf(o), castId: o.castId, seed: o.castId });
  }

  // ---------- coverage, budgets, call cap ----------
  const covState = { parts: { soft: 0, particles: 0, linework: 0, kit: 0, runes: 0 }, player: 0, enemy: 0, world: 0, calls: 0, otherCalls: 0, frame: 0, peak: 0, callsPeak: 0, collapsedTotal: 0 };
  function collapseOldest(over) {
    // R10 / §2.6: over the player-FX call budget the oldest persistent visuals collapse to linework only
    let n = 0;
    while (over > 0 && ghosts.length) { over -= ghosts[0].group.children.length; killGhost(0); n++; }
    for (const s of shells) { if (over <= 0) break; if (s.active) { s.active = false; s.mesh.visible = false; over--; n++; } }
    if (over > 0) n += runes.collapse(over, (pos, r, el) => kit.line({ shape: 'ring', pos, plane: 'ground', r, width: 0.035, el, life: 0.8, tOut: 0.4, alpha: 0.6 }));
    covState.collapsedTotal += n;
    return n;
  }
  function frameBudget() {
    const v = game.settings?.values || {}, b = game.quality?.budget || {};
    const pm = Number.isFinite(b.particleMul) ? b.particleMul : 1;
    // settings.particleCap (the preset value) × particleMul; quality.budget.particleCap only as the L5 emergency limit
    let cap = Number.isFinite(v.particleCap) ? v.particleCap : (Number.isFinite(b.particleCap) ? b.particleCap : 1000);
    if ((b.level ?? 0) >= 5 && Number.isFinite(b.particleCap)) cap = Math.min(cap, b.particleCap);
    cap *= pm;
    const addCap = (Number.isFinite(v.additiveCap) ? v.additiveCap : 300) * pm;
    O.limit = Math.min(O.cap, Math.round(cap * 0.3)); O.addLimit = O.limit;
    P.limit = Math.max(0, Math.round(cap) - O.count); P.addLimit = Math.round(addCap);
  }

  const api = {
    textures, FRAMES,
    burst, emitter, flash, flashSprite, prepareFlash, lightPulse, screenFlash, shake, kick, fovKick, flashEntity, spawnAfterimage, glowMaterial, glowSprite, after,
    trail, shockwave, ring: shockwave, dome, decal, beam,
    debris: (pos, o) => (pos ? debrisFx.debris(pos, pScale < 1 && o?.count > 1 ? { ...o, count: Math.max(1, Math.round(o.count * pScale)) } : o) : null),
    hitstop: (s, o) => game.hitstop?.(s, o),
    kit, shared: duck.shared, applyPlayerFx: duck.applyPlayerFx, fxMulAt: duck.fxMulAt, fxFactor: duck.fxFactor,
    get trauma() { return trauma; },
    get particleScale() { return pScale; },
    get particleCount() { return P.count + O.count; },
    stats() {
      const ks = kit.stats();
      let domes = 0; for (const s of shells) if (s.active) domes++;
      return { additive: P.addCount + O.addCount, alpha: P.count + O.count - P.addCount - O.addCount, particles: P.count + O.count, playerParticles: P.count, otherParticles: O.count,
        emitters: emitters.length, beams: ks.bolts, trails: ks.ribbons, debris: debrisFx.count(), ghosts: ghosts.length,
        rings: ks.linework, domes, decals: 0, linework: ks.linework, fm: ks.fm,
        telegraphs: tele?.active?.() || 0, runes: runes?.active?.() || 0, dissolves: dis?.active?.() || 0,
        coverage: +covState.player.toFixed(3), calls: covState.calls, limits: { total: P.limit, additive: P.addLimit, other: O.limit }, dropped: P.dropped + O.dropped };
    },
    clear() { P.clear(); O.clear(); emitters.length = 0; jobs.length = 0; trauma = 0; kit.clear(); },
    init() {
      game.events?.on?.('settingsChanged', ({ key } = {}) => { if (key === 'particleScale' || key === '*') readScale(); duck.recomputeMul(); });
      game.events?.on?.('stateChange', ({ state } = {}) => { if (state === 'title') trauma = 0; });
    },
    update(dt, realDt) {
      const rd = realDt ?? dt;
      if (game.frame && game.frame.lastStep === false) return;   // visual work once per frame (§2.5)
      const fdt = game.frame?.frameDt ?? dt;
      const cam = game.camera;
      const gl = game.renderer?.getContext?.();
      screenH.value = gl?.drawingBufferHeight || (game.renderer?.domElement?.height ?? 360);
      uTime.value += rd;
      duck.update();
      frameBudget();
      const tr = feel.takeTrauma(); if (tr > 0) shake(tr);
      api._presetFrame?.();
      updateJobs(fdt);
      updateEmitters(fdt);
      cam.getWorldPosition(_camPos); cam.getWorldDirection(_fw);
      proj.cx = _camPos.x; proj.cy = _camPos.y; proj.cz = _camPos.z; proj.fx = _fw.x; proj.fy = _fw.y; proj.fz = _fw.z;
      proj.p00 = cam.projectionMatrix.elements[0]; proj.p11 = cam.projectionMatrix.elements[5];
      const gh = game.world?.getHeight;
      P.update(fdt, gh, game.time, proj);
      O.update(fdt, gh, game.time, proj);
      projector.begin();
      otherCover = 0;
      const k = kit.update(fdt);
      debrisFx.update(fdt);
      updateShells(fdt);
      updateLights(fdt);
      updateGhosts(fdt);
      updateFlashes(rd);
      if (flashQueue.length) buildQueuedFlash();
      if (sf.t < sf.dur) { sf.t += rd; const p = Math.min(1, sf.t / sf.dur); overlay.style.opacity = String(sf.a * (1 - p) * (1 - p)); }
      else if (overlay.style.opacity !== '0') overlay.style.opacity = '0';
      feel.update(rd);
      tele.update(fdt, rd);
      dis.update(fdt);
      runes.update(fdt, rd);
      applyCamera(rd);
      // budgets: coverage (largest contributor shrinks first) and draw calls (oldest persistent visuals collapse)
      // player FX built outside the kit (spell / sword objects through applyPlayerFx) get what the kit leaves of the budget
      // (its own share of the soft budget: the kit estimate is conservative and must not starve the spell fills)
      const fc = duck.foreignUpdate(budget.st.soft * 0.35, rd);
      const st = budget.control({ soft: P.softCoverage, particles: P.coverage - P.softCoverage, rest: k.cover + runes.coverage() + fc }, rd);
      P.material.uniforms.uSoftMul.value = st.softMul; P.material.uniforms.uSizeMul.value = st.sizeMul;
      covState.parts.foreign = fc; covState.parts.foreignShrink = duck.foreignShrink; covState.parts.foreignRaw = duck.foreignRaw;
      covState.player = P.coverage + k.cover + runes.coverage() + fc; covState.enemy = O.coverage + otherCover; covState.frame++;
      covState.parts.soft = P.softCoverage; covState.parts.particles = P.coverage - P.softCoverage; covState.parts.linework = k.lwCover; covState.parts.kit = k.cover; covState.parts.runes = runes.coverage();
      if (covState.player > covState.peak) covState.peak = covState.player;
      let calls = (P.count > 0 ? 1 : 0) + k.calls + runes.calls() + debrisFx.calls();
      for (const s of shells) if (s.active && s.mesh.visible) calls++;
      for (const g of ghosts) calls += g.group.children.length;
      if (calls > budget.st.callCap) collapseOldest(calls - budget.st.callCap);
      covState.calls = calls; if (calls > covState.callsPeak) covState.callsPeak = calls;
      covState.otherCalls = (O.count > 0 ? 1 : 0) + (k.otherCalls || 0);
      cast.frameEnd();
      if (hiddenOwners.player || hiddenOwners.enemy) {
        for (const o of game.scene.children) { const ow = o.userData?.owner; if ((ow === 'player' && hiddenOwners.player) || (ow === 'enemy' && hiddenOwners.enemy)) o.visible = false; }
      }
    },
  };
  const feel = createFeel(game, api);
  installPresets(api, game);
  const tele = createTelegraphs(game, api);
  const dis = createDissolve(game, api);
  api._proj = projector;
  const runes = createRunes(game, api, textures);
  api.hitFeel = feel.hitFeel;
  api.feelStats = feel.stats;
  api.resetFeelStats = feel.resetStats;
  api.telegraph = tele.telegraph;
  api.dissolve = dis.dissolve;
  api.undissolve = dis.undissolve;
  api.runeCircle = (pos, o = {}) => {
    if (!pos) return null;
    if (o.owner === 'enemy') { const R = kit.ramp(o.element || 'shadow'); return kit.line({ shape: 'ring', pos, plane: 'ground', r: Math.min(3, o.r ?? 2), width: 0.08, color: R.mid, color2: R.dark, life: o.dur ?? 1.2, owner: 'enemy' }); }
    return runes.runeCircle(pos, o);
  };
  api.smear = runes.smear;
  api.windLines = runes.windLines;
  api.groundDecal = (kind, pos, r = 1.5, life = 8, opts = null) => (pos ? decal(pos, { type: kind, radius: r, duration: life, ...(opts || {}) }) : null);

  // ---------- debug (PLAN §7.4.3) ----------
  api.debug = {
    /** runtime estimate (screens) by owner; tests measure the truth with PT.fragments({owner}). */
    coverage() { return { parts: { ...covState.parts }, screens: +covState.player.toFixed(3), byOwner: { player: +covState.player.toFixed(3), enemy: +covState.enemy.toFixed(3), world: 0 }, estimate: true, peak: +covState.peak.toFixed(3), calls: covState.calls, callsPeak: covState.callsPeak }; },
    byCast(id) { return cast.get(id); },
    calls() { return { player: covState.calls, other: covState.otherCalls, cap: budget.st.callCap, peak: covState.callsPeak, collapsed: covState.collapsedTotal }; },
    budget() { return { ...budget.st, limits: { total: P.limit, additive: P.addLimit, other: O.limit }, live: { player: P.count, additive: P.addCount, other: O.count }, peak: P.peak }; },
    resetPeaks() { covState.peak = 0; covState.callsPeak = 0; P.peak = 0; },
    overdraw(on) { return window.PT?.fragments ? window.PT.fragments({ owner: 'player' }) : { on: !!on, estimate: api.debug.coverage() }; },
    setVisible(owner, on) {
      const want = owner === 'enemy' ? 'enemy' : owner === 'world' ? 'world' : 'player';
      const list = [];
      game.scene.traverse((o) => { if (o.userData?.owner === want && (o.isMesh || o.isSprite || o.isPoints)) list.push(o); });
      for (const o of list) { if (!on) { o.userData.__vfxHidden = true; o.visible = false; } else if (o.userData.__vfxHidden) { delete o.userData.__vfxHidden; o.visible = true; } }
      hiddenOwners[want] = !on;
    },
    telegraphs() { return tele.debug(); },
    flashClones: () => flashClones,
    duck,
    screenFlash: () => ({ t: sf.t, dur: sf.dur, a: sf.a, count: sf.count, last: sf.last }),
    isReservedHue,
    cast,
  };
  const hiddenOwners = { player: false, enemy: false, world: false };
  api.debug.hidden = hiddenOwners;

  /** Visible stand-ins of every lazily-shown material (main.js warms them; renderer.compile skips hidden objects). */
  api.prewarm = () => {
    const g = new THREE.Group(); g.name = 'vfx-prewarm';
    g.add(new THREE.Sprite(glowMaterial(0xffe08a, { sprite: true })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 3), glowMaterial(0xffe08a)));
    g.add(new THREE.Mesh(P.geometry, P.material)); g.add(new THREE.Mesh(O.geometry, O.material));
    g.add(kit.prewarm());
    for (const s of shells) g.add(new THREE.Mesh(shellGeo, s.mesh.material));
    tele.warm(g);
    runes.warm(g);
    g.traverse((o) => { o.frustumCulled = false; });
    return g;
  };
  api.warmup = api.prewarm;
  return api;
}
