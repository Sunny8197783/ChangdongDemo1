// Bespoke CASTER forms (CONTRACT §11): the new-element ultimates and awakened ultimates, nature.treant visuals, the
// redesigned ice.sup / earth.sup, and the four new-element finishers (through game.cinematic.finisher, all 9 elements).
// Registered with game.archetypes.registerImpl(id, 'caster', fn) in the spells factory. They reuse the archetype engine
// (spells/archetypes.js) for hits, movers and VFX, and pass UNSCALED base damage (§8.3). skills emits skillCast/spellCast.
import * as THREE from 'three';
import { glint, GLINT } from './palette.js';
import { elColor } from '../core/elements.js';

const OPTIONAL_FX = new Set(['groundDecal', 'runeCircle', 'flashSprite', 'dome', 'debris']);

const FINISHER_NAMES = { water: '심해의 노래', nature: '영원의 숲', light: '여명의 날개', shadow: '까마귀 군주' };

export function createBespoke(S, api, AR, { summons }) {
  const { game } = S;
  const E = game.events;
  // effectQuality 'low' drops the secondary visuals (decals, rune circles, flares, domes, debris): ≤ 10 extra calls per cast (§23)
  const fx = (n, ...a) => { if (OPTIONAL_FX.has(n) && game.settings?.values?.effectQuality === 'low') return null; try { return S.looks ? S.looks.fx(n, a) : game.vfx?.[n]?.(...a); } catch (_) { return null; } };
  const pl = () => game.player;
  const ppos = () => pl()?.object?.position || S.playerPos();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const A = AR.A;
  const P = (ctx) => ctx.params || {};

  /** Shared ultimate anticipation: slow-mo beat, FOV kick, sigils under the caster, a rising flare. */
  function ultIntro(ctx, aw = false) {
    const el = ctx.element, col = elColor(el, 'mid');
    const pp = ppos();
    try { game.timeScale?.set?.('ult', aw ? 0.3 : 0.4, aw ? 0.35 : 0.2); } catch (_) { /* */ }
    fx('screenFlash', col, aw ? 0.22 : 0.12, aw ? 0.4 : 0.25);
    fx('fovKick', aw ? -6 : -4, aw ? 0.4 : 0.3);
    try { game.post?.pulse?.(aw ? 0.5 : 0.3, 0.3); } catch (_) { /* */ }
    const fp = v1.set(pp.x, S.height(pp.x, pp.z) + 0.05, pp.z).clone();
    S.props.sigil(fp, { color: col, radius: aw ? 3.4 : 2.2, duration: aw ? 0.9 : 0.6, spin: 3 });
    if (aw) {
      S.props.sigil(fp, { color: GLINT, radius: 1.6, duration: 0.9, spin: -4 });
      fx('shockwave', fp.clone().setY(fp.y + 1), { color: col, radius: 3, duration: 0.45, vertical: true, thickness: 0.3 });
    }
    fx('burst', fp.clone().setY(fp.y + 1), { count: aw ? 60 : 30, shape: AR.shape(el), color: [elColor(el, 'core'), col], speed: 8, spread: 1, size: 0.16, life: 0.5, drag: 2 });
    S.sfx('charge', { position: fp, pitch: aw ? 1.1 : 1.4 });
  }
  const awk = (ctx) => /\.awakened$/.test(ctx.skillId || '') || !!ctx.awakened;

  const IMPL = {};

  // ---------------- water ----------------
  /** 대홍수: floods r 14 for 10 s (everyone inside wet; lightning + ice reactions +40%); 3 waves × 40. */
  IMPL['water.ult'] = (ctx) => {
    ultIntro(ctx);
    const p = P(ctx), pp = ppos();
    const at = new THREE.Vector3(pp.x, S.height(pp.x, pp.z), pp.z);
    const hit = AR.H(ctx, { tier: 'ult' });
    S.later(0.18, () => {
      api.zones.spawn('flood', at, { r: p.r || 14, dur: p.dur || 10, hit, params: { waves: p.waves || 3, every: p.every || 3, dmg: p.dmg || 40, rxBonus: p.rxBonus || { lightning: 1.4, ice: 1.4 } }, source: hit.source });
      // the rising tide: a ring of geysers around the caster
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = (p.r || 14) * 0.85;
        v1.set(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r); v1.y = S.height(v1.x, v1.z);
        fx('burst', v1, { count: 14, shape: 'droplet', color: [glint(0x4fb4ff), 0x4fb4ff], dir: v2.set(0, 1, 0), spread: 0.15, speed: 12, size: 0.25, life: 0.9, gravity: 12 });
      }
      fx('shake', 0.35);
      S.sfx('explode_water', { position: at });
    });
    return true;
  };
  /** 대해일 · 각성: 3 tsunami waves × 90 rolling forward 22 m; puddles stay 30 s. */
  IMPL['water.awakened'] = (ctx) => {
    ultIntro(ctx, true);
    const p = P(ctx), pp = ppos(), dir = AR.fwd(ctx, new THREE.Vector3());
    const n = p.n || 3, hit = AR.H(ctx, { tier: 'ult', knockback: 8 });
    for (let w = 0; w < n; w++) {
      S.later(0.2 + w * (p.every || 0.8), () => {
        const seen = new Set();
        const start = ppos().clone();
        const side = new THREE.Vector3(dir.z, 0, -dir.x);
        let d = 0;
        const step = () => {
          d += 2.2;
          const c = start.clone().addScaledVector(dir, d); c.y = S.height(c.x, c.z);
          const a = c.clone().addScaledVector(side, -(p.r || 7)), b = c.clone().addScaledVector(side, p.r || 7);
          api.line(a, b, 2.6, hit, { seen, element: 'water' });
          fx('burst', c.clone().setY(c.y + 0.4), { count: 26, shape: 'droplet', color: [glint(0x4fb4ff), 0x4fb4ff], disc: false, radius: p.r || 7, dir: v2.set(dir.x, 1.2, dir.z), spread: 0.25, speed: 8, size: 0.26, life: 0.7, gravity: 12 });
          fx('burst', c.clone().setY(c.y + 1.6), { count: 6, shape: 'puff', color: [glint(0xbfeaff), 0xbfeaff], alpha: 0.5, additive: false, radius: (p.r || 7) * 0.8, speed: 2, up: 1, size: 1.4, sizeEnd: 2.4, life: 0.6 });
          if (d % 6.6 < 2.3) api.zones.spawn('water', c, { radius: p.puddle?.r || 4, duration: p.puddle?.dur || 30 });
          if (d < 22) S.later(0.06, step);
        };
        step();
        S.sfx('explode_water', { position: start, pitch: 0.8 + w * 0.1 });
        fx('shake', 0.3);
      });
    }
    return true;
  };

  // ---------------- nature ----------------
  /** 세계수의 분노: giant roots erupt in a ring out to 12 m, 6 × 50, root 2 s, seeds everything. */
  IMPL['nature.ult'] = (ctx) => {
    ultIntro(ctx);
    const p = P(ctx);
    S.later(0.15, () => A.rain(Object.assign({}, ctx, { params: Object.assign({ ring: 12, n: 6, every: 0.18 }, p) })));
    const pp = ppos();
    fx('groundDecal', 'flowers', v1.set(pp.x, S.height(pp.x, pp.z), pp.z).clone(), 8, 10);
    api.terrain.regrow(pp, 12);
    return true;
  };
  /** 세계수 강림 · 각성: a giant sapling erupts and makes a 12 s zone r 10 (roots, seeds, heals 2%/s). */
  IMPL['nature.awakened'] = (ctx) => {
    ultIntro(ctx, true);
    const p = P(ctx), at = AR.aimPoint(ctx, 16, new THREE.Vector3()).clone();
    const hit = AR.H(ctx, { tier: 'ult' });
    fx('telegraph', { shape: 'circle', pos: at.clone(), r: p.r || 10, dur: 0.4, color: 'damage' });
    S.later(0.3, () => {
      // the sapling: a spiral of erupting root pillars + a canopy burst
      for (let i = 0; i < 14; i++) {
        const a = i * 0.9, r = 0.4 + i * 0.1;
        S.props.pillars.spawn(at.x + Math.cos(a) * r, S.height(at.x, at.z) - 0.3, at.z + Math.sin(a) * r, { height: 5 + i * 0.35, width: 0.6 + (14 - i) * 0.04, delay: i * 0.025, hold: (p.dur || 12) - 1, tiltX: Math.cos(a) * 0.18, tiltZ: Math.sin(a) * 0.18 });
      }
      fx('burst', at.clone().setY(at.y + 7), { count: 120, shape: 'leaf', color: [0xd8ff9a, 0x3f8a2a], radius: 3, speed: 4, up: 1, size: 0.35, life: 1.6, gravity: 2 });
      fx('burst', at.clone().setY(at.y + 7), { count: 60, shape: 'petal', color: [0xffd6f0, 0xf4ffd0], radius: 3, speed: 3, size: 0.3, life: 2, gravity: 1 });
      api.aoe(at.clone().setY(at.y + 1), p.r || 10, Object.assign({}, hit, { amount: p.dmg || 60 }));
      api.zones.spawn('overgrowth', at, { r: p.r || 10, dur: p.dur || 12, hit, params: { tick: p.tick || 20, every: p.every || 0.5, healPct: p.healPct || 0.02, rootEvery: 3, seedPerSec: 1 }, source: hit.source });
      AR.impactFx('nature', at.clone().setY(at.y + 1.5), 2.2, true);
      fx('shockwave', at.clone().setY(at.y + 0.2), { color: 0x8fe05a, radius: (p.r || 10) + 2, duration: 0.8, thickness: 1.4 });
      fx('shake', 0.5);
      S.sfx('explode_nature', { position: at });
    });
    return true;
  };
  /** 나무정령 소환: the treant ally (summon visuals + AI in spells/summons.js). */
  IMPL['nature.treant'] = (ctx) => {
    const r = A.summon(Object.assign({}, ctx, { params: Object.assign({ kind: 'treant' }, P(ctx)) }));
    const pp = ppos();
    fx('burst', v1.copy(pp).setY(pp.y + 1).clone(), { count: 24, shape: 'leaf', color: [0xd8ff9a, 0x4f9e3a], radius: 1, speed: 3, up: 2, size: 0.25, life: 0.8, gravity: 3 });
    return r;
  };

  // ---------------- light ----------------
  /** 새벽의 심판: a huge prism beam, 30 m for 2.5 s, sweepable; refracts through ice and crystals. */
  IMPL['light.ult'] = (ctx) => {
    ultIntro(ctx);
    const pp = ppos();
    fx('runeCircle', v1.set(pp.x, S.height(pp.x, pp.z), pp.z).clone(), { element: 'light', r: 2.4, dur: (P(ctx).dur || 2.5) + 0.4, rotSpeed: 2 });
    S.later(0.15, () => A.beam(ctx));
    return true;
  };
  /** 아스트라의 빛 · 각성: a three-beam gigaflare + sky lances on the struck ground. */
  IMPL['light.awakened'] = (ctx) => {
    ultIntro(ctx, true);
    const p = P(ctx);
    S.later(0.2, () => A.beam(Object.assign({}, ctx, { params: Object.assign({ beams: 3 }, p) })));
    const at = AR.aimPoint(ctx, 26, new THREE.Vector3()).clone();
    for (let i = 0; i < 5; i++) S.later(0.4 + i * 0.35, () => {
      const a = Math.random() * 6.28, r = Math.random() * 6;
      const q = new THREE.Vector3(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r); q.y = S.height(q.x, q.z);
      AR.strikeAt(ctx, 'light', q, 3, AR.H(ctx, { amount: (p.dmg || 24) * 2, tier: 'heavy', tags: ['heavy'] }), {});
    });
    return true;
  };

  // ---------------- shadow ----------------
  function blackHole(ctx, at, p, hit, delay = 0) {
    S.later(delay, () => {
      fx('telegraph', { shape: 'circle', pos: at.clone(), r: p.r || 8, dur: p.dur || 3, color: 'void' });
      api.zones.spawn('blackhole', at, { r: p.r || 8, dur: p.dur || 3, hit, params: { implode: p.implode || { dmg: p.dmg || 150, r: p.r || 8 } }, source: hit.source });
      S.sfx('cast_shadow', { position: at, pitch: 0.6 });
    });
  }
  /** 어둠의 심연: a black hole r 8 pulls for 3 s, then implodes for 150 + corroded +5. */
  IMPL['shadow.ult'] = (ctx) => {
    ultIntro(ctx);
    const at = AR.aimPoint(ctx, 22, new THREE.Vector3()).clone();
    blackHole(ctx, at, P(ctx), AR.H(ctx, { tier: 'ult' }), 0.15);
    return true;
  };
  /** 영겁의 밤 · 각성: 3 black holes in sequence. */
  IMPL['shadow.awakened'] = (ctx) => {
    ultIntro(ctx, true);
    const p = P(ctx), at = AR.aimPoint(ctx, 22, new THREE.Vector3()).clone(), dir = AR.fwd(ctx, new THREE.Vector3());
    const hit = AR.H(ctx, { tier: 'ult' });
    const n = p.count || 3;
    for (let i = 0; i < n; i++) {
      const q = at.clone().addScaledVector(dir, (i - 1) * 5); q.y = S.height(q.x, q.z);
      blackHole(ctx, q, p, hit, 0.15 + i * (p.every || 1.2));
    }
    return true;
  };

  // ---------------- redesigned legacy supports ----------------
  /** 서리 반격 (ice.sup): 8 s, the next 3 hits taken are −60% and freeze the attacker (rider in skills/procs on buff:ice.sup). */
  IMPL['ice.sup'] = (ctx) => {
    const r = A.buff(ctx);
    const pp = ppos();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; S.props.spikes.spawn(pp.x + Math.cos(a) * 1.3, S.height(pp.x, pp.z) - 0.2, pp.z + Math.sin(a) * 1.3, { height: 1.4, width: 0.5, hold: 0.6, tiltX: Math.cos(a) * 0.5, tiltZ: Math.sin(a) * 0.5, delay: i * 0.02 }); }
    return r;
  };
  /** 도발의 석상 (earth.sup): a taunting stone totem that blocks projectiles and erupts when destroyed. */
  IMPL['earth.sup'] = (ctx) => A.summon(Object.assign({}, ctx, { params: Object.assign({ kind: 'totem', taunt: true }, P(ctx)) }));

  // ---------------- new-element finishers (cinematic for all 9 elements, §16) ----------------
  let finActive = null;
  function finisher(ctx) {
    const el = ctx.element;
    if (finActive) return false;
    const p = P(ctx);
    const target = AR.targetOf(ctx, 26);
    const center = target ? target.object.position.clone() : AR.aimPoint(ctx, 18, new THREE.Vector3()).clone();
    center.y = S.height(center.x, center.z);
    const ent = pl()?.entity;
    const wasInv = !!ent?.invulnerable;
    if (ent) ent.invulnerable = true;
    const F = finActive = { el, impacted: false, ended: false };
    const name = ctx.def?.nameKo || FINISHER_NAMES[el] || '필살기';
    E.emit('finisherStart', { element: el, name, cls: game.progression?.cls });
    S.props.sigil(v1.set(ppos().x, S.height(ppos().x, ppos().z) + 0.05, ppos().z).clone(), { color: elColor(el, 'mid'), radius: 3.2, duration: 3.5, spin: 1.5 });
    S.sfx('finisher_charge', { position: ppos() });
    const impact = () => {
      if (F.impacted) return; F.impacted = true;
      try { setPiece(ctx, el, center, p); } catch (err) { console.warn('[spells.bespoke] finisher', err); }
      E.emit('finisherImpact', { element: el, point: center.clone() });
      S.sfx('finisher_impact', { position: center });
    };
    const end = () => {
      if (F.ended) return; impact(); F.ended = true;
      S.laterReal(0.45, () => { if (ent && !wasInv) ent.invulnerable = false; if (finActive === F) finActive = null; });
    };
    const cin = game.cinematic;
    let used = false;
    if (cin?.finisher && !(game.stubbed || []).includes('cinematic')) {
      try { cin.finisher({ cls: game.progression?.cls, element: el, name, target, center: center.clone(), skillId: ctx.skillId, onBuildup: () => {}, onImpact: impact, onEnd: end }); used = true; }
      catch (err) { console.warn('[spells.bespoke] cinematic.finisher', err); }
    }
    if (!used) {
      try { game.timeScale?.set?.('ult', 0.3, 2.2); } catch (_) { /* */ }
      fx('screenFlash', elColor(el, 'mid'), 0.25, 0.8); fx('fovKick', -7, 1.6);
      S.laterReal(1.9, impact); S.laterReal(2.6, end);
    }
    S.laterReal(8, impact); S.laterReal(11, end);   // safety net if a cinematic never calls back
    return true;
  }
  function setPiece(ctx, el, c, p) {
    const R = p.r || 12;
    const hit = AR.H(ctx, { amount: p.dmg || 400, tier: 'ult', finisher: true, tags: ['finisher', 'heavy'] });
    const top = c.clone().setY(c.y + 1);
    if (el === 'water') {   // 심해의 노래: a water leviathan bursts from the ground
      for (let i = 0; i < 3; i++) fx('shockwave', top.clone(), { color: 0x7fd3ff, radius: R * (0.5 + i * 0.25), duration: 0.6 + i * 0.2, thickness: 1.5 });
      fx('burst', top, { count: 200, shape: 'droplet', color: [glint(0x1f6fb8), 0x1f6fb8], dir: new THREE.Vector3(0, 1, 0), spread: 0.25, speed: 26, size: 0.4, life: 1.6, gravity: 14 });
      fx('burst', top.clone().setY(top.y + 8), { count: 40, shape: 'puff', color: [glint(0xbfeaff), 0xbfeaff], alpha: 0.6, additive: false, radius: 4, speed: 3, size: 2.4, sizeEnd: 4, life: 1.4 });
      api.zones.spawn('flood', c, { r: R, dur: 6, params: { waves: 0, rxBonus: { lightning: 1.4, ice: 1.4 } } });
    } else if (el === 'nature') {   // 영원의 숲: a forest rises in rings
      for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + ring * 0.3, r = R * (0.3 + ring * 0.3);
        S.props.pillars.spawn(c.x + Math.cos(a) * r, S.height(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) - 0.3, c.z + Math.sin(a) * r, { height: 4 + ring * 1.5, width: 0.8, delay: ring * 0.12 + i * 0.01, hold: 2.5 });
      }
      fx('burst', top.clone().setY(top.y + 4), { count: 160, shape: 'leaf', color: [0xd8ff9a, 0x2f7d3a], radius: R * 0.6, speed: 3, size: 0.4, life: 2.2, gravity: 1.5 });
      api.zones.spawn('overgrowth', c, { r: R * 0.8, dur: 10, params: { healPct: 0.02 } });
    } else if (el === 'light') {   // 여명의 날개: six winged beams fall from the sky
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, r = R * 0.45;
        const q = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r); q.y = S.height(q.x, q.z);
        S.later(i * 0.06, () => fx('beam', q.clone().setY(q.y + 30), q.clone(), { color: 0xffe9a8, width: 1.6, duration: 0.8, jagged: 0.02, segments: 4 }));
      }
      fx('beam', top.clone().setY(top.y + 40), top.clone(), { color: GLINT, width: 3.2, duration: 1.0, jagged: 0.01, segments: 4 });
      fx('burst', top, { count: 160, shape: 'feather', color: [glint(0xffe08a), 0xffe08a], radius: 2, speed: 14, spread: 1, size: 0.45, life: 1.6, drag: 1.5 });
      api.zones.spawn('holy', c, { r: R * 0.6, dur: 8, params: { healPct: 0.02, radiantPerSec: 1 } });
    } else {   // 까마귀 군주: a raven-winged knight descends — raven storm + a void implosion
      fx('burst', top.clone().setY(top.y + 6), { count: 120, shape: 'raven', color: [0x2a1040, 0x9a5cff], radius: 3, speed: 16, spread: 1, size: 0.6, life: 1.4, drag: 1 });
      fx('burst', top, { count: 120, shape: 'wisp', color: [0xe0c8ff, 0x5b2a8a], radius: R, inward: true, speed: R * 2, size: 0.4, life: 0.6 });
      api.zones.spawn('miasma', c, { r: R * 0.6, dur: 6 });
    }
    api.aoe(top, R, hit);
    AR.impactFx(el, top, 3, true);
    fx('shake', 0.7);
    try { game.post?.pulse?.(0.7, 0.5); } catch (_) { /* */ }
    try { game.cinematic?.burstAt?.(top, el); } catch (_) { /* */ }
  }
  for (const el of ['water', 'nature', 'light', 'shadow']) IMPL[el + '.finisher'] = (ctx) => finisher(ctx);

  function register() {
    const R = game.archetypes;
    let n = 0;
    for (const id in IMPL) {
      const impl = IMPL[id], L = S.looks;
      const fn = (ctx) => {
        const prev = L ? L.begin({ castId: ctx.castId, skillId: ctx.skillId || id, el: ctx.element, style: ctx.style, family: ctx.family }) : null;
        try { return impl(ctx); } finally { if (L) L.end(prev); }
      };
      try { (R?.registerImpl || game.skills?.registerImpl)?.call(R || game.skills, id, 'caster', fn); n++; } catch (err) { console.warn('[spells.bespoke] register ' + id, err); }
    }
    return n;
  }
  return { IMPL, register, get finisherActive() { return !!finActive; }, finisher, ultIntro };
}
