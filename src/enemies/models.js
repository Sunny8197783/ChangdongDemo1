// Procedural enemy models. Every model faces +Z in local space; object root sits at the feet.
import * as THREE from 'three';
import { toonMat, ELEMENT_COLORS } from '../core/utils.js';
import { P, mergeParts, vcMat, vcFlatMat, vcBasicMat, pivot, rockGeo, glowSpriteMat, buildSkin } from './common.js';

const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const C = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const K = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const CAP = (r, l, n = 8) => new THREE.CapsuleGeometry(r, l, 4, n);
const T = (r, t, n = 12) => new THREE.TorusGeometry(r, t, 6, n);

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

// ======================================================================= Bokoblin
const BK = {
  skin: 0xe8645a, skinDark: 0xc24a48, belly: 0xf6a88e, bone: 0xf2e6c4, horn: 0xe9dcb4, cloth: 0xc79a5a,
  clothDark: 0x8a5e34, leather: 0x6b4126, eye: 0xffe14a, pupil: 0x1a0f08, wood: 0x9a6a3c, woodDark: 0x6a4424, nose: 0x9e3a3e,
};
function bokoGeos() {
  return once('boko', () => ({
    torso: mergeParts([
      P(S(0.42, 16, 12), BK.skin, [0, 0.3, 0], [0, 0, 0], [1.12, 1.0, 0.88]),
      P(S(0.34, 14, 10), BK.belly, [0, 0.22, 0.17], [0, 0, 0], [0.95, 0.9, 0.62]),
      P(S(0.2), BK.skin, [0.36, 0.5, 0], [0, 0, 0], [1.1, 0.9, 1]),
      P(S(0.2), BK.skin, [-0.36, 0.5, 0], [0, 0, 0], [1.1, 0.9, 1]),
      P(T(0.3, 0.025, 16), BK.leather, [0, 0.6, 0.02], [Math.PI / 2 - 0.25, 0, 0], [1, 1, 1]),
      P(K(0.045, 0.14, 6), BK.bone, [0.13, 0.52, 0.27], [2.6, 0, 0.2]),
      P(K(0.05, 0.16, 6), BK.bone, [0, 0.5, 0.3], [2.6, 0, 0]),
      P(K(0.045, 0.14, 6), BK.bone, [-0.13, 0.52, 0.27], [2.6, 0, -0.2]),
      P(B(0.36, 0.05, 0.05), BK.skinDark, [0, 0.12, -0.33], [0.2, 0, 0]),
    ]),
    pelvis: mergeParts([
      P(S(0.3, 14, 10), BK.skin, [0, 0, 0], [0, 0, 0], [1.15, 0.7, 0.9]),
      P(T(0.33, 0.06, 18), BK.leather, [0, 0.06, 0], [Math.PI / 2, 0, 0], [1.05, 0.85, 1]),
      P(B(0.11, 0.1, 0.04), 0xd8b45a, [0, 0.06, 0.29]),
      P(B(0.34, 0.42, 0.04), BK.cloth, [0, -0.22, 0.27], [0.08, 0, 0]),
      P(B(0.3, 0.06, 0.045), BK.clothDark, [0, -0.41, 0.29], [0.08, 0, 0]),
      P(B(0.38, 0.38, 0.04), BK.clothDark, [0, -0.2, -0.27], [-0.08, 0, 0]),
    ]),
    head: mergeParts([
      P(S(0.36, 16, 12), BK.skin, [0, 0.16, 0], [0, 0, 0], [1.05, 0.92, 1]),
      P(S(0.2, 14, 10), BK.skin, [0, 0.06, 0.32], [0, 0, 0], [1.25, 0.95, 1]),
      P(S(0.035, 6, 5), BK.nose, [0.08, 0.1, 0.51]),
      P(S(0.035, 6, 5), BK.nose, [-0.08, 0.1, 0.51]),
      P(S(0.22, 12, 8), BK.skinDark, [0, -0.08, 0.22], [0, 0, 0], [1.1, 0.45, 0.95]),
      P(K(0.035, 0.12, 6), BK.bone, [0.15, -0.0, 0.38], [0.15, 0, -0.15]),
      P(K(0.035, 0.12, 6), BK.bone, [-0.15, -0.0, 0.38], [0.15, 0, 0.15]),
      P(K(0.07, 0.3, 8), BK.horn, [0.16, 0.48, 0.02], [-0.35, 0, -0.5]),
      P(K(0.07, 0.3, 8), BK.horn, [-0.16, 0.48, 0.02], [-0.35, 0, 0.5]),
      P(K(0.09, 0.42, 6), BK.skin, [0.42, 0.18, -0.02], [0, 0.2, -1.25], [1, 1, 0.45]),
      P(K(0.09, 0.42, 6), BK.skin, [-0.42, 0.18, -0.02], [0, -0.2, 1.25], [1, 1, 0.45]),
      P(B(0.14, 0.04, 0.05), 0x5a1f22, [0.14, 0.32, 0.28], [0, 0, -0.35]),
      P(B(0.14, 0.04, 0.05), 0x5a1f22, [-0.14, 0.32, 0.28], [0, 0, 0.35]),
      P(S(0.075, 10, 8), BK.eye, [0.15, 0.24, 0.28]),
      P(S(0.075, 10, 8), BK.eye, [-0.15, 0.24, 0.28]),
      P(S(0.036, 8, 6), BK.pupil, [0.155, 0.24, 0.345]),
      P(S(0.036, 8, 6), BK.pupil, [-0.155, 0.24, 0.345]),
    ]),
    upperArm: mergeParts([
      P(CAP(0.12, 0.2), BK.skin, [0, -0.17, 0]),
    ]),
    foreArm: mergeParts([
      P(CAP(0.125, 0.16), BK.skin, [0, -0.15, 0]),
      P(C(0.14, 0.14, 0.08, 10), BK.leather, [0, -0.2, 0]),
      P(S(0.14, 10, 8), BK.skinDark, [0, -0.34, 0.02], [0, 0, 0], [1, 0.9, 1.1]),
    ]),
    thigh: mergeParts([P(CAP(0.14, 0.14), BK.skin, [0, -0.15, 0])]),
    shin: mergeParts([
      P(CAP(0.13, 0.12), BK.skinDark, [0, -0.14, 0]),
      P(C(0.15, 0.15, 0.07, 10), BK.cloth, [0, -0.09, 0]),
      P(S(0.15, 10, 8), BK.skinDark, [0, -0.3, 0.07], [0, 0, 0], [1, 0.55, 1.5]),
    ]),
    club: mergeParts([
      P(C(0.035, 0.045, 0.32, 8), BK.woodDark, [0, 0, 0.0], [Math.PI / 2, 0, 0]),
      P(T(0.05, 0.018, 8), 0xc79a5a, [0, 0, 0.06]),
      P(T(0.05, 0.018, 8), 0xc79a5a, [0, 0, -0.06]),
      P(C(0.11, 0.05, 0.62, 9), BK.wood, [0, 0, 0.46], [Math.PI / 2, 0, 0]),
      P(S(0.12, 10, 8), BK.wood, [0, 0, 0.78], [0, 0, 0], [1, 1, 1.1]),
      P(K(0.035, 0.12, 5), BK.bone, [0.11, 0.03, 0.66], [0, 0, -1.4]),
      P(K(0.035, 0.12, 5), BK.bone, [-0.11, 0.02, 0.6], [0, 0, 1.4]),
      P(K(0.035, 0.12, 5), BK.bone, [0, 0.12, 0.72], [0, 0, 0]),
      P(K(0.035, 0.12, 5), BK.bone, [0.02, -0.11, 0.56], [Math.PI, 0, 0]),
      P(K(0.04, 0.12, 5), BK.bone, [0, 0.02, 0.9], [Math.PI / 2, 0, 0]),
    ]),
  }));
}

