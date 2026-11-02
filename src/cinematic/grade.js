// World colour grading for cutscenes: sky dome colours / sun direction, sun & hemisphere light, fog colour and
// tone-mapping exposure are temporarily overridden (feature-detected, never touching other modules' shared objects:
// we swap uniform *values* for our own Color/Vector3 instances and put the originals back on restore()).
import * as THREE from 'three';
import { lerp } from '../core/utils.js';

// Presets: sky top/mid/horizon, sky sun colour + direction, sun light colour/intensity, hemi intensity, fog colour,
// exposure. 'day' = null → the world's own values.
const P = {
  night: { top: 0x020208, mid: 0x060716, horizon: 0x0d0f22, sunCol: 0x30305a, sunDir: [0.3, -0.3, -0.9], light: 0x5060a0, li: 0.35, hemi: 0.35, fog: 0x0b0d1c, exp: 0.75 },
  dawn: { top: 0x1d2c5c, mid: 0x7a6aa0, horizon: 0xffb27a, sunCol: 0xffc47a, sunDir: [0.62, 0.06, -0.78], light: 0xffb27a, li: 1.7, hemi: 0.85, fog: 0xc89a9a, exp: 0.86, far: 1100 },
  golden: { top: 0x3c6fc8, mid: 0x9cc4ea, horizon: 0xffe0b0, sunCol: 0xffe2a8, sunDir: [0.75, 0.25, -0.6], light: 0xffe0b8, li: 2.5, hemi: 1.1, fog: 0xd8e2ee, exp: 1.04, far: 1000 },
  void: { top: 0x07030f, mid: 0x1c0b2c, horizon: 0x4a1f52, sunCol: 0x9a3060, sunDir: [0.0, 0.12, -1.0], light: 0x8a6aa8, li: 0.9, hemi: 0.5, fog: 0x2a1436, exp: 0.85, far: 520 },
  dusk: { top: 0x1a2350, mid: 0x6b5590, horizon: 0xff9a6a, sunCol: 0xff9860, sunDir: [-0.7, 0.05, 0.7], light: 0xff9a68, li: 0.9, hemi: 0.5, fog: 0x7a6080, exp: 0.85, far: 700 },
  sunrise: { top: 0x2a5aa8, mid: 0x8fb4e0, horizon: 0xffc89a, sunCol: 0xffd090, sunDir: [0.62, 0.1, -0.78], light: 0xffd2a8, li: 2.2, hemi: 1.0, fog: 0xead2c0, exp: 1.03, far: 800 },
};

