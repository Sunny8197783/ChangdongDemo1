// VFX module: pooled particles, rings, decals, beams, trails, debris, lights, camera juice.
import * as THREE from 'three';
import { createTextures, FRAMES } from './vfx/textures.js';
import { ParticleSystem, F_GROUND, F_FLICKER, F_SWAY } from './vfx/particles.js';
import { GroundFX } from './vfx/ground.js';
import { Beams } from './vfx/beam.js';
import { Trails } from './vfx/trail.js';
import { Debris } from './vfx/debris.js';
import { installPresets } from './vfx/presets.js';

const NORMAL_SHAPES = { smoke: 1, puff: 1, leaf: 1, rock: 1 };
const _c0 = new THREE.Color(), _c1 = new THREE.Color();
const _dir = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _sp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _e = new THREE.Euler(), _camPos = new THREE.Vector3();

export function createVFX(game) {
  const textures = createTextures();
  const add = new ParticleSystem(game, textures.atlas, { capacity: 8000, additive: true, renderOrder: 12 });
  const alpha = new ParticleSystem(game, textures.atlas, { capacity: 3000, additive: false, renderOrder: 11 });
  const ground = new GroundFX(game, textures);
  const beams = new Beams(game);
  const trails = new Trails(game);
  const debrisFx = new Debris(game);

  // ---------- burst ----------
  function setColors(color) {
    if (Array.isArray(color)) { _c0.setHex(color[0]); _c1.setHex(color[1] ?? color[0]); }
    else { _c0.setHex(color ?? 0xffffff); _c1.copy(_c0); }
  }

  /** Builds an orthonormal basis around dir into _t1,_t2. */
  function basis(d) {
    if (Math.abs(d.y) < 0.99) _t1.crossVectors(d, _up).normalize(); else _t1.set(1, 0, 0);
    _t2.crossVectors(d, _t1);
  }

  function burst(pos, o = {}) {
    if (!pos) return;
    const shape = o.shape || 'soft';
    const additive = o.additive ?? !NORMAL_SHAPES[shape];
    const sys = additive ? add : alpha;
    let frame = o.frame ?? FRAMES[shape] ?? 0;
    let stretch = o.velocityStretch === true ? 0.06 : (o.velocityStretch || 0);
    if (stretch > 0 && shape === 'spark') frame = FRAMES.streak;
    const count = Math.min(1500, Math.max(0, Math.round(o.count ?? 12)));
    const speed = o.speed ?? 3, speedVar = o.speedVar ?? speed * 0.5;
    const spread = o.spread ?? 1;
    const size = o.size ?? 0.3, sizeEnd = o.sizeEnd ?? size;
    const life = o.life ?? 0.6, lifeVar = o.lifeVar ?? life * 0.3;
    const grav = o.gravity ?? 0, drag = o.drag ?? 0, a0 = o.alpha ?? 1;
    const rotSpeed = o.rotSpeed ?? (shape === 'leaf' || shape === 'shard' || shape === 'snow' ? 4 : shape === 'smoke' || shape === 'puff' ? 0.6 : 0);
    const fadeIn = o.fadeIn ?? (shape === 'smoke' || shape === 'puff' ? 0.15 : 0);
    const curl = o.curl ?? 0, radius = o.radius ?? 0;
    const disc = !!o.disc, sizeVar = o.sizeVar ?? 0.3;
    let flags = 0;
    if (o.ground) flags |= F_GROUND;
    if (o.flicker ?? shape === 'ember') flags |= F_FLICKER;
    if (o.sway ?? (shape === 'leaf' || shape === 'snow')) flags |= F_SWAY;
    setColors(o.color);
    const hasDir = !!o.dir;
    if (hasDir) { _dir.copy(o.dir); if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0); _dir.normalize(); basis(_dir); }
    const cosMax = Math.cos(Math.min(1, spread) * Math.PI);
    const tang = o.tangential ?? 0, upV = o.up ?? 0;
    for (let i = 0; i < count; i++) {
      let dx, dy, dz;
      if (disc) {
        const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = 0; dz = Math.sin(a);
      } else {
        // uniform direction within cone around dir (or sphere)
        const ct = cosMax + (1 - cosMax) * Math.random();
        const st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = Math.random() * Math.PI * 2;
        const lx = Math.cos(ph) * st, ly = Math.sin(ph) * st;
        if (hasDir) {
          dx = _dir.x * ct + _t1.x * lx + _t2.x * ly; dy = _dir.y * ct + _t1.y * lx + _t2.y * ly; dz = _dir.z * ct + _t1.z * lx + _t2.z * ly;
        } else { dx = lx; dy = ct; dz = ly; }
      }
      const sp = Math.max(0, speed + (Math.random() * 2 - 1) * speedVar);
      let x = pos.x, y = pos.y, z = pos.z;
      if (radius > 0) { const r = radius * (disc ? 1 : Math.cbrt(Math.random())); x += dx * r; y += dy * r; z += dz * r; }
      let vx = dx * sp, vy = dy * sp + upV, vz = dz * sp;
      if (tang) { vx += -dz * tang; vz += dx * tang; }
      const s = 1 + (Math.random() * 2 - 1) * sizeVar;
      sys.spawn(x, y, z, vx, vy, vz, Math.max(0.02, life + (Math.random() * 2 - 1) * lifeVar), size * s, sizeEnd * s,
        _c0, _c1, a0, frame, grav, drag, stretch, Math.random() * 6.283, rotSpeed * (Math.random() * 2 - 1), fadeIn,
        curl, pos.x, pos.z, flags);
    }
  }

  // ---------- emitters ----------
  const emitters = [];
  function emitter(opts = {}) {
    const e = {
      opts: { ...opts, count: 1 }, rate: opts.rate ?? 30, acc: 0, t: 0,
      duration: opts.duration ?? Infinity, follow: opts.follow || null,
      offset: opts.offset ? opts.offset.clone() : new THREE.Vector3(),
      pos: opts.position ? opts.position.clone() : new THREE.Vector3(), alive: true, paused: false,
    };
    const handle = {
      stop() { e.alive = false; handle.alive = false; },
      setPosition(v) { e.pos.copy(v); },
      setRate(r) { e.rate = r; },
      setColor(c) { e.opts.color = c; },
      alive: true,
    };
    e.handle = handle;
    emitters.push(e);
    return handle;
  }
  function updateEmitters(dt) {
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      if (e.alive) {
        e.t += dt;
        if (e.t >= e.duration) e.alive = false;
        if (e.follow && !e.follow.parent) e.alive = false;
      }
      if (!e.alive) { e.handle.alive = false; emitters.splice(i, 1); continue; }
      if (e.follow) { e.follow.getWorldPosition(e.pos); e.pos.add(e.offset); }
      e.acc += e.rate * dt;
      const n = Math.floor(e.acc);
      if (n > 0) { e.acc -= n; e.opts.count = n; burst(e.pos, e.opts); }
    }
  }

  // ---------- lights ----------
  const lights = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.castShadow = false;
    game.scene.add(l);
    lights.push({ light: l, t: 1, dur: 1, i0: 0, born: 0 });
  }
  let lightSerial = 0;
  function flash(pos, o = {}) {
    let s = null, oldest = lights[0];
    for (const x of lights) { if (x.t >= x.dur) { s = x; break; } if (x.born < oldest.born) oldest = x; }
    if (!s) s = oldest;
    s.born = ++lightSerial;
    s.light.position.copy(pos);
    s.light.color.setHex(o.color ?? 0xffffff);
    s.light.distance = o.distance ?? 10;
    s.i0 = (o.intensity ?? 3) * 4;
    s.dur = o.duration ?? 0.25; s.t = 0;
    s.light.intensity = s.i0;
    return s;
  }
  function updateLights(dt) {
    for (const s of lights) {
      if (s.t >= s.dur) { s.light.intensity = 0; continue; }
      s.t += dt;
      const p = Math.min(1, s.t / s.dur);
      const k = p < 0.06 ? 0.6 + p / 0.06 * 0.4 : Math.pow(1 - (p - 0.06) / 0.94, 2);
      s.light.intensity = s.i0 * k;
    }
  }

  // ---------- screen flash ----------
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;';
  (document.getElementById('ui')?.parentNode || document.body).appendChild(overlay);
  const sf = { t: 1, dur: 1, a: 0 };
  function screenFlash(color = 0xffffff, a = 0.35, duration = 0.25) {
    overlay.style.background = '#' + (color >>> 0).toString(16).padStart(6, '0');
    sf.a = Math.max(a, sf.t < sf.dur ? sf.a * (1 - sf.t / sf.dur) : 0); sf.t = 0; sf.dur = Math.max(0.03, duration);
  }

  // ---------- camera shake / fov ----------
  let trauma = 0;
  const shakeState = { appliedPos: new THREE.Vector3(), appliedQuat: new THREE.Quaternion(), lastPos: new THREE.Vector3(), lastQuat: new THREE.Quaternion(), active: false };
  let fovKicks = [], fovApplied = 0, fovWritten = -1;
  function shake(t = 0.3) { trauma = Math.min(1, trauma + Math.max(0, t)); }
  // small directional camera nudge (world space) for light hits — reads as impact without trauma
  const _kick = new THREE.Vector3();
  function kick(dir, amt = 0.05) { if (dir) { _kick.addScaledVector(dir, amt); if (_kick.length() > 0.15) _kick.setLength(0.15); } }
  function fovKick(deg = 5, duration = 0.3) {
    if (fovKicks.length > 6) fovKicks.shift();
    fovKicks.push({ deg, t: 0, dur: Math.max(0.05, duration) });
  }
  function noise(t, s) { return Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 4.77 + s * 3.1) * 0.2; }
  function applyCamera(realDt) {
    const cam = game.camera;
    // undo last frame's shake if nobody reset the camera since
    if (shakeState.active && cam.position.equals(shakeState.lastPos) && cam.quaternion.equals(shakeState.lastQuat)) {
      cam.position.copy(shakeState.appliedPos); cam.quaternion.copy(shakeState.appliedQuat);
    }
    shakeState.active = false;
    trauma = Math.max(0, trauma - 1.5 * realDt);
    _kick.multiplyScalar(Math.exp(-16 * realDt));
    const kickOn = _kick.lengthSq() > 1e-6;
    if (trauma > 0.001 || kickOn) {
      const k = Math.pow(trauma, 1.5), T = game.realTime * 22;
      shakeState.appliedPos.copy(cam.position); shakeState.appliedQuat.copy(cam.quaternion);
      _sp.set(noise(T, 1.1), noise(T, 7.3), noise(T, 13.7)).multiplyScalar(0.3 * k).applyQuaternion(cam.quaternion);
      cam.position.add(_sp);
      if (kickOn) cam.position.add(_kick);
      _e.set(noise(T, 21.1) * 0.025 * k, noise(T, 31.9) * 0.025 * k, noise(T, 41.3) * 0.045 * k);
      _cq.setFromEuler(_e); cam.quaternion.multiply(_cq);
      cam.updateMatrixWorld();
      shakeState.lastPos.copy(cam.position); shakeState.lastQuat.copy(cam.quaternion); shakeState.active = true;
    }
    // FOV kick
    if (fovKicks.length || fovApplied) {
      const base = cam.fov === fovWritten ? cam.fov - fovApplied : cam.fov;
      let k = 0;
      for (let i = fovKicks.length - 1; i >= 0; i--) {
        const f = fovKicks[i]; f.t += realDt;
        const p = f.t / f.dur;
        if (p >= 1) { fovKicks.splice(i, 1); continue; }
        k += f.deg * (p < 0.15 ? p / 0.15 : Math.pow(1 - (p - 0.15) / 0.85, 2));
      }
      fovApplied = k;
      cam.fov = base + k; fovWritten = cam.fov;
      cam.updateProjectionMatrix();
    }
  }

  // ---------- entity flash ----------
  const flashes = [];
  const _fc = new THREE.Color();
  function flashEntity(entity, color = 0xffffff, duration = 0.12) {
    const obj = entity?.object || entity;
    if (!obj?.traverse) return;
    let f = flashes.find((x) => x.obj === obj);
    if (!f) { f = { obj, mats: [], t: 0, dur: duration, color: new THREE.Color() }; flashes.push(f); }
    else { restoreFlash(f); f.mats.length = 0; }
    f.t = 0; f.dur = Math.max(0.02, duration); f.color.setHex(color);
    obj.traverse((m) => {
      if (!m.isMesh || m.name === 'outline' || !m.material) return;
      if (!m.userData._vfxOwnMat) {
        const own = (mat) => {
          if (!mat || !mat.emissive) return mat;
          const c = mat.clone();
          c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey;
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
        m.userData._vfxOwnMat = true;
      }
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of list) {
        if (!mat?.emissive || mat.userData?._vfxFlashing) continue;
        mat.userData._vfxFlashing = true;
        f.mats.push({ mat, e: mat.emissive.getHex(), ei: mat.emissiveIntensity });
      }
    });
  }
  function restoreFlash(f) {
    for (const r of f.mats) { r.mat.emissive.setHex(r.e); r.mat.emissiveIntensity = r.ei; r.mat.userData._vfxFlashing = false; }
  }
  function updateFlashes(realDt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += realDt;
      const p = f.t / f.dur;
      if (p >= 1) { restoreFlash(f); flashes.splice(i, 1); continue; }
      const k = 1 - p * p;
      for (const r of f.mats) {
        _fc.setHex(r.e).lerp(f.color, k);
        r.mat.emissive.copy(_fc);
        r.mat.emissiveIntensity = r.ei + (1.6 - r.ei) * k;
      }
    }
  }

  // ---------- afterimages ----------
  const ghostMats = [];
  const GHOST_VERT = `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
  const GHOST_FRAG = `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
    void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = (0.18 + pow(f, 2.0) * 0.9) * uOpacity;
      gl_FragColor = vec4(mix(uColor, vec3(1.0), pow(f, 6.0) * 0.5) * a, 1.0); }`;
  const ghosts = [];
  function spawnAfterimage(object3D, color = 0x9fdcff, life = 0.45) {
    if (!object3D?.traverse) return null;
    object3D.updateWorldMatrix(true, true);
    const mat = ghostMats.pop() || new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    mat.uniforms.uColor.value.setHex(color); mat.uniforms.uOpacity.value = 1;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    object3D.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.name === 'outline' || !m.visible || !m.geometry?.attributes?.normal) return;
      if (m.material?.blending === THREE.AdditiveBlending) return;
      const g = new THREE.Mesh(m.geometry, mat);
      g.matrixAutoUpdate = false; g.matrix.copy(m.matrixWorld); g.matrixWorld.copy(m.matrixWorld);
      g.frustumCulled = false; g.renderOrder = 9;
      group.add(g);
    });
    game.scene.add(group);
    ghosts.push({ group, mat, t: 0, life: Math.max(0.05, life) });
    if (ghosts.length > 10) killGhost(0);
    return group;
  }
  function killGhost(i) {
    const g = ghosts[i]; game.scene.remove(g.group); ghostMats.push(g.mat); ghosts.splice(i, 1);
  }
  function updateGhosts(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]; g.t += dt;
      const p = g.t / g.life;
      if (p >= 1) { killGhost(i); continue; }
      g.mat.uniforms.uOpacity.value = (1 - p) * (1 - p);
    }
  }

  // ---------- glow materials ----------
  const GLOW_FRAG = `uniform vec3 uColor; uniform float uOpacity, uCore; varying vec3 vN; varying vec3 vV;
    void main(){ float ndv = abs(dot(normalize(vN), normalize(vV)));
      float a = (pow(ndv, 1.4) * 0.9 + 0.1) * uOpacity;
      vec3 col = mix(uColor, vec3(1.0), pow(ndv, 3.0) * uCore);
      gl_FragColor = vec4(col * a, 1.0); }`;
  function glowMaterial(color = 0xffffff, opts = {}) {
    if (opts.sprite) {
      return new THREE.SpriteMaterial({ map: textures.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    }
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opts.opacity ?? 1 }, uCore: { value: opts.core ?? 0.85 } },
      vertexShader: GHOST_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.color = m.uniforms.uColor.value;
    Object.defineProperty(m, 'opacity', { get() { return m.uniforms ? m.uniforms.uOpacity.value : 1; }, set(v) { if (m.uniforms) m.uniforms.uOpacity.value = v; }, configurable: true });
    return m;
  }
  function glowSprite(color = 0xffffff, size = 1) {
    const s = new THREE.Sprite(glowMaterial(color, { sprite: true }));
    s.scale.setScalar(size);
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

  const api = {
    textures, FRAMES,
    burst, emitter, flash, screenFlash, shake, kick, fovKick, flashEntity, spawnAfterimage, glowMaterial, glowSprite, after,
    trail: (obj, o) => trails.trail(obj, o),
    shockwave: (pos, o) => (pos ? ground.shockwave(pos, o) : null),
    ring: (pos, o) => (pos ? ground.shockwave(pos, o) : null),
    dome: (pos, o) => (pos ? ground.dome(pos, o) : null),
    decal: (pos, o) => (pos ? ground.decal(pos, o) : null),
    beam: (from, to, o) => (from && to ? beams.beam(from, to, o) : { stop() {}, setEnds() {} }),
    debris: (pos, o) => (pos ? debrisFx.debris(pos, o) : null),
    hitstop: (s) => game.hitstop?.(s),
    get trauma() { return trauma; },
    stats() {
      return { additive: add.count, alpha: alpha.count, emitters: emitters.length, beams: beams.count(), trails: trails.count(),
        debris: debrisFx.count(), ghosts: ghosts.length, ...ground.stats() };
    },
    clear() {
      add.count = 0; alpha.count = 0; emitters.length = 0; jobs.length = 0; trauma = 0;
    },
    init() {
      game.events?.on?.('stateChange', ({ state }) => {
        if (state === 'title') { trauma = 0; }
      });
    },
    update(dt, realDt) {
      const gh = game.world?.getHeight;
      updateJobs(dt);
      updateEmitters(dt);
      add.update(dt, gh, game.time);
      alpha.update(dt, gh, game.time);
      ground.update(dt);
      beams.update(dt);
      trails.update(dt);
      debrisFx.update(dt);
      updateLights(dt);
      updateGhosts(dt);
      updateFlashes(realDt);
      // screen flash
      if (sf.t < sf.dur) {
        sf.t += realDt;
        const p = Math.min(1, sf.t / sf.dur);
        overlay.style.opacity = String(sf.a * (1 - p) * (1 - p));
      } else if (overlay.style.opacity !== '0') overlay.style.opacity = '0';
      applyCamera(realDt);
    },
  };
  installPresets(api, game);
  void _camPos;
  return api;
}
