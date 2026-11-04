// tells body rims (PLAN v4 §5.3, §5.5): inverted-hull rim clones of a winding-up enemy, drawn in the threat scene.
// Built from e.rimSource() (≤ 2 meshes: outline proxy or current LOD; fallback: the model's skin meshes) — the clone
// shares geometry and skeleton (SkinnedMesh.bind(src.skeleton, src.bindMatrix)), matrixAutoUpdate = false, and its
// matrices are copied from the source in tells.preOverlay(). The hull is expanded 2–3 px in clip space; the fragment
// stage does a HARD depth compare against game.post.sceneDepth (draw only where hullDepth ≤ sceneDepth + 0.05 m), so the
// enemy's own body (and anything solid in front) hides it and only the outline shows. ≤ 4 rim draw calls in total.
// Two programs: skinned and static sources (one material pair per slot, colours are uniforms).
import * as THREE from 'three';

export const RIM_SLOTS = 4;

const VERT = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uPx; uniform vec2 uRes;
  varying float vViewZ;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vViewZ = mv.z;
    vec4 clip = projectionMatrix * mv;
    vec3 vn = normalMatrix * objectNormal;
    vec2 cn = (projectionMatrix * vec4(vn, 0.0)).xy;
    float l = length(cn);
    if (l > 1e-5) clip.xy += (cn / l) * uPx * 2.0 / max(uRes, vec2(1.0)) * clip.w;
    gl_Position = clip;
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha;
  uniform sampler2D uDepth; uniform float uHasDepth; uniform vec2 uCanvasRes; uniform vec2 uUvScale; uniform mat4 uProjInv;
  varying float vViewZ;
  void main() {
    if (uHasDepth > 0.5) {
      vec2 suv = gl_FragCoord.xy / uCanvasRes;
      float d = texture2D(uDepth, suv * uUvScale).x;
      vec4 v = uProjInv * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
      if (-vViewZ > -v.z + 0.05) discard;
    }
    gl_FragColor = vec4(uColor, uAlpha);
    #include <colorspace_fragment>
  }`;

export function createRims(game) {
  const root = new THREE.Group(); root.name = 'tells-rims'; root.matrixAutoUpdate = false;
  const P = game.post || {};
  const uni = (v) => ({ value: v });
  const shared = {
    uDepth: P.sceneDepth || uni(null), uCanvasRes: P.canvasRes || uni(new THREE.Vector2(1, 1)), uUvScale: P.uvScale || uni(new THREE.Vector2(1, 1)),
    uProjInv: P.projInv || uni(new THREE.Matrix4()), uRes: P.canvasRes || uni(new THREE.Vector2(1, 1)), uHasDepth: uni(0),
  };
  const mkMat = (u) => new THREE.ShaderMaterial({
    name: 'tells-rim', uniforms: u, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, transparent: true, depthTest: true, depthWrite: true, toneMapped: false, fog: false,
  });
  const slots = [];
  for (let i = 0; i < RIM_SLOTS; i++) {
    const u = { ...shared, uColor: uni(new THREE.Color(0xff2a3d)), uAlpha: uni(1), uPx: uni(2) };
    slots.push({ i, u, matSkin: mkMat(u), matStatic: mkMat(u), active: false, src: null, clone: null, enemy: null });
  }
  const clones = new WeakMap();     // source mesh → {skin, stat}
  function cloneFor(src) {
    let c = clones.get(src);
    if (!c) {
      let m;
      if (src.isSkinnedMesh && src.skeleton) {
        m = new THREE.SkinnedMesh(src.geometry, slots[0].matSkin);
        m.bind(src.skeleton, src.bindMatrix);
        m.bindMode = src.bindMode;
      } else m = new THREE.Mesh(src.geometry, slots[0].matStatic);
      m.name = 'tells-rim-clone'; m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 10;
      m.castShadow = false; m.receiveShadow = false;
      c = m; clones.set(src, c);
    }
    return c;
  }
  // warm-only objects so both programs compile at boot (never drawn)
  {
    const g = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    const w = new Float32Array(n * 4); for (let i = 0; i < n; i++) w[i * 4] = 1;
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    const bone = new THREE.Bone();
    const sk = new THREE.SkinnedMesh(g, slots[0].matSkin); sk.add(bone); sk.bind(new THREE.Skeleton([bone]));
    const st = new THREE.Mesh(g, slots[0].matStatic);
    for (const o of [sk, st]) { o.visible = false; o.name = 'tells-rim-warm'; o.frustumCulled = false; root.add(o); }
    root.userData.warm = [sk, st];
  }
  function release(s) {
    if (!s.active) return;
    if (s.clone && s.clone.parent === root) root.remove(s.clone);
    s.active = false; s.src = null; s.clone = null; s.enemy = null;
  }
  /** Assign slot s to source mesh src of enemy e (re-uses the cached clone). */
  function assign(s, e, src) {
    if (s.active && s.src === src) return;
    release(s);
    const c = cloneFor(src);
    if (c.parent && c.parent !== root) c.parent.remove(c);
    c.material = c.isSkinnedMesh ? s.matSkin : s.matStatic;
    root.add(c);
    s.active = true; s.src = src; s.clone = c; s.enemy = e;
  }
  /** Copy matrices from the sources (tells.preOverlay, after the main render). */
  function sync() {
    shared.uHasDepth.value = P.sceneDepth?.value ? 1 : 0;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.active) continue;
      const src = s.src, c = s.clone;
      let vis = src.visible;
      for (let o = src.parent; vis && o; o = o.parent) if (!o.visible) vis = false;
      c.visible = vis;
      c.matrix.copy(src.matrixWorld); c.matrixWorld.copy(src.matrixWorld);
      if (c.isSkinnedMesh) c.bindMatrixInverse.copy(src.bindMatrixInverse);
    }
  }
  function count() { let n = 0; for (let i = 0; i < slots.length; i++) { const s = slots[i]; if (s.active && s.clone && s.clone.visible !== false) n++; } return n; }
  const materials = [];
  for (const s of slots) materials.push(s.matSkin, s.matStatic);
  return { root, slots, assign, release, sync, count, materials };
}

/** ≤ 2 rim source meshes of an enemy: e.rimSource() (model contract), else the model's skin meshes, else the 2 largest meshes. */
export function rimSources(e, out) {
  out.length = 0;
  if (!e) return out;
  try {
    const r = e.rimSource?.() || e.model?.rimSource?.();
    if (r) { const a = Array.isArray(r) ? r : [r]; for (let i = 0; i < a.length && out.length < 2; i++) if (a[i]?.isMesh) out.push(a[i]); if (out.length) return out; }
  } catch (_) { /* */ }
  const cached = e.__tellsRimSrc;
  if (cached) { for (let i = 0; i < cached.length; i++) out.push(cached[i]); return out; }
  const list = [];
  const meshes = e.model?.skin?.meshes;
  if (meshes) for (const k in meshes) { const m = meshes[k]; if (m?.isMesh) list.push(m); }
  if (!list.length && e.object && typeof e.object.traverse === 'function') {
    const outl = new Set(e.model?.outlines || []);
    e.object.traverse((o) => {
      if (!o.isMesh || outl.has(o) || o.isInstancedMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.side === THREE.BackSide || !o.geometry?.attributes?.normal) return;
      list.push(o);
    });
  }
  list.sort((a, b) => (b.geometry.attributes.position?.count || 0) - (a.geometry.attributes.position?.count || 0));
  const pick = list.slice(0, 2);
  e.__tellsRimSrc = pick;
  for (const m of pick) out.push(m);
  return out;
}
