// ② 안개호수 미르웬 (Mirwen) dressing (DESIGN §8.2). The basin, islands, the waterfall cliff and the cave slot are terrain
// (terraform.js). Here: half-sunk ruin arches, the 6 hydra-arena ruin pillars (stand-on tops + colliders), 운디나's
// shrine ring, lily pads and reeds, the west waterfall + foam, the cave roof (P1 interior), drifting mist motes.
// Draw calls: toon merged + outline (2), emissive runes/lilies (1), waterfall (1), foam (1), mist points (1) = 6.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { part, merge, mat4, outlineMat, occludable } from './prefab.js';
import { mulberry32 } from './noise.js';
import { TF, WATER, ARENA_DEFS } from './zones.js';
import { HYDRA_PILLARS } from './terraform.js';

const C = (h) => new THREE.Color(h);
const M = TF.mirwen;

export function buildMirwen(game, world, { uTime }) {
  const group = new THREE.Group(); group.name = 'mirwen';
  game.scene.add(group);
  const H = world.getHeight;
  const rnd = mulberry32(9090);
  const P = [], E = [];
  const ruin = (x, y, z, c) => {
    c.copy(C(0xb7c2c4)).lerp(C(0x7f8f96), (Math.sin(x * 2.3 + y * 3.1) * Math.sin(z * 2.9 - y * 1.3) * 0.5 + 0.5) * 0.6);
    if (y < WATER + 0.6) c.lerp(C(0x3f6b5e), 0.55);                       // waterline algae
    else if (Math.sin(x * 1.7 + z * 2.3 + y * 0.7) > 0.55) c.lerp(C(0x6f9f62), 0.45);   // moss
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1, 2, 3, 2);
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 3);
  const emit = (g, color, m, mul = 1.6) => { const c = C(color).multiplyScalar(mul); E.push(part(g, (x, y, z, o) => o.copy(c), m)); };

  // ---------------- hydra arena ruin pillars (6 at r 14): fluted columns with broken capitals, blue rune bands
  const pillarTops = [];
  for (const Q of HYDRA_PILLARS) {
    const base = Math.min(H(Q.x, Q.z) - 0.3, WATER - 1.5), top = Q.top;
    const hh = top - base;
    const tilt = (rnd() - 0.5) * 0.06;
    P.push(part(CYL, ruin, mat4(Q.x, base + hh / 2, Q.z, tilt, rnd() * 6, tilt, 1.25, hh, 1.25), { jitter: 0.08 }));
    P.push(part(BOX, ruin, mat4(Q.x, top - 0.15, Q.z, 0, Q.a, 0, 2.9, 0.35, 2.9), { jitter: 0.1 }));
    // broken capital chunk lying on top / fallen beside
    P.push(part(BOX, ruin, mat4(Q.x + Math.cos(Q.a) * 0.6, top + 0.25, Q.z + Math.sin(Q.a) * 0.6, 0.2, Q.a + 0.6, 0.15, 0.9, 0.45, 0.7), { jitter: 0.1 }));
    emit(new THREE.TorusGeometry(1.28, 0.06, 4, 20), 0x7fd3ff, mat4(Q.x, WATER + 1.2, Q.z, Math.PI / 2, 0, 0), 1.8);
    emit(new THREE.TorusGeometry(1.28, 0.05, 4, 20), 0x7fd3ff, mat4(Q.x, top - 0.7, Q.z, Math.PI / 2, 0, 0), 1.5);
    world.colliders.push({ x: Q.x, z: Q.z, r: 1.35, kind: 'pillar', top, base });
    pillarTops.push({ x: Q.x, z: Q.z, r: 1.4, top });
  }

  // ---------------- half-sunk arches (3) and scattered ruin blocks on islands
  const arches = [[-71, -73, 0.6], [-90, -72, 2.1], [-80, -86, -0.4]];
  for (const [x, z, yaw] of arches) {
    const T = mat4(x, WATER - 1.2, z, 0.08, yaw, 0.05);
    for (const s of [-1, 1]) P.push(part(BOX, ruin, T.clone().multiply(mat4(s * 2.2, 2.2, 0, 0, 0, 0, 0.9, 4.4, 0.9)), { jitter: 0.1 }));
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6), am = (a0 + a1) / 2;
      if (i === 4) continue;   // a missing voussoir
      P.push(part(BOX, ruin, T.clone().multiply(mat4(Math.cos(am) * 2.2, 4.4 + Math.sin(am) * 1.4, 0, 0, 0, am - Math.PI / 2, 0.95, 0.7, 0.85)), { jitter: 0.07 }));
    }
    emit(new THREE.BoxGeometry(0.5, 0.5, 0.05), 0x9fe8ff, T.clone().multiply(mat4(0, 5.8, 0.46, 0, 0, Math.PI / 4)), 1.8);
  }
  for (const I of M.islands) {
    const n = I.id === 'undina' ? 0 : 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, d = I.r * (0.3 + rnd() * 0.5);
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      const s = 0.5 + rnd() * 0.7;
      P.push(part(BOX, ruin, mat4(x, H(x, z) + s * 0.3, z, rnd() * 0.5, rnd() * 6, rnd() * 0.4, s * 1.2, s * 0.8, s), { jitter: 0.12 }));
    }
    // a broken column stump on the bigger islands
    if (I.r >= 4 && I.id !== 'undina') { const y = H(I.x, I.z); P.push(part(CYL, ruin, mat4(I.x + 0.8, y + 0.9, I.z - 0.6, 0.05, 0, 0.08, 0.55, 1.9, 0.55), { jitter: 0.08 })); world.colliders.push({ x: I.x + 0.8, z: I.z - 0.6, r: 0.6, kind: 'stone' }); }
  }

  // ---------------- 운디나's shrine ring on her island
  {
    const I = M.islands.find((i) => i.id === 'undina'); const y = H(I.x, I.z);
    P.push(part(new THREE.CylinderGeometry(3.2, 3.5, 0.4, 20), ruin, mat4(I.x, y + 0.1, I.z)));
    P.push(part(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 16), ruin, mat4(I.x, y + 0.45, I.z)));
    emit(new THREE.TorusGeometry(2.6, 0.05, 4, 40), 0x6fc8ff, mat4(I.x, y + 0.33, I.z, Math.PI / 2, 0, 0), 1.9);
    emit(new THREE.CircleGeometry(1.25, 20).rotateX(-Math.PI / 2), 0x4fb4ff, mat4(I.x, y + 0.71, I.z), 1.2);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.3, x = I.x + Math.cos(a) * 2.9, z = I.z + Math.sin(a) * 2.9;
      const hh = 2.2 + (k % 2) * 0.9;
      P.push(part(CYL, ruin, mat4(x, y + hh / 2, z, 0, a, 0, 0.32, hh, 0.32), { jitter: 0.04 }));
      emit(new THREE.OctahedronGeometry(0.2, 0), 0x9fe8ff, mat4(x, y + hh + 0.3, z, 0, a, 0, 1, 1.6, 1), 2.2);
      world.colliders.push({ x, z, r: 0.36, kind: 'pillar' });
    }
  }

  // ---------------- lily pads + flowers on the open water, reeds on the shores
  const lily = C(0x4f9a46), lilyDark = C(0x2f7036);
  for (let k = 0; k < 70; k++) {
    const a = rnd() * 6.28, rr = Math.sqrt(rnd());
    const x = M.x + Math.cos(a) * M.rx * 0.88 * rr, z = M.z + Math.sin(a) * M.rz * 0.88 * rr;
    if (H(x, z) > WATER - 0.2) continue;
    const s = 0.5 + rnd() * 0.9;
    const g = new THREE.CircleGeometry(1, 9, 0.35, Math.PI * 2 - 0.35); g.rotateX(-Math.PI / 2);
    P.push(part(g, (px, py, pz, c) => c.copy(lily).lerp(lilyDark, (Math.sin(px * 7 + pz * 5) * 0.5 + 0.5) * 0.5), mat4(x, WATER + 0.04, z, 0, rnd() * 6, 0, s, 1, s)));
    if (rnd() < 0.35) emit(new THREE.ConeGeometry(0.18 * s, 0.22 * s, 6, 1, true).rotateX(Math.PI), rnd() < 0.5 ? 0xffb3d6 : 0xfff0f6, mat4(x + 0.2 * s, WATER + 0.18, z, 0, 0, 0), 1.25);
  }
  const reed = C(0x86a95a), reedTip = C(0x8a6a3a);
  for (let k = 0; k < 150; k++) {
    const a = rnd() * 6.28;
    const rr = 0.86 + rnd() * 0.12;
    const x = M.x + Math.cos(a) * M.rx * rr, z = M.z + Math.sin(a) * M.rz * rr;
    const h0 = H(x, z); if (h0 < WATER - 0.6 || h0 > WATER + 1.0) continue;
    const hh = 0.9 + rnd() * 0.9;
    const g = new THREE.ConeGeometry(0.05, hh, 3); g.translate(0, hh / 2, 0);
    P.push(part(g, (px, py, pz, c) => c.copy(reed).lerp(reedTip, Math.max(0, (py - h0 - hh * 0.7) / (hh * 0.3))), mat4(x, h0 - 0.1, z, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3)));
    if (rnd() < 0.4) { const g2 = new THREE.CapsuleGeometry(0.06, 0.22, 2, 4); P.push(part(g2, reedTip, mat4(x, h0 + hh * 0.85, z))); }
  }

  // ---------------- the cave slot behind the falls (P1 interior): rock roof arch + glowing crystals
  {
    const S = M.cave; const fy = S.floor;
    const rock = (x, y, z, c) => { c.copy(C(0x6f7d84)).lerp(C(0x4c565c), (Math.sin(x * 3 + y * 2) * 0.5 + 0.5) * 0.6); };
    for (let k = 0; k < 4; k++) {
      const x = S.x0 + 0.8 + k * ((S.x1 - S.x0 - 1) / 3);
      P.push(part(new THREE.CylinderGeometry(S.hw + 1.6, S.hw + 1.6, 1.8, 8, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), rock, mat4(x, fy + 3.1, S.z, 0, 0, 0, 1, 1.1, 1), { jitter: 0.25 }));
    }
    for (let k = 0; k < 7; k++) {
      const x = S.x0 + rnd() * (S.x1 - S.x0 - 1), z = S.z + (rnd() < 0.5 ? -1 : 1) * (S.hw - 0.2);
      emit(new THREE.OctahedronGeometry(0.22 + rnd() * 0.2, 0), rnd() < 0.5 ? 0x7fe3ff : 0xb8f4ff, mat4(x, fy + 0.4 + rnd() * 2.2, z, rnd(), rnd(), rnd(), 1, 2, 1), 2.0);
    }
  }

  const geo = merge(P);
  const main = new THREE.Mesh(geo, occludable(toonMat(0xffffff, { vertexColors: true })));
  main.name = 'mirwenDressing'; main.receiveShadow = true; main.castShadow = false;
  const outline = new THREE.Mesh(geo, outlineMat(0.035, 0x1f2a2c)); outline.raycast = () => {};
  main.add(outline);
  const emissive = new THREE.Mesh(merge(E), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  emissive.name = 'mirwenGlow';
  group.add(main, emissive);

  // ---------------- the west waterfall (cliff → lake) over the cave mouth
  const wfU = { uTime };
  const wfMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), wfU), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      void main(){
        float s = n(vec2(vUv.x * 16.0, vUv.y * 3.0 + uTime * 2.4)) * 0.6 + n(vec2(vUv.x * 38.0, vUv.y * 6.0 + uTime * 3.6)) * 0.4;
        vec3 c = mix(vec3(0.4, 0.66, 0.85), vec3(0.95, 0.98, 1.0), smoothstep(0.42, 0.75, s));
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float a = (0.55 + 0.38 * s) * edge;
        c = mix(c, vec3(1.0), smoothstep(0.12, 0.0, vUv.y));
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
  const topY = M.cliff.h - 0.5, wfH = topY - WATER + 0.3;
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(9, wfH, 1, 10), wfMat);
  const wp = wf.geometry.attributes.position;
  for (let i = 0; i < wp.count; i++) { const t = (wp.getY(i) + wfH / 2) / wfH; wp.setZ(i, Math.sin(t * Math.PI) * 0.9 - t * 1.4); }
  wf.position.set(M.cave.x1 + 0.6, WATER + wfH / 2 - 0.3, M.cave.z);
  wf.rotation.y = Math.PI / 2;   // faces east (out over the lake)
  wf.renderOrder = 2; wf.name = 'mirwenFalls';
  group.add(wf);
  const foamMat = new THREE.ShaderMaterial({
    uniforms: wfU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`uniform float uTime; varying vec2 vUv;
      void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x);
        float rings = sin(r * 16.0 - uTime * 4.5 + sin(a * 5.0) * 0.7) * 0.5 + 0.5;
        float k = smoothstep(1.0, 0.2, r) * (0.4 + 0.6 * rings);
        gl_FragColor = vec4(vec3(1.0), k * 0.7); }`,
  });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), foamMat);
  foam.rotation.x = -Math.PI / 2; foam.position.set(M.cave.x1 + 3.2, WATER + 0.05, M.cave.z); foam.renderOrder = 3;
  group.add(foam);

  // ---------------- drifting twilight mist motes over the lake (GPU animated points)
  const NM = 90;
  const mp = new Float32Array(NM * 3), ms = new Float32Array(NM * 2);
  for (let i = 0; i < NM; i++) {
    const a = rnd() * 6.28, rr = Math.sqrt(rnd());
    mp.set([M.x + Math.cos(a) * M.rx * rr, WATER + 0.6 + rnd() * 3.5, M.z + Math.sin(a) * M.rz * rr], i * 3);
    ms.set([rnd(), rnd()], i * 2);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 2));
  const mistU = { uTime, uScale: { value: 1 } };
  const mist = new THREE.Points(mg, new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uScale; attribute vec2 aSeed; varying float vA; varying float vK;
      void main(){
        vec3 p = position;
        float t = uTime * (0.05 + aSeed.x * 0.05);
        p.x += sin(t * 6.28 + aSeed.y * 9.0) * 3.0; p.z += cos(t * 5.0 + aSeed.x * 7.0) * 2.0;
        p.y += sin(uTime * 0.4 + aSeed.y * 6.0) * 0.4;
        vK = aSeed.x;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        bool firefly = aSeed.y > 0.82;
        gl_PointSize = (firefly ? 60.0 : 1500.0 + aSeed.x * 900.0) * uScale / -mv.z;
        vA = firefly ? 0.6 + 0.4 * sin(uTime * 3.0 + aSeed.x * 30.0) : 0.05;
        if (firefly) vK = -1.0;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vK;
      void main(){ vec2 d = gl_PointCoord - 0.5; float m = smoothstep(0.5, 0.0, length(d));
        vec3 c = vK < 0.0 ? vec3(0.6, 1.0, 0.85) * 1.4 : mix(vec3(0.72, 0.82, 1.0), vec3(0.85, 0.78, 1.0), vK);
        gl_FragColor = vec4(c * m * vA, 1.0); }`,
  }));
  mist.frustumCulled = false; mist.name = 'mirwenMist'; mist.renderOrder = 7;
  group.add(mist);

  const center = new THREE.Vector3(M.x, WATER, M.z);
  return {
    group, center, radius: Math.max(M.rx, M.rz) + 18, pillarTops,
    meshes: [main, emissive, wf, foam, mist],
    update() { mistU.uScale.value = game.renderer.domElement.height / 720; },
  };
}
