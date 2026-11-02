// World module: terrain, sky, lighting, grass, flora, water, camps, boss arena, ambience,
// v2: 바람결 마을 (village), 세계수 아스트라 (world tree), terrain interaction (surface), live graphics settings.
import * as THREE from 'three';
import { buildTerrain, buildDistantMountains, LAYOUT, WATER_LEVEL, BOUNDS, CELL } from './world/terrain.js';
import { buildSky, SKY } from './world/sky.js';
import { buildGrass } from './world/grass.js';
import { buildFlora } from './world/flora.js';
import { OCC } from './world/prefab.js';
import { buildStructures } from './world/structures.js';
import { buildWater, WATER_BOX } from './world/water.js';
import { buildAmbience } from './world/ambience.js';
import { buildVillage } from './world/village.js';
import { buildWorldTree } from './world/worldtree.js';
import { buildSurface, createBurnField } from './world/surface.js';
import { VILLAGE } from './world/villageLayout.js';

const SHADOW_Q = { low: { size: 1024, extent: 26 }, medium: { size: 2048, extent: 32 }, high: { size: 2048, extent: 44 } };

export function createWorld(game) {
  const { scene, renderer } = game;
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
    if (sun.shadow.mapSize.x !== Q.size) {
      sun.shadow.mapSize.set(Q.size, Q.size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    Object.assign(sun.shadow.camera, { left: -Q.extent, right: Q.extent, top: Q.extent, bottom: -Q.extent, near: 5, far: 320 });
    sun.shadow.camera.updateProjectionMatrix();
    texel = (Q.extent * 2) / Q.size;
    floraRef?.setShadowRadius?.(Q.extent * 1.5);
  }
  applyShadowQuality(S0.shadowQuality || 'medium');

  // ---------------------------------------------------------------- terrain & queries
  const terrain = buildTerrain(game);
  terrain.mesh.castShadow = false; // terrain self-shadow inside the 30 m shadow box is invisible in cel shading; saves its full tri count
  const { getHeight } = terrain;
  const colliders = [];
  const burnField = createBurnField();
  terrain.burn.uBurnTex.value = burnField.tex;
  terrain.burn.uBurnXform.value.copy(burnField.xform);

  function getNormal(x, z, out = new THREE.Vector3()) {
    const e = CELL * 0.5;
    out.set(getHeight(x - e, z) - getHeight(x + e, z), 2 * e, getHeight(x, z - e) - getHeight(x, z + e));
    return out.normalize();
  }

  const world = {
    getHeight, getNormal, colliders,
    waterLevel: WATER_LEVEL, bounds: BOUNDS, wind,
    // village gate sign (built with the other signposts → one label draw call)
    extraSigns: [{ x: 4.9, z: VILLAGE.gate.z - 7.2, rotY: 0, boards: [{ text: '바람결 마을', dir: 0 }] }],
  };

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
    gridCount = colliders.length;
  }

  /** Colliders whose grid cells overlap the AABB, each once, into `out` (reused array). */
  let qStamp = 0;
  function queryColliders(minX, minZ, maxX, maxZ, out = []) {
    if (gridCount !== colliders.length) rebuildGrid();
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
    if (gridCount !== colliders.length) rebuildGrid();
    let hit = false;
    const i0 = Math.max(0, Math.floor((pos.x - radius + GOFF) / GC)), i1 = Math.min(GN - 1, Math.floor((pos.x + radius + GOFF) / GC));
    const j0 = Math.max(0, Math.floor((pos.z - radius + GOFF) / GC)), j1 = Math.min(GN - 1, Math.floor((pos.z + radius + GOFF) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = grid[j * GN + i]; if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const c = cell[k];
        let cr = c.r;
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
    const r = Math.hypot(pos.x, pos.z);
    if (r > BOUNDS - radius) { const s = (BOUNDS - radius) / r; pos.x *= s; pos.z *= s; hit = true; }
    return hit;
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
  /** Feet height: max(terrain, frozen water surface, rock-spire top). Player & enemies use this. */
  function getGroundHeight(x, z) {
    let h = getHeight(x, z);
    const St = world._spireTop;
    if (St) { const dx = x - St.x, dz = z - St.z; if (dx * dx + dz * dz < St.r * St.r && St.y > h) h = St.y; }
    if (surface) { const ih = surface.iceHeight(x, z); if (ih != null && ih > h) h = ih; }
    return h;
  }

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
    raycast, resolveCollision, queryColliders, isInWater, waterDepth, getGroundHeight, waterLevelAt,
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
  function applySettings(key) {
    const v = game.settings?.values || {};
    if (key === '*' || key === 'grassDensity') grass.setDensity(v.grassDensity ?? 0.6);
    if (key === '*' || key === 'drawDistance') { drawDist = v.drawDistance ?? 0.8; grass.setDrawDistance(drawDist); flora.setDrawDistance(drawDist); }
    if (key === '*' || key === 'shadowQuality') applyShadowQuality(v.shadowQuality || 'medium');
  }
  applySettings('*');
  game.events.on('settingsChanged', ({ key }) => {
    if (['grassDensity', 'drawDistance', 'shadowQuality', '*'].includes(key)) applySettings(key);
  });

  let frameN = 0;
  Object.assign(world, {
    grass, flora, structures, worldTreeObject: worldTree, villageObject: village,
    init() {
      surface.init();
      // material pre-warm happens in main.js boot (after all module inits, with the composer target bound)
      // static world groups: compose their local matrices once instead of every frame (windmill sails animate)
      const keep = new Set([village.sails].filter(Boolean));
      for (const g of [village.group, worldTree.group, flora.group]) {
        g?.traverse?.((o) => { if (keep.has(o)) return; o.updateMatrix(); o.matrixAutoUpdate = false; });
        g?.updateMatrixWorld?.(true);
      }
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
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 160);
      sun.target.updateMatrixWorld();
      cam.updateMatrixWorld();
      sky.update(cam, t);
      grass.update(t, cam, game.player?.object?.position);
      water.update(t);
      structures.update(t);
      ambience.update(t, cam);
      flora.update(cam, focus);
      village.update(t, cam, dt);
      worldTree.update(t);
      terrain.burn.uBurnTime.value = t;
      try { surface.update(dt, realDt); } catch (err) { if (!world._surfErr) { world._surfErr = true; console.error('[world] surface', err); } }
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
  return world;
}
