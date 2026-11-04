// Spells: casting input, cooldowns, projectiles, zones and zone fusions.
// v2: class/path gating, master path awakened ultimate (F), cinematic finisher (R) and support skill (G), terrain hooks.
// v3 (CONTRACT §11): castById / silent setElement for the skills runtime, the element-generic `api` toolkit
// (projectiles, zones v2+v3, pooled objects, aoe/cone/line/chain/beam with prism refraction, terrain helpers),
// the CASTER implementations of all 24 archetypes (spells/archetypes.js) and the bespoke caster forms
// (spells/bespoke.js), both registered in this FACTORY. Input is read only in the legacy keymap (or with skills stubbed).
import * as THREE from 'three';
import { glint, GLINT } from './spells/palette.js';
import { ELEMENT_COLORS } from './core/utils.js';
import { ALL_ELEMENTS, CLASSIC_ELEMENTS, ELEMENT_DEFS, elColor, elName } from './core/elements.js';
import { familyOf } from './core/classes.js';
import * as assets from './spells/assets.js';
import { createProps } from './spells/props.js';
import { createProjectiles } from './spells/projectiles.js';
import { createZones } from './spells/zones.js';
import { SPELLS } from './spells/defs.js';
import { AWAKENED, FINISHERS, SUPPORTS, createSupportRuntime } from './spells/master.js';
import { createSetPieces } from './spells/setpieces.js';
import { createObjects } from './spells/objects.js';
import { createZones2 } from './spells/zones2.js';
import { createApi } from './spells/api.js';
import { createSummons, createStructures } from './spells/summons.js';
import { createArchetypes } from './spells/archetypes.js';
import { createBespoke } from './spells/bespoke.js';
import { createLooks, skillOfSpell } from './spells/looks.js';

const { uTime } = assets;
const MIN_CHARGE = 0.25;
const FOES = '!player';
const SLOT_DEFS = [
  { kind: 'basic', key: 'LMB' }, { kind: 'heavy', key: 'RMB' }, { kind: 'ultimate', key: 'F' },
  { kind: 'support', key: 'G' }, { kind: 'finisher', key: 'R' },
];
// awakened / support / finisher defs registered alongside the 15 base spells (ids: <el>_awakened|support|finisher).
// CLASSIC only (CONTRACT §3.1): the 4 new elements' skills come from the skills defs (archetypes / bespoke forms).
const ALL = { ...SPELLS };
for (const el of CLASSIC_ELEMENTS) {
  ALL[`${el}_awakened`] = { element: el, kind: 'ultimate', awakened: true, ...AWAKENED[el] };
  ALL[`${el}_support`] = { element: el, kind: 'support', ...SUPPORTS[el] };
  ALL[`${el}_finisher`] = { element: el, kind: 'finisher', mp: 0, cd: 0, ...FINISHERS[el] };
}

/** STATUS_OF from the element registry (9 elements; wind has none). */
const STATUS_OF = {};
for (const el of ALL_ELEMENTS) STATUS_OF[el] = ELEMENT_DEFS[el]?.status || null;

