// 「아케인 와일즈」 lore intro (~78 s, world mode). Beats:
//  0 starfield + chime, "태초에…"            1 dawn rise toward 세계수 아스트라
//  2 five spirit lights spiral out, named   3 flyover of 솔레아 평원 "원소의 대륙, 에테리아"
//  4 void rift + mist over the northern ruins, colossus silhouette with red eyes
//  5 the first guardians' seal (5-colour beams, flash, rune circle)
//  6 present day: seal cracks, monsters gather (camp bonfire)
//  7 sunrise over 바람결 마을, descend to the hero, elemental mark glows  8 title card
import * as THREE from 'three';
import { ELEMENT_COLORS, clamp, smoothstep } from '../core/utils.js';
import { SPIRITS, makeSpirit, makeMist, makeColossus, makeRune, makeMotes, riftTex, glowTex, starTex } from './assets.js';

export function buildIntro(C, onDone) {
  const { game, ov, V, groundY, EASE } = C;
  const W = game.world || {};
  const audio = game.audio;
  const sfx = (n, o) => { try { audio?.play?.(n, o); } catch (_) { /* */ } };
  const vfx = game.vfx;
  const stage = C.stage();

  // ---------------------------------------------------------------- geography (with fallbacks)
  const tree = W.worldTree?.position?.clone?.() || V(215, 22, -215);
  const treeH = W.worldTree?.height || 200;
  const crown = W.worldTree?.crown?.clone?.() || V(tree.x, tree.y + treeH * 0.86, tree.z);
  const arena = W.bossArena?.position?.clone?.() || V(0, 15, -125);
  const camps = W.camps || [];
  const camp = camps.find((c) => c.id === 'camp2') || camps[0] || { position: V(10, 4, -55) };
  const campP = camp.position.clone();
  const vil = W.village || {};
  const home = vil.playerHome?.clone?.() || V(-9, 7, 147);
  const vCenter = vil.center?.clone?.() || V(0, 7, 137);
  const gy = (x, z) => { const h = groundY(x, z); return h > -1e8 ? h : 0; };
  const G = (x, dy, z) => V(x, gy(x, z) + dy, z);

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const _head = new THREE.Vector3();
  const _placed = [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0 }));
  const player = game.player;
  const pObj = player?.object;
  const followGround = () => {
    // keep the (hidden) hero under the camera so flora/shadows/grass stay focused on what we film
    if (!pObj || pObj.visible) return;
    const c = game.camera.position; pObj.position.set(c.x, gy(c.x, c.z), c.z);
  };

  // ---------------------------------------------------------------- set pieces
  // spirits: spiral out of the crown, sweep past the camera toward the valley
  const spirits = SPIRITS.map((s) => {
    const sp = makeSpirit(stage, s.el, { size: 13, trailWidth: 6, trailLen: 140 });
    sp.setOpacity(0); sp.meta = s;
    sp.label = ov.label(s.name, s.title, s.css);
    return sp;
  });
  const camB2a = V(14, 38, 16), camB2b = V(2, 46, 26);
  const ORBIT_R = 88;
  const westEnd = (i) => V(-70 - (i % 3) * 22, 26 + i * 6, -40 + i * 22);
  // beat 2 spirit motion: emerge & orbit the crown (named one by one), then streak overhead into the plains
  function spiritAt(sp, i, tt, out) {
    const em = 0.3 + i * 0.95, go = 6.0 + i * 0.28;
    if (tt < go || !sp.curve) {
      const k = clamp((tt - em) / 1.6, 0, 1);
      const a = sp.a0 + (tt - em) * 0.55;
      const r = 26 + (ORBIT_R - 26) * EASE.outCubic(k);
      out.set(crown.x + Math.cos(a) * r, crown.y + 6 + Math.sin(tt * 0.9 + i) * 8 + k * 10, crown.z + Math.sin(a) * r);
      if (tt >= go - 0.05 && !sp.curve) {
        const dir = tmp2.copy(camB2b).sub(crown).normalize();
        const right = V(-dir.z, 0, dir.x).normalize();
        sp.curve = new THREE.CatmullRomCurve3([out.clone(),
          crown.clone().addScaledVector(dir, 140).addScaledVector(right, (i - 2) * 30).add(V(0, 30 + i * 5, 0)),
          camB2b.clone().addScaledVector(dir, -70).addScaledVector(right, (i - 2) * 22).add(V(0, 34 + (i % 2) * 14, 0)),
          westEnd(i)], false, 'centripetal');
        sp.goT = tt;
      }
      return out;
    }
    const u = clamp((tt - sp.goT) / 4.4, 0, 1);
    return sp.curve.getPointAt(EASE.inOutSine(u), out);
  }

  // void rift + mist + colossus (built up-front, hidden until beat 4)
  const riftPos = V(arena.x, arena.y + 78, arena.z - 30);
  const riftMat = stage.mat(new THREE.SpriteMaterial({ map: riftTex(), color: 0xe8b0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  const rift = new THREE.Sprite(riftMat); rift.position.copy(riftPos); rift.scale.set(30, 70, 1); rift.renderOrder = 14; stage.add(rift);
  const riftHalo = stage.sprite(0x8a2cff, 120, glowTex(), 0); riftHalo.position.copy(riftPos); stage.add(riftHalo);
  const mist = makeMist(stage, V(arena.x, arena.y - 4, arena.z - 10), { count: 110, radius: 55, height: 40, size: 48 });
  const mistTop = makeMist(stage, V(riftPos.x, riftPos.y - 46, riftPos.z), { count: 40, radius: 18, height: 46, size: 34, colA: 0x12061c, colB: 0x7a2aa0 });
  const colossus = makeColossus(stage, 1.35); colossus.position.set(arena.x, arena.y - 40, arena.z - 8); colossus.visible = false;
  const backlight = stage.sprite(0x7a2cc0, 95, glowTex(), 0); backlight.position.set(arena.x, arena.y + 20, arena.z - 40); stage.add(backlight);
  const seal = makeRune(stage, 0xffe6a8, 60); seal.position.set(arena.x, arena.y + 1.2, arena.z);
  const sealRing = makeRune(stage, 0xbfe0ff, 30); sealRing.position.set(arena.x, arena.y + 55, arena.z); sealRing.rotation.x = 0;
  const leak = { em: null };
  // mark on the hero's hand
  const mark = stage.sprite(0xffe2a0, 0.9, starTex(), 0); stage.add(mark);
  const markHalo = stage.sprite(0xffb050, 2.2, glowTex(), 0); stage.add(markHalo);
  const markMotes = SPIRITS.map((s) => { const m = stage.sprite(ELEMENT_COLORS[s.el], 0.35, glowTex(), 0); stage.add(m); return m; });
  // village dawn motes (fireflies / pollen)
  const motes = makeMotes(stage, V(vCenter.x, vCenter.y, vCenter.z + 4), { count: 60, radius: 34, height: 14, size: 0.9, rise: 0.4, colA: 0xffd890, colB: 0xfff4d0 });

  const ticks = [mist, mistTop, motes];
  let T = 0; // intro clock

  const handPos = (out) => {
    if (!pObj) return out.copy(home).setY(home.y + 1);
    pObj.updateMatrixWorld();
    out.set(0.42, 0.98, 0.18).applyMatrix4(pObj.matrixWorld);
    return out;
  };
  const heroFront = (dist, h, sideOff = 0, out = new THREE.Vector3()) => {
    const yaw = pObj ? pObj.rotation.y : 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const p = pObj ? pObj.position : home;
    return out.set(p.x + fx * dist + fz * sideOff, p.y + h, p.z + fz * dist - fx * sideOff);
  };

  // ---------------------------------------------------------------- shots
  const shots = [];
  // ---- 0: starfield, "태초에…"
  shots.push({
    duration: 7.5, letterbox: true,
    from: V(70, 18, -30), lookFrom: V(215, 150, -215), grade: 'night', gradeDur: 0,
    onStart() {
      ov.setFade(1); ov.fade(0, 2.2); ov.stars(1); ov.starsZoom(0);
      try { audio?.setMusic?.('intro'); } catch (_) { /* */ }
      sfx('spirit_chime', { volume: 0.9 });
    },
    cues: [{ at: 1.6, title: { text: '태초에, 세계수 아스트라가 있었다', sub: '별빛을 머금은 그 뿌리는 대륙의 모든 생명에 닿아 있었다', dur: 7.4, fadeIn: 1.6, stagger: 0.09 } }],
    onUpdate(u) { ov.starsZoom(u); },
  });
  // ---- 1: dawn rise toward the World Tree
  shots.push({
    duration: 9, ease: 'inOutSine', grade: 'dawn', gradeDur: 0,
    from: V(-26, 12, 74), to: camB2a.clone(), lookFrom: V(tree.x, tree.y + treeH * 0.45, tree.z), lookTo: V(crown.x, crown.y - 20, crown.z), fov: [50, 44],
    onStart() { ov.stars(0); sfx('cinematic_whoosh', { volume: 0.5 }); },
    onUpdate(u) { ov.stars(clamp(1 - u * 1.6, 0, 1)); ov.starsZoom(1 + u); followGround(); },
  });
  // ---- 2: five spirit lights
  shots.push({
    duration: 11, ease: 'inOutSine',
    from: camB2a.clone(), to: camB2b.clone(), fov: [44, 62],
    look: (e, s2, tt) => tmp.lerpVectors(V(crown.x, crown.y - 10, crown.z), V(-80, 14, -6), EASE.inOutSine(clamp((tt - 6.2) / 4.2, 0, 1))),
    onStart() {
      spirits.forEach((sp, i) => { sp.setOpacity(0); sp.curve = null; sp.a0 = (i / 5) * Math.PI * 2 + 2.2; });
      sfx('spirit_chime', { volume: 1, pitch: 1.2 });
      ov.subtitle('그 품에서, 다섯 원소의 정령이 태어났다.', { dur: 5.2 });
    },
    cues: [
      { at: 6.0, call: () => sfx('cinematic_whoosh', { volume: 0.6, pitch: 1.1 }) },
      { at: 6.4, subtitle: { text: '정령들은 대지에 숨을 불어넣고, 세상은 빛으로 가득 찼다.', dur: 4.4 } },
    ],
    onUpdate(u, dt, e, tt) {
      followGround();
      const cam = game.camera;
      let nPlaced = 0;
      spirits.forEach((sp, i) => {
        const em = 0.3 + i * 0.95;
        if (tt < em) { sp.setOpacity(0); sp.label.show(0); return; }
        spiritAt(sp, i, tt, sp.obj.position);
        const fin = sp.goT != null ? clamp((tt - sp.goT) / 4.4, 0, 1) : 0;
        sp.setOpacity(clamp((tt - em) * 1.6, 0, 1) * clamp((1 - fin) * 5, 0, 1));
        sp.k = Math.max(1, sp.obj.position.distanceTo(cam.position) / 95);
        sp.update(T + i);
        // name: shown while it first circles the crown
        const show = tt > em + 0.5 && tt < em + 1.75 ? 1 : 0;
        if (show && !sp.named) { sp.named = true; sfx('spirit_chime', { volume: 0.55, pitch: 0.9 + i * 0.12 }); }
        tmp2.copy(sp.obj.position).project(cam);
        const vis = tmp2.z < 1 && Math.abs(tmp2.x) < 0.9 && Math.abs(tmp2.y) < 0.8;
        let lx = (tmp2.x * 0.5 + 0.5) * innerWidth, ly = (-tmp2.y * 0.5 + 0.5) * innerHeight + 58;
        ly = Math.min(ly, innerHeight * 0.68);            // stay above the subtitle band
        if (show && vis) {
          // never on top of another visible name this frame
          for (let k = 0; k < nPlaced; k++) {
            const r = _placed[k];
            if (Math.abs(r.x - lx) < 170 && Math.abs(r.y - ly) < 52) ly = Math.max(60, r.y - 56);
          }
          _placed[nPlaced].x = lx; _placed[nPlaced].y = ly; nPlaced++;
        }
        sp.label.place(lx, ly);
        sp.label.show(show && vis ? 1 : 0);
      });
    },
    onEnd() { spirits.forEach((sp) => { sp.label.show(0); sp.setOpacity(0); sp.k = 1; }); },
  });
  // ---- 3: flyover of 솔레아 평원
  const flyA = V(-92, 44, -72), flyB = V(-22, 34, 18);
  shots.push({
    duration: 10.5, ease: 'inOutSine', grade: 'golden', gradeDur: 3, fadeIn: 0,
    from: flyA, to: flyB, lookFrom: V(10, 10, 30), lookTo: V(30, 8, 118), fov: [58, 62], roll: (e) => Math.sin(e * Math.PI) * -0.05,
    onStart() {
      sfx('cinematic_whoosh', { volume: 0.6 });
      ov.title('원소의 대륙, 에테리아', { sub: '솔레아 평원', style: 'lore', dur: 7.6, fadeIn: 1.3, stagger: 0.08 });
      // spirits race ahead of the camera, then split off in five directions
      spirits.forEach((sp, i) => {
        const dirA = (i / 5) * Math.PI * 2;
        sp.fly = { a: dirA, off: V((i - 2) * 6, 3 + (i % 2) * 4, 0) }; sp.k = 0.3;
      });
    },
    onUpdate(u, dt, e) {
      followGround();
      const cam = game.camera;
      cam.getWorldDirection(tmp2);
      spirits.forEach((sp, i) => {
        const lead = 16 + u * 30, split = smoothstep(0.35, 1, u);
        sp.obj.position.copy(cam.position).addScaledVector(tmp2, lead);
        sp.obj.position.x += sp.fly.off.x + Math.cos(sp.fly.a) * split * 60;
        sp.obj.position.z += Math.sin(sp.fly.a) * split * 60;
        sp.obj.position.y += sp.fly.off.y - 6 + Math.sin(T * 2 + i) * 1.2 + split * (i % 2 ? 18 : -2);
        sp.setOpacity(clamp(u * 5, 0, 1) * clamp((1 - u) * 3, 0, 1)); sp.update(T + i);
      });
    },
    onEnd() { spirits.forEach((sp) => { sp.setOpacity(0); sp.k = 1; }); },
  });
  // ---- 4: the void — rift, mist, colossus
  shots.push({
    duration: 11.5, ease: 'inOutSine', grade: 'void', gradeDur: 2.5,
    from: V(14, 20, -62), to: V(6, 30, -80), lookFrom: V(0, 34, -130), lookTo: V(0, 48, -140), fov: [58, 50],
    onStart() {
      ov.title('천 년 전, 별의 틈에서 공허의 안개가 쏟아져', { sub: '대륙을 집어삼켰다…', style: 'low', dur: 8.6, fadeIn: 1.2, stagger: 0.06 });
      ov.grade('radial-gradient(ellipse at 50% 30%, rgba(80,20,110,.0) 0%, rgba(40,5,60,.35) 60%, rgba(10,0,20,.6) 100%)', 1, 2.5);
      sfx('cinematic_whoosh', { volume: 0.7, pitch: 0.6 });
      leak.fall = stage.keep(vfx?.emitter?.({ position: riftPos.clone().setY(riftPos.y - 20), rate: 22, count: 1, color: [0x1a0826, 0x4a1a66], speed: 6, speedVar: 3, dir: V(0, -1, 0), spread: 0.25, size: 9, sizeEnd: 22, life: 3.2, shape: 'smoke', additive: false, drag: 0.4, alpha: 0.75 }));
      leak.spark = stage.keep(vfx?.emitter?.({ position: riftPos.clone(), rate: 16, count: 1, color: [0xd090ff, 0xffffff], speed: 10, spread: 1, size: 0.9, sizeEnd: 0, life: 1.6, shape: 'spark', drag: 0.5 }));
      colossus.visible = true;
    },
    cues: [{ at: 5.2, call: () => { sfx('boss_roar', { volume: 0.55, pitch: 0.7 }); game.vfx?.shake?.(0.25); } }],
    onUpdate(u) {
      followGround();
      const open = EASE.outCubic(clamp(u * 2.2, 0, 1));
      riftMat.opacity = open; rift.scale.set(12 + 26 * open, 30 + 50 * open, 1); riftHalo.material.opacity = 0.5 * open;
      rift.material.rotation = Math.sin(T * 0.7) * 0.03;
      mistTop.userData.u.uGrow.value = clamp(u * 1.8, 0, 1);
      mist.userData.u.uGrow.value = clamp(u * 1.3 - 0.1, 0, 1);
      const rise = EASE.outCubic(clamp((u - 0.3) / 0.6, 0, 1));
      colossus.position.y = arena.y - 40 + rise * 46; backlight.material.opacity = 0.75 * rise;
      const eyes = clamp((u - 0.45) * 4, 0, 1) * (0.85 + Math.sin(T * 9) * 0.15);
      for (const s of colossus.userData.eyes) s.material.opacity = eyes;
    },
  });
  // ---- 5: the first guardians' seal
  const beamFrom = SPIRITS.map((s, i) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return G(arena.x + Math.cos(a) * 46, 2, arena.z + Math.sin(a) * 46); });
  const sealTop = V(arena.x, arena.y + 55, arena.z);
  shots.push({
    duration: 8.5, ease: 'inOutSine',
    from: V(48, 44, -62), to: V(36, 52, -70), lookFrom: V(0, 26, -125), lookTo: V(0, 30, -125), fov: [56, 60],
    onStart() {
      ov.subtitle('최초의 원소 수호자들은 다섯 정령과 계약을 맺고 —', { dur: 3.6 });
      for (let i = 0; i < 5; i++) {
        const c = ELEMENT_COLORS[SPIRITS[i].el];
        setTimeoutish(0.25 + i * 0.22, () => {
          stage.keep(vfx?.beam?.(beamFrom[i], sealTop, { color: c, width: 4.5, duration: 2.8, jagged: 0.08, segments: 8 }));
          vfx?.burst?.(beamFrom[i], { count: 30, color: [c, 0xffffff], speed: 8, spread: 1, size: 1.4, sizeEnd: 0, life: 1.0, shape: 'spark' });
          vfx?.shockwave?.(beamFrom[i], { color: c, radius: 9, duration: 0.9 });
          sfx('spirit_chime', { volume: 0.5, pitch: 0.8 + i * 0.1 });
        });
      }
      setTimeoutish(1.9, () => {
        sfx('blessing', { volume: 0.9 }); sfx('explode_lightning', { volume: 0.45, pitch: 0.7 });
        vfx?.screenFlash?.(0xfff4dc, 0.85, 1.3); vfx?.shake?.(0.5);
        vfx?.flash?.(sealTop, { color: 0xffe6b0, intensity: 40, distance: 260, duration: 1.4 });
        vfx?.shockwave?.(arena, { color: 0xffe2a0, radius: 70, duration: 1.6, opacity: 0.9 });
        vfx?.burst?.(sealTop, { count: 140, color: [0xffffff, 0xffd890], speed: 34, spread: 1, size: 2.2, sizeEnd: 0, life: 1.8, shape: 'spark', drag: 1 });
        leak.fall?.stop?.(); leak.spark?.stop?.();
        ov.grade(null, 0, 2);
        ov.subtitle('— 안개를 북쪽 봉인의 유적 깊은 곳에 가두었다.', { dur: 4.6 });
      });
    },
    onUpdate(u, dt, e, tt) {
      followGround();
      const s = clamp((tt - 1.9) / 3.5, 0, 1), k = EASE.outCubic(s);
      seal.material.opacity = clamp((tt - 1.8) * 3, 0, 1) * (1 - smoothstep(0.75, 1, u) * 0.6);
      seal.rotation.y = T * 0.25; seal.scale.setScalar(20 + 40 * k);
      sealRing.material.opacity = clamp((tt - 0.3) / 1.5, 0, 0.9) * (1 - k);
      sealRing.rotation.y = -T * 0.6; sealRing.scale.setScalar(8 + 22 * k);
      // the mist is pulled down into the ruins, the rift closes, the colossus sinks
      mist.userData.u.uGrow.value = 1 - k; mistTop.userData.u.uGrow.value = Math.max(0, 1 - k * 1.6);
      mist.position.y = arena.y - 4 - k * 12;
      riftMat.opacity = Math.max(0, 1 - k * 1.8); rift.scale.x = Math.max(0.01, 38 * (1 - k)); riftHalo.material.opacity = 0.5 * (1 - k);
      colossus.position.y = arena.y + 6 - k * 44; backlight.material.opacity = 0.75 * (1 - k);
      for (const sp of colossus.userData.eyes) sp.material.opacity = Math.max(0, 1 - k * 2);
      if (tt > 1.9 && !this._g) { this._g = true; C.grade.set('golden', 3); }
    },
    onEnd() { colossus.visible = false; rift.visible = riftHalo.visible = false; mistTop.visible = false; },
  });
  // ---- 6a: present day — the seal cracks
  shots.push({
    duration: 4.6, ease: 'inOutSine', grade: 'dusk', gradeDur: 0, fadeIn: 1.0,
    from: V(22, 26, -96), to: V(16, 22, -104), lookFrom: V(0, 16, -125), lookTo: V(0, 18, -125), fov: 50,
    onStart() {
      mist.visible = true; mist.position.y = arena.y - 6; mist.userData.u.uGrow.value = 0.25;
      seal.material.opacity = 0.7; seal.scale.setScalar(26);
      ov.title('그리고 천 년이 흐른 지금 —', { sub: '봉인이 약해지고 있다', style: 'low', dur: 4.4, fadeIn: 1.0, stagger: 0.07 });
      leak.wisp = stage.keep(vfx?.emitter?.({ position: arena.clone().setY(arena.y + 1), rate: 24, count: 1, color: [0x2a0c3a, 0x6a2a90], speed: 3, dir: V(0, 1, 0), spread: 0.5, size: 3, sizeEnd: 9, life: 2.6, shape: 'smoke', additive: false, alpha: 0.7, radius: 14 }));
      sfx('cinematic_whoosh', { volume: 0.4, pitch: 0.7 });
    },
    onUpdate(u) {
      followGround();
      // flicker / crack of the seal
      const f = Math.sin(T * 23) * Math.sin(T * 7.1) > 0.3 ? 0.25 : 1;
      seal.material.opacity = 0.65 * f * (1 - u * 0.3); seal.material.color.setHex(f < 1 ? 0xb070ff : 0xffe6a8);
      seal.rotation.y = T * 0.1;
    },
    onEnd() { seal.visible = false; mist.visible = false; leak.wisp?.stop?.(); },
  });
  // ---- 6b: monsters gather around the camp bonfire
  shots.push({
    duration: 6.2, ease: 'inOutSine', fadeOut: 0.9,
    from: C.orbit(campP, { radius: 26, height: 12, from: 2.2, to: 1.2, radiusTo: 17, heightTo: 6 }), lookFrom: campP.clone().setY(campP.y + 1.5),
    fov: [55, 50],
    onStart() { ov.subtitle('안개에 물든 마물들이 솔레아 평원 곳곳에 거점을 세웠다.', { dur: 5.6 }); },
    onUpdate() { followGround(); },
  });
  // ---- 7: sunrise over 바람결 마을, descend to the hero
  const vilA = V(vCenter.x - 24, vCenter.y + 24, vCenter.z + 20);
  shots.push({
    duration: 10.5, ease: 'inOutSine', grade: 'sunrise', gradeDur: 0, fadeIn: 1.4,
    from: vilA, to: (e, s) => heroFront(3.6, 1.35, 1.0, s._end || (s._end = new THREE.Vector3())),
    look: (e) => {
      handPos(tmp2);
      // frame face AND hand mark inside the letterbox
      if (pObj) tmp2.lerp(_head.set(pObj.position.x, pObj.position.y + 1.5, pObj.position.z), 0.45);
      return tmp.lerpVectors(V(vCenter.x + 30, vCenter.y + 18, vCenter.z - 60), tmp2, EASE.inOutCubic(clamp((e - 0.3) / 0.7, 0, 1))); },
    fov: [54, 40],
    onStart() {
      ov.grade('linear-gradient(180deg, rgba(255,190,120,.16), rgba(255,170,90,0) 45%, rgba(40,20,60,.12))', 1, 2);
      // place & show the hero at home
      try { player?.placeInVillage?.(); } catch (_) { /* */ }
      if (pObj) { pObj.visible = true; pObj.updateMatrixWorld(true); }
      motes.userData.u.uOpacity.value = 0.9;
      try { audio?.setMusic?.('intro'); } catch (_) { /* */ }
      ov.subtitle('평원의 남쪽 끝, 바람결 마을.', { dur: 4.4 });
      sfx('cinematic_whoosh', { volume: 0.35, pitch: 0.8 });
    },
    cues: [
      { at: 4.9, subtitle: { text: '한 젊은이의 손등에 잊혀졌던 원소의 각인이 떠올랐다.', dur: 3.2 } },
      { at: 8.2, subtitle: { text: '새로운 수호자의 증표가.', dur: 2.6 } },
      { at: 6.2, call: () => { sfx('spirit_chime', { volume: 0.9, pitch: 1.3 }); handPos(tmp); vfx?.burst?.(tmp, { count: 26, color: [0xffe2a0, 0xffffff], speed: 2.2, spread: 1, size: 0.18, sizeEnd: 0, life: 1.1, shape: 'spark', drag: 1.5 }); } },
    ],
    onUpdate(u, dt, e, tt) {
      const g = clamp((tt - 6.0) / 1.2, 0, 1) * (0.85 + Math.sin(T * 4) * 0.15);
      handPos(tmp);
      mark.position.copy(tmp); markHalo.position.copy(tmp);
      mark.material.opacity = g; markHalo.material.opacity = g * 0.75; mark.material.rotation = T * 0.8;
      markMotes.forEach((m, i) => {
        const a = T * 2.2 + (i / 5) * Math.PI * 2;
        m.position.set(tmp.x + Math.cos(a) * 0.38, tmp.y + Math.sin(a * 1.3) * 0.12, tmp.z + Math.sin(a) * 0.38);
        m.material.opacity = g;
      });
    },
  });
  // ---- 8: title card
  shots.push({
    duration: 9, ease: 'inOutSine', fadeOut: 1.6,
    from: (e, s) => heroFront(3.2, 1.55, 1.2, s._a || (s._a = new THREE.Vector3())), to: V(home.x - 8, home.y + 34, home.z + 34),
    look: (e) => { handPos(tmp2); return tmp.lerpVectors(tmp2, V(home.x + 90, home.y + 70, home.z - 150), EASE.inOutCubic(e)); },
    fov: [40, 60],
    onStart() {
      sfx('cinematic_whoosh', { volume: 0.5 });
      ov.grade('radial-gradient(ellipse 70% 50% at 50% 50%, rgba(10,8,20,.45), rgba(10,8,20,0) 70%)', 1, 3);
      setTimeoutish(1.2, () => { sfx('spirit_chime', { volume: 1, pitch: 0.75 }); ov.title('아케인 와일즈', { sub: 'ARCANE WILDS', style: 'card', dur: 6.8, fadeIn: 1.1, stagger: 0.12, fadeOut: 1.4 }); });
    },
    onUpdate(u) {
      const g = 1 - u;
      mark.material.opacity = g; markHalo.material.opacity = g * 0.75;
      handPos(tmp); mark.position.copy(tmp); markHalo.position.copy(tmp);
      markMotes.forEach((m) => { m.material.opacity = g; });
    },
  });

  // ---------------------------------------------------------------- tiny real-time scheduler inside the intro clock
  const timers = [];
  function setTimeoutish(delay, fn) { timers.push({ at: T + delay, fn }); }
  // wrap every shot's onUpdate with the shared ticker (intro clock, timers, mist uniforms)
  for (const s of shots) {
    const inner = s.onUpdate;
    s.onUpdate = function (u, dt, e, tt) {
      T += dt;
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= T) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (err) { console.error('[cinematic] intro timer', err); } }
      for (const o of ticks) o.userData.tick(T);
      inner?.call(this, u, dt, e, tt);
    };
  }

  const wasVisible = pObj ? pObj.visible : true;
  if (pObj) pObj.visible = false;
  return C.play(shots, {
    mode: 'world', letterbox: true, film: true, skippable: true, hintTime: 5, clampGround: 2,
    endFade: 1.4,
    onEnd: () => {
      stage.dispose();
      for (const sp of spirits) sp.label.remove();
      if (pObj) pObj.visible = wasVisible || true;
      try { audio?.setMusic?.(null); } catch (_) { /* */ }
      try { onDone?.(); } catch (err) { console.error('[cinematic] intro onDone', err); }
    },
  });
}
