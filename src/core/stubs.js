// Minimal fallbacks used by main.js when a module file is missing or fails to load.
// They let each module be developed and tested in isolation. Not used in the final game.
import * as THREE from 'three';
import { toonMat } from './utils.js';
import { familyOf } from './classes.js';
import { hitTest as refHitTest, TELL_MIN, TELL_LOCK, DEFAULT_LOCK_AT, tellDuration } from './tellgeom.js';
import { threatColor } from './threat.js';

const noop = () => {};
// v4: kit, shared, applyPlayerFx, fxMulAt, fxFactor and debug must read as absent so feature detection works (PLAN §7.3).
const NOT_FX = new Set(['prewarm', 'warmup', 'init', 'then', 'toJSON', 'stats', 'hitFeel', 'telegraph', 'dissolve',
  'kit', 'shared', 'applyPlayerFx', 'fxMulAt', 'fxFactor', 'debug']);

/** Legacy v3 decal kind for a tells shape (the stub draws through the fixed vfx.telegraph so stub mode stays readable). */
const LEGACY_SHAPE = { circle: 'circle', ring: 'ring', cone: 'cone', line: 'line', capsule: 'line', conecap: 'line' };

/**
 * Core tells stub (PLAN §7.3 / §7.4.4): the full surface with isStub:true. attack() returns a real handle timed on
 * game.enemyTime with the §5.7 floors and assist.tellMul; hitTest is the reference geometry (core/tellgeom.js).
 * No threat-scene content; when vfx.telegraph exists the stub draws the fixed v3 decal for the attack's shape.
 */
