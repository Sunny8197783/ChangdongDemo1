// Element movesets for the swordsman: 4-hit combo (4th special), charged skill, ultimate (+ awakened), finisher,
// support buff, and the 반격 flurry. Every move is an action spec for the engine in src/sword.js.
// Hit feel: anticipation → fast strike → follow-through; explicit hitstop per hit (light 0.07, 4th 0.12,
// charged 0.14-0.18, ultimate 0.2).
import * as THREE from 'three';
import { clamp, rand } from '../core/utils.js';
import { TPL, sampleTpl } from './anim.js';

export const PAL = {
  fire: { a: 0xff4a10, b: 0xffe08a, noise: 0.7 },
  ice: { a: 0x3fb8ff, b: 0xeaffff, noise: 0.35 },
  lightning: { a: 0x9a6bff, b: 0xf6eeff, noise: 0.8 },
  wind: { a: 0x2fe39a, b: 0xeafff4, noise: 0.6 },
  earth: { a: 0xd0802a, b: 0xfff0c0, noise: 0.55 },
};
export const CD = { heavy: 4, ultimate: 14, support: 30 };

const NAMES = {
  fire: { basic: ['화염 검술', '빠른 4연격. 4타: 회전베기 후 화염 폭발'], heavy: ['염화 발도', '순식간에 돌진하며 베어 화염의 궤적을 남긴다'], ultimate: ['홍련 난무', '불꽃 회오리가 되어 주변을 베어낸다'], finisher: ['종말의 화룡검', '화룡을 불러 모든 것을 불태운다'], support: ['불꽃 갑주', '공격력 증가 + 주변 적 화상'] },
  ice: { basic: ['냉기 검술', '4연격. 4타: 찌르기와 함께 빙결 파동'], heavy: ['빙결 일섬', '모든 것을 꿰뚫는 얼음 찌르기'], ultimate: ['절대영도 검무', '얼음의 검무 후 주변을 통째로 얼린다'], finisher: ['영겁의 빙화', '거대한 얼음 꽃이 피어난다'], support: ['서리 방벽', '받는 피해 감소 + 공격자 둔화'] },
  lightning: { basic: ['번개 검술', '4연격. 4타: 내려베기와 함께 낙뢰'], heavy: ['뇌광 섬격', '최대 5명의 적 사이를 번개처럼 오가며 벤다'], ultimate: ['천뢰 낙인', '하늘 높이 도약해 번개와 함께 내리꽂는다'], finisher: ['신뇌일도', '하늘을 가르는 신의 일격'], support: ['신속', '이동 속도와 공격 속도 증가'] },
  wind: { basic: ['바람 검술', '4연격. 4타: 적을 하늘로 띄운다'], heavy: ['진공참', '거대한 초승달 바람 칼날을 날린다'], ultimate: ['폭풍 검진', '바람의 검들이 주위를 돌며 적을 벤다'], finisher: ['천공의 대선풍', '하늘까지 닿는 대선풍'], support: ['순풍', '2단 점프 + 질풍보 1회 추가'] },
  earth: { basic: ['대지 검술', '묵직한 4연격. 4타: 도약 후 지면 강타'], heavy: ['대지 가르기', '땅을 갈라 바위를 솟구치게 한다'], ultimate: ['대지의 심판', '하늘에서 거대한 돌검이 떨어진다'], finisher: ['거신의 일격', '거신의 검으로 대지를 내려친다'], support: ['바위 피부', '받는 피해 감소 + 경직 면역'] },
};

const TWO_PI = Math.PI * 2;
const STATUS3 = { fire: { burning: 3 }, ice: { chilled: 3 }, lightning: { shocked: 2 }, wind: null, earth: null };

