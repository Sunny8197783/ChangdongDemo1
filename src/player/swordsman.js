// Swordsman outfit for the shared hero rig: longsword (in hand) + scabbard with sheathed hilt (on the back),
// buckler, pauldrons, breastplate, bracers, hood/cowl + headband. Toggled against the mage gear by setOutfit().
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mk, grp, latheTexture, folds, hex, COLORS, mergeStatic } from './model.js';

export const SW = {
  tunic: 0x9b2f38, tunicDark: 0x6a1d27, cream: 0xf3e6c4, steel: 0xc8d2dc, steelDark: 0x7d8a99,
  leather: 0x7a4a2c, leatherDark: 0x4e2f1c, gold: 0xf0c25a, cloth: 0x2a3a5e, clothDark: 0x1c2742,
  blade: 0xe9f1f8,
};

function swordPanel(g, W, H, y0, y1) {
  const hw = 0.035 * W, bw = 0.012 * W;
  g.fillStyle = hex(SW.cream);
  g.fillRect(0, y0, hw, y1 - y0); g.fillRect(W - hw, y0, hw, y1 - y0);
  g.fillStyle = hex(SW.gold);
  g.fillRect(hw, y0, bw, y1 - y0); g.fillRect(W - hw - bw, y0, bw, y1 - y0);
}
const tunicSkirtTex = () => latheTexture((g, W, H) => {
  g.fillStyle = hex(SW.tunic); g.fillRect(0, 0, W, H);
  folds(g, W, H, 16, 0.14);
  const hemTop = H * 0.82;
  swordPanel(g, W, H, 0, hemTop);
  // split tabards: darker side panels
  g.fillStyle = 'rgba(40,0,10,0.18)'; g.fillRect(W * 0.22, 0, W * 0.06, hemTop); g.fillRect(W * 0.72, 0, W * 0.06, hemTop);
  g.fillStyle = hex(SW.tunicDark); g.fillRect(0, hemTop, W, H * 0.08);
  g.fillStyle = hex(SW.gold);
  for (let x = 0; x < W; x += 24) { g.fillRect(x + 4, hemTop + H * 0.025, 12, 4); }
  g.fillStyle = hex(SW.cream); g.fillRect(0, H * 0.9, W, H * 0.1);
});
const tunicTorsoTex = () => latheTexture((g, W, H) => {
  g.fillStyle = hex(SW.tunic); g.fillRect(0, 0, W, H);
  folds(g, W, H, 10, 0.1);
  swordPanel(g, W, H, 0, H);
});
const capeTex = () => {
  const W = 128, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hex(SW.clothDark)); grad.addColorStop(1, hex(SW.cloth));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = hex(SW.tunic); g.fillRect(0, H - 30, W, 12);
  g.fillStyle = hex(SW.gold); g.fillRect(0, H - 18, W, 18); g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  // emblem: crossed blade + wing
  g.save(); g.translate(W / 2, H * 0.45);
  g.fillStyle = hex(SW.gold);
  g.beginPath(); g.moveTo(0, -42); g.lineTo(6, 18); g.lineTo(0, 26); g.lineTo(-6, 18); g.closePath(); g.fill();
  g.fillRect(-18, 12, 36, 6); g.fillRect(-3, 18, 6, 16);
  g.strokeStyle = hex(SW.gold); g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 34, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** Blade geometry: grip at origin, blade along +Y from y0 to y0+len, flat in X (edges at ±X), thin in Z. */
function bladeGeo(len, w, th, y0) {
  // diamond cross-section, tapering, with a sharp tip
  const shape = [];
  const N = 8;
  const verts = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const y = y0 + f * len * 0.86;
    const ww = w * (1 - f * 0.18);
    verts.push(-ww / 2, y, 0, 0, y, th / 2, ww / 2, y, 0, 0, y, -th / 2);
  }
  const tip = y0 + len;
  verts.push(0, tip, 0);
  const T = (N + 1) * 4;
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      idx.push(a + k, a + k2, b + k2, a + k, b + k2, b + k);
    }
  }
  const last = N * 4;
  for (let k = 0; k < 4; k++) idx.push(last + k, last + (k + 1) % 4, T);
  void shape;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng;
}

