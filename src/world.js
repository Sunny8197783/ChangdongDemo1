// World module: terrain, sky, lighting, grass, flora, water, camps, boss arena, ambience,
// v2: 바람결 마을 (village), 세계수 아스트라 (world tree), terrain interaction (surface), live graphics settings.
import * as THREE from 'three';
import { buildTerrain, buildDistantMountains, LAYOUT, WATER_LEVEL, BOUNDS, CELL, ORIGIN, SIZE, NV, HEIGHTFIELD_GLSL } from './world/terrain.js';
import { buildSky, SKY } from './world/sky.js';
import { buildGrass } from './world/grass.js';
import { buildFlora, SHADOW_LAYER as FLORA_SHADOW_LAYER } from './world/flora.js';
import { OCC } from './world/prefab.js';
import { buildStructures } from './world/structures.js';
import { buildWater, WATER_BOX } from './world/water.js';
import { buildAmbience } from './world/ambience.js';
import { buildVillage } from './world/village.js';
import { buildWorldTree } from './world/worldtree.js';
import { buildSurface, createBurnField, GRID as SGRID } from './world/surface.js';
import { VILLAGE } from './world/villageLayout.js';
// v3 (CONTRACT §13)
import { createZones, ARENA_DEFS, TF, STAGE_ACT, GRADE_BLEND, EXTRA_GRADES, ZONE_SIGNS } from './world/zones.js';
import { PILLARS, HYDRA_PILLARS } from './world/terraform.js';
import { createColliders } from './world/colliders.js';
import { createPlatforms } from './world/platforms.js';
import { createSurface2 } from './world/surface2.js';
import { buildGates } from './world/gates.js';
import { buildMirwen } from './world/mirwen.js';
import { buildElderwood } from './world/elderwood.js';
import { buildPlateau } from './world/plateau.js';

/** World clamp: the r 170 circle plus the plateau / ledge AABBs (they reach past the circle). */
const CLAMP_BOXES = [TF.plateau, TF.ledge].map((D) => ({ x0: D.x - D.r - 2, x1: D.x + D.r + 2, z0: D.z - D.r - 2, z1: D.z + D.r + 2 }));

// v4 (PLAN §2.2 / task item 7): map size per preset (settings.shadowSize 1024 low/medium, 2048 high), extent ±32 m,
// casters within SHADOW_CASTER_D m of the receivers along the light (the sun sits that far up its direction).
const SHADOW_Q = { low: { size: 1024, extent: 32 }, medium: { size: 1024, extent: 32 }, high: { size: 2048, extent: 32 } };
const SHADOW_CASTER_D = 60;

