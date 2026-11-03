// Per-element impact / explosion presets composed from VFX primitives.
import * as THREE from 'three';
import { ELEMENT_COLORS } from '../core/utils.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _g = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const SZ = 1.45, LF = 1.25; // global size / lifetime multipliers for preset particles

export function installPresets(vfx0, game) {
  // wrapper so all preset bursts are scaled consistently
  const vfx = Object.create(vfx0);
  vfx.burst = (p, o) => {
    if (o.size != null) o.size *= SZ;
    if (o.sizeEnd != null) o.sizeEnd *= SZ;
    if (o.life != null && o.shape !== 'flare') o.life *= LF;
    return vfx0.burst(p, o);
  };
  const groundY = (p) => game.world?.getHeight?.(p.x, p.z) ?? 0;
  const nearGround = (p, h = 1.6) => p.y - groundY(p) < h;
  const groundPt = (p) => _g.set(p.x, groundY(p), p.z);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------------- FIRE ----------------
  function fire(pos, s, big, normal) {
    const k = big ? 1.7 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xfff0c0, 0xff8a30], size: 2.4 * s * k, sizeEnd: 3.0 * s * k, life: 0.12 * k, lifeVar: 0, speed: 0, alpha: 0.75 });
    // solid toon-like flame body (reads in daylight) + additive glow on top
    vfx.burst(pos, { count: Math.round(9 * s * k), shape: 'puff', color: [0xffa42a, 0xb81a06], alpha: 1, speed: 5 * s * k, speedVar: 2 * s, drag: 5.5, gravity: -3,
      size: 0.8 * s * k, sizeEnd: 1.6 * s * k, life: 0.45 * k, lifeVar: 0.15, radius: 0.35 * s, rotSpeed: 2, fadeIn: 0.0 });
    vfx.burst(pos, { count: Math.round(14 * s * k), shape: 'soft', color: [0xff8a20, 0xff2000], speed: 3.2 * s * k, speedVar: 1.5 * s, drag: 4.5, gravity: -2.5,
      size: 1.1 * s * k, sizeEnd: 2.0 * s * k, life: 0.32 * k, alpha: 0.32, radius: 0.15 * s });
    vfx.burst(pos, { count: Math.round(6 * s * k), shape: 'soft', color: [0xff8a2a, 0xa01d05], speed: 1.6 * s * k, drag: 3, gravity: -3.5,
      size: 1.2 * s * k, sizeEnd: 2.1 * s * k, life: 0.55 * k, alpha: 0.35, fadeIn: 0.1 });
    vfx.burst(pos, { count: Math.round(22 * s * k), shape: 'ember', color: [0xffe08a, 0xff3a10], speed: 9 * Math.sqrt(s) * k, speedVar: 4,
      dir: normal || UP, spread: normal ? 0.6 : 0.85, gravity: 9, drag: 1.4, size: 0.26 * Math.sqrt(s), sizeEnd: 0.08, life: 0.85 * k, lifeVar: 0.35, velocityStretch: 0.06, ground: true, alpha: 1.4 });
    vfx.burst(pos, { count: Math.round(7 * Math.min(s, 1.6) * k), shape: 'smoke', color: [0x6e5a4e, 0x463c36], alpha: 0.42, speed: 1.4 * s, drag: 1.5, gravity: -2.8,
      size: 0.9 * Math.min(s, 1.8) * k, sizeEnd: 2.6 * Math.min(s, 1.8) * k, life: 1.2 * k, lifeVar: 0.3, fadeIn: 0.25, radius: 0.3 * s });
    vfx.flash(pos, { color: 0xff8a30, intensity: 4 * s * k, distance: 9 * s * k, duration: 0.32 * k });
    if (nearGround(pos)) {
      vfx.shockwave(groundPt(pos), { color: 0xff7a2a, radius: 2.4 * s * k, duration: 0.38 * k, thickness: 0.22, opacity: 0.8 });
      vfx.decal(pos, { type: 'scorch', radius: 1.1 * s * k, duration: 8, color: 0xff7a2a });
    }
    if (big) {
      vfx.dome(pos, { color: 0xff5a10, radius: 3.2 * s, duration: 0.4, opacity: 0.5 });
      vfx.burst(pos, { count: Math.round(10 * s), shape: 'spark', color: [0xffffff, 0xffa040], speed: 16 * Math.sqrt(s), drag: 3.5, size: 0.22, sizeEnd: 0.05, life: 0.4, velocityStretch: 0.05 });
      vfx.after(0.12, () => vfx.burst(pos, { count: Math.round(6 * Math.min(s, 2)), shape: 'smoke', color: [0x7a665a, 0x4e443e], alpha: 0.4, speed: 2.2 * s, gravity: -3.5, drag: 1.2, size: 1.4 * Math.min(s, 2), sizeEnd: Math.min(3.8 * s, 6), life: 1.5, fadeIn: 0.2, radius: 0.6 * s }));
      if (nearGround(pos)) vfx.shockwave(groundPt(pos), { color: 0xffb060, radius: 5 * s, duration: 0.6, thickness: 0.1, opacity: 0.6, delay: 0.05 });
    }
  }

  // ---------------- ICE ----------------
  function ice(pos, s, big, normal) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xffffff, 0x9feeff], size: 2.2 * s * k, sizeEnd: 2.8 * s * k, life: 0.12 * k, lifeVar: 0, speed: 0, alpha: 0.85 });
    vfx.burst(pos, { count: Math.round(18 * s * k), shape: 'shard', additive: false, color: [0xd8f8ff, 0x38a8e8], speed: 8 * Math.sqrt(s) * k, speedVar: 3, dir: normal || UP, spread: normal ? 0.65 : 1,
      drag: 3, gravity: 6, size: 0.55 * Math.sqrt(s), sizeEnd: 0.25, life: 0.6 * k, velocityStretch: 0.05, alpha: 1 });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'spark', color: [0xffffff, 0x3fc0ff], speed: 6 * s, drag: 4, size: 0.35, sizeEnd: 0.05, life: 0.35, alpha: 0.9 });
    vfx.burst(pos, { count: 2, shape: 'soft', color: [0x40c0ff, 0x1060e0], speed: 0.5, size: 1.6 * s * k, sizeEnd: 2.6 * s * k, life: 0.45, alpha: 0.7 });
    vfx.burst(pos, { count: Math.round(7 * s * k), shape: 'smoke', color: [0xb8ecff, 0x5ec0ee], alpha: 0.5, speed: 1.6 * s, drag: 2, gravity: 0.3,
      size: 0.8 * s * k, sizeEnd: 2.2 * s * k, life: 1.1 * k, fadeIn: 0.12, radius: 0.25 * s });
    vfx.burst(pos, { count: Math.round(12 * s * k), shape: 'snow', color: [0xffffff, 0xbff2ff], speed: 2.2 * s, drag: 2.2, gravity: 0.5,
      size: 0.2 * Math.sqrt(s), sizeEnd: 0.12, life: 1.8 * k, lifeVar: 0.5, alpha: 0.85, radius: 0.4 * s, up: 0.8 });
    vfx.debris(pos, { material: 'ice', count: Math.round(4 * s * k), size: 0.28 * Math.sqrt(s) * k, speed: 5.5 * Math.sqrt(s), life: 1.6 });
    vfx.flash(pos, { color: 0x9feeff, intensity: 3.5 * s * k, distance: 8 * s * k, duration: 0.28 * k });
    if (nearGround(pos)) {
      vfx.shockwave(groundPt(pos), { color: 0x30c8ff, radius: 2.2 * s * k, duration: 0.32 * k, thickness: 0.1, opacity: 0.95 });
      vfx.decal(pos, { type: 'frost', radius: 1.4 * s * k, duration: 9 });
    }
    if (big) {
      vfx.dome(pos, { color: 0x40c8ff, radius: 3 * s, duration: 0.45, opacity: 0.55 });
      vfx.debris(pos, { material: 'ice', count: Math.round(5 * s), size: 0.45 * Math.sqrt(s), speed: 8, life: 2.2 });
      // crystalline ring of upward spikes
      for (let i = 0; i < Math.round(8 * s); i++) {
        const a = (i / Math.round(8 * s)) * Math.PI * 2;
        _p.set(pos.x + Math.cos(a) * 1.2 * s, pos.y, pos.z + Math.sin(a) * 1.2 * s);
        _d.set(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
        vfx.burst(_p, { count: 3, shape: 'shard', color: [0xffffff, 0x7fe3ff], dir: _d, spread: 0.06, speed: 7, drag: 5, size: 0.6, sizeEnd: 0.25, life: 0.5, velocityStretch: 0.08 });
      }
      if (nearGround(pos)) vfx.shockwave(groundPt(pos), { color: 0xd8f8ff, radius: 4.5 * s, duration: 0.55, thickness: 0.07, opacity: 0.8, delay: 0.06 });
    }
  }

  // ---------------- LIGHTNING ----------------
  function bolts(pos, s, n, len, dur) {
    for (let i = 0; i < n; i++) {
      _d.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize();
      _q.copy(pos).addScaledVector(_d, len * rnd(0.6, 1.1));
      vfx.beam(pos, _q, { color: 0xa070ff, width: 0.4 * Math.sqrt(s), duration: dur * rnd(0.7, 1.2), jagged: 1.2, branches: 1 });
    }
  }
  function lightning(pos, s, big, normal) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xffffff, 0xc9a4ff], size: 3 * s * k, sizeEnd: 2 * s * k, life: 0.1 * k, lifeVar: 0, speed: 0, alpha: 1 });
    vfx.burst(pos, { count: 2, shape: 'soft', color: [0xa070ff, 0x5a1cff], size: 1.8 * s * k, sizeEnd: 2.6 * s * k, life: 0.22, speed: 0, alpha: 0.6 });
    bolts(pos, s, Math.round((big ? 7 : 4) * Math.sqrt(s)), 2.2 * s * k, 0.18 * k);
    vfx.burst(pos, { count: Math.round(28 * s * k), shape: 'spark', color: [0xffffff, 0xa070ff], speed: 11 * Math.sqrt(s) * k, speedVar: 5,
      dir: normal || UP, spread: normal ? 0.7 : 1, drag: 3.2, gravity: 7, size: 0.13, sizeEnd: 0.03, life: 0.45, lifeVar: 0.2, velocityStretch: 0.045, ground: true });
    vfx.burst(pos, { count: Math.round(7 * s * k), shape: 'bolt', color: [0xffffff, 0xb08aff], speed: 1.5 * s, size: 0.7 * s, sizeEnd: 0.4 * s, life: 0.28, lifeVar: 0.15, radius: 0.6 * s, flicker: true, rotSpeed: 0 });
    // lingering electric motes that crackle after the strike
    vfx.burst(pos, { count: Math.round(12 * s * k), shape: 'mote', color: [0xd8c0ff, 0x7a3cff], speed: 2.5 * s, drag: 2.5, gravity: -0.4,
      size: 0.22, sizeEnd: 0.1, life: 0.9 * k, lifeVar: 0.3, radius: 0.5 * s, flicker: true, alpha: 1.2 });
    vfx.burst(pos, { count: 2, shape: 'soft', color: [0x9a60ff, 0x4a10d0], speed: 0, size: 2.2 * s * k, sizeEnd: 3 * s * k, life: 0.45 * k, alpha: 0.35 });
    vfx.flash(pos, { color: 0xb88cff, intensity: 5 * s * k, distance: 10 * s * k, duration: 0.22 * k });
    if (nearGround(pos)) {
      vfx.shockwave(groundPt(pos), { color: 0xc9a4ff, radius: 2.4 * s * k, duration: 0.24 * k, thickness: 0.07, opacity: 1 });
      vfx.decal(pos, { type: 'scorch', radius: 0.9 * s * k, duration: 6, color: 0xb98cff });
    }
    // lingering arcs crawling around the impact point
    const arcs = big ? 5 : 2;
    for (let i = 0; i < arcs; i++) {
      vfx.after(0.08 + i * 0.07 + Math.random() * 0.05, () => {
        _p.copy(pos).add(_d.set(rnd(-1, 1), rnd(-0.2, 0.8), rnd(-1, 1)).multiplyScalar(0.8 * s * k));
        _q.copy(pos).add(_d.set(rnd(-1, 1), rnd(-0.2, 0.8), rnd(-1, 1)).multiplyScalar(0.9 * s * k));
        vfx.beam(_p, _q, { color: 0x9a60ff, width: 0.22, duration: 0.12, jagged: 1.5, branches: 0 });
        vfx.burst(_q, { count: 5, shape: 'spark', color: [0xffffff, 0xa070ff], speed: 4, drag: 3, size: 0.1, life: 0.25, velocityStretch: 0.04 });
      });
    }
    if (big) {
      vfx.dome(pos, { color: 0x8a50ff, radius: 3.2 * s, duration: 0.3, opacity: 0.6 });
      vfx.screenFlash(0xd8c4ff, 0.22 * Math.min(1.5, s), 0.18);
      // sky strike from above
      _q.copy(pos); _q.y += 14 * s; _q.x += rnd(-2, 2); _q.z += rnd(-2, 2);
      vfx.beam(_q, pos, { color: 0xa070ff, width: 1.0 * Math.sqrt(s), duration: 0.24, jagged: 1, branches: 4 });
      if (nearGround(pos)) vfx.shockwave(groundPt(pos), { color: 0xe6d8ff, radius: 5 * s, duration: 0.4, thickness: 0.05, opacity: 0.9, delay: 0.04 });
    }
  }

  // ---------------- WIND ----------------
  function wind(pos, s, big) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xc0ffd8, 0x40e890], size: 1.8 * s * k, sizeEnd: 2.4 * s * k, life: 0.12, lifeVar: 0, speed: 0, alpha: 0.5 });
    // swirling crescent streaks (orbit the center via curl)
    vfx.burst(pos, { count: Math.round(20 * s * k), shape: 'crescent', color: [0x60f8a8, 0x18c068], disc: true, radius: 0.5 * s, speed: 1.5 * s, tangential: 7 * Math.sqrt(s) * k,
      up: 1.2, curl: 7, drag: 1.2, size: 0.9 * s, sizeEnd: 1.3 * s, life: 0.55 * k, lifeVar: 0.15, velocityStretch: 0.03, alpha: 0.5 });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'streak', color: [0xb0ffd0, 0x30d880], disc: true, radius: 0.3 * s, speed: 6 * s, tangential: 4,
      up: 0.6, curl: 4, drag: 2.5, size: 0.35, sizeEnd: 0.1, life: 0.4, velocityStretch: 0.12, alpha: 0.85 });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'leaf', color: [0x76c94e, 0xb5e36a], disc: true, radius: 0.4 * s, speed: 3 * s, tangential: 5, up: 3.2,
      curl: 4, drag: 1.4, gravity: 2.2, size: 0.3, sizeEnd: 0.22, life: 1.8, lifeVar: 0.6, rotSpeed: 7, alpha: 1 });
    if (nearGround(pos)) {
      const gp = groundPt(pos);
      vfx.burst(gp, { count: Math.round(10 * s * k), shape: 'puff', color: [0xe8dcc0, 0xd4c8a8], alpha: 0.38, disc: true, radius: 0.4 * s, speed: 5 * s, drag: 3, up: 0.5,
        size: 0.7 * s, sizeEnd: 1.8 * s, life: 0.8, fadeIn: 0.1 });
      vfx.shockwave(gp, { color: 0x70f0b0, radius: 2.8 * s * k, duration: 0.45 * k, thickness: 0.3, opacity: 0.5 });
    }
    // translucent vortex rings stacked upward
    _p.copy(pos); _p.y += 0.3;
    vfx.shockwave(_p, { color: 0x40e890, radius: 1.8 * s * k, duration: 0.42 * k, thickness: 0.12, opacity: 0.55, flat: true });
    _p.y += 0.8 * s;
    vfx.shockwave(_p, { color: 0x70f0b0, radius: 1.3 * s * k, duration: 0.38 * k, thickness: 0.15, opacity: 0.45, flat: true, delay: 0.05 });
    vfx.flash(pos, { color: 0xa8ffd0, intensity: 1.6 * s * k, distance: 6 * s * k, duration: 0.25 });
    if (big) {
      vfx.dome(pos, { color: 0x40e890, radius: 3 * s, duration: 0.5, opacity: 0.3 });
      vfx.burst(pos, { count: Math.round(14 * s), shape: 'leaf', color: [0x5fb840, 0xd2ea78], disc: true, radius: 1.2 * s, speed: 2, tangential: 8, up: 6,
        curl: 5, drag: 1, gravity: 2.5, size: 0.32, life: 2.6, lifeVar: 0.6, rotSpeed: 8 });
      _p.copy(pos); _p.y += 1.8 * s;
      vfx.shockwave(_p, { color: 0x8fffc1, radius: 1.1 * s, duration: 0.5, thickness: 0.2, opacity: 0.4, flat: true, delay: 0.1 });
    }
  }

  // ---------------- EARTH ----------------
  function earth(pos, s, big, normal) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xfff0d0, 0xe0a85a], size: 1.8 * s * k, sizeEnd: 2.2 * s * k, life: 0.1, lifeVar: 0, speed: 0, alpha: 0.6 });
    vfx.debris(pos, { material: 'rock', count: Math.round(7 * s * k), size: 0.32 * Math.sqrt(s) * k, speed: 7 * Math.sqrt(s) * k, life: 2.2 });
    vfx.burst(pos, { count: Math.round(16 * s * k), shape: 'rock', color: [0x6b5236, 0x4a3826], speed: 7 * Math.sqrt(s), speedVar: 3, dir: normal || UP, spread: 0.55,
      gravity: 16, drag: 0.6, size: 0.16, sizeEnd: 0.12, life: 1.0, rotSpeed: 9, ground: true, alpha: 1 });
    const gp = (nearGround(pos) ? groundPt(pos) : pos).clone();
    vfx.burst(gp, { count: Math.round(12 * s * k), shape: 'puff', color: [0xc9a676, 0x9c8264], alpha: 0.55, disc: true, radius: 0.3 * s, speed: 4.5 * s * k, drag: 2.6, up: 1.2,
      size: 0.9 * s * k, sizeEnd: 2.4 * s * k, life: 1.3 * k, lifeVar: 0.4, fadeIn: 0.08 });
    vfx.burst(pos, { count: Math.round(6 * s * k), shape: 'smoke', color: [0xb89668, 0x8a7458], alpha: 0.5, speed: 1.6 * s, drag: 1.5, gravity: -1.2,
      size: 1.1 * s * k, sizeEnd: 2.8 * s * k, life: 1.6 * k, fadeIn: 0.1, radius: 0.3 * s });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'spark', color: [0xfff2c8, 0xe0a85a], speed: 7 * s, drag: 4, gravity: 6, size: 0.14, sizeEnd: 0.04, life: 0.35, velocityStretch: 0.05 });
    vfx.flash(pos, { color: 0xffbf6a, intensity: 3 * s * k, distance: 8 * s * k, duration: 0.3 });
    if (nearGround(pos)) {
      vfx.shockwave(gp, { color: 0xe0a85a, radius: 2.6 * s * k, duration: 0.4 * k, thickness: 0.3, opacity: 0.85 });
      vfx.shockwave(gp, { color: 0x8a6a48, radius: 3.0 * s * k, duration: 0.6 * k, thickness: 0.35, opacity: 0.45, blend: 'normal' });
      vfx.decal(pos, { type: 'crack', radius: 1.4 * s * k, duration: 10 });
    }
    if (big) {
      vfx.debris(pos, { material: 'rock', count: Math.round(6 * s), size: 0.55 * Math.sqrt(s), speed: 10, life: 2.8 });
      vfx.after(0.05, () => vfx.burst(gp, { count: Math.round(10 * s), shape: 'puff', color: [0xb8986c, 0x8c7458], alpha: 0.5, disc: true, radius: 1 * s, speed: 7 * s, drag: 2.2, up: 0.8,
        size: 1.4 * s, sizeEnd: 3.4 * s, life: 1.8, fadeIn: 0.1 }));
      if (nearGround(pos)) vfx.shockwave(gp, { color: 0xffd08a, radius: 5.5 * s, duration: 0.6, thickness: 0.16, opacity: 0.7, delay: 0.04 });
    }
  }

  function physical(pos, s, big, normal) {
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xffffff, 0xfff2d0], size: 1.2 * s, sizeEnd: 1.6 * s, life: 0.08, lifeVar: 0, speed: 0, alpha: 0.6 });
    vfx.burst(pos, { count: Math.round(10 * s), shape: 'spark', color: [0xffffff, 0xffe0a0], speed: 7 * s, dir: normal || UP, spread: normal ? 0.6 : 1, drag: 4, gravity: 5, size: 0.12, sizeEnd: 0.03, life: 0.3, velocityStretch: 0.05 });
    vfx.burst(pos, { count: 1, shape: 'ring', color: 0xffffff, size: 0.6 * s, sizeEnd: 1.8 * s, life: 0.16, lifeVar: 0, speed: 0, alpha: 0.7 });
    if (big) vfx.burst(pos, { count: Math.round(6 * s), shape: 'puff', color: [0xe0d8c8, 0xc0b8a8], alpha: 0.4, speed: 2, drag: 2, size: 0.6 * s, sizeEnd: 1.6 * s, life: 0.8 });
  }

  const FN = { fire, ice, lightning, wind, earth, physical };

  vfx0.impact = (pos, opts = {}) => {
    if (!pos) return;
    const s = Math.max(0.2, Math.min(4, opts.scale ?? 1));
    (FN[opts.element] || physical)(pos.clone(), s, false, opts.normal || null);
  };
  vfx0.explosion = (pos, opts = {}) => {
    if (!pos) return;
    const s = Math.max(0.3, Math.min(4, opts.scale ?? 1));
    (FN[opts.element] || physical)(pos.clone(), s, true, opts.normal || null);
    vfx.shake(Math.min(0.5, 0.15 + 0.12 * s));
    if (s >= 1.6) vfx.screenFlash(ELEMENT_COLORS[opts.element] ?? 0xffffff, Math.min(0.28, 0.08 * s), 0.25);
    if (s >= 1.2) vfx.fovKick(Math.min(6, 1.5 * s), 0.35);
  };
}