export function createSpells(game) {
  // legacy keymap: the 5 classic elements (Digit1–5); v3: all 9 (skills attunes any of them, silently)
  const legacyKeymap = () => game.keymapMode === 'legacy';
  const elements = (legacyKeymap() ? CLASSIC_ELEMENTS : ALL_ELEMENTS).slice();
  let index = 0;
  const cooldowns = {};
  for (const id in ALL) cooldowns[id] = 0;
  let charging = false, chargeFrac = 0, chargeEl = null;
  const timers = [], realTimers = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let fin = null;   // active finisher {el, impacted, ended, ...}

  const surf = () => game.world?.surface;
  const safe = (fn) => { try { return fn(); } catch (err) { if (!safe.warned) { safe.warned = 1; console.warn('[spells] terrain', err); } return 0; } };
  const tv = new THREE.Vector3();

  // ---------- shared context for spell implementations ----------
  // combat shim: every hit dealt from spell code carries the current cast's castId (PLAN v4 §7.4.7)
  let combatSrc = null, combatShim = null;
  const combatOf = () => {
    const c = game.combat;
    if (!c || c === combatSrc) return combatShim || c;
    combatSrc = c; combatShim = Object.create(c);
    combatShim.dealDamage = (e, h) => c.dealDamage(e, L ? L.stamp(h) : h);
    return combatShim;
  };
  let L = null;
  const S = {
    game,
    get combat() { return combatOf(); },
    STATUS_OF,
    /** Every legacy vfx call of spell code goes through the v4 look gate (looks.js fx). */
    vfx(fn, ...a) { try { return L ? L.fx(fn, a) : game.vfx?.[fn]?.(...a); } catch (e) { if (!S._vfxErr) { S._vfxErr = 1; console.warn('[spells] vfx.' + fn, e); } return null; } },
    sfx(name, opts) { try { game.audio?.play?.(name, opts); } catch (_) { /* */ } },
    height(x, z) { try { const h = game.world?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; } catch (_) { return 0; } },
    ground(p, out = tmp2) { out.set(p.x, S.height(p.x, p.z), p.z); return out; },
    center(e, out = new THREE.Vector3()) { return game.combat.getCenter ? game.combat.getCenter(e, out) : out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) / 2); },
    playerPos() { return game.player?.object?.position || game.player?.entity?.object?.position || tmp.set(0, 0, 0); },
    later(t, fn) { timers.push({ t, fn: L ? L.bind(fn) : fn }); },
    laterReal(t, fn) { realTimers.push({ t, fn: L ? L.bind(fn) : fn }); },
    combo(id, name, point) {
      try { game.combat.discover ? game.combat.discover(id) : game.combat.discovered?.add(id); } catch (_) { /* */ }
      game.events.emit('zoneCombo', { id, name, point: point.clone() });
    },
    /** Damage every foe (enemies + props) within r of point (except `except`); makeHit(e, dist) returns partial hit or null. */
    aoe(point, r, except, makeHit) {
      const list = game.combat.queryRadius(point, r, FOES);
      const pc = point.clone();
      for (const e of list) {
        if (e === except || !e.alive) continue;
        const d = Math.hypot(e.object.position.x - pc.x, e.object.position.z - pc.z);
        const h = makeHit(e, Math.min(d, r));
        if (!h) continue;
        const c = S.center(e);
        const dir = new THREE.Vector3(e.object.position.x - pc.x, 0, e.object.position.z - pc.z);
        if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        dir.normalize();
        S.combat.dealDamage(e, { source: 'player', point: c, direction: dir, ...h, amount: Math.round(h.amount) });
      }
    },
    /** Nearest living ENEMY (props excluded — chains and homing never jump to barrels). */
    nearestEnemy(p, r, exclude) {
      let best = null, bd = r * r;
      for (const e of game.entities) {
        if (!e.alive || e.team !== 'enemy' || !e.object || exclude.includes(e)) continue;
        const d = e.object.position.distanceToSquared(p);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    /** Scorch decals: one in the middle + n around at radius r. */
    decalRing(c, r, size = 1.2, n = 6) {
      S.vfx('decal', c, { color: 0x1a0c08, radius: r * 0.7, duration: 12, opacity: 0.7 });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, rr = r * (0.6 + Math.random() * 0.5);
        tv.set(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr); tv.y = S.height(tv.x, tv.z);
        S.vfx('decal', tv, { color: 0x2a1a10, radius: size * (0.8 + Math.random() * 0.6), duration: 10, opacity: 0.6 });
      }
    },
    /** Terrain interaction (world.surface, optional): grass fire, extinguish, ice on water, wind gusts. */
    terrain: {
      ignite(pos, r, intensity = 1) { const s = surf(); return s?.ignite ? safe(() => s.ignite(pos, r, intensity)) : 0; },
      extinguish(pos, r) { const s = surf(); return s?.extinguish ? safe(() => s.extinguish(pos, r)) : 0; },
      /** Ice: put fires out and freeze water (samples a few points so big spells catch nearby shores). */
      chill(pos, r) {
        const s = surf(); if (!s) return;
        safe(() => {
          s.extinguish?.(pos, r);
          if (!s.freezeWater) return;
          const fr = Math.min(10, Math.max(2, r));
          let froze = s.freezeWater(pos, fr, 25);
          if (r > 4) for (let i = 0; i < 4; i++) {
            const a = i * 1.5708 + 0.4;
            tv.set(pos.x + Math.cos(a) * r * 0.6, pos.y, pos.z + Math.sin(a) * r * 0.6);
            froze = s.freezeWater(tv, fr * 0.7, 25) || froze;
          }
          return froze;
        });
      },
      /** Rain / water: soak grass so it can't burn (also extinguishes). */
      soak(pos, r, seconds = 10) { const s = surf(); if (s?.wet) safe(() => s.wet(pos, r, seconds)); else if (s?.extinguish) safe(() => s.extinguish(pos, r)); },
      wind(pos, dir, strength = 1, r = 6) { const s = surf(); if (s?.wind) safe(() => s.wind(pos, dir, strength, r)); },
    },
    chainBonus() { return S.support ? S.support.chainBonus : 0; },
  };
  L = createLooks(S); S.looks = L;
  L.install();
  const sceneN0 = game.scene?.children?.length ?? 0;
  S.props = createProps(game);
  S.projectiles = createProjectiles(S);
  S.zones = createZones(S);
  S.support = createSupportRuntime(S, assets);
  S.setPieces = createSetPieces(S);
  // ---------- v3 toolkit ----------
  S.legacyZones = S.zones;
  const objects = createObjects(S); S.objects = objects;
  const zones2 = createZones2(S); S.zones2 = zones2;
  const v3api = createApi(S, { zones2, objects, legacy: S.zones }); S.api = v3api;
  S.shield = (...a) => v3api.shield(...a);
  S.blockAt = (p) => v3api.blockAt(p);
  const summons = createSummons(S, v3api);
  const structures = createStructures(S, v3api);
  const arch = createArchetypes(S, v3api, { summons, structures });
  const bespoke = createBespoke(S, v3api, arch, { summons, structures });
  v3api.summons = summons; v3api.structures = structures; v3api.archetypes = arch;
  v3api.despawnSummon = (skillId) => { summons.despawnSkill(skillId); if (skillId === 'lightning.rod' || !skillId) objects.despawnAll('rod'); if (skillId === 'lightning.mine' || !skillId) objects.despawnAll('mine'); };
  const objNear = [];
  /** Projectile ↔ object collision: pods / crystals / ice flowers react to the projectile's element (combat.reactObject). */
  S.objectHit = (p) => {
    if (!objects.count()) return false;
    objNear.length = 0; objects.near('*', p.pos, p.radius + 0.5, objNear);
    for (const o of objNear) {
      if (p.hits.has(o) || (o.kind !== 'pod' && o.kind !== 'crystal' && o.kind !== 'flower')) continue;
      if (Math.abs(p.pos.y - (o.position.y + 0.5)) > 1.8) continue;
      p.hits.add(o);
      const h = p.hitTpl ? Object.assign({}, p.hitTpl) : { source: 'player' };
      h.amount = p.damage; h.element = p.element; h.point = o.position.clone();
      if (objects.burst(o, p.element, h)) return true;
    }
    return false;
  };
  // archetypes + bespoke forms are registered in the FACTORY (CONTRACT §2: registries exist after the factory)
  // v4 (R8 / R10): every pooled spell object built by the subsystems above is adopted once (noCameraCollide, ducking, no depth write)
  try {
    const kids = game.scene?.children || [];
    if (S.props.spikes) S.props.spikes.override = (x, y, z, o) => L.spike(x, y, z, o);
    const rawSigil = S.props.sigil;
    S.props.sigil = (pos, o = {}) => L.sigil(pos, o, rawSigil);
    for (const s of S.props.sigilPool || []) L.adopt(s, { role: 'line' });
    S.props.onNewSigil = (s) => L.adopt(s, { role: 'line' });
    for (let i = sceneN0; i < kids.length; i++) { const o = kids[i]; if (o?.name?.startsWith?.('kit-')) continue; L.adopt(o, { entity: /^spells\.summon\.(treant|totem|clone)/.test(o.name || '') }); }
  } catch (err) { console.warn('[spells] adopt', err); }
  let nArch = 0, nImpl = 0;
  try { nArch = arch.register(); nImpl = bespoke.register(); } catch (err) { console.warn('[spells] archetype registration', err); }

  const spellId = (el, kind) => `${el}_${kind}`;
  const player = () => game.player;
  const prog = () => game.progression;
  const mp = () => player()?.mp ?? 0;
  const isMaster = () => !!prog()?.isMaster?.();

  /** spells reads its own input only in the legacy keymap (or when skills is missing/stubbed: rule 11 fallback). */
  const legacyInput = () => legacyKeymap() || !game.skills || !!game.skills.isStub;
  /** Legacy-mode activity: caster-family class chosen (no progression → always on). v3: false (game.skills drives casts). */
  function isActive() {
    const p = prog();
    if (!p) return true;
    if (!legacyInput()) return false;
    return !!p.chosen && familyOf(p.cls) === 'caster';
  }
  function unlocked(el) {
    const p = prog();
    if (!p || !p.chosen) return !p;
    return p.isElementUnlocked ? p.isElementUnlocked(el) : true;
  }
  /** Resolve which def a slot kind uses for element el (master F → awakened). */
  function defId(el, kind) {
    if (kind === 'ultimate' && isMaster() && prog()?.element === el && prog()?.hasAwakenedUltimate?.() !== false) return spellId(el, 'awakened');
    return spellId(el, kind);
  }

  function canCast() {
    const p = player(); if (!p) return false;
    const e = p.entity;
    if (e && (!e.alive)) return false;
    if (fin) return false;
    try { if (e && game.combat.canAct && !game.combat.canAct(e)) return false; } catch (_) { /* */ }
    return true;
  }

  /**
   * setElement(i | elementId, {silent=false, force=false} | true)
   * silent: called by skills.attune — no event, no sfx, no gating (skills already gated). Legacy `true` = force.
   * v3 keymap, not silent: forwards to skills.attune (the single emitter of elementChanged, CONTRACT §9/E11).
   */
  function setElement(i, opts) {
    const o = opts === true ? { force: true } : (opts || {});
    const silent = !!o.silent, force = !!o.force;
    if (typeof i === 'string') i = elements.indexOf(i);
    if (!Number.isFinite(i) || i < 0) return;
    i = ((i % elements.length) + elements.length) % elements.length;
    if (!silent && !legacyInput() && game.skills?.attune) { try { game.skills.attune(elements[i]); } catch (_) { /* */ } return; }
    if (i === index && !force && !silent) return;
    if (!silent && !unlocked(elements[i])) return;
    if (charging) endCharge(false);
    index = i;
    api.element = elements[index]; api.index = index;
    try { player()?.setStaffElement?.(api.element); } catch (_) { /* */ }
    if (silent) return;
    if (!force) S.sfx('ui_select');
    game.events.emit('elementChanged', { element: api.element, index, cls: prog()?.cls || null });
  }
  /** Wheel: step to the next unlocked element. */
  function stepElement(d) {
    for (let k = 1; k <= elements.length; k++) {
      const j = ((index + d * k) % elements.length + elements.length) % elements.length;
      if (unlocked(elements[j])) { if (j !== index) setElement(j); return; }
    }
  }

  function fallbackAim() {
    const o = S.playerPos().clone().add(new THREE.Vector3(0, 1.6, 0));
    const d = new THREE.Vector3(); game.camera.getWorldDirection(d);
    return { origin: o, dir: d, point: o.clone().addScaledVector(d, 40), target: null };
  }

  /**
   * Cast a spell. kind: 'basic'|'heavy'|'ultimate'|'support'|'finisher'. opts: {charge, aim, free (ignore cost, cooldown,
   * gauge and class/path gating — test hook)}. For the master element, 'ultimate' casts the awakened version
   * ('awakened' may also be requested explicitly). Returns true on success.
   */
  function cast(el, kind, opts = {}) {
    if (kind === 'finisher') return finisher(el, opts);
    const sid = kind === 'awakened' ? spellId(el, 'awakened') : opts.exact ? spellId(el, kind) : defId(el, kind);
    if (!ALL[sid]) return false;
    const prev = L.begin({ castId: opts.castId, skillId: opts.skillId || skillOfSpell(sid), el, style: opts.style });
    try { return castInner(el, kind, opts); } finally { L.end(prev); }
  }
  function castInner(el, kind, opts) {
    const id = kind === 'awakened' ? spellId(el, 'awakened') : opts.exact ? spellId(el, kind) : defId(el, kind);
    const def = ALL[id];
    if (!def) return false;
    if (kind === 'awakened') kind = 'ultimate';
    if (!opts.free) {
      if (!isActive() || !unlocked(el)) return false;
      if (kind === 'support' && !prog()?.hasSupport?.()) return false;
      if (cooldowns[id] > 0) { game.events.emit('spellFail', { reason: 'cooldown', spellId: id }); return false; }
      const p = player();
      if (p?.spendMp && !p.spendMp(def.mp)) { game.events.emit('spellFail', { reason: 'mana', spellId: id }); S.sfx('mana_empty'); return false; }
    }
    if (kind === 'support') {
      cooldowns[id] = def.cd;
      try { player()?.playCast?.('heavy', el); } catch (_) { /* */ }
      S.sfx('cast_' + el, { position: S.playerPos(), pitch: 0.8 });
      S.sfx('blessing', { position: S.playerPos(), volume: 0.6 });
      try { S.support.start(el); L.castFx(S.playerPos().clone().setY(S.playerPos().y + 1.4), { el }); } catch (err) { console.error('[spells] support ' + id, err); }
      game.events.emit('spellCast', { element: el, kind: 'support', spellId: id, origin: S.playerPos().clone() });
      return true;
    }
    let aim = opts.aim;
    if (!aim) { try { aim = player().getAim(); } catch (_) { aim = null; } }
    if (!aim) aim = fallbackAim();
    S.aimDirFlat = aim.dir;
    cooldowns[id] = def.cd;
    try { player()?.playCast?.(kind, el); } catch (_) { /* */ }
    S.sfx('cast_' + el, { position: aim.origin, volume: kind === 'basic' ? 0.7 : 1 });
    const chargeV = Math.max(MIN_CHARGE, Math.min(1, opts.charge ?? 1));
    const doCast = () => { try { def.cast(S, aim, chargeV); } catch (err) { console.error('[spells] cast ' + id, err); } };
    if (kind === 'ultimate') {
      // shared anticipation beat: brief slow-mo, zoom-in, sigil at the caster's feet, rising charge sound
      // (v4: the anticipation is non-cancellable for its 0.1 / 0.16 s: castLock for the player's dodge buffer)
      const col = ELEMENT_COLORS[el], aw = !!def.awakened;
      L.lock(aw ? 0.2 : 0.14);
      L.castFx(aim.origin, { el });
      S.vfx('flash', aim.origin, { color: col, intensity: aw ? 10 : 6, distance: aw ? 16 : 10, duration: 0.4 });
      try { if (game.timeScale?.set) game.timeScale.set('ult', aw ? 0.3 : 0.4, aw ? 0.35 : 0.2); else game.slowmo?.(aw ? 0.3 : 0.4, aw ? 0.35 : 0.2); } catch (_) { /* */ }
      try {
        const fp = S.playerPos().clone(); fp.y = S.height(fp.x, fp.z) + 0.05;
        S.props.sigil(fp, { color: col, radius: aw ? 3.4 : 2.2, duration: aw ? 0.9 : 0.6, spin: 3 });
        if (aw) {
          S.props.sigil(fp, { color: L.on() ? (ELEMENT_DEFS[el]?.colors?.fx?.light ?? col) : GLINT, radius: 1.6, duration: 0.9, spin: -4 });
          fp.y += 1;
          S.vfx('shockwave', fp, { color: col, radius: 3, duration: 0.45, vertical: true, thickness: 0.3 });
          S.vfx('burst', fp, { count: 50, color: [col, glint(col)], shape: 'spark', speed: 9, spread: 1, size: 0.14, life: 0.5, drag: 2 });
        }
      } catch (_) { /* */ }
      S.sfx('charge', { position: aim.origin, pitch: aw ? 1.1 : 1.4 });
      S.later(aw ? 0.16 : 0.1, doCast);
    } else { L.castFx(aim.origin, { el }); doCast(); }
    game.events.emit('spellCast', { element: el, kind, spellId: id, origin: aim.origin.clone(), awakened: !!def.awakened });
    return true;
  }

  // ---------- finisher (R) ----------
  function finisher(el, opts = {}) {
    const id = spellId(el, 'finisher'), def = ALL[id];
    if (!def || fin) return false;
    const prev = L.begin({ castId: opts.castId, skillId: opts.skillId || el + '.finisher', el, tier: 'F' });
    try { return finisherInner(el, opts, id, def); } finally { L.end(prev); }
  }
  function finisherInner(el, opts, id, def) {
    const p = prog();
    if (!opts.free) {
      if (!isActive() || !p?.hasFinisher?.() || el !== p.element) return false;
      if (!p.canFinisher?.()) { game.events.emit('spellFail', { reason: 'gauge', spellId: id }); S.sfx('mana_empty', { volume: 0.5 }); return false; }
      if (!p.consumeAwakening?.()) return false;
    }
    if (charging) endCharge(false);
    const pl = player();
    let aim = opts.aim;
    if (!aim) { try { aim = pl.getAim(); } catch (_) { aim = null; } }
    if (!aim) aim = fallbackAim();
    const hero = S.playerPos().clone();
    // target: crosshair foe, else nearest enemy in front within 26 m
    let target = aim.target && aim.target.alive && aim.target.team === 'enemy' ? aim.target : null;
    if (!target) {
      let best = null, bs = -1;
      const fd = tmp.set(aim.dir.x, 0, aim.dir.z).normalize();
      for (const e of game.entities) {
        if (!e.alive || e.team !== 'enemy' || !e.object) continue;
        const dx = e.object.position.x - hero.x, dz = e.object.position.z - hero.z, d = Math.hypot(dx, dz);
        if (d > 26 || d < 0.5) continue;
        const s = (dx * fd.x + dz * fd.z) / d - d / 40 + (e.isBoss ? 0.5 : 0);
        if (s > bs) { bs = s; best = e; }
      }
      target = best;
    }
    const center = new THREE.Vector3();
    if (target) center.copy(target.object.position);
    else {
      const fd = tmp.set(aim.dir.x, 0, aim.dir.z); if (fd.lengthSq() < 1e-6) fd.set(0, 0, -1); fd.normalize();
      const d = Math.min(18, Math.max(8, Math.hypot(aim.point.x - hero.x, aim.point.z - hero.z)));
      center.set(hero.x + fd.x * d, 0, hero.z + fd.z * d);
    }
    center.y = S.height(center.x, center.z);
    const dir = new THREE.Vector3(center.x - hero.x, 0, center.z - hero.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    try { pl?.setFacing?.(Math.atan2(dir.x, dir.z)); } catch (_) { /* */ }

    const ent = pl?.entity;
    const wasInv = ent ? !!ent.invulnerable : false;
    if (ent) ent.invulnerable = true;
    fin = { el, impacted: false, ended: false, ent, wasInv };
    S.setPieces.start(el, { hero, center: center.clone(), dir });
    try { pl?.playCast?.('ultimate', el); pl?.setCharging?.(true, el, 1); } catch (_) { /* */ }
    S.props.sigil(S.ground(hero).clone(), { color: ELEMENT_COLORS[el], radius: 3.2, duration: 3.5, spin: 1.5 });
    S.sfx('finisher_charge', { position: hero });
    game.events.emit('spellCast', { element: el, kind: 'finisher', spellId: id, origin: hero.clone() });
    game.events.emit('finisherStart', { element: el, name: def.name, cls: prog()?.cls || null });

    const doImpact = () => {
      if (!fin || fin.impacted) return;
      fin.impacted = true;
      try { pl?.setCharging?.(false, el, 0); pl?.playCast?.('ultimate', el); } catch (_) { /* */ }
      S.setPieces.strike(() => {
        const pts = S.setPieces.crystalPoints([]);
        S.sfx('finisher_impact', { position: center });
        try { def.impact(S, center.clone(), target, pts); } catch (err) { console.error('[spells] finisher ' + id, err); }
        game.events.emit('finisherImpact', { element: el, point: center.clone() });
      });
    };
    const doEnd = () => {
      if (!fin || fin.ended) return;
      doImpact();
      fin.ended = true;
      const f = fin;
      // let the strike land before handing control back
      S.laterReal(0.45, () => {
        S.setPieces.end();
        if (f.ent && !f.wasInv) f.ent.invulnerable = false;
        if (fin === f) fin = null;
      });
    };
    const cin = game.cinematic;
    const cinOk = cin?.finisher && !(game.stubbed || []).includes('cinematic') && !opts.noCinematic;
    let usedCin = false;
    if (cinOk) {
      try {
        cin.finisher({ cls: prog()?.cls || null, element: el, name: def.name, target, center: center.clone(), onBuildup: () => {}, onImpact: doImpact, onEnd: doEnd });
        usedCin = true;
      } catch (err) { console.error('[spells] cinematic.finisher', err); }
    }
    if (!usedCin) {
      // non-cinematic fallback: slow-mo power-up, then the blow
      try { if (game.timeScale?.set) game.timeScale.set('ult', 0.3, 2.2); else game.slowmo?.(0.3, 2.2); } catch (_) { /* */ }
      S.vfx('screenFlash', ELEMENT_COLORS[el], 0.25, 0.8);
      S.vfx('fovKick', -4, 0.3);
      S.laterReal(1.9, doImpact);
      S.laterReal(2.6, doEnd);
    }
    // safety net in case a cinematic never calls back
    S.laterReal(8, doImpact);
    S.laterReal(11, doEnd);
    return true;
  }

  /**
   * castById(spellId, {free, charge, aim, awakened}) — the legacy defs run with gating bypassed (skills gated the cast).
   * Ids: <el>_basic|heavy|ultimate|awakened|support|finisher for the 5 classic elements. Emits spellCast exactly once.
   */
  function castById(spellIdArg, opts = {}) {
    const k = String(spellIdArg || '').lastIndexOf('_');
    if (k <= 0) return false;
    const el = spellIdArg.slice(0, k), kind = spellIdArg.slice(k + 1);
    const castId = opts.castId ?? L.takeIssued() ?? 0;
    if (kind === 'finisher') return ALL[spellIdArg] ? finisher(el, { ...opts, free: true, castId: castId || undefined }) : false;
    if (!ALL[spellIdArg]) return false;
    if (elements.includes(el) && elements[index] !== el) setElement(elements.indexOf(el), { silent: true });
    return cast(el, kind, { ...opts, free: true, exact: true, castId: castId || undefined });
  }

  function startCharge() {
    const id = spellId(api.element, 'heavy');
    if (!SPELLS[id]) return;
    if (cooldowns[id] > 0) { game.events.emit('spellFail', { reason: 'cooldown', spellId: id }); return; }
    if (mp() < SPELLS[id].mp) { game.events.emit('spellFail', { reason: 'mana', spellId: id }); S.sfx('mana_empty'); return; }
    charging = true; chargeFrac = 0; chargeEl = api.element;
    S.sfx('charge');
    game.events.emit('chargeStart', { element: chargeEl });
  }
  function endCharge(release) {
    if (!charging) return;
    const el = chargeEl, frac = chargeFrac;
    charging = false; chargeFrac = 0; chargeEl = null;
    try { player()?.setCharging?.(false, el, 0); } catch (_) { /* */ }
    S.props.setCharge(false);
    game.events.emit('chargeEnd', { element: el, frac, released: !!release });
    if (release && frac >= MIN_CHARGE) cast(el, 'heavy', { charge: frac });
  }

  // ---------- HUD (v2 shape) ----------
  const slotsAll = SLOT_DEFS.map(({ kind, key }) => ({ kind, key, name: '', desc: '', mpCost: 0, staminaCost: 0, cooldown: 0, cooldownLeft: 0, ready: true, awakened: false, id: '' }));
  const slots3 = slotsAll.slice(0, 3);
  const hud = {
    element: elements[0], index: 0, active: true,
    elements: elements.map((id) => ({ id, name: elName(id), color: elColor(id, 'hex'), locked: false })),
    slots: slots3,
    charging: false, chargeFrac: 0,
    awakening: { enabled: false, value: 0, ready: false },
    support: { active: null, timeLeft: 0 },
  };
  function getHudState() {
    const el = api.element, p = prog();
    const master = isMaster();
    hud.element = el; hud.index = index; hud.charging = charging; hud.chargeFrac = chargeFrac;
    hud.active = isActive();
    for (const e of hud.elements) e.locked = !unlocked(e.id);
    hud.slots = master ? slotsAll : slots3;
    const m = mp();
    for (let i = 0; i < hud.slots.length; i++) {
      const s = hud.slots[i];
      const id = s.kind === 'finisher' ? spellId(el, 'finisher') : s.kind === 'support' ? spellId(el, 'support') : defId(el, s.kind);
      const d = ALL[id];
      if (!d) { s.id = ''; s.name = ''; s.desc = ''; s.mpCost = 0; s.cooldown = 0; s.awakened = false; s.cooldownLeft = 0; s.ready = false; continue; }
      s.id = id; s.name = d.name; s.desc = d.desc; s.mpCost = d.mp || 0; s.cooldown = d.cd || 0; s.awakened = !!d.awakened;
      s.cooldownLeft = Math.max(0, cooldowns[id]);
      s.ready = s.kind === 'finisher' ? !!p?.canFinisher?.() && !fin : s.cooldownLeft <= 0 && m >= s.mpCost;
    }
    const aw = hud.awakening;
    aw.enabled = !!p?.hasFinisher?.(); aw.value = p?.awakening || 0; aw.ready = !!p?.canFinisher?.();
    hud.support.active = S.support.active; hud.support.timeLeft = S.support.timeLeft;
    return hud;
  }

  // ---------- update ----------
  let warmed = false;
  function update(dt, realDt) {
    if (!warmed) { warmed = true; try { objects.update(0); zones2.afterPrewarm(); summons.afterPrewarm(); structures.afterPrewarm(); arch.afterPrewarm(); } catch (_) { /* */ } }
    // spell shaders keep animating through the finisher's frozen frame
    uTime.value += fin || S.setPieces.active ? Math.max(dt, realDt || 0) : dt;
    const cs = S.support.castSpeed;
    for (const id in cooldowns) if (cooldowns[id] > 0) cooldowns[id] -= dt * cs;
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i]; t.t -= dt;
      if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (err) { console.error('[spells] timer', err); } }
    }
    for (let i = realTimers.length - 1; i >= 0; i--) {
      const t = realTimers[i]; t.t -= realDt || dt;
      if (t.t <= 0) { realTimers.splice(i, 1); try { t.fn(); } catch (err) { console.error('[spells] timer', err); } }
    }

    // ---- input ----
    const input = game.input;
    const live = isActive() && game.skills?.ownsInput !== true;
    if (game.state === 'playing' && live) {
      for (let i = 0; i < elements.length && i < 9; i++) if (input.pressed('Digit' + (i + 1))) setElement(i);
      if (input.wheel > 0) stepElement(1); else if (input.wheel < 0) stepElement(-1);
      const ok = canCast();
      if (!ok && charging) endCharge(false);
      if (ok) {
        if (input.mouseDown(0) && !charging) {
          const id = spellId(api.element, 'basic');
          if (!SPELLS[id]) { /* new element in legacy input: no legacy def */ }
          else if (cooldowns[id] <= 0) {
            if (mp() >= SPELLS[id].mp) cast(api.element, 'basic');
            else if (input.mousePressed(0)) { game.events.emit('spellFail', { reason: 'mana', spellId: id }); S.sfx('mana_empty'); }
          } else if (input.mousePressed(0) && cooldowns[id] > 0.15) game.events.emit('spellFail', { reason: 'cooldown', spellId: id });
        }
        if (input.mousePressed(2)) startCharge();
        if (charging) {
          const def = SPELLS[spellId(chargeEl, 'heavy')] || { chargeTime: 1 };
          const before = chargeFrac;
          chargeFrac = Math.min(1, chargeFrac + dt * cs / (def.chargeTime || 1));
          if (before < 1 && chargeFrac >= 1) { S.sfx('ui_select', { pitch: 1.5 }); S.vfx('burst', game.player?.getStaffTip ? game.player.getStaffTip(tmp) : S.playerPos(), { count: 16, color: [ELEMENT_COLORS[chargeEl], GLINT], shape: 'spark', speed: 4, spread: 1, size: 0.1, life: 0.35, drag: 2 }); }
          try { player()?.setCharging?.(true, chargeEl, chargeFrac); } catch (_) { /* */ }
          S.props.setCharge(true, ELEMENT_COLORS[chargeEl], chargeFrac, dt);
          if (!input.mouseDown(2)) endCharge(true);
        }
        // F (legacy keymap only): the ultimate when nothing interactable is offered (F is interact, CONTRACT §3.3/§6)
        if (input.pressed('KeyF') && legacyKeymap() && !game.interact?.current?.()) cast(api.element, 'ultimate');
        if (isMaster()) {
          const mel = prog().element;
          if (input.pressed('KeyR')) finisher(mel);
          if (input.pressed('KeyG')) cast(mel, 'support');
        }
      }
    } else if (charging) endCharge(false);

    S.projectiles.update(dt);
    S.zones.update(dt);
    S.props.update(dt);
    S.support.update(dt, realDt || dt);
    S.setPieces.update(realDt || dt);
    // v3 runtime
    objects.update(dt);
    zones2.update(dt);
    v3api.update(dt);
    summons.update(dt);
    structures.update(dt);
    arch.update(dt);
  }

  /** Boot pre-warm (main.js): every pooled v3 visual is made visible for the compile; the first update hides idle ones. */
  function prewarm() {
    try { objects.prewarm(); zones2.prewarm(); summons.prewarm(); structures.prewarm(); arch.prewarm(); } catch (err) { console.warn('[spells] prewarm', err); }
    warmed = false;
    try { L.warmStats = L.warmup(); } catch (err) { console.warn('[spells] look warm-up', err); }
    // v4: pooled rune circles are not in the scene until used: hand them to the boot compile + warm draw (main removes them again)
    const out = [];
    for (const s of S.props.sigilPool || []) if (!s.parent) { s.visible = true; s.scale.setScalar(1); out.push(s); }
    return out.length ? out : null;
  }

  // Compile all spell shaders up-front (avoids a hitch on the first cast of each spell).
  function warmup() {
    const g = new THREE.Group();
    try {
      S.projectiles.warm(g); S.zones.warm(g); game.combat._warm?.(g); S.setPieces.warm(g); S.support.warm(g);
      g.position.copy(game.camera.position).add(new THREE.Vector3(0, -500, 0));
      game.scene.add(g);
      S.props.chargeGroup.visible = true;
      game.renderer.compile(game.scene, game.camera);
      S.props.chargeGroup.visible = false;
    } catch (err) { console.warn('[spells] warmup', err); }
    game.scene.remove(g); S.props.chargeGroup.visible = false;
    try { S.projectiles.unwarm(g); S.zones.unwarm(g); S.setPieces.unwarm(g); S.support.unwarm(g); } catch (_) { /* */ }
  }

  /** classChosen / (deprecated) pathChosen: reset the legacy element + cooldowns; never emits in the v3 keymap. */
  function onPath(p) {
    if (charging) endCharge(false);
    const cls = p?.cls ?? prog()?.cls;
    if (familyOf(cls) !== 'caster') { S.support.stop(true); return; }
    const pe = p?.element ?? prog()?.element;
    const want = (p?.path ?? prog()?.path) === 'master' && pe ? elements.indexOf(pe) : unlocked(api.element) ? index : 0;
    setElement(Math.max(0, want), legacyInput() ? true : { silent: true });
    for (const id in cooldowns) cooldowns[id] = 0;
  }
  function clearV3() {
    try { objects.despawnAll(); zones2.clear(); summons.despawnSkill(null); structures.clear(); arch.clear(); } catch (err) { console.warn('[spells] clear', err); }
  }

  const api = {
    elements, index, element: elements[0],
    SPELLS: ALL,
    getHudState, update,
    init() {
      if (isActive()) { try { player()?.setStaffElement?.(api.element); } catch (_) { /* */ } }
      warmup();
      game.events.on('stateChange', (p) => { if (p.state !== 'playing' && charging) endCharge(false); if (p.state === 'title') clearV3(); });
      game.events.on('playerDeath', () => { endCharge(false); S.support.stop(true); });
      game.events.on('pathChosen', onPath);
      game.events.on('classChosen', onPath);
      game.events.on('respec', () => { summons.despawnSkill(null); });
      // 얼음 갑옷: melee attackers that hit (or are blocked by) the player get frozen
      const onHitPlayer = (p) => { if (p?.target && p.target === player()?.entity && p.source && typeof p.source === 'object') S.support.onPlayerHit(p.source); };
      game.events.on('damage', onHitPlayer);
      game.events.on('blocked', onHitPlayer);
      const pr = prog();
      if (pr?.chosen) onPath({ cls: pr.cls, path: pr.path, element: pr.element });
    },
    // extras (used by combat reactions, tests, other modules optionally)
    cast, castById, setElement, finisher: (el, opts) => finisher(el || prog()?.element || api.element, opts),
    api: v3api, prewarm, despawnSummon: (id) => v3api.despawnSummon(id),
    get registered() { return { archetypes: nArch, impls: nImpl }; },
    isActive: () => isActive(),
    support: (el, opts) => cast(el || prog()?.element || api.element, 'support', opts),
    get active() { return isActive(); },
    get finisherActive() { return !!fin || bespoke.finisherActive; },
    get supportActive() { return S.support.active; },
    spawnZone: (type, pos, opts) => S.zones.spawn(type, pos, opts),
    get zones() { return S.zones.zones; },
    get projectiles() { return S.projectiles.active; },
    get charging() { return charging; }, get chargeFrac() { return chargeFrac; },
    resetCooldowns() { for (const id in cooldowns) cooldowns[id] = 0; },
    /** v4 (§7.4.7): declared caster look level of a registry skill ('bespoke'|'archetype'|'generic'|'legacy'|null). */
    lookOf: (id) => L.lookOf(id),
    /** v4 (§7.4.7): seconds of non-cancellable cast recovery (0 when free) — read by the player's dodge buffer. */
    get castLock() { return fin ? Math.max(0.05, L.castLock()) : L.castLock(); },
    looks: L,
    /** Test hook (playtest4 magic): remove every live spell visual / zone / object / summon / projectile. */
    clearFx() {
      clearV3();
      try { S.zones.clear?.(); S.projectiles.clear?.(); S.support.stop?.(true); S.props.clear?.(); timers.length = 0; realTimers.length = 0; } catch (err) { console.warn('[spells] clearFx', err); }
      try { game.vfx?.kit?.clear?.(); game.vfx?.clear?.(); } catch (_) { /* */ }
    },
    _S: S,
  };
  return api;
}