function createTellsStub(game) {
  const live = [];                       // active handles
  const EMPTY = [];                      // active() → reused empty array (the stub has no threat-scene records)
  const FOOT = { data: new Float32Array(64), n: 0 };
  const _p = new THREE.Vector3();
  const now = () => game.enemyTime || 0;
  const emit = (n, p) => { try { game.events.emit(n, p); } catch (_) { /* */ } };
  const assist = () => game.assist || { tellMul: 1 };
  const playerPos = () => game.player?.object?.position || game.player?.entity?.object?.position || null;

  function canAttack(e /* , opts */) {
    if (!e) return true;
    return !(e.vulnerableUntil > now());
  }
  function windup(e, base, cls) { return tellDuration(base, cls, assist().tellMul, e?.timeMul ?? 1); }
  function nameOf(e, spec) {
    if (spec.nameKo) return spec.nameKo;
    try {
      const c = game.enemies?.codex?.()?.[e?.type || e?.kind];
      const a = c?.attacks?.find?.((x) => x.id === spec.id);
      if (a?.nameKo) return a.nameKo;
    } catch (_) { /* */ }
    return '';
  }
  function legacyDecal(h, spec) {
    const V = game.vfx; const sh = spec.shape;
    if (!sh || !V?.telegraph || spec.legacyDecal === false) return null;
    const kind = LEGACY_SHAPE[sh.kind] || 'circle';
    const pos = sh.pos || e2p(h.enemy);
    if (!pos) return null;
    const col = threatColor(spec.tell || 'danger', assist().colorblind).rim;
    const o = { shape: kind, pos, dir: sh.dir, r: sh.r, inner: sh.inner, width: sh.width, color: col, parryable: spec.tell === 'parry',
      dur: h.dur / Math.max(0.05, assist().enemySpeed || 1) };
    if (sh.angle != null) o.angle = sh.angle * 2 * 180 / Math.PI;           // legacy: degrees, full angle
    if (sh.kind === 'line') o.len = sh.len;
    if ((sh.kind === 'capsule' || sh.kind === 'conecap') && sh.end) {
      const dx = sh.end.x - pos.x, dz = sh.end.z - pos.z, L = Math.hypot(dx, dz) || 0.01;
      o.dir = new THREE.Vector3(dx / L, 0, dz / L); o.len = L; o.width = sh.width ?? 1.6;
    }
    try { return V.telegraph(o); } catch (_) { return null; }
  }
  const e2p = (e) => e?.object?.position || e?.position || null;

  class StubTellHandle {
    constructor(e, spec) {
      this.id = spec.id || 'attack'; this.enemy = e || null; this.spec = spec;
      this.tell = spec.tell || 'danger'; this.cls = spec.cls || 'mobLight';
      this.start = now();
      this.dur = windup(e, spec.windup ?? 0, this.cls);
      this.lockAt = Math.max(spec.lockAt ?? DEFAULT_LOCK_AT, TELL_LOCK[this.cls] ?? 0);
      this.done = false; this.alive = true; this._struck = false; this._committed = false;
      this.targetsPlayer = spec.targetsPlayer !== false;
      const sh = spec.shape || null;
      this.shape = sh ? { ...sh, pos: (sh.pos || e2p(e) || new THREE.Vector3()).clone?.() || sh.pos, dir: sh.dir?.clone?.() || sh.dir, end: sh.end?.clone?.() || sh.end } : null;
      this.nameKo = nameOf(e, spec);
      this.decal = null;
    }
    get progress() { return this.dur > 0 ? Math.max(0, Math.min(1, (now() - this.start) / this.dur)) : 1; }
    get remaining() { return Math.max(0, this.start + this.dur - now()); }
    get locked() { return this.remaining <= this.lockAt; }
    consumeStrike() {
      if (this._struck || !this.alive) return false;
      if (now() < this.start + this.dur - 1e-9) return false;
      this._struck = true; this.done = true; this.alive = false; drop(this);
      emit('tellEnd', { enemy: this.enemy, id: this.id, reason: 'strike' });
      return true;
    }
    contains(pos, pad = 0.15) {
      if (!this.shape || !pos) return false;
      if (this.spec.shape?.follow && this.enemy && !this.locked) { const p = e2p(this.enemy); if (p) this.shape.pos.copy?.(p); }
      return refHitTest(this.shape, pos, pad);
    }
    setPos(v) { if (this.shape && v && !this.locked) this.shape.pos.copy?.(v); this.decal?.setPosition?.(v); return this; }
    setDir(v) { if (this.shape && v && !this.locked) { if (this.shape.dir?.copy) this.shape.dir.copy(v); else this.shape.dir = v.clone?.() || v; } return this; }
    setEnd(v) { if (this.shape && v && !this.locked) { if (this.shape.end?.copy) this.shape.end.copy(v); else this.shape.end = v.clone?.() || v; } return this; }
    extend(sec) { if (this.alive && sec > 0) this.dur += sec; return this; }
    stop(reason = 'cancel') {
      if (!this.alive) return;
      this.alive = false; this.done = true; drop(this);
      try { this.decal?.stop?.(); } catch (_) { /* */ }
      emit('tellEnd', { enemy: this.enemy, id: this.id, reason });
    }
  }
  function drop(h) { const i = live.indexOf(h); if (i >= 0) live.splice(i, 1); }

  return {
    isStub: true,
    MIN: TELL_MIN, LOCK: TELL_LOCK,
    telegraph: null, renderThumb: null,
    attack(e, spec = {}) {
      if (!canAttack(e, spec)) return null;
      const h = new StubTellHandle(e, spec);
      live.push(h);
      h.decal = legacyDecal(h, spec);
      emit('tellStart', { enemy: e, id: h.id, nameKo: h.nameKo, tell: h.tell, windup: h.dur, pos: h.shape?.pos || e2p(e), targetsPlayer: h.targetsPlayer });
      return h;
    },
    hitTest: refHitTest,
    canAttack, windup,
    nextImpact(pos) {
      let best = Infinity;
      for (let i = 0; i < live.length; i++) {
        const h = live[i]; if (!h.alive) continue;
        if (h.targetsPlayer || (pos && h.contains(pos))) { const r = h.remaining; if (r < best) best = r; }
      }
      return best;
    },
    punish(e, dur, { mul = 1.25 } = {}) {
      if (!e || !(dur > 0)) return;
      e.vulnerableUntil = now() + dur; e.vulnerableMul = mul;
      emit('punishWindow', { enemy: e, dur, mul });
    },
    projectile() { return { stop() {} }; },
    hazard() { return { stop() {} }; },
    safe() { return { stop() {} }; },
    active() { return EMPTY; },
    footprints() { FOOT.n = 0; return FOOT; },
    update() {
      // tellCommit at lock; handles never consumed are dropped 2 s after their hit time (no leak)
      const t = now();
      for (let i = live.length - 1; i >= 0; i--) {
        const h = live[i];
        if (!h._committed && h.locked) { h._committed = true; emit('tellCommit', { enemy: h.enemy, id: h.id }); }
        if (t > h.start + h.dur + 2 || (h.enemy && h.enemy.alive === false)) h.stop('cancel');
      }
    },
    preOverlay() {},
    debug: { setVisible() {}, pixelsOf() { return 0; }, pool() { return { active: live.length, max: 16 }; }, rims() { return 0; }, live: () => live.length },
  };
}

