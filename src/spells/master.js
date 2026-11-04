// 원소의 대가 (master path) skills for the mage: 5 awakened ultimates (F), 5 cinematic finishers (R),
// 5 support skills (G). Defs carry Korean metadata; implementations use the shared spell context S.
import * as THREE from 'three';
import { glint, GLINT } from './palette.js';
import { ELEMENT_COLORS } from '../core/utils.js';

const C = ELEMENT_COLORS;
const UP = new THREE.Vector3(0, 1, 0);
const FOES = '!player';

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
const foes = (S, p, r) => S.combat.queryRadius(p, r, FOES);
const enemiesOnly = (S, p, r) => S.combat.queryRadius(p, r, 'enemy');

// ---------------------------------------------------------------- meteor helper (fire awakened)
function meteorStrike(S, pt, { scale = 0.55, R = 10, dmg = 130, fd, big = false, delay = 0 }) {
  S.later(delay, () => {
    const sd = new THREE.Vector3(-fd.z, 0, fd.x);
    const off = big ? 30 : 18 + Math.random() * 10;
    const start = new THREE.Vector3(pt.x + fd.x * off + sd.x * (Math.random() - 0.5) * 20, pt.y + (big ? 28 : 22 + Math.random() * 8), pt.z + fd.z * off + sd.z * (Math.random() - 0.5) * 20);
    const dir = new THREE.Vector3().subVectors(pt, start); const dist = dir.length();
    S.projectiles.spawn({
      kind: 'meteor', element: 'fire', mesh: 'meteor', pos: start, dir, speed: dist / (big ? 1.0 : 0.75), radius: 1.2 * scale / 0.55, scale,
      damage: 0, life: 2, pierce: true, trailWidth: 5.5 * scale, trailLength: big ? 34 : 18, trailColor: 0xff7a2a,
      emitter: { rate: big ? 170 : 55, color: [0xffe080, 0xff3a00], shape: 'ember', speed: 4, spread: 1, size: big ? 0.7 : 0.45, sizeEnd: 0.05, life: 0.8, drag: 1 },
      data: { aoe: R * 0.8 },
      onImpact(p, pos) {
        const g = S.ground(pos).clone();
        S.vfx('explosion', g, { element: 'fire', scale: big ? 3.8 : 1.7 });
        S.vfx('shockwave', g, { color: 0xffb060, radius: R * 1.4, duration: 0.7, thickness: big ? 2.4 : 1.2 });
        if (big) {
          S.vfx('shockwave', g, { color: GLINT, radius: R * 0.8, duration: 0.4, thickness: 1.6 });
          S.vfx('debris', g, { count: 46, material: 'rock', color: 0x4a2014, size: 0.7, speed: 22, life: 2.4 });
          S.vfx('burst', g, { count: 140, color: [0xffe080, 0xff3a00], shape: 'ember', speed: 28, spread: 0.7, dir: UP, size: 0.4, life: 1.7, gravity: -18, drag: 0.6 });
          S.vfx('burst', g, { count: 26, color: [0x8a6a5a, 0x5a4a44], shape: 'smoke', speed: 11, spread: 0.6, dir: UP, size: 3.5, sizeEnd: 6, life: 1.6, additive: false, drag: 1.4, gravity: 1, alpha: 0.45 });
          S.vfx('flash', g, { color: 0xff8030, intensity: 1.2, distance: 60, duration: 0.9 });
          S.vfx('screenFlash', 0xfff0d0, 0.5, 0.4);
          S.vfx('shake', 1); S.vfx('fovKick', 8, 0.55);
          S.sfx('explode_fire', { position: g, volume: 1.5, pitch: 0.55 }); S.sfx('explode_earth', { position: g, volume: 1.3 });
          S.decalRing(g, 8, 1.3, 7);
        } else {
          S.vfx('debris', g, { count: 12, material: 'rock', color: 0x4a2014, size: 0.45, speed: 13, life: 1.6 });
          S.vfx('flash', g, { color: 0xff8030, intensity: 1.2, distance: 22, duration: 0.4 });
          S.vfx('shake', 0.45);
          S.sfx('explode_fire', { position: g, volume: 1, pitch: 0.8 });
        }
        S.aoe(g, R, null, (e, d) => ({ amount: dmg * (1 - 0.5 * d / R), element: 'fire', status: { burning: 5 }, knockback: big ? 20 : 12, launch: big ? 12 : 7, heavy: true, tags: ['ultimate'] }));
        S.zones.spawn('fire', g, { radius: big ? 7.5 : 3.2, duration: big ? 8 : 5 });
        S.zones.elementAt(g, R * 0.6, 'fire');
        S.terrain.ignite(g, big ? 9 : 4);
        S.vfx('decal', g, { color: 0x1a0c08, radius: big ? 8 : 3.5, duration: 12, opacity: 0.8 });
      },
    });
  });
}

