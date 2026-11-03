// Player (CONTRACT §10): the hero for all 6 classes, third-person controller, camera, aim, resources, class kits
// (dodge Q / defend E), HP regen, platforms and bounds. Class-specific behaviour is data in player/kits.js (KITS) and
// player/classes.js (outfits, weapon props); family/style come from core/classes.js. No class literals here (rule 8).
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, angleDiff, rand } from './core/utils.js';
import { elColor } from './core/elements.js';
import { CLASS_DEFS, familyOf, styleOf } from './core/classes.js';
import { buildWizard, skinMerge } from './player/model.js';
import { Cape } from './player/cape.js';
import { RuneCircle, Afterimages } from './player/fx.js';
import { Animator, CAST_DUR } from './player/anim.js';
import { buildSwordGear } from './player/swordsman.js';
import { buildClassGear, setClassOutfit, alignMergeKeys } from './player/classes.js';
import { PF, lerpPose, applySwordArms } from './player/swordpose.js';
import { Barrier } from './player/defense.js';
import { kitOf, KIT_NAMES, legacyBlockType } from './player/kits.js';
import { Resources } from './player/resource.js';
import { Regen } from './player/regen.js';
import { Springs } from './player/springs.js';
import { FootIK } from './player/ik.js';
import { castKindOf, meleeStance, DODGE_POSES, FIDGETS } from './player/poses.js';

const WALK = 5.5, SPRINT = 9, GRAVITY = 22, JUMP_VEL = 8;
const GLIDE_FALL = 2.5, GLIDE_SPEED = 8;
const SENS = 0.0022, PITCH_MIN = -1.15, PITCH_MAX = 0.85;
const CAM_DIST = 5.5, CAM_DIST_AIM = 3.8, SHOULDER = 1.2, SHOULDER_AIM = 0.85, PIVOT_H = 1.85;
const BASE_FOV = 62;
const DEEP_WATER = 1.15;
const AIM_CONE = Math.cos(THREE.MathUtils.degToRad(4.5));
const GUARD_BREAK_T = 0.8, UPDRAFT_VY_CAP = 9, SPRINT_STAM = 18, GLIDE_STAM = 10, GLIDE_STAM_UPDRAFT = 4;
const HARD_LAND_H = 6, DAZZLED_PARRY_ADD = 0.1;
const DODGE_COL = new THREE.Color(0.45, 0.75, 1), DASH_COL = new THREE.Color(0.85, 0.92, 1);
const SHADOW_COL = new THREE.Color(0.62, 0.35, 1), SPIRIT_COL = new THREE.Color(0.6, 1, 0.7), HOLY_COL = new THREE.Color(1, 0.88, 0.55);
const WHITE = new THREE.Color(1, 1, 1);

