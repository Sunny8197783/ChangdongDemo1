// Act cinematics (CONTRACT §16): one parametric spirit-freed template keyed by element, one parametric boss intro with
// per-boss camera data, and the gameplay-mode phase transition. Everything is skippable and restores state.
import { safeFlash } from './flash.js';
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/utils.js';
import { elColor } from '../core/elements.js';
import { SPIRIT_OF, makeSpirit, makeRune, makePillar, makeMotes, glowTex } from './assets.js';
import { SPIRIT_FREED } from '../story/script3.js';

/** Per-boss camera data (P0 template; bespoke shots are P1). h = focus height, r = orbit radius, a0 = start angle,
 *  sweep = orbit sweep, fov = [wide, close], voice = sfx, grade = cutscene grade. */
export const BOSS_CAM = {
  golem: { h: 7, r: 24, a0: 0.4, sweep: 0.9, fov: [56, 44], voice: 'boss_roar', grade: 'dusk' },
  hydra: { h: 13, r: 32, a0: 2.6, sweep: 1.1, fov: [58, 46], voice: 'hydra_roar', grade: 'dusk' },
  nox: { h: 1.9, r: 8, a0: 1.2, sweep: 1.4, fov: [50, 38], voice: 'nox_voice', grade: 'void' },
  treant: { h: 15, r: 32, a0: 0.8, sweep: 0.8, fov: [60, 46], voice: 'treant_groan', grade: 'dusk' },
  kalis: { h: 2.0, r: 9, a0: 3.4, sweep: 1.6, fov: [50, 36], voice: 'kalis_voice', grade: 'golden' },
  nidhoggra: { h: 24, r: 66, a0: 2.2, sweep: 0.7, fov: [64, 52], voice: 'wyrm_roar', grade: 'void' },
};
const DEFAULT_CAM = { h: 5, r: 18, a0: 0.5, sweep: 1, fov: [56, 44], voice: 'boss_roar', grade: 'dusk' };

const sfxOf = (game) => (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };
const bossOf = (game, id) => { const b = game.enemies?.boss; return b && (b.bossId === id || b.id === id) ? b : null; };

// ====================================================================== boss intro (≈ 7 s, world mode)
/**
 * playBossIntro(id, onDone, {spawn}): fade to black, `await enemies.prewarmBoss(id)`, call spawn() (story's), then the
 * establishing orbit → push-in with the title card → a glide back to the gameplay camera.
 */