export function buildMoves(S) {
  const game = S.game;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const P = () => game.player;
  const ground = (p) => { p.y = S.groundAt(p.x, p.z); return p; };
  const front = (dist, yaw = P().facing, from = S.pos()) => ground(V(from.x + Math.sin(yaw) * dist, 0, from.z + Math.cos(yaw) * dist));
  const vfx = (n, ...a) => S.vcall(n, ...a);
  const col = (el) => PAL[el];
  const _t = V(), _u = V();

  // ------------------------------------------------------------ per-hit element flourish
  function flourish(el, p, big = false) {
    const c = col(el), s = big ? 1.6 : 1;
    if (el === 'fire') vfx('burst', p, { count: Math.round(8 * s), shape: 'ember', color: [0xffe08a, 0xff3a10], speed: 5 * s, spread: 0.9, dir: S.UP, gravity: -2, size: 0.12, sizeEnd: 0, life: 0.5, drag: 2 });
    else if (el === 'ice') vfx('burst', p, { count: Math.round(8 * s), shape: 'shard', additive: false, color: [0xeaffff, 0x5ec8ff], speed: 5 * s, spread: 1, size: 0.14, sizeEnd: 0.05, life: 0.45, gravity: 8, drag: 2 });
    else if (el === 'lightning') { for (let i = 0; i < (big ? 3 : 1); i++) { _t.set(p.x + rand(-1, 1), p.y + rand(-0.5, 1), p.z + rand(-1, 1)); vfx('beam', p, _t, { color: c.a, width: 0.06, duration: 0.09, jagged: 0.5, segments: 6 }); } }
    else if (el === 'wind') vfx('burst', p, { count: Math.round(6 * s), shape: 'soft', color: [0xeafff4, 0x7fffc0], speed: 4 * s, spread: 1, size: 0.3, sizeEnd: 0.8, life: 0.3, drag: 3, alpha: 0.6 });
    else if (el === 'earth') vfx('burst', p, { count: Math.round(6 * s), shape: 'smoke', additive: false, color: [0xd9c094, 0x9a8460], speed: 3 * s, spread: 0.8, size: 0.3, sizeEnd: 0.9, life: 0.5, drag: 3 });
  }

  // ------------------------------------------------------------ combo
  function comboSpec(el, step, ctx) {
    const st = step === 2 ? STATUS3[el] : null;
    const baseHit = (amount, extra = {}) => ({ amount, kb: 3.5, hs: 0.07, shake: 0.16, status: st || undefined, ...extra, onHit: (e, p) => { flourish(el, p); extra.onHit?.(e, p); } });
    const onOpen = () => S.slashTerrain(front(2.7));
    if (step === 0) return {
      name: 'c1', kind: 'combo', tpl: 'slashR', dur: 0.4, cancel: 0.25, lunge: 2.6, lungeT: [0.12, 0.45], trail: [0.26, 0.72],
      hits: [{ t0: 0.32, t1: 0.54, shape: 'arc', a0: -1.7, a1: 1.5, reach: 2.6, spec: baseHit(16), arc: { tilt: 0.14, h: 1.05 }, onOpen }],
    };
    if (step === 1) return {
      name: 'c2', kind: 'combo', tpl: 'slashL', dur: 0.42, cancel: 0.27, lunge: 2.6, lungeT: [0.12, 0.45], trail: [0.26, 0.72],
      hits: [{ t0: 0.32, t1: 0.54, shape: 'arc', a0: 1.6, a1: -1.6, reach: 2.6, spec: baseHit(17), arc: { tilt: -0.42, h: 1.15 }, onOpen }],
    };
    if (step === 2) return {
      name: 'c3', kind: 'combo', tpl: 'overhead', dur: 0.48, cancel: 0.32, lunge: 2.8, lungeT: [0.15, 0.5], trail: [0.3, 0.75],
      hits: [{ t0: 0.38, t1: 0.54, shape: 'sector', half: 0.6, reach: 2.9, spec: baseHit(21, { kb: 5, hs: 0.085, shake: 0.22, heavy: false }),
        arc: { tilt: Math.PI / 2, h: 0.9, a0: 2.0, a1: -1.3, rin: 1.0 }, a0: 2.0, a1: -1.3, onOpen }],
      events: [[0.55, () => { const p = front(1.9); vfx('burst', p, { count: 8, shape: 'smoke', additive: false, color: [0xe6dbc0, 0xb8a98a], speed: 2.5, spread: 0.5, dir: S.UP, size: 0.3, sizeEnd: 0.9, life: 0.5, drag: 3 }); }]],
    };
    return FOURTH[el](ctx);
  }

  const FOURTH = {
    fire: (ctx) => ({
      name: 'c4_fire', kind: 'combo', tpl: 'spin', dur: 0.74, cancel: 0.6, lunge: 2.2, lungeT: [0.05, 0.35], trail: [0.3, 0.86], spin: { t0: 0.36, t1: 0.82, turns: 1 },
      hits: [{ t0: 0.36, t1: 0.82, shape: 'arc', a0: -Math.PI / 2, a1: -Math.PI / 2 - TWO_PI, reach: 2.8, spec: { amount: 14, kb: 3, hs: 0.06, shake: 0.14, onHit: (e, p) => flourish('fire', p) },
        arc: { a0: -Math.PI / 2 + 0.3, a1: -Math.PI / 2 - TWO_PI, tilt: 0.05, h: 1.0, rin: 0.8, life: 0.5 }, heavy: true }],
      events: [[0.84, () => {
        const p = front(1.6); p.y += 0.6;
        vfx('explosion', p, { element: 'fire', scale: 1.1 });
        vfx('fovKick', 4, 0.3);
        S.hitCircle(p, 3.6, { amount: 26, kb: 10, launch: 4, status: { burning: 4 }, hs: 0.12, shake: 0.45, heavy: true, impact: 1.4, dirMode: 'out' });
        S.terrain('ignite', ground(p.clone()), 2);
        S.sfx('explode_fire', { position: p });
      }]],
    }),
    ice: (ctx) => ({
      name: 'c4_ice', kind: 'combo', tpl: 'thrust', dur: 0.66, cancel: 0.62, lunge: 2.4, lungeT: [0.2, 0.5], trail: [0.34, 0.6],
      hits: [{ t0: 0.38, t1: 0.56, shape: 'line', len: 3.4, width: 1.1, spec: { amount: 20, kb: 4, hs: 0.08, shake: 0.2, dirMode: 'fwd', onHit: (e, p) => flourish('ice', p, true) } }],
      events: [[0.5, (a) => {
        const yaw = a.yaw0, from = S.pos().clone();
        const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
        for (let i = 0; i < 8; i++) {
          const d = 1.6 + i * 0.75;
          for (const side of [-1, 1]) {
            const p = V(from.x + dir.x * d + dir.z * side * (0.25 + i * 0.12), 0, from.z + dir.z * d - dir.x * side * (0.25 + i * 0.12));
            ground(p);
            S.fx.iceSpikes.spawn(p, 0.6 + i * 0.12 + Math.random() * 0.3, 0.6 + Math.random() * 0.4, i * 0.025, 1.4);
          }
        }
        vfx('shockwave', ground(front(1.8, yaw, from)), { color: 0x9feeff, radius: 4, duration: 0.4, opacity: 0.8 });
        S.after(0.08, () => S.hitLine(from, dir, 7.2, 3.2, { amount: 22, kb: 6, status: { chilled: 4 }, hs: 0.12, shake: 0.4, heavy: true, dirMode: 'fwd', impact: 1.2 }));
        for (let d = 2; d <= 7; d += 2.5) S.terrain('freeze', front(d, yaw, from), 2.5);
        S.sfx('cast_ice', { position: from });
      }]],
    }),
    lightning: (ctx) => ({
      name: 'c4_lightning', kind: 'combo', tpl: 'overhead', dur: 0.62, cancel: 0.62, lunge: 2.8, lungeT: [0.15, 0.48], trail: [0.3, 0.75],
      hits: [{ t0: 0.38, t1: 0.54, shape: 'sector', half: 0.6, reach: 2.9, spec: { amount: 18, kb: 4, hs: 0.08, shake: 0.2, onHit: (e, p) => flourish('lightning', p) },
        arc: { tilt: Math.PI / 2, h: 0.9, a0: 2.0, a1: -1.3, rin: 1.0 }, a0: 2.0, a1: -1.3 }],
      events: [[0.52, (a) => {
        const tgt = a.target?.alive ? a.target : S.findTarget(7, 0.3);
        const p = tgt ? ground(tgt.object.position.clone()) : front(3.2);
        const top = p.clone(); top.y += 16; top.x += rand(-2, 2);
        vfx('beam', top, p, { color: 0xd0b0ff, width: 0.45, duration: 0.3, jagged: 1.2, segments: 14, branches: 4 });
        vfx('explosion', V(p.x, p.y + 0.5, p.z), { element: 'lightning', scale: 0.9 });
        vfx('screenFlash', 0xe8dcff, 0.22, 0.18);
        S.hitCircle(V(p.x, p.y + 0.5, p.z), 2.9, { amount: 28, kb: 5, launch: 3, status: { shocked: 3 }, hs: 0.12, shake: 0.45, heavy: true, impact: 1.3 });
        S.sfx('explode_lightning', { position: p });
      }]],
    }),
    wind: (ctx) => ({
      name: 'c4_wind', kind: 'combo', tpl: 'upper', dur: 0.64, cancel: 0.62, lunge: 2.4, lungeT: [0.1, 0.4], trail: [0.3, 0.78], setVy: [[0.42, 6.5]], gravityMul: 0.55,
      hits: [{ t0: 0.34, t1: 0.52, shape: 'sector', half: 0.7, reach: 2.8, y1: 3.2, spec: { amount: 18, kb: 2, launch: 11, hs: 0.12, shake: 0.3, heavy: true, onHit: (e, p) => flourish('wind', p, true) },
        arc: { tilt: Math.PI / 2, h: 1.0, a0: -1.3, a1: 2.1, rin: 1.0, life: 0.34 }, a0: -1.3, a1: 2.1 }],
      events: [[0.4, (a) => {
        const p = front(1.4); p.y += 0.3;
        vfx('burst', p, { count: 24, shape: 'soft', color: [0xeafff4, 0x6fffbf], speed: 7, spread: 0.3, dir: S.UP, size: 0.4, sizeEnd: 1.2, life: 0.55, drag: 2.5, alpha: 0.55 });
        vfx('shockwave', ground(p.clone()), { color: 0xa0ffd8, radius: 3.2, duration: 0.35, opacity: 0.7 });
        S.terrain('wind', p, 6, V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0)));
        S.sfx('cast_wind', { position: p });
      }]],
    }),
    earth: (ctx) => ({
      name: 'c4_earth', kind: 'combo', tpl: 'leapSlam', dur: 0.86, cancel: 0.82, lunge: 3.2, lungeT: [0.1, 0.6], trail: [0.56, 0.8], setVy: [[0.1, 6.5], [0.56, -16]], noGlide: true,
      hits: [{ t0: 0.6, t1: 0.68, shape: 'sector', half: 0.5, reach: 2.6, spec: { amount: 14, kb: 2, hs: 0.06, shake: 0.12 }, arc: { tilt: Math.PI / 2, h: 0.9, a0: 2.0, a1: -1.3, rin: 1.0 }, a0: 2, a1: -1.3, swing: true }],
      events: [[0.67, (a) => {
        const p = front(1.6, a.yaw0);
        vfx('explosion', V(p.x, p.y + 0.3, p.z), { element: 'earth', scale: 1.2 });
        vfx('shockwave', p, { color: 0xf0c890, radius: 4.5, duration: 0.45, opacity: 0.9, thickness: 0.35 });
        vfx('debris', V(p.x, p.y + 0.2, p.z), { count: 10, size: 0.3, speed: 7, material: 'rock' });
        for (let i = 0; i < 8; i++) { const an = (i / 8) * TWO_PI; S.fx.rockSpikes.spawn(V(p.x + Math.sin(an) * 2.2, p.y - 0.1, p.z + Math.cos(an) * 2.2), 1.1 + Math.random() * 0.6, 0.8 + Math.random() * 0.4, 0.03, 1.4, 0.45); }
        S.hitCircle(V(p.x, p.y + 0.4, p.z), 3.8, { amount: 30, kb: 8, launch: 6, hs: 0.13, shake: 0.55, heavy: true, impact: 1.4 });
        vfx('fovKick', 5, 0.35);
        S.sfx('explode_earth', { position: p });
      }]],
    }),
  };

  // ------------------------------------------------------------ 반격 flurry (after perfect dodge / parry)
  function flurry(el, tgt) {
    const seg = 0.12, n = 6;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      hits.push({ t0: (0.12 + i * seg + seg * 0.25) / (0.12 + n * seg + 0.3), t1: (0.12 + i * seg + seg * 0.7) / (0.12 + n * seg + 0.3), shape: 'arc', reach: 2.8, follow: true,
        a0: i % 2 ? 1.6 : -1.6, a1: i % 2 ? -1.6 : 1.6, pitch: 1.15,
        spec: { amount: last ? 22 : 11, kb: last ? 9 : 1, hs: last ? 0.15 : 0.055, shake: last ? 0.4 : 0.12, heavy: last, fov: last ? 4 : 1, onHit: (e, p) => flourish(el, p, last) },
        arc: { tilt: (i % 2 ? -0.5 : 0.35) + rand(-0.2, 0.2), h: 1.0 + rand(-0.2, 0.2), life: 0.22 } });
    }
    const dur = 0.12 + n * seg + 0.3;
    return {
      name: 'flurry', kind: 'combo', tpl: 'slashR', dur, cancel: dur * 0.92, lunge: 6, lungeT: [0, 0.1], target: tgt || null, trail: [0.05, 0.92], superArmor: true,
      poseFn: (out, t) => {
        const k = Math.max(0, t - 0.12) / seg, i = Math.floor(k);
        sampleTpl(i % 2 ? TPL.slashL : TPL.slashR, i >= n ? 1 : 0.28 + (k - i) * 0.5, out);
      },
      onUpdate: (dt, a) => { if (Math.random() < 0.35) P().spawnGhost(_ghostCol.setHex(PAL[el].b), 0.25, 0.5); },
      events: [[0.0, () => { S.sfx('perfect_dodge', { volume: 0.6, pitch: 1.3 }); vfx('fovKick', 5, 0.4); }]],
      hits,
    };
  }
  const _ghostCol = new THREE.Color();

  // ------------------------------------------------------------ charged skills
  const HEAVY = {
    fire(f) { // 염화 발도: dash-slash leaving a fire line
      const dist = 7 + 5 * f, dmg = 42 + 48 * f;
      let start = null, dir = null, traveled = 0;
      const set = new Set();
      return {
        name: 'heavy_fire', kind: 'heavy', tpl: 'iaido', dur: 0.72, cancel: 0.62, move: 0, lunge: null, target: null, facing: 'camera', trail: [0.02, 0.5], superArmor: true, noGlide: true,
        onUpdate: (dt, a, A) => {
          if (!start) { start = S.pos().clone(); dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0)); }
          const t = a.t;
          if (t > 0.03 && t < 0.19 && traveled < dist) {
            const sp = dist / 0.16;
            A.vel.copy(dir).multiplyScalar(sp);
            traveled += sp * dt;
            if (Math.random() < 0.6) P().spawnGhost(_ghostCol.setHex(0xff8a40), 0.3, 0.6);
            const p = S.pos();
            vfx('burst', _t.set(p.x, p.y + 0.3, p.z), { count: 3, shape: 'puff', color: [0xffa42a, 0xb81a06], speed: 1.5, spread: 1, size: 0.6, sizeEnd: 1.1, life: 0.5, gravity: -3, drag: 3, alpha: 1 });
            S.hitLine(start, dir, traveled + 1.2, 2.6, { amount: dmg, kb: 8, launch: 3, status: { burning: 5 }, hs: 0.16, shake: 0.5, heavy: true, impact: 1.5, dirMode: 'out' }, set);
          }
        },
        events: [[0.03, () => { S.sfx('sword_swing_heavy', { pitch: 0.8 }); vfx('fovKick', 7, 0.35); }],
          [0.26, (a) => {
            S.arc({ yaw: a.yaw0, a0: -2.0, a1: 1.8, rout: 3.6, rin: 1.2, h: 1.1, sweep: 0.08, life: 0.45, tilt: 0.1 });
            // fire line along the path, erupting a moment later
            const n = Math.ceil(traveled / 1.2);
            for (let i = 0; i <= n; i++) {
              const p = ground(V(start.x + dir.x * i * 1.2, 0, start.z + dir.z * i * 1.2));
              S.after(0.04 * i, () => { vfx('burst', V(p.x, p.y + 0.2, p.z), { count: 6, shape: 'puff', color: [0xffc040, 0xd02008], speed: 3, spread: 0.3, dir: S.UP, size: 0.7, sizeEnd: 1.5, life: 0.7, gravity: -4, drag: 3, alpha: 1 }); S.terrain('ignite', p, 1.2); });
            }
            S.after(0.45, () => {
              for (let i = 0; i <= n; i += 2) vfx('impact', ground(V(start.x + dir.x * i * 1.2, 0, start.z + dir.z * i * 1.2)).setY(S.groundAt(start.x + dir.x * i * 1.2, start.z + dir.z * i * 1.2) + 0.5), { element: 'fire', scale: 1.3 });
              S.hitLine(start, dir, traveled + 0.5, 2.4, { amount: 18 + 14 * f, kb: 2, launch: 5, status: { burning: 4 }, hs: 0.1, shake: 0.35, heavy: true, dirMode: 'out' });
              S.sfx('explode_fire', { position: S.pos() });
            });
          }]],
      };
    },
    ice(f) { // 빙결 일섬: piercing freezing thrust
      const len = 10 + 4 * f;
      return {
        name: 'heavy_ice', kind: 'heavy', tpl: 'chargeThrust', dur: 0.78, cancel: 0.62, lunge: 2.5, lungeT: [0.12, 0.3], target: null, facing: 'camera', trail: [0.2, 0.5], superArmor: true,
        events: [[0.28, (a) => {
          const from = S.pos().clone(), dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0));
          const tip = V(from.x + dir.x * 1.5, from.y + 1.2, from.z + dir.z * 1.5);
          const end = V(from.x + dir.x * len, from.y + 1.1, from.z + dir.z * len);
          vfx('beam', tip, end, { color: 0xbff4ff, width: 0.5, duration: 0.25, jagged: 0, segments: 2 });
          vfx('burst', tip, { count: 30, shape: 'shard', additive: false, color: [0xeaffff, 0x5ec8ff], speed: 16, spread: 0.12, dir, size: 0.2, sizeEnd: 0.05, life: 0.4, drag: 2 });
          vfx('shockwave', tip, { color: 0xbff4ff, radius: 2, duration: 0.25, vertical: true, opacity: 0.9, thickness: 0.15 });
          for (let d = 1.5, i = 0; d < len; d += 0.7, i++) {
            const side = (i % 2 ? 1 : -1) * rand(0.2, 0.6);
            const p = ground(V(from.x + dir.x * d + dir.z * side, 0, from.z + dir.z * d - dir.x * side));
            S.fx.iceSpikes.spawn(p, 1.0 + Math.random() * 0.9 + f * 0.5, 0.7 + Math.random() * 0.5, d / 45, 2.2, 0.45);
          }
          S.hitLine(from, dir, len, 2.2, { amount: 45 + 45 * f, kb: 6, status: { chilled: 5, frozen: 1.2 + f * 1.3 }, hs: 0.16, shake: 0.55, heavy: true, impact: 1.5, dirMode: 'fwd' });
          for (let d = 2; d < len; d += 3) S.terrain('freeze', ground(V(from.x + dir.x * d, 0, from.z + dir.z * d)), 3);
          vfx('fovKick', 6, 0.35); vfx('screenFlash', 0xd8f6ff, 0.16, 0.2);
          S.sfx('cast_ice', { position: from }); S.sfx('shatter', { position: end, volume: 0.6 });
        }]],
      };
    },
    lightning(f) { // 뇌광 섬격: teleport multi-slash between up to 5 enemies
      const origin = S.pos().clone();
      const foes = S.foesNear(origin, 14, []).filter((e) => !e.isProp || true)
        .sort((a, b) => a.object.position.distanceToSquared(origin) - b.object.position.distanceToSquared(origin)).slice(0, 5);
      const n = foes.length;
      const step = 0.13;
      const dur = n ? 0.2 + n * step + 0.35 : 0.7;
      let prev = origin.clone();
      const evs = [];
      if (!n) {
        // nobody around: single lightning dash forward
        return { ...HEAVY.fire(f), name: 'heavy_lightning', onUpdate: undefined, events: [[0.05, (a) => {
          const dir = V(Math.sin(a.yaw0), 0, Math.cos(a.yaw0));
          const to = S.pos().clone().addScaledVector(dir, 8);
          const from = S.pos().clone(); from.y += 1;
          P().teleport(to); to.y = S.pos().y + 1;
          vfx('beam', from, to, { color: 0xd0b0ff, width: 0.25, duration: 0.25, jagged: 0.6, segments: 10 });
          S.arc({ yaw: a.yaw0, a0: -2, a1: 1.8, rout: 3.4, h: 1.1, sweep: 0.06, life: 0.35 });
          S.hitLine(from.setY(S.pos().y), dir, 8.5, 2.4, { amount: 40 + 40 * f, kb: 6, status: { shocked: 3 }, hs: 0.14, shake: 0.4, heavy: true, dirMode: 'fwd' });
        }]] };
      }
      foes.forEach((e, i) => {
        evs.push([(0.2 + i * step) / dur, (a) => {
          if (!e.alive) return;
          const ep = e.object.position;
          _t.subVectors(ep, prev).setY(0);
          if (_t.lengthSq() < 0.01) _t.set(0, 0, 1); _t.normalize();
          const to = V(ep.x + _t.x * ((e.radius || 0.5) + 0.9), 0, ep.z + _t.z * ((e.radius || 0.5) + 0.9));
          const from = S.pos().clone(); from.y += 1;
          P().spawnGhost(_ghostCol.setHex(0xc9a4ff), 0.4, 0.8);
          P().teleport(to);
          const yawBack = Math.atan2(ep.x - to.x, ep.z - to.z);
          P().setFacing(yawBack); a.yaw0 = yawBack;
          to.y = S.pos().y + 1;
          vfx('beam', from, to, { color: 0xd0b0ff, width: 0.22, duration: 0.22, jagged: 0.7, segments: 10, branches: 1 });
          S.arc({ yaw: yawBack, a0: i % 2 ? 1.8 : -1.8, a1: i % 2 ? -1.8 : 1.8, rout: 2.8, h: 1.1, sweep: 0.05, life: 0.3, tilt: rand(-0.5, 0.5) });
          S.sfx('sword_swing', { pitch: 1.2 + i * 0.06 }); S.sfx('blink', { volume: 0.5, pitch: 1.4 });
          S.contact(e, S.pos(), _u, 1.1);
          S.applyHit(e, { amount: 30 + 25 * f, kb: 2, status: { shocked: 3 }, hs: 0.08, shake: 0.25, heavy: i === n - 1, fov: 2.5 }, _u.clone(), _t.clone().negate());
          prev = S.pos().clone();
        }]);
      });
      evs.push([(0.2 + n * step + 0.12) / dur, () => {
        for (const e of foes) if (e.alive) {
          const p = e.object.position, top = V(p.x, p.y + 14, p.z);
          vfx('beam', top, V(p.x, p.y + 0.6, p.z), { color: 0xe8d8ff, width: 0.35, duration: 0.25, jagged: 1, segments: 12, branches: 2 });
          vfx('impact', V(p.x, p.y + 1, p.z), { element: 'lightning', scale: 1.4 });
          S.contact(e, p, _u, 1);
          S.applyHit(e, { amount: 16 + 12 * f, kb: 4, launch: 3, hs: 0.1, shake: 0.35, heavy: true, sound: false, impact: 1.2 }, _u.clone(), V(0, 0, 1));
        }
        vfx('screenFlash', 0xe8dcff, 0.12, 0.2); S.sfx('explode_lightning', { volume: 0.8 });
      }]);
      evs.unshift([0.02, () => { vfx('fovKick', 6, 0.5); S.sfx('cast_lightning'); }]);
      return { name: 'heavy_lightning', kind: 'heavy', tpl: 'chargeSlash', dur, cancel: dur * 0.85, move: 0, target: null, facing: 'camera', trail: [0.1, 0.9], superArmor: true, noGlide: true,
        poseFn: (out, t) => { const k = Math.max(0, t - 0.2) / step, i = Math.floor(k); if (t > 0.2 && i < n) sampleTpl(i % 2 ? TPL.slashL : TPL.slashR, 0.45 + (k - i) * 0.3, out); },
        gravityMul: 0, events: evs };
    },
    wind(f) { // 진공참: giant crescent wind wave
      const set = new Set();
      return {
        name: 'heavy_wind', kind: 'heavy', tpl: 'chargeSlash', dur: 0.7, cancel: 0.55, lunge: 1, lungeT: [0.1, 0.3], target: null, facing: 'camera', trail: [0.18, 0.55], superArmor: true,
        hits: [{ t0: 0.24, t1: 0.42, shape: 'arc', a0: -1.8, a1: 1.6, reach: 2.8, spec: { amount: 20, kb: 6, hs: 0.1, shake: 0.25 }, arc: { tilt: 0.1, h: 1.1 } }],
        events: [[0.32, (a) => {
          const yaw = a.yaw0, dir = V(Math.sin(yaw), 0, Math.cos(yaw));
          const R = 3.4 + 1.6 * f, speed = 26;
          const p0 = S.pos().clone();
          const wave = S.arc({ yaw, a0: -1.25, a1: 1.25, rout: R, rin: R * 0.55, h: 1.1, sweep: 0.05, life: 0.95, vel: dir.clone().multiplyScalar(speed), grow: 0.35, noise: 0.8 });
          const wave2 = S.arc({ yaw, a0: -1.1, a1: 1.1, rout: R * 0.8, rin: R * 0.5, h: 1.1, sweep: 0.05, life: 0.8, vel: dir.clone().multiplyScalar(speed * 0.96), grow: 0.3, colA: 0xbfffe6, opacity: 0.6 });
          void wave; void wave2;
          let d = 0;
          S.every(0.03, 0.9, () => {
            d += speed * 0.03;
            const c = V(p0.x + dir.x * d, p0.y, p0.z + dir.z * d);
            S.hitLine(V(c.x - dir.x * 1.6, c.y, c.z - dir.z * 1.6), dir, 2.4, R * 1.9 * (1 + d * 0.012), { amount: 40 + 40 * f, kb: 12, launch: 3, hs: 0.14, shake: 0.45, heavy: true, impact: 1.3, dirMode: 'fwd' }, set);
            if (Math.random() < 0.5) vfx('burst', V(c.x + rand(-R, R) * dir.z, S.groundAt(c.x, c.z) + 0.3, c.z - rand(-R, R) * dir.x), { count: 2, shape: 'leaf', additive: false, color: [0x8fd06a, 0xd8f0a0], speed: 4, spread: 0.6, dir: S.UP, size: 0.15, life: 0.8, gravity: 3, drag: 1.5 });
            S.terrain('wind', c, 5, dir);
          });
          vfx('fovKick', 5, 0.35); S.sfx('cast_wind', { position: p0 }); S.sfx('sword_swing_heavy', { pitch: 0.7 });
        }]],
      };
    },
    earth(f) { // 대지 가르기: fissure line eruption
      const len = 12 + 4 * f;
      return {
        name: 'heavy_earth', kind: 'heavy', tpl: 'chargeOver', dur: 0.9, cancel: 0.7, lunge: 1.2, lungeT: [0.1, 0.35], target: null, facing: 'camera', trail: [0.25, 0.5], superArmor: true,
        events: [[0.42, (a) => {
          const yaw = a.yaw0, dir = V(Math.sin(yaw), 0, Math.cos(yaw));
          const p0 = front(1.5, yaw);
          vfx('shockwave', p0, { color: 0xf0c890, radius: 3, duration: 0.35, opacity: 0.9, thickness: 0.3 });
          vfx('debris', V(p0.x, p0.y + 0.2, p0.z), { count: 8, size: 0.25, speed: 6, material: 'rock' });
          S.sfx('explode_earth', { position: p0 });
          vfx('shake', 0.35);
          const set = new Set();
          let d = 1.5;
          S.every(0.035, len / 1.0 * 0.035 + 0.05, () => {
            if (d > len) return false;
            const p = ground(V(p0.x + dir.x * (d - 1.5), 0, p0.z + dir.z * (d - 1.5)));
            for (let k = 0; k < 2; k++) {
              const side = (k ? 1 : -1) * rand(0.15, 0.7);
              S.fx.rockSpikes.spawn(V(p.x + dir.z * side, p.y - 0.15, p.z - dir.x * side), 0.9 + Math.random() * 1.1 + f * 0.6, 0.7 + Math.random() * 0.4, 0, 1.6, 0.5);
            }
            vfx('decal', p, { color: 0x3a2a1a, radius: 0.9, duration: 6, opacity: 0.6 });
            if (Math.random() < 0.5) vfx('burst', V(p.x, p.y + 0.3, p.z), { count: 3, shape: 'smoke', additive: false, color: [0xd9c094, 0x9a8460], speed: 2.5, spread: 0.4, dir: S.UP, size: 0.4, sizeEnd: 1.1, life: 0.6, drag: 3 });
            S.hitCircle(V(p.x, p.y + 0.5, p.z), 1.8, { amount: 38 + 35 * f, kb: 3, launch: 8.5, hs: 0.15, shake: 0.4, heavy: true, impact: 1.3, dirMode: 'fwd' }, set);
            d += 1.0;
          });
        }]],
      };
    },
  };

  // ------------------------------------------------------------ ultimates
  const ULT = {
    fire(aw) { // 홍련 난무: flaming whirlwind
      const dur = aw ? 3.2 : 2.4, R = aw ? 5.5 : 4.2;
      let tick = 0, ang = 0;
      return {
        name: 'ult_fire', kind: 'ultimate', tpl: 'spinLoop', dur: dur + 0.3, cancel: dur + 0.25, move: 0.6, facing: 'free', target: null, trail: [0, 0.95], superArmor: true, noGlide: true,
        onUpdate: (dt, a, A) => {
          if (a.t < dur) {
            ang += dt * TWO_PI * 3.2; A.bodyYaw = -ang; A.facing = null;
            tick -= dt;
            const p = S.pos();
            if (tick <= 0) {
              tick = 0.16;
              S.arc({ yaw: P().facing - ang, a0: 0, a1: -TWO_PI * 0.9, rout: R * 0.75, rin: 0.6, h: 0.7 + Math.random() * 0.8, sweep: 0.12, life: 0.3, tilt: rand(-0.25, 0.25) });
              S.hitCircle(V(p.x, p.y + 0.8, p.z), R, { amount: aw ? 15 : 11, kb: 3, status: { burning: 3 }, hs: 0.06, shake: 0.14, impact: 0.8, sound: 'light' });
              S.sfx('sword_swing', { position: p, pitch: 0.9 + Math.random() * 0.3, volume: 0.6 });
              if (Math.random() < 0.12) S.terrain('ignite', ground(_u.set(p.x + rand(-2, 2), 0, p.z + rand(-2, 2))), 2);
              if (aw && Math.random() < 0.5) { const an = Math.random() * TWO_PI; const q = ground(V(p.x + Math.sin(an) * R * 0.8, 0, p.z + Math.cos(an) * R * 0.8)); vfx('explosion', V(q.x, q.y + 0.4, q.z), { element: 'fire', scale: 0.8 }); }
            }
            for (let i = 0; i < 3; i++) {
              const an = Math.random() * TWO_PI, r = Math.random() * R * 0.9;
              vfx('burst', _t.set(p.x + Math.sin(an) * r, p.y + Math.random() * 2.5, p.z + Math.cos(an) * r), { count: 1, shape: 'puff', color: [0xffc040, 0xd02008], speed: 2, spread: 1, dir: S.UP, size: 0.7, sizeEnd: 1.4, life: 0.45, gravity: -4, drag: 2, alpha: 1 });
            }
          }
        },
        events: [[0.0, () => { vfx('fovKick', 6, 0.6); S.sfx('cast_fire'); vfx('screenFlash', 0xff8040, 0.15, 0.3); }],
          [dur / (dur + 0.3), () => {
            const p = S.pos().clone(); p.y += 0.8;
            vfx('explosion', p, { element: 'fire', scale: aw ? 2.6 : 1.9 });
            vfx('screenFlash', 0xffa060, 0.3, 0.4); vfx('fovKick', 8, 0.5);
            S.hitCircle(p, aw ? 8 : 6, { amount: aw ? 85 : 55, kb: 14, launch: 8, status: { burning: 6 }, hs: 0.2, shake: 0.85, heavy: true, impact: 2 });
            S.terrain('ignite', ground(p.clone()), aw ? 7 : 5);
            if (aw) for (let i = 0; i < 6; i++) { const an = i / 6 * TWO_PI; const q = ground(V(p.x + Math.sin(an) * 5, 0, p.z + Math.cos(an) * 5)); S.after(0.08 * i, () => vfx('explosion', V(q.x, q.y + 0.5, q.z), { element: 'fire', scale: 1.2 })); }
            S.sfx('explode_fire', { position: p });
          }]],
      };
    },
    ice(aw) { // 절대영도 검무: sword dance then absolute-zero field
      const seg = 0.17, n = aw ? 8 : 6, danceEnd = 0.1 + n * seg, dur = danceEnd + 0.95;
      const evs = [], hits = [];
      for (let i = 0; i < n; i++) {
        hits.push({ t0: (0.1 + i * seg + seg * 0.2) / dur, t1: (0.1 + i * seg + seg * 0.65) / dur, shape: 'arc', a0: i % 2 ? 1.7 : -1.7, a1: i % 2 ? -1.7 : 1.7, reach: 3.2,
          spec: { amount: aw ? 16 : 12, kb: 1.5, status: { chilled: 3 }, hs: 0.06, shake: 0.14, onHit: (e, p) => flourish('ice', p) },
          arc: { tilt: (i % 2 ? -0.45 : 0.3) + rand(-0.25, 0.25), h: 1.0 + rand(-0.25, 0.3), rout: 3.3, life: 0.35 } });
      }
      evs.push([0, () => { vfx('fovKick', 5, 0.5); S.sfx('cast_ice'); }]);
      evs.push([(danceEnd + 0.25) / dur, () => {
        const p = S.pos().clone();
        const R = aw ? 11 : 8;
        vfx('explosion', V(p.x, p.y + 0.5, p.z), { element: 'ice', scale: aw ? 2.6 : 2 });
        vfx('shockwave', ground(p.clone()), { color: 0xbff4ff, radius: R, duration: 0.6, opacity: 0.9, thickness: 0.4 });
        vfx('screenFlash', 0xe0fbff, 0.4, 0.5); vfx('fovKick', -7, 0.5);
        const rings = aw ? 4 : 3;
        for (let r = 0; r < rings; r++) {
          const cnt = 8 + r * 5, rad = 2 + r * (R - 2) / rings;
          for (let i = 0; i < cnt; i++) {
            const an = (i / cnt) * TWO_PI + r * 0.3;
            S.fx.iceSpikes.spawn(ground(V(p.x + Math.sin(an) * rad, 0, p.z + Math.cos(an) * rad)), 1.4 + Math.random() * 1.4 + (rings - r) * 0.4, 0.8 + Math.random() * 0.6, r * 0.06, 2.6, 0.5);
          }
        }
        S.hitCircle(V(p.x, p.y + 0.6, p.z), R, { amount: aw ? 110 : 70, kb: 4, status: { frozen: aw ? 4 : 3, chilled: 6 }, hs: 0.2, shake: 0.9, heavy: true, impact: 2 });
        S.terrain('freeze', p, R + 2);
        S.sfx('explode_ice', { position: p }); S.sfx('freeze_water', { position: p });
      }]);
      return { name: 'ult_ice', kind: 'ultimate', tpl: 'slashR', dur, cancel: dur - 0.15, move: 0.2, lunge: 2, lungeT: [0, 0.15], trail: [0.05, danceEnd / dur], superArmor: true, events: evs, hits,
        poseFn: (out, t) => {
          if (t < 0.1) return;
          const k = (t - 0.1) / seg, i = Math.floor(k);
          if (i < n) sampleTpl(i % 2 ? TPL.slashL : TPL.slashR, 0.3 + (k - i) * 0.45, out);
          else sampleTpl(TPL.plungeLand, clamp((t - danceEnd) / 0.5, 0, 1) * 0.15, out);
        } };
    },
    lightning(aw) { // 천뢰 낙인: leap + thunder plunge
      const dur = 1.35;
      let tgtP = null;
      return {
        name: 'ult_lightning', kind: 'ultimate', tpl: 'raise', dur, cancel: 1.2, move: 0.3, target: null, superArmor: true, noGlide: true, trail: [0.45, 0.62],
        setVy: [[0.04, 15], [0.3, 0.6], [0.47, -42]], gravityMul: 0.6,
        poseFn: (out, t) => { if (t > 0.45 * dur) sampleTpl(t > 0.6 * dur ? TPL.plungeLand : TPL.plunge, t > 0.6 * dur ? clamp((t - 0.6 * dur) / 0.5, 0, 1) : clamp((t - 0.45 * dur) / 0.1, 0, 1), out); },
        onUpdate: (dt, a, A) => {
          if (a.t > 0.3 * dur && a.t < 0.47 * dur) { A.gravityMul = 0; A.setVy = 0.3; }
          if (a.t >= 0.45 * dur && a.t < 0.6 * dur && tgtP) {
            const p = S.pos();
            _t.subVectors(tgtP, p).setY(0);
            const d = _t.length();
            if (d > 0.3) A.vel.copy(_t).multiplyScalar(Math.min(d / 0.1, 60) / d * 1);
            A.gravityMul = 2;
          }
        },
        events: [
          [0.02, () => { vfx('fovKick', 6, 0.5); S.sfx('jump', { pitch: 0.7 }); vfx('shockwave', ground(S.pos().clone()), { color: 0xc9a4ff, radius: 3, duration: 0.35, opacity: 0.8 }); }],
          [0.3, (a) => {
            const tgt = S.findTarget(16, -0.3, S.pos());
            tgtP = tgt ? ground(tgt.object.position.clone()) : front(7);
            P().setFacing(Math.atan2(tgtP.x - S.pos().x, tgtP.z - S.pos().z)); a.yaw0 = P().facing;
            vfx('decal', tgtP, { color: 0xc9a4ff, radius: aw ? 7 : 5, duration: 0.8, opacity: 0.7 });
            const tip = P().getSwordTip(V());
            vfx('beam', V(tip.x, tip.y + 30, tip.z), tip, { color: 0xe8d8ff, width: 0.35, duration: 0.35, jagged: 1, segments: 14, branches: 2 });
            vfx('flash', tip, { color: 0xc9a4ff, intensity: 6, distance: 12, duration: 0.4 });
            S.sfx('charge', { pitch: 1.5 });
          }],
          [0.6, () => {
            const p = S.pos().clone(), R = aw ? 9 : 6.5;
            vfx('explosion', V(p.x, p.y + 0.4, p.z), { element: 'lightning', scale: aw ? 2.1 : 1.7 });
            vfx('screenFlash', 0xeee4ff, 0.3, 0.3); vfx('fovKick', 9, 0.5);
            const nb = aw ? 14 : 8;
            for (let i = 0; i < nb; i++) {
              const an = (i / nb) * TWO_PI + rand(-0.2, 0.2), r = rand(1.5, R);
              const q = ground(V(p.x + Math.sin(an) * r, 0, p.z + Math.cos(an) * r));
              S.after(rand(0, 0.25), () => vfx('beam', V(q.x + rand(-2, 2), q.y + 20, q.z + rand(-2, 2)), q, { color: 0xd8c4ff, width: 0.3, duration: 0.25, jagged: 1.2, segments: 12, branches: 2 }));
            }
            vfx('shockwave', ground(p.clone()), { color: 0xc9a4ff, radius: R, duration: 0.5, opacity: 0.9, thickness: 0.3 });
            S.hitCircle(V(p.x, p.y + 0.6, p.z), R, { amount: aw ? 120 : 80, kb: 10, launch: 7, status: { shocked: 4 }, hs: 0.2, shake: 0.95, heavy: true, impact: 2 });
            S.sfx('explode_lightning', { position: p });
            if (aw) for (let k = 1; k <= 3; k++) S.after(0.25 * k, () => {
              const foes = S.foesNear(p, 14, []);
              const e = foes[Math.floor(Math.random() * foes.length)];
              const q = e ? e.object.position.clone() : ground(V(p.x + rand(-6, 6), 0, p.z + rand(-6, 6)));
              vfx('beam', V(q.x, q.y + 22, q.z), q, { color: 0xffffff, width: 0.55, duration: 0.3, jagged: 1.3, segments: 14, branches: 3 });
              vfx('explosion', V(q.x, q.y + 0.5, q.z), { element: 'lightning', scale: 1.3 });
              S.hitCircle(V(q.x, q.y + 0.5, q.z), 3.5, { amount: 45, kb: 6, launch: 4, status: { shocked: 3 }, hs: 0.12, shake: 0.5, heavy: true, sound: false });
              S.sfx('explode_lightning', { position: q, volume: 0.7 });
            });
          }]],
      };
    },
    wind(aw) { // 폭풍 검진: orbiting wind blades
      const count = aw ? 10 : 6, life = aw ? 9 : 7, R = aw ? 3.4 : 2.7;
      const last = new Map();
      return {
        name: 'ult_wind', kind: 'ultimate', tpl: 'spin', dur: 0.7, cancel: 0.6, trail: [0.3, 0.85], spin: { t0: 0.34, t1: 0.8, turns: 1 }, target: null,
        hits: [{ t0: 0.34, t1: 0.8, shape: 'arc', a0: -Math.PI / 2, a1: -Math.PI / 2 - TWO_PI, reach: 3, spec: { amount: 18, kb: 8, hs: 0.1, shake: 0.3, heavy: true, onHit: (e, p) => flourish('wind', p, true) }, arc: { a0: -1.2, a1: -1.2 - TWO_PI, h: 1.0, life: 0.45 } }],
        events: [[0.45, () => {
          S.fx.orbit.start(count, life, R);
          S.fx.orbit.mat.color.setHex(aw ? 0xd8fff0 : 0xa8ffd6);
          const p = S.pos();
          vfx('burst', V(p.x, p.y + 1, p.z), { count: 30, shape: 'soft', color: [0xeafff4, 0x6fffbf], speed: 7, spread: 1, size: 0.4, sizeEnd: 1.2, life: 0.5, drag: 3, alpha: 0.5 });
          vfx('shockwave', ground(p.clone()), { color: 0xa0ffd8, radius: 4, duration: 0.4, opacity: 0.8 });
          vfx('fovKick', 5, 0.4); S.sfx('cast_wind', { position: p });
          S.every(0.06, life, () => {
            const orb = S.fx.orbit; if (orb.t <= 0) return false;
            const now = game.time;
            for (let i = 0; i < orb.active; i++) {
              const bp = orb.pos[i];
              for (const e of S.foesNear(bp, 0.9, _near)) {
                if ((last.get(e) || -9) > now - 0.35) continue;
                last.set(e, now);
                S.contact(e, bp, _u, 0);
                S.applyHit(e, { amount: aw ? 13 : 9, kb: 7, launch: aw ? 2 : 0, hs: 0.05, shake: 0.1, fov: 0.6, sparks: true, impact: 0.7, onHit: (x, q) => flourish('wind', q) }, _u.clone(), S.outDir(e, S.pos(), V()));
              }
            }
            if (Math.random() < 0.2) S.terrain('wind', S.pos(), R + 2, V(Math.sin(now * 3), 0, Math.cos(now * 3)));
          });
        }]],
      };
    },
    earth(aw) { // 대지의 심판: giant stone sword(s) fall from the sky
      return {
        name: 'ult_earth', kind: 'ultimate', tpl: 'raise', dur: 1.25, cancel: 1.0, move: 0, target: null, superArmor: true,
        poseFn: (out, t) => { if (t > 0.62) sampleTpl(TPL.raiseSlam, clamp((t - 0.62) / 0.6, 0, 1), out); },
        events: [[0.08, () => {
          const tgt = S.findTarget(16, -0.2);
          const c = tgt ? ground(tgt.object.position.clone()) : front(7);
          P().setFacing(Math.atan2(c.x - S.pos().x, c.z - S.pos().z));
          const pts = [c];
          if (aw) for (let i = 0; i < 2; i++) { const an = P().facing + (i ? 1 : -1) * 1.1; pts.push(ground(V(c.x + Math.sin(an) * 5, 0, c.z + Math.cos(an) * 5))); }
          const tip = P().getSwordTip(V());
          vfx('beam', tip, V(tip.x, tip.y + 25, tip.z), { color: 0xffc070, width: 0.4, duration: 0.6, jagged: 0, segments: 2 });
          vfx('flash', tip, { color: 0xffb060, intensity: 5, distance: 10, duration: 0.6 });
          S.sfx('golem_step', { pitch: 0.6 });
          pts.forEach((q, i) => {
            vfx('decal', q, { color: 0xffb060, radius: 5.5, duration: 1.2, opacity: 0.6 });
            S.after(0.35 + i * 0.22, () => S.fx.stones.spawn(q, aw ? 1.25 : 1.1, 0.42, (land) => {
              const g = ground(land.clone());
              vfx('explosion', V(g.x, g.y + 0.5, g.z), { element: 'earth', scale: 2.2 });
              vfx('shockwave', g, { color: 0xf0c890, radius: 8, duration: 0.6, opacity: 0.95, thickness: 0.45 });
              vfx('debris', V(g.x, g.y + 0.4, g.z), { count: 16, size: 0.45, speed: 10, material: 'rock' });
              for (let k = 0; k < 12; k++) { const an = (k / 12) * TWO_PI; S.fx.rockSpikes.spawn(V(g.x + Math.sin(an) * 3.2, g.y - 0.2, g.z + Math.cos(an) * 3.2), 1.6 + Math.random(), 1 + Math.random() * 0.5, 0.05, 2.2, 0.6); }
              vfx('fovKick', 7, 0.5); vfx('screenFlash', 0xffe0b0, 0.25, 0.3);
              S.hitCircle(V(g.x, g.y + 0.6, g.z), 5.5, { amount: aw ? 110 : 90, kb: 12, launch: 9, hs: 0.2, shake: 0.95, heavy: true, impact: 2 });
              S.sfx('explode_earth', { position: g }); S.sfx('golem_step', { position: g });
            }));
          });
        }]],
      };
    },
  };

  // ------------------------------------------------------------ support buffs
  const SUPPORT = {
    fire: { duration: 12, mods: { atkMul: 1.3 }, shape: 'ember', gravity: -3,
      tick(S2, dt, b) { b.tick -= dt; if (b.tick > 0) return; b.tick = 1; for (const e of S.foesNear(S.pos(), 3.2, _near)) { try { game.combat?.applyStatus?.(e, 'burning', 2); } catch (_) { /* */ } } } },
    ice: { duration: 12, mods: { dmgTakenMul: 0.5 }, shape: 'snow', gravity: 0.5 },
    lightning: { duration: 12, mods: { moveMul: 1.35, atkSpeed: 1.3 }, shape: 'spark', gravity: 0 },
    wind: { duration: 14, mods: { doubleJump: true, extraDash: 1 }, shape: 'soft', gravity: -1 },
    earth: { duration: 12, mods: { dmgTakenMul: 0.6, noKnockback: true }, shape: 'shard', gravity: 3 },
  };
  function supportAction(el) {
    return { name: 'support', kind: 'support', tpl: 'raise', dur: 0.7, cancel: 0.45, move: 0.2, target: null,
      events: [[0.3, () => {
        const p = S.pos(), c = PAL[el];
        vfx('burst', V(p.x, p.y + 1, p.z), { count: 36, color: [c.a, c.b], speed: 5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.6, shape: 'spark', drag: 2.5 });
        vfx('shockwave', ground(p.clone()), { color: c.a, radius: 3.5, duration: 0.5, opacity: 0.8 });
        vfx('flash', V(p.x, p.y + 1.5, p.z), { color: c.a, intensity: 4, distance: 8, duration: 0.5 });
        vfx('screenFlash', c.a, 0.15, 0.4);
        S.sfx('cast_' + el, { position: p }); S.sfx('blessing', { volume: 0.5 });
      }]] };
  }

  // ------------------------------------------------------------ finishers (cinematic)
  const FINISHER = {
    fire: {
      buildup(S2, t, c) { auraBuild('fire', t); },
      impact(S2, c) {
        const from = S.pos().clone(); from.y += 2;
        S.fx.dragon.start(from, V(c.x, c.y + 1, c.z), 0.6, 1.4);
        S.every(0.03, 0.6, () => { const h = S.fx.dragon.head; vfx('burst', h, { count: 3, shape: 'puff', color: [0xffc040, 0xd02008], speed: 2, spread: 1, size: 1.2, sizeEnd: 2.4, life: 0.6, gravity: -2, drag: 2, alpha: 1 }); });
        S.after(0.6, () => {
          vfx('explosion', V(c.x, c.y + 1, c.z), { element: 'fire', scale: 3.6 });
          for (let i = 0; i < 8; i++) { const an = i / 8 * TWO_PI; S.after(0.05 * i, () => vfx('explosion', ground(V(c.x + Math.sin(an) * 7, 0, c.z + Math.cos(an) * 7)).setY(S.groundAt(c.x + Math.sin(an) * 7, c.z + Math.cos(an) * 7) + 0.5), { element: 'fire', scale: 1.6 })); }
          bigHit(c, 13, 460, { burning: 6 }, 10);
          S.terrain('ignite', c, 9);
          S.sfx('explode_fire', { position: c });
        });
      },
    },
    ice: {
      buildup(S2, t) { auraBuild('ice', t); },
      impact(S2, c) {
        vfx('explosion', V(c.x, c.y + 1, c.z), { element: 'ice', scale: 3.4 });
        S.fx.iceSpikes.spawn(c.clone(), 7, 3, 0, 4.5, 0.05);
        for (let p = 0; p < 6; p++) for (let i = 1; i <= 6; i++) {
          const an = p / 6 * TWO_PI + i * 0.06, r = i * 1.6;
          S.fx.iceSpikes.spawn(ground(V(c.x + Math.sin(an) * r, 0, c.z + Math.cos(an) * r)), 4.5 - i * 0.45 + Math.random(), 2 - i * 0.18, i * 0.05, 4.2, 0.55);
        }
        vfx('shockwave', c, { color: 0xbff4ff, radius: 13, duration: 0.8, opacity: 0.95, thickness: 0.5 });
        bigHit(c, 13, 460, { frozen: 5, chilled: 8 }, 4);
        S.terrain('freeze', c, 14);
        S.sfx('explode_ice', { position: c }); S.sfx('shatter', { position: c });
      },
    },
    lightning: {
      buildup(S2, t) { auraBuild('lightning', t); },
      impact(S2, c) {
        const yaw = P().facing;
        S.arc({ pos: V(c.x, c.y, c.z), yaw, tilt: Math.PI / 2, a0: 2.4, a1: -1.4, rout: 14, rin: 9, h: 0, sweep: 0.08, life: 0.7, colA: 0xb48cff, colB: 0xffffff, noise: 0.9 });
        for (let i = 0; i < 14; i++) { const an = Math.random() * TWO_PI, r = Math.random() * 11; const q = ground(V(c.x + Math.sin(an) * r, 0, c.z + Math.cos(an) * r)); S.after(Math.random() * 0.4, () => vfx('beam', V(q.x, q.y + 26, q.z), q, { color: 0xe8d8ff, width: 0.4, duration: 0.3, jagged: 1.3, segments: 14, branches: 3 })); }
        vfx('explosion', V(c.x, c.y + 1, c.z), { element: 'lightning', scale: 2.4 });
        vfx('screenFlash', 0xf0e8ff, 0.32, 0.45);
        bigHit(c, 13, 460, { shocked: 5 }, 8);
        S.sfx('explode_lightning', { position: c });
      },
    },
    wind: {
      buildup(S2, t) { auraBuild('wind', t); },
      impact(S2, c) {
        let t = 0;
        S.every(0.06, 2.4, () => {
          t += 0.06;
          for (let k = 0; k < 2; k++) {
            const h = Math.random() * 14;
            S.arc({ pos: V(c.x, c.y + h, c.z), yaw: t * 9 + k * 3, a0: 0, a1: 4.2, rout: 2.5 + h * 0.45, rin: 1.6 + h * 0.3, h: 0, sweep: 0.08, life: 0.35, tilt: rand(-0.15, 0.15), noise: 0.8 });
          }
          vfx('burst', V(c.x + rand(-3, 3), c.y + rand(0, 4), c.z + rand(-3, 3)), { count: 2, shape: 'soft', color: [0xeafff4, 0x6fffbf], speed: 6, spread: 0.4, dir: S.UP, size: 0.8, sizeEnd: 2, life: 0.8, drag: 1.5, alpha: 0.45 });
          S.terrain('wind', c, 12, V(Math.sin(t * 5), 0, Math.cos(t * 5)));
        });
        bigHit(c, 12, 300, null, 14);
        S.after(2.2, () => { vfx('explosion', V(c.x, c.y + 2, c.z), { element: 'wind', scale: 3 }); bigHit(c, 12, 160, null, 6, 0.16); });
        S.sfx('explode_wind', { position: c });
      },
    },
    earth: {
      buildup(S2, t) { auraBuild('earth', t); },
      impact(S2, c) {
        S.fx.stones.spawn(c, 2.3, 0.35, (land) => {
          const g = ground(land.clone());
          vfx('explosion', V(g.x, g.y + 1, g.z), { element: 'earth', scale: 3.6 });
          vfx('debris', V(g.x, g.y + 0.5, g.z), { count: 24, size: 0.6, speed: 13, material: 'rock' });
          for (let r = 0; r < 3; r++) for (let k = 0; k < 10 + r * 4; k++) { const an = (k / (10 + r * 4)) * TWO_PI; const rad = 4 + r * 3; S.fx.rockSpikes.spawn(V(g.x + Math.sin(an) * rad, S.groundAt(g.x + Math.sin(an) * rad, g.z + Math.cos(an) * rad) - 0.2, g.z + Math.cos(an) * rad), 2.6 - r * 0.5 + Math.random(), 1.4, r * 0.08, 3, 0.6); }
          vfx('shockwave', g, { color: 0xf0c890, radius: 14, duration: 0.8, opacity: 0.95, thickness: 0.6 });
          bigHit(g, 13, 460, null, 12);
          S.sfx('explode_earth', { position: g });
        });
      },
    },
  };
  function bigHit(c, r, amount, status, launch, hs = 0.25) {
    vfx('fovKick', 10, 0.7); vfx('shake', 1);
    S.hitCircle(V(c.x, c.y + 0.8, c.z), r, { amount, kb: 16, launch, status: status || undefined, hs, shake: 1, heavy: true, impact: 2.4, tags: ['finisher'] }, null, 8);
  }
  function auraBuild(el, t) {
    const p = S.pos(), c = PAL[el];
    for (let i = 0; i < 2; i++) {
      const an = Math.random() * TWO_PI, r = 1.2 + Math.random() * 1.5;
      vfx('burst', V(p.x + Math.sin(an) * r, p.y + Math.random() * 0.4, p.z + Math.cos(an) * r), { count: 1, color: [c.a, c.b], speed: 3 + t * 2, spread: 0.2, dir: S.UP, size: 0.12, sizeEnd: 0, life: 0.6, shape: 'spark', drag: 0.5 });
    }
    const tip = P().getSwordTip(_t);
    if (Math.random() < 0.5) vfx('burst', tip, { count: 1, color: c.a, speed: 0.3, spread: 1, size: 0.8 + t * 0.4, sizeEnd: 0, life: 0.25, shape: 'soft' });
  }
  const _near = [];

  return {
    combo: comboSpec,
    flurry,
    heavy: (el, f) => HEAVY[el]?.(clamp(f, 0, 1)),
    ultimate: (el, ctx) => {
      const s = ULT[el]?.(!!ctx.awakened);
      if (s && ctx.awakened) { s.name += '_awakened'; }
      return s;
    },
    support: (el) => SUPPORT[el],
    supportAction,
    finisher: (el) => ({ name: NAMES[el].finisher[0], ...FINISHER[el] }),
    info(el, ctx) {
      const n = NAMES[el];
      const aw = !!ctx?.awakened;
      out.basic.name = n.basic[0]; out.basic.desc = n.basic[1];
      out.heavy.name = n.heavy[0]; out.heavy.desc = n.heavy[1] + ' (우클릭 길게 눌러 충전)';
      out.ultimate.name = aw ? n.ultimate[0] + ' · 각성' : n.ultimate[0]; out.ultimate.desc = aw ? n.ultimate[1] + ' — 각성으로 위력이 크게 증가' : n.ultimate[1];
      out.finisher.name = n.finisher[0]; out.finisher.desc = n.finisher[1] + ' (각성 게이지 가득)';
      out.support.name = n.support[0]; out.support.desc = n.support[1];
      return out;
    },
    NAMES,
  };
}
const out = { basic: {}, heavy: {}, ultimate: {}, finisher: {}, support: {} };
