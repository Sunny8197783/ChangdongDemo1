// Spells: casting input, cooldowns, projectiles, zones and zone fusions.
import * as THREE from 'three';
import { ELEMENT_COLORS, ELEMENT_NAMES_KO, ELEMENTS } from './core/utils.js';
import { uTime } from './spells/assets.js';
import { createProps } from './spells/props.js';
import { createProjectiles } from './spells/projectiles.js';
import { createZones } from './spells/zones.js';
import { SPELLS, SLOT_KINDS } from './spells/defs.js';

const MIN_CHARGE = 0.25;

export function createSpells(game) {
  const elements = ELEMENTS.slice();
  let index = 0;
  const cooldowns = {};
  for (const id in SPELLS) cooldowns[id] = 0;
  let charging = false, chargeFrac = 0, chargeEl = null;
  const timers = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ---------- shared context for spell implementations ----------
  const S = {
    game,
    get combat() { return game.combat; },
    STATUS_OF: { fire: 'burning', ice: 'chilled', lightning: 'shocked', wind: null, earth: null },
    vfx(fn, ...a) { try { return game.vfx?.[fn]?.(...a); } catch (e) { if (!S._vfxErr) { S._vfxErr = 1; console.warn('[spells] vfx.' + fn, e); } return null; } },
    sfx(name, opts) { try { game.audio?.play?.(name, opts); } catch (_) { /* */ } },
    height(x, z) { try { const h = game.world?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; } catch (_) { return 0; } },
    ground(p, out = tmp2) { out.set(p.x, S.height(p.x, p.z), p.z); return out; },
    center(e, out = new THREE.Vector3()) { return game.combat.getCenter ? game.combat.getCenter(e, out) : out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) / 2); },
    playerPos() { return game.player?.object?.position || game.player?.entity?.object?.position || tmp.set(0, 0, 0); },
    later(t, fn) { timers.push({ t, fn }); },
    combo(id, name, point) {
      try { game.combat.discover ? game.combat.discover(id) : game.combat.discovered?.add(id); } catch (_) { /* */ }
      game.events.emit('zoneCombo', { id, name, point: point.clone() });
    },
    /** Damage all enemies within r of point (except `except`); makeHit(e, dist) returns partial hit or null. */
    aoe(point, r, except, makeHit) {
      const list = game.combat.queryRadius(point, r, 'enemy');
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
        game.combat.dealDamage(e, { source: 'player', point: c, direction: dir, ...h, amount: Math.round(h.amount) });
      }
    },
    nearestEnemy(p, r, exclude) {
      let best = null, bd = r * r;
      for (const e of game.entities) {
        if (!e.alive || e.team !== 'enemy' || !e.object || exclude.includes(e)) continue;
        const d = e.object.position.distanceToSquared(p);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
  };
  S.props = createProps(game);
  S.projectiles = createProjectiles(S);
  S.zones = createZones(S);

  const spellId = (el, kind) => `${el}_${kind}`;
  const player = () => game.player;
  const mp = () => player()?.mp ?? 0;

  function canCast() {
    const p = player(); if (!p) return false;
    const e = p.entity;
    if (e && (!e.alive)) return false;
    try { if (e && game.combat.canAct && !game.combat.canAct(e)) return false; } catch (_) { /* */ }
    return true;
  }

  function setElement(i) {
    i = ((i % elements.length) + elements.length) % elements.length;
    if (i === index) return;
    if (charging) endCharge(false);
    index = i;
    api.element = elements[index]; api.index = index;
    try { player()?.setStaffElement?.(api.element); } catch (_) { /* */ }
    S.sfx('ui_select');
    game.events.emit('elementChanged', { element: api.element, index });
  }

  /** Cast a spell. opts: {charge, aim, free (ignore cost/cd)}. Returns true on success. */
  function cast(el, kind, opts = {}) {
    const id = spellId(el, kind), def = SPELLS[id];
    if (!def) return false;
    if (!opts.free) {
      if (cooldowns[id] > 0) { game.events.emit('spellFail', { reason: 'cooldown', spellId: id }); return false; }
      const p = player();
      if (p?.spendMp && !p.spendMp(def.mp)) { game.events.emit('spellFail', { reason: 'mana', spellId: id }); S.sfx('mana_empty'); return false; }
    }
    let aim = opts.aim;
    if (!aim) { try { aim = player().getAim(); } catch (_) { aim = null; } }
    if (!aim) {
      const o = S.playerPos().clone().add(new THREE.Vector3(0, 1.6, 0));
      const d = new THREE.Vector3(); game.camera.getWorldDirection(d);
      aim = { origin: o, dir: d, point: o.clone().addScaledVector(d, 40), target: null };
    }
    S.aimDirFlat = aim.dir;
    cooldowns[id] = def.cd;
    try { player()?.playCast?.(kind, el); } catch (_) { /* */ }
    S.sfx('cast_' + el, { position: aim.origin, volume: kind === 'basic' ? 0.7 : 1 });
    const chargeV = Math.max(MIN_CHARGE, Math.min(1, opts.charge ?? 1));
    const doCast = () => { try { def.cast(S, aim, chargeV); } catch (err) { console.error('[spells] cast ' + id, err); } };
    if (kind === 'ultimate') {
      // shared anticipation beat: brief slow-mo, zoom-in, sigil at the caster's feet, rising charge sound
      S.vfx('screenFlash', ELEMENT_COLORS[el], 0.12, 0.25); S.vfx('flash', aim.origin, { color: ELEMENT_COLORS[el], intensity: 6, distance: 10, duration: 0.4 });
      try { game.slowmo(0.4, 0.2); } catch (_) { /* */ }
      S.vfx('fovKick', -4, 0.3);
      try { const fp = S.playerPos().clone(); fp.y = S.height(fp.x, fp.z) + 0.05; S.props.sigil(fp, { color: ELEMENT_COLORS[el], radius: 2.2, duration: 0.6, spin: 3 }); } catch (_) { /* */ }
      S.sfx('charge', { position: aim.origin, pitch: 1.4 });
      S.later(0.1, doCast);
    } else doCast();
    game.events.emit('spellCast', { element: el, kind, spellId: id, origin: aim.origin.clone() });
    return true;
  }

  function startCharge() {
    const id = spellId(api.element, 'heavy');
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

  // ---------- HUD ----------
  const hud = {
    element: elements[0], index: 0,
    elements: elements.map((id) => ({ id, name: ELEMENT_NAMES_KO[id], color: ELEMENT_COLORS[id] })),
    slots: SLOT_KINDS.map((kind) => ({ kind, name: '', desc: '', mpCost: 0, cooldown: 0, cooldownLeft: 0, ready: true, id: '' })),
    charging: false, chargeFrac: 0,
  };
  function getHudState() {
    const el = api.element;
    hud.element = el; hud.index = index; hud.charging = charging; hud.chargeFrac = chargeFrac;
    const m = mp();
    for (let i = 0; i < SLOT_KINDS.length; i++) {
      const id = spellId(el, SLOT_KINDS[i]), d = SPELLS[id], s = hud.slots[i];
      s.id = id; s.name = d.name; s.desc = d.desc; s.mpCost = d.mp; s.cooldown = d.cd;
      s.cooldownLeft = Math.max(0, cooldowns[id]); s.ready = s.cooldownLeft <= 0 && m >= d.mp;
    }
    return hud;
  }

  // ---------- update ----------
  function update(dt, realDt) {
    uTime.value += dt;
    for (const id in cooldowns) if (cooldowns[id] > 0) cooldowns[id] -= dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i]; t.t -= dt;
      if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (err) { console.error('[spells] timer', err); } }
    }

    // ---- input ----
    const input = game.input;
    if (game.state === 'playing') {
      for (let i = 0; i < 5; i++) if (input.pressed('Digit' + (i + 1))) setElement(i);
      if (input.wheel > 0) setElement(index + 1); else if (input.wheel < 0) setElement(index - 1);
      const ok = canCast();
      if (!ok && charging) endCharge(false);
      if (ok) {
        if (input.mouseDown(0) && !charging) {
          const id = spellId(api.element, 'basic');
          if (cooldowns[id] <= 0) {
            if (mp() >= SPELLS[id].mp) cast(api.element, 'basic');
            else if (input.mousePressed(0)) { game.events.emit('spellFail', { reason: 'mana', spellId: id }); S.sfx('mana_empty'); }
          } else if (input.mousePressed(0) && cooldowns[id] > 0.15) game.events.emit('spellFail', { reason: 'cooldown', spellId: id });
        }
        if (input.mousePressed(2)) startCharge();
        if (charging) {
          const def = SPELLS[spellId(chargeEl, 'heavy')];
          const before = chargeFrac;
          chargeFrac = Math.min(1, chargeFrac + dt / (def.chargeTime || 1));
          if (before < 1 && chargeFrac >= 1) { S.sfx('ui_select', { pitch: 1.5 }); S.vfx('burst', S.props && game.player?.getStaffTip ? game.player.getStaffTip(new THREE.Vector3()) : S.playerPos(), { count: 16, color: [ELEMENT_COLORS[chargeEl], 0xffffff], shape: 'spark', speed: 4, spread: 1, size: 0.1, life: 0.35, drag: 2 }); }
          try { player()?.setCharging?.(true, chargeEl, chargeFrac); } catch (_) { /* */ }
          S.props.setCharge(true, ELEMENT_COLORS[chargeEl], chargeFrac, dt);
          if (!input.mouseDown(2)) endCharge(true);
        }
        if (input.pressed('KeyF')) cast(api.element, 'ultimate');
      }
    }

    S.projectiles.update(dt);
    S.zones.update(dt);
    S.props.update(dt);
  }

  // Compile all spell shaders up-front (avoids a hitch on the first cast of each spell).
  function warmup() {
    const g = new THREE.Group();
    try {
      S.projectiles.warm(g); S.zones.warm(g); game.combat._warm?.(g);
      g.position.copy(game.camera.position).add(new THREE.Vector3(0, -500, 0));
      game.scene.add(g);
      S.props.chargeGroup.visible = true;
      game.renderer.compile(game.scene, game.camera);
      S.props.chargeGroup.visible = false;
    } catch (err) { console.warn('[spells] warmup', err); }
    game.scene.remove(g); S.props.chargeGroup.visible = false;
    try { S.projectiles.unwarm(g); S.zones.unwarm(g); } catch (_) { /* */ }
  }

  const api = {
    elements, index, element: elements[0],
    SPELLS,
    getHudState, update,
    init() {
      try { player()?.setStaffElement?.(api.element); } catch (_) { /* */ }
      warmup();
      game.events.on('stateChange', (p) => { if (p.state !== 'playing' && charging) endCharge(false); });
      game.events.on('playerDeath', () => endCharge(false));
    },
    // extras (used by combat reactions, tests, other modules optionally)
    cast, setElement,
    spawnZone: (type, pos, opts) => S.zones.spawn(type, pos, opts),
    get zones() { return S.zones.zones; },
    get projectiles() { return S.projectiles.active; },
    get charging() { return charging; }, get chargeFrac() { return chargeFrac; },
    resetCooldowns() { for (const id in cooldowns) cooldowns[id] = 0; },
    _S: S,
  };
  return api;
}
