# world — v4 notes

Owner: world (`src/world.js`, `src/world/*`, `tools/playtest3/world.js`, `tools/playtest4/world.js`, these notes, `docs/v4/requests/world.md`).
Branch `v4/world` (worktree `/home/user/wt4/world`) from tag `core-p0a`. Tags: **`world-p0a`** (heightField + static matrices), **`world-b`** (final).
No newer core tag than `core-p0a` existed at the final run (`git tag -l`: core-p0a, models-p0a, world-p0a), so nothing else was merged.

## What was built (P0, all items of the §9 world task)

| # | Item | Where | Result |
|---|---|---|---|
| p0a | `world.heightField` | `world.js`, `terrain.js HEIGHTFIELD_GLSL` | R32F `DataTexture` 241×241, NearestFilter, **vertex-centred** (texel (i, j) = getHeight(origin + i·texel)), origin (−180, −180), size 360 m, texel 1.5 m, `glsl` = `float awHeightField(sampler2D tex, vec2 xz)` (4 texelFetch, the getHeight triangle split). GPU error vs getHeight **0.00024 m** (4096 random points). Bilinear taps are NOT exact on cliffs (up to 1.9 m) — use the helper |
| p0a | static matrices | `world.js freezeStaticMatrices()` | every object under a world-created scene root gets `matrixAutoUpdate = false` + one `updateMatrix()` (205 static, 23 dynamic: lights, sky dome, windmill sails, arena crystals, mirror door, prop Object3Ds, beacon) |
| 1 | Terrain chunks + LODs + shader | `terrain.js` | 8×8 chunks (30×30 cells). LOD0 = one Mesh per chunk (exact grid, three.js frustum-culls its bounding sphere), drawn only within **120 m** (AABB distance). LOD1 = every 3rd grid line of all 64 chunks merged into **one** far mesh whose vertex shader collapses the chunks LOD0 draws (`uTerrNear` vec4[16] mask) → far terrain = 1 draw call. Skirts (both windings, 1.2 m / 3 m) on every chunk edge. getHeight / getGroundHeight / raycasts unchanged (CPU height array). New `ShaderMaterial` (`lights:true`, same look as the v3 4-step toon: gradient levels 0.42…1.0, hemisphere + sun + shadows + fog): lighting terms per vertex (sun N·L varying stepped per fragment = crisp bands), **one grain fetch where slope < 0.25** (cross-fade to biplanar 0.25–0.35, biplanar + strata above), 5-tap PCF terrain shadow, **one overlay-mask fetch only inside `uOverlayCircle`** (bounding circle of live burn / bless / curse texels, recomputed when the burn texture changes; r = 0 → no fetch anywhere), grain texture anisotropy 1 (aniso 4 alone was ~15 % of the Elderwood frame). Terrain never casts. Draw order: terrain after the renderOrder-0 opaques (early-z), sky + far mountains last |
| 2 | Point lights | `fire.js`, `surface.js` | created only when `game.render.pointLights === true` (boot); stand-in object otherwise. 0 world point lights at medium |
| 3 | Grass | `grass.js`, `world.js applySettings/applyBudget` | density `settings.grassDensity` (0.25/0.4/0.85) × `budget.grassMul` (live), fade distances × `grassNearFade` (0.6/0.7/1.0), `receiveShadow` per preset (off at low/medium, uniform only), chunks whose nearest point is beyond the fade end skipped on the CPU, far layer = 1-segment blades |
| 4 | Flora | `flora.js` | tree range `settings.treeDist` (120/200/350 m) × `budget.floraMul`, small props at ½, outlines `min(settings.floraOutlineDist, budget.floraOutlineDist)` (20/35/55, L4 20). **Texture-indexed instancing**: each set keeps all instance matrices + colours in a static RGBA32F texture (5 texels/instance); a re-cull uploads only a Float32 index list (4 B per drawn instance, live range, skipped when unchanged). Re-cull at most every 4th frame and only when the camera moved > 2° / 1 m (or the player > 2 m), against a frustum padded by +16° FOV. Shadows: scene meshes never cast; one shadow-only InstancedMesh per family (deciduous / pine / rock, far-LOD geometry, `customDepthMaterial` reading the family texture) on layer 1 within 48 m (rocks 22 m) of the player |
| 5 | Always-drawn village meshes | `world.js applyDistCull` | chimney smoke, altar glow + crystals, pond, world-tree halo + motes hidden outside the village radius (+15 m); sign labels only within 45 m of a sign; camp fires within 90 m; Mirwen mist within its radius + 25 m; Elderwood spores within 25 m of the wood; rot walls frustum-culled by one bounding sphere |
| 6 | World transparents | `water.js`, `mirwen.js`, `elderwood.js`, culls above | water + village pond are **opaque** now (the old see-through look is a mix toward the terrain colour map with the old alpha curve; one opaque layer also early-z rejects the lakebed); Mirwen mist 90 → 48 sprites, ~55 % size, round-discarded |
| 7 | Shadows | `world.js applyShadowQuality` | map size `settings.shadowSize` (1024 low/medium, 2048 high), extent ±32 m, sun 60 m up its direction (caster distance 60 m, camera far 110 m), texel-snapped; layer 1 (shadow-only casters) OR-ed into the shadow camera mask while shadows are on. Village: one position-only shadow proxy of the parts ≥ 1.6 m (layer 1); the detailed village mesh no longer casts |
| 8 | Draw-call share | all of the above | see numbers below |
| 9 | `world.setBeacon(pos|null, {kind})` | `beacon.js` | 40 m unlit pillar (vertical + view-angle fade) + ground ring = **2 calls**, prewarmed via `game.render.warm(…, {now:true})` (0 new programs on first draw); alpha fades from 15 m to 3 m and hides on reach (4 m); kinds quest 0x8fe8ff / camp 0xffa860 / boss 0xb994ff (no reserved threat hue) |
| 10 | Surface damage descriptors | `names.js`, `surface.js` | `SURFACE_ATTACKS[kind] = {id:'surface.<kind>', nameKo, kind:'surface'}` for burning 불길, mud 진흙, cursed 저주받은 땅, blight 오염, void 공허 (+ barrel 불씨 항아리 폭발). Burning grass applies `burning` to the PLAYER with `source = SURFACE_SOURCES.burning` (enemies keep the legacy player-credited source); barrel explosions pass `attack` + `owner:'world'`; every world vfx call passes `owner:'world'`, no `0xffffff` effect colours |
| 11 | Camp names | `terrain.js LAYOUT.camps` | 서쪽/동쪽/북쪽 뿔도깨비 야영지 |
| 12 | Debug | `world.debug` | `setGrassVisible(on)`, `terrainChunks() → {total, visible, near, far, farInView, inView, calls}`, `transparents() → number`, `owns(obj)`, `roots()`, `flora()` |