export function buildBossIntro(C, id, onDone, opts = {}) {
  const { game, ov } = C;
  const E = game.enemies;
  const cam = game.camera;
  const savedCam = cam.position.clone();
  const savedLook = new THREE.Vector3(); cam.getWorldDirection(savedLook); savedLook.multiplyScalar(20).add(savedCam);
  const prevState = game.state;
  let finished = false, playH = null;
  const finishAll = () => { if (finished) return; finished = true; try { onDone?.(); } catch (err) { console.error('[cinematic] boss intro onDone', err); } };
  const begin = () => {
    let b = bossOf(game, id);
    const go = () => {
      b = bossOf(game, id) || b;
      try { playH = shots(b); return playH; } catch (err) { console.error('[cinematic] boss intro', err); restore(); finishAll(); return null; }
    };
    if (!b && opts.spawn) {
      let r = null;
      try { r = opts.spawn(); } catch (err) { console.error('[cinematic] spawn', err); }
      if (r && typeof r.then === 'function') { r.then(go, () => { restore(); finishAll(); }); return null; }
    }
    return go();
  };
  const restore = () => {
    game.input?.unlock?.('bossIntro');
    if (game.state === 'cutscene' && !C.active()) game.setState?.(prevState === 'cutscene' ? 'playing' : prevState);
    ov.fade(0, 0.5);
  };
  // fade + freeze while the model compiles
  ov.fade(1, 0.35);
  game.input?.lock?.('bossIntro');
  if (game.state === 'playing') game.setState?.('cutscene');
  const warm = (() => { try { return E?.prewarmBoss?.(id); } catch (_) { return null; } })();
  if (warm && typeof warm.then === 'function') {
    let started = false;
    const start = () => { if (started) return; started = true; game.input?.unlock?.('bossIntro'); begin(); };
    let cancelled = false;
    const startOk = () => { if (cancelled) return; if (opts.valid && !opts.valid()) { restore(); finishAll(); return; } start(); };
    warm.then(startOk, startOk);
    return { pending: true, stop() { if (cancelled) return; cancelled = true; if (playH) { try { playH.stop(); } catch (_) { /* */ } } else restore(); finishAll(); } };
  }
  game.input?.unlock?.('bossIntro');
  return begin();

  function shots(b) {
    const D = BOSS_CAM[id] || DEFAULT_CAM;
    const sfx = sfxOf(game);
    const vfx = game.vfx;
    const A = game.world?.bossArenas?.[id] || (id === 'golem' ? game.world?.bossArena : null);
    const center = (b?.object?.position || A?.position || savedCam).clone();
    const focus = new THREE.Vector3(center.x, center.y + D.h, center.z);
    // the establishing orbit starts on the player's side of the arena
    const pp = game.player?.object?.position || savedCam;
    const side = Math.atan2(pp.x - center.x, pp.z - center.z);
    const a0 = side + D.a0 * 0.35;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    const payload = b?.spawnPayload?.() || { name: b?.name || '', title: b?.title || '', sub: b?.sub || '' };
    const list = [
      { // 0 — establishing orbit
        duration: 2.8, ease: 'inOutSine', fadeIn: 0.7, grade: D.grade, gradeDur: 1.2,
        from: C.orbit(center, { radius: D.r * 1.35, height: D.h * 1.25 + 3, from: a0 - D.sweep * 0.5, to: a0, radiusTo: D.r * 1.15, heightTo: D.h * 0.9 + 2 }),
        look: (e) => tmp.copy(center).setY(center.y + D.h * (0.45 + 0.3 * e)), fov: [D.fov[0], D.fov[0] - 4],
        onStart() { sfx(D.voice, { volume: 1.1 }); sfx('boss_roar', { volume: 0.8, pitch: id === 'nox' || id === 'kalis' ? 1.3 : 0.7 }); vfx?.shake?.(0.3); },
      },
      { // 1 — push-in, low angle, the title card
        duration: 3.0, ease: 'outCubic',
        from: () => tmp2.set(center.x + Math.sin(a0) * D.r * 0.85, center.y + D.h * 0.35 + 0.6, center.z + Math.cos(a0) * D.r * 0.85),
        to: () => tmp2.set(center.x + Math.sin(a0 + 0.25) * D.r * 0.55, center.y + D.h * 0.45 + 0.4, center.z + Math.cos(a0 + 0.25) * D.r * 0.55),
        look: () => tmp.copy(focus), fov: [D.fov[1] + 4, D.fov[1]],
        onStart() {
          ov.title(payload.name || '', { sub: [payload.title, payload.sub].filter(Boolean).join(' · '), style: 'card', dur: 3.0, fadeIn: 0.7, fadeOut: 0.6, stagger: 0.05 });
          sfx('cinematic_whoosh', { volume: 0.7, pitch: 0.8 });
          try { game.post?.pulse?.(0.4, 0.4); } catch (_) { /* */ }
        },
      },
      { // 2 — glide back to where the player was looking
        duration: 1.3, ease: 'inOutCubic', letterbox: false,
        from: () => tmp2.set(center.x + Math.sin(a0 + 0.25) * D.r * 0.55, center.y + D.h * 0.45 + 0.4, center.z + Math.cos(a0 + 0.25) * D.r * 0.55), to: savedCam,
        lookFrom: focus, lookTo: savedLook, fov: [D.fov[1], cam.fov],
      },
    ];
    return C.play(list, {
      mode: 'world', letterbox: true, film: false, skippable: true, hintTime: 2, endFade: 0.3, endState: 'playing',
      onEnd: () => {
        cam.position.copy(savedCam); cam.lookAt(savedLook);
        if (game.state === 'cutscene') game.setState?.('playing');
        finishAll();
      },
    });
  }
}

