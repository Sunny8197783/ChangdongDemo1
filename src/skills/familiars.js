// 정령 동료 (spiritcaller familiars, DESIGN §2.2) — tiny instanced spirit wisps + their pooled element bolts.
// One InstancedMesh for everything (wisp cores, wisp halos, bolts, bolt glows): ONE draw call, hidden (0 calls) when idle.
// Instance colours are written at construction (setColorAt + needsUpdate, CONTRACT §23), the material is created once
// (prewarmed by the boot compile; never flips transparent/blending), no shadows, no lights, no per-frame allocation.
import * as THREE from 'three';
import { elColor } from '../core/elements.js';

const MAX_WISPS = 3;
const MAX_BOLTS = 10;
// instance layout: [wisp cores][wisp halos][bolt cores][bolt glows]
const I_CORE = 0, I_HALO = MAX_WISPS, I_BOLT = MAX_WISPS * 2, I_GLOW = MAX_WISPS * 2 + MAX_BOLTS;
const TOTAL = MAX_WISPS * 2 + MAX_BOLTS * 2;
const SHOT_EVERY = 1.6, RANGE = 18, BOLT_SPEED = 20;

export function createFamiliars(game) {
  const E = game.events;
  const geo = new THREE.IcosahedronGeometry(0.17, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, TOTAL);
  mesh.name = 'skills.familiars';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  const col = new THREE.Color(1, 1, 1);
  for (let i = 0; i < TOTAL; i++) mesh.setColorAt(i, col);
  mesh.instanceColor.needsUpdate = true;
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < TOTAL; i++) mesh.setMatrixAt(i, ZERO);
  mesh.visible = false;
  try { game.scene?.add(mesh); } catch (_) { /* */ }

  const wisps = [];
  for (let i = 0; i < MAX_WISPS; i++) wisps.push({ el: null, active: false, shotT: 0.4 + i * 0.5, pos: new THREE.Vector3(), spawnT: 0, phase: i * 2.1, sparkT: 0 });
  const bolts = [];
  for (let i = 0; i < MAX_BOLTS; i++) bolts.push({ active: false, el: null, pos: new THREE.Vector3(), target: null, life: 0, dmg: 0, status: false, wobble: 0 });
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), aim = new THREE.Vector3();
  const near = [];
  let t = 0, anyActive = false;
  const c1 = new THREE.Color(), c2 = new THREE.Color();

  function setColors(i, el, haloK) {
    c1.setHex(elColor(el, 'mid')); c2.setHex(elColor(el, 'core'));
    c1.lerp(c2, 0.35); mesh.setColorAt(I_CORE + i, c1);
    c2.setHex(elColor(el, 'edge')).multiplyScalar(haloK); mesh.setColorAt(I_HALO + i, c2);
    mesh.instanceColor.needsUpdate = true;
  }
  /** Set the familiar elements (≤ MAX_WISPS). Emits familiarSpawn / familiarEnd per change. */
  function setElements(list) {
    for (let i = 0; i < MAX_WISPS; i++) {
      const w = wisps[i]; const el = list[i] || null;
      if (w.active && w.el === el) continue;
      if (w.active) { E.emit('familiarEnd', { element: w.el }); w.active = false; w.el = null; }
      if (el) {
        w.active = true; w.el = el; w.spawnT = 0; w.shotT = 0.6 + i * 0.5;
        setColors(i, el, 0.55);
        playerAnchor(w.pos);
        try { game.vfx?.burst?.(w.pos, { count: 14, color: [elColor(el, 'hex'), 0xffffff], shape: 'spark', speed: 2.5, spread: 1, size: 0.09, sizeEnd: 0, life: 0.45, drag: 3 }); } catch (_) { /* */ }
        E.emit('familiarSpawn', { element: el });
      }
    }
  }
  function despawnAll() { setElements([]); for (const b of bolts) b.active = false; }
  function playerAnchor(out) {
    const p = game.player?.object?.position;
    if (p) out.copy(p); else out.set(0, 0, 0);
    out.y += 1.9;
    return out;
  }
  function nearestEnemy(from) {
    near.length = 0;
    try { game.combat?.queryRadius?.(from, RANGE, 'enemy', near); } catch (_) { near.length = 0; }
    let best = null, bd = RANGE * RANGE;
    for (const e of near) {
      if (!e?.alive || e.team === 'player' || e.isProp) continue;
      const d = e.object.position.distanceToSquared(from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function fire(w) {
    const target = nearestEnemy(w.pos); if (!target) return false;
    const b = bolts.find((x) => !x.active); if (!b) return false;
    const def = game.skills?.defs?.get?.(w.el + '.basic');
    const base = def?.params?.dmg ?? 12;
    b.active = true; b.el = w.el; b.pos.copy(w.pos); b.target = target; b.life = 2.2; b.wobble = Math.random() * 6.28;
    b.dmg = base * (def?.params?.n ? Math.min(2, def.params.n) : 1) * 0.5;
    b.status = !!game.stats?.get?.('familiarStatus');
    b.statusBlock = def?.params?.status || null;
    const i = bolts.indexOf(b);
    c1.setHex(elColor(w.el, 'core')); mesh.setColorAt(I_BOLT + i, c1);
    c2.setHex(elColor(w.el, 'mid')).multiplyScalar(0.6); mesh.setColorAt(I_GLOW + i, c2);
    mesh.instanceColor.needsUpdate = true;
    try { game.audio?.play?.('cast_' + w.el, { position: w.pos, volume: 0.25, pitch: 1.6 }); } catch (_) { /* */ }
    return true;
  }
  function land(b) {
    const C = game.combat; const tg = b.target;
    if (tg?.alive && C?.dealDamage) {
      const full = !!game.stats?.get?.('familiarFullReactions');
      const hit = { amount: b.dmg, element: b.el, source: game.player?.entity || 'player', point: b.pos.clone(), tags: ['familiar'], skillId: 'familiar', tier: 'light',
        reactionMul: full ? 1 : 0.5 };
      if (b.status && b.statusBlock && C.STATUS_DEFS) hit.status = b.statusBlock;
      try { C.dealDamage(tg, hit); } catch (_) { /* */ }
      if (b.status && b.statusBlock && !C.STATUS_DEFS) for (const k in b.statusBlock) { try { C.applyStatus?.(tg, k, b.statusBlock[k]?.dur || 3); } catch (_) { /* */ } }
    }
    try { game.vfx?.impact?.(b.pos, { element: b.el, scale: 0.5 }); } catch (_) { /* */ }
    b.active = false; b.target = null;
  }

  function update(dt) {
    t += dt;
    anyActive = false;
    const anchor = playerAnchor(tmp2);
    let n = 0; for (let i = 0; i < MAX_WISPS; i++) if (wisps[i].active) n++;
    let k = 0;
    for (let i = 0; i < MAX_WISPS; i++) {
      const w = wisps[i];
      if (!w.active) { mesh.setMatrixAt(I_CORE + i, ZERO); mesh.setMatrixAt(I_HALO + i, ZERO); continue; }
      anyActive = true;
      w.spawnT = Math.min(1, w.spawnT + dt * 2.5);
      const a = t * 1.7 + (k / Math.max(1, n)) * Math.PI * 2; k++;
      const rad = 1.05 + Math.sin(t * 0.9 + w.phase) * 0.12;
      aim.set(anchor.x + Math.cos(a) * rad, anchor.y + Math.sin(t * 2.6 + w.phase) * 0.18, anchor.z + Math.sin(a) * rad);
      w.pos.lerp(aim, 1 - Math.exp(-dt * 10));
      const pulse = 1 + Math.sin(t * 7 + w.phase) * 0.12;
      const s = w.spawnT * (w.shotT < 0.15 ? 1.35 : 1) * pulse;
      m4.compose(w.pos, q, sc.set(s, s, s)); mesh.setMatrixAt(I_CORE + i, m4);
      const hs = s * 2.1;
      m4.compose(w.pos, q, sc.set(hs, hs, hs)); mesh.setMatrixAt(I_HALO + i, m4);
      // sparkle trail (pooled particles), ~5 Hz
      w.sparkT -= dt;
      if (w.sparkT <= 0) {
        w.sparkT = 0.2;
        try { game.vfx?.burst?.(w.pos, { count: 1, color: [elColor(w.el, 'hex'), 0xffffff], shape: 'soft', speed: 0.3, spread: 1, size: 0.07, sizeEnd: 0, life: 0.5, drag: 2, gravity: -0.6 }); } catch (_) { /* */ }
      }
      if (game.state === 'playing') {
        w.shotT -= dt;
        if (w.shotT <= 0) { w.shotT = fire(w) ? SHOT_EVERY : 0.4; }
      }
    }
    for (let i = 0; i < MAX_BOLTS; i++) {
      const b = bolts[i];
      if (!b.active) { mesh.setMatrixAt(I_BOLT + i, ZERO); mesh.setMatrixAt(I_GLOW + i, ZERO); continue; }
      anyActive = true;
      b.life -= dt;
      if (!b.target?.alive || b.life <= 0) { b.active = false; b.target = null; continue; }
      const tp = b.target.object.position;
      pos.set(tp.x, tp.y + (b.target.height || 1.6) * 0.55, tp.z);
      aim.subVectors(pos, b.pos);
      const d = aim.length();
      const step = BOLT_SPEED * dt;
      if (d <= step + 0.3) { b.pos.copy(pos); land(b); continue; }
      aim.multiplyScalar(1 / d);
      b.wobble += dt * 14;
      b.pos.addScaledVector(aim, step);
      b.pos.y += Math.sin(b.wobble) * 0.02;
      m4.compose(b.pos, q, sc.set(0.8, 0.8, 0.8)); mesh.setMatrixAt(I_BOLT + i, m4);
      m4.compose(b.pos, q, sc.set(1.7, 1.7, 1.7)); mesh.setMatrixAt(I_GLOW + i, m4);
    }
    mesh.visible = anyActive;
    if (anyActive) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh, setElements, despawnAll, update,
    get count() { return wisps.reduce((k, w) => k + (w.active ? 1 : 0), 0); },
    elements() { return wisps.filter((w) => w.active).map((w) => w.el); },
    get boltsActive() { return bolts.reduce((k, b) => k + (b.active ? 1 : 0), 0); },
    warmup() { return [mesh]; },
    MAX: MAX_WISPS,
  };
}