/** Thin glowing strip along the blade edges (both faces), additive, element tinted. */
function edgeGlowGeo(len, w, y0) {
  const g = new THREE.PlaneGeometry(w * 1.25, len * 0.98, 1, 8);
  g.translate(0, y0 + len * 0.49, 0);
  // taper the plane towards the tip like the blade
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = (p.getY(i) - y0) / len;
    p.setX(i, p.getX(i) * (f > 0.86 ? Math.max(0, (1 - f) / 0.14) * 0.82 : 1 - f * 0.18));
  }
  return g;
}

const EDGE_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const EDGE_FS = /* glsl */`
  uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
  varying vec2 vUv;
  void main() {
    float x = abs(vUv.x * 2.0 - 1.0);
    float edge = smoothstep(0.55, 1.0, x);          // bright edges
    float fuller = smoothstep(0.18, 0.0, x) * 0.55; // central fuller line
    float flow = 0.65 + 0.35 * sin(vUv.y * 22.0 - uTime * 9.0);
    float tipFade = smoothstep(1.0, 0.85, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
    float a = (edge + fuller) * flow * tipFade * uIntensity;
    vec3 col = mix(uColor, vec3(1.0), edge * 0.35 * uIntensity);
    gl_FragColor = vec4(col * a, 1.0);
  }`;

export const BLADE = { y0: 0.14, len: 1.02 }; // blade start/length in sword-local +Y

