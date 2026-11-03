// Procedural BotW-cute NPC models. Each NPC = 2 merged vertex-coloured toon meshes (body, head) sharing ONE material,
// optional merged glow mesh (gems / orbs, bloom) — ≈4–5 draw calls per NPC incl. outlines (outlines culled by distance).
// Model space: feet at y=0, facing +Z. Head pivot sits at the neck so look-at rotates the whole head (hair, hat).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat, addOutline } from '../core/utils.js';

const GEO = {
  sph: new THREE.SphereGeometry(1, 14, 10),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  // hair cap: upper ~60% of a sphere (open shell)
  cap: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
  capLow: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.68),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 16),
};
for (const g of Object.values(GEO)) { g.deleteAttribute('uv'); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Collects transformed, vertex-coloured primitive copies and merges them into one geometry. */
class Builder {
  constructor() { this.parts = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return this.addM(geo, color, _m);
  }
  addM(geo, color, m) {
    const g = geo.clone(); g.applyMatrix4(m);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    _c.setHex(color);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g); return g;
  }
  /** Cylinder limb between two points. */
  limb(p0, p1, r0, color, r1 = r0, geo = GEO.cyl) {
    _a.set(p0[0], p0[1], p0[2]); _b.set(p1[0], p1[1], p1[2]);
    _d.subVectors(_b, _a); const len = _d.length();
    _q.setFromUnitVectors(_up, _d.normalize());
    _p.addVectors(_a, _b).multiplyScalar(0.5);
    const g = geo === GEO.cyl ? new THREE.CylinderGeometry(r1, r0, 1, 10) : geo.clone();
    g.deleteAttribute('uv');
    _m.compose(_p, _q, _s.set(1, len, 1));
    this.addM(g, color, _m); g.dispose();
  }
  /** Sphere joint (elbow/knee/hand). */
  ball(p, r, color) { this.add(GEO.sphLo, color, p[0], p[1], p[2], 0, 0, 0, r); }
  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

let sharedMat = null, glowMat = null;
function mats() {
  if (!sharedMat) {
    sharedMat = toonMat(0xffffff, { vertexColors: true });
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false, fog: true });
  }
  return { sharedMat, glowMat };
}

// ------------------------------------------------------------------------------------------- generic humanoid
// o: { headR, neckY, skin, eye, torso, torsoTop, torsoBot, torsoY0, torsoY1, legs, legR, shoes, robe:{color, len, flare},
//      sleeve, armPose, shoulderW, armR, belt, collar, cheeks }
const ARM_POSES = {
  down: (s) => [[s * 0.36, 0.98, 0.02], [s * 0.37, 0.74, 0.05]],
  hips: (s) => [[s * 0.44, 0.95, -0.04], [s * 0.25, 0.83, 0.07]],
  crossed: (s) => [[s * 0.33, 0.96, 0.17], [-s * 0.12, 1.07, 0.22]],
  front: (s) => [[s * 0.3, 0.93, 0.12], [s * 0.07, 0.86, 0.24]],
  staffR: (s) => (s > 0 ? [[0.38, 0.95, 0.12], [0.34, 0.98, 0.3]] : [[-0.36, 0.95, 0.06], [-0.3, 0.86, 0.16]]),
  behind: (s) => [[s * 0.34, 0.95, -0.1], [s * 0.12, 0.82, -0.2]],
  rodR: (s) => (s > 0 ? [[0.36, 1.0, 0.16], [0.28, 1.02, 0.36]] : [[-0.3, 0.98, 0.14], [0.05, 1.0, 0.34]]),
  wave: (s) => (s > 0 ? [[0.46, 1.32, 0.0], [0.5, 1.6, 0.05]] : [[-0.36, 0.98, 0.02], [-0.37, 0.74, 0.05]]),
};

