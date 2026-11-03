// v3 zone types (CONTRACT §11): mud, holy, miasma, spore, overgrowth, flood, spring, sand, steam, rain (follows), roots (instant
// entangle), blackhole, updraft and lanes (ice road / tailwind / frost ground). 'water', 'fire', 'ice', 'lava', 'storm' and
// 'tornado' (= 'vortex') stay in the v2 spells/zones.js and are routed there by spells.api.zones.spawn.
// Visuals: ONE ground mesh per zone instance (a clone of one shared surface shader: same program, recoloured by uniforms),
// plus shared pooled particles. Blackholes add a pooled core (2 meshes), updrafts a pooled funnel. No lights, no shadows.
// Zones are reaction objects: {isZone, kind, position, radius, convert(to)} for combat.reactObject (DESIGN §4.5 step 2).
import * as THREE from 'three';
import { elColor } from '../core/elements.js';
import { uTime, makeGroundDisc, conformDisc, fresnelMat, tornadoMat, tornadoGeo } from './assets.js';

const OPTIONAL_FX = new Set(['groundDecal', 'runeCircle', 'flashSprite', 'dome', 'debris']);

// pattern ids of the surface shader
const PAT = { liquid: 0, mist: 1, holy: 2, vines: 3, sand: 4, spiral: 5, lane: 6 };
/** Per-type look + rules. names are player-facing (Korean). */
export const ZONE_TYPES = {
  mud:        { nameKo: '진흙탕',   pat: PAT.sand,   cols: [0x8a6a3a, 0x5a4022, 0x3a2a16], alpha: 0.85, el: 'earth', every: 0.5, kind: 'mud' },
  holy:       { nameKo: '성역',     pat: PAT.holy,   cols: [0xffffff, 0xffe9a8, 0xffc24a], alpha: 0.75, el: 'light', every: 0.5, kind: 'holy', additive: true },
  miasma:     { nameKo: '저주의 안개', pat: PAT.mist, cols: [0xb14bff, 0x5b2a8a, 0x1a0b2e], alpha: 0.7, el: 'shadow', every: 0.5, kind: 'miasma' },
  spore:      { nameKo: '포자 구름', pat: PAT.mist,   cols: [0xe8ffb0, 0x9be86a, 0x3f7d2a], alpha: 0.6, el: 'nature', every: 0.5, kind: 'spore' },
  overgrowth: { nameKo: '덩굴밭',   pat: PAT.vines,  cols: [0xc8ff6a, 0x5fae3a, 0x1f4d1a], alpha: 0.85, el: 'nature', every: 0.5, kind: 'overgrowth' },
  flood:      { nameKo: '대홍수',   pat: PAT.liquid, cols: [0xffffff, 0x7fd3ff, 0x1f6fb8], alpha: 0.7, el: 'water', every: 0.5, kind: 'water' },
  spring:     { nameKo: '치유의 샘', pat: PAT.liquid, cols: [0xffffff, 0x9ff0ff, 0x2f9fd8], alpha: 0.75, el: 'water', every: 0.5, kind: 'water', additive: true },
  sand:       { nameKo: '모래 폭풍', pat: PAT.sand,  cols: [0xfff1d6, 0xe8cf9a, 0xb8925a], alpha: 0.6, el: 'earth', every: 0.5, kind: 'sand' },
  steam:      { nameKo: '증기',     pat: PAT.mist,   cols: [0xffffff, 0xdde6ee, 0x9aa8b4], alpha: 0.5, el: 'water', every: 0.5, kind: 'steam' },
  whirl:      { nameKo: '물살 감옥', pat: PAT.spiral, cols: [0xffffff, 0x7fd3ff, 0x1f5f9a], alpha: 0.75, el: 'water', every: 0.5, kind: 'water' },
  rain:       { nameKo: '정화의 비', pat: PAT.liquid, cols: [0xe8f6ff, 0x7fd3ff, 0x3a8ad0], alpha: 0.45, el: 'water', every: 0.5, kind: 'rain' },
  roots:      { nameKo: '덩굴 속박', pat: PAT.vines, cols: [0xd8ff9a, 0x6fcf4a, 0x2f5d22], alpha: 0.9, el: 'nature', every: 0.5, kind: 'roots' },
  blackhole:  { nameKo: '어둠의 심연', pat: PAT.spiral, cols: [0xb14bff, 0x5b2a8a, 0x07020f], alpha: 0.9, el: 'shadow', every: 0.25, kind: 'blackhole' },
  updraft:    { nameKo: '바람 기둥', pat: PAT.spiral, cols: [0xffffff, 0xc8ffe9, 0x5fd6b0], alpha: 0.55, el: 'wind', every: 0.5, kind: 'updraft', additive: true },
  lane:       { nameKo: '길',       pat: PAT.lane,   cols: [0xffffff, 0x9fe8ff, 0x2f7bd6], alpha: 0.7, el: 'ice', every: 0.5, kind: 'lane' },
  grove:      { nameKo: '가시 숲',   pat: PAT.vines, cols: [0xb8f070, 0x3f8a2a, 0x16330f], alpha: 0.9, el: 'nature', every: 0.5, kind: 'grove' },
};
const LANE_COLS = { ice: [0xffffff, 0x9fe8ff, 0x2f7bd6], wind: [0xffffff, 0xc8ffe9, 0x5fd6b0], frost: [0xffffff, 0xbff4ff, 0x5aaee8] };
const MAX_ZONES = 16, DISCS = 14, LANES = 4, HOLES = 3, DRAFTS = 2;

