// Caster summons & placed structures (summon / wall / pillar archetypes, CONTRACT §7.3; DESIGN §12 "≤ 4 alive summons").
// Ally entities (team 'player', registered with combat.registerAlly): 나무정령 treant, 도발의 석상 stone totem, 신기루 분신
// water clone. Placed props: 빛의 표지 beacon, 빛의 거울 mirror, 빛의 기둥 light pillar (prism relays), ice pillars / glacier
// blocks / stepping stones / walls (world platforms + temp colliders). Meshes are built once, pooled, share materials,
// cast no shadows and are hidden when idle. Taunts go through enemies.setTauntTarget (feature-detected).
import * as THREE from 'three';
import { glint, GLINT } from './palette.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat, addOutline } from '../core/utils.js';
import { elColor } from '../core/elements.js';
import { fresnelMat, coreMat, crystalGeo, iceMatSolid, pillarGeo, rockMat } from './assets.js';

const OPTIONAL_FX = new Set(['groundDecal', 'runeCircle', 'flashSprite', 'dome', 'debris']);

const MAX_ALIVE = 4;
const KIND_NAME = { treant: '나무정령', totem: '도발의 석상', clone: '신기루 분신', beacon: '빛의 표지', mirror: '빛의 거울', lightpillar: '빛의 기둥' };
const ni = (g) => (g.index ? g.toNonIndexed() : g);

function treantModel(mats) {
  const g = new THREE.Group();
  const trunk = new THREE.CylinderGeometry(0.42, 0.7, 2.4, 7); trunk.translate(0, 1.2, 0);
  const roots = [];
  for (let i = 0; i < 4; i++) { const r = new THREE.ConeGeometry(0.22, 1.0, 5); r.rotateZ(1.25); r.rotateY((i / 4) * Math.PI * 2 + 0.4); r.translate(Math.cos((i / 4) * Math.PI * 2 + 0.4) * 0.55, 0.25, -Math.sin((i / 4) * Math.PI * 2 + 0.4) * 0.55); roots.push(r); }
  const body = new THREE.Mesh(mergeGeometries([trunk, ...roots].map(ni)), mats.bark);
  const crownG = mergeGeometries([[0, 3.0, 0, 1.25], [0.75, 2.7, 0.2, 0.85], [-0.7, 2.75, -0.15, 0.9], [0.1, 3.6, -0.2, 0.8]].map(([x, y, z, r]) => { const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); return ni(s); }));
  const crown = new THREE.Mesh(crownG, mats.leaf);
  const armG = (() => { const a = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6); a.translate(0, -0.8, 0); const h = new THREE.IcosahedronGeometry(0.32, 0); h.translate(0, -1.65, 0); return mergeGeometries([ni(a), ni(h)]); })();
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.55, 2.0, 0); armR.position.set(0.55, 2.0, 0);
  armL.add(new THREE.Mesh(armG, mats.bark)); armR.add(new THREE.Mesh(armG, mats.bark));
  armL.rotation.z = -0.35; armR.rotation.z = 0.35;
  const eyes = new THREE.Mesh((() => { const a = new THREE.SphereGeometry(0.09, 8, 6); a.translate(-0.18, 2.05, 0.42); const b = new THREE.SphereGeometry(0.09, 8, 6); b.translate(0.18, 2.05, 0.42); return mergeGeometries([ni(a), ni(b)]); })(), mats.glowNature);
  addOutline(body, 0.03); addOutline(crown, 0.03);
  g.add(body, crown, armL, armR, eyes);
  g.userData.parts = { body, crown, armL, armR };
  return g;
}
function totemModel(mats) {
  const g = new THREE.Group();
  const parts = [];
  for (let i = 0; i < 3; i++) { const b = new THREE.BoxGeometry(1.1 - i * 0.18, 0.8, 1.1 - i * 0.18); b.rotateY(i * 0.4); b.translate(0, 0.4 + i * 0.82, 0); parts.push(ni(b)); }
  const head = new THREE.OctahedronGeometry(0.5, 0); head.translate(0, 2.85, 0); parts.push(ni(head));
  const body = new THREE.Mesh(mergeGeometries(parts), mats.stone);
  addOutline(body, 0.03);
  const runes = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 5, 24), mats.glowEarth); runes.rotation.x = Math.PI / 2; runes.position.y = 1.3;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mats.glowEarth); eye.position.set(0, 2.1, 0.5);
  g.add(body, runes, eye); g.userData.parts = { body, runes };
  return g;
}
function cloneModel() {
  const g = new THREE.Group();
  const mat = fresnelMat(0x6fc8ff, { power: 1.4, intensity: 1.2, core: 0.12 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 10), mat); torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat); head.position.y = 1.9;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 12, 1, true), mat); skirt.position.y = 0.45;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), coreMat(0xdff6ff, 1.2)); core.position.y = 1.25;
  g.add(torso, head, skirt, core); g.userData.parts = { torso, head, skirt }; g.userData.mat = mat;
  return g;
}
function beaconModel(mats) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.2, 6), mats.gold); pole.position.y = 1.1;
  const cage = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mats.gold); cage.position.y = 2.35; cage.scale.set(1, 1.4, 1);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), coreMat(0xfff2c0, 1.2)); flame.position.y = 2.35;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), fresnelMat(0xffd36a, { power: 1.6, intensity: 1.2, core: 0.05 })); halo.position.y = 2.35;
  addOutline(pole, 0.02);
  g.add(pole, cage, flame, halo); g.userData.parts = { flame, halo, cage };
  return g;
}
function mirrorModel() {
  const g = new THREE.Group();
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), fresnelMat(0xfff6d0, { power: 0.9, intensity: 1.2, core: 0.3 }));
  shard.scale.set(0.9, 1.4, 0.18);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 5, 32), fresnelMat(0xffc24a, { power: 0.4, intensity: 1.2, core: 0.6 }));
  frame.scale.set(0.85, 1.3, 1);
  g.add(shard, frame); g.userData.parts = { shard, frame };
  return g;
}
function lightPillarModel() {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 9, 16, 1, true), fresnelMat(0xffe9a8, { power: 1.0, intensity: 1.2, core: 0.15 }));
  col.position.y = 4.5;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), coreMat(GLINT, 1.2)); core.position.y = 4.5;
  g.add(col, core); g.userData.parts = { col, core };
  return g;
}