let lastNeck = 1.28;
function humanoid(B, o) {
  const skin = o.skin ?? 0xf3c9a2;
  const t0 = o.torsoY0 ?? 0.68, t1 = o.torsoY1 ?? 1.2;
  const tb = o.torsoBot ?? 0.21, tt = o.torsoTop ?? 0.2;
  // legs + shoes
  if (!o.robe || o.robe.len < 0.8) {
    const lr = o.legR ?? 0.085;
    for (const s of [-1, 1]) {
      B.limb([s * 0.1, 0.06, 0], [s * 0.11, t0 + 0.04, 0], lr, o.legs ?? 0x5a4a3c, lr * 1.15);
      B.add(GEO.sph, o.shoes ?? 0x4a3526, s * 0.1, 0.055, 0.045, 0, 0, 0, 0.095, 0.07, 0.14);
    }
  } else {
    for (const s of [-1, 1]) B.add(GEO.sph, o.shoes ?? 0x4a3526, s * 0.1, 0.05, 0.09, 0, 0, 0, 0.09, 0.065, 0.13);
  }
  // robe / skirt (cone from the waist)
  if (o.robe) {
    const len = o.robe.len, fl = o.robe.flare ?? 0.36;
    const g = new THREE.CylinderGeometry(tb * 1.02, fl, len, 14, 1, false); g.deleteAttribute('uv');
    _m.compose(_p.set(0, t0 + 0.1 - len / 2, 0), _q.identity(), _s.set(1, 1, o.robe.depth ?? 0.9));
    B.addM(g, o.robe.color, _m); g.dispose();
    if (o.robe.hem) { // hem band
      const h = new THREE.CylinderGeometry(fl * 1.01, fl * 1.03, 0.06, 14, 1, true); h.deleteAttribute('uv');
      _m.compose(_p.set(0, t0 + 0.1 - len + 0.03, 0), _q.identity(), _s.set(1, 1, o.robe.depth ?? 0.9));
      B.addM(h, o.robe.hem, _m); h.dispose();
    }
  }
  // torso (tapered cylinder) + rounded shoulders
  {
    const g = new THREE.CylinderGeometry(tt, tb, t1 - t0, 12); g.deleteAttribute('uv');
    _m.compose(_p.set(0, (t0 + t1) / 2, 0), _q.identity(), _s.set(1, 1, o.torsoDepth ?? 0.78));
    B.addM(g, o.torso, _m); g.dispose();
    B.add(GEO.sph, o.torso, 0, t1 - 0.02, 0, 0, 0, 0, tt * 1.02, 0.09, tt * 0.8);
    B.add(GEO.sph, o.torso, 0, t0 + 0.02, 0, 0, 0, 0, tb, 0.07, tb * (o.torsoDepth ?? 0.78));
  }
  if (o.belt) B.add(GEO.cyl, o.belt, 0, t0 + 0.08, 0, 0, 0, 0, tb * 1.04, 0.06, tb * 0.84);
  if (o.collar) B.add(GEO.cyl, o.collar, 0, t1 + 0.02, 0, 0, 0, 0, tt * 0.75, 0.06, tt * 0.65);
  // neck
  B.add(GEO.cyl, skin, 0, t1 + 0.06, 0, 0, 0, 0, 0.06, 0.1, 0.06);
  // arms
  const sw = o.shoulderW ?? 0.27, ar = o.armR ?? 0.062;
  const pose = ARM_POSES[o.armPose || 'down'];
  for (const s of [-1, 1]) {
    const sh = [s * sw, t1 - 0.05, 0];
    const [el, ha] = pose(s);
    el[1] += t1 - 1.2; ha[1] += t1 - 1.2;
    B.ball(sh, ar * 1.25, o.sleeve ?? o.torso);
    B.limb(sh, el, ar * 1.12, o.sleeve ?? o.torso, ar * 1.2);
    B.ball(el, ar * 1.05, o.sleeve ?? o.torso);
    B.limb(el, ha, ar * 0.85, o.forearm ?? o.sleeve ?? o.torso, ar);
    B.ball(ha, ar * 1.05, o.gloves ?? skin);
  }
  lastNeck = t1 + 0.08;
  return { hands: [-1, 1].map((s) => { const p = pose(s)[1]; return [p[0], p[1] + t1 - 1.2, p[2]]; }), neckY: t1 + 0.1 };
}

