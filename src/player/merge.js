// Player rig merge v4 (PLAN §2.6 player budget: ≤ 8 scene + ≤ 4 shadow calls, ≤ 30k tris, ≤ 6k shadow tris for every class).
//
// The hero rig is ~300 primitive part meshes on animated pivots, with every class's gear built in (hidden per outfit).
// mergeRig() keeps the parts as the BONES of one skeleton (weight 1, part-local geometry, identity bind; animation and
// outfit code keep working on the originals, which move to a layer no camera renders) and draws them as:
//   body     ONE SkinnedMesh, ONE toon material: vertex colours + a per-vertex emissive (vec4: rgb, w = colour slot) + one
//            canvas atlas for the textured parts (torso, skirt, capelet, cape). Double-sided parts get a flipped copy.
//            Slots 1–3 take their colour from uniforms (staff gem, gem motes, weapon gems: element tints change at runtime).
//   outline  ONE skinned inverted hull sharing the body's vertex buffers (own index, per-vertex thickness).
//   shadow   ONE decimated proxy (vertex clustering per part) that only casts: its main-pass draw is collapsed outside the
//            clip volume in the vertex shader (no fragments), the shadow pass uses the default depth material.
// The draw index holds only the triangles of parts that are (or were since the last outfit change) visible, so hidden
// class gear costs neither triangles nor vertex work; parts hidden later collapse through a zero bone matrix.
// The robe skirt (CPU deform) and the verlet cape (world space, an identity bone) write straight into the merged
// position / normal buffers with addUpdateRange (live ranges only).
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';

export const HIDDEN_LAYER = 30;
const GUT = 8;                 // atlas gutter (texels), filled with wrapped / clamped edges
const PROXY_CELL = 0.045;      // shadow proxy clustering cell (metres, world scale)
const OUTLINE_COLOR = 0x1a1410;

const _ws = new THREE.Vector3();

/** Vertex-clustering decimation of one triangle list (part-local positions) → {pos:Float32Array, nrm, idx:number[]}. */
function decimate(P, N, idx, cell) {
  const map = new Map(), sums = [], nrm = [];
  const id = new Int32Array(P.length / 3);
  for (let i = 0; i < id.length; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const key = ((Math.floor(x / cell) + 512) * 1024 + (Math.floor(y / cell) + 512)) * 1024 + (Math.floor(z / cell) + 512);
    let k = map.get(key);
    if (k === undefined) { k = sums.length / 4; map.set(key, k); sums.push(0, 0, 0, 0); nrm.push(N ? N[i * 3] : 0, N ? N[i * 3 + 1] : 1, N ? N[i * 3 + 2] : 0); }
    sums[k * 4] += x; sums[k * 4 + 1] += y; sums[k * 4 + 2] += z; sums[k * 4 + 3]++;
    id[i] = k;
  }
  const out = [], seen = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = id[idx[t]], b = id[idx[t + 1]], c = id[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
    const key = (lo * 4096 + mid) * 4096 + hi;
    if (seen.has(key)) continue;
    seen.add(key); out.push(a, b, c);
  }
  const n = sums.length / 4, pos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { const w = sums[k * 4 + 3] || 1; pos[k * 3] = sums[k * 4] / w; pos[k * 3 + 1] = sums[k * 4 + 1] / w; pos[k * 3 + 2] = sums[k * 4 + 2] / w; }
  return { pos, nrm: Float32Array.from(nrm), idx: out };
}

function bodyMaterial(atlas, slots, flash) {
  const m = toonMat(0xffffff, { map: atlas, vertexColors: true });
  m.name = 'player-body';
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uSlot = slots; sh.uniforms.uFlash = flash;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aEm;\nvarying vec4 vEm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = aEm;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSlot[4];\nuniform vec3 uFlash;\nvarying vec4 vEm;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        int sl = int(vEm.w + 0.5);
        vec3 em = vEm.rgb;
        if (sl == 1) em = uSlot[1]; else if (sl == 2) em = uSlot[2]; else if (sl == 3) em = uSlot[3];
        if (sl > 0) diffuseColor.rgb = vec3(0.0);
        totalEmissiveRadiance += em + uFlash;
      }`);
  };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|playerBody'; };
  return m;
}

function outlineMaterial(color) {
  return new THREE.ShaderMaterial({
    name: 'player-outline',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { color: { value: new THREE.Color(color) } }]),
    vertexShader: /* glsl */`
      attribute float aOlw;
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      void main() {
        #include <beginnormal_vertex>
        vec3 transformed = position + normalize(objectNormal) * aOlw;
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
}

