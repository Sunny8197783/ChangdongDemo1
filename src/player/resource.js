// Player resources (CONTRACT §10.1, DESIGN §2.2): MP (casters), 투지 / resolve (melee) and stamina (everyone).
// Maxima come from game.stats.derived() and are refreshed on statsChanged, keeping the current percentage.
//   spendMp(n) · spendResolve(n) · spendStamina(n, {force}) — all return boolean, never allocate.
// 투지 regenerates 6/s (+ stats.resolveRegenAdd), +2 per landed hit, +4 per reaction. MP regenerates 9/s after 0.8 s.
export const RESOLVE_REGEN = 6, RESOLVE_PER_HIT = 2, RESOLVE_PER_REACTION = 4;
export const MP_REGEN = 9, MP_REGEN_DELAY = 0.8;
export const STAM_REGEN_GROUND = 30, STAM_REGEN_AIR = 12, STAM_REGEN_DELAY = 0.5, EXHAUST_RECOVER = 30;

export class Resources {
  constructor(game, entity) {
    this.game = game; this.entity = entity;
    this.mp = 100; this.maxMp = 100;
    this.resolve = 0; this.maxResolve = 0;
    this.stamina = 100; this.maxStamina = 100;
    this.lastMpSpend = -10; this.lastStamUse = -10; this.lastResolveSpend = -10;
    this.exhausted = false;
    this._init = false;
    this.bonus = { mp: 0, resolve: 0, stamina: 0 };   // flat max bonuses written by legacy code (e.g. 바람 깃털 +20 stamina)
  }
  /** 'mp' | 'resolve' from the class def (default mp). */
  get kind() { const c = this.game.classes?.get?.(this.game.progression?.cls); return c?.resource === 'resolve' ? 'resolve' : 'mp'; }
  stat(k, d) { try { const v = this.game.stats?.get?.(k); return v === undefined ? d : v; } catch (_) { return d; } }

  /** Re-read maxima from stats.derived(); keepPct keeps the fill fraction of each pool (HP included). */
  refresh(keepPct = true) {
    let D = null;
    try { D = this.game.stats?.derived?.(); } catch (_) { D = null; }
    if (!D) return;
    const e = this.entity;
    const set = (cur, oldMax, newMax) => {
      if (!(newMax >= 0)) return cur;
      if (!keepPct || !this._init || !(oldMax > 0)) return newMax;
      return Math.min(newMax, Math.max(0, cur / oldMax * newMax));
    };
    const hpMax = Math.max(1, D.maxHp || 100);
    if (e.maxHp !== hpMax) {
      const nv = set(e.hp, e.maxHp, hpMax);
      e.maxHp = hpMax;
      if (e.alive) e.hp = Math.max(e.hp > 0 ? 1 : 0, Math.round(nv * 100) / 100);
    }
    const mpMax = Math.max(0, (D.maxMp ?? 100) + (D.maxMp > 0 ? this.bonus.mp : 0));
    if (this.maxMp !== mpMax) { this.mp = set(this.mp, this.maxMp, mpMax); this.maxMp = mpMax; }
    const rsMax = Math.max(0, (D.maxResolve ?? 0) + (D.maxResolve > 0 ? this.bonus.resolve : 0));
    if (this.maxResolve !== rsMax) { this.resolve = set(this.resolve, this.maxResolve, rsMax); this.maxResolve = rsMax; }
    const stMax = Math.max(1, (D.maxStamina ?? 100) + this.bonus.stamina);
    if (this.maxStamina !== stMax) { this.stamina = set(this.stamina, this.maxStamina, stMax); this.maxStamina = stMax; }
    this._init = true;
  }
  /** Legacy writers (`player.maxStamina += 20`) become a flat bonus that survives stat refreshes. */
  setMax(kind, v) {
    const cur = kind === 'mp' ? this.maxMp : kind === 'resolve' ? this.maxResolve : this.maxStamina;
    if (!Number.isFinite(v)) return;
    this.bonus[kind] += v - cur;
    this.refresh(true);
  }
  fill() { this.mp = this.maxMp; this.resolve = this.maxResolve; this.stamina = this.maxStamina; this.exhausted = false; }

  spendMp(n) {
    n = +n || 0;
    if (n <= 0) return true;
    if (this.mp < n) return false;
    this.mp -= n; this.lastMpSpend = this.game.time; return true;
  }
  spendResolve(n) {
    n = +n || 0;
    if (n <= 0) return true;
    if (this.maxResolve <= 0) return this.spendMp(n);   // a caster calling the melee path still pays (MP)
    if (this.resolve < n) return false;
    this.resolve -= n; this.lastResolveSpend = this.game.time; return true;
  }
  /** Stamina for dodge/block/glide/sprint. force: allow going into exhaustion (empties the pool). */
  spendStamina(n, force = false) {
    n = +n || 0;
    if (n <= 0) return true;
    if (this.stamina < n && !(force && !this.exhausted)) return false;
    this.stamina = Math.max(0, this.stamina - n); this.lastStamUse = this.game.time;
    if (this.stamina <= 0) this.exhausted = true;
    return true;
  }
  drainStamina(rate, dt) {
    this.stamina -= rate * dt; this.lastStamUse = this.game.time;
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; return false; }
    return true;
  }
  addResolve(n) { if (this.maxResolve > 0 && this.entity.alive) this.resolve = Math.min(this.maxResolve, this.resolve + n); }

  /** Per-frame regen (game time). staminaBusy: sprinting/gliding/blocking this frame. */
  update(dt, grounded, staminaBusy) {
    const t = this.game.time;
    if (!this.entity.alive) return;
    if (this.maxMp > 0 && t - this.lastMpSpend > MP_REGEN_DELAY && this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + MP_REGEN * dt);
    if (this.maxResolve > 0 && this.resolve < this.maxResolve) {
      this.resolve = Math.min(this.maxResolve, this.resolve + (RESOLVE_REGEN + (this.stat('resolveRegenAdd', 0) || 0)) * dt);
    }
    if (!staminaBusy && t - this.lastStamUse > STAM_REGEN_DELAY) this.stamina += (grounded ? STAM_REGEN_GROUND : STAM_REGEN_AIR) * dt;
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    if (this.exhausted && this.stamina >= EXHAUST_RECOVER) this.exhausted = false;
    if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
  }

  /** Event hooks: +2 투지 per landed player hit, +4 per reaction. */
  bind() {
    const E = this.game.events;
    const isPl = (s) => s === 'player' || s?.team === 'player';
    E.on('damage', (p) => {
      if (!p || p.isPlayer || p.isProp || p.dot || !isPl(p.source) || this.maxResolve <= 0) return;
      if (p.target?.team === 'player') return;
      this.addResolve(RESOLVE_PER_HIT);
    });
    E.on('reaction', () => { if (this.maxResolve > 0) this.addResolve(RESOLVE_PER_REACTION); });
    E.on('statsChanged', () => this.refresh(true));
    E.on('classChosen', () => this.refresh(true));
  }
}