/** Head in head-pivot space (pivot = neck). Returns head center & radius. */
function head(H, o) {
  const R = o.headR ?? 0.24, skin = o.skin ?? 0xf3c9a2;
  const cy = R * 0.92;
  H.add(GEO.sph, skin, 0, cy, 0, 0, 0, 0, R, R * 0.97, R * 0.96);
  // eyes: big glossy ovals + highlight
  const ex = R * 0.36, ey = cy + R * (o.eyeY ?? 0.02), ez = R * 0.87;
  for (const s of [-1, 1]) {
    if (o.closedEyes) H.add(GEO.cyl6, 0x2a1d17, s * ex, ey, ez + 0.005, Math.PI / 2, 0, 0.12 * s, R * 0.14, 0.01, R * 0.03);
    else {
      H.add(GEO.sphLo, o.eye ?? 0x2b1d18, s * ex, ey, ez, 0, 0, 0, R * 0.12, R * 0.17, R * 0.07);
      H.add(GEO.sphLo, 0xffffff, s * ex + R * 0.04, ey + R * 0.06, ez + R * 0.05, 0, 0, 0, R * 0.04);
    }
    if (o.brows) H.add(GEO.box, o.brows, s * ex, ey + R * 0.26, ez - R * 0.04, 0, 0, s * (o.browTilt ?? -0.2), R * 0.26, R * 0.06, R * 0.06);
    if (o.cheeks !== false) H.add(GEO.sphLo, 0xf09a8a, s * R * 0.58, cy - R * 0.24, R * 0.74, 0, 0, 0, R * 0.13, R * 0.08, R * 0.05);
    // ears
    H.add(GEO.sphLo, skin, s * R * 0.96, cy - R * 0.02, -R * 0.02, 0, 0, 0, R * 0.12, R * 0.2, R * 0.12);
  }
  H.add(GEO.sphLo, o.nose ?? 0xe8b08a, 0, cy - R * 0.14, R * 0.97, 0, 0, 0, R * 0.09, R * 0.08, R * 0.08);
  if (o.mouth) H.add(GEO.box, 0x8a3b30, 0, cy - R * 0.38, R * 0.86, 0.2, 0, 0, R * 0.2, R * 0.04, R * 0.04);
  return { R, cy };
}

function hair(H, R, cy, style, color) {
  if (!style) return;
  if (style === 'short' || style === 'bun' || style === 'long' || style === 'spiky' || style === 'pony' || style === 'swept') {
    H.add(GEO.cap, color, 0, cy + R * 0.04, -R * 0.06, -0.38, 0, 0, R * 1.08);
    H.add(GEO.sph, color, 0, cy + R * 0.05, -R * 0.32, 0, 0, 0, R * 0.98, R * 0.92, R * 0.78); // back of the head
    for (const s of [-1, 1]) H.add(GEO.sph, color, s * R * 0.82, cy + R * 0.12, R * 0.1, 0, 0, s * 0.3, R * 0.25, R * 0.55, R * 0.4); // sideburns
    // fringe
    H.add(GEO.sph, color, -R * 0.3, cy + R * 0.68, R * 0.6, 0.5, 0, 0.5, R * 0.42, R * 0.2, R * 0.28);
    H.add(GEO.sph, color, R * 0.28, cy + R * 0.72, R * 0.56, 0.5, 0, -0.4, R * 0.4, R * 0.18, R * 0.26);
  }
  if (style === 'bun') H.add(GEO.sph, color, 0, cy + R * 0.85, -R * 0.55, 0, 0, 0, R * 0.42);
  if (style === 'long') H.add(GEO.sph, color, 0, cy - R * 0.55, -R * 0.62, 0.15, 0, 0, R * 0.95, R * 1.35, R * 0.45);
  if (style === 'pony') {
    H.add(GEO.sph, color, 0, cy + R * 0.3, -R * 1.0, 0.6, 0, 0, R * 0.3, R * 0.75, R * 0.3);
    H.add(GEO.sph, 0xd84a5a, 0, cy + R * 0.55, -R * 0.88, 0, 0, 0, R * 0.14);
  }
  if (style === 'spiky') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      H.add(GEO.cone, color, Math.sin(a) * R * 0.45, cy + R * 0.95, Math.cos(a) * R * 0.45 - R * 0.1, Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7, R * 0.2, R * 0.5, R * 0.2);
    }
  }
  if (style === 'swept') H.add(GEO.sph, color, 0, cy + R * 0.85, R * 0.05, -0.4, 0, 0, R * 0.7, R * 0.3, R * 0.85);
  if (style === 'bald') { // white fringe around the back
    H.add(GEO.capLow, color, 0, cy - R * 0.05, -R * 0.12, -1.9, 0, 0, R * 1.06, R * 0.9, R * 1.0);
  }
}

// ------------------------------------------------------------------------------------------- characters
const SKIN = { light: 0xf6d2b0, warm: 0xeebc94, tan: 0xd59a6e, deep: 0xa86e4c };

