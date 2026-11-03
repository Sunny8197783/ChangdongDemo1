// Class outfits + weapon props for the shared hero rig (CONTRACT §10.1, DESIGN §2).
// Every class's gear is built ONCE at boot, BEFORE skinMerge, from the rig's existing materials (rig.materials and the
// swordsman gear materials), so it merges into the existing skinned draw calls: +0 draw calls, ≤ +18k triangles total.
// Hidden gear collapses through the zero-bone trick in skinMerge. setClassOutfit(cls) toggles visibility and tints.
//
//   bow     (left hand)  sockets: tip = arrow nock, base = grip, string handle (two string segments + nock follow the draw hand)
//   hammer  (right hand, follows the sword pose quaternion)  sockets: tip, base   (+ a copy on the back while sheathed)
//   shield  (left forearm)
//   daggers (both hands, reverse grip)  sockets: tipL, tipR   (+ sheaths at the hips)
//   totem   (replaces the staff decorations, keeps the element gem as the head charm)  socket: tip = head charm
//
// Spring-driven links (charms, feathers, tabard, scarf tails, braid) are exposed as `chains` for player/springs.js.
import * as THREE from 'three';
import { mk, grp, latheTexture, folds, hex, COLORS, star } from './model.js';
import { SW } from './swordsman.js';
import { CLASS_DEFS, styleOf } from '../core/classes.js';

// ------------------------------------------------------------------ palettes (per class look; data, no class branches)
export const PALETTES = {
  mage:         { robe: COLORS.robe, dark: COLORS.robeDark, panel: COLORS.teal, trim: COLORS.gold, cloth: SW.cloth, clothDark: SW.clothDark, accent: SW.tunic, steel: SW.steel, steelEm: 0x0c1218 },
  sword:        { robe: SW.tunic, dark: SW.tunicDark, panel: SW.cream, trim: SW.gold, cloth: SW.cloth, clothDark: SW.clothDark, accent: SW.tunic, steel: SW.steel, steelEm: 0x0c1218 },
  ranger:       { robe: 0x3f7a45, dark: 0x274f2d, panel: 0xd9c79a, trim: 0xc99a4a, cloth: 0x4a6b3a, clothDark: 0x2d4424, accent: 0xb8442e, steel: SW.steel, steelEm: 0x0c1218, motif: 'leaf' },
  paladin:      { robe: 0xece4cf, dark: 0xb9ab88, panel: 0x2f5fb0, trim: 0xf0c25a, cloth: 0x2f4f9a, clothDark: 0x1f3570, accent: 0x2f5fb0, steel: 0xe2e6ee, steelEm: 0x1a1608, motif: 'sun' },
  spiritcaller: { robe: 0x6f8f3e, dark: 0x4a6328, panel: 0xb8763a, trim: 0xe7d38a, cloth: 0x8a5a32, clothDark: 0x5e3b20, accent: 0xc0603a, steel: SW.steel, steelEm: 0x0c1218, motif: 'spiral' },
  shadowblade:  { robe: 0x2d2742, dark: 0x1b172a, panel: 0x6a3fa0, trim: 0xb98bff, cloth: 0x231e33, clothDark: 0x15111f, accent: 0x6a3fa0, steel: SW.steel, steelEm: 0x0c1218, motif: 'moon' },
};

