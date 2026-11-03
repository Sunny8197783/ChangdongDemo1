// Telegraph decals (DESIGN §9 A3, CONTRACT §20). vfx.telegraph({shape, pos, dir, r|len|width|angle, dur, color, parryable})
// → handle. Pool 8 (recycles the oldest). The decal radius equals the hitbox radius exactly (no padding).
// Fill grows from the centre to the edge (cone/circle radially, line along its length, ring across its band).
// Colours: damage = red-orange, void = violet, grab = teal; parryable adds a gold rim and a golden glint 0.15 s
// before the hit. Terrain-conforming grid (same technique as ground decals). One shared program; tint = uniforms.
import * as THREE from 'three';

const GRID = 16;
const POOL = 8;
const COLORS = { damage: 0xff5a2a, void: 0x9a5cff, grab: 0x3fe0c0, holy: 0xffd36a };
const SHAPE = { circle: 0, ring: 1, cone: 2, line: 3 };

const VERT = /* glsl */`
  varying vec2 vL;
  #include <fog_pars_vertex>
  void main() {
    vL = uv * 2.0 - 1.0;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColor, uRim;
  uniform float uProg, uAlpha, uShape, uAngle, uInner, uTime, uParry, uEdge;
  varying vec2 vL;
  #include <fog_pars_fragment>
  void main() {
    vec2 q = vL; float r = length(q);
    float inside = 0.0, f = 0.0, edge = 1.0;
    if (uShape < 0.5) { inside = step(r, 1.0); f = r; edge = 1.0 - r; }
    else if (uShape < 1.5) { inside = step(r, 1.0) * step(uInner, r); f = (r - uInner) / max(1e-3, 1.0 - uInner); edge = min(1.0 - r, r - uInner); }
    else if (uShape < 2.5) { float ang = abs(atan(q.x, q.y)); inside = step(r, 1.0) * step(ang, uAngle); f = r; edge = min(1.0 - r, (uAngle - ang) * max(r, 0.05)); }
    else { inside = step(abs(q.x), 1.0) * step(abs(q.y), 1.0); f = q.y * 0.5 + 0.5; edge = min(1.0 - abs(q.x), (1.0 - abs(q.y)) * 0.5); }
    if (inside < 0.5) discard;
    float filled = step(f, uProg);
    float lead = exp(-pow((f - uProg) / 0.025, 2.0)) * step(uProg, 0.999);
    float rim = 1.0 - smoothstep(0.0, uEdge, edge);
    float hatch = 0.5 + 0.5 * sin((q.x + q.y) * 18.0 - uTime * 3.0);
    float a = (filled * (0.32 + 0.08 * hatch) + (1.0 - filled) * 0.1 + lead * 0.7 + rim * 0.85) * uAlpha;
    float endPulse = smoothstep(0.82, 1.0, uProg) * (0.5 + 0.5 * sin(uTime * 40.0));
    a += endPulse * 0.25 * uAlpha * filled;
    vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), lead * 0.6);
    col = mix(col, uRim, rim * uParry);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <fog_fragment>
  }`;

function grid() {
  const g = new THREE.PlaneGeometry(2, 2, GRID, GRID);
  g.rotateX(-Math.PI / 2);
  g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  g.userData.base = Float32Array.from(g.attributes.position.array);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}