const SURFACE_FRAG = /* glsl */`
  uniform float time, fade, seed, radius, pattern, alpha, lane; uniform vec3 colA, colB, colC; varying vec2 vP;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
  void main(){
    vec2 p = vP * radius * 0.5 + seed;
    float d = lane > 0.5 ? abs(vP.x) : length(vP);
    float wob = fbm(vP*3.0 + seed) * 0.16;
    float edge = 1.0 - smoothstep(0.7 - wob, 1.0 - wob, d);
    if (lane > 0.5) edge *= 1.0 - smoothstep(0.86, 1.0, abs(vP.y));
    if (edge <= 0.002) discard;
    float k = 0.0; vec3 col;
    if (pattern < 0.5) {            // liquid: ripples + caustics
      float r = length(vP);
      float rip = sin(r*radius*2.2 - time*3.5)*0.5+0.5;
      float n = fbm(p*1.3 + vec2(time*0.25, -time*0.18));
      k = n*0.6 + rip*0.35;
      col = mix(colC, colB, k); col = mix(col, colA, smoothstep(0.72, 0.95, n + rip*0.25));
    } else if (pattern < 1.5) {     // mist: drifting cloud
      float n = fbm(p*0.9 + vec2(time*0.2, time*0.13)) + fbm(p*2.1 - time*0.3)*0.5;
      k = smoothstep(0.35, 1.2, n);
      col = mix(colC, colB, k); col = mix(col, colA, smoothstep(0.95, 1.35, n));
      edge *= 0.55 + 0.45*k;
    } else if (pattern < 2.5) {     // holy: rune rings + rays
      float r = length(vP), a = atan(vP.y, vP.x);
      float ring = smoothstep(0.03, 0.0, abs(r - 0.82)) + smoothstep(0.02, 0.0, abs(r - 0.62)) * 0.8;
      float runes = step(0.5, fract(a*6.0/6.2831 + time*0.05)) * smoothstep(0.05, 0.0, abs(r - 0.72)) * step(0.4, hash(floor(vec2(a*10.0, 1.0))));
      float rays = pow(abs(sin(a*8.0 + time*0.6)), 18.0) * (1.0 - r);
      k = clamp(ring + runes + rays*0.8 + (1.0 - r)*0.25, 0.0, 1.0);
      col = mix(colC, colB, k); col = mix(col, colA, smoothstep(0.6, 1.0, k));
      edge *= 0.35 + 0.65*k;
    } else if (pattern < 3.5) {     // vines: noisy veins
      float n = fbm(p*1.6);
      float vein = smoothstep(0.06, 0.0, abs(fract(n*5.0 + time*0.05) - 0.5) - 0.2);
      float leaf = step(0.82, hash(floor(p*2.5)));
      k = clamp(vein*0.8 + leaf*0.5 + n*0.3, 0.0, 1.0);
      col = mix(colC, colB, k); col = mix(col, colA, leaf*0.6);
    } else if (pattern < 4.5) {     // sand / mud: streaks + cracks
      float n = fbm(vec2(p.x*0.6 + time*0.6, p.y*2.2));
      float crack = smoothstep(0.03, 0.0, abs(fbm(p*1.1) - 0.5));
      k = n;
      col = mix(colC, colB, n); col = mix(col, colA, crack*0.7);
    } else if (pattern < 5.5) {     // spiral (blackhole / updraft base)
      float r = length(vP), a = atan(vP.y, vP.x);
      float sp = sin(a*3.0 + r*12.0 - time*6.0)*0.5+0.5;
      k = sp * (1.0 - r*0.4);
      col = mix(colC, colB, sp); col = mix(col, colA, smoothstep(0.85, 1.0, sp) * r);
      if (r < 0.28) col = mix(colC, col, smoothstep(0.1, 0.28, r));
    } else {                        // lane: flowing lines
      float l = fract(vP.y * radius * 0.35 - time * 0.9 + hash(floor(vec2(vP.x*6.0, 0.0))) );
      float line = smoothstep(0.0, 0.08, l) * (1.0 - smoothstep(0.12, 0.5, l));
      float n = fbm(p*1.5);
      k = clamp(line + n*0.4, 0.0, 1.0);
      col = mix(colC, colB, n); col = mix(col, colA, line);
    }
    float a = edge * alpha * fade;
    gl_FragColor = vec4(col * (0.8 + 0.5*k) * fade, a);
  }`;

