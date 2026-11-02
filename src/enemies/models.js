// Procedural enemy models. Every model faces +Z in local space; object root sits at the feet.
import * as THREE from 'three';
import { toonMat, ELEMENT_COLORS } from '../core/utils.js';
import { P, mergeParts, vcMat, vcFlatMat, mk, pivot, rockGeo, glowSpriteMat } from './common.js';

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

/** Humanoid rig shared by bokoblin and shaman. */
function humanoid(g, o) {
  const mat = vcMat();
  const root = new THREE.Group();
  const rig = pivot(root, 0, o.hipY, 0);
  const pelvis = mk(g.pelvis, mat, o.ol); rig.add(pelvis);
  const spine = pivot(rig, 0, 0.08, 0);
  const torso = mk(g.torso, mat, o.ol); spine.add(torso);
  const neck = pivot(spine, 0, o.neckY, 0.02);
  const head = mk(g.head, mat, o.ol); neck.add(head);
  const sh = o.shoulderX;
  const armR = pivot(spine, -sh, o.shoulderY, 0), armL = pivot(spine, sh, o.shoulderY, 0);
  armR.add(mk(g.upperArm, mat, o.ol)); armL.add(mk(g.upperArm, mat, o.ol));
  const foreR = pivot(armR, 0, -o.upperLen, 0), foreL = pivot(armL, 0, -o.upperLen, 0);
  foreR.add(mk(g.foreArm, mat, o.ol)); foreL.add(mk(g.foreArm, mat, o.ol));
  const handR = pivot(foreR, 0, -o.foreLen, 0.03), handL = pivot(foreL, 0, -o.foreLen, 0.03);
  const legR = pivot(rig, -o.hipX, -0.06, 0), legL = pivot(rig, o.hipX, -0.06, 0);
  legR.add(mk(g.thigh, mat, o.ol)); legL.add(mk(g.thigh, mat, o.ol));
  const kneeR = pivot(legR, 0, -o.thighLen, 0), kneeL = pivot(legL, 0, -o.thighLen, 0);
  kneeR.add(mk(g.shin, mat, o.ol)); kneeL.add(mk(g.shin, mat, o.ol));
  return { root, rig, pelvis, spine, torso, neck, head, armR, armL, foreR, foreL, handR, handL, legR, legL, kneeR, kneeL };
}

