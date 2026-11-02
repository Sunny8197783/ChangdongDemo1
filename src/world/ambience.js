// Ambient life: pollen motes, wind-blown leaves, circling birds. All GPU-wrapped around the camera except birds.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { TERRAIN_GLSL } from './terrain.js';

export function buildAmbience(game, terrain, wind) {
  const rnd = mulberry32(99);
  const uTime = { value: 0 };
  const uCam = { value: new THREE.Vector3() };
  const uHeightTex = { value: terrain.heightTex };
  const uWind = { value: wind.dir2 };
  const uScale = { value: 1 };

  // ---- pollen / firefly motes
  const NM = 380, BOX = 44;
  const mp = new Float32Array(NM * 3), ms = new Float32Array(NM * 4);
  for (let i = 0; i < NM; i++) {
    mp[i * 3] = rnd() * BOX; mp[i * 3 + 1] = rnd(); mp[i * 3 + 2] = rnd() * BOX;
    ms[i * 4] = rnd(); ms[i * 4 + 1] = rnd(); ms[i * 4 + 2] = rnd(); ms[i * 4 + 3] = rnd();
  }
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mgeo.setAttribute('aSeed', new THREE.BufferAttribute(ms, 4));
  const mmat = new THREE.ShaderMaterial({
    uniforms: { uTime, uCam, uHeightTex, uWind, uScale },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform vec3 uCam; uniform sampler2D uHeightTex; uniform vec2 uWind; uniform float uScale;
      attribute vec4 aSeed; varying float vA; varying float vK;
      ${TERRAIN_GLSL}
      void main(){
        vec2 drift = uWind * uTime * (0.4 + aSeed.x * 0.5) + vec2(sin(uTime * 0.5 + aSeed.y * 20.0), cos(uTime * 0.4 + aSeed.z * 20.0)) * 1.5;
        vec2 xz = position.xz + drift;
        xz = uCam.xz + mod(xz - uCam.xz + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
        float g = terrainH(xz);
        float y = g + 0.4 + position.y * 5.5 + sin(uTime * 0.8 + aSeed.w * 30.0) * 0.4;
        vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = length(xz - uCam.xz);
        vA = (1.0 - smoothstep(${(BOX * 0.32).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, d)) * (0.55 + 0.45 * sin(uTime * (1.5 + aSeed.x * 2.0) + aSeed.y * 40.0));
        vK = aSeed.z;
        // near motes vanish (and half of the mid-range ones), so they never read as snow
        vA *= smoothstep(1.5, 4.0, -mv.z) * (aSeed.x > 0.5 ? 1.0 : smoothstep(6.0, 12.0, -mv.z));
        gl_PointSize = min((aSeed.w > 0.85 ? 160.0 : 95.0) * uScale / -mv.z, 10.0 * uScale);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vK;
      void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); a *= a;
        vec3 c = vK > 0.7 ? vec3(0.9, 1.0, 0.5) : vec3(1.0, 0.86, 0.5);
        gl_FragColor = vec4(c, a * vA * 0.8); }`,
  });
  const motes = new THREE.Points(mgeo, mmat);
  motes.frustumCulled = false; motes.renderOrder = 6;
  game.scene.add(motes);

  // ---- leaves
  const NL = 90, LB = 56;
  const lgeo = new THREE.InstancedBufferGeometry();
  lgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.5, 0, 0.45, 0, 0, 0, 0.5, 0, -0.45, 0, 0], 3));
  lgeo.setIndex([0, 1, 2, 0, 2, 3]);
  const la = new Float32Array(NL * 4), lb = new Float32Array(NL * 4);
  for (let i = 0; i < NL; i++) {
    la[i * 4] = rnd() * LB; la[i * 4 + 1] = rnd(); la[i * 4 + 2] = rnd() * LB; la[i * 4 + 3] = rnd();
    lb[i * 4] = rnd(); lb[i * 4 + 1] = rnd(); lb[i * 4 + 2] = rnd(); lb[i * 4 + 3] = rnd();
  }
  lgeo.setAttribute('aA', new THREE.InstancedBufferAttribute(la, 4));
  lgeo.setAttribute('aB', new THREE.InstancedBufferAttribute(lb, 4));
  lgeo.instanceCount = NL;
  const lmat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    side: THREE.DoubleSide, fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime; uniform vec3 uCam; uniform sampler2D uHeightTex; uniform vec2 uWind;
      attribute vec4 aA; attribute vec4 aB; varying vec3 vC; varying float vShade;
      ${TERRAIN_GLSL}
      mat3 rotA(vec3 ax, float a){ float s = sin(a), c = cos(a), oc = 1.0 - c;
        return mat3(oc*ax.x*ax.x + c, oc*ax.x*ax.y + ax.z*s, oc*ax.z*ax.x - ax.y*s,
                    oc*ax.x*ax.y - ax.z*s, oc*ax.y*ax.y + c, oc*ax.y*ax.z + ax.x*s,
                    oc*ax.z*ax.x + ax.y*s, oc*ax.y*ax.z - ax.x*s, oc*ax.z*ax.z + c); }
      void main(){
        float sp = 3.0 + aB.x * 3.5;
        vec2 xz = aA.xz + uWind * uTime * sp + vec2(sin(uTime * 1.3 + aB.y * 30.0), cos(uTime * 1.1 + aB.z * 30.0)) * 0.8;
        xz = uCam.xz + mod(xz - uCam.xz + ${(LB / 2).toFixed(1)}, ${LB.toFixed(1)}) - ${(LB / 2).toFixed(1)};
        float y = terrainH(xz) + 0.6 + aA.y * 7.0 + sin(uTime * 2.0 + aA.w * 20.0) * 0.6;
        vec3 ax = normalize(vec3(aB.y - 0.5, aB.z - 0.5 + 0.3, aB.w - 0.5));
        mat3 R = rotA(ax, uTime * (2.0 + aB.x * 4.0) + aA.w * 10.0);
        vec3 lp = R * (position * vec3(0.16, 0.24, 1.0));
        vShade = 0.75 + 0.25 * abs((R * vec3(0.0, 0.0, 1.0)).y);
        float k = aB.w;
        vC = k < 0.45 ? vec3(0.42, 0.72, 0.2) : (k < 0.75 ? vec3(0.78, 0.82, 0.25) : (k < 0.9 ? vec3(0.95, 0.62, 0.2) : vec3(0.98, 0.85, 0.9)));
        vec4 mvPosition = viewMatrix * vec4(vec3(xz.x, y, xz.y) + lp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float d = length(xz - uCam.xz);
        gl_Position *= step(d, ${(LB * 0.48).toFixed(1)});
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vC; varying float vShade;
      void main(){ gl_FragColor = vec4(vC * vShade, 1.0);
        #include <fog_fragment>
      }`,
  });
  Object.assign(lmat.uniforms, { uTime, uCam, uHeightTex, uWind });
  const leaves = new THREE.Mesh(lgeo, lmat);
  leaves.frustumCulled = false;
  game.scene.add(leaves);

  // ---- birds
  const NB = 9;
  const bpos = new Float32Array(NB * 9 * 3);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bmat = new THREE.MeshBasicMaterial({ color: 0x3a4250, side: THREE.DoubleSide, fog: true });
  const birds = new THREE.Mesh(bgeo, bmat);
  birds.frustumCulled = false;
  game.scene.add(birds);
  const flock = [];
  const centers = [[-20, 40], [60, -40], [-90, -60], [20, -110]];
  for (let i = 0; i < NB; i++) {
    const c = centers[i % centers.length];
    flock.push({ cx: c[0] + rnd() * 10, cz: c[1] + rnd() * 10, r: 18 + rnd() * 26, h: 42 + rnd() * 28, sp: (0.12 + rnd() * 0.1) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.28, fl: 6 + rnd() * 3, s: 0.9 + rnd() * 0.6 });
  }
  const Vb = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function writeBird(i, t) {
    const b = flock[i];
    const a = b.ph + t * b.sp;
    const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r, y = b.h + Math.sin(t * 0.3 + b.ph) * 4;
    fwd.set(-Math.sin(a) * Math.sign(b.sp), 0, Math.cos(a) * Math.sign(b.sp));
    side.crossVectors(fwd, up);
    const cyc = Math.sin(t * 0.25 + b.ph * 3);
    const glide = cyc > 0.3;
    const flap = glide ? 0.15 : Math.sin(t * b.fl + b.ph) * 0.9;
    const s = b.s * 0.9;
    const o = i * 27;
    const put = (k, dx, dy, dz) => {
      Vb.set(x, y, z).addScaledVector(side, dx * s).addScaledVector(fwd, dz * s); Vb.y += dy * s;
      bpos[o + k * 3] = Vb.x; bpos[o + k * 3 + 1] = Vb.y; bpos[o + k * 3 + 2] = Vb.z;
    };
    // left wing, right wing, tail
    put(0, 0, 0, 0.35); put(1, -1.1, flap * 0.9, -0.1); put(2, 0, 0, -0.25);
    put(3, 0, 0, 0.35); put(4, 1.1, flap * 0.9, -0.1); put(5, 0, 0, -0.25);
    put(6, 0, 0, -0.1); put(7, -0.18, 0, -0.65); put(8, 0.18, 0, -0.65);
  }

  return {
    motes, leaves, birds,
    update(t, cam) {
      uTime.value = t;
      uCam.value.copy(cam.position);
      uScale.value = game.renderer.domElement.height / 720;
      for (let i = 0; i < NB; i++) writeBird(i, t);
      bgeo.attributes.position.needsUpdate = true;
    },
  };
}