function motifDraw(g, motif, x, y, r) {
  if (motif === 'leaf') {
    g.beginPath(); g.ellipse(x, y, r * 0.45, r, 0.5, 0, Math.PI * 2); g.fill();
  } else if (motif === 'sun') {
    g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillRect(x + Math.cos(a) * r * 0.7 - 1.5, y + Math.sin(a) * r * 0.7 - 1.5, 3, 3); }
  } else if (motif === 'spiral') {
    g.beginPath(); for (let i = 0; i < 18; i++) { const a = i * 0.7, rr = i / 18 * r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.stroke();
  } else if (motif === 'moon') {
    g.beginPath(); g.arc(x, y, r * 0.6, 0.6, Math.PI * 2 - 0.6); g.arc(x + r * 0.3, y, r * 0.45, Math.PI * 2 - 0.9, 0.9, true); g.fill();
  } else star(g, x, y, r);
}
function robeTextures(P) {
  const torso = latheTexture((g, W, H) => {
    g.fillStyle = hex(P.robe); g.fillRect(0, 0, W, H);
    folds(g, W, H, 10, 0.1);
    const hw = 0.034 * W, bw = 0.012 * W;
    g.fillStyle = hex(P.panel); g.fillRect(0, 0, hw, H); g.fillRect(W - hw, 0, hw, H);
    g.fillStyle = hex(P.trim); g.fillRect(hw, 0, bw, H); g.fillRect(W - hw - bw, 0, bw, H);
    g.fillStyle = hex(P.trim); g.strokeStyle = hex(P.trim); g.lineWidth = 2;
    for (let i = 0; i < 3; i++) motifDraw(g, P.motif, W * 0.5, H * (0.3 + i * 0.22), 7);
  });
  const skirt = latheTexture((g, W, H) => {
    g.fillStyle = hex(P.robe); g.fillRect(0, 0, W, H);
    folds(g, W, H, 14, 0.13);
    const hemTop = H * 0.84, bandTop = H * 0.9;
    const hw = 0.04 * W, bw = 0.012 * W;
    g.fillStyle = hex(P.panel); g.fillRect(0, 0, hw, hemTop); g.fillRect(W - hw, 0, hw, hemTop);
    g.fillStyle = hex(P.trim); g.fillRect(hw, 0, bw, hemTop); g.fillRect(W - hw - bw, 0, bw, hemTop);
    g.fillStyle = hex(P.trim); g.strokeStyle = hex(P.trim); g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const x = (i + 0.5) / 14 * W; if (x < W * 0.08 || x > W * 0.92) continue; motifDraw(g, P.motif, x, H * 0.76 + (i % 2) * 6, 6); }
    g.fillStyle = hex(P.dark); g.fillRect(0, hemTop, W, bandTop - hemTop);
    g.fillStyle = hex(P.trim); g.fillRect(0, bandTop, W, H - bandTop);
  });
  return { torso, skirt };
}
const CAPE_EMBLEMS = {
  bow(g, W, H) { g.lineWidth = 4; g.beginPath(); g.arc(W / 2 + 18, H * 0.45, 30, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - 6, H * 0.45 - 27); g.lineTo(W / 2 - 6, H * 0.45 + 27); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2 - 22, H * 0.45); g.lineTo(W / 2 + 26, H * 0.45); g.stroke();
    g.beginPath(); g.moveTo(W / 2 + 30, H * 0.45); g.lineTo(W / 2 + 20, H * 0.45 - 6); g.lineTo(W / 2 + 20, H * 0.45 + 6); g.fill(); },
  sun(g, W, H) { g.beginPath(); g.arc(W / 2, H * 0.45, 14, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.save(); g.translate(W / 2, H * 0.45); g.rotate(a); g.fillRect(-2, -34, 4, 14); g.restore(); }
    g.fillRect(W / 2 - 3, H * 0.45 - 46, 6, 92); g.fillRect(W / 2 - 24, H * 0.45 - 3, 48, 6); },
  leaf(g, W, H) { for (let i = 0; i < 3; i++) { g.save(); g.translate(W / 2, H * 0.48); g.rotate(-0.7 + i * 0.7); g.beginPath(); g.ellipse(0, -22, 9, 22, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.beginPath(); g.arc(W / 2, H * 0.48, 34, 0, Math.PI * 2); g.lineWidth = 3; g.stroke(); },
  moon(g, W, H) { g.beginPath(); g.arc(W / 2, H * 0.45, 26, 0.5, Math.PI * 2 - 0.5); g.arc(W / 2 + 14, H * 0.45, 20, Math.PI * 2 - 0.8, 0.8, true); g.fill();
    g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2 - 34, H * 0.45 + 34); g.lineTo(W / 2 + 34, H * 0.45 - 34); g.stroke(); },
};
function capeTexture(P, emblem) {
  const W = 128, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hex(P.clothDark)); grad.addColorStop(1, hex(P.cloth));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = hex(P.panel); g.fillRect(0, H - 32, W, 12);
  g.fillStyle = hex(P.trim); g.fillRect(0, H - 18, W, 18); g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  g.fillStyle = hex(P.trim); g.strokeStyle = hex(P.trim);
  for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, H - 32); g.lineTo(x + 8, H - 40); g.lineTo(x + 16, H - 32); g.fill(); }
  (CAPE_EMBLEMS[emblem] || CAPE_EMBLEMS.sun)(g, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ outfits (data)
// show: gear groups visible for the class. weapon/offhand from CLASS_DEFS. tex: 'robe' (original), 'tunic' (swordsman) or 'own'.
export const CLASS_OUTFITS = {
  mage:         { show: ['hat', 'staff', 'staffParts', 'capelet', 'brooch', 'vial', 'braid'], tex: 'robe', emblem: null },
  sword:        { show: ['swordArmor', 'hood', 'headband', 'scabbard', 'buckler', 'swordHand', 'braid'], tex: 'tunic', emblem: null },
  ranger:       { show: ['bow', 'quiver', 'rangerHood', 'bracerL', 'capelet', 'braid', 'feathers'], tex: 'own', emblem: 'bow' },
  paladin:      { show: ['paladinArmor', 'tabard', 'circlet', 'shield', 'hammer', 'braid'], tex: 'own', emblem: 'sun' },
  spiritcaller: { show: ['staff', 'totem', 'antlers', 'necklace', 'vial', 'sash', 'braid'], tex: 'own', emblem: 'leaf' },
  shadowblade:  { show: ['shadowHood', 'mask', 'scarf', 'bracers', 'daggers', 'braid'], tex: 'own', emblem: 'moon' },
  none:         { show: ['capelet', 'brooch', 'braid'], tex: 'robe', emblem: null },
};

// ------------------------------------------------------------------ geometry helpers (low poly)
function tubeAlong(points, radius, radial = 5, seg = 14) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, seg, radius, radial, false);
}
function daggerGeo(len, w, th) {
  // short leaf blade: diamond section, along +Y from 0 to len
  const N = 5, verts = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N, y = f * len * 0.84;
    const ww = w * (f < 0.3 ? 0.85 + f * 0.5 : 1 - (f - 0.3) * 0.75);
    verts.push(-ww / 2, y, 0, 0, y, th / 2, ww / 2, y, 0, 0, y, -th / 2);
  }
  verts.push(0, len, 0);
  const T = (N + 1) * 4;
  for (let i = 0; i < N; i++) { const a = i * 4, b = (i + 1) * 4; for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(a + k, a + k2, b + k2, a + k, b + k2, b + k); } }
  const last = N * 4; for (let k = 0; k < 4; k++) idx.push(last + k, last + (k + 1) % 4, T);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}

