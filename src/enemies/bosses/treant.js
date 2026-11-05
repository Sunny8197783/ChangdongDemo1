// 모르그로스, 썩은 수호수 (id treant, Elderwood hollow; DESIGN §8.5, CONTRACT §15). A 20 m walking treant, 9000 HP.
// - Phase 1 「썩은 껍질」: bark armour (the body takes ×0.4) in 4 plates. Fire burns a plate (fire ×1.6, anything else ×0.25);
//   non-fire builds hit the explosive spore pods it drops (anything ignites them: a fire burst that scorches plates within 6 m).
// - Phase 2 「무릎 꿇은 수호수」 (all plates burned): it kneels, exposing the glowing heart (weak point ×2.5) for 8 s windows.
// - Phase 3 「뿌리 폭풍」 at 25 %: a root storm — root lines erupt in fans, seed pods everywhere (reaction playground).
// - Telegraphed attacks: stomp (circle), arm sweep (cone), root lines (line ×3).
import { THREE, S, C, K, B, CAP, T, OCT, ICO, P, mergeParts, vcFlatMat, vcBasicMat, pivot, buildSkin, glowify, once, glowSpriteMat } from './kit.js';
import { humanoid } from '../models.js';
import { skinOutlineMat } from '../common.js';
import { createBoss, finishBoss, bossAttack, bossHit, bossPunish, rhythm, cancelled, stopAttacks, bossTime } from '../bossbase.js';
import { attackSpec } from './codex.js';
import { proxyParts, strips, updateStrips, contract } from './rig.js';
import { newPose, dampPose, applyHumanoid, walkCycle } from '../base.js';
import { clamp, damp, rand } from '../../core/utils.js';

export const TREANT_DATA = {
  id: 'treant', name: '모르그로스', title: '썩은 수호수', sub: '엘더우드의 심장을 삼킨 고목',
  hp: 9000, plateHp: 650, podMax: 6,
  plates: [
    { id: 'bark_chest', name: '가슴 껍질' }, { id: 'bark_back', name: '등 껍질' },
    { id: 'bark_armR', name: '오른팔 껍질' }, { id: 'bark_armL', name: '왼팔 껍질' },
  ],
  phases: [{ name: '썩은 껍질' }, { at: 0.55, name: '무릎 꿇은 수호수' }, { at: 0.25, name: '뿌리 폭풍' }],
  stomp: 26, sweep: 24, roots: 20, pod: 22,
};
const HIP = 6.6;
const TC = { bark: 0x6a5440, barkDark: 0x46362a, barkLight: 0x8a7258, moss: 0x6a8a44, rot: 0x7a4a9a, rotDark: 0x4a2c6a, leaf: 0x6a8a3a, dead: 0x5a4a38, plate: 0x9a7a58, crack: 0x2a1e16, cap: 0xb86a3a, capSpot: 0xe8d8b0, stem: 0xd8c8a0, hollow: 0x1e1610 };

