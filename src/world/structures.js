// Enemy camps, ancient boss arena ruins, training ring, signposts, waterfall.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { mulberry32, sstep, distPolyline } from './noise.js';
import { part, merge, mat4, staticMesh } from './prefab.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT, WATER_LEVEL } from './terrain.js';
import { buildFires } from './fire.js';

const C = (h) => new THREE.Color(h);

function hideColor(seed) {
  const a = C(0xc9a273), b = C(0x9c7148), s = C(0x5a3a22), r = C(0xa8553a);
  return (x, y, z, c) => {
    const ang = Math.atan2(z, x);
    const k = Math.sin(ang * 3 + seed) * Math.sin(y * 2.1 + seed * 2);
    c.copy(a).lerp(b, k > 0.2 ? 0.8 : 0.1);
    if (Math.abs(Math.sin(ang * 5 + seed)) > 0.96) c.lerp(s, 0.6);
    if (y > -0.75 && y < -0.45) c.lerp(r, 0.75);
    if (y < -1.45) c.lerp(s, 0.35);
  };
}
function woodColor(base = 0x8a6239, dark = 0x5c3f24) {
  const a = C(base), b = C(dark);
  return (x, y, z, c) => { c.copy(a).lerp(b, (Math.sin(y * 7 + x * 3 + z * 5) * 0.5 + 0.5) * 0.45); };
}
function stoneColor(moss = true) {
  const a = C(0xbab3a2), b = C(0x8e877a), m = C(0x79a14c), w = C(0xc7b89a);
  return (x, y, z, c, i) => {
    c.copy(a).lerp(b, (Math.sin(x * 1.7 + y * 2.3) * Math.sin(z * 1.9 - y) * 0.5 + 0.5) * 0.6).lerp(w, (Math.sin(y * 5.1 + x) * 0.5 + 0.5) * 0.2);
    if (moss) { const k = Math.sin(x * 2.1 + z * 1.3) * 0.5 + 0.5; if (k > 0.66) c.lerp(m, (k - 0.66) * 1.4); }
  };
}

