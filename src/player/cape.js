// Verlet cloth cape: a grid of points pinned to the wizard's shoulders, simulated in world space.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { COLORS } from './model.js';

function capeTexture() {
  const W = 128, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hex(COLORS.robeDark)); grad.addColorStop(1, hex(COLORS.robe));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // teal inner band + gold border
  g.fillStyle = hex(COLORS.teal); g.fillRect(0, H - 34, W, 16);
  g.fillStyle = hex(COLORS.gold); g.fillRect(0, H - 18, W, 18);
  g.fillRect(0, 0, 7, H); g.fillRect(W - 7, 0, 7, H);
  // zigzag trim
  g.fillStyle = hex(COLORS.gold);
  for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, H - 34); g.lineTo(x + 8, H - 44); g.lineTo(x + 16, H - 34); g.fill(); }
  // emblem: star in circle
  g.strokeStyle = hex(COLORS.gold); g.lineWidth = 4;
  g.beginPath(); g.arc(W / 2, H * 0.45, 26, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 21;
    g.lineTo(W / 2 + Math.cos(a) * r, H * 0.45 + Math.sin(a) * r);
  }
  g.closePath(); g.fillStyle = hex(COLORS.gold); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STEP = 1 / 60;

export class Cape {
  constructor(scene, anchorObj, anchorsLocal, rows = 9, segLen = 0.115) {
    this.anchorObj = anchorObj; this.anchorsLocal = anchorsLocal;
    this.cols = anchorsLocal.length; this.rows = rows; this.segLen = segLen;
    const n = this.cols * rows;
    this.cur = new Float32Array(n * 3); this.prev = new Float32Array(n * 3);
    this.restW = [];
    for (let c = 0; c < this.cols - 1; c++) this.restW.push(anchorsLocal[c].distanceTo(anchorsLocal[c + 1]));
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3); this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    const uv = new Float32Array(n * 2), idx = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c; uv[i * 2] = c / (this.cols - 1); uv[i * 2 + 1] = 1 - r / (rows - 1);
      if (r < rows - 1 && c < this.cols - 1) { const a = i, b = i + 1, d = i + this.cols, e = d + 1; idx.push(a, d, b, b, d, e); }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, toonMat(0xffffff, { map: capeTexture(), side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    scene.add(this.mesh);
    this._a = new THREE.Vector3(); this._inv = new THREE.Matrix4(); this._v = new THREE.Vector3();
    this.acc = 0; this.ready = false; this.t = 0;
  }
  _anchor(c, out) { return out.copy(this.anchorsLocal[c]).applyMatrix4(this.anchorObj.matrixWorld); }
  reset() {
    this.anchorObj.updateWorldMatrix(true, false);
    for (let c = 0; c < this.cols; c++) {
      this._anchor(c, this._a);
      for (let r = 0; r < this.rows; r++) {
        const i = (r * this.cols + c) * 3;
        this.cur[i] = this.prev[i] = this._a.x;
        this.cur[i + 1] = this.prev[i + 1] = this._a.y - r * this.segLen;
        this.cur[i + 2] = this.prev[i + 2] = this._a.z;
      }
    }
    this.ready = true;
    this.settle = 3; // re-seed from the live pose for the first frames (pose/facing snaps right after spawn)
    this._anchor(0, this._lastA || (this._lastA = new THREE.Vector3()));
  }
  /** Rigidly translate all points (for teleports). */
  shift(dx, dy, dz) {
    for (let i = 0; i < this.cur.length; i += 3) {
      this.cur[i] += dx; this.cur[i + 1] += dy; this.cur[i + 2] += dz;
      this.prev[i] += dx; this.prev[i + 1] += dy; this.prev[i + 2] += dz;
    }
  }
  update(dt, groundAt, wind, flutter = 0) {
    if (!this.ready) this.reset();
    this.anchorObj.updateWorldMatrix(true, false); // fresh pose (parents included) even when no render happened
    // snap detection: re-seed hanging straight down instead of whipping after teleports / pose snaps
    const a0 = this._anchor(0, this._a0 || (this._a0 = new THREE.Vector3()));
    const jumped = a0.distanceTo(this._lastA) > 0.3;
    if (this.settle > 0 || jumped) { const s = this.settle; this.reset(); this.settle = Math.max(0, s - 1); }
    this._lastA.copy(a0);
    this.acc = Math.min(this.acc + dt, STEP * 3);
    const inv = this._inv.copy(this.anchorObj.matrixWorld).invert();
    const m = this.anchorObj.matrixWorld;
    const { cur, prev, cols, rows } = this;
    while (this.acc >= STEP) {
      this.acc -= STEP; this.t += STEP;
      const gx = wind.x + Math.sin(this.t * 2.3) * 0.6 * (1 + flutter);
      const gz = wind.z + Math.cos(this.t * 1.7) * 0.5 * (1 + flutter);
      const s2 = STEP * STEP;
      for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const fl = flutter * Math.sin(this.t * 17 + r * 1.3 + c * 0.7) * 3;
        for (let k = 0; k < 3; k++) {
          const x = cur[i + k], v = (x - prev[i + k]) * 0.975;
          prev[i + k] = x;
          const a = k === 0 ? gx : k === 1 ? -9.8 + fl : gz;
          cur[i + k] = x + v + a * s2 * (k === 1 ? 1 : (0.5 + r / rows));
        }
      }
      // pin top row
      for (let c = 0; c < cols; c++) {
        this._anchor(c, this._a);
        cur[c * 3] = prev[c * 3] = this._a.x; cur[c * 3 + 1] = prev[c * 3 + 1] = this._a.y; cur[c * 3 + 2] = prev[c * 3 + 2] = this._a.z;
      }
      for (let it = 0; it < 8; it++) {
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
          this._link((r - 1) * cols + c, r * cols + c, this.segLen, r === 1);
          if (c < cols - 1) this._link(r * cols + c, r * cols + c + 1, this.restW[c] * (1 + 0.08 * r / rows), false);
        }
        // long-range tether: each point stays within r*segLen of its column anchor (cape can never float/stiffen)
        for (let c = 0; c < cols; c++) {
          const ax = cur[c * 3], ay = cur[c * 3 + 1], az = cur[c * 3 + 2];
          for (let r = 2; r < rows; r++) {
            const i = (r * cols + c) * 3;
            const dx = cur[i] - ax, dy = cur[i + 1] - ay, dz = cur[i + 2] - az;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz), mx = r * this.segLen * 1.02;
            if (d > mx) { const k = mx / d; cur[i] = ax + dx * k; cur[i + 1] = ay + dy * k; cur[i + 2] = az + dz * k; }
          }
        }
        // body collision in torso-local space: keep cape outside the robe silhouette
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 3;
          const v = this._v.set(cur[i], cur[i + 1], cur[i + 2]).applyMatrix4(inv);
          const y = v.y;
          if (y > 0.6 || y < -0.95) continue;
          const depth = y > 0 ? 0 : Math.min(1, -y / 0.72);
          const rad = (y > 0 ? 0.24 : 0.25 + 0.24 * Math.pow(depth, 1.25)) ;
          const rx = v.x / 1.1, rz = v.z;
          const d = Math.hypot(rx, rz);
          let moved = false;
          if (d < rad) {
            const k = rad / Math.max(d, 1e-4);
            if (d < 1e-4) { v.z = -rad; } else { v.x *= k; v.z *= k; }
            moved = true;
          }
          if (v.z > -0.12) { v.z = -0.12; moved = true; }
          if (moved) {
            // position-only correction: shift prev too so collision pushes don't inject velocity (no whip / float)
            v.applyMatrix4(m);
            prev[i] += v.x - cur[i]; prev[i + 1] += v.y - cur[i + 1]; prev[i + 2] += v.z - cur[i + 2];
            cur[i] = v.x; cur[i + 1] = v.y; cur[i + 2] = v.z;
          }
        }
      }
      for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const gy = groundAt(cur[i], cur[i + 2]) + 0.03;
        if (cur[i + 1] < gy) cur[i + 1] = gy;
      }
    }
    this.posAttr.array.set(cur);
    this.posAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  _link(a, b, rest, pinA) {
    const { cur } = this; a *= 3; b *= 3;
    const dx = cur[b] - cur[a], dy = cur[b + 1] - cur[a + 1], dz = cur[b + 2] - cur[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const diff = (d - rest) / d;
    if (pinA) { cur[b] -= dx * diff; cur[b + 1] -= dy * diff; cur[b + 2] -= dz * diff; return; }
    const h = diff * 0.5;
    cur[a] += dx * h; cur[a + 1] += dy * h; cur[a + 2] += dz * h;
    cur[b] -= dx * h; cur[b + 1] -= dy * h; cur[b + 2] -= dz * h;
  }
}
