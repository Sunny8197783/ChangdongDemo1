// The finale strike 「세계수의 새벽」 (gameplay mode, one input) and the rewritten ending (world mode, ≈ 45 s):
// void → golden pollen, the crown blooms, a time-lapse over Mirwen / Elderwood / the root plateau, the village festival,
// credits with all nine spirits and the new NPCs, 끝 (DESIGN §8.6).
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/utils.js';
import { ALL_ELEMENTS, elColor } from '../core/elements.js';
import { SPIRITS_ALL, makeSpirit, makeMist, makeMotes, makeRune, makePillar, glowTex, starTex } from './assets.js';
import { ENDING_LINES, ENDING_TITLE, CREDITS, FIN, FINALE_PROMPT, FINALE_LINE } from '../story/script3.js';

const sfxOf = (game) => (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };
const NINE = ALL_ELEMENTS.map((el) => elColor(el, 'hex'));

// ====================================================================== finale strike
export function buildFinale(C, onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = sfxOf(game);
  const vfx = game.vfx;
  const stage = C.stage();
  const pObj = game.player?.object;
  const hero = () => (pObj ? pObj.position : V(0, 0, 0));
  const b = game.enemies?.boss;
  const heart = V(0, 0, 0);
  const updHeart = () => {
    const part = b?.getPart?.('heart') || b?.parts?.find?.((p) => p.id === 'heart');
    if (part?.getCenter) part.getCenter(heart);
    else if (part?.object?.position) heart.copy(part.object.position);
    else if (b?.object?.position) heart.copy(b.object.position).setY(b.object.position.y + 6);
    else heart.copy(hero()).add(V(0, 2, -8));
  };
  updHeart();
  const orbs = SPIRITS_ALL.map((s) => { const o = stage.sprite(s.hex, 1.4, starTex(), 0); o.renderOrder = 17; o.material.depthTest = false; stage.add(o); return o; });
  const weaponGlow = stage.sprite(0xffffff, 2.4, glowTex(), 0); weaponGlow.material.depthTest = false; stage.add(weaponGlow);
  const rune = makeRune(stage, 0xffe08a, 6);
  const pillar = makePillar(stage, 0xfff4d0, 3, 90);
  let T = 0, struck = false, impacted = false, done = false, waitT = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3();
  const updDir = () => { dir.copy(heart).sub(hero()); dir.y = 0; if (dir.lengthSq() < 0.1) dir.set(0, 0, -1); dir.normalize(); };
  updDir();
  const _h = new THREE.Vector3();
  const hand = () => { let tip = null; try { tip = game.player?.getWeaponTip?.('main', _h); } catch (_) { /* */ } return tip?.isVector3 ? _h : _h.copy(hero()).setY(hero().y + 1.4); };
  const finishOnce = () => { if (done) return; done = true; try { onDone?.(); } catch (err) { console.error('[cinematic] finale onDone', err); } };
  const impact = () => {
    if (impacted) return; impacted = true;
    vfx?.screenFlash?.(0xffffff, 0.95, 0.9); vfx?.shake?.(1.0); vfx?.fovKick?.(10, 0.6);
    vfx?.shockwave?.(heart, { color: 0xfff4d0, radius: 30, duration: 1.2 });
    vfx?.burst?.(heart, { count: 160, color: NINE, speed: 18, spread: 1, size: 0.6, sizeEnd: 0, life: 1.6, shape: 'spark', drag: 1 });
    vfx?.burst?.(heart, { count: 80, color: [0xffd8e8, 0xfff2a8, 0x9be86a], speed: 7, spread: 1, size: 0.5, sizeEnd: 0.2, life: 2.6, shape: 'petal', gravity: -0.8, drag: 0.6 });
    vfx?.flash?.(heart, { color: 0xfff4d0, intensity: 30, distance: 80, duration: 1.0 });
    try { game.post?.pulse?.(1, 0.8); } catch (_) { /* */ }
    try { game.audio?.unsilence?.(); } catch (_) { /* */ }
    sfx('finisher_impact', { volume: 1.4, pitch: 0.7 }); sfx('blessing', { volume: 1, pitch: 0.8 });
    game.hitstop?.(0.15);
    finishOnce();   // bossDefeated {final:true} + the staggered dissolve happen during the light burst
  };
  const shots = [
    { // 0 — time slows; the nine colours gather into the weapon
      duration: 1.6, ease: 'outCubic', timeScale: 0.12,
      from: () => tmp.copy(hero()).addScaledVector(dir, -5).setY(hero().y + 4.5), to: () => tmp.copy(hero()).addScaledVector(dir, -4).setY(hero().y + 6.5),
      look: () => tmp2.lerpVectors(hero(), heart, 0.6).setY(heart.y + 1), fov: [58, 64],
      onStart() {
        sfx('finisher_charge', { volume: 0.9 }); sfx('cinematic_whoosh', { volume: 0.7, pitch: 0.7 });
        ov.subtitle(FINALE_LINE, { dur: 2.4 });
        try { game.audio?.duck?.(0.35, 3); } catch (_) { /* */ }
      },
      onUpdate(u, dt) {
        T += dt; updHeart();
        const h = hand();
        orbs.forEach((o, i) => {
          const a = (i / orbs.length) * Math.PI * 2 + T * 3, r = 3.2 * (1 - EASE.inOutSine(u)) + 0.25;
          o.position.set(h.x + Math.cos(a) * r, h.y + 0.6 + Math.sin(a * 2) * 0.4 * (1 - u), h.z + Math.sin(a) * r);
          o.material.opacity = smoothstep(0, 0.25, u);
        });
        weaponGlow.position.copy(h); weaponGlow.material.opacity = smoothstep(0.4, 1, u); weaponGlow.scale.setScalar(1.5 + u * 2);
      },
    },
    { // 1 — the dive: one input (LMB, R or X) lands the blow
      duration: 4.2, ease: 'inOutSine', timeScale: 0.06,
      from: () => tmp.copy(hero()).addScaledVector(dir, -4).setY(hero().y + 6.5), to: () => tmp.copy(heart).addScaledVector(dir, -7).setY(heart.y + 8),
      look: () => tmp2.copy(heart), fov: [64, 70],
      onStart() { ov.title(FINALE_PROMPT, { style: 'low', dur: 4.0, fadeIn: 0.3, fadeOut: 0.2, stagger: 0.01 }); },
      onUpdate(u, dt) {
        T += dt; waitT += dt; updHeart();
        const h = hand();
        weaponGlow.position.copy(h); weaponGlow.scale.setScalar(3.5 + Math.sin(T * 12) * 0.4);
        orbs.forEach((o, i) => { const a = (i / orbs.length) * Math.PI * 2 + T * 6; o.position.set(h.x + Math.cos(a) * 0.4, h.y + 0.5, h.z + Math.sin(a) * 0.4); });
        const raw = game.input?.raw;
        const hit = raw && (raw.mousePressed?.(0) || raw.pressed?.('KeyR') || raw.pressed?.('KeyX') || raw.pressed?.('Space'));
        if (!struck && (hit || (game.isTest && waitT > 0.5))) { struck = true; ov.clearTitle(0.15); C.next(); }
      },
    },
    { // 2 — silence 0.4 s, then impact: a white flash and the light burst
      duration: 0.55, ease: 'inCubic', timeScale: 0.25,
      from: () => tmp.copy(heart).addScaledVector(dir, -7).setY(heart.y + 8), to: () => tmp.copy(heart).addScaledVector(dir, -2.5).setY(heart.y + 1.5),
      look: () => tmp2.copy(heart), fov: [70, 52],
      onStart() { struck = true; try { game.audio?.silence?.(0.4); } catch (_) { /* */ } },
      onUpdate(u, dt, e, tt) { T += dt; if (tt >= 0.4) impact(); },
    },
    { // 3 — the light burst; the wyrm dissolves into petals and leaves (enemies' dissolve)
      duration: 2.2, ease: 'outCubic', timeScale: (u) => (u < 0.2 ? 0.3 : 1),
      from: () => tmp.copy(heart).addScaledVector(dir, -9).setY(heart.y + 5), to: () => tmp.copy(heart).addScaledVector(dir, -16).setY(heart.y + 9),
      look: () => tmp2.copy(heart).setY(heart.y + 4), fov: [56, 60],
      onStart() { impact(); rune.position.set(heart.x, heart.y - 1, heart.z); pillar.position.set(heart.x, heart.y - 2, heart.z); for (const o of orbs) o.material.opacity = 0; weaponGlow.material.opacity = 0; },
      onUpdate(u, dt) {
        T += dt;
        rune.material.opacity = (1 - u) * 0.9; rune.scale.setScalar(6 + u * 14); rune.rotation.y = T;
        pillar.material.uniforms.uTime.value = T; pillar.material.uniforms.uOpacity.value = 0.6 * (1 - smoothstep(0.4, 1, u)); pillar.scale.set(3 + u * 6, 90, 3 + u * 6);
      },
    },
    { duration: 0.7, ease: 'inOutSine', timeScale: 1, letterbox: false, blendToGame: true, from: () => tmp.copy(heart).addScaledVector(dir, -16).setY(heart.y + 9), look: () => tmp2.copy(heart).setY(heart.y + 4) },
  ];
  return C.play(shots, {
    mode: 'gameplay', letterbox: true, film: false, skippable: true, hintTime: 0, hideHud: true,
    onSkip: impact,
    onEnd: () => { impact(); stage.dispose(); },
  });
}