export function createSummons(S, api) {
  const { game } = S;
  const E = game.events;
  // effectQuality 'low' drops the secondary visuals (decals, rune circles, flares, domes, debris): ≤ 10 extra calls per cast (§23)
  const fx = (n, ...a) => { if (OPTIONAL_FX.has(n) && game.settings?.values?.effectQuality === 'low') return null; try { return S.looks ? S.looks.fx(n, a) : game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  const C = () => S.combat;   // shim: stamps the cast castId on every hit
  const mats = {
    bark: toonMat(0x6b4a2e, { emissive: 0x1a0f06, emissiveIntensity: 0.4 }), leaf: toonMat(0x6fcf4a, { emissive: 0x1d3a12, emissiveIntensity: 0.5 }),
    stone: toonMat(0x9a8268, { flatShading: true }), gold: toonMat(0xe8c060, { emissive: 0x4a3410, emissiveIntensity: 0.5 }),
    glowNature: coreMat(0xd8ff9a, 1.2), glowEarth: fresnelMat(0xf0bd6e, { power: 0.5, intensity: 1.2, core: 0.6 }),
  };
  const BUILD = { treant: () => treantModel(mats), totem: () => totemModel(mats), clone: cloneModel, beacon: () => beaconModel(mats), mirror: mirrorModel, lightpillar: lightPillarModel };
  const pools = {}; const POOLN = { treant: 1, totem: 1, clone: 2, beacon: 2, mirror: 2, lightpillar: 2 };
  const all = [];
  for (const k in BUILD) {
    pools[k] = [];
    for (let i = 0; i < POOLN[k]; i++) {
      const m = BUILD[k](); m.visible = false; m.name = 'spells.summon.' + k;
      m.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      game.scene.add(m); pools[k].push(m); all.push(m);
    }
  }
  const live = [];
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  const near = [];

  function take(kind) {
    const p = pools[kind]; if (!p) return null;
    for (const m of p) if (!m.userData.busy) { m.userData.busy = true; return m; }
    // recycle the oldest of that kind
    const old = live.find((s) => s.kind === kind);
    if (old) { end(old, false); return take(kind); }
    return null;
  }

  /**
   * spawn(kind, pos, {skillId, life, hpFrac, taunt, tauntR, burst:{dmg,r,status}, slam:{dmg,every,r}, reflect, relay, hit, element}) → summon
   */
  function spawn(kind, pos, o = {}) {
    if (!BUILD[kind]) return null;
    // max 1 per skill (treant max:1) and ≤ 4 summons alive overall
    for (const s of live) if (o.skillId && s.skillId === o.skillId && (o.max || 1) <= countSkill(o.skillId)) { end(s, false); break; }
    while (live.length >= MAX_ALIVE) end(live[0], false);
    const mesh = take(kind); if (!mesh) return null;
    const gy = S.height(pos.x, pos.z);
    mesh.position.set(pos.x, gy, pos.z); mesh.visible = true; mesh.scale.setScalar(0.01);
    const pp = game.player?.object?.position;
    mesh.rotation.y = pp ? Math.atan2(pos.x - pp.x, pos.z - pp.z) + Math.PI : 0;
    const maxHp = Math.max(1, (game.player?.maxHp || 100) * (o.hpFrac || 0.3));
    const s = {
      kind, skillId: o.skillId || null, mesh, t: 0, life: o.life || 10, o, alive: true, slamT: 1.0, fxT: 0, reflects: o.reflect || 0,
      ent: null, collider: null, relay: null, zone: null, actT: 0, home: new THREE.Vector3(pos.x, gy, pos.z),
    };
    if (kind === 'treant' || kind === 'totem' || kind === 'clone') {
      const ent = {
        id: 'summon_' + kind, name: KIND_NAME[kind], team: 'player', isAlly: true, isSummon: true, alive: true, hp: maxHp, maxHp, xpValue: 0,
        object: mesh, height: kind === 'treant' ? 3.6 : kind === 'totem' ? 3 : 2.1, radius: kind === 'treant' ? 0.9 : 0.7, statuses: {}, velocity: new THREE.Vector3(),
        onHit: (res, hit) => onAllyHit(s, hit), onDeath: () => { s.broken = true; end(s, true); },
      };
      s.ent = ent;
      try { C()?.registerAlly?.(ent); } catch (_) { /* */ }
      if (o.taunt || kind === 'totem') { try { game.enemies?.setTauntTarget?.(ent, s.life); } catch (_) { /* */ } }
    }
    if (kind === 'totem') {
      try { s.collider = game.world?.addTempCollider?.({ shape: 'cyl', pos: s.home.clone(), r: 0.8, h: 3, life: s.life, blocksProjectiles: true }) || null; } catch (_) { s.collider = null; }
    }
    if (kind === 'mirror') {
      mesh.position.y = gy + 1.8;
      try {
        s.collider = game.world?.addTempCollider?.({ shape: 'cyl', pos: s.home.clone(), r: 1.2, h: 3.2, life: s.life, blocksProjectiles: true,
          onProjectile: (p) => { if (p?.team === 'player' || p?.source === 'player' || p?.fromPlayer) return 'pass'; if (s.reflects-- > 0) { flash(s); return 'reflect'; } return 'pass'; } }) || null;
      } catch (_) { s.collider = null; }
    }
    if (o.relay || kind === 'mirror' || kind === 'beacon' || kind === 'lightpillar') {
      s.relay = api.addRelay({ position: mesh.position, alive: true, kind: kind === 'lightpillar' ? 'pillar' : kind, isRelay: true });
    }
    if (kind === 'lightpillar') { s.zone = api.zones.spawn('holy', s.home, { r: o.blessR || 3, dur: s.life, params: { radiantPerSec: 0.5, healPct: 0, dispel: ['blight'] } }); }
    live.push(s);
    // arrival
    tv.copy(s.home); tv.y += 0.3;
    const col = elColor(o.element || (kind === 'treant' ? 'nature' : kind === 'totem' ? 'earth' : kind === 'clone' ? 'water' : 'light'), 'mid');
    fx('shockwave', tv, { color: col, radius: 2.5, duration: 0.45, thickness: 0.4 });
    fx('burst', tv, { count: 30, shape: kind === 'treant' ? 'leaf' : kind === 'totem' ? 'dust' : kind === 'clone' ? 'droplet' : 'mote', color: [glint(col), col], speed: 4, up: 2, spread: 1, size: kind === 'totem' ? 0.6 : 0.2, life: 0.7, gravity: 3, additive: kind !== 'totem' });
    if (kind === 'treant' || kind === 'totem') fx('debris', tv, { count: 10, material: 'rock', color: kind === 'treant' ? 0x4a3420 : 0x7a6248, size: 0.25, speed: 6, life: 1.2 });
    S.sfx(kind === 'treant' ? 'cast_nature' : kind === 'totem' ? 'explode_earth' : kind === 'clone' ? 'cast_water' : 'cast_light', { position: tv, volume: 0.8 });
    E.emit('summonSpawn', { kind, skillId: s.skillId, point: s.home });
    return s;
  }
  const countSkill = (id) => live.reduce((n, s) => n + (s.skillId === id ? 1 : 0), 0);
  function flash(s) { tv.copy(s.mesh.position); fx('burst', tv, { count: 14, shape: 'star', color: [glint(0xffe08a), 0xffe08a], speed: 5, spread: 1, size: 0.16, life: 0.3 }); }

  function onAllyHit(s, hit) {
    const src = hit?.source;
    if (s.kind === 'clone' && src && typeof src === 'object' && src.alive) { try { C()?.applyStatus?.(src, 'wet', 8, { source: game.player?.entity, el: 'water' }); } catch (_) { /* */ } }
    s.hurtT = 0.15;
  }

  function end(s, natural = true) {
    const i = live.indexOf(s); if (i < 0) return;
    live.splice(i, 1);
    s.alive = false;
    const o = s.o;
    tv.copy(s.mesh.position); tv.y += 1;
    if (natural && o.burst && (s.kind === 'totem' || s.kind === 'clone')) {
      const b = o.burst;
      fx('preset', s.kind === 'totem' ? 'explosion_earth' : 'explosion_water', tv, { scale: 1.1 });
      fx('shockwave', S.ground(tv).clone(), { color: elColor(s.kind === 'totem' ? 'earth' : 'water', 'mid'), radius: b.r || 4, duration: 0.5, thickness: 0.6 });
      api.aoe(tv, b.r || 4, Object.assign({}, o.hit || {}, { amount: b.dmg || 60, status: b.status, tier: 'heavy', knockback: 5 }));
      S.sfx(s.kind === 'totem' ? 'explode_earth' : 'explode_water', { position: tv });
    } else {
      fx('burst', tv, { count: 20, shape: s.kind === 'treant' ? 'leaf' : 'mote', color: [glint(elColor(o.element || 'nature', 'mid')), elColor(o.element || 'nature', 'mid')], speed: 3, spread: 1, size: 0.2, life: 0.6, gravity: 2 });
    }
    if (s.ent) {
      s.ent.alive = false;
      try { C()?.unregisterAlly?.(s.ent); } catch (_) { /* */ }
      try { if (game.enemies?.getThreatTarget && o.taunt) game.enemies.setTauntTarget?.(null, 0); } catch (_) { /* */ }
    }
    if (s.collider) { try { game.world?.removeCollider?.(s.collider); } catch (_) { /* */ } s.collider = null; }
    if (s.relay) { s.relay.alive = false; api.removeRelay(s.relay); s.relay = null; }
    if (s.zone && s.zone.alive) { try { api.zones.v3.remove(s.zone); } catch (_) { /* */ } }
    s.mesh.visible = false; s.mesh.userData.busy = false;
    E.emit('summonEnd', { kind: s.kind, skillId: s.skillId });
  }

  function update(dt) {
    const T = game.time || 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      s.t += dt;
      if (s.t >= s.life || (s.ent && !s.ent.alive)) { end(s, true); continue; }
      const m = s.mesh, grow = Math.min(1, s.t / 0.45), out = Math.min(1, (s.life - s.t) / 0.4);
      const k = grow * out;
      const P = m.userData.parts;
      switch (s.kind) {
        case 'treant': {
          m.scale.setScalar(Math.max(0.01, k * (1 + (s.hurtT > 0 ? 0.04 : 0))));
          if (s.hurtT > 0) s.hurtT -= dt;
          // walk toward the nearest enemy within 10 m (stay within 8 m of home)
          const tgt = api.nearestEnemy(m.position, 10);
          if (tgt) {
            tv.subVectors(tgt.object.position, m.position); tv.y = 0; const d = tv.length();
            m.rotation.y += (Math.atan2(tv.x, tv.z) - m.rotation.y) * Math.min(1, dt * 4);
            if (d > 2.4) { tv.multiplyScalar(Math.min(1, dt * 2.2 / Math.max(0.01, d))); m.position.add(tv); m.position.y = S.height(m.position.x, m.position.z); }
          }
          s.slamT -= dt;
          const slam = s.o.slam || { dmg: 25, every: 1.5, r: 3 };
          const phase = Math.max(0, 0.45 - s.slamT) / 0.45;     // wind-up in the last 0.45 s
          P.armL.rotation.x = -phase * 2.4 + Math.sin(T * 2) * 0.08; P.armR.rotation.x = -phase * 2.4 + Math.sin(T * 2 + 1) * 0.08;
          P.crown.rotation.y = Math.sin(T * 0.8) * 0.06;
          P.body.rotation.z = Math.sin(T * 1.6) * 0.03;
          if (s.slamT <= 0) {
            s.slamT = slam.every || 1.5;
            tv.copy(m.position); tv2.set(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y)); tv.addScaledVector(tv2, 1.6);
            const n = api.aoe(tv, slam.r || 3, Object.assign({}, s.o.hit || {}, { amount: slam.dmg || 25, element: 'nature', tier: 'heavy', knockback: 4, status: { seeded: { stacks: 1 } }, source: s.ent }), { touch: true });
            fx('shockwave', S.ground(tv).clone(), { color: 0x8fe05a, radius: slam.r || 3, duration: 0.4, thickness: 0.5 });
            fx('burst', tv, { count: 18, shape: 'dust', color: [0xb8a070, 0x6a5030], alpha: 0.6, additive: false, disc: true, radius: 0.5, speed: 4, up: 1, size: 0.6, sizeEnd: 1.2, life: 0.6 });
            fx('burst', tv, { count: 10, shape: 'leaf', color: [0xc8ff6a, 0x4f9e3a], speed: 3, up: 3, size: 0.2, life: 0.8, gravity: 4 });
            if (n) S.sfx('impact_earth', { position: tv, volume: 0.6 });
            P.armL.rotation.x = 0.3; P.armR.rotation.x = 0.3;
          }
          break;
        }
        case 'totem': {
          m.scale.set(k, Math.max(0.01, k * (s.t < 0.45 ? 1.15 - 0.15 * grow : 1)), k);
          P.runes.rotation.z += dt * 1.5; P.runes.position.y = 1.3 + Math.sin(T * 2) * 0.15;
          s.fxT -= dt;
          if (s.fxT <= 0) { s.fxT = 1.2; fx('shockwave', S.ground(m.position).clone(), { color: 0xf0bd6e, radius: s.o.tauntR || 10, duration: 0.8, thickness: 0.1, opacity: 0.35 }); }
          break;
        }
        case 'clone': {
          m.scale.setScalar(Math.max(0.01, k));
          P.torso.rotation.y = Math.sin(T * 1.5) * 0.2; P.head.position.y = 1.9 + Math.sin(T * 2.2) * 0.04;
          m.userData.mat.uniforms.opacity.value = 0.7 + Math.sin(T * 6) * 0.1;
          s.fxT -= dt;
          if (s.fxT <= 0) { s.fxT = 0.25; tv.copy(m.position); tv.y += 0.4; fx('burst', tv, { count: 2, shape: 'droplet', color: [glint(0x6fc8ff), 0x6fc8ff], speed: 1, up: 1.5, size: 0.1, life: 0.6, gravity: 6 }); }
          break;
        }
        case 'beacon': {
          m.scale.setScalar(Math.max(0.01, k));
          P.flame.scale.setScalar(1 + Math.sin(T * 9) * 0.15); P.halo.scale.setScalar(1 + Math.sin(T * 3) * 0.1); P.cage.rotation.y += dt;
          s.fxT -= dt;
          if (s.fxT <= 0) {
            s.fxT = 1;
            const R = s.o.revealR || 12;
            fx('shockwave', S.ground(m.position).clone(), { color: 0xffe08a, radius: R, duration: 0.9, thickness: 0.08, opacity: 0.35 });
            near.length = 0; C()?.queryRadius?.(tv.copy(m.position), R, '!player', near);
            for (const e of near) {
              if (!e.alive || e.isProp) continue;
              e.revealedUntil = game.time + 1.5;
              if (e.stealth) e.stealth = false;
              if ((e.voidShield || 0) > 0) { try { C()?.drainShield?.(e, 4); } catch (_) { /* */ } }
            }
            // purify blight on the player within purifyR
            const pp = game.player?.object?.position, pe = game.player?.entity;
            if (pp && pe && pp.distanceTo(m.position) < (s.o.purifyR || 4)) { try { C()?.clearStatus?.(pe, 'blight'); } catch (_) { /* */ } }
            api.terrain.bless(s.home, s.o.purifyR || 4, 2);
          }
          break;
        }
        case 'mirror': {
          m.scale.setScalar(Math.max(0.01, k));
          m.position.y = s.home.y + 1.8 + Math.sin(T * 2) * 0.2;
          m.rotation.y += dt * 0.9;
          P.frame.rotation.z += dt * 2;
          break;
        }
        case 'lightpillar': {
          m.scale.set(Math.max(0.01, k), Math.max(0.01, Math.min(1, s.t / 0.2)), Math.max(0.01, k));
          P.col.material.uniforms.opacity.value = 0.8 + Math.sin(T * 7) * 0.2;
          s.fxT -= dt;
          if (s.fxT <= 0) { s.fxT = 0.2; tv.copy(m.position); tv.y += Math.random() * 6; fx('burst', tv, { count: 2, shape: 'mote', color: [glint(0xffe08a), 0xffe08a], radius: 0.6, speed: 0.3, up: 1.5, size: 0.16, life: 0.8 }); }
          break;
        }
        default: break;
      }
    }
  }

  function despawnSkill(skillId) { for (let i = live.length - 1; i >= 0; i--) if (!skillId || live[i].skillId === skillId) end(live[i], false); }
  function prewarm() { for (const m of all) m.visible = true; return null; }
  function afterPrewarm() { for (const m of all) if (!m.userData.busy) m.visible = false; }
  return { spawn, update, despawnSkill, live, prewarm, afterPrewarm, count: () => live.length, end };
}

