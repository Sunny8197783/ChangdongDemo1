// Terrain interaction (game.world.surface): grass fire simulation on a coarse grid, scorch/regrow burn mask for the
// grass + terrain shaders, fire updrafts, walkable ice on water, wind gusts, explosive fire barrels (불씨 항아리).
// Simulation runs at 10 Hz over ACTIVE cells only (burning list + scorched list at 2 Hz + wet list).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat } from '../core/utils.js';
import { ORIGIN, CELL, NV, villageMask } from './terrain.js';
import { outlineMat } from './prefab.js';
import { GUSTS } from './grass.js';

export const GRID = { x0: -172, z0: -172, cs: 2, n: 172 };

/** Burn DataTexture + uniforms; created before grass/terrain shaders compile. */
export function createBurnField() {
  const { n, x0, z0, cs } = GRID;
  const data = new Uint8Array(n * n * 4);
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const xform = new THREE.Vector4(x0, z0, 1 / (n * cs), 1 / (n * cs));
  return { tex, data, xform };
}

const FLAME_CAP = 400, SMOKE_CAP = 90, ICE_CAP = 24, EMBER_CAP = 260;

export function buildSurface(game, world, terrain, field, grass) {
  const { n, x0, z0, cs } = GRID;
  const N = n * n;
  const fuel = new Float32Array(N), burnT = new Float32Array(N), heat = new Float32Array(N), burnt = new Float32Array(N);
  const wetT = new Float32Array(N), regrowAt = new Float32Array(N), endT = new Float32Array(N);
  const state = new Uint8Array(N); // 0 idle, 1 burning, 2 scorched
  const inScorch = new Uint8Array(N), inWet = new Uint8Array(N);
  const burning = [], scorched = [], wetList = [];
  const data = field.data;
  let texDirty = false;
  let simTime = 0;

  // fuel from the terrain grass-density map (alpha of the colour texture)
  {
    const ca = terrain.colTexData;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * cs, z = z0 + (j + 0.5) * cs;
      const gi = Math.round((x - ORIGIN) / CELL), gj = Math.round((z - ORIGIN) / CELL);
      if (gi < 0 || gj < 0 || gi >= NV || gj >= NV) continue;
      const d = ca[(gj * NV + gi) * 4 + 3] / 255;
      // the village lawn never burns (fire stops at the fences); the open meadows and camps' fields do
      fuel[j * n + i] = d > 0.12 && villageMask(x, z) < 0.25 ? d : 0;
    }
  }
  const cellOf = (x, z) => {
    const i = Math.floor((x - x0) / cs), j = Math.floor((z - z0) / cs);
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return j * n + i;
  };
  const writeTex = (k) => {
    data[k * 4] = Math.min(255, burnt[k] * 255) | 0;
    data[k * 4 + 1] = Math.min(255, heat[k] * 255) | 0;
    texDirty = true;
  };
  // only fully regrown grass (state 0) can burn again — scorched cells (state 2) are fire-immune while regrowing
  const canBurn = (k) => state[k] === 0 && fuel[k] > 0.12 && wetT[k] <= 0 && burnt[k] < 0.35;

  let igniteSoundT = -1;
  // fire "strength" per cell: direct ignitions start at 1, every spread hop inherits ×0.94, and spread scales with
  // it — so a barrel-sized ignition burns a patch and dies out instead of creeping across the whole meadow
  const gen = new Float32Array(N);
  function startBurn(k, intensity = 1, strength = 1) {
    if (!canBurn(k)) return false;
    state[k] = 1;
    gen[k] = strength;
    burnT[k] = (4 + Math.random() * 3) * (0.65 + 0.35 * fuel[k]);
    heat[k] = Math.max(heat[k], 0.25 * intensity);
    burning.push(k);
    writeTex(k);
    return true;
  }

  // ---------------------------------------------------------------- gusts (wind spells)
  const gusts = Array.from({ length: GUSTS }, () => ({ x: 0, z: 0, r: 1, s: 0, dx: 0, dz: 0, t: 0, life: 1.4, on: false }));
  let gustIdx = 0;
  const gU = grass?.shared?.uGust?.value, gD = grass?.shared?.uGustDir?.value;

  // ---------------------------------------------------------------- flames / smoke / embers (pooled instanced)
  const uTime = { value: 0 };
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const flameGeo = quad.clone();
  const fPos = new Float32Array(FLAME_CAP * 4), fPar = new Float32Array(FLAME_CAP * 4);
  const fPosA = new THREE.InstancedBufferAttribute(fPos, 4).setUsage(THREE.DynamicDrawUsage);
  const fParA = new THREE.InstancedBufferAttribute(fPar, 4).setUsage(THREE.DynamicDrawUsage);
  flameGeo.setAttribute('aCenter', fPosA); flameGeo.setAttribute('aPar', fParA);
  flameGeo.instanceCount = 0;
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute vec4 aCenter; attribute vec4 aPar; uniform float uTime;
      varying vec2 vUv; varying float vSeed; varying float vHeat;
      void main(){
        vUv = position.xy; vSeed = aCenter.w; vHeat = aPar.z;
        float fl = 1.0 + 0.16 * sin(uTime * 12.0 + aCenter.w * 7.0) + 0.1 * sin(uTime * 21.0 + aCenter.w * 3.0);
        vec4 mv = modelViewMatrix * vec4(aCenter.xyz, 1.0);
        float sz = aPar.x * (0.45 + 0.55 * aPar.z);
        mv.xy += vec2(position.x * sz * 0.55, position.y * sz * aPar.y * fl);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vHeat;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      void main(){
        vec2 uv = vUv;
        float n = noise(vec2(uv.x * 3.0 + vSeed, uv.y * 4.0 - uTime * 3.4)) * 0.6 + noise(vec2(uv.x * 7.0, uv.y * 8.0 - uTime * 5.2 + vSeed)) * 0.4;
        uv.x += (n - 0.5) * 0.5 * uv.y;
        float w = (1.0 - uv.y) * (0.55 + 0.45 * sqrt(max(uv.y, 0.0)) * 2.0) * 0.8;
        float shape = 1.0 - smoothstep(w * 0.5, w, abs(uv.x));
        shape *= smoothstep(1.0, 0.5, uv.y + n * 0.4) * smoothstep(0.0, 0.1, uv.y);
        float core = (1.0 - smoothstep(0.0, w * 0.6, abs(uv.x))) * smoothstep(0.75, 0.1, uv.y + n * 0.2);
        vec3 c = mix(vec3(0.55, 0.05, 0.01), vec3(0.98, 0.32, 0.03), smoothstep(0.0, 0.8, shape));
        c = mix(c, vec3(1.0, 0.66, 0.22), core * 0.8);
        c = mix(c, vec3(0.45, 0.04, 0.01), smoothstep(0.55, 0.95, uv.y) * 0.6);
        gl_FragColor = vec4(c * (0.8 + 0.2 * vHeat), clamp(shape * 1.4, 0.0, 0.92) * (0.5 + 0.5 * vHeat));
      }`,
  });
  const flames = new THREE.Mesh(flameGeo, flameMat);
  flames.frustumCulled = false; flames.renderOrder = 5; flames.name = 'grassFire';
  game.scene.add(flames);

  const smokeGeo = quad.clone();
  const sPos = new Float32Array(SMOKE_CAP * 4), sPar = new Float32Array(SMOKE_CAP * 4);
  const sPosA = new THREE.InstancedBufferAttribute(sPos, 4).setUsage(THREE.DynamicDrawUsage);
  const sParA = new THREE.InstancedBufferAttribute(sPar, 4).setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute('aCenter', sPosA); smokeGeo.setAttribute('aPar', sParA);
  smokeGeo.instanceCount = 0;
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uWind: { value: world.wind.dir2 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 aCenter; attribute vec4 aPar; uniform float uTime; uniform vec2 uWind;
      varying vec2 vUv; varying float vA; varying float vL;
      void main(){
        float life = fract(uTime * 0.22 + aCenter.w);
        vec3 p = aCenter.xyz + vec3(uWind.x * life * life * 9.0, 1.0 + life * 14.0 * aPar.y, uWind.y * life * life * 9.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float sz = aPar.x * (1.2 + life * 4.0);
        float a = aCenter.w * 6.28 + life * 1.5;
        vec2 q = position.xy - vec2(0.0, 0.5); q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
        mv.xy += q * sz;
        gl_Position = projectionMatrix * mv;
        vUv = position.xy; vL = life;
        vA = smoothstep(0.0, 0.15, life) * (1.0 - life) * aPar.z;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA; varying float vL;
      void main(){ vec2 d = vUv - vec2(0.0, 0.5); float r = length(d * vec2(1.0, 2.0));
        float m = smoothstep(1.0, 0.2, r);
        gl_FragColor = vec4(mix(vec3(0.16, 0.14, 0.13), vec3(0.5, 0.5, 0.52), vL), m * vA * 0.75); }`,
  });
  const smoke = new THREE.Mesh(smokeGeo, smokeMat);
  smoke.frustumCulled = false; smoke.renderOrder = 4; smoke.name = 'grassSmoke';
  game.scene.add(smoke);

  const eGeo = new THREE.BufferGeometry();
  const ePos = new Float32Array(EMBER_CAP * 3), eSeed = new Float32Array(EMBER_CAP);
  for (let i = 0; i < EMBER_CAP; i++) eSeed[i] = Math.random();
  const ePosA = new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage);
  eGeo.setAttribute('position', ePosA); eGeo.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 1));
  eGeo.setDrawRange(0, 0);
  const eUniforms = { uTime, uScale: { value: 1 }, uWind: { value: world.wind.dir2 } };
  const embers = new THREE.Points(eGeo, new THREE.ShaderMaterial({
    uniforms: eUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; uniform float uScale; uniform vec2 uWind; varying float vL;
      void main(){
        float life = fract(uTime * (0.35 + aSeed * 0.3) + aSeed * 13.0);
        float a = aSeed * 50.0 + life * 6.0;
        vec3 p = position + vec3(cos(a) * 0.8 * life + uWind.x * life * 4.0, 0.4 + life * (5.0 + aSeed * 5.0), sin(a) * 0.8 * life + uWind.y * life * 4.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = 55.0 * uScale * (1.0 - life * 0.6) / -mv.z; vL = life;
      }`,
    fragmentShader: /* glsl */`
      varying float vL;
      void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.3, 0.05), vL) * 2.0, a * (1.0 - vL)); }`,
  }));
  embers.frustumCulled = false; embers.renderOrder = 6; embers.name = 'grassEmbers';
  game.scene.add(embers);

  // one pooled fire light (always in the scene so the light count never changes → no shader recompiles)
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 26, 1.6);
  fireLight.position.set(0, -50, 0);
  game.scene.add(fireLight);

  // ---------------------------------------------------------------- ice discs on water
  const iceGeo = (() => {
    const g = new THREE.CylinderGeometry(1, 0.92, 0.26, 16, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r > 0.5) { const a = Math.atan2(z, x); const k = 1 + Math.sin(a * 5) * 0.06 + Math.sin(a * 11 + 1) * 0.04; p.setX(i, x * k); p.setZ(i, z * k); }
    }
    g.computeVertexNormals();
    return g;
  })();
  const iceMat = toonMat(0xc8f1ff, { emissive: 0x3a8fb8, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 });
  const ice = new THREE.InstancedMesh(iceGeo, iceMat, ICE_CAP);
  ice.count = 0; ice.frustumCulled = false; ice.receiveShadow = true; ice.name = 'iceDiscs';
  game.scene.add(ice);
  const iceOutline = new THREE.InstancedMesh(iceGeo, outlineMat(0.05, 0x2a5a78), ICE_CAP);
  iceOutline.instanceMatrix = ice.instanceMatrix; iceOutline.count = 0; iceOutline.frustumCulled = false;
  game.scene.add(iceOutline);
  const discs = []; // {x,z,r,level,t,life}

  function waterLevelAt(x, z) {
    const P = world.village?.pond;
    if (P && Math.hypot(x - P.position.x, z - P.position.z) < P.radius * 1.1) {
      return terrain.getHeight(x, z) < P.position.y - 0.03 ? P.position.y : null;
    }
    if (world._isInWaterRaw?.(x, z)) return world.waterLevel;
    return null;
  }
  function onIce(x, z) {
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i]; if (d.t > d.life) continue;
      const dx = x - d.x, dz = z - d.z;
      if (dx * dx + dz * dz < d.r * d.r * d.grow * d.grow) return d;
    }
    return null;
  }

  // ---------------------------------------------------------------- barrels (불씨 항아리)
  const barrelGeo = (() => {
    const pts = [];
    const prof = [[0, 0], [0.34, 0.02], [0.47, 0.25], [0.52, 0.5], [0.46, 0.8], [0.3, 0.98], [0.24, 1.05], [0.28, 1.12], [0.0, 1.12]];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 12);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      c.set(y > 1.0 ? 0x4a2a1a : 0x9a3b24).lerp(new THREE.Color(0x6a2416), Math.max(0, 0.5 - y) * 0.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  })();
  const bandGeo = (() => {
    const a = new THREE.TorusGeometry(0.515, 0.045, 4, 20); a.rotateX(Math.PI / 2); a.translate(0, 0.52, 0);
    const b = new THREE.OctahedronGeometry(0.13, 0); b.scale(0.6, 1, 0.3); b.translate(0, 0.52, 0.53);
    const c = b.clone(); c.rotateY(Math.PI * 2 / 3); const d = b.clone(); d.rotateY(-Math.PI * 2 / 3);
    for (const g of [a, b, c, d]) { g.deleteAttribute('uv'); }
    return mergeGeometries([a.toNonIndexed(), b, c, d].map((g) => (g.index ? g.toNonIndexed() : g)), false);
  })();
  const BCAP = 16;
  const barrelMesh = new THREE.InstancedMesh(barrelGeo, toonMat(0xffffff, { vertexColors: true }), BCAP);
  barrelMesh.castShadow = true; barrelMesh.receiveShadow = true; barrelMesh.frustumCulled = false; barrelMesh.name = 'fireBarrels';
  const barrelGlow = new THREE.InstancedMesh(bandGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(1.7), fog: true }), BCAP);
  barrelGlow.instanceMatrix = barrelMesh.instanceMatrix; barrelGlow.frustumCulled = false;
  const barrelOutline = new THREE.InstancedMesh(barrelGeo, outlineMat(0.035, 0x2a140c), BCAP);
  barrelOutline.instanceMatrix = barrelMesh.instanceMatrix; barrelOutline.frustumCulled = false;
  game.scene.add(barrelMesh, barrelGlow, barrelOutline);
  const barrels = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const explodeQueue = [];

  function makeBarrel(pos) {
    const obj = new THREE.Object3D();
    obj.position.copy(pos); obj.name = 'fireBarrel';
    game.scene.add(obj);
    const b = {
      id: 'barrel' + barrels.length, team: 'prop', isProp: true, name: '불씨 항아리',
      alive: true, object: obj, radius: 0.55, height: 1.15, hp: 1, maxHp: 1, mass: 50,
      velocity: new THREE.Vector3(), grounded: true, statuses: {}, resist: {},
      home: pos.clone(), respawnT: 0, pop: 1, yaw: Math.random() * 6.28, fuse: 0,
      getCenter(out) { return out.copy(obj.position).setY(obj.position.y + 0.55); },
      onHit() { b.wobble = 1; },
      onDeath() { explodeQueue.push({ b, t: 0.06 }); },
    };
    barrels.push(b);
    return b;
  }
  function explodeBarrel(b) {
    const p = _v.copy(b.object.position); p.y += 0.5;
    b.alive = false; b.exploded = true; b.respawnT = 60; b.pop = 0;
    try { game.combat?.unregister?.(b); } catch (_) { /* */ }
    const vfx = game.vfx;
    try { vfx?.explosion?.(p, { element: 'fire', scale: 1.25 }); } catch (_) { /* */ }
    try { vfx?.shake?.(0.55); } catch (_) { /* */ }
    try { vfx?.flash?.(p, { color: 0xff7a2a, intensity: 30, distance: 18, duration: 0.35 }); } catch (_) { /* */ }
    try { game.audio?.play?.('explode_fire', { position: p, volume: 1.1 }); } catch (_) { /* */ }
    api.ignite(p, 5, 1.2);
    const C = game.combat;
    if (C?.queryRadius && C?.dealDamage) {
      const hits = C.queryRadius(p, 4);
      for (const e of hits) {
        if (e === b || !e.alive) continue;
        const ep = e.object.position, d = Math.hypot(ep.x - p.x, ep.z - p.z);
        const dir = _v2.set(ep.x - p.x, 0, ep.z - p.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
        const k = 1 - Math.min(1, d / 4.5) * 0.5;
        const amount = e.team === 'player' ? 14 * k : e.isProp ? 5 : 48 * k;
        try {
          C.dealDamage(e, { amount, element: 'fire', source: 'player', point: e.getCenter ? e.getCenter(new THREE.Vector3()) : ep.clone(),
            direction: dir.clone(), knockback: 9 * k, launch: 5 * k, status: { burning: 3 }, heavy: true, tags: ['explosion', 'barrel'], hitstop: 0.09, shake: 0.4 });
        } catch (err) { console.error('[surface] barrel damage', err); }
      }
    }
    game.events?.emit?.('barrelExplode', { position: p.clone() });
  }
  function syncBarrels(dt, t) {
    for (let i = 0; i < barrels.length; i++) {
      const b = barrels[i];
      if (!b.alive) {
        b.respawnT -= dt;
        if (b.respawnT <= 0) {
          b.alive = true; b.exploded = false; b.hp = 1; b.statuses = {}; b.pop = 0.001; b.fuse = 0;
          b.object.position.copy(b.home); b.velocity.set(0, 0, 0);
          try { game.combat?.register?.(b); } catch (_) { /* */ }
          try { game.vfx?.burst?.(_v.copy(b.home).setY(b.home.y + 0.6), { count: 14, color: [0xffd27a, 0xff8a2a], speed: 2, size: 0.25, life: 0.6, shape: 'ember' }); } catch (_) { /* */ }
        }
      }
      if (b.alive && b.pop < 1) b.pop = Math.min(1, b.pop + dt * 3);
      b.wobble = Math.max(0, (b.wobble || 0) - dt * 3);
      const s = b.alive ? (b.pop < 1 ? 1 - Math.pow(1 - b.pop, 3) * 1.0 : 1) : 0;
      const wob = b.wobble * Math.sin(t * 40) * 0.12;
      _e.set(wob, b.yaw, wob * 0.6); _q.setFromEuler(_e); _s.setScalar(s * 1.0);
      _m.compose(b.object.position, _q, _s);
      barrelMesh.setMatrixAt(i, _m);
    }
    barrelMesh.count = barrelGlow.count = barrelOutline.count = barrels.length;
    barrelMesh.instanceMatrix.needsUpdate = true;
    barrelGlow.material.color.setRGB(1.7, 0.92, 0.35).multiplyScalar(0.8 + 0.25 * Math.sin(t * 3));
  }

  // ---------------------------------------------------------------- simulation
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const W = world.wind;
  function spreadFactor(k, dx, dz) {
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    let f = 1 + 1.6 * (ux * W.dir.x + uz * W.dir.z) * (W.strength ?? 1);
    // wind spells: strong push along the gust direction (radial when no dir)
    const cx = x0 + ((k % n) + 0.5) * cs, cz = z0 + (Math.floor(k / n) + 0.5) * cs;
    for (let g = 0; g < gusts.length; g++) {
      const G = gusts[g]; if (!G.on) continue;
      const gx = cx - G.x, gz = cz - G.z, gl = Math.hypot(gx, gz);
      if (gl > G.r) continue;
      const amt = G.s * (1 - G.t / G.life);
      let ddx = G.dx, ddz = G.dz;
      if (ddx === 0 && ddz === 0) { ddx = gx / (gl || 1); ddz = gz / (gl || 1); }
      f += 3.0 * amt * (ux * ddx + uz * ddz);
    }
    return Math.max(0.15, Math.min(4.5, f));
  }
  const TICK = 0.1;
  let acc = 0, scorchAcc = 0;
  function tick() {
    simTime += TICK;
    for (let bi = burning.length - 1; bi >= 0; bi--) {
      const k = burning[bi];
      if (state[k] !== 1) { burning[bi] = burning[burning.length - 1]; burning.pop(); continue; }
      burnT[k] -= TICK;
      heat[k] = burnT[k] > 1.2 ? Math.min(1, heat[k] + TICK * 1.4) : Math.max(0, burnT[k] / 1.2);
      // spread
      const i = k % n, j = (k - i) / n;
      const h = heat[k];
      const gk = gen[k];
      if (h > 0.3 && gk > 0.18) {
        for (let q = 0; q < 8; q++) {
          const ii = i + NB[q][0], jj = j + NB[q][1];
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const kk = jj * n + ii;
          if (!canBurn(kk)) continue;
          const rate = 0.2 * fuel[kk] * h * gk * spreadFactor(k, NB[q][0], NB[q][1]) * (q >= 4 ? 0.7 : 1);
          if (Math.random() < rate * TICK) startBurn(kk, 1, gk * 0.94);
        }
      }
      if (burnT[k] <= 0) {
        state[k] = 2; heat[k] = 0; burnt[k] = 1;
        regrowAt[k] = simTime + 40 + Math.random() * 25; endT[k] = simTime;
        if (!inScorch[k]) { inScorch[k] = 1; scorched.push(k); }
        burning[bi] = burning[burning.length - 1]; burning.pop();
      }
      writeTex(k);
    }
    for (let wi = wetList.length - 1; wi >= 0; wi--) {
      const k = wetList[wi]; wetT[k] -= TICK;
      if (wetT[k] <= 0) { wetT[k] = 0; inWet[k] = 0; wetList[wi] = wetList[wetList.length - 1]; wetList.pop(); }
    }
    scorchAcc += TICK;
    if (scorchAcc >= 0.5) {
      const st = scorchAcc; scorchAcc = 0;
      for (let si = scorched.length - 1; si >= 0; si--) {
        const k = scorched[si];
        if (state[k] === 1) continue;
        if (simTime > regrowAt[k]) {
          burnt[k] = Math.max(0, burnt[k] - st / 25);
          writeTex(k);
          if (burnt[k] <= 0) { state[k] = 0; inScorch[k] = 0; scorched[si] = scorched[scorched.length - 1]; scorched.pop(); }
        }
      }
    }
    rebuildFireVisuals();
  }

  // flames: near cells get their own flame (two when the fire is small), far cells are sampled with bigger flames
  const _cam = new THREE.Vector3(), _near = [], _far = [];
  let lightTarget = 0;
  function rebuildFireVisuals() {
    const cam = game.camera.position; _cam.copy(cam);
    let fc = 0, sc = 0, ec = 0;
    const nb = burning.length;
    const near = _near, far = _far; near.length = 0; far.length = 0;
    for (let q = 0; q < nb; q++) {
      const k = burning[q];
      const cx = x0 + ((k % n) + 0.5) * cs, cz = z0 + (Math.floor(k / n) + 0.5) * cs;
      const d2 = (cx - cam.x) ** 2 + (cz - cam.z) ** 2;
      (d2 < 45 * 45 ? near : far).push(k);
    }
    const per = nb < 150 ? 2 : 1;
    const putFlame = (k, size, sub) => {
      if (fc >= FLAME_CAP) return;
      const i = k % n, j = Math.floor(k / n);
      const seed = (k * 0.6180339 + sub * 0.37) % 1;
      const ox = (((k * 7919) % 97) / 97 - 0.5) * 1.1 + (sub ? 0.5 : 0), oz = (((k * 104729) % 89) / 89 - 0.5) * 1.1 - (sub ? 0.4 : 0);
      const x = x0 + (i + 0.5) * cs + ox, z = z0 + (j + 0.5) * cs + oz;
      const y = terrain.getHeight(x, z) - 0.05;
      fPos[fc * 4] = x; fPos[fc * 4 + 1] = y; fPos[fc * 4 + 2] = z; fPos[fc * 4 + 3] = seed * 100;
      const h2 = ((k * 2654435761) >>> 0) % 1000 / 1000;
      fPar[fc * 4] = size * (sub ? 0.65 : 1) * (0.6 + fuel[k] * 0.35) * (0.6 + h2 * 0.8); fPar[fc * 4 + 1] = 1.3 + seed * 1.1; fPar[fc * 4 + 2] = heat[k]; fPar[fc * 4 + 3] = 0;
      fc++;
      if (ec < EMBER_CAP && (sub === 0) && (k % 2 === 0)) { ePos[ec * 3] = x; ePos[ec * 3 + 1] = y; ePos[ec * 3 + 2] = z; ec++; }
    };
    for (let q = 0; q < near.length && fc < FLAME_CAP * 0.75; q++) for (let s = 0; s < per; s++) putFlame(near[q], 1.5, s);
    if (far.length) {
      const room = Math.max(1, FLAME_CAP - fc), stride = Math.max(1, Math.ceil(far.length / room));
      const big = 1.5 * Math.sqrt(stride);
      for (let q = 0; q < far.length; q += stride) putFlame(far[q], big, 0);
    }
    // smoke over burning + freshly burnt cells
    const sstride = Math.max(1, Math.ceil(nb / (SMOKE_CAP * 0.75)));
    for (let q = 0; q < nb && sc < SMOKE_CAP; q += sstride) {
      const k = burning[q]; const i = k % n, j = Math.floor(k / n);
      const x = x0 + (i + 0.5) * cs, z = z0 + (j + 0.5) * cs;
      sPos[sc * 4] = x; sPos[sc * 4 + 1] = terrain.getHeight(x, z) + 1.0; sPos[sc * 4 + 2] = z; sPos[sc * 4 + 3] = (k * 0.1373) % 1;
      sPar[sc * 4] = 1.3 * Math.sqrt(sstride); sPar[sc * 4 + 1] = 0.8 + ((k * 31) % 7) / 14; sPar[sc * 4 + 2] = Math.max(0.35, heat[k]);
      sc++;
    }
    for (let q = scorched.length - 1; q >= 0 && sc < SMOKE_CAP; q -= 3) {
      const k = scorched[q]; const age = simTime - endT[k];
      if (age > 6 || age < 0) continue;
      const i = k % n, j = Math.floor(k / n);
      const x = x0 + (i + 0.5) * cs, z = z0 + (j + 0.5) * cs;
      sPos[sc * 4] = x; sPos[sc * 4 + 1] = terrain.getHeight(x, z) + 0.4; sPos[sc * 4 + 2] = z; sPos[sc * 4 + 3] = (k * 0.1373) % 1;
      sPar[sc * 4] = 1.1; sPar[sc * 4 + 1] = 0.6; sPar[sc * 4 + 2] = 0.5 * (1 - age / 6);
      sc++;
    }
    flameGeo.instanceCount = fc; smokeGeo.instanceCount = sc; eGeo.setDrawRange(0, ec);
    for (const [A, c, w] of [[fPosA, fc, 4], [fParA, fc, 4], [sPosA, sc, 4], [sParA, sc, 4], [ePosA, ec, 3]]) {
      if (!c) continue;
      A.clearUpdateRanges?.(); A.addUpdateRange?.(0, c * w); A.needsUpdate = true;
    }
    flames.visible = fc > 0; smoke.visible = sc > 0; embers.visible = ec > 0;
    // fire light at the heat centroid of the cells near the camera
    let sx = 0, sz = 0, sw = 0;
    for (let q = 0; q < near.length; q++) {
      const k = near[q]; const w = heat[k];
      sx += (x0 + ((k % n) + 0.5) * cs) * w; sz += (z0 + (Math.floor(k / n) + 0.5) * cs) * w; sw += w;
    }
    if (sw > 0.2) {
      const lx = sx / sw, lz = sz / sw;
      fireLight.position.set(lx, terrain.getHeight(lx, lz) + 2.2, lz);
      lightTarget = Math.min(26, 6 + sw * 1.5);
    } else lightTarget = 0;
  }

  // ---------------------------------------------------------------- entity checks (0.5 s) + audio
  let entAcc = 0, audioAcc = 0, crackle = null, crackleRetry = 0, crackleSilent = 0;
  function entityCheck() {
    const ents = game.entities || [];
    const C = game.combat;
    for (let q = 0; q < ents.length; q++) {
      const e = ents[q];
      if (!e.alive || !e.object) continue;
      const p = e.object.position;
      const k = cellOf(p.x, p.z);
      if (k < 0 || state[k] !== 1 || heat[k] < 0.3) continue;
      if (p.y - terrain.getHeight(p.x, p.z) > 1.6) continue;
      if (e.isProp && e.team === 'prop' && barrels.includes(e)) { if (!e.fuse) e.fuse = 0.7; continue; }
      try { C?.applyStatus?.(e, 'burning', 2); } catch (_) { /* */ }
    }
    // burning enemies (not the player) set dry grass alight where they stagger
    for (let q = 0; q < ents.length; q++) {
      const e = ents[q];
      if (!e.alive || e.team !== 'enemy' || !e.statuses?.burning || !e.object) continue;
      if (Math.random() < 0.3) { const p = e.object.position; const k = cellOf(p.x, p.z); if (k >= 0) startBurn(k, 0.6); }
    }
  }
  function updateAudio() {
    const cam = game.camera.position;
    let w = 0;
    for (let q = 0; q < burning.length; q++) {
      const k = burning[q];
      const dx = x0 + ((k % n) + 0.5) * cs - cam.x, dz = z0 + (Math.floor(k / n) + 0.5) * cs - cam.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 34) w += heat[k] * (1 - d / 34);
    }
    const vol = Math.min(1, w / 14);
    const A = game.audio;
    if (vol > 0.02) {
      crackleSilent = 0;
      if ((!crackle || crackle.alive === false) && A?.loop && simTime > crackleRetry) {
        crackleRetry = simTime + 2;
        try { crackle = A.loop('fire_crackle', { volume: 1 }); } catch (_) { crackle = null; }
      }
      try { crackle?.setVolume?.(vol); } catch (_) { /* */ }
    } else if (crackle) {
      try { crackle.setVolume?.(0); } catch (_) { /* */ }
      crackleSilent += 0.25;
      if (crackleSilent > 4) { try { crackle.stop?.(); } catch (_) { /* */ } crackle = null; }
    }
  }

  // ---------------------------------------------------------------- API
  const api = {
    grid: GRID,
    texture: field.tex,
    get burningCount() { return burning.length; },
    /** Set grass alight within radius. Returns the number of cells ignited. */
    ignite(pos, radius = 1.5, intensity = 1) {
      if (!pos) return 0;
      const r = Math.max(0.5, radius);
      const i0 = Math.floor((pos.x - r - x0) / cs), i1 = Math.floor((pos.x + r - x0) / cs);
      const j0 = Math.floor((pos.z - r - z0) / cs), j1 = Math.floor((pos.z + r - z0) / cs);
      let cnt = 0;
      for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
        const cx = x0 + (i + 0.5) * cs, cz = z0 + (j + 0.5) * cs;
        if ((cx - pos.x) ** 2 + (cz - pos.z) ** 2 > (r + cs * 0.5) ** 2) continue;
        if (startBurn(j * n + i, intensity)) cnt++;
      }
      if (cnt && simTime - igniteSoundT > 0.3) {
        igniteSoundT = simTime;
        try { game.audio?.play?.('grass_ignite', { position: pos, volume: Math.min(1, 0.4 + cnt * 0.08) }); } catch (_) { /* */ }
        game.events?.emit?.('grassIgnite', { position: pos.clone ? pos.clone() : pos, cells: cnt });
      }
      return cnt;
    },
    /** Put fires out (water, ice, rain). Extinguished cells are left lightly charred. */
    extinguish(pos, radius = 3) {
      let cnt = 0;
      const r2 = (radius + cs * 0.5) ** 2;
      for (let q = burning.length - 1; q >= 0; q--) {
        const k = burning[q];
        const cx = x0 + ((k % n) + 0.5) * cs, cz = z0 + (Math.floor(k / n) + 0.5) * cs;
        if ((cx - pos.x) ** 2 + (cz - pos.z) ** 2 > r2) continue;
        state[k] = 2; heat[k] = 0; burnt[k] = Math.max(burnt[k], 0.55); regrowAt[k] = simTime + 20; endT[k] = simTime;
        if (!inScorch[k]) { inScorch[k] = 1; scorched.push(k); }
        writeTex(k); cnt++;
      }
      if (cnt) { try { game.audio?.play?.('steam', { position: pos, volume: Math.min(1, 0.3 + cnt * 0.05) }); } catch (_) { /* */ } }
      return cnt;
    },
    /** Soak grass: it cannot ignite for `seconds` (also extinguishes). */
    wet(pos, radius = 4, seconds = 12) {
      api.extinguish(pos, radius);
      const i0 = Math.floor((pos.x - radius - x0) / cs), i1 = Math.floor((pos.x + radius - x0) / cs);
      const j0 = Math.floor((pos.z - radius - z0) / cs), j1 = Math.floor((pos.z + radius - z0) / cs);
      for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
        const cx = x0 + (i + 0.5) * cs, cz = z0 + (j + 0.5) * cs;
        if ((cx - pos.x) ** 2 + (cz - pos.z) ** 2 > radius * radius) continue;
        const k = j * n + i; wetT[k] = Math.max(wetT[k], seconds);
        if (!inWet[k]) { inWet[k] = 1; wetList.push(k); }
      }
    },
    isBurning(x, z) { const k = cellOf(x, z); return k >= 0 && state[k] === 1; },
    burningNear(pos, r = 5) {
      let c = 0; const r2 = r * r;
      for (let q = 0; q < burning.length; q++) {
        const k = burning[q];
        const cx = x0 + ((k % n) + 0.5) * cs - pos.x, cz = z0 + (Math.floor(k / n) + 0.5) * cs - pos.z;
        if (cx * cx + cz * cz <= r2) c++;
      }
      return c;
    },
    isBurnt(x, z) { const k = cellOf(x, z); return k >= 0 ? burnt[k] : 0; },
    /** Upward acceleration (m/s²) from rising heat at a world point (0 when no fire below). */
    getUpdraft(pos) {
      if (!burning.length || !pos) return 0;
      const i = Math.floor((pos.x - x0) / cs), j = Math.floor((pos.z - z0) / cs);
      let s = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const k = jj * n + ii; if (state[k] !== 1) continue;
        const w = 1 - (Math.abs(di) + Math.abs(dj)) * 0.16;
        s += heat[k] * w;
      }
      if (s <= 0) return 0;
      const col = Math.min(1, s / 2.5);
      const hAbove = pos.y - terrain.getHeight(pos.x, pos.z);
      if (hAbove > 30 || hAbove < -1) return 0;
      const prof = hAbove < 4 ? 0.5 + 0.5 * Math.max(0, hAbove) / 4 : hAbove < 20 ? 1 : 1 - (hAbove - 20) / 10;
      return 24 * col * prof;
    },
    /** Freeze water into a walkable ice disc. Returns true when there was water to freeze. */
    freezeWater(pos, radius = 4, seconds = 25) {
      const level = waterLevelAt(pos.x, pos.z);
      if (level == null) return false;
      const r = Math.max(1.5, Math.min(radius, 10));
      for (const d of discs) {
        if (d.t > d.life) continue;
        if (Math.hypot(d.x - pos.x, d.z - pos.z) < d.r * 0.5 && Math.abs(d.level - level) < 0.1) { d.r = Math.max(d.r, r); d.t = Math.min(d.t, 0.3); d.life = Math.max(d.life, seconds); return true; }
      }
      let d = discs.find((q) => q.t > q.life);
      if (!d) { if (discs.length < ICE_CAP) { d = {}; discs.push(d); } else d = discs.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b)); }
      Object.assign(d, { x: pos.x, z: pos.z, r, level, t: 0, life: seconds, grow: 0.3, spin: Math.random() * 6 });
      api.extinguish(pos, r);
      try { game.audio?.play?.('freeze_water', { position: pos }); } catch (_) { /* */ }
      game.events?.emit?.('waterFrozen', { position: new THREE.Vector3(pos.x, level, pos.z), radius: r });
      return true;
    },
    /** Melt ice discs whose centre lies within r (fire dashes / melt reactions): they fade out over ~1 s. */
    meltIce(pos, r = 3) {
      if (!pos) return 0;
      let c = 0;
      for (const d of discs) {
        if (d.t > d.life) continue;
        const dx = d.x - pos.x, dz = d.z - pos.z, rr = r + d.r * 0.5;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (d.life - d.t > 1.0) { d.life = d.t + 1.0; c++; }
      }
      return c;
    },
    /** Regrow scorched grass within r right away (nature ultimates): the burn mask fades over the next seconds. */
    regrow(pos, r = 6) {
      if (!pos) return 0;
      const r2 = (r + cs * 0.5) ** 2; let c = 0;
      for (let q = 0; q < scorched.length; q++) {
        const k = scorched[q]; if (state[k] === 1) continue;
        const cx = x0 + ((k % n) + 0.5) * cs - pos.x, cz = z0 + (Math.floor(k / n) + 0.5) * cs - pos.z;
        if (cx * cx + cz * cz > r2) continue;
        regrowAt[k] = simTime; burnt[k] = Math.min(burnt[k], 0.2); writeTex(k); c++;
      }
      return c;
    },
    /** Unburnt meadow grass at a point (fuel map; the village lawn counts as no grass). */
    isGrass(pos) { const k = pos ? cellOf(pos.x, pos.z) : -1; return k >= 0 && fuel[k] > 0.12 && state[k] !== 1 && burnt[k] < 0.35; },
    /** Dense, unburnt grass (shadowblade stealth). */
    isTallGrass(pos) { const k = pos ? cellOf(pos.x, pos.z) : -1; return k >= 0 && fuel[k] > 0.45 && state[k] === 0 && burnt[k] < 0.1; },
    /** Top of the ice at (x,z) or null. */
    iceHeight(x, z) { const d = onIce(x, z); return d ? d.level + 0.14 : null; },
    onIce(x, z) { return !!onIce(x, z); },
    /** Strong grass-bend impulse + fire spread push. dir: Vector3 (null/zero = radial). */
    wind(pos, dir, strength = 1, radius = 6) {
      const G = gusts[gustIdx]; gustIdx = (gustIdx + 1) % gusts.length;
      let dx = dir ? dir.x : 0, dz = dir ? dir.z : 0; const l = Math.hypot(dx, dz);
      if (l > 1e-4) { dx /= l; dz /= l; } else { dx = 0; dz = 0; }
      Object.assign(G, { x: pos.x, z: pos.z, r: radius, s: Math.min(2, strength), dx, dz, t: 0, life: 1.4 + strength * 0.3, on: true, phase: Math.random() * 6 });
      // immediate fire push: burning cells inside throw fire downwind
      const r2 = radius * radius;
      for (let q = burning.length - 1; q >= 0; q--) {
        const k = burning[q];
        const i = k % n, j = Math.floor(k / n);
        const cx = x0 + (i + 0.5) * cs, cz = z0 + (j + 0.5) * cs;
        const ox = cx - pos.x, oz = cz - pos.z; if (ox * ox + oz * oz > r2) continue;
        let ux = dx, uz = dz; if (!ux && !uz) { const ol = Math.hypot(ox, oz) || 1; ux = ox / ol; uz = oz / ol; }
        for (let s = 1; s <= 2; s++) {
          const kk = cellOf(cx + ux * cs * s, cz + uz * cs * s);
          if (kk >= 0 && Math.random() < 0.55 * strength) startBurn(kk, 0.8);
        }
      }
    },
    barrels,
    /** Spots of all explosive barrels (homes). */
    barrelSpots() { return barrels.map((b) => b.home.clone()); },
    addBarrel(pos) { const b = makeBarrel(pos); if (game.combat?.register) game.combat.register(b); return b; },
    update(dt, realDt) {
      const t = game.realTime;
      uTime.value = t;
      eUniforms.uScale.value = game.renderer.domElement.height / 720;
      if (dt > 0) {
        acc += dt;
        let guard = 0;
        while (acc >= TICK && guard++ < 3) { acc -= TICK; tick(); }
        if (acc > TICK) acc = 0;
        entAcc += dt; if (entAcc >= 0.5) { entAcc = 0; entityCheck(); }
        // barrel fuses + chained explosions
        for (const b of barrels) if (b.alive && b.fuse > 0) { b.fuse -= dt; b.wobble = 1; if (b.fuse <= 0) { b.fuse = 0; try { game.combat?.dealDamage?.(b, { amount: 5, element: 'fire', source: 'player', tags: ['tick'] }); } catch (_) { /* */ } if (b.alive) explodeQueue.push({ b, t: 0 }); } }
      }
      for (let q = explodeQueue.length - 1; q >= 0; q--) {
        const ex = explodeQueue[q]; ex.t -= dt;
        if (ex.t <= 0) { explodeQueue.splice(q, 1); if (!ex.b.exploded) explodeBarrel(ex.b); }
      }
      syncBarrels(dt, t);
      // gusts → grass uniforms
      for (let g = 0; g < gusts.length; g++) {
        const G = gusts[g];
        if (G.on) { G.t += realDt; if (G.t >= G.life) G.on = false; }
        if (gU) {
          const amt = G.on ? G.s * Math.pow(1 - G.t / G.life, 1.5) * Math.min(1, G.t * 8 + 0.3) : 0;
          gU[g].set(G.x, G.z, G.r * Math.min(1, 0.4 + G.t * 2.5), amt);
          gD[g].set(G.dx, G.dz, G.phase || 0, 0);
        }
      }
      // ice discs
      let ic = 0;
      for (const d of discs) {
        if (d.t > d.life) continue;
        d.t += dt;
        d.grow = Math.min(1, d.grow + dt * 4);
        const fadeK = d.life - d.t < 1.5 ? Math.max(0, (d.life - d.t) / 1.5) : 1;
        _e.set(0, d.spin, 0); _q.setFromEuler(_e);
        _s.set(d.r * d.grow * (0.85 + 0.15 * fadeK), fadeK, d.r * d.grow * (0.85 + 0.15 * fadeK));
        _m.compose(_v.set(d.x, d.level + 0.02 - (1 - fadeK) * 0.2, d.z), _q, _s);
        ice.setMatrixAt(ic++, _m);
      }
      ice.count = iceOutline.count = ic; ice.visible = iceOutline.visible = ic > 0;
      if (ic) ice.instanceMatrix.needsUpdate = true;
      // light + audio
      fireLight.intensity += (lightTarget * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3)) - fireLight.intensity) * Math.min(1, realDt * 6);
      audioAcc += realDt; if (audioAcc > 0.25) { audioAcc = 0; updateAudio(); }
      if (texDirty) { field.tex.needsUpdate = true; texDirty = false; }
    },
    init() {
      for (const b of barrels) { try { game.combat?.register?.(b); } catch (_) { /* */ } }
    },
    _debug: { state, heat, burnt, fuel, cellOf },
  };
  api._makeBarrel = makeBarrel;
  return api;
}
