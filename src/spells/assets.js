// Shared geometries, materials and shaders for spells + combat status visuals.
import * as THREE from 'three';
import { toonMat, addOutline } from '../core/utils.js';

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

/** Global time uniform shared by all spell shaders (updated by spells.update). */
export const uTime = { value: 0 };

/** Additive fresnel glow shell. */
export function fresnelMat(color, { power = 2.2, intensity = 1.4, core = 0.1, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) }, power: { value: power },
      intensity: { value: intensity }, core: { value: core }, opacity: { value: opacity }, time: uTime,
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float power, intensity, core, opacity;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        float a = clamp(f + core, 0.0, 1.0) * opacity;
        gl_FragColor = vec4(color * intensity * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

/** Bright glowing core (white center fading to color at edges). */
export function coreMat(color, intensity = 2.2) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, time: uTime },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float intensity, time;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float d = abs(dot(normalize(vN), normalize(vV)));
        float n = 0.85 + 0.15 * sin(vP.x*9.0 + time*14.0) * sin(vP.y*7.0 - time*11.0);
        vec3 c = mix(color, vec3(1.0), smoothstep(0.55, 1.0, d)) * intensity * n;
        gl_FragColor = vec4(c, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

/** Flame tongue material for lathe-shaped flames (uv.y = 0 base -> 1 tip). */
export function flameMat() {
  return once('flameMat', () => new THREE.ShaderMaterial({
    uniforms: { time: uTime },
    vertexShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vPhase;
      void main(){
        vUv = uv;
        vec3 p = position;
        #ifdef USE_INSTANCING
          vec4 wp0 = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          vPhase = wp0.x * 3.1 + wp0.z * 1.7;
        #else
          vPhase = 0.0;
        #endif
        float w = uv.y * uv.y;
        p.x += sin(time * 9.0 + uv.y * 5.0 + vPhase) * 0.18 * w;
        p.z += cos(time * 7.0 + uv.y * 4.0 + vPhase) * 0.14 * w;
        vec4 lp = vec4(p,1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * lp;
      }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vPhase;
      void main(){
        float y = vUv.y;
        vec3 c = mix(vec3(1.0,0.95,0.6), vec3(1.0,0.45,0.08), smoothstep(0.05,0.55,y));
        c = mix(c, vec3(0.9,0.12,0.03), smoothstep(0.55,1.0,y));
        float flick = 0.8 + 0.2*sin(time*23.0 + vPhase*3.0 + y*8.0);
        float a = (1.0 - smoothstep(0.6, 1.0, y)) * flick;
        gl_FragColor = vec4(c * 1.25 * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
}

export function flameGeo() {
  return once('flameGeo', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const r = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t) * 0.5 + 0.02 * (1 - t);
      pts.push(new THREE.Vector2(r, t * 1.6));
    }
    return new THREE.LatheGeometry(pts, 8);
  });
}

/** Ice crystal: elongated octahedron. */
export function crystalGeo() {
  return once('crystalGeo', () => {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.55, 1.6, 0.55);
    g.translate(0, 0.8, 0);
    return g;
  });
}
export function iceMat() {
  return once('iceMat', () => toonMat(0xaef0ff, { emissive: 0x2a8fbf, emissiveIntensity: 0.55, transparent: true, opacity: 0.78 }));
}
export function iceMatSolid() {
  return once('iceMatSolid', () => toonMat(0xb8f4ff, { emissive: 0x3aa8d8, emissiveIntensity: 0.45, flatShading: true }));
}

/** Rock pillar: tapered, jittered hexagonal prism, flat shaded. */
export function pillarGeo() {
  return once('pillarGeo', () => {
    const g = new THREE.CylinderGeometry(0.28, 0.62, 1, 6, 3);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = Math.sin(i * 12.9898) * 43758.5453; const r = k - Math.floor(k);
      p.setX(i, p.getX(i) * (0.85 + r * 0.3));
      p.setZ(i, p.getZ(i) * (0.85 + ((r * 7.3) % 1) * 0.3));
      if (y > 0.99) { p.setY(i, y + (r - 0.5) * 0.25); }
    }
    const top = g.toNonIndexed(); top.computeVertexNormals();
    return top;
  });
}
export function rockMat() {
  return once('rockMat', () => toonMat(0xb08a5e, { flatShading: true }));
}
export function rockGeo() {
  return once('rockGeo', () => {
    const g = new THREE.DodecahedronGeometry(0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = Math.abs(Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7)) * 0.25;
      p.setXYZ(i, p.getX(i) * (0.9 + k), p.getY(i) * (0.9 + k), p.getZ(i) * (0.9 + k));
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Star shape for stun indicators. */
export function starGeo() {
  return once('starGeo', () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.07 : 0.17;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    g.center();
    return g;
  });
}

/** Canvas texture: magic sigil circle (white, tinted by material color). */
export function sigilTexture() {
  return once('sigilTex', () => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'); x.translate(S / 2, S / 2);
    x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
    x.shadowColor = '#fff'; x.shadowBlur = 12;
    const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); };
    ring(240, 8); ring(222, 3); ring(150, 5); ring(92, 3);
    // runes between outer rings
    x.font = 'bold 26px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2; x.save(); x.rotate(a); x.translate(0, -186); x.fillText(runes[i % runes.length], 0, 0); x.restore();
    }
    // hexagram
    x.lineWidth = 4;
    for (let k = 0; k < 2; k++) {
      x.beginPath();
      for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2; const px = Math.cos(a) * 150, py = Math.sin(a) * 150; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; x.beginPath(); x.moveTo(Math.cos(a) * 92, Math.sin(a) * 92); x.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); x.lineWidth = 2; x.stroke(); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; x.beginPath(); x.arc(Math.cos(a) * 231, Math.sin(a) * 231, 9, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}

/** Additive textured material for ground sigils. */
export function sigilMat(color) {
  return new THREE.MeshBasicMaterial({
    map: sigilTexture(), color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 1, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
}

/** Crescent geometry for wind blades (flat in XZ, opening toward -Z... facing +Z). */
export function crescentGeo() {
  return once('crescentGeo', () => {
    const s = new THREE.Shape();
    const N = 24;
    for (let i = 0; i <= N; i++) { const a = -Math.PI * 0.42 + (i / N) * Math.PI * 0.84; const px = Math.sin(a) * 1.2, pz = Math.cos(a) * 1.2; i ? s.lineTo(px, pz) : s.moveTo(px, pz); }
    for (let i = N; i >= 0; i--) { const a = -Math.PI * 0.42 + (i / N) * Math.PI * 0.84; const px = Math.sin(a) * 0.95, pz = Math.cos(a) * 0.95 - 0.12; s.lineTo(px, pz); }
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(Math.PI / 2); // shape XY -> XZ (y->z); arc bulges toward +Z (Object3D.lookAt forward)
    g.translate(0, 0, -0.95);
    return g;
  });
}

/** Ground disc that conforms to terrain; animated surface shader. kind: fire|ice|lava|water|storm */
const groundFrag = {
  fire: /* glsl */`
    vec2 q = p * 1.3; float n = fbm(q + vec2(0.0, -time*1.6)) ;
    float n2 = fbm(q*2.3 + vec2(time*0.7, time*1.1));
    float heat = smoothstep(0.35, 0.85, n*0.7 + n2*0.5) ;
    vec3 col = mix(vec3(0.55,0.08,0.02), vec3(1.0,0.45,0.05), heat);
    col = mix(col, vec3(1.0,0.9,0.45), smoothstep(0.75,1.0,n2+heat*0.3));
    float a = edge * (0.45 + 0.55*heat);
    gl_FragColor = vec4(col * 1.6 * a * fade, a * fade);`,
  ice: /* glsl */`
    vec2 q = p * 1.1; float n = fbm(q*1.5);
    float cr = 1.0 - smoothstep(0.0, 0.06, abs(fract(n*5.0) - 0.5));
    vec3 col = mix(vec3(0.55,0.85,1.0), vec3(0.85,0.98,1.0), n);
    col += vec3(0.6,0.9,1.0) * cr * 0.8;
    float sp = pow(max(0.0, sin(p.x*13.0 + time*2.0) * sin(p.y*11.0 - time*1.7)), 24.0);
    col += sp * 1.5;
    float a = edge * 0.75;
    gl_FragColor = vec4(col * a * fade, a * fade);`,
  lava: /* glsl */`
    vec2 q = p * 0.9; float n = fbm(q + vec2(time*0.15, time*0.1));
    float cracks = 1.0 - smoothstep(0.0, 0.12, abs(fract(n*4.0 + time*0.2) - 0.5));
    vec3 crust = vec3(0.16,0.06,0.04);
    vec3 glow = mix(vec3(1.0,0.3,0.02), vec3(1.0,0.85,0.3), cracks);
    float g = max(cracks, smoothstep(0.6, 0.9, n));
    vec3 col = mix(crust, glow * 2.2, g);
    float a = edge;
    gl_FragColor = vec4(col * fade, a * fade);`,
  water: /* glsl */`
    float r = length(p);
    float rip = sin(r*7.0 - time*4.0)*0.5+0.5;
    float n = fbm(p*1.4 + time*0.3);
    vec3 col = mix(vec3(0.15,0.45,0.75), vec3(0.45,0.8,1.0), n*0.6 + rip*0.3);
    col += zap * vec3(0.8,0.6,1.0) * (0.6 + 0.4*sin(time*60.0 + p.x*9.0));
    float a = edge * 0.7;
    gl_FragColor = vec4(col * fade, a * fade);`,
};

export function groundMat(kind) {
  const frag = groundFrag[kind] || groundFrag.fire;
  const additive = kind === 'fire';
  return new THREE.ShaderMaterial({
    uniforms: { time: uTime, fade: { value: 1 }, radius: { value: 3 }, zap: { value: 0 }, seed: { value: Math.random() * 10 } },
    vertexShader: /* glsl */`
      varying vec2 vP; uniform float radius;
      void main(){ vP = position.xz / radius; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float time, fade, zap, seed, radius; varying vec2 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec2 p = vP * radius * 0.5 + seed;
        float d = length(vP);
        float wob = fbm(vP*3.0 + seed) * 0.18;
        float edge = 1.0 - smoothstep(0.72 - wob, 1.0 - wob, d);
        if (edge <= 0.001) discard;
        ${frag}
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/** Grid disc geometry with fixed vertex count; conform(world, x, z, radius) re-heights it in place. */
export function makeGroundDisc(segs = 18) {
  const g = new THREE.PlaneGeometry(2, 2, segs, segs);
  g.rotateX(-Math.PI / 2);
  g.userData.base = Float32Array.from(g.attributes.position.array);
  return g;
}
export function conformDisc(g, world, cx, cz, radius, lift = 0.08) {
  const base = g.userData.base, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3] * radius, z = base[i * 3 + 2] * radius;
    let h = 0;
    try { h = world?.getHeight ? world.getHeight(cx + x, cz + z) : 0; } catch (_) { h = 0; }
    p.setXYZ(i, x, h + lift, z);
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
}

/** Tornado funnel material: scrolling streaks, colored. */
export function tornadoMat() {
  return new THREE.ShaderMaterial({
    uniforms: { time: uTime, colA: { value: new THREE.Color(0xeafff6) }, colB: { value: new THREE.Color(0x5fa890) }, opacity: { value: 1 }, speed: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec3 p = position;
        float sway = sin(time*2.3 + uv.y*4.0) * 0.35 * uv.y;
        p.x += sway; p.z += cos(time*1.9 + uv.y*3.0) * 0.3 * uv.y;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float time, opacity, speed; uniform vec3 colA, colB; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float s = sin((vUv.x*6.2831*3.0) + vUv.y*9.0 - time*9.0*speed);
        float s2 = sin((vUv.x*6.2831*5.0) - vUv.y*14.0 - time*13.0*speed);
        float streak = smoothstep(0.35, 1.0, s*0.6 + s2*0.5);
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float vfade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
        vec3 c = mix(colB, colA, streak);
        float a = clamp((0.45 + streak*0.55) * (0.55 + rim*0.7) * vfade * opacity, 0.0, 0.92);
        gl_FragColor = vec4(c * (1.0 + streak*0.6), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
export function tornadoGeo() {
  return once('tornadoGeo', () => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(0.35 + Math.pow(t, 1.6) * 3.6, t * 11)); }
    return new THREE.LatheGeometry(pts, 28);
  });
}

/** Rain streak material for instanced drops (vertex-animated). */
export function rainMat() {
  return once('rainMat', () => new THREE.ShaderMaterial({
    uniforms: { time: uTime, top: { value: 14 }, opacity: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float time, top; varying float vA;
      void main(){
        vec4 o = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float ph = fract(sin(o.x*12.9898 + o.z*78.233)*43758.5453);
        float y = mod(top - (time*22.0 + ph*top), top);
        vec3 p = position + vec3(o.x, y, o.z);
        vA = smoothstep(0.0, 1.5, y) * (1.0 - smoothstep(top-2.0, top, y));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float opacity; varying float vA;
      void main(){ gl_FragColor = vec4(vec3(0.55,0.7,1.0) * vA * opacity, 0.55 * vA * opacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

/** Outline instanced companion: BackSide dark basic material. */
export function outlineBasic(color = 0x1a1410) {
  return once('outlineBasic' + color, () => new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
}

export { toonMat, addOutline };
