// Finisher set pieces for the new elements (CONTRACT §16): water leviathan, eternal forest, dawn wings, raven lord, plus the
// 9-colour 원소 교향곡 (symphony). Each is built into the finisher's Stage (disposed with it) from shared sprite / pillar
// programs (warmed at boot) — no new programs, no lights. API: piece = SET_PIECES[el](stage, game, o) →
// { build(t, k), impact(), after(t, u) }   (k = buildup 0..1, u = after-impact 0..1)
import * as THREE from 'three';
import { ALL_ELEMENTS, elColor } from '../core/elements.js';
import { makePillar, glowTex, starTex } from './assets.js';

const _v = new THREE.Vector3();

function waterLeviathan(stage, game, o) {
  const N = 16, col = elColor('water', 'hex');
  const body = [];
  for (let i = 0; i < N; i++) { const s = stage.sprite(i === N - 1 ? 0xffffff : col, (i === N - 1 ? 3.6 : 2.6) * (1 - i * 0.02), glowTex(), 0); s.renderOrder = 15; stage.add(s); body.push(s); }
  const c = o.center, h = o.hero;
  const curvePt = (k, t, out) => { // rises behind the hero, arcs over, crashes on the target
    const x = h.x + (c.x - h.x) * k, z = h.z + (c.z - h.z) * k;
    const lift = Math.sin(Math.min(1, k) * Math.PI) * 9;
    return out.set(x + Math.sin(k * 9 + t * 4) * 1.2, Math.max(h.y, c.y) + 1 + lift, z + Math.cos(k * 7 + t * 3) * 1.2);
  };
  let head = 0;
  return {
    build(t, k) { head = k * 0.55; for (let i = 0; i < N; i++) { const kk = Math.max(0, head - i * 0.03); curvePt(kk, t, body[i].position); body[i].material.opacity = kk > 0 ? 0.85 : 0; } },
    impact() {
      game.vfx?.burst?.(c, { count: 90, color: [col, 0xffffff], speed: 12, dir: _v.set(0, 1, 0), spread: 0.7, size: 0.4, sizeEnd: 0, life: 1.2, shape: 'droplet', gravity: 9 });
      game.vfx?.shockwave?.(c, { color: col, radius: 12, duration: 0.8 });
    },
    after(t, u) { const hh = 0.55 + u * 0.6; for (let i = 0; i < N; i++) { const kk = Math.min(1, Math.max(0, hh - i * 0.03)); curvePt(kk, t, body[i].position); body[i].material.opacity = (1 - u) * 0.85; } },
  };
}

function eternalForest(stage, game, o) {
  const col = elColor('nature', 'hex'), c = o.center, N = 8;
  const trees = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const p = makePillar(stage, i % 2 ? 0x9be86a : 0x2f7d3a, 0.7, 1); p.position.set(c.x + Math.cos(a) * 5.5, c.y, c.z + Math.sin(a) * 5.5);
    trees.push(p);
  }
  return {
    build(t, k) { for (const p of trees) { p.material.uniforms.uTime.value = t; p.material.uniforms.uOpacity.value = k * 0.35; p.scale.y = 1 + k * 4; } },
    impact() {
      for (const p of trees) game.vfx?.burst?.(p.position, { count: 18, color: [0xffb8d8, 0xfff2a8, col], speed: 5, dir: _v.set(0, 1, 0), spread: 0.5, size: 0.4, sizeEnd: 0.1, life: 1.8, shape: 'petal', gravity: -0.5 });
      game.vfx?.burst?.(c, { count: 40, color: [col, 0x2f7d3a], speed: 10, dir: _v.set(0, 1, 0), spread: 0.35, size: 0.5, sizeEnd: 0, life: 0.8, shape: 'thorn' });
    },
    after(t, u) { for (const p of trees) { p.material.uniforms.uTime.value = t; p.material.uniforms.uOpacity.value = 0.6 * (1 - u); p.scale.y = 5 + u * 14; } },
  };
}

