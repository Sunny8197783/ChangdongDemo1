// Bespoke caster looks (PLAN v4 §3.7 rows) for the bespoke set: the 12 ★ skills, every *.basic / *.charged / *.ult and the skills of the
// starter_mage / starter_ranger / starter_spiritcaller loadouts. Each row's first key shape is its signature (unique inside its element).
// A row overrides hooks of the look engine (looks.js): cast, body, impact, target, zone, crawl, crawlTick, nova, wave, strike, blink, aura,
// spike (ice prop eruption), gate[name] (intercept one legacy vfx call), quiet[name] (drop it). Hooks return undefined to fall through.
// Budgets: the kit facade enforces the tier ceilings of §1.4 (B 4 / C,A 8 / Z 6 / U 12 handles), so every row spends its handles on the
// primary shape first. Gameplay (damage, radii, timings) is untouched. Owner: magic.
import * as THREE from 'three';
import { TAU, rng, qYawTilt, qUp, arcPoints, helixPoints, flatDir } from './motifs/common.js';

export const BESPOKE_IDS = [
  // ★ readability regression list (§1.7)
  'fire.charged', 'ice.nova', 'lightning.ult', 'wind.charged', 'wind.gust', 'water.ult', 'earth.charged', 'earth.ult', 'light.flash', 'light.sanctuary', 'light.ult', 'nature.roots',
  // every basic / charged / ult
  'fire.basic', 'ice.basic', 'lightning.basic', 'wind.basic', 'water.basic', 'earth.basic', 'nature.basic', 'light.basic', 'shadow.basic',
  'ice.charged', 'lightning.charged', 'water.charged', 'nature.charged', 'light.charged', 'shadow.charged',
  'fire.ult', 'ice.ult', 'wind.ult', 'nature.ult', 'shadow.ult',
  // starter loadouts of the caster classes
  'fire.salamander', 'fire.cyclone', 'wind.vortex', 'nature.spore',
];