// ====================================================================== spirit freed (≈ 7 s, world mode)
export function buildSpiritFreed(C, element, onDone) {
  const { game, ov, V, EASE } = C;
  const sfx = sfxOf(game);
  const vfx = game.vfx;
  const meta = SPIRIT_OF[element] || { name: element, title: '', css: '#fff' };
  const txt = SPIRIT_FREED[element] || { title: `${meta.name} 해방`, sub: '' };
  const col = elColor(element, 'hex');
  const stage = C.stage();
  const pObj = game.player?.object;
  const hero = pObj ? pObj.position.clone() : V(0, 0, 0);
  const boss = { water: 'hydra', shadow: 'nox', nature: 'treant', light: 'kalis' }[element];
  const A = game.world?.bossArenas?.[boss];
  const src = A?.position ? A.position.clone() : hero.clone().add(V(6, 0, 6));
  const gy = C.groundY(src.x, src.z); if (gy > -1e8) src.y = Math.max(src.y, gy);
  if (element === 'light') { try { game.enemies?.prewarmBoss?.('nidhoggra'); } catch (_) { /* */ } }   // early prewarm (DESIGN §8.6)
  const spirit = makeSpirit(stage, element, { size: 3.2, trailWidth: 1.4, trailLen: 34 }); spirit.setOpacity(0);
  const rune = makeRune(stage, col, 5); rune.position.set(src.x, src.y + 0.12, src.z);
  const pillar = makePillar(stage, col, 1.2, 40); pillar.position.copy(src);
  const motes = makeMotes(stage, V(src.x, src.y, src.z), { count: 40, radius: 10, height: 6, size: 0.8, rise: 1.6, colA: col, colB: 0xffffff });
  const halo = stage.sprite(col, 10, glowTex(), 0); stage.add(halo);
  const label = ov.label(meta.name, meta.title, meta.css);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const chest = V(hero.x, hero.y + 1.2, hero.z);
  let T = 0;
  const tick = (dt) => { T += dt; motes.userData.tick(T); pillar.material.uniforms.uTime.value = T; rune.rotation.y = T * 0.8; };
  const spiralUp = (k, out) => { const a = k * Math.PI * 4, r = 3 + k * 2; return out.set(src.x + Math.cos(a) * r, src.y + 1 + k * 7, src.z + Math.sin(a) * r); };
  const dx = hero.x - src.x, dz = hero.z - src.z, dl = Math.hypot(dx, dz) || 1;
  const side = V(-dz / dl, 0, dx / dl);
  const placeLabel = () => {
    tmp.copy(spirit.obj.position); tmp.y += 2.6; tmp.project(game.camera);
    label.place((tmp.x + 1) * innerWidth * 0.5, (1 - tmp.y) * innerHeight * 0.5);
  };
  const shots = [
    { // 0 — the spirit rises out of the defeated boss's light
      duration: 3.4, ease: 'inOutSine', fadeIn: 0.5, grade: 'golden', gradeDur: 1.5,
      from: V(src.x + side.x * 14 - dx / dl * 6, src.y + 4, src.z + side.z * 14 - dz / dl * 6), to: V(src.x + side.x * 11 - dx / dl * 4, src.y + 7, src.z + side.z * 11 - dz / dl * 4),
      look: () => tmp2.copy(spirit.obj.position), fov: [54, 48],
      onStart() { sfx('blessing', { volume: 0.8 }); sfx('spirit_chime', { volume: 0.9 }); vfx?.burst?.(src, { count: 60, color: [col, 0xffffff], speed: 8, dir: V(0, 1, 0), spread: 0.4, size: 0.4, sizeEnd: 0, life: 1.3, shape: 'spark' }); },
      onUpdate(u, dt) {
        tick(dt);
        spiralUp(EASE.outCubic(u), spirit.obj.position);
        spirit.setOpacity(smoothstep(0, 0.2, u)); spirit.update(T);
        rune.material.opacity = smoothstep(0, 0.4, u) * 0.95; rune.scale.setScalar(2 + u * 4);
        pillar.material.uniforms.uOpacity.value = 0.45 * smoothstep(0, 0.3, u); pillar.scale.y = 8 + u * 32;
        motes.userData.u.uOpacity.value = smoothstep(0, 0.4, u);
        halo.position.copy(spirit.obj.position); halo.material.opacity = 0.5 * smoothstep(0.2, 0.6, u);
        label.show(u > 0.45 ? 1 : 0); placeLabel();
      },
    },
    { // 1 — the spirit flies into the hero; the title
      duration: 3.4, ease: 'inOutSine', fadeOut: 0.6,
      from: C.orbit(hero, { radius: 5.5, height: 1.6, from: Math.atan2(-dx, -dz) + 0.6, to: Math.atan2(-dx, -dz) + 1.5, radiusTo: 4.2, heightTo: 2.2 }),
      look: () => tmp2.set(hero.x, hero.y + 1.4, hero.z), fov: [52, 48],
      onStart() {
        ov.title(txt.title, { sub: txt.sub, style: 'side', dur: 3.3, fadeIn: 0.8, stagger: 0.06 });
        label.show(0);
      },
      onUpdate(u, dt) {
        tick(dt);
        const k = EASE.inOutSine(clamp(u / 0.6, 0, 1));
        spiralUp(1, tmp); spirit.obj.position.lerpVectors(tmp, chest, k);
        spirit.setOpacity(k < 1 ? 1 : 0); spirit.update(T);
        halo.position.copy(spirit.obj.position); halo.material.opacity = 0.5 * (1 - k);
        pillar.material.uniforms.uOpacity.value = 0.45 * (1 - u);
        rune.material.opacity = 0.95 * (1 - u);
        if (k >= 1 && !this._f) {
          this._f = true;
          safeFlash(vfx, col, 0.45, 0.6); vfx?.shockwave?.(hero, { color: col, radius: 8, duration: 0.8 });
          vfx?.burst?.(chest, { count: 60, color: [col, 0xffffff], speed: 8, spread: 1, size: 0.3, sizeEnd: 0, life: 1, shape: 'spark', drag: 1.5 });
          sfx('blessing', { volume: 0.7, pitch: 1.25 });
        }
      },
    },
  ];
  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 2, endFade: 0.7,
    onEnd: () => { label.remove(); stage.dispose(); try { onDone?.(); } catch (err) { console.error('[cinematic] spirit onDone', err); } },
  });
}

