// HP auto-regen (CONTRACT §10.3, DESIGN §7). Evaluated every frame in GAME time.
//
//  • Net-loss tracking: player.onBeforeDamage snapshots hp (snapshot()); onHit/onDeath call afterHit() AFTER block refunds and the
//    dmgTakenMul refund, and lastHurtT moves only when hp actually dropped (DoT ticks and the 1-damage minimum count; full blocks,
//    parries, i-frame dodges and refunds do not).
//  • inCombat() = hurt within 3 s OR enemies.anyAggroWithin(pos, 30) (plus aggroed / debug-aggroed entities as a fallback).
//  • delay = (inCombat ? derived.regenDelay 5 : regenDelayOOC 3) + stats.regenDelayAdd, floor 1.0; ×0.5 in a blessed zone.
//  • rate = (inCombat ? 1.5% : 8%) × regenRateMul + regenRateAdd (+1%/s blessed) (×0.6 in a boss fight), eased in over 1 s.
//  • heal through combat.healPlayer(amount, 'regen', {hot:true}) so the boss HoT cap applies; disabled when dead/dying,
//    stats.regenDisabled or the blight status. Emits hpRegenStart {rate} / hpRegenStop {reason:'hurt'|'full'|'blocked'}.
//  • player.regen = this.state (reused object, read-only for others). Feet motes: 2 per 0.3 s through vfx.burst (pooled).
import * as THREE from 'three';

export const REGEN = { combatWindow: 3, aggroRadius: 30, minDelay: 1, blessedDelayMul: 0.5, blessedRateAdd: 0.01, bossMul: 0.6,
  bossRadius: 75, ramp: 1.0, moteEvery: 0.3, aggroCheckEvery: 0.1 };
const MOTE_OPTS = { count: 2, color: [0x9dff9a, 0xffe9a0], speed: 0.7, spread: 0.35, dir: null, size: 0.06, sizeEnd: 0, life: 0.9, gravity: -1.2, shape: 'spark', drag: 1 };
MOTE_OPTS.dir = new THREE.Vector3(0, 1, 0);

export class Regen {
  constructor(game, entity, pos) {
    this.game = game; this.entity = entity; this.pos = pos;
    this.state = { active: false, delay: 3, delayLeft: 0, inCombat: false, rate: 0, blessed: false, boss: false, disabled: false };
    this.lastHurtT = -1e9;
    this.hpBefore = NaN;
    this.rampT = 0; this.moteT = 0;
    this._aggroT = -1; this._aggro = false;
    this._mote = new THREE.Vector3();
    this.dying = () => false;
    this.firstToastDone = false;
  }
  stat(k, d) { try { const v = this.game.stats?.get?.(k); return v === undefined ? d : v; } catch (_) { return d; } }

  /** onBeforeDamage: snapshot the HP before anything is applied. */
  snapshot() { this.hpBefore = this.entity.hp; }
  /** onHit / onDeath (after refunds): a net HP loss resets the timer. Returns true when it counted. */
  afterHit() {
    const before = this.hpBefore;
    this.hpBefore = NaN;
    if (!Number.isFinite(before)) return false;
    if (this.entity.hp < before - 1e-6) {
      // water.key 조수의 맹세: in water the regen never pauses (core flag noRegenPause: never)
      if (this.stat('noRegenPause', false)) return false;
      if (this.stat('noRegenPauseInWater', false)) {
        let wet = false; try { wet = !!this.game.world?.isInWater?.(this.pos.x, this.pos.z); } catch (_) { wet = false; }
        if (wet) return false;
      }
      this.markHurt(); return true;
    }
    return false;
  }
  markHurt() {
    this.lastHurtT = this.game.time;
    this.rampT = 0;
    if (this.state.active) this.stop('hurt');
  }
  stop(reason) {
    if (!this.state.active) return;
    this.state.active = false;
    try { this.game.events.emit('hpRegenStop', { reason }); } catch (_) { /* */ }
  }

