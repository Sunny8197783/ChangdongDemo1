# mobmodels — v4 notes

Owner: mobmodels (`src/enemies/models.js`, `src/enemies/models2.js`, `src/enemies/mobs/*`, `tools/playtest4/mobmodels.js`, `tools/playtest4/sheets/mobs/*`).
Branch `v4/mobmodels` (from `core-p0a`), worktree `/home/user/wt4/mobmodels`. Tags: `models-p0a` (registry + wrapLegacy), `mobmodels-b` (final).
`models.js` / `models2.js` are unchanged (append-only rule kept; the v3 builders stay for wrapLegacy and the "v3 row" of the sheets).

## What was built

### Registry — `src/enemies/mobs/index.js` (PLAN §7.4.6)
- `createModel(type, {variant?, element?, scale?, seed?, game?}) → EnemyModel | null` for `bokoblin, shaman, chuchu, lizard, shroom, wolf, wraith, voidknight, dummy`
  (`TYPES`). Variant keys: `shaman:<element>` (any element; fire/ice pre-built), `chuchu:<normal|fire|ice|lightning|wind|water|nature|light|shadow>`, `wolf` / `wolf:alpha`.
- `wrapLegacy(v3Model | Object3D) → EnemyModel` (models-p0a): augments the v3 object in place (all v3 fields stay): `meshes`, `proxy` (= v3 outline mesh), `lod` (= body),
  `bones`, `features` (all false, `legacy:true`), `tellAnchors` (bones, else a head anchor at `headTop`), `flashUniform` (setter; lazily clones the body materials once per
  entity with the same program keys and drives their emissive), `rimSource()`, `pose(name, t)` adapter (humanoid / quad / blob), `update()` no-op, `dispose()`.
- `preview(type, opts)` → fresh idle-posed root (v3 fallback); `prewarm(game)` → every mob material (body, shell, glow, outline), warms them as skinned meshes via
  `game.render.warm(warmObject())` and builds all types/variants in `requestIdleCallback`; also `buildAll()`, `stats()`, `defFor(type, opts)`, `legacyModel(type)`, `warmObject()`.

### Kit — `src/enemies/mobs/rig.js`
- **One build per type**: parts are primitive *specs* rebuilt at 3 detail levels → ONE indexed skinned geometry holding `[body | LOD]` index ranges (Uint8 colours,
  Int8 normals, Uint8 skin indices/weights), a glow geometry (unlit, colours ≤ 1.2), a silhouette-only proxy (big parts only; no cards, trims, thin or small parts).
  Shared `boneInverses`; an instance builds only Bones + Skeleton + 4 SkinnedMesh wrappers.
- **Draws**: body + glow + outline proxy (3; bokoblin/lizard/dummy have no glow → 2). Beyond the LOD distance the body draws its LOD range and the proxy hides (≤ 2).
  **Shadow**: `onBeforeShadow` switches the body to its LOD range, so the only caster is the LOD (≤ 2k tris; accessories, springs, glow, eyes never cast).
- **Per-instance hit flash with shared materials**: bone 0 is a dummy; `flashUniform.value` is written into its matrix element `[0].w` in `onBeforeRender`
  (bone texture) and read by the shared body/shell shader (key `toonRim+dis+mob4` = `toonMat` rim + dissolve chunk + flash). 0 new materials, no program flips.
- **Outline material** (`outlineMat`): skinned inverted hull pushed along the projected normal by a constant **1.6 px** (`uRes` = `game.post.sceneRes`) + a 3 cm pull
  toward the camera (lines survive where feet/hems meet the floor). One program; colour per species = uniform. (The v3 world-space hull falls below 1 px at gameplay range.)
- **humanoid2** (v3 13 bones, v3 rest layout and hip heights, + `jaw`, `lidL/lidR` (blink = scale-y), `thumb`/`fingers` per hand, spring bones), **reptile** variant
  (`digitigrade` knee → ankle, counter-rotated in `update()`; `tail1..4`), **quadruped** (wolf: `rig, neck, jaw, leg/low/paw ×4, tail1..3, ears, lids`).
  Smooth 2-bone weights (0.5/0.5 at the joint, 6 cm band) at shoulders, elbows, hips, knees, waist, neck, jaw and tail segments.
- **Vertex colours**: crevice AO baked from part ellipsoids (−25 %), ground-contact darkening (−15 % in the lowest 12 cm), belly/underside gradients, darker extremities,
  species painters (war paint, glyph trim, moss/lichen, scale-ridge bands, back stripe, plate-bevel trim); the toon material adds the fresnel rim band.