// ---------------------------------------------------------------- awakened ultimates (F, master)
export const AWAKENED = {
  fire: {
    name: '천체 낙하 · 각성', desc: '하늘을 가르는 거대 운석과 유성우를 쏟아부어 대지를 불태움', mp: 60, cd: 18,
    cast(S, aim) {
      const pt = clampPoint(S, aim, 55);
      const fd = flatDir(S.aimDirFlat || aim.dir);
      S.props.sigil(pt, { color: C.fire, radius: 12, duration: 2.4, spin: 1.2 });
      S.props.sigil(pt, { color: 0xffd080, radius: 6, duration: 2.0, spin: -2 });
      S.vfx('decal', pt, { color: 0xff6a1f, radius: 12, duration: 2.2, opacity: 0.45 });
      S.vfx('screenFlash', 0xff8040, 0.25, 0.6);
      S.sfx('charge', { position: pt, pitch: 0.5 });
      meteorStrike(S, pt, { scale: 0.85, R: 13, dmg: 210, fd, big: true, delay: 0.25 });
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 10;
        const p = new THREE.Vector3(pt.x + Math.cos(a) * r, 0, pt.z + Math.sin(a) * r); p.y = S.height(p.x, p.z);
        meteorStrike(S, p, { scale: 0.3, R: 5, dmg: 60, fd, delay: 0.55 + i * 0.16 });
      }
    },
  },
  ice: {
    name: '빙하기 · 각성', desc: '사방으로 퍼지는 빙하의 파도가 모든 것을 얼린 뒤 산산조각 냄', mp: 55, cd: 17,
    cast(S) {
      const pp = S.playerPos().clone();
      const rings = [5, 9.5, 14, 18];
      const hitSet = new Set();
      S.props.sigil(S.ground(pp).clone(), { color: C.ice, radius: 8, duration: 2.2, spin: 1 });
      S.vfx('screenFlash', 0xdff8ff, 0.3, 0.5);
      S.terrain.chill(pp, 19);
      rings.forEach((R, k) => {
        S.later(k * 0.18, () => {
          const c = S.ground(pp).clone();
          const n = Math.round(R * 1.7);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + k * 0.4 + Math.random() * 0.1;
            const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
            const hgt = (2.4 + Math.random() * 2.4) * (1 + k * 0.25);
            S.props.spikes.spawn(x, S.height(x, z), z, { height: hgt, width: 1.1 + k * 0.25, hold: 2.6 - k * 0.2, sink: 0.5, tiltX: Math.sin(a) * 0.45, tiltZ: -Math.cos(a) * 0.45 });
          }
          S.vfx('shockwave', c, { color: 0xbff4ff, radius: R + 1.5, duration: 0.5, thickness: 1.4 });
          S.vfx('burst', c, { count: 50, color: [glint(0x9feaff), 0x9feaff], shape: 'snow', speed: 10 + k * 3, spread: 1, disc: true, size: 0.3, life: 1.2, drag: 1.5 });
          S.vfx('shake', 0.35 + k * 0.12);
          S.sfx('impact_ice', { position: c, pitch: 0.9 - k * 0.1 });
          S.aoe(c, R + 1.2, null, (e) => (hitSet.has(e) ? null : (hitSet.add(e), { amount: 75, element: 'ice', status: { frozen: 4 }, launch: 3, tags: ['ultimate'] })));
          if (k % 2 === 1) for (let j = 0; j < 3; j++) { const a = j * 2.1 + k; const x = c.x + Math.cos(a) * R * 0.7, z = c.z + Math.sin(a) * R * 0.7; S.zones.spawn('ice', new THREE.Vector3(x, 0, z), { radius: 3.8, duration: 9 }); }
          S.zones.elementAt(c, R, 'ice');
        });
      });
      // 빙하 붕괴: the frozen glacier shatters (heavy blow on frozen foes → 파쇄 reaction)
      S.later(1.45, () => {
        const c = S.ground(pp).clone();
        S.vfx('screenFlash', GLINT, 0.35, 0.3); S.vfx('shake', 0.8); S.vfx('fovKick', 6, 0.4);
        S.vfx('burst', c, { count: 90, color: [glint(0x7fe3ff), 0x7fe3ff], shape: 'shard', speed: 18, spread: 1, size: 0.3, life: 1, gravity: -12, drag: 0.8, radius: 6 });
        S.sfx('shatter', { position: c, volume: 1.4, pitch: 0.7 });
        for (const e of foes(S, c, 19.5)) {
          const p = S.center(e).clone();
          S.vfx('debris', p, { count: 10, material: 'ice', color: 0xc8f6ff, size: 0.4, speed: 10, life: 1.4 });
          S.combat.dealDamage(e, { amount: 45, element: 'physical', heavy: true, source: 'player', point: p, launch: 6, tags: ['ultimate'] });
        }
      });
    },
  },
  lightning: {
    name: '뇌신의 심판 · 각성', desc: '뇌신의 심판이 모든 적에게 내리꽂히고 거대한 뇌우가 전장을 뒤덮음', mp: 60, cd: 18,
    cast(S, aim) {
      const pt = clampPoint(S, aim, 50);
      S.props.sigil(pt, { color: C.lightning, radius: 13, duration: 1.8, spin: -1.2 });
      S.vfx('screenFlash', 0x2a1850, 0.4, 0.8);
      S.vfx('shake', 0.35);
      const targets = enemiesOnly(S, pt, 24).slice(0, 9);
      const n = Math.max(5, targets.length);
      for (let i = 0; i < n; i++) {
        S.later(0.15 + i * 0.085, () => {
          const e = targets[i];
          let to;
          if (e && e.alive) to = S.center(e).clone();
          else { const a = Math.random() * 6.28, r = 3 + Math.random() * 10; to = new THREE.Vector3(pt.x + Math.cos(a) * r, 0, pt.z + Math.sin(a) * r); to.y = S.height(to.x, to.z) + 0.3; }
          const from = new THREE.Vector3(to.x + (Math.random() - 0.5) * 4, to.y + 32, to.z + (Math.random() - 0.5) * 4);
          S.vfx('beam', from, to, { color: 0xd9c2ff, width: 0.95, duration: 0.4, jagged: 1.6, segments: 20, branches: 4 });
          S.vfx('beam', from, to, { color: GLINT, width: 0.35, duration: 0.25, jagged: 0.9, segments: 16 });
          S.vfx('explosion', S.ground(to).clone(), { element: 'lightning', scale: 1.3 });
          S.vfx('flash', to, { color: 0xc9a4ff, intensity: 1.2, distance: 26, duration: 0.3 });
          S.vfx('screenFlash', 0xf0e8ff, 0.18, 0.12);
          S.vfx('shake', 0.4);
          S.sfx('explode_lightning', { position: to });
          S.aoe(to, 3.2, null, () => ({ amount: 95, element: 'lightning', status: { shocked: 5 }, knockback: 4, heavy: true, tags: ['ultimate'] }));
          if (e?.alive) S.combat.applyStatus(e, 'stunned', 1.2);
          S.zones.elementAt(S.ground(to), 2, 'lightning');
        });
      }
      S.later(0.6, () => {
        S.zones.spawn('storm', pt, { radius: 13, duration: 7, strikeDmg: 32, strikeMul: 0.5, onEnd: (z) => S.zones.spawn('water', z.pos, { radius: 9, duration: 9 }) });
      });
    },
  },
  wind: {
    name: '천공의 폭풍 · 각성', desc: '세 개의 거대 회오리가 전장을 휩쓸며 적을 하늘로 날려버림', mp: 55, cd: 17,
    cast(S, aim) {
      const pp = S.playerPos();
      const fd = flatDir(aim.dir);
      const tgt = clampPoint(S, aim, 40);
      const D = Math.max(12, Math.hypot(tgt.x - pp.x, tgt.z - pp.z));
      for (let i = -1; i <= 1; i++) {
        const d = fd.clone().applyAxisAngle(UP, i * 0.42);
        const start = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(d, 4.5);
        const end = new THREE.Vector3(pp.x, 0, pp.z).addScaledVector(d, D + 4);
        S.later(Math.abs(i) * 0.12, () => {
          S.zones.spawn('tornado', start, { radius: i === 0 ? 6 : 5, duration: 8, target: end, speed: Math.max(3, D / 5) });
          S.vfx('shockwave', S.ground(start), { color: C.wind, radius: 7, duration: 0.5, thickness: 1.2 });
        });
      }
      // initial gale blast
      const o = new THREE.Vector3(pp.x, pp.y + 1.1, pp.z).addScaledVector(fd, 2);
      S.props.gust(o, fd, 22, C.wind);
      S.vfx('burst', o, { count: 80, color: [C.wind, glint(C.wind)], shape: 'leaf', speed: 26, dir: fd, spread: 0.35, size: 0.22, life: 0.8, drag: 1.2 });
      S.vfx('screenFlash', 0xd8ffe8, 0.22, 0.4); S.vfx('shake', 0.5); S.vfx('fovKick', 5, 0.4);
      S.sfx('explode_wind', { position: o, pitch: 0.6, volume: 1.3 });
      S.terrain.wind(o.clone().addScaledVector(fd, 10), fd, 2, 16);
      const v = new THREE.Vector3();
      for (const e of foes(S, o, 20)) {
        v.subVectors(e.object.position, pp).setY(0);
        const d = v.length(); if (d < 0.01) continue; v.multiplyScalar(1 / d);
        if (v.dot(fd) < 0.5 && d > 2) continue;
        S.combat.dealDamage(e, { amount: 55, element: 'wind', source: 'player', point: S.center(e).clone(), direction: v.clone(), knockback: 16, launch: 10, heavy: true, tags: ['ultimate'] });
      }
    },
  },
  earth: {
    name: '대륙 붕괴 · 각성', desc: '대륙을 뒤흔드는 4겹의 지진 후 하늘에서 거암이 쏟아짐', mp: 60, cd: 18,
    cast(S) {
      const pp = S.playerPos().clone();
      const radii = [6, 11, 16, 21];
      const hitSet = new Set();
      S.props.sigil(S.ground(pp).clone(), { color: C.earth, radius: 7, duration: 2.4, spin: 0.7 });
      radii.forEach((R, k) => {
        S.later(k * 0.35, () => {
          const c = S.ground(pp).clone();
          S.vfx('shockwave', c, { color: C.earth, radius: R, duration: 0.6, thickness: 1.8 });
          S.vfx('shockwave', c, { color: GLINT, radius: R * 0.9, duration: 0.4, thickness: 0.6 });
          S.vfx('shake', 0.6 + k * 0.12); S.vfx('fovKick', 2 + k, 0.3);
          S.sfx('explode_earth', { position: c, pitch: 0.75 - k * 0.08 }); S.sfx('golem_step', { position: c });
          const n = Math.round(R * 1.9);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.2 + k;
            const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
            S.props.pillars.spawn(x, S.height(x, z), z, { height: 2 + Math.random() * 2.6 + k * 0.4, width: 1 + Math.random() * 0.7, hold: 1.3, delay: Math.random() * 0.1, tiltX: Math.sin(a) * 0.5, tiltZ: -Math.cos(a) * 0.5 });
          }
          S.vfx('debris', c, { count: 20, material: 'rock', color: 0xa7835a, size: 0.35, speed: 12 });
          S.aoe(c, R + 1, null, (e) => {
            if (hitSet.has(e)) return null; hitSet.add(e);
            S.combat.applyStatus(e, 'stunned', 2.5, { earth: true });
            return { amount: 62, element: 'earth', launch: 9, knockback: 6, heavy: true, tags: ['ultimate'] };
          });
          S.zones.elementAt(c, R, 'earth');
        });
      });
      // rockfall from the sky
      const targets = enemiesOnly(S, pp, 22);
      for (let i = 0; i < 10; i++) {
        S.later(1.5 + i * 0.12, () => {
          const e = targets[i % Math.max(1, targets.length)];
          let tp;
          if (e && e.alive) tp = S.ground(e.object.position).clone();
          else { const a = Math.random() * 6.28, r = 4 + Math.random() * 14; tp = new THREE.Vector3(pp.x + Math.cos(a) * r, 0, pp.z + Math.sin(a) * r); tp.y = S.height(tp.x, tp.z); }
          const start = new THREE.Vector3(tp.x + (Math.random() - 0.5) * 6, tp.y + 26, tp.z + (Math.random() - 0.5) * 6);
          const dir = new THREE.Vector3().subVectors(tp, start);
          S.projectiles.spawn({
            kind: 'boulder', element: 'earth', mesh: 'rock', pos: start, dir, speed: dir.length() / 0.6, radius: 1.4, scale: 2.6, damage: 0, life: 1.5,
            pierce: true, trailWidth: 1.4, trailLength: 14, trailColor: 0xcaa070,
            emitter: { rate: 30, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 1, spread: 1, size: 1.2, sizeEnd: 2.2, life: 0.6, additive: false, drag: 2 },
            data: { aoe: 3 },
            onImpact(p, pos) {
              const g = S.ground(pos).clone();
              S.vfx('explosion', g, { element: 'earth', scale: 1.5 });
              S.vfx('debris', g, { count: 14, material: 'rock', color: 0xa7835a, size: 0.4, speed: 12 });
              S.vfx('shake', 0.4);
              S.sfx('explode_earth', { position: g });
              S.aoe(g, 3.5, null, () => ({ amount: 55, element: 'earth', launch: 6, knockback: 8, heavy: true, tags: ['ultimate'] }));
              for (let j = 0; j < 5; j++) { const a = j * 1.26; const x = g.x + Math.cos(a) * 1.6, z = g.z + Math.sin(a) * 1.6; S.props.pillars.spawn(x, S.height(x, z), z, { height: 1.4 + Math.random(), width: 0.9, hold: 1, tiltX: Math.sin(a) * 0.6, tiltZ: -Math.cos(a) * 0.6 }); }
            },
          });
        });
      }
    },
  },
};

