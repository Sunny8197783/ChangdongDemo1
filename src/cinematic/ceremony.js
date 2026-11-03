// Altar blessing (path chosen: spirit(s) descend into the hero) and the ending (cleansing, spirits return to the
// World Tree, village festival with lanterns & fireworks, credits, "끝 — 그리고 새로운 모험은 계속된다").
import * as THREE from 'three';
import { ELEMENT_COLORS, ELEMENT_NAMES_KO, ELEMENTS, clamp, smoothstep } from '../core/utils.js';
import { SPIRITS, makeSpirit, makeRune, makePillar, makeMist, makeMotes, glowTex, starTex } from './assets.js';

const sfxOf = (game) => (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };

// ====================================================================== blessing (~8.5 s, world mode)
export function buildBlessing(C, element = 'all', onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = sfxOf(game);
  const vfx = game.vfx;
  const W = game.world || {};
  const vil = W.village || {};
  const pObj = game.player?.object;
  const els = element === 'all' || !ELEMENTS.includes(element) ? ELEMENTS.slice() : [element];
  const master = els.length === 1;
  // the ceremony happens ON the dais: move the hero there first (slightly in front of the centre stone, toward
  // the plaza lane the shots are framed along), then build everything around that spot
  if (pObj && vil.altar) {
    const a = vil.altar, pc = vil.center;
    let dx = pc ? pc.x - a.x : 0, dz = pc ? pc.z - a.z : 1; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const hp = V(a.x + dx * 1.5, a.y, a.z + dz * 1.5);
    const gh = W.getGroundHeight?.(hp.x, hp.z);
    if (gh != null && gh > hp.y) hp.y = gh;
    if (game.player?.teleport) game.player.teleport(hp, false);
    else { pObj.position.copy(hp); pObj.updateMatrixWorld(true); }
  }
  const hero = pObj ? pObj.position.clone() : (vil.altar?.clone?.() || V(-16, 8, 120));
  const altar = vil.altar?.clone?.() || hero.clone();
  const stage = C.stage();
  const crystals = (vil.altarCrystals || []).filter((c) => els.includes(c.element));
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const chest = V(hero.x, hero.y + 1.15, hero.z);

  // pillars on the crystals (or around the hero when crystals are unknown)
  const pillars = els.map((el, i) => {
    const c = crystals.find((x) => x.element === el);
    const a = (i / els.length) * Math.PI * 2;
    const base = c ? c.position.clone() : V(altar.x + Math.cos(a) * 4, altar.y, altar.z + Math.sin(a) * 4);
    base.y = Math.min(base.y, C.groundY(base.x, base.z) + 0.2);
    const p = makePillar(stage, ELEMENT_COLORS[el], 0.45, 30); p.position.copy(base);
    return { el, p, base };
  });
  const heroPillar = makePillar(stage, master ? ELEMENT_COLORS[els[0]] : 0xfff0c8, 0.9, 40); heroPillar.position.copy(hero);
  const rune = makeRune(stage, master ? ELEMENT_COLORS[els[0]] : 0xffe6a8, 3); rune.position.set(hero.x, hero.y + 0.08, hero.z);
  const glow = stage.sprite(0xfff0c8, 3, glowTex(), 0); stage.add(glow); glow.position.copy(chest);
  const spirits = els.map((el, i) => {
    const sp = makeSpirit(stage, el, { size: 1.1, trailWidth: 0.6, trailLen: 14 });
    sp.setOpacity(0);
    const a0 = (i / els.length) * Math.PI * 2 + 0.5;
    sp.start = V(hero.x + Math.cos(a0) * 9, hero.y + 26 + i * 2, hero.z + Math.sin(a0) * 9);
    sp.a0 = a0;
    return sp;
  });
  const spiritPos = (sp, k, out) => {
    // spiral descent: radius 9 → 0, height 26 → chest
    const a = sp.a0 + k * Math.PI * 3.2, r = 9 * (1 - k) ** 1.2;
    return out.set(hero.x + Math.cos(a) * r, chest.y + (sp.start.y - chest.y) * (1 - EASE.inOutSine(k)), hero.z + Math.sin(a) * r);
  };
  const meta = master ? SPIRITS.find((s) => s.el === els[0]) : null;
  const titleText = master ? `${meta.title} ${meta.name}의 축복` : '다섯 정령의 축복';
  const subText = master ? `원소의 대가 · ${ELEMENT_NAMES_KO[els[0]]}` : '원소의 방랑자';
  // frame along the open lane from the altar toward the plaza (falls back to the hero's facing)
  const plaza = vil.center || null;
  let fx, fz;
  if (plaza) { fx = plaza.x - altar.x; fz = plaza.z - altar.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; }
  else { const yaw = pObj?.rotation?.y || 0; fx = Math.sin(yaw); fz = Math.cos(yaw); }
  const facing = Math.atan2(fx, fz);
  // the hero turns toward the lane (camera side) for the ceremony; player.update restores its own facing afterwards
  const savedYaw = pObj ? pObj.rotation.y : 0;
  if (pObj) pObj.rotation.y = facing;
  const front = (d, h, s = 0, o = hero) => V(o.x + fx * d + fz * s, o.y + h, o.z + fz * d - fx * s);
  let T = 0;
  const tick = (dt) => {
    T += dt;
    for (const { p } of pillars) p.material.uniforms.uTime.value = T;
    heroPillar.material.uniforms.uTime.value = T; rune.rotation.y = T * 0.9;
  };

  const shots = [
    { // crystals awaken, pillars of light rise
      duration: 2.4, ease: 'inOutSine', fadeIn: 0.6,
      from: front(12, 6.5, -4.5, altar), to: front(9.5, 4.4, -3, altar), lookFrom: V(altar.x, altar.y + 3, altar.z), lookTo: V(hero.x, hero.y + 3, hero.z), fov: [55, 50],
      onStart() {
        try { W.setAltarGlow?.(2.6); } catch (_) { /* */ }
        sfx('blessing', { volume: 0.9 }); sfx('spirit_chime', { volume: 0.7 });
        ov.subtitle(master ? `${ELEMENT_NAMES_KO[els[0]]}의 정령이 그대의 부름에 응답한다…` : '다섯 원소의 정령이 그대의 부름에 응답한다…', { dur: 3.4 });
        for (const { base, el } of pillars) vfx?.burst?.(base, { count: 26, color: [ELEMENT_COLORS[el], 0xffffff], speed: 6, dir: V(0, 1, 0), spread: 0.25, size: 0.3, sizeEnd: 0, life: 1.2, shape: 'spark' });
      },
      onUpdate(u, dt) {
        tick(dt);
        for (const { p } of pillars) { p.material.uniforms.uOpacity.value = EASE.outCubic(u) * 0.42; p.scale.y = 6 + 24 * EASE.outCubic(u); }
      },
    },
    { // spirits descend in spirals into the hero
      duration: 3.2, ease: 'inOutSine',
      from: front(4.4, 0.9, 1.6), to: front(3.6, 1.0, 1.2), look: (e) => tmp.set(hero.x, hero.y + 1.4 + (1 - e) * 3, hero.z), fov: [58, 52],
      onStart() {
        ov.title(titleText, { sub: subText, style: 'side', dur: 4.6, fadeIn: 1.0, stagger: 0.06 });
        sfx('cinematic_whoosh', { volume: 0.5, pitch: 1.2 });
      },
      onUpdate(u, dt, e, tt) {
        tick(dt);
        spirits.forEach((sp, i) => {
          const k = clamp((tt - i * 0.14) / 2.6, 0, 1);
          spiritPos(sp, k, sp.obj.position);
          sp.setOpacity(k <= 0 || k >= 1 ? 0 : clamp(k * 8, 0, 1)); sp.update(T + i);
          if (k >= 1 && !sp.done) {
            sp.done = true;
            vfx?.burst?.(chest, { count: 30, color: [sp.col, 0xffffff], speed: 5, spread: 1, size: 0.2, sizeEnd: 0, life: 0.7, shape: 'spark', drag: 2 });
            sfx('spirit_chime', { volume: 0.5, pitch: 1 + i * 0.1 });
          }
        });
        for (const { p } of pillars) p.material.uniforms.uOpacity.value = 0.42 * (1 - u * 0.5);
        heroPillar.material.uniforms.uOpacity.value = smoothstep(0.3, 0.9, u) * 0.45; heroPillar.scale.y = 40 * smoothstep(0.3, 1, u) + 2;
        rune.material.opacity = smoothstep(0.2, 0.8, u); rune.scale.setScalar(1.5 + 2 * u);
        glow.material.opacity = smoothstep(0.4, 1, u) * 0.6; glow.scale.setScalar(1.5 + u * 2);
      },
    },
    { // absorbed: flash, orbit around the empowered hero
      duration: 2.6, ease: 'inOutSine', fadeOut: 0.7,
      from: C.orbit(hero, { radius: 3.6, height: 1.0, from: facing + 0.35, to: facing + 1.6, radiusTo: 5, heightTo: 2.2 }), look: () => tmp2.set(hero.x, hero.y + 1.2, hero.z), fov: [52, 56],
      onStart() {
        const c = master ? ELEMENT_COLORS[els[0]] : 0xfff0c8;
        vfx?.screenFlash?.(c, 0.6, 0.6); vfx?.shake?.(0.2);
        vfx?.shockwave?.(hero, { color: c, radius: 7, duration: 0.8 });
        vfx?.burst?.(chest, { count: 70, color: master ? [c, 0xffffff] : els.map((x) => ELEMENT_COLORS[x]), speed: 9, spread: 1, size: 0.3, sizeEnd: 0, life: 1.1, shape: 'spark', drag: 1.5 });
        vfx?.flash?.(chest, { color: c, intensity: 10, distance: 18, duration: 0.8 });
        sfx('blessing', { volume: 0.6, pitch: 1.3 });
      },
      onUpdate(u, dt) {
        tick(dt);
        const f = 1 - u;
        heroPillar.material.uniforms.uOpacity.value = 0.45 * f; rune.material.opacity = f;
        glow.material.opacity = 0.6 * f;
        for (const { p } of pillars) p.material.uniforms.uOpacity.value = 0.3 * f;
      },
    },
  ];

  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 0, endFade: 0.8, avoid: 0.5,
    onEnd: () => {
      try { W.setAltarGlow?.(1); } catch (_) { /* */ }
      if (pObj) pObj.rotation.y = savedYaw;
      stage.dispose();
      try { onDone?.(); } catch (err) { console.error('[cinematic] blessing onDone', err); }
    },
  });
}