function geos() {
  return once('treant', () => {
    const knots = (n, sx, sy, sz, cy, col) => Array.from({ length: n }, (_, i) => P(S(0.5 + (i % 3) * 0.2, 7, 5), col, [Math.sin(i * 2.4) * sx, cy + Math.cos(i * 1.9) * sy, Math.cos(i * 2.4) * sz], [0, 0, 0], [1, 0.7, 1]));
    const branch = (x, y, z, rx, rz, l, r) => P(C(r * 0.4, r, l, 6), TC.dead, [x, y, z], [rx, 0, rz]);
    return {
      torso: mergeParts([
        P(C(2.2, 2.8, 6.2, 10), TC.bark, [0, 3.1, 0]),
        P(S(2.6, 10, 8), TC.barkDark, [0, 5.8, 0], [0, 0, 0], [1.25, 0.7, 1.05]),
        ...knots(8, 2.3, 2.2, 2.4, 3, TC.barkLight),
        // rot fungus clusters
        ...Array.from({ length: 6 }, (_, i) => P(S(0.45, 8, 5), i % 2 ? TC.rot : TC.rotDark, [Math.sin(i * 1.3 + 1) * 2.6, 1.6 + i * 0.7, Math.cos(i * 1.3 + 1) * 2.5], [0, 0, 0], [1.3, 0.5, 1.3])),
        // moss beard
        P(K(1.6, 2.6, 8), TC.moss, [0, 4.6, 2.1], [Math.PI + 0.3, 0, 0], [1, 1, 0.4]),
      ]),
      pelvis: mergeParts([
        P(S(2.6, 10, 8), TC.barkDark, [0, 0, 0], [0, 0, 0], [1.1, 0.7, 1]),
        ...Array.from({ length: 6 }, (_, i) => P(K(0.6, 2.4, 5), TC.bark, [Math.sin(i * 1.05) * 2.4, -1.2, Math.cos(i * 1.05) * 2.2], [Math.cos(i * 1.05) * 0.5, 0, -Math.sin(i * 1.05) * 0.5])),
      ]),
      head: mergeParts([
        P(S(1.7, 10, 8), TC.bark, [0, 1.4, 0.2], [0, 0, 0], [1.05, 1.2, 0.95]),
        P(B(2.2, 0.35, 0.6), TC.barkDark, [0, 1.6, 1.5], [0.2, 0, 0]),          // brow
        P(K(0.6, 1.4, 5), TC.barkLight, [0, 0.8, 1.6], [Math.PI / 2 + 0.5, 0, 0]),  // nose-root
        // dead crown
        branch(0.8, 3.4, -0.2, -0.3, -0.5, 3.2, 0.35), branch(-0.9, 3.5, 0, -0.2, 0.6, 3.6, 0.38), branch(0, 3.8, -0.8, -0.7, 0, 3.0, 0.3),
        branch(1.6, 3.0, 0.4, 0.2, -1.1, 2.4, 0.25), branch(-1.6, 2.9, 0.3, 0.1, 1.0, 2.6, 0.25),
        ...Array.from({ length: 5 }, (_, i) => P(S(0.6, 7, 5), i % 2 ? TC.leaf : TC.rot, [Math.sin(i * 1.3) * 1.8, 4.6 + (i % 2) * 0.6, Math.cos(i * 1.3) * 1.2], [0, 0, 0], [1.4, 0.7, 1.2])),
      ]),
      upperArm: mergeParts([P(C(0.9, 1.15, 4.2, 8), TC.bark, [0, -2.0, 0]), ...knots(3, 0.9, 1.2, 0.9, -2, TC.barkLight)]),
      foreArm: mergeParts([
        P(C(0.7, 0.95, 4.0, 8), TC.barkDark, [0, -2.0, 0]),
        // branch fingers
        ...[-0.6, -0.2, 0.2, 0.6].map((x, i) => P(K(0.28, 2.0 + (i % 2) * 0.5, 5), TC.dead, [x, -4.6, 0.3], [0.35, 0, x * 0.6])),
        P(S(0.4, 7, 5), TC.rot, [0.5, -1.4, 0.7], [0, 0, 0], [1.2, 0.6, 1]),
      ]),
      thigh: mergeParts([P(C(1.15, 1.4, 3.4, 8), TC.bark, [0, -1.6, 0])]),
      shin: mergeParts([
        P(C(1.0, 1.3, 3.2, 8), TC.barkDark, [0, -1.5, 0]),
        // root feet
        ...Array.from({ length: 5 }, (_, i) => P(K(0.5, 2.6, 5), TC.bark, [Math.sin(i * 1.26 - 2.5) * 1.1, -3.1, Math.cos(i * 1.26 - 2.5) * 1.1 + 0.6], [Math.PI / 2 - 0.3, 0, -Math.sin(i * 1.26 - 2.5) * 0.6])),
      ]),
      plateChest: mergeParts([P(S(2.3, 10, 8, 0, Math.PI), TC.plate, [0, 3.4, 1.4], [0, 0, 0], [1.1, 1.3, 0.55]), P(B(0.25, 3.6, 0.3), TC.barkDark, [0, 3.4, 2.65]),
        ...[[-1.0, 4.2, 0.5], [0.9, 2.6, -0.6], [-0.6, 2.2, 0.9], [1.1, 4.4, 0.3]].map(([x, y, rz]) => P(B(0.1, 1.2, 0.12), TC.crack, [x, y, 2.55], [0, 0, rz])),
        P(B(2.6, 0.18, 0.4), TC.barkLight, [0, 4.9, 2.35], [0.3, 0, 0]), P(B(2.4, 0.18, 0.4), TC.barkLight, [0, 1.9, 2.3], [-0.3, 0, 0])]),
      plateBack: mergeParts([P(S(2.3, 10, 8), TC.plate, [0, 3.6, -1.5], [0, 0, 0], [1.1, 1.3, 0.5]), P(B(3.2, 0.25, 0.3), TC.barkDark, [0, 3.8, -2.6]),
        ...[[-0.8, 4.4, 0.4], [0.7, 3.0, -0.5], [0, 2.4, 0.2]].map(([x, y, rz]) => P(B(0.1, 1.1, 0.12), TC.crack, [x, y, -2.65], [0, 0, rz]))]),
      plateArm: mergeParts([P(S(1.3, 9, 7), TC.plate, [0, -1.6, 0.3], [0, 0, 0], [1.05, 1.5, 0.9]), P(B(0.22, 2.4, 0.2), TC.barkDark, [0, -1.6, 1.42]),
        P(B(0.08, 0.9, 0.1), TC.crack, [0.5, -1.0, 1.4], [0, 0, 0.5]), P(B(0.08, 0.8, 0.1), TC.crack, [-0.45, -2.2, 1.35], [0, 0, -0.4])]),
      // ember glow of a burning plate (own bone, scale 0 unless burning)
      emberChest: glowify(mergeParts([0, 1, 2, 3].map((i) => P(B(0.14, 1.3, 0.1), 0xff8a3a, [-1.0 + i * 0.65, 3.4 + (i % 2) * 0.6, 2.6], [0, 0, (i % 2 ? 0.4 : -0.4)]))), 1.1),
      emberBack: glowify(mergeParts([0, 1, 2].map((i) => P(B(0.14, 1.2, 0.1), 0xff8a3a, [-0.8 + i * 0.8, 3.5, -2.7], [0, 0, (i % 2 ? 0.4 : -0.4)]))), 1.1),
      emberArm: glowify(mergeParts([P(B(0.12, 1.0, 0.1), 0xff8a3a, [0.4, -1.2, 1.45], [0, 0, 0.5]), P(B(0.12, 0.9, 0.1), 0xff8a3a, [-0.4, -2.1, 1.4], [0, 0, -0.4])]), 1.1),
      // rib-roots caging the rot heart, root fingers, mushroom clusters, face (eye hollows + mouth knot), vines
      ribs: mergeParts([...[-1, 1].flatMap((sx) => [0, 1, 2].map((i) => P(new THREE.TorusGeometry(1.45, 0.16, 5, 10, 2.2), i % 2 ? TC.bark : TC.barkDark, [0, 2.6 + i * 0.95, 1.8], [0, sx > 0 ? 0 : Math.PI, Math.PI / 2 + sx * 0.25], [1, 1, 0.9])))]),
      mush: mergeParts([...[[0.6, 0, 0.2, 1], [0, 0.35, -0.4, 0.7], [-0.6, -0.1, 0.3, 0.55]].flatMap(([x, y, z, s]) => [
        P(C(0.14 * s, 0.2 * s, 0.7 * s, 6), TC.stem, [x, y + 0.35 * s, z]), P(new THREE.SphereGeometry(0.55 * s, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), TC.cap, [x, y + 0.7 * s, z], [0, 0, 0], [1, 0.7, 1]),
        P(S(0.08 * s, 5, 4), TC.capSpot, [x + 0.25 * s, y + 0.95 * s, z]), P(S(0.07 * s, 5, 4), TC.capSpot, [x - 0.2 * s, y + 0.9 * s, z + 0.2 * s])])]),
      face: mergeParts([P(S(0.42, 9, 7), TC.hollow, [0.62, 1.4, 1.42], [0, 0, 0], [1.3, 0.75, 0.5]), P(S(0.42, 9, 7), TC.hollow, [-0.62, 1.4, 1.42], [0, 0, 0], [1.3, 0.75, 0.5]),
        P(S(0.38, 9, 7), TC.barkDark, [0, 0.35, 1.5], [0, 0, 0], [1.4, 0.6, 0.6]), P(S(0.22, 8, 6), TC.hollow, [0, 0.35, 1.68], [0, 0, 0], [1.6, 0.45, 0.4]),
        P(S(0.25, 7, 5), TC.barkLight, [0.35, 0.2, 1.7]), P(S(0.2, 7, 5), TC.barkLight, [-0.4, 0.45, 1.68])]),
      fingers: mergeParts([-0.6, -0.2, 0.2, 0.6].flatMap((x, i) => [P(K(0.14, 1.2, 5), TC.dead, [x * 1.3, -5.7, 0.6 + (i % 2) * 0.2], [0.6, 0, x * 0.8])])),
      vine: mergeParts([P(C(0.07, 0.1, 1.6, 5), TC.moss, [0, -0.8, 0]), P(S(0.18, 6, 4), TC.leaf, [0.1, -1.3, 0.05], [0, 0, 0], [1, 0.5, 1.4])]),
      glowHead: glowify(mergeParts([P(S(0.28, 8, 6), 0xd9a0ff, [0.62, 1.4, 1.55], [0, 0, 0], [1.4, 0.7, 0.5]), P(S(0.28, 8, 6), 0xd9a0ff, [-0.62, 1.4, 1.55], [0, 0, 0], [1.4, 0.7, 0.5])]), 1.15),
      heart: glowify(mergeParts([P(OCT(1.0), 0x9be86a, [0, 0, 0], [0, 0, 0], [1, 1.35, 0.8]), P(T(1.25, 0.1, 14), 0xb36bff, [0, 0, 0])]), 1.15),
      pod: (() => { const g = new THREE.IcosahedronGeometry(0.55, 1); return g; })(),
    };
  });
}