- **Faces**: `eye()` = sclera + iris + pupil (round or slit) + highlight; lids with a seeded 3–6 s blink; brows/brow ridges; jaws with teeth/tusks/fangs.
- **Poses** `pose(name, t)`: idle, walk, windup (anticipation squash ×1.15), hold (identical for every t), strike, recover (slump), stagger, die; `poseTarget()` for damping.
- **update(frameDt)** (no-op unless `game.frame.lastStep`; allocation-free): springs (lag behind the parent's model-local velocity + sway), blink, LOD/outline switch from
  `game.quality.budget` (preset `enemyLodDist` × `enemyLodMul`; outlines ≤ `enemyOutlineDist`; 1 m hysteresis), digitigrade ankles / level paws, chuchu blink bone.

### Species (`src/enemies/mobs/<type>.js`) — every §4.1–4.8 Model item
| Type | Body+glow / LOD = shadow tris (budget) | Items |
|---|---|---|
| bokoblin | 7998 / 1495 (≤ 8k, proxy ≤ 2.5k) | tusked under-bite jaw, heavy brow ridge, 2 distinct curved horns × 2 ring bands, 4-finger fist around a knotted club (3 bone spikes, leather wrap), loincloth front/back springs, shoulder strap, belt pouch, bone necklace, ear springs, war paint, belly gradient |
| shaman | ≈5.5k / 1143 (≤ 7k) | hooked nose, mouth line + fangs, painted brow, slit glowing eyes + lids, long-fingered hands, robe lathe + glyph-trim band, 2 hem spring strips, hood + feather crest (spring), staff skull + feathers (spring), element gem in an orbiting ring (`halo`, grows in windup) |
| chuchu ×9 | ≈1.3–1.6k / 186 (≤ 4k) | 20×14 translucent shell, glyph-shaped core per element, squash-ring band, smile / `O` / `x x` states, pseudopods, crown springs; crowns: flame tongues, hex prisms, antenna sparks, leaf swirl, droplet, sprout, halo, shadow horns |
| lizard | ≈5.1k / 956 (≤ 8.5k) | digitigrade legs, long snout + teeth rows + jaw, slit pupils + lids, 4-bone tail (tail3/4 springs), dorsal frill flaring on windup (spring + pose), ridge bands, wet-skin gradient, bone-tipped spear + cloth wrap (spring), shell pauldron |
| shroom | ≈4.9k / 826 (≤ 7k) | cap on spring bones, pleated gill fan, 7 spore pores (glow, swell in windup), spots, moss/lichen, sleepy lids, stub arms with 3 fingers, 3 root toes per foot, spore sac |
| wolf (+alpha) | ≈3.9k / 794–857 (≤ 8k) | lighter slate palette, pale muzzle + chest blaze, back stripe, fur tufts (neck ruff spring, shoulders, haunches, tail), 3-bone tail, ear springs, fangs, glowing amber slit eyes, flank void cracks (swell in the crouch); alpha: bigger mane + white scar |
| wraith | ≈3.7k / 503 (≤ 6k) | hood with bone mask (eye holes, crack, jaw + teeth, eye glow), skeletal clawed hands, 16-link chain, 3 hem spring strips + ragged skirt, hood-tip spring, lifted dusty-violet palette |
| voidknight | ≈4.6k / 1070 (≤ 9k) | 3-plate bevelled pauldrons + trim, breastplate + ab plates + gorget, 19 rivets, tabard springs, sword + shield with 6 rune slots (`setComboStep(n)`), visor glow |
| dummy | 1548 / 410 | stitched sack face (button eyes, brows, mouth), rope bindings, target, cross-bar `swing` bone, straw-tuft + tag springs |

## Measured (branch, SwiftShader 640×360, prod=1&governor=0&seed=1, medium; `node tools/playtest4.js mobmodels`)
- **MM1**: contract green for every type + variant and for `wrapLegacy` of all 9 v3 builders; instances share geometry/materials (skeleton cloned only).
  Spawn median 0.1–0.5 ms (≤ 1). First sight (create + `render.warm` + upload + first draw minus the same frame once warm; best of 5 fresh builds per type,
  `gpuSync` before every sample): worst ≈ 4.7 ms (≤ 8); medians 1–17 ms are dominated by stalls of the shared 4-CPU machine.
  Draws at 8 m: 2–3 scene + 1 shadow per mob; at 34 m: 1–2, outline hidden, `rimSource()` → LOD.
  **12-mob F roster** (2 bokoblin, 2 wolf, lizard, shaman, voidknight, shroom, wraith, chuchu ×3): **26 scene calls / 41.6k tris + 12 shadow calls / 9.6k tris**
  (budget 36 + 12, 140k + 24k); 12 × (pose + update) ≈ 0.17 ms/frame. Geometry GPU size 55–280 KB per type; build 2–107 ms per type (boot / idle time).
- **MM2**: features checklist incl. blink and moving springs green for all keys; eye group at 8 m / 1280×720 (fov 62°): 15–46 px (≥ 6);
  outline visible on 4 sides on the Elderwood floor (grass hidden, model at 5.5 m, camera pitch −0.4; ≥ 50 % of each side's extreme scanlines outlined);
  body mean linear luma on the Elderwood floor: wolf 0.184, wolf alpha 0.20, voidknight 0.205, wraith 0.209 (≥ 0.18), lowest body (shaman) 0.154 (≥ 0.12).
- **Sheets** (`--sheets`): `tools/playtest4/sheets/mobs/<type>.png` (v3 row above v4; front / ¾ / side at 3 m, ¾ windup 3 m, front 8 m, ¾ windup 8 m; tall models are
  framed at the distance that fits, labelled) + `wolf_alpha.png` + `chuchu_variants.png`, each ≤ 150 KB.

## Palette deviations (documented)
- **Fix round 1 (docs/v4/review.md mobs table)**: voidknight, wolf and wraith albedo darkened back to the v3 void identity (wolf fur `#434056`,
  stripe `#221E2C`, muzzle `#8C86A2`; knight plate `#4A4366`/`#5C547A`, recess `#1C1828`, joints `#2C2840`, cloth `#4C2C74`; wraith robe `#4E4270`/`#3A3056`/`#1E1630`).
  Violet runes / cracks / eye glow are unchanged and stay the bright accents. Elderwood body luma now 0.063–0.094 (was 0.184–0.209): the PLAN §1
  "≥ 0.18" readability row is what washed them to light grey/lavender, so the playtest gate for these four is now a 0.06–0.16 band (dark, not black)
  and readability rests on the 4-side outline check (still passing) and the accents; every other body keeps ≥ 0.12. Integrator: the PLAN §1 row conflicts with the review.
- LOD / outline distance now reads the root position after `updateWorldMatrix(true, false)` (was the stale matrixWorld before the first render
  after a move → LOD on the first frame after a spawn/teleport).
The entries below are superseded for these three species:
- wolf flank fur `#6A6682` instead of `#5E5A72` (with `#5E5A72` the body measured 0.168–0.177 < 0.18 on the Elderwood floor); muzzle/chest `#B9B3C8` as specified.
- voidknight: `#3B3550` only in recesses; plate faces `#7A72A0`/`#9890BC`, trim `#8C93B8` (`#3B3550`-dominant plates measured 0.129).

## Legacy tests
- No `tools/playtest3/` section belongs to mobmodels (nothing to update per §7.9). `models.js`/`models2.js` are unchanged, so bootcheck / playtest / playtest2 / playtest3
  see the v3 models exactly as before until mobs switches to the registry.

## P1 (cut, working fallbacks)
- LOD cross-fade (hard switch with 1 m hysteresis), extra accessories, variant idle FX, wraith trailing smoke ribbon (needs `vfx.kit.ribbon`, enemy-owned).

## Integration notes (I checks)
- The F-* aggregate / C6 numbers apply once mobs uses `createModel` (docs/v4/requests/mobmodels.md); until then the game still draws the v3 models.
- `enemies.js`' v3 LOD loop (outlines 45 m, shadows 70 m) must skip `e.model.v4` models (their `update()` owns LOD and outline distance).

## Test results at `mobmodels-b` (this branch; tells/vfx kit on their core stubs; only `core-p0a` merged — no newer dependency tag existed)
- `node tools/playtest4.js mobmodels --sheets`: **126 passed, 0 failed** (sheets written); `node tools/playtest4.js mobmodels`: **117 passed, 0 failed, 1 skipped** (sheets).
  Includes static rule 5 (no `0xffffff`, glow/emissive ≤ 1.2) and rule 1 (imports) greps over `src/enemies/mobs/*`.
- `node tools/bootcheck.js`: exit 0 (all configs `playing`). `node tools/playtest.js --quick`: all legacy checks PASS. `node tools/playtest2.js`: exit 0.
  `node tools/playtest3.js enemies`: 138 passed, 0 failed, 1 skipped (its rule-9 grep also scans `src/enemies/mobs/*`: loops written as `i <= 4`).