function surfaceMat(additive) {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: uTime, fade: { value: 1 }, seed: { value: 0 }, radius: { value: 3 }, pattern: { value: 0 }, alpha: { value: 0.8 }, lane: { value: 0 },
      colA: { value: new THREE.Color(0xffffff) }, colB: { value: new THREE.Color(0x888888) }, colC: { value: new THREE.Color(0x222222) },
    },
    vertexShader: /* glsl */`varying vec2 vP; uniform float radius, lane;
      void main(){ vP = lane > 0.5 ? uv * 2.0 - 1.0 : position.xz / radius; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: SURFACE_FRAG,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
}

/** Lane strip: PlaneGeometry along local +Z, conformed per spawn. */
function laneGeo() {
  const g = new THREE.PlaneGeometry(1, 1, 3, 16);
  g.rotateX(-Math.PI / 2);
  g.userData.base = Float32Array.from(g.attributes.position.array);
  return g;
}

export function createZones2(S) {
  const { game } = S;
  const E = game.events;
  // effectQuality 'low' drops the secondary visuals (decals, rune circles, flares, domes, debris): ≤ 10 extra calls per cast (§23)
  const fx = (n, ...a) => { if (OPTIONAL_FX.has(n) && game.settings?.values?.effectQuality === 'low') return null; try { return game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  const C = () => game.combat;
  const scene = game.scene;
  const zones = [];
  const near = [];
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), dir = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // ---------- pooled visuals ----------
  const baseMat = { normal: surfaceMat(false), additive: surfaceMat(true) };
  function cloneMat(additive) {
    const m = baseMat[additive ? 'additive' : 'normal'].clone();
    m.uniforms.time = uTime;   // keep the shared time uniform (clone() deep-copies uniforms)
    return m;
  }
  const discPool = [], lanePool = [], holePool = [], draftPool = [];
  const allVis = [];
  for (let i = 0; i < DISCS; i++) {
    for (const add of [false, true]) {
      const m = new THREE.Mesh(makeGroundDisc(16), cloneMat(add));
      m.frustumCulled = false; m.renderOrder = 2; m.visible = false; m.userData.additive = add;
      scene.add(m); discPool.push(m); allVis.push(m);
      if (i >= DISCS / 2) break;   // additive discs: half as many
    }
  }
  for (let i = 0; i < LANES; i++) {
    const m = new THREE.Mesh(laneGeo(), cloneMat(true));
    m.material.uniforms.lane.value = 1;
    m.frustumCulled = false; m.renderOrder = 2; m.visible = false; m.userData.additive = true;
    scene.add(m); lanePool.push(m); allVis.push(m);
  }
  const holeCoreMat = new THREE.MeshBasicMaterial({ color: 0x050008, toneMapped: false });
  const holeCoreGeo = new THREE.SphereGeometry(1, 20, 14), holeShellGeo = new THREE.SphereGeometry(1, 20, 14);
  const holeRingGeo = new THREE.TorusGeometry(1, 0.08, 6, 40);
  for (let i = 0; i < HOLES; i++) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(holeCoreGeo, holeCoreMat);
    const shell = new THREE.Mesh(holeShellGeo, fresnelMat(0xb14bff, { power: 1.6, intensity: 2.2, core: 0.0 }));
    shell.scale.setScalar(1.35);
    const ring = new THREE.Mesh(holeRingGeo, fresnelMat(0xd9a8ff, { power: 0.4, intensity: 2.0, core: 0.6 }));
    ring.rotation.x = Math.PI / 2; ring.scale.setScalar(2.2);
    g.add(core, shell, ring); g.userData = { core, shell, ring };
    g.visible = false; scene.add(g); holePool.push(g); allVis.push(g);
  }
  for (let i = 0; i < DRAFTS; i++) {
    const m = new THREE.Mesh(tornadoGeo(), tornadoMat());
    m.material.uniforms.colA.value.set(0xffffff); m.material.uniforms.colB.value.set(0x7fe0c0); m.material.uniforms.opacity.value = 0.5;
    m.frustumCulled = false; m.visible = false; m.renderOrder = 3;
    scene.add(m); draftPool.push(m); allVis.push(m);
  }
  const takeDisc = (additive) => { for (const m of discPool) if (!m.userData.busy && m.userData.additive === !!additive) { m.userData.busy = true; return m; } return null; };
  const takeFrom = (pool) => { for (const m of pool) if (!m.userData.busy) { m.userData.busy = true; return m; } return null; };
  const give = (m) => { if (!m) return; m.userData.busy = false; m.visible = false; };

  // ---------- spawn ----------
  /** spawn(type, pos, opts): opts = {r|radius, dur|duration, source, hit (template), params, follow (Object3D), dir, len, width, laneKind, onEnd}. */
  function spawn(type, pos, opts = {}) {
    const T = ZONE_TYPES[type]; if (!T || !pos) return null;
    const r = opts.r ?? opts.radius ?? 4;
    const dur = opts.dur ?? opts.duration ?? 6;
    // merge an overlapping same-type ground zone (refresh) instead of stacking
    if (type !== 'blackhole' && type !== 'updraft' && type !== 'lane' && !opts.follow) {
      for (const z of zones) if (z.type === type && z.position.distanceTo(pos) < Math.max(z.radius, r) * 0.6) {
        z.time = Math.max(z.time, dur); z.dur = Math.max(z.dur, z.time); z.radius = Math.max(z.radius, r); return z;
      }
    }
    while (zones.length >= MAX_ZONES) remove(0, false);
    const z = {
      type, kind: T.kind, isZone: true, nameKo: T.nameKo, element: null, // (element unset: avoid the generic 'infusion' table)
      position: new THREE.Vector3(pos.x, S.height(pos.x, pos.z), pos.z), radius: r, dur, time: dur, age: 0,
      tick: 0.05, every: opts.params?.every ?? T.every, source: opts.source ?? 'player', hit: opts.hit || null, params: opts.params || {},
      follow: opts.follow || null, dir: new THREE.Vector3(0, 0, 1), len: opts.len || 0, width: opts.width || 0, laneKind: opts.laneKind || 'ice',
      onEnd: opts.onEnd || null, vis: null, extra: null, extra2: null, fxT: 0, seen: null, alive: true, waves: 0, waveT: 0, draft: null, emitter: null,
      vel: new THREE.Vector3(), target: opts.target ? opts.target.clone() : null, convert: null,
    };
    z.pos = z.position;
    if (opts.dir) { z.dir.copy(opts.dir).setY(0); if (z.dir.lengthSq() < 1e-6) z.dir.set(0, 0, 1); z.dir.normalize(); }
    z.convert = (to) => convert(z, to);
    // visual
    if (type === 'lane') {
      const m = takeFrom(lanePool);
      if (m) { z.vis = m; setupLane(z); }
    } else {
      const m = takeDisc(!!T.additive);
      if (m) {
        z.vis = m; const u = m.material.uniforms;
        const cols = T.cols;
        u.colA.value.set(cols[0]); u.colB.value.set(cols[1]); u.colC.value.set(cols[2]);
        u.pattern.value = T.pat; u.alpha.value = T.alpha; u.radius.value = r; u.seed.value = Math.random() * 20; u.fade.value = 0;
        conformDisc(m.geometry, game.world, z.position.x, z.position.z, r, 0.1 + zones.length * 0.004);
        m.position.set(z.position.x, 0, z.position.z);
        m.visible = true;
      }
    }
    if (type === 'blackhole') { z.extra = takeFrom(holePool); if (z.extra) { z.extra.visible = true; z.extra.position.copy(z.position).setY(z.position.y + 2.2); z.extra.scale.setScalar(0.01); } }
    if (type === 'updraft') {
      z.extra = takeFrom(draftPool);
      if (z.extra) { z.extra.visible = true; z.extra.position.copy(z.position); const h = (opts.params?.h || 18) / 11; z.extra.scale.set(r / 3.2, h, r / 3.2); }
      try { z.draft = game.world?.addUpdraft?.({ pos: z.position.clone(), r, h: opts.params?.h || 18, strength: opts.params?.updraft?.strength || opts.params?.strength || 14, life: dur }) || null; } catch (_) { z.draft = null; }
    }
    onSpawn(z);
    zones.push(z);
    E.emit('zoneSpawn', { type, point: z.position, radius: r, duration: dur });
    return z;
  }

  function setupLane(z) {
    const m = z.vis, g = m.geometry, base = g.userData.base, p = g.attributes.position;
    const L = z.len || 12, W = z.width || 3;
    const yaw = Math.atan2(z.dir.x, z.dir.z);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (let i = 0; i < p.count; i++) {
      const lx = base[i * 3] * W, lz = (base[i * 3 + 2] + 0.5) * L;
      const wx = z.position.x + lx * cs + lz * sn, wz = z.position.z - lx * sn + lz * cs;
      let h = 0; try { h = game.world?.getHeight?.(wx, wz) ?? 0; } catch (_) { h = 0; }
      // over water the lane sits on the water surface (ice road)
      const wl = game.world?.waterLevel; if (Number.isFinite(wl) && h < wl) h = wl;
      p.setXYZ(i, wx, h + 0.12, wz);
    }
    p.needsUpdate = true; g.computeBoundingSphere();
    m.position.set(0, 0, 0);
    const u = m.material.uniforms, cols = LANE_COLS[z.laneKind] || LANE_COLS.ice;
    u.colA.value.set(cols[0]); u.colB.value.set(cols[1]); u.colC.value.set(cols[2]);
    u.pattern.value = PAT.lane; u.alpha.value = 0.7; u.radius.value = L; u.seed.value = Math.random() * 20; u.fade.value = 0;
    m.visible = true;
  }

  // ---------- helpers ----------
  const src = (z) => (z.source === 'player' ? (game.player?.entity || 'player') : z.source);
  function insideZ(z, pos, extra = 0) {
    if (z.type === 'lane') {
      v.subVectors(pos, z.position); v.y = 0;
      const along = v.dot(z.dir); if (along < -extra || along > z.len + extra) return false;
      const side = Math.abs(v.x * z.dir.z - v.z * z.dir.x);
      return side <= z.width * 0.5 + extra && Math.abs(pos.y - z.position.y) < 4;
    }
    const dx = pos.x - z.position.x, dz = pos.z - z.position.z, r = z.radius + extra;
    return dx * dx + dz * dz <= r * r && pos.y > z.position.y - 3 && pos.y < z.position.y + (z.type === 'updraft' ? (z.params.h || 18) : 6);
  }
  function enemiesIn(z, extra = 0, out = near) {
    out.length = 0;
    const c = C(); if (!c?.queryRadius) return out;
    if (z.type === 'lane') {
      const n = Math.max(1, Math.ceil(z.len / 3));
      const tmp = [];
      for (let i = 0; i <= n; i++) {
        v2.copy(z.position).addScaledVector(z.dir, (i / n) * z.len); v2.y += 1;
        c.queryRadius(v2, z.width * 0.5 + 1 + extra, '!player', tmp);
        for (const e of tmp) if (!out.includes(e) && e.alive && !e.isProp) out.push(e);
      }
      return out;
    }
    v2.copy(z.position); v2.y += 1;
    c.queryRadius(v2, z.radius + extra, '!player', out);
    for (let i = out.length - 1; i >= 0; i--) if (!out[i]?.alive || out[i].isProp) out.splice(i, 1);
    return out;
  }
  function hitT(z, e, amount, extra) {
    const c = C(); if (!c?.dealDamage || !e?.alive) return;
    const h = Object.assign({}, z.hit || {});
    h.amount = amount; h.element = h.element || ZONE_TYPES[z.type].el; h.source = src(z);
    h.point = c.getCenter ? c.getCenter(e, new THREE.Vector3()) : e.object.position.clone();
    h.tier = 'light'; h.tags = ['zone', z.type]; h.zoneTick = true;
    if (extra) Object.assign(h, extra);
    else delete h.status;
    try { c.dealDamage(e, h); } catch (err) { warn('hit', err); }
  }
  function status(e, name, dur, stacks, el, z) {
    const c = C(); if (!c?.applyStatus || !e?.alive) return;
    try { c.applyStatus(e, name, dur, { stacks: stacks || undefined, source: src(z), el }); } catch (_) { /* */ }
  }
  const pl = () => game.player;
  const playerInside = (z) => { const p = pl()?.object?.position; return !!p && pl()?.entity?.alive !== false && insideZ(z, p, 0.2); };
  function healP(amount, id, hot = true) { const c = C(); try { if (c?.healPlayer) return c.healPlayer(amount, id, { hot }); } catch (_) { /* */ } const p = pl(); if (p) { p.hp = Math.min(p.maxHp, p.hp + amount); if (p.entity) p.entity.hp = p.hp; } return amount; }
  function cleanse(list) { const c = C(), e = pl()?.entity; if (!c || !e) return; for (const s of list) { try { c.clearStatus ? c.clearStatus(e, s) : c.removeStatus?.(e, s); } catch (_) { /* */ } } }
  const warned = new Set();
  function warn(k, err) { if (!warned.has(k)) { warned.add(k); console.warn('[spells.zones2]', k, err?.message || err); } }
  const W = () => game.world;

  // ---------- per-type spawn / tick / end ----------
  function onSpawn(z) {
    const p = z.position, R = z.radius;
    v.copy(p); v.y += 0.3;
    switch (z.type) {
      case 'holy':
        fx('runeCircle', p.clone(), { element: 'light', r: R * 0.9, dur: z.dur, rotSpeed: 0.4 });
        fx('burst', v, { count: 40, shape: 'mote', color: [0xffffff, 0xffe08a], disc: true, radius: R * 0.8, up: 3, speed: 0.4, size: 0.2, life: 1.2 });
        try { W()?.surface2?.bless?.(p, R, z.dur); } catch (_) { /* */ }
        break;
      case 'spring':
        fx('burst', v, { count: 50, shape: 'droplet', color: [0xffffff, 0x6fc8ff], disc: true, radius: R * 0.3, speed: 3, up: 6, size: 0.18, life: 0.9, gravity: 10 });
        fx('shockwave', v, { color: 0x9ff0ff, radius: R, duration: 0.6, thickness: 0.3 });
        cleanse(z.params.cleanse || ['burning', 'corroded', 'blight']);
        try { S.terrain.soak(p, R, z.dur); } catch (_) { /* */ }
        break;
      case 'flood':
        fx('shockwave', v, { color: 0x7fd3ff, radius: R, duration: 1.0, thickness: 1.2 });
        fx('burst', v, { count: 80, shape: 'droplet', color: [0xffffff, 0x4fb4ff], disc: true, radius: R * 0.5, speed: 6, up: 5, size: 0.2, life: 1.0, gravity: 9 });
        try { S.terrain.soak(p, R, z.dur); } catch (_) { /* */ }
        if (z.params.rxBonus) floodBonus(true, z.params.rxBonus);
        break;
      case 'mud': try { W()?.surface2?.mud?.(p, R, z.dur); } catch (_) { /* */ } break;
      case 'overgrowth': case 'grove':
        fx('burst', v, { count: 30, shape: 'leaf', color: [0xd8ff9a, 0x4f9e3a], disc: true, radius: R * 0.8, up: 2, speed: 0.6, size: 0.25, life: 1.0, gravity: 3 });
        try { W()?.surface2?.overgrow?.(p, R, z.dur); } catch (_) { /* */ }
        try { W()?.surface?.regrow?.(p, R); } catch (_) { /* */ }
        break;
      case 'miasma': try { W()?.surface2?.curse?.(p, R, z.dur); } catch (_) { /* */ } break;
      case 'roots': rootsBurst(z); break;
      case 'updraft':
        fx('burst', v, { count: 40, shape: 'leaf', color: [0xffffff, 0x8fffc1], disc: true, radius: R * 0.6, tangential: 6, up: 12, speed: 1, size: 0.2, life: 1.2 });
        fx('shockwave', v, { color: 0xc8ffe9, radius: R + 1, duration: 0.5, thickness: 0.3 });
        break;
      case 'lane':
        if (z.laneKind === 'ice') {   // over water: a walkable ice road (surface freeze along the lane)
          for (let i = 0; i <= 4; i++) { v2.copy(p).addScaledVector(z.dir, (i / 4) * z.len); try { S.terrain.chill(v2, z.width * 0.8 + 1); } catch (_) { /* */ } }
        }
        break;
      case 'blackhole':
        fx('runeCircle', p.clone(), { element: 'shadow', r: R * 0.7, dur: z.dur + 0.4, rotSpeed: -2 });
        break;
      default: break;
    }
  }

  function tick(z) {
    const list = z.type === 'rain' || z.type === 'spring' || z.type === 'holy' || z.type === 'updraft' ? enemiesIn(z, 0, near).slice() : enemiesIn(z, 0, near).slice();
    const P = z.params, every = z.every;
    const mx = pl()?.maxHp || 100;
    switch (z.type) {
      case 'mud': for (const e of list) status(e, 'muddy', 1, 0, 'earth', z); break;
      case 'sand': for (const e of list) { status(e, 'dazzled', 1.5, 0, null, z); hitT(z, e, P.tick || 5); } break;
      case 'steam': for (const e of list) { status(e, 'wet', 4, 0, 'water', z); status(e, 'dazzled', 1, 0, null, z); } break;
      case 'miasma': for (const e of list) { status(e, 'corroded', 8, 1, 'shadow', z); status(e, 'hexed', 2, 0, null, z); if (P.tick) hitT(z, e, P.tick); } break;
      case 'spore': {
        const seedEvery = 1 / Math.max(0.1, P.seedPerSec || 1);
        z.seedAcc = (z.seedAcc || 0) + every;
        const seedNow = z.seedAcc >= seedEvery - 1e-3; if (seedNow) z.seedAcc = 0;
        for (const e of list) hitT(z, e, P.tick || 4, seedNow ? { status: { seeded: { stacks: 1 } } } : null);
        if (P.healPct && playerInside(z)) healP(mx * P.healPct * every, 'spore');
        break;
      }
      case 'overgrowth': case 'grove': {
        for (const e of list) {
          status(e, 'muddy', 0.8, 0, null, z);
          const seedEvery = 1 / Math.max(0.1, P.seedPerSec || 1);
          e._grovT = (e._grovT || 0) + every;
          const seedNow = e._grovT >= seedEvery - 1e-3; if (seedNow) e._grovT = 0;
          if (P.tick) hitT(z, e, P.tick * (P.dotMul || 1), seedNow ? { status: { seeded: { stacks: 1 } } } : null);
          if (z.type === 'overgrowth' && P.rootEvery && (z.age % P.rootEvery) < every) status(e, 'rooted', 2, 0, 'nature', z);
        }
        if (playerInside(z)) {
          try { game.stats?.set?.('buff:overgrowth', { moveMul: 1.15 }, { duration: 0.7 }); } catch (_) { /* */ }
          if (P.healPct) healP(mx * P.healPct * every, 'overgrowth');
        }
        break;
      }
      case 'holy': {
        z.radAcc = (z.radAcc || 0) + every;
        const radNow = z.radAcc >= 1 / Math.max(0.1, P.radiantPerSec || 1) - 1e-3; if (radNow) z.radAcc = 0;
        for (const e of list) { if (P.tick) hitT(z, e, P.tick, radNow ? { status: { radiant: { stacks: 1 } } } : null); else if (radNow) status(e, 'radiant', 10, 1, 'light', z); }
        if (playerInside(z)) {
          if (P.healPct) healP(mx * P.healPct * every, 'sanctuary');
          cleanse(P.dispel || ['corroded', 'blight']);
          if (P.regenRateAdd || P.dmgTakenMul) { try { game.stats?.set?.('zone:holy', { regenRateAdd: P.regenRateAdd || 0, dmgTakenMul: P.dmgTakenMul || 1 }, { duration: every + 0.2 }); } catch (_) { /* */ } }
        }
        break;
      }
      case 'spring': {
        for (const e of list) { status(e, 'wet', 8, 0, 'water', z); if (P.hurtsEnemies) hitT(z, e, P.tick || 8); }
        if (playerInside(z)) {
          healP(mx * (P.healPct ?? P.heal ?? 0.05) * every, 'spring');
          if (!z.inside) cleanse(P.cleanse || ['burning', 'corroded', 'blight']);
          z.inside = true;
        } else z.inside = false;
        break;
      }
      case 'rain': {
        for (const e of list) status(e, 'wet', 8, 0, 'water', z);
        z.clT = (z.clT || 0) + every;
        if (z.clT >= (P.cleanseEvery || 1)) { z.clT = 0; cleanse(P.cleanse || ['burning', 'corroded', 'blight', 'muddy']); }
        if (P.healPct) healP(mx * P.healPct * every, 'rain');
        if (P.buff) { try { game.stats?.set?.('buff:water.sup', P.buff, { duration: every + 0.3 }); } catch (_) { /* */ } }
        try { S.terrain.soak(z.position, z.radius, 3); } catch (_) { /* */ }
        break;
      }
      case 'flood': {
        for (const e of list) status(e, 'wet', 8, 0, 'water', z);
        break;
      }
      case 'whirl': {
        for (const e of list) {
          if (!e.isBoss && e.velocity) { v.subVectors(z.position, e.object.position).setY(0); const L = v.length(); if (L > 0.6) { e.velocity.addScaledVector(v.multiplyScalar(1 / L), Math.min(7, 2 + L)); } }
          hitT(z, e, P.tick || 6, { status: { wet: { dur: 8 } }, launch: P.spout ? (P.spout.lift || 2) : 0 });
        }
        break;
      }
      case 'roots': {
        if (P.rootDot) for (const e of list) if (e.statuses?.rooted) hitT(z, e, P.rootDot.dmg || 6);
        break;
      }
      case 'blackhole': {
        for (const e of list) {
          if (e.isBoss || !e.velocity) continue;
          v.subVectors(z.position, e.object.position).setY(0); const L = v.length(); if (L < 0.5) continue;
          e.velocity.addScaledVector(v.multiplyScalar(1 / L), Math.min(9, 2 + L * 1.4));
        }
        if (z.age < 0.3) break;
        for (const e of list) if (z.hit?.status?.corroded) status(e, 'corroded', 8, 1, 'shadow', z);
        break;
      }
      case 'updraft': {
        for (const e of list) {
          const dx = e.object.position.x - z.position.x, dz = e.object.position.z - z.position.z;
          if (dx * dx + dz * dz > 4.2) continue;
          hitT(z, e, P.dmg || 6, { launch: P.lift || 2, status: { airborne: { dur: 1 } } });
        }
        break;
      }
      case 'lane': {
        if (z.laneKind === 'ice' || z.laneKind === 'frost') for (const e of list) { status(e, 'chilled', 3, 1, 'ice', z); if (P.tick) hitT(z, e, P.tick); }
        if (playerInside(z)) {
          const mm = z.laneKind === 'wind' ? (P.moveMul || 1.3) : (P.selfMoveMul || (z.laneKind === 'ice' ? 1.4 : 1));
          if (mm !== 1) { try { game.stats?.set?.('buff:lane', { moveMul: mm }, { duration: every + 0.25 }); } catch (_) { /* */ } }
        }
        break;
      }
      default: break;
    }
  }

  /** Ambient particles (~5 Hz per zone, pooled particles only). */
  function ambient(z) {
    const R = z.radius, p = z.position;
    const rp = () => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R * 0.85; v3.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r); v3.y = S.height(v3.x, v3.z) + 0.2; return v3; };
    switch (z.type) {
      case 'holy': fx('burst', rp(), { count: 2, shape: 'mote', color: [0xffffff, 0xffe08a], speed: 0.3, up: 2.4, size: 0.18, life: 1.2 }); break;
      case 'spring': fx('burst', rp(), { count: 3, shape: 'droplet', color: [0xffffff, 0x7fd3ff], speed: 1, up: 4, size: 0.12, life: 0.7, gravity: 8 }); fx('burst', rp(), { count: 1, shape: 'mote', color: [0xffffff, 0x9ff0ff], speed: 0.2, up: 1.6, size: 0.2, life: 1 }); break;
      case 'flood': fx('burst', rp(), { count: 2, shape: 'droplet', color: [0xffffff, 0x4fb4ff], speed: 1.5, up: 2.5, size: 0.14, life: 0.6, gravity: 8 }); break;
      case 'miasma': fx('burst', rp(), { count: 2, shape: 'smoke', color: [0x5b2a8a, 0x1a0b2e], alpha: 0.45, additive: false, speed: 0.4, up: 0.5, size: 1.4, sizeEnd: 2.6, life: 1.4 }); break;
      case 'spore': fx('burst', rp(), { count: 2, shape: 'puff', color: [0xe8ffb0, 0x7fbf4a], alpha: 0.4, additive: false, speed: 0.4, up: 0.8, size: 1.0, sizeEnd: 2.2, life: 1.4 }); fx('burst', rp(), { count: 2, shape: 'mote', color: [0xf4ffd0, 0x9be86a], speed: 0.5, up: 1, size: 0.1, life: 1 }); break;
      case 'steam': fx('burst', rp(), { count: 2, shape: 'smoke', color: [0xffffff, 0xdde6ee], alpha: 0.4, additive: false, speed: 0.5, up: 1.5, size: 1.2, sizeEnd: 2.8, life: 1.3 }); break;
      case 'sand': fx('burst', rp(), { count: 3, shape: 'dust', color: [0xe8cf9a, 0xb8925a], alpha: 0.4, additive: false, tangential: 5, speed: 1, up: 1, curl: 3, size: 0.7, sizeEnd: 1.6, life: 0.9 }); break;
      case 'mud': fx('burst', rp(), { count: 1, shape: 'dust', color: [0x8a6a3a, 0x5a4022], alpha: 0.5, additive: false, speed: 0.2, up: 0.4, size: 0.4, life: 0.6 }); break;
      case 'overgrowth': case 'grove': fx('burst', rp(), { count: 1, shape: 'leaf', color: [0xc8ff6a, 0x4f9e3a], speed: 0.3, up: 1, size: 0.2, life: 1 }); if (z.type === 'grove') fx('burst', rp(), { count: 2, shape: 'thorn', color: [0xb8f070, 0x2f7d3a], speed: 0.5, up: 3, size: 0.35, sizeEnd: 0.2, life: 0.4, gravity: 6 }); break;
      case 'rain': {
        v2.copy(p); v2.y += 7;
        fx('burst', v2, { count: 1, shape: 'smoke', color: [0x9aa8b4, 0x5a6a7a], alpha: 0.5, additive: false, radius: R * 0.6, speed: 0.3, size: 2.4, sizeEnd: 3.2, life: 1.2 });
        for (let i = 0; i < 3; i++) { const q = rp(); q.y += 6; fx('burst', q, { count: 1, shape: 'streak', color: [0xe8f6ff, 0x7fd3ff], dir: v2.set(0, -1, 0), spread: 0.02, speed: 16, size: 0.12, life: 0.4, velocityStretch: 0.08 }); }
        break;
      }
      case 'whirl': fx('burst', rp(), { count: 3, shape: 'droplet', color: [0xffffff, 0x4fb4ff], tangential: 6, radius: 0, speed: 0.5, up: z.params.spout ? 6 : 1.5, size: 0.14, life: 0.6, gravity: 5 }); break;
      case 'blackhole': fx('burst', v2.copy(z.position).setY(z.position.y + 2.2), { count: 6, shape: 'wisp', color: [0xb14bff, 0x2a0b4e], radius: R, inward: true, speed: R * 1.8, size: 0.35, sizeEnd: 0.05, life: 0.45 }); break;
      case 'updraft': fx('burst', rp(), { count: 2, shape: 'leaf', color: [0xffffff, 0x8fffc1], tangential: 5, speed: 0.5, up: 10, size: 0.16, life: 1.2 }); break;
      case 'lane': {
        v2.copy(p).addScaledVector(z.dir, Math.random() * z.len); v2.y = S.height(v2.x, v2.z) + 0.3;
        fx('burst', v2, { count: 2, shape: z.laneKind === 'wind' ? 'leaf' : 'snow', color: z.laneKind === 'wind' ? [0xffffff, 0x8fffc1] : [0xffffff, 0x9fe8ff], dir: z.dir, spread: 0.2, speed: z.laneKind === 'wind' ? 8 : 1, size: 0.16, life: 0.6 });
        break;
      }
      default: break;
    }
  }

  function rootsBurst(z) {
    const P = z.params, p = z.position, R = z.radius;
    fx('groundDecal', 'flowers', p.clone(), R, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3, rr = R * (0.3 + Math.random() * 0.65);
      v.set(p.x + Math.cos(a) * rr, 0, p.z + Math.sin(a) * rr); v.y = S.height(v.x, v.z);
      fx('burst', v, { count: 6, shape: 'thorn', color: [0xd8ff9a, 0x2f7d3a], dir: UP, spread: 0.25, speed: 7, size: 0.45, sizeEnd: 0.2, life: 0.45, gravity: 14 });
    }
    fx('shockwave', v.copy(p).setY(p.y + 0.2), { color: 0x6fcf4a, radius: R, duration: 0.45, thickness: 0.4 });
    try { S.props?.pillars?.spawn && null; } catch (_) { /* */ }
    for (const e of enemiesIn(z, 0, near).slice()) {
      const st = Object.assign({}, z.hit?.status || { rooted: { dur: 2 }, seeded: { stacks: 2 } });
      hitT(z, e, z.hit?.amount ?? P.dmg ?? 8, { status: st, tier: z.hit?.tier || 'heavy' });
      if (e.isBoss && P.bossBreak) { try { C()?.addBreak?.(e, P.bossBreak); } catch (_) { /* */ } }
    }
    if (P.overgrowth) S.later(0.1, () => spawn('overgrowth', p, { r: P.overgrowth.r || 5, dur: P.overgrowth.dur || 10, source: z.source, hit: z.hit, params: {} }));
    S.sfx('cast_nature', { position: p, pitch: 0.8 });
  }

  // flood: lightning + ice reactions +40% while it lasts
  let floodN = 0;
  function floodBonus(on, bonus) {
    floodN += on ? 1 : -1; if (floodN < 0) floodN = 0;
    const st = game.stats; if (!st?.set) return;
    if (floodN > 0 && on) {
      const mods = {};
      try {
        for (const r of game.combat?.REACTION_DEFS || []) {
          const els = r.elements || [];
          for (const el in bonus) if (els.includes(el)) { mods['rx_' + r.id] = Math.max(mods['rx_' + r.id] || 1, bonus[el]); }
        }
      } catch (_) { /* */ }
      try { st.set('zone:flood', mods, { duration: 30 }); } catch (_) { /* */ }
    } else if (floodN === 0) { try { st.clear('zone:flood'); } catch (_) { /* */ } }
  }

  function remove(i, natural = true) {
    const z = zones[i]; if (!z) return;
    zones.splice(i, 1);
    z.alive = false;
    if (natural) end(z);
    give(z.vis); z.vis = null;
    if (z.extra) { give(z.extra); z.extra = null; }
    if (z.draft) { try { game.world?.removeUpdraft?.(z.draft); } catch (_) { /* */ } z.draft = null; }
    if (z.type === 'flood' && z.params.rxBonus) floodBonus(false);
    try { z.onEnd?.(z); } catch (err) { warn('onEnd', err); }
    E.emit('zoneEnd', { type: z.type, point: z.position });
  }
  function end(z) {
    const P = z.params;
    if (z.type === 'blackhole') {
      const imp = P.implode || { dmg: P.dmg || 150, r: z.radius };
      v.copy(z.position); v.y += 1.5;
      fx('preset', 'explosion_shadow', v, { scale: 1.6 });
      fx('shockwave', v, { color: 0xb14bff, radius: (imp.r || z.radius) + 2, duration: 0.6, thickness: 1.2 });
      fx('burst', v, { count: 70, shape: 'wisp', color: [0xe0c8ff, 0x5b2a8a], speed: 14, spread: 1, size: 0.4, sizeEnd: 0.05, life: 0.8, drag: 2 });
      fx('groundDecal', 'violet', z.position.clone(), imp.r || z.radius, 8);
      fx('shake', 0.5);
      S.sfx('explode_shadow', { position: v });
      for (const e of enemiesIn(z, (imp.r || z.radius) - z.radius, near).slice()) hitT(z, e, imp.dmg, { status: z.hit?.status, tier: 'ult', knockback: 6, launch: 2 });
    } else if (z.type === 'whirl') {
      if (P.endBurst) {
        v.copy(z.position); v.y += 0.6;
        fx('preset', 'explosion_water', v, { scale: 1.2 });
        for (const e of enemiesIn(z, (P.endBurst.r || z.radius) - z.radius, near).slice()) hitT(z, e, P.endBurst.dmg || 50, { status: { wet: { dur: 8 } }, tier: 'heavy', knockback: 5 });
      }
      try { S.legacyZones?.spawn?.('water', z.position, { radius: P.puddle?.r || 3, duration: P.puddle?.dur || 8 }); } catch (_) { /* */ }
    } else if (z.type === 'flood') {
      fx('shockwave', z.position.clone().setY(z.position.y + 0.3), { color: 0x7fd3ff, radius: z.radius, duration: 0.7, thickness: 0.6 });
    } else if (z.type === 'spore' && P.endBurst) {
      for (const e of enemiesIn(z, 0, near).slice()) hitT(z, e, P.endBurst.dmg || 40);
    } else if (z.type === 'grove' && P.bloomEnd) {
      healP((pl()?.maxHp || 100) * (P.bloomEnd.healPct || 0.1), 'bloom', false);
      for (let i = 0; i < (P.bloomEnd.pods || 2); i++) { const a = i * 3.1; v.set(z.position.x + Math.cos(a) * 2, 0, z.position.z + Math.sin(a) * 2); S.objects?.spawn?.('pod', v, { source: z.source }); }
      fx('burst', z.position.clone().setY(z.position.y + 0.5), { count: 40, shape: 'petal', color: [0xffd6f0, 0x9be86a], disc: true, radius: 1, speed: z.radius, up: 2, size: 0.25, life: 0.9, drag: 2 });
    } else if (z.type === 'holy' && P.endJudgment) {
      for (const e of enemiesIn(z, 0, near).slice()) {
        if ((e.statuses?.radiant?.stacks || 0) >= P.endJudgment) { try { C()?.dealDamage?.(e, { amount: 1, element: 'light', source: src(z), heavy: true, tier: 'heavy', tags: ['heavy', 'judgment'], point: e.object.position.clone() }); } catch (_) { /* */ } }
      }
    }
  }

  /** combat.reactObject → zone.convert(to): 'water' | 'ice' | 'spring' | 'none' | 'obsidian' … */
  function convert(z, to) {
    const i = zones.indexOf(z); if (i < 0) return null;
    const p = z.position.clone(), r = z.radius;
    remove(i, false);
    if (!to || to === 'none') return null;
    if (ZONE_TYPES[to]) return spawn(to, p, { r, dur: 8, source: z.source });
    return S.legacyZones?.spawn?.(to, p, { radius: r, duration: 8 }) || null;
  }

  /** An element touches the zones around point (skill hits, projectile impacts). Zone-owned twists + combat fusions. */
  function elementAt(point, r, el, hit) {
    let n = 0;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]; if (!z || !insideZ(z, point, r)) continue;
      if ((z.rxT || 0) > game.time) continue;
      const P = z.params;
      if ((z.type === 'spore' || z.type === 'grove' || z.type === 'overgrowth') && el === 'fire') {
        const fl = P.flammable || { dmg: z.type === 'grove' ? 150 : z.type === 'spore' ? 60 : 40, r: z.radius };
        wildfire(z, fl); n++; continue;
      }
      if (z.type === 'steam' && el === 'shadow') { try { C()?.reactObject?.(z, el, hit || { source: 'player', element: el }); } catch (_) { /* */ } z.rxT = game.time + 0.5; n++; continue; }
      if (z.kind === 'water' && (el === 'lightning' || el === 'ice' || el === 'light' || el === 'earth')) {
        z.rxT = game.time + 0.6;
        try { C()?.reactObject?.(z, el, hit || { source: 'player', element: el, amount: 0 }); } catch (err) { warn('reactObject', err); }
        if (el === 'lightning') electrify(z);
        n++; continue;
      }
      if (z.type === 'mud' && el === 'fire') { z.rxT = game.time + 1; try { W()?.surface2?.rubble?.(z.position, z.radius, 6); } catch (_) { /* */ } remove(zones.indexOf(z), false); n++; continue; }
      if (z.type === 'holy' && el === 'shadow') { z.time = Math.min(z.time, 1); n++; continue; }
    }
    return n;
  }
  function wildfire(z, fl) {
    z.rxT = game.time + 2;
    const p = v.copy(z.position); p.y += 0.6;
    fx('preset', 'explosion_fire', p, { scale: Math.min(2, (fl.r || z.radius) / 3) });
    fx('burst', p, { count: 60, shape: 'ember', color: [0xffe080, 0xff3a00], disc: true, radius: 0.5, speed: (fl.r || z.radius) * 1.6, up: 3, size: 0.3, life: 0.9, drag: 1.5 });
    fx('shockwave', p, { color: 0xff8a1f, radius: (fl.r || z.radius) + 1, duration: 0.5, thickness: 1 });
    S.sfx('explode_fire', { position: p });
    for (const e of enemiesIn(z, (fl.r || z.radius) - z.radius, near).slice()) hitT(z, e, fl.dmg || 60, { element: 'fire', status: { burning: { dur: 4 } }, tier: 'heavy', tags: ['wildfire'] });
    try { S.terrain.ignite(z.position, z.radius + 1, 1); } catch (_) { /* */ }
    try { C()?.discover?.('wildfire'); } catch (_) { /* */ }
    E.emit('zoneCombo', { id: 'wildfire', name: '들불', point: z.position.clone() });
    const at = z.position.clone(), rr = z.radius;
    remove(zones.indexOf(z), false);
    try { S.legacyZones?.spawn?.('fire', at, { radius: Math.min(6, rr), duration: 4 }); } catch (_) { /* */ }
  }
  /** Lightning in flood/spring water: everyone inside is shocked (rate-limited; the electro_water reaction adds the burst). */
  function electrify(z) {
    if ((z.zapT || 0) > game.time) return;
    z.zapT = game.time + 0.8;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * 6.28, b = Math.random() * 6.28, r1 = Math.random() * z.radius * 0.8, r2 = Math.random() * z.radius * 0.8;
      v.set(z.position.x + Math.cos(a) * r1, z.position.y + 0.25, z.position.z + Math.sin(a) * r1);
      v2.set(z.position.x + Math.cos(b) * r2, z.position.y + 0.25, z.position.z + Math.sin(b) * r2);
      fx('beam', v.clone(), v2.clone(), { color: elColor('lightning'), width: 0.12, duration: 0.3, jagged: 0.5, segments: 10, branches: 1 });
    }
    for (const e of enemiesIn(z, 0.5, near).slice()) hitT(z, e, 10, { element: 'lightning', status: { shocked: { dur: 3 } }, noReaction: true, tags: ['fusion'] });
  }
  function chargeWater(pos, r) { for (const z of zones) if (z.kind === 'water' && z.position.distanceTo(pos) < r + z.radius) electrify(z); }

  // ---------- per-frame ----------
  function update(dt) {
    const pp = pl()?.object?.position;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.age += dt; z.time -= dt;
      if (z.time <= 0) { remove(i); continue; }
      // follow / travel
      if (z.follow && z.follow.position) {
        const f = z.follow.position;
        z.position.x += (f.x - z.position.x) * Math.min(1, dt * 6); z.position.z += (f.z - z.position.z) * Math.min(1, dt * 6);
        z.position.y = S.height(z.position.x, z.position.z);
      } else if (z.params.wander) {
        z.position.x += Math.sin(z.age * 1.3 + z.radius) * dt * 1.2; z.position.z += Math.cos(z.age * 1.1) * dt * 1.2; z.position.y = S.height(z.position.x, z.position.z);
      }
      const fade = Math.min(1, z.age / 0.3) * Math.min(1, z.time / 0.6);
      const m = z.vis;
      if (m) {
        m.material.uniforms.fade.value = fade;
        if ((z.follow || z.params.wander) && z.type !== 'lane') {
          z.reconT = (z.reconT || 0) - dt;
          if (z.reconT <= 0) { z.reconT = 0.2; conformDisc(m.geometry, game.world, z.position.x, z.position.z, z.radius, 0.1); }
          m.position.set(z.position.x, 0, z.position.z);
        }
      }
      if (z.type === 'blackhole' && z.extra) {
        const u = z.extra.userData, k = Math.min(1, z.age / 0.4), shrink = z.time < 0.3 ? z.time / 0.3 : 1;
        const s = Math.max(0.01, (0.9 + Math.sin(z.age * 14) * 0.06) * k * shrink * (z.radius / 8) * 1.6);
        z.extra.scale.setScalar(s);
        u.ring.rotation.z += dt * 4; u.ring.rotation.x = Math.PI / 2 + Math.sin(z.age * 2) * 0.25;
        z.extra.position.set(z.position.x, z.position.y + 2.2, z.position.z);
      }
      if (z.type === 'updraft' && z.extra) z.extra.material.uniforms.opacity.value = 0.5 * fade;
      // flood waves
      if (z.type === 'flood' && z.params.waves) {
        z.waveT -= dt;
        if (z.waveT <= 0 && z.waves < z.params.waves) {
          z.waveT = z.params.every || 3; z.waves++;
          v.copy(z.position); v.y += 0.4;
          fx('shockwave', v, { color: 0xbfeaff, radius: z.radius, duration: 1.1, thickness: 1.4 });
          fx('burst', v, { count: 60, shape: 'droplet', color: [0xffffff, 0x4fb4ff], disc: true, radius: z.radius * 0.4, speed: z.radius * 0.9, up: 3, size: 0.22, life: 0.9, gravity: 8 });
          S.sfx('explode_water', { position: v, volume: 0.7 });
          for (const e of enemiesIn(z, 0, near).slice()) hitT(z, e, z.params.dmg || 40, { status: { wet: { dur: 8 } }, knockback: 4, tier: 'heavy' });
        }
      }
      z.fxT -= dt;
      if (z.fxT <= 0) { z.fxT = z.type === 'blackhole' ? 0.08 : 0.2; ambient(z); }
      z.tick -= dt;
      if (z.tick <= 0) { z.tick += z.every; try { tick(z); } catch (err) { warn('tick:' + z.type, err); } }
    }
    void pp;
  }

  function isInside(type, pos) { for (const z of zones) if ((z.type === type || z.kind === type) && insideZ(z, pos)) return true; return false; }
  function clear() { while (zones.length) remove(zones.length - 1, false); }
  function count(type) { let n = 0; for (const z of zones) if (!type || z.type === type) n++; return n; }
  /** Boot pre-warm: pooled meshes are in the scene; make them visible for the compile (update keeps idle ones hidden). */
  function prewarm() { for (const m of allVis) m.visible = true; return null; }
  function afterPrewarm() { for (const m of allVis) if (!m.userData.busy) m.visible = false; }

  return { spawn, update, isInside, insideZ, elementAt, chargeWater, electrify, clear, count, zones, prewarm, afterPrewarm, TYPES: ZONE_TYPES, remove: (z) => remove(zones.indexOf(z), false) };
}
