// ④⑤⑥ the ascent, 거울의 정원 (Kalis ledge) and 세계수 뿌리 고원 (root plateau) dressing (DESIGN §8.2). Heights are
// terrain (terraform.js). Here: the 5 root pillars (root-wrapped meshes over the terrain spires, colliders, a spirit
// rune each), static spirit updrafts (pillars + the ascent columns), root bands on the cliffs and the ramps, prism
// mirrors + crystal pillars on the ledge, the light-activated mirror door, scenery islands I1–I5 (merged, act ≥ 4),
// and the shared updraft-column visual (1 instanced draw call for every updraft volume).
// Draw calls: plateau toon + outline (2), glow (1), mirror glass (1), islands toon + outline + glow (3), updrafts (1),
// mirror door + outline (2) = 10.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { part, merge, mat4, outlineMat, occludable } from './prefab.js';
import { mulberry32 } from './noise.js';
import { TF } from './zones.js';
import { PILLARS } from './terraform.js';

const C = (h) => new THREE.Color(h);
const PL = TF.plateau, LD = TF.ledge;
export const MIRROR_TEXT = {
  door: '거울 문',
  hint: '거울 문 — 빛을 비추면 열릴 것 같다',
  open: '빛을 받은 거울 문이 열렸다',
};
/** Static updraft columns of the ascent (+ one per root pillar, added in build). */
export const ASCENT_DRAFTS = [
  { id: 'ascent1', x: 27, z: -129, r: 2.6, h: 44, strength: 22 },
  { id: 'ascent2', x: 33, z: -147, r: 2.6, h: 44, strength: 22 },
  { id: 'ascent3', x: 69, z: -143, r: 2.6, h: 28, strength: 22 },
];
/** Scenery islands I1–I5 (glide flavour only — never colliders or platforms). */
const ISLANDS = [
  { x: 30, z: -146, y: 66, r: 7 }, { x: 58, z: -122, y: 78, r: 9 }, { x: 84, z: -162, y: 84, r: 6 },
  { x: 92, z: -100, y: 92, r: 8 }, { x: 128, z: -152, y: 102, r: 11 },
];

