// Combat v3: entity registry, the damage pipeline (the canonical formula), statuses, 49 elemental reactions,
// break gauge, void shield, resonance (원소 교향), heals and allies. Owner: combat (CONTRACT §8).
//   src/combat/statuses.js   STATUS_DEFS + applyStatus/canAct/speedMul + DoT ticks + aura ring
//   src/combat/reactions.js  REACTION_DEFS (49) + BY_TRIGGER index + HANDLERS + priority engine + cascade queue
//   src/combat/pipeline.js   dealDamage (formula, hitFeel single caller), healPlayer (boss HoT cap)
//   src/combat/break.js      break gauge + void shield
//   src/combat/resonance.js  원소 교향
//   src/combat/statusfx.js   per-entity status visuals (pooled)
import * as THREE from 'three';
import { createStatusFX } from './combat/statusfx.js';
import { STATUS_DEFS, createStatuses } from './combat/statuses.js';
import { REACTION_DEFS, REACTION_IDS, P0_IDS, P1_IDS, FAMILIES, BY_TRIGGER, BY_OBJECT, createReactions, reactionDef } from './combat/reactions.js';
import { createPipeline } from './combat/pipeline.js';
import { createBreak, BREAK_RULES } from './combat/break.js';
import { createResonance } from './combat/resonance.js';

/** Codex list: unique ids, the old 19 first in the same order (CONTRACT §8.2). */
export const REACTIONS = REACTION_IDS.map((id) => {
  const r = reactionDef(id);
  return { id, name: r.nameKo, desc: r.desc, elements: r.elements, fusion: !!r.fusion, family: r.family, p: r.p };
});
export { REACTION_DEFS, STATUS_DEFS };

/** Team filter for player attacks: everything that isn't on the player's team (enemies and props). */
export const FOES = '!player';

