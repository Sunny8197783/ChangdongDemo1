# mobmodels → other owners (v4 requests)

## mobs (behaviour files, `src/enemies/*.js`, `enemies.js`)
1. **Switch to the registry** (PLAN §4.0, your P0 (1)): `import * as MobModels from './mobs/index.js'` then
   `const model = MobModels.createModel?.(type, { variant, element, game: ctx.game }) ?? MobModels.wrapLegacy?.(buildX()) ?? buildX();`
   - shaman: pass `{ element }` (keys `shaman:fire`, `shaman:ice`, any element works); chuchu: `{ variant }` (normal, fire, ice, lightning, wind, water, nature, light, shadow);
     wolf: `{ variant: 'alpha' }` for the pack alpha (bigger mane + scar), else `{}`.
   - v4 models keep every v3 field your pose code uses (`rig, spine, neck, armR/L, foreR/L, handR/L, legR/L, kneeR/L, jaw, weapon, staff, gem, halo, core, eyes,
     variant, tail1, tail2, sac, cap, orb, shield, legs[i].up/low, headTop, lieY, skin.meshes, outlines`) with the **same rest layout and hip heights** as v3, so
     `applyHumanoid`, `reactionPose`, `walkCycle` and the per-type pose code drive them unchanged.
2. **Call `model.update(frameDt)` once per frame on `game.frame.lastStep`** (after your pose): springs, blink, LOD + outline distance switch (reads
   `game.quality.budget.enemyLodMul / enemyOutlineDist` and the preset `enemyLodDist`). It is cheap (12 mobs: ≈ 0.2 ms incl. pose on SwiftShader) and allocation-free.
3. **Remove the v3 distance-LOD loop for v4 models** (`enemies.js` ~596–606, outlines at 45 m / shadows at 70 m): `update()` owns it now (skip when `e.model.v4`).
   Keep it for `wrapLegacy` models.
4. **Forward** `e.rimSource = () => e.model.rimSource()`, `e.tellAnchor = (k) => e.model.tellAnchors[k] ?? e.model.tellAnchors.core`, `e.flashUniform = e.model.flashUniform`.
5. Optional richer poses: `model.pose(name, t)` (`idle|walk|windup|hold|strike|recover|stagger|die`; t = seconds for idle/walk, progress 0–1 otherwise) applies the
   canonical, exaggerated pose (squash ×1.15 in windup/hold, jaw, fingers, frill/pores/rune extras); `model.poseTarget(name, t, out)` fills a `POSE_KEYS` object
   (superset of `HUMAN_KEYS` + `jaw, grip, sqY, sqXZ`) for your own damping. `hold` returns the same pose for every t (the M1 hold check).
   Per-type extras: voidknight `model.setComboStep(0..3)` lights the sword/shield rune slots per combo hit; shaman `halo` = the gem ring bone (scale it as in v3;
   it is a ring in the XY plane, so `halo.scale.set(s, s, 1)` keeps working); lizard frill flares with `pose('windup'|'hold')`; shroom pores swell with `pose('windup')`;
   wolf `cracks` bone swells during the crouch.
6. `enemies.previewModel(type, opts)` → `MobModels.preview(type, opts)` (fresh idle-posed root; falls back to the v3 model for unknown types).
7. `enemies.prewarm()` should add `MobModels.prewarm?.(game)` (returns every mob material; also builds all types in `requestIdleCallback`) instead of building
   v3 models for warm-up.

## vfx (`vfx.flashEntity`)
- Use `e.flashUniform` when present: set `.value` 0..1 (v4 models: per-instance, no material clone, one shared program — the value rides in bone 0's matrix;
  wrapped v3 models: a setter that lazily clones the body materials once per entity, same program keys). The flash tint is fixed (warm white, ≤ 1.0).
- `vfx.dissolve` keeps working: the v4 body material is `toonMat` + the `toonRim+dis` chunk (key `toonRim+dis+mob4`); clone it with `onBeforeCompile`/`customProgramCacheKey`
  copied (as `flashEntity` already does) so no program is compiled.

## tells (rim clones)
- `e.model.rimSource()` returns `[proxy]` (≤ 3k tris, silhouette-only, BackSide-free geometry; its own material is a pixel-width inverted hull) within the outline
  distance and `[lod]` beyond it (≤ 2k tris; `lod` is a hidden SkinnedMesh sharing the body attributes with the LOD index range). Both share the model's skeleton
  and use `bindMatrix` = identity (AttachedBindMode), so `new SkinnedMesh(src.geometry, rimMat); rim.bind(src.skeleton, src.bindMatrix)` works as specified.

## core
- None blocking. Notes: (a) P0b's warm (compile + one real draw per material) covers the mob programs through `MobModels.prewarm(game)`'s warm object
  (`MobModels.warmObject()` carries body / shell / glow / outline as skinned meshes). (b) The outline material reads `game.post.sceneRes` for its pixel width (falls back to the
  drawing-buffer size).

## bosses
- `import * as MobRig from '../mobs/rig.js'` gives `defineType`, `instantiate`, `P/S/C/K/B/CAP/T/TUBE/CARD/LATHE/FN`, `eye`, `humanoid2`, `quadruped`, `bone`, `materials`,
  `outlineMat` if you want the same build-once/LOD-range/flash-bone pipeline for boss models (optional).

## Resolution (core integration, wave C round 1)
- mobs 1–7 (registry, `model.update` on lastStep, v3 LOD loop skipped for v4, forwards, poses, `previewModel`, `MobModels.prewarm`): **done** on `mobs-b` (`enemies.js` imports `./enemies/mobs/index.js`; `base.js` forwards `flashUniform` / `rimSource` / `tellAnchor`).
- vfx `e.flashUniform`: **done** (`vfx.flashEntity` uses the entity uniform; no material clone).
- tells rim clones from `rimSource()`: **done** (`tells.js`).
- core: none. bosses: optional rig reuse — bosses kept their own model files.
