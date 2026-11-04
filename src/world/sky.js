// Painterly sky dome: gradient, sun disk + glow, stylized drifting cumulus clouds.
import * as THREE from 'three';

export const SKY = {
  top: new THREE.Color(0x2f7fd8),
  mid: new THREE.Color(0x7cc0f0),
  horizon: new THREE.Color(0xd6eefa),
  sunColor: new THREE.Color(0xfff2d2),
};

export function buildSky(game, sunDir) {
  const uniforms = {
    uTop: { value: SKY.top }, uMid: { value: SKY.mid }, uHorizon: { value: SKY.horizon },
    uSunDir: { value: sunDir }, uSunColor: { value: SKY.sunColor },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // at far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunColor; uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      float clouds(vec2 uv){
        vec2 w = vec2(fbm(uv*0.6 + uTime*0.01), fbm(uv*0.6 + 5.2 - uTime*0.008));
        float n = fbm(uv + w*1.1);
        float big = fbm(uv*0.35 + 3.0);
        return n * 0.75 + big * 0.45;
      }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        // gradient
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uTop, smoothstep(0.18, 0.85, h));
        col = mix(col, uHorizon * 0.96, smoothstep(0.0, -0.25, h));
        // sun
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.35);
        col = mix(col, uHorizon * 1.05, pow(s, 3.0) * 0.25 * (1.0 - smoothstep(0.0, 0.5, h)));
        // clouds on a virtual plane
        if (h > 0.005) {
          vec2 uv = d.xz / (h + 0.09) * 1.3 + vec2(uTime * 0.012, uTime * 0.004);
          float c = clouds(uv);
          float cov = smoothstep(0.6, 0.66, c);
          float edge = smoothstep(0.6, 0.78, c);
          // self-shadow: sample toward sun
          float cs = clouds(uv + uSunDir.xz * 0.12);
          float lit = clamp(0.62 + (c - cs) * 3.5, 0.0, 1.0);
          vec3 shade = mix(vec3(0.66, 0.74, 0.88), vec3(1.0, 0.99, 0.97), lit);
          shade = mix(shade, vec3(1.08, 1.04, 0.96), (1.0 - edge) * 0.6 * (0.4 + 0.6*pow(s, 4.0)));
          float fade = smoothstep(0.02, 0.2, h);
          col = mix(col, shade * mix(vec3(1.0), uHorizon, 1.0 - fade), cov * mix(0.0, 0.95, fade));
        }
        // sun disk on top of clouds (softly occluded)
        float disk = smoothstep(0.9988, 0.99935, s);
        col += uSunColor * disk * 3.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;   // v4: drawn LAST among opaques (depthTest, no depth write): only the visible sky pixels are shaded
  game.scene.add(mesh);
  return {
    mesh, uniforms,
    update(cam, t) { mesh.position.copy(cam.position); uniforms.uTime.value = t; },
  };
}
