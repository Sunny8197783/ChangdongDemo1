# world — requests to other owners (v4)

- **core** (main.js `applyShadowMode`): three r160's `WebGLShadowMap.renderObject` tests casters against the **view** camera's
  layers, not `light.shadow.camera.layers`, so `sun.shadow.camera.layers.mask = 0` ("shadows off" → see nothing) does not hide
  any caster. World's shadow-only casters (flora families, village proxy) live on layer 1 and are switched in by a hook caster
  (`worldShadowHook`, first in the traversal, `onBeforeShadow` enables layer 1 on the view camera; the sky's `onBeforeRender`
  disables it). If core wants a real "shadows off", skip the shadow render (`shadowMap.needsUpdate = false` after one clear)
  rather than the mask; please keep the view camera's layer 1 free for this (no `camera.layers.enableAll()`).
- **core** (harness `PT.draws().byGroup` / `PT.fragments({owner:'world'})`): everything not enemies/player/fx/tells/ui is
  attributed to `world`, including the village NPCs (ux `src/story/npcs.js`, ~19 scene + 12 shadow calls, ~50k shadow
  tris in S-village; still drawn from the plains spot 100 m away) and the training dummies (mobs, 8 calls). For C6 please
  classify with `game.world.debug.owns(obj)` (true for every object under a world-created scene root), or tag
  `userData.owner` in those modules. tools/playtest4/world.js already counts with `owns()`.
- **core** (warm-up, P0b item 13): zone dressing hidden by distance at boot (Elderwood/Mirwen/plateau groups, the far
  flora LOD) uploads its geometry on first view (one-time ~1–3 MB `bufferData`, the S-elderwood first frame). A real warm
  draw of hidden world groups during the title would remove that hitch; `game.render.warm(world.terrainMesh.parent)` style
  calls from world are possible once `warm` draws hidden objects (today `compile` skips invisible ones).
- **ux**: (1) NPCs: cast shadows only within ~25 m of the player and hide (or LOD) beyond ~60 m — they are the largest
  non-world share of the village shadow pass (12 calls / 50k tris against the 30 / 50k medium total).
  (2) Beacon: `game.world.setBeacon(pos | null, {kind:'quest'|'camp'|'boss'})` exists (2 calls, prewarmed); camps:
  `game.world.camps[i].entrance` (Vector3, P1 delivered). Coarse breadcrumbs: `game.world.routeTo(from, to, {step: 4, out})`
  (P1: path network + straight segments, reused output array).
- **vfx / combat**: (1) 3 `PointLight`s at the scene root exist at medium (not world's) — every lit world shader still
  loops them (the W1 noTerrain ABAB hides them to emulate §2.2 medium; with them visible the ratio is ~0.70).
  (2) `vfx-additive`/`vfx-alpha` bump `iPos/iVel/iCol/iMisc` versions every frame with full-capacity uploads (~125 KB per
  attribute per frame in S-elderwood): live-range `addUpdateRange` please (§2.7).
  (3) `playerHurt` for world damage: barrel explosions call `combat.dealDamage(e, {..., attack: {id:'surface.barrel',
  nameKo:'불씨 항아리 폭발', kind:'surface'}, owner:'world'})`; burning grass applies `burning` to the PLAYER with
  `extra.source = world.surfaceSources.burning` = `{id:'surface.burning', team:'world', isSurface:true, surface:'burning',
  nameKo:'불길', attack:{id:'surface.burning', nameKo:'불길', kind:'surface'}}` (statuses keep object sources on the player,
  so DoT ticks carry it as `hit.source`). Please map `hit.attack ?? hit.source?.attack` to `attackId / attackNameKo /
  attackKind:'surface' / surface`. `world.surfaceAttack(kind)` returns the descriptor for every §7.4.2 surface
  (burning 불길, mud 진흙, cursed 저주받은 땅, blight 오염, void 공허) if combat applies cursed/blight/void damage itself.
  World vfx calls pass `owner:'world'`.
- **tells**: `world.heightField = {tex (R32F, NearestFilter, 241×241, vertex-centred), origin {x:-180, z:-180},
  size {x:360, z:360}, texel 1.5, res, glsl}`; `glsl` defines `float awHeightField(sampler2D tex, vec2 xz)` (4 texelFetch,
  the same triangle split as getHeight: GPU error 0.0002 m). A plain bilinear tap is off by up to ~1.9 m on cliffs, so use
  the helper in the decal vertex shader. Since `tag world-p0a`.
- **mobs**: the training dummies near the village (8 draw calls) are visible from the plains spot; distance-hide them
  beyond ~60 m if they are not in combat.