function dawnWings(stage, game, o) {
  const col = elColor('light', 'hex');
  const wings = [];
  for (let i = 0; i < 6; i++) { const w = stage.sprite(i % 2 ? 0xfff2c8 : col, 1, glowTex(), 0); w.renderOrder = 15; stage.add(w); wings.push(w); }
  const sun = stage.sprite(0xffffff, 4, starTex(), 0); stage.add(sun);
  const h = o.hero, dir = new THREE.Vector3();
  const place = (t, k) => {
    dir.copy(o.center).sub(h); dir.y = 0; if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize();
    const sx = -dir.z, sz = dir.x;
    wings.forEach((w, i) => {
      const side = i < 3 ? -1 : 1, j = i % 3;
      const spread = (0.4 + j * 0.45) * k;
      w.position.set(h.x - dir.x * 0.6 + sx * side * (1.2 + j * 0.9) * k, h.y + 1.6 + spread * 1.6, h.z - dir.z * 0.6 + sz * side * (1.2 + j * 0.9) * k);
      w.scale.set(1.2 + k * 1.2, 3 + k * 4.5 - j * 0.6, 1);
      w.material.rotation = side * (0.5 + j * 0.45) + Math.sin(t * 3 + j) * 0.05;
      w.material.opacity = k * 0.75;
    });
    sun.position.set(h.x, h.y + 3.4, h.z); sun.material.opacity = k * 0.9; sun.material.rotation = t;
  };
  return {
    build(t, k) { place(t, k); },
    impact() { game.vfx?.burst?.(o.center, { count: 70, color: [col, 0xffffff], speed: 10, spread: 1, size: 0.4, sizeEnd: 0, life: 1.2, shape: 'feather', gravity: -0.6, drag: 1.2 }); },
    after(t, u) { place(t, 1 + u * 0.3); for (const w of wings) w.material.opacity = 0.75 * (1 - u); sun.material.opacity = 0.9 * (1 - u); },
  };
}

function ravenLord(stage, game, o) {
  const c = o.center, N = 14;
  const ravens = [];
  for (let i = 0; i < N; i++) { const r = stage.sprite(i % 3 ? 0x1a0b2e : 0x9a5cff, 1.4, starTex(), 0); r.renderOrder = 15; stage.add(r); ravens.push(r); }
  const core = stage.sprite(0xb14bff, 6, glowTex(), 0); core.position.set(c.x, c.y + 2, c.z); stage.add(core);
  const place = (t, rad, a0) => ravens.forEach((r, i) => {
    const a = (i / N) * Math.PI * 2 + a0 + t * 2.4;
    r.position.set(c.x + Math.cos(a) * rad, c.y + 2 + Math.sin(i * 1.7 + t * 3) * 1.2 + (i % 3) * 0.7, c.z + Math.sin(a) * rad);
  });
  return {
    build(t, k) { place(t, 12 - k * 8, 0); for (const r of ravens) r.material.opacity = k; core.material.opacity = k * 0.6; core.scale.setScalar(6 - k * 3); },
    impact() {
      game.vfx?.burst?.(c, { count: 60, color: [0x9a5cff, 0x1a0b2e], speed: 11, spread: 1, size: 0.6, sizeEnd: 0, life: 1.0, shape: 'raven', drag: 1.4 });
      game.vfx?.shockwave?.(c, { color: 0x9a5cff, radius: 10, duration: 0.7 });
    },
    after(t, u) { place(t, 4 + u * 20, u * 2); for (const r of ravens) r.material.opacity = 1 - u; core.material.opacity = 0.6 * (1 - u); core.scale.setScalar(3 + u * 10); },
  };
}

function symphony(stage, game, o) {
  const c = o.center;
  const ring = ALL_ELEMENTS.map((el, i) => {
    const a = (i / ALL_ELEMENTS.length) * Math.PI * 2;
    const p = makePillar(stage, elColor(el, 'hex'), 0.5, 1); p.position.set(c.x + Math.cos(a) * 7, c.y, c.z + Math.sin(a) * 7); p.userData.a = a;
    return p;
  });
  return {
    build(t, k) { for (const p of ring) { p.material.uniforms.uTime.value = t; p.material.uniforms.uOpacity.value = k * 0.45; p.scale.y = 1 + k * 18; } },
    impact() { game.vfx?.burst?.(c, { count: 120, color: ALL_ELEMENTS.map((e) => elColor(e, 'hex')), speed: 14, spread: 1, size: 0.5, sizeEnd: 0, life: 1.4, shape: 'spark', drag: 1 }); },
    after(t, u) {
      for (const p of ring) { const r = 7 * (1 - u * 0.85); p.position.set(c.x + Math.cos(p.userData.a + u * 2) * r, c.y, c.z + Math.sin(p.userData.a + u * 2) * r); p.material.uniforms.uTime.value = t; p.material.uniforms.uOpacity.value = 0.45 * (1 - u); }
    },
  };
}

export const SET_PIECES = { water: waterLeviathan, nature: eternalForest, light: dawnWings, shadow: ravenLord, symphony };
