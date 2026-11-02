// 필살기 cinematic template (gameplay mode, ≈4.3 s), shared by sword & magic finishers:
// freeze-frame + letterbox → close shot of the hero with element aura & calligraphic name splash →
// orbit/rise power-up → wide shot of the blow landing on `center` (onImpact) → camera blends back to gameplay.
import * as THREE from 'three';
import { ELEMENT_COLORS, clamp } from '../core/utils.js';
import { makeRune, makePillar, glowTex } from './assets.js';

export function buildFinisher(C, o = {}) {
  const { game, ov, EASE } = C;
  const el = o.element || 'fire';
  const col = ELEMENT_COLORS[el] ?? 0xffffff;
  const vfx = game.vfx;
  const sfx = (n, x) => { try { game.audio?.play?.(n, x); } catch (_) { /* */ } };
  const pObj = game.player?.object;
  const hero = () => (pObj ? pObj.position : (o.center || new THREE.Vector3()));
  const center = (o.center || o.target?.object?.position || hero()).clone();
  const stage = C.stage();

  // direction hero → target (horizontal), side vector
  const dir = new THREE.Vector3(), side = new THREE.Vector3();
  const updDir = () => {
    dir.copy(center).sub(hero()); dir.y = 0;
    if (dir.lengthSq() < 0.25) { const yaw = pObj?.rotation?.y || 0; dir.set(Math.sin(yaw), 0, Math.cos(yaw)); }
    dir.normalize(); side.set(dir.z, 0, -dir.x);
  };
  updDir();
  const P = new THREE.Vector3(), L = new THREE.Vector3();
  const at = (fwd, up, sd, out = P) => out.copy(hero()).addScaledVector(dir, fwd).addScaledVector(side, sd).setY(hero().y + up);

  // aura set pieces (real-time animated)
  const rune = makeRune(stage, col, 2.6);
  const pillar = makePillar(stage, col, 1.1, 14);
  const glow = stage.sprite(col, 2.5, glowTex(), 0); stage.add(glow);
  let aura = null, T = 0, buildT = 0, impacted = false;
  const BUILD = 0.3 + 1.3 + 0.9;
  // wide shot side: cheapest of 4 candidate placements (±side × ±30° swing), scored on collider penetration,
  // terrain, and line of sight camera → hero chest (props / trees / huts in between)
  let wideSide = 1, wideRot = 0;
  const OCC_H = { tree: 9, house: 7.5, windmill: 12, tower: 9, pillar: 9, arch: 8, hut: 5, tent: 3.5, totem: 3.2, stake: 2.8, rack: 2, well: 2.4, stall: 3.2, gate: 5 };
  const qOut = [], sp = new THREE.Vector3(), cq = new THREE.Vector3();
  const occluded = (a, b) => {
    const w = game.world; if (!w?.queryColliders) return 0;
    const cols = w.queryColliders(Math.min(a.x, b.x) - 2, Math.min(a.z, b.z) - 2, Math.max(a.x, b.x) + 2, Math.max(a.z, b.z) + 2, qOut);
    let n = 0;
    for (let i = 1; i <= 6; i++) {
      sp.lerpVectors(a, b, i / 7);
      for (const c of cols) {
        const hgt = c.top != null ? c.top - C.groundY(c.x, c.z) : (c.kind === 'rock' ? c.r * 1.3 : OCC_H[c.kind] || 0);
        if (!hgt) continue;
        const dx = sp.x - c.x, dz = sp.z - c.z, rr = c.r + 0.3;
        if (dx * dx + dz * dz < rr * rr && sp.y < C.groundY(c.x, c.z) + hgt) { n++; break; }
      }
    }
    return n;
  };
  const pickSide = () => {
    let best = Infinity;
    const chest = new THREE.Vector3().copy(hero()); chest.y += 1.2;
    for (const sd of [1, -1]) for (const rot of [0, 0.52]) {
      wideSide = sd; wideRot = rot * sd;
      let cost = rot * 0.5;   // mild preference for the canonical framing
      for (const f of [-6.5, -8.5]) {
        const c = atW(f, f < -7 ? 4.6 : 3.4, (f < -7 ? 4.2 : 3.2) * sd, new THREE.Vector3());
        cq.copy(c);
        try { game.world?.resolveCollision?.(cq, 0.8); } catch (_) { /* */ }
        cost += cq.distanceTo(c) + Math.max(0, C.groundY(c.x, c.z) + 1 - c.y) * 2 + occluded(c, chest) * 1.5;
      }
      if (cost < best - 0.01) { best = cost; s0 = sd; r0 = wideRot; }
    }
    wideSide = s0; wideRot = r0;
  };
  let s0 = 1, r0 = 0;
  /** at() with the wide-shot swing applied (rotates the hero-relative offset about the hero). */
  const atW = (fwd, up, sd, out = P) => {
    const cr = Math.cos(wideRot), sr = Math.sin(wideRot);
    const ox = dir.x * fwd + side.x * sd, oz = dir.z * fwd + side.z * sd;
    return out.set(hero().x + ox * cr - oz * sr, hero().y + up, hero().z + ox * sr + oz * cr);
  };
  const tickAura = (dt) => {
    T += dt;
    const h = hero();
    rune.position.set(h.x, h.y + 0.06, h.z); rune.rotation.y = T * 1.6;
    pillar.position.set(h.x, h.y, h.z); pillar.material.uniforms.uTime.value = T;
    glow.position.set(h.x, h.y + 1.1, h.z);
  };
  const buildup = (dt) => {
    buildT += dt;
    const t = clamp(buildT / BUILD, 0, 1);
    rune.material.opacity = Math.min(1, t * 3) * 0.95; rune.scale.setScalar(1.6 + t * 2.4);
    pillar.material.uniforms.uOpacity.value = clamp((buildT - 1.6) * 2, 0, 1) * 0.32; pillar.scale.set(0.8 + t * 0.4, 8 + t * 10, 0.8 + t * 0.4);
    glow.material.opacity = 0.18 + t * 0.22; glow.scale.setScalar(1.6 + t * 1.6 + Math.sin(T * 14) * 0.15);
    try { o.onBuildup?.(t); } catch (err) { if (!buildup.err) { buildup.err = true; console.error('[cinematic] onBuildup', err); } }
  };
  const impact = () => {
    if (impacted) return; impacted = true;
    try { o.onImpact?.(); } catch (err) { console.error('[cinematic] onImpact', err); }
    vfx?.screenFlash?.(col, 0.55, 0.45); vfx?.shake?.(0.85); vfx?.fovKick?.(9, 0.5);
    vfx?.shockwave?.(center, { color: col, radius: 14, duration: 0.8 });
    vfx?.flash?.(center, { color: col, intensity: 18, distance: 40, duration: 0.6 });
    game.hitstop?.(0.12);
  };

  const shots = [
    // 0 — freeze-frame: time stops, a sharp push-in, colour flash
    {
      duration: 0.3, ease: 'outCubic', timeScale: 0.02,
      from: null, to: null,
      onStart() {
        ov.letterbox(true);
        vfx?.screenFlash?.(col, 0.35, 0.3); vfx?.fovKick?.(-6, 0.35);
        sfx('cinematic_whoosh', { volume: 0.8, pitch: 1.3 });
        aura = stage.keep(vfx?.emitter?.({ follow: pObj || undefined, position: hero().clone(), rate: 40, count: 1, color: [col, 0xffffff], speed: 4, dir: new THREE.Vector3(0, 1, 0), spread: 0.35, size: 0.16, sizeEnd: 0, life: 0.9, shape: 'spark', radius: 1.2, drag: 0.6 }));
      },
      onUpdate(u, dt) { tickAura(dt); buildup(dt); },
    },
    // 1 — close shot of the hero, name splash
    {
      duration: 1.3, ease: 'outCubic', timeScale: 0.1,
      from: () => at(2.9, 1.25, 1.1), to: () => at(2.3, 1.45, 0.7, L),
      look: () => L.copy(hero()).setY(hero().y + 1.25),
      fov: [42, 36],
      onStart() {
        ov.splash(o.name || '필살기', { element: el, tag: o.cls === 'sword' ? '검 · 필살' : '마법 · 필살', dur: 2.15, style: 'side' });
        ov.grade('radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,0,0,0) 30%, rgba(4,2,10,.55) 100%)', 1, 0.25);
        sfx('finisher_charge', { volume: 0.6 });
        vfx?.burst?.(hero().clone().setY(hero().y + 1), { count: 40, color: [col, 0xffffff], speed: 7, spread: 1, size: 0.25, sizeEnd: 0, life: 0.6, shape: 'spark', drag: 2 });
      },
      onUpdate(u, dt) { tickAura(dt); buildup(dt); },
    },
    // 2 — orbit & rise: power-up
    {
      duration: 0.9, ease: 'inOutSine', timeScale: 0.1,
      from: C.orbit(() => hero(), { radius: 3.2, height: 1.2, from: Math.atan2(dir.x, dir.z) + 0.6, to: Math.atan2(dir.x, dir.z) + 2.3, radiusTo: 6.5, heightTo: 4.2 }),
      look: () => L.copy(hero()).setY(hero().y + 1.3),
      fov: [38, 54],
      onStart() { sfx('cinematic_whoosh', { volume: 0.5, pitch: 0.8 }); },
      onUpdate(u, dt) { tickAura(dt); buildup(dt); },
    },
    // 3 — wide shot: the blow lands
    {
      duration: 1.25, ease: 'outCubic', timeScale: (u) => (u < 0.16 ? 0.25 : 1),
      from: () => atW(-6.5, 3.4, 3.2 * wideSide), to: () => atW(-8.5, 4.6, 4.2 * wideSide, L),
      look: (e) => L.lerpVectors(hero(), center, 0.65).setY(center.y + 1.5 + e),
      fov: [58, 64],
      onStart() { updDir(); pickSide(); ov.letterbox(true); ov.grade(null, 0, 0.4); },
      onUpdate(u, dt, e, tt) {
        tickAura(dt);
        if (tt >= 0.2) impact();
        const f = 1 - clamp(tt / 0.5, 0, 1);
        rune.material.opacity = 0.95 * f; pillar.material.uniforms.uOpacity.value = 0.85 * f; glow.material.opacity = 0.75 * f;
      },
    },
    // 4 — return to the gameplay camera
    {
      duration: 0.55, ease: 'inOutSine', timeScale: 1, letterbox: false, blendToGame: true,
      from: () => atW(-8.5, 4.6, 4.2 * wideSide), look: () => L.lerpVectors(hero(), center, 0.65).setY(center.y + 2.5),
      fov: 64,
      onStart() { aura?.stop?.(); },
      onUpdate(u, dt) { tickAura(dt); },
    },
  ];

  return C.play(shots, {
    mode: 'gameplay', letterbox: true, film: false, skippable: false,
    onSkip: impact,
    onEnd: () => {
      impact();
      stage.dispose();
      try { o.onEnd?.(); } catch (err) { console.error('[cinematic] finisher onEnd', err); }
    },
  });
}
