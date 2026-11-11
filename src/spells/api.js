// game.spells.api (CONTRACT §11): the element-generic caster toolkit used by archetypes (spells/archetypes.js), bespoke
// forms (spells/bespoke.js), skills, combat (objects/zones) and enemies. Every helper passes UNSCALED base damage
// (combat.dealDamage applies the canonical formula, §8.3) and never calls hitFeel/hitstop/shake per hit.
// Hits that overlap pods, crystals, flowers, mines and zones are routed to combat.reactObject / the zone twists.
import * as THREE from 'three';
import { elColor, elDef, ALL_ELEMENTS } from '../core/elements.js';

const LEGACY_ZONES = new Set(['fire', 'ice', 'lava', 'water', 'storm', 'tornado']);

export function createApi(S, { zones2, objects, legacy }) {
  const { game } = S;
  const C = () => S.combat;   // shim: stamps the cast castId on every hit
  const fx = (n, ...a) => { try { return game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tv4 = new THREE.Vector3();
  const near = [], objs = [], seen = new Set();
  const relays = [];        // prism relay points registered by pillars / mirrors / beacons / light pillars: {position, alive, kind}
  const listArr = [];

  // ---------------- hit construction ----------------
  /** hitSpec: object template (cloned per target) or fn(entity, dist) → hit | null. Adds point/direction. */
  function makeHit(spec, e, from, d) {
    let h;
    if (typeof spec === 'function') { h = spec(e, d); if (!h) return null; h = Object.assign({}, h); }
    else h = Object.assign({}, spec);
    if (!h.source) h.source = game.player?.entity || 'player';
    const c = C();
    if (!h.point) h.point = c?.getCenter ? c.getCenter(e, new THREE.Vector3()) : e.object.position.clone();
    if (!h.direction) {
      h.direction = new THREE.Vector3(e.object.position.x - from.x, 0, e.object.position.z - from.z);
      if (h.direction.lengthSq() < 1e-4) h.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      h.direction.normalize();
    }
    if (h.amount != null) h.amount = Math.max(0, h.amount);
    return h;
  }
  function deal(e, h) { const c = C(); if (!c?.dealDamage || !e?.alive) return null; try { return c.dealDamage(e, h); } catch (err) { warn('deal', err); return null; } }
  const warned = new Set();
  function warn(k, err) { if (!warned.has(k)) { warned.add(k); console.warn('[spells.api]', k, err?.message || err); } }
  const specEl = (spec) => (typeof spec === 'object' && spec ? spec.element : null);
  const valid = (e, except) => e && e.alive && e !== except && !(e.team === 'player');

  // ---------------- world touch: objects + zones react to an element ----------------
  /** An element lands at point (r): pods/crystals/flowers/mines react (combat.reactObject), zones fuse. */
  function touch(point, r, el, hit) {
    if (!el || !point) return 0;
    let n = 0;
    objs.length = 0;
    objects.near('pod', point, r + 0.6, objs); objects.near('crystal', point, r + 0.6, objs); objects.near('flower', point, r + 0.6, objs); objects.near('mine', point, r + 0.4, objs);
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]; if (!o.alive) continue;
      const h = hit ? Object.assign({}, hit) : { source: game.player?.entity || 'player', element: el, amount: 0 };
      h.element = el; h.object = o; h.point = o.position.clone();
      if (objects.burst(o, el, h)) n++;
    }
    n += zones2.elementAt(point, r, el, hit) || 0;
    // legacy zones: their own fusions (zones.js), plus the combat zone reactions they do not implement
    try { legacy.elementAt(point, r, el, { source: 'skill' }); } catch (err) { warn('legacy.elementAt', err); }
    if (el === 'earth' || el === 'light' || el === 'water' || el === 'shadow') {
      for (const z of legacy.zones) {
        if (!z || !legacy.inside(z, point, r)) continue;
        if ((z.type === 'water' && (el === 'earth' || el === 'light')) || (z.type === 'lava' && el === 'water')) {
          if ((z._rxT || 0) > game.time) continue;
          adoptLegacy(z);
          try { C()?.reactObject?.(z, el, hit || { source: 'player', element: el, amount: 0 }); n++; } catch (err) { warn('reactObject', err); }
        }
      }
    }
    return n;
  }
  /** Give a v2 zone the reaction-object shape combat expects (kind/position/isZone/convert). */
  function adoptLegacy(z) {
    if (!z || z.isZone) return z;
    z.isZone = true; z.kind = z.type; z.position = z.pos;
    z.convert = (to) => {
      const i = legacy.zones.indexOf(z); if (i < 0) return null;
      if (to === 'fire' || to === 'ice' || to === 'lightning') { if (z.type === 'tornado') return z; }
      const p = z.pos.clone(), r = z.radius;
      z.time = 0;   // removed on the next update
      if (!to || to === 'none') return null;
      if (to === 'obsidian') { obsidian(p, r); return null; }
      return api.zones.spawn(to, p, { radius: r, duration: 8 });
    };
    return z;
  }
  function obsidian(p, r) {
    fx('burst', tv.copy(p).setY(p.y + 0.4), { count: 40, shape: 'smoke', color: [0xffffff, 0xdde6ee], alpha: 0.5, additive: false, speed: 2, up: 3, size: 1.2, sizeEnd: 2.8, life: 1.2 });
    try { game.world?.addPlatform?.({ id: 'obsidian', shape: 'disc', center: p.clone(), r: Math.min(4, r), top: S.height(p.x, p.z) + 0.3, life: 6 }); } catch (_) { /* */ }
    fx('groundDecal', 'crack', p.clone(), r, 6);
  }

  // ---------------- area queries ----------------
  function aoe(center, r, hitSpec, opts = {}) {
    const c = C(); if (!c?.queryRadius) return 0;
    c.queryRadius(center, r, opts.team || '!player', near);
    const list = near.slice();
    let n = 0;
    for (const e of list) {
      if (!valid(e, opts.except)) continue;
      const d = Math.hypot(e.object.position.x - center.x, e.object.position.z - center.z);
      if (d > r + (e.radius || 0.5)) continue;
      const h = makeHit(hitSpec, e, center, d); if (!h) continue;
      deal(e, h); n++;
    }
    if (opts.touch !== false) touch(center, r, opts.element || specEl(hitSpec) || null, typeof hitSpec === 'object' ? hitSpec : null);
    return n;
  }
  /** Cone from origin along dir: len (m), angle = full opening in degrees. */
  function cone(origin, dir, len, angle, hitSpec, opts = {}) {
    const c = C(); if (!c?.queryRadius) return 0;
    tv.copy(dir); tv.y = 0; if (tv.lengthSq() < 1e-6) tv.set(0, 0, 1); tv.normalize();
    const cosH = Math.cos(THREE.MathUtils.degToRad(Math.min(359, angle) * 0.5));
    c.queryRadius(origin, len + 1, opts.team || '!player', near);
    const list = near.slice();
    let n = 0;
    for (const e of list) {
      if (!valid(e, opts.except)) continue;
      tv2.subVectors(e.object.position, origin); tv2.y = 0;
      const d = tv2.length(); if (d > len + (e.radius || 0.5)) continue;
      if (d > 0.8 && tv2.dot(tv) / d < cosH) continue;
      const h = makeHit(hitSpec, e, origin, d); if (!h) continue;
      deal(e, h); n++;
    }
    if (opts.touch !== false) { tv3.copy(origin).addScaledVector(tv, len * 0.5); touch(tv3, len * 0.5, opts.element || specEl(hitSpec), typeof hitSpec === 'object' ? hitSpec : null); }
    return n;
  }
  /** Capsule from a to b (XZ) with width (full). Each target is hit once. */
  function line(a, b, width, hitSpec, opts = {}) {
    const c = C(); if (!c?.queryRadius) return 0;
    tv.subVectors(b, a); tv.y = 0;
    const L = tv.length(); if (L < 1e-3) return aoe(a, width, hitSpec, opts);
    tv.multiplyScalar(1 / L);
    tv3.copy(a).lerp(b, 0.5);
    c.queryRadius(tv3, L * 0.5 + width + 1, opts.team || '!player', near);
    const list = near.slice();
    const half = width * 0.5;
    let n = 0;
    for (const e of list) {
      if (!valid(e, opts.except) || (opts.seen && opts.seen.has(e))) continue;
      tv2.subVectors(e.object.position, a); tv2.y = 0;
      const t = Math.max(0, Math.min(L, tv2.dot(tv)));
      const side = Math.hypot(tv2.x - tv.x * t, tv2.z - tv.z * t);
      if (side > half + (e.radius || 0.5)) continue;
      const h = makeHit(hitSpec, e, a, t); if (!h) continue;
      if (opts.seen) opts.seen.add(e);
      deal(e, h); n++;
    }
    if (opts.touch !== false) {
      const el = opts.element || specEl(hitSpec);
      const steps = Math.min(6, Math.ceil(L / 4));
      for (let i = 0; i <= steps; i++) { tv4.copy(a).lerp(b, i / steps); touch(tv4, half + 0.5, el, typeof hitSpec === 'object' ? hitSpec : null); }
    }
    return n;
  }
  /** Jump between up to n enemies (range per jump). from = entity | Vector3. Routes through rods (+1 jump each) and wet targets. */
  function chain(from, n, range, hitSpec, opts = {}) {
    const c = C(); if (!c?.queryRadius) return [];
    const hits = [];
    seen.clear();
    let cur = from && from.object ? from : null;
    const pos = tv.copy(cur ? (c.getCenter ? c.getCenter(cur, tv) : cur.object.position) : from);
    const color = opts.color ?? elColor(specEl(hitSpec) || 'lightning');
    let rods = 0;
    if (cur) { seen.add(cur); const h = makeHit(hitSpec, cur, pos, 0); if (h) { deal(cur, h); hits.push(cur); } }
    const total = n + (cur ? 0 : 1);
    for (let k = hits.length; k < total; k++) {
      // a lightning rod near the current point extends the chain by one and relays it
      if (opts.rods !== false) {
        objs.length = 0; objects.near('rod', pos, range, objs);
        const rod = objs.find((o) => !seen.has(o));
        if (rod && rods < 2) {
          seen.add(rod); rods++;
          tv2.copy(rod.position); tv2.y += 2.3;
          fx('beam', pos.clone(), tv2.clone(), { color, width: 0.14, duration: 0.3, jagged: 0.6, segments: 10, branches: 1 });
          pos.copy(tv2);
          k--; continue;
        }
      }
      let best = null, bd = Infinity;
      const wetR = opts.wetRange || range;
      c.queryRadius(pos, Math.max(range, wetR), '!player', near);
      for (const e of near) {
        if (!e.alive || seen.has(e) || e.isProp) continue;
        const d = e.object.position.distanceTo(pos);
        const lim = e.statuses?.wet ? wetR : range;
        if (d > lim) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      seen.add(best);
      const to = c.getCenter ? c.getCenter(best, new THREE.Vector3()) : best.object.position.clone();
      fx('beam', pos.clone(), to, { color, width: opts.width || 0.12, duration: 0.3, jagged: 0.55, segments: 10, branches: 1 });
      fx('burst', to, { count: 10, shape: 'spark', color: [0xffffff, color], speed: 6, spread: 1, size: 0.1, life: 0.3, drag: 2 });
      const h = makeHit(hitSpec, best, pos, bd); if (h) { if (opts.falloff) h.amount *= Math.pow(opts.falloff, hits.length); deal(best, h); }
      hits.push(best);
      pos.copy(to);
    }
    return hits;
  }

  // ---------------- beam with prism refraction ----------------
  const beams = [];
  /**
   * beam({origin, dir, len, width, dur, tick, hitSpec, prism, color, follow:fn(origin,dir)→bool, element}) → handle {stop(), alive}
   * prism: refract at ice pillars, crystals, mirrors, light pillars and frozen enemies (≤ 3 segments).
   */
  function beam(o = {}) {
    const b = {
      origin: (o.origin || tv).clone(), dir: (o.dir || tv2.set(0, 0, 1)).clone().normalize(), len: o.len || 20, width: o.width || 1.2,
      dur: o.dur ?? 0, tick: o.tick || 0.1, acc: 0, t: 0, spec: o.hitSpec, prism: !!o.prism, el: o.element || specEl(o.hitSpec) || 'light',
      color: o.color ?? elColor(o.element || specEl(o.hitSpec) || 'light', 'mid'), follow: o.follow || null, segs: [], handles: [], alive: true,
      seen: new Set(), onTick: o.onTick || null, judgmentAt: o.judgmentAt || 0,
    };
    for (let i = 0; i < 3; i++) b.segs.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), on: false });
    trace(b);
    for (let i = 0; i < 3; i++) {
      const s = b.segs[i];
      const h = s.on ? fx('beam', s.a.clone(), s.b.clone(), { color: b.color, width: Math.max(0.35, b.width * 0.85), duration: Math.max(0.25, b.dur + 0.15), jagged: 0.04, segments: 6, core: 0.4 }) : null;
      b.handles.push(h);
    }
    if (b.dur <= 0) { fire(b); b.alive = false; return handle(b); }
    beams.push(b);
    return handle(b);
  }
  function handle(b) { return { stop() { b.t = b.dur; }, get alive() { return b.alive; }, beam: b }; }
  /** Build the (≤ 3) segments from origin/dir, refracting at prism relays. */
  function trace(b) {
    let o = tv3.copy(b.origin), d = tv4.copy(b.dir), L = b.len;
    for (let i = 0; i < 3; i++) {
      const s = b.segs[i];
      if (L <= 0.5) { s.on = false; continue; }
      s.on = true; s.a.copy(o);
      let relay = null, rt = L;
      if (b.prism) {
        for (const r of relays) {
          if (!r.alive || r === b.lastRelay) continue;
          tv.subVectors(r.position, o); const t = tv.dot(d);
          if (t < 0.8 || t > rt) continue;
          tv.addScaledVector(d, -t);
          if (tv.length() > b.width + 1.2) continue;
          relay = r; rt = t;
        }
        objs.length = 0; objects.near('crystal', tv.copy(o).addScaledVector(d, Math.min(L, 30) * 0.5), Math.min(L, 30) * 0.5 + 1, objs);
        for (const r of objs) {
          tv.subVectors(r.position, o); const t = tv.dot(d);
          if (t < 0.8 || t > rt) continue;
          tv.addScaledVector(d, -t); if (tv.length() > b.width + 1) continue;
          relay = r; rt = t;
        }
        // frozen enemies refract too
        const c = C();
        if (c?.queryRadius) {
          c.queryRadius(tv.copy(o).addScaledVector(d, Math.min(L, 30) * 0.5), Math.min(L, 30) * 0.5 + 1, '!player', near);
          for (const e of near) {
            if (!e.alive || !e.statuses?.frozen) continue;
            tv.subVectors(e.object.position, o); tv.y = 0; const t = tv.x * d.x + tv.z * d.z;
            if (t < 0.8 || t > rt) continue;
            if (Math.abs(tv.x * d.z - tv.z * d.x) > b.width + 0.8) continue;
            relay = { position: e.object.position, alive: true, kind: 'frozen', entity: e }; rt = t;
          }
        }
      }
      s.b.copy(o).addScaledVector(d, relay ? rt : L);
      if (!relay) { // remaining segments off
        for (let j = i + 1; j < 3; j++) b.segs[j].on = false;
        return;
      }
      L -= rt;
      o = tv3.copy(relay.position); if (relay.kind !== 'frozen') o.y = Math.max(o.y, s.b.y); else o.y += 1;
      s.b.copy(o);
      b.lastRelay = relay;
      if (relay.kind === 'crystal' || relay.kind === 'pillar' || relay.isObject) { try { C()?.reactObject?.(relay, 'light', { source: 'player', element: 'light', amount: 0, tags: ['prism'] }); } catch (_) { /* */ } }
      // refract: toward the nearest enemy ahead of the relay, else bend 40°
      const tgt = nearestEnemy(o, 20, [], (e) => !b.seen.has(e) && relay.entity !== e);
      if (tgt) { d.subVectors(tgt.object.position, o); d.y = 0; d.normalize(); }
      else { const a = 0.7; const x = d.x * Math.cos(a) - d.z * Math.sin(a), z = d.x * Math.sin(a) + d.z * Math.cos(a); d.set(x, 0, z).normalize(); }
      relay.flashT = game.time;
      fx('burst', o.clone(), { count: 8, shape: 'star', color: [0xffffff, b.color], speed: 4, spread: 1, size: 0.16, life: 0.25 });
    }
  }
  function fire(b) {
    b.seen.clear();
    const opts = { seen: b.seen, touch: true, element: b.el };
    for (const s of b.segs) if (s.on) line(s.a, s.b, b.width, b.spec, opts);
    try { b.onTick?.(b); } catch (err) { warn('beam.onTick', err); }
  }
  function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t += dt;
      if (b.follow) { try { if (b.follow(b.origin, b.dir) === false) b.t = b.dur; } catch (_) { /* */ } }
      if (b.t >= b.dur) {
        b.alive = false; beams.splice(i, 1);
        for (const h of b.handles) { try { h?.stop?.(); } catch (_) { /* */ } }
        continue;
      }
      b.lastRelay = null;
      trace(b);
      for (let k = 0; k < 3; k++) {
        const s = b.segs[k], h = b.handles[k];
        if (s.on) {
          if (h?.setEnds) h.setEnds(s.a, s.b);
          else if (!h) b.handles[k] = fx('beam', s.a.clone(), s.b.clone(), { color: b.color, width: Math.max(0.35, b.width * 0.85), duration: Math.max(0.2, b.dur - b.t + 0.1), jagged: 0.04, segments: 6, core: 0.4 });
        } else if (h?.setEnds) h.setEnds(s.a, s.a);
      }
      b.acc += dt;
      if (b.acc >= b.tick) { b.acc -= b.tick; fire(b); }
    }
  }

  // ---------------- misc ----------------
  /** Nearest living enemy within r of p (props excluded). exclude: array; filter(e) → bool. */
  function nearestEnemy(p, r = 20, exclude = [], filter = null) {
    let best = null, bd = r * r;
    for (const e of game.entities) {
      if (!e.alive || e.team !== 'enemy' || !e.object || e.isProp || exclude.includes(e)) continue;
      if (filter && !filter(e)) continue;
      const d = e.object.position.distanceToSquared(p);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function aim() {
    try { const a = game.player?.getAim?.(); if (a) return a; } catch (_) { /* */ }
    const o = S.playerPos().clone(); o.y += 1.6;
    const d = new THREE.Vector3(); try { game.camera.getWorldDirection(d); } catch (_) { d.set(0, 0, -1); }
    return { origin: o, dir: d, point: o.clone().addScaledVector(d, 30), target: null };
  }
  function blockAt(p) {
    const W = game.world; if (!W?.projectileBlockAt || !W.collidersBlockingProjectiles?.length) return null;
    try { return W.projectileBlockAt(p) || null; } catch (_) { return null; }
  }
  /** Player shield (crystal pickup, aegis): uses player.addShield when present, else an absorb listener. */
  let shieldHp = 0, shieldT = 0;
  function shield(amount, dur, el) {
    const p = game.player;
    if (typeof p?.addShield === 'function') { try { return p.addShield(amount, dur, { element: el }); } catch (_) { /* */ } }
    shieldHp = Math.max(shieldHp, amount); shieldT = Math.max(shieldT, dur);
    return true;
  }
  game.events?.on?.('damage', (ev) => {
    if (shieldHp <= 0 || !ev?.target || ev.target !== game.player?.entity || !(ev.amount > 0)) return;
    const p = game.player; if (!p || p.entity?.alive === false || p.hp <= 0) return;
    const a = Math.min(shieldHp, ev.amount); shieldHp -= a;
    p.hp = Math.min(p.maxHp || 100, p.hp + a); if (p.entity) p.entity.hp = p.hp;
    fx('burst', tv.copy(p.object.position).setY(p.object.position.y + 1.2), { count: 8, shape: 'shard', color: [0xffffff, 0xffe9a8], speed: 4, spread: 1, size: 0.14, life: 0.3 });
  });
  function update(dt) {
    updateBeams(dt);
    if (shieldT > 0) { shieldT -= dt; if (shieldT <= 0) shieldHp = 0; }
  }

  // ---------------- terrain (element-generic) ----------------
  const surf2 = () => game.world?.surface2;
  const terrain = Object.assign(S.terrain, {
    bless(pos, r, s = 8) { try { surf2()?.bless?.(pos, r, s); } catch (_) { /* */ } },
    curse(pos, r, s = 8) { try { surf2()?.curse?.(pos, r, s); } catch (_) { /* */ } },
    overgrow(pos, r, s = 10) { try { surf2()?.overgrow?.(pos, r, s); } catch (_) { /* */ } },
    rubble(pos, r, s = 6) { try { surf2()?.rubble?.(pos, r, s); } catch (_) { /* */ } },
    mud(pos, r, s = 6) { try { surf2()?.mud?.(pos, r, s); } catch (_) { /* */ } },
    meltIce(pos, r) { try { game.world?.surface?.meltIce?.(pos, r); } catch (_) { /* */ } },
    regrow(pos, r) { try { game.world?.surface?.regrow?.(pos, r); } catch (_) { /* */ } },
    /** Element default world effect at a point (used by archetypes with params.twist / zone placement). */
    apply(el, pos, r) {
      if (el === 'fire') return terrain.ignite(pos, r, 0.8);
      if (el === 'ice') return terrain.chill(pos, r);
      if (el === 'water') return terrain.soak(pos, r, 10);
      if (el === 'nature') return terrain.regrow(pos, r);
      if (el === 'light') return terrain.bless(pos, r, 6);
      if (el === 'shadow') return terrain.curse(pos, r, 6);
      if (el === 'earth') return terrain.rubble(pos, r, 5);
      return 0;
    },
  });

  const api = {
    projectiles: { spawn: (o) => S.projectiles.spawn(o), get active() { return S.projectiles.active; } },
    zones: {
      spawn(type, pos, opts = {}) {
        if (type === 'vortex') type = 'tornado';
        if (LEGACY_ZONES.has(type)) {
          const z = legacy.spawn(type, pos, { ...opts, radius: opts.radius ?? opts.r, duration: opts.duration ?? opts.dur });
          if (z) { adoptLegacy(z); game.events.emit('zoneSpawn', { type, point: z.pos, radius: z.radius, duration: z.duration }); }
          return z;
        }
        return zones2.spawn(type, pos, opts);
      },
      isInside(type, pos) {
        if (!pos) return false;
        if (type === 'vortex') type = 'tornado';
        if (LEGACY_ZONES.has(type)) { for (const z of legacy.zones) if (z.type === type && legacy.inside(z, pos)) return true; }
        return zones2.isInside(type, pos);
      },
      /** All live zones (v2 + v3), refilled on access into one reused array. */
      get list() { listArr.length = 0; for (const z of legacy.zones) listArr.push(z); for (const z of zones2.zones) listArr.push(z); return listArr; },
      elementAt: (point, r, el, hit) => touch(point, r, el, hit),
      chargeWater(pos, r) { try { legacy.elementAt(pos, r, 'lightning', { source: 'rod' }); } catch (_) { /* */ } zones2.chargeWater(pos, r); },
      TYPES: [...LEGACY_ZONES, 'vortex', ...Object.keys(zones2.TYPES)],
      v2: legacy, v3: zones2,
    },
    objects,
    aoe, cone, line, chain, beam, touch, makeHit, deal,
    decalRing: (...a) => S.decalRing(...a), later: (t, fn) => S.later(t, fn), laterReal: (t, fn) => S.laterReal(t, fn),
    terrain, nearestEnemy, aim, blockAt, shield, relays, update,
    ELEMENTS: ALL_ELEMENTS, STATUS_OF: S.STATUS_OF, elDef,
    /** Register a prism relay point (pillar / mirror / beacon / light pillar). */
    addRelay(r) { if (r && !relays.includes(r)) { if (r.alive === undefined) r.alive = true; relays.push(r); } return r; },
    removeRelay(r) { const i = relays.indexOf(r); if (i >= 0) relays.splice(i, 1); },
  };
  return api;
}