const DRAFT_V = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv; varying vec3 vC; varying float vH;
  void main(){
    vUv = uv; vC = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor;
    #endif
    vec4 mvPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      vH = length(instanceMatrix[1].xyz);
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const DRAFT_F = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vH;
  void main(){
    float y = vUv.y * vH;
    float s1 = sin(vUv.x * 6.2832 * 3.0 + y * 0.55 - uTime * 3.2) * 0.5 + 0.5;
    float s2 = sin(vUv.x * 6.2832 * 5.0 - y * 0.8 - uTime * 4.5 + 1.7) * 0.5 + 0.5;
    float streak = pow(s1, 6.0) + pow(s2, 9.0) * 0.7;
    float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
    float a = streak * fade * 0.42;
    gl_FragColor = vec4(vC * a * 1.6, a);
    #include <fog_fragment>
  }`;

export function buildPlateau(game, world, { uTime }) {
  const group = new THREE.Group(); group.name = 'plateau';
  const ledgeGroup = new THREE.Group(); ledgeGroup.name = 'kalisLedge';
  game.scene.add(group, ledgeGroup);
  const H = world.getHeight;
  const rnd = mulberry32(4242);
  const P = [], G = [], L = [], LG = [], MG = [];
  const bark = (x, y, z, c) => { c.copy(C(0x7a5536)).lerp(C(0x4a311f), (Math.sin(x * 1.7 + y * 3.1 + z * 1.2) * 0.5 + 0.5) * 0.7); if (Math.sin(x * 0.8 + z * 1.3 + y * 0.6) > 0.82) c.lerp(C(0x6c9c47), 0.35); };
  const glow = (arr, g, color, m, mul = 1.8) => { const c = C(color).multiplyScalar(mul); arr.push(part(g, (x, y, z, o) => o.copy(c), m)); };
  const tubeAlong = (pts, r, segs = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 7, false);

  // ---------------- root pillars: twisted roots around each terrain spire, mossy crown, spirit rune
  const pillars = PILLARS.map((Q, i) => {
    const base = H(Q.x + 3.2, Q.z) - 1, top = Q.top;
    const ROOTS = 5;
    for (let k = 0; k < ROOTS; k++) {
      const a0 = k / ROOTS * Math.PI * 2 + i;
      const pts = [];
      for (let s = 0; s <= 8; s++) {
        const u = s / 8, a = a0 + u * 2.4, r = 3.1 - u * 0.5 + Math.sin(u * 9 + k) * 0.2;
        pts.push(new THREE.Vector3(Q.x + Math.cos(a) * r, base + (top - base + 0.4) * u, Q.z + Math.sin(a) * r));
      }
      P.push(part(tubeAlong(pts, 0.75 - k * 0.04, 28), bark, null));
    }
    // flaring root feet
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + i * 0.7, x1 = Q.x + Math.cos(a) * 7.5, z1 = Q.z + Math.sin(a) * 7.5;
      P.push(part(tubeAlong([new THREE.Vector3(Q.x + Math.cos(a) * 2.6, base + 3, Q.z + Math.sin(a) * 2.6), new THREE.Vector3(Q.x + Math.cos(a) * 5, H(Q.x + Math.cos(a) * 5, Q.z + Math.sin(a) * 5) + 0.6, Q.z + Math.sin(a) * 5), new THREE.Vector3(x1, H(x1, z1) - 0.4, z1)], 0.6, 12), bark, null));
    }
    P.push(part(new THREE.CylinderGeometry(2.9, 3.2, 0.7, 12), (x, y, z, c) => c.copy(C(0x6c9c47)).lerp(C(0x8fc25a), (Math.sin(x * 3 + z * 2) * 0.5 + 0.5) * 0.5), mat4(Q.x, top - 0.2, Q.z), { jitter: 0.2 }));
    glow(G, new THREE.TorusGeometry(3.25, 0.07, 4, 32), 0x9dffcb, mat4(Q.x, base + (top - base) * 0.55, Q.z, Math.PI / 2, 0, 0), 1.6);
    glow(G, new THREE.OctahedronGeometry(0.5, 0), 0xc8ffe9, mat4(Q.x, top + 1.6, Q.z, 0, i, 0, 1, 1.8, 1), 2.2);
    world.colliders.push({ x: Q.x, z: Q.z, r: 3.3, kind: 'rootPillar', top, base });
    // the spirit updraft beside each pillar (inner side) lifts gliders above the crown
    const dx = PL.x - Q.x, dz = PL.z - Q.z, dl = Math.hypot(dx, dz);
    const ux = Q.x + dx / dl * 5.5, uz = Q.z + dz / dl * 5.5;
    world.addUpdraft?.({ id: 'pillar' + i, pos: { x: ux, y: H(ux, uz), z: uz }, r: 2.3, h: 21, strength: 22, color: 0xc8ffe9 });
    return { id: 'pillar' + i, pos: new THREE.Vector3(Q.x, H(Q.x, Q.z), Q.z), top };
  });

  // ---------------- root bands hugging the plateau cliffs + root channels on the crown
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + rnd() * 0.2;
    const pts = [];
    for (let s = 0; s <= 6; s++) {
      const u = s / 6, r = PL.r + PL.cliff * (0.15 + u * 0.95), aa = a + (u - 0.5) * 0.25;
      const x = PL.x + Math.cos(aa) * r, z = PL.z + Math.sin(aa) * r;
      pts.push(new THREE.Vector3(x, H(x, z) + 0.3, z));
    }
    P.push(part(tubeAlong(pts, 0.9 + rnd() * 0.5, 18), bark, null));
  }
  for (let k = 0; k < 7; k++) {   // glowing root channels (void-tinged) running toward the centre
    const a = k / 7 * Math.PI * 2 + 0.4;
    const pts = [];
    for (let s = 0; s <= 6; s++) { const u = s / 6, r = PL.r - 2 - u * 24, aa = a + Math.sin(u * 4 + k) * 0.15; const x = PL.x + Math.cos(aa) * r, z = PL.z + Math.sin(aa) * r; pts.push(new THREE.Vector3(x, H(x, z) + 0.05, z)); }
    P.push(part(tubeAlong(pts, 0.55, 20), bark, null));
    const gp = pts.map((p) => p.clone().setY(p.y + 0.45));
    glow(G, tubeAlong(gp, 0.1, 20), 0xb98bff, null, 1.4);
  }

  // ---------------- root ramps: a gnarled root crest along each ramp's edges
  for (const R of TF.ramps) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i < R.pts.length; i++) {
        const a = R.pts[Math.max(0, i - 1)], b = R.pts[Math.min(R.pts.length - 1, i + 1)];
        const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
        const x = R.pts[i][0] - tz / tl * side * (R.hw + 0.9), z = R.pts[i][1] + tx / tl * side * (R.hw + 0.9);
        pts.push(new THREE.Vector3(x, H(R.pts[i][0], R.pts[i][1]) + 0.1, z));
      }
      P.push(part(tubeAlong(pts, 0.7, 40), bark, null));
    }
  }

  // ---------------- the ledge: prism mirrors on stone plinths, crystal pillars, the mirror alcove door
  const stone = (x, y, z, c) => c.copy(C(0xd9d5ea)).lerp(C(0x9da6c8), (Math.sin(x * 2.3 + y * 3.1) * Math.sin(z * 2.1) * 0.5 + 0.5) * 0.6);
  const ly = H(LD.x, LD.z);
  const mirrors = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.5;
    if (Math.abs(Math.sin(a - Math.PI / 2)) < 0.35 && Math.cos(a - Math.PI / 2) > 0) continue;   // keep the alcove side clear
    const x = LD.x + Math.cos(a) * 13, z = LD.z + Math.sin(a) * 13, y = H(x, z);
    const yaw = Math.atan2(LD.x - x, LD.z - z);
    const T = mat4(x, y, z, 0, yaw, 0);
    L.push(part(new THREE.BoxGeometry(2.4, 0.6, 1.2), stone, T.clone().multiply(mat4(0, 0.3, 0)), { jitter: 0.05 }));
    for (const s of [-1, 1]) L.push(part(new THREE.CylinderGeometry(0.16, 0.2, 3.6, 6), 0xe8e2ff, T.clone().multiply(mat4(s * 1.05, 2.3, 0))));
    L.push(part(new THREE.TorusGeometry(1.1, 0.12, 4, 6, Math.PI), 0xe8e2ff, T.clone().multiply(mat4(0, 4.05, 0))));
    const glass = new THREE.PlaneGeometry(1.9, 3.4); glass.translate(0, 2.3, 0.02);
    MG.push(part(glass, 0xffffff, T));
    glow(LG, new THREE.OctahedronGeometry(0.28, 0), 0xffe08a, T.clone().multiply(mat4(0, 5.3, 0, 0, 0, 0, 1, 1.6, 1)), 2.2);
    world.colliders.push({ x, z, r: 1.2, kind: 'mirror' });
    mirrors.push({ position: new THREE.Vector3(x, y + 2.3, z), yaw, normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)) });
  }
  for (let k = 0; k < 9; k++) {   // crystal clusters on the rim
    const a = rnd() * 6.28, r = 15 + rnd() * 2.5, x = LD.x + Math.cos(a) * r, z = LD.z + Math.sin(a) * r, y = H(x, z);
    for (let j = 0; j < 4; j++) {
      const g = new THREE.CylinderGeometry(0, 0.35 + rnd() * 0.3, 1.6 + rnd() * 2.6, 6); g.translate(0, 0.8, 0);
      glow(LG, g, rnd() < 0.5 ? 0xe9d8ff : 0xfff1c0, mat4(x + (rnd() - 0.5) * 1.4, y - 0.2, z + (rnd() - 0.5) * 1.4, (rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6), 1.25);
    }
  }
  // alcove stones + the mirror door in the gap
  const A = TF.alcove;
  const door = { id: 'mirrorDoor', state: 'closed', t: 0, position: new THREE.Vector3(A.x + Math.cos(A.gapA) * A.r, 0, A.z + Math.sin(A.gapA) * A.r), collider: null, prop: null };
  door.position.y = H(door.position.x, door.position.z);
  const doorYaw = -A.gapA + Math.PI / 2;   // local X along the ring tangent at the gap
  const doorGeo = (() => {
    const D = [];
    D.push(part(new THREE.BoxGeometry(2.6, 3.8, 0.35), (x, y, z, c) => c.copy(C(0xcfd6ff)).lerp(C(0xffffff), Math.max(0, y / 4)), mat4(0, 1.9, 0)));
    D.push(part(new THREE.TorusGeometry(1.05, 0.12, 4, 6, Math.PI), 0xffe08a, mat4(0, 3.6, 0.2)));
    const GEMS = 5;
    for (let k = 0; k < GEMS; k++) D.push(part(new THREE.OctahedronGeometry(0.16, 0), 0xffe08a, mat4(-0.9 + k * 0.45, 0.4, 0.2)));
    return merge(D);
  })();
  const doorMesh = new THREE.Mesh(doorGeo, occludable(toonMat(0xffffff, { vertexColors: true, emissive: 0x2a2a44, emissiveIntensity: 1 })));
  doorMesh.position.copy(door.position); doorMesh.rotation.y = doorYaw; doorMesh.name = 'mirrorDoor';
  const doorOut = new THREE.Mesh(doorGeo, outlineMat(0.035, 0x2a2840)); doorMesh.add(doorOut);
  ledgeGroup.add(doorMesh);
  door.collider = world.addTempCollider?.({ id: 'mirrorDoor', shape: 'box', pos: door.position, size: { x: 3.2, y: 4, z: 1.2 }, h: 4.2, yaw: doorYaw, blocksProjectiles: false }) || null;
  {
    const obj = new THREE.Object3D(); obj.position.copy(door.position); game.scene.add(obj);
    door.prop = {
      id: 'mirrorDoor', team: 'prop', isProp: true, name: MIRROR_TEXT.door, alive: true, object: obj, radius: 1.4, height: 3.8,
      hp: 1e9, maxHp: 1e9, mass: 1e9, xpValue: 0, velocity: new THREE.Vector3(), grounded: true, statuses: {}, resist: {}, immovable: true, noKnockback: true,
      getCenter(out) { return out.copy(obj.position).setY(obj.position.y + 1.9); },
      onHit(result, hit) { if (hit?.element === 'light' || (hit?.tags || []).includes('prism')) api.openDoor(); },
    };
    try { game.combat?.register?.(door.prop); } catch (_) { /* */ }
    game.interact?.offer?.('mirrorDoor', { pos: door.position, r: 3.4, label: MIRROR_TEXT.door, enabled: () => door.state === 'closed', onUse: () => { try { game.ui?.tip?.('mirrorDoor', MIRROR_TEXT.hint) ?? game.ui?.toast?.(MIRROR_TEXT.hint); } catch (_) { /* */ } return true; } });
  }

  // ---------------- merged meshes
  const mk = (parts, parent, name, outline = 0.04, ocol = 0x1c1410) => {
    if (!parts.length) return null;
    const geo = merge(parts);
    const m = new THREE.Mesh(geo, occludable(toonMat(0xffffff, { vertexColors: true })));
    m.name = name; m.receiveShadow = true; m.castShadow = false;
    if (outline) { const o = new THREE.Mesh(geo, outlineMat(outline, ocol)); o.raycast = () => {}; m.add(o); }
    parent.add(m); return m;
  };
  const mkGlow = (parts, parent, name) => { if (!parts.length) return null; const m = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })); m.name = name; parent.add(m); return m; };
  const main = mk(P, group, 'plateauDressing');
  const glowMesh = mkGlow(G, group, 'plateauGlow');
  const ledgeMain = mk(L, ledgeGroup, 'ledgeDressing', 0.03, 0x2a2840);
  const ledgeGlow = mkGlow(LG, ledgeGroup, 'ledgeGlow');
  const mirrorMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(v, normalize(vN))), 2.0);
        float sheen = smoothstep(0.92, 1.0, sin(vW.y * 0.9 + vW.x * 0.6 - uTime * 1.6) * 0.5 + 0.5);
        vec3 sky = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.94, 0.8), clamp(vW.y * 0.02 - 0.5, 0.0, 1.0));
        vec3 c = mix(sky * 0.85, vec3(1.0), f * 0.6) + vec3(1.0, 0.95, 0.8) * sheen * 0.8;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.DoubleSide, fog: true,
  });
  mirrorMat.uniforms.uTime = uTime;
  let mirrorMesh = null;
  if (MG.length) { mirrorMesh = new THREE.Mesh(merge(MG), mirrorMat); mirrorMesh.name = 'ledgeMirrors'; ledgeGroup.add(mirrorMesh); }

  // ---------------- scenery islands I1–I5 (merged; hidden before act 4)
  const islandGroup = new THREE.Group(); islandGroup.name = 'sceneryIslands'; islandGroup.visible = false;
  game.scene.add(islandGroup);
  const IP = [], IG = [];
  const rock = (x, y, z, c) => { c.copy(C(0x9a8670)).lerp(C(0x6a5a4c), (Math.sin(y * 1.4 + x * 0.3) * 0.5 + 0.5) * 0.6); };
  for (const I of ISLANDS) {
    const cone = new THREE.ConeGeometry(I.r, I.r * 1.6, 9, 4); cone.rotateX(Math.PI); cone.translate(0, -I.r * 0.8, 0);
    IP.push(part(cone, rock, mat4(I.x, I.y, I.z, 0, rnd() * 6, 0), { jitter: I.r * 0.12 }));
    const top = new THREE.CylinderGeometry(I.r * 1.02, I.r * 0.95, 0.9, 10);
    IP.push(part(top, (x, y, z, c) => c.copy(C(0x6fbf3c)).lerp(C(0x3f8f36), (Math.sin(x + z) * 0.5 + 0.5) * 0.5), mat4(I.x, I.y + 0.2, I.z), { jitter: 0.25 }));
    const nT = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < nT; k++) {
      const a = rnd() * 6.28, d = rnd() * I.r * 0.55, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, s = 1 + rnd() * 1.2;
      IP.push(part(new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 2.2 * s, 6), 0x6b4a32, mat4(x, I.y + 0.6 + 1.1 * s, z)));
      IP.push(part(new THREE.IcosahedronGeometry(1.3 * s, 1), (px, py, pz, c) => c.copy(C(0x8fd14f)).lerp(C(0x4f9a3a), (py - I.y - 2 * s) * 0.3 + 0.4), mat4(x, I.y + 2.6 * s + 0.6, z), { jitter: 0.3 * s }));
    }
    const HANG = 5;
    for (let k = 0; k < HANG; k++) {   // hanging roots
      const a = rnd() * 6.28, d = I.r * (0.2 + rnd() * 0.5);
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y0 = I.y - I.r * 0.6 * (1 - d / I.r);
      IP.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, y0, z), new THREE.Vector3(x + 0.5, y0 - 3, z - 0.4), new THREE.Vector3(x - 0.3, y0 - 6 - rnd() * 4, z + 0.3)]), 8, 0.12, 4, false), 0x5c3f24, null));
    }
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.28; const g = new THREE.CylinderGeometry(0, 0.4, 2.4, 5); glow(IG, g, 0xc8ffe9, mat4(I.x + Math.cos(a) * I.r * 0.5, I.y - I.r * 0.9, I.z + Math.sin(a) * I.r * 0.5, Math.PI, 0, 0), 1.6); }
  }
  const islands = mk(IP, islandGroup, 'sceneryIslandsMesh', 0.06, 0x1c1410);
  const islandsGlow = mkGlow(IG, islandGroup, 'sceneryIslandsGlow');

  // ---------------- ascent updraft columns
  for (const d of ASCENT_DRAFTS) world.addUpdraft?.({ id: d.id, pos: { x: d.x, y: H(d.x, d.z), z: d.z }, r: d.r, h: d.h, strength: d.strength, color: 0xc8ffe9 });

  // ---------------- updraft visual: every live updraft volume (static + temp) as one instanced column
  const UD_MAX = 16;
  const udGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true); udGeo.translate(0, 0.5, 0);
  const udMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: DRAFT_V, fragmentShader: DRAFT_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true,
  });
  udMat.uniforms.uTime = uTime;
  const updrafts = new THREE.InstancedMesh(udGeo, udMat, UD_MAX);
  for (let i = 0; i < UD_MAX; i++) updrafts.setColorAt(i, C(0xc8ffe9));   // instanceColor from construction
  updrafts.instanceColor.needsUpdate = true;
  updrafts.count = 0; updrafts.frustumCulled = false; updrafts.name = 'updraftColumns'; updrafts.renderOrder = 6;
  game.scene.add(updrafts);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  const api = {
    group, ledgeGroup, islandGroup, pillars, mirrors, door, updrafts,
    center: new THREE.Vector3(PL.x, PL.top, PL.z), radius: PL.r + 30,
    ledgeCenter: new THREE.Vector3(LD.x, ly, LD.z), ledgeRadius: LD.r + 20,
    meshes: [main, glowMesh, ledgeMain, ledgeGlow, mirrorMesh, islands, islandsGlow, doorMesh, updrafts].filter(Boolean),
    openDoor(quiet = false) {
      if (door.state !== 'closed') return false;
      door.state = 'opening'; door.t = quiet ? 9 : 0;
      if (door.collider) { world.removeCollider?.(door.collider); door.collider = null; }
      try { game.combat?.unregister?.(door.prop); } catch (_) { /* */ }
      door.prop.alive = false;
      game.interact?.withdraw?.('mirrorDoor');
      if (!quiet) {
        try { game.vfx?.burst?.(door.position.clone().setY(door.position.y + 2), { count: 36, color: [0xffe08a, 0xffffff, 0xe9d8ff], speed: 4, spread: 1, size: 0.14, sizeEnd: 0, life: 1, shape: 'spark', drag: 1.5 }); } catch (_) { /* */ }
        try { game.audio?.play?.('holy_chime', { position: door.position }); } catch (_) { /* */ }
        try { game.ui?.toast?.(MIRROR_TEXT.open); } catch (_) { /* */ }
        try { game.events?.emit?.('mirrorDoorOpen', { id: door.id }); } catch (_) { /* */ }
      }
      return true;
    },
    setIslandsVisible(v) { islandGroup.visible = !!v; },
    update(dt, realDt, t, drafts) {
      // door sinks into the ledge
      if (door.state === 'opening') {
        door.t += dt; const k = Math.min(1, door.t / 1.4);
        doorMesh.position.y = door.position.y - k * k * 4.1;
        if (k >= 1) { door.state = 'open'; doorMesh.visible = false; }
      }
      // updraft columns
      let n = 0;
      const cam = game.camera?.position;
      for (let i = 0; i < drafts.length && n < UD_MAX; i++) {
        const d = drafts[i]; if (!d.visual) continue;
        if (cam && (cam.x - d.x) ** 2 + (cam.z - d.z) ** 2 > 160 * 160) continue;
        const grow = d.life < Infinity ? Math.min(1, d.t * 3) * Math.min(1, (d.life - d.t) * 2) : 1;
        _q.identity(); _p.set(d.x, d.y - 0.5, d.z); _s.set(d.r * (0.85 + 0.15 * grow), d.h * Math.max(0.05, grow), d.r * (0.85 + 0.15 * grow));
        _m.compose(_p, _q, _s); updrafts.setMatrixAt(n, _m);
        updrafts.setColorAt(n, d.color);
        n++;
      }
      updrafts.count = n; updrafts.visible = n > 0;
      if (n) { updrafts.instanceMatrix.needsUpdate = true; updrafts.instanceColor.needsUpdate = true; }
    },
  };
  return api;
}
