// v3 element + reaction presets (CONTRACT §20, DESIGN §3 "dominant motion", §4.5 families, §9 S5/S6). Owner: combat.
//  - impact/explosion for the 4 new elements (water arcs & droplets, nature petals & vines, light pillars & rune,
//    shadow inward pull with a dark normal-blended core) + the enemy pseudo-element void; unknown → physical.
//  - preset(id, pos, opts): 'impact_<el>', 'explosion_<el>', 'rx_<reactionId>' (all 49 via ONE parametric recipe per
//    family × the reaction's two element ramps + one signature shape), plus bespoke signatures (S6) layered on top.
//  - Per-frame budget: ≤ 4 full reaction presets per frame; the rest play {reduced:true} (¼ particles, no decal).
// Everything is built from the existing pools (particles, rings, domes, decals, beams): no new materials, no lights.
import * as THREE from 'three';
import { ELEMENT_DEFS, elColor } from '../core/elements.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _g = new THREE.Vector3(), _o = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

// reaction id → its family + element pair (filled lazily from combat.REACTION_DEFS; static fallback keeps vfx standalone)
const FAMILY_OF = {
  melt: 'burst', shatter: 'burst', overload: 'burst', magma: 'burst', skyslam: 'burst', steam_burst: 'burst', burgeon: 'burst', hyperbloom: 'burst', radiant_burst: 'burst', eclipse: 'burst',
  electrocute: 'control', superconduct: 'control', flashfreeze: 'control', freeze_water: 'control', mudslide: 'control', grounded: 'control', quicken: 'control', frostbloom: 'control', entangle: 'control',
  swirl: 'spread', pollen: 'spread', aurora: 'spread', void_rift: 'spread', updraft: 'spread', fire_wave: 'spread', infusion: 'spread', wildfire: 'spread',
  evaporate: 'surface', electro_water: 'surface', obsidian: 'surface', sandstorm: 'surface', fire_tornado: 'surface', blizzard: 'surface', storm_tornado: 'surface',
  sanctify: 'blessing', holywater: 'blessing', photosynthesis: 'blessing', purify: 'blessing', bloom: 'blessing', crystallize: 'blessing', prism: 'blessing', judgment: 'blessing',
  necroflame: 'curse', miasma: 'curse', rot: 'curse', voidfrost: 'curse', blackbolt: 'curse',
  break: 'universal', resonance: 'universal',
};
const ELEMENTS_OF = {
  melt: ['fire', 'ice'], shatter: ['earth', 'ice'], overload: ['lightning', 'fire'], magma: ['earth', 'fire'], skyslam: ['earth', 'wind'], steam_burst: ['fire', 'ice'],
  burgeon: ['fire', 'nature'], hyperbloom: ['lightning', 'nature'], radiant_burst: ['lightning', 'light'], eclipse: ['shadow', 'light'], electrocute: ['lightning', 'water'],
  superconduct: ['lightning', 'ice'], flashfreeze: ['ice', 'water'], freeze_water: ['ice', 'water'], mudslide: ['earth', 'water'], grounded: ['earth', 'lightning'],
  quicken: ['lightning', 'nature'], frostbloom: ['ice', 'nature'], entangle: ['earth', 'nature'], swirl: ['wind', 'fire'], pollen: ['wind', 'nature'], aurora: ['wind', 'light'],
  void_rift: ['wind', 'shadow'], updraft: ['wind', 'wind'], fire_wave: ['wind', 'fire'], infusion: ['fire', 'earth'], wildfire: ['fire', 'nature'], evaporate: ['fire', 'water'],
  electro_water: ['lightning', 'water'], obsidian: ['water', 'fire'], sandstorm: ['wind', 'earth'], fire_tornado: ['wind', 'fire'], blizzard: ['wind', 'ice'],
  storm_tornado: ['wind', 'lightning'], sanctify: ['light', 'fire'], holywater: ['light', 'water'], photosynthesis: ['light', 'nature'], purify: ['light', 'shadow'],
  bloom: ['water', 'nature'], crystallize: ['earth', 'ice'], prism: ['light', 'ice'], judgment: ['light', 'light'], necroflame: ['shadow', 'fire'], miasma: ['shadow', 'water'],
  rot: ['shadow', 'nature'], voidfrost: ['shadow', 'ice'], blackbolt: ['lightning', 'shadow'], break: ['physical', 'physical'], resonance: ['light', 'light'],
};
const SHAPE_OK = { ember: 1, smoke: 1, shard: 1, snow: 1, spark: 1, bolt: 1, streak: 1, leaf: 1, rock: 1, puff: 1, droplet: 1, bubble: 1, petal: 1, thorn: 1, rune: 1, feather: 1, wisp: 1, raven: 1 };
const sigShape = (el) => { const s = ELEMENT_DEFS[el]?.shapes?.[0]; return s && SHAPE_OK[s] ? s : 'spark'; };
const altShape = (el) => { const s = ELEMENT_DEFS[el]?.shapes?.[1]; return s && SHAPE_OK[s] ? s : sigShape(el); };
const NORMAL = { smoke: 1, puff: 1, leaf: 1, rock: 1, petal: 1, feather: 1, raven: 1 };

