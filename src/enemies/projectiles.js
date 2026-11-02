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
      this.orbs.push({ g, core, coreMat, halo, halo2, active: false, vel: new THREE.Vector3(), t: 0, element: 'fire', source: null, trail: null, em: null });
    }
    this.boulders = [];
    const rg = rockGeo(0.85, 7, [1, 0.9, 1], 1, 0x7fae4e);
    for (let i = 0; i < 6; i++) {
      const m = mk(rg, vcFlatMat(), 0.045); m.visible = false; scene.add(m);
      this.boulders.push({ m, active: false, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, T: 1, opts: null, source: null, em: null, target: new THREE.Vector3() });
    }
  }

  orb(origin, element, source) {
    const o = this.orbs.find((x) => !x.active) || this.orbs[0];
    this._killOrb(o, false);
    const col = ELEMENT_COLORS[element] ?? 0xffffff;
    o.active = true; o.t = 0; o.element = element; o.source = source;
    o.g.position.copy(origin); o.g.visible = true;
    o.coreMat.color.setHex(col).multiplyScalar(1.8);
    o.halo.material.color.setHex(col); o.halo2.material.color.setHex(col);
    const pc = this.ctx.playerCenter;
    o.vel.subVectors(pc, origin).normalize().multiplyScalar(4);
    o.vel.y += 2.5;
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
      vfx.impact?.(o.g.position, { element: o.element, scale: 1 });
      vfx.burst(o.g.position, { count: 18, color: [ELEMENT_COLORS[o.element], 0xffffff], speed: 4, spread: 1, size: 0.15, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 2 });
      this.ctx.audio('impact_' + o.element, { position: o.g.position, volume: 0.6 });
    }
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
      if (o.t < 3.2 && ctx.playerAlive) {
        _d.subVectors(pc, p).normalize().multiplyScalar(8.5);
        o.vel.lerp(_d, Math.min(1, dt * (o.t < 0.4 ? 3.5 : 1.25)));
      }
      const sp = o.vel.length();
      if (sp < 8.5 && o.t > 0.4) o.vel.multiplyScalar(Math.min(8.5 / Math.max(0.01, sp), 1 + dt * 2));
      p.addScaledVector(o.vel, dt);
      const pulse = 1 + Math.sin(o.t * 22) * 0.12;
      o.halo.scale.setScalar(1.3 * pulse); o.core.rotation.y += dt * 6;
      if (o.t > 6 || p.y < world.getHeight(p.x, p.z) + 0.05) { this._killOrb(o, true); continue; }
      if (pe && pe.alive && !pe.invulnerable && p.distanceToSquared(pc) < 0.95 * 0.95) {
        _v.copy(o.vel).setY(0).normalize();
        game.combat.dealDamage(pe, { amount: 12, element: o.element, source: o.source, point: p.clone(), direction: _v.clone(), knockback: 5, status: STATUS[o.element] });
        this._killOrb(o, true);
      }
    }
    for (const b of this.boulders) {
      if (!b.active) continue;
      b.t += dt;
      b.vel.y -= 22 * dt;
      b.m.position.addScaledVector(b.vel, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      b.m.scale.setScalar(Math.min(1, 0.2 + b.t * 4));
      const gh = world.getHeight(b.m.position.x, b.m.position.z);
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
