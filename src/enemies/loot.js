// Reward drops: glowing mana motes (+8 MP) that home into the player, and occasional hearts (+15 HP).
import * as THREE from 'three';
import { rand, randInt, clamp, toonMat, addOutline } from '../core/utils.js';
import { textures } from './common.js';

const MAX = 90;
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _id = new THREE.Quaternion();
const MANA_COL = 0x7fc8ff;

export class Loot {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.game.scene;
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.4, 2.4) });
    this.core = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), coreMat, MAX);
    const haloMat = new THREE.MeshBasicMaterial({ map: textures().glow, color: MANA_COL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
    this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMat, MAX);
    for (const im of [this.core, this.halo]) { im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
    this.halo.renderOrder = 10;
    this.orbs = [];
    for (let i = 0; i < MAX; i++) this.orbs.push({ active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, seek: false, ph: 0 });
    // hearts
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.25);
    shape.bezierCurveTo(-0.05, -0.17, -0.3, -0.05, -0.3, 0.1);
    shape.bezierCurveTo(-0.3, 0.26, -0.1, 0.32, 0, 0.16);
    shape.bezierCurveTo(0.1, 0.32, 0.3, 0.26, 0.3, 0.1);
    shape.bezierCurveTo(0.3, -0.05, 0.05, -0.17, 0, -0.25);
    const hg = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 8 });
    hg.center();
    const hm = toonMat(0xff5a7a, { emissive: 0xff3a6a, emissiveIntensity: 0.6 });
    this.hearts = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(hg, hm); addOutline(m, 0.02); m.visible = false; scene.add(m);
      this.hearts.push({ m, active: false, p: m.position, v: new THREE.Vector3(), t: 0, seek: false, ph: 0 });
    }
  }

  /** Drop rewards for a dead enemy. */
  drop(e, n = null, hearts = null) {
    if (e.isDummy || e.summoned && Math.random() < 0.5) return;
    const c = e.getCenter(_v);
    const count = n ?? (e.kind === 'chuchu' ? randInt(2, 3) : randInt(3, 5));
    for (let i = 0; i < count; i++) {
      const o = this.orbs.find((x) => !x.active); if (!o) break;
      o.active = true; o.t = 0; o.seek = false; o.ph = rand(0, 6.28);
      o.p.copy(c);
      const a = rand(0, Math.PI * 2), s = rand(1.5, 3.5);
      o.v.set(Math.cos(a) * s, rand(4.5, 7.5), Math.sin(a) * s);
    }
    const hc = hearts ?? (Math.random() < (e.kind === 'bokoblin' ? 0.35 : 0.22) ? 1 : 0);
    for (let i = 0; i < hc; i++) {
      const h = this.hearts.find((x) => !x.active); if (!h) break;
      h.active = true; h.t = 0; h.seek = false; h.ph = rand(0, 6);
      h.p.copy(c); h.v.set(rand(-1.5, 1.5), 6.5, rand(-1.5, 1.5)); h.m.visible = true; h.m.scale.setScalar(1);
    }
  }

  _step(o, dt, world, pc, pAlive, magnetR) {
    o.t += dt;
    const p = o.p;
    if (!o.seek) {
      o.v.y -= 16 * dt;
      p.addScaledVector(o.v, dt);
      const gh = (world.getGroundHeight ? world.getGroundHeight(p.x, p.z) : world.getHeight(p.x, p.z)) + 0.55 + Math.sin(o.t * 3 + o.ph) * 0.12;
      if (p.y < gh) { p.y = gh; if (o.v.y < 0) o.v.y *= -0.35; o.v.x *= 0.6; o.v.z *= 0.6; }
      if (pAlive && o.t > 0.55) {
        const d = p.distanceTo(pc);
        if (d < magnetR || (o.t > 1.4 && d < magnetR * 1.8)) { o.seek = true; o.v.multiplyScalar(0.3); o.v.y += 3; }
      }
    } else {
      _d.subVectors(pc, p);
      const d = _d.length();
      const speed = 6 + o.t * 6;
      _d.multiplyScalar(Math.min(30, speed) / Math.max(0.001, d));
      o.v.lerp(_d, clamp(dt * 6, 0, 1));
      p.addScaledVector(o.v, dt);
      if (d < 0.7) return true;
      if (!pAlive) o.seek = false;
    }
    return false;
  }

  update(dt) {
    const ctx = this.ctx, game = ctx.game, world = game.world, cam = game.camera;
    const pc = ctx.playerCenter, pAlive = ctx.playerAlive, player = game.player;
    let n = 0;
    for (const o of this.orbs) {
      if (!o.active) continue;
      if (this._step(o, dt, world, pc, pAlive, 9)) {
        o.active = false;
        if (player) player.mp = Math.min(player.maxMp ?? 100, (player.mp ?? 0) + 8);
        game.vfx.burst(pc, { count: 10, color: [MANA_COL, 0xffffff], speed: 2.5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 3 });
        ctx.audio('ui_select', { position: pc, volume: 0.25, pitch: 1.6 + Math.random() * 0.4 });
        game.events.emit('pickup', { kind: 'mana', amount: 8 });
        continue;
      }
      if (o.t > 45) { o.active = false; continue; }
      const s = (o.t < 0.2 ? o.t / 0.2 : 1) * (1 + Math.sin(o.t * 9 + o.ph) * 0.15);
      _q.setFromAxisAngle(_v.set(0.3, 1, 0.2).normalize(), o.t * 3 + o.ph);
      _m.compose(o.p, _q, _s.set(s, s * 1.4, s)); this.core.setMatrixAt(n, _m);
      _m.compose(o.p, cam.quaternion, _s.set(s * 1.1, s * 1.1, s)); this.halo.setMatrixAt(n, _m);
      n++;
    }
    this.core.count = this.halo.count = n;
    if (n) { this.core.instanceMatrix.needsUpdate = true; this.halo.instanceMatrix.needsUpdate = true; }
    for (const h of this.hearts) {
      if (!h.active) continue;
      if (this._step(h, dt, world, pc, pAlive, 5)) {
        h.active = false; h.m.visible = false;
        if (player && player.entity?.alive) player.hp = Math.min(player.maxHp ?? 100, (player.hp ?? 0) + 15);
        game.vfx.burst(pc, { count: 16, color: [0xff7a9a, 0xffffff], speed: 3, spread: 1, size: 0.16, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 3 });
        ctx.audio('ui_select', { position: pc, volume: 0.35, pitch: 1.2 });
        game.events.emit('pickup', { kind: 'heart', amount: 15 });
        continue;
      }
      if (h.t > 45) { h.active = false; h.m.visible = false; continue; }
      h.m.rotation.y += dt * 2.5;
      const s = Math.min(1, h.t * 4) * (1 + Math.sin(h.t * 6) * 0.06);
      h.m.scale.setScalar(s);
    }
  }

  clear() {
    for (const o of this.orbs) o.active = false;
    for (const h of this.hearts) { h.active = false; h.m.visible = false; }
    this.core.count = this.halo.count = 0;
  }
}
