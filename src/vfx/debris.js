// Pooled toon-shaded debris chunks (rock / ice / crystal) as InstancedMeshes with bounce physics.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';

const CAP = 160;

const OUTLINE_VERT = /* glsl */`
  uniform float thickness;
  void main() {
    vec3 p = position + normalize(normal) * thickness;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const OUTLINE_FRAG = /* glsl */`uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`;

function rockGeo() {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898 + p.getX(i) * 78.233));
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}
function shardGeo() {
  const g = new THREE.OctahedronGeometry(0.5, 0);
  g.scale(0.45, 1.3, 0.45);
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _c = new THREE.Color();

class DebrisSet {
  constructor(scene, geometry, material, outlineColor) {
    this.mesh = new THREE.InstancedMesh(geometry, material, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.name = 'vfx-debris'; this.mesh.userData.owner = 'player';
    const om = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: 0.06 }, color: { value: new THREE.Color(outlineColor) } },
      vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.outline = new THREE.InstancedMesh(geometry, om, CAP);
    this.outline.instanceMatrix = this.mesh.instanceMatrix; // share matrices
    this.outline.count = 0; this.outline.frustumCulled = false; this.outline.name = 'vfx-debris-outline'; this.outline.userData.owner = 'player';
    scene.add(this.mesh); scene.add(this.outline);
    // state: pos(3) vel(3) axis(3) angle spin size life age
    this.S = new Float32Array(CAP * 14); this.n = 0; this.cursor = 0;
    this.colors = new Float32Array(CAP * 3);
  }
  spawn(x, y, z, vx, vy, vz, size, life, color) {
    let i;
    if (this.n < CAP) i = this.n++; else { i = this.cursor; this.cursor = (this.cursor + 1) % CAP; }
    const o = i * 14, S = this.S;
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = vx; S[o + 4] = vy; S[o + 5] = vz;
    _ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    S[o + 6] = _ax.x; S[o + 7] = _ax.y; S[o + 8] = _ax.z;
    S[o + 9] = Math.random() * 6; S[o + 10] = (4 + Math.random() * 10) * (Math.random() < 0.5 ? -1 : 1);
    S[o + 11] = size; S[o + 12] = life; S[o + 13] = 0;
    _c.setHex(color); _c.offsetHSL(0, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12);
    this.colors[i * 3] = _c.r; this.colors[i * 3 + 1] = _c.g; this.colors[i * 3 + 2] = _c.b;
  }
  update(dt, getHeight) {
    const S = this.S;
    let i = 0;
    while (i < this.n) {
      const o = i * 14;
      S[o + 13] += dt;
      if (S[o + 13] >= S[o + 12]) {
        const last = --this.n;
        if (i !== last) { S.copyWithin(o, last * 14, last * 14 + 14); this.colors.copyWithin(i * 3, last * 3, last * 3 + 3); }
        if (this.cursor >= this.n) this.cursor = 0;
        continue;
      }
      const size = S[o + 11];
      if (dt > 0) {
        S[o + 4] -= 18 * dt;
        S[o] += S[o + 3] * dt; S[o + 1] += S[o + 4] * dt; S[o + 2] += S[o + 5] * dt;
        const h = (getHeight ? getHeight(S[o], S[o + 2]) : 0) + size * 0.35;
        if (S[o + 1] < h) {
          S[o + 1] = h;
          if (S[o + 4] < 0) S[o + 4] = -S[o + 4] * 0.35;
          if (S[o + 4] < 0.6) S[o + 4] = 0;
          S[o + 3] *= 0.7; S[o + 5] *= 0.7; S[o + 10] *= 0.75;
        }
        S[o + 9] += S[o + 10] * dt;
      }
      const t = S[o + 13] / S[o + 12];
      const sc = size * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : Math.min(1, t * 12 + 0.3));
      _ax.set(S[o + 6], S[o + 7], S[o + 8]);
      _q.setFromAxisAngle(_ax, S[o + 9]);
      _p.set(S[o], S[o + 1], S[o + 2]); _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.instanceColor.setXYZ(i, this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]);
      i++;
    }
    this.mesh.count = this.outline.count = this.n;
    this.mesh.visible = this.outline.visible = this.n > 0;
    if (this.n) {
      const im = this.mesh.instanceMatrix, ic = this.mesh.instanceColor;
      im.clearUpdateRanges(); im.addUpdateRange(0, this.n * 16); im.needsUpdate = true;
      ic.clearUpdateRanges(); ic.addUpdateRange(0, this.n * 3); ic.needsUpdate = true;
    }
  }
}

export class Debris {
  constructor(game) {
    this.game = game;
    // neutral base × per-instance colour; v4 R10: player FX never write depth (transparent pass, alpha 1 for solid rocks)
    const rock = toonMat(0xf4f1ea, { flatShading: true });
    const ice = toonMat(0xf4f1ea, { flatShading: true, emissive: 0x12325e, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
    const crystal = toonMat(0xf4f1ea, { flatShading: true, emissive: 0x241052, emissiveIntensity: 0.8 });
    for (const m of [rock, ice, crystal]) { m.transparent = true; m.depthWrite = false; }
    this.sets = {
      rock: new DebrisSet(game.scene, rockGeo(), rock, 0x2a1d12),
      ice: new DebrisSet(game.scene, shardGeo(), ice, 0x1d4a66),
      crystal: new DebrisSet(game.scene, shardGeo(), crystal, 0x2b1a4a),
    };
    this.defaults = { rock: 0x8a6e4e, ice: 0x8fdcf5, crystal: 0xb49bff };
  }

  debris(pos, opts = {}) {
    const kind = this.sets[opts.material] ? opts.material : 'rock';
    const set = this.sets[kind];
    const count = Math.min(60, opts.count ?? 8), size = opts.size ?? 0.35, speed = opts.speed ?? 7, life = opts.life ?? 2.2;
    const color = opts.color ?? this.defaults[kind];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, up = 0.45 + Math.random() * 0.55;
      const sp = speed * (0.5 + Math.random() * 0.7), hz = Math.sqrt(1 - up * up);
      set.spawn(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.1 + Math.random() * 0.3, pos.z + (Math.random() - 0.5) * 0.4,
        Math.cos(a) * hz * sp, up * sp, Math.sin(a) * hz * sp,
        size * (0.5 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6), color);
    }
  }

  update(dt) {
    const gh = this.game.world?.getHeight;
    for (const k in this.sets) this.sets[k].update(dt, gh);
  }

  count() { let n = 0; for (const k in this.sets) n += this.sets[k].n; return n; }
  calls() { let n = 0; for (const k in this.sets) if (this.sets[k].n) n += 2; return n; }
}