/**
 * Build all class gear on the rig (call before skinMerge). Returns the class-gear handle used by player.js.
 * swordGear: the result of buildSwordGear (its materials and pieces are reused).
 */
export function buildClassGear(rig, swordGear) {
  const M = rig.materials, G = swordGear.M;
  const groups = {};               // name → [Object3D]
  const add = (name, o) => { (groups[name] ||= []).push(o); return o; };
  const sockets = {};
  const chains = [];               // spring chains: {name, links:[Group], rest:[Euler-like {x,z}], stiff, damp, gravity, len}
  const newParts = new Set();      // meshes created here (for draw-call key alignment)
  const track = (root) => { root.traverse((o) => { if (o.isMesh && o.name !== 'outline') newParts.add(o); }); return root; };

  // ---------- existing pieces as named groups ----------
  if (rig.hat) add('hat', rig.hat);
  if (rig.staff) add('staff', rig.staff);
  if (rig.capelet) add('capelet', rig.capelet);
  if (rig.brooch) add('brooch', rig.brooch);
  if (rig.vial) add('vial', rig.vial);
  rig.staffParts = rig.staff ? rig.staff.children.filter((c) => c !== rig.gemPivot) : [];
  for (const o of rig.staffParts) add('staffParts', o);
  const NAME_GROUPS = { sword: ['swordHand'], sheathedHilt: ['scabbard'], scabbard: ['scabbard'], buckler: ['buckler'], hood: ['hood'],
    headband: ['headband'], pauldron: ['swordArmor', 'paladinArmor'], breastplate: ['swordArmor', 'paladinArmor'],
    bracer: ['swordArmor', 'paladinArmor', 'bracers'] };
  for (const o of swordGear.all) for (const g of NAME_GROUPS[o.name] || ['swordArmor']) add(g, o);   // (chest strap → swordArmor)

  // ---------- braid (all classes): 3 spring links under the head ----------
  {
    const anchor = grp(rig.head, 0, -0.06, -0.17, 'braid');
    const links = []; let parent = anchor;
    const segGeo = new THREE.SphereGeometry(0.036, 7, 5); segGeo.scale(1, 1.5, 1);
    for (let i = 0; i < 3; i++) {
      const l = grp(parent, 0, i === 0 ? 0 : -0.085, 0, 'braid' + i);
      const s = mk(segGeo, M.hair, l, { pos: [0, -0.04, 0], scale: [1 - i * 0.18, 1, 1 - i * 0.18], outline: 0.008 });
      s.userData.noMerge = true;
      links.push(l); parent = l;
    }
    mk(new THREE.TorusGeometry(0.028, 0.01, 4, 8), M.gold, links[0], { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0], outline: 0 }).userData.noMerge = true;
    add('braid', anchor); track(anchor);
    chains.push({ name: 'braid', links, rest: links.map((_, i) => ({ x: 0.25 + i * 0.12, z: 0 })), stiff: 70, damp: 7, gravity: 1, inertia: 1 });
  }

  // ==================================================================== BOW (ranger)
  {
    const bow = grp(rig.handL, 0.0, -0.02, 0.02, 'bow');
    rig.bow = bow;
    const L = 0.66, brace = 0.13;
    const limb = (s) => [new THREE.Vector3(0, 0.06 * s, 0.0), new THREE.Vector3(0, 0.3 * s, 0.035), new THREE.Vector3(0, 0.52 * s, 0.02), new THREE.Vector3(0, L * s, -0.06), new THREE.Vector3(0, (L + 0.05) * s, -brace + 0.04)];
    for (const s of [1, -1]) {
      mk(tubeAlong(limb(s), 0.018, 5, 12), M.woodDark, bow, { outline: 0.008 });
      mk(new THREE.ConeGeometry(0.02, 0.06, 5).rotateX(s > 0 ? 0.6 : Math.PI - 0.6), G.gold, bow, { pos: [0, (L + 0.05) * s, -brace + 0.04], outline: 0 });
    }
    mk(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 7), G.leather, bow, { outline: 0.008 });
    mk(new THREE.OctahedronGeometry(0.022), G.gold, bow, { pos: [0, 0, 0.026], scale: [1, 1.4, 0.6], outline: 0 });
    // string: two thin segments from the tips to the nock; player.js moves the nock with the draw hand
    const strGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 3); strGeo.translate(0, 0.5, 0);
    const tipTop = new THREE.Vector3(0, L + 0.05, -brace + 0.04), tipBot = new THREE.Vector3(0, -(L + 0.05), -brace + 0.04);
    const strTop = grp(bow, tipTop.x, tipTop.y, tipTop.z, 'stringTop'), strBot = grp(bow, tipBot.x, tipBot.y, tipBot.z, 'stringBot');
    mk(strGeo, G.blade, strTop, { outline: 0, shadow: false }); mk(strGeo, G.blade, strBot, { outline: 0, shadow: false });
    const nock = grp(bow, 0, 0, -brace, 'nock');
    // nocked arrow (visible while drawing): shaft along +Z from the nock
    const arrow = grp(nock, 0, 0, 0, 'nockedArrow');
    mk(new THREE.CylinderGeometry(0.006, 0.006, 0.74, 4).rotateX(Math.PI / 2), M.wood, arrow, { pos: [0, 0, 0.37], outline: 0, shadow: false });
    mk(new THREE.ConeGeometry(0.016, 0.06, 4).rotateX(Math.PI / 2), G.steel, arrow, { pos: [0, 0, 0.76], outline: 0, shadow: false });
    for (let i = 0; i < 3; i++) {
      const f = mk(new THREE.PlaneGeometry(0.03, 0.09), G.blade, arrow, { pos: [0, 0, 0.06], rot: [0, 0, i * Math.PI * 2 / 3], outline: 0, shadow: false });
      f.geometry.rotateX(Math.PI / 2); f.position.set(Math.sin(i * 2.09) * 0.012, Math.cos(i * 2.09) * 0.012, 0.06);
    }
    arrow.visible = false;
    sockets.bow = { grip: bow, nock, strTop, strBot, tipTop, tipBot, rest: new THREE.Vector3(0, 0, -brace), arrow };
    add('bow', bow); track(bow);
    // bracer (archery guard) on the left forearm
    const bracer = grp(rig.elbowL, 0, -0.17, 0, 'bracerL');
    mk(new THREE.CylinderGeometry(0.052, 0.046, 0.16, 8), G.leatherDark, bracer, { outline: 0.008 });
    mk(new THREE.TorusGeometry(0.05, 0.008, 4, 10), G.gold, bracer, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    add('bracerL', bracer); track(bracer);
    // quiver on the back + feather spring links
    const quiver = grp(rig.torso, 0.12, 0.3, -0.22, 'quiver');
    quiver.rotation.set(0.15, 0, 0.42);
    mk(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8).translate(0, 0.0, 0), G.leather, quiver, { outline: 0.01 });
    mk(new THREE.TorusGeometry(0.06, 0.012, 4, 10), G.gold, quiver, { pos: [0, 0.23, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    mk(new THREE.TorusGeometry(0.052, 0.01, 4, 10), G.gold, quiver, { pos: [0, -0.18, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    const strap = mk(new THREE.TorusGeometry(0.25, 0.014, 4, 18), G.leatherDark, rig.torso, { pos: [0, 0.27, 0], rot: [Math.PI / 2, -0.75, 0], scale: [0.95, 0.72, 1], outline: 0 });
    const featherGeo = new THREE.PlaneGeometry(0.035, 0.11); featherGeo.translate(0, 0.055, 0);
    const shaftGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.12, 3); shaftGeo.translate(0, 0.06, 0);
    const fLinks = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const l = grp(quiver, Math.cos(a) * 0.025, 0.25, Math.sin(a) * 0.025, 'feather' + i);
      mk(shaftGeo, M.wood, l, { outline: 0, shadow: false });
      const f = mk(featherGeo, i === 1 ? G.red : G.blade, l, { pos: [0, 0.1, 0], rot: [0, a, 0], outline: 0, shadow: false });
      f.userData.noMerge = true;
      fLinks.push(l);
    }
    add('quiver', quiver); track(quiver);
    add('quiver', strap); track(strap);
    chains.push({ name: 'feathers', links: fLinks, parallel: true, rest: fLinks.map((_, i) => ({ x: 0.08 * (i - 1), z: 0.1 * (i - 1) })), stiff: 120, damp: 9, gravity: 0.3, inertia: 1.4 });
    // ranger hood (raised, leafy cloth)
    const hood = grp(rig.head, 0, 0.02, -0.01, 'rangerHood');
    mk(new THREE.SphereGeometry(0.185, 14, 9, Math.PI * 0.82, Math.PI * 1.36, 0, Math.PI * 0.62), M.robeDark, hood, { pos: [0, 0.0, -0.01], scale: [1.02, 1.05, 1.08], outline: 0.012 });
    mk(new THREE.ConeGeometry(0.07, 0.2, 6).rotateX(-Math.PI * 0.62), M.robeDark, hood, { pos: [0, -0.02, -0.2], outline: 0.01 });
    const cowl = grp(rig.torso, 0, 0.52, -0.01, 'rangerCowl');
    mk(new THREE.LatheGeometry([[0.12, 0.07], [0.17, 0.02], [0.21, -0.05], [0.25, -0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 14), M.robeDark, cowl, { outline: 0.01 });
    add('rangerHood', hood); add('rangerHood', cowl); track(hood); track(cowl);
  }

  // ==================================================================== HAMMER + SHIELD + TABARD (paladin)
  {
    const buildHammer = (parent, name) => {
      const h = grp(parent, 0, 0, 0, name);
      mk(new THREE.CylinderGeometry(0.022, 0.026, 0.72, 7).translate(0, 0.18, 0), M.woodDark, h, { outline: 0.008 });
      mk(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 7), G.leatherDark, h, { pos: [0, -0.02, 0], outline: 0.008 });
      mk(new THREE.SphereGeometry(0.035, 7, 5), G.gold, h, { pos: [0, -0.15, 0], outline: 0.006 });
      const head = grp(h, 0, 0.58, 0, name + 'Head');
      mk(new THREE.BoxGeometry(0.15, 0.13, 0.27), G.steel, head, { outline: 0.01 });
      for (const z of [0.14, -0.14]) mk(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 8).rotateX(Math.PI / 2), G.steel, head, { pos: [0, 0, z], outline: 0.008 });
      for (const z of [0.06, -0.06]) mk(new THREE.BoxGeometry(0.16, 0.14, 0.022), G.gold, head, { pos: [0, 0, z], outline: 0 });
      mk(new THREE.ConeGeometry(0.03, 0.09, 5), G.gold, head, { pos: [0, 0.1, 0], outline: 0.006 });
      mk(new THREE.OctahedronGeometry(0.026), swordGear.gemMat, head, { pos: [0.08, 0, 0], scale: [0.5, 1.2, 1], outline: 0, shadow: false });
      mk(new THREE.OctahedronGeometry(0.026), swordGear.gemMat, head, { pos: [-0.08, 0, 0], scale: [0.5, 1.2, 1], outline: 0, shadow: false });
      return { h, head };
    };
    const inHand = buildHammer(rig.handR, 'hammer');
    sockets.hammer = { group: inHand.h, tip: grp(inHand.h, 0, 0.72, 0, 'hammerTip'), base: grp(inHand.h, 0, 0.12, 0, 'hammerBase'), head: inHand.head };
    const back = grp(rig.torso, 0.08, 0.32, -0.26, 'hammerBackMount'); back.rotation.set(0.12, 0, 2.55);
    const onBack = buildHammer(back, 'hammerBack');
    sockets.hammerBack = onBack.h;
    add('hammer', inHand.h); add('hammer', back); track(inHand.h); track(back);
    sockets.hammerHand = inHand.h;
    // round shield on the left forearm
    const shield = grp(rig.elbowL, 0.085, -0.14, 0.0, 'shield');
    shield.rotation.set(0, 0, -Math.PI / 2);
    const spts = [[0.0, 0.06], [0.09, 0.055], [0.2, 0.035], [0.3, 0.01], [0.315, -0.01]].map(([r, y]) => new THREE.Vector2(r, y));
    mk(new THREE.LatheGeometry(spts, 16), G.steel, shield, { outline: 0.012 });
    mk(new THREE.TorusGeometry(0.31, 0.02, 5, 20), G.gold, shield, { rot: [Math.PI / 2, 0, 0], outline: 0.008 });
    mk(new THREE.CylinderGeometry(0.17, 0.2, 0.012, 16), G.cloth, shield, { pos: [0, 0.042, 0], outline: 0 });
    mk(new THREE.BoxGeometry(0.05, 0.016, 0.34), G.gold, shield, { pos: [0, 0.05, 0], outline: 0 });
    mk(new THREE.BoxGeometry(0.34, 0.016, 0.05), G.gold, shield, { pos: [0, 0.05, 0], outline: 0 });
    mk(new THREE.SphereGeometry(0.055, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), G.gold, shield, { pos: [0, 0.06, 0], outline: 0.008 });
    sockets.shield = grp(shield, 0, 0.1, 0, 'shieldFace');
    add('shield', shield); track(shield);
    // tabard: front + back spring panels under the belt
    const tabGeo = new THREE.PlaneGeometry(0.2, 0.17); tabGeo.translate(0, -0.085, 0);
    for (const [side, z] of [[1, 0.215], [-1, -0.2]]) {
      const anchor = grp(rig.hips, 0, 0.0, z, side > 0 ? 'tabardF' : 'tabardB');
      const links = []; let parent = anchor;
      for (let i = 0; i < 3; i++) {
        const l = grp(parent, 0, i === 0 ? 0 : -0.17, 0, 'tab' + i);
        const m = mk(tabGeo, G.cloth, l, { outline: 0, scale: [1 - i * 0.07, 1, 1] });
        m.userData.noMerge = true;
        if (i === 0) mk(new THREE.PlaneGeometry(0.2, 0.025), G.gold, l, { pos: [0, -0.01, side * 0.004], outline: 0 }).userData.noMerge = true;
        if (i === 1) { const e = mk(new THREE.CircleGeometry(0.045, 8), G.gold, l, { pos: [0, -0.08, side * 0.004], outline: 0 }); e.userData.noMerge = true; if (side < 0) e.rotation.y = Math.PI; }
        if (side < 0) m.rotation.y = Math.PI;
        links.push(l); parent = l;
      }
      add('tabard', anchor); track(anchor);
      chains.push({ name: side > 0 ? 'tabardF' : 'tabardB', links, rest: links.map(() => ({ x: 0, z: 0 })), stiff: 90, damp: 8, gravity: 0.6, inertia: 1, legPush: side, axis: side });
    }
    // circlet with a sun gem
    const circ = grp(rig.head, 0, 0.06, 0, 'circlet');
    mk(new THREE.TorusGeometry(0.162, 0.011, 4, 20), G.gold, circ, { rot: [Math.PI / 2 - 0.1, 0, 0], outline: 0.006 });
    mk(new THREE.OctahedronGeometry(0.024), swordGear.gemMat, circ, { pos: [0, 0.02, 0.16], scale: [1, 1.3, 0.5], outline: 0, shadow: false });
    add('circlet', circ); track(circ);
  }

  // ==================================================================== TWIN DAGGERS + HOOD/MASK/SCARF (shadowblade)
  {
    const dBlade = daggerGeo(0.3, 0.05, 0.016);
    const buildDagger = (parent, name) => {
      const d = grp(parent, 0, 0, 0, name);
      mk(new THREE.CylinderGeometry(0.018, 0.02, 0.11, 6), G.leatherDark, d, { outline: 0.006 });
      mk(new THREE.SphereGeometry(0.024, 6, 4), G.gold, d, { pos: [0, -0.07, 0], outline: 0 });
      const guard = new THREE.BoxGeometry(0.11, 0.02, 0.03);
      { const p = guard.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - Math.pow(Math.abs(x) / 0.055, 2) * 0.02); } guard.computeVertexNormals(); }
      mk(guard, G.steel, d, { pos: [0, 0.06, 0], outline: 0.006 });
      mk(dBlade, G.blade, d, { pos: [0, 0.065, 0], outline: 0.006 });
      mk(new THREE.OctahedronGeometry(0.014), swordGear.gemMat, d, { pos: [0, 0.06, 0.018], outline: 0, shadow: false });
      const tip = grp(d, 0, 0.36, 0, name + 'Tip');
      return { d, tip };
    };
    const R = buildDagger(rig.handR, 'daggerR');
    const L = buildDagger(rig.handL, 'daggerL');
    // left dagger: reverse grip, blade along the forearm (FK hand)
    L.d.rotation.set(Math.PI, 0, 0.15);
    sockets.daggers = { R: R.d, L: L.d, tipR: R.tip, tipL: L.tip };
    add('daggers', R.d); add('daggers', L.d); track(R.d); track(L.d);
    // hip sheaths (shown while sheathed) with a dagger copy each
    const sheaths = [];
    for (const s of [1, -1]) {
      const sh = grp(rig.torso, s * 0.2, -0.02, -0.06, 'daggerSheath');
      sh.rotation.set(0.35, 0, s * 0.35 + Math.PI);
      mk(new THREE.CylinderGeometry(0.03, 0.018, 0.3, 6).translate(0, 0.17, 0).scale(1.4, 1, 0.7), G.leatherDark, sh, { outline: 0.008 });
      const hilt = grp(sh, 0, 0, 0, 'sheathedDagger');
      hilt.rotation.set(Math.PI, 0, 0);
      mk(new THREE.CylinderGeometry(0.018, 0.02, 0.11, 6), G.leatherDark, hilt, { pos: [0, 0.03, 0], outline: 0.006 });
      mk(new THREE.SphereGeometry(0.024, 6, 4), G.gold, hilt, { pos: [0, -0.04, 0], outline: 0 });
      sheaths.push(hilt);
      add('daggers', sh); track(sh);
    }
    sockets.daggerSheathed = sheaths;
    // deep hood + face mask
    const hood = grp(rig.head, 0, 0.02, -0.005, 'shadowHood');
    mk(new THREE.SphereGeometry(0.19, 14, 9, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.64), G.cloth, hood, { scale: [1.04, 1.08, 1.1], outline: 0.012 });
    mk(new THREE.ConeGeometry(0.08, 0.16, 6).rotateX(-0.5), G.cloth, hood, { pos: [0, 0.2, -0.03], outline: 0.008 });
    const cowl = grp(rig.torso, 0, 0.52, -0.01, 'shadowCowl');
    mk(new THREE.LatheGeometry([[0.11, 0.08], [0.16, 0.02], [0.2, -0.05], [0.24, -0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 14), G.cloth, cowl, { outline: 0.01 });
    add('shadowHood', hood); add('shadowHood', cowl); track(hood); track(cowl);
    const mask = grp(rig.head, 0, -0.06, 0.02, 'mask');
    mk(new THREE.SphereGeometry(0.152, 14, 6, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.45, Math.PI * 0.3), G.cloth, mask, { scale: [1.05, 1.0, 1.03], outline: 0.008 });
    add('mask', mask); track(mask);
    // scarf tails: two spring chains from the back of the neck
    const tailGeo = new THREE.PlaneGeometry(0.07, 0.13); tailGeo.translate(0, -0.065, 0);
    for (const s of [1, -1]) {
      const anchor = grp(rig.torso, s * 0.05, 0.53, -0.12, 'scarf');
      const links = []; let parent = anchor;
      for (let i = 0; i < 4; i++) {
        const l = grp(parent, 0, i === 0 ? 0 : -0.13, 0, 'scarf' + i);
        const m = mk(tailGeo, G.red, l, { outline: 0, scale: [1 - i * 0.12, 1, 1] });
        m.userData.noMerge = true;
        links.push(l); parent = l;
      }
      add('scarf', anchor); track(anchor);
      chains.push({ name: 'scarf' + (s > 0 ? 'L' : 'R'), links, rest: links.map((_, i) => ({ x: 0.5 + i * 0.1, z: s * 0.12 })), stiff: 34, damp: 4.5, gravity: 1, inertia: 1.8, wind: 1 });
    }
  }

  // ==================================================================== TOTEM + ANTLERS + NECKLACE + SASH (spiritcaller)
  {
    const totem = grp(rig.staff || rig.handR, 0, 0, 0, 'totem');
    const shaft = new THREE.CylinderGeometry(0.024, 0.032, 1.62, 7, 5);
    { const p = shaft.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 4.2) * 0.012); p.setZ(i, p.getZ(i) + Math.cos(y * 6.1) * 0.01); } shaft.computeVertexNormals(); }
    shaft.translate(0, 0.2, 0);
    mk(shaft, M.wood, totem, { outline: 0.012 });
    // carved face block + rings
    mk(new THREE.BoxGeometry(0.075, 0.12, 0.075), M.woodDark, totem, { pos: [0, 0.95, 0], outline: 0.008 });
    mk(new THREE.BoxGeometry(0.04, 0.015, 0.02), G.gold, totem, { pos: [0, 0.97, 0.04], outline: 0 });
    for (const y of [0.78, 1.05]) mk(new THREE.TorusGeometry(0.034, 0.01, 4, 10), G.gold, totem, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    // forked head (two horns cradling the gem at GEM_Y 1.22)
    for (const s of [1, -1]) {
      mk(tubeAlong([new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(s * 0.07, 1.16, 0), new THREE.Vector3(s * 0.06, 1.3, 0.0), new THREE.Vector3(s * 0.02, 1.36, 0)], 0.013, 4, 8), M.woodDark, totem, { outline: 0.006 });
    }
    mk(new THREE.ConeGeometry(0.03, 0.08, 6).rotateX(Math.PI), G.gold, totem, { pos: [0, -0.62, 0], outline: 0 });
    // hanging charms (3 chains × 2 links)
    const charmGeo = new THREE.OctahedronGeometry(0.022); const cordGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.08, 3); cordGeo.translate(0, -0.04, 0);
    const featherGeo = new THREE.PlaneGeometry(0.03, 0.09); featherGeo.translate(0, -0.045, 0);
    const charmChains = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const anchor = grp(totem, Math.cos(a) * 0.04, 1.08, Math.sin(a) * 0.04, 'charm' + i);
      const l0 = grp(anchor, 0, 0, 0, 'charmA');
      mk(cordGeo, G.leatherDark, l0, { outline: 0, shadow: false });
      const l1 = grp(l0, 0, -0.08, 0, 'charmB');
      if (i === 1) mk(featherGeo, G.blade, l1, { outline: 0, shadow: false }).userData.noMerge = true;
      else mk(charmGeo, i === 0 ? G.gold : M.glass, l1, { pos: [0, -0.02, 0], scale: [1, 1.4, 1], outline: 0, shadow: false });
      charmChains.push([l0, l1]);
    }
    rig.totem = totem;
    add('totem', totem); track(totem);
    for (const [k, links] of charmChains.entries()) chains.push({ name: 'charm' + k, links, rest: [{ x: 0, z: 0 }, { x: 0, z: 0 }], stiff: 40, damp: 3.5, gravity: 1, inertia: 2.2, world: true });
    // antler circlet
    const ant = grp(rig.head, 0, 0.08, -0.02, 'antlers');
    mk(new THREE.TorusGeometry(0.16, 0.012, 4, 18), M.woodDark, ant, { rot: [Math.PI / 2 - 0.15, 0, 0], outline: 0.006 });
    for (const s of [1, -1]) {
      mk(tubeAlong([new THREE.Vector3(s * 0.12, 0.02, 0.0), new THREE.Vector3(s * 0.18, 0.12, -0.02), new THREE.Vector3(s * 0.2, 0.24, -0.06), new THREE.Vector3(s * 0.16, 0.32, -0.08)], 0.012, 4, 8), M.wood, ant, { outline: 0.006 });
      mk(tubeAlong([new THREE.Vector3(s * 0.185, 0.15, -0.03), new THREE.Vector3(s * 0.25, 0.2, -0.02), new THREE.Vector3(s * 0.28, 0.27, -0.03)], 0.009, 4, 6), M.wood, ant, { outline: 0 });
      mk(new THREE.SphereGeometry(0.022, 6, 4), G.gold, ant, { pos: [s * 0.14, 0.03, 0.08], outline: 0 });
    }
    add('antlers', ant); track(ant);
    // bead + tooth necklace
    const neck = grp(rig.torso, 0, 0.5, 0.0, 'necklace');
    mk(new THREE.TorusGeometry(0.14, 0.012, 4, 16), G.leatherDark, neck, { rot: [Math.PI / 2 + 0.35, 0, 0], scale: [1.05, 1, 1], outline: 0 });
    const BEADS = 5; for (let i = 0; i < BEADS; i++) { const a = -0.8 + i * 0.4; mk(new THREE.ConeGeometry(0.014, 0.05, 4).rotateX(Math.PI), i === 2 ? M.glass : G.blade, neck, { pos: [Math.sin(a) * 0.15, -0.05 - Math.cos(a) * 0.01, Math.cos(a) * 0.13 + 0.02], outline: 0, shadow: false }); }
    add('necklace', neck); track(neck);
    // shoulder sash
    const sash = grp(rig.torso, 0, 0.27, 0, 'sash');
    mk(new THREE.TorusGeometry(0.25, 0.03, 4, 18), G.leather, sash, { rot: [Math.PI / 2, 0.75, 0], scale: [0.95, 0.72, 1.4], outline: 0 });
    add('sash', sash); track(sash);
  }

  // hide everything class-specific until an outfit is chosen
  for (const k of Object.keys(groups)) if (!['hat', 'staff', 'staffParts', 'capelet', 'brooch', 'vial', 'braid'].includes(k)) for (const o of groups[k]) o.visible = false;

  const tex = {};
  for (const cls of Object.keys(PALETTES)) {
    const o = CLASS_OUTFITS[cls];
    if (!o || o.tex !== 'own') continue;
    tex[cls] = { ...robeTextures(PALETTES[cls]), cape: capeTexture(PALETTES[cls], o.emblem) };
  }
  return { groups, sockets, chains, newParts, tex, swordGear, current: null };
}

