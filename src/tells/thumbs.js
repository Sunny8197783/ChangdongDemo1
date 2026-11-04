// tells thumbnails (PLAN v4 §6.4): tells.renderThumb(kind, size) → Promise<dataURL> of a REAL rendered decal (+ its
// sprites) through game.render.snapshot, for the ux legend (가이드 → 위험 표시 읽는 법). Same materials/programs as the
// threat scene (no extra program); cached per kind and size.
import * as THREE from 'three';
import { threatColor, THREAT } from '../core/threat.js';
import { makeShape, setShape, decalQuad, SHAPE_CODE, TELL_CODE } from './shapes.js';
import { STRIDE, STYLE } from './decals.js';

const SP_STRIDE = 20;
// kind → decals [{shape, tell, prog, style, perfectFrac}] + sprites [{cell, x, y, z, size, kind}]
const LAYOUT = {
  danger: { d: [{ s: { kind: 'cone', pos: { x: 0, z: -1.0 }, dir: { x: 0, z: 1 }, r: 2.0, angle: 0.62 }, tell: 'danger', prog: 0.6 }] },
  parry: { d: [{ s: { kind: 'circle', pos: { x: 0, z: 0 }, r: 1.15 }, tell: 'parry', prog: 0.55 }], sp: [{ cell: 'star', x: 0.75, y: 0.6, z: -0.2, size: 0.55, tell: 'parry' }] },
  unblockable: { d: [{ s: { kind: 'circle', pos: { x: 0, z: 0 }, r: 1.15 }, tell: 'unblockable', prog: 0.5 }], sp: [{ cell: 'warn', x: 0, y: 0.5, z: 0, size: 0.6, tell: 'unblockable' }] },
  jump: { d: [{ s: { kind: 'circle', pos: { x: 0, z: 0 }, r: 0.7 }, tell: 'jump', prog: 0.85 }, { s: { kind: 'ring', pos: { x: 0, z: 0 }, r: 1.22, inner: 1.08 }, tell: 'jump', prog: 0, style: STYLE.solid | STYLE.noFront }],
    sp: [{ cell: 'jump', x: 0, y: 0.55, z: 0, size: 0.55, tell: 'jump' }] },
  projectile: { d: [{ s: { kind: 'line', pos: { x: 0, z: -1.2 }, dir: { x: 0, z: 1 }, len: 2.1, width: 0.28 }, tell: 'projectile', prog: 0.6, style: STYLE.noChevron },
    { s: { kind: 'ring', pos: { x: 0, z: 1.05 }, r: 0.32, inner: 0.18 }, tell: 'projectile', prog: 0, style: STYLE.marker | STYLE.noFront }] },
  hazard: { d: [{ s: { kind: 'circle', pos: { x: 0, z: 0 }, r: 1.15 }, tell: 'hazard', prog: 0, style: STYLE.noFront | STYLE.noChevron }] },
  safe: { d: [{ s: { kind: 'circle', pos: { x: 0, z: 0 }, r: 1.15 }, tell: 'safe', prog: 0, style: STYLE.noFront | STYLE.noChevron }],
    sp: [{ cell: 'chevron', x: -0.45, y: 0.35, z: 0.1, size: 0.4, tell: 'safe' }, { cell: 'chevron', x: 0.4, y: 0.6, z: -0.2, size: 0.4, tell: 'safe' }, { cell: 'chevron', x: 0.05, y: 0.15, z: 0.5, size: 0.4, tell: 'safe' }] },
  punish: { d: [], sp: [{ cell: 'diamond', x: -0.8, y: 0.3, z: 0, size: 0.4, tell: 'punish' }, { cell: 'diamond', x: 0.8, y: 0.3, z: 0, size: 0.4, tell: 'punish' },
    { cell: 'diamond', x: 0, y: 0.3, z: 0.8, size: 0.4, tell: 'punish' }, { cell: 'diamond', x: 0, y: 0.3, z: -0.8, size: 0.4, tell: 'punish' }, { cell: 'text', x: 0, y: 0.9, z: 0, size: 0.42, aspect: 4, tell: 'punish' }] },
  // the "perfect window" picture: the front has turned near-white just before the fill completes
  perfect: { d: [{ s: { kind: 'circle', pos: { x: 0, z: 0 }, r: 1.15 }, tell: 'danger', prog: 0.9, perfectFrac: 0.8 }] },
};
export const THUMB_KINDS = Object.keys(LAYOUT);

