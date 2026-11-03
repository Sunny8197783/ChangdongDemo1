// Paladin (warhammer + shield) and shadowblade (twin daggers) base movesets, DESIGN §2.2. Element payloads come from
// elmoves2.payload so every one of the 9 elements (and unknown ids) works. Action specs for the engine in src/sword.js;
// the engine applies the weapon profile (hammer reach ×1.2 / speed ×0.85, daggers reach ×0.85 / speed ×1.25).
//  paladin:     LMB 3-hit heavy combo (hitstop 0.09 / 0.10 / 0.16), 3rd hit = ground slam r 3 with the element payload.
//               RMB 방패 돌진 강타: 6 m shield-bash dash that ends in a hammer slam.
//  shadowblade: LMB 6-hit dagger combo (hitstop 0.04, 6th 0.10), 6th = cross slash + element payload.
//               RMB 관통 일격: 9 m dash-through strike, reappearing behind the target.
// Damage numbers are UNSCALED base amounts (CONTRACT §8.3).
import * as THREE from 'three';
import { rand } from '../core/utils.js';
import { palOf } from './weapons.js';

export const CLASS_MOVES_KO = {
  hammer: { basic: ['성전 망치술', '묵직한 3연격. 3타: 지면 강타(반경 3m)에 속성이 실린다'], heavy: ['방패 돌진 강타', '방패로 6m 돌진한 뒤 망치로 내려찍는다'] },
  daggers: { basic: ['그림자 쌍검술', '빠른 6연격. 6타: 교차 베기에 속성이 실린다'], heavy: ['관통 일격', '9m를 꿰뚫고 적의 등 뒤에 나타난다'] },
};