/** Humanoid rig shared by bokoblin and shaman: pivots (bones) + rigid part list per bone. */
export function humanoid(g, o) {
  const root = new THREE.Group();
  const rig = pivot(root, 0, o.hipY, 0);
  const spine = pivot(rig, 0, 0.08, 0);
  const neck = pivot(spine, 0, o.neckY, 0.02);
  const sh = o.shoulderX;
  const armR = pivot(spine, -sh, o.shoulderY, 0), armL = pivot(spine, sh, o.shoulderY, 0);
  const foreR = pivot(armR, 0, -o.upperLen, 0), foreL = pivot(armL, 0, -o.upperLen, 0);
  const handR = pivot(foreR, 0, -o.foreLen, 0.03), handL = pivot(foreL, 0, -o.foreLen, 0.03);
  const legR = pivot(rig, -o.hipX, -0.06, 0), legL = pivot(rig, o.hipX, -0.06, 0);
  const kneeR = pivot(legR, 0, -o.thighLen, 0), kneeL = pivot(legL, 0, -o.thighLen, 0);
  const bones = [rig, spine, neck, armR, armL, foreR, foreL, handR, handL, legR, legL, kneeR, kneeL];
  const parts = [[0, g.pelvis], [1, g.torso], [2, g.head], [3, g.upperArm], [4, g.upperArm], [5, g.foreArm], [6, g.foreArm],
    [9, g.thigh], [10, g.thigh], [11, g.shin], [12, g.shin]];
  return { root, rig, spine, neck, armR, armL, foreR, foreL, handR, handL, legR, legL, kneeR, kneeL, bones, parts };
}