const CHARS = {
  // 촌장 노아 — small hunched elder: long white beard, green-brown robe, gnarled staff with a glowing leaf gem
  elder(B, H, G) {
    const o = { skin: SKIN.warm, torso: 0x5f7a4a, sleeve: 0x6b8a52, robe: { color: 0x4f6a3d, len: 0.76, flare: 0.34, hem: 0xd9c27a },
      torsoTop: 0.21, torsoBot: 0.22, torsoY1: 1.12, belt: 0x8a5a32, armPose: 'staffR', collar: 0xd9c27a };
    const hm = humanoid(B, o);
    // shawl over the shoulders
    B.add(GEO.sph, 0xb8873f, 0, 1.08, -0.02, 0, 0, 0, 0.29, 0.12, 0.24);
    // staff
    const h = hm.hands[1];
    B.limb([h[0], 0.0, h[2] + 0.02], [h[0] - 0.02, 1.55, h[2]], 0.028, 0x7a5232);
    B.add(GEO.torus, 0x7a5232, h[0] - 0.02, 1.6, h[2], 0, Math.PI / 2, 0, 0.09, 0.09, 0.09);
    G.add(GEO.sphLo, 0x9dff8a, h[0] - 0.02, 1.6, h[2], 0, 0, 0, 0.055);
    const hd = head(H, { skin: SKIN.warm, headR: 0.25, closedEyes: true, brows: 0xf2efe6, browTilt: 0.25, nose: 0xd99a74 });
    hair(H, hd.R, hd.cy, 'bald', 0xf2efe6);
    // beard + mustache
    H.add(GEO.cone, 0xf5f2ea, 0, hd.cy - hd.R * 0.95, hd.R * 0.62, Math.PI + 0.25, 0, 0, hd.R * 0.55, hd.R * 1.5, hd.R * 0.4);
    H.add(GEO.sph, 0xf5f2ea, 0, hd.cy - hd.R * 0.42, hd.R * 0.66, 0, 0, 0, hd.R * 0.62, hd.R * 0.35, hd.R * 0.38);
    for (const s of [-1, 1]) H.add(GEO.sph, 0xf5f2ea, s * hd.R * 0.28, hd.cy - hd.R * 0.28, hd.R * 0.92, 0, 0, s * 0.5, hd.R * 0.3, hd.R * 0.1, hd.R * 0.12);
    return { lean: 0.16, top: 1.12 + 0.1 + hd.R * 2 + 0.05 };
  },
  // 대마도사 엘리시아 — tall, elegant violet robe w/ gold trim, huge pointed witch hat, floating star orb
  mageMentor(B, H, G) {
    const o = { skin: SKIN.light, torso: 0x5b3c9c, sleeve: 0x6b4ab0, forearm: 0x6b4ab0, robe: { color: 0x47307f, len: 0.84, flare: 0.42, hem: 0xe9c46a },
      torsoTop: 0.18, torsoBot: 0.19, belt: 0xe9c46a, armPose: 'hips', collar: 0xe9c46a, gloves: 0xf6ecd2 };
    humanoid(B, o);
    // cape
    B.add(GEO.cone, 0x2e1f5a, 0, 0.78, -0.13, -0.12, 0, 0, 0.36, 0.95, 0.12);
    // floating orb (separate glow mesh, animated)
    G.add(GEO.sph, 0xb9a6ff, 0, 0, 0, 0, 0, 0, 0.09);
    G.add(GEO.torus, 0xffe7a8, 0, 0, 0, 0.6, 0, 0.3, 0.14, 0.14, 0.14);
    const hd = head(H, { skin: SKIN.light, headR: 0.24, eye: 0x4a2a7a, brows: 0x8a4a2a, browTilt: 0.15 });
    hair(H, hd.R, hd.cy, 'long', 0xd8743a);
    // witch hat: brim + tall bent cone + gold band + star
    const top = hd.cy + hd.R * 0.78;
    H.add(GEO.cyl, 0x3d2a72, 0, top, -0.01, -0.12, 0, 0, 0.5, 0.03, 0.48);
    H.add(GEO.cone, 0x47307f, 0, top + 0.22, -0.04, -0.12, 0, 0, 0.25, 0.44, 0.25);
    H.add(GEO.cyl, 0xe9c46a, 0, top + 0.05, -0.02, -0.12, 0, 0, 0.245, 0.06, 0.245);
    H.add(GEO.cone, 0x47307f, 0, top + 0.5, -0.17, -0.85, 0, 0, 0.11, 0.3, 0.11);
    H.add(GEO.sph, 0xffe08a, 0.0, top + 0.12, 0.23, 0, 0, 0, 0.045);
    return { orb: true, top: top + 0.62 };
  },
  // 검성 바르칸 — broad veteran: steel pauldrons, crimson sash, dark beard, scar, greatsword on the back, arms crossed
  swordMentor(B, H, G) {
    const o = { skin: SKIN.tan, torso: 0x6b4a3a, sleeve: 0x4a3a30, forearm: 0x8f949c, legs: 0x3e342e, shoes: 0x2e2420,
      torsoTop: 0.27, torsoBot: 0.22, torsoY0: 0.7, torsoY1: 1.26, belt: 0x2a1f1a, armPose: 'crossed', shoulderW: 0.33, armR: 0.075, gloves: 0x3a2a20, legR: 0.1, torsoDepth: 0.82 };
    humanoid(B, o);
    // chest plate + pauldrons + sash
    B.add(GEO.sph, 0x9aa1aa, 0, 1.06, 0.07, 0, 0, 0, 0.26, 0.2, 0.16);
    for (const s of [-1, 1]) {
      B.add(GEO.sph, 0xa9b0b8, s * 0.33, 1.22, 0, 0, 0, s * 0.35, 0.15, 0.1, 0.15);
      B.add(GEO.sph, 0x7e858e, s * 0.33, 1.18, 0, 0, 0, s * 0.35, 0.16, 0.06, 0.16);
    }
    B.add(GEO.box, 0xb8282f, 0, 1.0, 0.02, 0, 0, 0.7, 0.07, 0.7, 0.36);
    B.add(GEO.box, 0xb8282f, 0.17, 0.62, 0.12, 0.1, 0, 0.15, 0.1, 0.36, 0.03); // sash tail
    // greatsword on the back
    B.add(GEO.box, 0xcfd6de, -0.1, 1.05, -0.24, 0, 0, 0.5, 0.11, 1.3, 0.03);
    B.add(GEO.box, 0x6b5a2a, 0.17, 1.62, -0.24, 0, 0, 0.5, 0.34, 0.06, 0.06);
    B.add(GEO.cyl, 0x3a2a20, 0.24, 1.76, -0.24, 0, 0, 0.5, 0.035, 0.24, 0.035);
    G.add(GEO.box, 0xff9a5a, -0.06, 1.0, -0.21, 0, 0, 0.5, 0.025, 0.9, 0.01); // rune line on the blade
    const hd = head(H, { skin: SKIN.tan, headR: 0.23, eye: 0x1e1612, brows: 0x2a1f1a, browTilt: -0.35, cheeks: false, nose: 0xc58a62 });
    hair(H, hd.R, hd.cy, 'swept', 0x5a5450);
    H.add(GEO.sph, 0x3a3230, 0, hd.cy - hd.R * 0.55, hd.R * 0.55, 0, 0, 0, hd.R * 0.75, hd.R * 0.5, hd.R * 0.5); // beard
    H.add(GEO.box, 0xb05a4a, hd.R * 0.36, hd.cy + hd.R * 0.05, hd.R * 0.93, 0, 0, 0.3, hd.R * 0.04, hd.R * 0.5, hd.R * 0.03); // scar
    return { top: 1.36 + hd.R * 2 + 0.05 };
  },
  // 경비대장 로웬 — blue tabard over chainmail, round helmet with a red plume, spear
  captain(B, H, G) {
    const o = { skin: SKIN.warm, torso: 0x2f5fa8, sleeve: 0x8c939b, forearm: 0x8c939b, legs: 0x4a4038, shoes: 0x3a2a20,
      torsoTop: 0.23, torsoBot: 0.22, belt: 0x5a3a22, armPose: 'staffR', shoulderW: 0.3, collar: 0xe9c46a, gloves: 0x5a3a22 };
    const hm = humanoid(B, o);
    B.add(GEO.box, 0xe9c46a, 0, 0.98, 0.17, 0, 0, Math.PI / 4, 0.12, 0.12, 0.02); // crest
    B.add(GEO.box, 0x2f5fa8, 0, 0.56, 0.1, 0, 0, 0, 0.26, 0.28, 0.04); // tabard skirt
    for (const s of [-1, 1]) B.add(GEO.sph, 0x9aa3ad, s * 0.3, 1.18, 0, 0, 0, s * 0.3, 0.12, 0.08, 0.12);
    const h = hm.hands[1];
    B.limb([h[0], 0.0, h[2]], [h[0], 2.1, h[2]], 0.025, 0x6b4a2a);
    B.add(GEO.cone, 0xd8dee6, h[0], 2.22, h[2], 0, 0, 0, 0.05, 0.22, 0.02);
    B.add(GEO.cone, 0xc0302f, h[0], 2.05, h[2], Math.PI, 0, 0, 0.04, 0.1, 0.04); // tassel
    const hd = head(H, { skin: SKIN.warm, headR: 0.235, eye: 0x2a3a5a, brows: 0x3a2a1a, browTilt: -0.15 });
    H.add(GEO.capLow, 0xa9b2bc, 0, hd.cy + hd.R * 0.02, -hd.R * 0.02, -0.15, 0, 0, hd.R * 1.1);
    H.add(GEO.cyl, 0x8c949e, 0, hd.cy + hd.R * 0.32, 0, -0.15, 0, 0, hd.R * 1.13, hd.R * 0.12, hd.R * 1.13);
    H.add(GEO.sph, 0xc8303a, 0, hd.cy + hd.R * 1.2, -hd.R * 0.35, -0.6, 0, 0, hd.R * 0.18, hd.R * 0.3, hd.R * 0.75); // plume
    H.add(GEO.box, 0x8c949e, 0, hd.cy + hd.R * 0.3, hd.R * 0.95, 0, 0, 0, hd.R * 0.08, hd.R * 0.5, hd.R * 0.08); // nose guard
    return { top: 2.25 };
  },
  // 상인 미라 — round friendly trader: orange headscarf, green apron, huge backpack with a rolled mat & pots
  merchant(B, H, G) {
    const o = { skin: SKIN.light, torso: 0xf2e6c8, sleeve: 0xf2e6c8, robe: { color: 0x3f8a5a, len: 0.66, flare: 0.36, hem: 0xf2b84a },
      torsoTop: 0.2, torsoBot: 0.24, belt: 0x8a5a32, armPose: 'front', torsoDepth: 0.85 };
    humanoid(B, o);
    B.add(GEO.box, 0x6fbf6a, 0, 0.7, 0.2, 0.05, 0, 0, 0.3, 0.5, 0.03); // apron
    B.add(GEO.box, 0xa86a3a, 0, 1.0, -0.32, 0, 0, 0, 0.42, 0.5, 0.26); // backpack
    B.add(GEO.cyl, 0xc84a3a, 0, 1.33, -0.32, 0, 0, Math.PI / 2, 0.08, 0.5, 0.08); // rolled mat
    B.add(GEO.sph, 0x5a7ac8, 0.16, 0.82, -0.46, 0, 0, 0, 0.09); // hanging pot
    B.add(GEO.sph, 0xe0b040, -0.15, 0.8, -0.46, 0, 0, 0, 0.07);
    const hd = head(H, { skin: SKIN.light, headR: 0.24, eye: 0x3a2a1a, mouth: true });
    hair(H, hd.R, hd.cy, 'short', 0x6a3a22);
    H.add(GEO.cap, 0xf08a2a, 0, hd.cy + hd.R * 0.1, -hd.R * 0.08, -0.25, 0, 0, hd.R * 1.13);
    H.add(GEO.sph, 0xf08a2a, hd.R * 0.2, hd.cy + hd.R * 0.6, -hd.R * 1.0, 0, 0, 0.6, hd.R * 0.25, hd.R * 0.18, hd.R * 0.18); // knot
    return { top: 1.2 + 0.1 + hd.R * 2 + 0.08 };
  },
  // 꼬마 티모 — big-headed kid: yellow tunic, blue shorts, aviator cap with goggles & a feather
  child(B, H, G) {
    const o = { skin: SKIN.light, torso: 0xf2c23a, sleeve: 0xf2c23a, legs: 0x3a6ab8, shoes: 0x8a4a2a, torsoY0: 0.42, torsoY1: 0.78,
      torsoTop: 0.15, torsoBot: 0.16, armPose: 'down', shoulderW: 0.19, armR: 0.05, legR: 0.07, belt: 0x8a5a32 };
    // shorter humanoid: scale arms by remapping torso
    humanoidKid(B, o);
    const hd = head(H, { skin: SKIN.light, headR: 0.25, eye: 0x2a5a8a, mouth: true });
    hair(H, hd.R, hd.cy, 'spiky', 0xa8642a);
    H.add(GEO.cap, 0x8a5a32, 0, hd.cy + hd.R * 0.12, -hd.R * 0.05, -0.3, 0, 0, hd.R * 1.1);
    H.add(GEO.cyl, 0x5a3a22, 0, hd.cy + hd.R * 0.55, hd.R * 0.2, -0.3, 0, 0, hd.R * 1.0, hd.R * 0.12, hd.R * 1.0);
    for (const s of [-1, 1]) {
      H.add(GEO.cyl, 0x6a4a2a, s * hd.R * 0.34, hd.cy + hd.R * 0.68, hd.R * 0.62, -1.0, 0, 0, hd.R * 0.2, hd.R * 0.12, hd.R * 0.2);
      G.add(GEO.cyl, 0x9fe8ff, s * hd.R * 0.34, hd.cy + hd.R * 0.71, hd.R * 0.68, -1.0, 0, 0, hd.R * 0.15, hd.R * 0.04, hd.R * 0.15);
    }
    H.add(GEO.sph, 0x8fffc1, -hd.R * 0.7, hd.cy + hd.R * 0.9, -hd.R * 0.3, 0.4, 0, 0.5, hd.R * 0.1, hd.R * 0.55, hd.R * 0.05); // feather
    return { top: 0.88 + hd.R * 2 + 0.06, hop: true, glowOnHead: true };
  },
  // 세탁부 리나 — villager with a bun, pink dress & white apron, basket on the hip
  villagerA(B, H, G) {
    const o = { skin: SKIN.warm, torso: 0xd86a7a, sleeve: 0xf4e8d8, robe: { color: 0xc85a6a, len: 0.7, flare: 0.33 }, belt: 0xf4e8d8, armPose: 'hips' };
    humanoid(B, o);
    B.add(GEO.box, 0xf6f0e6, 0, 0.66, 0.19, 0.06, 0, 0, 0.28, 0.42, 0.02);
    B.add(GEO.cyl, 0xc8a060, -0.38, 0.86, 0.08, 0, 0, 0.3, 0.17, 0.16, 0.13); // laundry basket
    B.add(GEO.sph, 0xffffff, -0.38, 0.95, 0.08, 0, 0, 0, 0.14, 0.06, 0.1);
    const hd = head(H, { skin: SKIN.warm, headR: 0.235, eye: 0x3a2418, mouth: true });
    hair(H, hd.R, hd.cy, 'bun', 0x3a2418);
    return { top: 1.2 + 0.1 + hd.R * 2 + 0.15 };
  },
  // 방앗간 주인 도란 — stout farmer: straw hat, brown overalls, rolled sleeves
  villagerB(B, H, G) {
    const o = { skin: SKIN.tan, torso: 0x8a6a3a, sleeve: 0xe8dcc0, forearm: SKIN.tan, legs: 0x7a5a32, torsoTop: 0.22, torsoBot: 0.25, belt: 0x5a3a22, armPose: 'behind', torsoDepth: 0.9 };
    humanoid(B, o);
    for (const s of [-1, 1]) B.add(GEO.box, 0x5a3a22, s * 0.1, 1.05, 0.15, 0, 0, 0, 0.04, 0.32, 0.02); // straps
    const hd = head(H, { skin: SKIN.tan, headR: 0.24, eye: 0x2a1a10, brows: 0x6a4a2a });
    hair(H, hd.R, hd.cy, 'short', 0x6a4a2a);
    H.add(GEO.sph, 0x6a4a2a, 0, hd.cy - hd.R * 0.4, hd.R * 0.8, 0, 0, 0, hd.R * 0.45, hd.R * 0.14, hd.R * 0.15); // mustache
    H.add(GEO.cyl, 0xe8c86a, 0, hd.cy + hd.R * 0.72, 0, -0.05, 0, 0, hd.R * 2.1, hd.R * 0.06, hd.R * 2.1);
    H.add(GEO.cone, 0xd8b85a, 0, hd.cy + hd.R * 1.0, 0, -0.05, 0, 0, hd.R * 0.85, hd.R * 0.55, hd.R * 0.85);
    H.add(GEO.cyl, 0xb8382a, 0, hd.cy + hd.R * 0.82, 0, -0.05, 0, 0, hd.R * 0.86, hd.R * 0.1, hd.R * 0.86);
    return { top: 1.2 + 0.1 + hd.R * 2 + 0.12 };
  },
  // 낚시꾼 보리 할아버지 — old fisherman by the pond: teal vest, fishing rod, bucket hat
  villagerC(B, H, G) {
    const o = { skin: SKIN.warm, torso: 0x3a8a8a, sleeve: 0xd8d0b8, legs: 0x5a5a6a, armPose: 'rodR', torsoY1: 1.14, belt: 0x5a3a22 };
    const hm = humanoid(B, o);
    const h = hm.hands[1];
    B.limb([h[0] - 0.05, h[1] - 0.15, h[2] - 0.2], [h[0] + 0.1, h[1] + 1.2, h[2] + 1.2], 0.018, 0x8a6a3a, 0.008);
    B.add(GEO.cyl, 0x8a8a92, -0.32, 0.12, 0.2, 0, 0, 0, 0.12, 0.24, 0.12); // bucket
    const hd = head(H, { skin: SKIN.warm, headR: 0.24, closedEyes: true, brows: 0xe8e4da });
    hair(H, hd.R, hd.cy, 'bald', 0xe8e4da);
    H.add(GEO.sph, 0xe8e4da, 0, hd.cy - hd.R * 0.45, hd.R * 0.7, 0, 0, 0, hd.R * 0.5, hd.R * 0.3, hd.R * 0.3);
    H.add(GEO.capLow, 0x6a8a5a, 0, hd.cy + hd.R * 0.15, -hd.R * 0.04, -0.12, 0, 0, hd.R * 1.1, hd.R * 0.95, hd.R * 1.1);
    H.add(GEO.cyl, 0x5a7a4a, 0, hd.cy + hd.R * 0.42, 0, -0.12, 0, 0, hd.R * 1.45, hd.R * 0.05, hd.R * 1.45);
    return { lean: 0.08, top: 1.14 + 0.1 + hd.R * 2 + 0.1, rodTip: [h[0] + 0.1, h[1] + 1.2, h[2] + 1.2] };
  },
};

