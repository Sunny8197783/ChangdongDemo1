// v3 정령의 문 (spirit gates) + shrines (CONTRACT §13, DESIGN §8.2 / §5.5).
// Gates: 5 stone arches (1 InstancedMesh + outline) with a living spirit veil (1 instanced ShaderMaterial). Walking near a
// gate marks it reached; F (game.interact) opens ui.openGateMenu(list, onPick) → travelTo(id): a 1.2 s fade teleport that
// emits gateTravel {from, to}. Gates are respec spots. Shrines: 8 정령의 씨앗 (+1 point), 4 spirit shrines, landmarks —
// proximity 3 m → shrineFound {id, kind}. Pedestals are 1 InstancedMesh + outline, seeds/crystals 1 InstancedMesh.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { elColor } from '../core/elements.js';
import { part, merge, mat4, outlineMat, occludable } from './prefab.js';
import { GATE_DEFS, GATE_REACH_R, GATE_USE_R, SHRINE_DEFS, SHRINE_R, ZONE_DEFS } from './zones.js';

const C = (h) => new THREE.Color(h);
const ZONE_NAME = Object.fromEntries(ZONE_DEFS.map((z) => [z.id, z.name]));
const TEXT = {
  gateLabel: '정령의 문',
  gateHint: '정령의 문 — 이동할 곳을 고르세요',
  noOther: '아직 다른 정령의 문을 찾지 못했습니다',
  gateFound: (n) => `정령의 문 발견 — ${n}`,
};

function archGeometry() {
  const P = [];
  const stone = (x, y, z, c) => {
    const a = C(0xc9c2b2), b = C(0x958d7e), m = C(0x7aa04e);
    c.copy(a).lerp(b, (Math.sin(x * 3.1 + y * 2.3) * Math.sin(z * 2.7 - y * 1.9) * 0.5 + 0.5) * 0.6);
    if (y < 0.9 && Math.sin(x * 4 + z * 3) > 0.2) c.lerp(m, 0.55);
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1, 2, 3, 2);
  // two leaning standing stones
  for (const s of [-1, 1]) {
    P.push(part(BOX, stone, mat4(s * 1.75, 2.0, 0, 0, 0, s * -0.05, 0.85, 4.0, 0.8), { jitter: 0.12 }));
    P.push(part(BOX, stone, mat4(s * 1.8, 0.25, 0, 0, 0.2 * s, 0, 1.3, 0.5, 1.2), { jitter: 0.1 }));
    P.push(part(new THREE.ConeGeometry(0.5, 0.9, 5), stone, mat4(s * 1.7, 4.35, 0, 0, 0.4, s * -0.2, 1, 1, 0.9)));
  }
  // arched lintel (segments of a half-ring)
  const seg = 7;
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg), am = (a0 + a1) / 2;
    const x = Math.cos(am) * 1.75, y = 4.0 + Math.sin(am) * 1.1;
    P.push(part(BOX, stone, mat4(x, y, 0, 0, 0, am - Math.PI / 2, 0.8, 0.6, 0.75), { jitter: 0.06 }));
  }
  // keystone
  P.push(part(new THREE.OctahedronGeometry(0.42, 0), C(0xe8e2d4), mat4(0, 5.25, 0.05, 0, 0, Math.PI / 4, 1, 1.2, 0.6)));
  // stepping dais
  P.push(part(new THREE.CylinderGeometry(2.7, 2.95, 0.3, 14), stone, mat4(0, 0.05, 0.3)));
  return merge(P);
}

