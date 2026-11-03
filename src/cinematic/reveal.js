// 갈라진 봉인 — the reveal after the golem (DESIGN §8.1, ~24 s, world mode, skippable):
// the golem core cracks into a sealing rune → 테라곤's memory speaks → violet mist flows down a glowing root channel to
// the NE → the 세계수 뿌리 고원, where a colossal serpent is coiled on the roots under a greying crown.
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/utils.js';
import { makeSpirit, makeRune, makePillar, makeMist, makeWyrm, glowTex, starTex } from './assets.js';
import { REVEAL_LINES as L } from '../story/script3.js';

/** The root channel polyline (x, z) — matches the vein world shows from act 2. */
const CHANNEL = [[0, -125], [0, -141], [12, -139], [24, -136], [34, -131], [44, -125], [55, -119], [64, -113], [72, -106], [77, -101]];

export function buildReveal(C, onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };
  const vfx = game.vfx;
  const W = game.world || {};
  const stage = C.stage();
  const gy = (x, z) => { const h = C.groundY(x, z); return h > -1e8 ? h : 0; };
  const arena = W.bossArenas?.golem?.position?.clone?.() || W.bossArena?.position?.clone?.() || V(0, gy(0, -125), -125);
  const plat = W.bossArenas?.nidhoggra?.position?.clone?.() || V(108, gy(108, -132), -132);
  const tree = W.worldTree?.position?.clone?.() || V(215, 22, -215);
  const crown = W.worldTree?.crown?.clone?.() || V(tree.x, tree.y + 172, tree.z);
  const pObj = game.player?.object;
  const savedPos = pObj ? pObj.position.clone() : null, savedVis = pObj ? pObj.visible : true;
  const follow = () => { if (pObj && !pObj.visible) { const c = game.camera.position; pObj.position.set(c.x, gy(c.x, c.z), c.z); } };

  // ---- set pieces
  const core = V(arena.x, arena.y + 5.5, arena.z);
  const coreGlow = stage.sprite(0xa02cff, 9, glowTex(), 0); coreGlow.position.copy(core); stage.add(coreGlow);
  const coreStar = stage.sprite(0xffe2a0, 3, starTex(), 0); coreStar.position.copy(core); stage.add(coreStar);
  const rune = makeRune(stage, 0xffd890, 4); rune.position.set(arena.x, arena.y + 0.15, arena.z);
  const pillar = makePillar(stage, 0xf0bd6e, 1.4, 36); pillar.position.copy(arena);
  const terragon = makeSpirit(stage, 'earth', { size: 4, trailWidth: 1.6, trailLen: 30 }); terragon.setOpacity(0);
  // the root channel: the void root vein world draws from act 2 (ruin → valley → plateau foot; same polyline as world/plateau.js),
  // then up the plateau cliff
  const ctrl = [];
  for (const [x, z] of CHANNEL) ctrl.push(V(x, gy(x, z) + 1.4, z));
  ctrl.push(V(88, Math.max(gy(88, -112), plat.y * 0.5) + 2, -112), V(plat.x - 14, plat.y + 4, plat.z + 10));
  const channel = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const wisp = makeSpirit(stage, 'shadow', { size: 2.2, trailWidth: 1.4, trailLen: 46 }); wisp.setOpacity(0);
  const mistA = makeMist(stage, V(arena.x, arena.y - 1, arena.z), { count: 50, radius: 26, height: 12, size: 26 });
  mistA.userData.u.uOpacity.value = 0.65;
  const mistB = makeMist(stage, V(plat.x, plat.y - 6, plat.z), { count: 60, radius: 40, height: 22, size: 34, colA: 0x12061e, colB: 0x6a2a9a });
  mistB.userData.u.uOpacity.value = 0.75;
  const wyrm = makeWyrm(stage, V(plat.x, plat.y - 2, plat.z), { scale: 1 });
  const crownGrey = stage.sprite(0x9a90a8, 200, glowTex(), 0); crownGrey.position.copy(crown); stage.add(crownGrey);
  const ticks = [mistA, mistB];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), cp = new THREE.Vector3(), ct = new THREE.Vector3();
  let T = 0;
  const tickAll = (dt) => {
    T += dt;
    for (const o of ticks) o.userData.tick(T);
    pillar.material.uniforms.uTime.value = T; rune.rotation.y = T * 0.6;
    wyrm.tick(T);
  };
  const dirToPlat = tmp2.set(plat.x - arena.x, 0, plat.z - arena.z).normalize().clone();

  const shots = [
    { // 0 — the core cracks: a sealing rune rises out of the golem's heart
      duration: 4.6, ease: 'inOutSine', fadeIn: 0.8, grade: 'dusk', gradeDur: 2,
      from: C.orbit(arena, { radius: 13, height: 4, from: 2.4, to: 3.1, radiusTo: 10, heightTo: 6 }), look: () => tmp.copy(core).setY(core.y - 0.5), fov: [50, 44],
      onStart() {
        if (pObj) pObj.visible = false;
        ov.subtitle(L.core, { dur: 4.2 });
        sfx('shatter', { volume: 0.9, pitch: 0.6 }); sfx('cinematic_whoosh', { volume: 0.5, pitch: 0.7 });
      },
      onUpdate(u, dt) {
        tickAll(dt); follow();
        coreGlow.material.opacity = 0.8 * (1 - u * 0.6); coreGlow.scale.setScalar(9 - u * 3);
        coreStar.material.opacity = smoothstep(0.2, 0.7, u); coreStar.scale.setScalar(2 + u * 4); coreStar.material.rotation = T;
        rune.material.opacity = smoothstep(0.35, 0.9, u) * 0.9; rune.scale.setScalar(2 + u * 4);
        if (u > 0.4 && !this._b) { this._b = true; vfx?.burst?.(core, { count: 50, color: [0xffd890, 0xa02cff], speed: 7, spread: 1, size: 0.4, sizeEnd: 0, life: 1.2, shape: 'spark', drag: 1.5 }); vfx?.screenFlash?.(0xffe2a0, 0.25, 0.6); sfx('spirit_chime', { volume: 0.8, pitch: 0.7 }); }
      },
    },
    { // 1 — 테라곤's memory
      duration: 6.4, ease: 'inOutSine', grade: 'void', gradeDur: 2.5,
      from: V(arena.x - dirToPlat.x * 16 + 6, arena.y + 7, arena.z - dirToPlat.z * 16), to: V(arena.x - dirToPlat.x * 11 + 4, arena.y + 11, arena.z - dirToPlat.z * 11),
      look: () => tmp.set(arena.x, arena.y + 9, arena.z), fov: [48, 52],
      cues: [{ at: 3.1, subtitle: { text: L.terragon2, speaker: '테라곤', dur: 3.2 } }],
      onStart() {
        ov.subtitle(L.terragon1, { speaker: '테라곤', dur: 3.0 });
        sfx('blessing', { volume: 0.6, pitch: 0.55 });
      },
      onUpdate(u, dt) {
        tickAll(dt); follow();
        terragon.obj.position.set(arena.x, arena.y + 9 + Math.sin(T) * 0.4, arena.z);
        terragon.setOpacity(smoothstep(0, 0.25, u) * (1 - smoothstep(0.8, 1, u))); terragon.update(T);
        pillar.material.uniforms.uOpacity.value = 0.35 * smoothstep(0, 0.3, u) * (1 - smoothstep(0.75, 1, u)); pillar.scale.y = 12 + 24 * u;
        coreStar.material.opacity = 1 - u; rune.material.opacity = 0.9 * (1 - u);
      },
    },
    { // 2 — the mist flows down the glowing root channel toward the NE
      duration: 7.2, ease: 'linear',
      from: (e) => { channel.getPointAt(clamp(e * 0.92, 0, 1), cp); channel.getTangentAt(clamp(e * 0.92, 0, 0.999), ct); return cp.set(cp.x - ct.x * 13 - ct.z * 6, cp.y + 11 + Math.sin(e * 3) * 2, cp.z - ct.z * 13 + ct.x * 6); },
      look: (e) => channel.getPointAt(clamp(e * 0.92 + 0.08, 0, 1), tmp),
      fov: [58, 64], clampGround: 6,
      onStart() { ov.subtitle(L.channel, { dur: 6.4 }); sfx('cinematic_whoosh', { volume: 0.7, pitch: 0.6 }); terragon.setOpacity(0); },
      onUpdate(u, dt) {
        tickAll(dt); follow();
        channel.getPointAt(clamp(u * 0.92 + 0.08, 0, 1), wisp.obj.position);
        wisp.setOpacity(u < 0.97 ? 1 : 0); wisp.update(T);
        if (((T * 10) | 0) % 3 === 0) vfx?.burst?.(wisp.obj.position, { count: 2, color: [0x7a3cff, 0x2a0d4a], speed: 1.2, spread: 1, size: 1.4, sizeEnd: 2.4, life: 1.4, shape: 'smoke', gravity: -0.3 });
      },
    },
    { // 3 — 세계수 뿌리 고원: the wyrm coiled on the roots, the crown turning grey
      duration: 7.6, ease: 'inOutSine', grade: 'void', gradeDur: 0,
      from: V(plat.x - 62, plat.y + 14, plat.z + 46), to: V(plat.x - 50, plat.y + 22, plat.z + 34),
      lookFrom: V(plat.x, plat.y + 12, plat.z), lookTo: V(plat.x + 30, plat.y + 46, plat.z - 30), fov: [58, 50],
      cues: [{ at: 4.6, title: { text: L.title, sub: L.sub, style: 'card', dur: 3.0, fadeIn: 1, fadeOut: 0.8 } }],
      onStart() { ov.subtitle(L.wyrm, { dur: 4.4 }); sfx('boss_roar', { volume: 1.1, pitch: 0.45 }); vfx?.shake?.(0.25); wisp.setOpacity(0); },
      onUpdate(u, dt) {
        tickAll(dt); follow();
        crownGrey.material.opacity = smoothstep(0.35, 0.8, u) * 0.35;
        for (const e of wyrm.eyes) e.material.opacity *= smoothstep(0.1, 0.4, u);
      },
    },
    { // 4 — hold & fade
      duration: 1.6, ease: 'inOutSine', fadeOut: 1.2,
      from: V(plat.x - 50, plat.y + 22, plat.z + 34), to: V(plat.x - 48, plat.y + 23, plat.z + 32),
      lookFrom: V(plat.x + 30, plat.y + 46, plat.z - 30), fov: 50,
      onUpdate(u, dt) { tickAll(dt); follow(); },
    },
  ];
  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 3, endFade: 1.0,
    onEnd: () => {
      stage.dispose();
      if (pObj) { if (savedPos) pObj.position.copy(savedPos); pObj.visible = savedVis; }
      try { onDone?.(); } catch (err) { console.error('[cinematic] reveal onDone', err); }
    },
  });
}