export function createWorld(game) {
  const { scene, renderer } = game;
  const rootStart = scene.children.length;   // every root added from here on is world-owned (v4: static-matrix pass in init)
  const S0 = game.settings?.values || {};
  const sunDir = new THREE.Vector3(0.85, 0.55, -0.1).normalize(); // 3/4 side light relative to the north-bound travel direction
  const wind = { dir2: new THREE.Vector2(0.8, -0.6).normalize(), dir: new THREE.Vector3(0.8, 0, -0.6).normalize(), strength: 1 };

  // ---------------------------------------------------------------- renderer tuning
  renderer.toneMappingExposure = 1.08;
  if (game.bloomPass) { game.bloomPass.threshold = 0.9; game.bloomPass.strength = 0.45; game.bloomPass.radius = 0.55; }
  scene.background = SKY.horizon.clone();
  scene.fog = new THREE.Fog(new THREE.Color(0xb7d3ee), 60, 470); // bluish aerial perspective: far ridges go periwinkle

  // ---------------------------------------------------------------- lighting
  const hemi = new THREE.HemisphereLight(0xc4e2ff, 0x6f9a4c, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.7);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2;
  scene.add(sun); scene.add(sun.target);
  // light-space basis for texel snapping
  const lz = sunDir.clone().negate();
  const lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lz).normalize();
  const ly = new THREE.Vector3().crossVectors(lz, lx).normalize();
  let texel = 1, floraRef = null;
  function applyShadowQuality(q) {
    const Q = SHADOW_Q[q] || SHADOW_Q.medium;
    const size = game.settings?.values?.shadowSize || Q.size;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    Object.assign(sun.shadow.camera, { left: -Q.extent, right: Q.extent, top: Q.extent, bottom: -Q.extent, near: 1, far: SHADOW_CASTER_D + 50 });
    sun.shadow.camera.updateProjectionMatrix();
    texel = (Q.extent * 2) / size;
    floraRef?.setShadowRadius?.(Q.extent * 1.5);
  }
  applyShadowQuality(S0.shadowQuality || 'medium');

  // ---------------------------------------------------------------- terrain & queries
  const terrain = buildTerrain(game);
  // v4: terrain never casts (chunks + far mesh are built with castShadow = false; PLAN §2.2 low/medium)
  const { getHeight } = terrain;
  const colliders = [];
  let collidersDirty = true;
  const markColliders = () => { collidersDirty = true; };
  const burnField = createBurnField();
  terrain.burn.uBurnTex.value = burnField.tex;
  terrain.burn.uBurnXform.value.copy(burnField.xform);
  // v4: bounding circle of the live overlay texels (burn / bless / curse) → terrain uOverlayCircle (r 0 = no fetch anywhere)
  let overlayVer = -1;
  function refreshOverlayCircle() {
    const tex = burnField.tex; if (tex.version === overlayVer) return;
    overlayVer = tex.version;
    const D = burnField.data, n = SGRID.n;
    let i0 = n, i1 = -1, j0 = n, j1 = -1;
    for (let k = 0, q = 0; k < n * n; k++, q += 4) {
      if ((D[q] | D[q + 1] | D[q + 2] | D[q + 3]) === 0) continue;
      const i = k % n, j = (k - i) / n;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
    }
    const C = terrain.burn.uOverlayCircle.value;
    if (i1 < 0) { C.set(0, 0, 0, 0); return; }
    const cs = SGRID.cs, x0 = SGRID.x0 + i0 * cs, x1 = SGRID.x0 + (i1 + 1) * cs, z0 = SGRID.z0 + j0 * cs, z1 = SGRID.z0 + (j1 + 1) * cs;
    C.set((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + cs * 1.5, 0);
  }

  function getNormal(x, z, out = new THREE.Vector3()) {
    const e = CELL * 0.5;
    out.set(getHeight(x - e, z) - getHeight(x + e, z), 2 * e, getHeight(x, z - e) - getHeight(x, z + e));
    return out.normalize();
  }

  const world = {
    getHeight, getNormal, colliders,
    // v3: the real clamp is clampToBounds (circle r 170 + plateau/ledge AABBs, applied in resolveCollision); `bounds`
    // stays a number large enough that legacy radial clamps (player.js) never cut the plateau off.
    waterLevel: WATER_LEVEL, bounds: 222, boundsRadius: BOUNDS, wind,
    // village gate sign + v3 zone signposts (built with the other signposts → one label draw call)
    extraSigns: [{ x: 4.9, z: VILLAGE.gate.z - 7.2, rotY: 0, boards: [{ text: '바람결 마을', dir: 0 }] }, ...ZONE_SIGNS],
  };
  // v3 temporary colliders, updraft volumes and stand-on platforms exist before any dressing is built
  const tempCol = createColliders(game, world, { colliders, onChange: markColliders });
  const platforms = createPlatforms(game);
  Object.assign(world, {
    addTempCollider: tempCol.addTempCollider, removeCollider: tempCol.removeCollider, moveCollider: tempCol.moveCollider,
    collidersBlockingProjectiles: tempCol.blocking, projectileBlockAt: tempCol.projectileBlockAt,
    addUpdraft: tempCol.addUpdraft, removeUpdraft: tempCol.removeUpdraft, updraftAt: tempCol.updraftAt, updrafts: tempCol.drafts,
    addPlatform: platforms.addPlatform, removePlatform: platforms.removePlatform, platforms: platforms.dynamic,
    /** Static stand-on tops (giant mushroom caps): [{id, x, z, r, top}] — player only (yHint rule), not counted toward the 16. */
    addStaticTop(list) { for (const t of [].concat(list || [])) { const p = platforms.addStatic({ id: t.id, shape: 'disc', center: { x: t.x, y: t.top, z: t.z }, r: t.r, top: t.top }); staticTops[t.id] = p; } },
  });
  const staticTops = {};

  buildDistantMountains(game).material.uniforms.uSun.value.copy(sunDir);
  const sky = buildSky(game, sunDir);

  const uTime = { value: 0 };
  const structures = buildStructures(game, world);
  const water = buildWater(game, terrain, sunDir, SKY.horizon);
  const village = buildVillage(game, world, { uTime, waterMaterial: water.mesh.material });
  const flora = buildFlora(game, world, uTime);
  floraRef = flora;
  const grass = buildGrass(game, terrain, wind, { burnTex: burnField.tex, burnXform: burnField.xform });
  const ambience = buildAmbience(game, terrain, wind);
  const worldTree = buildWorldTree(game, sunDir);

  // ---------------------------------------------------------------- collider spatial hash
  const GC = 8, GOFF = 200, GN = Math.ceil((GOFF * 2) / GC);
  let grid = null, gridCount = -1;
  function rebuildGrid() {
    grid = new Array(GN * GN);
    for (const c of colliders) {
      const i0 = Math.max(0, Math.floor((c.x - c.r + GOFF) / GC)), i1 = Math.min(GN - 1, Math.floor((c.x + c.r + GOFF) / GC));
      const j0 = Math.max(0, Math.floor((c.z - c.r + GOFF) / GC)), j1 = Math.min(GN - 1, Math.floor((c.z + c.r + GOFF) / GC));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (grid[j * GN + i] ||= []).push(c);
    }
    gridCount = colliders.length; collidersDirty = false;
  }

  /** Colliders whose grid cells overlap the AABB, each once, into `out` (reused array). */
  let qStamp = 0;
  function queryColliders(minX, minZ, maxX, maxZ, out = []) {
    if (collidersDirty || gridCount !== colliders.length) rebuildGrid();
    out.length = 0; qStamp++;
    const i0 = Math.max(0, Math.floor((minX + GOFF) / GC)), i1 = Math.min(GN - 1, Math.floor((maxX + GOFF) / GC));
    const j0 = Math.max(0, Math.floor((minZ + GOFF) / GC)), j1 = Math.min(GN - 1, Math.floor((maxZ + GOFF) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = grid[j * GN + i]; if (!cell) continue;
      for (let k = 0; k < cell.length; k++) { const c = cell[k]; if (c._qs !== qStamp) { c._qs = qStamp; out.push(c); } }
    }
    return out;
  }

  function resolveCollision(pos, radius = 0.5) {
    if (collidersDirty || gridCount !== colliders.length) rebuildGrid();
    let hit = false;
    const i0 = Math.max(0, Math.floor((pos.x - radius + GOFF) / GC)), i1 = Math.min(GN - 1, Math.floor((pos.x + radius + GOFF) / GC));
    const j0 = Math.max(0, Math.floor((pos.z - radius + GOFF) / GC)), j1 = Math.min(GN - 1, Math.floor((pos.z + radius + GOFF) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = grid[j * GN + i]; if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const c = cell[k];
        if (c.box) { if (pushBox(c, pos, radius)) hit = true; continue; }
        let cr = c.r;
        if (c.kind === 'temp' && pos.y + 1.7 < c.base) continue;
        if (c.top !== undefined) {
          if (pos.y > c.top - 0.6) continue; // standing on top (e.g. the rock spire)
          if (c.rTop !== undefined) cr = c.r + (c.rTop - c.r) * Math.min(1, Math.max(0, (pos.y - c.base) / (c.top - c.base)));
        }
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const rr = cr + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2);
          if (d < 1e-5) { pos.x += rr; }
          else { const push = (rr - d) / d; pos.x += dx * push; pos.z += dz * push; }
          hit = true;
        }
      }
    }
    if (clampToBounds(pos, radius)) hit = true;
    return hit;
  }
  /** Oriented-box collider push-out (v3 temp colliders: rot walls, mirror door, ice walls…). */
  function pushBox(c, pos, radius) {
    if (pos.y > c.top - 0.6 || pos.y + 1.7 < c.base) return false;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    const cx = Math.max(-c.hx, Math.min(c.hx, lx)), cz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ox = lx - cx, oz = lz - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= radius * radius) return false;
    let nlx, nlz;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); const push = radius - d; nlx = lx + ox / d * push; nlz = lz + oz / d * push; }
    else {   // centre inside the box: leave through the nearest face
      const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
      if (px < pz) { nlx = (Math.sign(lx) || 1) * (c.hx + radius); nlz = lz; } else { nlz = (Math.sign(lz) || 1) * (c.hz + radius); nlx = lx; }
    }
    pos.x = c.x + nlx * c.cos + nlz * c.sin; pos.z = c.z - nlx * c.sin + nlz * c.cos;
    return true;
  }
  /** Keep pos inside the world: the r 170 circle plus the plateau / ledge AABBs. Returns true when it moved pos. */
  function clampToBounds(pos, radius = 0) {
    const R = BOUNDS - radius;
    const r = Math.hypot(pos.x, pos.z);
    if (r <= R) return false;
    for (let i = 0; i < CLAMP_BOXES.length; i++) { const B = CLAMP_BOXES[i]; if (pos.x > B.x0 + radius && pos.x < B.x1 - radius && pos.z > B.z0 + radius && pos.z < B.z1 - radius) return false; }
    // nearest allowed point: the circle, or the inside of any box
    let bx = pos.x * R / r, bz = pos.z * R / r, bd = (bx - pos.x) ** 2 + (bz - pos.z) ** 2;
    for (let i = 0; i < CLAMP_BOXES.length; i++) {
      const B = CLAMP_BOXES[i];
      const x = Math.max(B.x0 + radius, Math.min(B.x1 - radius, pos.x)), z = Math.max(B.z0 + radius, Math.min(B.z1 - radius, pos.z));
      const d = (x - pos.x) ** 2 + (z - pos.z) ** 2;
      if (d < bd) { bd = d; bx = x; bz = z; }
    }
    pos.x = bx; pos.z = bz;
    return true;
  }

  function raycast(origin, dir, maxDist = 200, out) {
    let t = 0;
    let gap = origin.y - getHeight(origin.x, origin.z);
    if (gap <= 0) return (out || new THREE.Vector3()).copy(origin);
    let prevT = 0;
    while (t < maxDist) {
      prevT = t;
      t = Math.min(maxDist, t + Math.min(4, Math.max(0.2, gap * 0.4)));
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      gap = y - getHeight(x, z);
      if (gap <= 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) * 0.5;
          const g = origin.y + dir.y * m - getHeight(origin.x + dir.x * m, origin.z + dir.z * m);
          if (g > 0) a = m; else b = m;
        }
        return (out || new THREE.Vector3()).copy(origin).addScaledVector(dir, b);
      }
      if (t >= maxDist) break;
    }
    return null;
  }

  const PD = VILLAGE.pond;
  function isInWaterRaw(x, z) {
    if (x < WATER_BOX.x0 || x > WATER_BOX.x1 || z < WATER_BOX.z0 || z > WATER_BOX.z1) return false;
    return getHeight(x, z) < WATER_LEVEL - 0.05;
  }
  const inPond = (x, z) => (x - PD.x) ** 2 + (z - PD.z) ** 2 < PD.r * PD.r * 1.3 && getHeight(x, z) < PD.level - 0.05;
  let surface = null;
  function isInWater(x, z) {
    if (!isInWaterRaw(x, z) && !inPond(x, z)) return false;
    return !(surface && surface.onIce(x, z));
  }
  function waterLevelAt(x, z) { return inPond(x, z) ? PD.level : isInWaterRaw(x, z) ? WATER_LEVEL : null; }
  function waterDepth(x, z) {
    if (!isInWater(x, z)) return 0;
    return (inPond(x, z) ? PD.level : WATER_LEVEL) - getHeight(x, z);
  }
  /**
   * Feet height: max(terrain, frozen water surface, rock-spire top, and — with a yHint — the stand-on platforms whose
   * top ≤ yHint + 1.2). Player passes yHint (its feet y); enemies call it without one and never stand on platforms.
   * world.groundPlatform is the platform handle that won the last call (null otherwise; read it for handle.delta).
   */
  function getGroundHeight(x, z, yHint) {
    let h = getHeight(x, z);
    const St = world._spireTop;
    if (St) { const dx = x - St.x, dz = z - St.z; if (dx * dx + dz * dz < St.r * St.r && St.y > h) h = St.y; }
    if (surface) { const ih = surface.iceHeight(x, z); if (ih != null && ih > h) h = ih; }
    world.groundPlatform = null;
    if (yHint !== undefined && Number.isFinite(yHint)) {
      const pt = platforms.topAt(x, z, yHint);
      if (pt !== null && pt > h) { h = pt; world.groundPlatform = platforms.last; }
    }
    return h;
  }

  /** The stand-on platform the feet at (x, yHint, z) rest on (same rule as getGroundHeight), or null. */
  function platformAt(x, z, yHint) {
    if (yHint === undefined || !Number.isFinite(yHint)) return null;
    getGroundHeight(x, z, yHint);
    return world.groundPlatform;
  }
  /** Shadowblade stealth: dense unburnt meadow grass. */
  const _tg = { x: 0, y: 0, z: 0 };
  function isTallGrass(x, z) { _tg.x = x; _tg.z = z; return !!surface?.isTallGrass?.(_tg); }

  const v3 = (x, z, dy = 0) => new THREE.Vector3(x, getHeight(x, z) + dy, z);
  const camps = LAYOUT.camps.map((c) => ({
    id: c.id, name: c.name, position: v3(c.x, c.z), radius: c.r,
    fire: c.fire, tents: c.tents, tower: c.tower, entranceAngle: c.entranceAngle,
  }));
  const A = LAYOUT.arena;
  const bossArena = {
    position: new THREE.Vector3(A.x, LAYOUT.targets.arena, A.z), radius: A.r,
    rampStart: v3(LAYOUT.ramp.x, LAYOUT.ramp.z1), rampTop: v3(LAYOUT.ramp.x, LAYOUT.ramp.z0),
  };
  const paths = Object.fromEntries(Object.entries(LAYOUT.paths).map(([k, pts]) => [k, pts.filter((_, i) => i % 2 === 0).map((p) => v3(p[0], p[1]))]));

  Object.assign(world, {
    raycast, resolveCollision, queryColliders, isInWater, waterDepth, getGroundHeight, platformAt, isTallGrass, waterLevelAt, clampToBounds, groundPlatform: null,
    _isInWaterRaw: isInWaterRaw,
    village: village.data,
    worldTree: worldTree.data,
    playerSpawn: village.data.playerHome.clone(),
    // player/camera yaw convention: facing (-sin, -cos); spawn looks from the home door toward the plaza
    spawnYaw: village.data.playerHomeYaw - Math.PI,
    trainingArea: village.data.trainingGround.clone(),
    trainingRadius: LAYOUT.trainingR,
    camps, bossArena, paths,
    pathway: paths.main,
    sunDirection: sunDir, sun, hemi,
    terrainMesh: terrain.mesh, heightTexture: terrain.heightTex,
    /**
     * v4 (PLAN §7.4.2, world-p0a): the terrain height field for GPU consumers (instanced telegraph decals).
     * tex = R32F DataTexture (NearestFilter), res.x × res.z texels; texel (i, j) holds getHeight at
     * (origin.x + i·texel, origin.z + j·texel) exactly (vertex-centred, uv of texel centre = ((p − origin)/texel + 0.5)/res).
     * Exact reconstruction = the same triangle interpolation getHeight uses: `glsl` defines
     * `float awHeightField(sampler2D tex, vec2 xz)` (texelFetch ×4). A plain bilinear tap is within a few cm on
     * gentle ground but not on cliffs; use the GLSL helper.
     */
    heightField: {
      tex: terrain.heightTex, origin: { x: ORIGIN, z: ORIGIN }, size: { x: SIZE, z: SIZE }, texel: CELL,
      res: { x: NV, z: NV }, format: 'R32F', filter: 'nearest', glsl: HEIGHTFIELD_GLSL,
    },
    /** Optional: brighten arena runes (0..1), e.g. during the boss fight. */
    setArenaGlow(v) { structures.runes.uBoost.value = v; },
    /** Optional: altar crystal brightness (1 normal, 2+ ceremony). */
    setAltarGlow(v) { village.setAltarGlow(v); },
  });

  // ---------------------------------------------------------------- surface (fire / ice / wind / barrels)
  surface = buildSurface(game, world, terrain, burnField, grass);
  world.surface = surface;
  for (const p of village.data.barrels) surface._makeBarrel(p);
  for (const c of LAYOUT.camps) {
    // two barrels in each camp's meadow, on the side away from its entrance
    const base = (c.entranceAngle ?? 0) + Math.PI;
    for (const off of [-0.35, 0.35]) {
      const a = base + off, r = c.r + 4.5;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      surface._makeBarrel(new THREE.Vector3(x, getHeight(x, z), z));
    }
  }
  village.data.barrels = surface.barrelSpots();

  // ================================================================ v3 zones (CONTRACT §13)
  // updraft volumes merge into the fire updraft (the stronger lift wins)
  {
    const fireUpdraft = surface.getUpdraft.bind(surface);
    surface.getUpdraft = (pos) => { if (!pos) return 0; const a = fireUpdraft(pos); const b = tempCol.updraftAt(pos); return a > b ? a : b; };
  }
  const surface2 = createSurface2(game, burnField);
  world.surface2 = surface2;
  const zones = createZones(game, world, THREE);
  const mirwen = buildMirwen(game, world, { uTime });
  const elderwood = buildElderwood(game, world, { uTime });
  const plateau = buildPlateau(game, world, { uTime });
  const arenaPos = (D) => new THREE.Vector3(D.x, getHeight(D.x, D.z), D.z);
  const bossArenas = {
    golem: Object.assign(bossArena, { id: 'golem' }),
    hydra: { id: 'hydra', position: arenaPos(ARENA_DEFS.hydra), radius: ARENA_DEFS.hydra.r, waterLevel: WATER_LEVEL, surfaceY: WATER_LEVEL,
      pillars: HYDRA_PILLARS.map((q) => ({ pos: new THREE.Vector3(q.x, q.top, q.z), top: q.top })) },
    nox: { id: 'nox', position: arenaPos(ARENA_DEFS.nox), radius: ARENA_DEFS.nox.r },
    treant: { id: 'treant', position: arenaPos(ARENA_DEFS.treant), radius: ARENA_DEFS.treant.r },
    kalis: { id: 'kalis', position: arenaPos(ARENA_DEFS.kalis), radius: ARENA_DEFS.kalis.r, mirrors: plateau.mirrors },
    nidhoggra: { id: 'nidhoggra', position: arenaPos(ARENA_DEFS.nidhoggra), radius: ARENA_DEFS.nidhoggra.r,
      pillars: PILLARS.map((q) => ({ pos: new THREE.Vector3(q.x, q.top, q.z), top: q.top })) },
  };
  for (const Z of zones.zones) {
    const id = Z._def.arena; if (id && bossArenas[id]) Z.arena = { id, position: bossArenas[id].position, radius: bossArenas[id].radius };
  }
  // shrine stand heights: the spire top, the giant mushroom cap, a root-pillar top, the ford
  const shrineY = (d) => {
    let x = d.x, z = d.z, y;
    if (d.ford) { x = LAYOUT.ford.x + 2.5; z = LAYOUT.ford.z + 1.5; }
    if (d.y === 'top:pillar0') { x = PILLARS[0].x; z = PILLARS[0].z; y = PILLARS[0].top; }
    else if (d.y === 'top:mushroom') { const c = elderwood.capTops.find((q) => q.id === 'mushroom'); if (c) { x = c.x; z = c.z; y = c.top; } }
    else if (d.y === 'spire' && world._spireTop) { x = world._spireTop.x; z = world._spireTop.z; y = world._spireTop.y; }
    if (y === undefined) y = Math.max(getHeight(x, z), WATER_LEVEL);   // in water: the surface (swimmers find it)
    return new THREE.Vector3(x, y, z);
  };
  const gates = buildGates(game, world, { uTime, shrineY });
  const respecSpots = [village.data.altar.clone(), ...gates.gates.map((g) => g.position.clone())];
  const campsCleared = new Set();
  game.events?.on?.('spiritFreed', (p) => { if (p?.element) village.setCrystalLit?.(p.element, true); });
  game.events?.on?.('classChosen', () => village.refreshCrystals?.());
  game.events?.on?.('campCleared', (p) => { if (p?.campId) campsCleared.add(p.campId); });

  // ---------------- act visibility (narrative calls setActVisible; story stage / boss spawns are the fallback)
  let act = 1, actExplicit = false;
  function applyAct(a) {
    act = Math.max(1, Math.min(5, a | 0));
    plateau.setIslandsVisible(act >= 4);
    plateau.setChannelVisible(act >= 2);   // the glowing void root channel the reveal follows
  }
  const bossIdOf = (p) => p?.id || p?.boss?.bossId || p?.boss?.id || p?.boss;
  const LOD_BOSSES = new Set(['nidhoggra', 'nox', 'treant']);
  game.events?.on?.('bossSpawn', (p) => {
    const id = bossIdOf(p);
    if (!actExplicit && (id === 'kalis' || id === 'nidhoggra')) applyAct(Math.max(act, 4));
    // idempotent; enemies also call it (CONTRACT §13). The Elderwood arenas (Nox, the treant) sit in the densest
    // flora of the map, so their fights use the same flora / grass LOD as the finale (perf §23)
    if (LOD_BOSSES.has(id)) world.setBossFightLOD?.(true);
  });
  game.events?.on?.('bossDefeated', (p) => { if (LOD_BOSSES.has(bossIdOf(p))) world.setBossFightLOD?.(false); });
  // ---------------- zone colour grade + twilight fog
  {
    const G = game.post?.GRADES;
    if (G) for (const k in EXTRA_GRADES) if (!G[k]) G[k] = EXTRA_GRADES[k];
  }
  let gradeSet = null;
  game.events?.on?.('zoneEnter', (p) => {
    const Z = zones.byId[p?.zoneId]; if (!Z) return;
    const P = game.post; if (!P?.grade) return;
    const bossUp = !!(game.enemies?.boss && game.enemies.boss.alive !== false);
    if (Z.grade && !bossUp) { P.grade(Z.grade, GRADE_BLEND[Z.grade] ?? 0.35, 1.5); gradeSet = P.gradeName; }
    else if (gradeSet && P.gradeName === gradeSet) { P.grade('none', 0, 1.5); gradeSet = null; }
  });
  const baseFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  const FOG_TINT = { mirwen: { color: new THREE.Color(0xa9b4dc), near: 24, far: 260, w: 0.85 }, elderwood: { color: new THREE.Color(0x9ea596), near: 30, far: 300, w: 0.6 } };
  let fogW = 0, fogTarget = 0, fogKey = null;
  const fogC = new THREE.Color();

  // ---------------------------------------------------------------- outline distance culling for big merged meshes
  const outlined = [];
  for (const g of [structures.group, village.group]) {
    g.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const ol = o.children.find((c) => c.isMesh && c.material?.side === THREE.BackSide);
      if (!ol) return;
      o.geometry.computeBoundingSphere();
      outlined.push({ outline: ol, c: o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r: o.geometry.boundingSphere.radius, mesh: o });
    });
  }

  // ---------------------------------------------------------------- graphics settings (live)
  let drawDist = S0.drawDistance ?? 0.8;
  // v4 preset keys: grassDensity, grassNearFade, grassReceiveShadow, treeDist, floraOutlineDist, shadowSize (+ v3 drawDistance,
  // shadowQuality); game.quality.budget.{grassMul, floraMul, floraOutlineDist} are read live every frame (applyBudget).
  const WORLD_KEYS = ['grassDensity', 'drawDistance', 'shadowQuality', 'shadowSize', 'grassNearFade', 'grassReceiveShadow', 'treeDist', 'floraOutlineDist', 'quality', '*'];
  function applySettings(key) {
    const v = game.settings?.values || {};
    const all = key === '*' || key === 'quality';
    if (all || key === 'grassDensity') { if (!bossLOD) grass.setDensity(v.grassDensity ?? 0.4); }
    if (all || key === 'drawDistance') { drawDist = v.drawDistance ?? 0.8; grass.setDrawDistance(drawDist); if (!bossLOD) flora.setDrawDistance(drawDist); }
    if (all || key === 'shadowQuality' || key === 'shadowSize') applyShadowQuality(v.shadowQuality || 'medium');
    if (all || key === 'grassNearFade') grass.setFadeMul(v.grassNearFade ?? 0.7);
    if (all || key === 'grassReceiveShadow') grass.setReceiveShadow(!!v.grassReceiveShadow);
    budgetSeen.floraMul = -1;   // re-apply ranges
  }
  const budgetSeen = { grassMul: -1, floraMul: -1, outline: -1, tree: -1 };
  function applyBudget() {
    const B = game.quality?.budget, v = game.settings?.values || {};
    const gm = B?.grassMul ?? 1, fm = B?.floraMul ?? 1;
    const od = Math.min(B?.floraOutlineDist ?? 99, v.floraOutlineDist ?? 35), td = v.treeDist ?? (150 + 250 * drawDist);
    if (gm !== budgetSeen.grassMul) { budgetSeen.grassMul = gm; grass.setDensityMul(gm); }
    if (fm !== budgetSeen.floraMul || od !== budgetSeen.outline || td !== budgetSeen.tree) {
      budgetSeen.floraMul = fm; budgetSeen.outline = od; budgetSeen.tree = td;
      flora.setRange({ treeDist: td, outlineDist: od, mul: fm });
    }
  }
  let bossLOD = false;
  applySettings('*');
  game.events.on('settingsChanged', ({ key }) => { if (WORLD_KEYS.includes(key)) applySettings(key); });

  // ---------------- v3 API (CONTRACT §13)
  Object.assign(world, {
    zones: zones.zones, getZoneAt: zones.getZoneAt, zoneById: zones.byId,
    bossArenas, bossArena: bossArenas.golem,
    gates: gates.gates, travelTo: (id, o) => gates.travelTo(id, o), openGateMenu: (id) => gates.openMenu(id),
    respecSpots, altar: village.data.altar,
    shrines: gates.shrines, markShrine: (id) => gates.markShrine(id), setShrineGlow(id, on) {
      if (id === 'altar') { village.setAltarGlow(on === true ? 1.6 : on === false ? 0.6 : on); return true; }
      return gates.setShrineGlow(id, on);
    },
    lastGateSpawn: () => gates.lastGateSpawn(),
    setActVisible(a) { actExplicit = true; applyAct(a); },
    rotWalls: elderwood.rotWalls,
    setRotWalls: (st) => elderwood.setStates(st), burnRotWall: (id) => elderwood.burn(id), purifyRotWall: (id) => elderwood.purify(id), smashRotWall: (id) => elderwood.smash(id),
    rotWallsCleared: () => elderwood.rotWalls.filter((w) => w.state !== 'intact').length,
    mirrorDoor: plateau.door, openMirrorDoor: () => plateau.openDoor(),
    rootPillars: plateau.pillars, ledgeMirrors: plateau.mirrors,
    /** During the plateau fight: flora LOD low + sparse grass (enemies call it on the nidhoggra spawn / despawn). */
    setBossFightLOD(on) {
      bossLOD = !!on;
      const v = game.settings?.values || {};
      grass.setDensity(on ? Math.min(0.25, v.grassDensity ?? 0.4) : (v.grassDensity ?? 0.4));
      flora.setDrawDistance(on ? Math.min(0.3, drawDist) : drawDist);
      flora.setShadowRadius?.(on ? 24 : (SHADOW_Q[v.shadowQuality || 'medium'] || SHADOW_Q.medium).extent * 1.5);
    },
    serialize() {
      return { v: 1, gates: gates.serialize(), rotWalls: elderwood.serialize(), act, actExplicit, camps: [...campsCleared], mirrorDoor: plateau.door.state !== 'closed' };
    },
    deserialize(o) {
      if (!o || typeof o !== 'object') return;
      try { gates.deserialize(o.gates); } catch (err) { console.error('[world] deserialize gates', err); }
      try { if (o.rotWalls) elderwood.setStates(o.rotWalls); } catch (err) { console.error('[world] deserialize rot walls', err); }
      if (o.mirrorDoor) plateau.openDoor(true);
      if (Array.isArray(o.camps)) for (const c of o.camps) campsCleared.add(c);
      if (Number.isFinite(o.act)) { actExplicit = !!o.actExplicit; applyAct(o.act); }
    },
    campsCleared: () => [...campsCleared],
    _v3: { zones, gates, mirwen, elderwood, plateau, platforms, tempCol, surface2 },
  });
  // zone dressing groups culled by distance (drawDistance × 0.6 of the flora range), never casting shadows
  const zoneGroups = [
    { g: mirwen.group, c: mirwen.center, r: mirwen.radius },
    { g: elderwood.group, c: elderwood.center, r: elderwood.radius },
    { g: plateau.group, c: plateau.center, r: plateau.radius },
    { g: plateau.ledgeGroup, c: plateau.ledgeCenter, r: plateau.ledgeRadius },
  ];
  /**
   * v4 (PLAN §2.7): every static world object composes its matrix once (matrixAutoUpdate = false + one updateMatrix()).
   * Kept dynamic: lights (+ the sun target), the camera-following sky dome, the windmill sails, the floating arena
   * crystals, the mirror door, and the Object3Ds of combat props (barrels, rot walls, the door prop: knock-back moves them).
   */
  function freezeStaticMatrices() {
    const keep = new Set([village.sails, sky.mesh, sun.target, ...(structures.crystals || [])].filter(Boolean));
    for (const b of surface.barrelList?.() || []) if (b?.object) keep.add(b.object);
    for (const w of elderwood.rotWalls || []) if (w?.prop?.object) keep.add(w.prop.object);
    if (plateau.door?.prop?.object) keep.add(plateau.door.prop.object);
    plateau.ledgeGroup?.traverse?.((o) => { if (o.name === 'mirrorDoor') keep.add(o); });
    const roots = scene.children.slice(rootStart, rootEnd);
    for (const r of roots) {
      r.traverse((o) => {
        if (keep.has(o) || o.isLight || o.isCamera || o.userData?.dynamic) return;
        o.updateMatrix(); o.matrixAutoUpdate = false;
      });
      r.updateMatrixWorld(true);
    }
    world._staticRoots = roots;
  }
  // ---------------- v4 (task item 5/6): always-drawn / village-only / zone transparents culled by camera distance.
  // Each entry: objects + anchor points [x, z, …] + reach R: visible iff the camera is within R of an anchor (xz).
  // Entries remember the visibility they set; objects other code hides (elderwood LOD, act gates) stay hidden.
  const VM = VILLAGE.mask, villageR = Math.max(VM.rx, VM.rz) * 1.1;
  const distCull = [];
  const addCull = (objs, pts, R) => { objs = objs.filter(Boolean); if (objs.length && pts.length) distCull.push({ objs, pts, R2: R * R, on: true }); };
  addCull([village.smoke, village.glow, village.crystals, village.pond], [VM.x, VM.z], villageR + 15);
  for (const o of worldTree.meshes || []) if (o && (o.name === 'worldTreeMotes' || o.frustumCulled === false)) addCull([o], [worldTree.data.position.x, worldTree.data.position.z], villageR + 15);
  addCull(structures.signs || [], structures.signSpots || [], 45);
  if (structures.fires?.positions?.length) addCull([structures.fires.group], structures.fires.positions.flatMap((p) => [p.x, p.z]), 90);
  for (const o of mirwen.meshes || []) if (o?.name === 'mirwenMist') addCull([o], [mirwen.center.x, mirwen.center.z], mirwen.radius + 25);
  function applyDistCull(cam) {
    const cx = cam.position.x, cz = cam.position.z;
    for (let i = 0; i < distCull.length; i++) {
      const D = distCull[i], P = D.pts;
      let on = false;
      for (let k = 0; k < P.length; k += 2) { const dx = P[k] - cx, dz = P[k + 1] - cz; if (dx * dx + dz * dz < D.R2) { on = true; break; } }
      if (on === D.on) continue;
      D.on = on;
      for (let j = 0; j < D.objs.length; j++) D.objs[j].visible = on;
    }
  }
  Object.defineProperty(world, 'act', { get: () => act, enumerable: true });
  Object.defineProperty(world, 'bossFightLOD', { get: () => bossLOD, enumerable: true });
  let acc4 = 1, acc1 = 1;

  let frameN = 0;
  Object.assign(world, {
    grass, flora, structures, worldTreeObject: worldTree, villageObject: village,
    init() {
      surface.init();
      applyAct(act);
      // world builds before combat: register the v3 props (rot walls, the mirror door) now
      for (const w of elderwood.rotWalls) if (w.state === 'intact' && w.prop) { try { game.combat?.register?.(w.prop); } catch (_) { /* */ } }
      if (plateau.door.state === 'closed' && plateau.door.prop) { try { game.combat?.register?.(plateau.door.prop); } catch (_) { /* */ } }
      village.refreshCrystals?.();
      // material pre-warm happens in main.js boot (after all module inits, with the composer target bound)
      freezeStaticMatrices();
    },
    update(dt, realDt) {
      const t = game.realTime;
      uTime.value = t;
      frameN++;
      const cam = game.camera;
      const focus = game.player?.object?.position || cam.position;
      // shadow camera follows focus, snapped to texels to avoid shimmering
      const fx = focus.x, fz = focus.z;
      const tx = Math.round((fx * lx.x + focus.y * lx.y + fz * lx.z) / texel) * texel;
      const ty = Math.round((fx * ly.x + focus.y * ly.y + fz * ly.z) / texel) * texel;
      const tz = fx * lz.x + focus.y * lz.y + fz * lz.z;
      sun.target.position.set(lx.x * tx + ly.x * ty + lz.x * tz, lx.y * tx + ly.y * ty + lz.y * tz, lx.z * tx + ly.z * ty + lz.z * tz);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, SHADOW_CASTER_D);
      { const SL = sun.shadow.camera.layers; if ((SL.mask & 1) && !(SL.mask & (1 << FLORA_SHADOW_LAYER))) SL.mask |= 1 << FLORA_SHADOW_LAYER; }   // shadow-only casters (core resets the mask on settings changes)
      sun.target.updateMatrixWorld();
      cam.updateMatrixWorld();
      sky.update(cam, t);
      grass.update(t, cam, game.player?.object?.position);
      water.update(t);
      structures.update(t);
      ambience.update(t, cam);
      applyBudget();
      applyDistCull(cam);
      flora.update(cam, focus);
      village.update(t, cam, dt);
      worldTree.update(t);
      terrain.burn.uBurnTime.value = t;
      terrain.updateChunks(cam);
      refreshOverlayCircle();
      try { surface.update(dt, realDt); } catch (err) { if (!world._surfErr) { world._surfErr = true; console.error('[world] surface', err); } }
      // ---- v3
      try {
        platforms.update(dt);
        tempCol.update(dt);
        surface2.update(dt);
        zones.update(realDt);
        gates.update(dt, realDt, t);
        mirwen.update(dt, realDt, t);
        elderwood.update(dt, realDt, t);
        plateau.update(dt, realDt, t, tempCol.drafts);
        acc4 += realDt;
        if (acc4 >= 0.25) {
          acc4 = 0;
          gates.tick4();
          const cd = (150 + 250 * drawDist) * 0.6;
          for (const Zg of zoneGroups) Zg.g.visible = Math.hypot(Zg.c.x - cam.position.x, Zg.c.z - cam.position.z) - Zg.r < cd;
          // twilight fog target from the player's zone
          const Zc = zones.current; const ft = Zc && FOG_TINT[Zc.id];
          if (ft) { fogKey = Zc.id; fogTarget = ft.w; } else fogTarget = 0;
        }
        acc1 += realDt;
        if (acc1 >= 1) {
          acc1 = 0;
          if (!actExplicit) { const st = game.story?.stage; const a = st && STAGE_ACT[st]; if (a && a !== act) applyAct(Math.max(a, game.enemies?.boss?.id === 'nidhoggra' || game.enemies?.boss?.id === 'kalis' ? 4 : 1)); }
        }
        if ((fogW !== fogTarget || fogW > 0) && game.state !== 'cutscene') {
          fogW += (fogTarget - fogW) * Math.min(1, realDt * 1.2);
          if (Math.abs(fogW - fogTarget) < 0.002) fogW = fogTarget;
          const ft = FOG_TINT[fogKey];
          if (ft && scene.fog) {
            fogC.copy(baseFog.color).lerp(ft.color, fogW);
            scene.fog.color.copy(fogC);
            scene.fog.near = baseFog.near + (ft.near - baseFog.near) * fogW;
            scene.fog.far = baseFog.far + (ft.far - baseFog.far) * fogW;
          }
        }
      } catch (err) { if (!world._v3Err) { world._v3Err = true; console.error('[world] v3 update', err); } }
      if (frameN % 10 === 0) {
        const od = 55 + 45 * drawDist;
        for (const o of outlined) o.outline.visible = o.mesh.visible && Math.hypot(o.c.x - cam.position.x, o.c.z - cam.position.z) - o.r < od;
      }
      // see-through segment: camera -> hero chest
      const pp = game.player?.object?.position;
      if (pp && game.state !== 'title') { OCC.uOccA.value.copy(cam.position); OCC.uOccB.value.set(pp.x, pp.y + 1.1, pp.z); }
      else { OCC.uOccA.value.set(0, -999, 0); OCC.uOccB.value.set(0, -999, 1); }
    },
  });
  const rootEnd = scene.children.length;
  return world;
}