export function buildBokoblin() {
  const g = bokoGeos();
  const m = humanoid(g, { hipY: 0.74, neckY: 0.66, shoulderX: 0.46, shoulderY: 0.48, upperLen: 0.36, foreLen: 0.3, hipX: 0.2, thighLen: 0.32 });
  const club = pivot(m.handR);
  club.rotation.x = -0.55; // tilt toward the forearm direction
  m.bones.push(club); m.parts.push([m.bones.length - 1, g.club]);
  const sk = buildSkin('boko', m.root, m.bones, [{ name: 'body', mat: vcMat(), parts: m.parts, outline: 0.022 }], [1.0, 1.6]);
  m.weapon = club;
  m.skin = sk; m.outlines = sk.outlines;
  m.headTop = 1.75;
  return m;
}

// ======================================================================= Shaman
const SH = { skin: 0x6fa6b8, skinDark: 0x4f8197, robe: 0x5d3f96, robeDark: 0x3d2a6a, trim: 0xe7c05a, bone: 0xf0e4c6, hood: 0x4a3280 };
function shamanGeos() {
  return once('shaman', () => {
    const robe = new THREE.CylinderGeometry(0.26, 0.5, 0.82, 14, 1, true);
    return {
      torso: mergeParts([
        P(S(0.32, 14, 10), SH.robe, [0, 0.26, 0], [0, 0, 0], [1.05, 1.1, 0.9]),
        P(C(0.2, 0.32, 0.1, 14), SH.trim, [0, 0.06, 0]),
        P(S(0.16), SH.robe, [0.3, 0.42, 0], [0, 0, 0], [1.1, 0.9, 1]),
        P(S(0.16), SH.robe, [-0.3, 0.42, 0], [0, 0, 0], [1.1, 0.9, 1]),
        P(T(0.22, 0.03, 14), SH.bone, [0, 0.47, 0.06], [Math.PI / 2 - 0.3, 0, 0]),
        P(S(0.06, 8, 6), 0xff5a8a, [0, 0.4, 0.27]),
        P(K(0.36, 0.42, 12), SH.hood, [0, 0.62, -0.18], [-0.9, 0, 0], [1, 1, 0.7]),
      ]),
      pelvis: mergeParts([
        P(robe, SH.robe, [0, -0.32, 0]),
        P(new THREE.CylinderGeometry(0.505, 0.52, 0.08, 14, 1, true), SH.trim, [0, -0.72, 0]),
        P(T(0.26, 0.045, 14), SH.robeDark, [0, 0.06, 0], [Math.PI / 2, 0, 0]),
        P(B(0.12, 0.34, 0.03), SH.trim, [0, -0.2, 0.34], [0.25, 0, 0]),
      ]),
      head: mergeParts([
        P(S(0.27, 14, 10), SH.skin, [0, 0.1, 0.02]),
        P(S(0.15, 12, 8), SH.skin, [0, 0.03, 0.25], [0, 0, 0], [1.2, 0.9, 1]),
        P(S(0.028, 6, 5), 0x2d4a5c, [0.06, 0.06, 0.39]),
        P(S(0.028, 6, 5), 0x2d4a5c, [-0.06, 0.06, 0.39]),
        P(K(0.07, 0.34, 6), SH.skin, [0.34, 0.06, -0.02], [0, 0.2, -1.3], [1, 1, 0.4]),
        P(K(0.07, 0.34, 6), SH.skin, [-0.34, 0.06, -0.02], [0, -0.2, 1.3], [1, 1, 0.4]),
        // hood
        P(new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), SH.hood, [0, 0.14, -0.05], [-0.35, 0, 0], [1.02, 1.05, 1.05]),
        P(K(0.16, 0.5, 8), SH.hood, [0, 0.36, -0.42], [-2.1, 0, 0]),
        P(T(0.33, 0.035, 16), SH.trim, [0, 0.11, 0.18], [0.35, 0, 0], [1, 1.1, 1]),
        P(K(0.025, 0.1, 5), SH.bone, [0.08, 0.38, 0.16], [0.4, 0, -0.5]),
        P(K(0.025, 0.1, 5), SH.bone, [-0.08, 0.38, 0.16], [0.4, 0, 0.5]),
      ]),
      eyes: mergeParts([
        P(S(0.05, 8, 6), 0xffffff, [0.1, 0.16, 0.24], [0, 0, 0], [1.2, 0.7, 0.6]),
        P(S(0.05, 8, 6), 0xffffff, [-0.1, 0.16, 0.24], [0, 0, 0], [1.2, 0.7, 0.6]),
      ]),
      upperArm: mergeParts([P(C(0.1, 0.15, 0.3, 10), SH.robe, [0, -0.15, 0])]),
      foreArm: mergeParts([
        P(C(0.15, 0.2, 0.26, 10, 1), SH.robeDark, [0, -0.12, 0]),
        P(C(0.205, 0.205, 0.05, 10), SH.trim, [0, -0.25, 0]),
        P(S(0.09, 10, 8), SH.skin, [0, -0.3, 0.02]),
      ]),
      thigh: mergeParts([P(CAP(0.08, 0.1), SH.robeDark, [0, -0.1, 0])]),
      shin: mergeParts([P(CAP(0.07, 0.06), SH.skinDark, [0, -0.08, 0]), P(S(0.1, 8, 6), 0x4a3424, [0, -0.17, 0.05], [0, 0, 0], [1, 0.5, 1.5])]),
      staff: mergeParts([
        P(C(0.03, 0.035, 1.75, 7), SH.bone, [0, 0.35, 0]),
        P(T(0.04, 0.014, 8), 0x7a4a2a, [0, 0.0, 0], [Math.PI / 2, 0, 0]),
        P(T(0.04, 0.014, 8), 0x7a4a2a, [0, 0.12, 0], [Math.PI / 2, 0, 0]),
        P(S(0.13, 10, 8), SH.bone, [0, 1.28, 0], [0, 0, 0], [1, 0.9, 1.1]),
        P(S(0.03, 6, 5), 0x1a1020, [0.05, 1.29, 0.1]),
        P(S(0.03, 6, 5), 0x1a1020, [-0.05, 1.29, 0.1]),
        P(K(0.035, 0.32, 6), SH.bone, [0.13, 1.48, 0], [0, 0, -0.45]),
        P(K(0.035, 0.32, 6), SH.bone, [-0.13, 1.48, 0], [0, 0, 0.45]),
        P(B(0.04, 0.22, 0.012), 0xd6463a, [0.12, 1.12, 0.02], [0, 0, 0.3]),
        P(B(0.04, 0.2, 0.012), 0x46b6d6, [-0.12, 1.14, 0.02], [0, 0, -0.3]),
      ]),
    };
  });
}

