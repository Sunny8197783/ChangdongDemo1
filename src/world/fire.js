// Campfire effects: billboard flames, embers, smoke, ground glow, flickering lights. Self-contained (no vfx dependency).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export function buildFires(game, positions) {
  const group = new THREE.Group(); group.name = 'fires';
  game.scene.add(group);
  const uTime = { value: 0 };
  const rnd = mulberry32(77);

  // ---- flames (instanced billboards)
  const FL = 4;
  const fgeo = new THREE.InstancedBufferGeometry();
  fgeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  fgeo.setIndex([0, 1, 2, 0, 2, 3]);
  const fdata = new Float32Array(positions.length * FL * 4);
  const fsize = new Float32Array(positions.length * FL * 2);
  positions.forEach((p, i) => {
    for (let k = 0; k < FL; k++) {
      const j = i * FL + k;
      const a = k * 2.1, d = k === 0 ? 0 : 0.32;
      fdata[j * 4] = p.x + Math.cos(a) * d; fdata[j * 4 + 1] = p.y + 0.15; fdata[j * 4 + 2] = p.z + Math.sin(a) * d; fdata[j * 4 + 3] = rnd() * 100;
      fsize[j * 2] = k === 0 ? 1.1 : 0.7 + rnd() * 0.2; fsize[j * 2 + 1] = k === 0 ? 3.2 : 2.0 + rnd() * 0.6;
    }
  });
  fgeo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(fdata, 4));
  fgeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(fsize, 2));
  fgeo.instanceCount = positions.length * FL;
  const fmat = new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute vec4 aCenter; attribute vec2 aSize; uniform float uTime;
      varying vec2 vUv; varying float vSeed;
      void main(){
        vUv = position.xy; vSeed = aCenter.w;
        float fl = 1.0 + 0.12 * sin(uTime * 13.0 + aCenter.w) + 0.08 * sin(uTime * 23.0 + aCenter.w * 2.0);
        vec4 mv = modelViewMatrix * vec4(aCenter.xyz, 1.0);
        mv.xy += vec2(position.x * aSize.x, position.y * aSize.y * fl);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying float vSeed;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      void main(){
        vec2 uv = vUv;
        float n = noise(vec2(uv.x * 3.0 + vSeed, uv.y * 4.0 - uTime * 3.2)) * 0.6 + noise(vec2(uv.x * 7.0, uv.y * 8.0 - uTime * 5.0 + vSeed)) * 0.4;
        uv.x += (n - 0.5) * 0.45 * uv.y;
        float w = (1.0 - uv.y) * (0.55 + 0.45 * sqrt(max(uv.y, 0.0)) * 2.0) * 0.8;
        float shape = 1.0 - smoothstep(w * 0.55, w, abs(uv.x));
        shape *= smoothstep(1.0, 0.55, uv.y + n * 0.35) * smoothstep(0.0, 0.08, uv.y);
        float core = 1.0 - smoothstep(0.0, w * 0.6, abs(uv.x)); core *= smoothstep(0.75, 0.1, uv.y + n * 0.2);
        // stylized saturated flame: dark-red base -> orange body -> warm yellow core (kept below the bloom threshold)
        vec3 c = mix(vec3(0.62, 0.08, 0.02), vec3(1.0, 0.42, 0.06), smoothstep(0.0, 0.7, shape));
        c = mix(c, vec3(1.0, 0.78, 0.38), core * 0.9);
        gl_FragColor = vec4(c * 0.92, clamp(shape * 1.25, 0.0, 0.95));
      }`,
  });
  const flames = new THREE.Mesh(fgeo, fmat);
  flames.frustumCulled = false; flames.renderOrder = 5;
  group.add(flames);

  // ---- embers + smoke (points, GPU-animated)
  function particleSystem(perFire, frag, opts) {
    const n = positions.length * perFire;
    const a = new Float32Array(n * 3), b = new Float32Array(n * 4), ph = new Float32Array(n);
    positions.forEach((p, i) => {
      for (let k = 0; k < perFire; k++) {
        const j = i * perFire + k;
        a[j * 3] = p.x; a[j * 3 + 1] = p.y; a[j * 3 + 2] = p.z; ph[j] = rnd();
        b[j * 4] = rnd() * 6.28; b[j * 4 + 1] = opts.speed[0] + rnd() * (opts.speed[1] - opts.speed[0]); b[j * 4 + 2] = rnd(); b[j * 4 + 3] = rnd();
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aB', new THREE.BufferAttribute(b, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime, uScale: { value: 1 } },
      transparent: true, depthWrite: false, blending: opts.blending,
      vertexShader: /* glsl */`
        attribute vec4 aB; attribute float aPhase; uniform float uTime; uniform float uScale;
        varying float vLife; varying float vSeed;
        void main(){
          float life = fract(uTime * aB.y * ${opts.rate.toFixed(3)} + aPhase);
          vLife = life; vSeed = aB.z;
          float ang = aB.x + life * ${opts.swirl.toFixed(2)};
          float rad = ${opts.spread.toFixed(2)} * (0.2 + life) * (0.4 + aB.w);
          vec3 p = position.xyz + vec3(cos(ang) * rad + life * life * ${opts.drift.toFixed(2)}, 0.3 + life * ${opts.rise.toFixed(2)} * (0.7 + aB.z * 0.6), sin(ang) * rad - life * life * ${(opts.drift * 0.6).toFixed(2)});
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = ${opts.size.toFixed(1)} * uScale * (${opts.grow ? '0.4 + life * 1.6' : '1.0 - life * 0.7'}) / -mv.z;
        }`,
      fragmentShader: frag,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    group.add(pts);
    return pts;
  }
  const embers = particleSystem(40, /* glsl */`
    varying float vLife; varying float vSeed;
    void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
      vec3 c = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.3, 0.05), vLife);
      float tw = 0.6 + 0.4 * sin(vLife * 40.0 + vSeed * 30.0);
      gl_FragColor = vec4(c * 2.2 * tw, a * (1.0 - vLife)); }`,
  { speed: [0.5, 1.0], rate: 0.6, swirl: 5.0, spread: 0.6, rise: 5.5, drift: 1.2, size: 70, blending: THREE.AdditiveBlending });
  const smoke = particleSystem(18, /* glsl */`
    varying float vLife; varying float vSeed;
    void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(d));
      a *= smoothstep(0.0, 0.15, vLife) * (1.0 - vLife) * 0.32;
      gl_FragColor = vec4(mix(vec3(0.42, 0.4, 0.38), vec3(0.85, 0.86, 0.88), vLife), a); }`,
  { speed: [0.25, 0.4], rate: 0.5, swirl: 1.5, spread: 0.5, rise: 9.0, drift: 3.0, size: 900, blending: THREE.NormalBlending, grow: true });
  smoke.renderOrder = 4;

  // ---- ground glow
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const g2 = gc.getContext('2d');
  const grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,150,60,0.7)'); grd.addColorStop(0.35, 'rgba(255,110,40,0.3)'); grd.addColorStop(1, 'rgba(255,90,20,0)');
  g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -4 });
  const glows = positions.map((p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), glowMat);
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.06, p.z);
    group.add(m); return m;
  });

  // ---- light: ONE shared camp-fire light (constant light count = no recompiles), parked at the camp
  // nearest the camera within 45 m; intensity 0 otherwise.
  // v4 (PLAN §7.2 rule 4): the light exists only when core decided point lights at boot (high); never added later.
  const light = game.render?.pointLights === true ? new THREE.PointLight(0xff8a3c, 0, 22, 1.6) : null;
  if (light) { light.position.set(0, -60, 0); group.add(light); }
  const lights = light ? [light] : [];
  let near = -1;

  return {
    group, lights,
    update(t) {
      uTime.value = t;
      embers.material.uniforms.uScale.value = smoke.material.uniforms.uScale.value = game.renderer.domElement.height / 720;
      const cam = game.camera.position;
      let best = 45 * 45; near = -1;
      for (let i = 0; i < positions.length; i++) {
        const dx = positions[i].x - cam.x, dz = positions[i].z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; near = i; }
      }
      const i = near < 0 ? 0 : near;
      const f = 0.82 + 0.1 * Math.sin(t * 11 + i * 3) + 0.08 * Math.sin(t * 17.3 + i) + 0.05 * Math.sin(t * 29 + i * 7);
      glowMat.opacity = 0.3 * f;
      if (!light) return;
      if (near >= 0) { const p = positions[near]; light.position.set(p.x, p.y + 1.4, p.z); light.intensity = 12 * f; }
      else light.intensity = 0;
    },
  };
}
