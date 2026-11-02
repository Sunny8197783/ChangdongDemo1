// World module: terrain, sky, lighting, grass, flora, water, camps, boss arena, ambience.
import * as THREE from 'three';
import { buildTerrain, buildDistantMountains, LAYOUT, WATER_LEVEL, BOUNDS, CELL } from './world/terrain.js';
import { buildSky, SKY } from './world/sky.js';
import { buildGrass } from './world/grass.js';
import { buildFlora } from './world/flora.js';
import { OCC } from './world/prefab.js';
import { buildStructures } from './world/structures.js';
import { buildWater, WATER_BOX } from './world/water.js';
import { buildAmbience } from './world/ambience.js';

export function createWorld(game) {
  const { scene, renderer } = game;
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
  sun.shadow.mapSize.set(2048, 2048);
  const SB = 32;
  Object.assign(sun.shadow.camera, { left: -SB, right: SB, top: SB, bottom: -SB, near: 5, far: 320 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2;
  scene.add(sun); scene.add(sun.target);
  // light-space basis for texel snapping
  const lz = sunDir.clone().negate();
  const lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lz).normalize();
  const ly = new THREE.Vector3().crossVectors(lz, lx).normalize();
  const texel = (SB * 2) / 2048;

  // ---------------------------------------------------------------- terrain & queries
  const terrain = buildTerrain(game);
  const { getHeight } = terrain;
  const colliders = [];

  function getNormal(x, z, out = new THREE.Vector3()) {
    const e = CELL * 0.5;
    out.set(getHeight(x - e, z) - getHeight(x + e, z), 2 * e, getHeight(x, z - e) - getHeight(x, z + e));
    return out.normalize();
  }

  const world = {
    getHeight, getNormal, colliders,
    waterLevel: WATER_LEVEL, bounds: BOUNDS,
  };

  buildDistantMountains(game).material.uniforms.uSun.value.copy(sunDir);
  const sky = buildSky(game, sunDir);

  const uTime = { value: 0 };
  const structures = buildStructures(game, world);
  const flora = buildFlora(game, world, uTime);
  const grass = buildGrass(game, terrain, wind);
  const water = buildWater(game, terrain, sunDir, SKY.horizon);
  const ambience = buildAmbience(game, terrain, wind);

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

  function resolveCollision(pos, radius = 0.5) {
    if (gridCount !== colliders.length) rebuildGrid();
    let hit = false;
    const i0 = Math.max(0, Math.floor((pos.x - radius + GOFF) / GC)), i1 = Math.min(GN - 1, Math.floor((pos.x + radius + GOFF) / GC));
    const j0 = Math.max(0, Math.floor((pos.z - radius + GOFF) / GC)), j1 = Math.min(GN - 1, Math.floor((pos.z + radius + GOFF) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = grid[j * GN + i]; if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const c = cell[k];
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const rr = c.r + radius;
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

  function isInWater(x, z) {
    if (x < WATER_BOX.x0 || x > WATER_BOX.x1 || z < WATER_BOX.z0 || z > WATER_BOX.z1) return false;
    return getHeight(x, z) < WATER_LEVEL - 0.05;
  }
  function waterDepth(x, z) { return isInWater(x, z) ? WATER_LEVEL - getHeight(x, z) : 0; }

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
    raycast, resolveCollision, isInWater, waterDepth,
    playerSpawn: v3(LAYOUT.spawn[0], LAYOUT.spawn[1]),
    spawnYaw: 0, // facing -Z (north)
    trainingArea: v3(LAYOUT.training[0], LAYOUT.training[1]),
    trainingRadius: LAYOUT.trainingR,
    camps, bossArena, paths,
    pathway: paths.main,
    sunDirection: sunDir, wind, sun, hemi,
    terrainMesh: terrain.mesh, heightTexture: terrain.heightTex,
    /** Optional: brighten arena runes (0..1), e.g. during the boss fight. */
    setArenaGlow(v) { structures.runes.uBoost.value = v; },
    update(dt, realDt) {
      const t = game.realTime;
      uTime.value = t;
      const cam = game.camera;
      const focus = game.player?.object?.position || cam.position;
      // shadow camera follows focus, snapped to texels to avoid shimmering
      const fx = focus.x - sunDir.x * 0, fz = focus.z;
      const tx = Math.round((fx * lx.x + focus.y * lx.y + fz * lx.z) / texel) * texel;
      const ty = Math.round((fx * ly.x + focus.y * ly.y + fz * ly.z) / texel) * texel;
      const tz = fx * lz.x + focus.y * lz.y + fz * lz.z;
      sun.target.position.set(lx.x * tx + ly.x * ty + lz.x * tz, lx.y * tx + ly.y * ty + lz.y * tz, lx.z * tx + ly.z * ty + lz.z * tz);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 160);
      sun.target.updateMatrixWorld();
      sky.update(cam, t);
      grass.update(t, cam, game.player?.object?.position);
      water.update(t);
      structures.update(t);
      ambience.update(t, cam);
      flora.update?.(cam);
      // see-through segment: camera -> hero chest
      const pp = game.player?.object?.position;
      if (pp && game.state !== 'title') { OCC.uOccA.value.copy(cam.position); OCC.uOccB.value.set(pp.x, pp.y + 1.1, pp.z); }
      else { OCC.uOccA.value.set(0, -999, 0); OCC.uOccB.value.set(0, -999, 1); }
    },
  });
  return world;
}