const _shamanHalo = {};
export function buildShaman(element) {
  const g = shamanGeos();
  const m = humanoid(g, { hipY: 0.66, neckY: 0.56, shoulderX: 0.34, shoulderY: 0.4, upperLen: 0.3, foreLen: 0.28, hipX: 0.14, thighLen: 0.22 });
  const col = ELEMENT_COLORS[element] ?? 0xff6a1f;
  const staff = pivot(m.handR, 0, 0, 0.02); staff.rotation.x = 0.25;
  const gem = pivot(staff, 0, 1.55, 0);
  m.bones.push(staff, gem);
  const iStaff = m.bones.length - 2, iGem = m.bones.length - 1;
  m.parts.push([iStaff, g.staff]);
  // unlit glow slot: eyes (on the neck bone) + element gem; colors > 1 feed the bloom
  const glow = once('shamanGlow:' + element, () => {
    const eyes = mergeParts([
      P(S(0.05, 8, 6), 0xffe27a, [0.1, 0.16, 0.24], [0, 0, 0], [1.2, 0.7, 0.6]),
      P(S(0.05, 8, 6), 0xffe27a, [-0.1, 0.16, 0.24], [0, 0, 0], [1.2, 0.7, 0.6]),
    ]);
    const gemG = mergeParts([P(new THREE.OctahedronGeometry(0.1, 0), col)]);
    for (const [geo, k] of [[eyes, 2.2], [gemG, 1.9]]) { const c = geo.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] *= k; }
    return { eyes, gem: gemG };
  });
  const sk = buildSkin('shaman:' + element, m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.02 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, glow.eyes], [iGem, glow.gem]], shadow: false },
  ], [0.9, 1.5]);
  const halo = new THREE.Sprite(_shamanHalo[element] || (_shamanHalo[element] = glowSpriteMat(col, 0.8)));
  halo.scale.setScalar(0.7); gem.add(halo);
  m.staff = staff; m.gem = gem; m.halo = halo;
  m.skin = sk; m.outlines = sk.outlines;
  m.headTop = 1.55;
  return m;
}

