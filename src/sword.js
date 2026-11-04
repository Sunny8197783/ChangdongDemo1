// Melee engine (game.sword) for every melee-family class: 검사 (longsword), 성기사 (warhammer + shield), 암살자 (twin daggers).
// Engine: action timeline (procedural pose templates + timed events + swept hit windows), attack buffering, cancel
// windows, soft-lock lunge, per-hit presentation (blade sparks, weapon smear, slash arcs, blade ribbons). Hit feel
// (hitstop / trauma / FOV / impact particles) is combat's: every melee hit sets hit.tier + hit.hitstopMul (CONTRACT §8.3, §12).
//  - sword/moves.js      longsword movesets (classic elements, v2) + elmoves2.js (water / nature / light / shadow + payloads)
//  - sword/classmoves.js paladin + shadowblade base movesets      - sword/weapons.js  weapon profiles + element palette
//  - sword/archetypes.js melee forms of all 24 skill archetypes    - sword/bespoke.js  melee forms of the new ultimates
// v3 keymap: game.skills owns LMB/RMB/1-4/X/G/R/Z and calls game.sword.api.playLegacy / the archetypes. Legacy keymap
// (?path=): the v2 input handling below stays active (Digit1-5 elements, F ultimate when nothing is offered, G, R).
import * as THREE from 'three';
import { clamp, damp, rand } from './core/utils.js';
import { ALL_ELEMENTS, CLASSIC_ELEMENTS, elName, elColor } from './core/elements.js';
import { CLASS_DEFS, familyOf } from './core/classes.js';
import { TPL, sampleTpl, tplFor } from './sword/anim.js';
import { PF, STANCE } from './sword/pose.js';
import { SlashArcs, BladeTrail, Spikes, StoneSwords, OrbitBlades, Dragon } from './sword/fx.js';
import { buildMoves, CD } from './sword/moves.js';
import { buildClassMoves, CLASS_MOVES_KO } from './sword/classmoves.js';
import { weaponFor, palOf, ambOf, statusOf, CAST_KIND, WEAPONS } from './sword/weapons.js';
import { registerMeleeArchetypes } from './sword/archetypes.js';
import { registerMeleeBespoke } from './sword/bespoke.js';
import { createLooks } from './sword/looks.js';

const MIN_CHARGE = 0.35, FULL_CHARGE = 1.2;
const BUFFER_T = 0.42, COMBO_RESET = 0.55;
const TWO_PI = Math.PI * 2;
const SLOT_OF = { combo: 'basic', heavy: 'charged', ultimate: 'ultimate', ultimateAwakened: 'ultimate', support: 'support', finisher: 'finisher' };
const DIGITS = CLASSIC_ELEMENTS.map((_, i) => 'Digit' + (i + 1));
const CHARGE_STANCE = { longsword: 'charge', hammer: 'hammerCharge', daggers: 'daggerCharge' };
// v4 dodge-cancel windows (PLAN §5.8): combo lock ≤ 0.25 s, charged from 0.10 s after release, actives from 0.10 s after the first
// damage frame (0.35 s without damage), ultimates from the first damage frame, finishers locked but fully invulnerable.
const COMBO_LOCK = 0.25, AFTER_DMG = 0.10, NO_DMG = 0.35;

