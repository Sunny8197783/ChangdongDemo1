// Wind-swept grass + wildflowers.
// Chunked patch instancing: each layer has ONE patch geometry (a square of S×S metres holding N random blades) that is
// instanced over the visible world chunks only (CPU frustum + distance culling every frame, empty chunks skipped).
// LOD: a dense near layer (3 segs, thin) and a sparse far layer (wide 2-seg blades). Density setting = drawRange
// over the randomly-ordered blades (live, no rebuild). Blades sample the exact terrain height (texelFetch, same
// triangle split as the CPU mesh), the terrain colour/density map, the surface burn mask (burnt blades shrink and
// char, burning ones glow) and up to 6 wind-gust impulses (wind spells).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { ORIGIN, CELL, NV, SEG } from './terrain.js';

export const GUSTS = 6;

const COMMON_GLSL = /* glsl */`
  uniform sampler2D uHeightTex;
  uniform sampler2D uColorTex;
  uniform sampler2D uBurnTex;
  uniform vec4 uBurnXform;   // origin.x, origin.z, 1/size.x, 1/size.z
  uniform float uTime;
  uniform vec2 uFade;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform vec3 uPlayer;
  uniform vec4 uGust[${GUSTS}];     // x, z, radius, amount
  uniform vec4 uGustDir[${GUSTS}];  // dx, dz (0,0 = radial), phase, 0
  attribute vec4 aBlade;            // local x, local z (0..S), angle, rnd
  attribute vec3 aChunk;            // chunk origin x, z, rotation code
  varying float vT;
  varying vec3 vGCol;
  varying float vGlow;
  varying vec2 vBurn;
  float terrainH(vec2 p){
    vec2 g = (p - vec2(${ORIGIN.toFixed(4)})) / ${CELL.toFixed(6)};
    g = clamp(g, vec2(0.0), vec2(${(NV - 1.001).toFixed(4)}));
    ivec2 c = ivec2(floor(g)); vec2 f = g - vec2(c);
    float h00 = texelFetch(uHeightTex, c, 0).r;
    float h10 = texelFetch(uHeightTex, c + ivec2(1,0), 0).r;
    float h01 = texelFetch(uHeightTex, c + ivec2(0,1), 0).r;
    float h11 = texelFetch(uHeightTex, c + ivec2(1,1), 0).r;
    if (f.y >= f.x) return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
    return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
  }
  vec4 terrainC(vec2 p){
    vec2 uv = ((p - vec2(${ORIGIN.toFixed(4)})) / ${CELL.toFixed(6)} + 0.5) / ${NV.toFixed(1)};
    return texture(uColorTex, uv);
  }
  vec2 burnAt(vec2 p){ return texture(uBurnTex, (p - uBurnXform.xy) * uBurnXform.zw).rg; }
  float windWave(vec2 base){
    vec2 perp = vec2(-uWindDir.y, uWindDir.x);
    float w = sin(dot(base, uWindDir) * 0.085 - uTime * 1.55 + sin(dot(base, perp) * 0.045 + uTime * 0.2) * 1.8);
    float w2 = sin(dot(base, uWindDir) * 0.21 - uTime * 2.6 + dot(base, perp) * 0.07);
    return clamp((w * 0.5 + 0.5) * 0.8 + (w2 * 0.5 + 0.5) * 0.25, 0.0, 1.0);
  }
  // chunk-local blade position, rotated by 0/90/180/270 deg (+mirror) per chunk so patches never visibly tile
  vec2 chunkBase(float S){
    vec2 l = aBlade.xy - S * 0.5;
    float k = aChunk.z;
    if (k >= 4.0) { l.x = -l.x; k -= 4.0; }
    if (k >= 2.0) { l = -l; k -= 2.0; }
    if (k >= 1.0) { l = vec2(-l.y, l.x); }
    return aChunk.xy + S * 0.5 + l;
  }
  // gust impulses: returns bend amount, rotates bdir in place
  float gusts(vec2 base, inout vec2 bdir){
    float add = 0.0;
    for (int i = 0; i < ${GUSTS}; i++) {
      vec4 g = uGust[i];
      if (g.w <= 0.001) continue;
      vec2 d = base - g.xy; float l = length(d);
      float f = (1.0 - smoothstep(g.z * 0.45, g.z, l)) * g.w;
      if (f <= 0.0) continue;
      vec2 gd = dot(uGustDir[i].xy, uGustDir[i].xy) > 0.01 ? uGustDir[i].xy : d / max(l, 0.001);
      f *= 0.75 + 0.25 * sin(l * 0.9 - uTime * 9.0 + uGustDir[i].z);
      bdir = normalize(mix(bdir, gd, clamp(f * 1.5, 0.0, 1.0)));
      add += f;
    }
    return add;
  }
`;