/** Kid body: shorter legs/torso. */
function humanoidKid(B, o) {
  const skin = o.skin;
  const t0 = o.torsoY0, t1 = o.torsoY1;
  for (const s of [-1, 1]) {
    B.limb([s * 0.07, 0.05, 0], [s * 0.08, t0 + 0.03, 0], o.legR, skin, o.legR);
    B.add(GEO.cyl, o.legs, s * 0.08, t0 - 0.06, 0, 0, 0, 0, o.legR * 1.5, 0.16, o.legR * 1.5);
    B.add(GEO.sph, o.shoes, s * 0.075, 0.045, 0.035, 0, 0, 0, 0.075, 0.055, 0.11);
  }
  const g = new THREE.CylinderGeometry(o.torsoTop, o.torsoBot, t1 - t0, 12); g.deleteAttribute('uv');
  _m.compose(_p.set(0, (t0 + t1) / 2, 0), _q.identity(), _s.set(1, 1, 0.8)); B.addM(g, o.torso, _m); g.dispose();
  B.add(GEO.sph, o.torso, 0, t1 - 0.01, 0, 0, 0, 0, o.torsoTop, 0.07, o.torsoTop * 0.8);
  B.add(GEO.cyl, o.belt, 0, t0 + 0.05, 0, 0, 0, 0, o.torsoBot * 1.04, 0.05, o.torsoBot * 0.84);
  B.add(GEO.cyl, skin, 0, t1 + 0.04, 0, 0, 0, 0, 0.05, 0.08, 0.05);
  lastNeck = t1 + 0.06;
  for (const s of [-1, 1]) {
    const sh = [s * o.shoulderW, t1 - 0.04, 0], el = [s * 0.24, t1 - 0.2, 0.02], ha = [s * 0.25, t1 - 0.38, 0.05];
    B.ball(sh, o.armR * 1.2, o.sleeve); B.limb(sh, el, o.armR, o.sleeve); B.limb(el, ha, o.armR * 0.85, skin); B.ball(ha, o.armR, skin);
  }
}