export function createSword(game) {
  const { scene, events } = game;
  const P = () => game.player;
  const prog = () => game.progression;
  const vfx = () => game.vfx;
  // v4: every legacy vfx call of the melee files goes through the look gate (sword/looks.js)
  const vcall = (name, ...a) => { try { return look.call(name, a); } catch (e) { warnOnce('vcall:' + name, e); return null; } };
  const sfx = (name, opts) => { try { game.audio?.play?.(name, opts); } catch (e) { /* */ } };
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn('[sword]', k, ...a); } };

  // ---------------- fx pools (every material built here, once; private materials ducked through vfx.applyPlayerFx) ----------------
  const fxMats = [];
  const onMat = (m, role) => { fxMats.push(m); try { game.vfx?.applyPlayerFx?.(m, { role }); } catch (_) { /* vfx optional */ } };
  const FXO = { game, onMat };
  const fx = {
    arcs: new SlashArcs(scene, 20, FXO), trail: new BladeTrail(scene, FXO), trail2: new BladeTrail(scene, FXO),
    iceSpikes: new Spikes(scene, 'ice', 64, FXO), rockSpikes: new Spikes(scene, 'rock', 48, FXO), crystal: new Spikes(scene, 'crystal', 48, FXO),
    stones: new StoneSwords(scene, 3, FXO), orbit: new OrbitBlades(scene, 12, FXO), dragon: new Dragon(scene, 26, FXO),
  };
  // spike pools count against the cast's accent budget (sword/looks.js) and carry its castId
  for (const k of ['iceSpikes', 'rockSpikes', 'crystal']) {
    const pool = fx[k], raw = pool.spawn.bind(pool);
    pool.spawn = (p, h, w, delay, life, tilt, color) => (look.spikeOk() ? raw(p, h, w, delay, life, tilt, k === 'crystal' ? crystalTint(color) : color, look.cur?.castId || 0) : null);
  }
  const crystalTint = (hex) => { const el = look.cur?.el || element; const R = look.h.rampOf(el); return hex == null || hex >= 0xe0e0e0 ? R.mid : hex; };

  // ---------------- look engine (cast contexts + vfx gate + motifs; registered in the FACTORY before the boot prewarm) ----------------
  const engineRef = { get weapon() { return weapon; }, S: null };
  const look = createLooks(game, engineRef);
  try { look.installMotifs(); } catch (err) { console.error('[sword] motifs', err); }

  // ---------------- state ----------------
  let element = 'fire', index = 0;
  let act = null;                 // current action
  let poseW = 0;
  const pose = new Float32Array(PF), tplPose = new Float32Array(PF);
  let comboStep = 0, comboIdle = 9, buffer = 0, bufferKind = null;
  const bufferTag = { skillId: null, slot: null, castId: 0 };
  let charging = false, chargeT = 0, chargeFrac = 0, chargeLoop = null, chargeFull = false, chargeFxT = 0;
  let v3Charge = false;           // showing the charge pose for game.skills' RMB charge
  let lastCastId = 0;             // castId of the last melee cast (tests: vfx.debug.byCast)
  const cooldowns = { heavy: 0, ultimate: 0, support: 0 };
  let idleT = 0, ambT = 0, igniteCd = 0, airAttacks = 0;
  const tasks = [];
  const buffs = { id: null, src: null, t: 0, dur: 0, emitter: null, tick: 0, def: null };
  let heavyBuf = 0;
  let weapon = WEAPONS.longsword, weaponId = null;
  const tag = { skillId: null, slot: null };   // tag for the next startAction (skill id / slot on its hits)
  let inSkillsCast = 0;                       // >0 while a v3 skills path is running (setters stay silent)

  // scratch
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const lineP = new THREE.Vector3(), hitP = new THREE.Vector3(), hitD = new THREE.Vector3(), tipW = new THREE.Vector3(), baseW = new THREE.Vector3();
  const tip2 = new THREE.Vector3(), base2 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const smE = new THREE.Euler(0, 0, 0, 'YXZ'), smQ = new THREE.Quaternion();

  const clsOf = () => prog()?.cls || null;
  const isMeleeCls = () => { const c = clsOf(); return !!c && !!CLASS_DEFS[c] && familyOf(c) === 'melee'; };
  const active = () => isMeleeCls() && prog()?.chosen !== false;
  const v3Mode = () => game.skills?.ownsInput === true;
  const pos = () => P().object.position;
  const groundAt = (x, z) => { const w = game.world; const h = w?.getGroundHeight ? w.getGroundHeight(x, z) : w?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; };
  const fwd = (out, yaw = P().facing) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
  const styleNow = () => P()?.style || CLASS_DEFS[clsOf()]?.style || 'longsword';

  // ---------------- scheduler (gameplay time: hitstop stretches it) ----------------
  // tasks carry the cast context they were scheduled in (their vfx stay attributed to that castId and its budget)
  function after(t, fn) { tasks.push({ t, fn, every: 0, left: 0, look: look.cur }); }
  function every(interval, duration, fn) { tasks.push({ t: 0, fn, every: interval, left: duration, look: look.cur }); }
  function runTasks(dt) {
    const prev = look.cur;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const k = tasks[i];
      if (!k) continue;
      k.t -= dt;
      look.cur = k.look;
      if (k.every) {
        k.left -= dt;
        if (k.t <= 0) { k.t += k.every; try { if (k.fn(k) === false) k.left = 0; } catch (err) { console.error('[sword] task', err); k.left = 0; } }
        if (k.left <= 0) { const j = tasks.indexOf(k); if (j >= 0) tasks.splice(j, 1); }
      } else if (k.t <= 0) { const j = tasks.indexOf(k); if (j >= 0) tasks.splice(j, 1); try { k.fn(); } catch (err) { console.error('[sword] task', err); } }
    }
    look.cur = prev;
  }

  // ---------------- targeting ----------------
  function isFoe(e) { return e && e.alive && e.team !== 'player' && e.object && !e.invulnerable; }
  /** Soft-lock: best enemy in front (input direction, else camera) within range. */
  function findTarget(range = 6.5, coneCos = 0.2, from = pos()) {
    const pl = P();
    const cf = pl.camForward;
    let dx = cf ? cf.x : Math.sin(pl.facing), dz = cf ? cf.z : Math.cos(pl.facing);
    const inp = game.input;
    const ix = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0), iz = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    if (ix || iz) {
      const yaw = pl.yaw;
      const fx_ = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      dx = rx * ix + fx_ * iz; dz = rz * ix + fz * iz;
    }
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let best = null, bestS = Infinity;
    for (const e of game.entities) {
      if (!isFoe(e)) continue;
      const p = e.object.position;
      const ex = p.x - from.x, ez = p.z - from.z, d = Math.hypot(ex, ez);
      if (d > range + (e.radius || 0.5) || Math.abs(p.y - from.y) > 4) continue;
      const c = d > 0.01 ? (ex * dx + ez * dz) / d : 1;
      if (c < coneCos && d > 1.6) continue;
      const s = d * (1.6 - c) * (e.isProp ? 1.8 : 1);
      if (s < bestS) { bestS = s; best = e; }
    }
    return best;
  }
  function foesNear(center, r, out = []) {
    out.length = 0;
    for (const e of game.entities) {
      if (!isFoe(e)) continue;
      const p = e.object.position;
      const dx = p.x - center.x, dz = p.z - center.z, rr = r + (e.radius || 0.5);
      if (dx * dx + dz * dz > rr * rr || p.y > center.y + r + 1 || p.y + (e.height || 1.6) < center.y - r - 1) continue;
      out.push(e);
    }
    return out;
  }
  const centerOf = (e, out) => (e.getCenter ? e.getCenter(out) : out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5));

  const _fz = new THREE.Vector3();
  // ---------------- damage ----------------
  const isCombatV3 = () => !!(game.combat?.TIER_RANK || game.combat?.REACTION_DEFS || game.combat?.STATUS_DEFS);
  /**
   * spec: {amount, kb, launch, status, heavy, tier, hsOverride (explicit hitstop, rare), tags, sound ('light'|'heavy'|false),
   *        sparks, dirMode ('out'|'fwd'|'in'|vector), noReaction, poise, lifesteal, ctx (skills ctx → skillId/slot/castMul),
   *        el (element override), onHit(e, point, res)}
   * Base amounts are UNSCALED (combat.dealDamage applies the canonical formula, CONTRACT §8.3).
   */
  function applyHit(e, spec, point, dir, elOverride) {
    if (!isFoe(e)) return null;
    const el = elOverride || spec.el || element;
    const counter = !!act?.counter && !spec.ctx && !spec.noCounter;
    const amount = (spec.amount || 0) * (counter ? 2 : 1);
    const tags = ['melee', weapon.id];
    if (spec.tags) for (const t of spec.tags) tags.push(t);
    if (counter) tags.push('counter');
    const kind = act?.kind;
    let tier = spec.tier;
    if (!tier) tier = counter ? 'crit' : spec.heavy ? ((kind === 'ultimate' || kind === 'finisher') ? 'ult' : 'heavy') : 'light';
    const hit = {
      amount, element: el, source: P()?.entity || 'player', point, direction: dir, knockback: spec.kb ?? 3, launch: spec.launch || 0,
      status: spec.status, heavy: !!spec.heavy || counter, tags, tier, hitstopMul: weapon.hitstopMul,
      noReaction: spec.noReaction, crit: counter || spec.crit || undefined,
    };
    if (spec.hsOverride != null) hit.hitstop = spec.hsOverride + (counter ? 0.04 : 0);
    if (spec.poise != null) hit.poise = spec.poise;
    else if (weapon.poiseMul !== 1) hit.poise = amount * 0.5 * weapon.poiseMul;
    if (spec.lifesteal) hit.lifesteal = spec.lifesteal;
    if (kind === 'heavy') hit.charged = true;
    if (kind === 'finisher' || spec.tags?.includes('finisher')) hit.finisher = true;
    if (kind === 'combo' && !counter) {
      const st = game.stats;
      const cm = st?.get?.('comboDmgMul');
      if (cm && cm !== 1) hit.castMul = (hit.castMul || 1) * cm;                       // 검성: through the canonical formula
      if (hit.status && /^c4|^p3|^d6/.test(act.name || '') && st?.get?.('comboStatusTwice')) {   // 이중 각인
        const o = {};
        for (const k in hit.status) { const v = hit.status[k]; o[k] = typeof v === 'number' ? { dur: v, stacks: 2 } : { ...v, stacks: (v?.stacks || 1) + 1 }; }
        hit.status = o;
      }
    }
    if (spec.ctx) { try { spec.ctx.hit(hit); } catch (_) { /* */ } }
    else if (act && act.tagSkill) { hit.skillId = act.tagSkill; hit.slot = act.tagSlot; }
    // v4: castId on every hit (one hitstop / feel per cast); melee plays its own contact sparks + final burst (§3.6)
    const cc = look.cur;
    hit.castId = cc?.castId || spec.ctx?.castId || hit.castId || 0;
    if (game.vfx?.kit) hit.noImpactFx = true;
    let res = null;
    try { res = game.combat?.dealDamage?.(e, hit); } catch (err) { console.error('[sword] dealDamage', err); }
    if (!res || (!res.damage && !res.reaction)) return res;
    // combat v3 adds awakening itself; a v2 combat (or a stub) needs the old melee contribution
    if (!isCombatV3() && !tags.includes('finisher')) { try { prog()?.addAwakening?.(res.damage * 0.12); } catch (_) { /* */ } }
    // per blade contact: one element motif spark (≤ 6 particles); the full burst plays only on the move's final hit
    if (cc && act && cc === act.look && act.dmgT == null) act.dmgT = act.t;
    if (spec.sparks !== false) {
      v4.copy(dir).setY(0.25).normalize();
      look.contact(point, v4, el, !!hit.heavy || tier === 'ult');
    }
    if (spec.sound !== false) {
      sfx(hit.heavy ? 'sword_hit_heavy' : 'sword_hit', { position: point, pitch: rand(0.92, 1.08) * (weapon.id === 'hammer' ? 0.75 : weapon.id === 'daggers' ? 1.2 : 1) });
    }
    try { spec.onHit?.(e, point, res); } catch (err) { console.error('[sword] onHit', err); }
    S.hits++;
    return res;
  }
  /** Hit point on entity e as seen from origin o (near the blade height). */
  function contact(e, o, out, y = 1.1) {
    centerOf(e, out);
    v3.subVectors(o, out).setY(0);
    const d = v3.length();
    if (d > 1e-3) out.addScaledVector(v3.multiplyScalar(1 / d), Math.min(d * 0.5, (e.radius || 0.5) * 0.8));
    out.y = clamp(o.y + y, e.object.position.y + 0.2, e.object.position.y + (e.height || 1.6) * 0.85);
    return out;
  }
  function outDir(e, o, out) {
    out.subVectors(e.object.position, o).setY(0);
    if (out.lengthSq() < 1e-6) fwd(out); else out.normalize();
    return out;
  }
  function dirFor(spec, e, origin, fwdDir, out) {
    const m = spec.dirMode;
    if (m === 'fwd' && fwdDir) return out.copy(fwdDir);
    if (m && m.isVector3) return out.copy(m);
    outDir(e, origin, out);
    if (m === 'in') out.negate();
    return out;
  }
  const _near = [];
  function hitCircle(center, r, spec, set = null, yRange = 3, el) {
    const list = foesNear(center, r, _near);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (set) { if (set.has(e)) continue; set.add(e); }
      if (Math.abs(e.object.position.y - center.y) > yRange + (e.height || 1.6)) continue;
      contact(e, center, hitP, 0.9);
      dirFor(spec, e, center, spec.dirMode === 'fwd' ? fwd(v2) : null, hitD);
      if (applyHit(e, spec, hitP, hitD, el)) n++;
    }
    return n;
  }
  function hitLine(from, dir, len, width, spec, set = null, el) {
    let n = 0;
    for (const e of game.entities) {
      if (!isFoe(e) || (set && set.has(e))) continue;
      const p = e.object.position, r = e.radius || 0.5;
      const ex = p.x - from.x, ez = p.z - from.z;
      const along = ex * dir.x + ez * dir.z, perp = Math.abs(ex * dir.z - ez * dir.x);
      if (along < -r || along > len + r || perp > width * 0.5 + r) continue;
      if (p.y > from.y + 3 || p.y + (e.height || 1.6) < from.y - 2) continue;
      if (set) set.add(e);
      lineP.copy(from).addScaledVector(dir, clamp(along, 0, len));
      contact(e, lineP, hitP, 0.9);
      if (spec.dirMode === 'out' || spec.dirMode === 'in') dirFor(spec, e, from, null, hitD); else hitD.copy(dir);
      if (applyHit(e, spec, hitP, hitD, el)) n++;
    }
    return n;
  }

  // ---------------- arcs (visual) ----------------
  /** Spawn a crescent relative to the hero. o: {yaw (abs), tilt, pitch, a0, a1, rout, rin, h, sweep, life, fwdOff, scale, vel, grow, opacity, el} */
  function arc(o) {
    const yaw = o.yaw ?? P().facing;
    if (!look.arcFor(o)) return null;            // per-element crescent profile + per-cast budget (sword/looks.js)
    v1.copy(o.pos || pos()); v1.y += o.h ?? 1.1;
    if (o.fwdOff) v1.addScaledVector(fwd(v2, yaw), o.fwdOff);
    return fx.arcs.spawn({
      pos: v1, yaw, tilt: o.tilt || 0, pitch: o.pitch || 0, start: o.a0, span: o.a1 - o.a0,
      rin: o.rin ?? (o.rout ?? 2.5) * 0.58, rout: o.rout ?? 2.5, el: o.el, kind: o.kind, sweep: o.sweep ?? 0.09,
      life: o.life ?? 0.26, scale: o.scale || 1, vel: o.vel, grow: o.grow, opacity: Math.min(1, o.opacity ?? 1), castId: o.castId, seed: o.seed,
    });
  }
  /** DESIGN §9 A1: 1–2 frame smear crescent (combat's pooled mesh) in the slash plane. */
  function smear(yaw, tilt, reach, h = 1.05, el = element) {
    if (!vfx()?.smear) return;
    v1.copy(pos()); v1.y += h;
    smE.set(-Math.PI / 2 + (tilt || 0) * 0.6, yaw - Math.PI / 2, tilt || 0, 'YXZ');
    smQ.setFromEuler(smE);
    vcall('smear', weapon.smear, v1, smQ, reach, el);
  }

  // ---------------- actions ----------------
  /**
   * spec: {name, kind, tpl, dur, cancel (s), move, turn, facing ('target'|'camera'|yaw|null), lunge (m, max),
   *   events:[[t, fn]], hits:[{t0, t1, shape:'arc'|'line'|'circle'|'sector', a0, a1, reach, inner, y0, y1, len, width, r,
   *   spec, arc: {tilt, h, rin, rout, ...} }], spin: {t0, t1, turns}, setVy:[[t, vy]], gravityMul, superArmor,
   *   noGlide, onUpdate(dt, act), onEnd(act, interrupted), trail: [t0, t1], noWeaponScale, keepTpl, speed }
   * The weapon profile scales reach (×reachMul) and speed (×speedMul) unless noWeaponScale is set; templates map per style.
   */
  function startAction(spec) {
    const pl = P();
    if (act) endAction(true);
    refreshWeapon();
    const tgt = spec.target !== undefined ? spec.target : (spec.lunge != null ? findTarget(spec.lockRange || 6.5) : null);
    let yaw = pl.facing;
    if (spec.facing === 'camera') yaw = pl.yaw + Math.PI;
    else if (typeof spec.facing === 'number') yaw = spec.facing;
    else if (tgt) yaw = Math.atan2(tgt.object.position.x - pos().x, tgt.object.position.z - pos().z);
    else {
      // face the input direction (or keep facing) for untargeted swings
      const inp = game.input;
      const ix = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0), iz = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
      if (ix || iz) { const y = pl.yaw; yaw = Math.atan2(Math.cos(y) * ix - Math.sin(y) * iz, -Math.sin(y) * ix - Math.cos(y) * iz); }
    }
    let atk = 1;
    try { atk = game.stats?.get?.('atkSpeed') ?? pl.mods?.atkSpeed ?? 1; } catch (_) { atk = 1; }
    const scaleW = !spec.noWeaponScale;
    const speed = (Number.isFinite(atk) && atk > 0 ? atk : 1) * (spec.speed || 1) * (scaleW ? weapon.speedMul : 1);
    act = {
      ...spec, tpl: spec.keepTpl ? spec.tpl : tplFor(spec.tpl, weapon.id), t: 0, speed, yaw0: yaw, target: tgt, counter: false, hitsets: [], lungeDist: 0, done: false,
      reachMul: scaleW ? weapon.reachMul : 1,
      evDone: new Uint8Array((spec.events || []).length), vyDone: new Uint8Array((spec.setVy || []).length),
      prevS: new Float32Array((spec.hits || []).length).fill(-1), airborne: !pl.grounded && airAttacks < 4,
      tagSkill: tag.skillId, tagSlot: tag.slot, look: look.cur, dmgT: null,
    };
    tag.skillId = null; tag.slot = null;
    if (!pl.grounded) airAttacks++;
    for (let i = 0; i < (spec.hits || []).length; i++) act.hitsets.push(new Set());
    if (pl.counterReady > 0 && (spec.kind === 'combo' || spec.kind === 'heavy')) { act.counter = true; pl.consumeCounter(); }
    // lunge toward the soft-locked target (root motion clamps to the target distance − 0.8 m, DESIGN §9 S4)
    if (spec.lunge != null) {
      if (tgt) {
        const d = Math.hypot(tgt.object.position.x - pos().x, tgt.object.position.z - pos().z) - (tgt.radius || 0.5) - 0.8;
        act.lungeDist = clamp(d, 0, spec.lunge);
      } else act.lungeDist = Math.min(0.45, spec.lunge);
    }
    pl.setSwordDrawn(true);
    idleT = 0;
    return act;
  }
  function endAction(interrupted) {
    if (!act) return;
    const a = act; act = null;
    try { a.onEnd?.(a, interrupted); } catch (err) { console.error('[sword] onEnd', err); }
  }
  const sInWin = (t, t0, t1) => clamp((t - t0) / Math.max(1e-4, t1 - t0), 0, 1);

  function runHits(a, tPrev, tNow) {
    const hits = a.hits; if (!hits) return;
    const p = pos();
    const rm = a.reachMul || 1;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const t0 = h.t0 * a.dur, t1 = h.t1 * a.dur;
      if (tNow < t0 || tPrev > t1) continue;
      const sPrev = a.prevS[i] < 0 ? 0 : a.prevS[i];
      const sNow = sInWin(tNow, t0, t1);
      if (a.prevS[i] < 0) {
        // window opens: spawn the visual crescent matched to the sweep + the weapon smear
        const yawO = h.follow ? P().facing : a.yaw0;
        if (h.arc) arc({ yaw: yawO, a0: h.a0 ?? -1.5, a1: h.a1 ?? 1.5, sweep: Math.max(0.05, (t1 - t0) / a.speed), rout: (h.reach || 2.5) * rm + 0.2, ...h.arc, ...(rm !== 1 && h.arc?.rout ? { rout: h.arc.rout * rm } : null) });
        if (h.arc && h.smear !== false) smear(yawO, h.arc.tilt || 0, (h.reach || 2.5) * rm * 0.9, h.arc.h ?? 1.05);
        if (h.swing !== false) sfx(h.heavy || h.spec?.heavy ? 'sword_swing_heavy' : 'sword_swing', { position: p, pitch: rand(0.94, 1.08) * (h.pitch || 1) * (weapon.id === 'hammer' ? 0.8 : weapon.id === 'daggers' ? 1.18 : 1) });
        try { h.onOpen?.(a, h); } catch (err) { console.error('[sword] onOpen', err); }
      }
      a.prevS[i] = sNow;
      const set = a.hitsets[i];
      const yaw = h.follow ? P().facing : a.yaw0;
      if (h.shape === 'arc') sweepArc(h, set, sPrev, sNow, yaw, p, rm);
      else if (h.shape === 'line') { fwd(v2, yaw); v1.copy(p); if (h.back) v1.addScaledVector(v2, -h.back); hitLine(v1, v2, (h.len || 3) * rm, (h.width || 1) * rm, h.spec, set); }
      else if (h.shape === 'circle') { v1.copy(p); if (h.fwdOff) v1.addScaledVector(fwd(v2, yaw), h.fwdOff); hitCircle(v1, (h.r || 3) * rm, h.spec, set); }
      else if (h.shape === 'sector') sweepArc(h, set, 0, 1, yaw, p, rm, true);
    }
  }
  const _sec = { a0: 0, a1: 0, reach: 0, inner: 0, y0: 0, y1: 0, hy: 0, spec: null };
  function sweepArc(h, set, sPrev, sNow, yaw, p, rm = 1, sector = false) {
    let A0 = h.a0, A1 = h.a1;
    if (sector) { A0 = -(h.half || 0.6); A1 = h.half || 0.6; }
    const a0 = A0 + (A1 - A0) * sPrev, a1 = A0 + (A1 - A0) * sNow;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1), mid = (lo + hi) * 0.5;
    const reach = (h.reach || 2.5) * rm + 0.35, inner = h.inner || 0;
    const y0 = p.y + (h.y0 ?? -0.4), y1 = p.y + (h.y1 ?? 2.4);
    for (const e of game.entities) {
      if (!isFoe(e) || set.has(e)) continue;
      const ep = e.object.position, r = e.radius || 0.5;
      if (ep.y > y1 || ep.y + (e.height || 1.6) < y0) continue;
      const dx = ep.x - p.x, dz = ep.z - p.z, d = Math.hypot(dx, dz);
      if (d - r > reach || d + r < inner) continue;
      let ang = Math.atan2(dx, dz) - yaw;
      ang -= Math.round((ang - mid) / TWO_PI) * TWO_PI;
      const hw = d < 0.9 ? Math.PI : Math.atan2(r, d) + 0.16;
      if (ang + hw < lo || ang - hw > hi) continue;
      set.add(e);
      contact(e, p, hitP, h.hy ?? 1.1);
      dirFor(h.spec || {}, e, p, h.spec?.dirMode === 'fwd' ? fwd(v2, yaw) : null, hitD);
      applyHit(e, h.spec, hitP, hitD);
    }
  }

  function updateAction(dt) {
    const prev = look.cur;
    if (act?.look) look.cur = act.look;
    try { updateAction2(dt); } finally { look.cur = prev; }
  }
  /** §5.8 dodge-cancel window of action a at action time tNow (action-time units: seconds × a.speed). */
  function dodgeWindow(a, tNow) {
    if (a._dw === undefined) {
      let t0 = Infinity, t1 = -Infinity;
      for (const h of (a.hits || [])) { t0 = Math.min(t0, (h.t0 ?? 0) * a.dur); t1 = Math.max(t1, (h.t1 ?? 0) * a.dur); }
      let e0 = Infinity;
      for (const e of (a.events || [])) e0 = Math.min(e0, e[0] * a.dur);
      a._dw = { t0, t1, e0, plan: Math.min(t0, a.strikeT != null ? a.strikeT * a.dur : Infinity) };
    }
    const w = a._dw, sp = a.speed || 1;
    if (a.dodgeCancel != null) return tNow >= a.dodgeCancel * a.dur;
    const k = a.kind;
    if (k === 'finisher') return false;                                      // fully invulnerable instead
    if (k === 'combo' || k === 'recover') {
      const T0 = Number.isFinite(w.t0) ? w.t0 : w.e0;
      if (!Number.isFinite(T0)) return true;
      const T1 = Number.isFinite(w.t1) ? Math.max(w.t1, T0) : T0 + COMBO_LOCK * sp;
      return tNow < T0 || tNow >= Math.min(T1, T0 + COMBO_LOCK * sp - 1e-4);
    }
    if (k === 'heavy') return tNow >= AFTER_DMG * sp;                         // released 0.10 s ago
    const fd = a.dmgT != null ? a.dmgT : (Number.isFinite(w.plan) ? w.plan : null);
    if (k === 'ultimate') return fd != null ? tNow >= fd : tNow >= NO_DMG * sp;
    return fd != null ? tNow >= fd + AFTER_DMG * sp : tNow >= NO_DMG * sp;   // actives / supports / counters
  }
  function updateAction2(dt) {
    const pl = P(), A = pl.action;
    const a = act;
    if (!a) {
      poseW = damp(poseW, 0, 14, dt);
      A.active = poseW > 0.02 && !charging && !v3Charge; A.poseW = poseW; A.pose.set(pose);
      A.facing = null; A.move = 1; A.vel.set(0, 0, 0); A.setVy = NaN; A.gravityMul = 1; A.bodyYaw = damp(A.bodyYaw, 0, 20, dt); A.cancelable = true; A.dodgeCancelable = true; A.noGlide = false; A.superArmor = false;
      return;
    }
    const tPrev = a.t;
    a.t += dt * a.speed;
    const tNow = Math.min(a.t, a.dur);
    // pose
    sampleTpl(TPL[a.tpl] || TPL.hold, a.loop ? (tNow % a.loop) / a.loop : tNow / a.dur, tplPose);
    if (a.poseFn) a.poseFn(tplPose, tNow, a);
    poseW = damp(poseW, 1, 40, dt);
    pose.set(tplPose);
    A.active = true; A.pose.set(pose); A.poseW = poseW;
    // facing / motion
    A.facing = a.facing === 'free' ? null : (a.trackCamera ? pl.yaw + Math.PI : a.yaw0);
    A.turn = a.turn || 40;
    A.move = a.move ?? 0.15;
    A.cancelable = a.kind !== 'finisher' && tNow >= (a.cancel ?? a.dur) * 1;
    // v4 dodge-cancel windows (§5.8; player.js reads action.dodgeCancelable): the complete truth of "may dodge now"
    A.dodgeCancelable = a.kind !== 'finisher' && (A.cancelable || dodgeWindow(a, tNow));
    A.noGlide = true; A.superArmor = !!a.superArmor || a.kind === 'finisher';
    if (a.kind === 'finisher') { try { pl.grantIframes?.(0.15); } catch (_) { /* */ } }
    A.gravityMul = a.gravityMul ?? (a.airborne ? 0.15 : 1);
    A.setVy = NaN;
    if (a.airborne && tPrev === 0 && a.kind === 'combo') A.setVy = 0.5;
    if (a.setVy) for (let i = 0; i < a.setVy.length; i++) if (!a.vyDone[i] && tNow >= a.setVy[i][0] * a.dur) { a.vyDone[i] = 1; A.setVy = a.setVy[i][1]; }
    A.vel.set(0, 0, 0);
    if (a.lungeDist > 0) {
      const l0 = (a.lungeT?.[0] ?? 0.12) * a.dur, l1 = (a.lungeT?.[1] ?? 0.5) * a.dur;
      if (tNow > l0 && tPrev < l1) {
        // re-aim at the target while lunging
        if (a.target?.alive) { const tp = a.target.object.position; a.yaw0 = Math.atan2(tp.x - pos().x, tp.z - pos().z); A.facing = a.yaw0; }
        fwd(A.vel, a.yaw0).multiplyScalar(a.lungeDist / Math.max(0.02, (l1 - l0) / a.speed));
      }
    }
    if (a.spin) {
      const s = sInWin(tNow, a.spin.t0 * a.dur, a.spin.t1 * a.dur);
      A.bodyYaw = -s * TWO_PI * (a.spin.turns || 1);
      if (s >= 1) A.bodyYaw = 0;
    } else A.bodyYaw = 0;
    try { a.onUpdate?.(dt * a.speed, a, A); } catch (err) { console.error('[sword] onUpdate', err); act = null; return; }
    // events + hits
    const ev = a.events;
    if (ev) for (let i = 0; i < ev.length; i++) if (!a.evDone[i] && tNow >= ev[i][0] * a.dur) { a.evDone[i] = 1; try { ev[i][1](a); } catch (err) { console.error('[sword] event', err); } }
    if (act !== a) return;
    runHits(a, tPrev, tNow);
    // trail window
    const tw = a.trail;
    a.trailOn = tw ? tNow >= tw[0] * a.dur && tNow <= tw[1] * a.dur : false;
    if (a.t >= a.dur && act === a) endAction(false);
  }

  // ---------------- movesets ----------------
  const ctx = () => ({ el: element, awakened: !!prog()?.hasAwakenedUltimate?.(), master: !!prog()?.isMaster?.() });
  const S = {
    game, fx, get element() { return element; }, get act() { return act; }, get weapon() { return weapon; }, hits: 0,
    pos, fwd, groundAt, findTarget, foesNear, centerOf, isFoe, applyHit, hitCircle, hitLine, arc, smear, after, every,
    startAction, endAction, contact, outDir, vcall, sfx, UP, palOf,
    PAL: new Proxy({}, { get: (_, k) => palOf(k) }),
    sampleTpl: (name, t, out) => sampleTpl(TPL[tplFor(name, weapon.id)] || TPL.hold, clamp(t, 0, 1), out),
    getWeaponPoint(which, out) {
      const pl = P();
      try { if (pl.getWeaponTip) return pl.getWeaponTip(which, out); } catch (_) { /* */ }
      return pl.getSwordTip(out);
    },
    surface: () => game.world?.surface,
    terrain(kind, p, r = 1, dir = null) {
      const s = game.world?.surface; if (!s) return;
      try {
        if (kind === 'ignite') s.ignite?.(p, r, 1);
        else if (kind === 'wind') s.wind?.(p, dir || fwd(v2), 1, r);
        else if (kind === 'wet') s.wet?.(p, r, 10);
        else if (kind === 'extinguish') s.extinguish?.(p, r);
        else if (kind === 'freeze') {
          // freezeWater itself returns false on dry land and uses the raw water test (so ice can be refreshed);
          // big freezes sample a ring so standing on the shore still catches the water
          s.extinguish?.(p, r);
          if (s.freezeWater) {
            const fr = Math.min(10, Math.max(2, r));
            s.freezeWater(p, fr, 25);
            if (r > 4) for (let i = 0; i < 6; i++) {
              const ang = i * 1.0472 + 0.4;
              _fz.set(p.x + Math.cos(ang) * r * 0.6, p.y, p.z + Math.sin(ang) * r * 0.6);
              s.freezeWater(_fz, fr * 0.7, 25);
            }
          }
        }
      } catch (err) { /* surface optional */ }
    },
    /** A spell zone through magic's v3 api when present; otherwise the closest world-surface stand-in. Never throws. */
    zone(type, p, o = {}) {
      const Z = game.spells?.api?.zones;
      if (Z?.spawn) { try { return Z.spawn(type, p, o) || null; } catch (err) { warnOnce('zone:' + type, err); } }
      if (type === 'water' || type === 'flood' || type === 'rain') S.terrain('wet', p, o.r || 3);
      else if (type === 'fire') S.terrain('ignite', p, o.r || 2);
      else if (type === 'holy') { try { game.world?.surface2?.bless?.(p, o.r || 3, o.dur || 6); } catch (_) { /* */ } }
      else if (type === 'overgrowth') { try { game.world?.surface2?.overgrow?.(p, o.r || 3, o.dur || 6); } catch (_) { /* */ } }
      else if (type === 'mud') { try { game.world?.surface2?.mud?.(p, o.r || 3, o.dur || 6); } catch (_) { /* */ } }
      return null;
    },
    slashTerrain(p) {
      if (element === 'fire' && igniteCd <= 0) { igniteCd = 2.5; v4.copy(p); v4.y = groundAt(p.x, p.z); S.terrain('ignite', v4, 1); }
      else if (element === 'wind') S.terrain('wind', p, 4, fwd(v2));
      else if (element === 'ice') S.terrain('freeze', p, 2.5);
      else if (element === 'water') S.terrain('wet', p, 2);
    },
    emit(kind, spellId) {
      events.emit('spellCast', { element, kind, spellId, origin: S.getWeaponPoint('main', new THREE.Vector3()), cls: clsOf() });
    },
  };
  const moves = buildMoves(S);
  const status3 = (el) => { const st = statusOf(el); if (!st || st === 'encrusted') return null; return STATUS3_CACHE[el] || null; };
  const STATUS3_CACHE = {};
  for (const el of ALL_ELEMENTS) {
    const st = statusOf(el);
    if (st && st !== 'encrusted') STATUS3_CACHE[el] = (st === 'seeded' || st === 'radiant' || st === 'corroded') ? { [st]: { stacks: 1 } } : { [st]: { dur: st === 'shocked' ? 2 : 3 } };
  }
  const M = { status3, flourish: moves.flourish, payload: moves.payload, vineLash: moves.vineLash, dashThrough: moves.dashThrough };
  const classMoves = buildClassMoves(S, M);
  /** The base moveset for the current weapon: longsword = element movesets (moves.js), hammer / daggers = class movesets. */
  function moveset() {
    const cm = classMoves[weapon.id];
    if (cm) return cm;
    return LONGSWORD;
  }
  const LONGSWORD = { len: 4, combo: (el, step) => moves.combo(el, step, ctx()), heavy: (el, f) => moves.heavy(el, f) };

  function refreshWeapon() {
    const st = styleNow();
    if (st === weaponId) return;
    weaponId = st; weapon = weaponFor(st);
    fx.trail.setProfile(weapon.trail); fx.trail2.setProfile(weapon.trail);
    comboStep = 0;
  }

  function comboAttack(emit = true, castId = 0) {
    const ms = moveset();
    const step = comboStep % ms.len;
    if (bufferTag.skillId) { tag.skillId = bufferTag.skillId; tag.slot = bufferTag.slot; castId = castId || bufferTag.castId || 0; bufferTag.skillId = null; bufferTag.slot = null; bufferTag.castId = 0; }
    // one cast context per combo press (tier B): castId on every hit and spec, budgets, the slash crescent as the primary shape
    const cc = look.begin({ kind: 'combo', el: element, skillId: tag.skillId || `${element}.basic`, castId: castId || 0, tier: 'B' });
    const prev = look.cur; look.cur = cc;
    let spec;
    try { spec = ms.combo(element, step); } finally { look.cur = prev; }
    if (!spec) return false;
    look.cur = cc;
    try { startAction(spec); } finally { look.cur = prev; }
    events.emit('swordSwing', { element, step, cls: clsOf(), weapon: weapon.id });
    if (emit && step === 0) S.emit('basic', `sword_${element}_basic`);
    comboStep = (step + 1) % ms.len;
    comboIdle = 0;
    return true;
  }
  function counterFlurry() {
    // 반격: after 완벽 회피 / 간파 the next attack is a guaranteed-crit flurry rush onto the attacker
    const pl = P();
    const tgt = (pl.counterTarget?.alive && pl.counterTarget) || findTarget(9, -0.5);
    const cc = look.begin({ kind: 'counter', el: element, skillId: null, tier: 'A' });
    const prev = look.cur; look.cur = cc;
    try { const spec = moves.flurry(element, tgt, weapon.id); startAction(spec); } finally { look.cur = prev; }
    if (act) act.counter = true;
    pl.consumeCounter();
    comboStep = 0;
    events.emit('swordSwing', { element, step: 'counter', cls: clsOf(), weapon: weapon.id });
    return true;
  }

  function startCharge() {
    if (cooldowns.heavy > 0) { events.emit('spellFail', { reason: 'cooldown', spellId: `sword_${element}_heavy` }); sfx('ui_click', { volume: 0.4, pitch: 0.7 }); return; }
    charging = true; chargeT = 0; chargeFrac = 0; chargeFull = false;
    if (act) endAction(true);
    P().setSwordDrawn(true);
    try { chargeLoop = game.audio?.loop?.('sword_charge', { volume: 0.6 }) || null; } catch (e) { chargeLoop = null; }
    events.emit('chargeStart', { element, cls: clsOf() });
  }
  function doHeavy(frac, castId = 0) {
    const cc = look.cur && look.cur.kind === 'heavy' ? look.cur : look.begin({ kind: 'heavy', el: element, skillId: tag.skillId || `${element}.charged`, castId, tier: 'C' });
    const prev = look.cur; look.cur = cc;
    try { return doHeavy2(frac); } finally { look.cur = prev; }
  }
  function doHeavy2(frac) {
    const spec = moveset().heavy(element, clamp(frac, 0, 1));
    if (!spec) return false;
    // soft-lock: a charged release snaps onto an enemy near the camera direction (was: pure camera aim → whiffs)
    if (spec.facing === 'camera' && spec.name !== 'heavy_lightning') {
      const tgt = findTarget(10, 0.6);
      if (tgt) {
        spec.facing = Math.atan2(tgt.object.position.x - pos().x, tgt.object.position.z - pos().z);
        if (spec.lunge != null) spec.target = tgt;
      }
    }
    startAction(spec);
    return true;
  }
  function endCharge(release) {
    if (!charging) return;
    charging = false;
    try { chargeLoop?.stop?.(); } catch (e) { /* */ } chargeLoop = null;
    events.emit('chargeEnd', { element, cls: clsOf(), released: release });
    if (release && chargeT >= MIN_CHARGE) {
      if (doHeavy(chargeT / FULL_CHARGE)) { cooldowns.heavy = CD.heavy; S.emit('heavy', `sword_${element}_heavy`); }
    } else if (release) comboAttack(); // tap: plain swing
  }
  /** Charge presentation (own RMB in the legacy keymap, or game.skills' charge in v3). */
  let chargeCC = null, chargeLine = null;
  function chargeVisual(dt, frac) {
    const pl = P(), A = pl.action;
    const before = chargeFrac;
    chargeFrac = clamp(frac, 0, 1);
    // anticipation (§3.6 melee): a charge line along the blade edge (RB, light → mid) that thickens with the charge,
    // inward accent sparks (≤ 8 /s), one rune circle + a 2-frame hilt glyph at full charge (circles only for charged / U / F)
    if (!chargeCC || chargeCC.el !== element) { chargeCC = look.begin({ kind: 'heavy', el: element, skillId: `${element}.charged`, tier: 'C', track: false }); chargeLine = null; }
    const prevCC = look.cur; look.cur = chargeCC;
    try {
      if (!chargeLine?.alive && game.vfx?.kit) {
        const tipObj = pl.gear?.tip || pl.gear?.sockets?.tip || null;
        if (tipObj?.isObject3D) chargeLine = look.h.ribbon(chargeCC, { follow: tipObj, width: 0.06, taper: 0.9, life: 0.18, el: element, maxLen: 0.9, alpha: 0.75 });
      }
      chargeLine?.setScale?.(0.6 + chargeFrac * 0.8);
      if (before < 1 && chargeFrac >= 1 && !chargeFull) {
        chargeFull = true;
        S.getWeaponPoint('main', v1);
        look.motif(element, 'cast', { pos: v1.clone(), r: 0.35, life: 0.12, castId: chargeCC.castId });
        vcall('runeCircle', v4.copy(pos()), { element, r: 1.2 * weapon.reachMul, dur: 0.6, rotSpeed: 3 });
        sfx('ui_select', { pitch: 1.5 });
      }
      chargeFxT -= dt;
      if (chargeFxT <= 0) {
        chargeFxT = 0.14 - chargeFrac * 0.04;
        pl.getSwordBase(v2); S.getWeaponPoint('main', v3);
        v1.lerpVectors(v2, v3, 0.5 + 0.5 * Math.sin(game.time * 7));
        v4.set(Math.sin(game.time * 13), 0.4, Math.cos(game.time * 13)).normalize();
        v1.addScaledVector(v4, 0.7);
        v4.negate();
        chargeCC.pLeft = Math.max(chargeCC.pLeft, 2);
        vcall('burst', v1, { count: 1, speed: 2.4, spread: 0, dir: v4, size: 0.06, sizeEnd: 0.02, life: 0.28, drag: 0, gravity: 0, shape: 'spark', velocityStretch: 0.05, el: element });
      }
    } finally { look.cur = prevCC; }
    pose.set(STANCE[CHARGE_STANCE[weapon.id]] || STANCE.charge);
    // trembling weapon at high charge
    pose[3] += Math.sin(game.time * 40) * 0.015 * chargeFrac;
    pose[8] += chargeFrac * 0.08;
    poseW = damp(poseW, 1, 25, dt);
    A.active = true; A.pose.set(pose); A.poseW = poseW;
    A.facing = pl.yaw + Math.PI; A.turn = 18; A.move = 0.35; A.vel.set(0, 0, 0); A.setVy = NaN; A.gravityMul = 1;
    A.cancelable = true; A.noGlide = true; A.bodyYaw = 0; A.superArmor = false;
    A.dodgeCancelable = true;           // §5.8: charged attacks are dodge-cancellable while charging
    const em = pl.gear?.edgeMat?.uniforms?.uIntensity; if (em) em.value = 1 + chargeFrac * 0.2;   // emissive ≤ 1.2 (rule 5)
  }
  function updateCharge(dt) {
    chargeT += dt;
    chargeVisual(dt, chargeT / FULL_CHARGE);
  }

  function doUltimate(awakened, castId = 0) {
    const cc = look.begin({ kind: 'ultimate', el: element, skillId: tag.skillId || `${element}.${awakened ? 'awakened' : 'ult'}`, castId, tier: 'U' });
    const prev = look.cur; look.cur = cc;
    try {
      const spec = moves.ultimate(element, { ...ctx(), awakened });
      if (!spec) return false;
      if (charging) endCharge(false);
      startAction(spec);
      return true;
    } finally { look.cur = prev; }
  }
  function ultimate() {
    if (cooldowns.ultimate > 0) { events.emit('spellFail', { reason: 'cooldown', spellId: `sword_${element}_ultimate` }); return; }
    if (!doUltimate(ctx().awakened)) return;
    cooldowns.ultimate = CD.ultimate;
    S.emit('ultimate', `sword_${element}_ultimate${ctx().awakened ? '_awakened' : ''}`);
  }
  function doSupport(skillId, castId = 0) {
    const def = moves.support(element);
    if (!def) return false;
    const cc = look.begin({ kind: 'support', el: element, skillId: skillId || `${element}.sup`, castId, tier: 'Z' });
    const prev = look.cur; look.cur = cc;
    try { startBuff(element, def, skillId); startAction(moves.supportAction(element)); } finally { look.cur = prev; }
    return true;
  }
  function support() {
    if (cooldowns.support > 0) { events.emit('spellFail', { reason: 'cooldown', spellId: `sword_${element}_support` }); return; }
    if (!doSupport(null)) return;
    cooldowns.support = CD.support;
    S.emit('support', `sword_${element}_support`);
  }
  /** Buffs are game.stats sources ('buff:'+id, game time); nothing writes player.mods (CONTRACT §5). */
  function startBuff(el, def, skillId) {
    endBuff();
    const src = 'buff:' + (skillId || `sword_${el}_support`);
    buffs.id = el; buffs.src = src; buffs.t = def.duration; buffs.dur = def.duration; buffs.def = def; buffs.tick = 0;
    try { game.stats?.set?.(src, def.mods, { duration: def.duration }); } catch (err) { warnOnce('stats.set', err); }
    try {
      const c = palOf(el);
      buffs.emitter = vcall('emitter', { follow: P().object, offset: v4.set(0, 1, 0), rate: 8, count: 1, color: [c.a, c.b], speed: 1.2, spread: 1, size: 0.1, sizeEnd: 0, life: 0.6, shape: def.shape || 'spark', gravity: def.gravity ?? -1.5, drag: 1, duration: def.duration, el }) || null;
    } catch (e) { buffs.emitter = null; }
  }
  function endBuff() {
    if (!buffs.id) return;
    try { if (buffs.src && game.stats?.has?.(buffs.src)) game.stats.clear(buffs.src); } catch (_) { /* */ }
    try { buffs.emitter?.stop?.(); } catch (e) { /* */ }
    buffs.emitter = null; buffs.id = null; buffs.def = null; buffs.src = null;
  }
  function finisher(free = false) {
    const pr = prog();
    if (!free) {
      if (!pr?.hasFinisher?.() || !pr.canFinisher?.()) { if (pr?.hasFinisher?.()) events.emit('spellFail', { reason: 'gauge', spellId: `sword_${element}_finisher` }); return false; }
      if (!pr.consumeAwakening()) return false;
    }
    const fin = moves.finisher(element);
    if (!fin) return false;
    if (charging) endCharge(false);
    const fcc = look.begin({ kind: 'finisher', el: element, skillId: tag.skillId || `${element}.finisher`, castId: finCastId || 0, tier: 'F' });
    const prevF = look.cur; look.cur = fcc;
    try { return finisher2(fin, free, fcc); } finally { look.cur = prevF; }
  }
  let finCastId = 0;
  function finisher2(fin, free, fcc) {
    const tgt = findTarget(16, -0.2);
    const center = new THREE.Vector3();
    if (tgt) center.copy(tgt.object.position); else center.copy(pos()).addScaledVector(fwd(v1), 7);
    center.y = groundAt(center.x, center.z);
    if (tgt) P().setFacing(Math.atan2(center.x - pos().x, center.z - pos().z));
    if (!free) S.emit('finisher', `sword_${element}_finisher`);
    events.emit('finisherStart', { element, name: fin.name, cls: clsOf() });
    sfx('finisher_charge', { position: pos() });
    // hold the power-up pose for the whole cinematic
    const hold = startAction({ name: fin.name, kind: 'finisher', tpl: 'raise', dur: 60, cancel: 60, move: 0, superArmor: true, target: null, facing: P().facing, noWeaponScale: true,
      onUpdate: (dt, a) => fin.buildup?.(S, a.t, center) });
    let impacted = false;
    const impact = () => {
      if (impacted) return; impacted = true;
      sfx('finisher_impact', { position: center });
      events.emit('finisherImpact', { element, point: center.clone(), cls: clsOf() });
      const prev = look.cur; look.cur = fcc;
      try { fin.impact(S, center, tgt); } catch (err) { console.error('[sword] finisher impact', err); } finally { look.cur = prev; }
    };
    const done = () => { impact(); if (act === hold) { endAction(false); startAction({ name: 'fin_end', kind: 'finisher', tpl: 'raiseSlam', dur: 0.6, cancel: 0.4, move: 0, target: null, facing: P().facing }); } };
    const cin = game.cinematic;
    const cinOk = cin?.finisher && !(game.stubbed || []).includes('cinematic');
    if (cinOk) {
      try {
        cin.finisher({ cls: clsOf(), element, name: fin.name, target: tgt, center, onBuildup: (t) => { const prev = look.cur; look.cur = fcc; try { fin.buildup?.(S, t, center); } catch (_) { /* */ } finally { look.cur = prev; } }, onImpact: impact, onEnd: done });
        return true;
      } catch (err) { console.error('[sword] cinematic.finisher', err); }
    }
    // non-cinematic fallback: slow-mo power-up then impact
    try { game.timeScale?.set?.('ult', 0.35, 1.2); } catch (_) { /* */ }
    vcall('screenFlash', palOf(element).a, 0.2, 0.15);
    after(0.45, () => { vcall('fovKick', -3, 0.3); });
    after(0.55, done);
    return true;
  }

  // ---------------- v3 entry points (game.skills → game.sword.api) ----------------
  /**
   * playLegacy(element, kind, opts): kind 'combo'|'heavy'|'ultimate'|'ultimateAwakened'|'support'|'finisher'.
   * Paladin / shadowblade combo + heavy route to their class movesets with the element payload. Gating is done by skills
   * (free here). Emits spellCast exactly once when it returns true (CONTRACT §7.2 step 4).
   */
  function playLegacy(el, kind, opts = {}) {
    const pl = P();
    if (!pl?.action || !pl.entity?.alive) return false;
    refreshWeapon();
    if (el && el !== element) setElementLocal(el);
    const skillId = opts.skillId || null;
    const slot = SLOT_OF[kind] || 'skill';
    // castId: the skills runtime's when it passes one (ctx.castId), else a fresh one (PLAN §7.4.7)
    const castId = opts.castId ?? game.nextCastId?.() ?? 0;
    lastCastId = castId;
    let ok = false;
    inSkillsCast++;
    try {
      if (kind === 'combo') {
        if (pl.counterReady > 0 && !charging) ok = counterFlurry();
        else if (canComboNow()) { tag.skillId = skillId; tag.slot = slot; if (!act && comboIdle > COMBO_RESET) comboStep = 0; ok = comboAttack(false, castId); }
        else { buffer = BUFFER_T; bufferKind = 'combo'; bufferTag.skillId = skillId; bufferTag.slot = slot; bufferTag.castId = castId; ok = true; }
      } else if (kind === 'heavy') {
        if (charging) { charging = false; try { chargeLoop?.stop?.(); } catch (_) { /* */ } chargeLoop = null; }
        tag.skillId = skillId; tag.slot = slot;
        ok = doHeavy(opts.charge ?? 1, castId);
      } else if (kind === 'ultimate' || kind === 'ultimateAwakened') {
        tag.skillId = skillId; tag.slot = slot;
        ok = doUltimate(kind === 'ultimateAwakened' || !!opts.awakened, castId);
      } else if (kind === 'support') {
        tag.skillId = skillId; tag.slot = slot;
        ok = doSupport(skillId, castId);
      } else if (kind === 'finisher') {
        tag.skillId = skillId; tag.slot = slot; finCastId = castId;
        ok = finisher(true);
        finCastId = 0;
      }
    } catch (err) { console.error('[sword] playLegacy', el, kind, err); ok = false; }
    finally { inSkillsCast--; tag.skillId = null; tag.slot = null; }
    if (ok) {
      events.emit('spellCast', { element, kind: CAST_KIND[kind] || 'skill', spellId: skillId || `sword_${element}_${kind}`, origin: S.getWeaponPoint('main', new THREE.Vector3()), cls: clsOf(), skillId });
      if (opts) opts._emitted = true;
    }
    return ok;
  }
  function canComboNow() {
    const pl = P();
    if (charging || pl.blocking || pl.dashing) return false;
    return !act || (pl.action.cancelable && (act.kind === 'combo' || act.kind === 'recover' || act.t >= act.dur * 0.75));
  }
  const playClassCombo = (el) => { if (el) setElementLocal(el); refreshWeapon(); return canComboNow() ? comboAttack(false) : false; };
  const playClassCharged = (el, frac = 1) => { if (el) setElementLocal(el); refreshWeapon(); return doHeavy(frac); };

  // ---------------- element selection ----------------
  function unlocked() { return prog()?.unlockedElements?.() || []; }
  function setElementLocal(el) {
    element = el;
    const list = v3Mode() ? ALL_ELEMENTS : CLASSIC_ELEMENTS;
    index = Math.max(0, list.indexOf(el));
    fx.trail.setElement(el); fx.trail2.setElement(el);
  }
  /**
   * setElement(el, {silent}) — v3: called by skills.attune with {silent:true} (emits nothing); any other v3 caller is
   * forwarded to skills.attune (CONTRACT §22). Legacy: setElement(el) / setElement(el, true) behave as in v2.
   */
  function setElement(el, opt) {
    const silent = !!(opt && typeof opt === 'object' && opt.silent);
    if (!el || !ALL_ELEMENTS.includes(el)) return false;
    if (!silent && !inSkillsCast && v3Mode() && game.skills?.attune && !game.skills.isStub) {
      try { return game.skills.attune(el) !== false; } catch (err) { warnOnce('attune', err); }
    }
    if (!silent && !(prog()?.isElementUnlocked?.(el))) return false;
    const changed = el !== element;
    setElementLocal(el);
    if (silent) return true;
    P()?.setStaffElement?.(el);
    if (changed || opt === true) { events.emit('elementChanged', { element, index, cls: clsOf() }); if (changed) sfx('ui_select', { pitch: 1.2, volume: 0.5 }); }
    return true;
  }

  // ---------------- blade ambience ----------------
  function bladeAmbience(dt) {
    // v4 (R4 restraint): no ambient particle stream on the drawn weapon; the element reads from the slash edge instead
    if (dt >= 0) return;
    const pl = P();
    if (!pl.swordDrawn) return;
    ambT -= dt;
    if (ambT > 0) return;
    ambT = weapon.id === 'daggers' ? 0.1 : 0.07;
    pl.getSwordBase(baseW); S.getWeaponPoint('main', tipW);
    v1.lerpVectors(baseW, tipW, 0.25 + Math.random() * 0.75);
    const c = palOf(element);
    const o = ambOf(element);
    vcall('burst', v1, { count: 1, color: [c.a, c.b], speed: o.speed, spread: 1, dir: UP, size: o.size, sizeEnd: 0, life: o.life, shape: o.shape, gravity: o.gravity, drag: 2, additive: o.additive !== false });
  }

  // ---------------- HUD (v2 shape; the v3 HUD comes from game.skills) ----------------
  const hud = {
    element: 'fire', index: 0, cls: null,
    elements: CLASSIC_ELEMENTS.map((id) => ({ id, name: elName(id), color: elColor(id, 'hex'), locked: true })),
    slots: [], charging: false, chargeFrac: 0, awakening: { enabled: false, value: 0, ready: false },
  };
  const mkSlot = (kind, key) => ({ kind, key, name: '', desc: '', mpCost: 0, staminaCost: 0, cooldown: 0, cooldownLeft: 0, ready: true, awakened: false, id: '' });
  const slotAll = [mkSlot('basic', 'LMB'), mkSlot('heavy', 'RMB'), mkSlot('ultimate', 'F'), mkSlot('support', 'G'), mkSlot('finisher', 'R')];
  function getHudState() {
    const pr = prog();
    const master = !!pr?.isMaster?.();
    hud.element = element; hud.index = index; hud.charging = charging; hud.chargeFrac = chargeFrac; hud.cls = clsOf();
    for (const e of hud.elements) e.locked = !pr?.isElementUnlocked?.(e.id);
    hud.slots.length = 0;
    const info = moves?.info?.(element, ctx());
    const ko = CLASS_MOVES_KO[weapon.id];
    for (const s of slotAll) {
      if ((s.kind === 'support' || s.kind === 'finisher') && !master) continue;
      const d = info?.[s.kind] || {};
      const cd = ko && (s.kind === 'basic' || s.kind === 'heavy') ? ko[s.kind] : null;
      s.name = cd ? cd[0] : d.name || ''; s.desc = cd ? cd[1] : d.desc || ''; s.id = `sword_${element}_${s.kind}`;
      s.awakened = s.kind === 'ultimate' && !!pr?.hasAwakenedUltimate?.();
      s.cooldown = s.kind === 'basic' ? 0 : s.kind === 'finisher' ? 0 : CD[s.kind];
      s.cooldownLeft = s.kind === 'basic' || s.kind === 'finisher' ? 0 : Math.max(0, cooldowns[s.kind]);
      s.ready = s.kind === 'finisher' ? !!pr?.canFinisher?.() : s.cooldownLeft <= 0;
      hud.slots.push(s);
    }
    hud.awakening.enabled = !!pr?.hasFinisher?.();
    hud.awakening.value = pr?.awakening || 0;
    hud.awakening.ready = !!pr?.canFinisher?.();
    return hud;
  }

  // ---------------- update ----------------
  function updateTrails(dt) {
    const pl = P();
    const on = !!act?.trailOn;
    if (pl.swordDrawn) { pl.getSwordBase(baseW); S.getWeaponPoint('main', tipW); }
    fx.trail.update(dt, on, baseW, tipW);
    // twin daggers: the left blade gets its own ribbon (grip → left tip)
    if (weapon.id === 'daggers' && pl.swordDrawn) {
      S.getWeaponPoint('off', tip2);
      if (pl.getWeaponBase) pl.getWeaponBase('off', base2);
      else { const L = pl.classGear?.sockets?.daggers?.L; if (L?.getWorldPosition) L.getWorldPosition(base2); else base2.copy(baseW); }
      fx.trail2.update(dt, on, base2, tip2);
    } else fx.trail2.update(dt, false, baseW, tipW);
  }
  function update(dt, realDt) {
    const pl = P();
    if (!pl?.action) return;
    dt *= pl.timeComp?.() || 1;
    refreshWeapon();
    fx.arcs.update(dt, game.time);
    fx.iceSpikes.update(dt); fx.rockSpikes.update(dt); fx.crystal.update(dt); fx.stones.update(dt); fx.dragon.update(dt);
    fx.orbit.update(dt, pos());
    look.update(dt);
    runTasks(dt);
    for (const k in cooldowns) if (cooldowns[k] > 0) cooldowns[k] = Math.max(0, cooldowns[k] - dt);
    igniteCd -= dt;
    if (buffs.id) {
      buffs.t -= dt;
      try { buffs.def?.tick?.(S, dt, buffs); } catch (err) { console.error('[sword] buff', err); }
      const ended = game.stats?.has ? !game.stats.has(buffs.src) : buffs.t <= 0;
      if (ended || !active()) endBuff();
    }
    try { arch?.update?.(dt); } catch (err) { warnOnce('archetypes.update', err); }

    if (!active() || game.state !== 'playing') {
      if (!active()) { if (act) endAction(true); if (charging) endCharge(false); v3Charge = false; pl.action.active = false; pl.action.dodgeCancelable = true; fx.trail.update(dt, false, baseW, tipW); fx.trail2.update(dt, false, baseW, tipW); }
      return;
    }
    const inp = game.input;
    const alive = pl.entity.alive;
    let canAct = alive;
    try { if (canAct && game.combat?.canAct) canAct = game.combat.canAct(pl.entity) !== false; } catch (e) { /* */ }
    if (pl.guardBroken) canAct = false;
    const ownInput = !v3Mode();

    // element (legacy keymap only: Digit1-5 + wheel; in v3 skills owns the digits, Z and the wheel)
    if (ownInput && !prog()?.isMaster?.()) {
      for (let i = 0; i < CLASSIC_ELEMENTS.length; i++) if (inp.pressed(DIGITS[i])) setElement(CLASSIC_ELEMENTS[i]);
      if (inp.wheel) {
        const un = unlocked();
        if (un.length > 1) { let k = un.indexOf(element); k = (k + (inp.wheel > 0 ? 1 : -1) + un.length) % un.length; setElement(un[k]); }
      }
    }

    // defensive cancels: dash / guard interrupt cancelable actions; stun interrupts everything
    if (act && (!canAct || pl.dashing || pl.blocking) && act.kind !== 'finisher') { endAction(true); poseW = pl.dashing ? 0 : poseW; comboStep = 0; }
    if (charging && (!canAct || pl.dashing || pl.blocking)) endCharge(false);

    // ---- input (legacy keymap only) ----
    if (ownInput && canAct && !pl.blocking && !pl.dashing) {
      const lmbP = inp.mousePressed(0);
      if (lmbP) { buffer = BUFFER_T; bufferKind = pl.counterReady > 0 ? 'counter' : 'combo'; }
      else if (inp.mouseDown(0) && !charging && (!act || act.kind === 'combo')) { if (buffer <= 0) { buffer = 0.05; bufferKind = 'combo'; } }
      // RMB pressed mid-swing is buffered and the charge starts once the swing becomes cancelable (button still held)
      if (inp.mousePressed(2)) heavyBuf = 0.5;
      if (heavyBuf > 0 && inp.mouseDown(2) && !charging && (!act || game.player.action.cancelable)) { heavyBuf = 0; startCharge(); }
      if (charging) {
        if (!inp.mouseDown(2)) endCharge(true);
      }
      // F = ultimate only while nothing is offered (main.js runs interact.use when an offer exists)
      const offered = !!game.interact?.current?.();
      if (inp.pressed('KeyF') && !offered && (!act || pl.action.cancelable || act.kind === 'combo')) ultimate();
      if (inp.pressed('KeyR') && (!act || pl.action.cancelable || act.kind === 'combo')) finisher();
      if (inp.pressed('KeyG') && prog()?.hasSupport?.() && (!act || pl.action.cancelable)) support();
    }
    if (heavyBuf > 0) heavyBuf -= dt;
    // buffered combo (legacy clicks and v3 presses that arrived mid-swing)
    if (buffer > 0) {
      buffer -= dt;
      const can = !charging && canAct && !pl.blocking && !pl.dashing && (!act || (pl.action.cancelable && (act.kind === 'combo' || act.kind === 'recover' || act.t >= act.dur * 0.75)));
      if (can) {
        buffer = 0;
        if (bufferKind === 'counter' && pl.counterReady > 0) counterFlurry();
        else if (pl.counterReady > 0 && !ownInput) counterFlurry();
        else { if (!act && comboIdle > COMBO_RESET) comboStep = 0; comboAttack(ownInput); }
      }
      if (buffer <= 0) { bufferTag.skillId = null; bufferTag.slot = null; }
    }
    if (!act) comboIdle += dt;
    if (pl.grounded) airAttacks = 0;

    // v3: show the charge pose while game.skills charges the RMB skill of a melee class
    const sk = game.skills;
    const skCharging = !ownInput && !!sk?.charging && canAct && !pl.blocking && !pl.dashing;
    if (skCharging && !v3Charge) { v3Charge = true; chargeFull = false; chargeFxT = 0; if (act && act.kind === 'combo' && pl.action.cancelable) endAction(true); P().setSwordDrawn(true); }
    else if (!skCharging && v3Charge) { v3Charge = false; chargeFrac = 0; chargeLine?.stop?.(); chargeLine = null; chargeCC = null; }

    if (charging) updateCharge(dt);
    else if (v3Charge && !act) chargeVisual(dt, sk.chargeFrac || 0);
    else updateAction(dt);

    updateTrails(dt);
    bladeAmbience(dt);

    // auto-sheathe when calm
    if (!act && !charging && !v3Charge && !pl.blocking) {
      idleT += dt;
      if (idleT > 6 && pl.swordDrawn) {
        let calm = true;
        for (const e of game.enemies?.list || []) if (e.aggro && e.alive && e.object.position.distanceToSquared(pos()) < 900) { calm = false; break; }
        if (calm) pl.setSwordDrawn(false); else idleT = 3;
      }
    } else idleT = 0;
  }

  function onClassOrPath(p) {
    const cls = p?.cls ?? clsOf();
    const melee = !!cls && !!CLASS_DEFS[cls] && familyOf(cls) === 'melee';
    if (!melee) { endBuff(); if (act) endAction(true); return; }
    refreshWeapon();
    const un = unlocked();
    const want = game.skills?.attuned || (p?.element && un.includes(p.element) ? p.element : null) || CLASS_DEFS[cls]?.primary?.find((e) => un.includes(e)) || un[0] || CLASS_DEFS[cls]?.primary?.[0] || 'fire';
    if (v3Mode()) setElementLocal(want); else setElement(want, true);
    comboStep = 0; for (const k in cooldowns) cooldowns[k] = 0;
  }

  function warmObjects() {
    return [...fx.arcs.items.map((x) => x.mesh), fx.trail.mesh, fx.trail2.mesh, fx.iceSpikes.mesh, fx.rockSpikes.mesh, fx.crystal.mesh, fx.orbit.mesh, fx.dragon.mesh, fx.dragon.coreMesh,
      ...fx.stones.items.map((x) => x.m), ...(arch?.warmup?.() || []), ...(bespoke?.warmup?.() || [])];
  }
  function warmup() {
    try {
      const objs = warmObjects();
      const g = P()?.gear;
      const gearObjs = g?.all ? g.all.filter((o) => !o.visible) : [];
      const vis = objs.map((o) => o.visible);
      const cnt = objs.map((o) => o.count);
      objs.forEach((o) => { o.visible = true; if (o.isInstancedMesh) o.count = 1; });
      gearObjs.forEach((o) => { o.visible = true; });
      game.renderer.compile(scene, game.camera);
      objs.forEach((o, i) => { o.visible = vis[i]; if (o.isInstancedMesh) o.count = cnt[i]; });
      gearObjs.forEach((o) => { o.visible = false; });
    } catch (err) { console.warn('[sword] warmup', err); }
  }

  // ---------------- melee archetypes + bespoke forms (registered in the FACTORY, CONTRACT §2/§7.3) ----------------
  engineRef.S = S;
  const engine = {
    game, S, M, moves, fx, look,
    get weapon() { return weapon; }, get act() { return act; }, get element() { return element; },
    startAction, endAction, applyHit, hitCircle, hitLine, findTarget, foesNear, after, every, arc, smear,
    setElementLocal, refreshWeapon, tag, TPL,
  };
  let arch = null, bespoke = null;
  try { arch = registerMeleeArchetypes(game, engine); engine.archHelpers = arch?.helpers || null; } catch (err) { console.error('[sword] archetypes', err); }
  try { bespoke = registerMeleeBespoke(game, engine); } catch (err) { console.error('[sword] bespoke', err); }

  const api = {
    get element() { return element; }, get index() { return index; }, get elements() { return unlocked(); },
    get charging() { return charging || v3Charge; }, get chargeFrac() { return chargeFrac; },
    get comboStep() { return comboStep; }, get action() { return act; }, get buff() { return buffs.id; },
    get weapon() { return weapon; },
    cooldowns, fx, S, look,
    /** v4 (PLAN §7.4.7): declared look level of a registry skill in the melee family ('bespoke' | 'archetype'); ML1 measures it. */
    lookOf: (id) => look.lookOf(id),
    get lastCastId() { return look.last?.castId || lastCastId; },
    /** every private sword material (built once at construction; for warm-up and the 0-new-materials check) */
    materials: () => fxMats.slice(),
    substeps: false,
    getHudState, update, setElement,
    /** Test hook: run a move directly: kind 'combo'|'heavy'|'ultimate'|'finisher'|'support', opts {charge, step} */
    debugUse(kind, opts = {}) {
      refreshWeapon();
      if (kind === 'combo') { comboStep = opts.step ?? comboStep; comboAttack(); }
      else if (kind === 'heavy') doHeavy(opts.charge ?? 1);
      else if (kind === 'ultimate') { cooldowns.ultimate = 0; ultimate(); }
      else if (kind === 'finisher') { prog().awakening = 100; finisher(); }
      else if (kind === 'support') { cooldowns.support = 0; support(); }
      else if (kind === 'counter') counterFlurry();
      return !!act;
    },
    /** Test hook: end the current move, drop scheduled tasks and every pooled sword effect (+ the vfx particles / kit). */
    clearFx() {
      if (act) endAction(true);
      if (charging) endCharge(false);
      tasks.length = 0; endBuff();
      fx.arcs.clear(); fx.trail.clear(); fx.trail2.clear();
      for (const k of ['iceSpikes', 'rockSpikes', 'crystal']) { for (const it of fx[k].items) it.alive = false; fx[k].update(0); }
      for (const it of fx.stones.items) { it.alive = false; it.m.visible = false; }
      fx.orbit.stop(); fx.orbit.update(0, pos()); fx.dragon.active = false; fx.dragon.update(0);
      try { game.vfx?.clear?.(); } catch (_) { /* */ }
      chargeLine = null; chargeCC = null;
    },
    /** main.js prewarm: hidden instances are already in the scene; nothing extra to add. */
    prewarm() { return null; },
    init() {
      refreshWeapon();
      events.on('pathChosen', onClassOrPath);
      events.on('classChosen', onClassOrPath);
      events.on('classChanged', (p) => onClassOrPath({ cls: p?.to }));
      if (isMeleeCls()) onClassOrPath({ cls: clsOf(), element: prog()?.element });
      // 서리 방벽 (ice armor) chills attackers; keep it here so the player module stays class-agnostic
      events.on('damage', (p) => {
        if (!p?.isPlayer || buffs.id !== 'ice') return;
        const src = p.source; if (src && typeof src === 'object' && src.alive) { try { game.combat?.applyStatus?.(src, 'chilled', 3); } catch (e) { /* */ } }
      });
      events.on('playerDeath', () => { if (act) endAction(true); if (charging) endCharge(false); endBuff(); });
      warmup();
    },
  };
  /** CONTRACT §12: the melee toolkit for skills / archetypes / tests. */
  api.api = {
    startAction, hitCircle, hitLine, applyHit, findTarget, after, every,
    weapon: () => { refreshWeapon(); return weapon; },
    playLegacy, setElement, playClassCombo, playClassCharged,
    TPL, arc, smear, foesNear, payload: (el, p, o) => moves.payload(el, p, o), S,
    get act() { return act; },
    archetypes: () => arch?.names || [],
    get mines() { return arch?.mines || null; },
  };
  return api;
}
