// Combat: entity registry, damage, statuses, elemental reactions, status visuals.
import * as THREE from 'three';
import { ELEMENT_COLORS, ELEMENT_NAMES_KO, clamp } from './core/utils.js';
import { createStatusFX } from './combat/statusfx.js';

export const REACTIONS = [
  { id: 'melt', name: '융해', desc: '냉기·빙결 상태의 적에게 화염 — 2배 피해와 증기 폭발, 적을 젖게 함', elements: ['fire', 'ice'] },
  { id: 'shatter', name: '파쇄', desc: '빙결된 적에게 대지/강한 일격 — 3배 피해로 얼음을 산산조각', elements: ['earth', 'ice'] },
  { id: 'electrocute', name: '감전', desc: '젖은 적에게 번개 — 1.5배 피해, 기절, 주변의 젖은 적에게 전이', elements: ['lightning', 'water'] },
  { id: 'superconduct', name: '초전도', desc: '냉기 상태의 적에게 번개 — 서리 번개 폭발, 받는 피해 30% 증가', elements: ['lightning', 'ice'] },
  { id: 'overload', name: '과부하', desc: '화염과 번개의 충돌 — 거대한 폭발과 강한 넉백', elements: ['lightning', 'fire'] },
  { id: 'swirl', name: '확산', desc: '바람이 원소 상태를 휘감아 주변 적에게 퍼뜨림', elements: ['wind', 'fire'] },
  { id: 'magma', name: '용암 분출', desc: '불타는 적에게 대지 — 용암이 솟구쳐 불타는 용암 지대 생성', elements: ['earth', 'fire'] },
  { id: 'flashfreeze', name: '순간 빙결', desc: '젖은 적에게 냉기 — 즉시 얼어붙음', elements: ['ice', 'water'] },
  { id: 'evaporate', name: '증발', desc: '젖은 적에게 화염 — 물이 증발하며 1.3배 피해', elements: ['fire', 'water'] },
  { id: 'skyslam', name: '공중 강타', desc: '공중에 뜬 적에게 대지 — 땅으로 내리꽂는 1.8배 피해', elements: ['earth', 'wind'] },
  { id: 'updraft', name: '폭풍 질주', desc: '공중에 뜬 적에게 바람 — 더 높이 띄워 올림', elements: ['wind', 'wind'] },
  // spell / zone fusions (emitted as zoneCombo by spells)
  { id: 'fire_tornado', name: '화염 회오리', desc: '회오리에 화염을 더하면 불타는 회오리로 변신', elements: ['wind', 'fire'], fusion: true },
  { id: 'blizzard', name: '눈보라', desc: '회오리에 냉기를 더하면 모든 것을 얼리는 눈보라', elements: ['wind', 'ice'], fusion: true },
  { id: 'storm_tornado', name: '뇌전 회오리', desc: '회오리에 번개를 더하면 번개를 뿜는 폭풍', elements: ['wind', 'lightning'], fusion: true },
  { id: 'steam_burst', name: '증기 폭발', desc: '얼음 지대에 화염 — 증기 폭발 후 물웅덩이가 됨', elements: ['fire', 'ice'], fusion: true },
  { id: 'electro_water', name: '전기 수면', desc: '물웅덩이·비구름에 번개 — 물 속의 모든 적을 감전', elements: ['lightning', 'water'], fusion: true },
  { id: 'freeze_water', name: '수면 빙결', desc: '물웅덩이에 냉기 — 얼음 지대로 얼려 안의 적을 빙결', elements: ['ice', 'water'], fusion: true },
  { id: 'fire_wave', name: '화염 파도', desc: '바람 마법이 화염 지대를 지나면 불길이 앞으로 번짐', elements: ['wind', 'fire'], fusion: true },
  { id: 'infusion', name: '원소 부여', desc: '투사체가 원소 지대를 통과하면 그 원소를 머금음', elements: ['fire', 'earth'], fusion: true },
];
const RX = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));

/** Team filter for player attacks: everything that isn't on the player's team (enemies and props). */
export const FOES = '!player';
const EMPTY = [];
const FIRE = 'fire', ICE = 'ice', LIGHT = 'lightning', WIND = 'wind', EARTH = 'earth';

