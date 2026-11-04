// Procedural wizard model: built only from primitives with toon materials + inverted-hull outlines.
// Model faces +Z in local space; root origin = feet.
import * as THREE from 'three';
import { toonMat, addOutline } from '../core/utils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const COLORS = {
  robe: 0x2f5fb0, robeDark: 0x22447f, teal: 0x2bb0a2, tealDark: 0x1f8077, gold: 0xf4c75c,
  leather: 0x8a5532, leatherDark: 0x5e3720, skin: 0xf9d8bc, blush: 0xf2a39a, hair: 0x7b4b2c,
  eye: 0x2a2340, wood: 0x96643a, woodDark: 0x5f3d22, pants: 0x3c3a5c, boot: 0x5e3c28,
  glass: 0x9ff0ff,
};

const OUT = 0.016;

export function mk(geo, mat, parent, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = false;
  if (opts.outline !== 0) addOutline(m, opts.outline ?? OUT);
  if (opts.pos) m.position.set(...opts.pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.noGhost) m.userData.noGhost = true;
  parent.add(m);
  return m;
}

export function grp(parent, x = 0, y = 0, z = 0, name = '') {
  const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g;
}

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
/** Canvas texture for lathe surfaces (u around, u=0/1 = front; v along profile). */
export function latheTexture(draw, W = 512, H = 256) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  draw(g, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
export function frontPanel(g, W, H, half, border, color, y0 = 0, y1 = H) {
  const hw = half * W, bw = border * W;
  g.fillStyle = hex(color);
  g.fillRect(0, y0, hw, y1 - y0); g.fillRect(W - hw, y0, hw, y1 - y0);
  g.fillStyle = hex(COLORS.gold);
  g.fillRect(hw, y0, bw, y1 - y0); g.fillRect(W - hw - bw, y0, bw, y1 - y0);
}
export function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
export function folds(g, W, H, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * W;
    const gr = g.createLinearGradient(x - W / n / 2, 0, x + W / n / 2, 0);
    gr.addColorStop(0, `rgba(0,0,30,0)`); gr.addColorStop(0.5, `rgba(0,0,30,${alpha})`); gr.addColorStop(1, `rgba(0,0,30,0)`);
    g.fillStyle = gr; g.fillRect(x - W / n / 2, 0, W / n, H);
  }
}
const skirtTexture = () => latheTexture((g, W, H) => {
  g.fillStyle = hex(COLORS.robe); g.fillRect(0, 0, W, H);
  folds(g, W, H, 14, 0.12);
  const hemTop = H * 0.84, bandTop = H * 0.9;
  frontPanel(g, W, H, 0.042, 0.012, COLORS.teal, 0, hemTop);
  // embroidered stars above the hem
  g.fillStyle = 'rgba(244,199,92,0.85)';
  for (let i = 0; i < 16; i++) { const x = (i + 0.5) / 16 * W; if (x < W * 0.07 || x > W * 0.93) continue; star(g, x, H * 0.77 + (i % 2) * 6, 5); }
  g.fillStyle = hex(COLORS.tealDark); g.fillRect(0, hemTop, W, bandTop - hemTop);
  g.fillStyle = hex(COLORS.gold);
  for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, (hemTop + bandTop) / 2); g.lineTo(x + 8, hemTop + 2); g.lineTo(x + 16, (hemTop + bandTop) / 2); g.lineTo(x + 8, bandTop - 2); g.fill(); }
  g.fillRect(0, bandTop, W, H - bandTop);
  g.fillStyle = hex(COLORS.robeDark); g.fillRect(0, hemTop - 3, W, 3);
});
const torsoTexture = () => latheTexture((g, W, H) => {
  g.fillStyle = hex(COLORS.robe); g.fillRect(0, 0, W, H);
  folds(g, W, H, 10, 0.08);
  frontPanel(g, W, H, 0.032, 0.012, COLORS.teal);
  g.fillStyle = hex(COLORS.gold);
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(W * 0.016, H * (0.25 + i * 0.16), 4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(W * 0.984, H * (0.25 + i * 0.16), 4, 0, Math.PI * 2); g.fill(); }
});
const capeletTexture = () => latheTexture((g, W, H) => {
  g.fillStyle = hex(COLORS.teal); g.fillRect(0, 0, W, H);
  folds(g, W, H, 12, 0.1);
  frontPanel(g, W, H, 0.0, 0.016, COLORS.gold);
  const bt = H * 0.8;
  g.fillStyle = hex(COLORS.gold); g.fillRect(0, bt, W, H - bt);
  g.fillStyle = hex(COLORS.tealDark);
  for (let x = 0; x < W; x += 20) { g.beginPath(); g.arc(x + 10, bt + 2, 5, 0, Math.PI); g.fill(); }
  g.fillStyle = 'rgba(255,240,190,0.9)';
  for (let i = 0; i < 12; i++) star(g, (i + 0.5) / 12 * W, H * 0.6, 4);
});

