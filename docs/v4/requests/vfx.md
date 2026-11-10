# vfx — requests to other owners (v4)

- **magic / melee**: build every look on `game.vfx.kit` (tag `kit-p0a`). Register element shapes with
  `kit.registerShape('<el>.<shape>', geometry, {blend, outline})` and motifs with `kit.registerMotif(el, kind, fn)` from your factory
  (before the boot prewarm, so the FM family programs are compiled at boot). Pass `castId` (`ctx.castId ?? game.nextCastId()`) in every
  spec and in every `hit.castId` — hitFeel plays one burst and one hitstop per castId; hits without a castId fall back to the v3 volley rule.
  `kit.line` `r2` is a **fraction of r**. Private spell-object materials: call `game.vfx.applyPlayerFx?.(m, {role})` once at
  construction (never on shared caches); or use `kit.fxMaterial({el, rimOnly})` (cached, already ducked, `userData.shared`).
  Legacy `vfx.trail / beam / shockwave / dome / decal` still work but are routed into kit ribbons / bolts / linework (no per-call meshes);
  `vfx.glowMaterial()` still returns a new material per call — cache it by key on your side (0 new materials per cast).
- **mobs / bosses**: pass `owner:'enemy'` to every `vfx.burst / preset / shockwave / dome / decal / flashSprite / runeCircle / kit.*` call
  made for an enemy (enemy style R11: dark core + `fx.mid` rim, never ducked, counted as enemy FX). Hits on the player should carry
  `attack:{id, nameKo, kind}` (and `sourceName` when the source has no `nameKo`) — `playerHurt` forwards them. Give entities
  `e.flashUniform = {value: 0}` (number 0..1, or `{color, amount}`) so `vfx.flashEntity` never clones materials.
- **tells**: `vfx` reads `game.tells.footprints()` once per frame (tells runs before vfx). Kinds as in `tells/shapes.js FOOT_KIND`
  (1 circle, 2 ring with `param` = inner, 3 cone with `param` = half-angle, 4 line, 5 capsule); safe zones as circles.
  `vfx.telegraph` forwards to `tells.telegraph` whenever the real tells module is present.
- **ux**: `playerHurt.dir` = unit xz vector from the player toward the attacker. vfx keeps a light hurt vignette; set
  `game.vfx.hurtVignette = false` once your directional damage arc ships.
- **core**: playtest2's "every melee hit had hitstop ≥ 0.03" (lines 171, 377) is superseded by §5.10 (light = 0.025 s, per-entity) and §7.9
  (core rewrites the assertion). The `vfx-*` / `kit-*` meshes carry `userData.owner`
  ('player' | 'enemy') for `PT.fragments({owner})`. P1 ask: a half-resolution soft-smoke target at governor L1+ (not needed for P0).

## Resolution (core integration, wave C round 1)
- magic / melee on the kit, castIds, `applyPlayerFx`: **done** (both branches build on `kit-p0a`+).
- mobs / bosses `owner:'enemy'`, `attack` on player hits, `flashUniform`: **done**.
- tells footprints / forward: **done**.
- ux `hurtVignette`: **done** — integration fix: ux's directional damage arc (`ui/threatui.js`) shipped but never switched the radial vignette off; `createThreatUI` now sets `game.vfx.hurtVignette = false`.
- core playtest2 hitstop assertion: **done** in `core-b` (§7.9). Half-res soft-smoke target: **rejected for round 1** (P1, vfx marked it not needed for P0).

## Fix round 1 requests (vfx → owners)
- **player** (uploads, C6): `src/player/fx.js _bake` uploads `lo..hi` over every class's gear (≈ 370 KB per after-image); upload one
  range per visible part or pack the visible parts contiguously. `src/player/merge.js`: playerBody re-uploads ≈ 450 KB on rebuild frames,
  and `writeCape` adds an update range per step without `clearUpdateRanges()` (one `bufferSubData` per range when steps outnumber renders).
- **magic** (programs, C6): `spells/assets.js groundMat(kind)` compiles one program per element (fragment text differs) → one shader with
  a kind uniform; fold the other prewarmed numbered ShaderMaterials the same way. Patched materials must not be `.clone()`d after
  `applyPlayerFx` (a clone keeps `userData.__awFx` but loses the patch, so it is neither ducked nor coverage-governed).
- **magic / melee** (coverage): large fresnel shells / domes around the player are now shrunk by the vfx governor when over budget;
  prefer `kit.dome()` (rim-only ≤ 2 m) or the kit linework for ultimate shells so the governor rarely has to act.

## Resolution (core integration, wave C round 2)
- player after-image / playerBody / cape uploads: **partly done on v4/player** (GPU after-images sharing the shadow proxy, `addRangeOnce`); the
  core C6 harness now samples frames that follow a rendered frame (player request to core). Remaining upload budget: see core notes / fix items.
- magic `groundMat(kind)` one shader with a kind uniform, no `.clone()` after `applyPlayerFx`: **open → fix item magic** (programs budget).
- magic / melee ultimate shells via `kit.dome()`: **open → fix item magic, melee** (P1, the governor already shrinks them).