// ====================================================================== ending (~34 s, world mode)
export function buildEnding(C, onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = sfxOf(game);
  const vfx = game.vfx;
  const W = game.world || {};
  const vil = W.village || {};
  const pObj = game.player?.object;
  const stage = C.stage();
  const arena = W.bossArena?.position?.clone?.() || V(0, 15, -125);
  const tree = W.worldTree?.position?.clone?.() || V(215, 22, -215);
  const crown = W.worldTree?.crown?.clone?.() || V(tree.x, tree.y + 172, tree.z);
  const vC = vil.center?.clone?.() || V(0, 7, 137);
  const gy = (x, z) => { const h = C.groundY(x, z); return h > -1e8 ? h : 0; };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const savedPos = pObj ? pObj.position.clone() : null;
  const savedVis = pObj ? pObj.visible : true;
  const follow = () => { if (pObj && !pObj.visible) { const c = game.camera.position; pObj.position.set(c.x, gy(c.x, c.z), c.z); } };

  const mist = makeMist(stage, V(arena.x, arena.y - 2, arena.z), { count: 70, radius: 34, height: 18, size: 30 });
  mist.userData.u.uGrow.value = 1; mist.userData.u.uOpacity.value = 0.7;
  const motes = makeMotes(stage, V(arena.x, arena.y, arena.z), { count: 50, radius: 22, height: 6, size: 0.7, rise: 2.2, colA: 0xffe2a0, colB: 0xfff6dc });
  const spirits = SPIRITS.map((s) => { const sp = makeSpirit(stage, s.el, { size: 5, trailWidth: 2.6, trailLen: 70 }); sp.setOpacity(0); return sp; });
  spirits.forEach((sp, i) => {
    const a = (i / 5) * Math.PI * 2;
    sp.curve = new THREE.CatmullRomCurve3([
      V(arena.x + Math.cos(a) * 3, arena.y + 2, arena.z + Math.sin(a) * 3),
      V(arena.x + Math.cos(a) * 14, arena.y + 18 + i * 2, arena.z + Math.sin(a) * 14),
      V(arena.x + 60 + i * 8, arena.y + 70 + i * 6, arena.z - 30 - i * 6),
      V(crown.x - 70 + Math.cos(a) * 30, crown.y + 10 + i * 4, crown.z + 60 + Math.sin(a) * 30),
      V(crown.x + Math.cos(a) * 20, crown.y - 10, crown.z + Math.sin(a) * 20),
    ], false, 'centripetal');
  });
  const treeFlash = stage.sprite(0xfff4d0, 260, glowTex(), 0); treeFlash.position.copy(crown); stage.add(treeFlash);
  const lanterns = makeMotes(stage, V(vC.x, vC.y + 2, vC.z), { count: 70, radius: 30, height: 8, size: 1.1, rise: 1.6, colA: 0xff9a3a, colB: 0xffd27a });
  const ticks = [mist, motes, lanterns];
  const MIST_A = new THREE.Color(0x5a1f78), MIST_B = new THREE.Color(0xffe6b0);
  const fwPts = [];
  for (let i = 0; i < 10; i++) fwPts.push(V(vC.x + (Math.random() - 0.5) * 70, vC.y + 30 + Math.random() * 20, vC.z - 38 + (Math.random() - 0.5) * 30));
  const FW = [0xff6a1f, 0x7fe3ff, 0xc9a4ff, 0x8fffc1, 0xe0a85a, 0xffe08a];
  let T = 0, fwT = 0, fwI = 0;
  const firework = () => {
    const p = fwPts[fwI++ % fwPts.length], c = FW[fwI % FW.length], c2 = FW[(fwI + 2) % FW.length];
    // rising streak then the bloom
    vfx?.burst?.(V(p.x, p.y - 22, p.z), { count: 6, color: 0xfff0c0, speed: 26, dir: V(0, 1, 0), spread: 0.02, size: 0.5, sizeEnd: 0, life: 0.6, shape: 'spark', velocityStretch: 0.08 });
    C._later.push({ t: T + 0.55, fn: () => {
      vfx?.burst?.(p, { count: 120, color: [c, c2], speed: 16, speedVar: 3, spread: 1, size: 1.5, sizeEnd: 0, life: 1.8, lifeVar: 0.4, gravity: -3, drag: 1.1, shape: 'spark', velocityStretch: 0.05 });
      vfx?.burst?.(p, { count: 24, color: 0xffffff, speed: 7, spread: 1, size: 1.0, sizeEnd: 0, life: 1.2, shape: 'ember', gravity: -2, drag: 1 });
      sfx('explode_fire', { volume: 0.18, pitch: 1.6 + Math.random() * 0.4 });
    } });
  };
  C._later = [];

  const shots = [
    { // 0 the corruption lifts from the ruins
      duration: 6, ease: 'inOutSine', grade: 'golden', gradeDur: 4, fadeIn: 1,
      from: C.orbit(arena, { radius: 46, height: 22, from: 0.4, to: 1.1, radiusTo: 38, heightTo: 16 }), lookFrom: V(arena.x, arena.y + 4, arena.z), fov: 55,
      onStart() {
        if (pObj) pObj.visible = false;
        try { game.audio?.setMusic?.('ending'); } catch (_) { /* */ }
        ov.subtitle('고대 골렘의 핵이 정화되자, 공허의 안개가 걷히기 시작했다.', { dur: 5.4 });
        sfx('blessing', { volume: 0.7, pitch: 0.8 });
      },
      onUpdate(u) {
        follow();
        const k = EASE.inOutSine(u);
        mist.userData.u.uGrow.value = 1 - k; mist.userData.u.uColB.value.lerpColors(MIST_A, MIST_B, k);
        motes.userData.u.uOpacity.value = smoothstep(0.2, 0.6, u);
      },
    },
    { // 1 the five spirits rise and return to the World Tree
      duration: 7, ease: 'inOutSine',
      // camera rises above the ruins on the far side from the tree, looking along the spirits' flight to the crown
      from: (() => { const d = tmp2.set(arena.x - crown.x, 0, arena.z - crown.z).normalize(); return V(arena.x + d.x * 22 - d.z * 10, arena.y + 30, arena.z + d.z * 22 + d.x * 10); })(),
      to: (() => { const d = tmp2.set(arena.x - crown.x, 0, arena.z - crown.z).normalize(); return V(arena.x - d.x * 18 - d.z * 16, Math.max(arena.y + 52, crown.y - 20), arena.z - d.z * 18 + d.x * 16); })(),
      look: (e) => {
        const k = EASE.inOutCubic(clamp((e - 0.1) / 0.9, 0, 1));
        tmp.set(0, 0, 0); for (const sp of spirits) tmp.add(sp.obj.position); tmp.multiplyScalar(1 / spirits.length);
        if (e < 0.02) tmp.set(arena.x, arena.y + 10, arena.z);
        return tmp.lerp(crown, 0.25 + 0.45 * k);
      },
      fov: [58, 54],
      onStart() { ov.subtitle('다섯 정령은 기나긴 싸움을 마치고, 세계수 아스트라의 품으로 돌아갔다.', { dur: 6.4 }); sfx('spirit_chime', { volume: 0.9 }); },
      onUpdate(u, dt, e, tt) {
        follow();
        spirits.forEach((sp, i) => {
          const k = clamp((tt - i * 0.25) / 6.2, 0, 1);
          sp.curve.getPointAt(EASE.inOutSine(k), sp.obj.position);
          sp.k = Math.max(1, sp.obj.position.distanceTo(game.camera.position) / 38);
          sp.setOpacity(k <= 0 ? 0 : clamp(k * 10, 0, 1)); sp.update(T + i);
        });
        motes.userData.u.uOpacity.value = 1 - u;
      },
    },
    { // 2 the tree blossoms with light
      duration: 4.5, ease: 'inOutSine', grade: 'dusk', gradeDur: 4,
      from: V(60, 60, -40), to: V(70, 70, -55), lookFrom: V(crown.x, crown.y - 30, crown.z), lookTo: V(crown.x, crown.y - 10, crown.z), fov: [44, 40],
      onStart() { ov.title('세계에 다시 원소의 조화가 깃들었다', { style: 'low', dur: 4.3, fadeIn: 1, stagger: 0.06 }); },
      onUpdate(u, dt, e, tt) {
        follow();
        spirits.forEach((sp, i) => {
          const k = clamp((6.2 + tt - i * 0.25 - 0.6) / 6.2, 0, 1); // continue from beat 1 (approx)
          sp.curve.getPointAt(EASE.inOutSine(k), sp.obj.position);
          sp.k = Math.max(1, sp.obj.position.distanceTo(game.camera.position) / 38);
          sp.setOpacity(k >= 1 ? 0 : 1); sp.update(T + i);
        });
        const f = smoothstep(0.25, 0.55, u) * (1 - smoothstep(0.6, 1, u));
        treeFlash.material.opacity = f * 0.9;
        if (u > 0.35 && !this._c) { this._c = true; sfx('spirit_chime', { volume: 1, pitch: 0.7 }); vfx?.screenFlash?.(0xfff0c8, 0.35, 1.2); }
      },
    },
    { // 3 village festival at dusk: lanterns & fireworks
      duration: 5.5, ease: 'inOutSine', grade: 'dusk', gradeDur: 0, fadeIn: 1,
      from: V(vC.x - 9, vC.y + 6, vC.z + 21), to: V(vC.x - 5, vC.y + 9, vC.z + 17), lookFrom: V(vC.x, vC.y + 7, vC.z - 10), lookTo: V(vC.x, vC.y + 22, vC.z - 40), fov: [56, 62],
      onStart() {
        spirits.forEach((sp) => sp.setOpacity(0));
        ov.subtitle('바람결 마을에는 오랜만에 축제의 등불이 밝혀졌다.', { dur: 4.2 });
        lanterns.userData.u.uOpacity.value = 1;
      },
      onUpdate(u, dt) {
        follow();
        fwT -= dt; if (fwT <= 0 && u < 0.92) { fwT = 0.55 + Math.random() * 0.5; firework(); }
      },
    },
    { // 3b close on the plaza: villagers under the lanterns, fireworks overhead
      duration: 5, ease: 'inOutSine',
      from: V(vC.x + 7, vC.y + 2.2, vC.z + 9), to: V(vC.x + 4.5, vC.y + 2.8, vC.z + 6.5),
      lookFrom: V(vC.x - 1, vC.y + 1.8, vC.z - 2), lookTo: V(vC.x - 2, vC.y + 4.5, vC.z - 8), fov: [50, 54],
      onStart() { ov.subtitle('사람들은 새로운 수호자의 이름을 오래도록 노래했다.', { dur: 4.4 }); },
      onUpdate(u, dt) { follow(); fwT -= dt; if (fwT <= 0) { fwT = 0.6 + Math.random() * 0.5; firework(); } },
    },
    { // 4 credits over the night sky
      duration: 9, ease: 'inOutSine',
      from: V(vC.x - 5, vC.y + 9, vC.z + 17), to: V(vC.x - 3, vC.y + 12, vC.z + 15), lookFrom: V(vC.x, vC.y + 22, vC.z - 40), lookTo: V(vC.x, vC.y + 32, vC.z - 50), fov: 62,
      onStart() {
        ov.grade('linear-gradient(180deg, rgba(6,6,16,.55), rgba(6,6,16,.25) 50%, rgba(6,6,16,.6))', 1, 1.5);
        ov.credits([
          ['새로운 원소의 수호자', '바람결 마을의 젊은이'],
          ['함께한 이들', '촌장 노아 · 대마도사 엘리시아 · 검성 바르칸'],
          ['', '경비대장 로웬 · 상인 미라 · 꼬마 티모'],
          ['그리고', '이그니스 · 글라시아 · 볼타 · 실피아 · 테라곤'],
        ], { dur: 8.6, fadeIn: 1.4, fadeOut: 1.2 });
      },
      onUpdate(u, dt) { follow(); fwT -= dt; if (fwT <= 0) { fwT = 0.9 + Math.random() * 0.6; firework(); } },
    },
    { // 5 fin
      duration: 6.5, ease: 'inOutSine', fadeOut: 1.4,
      from: V(vC.x - 3, vC.y + 12, vC.z + 15), to: V(vC.x - 2, vC.y + 16, vC.z + 13), lookFrom: V(vC.x, vC.y + 32, vC.z - 50), lookTo: V(vC.x, vC.y + 46, vC.z - 56), fov: 62,
      onStart() { ov.title('끝', { sub: '— 그리고 새로운 모험은 계속된다 —', style: 'card', dur: 6.3, fadeIn: 1.4, fadeOut: 1.4 }); sfx('spirit_chime', { volume: 0.8, pitch: 0.8 }); },
      onUpdate(u, dt) { follow(); },
    },
  ];
  for (const s of shots) {
    const inner = s.onUpdate;
    s.onUpdate = function (u, dt, e, tt) {
      T += dt;
      for (const o of ticks) o.userData.tick(T);
      for (let i = C._later.length - 1; i >= 0; i--) if (C._later[i].t <= T) { const f = C._later[i].fn; C._later.splice(i, 1); try { f(); } catch (_) { /* */ } }
      inner?.call(this, u, dt, e, tt);
    };
  }
  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 3, endFade: 1.0,
    onEnd: () => {
      stage.dispose(); C._later = [];
      if (pObj) { if (savedPos) pObj.position.copy(savedPos); pObj.visible = savedVis; }
      try { game.audio?.setMusic?.(null); } catch (_) { /* */ }
      try { onDone?.(); } catch (err) { console.error('[cinematic] ending onDone', err); }
    },
  });
}
