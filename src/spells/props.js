// Instanced erupting props (rock pillars, ice spikes), ground sigils, charge orb.
import * as THREE from 'three';
import { GLINT } from './palette.js';
import {
  pillarGeo, rockMat, crystalGeo, iceMatSolid, outlineBasic, sigilMat, makeGroundDisc, conformDisc,
  fresnelMat, coreMat, tornadoMat,
} from './assets.js';

const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Pool of instanced props that erupt from the ground, hold, then sink. */
class Eruptors {
  constructor(scene, geo, mat, max, outlineColor, outlineScale = 1.07) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.outline = new THREE.InstancedMesh(geo, outlineBasic(outlineColor), max);
    this.outline.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.outline.frustumCulled = false; this.outline.count = 0;
    scene.add(this.outline);
    this.os = outlineScale;
    this.items = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
    this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  spawn(x, y, z, { height = 2, width = 1, delay = 0, rise = 0.14, hold = 1.5, sink = 0.45, tiltX = 0, tiltZ = 0, yaw = Math.random() * 6.28 } = {}) {
    // v4: an override (spells looks: ice spikes → FM prisms) may take the eruption instead of the instanced prop
    if (this.override && this.override(x, y, z, { height, width, delay, rise, hold, sink, tiltX, tiltZ, yaw }) === true) return;
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, y, z, height, width, delay, rise, hold, sink, tiltX, tiltZ, yaw, t: 0 });
  }
  update(dt, cam) {
    let n = 0, no = 0;
    const { m, q, e, p, s } = this;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const t = it.t - it.delay;
      if (t < 0) continue;
      let k;
      if (t < it.rise) k = easeOutBack(t / it.rise);
      else if (t < it.rise + it.hold) k = 1;
      else if (t < it.rise + it.hold + it.sink) k = 1 - (t - it.rise - it.hold) / it.sink;
      else { this.items.splice(i, 1); continue; }
      const sinkY = t > it.rise + it.hold ? -(1 - k) * it.height * 0.9 : 0;
      p.set(it.x, it.y - 0.3 + sinkY, it.z);
      e.set(it.tiltX, it.yaw, it.tiltZ); q.setFromEuler(e);
      s.set(it.width, it.height * Math.max(0.01, Math.min(k, 1.15)), it.width);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(n, m);
      // Skip the inverted-hull outline when the camera is near: inside the hull its black back faces fill the view.
      const near = cam && Math.hypot(cam.x - it.x, cam.z - it.z) < it.width * 1.6 + 1.2 && cam.y < it.y + it.height * 1.3 + 1;
      if (!near) {
        s.multiplyScalar(this.os); s.y = s.y / this.os * (1 + (this.os - 1) * 0.4);
        m.compose(p, q, s);
        this.outline.setMatrixAt(no++, m);
      }
      n++;
    }
    this.mesh.count = n; this.outline.count = no;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
    if (no) this.outline.instanceMatrix.needsUpdate = true;
  }
}