export function createCombat(game) {
  const discovered = new Set();
  const statusFx = createStatusFX(game);
  const UP = new THREE.Vector3(0, 1, 0);
  const tv = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
  let pendingShake = 0, lastHsAt = -9, lastHsAmt = 0;
  const vfxCall = (fn, ...a) => { try { return game.vfx?.[fn]?.(...a); } catch (e) { return null; } };
  const sfx = (name, opts) => { try { game.audio?.play?.(name, opts); } catch (_) { /* */ } };

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
  }

  // ---------------- statuses ----------------
  function applyStatus(t, name, seconds = 3, extra) {
    if (!t || !t.alive || !t.statuses) return;
    const s = t.statuses;
    if (t.isBoss && (name === 'frozen' || name === 'stunned')) seconds *= 0.4; // bosses resist control
    const now = game.time;
    // diminishing returns: brief immunity after a stun / freeze ends, and freezes can't be extended forever
    if (name === 'stunned' && !s.stunned && (t._stunImmuneUntil || 0) > now) return;
    // total-duration caps for chained control (re-applications can't extend past these)
    if (name === 'stunned' && s.stunned) { seconds = Math.min(seconds, (t.isBoss ? 0.8 : 2) - s.stunned.age); if (seconds <= s.stunned.time) return; }
    if (name === 'frozen') {
      if (!s.frozen && (t._freezeImmuneUntil || 0) > now) return;
      if (s.frozen) { seconds = Math.min(seconds, (t.isBoss ? 1.2 : 3.5) - s.frozen.age); if (seconds <= s.frozen.time) return; }
    }
    if (name === 'burning') { if (s.wet) { delete s.wet; return; } if (s.frozen) return; delete s.chilled; }
    if (name === 'wet' && s.burning) { delete s.burning; }
    if (name === 'chilled') {
      if (s.frozen) return;
      if (s.chilled) {
        s.chilled.stacks = (s.chilled.stacks || 1) + 1;
        s.chilled.time = Math.max(s.chilled.time, seconds);
        if (s.chilled.stacks >= 6 && !t.isBoss && t.team !== 'player') { s.chilled.stacks = 0; applyStatus(t, 'frozen', 2.5); }
        return;
      }
    }
    if (name === 'frozen') { delete s.burning; t.velocity?.multiplyScalar(0.1); }
    const had = !!s[name];
    const cur = s[name] || (s[name] = { time: 0, dur: 0, age: 0, stacks: 1, tick: 0.5 });
    cur.time = Math.max(cur.time, seconds); cur.dur = Math.max(cur.dur, seconds);
    if (extra) Object.assign(cur, extra);
    if (!had) {
      cur.age = 0;
      if (name === 'shocked') { cur.tick = 0.9; cur.stunT = 0; }
      if (name === 'burning') { cur.tick = 0.5; cur.spreadT = 0.6; }
      game.events.emit('statusApplied', { target: t, status: name });
    }
  }
  function hasStatus(t, name) { return !!t?.statuses?.[name]; }
  function clearStatus(t, name) { if (t?.statuses) { if (name) delete t.statuses[name]; else for (const k in t.statuses) delete t.statuses[k]; } }
  function canAct(e) {
    const s = e?.statuses; if (!s) return true;
    if (s.frozen || s.stunned) return false;
    if (s.shocked && s.shocked.stunT > 0) return false;
    return true;
  }
  function speedMul(e) {
    const s = e?.statuses; if (!s) return 1;
    if (s.frozen || s.stunned) return 0;
    let m = 1;
    if (s.chilled) m *= 0.6;
    if (s.wet) m *= 0.92;
    return m;
  }

  // ---------------- queries ----------------
  // team filter: undefined = all, 'enemy' = exact team, '!player' = every team except 'player' (enemies + props)
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
        // 2D ray-circle in XZ
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

  // ---------------- reactions ----------------
  function discover(id) {
    if (!discovered.has(id)) { discovered.add(id); game.events.emit('reactionDiscovered', { id }); }
  }
  function emitReaction(id, point, target, elements, nameOverride) {
    if (target && target.team === 'player') return;
    discover(id);
    const name = nameOverride || RX[id]?.name || id;
    game.events.emit('reaction', { id, name, point: point.clone(), target, elements });
    sfx('reaction', { position: point });
  }
  function aoe(point, r, team, except, hitFn) {
    const list = queryRadius(point, r, team);
    for (const e of list) if (e !== except) hitFn(e);
  }

  // per-target reaction cooldowns (game time) so one status can't be farmed every hit
  const onCd = (t, id) => (t._rxT && t._rxT[id] > game.time);
  const setCd = (t, id, sec) => { (t._rxT || (t._rxT = {}))[id] = game.time + sec; };

  /** Detect + execute reaction. Returns {id, mult, skipStatus} or null. */
  function react(t, el, hit, point) {
    const s = t.statuses;
    const team = t.team;
    const heavyHit = el === EARTH || (hit.heavy && (el === 'physical' || el === WIND));
    const amount = hit.amount || 0;
    const src = hit.source;
    // ---- fire ----
    if (el === FIRE) {
      if (s.frozen || s.chilled) {
        delete s.frozen; delete s.chilled;
        applyStatus(t, 'wet', 5);
        vfxCall('burst', point, { count: 40, color: [0xffffff, 0xdfe8f0], shape: 'smoke', speed: 5, spread: 1, size: 0.9, sizeEnd: 2.4, life: 1.3, lifeVar: 0.4, drag: 2.5, gravity: 1.5, additive: false });
        vfxCall('burst', point, { count: 26, color: [0xff9a3c, 0xffffff], shape: 'spark', speed: 9, spread: 1, size: 0.12, life: 0.5, drag: 2 });
        vfxCall('shockwave', point, { color: 0xffe0c0, radius: 3.5, duration: 0.45, thickness: 0.6 });
        vfxCall('flash', point, { color: 0xffc080, intensity: 6, distance: 10, duration: 0.3 });
        sfx('steam', { position: point });
        emitReaction('melt', point, t, [FIRE, ICE]);
        return { id: 'melt', mult: 2, skipStatus: true };
      }
      if (s.shocked) return overload(t, point, hit, [FIRE, LIGHT]);
      if (s.wet) {
        delete s.wet;
        vfxCall('burst', point, { count: 24, color: [0xffffff, 0xd8e4ee], shape: 'smoke', speed: 3.5, spread: 1, size: 0.6, sizeEnd: 1.8, life: 1.0, drag: 2, gravity: 2, additive: false });
        sfx('steam', { position: point });
        emitReaction('evaporate', point, t, [FIRE, 'water']);
        return { id: 'evaporate', mult: 1.3, skipStatus: true };
      }
      if (s.stunned && s.stunned.earth && !onCd(t, 'magma')) return magma(t, point, hit);
    }
    // ---- earth / heavy ----
    if (heavyHit && s.frozen) {
      delete s.frozen; delete s.chilled;
      vfxCall('debris', point, { count: 26, material: 'ice', color: 0xc8f6ff, size: 0.35 * Math.max(1, t.radius || 0.5), speed: 11, life: 1.6 });
      vfxCall('burst', point, { count: 40, color: [0xffffff, 0x7fe3ff], shape: 'shard', speed: 12, spread: 1, size: 0.22, life: 0.7, gravity: -10, drag: 1 });
      vfxCall('shockwave', point, { color: 0xbff4ff, radius: 4, duration: 0.4, thickness: 0.5 });
      vfxCall('flash', point, { color: 0xbff4ff, intensity: 5, distance: 9, duration: 0.25 });
      vfxCall('screenFlash', 0xdff8ff, 0.18, 0.18);
      sfx('shatter', { position: point });
      emitReaction('shatter', point, t, [EARTH, ICE]);
      return { id: 'shatter', mult: 3, skipStatus: true };
    }
    if (el === EARTH) {
      if (s.burning && !onCd(t, 'magma')) return magma(t, point, hit);
      if (s.airborne) {
        delete s.airborne;
        t.velocity.y = -32;
        const gp = tv[6].copy(t.object.position);
        try { gp.y = game.world.getHeight(gp.x, gp.z); } catch (_) { /* */ }
        vfxCall('shockwave', gp, { color: ELEMENT_COLORS.earth, radius: 5, duration: 0.5, thickness: 0.8 });
        vfxCall('debris', gp, { count: 16, material: 'rock', color: 0xb08a5e, size: 0.3, speed: 8 });
        vfxCall('burst', gp, { count: 30, color: [0xd9b98a, 0xa88a68], shape: 'smoke', speed: 6, spread: 0.6, dir: UP, size: 0.7, sizeEnd: 1.6, life: 0.9, drag: 3, additive: false });
        aoe(gp, 3.5, team, t, (e) => dealDamage(e, { amount: amount * 0.6, element: EARTH, source: src, point: center(e, tv[7]).clone(), launch: 5, noReaction: true, tags: ['reaction'] }));
        emitReaction('skyslam', point, t, [EARTH, WIND]);
        return { id: 'skyslam', mult: 1.8, slam: true };
      }
    }
    // ---- lightning ----
    if (el === LIGHT) {
      if (s.wet && !onCd(t, 'electrocute')) {
        delete s.wet;
        setCd(t, 'electrocute', 1.0);
        applyStatus(t, 'stunned', 1.5);
        vfxCall('burst', point, { count: 30, color: [0xffffff, ELEMENT_COLORS.lightning], shape: 'spark', speed: 10, spread: 1, size: 0.1, life: 0.4, drag: 2 });
        vfxCall('flash', point, { color: 0xc9a4ff, intensity: 6, distance: 12, duration: 0.25 });
        const isFusion = hit.tags && hit.tags.includes('fusion');
        const others = isFusion ? [] : queryRadius(point, 9, team).filter((e) => e !== t && e.statuses?.wet && !onCd(e, 'electrocute'));
        let prev = point;
        for (const e of others) {
          const c = center(e).clone();
          vfxCall('beam', prev, c, { color: ELEMENT_COLORS.lightning, width: 0.18, duration: 0.35, jagged: 0.6, segments: 12, branches: 2 });
          delete e.statuses.wet; setCd(e, 'electrocute', 1.0);
          applyStatus(e, 'stunned', 1.5);
          dealDamage(e, { amount: amount * 0.5 + 5, element: LIGHT, source: src, point: c, noReaction: true, status: { shocked: 3 }, tags: ['reaction'] });
          prev = c;
        }
        emitReaction('electrocute', point, t, [LIGHT, 'water']);
        return { id: 'electrocute', mult: 1.5 };
      }
      if (s.chilled && !s.frozen) {
        delete s.chilled;
        vfxCall('shockwave', point, { color: 0xb9e6ff, radius: 5, duration: 0.5, thickness: 0.7 });
        vfxCall('burst', point, { count: 40, color: [0x9feaff, 0xc9a4ff], shape: 'spark', speed: 12, spread: 1, size: 0.12, life: 0.45, drag: 2 });
        vfxCall('burst', point, { count: 24, color: [0xffffff, 0x9feaff], shape: 'snow', speed: 6, spread: 1, size: 0.18, life: 1, gravity: -2, drag: 2 });
        vfxCall('flash', point, { color: 0xa8d8ff, intensity: 6, distance: 12, duration: 0.3 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          tv[5].set(point.x + Math.cos(a) * 4.5, point.y + (Math.random() - 0.3), point.z + Math.sin(a) * 4.5);
          vfxCall('beam', point, tv[5], { color: 0xb9e6ff, width: 0.1, duration: 0.25, jagged: 0.5, segments: 8 });
        }
        aoe(point, 5, team, t, (e) => {
          applyStatus(e, 'exposed', 6);
          dealDamage(e, { amount: 22, element: ICE, source: src, point: center(e).clone(), noReaction: true, status: { chilled: 2 }, tags: ['reaction'] });
        });
        emitReaction('superconduct', point, t, [LIGHT, ICE]);
        return { id: 'superconduct', mult: 1.25, status: { exposed: 6 } };
      }
      if (s.burning) return overload(t, point, hit, [LIGHT, FIRE]);
    }
    // ---- wind ----
    if (el === WIND) {
      const st = s.burning ? 'burning' : s.shocked ? 'shocked' : s.chilled ? 'chilled' : s.wet ? 'wet' : null;
      if (st && !onCd(t, 'swirl')) {
        delete s[st];
        setCd(t, 'swirl', 1.0);
        const sel = st === 'burning' ? FIRE : st === 'shocked' ? LIGHT : st === 'chilled' ? ICE : 'water';
        const col = sel === 'water' ? 0x5fb0ff : ELEMENT_COLORS[sel];
        const dmgEl = sel === 'water' ? WIND : sel;
        vfxCall('shockwave', point, { color: col, radius: 7, duration: 0.55, thickness: 0.9 });
        vfxCall('burst', point, { count: 50, color: [col, 0xffffff], shape: 'leaf', speed: 11, spread: 1, size: 0.18, life: 0.8, drag: 2.5 });
        vfxCall('burst', point, { count: 30, color: [col, ELEMENT_COLORS.wind], shape: 'ring', speed: 2, spread: 1, size: 0.6, sizeEnd: 2.2, life: 0.6 });
        aoe(point, 7, team, t, (e) => {
          const c = center(e).clone();
          vfxCall('beam', point, c, { color: col, width: 0.08, duration: 0.3, jagged: 0.15, segments: 6 });
          dealDamage(e, { amount: amount * 0.5 + 4, element: dmgEl, source: src, point: c, noReaction: true, status: { [st]: 3 }, tags: ['reaction'] });
        });
        const nm = (sel === 'water' ? '물' : ELEMENT_NAMES_KO[sel]) + ' 확산';
        emitReaction('swirl', point, t, [WIND, sel], nm);
        return { id: 'swirl', mult: 1.2 };
      }
      let gy = t.object.position.y;
      try { gy = game.world.getHeight(t.object.position.x, t.object.position.z); } catch (_) { /* */ }
      if (s.airborne && !s.airborne.updrafted && t.object.position.y - gy < 6) {
        s.airborne.updrafted = true;
        t.velocity.y = Math.min(Math.max(t.velocity.y, 0) + 9, 12);
        s.airborne.time = 3;
        vfxCall('burst', point, { count: 30, color: [0xffffff, ELEMENT_COLORS.wind], shape: 'leaf', speed: 8, dir: UP, spread: 0.5, size: 0.16, life: 0.8, drag: 2 });
        vfxCall('shockwave', point, { color: ELEMENT_COLORS.wind, radius: 3, duration: 0.35, thickness: 0.4, vertical: true });
        emitReaction('updraft', point, t, [WIND, WIND]);
        return { id: 'updraft', mult: 1.3, noLaunch: true };
      }
    }
    // ---- ice ----
    if (el === ICE && s.wet) {
      delete s.wet;
      applyStatus(t, 'frozen', 3);
      vfxCall('burst', point, { count: 36, color: [0xffffff, 0x7fe3ff], shape: 'shard', speed: 7, spread: 1, size: 0.16, life: 0.6, drag: 2 });
      vfxCall('shockwave', point, { color: 0x9feaff, radius: 3, duration: 0.4, thickness: 0.5 });
      vfxCall('flash', point, { color: 0x9feaff, intensity: 4, distance: 8, duration: 0.25 });
      emitReaction('flashfreeze', point, t, [ICE, 'water']);
      return { id: 'flashfreeze', mult: 1.2, skipStatus: true };
    }
    if (el === ICE && s.burning) {
      delete s.burning; applyStatus(t, 'wet', 4);
      vfxCall('burst', point, { count: 30, color: [0xffffff, 0xdfe8f0], shape: 'smoke', speed: 4, spread: 1, size: 0.8, sizeEnd: 2, life: 1.1, drag: 2.5, gravity: 1.5, additive: false });
      sfx('steam', { position: point });
      emitReaction('melt', point, t, [ICE, FIRE]);
      return { id: 'melt', mult: 1.6, skipStatus: true };
    }
    return null;
  }

  function overload(t, point, hit, elements) {
    const s = t.statuses; delete s.burning; delete s.shocked;
    vfxCall('explosion', point, { element: 'fire', scale: 1.4 });
    vfxCall('burst', point, { count: 50, color: [0xff7a2a, 0xc9a4ff], shape: 'spark', speed: 16, spread: 1, size: 0.14, life: 0.55, drag: 1.5 });
    vfxCall('shockwave', point, { color: 0xff8aff, radius: 5.5, duration: 0.45, thickness: 1 });
    vfxCall('flash', point, { color: 0xff9a60, intensity: 9, distance: 16, duration: 0.35 });
    vfxCall('screenFlash', 0xffc8a0, 0.22, 0.2);
    sfx('explode_fire', { position: point });
    aoe(point, 5, t.team, t, (e) => {
      const c = center(e).clone();
      const d = tv[4].subVectors(e.object.position, point).setY(0).normalize();
      dealDamage(e, { amount: 30, element: FIRE, source: hit.source, point: c, direction: d.clone(), knockback: 14, launch: 6, noReaction: true, tags: ['reaction'] });
    });
    emitReaction('overload', point, t, elements);
    return { id: 'overload', mult: 1.6, knock: 14, launch: 6 };
  }
  function magma(t, point, hit) {
    const s = t.statuses; delete s.burning; if (s.stunned) delete s.stunned.earth;
    setCd(t, 'magma', 1.5);
    const gp = tv[3].copy(t.object.position);
    try { gp.y = game.world.getHeight(gp.x, gp.z); } catch (_) { /* */ }
    try { game.spells?.spawnZone?.('lava', gp, { radius: 3.5, duration: 6 }); } catch (_) { /* */ }
    vfxCall('explosion', gp, { element: 'fire', scale: 1.2 });
    vfxCall('debris', gp, { count: 20, material: 'rock', color: 0x5a2a18, size: 0.32, speed: 12 });
    vfxCall('burst', gp, { count: 50, color: [0xffd060, 0xff3a00], shape: 'ember', speed: 14, dir: UP, spread: 0.35, size: 0.2, life: 1.1, gravity: -16 });
    vfxCall('flash', gp, { color: 0xff6020, intensity: 8, distance: 14, duration: 0.4 });
    sfx('explode_earth', { position: point });
    aoe(gp, 4, t.team, t, (e) => dealDamage(e, { amount: 18, element: FIRE, source: hit.source, point: center(e).clone(), launch: 7, status: { burning: 4 }, noReaction: true, tags: ['reaction'] }));
    emitReaction('magma', point, t, [EARTH, FIRE]);
    return { id: 'magma', mult: 1.3, launch: 8 };
  }

  // ---------------- damage ----------------
  const NONE = { damage: 0, reaction: null, crit: false, killed: false };
  const prog = () => game.progression;
  /** True when the hit was dealt by the player (spells, sword, player-triggered props). */
  const isPlayerSource = (hit) => hit.source === 'player' || hit.source?.team === 'player';
  function dealDamage(t, hit = {}) {
    if (!t || !t.alive || t.invulnerable) return NONE;
    if (!t.statuses) t.statuses = {};
    if (!t.velocity) t.velocity = new THREE.Vector3();
    const el = hit.element || 'physical';
    const tags = hit.tags || EMPTY;
    const isDot = tags.includes('dot');
    const isTick = isDot || tags.includes('zone') || tags.includes('tick');
    const isMelee = tags.includes('melee');
    const fromPlayer = isPlayerSource(hit);
    const isProp = !!t.isProp;

    // ---- block hook (player barrier / guard / dodge, or any entity that blocks) ----
    let blockMul = 1;
    if (t.onBeforeDamage) {
      let r = null;
      try { r = t.onBeforeDamage(hit); } catch (err) { console.error('[combat] onBeforeDamage', err); }
      if (r) {
        const bp = hit.point || center(t, tv[0]);
        if (r.parried && hit.source && typeof hit.source === 'object') { try { hit.source.onParried?.(t); } catch (err) { console.error('[combat] onParried', err); } }
        if (r.reflect && hit.projectile?.reflect) { try { hit.projectile.reflect(t); } catch (err) { console.error('[combat] reflect', err); } }
        if (r.cancel) {
          game.events.emit('blocked', { target: t, parried: !!r.parried, perfect: !!r.perfect, dodged: !!r.dodged, point: bp.clone ? bp.clone() : bp, source: hit.source });
          return { damage: 0, reaction: null, crit: false, killed: false, blocked: true, parried: !!r.parried };
        }
        if (r.mul != null) {
          blockMul = Math.max(0, r.mul);
          game.events.emit('blocked', { target: t, parried: false, perfect: false, point: bp.clone ? bp.clone() : bp, source: hit.source, mul: blockMul });
        }
      }
    }

    const point = hit.point ? new THREE.Vector3().copy(hit.point) : center(t, new THREE.Vector3());
    let mult = blockMul, rx = null;
    // enemy attacks don't trigger elemental reactions on the player (statuses still apply); props never react
    if (!hit.noReaction && !isDot && t.team !== 'player' && !isProp) {
      try { rx = react(t, el, hit, point.clone()); } catch (err) { console.error('[combat] reaction', err); }
      if (rx) mult *= rx.mult;
    }
    if (!t.alive) return NONE; // could have died from chain
    mult *= (t.resist && t.resist[el] != null) ? t.resist[el] : 1;
    if (t.statuses.exposed) mult *= 1.3;
    const vsFoe = fromPlayer && t.team !== 'player';
    if (vsFoe) { try { mult *= prog()?.damageMul?.(el) ?? 1; } catch (_) { /* */ } }
    let crit = false;
    if (vsFoe && !isProp && (hit.crit || (!isTick && !hit.noCrit && Math.random() < 0.1))) { crit = true; mult *= 1.5; }
    let dmg = Math.max(0, Math.round((hit.amount || 0) * mult));
    if (dmg <= 0 && !rx) return NONE;
    dmg = Math.max(1, dmg);

    // hp
    let killed = false;
    if (t.isDummy) {
      t.hp = Math.max(1, t.hp - dmg);
      t._dummyRefill = 3;
    } else {
      t.hp -= dmg;
      if (t.hp <= 0) { t.hp = 0; killed = true; }
    }

    // awakening gauge (master path): player damage on real foes; finishers don't refill it
    if (vsFoe && !isProp && !tags.includes('finisher')) {
      try { prog()?.addAwakening?.(dmg * 0.12 + (rx ? 4 : 0)); } catch (_) { /* */ }
    }

    // statuses from hit
    if (!killed) {
      if (hit.status && !(rx && rx.skipStatus)) for (const k in hit.status) applyStatus(t, k, hit.status[k]);
      if (rx?.status) for (const k in rx.status) applyStatus(t, k, rx.status[k]);
    }

    // knockback
    const mass = t.mass || 1;
    let kb = (hit.knockback || 0) * (blockMul < 1 ? 0.35 : 1), launch = rx?.noLaunch ? 0 : (hit.launch || 0) * (blockMul < 1 ? 0 : 1);
    if (rx?.knock) kb = Math.max(kb, rx.knock);
    if (rx?.launch) launch = Math.max(launch, rx.launch);
    if (t.statuses.frozen) { kb *= 0.2; launch *= 0.2; }
    if ((kb > 0 || launch > 0) && !rx?.slam) {
      const d = tv[1];
      if (hit.direction) d.copy(hit.direction).setY(0);
      else d.subVectors(t.object.position, point).setY(0);
      if (d.lengthSq() < 1e-6) d.set(0, 0, 0); else d.normalize();
      // Light enemies (mass < 1) still fly further, but capped so follow-up combos stay reachable.
      const kbMass = Math.max(mass, 1);
      t.velocity.addScaledVector(d, kb / kbMass);
      const hv = Math.hypot(t.velocity.x, t.velocity.z);
      if (hv > 12) { t.velocity.x *= 12 / hv; t.velocity.z *= 12 / hv; }
      if (launch > 0) {
        t.velocity.y = Math.min(Math.max(t.velocity.y, 0) + launch / kbMass, 14);
        t.grounded = false;
        if (launch / mass > 4) applyStatus(t, 'airborne', 3);
      }
    }

    // feedback (타격감): every real hit freezes the frame; heavier hits freeze longer
    if (!isTick || rx || killed) {
      const isUlt = tags.includes('ultimate') || tags.includes('finisher');
      const sc = clamp(dmg / 35, 0.4, 2.2);
      if (!hit.noImpactFx) vfxCall('impact', point, { element: el === 'physical' ? 'physical' : el, scale: sc });
      vfxCall('flashEntity', t, crit ? 0xfff2a0 : 0xffffff, 0.12);
      let hs;
      if (hit.hitstop != null) hs = hit.hitstop;
      else {
        hs = dmg >= 45 || hit.heavy ? 0.1 : 0.055;
        if (crit) hs += 0.02;
        if (rx) hs = Math.max(hs, 0.11);
        if (killed) hs = Math.max(hs, 0.1);
        if (isUlt || (t.isBoss && (killed || dmg >= 80))) hs = Math.max(hs, 0.15);
        if (tags.includes('reaction') && !killed) hs = Math.min(hs, 0.06);
        if (isTick) hs = killed ? 0.07 : (rx ? 0.05 : 0);
        if (isProp) hs = Math.min(hs, 0.05);
        if (t.team === 'player') hs = Math.min(Math.max(hs, 0.06), 0.1);
      }
      if (hs > 0) {
        const rt = game.realTime || 0;
        // melee hits always freeze (each slash must land); spell volleys are rate-limited so they punctuate, not stutter
        if (isMelee || killed || rt - lastHsAt > 0.12 || hs > lastHsAmt + 0.02) {
          game.hitstop(hs); lastHsAt = rt; lastHsAmt = hs;
        }
      }
      let sh;
      if (hit.shake != null) sh = hit.shake;
      else {
        sh = clamp(dmg / 120, 0.08, 0.5) + (rx ? 0.15 : 0) + (killed ? 0.1 : 0) + (crit ? 0.05 : 0);
        if (t.team === 'player') sh = Math.max(sh, 0.25);
        if (!isUlt) sh = Math.min(sh, 0.5);
        if (isTick) sh = Math.min(sh, 0.12);
        if (isProp) sh = Math.min(sh, 0.15);
      }
      pendingShake = Math.max(pendingShake, sh);
      if (fromPlayer && !isTick && !isMelee && dmg < 45 && game.camera) {
        const kd = tv[0].subVectors(point, game.camera.position);
        if (kd.lengthSq() > 1e-4) vfxCall('kick', kd.normalize(), 0.06);
      }
      if (t.team !== 'player' && !isProp) sfx(killed ? 'enemy_death' : 'enemy_hurt', { position: point, volume: isTick ? 0.35 : 0.6 });
    } else {
      vfxCall('flashEntity', t, 0xffa060, 0.08);
    }

    const result = { damage: dmg, reaction: rx?.id || null, crit, killed, blocked: blockMul < 1 };
    const isPlayer = t.team === 'player';
    game.events.emit('damage', { target: t, amount: dmg, element: el, point: point.clone(), crit, reaction: result.reaction, killed, isPlayer, isProp, source: hit.source, dot: isTick && !rx && !killed, melee: isMelee });
    if (isPlayer) game.events.emit('playerHurt', { amount: dmg, element: el });

    if (killed) {
      t.alive = false;
      for (const k in t.statuses) delete t.statuses[k];
      if (t.isBoss) { try { game.slowmo(0.25, 0.8); } catch (_) { /* */ } }
      try { t.onDeath?.(result, hit); } catch (err) { console.error('[combat] onDeath', err); }
      game.events.emit('kill', { target: t, source: hit.source, point: point.clone() });
    } else {
      try { t.onHit?.(result, hit); } catch (err) { console.error('[combat] onHit', err); }
    }
    return result;
  }

  // ---------------- per-frame ----------------
  const near = [];
  function update(dt, realDt) {
    const ents = game.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || !e.statuses) continue;
      if (e.isDummy && e._dummyRefill > 0) { e._dummyRefill -= dt; if (e._dummyRefill <= 0) e.hp = e.maxHp; }
      const s = e.statuses;
      for (const k in s) {
        const st = s[k];
        st.time -= dt; st.age = (st.age || 0) + dt;
        if (k === 'burning') {
          st.tick -= dt;
          if (st.tick <= 0) {
            st.tick += 0.5;
            dealDamage(e, { amount: e.isBoss ? 8 : 6, element: FIRE, source: e.team === 'player' ? 'env' : (st.source || 'player'), tags: ['dot'], noReaction: true });
            if (!e.alive) break;
          }
          st.spreadT -= dt;
          if (st.spreadT <= 0) {
            st.spreadT = 0.6;
            const c = center(e, tv[2]);
            queryRadius(c, (e.radius || 0.5) + 0.4, e.team, near);
            for (const o of near) if (o !== e && !o.statuses?.burning && !o.statuses?.wet) applyStatus(o, 'burning', 2.5);
          }
        } else if (k === 'shocked') {
          if (st.stunT > 0) st.stunT -= dt;
          st.tick -= dt;
          if (st.tick <= 0) {
            st.tick = 0.9; st.stunT = e.isBoss ? 0 : 0.22;
            dealDamage(e, { amount: 3, element: LIGHT, source: e.team === 'player' ? 'env' : 'player', tags: ['dot'], noReaction: true });
            if (!e.alive) break;
          }
        } else if (k === 'airborne') {
          if (e.grounded && st.age > 0.35) st.time = 0;
        } else if (k === 'frozen') {
          if (e.velocity) { const kd = Math.pow(0.8, dt * 60); e.velocity.x *= kd; e.velocity.z *= kd; }
        }
        if (st.time <= 0) {
          if (k === 'stunned') e._stunImmuneUntil = game.time + (e.isBoss ? 2 : 0.75);
          else if (k === 'frozen') e._freezeImmuneUntil = game.time + (e.isBoss ? 4 : 1.5);
          delete s[k];
        }
      }
    }
    if (pendingShake > 0) { vfxCall('shake', pendingShake); pendingShake = 0; }
    statusFx.update(dt, realDt);
  }

  return {
    REACTIONS, discovered,
    register, unregister, dealDamage, applyStatus, hasStatus, clearStatus, canAct, speedMul,
    queryRadius, raycastEntities, getCenter: center, discover,
    FOES, isPlayerSource,
    /** True for entities the player's attacks may hit (enemies and props such as fire barrels). */
    isFoe: (e) => !!e && e.team !== 'player',
    _warm: (g) => statusFx.warm(g),
    update,
  };
}
