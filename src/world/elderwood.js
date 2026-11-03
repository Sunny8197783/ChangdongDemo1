// ③ 잿빛 수림 엘더우드 (Elderwood) dressing + rot walls (DESIGN §8.2). Terrain (glade, hollow, root ridges) is in
// terraform.js. Here: instanced giant mushrooms in 3 sizes with bioluminescent gills/spots (emissive instance colours,
// no lights), root arches + void-rot vines (merged), 녹스's obsidian glade ring, 실바니아's blossom tree, spores, and the
// 3 rot walls (InstancedMesh, colliders, combat props) that burn (fire), purify (light) or smash (earth heavy).
// Draw calls: toon merged + outline (2), glow merged (1), mushrooms + outline + glow (3), rot walls + outline + glow (3), spores (1) = 10.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { part, merge, mat4, outlineMat, occludable } from './prefab.js';
import { mulberry32 } from './noise.js';
import { TF } from './zones.js';
import { RIDGE_GAPS, ridgeAdd } from './terraform.js';

const C = (h) => new THREE.Color(h);
const E = TF.elderwood;
export const ROT_TEXT = {
  name: '썩은 덩굴',
  hint: '썩은 덩굴 — 불로 태우거나, 빛으로 정화하거나, 어둠·자연의 강공으로 시들게 하거나, 강한 일격으로 부수세요',
  burned: '썩은 덩굴이 불타 사라졌다',
  purified: '빛이 썩은 덩굴을 정화했다',
  smashed: '썩은 덩굴을 부숴 길을 열었다',
  withered: '썩은 덩굴이 시들어 무너졌다',
};

function mushroomGeo() {
  const stem = (x, y, z, c) => c.copy(C(0xe8e1d2)).lerp(C(0xb8ad98), Math.max(0, 0.6 - y) * 0.8);
  const cap = (x, y, z, c) => {
    c.copy(C(0xffffff)).lerp(C(0xd8d0e8), Math.max(0, 2.0 - y) * 1.2);
    const sp = Math.sin(x * 9.1) * Math.sin(z * 8.3) * Math.sin(y * 7.7);
    if (sp > 0.55 && y > 1.85) c.set(0xfff6e0);   // pale spots
  };
  const sg = new THREE.CylinderGeometry(0.16, 0.24, 1.7, 8, 3); sg.translate(0, 0.85, 0);
  const pos = sg.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) + Math.sin(y * 2.2) * 0.07); }
  const cg = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); cg.scale(1, 0.55, 1); cg.translate(0, 1.6, 0);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i); const a = Math.atan2(z, x); const k = 1 + Math.sin(a * 6) * 0.04; cp.setX(i, x * k); cp.setZ(i, z * k); }
  const under = new THREE.CircleGeometry(0.98, 14); under.rotateX(Math.PI / 2); under.translate(0, 1.6, 0);
  return merge([part(sg, stem, null), part(cg, cap, null), part(under, 0x8c7fa0, null)]);
}
function mushroomGlowGeo() {
  const P = [];
  const ring = new THREE.RingGeometry(0.3, 0.92, 14, 1); ring.rotateX(Math.PI / 2); ring.translate(0, 1.585, 0);
  P.push(part(ring, 0xffffff, null));
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, r = 0.35 + (k % 3) * 0.2;
    const g = new THREE.IcosahedronGeometry(0.07 + (k % 2) * 0.03, 0);
    P.push(part(g, 0xffffff, mat4(Math.cos(a) * r, 1.6 + 0.55 * Math.sqrt(Math.max(0, 1 - r * r)) + 0.02, Math.sin(a) * r)));
  }
  return merge(P);
}
function rotWallGeo(rnd) {
  // a tangle of thick violet-black vines + thorns, ~7.4 m wide, 4.2 m tall (local X = along the wall)
  const P = [];
  const vine = (x, y, z, c) => c.copy(C(0x3a2547)).lerp(C(0x6d3f86), (Math.sin(x * 2.1 + y * 3.3 + z) * 0.5 + 0.5) * 0.6);
  for (let k = 0; k < 9; k++) {
    const pts = [];
    const y0 = rnd() * 3.2, ph = rnd() * 6;
    for (let s = 0; s <= 6; s++) {
      const u = s / 6;
      pts.push(new THREE.Vector3(-3.9 + u * 7.8, Math.max(0.2, y0 + Math.sin(u * 5 + ph) * 1.2 + (rnd() - 0.5) * 0.6), Math.sin(u * 7 + ph) * 0.5));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.16 + rnd() * 0.14, 5, false);
    P.push(part(g, vine, null));
  }
  for (let k = 0; k < 6; k++) {   // vertical trunks anchoring the tangle
    const x = -3.4 + k * 1.35 + (rnd() - 0.5) * 0.4;
    const pts = [new THREE.Vector3(x, -0.3, 0), new THREE.Vector3(x + (rnd() - 0.5) * 0.8, 2, (rnd() - 0.5) * 0.6), new THREE.Vector3(x + (rnd() - 0.5), 4.2, (rnd() - 0.5) * 0.4)];
    P.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.24, 5, false), vine, null));
  }
  for (let k = 0; k < 34; k++) {
    const g = new THREE.ConeGeometry(0.07, 0.5, 4);
    const x = -3.6 + rnd() * 7.2, y = 0.3 + rnd() * 3.8, s = rnd() < 0.5 ? 1 : -1;
    P.push(part(g, 0x2a1830, mat4(x, y, s * 0.4, s * 1.3 + (rnd() - 0.5), 0, (rnd() - 0.5) * 1.5)));
  }
  return merge(P);
}
function rotGlowGeo(rnd) {
  const P = [];
  for (let k = 0; k < 16; k++) {
    const g = new THREE.IcosahedronGeometry(0.12 + rnd() * 0.12, 0);
    P.push(part(g, 0xffffff, mat4(-3.4 + rnd() * 6.8, 0.4 + rnd() * 3.4, (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.3))));
  }
  return merge(P);
}