export function createRows(L) {
  const game = L.game, S = L.S;
  const K = () => L.kit;
  const R = (el) => K().ramp(el);
  // line bodies: the `mid` step where the element's `light` step is pale (ice / lightning / wind light ≈ 0.4 saturation reads grey on grass)
  const PALE = { ice: 1, lightning: 1, wind: 1 };
  const body = (el) => (PALE[el] ? R(el).mid : R(el).light);
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const gp = (p, lift = 0.05) => v3(p.x, S.height(p.x, p.z) + lift, p.z);
  const cid = () => L.cur?.castId || 0;
  const charge = () => { const c = L.cur; return c?.data?.charge ?? 1; };
  const M = (el, kind, spec) => L.motif(el, kind, spec);
  const ring = (el, pos, r, o = {}) => K().line({ shape: 'ring', el, pos, plane: o.plane || 'ground', r, width: o.width ?? 0.04, life: o.life ?? 0.4, tIn: o.tIn ?? 0, tOut: o.tOut ?? 0.25,
    scaleIn: o.scaleIn ?? 'expand', alpha: o.alpha ?? 0.8, color: o.color ?? body(el), spin: o.spin ?? 0, follow: o.follow, followOff: o.followOff });
  const glyph = (el, name, pos, r, o = {}) => K().line({ shape: 'glyph', glyph: name, el, pos, plane: o.plane || 'billboard', r, width: o.width ?? 0.04, life: o.life ?? 0.25, tIn: o.tIn ?? 0.08,
    tOut: o.tOut ?? 0.12, spin: o.spin ?? 1, alpha: o.alpha ?? 0.9, color: o.color ?? R(el).mid, color2: R(el).light, follow: o.follow, followOff: o.followOff });
  const sparks = (el, pos, n, o = {}) => K().spark(pos, el, n, o.dir || null, o);
  const rows = {};
  const def = (ids, row) => { for (const id of [].concat(ids)) rows[id] = Object.assign(rows[id] || {}, row); };
  const tdur = (o) => Math.max(0.3, Math.min(3, (o.dur ?? 0.6) + 0.12));

  // ================================================================================== 화염 fire
  def('fire.basic', {   // B: 3-petal glyph → soft toon flame body + swept tongues + RB → crescent flare (2 frames) + embers
    cast: (o) => { glyph('fire', 'fire', o, 0.32, { life: 0.12, tIn: 0.05, tOut: 0.06, spin: 2 }); return true; },
    body: (p, o) => {
      const s = (o.scale || 1) * (o.mesh === 'arrow' ? 0.8 : 1);
      return [K().mesh(o.mesh === 'arrow' ? 'fire.arrow' : 'fire.comet', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: 0.85 * s, life: Infinity, tIn: 0.12, tOut: 0.1, erode: true }),
        K().ribbon({ follow: p.proxy, width: 0.17 * s, taper: 0.95, life: 0.2, maxLen: 1.2, el: 'fire', tailSat: 0.25 })];
    },
    impact: (pos) => {
      K().line({ shape: 'crescent', el: 'fire', pos, plane: 'billboard', r: 0.8, width: 0.05, life: 0.07, tIn: 0, tOut: 0.04, color: R('fire').light, color2: R('fire').hi, additiveCore: 0.6, rot: (cid() * 0.7) % TAU });
      sparks('fire', pos, 4, { shape: 'ember', gravity: -3, speed: 4, life: 0.35 });
      return true;
    },
  });
  def('fire.charged', {   // C ★: counter-rotating rings at the hand → orb with 4 tongues → shock ring + 8 petals opening + embers → scorch linework
    cast: (o) => {
      const r = 0.3 + 0.4 * charge();
      K().line({ shape: 'dots', n: 12, el: 'fire', pos: o, plane: 'billboard', r, width: 0.03, life: 0.3, tIn: 0.12, tOut: 0.12, spin: -3, alpha: 0.85, color: R('fire').light });
      return true;
    },
    body: (p, o) => [K().mesh('fire.comet', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: Math.min(1.7, 1.1 * (o.scale || 1) + 0.3), life: Infinity, tIn: 0.12, tOut: 0.12, erode: true }),
      K().ribbon({ follow: p.proxy, width: 0.3, taper: 0.9, life: 0.25, maxLen: 2.2, el: 'fire', tailSat: 0.25 })],
    impact: (pos, r) => {
      const g = gp(pos), R2 = Math.max(2, Math.min(6, r * 1.6));
      K().line({ shape: 'rays', n: 8, r2: 0.28, el: 'fire', pos, plane: 'billboard', r: 1.6, width: 0.12, life: 0.4, tIn: 0.2, tOut: 0.18, scaleIn: 'backOut', color: R('fire').mid, color2: R('fire').light, rot: (cid() * 0.37) % TAU });
      ring('fire', g, R2, { width: 0.035, life: 0.35 });
      K().line({ shape: 'star', points: 8, r2: 0.5, el: 'fire', pos: g, plane: 'ground', r: R2 * 0.7, width: 0.06, life: 0.5, tIn: 0.2, tOut: 0.25, scaleIn: 'backOut', color: R('fire').light, color2: R('fire').mid, rot: (cid() * 0.37) % TAU });
      sparks('fire', pos, 12, { shape: 'ember', gravity: -3, speed: 7, life: 0.5 });
      return true;
    },
    zone: (kind, pos, r, life) => [K().decal('scorch', gp(pos), r, Math.min(life, 5), { el: 'fire', alpha: 0.3 }),
      ...[0, 1].map((i) => K().mesh('fire.tongue', { pos: gp(v3(pos.x + Math.cos(i * 3.1 + 0.4) * r * 0.8, 0, pos.z + Math.sin(i * 3.1 + 0.4) * r * 0.8), 0), scale: 0.55, life: Math.min(life, 5), tIn: 0.25, tOut: 0.4, erode: true, spin: 0.6 }))],
    quiet: { shockwave: 1 },
  });
  def('fire.salamander', {   // A: salamander glyph at the feet → crawling head of 3 tongues + instanced tongues along an ember line → erode at the end
    cast: () => { const pp = game.player?.object?.position; if (pp) glyph('fire', 'fire', gp(pp), 0.8, { plane: 'ground', life: 0.3, spin: 1.5 }); return true; },
    crawl: (c) => [
      K().mesh('fire.flame', { follow: c.proxy, pos: c.proxy.position, followOff: v3(0, -0.35, 0), scale: 0.6, life: Infinity, tIn: 0.1, tOut: 0.2, erode: true, spin: 2 }),
      K().mesh('fire.tongue', { follow: c.proxy, pos: c.proxy.position, followOff: v3(0, -0.35, 0), scale: 0.75, life: Infinity, tIn: 0.12, tOut: 0.2, erode: true, spin: -1.5 }),
      K().ribbon({ follow: c.proxy, width: 0.18, taper: 0.8, life: 0.5, maxLen: 1.4, el: 'fire', alpha: 0.7, colors: { head: R('fire').mid, edge: R('fire').dark } }),
    ],
    crawlTick: (c, dt) => {
      c.lookD = (c.lookD ?? 0) + c.speed * dt;
      if (c.lookD >= 2.6) {
        c.lookD = 0;
        K().mesh('fire.flame', { pos: gp(c.pos, 0), scale: 0.42 + ((c.d * 7) % 1) * 0.18, life: 0.55, tIn: 0.08, tOut: 0.4, erode: true, spin: 1 });
        sparks('fire', c.proxy.position, 3, { shape: 'ember', gravity: -3, speed: 3, life: 0.5 });
      }
      return true;
    },
    zone: (kind, pos, r, life) => [K().decal('scorch', gp(pos), r, Math.min(life, 4), { el: 'fire', alpha: 0.28 })],
  });
  def('fire.cyclone', {   // A: 1 m ring with 8 ticks spinning → 3 flame arcs sweep 360° (r 1.5→5) + thin shock ring + tongues on the outer arc
    cast: () => { const pp = game.player?.object?.position; if (pp) K().line({ shape: 'ticks', n: 8, r2: 0.7, el: 'fire', pos: gp(pp), plane: 'ground', r: 1, width: 0.04, life: 0.2, tIn: 0.05, tOut: 0.08, spin: 9, color: R('fire').light }); return true; },
    nova: (el, c, Rr) => {
      const g = gp(c), a0 = (cid() * 0.9) % TAU;
      for (let i = 0; i < 3; i++) K().line({ shape: 'arc', arc: [a0 + i * TAU / 3, a0 + i * TAU / 3 + 2.0], el: 'fire', pos: g, plane: 'ground', r: Rr * (0.45 + i * 0.25), width: 0.09 - i * 0.015,
        life: 0.45 + i * 0.05, tIn: 0.25, tOut: 0.3, scaleIn: 'expand', spin: 9 - i * 1.5, erode: true, color: R('fire').light, color2: R('fire').mid });
      ring('fire', g, Rr, { width: 0.03, life: 0.35 });
      for (let i = 0; i < 3; i++) { const a = a0 + i * TAU / 3 + 1; K().mesh('fire.flame', { pos: gp(v3(c.x + Math.cos(a) * Rr * 0.9, 0, c.z + Math.sin(a) * Rr * 0.9), 0), scale: 0.55, life: 0.5, tIn: 0.12, tOut: 0.3, erode: true, spin: 2 }); }
      sparks('fire', c, 10, { shape: 'ember', gravity: -2, speed: 8, life: 0.45 });
      if (L.cur) L.cur.burst++;
      return true;
    },
  });
  def('fire.ult', {   // U: meteor rune + sky rune → dark strata rock with a flame mantle + RB → flare ring r 7 (2 frames), shock ring, 16 radial petals, embers → crater cracks 6 s
    cast: (o) => { glyph('fire', 'fire', v3(o.x, o.y + 2.2, o.z), 0.8, { life: 0.6, spin: 1.2 }); return true; },
    body: (p, o) => {
      if (o.mesh !== 'meteor' && o.mesh !== 'fireball' && o.mesh !== 'arrow' && o.mesh !== 'wisp') return undefined;
      const big = o.mesh === 'meteor';
      const s = big ? 2.6 : 1.0;
      return [K().mesh('fire.meteor', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: s, life: Infinity, tIn: 0.1, tOut: 0.1, erode: false, spin: 3, spinAxis: v3(1, 0, 0) }),
        K().mesh('fire.comet', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: s * 1.25, life: Infinity, tIn: 0.1, tOut: 0.15, erode: true }),
        K().ribbon({ follow: p.proxy, width: big ? 1.1 : 0.35, taper: 0.9, life: 0.35, maxLen: big ? 9 : 3, el: 'fire', tailSat: 0.2, alpha: 0.75 })];
    },
    impact: (pos) => {
      const g = gp(pos), a0 = (cid() * 0.53) % TAU;
      K().line({ shape: 'ring', el: 'fire', pos: g, plane: 'ground', r: 7, width: 0.12, life: 0.08, tIn: 0, tOut: 0.04, scaleIn: 'linear', color: R('fire').light, color2: R('fire').hi, additiveCore: 0.6 });
      ring('fire', g, 9, { width: 0.05, life: 0.6, tOut: 0.4 });
      K().line({ shape: 'rays', n: 16, r2: 0.25, el: 'fire', pos: g, plane: 'ground', r: 6.5, width: 0.08, life: 0.7, tIn: 0.12, tOut: 0.4, scaleIn: 'backOut', rot: a0, color: R('fire').light, color2: R('fire').mid });
      K().decal('crack', g, 7, 6, { el: 'fire', alpha: 0.3, color: R('fire').light, rot: a0 });
      for (let i = 0; i < 3; i++) { const a = a0 + i * TAU / 3; K().mesh('fire.flame', { pos: gp(v3(g.x + Math.cos(a) * 3.2, 0, g.z + Math.sin(a) * 3.2), 0), scale: 0.8, life: 2.5, tIn: 0.2, tOut: 0.8, erode: true, spin: 1 }); }
      sparks('fire', v3(g.x, g.y + 0.5, g.z), 24, { shape: 'ember', gravity: -4, speed: 12, life: 0.8, dir: v3(0, 1, 0) });
      return true;
    },
    zone: () => [],
    strike: (el, q, Rr) => { K().mesh('fire.comet', { pos: v3(q.x, q.y + 6, q.z), dir: v3(0, -1, 0), scale: 1.4, life: 0.12, tIn: 0, tOut: 0.05, vel: v3(0, -40, 0) }); return true; },
    quiet: { decal: 1, shockwave: 1 },
  });

  // ================================================================================== 빙결 ice
  const prism = (p, s, life, o = {}) => K().mesh(o.stub ? 'ice.stub' : 'ice.prism', { pos: p, quat: qYawTilt(Math.PI / 2 - (o.a || 0), o.lean || 0), scale: s, life, tIn: o.tIn ?? 0.16, tOut: o.tOut ?? Math.min(0.4, life * 0.4), erode: true });
  def('ice.basic', {   // B: 3 FM shards → 6-spoke star (2 frames) + shard debris
    cast: () => true,
    body: (p, o) => [K().mesh(o.mesh === 'arrow' ? 'ice.arrow' : 'ice.shard', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: o.mesh === 'arrow' ? 0.85 : 1.15, life: Infinity, tIn: 0.12, tOut: 0.08, erode: true, spin: 6, spinAxis: v3(0, 0, 1) })],
    impact: (pos) => {
      K().line({ shape: 'star', points: 6, r2: 0.15, el: 'ice', pos, plane: 'billboard', r: 0.5, width: 0.035, life: 0.08, tIn: 0, tOut: 0.04, color: R('ice').mid, color2: R('ice').hi, additiveCore: 0.6, rot: (cid() * 0.61) % TAU });
      sparks('ice', pos, 6, { shape: 'shard', gravity: 9, speed: 4, life: 0.35 });
      return true;
    },
  });
  def('ice.charged', {   // C: shards converge into a lance → long faceted prism lance + edge line → crown of prisms r 1.2 that crack
    cast: (o) => { K().line({ shape: 'star', points: 6, r2: 0.2, el: 'ice', pos: o, plane: 'billboard', r: 0.6, width: 0.025, life: 0.25, tIn: 0.05, tOut: 0.1, scaleIn: 'contract', spin: 1.5, color: R('ice').mid }); return true; },
    body: (p, o) => [K().mesh('ice.lance', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: 0.75 * Math.min(1.3, o.scale || 1), life: Infinity, tIn: 0.12, tOut: 0.1, erode: true }),
      K().ribbon({ follow: p.proxy, width: 0.14, taper: 1, life: 0.18, maxLen: 3, el: 'ice', tailSat: 0.2 })],
    impact: (pos) => {
      const g = gp(pos, 0), a0 = (cid() * 0.61) % TAU;
      for (let i = 0; i < 4; i++) { const a = a0 + i * TAU / 4; prism(v3(g.x + Math.cos(a) * 1.1, g.y, g.z + Math.sin(a) * 1.1), 1.25 + (i % 2) * 0.4, 0.8, { a, lean: 0.45, tIn: 0.14, tOut: 0.35 }); }
      K().decal('frost', gp(pos), 1.6, 0.9, { el: 'ice', alpha: 0.3, rot: a0 });
      sparks('ice', pos, 10, { shape: 'shard', gravity: 9, speed: 6, life: 0.45 });
      return true;
    },
    zone: () => [], spike: () => true,
  });
  def('ice.nova', {   // A ★: hex ground glyph spinning → thin hexagonal ring expanding + prisms in 2 rings (outward-leaning) + frost grid → shatter. No dome.
    cast: () => { const pp = game.player?.object?.position; if (pp) K().line({ shape: 'glyph', glyph: 'frosthex', el: 'ice', pos: gp(pp), plane: 'ground', r: 1, width: 0.03, life: 0.3, tIn: 0.1, tOut: 0.1, spin: 4, color: R('ice').mid }); return true; },
    nova: (el, c, Rr) => {
      if (L.cur?.data.nova) { ring('ice', gp(c), Rr, { width: 0.03, life: 0.35 }); return true; }
      if (L.cur) { L.cur.data.nova = 1; L.cur.burst++; }
      const g = gp(c, 0), a0 = (cid() * 0.523) % TAU;
      K().line({ shape: 'poly', sides: 6, el: 'ice', pos: gp(c), plane: 'ground', r: Rr, width: 0.05, life: 0.45, tIn: 0, tOut: 0.25, scaleIn: 'expand', rot: a0, color: R('ice').mid });
      for (let i = 0; i < 6; i++) { const a = a0 + i * TAU / 6 + (i % 2) * 0.5, rr = (i % 2 ? 0.75 : 0.45) * Rr; prism(v3(g.x + Math.cos(a) * rr, g.y, g.z + Math.sin(a) * rr), i % 2 ? 0.95 : 1.3, 0.65, { a, lean: 0.55, stub: i % 2 === 1, tIn: 0.12 + (i % 2) * 0.06, tOut: 0.3 }); }
      sparks('ice', v3(c.x, c.y, c.z), 12, { shape: 'shard', gravity: 8, speed: 7, life: 0.5 });
      return true;
    },
    gate: { groundDecal: (a) => K().decal('frost', a[1], Math.min(8, a[2] || 4), 1.2, { el: 'ice', alpha: 0.3 }) },
    zone: () => [],
  });
  def('ice.ult', {   // U: keep the ice ult circle → prisms erupt sequentially along the path as a wave front + frost line → shatter in sequence
    cast: () => true,
    spike: (x, y, z, o) => {
      const c = L.cur; if (!c) return false;
      c.data.sp = (c.data.sp || 0) + 1;
      if (c.data.sp % 5 !== 3) return true;              // one prism per row of the wave (the centre spike)
      const h = Math.max(0.8, o.height || 2) * 0.62;
      prism(v3(x, y, z), h, (o.rise || 0.14) + (o.hold || 2) * 0.5 + (o.sink || 0.45), { a: o.yaw || 0, lean: Math.min(0.4, Math.abs(o.tiltX || 0) + Math.abs(o.tiltZ || 0)), tIn: 0.12, tOut: 0.4 });
      return true;
    },
    impact: (pos) => { K().decal('frost', gp(pos), 4, 3, { el: 'ice', alpha: 0.3 }); sparks('ice', pos, 16, { shape: 'shard', gravity: 8, speed: 8, life: 0.6 }); return true; },
    crawl: (c) => [K().ribbon({ follow: c.proxy, width: 0.22, taper: 0.8, life: 0.6, maxLen: 6, el: 'ice', alpha: 0.6 })],
    crawlTick: (c, dt) => { c.lookD = (c.lookD ?? 0) + c.speed * dt; if (c.lookD >= 2) { c.lookD = 0; prism(gp(c.pos, 0), 1.1 + Math.min(1, c.d / c.dist), 1.4, { a: Math.atan2(c.dir.z, c.dir.x), lean: 0.3, tIn: 0.1, tOut: 0.4 }); } return true; },
    zone: () => [],
    quiet: { burst: 1 },
  });

  // ================================================================================== 번개 lightning
  def('lightning.basic', {   // B: 2-frame spark + forked-rune glyph → BT bolt hand→target, regenerated twice → afterglow + arc-crawl sparks; no flare
    cast: (o) => { K().mesh('lightning.orb', { pos: o, scale: 0.42, life: 0.12, tIn: 0.02, tOut: 0.08, erode: true, grow: 1.2 }); return true; },   // charge knot at the tip (the 2-frame spark)
    // one bolt per cast (the kit regenerates it every 2–3 frames); the legacy re-fires of the beam are dropped
    gate: { beam: (a) => { const c = L.cur; if (c?.data.bolt) return null; if (c) c.data.bolt = 1; return K().bolt({ from: a[0], to: a[1], forks: 1, width: 0.12, halo: 0.3, life: 0.08, afterglow: 0.15, el: 'lightning', seed: cid() * 3 }); } },
    impact: (pos) => {
      K().mesh('lightning.orb', { pos, scale: 0.7, life: 0.18, tIn: 0.02, tOut: 0.12, erode: true, grow: 1.3 });
      K().line({ shape: 'star', points: 4, r2: 0.12, el: 'lightning', pos, plane: 'billboard', r: 0.6, width: 0.045, life: 0.1, tIn: 0, tOut: 0.05, color: R('lightning').mid, color2: R('lightning').light, rot: 0.785 });
      sparks('lightning', pos, 3, { speed: 6, life: 0.18 }); return true;
    },
  });
  def('lightning.charged', {   // C: 3 small bolt loops crackle at the hand → thicker forked bolts per jump → lichtenberg under each target
    cast: (o) => { const a = cid(); K().bolt({ from: o, to: v3(o.x + Math.cos(a) * 0.5, o.y + 0.35, o.z + Math.sin(a) * 0.5), forks: 0, width: 0.04, halo: 0.12, life: 0.05, afterglow: 0.12, el: 'lightning' }); return true; },
    gate: {
      beam: (a) => { const c = L.cur; if (c && (c.data.jumps = (c.data.jumps || 0) + 1) > 4) return null;
        if (a[1] && (c?.data.jumps ?? 1) <= 2) K().line({ shape: 'star', points: 4, r2: 0.14, el: 'lightning', pos: a[1], plane: 'billboard', r: 0.85, width: 0.05, life: 0.16, tIn: 0, tOut: 0.08, color: R('lightning').mid, color2: R('lightning').hi, additiveCore: 0.5, rot: 0.785 });
        if (a[1] && (c?.data.jumps ?? 1) === 1) K().line({ shape: 'ticks', n: 12, r2: 0.7, el: 'lightning', pos: a[1], plane: 'billboard', r: 1.45, width: 0.05, life: 0.4, tIn: 0.05, tOut: 0.2, scaleIn: 'backOut', spin: 2.5 });
        return K().bolt({ from: a[0], to: a[1], forks: 2, width: 0.14, halo: 0.4, life: 0.09, afterglow: 0.32, el: 'lightning', seed: cid() * 5 + (c?.h || 0) }); },
      burst: (a) => { if (a[0]) { const c = L.cur; if (c && (c.data.lich = (c.data.lich || 0) + 1) <= 2) K().decal('lichtenberg', gp(a[0]), 2.6, 0.7, { el: 'lightning', alpha: 0.35 }); sparks('lightning', a[0], 5, { speed: 6, life: 0.2 }); } return null; },
    },
    impact: (pos) => { sparks('lightning', pos, 5, { speed: 6, life: 0.2 }); return true; },
  });
  def('lightning.ult', {   // U ★: keep the ult circle; storm = dark LW cloud-glyph ring overhead (no cloud sprites) → vertical 2-frame strikes + lichtenberg; no screen flash
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos), top = v3(0, 12.5, 0), R2 = R('lightning');
      return [
        K().line({ shape: 'glyph', glyph: 'lichtenberg', el: 'lightning', pos: v3(g.x, g.y + 12.5, g.z), follow: o.follow, followOff: top, plane: 'flat', r: r * 0.9, width: 0.06, life, tIn: 0.4, tOut: 0.6, spin: 0.25, alpha: 0.55, color: R2.mid, color2: R2.dark }),
        K().line({ shape: 'ring', el: 'lightning', pos: v3(g.x, g.y + 12.5, g.z), follow: o.follow, followOff: top, plane: 'flat', r, width: 0.08, life, tIn: 0.4, tOut: 0.6, alpha: 0.6, color: R2.dark, color2: R2.mid }),
        K().line({ shape: 'dots', n: Math.round(16 + r * 4), el: 'lightning', pos: g, follow: o.follow, followOff: v3(0, 0.05, 0), plane: 'ground', r, width: 0.04, life, tIn: 0.3, tOut: 0.5, spin: 0.4, alpha: 0.35 }),
      ];
    },
    gate: {
      beam: (a) => { const c = L.cur; if (c) { const t = game.time || 0; if (t - (c.data.lastStrike || -9) < 0.15) return null; c.data.lastStrike = t; }
        return K().bolt({ from: a[0], to: a[1], forks: 2, width: 0.12, halo: 0.34, life: 0.05, afterglow: 0.25, el: 'lightning', seed: cid() * 11 + (c?.h || 0) }); },
      screenFlash: () => null, decal: (a) => K().decal('lichtenberg', gp(a[0]), 1.4, 1.2, { el: 'lightning', alpha: 0.32 }),
    },
    impact: (pos) => { sparks('lightning', pos, 6, { speed: 7, life: 0.2 }); return true; },
    strike: (el, q) => K().bolt({ from: v3(q.x + 0.6, q.y + 12, q.z - 0.3), to: gp(q), forks: 2, width: 0.12, halo: 0.34, life: 0.05, afterglow: 0.25, el: 'lightning', seed: cid() * 13 + (L.cur?.h || 0) }),
    noFlash: true,
  });

  // ================================================================================== 바람 wind
  def('wind.basic', {   // B: triple-spiral glyph → thin spinning crescent blade (alpha body, hi leading edge) + streamline → leaf flecks + crescent
    cast: (o) => { glyph('wind', 'wind', o, 0.32, { life: 0.12, tIn: 0.05, tOut: 0.06, spin: 3 }); return true; },
    body: (p, o) => [K().mesh(o.mesh === 'arrow' ? 'wind.arrow' : 'wind.crescent', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: o.mesh === 'arrow' ? 0.85 : 1.1, life: Infinity, tIn: 0.12, tOut: 0.1, erode: true, alpha: 0.85, spin: o.mesh === 'arrow' ? 0 : 0 }),
      K().ribbon({ follow: p.proxy, width: 0.09, taper: 1, life: 0.22, maxLen: 1.8, el: 'wind', alpha: 0.6, tailSat: 0.2 })],
    impact: (pos) => { K().line({ shape: 'crescent', el: 'wind', pos, plane: 'billboard', r: 0.6, width: 0.03, life: 0.12, tIn: 0, tOut: 0.06, color: R('wind').mid, color2: R('wind').hi, additiveCore: 0.6, rot: cid() % TAU }); sparks('wind', pos, 3, { shape: 'leaf', gravity: 1, speed: 4, life: 0.5 }); return true; },
  });
  const gustWave = (o, dir, len, angDeg, n) => {
    const d = flatDir(dir), a = Math.atan2(d.z, d.x), half = Math.min(1.3, (angDeg || 60) * Math.PI / 360), base = gp(o, 0.25);
    const rnd = rng(cid() * 23 + 7);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5, aa = a + k * half * 1.6, curl = (k >= 0 ? 1 : -1) * 0.35, pts = [];
      for (let j = 0; j < 8; j++) { const t = j / 7, ang = aa + curl * t * t, rr = 0.6 + t * len; pts.push(v3(base.x + Math.cos(ang) * rr, base.y + 0.15 + rnd() * 0.2, base.z + Math.sin(ang) * rr)); }
      K().ribbon({ points: pts, width: 0.17 - Math.abs(k) * 0.05, taper: 0.95, life: 0.38 + rnd() * 0.06, el: 'wind', alpha: 0.72, edge: 1, tailSat: 0.25 });
    }
    K().line({ shape: 'arc', arc: [a - half, a + half], el: 'wind', pos: gp(o), plane: 'ground', r: len * 0.9, width: 0.045, life: 0.42, tOut: 0.25, scaleIn: 'expand', alpha: 0.8, color: R('wind').mid });
    sparks('wind', base, 8, { shape: 'leaf', gravity: 1, speed: 7, life: 0.6, dir: d });
    return true;
  };
  def('wind.charged', {   // C ★: spiral at the hand → 5 streamlines sweeping the cone on curves + expanding arc front + leaves. No fog.
    cast: (o) => { K().line({ shape: 'spiral', turns: 1, arms: 3, r2: 0.12, el: 'wind', pos: o, plane: 'billboard', r: 0.5, width: 0.025, life: 0.25, tIn: 0.08, tOut: 0.1, spin: -4, color: R('wind').mid }); return true; },
    wave: (o, dir, len, ang) => gustWave(o, dir, len, ang, 5),
    quiet: { burst: 1, shockwave: 1 },
  });
  def('wind.gust', {   // A ★: short crescent wave (LW arc + 3 streamlines) + leaves
    cast: () => true,
    wave: (o, dir, len, ang) => {
      const d = flatDir(dir), a = Math.atan2(d.z, d.x);
      K().line({ shape: 'crescent', el: 'wind', pos: v3(o.x + d.x * 3, o.y, o.z + d.z * 3), plane: 'oriented', normal: d, r: 1.4, width: 0.065, life: 0.32, tIn: 0.06, tOut: 0.15, scaleIn: 'expand' });
      return gustWave(o, dir, Math.min(len, 6), Math.min(ang || 70, 70), 4) && a !== undefined;
    },
  });
  def('wind.vortex', {   // Z: polar spiral disc on the ground + 3 helical streamlines rising 3 m (0.5 alpha) + ≤ 20 circling leaves
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos);
      const out = [K().line({ shape: 'spiral', turns: 1.2, arms: 3, r2: 0.1, el: 'wind', pos: g, follow: o.follow, plane: 'ground', r, width: 0.04, life, tIn: 0.25, tOut: 0.5, spin: 2.2, alpha: 0.34 })];
      for (let i = 0; i < 3; i++) out.push(K().line({ shape: 'spiral', turns: 0.5, arms: 1, r2: 0.6, el: 'wind', pos: v3(g.x, g.y + 0.8 + i * 1.0, g.z), follow: o.follow, followOff: v3(0, 0.8 + i * 1.0, 0), plane: 'flat', r: r * (0.45 + i * 0.12), width: 0.03, life, tIn: 0.3 + i * 0.05, tOut: 0.4, spin: 3 + i, alpha: 0.5 }));
      return out;
    },
  });
  def('wind.ult', {   // U: tornado of helical tapered streamlines (r 1→4 over 10 m) + ground spiral band + leaves; walls ≤ 0.4 alpha; near-camera fade (kit)
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos), out = [];
      out.push(K().line({ shape: 'spiral', turns: 1.4, arms: 3, r2: 0.08, el: 'wind', pos: g, follow: o.follow, followOff: v3(0, 0.05, 0), plane: 'ground', r: r * 1.15, width: 0.05, life, tIn: 0.3, tOut: 0.5, spin: 3, alpha: 0.38 }));
      for (let i = 0; i < 6; i++) {
        const h = 0.8 + i * 1.7, rr = 1 + (i / 5) * 3;
        out.push(K().line({ shape: 'spiral', turns: 0.55, arms: 2, r2: 0.72, el: 'wind', pos: v3(g.x, g.y + h, g.z), follow: o.follow, followOff: v3(0, h, 0), plane: 'flat', r: rr, width: 0.05, life, tIn: 0.2 + i * 0.06, tOut: 0.45, spin: 4.5 - i * 0.35, alpha: 0.4, color: R('wind').mid, color2: R('wind').mid }));
      }
      return out;
    },
    quiet: { burst: 1 },
  });

  // ================================================================================== 물 water
  def('water.basic', {   // B: wave glyph → 3 FM droplets + tiny RB → droplet crown + ripple
    cast: () => true,
    body: (p, o) => [K().mesh(o.mesh === 'arrow' ? 'water.arrow' : 'water.droplet', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: o.mesh === 'arrow' ? 0.85 : 1.2, life: Infinity, tIn: 0.12, tOut: 0.08, erode: true })],
    impact: (pos) => { K().line({ shape: 'ring', el: 'water', pos: gp(pos), plane: 'ground', r: 0.8, width: 0.03, life: 0.4, tIn: 0, tOut: 0.25, scaleIn: 'expand', color: R('water').light }); sparks('water', pos, 6, { shape: 'droplet', gravity: 10, speed: 4, life: 0.4 }); return true; },
  });
  def('water.charged', {   // C: curling wave sheet (crest line, foam edge) sweeps the cone → foam rings
    cast: (o) => { glyph('water', 'water', o, 0.4, { life: 0.22 }); return true; },
    wave: (o, dir, len, ang) => {
      const d = flatDir(dir), a = Math.atan2(d.z, d.x), half = Math.min(1.3, (ang || 60) * Math.PI / 360), g0 = gp(o, 0);
      const width = Math.max(1.6, Math.min(4.5, len * Math.tan(half) * 0.8)), speed = len / 0.55;
      K().mesh('water.sheet', { pos: v3(g0.x + d.x * 0.8, g0.y, g0.z + d.z * 0.8), quat: new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), d), scale: v3(width, Math.min(1.8, 0.7 + len * 0.1), 1), life: 0.6, tIn: 0.12, tOut: 0.25, erode: true, vel: v3(d.x * speed, 0, d.z * speed), alpha: 0.85, grow: 1.7 });
      K().line({ shape: 'arc', arc: [a - half, a + half], el: 'water', pos: gp(o), plane: 'ground', r: len, width: 0.045, life: 0.55, tOut: 0.3, scaleIn: 'expand', color: R('water').light });
      K().decal('ripple', gp(v3(o.x + d.x * len * 0.6, 0, o.z + d.z * len * 0.6)), len * 0.45, 1, { el: 'water', alpha: 0.3 });
      sparks('water', g0, 8, { shape: 'droplet', gravity: 10, speed: 7, dir: d, life: 0.5 });
      return true;
    },
    quiet: { burst: 1 },
  });
  def('water.ult', {   // U ★: concentric outward wave rings (3 at a time) + foam lines + caustic disc ≤ 0.25 alpha limited to r; body ≤ 4 s; never > 25 % of the screen
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos), vis = Math.min(life, 4);
      const out = [K().decal('ripple', g, r, vis, { el: 'water', alpha: 0.25 })];
      for (let i = 0; i < 3; i++) out.push(K().line({ shape: 'ring', el: 'water', pos: g, follow: o.follow, plane: 'ground', r: r * (0.4 + i * 0.3), width: 0.05, life: vis, tIn: 0.2 + i * 0.15, tOut: 0.6, alpha: 0.4, color: R('water').light, spin: 0.2 }));
      return out;
    },
    gate: { shockwave: (a) => { const p = a[0], o = a[1] || {}; return p ? K().line({ shape: 'ring', el: 'water', pos: gp(p), plane: 'ground', r: Math.min(14, o.radius || 6), width: 0.06, life: 0.9, tIn: 0, tOut: 0.5, scaleIn: 'expand', color: R('water').light }) : null; } },
    impact: (pos, r) => { sparks('water', pos, 12, { shape: 'droplet', gravity: 10, speed: 7, life: 0.6 }); K().line({ shape: 'ring', el: 'water', pos: gp(pos), plane: 'ground', r: Math.min(8, r * 2), width: 0.05, life: 0.6, tIn: 0, tOut: 0.35, scaleIn: 'expand', color: R('water').hi }); return true; },
    quiet: { burst: 1 },
  });

  // ================================================================================== 대지 earth (caster form; melee owns the earth motifs)
  const rock = (o) => K().mesh(L.motifSource('earth') === 'melee' && K()._fm?.hasShape?.('earth.rock') ? 'earth.rock' : 'physical.chunk', { el: 'earth', ...o });
  def('earth.basic', {   // B: strata-diamond glyph → spinning faceted rock with strata bands → chips + small crack
    cast: (o) => { glyph('earth', 'earth', o, 0.32, { life: 0.12, tIn: 0.05, tOut: 0.06 }); return true; },
    body: (p, o) => [o.mesh === 'arrow' ? K().mesh('earth.arrow', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: 0.85, life: Infinity, tIn: 0.12, tOut: 0.08 })
      : rock({ follow: p.proxy, pos: p.pos, scale: 0.55 * (o.scale || 1) + 0.15, life: Infinity, tIn: 0.12, tOut: 0.1, erode: true, spin: 6, spinAxis: v3(1, 0, 0) }),
      K().ribbon({ follow: p.proxy, width: 0.1, taper: 1, life: 0.14, maxLen: 0.9, el: 'earth', alpha: 0.5 })],
    impact: (pos) => { K().decal('crack', gp(pos), 0.9, 0.5, { el: 'earth', alpha: 0.32 }); sparks('earth', pos, 5, { gravity: 16, speed: 5, life: 0.5 }); return true; },
  });
  def('earth.charged', {   // C ★: crack line runs from the player to the target during charge → 3 angled strata spikes erupt + chips + low dust ≤ 0.6 s / 0.3 alpha
    cast: () => true,
    gate: {
      decal: (a) => { const to = a[0], pp = game.player?.object?.position; if (!to || !pp) return null; const mid = v3((to.x + pp.x) / 2, 0, (to.z + pp.z) / 2);
        return K().decal('crack', gp(mid), Math.max(1.5, Math.hypot(to.x - pp.x, to.z - pp.z) / 2), 0.9, { el: 'earth', alpha: 0.32, rot: Math.atan2(to.z - pp.z, to.x - pp.x) }); },
      shockwave: (a) => { const p = a[0]; if (!p) return null; const a0 = (cid() * 0.7) % TAU, g = gp(p, 0);
        for (let i = 0; i < 3; i++) { const an = a0 + i * TAU / 3; K().mesh('physical.shard', { el: 'earth', pos: v3(g.x + Math.cos(an) * 0.6, g.y, g.z + Math.sin(an) * 0.6), quat: qYawTilt(Math.PI / 2 - an, 0.45), scale: v3(1.1, 2.4, 1.1), life: 0.9, tIn: 0.12, tOut: 0.35, erode: true }); }
        return ring('earth', gp(p), (a[1]?.radius || 3) * 0.9, { width: 0.04, life: 0.35 }); },
    },
    impact: (pos) => { sparks('earth', pos, 10, { gravity: 16, speed: 7, life: 0.6 }); return true; },
  });
  def('earth.ult', {   // U ★: radial crack decal with light glow at line bottoms + 3 concentric uplift rings of rock chips + low dust ring; no screen-wide cloud
    cast: () => true,
    gate: {
      shockwave: (a) => { const p = a[0], o = a[1] || {}; const c = L.cur; if (!p || !c) return null; if ((o.thickness ?? 1) < 1 || c.data.ring >= 3) return null;
        c.data.ring = (c.data.ring || 0) + 1;
        if (c.data.ring === 1) K().decal('crack', gp(p), 15, 6, { el: 'earth', alpha: 0.3, color: R('earth').light });
        sparks('earth', gp(p, 0.3), 12, { gravity: 16, speed: 9, life: 0.7 });
        return K().line({ shape: 'poly', sides: 12, el: 'earth', pos: gp(p), plane: 'ground', r: Math.min(16, o.radius || 6), width: 0.07, life: 0.55, tIn: 0, tOut: 0.3, scaleIn: 'expand', color: R('earth').light, rot: c.data.ring * 0.4 }); },
      decal: () => null,
    },
    impact: (pos) => { sparks('earth', pos, 8, { gravity: 16, speed: 6 }); return true; },
  });

  // ================================================================================== 자연 nature
  const vine = (pts, o = {}) => K().ribbon({ points: pts, width: o.width ?? 0.08, taper: 0.9, life: o.life ?? 0.9, el: 'nature', alpha: 0.85, edge: 0.9, colors: { head: R('nature').mid, edge: R('nature').dark } });
  def('nature.basic', {   // B: 5-leaf glyph → 3 FM thorns (dark green, light edge) + petal flecks
    cast: () => true,
    body: (p, o) => [K().mesh(o.mesh === 'arrow' ? 'nature.arrow' : 'physical.shard', { el: 'nature', follow: p.proxy, pos: p.pos, dir: p.vel, scale: o.mesh === 'arrow' ? 0.85 : 0.6, life: Infinity, tIn: 0.12, tOut: 0.08 })],
    impact: (pos) => { glyph('nature', 'nature', pos, 0.45, { life: 0.25, tIn: 0.05, tOut: 0.12 }); sparks('nature', pos, 6, { shape: 'petal', gravity: 1.2, speed: 3, life: 0.6 }); return true; },
  });
  def('nature.charged', {   // C: seed pod → 5-petal flower decal + petals + 2 vine curls
    cast: () => true,
    body: (p) => [K().mesh('physical.chunk', { el: 'nature', follow: p.proxy, pos: p.pos, scale: 0.6, life: Infinity, tIn: 0.12, tOut: 0.08, spin: 3 }), K().ribbon({ follow: p.proxy, width: 0.11, taper: 1, life: 0.22, maxLen: 1.5, el: 'nature', alpha: 0.75 })],
    impact: (pos, r) => {
      const g = gp(pos), rr = Math.max(1.5, Math.min(5, r * 1.6));
      K().line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: v3(pos.x, pos.y + 0.2, pos.z), plane: 'billboard', r: 1.25, width: 0.055, life: 0.55, tIn: 0.15, tOut: 0.25, spin: 1.2, scaleIn: 'backOut', color: R('nature').mid, color2: R('nature').light });
      K().line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: g, plane: 'ground', r: rr, width: 0.045, life: 0.9, tIn: 0.2, tOut: 0.35, spin: 0.5, scaleIn: 'backOut', color: R('nature').light });
      for (let i = 0; i < 2; i++) { const a = cid() * 0.7 + i * Math.PI; vine(arcPoints(gp(pos, 0.15), rr * 0.6, a, a + 2.4, 8), { life: 0.6 }); }
      sparks('nature', v3(g.x, g.y + 0.4, g.z), 16, { shape: 'petal', gravity: 1.2, speed: 5, life: 0.8 });
      return true;
    },
    zone: () => [],
    quiet: { shockwave: 1 },
  });
  def('nature.roots', {   // Z ★: vine tubes per target grow along splines (0.3 s) with thorn tips + leaf glyph decal → wither. No glare balls.
    cast: () => true,
    zone: (kind, pos, r) => {
      const g = gp(pos, 0), out = [K().line({ shape: 'glyph', glyph: 'nature', el: 'nature', pos: gp(pos), plane: 'ground', r: Math.min(6, r), width: 0.035, life: 1.6, tIn: 0.25, tOut: 0.5, spin: 0.2, alpha: 0.35 })];
      const rnd = rng(cid() * 31 + 2);
      for (let i = 0; i < 4; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * r * 0.75, c = v3(g.x + Math.cos(a) * d, g.y, g.z + Math.sin(a) * d);
        out.push(vine(helixPoints(c, 0.55, 0.12, 1.7, 0.75, a, 9), { life: 1.2, width: 0.12 })); }
      return out;
    },
    gate: { burst: (a) => { if (a[0]) sparks('nature', a[0], 3, { shape: 'leaf', gravity: 1, speed: 2 }); return null; } },
  });
  def('nature.spore', {   // Z: olive spore puffs (normal blend, ≤ 0.3 alpha, low) + mushroom-cap glyph decal
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos);
      return [K().line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: g, follow: o.follow, plane: 'ground', r, width: 0.035, life, tIn: 0.25, tOut: 0.5, spin: -0.15, alpha: 0.3 }),
        K().line({ shape: 'stipple', el: 'nature', pos: g, follow: o.follow, plane: 'ground', r: r * 0.95, width: 0.06, density: 0.3, life, tIn: 0.3, tOut: 0.5, alpha: 0.28, role: 'fill', color: R('nature').light })];
    },
  });
  def('nature.ult', {   // U: falling seed pods bloom into 5-petal flowers, root vines erupt
    cast: () => true,
    strike: (el, q, Rr) => { K().line({ shape: 'glyph', glyph: 'flower5', el: 'nature', pos: gp(q), plane: 'ground', r: Math.min(3, Rr), width: 0.045, life: 0.8, tIn: 0.2, tOut: 0.3, scaleIn: 'backOut', spin: 0.6, color: R('nature').light }); sparks('nature', gp(q, 0.4), 6, { shape: 'petal', gravity: 1, speed: 4 }); return true; },
    impact: (pos) => { const g = gp(pos, 0); for (let i = 0; i < 3; i++) vine(helixPoints(g, 0.9, 0.2, 2.2, 0.8, i * TAU / 3, 10), { life: 1 }); return true; },
    quiet: { burst: 1 },
  });

  // ================================================================================== 빛 light
  def('light.basic', {   // B: 8-ray glyph → 4-point star shard + thin RB → star glint (2 frames) + motes
    cast: (o) => { glyph('light', 'light', o, 0.3, { life: 0.12, tIn: 0.05, tOut: 0.06, spin: 1.5 }); return true; },
    body: (p, o) => [K().mesh(o.mesh === 'arrow' ? 'light.arrow' : 'physical.shard', { el: 'light', follow: p.proxy, pos: p.pos, dir: p.vel, scale: o.mesh === 'arrow' ? 0.95 : 0.85, life: Infinity, tIn: 0.12, tOut: 0.08 }),
      K().ribbon({ follow: p.proxy, width: 0.09, taper: 1, life: 0.18, maxLen: 1.8, el: 'light', alpha: 0.75 })],
    impact: (pos) => { K().line({ shape: 'star', points: 4, r2: 0.1, el: 'light', pos, plane: 'billboard', r: 0.85, width: 0.035, life: 0.1, tIn: 0, tOut: 0.04, color: R('light').light, color2: R('light').hi, additiveCore: 0.6, rot: 0.785 }); sparks('light', pos, 4, { shape: 'mote', gravity: -0.5, speed: 1.5, life: 0.6 }); return true; },
  });
  def('light.charged', {   // C: halo ring with ticks above the target → thin ray pillar (r ≤ 0.6) + ground halo → narrows to a line
    cast: () => true,
    gate: {
      beam: (a) => K().bolt({ from: a[0], to: a[1], forks: 0, jagged: 0, width: 0.12, halo: 0.55, life: 0.35, afterglow: 0.3, el: 'light' }),
      runeCircle: (a) => { const p = a[0]; if (!p) return null; K().line({ shape: 'ticks', n: 16, r2: 0.84, el: 'light', pos: v3(p.x, p.y + 3.2, p.z), plane: 'flat', r: 1.1, width: 0.03, life: 0.5, tIn: 0.15, tOut: 0.2, spin: 2, color: R('light').light });
        return K().line({ shape: 'ring', el: 'light', pos: gp(p), plane: 'ground', r: (a[1]?.r || 2) * 1.05, width: 0.035, life: 0.7, tIn: 0.12, tOut: 0.3, color: R('light').light }); },
    },
    impact: (pos) => {
      K().line({ shape: 'ticks', n: 16, r2: 0.8, el: 'light', pos: v3(pos.x, pos.y + 0.3, pos.z), plane: 'billboard', r: 1.4, width: 0.045, life: 0.5, tIn: 0.1, tOut: 0.25, scaleIn: 'backOut', spin: 1.5 });
      K().line({ shape: 'star', points: 4, r2: 0.1, el: 'light', pos, plane: 'billboard', r: 1.0, width: 0.04, life: 0.12, tIn: 0, tOut: 0.06, color: R('light').mid, color2: R('light').hi, additiveCore: 0.6, rot: 0.785 });
      sparks('light', pos, 8, { shape: 'mote', gravity: -0.6, speed: 2, life: 0.8 }); return true;
    },
    quiet: { burst: 1 },
  });
  def('light.flash', {   // A ★: 8 thin radial rays from the player + expanding halo ring with ticks + star glint (2 frames); cream tint ≤ 0.1 s. No dome.
    cast: () => true,
    nova: (el, c) => {
      if (L.cur?.data.nova) return true;
      if (L.cur) { L.cur.data.nova = 1; L.cur.burst++; }
      const g = gp(c), Rr = 5;
      K().line({ shape: 'rays', n: 8, r2: 0.18, el: 'light', pos: g, plane: 'ground', r: Rr, width: 0.04, life: 0.35, tIn: 0.05, tOut: 0.2, scaleIn: 'expand', color: R('light').light, rot: (cid() * 0.39) % TAU });
      K().line({ shape: 'ticks', n: 24, r2: 0.88, el: 'light', pos: g, plane: 'ground', r: Rr * 1.05, width: 0.025, life: 0.45, tIn: 0, tOut: 0.25, scaleIn: 'expand', spin: 0.8 });
      ring('light', g, Rr * 0.9, { width: 0.03, life: 0.42 });
      K().line({ shape: 'star', points: 4, r2: 0.1, el: 'light', pos: v3(c.x, c.y + 0.6, c.z), plane: 'billboard', r: 0.9, width: 0.03, life: 0.07, tIn: 0, tOut: 0.04, color: R('light').light, color2: R('light').hi, additiveCore: 0.6, rot: 0.785 });
      sparks('light', c, 8, { shape: 'mote', gravity: -0.4, speed: 2, life: 0.7 });
      return true;
    },
  });
  def('light.sanctuary', {   // Z ★: ground hexagram + halo linework (ivory, 0.35 alpha, lines only) + descending motes. Not a glowing sheet.
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos);
      return [K().line({ shape: 'glyph', glyph: 'hexagram', el: 'light', pos: g, follow: o.follow, plane: 'ground', r: Math.min(1.7, r * 0.34), width: 0.03, life, tIn: 0.28, tOut: 0.5, spin: 0.15, alpha: 0.35, color: R('light').light }),
        K().line({ shape: 'ticks', n: 36, r2: 0.96, el: 'light', pos: g, follow: o.follow, plane: 'ground', r: r * 1.02, width: 0.02, life, tIn: 0.3, tOut: 0.5, spin: -0.2, alpha: 0.35 }),
        K().line({ shape: 'ring', el: 'light', pos: g, follow: o.follow, plane: 'ground', r: r * 1.1, width: 0.02, life, tIn: 0.35, tOut: 0.5, alpha: 0.3 })];
    },
    gate: { burst: (a) => { if (a[0]) sparks('light', a[0], 2, { shape: 'mote', gravity: 0.4, speed: 0.6, life: 1 }); return null; } },
  });
  def('light.ult', {   // U ★: sky sigil → beam = 1 central ray (r 0.5) + 2 orbiting thin rays + halo rings descending. No 3 m white column.
    cast: () => true,
    gate: {
      beam: (a) => {
        const c = L.cur; const n = c ? (c.data.rays = (c.data.rays || 0) + 1) : 1;
        const o = a[2] || {};
        return K().bolt({ from: a[0], to: a[1], forks: 0, jagged: 0, width: n === 1 ? 0.12 : 0.06, halo: n === 1 ? 0.5 : 0.18, life: Math.max(0.2, o.duration ?? 0.5), afterglow: 0.3, el: 'light' });
      },
      runeCircle: (a) => { const p = a[0]; if (!p) return null; for (let i = 0; i < 3; i++) K().line({ shape: 'ticks', n: 16, r2: 0.85, el: 'light', pos: v3(p.x, p.y + 1 + i * 1.6, p.z), plane: 'flat', r: 1.4 - i * 0.25, width: 0.03, life: 1.2, tIn: 0.2 + i * 0.1, tOut: 0.4, spin: 1.5 - i, color: R('light').light });
        return null; },
    },
    impact: (pos) => { sparks('light', pos, 12, { shape: 'mote', gravity: -0.5, speed: 2, life: 0.9 }); return true; },
    quiet: { burst: 1, shockwave: 1 },
  });

  // ================================================================================== 그림자 shadow
  def('shadow.basic', {   // B: crescent-eye glyph → near-black ink arrow with violet rim + ink RB
    cast: (o) => { glyph('shadow', 'shadow', o, 0.3, { life: 0.12, tIn: 0.05, tOut: 0.06, color: R('shadow').light }); return true; },
    body: (p, o) => [K().mesh(o.mesh === 'arrow' ? 'shadow.arrow' : 'physical.shard', { el: 'shadow', color: R('shadow').light, tintAmt: 0.75, follow: p.proxy, pos: p.pos, dir: p.vel, scale: o.mesh === 'arrow' ? 0.95 : 0.85, life: Infinity, tIn: 0.12, tOut: 0.08 }),
      K().ribbon({ follow: p.proxy, width: 0.15, taper: 1, life: 0.22, maxLen: 1.6, el: 'shadow', alpha: 0.9, colors: { head: R('shadow').light, tail: R('shadow').mid, edge: R('shadow').light } })],
    impact: (pos) => { K().line({ shape: 'crescent', el: 'shadow', pos, plane: 'billboard', r: 0.8, width: 0.05, life: 0.22, tIn: 0.03, tOut: 0.1, color: R('shadow').light, color2: R('shadow').dark, rot: cid() % TAU }); sparks('shadow', pos, 4, { shape: 'wisp', gravity: -0.5, speed: 2 }); return true; },
  });
  def('shadow.charged', {   // C: ink tendril from the target to the hand, soul wisps travel inward
    cast: () => true,
    gate: { beam: (a) => {
      // ink tendril: a crisp jagged bolt (violet rim colour core) target → hand, a crescent bite at the target once per cast
      const c = L.cur, f = a[0], t = a[1]; if (!f || !t) return null;
      if (c && !c.data.bite) { c.data.bite = 1; K().line({ shape: 'crescent', el: 'shadow', pos: f, plane: 'billboard', r: 0.9, width: 0.06, life: 0.45, tIn: 0.05, tOut: 0.2, color: R('shadow').light, color2: R('shadow').dark, rot: cid() % TAU }); }
      return K().bolt({ from: f, to: t, forks: 0, jagged: 0.35, width: 0.11, halo: 0.13, life: Math.max(0.3, Math.min(1.2, a[2]?.duration ?? 1)), afterglow: 0.2, el: 'shadow' });
    },
      burst: (a) => { if (a[0]) sparks('shadow', a[0], 3, { shape: 'wisp', gravity: 0, speed: 2, life: 0.5 }); return null; } },
  });
  def('shadow.ult', {   // U: keep the dark core + crisp ring (works today) + tendrils
    cast: () => true,
    zone: (kind, pos, r, life, o) => {
      const g = gp(pos), R2 = R('shadow');
      return [K().line({ shape: 'spiral', turns: 1.3, arms: 3, r2: 0.1, el: 'shadow', pos: g, follow: o.follow, plane: 'ground', r, width: 0.05, life, tIn: 0.3, tOut: 0.5, spin: -1.2, alpha: 0.4, color: R2.light, color2: R2.dark }),
        K().line({ shape: 'ring', el: 'shadow', pos: g, follow: o.follow, plane: 'ground', r: r * 1.03, width: 0.035, life, tIn: 0.3, tOut: 0.5, alpha: 0.45, color: R2.light })];
    },
    quiet: { burst: 1 },
  });

  void qUp;
  return rows;
}