// ------------------------------------------------------------------ camps
function buildCamp(game, world, camp, idx, parts, rnd) {
  const { getHeight, colliders } = world;
  const cx = camp.x, cz = camp.z, R = camp.r;
  const hy = (x, z) => getHeight(x, z);
  // entrance faces the incoming path
  let best = null, bd = Infinity;
  for (const k in LAYOUT.paths) for (const p of LAYOUT.paths[k]) {
    const d = Math.abs(Math.hypot(p[0] - cx, p[1] - cz) - (R + 4));
    if (d < bd) { bd = d; best = p; }
  }
  const entr = Math.atan2(best[1] - cz, best[0] - cx);
  camp.entranceAngle = entr;
  const angDist = (a) => Math.abs(Math.atan2(Math.sin(a - entr), Math.cos(a - entr)));

  // palisade
  const stakeR = R + 0.6;
  const n = Math.floor((Math.PI * 2 * stakeR) / 0.95);
  const wood = woodColor();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (angDist(a) < 0.3) continue;
    const x = cx + Math.cos(a) * stakeR, z = cz + Math.sin(a) * stakeR;
    const h = 2.2 + rnd() * 0.9 + (i % 2) * 0.3;
    const y = hy(x, z) - 0.3;
    const tilt = 0.12 + rnd() * 0.06;
    const m = mat4(x, y, z, Math.sin(a) * -tilt * 0, 0, 0);
    const rot = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -tilt);
    const base = new THREE.Matrix4().makeTranslation(x, y, z).multiply(rot);
    const r = 0.16 + rnd() * 0.05;
    parts.push(part(new THREE.CylinderGeometry(r, r * 1.1, h, 6), wood, base.clone().multiply(mat4(0, h / 2, 0))));
    parts.push(part(new THREE.ConeGeometry(r, 0.55, 6), 0xb08856, base.clone().multiply(mat4(0, h + 0.27, 0))));
    colliders.push({ x, z, r: 0.42, kind: 'stake' });
    void m;
  }
  // binding rails (two rings of horizontal logs between stakes)
  for (let i = 0; i < n; i += 3) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 3) / n) * Math.PI * 2;
    if (angDist(a0) < 0.34 || angDist(a1) < 0.34) continue;
    const x0 = cx + Math.cos(a0) * (stakeR + 0.15), z0 = cz + Math.sin(a0) * (stakeR + 0.15);
    const x1 = cx + Math.cos(a1) * (stakeR + 0.15), z1 = cz + Math.sin(a1) * (stakeR + 0.15);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yy = (hy(x0, z0) + hy(x1, z1)) / 2 + 1.0;
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.08, len, 5), 0x6b4a2a,
      mat4((x0 + x1) / 2, yy, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0), Math.PI / 2)));
  }

  // bonfire
  const fy = hy(cx, cz);
  const fire = new THREE.Vector3(cx, fy, cz);
  camp.fire = fire;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(part(new THREE.DodecahedronGeometry(0.3, 0), stoneColor(false), mat4(cx + Math.cos(a) * 1.05, fy + 0.05, cz + Math.sin(a) * 1.05, rnd(), rnd(), rnd(), 1, 0.7, 1)));
  }
  const STAKES = 5;
  for (let i = 0; i < STAKES; i++) {
    const a = (i / STAKES) * Math.PI * 2 + 0.3;
    parts.push(part(new THREE.CylinderGeometry(0.1, 0.13, 1.5, 6), woodColor(0x5a3d24, 0x2a1c12),
      mat4(cx + Math.cos(a) * 0.38, fy + 0.45, cz + Math.sin(a) * 0.38, 0, -a, 0).multiply(mat4(0, 0, 0, 0, 0, 0.62))));
  }
  parts.push(part(new THREE.CylinderGeometry(0.85, 0.95, 0.08, 12), 0x2b211c, mat4(cx, fy + 0.02, cz)));
  colliders.push({ x: cx, z: cz, r: 1.2, kind: 'fire' });
  // log seats
  for (let i = 0; i < 3; i++) {
    const a = entr + 1.2 + i * 1.6;
    const x = cx + Math.cos(a) * 3.4, z = cz + Math.sin(a) * 3.4;
    parts.push(part(new THREE.CylinderGeometry(0.32, 0.34, 2.2, 8), woodColor(0x7c5532, 0x4f361f), mat4(x, hy(x, z) + 0.28, z, 0, -a, Math.PI / 2)));
  }

  // tents & hut
  const tentAngles = [entr + Math.PI * 0.55, entr + Math.PI, entr - Math.PI * 0.55];
  camp.tents = [];
  tentAngles.forEach((a, ti) => {
    const d = R - 5.2;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const y = hy(x, z) - 0.05;
    const face = a + Math.PI; // faces centre
    if (ti === 1) {
      // hut
      const T = mat4(x, y, z, 0, -face + Math.PI / 2, 0);
      parts.push(part(new THREE.CylinderGeometry(2.4, 2.6, 2.3, 14, 1), (px, py, pz, c) => {
        const ang = Math.atan2(pz - z, px - x); c.set(Math.sin(ang * 14) > 0 ? 0x8f6a42 : 0x7a5836);
      }, T.clone().multiply(mat4(0, 1.15, 0))));
      parts.push(part(new THREE.ConeGeometry(3.4, 2.4, 14, 3), (px, py, pz, c) => {
        c.set(0xd4b25e).lerp(C(0xa98a3e), (Math.sin(py * 9) * 0.5 + 0.5) * 0.6);
      }, T.clone().multiply(mat4(0, 3.45, 0)), { jitter: 0.12 }));
      parts.push(part(new THREE.BoxGeometry(0.1, 1.7, 1.1), 0x2e1f14, T.clone().multiply(mat4(2.45, 0.85, 0))));
      colliders.push({ x, z, r: 2.7, kind: 'hut' });
      camp.tents.push(new THREE.Vector3(x, y, z));
      return;
    }
    const T = mat4(x, y, z, 0, -face + Math.PI / 2, 0);
    parts.push(part(new THREE.ConeGeometry(2.5, 3.4, 10, 3, true), hideColor(idx * 3 + ti), T.clone().multiply(mat4(0, 1.7, 0)), { jitter: 0.08, localColor: true }));
    // flap (dark triangle) on +x side
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.7, 0, 0, 0.7, 0, 1.8, 0], 3));
    tri.computeVertexNormals();
    parts.push(part(tri, 0x2a1a10, T.clone().multiply(mat4(2.42, 0.0, 0, 0, 0, 0.62)).multiply(mat4(0.02, 0, 0))));
    for (let k = 0; k < 3; k++) {
      const pa = k * 2.1;
      parts.push(part(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 4), 0x6b4a2a,
        T.clone().multiply(mat4(Math.cos(pa) * 0.15, 3.6, Math.sin(pa) * 0.15, Math.sin(pa) * 0.35, 0, -Math.cos(pa) * 0.35))));
    }
    colliders.push({ x, z, r: 2.4, kind: 'tent' });
    camp.tents.push(new THREE.Vector3(x, y, z));
  });

  // skull totems (2 at the entrance, 1 inside)
  const totem = (x, z, rotY) => {
    const y = hy(x, z) - 0.2;
    const T = mat4(x, y, z, 0, rotY, 0);
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.17, 3.4, 6), woodColor(0x6f4b2c, 0x3e2a18), T.clone().multiply(mat4(0, 1.7, 0))));
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5), 0x5a3d24, T.clone().multiply(mat4(0, 2.6, 0, 0, 0, Math.PI / 2))));
    parts.push(part(new THREE.SphereGeometry(0.36, 10, 8), 0xf0e6cf, T.clone().multiply(mat4(0, 3.5, 0, 0, 0, 0, 1, 0.92, 1.12))));
    parts.push(part(new THREE.BoxGeometry(0.42, 0.18, 0.32), 0xe2d6bb, T.clone().multiply(mat4(0, 3.22, 0.12))));
    parts.push(part(new THREE.SphereGeometry(0.1, 6, 5), 0x1a0f0a, T.clone().multiply(mat4(-0.13, 3.52, 0.3))));
    parts.push(part(new THREE.SphereGeometry(0.1, 6, 5), 0x1a0f0a, T.clone().multiply(mat4(0.13, 3.52, 0.3))));
    parts.push(part(new THREE.ConeGeometry(0.09, 0.6, 6), 0xe8dcc0, T.clone().multiply(mat4(-0.38, 3.75, 0, 0, 0, 0.9))));
    parts.push(part(new THREE.ConeGeometry(0.09, 0.6, 6), 0xe8dcc0, T.clone().multiply(mat4(0.38, 3.75, 0, 0, 0, -0.9))));
    // red cloth strips
    parts.push(part(new THREE.BoxGeometry(0.22, 0.9, 0.03), 0xb8382a, T.clone().multiply(mat4(-0.6, 2.15, 0.02, 0, 0, 0.05))));
    parts.push(part(new THREE.BoxGeometry(0.22, 0.75, 0.03), 0x9a2e22, T.clone().multiply(mat4(0.6, 2.2, 0.02, 0, 0, -0.06))));
    // feathers
    parts.push(part(new THREE.ConeGeometry(0.06, 0.4, 4), 0x3a6fb0, T.clone().multiply(mat4(-0.7, 2.45, 0.05, 0, 0, 2.6))));
    colliders.push({ x, z, r: 0.35, kind: 'totem' });
  };
  for (const s of [-1, 1]) {
    const a = entr + s * 0.42;
    const x = cx + Math.cos(a) * (R + 1.8), z = cz + Math.sin(a) * (R + 1.8);
    totem(x, z, -entr + Math.PI / 2);
  }
  {
    const a = entr - 2.4; const x = cx + Math.cos(a) * 6.5, z = cz + Math.sin(a) * 6.5;
    totem(x, z, -a - Math.PI / 2);
  }

  // watchtower
  {
    const a = entr + Math.PI * 0.27; const d = R - 3.6;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = hy(x, z) - 0.2;
    camp.tower = new THREE.Vector3(x, y + 4.2, z);
    const T = mat4(x, y, z, 0, -a, 0);
    const wc = woodColor(0x7f5a35, 0x4d3520);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      parts.push(part(new THREE.CylinderGeometry(0.12, 0.15, 5.4, 5), wc, T.clone().multiply(mat4(ox * 1.1, 2.7, oz * 1.1, oz * 0.05, 0, -ox * 0.05))));
    }
    parts.push(part(new THREE.BoxGeometry(2.8, 0.18, 2.8), wc, T.clone().multiply(mat4(0, 4.2, 0))));
    for (const [ox, oz, ry] of [[0, -1.35, 0], [0, 1.35, 0], [-1.35, 0, Math.PI / 2], [1.35, 0, Math.PI / 2]]) {
      parts.push(part(new THREE.BoxGeometry(2.8, 0.1, 0.1), wc, T.clone().multiply(mat4(ox, 5.0, oz, 0, ry, 0))));
    }
    parts.push(part(new THREE.ConeGeometry(2.2, 1.3, 4), hideColor(9), T.clone().multiply(mat4(0, 6.45, 0, 0, Math.PI / 4, 0)), { localColor: true }));
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 4), wc, T.clone().multiply(mat4(ox * 1.25, 5.4, oz * 1.25))));
    }
    // ladder
    parts.push(part(new THREE.BoxGeometry(0.08, 4.6, 0.08), wc, T.clone().multiply(mat4(1.6, 2.2, -0.35, 0, 0, 0.12))));
    parts.push(part(new THREE.BoxGeometry(0.08, 4.6, 0.08), wc, T.clone().multiply(mat4(1.6, 2.2, 0.35, 0, 0, 0.12))));
    for (let k = 0; k < 8; k++) parts.push(part(new THREE.BoxGeometry(0.06, 0.06, 0.75), wc, T.clone().multiply(mat4(1.85 - k * 0.065, 0.3 + k * 0.55, 0))));
    colliders.push({ x, z, r: 1.7, kind: 'tower' });
  }

  // meat-drying rack + crates
  {
    const a = entr - 1.2; const d = 7.5;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = hy(x, z);
    const T = mat4(x, y, z, 0, -a + Math.PI / 2, 0);
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5), 0x6b4a2a, T.clone().multiply(mat4(-1.2, 1.1, 0))));
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5), 0x6b4a2a, T.clone().multiply(mat4(1.2, 1.1, 0))));
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), 0x5a3d24, T.clone().multiply(mat4(0, 2.05, 0, 0, 0, Math.PI / 2))));
    for (let k = 0; k < 4; k++) parts.push(part(new THREE.SphereGeometry(0.2, 7, 6), k % 2 ? 0x9c3b2c : 0xb4553c, T.clone().multiply(mat4(-0.8 + k * 0.53, 1.65, 0, 0, 0, 0, 0.8, 1.6, 0.6))));
    colliders.push({ x, z, r: 1.0, kind: 'rack' });
    for (let k = 0; k < 3; k++) {
      const b = a + 0.5 + k * 0.18; const xx = cx + Math.cos(b) * (d + 1.5), zz = cz + Math.sin(b) * (d + 1.5);
      const s = 0.7 + rnd() * 0.3;
      parts.push(part(new THREE.BoxGeometry(s, s, s), woodColor(0xa47a46, 0x7a5530), mat4(xx, hy(xx, zz) + s / 2 + (k === 2 ? 0.75 : 0), zz, 0, rnd() * 2, 0)));
    }
    const b = a + 0.68; colliders.push({ x: cx + Math.cos(b) * (d + 1.5), z: cz + Math.sin(b) * (d + 1.5), r: 0.9, kind: 'crate' });
  }
  return fire;
}