/**
 * Align new parts' castShadow with an existing (material, shadow) skinMerge group so the merge produces no extra
 * draw calls. Call after the player's shadow-pruning pass and before skinMerge.
 */
export function alignMergeKeys(root, cg) {
  const keys = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o.name === 'outline' || cg.newParts.has(o)) return;
    keys.add(o.material.uuid + '|' + (o.castShadow ? 1 : 0));
  });
  let flipped = 0, missing = 0;
  for (const o of cg.newParts) {
    if (keys.has(o.material.uuid + '|' + (o.castShadow ? 1 : 0))) continue;
    if (keys.has(o.material.uuid + '|' + (o.castShadow ? 0 : 1))) { o.castShadow = !o.castShadow; flipped++; }
    else missing++;
  }
  return { flipped, missing };
}

const _origTex = { torso: null, skirt: null, cape: null };
/**
 * Generalized setOutfit (CONTRACT §10.1): CLASS_OUTFITS[cls] → visibility + robe/cloth tints + textures.
 * cls null → the neutral villager look ('none').
 */
export function setClassOutfit(rig, cg, cape, cls) {
  const key = cls && CLASS_OUTFITS[cls] ? cls : 'none';
  const O = CLASS_OUTFITS[key];
  const show = new Set(O.show);
  for (const list of Object.values(cg.groups)) for (const o of list) o.visible = false;   // a piece may sit in several groups:
  for (const name of show) for (const o of cg.groups[name] || []) o.visible = true;         // visible if ANY shown group has it
  // staff decorations vs totem: the staff group stays visible while either uses it
  if (rig.staff) rig.staff.visible = show.has('staff');
  const P = PALETTES[key] || PALETTES.mage;
  const G = cg.swordGear.M;
  G.cloth.color.setHex(P.cloth); G.clothDark.color.setHex(P.clothDark);
  G.red.color.setHex(P.accent);
  G.steel.color.setHex(P.steel);   // paladin plate is polished silver, the sword's is steel
  if (G.steel.emissive) G.steel.emissive.setHex(P.steelEm);
  const texSet = O.tex === 'tunic' ? cg.swordGear.tex : O.tex === 'own' ? cg.tex[key] : null;
  rig.root.traverse((o) => {
    if (!o.isMesh || o.name === 'outline' || !o.userData.skin) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const k = o.userData.skin;
      if (k === 'robe') m.color.setHex(O.tex === 'own' ? P.robe : O.tex === 'tunic' ? SW.tunic : COLORS.robe);
      else if (k === 'torso' || k === 'skirt') {
        if (!_origTex[k]) _origTex[k] = m.map;
        m.map = texSet ? texSet[k] : _origTex[k];
      }
    }
  });
  if (rig.materials?.robeDark) rig.materials.robeDark.color.setHex(O.tex === 'own' ? P.dark : COLORS.robeDark);
  if (cape?.mesh?.material) {
    const m = cape.mesh.material;
    if (!_origTex.cape) _origTex.cape = m.map;
    m.map = texSet ? texSet.cape : _origTex.cape;
  }
  cg.current = key;
  return key;
}

/** Weapon kind of a class (from CLASS_DEFS). */
export function weaponOf(cls) { return CLASS_DEFS[cls]?.weapon || styleOf(cls); }