export function createThumbs(game, decals, sprites) {
  const cache = new Map();
  let kit = null;
  function build() {
    const group = new THREE.Group(); group.name = 'tells-thumb';
    const dSrc = decals.fams.radial.geo, sSrc = sprites.mesh.geometry;
    const dArr = new Float32Array(4 * STRIDE), sArr = new Float32Array(8 * SP_STRIDE);
    const dIb = new THREE.InstancedInterleavedBuffer(dArr, STRIDE, 1), sIb = new THREE.InstancedInterleavedBuffer(sArr, SP_STRIDE, 1);
    const dg = new THREE.InstancedBufferGeometry(); dg.index = dSrc.index; dg.setAttribute('position', dSrc.attributes.position);
    ['iO', 'iF', 'iS', 'iT', 'iD', 'iE'].forEach((n, k) => dg.setAttribute(n, new THREE.InterleavedBufferAttribute(dIb, 4, k * 4)));
    const sg = new THREE.InstancedBufferGeometry(); sg.index = sSrc.index; sg.setAttribute('position', sSrc.attributes.position);
    ['s0', 's1', 's2', 's3', 's4'].forEach((n, k) => sg.setAttribute(n, new THREE.InterleavedBufferAttribute(sIb, 4, k * 4)));
    const dm = new THREE.Mesh(dg, decals.material), sm = new THREE.Mesh(sg, sprites.material);
    dm.frustumCulled = false; sm.frustumCulled = false; sm.renderOrder = 20;
    const bounds = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.0, 2.7), new THREE.MeshBasicMaterial()); bounds.visible = false; bounds.position.y = 0.3;
    group.add(dm, sm, bounds);
    kit = { group, dArr, sArr, dIb, sIb, dg, sg, S: makeShape(), q: {} };
    return kit;
  }
  const uvOf = (cell) => {
    const C = { star: [0, 0], diamond: [1, 0], chevron: [2, 0], warn: [3, 0], jump: [0, 1], bang: [1, 1], ring: [2, 1], text: [0, 3, 4, 1] }[cell] || [0, 0];
    const w = C[2] || 1, h = C[3] || 1;
    return [C[0] / 4, C[1] / 4, (C[0] + w) / 4, (C[1] + h) / 4];
  };
  async function render(kind, size = 160) {
    const L = LAYOUT[kind]; if (!L || !game.render?.snapshot) return null;
    const key = kind + '|' + size;
    if (cache.has(key)) return cache.get(key);
    const K = kit || build();
    const cb = game.assist?.colorblind || null;
    const D = L.d || [];
    for (let i = 0; i < D.length; i++) {
      const it = D[i], b = i * STRIDE;
      setShape(K.S, it.s, it.s.pos, it.s.dir || null); decalQuad(K.S, K.q);
      const q = K.q, A = K.dArr;
      A[b] = q.ox; A[b + 1] = 0; A[b + 2] = q.oz; A[b + 3] = 1;
      A[b + 4] = q.fx; A[b + 5] = q.fz; A[b + 6] = q.aMin; A[b + 7] = q.aMax;
      A[b + 8] = q.half; A[b + 9] = SHAPE_CODE[K.S.kind]; A[b + 10] = q.p0; A[b + 11] = q.p1;
      A[b + 12] = q.p2; A[b + 13] = q.p3; A[b + 14] = TELL_CODE[it.tell]; A[b + 15] = it.style ?? 0;
      A[b + 16] = it.prog; A[b + 17] = 1; A[b + 18] = 0; A[b + 19] = 0;
      A[b + 20] = it.perfectFrac ?? 2; A[b + 21] = 0; A[b + 22] = q.coneRot; A[b + 23] = 0;
    }
    K.dg.instanceCount = D.length; K.dIb.needsUpdate = true;
    const SP = L.sp || [];
    const col = new THREE.Color(), out = new THREE.Color();
    for (let i = 0; i < SP.length; i++) {
      const it = SP[i], b = i * SP_STRIDE, A = K.sArr, u = uvOf(it.cell);
      const c = it.tell === 'punish' ? { rim: THREAT.punish.rim, edge: THREAT.punish.outline } : threatColor(it.tell, cb);
      col.setHex(c.rim); out.setHex(c.edge);
      A[b] = it.x; A[b + 1] = it.y; A[b + 2] = it.z; A[b + 3] = it.size;
      A[b + 4] = u[0]; A[b + 5] = u[1]; A[b + 6] = u[2]; A[b + 7] = u[3];
      A[b + 8] = col.r; A[b + 9] = col.g; A[b + 10] = col.b; A[b + 11] = 1;
      A[b + 12] = out.r; A[b + 13] = out.g; A[b + 14] = out.b; A[b + 15] = it.cell === 'diamond' ? 0.4 : 0;
      A[b + 16] = it.aspect || 1; A[b + 17] = 0; A[b + 18] = 0; A[b + 19] = 0;
    }
    K.sg.instanceCount = SP.length; K.sIb.needsUpdate = true;
    K.group.children[1].visible = SP.length > 0; K.group.children[0].visible = D.length > 0;
    const U = decals.uniforms;
    U.uThumb.value = 1;
    let p;
    try { p = game.render.snapshot(K.group, { w: size, h: size, yaw: 0, pitch: 1.0, scene: 'threat' }); }
    finally { U.uThumb.value = 0; }
    const url = await p;
    cache.set(key, url);
    return url;
  }
  return { render, kinds: THUMB_KINDS };
}