// ====================================================================== ending v3 (world mode)
export function buildEnding(C, onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = sfxOf(game);
  const vfx = game.vfx;
  const W = game.world || {};
  const vil = W.village || {};
  const pObj = game.player?.object;
  const stage = C.stage();
  const gy = (x, z) => { const h = C.groundY(x, z); return h > -1e8 ? h : 0; };
  const plat = W.bossArenas?.nidhoggra?.position?.clone?.() || V(108, gy(108, -132), -132);
  const zc = (id, x, z) => { const zs = W.zones; const q = zs && (Array.isArray(zs) ? zs.find((k) => k.id === id) : zs[id]); return q?.center?.clone?.() || V(x, gy(x, z), z); };
  const mir = zc('mirwen', -80, -72), eld = zc('elderwood', 84, -62);
  const tree = W.worldTree?.position?.clone?.() || V(215, 22, -215);
  const crown = W.worldTree?.crown?.clone?.() || V(tree.x, tree.y + 172, tree.z);
  const vC = vil.center?.clone?.() || V(0, 7, 137);
  const tmp = new THREE.Vector3();
  const savedPos = pObj ? pObj.position.clone() : null;
  const savedVis = pObj ? pObj.visible : true;
  const follow = () => { if (pObj && !pObj.visible) { const c = game.camera.position; pObj.position.set(c.x, gy(c.x, c.z), c.z); } };

  const mist = makeMist(stage, V(plat.x, plat.y - 2, plat.z), { count: 70, radius: 40, height: 22, size: 32 });
  mist.userData.u.uGrow.value = 1; mist.userData.u.uOpacity.value = 0.75;
  const pollen = makeMotes(stage, V(plat.x, plat.y - 4, plat.z), { count: 90, radius: 46, height: 30, size: 0.8, rise: -0.6, colA: 0xffd36a, colB: 0xfff2c0 });
  const bloom = makeMotes(stage, V(crown.x, crown.y - 40, crown.z), { count: 80, radius: 80, height: 60, size: 3.2, rise: 1.2, colA: 0xffb8d8, colB: 0xfff2a8 });
  const lake = makeMotes(stage, V(mir.x, mir.y, mir.z), { count: 60, radius: 30, height: 10, size: 0.9, rise: 1.0, colA: 0x9fe8ff, colB: 0xffffff });
  const forest = makeMotes(stage, V(eld.x, eld.y, eld.z), { count: 70, radius: 32, height: 12, size: 1.0, rise: 0.8, colA: 0xffb8d8, colB: 0x9be86a });
  const green = makeMotes(stage, V(plat.x, plat.y, plat.z), { count: 50, radius: 34, height: 10, size: 1.0, rise: 1.1, colA: 0x9be86a, colB: 0xfff2a8 });
  const treeFlash = stage.sprite(0xfff4d0, 280, glowTex(), 0); treeFlash.position.copy(crown); stage.add(treeFlash);
  const lanterns = makeMotes(stage, V(vC.x, vC.y + 2, vC.z), { count: 70, radius: 30, height: 8, size: 1.1, rise: 1.6, colA: 0xff9a3a, colB: 0xffd27a });
  const ticks = [mist, pollen, bloom, lake, forest, green, lanterns];
  // the nine spirits circle over the village during the credits
  const nine = SPIRITS_ALL.map((s) => { const sp = makeSpirit(stage, s.el, { size: 2.6, trailWidth: 1.2, trailLen: 40 }); sp.setOpacity(0); return sp; });
  const MIST_A = new THREE.Color(0x5a1f78), MIST_B = new THREE.Color(0xffe6b0);
  const fwPts = [];
  for (let i = 0; i < 10; i++) fwPts.push(V(vC.x + (Math.random() - 0.5) * 70, vC.y + 30 + Math.random() * 20, vC.z - 38 + (Math.random() - 0.5) * 30));
  let T = 0, fwT = 0, fwI = 0;
  const later = [];
  const firework = () => {
    const p = fwPts[fwI++ % fwPts.length], c = NINE[fwI % NINE.length], c2 = NINE[(fwI + 4) % NINE.length];
    vfx?.burst?.(V(p.x, p.y - 22, p.z), { count: 6, color: 0xfff0c0, speed: 26, dir: V(0, 1, 0), spread: 0.02, size: 0.5, sizeEnd: 0, life: 0.6, shape: 'spark', velocityStretch: 0.08 });
    later.push({ t: T + 0.55, fn: () => {
      vfx?.burst?.(p, { count: 120, color: [c, c2], speed: 16, speedVar: 3, spread: 1, size: 1.5, sizeEnd: 0, life: 1.8, lifeVar: 0.4, gravity: -3, drag: 1.1, shape: 'spark', velocityStretch: 0.05 });
      vfx?.burst?.(p, { count: 24, color: 0xffffff, speed: 7, spread: 1, size: 1.0, sizeEnd: 0, life: 1.2, shape: 'ember', gravity: -2, drag: 1 });
      sfx('firework', { volume: 0.3, pitch: 1.4 + Math.random() * 0.4 });
    } });
  };
  const aerial = (c, a, r, h) => V(c.x + Math.sin(a) * r, c.y + h, c.z + Math.cos(a) * r);
  const shots = [
    { // 0 — the void mist turns into golden pollen over the plateau
      duration: 6.5, ease: 'inOutSine', grade: 'golden', gradeDur: 4, fadeIn: 1.2,
      from: C.orbit(plat, { radius: 56, height: 26, from: 2.0, to: 2.7, radiusTo: 46, heightTo: 20 }), lookFrom: V(plat.x, plat.y + 6, plat.z), fov: 56,
      onStart() {
        if (pObj) pObj.visible = false;
        try { game.audio?.setMusic?.('ending_v3'); } catch (_) { /* */ }
        ov.subtitle(ENDING_LINES[0], { dur: 6 });
        sfx('blessing', { volume: 0.7, pitch: 0.8 });
      },
      onUpdate(u) {
        follow();
        const k = EASE.inOutSine(u);
        mist.userData.u.uGrow.value = 1 - k; mist.userData.u.uColB.value.lerpColors(MIST_A, MIST_B, k);
        pollen.userData.u.uOpacity.value = smoothstep(0.15, 0.6, u);
      },
    },
    { // 1 — 아스트라's grey crown blooms
      duration: 5.6, ease: 'inOutSine', grade: 'sunrise', gradeDur: 3,
      from: V(crown.x - 260, crown.y - 70, crown.z + 220), to: V(crown.x - 230, crown.y - 40, crown.z + 190),
      lookFrom: V(crown.x, crown.y - 40, crown.z), lookTo: V(crown.x, crown.y - 10, crown.z), fov: [44, 40],
      onStart() { ov.subtitle(ENDING_LINES[1], { dur: 5.2 }); sfx('spirit_chime', { volume: 1, pitch: 0.7 }); },
      onUpdate(u) {
        follow();
        const f = smoothstep(0.2, 0.5, u) * (1 - smoothstep(0.65, 1, u));
        treeFlash.material.opacity = f * 0.85;
        bloom.userData.u.uOpacity.value = smoothstep(0.3, 0.7, u);
        if (u > 0.3 && !this._c) { this._c = true; vfx?.screenFlash?.(0xfff0c8, 0.3, 1.2); }
      },
    },
    { // 2a — time-lapse: Mirwen's lake clears
      duration: 3.6, ease: 'inOutSine', fadeIn: 0.4,
      from: aerial(mir, 0.6, 50, 26), to: aerial(mir, 0.9, 42, 22), lookFrom: V(mir.x, mir.y, mir.z), fov: 54,
      onStart() { ov.subtitle(ENDING_LINES[2], { dur: 10.2 }); lake.userData.u.uOpacity.value = 1; pollen.userData.u.uOpacity.value = 0; },
      onUpdate() { follow(); },
    },
    { // 2b — Elderwood blooms
      duration: 3.4, ease: 'inOutSine', fadeIn: 0.4,
      from: aerial(eld, -0.4, 48, 24), to: aerial(eld, -0.1, 40, 20), lookFrom: V(eld.x, eld.y + 2, eld.z), fov: 54,
      onStart() { forest.userData.u.uOpacity.value = 1; lake.userData.u.uOpacity.value = 0; },
      onUpdate() { follow(); },
    },
    { // 2c — the root plateau greens
      duration: 3.4, ease: 'inOutSine', fadeIn: 0.4, fadeOut: 0.6,
      from: aerial(plat, 2.4, 60, 30), to: aerial(plat, 2.7, 52, 24), lookFrom: V(plat.x, plat.y + 4, plat.z), fov: 54,
      onStart() { green.userData.u.uOpacity.value = 1; forest.userData.u.uOpacity.value = 0; mist.visible = false; },
      onUpdate() { follow(); },
    },
    { // 3 — the village festival: lanterns & fireworks
      duration: 5.5, ease: 'inOutSine', grade: 'dusk', gradeDur: 0, fadeIn: 1,
      from: V(vC.x - 9, vC.y + 6, vC.z + 21), to: V(vC.x - 5, vC.y + 9, vC.z + 17), lookFrom: V(vC.x, vC.y + 7, vC.z - 10), lookTo: V(vC.x, vC.y + 22, vC.z - 40), fov: [56, 62],
      onStart() { green.userData.u.uOpacity.value = 0; ov.subtitle(ENDING_LINES[3], { dur: 5 }); lanterns.userData.u.uOpacity.value = 1; },
      onUpdate(u, dt) { follow(); fwT -= dt; if (fwT <= 0 && u < 0.92) { fwT = 0.55 + Math.random() * 0.5; firework(); } },
    },
    { // 3b — the plaza under the lanterns
      duration: 5, ease: 'inOutSine',
      from: V(vC.x + 7, vC.y + 2.2, vC.z + 9), to: V(vC.x + 4.5, vC.y + 2.8, vC.z + 6.5),
      lookFrom: V(vC.x - 1, vC.y + 1.8, vC.z - 2), lookTo: V(vC.x - 2, vC.y + 4.5, vC.z - 8), fov: [50, 54],
      onStart() { ov.subtitle(ENDING_LINES[4], { dur: 4.6 }); },
      onUpdate(u, dt) { follow(); fwT -= dt; if (fwT <= 0) { fwT = 0.6 + Math.random() * 0.5; firework(); } },
    },
    { // 4 — credits; the nine spirits circle the night sky
      duration: 10, ease: 'inOutSine',
      from: V(vC.x - 5, vC.y + 9, vC.z + 17), to: V(vC.x - 3, vC.y + 12, vC.z + 15), lookFrom: V(vC.x, vC.y + 22, vC.z - 40), lookTo: V(vC.x, vC.y + 32, vC.z - 50), fov: 62,
      onStart() {
        ov.grade('linear-gradient(180deg, rgba(6,6,16,.55), rgba(6,6,16,.25) 50%, rgba(6,6,16,.6))', 1, 1.5);
        ov.title(ENDING_TITLE.text, { sub: ENDING_TITLE.sub, style: 'low', dur: 2.6, fadeIn: 0.8, fadeOut: 0.6 });
        ov.credits(CREDITS, { dur: 9.6, fadeIn: 1.4, fadeOut: 1.2 });
      },
      onUpdate(u, dt) {
        follow(); fwT -= dt; if (fwT <= 0) { fwT = 0.9 + Math.random() * 0.6; firework(); }
        nine.forEach((sp, i) => {
          const a = (i / nine.length) * Math.PI * 2 + T * 0.35;
          sp.obj.position.set(vC.x + Math.cos(a) * 26, vC.y + 30 + Math.sin(a * 2 + T) * 4, vC.z - 44 + Math.sin(a) * 14);
          sp.setOpacity(smoothstep(0, 0.15, u)); sp.update(T + i);
        });
      },
    },
    { // 5 — fin
      duration: 6.5, ease: 'inOutSine', fadeOut: 1.4,
      from: V(vC.x - 3, vC.y + 12, vC.z + 15), to: V(vC.x - 2, vC.y + 16, vC.z + 13), lookFrom: V(vC.x, vC.y + 32, vC.z - 50), lookTo: V(vC.x, vC.y + 46, vC.z - 56), fov: 62,
      onStart() { ov.title(FIN.text, { sub: FIN.sub, style: 'card', dur: 6.3, fadeIn: 1.4, fadeOut: 1.4 }); sfx('spirit_chime', { volume: 0.8, pitch: 0.8 }); },
      onUpdate(u) {
        follow();
        nine.forEach((sp, i) => {
          const a = (i / nine.length) * Math.PI * 2 + T * 0.35;
          sp.obj.position.set(vC.x + Math.cos(a) * (26 - u * 12), vC.y + 30 + u * 20, vC.z - 44 + Math.sin(a) * 14);
          sp.update(T + i); sp.setOpacity(1 - smoothstep(0.6, 1, u));
        });
      },
    },
  ];
  for (const s of shots) {
    const inner = s.onUpdate;
    s.onUpdate = function (u, dt, e, tt) {
      T += dt;
      for (const o of ticks) o.userData.tick(T);
      for (let i = later.length - 1; i >= 0; i--) if (later[i].t <= T) { const f = later[i].fn; later.splice(i, 1); try { f(); } catch (_) { /* */ } }
      inner?.call(this, u, dt, e, tt);
    };
  }
  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 3, endFade: 1.0, endState: 'cutscene',
    onEnd: () => {
      stage.dispose(); later.length = 0;
      try { game.audio?.setMusic?.(null); } catch (_) { /* */ }
      if (pObj) { if (savedPos) pObj.position.copy(savedPos); pObj.visible = savedVis; }
      try { onDone?.(); } catch (err) { console.error('[cinematic] ending onDone', err); }
    },
  });
}