// ---------------------------------------------------------------- finishers (R, master, cinematic)
// buildup visuals live in setpieces.js; impact(S, center, target) delivers the blow.
const FIN_TAG = ['finisher', 'ultimate'];
export const FINISHERS = {
  fire: {
    name: '불사조 강림', desc: '불꽃의 날개를 펼친 불사조가 강림해 모든 것을 불태움 (각성 게이지 필요)',
    impact(S, c) {
      const R = 14;
      S.vfx('explosion', c, { element: 'fire', scale: 4.5 });
      S.vfx('shockwave', c, { color: 0xffc060, radius: R * 1.5, duration: 0.8, thickness: 3 });
      S.vfx('shockwave', c, { color: GLINT, radius: R, duration: 0.45, thickness: 2 });
      S.vfx('burst', c, { count: 180, color: [0xfff0b0, 0xff4a10], shape: 'ember', speed: 30, spread: 0.8, dir: UP, size: 0.45, life: 1.8, gravity: -14, drag: 0.6 });
      S.vfx('burst', c, { count: 60, color: [0xffe080, 0xff6a1f], shape: 'ring', speed: 3, spread: 1, size: 1.5, sizeEnd: 7, life: 0.7 });
      // phoenix rebirth column
      S.vfx('burst', c, { count: 90, color: [0xffd070, 0xff3a00], shape: 'ember', speed: 14, dir: UP, spread: 0.12, size: 0.6, life: 1.4, gravity: 4, radius: 2 });
      S.vfx('flash', c, { color: 0xff8030, intensity: 1.2, distance: 70, duration: 1 });
      S.vfx('screenFlash', 0xfff0d0, 0.6, 0.5);
      S.vfx('shake', 1); S.vfx('fovKick', 9, 0.6);
      S.sfx('explode_fire', { position: c, volume: 1.6, pitch: 0.5 });
      S.aoe(c, R, null, (e, d) => ({ amount: 460 * (1 - 0.45 * d / R), element: 'fire', status: { burning: 8 }, knockback: 22, launch: 13, heavy: true, tags: FIN_TAG }));
      S.zones.spawn('fire', c, { radius: 8, duration: 9 });
      for (let i = 0; i < 6; i++) { const a = i * 1.047; S.zones.spawn('fire', new THREE.Vector3(c.x + Math.cos(a) * 9, 0, c.z + Math.sin(a) * 9), { radius: 3.4, duration: 7 }); }
      S.terrain.ignite(c, 11);
      S.decalRing(c, 10, 1.6, 9);
    },
  },
  ice: {
    name: '영원의 겨울', desc: '하늘을 메운 거대한 빙정이 쏟아져 전장을 영원한 겨울로 봉인함 (각성 게이지 필요)',
    impact(S, c, tgt, pts) {
      const R = 15;
      S.vfx('screenFlash', 0xeefcff, 0.6, 0.6);
      S.vfx('shake', 1); S.vfx('fovKick', 8, 0.6);
      S.vfx('explosion', c, { element: 'ice', scale: 4 });
      S.vfx('shockwave', c, { color: 0xdffaff, radius: R * 1.4, duration: 0.8, thickness: 2.6 });
      S.vfx('burst', c, { count: 160, color: [glint(0x9feaff), 0x9feaff], shape: 'snow', speed: 22, spread: 1, disc: true, size: 0.4, life: 2, drag: 1.2 });
      S.vfx('flash', c, { color: 0x9feaff, intensity: 1.2, distance: 60, duration: 0.9 });
      S.sfx('shatter', { position: c, volume: 1.5, pitch: 0.55 }); S.sfx('explode_ice', { position: c, volume: 1.3 });
      // giant central spire + crystal landings
      for (let i = 0; i < 7; i++) { const a = i * 0.9; const r = i ? 1.6 : 0; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; S.props.spikes.spawn(x, S.height(x, z), z, { height: i ? 5 + Math.random() * 2 : 11, width: i ? 2 : 4, hold: 5, sink: 1, tiltX: Math.sin(a) * 0.3 * (i ? 1 : 0), tiltZ: -Math.cos(a) * 0.3 * (i ? 1 : 0) }); }
      for (const p of pts) {
        p.y = S.height(p.x, p.z);
        S.vfx('explosion', p, { element: 'ice', scale: 1.6 });
        for (let j = 0; j < 4; j++) { const a = j * 1.57 + Math.random(); const x = p.x + Math.cos(a) * 1.2, z = p.z + Math.sin(a) * 1.2; S.props.spikes.spawn(x, S.height(x, z), z, { height: 3 + Math.random() * 2.5, width: 1.4, hold: 4, sink: 0.8, tiltX: Math.sin(a) * 0.5, tiltZ: -Math.cos(a) * 0.5 }); }
      }
      S.aoe(c, R, null, (e, d) => ({ amount: 380 * (1 - 0.4 * d / R), element: 'ice', status: { frozen: 5 }, launch: 4, tags: FIN_TAG }));
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; S.zones.spawn('ice', new THREE.Vector3(c.x + Math.cos(a) * 7, 0, c.z + Math.sin(a) * 7), { radius: 4.5, duration: 12 }); }
      S.zones.spawn('ice', c, { radius: 5, duration: 12 });
      S.terrain.chill(c, 18);
      // the eternal winter shatters
      S.later(1.1, () => {
        S.vfx('screenFlash', GLINT, 0.4, 0.3); S.vfx('shake', 0.7);
        S.sfx('shatter', { position: c, volume: 1.4 });
        for (const e of foes(S, c, R + 1)) {
          const p = S.center(e).clone();
          S.vfx('debris', p, { count: 12, material: 'ice', color: 0xc8f6ff, size: 0.45, speed: 11, life: 1.5 });
          S.combat.dealDamage(e, { amount: 50, element: 'physical', heavy: true, source: 'player', point: p, launch: 7, tags: FIN_TAG });
        }
      });
    },
  },
  lightning: {
    name: '천뢰 강림', desc: '뇌신의 인장이 하늘을 가르고 천상의 번개 기둥이 내리꽂힘 (각성 게이지 필요)',
    impact(S, c) {
      const R = 15;
      const sky = new THREE.Vector3(c.x, c.y + 26, c.z);
      for (let i = 0; i < 4; i++) S.vfx('beam', sky, c, { color: i ? 0xd9c2ff : GLINT, width: i ? 1.2 : 0.6, duration: 0.6, jagged: 1.4, segments: 22, branches: 5 });
      S.vfx('explosion', c, { element: 'lightning', scale: 4 });
      S.vfx('shockwave', c, { color: 0xd9c2ff, radius: R * 1.4, duration: 0.7, thickness: 2.4 });
      S.vfx('burst', c, { count: 160, color: [glint(C.lightning), C.lightning], shape: 'spark', speed: 30, spread: 1, size: 0.2, life: 0.8, drag: 1.5, velocityStretch: 0.05 });
      S.vfx('flash', c, { color: 0xc9a4ff, intensity: 1.2, distance: 80, duration: 0.8 });
      S.vfx('screenFlash', 0xf4eeff, 0.7, 0.45);
      S.vfx('shake', 1); S.vfx('fovKick', 9, 0.6);
      S.sfx('explode_lightning', { position: c, volume: 1.6, pitch: 0.6 });
      S.aoe(c, R, null, (e, d) => {
        const p = S.center(e).clone();
        S.vfx('beam', new THREE.Vector3(c.x, c.y + 4, c.z), p, { color: C.lightning, width: 0.4, duration: 0.45, jagged: 0.8, segments: 14, branches: 2 });
        S.combat.applyStatus(e, 'stunned', 2);
        return { amount: 470 * (1 - 0.45 * d / R), element: 'lightning', status: { shocked: 6 }, knockback: 10, launch: 6, heavy: true, tags: FIN_TAG };
      });
      for (let i = 0; i < 8; i++) {
        S.later(0.25 + i * 0.07, () => {
          const a = Math.random() * 6.28, r = 4 + Math.random() * 11;
          const to = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r); to.y = S.height(to.x, to.z);
          S.vfx('beam', new THREE.Vector3(to.x, to.y + 28, to.z), to, { color: 0xd9c2ff, width: 0.5, duration: 0.3, jagged: 1.1, segments: 16, branches: 2 });
          S.vfx('impact', to, { element: 'lightning', scale: 1.5 });
          S.aoe(to, 2.5, null, () => ({ amount: 30, element: 'lightning', status: { shocked: 3 }, tags: FIN_TAG }));
        });
      }
      S.zones.spawn('storm', c, { radius: 12, duration: 5, strikeDmg: 26, strikeMul: 0.6, onEnd: (z) => S.zones.spawn('water', z.pos, { radius: 8, duration: 8 }) });
      S.decalRing(c, 8, 1, 6);
    },
  },
  wind: {
    name: '천공의 눈', desc: '폭풍의 눈이 열리며 하늘까지 닿는 회오리가 적을 휘감아 내리꽂음 (각성 게이지 필요)',
    impact(S, c) {
      const R = 14;
      S.vfx('shockwave', c, { color: C.wind, radius: R * 1.5, duration: 0.8, thickness: 2.4 });
      S.vfx('burst', c, { count: 140, color: [glint(C.wind), C.wind], shape: 'leaf', speed: 24, spread: 1, disc: true, size: 0.3, life: 1.4, drag: 1, tangential: 12 });
      S.vfx('screenFlash', 0xe8fff4, 0.5, 0.45); S.vfx('shake', 0.9); S.vfx('fovKick', 7, 0.6);
      S.sfx('explode_wind', { position: c, volume: 1.6, pitch: 0.5 });
      S.terrain.wind(c, null, 2, 22);
      const caught = [];
      S.aoe(c, R, null, (e) => { caught.push(e); return { amount: 160, element: 'wind', launch: 14, knockback: -4, heavy: true, tags: FIN_TAG }; });
      S.zones.spawn('tornado', c, { radius: 7, duration: 3.5 });
      // ...then the eye slams them back down
      S.later(1.25, () => {
        S.vfx('shockwave', c, { color: GLINT, radius: R, duration: 0.5, thickness: 1.6 });
        S.vfx('explosion', c, { element: 'wind', scale: 3 });
        S.vfx('shake', 0.9); S.vfx('screenFlash', GLINT, 0.35, 0.25);
        S.sfx('explode_wind', { position: c, volume: 1.4, pitch: 0.7 });
        for (const e of caught) {
          if (!e.alive) continue;
          if (e.velocity) e.velocity.y = -30;
          const p = S.center(e).clone();
          S.vfx('beam', new THREE.Vector3(p.x, p.y + 8, p.z), p, { color: C.wind, width: 0.5, duration: 0.25, jagged: 0.2, segments: 6 });
          S.combat.dealDamage(e, { amount: 270, element: 'wind', source: 'player', point: p, knockback: 6, heavy: true, tags: FIN_TAG });
        }
      });
    },
  },
  earth: {
    name: '거신 소환', desc: '대지의 거신을 불러내 그 주먹으로 전장을 내리찍음 (각성 게이지 필요)',
    impact(S, c) {
      const R = 14;
      S.vfx('explosion', c, { element: 'earth', scale: 4.5 });
      S.vfx('shockwave', c, { color: C.earth, radius: R * 1.5, duration: 0.8, thickness: 3 });
      S.vfx('shockwave', c, { color: GLINT, radius: R * 0.8, duration: 0.45, thickness: 1.6 });
      S.vfx('debris', c, { count: 60, material: 'rock', color: 0xa7835a, size: 0.7, speed: 24, life: 2.6 });
      S.vfx('burst', c, { count: 50, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 14, spread: 0.6, dir: UP, size: 3.5, sizeEnd: 7, life: 1.8, additive: false, drag: 1.5, alpha: 0.6 });
      S.vfx('flash', c, { color: 0xffb060, intensity: 1.2, distance: 50, duration: 0.7 });
      S.vfx('screenFlash', 0xfff0d8, 0.45, 0.4);
      S.vfx('shake', 1); S.vfx('fovKick', 9, 0.6);
      S.sfx('explode_earth', { position: c, volume: 1.7, pitch: 0.45 }); S.sfx('golem_step', { position: c, volume: 1.5 });
      for (let k = 0; k < 3; k++) {
        const r = 4 + k * 4.5, n = Math.round(r * 2);
        for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + k; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; S.props.pillars.spawn(x, S.height(x, z), z, { height: 2.5 + Math.random() * 3 - k * 0.4, width: 1.2 + Math.random() * 0.6, hold: 2.5, delay: k * 0.12 + Math.random() * 0.06, tiltX: Math.sin(a) * 0.55, tiltZ: -Math.cos(a) * 0.55 }); }
      }
      S.aoe(c, R, null, (e, d) => {
        S.combat.applyStatus(e, 'stunned', 3, { earth: true });
        return { amount: 500 * (1 - 0.45 * d / R), element: 'earth', launch: 15, knockback: 14, heavy: true, tags: FIN_TAG };
      });
      S.zones.elementAt(c, R, 'earth');
      S.decalRing(c, 11, 1.8, 10);
    },
  },
};

