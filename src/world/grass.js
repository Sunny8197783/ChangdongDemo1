// Wind-swept grass + wildflowers. GPU-placed blades in toroidally wrapped tiles that follow the camera,
// sampling the exact terrain height (texelFetch + same triangle split as the CPU mesh) and a colour/density map.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { ORIGIN, CELL, NV } from './terrain.js';

const COMMON_GLSL = /* glsl */`
  uniform sampler2D uHeightTex;
  uniform sampler2D uColorTex;
  uniform float uTime;
  uniform vec2 uCenter;
  uniform float uTile;
  uniform vec2 uFade;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform vec3 uPlayer;
  attribute vec4 aOffset;
  varying float vT;
  varying vec3 vGCol;
  varying float vGlow;
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
  vec2 wrapBase(vec2 b){ return b + floor((uCenter - b) / uTile + 0.5) * uTile; }
  float windWave(vec2 base){
    vec2 perp = vec2(-uWindDir.y, uWindDir.x);
    float w = sin(dot(base, uWindDir) * 0.085 - uTime * 1.55 + sin(dot(base, perp) * 0.045 + uTime * 0.2) * 1.8);
    float w2 = sin(dot(base, uWindDir) * 0.21 - uTime * 2.6 + dot(base, perp) * 0.07);
    return clamp((w * 0.5 + 0.5) * 0.8 + (w2 * 0.5 + 0.5) * 0.25, 0.0, 1.0);
  }
`;

function makeUniforms(shared, layer) {
  return {
    uHeightTex: shared.uHeightTex, uColorTex: shared.uColorTex, uTime: shared.uTime,
    uWindDir: shared.uWindDir, uWindStrength: shared.uWindStrength, uPlayer: shared.uPlayer,
    uCenter: { value: new THREE.Vector2() }, uTile: { value: layer.tile },
    uFade: { value: new THREE.Vector2(layer.fade[0], layer.fade[1]) },
  };
}