const VEIL_V = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute float aOn;
  varying vec2 vUv; varying float vOn;
  void main(){
    vUv = uv; vOn = aOn;
    vec4 mvPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const VEIL_F = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  varying vec2 vUv; varying float vOn;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    // arch-shaped mask: rectangle below, half-ellipse on top
    float m = p.y < 0.35 ? smoothstep(1.0, 0.86, abs(p.x)) : smoothstep(1.0, 0.86, length(vec2(p.x, (p.y - 0.35) / 0.65)));
    m *= smoothstep(-1.0, -0.88, p.y);
    float r = length(p * vec2(1.0, 0.75));
    float a = atan(p.y, p.x);
    float swirl = n2(vec2(a * 2.0 + uTime * 0.7 - r * 3.0, r * 4.0 - uTime * 1.3)) * 0.6 + n2(p * 5.0 + vec2(0.0, -uTime * 0.9)) * 0.4;
    float core = smoothstep(0.9, 0.0, r);
    vec3 cA = vec3(0.55, 1.0, 0.85), cB = vec3(0.75, 0.6, 1.0), cC = vec3(1.0, 0.95, 0.75);
    vec3 col = mix(cA, cB, swirl) + cC * core * 0.6;
    float on = mix(0.22, 1.0, vOn);
    float alpha = m * (0.25 + 0.55 * swirl + 0.35 * core) * on;
    float rim = smoothstep(0.86, 0.98, p.y < 0.35 ? abs(p.x) : length(vec2(p.x, (p.y - 0.35) / 0.65))) * m;
    col += vec3(1.0) * rim * 0.8 * on;
    gl_FragColor = vec4(col * (0.6 + 0.9 * on) * alpha, alpha);
    #include <fog_fragment>
  }`;

export function buildGates(game, world, { uTime, shrineY }) {
  const group = new THREE.Group(); group.name = 'spiritGates';
  game.scene.add(group);
  const H = world.getHeight;
  const gates = GATE_DEFS.map((d) => {
    const y = H(d.x, d.z);
    const fwd = new THREE.Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw));
    const exitX = d.x + fwd.x * 3.2, exitZ = d.z + fwd.z * 3.2;
    return {
      id: d.id, zoneId: d.zoneId, name: d.name, zoneName: ZONE_NAME[d.zoneId] || '', yaw: d.yaw,
      position: new THREE.Vector3(d.x, y, d.z),
      exit: new THREE.Vector3(exitX, H(exitX, exitZ), exitZ),
      reached: !!d.reached,
    };
  });
  const byId = Object.fromEntries(gates.map((g) => [g.id, g]));

  // ---------------------------------------------------------------- visuals
  const archGeo = archGeometry();
  const archMat = occludable(toonMat(0xffffff, { vertexColors: true }));
  const arches = new THREE.InstancedMesh(archGeo, archMat, gates.length);
  const archOut = new THREE.InstancedMesh(archGeo, outlineMat(0.04, 0x26221c), gates.length);
  archOut.instanceMatrix = arches.instanceMatrix;
  arches.name = 'gateArches'; archOut.name = 'gateArchOutline';
  arches.receiveShadow = true; arches.castShadow = false;
  const veilGeo = new THREE.PlaneGeometry(3.1, 4.9, 1, 1); veilGeo.translate(0, 2.55, 0.02);
  const aOn = new THREE.InstancedBufferAttribute(new Float32Array(gates.length), 1);
  veilGeo.setAttribute('aOn', aOn);
  const veilMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: VEIL_V, fragmentShader: VEIL_F,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true,
  });
  veilMat.uniforms.uTime = uTime;
  const veils = new THREE.InstancedMesh(veilGeo, veilMat, gates.length);
  veils.name = 'gateVeils'; veils.renderOrder = 5;
  gates.forEach((g, i) => {
    const m = mat4(g.position.x, g.position.y - 0.05, g.position.z, 0, g.yaw, 0);
    arches.setMatrixAt(i, m); veils.setMatrixAt(i, m);
    aOn.array[i] = g.reached ? 1 : 0;
  });
  for (const m of [arches, veils]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  archOut.boundingSphere = arches.boundingSphere;
  group.add(arches, archOut, veils);
  // colliders: the two standing stones of each arch
  for (const g of gates) {
    const rx = Math.cos(g.yaw), rz = -Math.sin(g.yaw);
    for (const s of [-1, 1]) world.colliders.push({ x: g.position.x + rx * s * 1.75, z: g.position.z + rz * s * 1.75, r: 0.62, kind: 'gate' });
  }

  // ---------------------------------------------------------------- shrines
  const shrines = SHRINE_DEFS.map((d) => {
    const p = shrineY(d);   // resolves x/z (fords, pillar tops) and the stand height
    return { id: d.id, kind: d.kind, name: d.name, element: d.element || null, position: p, found: false, glow: 1 };
  });
  const shrineById = Object.fromEntries(shrines.map((s) => [s.id, s]));
  const pedGeo = (() => {
    const st = (x, y, z, c) => { c.copy(C(0xd2ccbc)).lerp(C(0x9b9384), (Math.sin(x * 5 + y * 4) * 0.5 + 0.5) * 0.5); if (y < 0.25) c.lerp(C(0x6f9a48), 0.5); };
    const P = [
      part(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 8), st, mat4(0, 0.17, 0)),
      part(new THREE.CylinderGeometry(0.28, 0.38, 0.55, 6), st, mat4(0, 0.6, 0)),
      part(new THREE.CylinderGeometry(0.5, 0.3, 0.22, 8), st, mat4(0, 0.97, 0)),
    ];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; P.push(part(new THREE.ConeGeometry(0.12, 0.42, 4), C(0x7fb85a), mat4(Math.cos(a) * 0.42, 1.12, Math.sin(a) * 0.42, Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6))); }
    return merge(P);
  })();
  const pedMat = occludable(toonMat(0xffffff, { vertexColors: true }));
  const peds = new THREE.InstancedMesh(pedGeo, pedMat, shrines.length);
  const pedOut = new THREE.InstancedMesh(pedGeo, outlineMat(0.03, 0x2a2620), shrines.length);
  pedOut.instanceMatrix = peds.instanceMatrix;
  peds.name = 'shrinePedestals'; peds.receiveShadow = true;
  const gemGeo = new THREE.IcosahedronGeometry(0.24, 0); gemGeo.scale(0.8, 1.35, 0.8);
  const gems = new THREE.InstancedMesh(gemGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), shrines.length);
  gems.name = 'shrineGems';
  const _c = new THREE.Color();
  const gemColor = (s, k = 1) => {
    if (s.kind === 'seed') _c.set(0x9bff7a); else if (s.kind === 'spirit') _c.set(elColor(s.element, 'hex')); else _c.set(0xffe7a8);
    return _c.multiplyScalar((s.found ? 0.6 : 2.0) * k);
  };
  shrines.forEach((s, i) => {
    const big = s.kind === 'spirit' ? 1.6 : s.kind === 'landmark' ? 0.85 : 1;
    peds.setMatrixAt(i, mat4(s.position.x, s.position.y - 0.05, s.position.z, 0, i * 1.7, 0, big, big, big));
    gems.setColorAt(i, gemColor(s));   // instanceColor exists from construction (no recompile on tint)
  });
  peds.instanceMatrix.needsUpdate = true; gems.instanceColor.needsUpdate = true;
  peds.computeBoundingSphere(); pedOut.boundingSphere = peds.boundingSphere;
  gems.frustumCulled = false;
  group.add(peds, pedOut, gems);

  // ---------------------------------------------------------------- fade overlay (DOM, real time)
  let fadeEl = null;
  function fadeDiv() {
    if (fadeEl || typeof document === 'undefined') return fadeEl;
    fadeEl = document.createElement('div');
    fadeEl.className = 'aw-gate-fade';
    Object.assign(fadeEl.style, { position: 'fixed', inset: '0', background: 'radial-gradient(circle at 50% 50%, #e8fff4 0%, #6fd3b0 35%, #0b1422 100%)', opacity: '0', pointerEvents: 'none', zIndex: '60' });
    (document.getElementById('ui') || document.body).appendChild(fadeEl);
    return fadeEl;
  }

  // ---------------------------------------------------------------- logic
  let travel = null;   // {to, from, t, done}
  let lastGate = 'gate_village';
  const FADE = 0.6;
  function nearestGate(p, maxD = Infinity) {
    let best = null, bd = maxD * maxD;
    for (const g of gates) { const d = g.position.distanceToSquared(p); if (d < bd) { bd = d; best = g; } }
    return best;
  }
  function setReached(g, on = true, quiet = false) {
    if (!g || g.reached === on) return;
    g.reached = on;
    aOn.array[gates.indexOf(g)] = on ? 1 : 0; aOn.needsUpdate = true;
    if (on && !quiet) {
      try { game.events?.emit?.('gateReached', { id: g.id, name: g.name }); } catch (_) { /* */ }
      try { game.ui?.toast?.(TEXT.gateFound(g.name)); } catch (_) { /* */ }
      try { game.audio?.play?.('gate_awaken', { position: g.position }); } catch (_) { /* */ }
    }
  }
  function menuList(cur) {
    return gates.map((g) => ({ id: g.id, name: g.name, zoneId: g.zoneId, zoneName: g.zoneName, reached: g.reached, current: g === cur }));
  }
  function openMenu(gateId) {
    const cur = byId[gateId];
    if (cur) setReached(cur, true);
    const list = menuList(cur);
    const ui = game.ui;
    if (ui?.openGateMenu) {
      try { ui.openGateMenu(list, (id) => { if (id && id !== cur?.id) api.travelTo(id); }); return true; } catch (err) { console.error('[world] openGateMenu', err); }
    }
    // fallback (ui without a gate menu): F cycles to the next reached gate
    const reached = gates.filter((g) => g.reached && g !== cur);
    if (!reached.length) { try { ui?.toast?.(TEXT.noOther); } catch (_) { /* */ } return true; }
    const i = cur ? gates.indexOf(cur) : -1;
    for (let k = 1; k <= gates.length; k++) { const g = gates[(i + k) % gates.length]; if (g.reached && g !== cur) { api.travelTo(g.id); break; } }
    return true;
  }
  for (const g of gates) {
    game.interact?.offer?.('gate:' + g.id, {
      pos: g.position, r: GATE_USE_R + 0.6, label: TEXT.gateLabel, priority: 2,
      enabled: () => !travel,
      onUse: () => openMenu(g.id),
    });
  }

  function placePlayer(g) {
    const P = game.player; const pp = P?.object?.position; if (!pp) return;
    const yaw = g.yaw;
    if (P.placeAt) { try { P.placeAt(g.exit, yaw); return; } catch (_) { /* fall through */ } }
    if (P.teleport) { try { P.teleport(g.exit, true); P.setFacing?.(yaw); P.setLook?.(yaw - Math.PI); return; } catch (_) { /* */ } }
    pp.copy(g.exit); P.entity?.velocity?.set?.(0, 0, 0);
  }

  const api = {
    gates, byId, shrines, shrineById, group,
    get traveling() { return !!travel; },
    get lastGate() { return lastGate; },
    nearestGate,
    openMenu,
    setReached(id, on = true) { setReached(byId[id], on, true); },
    menuList,
    /** 1.2 s fade teleport to a gate (reached gates only unless force). */
    travelTo(id, { force = false, instant = false } = {}) {
      const g = byId[id]; if (!g || travel) return false;
      if (!g.reached && !force && !game.progression?.debug?.ungate) return false;
      const pp = game.player?.object?.position;
      const from = pp ? nearestGate(pp, 12) : null;
      travel = { to: g, from, t: instant ? FADE : 0, done: false };
      try { game.input?.lock?.('gate'); } catch (_) { /* */ }
      try { game.audio?.play?.('gate_travel', { position: g.position }); } catch (_) { /* */ }
      fadeDiv();
      return true;
    },
    markShrine(id, quiet = false) {
      const s = shrineById[id]; if (!s || s.found) return false;
      s.found = true;
      const i = shrines.indexOf(s);
      gems.setColorAt(i, gemColor(s)); gems.instanceColor.needsUpdate = true;
      if (!quiet) {
        try { game.events?.emit?.('shrineFound', { id: s.id, kind: s.kind }); } catch (err) { console.error('[world] shrineFound', err); }
        try { game.vfx?.burst?.(s.position.clone().setY(s.position.y + 1.3), { count: 26, color: [0x9bff7a, 0xffffff, 0xffe08a], speed: 3.5, spread: 1, size: 0.12, sizeEnd: 0, life: 0.9, shape: 'spark', drag: 2 }); } catch (_) { /* */ }
        try { game.audio?.play?.(s.kind === 'seed' ? 'shrine_seed' : 'shrine_found', { position: s.position }); } catch (_) { /* */ }
      }
      return true;
    },
    setShrineGlow(id, on) {
      const s = shrineById[id]; if (!s) return false;
      s.glow = on ? (typeof on === 'number' ? on : 1.8) : 0.35;
      gems.setColorAt(shrines.indexOf(s), gemColor(s, s.glow)); gems.instanceColor.needsUpdate = true;
      return true;
    },
    /** Spawn point for 이어하기 (front of the last used / reached gate). */
    lastGateSpawn() { const g = byId[lastGate] || gates[0]; return g.exit.clone(); },
    serialize() { return { reached: gates.filter((g) => g.reached).map((g) => g.id), found: shrines.filter((s) => s.found).map((s) => s.id), last: lastGate }; },
    deserialize(o) {
      if (!o) return;
      if (Array.isArray(o.reached)) for (const g of gates) setReached(g, o.reached.includes(g.id) || !!GATE_DEFS.find((d) => d.id === g.id)?.reached, true);
      if (Array.isArray(o.found)) for (const id of o.found) api.markShrine(id, true);
      if (o.last && byId[o.last]) lastGate = o.last;
    },
    update(dt, realDt, t) {
      const pp = game.player?.object?.position;
      // travel fade (real time so hitstop / slow-mo never stall it)
      if (travel) {
        travel.t += Math.min(realDt || 0, 0.1);
        const T = travel.t;
        const op = T < FADE ? T / FADE : T < FADE * 2 ? 1 - (T - FADE) / FADE : 0;
        if (fadeEl) fadeEl.style.opacity = op.toFixed(3);
        if (!travel.done && T >= FADE) {
          travel.done = true;
          const to = travel.to, from = travel.from;
          placePlayer(to);
          lastGate = to.id;
          setReached(to, true, true);
          try { game.events?.emit?.('gateTravel', { from: from ? from.id : null, to: to.id }); } catch (err) { console.error('[world] gateTravel', err); }
          api.onArrive?.(to);
        }
        if (T >= FADE * 2) {
          travel = null;
          if (fadeEl) fadeEl.style.opacity = '0';
          try { game.input?.unlock?.('gate'); } catch (_) { /* */ }
        }
      }
      // gem bob + slow spin (only shrines near the camera)
      const cam = game.camera?.position;
      if (cam) {
        for (let i = 0; i < shrines.length; i++) {
          const s = shrines[i];
          const big = s.kind === 'spirit' ? 1.8 : s.kind === 'landmark' ? 0 : 1;
          const d2 = cam.distanceToSquared(s.position);
          const sc = s.found && s.kind === 'seed' ? 0 : big;
          if (d2 > 90 * 90) { _m.makeScale(0, 0, 0); gems.setMatrixAt(i, _m); continue; }
          _e.set(0, t * 1.1 + i, 0); _q.setFromEuler(_e);
          _p.copy(s.position); _p.y += (s.kind === 'spirit' ? 2.2 : 1.55) + Math.sin(t * 1.8 + i) * 0.12;
          _s.setScalar(sc);
          _m.compose(_p, _q, _s); gems.setMatrixAt(i, _m);
        }
        gems.instanceMatrix.needsUpdate = true;
      }
    },
    /** 4 Hz proximity checks (gates reached, shrines found). */
    tick4() {
      const pp = game.player?.object?.position; if (!pp || game.state === 'title') return;
      for (const g of gates) if (!g.reached && g.position.distanceToSquared(pp) < GATE_REACH_R * GATE_REACH_R) setReached(g, true);
      for (const s of shrines) {
        if (s.found) continue;
        const dx = s.position.x - pp.x, dz = s.position.z - pp.z, dy = s.position.y - pp.y;
        if (dx * dx + dz * dz < SHRINE_R * SHRINE_R && Math.abs(dy) < 2.6) api.markShrine(s.id);
      }
    },
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  return api;
}
