// Player (CONTRACT §10, PLAN v4 §5.8–5.12): the hero for all 6 classes, third-person controller, combat camera, aim, resources,
// class kits (keymap actions dodge / dodgeAlt / defend with a 0.25 s input buffer, pending-perfect + after-impact grace,
// post-hit protection, optional witch time), story auto-revive, HP regen, platforms and bounds. Class-specific behaviour is data in player/kits.js (KITS) and
// player/classes.js (outfits, weapon props); family/style come from core/classes.js. No class literals here (rule 8).
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, angleDiff, rand } from './core/utils.js';
import { elColor } from './core/elements.js';
import { CLASS_DEFS, familyOf, styleOf } from './core/classes.js';
import { buildWizard, skinMerge } from './player/model.js';
import { mergeRig } from './player/merge.js';
import { Cape } from './player/cape.js';
import { RuneCircle, Afterimages } from './player/fx.js';
import { Animator, CAST_DUR } from './player/anim.js';
import { buildSwordGear } from './player/swordsman.js';
import { buildClassGear, setClassOutfit, alignMergeKeys } from './player/classes.js';
import { PF, lerpPose, applySwordArms } from './player/swordpose.js';
import { Barrier } from './player/defense.js';
import { kitOf, KIT_NAMES, PERFECT_KO, GRACE, legacyBlockType } from './player/kits.js';
import { Resources } from './player/resource.js';
import { Regen } from './player/regen.js';
import { Springs } from './player/springs.js';
import { FootIK } from './player/ik.js';
import { castKindOf, meleeStance, DODGE_POSES, FIDGETS } from './player/poses.js';