// ======================================================================= Chuchu
export const CHU_VARIANTS = {
  normal: { body: 0x4fc6c0, core: 0x2b8f9a, name: '말랑이', element: null },
  fire: { body: 0xff7a3a, core: 0xffd04a, name: '불꽃 말랑이', element: 'fire' },
  ice: { body: 0xa8ecff, core: 0xffffff, name: '얼음 말랑이', element: 'ice' },
  lightning: { body: 0xf0d84a, core: 0xb57bff, name: '전기 말랑이', element: 'lightning' },
  // v3 variants (CONTRACT §14)
  water: { body: 0x4fa8f0, core: 0xd8f4ff, name: '물방울 말랑이', element: 'water' },
  nature: { body: 0x7fd84a, core: 0xf0ff9a, name: '새싹 말랑이', element: 'nature' },
  light: { body: 0xffe6a0, core: 0xffffff, name: '햇살 말랑이', element: 'light' },
  shadow: { body: 0x6a3a9a, core: 0xd9a0ff, name: '그늘 말랑이', element: 'shadow' },
};
const chuMats = {};
export function buildChuchu(variant) {
  const V = CHU_VARIANTS[variant] || CHU_VARIANTS.normal;
  const geos = once('chu', () => {
    const body = new THREE.SphereGeometry(0.62, 26, 18);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i);
      if (y < -0.25) y = -0.25 - (y + 0.25) * 0.35; // flatten bottom
      const t = (y + 0.62) / 1.24;
      const bulge = 1 + 0.12 * Math.sin(t * Math.PI) - 0.1 * t * t;
      p.setXYZ(i, p.getX(i) * bulge, y + 0.36, p.getZ(i) * bulge);
    }
    body.computeVertexNormals();
    // eyes live on a bone at y=0.5 so the blink squashes them in place
    const eyes = mergeParts([
      P(S(0.11, 12, 10), 0x15151c, [0.21, 0.0, 0.6], [0, 0.3, 0], [0.9, 1.25, 0.5]),
      P(S(0.11, 12, 10), 0x15151c, [-0.21, 0.0, 0.6], [0, -0.3, 0], [0.9, 1.25, 0.5]),
      P(S(0.035, 6, 5), 0xffffff, [0.24, 0.07, 0.65]),
      P(S(0.035, 6, 5), 0xffffff, [-0.18, 0.07, 0.66]),
      P(S(0.08, 8, 6), 0x15151c, [0, -0.2, 0.66], [0, 0, 0], [1.3, 0.45, 0.4]),
    ]);
    const shine = mergeParts([P(S(0.09, 8, 6), 0xffffff, [-0.28, 0.72, 0.32], [0, 0, 0.6], [1.4, 0.7, 0.5])]);
    return { body, eyes, shine };
  });
  const coreGeo = once('chuCore:' + variant, () => {
    const g = mergeParts([P(S(0.26, 14, 10), V.core)]);
    const k = V.element ? 1.5 : 0.9, c = g.attributes.color.array;
    for (let i = 0; i < c.length; i++) c[i] *= k;
    return g;
  });
  const mats = chuMats[variant] || (chuMats[variant] = {
    body: toonMat(V.body, { transparent: true, opacity: 0.86, emissive: V.element ? V.body : 0x000000, emissiveIntensity: V.element ? 0.25 : 0 }),
  });
  const root = new THREE.Group();
  const rig = pivot(root, 0, 0, 0);
  const core = pivot(rig, 0, 0.38, -0.05);
  const eyes = pivot(rig, 0, 0.5, 0);
  const sk = buildSkin('chu:' + variant, root, [rig, core, eyes], [
    { name: 'inner', mat: vcBasicMat(), parts: [[1, coreGeo], [2, geos.eyes], [0, geos.shine]], shadow: false },
    { name: 'body', mat: mats.body, parts: [[0, geos.body]], outline: 0.028, renderOrder: 2 },
  ], [0.5, 1.0]);
  return { root, rig, core, eyes, headTop: 1.2, variant: V, skin: sk, outlines: sk.outlines };
}

