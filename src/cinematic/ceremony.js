// 각인 의식 (class rite, DESIGN §5.6): only the spirits of the chosen class's elements descend — primaries big and in
// front, secondaries small and behind — and enter the hero on the altar dais. The ending lives in cinematic/finale.js.
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/utils.js';
import { CLASS_DEFS } from '../core/classes.js';
import { elColor, elName } from '../core/elements.js';
import { SPIRIT_OF, makeSpirit, makeRune, makePillar, glowTex } from './assets.js';

const sfxOf = (game) => (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };

// ====================================================================== class rite (~8.5 s, world mode)
export function buildClassRite(C, cls, onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = sfxOf(game);
  const vfx = game.vfx;
  const W = game.world || {};
  const vil = W.village || {};
  const pObj = game.player?.object;
  const def = CLASS_DEFS[cls] || CLASS_DEFS.mage;
  const prim = def.primary.slice(), sec = def.secondary.slice();
  const els = [...prim, ...sec];
  const isPrim = (el) => prim.includes(el);
  const mainCol = elColor(prim[0], 'hex');
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
    const p = makePillar(stage, elColor(el, 'hex'), isPrim(el) ? 0.6 : 0.32, isPrim(el) ? 34 : 22); p.position.copy(base);
    return { el, p, base, k: isPrim(el) ? 1 : 0.55 };
  });
  const heroPillar = makePillar(stage, mainCol, 0.9, 40); heroPillar.position.copy(hero);
  const rune = makeRune(stage, mainCol, 3); rune.position.set(hero.x, hero.y + 0.08, hero.z);
  const glow = stage.sprite(0xfff0c8, 3, glowTex(), 0); stage.add(glow); glow.position.copy(chest);
  // primaries: big, in front of the hero; secondaries: small, behind (they descend first and stay as an echo)
  const spirits = els.map((el, i) => {
    const p = isPrim(el);
    const sp = makeSpirit(stage, el, { size: p ? 1.5 : 0.75, trailWidth: p ? 0.8 : 0.4, trailLen: p ? 18 : 10 });
    sp.setOpacity(0);
    const j = p ? prim.indexOf(el) : sec.indexOf(el);
    const n = p ? prim.length : sec.length;
    sp.prim = p;
    sp.a0 = p ? (j - (n - 1) / 2) * 0.9 : Math.PI + (j - (n - 1) / 2) * 0.7;   // relative to the camera-facing direction (set below)
    sp.start = V(hero.x, hero.y + (p ? 26 : 20) + j * 2, hero.z);
    sp.delay = p ? 0.9 + j * 0.25 : j * 0.16;
    return sp;
  });
  const spiritPos = (sp, k, out) => {
    // spiral descent: radius → hero (primaries) or a halo behind the hero (secondaries)
    const a = facing + sp.a0 + k * Math.PI * (sp.prim ? 3.2 : 2.2), r0 = sp.prim ? 9 : 7, r1 = sp.prim ? 0 : 2.4;
    const r = r1 + (r0 - r1) * (1 - k) ** 1.2;
    const yEnd = sp.prim ? chest.y : chest.y + 1.6;
    return out.set(hero.x + Math.sin(a) * r, yEnd + (sp.start.y - yEnd) * (1 - EASE.inOutSine(k)), hero.z + Math.cos(a) * r);
  };
  const titleText = `${def.nameKo}의 각인`;
  const subText = `${def.title || ''} · ${prim.map(elName).join(' · ')}`;
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
        ov.subtitle(`${prim.map((e) => SPIRIT_OF[e]?.name || elName(e)).join('와 ')}… 그대의 부름에 정령들이 응답한다.`, { dur: 3.4 });
        for (const { base, el, k } of pillars) vfx?.burst?.(base, { count: Math.round(26 * k), color: [elColor(el, 'hex'), 0xffffff], speed: 6, dir: V(0, 1, 0), spread: 0.25, size: 0.3 * k, sizeEnd: 0, life: 1.2, shape: 'spark' });
      },
      onUpdate(u, dt) {
        tick(dt);
        for (const { p, k } of pillars) { p.material.uniforms.uOpacity.value = EASE.outCubic(u) * 0.42 * k; p.scale.y = (6 + 24 * EASE.outCubic(u)) * (0.6 + 0.4 * k); }
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
          const k = clamp((tt - sp.delay) / (sp.prim ? 1.9 : 1.8), 0, 1);
          spiritPos(sp, k, sp.obj.position);
          sp.setOpacity(k <= 0 || (k >= 1 && sp.prim) ? 0 : clamp(k * 8, 0, 1) * (sp.prim ? 1 : 0.7)); sp.update(T + i);
          if (k >= 1 && sp.prim && !sp.done) {
            sp.done = true;
            vfx?.burst?.(chest, { count: 30, color: [sp.col, 0xffffff], speed: 5, spread: 1, size: 0.2, sizeEnd: 0, life: 0.7, shape: 'spark', drag: 2 });
            sfx('spirit_chime', { volume: 0.5, pitch: 1 + i * 0.1 });
          }
        });
        for (const { p, k } of pillars) p.material.uniforms.uOpacity.value = 0.42 * k * (1 - u * 0.5);
        heroPillar.material.uniforms.uOpacity.value = smoothstep(0.3, 0.9, u) * 0.45; heroPillar.scale.y = 40 * smoothstep(0.3, 1, u) + 2;
        rune.material.opacity = smoothstep(0.2, 0.8, u); rune.scale.setScalar(1.5 + 2 * u);
        glow.material.opacity = smoothstep(0.4, 1, u) * 0.6; glow.scale.setScalar(1.5 + u * 2);
      },
    },
    { // absorbed: flash, orbit around the empowered hero
      duration: 2.6, ease: 'inOutSine', fadeOut: 0.7,
      from: C.orbit(hero, { radius: 3.6, height: 1.0, from: facing + 0.35, to: facing + 1.6, radiusTo: 5, heightTo: 2.2 }), look: () => tmp2.set(hero.x, hero.y + 1.2, hero.z), fov: [52, 56],
      onStart() {
        const c = mainCol;
        vfx?.screenFlash?.(c, 0.6, 0.6); vfx?.shake?.(0.2);
        vfx?.shockwave?.(hero, { color: c, radius: 7, duration: 0.8 });
        vfx?.burst?.(chest, { count: 70, color: els.map((x) => elColor(x, 'hex')), speed: 9, spread: 1, size: 0.3, sizeEnd: 0, life: 1.1, shape: 'spark', drag: 1.5 });
        vfx?.flash?.(chest, { color: c, intensity: 10, distance: 18, duration: 0.8 });
        sfx('blessing', { volume: 0.6, pitch: 1.3 });
        if (def.fantasyKo) ov.subtitle(def.fantasyKo, { dur: 2.4 });
        // the secondaries' echo sinks into the hero as well
        for (const sp of spirits) if (!sp.prim) sp.fadeOut = true;
      },
      onUpdate(u, dt) {
        tick(dt);
        const f = 1 - u;
        for (const sp of spirits) if (sp.fadeOut) { spiritPos(sp, 1, sp.obj.position); sp.obj.position.lerp(chest, EASE.inOutSine(u)); sp.setOpacity(0.7 * f); sp.update(T); }
        heroPillar.material.uniforms.uOpacity.value = 0.45 * f; rune.material.opacity = f;
        glow.material.opacity = 0.6 * f;
        for (const { p, k } of pillars) p.material.uniforms.uOpacity.value = 0.3 * k * f;
      },
    },
  ];

  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 0, endFade: 0.8, avoid: 0.5,
    onEnd: () => {
      try { W.setAltarGlow?.(1); } catch (_) { /* */ }
      if (pObj) pObj.rotation.y = savedYaw;
      stage.dispose();
      try { onDone?.(); } catch (err) { console.error('[cinematic] class rite onDone', err); }
    },
  });
}