// ---------------------------------------------------------------- support skills (G, master)
/** Legacy support mods → stats keys (doubleJump → extraJumps; lightning adds castSpeed/chainBonus). */
function statMods(el, mods) {
  const o = {};
  if (mods) for (const k in mods) { if (k === 'doubleJump') { if (mods[k]) o.extraJumps = 1; } else o[k] = mods[k]; }
  if (el === 'lightning') { o.castSpeed = 1.6; o.chainBonus = 2; }
  return o;
}
export const SUPPORTS = {
  fire: { name: '불꽃 정령 소환', desc: '주위를 맴돌며 적에게 화염구를 쏘는 불꽃 정령을 소환 (15초)', mp: 25, cd: 24, duration: 15 },
  ice: { name: '얼음 갑옷', desc: '받는 피해 50% 감소, 공격한 적을 얼어붙게 함 (12초)', mp: 22, cd: 22, duration: 12, mods: { dmgTakenMul: 0.5 } },
  lightning: { name: '번개 축복', desc: '시전 속도 60% 증가, 번개 연쇄 +2, 이동 속도 증가 (12초)', mp: 22, cd: 22, duration: 12, mods: { moveMul: 1.2 } },
  wind: { name: '바람의 날개', desc: '이동 속도 증가, 이단 점프, 활공 시 상승 기류와 무한 활공 (15초)', mp: 20, cd: 22, duration: 15, mods: { moveMul: 1.3, doubleJump: true, extraDash: 1 } },
  earth: { name: '대지의 수호', desc: '주위를 도는 바위 방벽 — 받는 피해 55% 감소, 넉백 무시, 닿는 적에게 피해 (12초)', mp: 25, cd: 24, duration: 12, mods: { dmgTakenMul: 0.45, noKnockback: true } },
};

