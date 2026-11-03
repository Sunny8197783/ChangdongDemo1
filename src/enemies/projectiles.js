// Enemy projectiles: shaman homing orbs (dodgeable / blink-through) and golem boulders (ballistic arcs).
import * as THREE from 'three';
import { ELEMENT_COLORS, rand } from '../core/utils.js';
import { glowSpriteMat, rockGeo, vcFlatMat, mk } from './common.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const STATUS = { fire: { burning: 3 }, ice: { chilled: 4 }, lightning: { shocked: 2.5 } };

export class EnemyProjectiles {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.game.scene;
    this.orbs = [];
    const coreGeo = new THREE.IcosahedronGeometry(0.17, 1);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group(); g.visible = false;
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const core = new THREE.Mesh(coreGeo, coreMat); g.add(core);
      const halo = new THREE.Sprite(glowSpriteMat(0xffffff, 0.9)); halo.scale.setScalar(1.3); g.add(halo);
      const halo2 = new THREE.Sprite(glowSpriteMat(0xffffff, 0.35)); halo2.scale.setScalar(2.6); g.add(halo2);
      scene.add(g);
      const o = { g, core, coreMat, halo, halo2, active: false, vel: new THREE.Vector3(), t: 0, element: 'fire', source: null, trail: null, em: null,
        reflected: false, target: null, amount: 12, speed: 8.5, practice: false, col: 0xffffff, handle: null };
      // combat calls hit.projectile.reflect(byEntity) on a perfect block / barrier → the orb flies back
      o.handle = { reflect: (by) => this._reflect(o, by) };
      this.orbs.push(o);
    }
    this.boulders = [];
    const rg = rockGeo(0.85, 7, [1, 0.9, 1], 1, 0x7fae4e);
    for (let i = 0; i < 6; i++) {
      const m = mk(rg, vcFlatMat(), 0.045); m.visible = false; scene.add(m);
      this.boulders.push({ m, active: false, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, T: 1, opts: null, source: null, em: null, target: new THREE.Vector3() });
    }
  }

  /** Homing orb at the player. opts: {amount, speed, practice (slow harmless training orb), color}. */
  orb(origin, element, source, opts = {}) {
    const o = this.orbs.find((x) => !x.active) || this.orbs[0];
    this._killOrb(o, false);
    const col = opts.color ?? ELEMENT_COLORS[element] ?? 0xffffff;
    o.active = true; o.t = 0; o.element = element; o.source = source;
    o.reflected = false; o.target = null; o.amount = opts.amount ?? 12; o.speed = opts.speed ?? 8.5; o.practice = !!opts.practice; o.col = col;
    o.g.position.copy(origin); o.g.visible = true;
    o.coreMat.color.setHex(col).multiplyScalar(1.8);
    o.halo.material.color.setHex(col); o.halo2.material.color.setHex(col);
    const pc = this.ctx.playerCenter;
    o.vel.subVectors(pc, origin).normalize().multiplyScalar(o.practice ? 2.5 : 4);
    o.vel.y += o.practice ? 1.2 : 2.5;
    const vfx = this.ctx.game.vfx;
    o.trail = vfx.trail?.(o.g, { color: col, width: 0.42, length: 6, fade: 0.35 });
    o.em = vfx.emitter?.({ follow: o.g, rate: 32, color: [col, 0xffffff], speed: 0.8, spread: 1, size: 0.16, sizeEnd: 0, life: 0.45,
      shape: element === 'ice' ? 'snow' : element === 'fire' ? 'ember' : 'spark', drag: 2, gravity: element === 'fire' ? -2 : 1 });
    return o;
  }
  _killOrb(o, explode) {
    if (!o.active) return;
    o.active = false; o.g.visible = false;
    o.trail?.stop?.(); o.em?.stop?.(); o.trail = o.em = null;
    if (explode) {
      const vfx = this.ctx.game.vfx;
      vfx.impact?.(o.g.position, { element: ELEMENT_COLORS[o.element] != null ? o.element : 'physical', scale: o.practice ? 0.6 : 1 });
      vfx.burst(o.g.position, { count: 18, color: [o.col, 0xffffff], speed: 4, spread: 1, size: 0.15, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 2 });
      this.ctx.audio(o.practice ? 'hit' : 'impact_' + o.element, { position: o.g.position, volume: 0.6 });
    }
  }

  _reflect(o, by) {
    if (!o.active || o.reflected) return;
    o.reflected = true; o.t = 0;
    const src = o.source;
    o.target = src && src.alive && !src.dying ? src : null;
    o.source = 'player';
    const p = o.g.position;
    if (o.target) { o.target.getCenter(_c); _d.subVectors(_c, p).normalize(); }
    else { _d.copy(o.vel).negate().normalize(); }
    o.vel.copy(_d).multiplyScalar(17);
    // reflected orbs glow white-gold so the player reads the counter
    o.coreMat.color.setHex(0xfff1c0).multiplyScalar(2);
    o.halo.material.color.setHex(0xffe27a);
    const vfx = this.ctx.game.vfx;
    vfx.burst?.(p, { count: 24, color: [0xffe27a, 0xffffff], speed: 6, spread: 1, size: 0.14, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 2 });
    vfx.shockwave?.(p, { color: 0xffe9a0, radius: 1.6, duration: 0.25, vertical: true, opacity: 0.8, thickness: 0.15 });
    this.ctx.audio('reflect', { position: p, volume: 0.8 });
  }

  boulder(from, to, source, opts = {}) {
    const b = this.boulders.find((x) => !x.active) || this.boulders[0];
    const T = opts.flight ?? 1.2;
    b.active = true; b.t = 0; b.T = T; b.opts = opts; b.source = source;
    b.m.position.copy(from); b.m.visible = true; b.m.scale.setScalar(0.2);
    b.target.copy(to);
    b.vel.set((to.x - from.x) / T, (to.y - from.y + 0.5 * 22 * T * T) / T, (to.z - from.z) / T);
    b.spin.set(rand(-5, 5), rand(-3, 3), rand(-5, 5));
    this.ctx.telegraphs.show(to, opts.radius ?? 3.2, T, 0xff6a2a);
    b.em = this.ctx.game.vfx.emitter?.({ follow: b.m, rate: 26, color: [0xcdb48a, 0x8a7a5a], speed: 0.6, spread: 1, size: 0.6, sizeEnd: 1.3, life: 0.7, shape: 'smoke', additive: false, drag: 1.5 });
    return b;
  }

  update(dt) {
    const ctx = this.ctx, game = ctx.game, world = game.world;
    const pe = game.player?.entity, pc = ctx.playerCenter;
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.t += dt;
      const p = o.g.position;
      if (o.reflected) {
        // flies back at its caster (homing hard), damaging any enemy it touches
        const tg = o.target;
        if (tg && tg.alive && !tg.dying) { tg.getCenter(_c); _d.subVectors(_c, p).normalize().multiplyScalar(18); o.vel.lerp(_d, Math.min(1, dt * 6)); }
        p.addScaledVector(o.vel, dt);
        o.halo.scale.setScalar(1.5 + Math.sin(o.t * 30) * 0.15); o.core.rotation.y += dt * 10;
        if (o.t > 3 || p.y < ctx.groundH(p.x, p.z) + 0.05) { this._killOrb(o, true); continue; }
        const hits = game.combat.queryRadius?.(p, 0.75, 'enemy', this._q || (this._q = []));
        let hitE = null;
        if (hits) for (let i = 0; i < hits.length; i++) if (!hits[i].isDummy || o.practice) { hitE = hits[i]; break; }
        if (hitE) {
          _v.copy(o.vel).setY(0).normalize();
          game.combat.dealDamage(hitE, { amount: o.practice ? 4 : Math.max(50, o.amount * 4), element: o.element === 'physical' ? 'physical' : o.element, source: 'player',
            point: p.clone(), direction: _v.clone(), knockback: 7, heavy: true, status: o.practice ? undefined : STATUS[o.element], tags: ['reflect'] });
          this._killOrb(o, true);
        }
        continue;
      }
      const maxSp = o.speed;
      if (o.t < 3.2 && ctx.playerAlive) {
        _d.subVectors(pc, p).normalize().multiplyScalar(maxSp);
        o.vel.lerp(_d, Math.min(1, dt * (o.t < 0.4 ? 3.5 : 1.25)));
      }
      const sp = o.vel.length();
      if (sp < maxSp && o.t > 0.4) o.vel.multiplyScalar(Math.min(maxSp / Math.max(0.01, sp), 1 + dt * 2));
      p.addScaledVector(o.vel, dt);
      const pulse = 1 + Math.sin(o.t * 22) * 0.12;
      o.halo.scale.setScalar(1.3 * pulse); o.core.rotation.y += dt * 6;
      if (o.t > (o.practice ? 9 : 6) || p.y < ctx.groundH(p.x, p.z) + 0.05) { this._killOrb(o, true); continue; }
      if (pe && pe.alive && !pe.invulnerable && p.distanceToSquared(pc) < 0.95 * 0.95) {
        _v.copy(o.vel).setY(0).normalize();
        game.combat.dealDamage(pe, { amount: o.amount, element: o.element, source: o.source, point: p.clone(), direction: _v.clone(),
          knockback: o.practice ? 2 : 5, status: o.practice ? undefined : STATUS[o.element], projectile: o.handle, tags: o.practice ? ['practice'] : undefined });
        if (!o.reflected) this._killOrb(o, true);
      }
    }
    for (const b of this.boulders) {
      if (!b.active) continue;
      b.t += dt;
      b.vel.y -= 22 * dt;
      b.m.position.addScaledVector(b.vel, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      b.m.scale.setScalar(Math.min(1, 0.2 + b.t * 4));
      const gh = ctx.groundH(b.m.position.x, b.m.position.z);
      if (b.t > 0.15 && (b.m.position.y < gh + 0.4 || b.t > b.T + 0.6)) {
        b.active = false; b.m.visible = false; b.em?.stop?.(); b.em = null;
        _c.copy(b.m.position); _c.y = gh;
        const r = b.opts.radius ?? 3.2;
        ctx.slam(_c, r, { amount: b.opts.amount ?? 22, knockback: 12, launch: 6, element: 'physical' }, b.source, 0.9);
        game.vfx.explosion?.(_c, { element: 'earth', scale: 1.1 });
        game.vfx.debris?.(_c, { count: 14, size: 0.45, speed: 9, material: 'rock' });
        game.vfx.decal?.(_c, { radius: r * 0.8, duration: 6, type: 'crack' });
        ctx.audio('explode_earth', { position: _c, volume: 0.9 });
      }
    }
  }

  clear() {
    for (const o of this.orbs) this._killOrb(o, false);
    for (const b of this.boulders) { b.active = false; b.m.visible = false; b.em?.stop?.(); }
  }
}
