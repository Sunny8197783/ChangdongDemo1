// Stylized water: depth gradient from the terrain height texture, toon ripples, sun sparkle, shore foam.
import * as THREE from 'three';
import { WATER_LEVEL, TERRAIN_GLSL } from './terrain.js';

export const WATER_BOX = { x0: -150, x1: 80, z0: -125, z1: 70 };

export function buildWater(game, terrain, sunDir, skyColor) {
  const B = WATER_BOX;
  const w = B.x1 - B.x0, d = B.z1 - B.z0;
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uLevel: { value: WATER_LEVEL },
    uSunDir: { value: sunDir.clone() },
    uSky: { value: skyColor.clone() },
    uDeep: { value: new THREE.Color(0x1f6fa8) }, uShallow: { value: new THREE.Color(0x46d6d0) },
    uFoam: { value: new THREE.Color(0xf4fbff) },
  }]);
  uniforms.uHeightTex = { value: terrain.heightTex };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uHeightTex;
      uniform float uTime, uLevel;
      uniform vec3 uSunDir, uSky, uDeep, uShallow, uFoam;
      varying vec3 vWorld;
      ${TERRAIN_GLSL}
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hsh(i),hsh(i+vec2(1,0)),u.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),u.x), u.y); }
      float waves(vec2 p){
        float t = uTime;
        return vn(p * 0.35 + vec2(t * 0.25, t * 0.12)) * 0.6 + vn(p * 0.9 - vec2(t * 0.18, -t * 0.3)) * 0.3 + vn(p * 2.3 + vec2(-t * 0.5, t * 0.4)) * 0.1;
      }
      void main(){
        vec2 p = vWorld.xz;
        float th = terrainH(p);
        float depth = uLevel - th;
        if (depth < -0.02) discard;
        float e = 0.2;
        float h0 = waves(p), hx = waves(p + vec2(e, 0.0)), hz = waves(p + vec2(0.0, e));
        vec3 n = normalize(vec3((h0 - hx) * 2.2, 1.0, (h0 - hz) * 2.2));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.1, 3.2, depth));
        // toon ripple bands
        float band = smoothstep(0.62, 0.66, h0) - smoothstep(0.7, 0.74, h0);
        col += vec3(0.2, 0.28, 0.3) * band * 0.35;
        // caustic-like shallow shimmer
        float caus = smoothstep(0.55, 0.9, vn(p * 1.6 + uTime * 0.3) * vn(p * 1.3 - uTime * 0.25) * 2.0);
        col += vec3(0.25, 0.35, 0.3) * caus * (1.0 - smoothstep(0.2, 1.8, depth)) * 0.6;
        col = mix(col, uSky, fres * 0.55);
        // sun sparkle
        vec3 r = reflect(-uSunDir, n);
        float sp = pow(max(dot(r, v), 0.0), 220.0);
        float sparkle = step(0.35, sp) * 1.8 + sp * 0.8;
        col += vec3(1.0, 0.97, 0.9) * sparkle;
        // shore foam
        float fw = 0.35 + 0.12 * sin(uTime * 1.4 + p.x * 0.35 + p.y * 0.2);
        float fn = vn(p * 1.8 + vec2(uTime * 0.2, 0.0));
        float foam = step(depth, fw * (0.6 + 0.8 * fn));
        float foam2 = step(abs(depth - fw * 1.7 - 0.1 * sin(uTime * 1.1 + p.y)), 0.035) * step(0.45, fn);
        foam = max(foam, foam2 * 0.8);
        col = mix(col, uFoam, foam * 0.9);
        float alpha = mix(0.58, 0.92, smoothstep(0.0, 2.2, depth));
        alpha = max(alpha, foam * 0.95);
        alpha *= smoothstep(-0.02, 0.06, depth);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((B.x0 + B.x1) / 2, WATER_LEVEL, (B.z0 + B.z1) / 2);
  mesh.renderOrder = 1;
  mesh.name = 'water';
  game.scene.add(mesh);
  return { mesh, uniforms, update(t) { uniforms.uTime.value = t; } };
}
