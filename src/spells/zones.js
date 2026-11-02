// Persistent spell zones (fire field, ice field, lava pool, water puddle, storm cloud, tornado)
// and zone fusions ("combining spells").
import * as THREE from 'three';
import { ELEMENT_COLORS } from '../core/utils.js';
import {
  groundMat, makeGroundDisc, conformDisc, flameGeo, flameMat, crystalGeo, iceMatSolid, outlineBasic,
  tornadoGeo, tornadoMat, rainMat, toonMat,
} from './assets.js';

const NAMES = { fire: '화염 지대', ice: '얼음 지대', lava: '용암 지대', water: '물웅덩이', storm: '뇌우', tornado: '대회오리' };
const LIFT = { fire: 0.12, ice: 0.22, lava: 0.3, water: 0.3, storm: 0.3, tornado: 0.1 };
const WHITE = new THREE.Color(0xffffff);
const TORNADO_COLORS = {
  wind: [0xeafff6, 0x5fa890], fire: [0xffd060, 0xe8360a], ice: [0xffffff, 0x5aaee8], lightning: [0xf3e8ff, 0x7a4ae0],
};

export function createZones(S) {
  const { game } = S;
  const scene = game.scene;
  const zones = [];
  const pools = {};
  const near = [];
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), eu = new THREE.Euler();
  const UP = new THREE.Vector3(0, 1, 0);

  // ---------- visuals ----------
  function makeVisual(type) {
    const g = new THREE.Group();
    const parts = { group: g };
    if (type !== 'tornado') {
      const kind = type === 'storm' ? 'water' : type;
      const disc = new THREE.Mesh(makeGroundDisc(type === 'storm' ? 20 : 18), groundMat(kind));
      disc.renderOrder = 2; disc.frustumCulled = false;
      g.add(disc); parts.disc = disc;
    }
    if (type === 'fire' || type === 'lava') {
      const n = type === 'fire' ? 26 : 10;
      const fl = new THREE.InstancedMesh(flameGeo(), flameMat(), n);
      fl.frustumCulled = false; fl.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(fl); parts.flames = fl;
      parts.flameData = Array.from({ length: n }, () => ({ a: Math.random() * 6.28, r: Math.sqrt(Math.random()), s: 0.6 + Math.random() * 0.9, ph: Math.random() * 10 }));
    }
    if (type === 'ice') {
      const n = 16;
      const cr = new THREE.InstancedMesh(crystalGeo(), iceMatSolid(), n);
      const ol = new THREE.InstancedMesh(crystalGeo(), outlineBasic(0x1d4a66), n);
      cr.castShadow = true; cr.frustumCulled = ol.frustumCulled = false;
      g.add(cr, ol); parts.crystals = cr; parts.crystalOutline = ol;
      parts.crystalData = Array.from({ length: n }, () => ({ a: Math.random() * 6.28, r: 0.25 + Math.sqrt(Math.random()) * 0.7, s: 0.6 + Math.random() * 1.1, tx: (Math.random() - 0.5) * 0.7, tz: (Math.random() - 0.5) * 0.7, yaw: Math.random() * 6 }));
    }
    if (type === 'storm') {
      const n = 18;
      const puffGeo = new THREE.IcosahedronGeometry(1, 3);
      // lighter top, violet-charged underside (vertex colors)
      { const pos = puffGeo.attributes.position, col = new Float32Array(pos.count * 3), top = new THREE.Color(0x9aa0c4), bot = new THREE.Color(0x585a86), tc = new THREE.Color();
        for (let i = 0; i < pos.count; i++) { tc.copy(bot).lerp(top, THREE.MathUtils.smoothstep(pos.getY(i), -0.7, 0.8)); col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; }
        puffGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
      const cloudMat = toonMat(0xffffff, { vertexColors: true, emissive: 0x4a2a80, emissiveIntensity: 0.25 });
      const cloud = new THREE.InstancedMesh(puffGeo, cloudMat, n);
      parts.cloudMat = cloudMat; parts.flick = 0;
      // single soft silhouette: one shell per puff would show between lobes, so the outline is hidden
      const ol = new THREE.InstancedMesh(puffGeo, outlineBasic(0x2a2744), n);
      ol.visible = false;
      cloud.frustumCulled = ol.frustumCulled = false;
      parts.cloudData = Array.from({ length: n }, (_, i) => { const a = (i / n) * 6.28 + Math.random(); const r = Math.sqrt(Math.random()); return { a, r, s: 1.6 + Math.random() * 1.8, y: (Math.random() - 0.5) * 1.4, ph: Math.random() * 6 }; });
      const drops = 280;
      const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), rainMat(), drops);
      rain.frustumCulled = false;
      for (let i = 0; i < drops; i++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random());
        m4.makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r); // scaled by radius at spawn
        rain.setMatrixAt(i, m4);
      }
      rain.userData.base = Float32Array.from(rain.instanceMatrix.array);
      g.add(cloud, ol, rain); parts.cloud = cloud; parts.cloudOutline = ol; parts.rain = rain;
    }
    if (type === 'tornado') {
      const mat1 = tornadoMat(), mat2 = tornadoMat();
      const outer = new THREE.Mesh(tornadoGeo(), mat1);
      const inner = new THREE.Mesh(tornadoGeo(), mat2);
      inner.scale.set(0.62, 0.95, 0.62);
      mat2.uniforms.speed.value = 1.6;
      const base = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 32), tornadoMat());
      base.rotation.x = Math.PI / 2; base.position.y = 0.3; base.scale.set(2.2, 2.2, 1);
      outer.renderOrder = inner.renderOrder = 6;
      // opaque toon-shaded core gives the funnel a readable body against the sky
      const core = new THREE.Mesh(tornadoGeo(), toonMat(0x9cc8b4, { emissive: 0x2a5a48, emissiveIntensity: 0.2 }));
      core.castShadow = true;
      g.add(outer, inner, base, core); parts.outer = outer; parts.inner = inner; parts.base = base; parts.core = core;
      parts.mats = [mat1, mat2, base.material];
    }
    return parts;
  }
  function takeVisual(type) {
    const p = (pools[type] || (pools[type] = [])).pop() || makeVisual(type);
    scene.add(p.group); p.group.visible = true;
    return p;
  }
  function giveVisual(type, p) { scene.remove(p.group); pools[type].push(p); }

  // ---------- spawn ----------
  function spawn(type, pos, o = {}) {
    if (!NAMES[type]) return null;
    // merge into overlapping same-type ground zone instead of stacking
    if (type !== 'tornado' && type !== 'storm') {
      for (const z of zones) if (z.type === type && z.pos.distanceTo(pos) < z.radius * 0.6) {
        z.time = Math.max(z.time, o.duration ?? 6); z.duration = Math.max(z.duration, z.time); return z;
      }
    }
    while (zones.length >= 18) remove(0);
    const z = {
      type, name: NAMES[type], pos: new THREE.Vector3(pos.x, S.height(pos.x, pos.z), pos.z),
      radius: o.radius ?? 4, duration: o.duration ?? 6, time: o.duration ?? 6, age: 0,
      tick: 0, strikeT: 0.3, zapT: 0, comboT: 0, infusion: null, target: o.target ? o.target.clone() : null,
      speed: o.speed ?? 5, vis: takeVisual(type), seen: new Set(), height: type === 'storm' ? 16 : type === 'tornado' ? 11 : 2.4,
      fade: 0, burstT: 0, onEnd: o.onEnd || null,
    };
    setupVisual(z);
    zones.push(z);
    return z;
  }

  function setupVisual(z) {
    const p = z.vis, R = z.radius;
    if (p.disc) {
      conformDisc(p.disc.geometry, game.world, z.pos.x, z.pos.z, z.type === 'storm' ? R * 0.9 : R, LIFT[z.type] + Math.random() * 0.02);
      p.disc.position.set(z.pos.x, 0, z.pos.z);
      p.disc.material.uniforms.radius.value = z.type === 'storm' ? R * 0.9 : R;
      p.disc.material.uniforms.seed.value = Math.random() * 20;
    }
    if (p.crystals) {
      const d = p.crystalData;
      for (let i = 0; i < d.length; i++) {
        const c = d[i];
        const x = z.pos.x + Math.cos(c.a) * c.r * R * 0.85, zz = z.pos.z + Math.sin(c.a) * c.r * R * 0.85;
        c.x = x; c.z = zz; c.y = S.height(x, zz) - 0.15;
      }
    }
    if (p.flames) {
      for (const f of p.flameData) {
        f.x = z.pos.x + Math.cos(f.a) * f.r * R * 0.85; f.z = z.pos.z + Math.sin(f.a) * f.r * R * 0.85; f.y = S.height(f.x, f.z);
      }
    }
    if (p.rain) {
      const base = p.rain.userData.base, arr = p.rain.instanceMatrix.array;
      for (let i = 0; i < arr.length; i += 16) {
        arr.set(base.subarray(i, i + 16), i);
        arr[i + 12] = base[i + 12] * R; arr[i + 14] = base[i + 14] * R;
      }
      p.rain.instanceMatrix.needsUpdate = true;
      p.rain.position.set(z.pos.x, z.pos.y, z.pos.z);
    }
    if (p.mats) setTornadoColor(z, 'wind');
  }

  function setTornadoColor(z, el) {
    const [a, b] = TORNADO_COLORS[el] || TORNADO_COLORS.wind;
    for (const m of z.vis.mats) { m.uniforms.colA.value.set(a); m.uniforms.colB.value.set(b); }
    if (z.vis.core) { const inf = el && el !== 'wind'; const m = z.vis.core.material; m.color.set(inf ? b : 0x9cc8b4); if (inf) m.color.lerp(WHITE, 0.25); m.emissive.set(inf ? b : 0x2a5a48); m.emissiveIntensity = inf ? 0.5 : 0.2; }
  }

  function remove(i) {
    const z = zones[i];
    zones.splice(i, 1);
    giveVisual(z.type, z.vis);
    try { z.onEnd?.(z); } catch (_) { /* */ }
  }
  function convert(z, type, duration) {
    const i = zones.indexOf(z);
    if (i < 0) return null;
    zones.splice(i, 1); giveVisual(z.type, z.vis);
    return spawn(type, z.pos, { radius: z.radius, duration });
  }

  // ---------- helpers ----------
  function inside(z, pos, extra = 0) {
    const dx = pos.x - z.pos.x, dz = pos.z - z.pos.z, r = z.radius + extra;
    return dx * dx + dz * dz <= r * r && pos.y > z.pos.y - 2 && pos.y < z.pos.y + z.height;
  }
  function enemiesIn(z, extra = 0) {
    v.set(z.pos.x, z.pos.y + 1, z.pos.z);
    S.combat.queryRadius(v, z.radius + extra, 'enemy', near);
    // queryRadius vertical check uses r; tall zones (storm) also want enemies high above ground
    return near;
  }
  function hitAll(z, hitFn, extra = 0) {
    const list = enemiesIn(z, extra).slice();
    for (const e of list) hitFn(e);
    return list.length;
  }
  const center = (e, out) => (S.combat.getCenter ? S.combat.getCenter(e, out) : out.copy(e.object.position).setY(e.object.position.y + 1));
  const rp = (z, k = 0.85) => { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * z.radius * k; v3.set(z.pos.x + Math.cos(a) * r, 0, z.pos.z + Math.sin(a) * r); v3.y = S.height(v3.x, v3.z) + 0.1; return v3; };

  // ---------- fusions: element applied at a point ----------
  function elementAt(point, r, el, opts = {}) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (!z || !inside(z, point, r)) continue;
      if (z.comboT > 0 && z.type !== 'tornado') continue;
      if (z.type === 'ice' && el === 'fire') { steamBurst(z); continue; }
      if (z.type === 'fire' && el === 'ice') {
        S.vfx('burst', z.pos, { count: 30, color: [0xffffff, 0xdde6ee], shape: 'smoke', speed: 3, spread: 1, size: 1, sizeEnd: 2.4, life: 1.2, drag: 2, gravity: 1.5, additive: false });
        S.sfx('steam', { position: z.pos }); remove(zones.indexOf(z)); continue;
      }
      if (z.type === 'water' && el === 'fire') {
        S.vfx('burst', z.pos, { count: 26, color: [0xffffff, 0xdde6ee], shape: 'smoke', speed: 3, spread: 1, size: 1, sizeEnd: 2.2, life: 1.1, drag: 2, gravity: 1.5, additive: false });
        S.sfx('steam', { position: z.pos }); remove(zones.indexOf(z)); continue;
      }
      if ((z.type === 'water' || z.type === 'storm') && el === 'lightning') { electroWater(z); continue; }
      if (z.type === 'water' && el === 'ice') { freezeWater(z); continue; }
      if ((z.type === 'fire' || z.type === 'lava') && el === 'earth') { eruption(z, point); continue; }
      if (z.type === 'fire' && el === 'wind' && opts.dir) { fireWave(z, point, opts.dir); continue; }
      if (z.type === 'tornado' && (el === 'fire' || el === 'ice' || el === 'lightning')) infuseTornado(z, el);
    }
  }

  function steamBurst(z) {
    const p = v2.copy(z.pos); p.y += 0.5;
    S.vfx('burst', p, { count: 70, color: [0xffffff, 0xe6eef5], shape: 'smoke', speed: 9, spread: 1, size: 1.4, sizeEnd: 4, life: 1.8, lifeVar: 0.5, drag: 2.2, gravity: 2.5, additive: false });
    S.vfx('burst', p, { count: 40, color: [0xffffff, 0x9feaff], shape: 'spark', speed: 14, spread: 1, size: 0.12, life: 0.5, drag: 2 });
    S.vfx('shockwave', p, { color: 0xffffff, radius: z.radius + 3, duration: 0.6, thickness: 1.2 });
    S.vfx('flash', p, { color: 0xfff0e0, intensity: 7, distance: 16, duration: 0.4 });
    S.vfx('shake', 0.45);
    S.sfx('steam', { position: p }); S.sfx('explode_fire', { position: p, pitch: 0.7 });
    hitAll(z, (e) => S.combat.dealDamage(e, { amount: 38, element: 'fire', source: 'player', point: center(e, new THREE.Vector3()), launch: 6, knockback: 6, noReaction: true, status: { wet: 5 }, tags: ['fusion'] }), 1.5);
    S.combo('steam_burst', '증기 폭발', p);
    const nz = convert(z, 'water', 10); if (nz) nz.comboT = 0.6;
  }
  function electroWater(z) {
    if (z.zapT > 0) return;
    z.zapT = 0.8; z.comboT = 0.3;
    const surf = v2.copy(z.pos); surf.y += 0.2;
    for (let i = 0; i < 7; i++) {
      const a = rp(z).clone(); const b = rp(z).clone();
      S.vfx('beam', a, b, { color: ELEMENT_COLORS.lightning, width: 0.12, duration: 0.3, jagged: 0.5, segments: 10, branches: 1 });
    }
    S.vfx('flash', surf, { color: 0xc9a4ff, intensity: 6, distance: z.radius * 3, duration: 0.3 });
    S.sfx('impact_lightning', { position: surf });
    hitAll(z, (e) => {
      S.combat.applyStatus(e, 'wet', 4);
      S.combat.applyStatus(e, 'stunned', 1);
      S.combat.dealDamage(e, { amount: 16, element: 'lightning', source: 'player', point: center(e, new THREE.Vector3()), status: { shocked: 3 }, noReaction: true, tags: ['fusion'] });
    }, 0.5);
    if (z.vis.disc) z.vis.disc.material.uniforms.zap.value = 1;
    S.combo('electro_water', '전기 수면', surf);
  }
  function freezeWater(z) {
    const p = v2.copy(z.pos); p.y += 0.3;
    S.vfx('burst', p, { count: 50, color: [0xffffff, 0x7fe3ff], shape: 'shard', speed: 8, spread: 0.8, dir: UP, size: 0.2, life: 0.8, gravity: -8 });
    S.vfx('shockwave', p, { color: 0xbff4ff, radius: z.radius + 1.5, duration: 0.5, thickness: 0.8 });
    S.sfx('impact_ice', { position: p });
    hitAll(z, (e) => { S.combat.clearStatus(e, 'wet'); S.combat.applyStatus(e, 'frozen', 3); S.combat.dealDamage(e, { amount: 14, element: 'ice', source: 'player', noReaction: true, tags: ['fusion'] }); }, 0.5);
    S.combo('freeze_water', '수면 빙결', p);
    const nz = convert(z, 'ice', 9); if (nz) nz.comboT = 0.6;
  }
  function eruption(z, point) {
    const p = v2.copy(z.pos);
    S.vfx('explosion', p, { element: 'fire', scale: 1.6 });
    S.vfx('burst', p, { count: 80, color: [0xffe080, 0xff3a00], shape: 'ember', speed: 18, dir: UP, spread: 0.3, size: 0.25, life: 1.4, gravity: -18 });
    S.vfx('debris', p, { count: 26, material: 'rock', color: 0x4a2014, size: 0.4, speed: 14, life: 2 });
    S.vfx('flash', p, { color: 0xff5010, intensity: 10, distance: 20, duration: 0.5 });
    S.vfx('shake', 0.6);
    S.sfx('explode_earth', { position: p }); S.sfx('explode_fire', { position: p });
    for (let i = 0; i < 6; i++) { const q2 = rp(z, 0.7); S.props.pillars.spawn(q2.x, q2.y, q2.z, { height: 1.5 + Math.random() * 2, width: 0.8, hold: 0.8, delay: i * 0.04 }); }
    hitAll(z, (e) => S.combat.dealDamage(e, { amount: 30, element: 'fire', source: 'player', point: center(e, new THREE.Vector3()), launch: 10, status: { burning: 5 }, noReaction: true, tags: ['fusion'] }), 1);
    S.combat.discover?.('magma');
    S.combo('magma', '용암 분출', p);
    if (z.type === 'fire') { const nz = convert(z, 'lava', 7); if (nz) nz.comboT = 0.8; } else z.comboT = 0.8;
  }
  function fireWave(z, point, dir) {
    z.comboT = 1.2;
    v.copy(dir).setY(0).normalize();
    for (let i = 1; i <= 3; i++) {
      const p = v2.copy(z.pos).addScaledVector(v, z.radius * 0.9 + i * 3.2);
      const nz = spawn('fire', p, { radius: 2.4, duration: 4 }); if (nz) nz.comboT = 1;
      S.vfx('burst', p, { count: 24, color: [0xffc060, 0xff4a10], shape: 'ember', speed: 7, dir: UP, spread: 0.5, size: 0.2, life: 0.8, gravity: -3 });
    }
    S.combo('fire_wave', '화염 파도', point);
  }
  function infuseTornado(z, el) {
    if (z.infusion === el) return;
    z.infusion = el;
    setTornadoColor(z, el);
    const name = el === 'fire' ? '화염 회오리' : el === 'ice' ? '눈보라' : '뇌전 회오리';
    const id = el === 'fire' ? 'fire_tornado' : el === 'ice' ? 'blizzard' : 'storm_tornado';
    const p = v2.copy(z.pos); p.y += 3;
    S.vfx('burst', p, { count: 60, color: [ELEMENT_COLORS[el], 0xffffff], shape: el === 'fire' ? 'ember' : el === 'ice' ? 'snow' : 'spark', speed: 10, spread: 1, size: 0.25, life: 0.9, drag: 1.5 });
    S.vfx('shockwave', z.pos, { color: ELEMENT_COLORS[el], radius: 7, duration: 0.6, thickness: 1 });
    S.vfx('flash', p, { color: ELEMENT_COLORS[el], intensity: 6, distance: 16, duration: 0.4 });
    S.vfx('shake', 0.3);
    S.sfx('reaction', { position: p });
    z.time = Math.max(z.time, 3.5);
    S.combo(id, name, p);
  }

  // ---------- projectile passing through ----------
  function checkProjectile(p) {
    for (const z of zones) {
      if (!inside(z, p.pos, p.radius)) continue;
      if (p.zones.includes(z)) continue;
      p.zones.push(z);
      const el = p.element;
      if (z.type === 'tornado') { if (el === 'fire' || el === 'ice' || el === 'lightning') infuseTornado(z, el); continue; }
      if (z.type === 'fire' || z.type === 'lava') {
        if (el === 'wind') {
          if (S.projectiles.infuse(p, 'fire', null)) { p.data.fireWave = 3; p.data.waveAt = p.traveled + 3; S.combo('fire_wave', '화염 파도', p.pos); }
        } else if (el === 'earth' || el === 'lightning') S.projectiles.infuse(p, 'fire', el === 'earth' ? '용암 탄환' : '화염 번개');
        else if (el === 'ice' && z.type === 'fire') { elementAt(p.pos, 0.5, 'ice'); }
      } else if (z.type === 'ice') {
        if (el === 'wind' || el === 'earth') S.projectiles.infuse(p, 'ice', el === 'wind' ? '서리 칼날' : '빙결 탄환');
        else if (el === 'fire') elementAt(p.pos, 0.5, 'fire');
      } else if (z.type === 'storm' || z.type === 'water') {
        if (el === 'wind' || el === 'earth' || el === 'ice') {
          if (z.type === 'storm' && el !== 'ice') S.projectiles.infuse(p, 'lightning', el === 'wind' ? '뇌전 칼날' : '뇌전 탄환');
        }
        if (el === 'lightning') elementAt(p.pos, 0.5, 'lightning');
        if (el === 'ice' && z.type === 'water') elementAt(p.pos, 0.5, 'ice');
      }
    }
    // fire wave trail from infused wind blades
    if (p.data.fireWave > 0 && p.traveled >= p.data.waveAt) {
      p.data.fireWave--; p.data.waveAt = p.traveled + 3.2;
      spawn('fire', p.pos, { radius: 2.2, duration: 4 });
    }
  }

  // ---------- per-frame ----------
  function update(dt) {
    const t = game.time;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.age += dt; z.time -= dt; z.comboT -= dt; z.zapT -= dt;
      if (z.time <= 0) { remove(i); continue; }
      const fadeIn = Math.min(1, z.age / 0.25), fadeOut = Math.min(1, z.time / 0.6);
      const fade = fadeIn * fadeOut;
      const p = z.vis;
      if (p.disc) {
        const u = p.disc.material.uniforms;
        u.fade.value = fade;
        u.zap.value = Math.max(0, u.zap.value - dt * 2.5);
      }
      z.tick -= dt;
      const tickNow = z.tick <= 0;
      if (tickNow) z.tick += z.type === 'tornado' ? 0.35 : 0.5;
      switch (z.type) {
        case 'fire': updateFire(z, dt, fade, tickNow, t); break;
        case 'lava': updateFire(z, dt, fade, tickNow, t); break;
        case 'ice': updateIce(z, dt, fade, tickNow, t); break;
        case 'water': if (tickNow) hitAll(z, (e) => S.combat.applyStatus(e, 'wet', 3)); break;
        case 'storm': updateStorm(z, dt, fade, tickNow, t); break;
        case 'tornado': updateTornado(z, dt, fade, tickNow, t); break;
      }
    }
  }

  function updateFire(z, dt, fade, tickNow, t) {
    const p = z.vis, lava = z.type === 'lava';
    const fl = p.flames;
    for (let i = 0; i < p.flameData.length; i++) {
      const f = p.flameData[i];
      const k = (0.7 + 0.3 * Math.sin(t * 9 + f.ph) + 0.15 * Math.sin(t * 23 + f.ph * 3)) * fade * f.s * (lava ? 0.7 : 1);
      eu.set(0, f.ph, 0); q.setFromEuler(eu);
      sc.set(k * 0.9, k * (1.1 + 0.4 * Math.sin(t * 5 + f.ph)), k * 0.9);
      v.set(f.x, f.y - 0.05, f.z);
      m4.compose(v, q, sc); fl.setMatrixAt(i, m4);
    }
    fl.instanceMatrix.needsUpdate = true;
    z.burstT -= dt;
    if (z.burstT <= 0) {
      z.burstT = lava ? 0.12 : 0.07;
      const q2 = rp(z);
      if (lava) S.vfx('burst', q2, { count: 3, color: [0xffb030, 0xff3a00], shape: 'ember', speed: 3.5, dir: UP, spread: 0.4, size: 0.14, life: 0.8, gravity: -6 });
      else S.vfx('burst', q2, { count: 2, color: [0xffd070, 0xff5a10], shape: 'ember', speed: 2.8, dir: UP, spread: 0.35, size: 0.12, sizeEnd: 0.02, life: 0.9, gravity: 1.5 });
      if (Math.random() < 0.25) S.vfx('burst', q2, { count: 1, color: 0x4a3a34, shape: 'smoke', speed: 1.2, dir: UP, spread: 0.2, size: 0.6, sizeEnd: 1.8, life: 1.4, additive: false, gravity: 1 });
    }
    if (tickNow) {
      hitAll(z, (e) => S.combat.dealDamage(e, { amount: lava ? 7 : 5, element: 'fire', source: 'player', status: { burning: lava ? 3 : 2 }, tags: ['zone'], noCrit: true }));
    }
  }
  function updateIce(z, dt, fade, tickNow, t) {
    const p = z.vis, d = p.crystalData;
    const grow = Math.min(1, z.age / 0.3) * Math.min(1, z.time / 0.5);
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      eu.set(c.tx, c.yaw, c.tz); q.setFromEuler(eu);
      const s = c.s * grow;
      sc.set(s, s * 1.2, s); v.set(c.x, c.y, c.z);
      m4.compose(v, q, sc); p.crystals.setMatrixAt(i, m4);
      sc.multiplyScalar(1.1); m4.compose(v, q, sc); p.crystalOutline.setMatrixAt(i, m4);
    }
    p.crystals.instanceMatrix.needsUpdate = true; p.crystalOutline.instanceMatrix.needsUpdate = true;
    z.burstT -= dt;
    if (z.burstT <= 0) { z.burstT = 0.15; S.vfx('burst', rp(z), { count: 2, color: [0xffffff, 0xbff4ff], shape: 'snow', speed: 1, dir: UP, spread: 0.6, size: 0.12, life: 1.1, gravity: 0.5 }); }
    if (tickNow) hitAll(z, (e) => S.combat.applyStatus(e, 'chilled', 2));
  }
  function updateStorm(z, dt, fade, tickNow, t) {
    const p = z.vis, R = z.radius;
    const cy = z.pos.y + 13;
    const d = p.cloudData;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      const a = c.a + t * 0.25;
      v.set(z.pos.x + Math.cos(a) * c.r * R * 0.85, cy + c.y + Math.sin(t * 0.8 + c.ph) * 0.3, z.pos.z + Math.sin(a) * c.r * R * 0.85);
      const s = c.s * Math.min(1, z.age / 0.5) * Math.min(1, z.time / 0.6) * (R / 8);
      q.identity(); sc.set(s * 1.4, s * 0.8, s * 1.4);
      m4.compose(v, q, sc); p.cloud.setMatrixAt(i, m4);
      sc.multiplyScalar(1.08); m4.compose(v, q, sc); p.cloudOutline.setMatrixAt(i, m4);
    }
    p.cloud.instanceMatrix.needsUpdate = true; p.cloudOutline.instanceMatrix.needsUpdate = true;
    if (p.cloudMat) { p.flick = Math.max(0, (p.flick || 0) - dt * 4); p.cloudMat.emissiveIntensity = 0.15 + p.flick * p.flick * 0.7 + Math.sin(t * 7.3) * 0.03; }
    p.rain.material.uniforms.opacity.value = Math.min(1, z.age / 0.8) * Math.min(1, z.time / 0.6);
    p.rain.material.uniforms.top.value = 13;
    if (p.disc) p.disc.material.uniforms.fade.value = Math.min(1, z.age / 2.5) * Math.min(1, z.time / 0.6);
    if (tickNow) hitAll(z, (e) => S.combat.applyStatus(e, 'wet', 4));
    // lightning strikes
    z.strikeT -= dt;
    if (z.strikeT <= 0 && z.age > 0.6) {
      const list = enemiesIn(z);
      let target = null;
      if (list.length) target = list[Math.floor(Math.random() * list.length)];
      const to = target ? center(target, new THREE.Vector3()) : rp(z, 0.8).clone();
      const from = new THREE.Vector3(to.x + (Math.random() - 0.5) * 3, cy - 1, to.z + (Math.random() - 0.5) * 3);
      S.vfx('beam', from, to, { color: 0xd8c0ff, width: 0.35, duration: 0.28, jagged: 1.2, segments: 16, branches: 3 });
      S.vfx('flash', to, { color: 0xc9a4ff, intensity: 8, distance: 18, duration: 0.2 });
      S.vfx('burst', to, { count: 20, color: [0xffffff, ELEMENT_COLORS.lightning], shape: 'spark', speed: 9, spread: 1, size: 0.12, life: 0.4, drag: 2 });
      S.sfx('impact_lightning', { position: to, volume: 0.8 });
      p.flick = 1;
      if (target) {
        S.combat.dealDamage(target, { amount: 18, element: 'lightning', source: 'player', point: to, status: { shocked: 3 }, tags: ['zone'] });
        z.strikeT = 0.38;
      } else { z.strikeT = 0.7; S.vfx('decal', to, { color: 0x2a2030, radius: 0.8, duration: 3, opacity: 0.5 }); }
      if (Math.random() < 0.3) S.vfx('screenFlash', 0xe8e0ff, 0.08, 0.1);
    }
  }
  function updateTornado(z, dt, fade, tickNow, t) {
    const p = z.vis;
    // travel toward target
    if (z.target) {
      v.subVectors(z.target, z.pos).setY(0);
      const d = v.length();
      if (d > 0.5) { v.multiplyScalar(Math.min(d, z.speed * dt) / d); z.pos.add(v); }
    }
    z.pos.x += Math.sin(t * 1.7) * dt * 0.8;
    z.pos.y = S.height(z.pos.x, z.pos.z);
    const grow = Math.min(1, z.age / 0.4) * Math.min(1, z.time / 0.5);
    const s = (z.radius / 4) * grow;
    p.group.position.copy(z.pos);
    p.outer.scale.set(s, s, s); p.outer.rotation.y = t * 4;
    p.inner.scale.set(s * 0.62, s * 0.95, s * 0.62); p.inner.rotation.y = -t * 6;
    if (p.core) { p.core.scale.set(s * 0.4, s * 0.9, s * 0.4); p.core.rotation.y = t * 3; }
    p.base.scale.set(2.2 * s, 2.2 * s, 1); p.base.rotation.z = t * 5;
    for (const m of p.mats) m.uniforms.opacity.value = grow;
    // auto-infusion from zones / burning enemies inside
    if (!z.infusion) {
      for (const o of zones) {
        if (o === z) continue;
        const dd = Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z);
        if (dd < o.radius + z.radius * 0.5) {
          if (o.type === 'fire' || o.type === 'lava') { infuseTornado(z, 'fire'); break; }
          if (o.type === 'ice') { infuseTornado(z, 'ice'); break; }
          if (o.type === 'storm') { infuseTornado(z, 'lightning'); break; }
        }
      }
    }
    // debris & color particles
    z.burstT -= dt;
    if (z.burstT <= 0) {
      z.burstT = 0.06;
      const el = z.infusion;
      const a = Math.random() * 6.28, h = Math.random() * 8 * s;
      v2.set(z.pos.x + Math.cos(a) * (0.6 + h * 0.35), z.pos.y + h, z.pos.z + Math.sin(a) * (0.6 + h * 0.35));
      v3.set(-Math.sin(a), 0.5, Math.cos(a));
      const col = el ? [ELEMENT_COLORS[el], 0xffffff] : [0x7fae5a, 0xd6f0e2];
      S.vfx('burst', v2, { count: 2, color: col, shape: el === 'fire' ? 'ember' : el === 'ice' ? 'snow' : el === 'lightning' ? 'spark' : 'leaf', speed: 9, dir: v3, spread: 0.2, size: el ? 0.2 : 0.16, life: 0.6, drag: 0.5 });
      v2.set(z.pos.x, z.pos.y + 0.2, z.pos.z); S.vfx('burst', v2, { count: 6, color: [0xcdb68e, 0xa8916c], shape: 'smoke', speed: 5, spread: 0.7, dir: UP, size: 1.4, sizeEnd: 2.6, life: 0.8, drag: 2, additive: false, alpha: 0.6 });
      z.debrisT = (z.debrisT || 0) - 0.06;
      if (z.debrisT <= 0) { z.debrisT = 0.28; const a3 = Math.random() * 6.28; v2.set(z.pos.x + Math.cos(a3) * 2 * s, z.pos.y + 1 + Math.random() * 5 * s, z.pos.z + Math.sin(a3) * 2 * s); S.vfx('debris', v2, { count: 1, material: 'rock', color: 0x8a7458, size: 0.25, speed: 6, life: 1.2 }); }
      if (el === 'lightning' && Math.random() < 0.25) {
        const a2 = Math.random() * 6.28; v2.set(z.pos.x + Math.cos(a2) * 2.5 * s, z.pos.y + Math.random() * 9 * s, z.pos.z + Math.sin(a2) * 2.5 * s);
        v3.set(z.pos.x, z.pos.y + Math.random() * 9 * s, z.pos.z);
        S.vfx('beam', v3, v2, { color: ELEMENT_COLORS.lightning, width: 0.12, duration: 0.15, jagged: 0.6, segments: 8 });
      }
    }
    // pull & lift
    const list = enemiesIn(z, 2.5);
    for (const e of list) {
      if (!e.velocity) continue;
      v.subVectors(z.pos, e.object.position).setY(0);
      const d = v.length() || 1;
      const m = e.mass || 1;
      const pull = (e.isBoss ? 2 : 9) / m;
      v.multiplyScalar(1 / d);
      // tangential swirl
      e.velocity.x += (v.x * pull + -v.z * 6 / m) * dt;
      e.velocity.z += (v.z * pull + v.x * 6 / m) * dt;
      if (d < z.radius && !e.isBoss) {
        const lift = 16 / m;
        const hAbove = e.object.position.y - z.pos.y;
        if (hAbove < 4.5) { e.velocity.y = Math.max(e.velocity.y, 0) + lift * dt * 1.6; e.grounded = false; if (!e.statuses?.airborne && hAbove > 0.5) S.combat.applyStatus(e, 'airborne', 1.5); }
        else e.velocity.y *= 0.9;
      }
    }
    if (tickNow) {
      // burning / chilled / shocked enemies inside infuse the tornado
      if (!z.infusion) {
        for (const e of list) {
          const st = e.statuses || {};
          if (st.burning) { infuseTornado(z, 'fire'); break; }
          if (st.chilled || st.frozen) { infuseTornado(z, 'ice'); break; }
          if (st.shocked) { infuseTornado(z, 'lightning'); break; }
        }
      }
      const el = z.infusion;
      for (const e of list.slice()) {
        const c = center(e, new THREE.Vector3());
        if (el === 'fire') S.combat.dealDamage(e, { amount: 9, element: 'fire', source: 'player', point: c, status: { burning: 3 }, noReaction: true, noCrit: true, tags: ['zone'] });
        else if (el === 'ice') {
          const st = e.statuses || {};
          S.combat.dealDamage(e, { amount: 8, element: 'ice', source: 'player', point: c, status: { chilled: 3 }, noReaction: true, noCrit: true, tags: ['zone'] });
          if (st.chilled && st.chilled.age > 1.4 && !st.frozen) S.combat.applyStatus(e, 'frozen', 2);
        } else if (el === 'lightning') {
          v2.set(z.pos.x, z.pos.y + 5, z.pos.z);
          S.vfx('beam', v2, c, { color: ELEMENT_COLORS.lightning, width: 0.14, duration: 0.2, jagged: 0.5, segments: 8 });
          S.combat.dealDamage(e, { amount: 10, element: 'lightning', source: 'player', point: c, status: { shocked: 2 }, noCrit: true, tags: ['zone'] });
        } else S.combat.dealDamage(e, { amount: 7, element: 'wind', source: 'player', point: c, noReaction: true, noCrit: true, tags: ['zone'] });
      }
    }
  }

  function warm(group) { for (const t of Object.keys(NAMES)) { const v = makeVisual(t); group.add(v.group); v.group.userData.type = t; v.group.userData.parts = v; } }
  function unwarm(group) { for (const g of [...group.children]) if (g.userData.parts) { group.remove(g); (pools[g.userData.type] || (pools[g.userData.type] = [])).push(g.userData.parts); } }
  function clear() { while (zones.length) remove(0); }

  return { spawn, update, elementAt, checkProjectile, zones, clear, inside, warm, unwarm };
}