const WALK = 5.5, SPRINT = 9, GRAVITY = 22, JUMP_VEL = 8;
const GLIDE_FALL = 2.5, GLIDE_SPEED = 8;
const SENS = 0.0022, PITCH_MIN = -1.15, PITCH_MAX = 0.85;
const CAM_DIST = 5.5, CAM_DIST_AIM = 3.8, SHOULDER = 1.2, SHOULDER_AIM = 0.85, PIVOT_H = 1.85;
// v4 combat camera (§5.11): boom 5.5 → 6.6 m, FOV +4°, shoulder 1.2 → 0.9 while an enemy is aggroed within 15 m (eased 0.6 s);
// +10 % boom during any boss tell; boss cameraHint {dist, height} (multipliers) within 40 m; settings.cameraDist ×0.9 / ×1 / ×1.15
const CAM_DIST_COMBAT = 6.6, SHOULDER_COMBAT = 0.9, FOV_COMBAT = 4, COMBAT_R = 15, BOSS_HINT_R = 40, CAM_EASE = 0.6;
const CAM_DIST_MUL = { near: 0.9, normal: 1, far: 1.15 };
// v4 dodge / defence (§5.8, §5.9)
const BUFFER_SEC = 0.25, PROTECT_SEC = 0.35, PROTECT_MIN = 12, COUNTER_DUR = 1.2;
const WITCH = { scale: 0.5, dur: 0.6, cd: 4, quiet: 0.3, grade: 0.6, fx: 0.6 };
const AUTO_REVIVE_SEC = 2, AUTO_REVIVE_HP = 0.5;
const BASE_FOV = 62;
const DEEP_WATER = 1.15;
const AIM_CONE = Math.cos(THREE.MathUtils.degToRad(4.5));
const AIM_CONE_WEAK = Math.cos(THREE.MathUtils.degToRad(8)), AIM_CONE_STRONG = Math.cos(THREE.MathUtils.degToRad(12));
const GUARD_BREAK_T = 0.8, UPDRAFT_VY_CAP = 9, SPRINT_STAM = 18, GLIDE_STAM = 10, GLIDE_STAM_UPDRAFT = 4;
const HARD_LAND_H = 6, DAZZLED_PARRY_ADD = 0.1;
// after-image tints (element ramp steps, never white: rule 5)
const DODGE_COL = new THREE.Color(0.45, 0.75, 1), DASH_COL = new THREE.Color(0.62, 0.74, 0.92);
const SHADOW_COL = new THREE.Color(0.62, 0.35, 1), SPIRIT_COL = new THREE.Color(0.6, 1, 0.7), HOLY_COL = new THREE.Color(1, 0.88, 0.55);
// burst colour pairs (module-level: no array literals in per-frame paths)
const C_SPIRIT = [0x9dffb0, 0xd6f5c8], C_SHADOW = [0xb98bff, 0x6a3fa0], C_HOLY = [0xffe9a8, 0xf0c25a], C_GUARD = [0xffd28a, 0xf3dca8];
const C_DODGED = [0xc8d6ee, 0x9fb6d8], C_SPARK_HOT = [0xfff3c0, 0xffb040], C_SPARK_SHIELD = [0xfff6d0, 0xffd36a];
const C_DUST = 0xe6dbc0;

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
  const cape = new Cape(scene, rig.torso, rig.capeAnchors, 9, 0.112);
  // Perf (PLAN §2.6): the whole rig (≈300 parts, every class's gear) + cape → body + outline + shadow proxy (see player/merge.js);
  // v3 per-material skinMerge stays as the fallback
  if (rig.gemCore) { rig.gemCore.visible = false; }
  try {
    rig.skin = mergeRig(root, { cape, skirt: rig.skirt, slots: { gem: rig.gemMat, mote: rig.moteMat, weaponGem: gear.gemMat }, exclude: new Set(rig.gemCore ? [rig.gemCore] : []) });
  } catch (err) { console.warn('[player] mergeRig failed, using the v3 skinMerge', err); rig.skin = null; }
  if (!rig.skin) { try { rig.skin = skinMerge(root); } catch (err) { console.warn('[player] skinMerge failed, using per-part meshes', err); } }
  const anim = new Animator(rig);
  const springs = new Springs(cg.chains);
  const footIK = new FootIK(rig);
  // private player-FX materials → vfx.applyPlayerFx once at construction (side effect only, §5.4 / rule 12)
  const pfx = (m, o) => { try { game.vfx?.applyPlayerFx?.(m, o); } catch (err) { /* vfx stub */ } };
  const chargeCircle = new RuneCircle(scene, 1.15, pfx);
  const sigil = new RuneCircle(scene, 1.9, pfx);
  const ghosts = new Afterimages(scene, root, 5, pfx, rig.skin);   // GPU-skinned proxy snapshots when the rig is merged
  const barrier = new Barrier(scene, pfx);
  if (rig.haloMat) pfx(rig.haloMat, { additive: true, role: 'fill' });
  const WARD_COL = new THREE.Color(0.55, 1, 0.65), WARD_COL2 = new THREE.Color(0.78, 0.95, 0.8);

  // ---------- entity ----------
  const velocity = new THREE.Vector3();
  const entity = {
    id: 'player', team: 'player', alive: true, object: root, radius: 0.4, height: 1.8,
    hp: 100, maxHp: 100, mass: 1, velocity, grounded: true, statuses: {}, name: '바람결의 젊은이',
    isPlayer: true, invulnerable: false,
    flashUniform: rig.skin?.flash,          // vfx.flashEntity tints the merged body through this uniform (no material clones)
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
  // v4: per-frame numeric state as double fields of one object (closure lets box a new heap number on every double write)
  const PS = {
    vy: 0, airTime: 0, coyote: 0, jumpBuffer: 0, peakY: 0, facing: Math.PI, prevFacing: Math.PI, bank: 0,
    turnRate: 0, yaw: 0, pitch: -0.12, invulT: 0, ghostTimer: 0, shieldT: 0, castT: 0, castRecent: 0,
    gemFlare: 0, chargeFrac: 0, hurt: 0, squash: 0, deadW: 0, deadTime: 0, phase: 0, lastSin: 0,
    stepSide: 1, wSprint: 0, wAir: 0, wGlide: 0, wAction: 0, wAim: 0, speedFrac: 0, wFov: 0,
    wBowAim: 0, wFocus: 0, wLand: 0, accelF: 0, lastSpeed: 0, sparkleT: 0, convergeT: 0, wadeT: 0,
    aimPitch: 0, dodgeT: 0, dodgeDur: 0, dodgeIframeT: 0, dodgeStartT: -10, dodgeEndT: -10, dodgeCd: 0, dodgeCharges: 1,
    dodgeRecharge: 0, superArmorT: 0, ghostT2: 0, blockT: 0, guardBreakT: 0, wardHp: 0, wardRechargeT: 0, counterT: 0,
    counterCd: 0, decoyT: 0, decoyFxT: 0, counterReady: 0, perfectFx: 0, updraftT: 0, airJumps: 0, drawnW: 0,
    fidgetT: 0, fidgetNext: 9, idleT: 0, mageRuneT: 0, bowDraw: 0, stringVel: 0, stringOff: 0, protectUntil: -10,
    witchReadyAt: 0, lastPerfectRt: -10, tellHead: 0, hitstopUntil: 0, reviveT: 0, wCombat: 0, wBossTell: 0, wHintD: 1,
    wHintH: 1, camDist: CAM_DIST, dodgedFxT: -10, camHoldT: 0,
  };
  let grounded = true, wasGrounded = true;
  
  
  let gliding = false, sprinting = false;
  
  let castKind = null;
  let charging = false, chargeEl = null;
  let dying = false, respawnTimer = null;
  
  let element = 'fire';
  const elemColor = new THREE.Color(elColor('fire'));
  const gemColor = new THREE.Color(), gemLight = new THREE.Color(elColor('fire'));
  // reused burst options for the per-frame emitters (charge convergence, glide sparkle, decoy wisps): no per-frame literals
  const CONVERGE = { count: 1, color: null, speed: 2.6, speedVar: 0.3, spread: 0, dir: null, size: 0.07, sizeEnd: 0.02, life: 0.32, lifeVar: 0.03, drag: 0, gravity: 0, shape: 'spark', velocityStretch: 1.5 };
  const SPARKLE = { count: 2, color: null, speed: 0.6, spread: 1, size: 0.07, sizeEnd: 0, life: 0.8, gravity: 2.5, shape: 'spark' };
  const DECOY_WISP = { count: 3, color: C_SPIRIT, speed: 0.5, spread: 1, size: 0.12, sizeEnd: 0.02, life: 0.6, gravity: -0.8, shape: 'soft', drag: 1 };
  const STEP_DUST = { count: 3, color: C_DUST, speed: 0.9, spread: 0.6, dir: null, size: 0.22, sizeEnd: 0.55, life: 0.5, shape: 'smoke', additive: false, drag: 3 };
  const WADE = { count: 4, color: 0xd8eef4, speed: 1.8, spread: 0.6, dir: null, size: 0.12, life: 0.4, gravity: 9, shape: 'soft', additive: false };
  const UPDRAFT = { count: 1, color: [0xffd090, 0xff8040], speed: 4, spread: 0.1, dir: null, size: 0.06, sizeEnd: 0, life: 0.5, shape: 'spark' };
  
  
  
  
  // ---- class & kit ----
  let cls = null;   // null until the class is chosen (neutral villager look, no Q/E skills)
  let kit = kitOf(null);
  // dodge state (all kit types)
  let dodgeType = 'none';
  
  const dodgeDir = new THREE.Vector3(), blinkFrom = new THREE.Vector3(), blinkTo = new THREE.Vector3();
  let blinking = false;   // blink-type dodge (invisible travel)
  // defend state
  let blocking = false, blockHeld = false;
  let wardBroken = false;
  
  let focusing = false;
   const decoyPos = new THREE.Vector3(); 
  // perfect / counter
  let counterTarget = null;
  let inUpdraft = false;
  let swordDrawn = false;
  let fidgetKind = null;
   const mageRunePos = new THREE.Vector3(); let mageRuneEl = 'fire';
  
  let platformHandle = null;
  // ---- v4 dodge / defence (§5.8–5.9) ----
  /** 0.25 s input buffer for dodge / dodgeAlt / defend pressed while a lock holds (api.inputBuffer → {action, t} | null). */
  const inputBuf = { action: null, t: 0, reason: 'locked', view: { action: null, t: 0 } };
  /** pending-perfect: set on a dodge / defend press when the next impact is inside the perfect window. Times in game.realTime. */
  const pending = { on: false, kind: null, until: 0, enemy: null, targetsPlayer: false, noInfo: false, t0: 0 };
  /** the last enemy hit (from playerHurt) for the after-impact grace refund; api.lastEnemyHit is a reused view. */
  const lastHit = { valid: false, refunded: false, rt: -10, t: -10, amount: 0, attacker: null, attack: null, statuses: [], view: { t: 0, amount: 0, attacker: null, attack: null, appliedStatuses: null } };
              // post-hit protection (game.time): melee hits ignored
                // game.realTime when the next witch time may start
  
  const TELL_RING = 8, tellRing = [];      // recent tellStart {enemy, targetsPlayer, rt}
  for (let i = 0; i < TELL_RING; i++) tellRing.push({ enemy: null, targetsPlayer: false, rt: -10 });
  
                // per-entity hitstop: the animation freezes while game.realTime < this (input keeps buffering)
                     // story auto-revive timer
  // combat camera state
  
  const camInfo = { hint: null, dist: CAM_DIST, fov: 62, combat: 0, bossTell: 0, shoulder: SHOULDER };
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
  let camSnap = true;
  const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // scratch
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
  const wish = new THREE.Vector3(), wishRaw = new THREE.Vector3();
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
  /** Slope limit probe (update): can't walk / jump-climb faces steeper than ~53 degrees from (px, pz) with ground g0. */
  const tooSteep = (gx, gz, px, pz, yh, g0) => {
    const dx = gx - px, dz = gz - pz, st = Math.sqrt(dx * dx + dz * dz); if (st < 1e-5) return false;
    const gg = groundAt(gx, gz, yh);
    if (wasGrounded) return (gg - g0) / st > 1.33 && gg > g0 + 0.05;
    return gg > pos.y + 0.6; // airborne: walls block rather than teleport us up
  };
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
  // keymap actions only (PLAN §5.8: no key literals for dodge / defend / jump / sprint); legacy KEYS twin as a fallback
  const KM = () => input.keymap;
  const legacyCode = (a) => game.KEYS?.[a] || null;
  const kPressed = (a) => { const k = KM(); if (k?.pressed) return !!k.pressed(a); const c = legacyCode(a); return c ? !!input.pressed(c) : false; };
  const kDown = (a) => { const k = KM(); if (k?.down) return !!k.down(a); const c = legacyCode(a); return c ? !!input.down(c) : false; };
  /** element ramp pair [mid, light] for bursts (cached per element, never white). */
  const PAIRS = {};
  const pair = (el) => {
    let p = PAIRS[el];
    if (!p) {
      let f = null; try { f = game.elements?.fx?.(el); } catch (_) { f = null; }
      const mid = f?.mid ?? elColor(el), light = f?.light ?? mid;
      p = PAIRS[el] = [mid, light];
    }
    return p;
  };
  const lightOf = (el) => pair(el)[1];
  const assist = () => game.assist || null;
  /** per-entity hitstop on the player (core stamps entity.hitstopUntil / player.hitstopUntil in game.realTime seconds). */
  const animFrozen = () => Math.max(PS.hitstopUntil, entity.hitstopUntil || 0, game.playerHitstopUntil || 0) > (game.realTime || 0);
  const perfectMul = () => { const m = +assist()?.perfectMul; return m > 0 ? m : 1; };
  const iframeMul = () => { const m = +assist()?.iframeMul; return m > 0 ? m : 1; };
  const ts = () => game.timeScale;
  const slow = (id, scale, dur) => { try { if (ts()?.set) ts().set(id, scale, dur); else game.slowmo?.(scale, dur); } catch (_) { /* */ } };
  // cached per class (setClass): keyed CLASS_DEFS lookups in the per-frame update deoptimised it back to baseline code
  let clsMelee = false, clsStyle = 'staff';
  const isMelee = () => clsMelee;
  const style = () => clsStyle;
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
    rig.moteMat.color.setHex(lightOf(el));
    gemLight.setHex(lightOf(el));
    chargeCircle.setColor(elemColor, gemLight); sigil.setColor(elemColor, gemLight);
    if (kit.defend.type !== 'ward') barrier.setColor(elemColor, gemLight);
    entity.resist = el === 'fire' ? { fire: 0.35 } : undefined; // attuned to fire: own grass fires barely singe
    gear.gemMat.color.copy(elemColor).multiplyScalar(1.2);
    gear.edgeMat.uniforms.uColor.value.copy(elemColor);
    if (changed && game.state === 'playing') {
      PS.gemFlare = Math.max(PS.gemFlare, 0.6);
      api.getWeaponTip('main', v4);
      vfxCall('burst', v4, { count: 14, color: pair(el), speed: 2.2, spread: 1, size: 0.09, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 2 });
    }
  }

  let checkpoint = null;
  function placeAtSpawn(useCheckpoint = false) {
    const sp = (useCheckpoint && checkpoint) || W()?.playerSpawn;
    if (sp) pos.set(sp.x, 0, sp.z); else pos.set(0, 0, 120);
    if (useCheckpoint && checkpoint) { try { W()?.resolveCollision?.(pos, entity.radius + 0.6); } catch (e) { /* */ } }
    pos.y = groundAt(pos.x, pos.z);
    PS.vy = 0; hv.set(0, 0, 0); velocity.set(0, 0, 0);
    grounded = wasGrounded = true; PS.peakY = pos.y;
    PS.yaw = 0; PS.pitch = -0.12; PS.facing = PS.prevFacing = Math.PI;
    root.rotation.set(0, PS.facing, 0);
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
    if (hit?._pbdRes?.mul != null) { velocity.multiplyScalar(0.35); PS.hurt = Math.max(PS.hurt, 0.35); return; }
    if (!hpDropped) return;
    const isDot = !!hit?.isDot || (hit?.tags || []).includes('dot');
    // directional hurt pose from the hit direction (or the source position)
    if (!isDot) {
      if (hit?.direction) v1.copy(hit.direction); else if (sourcePos(hit, v1)) v1.subVectors(pos, v1); else v1.set(0, 0, 0);
      v1.setY(0);
      if (v1.lengthSq() > 1e-6) {
        v1.normalize();
        const cf = Math.cos(PS.facing), sf = Math.sin(PS.facing);
        anim.hurtKick(v1.x * cf - v1.z * sf, v1.x * sf + v1.z * cf, clamp(dmg / Math.max(20, entity.maxHp * 0.15), 0.3, 1.2));
      }
    }
    // support buffs: stagger immunity / shield step super armor
    if (statGet('noKnockback', false) || action.superArmor || PS.superArmorT > 0) { velocity.set(0, 0, 0); PS.hurt = Math.max(PS.hurt, 0.3); return; }
    if (isDot) { PS.hurt = Math.max(PS.hurt, 0.25); return; }
    PS.hurt = 1;
    if (charging) PS.gemFlare = 0.3;
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
    return v4.normalize().dot(v3.set(Math.sin(PS.facing), 0, Math.cos(PS.facing))) > arc;
  };
  const parryWindow = (base, hit) => {
    let w = base + (statGet('parryWindowAdd', 0) || 0);
    const s = hit?.source;
    if (s && typeof s === 'object' && s.statuses?.dazzled) w += DAZZLED_PARRY_ADD;
    return w;
  };
  /** attack kind of an incoming hit (§5.8 post-hit protection): attack.kind, else projectile / hazard, melee only for an enemy entity source. */
  function attackKindOf(hit) {
    const k = hit.attack?.kind ?? hit.sourceEntity?.attack?.kind;
    if (k) return k;
    if (hit.projectile) return 'projectile';
    const tags = hit.tags;
    if (hit.isDot || (tags && (tags.includes('dot') || tags.includes('zone') || tags.includes('tick')))) return 'hazard';
    const s = hit.sourceEntity || hit.source;
    return s && typeof s === 'object' && s.object && s.team !== 'player' && !s.isSurface ? 'melee' : 'other';
  }
  const srcEntity = (hit) => { const s = hit?.sourceEntity || hit?.source; return s && typeof s === 'object' ? s : null; };
  /** Does the pending-perfect (set at the dodge / defend press) cover this hit? */
  function pendingCovers(hit, kind) {
    if (!pending.on || pending.kind !== kind) return false;
    const rt = game.realTime;
    // clocks: the prediction is in enemy time (tells run on game.enemyTime, slowed by slow motion like the enemies);
    // without a prediction source the v3 rule applies on game time
    void rt;
    if (pending.noInfo) return game.time - pending.t0 <= pending.win + 1e-4;
    if ((game.enemyTime ?? game.time) > pending.until) return false;
    const a = srcEntity(hit);
    return !pending.enemy || !a || a === pending.enemy;
  }
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
    if (game.time < PS.protectUntil && attackKindOf(hit) === 'melee') {
      // post-hit protection: no melee chains for 0.35 s after a real hit (projectiles, hazards and surfaces still apply)
      r = { cancel: true, dodged: true, protected: true };
    } else if (PS.decoyT > 0) {
      // 정령 교대: the wisp left behind absorbs one hit
      PS.decoyT = 0; popDecoy();
      r = { cancel: true, dodged: true };
      if (pendingCovers(hit, 'dodge')) { pending.on = false; perfectDodge(hit); }
    } else if (PS.counterT > 0 && D.type === 'counter') {
      r = { cancel: true, parried: true, perfect: true };
      doCounter(hit);
    } else if (PS.dodgeIframeT > 0) {
      const perfect = DG.perfectWin > 0 && pendingCovers(hit, 'dodge');
      if (perfect) pending.on = false;
      if (perfect && DG.brace) {
        // 방패 돌진 perfect brace: the perfect-block effects (attacker parried / staggered, counter ready)
        r = { cancel: true, parried: true, perfect: true, reflect: talentOn('paladin.t10') };
        perfectBrace(hit);
      } else {
        if (perfect) perfectDodge(hit); else dodgedFx();
        r = { cancel: true, dodged: true };
      }
    } else if (blocking) {
      const t = D.type;
      const omni = t === 'barrier' || t === 'ward';
      if (omni || frontOf(hit, D.arc ?? -0.25)) {
        const amt = hit.amount || 0;
        const perfect = D.perfect > 0 && (PS.blockT <= parryWindow(D.perfect * perfectMul(), hit) || pendingCovers(hit, 'defend'));
        if (perfect) {
          pending.on = false;
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
          PS.wardHp -= absorbed;
          r = { mul: D.mul };
          blockFx(hit, false);
          if (PS.wardHp <= 0) {
            // the dome breaks: the overflow goes through at full damage
            const over = -PS.wardHp; PS.wardHp = 0;
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
    if (!sourcePos(hit, v4)) v4.set(pos.x + Math.sin(PS.facing), pos.y, pos.z + Math.cos(PS.facing));
    v4.sub(pos).setY(0); if (v4.lengthSq() < 1e-4) v4.set(Math.sin(PS.facing), 0, Math.cos(PS.facing)); v4.normalize();
    const t = kit.defend.type;
    if (t === 'barrier' || t === 'ward') {
      barrier.hit(v4, perfect);
      v1.copy(pos).addScaledVector(v4, 1.3).setY(pos.y + 1.0);
      vfxCall('burst', v1, { count: perfect ? 22 : 10, color: t === 'ward' ? C_SPIRIT : pair(element), speed: perfect ? 6 : 3, spread: 0.6, dir: v4, size: 0.1, sizeEnd: 0, life: 0.35, shape: t === 'ward' ? 'leaf' : 'spark', drag: 3 });
      game.audio?.play?.(perfect ? 'reflect' : 'barrier_hit', { position: v1 });
    } else {
      api.getWeaponTip(t === 'shield' ? 'off' : 'main', v1); v1.lerp(v2.copy(pos).addScaledVector(v4, 0.6).setY(pos.y + 1.2), 0.6);
      const hot = t === 'shield' ? C_SPARK_SHIELD : C_SPARK_HOT;
      vfxCall('burst', v1, { count: perfect ? 24 : 10, color: hot, speed: perfect ? 9 : 5, speedVar: 3, spread: perfect ? 1 : 0.5, dir: v4, size: perfect ? 0.11 : 0.08, sizeEnd: 0, life: perfect ? 0.42 : 0.28, shape: 'spark', drag: 2.5, velocityStretch: 0.05 });
      vfxCall('flash', v1, { color: 0xf3d79a, intensity: perfect ? 1.2 : 0.6, distance: perfect ? 6 : 4, duration: perfect ? 0.2 : 0.1 });
      if (t === 'shield') vfxCall('shockwave', v1, { color: C_HOLY[0], radius: perfect ? 2.2 : 1.1, duration: 0.25, vertical: true, opacity: perfect ? 0.8 : 0.5, thickness: 0.14 });
      if (!perfect) { game.audio?.play?.('block_hit', { position: v1 }); vfxCall('shake', 0.12); velocity.multiplyScalar(0.4); }
    }
  }
  // ---------- perfect (dodge / parry / barrier / brace): one reward path (§5.9) ----------
  /** The tell of `attacker` targeted the player (recent tellStart ring, or the pending prediction). */
  function tellTargetedPlayer(attacker) {
    if (!attacker) return false;
    if (pending.enemy === attacker && pending.targetsPlayer) return true;
    const rt = game.realTime;
    let best = null;
    for (let i = 0; i < TELL_RING; i++) { const r = tellRing[i]; if (r.enemy === attacker && rt - r.rt < 6 && (!best || r.rt > best.rt)) best = r; }
    return !!best && best.targetsPlayer;
  }
  /** Another tell targeting the player completes within 0.3 s (witch time would hide it). */
  function otherTellSoon(attacker) {
    let list = null; try { list = game.tells?.active?.(); } catch (_) { list = null; }
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r || r.enemy === attacker || !r.targetsPlayer) continue;
      const rem = Number.isFinite(r.handle?.remaining) ? r.handle.remaining : r.remaining;
      if (rem >= 0 && rem <= WITCH.quiet) return true;
    }
    return false;
  }
  /** Witch time: 0.5 × for 0.6 s real, only with settings.witchSlowmo, a player-targeted tell, no other tell landing within 0.3 s, ≥ 4 s since the last. */
  function tryWitch(attacker) {
    const A = assist();
    if (A && A.witchSlowmo === false) return false;
    if (!A && game.settings?.values?.witchSlowmo === false) return false;
    if (game.realTime < PS.witchReadyAt) return false;
    if (!tellTargetedPlayer(attacker) || otherTellSoon(attacker)) return false;
    let ok = false;
    try { ok = ts()?.set?.('witch', WITCH.scale, WITCH.dur, { compensate: true }) !== false && !!ts()?.set; } catch (_) { ok = false; }
    if (!ok) return false;
    try { game.post?.setGrade?.('witch', WITCH.grade, { durReal: WITCH.dur }); } catch (_) { /* */ }
    try { vfx()?.fxFactor?.('witch', WITCH.fx, WITCH.dur); } catch (_) { /* */ }
    PS.witchReadyAt = game.realTime + WITCH.dur + WITCH.cd;
    return true;
  }
  /** Always: perfectDodge {attacker, witch, grace} (+ calloutKo), counterReady 1.2 s (next basic attack = class counter). */
  function onPerfect(kind, hit, grace = false) {
    const rt = game.realTime;
    if (rt - PS.lastPerfectRt < 0.25) return false;   // one reward per exchange (multi-hit attacks)
    PS.lastPerfectRt = rt;
    const attacker = srcEntity(hit);
    const witch = tryWitch(attacker);
    PS.counterReady = COUNTER_DUR; counterTarget = attacker;
    PS.perfectFx = 1;
    const calloutKo = kind === 'barrier' ? PERFECT_KO.barrier : kind === 'dodge' ? PERFECT_KO.dodge : PERFECT_KO.parry;
    const k = kind === 'dodge' || kind === 'brace' ? kit.dodge.type : kit.defend.type;
    ev('perfectDodge', { source: attacker, attacker, witch, grace: !!grace, kind, calloutKo, position: pos.clone(), cls, kit: k });
    ev('counterReady', { dur: COUNTER_DUR });
    return witch;
  }
  function doParry(hit) {
    blockFx(hit, true);
    const t = kit.defend.type;
    api.getWeaponTip(t === 'shield' ? 'off' : 'main', v1);
    if (t === 'guard' || t === 'shield') {
      game.hitstop?.(0.08, { tier: 'parry', target: srcEntity(hit) });
      vfxCall('shockwave', v1, { color: C_HOLY[0], radius: 2.4, duration: 0.3, vertical: true, opacity: 0.8, thickness: 0.18 });
      vfxCall('fovKick', -4, 0.3); vfxCall('shake', 0.25);
    } else {
      game.hitstop?.(0.08, { tier: 'parry', target: srcEntity(hit) });
      vfxCall('fovKick', -3, 0.25);
    }
    onPerfect(t === 'barrier' ? 'barrier' : 'parry', hit);
    ev('parry', { perfect: true, cls, kit: t, source: hit.source, point: hit.point || pos.clone() });
  }
  /** 방패 돌진 perfect brace: perfect-block effects on the dodge. */
  function perfectBrace(hit) {
    blockFx(hit, true);
    api.getWeaponTip('off', v1);
    game.hitstop?.(0.08, { tier: 'parry', target: srcEntity(hit) });
    vfxCall('shockwave', v1, { color: C_HOLY[0], radius: 2.2, duration: 0.3, vertical: true, opacity: 0.8, thickness: 0.16 });
    vfxCall('fovKick', -3, 0.25);
    onPerfect('brace', hit);
    ev('parry', { perfect: true, cls, kit: 'brace', source: hit.source, point: hit.point || pos.clone() });
  }
  /** 반격 자세: negate the hit, teleport behind the attacker, next hit crits. */
  function doCounter(hit) {
    PS.counterT = 0; PS.counterCd = kit.defend.cd ?? 1;
    const s = hit?.source;
    ghosts.spawn(pos, PS.facing, SHADOW_COL, 0.6, 0.9);
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
    game.hitstop?.(0.08, { tier: 'parry', target: srcEntity(hit) });
    vfxCall('fovKick', 4, 0.3);
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 18, color: C_SHADOW, speed: 4, spread: 1, size: 0.1, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 3 });
    onPerfect('parry', hit);
    ev('parry', { perfect: true, cls, kit: 'counter', source: s, point: hit.point || pos.clone() });
    ev('counter', { source: s, position: pos.clone() });
  }
  function perfectDodge(hit, grace = false) {
    const type = kit.dodge.type;
    if (type === 'blink' || type === 'spiritswap') { perfectBlink(hit, grace); return; }
    if (game.realTime - PS.lastPerfectRt < 0.25) return;
    vfxCall('fovKick', 6, 0.5);
    ghosts.spawn(pos, PS.facing, type === 'shadowroll' ? SHADOW_COL : DODGE_COL, 0.8, 1);
    const target = srcEntity(hit);
    if (type === 'shadowroll' && target?.object && !grace) {
      // 그림자 구르기: a perfect roll ends behind the attacker
      const sp = target.object.position, sf = Number.isFinite(target.facing) ? target.facing : Math.atan2(pos.x - sp.x, pos.z - sp.z);
      v2.set(sp.x - Math.sin(sf) * ((target.radius || 0.6) + 1.0), pos.y, sp.z - Math.cos(sf) * ((target.radius || 0.6) + 1.0));
      if (!outOfBounds(v2.x, v2.z)) { api.teleport(v2, true); api.setFacing(Math.atan2(sp.x - pos.x, sp.z - pos.z)); PS.dodgeT = 0; hv.set(0, 0, 0); }
      if (talentOn('shadowblade.t25b')) { try { game.enemies?.setPlayerStealth?.(true, 2); } catch (_) { /* */ } }
    }
    if (type === 'backflip' && talentOn('ranger.t25b')) R.stamina = Math.min(R.maxStamina, R.stamina + 15);
    onPerfect('dodge', hit, grace);
  }
  
  function dodgedFx() {
    if (game.time - PS.dodgedFxT < 0.3) return;
    PS.dodgedFxT = game.time;
    game.audio?.play?.('dash', { position: pos, volume: 0.5 });
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 8, color: C_DODGED, speed: 3, spread: 1, size: 0.08, sizeEnd: 0, life: 0.25, shape: 'spark', drag: 3 });
  }
  function perfectBlink(hit, grace = false) {
    if (game.realTime - PS.lastPerfectRt < 0.25) return;
    vfxCall('fovKick', 4, 0.35);
    R.mp = Math.min(R.maxMp, R.mp + (kit.dodge.mpRefund || 0));
    onPerfect('dodge', hit, grace);
  }
  /** After-impact grace (0.05 s): a dodge / defend right after a hit refunds it, clears its statuses and counts as perfect. */
  function graceRefund(pressRt, kind) {
    if (!lastHit.valid || lastHit.refunded) return false;
    const g = (kind === 'dodge' ? kit.dodge.grace : null) ?? GRACE;
    if (!(g > 0)) return false;
    const dtHit = pressRt - lastHit.rt;
    if (dtHit < -1e-4 || dtHit > g + 1e-4) return false;
    lastHit.refunded = true;
    entity.hp = Math.min(entity.maxHp, entity.hp + lastHit.amount);
    for (let i = 0; i < lastHit.statuses.length; i++) { try { game.combat?.clearStatus?.(entity, lastHit.statuses[i]); } catch (_) { /* */ } }
    PS.hurt = 0; velocity.set(0, 0, 0);
    try { regen.afterHit?.(); } catch (_) { /* */ }
    graceHit.source = lastHit.attacker; graceHit.sourceEntity = lastHit.attacker;
    if (kind === 'dodge') perfectDodge(graceHit, true);
    else onPerfect(kit.defend.type === 'barrier' ? 'barrier' : 'parry', graceHit, true);
    return true;
  }
  const graceHit = { source: null, sourceEntity: null };
  /** Pending-perfect at a press: t = min(tells.nextImpact(pos), enemies.orbEta(pos)) ≤ window × assist.perfectMul. */
  function armPending(kind, win) {
    pending.on = false;
    if (!(win > 0)) return;
    const w = win * perfectMul();
    let t = Infinity, who = null, tp = false;
    try { const v = game.tells?.nextImpact?.(pos); if (Number.isFinite(v)) t = v; } catch (_) { /* */ }
    try { const v = game.enemies?.orbEta?.(pos); if (Number.isFinite(v) && v < t) { t = v; who = null; tp = true; } } catch (_) { /* */ }
    if (t < Infinity && t === t) {
      // which tell is it? (for the attacker match and the witch-time conditions)
      let list = null; try { list = game.tells?.active?.(); } catch (_) { list = null; }
      let best = Infinity;
      if (list) for (let i = 0; i < list.length; i++) {
        const r = list[i]; if (!r) continue;
        const h = r.handle;
        const rem = Number.isFinite(h?.remaining) ? h.remaining : r.remaining;
        const holds = r.targetsPlayer || (h?.contains ? h.contains(pos) : false);
        if (holds && rem < best) { best = rem; who = r.enemy; tp = r.targetsPlayer !== false; }
      }
    }
    pending.kind = kind; pending.t0 = game.time; pending.win = w;
    if (t === Infinity) {
      // no prediction source at all (e.g. tells stub without live handles): the v3 rule, a hit within the window after the press
      pending.on = true; pending.noInfo = true; pending.enemy = null; pending.targetsPlayer = false; pending.until = (game.enemyTime ?? game.time) + w;
      return;
    }
    pending.noInfo = false;
    if (t <= w) { pending.on = true; pending.enemy = who; pending.targetsPlayer = tp; pending.until = (game.enemyTime ?? game.time) + t + 0.06; }
  }
  function breakBlock() {
    if (!blocking) return;
    blocking = false; PS.blockT = 0;
    game.audio?.play?.(kit.defend.type === 'barrier' ? 'mana_empty' : 'guard_break', { position: pos });
  }
  function guardBreak() {
    breakBlock();
    PS.guardBreakT = GUARD_BREAK_T; R.exhausted = true; PS.hurt = 1;
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1.2), { count: 16, color: C_GUARD, speed: 5, spread: 1, size: 0.1, life: 0.4, shape: 'spark', drag: 3 });
    vfxCall('shake', 0.3);
    ev('guardBreak', { position: pos.clone() });
  }
  function wardBreak() {
    wardBroken = true; PS.wardRechargeT = 0;
    breakBlock();
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 24, color: C_SPIRIT, speed: 5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.6, shape: 'leaf', drag: 2.5 });
    vfxCall('shockwave', v1, { color: 0x9dffb0, radius: 2.2, duration: 0.35, opacity: 0.7, thickness: 0.15 });
    game.audio?.play?.('guard_break', { position: pos, pitch: 1.3 });
    ev('wardBreak', { position: pos.clone() });
  }
  const wardCap = () => (kit.defend.capacity || 0.35) * entity.maxHp;
  function canStartBlock() {
    const D = kit.defend;
    if (D.type === 'barrier') return R.mp >= (D.minMp ?? 3);
    if (D.type === 'ward') return !wardBroken && PS.wardHp >= wardCap() * (D.minFrac ?? 0.15);
    if (D.type === 'guard' || D.type === 'shield') return R.stamina >= (D.minStam ?? 5);
    return false;
  }
  function startBlock(pressRt = game.realTime) {
    if (blocking || PS.guardBreakT > 0 || PS.dodgeT > 0) return false;
    if (!canStartBlock()) return false;
    blocking = true; PS.blockT = 0;
    if (kit.defend.perfect > 0) { armPending('defend', kit.defend.perfect); graceRefund(pressRt, 'defend'); }
    endGlide();
    const t = kit.defend.type;
    game.audio?.play?.(t === 'barrier' || t === 'ward' ? 'barrier_up' : 'block', { position: pos });
    if (isMelee()) { swordDrawn = true; api.swordIdleT = 0; }
    if (t === 'ward') barrier.setColor(WARD_COL, WARD_COL2);
    return true;
  }
  /** → 'ok' | 'cooldown' | 'stamina' */
  function startCounter(pressRt = game.realTime) {
    const D = kit.defend;
    if (PS.counterT > 0 || PS.counterCd > 0 || PS.guardBreakT > 0) return 'cooldown';
    if (!R.spendStamina(D.cost ?? 6)) { game.audio?.play?.('guard_break', { volume: 0.3, pitch: 1.6 }); return 'stamina'; }
    PS.counterT = (D.window ?? 0.3) * perfectMul(); swordDrawn = true; api.swordIdleT = 0;
    graceRefund(pressRt, 'defend');
    ghosts.spawn(pos, PS.facing, SHADOW_COL, 0.3, 0.5);
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1.1), { count: 10, color: C_SHADOW, speed: 1.5, spread: 1, size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
    game.audio?.play?.('block', { position: pos, pitch: 1.4 });
    ev('counterStance', { position: pos.clone() });
    return 'ok';
  }

  // ---------- dodge (Q): one entry point, behaviour by kit type ----------
  function dodgeAvailable() {
    const DG = kit.dodge;
    if (DG.charges) return PS.dodgeCharges > 0;
    return PS.dodgeCd <= 0;
  }
  /**
   * One dodge entry point, behaviour by kit type → 'ok' | 'locked' | 'cooldown' | 'stamina' | 'none'.
   * pressRt: real time of the press (buffered presses keep it for the grace check). Direction = the held movement input
   * (camera-relative) when one is held; the ranger backflip flips toward it (backward when none).
   */
  function tryDodge(canAct, pressRt = game.realTime) {
    const DG = kit.dodge;
    if (DG.type === 'none' || !entity.alive || dying) return 'none';
    if (PS.dodgeT > 0 || !canAct || PS.guardBreakT > 0) return 'locked';
    if (!dodgeAvailable()) return 'cooldown';
    if (R.exhausted && R.stamina < DG.cost) { game.audio?.play?.('guard_break', { volume: 0.3, pitch: 1.6 }); return 'stamina'; }
    R.spendStamina(DG.cost, true);
    if (DG.charges) {
      const maxC = DG.charges + (statGet('extraDash', 0) || 0);
      if (PS.dodgeCharges === maxC) PS.dodgeRecharge = DG.recharge * (statGet('dodgeCdMul', 1) || 1);
      PS.dodgeCharges--;
    } else PS.dodgeCd = DG.cd * (statGet('dodgeCdMul', 1) || 1);   // wind.cap 순풍의 가호 −25%
    const type = DG.type;
    dodgeType = type;
    // direction: the held movement input, else the kit default (blink/swap forward, backflip backward, rolls away from the camera view)
    const held = wishRaw.lengthSq() > 0.01;
    if (held) dodgeDir.copy(wishRaw).setY(0).normalize();
    else if (type === 'backflip') dodgeDir.set(-Math.sin(PS.facing), 0, -Math.cos(PS.facing));
    else if (type === 'blink' || type === 'spiritswap') dodgeDir.set(Math.sin(PS.facing), 0, Math.cos(PS.facing));
    else dodgeDir.set(Math.sin(PS.yaw), 0, Math.cos(PS.yaw));
    blocking = false; PS.counterT = 0;
    endGlide();
    PS.dodgeStartT = game.time; PS.ghostT2 = 0; PS.ghostTimer = 0;
    PS.dodgeIframeT = (DG.iframes || 0) * iframeMul();
    PS.superArmorT = DG.superArmor || 0;
    armPending('dodge', DG.perfectWin);
    const dist = DG.dist * (statGet('dashDistMul', 1) || 1);
    if (type === 'blink' || type === 'spiritswap') startBlink(dist, type);
    else {
      PS.dodgeT = PS.dodgeDur = DG.time;
      // the backflip faces away from its travel direction (a real backflip toward the input); the rest face it
      if (type === 'backflip') { if (held) PS.facing = PS.prevFacing = Math.atan2(-dodgeDir.x, -dodgeDir.z); }
      else PS.facing = Math.atan2(dodgeDir.x, dodgeDir.z);
      if (type === 'backflip') { PS.vy = DG.hop || 5; grounded = false; PS.airTime = 0.05; }
      else if (grounded) PS.vy = 0;
      v1.copy(pos).setY(pos.y + 0.3);
      vfxCall('burst', v1, { count: 8, color: C_DUST, speed: 2.5, spread: 0.5, dir: v2.copy(dodgeDir).negate().setY(0.3), size: 0.35, sizeEnd: 0.9, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
      if (type === 'shadowroll') vfxCall('burst', v1.setY(pos.y + 0.8), { count: 10, color: [0x5b2a8a, 0x1a0b2e], speed: 2, spread: 0.8, dir: v2.copy(dodgeDir).negate(), size: 0.4, sizeEnd: 0.9, life: 0.5, shape: 'smoke', additive: false, drag: 3 });
      else if (type === 'shieldstep') vfxCall('burst', v1.setY(pos.y + 1), { count: 10, color: C_HOLY, speed: 3, spread: 0.4, dir: dodgeDir, size: 0.09, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
      else vfxCall('burst', v1.setY(pos.y + 1), { count: 10, color: pair(element), speed: 3, spread: 0.6, dir: v2.copy(dodgeDir).negate(), size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
      vfxCall('fovKick', type === 'shieldstep' ? 2 : 3, 0.22);
      game.audio?.play?.('dash', { position: pos, pitch: type === 'shieldstep' ? 0.8 : type === 'shadowroll' ? 1.15 : 1 });
      ev('dash', { position: pos.clone(), direction: dodgeDir.clone(), kit: type });
    }
    ev('dodge', { type, position: pos.clone(), direction: dodgeDir.clone() });
    graceRefund(pressRt, 'dodge');
    return 'ok';
  }
  /** Queue a dodge / defend press for ≤ 0.25 s while a lock holds (§5.8). */
  function bufferPress(action, reason) {
    if (!inputBuf.action || inputBuf.action !== action) { inputBuf.action = action; inputBuf.t = game.realTime; }
    inputBuf.reason = reason || 'locked';
  }
  function rejectPress(action, reason) { ev('dodgeRejected', { action, reason: reason || 'locked' }); }
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
    PS.dodgeT = PS.dodgeDur = DG.time; blinking = true;
    gliding && endGlide();
    PS.vy = 0;
    const spirit = type === 'spiritswap';
    const c = spirit ? 0x9dffb0 : elHex();
    v1.copy(pos).setY(pos.y + 0.9);
    ghosts.spawn(pos, PS.facing, spirit ? SPIRIT_COL : elemColor, spirit ? 0.9 : 0.5, 1);
    vfxCall('burst', v1, { count: 18, color: spirit ? C_SPIRIT : pair(element), speed: 4.5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.42, shape: spirit ? 'leaf' : 'spark', drag: 3 });
    vfxCall('burst', v1, { count: 4, color: c, speed: 1.2, spread: 1, size: 0.4, sizeEnd: 0.9, life: 0.35, shape: 'soft', drag: 2 });
    vfxCall('flash', v1, { color: c, intensity: 1.2, distance: 6, duration: 0.15 });
    vfxCall('fovKick', 5, 0.25);
    if (spirit) { PS.decoyT = DG.decoyLife || 4; decoyPos.copy(blinkFrom); PS.decoyFxT = 0; try { game.enemies?.setTauntTarget?.({ object: { position: decoyPos }, team: 'player', isDecoy: true, alive: true }, PS.decoyT); } catch (_) { /* */ } }
    if (type === 'blink' && talentOn('mage.t20')) { PS.mageRuneT = 1.5; mageRunePos.copy(blinkFrom); mageRuneEl = element; }
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
    vfxCall('burst', v1, { count: 16, color: kit.dodge.type === 'spiritswap' ? C_SPIRIT : pair(element), speed: 3.5, spread: 1, size: 0.11, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 3 });
    vfxCall('shockwave', v1.set(pos.x, pos.y + 0.9, pos.z), { color: c, radius: 1.6, duration: 0.3, vertical: true, opacity: 0.6, thickness: 0.15 });
    hv.copy(dodgeDir).multiplyScalar(WALK * 0.8);
    PS.squash = Math.max(PS.squash, 0.35);
    PS.dodgeEndT = game.time;
  }
  function popDecoy() {
    vfxCall('burst', v1.copy(decoyPos).setY(decoyPos.y + 1), { count: 20, color: C_SPIRIT, speed: 4, spread: 1, size: 0.12, sizeEnd: 0, life: 0.55, shape: 'leaf', drag: 2.5 });
    vfxCall('shockwave', v1, { color: 0x9dffb0, radius: 1.8, duration: 0.3, opacity: 0.7, thickness: 0.12 });
    game.audio?.play?.('reflect', { position: decoyPos, pitch: 1.3 });
    try { game.enemies?.clearTauntTarget?.(); } catch (_) { /* */ }
    ev('decoyPop', { position: decoyPos.clone() });
  }
  function onDeath(result, hit) {
    regen.afterHit();
    void result; void hit;
    if (dying) return;
    dying = true; PS.deadTime = 0;
    gliding = false; charging = false; castKind = null; stopFocus();
    ev('playerDeath', {});
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 20, color: pair(element), speed: 3, spread: 1, size: 0.12, life: 0.9, shape: 'spark', gravity: -1 });
  }

  function resetKitState() {
    inputBuf.action = null; pending.on = false; lastHit.valid = false; PS.protectUntil = -10; PS.reviveT = 0;
    blocking = false; PS.blockT = 0; PS.guardBreakT = 0; PS.dodgeT = 0; PS.dodgeIframeT = 0; blinking = false; PS.superArmorT = 0;
    PS.counterReady = 0; PS.counterT = 0; PS.counterCd = 0; PS.decoyT = 0; PS.dodgeCd = 0;
    PS.dodgeCharges = (kit.dodge.charges || 1) + (kit.dodge.charges ? (statGet('extraDash', 0) || 0) : 0);
    PS.wardHp = wardCap(); wardBroken = false;
    stopFocus();
  }
  /** Story auto-revive (§5.12): back on your feet where you fell, with 50 % HP, after 2 s (no respawn screen). */
  function reviveInPlace() {
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
    const st = entity.statuses || (entity.statuses = {});
    for (const k of Object.keys(st)) { try { game.combat?.clearStatus?.(entity, k); } catch (e) { /* */ } }
    for (const k of Object.keys(st)) delete st[k];
    entity.alive = true; entity.hp = Math.max(1, Math.round(entity.maxHp * AUTO_REVIVE_HP));
    dying = false; PS.deadW = 0; PS.deadTime = 0; PS.hurt = 0; PS.invulT = 2; entity.invulnerable = true;
    resetKitState(); regen.reset();
    root.visible = true; cape.mesh.visible = true;
    if (!game.entities.includes(entity)) game.combat?.register?.(entity);
    ev('playerRespawn', { inPlace: true, autoRevive: true });
    vfxCall('burst', v1.copy(pos).setY(pos.y + 0.9), { count: 20, color: pair('light'), speed: 3, spread: 1, size: 0.11, life: 0.7, shape: 'spark', drag: 2 });
    if (game.state !== 'playing') { if (game.setState) game.setState('playing'); else game.state = 'playing'; }
  }
  function respawn() {
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
    for (const k of Object.keys(entity.statuses || {})) { try { game.combat?.clearStatus?.(entity, k); } catch (e) { /* */ } }
    entity.statuses = entity.statuses || {};
    for (const k of Object.keys(entity.statuses)) delete entity.statuses[k];
    R.refresh(false);
    entity.alive = true; entity.hp = entity.maxHp; R.fill();
    dying = false; PS.deadW = 0; PS.deadTime = 0; PS.hurt = 0; PS.invulT = 1.5; entity.invulnerable = true;
    resetKitState(); regen.reset();
    root.visible = true; cape.mesh.visible = true;
    if (!game.entities.includes(entity)) game.combat?.register?.(entity);
    placeAtSpawn(true);
    if (checkpoint) {
      // face the objective (north) from the checkpoint
      PS.yaw = 0; PS.facing = PS.prevFacing = Math.PI; root.rotation.set(0, PS.facing, 0);
      const A = checkpoint.bossId && checkpoint.bossId !== 'golem' ? W()?.bossArenas?.[checkpoint.bossId] : null;
      if (A?.position) {
        // boss checkpoint: face the arena and get a short grace window to re-engage
        const dx = A.position.x - pos.x, dz = A.position.z - pos.z;
        PS.facing = PS.prevFacing = Math.atan2(dx, dz); PS.yaw = Math.atan2(-dx, -dz);
        root.rotation.set(0, PS.facing, 0);
        PS.invulT = Math.max(PS.invulT, 3);
      }
    }
    ev('playerRespawn', {});
    vfxCall('burst', v1.copy(pos).setY(pos.y + 0.9), { count: 24, color: pair(element), speed: 3.5, spread: 1, size: 0.12, life: 0.8, shape: 'spark', drag: 2 });
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
    clsMelee = !!c && familyOf(c) === 'melee'; clsStyle = c ? styleOf(c) : 'staff';
    kit = kitOf(c);
    setClassOutfit(rig, cg, cape, c);
    try { rig.skin?.refresh?.(); } catch (err) { console.warn('[player] rig refresh', err); }
    entity.name = c ? CLASS_DEFS[c].nameKo : '바람결의 젊은이';
    swordDrawn = false; PS.drawnW = 0;
    weaponVisibility();
    if (kit.defend.type === 'ward') barrier.setColor(WARD_COL, WARD_COL2); else barrier.setColor(elemColor, gemLight);
    R.refresh(prev !== null || R._init);
    resetKitState();
    PS.fidgetNext = 8 + Math.random() * 6; fidgetKind = null;
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
    /** Re-read maxima from game.stats now (keeps fill fractions) instead of waiting for the next statsChanged. */
    refreshStats() { R.refresh(true); },
    /** 'mp' | 'resolve' */
    get resource() { return R.kind; },
    get family() { return familyOf(cls); },
    get style() { return style(); },
    get kit() { return kit; },
    get exhausted() { return R.exhausted; },
    get gliding() { return gliding; }, get sprinting() { return sprinting; },
    get grounded() { return grounded; },
    get blinkCooldown() { return kit.dodge.charges ? 0 : PS.dodgeCd; },
    get blinkCooldownMax() { return kit.dodge.cd || 1; },
    get blinkCost() { return kit.dodge.cost || 0; },
    get element() { return element; },
    get cls() { return cls; },
    get blocking() { return blocking || PS.counterT > 0; },
    get dashing() { return PS.dodgeT > 0; },
    get guardBroken() { return PS.guardBreakT > 0; },
    get counterReady() { return PS.counterReady; },
    get counterTarget() { return counterTarget; },
    consumeCounter() { const t = counterTarget; PS.counterReady = 0; counterTarget = null; return t; },
    get facing() { return PS.facing; },
    get swordDrawn() { return swordDrawn; },
    get focusing() { return focusing; },
    get superArmor() { return PS.superArmorT > 0 || action.superArmor; },
    /** HP regen state (CONTRACT §10.3): {active, delay, delayLeft, inCombat, rate}. Reused object — read only. */
    get regen() { return regen.state; },
    get lastHurtT() { return regen.lastHurtT; }, set lastHurtT(v) { if (Number.isFinite(v)) regen.lastHurtT = v; },
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
      if (on) { api.getWeaponTip('main', v1); vfxCall('burst', v1, { count: 8, color: pair(element), speed: 2, spread: 1, size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 }); }
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
    /** Weapon grip in world space. which 'off' = the left dagger / shield / buckler grip (trail roots). */
    getWeaponBase(which = 'main', out) {
      if (which && which.isVector3) { out = which; which = 'main'; }
      out = out || new THREE.Vector3();
      if (which !== 'off') return api.getSwordBase(out);
      const S = cg.sockets, st = style();
      if (st === 'daggers' && swordDrawn && S.daggers?.L) return S.daggers.L.getWorldPosition(out);
      if (st === 'hammer' && S.shield) return S.shield.getWorldPosition(out);
      if (st === 'bow' && S.bow?.grip) return S.bow.grip.getWorldPosition(out);
      return api.getWeaponTip('off', out);
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
      if (snapGround || pos.y < gh) { pos.y = gh; PS.vy = 0; grounded = true; }
      cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
      root.updateMatrixWorld(true);
    },
    setFacing(a) { PS.facing = PS.prevFacing = a; root.rotation.y = a; },
    spawnGhost(color, life = 0.35, opacity = 0.8) { ghosts.spawn(pos, PS.facing + action.bodyYaw, color, life, opacity); },
    /** Compensated-time factor (CONTRACT §3.3, PLAN §2.5): game.timeScale.comp() — 1/scale while 'focus' or a compensate:true entry (witch, teach) is active. */
    timeComp() {
      const T = ts();
      if (T?.comp) { const c = T.comp(); return Number.isFinite(c) && c > 0 ? c : 1; }
      return 1;
    },
    getDefenseHud() {
      const hud = defHud, D = kit.defend, DG = kit.dodge;
      hud.block.active = blocking || PS.counterT > 0;
      hud.block.perfect = blocking && D.perfect > 0 && PS.blockT <= D.perfect + (statGet('parryWindowAdd', 0) || 0);
      hud.block.type = legacyBlockType(D.type);
      hud.dodgeType = DG.type; hud.defendType = D.type;
      hud.dodgeName = KIT_NAMES[DG.type] || ''; hud.defendName = KIT_NAMES[D.type] || '';
      if (DG.charges) {
        const maxC = DG.charges + (statGet('extraDash', 0) || 0);
        hud.dash.charges = PS.dodgeCharges; hud.dash.maxCharges = maxC;
        hud.dash.cooldownFrac = PS.dodgeCharges < maxC ? clamp(PS.dodgeRecharge / (DG.recharge || 1), 0, 1) : 0;
      } else {
        hud.dash.charges = PS.dodgeCd <= 0 ? 1 : 0; hud.dash.maxCharges = 1; hud.dash.cooldownFrac = clamp(PS.dodgeCd / (DG.cd || 1), 0, 1);
      }
      hud.ward.frac = D.type === 'ward' ? clamp(PS.wardHp / Math.max(1, wardCap()), 0, 1) : 1;
      hud.ward.broken = wardBroken;
      hud.focus = focusing;
      hud.counter = PS.counterT > 0 ? 1 : clamp(1 - PS.counterCd / (D.cd || 1), 0, 1);
      return hud;
    },
    /** New game: put the hero in their home in the village. */
    placeInVillage() {
      checkpoint = null;
      for (const k of Object.keys(entity.statuses || {})) delete entity.statuses[k];
      R.refresh(false);
      entity.alive = true; entity.hp = entity.maxHp; R.fill();
      dying = false; PS.deadW = 0; PS.hurt = 0;
      resetKitState(); regen.reset();
      root.visible = true; cape.mesh.visible = true;
      const home = W()?.village?.playerHome || W()?.playerSpawn;
      if (home) { pos.set(home.x, 0, home.z); try { W()?.resolveCollision?.(pos, entity.radius + 0.3); } catch (e) { /* */ } }
      else pos.set(0, 0, 120);
      pos.y = groundAt(pos.x, pos.z);
      PS.vy = 0; hv.set(0, 0, 0); velocity.set(0, 0, 0); grounded = wasGrounded = true; PS.peakY = pos.y;
      const yawH = W()?.village?.playerHomeYaw;
      PS.facing = PS.prevFacing = Number.isFinite(yawH) ? yawH : Math.PI;
      PS.yaw = PS.facing - Math.PI; PS.pitch = -0.12;
      root.rotation.set(0, PS.facing, 0); root.updateMatrixWorld(true);
      cape.reset(); springs.reset(); camSnap = true;
    },
    get yaw() { return PS.yaw; }, get pitch() { return PS.pitch; },
    /** Test hook: set camera look angles directly. */
    setLook(y, p = PS.pitch) { PS.yaw = y; PS.pitch = clamp(p, PITCH_MIN, PITCH_MAX); },

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
      events.on('bossSpawn', (p) => {
        const w = W();
        const id = p?.id || p?.boss?.bossId || 'golem';
        const A = id !== 'golem' ? w?.bossArenas?.[id] : null;
        if (A?.position && A.radius > 0) {
          // per-boss checkpoint: just outside the arena rim (the boss waits at its phase checkpoint), on the side the player came in from
          let dx = pos.x - A.position.x, dz = pos.z - A.position.z;
          const L = Math.hypot(dx, dz);
          if (L < 1e-3) { dx = 0; dz = 1; } else { dx /= L; dz /= L; }
          const d = A.radius + 4;
          checkpoint = { x: A.position.x + dx * d, z: A.position.z + dz * d, boss: true, bossId: id };
          return;
        }
        const r = w?.bossArena?.rampStart;
        if (r) checkpoint = { x: r.x, z: r.z, boss: true, bossId: 'golem' };
      });
      events.on('gateTravel', () => { camSnap = true; springs.reset(); cape.reset(); });
      // v4: the last enemy hit (after-impact grace) + post-hit protection (§5.8)
      events.on('playerHurt', (p) => {
        if (!p || p.dot) return;
        const amt = +p.amount || 0;
        lastHit.valid = true; lastHit.refunded = false; lastHit.rt = game.realTime; lastHit.t = game.time; lastHit.amount = amt;
        lastHit.attacker = p.source && typeof p.source === 'object' ? p.source : null; lastHit.attack = p.attack || null;
        lastHit.statuses.length = 0;
        const st = p.appliedStatuses; if (st) for (let i = 0; i < st.length; i++) lastHit.statuses.push(st[i]);
        if (amt >= PROTECT_MIN) PS.protectUntil = game.time + PROTECT_SEC;
      });
      // recent tells (witch-time condition: the dodged attack's tell targeted the player)
      events.on('tellStart', (p) => {
        if (!p?.enemy) return;
        const r = tellRing[PS.tellHead]; PS.tellHead = (PS.tellHead + 1) % TELL_RING;
        r.enemy = p.enemy; r.targetsPlayer = p.targetsPlayer !== false; r.rt = game.realTime;
      });
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
    /** +n 투지 (soul orbs, procs). No-op for MP classes. */
    addResolve(n) { R.addResolve(+n || 0); },
    restoreMp(n) { R.mp = clamp(R.mp + (+n || 0), 0, R.maxMp); },
    /** Invulnerability for `seconds` (blink / dash / leap skills), merged with the respawn i-frames. */
    grantIframes(seconds) {
      const s = +seconds || 0; if (s <= 0) return;
      PS.invulT = Math.max(PS.invulT, s); entity.invulnerable = true;
    },
    /** Absorb shield (crystal pickups, light.aegis, crystallize): combat subtracts entity.shieldHp before HP. */
    addShield(amount, seconds = 6, opts = {}) {
      const a = +amount || 0; if (a <= 0) return false;
      entity.shieldHp = Math.max(entity.shieldHp || 0, a); PS.shieldT = Math.max(PS.shieldT, +seconds || 6);
      vfxCall('burst', v1.copy(pos).setY(pos.y + 1.1), { count: 12, shape: 'shard', color: opts?.element ? pair(opts.element) : C_HOLY, speed: 3, spread: 1, size: 0.12, life: 0.4, drag: 2 });
      ev('playerShield', { amount: a, seconds: PS.shieldT });
      return true;
    },
    get shield() { return entity.shieldHp || 0; },
    /** wind.step: give back n dash pips (charge-based dodges only). */
    refundDash(n = 1) {
      const DG = kit.dodge; if (!DG.charges) { PS.dodgeCd = 0; return; }
      const maxC = DG.charges + (statGet('extraDash', 0) || 0);
      PS.dodgeCharges = Math.min(maxC, PS.dodgeCharges + (n | 0 || 1));
    },
    /** Start gliding right away when airborne (wind.m3b). The glide continues while Space is held, as usual. */
    startGlide() {
      if (grounded || gliding || statGet('noGlide', false)) return false;
      PS.airTime = Math.max(PS.airTime, 0.3); PS.vy = Math.min(PS.vy, 0.4);
      gliding = true; ev('glideStart', { position: pos.clone() });
      return true;
    },

    getStaffTip(out = new THREE.Vector3()) {
      if (rig.staff?.visible || !cls) return rig.gemPivot.getWorldPosition(out);
      return api.getWeaponTip('main', out);
    },

    getAim() {
      const origin = api.getWeaponTip('main', new THREE.Vector3());
      const start = v1.copy(camPos).addScaledVector(camFwd, Math.max(0.5, PS.camDist * 0.95));
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
        // P1 aim assist (settings.aimAssist 끔 / 약 / 강): a wider cone around the crosshair picks the enemy centre
        const aa = game.settings?.values?.aimAssist;
        let bestCos = aa === 'strong' ? AIM_CONE_STRONG : aa === 'weak' ? AIM_CONE_WEAK : AIM_CONE;
        for (const e of game.entities) {
          if (!e || e.team !== 'enemy' || !e.alive || !e.object) continue;
          const c = e.getCenter ? e.getCenter(v2) : v2.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5);
          v3.subVectors(c, camPos);
          const d = v3.length();
          if (d < 1 || d > 120) continue;
          const cs = v3.dot(camFwd) / d;
          if (cs <= bestCos) continue;
          if (best < Infinity && d > best + PS.camDist + 3) continue; // occluded by terrain
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
      castKind = kind; PS.castT = 0; PS.castRecent = CAST_DUR[kind] + 0.45;
      PS.gemFlare = 1; fidgetKind = null;
      if (kind === 'bowRelease') { PS.stringVel = -6; }
      api.getWeaponTip('main', v4);
      vfxCall('burst', v4, { count: kind === 'basic' || kind === 'bowRelease' ? 6 : 12, color: pair(element), speed: 2.5, spread: 1, size: 0.1, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 3 });
    },

    setCharging(active, el, frac = 0) {
      if (el) setStaffElement(el);
      const was = charging;
      charging = !!active && entity.alive && !dying;
      PS.chargeFrac = clamp(frac || 0, 0, 1);
      chargeEl = el || element;
      if (charging) { PS.castRecent = Math.max(PS.castRecent, 0.5); fidgetKind = null; }
      if (was && !charging) PS.chargeFrac = 0;
    },

    setStaffElement,
    respawn,
    /** Test/debug: per-frame internals (read only). */
    debugState() {
      return { cls, kit: kit.dodge.type + '/' + kit.defend.type, dodgeT: PS.dodgeT, dodgeIframeT: PS.dodgeIframeT, blocking, counterT: PS.counterT, focusing, decoyT: PS.decoyT, wardHp: PS.wardHp, superArmorT: PS.superArmorT, platform: !!platformHandle, ikDrop: footIK.drop, springs: springs.stats(),
        pending: pending.on ? { kind: pending.kind, noInfo: pending.noInfo, left: pending.until - (game.enemyTime ?? game.time), targetsPlayer: pending.targetsPlayer } : null,
        buffer: inputBuf.action, protect: Math.max(0, PS.protectUntil - game.time), witchReadyIn: Math.max(0, PS.witchReadyAt - game.realTime), dodgeDir: { x: dodgeDir.x, z: dodgeDir.z },
        animFrozen: animFrozen(), revive: PS.reviveT };
    },
    /** v4 (§7.4.8): the queued dodge / defend press {action, t} or null (reused view). */
    get inputBuffer() { if (!inputBuf.action) return null; inputBuf.view.action = inputBuf.action; inputBuf.view.t = inputBuf.t; return inputBuf.view; },
    /** v4: the last enemy hit {t, amount, attacker, attack, appliedStatuses} (t = game.realTime) or null (reused view). */
    get lastEnemyHit() {
      if (!lastHit.valid) return null;
      const v = lastHit.view; v.t = lastHit.rt; v.amount = lastHit.amount; v.attacker = lastHit.attacker; v.attack = lastHit.attack; v.appliedStatuses = lastHit.statuses;
      return v;
    },
    /** v4 sub-steps (PLAN §2.5, core-b): gameplay runs every sub-step, the visual block only on game.frame.lastStep. */
    substeps: true,
    /** v4 per-entity hitstop: the animation freezes while game.realTime < hitstopUntil (also honours entity.hitstopUntil and game.playerHitstopUntil). */
    get hitstopUntil() { return Math.max(PS.hitstopUntil, entity.hitstopUntil || 0, game.playerHitstopUntil || 0); },
    set hitstopUntil(v) { PS.hitstopUntil = Number.isFinite(+v) ? +v : 0; },
    /** v4 combat camera state (read only): {hint, dist, fov, combat, bossTell, shoulder}. */
    camera: camInfo,
    /** null (default: combat framing eases in near aggroed enemies) | 'explore' (pinned out-of-combat framing, for captures). */
    framing: null,

    update(dt, realDt) {
      const gameDt = dt;
      dt *= api.timeComp();
      const t = game.time;
      const combat = game.combat;
      let canAct = entity.alive && !dying && PS.guardBreakT <= 0;
      try { if (canAct && combat?.canAct) canAct = combat.canAct(entity) !== false; } catch (e) { /* */ }
      let sm = 1;
      try { sm = combat?.speedMul ? (combat.speedMul(entity) ?? 1) : 1; } catch (e) { /* */ }
      const melee = isMelee();
      const DG = kit.dodge, D = kit.defend;

      // ---------- camera look input ----------
      if (!dying) {
        const sv = game.settings?.values;
        const sens = SENS * (Number.isFinite(sv?.mouseSens) ? sv.mouseSens : 1);
        PS.yaw -= input.mouseDX * sens;
        PS.pitch = clamp(PS.pitch - input.mouseDY * sens * (sv?.invertY ? -1 : 1), PITCH_MIN, PITCH_MAX);
      }
      camFwd.set(-Math.sin(PS.yaw) * Math.cos(PS.pitch), Math.sin(PS.pitch), -Math.cos(PS.yaw) * Math.cos(PS.pitch));
      camRight.set(Math.cos(PS.yaw), 0, -Math.sin(PS.yaw));

      // ---------- timers ----------
      if (PS.dodgeCd > 0) PS.dodgeCd = Math.max(0, PS.dodgeCd - dt);
      if (PS.invulT > 0) { PS.invulT -= dt; if (PS.invulT <= 0) entity.invulnerable = false; }
      if (PS.shieldT > 0) { PS.shieldT -= dt; if (PS.shieldT <= 0 || !(entity.shieldHp > 0)) { PS.shieldT = 0; entity.shieldHp = 0; } }
      // i-frames / super armour / parry windows run on game time (uncompensated): under a compensated slow motion (witch,
      // teaching) the player moves at full speed while the protection keeps pace with the slowed enemies
      if (PS.dodgeIframeT > 0) PS.dodgeIframeT -= gameDt;
      if (PS.superArmorT > 0) PS.superArmorT -= gameDt;
      PS.castRecent = Math.max(0, PS.castRecent - dt);
      PS.gemFlare = Math.max(0, PS.gemFlare - dt * 2.2);
      PS.hurt = Math.max(0, PS.hurt - dt * 3.2);
      PS.squash = Math.max(0, PS.squash - dt * 4);
      PS.wLand = Math.max(0, PS.wLand - dt * 2.2);
      PS.jumpBuffer = Math.max(0, PS.jumpBuffer - dt);
      if (castKind) { PS.castT += dt; if (PS.castT >= CAST_DUR[castKind]) castKind = null; }
      if (PS.guardBreakT > 0) PS.guardBreakT -= dt;
      if (PS.counterReady > 0) { PS.counterReady -= realDt; if (PS.counterReady <= 0) counterTarget = null; }
      if (PS.counterT > 0) { PS.counterT -= gameDt; if (PS.counterT <= 0) PS.counterCd = D.cd ?? 1; }
      else if (PS.counterCd > 0) PS.counterCd -= dt;
      PS.perfectFx = Math.max(0, PS.perfectFx - realDt * 2);
      if (DG.charges) {
        const maxC = DG.charges + (statGet('extraDash', 0) || 0);
        if (PS.dodgeCharges > maxC) PS.dodgeCharges = maxC;
        if (PS.dodgeCharges < maxC) { PS.dodgeRecharge -= dt; if (PS.dodgeRecharge <= 0) { PS.dodgeCharges++; PS.dodgeRecharge = PS.dodgeCharges < maxC ? DG.recharge : 0; } }
      }
      // ward capacity recharges over `recharge` seconds once broken (and slowly tops up while lowered)
      if (D.type === 'ward') {
        const cap = wardCap();
        if (wardBroken) { PS.wardRechargeT += gameDt; PS.wardHp = cap * clamp(PS.wardRechargeT / (D.recharge || 8), 0, 1); if (PS.wardRechargeT >= (D.recharge || 8)) { wardBroken = false; PS.wardHp = cap; } }
        else if (!blocking) PS.wardHp = Math.min(cap, PS.wardHp + cap / (D.recharge || 8) * gameDt);
      }
      if (PS.decoyT > 0) {
        PS.decoyT -= gameDt;
        PS.decoyFxT -= gameDt;
        if (PS.decoyFxT <= 0) {
          PS.decoyFxT = 0.12;
          v1.set(decoyPos.x + rand(-0.25, 0.25), decoyPos.y + 0.8 + Math.sin(t * 3) * 0.15, decoyPos.z + rand(-0.25, 0.25));
          vfxCall('burst', v1, DECOY_WISP);
        }
        if (PS.decoyT <= 0) { try { game.enemies?.clearTauntTarget?.(); } catch (_) { /* */ } vfxCall('burst', v1.copy(decoyPos).setY(decoyPos.y + 0.9), { count: 10, color: C_SPIRIT, speed: 1.5, spread: 1, size: 0.08, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 2 }); }
      }
      if (PS.mageRuneT > 0) {
        PS.mageRuneT -= gameDt;
        if (PS.mageRuneT <= 0) mageRuneBurst();
      }
      if (!melee && action.active) action.active = false;

      // ---------- move intent ----------
      const ix = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      const iz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      v1.set(-Math.sin(PS.yaw), 0, -Math.cos(PS.yaw));
      wish.set(0, 0, 0).addScaledVector(camRight, ix).addScaledVector(v1, iz);
      if (wish.lengthSq() > 1) wish.normalize();
      wishRaw.copy(wish);                       // the held direction, before action / stun scaling (dodges follow it)
      if (!canAct) wish.set(0, 0, 0);
      const actOn = melee && action.active;
      if (actOn) wish.multiplyScalar(action.move);
      const moving = wish.lengthSq() > 0.01;

      // ---------- defend / dodge input (keymap actions, 0.25 s buffer; §5.8) ----------
      const skillsOn = !!cls && game.progression?.chosen !== false;
      // gates: melee writes action.dodgeCancelable (combo locks), magic writes spells.castLock (non-cancellable recovery)
      const castLock = +game.spells?.castLock || 0;
      const dodgeOk = (!actOn || action.cancelable || action.dodgeCancelable) && !(castLock > 0);
      blockHeld = kDown('defend') && canAct && skillsOn;
      const defendPress = skillsOn && kPressed('defend');
      const dodgePress = skillsOn && (kPressed('dodge') || kPressed('dodgeAlt'));
      const dt0 = D.type;
      if (dt0 === 'focus') {
        // 집중: hold defend while airborne / gliding / just after a dodge → time ×0.35 (refreshed every frame)
        const inWin = !grounded || gliding || t - PS.dodgeEndT <= (D.afterDodge ?? 0.6) || PS.dodgeT > 0;
        const want = blockHeld && R.stamina > (focusing ? 0 : (D.minStam ?? 4)) && !R.exhausted && inWin;
        if (want) {
          if (!focusing) startFocus();
          try { ts()?.set?.('focus', D.scale ?? 0.35, D.refresh ?? 0.2); } catch (_) { /* */ }
          if (!R.drainStamina(D.drain ?? 25, realDt)) stopFocus();
        } else stopFocus();
      } else if (dt0 === 'counter') {
        if (defendPress) {
          if (canAct && dodgeOk) { const r = startCounter(); if (r === 'stamina') rejectPress('defend', 'stamina'); else if (r !== 'ok') bufferPress('defend', r); }
          else bufferPress('defend', 'locked');
        }
      } else if (blocking) {
        PS.blockT += gameDt;
        if (!blockHeld || !canAct) breakBlock();
        else if (dt0 === 'barrier') {
          R.mp -= (D.drain ?? 6) * dt; R.lastMpSpend = t;
          if (R.mp <= 0) { R.mp = 0; breakBlock(); }
        } else R.lastStamUse = t;
      } else if (blockHeld && dt0 !== 'none') {
        if (dodgeOk && inputBuf.action !== 'defend') {
          if (canStartBlock()) startBlock();
          else if (defendPress) { game.audio?.play?.(dt0 === 'barrier' ? 'mana_empty' : 'guard_break', { volume: 0.4 }); rejectPress('defend', 'stamina'); }
        } else if (defendPress) bufferPress('defend', 'locked');
      }

      if (kPressed('jump') && canAct && !(actOn && !action.cancelable)) PS.jumpBuffer = 0.12;
      if (dodgePress) {
        if (dodgeOk) {
          const r = tryDodge(canAct);
          if (r === 'stamina') rejectPress('dodge', 'stamina');
          else if (r === 'locked' || r === 'cooldown') bufferPress('dodge', r);
        } else bufferPress('dodge', 'locked');
      }
      // ---------- input buffer: the first allowed frame within 0.25 s executes the press, else dodgeRejected ----------
      if (inputBuf.action) {
        const waited = game.realTime - inputBuf.t;
        const a = inputBuf.action;
        let done = false, reason = inputBuf.reason;
        if (!skillsOn || dying) { inputBuf.action = null; }
        else if (dodgeOk && !(a === 'dodge' && dodgePress && waited <= 0)) {
          if (a === 'dodge') {
            const r = tryDodge(canAct, inputBuf.t);
            if (r === 'ok') done = true; else if (r === 'stamina') { inputBuf.action = null; rejectPress('dodge', 'stamina'); } else reason = r;
          } else if (dt0 === 'counter') {
            if (canAct) { const r = startCounter(inputBuf.t); if (r === 'ok') done = true; else if (r === 'stamina') { inputBuf.action = null; rejectPress('defend', 'stamina'); } else reason = r; }
          } else if (dt0 !== 'none' && dt0 !== 'focus' && canAct) {
            if (blocking || !blockHeld) done = true;                 // released before the gate opened: nothing to hold
            else if (startBlock(inputBuf.t)) done = true;
            else { inputBuf.action = null; rejectPress('defend', 'stamina'); }
          } else if (dt0 === 'focus' || dt0 === 'none') inputBuf.action = null;
        }
        if (done) { inputBuf.action = null; ev('dodgeBuffered', { action: a, waited }); }
        else if (inputBuf.action) {
          inputBuf.reason = reason;
          if (waited > BUFFER_SEC) { inputBuf.action = null; rejectPress(a, reason === 'cooldown' ? 'cooldown' : 'locked'); }
        }
      }
      if (pending.on && (pending.noInfo ? game.time - pending.t0 > pending.win + 0.05 : (game.enemyTime ?? game.time) > pending.until + 0.05)) pending.on = false;

      // ---------- death ----------
      if (dying) {
        PS.deadTime += dt;
        PS.deadW = Math.min(1, PS.deadW + dt * 2.2);
        if (assist()?.autoRevive) {
          // 이야기 difficulty: revive in place with 50 % HP after 2 s instead of the respawn screen (§5.12)
          PS.reviveT += gameDt;
          if (PS.reviveT >= AUTO_REVIVE_SEC) reviveInPlace();
        } else if (PS.deadTime > 1.5 && game.state === 'playing') {
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
        PS.dodgeT -= dt;
        const k = 1 - Math.max(0, PS.dodgeT) / PS.dodgeDur;
        const e = 1 - (1 - k) * (1 - k);
        const ox = pos.x, oy = pos.y, oz = pos.z;
        pos.lerpVectors(blinkFrom, blinkTo, e);
        cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
        root.visible = false; cape.mesh.visible = false;
        PS.ghostTimer -= dt;
        if (PS.ghostTimer <= 0) { PS.ghostTimer = 0.05; ghosts.spawn(pos, PS.facing, DG.type === 'spiritswap' ? SPIRIT_COL : elemColor, 0.38, 0.75); }
        if (PS.dodgeT <= 0) { PS.dodgeT = 0; endBlink(); }
        PS.vy = 0; grounded = PS.dodgeT > 0 ? grounded : pos.y <= groundAt(pos.x, pos.z, pos.y + 0.3) + 0.01;
      } else {
        // ---------- stamina / sprint ----------
        const wantSprint = kDown('sprint') && moving && grounded && !R.exhausted && canAct && !charging && !blocking && !actOn && PS.dodgeT <= 0;
        sprinting = wantSprint && R.stamina > 0;
        // ---------- water ----------
        let gh = groundAt(pos.x, pos.z, pos.y);
        depth = waterDepth(pos.x, pos.z, gh);
        const swimming = depth > DEEP_WATER;
        const wade = depth > 0 ? clamp(1 - depth * 0.45, 0.45, 1) : 1;

        let speed = sprinting ? SPRINT : WALK;
        if (charging) speed *= 0.55;
        else if (castKind || PS.castRecent > 0.3) speed *= 0.8;
        if (blocking) speed *= D.moveMul ?? 0.55;
        if (PS.wLand > 0.2) speed *= 1 - PS.wLand * 0.6;
        speed *= sm * wade * (statGet('moveMul', 1) || 1) * (CLASS_DEFS[cls]?.base?.move || 1);
        if (swimming) speed = Math.min(speed, 2.6);

        // ---------- jump ----------
        if (grounded) { PS.coyote = 0.12; PS.airTime = 0; } else { PS.coyote -= dt; PS.airTime += dt; }
        if (grounded) PS.airJumps = 0;
        const extraJumps = statGet('extraJumps', 0) || 0;
        if (PS.jumpBuffer > 0 && PS.coyote <= 0 && !grounded && extraJumps > 0 && PS.airJumps < extraJumps && canAct && !swimming && !gliding && PS.airTime > 0.1) {
          PS.airJumps++; PS.vy = JUMP_VEL * 0.95; PS.jumpBuffer = 0; PS.airTime = 0.05; PS.peakY = pos.y;
          ev('jump', { position: pos.clone(), double: true });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.1), { count: 12, color: pair('wind'), speed: 3, spread: 0.3, dir: v2.set(0, -1, 0), size: 0.1, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 3 });
          vfxCall('shockwave', v1, { color: elColor('wind'), radius: 1.6, duration: 0.3, opacity: 0.7, thickness: 0.12 });
        }
        if (PS.jumpBuffer > 0 && PS.coyote > 0 && canAct && !swimming) {
          PS.vy = JUMP_VEL; grounded = false; PS.coyote = 0; PS.jumpBuffer = 0;
          ev('jump', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.05), { count: 6, color: 0xe9dfc4, speed: 1.4, spread: 0.7, dir: UP, size: 0.3, sizeEnd: 0.7, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
        }

        // ---------- glide ----------
        const heightAbove = pos.y - (depth > 0 ? Math.max(gh, wl) : gh);
        const infGlide = !!statGet('infiniteGlide', false);
        const canGlide = !grounded && kDown('jump') && canAct && (!R.exhausted || infGlide) && (R.stamina > 0 || infGlide) && PS.airTime > 0.22 && (gliding || PS.vy < 0.5) && heightAbove > 0.9
          && !(actOn && action.noGlide) && !statGet('noGlide', false) && PS.dodgeT <= 0 && !blocking;
        if (canGlide && !gliding) {
          gliding = true; ev('glideStart', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y - 0.1), { count: 14, color: pair(element), speed: 3, spread: 0.25, dir: v2.set(0, -0.2, 0), size: 0.1, life: 0.6, shape: 'spark', drag: 2 });
        } else if (!canGlide && gliding) endGlide();

        // ---------- horizontal ----------
        if (PS.dodgeT > 0) {
          const k = 1 - PS.dodgeT / PS.dodgeDur;
          const dist = DG.dist * (statGet('dashDistMul', 1) || 1);
          const v = (dist / (PS.dodgeDur * 0.7)) * (1 - 0.6 * k);
          hv.copy(dodgeDir).multiplyScalar(v);
          PS.dodgeT -= dt;
          PS.ghostT2 -= dt;
          const gcol = DG.type === 'shadowroll' ? SHADOW_COL : DG.type === 'shieldstep' ? HOLY_COL : PS.perfectFx > 0 ? DODGE_COL : DASH_COL;
          if (PS.ghostT2 <= 0) { PS.ghostT2 = DG.type === 'shieldstep' ? 0.07 : 0.045; ghosts.spawn(pos, PS.facing, gcol, 0.3, DG.type === 'shadowroll' ? 0.75 : 0.55); }
          if (PS.dodgeT <= 0) { PS.dodgeT = 0; hv.copy(dodgeDir).multiplyScalar(WALK * 0.7); PS.squash = Math.max(PS.squash, 0.25); PS.dodgeEndT = t; if (DG.type === 'backflip' && talentOn('ranger.t25b')) R.stamina = Math.min(R.maxStamina, R.stamina + 15); }
        } else if (gliding) {
          if (moving) v2.copy(wish).multiplyScalar(GLIDE_SPEED * sm);
          else v2.set(Math.sin(PS.facing), 0, Math.cos(PS.facing)).multiplyScalar(GLIDE_SPEED * 0.55 * sm);
          hv.x = damp(hv.x, v2.x, 2.2, dt); hv.z = damp(hv.z, v2.z, 2.2, dt);
        } else {
          const lam = grounded ? (moving ? 12 : 16) : 3.5;
          const tx = wish.x * speed, tz = wish.z * speed;
          if (grounded || moving) { hv.x = damp(hv.x, tx, lam, dt); hv.z = damp(hv.z, tz, lam, dt); }
        }

        // ---------- vertical ----------
        // fold external vertical velocity (launch) into own vy
        if (Math.abs(velocity.y) > 1e-4) { PS.vy += velocity.y; velocity.y = 0; if (PS.vy > 0) grounded = false; }
        if (actOn && Number.isFinite(action.setVy)) { PS.vy = action.setVy; if (PS.vy > 0) grounded = false; }
        const vyBefore = PS.vy;
        if (!grounded) {
          if (gliding) {
            if (PS.vy < -GLIDE_FALL) PS.vy = damp(PS.vy, -GLIDE_FALL, 6, dt);
            else PS.vy = Math.max(PS.vy - GRAVITY * 0.25 * dt, -GLIDE_FALL);
            // rising heat from burning grass / spirit updrafts lift the glider (BotW updraft)
            let up = 0;
            try { up = W()?.surface?.getUpdraft?.(pos) || 0; } catch (e) { up = 0; }
            if (up > 0) {
              PS.vy = Math.min(PS.vy + up * dt, UPDRAFT_VY_CAP);
              PS.updraftT = 0.25;
              if (!inUpdraft) { inUpdraft = true; ev('updraftEnter', { position: pos.clone() }); }
              if (Math.random() < 0.3) { UPDRAFT.dir = UP; vfxCall('burst', v1.set(pos.x + rand(-0.8, 0.8), pos.y - 0.6, pos.z + rand(-0.8, 0.8)), UPDRAFT); }
            } else if (inUpdraft) { PS.updraftT -= dt; if (PS.updraftT <= 0) { inUpdraft = false; ev('updraftExit', { position: pos.clone() }); } }
          } else PS.vy -= GRAVITY * dt * (actOn ? action.gravityMul : 1);
          PS.peakY = Math.max(PS.peakY, pos.y);
        }

        // ---------- integrate ----------
        pos.x += (hv.x + velocity.x + (actOn ? action.vel.x : 0)) * dt;
        pos.z += (hv.z + velocity.z + (actOn ? action.vel.z : 0)) * dt;
        pos.y += PS.vy * dt;
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
            // (tooSteep is a createPlayer-level helper: a closure here would move this frame's locals into a heap context)
            if (tooSteep(pos.x, pos.z, prevX, prevZ, yh, g0) && g1 > g0) {
              // slide along the contour: try each axis separately
              if (!tooSteep(pos.x, prevZ, prevX, prevZ, yh, g0)) pos.z = prevZ;
              else if (!tooSteep(prevX, pos.z, prevX, prevZ, yh, g0)) pos.x = prevX;
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
        const snap = wasGrounded && PS.vy <= 0 ? 0.45 : 0;
        if (pos.y <= floor + snap && PS.vy <= 0) {
          pos.y = floor;
          if (!wasGrounded && PS.airTime > 0.12) {
            const impact = Math.min(vyBefore, PS.vy);
            PS.squash = clamp(-impact / 16, 0.2, 1);
            const fell = PS.peakY - pos.y;
            ev('land', { position: pos.clone(), height: fell });
            if (fell > HARD_LAND_H && !gliding && PS.dodgeT <= 0) {
              // hard landing: recovery crouch (DESIGN §9 A9)
              PS.wLand = 1; PS.squash = 1;
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
          PS.vy = 0; grounded = true; PS.peakY = pos.y;
        } else grounded = false;
        // stand-on platforms (CONTRACT §10.5): carry handle.delta when the platform under us moved
        platformHandle = null;
        if (grounded) {
          try { platformHandle = W()?.platformAt?.(pos.x, pos.z, pos.y) || null; } catch (_) { platformHandle = null; }
          const d = platformHandle?.delta;
          if (d && (d.x || d.y || d.z)) { pos.add(d); cape.shift(d.x, d.y, d.z); }
        }

        // ---------- stamina ----------
        if (sprinting) { if (!(statGet('freeSprintOOC', false) && !regen.inCombat())) { R.drainStamina(SPRINT_STAM, dt); staminaBusy = true; } }
        else if (gliding) { if (!infGlide) R.drainStamina((inUpdraft ? GLIDE_STAM_UPDRAFT : GLIDE_STAM) * (statGet('glideStamMul', 1) || 1), dt); staminaBusy = true; }
        else if (blocking && (D.type === 'guard' || D.type === 'shield')) { R.lastStamUse = t; staminaBusy = true; }
        else if (focusing) staminaBusy = true;
        if (R.exhausted) { sprinting = false; if (!infGlide) endGlide(); }

        // ---------- water fx ----------
        if (depth > 0.05 && grounded || depth > DEEP_WATER) {
          PS.wadeT -= dt;
          if (PS.wadeT <= 0 && hv.lengthSq() > 2) {
            PS.wadeT = 0.12;
            WADE.dir = UP;
            vfxCall('burst', v1.set(pos.x, wl + 0.02, pos.z), WADE);
          }
        }
      }
      entity.grounded = grounded;
      wasGrounded = grounded;

      // ---------- resources (MP / 투지 / stamina), then HP regen (game time) ----------
      R.update(gameDt, grounded, staminaBusy);
      regen.update(gameDt);

      // ---------- facing ----------
      const aimStance = kit.aim && (charging || PS.castRecent > 0 || (blocking && (D.type === 'barrier' || D.type === 'ward')) || (D.type === 'focus' && blockHeld)) && !dying;
      const hspeed = Math.hypot(hv.x, hv.z);
      let target = PS.facing, turnL = aimStance ? 22 : (gliding ? 5 : 12);
      if (aimStance) target = PS.yaw + Math.PI;
      else if (actOn && action.facing != null) { target = action.facing; turnL = action.turn; }
      else if (melee && (blocking || PS.counterT > 0)) { target = PS.yaw + Math.PI; turnL = 16; }
      else if (actOn) target = PS.facing;
      else if (PS.dodgeT > 0) target = PS.facing;
      else if (hspeed > 0.6 && !blinking) target = Math.atan2(hv.x, hv.z);
      PS.prevFacing = PS.facing;
      if (!dying && canAct) PS.facing = dampAngle(PS.facing, target, turnL, dt);
      root.rotation.set(0, PS.facing + (actOn ? action.bodyYaw : 0), 0);
      PS.turnRate = dt > 0 ? damp(PS.turnRate, angleDiff(PS.prevFacing, PS.facing) / dt, 10, dt) : PS.turnRate;
      // turn lean (≤ 12°) + glide bank
      PS.bank = damp(PS.bank, clamp(-PS.turnRate * 0.045 * clamp(hspeed / 6, 0, 1.4), -0.21, 0.21) + (gliding ? clamp(-PS.turnRate * 0.12, -0.45, 0.45) : 0), 8, dt);

      // ---------- footsteps ----------
      const gSpeed = grounded && !blinking && PS.dodgeT <= 0 ? hspeed : 0;
      const stride = 2.0 + gSpeed * 0.09;
      PS.phase += (gSpeed / stride) * Math.PI * 2 * dt;
      if (gSpeed < 0.3) PS.phase = damp(PS.phase, Math.round(PS.phase / Math.PI) * Math.PI, 6, dt);
      const s = Math.sin(PS.phase);
      if (gSpeed > 1 && Math.sign(s) !== Math.sign(PS.lastSin) && PS.lastSin !== 0) {
        PS.stepSide = -PS.stepSide;
        v1.set(Math.cos(PS.facing), 0, -Math.sin(PS.facing)).multiplyScalar(0.1 * PS.stepSide).add(pos);
        ev('footstep', { position: v1.clone() });
        if (gSpeed > 6.5 && depth <= 0.05) {
          v1.y += 0.04;
          STEP_DUST.dir = v2.set(-hv.x, 2, -hv.z).normalize();
          vfxCall('burst', v1, STEP_DUST);
        }
      }
      PS.lastSin = s;

      // ---------- visual-only work below: once per frame on game.frame.lastStep (frameDt), frozen while a per-entity hitstop
      // holds on the player (input buffering above keeps running) — PLAN §2.5 ----------
      const FRM = game.frame;
      if (FRM && FRM.lastStep === false) return;
      if (FRM && FRM.n > 1 && FRM.frameDt > 0) { dt = FRM.frameDt * api.timeComp(); realDt *= FRM.n; }   // sub-steps: the whole frame
      if (animFrozen()) { updateCamera(realDt); return; }

      // ---------- idle fidgets (8–14 s of standing still) ----------
      const idle = grounded && gSpeed < 0.3 && !castKind && !charging && !blocking && !actOn && PS.dodgeT <= 0 && !dying && PS.castRecent <= 0 && !!cls;
      if (idle) {
        PS.idleT += dt;
        if (!fidgetKind && PS.idleT > PS.fidgetNext && kit.idleFidget && FIDGETS[kit.idleFidget]) { fidgetKind = kit.idleFidget; PS.fidgetT = 0; }
      } else { PS.idleT = 0; if (fidgetKind && PS.fidgetT < 0.85 * FIDGETS[fidgetKind].dur) fidgetKind = null; }
      if (fidgetKind) {
        PS.fidgetT += dt;
        if (PS.fidgetT >= FIDGETS[fidgetKind].dur) { fidgetKind = null; PS.idleT = 0; PS.fidgetNext = 8 + Math.random() * 6; }
      }

      // ---------- animation weights ----------
      PS.speedFrac = damp(PS.speedFrac, clamp(gSpeed / WALK, 0, 1.7), 10, dt);
      PS.wSprint = damp(PS.wSprint, sprinting ? 1 : 0, 6, dt);
      PS.wAir = damp(PS.wAir, !grounded && !gliding && !blinking ? 1 : 0, grounded ? 14 : 7, dt);
      PS.wGlide = damp(PS.wGlide, gliding ? 1 : 0, 6, dt);
      const casterBlockPose = blocking && (D.type === 'barrier' || D.type === 'ward');
      const actionTarget = (castKind || charging || casterBlockPose) && !dying ? 1 : 0;
      PS.wAction = damp(PS.wAction, actionTarget, actionTarget ? 22 : 7, dt);
      const aimingCam = aimStance || (D.type === 'focus' && blockHeld && grounded);
      PS.wAim = damp(PS.wAim, aimingCam ? 1 : 0, 7, realDt);
      PS.wBowAim = damp(PS.wBowAim, style() === 'bow' && (aimingCam || charging) ? 1 : 0, 9, dt);
      PS.wFocus = damp(PS.wFocus, focusing ? 1 : 0, 10, realDt);
      PS.wFov = damp(PS.wFov, sprinting ? 1 : gliding ? 0.6 : 0, 4, realDt);
      const accel = dt > 0 ? (hspeed - PS.lastSpeed) / dt : 0; PS.lastSpeed = hspeed;
      PS.accelF = damp(PS.accelF, clamp(accel, -20, 20), 8, dt);
      PS.aimPitch = damp(PS.aimPitch, -PS.pitch, 8, dt);

      // local velocity for robe billow
      const cf = Math.cos(PS.facing), sf = Math.sin(PS.facing);
      const lvx = hv.x * cf - hv.z * sf, lvz = hv.x * sf + hv.z * cf;

      const A = animState;
      A.t = t; A.dt = Math.min(dt, 1 / 30); A.phase = PS.phase;
      A.amp = clamp(gSpeed / WALK, 0, 1) * 0.55 + PS.wSprint * 0.22;
      A.speedFrac = PS.speedFrac; A.wSprint = PS.wSprint; A.wAir = PS.wAir; A.wGlide = PS.wGlide; A.wAction = PS.wAction;
      A.castKind = castKind; A.castT01 = castKind ? PS.castT / CAST_DUR[castKind] : 0;
      if (!castKind && PS.wAction > 0.01 && !charging) A.castKind = A._lastKind || null, A.castT01 = 1;
      if (castKind) A._lastKind = castKind;
      if (charging || casterBlockPose) A.castKind = null;
      A.chargeFrac = PS.chargeFrac; A.hurt = PS.hurt; A.squash = PS.squash;
      A.dead = PS.deadW < 1 ? PS.deadW * PS.deadW * (3 - 2 * PS.deadW) : 1;
      A.bank = PS.bank; A.vy = grounded ? 0 : PS.vy; A.localVx = lvx; A.localVz = lvz;
      A.aimPitch = PS.aimPitch;
      A.flare = clamp(PS.wGlide * 0.9 + (grounded ? 0 : clamp(-PS.vy / 14, 0, 0.7)), 0, 1);
      A.flutter = clamp(PS.wGlide + PS.wSprint * 0.4 + clamp(-PS.vy / 20, 0, 0.5), 0, 1.5);
      A.accel = PS.accelF * 0.05;
      A.stance = kit.stance;
      A.dodgePose = PS.dodgeT > 0 && !blinking ? (DODGE_POSES[DG.type] || 'none') : 'none';
      A.dodgeT01 = PS.dodgeT > 0 && PS.dodgeDur > 0 ? 1 - PS.dodgeT / PS.dodgeDur : 0;
      A.landW = PS.wLand > 0 ? Math.min(1, PS.wLand * 1.6) : 0;
      A.fidget = fidgetKind; A.fidgetT01 = fidgetKind ? PS.fidgetT / FIDGETS[fidgetKind].dur : 0;
      // head look-at toward the camera aim (only when the aim is in front; fades while acting)
      const la = angleDiff(PS.facing, PS.yaw + Math.PI);
      A.lookYaw = Math.abs(la) < 1.9 ? la : 0; A.lookPitch = -PS.pitch * 0.8; A.lookW = (1 - PS.wSprint * 0.6) * (dying ? 0 : 1) * (actOn ? 0.3 : 1);
      A.bowAim = PS.wBowAim; A.focusW = style() === 'bow' ? PS.wFocus : 0;
      // ---------- melee stance / action pose ----------
      if (melee && (actOn || blocking || PS.counterT > 0)) { if (!swordDrawn) { swordDrawn = true; } }
      PS.drawnW = damp(PS.drawnW, melee && swordDrawn && !dying ? 1 : 0, 18, dt || realDt);
      weaponVisibility();
      if (melee) {
        const ST = meleeStance(kit.stance);
        if (blocking || PS.counterT > 0) lerpPose(stancePose, ST.idle, ST.guard, 1);
        else {
          lerpPose(stancePose, ST.idle, ST.run, clamp(PS.speedFrac / 1.4, 0, 1) * (1 - PS.wAir) * (1 - PS.wGlide));
          if (PS.wAir > 0.01) lerpPose(stancePose, stancePose, ST.air, PS.wAir);
          if (PS.wGlide > 0.01) lerpPose(stancePose, stancePose, ST.glide, PS.wGlide);
        }
        lerpPose(finalPose, stancePose, action.pose, actOn ? action.poseW : 0);
        const w = PS.drawnW;
        A.swTw = finalPose[6] * w; A.swTl = finalPose[7] * w; A.swCr = finalPose[8] * w; A.swHy = finalPose[9] * w;
        A.swHd = finalPose[14] * w; A.swBk = finalPose[15] * w;
        if (actOn || blocking || PS.counterT > 0) { A.wAction = 0; A.castKind = null; }
      } else { A.swTw = A.swTl = A.swCr = A.swHy = A.swHd = A.swBk = 0; }
      anim.update(A);
      if (melee && PS.drawnW > 0.001) {
        applySwordArms(rig, gear, finalPose, PS.drawnW);
        // hammer / right dagger follow the pose's blade orientation (the sword group carries it)
        const S = cg.sockets;
        if (S.hammerHand?.visible) S.hammerHand.quaternion.copy(gear.sword.quaternion);
        if (S.daggers?.R.visible) S.daggers.R.quaternion.copy(gear.sword.quaternion);
      }
      root.updateMatrixWorld(true);
      // ---------- foot IK (stance-weighted, grounded only) ----------
      const ikW = grounded && !blinking && !dying && PS.dodgeT <= 0 && !gliding ? clamp(1 - PS.speedFrac * 0.35, 0.3, 1) : 0;
      if (ikW > 0 || footIK.weight > 0.01) { footIK.update(groundAt, ikW, dt); root.updateMatrixWorld(true); }
      // ---------- bow string (follows the draw hand) + arrow ----------
      if (cg.sockets.bow && rig.bow?.visible) updateBowString(dt);
      // ---------- spring chains ----------
      springCtx.legF = Math.max(0, -anim.legL, -anim.legR); springCtx.legB = Math.max(0, anim.legL, anim.legR);
      springCtx.wind = clamp(PS.wGlide + PS.wSprint * 0.6 + PS.speedFrac * 0.3, 0, 1.5);
      gust.set(Math.sin(t * 0.7) * 1.2, 0, Math.cos(t * 0.53) * 1.2);
      springs.update(dt, springCtx);
      if (melee) {
        gear.edgeMat.uniforms.uTime.value = t;
        const ei = 0.55 + (actOn ? 0.45 : 0) + PS.perfectFx * 0.8 + (PS.counterReady > 0 ? 0.6 : 0);
        gear.edgeMat.uniforms.uIntensity.value = damp(gear.edgeMat.uniforms.uIntensity.value, ei, 10, realDt);
      }
      barrier.update(realDt, blocking && (D.type === 'barrier' || D.type === 'ward'), pos, t);

      // ---------- staff gem ----------
      const glow = 1 + PS.chargeFrac * 1.6 + PS.gemFlare * 1.5;
      // element ramp toward its light step, multiplier ≤ 1.2 (rule 5: no white, no emissive multiplier > 1.2)
      gemColor.copy(elemColor).lerp(gemLight, clamp(PS.chargeFrac * 0.6 + PS.gemFlare * 0.5, 0, 0.8)).multiplyScalar(Math.min(1.2, 1 + PS.chargeFrac * 0.2));
      rig.gemMat.color.copy(gemColor);
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      rig.gem.scale.set(pulse * (1 + PS.chargeFrac * 0.6 + PS.gemFlare * 0.2), 1.55 * pulse * (1 + PS.chargeFrac * 0.6 + PS.gemFlare * 0.2), pulse * (1 + PS.chargeFrac * 0.6));
      rig.gem.rotation.y += dt * (1.2 + PS.chargeFrac * 8);
      rig.gemCore.scale.setScalar(1 + PS.chargeFrac * 1.2 + PS.gemFlare * 0.6);
      rig.halo.scale.setScalar((0.5 + PS.chargeFrac * 0.9 + PS.gemFlare * 0.6) * pulse);
      rig.haloMat.opacity = 0.7 + PS.chargeFrac * 0.3;
      rig.light.intensity = melee ? 0 : (0.18 + Math.sin(t * 6.3) * 0.03) * glow * glow;
      rig.light.distance = 5 + PS.chargeFrac * 4;
      for (let i = 0; i < rig.motes.length; i++) {
        const a = t * (2.2 + i * 0.37) + i * 1.9;
        const rr = (0.15 + 0.03 * Math.sin(t * 3 + i)) * (1 - PS.chargeFrac * 0.45);
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
        PS.convergeT -= dt;
        if (PS.convergeT <= 0) {
          PS.convergeT = 0.035 - PS.chargeFrac * 0.015;
          const n = 1 + Math.round(PS.chargeFrac * 2);
          CONVERGE.color = pair(chargeEl || element); CONVERGE.dir = v2;
          for (let i = 0; i < n; i++) {
            v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(0.8 + Math.random() * 0.4);
            v1.copy(tipV).add(v2);
            v2.negate().normalize();
            vfxCall('burst', v1, CONVERGE);
          }
        }
      }
      chargeCircle.update(dt, charging, 0.75 + PS.chargeFrac * 0.6, 1.2 + PS.chargeFrac * 4, 0.6 + PS.chargeFrac * 0.4);

      // ---------- glide sigil ----------
      if (PS.wGlide > 0.02 || gliding) {
        sigil.group.position.set(pos.x, pos.y - 0.12, pos.z);
        sigil.group.rotation.set(-Math.PI / 2, 0, 0);
        PS.sparkleT -= dt;
        if (gliding && PS.sparkleT <= 0) {
          PS.sparkleT = 0.07;
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.85;
          v1.set(pos.x + Math.cos(a) * rr, pos.y - 0.12, pos.z + Math.sin(a) * rr);
          SPARKLE.color = pair(element);
          vfxCall('burst', v1, SPARKLE);
        }
      }
      sigil.update(dt, gliding, 1, 2.2, 0.85);

      ghosts.update(dt);

      // ---------- cape ----------
      wind.set(0.7 - hv.x * 0.05, 0, 0.35 - hv.z * 0.05);
      if (gliding) wind.y = 3;
      cape.update(dt, groundAtFeet, wind, clamp(PS.wGlide + PS.wSprint * 0.5 + (grounded ? 0 : 0.3), 0, 1.5));
      rig.skin?.update?.();

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
    if (charging) target = 0.35 + 0.65 * PS.chargeFrac;
    else if (castKind === 'bowDraw') target = clamp(PS.castT / Math.max(0.05, CAST_DUR.bowDraw * 0.4), 0, 1);
    else if (castKind === 'bowRelease') target = PS.castT < CAST_DUR.bowRelease * 0.4 ? clamp(PS.castT / (CAST_DUR.bowRelease * 0.3), 0, 1) : 0;
    else if (focusing || PS.wBowAim > 0.6) target = 0.25;
    const prev = PS.bowDraw;
    PS.bowDraw = target > PS.bowDraw ? damp(PS.bowDraw, target, 14, dt) : 0;
    if (prev > 0.3 && PS.bowDraw === 0) PS.stringVel = -prev * 9;
    // string vibration after the release (damped spring on the rest offset)
    PS.stringVel += (-PS.stringOff * 900 - PS.stringVel * 22) * Math.min(dt, 1 / 30);
    PS.stringOff += PS.stringVel * Math.min(dt, 1 / 30);
    // nock in bow space: rest → toward the draw hand
    B.nock.position.copy(B.rest);
    if (PS.bowDraw > 0.001) {
      rig.handR.getWorldPosition(v1);
      rig.bow.worldToLocal(v1);
      B.nock.position.lerp(v1, PS.bowDraw * 0.92);
    } else B.nock.position.z += PS.stringOff * 0.04;
    B.arrow.visible = PS.bowDraw > 0.15;
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
      if (c.noCameraCollide || c.userData?.noCameraCollide || c.object?.userData?.noCameraCollide) continue;   // spell objects never jam the boom
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

  /** Combat context for the camera (§5.11): enemy aggroed within 15 m, boss tell active, boss cameraHint within 40 m. No allocation. */
  function combatContext() {
    let near = false, boss = null;
    const list = game.entities || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.team !== 'enemy' || !e.alive || !e.object || e.isProp || !(e.aggro || e.debugAggro)) continue;
      const d2 = e.object.position.distanceToSquared(pos);
      if (d2 < COMBAT_R * COMBAT_R) near = true;
      if (e.isBoss && d2 < BOSS_HINT_R * BOSS_HINT_R) boss = e;
    }
    const b = game.enemies?.boss;
    if (!boss && b?.alive && b.isBoss && b.object && (b.aggro || b.debugAggro || b.active) && b.object.position.distanceToSquared(pos) < BOSS_HINT_R * BOSS_HINT_R) boss = b;
    let bossTell = false;
    let tl = null; try { tl = game.tells?.active?.(); } catch (_) { tl = null; }
    if (tl) for (let i = 0; i < tl.length; i++) { const r = tl[i]; if (r?.enemy?.isBoss) { bossTell = true; break; } }
    ctxOut.near = near; ctxOut.boss = boss; ctxOut.bossTell = bossTell;
    return ctxOut;
  }
  const ctxOut = { near: false, boss: null, bossTell: false };
  const EXPLORE_CTX = { near: false, boss: null, bossTell: false };
  function updateCamera(rdt) {
    // combat framing: eased over 0.6 s (≈ 95 % in CAM_EASE via exp(−5 t / ease))
    // test / capture hook (magic, melee detail sheets): api.framing = 'explore' pins the out-of-combat boom (5.5 m, base FOV)
    const cx = api.framing === 'explore' ? EXPLORE_CTX : combatContext();
    const k = api.framing === 'explore' ? 1 : 1 - Math.exp(-5 * Math.max(0, rdt) / CAM_EASE);
    if (cx) {
      PS.wCombat += ((cx.near || cx.boss ? 1 : 0) - PS.wCombat) * k;
      PS.wBossTell += ((cx.bossTell ? 1 : 0) - PS.wBossTell) * k;
      const h = cx.boss?.cameraHint;
      PS.wHintD += ((h && h.dist > 0 ? h.dist : 1) - PS.wHintD) * k;
      PS.wHintH += ((h && h.height > 0 ? h.height : 1) - PS.wHintH) * k;
      camInfo.hint = h || null;
    }
    const sMul = CAM_DIST_MUL[game.settings?.values?.cameraDist] || 1;
    const boom = lerp(CAM_DIST, CAM_DIST_COMBAT, PS.wCombat) * (1 + 0.1 * PS.wBossTell) * PS.wHintD;
    const dist = (lerp(boom, CAM_DIST_AIM * (boom / CAM_DIST), PS.wAim) + PS.wSprint * 0.3 - PS.wFocus * 0.4) * sMul;
    const shoulder = lerp(lerp(SHOULDER, SHOULDER_COMBAT, PS.wCombat), SHOULDER_AIM, PS.wAim);
    camInfo.dist = dist; camInfo.combat = PS.wCombat; camInfo.bossTell = PS.wBossTell; camInfo.shoulder = shoulder;
    v1.set(pos.x, pos.y + PIVOT_H * (1 + (PS.wHintH - 1) * 0.5) - PS.squash * 0.12 - (PS.deadW * 0.8), pos.z);
    if (camSnap) { pivot.copy(v1); PS.camDist = dist; }
    else {
      const lamXZ = blinking ? 14 : 22;
      pivot.x = damp(pivot.x, v1.x, lamXZ, rdt); pivot.z = damp(pivot.z, v1.z, lamXZ, rdt);
      pivot.y = damp(pivot.y, v1.y, grounded ? 12 : 8, rdt);
    }
    camFwd.set(-Math.sin(PS.yaw) * Math.cos(PS.pitch), Math.sin(PS.pitch), -Math.cos(PS.yaw) * Math.cos(PS.pitch));
    camRight.set(Math.cos(PS.yaw), 0, -Math.sin(PS.yaw));
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
    if (camSnap || allowed < PS.camDist - 0.02) { PS.camDist = camSnap ? allowed : damp(PS.camDist, allowed, 30, rdt); PS.camHoldT = 0.3; }
    else if (PS.camHoldT > 0) PS.camHoldT -= rdt; // hold the shortened boom briefly so thin stakes/trunks don't pop
    else PS.camDist = damp(PS.camDist, allowed, 4, rdt);
    camSnap = false;
    camPos.copy(pivot).addScaledVector(camRight, shoulder).addScaledVector(camFwd, -PS.camDist);
    const minY = groundAt(camPos.x, camPos.z) + 0.3;
    if (camPos.y < minY) camPos.y = minY;
    camera.position.copy(camPos);
    camEuler.set(PS.pitch, PS.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(camEuler);
    const dc = api.debugCam; // test hook: {dist, height, angle (rad around player, 0 = in front), lookH}
    if (dc) {
      const a = PS.facing + (dc.angle || 0);
      camera.position.set(pos.x + Math.sin(a) * dc.dist, pos.y + dc.height, pos.z + Math.cos(a) * dc.dist);
      camera.lookAt(pos.x, pos.y + (dc.lookH ?? 1.1), pos.z);
    }
    const fov = BASE_FOV + PS.wFov * 7 - PS.wFocus * 4 + FOV_COMBAT * PS.wCombat;
    camInfo.fov = fov;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  game.combat?.register?.(entity);
  // position immediately so other modules created later can read it
  placeAtSpawn();
  return api;
}
