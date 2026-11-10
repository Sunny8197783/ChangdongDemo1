// Pooled world objects (CONTRACT §11 api.objects, DESIGN §12 pools): seed pods, crystal shards, mines, droplets, soul orbs,
// ice flowers, sunflower turrets and lightning rods. ONE InstancedMesh per kind (one draw call; hidden = 0 calls when idle).
// Instance colours are written at construction (setColorAt + needsUpdate, CONTRACT §23) so a tint never recompiles.
// Pool sizes are hard caps: spawning past the cap recycles the oldest instance (never allocates).
// Element hits on an object go through combat.reactObject (pods: burgeon/hyperbloom/…, crystals: prism); combat then calls
// obj.onReact(id, el) and we despawn. Bursts caused by other bursts (mine chains, pod cascades) use combat's stagger queue.
import * as THREE from 'three';
import { glint, GLINT } from './palette.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { elColor } from '../core/elements.js';
import { toonMat } from '../core/utils.js';
import { crystalGeo } from './assets.js';

const ni = (g) => (g.index ? g.toNonIndexed() : g);
const POOL = { pod: 16, crystal: 8, mine: 6, droplet: 12, soul: 8, flower: 4, turret: 2, rod: 4 };
export const OBJECT_KINDS = Object.keys(POOL);
const LIFE = { pod: 5, crystal: 10, mine: 20, droplet: 8, soul: 10, flower: 4, turret: 6, rod: 12 };
const BASE_COL = { pod: 0x9be86a, crystal: GLINT, mine: 0xd4b4ff, droplet: 0x8fd8ff, soul: 0xc9a8ff, flower: 0xcff6ff, turret: 0xffe08a, rod: 0xe9d8ff };
const PICK_R = { crystal: 1.5, soul: 1.7, droplet: 1.3 };

function podGeo() {
  const bulb = new THREE.IcosahedronGeometry(0.34, 1); bulb.scale(1, 1.25, 1); bulb.translate(0, 0.42, 0);
  const parts = [bulb];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.ConeGeometry(0.12, 0.5, 4); leaf.rotateZ(1.0); leaf.rotateY((i / 3) * Math.PI * 2); leaf.translate(Math.cos((i / 3) * Math.PI * 2) * 0.22, 0.14, -Math.sin((i / 3) * Math.PI * 2) * 0.22);
    parts.push(leaf);
  }
  const tip = new THREE.ConeGeometry(0.08, 0.28, 5); tip.translate(0, 0.95, 0); parts.push(tip);
  return mergeGeometries(parts.map(ni));
}
function mineGeo() {
  const base = new THREE.CylinderGeometry(0.36, 0.42, 0.14, 8); base.translate(0, 0.07, 0);
  const core = new THREE.OctahedronGeometry(0.2, 0); core.scale(1, 1.6, 1); core.translate(0, 0.36, 0);
  const parts = [base, core];
  for (let i = 0; i < 4; i++) { const s = new THREE.ConeGeometry(0.06, 0.3, 4); s.rotateZ(Math.PI / 2); s.rotateY((i / 4) * Math.PI * 2); s.translate(Math.cos((i / 4) * Math.PI * 2) * 0.42, 0.1, -Math.sin((i / 4) * Math.PI * 2) * 0.42); parts.push(s); }
  return mergeGeometries(parts.map(ni));
}
function flowerGeo() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.OctahedronGeometry(0.42, 0); p.scale(0.35, 0.12, 1); p.translate(0, 0.12, 0.42); p.rotateY((i / 6) * Math.PI * 2);
    parts.push(p);
  }
  const c = new THREE.OctahedronGeometry(0.22, 0); c.scale(1, 1.8, 1); c.translate(0, 0.32, 0); parts.push(c);
  return mergeGeometries(parts.map(ni));
}
function turretGeo() {
  const stem = new THREE.CylinderGeometry(0.07, 0.1, 1.2, 6); stem.translate(0, 0.6, 0);
  const head = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10); head.rotateX(Math.PI / 2); head.translate(0, 1.35, 0);
  const parts = [stem, head];
  for (let i = 0; i < 10; i++) { const p = new THREE.ConeGeometry(0.1, 0.36, 4); p.rotateZ(-Math.PI / 2); p.translate(0.46, 0, 0); p.rotateZ((i / 10) * Math.PI * 2); p.translate(0, 1.35, 0.02); parts.push(p); }
  return mergeGeometries(parts.map(ni));
}
function rodGeo() {
  const shaft = new THREE.CylinderGeometry(0.05, 0.08, 2.2, 6); shaft.translate(0, 1.1, 0);
  const ring = new THREE.TorusGeometry(0.22, 0.04, 5, 12); ring.rotateX(Math.PI / 2); ring.translate(0, 1.7, 0);
  const tip = new THREE.OctahedronGeometry(0.16, 0); tip.scale(1, 2, 1); tip.translate(0, 2.35, 0);
  return mergeGeometries([shaft, ring, tip].map(ni));
}