### APIs (§7.4.2)
```ts
world.heightField: { tex, origin:{x,z}, size:{x,z}, texel, res:{x,z}, format:'R32F', filter:'nearest', glsl }   // world-p0a
world.setBeacon(pos: Vector3 | null, { kind?: 'quest'|'camp'|'boss' }): void ; world.beacon {active, kind, reached, alpha, position}
world.camps[i].entrance: Vector3          // P1 (delivered)
world.routeTo(from, to, { step = 4, out = [] }): Vector3[]   // P1 coarse breadcrumbs (path network + straight segments, reused out)
world.surfaceAttack(kind) / world.surfaceAttacks / world.surfaceSources / world.surfaceNamesKo
world.debug.setGrassVisible(on), terrainChunks(), transparents(), owns(obj), roots(), flora()
```
`terrainChunks().visible` = LOD0 chunk meshes in view (one draw each); `farInView` = LOD1 chunks in view, all inside the single far draw.

## Measured (branch, SwiftShader, 640×360, prod=1&governor=0&seed=1, medium; tells/vfx-kit on core stubs)

World-owned counts use `world.debug.owns()` (NPCs = ux, training dummies = mobs are not world; the harness `byGroup.world` includes them).

| Metric | S-plains | S-village | S-mirwen | S-elderwood | Budget |
|---|---|---|---|---|---|
| World scene + shadow calls, max yaw | **105 + 3** | 94 + 4 | 98 + 3 | 92 + 4 | S-plains ≤ 110 + 14; others: total − player 12 − ui 4 (159 / 144 / 144) |
| World shadow tris | 10k | 35k → proxy (see below) | 7k | 14k | ≤ 20k |
| All owners scene + shadow (v3 player 34 + 15 still in) | 147 + 21 | 171 + 35 | 158 + 36 | 156 + 39 | C6 at integration |
| LOD0 terrain chunk draws (max) | 14 | 16 | 13 | 14 | ≤ 24 and < 64 |
| World uploads per frame while turning 60°/s (max) | 21.6 KB | 18.8 KB | 19.3 KB | 17.1 KB | ≤ 60 KB |
| All-owner GL uploads while turning (max / p95) | 171 / 11 KB | 171 / 12 KB | 175 / 16 KB | 20 / 17 KB | ≤ 60 KB (the max frames are other owners' full-capacity vfx particle uploads, see requests) |
| World transparents ÷ screen (max yaw) | 0.01 | 0.02 | **0.04** (was 1.37: water 0.52 + mist 0.60) | 0.005 | ≤ 0.5 |
| World scene fragments ÷ screen (max yaw) | 1.62 (v3 3.61) | 1.47 | 1.50 | 1.63 | S-* scene ≤ 2.2 all owners |

- **noTerrain, S-elderwood, 960×540, ABAB median**: v3 0.60 → **0.84–0.86** with the terrain shading removed and its depth kept
  (gate). Plain hide 0.78–0.83 (since the sky now draws last, hiding the terrain makes the sky shade the hole — v3's ablation
  never paid that); MeshBasic vertex-colour terrain 0.96 (the remaining terrain cost is the grain fetch + shadow).
  Three non-world point lights (vfx, v3) are hidden for this measurement (§2.2 medium = 0); with them visible the ratio is ~0.70.
  SwiftShader pair spread is ±20 % on the shared 4-CPU machine (other agents), so single runs can land ±0.05.
- S-plains draw-call breakdown at 0° (world only): terrain 14 chunks + 1 far, flora 33 (12 sets × near/far/outline), grass 3,
  village 8 (from 100 m), gates 6, structures 3, ambience 3, fire barrels 3, sky 1, far mountains 1, water 1, world tree 2, beacon 0.
- Programs: beacon adds 2 (prewarmed); terrain v4 replaces the toon terrain program 1:1; flora sets keep their v3 program keys + `|awinst`.
- heightField: 0.00024 m GPU, 0 CPU texel error.
- Flora re-culls: 0 while still, 10 per 40 turning frames (every 4th frame).

## Tests
- `node tools/playtest4.js world` (W1, B): see the final run in the report (S-* rows, noTerrain, presets, budget L4, heightField,
  beacon, statics, surface source, rule-5 grep). Default run ≈ 5–6 min on the shared machine (4 S-* boots + 1 at 960×540 + 1).
- `tools/playtest3/world.js`: unchanged (all its v3 expectations still hold); `tools/bootcheck.js`, `playtest.js --quick`,
  `playtest2.js` run in this worktree (results in the report).

## Integration notes (checks marked I)
- C6: world share holds in S-*; the S-village total (≤ 175) needs the player at 8 + 4 and the ux NPCs trimmed (requests).
- The sky / far mountains draw last (renderOrder 100 / 99) and the terrain at renderOrder 1: an opaque object of another owner
  with renderOrder > 1 would draw after the terrain (fine) and one > 100 after the sky (also fine: depth-tested).
- Water is opaque: submerged parts of swimmers / the hydra are hidden below the surface instead of showing through faintly.

## P1
- Delivered: `world.camps[i].entrance`, `world.routeTo` (coarse breadcrumbs helper).
- Cut (fallbacks in place): grass crush inside `tells.footprints()` (footprint encoding not published by a tells tag yet; grass
  still bends around the player); camp entrance banners (would cost draw calls; the beacon/compass point at the entrance);
  see-through prefab variant only within 30 m (the OCC screen-door test is a few ALU ops on every prop; unchanged).
