// 세계수 아스트라: giant luminous World Tree far to the northeast, beyond the mountain ring. Visible from the whole
// valley (own haze instead of scene fog). 4 draw calls: bark (trunk+roots+branches), canopy, glow halo, motes.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

export const WORLD_TREE = { x: 215, z: -215, baseY: 22, height: 200 };

function tube(curve, r0, r1, segs, radial) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // taper: scale each ring around its curve point
  const p = g.attributes.position, nrm = g.attributes.normal;
  const pts = curve.getSpacedPoints(segs);
  for (let s = 0; s <= segs; s++) {
    const r = r0 + (r1 - r0) * (s / segs);
    const c = pts[s];
    for (let k = 0; k <= radial; k++) {
      const i = s * (radial + 1) + k;
      p.setXYZ(i, c.x + nrm.getX(i) * r, c.y + nrm.getY(i) * r, c.z + nrm.getZ(i) * r);
    }
  }
  g.deleteAttribute('uv');
  return g;
}

export function buildWorldTree(game, sunDir) {
  const T = WORLD_TREE;
  const rnd = mulberry32(31337);
  const group = new THREE.Group(); group.name = 'worldTree';
  group.position.set(T.x, T.baseY, T.z);
  game.scene.add(group);
  const H = T.height;
  const uTime = { value: 0 };
  const haze = new THREE.Color(0xc9def2);

  // ---------------- bark: twisted trunk, flared roots, sweeping branches
  const bark = [];
  const trunkTop = H * 0.62;
  {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 2.2) * 6 * t, t * trunkTop, Math.cos(t * 1.7) * 4 * t)); }
    bark.push(tube(new THREE.CatmullRomCurve3(pts), 19, 8.5, 24, 14));
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.3, len = 34 + rnd() * 22;
    const pts = [new THREE.Vector3(Math.cos(a) * 6, 26 + rnd() * 10, Math.sin(a) * 6), new THREE.Vector3(Math.cos(a) * 18, 10 + rnd() * 6, Math.sin(a) * 18),
      new THREE.Vector3(Math.cos(a + 0.15) * len, -4, Math.sin(a + 0.15) * len)];
    bark.push(tube(new THREE.CatmullRomCurve3(pts), 7.5, 1.2, 10, 8));
  }
  const branchTips = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.4;
    const y0 = trunkTop * (0.72 + rnd() * 0.25), len = 48 + rnd() * 26;
    const end = new THREE.Vector3(Math.cos(a) * len, y0 + 22 + rnd() * 24, Math.sin(a) * len);
    const pts = [new THREE.Vector3(Math.cos(a) * 4, y0, Math.sin(a) * 4), new THREE.Vector3(Math.cos(a) * len * 0.45, y0 + 16, Math.sin(a) * len * 0.45), end];
    bark.push(tube(new THREE.CatmullRomCurve3(pts), 5.5, 1.2, 10, 7));
    branchTips.push(end);
  }
  const barkGeo = mergeGeometries(bark, false);
  const barkMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSun: { value: sunDir.clone() }, uHaze: { value: haze }, uH: { value: H } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun; uniform vec3 uHaze; uniform float uH; varying vec3 vN; varying vec3 vP;
      void main(){
        float l = dot(normalize(vN), uSun);
        float band = l > 0.2 ? 1.0 : (l > -0.15 ? 0.78 : 0.6);
        float a = atan(vP.z, vP.x);
        float grain = sin(a * 14.0 + vP.y * 0.09 + sin(vP.y * 0.05) * 3.0);
        vec3 c = mix(vec3(0.30, 0.22, 0.30), vec3(0.46, 0.34, 0.40), grain * 0.5 + 0.5) * band;
        // luminous veins of aether climbing the bark
        float vein = smoothstep(0.93, 1.0, sin(a * 7.0 + vP.y * 0.06 - uTime * 0.25 + sin(vP.y * 0.11) * 1.5));
        float pulse = 0.6 + 0.4 * sin(uTime * 1.2 - vP.y * 0.04);
        c += vec3(0.45, 1.0, 0.92) * vein * pulse * 1.3;
        c = mix(c, uHaze, 0.22 + 0.1 * (1.0 - smoothstep(0.0, uH * 0.5, vP.y)));
        gl_FragColor = vec4(c, 1.0);
      }`,
    fog: false,
  });
  const barkMesh = new THREE.Mesh(barkGeo, barkMat);
  barkMesh.name = 'worldTreeBark';
  group.add(barkMesh);

  // ---------------- canopy: big jittered blobs around the branch tips + crown
  const blobs = [];
  const centers = [new THREE.Vector3(0, H * 0.86, 0), ...branchTips];
  for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2, r = 20 + rnd() * 30; centers.push(new THREE.Vector3(Math.cos(a) * r, H * (0.78 + rnd() * 0.2), Math.sin(a) * r)); }
  centers.forEach((c, i) => {
    const r = i === 0 ? 46 : 24 + rnd() * 16;
    let g = new THREE.IcosahedronGeometry(1, 2);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
    const p = g.attributes.position;
    const ph = new Float32Array(p.count);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const j = 1 + Math.sin(x * 5.1 + z * 3.3 + i) * 0.08 + Math.sin(y * 6.7 + i * 2) * 0.06;
      p.setXYZ(k, c.x + x * r * j, c.y + y * r * 0.72 * j, c.z + z * r * j);
      ph[k] = rnd() * 0.3 + i * 0.37;
    }
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.computeVertexNormals();
    blobs.push(g);
  });
  const canopyGeo = mergeGeometries(blobs, false);
  const canopyMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSun: { value: sunDir.clone() }, uHaze: { value: haze }, uH: { value: H } },
    vertexShader: /* glsl */`
      attribute float aPhase; uniform float uTime; varying vec3 vN; varying vec3 vP; varying vec3 vV; varying float vPh;
      void main(){
        vec3 p = position; p += normal * sin(uTime * 0.6 + aPhase * 6.0 + position.y * 0.05) * 0.8;
        vN = normalize(normal); vP = position; vPh = aPhase;
        vec4 wp = modelMatrix * vec4(p, 1.0); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun; uniform vec3 uHaze; uniform float uH; varying vec3 vN; varying vec3 vP; varying vec3 vV; varying float vPh;
      void main(){
        vec3 n = normalize(vN);
        float l = dot(n, uSun);
        float band = l > 0.3 ? 1.0 : (l > -0.05 ? 0.78 : 0.58);
        float under = smoothstep(-0.7, 0.2, n.y);
        float hy = smoothstep(uH * 0.62, uH * 1.08, vP.y);
        vec3 deep = vec3(0.05, 0.36, 0.40), top = vec3(0.30, 0.92, 0.55), gold = vec3(1.0, 0.82, 0.38);
        vec3 c = mix(deep, top, hy) * band * mix(0.6, 1.0, under);
        float spark = sin(vP.x * 0.21 + uTime * 0.7 + vPh * 9.0) * sin(vP.z * 0.19 - uTime * 0.5) * sin(vP.y * 0.23 + vPh);
        c += gold * smoothstep(0.75, 0.95, spark) * 0.35;   // small gold glints (were saturating to white blotches)
        float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
        c += vec3(0.9, 1.0, 0.6) * rim * 0.35;
        c *= 1.0 + 0.15 * sin(uTime * 0.8 + vPh * 3.0);
        c = mix(c, uHaze, mix(0.06, 0.12, hy));
        gl_FragColor = vec4(c, 1.0);
      }`,
    fog: false,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.name = 'worldTreeCanopy';
  group.add(canopy);

  // ---------------- halo (camera-facing additive disc behind the crown)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * 420.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float k = pow(max(0.0, 1.0 - r), 2.2);
        float ray = 0.75 + 0.25 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 9.0 + uTime * 0.15);
        gl_FragColor = vec4(vec3(0.55, 1.0, 0.8) * k * 0.42 * ray, 1.0); }`,
  }));
  halo.position.set(0, H * 0.84, 0); halo.renderOrder = -0.8; halo.frustumCulled = false;
  halo.name = 'worldTreeHalo';
  group.add(halo);

  // ---------------- drifting aether motes around and below the canopy
  const NM = 520;
  const mp = new Float32Array(NM * 3), ms = new Float32Array(NM * 2);
  for (let i = 0; i < NM; i++) {
    const a = rnd() * Math.PI * 2, r = 10 + Math.sqrt(rnd()) * 120;
    mp.set([Math.cos(a) * r, H * 0.35 + rnd() * H * 0.7, Math.sin(a) * r], i * 3); ms.set([rnd(), rnd()], i * 2);
  }
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mgeo.setAttribute('aSeed', new THREE.BufferAttribute(ms, 2));
  const uScale = { value: 1 };
  const motes = new THREE.Points(mgeo, new THREE.ShaderMaterial({
    uniforms: { uTime, uScale, uH: { value: H } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uScale; uniform float uH; attribute vec2 aSeed; varying float vA; varying float vK;
      void main(){
        vec3 p = position;
        float life = fract(uTime * (0.02 + aSeed.x * 0.03) + aSeed.y);
        p.y -= life * uH * 0.35;
        p.x += sin(uTime * 0.3 + aSeed.y * 30.0) * 6.0; p.z += cos(uTime * 0.25 + aSeed.x * 30.0) * 6.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.5, (2600.0 + aSeed.x * 2600.0) * uScale / -mv.z);
        vA = smoothstep(0.0, 0.1, life) * (1.0 - life) * (0.6 + 0.4 * sin(uTime * 2.0 + aSeed.x * 40.0)); vK = aSeed.y;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vK;
      void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        vec3 c = vK > 0.6 ? vec3(1.0, 0.9, 0.55) : vec3(0.6, 1.0, 0.9);
        gl_FragColor = vec4(c * 1.4 * a * vA, 1.0); }`,
  }));
  motes.frustumCulled = false; motes.name = 'worldTreeMotes';
  group.add(motes);

  return {
    group,
    data: { position: new THREE.Vector3(T.x, T.baseY, T.z), height: H, crown: new THREE.Vector3(T.x, T.baseY + H * 0.86, T.z), name: '세계수 아스트라' },
    meshes: [barkMesh, canopy, halo, motes],
    update(t) { uTime.value = t; uScale.value = game.renderer.domElement.height / 720; },
  };
}
