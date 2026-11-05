// Enemy projectiles: homing orbs (shaman, wraith, bosses; dodgeable / blink-through / reflectable), golem boulders
// (ballistic arcs), spore sacs → lingering spore clouds (shroom). v3: every projectile honours world.projectileBlockAt
// (temp colliders: 'block' despawns, 'reflect' calls onReflect and flips the team) and aims at its threat target.
import * as THREE from 'three';
import { ELEMENT_COLORS, rand } from '../core/utils.js';
import { glowSpriteMat, rockGeo, vcFlatMat, mk } from './common.js';
import { attackMeta } from './codex.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const STATUS = { fire: { burning: 3 }, ice: { chilled: 4 }, lightning: { shocked: 2.5 }, water: { wet: 5 }, nature: { seeded: { dur: 6, stacks: 1 } }, void: { blight: 2 } };
const _blockOut = {};
// v4 (§4.0): homing ≤ 0.5 s at ≤ 120°/s then straight; mob orbs ≤ 8 m/s, boss orbs ≤ 10 m/s; ≤ 6 enemy orbs alive (oldest fizzles)
export const ORB_RULES = { homeSec: 0.5, turnRate: 120 * Math.PI / 180, mobSpeed: 8, bossSpeed: 10, maxAlive: 6, hitR: 0.9 };
const _u = new THREE.Vector3(), _w = new THREE.Vector3();
const PALE = 0xf3ecdf;   // warm off-white (rule 5: never pure white)
const fxOf = (game, el) => { try { const f = game.elements?.fx?.(el); if (f && f.mid != null) return f; } catch (_) { /* */ } const c = ELEMENT_COLORS[el] ?? 0xd8c8f0; return { hi: c, light: c, mid: c, dark: 0x2a1c3a }; };