export function createPlayer(game) {
  const { scene, camera, events, input } = game;

  const rig = buildWizard();
  const root = rig.root;
  const gear = buildSwordGear(rig);
  const cg = buildClassGear(rig, gear);   // every class's props, before skinMerge (CONTRACT §10.1)
  // Perf: only sizeable parts cast shadows (each caster is an extra shadow-pass draw call; tiny trims/buttons/eyes
  // are invisible in the soft cel shadow). Outlines never cast.
  root.updateMatrixWorld(true);
  const _ws = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.castShadow || o.name === 'outline') { o.castShadow = false; return; }
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(_ws);
    if (o.geometry.boundingSphere.radius * Math.max(_ws.x, _ws.y, _ws.z) < 0.13) o.castShadow = false;
  });
  try { alignMergeKeys(root, cg); } catch (err) { console.warn('[player] alignMergeKeys', err); }
  scene.add(root);
  // Perf: the whole rig (≈170 draw calls) → a handful of rigidly skinned meshes (see model.js skinMerge)
  try { rig.skin = skinMerge(root); } catch (err) { console.warn('[player] skinMerge failed, using per-part meshes', err); }
  const anim = new Animator(rig);
  const springs = new Springs(cg.chains);
  const footIK = new FootIK(rig);
  const cape = new Cape(scene, rig.torso, rig.capeAnchors, 9, 0.112);
  const chargeCircle = new RuneCircle(scene, 1.15);
  const sigil = new RuneCircle(scene, 1.9);
  const ghosts = new Afterimages(scene, root, 5);
  const barrier = new Barrier(scene);

  // ---------- entity ----------
  const velocity = new THREE.Vector3();
  const entity = {
    id: 'player', team: 'player', alive: true, object: root, radius: 0.4, height: 1.8,
    hp: 100, maxHp: 100, mass: 1, velocity, grounded: true, statuses: {}, name: '바람결의 젊은이',
    isPlayer: true, invulnerable: false,
    onBeforeDamage(hit) { return beforeDamage(hit); },
    onHit(result, hit) { onHit(result, hit); },
    onDeath(result, hit) { onDeath(result, hit); },
    getCenter(out = new THREE.Vector3()) { return out.copy(root.position).setY(root.position.y + 1.0); },
  };
  const pos = root.position;
  const R = new Resources(game, entity);
  const regen = new Regen(game, entity, pos);
  regen.dying = () => dying;

  // ---------- state ----------
  const hv = new THREE.Vector3();          // controlled horizontal velocity
  let vy = 0, grounded = true, wasGrounded = true, airTime = 0, coyote = 0, jumpBuffer = 0, peakY = 0;
  let facing = Math.PI, prevFacing = Math.PI, bank = 0, turnRate = 0;
  let yaw = 0, pitch = -0.12;
  let gliding = false, sprinting = false;
  let invulT = 0, ghostTimer = 0;
  let castKind = null, castT = 0, castRecent = 0, gemFlare = 0;
  let charging = false, chargeFrac = 0, chargeEl = null;
  let hurt = 0, squash = 0, deadW = 0, dying = false, deadTime = 0, respawnTimer = null;
  let phase = 0, lastSin = 0, stepSide = 1;
  let element = 'fire';
  const elemColor = new THREE.Color(elColor('fire'));
  const gemColor = new THREE.Color();
  let wSprint = 0, wAir = 0, wGlide = 0, wAction = 0, wAim = 0, speedFrac = 0, wFov = 0, wBowAim = 0, wFocus = 0, wLand = 0;
  let accelF = 0, lastSpeed = 0;
  let sparkleT = 0, convergeT = 0, wadeT = 0;
  let aimPitch = 0;
  // ---- class & kit ----
  let cls = null;   // null until the class is chosen (neutral villager look, no Q/E skills)
  let kit = kitOf(null);
  // dodge state (all kit types)
  let dodgeT = 0, dodgeDur = 0, dodgeIframeT = 0, dodgeStartT = -10, dodgeEndT = -10, dodgeCd = 0, dodgeType = 'none';
  let dodgeCharges = 1, dodgeRecharge = 0, superArmorT = 0, ghostT2 = 0;
  const dodgeDir = new THREE.Vector3(), blinkFrom = new THREE.Vector3(), blinkTo = new THREE.Vector3();
  let blinking = false;   // blink-type dodge (invisible travel)
  // defend state
  let blocking = false, blockT = 0, blockHeld = false, guardBreakT = 0;
  let wardHp = 0, wardBroken = false, wardRechargeT = 0;
  let counterT = 0, counterCd = 0;
  let focusing = false;
  let decoyT = 0; const decoyPos = new THREE.Vector3(); let decoyFxT = 0;
  // perfect / counter
  let counterReady = 0, counterTarget = null, perfectFx = 0, dilateT = 0;
  let inUpdraft = false, updraftT = 0, airJumps = 0;
  let drawnW = 0, swordDrawn = false;
  let fidgetT = 0, fidgetNext = 9, fidgetKind = null, idleT = 0;
  let mageRuneT = 0; const mageRunePos = new THREE.Vector3(); let mageRuneEl = 'fire';
  let bowDraw = 0, stringVel = 0, stringOff = 0;
  let platformHandle = null;
  /** Written every frame by the sword module (game.sword); consumed by the player on its next update. */
  const action = {
    active: false, facing: null, turn: 30, move: 1, vel: new THREE.Vector3(), setVy: NaN, gravityMul: 1,
    bodyYaw: 0, pose: new Float32Array(PF), poseW: 0, cancelable: true, dodgeCancelable: true, noGlide: false, superArmor: false,
  };
  /** player.mods: a read-only getter view over game.stats (CONTRACT §5). Legacy writers are forwarded to a stats source. */
  const legacyMods = {};
  const statGet = (k, d) => { try { const v = game.stats?.get?.(k); return v === undefined ? d : v; } catch (_) { return d; } };
  const legacyWrite = (k, v) => {
    if (k === 'doubleJump') { legacyMods.extraJumps = v ? 1 : 0; }
    else legacyMods[k] = v;
    try { game.stats?.set?.('legacy:mods', legacyMods); } catch (_) { /* */ }
  };
  const mods = {};
  for (const k of ['atkMul', 'dmgTakenMul', 'moveMul', 'atkSpeed', 'extraDash', 'noKnockback', 'castSpeed', 'cdrMul', 'healMul', 'regenRateMul',
    'dashDistMul', 'glideStamMul', 'infiniteGlide', 'noGlide', 'critChance', 'lifesteal', 'parryWindowAdd', 'extraJumps']) {
    const def = k === 'extraDash' || k === 'critChance' || k === 'lifesteal' || k === 'parryWindowAdd' || k === 'extraJumps' ? 0 : (k === 'noKnockback' || k === 'infiniteGlide' || k === 'noGlide') ? false : 1;
    Object.defineProperty(mods, k, { enumerable: true, get: () => statGet(k, def), set: (v) => legacyWrite(k, v) });
  }
  Object.defineProperty(mods, 'doubleJump', { enumerable: true, get: () => statGet('extraJumps', 0) > 0, set: (v) => legacyWrite('doubleJump', v) });
  const stancePose = new Float32Array(PF), finalPose = new Float32Array(PF);
  const defHud = { block: { active: false, perfect: false, type: 'barrier' }, dash: { charges: 1, maxCharges: 1, cooldownFrac: 0 },
    dodgeType: 'none', defendType: 'none', dodgeName: '', defendName: '', ward: { frac: 1, broken: false }, focus: false, counter: 0 };

  // camera state
  const pivot = new THREE.Vector3();
  const camPos = new THREE.Vector3(), camFwd = new THREE.Vector3(0, 0, -1), camRight = new THREE.Vector3(1, 0, 0);
  let camDist = CAM_DIST, camSnap = true;
  const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // scratch
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const tipV = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const wind = new THREE.Vector3(0.7, 0, 0.35);
  const gust = new THREE.Vector3();
  const springCtx = { legF: 0, legB: 0, wind: 0, gust };
  const _sq = new THREE.Quaternion(), _sv = new THREE.Vector3();
  const animState = {
    t: 0, dt: 0, phase: 0, amp: 0, speedFrac: 0, wSprint: 0, wAir: 0, wGlide: 0, wAction: 0,
    castKind: null, castT01: 0, chargeFrac: 0, hurt: 0, squash: 0, dead: 0, bank: 0, vy: 0,
    localVx: 0, localVz: 0, aimPitch: 0, flare: 0, flutter: 0, accel: 0,
    stance: 'mage', dodgePose: 'none', dodgeT01: 0, landW: 0, fidget: null, fidgetT01: 0,
    lookYaw: 0, lookPitch: 0, lookW: 1, bowAim: 0, focusW: 0,
  };

  const W = () => game.world;
  /** Feet height: world.getGroundHeight(x, z, yHint) (terrain, frozen water, stand-on platforms near yHint) with getHeight fallback. */
  const groundAt = (x, z, yHint) => {
    const w = W();
    let h;
    if (w?.getGroundHeight) h = yHint === undefined ? w.getGroundHeight(x, z) : w.getGroundHeight(x, z, yHint);
    else h = w?.getHeight?.(x, z);
    return Number.isFinite(h) ? h : 0;
  };
  /** The camera and the slope probe only look at the terrain/ground under the hero's height. */
  const groundAtFeet = (x, z) => groundAt(x, z, pos.y);
  const waterLevel = () => { const w = W()?.waterLevel; return Number.isFinite(w) ? w : -1e9; };
  /** water depth at (x,z) given ground height h (0 when dry). */
  const waterDepth = (x, z, h) => {
    const wl = waterLevel();
    if (wl - h <= 0) return 0;
    const fn = W()?.isInWater;
    if (typeof fn === 'function') { try { if (!fn.call(W(), x, z)) return 0; } catch (e) { /* */ } }
    return wl - h;
  };
  /** world.clampToBounds (circle + plateau/ledge AABBs), else the legacy radial clamp. */
  const clampBounds = (p) => {
    const w = W();
    if (typeof w?.clampToBounds === 'function') { try { w.clampToBounds(p); return; } catch (_) { /* fall back */ } }
    const bounds = w?.bounds;
    if (Number.isFinite(bounds)) { const r = Math.hypot(p.x, p.z); if (r > bounds) { p.x *= bounds / r; p.z *= bounds / r; } }
  };
  const outOfBounds = (x, z) => { v5.set(x, pos.y, z); clampBounds(v5); return Math.abs(v5.x - x) > 1e-3 || Math.abs(v5.z - z) > 1e-3; };
  const vfx = () => game.vfx;
  const vfxCall = (name, ...args) => { try { return vfx()?.[name]?.(...args); } catch (e) { return null; } };
  const ev = (name, payload) => events.emit(name, payload);
  const elHex = () => elColor(element);
  const ts = () => game.timeScale;
  const slow = (id, scale, dur) => { try { if (ts()?.set) ts().set(id, scale, dur); else game.slowmo?.(scale, dur); } catch (_) { /* */ } };
  const isMelee = () => familyOf(cls) === 'melee';
  const style = () => (cls ? styleOf(cls) : 'staff');
  const talentOn = (id) => {
    try {
      if (game.stats?.has?.('talent:' + id)) return true;
      const P = game.progression; if (!P?.cls) return false;
      return (game.classes?.talentsFor?.(P.cls, P.level || 1, P.talentChoice) || []).includes(id);
    } catch (_) { return false; }
  };

  function setStaffElement(el) {
    if (!el) return;
    const changed = el !== element;
    element = el;
    elemColor.setHex(elColor(el));
    rig.haloMat.color.copy(elemColor);
    rig.light.color.copy(elemColor);
    rig.moteMat.color.copy(elemColor).lerp(WHITE, 0.25);
    chargeCircle.setColor(elemColor); sigil.setColor(elemColor);
    if (kit.defend.type !== 'ward') barrier.setColor(elemColor);
    entity.resist = el === 'fire' ? { fire: 0.35 } : undefined; // attuned to fire: own grass fires barely singe
    gear.gemMat.color.copy(elemColor).multiplyScalar(1.3);
    gear.edgeMat.uniforms.uColor.value.copy(elemColor);
    if (changed && game.state === 'playing') {
      gemFlare = Math.max(gemFlare, 0.6);
      api.getWeaponTip('main', v4);
      vfxCall('burst', v4, { count: 14, color: [elColor(el), 0xffffff], speed: 2.2, spread: 1, size: 0.09, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 2 });
    }
  }

  let checkpoint = null;
  function placeAtSpawn(useCheckpoint = false) {
    const sp = (useCheckpoint && checkpoint) || W()?.playerSpawn;
    if (sp) pos.set(sp.x, 0, sp.z); else pos.set(0, 0, 120);
    if (useCheckpoint && checkpoint) { try { W()?.resolveCollision?.(pos, entity.radius + 0.6); } catch (e) { /* */ } }
    pos.y = groundAt(pos.x, pos.z);
    vy = 0; hv.set(0, 0, 0); velocity.set(0, 0, 0);
    grounded = wasGrounded = true; peakY = pos.y;
    yaw = 0; pitch = -0.12; facing = prevFacing = Math.PI;
    root.rotation.set(0, facing, 0);
    root.updateMatrixWorld(true);
    cape.reset(); springs.reset();
    camSnap = true;
  }

  // ---------- combat hooks ----------
  function onHit(result, hit) {
    if (entity.invulnerable && result?.damage > 0) {
      // combat should skip invulnerable targets; undo if it didn't
      entity.hp = Math.min(entity.maxHp, entity.hp + result.damage);
      regen.afterHit();
      return;
    }
    const dmg = result?.damage || 0;
    // Fallback for a combat module without the onBeforeDamage hook: evaluate block/dodge now and refund.
    if (hit && !hit._pbd && !result?.blocked) {
      const r = beforeDamage(hit);
      if (r?.cancel) {
        entity.hp = Math.min(entity.maxHp, entity.hp + dmg); velocity.set(0, 0, 0);
        if (r.parried && hit.source && typeof hit.source === 'object') { try { hit.source.onParried?.(entity); } catch (e) { /* */ } }
        ev('blocked', { target: entity, parried: !!r.parried, perfect: !!r.perfect, point: hit.point, source: hit.source });
        regen.afterHit();
        return;
      }
      if (r?.mul != null) {
        entity.hp = Math.min(entity.maxHp, entity.hp + dmg * (1 - r.mul));
        ev('blocked', { target: entity, parried: false, perfect: false, point: hit.point, source: hit.source });
      }
    }
    // v2 combat does not apply stats.dmgTakenMul itself: refund here, BEFORE the regen comparison (CONTRACT §10.3).
    // v3 combat (it has healPlayer) applies it inside the canonical formula.
    if (!game.combat?.healPlayer) {
      const takenMul = statGet('dmgTakenMul', 1);
      if (takenMul < 1 && dmg > 0 && !(hit?.tags || []).includes('dot')) entity.hp = Math.min(entity.maxHp, entity.hp + dmg * (1 - takenMul));
    }
    const hpDropped = regen.afterHit();
    if (hit?._pbdRes?.cancel || result?.blocked) return;
    if (hit?._pbdRes?.mul != null) { velocity.multiplyScalar(0.35); hurt = Math.max(hurt, 0.35); return; }
    if (!hpDropped) return;
    const isDot = !!hit?.isDot || (hit?.tags || []).includes('dot');
    // directional hurt pose from the hit direction (or the source position)
    if (!isDot) {
      if (hit?.direction) v1.copy(hit.direction); else if (sourcePos(hit, v1)) v1.subVectors(pos, v1); else v1.set(0, 0, 0);
      v1.setY(0);
      if (v1.lengthSq() > 1e-6) {
        v1.normalize();
        const cf = Math.cos(facing), sf = Math.sin(facing);
        anim.hurtKick(v1.x * cf - v1.z * sf, v1.x * sf + v1.z * cf, clamp(dmg / Math.max(20, entity.maxHp * 0.15), 0.3, 1.2));
      }
    }
    // support buffs: stagger immunity / shield step super armor
    if (statGet('noKnockback', false) || action.superArmor || superArmorT > 0) { velocity.set(0, 0, 0); hurt = Math.max(hurt, 0.3); return; }
    if (isDot) { hurt = Math.max(hurt, 0.25); return; }
    hurt = 1;
    if (charging) gemFlare = 0.3;
  }

  // ---------- defend / dodge evaluation ----------
  function sourcePos(hit, out) {
    const s = hit?.source;
    if (s && typeof s === 'object' && s.object) return out.copy(s.object.position);
    if (hit?.point) return out.copy(hit.point);
    return null;
  }
  const frontOf = (hit, arc) => {
    if (!sourcePos(hit, v4)) return true;
    v4.sub(pos).setY(0);
    if (v4.lengthSq() <= 0.04) return true;
    return v4.normalize().dot(v3.set(Math.sin(facing), 0, Math.cos(facing))) > arc;
  };
  const parryWindow = (base, hit) => {
    let w = base + (statGet('parryWindowAdd', 0) || 0);
    const s = hit?.source;
    if (s && typeof s === 'object' && s.statuses?.dazzled) w += DAZZLED_PARRY_ADD;
    return w;
  };
  /** player.entity.onBeforeDamage — called by combat before damage is applied (also the HP snapshot for regen). */
  function beforeDamage(hit) {
    if (!hit) return null;
    if (hit._pbd) return hit._pbdRes || null;
    hit._pbd = true; hit._pbdRes = null;
    regen.snapshot();
    const src = hit.source;
    if (src === 'player' || src?.team === 'player') return null;
    const tags = hit.tags || [];
    if (hit.isDot || tags.includes('dot') || tags.includes('tick') || !entity.alive || dying) return null;
    let r = null;
    const D = kit.defend, DG = kit.dodge;
    if (decoyT > 0) {
      // 정령 교대: the wisp left behind absorbs one hit
      decoyT = 0; popDecoy();
      r = { cancel: true, dodged: true };
    } else if (counterT > 0 && D.type === 'counter') {
      r = { cancel: true, parried: true, perfect: true };
      doCounter(hit);
    } else if (dodgeIframeT > 0) {
      if (DG.perfectWin > 0 && game.time - dodgeStartT <= DG.perfectWin) perfectDodge(hit);
      else dodgedFx();
      r = { cancel: true, dodged: true };
    } else if (blocking) {
      const t = D.type;
      const omni = t === 'barrier' || t === 'ward';
      if (omni || frontOf(hit, D.arc ?? -0.25)) {
        const amt = hit.amount || 0;
        const perfect = D.perfect > 0 && blockT <= parryWindow(D.perfect, hit);
        if (perfect) {
          const reflect = t !== 'shield' || talentOn('paladin.t10');
          r = { cancel: true, parried: true, perfect: true, reflect };
          doParry(hit);
        } else if (t === 'barrier') {
          R.mp = Math.max(0, R.mp - amt * (D.mpPerDmg ?? 0.5)); R.lastMpSpend = game.time;
          r = { mul: D.mul, reflect: false };
          blockFx(hit, false);
          if (R.mp <= 0.5) breakBlock();
        } else if (t === 'ward') {
          const absorbed = amt * (1 - D.mul);
          wardHp -= absorbed;
          r = { mul: D.mul };
          blockFx(hit, false);
          if (wardHp <= 0) {
            // the dome breaks: the overflow goes through at full damage
            const over = -wardHp; wardHp = 0;
            if (amt > 0) r.mul = clamp(D.mul + over / amt, D.mul, 1);
            wardBreak();
          }
        } else {
          // guard / shield: stamina per hit
          let cost = (D.stamBase ?? 6) + amt * (D.stamPer ?? 0.6);
          if (t === 'shield' && talentOn('paladin.t25a')) cost *= 0.6;
          R.stamina -= cost; R.lastStamUse = game.time;
          if (R.stamina <= 0) { R.stamina = 0; r = { mul: 0.6 }; guardBreak(); }
          else { r = { mul: D.mul }; blockFx(hit, false); }
        }
      }
    }
    hit._pbdRes = r;
    return r;
  }
  function blockFx(hit, perfect) {
    const c = elHex();
    if (!sourcePos(hit, v4)) v4.set(pos.x + Math.sin(facing), pos.y, pos.z + Math.cos(facing));
    v4.sub(pos).setY(0); if (v4.lengthSq() < 1e-4) v4.set(Math.sin(facing), 0, Math.cos(facing)); v4.normalize();
    const t = kit.defend.type;
    if (t === 'barrier' || t === 'ward') {
      barrier.hit(v4, perfect);
      v1.copy(pos).addScaledVector(v4, 1.3).setY(pos.y + 1.0);
      const col = t === 'ward' ? 0x9dffb0 : c;
      vfxCall('burst', v1, { count: perfect ? 30 : 12, color: [col, 0xffffff], speed: perfect ? 6 : 3, spread: 0.6, dir: v4, size: 0.1, sizeEnd: 0, life: 0.35, shape: t === 'ward' ? 'leaf' : 'spark', drag: 3 });
      game.audio?.play?.(perfect ? 'reflect' : 'barrier_hit', { position: v1 });
    } else {
      api.getWeaponTip(t === 'shield' ? 'off' : 'main', v1); v1.lerp(v2.copy(pos).addScaledVector(v4, 0.6).setY(pos.y + 1.2), 0.6);
      const hot = t === 'shield' ? [0xfff6d0, 0xffd36a] : [0xfff3c0, 0xffb040];
      vfxCall('burst', v1, { count: perfect ? 46 : 14, color: hot, speed: perfect ? 11 : 5, speedVar: 3, spread: perfect ? 1 : 0.5, dir: v4, size: perfect ? 0.13 : 0.09, sizeEnd: 0, life: perfect ? 0.5 : 0.3, shape: 'spark', drag: 2.5, velocityStretch: 0.05 });
      vfxCall('flash', v1, { color: 0xfff0c0, intensity: perfect ? 6 : 2, distance: perfect ? 10 : 5, duration: perfect ? 0.3 : 0.12 });
      if (t === 'shield') vfxCall('shockwave', v1, { color: 0xffe9a8, radius: perfect ? 2.2 : 1.1, duration: 0.25, vertical: true, opacity: perfect ? 0.9 : 0.5, thickness: 0.14 });
      if (!perfect) { game.audio?.play?.('block_hit', { position: v1 }); vfxCall('shake', 0.12); velocity.multiplyScalar(0.4); }
    }
  }
  function doParry(hit) {
    blockFx(hit, true);
    perfectFx = 1;
    const t = kit.defend.type;
    if (t === 'guard' || t === 'shield') {
      game.hitstop?.(0.12); slow('parry', 0.4, 0.5);
      api.getWeaponTip(t === 'shield' ? 'off' : 'main', v1);
      vfxCall('shockwave', v1, { color: 0xffe6a0, radius: 2.4, duration: 0.3, vertical: true, opacity: 0.9, thickness: 0.18 });
      vfxCall('screenFlash', 0xfff4d0, 0.28, 0.25);
      vfxCall('fovKick', -4, 0.3); vfxCall('shake', 0.25);
      game.audio?.play?.('parry', { position: v1 });
      counterReady = 1.2; counterTarget = typeof hit.source === 'object' ? hit.source : null;
    } else {
      game.hitstop?.(0.08);
      vfxCall('screenFlash', elHex(), 0.2, 0.25);
      vfxCall('fovKick', -3, 0.25);
    }
    ev('parry', { perfect: true, cls, kit: t, source: hit.source, point: hit.point || pos.clone() });
  }
  /** 반격 자세: negate the hit, teleport behind the attacker, next hit crits. */
  function doCounter(hit) {
    counterT = 0; counterCd = kit.defend.cd ?? 1;
    const s = hit?.source;
    ghosts.spawn(pos, facing, SHADOW_COL, 0.6, 0.9);
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 22, color: [0xb98bff, 0x1a0b2e], speed: 3.5, spread: 1, size: 0.14, sizeEnd: 0, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
    if (s && typeof s === 'object' && s.object) {
      const sp = s.object.position;
      const sf = Number.isFinite(s.facing) ? s.facing : Math.atan2(pos.x - sp.x, pos.z - sp.z);
      v2.set(sp.x - Math.sin(sf) * ((s.radius || 0.6) + 1.1), pos.y, sp.z - Math.cos(sf) * ((s.radius || 0.6) + 1.1));
      if (!outOfBounds(v2.x, v2.z)) {
        api.teleport(v2, true);
        api.setFacing(Math.atan2(sp.x - pos.x, sp.z - pos.z));
      }
    }
    try { game.stats?.set?.('kit:counterCrit', { critChance: 1 }, { duration: kit.defend.critDur ?? 3 }); } catch (_) { /* */ }
    game.hitstop?.(0.1); slow('parry', 0.35, 0.45);
    vfxCall('screenFlash', 0x9a5cff, 0.24, 0.3); vfxCall('fovKick', 4, 0.3);
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 26, color: [0xb98bff, 0xffffff], speed: 4, spread: 1, size: 0.1, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 3 });
    game.audio?.play?.('perfect_dodge', { position: pos });
    counterReady = 1.2; counterTarget = typeof s === 'object' ? s : null;
    perfectFx = 1;
    ev('parry', { perfect: true, cls, kit: 'counter', source: s, point: hit.point || pos.clone() });
    ev('counter', { source: s, position: pos.clone() });
  }
  function perfectDodge(hit) {
    if (counterReady > 0.5) return;
    const type = kit.dodge.type;
    if (type === 'blink' || type === 'spiritswap') { perfectBlink(hit); return; }
    slow('parry', 0.3, 1.2);
    vfxCall('screenFlash', type === 'shadowroll' ? 0x7a3cff : 0x4f9dff, 0.32, 1.1);
    vfxCall('fovKick', 6, 0.5);
    ghosts.spawn(pos, facing, type === 'shadowroll' ? SHADOW_COL : DODGE_COL, 0.8, 1);
    game.audio?.play?.('perfect_dodge', { position: pos });
    counterReady = 1.5; counterTarget = typeof hit?.source === 'object' ? hit.source : null;
    perfectFx = 1; dilateT = 1.3;
    if (type === 'shadowroll' && counterTarget?.object) {
      // 그림자 구르기: a perfect roll ends behind the attacker
      const sp = counterTarget.object.position, sf = Number.isFinite(counterTarget.facing) ? counterTarget.facing : Math.atan2(pos.x - sp.x, pos.z - sp.z);
      v2.set(sp.x - Math.sin(sf) * ((counterTarget.radius || 0.6) + 1.0), pos.y, sp.z - Math.cos(sf) * ((counterTarget.radius || 0.6) + 1.0));
      if (!outOfBounds(v2.x, v2.z)) { api.teleport(v2, true); api.setFacing(Math.atan2(sp.x - pos.x, sp.z - pos.z)); dodgeT = 0; hv.set(0, 0, 0); }
      if (talentOn('shadowblade.t25b')) { try { game.enemies?.setPlayerStealth?.(true, 2); } catch (_) { /* */ } }
    }
    if (type === 'backflip' && talentOn('ranger.t25b')) R.stamina = Math.min(R.maxStamina, R.stamina + 15);
    ev('perfectDodge', { source: hit?.source || null, position: pos.clone(), kit: type });
  }
  let dodgedFxT = -10;
  function dodgedFx() {
    if (game.time - dodgedFxT < 0.3) return;
    dodgedFxT = game.time;
    game.audio?.play?.('dash', { position: pos, volume: 0.5 });
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 8, color: [0xdde8ff, 0xffffff], speed: 3, spread: 1, size: 0.08, sizeEnd: 0, life: 0.25, shape: 'spark', drag: 3 });
  }
  let perfectBlinkT = -10;
  function perfectBlink(hit) {
    if (game.time - perfectBlinkT < 0.8) return;
    perfectBlinkT = game.time;
    slow('parry', 0.5, 0.5);
    vfxCall('screenFlash', elHex(), 0.22, 0.45);
    vfxCall('fovKick', 4, 0.35);
    game.audio?.play?.('perfect_dodge', { position: pos });
    R.mp = Math.min(R.maxMp, R.mp + (kit.dodge.mpRefund || 0));
    perfectFx = 1;
    ev('perfectDodge', { source: hit?.source || null, position: pos.clone(), cls, kit: kit.dodge.type });
  }
  function breakBlock() {
    if (!blocking) return;
    blocking = false; blockT = 0;
    game.audio?.play?.(kit.defend.type === 'barrier' ? 'mana_empty' : 'guard_break', { position: pos });
  }
  function guardBreak() {
    breakBlock();
    guardBreakT = GUARD_BREAK_T; R.exhausted = true; hurt = 1;
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1.2), { count: 20, color: [0xffd28a, 0xffffff], speed: 5, spread: 1, size: 0.1, life: 0.4, shape: 'spark', drag: 3 });
    vfxCall('shake', 0.3);
    ev('guardBreak', { position: pos.clone() });
  }
  function wardBreak() {
    wardBroken = true; wardRechargeT = 0;
    breakBlock();
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 34, color: [0x9dffb0, 0xffffff], speed: 5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.6, shape: 'leaf', drag: 2.5 });
    vfxCall('shockwave', v1, { color: 0x9dffb0, radius: 2.2, duration: 0.35, opacity: 0.7, thickness: 0.15 });
    game.audio?.play?.('guard_break', { position: pos, pitch: 1.3 });
    ev('wardBreak', { position: pos.clone() });
  }
  const wardCap = () => (kit.defend.capacity || 0.35) * entity.maxHp;
  function canStartBlock() {
    const D = kit.defend;
    if (D.type === 'barrier') return R.mp >= (D.minMp ?? 3);
    if (D.type === 'ward') return !wardBroken && wardHp >= wardCap() * (D.minFrac ?? 0.15);
    if (D.type === 'guard' || D.type === 'shield') return R.stamina >= (D.minStam ?? 5);
    return false;
  }
  function startBlock() {
    if (blocking || guardBreakT > 0 || dodgeT > 0) return;
    if (!canStartBlock()) return;
    blocking = true; blockT = 0;
    endGlide();
    const t = kit.defend.type;
    game.audio?.play?.(t === 'barrier' || t === 'ward' ? 'barrier_up' : 'block', { position: pos });
    if (isMelee()) { swordDrawn = true; api.swordIdleT = 0; }
    if (t === 'ward') barrier.setColor(v1.set(0.55, 1, 0.65));
  }
  function startCounter() {
    const D = kit.defend;
    if (counterT > 0 || counterCd > 0 || guardBreakT > 0) return;
    if (!R.spendStamina(D.cost ?? 6)) { game.audio?.play?.('guard_break', { volume: 0.3, pitch: 1.6 }); return; }
    counterT = D.window ?? 0.3; swordDrawn = true; api.swordIdleT = 0;
    ghosts.spawn(pos, facing, SHADOW_COL, 0.3, 0.5);
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1.1), { count: 10, color: [0xb98bff, 0xffffff], speed: 1.5, spread: 1, size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
    game.audio?.play?.('block', { position: pos, pitch: 1.4 });
    ev('counterStance', { position: pos.clone() });
  }

  // ---------- dodge (Q): one entry point, behaviour by kit type ----------
  function dodgeAvailable() {
    const DG = kit.dodge;
    if (DG.charges) return dodgeCharges > 0;
    return dodgeCd <= 0;
  }
  function tryDodge(canAct) {
    const DG = kit.dodge;
    if (DG.type === 'none' || !entity.alive || dying || dodgeT > 0 || !canAct || guardBreakT > 0) return;
    if (!dodgeAvailable()) return;
    if (R.exhausted && R.stamina < DG.cost) { game.audio?.play?.('guard_break', { volume: 0.3, pitch: 1.6 }); return; }
    R.spendStamina(DG.cost, true);
    if (DG.charges) {
      const maxC = DG.charges + (statGet('extraDash', 0) || 0);
      if (dodgeCharges === maxC) dodgeRecharge = DG.recharge;
      dodgeCharges--;
    } else dodgeCd = DG.cd;
    const type = DG.type;
    dodgeType = type;
    // direction: input, else backwards from the camera view (backflip: always away from the facing / aim)
    if (type === 'backflip') {
      if (wish.lengthSq() > 0.01 && wish.dot(v1.set(Math.sin(facing), 0, Math.cos(facing))) < -0.3) dodgeDir.copy(wish).setY(0).normalize();
      else dodgeDir.set(-Math.sin(facing), 0, -Math.cos(facing));
    } else if (wish.lengthSq() > 0.01) dodgeDir.copy(wish).setY(0).normalize();
    else if (type === 'blink' || type === 'spiritswap') dodgeDir.set(Math.sin(facing), 0, Math.cos(facing));
    else dodgeDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    blocking = false; counterT = 0;
    endGlide();
    dodgeStartT = game.time; ghostT2 = 0; ghostTimer = 0;
    dodgeIframeT = DG.iframes || 0;
    superArmorT = DG.superArmor || 0;
    const dist = DG.dist * (statGet('dashDistMul', 1) || 1);
    if (type === 'blink' || type === 'spiritswap') startBlink(dist, type);
    else {
      dodgeT = dodgeDur = DG.time;
      if (type !== 'backflip') facing = Math.atan2(dodgeDir.x, dodgeDir.z);
      if (type === 'backflip') { vy = DG.hop || 5; grounded = false; airTime = 0.05; }
      else if (grounded) vy = 0;
      const c = elHex();
      v1.copy(pos).setY(pos.y + 0.3);
      vfxCall('burst', v1, { count: 10, color: 0xe6dbc0, speed: 2.5, spread: 0.5, dir: v2.copy(dodgeDir).negate().setY(0.3), size: 0.35, sizeEnd: 0.9, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
      if (type === 'shadowroll') vfxCall('burst', v1.setY(pos.y + 0.8), { count: 14, color: [0x5b2a8a, 0x1a0b2e], speed: 2, spread: 0.8, dir: v2.copy(dodgeDir).negate(), size: 0.4, sizeEnd: 0.9, life: 0.5, shape: 'smoke', additive: false, drag: 3 });
      else if (type === 'shieldstep') vfxCall('burst', v1.setY(pos.y + 1), { count: 14, color: [0xffe9a8, 0xffffff], speed: 3, spread: 0.4, dir: dodgeDir, size: 0.09, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
      else vfxCall('burst', v1.setY(pos.y + 1), { count: 12, color: [c, 0xffffff], speed: 3, spread: 0.6, dir: v2.copy(dodgeDir).negate(), size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
      vfxCall('fovKick', type === 'shieldstep' ? 2 : 3, 0.22);
      game.audio?.play?.('dash', { position: pos, pitch: type === 'shieldstep' ? 0.8 : type === 'shadowroll' ? 1.15 : 1 });
      ev('dash', { position: pos.clone(), direction: dodgeDir.clone(), kit: type });
    }
    ev('dodge', { type, position: pos.clone() });
  }
  function startBlink(dist, type) {
    blinkFrom.copy(pos);
    // step along the path; stop at cliffs, deep water, bounds
    const startH = groundAt(pos.x, pos.z, pos.y);
    let d0 = 0;
    for (let d = 0.5; d <= dist + 1e-3; d += 0.5) {
      const x = pos.x + dodgeDir.x * d, z = pos.z + dodgeDir.z * d;
      const h = groundAt(x, z, pos.y + 1);
      if (h - Math.max(startH, pos.y) > 2.6) break;
      if (waterDepth(x, z, h) > DEEP_WATER && grounded) break;
      if (outOfBounds(x, z)) break;
      d0 = d;
    }
    blinkTo.copy(pos).addScaledVector(dodgeDir, d0);
    try { W()?.resolveCollision?.(blinkTo, entity.radius); } catch (e) { /* */ }
    const th = groundAt(blinkTo.x, blinkTo.z, pos.y + 1);
    blinkTo.y = grounded ? th : Math.max(th, pos.y + 0.3);
    const DG = kit.dodge;
    dodgeT = dodgeDur = DG.time; blinking = true;
    gliding && endGlide();
    vy = 0;
    const spirit = type === 'spiritswap';
    const c = spirit ? 0x9dffb0 : elHex();
    v1.copy(pos).setY(pos.y + 0.9);
    ghosts.spawn(pos, facing, spirit ? SPIRIT_COL : elemColor, spirit ? 0.9 : 0.5, 1);
    vfxCall('burst', v1, { count: 28, color: [c, 0xffffff], speed: 4.5, spread: 1, size: 0.13, sizeEnd: 0, life: 0.45, shape: spirit ? 'leaf' : 'spark', drag: 3 });
    vfxCall('burst', v1, { count: 10, color: c, speed: 1.2, spread: 1, size: 0.5, sizeEnd: 1.1, life: 0.4, shape: 'soft', drag: 2 });
    vfxCall('flash', v1, { color: c, intensity: 3, distance: 7, duration: 0.18 });
    vfxCall('fovKick', 5, 0.25);
    if (spirit) { decoyT = DG.decoyLife || 4; decoyPos.copy(blinkFrom); decoyFxT = 0; try { game.enemies?.setTauntTarget?.({ object: { position: decoyPos }, team: 'player', isDecoy: true, alive: true }, decoyT); } catch (_) { /* */ } }
    if (type === 'blink' && talentOn('mage.t20')) { mageRuneT = 1.5; mageRunePos.copy(blinkFrom); mageRuneEl = element; }
    ev('blink', { position: pos.clone(), kit: type });
  }
  function endBlink() {
    blinking = false;
    const ox = pos.x, oy = pos.y, oz = pos.z;
    pos.copy(blinkTo);
    cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
    root.visible = true; cape.mesh.visible = true;
    const c = kit.dodge.type === 'spiritswap' ? 0x9dffb0 : elHex();
    v1.copy(pos).setY(pos.y + 0.9);
    vfxCall('burst', v1, { count: 26, color: [c, 0xffffff], speed: 3.5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 3 });
    vfxCall('shockwave', v1.set(pos.x, pos.y + 0.9, pos.z), { color: c, radius: 1.6, duration: 0.3, vertical: true, opacity: 0.6, thickness: 0.15 });
    hv.copy(dodgeDir).multiplyScalar(WALK * 0.8);
    squash = Math.max(squash, 0.35);
    dodgeEndT = game.time;
  }
  function popDecoy() {
    vfxCall('burst', v1.copy(decoyPos).setY(decoyPos.y + 1), { count: 30, color: [0x9dffb0, 0xffffff], speed: 4, spread: 1, size: 0.12, sizeEnd: 0, life: 0.55, shape: 'leaf', drag: 2.5 });
    vfxCall('shockwave', v1, { color: 0x9dffb0, radius: 1.8, duration: 0.3, opacity: 0.7, thickness: 0.12 });
    game.audio?.play?.('reflect', { position: decoyPos, pitch: 1.3 });
    try { game.enemies?.clearTauntTarget?.(); } catch (_) { /* */ }
    ev('decoyPop', { position: decoyPos.clone() });
  }
  function onDeath(result, hit) {
    regen.afterHit();
    void result; void hit;
    if (dying) return;
    dying = true; deadTime = 0;
    gliding = false; charging = false; castKind = null; stopFocus();
    ev('playerDeath', {});
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 30, color: [elHex(), 0xffffff], speed: 3, spread: 1, size: 0.12, life: 0.9, shape: 'spark', gravity: -1 });
  }

  function resetKitState() {
    blocking = false; blockT = 0; guardBreakT = 0; dodgeT = 0; dodgeIframeT = 0; blinking = false; superArmorT = 0;
    counterReady = 0; counterT = 0; counterCd = 0; decoyT = 0; dodgeCd = 0;
    dodgeCharges = (kit.dodge.charges || 1) + (kit.dodge.charges ? (statGet('extraDash', 0) || 0) : 0);
    wardHp = wardCap(); wardBroken = false;
    stopFocus();
  }
  function respawn() {
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
    for (const k of Object.keys(entity.statuses || {})) { try { game.combat?.clearStatus?.(entity, k); } catch (e) { /* */ } }
    entity.statuses = entity.statuses || {};
    for (const k of Object.keys(entity.statuses)) delete entity.statuses[k];
    R.refresh(false);
    entity.alive = true; entity.hp = entity.maxHp; R.fill();
    dying = false; deadW = 0; deadTime = 0; hurt = 0; invulT = 1.5; entity.invulnerable = true;
    resetKitState(); regen.reset();
    root.visible = true; cape.mesh.visible = true;
    if (!game.entities.includes(entity)) game.combat?.register?.(entity);
    placeAtSpawn(true);
    if (checkpoint) {
      // face the objective (north) from the checkpoint
      yaw = 0; facing = prevFacing = Math.PI; root.rotation.set(0, facing, 0);
    }
    ev('playerRespawn', {});
    vfxCall('burst', v1.copy(pos).setY(pos.y + 0.9), { count: 40, color: [elHex(), 0xffffff], speed: 3.5, spread: 1, size: 0.12, life: 0.8, shape: 'spark', drag: 2 });
    vfxCall('shockwave', v1.copy(pos).setY(pos.y + 0.05), { color: elHex(), radius: 3, duration: 0.6 });
    if (game.state !== 'playing') { if (game.setState) game.setState('playing'); else game.state = 'playing'; }
  }

  function endGlide() {
    if (gliding) { gliding = false; ev('glideEnd', { position: pos.clone() }); }
    if (inUpdraft) { inUpdraft = false; ev('updraftExit', { position: pos.clone() }); }
  }
  function startFocus() {
    if (focusing) return;
    focusing = true;
    vfxCall('screenFlash', 0xd8f4ff, 0.12, 0.3); vfxCall('fovKick', -3, 0.3);
    game.audio?.play?.('perfect_dodge', { position: pos, volume: 0.45, pitch: 1.4 });
    ev('focusStart', {});
  }
  function stopFocus() {
    if (!focusing) return;
    focusing = false;
    try { ts()?.clear?.('focus'); } catch (_) { /* */ }
    ev('focusEnd', {});
  }

  // ---------- class ----------
  function setClass(c) {
    c = c && CLASS_DEFS[c] ? c : null;
    const prev = cls;
    cls = c;
    kit = kitOf(c);
    setClassOutfit(rig, cg, cape, c);
    entity.name = c ? CLASS_DEFS[c].nameKo : '바람결의 젊은이';
    swordDrawn = false; drawnW = 0;
    weaponVisibility();
    barrier.setColor(kit.defend.type === 'ward' ? v1.set(0.55, 1, 0.65) : elemColor);
    R.refresh(prev !== null || R._init);
    resetKitState();
    fidgetNext = 8 + Math.random() * 6; fidgetKind = null;
    springs.reset();
  }
  /** Melee weapons: in hand while drawn, sheathed otherwise (longsword / hammer / daggers). */
  function weaponVisibility() {
    const st = style(), S = cg.sockets;
    const drawn = swordDrawn && isMelee();
    if (gear.sword) gear.sword.visible = drawn && st === 'longsword';
    if (gear.sheathed) gear.sheathed.visible = !drawn && st === 'longsword';
    if (S.hammerHand) S.hammerHand.visible = drawn && st === 'hammer';
    if (S.hammerBack) S.hammerBack.visible = !drawn && st === 'hammer';
    if (S.daggers) { S.daggers.R.visible = drawn && st === 'daggers'; S.daggers.L.visible = drawn && st === 'daggers'; }
    if (S.daggerSheathed) for (const h of S.daggerSheathed) h.visible = !drawn && st === 'daggers';
  }

  // ---------- api ----------
  const api = {
    entity, object: root, rig,
    get hp() { return entity.hp; }, set hp(v) { entity.hp = v; },
    get maxHp() { return entity.maxHp; }, set maxHp(v) { entity.maxHp = v; },
    get mp() { return R.mp; }, set mp(v) { R.mp = clamp(v, 0, R.maxMp); },
    get maxMp() { return R.maxMp; }, set maxMp(v) { R.setMax('mp', v); },
    get resolve() { return R.resolve; }, set resolve(v) { R.resolve = clamp(v, 0, R.maxResolve); },
    get maxResolve() { return R.maxResolve; }, set maxResolve(v) { R.setMax('resolve', v); },
    get stamina() { return R.stamina; }, set stamina(v) { R.stamina = clamp(v, 0, R.maxStamina); },
    get maxStamina() { return R.maxStamina; }, set maxStamina(v) { R.setMax('stamina', v); },
    /** 'mp' | 'resolve' */
    get resource() { return R.kind; },
    get family() { return familyOf(cls); },
    get style() { return style(); },
    get kit() { return kit; },
    get exhausted() { return R.exhausted; },
    get gliding() { return gliding; }, get sprinting() { return sprinting; },
    get grounded() { return grounded; },
    get blinkCooldown() { return kit.dodge.charges ? 0 : dodgeCd; },
    get blinkCooldownMax() { return kit.dodge.cd || 1; },
    get blinkCost() { return kit.dodge.cost || 0; },
    get element() { return element; },
    get cls() { return cls; },
    get blocking() { return blocking || counterT > 0; },
    get dashing() { return dodgeT > 0; },
    get guardBroken() { return guardBreakT > 0; },
    get counterReady() { return counterReady; },
    get counterTarget() { return counterTarget; },
    consumeCounter() { const t = counterTarget; counterReady = 0; counterTarget = null; return t; },
    get facing() { return facing; },
    get swordDrawn() { return swordDrawn; },
    get focusing() { return focusing; },
    get superArmor() { return superArmorT > 0 || action.superArmor; },
    /** HP regen state (CONTRACT §10.3): {active, delay, delayLeft, inCombat, rate}. Reused object — read only. */
    get regen() { return regen.state; },
    get lastHurtT() { return regen.lastHurtT; },
    inCombat() { return regen.inCombat(); },
    swordIdleT: 0,
    action, mods, gear, classGear: cg,
    get camForward() { return camFwd; },
    setClass,
    /** Draw/sheathe the melee weapon. */
    setSwordDrawn(on) {
      on = !!on && isMelee();
      if (on === swordDrawn) return;
      swordDrawn = on;
      weaponVisibility();
      game.audio?.play?.('sword_draw', { position: pos, pitch: on ? 1 : 0.8, volume: on ? 0.8 : 0.5 });
      if (on) { api.getWeaponTip('main', v1); vfxCall('burst', v1, { count: 10, color: [elHex(), 0xffffff], speed: 2, spread: 1, size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 }); }
    },
    /**
     * Weapon socket in world space (CONTRACT §10.1). which: 'main' | 'off'.
     * staff/totem → gem · bow → arrow nock (off: grip) · longsword → blade tip (off: buckler) · hammer → head (off: shield) · daggers → R tip (off: L tip)
     */
    getWeaponTip(which = 'main', out) {
      if (which && which.isVector3) { out = which; which = 'main'; }
      out = out || new THREE.Vector3();
      const S = cg.sockets, st = style(), off = which === 'off';
      const drawn = swordDrawn;
      if (st === 'bow') return (off ? S.bow.grip : S.bow.nock).getWorldPosition(out);
      if (st === 'longsword') return (off ? (gear.buckler || gear.tip) : drawn ? gear.tip : gear.sheathed).getWorldPosition(out);
      if (st === 'hammer') return (off ? S.shield : drawn ? S.hammer.tip : S.hammerBack).getWorldPosition(out);
      if (st === 'daggers') return (drawn ? (off ? S.daggers.tipL : S.daggers.tipR) : S.daggerSheathed[off ? 1 : 0]).getWorldPosition(out);
      return rig.gemPivot.getWorldPosition(out);
    },
    getSwordTip(out = new THREE.Vector3()) {
      if (isMelee() && style() !== 'longsword') return api.getWeaponTip('main', out);
      return (swordDrawn ? gear.tip : gear.sheathed).getWorldPosition(out);
    },
    getSwordBase(out = new THREE.Vector3()) {
      const S = cg.sockets, st = style();
      if (st === 'hammer' && swordDrawn) return S.hammer.base.getWorldPosition(out);
      if (st === 'daggers' && swordDrawn) return S.daggers.R.getWorldPosition(out);
      return (swordDrawn ? gear.base : gear.sheathed).getWorldPosition(out);
    },
    /** Instantly move the hero (sword skills). */
    teleport(p, snapGround = true) {
      const ox = pos.x, oy = pos.y, oz = pos.z;
      pos.copy(p);
      try { W()?.resolveCollision?.(pos, entity.radius); } catch (e) { /* */ }
      clampBounds(pos);
      const gh = groundAt(pos.x, pos.z, p.y + 0.5);
      if (snapGround || pos.y < gh) { pos.y = gh; vy = 0; grounded = true; }
      cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
      root.updateMatrixWorld(true);
    },
    setFacing(a) { facing = prevFacing = a; root.rotation.y = a; },
    spawnGhost(color, life = 0.35, opacity = 0.8) { ghosts.spawn(pos, facing + action.bodyYaw, color, life, opacity); },
    /** Compensated-time factor (CONTRACT §3.3): 1/timeScale while 'focus' is active (and during the perfect-dodge 반격 window). */
    timeComp() {
      const T = ts();
      if (T?.comp) {
        if (T.has?.('focus')) return T.comp();
        if (dilateT > 0 && T.has?.('parry')) return 1 / Math.max(0.05, T.value());
        return 1;
      }
      return dilateT > 0 && game._slowTime > 0 && game._slowScale > 0 ? 1 / game._slowScale : 1;
    },
    getDefenseHud() {
      const hud = defHud, D = kit.defend, DG = kit.dodge;
      hud.block.active = blocking || counterT > 0;
      hud.block.perfect = blocking && D.perfect > 0 && blockT <= D.perfect + (statGet('parryWindowAdd', 0) || 0);
      hud.block.type = legacyBlockType(D.type);
      hud.dodgeType = DG.type; hud.defendType = D.type;
      hud.dodgeName = KIT_NAMES[DG.type] || ''; hud.defendName = KIT_NAMES[D.type] || '';
      if (DG.charges) {
        const maxC = DG.charges + (statGet('extraDash', 0) || 0);
        hud.dash.charges = dodgeCharges; hud.dash.maxCharges = maxC;
        hud.dash.cooldownFrac = dodgeCharges < maxC ? clamp(dodgeRecharge / (DG.recharge || 1), 0, 1) : 0;
      } else {
        hud.dash.charges = dodgeCd <= 0 ? 1 : 0; hud.dash.maxCharges = 1; hud.dash.cooldownFrac = clamp(dodgeCd / (DG.cd || 1), 0, 1);
      }
      hud.ward.frac = D.type === 'ward' ? clamp(wardHp / Math.max(1, wardCap()), 0, 1) : 1;
      hud.ward.broken = wardBroken;
      hud.focus = focusing;
      hud.counter = counterT > 0 ? 1 : clamp(1 - counterCd / (D.cd || 1), 0, 1);
      return hud;
    },
    /** New game: put the hero in their home in the village. */
    placeInVillage() {
      checkpoint = null;
      for (const k of Object.keys(entity.statuses || {})) delete entity.statuses[k];
      R.refresh(false);
      entity.alive = true; entity.hp = entity.maxHp; R.fill();
      dying = false; deadW = 0; hurt = 0;
      resetKitState(); regen.reset();
      root.visible = true; cape.mesh.visible = true;
      const home = W()?.village?.playerHome || W()?.playerSpawn;
      if (home) { pos.set(home.x, 0, home.z); try { W()?.resolveCollision?.(pos, entity.radius + 0.3); } catch (e) { /* */ } }
      else pos.set(0, 0, 120);
      pos.y = groundAt(pos.x, pos.z);
      vy = 0; hv.set(0, 0, 0); velocity.set(0, 0, 0); grounded = wasGrounded = true; peakY = pos.y;
      const yawH = W()?.village?.playerHomeYaw;
      facing = prevFacing = Number.isFinite(yawH) ? yawH : Math.PI;
      yaw = facing - Math.PI; pitch = -0.12;
      root.rotation.set(0, facing, 0); root.updateMatrixWorld(true);
      cape.reset(); springs.reset(); camSnap = true;
    },
    get yaw() { return yaw; }, get pitch() { return pitch; },
    /** Test hook: set camera look angles directly. */
    setLook(y, p = pitch) { yaw = y; pitch = clamp(p, PITCH_MIN, PITCH_MAX); },

    init() {
      placeAtSpawn();
      const el = game.skills?.attuned || game.spells?.element;
      setStaffElement(game.elements?.isElement?.(el) ? el : 'fire');
      events.on('elementChanged', (p) => p?.element && setStaffElement(p.element));
      events.on('attuneChanged', (p) => p?.element && setStaffElement(p.element));
      // checkpoints: respawn near the last cleared camp, or at the foot of the boss ramp once the boss is up
      events.on('campCleared', (p) => {
        const c = (W()?.camps || []).find((k) => k.id === p?.campId) || W()?.camps?.[p?.index];
        if (c?.position && !checkpoint?.boss) checkpoint = { x: c.position.x, z: c.position.z };
      });
      events.on('bossSpawn', () => {
        const r = W()?.bossArena?.rampStart;
        if (r) checkpoint = { x: r.x, z: r.z, boss: true };
      });
      events.on('gateTravel', () => { camSnap = true; springs.reset(); cape.reset(); });
      events.on('stateChange', (p) => { if (p?.state === 'playing' && (p.prev === 'title' || p.prev === 'cutscene')) camSnap = true; });
      events.on('classChosen', (p) => setClass(p?.cls));
      events.on('classChanged', (p) => setClass(p?.to));
      events.on('pathChosen', (p) => { if (p?.cls && p.cls !== cls) setClass(p.cls); });
      // the counter-stance crit is used up by the next landed player hit
      events.on('damage', (p) => {
        if (!p || p.isPlayer || p.dot) return;
        const s = p.source; if (!(s === 'player' || s?.team === 'player')) return;
        if (game.stats?.has?.('kit:counterCrit')) { try { game.stats.clear('kit:counterCrit'); } catch (_) { /* */ } }
      });
      R.bind();
      R.refresh(false); R.fill();
      setClass(game.progression?.cls || null);
      entity.hp = entity.maxHp;
      // frame the hero for the title screen
      updateCamera(0.016);
    },

    spendMp(n) { return R.spendMp(n); },
    /** 투지 (melee skills). Casters fall through to MP. */
    spendResolve(n) { return R.spendResolve(n); },
    /** Stamina (dodge, block, glide, sprint). */
    spendStamina(n) { return R.spendStamina(n); },

    getStaffTip(out = new THREE.Vector3()) {
      if (rig.staff?.visible || !cls) return rig.gemPivot.getWorldPosition(out);
      return api.getWeaponTip('main', out);
    },

    getAim() {
      const origin = api.getWeaponTip('main', new THREE.Vector3());
      const start = v1.copy(camPos).addScaledVector(camFwd, Math.max(0.5, camDist * 0.95));
      let point = null, best = Infinity, target = null;
      try {
        const hit = W()?.raycast?.(start, camFwd, 120);
        const hp = hit && (hit.isVector3 ? hit : hit.point);
        if (hp) { best = start.distanceTo(hp); point = new THREE.Vector3().copy(hp); }
      } catch (e) { /* */ }
      try {
        const er = game.combat?.raycastEntities?.(start, camFwd, 120, 'enemy');
        if (er && er.entity && er.dist < best) { best = er.dist; point = new THREE.Vector3().copy(er.point); target = er.entity; }
      } catch (e) { /* */ }
      if (!target) {
        let bestCos = AIM_CONE;
        for (const e of game.entities) {
          if (!e || e.team !== 'enemy' || !e.alive || !e.object) continue;
          const c = e.getCenter ? e.getCenter(v2) : v2.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5);
          v3.subVectors(c, camPos);
          const d = v3.length();
          if (d < 1 || d > 120) continue;
          const cs = v3.dot(camFwd) / d;
          if (cs <= bestCos) continue;
          if (best < Infinity && d > best + camDist + 3) continue; // occluded by terrain
          bestCos = cs; target = e;
          point = (point || new THREE.Vector3()).copy(c);
        }
        if (target) best = point.distanceTo(start);
      }
      if (!point) point = new THREE.Vector3().copy(camPos).addScaledVector(camFwd, 80);
      const dir = new THREE.Vector3().subVectors(point, origin);
      if (dir.lengthSq() < 1e-4 || dir.dot(camFwd) < 0.1 * dir.length()) dir.copy(camFwd);
      dir.normalize();
      return { origin, dir, point, target };
    },

    /** Cast pose (CONTRACT §10.4): basic, heavy, ultimate, throw, slam, channel, summon, buff, beam, bowDraw, bowRelease, totemRaise. */
    playCast(kind, el) {
      kind = castKindOf(kind, style(), (k) => !!CAST_DUR[k]);
      if (el) setStaffElement(el);
      castKind = kind; castT = 0; castRecent = CAST_DUR[kind] + 0.45;
      gemFlare = 1; fidgetKind = null;
      if (kind === 'bowRelease') { stringVel = -6; }
      api.getWeaponTip('main', v4);
      const c = elHex();
      vfxCall('burst', v4, { count: kind === 'basic' || kind === 'bowRelease' ? 8 : 18, color: [c, 0xffffff], speed: 2.5, spread: 1, size: 0.1, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 3 });
    },

    setCharging(active, el, frac = 0) {
      if (el) setStaffElement(el);
      const was = charging;
      charging = !!active && entity.alive && !dying;
      chargeFrac = clamp(frac || 0, 0, 1);
      chargeEl = el || element;
      if (charging) { castRecent = Math.max(castRecent, 0.5); fidgetKind = null; }
      if (was && !charging) chargeFrac = 0;
    },

    setStaffElement,
    respawn,
    /** Test/debug: per-frame internals (read only). */
    debugState() { return { cls, kit: kit.dodge.type + '/' + kit.defend.type, dodgeT, dodgeIframeT, blocking, counterT, focusing, decoyT, wardHp, superArmorT, platform: !!platformHandle, ikDrop: footIK.drop }; },

    update(dt, realDt) {
      const gameDt = dt;
      dt *= api.timeComp();
      const t = game.time;
      const combat = game.combat;
      let canAct = entity.alive && !dying && guardBreakT <= 0;
      try { if (canAct && combat?.canAct) canAct = combat.canAct(entity) !== false; } catch (e) { /* */ }
      let sm = 1;
      try { sm = combat?.speedMul ? (combat.speedMul(entity) ?? 1) : 1; } catch (e) { /* */ }
      const melee = isMelee();
      const DG = kit.dodge, D = kit.defend;

      // ---------- camera look input ----------
      if (!dying) {
        const sv = game.settings?.values;
        const sens = SENS * (Number.isFinite(sv?.mouseSens) ? sv.mouseSens : 1);
        yaw -= input.mouseDX * sens;
        pitch = clamp(pitch - input.mouseDY * sens * (sv?.invertY ? -1 : 1), PITCH_MIN, PITCH_MAX);
      }
      camFwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));

      // ---------- timers ----------
      if (dodgeCd > 0) dodgeCd = Math.max(0, dodgeCd - dt);
      if (invulT > 0) { invulT -= dt; if (invulT <= 0) entity.invulnerable = false; }
      if (dodgeIframeT > 0) dodgeIframeT -= dt;
      if (superArmorT > 0) superArmorT -= dt;
      castRecent = Math.max(0, castRecent - dt);
      gemFlare = Math.max(0, gemFlare - dt * 2.2);
      hurt = Math.max(0, hurt - dt * 3.2);
      squash = Math.max(0, squash - dt * 4);
      wLand = Math.max(0, wLand - dt * 2.2);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (castKind) { castT += dt; if (castT >= CAST_DUR[castKind]) castKind = null; }
      if (guardBreakT > 0) guardBreakT -= dt;
      if (counterReady > 0) { counterReady -= realDt; if (counterReady <= 0) counterTarget = null; }
      if (counterT > 0) { counterT -= dt; if (counterT <= 0) counterCd = D.cd ?? 1; }
      else if (counterCd > 0) counterCd -= dt;
      perfectFx = Math.max(0, perfectFx - realDt * 2);
      if (dilateT > 0) dilateT -= realDt;
      if (DG.charges) {
        const maxC = DG.charges + (statGet('extraDash', 0) || 0);
        if (dodgeCharges > maxC) dodgeCharges = maxC;
        if (dodgeCharges < maxC) { dodgeRecharge -= dt; if (dodgeRecharge <= 0) { dodgeCharges++; dodgeRecharge = dodgeCharges < maxC ? DG.recharge : 0; } }
      }
      // ward capacity recharges over `recharge` seconds once broken (and slowly tops up while lowered)
      if (D.type === 'ward') {
        const cap = wardCap();
        if (wardBroken) { wardRechargeT += gameDt; wardHp = cap * clamp(wardRechargeT / (D.recharge || 8), 0, 1); if (wardRechargeT >= (D.recharge || 8)) { wardBroken = false; wardHp = cap; } }
        else if (!blocking) wardHp = Math.min(cap, wardHp + cap / (D.recharge || 8) * gameDt);
      }
      if (decoyT > 0) {
        decoyT -= gameDt;
        decoyFxT -= gameDt;
        if (decoyFxT <= 0) {
          decoyFxT = 0.12;
          v1.set(decoyPos.x + rand(-0.25, 0.25), decoyPos.y + 0.8 + Math.sin(t * 3) * 0.15, decoyPos.z + rand(-0.25, 0.25));
          vfxCall('burst', v1, { count: 3, color: [0x9dffb0, 0xe8ffe0], speed: 0.5, spread: 1, size: 0.12, sizeEnd: 0.02, life: 0.6, gravity: -0.8, shape: 'soft', drag: 1 });
        }
        if (decoyT <= 0) { try { game.enemies?.clearTauntTarget?.(); } catch (_) { /* */ } vfxCall('burst', v1.copy(decoyPos).setY(decoyPos.y + 0.9), { count: 12, color: [0x9dffb0, 0xffffff], speed: 1.5, spread: 1, size: 0.08, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 2 }); }
      }
      if (mageRuneT > 0) {
        mageRuneT -= gameDt;
        if (mageRuneT <= 0) mageRuneBurst();
      }
      if (!melee && action.active) action.active = false;

      // ---------- move intent ----------
      const ix = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      const iz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      v1.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      wish.set(0, 0, 0).addScaledVector(camRight, ix).addScaledVector(v1, iz);
      if (wish.lengthSq() > 1) wish.normalize();
      if (!canAct) wish.set(0, 0, 0);
      const actOn = melee && action.active;
      if (actOn) wish.multiplyScalar(action.move);
      const moving = wish.lengthSq() > 0.01;

      // ---------- defend (E) ----------
      const skillsOn = !!cls && game.progression?.chosen !== false;
      // dodge/guard may cancel an attack's recovery once its last hit window is over (sword.js dodgeCancelable)
      const dodgeOk = !actOn || action.cancelable || action.dodgeCancelable;
      blockHeld = input.down('KeyE') && canAct && skillsOn;
      const dt0 = D.type;
      if (dt0 === 'focus') {
        // 집중: hold E while airborne / gliding / just after a dodge → time ×0.35 (refreshed every frame)
        const inWin = !grounded || gliding || t - dodgeEndT <= (D.afterDodge ?? 0.6) || dodgeT > 0;
        const want = blockHeld && R.stamina > (focusing ? 0 : (D.minStam ?? 4)) && !R.exhausted && inWin;
        if (want) {
          if (!focusing) startFocus();
          try { ts()?.set?.('focus', D.scale ?? 0.35, D.refresh ?? 0.2); } catch (_) { /* */ }
          if (!R.drainStamina(D.drain ?? 25, realDt)) stopFocus();
        } else stopFocus();
      } else if (dt0 === 'counter') {
        if (input.pressed('KeyE') && canAct && skillsOn && dodgeOk) startCounter();
      } else if (blocking) {
        blockT += dt;
        if (!blockHeld || !canAct) breakBlock();
        else if (dt0 === 'barrier') {
          R.mp -= (D.drain ?? 6) * dt; R.lastMpSpend = t;
          if (R.mp <= 0) { R.mp = 0; breakBlock(); }
        } else R.lastStamUse = t;
      } else if (blockHeld && dodgeOk && dt0 !== 'none') {
        if (canStartBlock()) startBlock();
        else if (input.pressed('KeyE')) game.audio?.play?.(dt0 === 'barrier' ? 'mana_empty' : 'guard_break', { volume: 0.4 });
      }

      if (input.pressed('Space') && canAct && !(actOn && !action.cancelable)) jumpBuffer = 0.12;
      if (input.pressed('KeyQ') && skillsOn && dodgeOk) tryDodge(canAct);

      // ---------- death ----------
      if (dying) {
        deadTime += dt;
        deadW = Math.min(1, deadW + dt * 2.2);
        if (deadTime > 1.5 && game.state === 'playing') {
          if (game.setState) game.setState('dead'); else game.state = 'dead';
          if (!respawnTimer) respawnTimer = setTimeout(() => { respawnTimer = null; if (!entity.alive || dying) respawn(); }, 2000);
        }
      }

      const wl = waterLevel();
      const prevX = pos.x, prevZ = pos.z;
      let depth = 0;
      let staminaBusy = false;

      if (blinking) {
        // ---------- blink / spirit swap travel ----------
        dodgeT -= dt;
        const k = 1 - Math.max(0, dodgeT) / dodgeDur;
        const e = 1 - (1 - k) * (1 - k);
        const ox = pos.x, oy = pos.y, oz = pos.z;
        pos.lerpVectors(blinkFrom, blinkTo, e);
        cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
        root.visible = false; cape.mesh.visible = false;
        ghostTimer -= dt;
        if (ghostTimer <= 0) { ghostTimer = 0.05; ghosts.spawn(pos, facing, DG.type === 'spiritswap' ? SPIRIT_COL : elemColor, 0.38, 0.75); }
        if (dodgeT <= 0) { dodgeT = 0; endBlink(); }
        vy = 0; grounded = dodgeT > 0 ? grounded : pos.y <= groundAt(pos.x, pos.z, pos.y + 0.3) + 0.01;
      } else {
        // ---------- stamina / sprint ----------
        const wantSprint = input.down('ShiftLeft') && moving && grounded && !R.exhausted && canAct && !charging && !blocking && !actOn && dodgeT <= 0;
        sprinting = wantSprint && R.stamina > 0;
        // ---------- water ----------
        let gh = groundAt(pos.x, pos.z, pos.y);
        depth = waterDepth(pos.x, pos.z, gh);
        const swimming = depth > DEEP_WATER;
        const wade = depth > 0 ? clamp(1 - depth * 0.45, 0.45, 1) : 1;

        let speed = sprinting ? SPRINT : WALK;
        if (charging) speed *= 0.55;
        else if (castKind || castRecent > 0.3) speed *= 0.8;
        if (blocking) speed *= D.moveMul ?? 0.55;
        if (wLand > 0.2) speed *= 1 - wLand * 0.6;
        speed *= sm * wade * (statGet('moveMul', 1) || 1) * (CLASS_DEFS[cls]?.base?.move || 1);
        if (swimming) speed = Math.min(speed, 2.6);

        // ---------- jump ----------
        if (grounded) { coyote = 0.12; airTime = 0; } else { coyote -= dt; airTime += dt; }
        if (grounded) airJumps = 0;
        const extraJumps = statGet('extraJumps', 0) || 0;
        if (jumpBuffer > 0 && coyote <= 0 && !grounded && extraJumps > 0 && airJumps < extraJumps && canAct && !swimming && !gliding && airTime > 0.1) {
          airJumps++; vy = JUMP_VEL * 0.95; jumpBuffer = 0; airTime = 0.05; peakY = pos.y;
          ev('jump', { position: pos.clone(), double: true });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.1), { count: 16, color: [elColor('wind'), 0xffffff], speed: 3, spread: 0.3, dir: v2.set(0, -1, 0), size: 0.1, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 3 });
          vfxCall('shockwave', v1, { color: elColor('wind'), radius: 1.6, duration: 0.3, opacity: 0.7, thickness: 0.12 });
        }
        if (jumpBuffer > 0 && coyote > 0 && canAct && !swimming) {
          vy = JUMP_VEL; grounded = false; coyote = 0; jumpBuffer = 0;
          ev('jump', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.05), { count: 6, color: 0xe9dfc4, speed: 1.4, spread: 0.7, dir: UP, size: 0.3, sizeEnd: 0.7, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
        }

        // ---------- glide ----------
        const heightAbove = pos.y - (depth > 0 ? Math.max(gh, wl) : gh);
        const infGlide = !!statGet('infiniteGlide', false);
        const canGlide = !grounded && input.down('Space') && canAct && (!R.exhausted || infGlide) && (R.stamina > 0 || infGlide) && airTime > 0.22 && (gliding || vy < 0.5) && heightAbove > 0.9
          && !(actOn && action.noGlide) && !statGet('noGlide', false) && dodgeT <= 0 && !blocking;
        if (canGlide && !gliding) {
          gliding = true; ev('glideStart', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y - 0.1), { count: 22, color: [elHex(), 0xffffff], speed: 3, spread: 0.25, dir: v2.set(0, -0.2, 0), size: 0.1, life: 0.6, shape: 'spark', drag: 2 });
        } else if (!canGlide && gliding) endGlide();

        // ---------- horizontal ----------
        if (dodgeT > 0) {
          const k = 1 - dodgeT / dodgeDur;
          const dist = DG.dist * (statGet('dashDistMul', 1) || 1);
          const v = (dist / (dodgeDur * 0.7)) * (1 - 0.6 * k);
          hv.copy(dodgeDir).multiplyScalar(v);
          dodgeT -= dt;
          ghostT2 -= dt;
          const gcol = DG.type === 'shadowroll' ? SHADOW_COL : DG.type === 'shieldstep' ? HOLY_COL : perfectFx > 0 ? DODGE_COL : DASH_COL;
          if (ghostT2 <= 0) { ghostT2 = DG.type === 'shieldstep' ? 0.07 : 0.045; ghosts.spawn(pos, facing, gcol, 0.3, DG.type === 'shadowroll' ? 0.75 : 0.55); }
          if (dodgeT <= 0) { dodgeT = 0; hv.copy(dodgeDir).multiplyScalar(WALK * 0.7); squash = Math.max(squash, 0.25); dodgeEndT = t; if (DG.type === 'backflip' && talentOn('ranger.t25b')) R.stamina = Math.min(R.maxStamina, R.stamina + 15); }
        } else if (gliding) {
          if (moving) v2.copy(wish).multiplyScalar(GLIDE_SPEED * sm);
          else v2.set(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(GLIDE_SPEED * 0.55 * sm);
          hv.x = damp(hv.x, v2.x, 2.2, dt); hv.z = damp(hv.z, v2.z, 2.2, dt);
        } else {
          const lam = grounded ? (moving ? 12 : 16) : 3.5;
          const tx = wish.x * speed, tz = wish.z * speed;
          if (grounded || moving) { hv.x = damp(hv.x, tx, lam, dt); hv.z = damp(hv.z, tz, lam, dt); }
        }

        // ---------- vertical ----------
        // fold external vertical velocity (launch) into own vy
        if (Math.abs(velocity.y) > 1e-4) { vy += velocity.y; velocity.y = 0; if (vy > 0) grounded = false; }
        if (actOn && Number.isFinite(action.setVy)) { vy = action.setVy; if (vy > 0) grounded = false; }
        const vyBefore = vy;
        if (!grounded) {
          if (gliding) {
            if (vy < -GLIDE_FALL) vy = damp(vy, -GLIDE_FALL, 6, dt);
            else vy = Math.max(vy - GRAVITY * 0.25 * dt, -GLIDE_FALL);
            // rising heat from burning grass / spirit updrafts lift the glider (BotW updraft)
            let up = 0;
            try { up = W()?.surface?.getUpdraft?.(pos) || 0; } catch (e) { up = 0; }
            if (up > 0) {
              vy = Math.min(vy + up * dt, UPDRAFT_VY_CAP);
              updraftT = 0.25;
              if (!inUpdraft) { inUpdraft = true; ev('updraftEnter', { position: pos.clone() }); }
              if (Math.random() < 0.3) vfxCall('burst', v1.set(pos.x + rand(-0.8, 0.8), pos.y - 0.6, pos.z + rand(-0.8, 0.8)), { count: 1, color: [0xffd090, 0xff8040], speed: 4, spread: 0.1, dir: UP, size: 0.06, sizeEnd: 0, life: 0.5, shape: 'spark' });
            } else if (inUpdraft) { updraftT -= dt; if (updraftT <= 0) { inUpdraft = false; ev('updraftExit', { position: pos.clone() }); } }
          } else vy -= GRAVITY * dt * (actOn ? action.gravityMul : 1);
          peakY = Math.max(peakY, pos.y);
        }

        // ---------- integrate ----------
        pos.x += (hv.x + velocity.x + (actOn ? action.vel.x : 0)) * dt;
        pos.z += (hv.z + velocity.z + (actOn ? action.vel.z : 0)) * dt;
        pos.y += vy * dt;
        const fr = grounded ? 9 : 0.8;
        velocity.x *= Math.exp(-fr * dt); velocity.z *= Math.exp(-fr * dt);

        try { W()?.resolveCollision?.(pos, entity.radius); } catch (e) { /* */ }
        clampBounds(pos);
        // slope limit: can't walk / jump-climb faces steeper than ~53 degrees
        {
          const mx = pos.x - prevX, mz = pos.z - prevZ, step = Math.hypot(mx, mz);
          const yh = pos.y + 0.6;
          if (step > 1e-4) {
            const g0 = groundAt(prevX, prevZ, yh), g1 = groundAt(pos.x, pos.z, yh);
            const tooSteep = (gx, gz) => {
              const st = Math.hypot(gx - prevX, gz - prevZ); if (st < 1e-5) return false;
              const gg = groundAt(gx, gz, yh);
              if (wasGrounded) return (gg - g0) / st > 1.33 && gg > g0 + 0.05;
              return gg > pos.y + 0.6; // airborne: walls block rather than teleport us up
            };
            if (tooSteep(pos.x, pos.z) && g1 > g0) {
              // slide along the contour: try each axis separately
              if (!tooSteep(pos.x, prevZ)) pos.z = prevZ;
              else if (!tooSteep(prevX, pos.z)) pos.x = prevX;
              else { pos.x = prevX; pos.z = prevZ; }
              if (wasGrounded) { hv.multiplyScalar(0.6); }
            }
          }
          // very steep ground under us (e.g. pushed onto a cliff): slide down (terrain only, platforms are flat)
          if (wasGrounded && !platformHandle) {
            const e = 0.6, gx0 = groundAt(pos.x - e, pos.z, yh), gx1 = groundAt(pos.x + e, pos.z, yh), gz0 = groundAt(pos.x, pos.z - e, yh), gz1 = groundAt(pos.x, pos.z + e, yh);
            const sx = (gx1 - gx0) / (2 * e), sz = (gz1 - gz0) / (2 * e);
            if (sx * sx + sz * sz > 1.33 * 1.33 * 1.3) { pos.x -= sx * 6 * dt; pos.z -= sz * 6 * dt; }
          }
        }
        // deep water: don't walk in from the shore
        gh = groundAt(pos.x, pos.z, pos.y);
        depth = waterDepth(pos.x, pos.z, gh);
        if (depth > DEEP_WATER && !swimming && (grounded || pos.y < wl)) {
          pos.x = prevX; pos.z = prevZ; hv.multiplyScalar(-0.2);
          gh = groundAt(pos.x, pos.z, pos.y); depth = waterDepth(pos.x, pos.z, gh);
        }
        const floor = depth > DEEP_WATER ? wl - DEEP_WATER : gh;

        // ---------- ground ----------
        const snap = wasGrounded && vy <= 0 ? 0.45 : 0;
        if (pos.y <= floor + snap && vy <= 0) {
          pos.y = floor;
          if (!wasGrounded && airTime > 0.12) {
            const impact = Math.min(vyBefore, vy);
            squash = clamp(-impact / 16, 0.2, 1);
            const fell = peakY - pos.y;
            ev('land', { position: pos.clone(), height: fell });
            if (fell > HARD_LAND_H && !gliding && dodgeT <= 0) {
              // hard landing: recovery crouch (DESIGN §9 A9)
              wLand = 1; squash = 1;
              vfxCall('shake', 0.22);
              ev('hardLanding', { position: pos.clone(), height: fell });
            }
            if (impact < -6) {
              const c = 0xeadfc6;
              v1.copy(pos).setY(pos.y + 0.08);
              vfxCall('burst', v1, { count: impact < -12 ? 18 : 10, color: c, speed: 2.8, spread: 0.35, dir: v2.set(0, 0.15, 0), size: 0.35, sizeEnd: 0.9, life: 0.6, shape: 'smoke', additive: false, drag: 3.5 });
              if (impact < -10) vfxCall('shockwave', v1, { color: 0xfff6dc, radius: 2.2, duration: 0.35, opacity: 0.45, thickness: 0.2 });
            }
            endGlide();
          }
          vy = 0; grounded = true; peakY = pos.y;
        } else grounded = false;
        // stand-on platforms (CONTRACT §10.5): carry handle.delta when the platform under us moved
        platformHandle = null;
        if (grounded) {
          try { platformHandle = W()?.platformAt?.(pos.x, pos.z, pos.y) || null; } catch (_) { platformHandle = null; }
          const d = platformHandle?.delta;
          if (d && (d.x || d.y || d.z)) { pos.add(d); cape.shift(d.x, d.y, d.z); }
        }

        // ---------- stamina ----------
        if (sprinting) { R.drainStamina(SPRINT_STAM, dt); staminaBusy = true; }
        else if (gliding) { if (!infGlide) R.drainStamina((inUpdraft ? GLIDE_STAM_UPDRAFT : GLIDE_STAM) * (statGet('glideStamMul', 1) || 1), dt); staminaBusy = true; }
        else if (blocking && (D.type === 'guard' || D.type === 'shield')) { R.lastStamUse = t; staminaBusy = true; }
        else if (focusing) staminaBusy = true;
        if (R.exhausted) { sprinting = false; if (!infGlide) endGlide(); }

        // ---------- water fx ----------
        if (depth > 0.05 && grounded || depth > DEEP_WATER) {
          wadeT -= dt;
          if (wadeT <= 0 && hv.lengthSq() > 2) {
            wadeT = 0.12;
            vfxCall('burst', v1.set(pos.x, wl + 0.02, pos.z), { count: 4, color: 0xe8fbff, speed: 1.8, spread: 0.6, dir: UP, size: 0.12, life: 0.4, gravity: 9, shape: 'soft', additive: false });
          }
        }
      }
      entity.grounded = grounded;
      wasGrounded = grounded;

      // ---------- resources (MP / 투지 / stamina), then HP regen (game time) ----------
      R.update(gameDt, grounded, staminaBusy);
      regen.update(gameDt);

      // ---------- facing ----------
      const aimStance = kit.aim && (charging || castRecent > 0 || (blocking && (D.type === 'barrier' || D.type === 'ward')) || (D.type === 'focus' && blockHeld)) && !dying;
      const hspeed = Math.hypot(hv.x, hv.z);
      let target = facing, turnL = aimStance ? 22 : (gliding ? 5 : 12);
      if (aimStance) target = yaw + Math.PI;
      else if (actOn && action.facing != null) { target = action.facing; turnL = action.turn; }
      else if (melee && (blocking || counterT > 0)) { target = yaw + Math.PI; turnL = 16; }
      else if (actOn) target = facing;
      else if (dodgeT > 0) target = facing;
      else if (hspeed > 0.6 && !blinking) target = Math.atan2(hv.x, hv.z);
      prevFacing = facing;
      if (!dying && canAct) facing = dampAngle(facing, target, turnL, dt);
      root.rotation.set(0, facing + (actOn ? action.bodyYaw : 0), 0);
      turnRate = dt > 0 ? damp(turnRate, angleDiff(prevFacing, facing) / dt, 10, dt) : turnRate;
      // turn lean (≤ 12°) + glide bank
      bank = damp(bank, clamp(-turnRate * 0.045 * clamp(hspeed / 6, 0, 1.4), -0.21, 0.21) + (gliding ? clamp(-turnRate * 0.12, -0.45, 0.45) : 0), 8, dt);

      // ---------- footsteps ----------
      const gSpeed = grounded && !blinking && dodgeT <= 0 ? hspeed : 0;
      const stride = 2.0 + gSpeed * 0.09;
      phase += (gSpeed / stride) * Math.PI * 2 * dt;
      if (gSpeed < 0.3) phase = damp(phase, Math.round(phase / Math.PI) * Math.PI, 6, dt);
      const s = Math.sin(phase);
      if (gSpeed > 1 && Math.sign(s) !== Math.sign(lastSin) && lastSin !== 0) {
        stepSide = -stepSide;
        v1.set(Math.cos(facing), 0, -Math.sin(facing)).multiplyScalar(0.1 * stepSide).add(pos);
        ev('footstep', { position: v1.clone() });
        if (gSpeed > 6.5 && depth <= 0.05) {
          v1.y += 0.04;
          vfxCall('burst', v1, { count: 3, color: 0xe6dbc0, speed: 0.9, spread: 0.6, dir: v2.set(-hv.x, 2, -hv.z).normalize(), size: 0.22, sizeEnd: 0.55, life: 0.5, shape: 'smoke', additive: false, drag: 3 });
        }
      }
      lastSin = s;

      // ---------- idle fidgets (8–14 s of standing still) ----------
      const idle = grounded && gSpeed < 0.3 && !castKind && !charging && !blocking && !actOn && dodgeT <= 0 && !dying && castRecent <= 0 && !!cls;
      if (idle) {
        idleT += dt;
        if (!fidgetKind && idleT > fidgetNext && kit.idleFidget && FIDGETS[kit.idleFidget]) { fidgetKind = kit.idleFidget; fidgetT = 0; }
      } else { idleT = 0; if (fidgetKind && fidgetT < 0.85 * FIDGETS[fidgetKind].dur) fidgetKind = null; }
      if (fidgetKind) {
        fidgetT += dt;
        if (fidgetT >= FIDGETS[fidgetKind].dur) { fidgetKind = null; idleT = 0; fidgetNext = 8 + Math.random() * 6; }
      }

      // ---------- animation weights ----------
      speedFrac = damp(speedFrac, clamp(gSpeed / WALK, 0, 1.7), 10, dt);
      wSprint = damp(wSprint, sprinting ? 1 : 0, 6, dt);
      wAir = damp(wAir, !grounded && !gliding && !blinking ? 1 : 0, grounded ? 14 : 7, dt);
      wGlide = damp(wGlide, gliding ? 1 : 0, 6, dt);
      const casterBlockPose = blocking && (D.type === 'barrier' || D.type === 'ward');
      const actionTarget = (castKind || charging || casterBlockPose) && !dying ? 1 : 0;
      wAction = damp(wAction, actionTarget, actionTarget ? 22 : 7, dt);
      const aimingCam = aimStance || (D.type === 'focus' && blockHeld && grounded);
      wAim = damp(wAim, aimingCam ? 1 : 0, 7, realDt);
      wBowAim = damp(wBowAim, style() === 'bow' && (aimingCam || charging) ? 1 : 0, 9, dt);
      wFocus = damp(wFocus, focusing ? 1 : 0, 10, realDt);
      wFov = damp(wFov, sprinting ? 1 : gliding ? 0.6 : 0, 4, realDt);
      const accel = dt > 0 ? (hspeed - lastSpeed) / dt : 0; lastSpeed = hspeed;
      accelF = damp(accelF, clamp(accel, -20, 20), 8, dt);
      aimPitch = damp(aimPitch, -pitch, 8, dt);

      // local velocity for robe billow
      const cf = Math.cos(facing), sf = Math.sin(facing);
      const lvx = hv.x * cf - hv.z * sf, lvz = hv.x * sf + hv.z * cf;

      const A = animState;
      A.t = t; A.dt = Math.min(dt, 1 / 30); A.phase = phase;
      A.amp = clamp(gSpeed / WALK, 0, 1) * 0.55 + wSprint * 0.22;
      A.speedFrac = speedFrac; A.wSprint = wSprint; A.wAir = wAir; A.wGlide = wGlide; A.wAction = wAction;
      A.castKind = castKind; A.castT01 = castKind ? castT / CAST_DUR[castKind] : 0;
      if (!castKind && wAction > 0.01 && !charging) A.castKind = A._lastKind || null, A.castT01 = 1;
      if (castKind) A._lastKind = castKind;
      if (charging || casterBlockPose) A.castKind = null;
      A.chargeFrac = chargeFrac; A.hurt = hurt; A.squash = squash;
      A.dead = deadW < 1 ? deadW * deadW * (3 - 2 * deadW) : 1;
      A.bank = bank; A.vy = grounded ? 0 : vy; A.localVx = lvx; A.localVz = lvz;
      A.aimPitch = aimPitch;
      A.flare = clamp(wGlide * 0.9 + (grounded ? 0 : clamp(-vy / 14, 0, 0.7)), 0, 1);
      A.flutter = clamp(wGlide + wSprint * 0.4 + clamp(-vy / 20, 0, 0.5), 0, 1.5);
      A.accel = accelF * 0.05;
      A.stance = kit.stance;
      A.dodgePose = dodgeT > 0 && !blinking ? (DODGE_POSES[DG.type] || 'none') : 'none';
      A.dodgeT01 = dodgeT > 0 && dodgeDur > 0 ? 1 - dodgeT / dodgeDur : 0;
      A.landW = wLand > 0 ? Math.min(1, wLand * 1.6) : 0;
      A.fidget = fidgetKind; A.fidgetT01 = fidgetKind ? fidgetT / FIDGETS[fidgetKind].dur : 0;
      // head look-at toward the camera aim (only when the aim is in front; fades while acting)
      const la = angleDiff(facing, yaw + Math.PI);
      A.lookYaw = Math.abs(la) < 1.9 ? la : 0; A.lookPitch = -pitch * 0.8; A.lookW = (1 - wSprint * 0.6) * (dying ? 0 : 1) * (actOn ? 0.3 : 1);
      A.bowAim = wBowAim; A.focusW = style() === 'bow' ? wFocus : 0;
      // ---------- melee stance / action pose ----------
      if (melee && (actOn || blocking || counterT > 0)) { if (!swordDrawn) { swordDrawn = true; } }
      drawnW = damp(drawnW, melee && swordDrawn && !dying ? 1 : 0, 18, dt || realDt);
      weaponVisibility();
      if (melee) {
        const ST = meleeStance(kit.stance);
        if (blocking || counterT > 0) lerpPose(stancePose, ST.idle, ST.guard, 1);
        else {
          lerpPose(stancePose, ST.idle, ST.run, clamp(speedFrac / 1.4, 0, 1) * (1 - wAir) * (1 - wGlide));
          if (wAir > 0.01) lerpPose(stancePose, stancePose, ST.air, wAir);
          if (wGlide > 0.01) lerpPose(stancePose, stancePose, ST.glide, wGlide);
        }
        lerpPose(finalPose, stancePose, action.pose, actOn ? action.poseW : 0);
        const w = drawnW;
        A.swTw = finalPose[6] * w; A.swTl = finalPose[7] * w; A.swCr = finalPose[8] * w; A.swHy = finalPose[9] * w;
        A.swHd = finalPose[14] * w; A.swBk = finalPose[15] * w;
        if (actOn || blocking || counterT > 0) { A.wAction = 0; A.castKind = null; }
      } else { A.swTw = A.swTl = A.swCr = A.swHy = A.swHd = A.swBk = 0; }
      anim.update(A);
      if (melee && drawnW > 0.001) {
        applySwordArms(rig, gear, finalPose, drawnW);
        // hammer / right dagger follow the pose's blade orientation (the sword group carries it)
        const S = cg.sockets;
        if (S.hammerHand?.visible) S.hammerHand.quaternion.copy(gear.sword.quaternion);
        if (S.daggers?.R.visible) S.daggers.R.quaternion.copy(gear.sword.quaternion);
      }
      root.updateMatrixWorld(true);
      // ---------- foot IK (stance-weighted, grounded only) ----------
      const ikW = grounded && !blinking && !dying && dodgeT <= 0 && !gliding ? clamp(1 - speedFrac * 0.35, 0.3, 1) : 0;
      if (ikW > 0 || footIK.weight > 0.01) { footIK.update(groundAt, ikW, dt); root.updateMatrixWorld(true); }
      // ---------- bow string (follows the draw hand) + arrow ----------
      if (cg.sockets.bow && rig.bow?.visible) updateBowString(dt);
      // ---------- spring chains ----------
      springCtx.legF = Math.max(0, -anim.legL, -anim.legR); springCtx.legB = Math.max(0, anim.legL, anim.legR);
      springCtx.wind = clamp(wGlide + wSprint * 0.6 + speedFrac * 0.3, 0, 1.5);
      gust.set(Math.sin(t * 0.7) * 1.2, 0, Math.cos(t * 0.53) * 1.2);
      springs.update(dt, springCtx);
      if (melee) {
        gear.edgeMat.uniforms.uTime.value = t;
        const ei = 0.55 + (actOn ? 0.45 : 0) + perfectFx * 0.8 + (counterReady > 0 ? 0.6 : 0);
        gear.edgeMat.uniforms.uIntensity.value = damp(gear.edgeMat.uniforms.uIntensity.value, ei, 10, realDt);
      }
      barrier.update(realDt, blocking && (D.type === 'barrier' || D.type === 'ward'), pos, t);

      // ---------- staff gem ----------
      const glow = 1 + chargeFrac * 1.6 + gemFlare * 1.5;
      gemColor.copy(elemColor).multiplyScalar(1.25 + chargeFrac * 1.2 + gemFlare);
      rig.gemMat.color.copy(gemColor);
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      rig.gem.scale.set(pulse * (1 + chargeFrac * 0.6 + gemFlare * 0.2), 1.55 * pulse * (1 + chargeFrac * 0.6 + gemFlare * 0.2), pulse * (1 + chargeFrac * 0.6));
      rig.gem.rotation.y += dt * (1.2 + chargeFrac * 8);
      rig.gemCore.scale.setScalar(1 + chargeFrac * 1.2 + gemFlare * 0.6);
      rig.halo.scale.setScalar((0.5 + chargeFrac * 0.9 + gemFlare * 0.6) * pulse);
      rig.haloMat.opacity = 0.7 + chargeFrac * 0.3;
      rig.light.intensity = melee ? 0 : (0.18 + Math.sin(t * 6.3) * 0.03) * glow * glow;
      rig.light.distance = 5 + chargeFrac * 4;
      for (let i = 0; i < rig.motes.length; i++) {
        const a = t * (2.2 + i * 0.37) + i * 1.9;
        const rr = (0.15 + 0.03 * Math.sin(t * 3 + i)) * (1 - chargeFrac * 0.45);
        rig.motes[i].position.set(Math.cos(a) * rr, Math.sin(a * 1.3 + i) * 0.1, Math.sin(a) * rr);
        rig.motes[i].rotation.y = a * 2;
      }

      // ---------- charge circle + converging particles ----------
      api.getWeaponTip('main', tipV);
      if (charging) {
        v3.copy(camFwd);
        v1.copy(tipV).addScaledVector(v3, 0.22);
        chargeCircle.group.position.copy(v1);
        chargeCircle.group.lookAt(v4.copy(v1).add(v3));
        convergeT -= dt;
        if (convergeT <= 0) {
          convergeT = 0.035 - chargeFrac * 0.015;
          const c = elColor(chargeEl || element);
          const n = 1 + Math.round(chargeFrac * 2);
          for (let i = 0; i < n; i++) {
            v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(0.8 + Math.random() * 0.4);
            v1.copy(tipV).add(v2);
            v2.negate().normalize();
            vfxCall('burst', v1, { count: 1, color: [c, 0xffffff], speed: 2.6, speedVar: 0.3, spread: 0, dir: v2, size: 0.07, sizeEnd: 0.02, life: 0.32, lifeVar: 0.03, drag: 0, gravity: 0, shape: 'spark', velocityStretch: 1.5 });
          }
        }
      }
      chargeCircle.update(dt, charging, 0.75 + chargeFrac * 0.6, 1.2 + chargeFrac * 4, 0.6 + chargeFrac * 0.4);

      // ---------- glide sigil ----------
      if (wGlide > 0.02 || gliding) {
        sigil.group.position.set(pos.x, pos.y - 0.12, pos.z);
        sigil.group.rotation.set(-Math.PI / 2, 0, 0);
        sparkleT -= dt;
        if (gliding && sparkleT <= 0) {
          sparkleT = 0.07;
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.85;
          v1.set(pos.x + Math.cos(a) * rr, pos.y - 0.12, pos.z + Math.sin(a) * rr);
          vfxCall('burst', v1, { count: 2, color: [elHex(), 0xffffff], speed: 0.6, spread: 1, size: 0.07, sizeEnd: 0, life: 0.8, gravity: 2.5, shape: 'spark' });
        }
      }
      sigil.update(dt, gliding, 1, 2.2, 0.85);

      ghosts.update(dt);

      // ---------- cape ----------
      wind.set(0.7 - hv.x * 0.05, 0, 0.35 - hv.z * 0.05);
      if (gliding) wind.y = 3;
      cape.update(dt, groundAtFeet, wind, clamp(wGlide + wSprint * 0.5 + (grounded ? 0 : 0.3), 0, 1.5));

      // ---------- camera ----------
      updateCamera(realDt);
    },
  };

  /** 잔상의 룬 (mage Lv20): the blink origin explodes 1.5 s later for 30 damage of the attuned element. */
  function mageRuneBurst() {
    const c = elColor(mageRuneEl);
    vfxCall('explosion', mageRunePos, { element: mageRuneEl, scale: 0.8 });
    vfxCall('shockwave', v1.copy(mageRunePos).setY(mageRunePos.y + 0.1), { color: c, radius: 3, duration: 0.35, opacity: 0.8, thickness: 0.2 });
    const list = game.entities || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e?.alive || e.team === 'player' || !e.object) continue;
      if (e.object.position.distanceToSquared(mageRunePos) > 9) continue;
      try { game.combat?.dealDamage?.(e, { amount: 30, element: mageRuneEl, source: 'player', point: e.object.position, tags: ['talent'], tier: 'heavy' }); } catch (_) { /* */ }
    }
  }

  /** Bow string: the nock follows the right hand while drawing and snaps back with a damped vibration after release. */
  function updateBowString(dt) {
    const B = cg.sockets.bow;
    let target = 0;
    if (charging) target = 0.35 + 0.65 * chargeFrac;
    else if (castKind === 'bowDraw') target = clamp(castT / Math.max(0.05, CAST_DUR.bowDraw * 0.4), 0, 1);
    else if (castKind === 'bowRelease') target = castT < CAST_DUR.bowRelease * 0.4 ? clamp(castT / (CAST_DUR.bowRelease * 0.3), 0, 1) : 0;
    else if (focusing || wBowAim > 0.6) target = 0.25;
    const prev = bowDraw;
    bowDraw = target > bowDraw ? damp(bowDraw, target, 14, dt) : 0;
    if (prev > 0.3 && bowDraw === 0) stringVel = -prev * 9;
    // string vibration after the release (damped spring on the rest offset)
    stringVel += (-stringOff * 900 - stringVel * 22) * Math.min(dt, 1 / 30);
    stringOff += stringVel * Math.min(dt, 1 / 30);
    // nock in bow space: rest → toward the draw hand
    B.nock.position.copy(B.rest);
    if (bowDraw > 0.001) {
      rig.handR.getWorldPosition(v1);
      rig.bow.worldToLocal(v1);
      B.nock.position.lerp(v1, bowDraw * 0.92);
    } else B.nock.position.z += stringOff * 0.04;
    B.arrow.visible = bowDraw > 0.15;
    // the two string halves span tip → nock
    for (const [seg, tip] of [[B.strTop, B.tipTop], [B.strBot, B.tipBot]]) {
      _sv.subVectors(B.nock.position, tip);
      const len = Math.max(0.01, _sv.length());
      _sq.setFromUnitVectors(UP, _sv.multiplyScalar(1 / len));
      seg.quaternion.copy(_sq); seg.scale.set(1, len, 1);
    }
    // the nocked arrow points from the nock through the grip
    if (B.arrow.visible) { _sv.set(0, 0, 0).sub(B.nock.position).normalize(); B.arrow.quaternion.setFromUnitVectors(v2.set(0, 0, 1), _sv); }
    rig.bow.updateMatrixWorld(true);
  }

  // Approximate heights of solid colliders the camera should not pass through (trees/stakes skipped: jitter).
  // camera-blocking prop heights (trees: see-through dither instead, world/prefab.js occludable)
  const CAM_SOLID = {
    pillar: 9, arch: 8, hut: 5, tent: 3.5, tower: 9, rubble: 1.4, rack: 2, crate: 1.2, stake: 2.8, totem: 3.2,
    house: 7.5, windmill: 12, well: 2.4, stall: 3.2, cart: 1.6, gate: 5,
  };
  const CAM_PAD = { tree: 0.05, stake: 0.15, totem: 0.2 };
  const camH = (c) => {
    if (c._camH === undefined) {
      c._camH = c.kind === 'rock' ? c.r * 1.3
        : CAM_SOLID[c.kind] ?? (c.top != null && c.kind !== 'tree' ? Math.max(0, c.top - groundAt(c.x, c.z)) : 0);
      c._camPad = CAM_PAD[c.kind] ?? 0.35;
    }
    return c._camH;
  };
  const boomCols = [];
  let camHoldT = 0;
  function propBoomLimit(dist, shoulder) {
    const w = W();
    const all = w?.colliders;
    if (!all || !all.length) return dist;
    // boom end (horizontal) relative to pivot at f=1
    const dx = camRight.x * shoulder - camFwd.x * dist, dz = camRight.z * shoulder - camFwd.z * dist;
    const dy = -camFwd.y * dist;
    const a = dx * dx + dz * dz; if (a < 1e-6) return dist;
    const reach = Math.sqrt(a) + 4;
    // only colliders in the grid cells around the boom (was: all ~1000 colliders every frame)
    const cols = w.queryColliders ? w.queryColliders(pivot.x - reach - 3, pivot.z - reach - 3, pivot.x + reach + 3, pivot.z + reach + 3, boomCols) : all;
    let best = 1;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const hgt = camH(c);
      if (!hgt) continue;
      const ox = pivot.x - c.x, oz = pivot.z - c.z;
      const rr = c.r + c._camPad;
      if (Math.abs(ox) > reach + rr || Math.abs(oz) > reach + rr) continue;
      const cc = ox * ox + oz * oz - rr * rr;
      if (cc < 0) continue; // pivot inside (player hugging it) — ignore
      const b = ox * dx + oz * dz;
      const disc = b * b - a * cc;
      if (disc < 0) continue;
      const f = (-b - Math.sqrt(disc)) / a;
      if (f <= 0 || f >= best) continue;
      // skip if the boom passes above the prop there
      const y = pivot.y + dy * f;
      if (y > groundAt(c.x, c.z) + hgt) continue;
      best = f;
    }
    return best >= 1 ? dist : Math.max(0.9, dist * best - 0.2);
  }

  function updateCamera(rdt) {
    const dist = lerp(CAM_DIST, CAM_DIST_AIM, wAim) + wSprint * 0.3 - wFocus * 0.4;
    const shoulder = lerp(SHOULDER, SHOULDER_AIM, wAim);
    v1.set(pos.x, pos.y + PIVOT_H - squash * 0.12 - (deadW * 0.8), pos.z);
    if (camSnap) { pivot.copy(v1); camDist = dist; }
    else {
      const lamXZ = blinking ? 14 : 22;
      pivot.x = damp(pivot.x, v1.x, lamXZ, rdt); pivot.z = damp(pivot.z, v1.z, lamXZ, rdt);
      pivot.y = damp(pivot.y, v1.y, grounded ? 12 : 8, rdt);
    }
    camFwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    // terrain collision along the boom
    let allowed = dist;
    const N = 8;
    for (let k = 1; k <= N; k++) {
      const f = k / N;
      const x = pivot.x + camRight.x * shoulder * f - camFwd.x * dist * f;
      const y = pivot.y - camFwd.y * dist * f;
      const z = pivot.z + camRight.z * shoulder * f - camFwd.z * dist * f;
      if (y < groundAt(x, z) + 0.35) { allowed = Math.max(0.9, dist * (k - 0.6) / N); break; }
    }
    // solid prop collision (pillars, huts, big rocks...) — 2D ray vs collider circles along the boom
    allowed = Math.min(allowed, propBoomLimit(dist, shoulder));
    if (camSnap || allowed < camDist - 0.02) { camDist = camSnap ? allowed : damp(camDist, allowed, 30, rdt); camHoldT = 0.3; }
    else if (camHoldT > 0) camHoldT -= rdt; // hold the shortened boom briefly so thin stakes/trunks don't pop
    else camDist = damp(camDist, allowed, 4, rdt);
    camSnap = false;
    camPos.copy(pivot).addScaledVector(camRight, shoulder).addScaledVector(camFwd, -camDist);
    const minY = groundAt(camPos.x, camPos.z) + 0.3;
    if (camPos.y < minY) camPos.y = minY;
    camera.position.copy(camPos);
    camEuler.set(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(camEuler);
    const dc = api.debugCam; // test hook: {dist, height, angle (rad around player, 0 = in front), lookH}
    if (dc) {
      const a = facing + (dc.angle || 0);
      camera.position.set(pos.x + Math.sin(a) * dc.dist, pos.y + dc.height, pos.z + Math.cos(a) * dc.dist);
      camera.lookAt(pos.x, pos.y + (dc.lookH ?? 1.1), pos.z);
    }
    const fov = BASE_FOV + wFov * 7 - wFocus * 4;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  game.combat?.register?.(entity);
  // position immediately so other modules created later can read it
  placeAtSpawn();
  return api;
}