/** Robe skirt that deforms per frame (CPU, ~300 verts). */
class Skirt {
  constructor(parent) {
    const rows = 12, seg = 40;
    const pts = [];
    // bottom (hem) -> top (waist) so lathe normals face outward
    for (let k = rows - 1; k >= 0; k--) {
      const h = k / (rows - 1);
      pts.push(new THREE.Vector2(0.2 + 0.23 * Math.pow(h, 1.25), 0.07 - 0.74 * h));
    }
    const geo = new THREE.LatheGeometry(pts, seg);
    this.geo = geo;
    const pos = geo.attributes.position;
    const n = pos.count;
    this.base = new Float32Array(pos.array);
    this.h = new Float32Array(n); this.s = new Float32Array(n); this.c = new Float32Array(n); this.r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
      const r = Math.hypot(x, z);
      this.r[i] = r; this.s[i] = r > 1e-5 ? x / r : 0; this.c[i] = r > 1e-5 ? z / r : 1;
      this.h[i] = THREE.MathUtils.clamp((0.07 - y) / 0.74, 0, 1);
    }
    // per-vertex angle tables (angle addition at runtime: 6 trig calls per frame instead of ~2000)
    this.s3 = new Float32Array(n); this.c3 = new Float32Array(n); this.s5 = new Float32Array(n); this.c5 = new Float32Array(n);
    this.s2 = new Float32Array(n); this.c2 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ph = Math.atan2(this.s[i], this.c[i]);
      this.s3[i] = Math.sin(ph * 3); this.c3[i] = Math.cos(ph * 3);
      this.s5[i] = Math.sin(ph * 5); this.c5[i] = Math.cos(ph * 5);
      this.s2[i] = Math.sin(ph * 2); this.c2[i] = Math.cos(ph * 2);
    }
    this._sig = NaN; this._settled = 0;
    const mat = toonMat(0xffffff, { map: skirtTexture(), side: THREE.DoubleSide });
    this.mesh = mk(geo, mat, parent, { outline: 0.014 });
    this.mesh.userData.noMerge = true; this.mesh.userData.skin = 'skirt'; this.mesh.userData.noSkin = true; this.mesh.userData.skinDynamic = true;
    this.mesh.frustumCulled = false;
    this.sink = null;
  }
  /** v4 merge: write the deformed positions into the merged rig buffer (vertex offset) with a live-range upload. */
  bindSink(array, offset, attr) { this.sink = { array, offset, attr }; }
  /** legL/legR: leg pitch (neg = forward); vx,vz: model-space velocity; flare 0..1; t time */
  deform(legL, legR, vx, vz, vy, flare, t, flutter) {
    if (!this.mesh.visible || (this.mesh.parent && !this.mesh.parent.visible)) return;
    // the idle wave is tiny: once settled at rest, skip until something moves
    const sig = Math.round(legL * 200) + Math.round(legR * 200) * 7 + Math.round(vx * 20) * 31 + Math.round(vz * 20) * 131 + Math.round(vy * 20) * 17 + Math.round(flare * 100) * 3 + Math.round(flutter * 100) * 11;
    if (sig === this._sig && Math.abs(vx) + Math.abs(vz) + Math.abs(vy) < 0.05 && flare < 0.02 && flutter < 0.02) {
      if (++this._settled > 2 && (this._settled & 3) !== 0) return;   // still animate the idle wave at 1/4 rate
    } else this._settled = 0;
    this._sig = sig;
    const sk = this.sink;
    const p = sk ? sk.array : this.geo.attributes.position.array;
    const o3 = sk ? sk.offset * 3 : 0;
    const n = this.h.length;
    const bx = THREE.MathUtils.clamp(-vx * 0.022, -0.22, 0.22);
    const bz = THREE.MathUtils.clamp(-vz * 0.022, -0.26, 0.22);
    const lift = THREE.MathUtils.clamp(vy * 0.02, -0.12, 0.12) + flare * 0.1;
    const sA = Math.sin(t * 6.5), cA = Math.cos(t * 6.5), sB = Math.sin(t * 10.3), cB = Math.cos(t * 10.3), sC = Math.sin(t * 8), cC = Math.cos(t * 8);
    const fl = 1 + flutter * 4;
    const S = this.s, Cc = this.c, H = this.h, R = this.r, B = this.base, s3 = this.s3, c3 = this.c3, s5 = this.s5, c5 = this.c5, s2 = this.s2, c2 = this.c2;
    for (let i = 0; i < n; i++) {
      const h = H[i]; const s = S[i], c = Cc[i];
      const h2 = h * h, h15 = h * Math.sqrt(h);
      // sin(t*6.5 + 3ph), sin(t*10.3 - 5ph), sin(2ph + t*8) via angle addition
      const wave = (sA * c3[i] + cA * s3[i]) * 0.012 + (sB * c5[i] - cB * s5[i]) * 0.007;
      const rad = 1 + h2 * (wave * fl + flare * 0.32);
      const legPush = (-legL * (0.5 + 0.5 * s) + -legR * (0.5 - 0.5 * s)) * 0.42 * h15;
      const r = R[i] * rad;
      const i3 = o3 + i * 3;
      p[i3] = r * s + bx * h2;
      p[i3 + 2] = r * c + legPush + bz * h2;
      p[i3 + 1] = B[i * 3 + 1] + lift * h2 * (0.6 + 0.4 * (s2[i] * cC + c2[i] * sC) * flutter);
    }
    if (sk) { sk.attr.addUpdateRange(o3, n * 3); sk.attr.needsUpdate = true; }
    else this.geo.attributes.position.needsUpdate = true;
  }
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _glow = null;
export const getGlowTexture = () => (_glow ||= glowTexture());

