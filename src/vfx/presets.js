// Element impact / explosion presets + the 49 reaction presets (PLAN v4 §3.8). Owner: vfx.
//  - preset('impact_<el>') / ('explosion_<el>') = kit.motif(el, 'burst', {r, castId}) + ≤ 12 sparks (the v3 8–10-layer recipe and the
//    SZ / LF multipliers are gone; sizes 1.0).
//  - preset('rx_<id>'): one kit recipe per reaction family (≤ 60 particles, no domes, ≤ 1 LW ring; a tinted flash ≤ 0.1 s only
//    for the big families burst / judgment), coloured by the reaction's two element ramps, plus a small signature layer.
//  - per-frame budget: ≤ 4 full reaction presets per frame; the rest play reduced (¼ particles, no decal).
// opts.owner:'enemy' renders every preset in the enemy style (R11).
const UP = { x: 0, y: 1, z: 0 };
const FAMILY_OF = {
  melt: 'burst', shatter: 'burst', overload: 'burst', magma: 'burst', skyslam: 'burst', steam_burst: 'burst', burgeon: 'burst', hyperbloom: 'burst', radiant_burst: 'burst', eclipse: 'burst',
  electrocute: 'control', superconduct: 'control', flashfreeze: 'control', freeze_water: 'control', mudslide: 'control', grounded: 'control', quicken: 'control', frostbloom: 'control', entangle: 'control',
  swirl: 'spread', pollen: 'spread', aurora: 'spread', void_rift: 'spread', updraft: 'spread', fire_wave: 'spread', infusion: 'spread', wildfire: 'spread',
  evaporate: 'surface', electro_water: 'surface', obsidian: 'surface', sandstorm: 'surface', fire_tornado: 'surface', blizzard: 'surface', storm_tornado: 'surface',
  sanctify: 'blessing', holywater: 'blessing', photosynthesis: 'blessing', purify: 'blessing', bloom: 'blessing', crystallize: 'blessing', prism: 'blessing', judgment: 'blessing',
  necroflame: 'curse', miasma: 'curse', rot: 'curse', voidfrost: 'curse', blackbolt: 'curse',
  break: 'universal', resonance: 'universal',
};
const ELEMENTS_OF = {
  melt: ['fire', 'ice'], shatter: ['earth', 'ice'], overload: ['lightning', 'fire'], magma: ['earth', 'fire'], skyslam: ['earth', 'wind'], steam_burst: ['fire', 'ice'],
  burgeon: ['fire', 'nature'], hyperbloom: ['lightning', 'nature'], radiant_burst: ['lightning', 'light'], eclipse: ['shadow', 'light'], electrocute: ['lightning', 'water'],
  superconduct: ['lightning', 'ice'], flashfreeze: ['ice', 'water'], freeze_water: ['ice', 'water'], mudslide: ['earth', 'water'], grounded: ['earth', 'lightning'],
  quicken: ['lightning', 'nature'], frostbloom: ['ice', 'nature'], entangle: ['earth', 'nature'], swirl: ['wind', 'fire'], pollen: ['wind', 'nature'], aurora: ['wind', 'light'],
  void_rift: ['wind', 'shadow'], updraft: ['wind', 'wind'], fire_wave: ['wind', 'fire'], infusion: ['fire', 'earth'], wildfire: ['fire', 'nature'], evaporate: ['fire', 'water'],
  electro_water: ['lightning', 'water'], obsidian: ['water', 'fire'], sandstorm: ['wind', 'earth'], fire_tornado: ['wind', 'fire'], blizzard: ['wind', 'ice'],
  storm_tornado: ['wind', 'lightning'], sanctify: ['light', 'fire'], holywater: ['light', 'water'], photosynthesis: ['light', 'nature'], purify: ['light', 'shadow'],
  bloom: ['water', 'nature'], crystallize: ['earth', 'ice'], prism: ['light', 'ice'], judgment: ['light', 'light'], necroflame: ['shadow', 'fire'], miasma: ['shadow', 'water'],
  rot: ['shadow', 'nature'], voidfrost: ['shadow', 'ice'], blackbolt: ['lightning', 'shadow'], break: ['physical', 'physical'], resonance: ['light', 'light'],
};
const SPARK = { fire: 'ember', ice: 'shard', lightning: 'spark', wind: 'leaf', water: 'droplet', earth: 'rock', nature: 'petal', light: 'mote', shadow: 'wisp', physical: 'spark', void: 'wisp' };
const SIGSHAPE = { fire: ['rays', { n: 8, r2: 0.35, width: 0.08 }], ice: ['star', { points: 6, r2: 0.42 }], lightning: ['ticks', { n: 6, r2: 0.25 }], wind: ['spiral', { turns: 0.8, arms: 3, r2: 0.12, width: 0.05 }],
  water: ['ring', { width: 0.04 }], earth: ['poly', { sides: 4, width: 0.06 }], nature: ['glyph', { glyph: 'flower5' }], light: ['star', { points: 8, r2: 0.2, width: 0.025 }],
  shadow: ['crescent', {}], physical: ['ticks', { n: 8, r2: 0.55 }], void: ['crescent', {}] };