export const stubs = {
  tells: createTellsStub,
  world(game) {
    const g = new THREE.PlaneGeometry(400, 400); g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, toonMat(0x7fbf5a)); ground.receiveShadow = true;
    game.scene.add(ground);
    game.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a8a4a, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.position.set(30, 60, 20); game.scene.add(sun);
    game.scene.background = new THREE.Color(0x9fd3ff);
    game.scene.fog = new THREE.Fog(0x9fd3ff, 60, 300);
    return {
      update: noop,
      getHeight: () => 0,
      getGroundHeight: () => 0,
      clampToBounds: (p) => p,
      respecSpots: [new THREE.Vector3(0, 0, 5)],
      getNormal: (x, z, out = new THREE.Vector3()) => out.set(0, 1, 0),
      raycast(origin, dir, maxDist = 200) {
        if (dir.y >= -1e-4) return null;
        const t = -origin.y / dir.y; if (t > maxDist) return null;
        return origin.clone().addScaledVector(dir, t);
      },
      resolveCollision: noop,
      isInWater: () => false, waterLevel: -10,
      colliders: [],
      playerSpawn: new THREE.Vector3(0, 0, 20),
      trainingArea: new THREE.Vector3(0, 0, 5),
      camps: [
        { id: 'camp0', position: new THREE.Vector3(-30, 0, -10), radius: 12 },
        { id: 'camp1', position: new THREE.Vector3(30, 0, -20), radius: 12 },
        { id: 'camp2', position: new THREE.Vector3(0, 0, -45), radius: 12 },
      ],
      bossArena: { position: new THREE.Vector3(0, 0, -80), radius: 20 },
      bounds: 190,
    };
  },
  vfx(game) {
    const api = new Proxy({ update: noop, textures: {} }, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k !== 'string' || NOT_FX.has(k)) return undefined;   // lifecycle hooks / thenable checks must stay absent
        return () => ({ stop: noop, setPosition: noop, alive: false });
      },
    });
    return api;
  },
  combat(game) {
    return {
      update: noop, REACTIONS: [], discovered: new Set(),
      register(e) { game.entities.push(e); },
      unregister(e) { const i = game.entities.indexOf(e); if (i >= 0) game.entities.splice(i, 1); },
      dealDamage(t, hit) {
        if (!t.alive) return { damage: 0 };
        t.hp -= hit.amount; const killed = t.hp <= 0;
        if (hit.direction) t.velocity?.addScaledVector(hit.direction, (hit.knockback || 0) / (t.mass || 1));
        game.events.emit('damage', { target: t, amount: hit.amount, element: hit.element, point: hit.point, killed, isPlayer: t.team === 'player' });
        if (killed) { t.alive = false; t.onDeath?.({ killed }, hit); game.events.emit('kill', { target: t }); }
        else t.onHit?.({ damage: hit.amount }, hit);
        return { damage: hit.amount, killed };
      },
      applyStatus: noop, hasStatus: () => false, clearStatus: noop,
      canAct: () => true, speedMul: () => 1,
      queryRadius(p, r, team) {
        return game.entities.filter((e) => e.alive && (!team || e.team === team) &&
          e.object.position.distanceTo(p) < r + (e.radius || 0.5));
      },
      raycastEntities: () => null,
    };
  },
  audio() { return { update: noop, play: noop, loop: () => ({ stop: noop, setVolume: noop }), resume: noop }; },
  player(game) {
    const object = new THREE.Object3D(); object.position.copy(game.world.playerSpawn); game.scene.add(object);
    const entity = { id: 'player', team: 'player', alive: true, object, radius: 0.4, height: 1.8, hp: 100, maxHp: 100, mass: 1, velocity: new THREE.Vector3(), grounded: true, statuses: {} };
    game.combat.register(entity);
    const tip = new THREE.Vector3();
    return {
      entity, object, hp: 100, maxHp: 100, mp: 100, maxMp: 100, stamina: 100, maxStamina: 100,
      update() {
        game.camera.position.set(object.position.x, object.position.y + 4, object.position.z + 8);
        game.camera.lookAt(object.position.x, object.position.y + 1.5, object.position.z - 10);
      },
      spendMp: () => true,
      getStaffTip: (out = new THREE.Vector3()) => out.copy(object.position).add(tip.set(0.5, 1.6, -0.3)),
      getAim() {
        const origin = object.position.clone().add(new THREE.Vector3(0.5, 1.6, -0.3));
        const dir = new THREE.Vector3(); game.camera.getWorldDirection(dir);
        const point = origin.clone().addScaledVector(dir, 60);
        return { origin, dir, point, target: null };
      },
      playCast: noop, setCharging: noop, setStaffElement: noop,
    };
  },
  spells() {
    return { update: noop, elements: [], index: 0, element: 'fire',
      getHudState: () => ({ element: 'fire', index: 0, elements: [], slots: [], charging: false, chargeFrac: 0 }) };
  },
  /** CONTRACT §2: full skills stub. Registries forward to game.archetypes so magic/melee can register while skills is missing. */
  skills(game) {
    return {
      ownsInput: false, loadout: {}, attuned: null, trees: {}, nodes: new Map(), defs: new Map(), isStub: true,
      registerImpl: (...a) => game.archetypes.registerImpl(...a),
      registerArchetype: (...a) => game.archetypes.registerArchetype(...a),
      applyPreset() { return false; }, update() {}, cast() { return false; }, castSlot() { return false; }, equip() { return false; },
      unequip() {}, attune() { return false; }, cycleAttune() {}, isReady() { return false; }, cooldownLeft() { return 0; },
      canEquip() { return { ok: false, reason: 'stub' }; }, resetCooldowns() {}, autoEquip() {}, useGift() { return false; },
      effectiveParams() { return {}; }, serialize() { return null; }, deserialize() {},
      family: () => game.player?.family || familyOf(game.progression?.cls),
      style: () => game.player?.style || 'staff',
      getHudState() { const m = familyOf(game.progression?.cls) === 'melee' ? game.sword : game.spells; return m?.getHudState?.(); },
    };
  },
  enemies() { return { update: noop, list: [], anyAggroWithin: () => false, prewarmBoss: () => Promise.resolve(), getObjective: () => ({ phase: 'camps', campsCleared: 0, campsTotal: 3, boss: null }) }; },
  sword() {
    return { update: noop, getHudState: () => ({ element: 'fire', index: 0, elements: [], slots: [], charging: false, chargeFrac: 0 }) };
  },
  story(game) {
    return { update: noop, begin: noop, debugSkip: noop, getObjective: () => null, getMarkers: () => [], hasPrompt: () => false };
  },
  cinematic(game) {
    return { update: noop, active: false, timeScale: 1, playIntro: (done) => done?.(), play: (s, o) => o?.onEnd?.(), finisher: (o) => { o?.onImpact?.(); o?.onEnd?.(); } };
  },
  ui(game) { return { update: noop, toast: noop, init() { if (game.isTest) return; else document.addEventListener('click', () => game.state === 'title' && game.newGame(), { once: true }); } }; },
};
