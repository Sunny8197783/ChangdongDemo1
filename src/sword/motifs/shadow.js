// 그림자 shadow motifs (PLAN §3.5; owner melee). Primary FM shapes: ink `tendril` ribbons (normal-blended near-black, `light` rim),
// `crescent` bites, `raven` low-poly birds with a 2-frame wing flap (two atlas shapes alternated). Secondary: dark SM (darkening), violet
// fresnel edges. Accents: soul wisps ≤ 12 travelling inward. Signature: inverted value — dark cores with crisp violet rims.
// Never: additive violet / pink haze, magenta (reserved unblockable hue).
import * as THREE from 'three';
import { merge, faceted, taperTube, plate, hash, upTo } from './common.js';

const _q = new THREE.Quaternion(), _a = new THREE.Vector3();

function ravenGeo(up) {
  // body (elongated bipyramid along +Z), head, tail fan, two wings (frame: up / down)
  const body = new THREE.OctahedronGeometry(0.16, 0); body.scale(0.8, 0.7, 2.2);
  const head = new THREE.TetrahedronGeometry(0.09, 0); head.translate(0, 0.05, 0.36);
  const tail = new THREE.ConeGeometry(0.12, 0.3, 3, 1); tail.rotateX(-Math.PI / 2); tail.scale(1, 0.25, 1); tail.translate(0, 0, -0.42);
  const wing = (side) => {
    const g = new THREE.BufferGeometry();
    const tipY = up ? 0.32 : -0.22, midY = up ? 0.14 : -0.06;
    const v = new Float32Array([0, 0.02, 0.12, side * 0.62, tipY, -0.05, 0, 0.02, -0.16, side * 0.62, tipY, -0.05, side * 0.3, midY, 0.1, 0, 0.02, 0.12]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.computeVertexNormals();
    return g;
  };
  const parts = [body, head, tail, wing(1), wing(-1)];
  const g = merge(parts.map((p) => faceted(p, () => 0.3)), [0.25, 0.4, 0.2, 0.55, 0.55]);
  return g;
}

export function installShadow(api) {
  const { kit: K, gy } = api;
  // ---- geometry
  { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 4.2) * 0.25 * t, t * 1.8, Math.cos(t * 3.1) * 0.12 * t)); }
    K.registerShape('shadow.tendril', taperTube(pts, 0.09, 0.008, 18, 5), { blend: 'solid', outline: true, max: 96 }); }
  { // crescent bite: thin plate in XY facing +Z
    const sh = new THREE.Shape(); sh.absarc(0, 0, 0.5, -1.25, 1.25, false); sh.absarc(0.17, 0, 0.38, 1.15, -1.15, true);
    K.registerShape('shadow.crescent', plate(sh, 0.04, (x) => 0.15 + Math.max(0, x) * 1.3), { blend: 'solid', outline: true });
  }
  K.registerShape('shadow.raven', ravenGeo(true), { blend: 'solid', outline: true });
  K.registerShape('shadow.raven2', ravenGeo(false), { blend: 'solid', outline: true });

  const G = (p) => K.v3(p.x, gy(p.x, p.z), p.z);
  const cid = (s) => s.castId || 0;
  const wisps = (s, p, n, inward = true) => K.emit?.(p, { count: Math.min(12, n), shape: 'wisp', additive: false, color: [api.rampOf('shadow').light, api.rampOf('shadow').mid], speed: 2.4, spread: 1, radius: inward ? 1.1 : 0, inward,
    size: 0.16, sizeEnd: 0.04, life: 0.45, drag: 1.5, gravity: -0.4, alpha: 0.85, owner: 'player', castId: cid(s), el: 'shadow' });
  function tendril(s, p, h, lean, delay = 0, life = 1) {
    _a.set(lean?.x ?? 0, 2.6, lean?.z ?? 0); upTo(_a, _q);
    return K.mesh('shadow.tendril', { pos: K.v3(p.x, gy(p.x, p.z) - 0.05, p.z), quat: _q, scale: K.v3(1, h / 1.8, 1), life: life + delay, tIn: 0.2 + delay, tOut: 0.35, castId: cid(s), owner: 'player' });
  }
  function bite(s, p, dir, sc = 1, life = 0.4, delay = 0) {
    _a.set(dir?.x ?? 0, dir?.y ?? 0, dir?.z ?? 1);
    if (_a.lengthSq() < 1e-6) _a.set(0, 0, 1);
    return K.mesh('shadow.crescent', { pos: p, dir: _a.clone().normalize(), scale: sc, life: life + delay, tIn: 0.06 + delay, tOut: 0.2, castId: cid(s), owner: 'player', spin: 0 });
  }
  // 2-frame wing flap: alternate the two raven shapes' alpha at ~9 Hz (ticked by the look engine once per frame)
  const flock = [];
  api.onFrame?.((dt) => {
    for (let i = flock.length - 1; i >= 0; i--) {
      const f = flock[i];
      if (!f.a.alive && !f.b.alive) { flock.splice(i, 1); continue; }
      f.t += dt; const up = Math.floor(f.t * 9 + f.ph) % 2 === 0;
      f.a.setAlpha(up ? 1 : 0); f.b.setAlpha(up ? 0 : 1);
    }
  });
  function raven(s, p, vel, life = 1, sc = 1) {
    const dir = vel.clone().normalize();
    const a = K.mesh('shadow.raven', { pos: p, dir, scale: sc, vel, life, tIn: 0.1, tOut: 0.25, castId: cid(s), owner: 'player' });
    const b = K.mesh('shadow.raven2', { pos: p, dir, scale: sc, vel, life, tIn: 0.1, tOut: 0.25, castId: cid(s), owner: 'player' });
    if (a.alive && b.alive) { b.setAlpha(0); flock.push({ a, b, t: 0, ph: hash(flock.length + cid(s)) * 2 }); }
    return [a, b];
  }

  const M = {
    cast(s) {
      return [K.line({ shape: 'glyph', glyph: 'shadow', el: 'shadow', pos: s.pos, follow: s.follow, plane: 'billboard', r: Math.min(0.55, s.r ?? 0.4), life: s.life ?? 0.3, tIn: 0.08, tOut: 0.12, castId: cid(s) })];
    },
    trail(s) {
      const out = [];
      const R = api.rampOf('shadow');
      if (s.follow) out.push(K.ribbon({ follow: s.follow, width: s.width ?? 0.2, taper: 0.9, life: s.life ?? 0.24, el: 'shadow', castId: cid(s), maxLen: s.len ?? 3, colors: { head: R.dark, tail: R.mid, edge: R.light } }));
      return out;
    },
    burst(s) {
      const r = Math.max(0.4, Math.min(s.r ?? 1.1, 4)), out = [];
      const n = (s.tier === 'U' || s.tier === 'F') ? 4 : 3;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + cid(s) * 0.6; out.push(bite(s, K.v3(s.pos.x + Math.cos(a) * r * 0.45, s.pos.y + Math.sin(a) * 0.25, s.pos.z + Math.sin(a) * r * 0.45), K.v3(Math.cos(a), 0.2, Math.sin(a)), 0.6 + r * 0.35, 0.38, 0.03 * i)); }
      out.push(K.line({ shape: 'crescent', el: 'shadow', pos: s.pos, plane: 'billboard', r: r * 1.2, width: 0.05, life: 0.4, tIn: 0.05, tOut: 0.25, castId: cid(s), color: api.rampOf('shadow').light, color2: api.rampOf('shadow').dark, rot: cid(s) * 0.9 }));
      if (s.pos.y - gy(s.pos.x, s.pos.z) < 1.8) out.push(K.decal('violet', G(s.pos), r, 1.2, { el: 'shadow', castId: cid(s), alpha: 0.3 }));
      wisps(s, s.pos, Math.min(10, s.n ?? 8), true);
      return out;
    },
    spark(s) { wisps(s, s.pos, Math.min(6, s.n ?? 4), true); return null; },
    zone(s) {
      const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 3, g = G(s.pos);
      return [K.line({ shape: 'stipple', el: 'shadow', pos: g, plane: 'ground', r, width: 0.04, density: 0.4, life, tIn: 0.25, tOut: 0.4, alpha: 0.35, castId: cid(s), follow: s.follow, color: api.rampOf('shadow').mid, role: 'fill' }),
        K.line({ shape: 'ring', el: 'shadow', pos: g, plane: 'ground', r: r * 1.02, width: 0.04, life, tIn: 0.25, tOut: 0.4, alpha: 0.35, castId: cid(s), follow: s.follow, color: api.rampOf('shadow').light })];
    },
    pillar(s) {
      const g = G(s.pos), h = Math.min(5, s.h ?? 2.4), out = [];
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + cid(s) * 0.5; out.push(tendril(s, K.v3(g.x + Math.cos(a) * 0.4, 0, g.z + Math.sin(a) * 0.4), h * (0.8 + 0.12 * i), { x: Math.cos(a) * 0.5, z: Math.sin(a) * 0.5 }, 0.05 * i, 1.0)); }
      wisps(s, K.v3(g.x, g.y + 1, g.z), 6, true);
      return out;
    },
    wave(s) {
      const dir = s.dir || { x: 0, z: 1 }, L = Math.min(s.r ?? 4, 9), n = Math.max(2, Math.min(4, Math.round(L / 1.8))), out = [];
      const dl = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / dl, dz = dir.z / dl;
      for (let i = 0; i < n; i++) { const d = (i + 0.7) * L / n; out.push(bite(s, K.v3(s.pos.x + dx * d, gy(s.pos.x + dx * d, s.pos.z + dz * d) + 0.7, s.pos.z + dz * d), K.v3(dx, 0, dz), 0.9 + i * 0.15, 0.4, i * 0.05)); }
      return out;
    },
    aura(s) {
      const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
      return [K.line({ shape: 'crescent', el: 'shadow', pos: s.pos, follow: s.follow, followOff: K.v3(0, 0.05, 0), plane: 'ground', r, width: 0.05, life, tIn: 0.2, tOut: 0.3, spin: 1.1, alpha: 0.35, castId: cid(s), color: api.rampOf('shadow').light })];
    },
    summon(s) {
      const out = [];
      for (let i = 0; i < 3; i++) { const a = i * 0.5 - 0.5 + cid(s) * 0.1; out.push(...raven(s, K.v3(s.pos.x, s.pos.y + 1.2 + i * 0.2, s.pos.z), K.v3(Math.sin(a) * 4, 1.2, Math.cos(a) * 4), 0.9, 1)); }
      return out;
    },
  };
  M.raven = raven; M.bite = bite; M.tendril = tendril;
  for (const k of ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon']) K.registerMotif('shadow', k, M[k]);
  return M;
}