export function buildBokoblin() {
  const g = bokoGeos();
  const m = humanoid(g, { hipY: 0.74, neckY: 0.66, shoulderX: 0.46, shoulderY: 0.48, upperLen: 0.36, foreLen: 0.3, hipX: 0.2, thighLen: 0.32, ol: 0.022 });
  const club = mk(g.club, vcMat(), 0.022);
  club.rotation.x = -0.55; // tilt toward the forearm direction
  m.handR.add(club);
  m.weapon = club;
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

export function buildShaman(element) {
  const g = shamanGeos();
  const m = humanoid(g, { hipY: 0.66, neckY: 0.56, shoulderX: 0.34, shoulderY: 0.4, upperLen: 0.3, foreLen: 0.28, hipX: 0.14, thighLen: 0.22, ol: 0.02 });
  const col = ELEMENT_COLORS[element];
  const eyeMat = toonMat(0xffe27a, { emissive: 0xffc84a, emissiveIntensity: 2.2 });
  const eyes = new THREE.Mesh(g.eyes, eyeMat); m.head.add(eyes);
  const staff = mk(g.staff, vcMat(), 0.018);
  staff.position.set(0, 0, 0.02); staff.rotation.x = 0.25;
  m.handR.add(staff);
  const gemMat = toonMat(col, { emissive: col, emissiveIntensity: 1.6 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), gemMat);
  gem.position.set(0, 1.55, 0); staff.add(gem);
  const halo = new THREE.Sprite(glowSpriteMat(col, 0.8)); halo.scale.setScalar(0.7); gem.add(halo);
  m.staff = staff; m.gem = gem; m.gemMat = gemMat; m.halo = halo;
  m.headTop = 1.55;
  return m;
}

// ======================================================================= Chuchu
export const CHU_VARIANTS = {
  normal: { body: 0x4fc6c0, core: 0x2b8f9a, name: '츄츄', element: null },
  fire: { body: 0xff7a3a, core: 0xffd04a, name: '불꽃 츄츄', element: 'fire' },
  ice: { body: 0xa8ecff, core: 0xffffff, name: '얼음 츄츄', element: 'ice' },
  lightning: { body: 0xf0d84a, core: 0xb57bff, name: '전기 츄츄', element: 'lightning' },
};
const chuMats = {};
export function buildChuchu(variant) {
  const V = CHU_VARIANTS[variant];
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
    return {
      body,
      core: new THREE.SphereGeometry(0.26, 14, 10),
      eyes: mergeParts([
        P(S(0.11, 12, 10), 0x15151c, [0.21, 0.5, 0.6], [0, 0.3, 0], [0.9, 1.25, 0.5]),
        P(S(0.11, 12, 10), 0x15151c, [-0.21, 0.5, 0.6], [0, -0.3, 0], [0.9, 1.25, 0.5]),
        P(S(0.035, 6, 5), 0xffffff, [0.24, 0.57, 0.65]),
        P(S(0.035, 6, 5), 0xffffff, [-0.18, 0.57, 0.66]),
        P(S(0.08, 8, 6), 0x15151c, [0, 0.3, 0.66], [0, 0, 0], [1.3, 0.45, 0.4]),
      ]),
    };
  });
  const mats = chuMats[variant] || (chuMats[variant] = {
    body: toonMat(V.body, { transparent: true, opacity: 0.86, emissive: V.element ? V.body : 0x000000, emissiveIntensity: V.element ? 0.25 : 0 }),
    core: toonMat(V.core, { emissive: V.core, emissiveIntensity: V.element ? 1.4 : 0.35 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
  });
  const root = new THREE.Group();
  const rig = pivot(root, 0, 0, 0);
  const body = mk(geos.body, mats.body, 0.028); body.renderOrder = 2; rig.add(body);
  const core = new THREE.Mesh(geos.core, mats.core); core.position.set(0, 0.38, -0.05); rig.add(core);
  const eyes = new THREE.Mesh(geos.eyes, vcMat()); rig.add(eyes);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mats.shine); shine.scale.set(1.4, 0.7, 0.5);
  shine.position.set(-0.28, 0.72, 0.32); shine.rotation.z = 0.6; rig.add(shine);
  return { root, rig, body, core, eyes, headTop: 1.2, variant: V };
}

