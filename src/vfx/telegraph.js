// Legacy telegraph decals — the v4 FALLBACK (PLAN §5.2, §7.3, §9 vfx P0-B(5)). vfx.telegraph({shape, pos, dir, r|len|width|angle,
// inner, dur, color, parryable}) → handle. When the real tells module exists (game.tells.telegraph, not the core stub) every call
// is forwarded to it. Otherwise this pool draws the decal itself, fixed:
//  - winding: the grid keeps the PlaneGeometry triangle order with normals UP (the v3 mirrored-z bug made every decal back-face
//    culled: 0 px) AND the material is DoubleSide (regression guarded by the playtest3 combat pixel test)
//  - renderOrder 30, depthTest false, toneMapped false, fog false: drawn over every effect in the transparent pass
//  - threat palette (core/threat.js): dark outer band + rim + 0.16 fill + LINEAR time front; parryable = dashed gold rim
//  - pool 16, never recycles an active decal (skipped decals still return a timing handle); angles: legacy degrees (full angle)
//    or halfAngle (radians, half) — the tells convention.
import * as THREE from 'three';
import { threatColor } from '../core/threat.js';

const GRID = 16;
const POOL = 16;
const SHAPE = { circle: 0, ring: 1, cone: 2, line: 3, capsule: 3, conecap: 3 };

