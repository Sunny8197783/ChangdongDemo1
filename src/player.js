// Player: wizard hero, third-person controller, camera, aim, stats.
import * as THREE from 'three';
import { ELEMENT_COLORS, clamp, lerp, damp, dampAngle, angleDiff, rand } from './core/utils.js';
import { buildWizard } from './player/model.js';
import { Cape } from './player/cape.js';
import { RuneCircle, Afterimages } from './player/fx.js';
import { Animator, CAST_DUR } from './player/anim.js';

const WALK = 5.5, SPRINT = 9, GRAVITY = 22, JUMP_VEL = 8;
const GLIDE_FALL = 2.5, GLIDE_SPEED = 8;
const BLINK_DIST = 9, BLINK_TIME = 0.12, BLINK_CD = 1.2, BLINK_MP = 8;
const SENS = 0.0022, PITCH_MIN = -1.15, PITCH_MAX = 0.85;
const CAM_DIST = 5.5, CAM_DIST_AIM = 3.8, SHOULDER = 1.2, SHOULDER_AIM = 0.85, PIVOT_H = 1.85;
const BASE_FOV = 62;
const DEEP_WATER = 1.15;
const AIM_CONE = Math.cos(THREE.MathUtils.degToRad(4.5));

export function createPlayer(game) {
  const { scene, camera, events, input } = game;

  const rig = buildWizard();
  const root = rig.root;
  root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow && o.name !== 'outline'; });
  scene.add(root);
  const anim = new Animator(rig);
  const cape = new Cape(scene, rig.torso, rig.capeAnchors, 9, 0.112);
  const chargeCircle = new RuneCircle(scene, 1.15);
  const sigil = new RuneCircle(scene, 1.9);
  const ghosts = new Afterimages(scene, root, 6);

  // ---------- entity ----------
  const velocity = new THREE.Vector3();
  const entity = {
    id: 'player', team: 'player', alive: true, object: root, radius: 0.4, height: 1.8,
    hp: 100, maxHp: 100, mass: 1, velocity, grounded: true, statuses: {}, name: '마법사',
    isPlayer: true, invulnerable: false,
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
  let blinkT = 0, blinkCd = 0, invulT = 0, ghostTimer = 0;
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
  const groundAt = (x, z) => { const h = W()?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; };
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
    hurt = 1;
    if (charging) gemFlare = 0.3;
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
    entity.alive = true; entity.hp = entity.maxHp; mp = 100; stamina = 100; exhausted = false;
    dying = false; deadW = 0; deadTime = 0; hurt = 0; blinkT = 0; blinkCd = 0; invulT = 1.5; entity.invulnerable = true;
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
    entity.invulnerable = true; invulT = BLINK_TIME + 0.18;
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

  function endGlide() { if (gliding) { gliding = false; ev('glideEnd', { position: pos.clone() }); } }

  // ---------- api ----------
  const api = {
    entity, object: root, rig,
    get hp() { return entity.hp; }, set hp(v) { entity.hp = v; },
    get maxHp() { return entity.maxHp; }, set maxHp(v) { entity.maxHp = v; },
    get mp() { return mp; }, set mp(v) { mp = clamp(v, 0, 100); }, maxMp: 100,
    get stamina() { return stamina; }, set stamina(v) { stamina = clamp(v, 0, 100); }, maxStamina: 100,
    get exhausted() { return exhausted; },
    get gliding() { return gliding; }, get sprinting() { return sprinting; },
    get grounded() { return grounded; },
    get blinkCooldown() { return blinkCd; }, blinkCooldownMax: BLINK_CD, blinkCost: BLINK_MP,
    get element() { return element; },
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
      events.on('stateChange', (p) => { if (p?.state === 'playing' && p.prev === 'title') camSnap = true; });
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
      const t = game.time;
      const combat = game.combat;
      let canAct = entity.alive && !dying;
      try { if (canAct && combat?.canAct) canAct = combat.canAct(entity) !== false; } catch (e) { /* */ }
      let sm = 1;
      try { sm = combat?.speedMul ? (combat.speedMul(entity) ?? 1) : 1; } catch (e) { /* */ }

      // ---------- camera look input ----------
      if (!dying) {
        yaw -= input.mouseDX * SENS;
        pitch = clamp(pitch - input.mouseDY * SENS, PITCH_MIN, PITCH_MAX);
      }
      camFwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));

      // ---------- timers ----------
      blinkCd = Math.max(0, blinkCd - dt);
      if (invulT > 0) { invulT -= dt; if (invulT <= 0) entity.invulnerable = false; }
      castRecent = Math.max(0, castRecent - dt);
      gemFlare = Math.max(0, gemFlare - dt * 2.2);
      hurt = Math.max(0, hurt - dt * 3.2);
      squash = Math.max(0, squash - dt * 4);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (castKind) { castT += dt; if (castT >= CAST_DUR[castKind]) castKind = null; }

      // ---------- move intent ----------
      const ix = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      const iz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      v1.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      wish.set(0, 0, 0).addScaledVector(camRight, ix).addScaledVector(v1, iz);
      if (wish.lengthSq() > 1) wish.normalize();
      if (!canAct) wish.set(0, 0, 0);
      const moving = wish.lengthSq() > 0.01;

      if (input.pressed('Space') && canAct) jumpBuffer = 0.12;
      if (input.pressed('KeyQ')) tryBlink(canAct);

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
        if (ghostTimer <= 0) { ghostTimer = 0.024; ghosts.spawn(pos, facing, elemColor, 0.38, 0.75); }
        if (blinkT <= 0) endBlink();
        vy = 0; grounded = blinkT > 0 ? grounded : pos.y <= groundAt(pos.x, pos.z) + 0.01;
      } else {
        // ---------- stamina / sprint ----------
        const wantSprint = input.down('ShiftLeft') && moving && grounded && !exhausted && canAct && !charging;
        sprinting = wantSprint && stamina > 0;
        // ---------- water ----------
        let gh = groundAt(pos.x, pos.z);
        depth = waterDepth(pos.x, pos.z, gh);
        const swimming = depth > DEEP_WATER;
        const wade = depth > 0 ? clamp(1 - depth * 0.45, 0.45, 1) : 1;

        let speed = sprinting ? SPRINT : WALK;
        if (charging) speed *= 0.55;
        else if (castKind || castRecent > 0.3) speed *= 0.8;
        speed *= sm * wade;
        if (swimming) speed = Math.min(speed, 2.6);

        // ---------- jump ----------
        if (grounded) { coyote = 0.12; airTime = 0; } else { coyote -= dt; airTime += dt; }
        if (jumpBuffer > 0 && coyote > 0 && canAct && !swimming) {
          vy = JUMP_VEL; grounded = false; coyote = 0; jumpBuffer = 0;
          ev('jump', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y + 0.05), { count: 6, color: 0xe9dfc4, speed: 1.4, spread: 0.7, dir: UP, size: 0.3, sizeEnd: 0.7, life: 0.45, shape: 'smoke', additive: false, drag: 3 });
        }

        // ---------- glide ----------
        const heightAbove = pos.y - (depth > 0 ? Math.max(gh, wl) : gh);
        const canGlide = !grounded && input.down('Space') && canAct && !exhausted && stamina > 0 && airTime > 0.22 && vy < 0.5 && heightAbove > 0.9;
        if (canGlide && !gliding) {
          gliding = true; ev('glideStart', { position: pos.clone() });
          vfxCall('burst', v1.copy(pos).setY(pos.y - 0.1), { count: 22, color: [ELEMENT_COLORS[element], 0xffffff], speed: 3, spread: 0.25, dir: v2.set(0, -0.2, 0), size: 0.1, life: 0.6, shape: 'spark', drag: 2 });
        } else if (!canGlide && gliding) endGlide();

        // ---------- horizontal ----------
        if (gliding) {
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
        const vyBefore = vy;
        if (!grounded) {
          if (gliding) {
            if (vy < -GLIDE_FALL) vy = damp(vy, -GLIDE_FALL, 6, dt);
            else vy = Math.max(vy - GRAVITY * 0.25 * dt, -GLIDE_FALL);
          } else vy -= GRAVITY * dt;
        }

        // ---------- integrate ----------
        pos.x += (hv.x + velocity.x) * dt;
        pos.z += (hv.z + velocity.z) * dt;
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
        else if (gliding) { stamina -= 10 * dt; lastStamUse = t; }
        else if (t - lastStamUse > 0.5) stamina += (grounded ? 30 : 12) * dt;
        if (stamina <= 0) { stamina = 0; exhausted = true; sprinting = false; endGlide(); }
        if (exhausted && stamina >= 30) exhausted = false;
        stamina = Math.min(100, stamina);

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
      const aiming = (charging || castRecent > 0) && !dying;
      const hspeed = Math.hypot(hv.x, hv.z);
      let target = facing;
      if (aiming) target = yaw + Math.PI;
      else if (hspeed > 0.6 && blinkT <= 0) target = Math.atan2(hv.x, hv.z);
      prevFacing = facing;
      if (!dying && canAct) facing = dampAngle(facing, target, aiming ? 22 : (gliding ? 5 : 12), dt);
      root.rotation.set(0, facing, 0);
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
      const actionTarget = (castKind || charging) && !dying ? 1 : 0;
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
      if (charging) A.castKind = null;
      A.chargeFrac = chargeFrac; A.hurt = hurt; A.squash = squash;
      A.dead = deadW < 1 ? deadW * deadW * (3 - 2 * deadW) : 1;
      A.bank = bank; A.vy = grounded ? 0 : vy; A.localVx = lvx; A.localVz = lvz;
      A.aimPitch = aimPitch;
      A.flare = clamp(wGlide * 0.9 + (grounded ? 0 : clamp(-vy / 14, 0, 0.7)), 0, 1);
      A.flutter = clamp(wGlide + wSprint * 0.4 + clamp(-vy / 20, 0, 0.5), 0, 1.5);
      A.accel = accelF * 0.05;
      anim.update(A);
      root.updateMatrixWorld(true);

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
      rig.light.intensity = (0.18 + Math.sin(t * 6.3) * 0.03) * glow * glow;
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
  const CAM_SOLID = { pillar: 9, arch: 8, hut: 5, tent: 3.5, tower: 9, rubble: 1.4, rack: 2, crate: 1.2, stake: 2.8, totem: 3.2 }; // trees: see-through dither instead (world/prefab.js occludable)
  const CAM_PAD = { tree: 0.05, stake: 0.15, totem: 0.2 };
  let camHoldT = 0;
  function propBoomLimit(dist, shoulder) {
    const cols = W()?.colliders;
    if (!cols || !cols.length) return dist;
    // boom end (horizontal) relative to pivot at f=1
    const dx = camRight.x * shoulder - camFwd.x * dist, dz = camRight.z * shoulder - camFwd.z * dist;
    const dy = -camFwd.y * dist;
    const a = dx * dx + dz * dz; if (a < 1e-6) return dist;
    const reach = Math.sqrt(a) + 4;
    let best = 1;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const hgt = c.kind === 'rock' ? c.r * 1.3 : CAM_SOLID[c.kind];
      if (!hgt) continue;
      const ox = pivot.x - c.x, oz = pivot.z - c.z;
      const rr = c.r + (CAM_PAD[c.kind] ?? 0.35);
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
