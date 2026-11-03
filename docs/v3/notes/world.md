# world — module notes (v3, wave 1)

Files: `src/world.js`, `src/world/{zones,terraform,mirwen,elderwood,plateau,gates,platforms,colliders,surface2}.js` (new),
`src/world/{terrain,flora,structures,village}.js` (changed), `tools/playtest3/world.js`.

## Layout data — `world/zones.js` (pure data, Korean names)
- `TF` terraform parameters (Mirwen ellipse + 8 islands + west waterfall cliff + cave slot + shore pad; Elderwood glade, hollow,
  root ridges + gaps, giant mushroom, spore vent; ledge (60,−150) r18 top 38; plateau (108,−132) r34 top 52; 5 pillars r22 h+12;
  ascent valley polyline; 2 root ramps; mirror alcove). `ARENA_DEFS`, `ZONE_DEFS` (getZoneAt priority order), `GATE_DEFS`,
  `SHRINE_DEFS` (8 seeds, 4 spirit, 8 landmarks), `ZONE_SIGNS`, `ZONE_NPCS`, `STAGE_ACT`, `EXTRA_GRADES` (dusk, golden), `WATER` (= WATER_LEVEL 1.5).

## Terraform — `world/terraform.js`
- `terraform(x, z, h, T, arenaW)` runs at the end of `terrain.fullHeight`, so the baked grid (no resize) and every
  `getHeight` call site include it. Order: ascent valley carve (never inside the golem arena) → Mirwen basin (`smin`, floor
  WATER−2.5) + islands + hydra ruin-pillar spikes + waterfall cliff + cave slot + shore pad → Elderwood glade/hollow flatten
  (targets `T.glade`, `T.hollow` from `avgRaw`) + additive root ridges → plateau mesa (terraced cliff) → ledge mesa (inside its
  rim the ledge wins; outside it only raises — the two rims touch) → alcove ring → plateau pillar spires → root ramps (max).
- `terraformColor(...)` recolours the vertex colours (teal moss Mirwen, ash + violet rot Elderwood, bark ridges, lavender
  ledge stone with moss, bark/moss plateau, bark ramps) and returns the grass density multiplier.
- `floraBlocked(x, z, margin)` is called from `flora.allowed()` (arenas, plateau/ledge, ramps, gate pads, rot-wall gaps, cave, mushroom).
  Elderwood trees are denser and ash-tinted (`elderwoodWeight`).
- Exports `PILLARS` (5 root pillars), `HYDRA_PILLARS` (6), `RIDGE_GAPS` (= the 3 rot wall spots), `ridgeAdd`.

## Runtime API (CONTRACT §13) on `game.world`
- `zones` (array; `{id, name, center, radius, level, grade, music, fuel, arena:{id, position, radius}, npcSpots}`), `getZoneAt(x,z)`,
  `zoneById`. The player's zone is checked at 4 Hz (real time, every state) → `zoneEnter` / `zoneExit {zoneId, name, level}`.
  On zoneEnter world blends `game.post.grade(zone.grade, GRADE_BLEND)` (skipped while a boss is alive) and lerps the scene fog
  toward twilight (Mirwen) / ash (Elderwood) — never during a cutscene. `dusk`/`golden` are added to `game.post.GRADES` at runtime if core lacks them.
- `bossArenas.{golem, hydra, nox, treant, kalis, nidhoggra}`: `{id, position (y = getHeight), radius}`; `hydra.pillars[6]`,
  `hydra.surfaceY/waterLevel`; `kalis.mirrors[{position, yaw, normal}]`; `nidhoggra.pillars[5]{pos, top}`. `bossArena` = golem.
- `getGroundHeight(x, z, yHint)`: max(terrain, spire top, ice discs, and **only with a yHint** the platforms/static tops with
  `top ≤ yHint + 1.2`). `world.groundPlatform` = the handle that won the last call (read `.delta` to ride it).
- `addPlatform({id, shape:'disc'|'box', center, r|size, top, life, yaw})` → handle `{id, top, center, velocity, delta, moveTo(x, top, z, dt), alive}`;
  `removePlatform(h)`; `platforms` (live). 8 m buckets, ≤ 16 dynamic (oldest recycled). `addStaticTop([{id,x,z,r,top}])` for
  permanent stand-on tops (giant mushroom caps). `delta` holds the movement of the frame it moved in and clears a frame later.
- `addTempCollider({shape:'box'|'cyl', pos, size|r, h, yaw, life, blocksProjectiles, onProjectile, blocksMovement=true})` → handle
  (also pushed into `world.colliders`; boxes are OBBs in `resolveCollision`); `removeCollider(h)`, `moveCollider(h, x, y, z, yaw)`;
  `collidersBlockingProjectiles` (live); `projectileBlockAt(projOrVec3, out?)` → `'block' | 'reflect' | null` (8 m buckets;
  `out.collider`, `out.normal`; an `onProjectile` returning `'pass'` lets it through).
- `addUpdraft({pos, r, h, strength, life, color, visual})` / `removeUpdraft(h)` / `updraftAt(pos)`; merged into
  `surface.getUpdraft(pos)` (max of fire and volumes). ≤ 16 volumes; one instanced additive column draws all of them.
  Static: `ascent1..3` (valley → ledge → plateau) and `pillar0..4` (one per root pillar).