export function createCombat(game) {
  const discovered = new Set();
  const tv = Array.from({ length: 8 }, () => new THREE.Vector3());
  const sfx = (name, opts) => { try { game.audio?.play?.(name, opts); } catch (_) { /* */ } };
  const allies = [];

  function center(e, out = new THREE.Vector3()) {
    if (e.getCenter) { try { const r = e.getCenter(out); if (r) return r; } catch (_) { /* */ } }
    return out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5);
  }

  // ---------------- registry ----------------
  function register(e) {
    if (!e) return;
    if (!e.statuses) e.statuses = {};
    if (!e.velocity) e.velocity = new THREE.Vector3();
    if (e.alive === undefined) e.alive = true;
    if (!game.entities.includes(e)) game.entities.push(e);
  }
  function unregister(e) {
    const i = game.entities.indexOf(e);
    if (i >= 0) game.entities.splice(i, 1);
    statusFx.release(e);
    const a = allies.indexOf(e); if (a >= 0) allies.splice(a, 1);
  }
  function registerAlly(e) { if (!e) return; e.team = 'player'; e.isAlly = true; register(e); if (!allies.includes(e)) allies.push(e); }
  function unregisterAlly(e) { unregister(e); }

  // ---------------- queries ----------------
  const teamOk = (e, team) => !team || (team === FOES ? e.team !== 'player' : team.charCodeAt(0) === 33 ? e.team !== team.slice(1) : e.team === team);
  function queryRadius(point, r, team, out) {
    const res = out || [];
    if (out) out.length = 0;
    const neg = !!team && team.charCodeAt(0) === 33, tn = neg ? (team === FOES ? 'player' : team.slice(1)) : team;
    const ents = game.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || !e.object || (team && (neg ? e.team === tn : e.team !== tn))) continue;
      const p = e.object.position;
      const dx = p.x - point.x, dz = p.z - point.z;
      const rr = r + (e.radius || 0.5);
      if (dx * dx + dz * dz > rr * rr) continue;
      if (point.y < p.y - r - 0.3 || point.y > p.y + (e.height || 1.6) + r) continue;
      res.push(e);
    }
    return res;
  }
  function raycastEntities(origin, dir, maxDist = 100, team) {
    let best = null, bestT = maxDist;
    const dl = Math.hypot(dir.x, dir.z);
    for (const e of game.entities) {
      if (!e.alive || !e.object || !teamOk(e, team)) continue;
      const p = e.object.position, R = e.radius || 0.5, H = e.height || 1.6;
      let tHit = -1;
      if (dl > 1e-5) {
        const ox = origin.x - p.x, oz = origin.z - p.z;
        const a = dir.x * dir.x + dir.z * dir.z, b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - R * R;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        const t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
        if (t1 < 0) continue;
        const ts = Math.max(0, t0);
        const y0 = origin.y + dir.y * ts, y1 = origin.y + dir.y * t1;
        if (y0 >= p.y && y0 <= p.y + H) tHit = ts;
        else if ((y0 < p.y && y1 >= p.y) || (y0 > p.y + H && y1 <= p.y + H)) {
          const yy = y0 < p.y ? p.y : p.y + H; tHit = (yy - origin.y) / (dir.y || 1e-6);
          if (tHit < ts || tHit > t1) tHit = -1;
        }
      } else {
        const dx = origin.x - p.x, dz = origin.z - p.z;
        if (dx * dx + dz * dz > R * R) continue;
        const yy = dir.y < 0 ? p.y + H : p.y; tHit = (yy - origin.y) / dir.y;
      }
      if (tHit >= 0 && tHit < bestT) { bestT = tHit; best = e; }
    }
    if (!best) return null;
    return { entity: best, point: new THREE.Vector3().copy(origin).addScaledVector(dir, bestT), dist: bestT };
  }

  // ---------------- assemble ----------------
  const C = {
    discovered, getCenter: center, queryRadius, sfx,
    _tv: (i) => tv[i & 7],
  };
  const st = createStatuses(game, C);
  C.st = st;
  C.applyStatus = st.applyStatus; C.removeStatus = st.removeStatus; C.clearStatus = st.clearStatus; C.addSleep = st.addSleep;
  const breakFx = createBreak(game, C);
  C.breakFx = breakFx;
  C.addBreak = breakFx.addBreak; C.drainShield = breakFx.drainShield; C.forceBreak = breakFx.forceBreak;
  const resonance = createResonance(game, C);
  C.resonanceTrack = (t, id) => resonance.track(t, id);
  C.forceResonance = (t) => resonance.force(t);
  const pipe = createPipeline(game, C);
  C.dealDamage = pipe.dealDamage; C.healPlayer = pipe.healPlayer;
  const rx = createReactions(game, C);
  C.rx = rx;
  C.discover = rx.discover;
  C._onStatusEnd = (t, name, s) => {
    // 명빙: a cracked target drops a soul orb when its freeze ends
    if (name === 'frozen' && t.statuses?.cracked) dropSoul(t);
    void s;
  };
  function dropSoul(t) {
    const p = center(t, tv[5]);
    try { if (game.spells?.api?.objects?.spawn?.('soul', p.clone(), { life: 10 })) return; } catch (_) { /* */ }
    pipe.healPlayer((game.player?.maxHp || 100) * 0.05, 'soul');
  }
  const statusFx = createStatusFX(game);

  // ---------------- per-frame ----------------
  function update(dt, realDt) {
    st.update(dt);
    rx.update(dt);
    breakFx.update(dt);
    pipe.update(dt);
    statusFx.update(dt, realDt);
  }

  return {
    REACTIONS, REACTION_DEFS, STATUS_DEFS, FAMILIES, BREAK_RULES, BY_TRIGGER, BY_OBJECT, P0_IDS, P1_IDS, REACTION_IDS, discovered,
    register, unregister, registerAlly, unregisterAlly, allies,
    dealDamage: pipe.dealDamage, healPlayer: pipe.healPlayer,
    applyStatus: st.applyStatus, hasStatus: st.hasStatus, clearStatus: st.clearStatus, stacksOf: st.stacksOf,
    canAct: st.canAct, canMove: st.canMove, speedMul: st.speedMul, isAura: st.isAura,
    statusInfo: (id) => STATUS_DEFS[id] || null,
    queryRadius, raycastEntities, getCenter: center, discover: rx.discover,
    previewReaction: rx.previewReaction, reactObject: rx.reactObject, debugReact: rx.debugReact,
    registerObject: rx.registerObject, unregisterObject: rx.unregisterObject,
    addBreak: (t, n) => breakFx.addBreak(t, n), isBroken: breakFx.isBroken, drainShield: breakFx.drainShield,
    resonance, FOES, isPlayerSource: pipe.isPlayerSource,
    /** True for entities the player's attacks may hit (enemies and props such as fire barrels). */
    isFoe: (e) => !!e && e.team !== 'player',
    /** Debug: the factors of the last dealDamage formula (tests). */
    lastFormula: pipe.lastFormula,
    _debug: { rx, st, breakFx, pipe },
    _warm: (g) => statusFx.warm(g),
    prewarm() { const g = new THREE.Group(); statusFx.warm(g); g.visible = true; return g; },
    update,
    init() {
      // parry (blocked{parried}) adds +15 break to the parried attacker
      game.events.on('blocked', (p) => { if (p?.parried && p.source && typeof p.source === 'object') breakFx.onParry(p.source); });
      game.events.on('stateChange', ({ state } = {}) => { if (state === 'title') { rx.reset(); breakFx.reset(); resonance.reset(); } });
    },
  };
}