export function buildElderwood(game, world, { uTime }) {
  const group = new THREE.Group(); group.name = 'elderwood';
  game.scene.add(group);
  const H = world.getHeight;
  const rnd = mulberry32(31337);
  const P = [], G = [];
  const glow = (g, color, m, mul = 1.7) => { const c = C(color).multiplyScalar(mul); G.push(part(g, (x, y, z, o) => o.copy(c), m)); };
  const bark = (x, y, z, c) => { c.copy(C(0x6b4a32)).lerp(C(0x3f2b1c), (Math.sin(x * 1.9 + y * 4.1 + z * 1.3) * 0.5 + 0.5) * 0.7); if (Math.sin(x * 0.9 + z * 1.1 + y * 0.5) > 0.8) c.lerp(C(0x6c8a46), 0.35); };
  const rotVine = (x, y, z, c) => c.copy(C(0x4a2c5c)).lerp(C(0x7a4a96), (Math.sin(x * 3 + y * 2) * 0.5 + 0.5) * 0.5);

  // ---------------- giant root arches (tubes) springing over the paths + along the ridges
  const arch = (x0, z0, x1, z1, hgt, r) => {
    const y0 = H(x0, z0) - 0.6, y1 = H(x1, z1) - 0.6;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const pts = [new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x0 + (mx - x0) * 0.4, Math.max(y0, y1) + hgt * 0.8, z0 + (mz - z0) * 0.4),
      new THREE.Vector3(mx, Math.max(y0, y1) + hgt, mz), new THREE.Vector3(x1 + (mx - x1) * 0.4, Math.max(y0, y1) + hgt * 0.8, z1 + (mz - z1) * 0.4), new THREE.Vector3(x1, y1, z1)];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, r, 7, false);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i); gp.setXYZ(i, x + Math.sin(y * 1.3 + z) * 0.12, y, z + Math.sin(x * 1.1 + y) * 0.12); }
    P.push(part(g, bark, null));
    for (const [x, z] of [[x0, z0], [x1, z1]]) world.colliders.push({ x, z, r: r * 1.1, kind: 'root' });
    // void-rot vine wrapped around it
    if (rnd() < 0.7) {
      const vp = [];
      for (let s = 0; s <= 10; s++) { const p = new THREE.CatmullRomCurve3(pts).getPoint(0.15 + s * 0.07); const a = s * 1.7; vp.push(p.add(new THREE.Vector3(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, Math.sin(a + 1) * r))); }
      P.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp), 30, 0.09, 4, false), rotVine, null));
      for (let s = 0; s < 4; s++) { const p = vp[2 + s * 2]; glow(new THREE.IcosahedronGeometry(0.13, 0), 0xc27bff, mat4(p.x, p.y, p.z), 1.8); }
    }
  };
  arch(66, -58, 74, -48, 6.5, 0.9);   // over the glade path
  arch(76, -66, 86, -54, 8, 1.1);     // forest heart
  arch(90, -60, 98, -52, 5.5, 0.8);
  arch(70, -80, 78, -88, 6, 0.85);
  arch(104, -54, 112, -64, 6, 0.9);
  arch(58, -62, 62, -54, 4.5, 0.7);
  arch(86, -40, 94, -36, 5, 0.75);
  // root humps along the ridges (break the heightfield silhouette)
  for (let k = 0; k < 40; k++) {
    const Rg = E.ridges[0]; const a = Rg.a0 + rnd() * (Rg.a1 - Rg.a0);
    const x = Rg.x + Math.cos(a) * Rg.r, z = Rg.z + Math.sin(a) * Rg.r;
    if (ridgeAdd(x, z) < 2) continue;
    const y = H(x, z);
    const g = new THREE.CapsuleGeometry(0.9 + rnd() * 0.6, 3 + rnd() * 3, 3, 6);
    P.push(part(g, bark, mat4(x, y - 0.6, z, Math.PI / 2, a + (rnd() - 0.5) * 0.6, 0, 1, 1, 0.8), { jitter: 0.2 }));
  }

  // ---------------- 녹스's glade: an obsidian ring and violet rune stones
  {
    const Gl = E.glade, y0 = H(Gl.x, Gl.z);
    const obs = (x, y, z, c) => c.copy(C(0x2a2236)).lerp(C(0x4b3b63), (Math.sin(x * 4 + y * 3) * 0.5 + 0.5) * 0.6);
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + 0.2;
      if (Math.abs(((a - 2.2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.45) continue;   // opening toward the gate
      const x = Gl.x + Math.cos(a) * (Gl.r - 1.5), z = Gl.z + Math.sin(a) * (Gl.r - 1.5), hh = 2.4 + rnd() * 2.2;
      P.push(part(new THREE.OctahedronGeometry(1, 0), obs, mat4(x, H(x, z) + hh * 0.45, z, (rnd() - 0.5) * 0.2, rnd() * 6, (rnd() - 0.5) * 0.2, 0.7, hh * 0.6, 0.55), { jitter: 0.1 }));
      glow(new THREE.BoxGeometry(0.3, 0.3, 0.04), 0xb14bff, mat4(x - Math.cos(a) * 0.42, H(x, z) + hh * 0.5, z - Math.sin(a) * 0.42, 0, -a + Math.PI / 2, Math.PI / 4), 2.0);
      world.colliders.push({ x, z, r: 0.75, kind: 'stone' });
    }
    glow(new THREE.TorusGeometry(Gl.r - 3, 0.05, 4, 48), 0x9a5cff, mat4(Gl.x, y0 + 0.1, Gl.z, Math.PI / 2, 0, 0), 1.3);
  }

  // ---------------- 실바니아's grove: a white-barked blossom tree + flower ring
  {
    const Gr = E.grove, y0 = H(Gr.x, Gr.z);
    const wbark = (x, y, z, c) => c.copy(C(0xe9e4d8)).lerp(C(0xb9b2a0), (Math.sin(y * 5 + x * 2) * 0.5 + 0.5) * 0.5);
    const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.5, 3, 0.3), new THREE.Vector3(-0.3, 6, -0.2), new THREE.Vector3(0.2, 8.5, 0.1)]), 12, 0.75, 8, false);
    P.push(part(trunk, wbark, mat4(Gr.x, y0, Gr.z)));
    for (let k = 0; k < 9; k++) {
      const a = k * 2.2, r = 2 + (k % 3) * 1.2, y = 7 + (k % 4) * 1.1;
      const bl = (x, yy, z, c) => c.copy(C(0xff8cc6)).lerp(C(0xffd6ea), (Math.sin(x * 3 + z * 2 + yy) * 0.5 + 0.5) * 0.7);
      P.push(part(new THREE.IcosahedronGeometry(1.8 + (k % 2) * 0.6, 1), bl, mat4(Gr.x + Math.cos(a) * r, y0 + y, Gr.z + Math.sin(a) * r), { jitter: 0.3 }));
    }
    world.colliders.push({ x: Gr.x, z: Gr.z, r: 1.0, kind: 'tree' });
    for (let k = 0; k < 26; k++) {
      const a = rnd() * 6.28, r = 3 + rnd() * 3.5, x = Gr.x + Math.cos(a) * r, z = Gr.z + Math.sin(a) * r;
      glow(new THREE.OctahedronGeometry(0.11, 0), rnd() < 0.5 ? 0x9bffcf : 0xffe8a8, mat4(x, H(x, z) + 0.25, z), 1.6);
    }
  }

  // ---------------- giant mushrooms (instanced; 3 sizes). The seed mushroom is the tallest; its cap is a stand-on top.
  const mushDefs = [];
  const MU = E.mushroom;
  const giantS = MU.top / 2.15;
  mushDefs.push({ x: MU.x, z: MU.z, s: giantS, tint: 0x9a7cff });
  const tints = [0x9a7cff, 0x6fd3c8, 0xd08cff, 0x7fb0ff, 0xffb070];
  let tries = 0;
  while (mushDefs.length < 84 && tries++ < 3000) {
    const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * (E.r + 6);
    const x = E.x + Math.cos(a) * rr, z = E.z + Math.sin(a) * rr;
    const size = mushDefs.length < 8 ? 'giant' : mushDefs.length < 28 ? 'mid' : 'small';
    const s = size === 'giant' ? 3.2 + rnd() * 1.8 : size === 'mid' ? 1.2 + rnd() * 1.0 : 0.35 + rnd() * 0.45;
    const clear = s * 1.1 + 1;
    let ok = true;
    for (const m of mushDefs) if ((m.x - x) ** 2 + (m.z - z) ** 2 < (clear + m.s * 1.1) ** 2) { ok = false; break; }
    if (!ok) continue;
    if (Math.hypot(x - E.hollow.x, z - E.hollow.z) < E.hollow.r - (size === 'small' ? 4 : -2)) continue;   // keep the treant arena open
    if (Math.hypot(x - E.glade.x, z - E.glade.z) < E.glade.r) continue;
    if (Math.hypot(x - E.grove.x, z - E.grove.z) < 6.5) continue;
    if (ridgeAdd(x, z) > 0.5 && size !== 'small') continue;
    let gapNear = false; for (const g of RIDGE_GAPS) if (Math.hypot(x - g.x, z - g.z) < 6) gapNear = true; if (gapNear) continue;
    if (H(x, z) < world.waterLevel + 0.5) continue;
    mushDefs.push({ x, z, s, tint: tints[Math.floor(rnd() * tints.length)] });
  }
  const mGeo = mushroomGeo(), mgGeo = mushroomGlowGeo();
  const mush = new THREE.InstancedMesh(mGeo, occludable(toonMat(0xffffff, { vertexColors: true })), mushDefs.length);
  const mushOut = new THREE.InstancedMesh(mGeo, outlineMat(0.035, 0x24182c), mushDefs.length);
  const mushGlow = new THREE.InstancedMesh(mgGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), mushDefs.length);
  mushOut.instanceMatrix = mush.instanceMatrix; mushGlow.instanceMatrix = mush.instanceMatrix;
  const capC = new THREE.Color();
  mushDefs.forEach((m, i) => {
    const y = H(m.x, m.z) - 0.1;
    mush.setMatrixAt(i, mat4(m.x, y, m.z, (rnd() - 0.5) * 0.08, rnd() * 6.28, (rnd() - 0.5) * 0.08, m.s, m.s * (0.9 + rnd() * 0.2), m.s));
    capC.set(m.tint).lerp(C(0xffffff), 0.35); mush.setColorAt(i, capC);
    capC.set(m.tint).multiplyScalar(1.9); mushGlow.setColorAt(i, capC);
    m.y = y;
    if (m.s > 0.9) world.colliders.push({ x: m.x, z: m.z, r: 0.24 * m.s + 0.15, kind: 'mushroom', top: y + 1.6 * m.s, base: y });
  });
  for (const m of [mush, mushGlow]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  mushOut.boundingSphere = mush.boundingSphere;
  mush.name = 'elderMushrooms'; mush.receiveShadow = true; mush.castShadow = false; mushGlow.name = 'elderMushroomGlow';
  group.add(mush, mushOut, mushGlow);
  // stand-on caps (the seed cap + the other giants), only for the player (yHint rule)
  const capTops = mushDefs.filter((m) => m.s > 2.8).map((m, i) => ({ id: i === 0 ? 'mushroom' : 'cap' + i, x: m.x, z: m.z, r: 0.82 * m.s, top: m.y + 2.13 * m.s }));
  world.addStaticTop?.(capTops);

  // ---------------- merged toon + glow meshes
  const geo = merge(P);
  const main = new THREE.Mesh(geo, occludable(toonMat(0xffffff, { vertexColors: true })));
  main.name = 'elderDressing'; main.receiveShadow = true; main.castShadow = false;
  const outline = new THREE.Mesh(geo, outlineMat(0.04, 0x1c1410)); outline.raycast = () => {};
  main.add(outline);
  const glowMesh = new THREE.Mesh(merge(G), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  glowMesh.name = 'elderGlow';
  group.add(main, glowMesh);

  // ---------------- spores (GPU points drifting up through the wood)
  const NS = 140;
  const sp = new Float32Array(NS * 3), ss = new Float32Array(NS * 2);
  for (let i = 0; i < NS; i++) { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * E.r; const x = E.x + Math.cos(a) * rr, z = E.z + Math.sin(a) * rr; sp.set([x, H(x, z), z], i * 3); ss.set([rnd(), rnd()], i * 2); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 2));
  const sporeU = { uTime, uScale: { value: 1 } };
  const spores = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: sporeU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uScale; attribute vec2 aSeed; varying float vA; varying float vK;
      void main(){
        float life = fract(uTime * (0.04 + aSeed.x * 0.05) + aSeed.y);
        vec3 p = position + vec3(sin(uTime * 0.5 + aSeed.y * 20.0) * 1.5, life * 9.0, cos(uTime * 0.4 + aSeed.x * 20.0) * 1.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (40.0 + aSeed.x * 50.0) * uScale / -mv.z;
        vA = smoothstep(0.0, 0.15, life) * (1.0 - life) * (0.6 + 0.4 * sin(uTime * 2.0 + aSeed.x * 40.0)); vK = aSeed.y;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vK;
      void main(){ float m = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); vec3 c = mix(vec3(0.7, 1.0, 0.8), vec3(0.85, 0.6, 1.0), vK);
        gl_FragColor = vec4(c * m * vA * 1.4, 1.0); }`,
  }));
  spores.frustumCulled = false; spores.name = 'elderSpores'; spores.renderOrder = 7;
  group.add(spores);

  // ---------------- rot walls (3): InstancedMesh + outline + glow pustules; colliders + combat props
  const wGeo = rotWallGeo(rnd), wgGeo = rotGlowGeo(rnd);
  const walls = new THREE.InstancedMesh(wGeo, occludable(toonMat(0xffffff, { vertexColors: true })), RIDGE_GAPS.length);
  const wallOut = new THREE.InstancedMesh(wGeo, outlineMat(0.04, 0x140a18), RIDGE_GAPS.length);
  const wallGlow = new THREE.InstancedMesh(wgGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), RIDGE_GAPS.length);
  wallOut.instanceMatrix = walls.instanceMatrix; wallGlow.instanceMatrix = walls.instanceMatrix;
  const rotColor = C(0xc27bff).multiplyScalar(1.9);
  const rotWalls = RIDGE_GAPS.map((g, i) => {
    const yaw = -g.a;   // tangent of the ring at the gap: local X along the tangent
    const y = Math.min(world.getHeight(g.x, g.z), world.getHeight(g.x + Math.sin(g.a) * 2, g.z - Math.cos(g.a) * 2)) - 0.2;
    const w = {
      id: 'rot' + (i + 1), index: i, position: new THREE.Vector3(g.x, y, g.z), yaw: yaw + Math.PI / 2, state: 'intact', t: 0, how: null,
      collider: null, prop: null, span: g.half * 2 + 1.6,
    };
    wallGlow.setColorAt(i, rotColor);
    walls.setColorAt(i, C(0xffffff));
    return w;
  });
  walls.instanceColor.needsUpdate = true; wallGlow.instanceColor.needsUpdate = true;
  walls.name = 'rotWalls'; walls.receiveShadow = true; walls.castShadow = false; wallGlow.name = 'rotWallGlow';
  walls.frustumCulled = false; wallOut.frustumCulled = false; wallGlow.frustumCulled = false;
  group.add(walls, wallOut, wallGlow);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function wallMatrix(w, i, k, t) {
    // k: 1 intact → 0 gone; burning sways + shrinks from the top, purify lifts + fades, smash bursts outward
    const sway = w.state === 'intact' ? Math.sin(t * 1.3 + i) * 0.015 : 0;
    _e.set(sway, w.yaw, w.how === 'smashed' ? (1 - k) * 0.5 : 0); _q.setFromEuler(_e);
    const sx = w.span / 7.8;
    const lift = w.how === 'purified' ? (1 - k) * 1.2 : 0;
    _p.copy(w.position); _p.y += lift - (w.how === 'burned' ? (1 - k) * 1.5 : 0);
    _s.set(sx * (w.how === 'smashed' ? 1 + (1 - k) * 0.4 : 1), Math.max(0.001, k), Math.max(0.001, w.how === 'smashed' ? k : 1));
    _m.compose(_p, _q, _s); walls.setMatrixAt(i, _m);
  }
  rotWalls.forEach((w, i) => wallMatrix(w, i, 1, 0));
  walls.instanceMatrix.needsUpdate = true;
  for (const w of rotWalls) {
    w.collider = world.addTempCollider?.({ id: 'rotwall:' + w.id, shape: 'box', pos: w.position, size: { x: w.span, y: 4.4, z: 1.6 }, h: 4.6, yaw: w.yaw, owner: w }) || null;
    // a combat prop so spells / swords can hit it (xpValue 0)
    const obj = new THREE.Object3D(); obj.position.copy(w.position); obj.name = 'rotWall_' + w.id; game.scene.add(obj);
    w.prop = {
      id: 'rotwall_' + w.id, team: 'prop', isProp: true, name: ROT_TEXT.name, alive: true, object: obj, radius: w.span * 0.45, height: 4,
      hp: 1e9, maxHp: 1e9, mass: 1e9, xpValue: 0, velocity: new THREE.Vector3(), grounded: true, statuses: {}, resist: {}, immovable: true, noKnockback: true,
      getCenter(out) { return out.copy(obj.position).setY(obj.position.y + 1.8); },
      onHit(result, hit) { api.hitWall(w, hit, result); },
    };
    try { game.combat?.register?.(w.prop); } catch (_) { /* */ }
    game.interact?.offer?.('rotwall:' + w.id, { pos: w.position, r: w.span * 0.5 + 1.5, label: ROT_TEXT.name, priority: 0, enabled: () => w.state === 'intact', onUse: () => { try { game.ui?.tip?.('rotwall', ROT_TEXT.hint) ?? game.ui?.toast?.(ROT_TEXT.hint); } catch (_) { /* */ } return true; } });
  }

  function clearWall(w, how, quiet = false) {
    if (!w || w.state !== 'intact') return false;
    w.state = how; w.how = how; w.t = quiet ? 9 : 0;
    if (w.collider) { world.removeCollider?.(w.collider); w.collider = null; }
    try { game.combat?.unregister?.(w.prop); } catch (_) { /* */ }
    if (w.prop) w.prop.alive = false;
    game.interact?.withdraw?.('rotwall:' + w.id);
    if (!quiet) {
      const p = _p.copy(w.position); p.y += 1.8;
      const vfx = game.vfx;
      try {
        if (how === 'burned') { vfx?.explosion?.(p.clone(), { element: 'fire', scale: 1.1 }); world.surface?.ignite?.(w.position, 2.5, 1); }
        else if (how === 'purified') { vfx?.burst?.(p.clone(), { count: 40, color: [0xffe9a8, 0xffffff, 0xffc24a], speed: 5, spread: 1, size: 0.16, sizeEnd: 0, life: 1.1, shape: 'spark', drag: 1.5 }); vfx?.flash?.(p.clone(), { color: 0xffe08a, intensity: 20, distance: 14, duration: 0.5 }); }
        else { vfx?.burst?.(p.clone(), { count: 34, color: [0x5b2a8a, 0x2a1830, 0xc8955a], speed: 7, spread: 1, size: 0.2, sizeEnd: 0.05, life: 0.9, shape: 'chunk', gravity: 12 }); vfx?.shake?.(0.5); }
      } catch (_) { /* */ }
      try { game.audio?.play?.(how === 'burned' ? 'explode_fire' : how === 'purified' ? 'holy_chime' : 'rock_smash', { position: w.position }); } catch (_) { /* */ }
      try { game.ui?.toast?.(ROT_TEXT[how]); } catch (_) { /* */ }
      try { game.events?.emit?.('rotWallCleared', { id: w.id, how, cleared: rotWalls.filter((q) => q.state !== 'intact').length, total: rotWalls.length }); } catch (err) { console.error('[world] rotWallCleared', err); }
    }
    return true;
  }
  let burnAcc = 0;
  const api = {
    group, rotWalls, capTops, center: new THREE.Vector3(E.x, H(E.x, E.z), E.z), radius: E.r + 20,
    meshes: [main, glowMesh, mush, mushGlow, walls, wallGlow, spores],
    burn: (id) => clearWall(rotWalls.find((w) => w.id === id), 'burned'),
    purify: (id) => clearWall(rotWalls.find((w) => w.id === id), 'purified'),
    smash: (id) => clearWall(rotWalls.find((w) => w.id === id), 'smashed'),
    clearWall,
    /** A combat hit on a wall: fire burns, light purifies, a heavy earth hit (or 대지의 거신) smashes. */
    hitWall(w, hit, result) {
      if (!hit || w.state !== 'intact') return;
      const el = hit.element; const tags = hit.tags || [];
      const tier = result?.tier || hit.tier;
      const strong = !!(hit.heavy || hit.charged || tier === 'heavy' || tier === 'ult' || tags.includes('ultimate') || tags.includes('finisher'));
      if (el === 'fire') clearWall(w, 'burned');
      else if (el === 'light') clearWall(w, 'purified');
      else if (el === 'earth' && (strong || tags.includes('colossus') || tags.includes('smash') || /colossus/.test(hit.skillId || hit.id || ''))) clearWall(w, 'smashed');
      // every class has a way through (shadow / nature builds have no fire or light): shadow corrodes and nature
      // un-grows the rot on a strong hit or a reaction; any ultimate smashes; enough plain hits tear it down
      else if ((el === 'shadow' || el === 'nature') && (strong || result?.reaction)) clearWall(w, 'withered');
      else if (tier === 'ult' || tags.includes('ultimate')) clearWall(w, 'smashed');
      else {
        w.shiver = 1; w.hits = (w.hits || 0) + (strong ? 3 : 1);
        if (w.hits >= 14) { clearWall(w, 'smashed'); return; }
        if (w.hits === 4) { try { game.ui?.tip?.('rotwall', ROT_TEXT.hint); } catch (_) { /* */ } }
        try { game.audio?.play?.('vine_hit', { position: w.position, volume: 0.5 }); } catch (_) { /* */ }
      }
    },
    setStates(o) {
      for (const w of rotWalls) {
        const s = typeof o === 'string' ? o : o?.[w.id];
        if (s && s !== 'intact' && w.state === 'intact') clearWall(w, s, true);
      }
    },
    serialize() { return Object.fromEntries(rotWalls.map((w) => [w.id, w.state])); },
    update(dt, realDt, t) {
      sporeU.uScale.value = game.renderer.domElement.height / 720;
      // distance LOD: from the village (≈160 m past the forest edge, deep in the fog) the glow layers, spores and
      // mushroom caps are sub-pixel but cost ~50k triangles; the main forest silhouette stays
      {
        const cp = game.camera?.position;
        if (cp) {
          const d = Math.hypot(cp.x - api.center.x, cp.z - api.center.z) - api.radius;
          const near = d < 115, mid = d < 140;
          glowMesh.visible = near; mushGlow.visible = near; wallGlow.visible = near; spores.visible = near;
          mush.visible = mid; walls.visible = mid;
        }
      }
      let dirty = false;
      for (let i = 0; i < rotWalls.length; i++) {
        const w = rotWalls[i];
        if (w.state === 'intact') {
          if (w.shiver > 0) w.shiver = Math.max(0, w.shiver - dt * 3);
          wallMatrix(w, i, 1 - (w.shiver || 0) * 0.04, t); dirty = true;
          continue;
        }
        if (w.t < 2) {
          w.t += dt;
          const k = Math.max(0, 1 - w.t / 1.6);
          wallMatrix(w, i, k * k, t); dirty = true;
          _c.copy(rotColor).lerp(w.how === 'purified' ? C(0xffe9a8) : C(0xff7a2a), Math.min(1, w.t * 2)).multiplyScalar(k);
          wallGlow.setColorAt(i, _c); wallGlow.instanceColor.needsUpdate = true;
        }
      }
      if (dirty) walls.instanceMatrix.needsUpdate = true;
      // grass fire touching a wall burns it (fire spreading from a burning meadow)
      burnAcc += dt;
      if (burnAcc > 0.5) {
        burnAcc = 0;
        const S = world.surface;
        if (S?.burningNear) for (const w of rotWalls) if (w.state === 'intact' && S.burningCount > 0 && S.burningNear(w.position, w.span * 0.5 + 1) > 0) clearWall(w, 'burned');
      }
    },
  };
  return api;
}