function bladeGeometry(blades, segs) {
  const pos = [], index = [];
  for (let b = 0; b < blades; b++) {
    const start = pos.length / 3;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      pos.push(-0.5, t, b, 0.5, t, b);
    }
    pos.push(0, 1, b);
    for (let s = 0; s < segs - 1; s++) {
      const a = start + s * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const a = start + (segs - 1) * 2;
    index.push(a, a + 1, a + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

function offsets(count, tile, seed) {
  const rnd = mulberry32(seed);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    a[i * 4] = (rnd() - 0.5) * tile; a[i * 4 + 1] = (rnd() - 0.5) * tile;
    a[i * 4 + 2] = rnd() * Math.PI * 2; a[i * 4 + 3] = rnd();
  }
  return new THREE.InstancedBufferAttribute(a, 4);
}

function grassLayer(game, shared, layer) {
  const geo = bladeGeometry(layer.blades, layer.segs);
  geo.setAttribute('aOffset', offsets(layer.count, layer.tile, layer.seed));
  geo.instanceCount = layer.count;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const uniforms = makeUniforms(shared, layer);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON_GLSL + 'vec3 grassPos;\n')
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec2 base = wrapBase(aOffset.xy);
        float rnd = aOffset.w;
        float bi = position.z;
        float ang = aOffset.z + bi * 2.399;
        vec2 fdir = vec2(cos(ang), sin(ang));
        vec2 lean = vec2(-fdir.y, fdir.x);
        base += vec2(cos(ang * 1.7 + 1.0), sin(ang * 1.7 + 1.0)) * 0.11 * bi;
        vec4 tc = terrainC(base);
        float camD = distance(base, cameraPosition.xz);
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, camD);
        float dens = tc.a;
        float keep = step(fract(rnd * 13.17 + bi * 0.31), dens * 1.1 - 0.05);
        float patchy = sin(base.x * 0.13 + sin(base.y * 0.071) * 2.0) * sin(base.y * 0.11 + 1.3) * 0.5 + 0.5;
        float hgt = mix(${layer.height[0].toFixed(3)}, ${layer.height[1].toFixed(3)}, fract(rnd * 7.31 + bi * 0.17));
        hgt *= (0.5 + 0.5 * dens) * (0.75 + 0.5 * patchy) * keep * sqrt(fade);
        float t = position.y;
        float w = position.x * ${layer.width.toFixed(3)} * (1.0 - t * 0.85) * (0.8 + 0.4 * fract(rnd * 3.7)) * (1.0 + camD * ${layer.widthGrow.toFixed(4)});
        float ground = terrainH(base);
        float gust = windWave(base);
        float flutter = sin(uTime * 4.3 + rnd * 40.0 + base.x * 0.7 + bi) * 0.07;
        float bend = (0.22 + 0.85 * gust * gust + flutter) * uWindStrength;
        vec2 bdir = normalize(uWindDir + lean * (fract(rnd * 5.3) - 0.5) * 0.7);
        vec2 pd = base - uPlayer.xz; float pl = length(pd);
        float push = (1.0 - smoothstep(0.25, 1.7, pl)) * (1.0 - smoothstep(1.5, 3.0, abs(uPlayer.y - ground)));
        bdir = normalize(mix(bdir, pd / max(pl, 0.001), push));
        bend = mix(bend, 1.5, push);
        float bt = bend * t * t;
        grassPos.xz = base + fdir * w + bdir * bt * hgt * 0.85 + lean * (fract(rnd * 9.1) - 0.5) * 0.35 * t * t * hgt;
        grassPos.y = ground + t * hgt * (1.0 - 0.32 * min(bend, 1.4) * t) - 0.04;
        vT = t; vGCol = tc.rgb; vGlow = gust;
        vec3 objectNormal = normalize(vec3(bdir.x * 0.35 + fdir.x * position.x * 0.3, 1.0, bdir.y * 0.35 + fdir.y * position.x * 0.3));
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGCol; varying float vGlow;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', /* glsl */`
        vec3 gBase = vGCol * 0.5;
        vec3 gTip = mix(vGCol * 1.32, vec3(0.62, 0.86, 0.22), 0.28);
        vec3 gc = mix(gBase, gTip, smoothstep(0.0, 1.0, vT));
        gc = mix(gc, gc * 1.22 + vec3(0.04, 0.05, 0.0), vGlow * vT * 0.55);
        vec4 diffuseColor = vec4(gc, 1.0);
      `)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vGCol * vT * vT * 0.12 * (0.5 + vGlow);');
  };
  mat.customProgramCacheKey = () => 'grass' + layer.seed;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grass_' + layer.seed;
  game.scene.add(mesh);
  return { mesh, uniforms, layer };
}

function flowerGeometry() {
  // stem quad (part 0) + 6-petal star head (part 1)
  const pos = [], part = [], index = [];
  pos.push(-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0); part.push(0, 0, 0, 0);
  index.push(0, 1, 2, 1, 3, 2);
  const c = 4; pos.push(0, 1, 0); part.push(2);
  const P = 10;
  for (let i = 0; i < P; i++) {
    const a = (i / P) * Math.PI * 2; const r = i % 2 === 0 ? 1 : 0.45;
    pos.push(Math.cos(a) * r, 1, Math.sin(a) * r); part.push(1);
  }
  for (let i = 0; i < P; i++) index.push(c, c + 1 + i, c + 1 + ((i + 1) % P));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(index);
  return g;
}

function flowerLayer(game, shared, layer) {
  const geo = flowerGeometry();
  geo.setAttribute('aOffset', offsets(layer.count, layer.tile, layer.seed));
  geo.instanceCount = layer.count;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const uniforms = makeUniforms(shared, layer);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON_GLSL + 'attribute float aPart; varying float vPart; vec3 grassPos;\n')
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec2 base = wrapBase(aOffset.xy);
        float rnd = aOffset.w;
        vec4 tc = terrainC(base);
        float camD = distance(base, cameraPosition.xz);
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, camD);
        // flower meadows: low-frequency patches
        float field = sin(base.x * 0.045 + 1.7) * sin(base.y * 0.052 - 0.4) + sin(base.x * 0.13 + base.y * 0.09) * 0.35;
        float keep = step(0.25, field + fract(rnd * 3.3) * 0.5) * step(0.55, tc.a);
        float hgt = mix(0.55, 0.95, fract(rnd * 7.7)) * keep * sqrt(fade);
        float ground = terrainH(base);
        float gust = windWave(base);
        float bend = (0.15 + 0.6 * gust * gust + sin(uTime * 3.1 + rnd * 30.0) * 0.06) * uWindStrength;
        vec2 pd = base - uPlayer.xz; float pl = length(pd);
        float push = 1.0 - smoothstep(0.25, 1.4, pl);
        vec2 bdir = normalize(mix(uWindDir, pd / max(pl, 0.001), push)); bend = mix(bend, 1.2, push);
        float ang = aOffset.z;
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
        vT = t; vPart = aPart; vGlow = rnd; vGCol = tc.rgb;
        vec3 objectNormal = vec3(0.0, 1.0, 0.0);
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGCol; varying float vGlow; varying float vPart;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', /* glsl */`
        float k = fract(vGlow * 17.0);
        vec3 fc = k < 0.34 ? vec3(1.0, 0.98, 0.93) : (k < 0.58 ? vec3(1.0, 0.84, 0.18) : (k < 0.8 ? vec3(0.62, 0.42, 0.95) : (k < 0.92 ? vec3(0.45, 0.68, 1.0) : vec3(1.0, 0.55, 0.7))));
        vec3 c = vPart > 1.5 ? vec3(1.0, 0.8, 0.25) : (vPart > 0.5 ? fc : vGCol * mix(0.5, 0.9, vT));
        vec4 diffuseColor = vec4(c, 1.0);
      `)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += (vPart > 0.5 ? diffuseColor.rgb * 0.55 : vec3(0.0));');
  };
  mat.customProgramCacheKey = () => 'flowers' + layer.seed;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'flowers';
  game.scene.add(mesh);
  return { mesh, uniforms, layer };
}

export function buildGrass(game, terrain, wind) {
  const shared = {
    uHeightTex: { value: terrain.heightTex }, uColorTex: { value: terrain.colorTex },
    uTime: { value: 0 }, uWindDir: { value: wind.dir2 }, uWindStrength: { value: 1 },
    uPlayer: { value: new THREE.Vector3(0, -999, 0) },
  };
  const layers = [
    grassLayer(game, shared, { count: 26000, tile: 46, blades: 3, segs: 3, width: 0.075, widthGrow: 0.004, height: [0.38, 0.78], fade: [14, 21], ahead: 9, seed: 11 }),
    grassLayer(game, shared, { count: 52000, tile: 118, blades: 2, segs: 2, width: 0.1, widthGrow: 0.012, height: [0.4, 0.82], fade: [38, 56], ahead: 24, seed: 12 }),
    flowerLayer(game, shared, { count: 9000, tile: 90, fade: [30, 44], ahead: 18, seed: 13 }),
  ];
  const fwd = new THREE.Vector3();
  return {
    shared, layers,
    update(t, cam, playerPos) {
      shared.uTime.value = t;
      if (playerPos) shared.uPlayer.value.copy(playerPos);
      cam.getWorldDirection(fwd); fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      for (const L of layers) L.uniforms.uCenter.value.set(cam.position.x + fwd.x * L.layer.ahead, cam.position.z + fwd.z * L.layer.ahead);
    },
  };
}