/**
 * Build an NPC model. Returns {root, body, headPivot, headMesh, glow, outlines[], info}.
 * root: Group at feet; bodyPivot: breathing/sway; headPivot at the neck.
 */
export function buildNpcModel(kind) {
  const { sharedMat: mat, glowMat: gmat } = mats();
  const B = new Builder(), H = new Builder(), G = new Builder();
  lastNeck = 1.28;
  const info = (CHARS[kind] || CHARS.villagerA)(B, H, G) || {};
  const neckY = lastNeck;
  const root = new THREE.Group(); root.name = 'npc_' + kind;
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = new THREE.Mesh(B.build(), mat); body.castShadow = true; body.receiveShadow = false;
  bodyPivot.add(body);
  const headPivot = new THREE.Group(); headPivot.position.set(0, neckY, info.lean ? info.lean * 0.5 : 0);
  bodyPivot.add(headPivot);
  const headMesh = new THREE.Mesh(H.build(), mat); headMesh.castShadow = false;
  headPivot.add(headMesh);
  const outlines = [addOutline(body, 0.018), addOutline(headMesh, 0.016)];
  let glow = null;
  const gg = G.build();
  if (gg) {
    glow = new THREE.Mesh(gg, gmat); glow.castShadow = false;
    if (info.orb) glow.position.set(0.5, 1.25, 0.25);
    (info.glowOnHead ? headPivot : bodyPivot).add(glow);
  }
  if (info.lean) bodyPivot.rotation.x = info.lean * 0.5;
  for (const m of [body, headMesh, glow, ...outlines]) if (m) m.frustumCulled = true;
  return { root, bodyPivot, body, headPivot, headMesh, glow, outlines, info, neckY };
}