/**
 * Structures: erupting rock/ice pillars (S.props eruptors, instanced), world platforms and temp colliders, prism relays.
 * Each handle cleans itself up after its life.
 */
export function createStructures(S, api) {
  const { game } = S;
  const fx = (n, ...a) => { try { return S.looks ? S.looks.fx(n, a) : game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  const live = [];
  const tv = new THREE.Vector3();
  // the glacier block is a dedicated pooled mesh (2): a big faceted ice block with an outline
  const glacierGeo = (() => { const g = new THREE.DodecahedronGeometry(1, 0); g.scale(1.6, 1.0, 1.6); return g; })();
  const glacierMat = iceMatSolid();
  const glaciers = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(glacierGeo, glacierMat); addOutline(m, 0.03, 0x1d4a66); m.visible = false; m.castShadow = false;
    const glow = new THREE.Mesh(glacierGeo, fresnelMat(0x9fe8ff, { power: 1.8, intensity: 1.2, core: 0.0 })); glow.scale.setScalar(1.06); m.add(glow);
    game.scene.add(m); glaciers.push(m);
  }
  // the colossus fist: rock geometry built from pillar geo pieces (pooled 2)
  const fistGeo = (() => {
    const parts = [];
    const palm = new THREE.BoxGeometry(1.8, 1.6, 1.2); palm.translate(0, 0.8, 0); parts.push(ni(palm));
    for (let i = 0; i < 4; i++) { const f = new THREE.BoxGeometry(0.38, 0.9, 0.5); f.translate(-0.62 + i * 0.41, 1.95, 0.15); f.rotateX(-0.25); parts.push(ni(f)); }
    const th = new THREE.BoxGeometry(0.45, 0.8, 0.5); th.rotateZ(0.7); th.translate(1.1, 1.1, 0.2); parts.push(ni(th));
    const arm = new THREE.CylinderGeometry(0.8, 1.1, 2.4, 7); arm.translate(0, -1.2, 0); parts.push(ni(arm));
    return mergeGeometries(parts);
  })();
  const fists = [];
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(fistGeo, rockMat()); addOutline(m, 0.03, 0x2a1c10); m.visible = false; game.scene.add(m); fists.push(m); }
  void pillarGeo; void crystalGeo;

  /** pillar(kind:'ice'|'rock'|'step'|'glacier'|'fist', pos, {h, r, life, platform, relay, yaw}) → handle */
  function pillar(kind, pos, o = {}) {
    const gy = S.height(pos.x, pos.z);
    const life = o.life ?? 8, h = o.h ?? 4, r = o.r ?? 1.2;
    const H = { kind, pos: new THREE.Vector3(pos.x, gy, pos.z), t: 0, life, h, platform: null, collider: null, relay: null, mesh: null, alive: true };
    if (kind === 'ice') {
      S.props.spikes.spawn(pos.x, gy - 0.3, pos.z, { height: h, width: r * 1.6, rise: 0.18, hold: life, sink: 0.5, yaw: o.yaw ?? Math.random() * 6.28, keep: true });
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.3; S.props.spikes.spawn(pos.x + Math.cos(a) * r * 0.9, gy - 0.2, pos.z + Math.sin(a) * r * 0.9, { height: h * 0.45, width: r * 0.7, rise: 0.2, delay: 0.05 * i, hold: life - 0.2, sink: 0.4, tiltX: Math.cos(a) * 0.35, tiltZ: Math.sin(a) * 0.35 }); }
    } else if (kind === 'rock' || kind === 'step') {
      S.props.pillars.spawn(pos.x, gy - 0.2, pos.z, { height: h, width: r * 1.3, rise: 0.16, hold: life, sink: 0.5, yaw: o.yaw ?? Math.random() * 6.28, keep: true });
    } else if (kind === 'glacier') {
      const m = glaciers.find((x) => !x.visible) || glaciers[0];
      m.visible = true; m.position.set(pos.x, gy + h + 8, pos.z); m.rotation.set(0, Math.random() * 6.28, 0); m.scale.set(r / 1.6, h / 2, r / 1.6);
      H.mesh = m; H.dropY = gy + h * 0.5; H.fall = true;
    } else if (kind === 'fist') {
      const m = fists.find((x) => !x.visible) || fists[0];
      m.visible = true; m.position.set(pos.x, gy - 3.5, pos.z); m.rotation.set(0, o.yaw ?? 0, 0); m.scale.setScalar(r / 1.8);
      H.mesh = m; H.riseY = gy + 0.2; H.rise = true;
    }
    if (o.platform && game.world?.addPlatform) {
      try { H.platform = game.world.addPlatform({ id: 'spell:' + kind, shape: 'disc', center: H.pos.clone(), r: Math.max(0.8, r * (kind === 'glacier' ? 1 : 0.8)), top: gy + h, life }); } catch (_) { H.platform = null; }
    }
    if (o.collider !== false && (kind === 'ice' || kind === 'rock' || kind === 'step' || kind === 'glacier') && game.world?.addTempCollider) {
      try { H.collider = game.world.addTempCollider({ shape: 'cyl', pos: H.pos.clone(), r: r * 0.8, h, life, blocksProjectiles: !!o.blocksProjectiles }); } catch (_) { H.collider = null; }
    }
    if (o.relay) H.relay = api.addRelay({ position: H.pos.clone().setY(gy + h * 0.6), alive: true, kind: 'pillar', isRelay: true });
    live.push(H);
    return H;
  }
  /** wall(center, dir, {w, h, life, reflect, blocksProjectiles, kind:'rock'|'ice'|'thorn'}) → handle (temp collider box + pillar visuals). */
  function wall(center, dir, o = {}) {
    const w = o.w || 6, h = o.h || 3, life = o.life || 8;
    const yaw = Math.atan2(dir.x, dir.z);
    const px = Math.cos(yaw), pz = -Math.sin(yaw);   // perpendicular to dir
    const n = Math.max(3, Math.round(w / 1.2));
    const gy = S.height(center.x, center.z);
    for (let i = 0; i < n; i++) {
      const k = (i / (n - 1) - 0.5) * w;
      const x = center.x + px * k, z = center.z + pz * k;
      const y = S.height(x, z);
      const eru = o.kind === 'ice' ? S.props.spikes : S.props.pillars;
      eru.spawn(x, y - 0.3, z, { height: h * (0.85 + Math.random() * 0.3), width: 1.15, delay: i * 0.03, rise: 0.16, hold: life, sink: 0.5, yaw, keep: true });
    }
    const H = { kind: 'wall', pos: new THREE.Vector3(center.x, gy, center.z), dir: dir.clone(), t: 0, life, alive: true, collider: null, o };
    try {
      H.collider = game.world?.addTempCollider?.({ shape: 'box', pos: H.pos.clone(), size: { x: w, y: h, z: 1.2 }, h, yaw, life, blocksProjectiles: o.blocksProjectiles !== false,
        onProjectile: o.reflect ? () => 'reflect' : undefined }) || null;
    } catch (_) { H.collider = null; }
    tv.copy(H.pos); tv.y += 0.3;
    fx('burst', tv, { count: 30, shape: 'dust', color: [0xc8a070, 0x6a5030], alpha: 0.6, additive: false, radius: w * 0.4, speed: 2, up: 2, size: 0.8, sizeEnd: 1.6, life: 0.8 });
    fx('debris', tv, { count: 12, material: 'rock', color: 0x7a6248, size: 0.25, speed: 7, life: 1.2 });
    live.push(H);
    return H;
  }
  function end(H) {
    H.alive = false;
    if (H.platform) { try { game.world?.removePlatform?.(H.platform); } catch (_) { /* */ } }
    if (H.collider) { try { game.world?.removeCollider?.(H.collider); } catch (_) { /* */ } }
    if (H.relay) { H.relay.alive = false; api.removeRelay(H.relay); }
    if (H.mesh) H.mesh.visible = false;
    try { H.onEnd?.(H); } catch (err) { console.warn('[spells.structures] onEnd', err); }
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const H = live[i];
      H.t += dt;
      if (H.mesh && H.fall) {
        H.mesh.position.y -= dt * 38;
        if (H.mesh.position.y <= H.dropY) { H.mesh.position.y = H.dropY; H.fall = false; try { H.onLand?.(H); } catch (err) { console.warn('[spells.structures] onLand', err); } }
      }
      if (H.mesh && H.rise) {
        H.mesh.position.y = Math.min(H.riseY, H.mesh.position.y + dt * 22);
        if (H.mesh.position.y >= H.riseY) { H.rise = false; H.sinkAt = H.t + 0.9; }
      }
      if (H.mesh && H.kind === 'fist' && H.sinkAt && H.t > H.sinkAt) H.mesh.position.y -= dt * 6;
      if (H.t >= H.life) { live.splice(i, 1); end(H); }
    }
  }
  function prewarm() { for (const m of glaciers.concat(fists)) m.visible = true; return null; }
  function afterPrewarm() { for (const m of glaciers.concat(fists)) if (!live.some((H) => H.mesh === m)) m.visible = false; }
  function clear() { while (live.length) end(live.pop()); }
  return { pillar, wall, update, live, prewarm, afterPrewarm, clear };
}
