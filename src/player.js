// Player: hero (mage or swordsman), third-person controller, camera, aim, stats, block & dash per class.
import * as THREE from 'three';
import { ELEMENT_COLORS, clamp, lerp, damp, dampAngle, angleDiff, rand } from './core/utils.js';
import { buildWizard } from './player/model.js';
import { Cape } from './player/cape.js';
import { RuneCircle, Afterimages } from './player/fx.js';
import { Animator, CAST_DUR } from './player/anim.js';
import { buildSwordGear, setOutfit } from './player/swordsman.js';
import { skinMerge } from './player/model.js';
import { PF, STANCE, lerpPose, applySwordArms } from './player/swordpose.js';
import { Barrier } from './player/defense.js';

const WALK = 5.5, SPRINT = 9, GRAVITY = 22, JUMP_VEL = 8;
const GLIDE_FALL = 2.5, GLIDE_SPEED = 8;
const BLINK_DIST = 9, BLINK_TIME = 0.12, BLINK_CD = 1.2, BLINK_MP = 8;
const SENS = 0.0022, PITCH_MIN = -1.15, PITCH_MAX = 0.85;
const CAM_DIST = 5.5, CAM_DIST_AIM = 3.8, SHOULDER = 1.2, SHOULDER_AIM = 0.85, PIVOT_H = 1.85;
const BASE_FOV = 62;
const DEEP_WATER = 1.15;
const AIM_CONE = Math.cos(THREE.MathUtils.degToRad(4.5));
// v2 defense
const DASH_DIST = 6, DASH_TIME = 0.18, DASH_IFRAMES = 0.25, DASH_RECHARGE = 0.9, DASH_STAMINA = 12, DASH_CHARGES = 2;
const PERFECT_DODGE_WIN = 0.10, PERFECT_BLINK_WIN = 0.10, PERFECT_GUARD = 0.18, PERFECT_BARRIER = 0.2;
const BARRIER_DRAIN = 6, GUARD_BREAK_T = 0.8, UPDRAFT_VY_CAP = 9;
const DODGE_COL = new THREE.Color(0.45, 0.75, 1), DASH_COL = new THREE.Color(0.85, 0.92, 1);