const VERT = /* glsl */`
  varying vec2 vL;
  void main() {
    vL = vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);   // +y = along dir (base z), without mirroring the geometry
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */`
  uniform vec3 uRim, uEdge, uFill, uFront;
  uniform float uProg, uAlpha, uShape, uAngle, uInner, uParry, uRimW, uEdgeW;
  varying vec2 vL;
  void main() {
    vec2 q = vL; float r = length(q);
    float inside = 0.0, f = 0.0, edge = 1.0;
    if (uShape < 0.5) { inside = step(r, 1.0); f = r; edge = 1.0 - r; }
    else if (uShape < 1.5) { inside = step(r, 1.0) * step(uInner, r); f = (r - uInner) / max(1e-3, 1.0 - uInner); edge = min(1.0 - r, r - uInner); }
    else if (uShape < 2.5) { float ang = abs(atan(q.x, q.y)); inside = step(r, 1.0) * step(ang, uAngle); f = r; edge = min(1.0 - r, (uAngle - ang) * max(r, 0.05)); }
    else { inside = step(abs(q.x), 1.0) * step(abs(q.y), 1.0); f = q.y * 0.5 + 0.5; edge = min(1.0 - abs(q.x), (1.0 - abs(q.y)) * 0.5); }
    if (inside < 0.5) discard;
    float px = max(fwidth(edge), 1e-4);
    float band = 1.0 - smoothstep(uEdgeW - px, uEdgeW + px, edge);
    float rim = 1.0 - smoothstep(uEdgeW + uRimW - px, uEdgeW + uRimW + px, edge);
    rim *= 1.0 - band;
    if (uParry > 0.5) { float ang = atan(q.y, q.x); rim *= step(0.4, fract(ang * 12.0 / 6.2831853 + (uShape > 2.5 ? q.y * 4.0 : 0.0))); }
    float filled = step(f, uProg);
    float front = (1.0 - smoothstep(0.0, 0.03, abs(f - uProg))) * step(uProg, 0.999);
    vec3 col = uFill; float a = 0.16 + filled * 0.16;
    col = mix(col, uFront, front); a = max(a, front * 0.9);
    col = mix(col, uRim, rim); a = max(a, rim * 0.95);
    col = mix(col, uEdge, band); a = max(a, band * 0.75);
    gl_FragColor = vec4(col, clamp(a * uAlpha, 0.0, 1.0));
  }`;

function grid() {
  const g = new THREE.PlaneGeometry(2, 2, GRID, GRID);
  g.rotateX(-Math.PI / 2);             // triangle normals +Y (CCW seen from above)
  g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  g.userData.base = Float32Array.from(g.attributes.position.array);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}

export function createTelegraphs(game, vfx) {
  const recs = [];
  let serial = 0, skipped = 0, warnedFull = false, forwarded = 0;
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uRim: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() }, uFill: { value: new THREE.Color() }, uFront: { value: new THREE.Color() },
        uProg: { value: 0 }, uAlpha: { value: 1 }, uShape: { value: 0 }, uAngle: { value: 0.5 }, uInner: { value: 0.5 }, uParry: { value: 0 },
        uRimW: { value: 0.06 }, uEdgeW: { value: 0.04 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
      side: THREE.DoubleSide,
    });
    mat.name = 'vfx-telegraph';
    const mesh = new THREE.Mesh(grid(), mat);
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 30; mesh.name = 'vfx-telegraph'; mesh.userData.owner = 'enemy';
    game.scene.add(mesh);
    const rec = { mesh, active: false, t: 0, dur: 1, born: 0, glint: false, parry: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
      sx: 1, sz: 1, oz: 0, onDone: null, handle: null, laid: new THREE.Vector3(1e9, 0, 0) };
    rec.handle = {
      get alive() { return rec.active; },
      get progress() { return rec.active ? Math.min(1, Math.max(0, rec.t / rec.dur)) : 1; },
      get timeLeft() { return rec.active ? Math.max(0, rec.dur - rec.t) : 0; },
      stop() { if (rec.active) { rec.active = false; rec.mesh.visible = false; } },
      setPos(p) { if (rec.active && p) { rec.pos.copy(p); layout(rec); } },
      setPosition(p) { rec.handle.setPos(p); },
      setDir(d) { if (rec.active && d) { rec.dir.copy(d).setY(0); if (rec.dir.lengthSq() < 1e-8) rec.dir.set(0, 0, 1); rec.dir.normalize(); layout(rec, true); } },
    };
    recs.push(rec);
  }

  /** Terrain-conforming layout; rebuilt only when the decal moved > 0.1 m (or force). */
  function layout(rec, force = false) {
    if (!force && rec.laid.distanceToSquared(rec.pos) < 0.01) return;
    rec.laid.copy(rec.pos);
    const m = rec.mesh, g = m.geometry, base = g.userData.base, arr = g.attributes.position.array;
    const gh = game.world?.getHeight;
    const yaw = Math.atan2(rec.dir.x, rec.dir.z);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const cx = rec.pos.x + rec.oz * s, cz = rec.pos.z + rec.oz * c;
    const ground = gh ? gh(rec.pos.x, rec.pos.z) : rec.pos.y;
    const near = gh && Math.abs(rec.pos.y - ground) < 3;
    m.position.set(0, near ? 0 : rec.pos.y, 0);
    for (let i = 0; i < arr.length; i += 3) {
      // local plane coords: x across, z along dir. No mirroring: the rotation keeps the triangle winding (normals up).
      const lx = base[i] * rec.sx, lz = base[i + 2] * rec.sz;
      const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
      arr[i] = wx; arr[i + 2] = wz;
      arr[i + 1] = near ? gh(wx, wz) + 0.06 : 0.06;
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.boundingSphere.center.set(cx, near ? ground : rec.pos.y, cz);
    g.boundingSphere.radius = Math.max(rec.sx, rec.sz) * 1.5 + 2;
  }

  const timer = { alive: false, t: 0, dur: 1 };
  function timingOnly(dur) {   // pool full: the attack is still timed by its caller; no decal
    const h = { _t0: game.time || 0, _dur: dur, get alive() { return (game.time || 0) - this._t0 < this._dur; }, get progress() { return Math.min(1, ((game.time || 0) - this._t0) / this._dur); },
      get timeLeft() { return Math.max(0, this._dur - ((game.time || 0) - this._t0)); }, stop() { this._dur = 0; }, setPos() {}, setPosition() {}, setDir() {} };
    return h;
  }

  function telegraph(o = {}) {
    const T = game.tells;
    if (T && !T.isStub && typeof T.telegraph === 'function') { forwarded++; return T.telegraph(o); }
    if (!o.pos) return null;
    let rec = null;
    for (const r of recs) { if (!r.active) { rec = r; break; } }
    if (!rec) {
      skipped++;
      if (!warnedFull) { warnedFull = true; console.warn('[vfx.telegraph] pool of 16 full: decal skipped (attack still timed)'); }
      return timingOnly(Math.max(0.1, o.dur ?? 1));
    }
    rec.born = ++serial;
    const shape = SHAPE[o.shape] ?? 0;
    const u = rec.mesh.material.uniforms;
    rec.pos.copy(o.pos);
    if (o.dir) rec.dir.set(o.dir.x, 0, o.dir.z); else rec.dir.set(0, 0, 1);
    if (rec.dir.lengthSq() < 1e-6) rec.dir.set(0, 0, 1); rec.dir.normalize();
    rec.oz = 0;
    let scale = 1;
    if (shape === SHAPE.line) {
      const len = o.len ?? 8, w = o.width ?? 2;
      rec.sx = w * 0.5; rec.sz = len * 0.5; rec.oz = len * 0.5;     // starts at pos, extends along dir
      scale = Math.min(rec.sx, rec.sz);
    } else {
      const r = o.r ?? o.len ?? 3;
      rec.sx = r; rec.sz = r; scale = r;
    }
    u.uShape.value = shape;
    const half = o.halfAngle != null ? o.halfAngle : (o.angle ?? 60) * Math.PI / 180 * 0.5;
    u.uAngle.value = Math.max(0.05, Math.min(Math.PI, half));
    u.uInner.value = o.inner != null ? Math.max(0, Math.min(0.95, o.inner / (o.r || 1))) : 0.6;
    const kind = o.parryable ? 'parry' : o.unblockable ? 'unblockable' : (o.tell || 'danger');
    const tc = threatColor(kind, game.assist?.colorblind || null);
    u.uRim.value.setHex(tc.rim); u.uEdge.value.setHex(tc.edge); u.uFill.value.setHex(tc.fill ?? tc.rim);
    u.uFront.value.setHex(tc.rim).lerp(_white, 0.35);
    u.uParry.value = kind === 'parry' ? 1 : 0;
    // widths in normalised decal units: dark band max(0.12 m), rim max(0.18 m)
    u.uEdgeW.value = Math.min(0.2, 0.12 / Math.max(0.5, scale));
    u.uRimW.value = Math.min(0.25, 0.18 / Math.max(0.5, scale));
    u.uAlpha.value = o.alpha ?? 1;
    u.uProg.value = 0;
    rec.parry = kind === 'parry'; rec.glint = false;
    rec.t = 0; rec.dur = Math.max(0.1, o.dur ?? 1);
    rec.onDone = o.onDone || null;
    rec.active = true; rec.mesh.visible = true;
    layout(rec, true);
    return rec.handle;
  }
  const _white = new THREE.Color(1, 0.96, 0.94);

  function update(dt) {
    for (const r of recs) {
      if (!r.active) continue;
      r.t += dt;
      const p = r.t / r.dur;
      r.mesh.material.uniforms.uProg.value = Math.min(1, Math.max(0, p));          // LINEAR time front (§5.2)
      if (p >= 1) {
        r.active = false; r.mesh.visible = false;
        const cb = r.onDone; r.onDone = null;
        if (cb) { try { cb(); } catch (err) { console.error('[vfx] telegraph onDone', err); } }
      }
    }
    void timer;
  }
  function active() { let n = 0; for (const r of recs) if (r.active) n++; return n; }
  // fix round 1: the fallback program is only warmed when the real tells module is absent (−1 program in normal play)
  function warm(group) { const T = game.tells; if (T && !T.isStub && typeof T.telegraph === 'function') return; const m = new THREE.Mesh(recs[0].mesh.geometry, recs[0].mesh.material); m.frustumCulled = false; group.add(m); }
  function debug() {
    const T = game.tells;
    const real = !!(T && !T.isStub && typeof T.telegraph === 'function');
    return { count: active(), max: POOL, pool: POOL, meshes: recs.length, skipped, forwarded, mode: real ? 'tells' : 'fallback', tellsPool: real ? (T.debug?.pool?.() ?? null) : null };
  }
  return { telegraph, update, active, warm, debug, meshes: recs.map((r) => r.mesh) };
}