// ======================================================================= Stone Golem
export function buildGolem() {
  const mat = vcFlatMat();
  const root = new THREE.Group();
  const rig = pivot(root, 0, 2.55, 0);
  const crystalMat = toonMat(0x6fdcff, { emissive: 0x2fb8ff, emissiveIntensity: 2.2 });
  const glowCol = 0x5fd0ff;
  const glows = [];
  const R = (r, seed, sq, moss) => mk(rockGeo(r, seed, sq, 1, moss === false ? null : 0x7fae4e), mat, 0.05);
  const joint = (parent, x, y, z, s = 0.22) => {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), crystalMat);
    c.position.set(x, y, z); parent.add(c);
    const h = new THREE.Sprite(glowSpriteMat(glowCol, 0.55)); h.scale.setScalar(s * 6); c.add(h); glows.push(h);
    return c;
  };
  const floaters = [];
  const fl = (mesh, amp = 0.06) => { floaters.push({ mesh, base: mesh.position.clone(), ph: Math.random() * 6.28, amp }); return mesh; };

  const pelvis = fl(R(0.95, 2, [1.2, 0.7, 0.95])); rig.add(pelvis);
  const spine = pivot(rig, 0, 0.75, 0);
  const chest = R(1.55, 5, [1.25, 1.0, 0.92]); chest.position.set(0, 1.15, -0.05); spine.add(chest);
  const back1 = fl(R(0.7, 9, [1, 0.8, 0.7])); back1.position.set(0.7, 2.0, -0.95); spine.add(back1);
  const back2 = fl(R(0.6, 11, [1, 0.9, 0.7])); back2.position.set(-0.8, 1.8, -1.0); spine.add(back2);
  // crystal core (weak point)
  const coreGroup = pivot(spine, 0, 1.1, 1.2);
  const coreGeo = new THREE.OctahedronGeometry(0.5, 0); coreGeo.scale(0.85, 1.25, 0.6);
  const core = mk(coreGeo, crystalMat, 0.03, false); coreGroup.add(core);
  const coreGlow = new THREE.Sprite(glowSpriteMat(glowCol, 0.95)); coreGlow.scale.setScalar(3.2); coreGroup.add(coreGlow); glows.push(coreGlow);
  const coreRing = mk(new THREE.TorusGeometry(0.72, 0.09, 6, 18), toonMat(0x6d675c, { flatShading: true }), 0.03); coreRing.scale.set(1, 1.35, 1); coreGroup.add(coreRing);
  // back crystals
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16 + i * 0.03, 0.9 + i * 0.15, 5), crystalMat);
    c.position.set(-0.6 + i * 0.4, 2.3 + Math.sin(i) * 0.2, -0.7); c.rotation.set(-0.6, 0, (i - 1.5) * 0.35); spine.add(c);
  }
  // head
  const neck = pivot(spine, 0, 2.35, 0.25);
  joint(neck, 0, -0.15, 0, 0.18);
  const head = fl(R(0.62, 17, [1.25, 0.8, 1.0]), 0.04); head.position.set(0, 0.45, 0.1); neck.add(head);
  const eyeMat = toonMat(0xaef4ff, { emissive: 0x6fe0ff, emissiveIntensity: 3 });
  const eyes = new THREE.Mesh(mergeParts([P(B(0.26, 0.08, 0.1), 0xffffff, [0.25, 0.48, 0.66], [0, 0, -0.2]), P(B(0.26, 0.08, 0.1), 0xffffff, [-0.25, 0.48, 0.66], [0, 0, 0.2])]), eyeMat);
  neck.add(eyes);
  const brow = R(0.35, 21, [2.2, 0.5, 0.8]); brow.position.set(0, 0.72, 0.45); neck.add(brow);
  // arms
  const arm = (side) => {
    const sh = pivot(spine, side * 2.05, 1.7, 0);
    const pad = fl(R(0.78, 30 + side, [1.1, 0.85, 1])); pad.position.set(side * 0.15, 0.25, 0); sh.add(pad);
    joint(sh, 0, -0.55, 0, 0.2);
    const upper = fl(R(0.55, 33 + side, [0.9, 1.3, 0.9])); upper.position.set(0, -1.05, 0); sh.add(upper);
    const elbow = pivot(sh, 0, -1.75, 0);
    joint(elbow, 0, 0.05, 0, 0.2);
    const fore = fl(R(0.58, 37 + side, [0.95, 1.25, 0.95])); fore.position.set(0, -0.6, 0); elbow.add(fore);
    const fist = fl(R(0.82, 41 + side, [1.05, 0.95, 1.1], false)); fist.position.set(0, -1.5, 0.1); elbow.add(fist);
    joint(elbow, 0, -1.1, 0.05, 0.17);
    return { sh, elbow, fist };
  };
  const aR = arm(-1), aL = arm(1);
  // legs
  const leg = (side) => {
    const hip = pivot(rig, side * 0.85, -0.3, 0);
    const thigh = fl(R(0.6, 50 + side, [0.95, 1.1, 0.95])); thigh.position.set(0, -0.55, 0); hip.add(thigh);
    const knee = pivot(hip, 0, -1.2, 0);
    joint(knee, 0, 0.05, 0.05, 0.17);
    const shin = fl(R(0.55, 55 + side, [0.95, 1.05, 0.95])); shin.position.set(0, -0.45, 0); knee.add(shin);
    const foot = R(0.6, 60 + side, [1.15, 0.5, 1.45], false); foot.position.set(0, -0.98, 0.18); knee.add(foot);
    return { hip, knee };
  };
  const lR = leg(-1), lL = leg(1);
  return {
    root, rig, spine, neck, armR: aR.sh, armL: aL.sh, foreR: aR.elbow, foreL: aL.elbow, fistR: aR.fist, fistL: aL.fist,
    legR: lR.hip, legL: lL.hip, kneeR: lR.knee, kneeL: lL.knee, core, coreGroup, coreGlow, crystalMat, eyeMat, glows, floaters,
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
    return { body: mergeParts(parts), base: mergeParts([P(C(0.35, 0.45, 0.16, 10), 0x7a7266, [0, 0.08, 0]), P(C(0.13, 0.13, 0.2, 8), wood, [0, 0.2, 0])]) };
  });
  const root = new THREE.Group();
  root.add(mk(g.base, vcMat(), 0.02));
  const rig = pivot(root, 0, 0.2, 0);
  const body = mk(g.body, vcMat(), 0.022); body.position.y = -0.2; rig.add(body);
  return { root, rig, headTop: 2.6 };
}