export function buildTreant() {
  const g = geos();
  const m = humanoid(g, { hipY: HIP, neckY: 6.6, shoulderX: 3.0, shoulderY: 5.4, upperLen: 4.2, foreLen: 4.0, hipX: 1.5, thighLen: 3.4 });
  const plateChest = pivot(m.spine), plateBack = pivot(m.spine), plateArmR = pivot(m.armR), plateArmL = pivot(m.armL);
  const heartB = pivot(m.spine, 0, 3.6, 1.9);
  m.bones.push(plateChest, plateBack, plateArmR, plateArmL, heartB);
  const n = m.bones.length;
  m.parts.push([n - 5, g.plateChest], [n - 4, g.plateBack], [n - 3, g.plateArm], [n - 2, g.plateArm]);
  // ember glow per plate (own bones: scale 0 until that plate burns)
  const embers = [pivot(m.spine), pivot(m.spine), pivot(m.armR), pivot(m.armL)];
  for (const b of embers) b.scale.setScalar(0.001);
  m.bones.push(...embers);
  const ne = m.bones.length;
  const glowParts = [[2, g.glowHead], [n - 1, g.heart], [ne - 4, g.emberChest], [ne - 3, g.emberBack], [ne - 2, g.emberArm], [ne - 1, g.emberArm]];
  m.parts.push([1, g.ribs], [2, g.face], [5, g.fingers], [6, g.fingers]);
  const mushR = pivot(m.spine, -2.4, 6.3, 0.2), mushL = pivot(m.spine, 2.2, 6.4, -0.1); mushL.rotation.y = 2;
  m.bones.push(mushR, mushL); m.parts.push([m.bones.length - 2, g.mush], [m.bones.length - 1, g.mush]);
  // hanging vines + moss on springs: 3 from each forearm, 4 from the crown
  const vines = [
    ...strips(m.foreR, 3, { x0: -0.6, dx: 0.6, y: -1.0, z: 0.9, len: 1.6, rx: 0, bones: m.bones, parts: m.parts, geo: g.vine, k: 40, d: 4 }),
    ...strips(m.foreL, 3, { x0: -0.6, dx: 0.6, y: -1.0, z: 0.9, len: 1.6, rx: 0, bones: m.bones, parts: m.parts, geo: g.vine, k: 40, d: 4 }),
    ...strips(m.neck, 4, { x0: -1.5, dx: 1.0, y: 2.6, z: 1.3, len: 1.6, rx: 0, bones: m.bones, parts: m.parts, geo: g.vine, k: 35, d: 4 }),
  ];
  const pparts = proxyParts(m, { pelvis: [2.8, 1.8, 2.6], torso: [2.7, 3.6, 2.5], torsoY: 3.4, head: [1.8, 2.0, 1.6], headY: 1.6, arm: [1.1, 0.9], leg: [1.35, 1.2], upperLen: 4.2, foreLen: 4.4, thighLen: 3.4, shinLen: 3.6 });
  const sk = buildSkin('treant4', m.root, m.bones, [
    { name: 'body', mat: vcFlatMat(), parts: m.parts, shadow: false },
    { name: 'glow', mat: vcBasicMat(), parts: glowParts, shadow: false },
    { name: 'proxy', mat: skinOutlineMat(0.08), parts: pparts },
  ], [10, 13]);
  m.embers = embers; m.vines = vines;
  const halo = new THREE.Sprite(glowSpriteMat(0x9be86a, 0)); halo.scale.setScalar(6); heartB.add(halo);
  // spore pods: one instanced mesh (pool 6), tinted at construction
  const pods = new THREE.InstancedMesh(g.pod, new THREE.MeshBasicMaterial({ color: 0xf2e6d0 }), TREANT_DATA.podMax);
  const c = new THREE.Color(0xffa84a);
  for (let i = 0; i < TREANT_DATA.podMax; i++) pods.setColorAt(i, c);
  pods.instanceColor.needsUpdate = true; pods.count = 0; pods.frustumCulled = false;
  m.root.add(pods);
  Object.assign(m, { plates: [plateChest, plateBack, plateArmR, plateArmL], heart: heartB, halo, pods, skin: sk, headTop: 20 });
  let time = 0;
  contract(m, { core: heartB, springs: vines.length, features: { barkPlates: true, crackLines: true, emberPlates: true, vines: true, ribRoots: true, rootFingers: true, mushrooms: true, eyeHollows: true, mouthKnot: true },
    update(dt) { time += dt; updateStrips(vines, dt, time, 0, (m.armR.rotation.x + m.armL.rotation.x) * 0.25); } });
  return m;
}

