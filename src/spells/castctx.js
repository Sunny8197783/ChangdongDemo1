// Cast context for spell code (non-visual v4 integration kept after the v4 look was rolled back to v3 at user request).
//   • castId: every cast runs inside begin()/end(); deferred timers (S.later / laterReal) are bound to the cast; every hit dealt
//     through S.combat is stamped with the cast's castId (one hitstop / one reaction burst per cast, PLAN v4 §7.4.7).
//   • castById adoption: the skills runtime stamps ctx.castId with game.nextCastId() before perform(); the legacy adapter path may not
//     forward it, so the last issued id is remembered and adopted once (takeIssued).
//   • lock(sec) / castLock(): non-cancellable cast recovery read by the player's dodge buffer (§5.8).
//   • adopt(root): spell objects are tagged noCameraCollide / owner 'player' and their private materials go through
//     vfx.applyPlayerFx (threat-scene ducking, R8) — no colour / blending / depth changes.
//   • lookOf(id): every caster skill declares 'legacy' (the v3 look).
import * as THREE from 'three';

const LEGACY_SKILL = { basic: 'basic', heavy: 'charged', ultimate: 'ult', awakened: 'awakened', support: 'sup', finisher: 'finisher' };
/** 'fire_heavy' → 'fire.charged' (legacy v2 def id → registry skill id). */
export const skillOfSpell = (spellId) => { const k = String(spellId).lastIndexOf('_'); return k > 0 ? spellId.slice(0, k) + '.' + (LEGACY_SKILL[spellId.slice(k + 1)] || spellId.slice(k + 1)) : spellId; };

export function createCastCtx(S) {
  const game = S.game;
  let cur = null, lockUntil = 0, installed = false;
  const issued = { id: 0, used: 0 };
  const now = () => game.time || 0;

  function install() {
    if (installed) return true;
    const nc = game.nextCastId;
    if (typeof nc === 'function' && !nc.__magic) {
      const wrapped = function () { const id = nc.apply(this, arguments); issued.id = id; return id; };
      wrapped.__magic = true; game.nextCastId = wrapped;
    }
    installed = true;
    return true;
  }
  function takeIssued() { if (issued.id > issued.used) { issued.used = issued.id; return issued.id; } return 0; }
  /** begin({castId, skillId, el}) → previous context (pass to end()). */
  function begin(o = {}) {
    const castId = o.castId || takeIssued() || (game.nextCastId?.() ?? 0);
    issued.used = Math.max(issued.used, castId);
    const prev = cur;
    cur = { castId, skillId: o.skillId || null, el: o.el || null };
    return prev;
  }
  function end(prev) { cur = prev ?? null; }
  function within(c, fn, ...a) { const p = cur; cur = c; try { return fn(...a); } finally { cur = p; } }
  function swap(c) { const p = cur; cur = c; return p; }
  function bind(fn) { const c = cur; if (!c) return fn; return (...a) => within(c, fn, ...a); }
  function stamp(h) { if (h && h.castId == null && cur) h.castId = cur.castId; return h; }

  function lock(sec) { lockUntil = Math.max(lockUntil, (game.realTime ?? now()) + Math.max(0, sec)); }
  function castLock() { const t = game.realTime ?? now(); return Math.max(0, lockUntil - t); }
  function unlock() { lockUntil = 0; }

  function lookOf(id) { return game.skills?.def?.(id) ? 'legacy' : null; }

  const adopted = new WeakSet();
  function adopt(root, { role = 'fill' } = {}) {
    if (!root?.traverse) return root;
    const apf = game.vfx?.applyPlayerFx;
    root.traverse((o) => {
      o.userData.noCameraCollide = true; if (!o.userData.owner) o.userData.owner = 'player';
      if (!o.isMesh && !o.isPoints && !o.isSprite) return;
      for (const m of [].concat(o.material)) {
        if (!m || adopted.has(m) || m.userData?.shared || m.isRawShaderMaterial) continue;
        adopted.add(m);
        try { if (typeof apf === 'function') apf(m, { role, additive: m.blending === THREE.AdditiveBlending }); } catch (_) { /* */ }
      }
    });
    return root;
  }

  return {
    install, begin, end, within, swap, bind, stamp, takeIssued, lock, castLock, unlock, lookOf, adopt, skillOfSpell,
    get cur() { return cur; }, get installed() { return installed; }, S, game,
  };
}