export function installPresets(vfx, game) {
  const K = () => vfx.kit;
  const gy = (p) => { try { return game.world?.getHeight?.(p.x, p.z) ?? 0; } catch (_) { return 0; } };
  const nearGround = (p, h = 1.8) => p.y - gy(p) < h;
  const gpt = (p) => ({ x: p.x, y: gy(p), z: p.z });
  let kMul = 1, noDecal = false, curOwner = 'player', curCast = 0;
  const burst = (p, o) => {
    if (o.count != null) o.count = Math.max(o.count > 0 ? 1 : 0, Math.round(o.count * kMul));
    o.owner = curOwner; o.castId = curCast;
    return vfx.burst(p, o);
  };
  const line = (spec) => K().line({ ...spec, owner: curOwner, castId: curCast });
  const hex = (el, part) => K().ramp(el)[part].getHex();
  const sigLine = (el, p, r, extra = {}) => { const [shape, s] = SIGSHAPE[el] || SIGSHAPE.physical; return line({ shape, ...s, el, pos: p, plane: 'billboard', r, life: 0.45, tIn: 0.08, tOut: 0.28, erode: true, spin: 0.6, ...extra }); };

  // ---------------------------------------------------------------- impacts / explosions (kit motif burst + ≤ 12 sparks)
  function impactFx(pos, el, s, big, normal, opts) {
    curOwner = opts?.owner === 'enemy' ? 'enemy' : opts?.owner === 'world' ? 'world' : 'player';
    curCast = opts?.castId || 0;
    try {
      const r = Math.max(0.4, Math.min(3.5, (big ? 1.7 : 1.0) * s));
      K().motif(el, 'burst', { pos, r, dir: normal || null, castId: curCast, owner: curOwner, n: big ? 12 : 9, decal: big, big });
      if (big && curOwner === 'player' && nearGround(pos)) K().decal(el === 'ice' ? 'frost' : el === 'lightning' ? 'lichtenberg' : el === 'water' ? 'ripple' : el === 'nature' ? 'flower' : el === 'earth' ? 'crack' : el === 'light' ? 'rune' : 'scorch',
        gpt(pos), Math.min(3, 1.1 * s), 3.5, { el, castId: curCast });
    } finally { curOwner = 'player'; curCast = 0; }
  }
  vfx.impact = (pos, opts = {}) => {
    if (!pos) return;
    const s = Math.max(0.2, Math.min(4, opts.scale ?? 1));
    impactFx(pos.clone ? pos.clone() : pos, opts.element || 'physical', s, false, opts.normal || null, opts);
  };
  vfx.explosion = (pos, opts = {}) => {
    if (!pos) return;
    const s = Math.max(0.3, Math.min(4, opts.scale ?? 1));
    impactFx(pos.clone ? pos.clone() : pos, opts.element || 'physical', s, true, opts.normal || null, opts);
    vfx.shake(Math.min(0.35, 0.1 + 0.08 * s));
  };

  // ---------------------------------------------------------------- reaction families (kit; ≤ 60 particles, no domes, ≤ 1 ring)
  const FAM = {
    burst(p, a, b, s) {
      line({ shape: 'ring', el: a, pos: nearGround(p) ? gpt(p) : p, plane: nearGround(p) ? 'ground' : 'billboard', r: 3.2 * s, width: 0.05, life: 0.42, tIn: 0, tOut: 0.25, scaleIn: 'expand' });
      sigLine(a, p, 1.3 * s);
      burst(p, { count: Math.round(14 * s), shape: SPARK[a] === 'rock' ? 'spark' : SPARK[a], color: [hex(a, 'light'), hex(a, 'mid')], speed: 11 * Math.sqrt(s), drag: 2.5, gravity: 5, size: 0.16, sizeEnd: 0.04, life: 0.45, velocityStretch: 0.05 });
      burst(p, { count: Math.round(12 * s), shape: SPARK[b], color: [hex(b, 'mid'), hex(b, 'dark')], speed: 7 * Math.sqrt(s), drag: 2, gravity: 6, size: 0.24, sizeEnd: 0.1, life: 0.65 });
      burst(p, { count: Math.round(5 * s), shape: 'smoke', color: [hex(a, 'dark'), hex('physical', 'dark')], alpha: 0.3, speed: 1.6 * s, drag: 1.4, gravity: -1, size: 0.7 * s, sizeEnd: 1.4 * s, life: 0.7, fadeIn: 0.12, radius: 0.3 * s });
      vfx.flashSprite(p, hex(a, 'light'), 1.4, 0.08, 0.6, { owner: curOwner, castId: curCast, el: a });
      if (!noDecal && nearGround(p)) K().decal('scorch', gpt(p), 1.6 * s, 3, { el: a, castId: curCast, owner: curOwner });
    },
    control(p, a, b, s) {
      line({ shape: 'ring', el: b, pos: nearGround(p) ? gpt(p) : p, plane: nearGround(p) ? 'ground' : 'billboard', r: 2.6 * s, width: 0.06, life: 0.4, tIn: 0, tOut: 0.15, scaleIn: 'contract' });
      sigLine(a, p, 0.9 * s, { spin: -1.2 });
      burst(p, { count: Math.round(14 * s), shape: SPARK[a], color: [hex(a, 'light'), hex(a, 'mid')], radius: 1.6 * s, inward: true, speed: 5 * s, drag: 0.4, size: 0.22, sizeEnd: 0.08, life: 0.3, velocityStretch: 0.04 });
      burst(p, { count: Math.round(10 * s), shape: SPARK[b], color: [hex(b, 'light'), hex(b, 'mid')], speed: 3.5 * s, drag: 2.5, size: 0.2, sizeEnd: 0.08, life: 0.6 });
      if (!noDecal && nearGround(p)) K().decal(a === 'ice' || b === 'ice' ? 'frost' : a === 'lightning' ? 'lichtenberg' : 'crack', gpt(p), 1.6 * s, 3, { el: a, castId: curCast, owner: curOwner });
    },
    spread(p, a, b, s) {
      line({ shape: 'spiral', turns: 0.9, arms: 3, r2: 0.15, el: a, pos: nearGround(p) ? gpt(p) : p, plane: 'ground', r: 3.4 * s, width: 0.05, life: 0.6, tIn: 0.12, tOut: 0.3, spin: 3, erode: true });
      burst(p, { count: Math.round(16 * s), shape: 'streak', color: [hex(b, 'light'), hex(b, 'mid')], disc: true, radius: 0.5 * s, speed: 8 * s, tangential: 5, up: 1, drag: 2.2, size: 0.2, sizeEnd: 0.06, life: 0.5, velocityStretch: 0.06 });
      burst(p, { count: Math.round(10 * s), shape: SPARK[b], color: [hex(b, 'mid'), hex(b, 'dark')], disc: true, radius: 0.4 * s, speed: 3.5, tangential: 6, up: 2.5, curl: 4, drag: 1.4, gravity: 2, size: 0.22, life: 1.0, rotSpeed: 6 });
    },
    surface(p, a, b, s) {
      const g = nearGround(p) ? gpt(p) : p;
      if (!noDecal) K().decal(b === 'water' || a === 'water' ? 'ripple' : 'scorch', g, 2.2 * s, 2.5, { el: b, castId: curCast, owner: curOwner });
      line({ shape: 'ring', el: a, pos: g, plane: 'ground', r: 2.8 * s, width: 0.04, life: 0.5, tIn: 0, tOut: 0.3, scaleIn: 'expand' });
      burst(g, { count: Math.round(14 * s), shape: SPARK[a], color: [hex(a, 'light'), hex(a, 'mid')], disc: true, radius: 1.8 * s, speed: 1.2, up: 3.5 * s, drag: 1.8, size: 0.22, sizeEnd: 0.08, life: 0.8, velocityStretch: 0.04 });
      burst(g, { count: Math.round(8 * s), shape: SPARK[b], color: [hex(b, 'light'), hex(b, 'mid')], disc: true, radius: 2.2 * s, speed: 0.5, up: 1.4, size: 0.2, life: 1.0 });
      burst(g, { count: Math.round(5 * s), shape: 'smoke', color: [hex(b, 'light'), hex(b, 'mid')], alpha: 0.28, disc: true, radius: 1 * s, speed: 1.5 * s, up: 1.2, drag: 1.6, size: 0.8 * s, sizeEnd: 1.6 * s, life: 0.8, fadeIn: 0.12 });
    },
    blessing(p, a, b, s) {
      const g = nearGround(p) ? gpt(p) : p;
      if (curOwner === 'player') vfx.runeCircle?.(g, { element: a, r: 1.8 * s, dur: 1.0, rotSpeed: 1.4 });
      else line({ shape: 'ring', el: a, pos: g, plane: 'ground', r: 2 * s, width: 0.06, life: 0.8 });
      burst(p, { count: Math.round(12 * s), shape: 'mote', color: [hex(a, 'light'), hex(a, 'mid')], radius: 1.1 * s, speed: 0.5, up: 2.6, drag: 0.8, size: 0.16, sizeEnd: 0.05, life: 1.0, flicker: true });
      burst(p, { count: Math.round(8 * s), shape: 'streak', color: [hex(a, 'light'), hex(a, 'mid')], dir: UP, spread: 0.08, speed: 10 * s, drag: 3, size: 0.3, sizeEnd: 0.08, life: 0.3, velocityStretch: 0.08 });
      burst(p, { count: Math.round(8 * s), shape: SPARK[b], color: [hex(b, 'light'), hex(b, 'mid')], speed: 2.5 * s, up: 1.2, drag: 2, size: 0.22, sizeEnd: 0.1, life: 0.9, sway: true });
    },
    curse(p, a, b, s) {
      const g = nearGround(p) ? gpt(p) : p;
      line({ shape: 'crescent', el: 'shadow', pos: p, plane: 'billboard', r: 1.1 * s, life: 0.5, tIn: 0.1, tOut: 0.3, erode: true, color: hex('shadow', 'dark'), color2: hex('shadow', 'light'), alpha: 0.8 });
      line({ shape: 'ring', el: 'shadow', pos: g, plane: 'ground', r: 2.4 * s, width: 0.05, life: 0.45, tIn: 0, tOut: 0.2, scaleIn: 'contract', color: hex('shadow', 'light') });
      burst(p, { count: Math.round(5 * s), shape: 'smoke', color: [hex('shadow', 'mid'), hex('shadow', 'dark')], alpha: 0.35, additive: false, speed: 0.8, size: 0.8 * s, sizeEnd: 1.5 * s, life: 0.8, radius: 0.3 * s });
      burst(p, { count: Math.round(16 * s), shape: 'wisp', color: [hex('shadow', 'light'), hex(a, 'mid')], radius: 2 * s, inward: true, speed: 5 * s, drag: 0.4, size: 0.26, sizeEnd: 0.05, life: 0.4, velocityStretch: 0.04 });
      burst(p, { count: Math.round(8 * s), shape: SPARK[b], color: [hex(b, 'mid'), hex('shadow', 'mid')], speed: 2.5 * s, up: 1.6, drag: 1.5, size: 0.22, sizeEnd: 0.08, life: 0.9 });
    },
    universal(p, a, b, s) {
      line({ shape: 'ticks', n: 16, r2: 0.7, el: 'physical', pos: p, plane: 'billboard', r: 1.6 * s, width: 0.03, life: 0.4, tIn: 0.05, tOut: 0.25, scaleIn: 'expand', color: hex(a, 'light') });
      burst(p, { count: Math.round(16 * s), shape: 'shard', color: [hex(a, 'light'), hex(b, 'mid')], speed: 11 * s, drag: 2.5, gravity: 8, size: 0.28, sizeEnd: 0.1, life: 0.6, velocityStretch: 0.05 });
      burst(p, { count: Math.round(10 * s), shape: 'spark', color: [hex(a, 'hi'), hex(a, 'light')], speed: 5 * s, drag: 2.5, size: 0.2, sizeEnd: 0.05, life: 0.4 });
    },
  };
  // small signature layers (≤ 20 particles each, no white)
  const SIG = {
    evaporate(p, s) { burst(p, { count: Math.round(6 * s), shape: 'smoke', color: [hex('water', 'light'), hex('physical', 'light')], alpha: 0.3, speed: 2 * s, up: 1.2, drag: 1.2, gravity: -1, size: 0.9 * s, sizeEnd: 1.8 * s, life: 0.9, fadeIn: 0.1 }); },
    superconduct(p, s) { burst(p, { count: Math.round(14 * s), shape: 'spark', color: [hex('ice', 'hi'), hex('lightning', 'light')], speed: 10 * s, drag: 3, size: 0.12, sizeEnd: 0.03, life: 0.35, velocityStretch: 0.06 }); },
    wildfire(p, s) { burst(p, { count: Math.round(14 * s), shape: 'petal', color: [hex('fire', 'light'), hex('fire', 'mid')], speed: 3 * s, up: 2.4, curl: 3, drag: 1.4, gravity: -1, size: 0.2, sizeEnd: 0.06, life: 1.1, flicker: true, additive: true, rotSpeed: 5 }); },
    sanctify(p, s) { burst(p, { count: Math.round(12 * s), shape: 'ember', color: [hex('light', 'light'), hex('fire', 'light')], radius: 0.5 * s, up: 3, speed: 1, drag: 1, size: 0.22, sizeEnd: 0.05, life: 0.8, flicker: true }); },
    necroflame(p, s) { burst(p, { count: Math.round(12 * s), shape: 'ember', color: [hex('shadow', 'light'), hex('shadow', 'mid')], radius: 0.4 * s, up: 3, speed: 1, size: 0.22, sizeEnd: 0.05, life: 0.9, flicker: true }); },
    prism(p, s) {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + (curCast % 7); K().bolt({ from: p, to: K().v3(p.x + Math.cos(a) * 4 * s, p.y + 0.5, p.z + Math.sin(a) * 4 * s), forks: 0, jagged: 0, width: 0.06, halo: 0.22, life: 0.18, afterglow: 0.2, el: ['light', 'ice', 'nature'][i], owner: curOwner, castId: curCast }); }
    },
    judgment(p, s) {
      const g = nearGround(p) ? gpt(p) : p;
      K().bolt({ from: K().v3(g.x, g.y + 14, g.z), to: K().v3(g.x, g.y, g.z), forks: 0, jagged: 0, width: 0.1, halo: 0.6, life: 0.3, afterglow: 0.25, el: 'light', owner: curOwner, castId: curCast });
      burst(g, { count: Math.round(14 * s), shape: 'feather', color: [hex('light', 'light'), hex('light', 'mid')], disc: true, radius: 1 * s, speed: 3.5 * s, up: 2, drag: 2, gravity: 1, size: 0.26, life: 1.2, sway: true });
      vfx.screenFlash?.(hex('light', 'mid'), 0.15, 0.1);
    },
    shatter(p, s) { vfx.debris(p, { count: Math.round(8 * s), material: 'ice', color: hex('ice', 'light'), size: 0.3, speed: 9, life: 1.2 }); },
    magma(p, s) { const g = nearGround(p) ? gpt(p) : p; vfx.debris(g, { count: Math.round(6 * s), material: 'rock', color: hex('earth', 'dark'), size: 0.3, speed: 10 }); burst(g, { count: Math.round(14 * s), shape: 'ember', color: [hex('fire', 'light'), hex('fire', 'mid')], speed: 10, dir: UP, spread: 0.35, size: 0.16, life: 0.8, gravity: 12 }); },
    eclipse(p, s) { line({ shape: 'ring', el: 'light', pos: p, plane: 'billboard', r: 1.6 * s, width: 0.05, life: 0.5, tIn: 0.1, tOut: 0.25 }); },
    resonance(p, s) { burst(p, { count: Math.round(14 * s), shape: 'rune', color: [hex('light', 'light'), hex('light', 'mid')], disc: true, radius: 0.6, speed: 4 * s, up: 1, size: 0.26, sizeEnd: 0.08, life: 0.7 }); },
    break(p, s) { burst(p, { count: Math.round(14 * s), shape: 'shard', color: [hex('physical', 'light'), hex('lightning', 'light')], speed: 12 * s, drag: 2, gravity: 10, size: 0.3, life: 0.7, velocityStretch: 0.06 }); },
  };

  // ---------------------------------------------------------------- dispatcher + per-frame budget
  let fullThisFrame = 0, maxFull = 0, reducedCount = 0, presetCount = 0;
  let filled = false;
  function rxMeta(id) {
    const defs = game.combat?.REACTION_DEFS;
    if (defs && !filled) { for (const r of defs) { if (!FAMILY_OF[r.id]) FAMILY_OF[r.id] = r.family; if (!ELEMENTS_OF[r.id]) ELEMENTS_OF[r.id] = r.elements; } filled = true; }
    return { family: FAMILY_OF[id] || 'burst', els: ELEMENTS_OF[id] || ['physical', 'physical'] };
  }
  function preset(id, pos, opts = {}) {
    if (!pos || !id) return false;
    presetCount++;
    const p = pos.clone ? pos.clone() : K().v3(pos.x, pos.y, pos.z);
    const s = Math.max(0.3, Math.min(3, opts.scale ?? 1));
    if (id.startsWith('impact_')) { impactFx(p, id.slice(7), s, false, opts.dir || null, opts); return true; }
    if (id.startsWith('explosion_')) { impactFx(p, id.slice(10), s, true, opts.dir || null, opts); vfx.shake(Math.min(0.35, 0.1 + 0.08 * s)); return true; }
    const rid = id.startsWith('rx_') ? id.slice(3) : id;
    let reduced = !!opts.reduced;
    if (!reduced) { if (fullThisFrame >= 4) reduced = true; else fullThisFrame++; }
    if (fullThisFrame > maxFull) maxFull = fullThisFrame;
    if (reduced) reducedCount++;
    const m = rxMeta(rid);
    const els = opts.elements || m.els;
    const a = els[0] === 'physical' ? (els[1] || 'physical') : els[0];
    let b = els[1] || a;
    if (opts.colorEl) b = opts.colorEl;
    const fam = FAM[opts.family || m.family] || FAM.burst;
    kMul = reduced ? 0.25 : 1; noDecal = reduced;
    curOwner = opts.owner === 'enemy' ? 'enemy' : opts.owner === 'world' ? 'world' : 'player'; curCast = opts.castId || 0;
    try {
      fam(p, a, b, s);
      if (!reduced) SIG[rid]?.(p, s);
    } finally { kMul = 1; noDecal = false; curOwner = 'player'; curCast = 0; }
    return true;
  }
  vfx.preset = preset;
  vfx._presetFrame = () => { fullThisFrame = 0; };
  vfx.presetStats = () => ({ maxFullPerFrame: maxFull, reduced: reducedCount, presets: presetCount });
  vfx.resetPresetStats = () => { maxFull = 0; reducedCount = 0; presetCount = 0; };
  vfx.PRESET_FAMILIES = Object.keys(FAM);
  vfx.REACTION_FAMILY_OF = FAMILY_OF;
}