export function buildSwordGear(rig) {
  const M = {
    steel: toonMat(SW.steel, { emissive: 0x0c1218 }), steelDark: toonMat(SW.steelDark),
    leather: toonMat(SW.leather), leatherDark: toonMat(SW.leatherDark), gold: toonMat(SW.gold, { emissive: 0x3a2800 }),
    cloth: toonMat(SW.cloth, { side: THREE.DoubleSide }), clothDark: toonMat(SW.clothDark),
    blade: toonMat(SW.blade, { emissive: 0x1a2330 }), cream: toonMat(SW.cream, { side: THREE.DoubleSide }),
    red: toonMat(SW.tunic, { side: THREE.DoubleSide }),
  };
  const gear = { all: [], M };
  const add = (o) => { gear.all.push(o); return o; };

  // ---------- longsword (child of right hand) ----------
  const sword = add(grp(rig.handR, 0, 0, 0, 'sword'));
  gear.sword = sword;
  mk(new THREE.CylinderGeometry(0.024, 0.027, 0.2, 8), M.leatherDark, sword, { outline: 0.008 });          // grip
  for (const y of [-0.06, 0, 0.06]) mk(new THREE.TorusGeometry(0.027, 0.006, 4, 10), M.leather, sword, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
  mk(new THREE.SphereGeometry(0.038, 10, 8), M.gold, sword, { pos: [0, -0.125, 0], scale: [1, 0.85, 1], outline: 0.008 }); // pommel
  const guardGeo = new THREE.BoxGeometry(0.3, 0.035, 0.05); // crossguard with swept tips
  { const p = guardGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / 0.15, 2) * 0.035); } guardGeo.computeVertexNormals(); }
  mk(guardGeo, M.gold, sword, { pos: [0, 0.115, 0], outline: 0.009 });
  mk(new THREE.BoxGeometry(0.07, 0.05, 0.06), M.steel, sword, { pos: [0, 0.12, 0], outline: 0.008 });
  // element gem on the guard (both faces) — tinted per element
  gear.gemMat = new THREE.MeshBasicMaterial({ color: 0xff8844 });
  gear.gem = mk(new THREE.OctahedronGeometry(0.024), gear.gemMat, sword, { pos: [0, 0.12, 0.032], scale: [1, 1.3, 0.5], outline: 0.005, shadow: false });
  gear.gem2 = mk(new THREE.OctahedronGeometry(0.024), gear.gemMat, sword, { pos: [0, 0.12, -0.032], scale: [1, 1.3, 0.5], outline: 0, shadow: false });
  const blade = mk(bladeGeo(BLADE.len, 0.072, 0.022, BLADE.y0), M.blade, sword, { outline: 0.007 });
  blade.userData.noMerge = true;
  gear.blade = blade;
  gear.edgeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff8844) }, uIntensity: { value: 0.6 }, uTime: { value: 0 } },
    vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  // both blade faces in ONE mesh (v4 draw budget): the two edge strips baked at ±z
  const eg = edgeGlowGeo(BLADE.len, 0.072, BLADE.y0);
  const egs = [0.0125, -0.0125].map((z) => { const q = eg.clone(); q.translate(0, 0, z); return q; });
  const egm = mergeGeometries(egs, false) || eg;
  const e = new THREE.Mesh(egm, gear.edgeMat); e.userData.noGhost = true; e.userData.noMerge = true;
  e.frustumCulled = false; e.renderOrder = 4; sword.add(e);
  gear.edge = e;
  // tip / socket markers (world positions sampled for trails & hit tests)
  gear.tip = grp(sword, 0, BLADE.y0 + BLADE.len, 0, 'swordTip');
  gear.mid = grp(sword, 0, BLADE.y0 + BLADE.len * 0.45, 0, 'swordMid');
  gear.base = grp(sword, 0, BLADE.y0 + 0.05, 0, 'swordBase');

  // ---------- scabbard on the back (+ sheathed hilt copy) ----------
  const back = add(grp(rig.torso, -0.17, 0.5, -0.25, 'scabbard'));
  back.rotation.set(0.18, 0, -2.72); // hilt over the right shoulder, tip down-left
  gear.scabbard = back;
  const sheath = new THREE.CylinderGeometry(0.03, 0.045, 1.0, 8); sheath.translate(0, 0.62, 0); sheath.scale(1.7, 1, 0.8);
  mk(sheath, M.leatherDark, back, { outline: 0.01 });
  for (const y of [0.16, 0.5, 1.06]) mk(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 8).scale(1.6, 1, 0.8), M.gold, back, { pos: [0, y, 0], outline: 0.006 });
  mk(new THREE.ConeGeometry(0.045, 0.08, 8).scale(1.6, 1, 0.8), M.gold, back, { pos: [0, 1.15, 0], outline: 0.006 });
  // strap across the chest
  mk(new THREE.TorusGeometry(0.25, 0.016, 4, 22), M.leather, rig.torso, { pos: [0, 0.27, 0], rot: [Math.PI / 2, 0.75, 0], scale: [0.95, 0.72, 1] }).userData.gearTag = 1;
  const sheathed = add(grp(back, 0, 0, 0, 'sheathedHilt'));
  gear.sheathed = sheathed;
  mk(new THREE.CylinderGeometry(0.024, 0.027, 0.2, 8), M.leatherDark, sheathed, { pos: [0, -0.02, 0], outline: 0.008 });
  mk(new THREE.SphereGeometry(0.038, 10, 8), M.gold, sheathed, { pos: [0, -0.145, 0], scale: [1, 0.85, 1], outline: 0.008 });
  mk(guardGeo, M.gold, sheathed, { pos: [0, 0.095, 0], outline: 0.009 });
  sheathed.rotation.z = Math.PI; sheathed.position.y = 0.0; // grip pointing up out of the scabbard mouth
  sheathed.position.set(0, 0.02, 0);
  sheathed.rotation.set(0, 0, Math.PI);

  // ---------- buckler on the left forearm ----------
  const buck = add(grp(rig.elbowL, 0.07, -0.15, 0.0, 'buckler'));
  buck.rotation.set(0, 0, -Math.PI / 2);
  gear.buckler = buck;
  const bpts = [[0.0, 0.045], [0.06, 0.04], [0.13, 0.025], [0.17, 0.0], [0.165, -0.012]].map(([r, y]) => new THREE.Vector2(r, y));
  mk(new THREE.LatheGeometry(bpts, 20), M.steel, buck, { outline: 0.01 });
  mk(new THREE.TorusGeometry(0.165, 0.014, 6, 22), M.gold, buck, { rot: [Math.PI / 2, 0, 0], outline: 0.006 });
  mk(new THREE.SphereGeometry(0.035, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, buck, { pos: [0, 0.04, 0], outline: 0.006 });

  // ---------- armor ----------
  for (const [arm, side] of [[rig.armR, -1], [rig.armL, 1]]) {
    const pa = add(grp(arm, side * 0.01, 0.02, 0, 'pauldron'));
    mk(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.steel, pa, { scale: [1.05, 0.8, 1.1], rot: [0, 0, side * -0.35], outline: 0.01 });
    mk(new THREE.SphereGeometry(0.115, 12, 4, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.08), M.gold, pa, { scale: [1.05, 0.8, 1.1], rot: [0, 0, side * -0.35], outline: 0 });
  }
  for (const elbow of [rig.elbowR, rig.elbowL]) {
    const br = add(grp(elbow, 0, -0.17, 0, 'bracer'));
    mk(new THREE.CylinderGeometry(0.05, 0.044, 0.15, 10), M.leather, br, { outline: 0.008 });
    mk(new THREE.TorusGeometry(0.05, 0.009, 4, 12), M.gold, br, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
  }
  const chest = add(grp(rig.torso, 0, 0, 0, 'breastplate'));
  const cpts = [[0.2, 0.1], [0.215, 0.2], [0.205, 0.3], [0.17, 0.4], [0.12, 0.47]].map(([r, y]) => new THREE.Vector2(r, y));
  const cgeo = new THREE.LatheGeometry(cpts, 20, -Math.PI * 0.42, Math.PI * 0.84);
  mk(cgeo, M.steel, chest, { scale: [1.2, 1, 1.0], pos: [0, 0, 0.012], outline: 0.01 });
  mk(new THREE.BoxGeometry(0.03, 0.3, 0.02), M.gold, chest, { pos: [0, 0.28, 0.225], rot: [-0.18, 0, 0], outline: 0 });
  mk(new THREE.TorusGeometry(0.218, 0.028, 6, 26), M.leatherDark, chest, { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], scale: [1.12, 0.9, 1], outline: 0.01 });
  mk(new THREE.BoxGeometry(0.08, 0.07, 0.03), M.gold, chest, { pos: [0, 0.04, 0.2], outline: 0.008 });

  // ---------- hood (down) + cowl + headband ----------
  const hood = add(grp(rig.torso, 0, 0.5, -0.02, 'hood'));
  const hpts = [[0.13, 0.08], [0.17, 0.03], [0.2, -0.03], [0.24, -0.08]].map(([r, y]) => new THREE.Vector2(r, y));
  mk(new THREE.LatheGeometry(hpts, 20), M.cloth, hood, { outline: 0.01 });                                         // cowl
  mk(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.cloth, hood, { pos: [0, 0.02, -0.15], rot: [-1.9, 0, 0], scale: [1, 0.75, 0.85], outline: 0.01 }); // hood fold
  const band = add(grp(rig.head, 0, 0.055, 0, 'headband'));
  mk(new THREE.TorusGeometry(0.163, 0.013, 4, 24), M.red, band, { rot: [Math.PI / 2 - 0.12, 0, 0], outline: 0.006 });
  const tail = new THREE.PlaneGeometry(0.05, 0.26); tail.translate(0, -0.13, 0);
  gear.tails = [];
  for (const s of [1, -1]) {
    const tg = grp(band, s * 0.03, 0.0, -0.165);
    mk(tail, M.red, tg, { rot: [0.25, s * 0.25, s * 0.15], outline: 0 });
    gear.tails.push(tg);
  }
  for (const o of gear.all) mergeStatic(o);
  // tag the strap so it toggles with the gear
  rig.torso.traverse((o) => { if (o.userData.gearTag) gear.all.push(o); });

  gear.tex = { torso: tunicTorsoTex(), skirt: tunicSkirtTex(), cape: capeTex() };
  for (const o of gear.all) o.visible = false;
  return gear;
}

// The outfit swap moved to player/classes.js (setClassOutfit, CLASS_OUTFITS) — it covers all 6 classes.