export function createObjects(S) {
  const { game } = S;
  const E = game.events;
  const fx = (n, ...a) => { try { return S.looks ? S.looks.fx(n, a) : game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  const glowMat = (opacity = 0.95) => new THREE.MeshBasicMaterial({ color: GLINT, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const GEO = {
    pod: podGeo(), crystal: crystalGeo(), mine: mineGeo(), droplet: new THREE.SphereGeometry(0.17, 10, 8),
    soul: new THREE.IcosahedronGeometry(0.24, 2), flower: flowerGeo(), turret: turretGeo(), rod: rodGeo(),
  };
  const MAT = {
    pod: toonMat(GLINT, { emissive: 0x1d3a12, emissiveIntensity: 0.6 }), crystal: glowMat(0.9), mine: toonMat(GLINT, { emissive: 0x2a1850, emissiveIntensity: 0.8 }),
    droplet: glowMat(0.9), soul: glowMat(0.95), flower: glowMat(0.85), turret: toonMat(GLINT, { emissive: 0x6a4a10, emissiveIntensity: 0.5 }),
    rod: toonMat(GLINT, { emissive: 0x3a2a70, emissiveIntensity: 0.9 }),
  };
  const meshes = {}, lists = {}, active = {};
  const col = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const kind of OBJECT_KINDS) {
    const n = POOL[kind];
    const m = new THREE.InstancedMesh(GEO[kind], MAT[kind], n);
    m.name = 'spells.objects.' + kind;
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    col.setHex(BASE_COL[kind]);
    for (let i = 0; i < n; i++) { m.setColorAt(i, col); m.setMatrixAt(i, ZERO); }
    m.instanceColor.needsUpdate = true;
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.visible = false;
    if (kind === 'crystal' || kind === 'droplet' || kind === 'soul' || kind === 'flower') m.renderOrder = 3;
    try { game.scene.add(m); } catch (_) { /* */ }
    meshes[kind] = m;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const position = new THREE.Vector3();
      arr.push({ kind, idx: i, alive: false, position, pos: position, element: null, life: 0, maxLife: 0, age: 0, seq: 0, source: 'player',
        r: 0, data: {}, timer: 0, timer2: 0, phase: Math.random() * 6.28, scale: 1, hit: null, onReact: null, isObject: true, team: 'object' });
    }
    lists[kind] = arr; active[kind] = 0;
  }
  let seq = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), eu = new THREE.Euler();
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3();
  const near = [];
  const C = () => S.combat;   // shim: stamps the cast castId on every hit
  const playerPos = () => game.player?.object?.position || null;
  const pl = () => game.player;

  function setTint(o, hex) { col.setHex(hex); meshes[o.kind].setColorAt(o.idx, col); meshes[o.kind].instanceColor.needsUpdate = true; }

  function capFor(kind) {
    if (kind === 'pod') {
      let add = 0; try { add = game.stats?.get?.('podCapAdd') || 0; } catch (_) { /* */ }
      return Math.min(POOL.pod, 10 + add);
    }
    return POOL[kind];
  }
  /** Free slot, else recycle the oldest live one (quietly). */
  function take(kind) {
    const arr = lists[kind]; if (!arr) return null;
    let alive = 0, oldest = null;
    for (const o of arr) if (o.alive) { alive++; if (!oldest || o.seq < oldest.seq) oldest = o; }
    if (alive >= capFor(kind) && oldest) { kill(oldest, false); }
    for (const o of arr) if (!o.alive) return o;
    if (oldest) { kill(oldest, false); return oldest; }
    return null;
  }

  /** spawn(kind, pos, opts) → object | null. opts: {element, life, source, hit, r, heal, orbit, max, owner, data, mini, chainTrigger, pull}. */
  function spawn(kind, pos, opts = {}) {
    if (!POOL[kind] || !pos) return null;
    if (opts.max && opts.owner) {   // per-skill cap (lightning.mine max 3)
      let n = 0, oldest = null;
      for (const o of lists[kind]) if (o.alive && o.data.owner === opts.owner) { n++; if (!oldest || o.seq < oldest.seq) oldest = o; }
      if (n >= opts.max && oldest) kill(oldest, false);
    }
    const o = take(kind); if (!o) return null;
    o.alive = true; o.seq = ++seq; o.age = 0; o.timer = 0; o.timer2 = 0; o.scale = opts.mini ? 0.7 : 1;
    o.element = opts.element || (kind === 'pod' ? 'nature' : kind === 'mine' || kind === 'rod' ? 'lightning' : kind === 'flower' ? 'ice' : kind === 'turret' ? 'light' : kind === 'soul' ? 'shadow' : kind === 'droplet' ? 'water' : 'earth');
    o.life = o.maxLife = opts.life ?? LIFE[kind];
    o.source = opts.source ?? 'player';
    o.hit = opts.hit || null;
    o.r = opts.r ?? (kind === 'mine' ? 2.5 : kind === 'flower' ? 4 : kind === 'rod' ? 6 : 1);
    const d = o.data; for (const k in d) delete d[k];
    if (opts.data) Object.assign(d, opts.data);
    d.owner = opts.owner || null; d.mini = !!opts.mini; d.heal = opts.heal || 0.02; d.orbit = !!opts.orbit;
    d.chainTrigger = opts.chainTrigger || 0; d.pull = opts.pull || 0; d.armed = kind !== 'mine';
    o.position.copy(pos);
    if (kind !== 'droplet' || !d.orbit) o.position.y = S.height(pos.x, pos.z) + (kind === 'crystal' ? 0.9 : kind === 'soul' ? 1.0 : kind === 'droplet' ? 0.6 : 0);
    if (kind === 'droplet' && d.orbit) {
      let n = 0; for (const x of lists.droplet) if (x.alive && x !== o && x.data.orbit) n++;
      if (n >= (opts.maxOrbit || 3)) { o.alive = false; return null; }
      d.slot = n;
    }
    o.onReact = onReact;
    let hex = elColor(o.element, 'mid');
    if (kind === 'pod') hex = d.mini ? 0xc8f080 : 0x9be86a;
    else if (kind === 'mine' || kind === 'rod') hex = 0xe9d8ff;
    setTint(o, hex);
    active[kind]++;
    meshes[kind].visible = true;
    // spawn flourish
    tv.copy(o.position); tv.y += 0.4;
    if (kind === 'pod') fx('burst', tv, { count: 10, shape: 'leaf', color: [0xd8ff9a, 0x5fae3a], speed: 2.4, up: 1.5, spread: 1, size: 0.18, life: 0.6, gravity: 4 });
    else if (kind === 'crystal') fx('burst', tv, { count: 14, shape: 'shard', color: [elColor(o.element, 'core'), elColor(o.element, 'mid')], speed: 3, spread: 1, size: 0.16, life: 0.5, drag: 2 });
    else if (kind === 'mine') { fx('shockwave', S.ground(o.position).clone(), { color: 0xc9a4ff, radius: o.r, duration: 0.4, thickness: 0.12 }); }
    else if (kind === 'rod') fx('burst', tv.setY(o.position.y + 2.2), { count: 18, shape: 'spark', color: [glint(0xc9a4ff), 0xc9a4ff], speed: 6, spread: 1, size: 0.1, life: 0.35, drag: 2 });
    else if (kind === 'flower') fx('burst', tv, { count: 18, shape: 'snow', color: [glint(0x9fe8ff), 0x9fe8ff], disc: true, radius: 0.3, speed: 3, size: 0.18, life: 0.6, drag: 2 });
    else if (kind === 'turret') fx('burst', tv.setY(o.position.y + 1.3), { count: 16, shape: 'petal', color: [0xfff2a0, 0xffc24a], speed: 2.5, spread: 1, size: 0.22, life: 0.7, drag: 2 });
    E.emit('objectSpawn', { kind, point: o.position, element: o.element });
    return o;
  }

  function kill(o, burstFx = true) {
    if (!o.alive) return;
    o.alive = false; active[o.kind] = Math.max(0, active[o.kind] - 1);
    meshes[o.kind].setMatrixAt(o.idx, ZERO); meshes[o.kind].instanceMatrix.needsUpdate = true;
    if (burstFx) {
      tv.copy(o.position); tv.y += 0.4;
      fx('burst', tv, { count: 12, shape: o.kind === 'pod' ? 'petal' : 'spark', color: [elColor(o.element, 'core'), elColor(o.element, 'mid')], speed: 3, spread: 1, size: 0.15, life: 0.45, drag: 2 });
    }
  }
  /** combat.reactObject → obj.onReact(id, el): pods pop; a crystal that refracted light stays (it is a prism relay). */
  function onReact(id, el) {
    const o = this && this.isObject ? this : null; if (!o) return;
    if (o.kind === 'crystal' && id === 'prism') { o.life = Math.max(o.life, 2); return; }
    E.emit('objectBurst', { kind: o.kind, point: o.position, element: el, reaction: id });
    const reseed = o.kind === 'pod' && !o.data.mini && rxRank('nature.rx') > 0;
    const p = tv3.copy(o.position);
    kill(o, true);
    if (reseed) S.later(0.35, () => spawn('pod', p, { mini: true, life: 5, source: o.source }));
  }
  const rxRank = (id) => { try { return game.progression?.rank?.(id) || 0; } catch (_) { return 0; } };

  /** near(kind, pos, r, out): live objects of kind within r (XZ). kind '*' = all kinds. */
  function near_(kind, pos, r, out = []) {
    const kinds = kind === '*' ? OBJECT_KINDS : [kind];
    for (const k of kinds) {
      const arr = lists[k]; if (!arr || !active[k]) continue;
      for (const o of arr) {
        if (!o.alive) continue;
        const dx = o.position.x - pos.x, dz = o.position.z - pos.z;
        if (dx * dx + dz * dz <= r * r) out.push(o);
      }
    }
    return out;
  }

  /** burst(obj, el, hit): an element hits the object → combat reaction (pods/crystals) or the object's own response. */
  function burst(o, el, hit = {}) {
    if (!o?.alive) return null;
    if (o.kind === 'pod' || o.kind === 'crystal') {
      const c = C();
      if (c?.reactObject) {
        hit.object = o;
        const r = c.reactObject(o, el, hit);
        if (r) return r;
      }
      if (o.kind === 'pod' && el !== 'nature') { podPop(o, el); return { id: 'pop' }; }
      return null;
    }
    if (o.kind === 'flower' && (el === 'earth' || hit.heavy || hit.tier === 'heavy')) {
      const p = tv2.copy(o.position); p.y += 0.5;
      fx('preset', 'explosion_ice', p, { scale: 1.2 });
      fx('burst', p, { count: 40, shape: 'shard', color: [glint(0x9fe8ff), 0x9fe8ff], speed: 10, spread: 1, size: 0.2, life: 0.6, gravity: 10 });
      aoeHit(p, 5, { amount: 40, element: 'ice', tags: ['reaction', 'shatter'], tier: 'heavy', rxId: 'shatter' }, o.source);
      kill(o, false);
      return { id: 'shatter' };
    }
    if (o.kind === 'mine' && (el === 'lightning' || el === 'fire')) { detonate(o, 1); return { id: 'mine' }; }
    return null;
  }

  /** Damage helper for object effects (unscaled base; combat scales player sources). */
  function aoeHit(point, r, tpl, source, team = 'enemy') {
    const c = C(); if (!c?.queryRadius) return 0;
    near.length = 0;
    c.queryRadius(point, r, team === 'enemy' ? '!player' : team, near);
    const list = near.slice();
    let n = 0;
    for (const e of list) {
      if (!e?.alive) continue;
      const h = Object.assign({ source: source === 'player' ? (game.player?.entity || 'player') : source }, tpl);
      h.point = c.getCenter ? c.getCenter(e, new THREE.Vector3()) : e.object.position.clone();
      h.direction = new THREE.Vector3(e.object.position.x - point.x, 0, e.object.position.z - point.z);
      if (h.direction.lengthSq() < 1e-4) h.direction.set(0, 0, 1);
      h.direction.normalize();
      try { c.dealDamage(e, h); n++; } catch (err) { if (!aoeHit.w) { aoeHit.w = 1; console.warn('[spells.objects] hit', err); } }
    }
    return n;
  }

  /** A seed pod pops on its own (expiry) or from a non-reacting element: 30 nature r 3, heals the player 3% within 6 m. */
  function podPop(o, el) {
    const p = tv2.copy(o.position); p.y += 0.5;
    const k = o.data.mini ? 0.5 : 1;
    fx('preset', 'impact_nature', p, { scale: 0.9 });
    fx('burst', p, { count: 24, shape: 'petal', color: [0xf4ffd0, 0x8fe05a], speed: 4, spread: 1, up: 1, size: 0.22, life: 0.8, gravity: 3, drag: 1.5 });
    fx('shockwave', S.ground(p).clone(), { color: 0x8fe05a, radius: 3, duration: 0.4, thickness: 0.2 });
    S.sfx('impact_nature', { position: p, volume: 0.6 });
    aoeHit(p, 3, { amount: 30 * k, element: 'nature', tags: ['pod'], tier: 'light', status: { seeded: { stacks: 1 } } }, o.source);
    const pp = playerPos();
    if (pp && pp.distanceTo(p) < 6) heal((pl()?.maxHp || 100) * 0.03 * k * (1 + 0.01 * rxRank('nature.p1')), 'bloom');
    E.emit('objectBurst', { kind: 'pod', point: o.position, element: el || 'nature' });
    const reseed = !o.data.mini && rxRank('nature.rx') > 0;
    const src = o.source; const at = tv3.copy(o.position);
    kill(o, false);
    if (reseed) S.later(0.3, () => spawn('pod', at, { mini: true, life: 5, source: src }));
  }
  function heal(amount, source) {
    const c = C();
    try { if (c?.healPlayer) return c.healPlayer(amount, source, { hot: false }); } catch (_) { /* */ }
    const p = pl(); if (!p) return 0;
    p.hp = Math.min(p.maxHp || 100, (p.hp || 0) + amount); if (p.entity) p.entity.hp = p.hp;
    return amount;
  }

  // ---------- mines ----------
  function detonate(o, depth = 1) {
    if (!o.alive) return;
    const p = tv2.copy(o.position); p.y += 0.4;
    const pullR = o.data.pull || 0;
    const blast = () => {
      fx('preset', 'explosion_lightning', p, { scale: 0.9 });
      fx('burst', p, { count: 30, shape: 'spark', color: [glint(0xc9a4ff), 0xc9a4ff], speed: 12, spread: 1, size: 0.12, life: 0.4, drag: 2, velocityStretch: true });
      fx('groundDecal', 'lichtenberg', S.ground(p).clone(), o.r, 5);
      S.sfx('impact_lightning', { position: p });
      const tpl = o.hit ? Object.assign({}, o.hit) : { amount: 40, element: 'lightning', status: { shocked: { dur: 5 }, stunned: { dur: 0.6 } } };
      tpl.tier = tpl.tier || 'heavy';
      aoeHit(p, o.r + 0.5, tpl, o.source);
      try { S.zones?.elementAt?.(p, o.r, 'lightning', { source: 'mine' }); S.zones2?.chargeWater?.(p, o.r); } catch (_) { /* */ }   // charges puddles (electro water)
      E.emit('objectBurst', { kind: 'mine', point: o.position, element: 'lightning' });
      const chain = o.data.chainTrigger || 0;
      const at = o.position.clone();
      kill(o, false);
      if (chain > 0 && depth < 4) {
        const others = near_('mine', at, chain, []);
        let i = 0;
        for (const m of others) { if (m === o || !m.alive) continue; i++; stagger(0.08 + i * 0.04, () => detonate(m, depth + 1), depth + 1); }
      }
    };
    if (pullR > 0) {
      const c = C(); near.length = 0;
      c?.queryRadius?.(p, o.r + pullR, '!player', near);
      for (const e of near) {
        if (!e.alive || e.isBoss || e.isProp || !e.velocity) continue;
        tv.subVectors(p, e.object.position).setY(0); const L = tv.length(); if (L < 0.4) continue;
        e.velocity.addScaledVector(tv.multiplyScalar(1 / L), Math.min(14, L * 4));
      }
      fx('burst', p, { count: 20, shape: 'spark', color: [glint(0x9a7bff), 0x9a7bff], radius: o.r + pullR, inward: true, speed: (o.r + pullR) * 3, size: 0.12, life: 0.3 });
      o.alive && (o.data.armed = false);
      S.later(0.25, blast);
    } else blast();
  }
  /** Queue a burst caused by another burst (combat's staggered cascade queue when present). */
  function stagger(delay, fn, depth) {
    const q = game.combat?.enqueue || game.combat?._debug?.rx?.enqueue;
    if (q) { try { q(delay, fn, depth); return; } catch (_) { /* */ } }
    S.later(delay, fn);
  }

  // ---------- per-frame ----------
  const enemiesNear = [];
  function update(dt) {
    const T = game.time || 0;
    const pp = playerPos();
    for (const kind of OBJECT_KINDS) {
      if (!active[kind]) { if (meshes[kind].visible) meshes[kind].visible = false; continue; }
      const mesh = meshes[kind];
      let dirty = false;
      for (const o of lists[kind]) {
        if (!o.alive) continue;
        o.age += dt; o.life -= dt; dirty = true;
        if (o.life <= 0) { expire(o); continue; }
        behave(o, dt, T, pp);
        if (!o.alive) continue;
        // pose
        const grow = Math.min(1, o.age / 0.25), fade = Math.min(1, o.life / 0.35);
        let s = o.scale * grow * (0.6 + 0.4 * fade), y = o.position.y, ry = 0;
        switch (kind) {
          case 'pod': s *= 1 + Math.sin(T * 5 + o.phase) * 0.06 + (o.life < 1.2 ? Math.sin(T * 30) * 0.08 : 0); ry = o.phase; break;
          case 'crystal': y += Math.sin(T * 2 + o.phase) * 0.12; ry = T * 1.4 + o.phase; s *= 0.55; break;
          case 'soul': y += Math.sin(T * 3 + o.phase) * 0.15; ry = T * 2; s *= 1 + Math.sin(T * 9 + o.phase) * 0.1; break;
          case 'droplet': ry = 0; s *= 1 + Math.sin(T * 7 + o.phase) * 0.12; break;
          case 'mine': ry = T * (o.data.armed ? 1.5 : 0.3); s *= o.data.armed ? 1 + Math.max(0, Math.sin(T * 6 + o.phase)) * 0.08 : 0.85; break;
          case 'flower': ry = T * 0.8 + o.phase; s *= 1 + Math.sin(T * 4) * 0.04; break;
          case 'turret': { ry = o.data.yaw || 0; break; }
          case 'rod': ry = T * 0.6; break;
          default: break;
        }
        eu.set(0, ry, 0); q.setFromEuler(eu); sc.setScalar(Math.max(0.001, s));
        m4.compose(tv.set(o.position.x, y, o.position.z), q, sc);
        mesh.setMatrixAt(o.idx, m4);
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
      if (!active[kind]) mesh.visible = false;
    }
  }

  function expire(o) {
    switch (o.kind) {
      case 'pod': podPop(o); return;
      case 'mine': kill(o, true); return;
      case 'turret': case 'flower': kill(o, true); return;
      case 'rod': {
        tv.copy(o.position); tv.y += 2.2;
        fx('burst', tv, { count: 16, shape: 'spark', color: [glint(0xc9a4ff), 0xc9a4ff], speed: 5, spread: 1, size: 0.1, life: 0.3, drag: 2 });
        kill(o, false); return;
      }
      default: kill(o, true);
    }
  }

  function behave(o, dt, T, pp) {
    const c = C();
    switch (o.kind) {
      case 'pod': {
        o.timer -= dt;
        if (o.timer <= 0) { o.timer = 0.5; tv.copy(o.position); tv.y += 0.6; fx('burst', tv, { count: 1, shape: 'mote', color: [0xf4ffd0, 0x8fe05a], speed: 0.4, up: 0.8, size: 0.14, life: 0.8 }); }
        break;
      }
      case 'crystal': case 'soul': {
        o.timer -= dt;
        if (o.timer <= 0) { o.timer = 0.3; tv.copy(o.position); fx('burst', tv, { count: 1, shape: o.kind === 'soul' ? 'wisp' : 'spark', color: [elColor(o.element, 'core'), elColor(o.element, 'mid')], speed: 0.5, up: 0.6, size: 0.12, life: 0.6 }); }
        if (pp && o.age > 0.4 && o.position.distanceTo(tv2.copy(pp).setY(pp.y + 0.9)) < PICK_R[o.kind]) pickup(o);
        break;
      }
      case 'droplet': {
        if (!pp) break;
        if (o.data.orbit) {
          const a = T * 2.2 + (o.data.slot || 0) * 2.094;
          o.position.set(pp.x + Math.cos(a) * 1.1, pp.y + 1.2 + Math.sin(T * 3 + o.phase) * 0.15, pp.z + Math.sin(a) * 1.1);
          const p = pl();
          if (o.age > 1 && p && p.hp < (p.maxHp || 100) - 0.5) pickup(o);
        } else if (o.position.distanceTo(tv2.copy(pp).setY(pp.y + 0.6)) < PICK_R.droplet) pickup(o);
        break;
      }
      case 'mine': {
        if (!o.data.armed) { if (o.age > 0.5 && !o.data.pulling) { o.data.armed = true; fx('shockwave', S.ground(o.position).clone(), { color: 0xc9a4ff, radius: o.r, duration: 0.3, thickness: 0.08, opacity: 0.6 }); } break; }
        o.timer -= dt;
        if (o.timer > 0) break;
        o.timer = 0.1;
        enemiesNear.length = 0;
        c?.queryRadius?.(tv.copy(o.position).setY(o.position.y + 0.8), o.r, '!player', enemiesNear);
        for (const e of enemiesNear) { if (e.alive && !e.isProp) { o.data.pulling = true; detonate(o); break; } }
        if (o.alive) { o.timer2 -= 0.1; if (o.timer2 <= 0) { o.timer2 = 0.6; tv.copy(o.position); tv.y += 0.5; fx('burst', tv, { count: 2, shape: 'spark', color: [glint(0xc9a4ff), 0xc9a4ff], speed: 1.5, spread: 1, size: 0.07, life: 0.25 }); } }
        break;
      }
      case 'flower': {
        o.timer -= dt;
        if (o.timer > 0) break;
        o.timer = 1;
        tv.copy(o.position); tv.y += 0.2;
        fx('shockwave', tv, { color: 0x9fe8ff, radius: o.r, duration: 0.5, thickness: 0.12, opacity: 0.6 });
        fx('burst', tv, { count: 10, shape: 'snow', color: [glint(0x9fe8ff), 0x9fe8ff], disc: true, radius: 0.4, speed: o.r * 1.3, drag: 2, size: 0.18, life: 0.6 });
        enemiesNear.length = 0; c?.queryRadius?.(tv, o.r, '!player', enemiesNear);
        for (const e of enemiesNear) if (e.alive && !e.isProp) { try { c.applyStatus(e, 'chilled', 3, { source: o.source === 'player' ? game.player?.entity : o.source, stacks: 1, el: 'ice' }); } catch (_) { /* */ } }
        break;
      }
      case 'turret': {
        o.timer -= dt;
        if (o.timer > 0) break;
        o.timer = 0.6;
        enemiesNear.length = 0; c?.queryRadius?.(tv.copy(o.position).setY(o.position.y + 1.3), 12, '!player', enemiesNear);
        let best = null, bd = 1e9;
        for (const e of enemiesNear) { if (!e.alive || e.isProp) continue; const d = e.object.position.distanceToSquared(o.position); if (d < bd) { bd = d; best = e; } }
        if (!best) break;
        const to = c.getCenter ? c.getCenter(best, tv2) : tv2.copy(best.object.position);
        o.data.yaw = Math.atan2(to.x - o.position.x, to.z - o.position.z);
        S.projectiles.spawn({ kind: 'bolt', element: 'light', mesh: 'orb', pos: tv, dir: tv3.subVectors(to, tv), speed: 30, radius: 0.35, scale: 0.5, damage: 12, life: 0.8, homing: 6, target: best,
          status: { radiant: { stacks: 1 } }, tier: 'light', trailWidth: 0.15, trailLength: 6, tint: elColor('light', 'mid') });
        break;
      }
      case 'rod': {
        o.timer -= dt;
        if (o.timer > 0) break;
        o.timer = 1.2;
        tv.copy(o.position); tv.y += 2.35;
        fx('burst', tv, { count: 4, shape: 'spark', color: [glint(0xc9a4ff), 0xc9a4ff], speed: 3, spread: 1, size: 0.08, life: 0.25 });
        // puddles within r stay charged (zap the water network every 1.2 s)
        S.api?.zones?.chargeWater?.(o.position, o.r);
        break;
      }
      default: break;
    }
  }

  function pickup(o) {
    const p = pl(); const mx = p?.maxHp || 100;
    tv.copy(o.position);
    if (o.kind === 'crystal') {
      const el = o.element;
      let shield = 0.12 * mx; try { if ((game.progression?.rank?.('earth.rx') || 0) > 0) shield *= 1.5; } catch (_) { /* */ }
      S.shield?.(shield, 6, el);
      try { game.stats?.set?.('buff:crystal', { [el + 'Dmg']: 1.2 }, { duration: 6 }); } catch (_) { /* */ }
      fx('burst', tv, { count: 26, shape: 'shard', color: [elColor(el, 'core'), elColor(el, 'mid')], speed: 5, spread: 1, size: 0.16, life: 0.5, drag: 2 });
      S.sfx('crystal', { position: tv }); S.sfx('ui_select', { pitch: 1.6, volume: 0.5 });
      E.emit('crystalPickup', { element: el });
    } else if (o.kind === 'soul') {
      try { if (p?.mp != null && p.maxMp) p.mp = Math.min(p.maxMp, p.mp + 15); } catch (_) { /* */ }
      try { if (p?.stamina != null && p.maxStamina) p.stamina = Math.min(p.maxStamina, p.stamina + 15); } catch (_) { /* */ }
      try { p?.addResolve?.(15); } catch (_) { /* */ }
      heal(mx * 0.05, 'soul');
      fx('burst', tv, { count: 18, shape: 'wisp', color: [0xe0c8ff, 0x9a5cff], speed: 3, up: 2, size: 0.3, life: 0.8 });
    } else if (o.kind === 'droplet') {
      heal(mx * (o.data.heal || 0.02), 'droplet');
      fx('burst', tv, { count: 12, shape: 'droplet', color: [glint(0x6fc8ff), 0x6fc8ff], speed: 3, spread: 1, size: 0.14, life: 0.5, gravity: 6 });
    }
    kill(o, false);
  }

  function despawnAll(kind) { for (const k of kind ? [kind] : OBJECT_KINDS) for (const o of lists[k]) if (o.alive) kill(o, false); }
  function count(kind) { return kind ? active[kind] || 0 : OBJECT_KINDS.reduce((a, k) => a + active[k], 0); }

  /** Boot pre-warm: every kind's mesh is in the scene already; make them visible for the compile (update hides idle ones). */
  function prewarm() { for (const k of OBJECT_KINDS) meshes[k].visible = true; return null; }

  return { spawn, near: near_, burst, update, kill, despawnAll, count, prewarm, lists, meshes, POOL, KINDS: OBJECT_KINDS, detonate, podPop, aoeHit };
}
