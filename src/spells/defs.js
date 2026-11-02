// The 15 spells: metadata (Korean) + cast implementations.
import * as THREE from 'three';
import { ELEMENT_COLORS } from '../core/utils.js';

const C = ELEMENT_COLORS;
const UP = new THREE.Vector3(0, 1, 0);

function flatDir(dir, out = new THREE.Vector3()) {
  out.set(dir.x, 0, dir.z);
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
  return out.normalize();
}
function clampPoint(S, aim, maxD, out = new THREE.Vector3()) {
  const pp = S.playerPos();
  out.copy(aim.point);
  const dx = out.x - pp.x, dz = out.z - pp.z, d = Math.hypot(dx, dz);
  if (d > maxD) { out.x = pp.x + dx / d * maxD; out.z = pp.z + dz / d * maxD; }
  out.y = S.height(out.x, out.z);
  return out;
}

export const SPELLS = {
  // ======================= FIRE =======================
  fire_basic: {
    element: 'fire', kind: 'basic', name: '화염구', desc: '폭발하는 불덩이. 화상을 입힘', mp: 4, cd: 0.3,
    cast(S, aim) {
      S.projectiles.spawn({
        kind: 'fireball', element: 'fire', mesh: 'fireball', pos: aim.origin, dir: aim.dir, speed: 42, radius: 0.45,
        damage: 20, life: 2.2, homing: 5, target: aim.target, status: { burning: 3 }, knockback: 3, trailWidth: 0.42,
        emitter: { rate: 50, color: [0xffd070, 0xff4a10], shape: 'ember', speed: 1.2, spread: 1, size: 0.16, sizeEnd: 0.02, life: 0.45, drag: 1.5 },
        data: { aoe: 1.8 },
        onImpact(p, pos, ent) {
          S.vfx('explosion', pos, { element: 'fire', scale: 0.55 });
          S.sfx('impact_fire', { position: pos });
          S.aoe(pos, 1.8, ent, () => ({ amount: 8, element: 'fire', status: { burning: 2 }, knockback: 4 }));
        },
      });
    },
  },
  fire_heavy: {
    element: 'fire', kind: 'heavy', name: '업화의 구슬', desc: '충전할수록 커지는 거대한 화염구. 화염 지대를 남김', mp: 16, cd: 1.2, chargeTime: 1.1,
    cast(S, aim, c) {
      const R = 3 + 4 * c, dmg = 40 + 50 * c;
      S.projectiles.spawn({
        kind: 'inferno', element: 'fire', mesh: 'inferno', pos: aim.origin, dir: aim.dir, speed: 20 - 4 * c, radius: 0.6 + 0.7 * c,
        scale: 0.6 + 0.8 * c, damage: dmg * 0.3, life: 2.4, homing: 1.6, target: aim.target, explodeOnExpire: true,
        trailWidth: 0.9 + c, trailLength: 18,
        emitter: { rate: 90, color: [0xffe080, 0xff3a00], shape: 'ember', speed: 3, spread: 1, size: 0.3 + 0.2 * c, sizeEnd: 0.02, life: 0.6, drag: 1.2 },
        data: { aoe: R },
        onImpact(p, pos) {
          S.vfx('explosion', pos, { element: 'fire', scale: 1 + 1.6 * c });
          S.vfx('shockwave', pos, { color: 0xffa040, radius: R * 1.3, duration: 0.5, thickness: 1 });
          S.vfx('flash', pos, { color: 0xff8030, intensity: 10, distance: R * 4, duration: 0.45 });
          S.vfx('shake', 0.25 + 0.25 * c);
          S.vfx('fovKick', 2 + 3 * c, 0.3);
          S.sfx('explode_fire', { position: pos });
          S.aoe(pos, R, null, (e, d) => ({ amount: dmg * (1 - 0.45 * d / R), element: 'fire', status: { burning: 4 }, knockback: 10 + 6 * c, launch: 4 + 4 * c, heavy: true }));
          const g = S.ground(pos);
          if (pos.y - g.y < R) S.zones.spawn('fire', g, { radius: R * 0.75, duration: 5 });
        },
      });
    },
  },
  fire_ultimate: {
    element: 'fire', kind: 'ultimate', name: '메테오', desc: '하늘에서 거대한 불타는 운석을 떨어뜨림', mp: 45, cd: 14,
    cast(S, aim) {
      const pt = clampPoint(S, aim, 55);
      S.props.sigil(pt, { color: C.fire, radius: 6, duration: 1.6, spin: 1.4 });
      S.vfx('decal', pt, { color: 0xff6a1f, radius: 6, duration: 1.4, opacity: 0.4 });
      S.sfx('charge', { position: pt, pitch: 0.6 });
      const fd = flatDir(S.aimDirFlat || new THREE.Vector3(0, 0, -1));
      S.later(0.2, () => {
        // start in front of / above the target so the rock streaks down across the sky, in view
        const sd = new THREE.Vector3(-fd.z, 0, fd.x);
        const start = new THREE.Vector3(pt.x + fd.x * 30 + sd.x * 8, pt.y + 26, pt.z + fd.z * 30 + sd.z * 8);
        S.vfx('flash', start, { color: 0xffc070, intensity: 6, distance: 60, duration: 0.35 });
        S.vfx('burst', start, { count: 24, color: [0xfff0c0, 0xff8a30], shape: 'spark', speed: 6, spread: 1, size: 0.5, life: 0.35, drag: 2 });
        const dir = new THREE.Vector3().subVectors(pt, start); const dist = dir.length();
        S.projectiles.spawn({
          kind: 'meteor', element: 'fire', mesh: 'meteor', pos: start, dir, speed: dist / 1.0, radius: 1.2, scale: 0.55,
          damage: 0, life: 2, pierce: true, trailWidth: 3.2, trailLength: 30, trailColor: 0xff7a2a,
          emitter: { rate: 160, color: [0xffe080, 0xff3a00], shape: 'ember', speed: 4, spread: 1, size: 0.6, sizeEnd: 0.05, life: 0.8, drag: 1 },
          data: { aoe: 9 },
          onUpdate(p) { p._sm = !p._sm; if (p._sm) S.vfx('burst', p.pos, { count: 1, color: 0x7a5e52, shape: 'smoke', speed: 2, spread: 1, size: 1.8, sizeEnd: 3.5, life: 0.9, additive: false, drag: 1.5, alpha: 0.35 }); },
          onImpact(p, pos) {
            const g = S.ground(pos).clone();
            const R = 10;
            S.vfx('explosion', g, { element: 'fire', scale: 3.2 });
            S.vfx('shockwave', g, { color: 0xffb060, radius: R * 1.4, duration: 0.7, thickness: 2 });
            S.vfx('shockwave', g, { color: 0xffffff, radius: R * 0.8, duration: 0.4, thickness: 1.5 });
            S.vfx('debris', g, { count: 40, material: 'rock', color: 0x4a2014, size: 0.6, speed: 20, life: 2.4 });
            S.vfx('burst', g, { count: 120, color: [0xffe080, 0xff3a00], shape: 'ember', speed: 26, spread: 0.7, dir: UP, size: 0.35, life: 1.6, gravity: -18, drag: 0.6 });
            S.vfx('burst', g, { count: 25, color: [0x8a6a5a, 0x5a4a44], shape: 'smoke', speed: 10, spread: 0.6, dir: UP, size: 3, sizeEnd: 5, life: 1.4, additive: false, drag: 1.4, gravity: 1, alpha: 0.45 });
            S.vfx('flash', g, { color: 0xff8030, intensity: 20, distance: 50, duration: 0.8 });
            S.vfx('screenFlash', 0xfff0d0, 0.45, 0.35);
            S.vfx('shake', 1);
            S.vfx('fovKick', 7, 0.5);
            S.game.hitstop(0.12);
            S.sfx('explode_fire', { position: g, volume: 1.4, pitch: 0.6 });
            S.sfx('explode_earth', { position: g, volume: 1.2 });
            S.aoe(g, R, null, (e, d) => ({ amount: 130 * (1 - 0.55 * d / R), element: 'fire', status: { burning: 5 }, knockback: 18, launch: 11, heavy: true, tags: ['ultimate'] }));
            S.zones.spawn('fire', g, { radius: 6, duration: 7 });
            S.vfx('decal', g, { color: 0x1a0c08, radius: 7, duration: 12, opacity: 0.8 });
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
              const x = g.x + Math.cos(a) * 6.5, z = g.z + Math.sin(a) * 6.5;
              S.props.pillars.spawn(x, S.height(x, z), z, { height: 1.2 + Math.random() * 1.6, width: 1.1, hold: 6, sink: 1, tiltX: Math.sin(a) * 0.7, tiltZ: -Math.cos(a) * 0.7, yaw: 0 });
            }
          },
        });
      });
    },
  },
  // ======================= ICE =======================
  ice_basic: {
    element: 'ice', kind: 'basic', name: '빙결 파편', desc: '얼음 파편 3발. 냉기 중첩 시 빙결', mp: 5, cd: 0.38,
    cast(S, aim) {
      const d = new THREE.Vector3();
      for (let i = -1; i <= 1; i++) {
        d.copy(aim.dir).applyAxisAngle(UP, i * 0.06);
        d.y += Math.abs(i) * 0.015;
        S.projectiles.spawn({
          kind: 'shard', element: 'ice', mesh: 'shard', pos: aim.origin, dir: d, speed: 52, radius: 0.38, damage: 9, life: 1.4,
          homing: i === 0 || aim.target ? 4 : 1.5, target: aim.target, status: { chilled: 3 }, knockback: 1.5, trailWidth: 0.22, trailLength: 10,
          emitter: { rate: 25, color: [0xffffff, 0x9feaff], shape: 'snow', speed: 0.6, spread: 1, size: 0.1, sizeEnd: 0, life: 0.5, drag: 1 },
          onImpact(p, pos) {
            S.vfx('impact', pos, { element: 'ice', scale: 0.6 });
            S.vfx('burst', pos, { count: 8, color: [0xffffff, 0x7fe3ff], shape: 'shard', speed: 5, spread: 1, size: 0.12, life: 0.4, gravity: -8 });
            S.sfx('impact_ice', { position: pos, volume: 0.6 });
          },
        });
      }
    },
  },
  ice_heavy: {
    element: 'ice', kind: 'heavy', name: '서리 창', desc: '모든 적을 관통해 얼려버리는 얼음 창', mp: 18, cd: 1.6, chargeTime: 1.0,
    cast(S, aim, c) {
      S.projectiles.spawn({
        kind: 'lance', element: 'ice', mesh: 'lance', pos: aim.origin, dir: aim.dir, speed: 62, radius: 0.55 + 0.3 * c, scale: 0.8 + 0.6 * c,
        damage: 30 + 30 * c, life: (36 + 30 * c) / 62, pierce: true, homing: 1, target: aim.target, status: { frozen: 2 + 1.5 * c }, knockback: 5,
        trailWidth: 0.5, trailLength: 22, data: { aoe: 2.5 },
        emitter: { rate: 70, color: [0xffffff, 0x7fe3ff], shape: 'snow', speed: 1.5, spread: 1, size: 0.16, sizeEnd: 0, life: 0.7, drag: 1.5 },
        onHitEntity(p, e, r, pt) {
          S.vfx('burst', pt, { count: 20, color: [0xffffff, 0x7fe3ff], shape: 'shard', speed: 8, spread: 1, size: 0.16, life: 0.5, gravity: -6 });
          S.sfx('impact_ice', { position: pt });
        },
        onImpact(p, pos, ent, ground) {
          S.vfx('explosion', pos, { element: 'ice', scale: 0.8 });
          if (ground) {
            for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const x = pos.x + Math.cos(a) * 1.1, z = pos.z + Math.sin(a) * 1.1; S.props.spikes.spawn(x, S.height(x, z), z, { height: 1.2 + Math.random(), width: 0.8, hold: 2.5, tiltX: Math.sin(a) * 0.5, tiltZ: -Math.cos(a) * 0.5 }); }
            S.zones.spawn('ice', pos, { radius: 2.8, duration: 6 });
          }
        },
      });
    },
  },
  ice_ultimate: {
    element: 'ice', kind: 'ultimate', name: '빙하 송곳', desc: '지면을 따라 솟구치는 얼음 송곳의 파도', mp: 40, cd: 13,
    cast(S, aim) {
      const pp = S.playerPos().clone();
      const fd = flatDir(aim.dir);
      const side = new THREE.Vector3(-fd.z, 0, fd.x);
      const N = 15, step = 1.75;
      const hitSet = new Set();
      for (let i = 0; i < N; i++) {
        S.later(i * 0.055, () => {
          const cx = pp.x + fd.x * (4.5 + i * step), cz = pp.z + fd.z * (4.5 + i * step);
          const cy = S.height(cx, cz);
          const w = 1 + i * 0.06;
          const ramp = Math.min(1, (i + 1) / 4); // low near the caster so the wall doesn't block the camera
          const last = i === N - 1;
          for (let k = 0; k < 5; k++) {
            // centre spike shifted away from the camera's shoulder side (keeps the line of sight open)
            const lat = (k - 2) * 0.75 * w + (k === 2 && i < 6 ? -0.8 : 0) + (Math.random() - 0.5) * 0.4;
            const x = cx + side.x * lat + (Math.random() - 0.5) * 0.6, z = cz + side.z * lat + (Math.random() - 0.5) * 0.6;
            const hgt = (k === 2 ? (last ? 6 : 3.6) : 2.2) * (0.8 + Math.random() * 0.4) * (0.8 + i * 0.03) * ramp;
            S.props.spikes.spawn(x, S.height(x, z), z, { height: hgt, width: k === 2 ? (last ? 2.4 : 1.5) : 1, hold: 2.6 + (N - i) * 0.02, sink: 0.6, tiltX: fd.z * lat * -0.12 + (Math.random() - 0.5) * 0.3, tiltZ: fd.x * lat * 0.12 + (Math.random() - 0.5) * 0.3 });
          }
          const pt = new THREE.Vector3(cx, cy + 0.5, cz);
          S.vfx('burst', pt, { count: 18, color: [0xffffff, 0x9feaff], shape: 'shard', speed: 9, dir: UP, spread: 0.6, size: 0.18, life: 0.6, gravity: -12 });
          S.vfx('burst', pt, { count: 8, color: 0xe8f8ff, shape: 'smoke', speed: 3, spread: 1, size: 1, sizeEnd: 2.2, life: 0.9, additive: false, drag: 2 });
          if (i % 3 === 0) { S.sfx('impact_ice', { position: pt }); S.vfx('shake', 0.22); }
          if (last) {
            S.vfx('shake', 0.6); S.vfx('screenFlash', 0xcff4ff, 0.3, 0.3); S.vfx('fovKick', 4, 0.4);
            S.vfx('explosion', pt, { element: 'ice', scale: 2 });
            S.sfx('shatter', { position: pt, volume: 1.2 });
          }
          S.aoe(pt, 2.6 * w, null, (e) => (hitSet.has(e) ? null : (hitSet.add(e), { amount: 48, element: 'ice', status: { frozen: 3 }, launch: 4, heavy: false, tags: ['ultimate'] })));
          S.zones.elementAt(pt, 2, 'ice');
          if (i === 4 || i === 9 || i === N - 1) S.zones.spawn('ice', pt, { radius: 3.6, duration: 8 });
        });
      }
      S.vfx('screenFlash', 0xcff4ff, 0.18, 0.3);
    },
  },
  // ======================= LIGHTNING =======================
  lightning_basic: {
    element: 'lightning', kind: 'basic', name: '전격', desc: '즉발 번개. 근처 적 1명에게 연쇄', mp: 4, cd: 0.28,
    cast(S, aim) {
      const o = aim.origin;
      let target = aim.target;
      if (!target) { const r = S.combat.raycastEntities(o, aim.dir, 45, 'enemy'); if (r) target = r.entity; }
      if (target && S.center(target).distanceTo(o) > 50) target = null;
      const end = target ? S.center(target).clone() : (aim.point.distanceTo(o) > 45 ? o.clone().addScaledVector(aim.dir, 45) : aim.point.clone());
      S.vfx('beam', o, end, { color: C.lightning, width: 0.14, duration: 0.16, jagged: 0.4, segments: 12, branches: 1 });
      S.vfx('flash', end, { color: C.lightning, intensity: 4, distance: 8, duration: 0.15 });
      S.sfx('impact_lightning', { position: end, volume: 0.7 });
      if (target) {
        S.combat.dealDamage(target, { amount: 16, element: 'lightning', source: 'player', point: end, status: { shocked: 3 }, direction: aim.dir.clone(), knockback: 1 });
        S.zones.elementAt(S.ground(end), 1, 'lightning');
        const next = S.nearestEnemy(end, 8, [target]);
        if (next) {
          const c2 = S.center(next).clone();
          S.vfx('beam', end, c2, { color: C.lightning, width: 0.1, duration: 0.18, jagged: 0.4, segments: 10 });
          S.combat.dealDamage(next, { amount: 10, element: 'lightning', source: 'player', point: c2, status: { shocked: 2 } });
        }
      } else {
        S.vfx('impact', end, { element: 'lightning', scale: 0.7 });
        S.zones.elementAt(end, 1.2, 'lightning');
      }
    },
  },
  lightning_heavy: {
    element: 'lightning', kind: 'heavy', name: '연쇄 번개', desc: '충전할수록 더 많은 적에게 튀는 거대한 번개', mp: 18, cd: 1.5, chargeTime: 1.0,
    cast(S, aim, c) {
      const o = aim.origin.clone();
      const n = Math.round(3 + 3 * c);
      let dmg = 30 + 25 * c;
      let target = aim.target;
      if (!target) { const r = S.combat.raycastEntities(o, aim.dir, 60, 'enemy'); if (r) target = r.entity; }
      if (!target) target = S.nearestEnemy(aim.point, 6, []);
      S.vfx('screenFlash', 0xe0d0ff, 0.12, 0.15);
      if (!target) {
        const end = aim.point.distanceTo(o) > 55 ? o.clone().addScaledVector(aim.dir, 55) : aim.point.clone();
        S.vfx('beam', o, end, { color: C.lightning, width: 0.35, duration: 0.3, jagged: 0.8, segments: 16, branches: 3 });
        S.vfx('explosion', end, { element: 'lightning', scale: 0.8 + c * 0.6 });
        S.sfx('explode_lightning', { position: end });
        S.aoe(end, 2.5, null, () => ({ amount: dmg * 0.6, element: 'lightning', status: { shocked: 3 } }));
        S.zones.elementAt(end, 2.5, 'lightning');
        return;
      }
      const hit = [];
      let from = o, cur = target;
      for (let i = 0; i < n && cur; i++) {
        const e = cur, f = from.clone(), amt = dmg, w = 0.38 - i * 0.03;
        hit.push(e);
        const to = S.center(e).clone();
        S.later(i * 0.07, () => {
          if (!e.alive) return;
          const tt = S.center(e).clone();
          S.vfx('beam', f, tt, { color: 0xd9c2ff, width: w, duration: 0.32, jagged: 0.9, segments: 16, branches: 3 });
          S.vfx('beam', f, tt, { color: 0xffffff, width: w * 0.35, duration: 0.2, jagged: 0.6, segments: 12 });
          S.vfx('flash', tt, { color: C.lightning, intensity: 7, distance: 12, duration: 0.25 });
          S.vfx('burst', tt, { count: 22, color: [0xffffff, C.lightning], shape: 'spark', speed: 10, spread: 1, size: 0.12, life: 0.4, drag: 2 });
          S.vfx('shake', 0.15);
          S.sfx('impact_lightning', { position: tt });
          S.combat.dealDamage(e, { amount: amt, element: 'lightning', source: 'player', point: tt, status: { shocked: 4 }, knockback: 3, heavy: true });
          S.zones.elementAt(S.ground(tt), 1, 'lightning');
        });
        from = to; dmg *= 0.88;
        cur = S.nearestEnemy(to, 12, hit);
      }
    },
  },
  lightning_ultimate: {
    element: 'lightning', kind: 'ultimate', name: '천벌의 뇌우', desc: '번개구름을 불러 비를 내리고 낙뢰를 퍼부음', mp: 45, cd: 15,
    cast(S, aim) {
      const pt = clampPoint(S, aim, 50);
      S.props.sigil(pt, { color: C.lightning, radius: 8, duration: 1.2, spin: -1 });
      S.vfx('screenFlash', 0x302050, 0.25, 0.7);
      S.vfx('shake', 0.25);
      S.zones.spawn('storm', pt, { radius: 8.5, duration: 5.5, onEnd: (z) => S.zones.spawn('water', z.pos, { radius: 6.5, duration: 8 }) });
    },
  },
  // ======================= WIND =======================
  wind_basic: {
    element: 'wind', kind: 'basic', name: '바람의 칼날', desc: '적을 관통하며 밀쳐내는 초승달 칼날', mp: 3, cd: 0.32,
    cast(S, aim) {
      S.projectiles.spawn({
        kind: 'blade', element: 'wind', mesh: 'blade', pos: aim.origin, dir: aim.dir, speed: 40, radius: 1.0, damage: 14, life: 0.95,
        pierce: true, knockback: 9, launch: 1.5, trailWidth: 1.2, trailLength: 8, homing: 1.5, target: aim.target,
        emitter: { rate: 30, color: [0xffffff, C.wind], shape: 'leaf', speed: 1, spread: 1, size: 0.12, life: 0.5, drag: 2 },
        data: { aoe: 1.5 },
        onHitEntity(p, e, r, pt) { S.vfx('burst', pt, { count: 14, color: [0xffffff, C.wind], shape: 'leaf', speed: 7, spread: 1, size: 0.14, life: 0.5, drag: 2 }); S.sfx('impact_wind', { position: pt, volume: 0.6 }); },
        onImpact(p, pos) { S.vfx('impact', pos, { element: 'wind', scale: 0.7 }); },
      });
    },
  },
  wind_heavy: {
    element: 'wind', kind: 'heavy', name: '돌풍', desc: '전방의 적을 날려 공중에 띄우는 폭풍', mp: 14, cd: 1.4, chargeTime: 0.9,
    cast(S, aim, c) {
      const pp = S.playerPos();
      const fd = flatDir(aim.dir);
      const range = 6 + 7 * c, cosA = Math.cos(0.75);
      const o = new THREE.Vector3(pp.x, pp.y + 1.1, pp.z).addScaledVector(fd, 2.5);
      S.props.gust(o, fd, range, C.wind);
      S.vfx('burst', o, { count: 50, color: [C.wind, 0xd8ffe8], shape: 'leaf', speed: 16 + 10 * c, dir: fd, spread: 0.3, size: 0.18, life: 0.6, drag: 1.5, alpha: 0.8 });
      S.vfx('burst', o, { count: 10, color: [C.wind, 0xbff5d8], shape: 'ring', speed: 10 + 8 * c, dir: fd, spread: 0.25, size: 0.5, sizeEnd: 2, life: 0.4, alpha: 0.6 });
      S.vfx('shake', 0.25 + 0.2 * c);
      S.vfx('fovKick', 3, 0.25);
      S.sfx('explode_wind', { position: o });
      const v = new THREE.Vector3();
      for (const e of S.combat.queryRadius(o, range, 'enemy')) {
        v.subVectors(e.object.position, pp).setY(0);
        const d = v.length(); if (d < 0.01) continue;
        v.multiplyScalar(1 / d);
        if (v.dot(fd) < cosA && d > 1.5) continue;
        S.combat.dealDamage(e, { amount: 18 + 22 * c, element: 'wind', source: 'player', point: S.center(e).clone(), direction: v.clone(), knockback: 12 + 14 * c, launch: 7 + 6 * c, heavy: c > 0.8 });
      }
      S.zones.elementAt(o.clone().addScaledVector(fd, range * 0.5), range * 0.45, 'wind', { dir: fd });
    },
  },
  wind_ultimate: {
    element: 'wind', kind: 'ultimate', name: '대회오리', desc: '적을 빨아들여 띄우는 거대한 회오리', mp: 40, cd: 14,
    cast(S, aim) {
      const pp = S.playerPos();
      const fd = flatDir(aim.dir);
      const start = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(fd, 4);
      const tgt = clampPoint(S, aim, 40);
      const d = Math.hypot(tgt.x - start.x, tgt.z - start.z);
      S.zones.spawn('tornado', start, { radius: 4.5, duration: 6.5, target: tgt, speed: Math.max(2.5, d / 4.5) });
      S.vfx('shockwave', S.ground(start), { color: C.wind, radius: 6, duration: 0.5, thickness: 1 });
      S.vfx('shake', 0.3);
      S.sfx('explode_wind', { position: start, pitch: 0.7 });
    },
  },
  // ======================= EARTH =======================
  earth_basic: {
    element: 'earth', kind: 'basic', name: '바위 탄환', desc: '묵직한 바위. 경직, 빙결된 적을 파쇄', mp: 5, cd: 0.45,
    cast(S, aim) {
      const speed = 36, g = 9;
      const d = Math.min(aim.point.distanceTo(aim.origin), 60);
      const t = d / speed;
      const tp = new THREE.Vector3().copy(aim.origin).addScaledVector(aim.dir, d); tp.y += 0.5 * g * t * t;
      const dir = tp.sub(aim.origin).normalize();
      S.projectiles.spawn({
        kind: 'rock', element: 'earth', mesh: 'rock', pos: aim.origin, dir, speed, radius: 0.5, scale: 0.6, damage: 24, life: 2.2,
        gravity: g, homing: 2.5, target: aim.target, heavy: true, knockback: 7, launch: 2.5, trailWidth: 0.3, trailLength: 8, trailColor: 0xcaa070,
        data: { aoe: 1.5 },
        onImpact(p, pos, ent) {
          S.vfx('impact', pos, { element: 'earth', scale: 0.9 });
          S.vfx('debris', pos, { count: 8, material: 'rock', color: 0xa7835a, size: 0.18, speed: 6 });
          S.vfx('burst', pos, { count: 10, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 3, spread: 1, size: 0.5, sizeEnd: 1.3, life: 0.7, additive: false, drag: 2 });
          S.sfx('impact_earth', { position: pos });
          S.aoe(pos, 1.6, ent, () => ({ amount: 7, element: 'earth', knockback: 4 }));
        },
      });
    },
  },
  earth_heavy: {
    element: 'earth', kind: 'heavy', name: '대지 창', desc: '목표 지점에 바위 기둥을 솟구치게 해 띄움', mp: 18, cd: 1.6, chargeTime: 1.1,
    cast(S, aim, c) {
      const pt = aim.target ? S.ground(aim.target.object.position).clone() : clampPoint(S, aim, 45);
      const R = 2 + 3 * c;
      S.vfx('decal', pt, { color: 0x3a2a1a, radius: R * 1.1, duration: 4, opacity: 0.6 });
      S.vfx('burst', pt, { count: 20, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 3, spread: 1, size: 0.6, sizeEnd: 1.5, life: 0.6, additive: false, drag: 2 });
      S.vfx('shake', 0.1);
      S.later(0.16, () => {
        S.props.pillars.spawn(pt.x, pt.y, pt.z, { height: 3 + 2.5 * c, width: 1.5 + c, hold: 1.6 });
        const n = Math.round(6 + 8 * c);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, rr = R * (0.45 + Math.random() * 0.5);
          const x = pt.x + Math.cos(a) * rr, z = pt.z + Math.sin(a) * rr;
          S.props.pillars.spawn(x, S.height(x, z), z, { height: (1.6 + Math.random() * 1.8) * (0.8 + c * 0.6), width: 0.8 + Math.random() * 0.5, hold: 1.3, delay: Math.random() * 0.08, tiltX: Math.sin(a) * 0.35, tiltZ: -Math.cos(a) * 0.35 });
        }
        S.vfx('shockwave', pt, { color: C.earth, radius: R * 1.4, duration: 0.45, thickness: 0.9 });
        S.vfx('debris', pt, { count: 18 + 12 * c, material: 'rock', color: 0xa7835a, size: 0.32, speed: 13, life: 1.6 });
        S.vfx('burst', pt, { count: 30, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 7, spread: 0.7, dir: UP, size: 0.9, sizeEnd: 2.4, life: 1, additive: false, drag: 2.5 });
        S.vfx('shake', 0.35 + 0.3 * c);
        S.sfx('explode_earth', { position: pt });
        S.aoe(pt, R, null, () => ({ amount: 35 + 35 * c, element: 'earth', launch: 12 + 6 * c, knockback: 3, heavy: true }));
        S.zones.elementAt(pt, R, 'earth');
      });
    },
  },
  earth_ultimate: {
    element: 'earth', kind: 'ultimate', name: '대지진', desc: '퍼져나가는 3겹의 충격파로 주변을 뒤흔들고 기절시킴', mp: 45, cd: 15,
    cast(S) {
      const pp = S.playerPos().clone();
      const radii = [6, 10.5, 15];
      const hitSet = new Set();
      S.props.sigil(pp, { color: C.earth, radius: 5, duration: 1.6, spin: 0.8 });
      radii.forEach((R, k) => {
        S.later(k * 0.45, () => {
          const c = S.ground(pp).clone();
          S.vfx('shockwave', c, { color: C.earth, radius: R, duration: 0.55, thickness: 1.4 });
          S.vfx('shockwave', c, { color: 0xffffff, radius: R * 0.9, duration: 0.4, thickness: 0.5 });
          S.vfx('shake', 0.55 + k * 0.15);
          S.vfx('fovKick', 2 + k, 0.3);
          S.sfx('explode_earth', { position: c, pitch: 0.8 - k * 0.1 });
          S.sfx('golem_step', { position: c });
          const n = Math.round(R * 2.2);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.25 + k;
            const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
            S.props.pillars.spawn(x, S.height(x, z), z, { height: 1.4 + Math.random() * 2.2, width: 0.9 + Math.random() * 0.6, hold: 1.1, delay: Math.random() * 0.12, tiltX: Math.sin(a) * 0.45, tiltZ: -Math.cos(a) * 0.45 });
            if (i % 3 === 0) { const pt = new THREE.Vector3(x, S.height(x, z) + 0.3, z); S.vfx('burst', pt, { count: 4, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 3, spread: 0.8, dir: UP, size: 0.9, sizeEnd: 2, life: 0.9, additive: false, drag: 2 }); }
          }
          for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, rr = R * (0.3 + Math.random() * 0.7); const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr; S.vfx('decal', new THREE.Vector3(x, S.height(x, z), z), { color: 0x3a2814, radius: 1.2 + Math.random() * 1.2, duration: 6, opacity: 0.7 }); }
          S.vfx('debris', c, { count: 16, material: 'rock', color: 0xa7835a, size: 0.3, speed: 10 });
          S.aoe(c, R + 1, null, (e) => {
            if (hitSet.has(e)) return null; hitSet.add(e);
            S.combat.applyStatus(e, 'stunned', 2, { earth: true });
            return { amount: 42, element: 'earth', launch: 7, knockback: 6, heavy: true, tags: ['ultimate'] };
          });
          S.zones.elementAt(c, R, 'earth');
        });
      });
    },
  },
};

export const SLOT_KINDS = ['basic', 'heavy', 'ultimate'];