export function installPresets2(vfx0, game) {
  const SZ = 1.35;
  const vfx = Object.create(vfx0);
  let kMul = 1, noDecal = false;
  vfx.burst = (p, o) => {
    if (o.count != null) o.count = Math.max(o.count > 0 ? 1 : 0, Math.round(o.count * kMul));
    if (o.size != null) o.size *= SZ;
    if (o.sizeEnd != null) o.sizeEnd *= SZ;
    if (o.additive == null && NORMAL[o.shape]) o.additive = false;
    return vfx0.burst(p, o);
  };
  vfx.decal = (p, o) => (noDecal ? null : vfx0.decal(p, o));
  const groundY = (p) => { try { return game.world?.getHeight?.(p.x, p.z) ?? 0; } catch (_) { return 0; } };
  const nearGround = (p, h = 1.8) => p.y - groundY(p) < h;
  const gpt = (p) => _g.set(p.x, groundY(p), p.z);
  const C = (el, part) => elColor(el, part);

  // ---------------------------------------------------------------- new elements
  function water(pos, s, big, normal) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xffffff, 0x7fd3ff], size: 1.8 * s * k, sizeEnd: 2.4 * s * k, life: 0.1, lifeVar: 0, speed: 0, alpha: 0.6 });
    // splash crown: droplets arcing up and out under gravity
    vfx.burst(pos, { count: Math.round(22 * s * k), shape: 'droplet', color: [0xe8f8ff, 0x4fb4ff], dir: normal || UP, spread: 0.55, speed: 7 * Math.sqrt(s) * k, speedVar: 2.5,
      gravity: 16, drag: 0.6, size: 0.24, sizeEnd: 0.14, life: 0.9 * k, velocityStretch: 0.05, ground: true, alpha: 1 });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'bubble', color: [0xffffff, 0x9fdcff], speed: 2.2 * s, drag: 2, gravity: -1.5, size: 0.2, sizeEnd: 0.32, life: 0.9, radius: 0.4 * s });
    vfx.burst(pos, { count: Math.round(5 * s * k), shape: 'soft', color: [0x7fd3ff, 0x1f6fb8], speed: 1, size: 1.3 * s * k, sizeEnd: 2 * s * k, life: 0.35, alpha: 0.4 });
    vfx.burst(pos, { count: Math.round(6 * s * k), shape: 'puff', color: [0xf4fbff, 0xbfe4ff], alpha: 0.4, disc: true, radius: 0.3 * s, speed: 3.5 * s, drag: 3, up: 0.6, size: 0.6 * s, sizeEnd: 1.6 * s, life: 0.8 });
    vfx.flash(pos, { color: 0x7fd3ff, intensity: 2.5 * s * k, distance: 7 * s * k, duration: 0.22 });
    if (nearGround(pos)) {
      const g = gpt(pos);
      vfx.shockwave(g, { color: 0xbfe8ff, radius: 2.4 * s * k, duration: 0.5 * k, thickness: 0.12, opacity: 0.85 });   // foam ring
      vfx.shockwave(g, { color: 0x4fb4ff, radius: 1.6 * s * k, duration: 0.6 * k, thickness: 0.3, opacity: 0.5, delay: 0.08 });
      vfx.decal(pos, { type: 'ripple', radius: 1.6 * s * k, duration: 6 });
    }
    if (big) {
      vfx.dome(pos, { color: 0x4fb4ff, radius: 3 * s, duration: 0.45, opacity: 0.45 });
      for (let i = 0; i < 6; i++) {   // water arcs: short curved jets
        const a = (i / 6) * Math.PI * 2;
        _d.set(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize();
        vfx.burst(pos, { count: 5, shape: 'droplet', color: [0xffffff, 0x7fd3ff], dir: _d, spread: 0.08, speed: 9 * Math.sqrt(s), gravity: 18, size: 0.3, sizeEnd: 0.18, life: 0.9, velocityStretch: 0.06 });
      }
    }
  }
  function nature(pos, s, big, normal) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xf4ffd0, 0x8fe05a], size: 1.6 * s * k, sizeEnd: 2.2 * s * k, life: 0.12, lifeVar: 0, speed: 0, alpha: 0.55 });
    vfx.burst(pos, { count: Math.round(16 * s * k), shape: 'petal', color: [0xf4ffd0, 0x8fe05a], speed: 4 * s * k, speedVar: 2, up: 1.5, curl: 2.5, drag: 2, gravity: 1.2,
      size: 0.28, sizeEnd: 0.2, life: 1.6 * k, lifeVar: 0.5, rotSpeed: 5, sway: true });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'thorn', color: [0xd8ff9a, 0x2f7d3a], dir: normal || UP, spread: normal ? 0.55 : 0.9, speed: 9 * Math.sqrt(s) * k,
      drag: 4, size: 0.42, sizeEnd: 0.18, life: 0.4, velocityStretch: 0.06 });
    vfx.burst(pos, { count: Math.round(6 * s * k), shape: 'puff', color: [0xc8f08a, 0x6fae3a], alpha: 0.42, speed: 1.4 * s, drag: 1.6, gravity: -0.6, size: 0.8 * s, sizeEnd: 2 * s, life: 1.6, fadeIn: 0.15, radius: 0.3 * s });
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'mote', color: [0xf4ffd0, 0xa8f060], speed: 1.2 * s, up: 1.2, drag: 1.5, size: 0.18, sizeEnd: 0.06, life: 1.4, radius: 0.5 * s, flicker: true });
    vfx.flash(pos, { color: 0x9be86a, intensity: 2 * s * k, distance: 6 * s * k, duration: 0.25 });
    if (nearGround(pos)) {
      vfx.shockwave(gpt(pos), { color: 0x8fe05a, radius: 2.2 * s * k, duration: 0.55 * k, thickness: 0.25, opacity: 0.6 });
      vfx.decal(pos, { type: 'flowers', radius: 1.5 * s * k, duration: 9 });
    }
    if (big) {
      vfx.dome(pos, { color: 0x7fd84a, radius: 2.8 * s, duration: 0.55, opacity: 0.35 });
      vfx.burst(pos, { count: Math.round(14 * s), shape: 'leaf', color: [0x5fb840, 0xd2ea78], disc: true, radius: 1 * s, speed: 2, tangential: 6, up: 4, curl: 4, drag: 1, gravity: 2, size: 0.32, life: 2.2, rotSpeed: 6 });
    }
  }
  function light(pos, s, big) {
    const k = big ? 1.6 : 1;
    vfx.burst(pos, { count: 1, shape: 'flare', color: [0xffffff, 0xffe9a8], size: 2.8 * s * k, sizeEnd: 1.6 * s * k, life: 0.14 * k, lifeVar: 0, speed: 0, alpha: 1 });
    // vertical pillar + radial rays + rising motes
    vfx.burst(pos, { count: Math.round(10 * s * k), shape: 'streak', color: [0xffffff, 0xffc24a], dir: UP, spread: 0.06, speed: 12 * s * k, drag: 3, size: 0.6, sizeEnd: 0.15, life: 0.35, velocityStretch: 0.1 });
    vfx.burst(pos, { count: Math.round(14 * s * k), shape: 'spark', color: [0xffffff, 0xffd36a], disc: true, speed: 9 * Math.sqrt(s) * k, drag: 4, size: 0.2, sizeEnd: 0.04, life: 0.35, velocityStretch: 0.06 });
    vfx.burst(pos, { count: Math.round(12 * s * k), shape: 'mote', color: [0xffffff, 0xffe08a], radius: 0.6 * s, speed: 0.6, up: 2.4, drag: 1, size: 0.2, sizeEnd: 0.05, life: 1.4, lifeVar: 0.4, flicker: true });
    vfx.burst(pos, { count: Math.round(5 * s * k), shape: 'feather', color: [0xffffff, 0xffe9a8], speed: 2.2 * s, up: 1, drag: 2.4, gravity: 1.2, size: 0.34, sizeEnd: 0.26, life: 1.6, rotSpeed: 3, sway: true });
    vfx.burst(pos, { count: 2, shape: 'soft', color: [0xffe9a8, 0xffc24a], speed: 0, size: 2.2 * s * k, sizeEnd: 3 * s * k, life: 0.4, alpha: 0.45 });
    vfx.flash(pos, { color: 0xffe08a, intensity: 4 * s * k, distance: 9 * s * k, duration: 0.28 });
    if (nearGround(pos)) {
      vfx.shockwave(gpt(pos), { color: 0xffe08a, radius: 2.4 * s * k, duration: 0.4, thickness: 0.08, opacity: 0.9 });
      vfx.decal(pos, { type: 'rune', radius: 1.3 * s * k, duration: 5, color: 0xffd36a });
    }
    if (big) {
      _q.copy(pos); _q.y += 12 * s;
      vfx.beam(_q, pos, { color: 0xffe08a, width: 1.1 * Math.sqrt(s), duration: 0.35, jagged: 0.02, segments: 3 });
      vfx.runeCircle?.(nearGround(pos) ? gpt(pos) : pos, { element: 'light', r: 2.2 * s, dur: 1.1, rotSpeed: 1.2 });
      vfx.dome(pos, { color: 0xffd36a, radius: 3.2 * s, duration: 0.4, opacity: 0.5 });
    }
  }
  function shadow(pos, s, big) {
    const k = big ? 1.6 : 1;
    // dark core (normal-blended), violet rim, particles pulled INWARD
    vfx.burst(pos, { count: Math.round(6 * s * k), shape: 'smoke', color: [0x2a1240, 0x0a0612], alpha: 0.8, additive: false, speed: 0.6, size: 0.9 * s * k, sizeEnd: 1.8 * s * k, life: 0.7, radius: 0.2 * s });
    vfx.burst(pos, { count: Math.round(20 * s * k), shape: 'wisp', color: [0xe0b0ff, 0xb14bff], radius: 1.6 * s * k, inward: true, speed: 5 * s * k, drag: 0.5, size: 0.32, sizeEnd: 0.06, life: 0.4, velocityStretch: 0.04 });
    vfx.burst(pos, { count: Math.round(8 * s * k), shape: 'spark', color: [0xffffff, 0xb14bff], speed: 6 * s, drag: 4, size: 0.16, sizeEnd: 0.04, life: 0.3, velocityStretch: 0.05 });
    vfx.burst(pos, { count: 1, shape: 'ring', color: 0xb14bff, size: 2.6 * s * k, sizeEnd: 0.4 * s, life: 0.25, lifeVar: 0, speed: 0, alpha: 0.9 });
    vfx.flash(pos, { color: 0x9a5cff, intensity: 2.2 * s * k, distance: 7 * s * k, duration: 0.25 });
    if (nearGround(pos)) {
      vfx.shockwave(gpt(pos), { color: 0x5b2a8a, radius: 2.2 * s * k, duration: 0.5, thickness: 0.4, opacity: 0.55, blend: 'normal' });
      vfx.decal(pos, { type: 'violet', radius: 1.3 * s * k, duration: 8 });
    }
    if (big) {
      vfx.burst(pos, { count: Math.round(6 * s), shape: 'raven', color: [0x2a1240, 0x5b2a8a], speed: 6, up: 2.5, drag: 1, size: 0.6, sizeEnd: 0.4, life: 1.1, rotSpeed: 0, additive: false, alpha: 0.95 });
      vfx.dome(pos, { color: 0x7a3cff, radius: 2.6 * s, duration: 0.5, opacity: 0.5 });
      vfx.after(0.1, () => vfx.burst(pos, { count: Math.round(10 * s), shape: 'wisp', color: [0xffffff, 0xb14bff], speed: 9 * s, drag: 2, size: 0.4, sizeEnd: 0.1, life: 0.5, velocityStretch: 0.05 }));
    }
  }
  function voidEl(pos, s, big) {
    const k = big ? 1.5 : 1;
    vfx.burst(pos, { count: Math.round(8 * s * k), shape: 'smoke', color: [0x1a0b2e, 0x050208], alpha: 0.85, additive: false, speed: 1, size: 1 * s * k, sizeEnd: 2.2 * s * k, life: 0.8 });
    vfx.burst(pos, { count: Math.round(16 * s * k), shape: 'mote', color: [0xb98bff, 0x7a3cff], radius: 1.4 * s, inward: true, speed: 4 * s, size: 0.22, sizeEnd: 0.05, life: 0.45 });
    vfx.flash(pos, { color: 0x7a3cff, intensity: 2 * s * k, distance: 6 * s, duration: 0.25 });
    if (nearGround(pos)) vfx.decal(pos, { type: 'violet', radius: 1.4 * s * k, duration: 7 });
  }
  const NEW_FN = { water, nature, light, shadow, void: voidEl };

  // chain the legacy impact/explosion (5 classic + physical) with the new elements
  const oldImpact = vfx0.impact, oldExplosion = vfx0.explosion;
  vfx0.impact = (pos, opts = {}) => {
    if (!pos) return;
    const f = NEW_FN[opts.element];
    if (!f) return oldImpact(pos, opts);
    const s = Math.max(0.2, Math.min(4, opts.scale ?? 1));
    f(_o.copy(pos).clone(), s, false, opts.normal || null);
  };
  vfx0.explosion = (pos, opts = {}) => {
    if (!pos) return;
    const f = NEW_FN[opts.element];
    if (!f) return oldExplosion(pos, opts);
    const s = Math.max(0.3, Math.min(4, opts.scale ?? 1));
    f(pos.clone(), s, true, opts.normal || null);
    vfx0.shake(Math.min(0.5, 0.15 + 0.12 * s));
    if (s >= 1.6) vfx0.screenFlash(elColor(opts.element), Math.min(0.28, 0.08 * s), 0.25);
    if (s >= 1.2) vfx0.fovKick(Math.min(6, 1.5 * s), 0.35);
  };

  // ---------------------------------------------------------------- reaction family recipes (parametric)
  // a, b = the two element ramps; sig = the trigger element's signature shape. s = scale.
  const FAM = {
    burst(p, a, b, s, sig) {
      vfx.burst(p, { count: 1, shape: 'flare', color: [C(a, 'core'), C(b, 'mid')], size: 3.2 * s, sizeEnd: 2 * s, life: 0.14, lifeVar: 0, speed: 0, alpha: 1 });
      vfx.burst(p, { count: Math.round(26 * s), shape: 'spark', color: [C(a, 'core'), C(a, 'mid')], speed: 14 * Math.sqrt(s), drag: 2.5, gravity: 5, size: 0.18, sizeEnd: 0.04, life: 0.5, velocityStretch: 0.06 });
      vfx.burst(p, { count: Math.round(18 * s), shape: sig, color: [C(b, 'mid'), C(b, 'edge')], speed: 9 * Math.sqrt(s), drag: 2, gravity: 6, size: 0.32, sizeEnd: 0.12, life: 0.8, velocityStretch: 0.03 });
      vfx.burst(p, { count: Math.round(8 * s), shape: 'smoke', color: [0x6e5a4e, 0x3a302a], alpha: 0.45, speed: 2.4 * s, drag: 1.4, gravity: -2, size: 1 * s, sizeEnd: 2.8 * s, life: 1.3, fadeIn: 0.15, radius: 0.4 * s });
      vfx.dome(p, { color: C(a, 'mid'), radius: 3.4 * s, duration: 0.4, opacity: 0.55 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: C(b, 'mid'), radius: 5 * s, duration: 0.45, thickness: 0.18, opacity: 0.85 });
      vfx.flash(p, { color: C(a, 'mid'), intensity: 6 * s, distance: 12 * s, duration: 0.3 });
      if (nearGround(p)) vfx.decal(p, { type: 'scorch', radius: 2 * s, duration: 8, color: C(a, 'mid') });
    },
    control(p, a, b, s, sig) {
      vfx.burst(p, { count: 1, shape: 'flare', color: [0xffffff, C(a, 'mid')], size: 2.4 * s, sizeEnd: 1.4 * s, life: 0.12, lifeVar: 0, speed: 0, alpha: 0.9 });
      // contracting ring (binding) + hard shards locking in
      vfx.burst(p, { count: 1, shape: 'ring', color: C(b, 'mid'), size: 4 * s, sizeEnd: 0.6 * s, life: 0.32, lifeVar: 0, speed: 0, alpha: 1 });
      vfx.burst(p, { count: Math.round(18 * s), shape: sig, color: [C(a, 'core'), C(a, 'edge')], radius: 1.8 * s, inward: true, speed: 6 * s, drag: 0.4, size: 0.3, sizeEnd: 0.1, life: 0.3, velocityStretch: 0.04 });
      vfx.burst(p, { count: Math.round(14 * s), shape: altShape(b), color: [C(b, 'core'), C(b, 'mid')], speed: 4 * s, drag: 2.5, size: 0.22, sizeEnd: 0.08, life: 0.7 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: C(a, 'mid'), radius: 4 * s, duration: 0.5, thickness: 0.1, opacity: 0.9 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: C(b, 'edge'), radius: 2.4 * s, duration: 0.7, thickness: 0.35, opacity: 0.5, delay: 0.06 });
      vfx.flash(p, { color: C(a, 'mid'), intensity: 4 * s, distance: 9 * s, duration: 0.25 });
      if (nearGround(p)) vfx.decal(p, { type: a === 'ice' || b === 'ice' ? 'frost' : a === 'lightning' ? 'lichtenberg' : 'crack', radius: 1.8 * s, duration: 7 });
    },
    spread(p, a, b, s, sig) {
      vfx.burst(p, { count: Math.round(28 * s), shape: 'crescent', color: [C(b, 'mid'), C(a, 'edge')], disc: true, radius: 0.6 * s, speed: 2 * s, tangential: 9 * Math.sqrt(s), up: 1.2, curl: 7, drag: 1, size: 1 * s, sizeEnd: 1.6 * s, life: 0.6, velocityStretch: 0.03, alpha: 0.6 });
      vfx.burst(p, { count: Math.round(20 * s), shape: altShape(b) === 'smoke' ? 'ember' : altShape(b), color: [C(b, 'core'), C(b, 'mid')], disc: true, radius: 0.5 * s, speed: 10 * s, tangential: 4, up: 1, drag: 2.2, size: 0.24, sizeEnd: 0.1, life: 0.8 });
      vfx.burst(p, { count: Math.round(10 * s), shape: 'leaf', color: [0x76c94e, 0xb5e36a], disc: true, radius: 0.4 * s, speed: 4, tangential: 6, up: 3, curl: 4, drag: 1.4, gravity: 2, size: 0.28, life: 1.6, rotSpeed: 7 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: C(b, 'mid'), radius: 7 * s, duration: 0.6, thickness: 0.12, opacity: 0.7 });
      _p.copy(p); _p.y += 0.6;
      vfx.shockwave(_p, { color: C(a, 'mid'), radius: 2.2 * s, duration: 0.45, thickness: 0.14, opacity: 0.55, flat: true });
      vfx.flash(p, { color: C(b, 'mid'), intensity: 2.5 * s, distance: 8 * s, duration: 0.25 });
      void sig;
    },
    surface(p, a, b, s, sig) {
      const g = nearGround(p) ? gpt(p).clone() : p.clone();
      vfx.burst(g, { count: Math.round(14 * s), shape: 'smoke', color: [0xffffff, 0xd8e4ee], alpha: 0.55, disc: true, radius: 1.2 * s, speed: 2.5 * s, up: 2.4, drag: 1.6, gravity: -1, size: 1.2 * s, sizeEnd: 3 * s, life: 1.6, fadeIn: 0.12 });
      vfx.burst(g, { count: Math.round(20 * s), shape: sig, color: [C(a, 'core'), C(a, 'mid')], disc: true, radius: 2 * s, speed: 1.5, up: 4 * s, drag: 1.8, size: 0.26, sizeEnd: 0.1, life: 0.9, velocityStretch: 0.04 });
      vfx.burst(g, { count: Math.round(10 * s), shape: altShape(b), color: [C(b, 'core'), C(b, 'mid')], disc: true, radius: 2.6 * s, speed: 0.5, up: 1.5, size: 0.22, life: 1.2 });
      vfx.shockwave(g, { color: C(b, 'mid'), radius: 4 * s, duration: 0.7, thickness: 0.4, opacity: 0.55 });
      vfx.shockwave(g, { color: C(a, 'mid'), radius: 3 * s, duration: 0.5, thickness: 0.1, opacity: 0.9, delay: 0.05 });
      vfx.flash(p, { color: C(a, 'mid'), intensity: 3 * s, distance: 8 * s, duration: 0.3 });
      vfx.decal(g, { type: b === 'water' || a === 'water' ? 'ripple' : 'scorch', radius: 2.4 * s, duration: 7, color: C(a, 'mid') });
    },
    blessing(p, a, b, s, sig) {
      vfx.burst(p, { count: 1, shape: 'flare', color: [0xffffff, C(a, 'mid')], size: 3 * s, sizeEnd: 2 * s, life: 0.16, lifeVar: 0, speed: 0, alpha: 1 });
      vfx.burst(p, { count: Math.round(16 * s), shape: 'mote', color: [0xffffff, C(a, 'mid')], radius: 1.2 * s, speed: 0.6, up: 3.2, drag: 0.8, size: 0.22, sizeEnd: 0.05, life: 1.4, flicker: true });
      vfx.burst(p, { count: Math.round(10 * s), shape: 'streak', color: [0xffffff, C(a, 'edge')], dir: UP, spread: 0.08, speed: 13 * s, drag: 3, size: 0.5, sizeEnd: 0.12, life: 0.35, velocityStretch: 0.1 });
      vfx.burst(p, { count: Math.round(12 * s), shape: sig === 'rune' ? altShape(b) : sig, color: [C(b, 'core'), C(b, 'mid')], speed: 3 * s, up: 1.2, drag: 2, size: 0.28, sizeEnd: 0.14, life: 1.2, sway: true });
      vfx.runeCircle?.(nearGround(p) ? gpt(p) : p, { element: a, r: 2 * s, dur: 1.2, rotSpeed: 1.4 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: C(a, 'mid'), radius: 3.6 * s, duration: 0.6, thickness: 0.1, opacity: 0.8 });
      vfx.flash(p, { color: C(a, 'mid'), intensity: 4 * s, distance: 10 * s, duration: 0.35 });
    },
    curse(p, a, b, s, sig) {
      vfx.burst(p, { count: Math.round(8 * s), shape: 'smoke', color: [0x2a1240, 0x0a0612], alpha: 0.75, additive: false, speed: 1, size: 1.1 * s, sizeEnd: 2.6 * s, life: 1.1, radius: 0.4 * s });
      vfx.burst(p, { count: Math.round(22 * s), shape: 'wisp', color: [0xe0b0ff, C(a, 'edge')], radius: 2.2 * s, inward: true, speed: 6 * s, drag: 0.4, size: 0.34, sizeEnd: 0.06, life: 0.45, velocityStretch: 0.04 });
      vfx.burst(p, { count: Math.round(14 * s), shape: altShape(b) === 'smoke' ? 'ember' : sigShape(b), color: [C(b, 'mid'), 0x5b2a8a], speed: 3 * s, up: 1.8, drag: 1.5, size: 0.26, sizeEnd: 0.1, life: 1.1 });
      vfx.burst(p, { count: 1, shape: 'ring', color: 0xb14bff, size: 3.4 * s, sizeEnd: 0.3 * s, life: 0.35, lifeVar: 0, speed: 0, alpha: 1 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: 0x5b2a8a, radius: 3.4 * s, duration: 0.6, thickness: 0.4, opacity: 0.55, blend: 'normal' });
      vfx.flash(p, { color: 0x9a5cff, intensity: 3 * s, distance: 8 * s, duration: 0.3 });
      if (nearGround(p)) vfx.decal(p, { type: 'violet', radius: 2 * s, duration: 8 });
      void sig;
    },
    universal(p, a, b, s) {
      vfx.burst(p, { count: 1, shape: 'flare', color: [0xffffff, 0xffffff], size: 4 * s, sizeEnd: 2 * s, life: 0.16, lifeVar: 0, speed: 0, alpha: 1 });
      vfx.burst(p, { count: Math.round(30 * s), shape: 'shard', color: [0xffffff, 0xd8d0ff], speed: 12 * s, drag: 2.5, gravity: 8, size: 0.36, sizeEnd: 0.12, life: 0.7, velocityStretch: 0.05 });
      vfx.burst(p, { count: Math.round(18 * s), shape: 'star', color: [0xffffff, 0xffe9a8], speed: 5 * s, drag: 2.5, size: 0.3, sizeEnd: 0.06, life: 0.6 });
      vfx.shockwave(nearGround(p) ? gpt(p) : p, { color: 0xffffff, radius: 6 * s, duration: 0.5, thickness: 0.08, opacity: 1 });
      vfx.dome(p, { color: 0xffffff, radius: 3 * s, duration: 0.35, opacity: 0.6 });
      void a; void b;
    },
  };

  // ---------------------------------------------------------------- bespoke signatures (DESIGN §9 S6), layered on the family recipe
  const SIG = {
    evaporate(p, s) {   // white billows
      vfx.burst(p, { count: Math.round(14 * s), shape: 'smoke', color: [0xffffff, 0xeef4f8], alpha: 0.75, speed: 3.2 * s, up: 1.6, drag: 1.2, gravity: -1.2, size: 1.4 * s, sizeEnd: 3.8 * s, life: 2.2, fadeIn: 0.1, radius: 0.6 * s });
    },
    superconduct(p, s) {   // blue sparks + frost ring
      vfx.burst(p, { count: Math.round(30 * s), shape: 'spark', color: [0xffffff, 0x6fb8ff], speed: 13 * s, drag: 3, size: 0.16, sizeEnd: 0.03, life: 0.45, velocityStretch: 0.06 });
      vfx.burst(p, { count: Math.round(20 * s), shape: 'snow', color: [0xffffff, 0x9feaff], disc: true, speed: 6 * s, drag: 2, size: 0.2, life: 1 });
      vfx.groundDecal?.('frost', nearGround(p) ? gpt(p) : p, 2.8 * s, 6);
    },
    wildfire(p, s) {   // petal-embers
      vfx.burst(p, { count: Math.round(24 * s), shape: 'petal', color: [0xffd060, 0xff3a10], speed: 4 * s, up: 3, curl: 3, drag: 1.4, gravity: -1, size: 0.26, sizeEnd: 0.08, life: 1.6, flicker: true, additive: true, rotSpeed: 5 });
    },
    sanctify(p, s) {   // white-gold flame
      vfx.burst(p, { count: Math.round(16 * s), shape: 'ember', color: [0xffffff, 0xffc24a], radius: 0.6 * s, up: 4, speed: 1.2, drag: 1, size: 0.32, sizeEnd: 0.06, life: 1, flicker: true });
      vfx.burst(p, { count: Math.round(5 * s), shape: 'puff', color: [0xfff4d0, 0xffd36a], alpha: 0.6, additive: true, speed: 1, up: 2.5, size: 0.8 * s, sizeEnd: 1.6 * s, life: 0.7 });
    },
    necroflame(p, s) {   // inverted violet flame: dark core, bright violet rim, falling embers
      vfx.burst(p, { count: Math.round(14 * s), shape: 'ember', color: [0xe0b0ff, 0x5b2a8a], radius: 0.5 * s, up: 3.6, speed: 1, size: 0.3, sizeEnd: 0.05, life: 1.1, flicker: true });
      vfx.burst(p, { count: Math.round(6 * s), shape: 'puff', color: [0x2a1240, 0x0a0612], alpha: 0.85, additive: false, up: 2.2, speed: 0.6, size: 0.7 * s, sizeEnd: 1.6 * s, life: 0.9 });
    },
    prism(p, s) {   // three coloured rays
      const cols = [0xffe08a, 0x9fe8ff, 0xffb0e0];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.random();
        _q.set(p.x + Math.cos(a) * 5 * s, p.y + 0.6, p.z + Math.sin(a) * 5 * s);
        vfx.beam(p, _q, { color: cols[i], width: 0.22, duration: 0.35, jagged: 0.01, segments: 2 });
      }
    },
    judgment(p, s) {   // a sky pillar with a rune circle
      const g = nearGround(p) ? gpt(p).clone() : p.clone();
      _q.copy(g); _q.y += 22;
      vfx.beam(_q, g, { color: 0xffe9a8, width: 2.2 * s, duration: 0.55, jagged: 0.0, segments: 2 });
      vfx.beam(_q, g, { color: 0xffffff, width: 0.8 * s, duration: 0.45, jagged: 0.0, segments: 2 });
      vfx.runeCircle?.(g, { element: 'light', r: 3 * s, dur: 1.6, rotSpeed: 2 });
      vfx.burst(g, { count: Math.round(30 * s), shape: 'feather', color: [0xffffff, 0xffe08a], disc: true, radius: 1.2 * s, speed: 5 * s, up: 3, drag: 2, gravity: 1, size: 0.34, life: 1.8, sway: true });
      vfx.screenFlash?.(0xfff4d0, 0.18, 0.25);
    },
    shatter(p, s) { vfx.debris(p, { count: Math.round(16 * s), material: 'ice', color: 0xc8f6ff, size: 0.35, speed: 11, life: 1.6 }); },
    magma(p, s) {
      const g = nearGround(p) ? gpt(p).clone() : p.clone();
      vfx.debris(g, { count: Math.round(12 * s), material: 'rock', color: 0x5a2a18, size: 0.32, speed: 12 });
      vfx.burst(g, { count: Math.round(30 * s), shape: 'ember', color: [0xffd060, 0xff3a00], speed: 14, dir: UP, spread: 0.35, size: 0.2, life: 1.1, gravity: -16 });
    },
    eclipse(p, s) {
      vfx.burst(p, { count: 1, shape: 'soft', color: [0x0a0612, 0x0a0612], additive: false, size: 3 * s, sizeEnd: 0.4 * s, life: 0.6, lifeVar: 0, speed: 0, alpha: 0.9 });
      vfx.burst(p, { count: 1, shape: 'ring', color: 0xffe08a, size: 3.4 * s, sizeEnd: 3 * s, life: 0.6, lifeVar: 0, speed: 0, alpha: 1 });
    },
    resonance(p, s) {
      for (let i = 0; i < 3; i++) vfx.after(i * 0.08, () => vfx.shockwave(p, { color: [0xff7a3a, 0x8fd8ff, 0xffe08a][i], radius: (3 + i * 2) * s, duration: 0.5, thickness: 0.1, opacity: 0.9, flat: true }));
      vfx.burst(p, { count: Math.round(24 * s), shape: 'rune', color: [0xffffff, 0xffe08a], disc: true, radius: 0.6, speed: 5 * s, up: 1, size: 0.34, sizeEnd: 0.1, life: 0.9 });
    },
    break(p, s) {
      vfx.burst(p, { count: Math.round(24 * s), shape: 'shard', color: [0xffffff, 0xb9c8ff], speed: 15 * s, drag: 2, gravity: 10, size: 0.42, life: 0.9, velocityStretch: 0.06 });
    },
  };

  // ---------------------------------------------------------------- preset dispatcher + per-frame budget
  let fullThisFrame = 0, maxFull = 0, reducedCount = 0, presetCount = 0;
  function rxMeta(id) {
    const defs = game.combat?.REACTION_DEFS;
    if (defs && !rxMeta.filled) {
      for (const r of defs) { if (!FAMILY_OF[r.id]) FAMILY_OF[r.id] = r.family; if (!ELEMENTS_OF[r.id]) ELEMENTS_OF[r.id] = r.elements; }
      rxMeta.filled = true;
    }
    return { family: FAMILY_OF[id] || 'burst', els: ELEMENTS_OF[id] || ['physical', 'physical'] };
  }
  function preset(id, pos, opts = {}) {
    if (!pos || !id) return false;
    presetCount++;
    const p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
    const s = Math.max(0.3, Math.min(3, opts.scale ?? 1));
    if (id.startsWith('impact_')) { vfx0.impact(p, { element: id.slice(7), scale: s, normal: opts.dir || null }); return true; }
    if (id.startsWith('explosion_')) { vfx0.explosion(p, { element: id.slice(10), scale: s }); return true; }
    const rid = id.startsWith('rx_') ? id.slice(3) : id;
    let reduced = !!opts.reduced;
    if (!reduced) { if (fullThisFrame >= 4) reduced = true; else fullThisFrame++; }
    if (fullThisFrame > maxFull) maxFull = fullThisFrame;
    if (reduced) reducedCount++;
    const m = rxMeta(rid);
    const els = opts.elements || m.els;
    let a = els[0] === 'physical' ? (els[1] || 'physical') : els[0], b = els[1] || a;
    if (opts.colorEl) b = opts.colorEl;
    const fam = FAM[opts.family || m.family] || FAM.burst;
    kMul = reduced ? 0.25 : 1; noDecal = reduced;
    try {
      fam(p, a, b, s, sigShape(a));
      if (!reduced) SIG[rid]?.(p, s);
    } finally { kMul = 1; noDecal = false; }
    return true;
  }
  vfx0.preset = preset;
  vfx0._presetFrame = () => { fullThisFrame = 0; };
  vfx0.presetStats = () => ({ maxFullPerFrame: maxFull, reduced: reducedCount, presets: presetCount });
  vfx0.resetPresetStats = () => { maxFull = 0; reducedCount = 0; presetCount = 0; };
  vfx0.PRESET_FAMILIES = Object.keys(FAM);
  void DOWN; void rnd;
}
