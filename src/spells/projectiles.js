// Pooled spell projectiles: movement, soft homing, terrain/entity collision, zone infusion.
import * as THREE from 'three';
import { elColor, elDef } from '../core/elements.js';
import {
  coreMat, fresnelMat, flameGeo, flameMat, crystalGeo, iceMatSolid, crescentGeo, rockGeo, toonMat, addOutline,
} from './assets.js';
import { extraFactories } from './meshes2.js';

const SHAPE_OF = (el) => elDef(el)?.shapes?.[0] || 'spark';

const Z = new THREE.Vector3(0, 0, 1);

function glowCore(game, color, intensity) {
  try {
    const m = game.vfx?.glowMaterial?.(color);
    if (m && m.isMaterial) return m;
  } catch (_) { /* */ }
  return coreMat(color, intensity);
}

export function createProjectiles(S) {
  const { game } = S;
  const scene = game.scene;
  const pools = {};
  const active = [];
  const near = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dirV = new THREE.Vector3();

  // ---------- mesh factories ----------
  const factories = {
    fireball() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), glowCore(game, 0xff8a2a, 2.6)));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), fresnelMat(0xff5a10, { power: 1.4, intensity: 1.8, core: 0.15 })));
      const fl = new THREE.Mesh(flameGeo(), flameMat()); fl.rotation.x = -Math.PI / 2; fl.scale.set(0.9, 0.9, 0.9); fl.position.z = -0.1;
      g.add(fl); g.userData.spin = g.children[1];
      return g;
    },
    inferno() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), glowCore(game, 0xff7a1a, 2.8)));
      const s1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 2), fresnelMat(0xff4a08, { power: 1.2, intensity: 2.2, core: 0.12 }));
      const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 14), fresnelMat(0xffb040, { power: 2.6, intensity: 1.4, core: 0.0 }));
      g.add(s1, s2);
      const fg = flameGeo(), fm = flameMat();
      const ring = new THREE.Group();
      for (let i = 0; i < 10; i++) {
        const f = new THREE.Mesh(fg, fm);
        const a = (i / 10) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
        f.rotation.z = a - Math.PI / 2; f.scale.setScalar(0.8);
        ring.add(f);
      }
      g.add(ring); g.userData.spin = ring;
      return g;
    },
    shard() {
      const g = new THREE.Group();
      const c = new THREE.Mesh(crystalGeo(), iceMatSolid());
      c.rotation.x = Math.PI / 2; c.position.z = -0.6; c.scale.set(0.45, 0.75, 0.45);
      addOutline(c, 0.05, 0x1d4a66);
      g.add(c);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), fresnelMat(0x7fe3ff, { power: 1.5, intensity: 1.6 })));
      return g;
    },
    lance() {
      const g = new THREE.Group();
      const c = new THREE.Mesh(crystalGeo(), iceMatSolid());
      c.rotation.x = Math.PI / 2; c.position.z = -1.6; c.scale.set(0.55, 2.1, 0.55);
      addOutline(c, 0.04, 0x1d4a66);
      g.add(c);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.42, 3.6, 10, 1, true), fresnelMat(0xaef4ff, { power: 1.2, intensity: 2 }));
      glow.rotation.x = Math.PI / 2; glow.position.z = -0.2; g.add(glow);
      const tipM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glowCore(game, 0xdffaff, 3)); tipM.position.z = 1.6; g.add(tipM);
      return g;
    },
    blade() {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(crescentGeo(), new THREE.MeshBasicMaterial({ color: 0x8fffc1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      outer.scale.set(1.25, 1, 1.25);
      const inner = new THREE.Mesh(crescentGeo(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      inner.scale.set(0.95, 1, 0.8); inner.position.z = 0.05;
      g.add(outer, inner); g.userData.tint = outer.material;
      return g;
    },
    rock() {
      const g = new THREE.Group();
      const r = new THREE.Mesh(rockGeo(), toonMat(0xa7835a, { flatShading: true }));
      r.scale.setScalar(0.9); r.castShadow = true;
      addOutline(r, 0.04);
      g.add(r); g.userData.spin = r;
      return g;
    },
    meteor() {
      const g = new THREE.Group();
      const r = new THREE.Mesh(rockGeo(), toonMat(0x5a2c1c, { flatShading: true, emissive: 0xff3a00, emissiveIntensity: 0.35 }));
      r.scale.setScalar(5); addOutline(r, 0.025);
      g.add(r); g.userData.spin = r;
      g.add(new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14), fresnelMat(0xff6a1f, { power: 1.2, intensity: 2.4, core: 0.1 })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(4.6, 20, 14), fresnelMat(0xffc060, { power: 2.5, intensity: 1.4 })));
      const fl = new THREE.Mesh(flameGeo(), flameMat()); fl.scale.set(9, 9, 9); fl.position.y = 1; g.add(fl);
      return g;
    },
  };
  Object.assign(factories, extraFactories(game, glowCore));
  function takeMesh(key) {
    if (!factories[key]) key = 'orb';
    const p = pools[key] || (pools[key] = []);
    const m = p.pop() || factories[key]();
    m.userData.key = key;
    if (!m.userData.aura) {
      const aura = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), fresnelMat(0xffffff, { power: 1.3, intensity: 2 }));
      aura.visible = false; m.add(aura); m.userData.aura = aura;
    }
    m.userData.aura.visible = false;
    m.visible = true;
    scene.add(m);
    return m;
  }
  function giveMesh(key, m) { scene.remove(m); (pools[key] || (pools[key] = [])).push(m); }

  // ---------- spawn ----------
  const objPool = [];
  function spawn(o) {
    const p = objPool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hits: new Set(), zones: [] };
    p.kind = o.kind; p.element = o.element; p.meshKey = factories[o.mesh] ? o.mesh : 'orb';
    p.pos.copy(o.pos);
    p.vel.copy(o.dir).normalize().multiplyScalar(o.speed);
    p.speed = o.speed;
    p.radius = o.radius ?? 0.4;
    p.damage = o.damage ?? 10;
    p.life = o.life ?? 2;
    p.age = 0;
    p.pierce = !!o.pierce;
    p.homing = o.homing || 0;
    p.target = o.target || null;
    p.gravity = o.gravity || 0;
    p.status = o.status || null;
    p.knockback = o.knockback || 0;
    p.launch = o.launch || 0;
    p.heavy = !!o.heavy;
    p.tags = o.tags || null;
    p.onImpact = o.onImpact || null;
    p.onHitEntity = o.onHitEntity || null;
    p.onUpdate = o.onUpdate || null;
    p.explodeOnExpire = !!o.explodeOnExpire;
    p.ignoreGround = !!o.ignoreGround;
    p.infused = null;
    p.data = o.data || {};
    p.hitTpl = o.hit || null;          // v3: ctx.hit() template (skillId, slot, tier, castMul…); amount/status from the opts
    p.tier = o.tier || null;
    p.bounces = o.bounce || 0; p.bounceRange = o.bounceRange || 9;
    p.onExpire = o.onExpire || null;
    p.objects = o.objects !== false;    // collide with pods/crystals/flowers/mines (combat.reactObject)
    p.blocked = o.blockable !== false;  // world temp colliders (earth wall, ice wall) block/reflect
    p.hits.clear(); p.zones.length = 0;
    p.traveled = 0;
    p.mesh = takeMesh(p.meshKey);
    p.mesh.scale.setScalar(o.scale || 1);
    tint(p.mesh, o.tint ?? (o.mesh && p.mesh.userData.elementTint !== false ? elColor(o.element, 'mid') : null), o.tint2 ?? elColor(o.element, 'edge'));
    p.mesh.position.copy(p.pos);
    orient(p);
    p.trail = null; p.emitters = [];
    const col = o.trailColor ?? elColor(o.element, 'hex');
    try { if (o.trail !== false) { const tr = game.vfx?.trail?.(p.mesh, { color: col, width: o.trailWidth || 0.35 * (o.scale || 1), length: o.trailLength || 14, fade: 0.9 }); if (tr?.stop) p.trail = tr; } } catch (_) { /* */ }
    if (o.emitter) {
      try { const em = game.vfx?.emitter?.({ follow: p.mesh, ...o.emitter }); if (em?.stop) p.emitters.push(em); } catch (_) { /* */ }
    }
    active.push(p);
    return p;
  }

  /** Per-element tint through uniforms / material colours only (never a program-key flag). */
  function tint(m, hex, hex2) {
    const t = m.userData.tints; if (!t || hex == null) return;
    for (const mat of t) {
      const c = mat.uniforms?.color?.value || mat.uniforms?.uColor?.value || mat.color;
      if (c) c.setHex(mat.userData?.edge ? (hex2 ?? hex) : hex);
    }
  }

  function orient(p) {
    if (p.vel.lengthSq() < 1e-6) return;
    dirV.copy(p.vel).normalize();
    p.mesh.quaternion.setFromUnitVectors(Z, dirV);
  }

  function release(p, i) {
    try { p.trail?.stop(); } catch (_) { /* */ }
    for (const e of p.emitters) { try { e.stop(); } catch (_) { /* */ } }
    p.emitters.length = 0;
    giveMesh(p.meshKey, p.mesh); p.mesh = null;
    active.splice(i, 1);
    objPool.push(p);
  }

  function infuse(p, el, comboName) {
    if (p.infused || el === p.element) return false;
    p.infused = el;
    const a = p.mesh.userData.aura;
    a.visible = true; a.material.uniforms.color.value.setHex(elColor(el, 'hex'));
    if (p.mesh.userData.tint) p.mesh.userData.tint.color.setHex(el === 'fire' ? 0xffa040 : el === 'ice' ? 0xbff4ff : elColor(el, 'mid'));
    const shape = SHAPE_OF(el);
    try { const em = game.vfx?.emitter?.({ follow: p.mesh, rate: 40, color: [elColor(el, 'hex'), 0xffffff], shape, speed: 1.5, spread: 1, size: 0.18, sizeEnd: 0, life: 0.5, drag: 1 }); if (em?.stop) p.emitters.push(em); } catch (_) { /* */ }
    S.vfx('burst', p.pos, { count: 26, color: [elColor(el, 'hex'), 0xffffff], shape, speed: 6, spread: 1, size: 0.18, life: 0.5, drag: 2 });
    if (comboName) S.combo('infusion', comboName, p.pos);
    return true;
  }

  function hitEntity(p, e) {
    p.hits.add(e);
    const c = S.combat.getCenter ? S.combat.getCenter(e, tmp2) : tmp2.copy(e.object.position);
    const pt = tmp.copy(p.pos).lerp(c, 0.5).clone();
    dirV.copy(p.vel).normalize();
    const hit = p.hitTpl ? Object.assign({}, p.hitTpl) : { source: 'player' };
    hit.amount = p.damage; hit.element = p.element; hit.point = pt; hit.direction = dirV.clone();
    hit.knockback = p.knockback; hit.launch = p.launch; hit.status = p.status; hit.heavy = p.heavy;
    if (p.tags) hit.tags = p.tags; if (p.tier) hit.tier = p.tier;
    if (!hit.source) hit.source = 'player';
    const r = S.combat.dealDamage(e, hit);
    if (p.infused && e.alive) {
      const st = S.STATUS_OF[p.infused];
      S.combat.dealDamage(e, { amount: Math.round(p.damage * 0.6), element: p.infused, source: hit.source, point: pt, status: st ? { [st]: 3 } : null, tags: ['infused'], tier: 'light' });
    }
    p.onHitEntity?.(p, e, r, pt);
    return r;
  }

  /** Bounce to the nearest other enemy (water bubbles); returns true when redirected. */
  function bounce(p, from) {
    const next = S.nearestEnemy(p.pos, p.bounceRange, [...p.hits]);
    if (!next) return false;
    p.bounces--;
    const c = S.combat.getCenter ? S.combat.getCenter(next, tmp) : tmp.copy(next.object.position);
    const sp = p.vel.length();
    p.vel.subVectors(c, p.pos).normalize().multiplyScalar(sp);
    p.life = Math.max(p.life, 0.8);
    S.vfx('burst', p.pos, { count: 8, shape: SHAPE_OF(p.element), color: [elColor(p.element, 'core'), elColor(p.element, 'mid')], speed: 3, spread: 1, size: 0.14, life: 0.35, drag: 2 });
    void from;
    return true;
  }

  function impact(p, groundHit, entity) {
    if (p.onImpact) p.onImpact(p, p.pos, entity, groundHit);
    S.zones.elementAt(p.pos, p.data.aoe || 1.5, p.element, { dir: dirV.copy(p.vel).normalize(), source: 'projectile' });
    if (p.infused) S.zones.elementAt(p.pos, p.data.aoe || 1.5, p.infused, { source: 'projectile' });
  }

  // ---------- update ----------
  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.age += dt; p.life -= dt;
      // homing
      if (p.homing > 0 && p.target && p.target.alive && p.age > 0.04) {
        const c = S.combat.getCenter ? S.combat.getCenter(p.target, tmp) : tmp.copy(p.target.object.position);
        tmp2.subVectors(c, p.pos);
        const d = tmp2.length();
        if (d > 0.5) {
          tmp2.multiplyScalar(1 / d);
          dirV.copy(p.vel).normalize();
          if (dirV.dot(tmp2) > 0.35) {
            dirV.lerp(tmp2, Math.min(1, p.homing * dt)).normalize();
            const sp = p.vel.length();
            p.vel.copy(dirV).multiplyScalar(sp);
          }
        }
      }
      if (p.gravity) p.vel.y -= p.gravity * dt;
      p.onUpdate?.(p, dt);
      const step = p.vel.length() * dt;
      const n = Math.min(6, Math.max(1, Math.ceil(step / Math.max(0.3, p.radius))));
      let done = false;
      for (let k = 0; k < n && !done; k++) {
        p.pos.addScaledVector(p.vel, dt / n);
        p.traveled += step / n;
        // terrain
        if (!p.ignoreGround) {
          const h = S.height(p.pos.x, p.pos.z);
          if (p.pos.y < h + 0.05) { p.pos.y = h + 0.05; impact(p, true, null); done = true; break; }
        }
        // world temp colliders (earth wall, ice wall, aegis dome): block or reflect
        if (p.blocked && S.blockAt) {
          const res = S.blockAt(p);
          if (res === 'block') { impact(p, false, null); done = true; break; }
          if (res === 'reflect') { p.vel.multiplyScalar(-1); p.hits.clear(); }
        }
        // objects: pods / crystals / ice flowers / mines react to the element (combat.reactObject)
        if (p.objects && S.objectHit && S.objectHit(p)) { if (!p.pierce) { impact(p, false, null); done = true; break; } }
        // entities
        S.combat.queryRadius(p.pos, p.radius, '!player', near);
        for (let j = 0; j < near.length; j++) {
          const e = near[j];
          if (p.hits.has(e)) continue;
          hitEntity(p, e);
          if (p.bounces > 0 && bounce(p, e)) break;
          if (!p.pierce) { impact(p, false, e); done = true; break; }
        }
      }
      if (!done) {
        S.zones.checkProjectile(p);
        if (p.life <= 0) { if (p.explodeOnExpire) impact(p, false, null); try { p.onExpire?.(p, p.pos); } catch (_) { /* */ } done = true; }
      }
      if (done) { release(p, i); continue; }
      p.mesh.position.copy(p.pos);
      orient(p);
      const ud = p.mesh.userData, sp = ud.spin;
      if (sp) { sp.rotation.x += dt * 7; sp.rotation.y += dt * 5; }
      if (ud.flap) { const f = Math.sin(p.age * 22 + p.radius * 9); ud.flap.scale.set(1 + f * 0.25, 1, 1); ud.flap.rotation.z = f * 0.25; }
      if (ud.wobble) { const w = 1 + Math.sin(p.age * 18) * 0.08; ud.wobble.scale.set(w, 2 - w, w); }
      if (ud.rings) ud.rings.rotation.z += dt * 9;
      void 0;
    }
  }

  /** Pre-build one mesh of each kind (pooled) so shaders compile at load, not on first cast. */
  function warm(group) {
    for (const key in factories) { const m = takeMesh(key); scene.remove(m); group.add(m); }
  }
  function unwarm(group) {
    for (const m of [...group.children]) { const key = Object.keys(factories).find((k) => m.userData.key === k); group.remove(m); if (key) (pools[key] || (pools[key] = [])).push(m); }
  }
  /** v3 prewarm: one hidden instance of every mesh (returned to the boot compile, then pooled on first spawn). */
  function prewarmGroup() {
    const g = new THREE.Group();
    for (const key in factories) { const m = takeMesh(key); scene.remove(m); m.position.set(0, -800, 0); g.add(m); }
    g.userData.release = () => unwarm(g);
    return g;
  }

  function clear() { for (let i = active.length - 1; i >= 0; i--) release(active[i], i); }
  return { spawn, update, infuse, active, hitEntity, warm, unwarm, prewarmGroup, clear, factories };
}