const SHARED_UNIFORM_KEYS = ['uHeightTex', 'uColorTex', 'uBurnTex', 'uBurnXform', 'uTime', 'uWindDir', 'uWindStrength', 'uPlayer', 'uGust', 'uGustDir'];

function bladePatch(n, S, blades, segs, seed) {
  // each "clump" holds `blades` blades; vertices carry the clump data in aBlade, blade index in position.z
  const rnd = mulberry32(seed);
  const vpb = segs * 2 + 1;
  const pos = new Float32Array(n * blades * vpb * 3), bl = new Float32Array(n * blades * vpb * 4);
  const ipb = (segs - 1) * 6 + 3;
  const index = new Uint32Array(n * blades * ipb);
  let v = 0, ii = 0;
  for (let c = 0; c < n; c++) {
    const x = rnd() * S, z = rnd() * S, ang = rnd() * Math.PI * 2, r = rnd();
    for (let b = 0; b < blades; b++) {
      const start = v;
      const put = (px, py) => { pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = b; bl[v * 4] = x; bl[v * 4 + 1] = z; bl[v * 4 + 2] = ang; bl[v * 4 + 3] = r; v++; };
      for (let s = 0; s < segs; s++) { const t = s / segs; put(-0.5, t); put(0.5, t); }
      put(0, 1);
      for (let s = 0; s < segs - 1; s++) {
        const a = start + s * 2;
        index[ii++] = a; index[ii++] = a + 1; index[ii++] = a + 2; index[ii++] = a + 1; index[ii++] = a + 3; index[ii++] = a + 2;
      }
      const a = start + (segs - 1) * 2;
      index[ii++] = a; index[ii++] = a + 1; index[ii++] = a + 2;
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.BufferAttribute(bl, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.userData.indexPerUnit = blades * ipb;
  g.userData.units = n;
  return g;
}

function flowerPatch(n, S, seed) {
  // stem quad (part 0) + 10-vertex star head (part 1) + centre (part 2)
  const rnd = mulberry32(seed);
  const P = 10, vpf = 4 + 1 + P;
  const pos = new Float32Array(n * vpf * 3), part = new Float32Array(n * vpf), bl = new Float32Array(n * vpf * 4);
  const index = new Uint32Array(n * (6 + P * 3));
  let v = 0, ii = 0;
  for (let f = 0; f < n; f++) {
    const x = rnd() * S, z = rnd() * S, ang = rnd() * Math.PI * 2, r = rnd();
    const start = v;
    const put = (px, py, pz, pt) => { pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz; part[v] = pt; bl[v * 4] = x; bl[v * 4 + 1] = z; bl[v * 4 + 2] = ang; bl[v * 4 + 3] = r; v++; };
    put(-0.5, 0, 0, 0); put(0.5, 0, 0, 0); put(-0.5, 1, 0, 0); put(0.5, 1, 0, 0);
    index[ii++] = start; index[ii++] = start + 1; index[ii++] = start + 2; index[ii++] = start + 1; index[ii++] = start + 3; index[ii++] = start + 2;
    const c = v; put(0, 1, 0, 2);
    for (let i = 0; i < P; i++) { const a = (i / P) * Math.PI * 2; const rr = i % 2 === 0 ? 1 : 0.45; put(Math.cos(a) * rr, 1, Math.sin(a) * rr, 1); }
    for (let i = 0; i < P; i++) { index[ii++] = c; index[ii++] = c + 1 + i; index[ii++] = c + 1 + ((i + 1) % P); }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aBlade', new THREE.BufferAttribute(bl, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.userData.indexPerUnit = 6 + P * 3;
  g.userData.units = n;
  return g;
}

function grassShader(layer) {
  const L = layer;
  return {
    vertex: /* glsl */`
        vec2 base = chunkBase(${L.S.toFixed(2)});
        float rnd = fract(aBlade.w + aChunk.z * 0.137 + fract(aChunk.x * 0.0131 + aChunk.y * 0.0173));
        float bi = position.z;
        float ang = aBlade.z + bi * 2.399 + aChunk.z;
        vec2 fdir = vec2(cos(ang), sin(ang));
        vec2 lean = vec2(-fdir.y, fdir.x);
        base += vec2(cos(ang * 1.7 + 1.0), sin(ang * 1.7 + 1.0)) * 0.11 * bi;
        vec4 tc = terrainC(base);
        vec2 burn = burnAt(base);
        float camD = distance(base, cameraPosition.xz);
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, camD);
        float dens = tc.a;
        float keep = step(fract(rnd * 13.17 + bi * 0.31), dens * 1.1 - 0.05);
        float patchy = sin(base.x * 0.13 + sin(base.y * 0.071) * 2.0) * sin(base.y * 0.11 + 1.3) * 0.5 + 0.5;
        float hgt = mix(${L.height[0].toFixed(3)}, ${L.height[1].toFixed(3)}, fract(rnd * 7.31 + bi * 0.17));
        hgt *= (0.5 + 0.5 * dens) * (0.75 + 0.5 * patchy) * keep * sqrt(fade);
        hgt *= 1.0 - max(burn.r * 0.9, burn.g * 0.55);   // burning blades are consumed: the low flame linework stands above them
        float t = position.y;
        float w = position.x * ${L.width.toFixed(3)} * (1.0 - t * 0.85) * (0.8 + 0.4 * fract(rnd * 3.7)) * (1.0 + camD * ${L.widthGrow.toFixed(4)});
        float ground = terrainH(base);
        float gust = windWave(base);
        float flutter = sin(uTime * 4.3 + rnd * 40.0 + base.x * 0.7 + bi) * 0.07;
        float bend = (0.22 + 0.85 * gust * gust + flutter) * uWindStrength;
        vec2 bdir = normalize(uWindDir + lean * (fract(rnd * 5.3) - 0.5) * 0.7);
        bend += gusts(base, bdir) * 1.3;
        bend += burn.g * (0.4 + 0.3 * sin(uTime * 11.0 + rnd * 20.0));
        vec2 pd = base - uPlayer.xz; float pl = length(pd);
        float push = (1.0 - smoothstep(0.25, 1.7, pl)) * (1.0 - smoothstep(1.5, 3.0, abs(uPlayer.y - ground)));
        bdir = normalize(mix(bdir, pd / max(pl, 0.001), push));
        bend = mix(bend, 1.5, push);
        bend = min(bend, 2.2);
        float bt = bend * t * t;
        grassPos.xz = base + fdir * w + bdir * bt * hgt * 0.85 + lean * (fract(rnd * 9.1) - 0.5) * 0.35 * t * t * hgt;
        grassPos.y = ground + t * hgt * (1.0 - 0.32 * min(bend, 1.4) * t) - 0.04;
        vT = t; vGCol = tc.rgb; vGlow = gust; vBurn = burn;
        vec3 objectNormal = normalize(vec3(bdir.x * 0.35 + fdir.x * position.x * 0.3, 1.0, bdir.y * 0.35 + fdir.y * position.x * 0.3));
      `,
    fragment: /* glsl */`
        vec3 gBase = vGCol * 0.5;
        vec3 gTip = mix(vGCol * 1.32, vec3(0.62, 0.86, 0.22), 0.28);
        vec3 gc = mix(gBase, gTip, smoothstep(0.0, 1.0, vT));
        gc = mix(gc, gc * 1.22 + vec3(0.04, 0.05, 0.0), vGlow * vT * 0.55);
        gc = mix(gc, vec3(0.11, 0.085, 0.06), smoothstep(0.05, 0.6, vBurn.r));
        vec4 diffuseColor = vec4(gc, 1.0);
      `,
    emissive: 'totalEmissiveRadiance += vGCol * vT * vT * 0.12 * (0.5 + vGlow) * (1.0 - vBurn.r) + vec3(1.0, 0.36, 0.06) * vBurn.g * (0.35 + vT * 1.4);',
  };
}

function flowerShader() {
  return {
    vertex: /* glsl */`
        vec2 base = chunkBase(${(8).toFixed(2)});
        float rnd = fract(aBlade.w + aChunk.z * 0.137 + fract(aChunk.x * 0.0131 + aChunk.y * 0.0173));
        vec4 tc = terrainC(base);
        vec2 burn = burnAt(base);
        float camD = distance(base, cameraPosition.xz);
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, camD);
        float field = sin(base.x * 0.045 + 1.7) * sin(base.y * 0.052 - 0.4) + sin(base.x * 0.13 + base.y * 0.09) * 0.35;
        float keep = step(0.25, field + fract(rnd * 3.3) * 0.5) * step(0.55, tc.a) * step(burn.r, 0.15);
        float hgt = mix(0.55, 0.95, fract(rnd * 7.7)) * keep * sqrt(fade);
        float ground = terrainH(base);
        float gust = windWave(base);
        float bend = (0.15 + 0.6 * gust * gust + sin(uTime * 3.1 + rnd * 30.0) * 0.06) * uWindStrength;
        vec2 bdir = uWindDir;
        bend += gusts(base, bdir);
        vec2 pd = base - uPlayer.xz; float pl = length(pd);
        float push = 1.0 - smoothstep(0.25, 1.4, pl);
        bdir = normalize(mix(bdir, pd / max(pl, 0.001), push)); bend = min(mix(bend, 1.2, push), 1.8);
        float ang = aBlade.z + aChunk.z;
        vec2 fdir = vec2(cos(ang), sin(ang));
        float t = position.y;
        vec3 p;
        if (aPart < 0.5) {
          p = vec3(base.x + fdir.x * position.x * 0.025, ground + t * hgt, base.y + fdir.y * position.x * 0.025);
        } else {
          float hs = mix(0.11, 0.18, fract(rnd * 11.3)) * keep;
          p = vec3(base.x + position.x * hs, ground + hgt + (position.x * cos(ang) + position.z * sin(ang)) * hs * 0.55, base.y + position.z * hs);
          t = 1.0;
        }
        p.xz += bdir * bend * t * t * hgt * 0.7;
        p.y -= bend * t * hgt * 0.15;
        grassPos = p;
        vT = t; vPart = aPart; vGlow = rnd; vGCol = tc.rgb; vBurn = burn;
        vec3 objectNormal = vec3(0.0, 1.0, 0.0);
      `,
    fragment: /* glsl */`
        float k = fract(vGlow * 17.0);
        vec3 fc = k < 0.34 ? vec3(1.0, 0.98, 0.93) : (k < 0.58 ? vec3(1.0, 0.84, 0.18) : (k < 0.8 ? vec3(0.62, 0.42, 0.95) : (k < 0.92 ? vec3(0.45, 0.68, 1.0) : vec3(1.0, 0.55, 0.7))));
        vec3 c = vPart > 1.5 ? vec3(1.0, 0.8, 0.25) : (vPart > 0.5 ? fc : vGCol * mix(0.5, 0.9, vT));
        vec4 diffuseColor = vec4(c, 1.0);
      `,
    emissive: 'totalEmissiveRadiance += (vPart > 0.5 ? diffuseColor.rgb * 0.55 : vec3(0.0));',
  };
}

function makeLayer(game, shared, L) {
  const geo = L.flower ? flowerPatch(L.units, L.S, L.seed) : bladePatch(L.units, L.S, L.blades, L.segs, L.seed);
  const MAXI = L.maxChunks;
  const chunkArr = new Float32Array(MAXI * 3);
  const chunkAttr = new THREE.InstancedBufferAttribute(chunkArr, 3);
  chunkAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aChunk', chunkAttr);
  geo.instanceCount = 0;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const uniforms = { uFade: { value: new THREE.Vector2(L.fade[0], L.fade[1]) } };
  for (const k of SHARED_UNIFORM_KEYS) uniforms[k] = shared[k];
  const sh = L.flower ? flowerShader() : grassShader(L);
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON_GLSL + (L.flower ? 'attribute float aPart; varying float vPart;\n' : '') + 'vec3 grassPos;\n')
      .replace('#include <beginnormal_vertex>', sh.vertex)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGCol; varying float vGlow; varying vec2 vBurn;' + (L.flower ? ' varying float vPart;' : ''))
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', sh.fragment)
      .replace('#include <emissivemap_fragment>', sh.emissive);
  };
  mat.customProgramCacheKey = () => 'grass2_' + L.name;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grass_' + L.name;
  mesh.renderOrder = -0.5;
  game.scene.add(mesh);
  return { mesh, geo, mat, uniforms, L, chunkArr, chunkAttr, MAXI };
}

export function buildGrass(game, terrain, wind, opts = {}) {
  const shared = {
    uHeightTex: { value: terrain.heightTex }, uColorTex: { value: terrain.colorTex },
    uBurnTex: { value: opts.burnTex || blankBurn() }, uBurnXform: { value: opts.burnXform || new THREE.Vector4(0, 0, 0, 0) },
    uTime: { value: 0 }, uWindDir: { value: wind.dir2 }, uWindStrength: { value: 1 },
    uPlayer: { value: new THREE.Vector3(0, -999, 0) },
    uGust: { value: Array.from({ length: GUSTS }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uGustDir: { value: Array.from({ length: GUSTS }, () => new THREE.Vector4()) },
  };
  // units = clumps per patch at density 1 (≈37 blades/m² near, 7.5 far, 1.1 flowers/m² — same as v1 at 'high')
  const defs = [
    { name: 'near', S: 4, units: 197, blades: 3, segs: 3, width: 0.075, widthGrow: 0.004, height: [0.38, 0.78], fade: [14, 21], maxChunks: 220, seed: 11 },
    { name: 'far', S: 10, units: 375, blades: 2, segs: 1, width: 0.1, widthGrow: 0.012, height: [0.4, 0.82], fade: [38, 56], maxChunks: 220, seed: 12 },
    { name: 'flowers', flower: true, S: 8, units: 71, fade: [30, 44], maxChunks: 160, seed: 13 },
  ];
  const layers = defs.map((d) => makeLayer(game, shared, d));

  // per-layer world chunk tables: max grass density + height range (for empty-skip and frustum AABB)
  const colA = terrain.colTexData, heights = terrain.heights;
  const W0 = ORIGIN, WS = SEG * CELL;
  for (const Ly of layers) {
    const S = Ly.L.S, n = Math.ceil(WS / S);
    const dmax = new Uint8Array(n * n), hmin = new Float32Array(n * n), hmax = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, Math.floor((i * S) / CELL)), i1 = Math.min(SEG, Math.ceil(((i + 1) * S) / CELL));
      const j0 = Math.max(0, Math.floor((j * S) / CELL)), j1 = Math.min(SEG, Math.ceil(((j + 1) * S) / CELL));
      let dm = 0, lo = Infinity, hi = -Infinity;
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const k = jj * NV + ii;
        dm = Math.max(dm, colA[k * 4 + 3]); const h = heights[k]; if (h < lo) lo = h; if (h > hi) hi = h;
      }
      dmax[j * n + i] = dm; hmin[j * n + i] = lo; hmax[j * n + i] = hi;
    }
    Object.assign(Ly, { n, dmax, hmin, hmax });
  }

  // ---------------------------------------------------------------- settings (live)
  // v4: density = settings.grassDensity (0.25/0.4/0.85) × budget.grassMul; fade distances × settings.grassNearFade
  // (0.6/0.7/1.0); receiveShadow per preset (off at low/medium); chunks beyond the fade end are skipped on the CPU.
  let density = 0.6, drawDist = 0.8, fadeMul = 1, densMul = 1;
  function applySettings() {
    const dens0 = density * densMul;
    for (const Ly of layers) {
      const L = Ly.L;
      const dscale = (L.name === 'near' ? 0.75 + 0.25 * drawDist : 0.55 + 0.45 * drawDist) * fadeMul;
      const dens = L.name === 'flowers' ? Math.min(1, 0.35 + dens0 * 0.65) : Math.max(0.04, dens0);
      Ly.fadeNow = [L.fade[0] * dscale, L.fade[1] * dscale];
      Ly.uniforms.uFade.value.set(Ly.fadeNow[0], Ly.fadeNow[1]);
      const units = Math.max(1, Math.round(Ly.geo.userData.units * dens));
      Ly.geo.setDrawRange(0, units * Ly.geo.userData.indexPerUnit);
      Ly.mesh.visible = dens0 > 0.001;
    }
  }
  applySettings();

  // ---------------------------------------------------------------- per-frame chunk selection
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), box = new THREE.Box3();
  const stats = { chunks: 0 };
  function cull(cam) {
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    stats.chunks = 0;
    const cx = cam.position.x, cz = cam.position.z;
    for (const Ly of layers) {
      if (!Ly.mesh.visible) { Ly.geo.instanceCount = 0; continue; }
      const S = Ly.L.S, n = Ly.n, R = Ly.fadeNow[1];   // nearest chunk point beyond the fade end = every blade faded out
      const i0 = Math.max(0, Math.floor((cx - R - W0) / S)), i1 = Math.min(n - 1, Math.floor((cx + R - W0) / S));
      const j0 = Math.max(0, Math.floor((cz - R - W0) / S)), j1 = Math.min(n - 1, Math.floor((cz + R - W0) / S));
      let c = 0; const arr = Ly.chunkArr, R2 = R * R;
      for (let j = j0; j <= j1 && c < Ly.MAXI; j++) for (let i = i0; i <= i1 && c < Ly.MAXI; i++) {
        const k = j * n + i;
        if (Ly.dmax[k] < 12) continue;
        const x0 = W0 + i * S, z0 = W0 + j * S;
        const dx = Math.max(x0 - cx, 0, cx - x0 - S), dz = Math.max(z0 - cz, 0, cz - z0 - S);
        if (dx * dx + dz * dz > R2) continue;
        box.min.set(x0 - 0.6, Ly.hmin[k] - 0.2, z0 - 0.6); box.max.set(x0 + S + 0.6, Ly.hmax[k] + 1.2, z0 + S + 0.6);
        if (!frustum.intersectsBox(box)) continue;
        arr[c * 3] = x0; arr[c * 3 + 1] = z0; arr[c * 3 + 2] = ((i * 7 + j * 13) ^ (i * j)) & 7;
        c++;
      }
      Ly.geo.instanceCount = c;
      Ly.chunkAttr.clearUpdateRanges?.();
      Ly.chunkAttr.addUpdateRange?.(0, c * 3);
      Ly.chunkAttr.needsUpdate = true;
      stats.chunks += c;
    }
  }

  return {
    shared, layers, stats,
    setDensity(v) { density = Math.max(0, Math.min(1, v)); applySettings(); },
    /** v4: fade-distance factor (settings.grassNearFade) and governor density multiplier (budget.grassMul). */
    setFadeMul(v) { const f = Math.max(0.3, Math.min(1.2, v ?? 1)); if (f !== fadeMul) { fadeMul = f; applySettings(); } },
    setDensityMul(v) { const f = Math.max(0, Math.min(1, v ?? 1)); if (f !== densMul) { densMul = f; applySettings(); } },
    setReceiveShadow(on) { for (const Ly of layers) Ly.mesh.receiveShadow = !!on; },
    get density() { return density * densMul; }, get fadeMul() { return fadeMul; },
    setDrawDistance(v) { drawDist = Math.max(0, Math.min(1, v)); applySettings(); },
    update(t, cam, playerPos) {
      shared.uTime.value = t;
      if (playerPos) shared.uPlayer.value.copy(playerPos);
      cull(cam);
    },
  };
}

function blankBurn() {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true; return t;
}