export function createTelegraphs(game, vfx) {
  const recs = [];
  const fogU = THREE.UniformsLib.fog;
  let serial = 0;
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([fogU, {
        uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color(0xffd36a) }, uProg: { value: 0 }, uAlpha: { value: 1 },
        uShape: { value: 0 }, uAngle: { value: 0.5 }, uInner: { value: 0.5 }, uTime: { value: 0 }, uParry: { value: 0 }, uEdge: { value: 0.04 },
      }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(grid(), mat);
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'vfx-telegraph';
    game.scene.add(mesh);
    const rec = { mesh, active: false, t: 0, dur: 1, born: 0, glint: false, parry: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
      sx: 1, sz: 1, oz: 0, onDone: null, handle: null };
    rec.handle = {
      get alive() { return rec.active; },
      get progress() { return rec.active ? Math.min(1, Math.max(0, rec.t / rec.dur)) : 1; },
      get timeLeft() { return rec.active ? Math.max(0, rec.dur - rec.t) : 0; },
      stop() { if (rec.active) { rec.active = false; rec.mesh.visible = false; } },
      setPos(p) { if (rec.active && p) { rec.pos.copy(p); layout(rec); } },
      setDir(d) { if (rec.active && d) { rec.dir.copy(d).setY(0).normalize(); layout(rec); } },
    };
    recs.push(rec);
  }

  function layout(rec) {
    const m = rec.mesh, g = m.geometry, base = g.userData.base, arr = g.attributes.position.array;
    const gh = game.world?.getHeight;
    const yaw = Math.atan2(rec.dir.x, rec.dir.z);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const cx = rec.pos.x + rec.oz * s, cz = rec.pos.z + rec.oz * c;
    const ground = gh ? gh(rec.pos.x, rec.pos.z) : rec.pos.y;
    const near = gh && Math.abs(rec.pos.y - ground) < 3;
    m.position.set(0, near ? 0 : rec.pos.y, 0);
    for (let i = 0; i < arr.length; i += 3) {
      // local plane coords: x across, z along dir (uv.y follows -z of PlaneGeometry after rotateX → flip)
      const lx = base[i] * rec.sx, lz = -base[i + 2] * rec.sz;
      const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
      arr[i] = wx; arr[i + 2] = wz;
      arr[i + 1] = near ? gh(wx, wz) + 0.08 : 0.05;
    }
    g.attributes.position.needsUpdate = true;
    g.boundingSphere.center.set(cx, near ? ground : rec.pos.y, cz);
    g.boundingSphere.radius = Math.max(rec.sx, rec.sz) * 1.5 + 2;
  }

  function telegraph(o = {}) {
    if (!o.pos) return null;
    let rec = null, oldest = recs[0];
    for (const r of recs) { if (!r.active) { rec = r; break; } if (r.born < oldest.born) oldest = r; }
    if (!rec) rec = oldest;
    rec.born = ++serial;
    const shape = SHAPE[o.shape] ?? 0;
    const u = rec.mesh.material.uniforms;
    rec.pos.copy(o.pos);
    if (o.dir) rec.dir.copy(o.dir).setY(0); else rec.dir.set(0, 0, 1);
    if (rec.dir.lengthSq() < 1e-6) rec.dir.set(0, 0, 1); rec.dir.normalize();
    rec.oz = 0;
    if (shape === SHAPE.line) {
      const len = o.len ?? 8, w = o.width ?? 2;
      rec.sx = w * 0.5; rec.sz = len * 0.5;
      rec.oz = len * 0.5;   // starts at pos, extends along dir
    } else {
      const r = o.r ?? o.len ?? 3;
      rec.sx = r; rec.sz = r;
    }
    u.uShape.value = shape;
    u.uAngle.value = Math.max(0.05, Math.min(Math.PI, (o.angle ?? 60) * Math.PI / 180 * 0.5));
    u.uInner.value = o.inner != null ? Math.max(0, Math.min(0.95, o.inner / (o.r || 1))) : 0.6;
    u.uColor.value.setHex(typeof o.color === 'number' ? o.color : (COLORS[o.color] ?? COLORS.damage));
    u.uParry.value = o.parryable ? 1 : 0;
    u.uEdge.value = shape === SHAPE.line ? 0.06 : 0.035;
    u.uAlpha.value = o.alpha ?? 0.9;
    u.uProg.value = 0;
    rec.parry = !!o.parryable; rec.glint = false;
    rec.t = 0; rec.dur = Math.max(0.1, o.dur ?? 1);
    rec.onDone = o.onDone || null;
    rec.active = true; rec.mesh.visible = true;
    layout(rec);
    return rec.handle;
  }

  function update(dt, realDt) {
    for (const r of recs) {
      if (!r.active) continue;
      r.t += dt;
      const u = r.mesh.material.uniforms;
      u.uTime.value += realDt || dt;
      const p = r.t / r.dur;
      u.uProg.value = Math.min(1, 1 - Math.pow(1 - Math.min(1, p), 1.6));
      if (r.parry && !r.glint && r.dur - r.t <= 0.15) {
        r.glint = true;
        // golden parry glint (emissive sprite, no light)
        vfx.flashSprite?.(r.pos, 0xffe08a, 2.6, 0.15, 1.6);
        vfx.burst?.(r.pos, { count: 8, shape: 'star', color: [0xffffff, 0xffd36a], speed: 3, size: 0.4, sizeEnd: 0.05, life: 0.3, up: 1.5 });
      }
      if (p >= 1) {
        r.active = false; r.mesh.visible = false;
        const cb = r.onDone; r.onDone = null;
        if (cb) { try { cb(); } catch (err) { console.error('[vfx] telegraph onDone', err); } }
      }
    }
  }
  function active() { let n = 0; for (const r of recs) if (r.active) n++; return n; }
  function warm(group) { /* the 8 meshes already live in the scene (hidden); compile visits them */ void group; }
  return { telegraph, update, active, warm, meshes: recs.map((r) => r.mesh) };
}