export function createGrade(game) {
  const { scene, renderer } = game;
  let saved = null;
  const cur = {
    top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), sunCol: new THREE.Color(),
    sunDir: new THREE.Vector3(), light: new THREE.Color(), li: 1, hemi: 1, fog: new THREE.Color(), exp: 1, far: 470,
  };
  const from = { ...cur, top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), sunCol: new THREE.Color(), sunDir: new THREE.Vector3(), light: new THREE.Color(), fog: new THREE.Color() };
  const to = { ...cur, top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), sunCol: new THREE.Color(), sunDir: new THREE.Vector3(), light: new THREE.Color(), fog: new THREE.Color() };
  let tr = { t: 1, dur: 0 };
  let sky = null;

  function capture() {
    if (saved) return;
    sky = scene.getObjectByName('sky')?.material?.uniforms || null;
    const w = game.world || {};
    saved = {
      sky: sky && { top: sky.uTop?.value, mid: sky.uMid?.value, horizon: sky.uHorizon?.value, sunCol: sky.uSunColor?.value, sunDir: sky.uSunDir?.value },
      sunColor: w.sun?.color?.clone(), sunI: w.sun?.intensity, hemiI: w.hemi?.intensity,
      fog: scene.fog?.color?.clone(), far: scene.fog?.far, exp: renderer.toneMappingExposure,
    };
    // day values as the starting point
    readDay(cur);
    if (sky) {
      if (sky.uTop) sky.uTop.value = cur.top; if (sky.uMid) sky.uMid.value = cur.mid; if (sky.uHorizon) sky.uHorizon.value = cur.horizon;
      if (sky.uSunColor) sky.uSunColor.value = cur.sunCol; if (sky.uSunDir) sky.uSunDir.value = cur.sunDir;
    }
  }
  function readDay(o) {
    const s = saved?.sky;
    o.top.copy(s?.top || new THREE.Color(0x2f7fd8)); o.mid.copy(s?.mid || new THREE.Color(0x7cc0f0));
    o.horizon.copy(s?.horizon || new THREE.Color(0xd6eefa)); o.sunCol.copy(s?.sunCol || new THREE.Color(0xfff2d2));
    o.sunDir.copy(s?.sunDir || new THREE.Vector3(0.85, 0.55, -0.1));
    o.light.copy(saved?.sunColor || new THREE.Color(0xfff0d4)); o.li = saved?.sunI ?? 2.7; o.hemi = saved?.hemiI ?? 1.25;
    o.fog.copy(saved?.fog || new THREE.Color(0xb7d3ee)); o.exp = saved?.exp ?? 1.05; o.far = saved?.far ?? 470;
  }
  function readPreset(name, o) {
    const p = P[name];
    if (!p) { readDay(o); return; }
    o.top.setHex(p.top); o.mid.setHex(p.mid); o.horizon.setHex(p.horizon); o.sunCol.setHex(p.sunCol);
    o.sunDir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
    o.light.setHex(p.light); o.li = p.li; o.hemi = p.hemi; o.fog.setHex(p.fog); o.exp = p.exp; o.far = p.far ?? saved?.far ?? 470;
  }
  function copyState(a, b) {
    a.top.copy(b.top); a.mid.copy(b.mid); a.horizon.copy(b.horizon); a.sunCol.copy(b.sunCol); a.sunDir.copy(b.sunDir);
    a.light.copy(b.light); a.li = b.li; a.hemi = b.hemi; a.fog.copy(b.fog); a.exp = b.exp; a.far = b.far;
  }
  function apply() {
    const w = game.world || {};
    if (w.sun) { w.sun.color.copy(cur.light); w.sun.intensity = cur.li; }
    if (w.hemi) w.hemi.intensity = cur.hemi;
    if (scene.fog) { scene.fog.color.copy(cur.fog); if ('far' in scene.fog) scene.fog.far = cur.far; }
    renderer.toneMappingExposure = cur.exp;
  }

  return {
    get active() { return !!saved; },
    /** Blend to preset ('night'|'dawn'|'golden'|'void'|'dusk'|'sunrise'|'day') over `dur` seconds (0 = snap). */
    set(name, dur = 0) {
      capture();
      copyState(from, cur); readPreset(name, to);
      tr = { t: 0, dur: Math.max(0, dur) };
      if (dur <= 0) { copyState(cur, to); tr.t = 1; apply(); }
    },
    update(dt) {
      if (!saved || tr.t >= 1) return;
      tr.t = Math.min(1, tr.t + dt / (tr.dur || 1e-6));
      const k = tr.t * tr.t * (3 - 2 * tr.t);
      cur.top.lerpColors(from.top, to.top, k); cur.mid.lerpColors(from.mid, to.mid, k);
      cur.horizon.lerpColors(from.horizon, to.horizon, k); cur.sunCol.lerpColors(from.sunCol, to.sunCol, k);
      cur.sunDir.lerpVectors(from.sunDir, to.sunDir, k).normalize();
      cur.light.lerpColors(from.light, to.light, k);
      cur.li = lerp(from.li, to.li, k); cur.far = lerp(from.far, to.far, k); cur.hemi = lerp(from.hemi, to.hemi, k); cur.exp = lerp(from.exp, to.exp, k);
      cur.fog.lerpColors(from.fog, to.fog, k);
      apply();
    },
    restore() {
      if (!saved) return;
      const w = game.world || {};
      if (sky && saved.sky) {
        if (sky.uTop) sky.uTop.value = saved.sky.top; if (sky.uMid) sky.uMid.value = saved.sky.mid;
        if (sky.uHorizon) sky.uHorizon.value = saved.sky.horizon; if (sky.uSunColor) sky.uSunColor.value = saved.sky.sunCol;
        if (sky.uSunDir) sky.uSunDir.value = saved.sky.sunDir;
      }
      if (w.sun && saved.sunColor) { w.sun.color.copy(saved.sunColor); w.sun.intensity = saved.sunI; }
      if (w.hemi && saved.hemiI != null) w.hemi.intensity = saved.hemiI;
      if (scene.fog && saved.fog) { scene.fog.color.copy(saved.fog); if (saved.far != null) scene.fog.far = saved.far; }
      renderer.toneMappingExposure = saved.exp;
      saved = null; sky = null;
    },
  };
}