export class EnemyProjectiles {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.game.scene;
    this.orbs = [];
    const coreGeo = new THREE.IcosahedronGeometry(0.17, 1);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group(); g.visible = false;
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x2a1c3a });
      const core = new THREE.Mesh(coreGeo, coreMat); g.add(core);
      const halo = new THREE.Sprite(glowSpriteMat(PALE, 0.75)); halo.scale.setScalar(1.1); g.add(halo);
      const halo2 = new THREE.Sprite(glowSpriteMat(PALE, 0.22)); halo2.scale.setScalar(1.9); g.add(halo2);
      scene.add(g);
      const o = { g, core, coreMat, halo, halo2, active: false, vel: new THREE.Vector3(), t: 0, element: 'fire', source: null, trail: null, em: null,
        reflected: false, target: null, amount: 12, speed: 8, practice: false, col: PALE, handle: null, aim: null, status: null, onReflect: null, team: 'enemy',
        homeT: 0.5, marker: null, attack: null, born: 0 };
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
    this._sporePool();   // pooled at construction (materials compiled at boot)
  }

  /** world.projectileBlockAt(p) → 'block' | 'reflect' | null (only queried while temp colliders exist). */
  _blocked(p) {
    const w = this.ctx.game.world;
    if (!w?.projectileBlockAt) return null;
    const list = w.collidersBlockingProjectiles;
    if (list && list.length === 0) return null;
    try { return w.projectileBlockAt(p, _blockOut) || null; } catch (_) { return null; }
  }

  /** Lobbed spore sac (shroom): bursts into a lingering spore cloud where it lands. */
  spore(from, to, source, opts = {}) {
    const S = this._sporePool();
    const b = S.find((x) => !x.active) || S[0];
    const T = opts.flight ?? 1.0;
    b.active = true; b.t = 0; b.T = T; b.source = source; b.to.copy(to);
    b.g.position.copy(from); b.g.visible = true;
    b.vel.set((to.x - from.x) / T, (to.y - from.y + 0.5 * 22 * T * T) / T, (to.z - from.z) / T);
    b.tele = opts.noTele ? null : (this.ctx.tele?.({ shape: 'circle', pos: to, r: 2.2, dur: T, color: 0x9be86a }) || null);
    b.attackId = opts.attackId || 'shroom.lob';
    b.em = this.ctx.game.vfx.emitter?.({ owner: 'enemy', follow: b.g, rate: 22, color: [0xd8ff6a, 0x8fe05a], speed: 0.5, spread: 1, size: 0.25, sizeEnd: 0.6, life: 0.6, shape: 'smoke', additive: false, drag: 1.5 });
    return b;
  }
  _sporePool() {
    if (this.spores) return this.spores;
    this.spores = [];
    const geo = new THREE.IcosahedronGeometry(0.2, 1);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8f06a).multiplyScalar(1.4) });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.visible = false;
      g.add(new THREE.Mesh(geo, mat));
      const halo = new THREE.Sprite(glowSpriteMat(0x9be86a, 0.6)); halo.scale.setScalar(1.1); g.add(halo);
      this.ctx.game.scene.add(g);
      this.spores.push({ g, to: new THREE.Vector3(), active: false, vel: new THREE.Vector3(), t: 0, T: 1, source: null, em: null, tele: null, attackId: 'shroom.lob' });
    }
    this.clouds = [];
    for (let i = 0; i < 6; i++) this.clouds.push({ active: false, pos: new THREE.Vector3(), r: 2.2, t: 0, life: 4, tick: 0, fx: 0, source: null, hz: null, attack: null });
    return this.spores;
  }
  /** Lingering spore cloud: the player (or the threat target) inside gets seeded (poison) every 0.8 s. */
  cloud(pos, source, opts = {}) {
    this._sporePool();
    const c = this.clouds.find((x) => !x.active) || this.clouds.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    c.hz?.stop?.(); c.hz = null;
    c.active = true; c.pos.copy(pos); c.pos.y = this.ctx.groundH(pos.x, pos.z); c.r = opts.r ?? 2.2; c.t = 0; c.life = opts.life ?? 4; c.tick = 0.2; c.fx = 0; c.source = source;
    // v4: the cloud is a tells.hazard (lingering red hatch); its ticks hurt only while that hazard is active
    const aid = opts.attackId || 'shroom.lob';
    c.attack = attackMeta(aid);
    c.delay = opts.delay || 0; c.tell = opts.tell || null;
    if (c.delay > 0) return c;          // swelling tell first (shroom.deathCloud); the cloud starts when it resolves
    this._cloudStart(c);
    return c;
  }
  _cloudStart(c) {
    try { c.tell?.consumeStrike?.(); } catch (_) { /* */ }
    c.tell = null;
    try { c.hz = this.ctx.game.tells?.hazard?.({ pos: c.pos, r: c.r, dur: c.life, kind: 'spore', nameKo: c.attack.nameKo }) || null; } catch (_) { c.hz = null; }
    const vfx = this.ctx.game.vfx;
    vfx.groundDecal?.('flowers', c.pos, c.r * 0.9, c.life);
    _v.copy(c.pos); _v.y += 0.6;
    vfx.burst(_v, { owner: 'enemy', count: 26, color: [0xd8ff6a, 0x6fb03a], speed: 3, spread: 1, size: 0.6, sizeEnd: 1.8, life: 1.3, shape: 'smoke', additive: false, drag: 2.5, gravity: -0.4 });
    this.ctx.audio('steam', { position: c.pos, volume: 0.4, pitch: 1.4 });
  }

  /** Homing orb at the player. opts: {amount, speed (capped ≤ 8 mob / ≤ 10 boss), homing (≤ 0.5 s), practice, color, attackId}. */
  orb(origin, element, source, opts = {}) {
    // ≤ 6 enemy orbs alive: the oldest fizzles
    let alive = 0, oldest = null, free = null;
    for (const x of this.orbs) {
      if (!x.active) { if (!free) free = x; continue; }
      if (x.reflected) continue;
      alive++; if (!oldest || x.t > oldest.t) oldest = x;
    }
    if (alive >= ORB_RULES.maxAlive && oldest) { this._killOrb(oldest, false, true); if (!free) free = oldest; }
    const o = free || oldest || this.orbs[0];
    this._killOrb(o, false);
    const game = this.ctx.game, F = fxOf(game, element);
    const col = opts.color ?? F.mid;
    o.active = true; o.t = 0; o.element = element; o.source = source; o.born = game.enemyTime ?? game.time ?? 0;
    o.reflected = false; o.target = null; o.amount = opts.amount ?? 12; o.practice = !!opts.practice; o.col = col;
    const cap = source?.isBoss ? ORB_RULES.bossSpeed : ORB_RULES.mobSpeed;
    o.speed = Math.min(opts.speed ?? cap, cap);
    o.homeT = Math.min(opts.homing ?? ORB_RULES.homeSec, ORB_RULES.homeSec);
    o.attack = opts.attackId ? attackMeta(opts.attackId) : (opts.attack || null);
    o.status = opts.status !== undefined ? opts.status : (STATUS[element] || null); o.onReflect = opts.onReflect || null; o.team = 'enemy';
    // aim at the caster's threat target (taunt ally) when it isn't the player
    const T = this.ctx.target;
    o.aim = T && T !== game.player?.entity && T.alive !== false ? T : null;
    o.g.position.copy(origin); o.g.visible = true;
    // enemy style (R11): dark core + element rim, no white
    o.coreMat.color.setHex(F.dark);
    o.halo.material.color.setHex(col); o.halo2.material.color.setHex(F.light ?? col);
    const pc = this.ctx.playerCenter;   // = the caster's target centre while the caster updates (ctx.retarget)
    o.vel.subVectors(o.aim ? (o.aim.getCenter ? o.aim.getCenter(_c) : _c.copy(o.aim.object.position)) : pc, origin);
    if (o.vel.lengthSq() < 1e-6) o.vel.set(Math.sin(source?.facing || 0), 0, Math.cos(source?.facing || 0));
    o.vel.normalize().multiplyScalar(o.practice ? Math.min(o.speed, 5.5) : o.speed);
    const vfx = game.vfx;
    o.trail = vfx.trail?.(o.g, { owner: 'enemy', color: col, width: 0.3, length: 4, fade: 0.35 });
    o.em = vfx.emitter?.({ owner: 'enemy', follow: o.g, rate: 18, color: [col, F.dark], speed: 0.6, spread: 1, size: 0.12, sizeEnd: 0, life: 0.4,
      shape: element === 'ice' ? 'snow' : element === 'fire' ? 'ember' : 'spark', drag: 2, gravity: element === 'fire' ? -2 : 1 });
    try { o.marker = game.tells?.projectile?.(o.g, { r: 0.6 }) || null; } catch (_) { o.marker = null; }
    return o;
  }
  /** Live enemy orbs (not reflected). */
  orbCount() { let n = 0; for (const o of this.orbs) if (o.active && !o.reflected) n++; return n; }
  /** Seconds until the nearest enemy orb flying at pos arrives (straight-line estimate, ≤ 1.2 m miss), or Infinity. */
  orbEta(pos) {
    let best = Infinity;
    if (!pos) return best;
    for (const o of this.orbs) {
      if (!o.active || o.reflected) continue;
      const p = o.g.position, v = o.vel;
      const sp = Math.hypot(v.x, v.z); if (sp < 1e-3) continue;
      const ux = v.x / sp, uz = v.z / sp, dx = pos.x - p.x, dz = pos.z - p.z;
      const along = dx * ux + dz * uz; if (along < 0) continue;
      const perp = Math.abs(-dx * uz + dz * ux);
      if (perp > 1.2) continue;
      const t = along / sp; if (t < best) best = t;
    }
    return best;
  }
  _killOrb(o, explode, fizzle = false) {
    if (!o.active) return;
    o.active = false; o.g.visible = false;
    o.trail?.stop?.(); o.em?.stop?.(); o.trail = o.em = null;
    o.marker?.stop?.(); o.marker = null;
    if (fizzle) this.ctx.game.vfx.burst?.(o.g.position, { owner: 'enemy', count: 5, color: [o.col, 0x3a2a4a], speed: 1.2, spread: 1, size: 0.1, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
    if (explode) {
      const vfx = this.ctx.game.vfx;
      vfx.impact?.(o.g.position, { owner: 'enemy', element: ELEMENT_COLORS[o.element] != null ? o.element : 'physical', scale: o.practice ? 0.6 : 0.8 });
      vfx.burst(o.g.position, { owner: 'enemy', count: 10, color: [o.col, 0x3a2a4a], speed: 3.5, spread: 1, size: 0.13, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 2 });
      this.ctx.audio(o.practice ? 'hit' : 'impact_' + o.element, { position: o.g.position, volume: 0.6 });
    }
  }

  /** wind.gust: reflect every live orb inside the cone (origin, dir, len, full angle in degrees). Returns the count. */
  reflectCone(origin, dir, len, angDeg) {
    const cosH = Math.cos((angDeg || 60) * Math.PI / 360);
    let n = 0;
    for (const o of this.orbs) {
      if (!o.active || o.reflected) continue;
      const p = o.g.position;
      const dx = p.x - origin.x, dz = p.z - origin.z, d = Math.hypot(dx, dz);
      if (d > len || (d > 0.5 && (dx * dir.x + dz * dir.z) / (d * (Math.hypot(dir.x, dir.z) || 1)) < cosH)) continue;
      this._reflect(o, 'player'); n++;
    }
    return n;
  }

  _reflect(o, by) {
    if (!o.active || o.reflected) return;
    o.reflected = true; o.t = 0; o.team = 'player';
    try { o.onReflect?.(by); } catch (_) { /* */ }
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
    vfx.burst?.(p, { owner: 'enemy', count: 24, color: [0xffe27a, PALE], speed: 6, spread: 1, size: 0.14, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 2 });
    vfx.shockwave?.(p, { owner: 'enemy', color: 0xffe9a0, radius: 1.6, duration: 0.25, vertical: true, opacity: 0.8, thickness: 0.15 });
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
    // v4: drawn by tells in the threat scene (legacy adapter) instead of the v3 main-scene ring
    b.tele = this.ctx.tele?.({ shape: 'circle', pos: to, r: opts.radius ?? 3.2, dur: T, color: 0xff6a2a }) || null;
    b.em = this.ctx.game.vfx.emitter?.({ owner: 'enemy', follow: b.m, rate: 26, color: [0xcdb48a, 0x8a7a5a], speed: 0.6, spread: 1, size: 0.6, sizeEnd: 1.3, life: 0.7, shape: 'smoke', additive: false, drag: 1.5 });
    return b;
  }

  update(dt) {
    const ctx = this.ctx, game = ctx.game, world = game.world;
    this._updateSpores(dt);
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
            point: p.clone(), direction: _v.clone(), knockback: 7, heavy: true, status: o.practice ? undefined : (STATUS[o.element] || undefined), tags: ['reflect'] });
          this._killOrb(o, true);
        }
        continue;
      }
      // temp colliders (ice walls, shields, barriers) block or reflect enemy projectiles (CONTRACT §13/§14)
      const bl = this._blocked(p);
      if (bl === 'block') { this._killOrb(o, true); continue; }
      if (bl === 'reflect') { this._reflect(o, null); continue; }
      const maxSp = o.speed;
      const aimE = o.aim && o.aim.alive !== false && !o.aim.dying ? o.aim : null;
      const aimC = aimE ? (aimE.getCenter ? aimE.getCenter(_c) : _c.copy(aimE.object.position).setY(aimE.object.position.y + 1)) : pc;
      if (aimE) {
        if (p.distanceToSquared(aimC) < 0.9) {
          if (aimE.isDecoy || typeof aimE.hp !== 'number') { aimE.onDecoyHit?.(o.source); aimE.alive = false; }
          else if (!o.source?.noDamage) game.combat.dealDamage(aimE, { amount: o.amount, element: o.element, source: o.source, point: p.clone(), status: o.status || undefined, attack: o.attack || undefined });
          this._killOrb(o, true); continue;
        }
      }
      // homing for ≤ homeT seconds at ≤ 120°/s, then straight (§4.0)
      if (o.t <= o.homeT && (ctx.playerAlive || aimE)) {
        const sp0 = o.vel.length() || maxSp;
        _u.copy(o.vel).multiplyScalar(1 / sp0);
        _w.subVectors(aimC, p); const wl = _w.length();
        if (wl > 1e-4) {
          _w.multiplyScalar(1 / wl);
          const cosA = Math.max(-1, Math.min(1, _u.dot(_w))), ang = Math.acos(cosA), mx = ORB_RULES.turnRate * dt;
          if (ang > 1e-5) {
            if (ang <= mx) _u.copy(_w);
            else { const sa = Math.sin(ang), k = mx / ang; _u.multiplyScalar(Math.sin((1 - k) * ang) / sa).addScaledVector(_w, Math.sin(k * ang) / sa).normalize(); }
          }
          o.vel.copy(_u).multiplyScalar(sp0);
        }
      }
      p.addScaledVector(o.vel, dt);
      const pulse = 1 + Math.sin(o.t * 22) * 0.12;
      o.halo.scale.setScalar(1.3 * pulse); o.core.rotation.y += dt * 6;
      if (o.t > (o.practice ? 9 : 6) || p.y < ctx.groundH(p.x, p.z) + 0.05) { this._killOrb(o, true); continue; }
      if (pe && pe.alive && !pe.invulnerable && p.distanceToSquared(pc) < ORB_RULES.hitR * ORB_RULES.hitR) {
        _v.copy(o.vel).setY(0).normalize();
        if (!o.source?.noDamage) game.combat.dealDamage(pe, { amount: o.amount, element: o.element, source: o.source, point: p.clone(), direction: _v.clone(),
          knockback: o.practice ? 2 : 5, status: o.practice ? undefined : (o.status || undefined), projectile: o.handle, tags: o.practice ? ['practice'] : undefined,
          attack: o.attack || undefined, sourceName: o.source?.name });
        if (!o.reflected) this._killOrb(o, true);
      }
    }
    for (const b of this.boulders) {
      if (!b.active) continue;
      b.t += dt;
      const bb = this._blocked(b.m.position);
      if (bb) { b.T = Math.min(b.T, b.t); b.vel.set(0, -20, 0); }
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
        game.vfx.explosion?.(_c, { owner: 'enemy', element: 'earth', scale: 1.1 });
        game.vfx.debris?.(_c, { owner: 'enemy', count: 14, size: 0.45, speed: 9, material: 'rock' });
        game.vfx.decal?.(_c, { owner: 'enemy', radius: r * 0.8, duration: 6, type: 'crack' });
        ctx.audio('explode_earth', { position: _c, volume: 0.9 });
      }
    }
  }

  _updateSpores(dt) {
    if (!this.spores) return;
    const ctx = this.ctx, game = ctx.game, vfx = game.vfx;
    for (const b of this.spores) {
      if (!b.active) continue;
      b.t += dt;
      b.vel.y -= 22 * dt;
      b.g.position.addScaledVector(b.vel, dt);
      b.g.rotation.y += dt * 4;
      const p = b.g.position;
      const gh = ctx.groundH(p.x, p.z);
      if (this._blocked(p) || (b.t > 0.12 && p.y < gh + 0.2) || b.t > b.T + 0.8) {
        b.active = false; b.g.visible = false; b.em?.stop?.(); b.em = null; b.tele?.stop?.(); b.tele = null;
        // the cloud sits on the drawn landing circle (hitbox = decal) unless a collider stopped the sac early
        const onTarget = Math.hypot(p.x - b.to.x, p.z - b.to.z) < 1.5;
        this.cloud(onTarget ? b.to : p, b.source, { attackId: b.attackId });
      }
    }
    for (const c of this.clouds) {
      if (!c.active) continue;
      if (c.delay > 0) { c.delay -= dt; if (c.delay <= 0) this._cloudStart(c); else continue; }
      c.t += dt; c.tick -= dt; c.fx -= dt;
      if (c.t > c.life) { c.active = false; c.hz?.stop?.(); c.hz = null; continue; }
      if (c.fx <= 0) {
        c.fx = 0.22;
        const a = Math.random() * 6.28, r = Math.random() * c.r * 0.8;
        _v.set(c.pos.x + Math.sin(a) * r, c.pos.y + 0.3, c.pos.z + Math.cos(a) * r);
        vfx.burst(_v, { owner: 'enemy', count: 3, color: [0xd8ff6a, 0x7fc04a], speed: 0.6, spread: 1, size: 0.7, sizeEnd: 1.4, life: 1.2, shape: 'smoke', additive: false, drag: 1.5, gravity: -0.3 });
        vfx.burst(_v, { owner: 'enemy', count: 2, color: [PALE, 0xe8ff9a], speed: 0.5, spread: 1, size: 0.08, sizeEnd: 0, life: 1.0, shape: 'spark', gravity: -0.6 });
      }
      if (c.tick <= 0) {
        c.tick = 0.8;
        const pe = game.player?.entity, pp = ctx.realPlayerPos || ctx.playerPos;
        const live = c.hz ? c.hz.alive !== false : !game.tells?.hazard;   // ticks only while the hazard decal is up
        if (live && pe && pe.alive && !c.source?.noDamage && Math.hypot(pp.x - c.pos.x, pp.z - c.pos.z) <= c.r + 0.15 && Math.abs(pp.y - c.pos.y) < 2.5) {
          game.combat.dealDamage(pe, { amount: 3, element: 'nature', source: c.source && c.source.alive ? c.source : null, point: pp, status: { seeded: { dur: 6, stacks: 1 } }, tags: ['zone'],
            attack: c.attack || undefined, dot: true, sourceName: c.source?.name });
        }
      }
    }
  }

  clear() {
    if (this.spores) { for (const b of this.spores) { b.active = false; b.g.visible = false; b.em?.stop?.(); b.tele?.stop?.(); } for (const c of this.clouds) { c.active = false; c.hz?.stop?.(); c.hz = null; } }
    for (const o of this.orbs) this._killOrb(o, false);
    for (const b of this.boulders) { b.active = false; b.m.visible = false; b.em?.stop?.(); }
  }
}