export function createProps(game) {
  const scene = game.scene;
  const pillars = new Eruptors(scene, pillarGeo(), rockMat(), 200, 0x2a1c10, 1.08);
  const spikes = new Eruptors(scene, crystalGeo(), iceMatSolid(), 220, 0x1d4a66, 1.1);
  const height = (x, z) => { try { return game.world?.getHeight ? game.world.getHeight(x, z) : 0; } catch (_) { return 0; } };

  // ---- sigils ----
  const sigilPool = [], sigils = [];
  const makeSigil = (color) => {
    const mat = sigilMat(color);
    mat.map = mat.map.clone(); mat.map.center.set(0.5, 0.5);
    const s = new THREE.Mesh(makeGroundDisc(10), mat);
    s.renderOrder = 4; s.frustumCulled = false; s.name = 'spells-sigil';
    return s;
  };
  // v4: the rune circles are pre-built (0 new materials / textures per cast; adopted by spells.js like every spell object)
  for (let i = 0; i < 10; i++) sigilPool.push(makeSigil(GLINT));
  function sigil(pos, { color = GLINT, radius = 3, duration = 1.2, spin = 1.2, grow = 0.2 } = {}) {
    let s = sigilPool.pop();
    if (!s) { s = makeSigil(color); onNewSigil?.(s); }
    s.material.color.set(color);
    conformDisc(s.geometry, game.world, pos.x, pos.z, radius, 0.12);
    s.position.set(pos.x, 0, pos.z);
    Object.assign(s.userData, { t: 0, duration, spin, grow, radius });
    s.scale.setScalar(0.01);
    scene.add(s); sigils.push(s);
    return s;
  }

  // ---- charge orb at staff tip ----
  const chargeGroup = new THREE.Group();
  const chargeCore = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), coreMat(0xff6a1f, 1.2));
  const chargeShell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fresnelMat(0xff6a1f, { power: 1.6, intensity: 1.2 }));
  const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 40);
  const ringMat = fresnelMat(GLINT, { power: 0.5, intensity: 1.2, core: 0.6 });
  const chargeRing = new THREE.Mesh(ringGeo, ringMat);
  const chargeRing2 = new THREE.Mesh(ringGeo, ringMat);
  chargeGroup.add(chargeCore, chargeShell, chargeRing, chargeRing2);
  chargeGroup.visible = false;
  scene.add(chargeGroup);
  const tip = new THREE.Vector3();

  function setCharge(active, color, frac, dt) {
    chargeGroup.visible = !!active;
    if (!active) return;
    try { game.player.getStaffTip(tip); } catch (_) { return; }
    chargeGroup.position.copy(tip);
    const t = game.time;
    const s = 0.08 + frac * 0.32 + Math.sin(t * 30) * 0.01;
    chargeCore.scale.setScalar(s * 0.6);
    chargeShell.scale.setScalar(s * 1.25);
    chargeCore.material.uniforms.color.value.set(color);
    chargeShell.material.uniforms.color.value.set(color);
    ringMat.uniforms.color.value.set(color);
    const full = frac >= 1;
    chargeRing.scale.setScalar(s * (1.6 + Math.sin(t * 8) * 0.1) * (full ? 1.25 : 1));
    chargeRing2.scale.setScalar(s * 2.0 * (full ? 1.3 : 1));
    chargeRing.rotation.set(t * 3.1, t * 2.3, 0);
    chargeRing2.rotation.set(-t * 2.2, 0, t * 2.7);
  }

  // ---- gust cone (Gale Burst) ----
  const gustGeo = new THREE.CylinderGeometry(1, 0.12, 1, 28, 1, true);
  gustGeo.rotateX(Math.PI / 2); gustGeo.translate(0, 0, 0.5);
  const gustPool = [], gusts = [];
  function gust(pos, dir, length, color) {
    let g = gustPool.pop();
    if (!g) { g = new THREE.Mesh(gustGeo, tornadoMat()); g.renderOrder = 6; g.frustumCulled = false; }
    g.material.uniforms.colA.value.set(GLINT); g.material.uniforms.colB.value.set(color);
    g.material.uniforms.speed.value = 2.5;
    g.position.copy(pos);
    g.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
    g.userData = { t: 0, length };
    scene.add(g); gusts.push(g);
  }

  function update(dt) {
    pillars.update(dt, game.camera.position); spikes.update(dt, game.camera.position);
    for (let i = gusts.length - 1; i >= 0; i--) {
      const g = gusts[i], u = g.userData; u.t += dt;
      const k = u.t / 0.45;
      if (k >= 1) { scene.remove(g); gusts.splice(i, 1); gustPool.push(g); continue; }
      const e = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
      const L = u.length * e;
      g.scale.set(L * 0.55, L * 0.55, L);
      g.material.uniforms.opacity.value = 1.4 * (1 - k);
    }
    for (let i = sigils.length - 1; i >= 0; i--) {
      const s = sigils[i], u = s.userData;
      u.t += dt;
      const k = u.t / u.duration;
      if (k >= 1) { scene.remove(s); sigils.splice(i, 1); sigilPool.push(s); continue; }
      const g = Math.min(1, u.t / u.grow);
      s.scale.set(g, 1, g);
      s.material.opacity = (k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2) * (0.75 + Math.sin(game.time * 20) * 0.1);
      s.material.map.rotation = u.t * u.spin;
    }
  }

  let onNewSigil = null;
  /** Remove every live prop (tests: playtest4 magic isolates casts). */
  function clear() {
    pillars.items.length = 0; spikes.items.length = 0; pillars.mesh.count = 0; spikes.mesh.count = 0; pillars.outline.count = 0; spikes.outline.count = 0;
    for (const s of sigils.splice(0)) { scene.remove(s); sigilPool.push(s); }
    for (const g of gusts.splice(0)) { scene.remove(g); gustPool.push(g); }
  }
  return { pillars, spikes, sigil, gust, setCharge, update, height, chargeGroup, sigilPool, clear, set onNewSigil(fn) { onNewSigil = fn; } };
}