// ------------------------------------------------------------------ rigid skinning (perf)
// The hero rig is ~140 separate meshes (+ outlines) on many animated pivots. skinMerge() turns it into ONE
// SkinnedMesh per (material, shadow) plus one skinned outline per thickness, whose "bones" are the original part
// meshes themselves (weight 1, geometry in part-local space, identity bind) — so all animation / outfit code keeps
// working on the originals, which stay in the graph for their matrices but are moved to a layer no camera renders.
// Hidden parts (outfit swaps, sword drawn/sheathed, …) are collapsed with a zero bone matrix.
export const HIDDEN_LAYER = 30;
let _skinOutline = null;
function skinOutlineMat(thickness, color) {
  _skinOutline ||= new Map();
  const key = thickness.toFixed(4) + ':' + color.getHexString();
  let m = _skinOutline.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { thickness: { value: thickness }, color: { value: color.clone() } }]),
    vertexShader: /* glsl */`
      uniform float thickness;
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      void main() {
        #include <beginnormal_vertex>
        vec3 transformed = position + normalize(objectNormal) * thickness;
        #include <skinbase_vertex>
        #include <skinning_vertex>
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide, fog: true,
  });
  _skinOutline.set(key, m);
  return m;
}
export function skinMerge(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  const _ws = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.name === 'outline' || o.userData.noSkin) return;
    if (Array.isArray(o.material) || !o.material || o.morphTargetInfluences) return;
    if (!o.geometry?.attributes?.position || !o.geometry.attributes.normal) return;
    parts.push(o);
  });
  if (!parts.length) return null;
  const bones = parts;
  const ident = new THREE.Matrix4();
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  // zero the matrices of effectively hidden parts (visibility chain up to the root)
  const baseUpdate = skeleton.update.bind(skeleton);
  const boneVis = new Uint8Array(bones.length);
  const meshBones = [];   // [mesh, Uint16Array bone indices]: a merged mesh whose bones are ALL hidden is not drawn
  skeleton.update = function () {
    baseUpdate();
    const bm = this.boneMatrices;
    for (let i = 0; i < bones.length; i++) {
      let vis = true;
      for (let p = bones[i]; p && p !== root; p = p.parent) if (!p.visible) { vis = false; break; }
      boneVis[i] = vis ? 1 : 0;
      if (!vis) bm.fill(0, i * 16, i * 16 + 16);
    }
    if (this.boneTexture) this.boneTexture.needsUpdate = true;
    // the other classes' gear stays merged in (zero-matrix collapse) but must not cost a draw call each
    let any = false;
    for (let k = 0; k < meshBones.length; k++) {
      const mb = meshBones[k], ids = mb[1];
      let v = false;
      for (let j = 0; j < ids.length; j++) if (boneVis[ids[j]]) { v = true; break; }
      mb[2] = v; if (v) any = true;
    }
    for (let k = 0; k < meshBones.length; k++) meshBones[k][0].visible = !any || meshBones[k][2];
  };
  const prep = (o, bi) => {
    let g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return g;
  };
  const mkSkinned = (geo, mat) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bindMode = THREE.AttachedBindMode;
    m.bind(skeleton, ident);
    m.frustumCulled = false;
    m.raycast = () => {};
    m.userData.noGhost = true; m.userData.skinMerged = true;
    root.add(m);
    return m;
  };
  const byMat = new Map(), byOutline = new Map();
  parts.forEach((o, bi) => {
    const g = prep(o, bi);
    // one draw per material: shadow casters and non-casters of the same material merge (the merged mesh casts),
    // which halves the rig's main-pass calls for parts split only by castShadow
    const key = o.material.uuid + '|' + (o.renderOrder || 0);
    if (!byMat.has(key)) byMat.set(key, { mat: o.material, shadow: false, ro: o.renderOrder || 0, geos: [], bones: [] });
    const B = byMat.get(key); B.geos.push(g); B.bones.push(bi); if (o.castShadow) B.shadow = true;
    const ol = o.children.find((c) => c.name === 'outline');
    if (ol) {
      o.geometry.boundingSphere || o.geometry.computeBoundingSphere();
      o.getWorldScale(_ws);
      const big = o.geometry.boundingSphere.radius * Math.max(_ws.x, _ws.y, _ws.z) >= 0.06;
      const th = ol.material.uniforms?.thickness?.value;
      const col = ol.material.uniforms?.color?.value;
      if (big && th && col) {
        const ok = th.toFixed(4) + col.getHexString();
        if (!byOutline.has(ok)) byOutline.set(ok, { th, col, geos: [], bones: [] });
        byOutline.get(ok).geos.push(g); byOutline.get(ok).bones.push(bi);
      }
      ol.layers.set(HIDDEN_LAYER);
    }
    o.layers.set(HIDDEN_LAYER);
  });
  const meshes = [];
  for (const b of byMat.values()) {
    const geo = mergeGeometries(b.geos, false); if (!geo) continue;
    const m = mkSkinned(geo, b.mat); m.castShadow = b.shadow; m.receiveShadow = false; m.renderOrder = b.ro;
    meshes.push(m); meshBones.push([m, Uint16Array.from(b.bones), true]);
  }
  for (const b of byOutline.values()) {
    const geo = mergeGeometries(b.geos, false); if (!geo) continue;
    const m = mkSkinned(geo, skinOutlineMat(b.th, b.col)); m.name = 'outline'; m.castShadow = false; m.receiveShadow = false;
    meshes.push(m); meshBones.push([m, Uint16Array.from(b.bones), true]);
  }
  return { skeleton, meshes, parts };
}

/** Merge sibling meshes that share a material (and outline) into one mesh to cut draw calls. */
export function mergeStatic(root) {
  const parents = [];
  root.traverse((o) => { if (!o.isMesh) parents.push(o); });
  for (const parent of parents) {
    const buckets = new Map();
    for (const ch of parent.children) {
      if (!ch.isMesh || ch.userData.noMerge || ch.userData.noGhost) continue;
      if (!ch.children.every((c) => c.name === 'outline')) continue;
      const ol = ch.children[0];
      const key = ch.material.uuid + '|' + (ol ? ol.material.uniforms.thickness.value : 0) + '|' + ch.castShadow;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(ch);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        let g = m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (g.index) g = g.toNonIndexed();
        g.morphAttributes = {};
        return g.applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const first = list[0];
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.castShadow = first.castShadow;
      const ol = first.children[0];
      if (ol) addOutline(mesh, ol.material.uniforms.thickness.value);
      for (const m of list) parent.remove(m);
      parent.add(mesh);
    }
  }
}

export function buildWizard() {
  const M = {
    robe: toonMat(COLORS.robe), robeDark: toonMat(COLORS.robeDark), teal: toonMat(COLORS.teal),
    tealDS: toonMat(COLORS.teal, { side: THREE.DoubleSide }), gold: toonMat(COLORS.gold, { emissive: 0x3a2800 }),
    leather: toonMat(COLORS.leather), leatherDark: toonMat(COLORS.leatherDark), skin: toonMat(COLORS.skin),
    hair: toonMat(COLORS.hair), hairDS: toonMat(COLORS.hair, { side: THREE.DoubleSide }),
    eye: new THREE.MeshBasicMaterial({ color: COLORS.eye }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blush: new THREE.MeshBasicMaterial({ color: COLORS.blush, transparent: true, opacity: 0.55, depthWrite: false }),
    wood: toonMat(COLORS.wood), woodDark: toonMat(COLORS.woodDark), pants: toonMat(COLORS.pants),
    boot: toonMat(COLORS.boot), glass: toonMat(COLORS.glass, { transparent: true, opacity: 0.8, emissive: 0x135560 }),
    hatDS: toonMat(COLORS.robeDark, { side: THREE.DoubleSide }),
  };

  const root = new THREE.Group(); root.name = 'wizard';
  const body = grp(root, 0, 0, 0, 'body');           // squash / lean / death pivot (feet)
  const hips = grp(body, 0, 0.92, 0, 'hips');
  const rig = { root, body, hips, materials: M };

  // ---------- legs ----------
  const legGeo = new THREE.CylinderGeometry(0.068, 0.058, 0.44, 10); legGeo.translate(0, -0.22, 0);
  const shinGeo = new THREE.CylinderGeometry(0.056, 0.05, 0.38, 10); shinGeo.translate(0, -0.19, 0);
  const shaftGeo = new THREE.CylinderGeometry(0.072, 0.064, 0.17, 12); shaftGeo.translate(0, 0.02, 0);
  const cuffGeo = new THREE.TorusGeometry(0.074, 0.018, 6, 14); cuffGeo.rotateX(Math.PI / 2);
  const footGeo = new THREE.SphereGeometry(0.075, 12, 8); footGeo.scale(0.95, 0.62, 1.55);
  const soleGeo = new THREE.CylinderGeometry(0.07, 0.072, 0.03, 12); soleGeo.scale(1, 1, 1.6);
  for (const side of [1, -1]) {
    const leg = grp(hips, side * 0.095, 0, 0, side > 0 ? 'legL' : 'legR');
    mk(legGeo, M.pants, leg);
    const knee = grp(leg, 0, -0.44, 0);
    mk(shinGeo, M.pants, knee);
    const ankle = grp(knee, 0, -0.38, 0);
    mk(shaftGeo, M.boot, ankle, { pos: [0, 0.04, 0] });
    mk(cuffGeo, M.leather, ankle, { pos: [0, 0.135, 0], outline: 0.01 });
    mk(footGeo, M.boot, ankle, { pos: [0, -0.04, 0.045] });
    mk(soleGeo, M.leatherDark, ankle, { pos: [0, -0.078, 0.05], outline: 0.008 });
    if (side > 0) { rig.legL = leg; rig.kneeL = knee; rig.ankleL = ankle; } else { rig.legR = leg; rig.kneeR = knee; rig.ankleR = ankle; }
  }

  // ---------- skirt ----------
  rig.skirt = new Skirt(hips);

  // ---------- torso ----------
  const torso = grp(hips, 0, 0, 0, 'torso');
  rig.torso = torso;
  const torsoPts = [[0.205, -0.02], [0.215, 0.1], [0.218, 0.22], [0.2, 0.34], [0.165, 0.44], [0.11, 0.5], [0.06, 0.53]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torsoGeo = new THREE.LatheGeometry(torsoPts, 32);
  const torsoMesh = mk(torsoGeo, toonMat(0xffffff, { map: torsoTexture() }), torso, { scale: [1.12, 1, 0.88] });
  torsoMesh.userData.noMerge = true; torsoMesh.userData.skin = 'torso';

  // capelet / mantle over the shoulders
  const capeletPts = [[0.3, 0.25], [0.285, 0.3], [0.245, 0.38], [0.18, 0.46], [0.12, 0.51], [0.085, 0.55]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const capeletGeo = new THREE.LatheGeometry(capeletPts, 32);
  rig.capelet = mk(capeletGeo, toonMat(0xffffff, { map: capeletTexture(), side: THREE.DoubleSide }), torso, { scale: [1.16, 1, 1.0] });
  rig.capelet.userData.noMerge = true;
  // collar
  mk(new THREE.TorusGeometry(0.085, 0.024, 8, 18), M.gold, torso, { pos: [0, 0.55, 0], rot: [Math.PI / 2, 0, 0], outline: 0.01 });
  // gem brooch on chest
  rig.brooch = mk(new THREE.OctahedronGeometry(0.03), new THREE.MeshBasicMaterial({ color: 0x9ef7ff }), torso, { pos: [0, 0.45, 0.2], scale: [1, 1.3, 0.6], outline: 0.008 });
  rig.brooch.userData.noMerge = true;

  // belt + pouches + vial
  mk(new THREE.TorusGeometry(0.212, 0.03, 8, 28), M.leather, torso, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1.12, 0.9, 1], outline: 0.012 });
  mk(new THREE.BoxGeometry(0.075, 0.065, 0.025), M.gold, torso, { pos: [0, 0.03, 0.195], outline: 0.008 });
  const pouchGeo = new THREE.BoxGeometry(0.09, 0.1, 0.065, 1, 1, 1);
  const flapGeo = new THREE.BoxGeometry(0.096, 0.035, 0.072);
  for (const [x, z, ry] of [[0.2, 0.08, 0.9], [-0.215, -0.02, -1.4]]) {
    const pg = grp(torso, x, -0.03, z); pg.rotation.y = ry;
    mk(pouchGeo, M.leather, pg, { outline: 0.01 });
    mk(flapGeo, M.leatherDark, pg, { pos: [0, 0.04, 0.005], outline: 0.008 });
    mk(new THREE.SphereGeometry(0.01, 6, 4), M.gold, pg, { pos: [0, 0.03, 0.04], outline: 0 });
  }
  const vial = grp(torso, 0.12, -0.04, -0.17); rig.vial = vial;
  mk(new THREE.SphereGeometry(0.038, 10, 8), M.glass, vial, { outline: 0.008 });
  mk(new THREE.CylinderGeometry(0.014, 0.016, 0.04, 8), M.glass, vial, { pos: [0, 0.045, 0], outline: 0 });
  mk(new THREE.CylinderGeometry(0.016, 0.014, 0.022, 8), M.woodDark, vial, { pos: [0, 0.072, 0], outline: 0 });

  // ---------- arms ----------
  const upperGeo = new THREE.CylinderGeometry(0.07, 0.062, 0.28, 10); upperGeo.translate(0, -0.13, 0);
  const sleeveGeo = new THREE.CylinderGeometry(0.064, 0.112, 0.25, 14, 1, true); sleeveGeo.translate(0, -0.12, 0);
  const cuffRing = new THREE.TorusGeometry(0.108, 0.016, 6, 16); cuffRing.rotateX(Math.PI / 2);
  const wristGeo = new THREE.CylinderGeometry(0.035, 0.038, 0.12, 8); wristGeo.translate(0, -0.17, 0);
  const handGeo = new THREE.SphereGeometry(0.052, 12, 10); handGeo.scale(0.95, 1.1, 0.85);
  const thumbGeo = new THREE.SphereGeometry(0.022, 8, 6); thumbGeo.scale(1, 1.4, 1);
  const sleeveMat = toonMat(COLORS.robe, { side: THREE.DoubleSide });
  for (const side of [1, -1]) {
    const arm = grp(torso, side * 0.235, 0.42, 0, side > 0 ? 'armL' : 'armR');
    mk(new THREE.SphereGeometry(0.075, 12, 8), M.robe, arm, { outline: 0.012 });
    mk(upperGeo, M.robe, arm);
    const elbow = grp(arm, 0, -0.27, 0);
    mk(new THREE.SphereGeometry(0.062, 10, 8), M.robe, elbow, { outline: 0 });
    mk(sleeveGeo, sleeveMat, elbow, { outline: 0.012 });
    mk(cuffRing, M.gold, elbow, { pos: [0, -0.24, 0], outline: 0.008 });
    mk(wristGeo, M.skin, elbow, { outline: 0 });
    const hand = grp(elbow, 0, -0.27, 0);
    mk(handGeo, M.skin, hand, { outline: 0.01 });
    mk(thumbGeo, M.skin, hand, { pos: [side * -0.035, 0.012, 0.035], rot: [0.4, 0, side * 0.5], outline: 0.008 });
    if (side > 0) { rig.armL = arm; rig.elbowL = elbow; rig.handL = hand; } else { rig.armR = arm; rig.elbowR = elbow; rig.handR = hand; }
  }

  // ---------- head ----------
  mk(new THREE.CylinderGeometry(0.05, 0.058, 0.14, 10), M.skin, torso, { pos: [0, 0.57, 0], outline: 0 });
  const head = grp(torso, 0, 0.67, 0.0, 'head');
  rig.head = head;
  mk(new THREE.SphereGeometry(0.155, 22, 16), M.skin, head, { scale: [1, 1.04, 0.98], outline: 0.014 });
  // jaw / chin softness
  mk(new THREE.SphereGeometry(0.1, 14, 10), M.skin, head, { pos: [0, -0.07, 0.04], scale: [1.05, 0.8, 1], outline: 0 });
  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.026, 12, 10);
  const hlGeo = new THREE.SphereGeometry(0.008, 6, 4);
  const browGeo = new THREE.BoxGeometry(0.05, 0.011, 0.012);
  rig.eyes = [];
  for (const side of [1, -1]) {
    const eye = mk(eyeGeo, M.eye, head, { pos: [side * 0.056, -0.005, 0.138], scale: [0.78, 1.3, 0.5], outline: 0, shadow: false });
    mk(hlGeo, M.white, eye, { pos: [0.25, 0.35, 0.7], outline: 0, shadow: false });
    rig.eyes.push(eye);
    mk(browGeo, M.hair, head, { pos: [side * 0.058, 0.05, 0.142], rot: [0, side * 0.2, side * -0.12], outline: 0, shadow: false });
    mk(new THREE.SphereGeometry(0.024, 8, 6), M.blush, head, { pos: [side * 0.09, -0.05, 0.12], scale: [1.2, 0.6, 0.4], outline: 0, shadow: false });
    // elf ears
    const ear = new THREE.ConeGeometry(0.032, 0.12, 8); ear.translate(0, 0.06, 0);
    mk(ear, M.skin, head, { pos: [side * 0.145, 0.0, -0.01], rot: [-0.35, 0, side * -1.15], scale: [1, 1, 0.5], outline: 0.008 });
  }
  mk(new THREE.SphereGeometry(0.017, 8, 6), M.skin, head, { pos: [0, -0.035, 0.153], outline: 0 });
  mk(new THREE.TorusGeometry(0.018, 0.005, 4, 10, Math.PI), M.eye, head, { pos: [0, -0.075, 0.142], rot: [0, 0, Math.PI], outline: 0, shadow: false });
  // hair: back cap + top cap + bangs + side locks
  mk(new THREE.SphereGeometry(0.168, 18, 12, Math.PI, Math.PI, 0, Math.PI * 0.78), M.hairDS, head, { pos: [0, 0.01, -0.01], outline: 0.012 });
  mk(new THREE.SphereGeometry(0.166, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.34), M.hair, head, { pos: [0, 0.012, 0], outline: 0 });
  const tuft = new THREE.ConeGeometry(0.04, 0.12, 6); tuft.rotateX(Math.PI);
  for (const [x, rz, s] of [[-0.075, -0.35, 1], [-0.02, -0.1, 1.15], [0.035, 0.15, 1.05], [0.085, 0.4, 0.9]]) {
    mk(tuft, M.hair, head, { pos: [x, 0.08, 0.125], rot: [-0.45, 0, rz], scale: [s, s, s * 0.7], outline: 0.008 });
  }
  for (const side of [1, -1]) {
    mk(new THREE.ConeGeometry(0.045, 0.2, 6).rotateX(Math.PI), M.hair, head, { pos: [side * 0.13, -0.05, 0.04], rot: [-0.1, 0, side * 0.15], scale: [0.8, 1, 0.6], outline: 0.008 });
  }
  // short ponytail at back
  mk(new THREE.ConeGeometry(0.06, 0.24, 7).rotateX(Math.PI), M.hair, head, { pos: [0, -0.1, -0.15], rot: [0.5, 0, 0], outline: 0.01 });

  // ---------- hat ----------
  const hat = grp(head, 0, 0.095, -0.01, 'hat');
  hat.rotation.set(-0.14, 0, 0.06);
  rig.hat = hat;
  const brimPts = [[0.18, 0.0], [0.29, -0.012], [0.39, -0.04], [0.45, -0.072], [0.462, -0.058], [0.41, -0.022], [0.3, 0.01], [0.18, 0.024]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const brim = mk(new THREE.LatheGeometry(brimPts, 36), toonMat(COLORS.robeDark, { side: THREE.DoubleSide }), hat, { outline: 0.012 });
  brim.scale.set(1, 1, 0.96);
  const band = new THREE.CylinderGeometry(0.192, 0.205, 0.07, 22, 1, true);
  mk(band, toonMat(COLORS.teal, { side: THREE.DoubleSide }), hat, { pos: [0, 0.045, 0], outline: 0.01 });
  mk(new THREE.BoxGeometry(0.06, 0.055, 0.02), M.gold, hat, { pos: [0, 0.045, 0.2], outline: 0.008 });
  const segs = [[0.188, 0.15, 0.2], [0.15, 0.108, 0.18], [0.108, 0.066, 0.17], [0.066, 0.022, 0.17], [0.022, 0.0, 0.1]];
  rig.hatSegs = [];
  let parent = grp(hat, 0, 0.02, 0);
  for (let i = 0; i < segs.length; i++) {
    const [rb, rt, h] = segs[i];
    const g = new THREE.CylinderGeometry(rt, rb, h, 18, 1, rt === 0); g.translate(0, h / 2, 0);
    const seg = grp(parent, 0, 0, 0);
    mk(g, M.robeDark, seg, { outline: 0.012 });
    if (i === 1) mk(new THREE.OctahedronGeometry(0.03), M.gold, seg, { pos: [0.0, 0.08, 0.128], scale: [1, 1.2, 0.5], outline: 0.006 });
    rig.hatSegs.push(seg);
    parent = grp(seg, 0, h, 0);
  }
  mk(new THREE.SphereGeometry(0.025, 8, 6), M.gold, parent, { outline: 0.006 });

  // ---------- staff (held in right hand) ----------
  const staff = grp(rig.handR, 0, 0, 0, 'staff');
  rig.staff = staff;
  const shaft = new THREE.CylinderGeometry(0.022, 0.03, 1.72, 8, 6);
  { // gentle gnarl
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) + Math.sin(y * 5.1) * 0.008);
      p.setZ(i, p.getZ(i) + Math.cos(y * 3.7) * 0.008);
    }
    shaft.computeVertexNormals();
  }
  shaft.translate(0, 0.23, 0);
  mk(shaft, M.wood, staff, { outline: 0.012 });
  mk(new THREE.CylinderGeometry(0.036, 0.036, 0.17, 10), M.leather, staff, { pos: [0, -0.02, 0], outline: 0.01 });
  for (const y of [0.8, 0.94]) mk(new THREE.TorusGeometry(0.03, 0.009, 6, 12), M.gold, staff, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0.006 });
  mk(new THREE.ConeGeometry(0.034, 0.08, 8).rotateX(Math.PI), M.gold, staff, { pos: [0, -0.66, 0], outline: 0.008 });
  mk(new THREE.SphereGeometry(0.05, 10, 8), M.woodDark, staff, { pos: [0, 1.08, 0], scale: [1, 0.8, 1], outline: 0.01 });
  // curled prongs cradling the crystal
  const GEM_Y = 1.22;
  const prong = new THREE.TorusGeometry(0.088, 0.013, 6, 16, Math.PI * 0.95);
  for (let i = 0; i < 3; i++) {
    const pg = grp(staff, 0, GEM_Y, 0); pg.rotation.y = (i / 3) * Math.PI * 2;
    mk(prong, M.woodDark, pg, { rot: [0, 0, -Math.PI / 2], outline: 0.006 });
    mk(new THREE.SphereGeometry(0.016, 6, 4), M.gold, pg, { pos: [-0.012, 0.087, 0], outline: 0 });
  }
  // gem
  const gemPivot = grp(staff, 0, GEM_Y, 0, 'gem');
  rig.gemPivot = gemPivot;
  rig.gemMat = new THREE.MeshBasicMaterial({ color: 0xff8844 });
  rig.gem = mk(new THREE.OctahedronGeometry(0.068, 0), rig.gemMat, gemPivot, { scale: [1, 1.55, 1], outline: 0.008, shadow: false });
  rig.gemCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  rig.gemCore = mk(new THREE.SphereGeometry(0.03, 10, 8), rig.gemCoreMat, gemPivot, { outline: 0, shadow: false });
  rig.haloMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff8844, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  rig.halo = new THREE.Sprite(rig.haloMat); rig.halo.scale.setScalar(0.55); rig.halo.userData.noGhost = true;
  gemPivot.add(rig.halo);
  // no realtime light for the gem (perf: every lit fragment loops all point lights) — emissive + bloom halo.
  // Light-like stand-in so callers can keep setting color/intensity/distance.
  rig.light = { color: new THREE.Color(0xff8844), intensity: 0, distance: 6, userData: { noGhost: true } };
  rig.motes = [];
  const moteGeo = new THREE.OctahedronGeometry(0.016);
  rig.moteMat = new THREE.MeshBasicMaterial({ color: 0xffaa66, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const MOTES = 5;   // gem motes (tinted at runtime through rig.moteMat = elColor of the attuned element)
  for (let i = 0; i < MOTES; i++) {
    const m = new THREE.Mesh(moteGeo, rig.moteMat); m.userData.noGhost = true; gemPivot.add(m); rig.motes.push(m);
  }

  for (const o of [rig.gem, rig.gemCore, ...rig.motes]) o.userData.noMerge = true;
  mergeStatic(root);
  // tag recolorable meshes (class outfits swap colors/maps by tag; materials may be cloned later by vfx.flashEntity)
  root.traverse((o) => {
    if (!o.isMesh || o.name === 'outline') return;
    if (o.material === M.robe || o.material === sleeveMat) o.userData.skin = 'robe';
  });
  rig.textures = { torso: torsoTexture, skirt: skirtTexture };
  // tiny trims don't need to cast shadows (saves shadow-pass draw calls)
  const _ws = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.name === 'outline') return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(_ws);
    if (o.geometry.boundingSphere.radius * Math.max(_ws.x, _ws.y, _ws.z) < 0.08) o.castShadow = false;
  });

  // cape anchors (torso local), left->right of the character's back
  rig.capeAnchors = [];
  const CAPE_COLS = 5;
  for (let i = 0; i < CAPE_COLS; i++) {
    const u = i / (CAPE_COLS - 1) * 2 - 1;
    rig.capeAnchors.push(new THREE.Vector3(u * 0.25, 0.43 - Math.abs(u) * 0.04, -0.16 - (1 - u * u) * 0.05));
  }
  return rig;
}