export function buildClassMoves(S, M) {
  const game = S.game;
  const P = () => game.player;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const ground = (p) => { p.y = S.groundAt(p.x, p.z); return p; };
  const front = (dist, yaw = P().facing, from = S.pos()) => ground(V(from.x + Math.sin(yaw) * dist, 0, from.z + Math.cos(yaw) * dist));
  const vfx = (n, ...a) => S.vcall(n, ...a);
  const _ghost = new THREE.Color(), _t = new THREE.Vector3();
  const stat2 = (el) => M.status3(el);

  // ------------------------------------------------------------------ paladin
  function hammerCombo(el, step) {
    const fl = (e, p) => M.flourish(el, p);
    if (step === 0) return {
      name: 'p1', kind: 'combo', tpl: 'hammerR', dur: 0.62, cancel: 0.42, lunge: 2.0, lungeT: [0.18, 0.5], trail: [0.36, 0.78],
      hits: [{ t0: 0.42, t1: 0.6, shape: 'arc', a0: -1.8, a1: 1.5, reach: 2.6, spec: { amount: 22, kb: 5, hsOverride: 0.09, onHit: fl }, arc: { tilt: 0.18, h: 1.0, life: 0.32 } }],
    };
    if (step === 1) return {
      name: 'p2', kind: 'combo', tpl: 'hammerL', dur: 0.64, cancel: 0.44, lunge: 2.0, lungeT: [0.18, 0.5], trail: [0.36, 0.78],
      hits: [{ t0: 0.42, t1: 0.6, shape: 'arc', a0: 1.7, a1: -1.6, reach: 2.6, spec: { amount: 24, kb: 5.5, hsOverride: 0.10, status: stat2(el) || undefined, onHit: fl }, arc: { tilt: -0.3, h: 1.05, life: 0.32 } }],
    };
    return {
      name: 'p3', kind: 'combo', tpl: 'hammerSlam', dur: 0.92, cancel: 0.84, lunge: 2.4, lungeT: [0.15, 0.55], trail: [0.44, 0.7], superArmor: true,
      hits: [{ t0: 0.54, t1: 0.62, shape: 'sector', half: 0.55, reach: 2.4, spec: { amount: 18, kb: 3, hsOverride: 0.16, heavy: true, onHit: fl },
        arc: { tilt: Math.PI / 2, h: 0.9, a0: 2.0, a1: -1.3, rin: 0.9, life: 0.3 }, a0: 2.0, a1: -1.3 }],
      events: [[0.6, (a) => {
        const p = front(1.7, a.yaw0);
        vfx('shockwave', p, { color: 0xf0e0c0, radius: 3.6, duration: 0.4, opacity: 0.85, thickness: 0.35 });
        vfx('debris', V(p.x, p.y + 0.2, p.z), { count: 8, size: 0.26, speed: 7, material: 'rock' });
        vfx('groundDecal', 'crack', p, 2.6, 7);
        M.payload(el, p, { r: 3, dmg: 30, kb: 7, launch: 2.5, big: true, spec: { hsOverride: 0.16 } });
        S.sfx('explode_earth', { position: p, volume: 0.6 }); S.sfx('impact_' + el, { position: p, volume: 0.8 });
      }]],
    };
  }
  function hammerCharged(el, f) {
    const dist = 6, set = new Set();
    let start = null, dir = null, traveled = 0;
    return {
      name: 'p_bash', kind: 'heavy', tpl: 'shieldBash', dur: 1.05, cancel: 0.9, move: 0, target: null, facing: 'camera', trail: [0.66, 0.86], superArmor: true, noGlide: true,
      onUpdate: (dt, a, A) => {
        if (!start) { start = S.pos().clone(); dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0)); }
        const t = a.t / a.dur;
        if (t > 0.16 && t < 0.42 && traveled < dist) {
          const sp = dist / (0.26 * a.dur / a.speed);
          A.vel.copy(dir).multiplyScalar(sp); traveled += sp * dt / a.speed;
          if (Math.random() < 0.5) P().spawnGhost(_ghost.setHex(palOf(el).b), 0.25, 0.45);
          const p = S.pos();
          vfx('burst', _t.set(p.x, p.y + 0.2, p.z), { count: 2, shape: 'dust', additive: false, color: [0xd9c094, 0x9a8460], speed: 1.5, spread: 1, size: 0.4, sizeEnd: 0.9, life: 0.5, drag: 3 });
          S.getWeaponPoint('off', _t);
          S.hitLine(start, dir, traveled + 1.4, 2.2, { amount: 16 + 12 * f, kb: 9, status: { stunned: { dur: 0.5 } }, heavy: true, dirMode: 'fwd', hsOverride: 0.1 }, set);
        }
      },
      events: [
        [0.14, () => { S.sfx('shield_bash', { pitch: 0.9 }); S.sfx('sword_swing_heavy', { pitch: 0.7 }); vfx('fovKick', 5, 0.35); }],
        [0.3, () => { S.getWeaponPoint('off', _t); vfx('shockwave', _t.clone(), { color: 0xfff0c8, radius: 1.6, duration: 0.22, vertical: true, opacity: 0.8 }); }],
        [0.8, (a) => {
          const p = front(1.8, a.yaw0);
          vfx('explosion', V(p.x, p.y + 0.4, p.z), { element: el, scale: 1.1 + 0.5 * f });
          vfx('shockwave', p, { color: palOf(el).a, radius: 4 + f, duration: 0.45, opacity: 0.9, thickness: 0.4 });
          vfx('debris', V(p.x, p.y + 0.2, p.z), { count: 10, size: 0.3, speed: 8, material: 'rock' });
          M.payload(el, p, { r: 3.2 + f, dmg: 40 + 40 * f, kb: 9, launch: 4, big: true, spec: { hsOverride: 0.18 } });
          vfx('fovKick', 7, 0.4);
          S.sfx('explode_' + (el === 'physical' ? 'earth' : el), { position: p });
        }],
      ],
    };
  }

  // ------------------------------------------------------------------ shadowblade
  function daggerCombo(el, step) {
    const fl = (e, p) => M.flourish(el, p);
    if (step < 5) {
      const right = step % 2 === 0;
      return {
        name: 'd' + (step + 1), kind: 'combo', tpl: right ? 'daggerR' : 'daggerL', dur: 0.34, cancel: 0.22, lunge: 2.4, lungeT: [0.1, 0.4], trail: [0.22, 0.7],
        hits: [{ t0: 0.32, t1: 0.52, shape: 'arc', a0: right ? -1.6 : 1.6, a1: right ? 1.5 : -1.5, reach: 2.4,
          spec: { amount: 8 + (step >> 1), kb: 1.2, hsOverride: 0.04, status: step === 3 ? (stat2(el) || undefined) : undefined, onHit: fl },
          arc: { tilt: (right ? 0.3 : -0.4) + rand(-0.15, 0.15), h: 1.0 + rand(-0.15, 0.15), life: 0.22 } }],
        onUpdate: (dt, a) => { if (a.t < a.dur * 0.5 && Math.random() < 0.15) P().spawnGhost(_ghost.setHex(palOf(el).a), 0.18, 0.35); },
      };
    }
    return {
      name: 'd6', kind: 'combo', tpl: 'daggerCross', dur: 0.6, cancel: 0.54, lunge: 2.8, lungeT: [0.12, 0.45], trail: [0.38, 0.8],
      hits: [
        { t0: 0.5, t1: 0.64, shape: 'arc', a0: 1.6, a1: -1.6, reach: 2.6, spec: { amount: 9, kb: 1, hsOverride: 0.05, onHit: fl }, arc: { tilt: 0.75, h: 1.1, life: 0.3 } },
        { t0: 0.52, t1: 0.66, shape: 'arc', a0: -1.6, a1: 1.6, reach: 2.6, spec: { amount: 14, kb: 4, hsOverride: 0.10, heavy: true, onHit: (e, p) => M.flourish(el, p, true) }, arc: { tilt: -0.75, h: 1.1, life: 0.32 }, swing: false },
      ],
      events: [[0.64, (a) => {
        const p = front(1.6, a.yaw0);
        M.payload(el, p, { r: 2.4, dmg: 16, kb: 4, spec: { hsOverride: 0.1 } });
        if (el === 'nature') M.vineLash(a.yaw0, 7, 10);   // DESIGN §6.10: the 6th dagger hit is a vine lash
        S.sfx('impact_' + el, { position: p, volume: 0.7 });
      }]],
    };
  }
  function daggerCharged(el, f) {
    const set = new Set();
    return {
      name: 'd_pierce', kind: 'heavy', tpl: 'daggerDash', dur: 0.8, cancel: 0.66, move: 0, target: null, facing: 'camera', trail: [0.02, 0.8], superArmor: true, noGlide: true, gravityMul: 0,
      events: [[0.05, (a) => { M.dashThrough(a, 9, 40 + 40 * f, set, el, M.status3(el) || undefined); }],
        [0.44, (a) => {
          S.arc({ yaw: a.yaw0, a0: 1.8, a1: -1.8, rout: 2.8, rin: 1.0, h: 1.1, sweep: 0.05, life: 0.3, tilt: 0.65 });
          S.arc({ yaw: a.yaw0, a0: -1.8, a1: 1.8, rout: 2.8, rin: 1.0, h: 1.1, sweep: 0.05, life: 0.3, tilt: -0.65 });
          M.payload(el, front(1.4, a.yaw0), { r: 2.6, dmg: 16 + 16 * f, kb: 3 });
        }]],
    };
  }

  return {
    hammer: { len: 3, combo: hammerCombo, heavy: hammerCharged },
    daggers: { len: 6, combo: daggerCombo, heavy: daggerCharged },
  };
}