let spare = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const BASE = newPose(HIP);

export function createTreant(ctx, arena, opts = {}) {
  const game = ctx.game, vfx = game.vfx;
  const D = TREANT_DATA;
  const A = arena || { position: new THREE.Vector3(92, 0, -80), radius: 22 };
  const model = spare || buildTreant(); spare = null;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let kneel = 0, kneelT = 0, heartOpen = false, attackCd = 3, podCd = 6, stormCd = 3, phaseW = 0, speed = 0, atk = null, atkT = 0, tele = null, teleB = null;
  const atkDir = new THREE.Vector3(), atkPos = new THREE.Vector3();
  const e = createBoss(ctx, {
    id: 'treant', name: D.name, title: D.title, sub: D.sub, model, arena: A, zoneId: 'elderwood',
    position: A.position.clone(), baseHp: D.hp, radius: 3.2, height: 14, mass: 60, breakMax: 150, music: 'boss',
    resist: { fire: 1.4, nature: 0.5, water: 0.7 }, weakness: ['fire'], phases: D.phases, transition: 2.6, dissolveColor: 0x9be86a,
    facing: Math.atan2(ctx.realPlayerPos.x - A.position.x, ctx.realPlayerPos.z - A.position.z),
    gate: (i) => i !== 1 || plates.every((pl) => !pl.part.alive),
    onPhase: (i) => {
      atk = null; tele?.stop?.();
      if (i === 1) { kneelT = 8; heartOpen = true; vfx.shake?.(0.8); ctx.audio('boss_roar', { position: e.object.position, volume: 1, pitch: 0.5 }); }
      if (i === 2) { stormCd = 1; ctx.audio('boss_roar', { position: e.object.position, volume: 1, pitch: 0.6 }); }
    },
    onPartBreak: (part) => {
      const pl = plates.find((q) => q.part === part);
      if (pl) burnPlate(pl);
    },
    onRespawnPhase: () => { if (e.phase === 0) { e.reviveParts((p) => p !== heart); for (const pl of plates) pl.bone.scale.setScalar(1); } },
    deathPose: (dt, t) => { kneel = Math.min(1, kneel + dt); model.root.rotation.x = Math.min(0.35, t * 0.12); },
    dissolveAt: 1.6, dissolveDur: 2.4,
  });
  e.noLod = true;
  e.object.position.y = ctx.groundH(A.position.x, A.position.z);
  e.setBodyMul(() => (plates.some((pl) => pl.part.alive) ? 0.4 : e.phase >= 1 && !heartOpen ? 0.6 : 1));

  const plateOff = [new THREE.Vector3(0, 3.4, 2.2), new THREE.Vector3(0, 3.6, -2.2), new THREE.Vector3(0, -1.6, 1.2), new THREE.Vector3(0, -1.6, 1.2)];
  const plateHp = Math.round(D.plateHp * (e.maxHp / D.hp));
  const plates = D.plates.map((pd, i) => {
    const bone = model.plates[i];
    const part = e.addPart({ id: pd.id, name: pd.name, hp: plateHp, bone, offset: plateOff[i], radius: 2.2, height: 3.2, fwd: 0.6,
      mul: (k) => (k === 'fire' ? 1.6 : 0.25) * (i >= 2 && armStuck > 0 ? 2 : 1), resist: {} });
    return { part, bone, burnT: 0 };
  });
  // the heart: invulnerable until it kneels
  const heart = e.addPart({ id: 'heart', name: '수호수의 심장', hp: Math.round(e.maxHp * 0.6), bone: model.heart, radius: 1.6, height: 3.2, mul: 2.5, invulnerable: true, fwd: 1 });
  heart.invulnerable = true;

  function burnPlate(pl) {
    pl.burnT = 0.01;
    pl.bone.getWorldPosition(_v);
    vfx.preset?.('explosion_fire', _v, { owner: 'enemy', scale: 1.44 });
    vfx.debris?.(_v, { owner: 'enemy', count: 16, size: 0.8, speed: 9, material: 'wood' });
    vfx.burst(_v, { owner: 'enemy', count: 20, color: [0xffd04a, 0xff6a1f], speed: 6, spread: 1, size: 0.4, sizeEnd: 0, life: 1.2, shape: 'ember', gravity: -2 });
    ctx.audio('explode_fire', { position: _v, volume: 1, pitch: 0.7 });
    e.shakeAt(_v, 0.5);
  }

  // ---------------- spore pods (anything ignites them → a fire burst that scorches plates within 6 m)
  const pods = [];
  for (let i = 0; i < D.podMax; i++) {
    const obj = new THREE.Object3D(); game.scene.add(obj);
    const pod = { id: 'treantPod' + i, team: 'enemy', isProp: true, alive: false, object: obj, hp: 1, maxHp: 1, radius: 0.7, height: 1.2, mass: 1e6,
      statuses: {}, velocity: new THREE.Vector3(), xpValue: 0, slot: i, t: 0,
      onHit() { burstPod(pod); }, onDeath() { burstPod(pod); }, getCenter(out = new THREE.Vector3()) { return out.copy(obj.position).setY(obj.position.y + 0.6); } };
    pods.push(pod);
  }
  function dropPods(n) {
    const p = e.object.position;
    for (let k = 0; k < n; k++) {
      const pod = pods.find((q) => !q.alive); if (!pod) break;
      const a = rand(0, 6.28), r = rand(5, Math.min(14, A.radius - 3));
      pod.object.position.set(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r);
      pod.object.position.y = ctx.groundH(pod.object.position.x, pod.object.position.z);
      pod.alive = true; pod.hp = 1e6; pod.maxHp = 1e6; pod.t = 0; pod.h = null;
      try { game.combat.register(pod); } catch (_) { /* */ }
      ctx.dust(pod.object.position, 0.8);
    }
  }
  function burstPod(pod, hh = null) {
    if (!pod.alive) return;
    pod.alive = false;
    if (pod.h && !hh) { pod.h.stop(); pod.h = null; }
    try { game.combat.unregister(pod); } catch (_) { /* */ }
    const c = pod.object.position;
    _v.copy(c).setY(c.y + 0.6);
    vfx.preset?.('explosion_fire', _v, { owner: 'enemy', scale: 0.96 });
    vfx.groundDecal?.('scorch', c, 3, 6);
    ctx.audio('explode_fire', { position: c, volume: 0.9 });
    for (const pl of plates) {
      if (!pl.part.alive) continue;
      pl.part.getCenter(_w);
      if (Math.hypot(_w.x - c.x, _w.z - c.z) < 6.5) game.combat.dealDamage(pl.part, { amount: Math.round(pl.part.maxHp * 0.3), fixed: true, element: 'fire', source: 'player', noReaction: true, tags: ['pod'], status: { burning: 3 } });
    }
    bossHit(ctx, e, hh || { kind: 'circle', pos: c, r: 3 }, { attack: 'treant.pods', amount: D.pod, element: 'fire', knockback: 9, launch: 4, from: c });
  }
  // the pod batch lives in world space (moved out of the model after the prewarm compile)
  model.pods.removeFromParent(); game.scene.add(model.pods);
  function syncPods(dt) {
    let n = 0;
    const im = model.pods;
    for (const pod of pods) {
      if (!pod.alive) continue;
      pod.t += dt;
      _v.copy(pod.object.position).setY(pod.object.position.y + 0.55);
      const s = (1 + Math.sin(pod.t * (pod.h ? 18 : 6) + pod.slot) * 0.08) * (pod.h ? 1.15 : 1);
      _m.compose(_v, _q.identity(), _s.set(s, s * 1.1, s));
      im.setMatrixAt(n++, _m);
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  }

  // ---------------- attacks (PLAN §4.12; all through game.tells)
  let roots = [];             // live root handles (fan)
  let armStuck = 0;           // sweep punish: the arm is stuck, arm plates take ×2
  function start(kind) {
    const p = e.object.position, pp = ctx.playerPos;
    atkDir.set(pp.x - p.x, 0, pp.z - p.z); if (atkDir.lengthSq() < 1e-6) atkDir.set(Math.sin(e.facing), 0, Math.cos(e.facing)); atkDir.normalize();
    let h = null;
    if (kind === 'stomp') {
      atkPos.set(p.x + atkDir.x * 4, 0, p.z + atkDir.z * 4); atkPos.y = ctx.groundH(atkPos.x, atkPos.z);
      h = bossAttack(ctx, e, 'treant.stomp', { shape: { pos: atkPos } });
    } else if (kind === 'sweep') {
      h = bossAttack(ctx, e, 'treant.sweep', { shape: { pos: p, dir: atkDir } });
    } else if (kind === 'roots') {
      atkPos.copy(p);
      const S = attackSpec('treant.roots'), fan = e.phase >= 2 ? S.fan3 : S.fan;
      roots = [];
      for (let k = 0; k < fan; k++) {
        const a = Math.atan2(atkDir.x, atkDir.z) + (k - (fan - 1) / 2) * 0.32;
        const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const hh = bossAttack(ctx, e, 'treant.roots', { shape: { pos: atkPos, dir }, hold: k === 0 });
        if (hh) { roots.push({ h: hh, dir }); if (!h) h = hh; }
      }
    }
    if (h) { atk = kind; atkT = 0; tele = h; }
    return h;
  }
  function resolve(h) {
    const p = e.object.position;
    if (atk === 'stomp') {
      bossHit(ctx, e, h, { attack: 'treant.stomp', amount: D.stomp, knockback: 14, launch: 7, from: atkPos });
      vfx.groundDecal?.('crack', atkPos, 5, 6, { owner: 'enemy' });
      vfx.burst(atkPos, { owner: 'enemy', count: 10, color: [0x8a7258, 0x46362a], speed: 4, spread: 0.4, dir: _d.set(0, 1, 0), size: 0.8, sizeEnd: 1.6, life: 0.8, shape: 'smoke', additive: false, drag: 2 });
      e.shakeAt(atkPos, 0.9);
    } else if (atk === 'sweep') {
      vfx.debris?.(_v.copy(p).addScaledVector(atkDir, 7), { owner: 'enemy', count: 8, size: 0.5, speed: 8, material: 'wood' });
      bossHit(ctx, e, h, { attack: 'treant.sweep', amount: D.sweep, knockback: 18, launch: 6 });
      // the arm is stuck in the ground: punish window, arm plates ×2
      const S = attackSpec('treant.sweep');
      armStuck = S.punishDur;
      bossPunish(ctx, e, S.punishDur, S.punishMul);
    }
  }
  function rootHit(L) {
    for (let k = 1; k <= 6; k += 2) {
      _v.copy(atkPos).addScaledVector(L.dir, k * 3); _v.y = ctx.groundH(_v.x, _v.z);
      vfx.burst(_v, { owner: 'enemy', count: 4, color: [0x8a7258, 0x46362a], speed: 6, spread: 0.3, dir: _d.set(0, 1, 0), size: 0.6, sizeEnd: 0.2, life: 0.7, gravity: 14, shape: 'thorn', additive: false });
    }
    return bossHit(ctx, e, L.h, { attack: 'treant.roots', amount: D.roots, element: 'nature', knockback: 4, launch: 10, heavy: true, status: { rooted: 1.0 }, from: atkPos });
  }
  // pods: 9 s after landing a pod glows (tells 'treant.pods', 1.0 s) and bursts on its own
  function podTick(dt) {
    for (const pod of pods) {
      if (!pod.alive) continue;
      if (!pod.h && pod.t > 9) {
        pod.h = bossAttack(ctx, e, 'treant.pods', { shape: { pos: pod.object.position }, hold: false });
        if (!pod.h) pod.t = 8;
      }
      if (pod.h) { if (pod.h.consumeStrike()) { const hh = pod.h; pod.h = null; burstPod(pod, hh); } else if (cancelled(pod.h)) pod.h = null; }
    }
  }

  e.think = (dt, sm) => {
    e.baseTick(dt);
    syncPods(dt);
    podTick(dt);
    const p = e.object.position, pp = ctx.playerPos, d = e.distP;
    attackCd -= dt * sm; podCd -= dt; stormCd -= dt;
    if (armStuck > 0) armStuck -= dt;
    speed = 0;
    for (let i = 0; i < 4; i++) { const pl = plates[i]; model.embers[i].scale.setScalar(pl.part.alive && (pl.part.statuses?.burning || pl.burnT > 0) ? 1 : 0.001); }
    if (e.phase >= 1) {
      kneelT -= dt;
      if (kneelT <= 0) { heartOpen = !heartOpen; kneelT = heartOpen ? 8 : 10; vfx.shake?.(0.4); }
    }
    heart.invulnerable = !(e.phase >= 1 && heartOpen);
    // strike latches
    for (let i = roots.length - 1; i >= 0; i--) { const L = roots[i]; if (L.h.consumeStrike()) { rootHit(L); roots.splice(i, 1); if (!roots.length) e.shakeAt(atkPos, 0.5); } else if (cancelled(L.h)) roots.splice(i, 1); }
    if (tele && atk && !atk.endsWith(':rec')) {
      if (atk === 'roots') { if (!roots.length) { atk = 'roots:rec'; atkT = 0; tele = null; } }
      else if (tele.consumeStrike()) { const hh = tele; tele = null; resolve(hh); atk = atk + ':rec'; atkT = 0; }
      else if (cancelled(tele)) { tele = null; atk = atk + ':rec'; atkT = 0; }
    }
    if (e.transitioning || !e.playerInArena(18)) return;
    if (atk) {
      atkT += dt * sm;
      if (atk.endsWith(':rec')) { const rec = atk === 'sweep:rec' ? attackSpec('treant.sweep').punishDur : 1.0; if (atkT > rec) { atk = null; attackCd = rand(1.6, 2.8); } }
      else if (tele && !tele.locked && atk === 'sweep') { const want = Math.atan2(pp.x - p.x, pp.z - p.z); let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); e.facing += clamp(df, -0.7 * dt, 0.7 * dt); atkDir.set(Math.sin(e.facing), 0, Math.cos(e.facing)); tele.setDir(atkDir); }
      return;
    }
    const want = Math.atan2(pp.x - p.x, pp.z - p.z);
    let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df));
    e.facing += clamp(df, -0.9 * dt, 0.9 * dt);
    if (!(e.phase >= 1 && heartOpen) && d > 11) { speed = 1.6 * sm; p.x += Math.sin(e.facing) * speed * dt; p.z += Math.cos(e.facing) * speed * dt; e.clampToArena(5); p.y = ctx.groundH(p.x, p.z); }
    if (e.phase === 0 && podCd <= 0) { podCd = 12; dropPods(3); }
    if (e.phase >= 2 && stormCd <= 0) { stormCd = 9; dropPods(4); }
    if (attackCd <= 0 && !(e.phase === 1 && heartOpen)) {
      const r = Math.random();
      const k = e.phase >= 2 && r < 0.45 ? 'roots' : d < 9 ? (r < 0.55 ? 'stomp' : 'sweep') : d < 13 ? 'sweep' : 'roots';
      if (!start(k)) attackCd = 0.5;
    }
  };

  e.pose = (dt) => {
    Object.assign(tgt, BASE);
    const t = game.time;
    phaseW += dt * (0.6 + speed * 0.9);
    const kTarget = (e.phase >= 1 && heartOpen) || e.defeated || e.isBroken?.() ? 1 : 0;
    kneel = damp(kneel, kTarget, 2.2, dt);
    let lambda = 4;
    if (speed > 0.05) walkCycle(tgt, phaseW, 0.7, 0);
    const a = atk || '';
    if (a === 'stomp') { const k = clamp(atkT / 1.1, 0, 1); tgt.lRx = -1.0 * k; tgt.kR = 1.0 * k; tgt.hipY = HIP + 0.4 * k; tgt.pitch = -0.1 * k; tgt.aRx = -0.6 * k; tgt.aLx = -0.6 * k; lambda = 6; }
    else if (a === 'stomp:rec') { tgt.lRx = 0.25; tgt.kR = 0.2; tgt.hipY = HIP - 0.6; tgt.pitch = 0.15; lambda = 14; }
    else if (a === 'sweep') { const k = clamp(atkT / 1.2, 0, 1); tgt.aRx = -1.4 * k; tgt.aRz = -1.3 * k; tgt.spineY = 0.8 * k; tgt.fRx = -0.6; lambda = 5; }
    else if (a === 'sweep:rec') { tgt.aRx = -0.9; tgt.aRz = 0.9; tgt.spineY = -0.9; tgt.fRx = -0.1; tgt.pitch = 0.3; tgt.hipY = HIP - 0.6; lambda = 12; }   // arm planted in the ground
    else if (a === 'roots') { const k = clamp(atkT / 1.0, 0, 1); tgt.aRx = -2.6 * k; tgt.aLx = -2.6 * k; tgt.pitch = -0.15 * k; tgt.headX = -0.3 * k; lambda = 5; }
    else if (a === 'roots:rec') { tgt.aRx = -0.3; tgt.aLx = -0.3; tgt.fRx = -1.2; tgt.fLx = -1.2; tgt.pitch = 0.45; tgt.spineX = 0.3; tgt.hipY = HIP - 0.8; lambda = 14; }
    else { tgt.aRx = -0.2 + Math.sin(t * 0.7) * 0.05; tgt.aLx = -0.2 + Math.cos(t * 0.6) * 0.05; tgt.aRz = -0.25; tgt.aLz = 0.25; tgt.fRx = tgt.fLx = -0.5; tgt.spineX = Math.sin(t * 0.5) * 0.03; tgt.headY = Math.sin(t * 0.3) * 0.2; }
    // kneel: knees down, torso pitched, arms planted
    if (kneel > 0.01) {
      tgt.hipY = tgt.hipY * (1 - kneel) + (HIP - 3.6) * kneel; tgt.lRx += -1.5 * kneel; tgt.kR += 2.0 * kneel; tgt.lLx += -0.6 * kneel; tgt.kL += 1.6 * kneel;
      tgt.pitch += 0.4 * kneel; tgt.aRx += -0.5 * kneel; tgt.aLx += -0.5 * kneel; tgt.fRx += -0.6 * kneel; tgt.fLx += -0.6 * kneel; tgt.headX += 0.3 * kneel;
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    // burned plates crumble away; heart glow
    for (const pl of plates) {
      if (pl.burnT > 0) { pl.burnT += dt; pl.bone.scale.setScalar(Math.max(0.001, 1 - pl.burnT * 1.5)); if (pl.burnT < 0.7 && Math.random() < 0.4) { pl.bone.getWorldPosition(_v); vfx.burst(_v, { owner: 'enemy', count: 2, color: [0xffd04a, 0xff6a1f], speed: 2, spread: 1, size: 0.3, sizeEnd: 0, life: 0.8, shape: 'ember', gravity: -2 }); } }
    }
    const hg = e.phase >= 1 ? (heartOpen ? 0.9 : 0.35) : 0.12;
    model.halo.material.opacity = damp(model.halo.material.opacity, hg + Math.sin(t * 4) * 0.08, 4, dt);
    model.heart.rotation.y += dt * 0.8;
  };
  const baseClean = e.cleanupParts;
  e.cleanupParts = () => { baseClean(); model.pods.removeFromParent(); for (const pod of pods) { if (pod.alive) { pod.alive = false; try { game.combat.unregister(pod); } catch (_) { /* */ } } pod.object.removeFromParent(); } };
  e.plates = plates; e.heart = heart; e.pods = pods; e.dropPods = dropPods;
  e.isArmStuck = () => armStuck > 0;
  finishBoss(ctx, e, { type: 'treant', cameraHint: { dist: 1.7, height: 1.6 }, preview: () => buildTreant().root, noDistanceRate: true,
    debugAttack: (id) => {
      stopAttacks(e); atk = null; tele = null; roots = [];
      if (id === 'treant.pods') { for (const q of pods) if (q.h && !q.h.alive) q.h = null; dropPods(1); const pod = pods.find((q) => q.alive && !q.h); if (!pod) return null; pod.t = 9.5; podTick(0); return pod.h; }
      return start(String(id).replace(/^treant\./, ''));
    },
    onBroken: () => { atk = null; tele = null; roots = []; } });
  return e;
}
createTreant.prewarm = () => { if (!spare) spare = buildTreant(); return spare.root; };