// ====================================================================== boss phase transition (≤ 4 s, gameplay mode)
export function buildPhase(C, id, phase, onDone) {
  const { game, ov } = C;
  const b = bossOf(game, id);
  if (!b?.object) { onDone?.(); return null; }
  const D = BOSS_CAM[id] || DEFAULT_CAM;
  const sfx = sfxOf(game);
  const c = b.object.position;
  const name = b.phases?.[phase - 1]?.name || '';
  const pp = game.player?.object?.position || c;
  const a0 = Math.atan2(pp.x - c.x, pp.z - c.z);
  const focus = new THREE.Vector3(), tmp = new THREE.Vector3();
  const f = () => focus.set(c.x, c.y + D.h * 0.8, c.z);
  const shots = [
    { // orbit the boss in slow motion with the phase name
      duration: 2.4, ease: 'inOutSine', timeScale: 0.3,
      from: C.orbit(() => c, { radius: D.r * 0.9, height: D.h * 0.6 + 2, from: a0 - 0.3, to: a0 + 0.5 * D.sweep, radiusTo: D.r * 0.75, heightTo: D.h * 0.8 + 2 }),
      look: () => f(), fov: [D.fov[0], D.fov[1] + 6],
      onStart() {
        if (name) ov.title(name, { sub: `${phase}막`, style: 'low', dur: 2.6, fadeIn: 0.5, fadeOut: 0.5, stagger: 0.04 });
        sfx(D.voice, { volume: 1 }); sfx('cinematic_whoosh', { volume: 0.6, pitch: 0.9 });
        try { game.post?.pulse?.(0.5, 0.5); } catch (_) { /* */ }
        game.vfx?.shake?.(0.35);
      },
    },
    { // blend back into the gameplay camera
      duration: 0.9, ease: 'inOutSine', timeScale: 1, letterbox: false, blendToGame: true,
      from: () => tmp.set(c.x + Math.sin(a0 + 0.5 * D.sweep) * D.r * 0.75, c.y + D.h * 0.8 + 2, c.z + Math.cos(a0 + 0.5 * D.sweep) * D.r * 0.75), look: () => f(),
    },
  ];
  return C.play(shots, {
    mode: 'gameplay', letterbox: true, film: false, skippable: true, hintTime: 0, hideHud: true,
    onEnd: () => { try { onDone?.(); } catch (err) { console.error('[cinematic] phase onDone', err); } },
  });
}