// ======================================================================= Stone Golem
/** Transformed clone of a geometry (static sub-part baked into its parent bone). */
function at(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}
export function buildGolem() {
  const root = new THREE.Group();
  const rig = pivot(root, 0, 2.55, 0);
  const crystalMat = toonMat(0x6fdcff, { emissive: 0x2fb8ff, emissiveIntensity: 2.2 });
  const eyeMat = toonMat(0xaef4ff, { emissive: 0x6fe0ff, emissiveIntensity: 3 });
  const glowCol = 0x5fd0ff;
  const glows = [], floaters = [], bones = [rig], rocks = [], crystals = [], rockParts = [];
  const bi = (b) => { let i = bones.indexOf(b); if (i < 0) { bones.push(b); i = bones.length - 1; } return i; };
  // every rock is its own bone so it can float/bob independently
  const R = (parent, r, seed, sq, moss, x = 0, y = 0, z = 0) => {
    const b = pivot(parent, x, y, z);
    const geo = rockGeo(r, seed, sq, 1, moss === false ? null : 0x7fae4e);
    rocks.push([bi(b), geo]); rockParts.push({ geo, bone: b });
    return b;
  };
  const icoGeo = new THREE.IcosahedronGeometry(1, 0);
  const joint = (parent, x, y, z, s = 0.22) => {
    crystals.push([bi(parent), at(icoGeo, x, y, z, 0, 0, 0, s, s, s)]);
    const h = new THREE.Sprite(glowSpriteMat(glowCol, 0.55)); h.scale.setScalar(s * 6); h.position.set(x, y, z); parent.add(h); glows.push(h);
  };
  const fl = (b, amp = 0.06) => { floaters.push({ mesh: b, base: b.position.clone(), ph: Math.random() * 6.28, amp }); return b; };

  fl(R(rig, 0.95, 2, [1.2, 0.7, 0.95]));
  const spine = pivot(rig, 0, 0.75, 0);
  R(spine, 1.55, 5, [1.25, 1.0, 0.92], true, 0, 1.15, -0.05);
  fl(R(spine, 0.7, 9, [1, 0.8, 0.7], true, 0.7, 2.0, -0.95));
  fl(R(spine, 0.6, 11, [1, 0.9, 0.7], true, -0.8, 1.8, -1.0));
  // crystal core (weak point)
  const coreGroup = pivot(spine, 0, 1.1, 1.2);
  const core = pivot(coreGroup);
  const coreGeo = new THREE.OctahedronGeometry(0.5, 0); coreGeo.scale(0.85, 1.25, 0.6);
  crystals.push([bi(core), coreGeo]);
  const coreGlow = new THREE.Sprite(glowSpriteMat(glowCol, 0.95)); coreGlow.scale.setScalar(3.2); coreGroup.add(coreGlow); glows.push(coreGlow);
  const ring = mergeParts([P(new THREE.TorusGeometry(0.72, 0.09, 6, 18), 0x6d675c, [0, 0, 0], [0, 0, 0], [1, 1.35, 1])]);
  rocks.push([bi(coreGroup), ring]); rockParts.push({ geo: ring, bone: coreGroup });
  // back crystals
  for (let i = 0; i < 4; i++) {
    crystals.push([bi(spine), at(new THREE.ConeGeometry(0.16 + i * 0.03, 0.9 + i * 0.15, 5), -0.6 + i * 0.4, 2.3 + Math.sin(i) * 0.2, -0.7, -0.6, 0, (i - 1.5) * 0.35)]);
  }
  // head
  const neck = pivot(spine, 0, 2.35, 0.25);
  joint(neck, 0, -0.15, 0, 0.18);
  fl(R(neck, 0.62, 17, [1.25, 0.8, 1.0], true, 0, 0.45, 0.1), 0.04);
  const eyesGeo = mergeParts([P(B(0.26, 0.08, 0.1), 0xffffff, [0.25, 0.48, 0.66], [0, 0, -0.2]), P(B(0.26, 0.08, 0.1), 0xffffff, [-0.25, 0.48, 0.66], [0, 0, 0.2])]);
  R(neck, 0.35, 21, [2.2, 0.5, 0.8], true, 0, 0.72, 0.45);
  // arms
  const arm = (side) => {
    const sh = pivot(spine, side * 2.05, 1.7, 0);
    fl(R(sh, 0.78, 30 + side, [1.1, 0.85, 1], true, side * 0.15, 0.25, 0));
    joint(sh, 0, -0.55, 0, 0.2);
    fl(R(sh, 0.55, 33 + side, [0.9, 1.3, 0.9], true, 0, -1.05, 0));
    const elbow = pivot(sh, 0, -1.75, 0);
    joint(elbow, 0, 0.05, 0, 0.2);
    fl(R(elbow, 0.58, 37 + side, [0.95, 1.25, 0.95], true, 0, -0.6, 0));
    const fist = fl(R(elbow, 0.82, 41 + side, [1.05, 0.95, 1.1], false, 0, -1.5, 0.1));
    joint(elbow, 0, -1.1, 0.05, 0.17);
    return { sh, elbow, fist };
  };
  const aR = arm(-1), aL = arm(1);
  // legs
  const leg = (side) => {
    const hip = pivot(rig, side * 0.85, -0.3, 0);
    fl(R(hip, 0.6, 50 + side, [0.95, 1.1, 0.95], true, 0, -0.55, 0));
    const knee = pivot(hip, 0, -1.2, 0);
    joint(knee, 0, 0.05, 0.05, 0.17);
    fl(R(knee, 0.55, 55 + side, [0.95, 1.05, 0.95], true, 0, -0.45, 0));
    R(knee, 0.6, 60 + side, [1.15, 0.5, 1.45], false, 0, -0.98, 0.18);
    return { hip, knee };
  };
  const lR = leg(-1), lL = leg(1);
  const sk = buildSkin('golem', root, bones, [
    { name: 'rock', mat: vcFlatMat(), parts: rocks, outline: 0.05 },
    { name: 'crystal', mat: crystalMat, parts: crystals, shadow: false },
    { name: 'eyes', mat: eyeMat, parts: [[bi(neck), eyesGeo]], shadow: false },
  ], [3.2, 5.5]);
  return {
    root, rig, spine, neck, armR: aR.sh, armL: aL.sh, foreR: aR.elbow, foreL: aL.elbow, fistR: aR.fist, fistL: aL.fist,
    legR: lR.hip, legL: lL.hip, kneeR: lR.knee, kneeL: lL.knee, core, coreGroup, coreGlow, crystalMat, eyeMat, glows, floaters,
    rockParts, skin: sk, outlines: sk.outlines,
    headTop: 6.3,
  };
}