// ------------------------------------------------------------------ arena textures
function arenaFloorTexture() {
  const S = 1024; const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'); const rnd = mulberry32(9);
  const cx = S / 2;
  g.fillStyle = '#7d776b'; g.fillRect(0, 0, S, S);
  const rings = [0, 0.13, 0.26, 0.4, 0.55, 0.7, 0.85, 1.0];
  for (let r = 0; r < rings.length - 1; r++) {
    const r0 = rings[r] * cx * 0.99, r1 = rings[r + 1] * cx * 0.99;
    const nb = r === 0 ? 1 : Math.max(6, Math.round((Math.PI * (r0 + r1)) / 95));
    for (let b = 0; b < nb; b++) {
      const a0 = (b / nb) * Math.PI * 2 + r * 0.4, a1 = ((b + 1) / nb) * Math.PI * 2 + r * 0.4;
      const v = 150 + rnd() * 45 | 0; const w = (rnd() - 0.5) * 18;
      g.fillStyle = `rgb(${v + w + 8},${v + w},${v - 12 + w})`;
      g.beginPath();
      g.arc(cx, cx, r1 - 3, a0 + 0.01, a1 - 0.01); g.arc(cx, cx, Math.max(0, r0 + 3), a1 - 0.01, a0 + 0.01, true);
      g.closePath(); g.fill();
      // stone highlights
      g.strokeStyle = 'rgba(255,250,235,0.18)'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cx, r1 - 6, a0 + 0.03, a1 - 0.03); g.stroke();
    }
  }
  // cracks
  g.strokeStyle = 'rgba(50,44,38,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  // moss patches
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * cx;
    const edge = d / cx;
    if (rnd() > edge * 1.3) continue;
    g.fillStyle = `rgba(${100 + rnd() * 30 | 0},${150 + rnd() * 30 | 0},${70},${0.25 + rnd() * 0.35})`;
    g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 8 + rnd() * 26, 6 + rnd() * 16, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function runeTexture() {
  const S = 1024; const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'); const rnd = mulberry32(31);
  const c = S / 2;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
  ring(c * 0.93, 5); ring(c * 0.86, 2.5); ring(c * 0.55, 4); ring(c * 0.5, 2); ring(c * 0.2, 4);
  // heptagram
  g.lineWidth = 3.5; g.beginPath();
  for (let i = 0; i <= 7; i++) { const a = (i * 3 / 7) * Math.PI * 2 - Math.PI / 2; const x = c + Math.cos(a) * c * 0.55, y = c + Math.sin(a) * c * 0.55; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  // radial spokes
  g.lineWidth = 2.5;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.56, c + Math.sin(a) * c * 0.56); g.lineTo(c + Math.cos(a) * c * 0.86, c + Math.sin(a) * c * 0.86); g.stroke(); }
  // glyphs between rings
  g.lineWidth = 3;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + 0.11, r = c * 0.895;
    g.save(); g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r); g.rotate(a + Math.PI / 2);
    g.beginPath();
    const k = Math.floor(rnd() * 5);
    if (k === 0) { g.moveTo(-8, -9); g.lineTo(0, 9); g.lineTo(8, -9); }
    else if (k === 1) { g.arc(0, 0, 8, 0, Math.PI * 1.5); g.moveTo(0, -12); g.lineTo(0, 12); }
    else if (k === 2) { g.moveTo(-9, 0); g.lineTo(9, 0); g.moveTo(-5, -9); g.lineTo(5, 9); g.moveTo(5, -9); g.lineTo(-5, 9); }
    else if (k === 3) { g.rect(-7, -7, 14, 14); g.moveTo(0, -12); g.lineTo(0, -7); }
    else { g.moveTo(-8, 9); g.lineTo(-8, -9); g.lineTo(8, -2); g.lineTo(-8, 3); }
    g.stroke(); g.restore();
  }
  // inner glyph circle
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2; const x = c + Math.cos(a) * c * 0.36, y = c + Math.sin(a) * c * 0.36;
    g.lineWidth = 3; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 8;
  return t;
}

