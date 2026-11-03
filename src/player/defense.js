// Defense visuals: mage 마력 방벽 (hex-pattern arcane dome with hit ripples) and the sword guard glint.
import * as THREE from 'three';

const VS = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FS = /* glsl */`
  uniform vec3 uColor; uniform float uW, uTime, uFlash, uHitT; uniform vec3 uHitDir;
  varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  // hex grid distance (0 at cell edge, ~0.5 at center)
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
  }
  float hexEdge(vec2 uv) {
    vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
    vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    return 0.5 - hexDist(g);
  }
  void main() {
    vec3 n = normalize(vLocal);
    float lon = atan(n.x, n.z), lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 uv = vec2(lon * 3.2, lat * 3.6);
    float e = hexEdge(uv * 1.6);
    float line = smoothstep(0.06, 0.0, e);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    // ripple from the last hit direction
    float d = acos(clamp(dot(n, normalize(uHitDir)), -1.0, 1.0));
    float ring = uHitT > 0.0 ? smoothstep(0.25, 0.0, abs(d - (1.0 - uHitT) * 2.4)) * uHitT : 0.0;
    float scan = 0.5 + 0.5 * sin(lat * 10.0 - uTime * 4.0);
    float bottom = smoothstep(-0.35, 0.05, n.y);
    float a = (line * (0.35 + 0.4 * scan) + fres * 0.75 + ring * 1.4 + uFlash * 0.8) * uW * bottom;
    vec3 col = mix(uColor, vec3(1.0), line * 0.25 + ring * 0.5 + uFlash * 0.6);
    gl_FragColor = vec4(col * a, 1.0);
  }`;

export class Barrier {
  constructor(scene) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x9fdcff) }, uW: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uHitT: { value: 0 }, uHitDir: { value: new THREE.Vector3(0, 0, 1) } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 32, 20), this.mat);
    this.mesh.visible = false; this.mesh.renderOrder = 8; this.mesh.frustumCulled = false;
    this.mesh.userData.noGhost = true;
    scene.add(this.mesh);
    this.w = 0; this.flash = 0; this.hitT = 0;
  }
  setColor(c) { this.mat.uniforms.uColor.value.copy(c).lerp(new THREE.Color(0xbfe8ff), 0.45); }
  hit(dirWorld, perfect) { this.mat.uniforms.uHitDir.value.copy(dirWorld); this.hitT = 1; if (perfect) this.flash = 1; }
  update(dt, active, center, t) {
    this.w += ((active ? 1 : 0) - this.w) * (1 - Math.exp(-(active ? 18 : 9) * dt));
    this.flash = Math.max(0, this.flash - dt * 4);
    this.hitT = Math.max(0, this.hitT - dt * 2.5);
    const vis = this.w > 0.01;
    this.mesh.visible = vis;
    if (!vis) return;
    this.mesh.position.set(center.x, center.y + 0.95, center.z);
    const pop = active ? 1 + this.flash * 0.15 : 1 + (1 - this.w) * 0.25;
    this.mesh.scale.set(pop, pop * 0.92, pop);
    const u = this.mat.uniforms;
    u.uW.value = this.w; u.uTime.value = t; u.uFlash.value = this.flash; u.uHitT.value = this.hitT;
  }
}