function proxyMaterial() {
  // main pass: every vertex outside the clip volume (no fragments); the shadow pass uses the default depth material
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, colorWrite: false, depthWrite: false });
  m.name = 'player-shadow-proxy';
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace(/}\s*$/, '  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);\n}\n'); };
  m.customProgramCacheKey = () => 'playerShadowProxy';
  return m;
}

/**
 * Merge the rig under `root`. opts: {cape, skirt, slots:{gem, mote, weaponGem}: Material, exclude:Set<Object3D>}.
 * Returns {skeleton, meshes:[body, outline, proxy], parts, body, outline, proxy, flash, refresh(), update(), writeCape(), stats()}.
 */
export function mergeRig(root, opts = {}) {
  root.updateMatrixWorld(true);
  const exclude = opts.exclude || new Set();
  const slotMats = opts.slots || {};
  const slotOf = (mat) => (mat === slotMats.gem ? 1 : mat === slotMats.mote ? 2 : mat === slotMats.weaponGem ? 3 : 0);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.name === 'outline' || exclude.has(o)) return;
    if (Array.isArray(o.material) || !o.material || o.morphTargetInfluences) return;
    if (!(o.material.isMeshToonMaterial || o.material.isMeshBasicMaterial || o.material.isMeshLambertMaterial || o.material.isMeshStandardMaterial)) return;
    if (!o.geometry?.attributes?.position || !o.geometry.attributes.normal) return;
    parts.push(o);
  });
  if (!parts.length) return null;

  // ---------------- bones: the parts (+ an identity bone for the world-space cape) ----------------
  const capeBone = new THREE.Object3D(); capeBone.name = 'capeBone';     // never parented: matrixWorld = identity
  const bones = parts.slice();
  const cape = opts.cape || null;
  if (cape) bones.push(capeBone);
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const NB = bones.length;
  const boneVis = new Uint8Array(NB);
  const included = new Uint8Array(NB);
  let dirty = false;
  const baseUpdate = skeleton.update.bind(skeleton);
  skeleton.update = function () {
    baseUpdate();
    const bm = this.boneMatrices;
    for (let i = 0; i < NB; i++) {
      let vis = true;
      for (let p = bones[i]; p && p !== root; p = p.parent) if (!p.visible) { vis = false; break; }
      boneVis[i] = vis ? 1 : 0;
      if (!vis) bm.fill(0, i * 16, i * 16 + 16);
      else if (!included[i]) dirty = true;
    }
    if (this.boneTexture) this.boneTexture.needsUpdate = true;
  };

  // ---------------- atlas of the textured materials ----------------
  const regions = new Map();     // material → {x, y, w, h, wrap}
  const texMats = [];
  for (const o of parts) if (o.material.map && !regions.has(o.material)) { regions.set(o.material, null); texMats.push({ mat: o.material, wrap: o.material.map.wrapS === THREE.RepeatWrapping }); }
  if (cape?.mesh?.material?.map) texMats.push({ mat: cape.mesh.material, wrap: false, cape: true });
  // half-resolution regions (≈ 128 px visible around the torso at gameplay distance), one shelf
  let ax = 0, aw = 0, ah = 0;
  for (const t of texMats) {
    const img = t.mat.map.image; const w = Math.max(16, Math.round((img?.width || 256) / 2)), h = Math.max(16, Math.round((img?.height || 128) / 2));
    t.r = { x: ax + GUT, y: GUT, w, h, wrap: t.wrap };
    regions.set(t.mat, t.r);
    ax += w + GUT * 2; ah = Math.max(ah, h + GUT * 2);
  }
  const white = { x: ax + 2, y: 2, w: 12, h: 12 };
  aw = ax + 16;
  const AW = Math.max(16, aw), AH = Math.max(16, ah);
  const canvas = document.createElement('canvas'); canvas.width = AW; canvas.height = AH;
  const g2 = canvas.getContext('2d');
  const atlas = new THREE.CanvasTexture(canvas); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  atlas.name = 'player-atlas';
  function drawAtlas() {
    g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, AW, AH);
    for (const t of texMats) {
      const r = t.r, img = t.mat.map?.image; if (!img) continue;
      try {
        g2.drawImage(img, r.x, r.y, r.w, r.h);
        // gutters: wrapped columns for lathe textures (u wraps around the body), clamped elsewhere; clamped rows
        if (r.wrap) { g2.drawImage(canvas, r.x + r.w - GUT, r.y, GUT, r.h, r.x - GUT, r.y, GUT, r.h); g2.drawImage(canvas, r.x, r.y, GUT, r.h, r.x + r.w, r.y, GUT, r.h); }
        else { g2.drawImage(canvas, r.x, r.y, 1, r.h, r.x - GUT, r.y, GUT, r.h); g2.drawImage(canvas, r.x + r.w - 1, r.y, 1, r.h, r.x + r.w, r.y, GUT, r.h); }
        g2.drawImage(canvas, r.x - GUT, r.y, r.w + GUT * 2, 1, r.x - GUT, r.y - GUT, r.w + GUT * 2, GUT);
        g2.drawImage(canvas, r.x - GUT, r.y + r.h - 1, r.w + GUT * 2, 1, r.x - GUT, r.y + r.h, r.w + GUT * 2, GUT);
      } catch (err) { /* tainted / missing image: stays white */ }
    }
    atlas.needsUpdate = true;
  }
  drawAtlas();
  const uvOf = (mat, u, v, out) => {
    const r = mat && regions.get(mat);
    if (!r) { out[0] = (white.x + white.w / 2) / AW; out[1] = 1 - (white.y + white.h / 2) / AH; return out; }
    out[0] = (r.x + u * r.w) / AW; out[1] = (AH - r.y - r.h + v * r.h) / AH; return out;
  };

  // ---------------- geometry layout ----------------
  // per part: vertex range [v0, v0+nv) (+ flipped copy [f0, f0+nv) for double-sided), triangles (body / outline / proxy)
  const recs = [];
  let NV = 0;
  for (let bi = 0; bi < parts.length; bi++) {
    const o = parts[bi], g = o.geometry, m = o.material;
    const nv = g.attributes.position.count;
    const ds = m.side === THREE.DoubleSide && !o.userData.skinDynamic;
    const ol = o.children.find((c) => c.name === 'outline');
    let olw = 0;
    if (ol) {
      g.boundingSphere || g.computeBoundingSphere();
      o.getWorldScale(_ws);
      const big = g.boundingSphere.radius * Math.max(_ws.x, _ws.y, _ws.z) >= 0.06;
      const th = ol.material.uniforms?.thickness?.value;
      if (big && th) olw = th;
      ol.layers.set(HIDDEN_LAYER);
    }
    o.getWorldScale(_ws);
    recs.push({ o, bi, nv, v0: NV, ds, f0: ds ? NV + nv : -1, olw, ws: Math.max(_ws.x, _ws.y, _ws.z) || 1, cast: !!o.castShadow });
    NV += nv * (ds ? 2 : 1);
    o.layers.set(HIDDEN_LAYER);
  }
  let capeRec = null;
  if (cape) {
    const nv = cape.cols * cape.rows;
    capeRec = { o: null, bi: parts.length, nv, v0: NV, ds: true, f0: NV + nv, olw: 0, ws: 1, cast: true, cape: true };
    recs.push(capeRec); NV += nv * 2;
  }
  const U32 = NV > 65535;
  const P = new Float32Array(NV * 3), N = new Float32Array(NV * 3), UV = new Float32Array(NV * 2), C = new Float32Array(NV * 3);
  const EM = new Float32Array(NV * 4), OLW = new Float32Array(NV), SI = new Uint16Array(NV * 4), SW = new Float32Array(NV * 4);
  const bodyTris = [], olTris = [];
  const _uv = [0, 0];
  for (const r of recs) {
    const bi = r.bi, nv = r.nv;
    for (let k = 0; k < (r.ds ? 2 : 1); k++) {
      const base = k ? r.f0 : r.v0;
      for (let i = 0; i < nv; i++) { const j = base + i; SI[j * 4] = bi; SW[j * 4] = 1; OLW[j] = k ? 0 : r.olw; }
    }
    if (r.cape) {
      const cols = cape.cols, rows = cape.rows;
      for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
        const i = rr * cols + c;
        uvOf(cape.mesh.material, c / (cols - 1), 1 - rr / (rows - 1), _uv);
        for (const base of [r.v0, r.f0]) { UV[(base + i) * 2] = _uv[0]; UV[(base + i) * 2 + 1] = _uv[1]; }
      }
      r.tris = [];
      for (let rr = 0; rr < rows - 1; rr++) for (let c = 0; c < cols - 1; c++) {
        const a = rr * cols + c, b = a + 1, d = a + cols, e = d + 1;
        r.tris.push(a, d, b, b, d, e);
      }
    } else {
      const g = r.o.geometry, pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv?.array;
      P.set(pa.subarray(0, nv * 3), r.v0 * 3); N.set(na.subarray(0, nv * 3), r.v0 * 3);
      if (r.ds) { P.set(pa.subarray(0, nv * 3), r.f0 * 3); for (let i = 0; i < nv * 3; i++) N[r.f0 * 3 + i] = -na[i]; }
      const mat = r.o.material;
      for (let i = 0; i < nv; i++) {
        uvOf(mat, ua ? ua[i * 2] : 0.5, ua ? ua[i * 2 + 1] : 0.5, _uv);
        UV[(r.v0 + i) * 2] = _uv[0]; UV[(r.v0 + i) * 2 + 1] = _uv[1];
        if (r.ds) { UV[(r.f0 + i) * 2] = _uv[0]; UV[(r.f0 + i) * 2 + 1] = _uv[1]; }
      }
      const ix = g.index ? g.index.array : null;
      r.tris = [];
      const nt = ix ? ix.length : nv;
      for (let t = 0; t < nt; t++) r.tris.push(ix ? ix[t] : t);
    }
    // body triangles (front, then the flipped copy with reversed winding), outline triangles (front only)
    r.b0 = bodyTris.length;
    for (let t = 0; t < r.tris.length; t++) bodyTris.push(r.v0 + r.tris[t]);
    if (r.ds) for (let t = 0; t < r.tris.length; t += 3) bodyTris.push(r.f0 + r.tris[t], r.f0 + r.tris[t + 2], r.f0 + r.tris[t + 1]);
    r.bn = bodyTris.length - r.b0;
    r.o0 = olTris.length;
    if (r.olw > 0) for (let t = 0; t < r.tris.length; t++) olTris.push(r.v0 + r.tris[t]);
    r.on = olTris.length - r.o0;
  }
  const IA = U32 ? Uint32Array : Uint16Array;
  const bodyMaster = IA.from(bodyTris), olMaster = IA.from(olTris);

  const geo = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage), aN = new THREE.BufferAttribute(N, 3).setUsage(THREE.DynamicDrawUsage);
  const aC = new THREE.BufferAttribute(C, 3), aEm = new THREE.BufferAttribute(EM, 4), aUV = new THREE.BufferAttribute(UV, 2);
  const aSI = new THREE.BufferAttribute(SI, 4), aSW = new THREE.BufferAttribute(SW, 4), aOlw = new THREE.BufferAttribute(OLW, 1);
  geo.setAttribute('position', aP); geo.setAttribute('normal', aN); geo.setAttribute('uv', aUV); geo.setAttribute('color', aC); geo.setAttribute('aEm', aEm);
  geo.setAttribute('skinIndex', aSI); geo.setAttribute('skinWeight', aSW);
  const bodyIdx = new THREE.BufferAttribute(new IA(bodyMaster.length), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setIndex(bodyIdx);
  const ogeo = new THREE.BufferGeometry();
  ogeo.setAttribute('position', aP); ogeo.setAttribute('normal', aN); ogeo.setAttribute('skinIndex', aSI); ogeo.setAttribute('skinWeight', aSW); ogeo.setAttribute('aOlw', aOlw);
  const olIdx = new THREE.BufferAttribute(new IA(Math.max(3, olMaster.length)), 1).setUsage(THREE.DynamicDrawUsage);
  ogeo.setIndex(olIdx);
  const bb = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  geo.boundingSphere = bb; ogeo.boundingSphere = bb;

  // ---------------- shadow proxy (decimated casters) ----------------
  const pPos = [], pNrm = [], pSI = [], pTris = [];
  for (const r of recs) {
    r.p0 = pTris.length; r.pn = 0; r.pv0 = pPos.length / 3;
    if (!r.cast) continue;
    if (r.cape) {
      r.pv0 = pPos.length / 3;
      for (let i = 0; i < r.nv; i++) { pPos.push(0, 0, 0); pNrm.push(0, 0, 1); pSI.push(r.bi); }
      for (let t = 0; t < r.tris.length; t++) pTris.push(r.pv0 + r.tris[t]);
    } else {
      const g = r.o.geometry;
      const d = decimate(g.attributes.position.array, g.attributes.normal.array, r.tris, PROXY_CELL / r.ws);
      const v0 = pPos.length / 3;
      for (let i = 0; i < d.pos.length; i++) { pPos.push(d.pos[i]); pNrm.push(d.nrm[i]); }
      for (let i = 0; i < d.pos.length / 3; i++) pSI.push(r.bi);
      for (let t = 0; t < d.idx.length; t++) pTris.push(v0 + d.idx[t]);
    }
    r.pn = pTris.length - r.p0;
  }
  const PNV = pPos.length / 3;
  const PIA = PNV > 65535 ? Uint32Array : Uint16Array;
  const proxyMaster = PIA.from(pTris);
  const pgeo = new THREE.BufferGeometry();
  const ppA = new THREE.BufferAttribute(Float32Array.from(pPos), 3).setUsage(THREE.DynamicDrawUsage);
  pgeo.setAttribute('position', ppA); pgeo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(pNrm), 3));
  const psi = new Uint16Array(PNV * 4), psw = new Float32Array(PNV * 4);
  for (let i = 0; i < PNV; i++) { psi[i * 4] = pSI[i]; psw[i * 4] = 1; }
  pgeo.setAttribute('skinIndex', new THREE.BufferAttribute(psi, 4)); pgeo.setAttribute('skinWeight', new THREE.BufferAttribute(psw, 4));
  const proxyIdx = new THREE.BufferAttribute(new PIA(Math.max(3, proxyMaster.length)), 1).setUsage(THREE.DynamicDrawUsage);
  pgeo.setIndex(proxyIdx); pgeo.boundingSphere = bb;

  // ---------------- meshes ----------------
  const slots = { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] };
  const flash = { value: new THREE.Color(0, 0, 0) };
  const ident = new THREE.Matrix4();
  const mkSkinned = (g, mat, name) => {
    const m = new THREE.SkinnedMesh(g, mat);
    m.name = name;
    m.bindMode = THREE.AttachedBindMode;
    m.bind(skeleton, ident);
    m.frustumCulled = false;
    m.raycast = () => {};
    m.userData.noGhost = true; m.userData.skinMerged = true;
    root.add(m);
    return m;
  };
  const body = mkSkinned(geo, bodyMaterial(atlas, slots, flash), 'playerBody');
  body.castShadow = false; body.receiveShadow = false;
  const outline = mkSkinned(ogeo, outlineMaterial(OUTLINE_COLOR), 'outline');
  outline.castShadow = false; outline.receiveShadow = false;
  const proxy = mkSkinned(pgeo, proxyMaterial(), 'playerShadow');
  proxy.castShadow = true; proxy.receiveShadow = false;
  const meshes = [body, outline, proxy];

  // ---------------- colours (re-baked on outfit / element change) ----------------
  const _c = new THREE.Color();
  function bakeColors() {
    for (const r of recs) {
      let cr = 1, cg = 1, cb = 1, er = 0, eg = 0, eb = 0, sl = 0;
      if (r.cape) { /* white × atlas */ } else {
        const m = r.o.material;
        sl = slotOf(m);
        if (m.isMeshBasicMaterial && !m.transparent) { cr = cg = cb = 0; _c.copy(m.color); er = _c.r; eg = _c.g; eb = _c.b; }
        else {
          _c.copy(m.color); cr = _c.r; cg = _c.g; cb = _c.b;
          if (m.emissive) { const k = m.emissiveIntensity ?? 1; er = m.emissive.r * k; eg = m.emissive.g * k; eb = m.emissive.b * k; }
        }
      }
      for (let k = 0; k < (r.ds ? 2 : 1); k++) {
        const base = k ? r.f0 : r.v0;
        for (let i = 0; i < r.nv; i++) {
          const j = base + i;
          C[j * 3] = cr; C[j * 3 + 1] = cg; C[j * 3 + 2] = cb;
          EM[j * 4] = er; EM[j * 4 + 1] = eg; EM[j * 4 + 2] = eb; EM[j * 4 + 3] = sl;
        }
      }
    }
    aC.needsUpdate = true; aEm.needsUpdate = true;
  }
  /** Draw index = the triangles of included parts. exact: include exactly the visible parts (outfit change). */
  function rebuild(exact) {
    let vis = 0;
    for (let i = 0; i < NB; i++) {
      if (exact) included[i] = 0;
      if (!included[i] && boneVisible(i)) { included[i] = 1; vis++; }
    }
    let nb = 0, no = 0, np = 0;
    const bI = bodyIdx.array, oI = olIdx.array, pI = proxyIdx.array;
    for (const r of recs) {
      if (!included[r.bi]) continue;
      bI.set(bodyMaster.subarray(r.b0, r.b0 + r.bn), nb); nb += r.bn;
      if (r.on) { oI.set(olMaster.subarray(r.o0, r.o0 + r.on), no); no += r.on; }
      if (r.pn) { pI.set(proxyMaster.subarray(r.p0, r.p0 + r.pn), np); np += r.pn; }
    }
    geo.setDrawRange(0, nb); ogeo.setDrawRange(0, no); pgeo.setDrawRange(0, np);
    bodyIdx.clearUpdateRanges(); bodyIdx.addUpdateRange(0, Math.max(1, nb)); bodyIdx.needsUpdate = true;
    olIdx.clearUpdateRanges(); olIdx.addUpdateRange(0, Math.max(1, no)); olIdx.needsUpdate = true;
    proxyIdx.clearUpdateRanges(); proxyIdx.addUpdateRange(0, Math.max(1, np)); proxyIdx.needsUpdate = true;
    dirty = false; stats.rebuilds++;
    stats.tris = nb / 3; stats.outlineTris = no / 3; stats.shadowTris = np / 3;
    return vis;
  }
  function boneVisible(i) {
    for (let p = bones[i]; p && p !== root; p = p.parent) if (!p.visible) return false;
    return true;
  }
  const stats = { parts: parts.length, verts: NV, proxyVerts: PNV, tris: 0, outlineTris: 0, shadowTris: 0, rebuilds: 0, atlas: AW + '×' + AH,
    totalTris: bodyMaster.length / 3, totalOutlineTris: olMaster.length / 3, totalShadowTris: proxyMaster.length / 3 };

  // ---------------- dynamic parts: skirt (CPU deform) and cape (world-space verlet) ----------------
  const skirtRec = opts.skirt ? recs.find((r) => r.o === opts.skirt.mesh) : null;
  if (skirtRec && opts.skirt.bindSink) opts.skirt.bindSink(P, skirtRec.v0, aP);
  if (cape) cape.detach?.();
  /** cape points (world) → merged body (both faces) + proxy; normals from the cape's grid normals. */
  function writeCape() {
    if (!capeRec || !cape.ready) return;
    const cur = cape.cur, nrm = cape.nrm, n3 = capeRec.nv * 3;
    const o = capeRec.v0 * 3, f = capeRec.f0 * 3;
    P.set(cur.subarray(0, n3), o); P.set(cur.subarray(0, n3), f);
    if (nrm) for (let i = 0; i < n3; i++) { N[o + i] = nrm[i]; N[f + i] = -nrm[i]; }
    aP.addUpdateRange(o, n3 * 2); aP.needsUpdate = true;     // the two copies are adjacent
    aN.addUpdateRange(o, n3 * 2); aN.needsUpdate = true;
    if (capeRec.pn) { const pa = ppA.array, po = capeRec.pv0 * 3; pa.set(cur.subarray(0, n3), po); ppA.addUpdateRange(po, n3); ppA.needsUpdate = true; }
  }

  bakeColors();
  rebuild(true);

  return {
    skeleton, meshes, parts, body, outline, proxy, flash, slots: slots.value, atlas, stats,
    /** Outfit / element change: redraw the atlas from the parts' current maps, re-bake colours, exact draw index. */
    refresh() { drawAtlas(); bakeColors(); rebuild(true); },
    /** Element tints / material colours changed (no visibility change). */
    recolor() { bakeColors(); },
    /** Once per frame (player): slot colours from their materials, index growth when a new part became visible, cape. */
    update() {
      if (slotMats.gem) slots.value[1].copy(slotMats.gem.color);
      if (slotMats.mote) slots.value[2].copy(slotMats.mote.color);
      if (slotMats.weaponGem) slots.value[3].copy(slotMats.weaponGem.color);
      if (dirty) rebuild(false);
      writeCape();
    },
    writeCape,
  };
}
