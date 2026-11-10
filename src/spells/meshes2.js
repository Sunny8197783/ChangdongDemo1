// v3 projectile meshes (CONTRACT §11 opts.mesh): arrow, wisp, thorn, bubble, shadowbolt, raven, orb, glance (glowing lance),
// spear (light.spear). Pooled by projectiles.js (one Group per live projectile, same programs as the v2 meshes).
// userData.tints lists the materials recoloured per element (uniform / material colour only; never a program-key flag);
// materials flagged userData.edge take the element's edge colour.
import * as THREE from 'three';
import { GLINT } from './palette.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fresnelMat, coreMat, crescentGeo, toonMat } from './assets.js';

const ni = (g) => (g.index ? g.toNonIndexed() : g);

const cache = new Map();
const geo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

export function extraFactories(game, glowCore) {
  const edge = (m) => { m.userData.edge = true; return m; };
  return {
    /** Generic glowing orb (turret bolts, totem wisps, generic element projectiles). */
    orb() {
      const g = new THREE.Group();
      const c = new THREE.Mesh(geo('orbCore', () => new THREE.SphereGeometry(0.22, 12, 8)), coreMat(GLINT, 1.2));
      const s = new THREE.Mesh(geo('orbShell', () => new THREE.SphereGeometry(0.46, 14, 10)), fresnelMat(GLINT, { power: 1.5, intensity: 1.2, core: 0.12 }));
      g.add(c, s); g.userData.tints = [c.material, edge(s.material)];
      return g;
    },
    /** Arrow (bow style): shaft + head + fletching merged into ONE toon mesh, plus an element glow (2 draw calls). Travels along +Z. */
    arrow() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo('arrowBody', () => {
        const shaft = new THREE.CylinderGeometry(0.028, 0.028, 1.3, 5); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.25);
        const head = new THREE.ConeGeometry(0.075, 0.26, 4); head.rotateX(Math.PI / 2); head.translate(0, 0, 0.5);
        const f1 = new THREE.BoxGeometry(0.005, 0.16, 0.3); f1.translate(0, 0, -0.78);
        const f2 = new THREE.BoxGeometry(0.16, 0.005, 0.3); f2.translate(0, 0, -0.78);
        return mergeGeometries([shaft, head, f1, f2].map(ni));
      }), toonMat(0xc8b090, { emissive: 0x2a2018, emissiveIntensity: 0.4 }));
      const glow = new THREE.Mesh(geo('arrowGlow', () => { const c = new THREE.SphereGeometry(0.2, 10, 8); c.scale(1, 1, 2.6); c.translate(0, 0, 0.3); return c; }), fresnelMat(GLINT, { power: 1.2, intensity: 1.2, core: 0.25 }));
      g.add(body, glow);
      g.userData.tints = [glow.material];
      return g;
    },
    /** Spirit wisp (totem style): a soft flame-tailed spirit. */
    wisp() {
      const g = new THREE.Group();
      const c = new THREE.Mesh(geo('wispCore', () => new THREE.SphereGeometry(0.18, 12, 8)), coreMat(GLINT, 1.2));
      const s = new THREE.Mesh(geo('wispShell', () => { const x = new THREE.SphereGeometry(0.4, 14, 10); x.scale(1, 1, 1.8); x.translate(0, 0, -0.25); return x; }), fresnelMat(GLINT, { power: 1.3, intensity: 1.2, core: 0.1 }));
      g.add(c, s); g.userData.tints = [c.material, edge(s.material)]; g.userData.spin = null; g.userData.wobble = s;
      return g;
    },
    /** Thorn (nature): a curved green spike. */
    thorn() {
      const g = new THREE.Group();
      const t = new THREE.Mesh(geo('thorn', () => { const c = new THREE.ConeGeometry(0.09, 0.7, 5); c.rotateX(Math.PI / 2); return c; }), toonMat(0x8fe05a, { emissive: 0x1d4010, emissiveIntensity: 0.6 }));
      const glow = new THREE.Mesh(geo('thornGlow', () => { const c = new THREE.SphereGeometry(0.16, 8, 6); c.scale(1, 1, 2.6); return c; }), fresnelMat(GLINT, { power: 1.3, intensity: 1.2, core: 0.1 }));
      g.add(t, glow); g.userData.tints = [edge(glow.material)];
      return g;
    },
    /** Bubble (water): wobbly fresnel sphere with a highlight. */
    bubble() {
      const g = new THREE.Group();
      const s = new THREE.Mesh(geo('bubble', () => new THREE.SphereGeometry(0.34, 16, 12)), fresnelMat(GLINT, { power: 2.2, intensity: 1.2, core: 0.06 }));
      const hl = new THREE.Mesh(geo('bubbleHl', () => new THREE.SphereGeometry(0.07, 8, 6)), coreMat(GLINT, 1.2));
      hl.position.set(-0.12, 0.14, 0.18);
      g.add(s, hl); g.userData.tints = [s.material]; g.userData.wobble = s;
      return g;
    },
    /** Shadow bolt: a dark core with a violet corona and two orbiting motes. */
    shadowbolt() {
      const g = new THREE.Group();
      const core = new THREE.Mesh(geo('sbCore', () => new THREE.IcosahedronGeometry(0.26, 1)), new THREE.MeshBasicMaterial({ color: 0x12061f }));
      const shell = new THREE.Mesh(geo('sbShell', () => new THREE.SphereGeometry(0.55, 16, 12)), fresnelMat(0xb14bff, { power: 1.3, intensity: 1.2, core: 0.0 }));
      const ring = new THREE.Mesh(geo('sbMotes', () => { const a = new THREE.SphereGeometry(0.08, 8, 6); a.translate(0.5, 0, 0); const b = new THREE.SphereGeometry(0.08, 8, 6); b.translate(-0.5, 0, 0); return mergeGeometries([ni(a), ni(b)]); }), coreMat(0xd9a8ff, 1.2));
      const tail = new THREE.Mesh(geo('sbTail', () => { const c = new THREE.ConeGeometry(0.4, 1.4, 10, 1, true); c.rotateX(-Math.PI / 2); c.translate(0, 0, -0.75); return c; }), fresnelMat(0x7a3cff, { power: 0.9, intensity: 1.2, core: 0.15 }));
      g.add(core, shell, ring, tail); g.userData.spin = ring; g.userData.tints = [edge(shell.material)]; g.userData.elementTint = false;
      return g;
    },
    /** Raven (shadow.raven): one merged dark bird mesh (body + wings) + a violet glow (2 draw calls); flaps by roll/scale. */
    raven() {
      const g = new THREE.Group();
      const bird = new THREE.Mesh(geo('ravenBird', () => {
        const body = new THREE.ConeGeometry(0.14, 0.6, 5); body.rotateX(Math.PI / 2);
        const wl = new THREE.BoxGeometry(0.62, 0.02, 0.26); wl.translate(0.32, 0.02, -0.04); wl.rotateZ(0.25);
        const wr = new THREE.BoxGeometry(0.62, 0.02, 0.26); wr.translate(-0.32, 0.02, -0.04); wr.rotateZ(-0.25);
        const tail = new THREE.BoxGeometry(0.2, 0.02, 0.22); tail.translate(0, 0, -0.38);
        return mergeGeometries([body, wl, wr, tail].map(ni));
      }), toonMat(0x1a1024, { emissive: 0x2a0b4e, emissiveIntensity: 0.6 }));
      const glow = new THREE.Mesh(geo('ravenGlow', () => new THREE.SphereGeometry(0.3, 10, 8)), fresnelMat(0xb14bff, { power: 1.6, intensity: 1.2, core: 0.0 }));
      g.add(bird, glow); g.userData.flap = bird; g.userData.tints = [edge(glow.material)]; g.userData.elementTint = false;
      return g;
    },
    /** Glowing lance (light basic / generic lances of non-ice elements). */
    glance() {
      const g = new THREE.Group();
      const core = new THREE.Mesh(geo('glCore', () => { const c = new THREE.CylinderGeometry(0.05, 0.09, 2.2, 8); c.rotateX(Math.PI / 2); const t = new THREE.OctahedronGeometry(0.2, 0); t.scale(0.7, 0.7, 2.2); t.translate(0, 0, 1.2); return mergeGeometries([ni(c), ni(t)]); }), coreMat(GLINT, 1.2));
      const glow = new THREE.Mesh(geo('glGlow', () => { const c = new THREE.CylinderGeometry(0.06, 0.32, 3.2, 10, 1, true); c.rotateX(-Math.PI / 2); c.translate(0, 0, -0.4); return c; }), fresnelMat(GLINT, { power: 1.1, intensity: 1.2, core: 0.2 }));
      const rings = new THREE.Mesh(geo('glRings', () => { const a = new THREE.TorusGeometry(0.22, 0.02, 4, 18); a.translate(0, 0, -0.2); const b = new THREE.TorusGeometry(0.18, 0.02, 4, 18); b.translate(0, 0, -0.7); return mergeGeometries([ni(a), ni(b)]); }), fresnelMat(GLINT, { power: 0.4, intensity: 1.2, core: 0.6 }));
      g.add(core, glow, rings);
      g.userData.tints = [core.material, edge(glow.material), rings.material];
      g.userData.spin = null; g.userData.rings = rings;
      return g;
    },
    /** 천사의 창: a huge winged light spear. */
    spear() {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(geo('spShaft', () => { const c = new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8); c.rotateX(Math.PI / 2); return c; }), coreMat(GLINT, 1.2));
      const head = new THREE.Mesh(geo('spHead', () => { const c = new THREE.OctahedronGeometry(0.42, 0); c.scale(0.6, 0.35, 2.4); c.translate(0, 0, 2.6); return c; }), coreMat(GLINT, 1.2));
      const wings = new THREE.Mesh(crescentGeo(), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      wings.rotation.x = Math.PI / 2; wings.scale.set(1.2, 1, 0.9); wings.position.z = 1.4;
      const glow = new THREE.Mesh(geo('spGlow', () => { const c = new THREE.CylinderGeometry(0.1, 0.7, 6, 12, 1, true); c.rotateX(-Math.PI / 2); return c; }), fresnelMat(0xffd36a, { power: 1, intensity: 1.2, core: 0.25 }));
      g.add(shaft, head, wings, glow);
      g.userData.tints = [edge(glow.material)]; g.userData.tint = wings.material;
      return g;
    },
  };
}