// ======================================================================= Training dummy
export function buildDummy() {
  const g = once('dummy', () => {
    const straw = 0xe8c46a, strawDark = 0xc69a44, wood = 0x8a5c34, rope = 0x6b4a2a, sack = 0xe9d9b0;
    const parts = [
      P(C(0.09, 0.11, 1.6, 8), wood, [0, 0.8, 0]),
      P(C(0.32, 0.26, 0.8, 12), straw, [0, 1.35, 0]),
      P(C(0.27, 0.32, 0.18, 12), strawDark, [0, 0.92, 0]),
      P(T(0.31, 0.03, 14), rope, [0, 1.15, 0], [Math.PI / 2, 0, 0]),
      P(T(0.3, 0.03, 14), rope, [0, 1.58, 0], [Math.PI / 2, 0, 0]),
      P(C(0.05, 0.05, 1.5, 6), wood, [0, 1.6, 0], [0, 0, Math.PI / 2]),
      P(K(0.12, 0.3, 7), straw, [0.85, 1.6, 0], [0, 0, -Math.PI / 2]),
      P(K(0.12, 0.3, 7), straw, [-0.85, 1.6, 0], [0, 0, Math.PI / 2]),
      P(S(0.27, 12, 10), sack, [0, 2.0, 0]),
      P(K(0.13, 0.26, 8), straw, [0, 2.32, 0]),
      P(B(0.1, 0.025, 0.02), 0x3a2416, [0.09, 2.06, 0.26], [0, 0, 0.7]),
      P(B(0.1, 0.025, 0.02), 0x3a2416, [0.09, 2.06, 0.26], [0, 0, -0.7]),
      P(B(0.1, 0.025, 0.02), 0x3a2416, [-0.09, 2.06, 0.26], [0, 0, 0.7]),
      P(B(0.1, 0.025, 0.02), 0x3a2416, [-0.09, 2.06, 0.26], [0, 0, -0.7]),
      P(B(0.16, 0.02, 0.02), 0x3a2416, [0, 1.92, 0.265]),
      P(C(0.24, 0.24, 0.02, 16), 0xd84a3a, [0, 1.4, 0.3], [Math.PI / 2, 0, 0]),
      P(C(0.15, 0.15, 0.025, 16), 0xf6efe0, [0, 1.4, 0.305], [Math.PI / 2, 0, 0]),
      P(C(0.07, 0.07, 0.03, 12), 0xd84a3a, [0, 1.4, 0.31], [Math.PI / 2, 0, 0]),
    ];
    const body = mergeParts(parts); const bodyR = body.clone(); bodyR.translate(0, -0.2, 0);
    return { body, bodyR, base: mergeParts([P(C(0.35, 0.45, 0.16, 10), 0x7a7266, [0, 0.08, 0]), P(C(0.13, 0.13, 0.2, 8), wood, [0, 0.2, 0])]) };
  });
  const root = new THREE.Group();
  const rig = pivot(root, 0, 0.2, 0);
  const sk = buildSkin('dummy', root, [root, rig], [{ name: 'body', mat: vcMat(), parts: [[0, g.base], [1, g.bodyR]], outline: 0.022 }], [1.3, 1.7]);
  return { root, rig, headTop: 2.6, skin: sk, outlines: sk.outlines };
}
