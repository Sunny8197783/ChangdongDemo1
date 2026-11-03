// Swordsman class (game.sword): element-enchanted longsword with heavy-hitstop melee.
// Engine: action timeline (procedural pose templates + timed events + swept hit windows), attack buffering,
// cancel windows, soft-lock lunge, per-hit feedback (hitstop / camera punch / sparks / slash arcs / blade
// ribbon / layered sound). Element movesets live in src/sword/moves.js.
import * as THREE from 'three';
import { ELEMENT_COLORS, ELEMENT_NAMES_KO, ELEMENTS, clamp, damp, angleDiff, rand } from './core/utils.js';
import { TPL, sampleTpl } from './sword/anim.js';
import { PF, STANCE } from './player/swordpose.js';
import { SlashArcs, BladeTrail, Spikes, StoneSwords, OrbitBlades, Dragon } from './sword/fx.js';
import { buildMoves, PAL, CD } from './sword/moves.js';

const MIN_CHARGE = 0.35, FULL_CHARGE = 1.2;
const BUFFER_T = 0.42, COMBO_RESET = 0.55;
const TWO_PI = Math.PI * 2;

export function createSword(game) {
  const { scene, events } = game;
  const P = () => game.player;
  const prog = () => game.progression;
  const vfx = () => game.vfx;
  const vcall = (name, ...a) => { try { return vfx()?.[name]?.(...a); } catch (e) { return null; } };
  const sfx = (name, opts) => { try { game.audio?.play?.(name, opts); } catch (e) { /* */ } };

  // ---------------- fx pools ----------------
  const fx = {
    arcs: new SlashArcs(scene, 20), trail: new BladeTrail(scene),
    iceSpikes: new Spikes(scene, 'ice', 64), rockSpikes: new Spikes(scene, 'rock', 48),
    stones: new StoneSwords(scene, 3), orbit: new OrbitBlades(scene, 12), dragon: new Dragon(scene, 26),
  };

  // ---------------- state ----------------
  let element = 'fire', index = 0;
  let act = null;                 // current action
  let poseW = 0;
  const pose = new Float32Array(PF), tplPose = new Float32Array(PF);
  let comboStep = 0, comboIdle = 9, buffer = 0, bufferKind = null;
  let charging = false, chargeT = 0, chargeFrac = 0, chargeLoop = null, chargeFull = false, chargeFxT = 0;
  const cooldowns = { heavy: 0, ultimate: 0, support: 0 };
  let idleT = 0, ambT = 0, igniteCd = 0, airAttacks = 0;
  const tasks = [];
  const buffs = { id: null, t: 0, dur: 0, emitter: null, tick: 0 };
  let combatV2 = false;
  let heavyBuf = 0;

  // scratch
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const lineP = new THREE.Vector3(), hitP = new THREE.Vector3(), hitD = new THREE.Vector3(), tipW = new THREE.Vector3(), baseW = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const active = () => prog()?.cls === 'sword' && prog()?.chosen;
  const pos = () => P().object.position;
  const groundAt = (x, z) => { const w = game.world; const h = w?.getGroundHeight ? w.getGroundHeight(x, z) : w?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; };
  const fwd = (out, yaw = P().facing) => out.set(Math.sin(yaw), 0, Math.cos(yaw));

  // ---------------- scheduler (gameplay time: hitstop stretches it) ----------------
  function after(t, fn) { tasks.push({ t, fn, every: 0, left: 0 }); }
  function every(interval, duration, fn) { tasks.push({ t: 0, fn, every: interval, left: duration }); }
  function runTasks(dt) {
    for (let i = tasks.length - 1; i >= 0; i--) {
      const k = tasks[i];
      k.t -= dt;
      if (k.every) {
        k.left -= dt;
        if (k.t <= 0) { k.t += k.every; try { if (k.fn(k) === false) k.left = 0; } catch (err) { console.error('[sword] task', err); k.left = 0; } }
        if (k.left <= 0) tasks.splice(i, 1);
      } else if (k.t <= 0) { tasks.splice(i, 1); try { k.fn(); } catch (err) { console.error('[sword] task', err); } }
    }
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
  /**
   * spec: {amount, kb, launch, status, heavy, hs (hitstop), shake, fov, tags, sound ('light'|'heavy'|false),
   *        impact (scale), sparks, dirMode ('out'|'fwd'|vector), noReaction, onHit(e, point, res)}
   */
  function applyHit(e, spec, point, dir) {
    if (!isFoe(e)) return null;
    const pl = P();
    const counter = act?.counter;
    let amount = (spec.amount || 0) * (pl.mods?.atkMul || 1) * (counter ? 2 : 1);
    const tags = ['melee', 'sword'];
    if (spec.tags) for (const t of spec.tags) tags.push(t);
    if (counter) tags.push('counter');
    let hs = (spec.hs ?? 0.07) + (counter ? 0.05 : 0);
    if (e.isBoss) hs *= 1.1;
    const shake = spec.shake ?? 0.18;
    const hit = {
      amount, element, source: 'player', point, direction: dir, knockback: spec.kb ?? 3, launch: spec.launch || 0,
      status: spec.status, heavy: !!spec.heavy || counter, tags, hitstop: hs, shake, noReaction: spec.noReaction,
      crit: counter || undefined, noCrit: false, noImpactFx: true,   // sword spawns its own blade-scaled impact
    };
    let res = null;
    try { res = game.combat?.dealDamage?.(e, hit); } catch (err) { console.error('[sword] dealDamage', err); }
    if (!res || (!res.damage && !res.reaction)) return res;
    if (!combatV2 && !tags.includes('finisher')) { try { prog()?.addAwakening?.(res.damage * 0.12); } catch (_) { /* */ } }
    if (res.killed) hs += 0.03;
    game.hitstop?.(hs);                     // explicit: every melee connect freezes the frame
    // (shake: combat applies hit.shake once — calling it here too doubled the trauma on every hit)
    if (res.killed) vcall('shake', 0.1);
    vcall('fovKick', spec.fov ?? (spec.heavy ? 2.6 : 1.3), spec.heavy ? 0.22 : 0.14);
    if (game.camera) { v4.subVectors(point, game.camera.position); if (v4.lengthSq() > 1e-4) vcall('kick', v4.normalize(), spec.heavy ? 0.09 : 0.05); }
    // sparks along the cut + element impact
    const col = PAL[element];
    const sc = spec.impact ?? (spec.heavy ? 1.3 : 0.8);
    if (spec.sparks !== false) {
      v4.copy(dir).setY(0.25).normalize();
      vcall('burst', point, { count: Math.round((spec.heavy ? 22 : 12) * (counter ? 1.6 : 1)), color: counter ? [0xfff2a0, 0xffffff] : [col.b, col.a], speed: spec.heavy ? 11 : 8, speedVar: 3, spread: 0.55, dir: v4, size: 0.09, sizeEnd: 0, life: 0.28, lifeVar: 0.1, shape: 'spark', drag: 3.5, gravity: 6, velocityStretch: 0.06 });
      vcall('burst', point, { count: 1, shape: 'flare', color: [0xffffff, col.a], size: spec.heavy ? 1.5 : 0.95, sizeEnd: spec.heavy ? 2.1 : 1.3, life: 0.08, speed: 0, alpha: 0.45 });
    }
    vcall('impact', point, { element, scale: sc });
    if (counter) vcall('screenFlash', 0xfff0b0, 0.18, 0.18);
    if (spec.sound !== false) {
      sfx(spec.heavy ? 'sword_hit_heavy' : 'sword_hit', { position: point, pitch: rand(0.92, 1.08) });
      sfx('impact_' + element, { position: point, volume: spec.heavy ? 0.7 : 0.4 });
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
  function hitCircle(center, r, spec, set = null, yRange = 3) {
    const list = foesNear(center, r, _near);
    let n = 0;
    for (const e of list) {
      if (set) { if (set.has(e)) continue; set.add(e); }
      if (Math.abs(e.object.position.y - center.y) > yRange + (e.height || 1.6)) continue;
      contact(e, center, hitP, 0.9);
      if (spec.dirMode === 'fwd') fwd(hitD); else outDir(e, center, hitD);
      if (applyHit(e, spec, hitP, hitD)) n++;
    }
    return n;
  }
  const _near = [];
  function hitLine(from, dir, len, width, spec, set = null) {
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
      if (spec.dirMode === 'out') outDir(e, from, hitD); else hitD.copy(dir);
      if (applyHit(e, spec, hitP, hitD)) n++;
    }
    return n;
  }

  // ---------------- arcs (visual) ----------------
  /** Spawn a crescent relative to the hero. o: {yaw (abs), tilt, pitch, a0, a1, rout, rin, h, sweep, life, fwdOff, scale, vel, grow, opacity} */
  function arc(o) {
    const yaw = o.yaw ?? P().facing;
    const c = PAL[o.el || element];
    v1.copy(o.pos || pos()); v1.y += o.h ?? 1.1;
    if (o.fwdOff) v1.addScaledVector(fwd(v2, yaw), o.fwdOff);
    return fx.arcs.spawn({
      pos: v1, yaw, tilt: o.tilt || 0, pitch: o.pitch || 0, start: o.a0, span: o.a1 - o.a0,
      rin: o.rin ?? (o.rout ?? 2.5) * 0.58, rout: o.rout ?? 2.5, colA: o.colA ?? c.a, colB: o.colB ?? c.b, sweep: o.sweep ?? 0.09,
      life: o.life ?? 0.26, noise: o.noise ?? c.noise, scale: o.scale || 1, vel: o.vel, grow: o.grow, opacity: o.opacity ?? 1,
    });
  }

  // ---------------- actions ----------------
  /**
   * spec: {name, kind, tpl, dur, cancel (s), move, turn, facing ('target'|'camera'|yaw|null), lunge (m, max),
   *   events:[[t, fn]], hits:[{t0, t1, shape:'arc'|'line'|'circle'|'sector', a0, a1, reach, inner, y0, y1, len, width, r,
   *   spec, arc: {tilt, h, rin, rout, ...} }], spin: {t0, t1, turns}, setVy:[[t, vy]], gravityMul, superArmor,
   *   noGlide, onUpdate(dt, act), onEnd(act, interrupted), trail: [t0, t1] }
   */
  function startAction(spec) {
    const pl = P();
    if (act) endAction(true);
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
    const speed = (pl.mods?.atkSpeed || 1) * (spec.speed || 1);
    act = {
      ...spec, t: 0, speed, yaw0: yaw, target: tgt, counter: false, hitsets: [], lungeDist: 0, done: false,
      evDone: new Uint8Array((spec.events || []).length), vyDone: new Uint8Array((spec.setVy || []).length),
      prevS: new Float32Array((spec.hits || []).length).fill(-1), airborne: !pl.grounded && airAttacks < 4,
    };
    if (!pl.grounded) airAttacks++;
    for (let i = 0; i < (spec.hits || []).length; i++) act.hitsets.push(new Set());
    if (pl.counterReady > 0 && (spec.kind === 'combo' || spec.kind === 'heavy')) { act.counter = true; pl.consumeCounter(); }
    // lunge toward the soft-locked target
    if (spec.lunge != null) {
      if (tgt) {
        const d = Math.hypot(tgt.object.position.x - pos().x, tgt.object.position.z - pos().z) - (tgt.radius || 0.5) - 0.95;
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
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const t0 = h.t0 * a.dur, t1 = h.t1 * a.dur;
      if (tNow < t0 || tPrev > t1) continue;
      const sPrev = a.prevS[i] < 0 ? 0 : a.prevS[i];
      const sNow = sInWin(tNow, t0, t1);
      if (a.prevS[i] < 0) {
        // window opens: spawn the visual crescent matched to the sweep
        if (h.arc) arc({ yaw: h.follow ? P().facing : a.yaw0, a0: h.a0 ?? -1.5, a1: h.a1 ?? 1.5, sweep: Math.max(0.05, (t1 - t0) / a.speed), rout: (h.reach || 2.5) + 0.2, ...h.arc });
        if (h.swing !== false) sfx(h.heavy || h.spec?.heavy ? 'sword_swing_heavy' : 'sword_swing', { position: p, pitch: rand(0.94, 1.08) * (h.pitch || 1) });
        try { h.onOpen?.(a, h); } catch (err) { console.error('[sword] onOpen', err); }
      }
      a.prevS[i] = sNow;
      const set = a.hitsets[i];
      const yaw = h.follow ? P().facing : a.yaw0;
      if (h.shape === 'arc') sweepArc(h, set, sPrev, sNow, yaw, p);
      else if (h.shape === 'line') { fwd(v2, yaw); v1.copy(p); if (h.back) v1.addScaledVector(v2, -h.back); hitLine(v1, v2, h.len || 3, h.width || 1, h.spec, set); }
      else if (h.shape === 'circle') { v1.copy(p); if (h.fwdOff) v1.addScaledVector(fwd(v2, yaw), h.fwdOff); hitCircle(v1, h.r || 3, h.spec, set); }
      else if (h.shape === 'sector') sweepArc({ ...h, a0: -(h.half || 0.6), a1: h.half || 0.6 }, set, 0, 1, yaw, p);
    }
  }
  function sweepArc(h, set, sPrev, sNow, yaw, p) {
    const a0 = h.a0 + (h.a1 - h.a0) * sPrev, a1 = h.a0 + (h.a1 - h.a0) * sNow;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1), mid = (lo + hi) * 0.5;
    const reach = (h.reach || 2.5) + 0.35, inner = h.inner || 0;
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
      if (h.spec?.dirMode === 'fwd') fwd(hitD, yaw); else outDir(e, p, hitD);
      applyHit(e, h.spec, hitP, hitD);
    }
  }

  function updateAction(dt) {
    const pl = P(), A = pl.action;
    const a = act;
    if (!a) {
      poseW = damp(poseW, 0, 14, dt);
      A.active = poseW > 0.02 && !charging; A.poseW = poseW; A.pose.set(pose);
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
    A.cancelable = tNow >= (a.cancel ?? a.dur) * 1;
    // dodge/guard cancel: once the last hit window has closed (ultimates/finishers stay committed
    // unless the move sets dodgeCancel explicitly)
    if (a._dc === undefined) {
      let m = 0; for (const h of (a.hits || [])) m = Math.max(m, h.t1 ?? 0);
      a._dc = a.dodgeCancel != null ? a.dodgeCancel * a.dur
        : (a.kind === 'finisher' || a.kind === 'ultimate') ? Infinity : m * a.dur;
    }
    A.dodgeCancelable = A.cancelable || tNow >= a._dc;
    A.noGlide = true; A.superArmor = !!a.superArmor;
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
    runHits(a, tPrev, tNow);
    // trail window
    const tw = a.trail;
    a.trailOn = tw ? tNow >= tw[0] * a.dur && tNow <= tw[1] * a.dur : false;
    if (a.t >= a.dur && act === a) endAction(false);
  }

  // ---------------- combo / skills entry points ----------------
  const ctx = () => ({ el: element, awakened: !!prog()?.hasAwakenedUltimate?.(), master: !!prog()?.isMaster?.() });
  let moves = null;
  const S = {
    game, fx, get element() { return element; }, get act() { return act; }, hits: 0,
    pos, fwd, groundAt, findTarget, foesNear, centerOf, isFoe, applyHit, hitCircle, hitLine, arc, after, every,
    startAction, endAction, contact, outDir, vcall, sfx, PAL, UP,
    surface: () => game.world?.surface,
    terrain(kind, p, r = 1, dir = null) {
      const s = game.world?.surface; if (!s) return;
      try {
        if (kind === 'ignite') s.ignite?.(p, r, 1);
        else if (kind === 'wind') s.wind?.(p, dir || fwd(v2), 1, r);
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
    slashTerrain(p) {
      if (element === 'fire' && igniteCd <= 0) { igniteCd = 2.5; v4.copy(p); v4.y = groundAt(p.x, p.z); S.terrain('ignite', v4, 1); }
      else if (element === 'wind') S.terrain('wind', p, 4, fwd(v2));
      else if (element === 'ice') S.terrain('freeze', p, 2.5);
    },
    emit(kind, spellId) {
      events.emit('spellCast', { element, kind, spellId, origin: P().getSwordTip(new THREE.Vector3()), cls: 'sword' });
    },
  };

  function comboAttack() {
    const step = comboStep;
    const spec = moves.combo(element, step, ctx());
    if (!spec) return;
    startAction(spec);
    events.emit('swordSwing', { element, step });
    if (step === 0) S.emit('basic', `sword_${element}_basic`);
    comboStep = (step + 1) % 4;
    comboIdle = 0;
  }
  function counterFlurry() {
    // 반격: after 완벽 회피 / 간파 the next attack is a guaranteed-crit flurry rush onto the attacker
    const pl = P();
    const tgt = (pl.counterTarget?.alive && pl.counterTarget) || findTarget(9, -0.5);
    const spec = moves.flurry(element, tgt);
    startAction(spec);
    if (act) act.counter = true;
    pl.consumeCounter();
    comboStep = 0;
    events.emit('swordSwing', { element, step: 'counter' });
  }

  function startCharge() {
    if (cooldowns.heavy > 0) { events.emit('spellFail', { reason: 'cooldown', spellId: `sword_${element}_heavy` }); sfx('ui_click', { volume: 0.4, pitch: 0.7 }); return; }
    charging = true; chargeT = 0; chargeFrac = 0; chargeFull = false;
    if (act) endAction(true);
    P().setSwordDrawn(true);
    try { chargeLoop = game.audio?.loop?.('sword_charge', { volume: 0.6 }) || null; } catch (e) { chargeLoop = null; }
    events.emit('chargeStart', { element, cls: 'sword' });
  }
  function endCharge(release) {
    if (!charging) return;
    charging = false;
    try { chargeLoop?.stop?.(); } catch (e) { /* */ } chargeLoop = null;
    events.emit('chargeEnd', { element, cls: 'sword', released: release });
    if (release && chargeT >= MIN_CHARGE) {
      const frac = clamp(chargeT / FULL_CHARGE, 0, 1);
      const spec = moves.heavy(element, frac, ctx());
      // soft-lock: a charged release snaps onto an enemy near the camera direction (was: pure camera aim → whiffs)
      if (spec && spec.facing === 'camera' && spec.name !== 'heavy_lightning') {
        const tgt = findTarget(10, 0.6);
        if (tgt) {
          spec.facing = Math.atan2(tgt.object.position.x - pos().x, tgt.object.position.z - pos().z);
          if (spec.lunge != null) spec.target = tgt;
        }
      }
      if (spec) { startAction(spec); cooldowns.heavy = CD.heavy; S.emit('heavy', `sword_${element}_heavy`); }
    } else if (release) comboAttack(); // tap: plain swing
  }
  function updateCharge(dt) {
    const pl = P(), A = pl.action;
    chargeT += dt;
    const before = chargeFrac;
    chargeFrac = clamp(chargeT / FULL_CHARGE, 0, 1);
    const c = PAL[element];
    if (before < 1 && chargeFrac >= 1 && !chargeFull) {
      chargeFull = true;
      pl.getSwordTip(v1);
      vcall('burst', v1, { count: 22, color: [c.b, c.a], speed: 5, spread: 1, size: 0.1, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 2.5 });
      vcall('flash', v1, { color: c.a, intensity: 3, distance: 6, duration: 0.2 });
      sfx('ui_select', { pitch: 1.5 });
    }
    chargeFxT -= dt;
    if (chargeFxT <= 0) {
      chargeFxT = 0.04 - chargeFrac * 0.015;
      pl.getSwordBase(v2); pl.getSwordTip(v3);
      const n = 1 + Math.round(chargeFrac * 2);
      for (let i = 0; i < n; i++) {
        v1.lerpVectors(v2, v3, Math.random());
        v4.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize();
        v1.addScaledVector(v4, 0.9);
        v4.negate();
        vcall('burst', v1, { count: 1, color: [c.b, c.a], speed: 2.6, spread: 0, dir: v4, size: 0.07, sizeEnd: 0.02, life: 0.32, drag: 0, gravity: 0, shape: 'spark', velocityStretch: 1.4 });
      }
      if (chargeFrac > 0.25 && Math.random() < 0.5) { pl.getSwordTip(v1); vcall('burst', v1, { count: 1, color: c.a, speed: 0.4, spread: 1, size: 0.35 + chargeFrac * 0.4, sizeEnd: 0, life: 0.2, shape: 'soft' }); }
    }
    pose.set(STANCE.charge);
    // trembling blade at high charge
    pose[3] += Math.sin(game.time * 40) * 0.015 * chargeFrac;
    pose[8] += chargeFrac * 0.08;
    poseW = damp(poseW, 1, 25, dt);
    A.active = true; A.pose.set(pose); A.poseW = poseW;
    A.facing = pl.yaw + Math.PI; A.turn = 18; A.move = 0.35; A.vel.set(0, 0, 0); A.setVy = NaN; A.gravityMul = 1;
    A.cancelable = true; A.noGlide = true; A.bodyYaw = 0; A.superArmor = false;
    pl.gear.edgeMat.uniforms.uIntensity.value = 1 + chargeFrac * 1.6;
  }

  function ultimate() {
    if (cooldowns.ultimate > 0) { events.emit('spellFail', { reason: 'cooldown', spellId: `sword_${element}_ultimate` }); return; }
    const spec = moves.ultimate(element, ctx());
    if (!spec) return;
    if (charging) endCharge(false);
    startAction(spec);
    cooldowns.ultimate = CD.ultimate;
    S.emit('ultimate', `sword_${element}_ultimate${ctx().awakened ? '_awakened' : ''}`);
  }
  function support() {
    if (cooldowns.support > 0) { events.emit('spellFail', { reason: 'cooldown', spellId: `sword_${element}_support` }); return; }
    cooldowns.support = CD.support;
    const def = moves.support(element);
    startBuff(element, def);
    startAction(moves.supportAction(element));
    S.emit('support', `sword_${element}_support`);
  }
  function startBuff(el, def) {
    endBuff();
    buffs.id = el; buffs.t = def.duration; buffs.dur = def.duration; buffs.def = def; buffs.tick = 0;
    const m = P().mods;
    Object.assign(m, def.mods);
    try {
      buffs.emitter = vfx()?.emitter?.({ follow: P().object, offset: new THREE.Vector3(0, 1, 0), rate: 18, count: 1, color: [PAL[el].a, PAL[el].b], speed: 1.2, spread: 1, size: 0.12, sizeEnd: 0, life: 0.6, shape: def.shape || 'spark', gravity: def.gravity ?? -1.5, drag: 1, duration: def.duration }) || null;
    } catch (e) { buffs.emitter = null; }
  }
  function endBuff() {
    if (!buffs.id) return;
    const m = P().mods;
    m.atkMul = 1; m.dmgTakenMul = 1; m.moveMul = 1; m.atkSpeed = 1; m.doubleJump = false; m.extraDash = 0; m.noKnockback = false;
    try { buffs.emitter?.stop?.(); } catch (e) { /* */ }
    buffs.emitter = null; buffs.id = null; buffs.def = null;
  }
  function finisher() {
    const pr = prog();
    if (!pr?.hasFinisher?.() || !pr.canFinisher?.()) { if (pr?.hasFinisher?.()) events.emit('spellFail', { reason: 'gauge', spellId: `sword_${element}_finisher` }); return; }
    if (!pr.consumeAwakening()) return;
    if (charging) endCharge(false);
    const fin = moves.finisher(element);
    const tgt = findTarget(16, -0.2);
    const center = new THREE.Vector3();
    if (tgt) center.copy(tgt.object.position); else center.copy(pos()).addScaledVector(fwd(v1), 7);
    center.y = groundAt(center.x, center.z);
    if (tgt) P().setFacing(Math.atan2(center.x - pos().x, center.z - pos().z));
    S.emit('finisher', `sword_${element}_finisher`);
    events.emit('finisherStart', { element, name: fin.name, cls: 'sword' });
    sfx('finisher_charge', { position: pos() });
    // hold the power-up pose for the whole cinematic
    const hold = startAction({ name: fin.name, kind: 'finisher', tpl: 'raise', dur: 60, cancel: 60, move: 0, superArmor: true, target: null, facing: P().facing,
      onUpdate: (dt, a) => fin.buildup?.(S, a.t, center) });
    let impacted = false;
    const impact = () => {
      if (impacted) return; impacted = true;
      sfx('finisher_impact', { position: center });
      events.emit('finisherImpact', { element, point: center.clone(), cls: 'sword' });
      try { fin.impact(S, center, tgt); } catch (err) { console.error('[sword] finisher impact', err); }
    };
    const done = () => { impact(); if (act === hold) { endAction(false); startAction({ name: 'fin_end', kind: 'finisher', tpl: 'raiseSlam', dur: 0.6, cancel: 0.4, move: 0, target: null, facing: P().facing }); } };
    const cin = game.cinematic;
    const cinOk = cin?.finisher && !(game.stubbed || []).includes('cinematic');
    if (cinOk) {
      try {
        cin.finisher({ cls: 'sword', element, name: fin.name, target: tgt, center, onBuildup: (t) => { try { fin.buildup?.(S, t, center); } catch (_) { /* */ } }, onImpact: impact, onEnd: done });
        return;
      } catch (err) { console.error('[sword] cinematic.finisher', err); }
    }
    // non-cinematic fallback: slow-mo power-up then impact
    game.slowmo?.(0.35, 1.2);
    vcall('screenFlash', PAL[element].a, 0.25, 0.6);
    after(0.45, () => { vcall('fovKick', -8, 0.6); });
    after(0.55, done);
  }

  // ---------------- element selection ----------------
  function unlocked() { return prog()?.unlockedElements?.() || []; }
  function setElement(el, silent = false) {
    if (!el || !ELEMENTS.includes(el) || !(prog()?.isElementUnlocked?.(el))) return;
    const changed = el !== element;
    element = el; index = ELEMENTS.indexOf(el);
    fx.trail.setColor(PAL[el].a);
    P()?.setStaffElement?.(el);
    if (changed && !silent) { events.emit('elementChanged', { element, index, cls: 'sword' }); sfx('ui_select', { pitch: 1.2, volume: 0.5 }); }
    else if (silent) events.emit('elementChanged', { element, index, cls: 'sword' });
  }

  // ---------------- blade ambience ----------------
  function bladeAmbience(dt) {
    const pl = P();
    if (!pl.swordDrawn) return;
    ambT -= dt;
    if (ambT > 0) return;
    ambT = 0.07;
    pl.getSwordBase(baseW); pl.getSwordTip(tipW);
    v1.lerpVectors(baseW, tipW, 0.25 + Math.random() * 0.75);
    const c = PAL[element];
    const o = AMB[element];
    vcall('burst', v1, { count: 1, color: [c.a, c.b], speed: o.speed, spread: 1, dir: UP, size: o.size, sizeEnd: 0, life: o.life, shape: o.shape, gravity: o.gravity, drag: 2, additive: o.additive !== false });
  }
  const AMB = {
    fire: { shape: 'ember', speed: 0.8, size: 0.07, life: 0.5, gravity: -3 },
    ice: { shape: 'snow', speed: 0.3, size: 0.06, life: 0.7, gravity: 1 },
    lightning: { shape: 'spark', speed: 2.5, size: 0.05, life: 0.14, gravity: 0 },
    wind: { shape: 'soft', speed: 0.9, size: 0.12, life: 0.4, gravity: -0.5 },
    earth: { shape: 'shard', speed: 0.5, size: 0.05, life: 0.5, gravity: 4, additive: false },
  };

  // ---------------- HUD ----------------
  const hud = {
    element: 'fire', index: 0, cls: 'sword',
    elements: ELEMENTS.map((id) => ({ id, name: ELEMENT_NAMES_KO[id], color: ELEMENT_COLORS[id], locked: true })),
    slots: [], charging: false, chargeFrac: 0, awakening: { enabled: false, value: 0, ready: false },
  };
  const mkSlot = (kind, key) => ({ kind, key, name: '', desc: '', mpCost: 0, staminaCost: 0, cooldown: 0, cooldownLeft: 0, ready: true, awakened: false, id: '' });
  const slotAll = [mkSlot('basic', 'LMB'), mkSlot('heavy', 'RMB'), mkSlot('ultimate', 'F'), mkSlot('support', 'G'), mkSlot('finisher', 'R')];
  function getHudState() {
    const pr = prog();
    const master = !!pr?.isMaster?.();
    hud.element = element; hud.index = index; hud.charging = charging; hud.chargeFrac = chargeFrac;
    for (const e of hud.elements) e.locked = !pr?.isElementUnlocked?.(e.id);
    hud.slots.length = 0;
    const info = moves?.info?.(element, ctx());
    for (const s of slotAll) {
      if ((s.kind === 'support' || s.kind === 'finisher') && !master) continue;
      const d = info?.[s.kind] || {};
      s.name = d.name || ''; s.desc = d.desc || ''; s.id = `sword_${element}_${s.kind}`;
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
  function update(dt, realDt) {
    const pl = P();
    if (!pl?.action) return;
    dt *= pl.timeComp?.() || 1;
    fx.arcs.update(dt, game.time);
    fx.iceSpikes.update(dt); fx.rockSpikes.update(dt); fx.stones.update(dt); fx.dragon.update(dt);
    fx.orbit.update(dt, pos());
    runTasks(dt);
    for (const k in cooldowns) if (cooldowns[k] > 0) cooldowns[k] = Math.max(0, cooldowns[k] - dt);
    igniteCd -= dt;
    if (buffs.id) {
      buffs.t -= dt;
      try { buffs.def?.tick?.(S, dt, buffs); } catch (err) { console.error('[sword] buff', err); }
      if (buffs.t <= 0 || !active()) endBuff();
    }

    if (!active() || game.state !== 'playing') {
      if (!active()) { if (act) endAction(true); if (charging) endCharge(false); pl.action.active = false; fx.trail.update(dt, false, baseW, tipW); }
      return;
    }
    const inp = game.input;
    const alive = pl.entity.alive;
    let canAct = alive;
    try { if (canAct && game.combat?.canAct) canAct = game.combat.canAct(pl.entity) !== false; } catch (e) { /* */ }
    if (pl.guardBroken) canAct = false;

    // element
    if (!prog()?.isMaster?.()) {
      for (let i = 0; i < 5; i++) if (inp.pressed('Digit' + (i + 1))) setElement(ELEMENTS[i]);
      if (inp.wheel) {
        const un = unlocked();
        if (un.length > 1) { let k = un.indexOf(element); k = (k + (inp.wheel > 0 ? 1 : -1) + un.length) % un.length; setElement(un[k]); }
      }
    }

    // defensive cancels: dash / guard interrupt cancelable actions; stun interrupts everything
    if (act && (!canAct || pl.dashing || pl.blocking) && act.kind !== 'finisher') { endAction(true); poseW = pl.dashing ? 0 : poseW; comboStep = 0; }
    if (charging && (!canAct || pl.dashing || pl.blocking)) endCharge(false);

    // ---- input ----
    if (canAct && !pl.blocking && !pl.dashing) {
      const lmbP = inp.mousePressed(0);
      if (lmbP) { buffer = BUFFER_T; bufferKind = pl.counterReady > 0 ? 'counter' : 'combo'; }
      else if (inp.mouseDown(0) && !charging && (!act || act.kind === 'combo')) { if (buffer <= 0) { buffer = 0.05; bufferKind = 'combo'; } }
      // RMB pressed mid-swing is buffered and the charge starts once the swing becomes cancelable (button still held)
      if (inp.mousePressed(2)) heavyBuf = 0.5;
      if (heavyBuf > 0 && inp.mouseDown(2) && !charging && (!act || game.player.action.cancelable)) { heavyBuf = 0; startCharge(); }
      if (charging) {
        if (!inp.mouseDown(2)) endCharge(true);
      }
      const storyPrompt = !!game.story?.hasPrompt?.();
      if (inp.pressed('KeyF') && !storyPrompt && (!act || pl.action.cancelable || act.kind === 'combo')) ultimate();
      if (inp.pressed('KeyR') && (!act || pl.action.cancelable || act.kind === 'combo')) finisher();
      if (inp.pressed('KeyG') && prog()?.hasSupport?.() && (!act || pl.action.cancelable)) support();
    }
    if (heavyBuf > 0) heavyBuf -= dt;
    // buffered combo
    if (buffer > 0) {
      buffer -= dt;
      const can = !charging && canAct && !pl.blocking && !pl.dashing && (!act || (pl.action.cancelable && (act.kind === 'combo' || act.kind === 'recover' || act.t >= act.dur * 0.75)));
      if (can) {
        buffer = 0;
        if (bufferKind === 'counter' && pl.counterReady > 0) counterFlurry();
        else { if (!act && comboIdle > COMBO_RESET) comboStep = 0; comboAttack(); }
      }
    }
    if (!act) comboIdle += dt;
    if (pl.grounded) airAttacks = 0;

    if (charging) updateCharge(dt);
    else updateAction(dt);

    // blade ribbon
    if (pl.swordDrawn) { pl.getSwordBase(baseW); pl.getSwordTip(tipW); }
    fx.trail.update(dt, !!act?.trailOn, baseW, tipW);
    bladeAmbience(dt);

    // auto-sheathe when calm
    if (!act && !charging && !pl.blocking) {
      idleT += dt;
      if (idleT > 6 && pl.swordDrawn) {
        let calm = true;
        for (const e of game.enemies?.list || []) if (e.aggro && e.alive && e.object.position.distanceToSquared(pos()) < 900) { calm = false; break; }
        if (calm) pl.setSwordDrawn(false); else idleT = 3;
      }
    } else idleT = 0;
  }

  function onPathChosen(p) {
    if (p?.cls !== 'sword') { endBuff(); return; }
    const un = unlocked();
    setElement(p.element && un.includes(p.element) ? p.element : un[0] || 'fire', true);
    comboStep = 0; for (const k in cooldowns) cooldowns[k] = 0;
  }

  function warmup() {
    try {
      const objs = [fx.arcs.items[0].mesh, fx.trail.mesh, fx.iceSpikes.mesh, fx.rockSpikes.mesh, fx.orbit.mesh, fx.dragon.mesh, fx.dragon.coreMesh, ...fx.stones.items.map((x) => x.m)];
      const g = P()?.gear;
      const gearObjs = g ? g.all.filter((o) => !o.visible) : [];
      const vis = objs.map((o) => o.visible);
      const cnt = objs.map((o) => o.count);
      objs.forEach((o) => { o.visible = true; if (o.isInstancedMesh) o.count = 1; });
      gearObjs.forEach((o) => { o.visible = true; });
      game.renderer.compile(scene, game.camera);
      objs.forEach((o, i) => { o.visible = vis[i]; if (o.isInstancedMesh) o.count = cnt[i]; });
      gearObjs.forEach((o) => { o.visible = false; });
    } catch (err) { console.warn('[sword] warmup', err); }
  }

  const api = {
    get element() { return element; }, get index() { return index; }, get elements() { return unlocked(); },
    get charging() { return charging; }, get chargeFrac() { return chargeFrac; },
    get comboStep() { return comboStep; }, get action() { return act; }, get buff() { return buffs.id; },
    cooldowns, fx, S,
    getHudState, update, setElement,
    /** Test hook: run a move directly: kind 'combo'|'heavy'|'ultimate'|'finisher'|'support', opts {charge, step} */
    debugUse(kind, opts = {}) {
      if (kind === 'combo') { comboStep = opts.step ?? comboStep; comboAttack(); }
      else if (kind === 'heavy') { const s = moves.heavy(element, opts.charge ?? 1, ctx()); startAction(s); }
      else if (kind === 'ultimate') { cooldowns.ultimate = 0; ultimate(); }
      else if (kind === 'finisher') { prog().awakening = 100; finisher(); }
      else if (kind === 'support') { cooldowns.support = 0; support(); }
      return !!act;
    },
    init() {
      moves = buildMoves(S);
      try { combatV2 = /addAwakening|melee/.test(String(game.combat?.dealDamage || '')); } catch (e) { combatV2 = false; }
      events.on('pathChosen', onPathChosen);
      if (prog()?.cls === 'sword') onPathChosen({ cls: 'sword', element: prog().element });
      // 서리 방벽 (ice armor) chills attackers; keep it here so the player module stays class-agnostic
      events.on('damage', (p) => {
        if (!p?.isPlayer || buffs.id !== 'ice') return;
        const src = p.source; if (src && typeof src === 'object' && src.alive) { try { game.combat?.applyStatus?.(src, 'chilled', 3); } catch (e) { /* */ } }
      });
      events.on('playerDeath', () => { if (act) endAction(true); if (charging) endCharge(false); endBuff(); });
      warmup();
    },
  };
  return api;
}