/** Runtime for the active support buff (visual + behaviour). One buff at a time. */
export function createSupportRuntime(S, assets) {
  const { game } = S;
  const { coreMat, fresnelMat, flameGeo, flameMat, crystalGeo, iceMatSolid, rockGeo, rockMat, crescentGeo, outlineBasic } = assets;
  let cur = null;      // {el, t, dur, vis, saved, emitters, shootT, hitT}
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const visCache = {};
  // v4: the fire spirit (the only support visual kept with the kit) is built at load, so the first cast compiles nothing
  try { if (S.looks?.on()) { visCache.fire = S.looks.adopt(makeVis('fire')); } } catch (_) { /* */ }

  function makeVis(el) {
    const g = new THREE.Group();
    const u = { parts: [] };
    if (el === 'fire') {
      const sp = new THREE.Group();
      sp.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), coreMat(0xff9a40, 1.2)));
      sp.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), fresnelMat(0xff5a10, { power: 1.8, intensity: 1.1, core: 0.02 })));
      const f = new THREE.Mesh(flameGeo(), flameMat()); f.scale.set(0.9, 1.1, 0.9); f.position.y = -0.1; sp.add(f);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(flameGeo(), flameMat()); w.rotation.z = s * -1.2; w.scale.set(0.5, 0.9, 0.5); w.position.x = s * 0.15; sp.add(w); u.parts.push(w); }
      g.add(sp); u.spirit = sp;
    } else if (el === 'ice') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), fresnelMat(0x9feaff, { power: 2, intensity: 1.2, core: 0.04 }));
      g.add(shell); u.shell = shell;
      for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(crystalGeo(), iceMatSolid()); const o = new THREE.Mesh(crystalGeo(), outlineBasic(0x1d4a66)); o.scale.setScalar(1.12); c.add(o); c.scale.setScalar(0.5); g.add(c); u.parts.push(c); }
    } else if (el === 'lightning') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 6, 32), fresnelMat(0xd9c2ff, { power: 0.5, intensity: 1.2, core: 0.6 }));
      const ring2 = ring.clone();
      g.add(ring, ring2); u.parts.push(ring, ring2);
    } else if (el === 'wind') {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8fffc1, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        const w = new THREE.Mesh(crescentGeo(), mat); w.rotation.set(0, s * Math.PI / 2, Math.PI / 2); w.scale.set(1.3, 1, 1.9); w.position.x = s * 1.0;
        const w2 = new THREE.Mesh(crescentGeo(), mat); w2.rotation.copy(w.rotation); w2.scale.set(0.9, 1, 1.3); w2.position.set(s * 0.8, -0.35, 0);
        pivot.add(w, w2); pivot.userData.side = s; g.add(pivot); u.parts.push(pivot);
      }
    } else if (el === 'earth') {
      for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(rockGeo(), rockMat()); const o = new THREE.Mesh(rockGeo(), outlineBasic(0x2a1c10)); o.scale.setScalar(1.1); r.add(o); r.castShadow = true; g.add(r); u.parts.push(r); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.05, 6, 48), fresnelMat(0xe0a85a, { power: 0.5, intensity: 1.2, core: 0.5 })); ring.rotation.x = Math.PI / 2; g.add(ring); u.ring = ring;
    }
    g.userData = u;
    return g;
  }

  function stop(silent = false) {
    if (!cur) return;
    try { game.stats?.clear?.(cur.statId); } catch (_) { /* */ }
    for (const e of cur.emitters) { try { e.stop(); } catch (_) { /* */ } }
    if (cur.look) { S.looks?.stopAll(cur.look); cur.look = null; }
    game.scene.remove(cur.vis);
    if (!silent) {
      v.copy(S.playerPos()); v.y += 1;
      S.vfx('burst', v, { count: 20, color: [C[cur.el], GLINT], shape: 'spark', speed: 4, spread: 1, size: 0.1, life: 0.4, drag: 2 });
      game.events.emit('supportEnd', { element: cur.el });
    }
    cur = null;
  }

  function start(el) {
    stop(true);
    const def = SUPPORTS[el];
    const vis = visCache[el] || (visCache[el] = S.looks ? S.looks.adopt(makeVis(el)) : makeVis(el));
    // v4: buffs show the element aura motif (ground linework following the caster); the fire spirit stays (it is the familiar that shoots)
    const v4 = !!S.looks?.on();
    if (!v4 || el === 'fire') game.scene.add(vis);
    const pl = game.player;
    // v3: buffs are a timed game.stats source (CONTRACT §5); player.mods is a read-only getter view
    const statId = 'buff:' + el + '.sup';
    try { game.stats?.set?.(statId, statMods(el, def.mods), { duration: def.duration }); } catch (_) { /* */ }
    cur = { el, t: 0, dur: def.duration, vis, statId, emitters: [], shootT: 0.6, hitT: 0, arcT: 0, look: null };
    const follow = pl?.object;
    if (v4 && follow) { cur.look = S.looks.aura(el, follow, def.duration); S.looks.motif(el, 'summon', { pos: S.playerPos().clone(), r: 1 }); }
    const shape = { fire: 'ember', ice: 'snow', lightning: 'spark', wind: 'leaf', earth: 'smoke' }[el];
    if (follow && !v4) {
      const em = S.vfx('emitter', { follow, offset: new THREE.Vector3(0, 1, 0), rate: el === 'earth' ? 6 : 14, color: [C[el], GLINT], shape, speed: 1.2, spread: 1, size: el === 'earth' ? 0.5 : 0.12, sizeEnd: 0, life: 0.7, drag: 1.5, radius: 0.7, additive: el !== 'earth' });
      if (em) cur.emitters.push(em);
    }
    // cast flourish
    v.copy(S.playerPos()); v.y += 1;
    S.vfx('shockwave', S.ground(v).clone(), { color: C[el], radius: 4, duration: 0.5, thickness: 0.8 });
    S.vfx('shockwave', v, { color: C[el], radius: 2.4, duration: 0.4, vertical: true, thickness: 0.3 });
    S.vfx('burst', v, { count: 40, color: [C[el], GLINT], shape, speed: 6, spread: 1, size: 0.2, life: 0.7, drag: 2 });
    S.vfx('flash', v, { color: C[el], intensity: 1.2, distance: 12, duration: 0.4 });
    S.vfx('screenFlash', C[el], 0.12, 0.3);
    S.props.sigil(S.ground(v).clone(), { color: C[el], radius: 2.6, duration: 1, spin: 2 });
    game.events.emit('supportStart', { element: el, duration: def.duration });
  }

  const tmpList = [];
  function update(dt, realDt) {
    if (!cur) return;
    const pl = game.player;
    if (!pl?.entity?.alive) { stop(); return; }
    cur.t += dt;
    if (cur.t >= cur.dur) { stop(); return; }
    const u = cur.vis.userData, P = S.playerPos(), T = game.time;
    const fadeK = Math.min(1, (cur.dur - cur.t) / 0.6) * Math.min(1, cur.t / 0.25);
    switch (cur.el) {
      case 'fire': {
        const a = T * 2.2;
        u.spirit.position.set(P.x + Math.cos(a) * 1.5, P.y + 2.1 + Math.sin(T * 3.1) * 0.25, P.z + Math.sin(a) * 1.5);
        u.spirit.scale.setScalar(fadeK);
        for (let i = 0; i < u.parts.length; i++) u.parts[i].rotation.z = (i ? 1 : -1) * (-1.2 + Math.sin(T * 12) * 0.35);
        cur.shootT -= dt;
        if (cur.shootT <= 0) {
          const tgt = S.nearestEnemy(u.spirit.position, 22, tmpList);
          if (tgt) {
            cur.shootT = 0.75;
            const tc = S.center(tgt, v2);
            const d = v.subVectors(tc, u.spirit.position).normalize();
            S.projectiles.spawn({
              kind: 'fireball', element: 'fire', mesh: 'fireball', pos: u.spirit.position, dir: d, speed: 34, radius: 0.4, scale: 0.6,
              damage: 14, life: 1.6, homing: 7, target: tgt, status: { burning: 2 }, knockback: 2, trailWidth: 0.25, trailLength: 8,
              data: { aoe: 1.2 },
              onImpact(p, pos) { S.vfx('impact', pos, { element: 'fire', scale: 0.5 }); S.sfx('impact_fire', { position: pos, volume: 0.45 }); S.terrain.ignite(pos, 1); },
            });
            S.vfx('burst', u.spirit.position, { count: 8, color: [0xffe080, 0xff4a10], shape: 'ember', speed: 3, spread: 1, size: 0.14, life: 0.3 });
            S.sfx('cast_fire', { position: u.spirit.position, volume: 0.35, pitch: 1.4 });
          } else cur.shootT = 0.3;
        }
        break;
      }
      case 'ice': {
        u.shell.position.set(P.x, P.y + 1.05, P.z);
        u.shell.scale.set(0.95 * fadeK, 1.35 * fadeK, 0.95 * fadeK);
        for (let i = 0; i < u.parts.length; i++) {
          const a = T * 1.6 + (i / u.parts.length) * Math.PI * 2;
          const c = u.parts[i];
          c.position.set(P.x + Math.cos(a) * 1.05, P.y + 0.4 + (i % 2) * 0.8, P.z + Math.sin(a) * 1.05);
          c.rotation.set(Math.cos(a) * 0.4, -a, Math.sin(a) * 0.4);
          c.scale.setScalar(0.42 * fadeK);
        }
        break;
      }
      case 'lightning': {
        const [r1, r2] = u.parts;
        r1.position.set(P.x, P.y + 1 + Math.sin(T * 4) * 0.5, P.z); r1.rotation.set(Math.PI / 2 + Math.sin(T * 3) * 0.3, 0, T * 6); r1.scale.setScalar(fadeK);
        r2.position.set(P.x, P.y + 1 - Math.sin(T * 4) * 0.5, P.z); r2.rotation.set(Math.PI / 2 - Math.sin(T * 3) * 0.3, 0, -T * 5); r2.scale.setScalar(fadeK * 1.15);
        cur.arcT -= dt;
        if (cur.arcT <= 0) {
          cur.arcT = 0.12 + Math.random() * 0.12;
          const a1 = Math.random() * 6.28, a2 = a1 + 1 + Math.random() * 2;
          v.set(P.x + Math.cos(a1) * 0.7, P.y + 0.3 + Math.random() * 1.6, P.z + Math.sin(a1) * 0.7);
          v2.set(P.x + Math.cos(a2) * 0.7, P.y + 0.3 + Math.random() * 1.6, P.z + Math.sin(a2) * 0.7);
          S.vfx('beam', v, v2, { color: C.lightning, width: 0.05, duration: 0.1, jagged: 0.3, segments: 6 });
        }
        break;
      }
      case 'wind': {
        const yaw = pl.facing ?? pl.object?.rotation?.y ?? 0;
        for (const w of u.parts) {
          const s = w.userData.side;
          w.position.set(P.x - Math.sin(yaw) * 0.35, P.y + 1.45, P.z - Math.cos(yaw) * 0.35);
          const flap = pl.gliding ? Math.sin(T * 3) * 0.15 : Math.sin(T * 6) * 0.35;
          w.rotation.set(0, yaw, s * (0.25 + flap));
          w.scale.setScalar(fadeK * (pl.gliding ? 1.3 : 0.9));
        }
        // 바람의 날개: gentle lift + no stamina drain while gliding
        if (pl.gliding && pl.entity?.velocity) {
          pl.entity.velocity.y += 7.5 * dt;
          if (pl.stamina != null) pl.stamina = Math.min(pl.maxStamina || 100, pl.stamina + 30 * dt);
        }
        break;
      }
      case 'earth': {
        const n = u.parts.length;
        for (let i = 0; i < n; i++) {
          const a = T * 2.4 + (i / n) * Math.PI * 2;
          const r = u.parts[i];
          r.position.set(P.x + Math.cos(a) * 2.2, P.y + 0.9 + Math.sin(T * 3 + i) * 0.3, P.z + Math.sin(a) * 2.2);
          r.rotation.set(T * 2 + i, T * 3, 0);
          r.scale.setScalar((0.55 + (i % 3) * 0.12) * fadeK);
        }
        u.ring.position.set(P.x, P.y + 0.3, P.z); u.ring.scale.setScalar(fadeK);
        cur.hitT -= dt;
        if (cur.hitT <= 0) {
          cur.hitT = 0.45;
          v.set(P.x, P.y + 1, P.z);
          for (const e of S.combat.queryRadius(v, 2.9, FOES, tmpList)) {
            v2.subVectors(e.object.position, P).setY(0).normalize();
            S.combat.dealDamage(e, { amount: 12, element: 'earth', source: 'player', point: S.center(e).clone(), direction: v2.clone(), knockback: 9, launch: 2, tags: ['support'] });
          }
          tmpList.length = 0;
        }
        break;
      }
    }
    void realDt;
  }

  // 얼음 갑옷: attackers get frozen solid
  function onPlayerHit(src) {
    if (!cur || cur.el !== 'ice' || !src || typeof src !== 'object' || !src.alive || src.team === 'player') return;
    S.combat.applyStatus(src, 'chilled', 3);
    if (!src.statuses?.frozen && !(src._iceArmorT > game.time)) { src._iceArmorT = game.time + 3; S.combat.applyStatus(src, 'frozen', 1.6); }
    const c = S.center(src).clone();
    S.vfx('burst', c, { count: 18, color: [glint(0x9feaff), 0x9feaff], shape: 'shard', speed: 6, spread: 1, size: 0.16, life: 0.5, gravity: -6 });
    S.sfx('impact_ice', { position: c, volume: 0.6 });
  }

  return {
    start, stop, update, onPlayerHit,
    get active() { return cur ? cur.el : null; },
    get timeLeft() { return cur ? Math.max(0, cur.dur - cur.t) : 0; },
    /** Cast-speed multiplier (번개 축복). */
    get castSpeed() { return cur?.el === 'lightning' ? 1.6 : 1; },
    get chainBonus() { return cur?.el === 'lightning' ? 2 : 0; },
    warm(group) { for (const el of Object.keys(SUPPORTS)) { const g = visCache[el] || (visCache[el] = makeVis(el)); group.add(g); } },
    unwarm(group) { for (const el in visCache) group.remove(visCache[el]); },
  };
}