function signTexture(lines) {
  const W = 512, H = 128 * lines.length; const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = 'bold 58px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    g.fillStyle = 'rgba(60,36,18,0.95)';
    g.fillText(l, W / 2, 128 * i + 66);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ build all
export function buildStructures(game, world) {
  const group = new THREE.Group(); group.name = 'structures';
  game.scene.add(group);
  const rnd = mulberry32(4242);
  const { getHeight, colliders } = world;

  // camps
  const firePositions = [];
  for (let i = 0; i < LAYOUT.camps.length; i++) {
    const parts = [];
    firePositions.push(buildCamp(game, world, LAYOUT.camps[i], i, parts, rnd));
    staticMesh(group, merge(parts), { outline: 0.035, outlineColor: 0x24170e });
  }
  const fires = buildFires(game, firePositions);

  // ---------------- boss arena
  const A = LAYOUT.arena; const P = LAYOUT.targets.arena;
  const ap = [];
  const stone = stoneColor(true);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(A.r + 0.4, 72), toonMat(0xffffff, { map: arenaFloorTexture() }));
  floor.material.polygonOffset = true; floor.material.polygonOffsetFactor = -2; floor.material.polygonOffsetUnits = -2;
  floor.rotation.x = -Math.PI / 2; floor.position.set(A.x, P + 0.03, A.z); floor.receiveShadow = true;
  group.add(floor);
  const runeUniforms = { uTime: { value: 0 }, uMap: { value: runeTexture() }, uColor: { value: new THREE.Color(0x58b8ff) }, uBoost: { value: 0 } };
  const runes = new THREE.Mesh(new THREE.CircleGeometry(A.r - 1.2, 72), new THREE.ShaderMaterial({
    uniforms: runeUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uTime; uniform vec3 uColor; uniform float uBoost; varying vec2 vUv;
      void main(){
        float m = texture2D(uMap, vUv).r;
        vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x);
        float wave = 0.55 + 0.45 * sin(r * 9.0 - uTime * 1.6) * 0.5 + 0.25 * sin(a * 7.0 + uTime * 0.7);
        float pulse = 0.65 + 0.35 * sin(uTime * 1.3);
        float k = m * (0.35 + 0.4 * wave) * pulse * (1.0 + uBoost * 2.5);
        gl_FragColor = vec4(uColor * k * 1.25, k);
      }`,
  }));
  runes.rotation.x = -Math.PI / 2; runes.position.set(A.x, P + 0.06, A.z); runes.renderOrder = 3;
  group.add(runes);
  // curb blocks
  const nb = 40;
  for (let i = 0; i < nb; i++) {
    if (rnd() < 0.12) continue;
    const a = (i / nb) * Math.PI * 2;
    const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    if (Math.abs(da) < 0.12) continue; // ramp gap (south = +z)
    const x = A.x + Math.cos(a) * (A.r + 0.2), z = A.z + Math.sin(a) * (A.r + 0.2);
    ap.push(part(new THREE.BoxGeometry(0.9, 0.5 + rnd() * 0.2, 3.6), stone, mat4(x, P + 0.15, z, (rnd() - 0.5) * 0.1, -a, (rnd() - 0.5) * 0.08)));
  }
  // pillars
  const pillar = (x, z, h, broken, ry = 0) => {
    const y = getHeight(x, z);
    ap.push(part(new THREE.BoxGeometry(2.0, 0.6, 2.0), stone, mat4(x, y + 0.25, z, 0, ry, 0)));
    const drums = Math.ceil(h / 1.3);
    for (let k = 0; k < drums; k++) {
      const hh = Math.min(1.3, h - k * 1.3);
      if (hh <= 0.1) break;
      ap.push(part(new THREE.CylinderGeometry(0.72, 0.76, hh - 0.04, 10, 1), stone, mat4(x + (rnd() - 0.5) * 0.06, y + 0.55 + k * 1.3 + hh / 2, z + (rnd() - 0.5) * 0.06, 0, rnd() * 3, 0)));
    }
    if (!broken) ap.push(part(new THREE.BoxGeometry(1.9, 0.5, 1.9), stone, mat4(x, y + 0.55 + h + 0.25, z, 0, ry, 0)));
    else ap.push(part(new THREE.DodecahedronGeometry(0.75, 0), stone, mat4(x, y + 0.55 + h, z, rnd(), rnd(), rnd(), 1, 0.4, 1)));
    colliders.push({ x, z, r: 1.05, kind: 'pillar' });
  };
  const NP = 12;
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2 + Math.PI / NP;
    const x = A.x + Math.cos(a) * (A.r - 2), z = A.z + Math.sin(a) * (A.r - 2);
    const broken = rnd() < 0.55;
    pillar(x, z, broken ? 1.5 + rnd() * 3.5 : 6.5 + rnd() * 1.2, broken, -a);
  }
  // toppled drums
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, d = A.r - 4 - rnd() * 5;
    const x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d;
    ap.push(part(new THREE.CylinderGeometry(0.72, 0.72, 1.25, 10), stone, mat4(x, P + 0.62, z, 0, rnd() * 3, Math.PI / 2)));
    colliders.push({ x, z, r: 0.85, kind: 'rubble' });
  }
  // grand arch at the ramp entrance (south) and a broken arch behind (north)
  const arch = (cxA, czA, rotY, broken) => {
    const T = mat4(cxA, getHeight(cxA, czA), czA, 0, rotY, 0);
    for (const s of [-1, 1]) {
      if (broken && s > 0) {
        ap.push(part(new THREE.BoxGeometry(1.6, 4.2, 1.6), stone, T.clone().multiply(mat4(s * 4.2, 2.1, 0))));
        continue;
      }
      ap.push(part(new THREE.BoxGeometry(1.8, 0.7, 1.8), stone, T.clone().multiply(mat4(s * 4.2, 0.35, 0))));
      ap.push(part(new THREE.BoxGeometry(1.5, 8.2, 1.5), stone, T.clone().multiply(mat4(s * 4.2, 4.5, 0))));
      ap.push(part(new THREE.BoxGeometry(1.9, 0.6, 1.9), stone, T.clone().multiply(mat4(s * 4.2, 8.85, 0))));
    }
    if (!broken) {
      for (let k = 0; k < 7; k++) {
        const t = k / 6; const ang = Math.PI * (1 - t);
        ap.push(part(new THREE.BoxGeometry(1.55, 1.1, 1.5), stone, T.clone().multiply(mat4(Math.cos(ang) * 4.2, 9.1 + Math.sin(ang) * 2.4, 0, 0, 0, ang - Math.PI / 2))));
      }
      ap.push(part(new THREE.BoxGeometry(1.0, 1.3, 1.6), 0x9fd3ff, T.clone().multiply(mat4(0, 11.6, 0.1))));
    } else {
      for (let k = 0; k < 3; k++) {
        const ang = Math.PI * (1 - k / 6);
        ap.push(part(new THREE.BoxGeometry(1.55, 1.1, 1.5), stone, T.clone().multiply(mat4(Math.cos(ang) * 4.2, 9.1 + Math.sin(ang) * 2.4, 0, 0, 0, ang - Math.PI / 2))));
      }
      for (let k = 0; k < 4; k++) ap.push(part(new THREE.BoxGeometry(1.2, 1.0, 1.3), stone, T.clone().multiply(mat4(2 + rnd() * 3, 0.5, (rnd() - 0.5) * 4, rnd(), rnd(), rnd()))));
    }
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    for (const s of [-1, 1]) colliders.push({ x: cxA + cs * s * 4.2, z: czA - sn * s * 4.2, r: 1.15, kind: 'arch' });
  };
  arch(A.x, A.z + A.r - 0.5, 0, false);
  arch(A.x - 6, A.z - A.r + 1.5, 0.25, true);
  // ruins scattered on the slopes below
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = A.r + 8 + rnd() * 14;
    const x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d;
    if (Math.abs(x - LAYOUT.ramp.x) < 6 && z > A.z) continue;
    const s = 0.7 + rnd() * 0.9;
    ap.push(part(new THREE.BoxGeometry(1.4 * s, 1.0 * s, 1.2 * s), stone, mat4(x, getHeight(x, z) + 0.2 * s, z, rnd() * 0.5, rnd() * 3, rnd() * 0.5)));
  }
  // ramp side walls
  const R = LAYOUT.ramp;
  for (let k = 0; k < 7; k++) {
    const z = R.z0 + 2 + k * 3.4;
    for (const s of [-1, 1]) {
      if (rnd() < 0.2) continue;
      const x = R.x + s * (R.hw + 0.6);
      const slope = Math.atan2(getHeight(x, z + 1.6) - getHeight(x, z - 1.6), 3.2);
      ap.push(part(new THREE.BoxGeometry(0.9, 0.8 + rnd() * 0.4, 3.2), stone, mat4(x, getHeight(x, z) + 0.15, z, -slope, (rnd() - 0.5) * 0.1, 0)));
    }
  }
  staticMesh(group, merge(ap), { outline: 0.04, outlineColor: 0x2a2620 });

  // floating crystal shards (animated)
  const crystalMat = toonMat(0x8fd8ff, { emissive: 0x3aa8ff, emissiveIntensity: 1.3 });
  const crystals = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), crystalMat);
    m.scale.set(0.7, 1.6, 0.7);
    m.userData.base = new THREE.Vector3(A.x + Math.cos(a) * (A.r - 7), P + 3.2, A.z + Math.sin(a) * (A.r - 7));
    m.position.copy(m.userData.base);
    group.add(m); crystals.push(m);
  }

  // ---------------- training ring
  const tp = [];
  const [tx, tz] = LAYOUT.training; const TH = LAYOUT.targets.training;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.3;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue;
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.3) continue;
    const x = tx + Math.cos(a) * 9.5, z = tz + Math.sin(a) * 9.5;
    const h = 1.3 + rnd() * 1.2;
    tp.push(part(new THREE.BoxGeometry(0.9, h, 0.7, 2, 3, 2), stone, mat4(x, getHeight(x, z) + h / 2 - 0.2, z, (rnd() - 0.5) * 0.2, -a, (rnd() - 0.5) * 0.15), { jitter: 0.12 }));
    colliders.push({ x, z, r: 0.6, kind: 'stone' });
  }
  tp.push(part(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 10), stone, mat4(tx, TH + 0.05, tz)));
  // signposts: all board labels share one canvas atlas + one merged plane mesh (1 draw call)
  const signs = [];
  const labels = [], labelQuads = [];
  const sign = (x, z, rotY, boards) => {
    const y = getHeight(x, z);
    const T = mat4(x, y, z, 0, rotY, 0);
    tp.push(part(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 6), woodColor(), T.clone().multiply(mat4(0, 1.4, 0))));
    boards.forEach((b, k) => {
      const bt = T.clone().multiply(mat4(b.dir * 0.45, 2.3 - k * 0.55, 0, 0, 0, b.tilt || 0));
      tp.push(part(new THREE.BoxGeometry(1.6, 0.42, 0.08), woodColor(0xb08a58, 0x8a6a40), bt));
      const row = labels.length; labels.push(b.text);
      for (const side of [1, -1]) labelQuads.push({ row, m: bt.clone().multiply(mat4(0, 0, side * 0.045, 0, side > 0 ? 0 : Math.PI, 0)) });
    });
    colliders.push({ x, z, r: 0.25, kind: 'sign' });
    signSpots.push(x, z);
  };
  const signSpots = [];   // v4: flat [x, z, …] — world.js hides the label mesh when no sign is within reading distance
  sign(5, 108, -0.2, [{ text: '바람결 마을 ↓', dir: 0 }, { text: '고대 유적 ↑', dir: 0 }]);
  sign(-7, 63, 0.4, [{ text: '← 서쪽 야영지', dir: 0 }, { text: '북쪽 야영지 →', dir: 0 }]);
  sign(6, 97, -0.55, [{ text: '동쪽 야영지 →', dir: 0 }]);
  if (world.extraSigns) for (const sg of world.extraSigns) sign(sg.x, sg.z, sg.rotY, sg.boards);
  if (labels.length) {
    const tex = signTexture(labels);
    const quads = labelQuads.map(({ row, m }) => {
      const g = new THREE.PlaneGeometry(1.5, 0.375);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / labels.length);
      g.applyMatrix4(m); return g;
    });
    const sm = new THREE.Mesh(mergeGeometries(quads, false), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
    sm.name = 'signLabels';
    group.add(sm); signs.push(sm);
  }
  staticMesh(group, merge(tp), { outline: 0.03, outlineColor: 0x2a2620 });

  // ---------------- waterfall at the river head
  const head = LAYOUT.river[1], next = LAYOUT.river[3];
  const dx = next[0] - head[0], dz = next[1] - head[1]; const dl = Math.hypot(dx, dz);
  const ux = dx / dl, uz = dz / dl;
  let topY = WATER_LEVEL;
  for (let k = 0; k < 8; k++) topY = Math.max(topY, getHeight(head[0] - ux * k, head[1] - uz * k));
  const wfH = Math.max(4, topY - WATER_LEVEL + 1);
  const wfUniforms = { uTime: { value: 0 } };
  const wfMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), wfUniforms), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      void main(){
        float s = n(vec2(vUv.x * 18.0, vUv.y * 3.0 + uTime * 2.6)) * 0.6 + n(vec2(vUv.x * 40.0, vUv.y * 6.0 + uTime * 4.0)) * 0.4;
        vec3 c = mix(vec3(0.42, 0.75, 0.9), vec3(0.96, 0.99, 1.0), smoothstep(0.45, 0.75, s));
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = (0.62 + 0.35 * s) * edge;
        c = mix(c, vec3(1.0), smoothstep(0.15, 0.0, vUv.y));
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
  const wfW = 7;
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(wfW, wfH, 1, 8), wfMat);
  // bend outward slightly
  const wp = wf.geometry.attributes.position;
  for (let i = 0; i < wp.count; i++) { const t = (wp.getY(i) + wfH / 2) / wfH; wp.setZ(i, Math.sin(t * Math.PI) * 0.6 - t * 0.8); }
  wf.position.set(head[0] + ux * 0.6, WATER_LEVEL + wfH / 2 - 0.3, head[1] + uz * 0.6);
  wf.rotation.y = Math.atan2(ux, uz);
  wf.renderOrder = 2;
  group.add(wf);
  // foam pool
  const foamMat = new THREE.ShaderMaterial({
    uniforms: wfUniforms, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`uniform float uTime; varying vec2 vUv;
      void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x);
        float rings = sin(r * 18.0 - uTime * 5.0 + sin(a * 6.0) * 0.6) * 0.5 + 0.5;
        float k = smoothstep(1.0, 0.2, r) * (0.45 + 0.55 * rings);
        gl_FragColor = vec4(vec3(1.0), k * 0.75); }`,
  });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), foamMat);
  foam.rotation.x = -Math.PI / 2; foam.position.set(head[0] + ux * 2.2, WATER_LEVEL + 0.05, head[1] + uz * 2.2);
  foam.renderOrder = 3;
  group.add(foam);

  const tmp = new THREE.Vector3();
  return {
    group, fires, runes: runeUniforms, crystals, signs, signSpots,
    update(t) {
      fires.update(t);
      runeUniforms.uTime.value = t;
      wfUniforms.uTime.value = t;
      for (let i = 0; i < crystals.length; i++) {
        const c = crystals[i];
        tmp.copy(c.userData.base); tmp.y += Math.sin(t * 1.2 + i * 1.7) * 0.35;
        c.position.copy(tmp); c.rotation.y = t * 0.6 + i;
      }
    },
  };
}