- `clampToBounds(pos, radius)`: circle r 170 plus the plateau / ledge AABBs; `resolveCollision` uses it. `world.bounds` is now
  222 so legacy radial clamps never cut the plateau off (`world.boundsRadius` = 170).
- `gates` `[{id, zoneId, name, zoneName, position, exit, yaw, reached}]`, `travelTo(id, {force, instant})` (1.2 s fade, real
  time, input lock `'gate'`, emits `gateTravel {from, to}`), `openGateMenu(id)`. Walking within 14 m reaches a gate (`gateReached {id, name}`).
  Interact offers `gate:<id>` (label 정령의 문) → `ui.openGateMenu(list, onPick)` with `list = [{id, name, zoneId, zoneName, reached, current}]`;
  without it F cycles to the next reached gate. `respecSpots` = altar + 5 gates. `lastGateSpawn()`.
- `shrines` `[{id, kind, name, element, position, found}]`, `markShrine(id)`; proximity 3 m (|dy| < 2.6) at 4 Hz → `shrineFound {id, kind}`.
  Spirit shrines also offer `shrine:<id>` (F → `shrineUse {id, element}`). `setShrineGlow(id, on)` ('altar' → altar crystals).
- `setActVisible(act)` (explicit calls win; fallback = `STAGE_ACT[story.stage]` at 1 Hz and `bossSpawn` kalis/nidhoggra → act 4).
  Scenery islands I1–I5 are visible from act 4.
- Rot walls: `rotWalls [{id:'rot1'..'rot3', position, state:'intact'|'burned'|'purified'|'smashed'}]`, `setRotWalls(state|{id:state})`,
  `burnRotWall/purifyRotWall/smashRotWall(id)`, `rotWallsCleared()`. Each wall is a combat prop (`isProp`, `xpValue 0`,
  registered in `world.init`): a fire hit burns it, light purifies it, and earth heavy / tier ≥ 2 / tag `colossus|smash` smashes it. A grass
  fire touching it burns it. Emits `rotWallCleared {id, how, cleared, total}`. Offers `rotwall:<id>` (a hint).
  Walls rot1/rot2 seal the deep wood (forest heart, 실바니아's grove, the treant hollow); rot3 seals the seed pocket.
- Mirror door on the ledge (seed shrine behind it): `mirrorDoor`, `openMirrorDoor()`; a light hit (or tag `prism`) opens it → `mirrorDoorOpen`.
- `setBossFightLOD(on)` (grass ≤ 0.25, flora draw distance ≤ 0.3, smaller flora shadow radius); also auto-toggled on
  `bossSpawn`/`bossDefeated` for nidhoggra. `bossFightLOD` getter.
- `surface2`: `mud/bless/curse/overgrow/rubble(pos, r, seconds)`, `isBlessed/isCursed/isMud/isOvergrown/isRubble(pos)`,
  `surfaceAt(pos)`, `timeLeft(name, pos)`, `clear(pos, r)`, `activeCount()`. 172² × 2 m grid, active lists, 10 Hz game time.
  Terrain tint: burn texture B = blessed (gold sheen), A = cursed (violet veins) in the terrain shader.
- `serialize()` → `{v, gates:{reached, found, last}, rotWalls, act, actExplicit, camps, mirrorDoor}`; `deserialize(o)` restores
  without re-emitting `shrineFound`/`rotWallCleared`.
- Village (`world.village`): the altar has one pillar per `ALL_ELEMENTS` entry (merged) and `InstancedMesh(crystals, ALL_ELEMENTS.length)`;
  the four lost spirits' crystals are dim until `spiritFreed` (instance colour only). New `npcSpots`: `rangerMentor`, `paladinMentor`,
  `spiritMentor`, `shadowMentor`, `sage`, `trainer`; `village.reactionDummy` spot. Zone NPC spots: `zones[mirwen].npcSpots.lakeKeeper`,
  `zones[elderwood].npcSpots.forestChild`.

## Draw calls (playtest3 world perf, worst of 4 yaws, skills stubbed, no enemies)
village 256 · plains 222 · Mirwen 233 · Elderwood 231 · plateau 213 (targets 290/300/310/310/330). Zone groups cull at
`(150 + 250·drawDistance) × 0.6` and never cast shadows. Draw calls per zone: Mirwen 6, Elderwood 10, plateau + ledge 10, islands 3,
gates + shrines 6 (global), updraft columns 1. No new lights. Every new material is in the scene at boot, so the boot prewarm compiles it (the islands are
hidden, but compile still visits hidden objects). The program count does not grow when visiting every zone.

## Tests
`node tools/playtest3.js world` runs 98 checks:
- zones, arenas and terraform; zone events; bounds
- platforms; colliders and projectile blocking
- updrafts and ascent glide reachability; ramp slopes
- the Mirwen freeze bridge; surface2
- rot walls via real combat hits
- gates: the interact prompt, F opens the menu and casts nothing, the 1.2 s travel, `gateTravel` emitted once
- seeds (+1 point); act visibility; the altar and NPC spots
- serialize, then deserialize in a fresh boot
- per-zone perf and the programs check