  aggroNear() {
    const g = this.game, t = g.time;
    if (t - this._aggroT < REGEN.aggroCheckEvery && t >= this._aggroT) return this._aggro;
    this._aggroT = t;
    let on = false;
    try { on = !!g.enemies?.anyAggroWithin?.(this.pos, REGEN.aggroRadius); } catch (_) { on = false; }
    if (!on) {
      const r2 = REGEN.aggroRadius * REGEN.aggroRadius, P = this.pos, list = g.entities || [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || !e.alive || e.team === 'player' || e.isProp || !e.object) continue;
        if (!(e.debugAggro || (e.aggro && !e.isDummy))) continue;
        if (e.object.position.distanceToSquared(P) < r2) { on = true; break; }
      }
    }
    this._aggro = on;
    return on;
  }
  inCombat() { return this.game.time - this.lastHurtT < REGEN.combatWindow || this.aggroNear(); }

  blessed() {
    const g = this.game, P = this.pos;
    try { if (g.world?.surface2?.isBlessed?.(P)) return true; } catch (_) { /* */ }
    try { if (g.spells?.api?.zones?.isInside?.('holy', P)) return true; } catch (_) { /* */ }
    return false;
  }
  bossFight() {
    const b = this.game.enemies?.boss;
    if (!b || !b.alive || !b.isBoss) return false;
    const bp = b.object?.position;
    return !bp || bp.distanceToSquared(this.pos) < REGEN.bossRadius * REGEN.bossRadius;
  }
  disabled() {
    const e = this.entity;
    if (!e.alive || this.dying()) return true;
    if (this.stat('regenDisabled', false)) return true;
    if (e.statuses?.blight) return true;
    return false;
  }

  heal(amount) {
    const g = this.game;
    if (typeof g.combat?.healPlayer === 'function') {
      try { return g.combat.healPlayer(amount, 'regen', { hot: true }) || 0; } catch (_) { /* fall through */ }
    }
    const e = this.entity, before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + amount * (this.stat('healMul', 1) || 1));
    return e.hp - before;
  }

  /** Per frame, after the resource regen (game dt). */
  update(dt) {
    const S = this.state, g = this.game, e = this.entity;
    let D = null; try { D = g.stats?.derived?.(); } catch (_) { D = null; }
    const inC = this.inCombat();
    const bl = this.blessed();
    let delay = (inC ? (D?.regenDelay ?? 5) : (D?.regenDelayOOC ?? 3)) + (this.stat('regenDelayAdd', 0) || 0);
    delay = Math.max(REGEN.minDelay, delay);
    if (bl) delay *= REGEN.blessedDelayMul;
    const since = g.time - this.lastHurtT;
    S.inCombat = inC; S.blessed = bl; S.delay = delay;
    S.delayLeft = Math.max(0, delay - since);
    const boss = this.bossFight(); S.boss = boss;
    let rate = (inC ? (D?.regenRate ?? 0.015) : (D?.regenRateOOC ?? 0.08)) * (this.stat('regenRateMul', 1) ?? 1) + (this.stat('regenRateAdd', 0) || 0);
    if (bl) rate += REGEN.blessedRateAdd;
    if (boss) rate *= REGEN.bossMul;
    S.rate = rate;
    const dis = this.disabled(); S.disabled = dis;
    const full = e.hp >= e.maxHp - 1e-6;
    const can = !dis && since >= delay && !full && rate > 0;
    if (!can) {
      if (S.active) this.stop(dis ? 'blocked' : full ? 'full' : 'hurt');
      this.rampT = 0;
      return;
    }
    if (!S.active) {
      S.active = true;
      try { g.events.emit('hpRegenStart', { rate }); } catch (_) { /* */ }
      if (!this.firstToastDone) { this.firstToastDone = true; try { g.ui?.tip?.('regen', '피해를 받지 않으면 체력이 자동으로 회복됩니다'); } catch (_) { /* */ } }
    }
    this.rampT = Math.min(REGEN.ramp, this.rampT + dt);
    const k = this.rampT / REGEN.ramp, ease = k * k * (3 - 2 * k);
    if (dt > 0) this.heal(rate * ease * e.maxHp * dt);
    // feet motes (pooled particles in vfx)
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = REGEN.moteEvery;
      const m = this._mote, a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.35;
      m.set(this.pos.x + Math.cos(a) * r, this.pos.y + 0.1, this.pos.z + Math.sin(a) * r);
      try { g.vfx?.burst?.(m, MOTE_OPTS); } catch (_) { /* */ }
    }
  }
  reset() { this.lastHurtT = -1e9; this.hpBefore = NaN; this.rampT = 0; this.stop('full'); }
}