export function createPlayer(game) {
  const { scene, camera, events, input } = game;

  const rig = buildWizard();
  const root = rig.root;
  const gear = buildSwordGear(rig);
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
  scene.add(root);
  // Perf: the whole rig (≈170 draw calls) → a handful of rigidly skinned meshes (see model.js skinMerge)
  try { rig.skin = skinMerge(root); } catch (err) { console.warn('[player] skinMerge failed, using per-part meshes', err); }
  const anim = new Animator(rig);
  const cape = new Cape(scene, rig.torso, rig.capeAnchors, 9, 0.112);
  const chargeCircle = new RuneCircle(scene, 1.15);
  const sigil = new RuneCircle(scene, 1.9);
  const ghosts = new Afterimages(scene, root, 5);
  const barrier = new Barrier(scene);

  // ---------- entity ----------
  const velocity = new THREE.Vector3();
  const entity = {
    id: 'player', team: 'player', alive: true, object: root, radius: 0.4, height: 1.8,
    hp: 100, maxHp: 100, mass: 1, velocity, grounded: true, statuses: {}, name: '마법사',
    isPlayer: true, invulnerable: false,
    onBeforeDamage(hit) { return beforeDamage(hit); },
    onHit(result, hit) { onHit(result, hit); },
    onDeath(result, hit) { onDeath(result, hit); },
    getCenter(out = new THREE.Vector3()) { return out.copy(root.position).setY(root.position.y + 1.0); },
  };

  // ---------- state ----------
  const pos = root.position;
  const hv = new THREE.Vector3();          // controlled horizontal velocity
  let vy = 0, grounded = true, wasGrounded = true, airTime = 0, coyote = 0, jumpBuffer = 0;
  let facing = Math.PI, prevFacing = Math.PI, bank = 0, turnRate = 0;
  let yaw = 0, pitch = -0.12;
  let gliding = false, sprinting = false, exhausted = false;
  let stamina = 100, mp = 100, lastMpSpend = -10, lastStamUse = -10;
  let blinkT = 0, blinkCd = 0, invulT = 0, ghostTimer = 0, blinkGuardT = 0, blinkStartT = -10;
  const blinkFrom = new THREE.Vector3(), blinkTo = new THREE.Vector3(), blinkDir = new THREE.Vector3();
  let castKind = null, castT = 0, castRecent = 0, gemFlare = 0;
  let charging = false, chargeFrac = 0, chargeEl = null;
  let hurt = 0, squash = 0, deadW = 0, dying = false, deadTime = 0, respawnTimer = null;
  let phase = 0, lastSin = 0, stepSide = 1;
  let element = 'fire';
  const elemColor = new THREE.Color(ELEMENT_COLORS.fire);
  const gemColor = new THREE.Color();
  let wSprint = 0, wAir = 0, wGlide = 0, wAction = 0, wAim = 0, speedFrac = 0, wFov = 0;
  let accelF = 0, lastSpeed = 0;
  let sparkleT = 0, convergeT = 0, wadeT = 0;
  let aimPitch = 0;
  // ---- v2: class, block & dash, updraft, sword action interface ----
  let cls = null;   // null until the path is chosen (neutral villager look, no Q/E skills)
  let blocking = false, blockT = 0, blockHeld = false, guardBreakT = 0;
  let dashCharges = DASH_CHARGES, dashRecharge = 0, dashT = 0, dashIframeT = 0, dashStartT = -10, ghostT2 = 0;
  const dashDir = new THREE.Vector3();
  let counterReady = 0, counterTarget = null, perfectFx = 0, dilateT = 0;
  let inUpdraft = false, updraftT = 0, airJumps = 0;
  let drawnW = 0, swordDrawn = false;
  let combatHasBlock = false;
  /** Written every frame by the sword module (game.sword); consumed by the player on its next update. */
  const action = {
    active: false, facing: null, turn: 30, move: 1, vel: new THREE.Vector3(), setVy: NaN, gravityMul: 1,
    bodyYaw: 0, pose: new Float32Array(PF), poseW: 0, cancelable: true, dodgeCancelable: true, noGlide: false, superArmor: false,
  };
  /** Support-skill / buff modifiers (written by the sword module). */
  const mods = { atkMul: 1, dmgTakenMul: 1, moveMul: 1, atkSpeed: 1, doubleJump: false, extraDash: 0, noKnockback: false };
  const stancePose = new Float32Array(PF), finalPose = new Float32Array(PF);
  const defHud = { block: { active: false, perfect: false, type: 'barrier' }, dash: { charges: 1, maxCharges: 1, cooldownFrac: 0 } };
  const swordTipV = new THREE.Vector3();

  // camera state
  const pivot = new THREE.Vector3();
  const camPos = new THREE.Vector3(), camFwd = new THREE.Vector3(0, 0, -1), camRight = new THREE.Vector3(1, 0, 0);
  let camDist = CAM_DIST, camSnap = true;
  const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // scratch
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const tipV = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const wind = new THREE.Vector3(0.7, 0, 0.35);
  const animState = {
    t: 0, dt: 0, phase: 0, amp: 0, speedFrac: 0, wSprint: 0, wAir: 0, wGlide: 0, wAction: 0,
    castKind: null, castT01: 0, chargeFrac: 0, hurt: 0, squash: 0, dead: 0, bank: 0, vy: 0,
    localVx: 0, localVz: 0, aimPitch: 0, flare: 0, flutter: 0, accel: 0,
  };

  const W = () => game.world;
  /** Feet height: world.getGroundHeight (terrain or frozen water) with getHeight fallback. */
  const groundAt = (x, z) => {
    const w = W(); const h = w?.getGroundHeight ? w.getGroundHeight(x, z) : w?.getHeight?.(x, z);
    return Number.isFinite(h) ? h : 0;
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
  const vfx = () => game.vfx;
  const vfxCall = (name, ...args) => { try { return vfx()?.[name]?.(...args); } catch (e) { return null; } };
  const ev = (name, payload) => events.emit(name, payload);

  function setStaffElement(el) {
    if (!el || !ELEMENT_COLORS[el]) return;
    const changed = el !== element;
    element = el;
    elemColor.setHex(ELEMENT_COLORS[el]);
    rig.haloMat.color.copy(elemColor);
    rig.light.color.copy(elemColor);
    rig.moteMat.color.copy(elemColor).lerp(new THREE.Color(1, 1, 1), 0.25);
    chargeCircle.setColor(elemColor); sigil.setColor(elemColor);
    barrier.setColor(elemColor);
    entity.resist = el === 'fire' ? { fire: 0.35 } : undefined; // attuned to fire: own grass fires barely singe
    gear.gemMat.color.copy(elemColor).multiplyScalar(1.3);
    gear.edgeMat.uniforms.uColor.value.copy(elemColor);
    if (changed && game.state === 'playing') {
      gemFlare = Math.max(gemFlare, 0.6);
      api.getStaffTip(v4);
      vfxCall('burst', v4, { count: 14, color: [ELEMENT_COLORS[el], 0xffffff], speed: 2.2, spread: 1, size: 0.09, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 2 });
    }
  }

  let checkpoint = null;
  function placeAtSpawn(useCheckpoint = false) {
    const sp = (useCheckpoint && checkpoint) || W()?.playerSpawn;
    if (sp) pos.set(sp.x, 0, sp.z); else pos.set(0, 0, 120);
    if (useCheckpoint && checkpoint) { try { W()?.resolveCollision?.(pos, entity.radius + 0.6); } catch (e) { /* */ } }
    pos.y = groundAt(pos.x, pos.z);
    vy = 0; hv.set(0, 0, 0); velocity.set(0, 0, 0);
    grounded = wasGrounded = true;
    yaw = 0; pitch = -0.12; facing = prevFacing = Math.PI;
    root.rotation.set(0, facing, 0);
    root.updateMatrixWorld(true);
    cape.reset();
    camSnap = true;
  }

  // ---------- combat hooks ----------
  function onHit(result, hit) {
    if (entity.invulnerable && result?.damage > 0) {
      // combat should skip invulnerable targets; undo if it didn't
      entity.hp = Math.min(entity.maxHp, entity.hp + result.damage);
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
        return;
      }
      if (r?.mul != null) {
        entity.hp = Math.min(entity.maxHp, entity.hp + dmg * (1 - r.mul));
        ev('blocked', { target: entity, parried: false, perfect: false, point: hit.point, source: hit.source });
      }
    }
    if (hit?._pbdRes?.cancel || result?.blocked) return;
    if (hit?._pbdRes?.mul != null) { velocity.multiplyScalar(0.35); hurt = Math.max(hurt, 0.35); return; }
    // support buffs: damage reduction / stagger immunity
    if (mods.dmgTakenMul < 1 && dmg > 0 && !(hit?.tags || []).includes('dot')) entity.hp = Math.min(entity.maxHp, entity.hp + dmg * (1 - mods.dmgTakenMul));
    if (mods.noKnockback || action.superArmor) { velocity.set(0, 0, 0); hurt = Math.max(hurt, 0.3); return; }
    hurt = 1;
    if (charging) gemFlare = 0.3;
  }

  // ---------- block / dash (v2) ----------
  function sourcePos(hit, out) {
    const s = hit?.source;
    if (s && typeof s === 'object' && s.object) return out.copy(s.object.position);
    if (hit?.point) return out.copy(hit.point);
    return null;
  }
  /** player.entity.onBeforeDamage — called by combat before damage is applied. */
  function beforeDamage(hit) {
    if (!hit) return null;
    if (hit._pbd) return hit._pbdRes || null;
    hit._pbd = true; hit._pbdRes = null;
    const src = hit.source;
    if (src === 'player' || src?.team === 'player') return null;
    const tags = hit.tags || [];
    if (tags.includes('dot') || tags.includes('tick') || !entity.alive || dying) return null;
    let r = null;
    if (cls === 'sword' && dashIframeT > 0) {
      if (game.time - dashStartT <= PERFECT_DODGE_WIN) perfectDodge(hit);
      else dodgedFx();
      r = { cancel: true, dodged: true };
    } else if (cls === 'mage' && blinkGuardT > 0) {
      // blink i-frames are handled here (not entity.invulnerable) so a well-timed blink can be rewarded
      if (game.time - blinkStartT <= PERFECT_BLINK_WIN) perfectBlink(hit);
      else dodgedFx();
      r = { cancel: true, dodged: true };
    } else if (blocking) {
      let front = true;
      if (cls === 'sword' && sourcePos(hit, v4)) {
        v4.sub(pos).setY(0);
        if (v4.lengthSq() > 0.04) front = v4.normalize().dot(v3.set(Math.sin(facing), 0, Math.cos(facing))) > -0.25;
      }
      if (front) {
        const perfect = blockT <= (cls === 'sword' ? PERFECT_GUARD : PERFECT_BARRIER);
        const amt = hit.amount || 0;
        if (perfect) { r = { cancel: true, parried: true, perfect: true, reflect: true }; doParry(hit); }
        else if (cls === 'mage') {
          mp = Math.max(0, mp - amt * 0.5); lastMpSpend = game.time;
          r = { mul: 0.2, reflect: false };
          blockFx(hit, false);
          if (mp <= 0.5) breakBlock();
        } else {
          stamina -= 6 + amt * 0.6; lastStamUse = game.time;
          if (stamina <= 0) { stamina = 0; r = { mul: 0.6 }; guardBreak(); }
          else { r = { mul: 0.3 }; blockFx(hit, false); }
        }
      }
    }
    hit._pbdRes = r;
    return r;
  }
  function blockFx(hit, perfect) {
    const c = ELEMENT_COLORS[element];
    if (!sourcePos(hit, v4)) v4.set(pos.x + Math.sin(facing), pos.y, pos.z + Math.cos(facing));
    v4.sub(pos).setY(0); if (v4.lengthSq() < 1e-4) v4.set(Math.sin(facing), 0, Math.cos(facing)); v4.normalize();
    if (cls === 'mage') {
      barrier.hit(v4, perfect);
      v1.copy(pos).addScaledVector(v4, 1.3).setY(pos.y + 1.0);
      vfxCall('burst', v1, { count: perfect ? 30 : 12, color: [c, 0xffffff], speed: perfect ? 6 : 3, spread: 0.6, dir: v4, size: 0.1, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 3 });
      game.audio?.play?.(perfect ? 'reflect' : 'barrier_hit', { position: v1 });
    } else {
      api.getSwordTip(v1); v1.lerp(v2.copy(pos).addScaledVector(v4, 0.6).setY(pos.y + 1.2), 0.6);
      vfxCall('burst', v1, { count: perfect ? 46 : 14, color: [0xfff3c0, 0xffb040], speed: perfect ? 11 : 5, speedVar: 3, spread: perfect ? 1 : 0.5, dir: v4, size: perfect ? 0.13 : 0.09, sizeEnd: 0, life: perfect ? 0.5 : 0.3, shape: 'spark', drag: 2.5, velocityStretch: 0.05 });
      vfxCall('flash', v1, { color: 0xfff0c0, intensity: perfect ? 6 : 2, distance: perfect ? 10 : 5, duration: perfect ? 0.3 : 0.12 });
      if (!perfect) { game.audio?.play?.('block_hit', { position: v1 }); vfxCall('shake', 0.12); velocity.multiplyScalar(0.4); }
    }
  }
  function doParry(hit) {
    blockFx(hit, true);
    perfectFx = 1;
    if (cls === 'sword') {
      game.hitstop?.(0.12); game.slowmo?.(0.4, 0.5);
      api.getSwordTip(v1);
      vfxCall('shockwave', v1, { color: 0xffe6a0, radius: 2.4, duration: 0.3, vertical: true, opacity: 0.9, thickness: 0.18 });
      vfxCall('screenFlash', 0xfff4d0, 0.28, 0.25);
      vfxCall('fovKick', -4, 0.3); vfxCall('shake', 0.25);
      game.audio?.play?.('parry', { position: v1 });
      counterReady = 1.2; counterTarget = typeof hit.source === 'object' ? hit.source : null;
    } else {
      game.hitstop?.(0.08);
      vfxCall('screenFlash', ELEMENT_COLORS[element], 0.2, 0.25);
      vfxCall('fovKick', -3, 0.25);
    }
    ev('parry', { perfect: true, cls, source: hit.source, point: hit.point || pos.clone() });
  }
  function perfectDodge(hit) {
    if (counterReady > 0.5) return;
    game.slowmo?.(0.3, 1.2);
    vfxCall('screenFlash', 0x4f9dff, 0.32, 1.1);
    vfxCall('fovKick', 6, 0.5);
    ghosts.spawn(pos, facing, DODGE_COL, 0.8, 1);
    game.audio?.play?.('perfect_dodge', { position: pos });
    counterReady = 1.5; counterTarget = typeof hit?.source === 'object' ? hit.source : null;
    perfectFx = 1; dilateT = 1.3;
    ev('perfectDodge', { source: hit?.source || null, position: pos.clone() });
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
    game.slowmo?.(0.5, 0.5);
    vfxCall('screenFlash', ELEMENT_COLORS[element], 0.22, 0.45);
    vfxCall('fovKick', 4, 0.35);
    game.audio?.play?.('perfect_dodge', { position: pos });
    mp = Math.min(100, mp + BLINK_MP);
    perfectFx = 1;
    ev('perfectDodge', { source: hit?.source || null, position: pos.clone(), cls: 'mage' });
  }
  function breakBlock() {
    if (!blocking) return;
    blocking = false; blockT = 0;
    game.audio?.play?.(cls === 'mage' ? 'mana_empty' : 'guard_break', { position: pos });
  }
  function guardBreak() {
    breakBlock();
    guardBreakT = GUARD_BREAK_T; exhausted = true; hurt = 1;
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1.2), { count: 20, color: [0xffd28a, 0xffffff], speed: 5, spread: 1, size: 0.1, life: 0.4, shape: 'spark', drag: 3 });
    vfxCall('shake', 0.3);
    ev('guardBreak', { position: pos.clone() });
  }
  function startBlock() {
    if (blocking || guardBreakT > 0 || dashT > 0 || blinkT > 0) return;
    if (cls === 'mage' ? mp < 3 : stamina < 5) return;
    blocking = true; blockT = 0;
    endGlide();
    game.audio?.play?.(cls === 'mage' ? 'barrier_up' : 'block', { position: pos });
    if (cls === 'sword') { swordDrawn = true; api.swordIdleT = 0; }
  }
  function tryDash(canAct) {
    if (!entity.alive || dying || dashT > 0 || !canAct || guardBreakT > 0) return;
    const maxC = DASH_CHARGES + (mods.extraDash || 0);
    if (dashCharges <= 0) return;
    if (stamina < DASH_STAMINA && !exhausted) { /* allow into exhaustion */ }
    if (exhausted && stamina < DASH_STAMINA) { game.audio?.play?.('guard_break', { volume: 0.3, pitch: 1.6 }); return; }
    stamina = Math.max(0, stamina - DASH_STAMINA); lastStamUse = game.time;
    if (dashCharges === maxC) dashRecharge = DASH_RECHARGE;
    dashCharges--;
    if (wish.lengthSq() > 0.01) dashDir.copy(wish).setY(0).normalize();
    else dashDir.set(-Math.sin(yaw), 0, -Math.cos(yaw)).negate(); // no input: hop backwards from the camera view
    blocking = false;
    endGlide();
    dashT = DASH_TIME; dashIframeT = DASH_IFRAMES; dashStartT = game.time; ghostT2 = 0;
    facing = Math.atan2(dashDir.x, dashDir.z);
    if (grounded) vy = 0;
    const c = ELEMENT_COLORS[element];
    v1.copy(pos).setY(pos.y + 0.3);
    vfxCall('burst', v1, { count: 10, color: 0xe6dbc0, speed: 2.5, spread: 0.5, dir: v2.copy(dashDir).negate().setY(0.3), size: 0.35, sizeEnd: 0.9, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
    vfxCall('burst', v1.setY(pos.y + 1), { count: 12, color: [c, 0xffffff], speed: 3, spread: 0.6, dir: v2.copy(dashDir).negate(), size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
    vfxCall('fovKick', 3, 0.22);
    game.audio?.play?.('dash', { position: pos });
    ev('dash', { position: pos.clone(), direction: dashDir.clone() });
  }
  function onDeath() {
    if (dying) return;
    dying = true; deadTime = 0;
    gliding = false; charging = false; castKind = null;
    ev('playerDeath', {});
    vfxCall('burst', v1.copy(pos).setY(pos.y + 1), { count: 30, color: [ELEMENT_COLORS[element], 0xffffff], speed: 3, spread: 1, size: 0.12, life: 0.9, shape: 'spark', gravity: -1 });
  }

  function respawn() {
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
    for (const k of Object.keys(entity.statuses || {})) { try { game.combat?.clearStatus?.(entity, k); } catch (e) { /* */ } }
    entity.statuses = entity.statuses || {};
    for (const k of Object.keys(entity.statuses)) delete entity.statuses[k];
    entity.alive = true; entity.hp = entity.maxHp; mp = 100; stamina = maxStam(); exhausted = false;
    dying = false; deadW = 0; deadTime = 0; hurt = 0; blinkT = 0; blinkCd = 0; invulT = 1.5; entity.invulnerable = true;
    blocking = false; guardBreakT = 0; dashT = 0; dashIframeT = 0; dashCharges = DASH_CHARGES + (mods.extraDash || 0); counterReady = 0;
    root.visible = true; cape.mesh.visible = true;
    if (!game.entities.includes(entity)) game.combat?.register?.(entity);
    placeAtSpawn(true);
    if (checkpoint) {
      // face the objective (north) from the checkpoint
      yaw = 0; facing = prevFacing = Math.PI; root.rotation.set(0, facing, 0);
    }
    ev('playerRespawn', {});
    vfxCall('burst', v1.copy(pos).setY(pos.y + 0.9), { count: 40, color: [ELEMENT_COLORS[element], 0xffffff], speed: 3.5, spread: 1, size: 0.12, life: 0.8, shape: 'spark', drag: 2 });
    vfxCall('shockwave', v1.copy(pos).setY(pos.y + 0.05), { color: ELEMENT_COLORS[element], radius: 3, duration: 0.6 });
    if (game.state !== 'playing') { if (game.setState) game.setState('playing'); else game.state = 'playing'; }
  }

  // ---------- blink ----------
  function tryBlink(canAct) {
    if (!entity.alive || dying || blinkT > 0 || blinkCd > 0 || !canAct) return;
    if (!api.spendMp(BLINK_MP)) { game.audio?.play?.('mana_empty'); return; }
    if (wish.lengthSq() > 0.01) blinkDir.copy(wish).normalize();
    else blinkDir.set(Math.sin(facing), 0, Math.cos(facing));
    blinkFrom.copy(pos);
    // step along the path; stop at cliffs, deep water, bounds
    const startH = groundAt(pos.x, pos.z);
    let dist = 0;
    const wl = waterLevel();
    const bounds = W()?.bounds;
    for (let d = 0.5; d <= BLINK_DIST + 1e-3; d += 0.5) {
      const x = pos.x + blinkDir.x * d, z = pos.z + blinkDir.z * d;
      const h = groundAt(x, z);
      if (h - Math.max(startH, pos.y) > 2.6) break;
      if (waterDepth(x, z, h) > DEEP_WATER && grounded) break;
      if (Number.isFinite(bounds) && Math.hypot(x, z) > bounds - 1) break;
      dist = d;
    }
    blinkTo.copy(pos).addScaledVector(blinkDir, dist);
    try { W()?.resolveCollision?.(blinkTo, entity.radius); } catch (e) { /* */ }
    const th = groundAt(blinkTo.x, blinkTo.z);
    blinkTo.y = grounded ? th : Math.max(th, pos.y + 0.3);
    blinkT = BLINK_TIME; blinkCd = BLINK_CD;
    blinkGuardT = BLINK_TIME + 0.18; blinkStartT = game.time;
    gliding && endGlide();
    vy = 0; ghostTimer = 0;
    const c = ELEMENT_COLORS[element];
    v1.copy(pos).setY(pos.y + 0.9);
    ghosts.spawn(pos, facing, elemColor, 0.5, 1);
    vfxCall('burst', v1, { count: 28, color: [c, 0xffffff], speed: 4.5, spread: 1, size: 0.13, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 3 });
    vfxCall('burst', v1, { count: 10, color: c, speed: 1.2, spread: 1, size: 0.5, sizeEnd: 1.1, life: 0.4, shape: 'soft', drag: 2 });
    vfxCall('flash', v1, { color: c, intensity: 3, distance: 7, duration: 0.18 });
    vfxCall('fovKick', 5, 0.25);
    ev('blink', { position: pos.clone() });
  }
  function endBlink() {
    pos.copy(blinkTo);
    root.visible = true; cape.mesh.visible = true;
    const c = ELEMENT_COLORS[element];
    v1.copy(pos).setY(pos.y + 0.9);
    vfxCall('burst', v1, { count: 26, color: [c, 0xffffff], speed: 3.5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 3 });
    vfxCall('shockwave', v1.set(pos.x, pos.y + 0.9, pos.z), { color: c, radius: 1.6, duration: 0.3, vertical: true, opacity: 0.6, thickness: 0.15 });
    hv.copy(blinkDir).multiplyScalar(WALK * 0.8);
    squash = Math.max(squash, 0.35);
  }

  function endGlide() {
    if (gliding) { gliding = false; ev('glideEnd', { position: pos.clone() }); }
    if (inUpdraft) { inUpdraft = false; ev('updraftExit', { position: pos.clone() }); }
  }

  function setClass(c) {
    c = c === 'sword' ? 'sword' : c === 'mage' ? 'mage' : null;
    cls = c;
    setOutfit(rig, gear, cape, c || 'mage');
    if (!c) {
      // neutral villager look before the blessing: no hat, staff or vial
      if (rig.hat) rig.hat.visible = false;
      if (rig.staff) rig.staff.visible = false;
      if (rig.vial) rig.vial.visible = false;
    }
    entity.name = c === 'sword' ? '검사' : c === 'mage' ? '마법사' : '바람결의 젊은이';
    swordDrawn = false; drawnW = 0;
    gear.sword.visible = false; gear.sheathed.visible = c === 'sword';
    blocking = false;
    dashCharges = DASH_CHARGES + (mods.extraDash || 0);
  }

  // ---------- api ----------
  const maxStam = () => api.maxStamina || 100;
  const api = {
    entity, object: root, rig,
    get hp() { return entity.hp; }, set hp(v) { entity.hp = v; },
    get maxHp() { return entity.maxHp; }, set maxHp(v) { entity.maxHp = v; },
    get mp() { return mp; }, set mp(v) { mp = clamp(v, 0, 100); }, maxMp: 100,
    get stamina() { return stamina; }, set stamina(v) { stamina = clamp(v, 0, maxStam()); }, maxStamina: 100,
    get exhausted() { return exhausted; },
    get gliding() { return gliding; }, get sprinting() { return sprinting; },
    get grounded() { return grounded; },
    get blinkCooldown() { return blinkCd; }, blinkCooldownMax: BLINK_CD, blinkCost: BLINK_MP,
    get element() { return element; },
    // ---- v2 ----
    get cls() { return cls; },
    get blocking() { return blocking; },
    get dashing() { return dashT > 0 || blinkT > 0; },
    get guardBroken() { return guardBreakT > 0; },
    get counterReady() { return counterReady; },
    get counterTarget() { return counterTarget; },
    consumeCounter() { const t = counterTarget; counterReady = 0; counterTarget = null; return t; },
    get facing() { return facing; },
    get swordDrawn() { return swordDrawn; },
    swordIdleT: 0,
    action, mods, gear,
    get camForward() { return camFwd; },
    setClass,
    /** Draw/sheathe the sword (swordsman). */
    setSwordDrawn(on) {
      on = !!on && cls === 'sword';
      if (on === swordDrawn) return;
      swordDrawn = on;
      game.audio?.play?.('sword_draw', { position: pos, pitch: on ? 1 : 0.8, volume: on ? 0.8 : 0.5 });
      if (on) { api.getSwordTip(v1); vfxCall('burst', v1, { count: 10, color: [ELEMENT_COLORS[element], 0xffffff], speed: 2, spread: 1, size: 0.08, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 }); }
    },
    getSwordTip(out = new THREE.Vector3()) { return (swordDrawn ? gear.tip : gear.sheathed).getWorldPosition(out); },
    getSwordBase(out = new THREE.Vector3()) { return (swordDrawn ? gear.base : gear.sheathed).getWorldPosition(out); },
    /** Instantly move the hero (sword skills). */
    teleport(p, snapGround = true) {
      const ox = pos.x, oy = pos.y, oz = pos.z;
      pos.copy(p);
      try { W()?.resolveCollision?.(pos, entity.radius); } catch (e) { /* */ }
      const gh = groundAt(pos.x, pos.z);
      if (snapGround || pos.y < gh) { pos.y = gh; vy = 0; grounded = true; }
      cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
      root.updateMatrixWorld(true);
    },
    setFacing(a) { facing = prevFacing = a; root.rotation.y = a; },
    spawnGhost(color, life = 0.35, opacity = 0.8) { ghosts.spawn(pos, facing + action.bodyYaw, color, life, opacity); },
    /** Slow-mo compensation: during the perfect-dodge 반격 window the hero moves at full speed. */
    timeComp() { return dilateT > 0 && game._slowTime > 0 && game._slowScale > 0 ? 1 / game._slowScale : 1; },
    getDefenseHud() {
      const hud = defHud;
      hud.block.active = blocking;
      hud.block.perfect = blocking && blockT <= (cls === 'sword' ? PERFECT_GUARD : PERFECT_BARRIER);
      hud.block.type = cls === 'sword' ? 'guard' : 'barrier';
      if (cls === 'sword') {
        hud.dash.charges = dashCharges; hud.dash.maxCharges = DASH_CHARGES + (mods.extraDash || 0);
        hud.dash.cooldownFrac = dashCharges < hud.dash.maxCharges ? clamp(dashRecharge / DASH_RECHARGE, 0, 1) : 0;
      } else {
        hud.dash.charges = blinkCd <= 0 ? 1 : 0; hud.dash.maxCharges = 1; hud.dash.cooldownFrac = clamp(blinkCd / BLINK_CD, 0, 1);
      }
      return hud;
    },
    /** New game: put the hero in their home in the village. */
    placeInVillage() {
      checkpoint = null;
      for (const k of Object.keys(entity.statuses || {})) delete entity.statuses[k];
      entity.alive = true; entity.hp = entity.maxHp; mp = 100; stamina = maxStam(); exhausted = false;
      dying = false; deadW = 0; hurt = 0; blocking = false; dashT = 0; blinkT = 0; counterReady = 0;
      root.visible = true; cape.mesh.visible = true;
      const home = W()?.village?.playerHome || W()?.playerSpawn;
      if (home) { pos.set(home.x, 0, home.z); try { W()?.resolveCollision?.(pos, entity.radius + 0.3); } catch (e) { /* */ } }
      else pos.set(0, 0, 120);
      pos.y = groundAt(pos.x, pos.z);
      vy = 0; hv.set(0, 0, 0); velocity.set(0, 0, 0); grounded = wasGrounded = true;
      const yawH = W()?.village?.playerHomeYaw;
      facing = prevFacing = Number.isFinite(yawH) ? yawH : Math.PI;
      yaw = facing - Math.PI; pitch = -0.12;
      root.rotation.set(0, facing, 0); root.updateMatrixWorld(true);
      cape.reset(); camSnap = true;
    },
    get yaw() { return yaw; }, get pitch() { return pitch; },
    /** Test hook: set camera look angles directly. */
    setLook(y, p = pitch) { yaw = y; pitch = clamp(p, PITCH_MIN, PITCH_MAX); },

    init() {
      placeAtSpawn();
      const el = game.spells?.element;
      setStaffElement(ELEMENT_COLORS[el] ? el : 'fire');
      events.on('elementChanged', (p) => p?.element && setStaffElement(p.element));
      // checkpoints: respawn near the last cleared camp, or at the foot of the boss ramp once the boss is up
      events.on('campCleared', (p) => {
        const c = (W()?.camps || []).find((k) => k.id === p?.campId) || W()?.camps?.[p?.index];
        if (c?.position && !checkpoint?.boss) checkpoint = { x: c.position.x, z: c.position.z };
      });
      events.on('bossSpawn', () => {
        const r = W()?.bossArena?.rampStart;
        if (r) checkpoint = { x: r.x, z: r.z, boss: true };
      });
      events.on('stateChange', (p) => { if (p?.state === 'playing' && (p.prev === 'title' || p.prev === 'cutscene')) camSnap = true; });
      events.on('pathChosen', (p) => setClass(p?.cls));
      setClass(game.progression?.cls || null);
      try { combatHasBlock = /onBeforeDamage/.test(String(game.combat?.dealDamage || '')); } catch (e) { combatHasBlock = false; }
      // frame the hero for the title screen
      updateCamera(0.016);
    },

    spendMp(n) {
      if (mp < n) return false;
      mp -= n; lastMpSpend = game.time; return true;
    },

    getStaffTip(out = new THREE.Vector3()) {
      return rig.gemPivot.getWorldPosition(out);
    },

    getAim() {
      const origin = api.getStaffTip(new THREE.Vector3());
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

    playCast(kind, el) {
      if (!CAST_DUR[kind]) kind = 'basic';
      if (el) setStaffElement(el);
      castKind = kind; castT = 0; castRecent = CAST_DUR[kind] + 0.45;
      gemFlare = 1;
      api.getStaffTip(v4);
      const c = ELEMENT_COLORS[element];
      vfxCall('burst', v4, { count: kind === 'basic' ? 8 : 18, color: [c, 0xffffff], speed: 2.5, spread: 1, size: 0.1, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 3 });
    },

    setCharging(active, el, frac = 0) {
      if (el) setStaffElement(el);
      const was = charging;
      charging = !!active && entity.alive && !dying;
      chargeFrac = clamp(frac || 0, 0, 1);
      chargeEl = el || element;
      if (charging) castRecent = Math.max(castRecent, 0.5);
      if (was && !charging) chargeFrac = 0;
    },

    setStaffElement,
    respawn,

    update(dt, realDt) {
      dt *= api.timeComp();
      const t = game.time;
      const combat = game.combat;
      let canAct = entity.alive && !dying && guardBreakT <= 0;
      try { if (canAct && combat?.canAct) canAct = combat.canAct(entity) !== false; } catch (e) { /* */ }
      let sm = 1;
      try { sm = combat?.speedMul ? (combat.speedMul(entity) ?? 1) : 1; } catch (e) { /* */ }

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
      blinkCd = Math.max(0, blinkCd - dt);
      if (invulT > 0) { invulT -= dt; if (invulT <= 0) entity.invulnerable = false; }
      if (blinkGuardT > 0) blinkGuardT -= dt;
      castRecent = Math.max(0, castRecent - dt);
      gemFlare = Math.max(0, gemFlare - dt * 2.2);
      hurt = Math.max(0, hurt - dt * 3.2);
      squash = Math.max(0, squash - dt * 4);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (castKind) { castT += dt; if (castT >= CAST_DUR[castKind]) castKind = null; }
      // v2 timers
      if (guardBreakT > 0) guardBreakT -= dt;
      if (dashIframeT > 0) dashIframeT -= dt;
      if (counterReady > 0) { counterReady -= realDt; if (counterReady <= 0) counterTarget = null; }
      perfectFx = Math.max(0, perfectFx - realDt * 2);
      if (dilateT > 0) dilateT -= realDt;
      {
        const maxC = DASH_CHARGES + (mods.extraDash || 0);
        if (dashCharges > maxC) dashCharges = maxC;
        if (dashCharges < maxC) { dashRecharge -= dt; if (dashRecharge <= 0) { dashCharges++; dashRecharge = dashCharges < maxC ? DASH_RECHARGE : 0; } }
      }
      if (cls !== 'sword' && action.active) action.active = false;

      // ---------- move intent ----------
      const ix = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      const iz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      v1.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      wish.set(0, 0, 0).addScaledVector(camRight, ix).addScaledVector(v1, iz);
      if (wish.lengthSq() > 1) wish.normalize();
      if (!canAct) wish.set(0, 0, 0);
      const actOn = cls === 'sword' && action.active;
      const rawMoving = wish.lengthSq() > 0.01;
      if (actOn) wish.multiplyScalar(action.move);
      const moving = wish.lengthSq() > 0.01;

      // ---------- block (E hold) ----------
      const skillsOn = !!cls && game.progression?.chosen !== false;
      // dodge/guard may cancel an attack's recovery once its last hit window is over (sword.js dodgeCancelable)
      const dodgeOk = !actOn || action.cancelable || action.dodgeCancelable;
      blockHeld = input.down('KeyE') && canAct && skillsOn;
      if (blocking) {
        blockT += dt;
        if (!blockHeld || !canAct) breakBlock();
        else if (cls === 'mage') {
          mp -= BARRIER_DRAIN * dt; lastMpSpend = t;
          if (mp <= 0) { mp = 0; breakBlock(); }
        } else lastStamUse = t;
      } else if (blockHeld && dodgeOk) {
        const ok = cls === 'mage' ? mp >= 3 : stamina >= 5;
        if (ok) startBlock();
        else if (input.pressed('KeyE')) game.audio?.play?.(cls === 'mage' ? 'mana_empty' : 'guard_break', { volume: 0.4 });
      }

      if (input.pressed('Space') && canAct && !(actOn && !action.cancelable)) jumpBuffer = 0.12;
      if (input.pressed('KeyQ') && skillsOn) {
        if (cls === 'sword') { if (dodgeOk) tryDash(canAct); }
        else tryBlink(canAct);
      }
      void rawMoving;

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

      if (blinkT > 0) {
        // ---------- blink dash ----------
        blinkT -= dt;
        const k = 1 - Math.max(0, blinkT) / BLINK_TIME;
        const e = 1 - (1 - k) * (1 - k);
        const ox = pos.x, oy = pos.y, oz = pos.z;
        pos.lerpVectors(blinkFrom, blinkTo, e);
        cape.shift(pos.x - ox, pos.y - oy, pos.z - oz);
        root.visible = false; cape.mesh.visible = false;
        ghostTimer -= dt;
        if (ghostTimer <= 0) { ghostTimer = 0.05; ghosts.spawn(pos, facing, elemColor, 0.38, 0.75); }
        if (blinkT <= 0) endBlink();
        vy = 0; grounded = blinkT > 0 ? grounded : pos.y <= groundAt(pos.x, pos.z) + 0.01;
      } else {
        // ---------- stamina / sprint ----------
        const wantSprint = input.down('ShiftLeft') && moving && grounded && !exhausted && canAct && !charging && !blocking && !actOn && dashT <= 0;
        sprinting = wantSprint && stamina > 0;
        // ---------- water ----------
        let gh = groundAt(pos.x, pos.z);
        depth = waterDepth(pos.x, pos.z, gh);
        const swimming = depth > DEEP_WATER;
        const wade = depth > 0 ? clamp(1 - depth * 0.45, 0.45, 1) : 1;

        let speed = sprinting ? SPRINT : WALK;
        if (charging) speed *= 0.55;
        else if (castKind || castRecent > 0.3) speed *= 0.8;
        if (blocking) speed *= cls === 'sword' ? 0.45 : 0.55;
        speed *= sm * wade * (mods.moveMul || 1);
        if (swimming) speed = Math.min(speed, 2.6);

        // ---------- jump ----------
        if (grounded) { coyote = 0.12; airTime = 0; } else { coyote -= dt; airTime += dt; }
        if (grounded) airJumps = 0;
        if (jumpBuffer > 0 && coyote <= 0 && !grounded && mods.doubleJump && airJumps < 1 && canAct && !swimming && !gliding && airTime > 0.1) {
          airJumps++; vy = JUMP_VEL * 0.95; jumpBuffer = 0; airTime = 0.05;
          ev('jump', { position: pos.clone(), double: true });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.1), { count: 16, color: [ELEMENT_COLORS.wind, 0xffffff], speed: 3, spread: 0.3, dir: v2.set(0, -1, 0), size: 0.1, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 3 });
          vfxCall('shockwave', v1, { color: ELEMENT_COLORS.wind, radius: 1.6, duration: 0.3, opacity: 0.7, thickness: 0.12 });
        }
        if (jumpBuffer > 0 && coyote > 0 && canAct && !swimming) {
          vy = JUMP_VEL; grounded = false; coyote = 0; jumpBuffer = 0;
          ev('jump', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.05), { count: 6, color: 0xe9dfc4, speed: 1.4, spread: 0.7, dir: UP, size: 0.3, sizeEnd: 0.7, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
        }

        // ---------- glide ----------
        const heightAbove = pos.y - (depth > 0 ? Math.max(gh, wl) : gh);
        const canGlide = !grounded && input.down('Space') && canAct && !exhausted && stamina > 0 && airTime > 0.22 && (gliding || vy < 0.5) && heightAbove > 0.9
          && !(actOn && action.noGlide) && dashT <= 0 && !blocking;
        if (canGlide && !gliding) {
          gliding = true; ev('glideStart', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y - 0.1), { count: 22, color: [ELEMENT_COLORS[element], 0xffffff], speed: 3, spread: 0.25, dir: v2.set(0, -0.2, 0), size: 0.1, life: 0.6, shape: 'spark', drag: 2 });
        } else if (!canGlide && gliding) endGlide();

        // ---------- horizontal ----------
        if (dashT > 0) {
          const k = 1 - dashT / DASH_TIME;
          const v = (DASH_DIST / (DASH_TIME * 0.7)) * (1 - 0.6 * k);
          hv.copy(dashDir).multiplyScalar(v);
          dashT -= dt;
          ghostT2 -= dt;
          if (ghostT2 <= 0) { ghostT2 = 0.045; ghosts.spawn(pos, facing, perfectFx > 0 ? DODGE_COL : DASH_COL, 0.3, 0.55); }
          if (dashT <= 0) { hv.copy(dashDir).multiplyScalar(WALK * 0.7); squash = Math.max(squash, 0.25); }
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
            // rising heat from burning grass lifts the glider (BotW updraft)
            let up = 0;
            try { up = W()?.surface?.getUpdraft?.(pos) || 0; } catch (e) { up = 0; }
            if (up > 0) {
              vy = Math.min(vy + up * dt, UPDRAFT_VY_CAP);
              updraftT = 0.25;
              if (!inUpdraft) { inUpdraft = true; ev('updraftEnter', { position: pos.clone() }); }
              if (Math.random() < 0.3) vfxCall('burst', v1.set(pos.x + rand(-0.8, 0.8), pos.y - 0.6, pos.z + rand(-0.8, 0.8)), { count: 1, color: [0xffd090, 0xff8040], speed: 4, spread: 0.1, dir: UP, size: 0.06, sizeEnd: 0, life: 0.5, shape: 'spark' });
            } else if (inUpdraft) { updraftT -= dt; if (updraftT <= 0) { inUpdraft = false; ev('updraftExit', { position: pos.clone() }); } }
          } else vy -= GRAVITY * dt * (actOn ? action.gravityMul : 1);
        }

        // ---------- integrate ----------
        pos.x += (hv.x + velocity.x + (actOn ? action.vel.x : 0)) * dt;
        pos.z += (hv.z + velocity.z + (actOn ? action.vel.z : 0)) * dt;
        pos.y += vy * dt;
        const fr = grounded ? 9 : 0.8;
        velocity.x *= Math.exp(-fr * dt); velocity.z *= Math.exp(-fr * dt);

        try { W()?.resolveCollision?.(pos, entity.radius); } catch (e) { /* */ }
        const bounds = W()?.bounds;
        if (Number.isFinite(bounds)) {
          const r = Math.hypot(pos.x, pos.z);
          if (r > bounds) { pos.x *= bounds / r; pos.z *= bounds / r; }
        }
        // slope limit: can't walk / jump-climb faces steeper than ~53 degrees
        {
          const mx = pos.x - prevX, mz = pos.z - prevZ, step = Math.hypot(mx, mz);
          if (step > 1e-4) {
            const g0 = groundAt(prevX, prevZ), g1 = groundAt(pos.x, pos.z);
            const tooSteep = (gx, gz) => {
              const st = Math.hypot(gx - prevX, gz - prevZ); if (st < 1e-5) return false;
              const gg = groundAt(gx, gz);
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
          // very steep ground under us (e.g. pushed onto a cliff): slide down
          if (wasGrounded) {
            const e = 0.6, gx0 = groundAt(pos.x - e, pos.z), gx1 = groundAt(pos.x + e, pos.z), gz0 = groundAt(pos.x, pos.z - e), gz1 = groundAt(pos.x, pos.z + e);
            const sx = (gx1 - gx0) / (2 * e), sz = (gz1 - gz0) / (2 * e);
            if (sx * sx + sz * sz > 1.33 * 1.33 * 1.3) { pos.x -= sx * 6 * dt; pos.z -= sz * 6 * dt; }
          }
        }
        // deep water: don't walk in from the shore
        gh = groundAt(pos.x, pos.z);
        depth = waterDepth(pos.x, pos.z, gh);
        if (depth > DEEP_WATER && !swimming && (grounded || pos.y < wl)) {
          pos.x = prevX; pos.z = prevZ; hv.multiplyScalar(-0.2);
          gh = groundAt(pos.x, pos.z); depth = waterDepth(pos.x, pos.z, gh);
        }
        const floor = depth > DEEP_WATER ? wl - DEEP_WATER : gh;

        // ---------- ground ----------
        const snap = wasGrounded && vy <= 0 ? 0.45 : 0;
        if (pos.y <= floor + snap && vy <= 0) {
          pos.y = floor;
          if (!wasGrounded && airTime > 0.12) {
            const impact = Math.min(vyBefore, vy);
            squash = clamp(-impact / 16, 0.2, 1);
            ev('land', { position: pos.clone() });
            if (impact < -6) {
              const c = 0xeadfc6;
              v1.copy(pos).setY(pos.y + 0.08);
              vfxCall('burst', v1, { count: impact < -12 ? 18 : 10, color: c, speed: 2.8, spread: 0.35, dir: v2.set(0, 0.15, 0), size: 0.35, sizeEnd: 0.9, life: 0.6, shape: 'smoke', additive: false, drag: 3.5 });
              if (impact < -10) vfxCall('shockwave', v1, { color: 0xfff6dc, radius: 2.2, duration: 0.35, opacity: 0.45, thickness: 0.2 });
            }
            endGlide();
          }
          vy = 0; grounded = true;
        } else grounded = false;

        // ---------- stamina ----------
        if (sprinting) { stamina -= 18 * dt; lastStamUse = t; }
        else if (gliding) { stamina -= (inUpdraft ? 4 : 10) * dt; lastStamUse = t; }
        else if (blocking && cls === 'sword') lastStamUse = t;
        else if (t - lastStamUse > 0.5) stamina += (grounded ? 30 : 12) * dt;
        if (stamina <= 0) { stamina = 0; exhausted = true; sprinting = false; endGlide(); }
        if (exhausted && stamina >= 30) exhausted = false;
        stamina = Math.min(maxStam(), stamina);

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

      // ---------- MP regen ----------
      if (entity.alive && t - lastMpSpend > 0.8) mp = Math.min(100, mp + 9 * dt);

      // ---------- facing ----------
      const aiming = cls === 'mage' && (charging || castRecent > 0 || blocking) && !dying;
      const hspeed = Math.hypot(hv.x, hv.z);
      let target = facing, turnL = aiming ? 22 : (gliding ? 5 : 12);
      if (aiming) target = yaw + Math.PI;
      else if (actOn && action.facing != null) { target = action.facing; turnL = action.turn; }
      else if (cls === 'sword' && blocking) { target = yaw + Math.PI; turnL = 16; }
      else if (actOn) target = facing;
      else if (dashT > 0) target = facing;
      else if (hspeed > 0.6 && blinkT <= 0) target = Math.atan2(hv.x, hv.z);
      prevFacing = facing;
      if (!dying && canAct) facing = dampAngle(facing, target, turnL, dt);
      root.rotation.set(0, facing + (actOn ? action.bodyYaw : 0), 0);
      turnRate = dt > 0 ? damp(turnRate, angleDiff(prevFacing, facing) / dt, 10, dt) : turnRate;
      bank = damp(bank, clamp(-turnRate * 0.045 * clamp(hspeed / 6, 0, 1.4), -0.3, 0.3) + (gliding ? clamp(-turnRate * 0.12, -0.45, 0.45) : 0), 8, dt);

      // ---------- footsteps ----------
      const gSpeed = grounded && blinkT <= 0 ? hspeed : 0;
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

      // ---------- animation weights ----------
      speedFrac = damp(speedFrac, clamp(gSpeed / WALK, 0, 1.7), 10, dt);
      wSprint = damp(wSprint, sprinting ? 1 : 0, 6, dt);
      wAir = damp(wAir, !grounded && !gliding && blinkT <= 0 ? 1 : 0, grounded ? 14 : 7, dt);
      wGlide = damp(wGlide, gliding ? 1 : 0, 6, dt);
      const actionTarget = (castKind || charging || (blocking && cls === 'mage')) && !dying ? 1 : 0;
      wAction = damp(wAction, actionTarget, actionTarget ? 22 : 7, dt);
      wAim = damp(wAim, aiming ? 1 : 0, 7, realDt);
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
      if (charging || (blocking && cls === 'mage')) A.castKind = null;
      A.chargeFrac = chargeFrac; A.hurt = hurt; A.squash = squash;
      A.dead = deadW < 1 ? deadW * deadW * (3 - 2 * deadW) : 1;
      A.bank = bank; A.vy = grounded ? 0 : vy; A.localVx = lvx; A.localVz = lvz;
      A.aimPitch = aimPitch;
      A.flare = clamp(wGlide * 0.9 + (grounded ? 0 : clamp(-vy / 14, 0, 0.7)), 0, 1);
      A.flutter = clamp(wGlide + wSprint * 0.4 + clamp(-vy / 20, 0, 0.5), 0, 1.5);
      A.accel = accelF * 0.05;
      // ---------- swordsman stance / action pose ----------
      const isSword = cls === 'sword';
      if (isSword && (actOn || blocking)) swordDrawn = true;
      drawnW = damp(drawnW, isSword && swordDrawn && !dying ? 1 : 0, 18, dt || realDt);
      if (isSword) {
        gear.sword.visible = swordDrawn; gear.sheathed.visible = !swordDrawn;
        if (blocking) lerpPose(stancePose, STANCE.idle, STANCE.guard, 1);
        else {
          lerpPose(stancePose, STANCE.idle, STANCE.run, clamp(speedFrac / 1.4, 0, 1) * (1 - wAir) * (1 - wGlide));
          if (wAir > 0.01) lerpPose(stancePose, stancePose, STANCE.air, wAir);
          if (wGlide > 0.01) lerpPose(stancePose, stancePose, STANCE.glide, wGlide);
        }
        lerpPose(finalPose, stancePose, action.pose, actOn ? action.poseW : 0);
        const w = drawnW;
        A.swTw = finalPose[6] * w; A.swTl = finalPose[7] * w; A.swCr = finalPose[8] * w; A.swHy = finalPose[9] * w;
        A.swHd = finalPose[14] * w; A.swBk = finalPose[15] * w;
        if (actOn || blocking) { A.wAction = 0; A.castKind = null; }
      } else { A.swTw = A.swTl = A.swCr = A.swHy = A.swHd = A.swBk = 0; }
      anim.update(A);
      if (isSword && drawnW > 0.001) applySwordArms(rig, gear, finalPose, drawnW);
      root.updateMatrixWorld(true);
      if (isSword) {
        gear.edgeMat.uniforms.uTime.value = t;
        const ei = 0.55 + (actOn ? 0.45 : 0) + perfectFx * 0.8 + (counterReady > 0 ? 0.6 : 0);
        gear.edgeMat.uniforms.uIntensity.value = damp(gear.edgeMat.uniforms.uIntensity.value, ei, 10, realDt);
      }
      barrier.update(realDt, blocking && cls === 'mage', pos, t);

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
      rig.light.intensity = cls === 'sword' ? 0 : (0.18 + Math.sin(t * 6.3) * 0.03) * glow * glow;
      rig.light.distance = 5 + chargeFrac * 4;
      for (let i = 0; i < rig.motes.length; i++) {
        const a = t * (2.2 + i * 0.37) + i * 1.9;
        const rr = (0.15 + 0.03 * Math.sin(t * 3 + i)) * (1 - chargeFrac * 0.45);
        rig.motes[i].position.set(Math.cos(a) * rr, Math.sin(a * 1.3 + i) * 0.1, Math.sin(a) * rr);
        rig.motes[i].rotation.y = a * 2;
      }

      // ---------- charge circle + converging particles ----------
      api.getStaffTip(tipV);
      if (charging) {
        v2.subVectors(camPos, tipV); // fallback dir
        v3.copy(camFwd);
        v1.copy(tipV).addScaledVector(v3, 0.22);
        chargeCircle.group.position.copy(v1);
        chargeCircle.group.lookAt(v4.copy(v1).add(v3));
        convergeT -= dt;
        if (convergeT <= 0) {
          convergeT = 0.035 - chargeFrac * 0.015;
          const c = ELEMENT_COLORS[chargeEl] ?? ELEMENT_COLORS[element];
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
          vfxCall('burst', v1, { count: 2, color: [ELEMENT_COLORS[element], 0xffffff], speed: 0.6, spread: 1, size: 0.07, sizeEnd: 0, life: 0.8, gravity: 2.5, shape: 'spark' });
        }
      }
      sigil.update(dt, gliding, 1, 2.2, 0.85);
      // sigil disc is horizontal: lookAt not needed; RuneCircle.update only scales/spins its children

      ghosts.update(dt);

      // ---------- cape ----------
      wind.set(0.7 - hv.x * 0.05, 0, 0.35 - hv.z * 0.05);
      if (gliding) wind.y = 3;
      cape.update(dt, groundAt, wind, clamp(wGlide + wSprint * 0.5 + (grounded ? 0 : 0.3), 0, 1.5));

      // ---------- camera ----------
      updateCamera(realDt);
    },
  };

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
    const dist = lerp(CAM_DIST, CAM_DIST_AIM, wAim) - wGlide * 0 + wSprint * 0.3;
    const shoulder = lerp(SHOULDER, SHOULDER_AIM, wAim);
    v1.set(pos.x, pos.y + PIVOT_H - squash * 0.12 - (deadW * 0.8), pos.z);
    if (camSnap) { pivot.copy(v1); camDist = dist; }
    else {
      const lamXZ = blinkT > 0 ? 14 : 22;
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
    const fov = BASE_FOV + wFov * 7;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  game.combat?.register?.(entity);
  // position immediately so other modules created later can read it
  placeAtSpawn();
  return api;
}
