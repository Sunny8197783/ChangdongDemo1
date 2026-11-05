# magic — requests to other owners (v4)

- **melee**: magic registers caster *stand-in* motifs for earth / nature / light / shadow (`src/spells/motifs/others.js`) with
  `kit.registerMotif(el, kind, fn)` **only while the kit has none** for that element + kind. `sword` runs after `spells` in ORDER, so your
  `kit.registerMotif` calls overwrite them (please register all 9 kinds per element in your factory). The caster looks then use your motifs
  automatically (`looks.motif` → `kit.motif`). Magic also registers one caster FM shape in each of your element families: `<el>.arrow`
  (the ranger arrow head with element fletching, §3.6) — please keep it (it uses 1 of the 16 atlas slots). Caster bodies of your elements
  prefer `earth.rock` when you register it and otherwise use the vfx `physical.chunk` / `physical.shard` tinted with your ramp.
- **core**: (1) the legacy adapter (`skills/adapters.js castSpell`) does not forward `ctx.castId` / `skillId` to `spells.castById`; magic wraps
  `game.nextCastId` once (records the last issued id, adopted by `castById` exactly once) so legacy staff casts still carry the runtime's
  castId. Please forward `castId: ctx.castId, skillId: id` in `castSpell` / `playSword` opts — the wrap then becomes a no-op.
  (2) `breadth.finisher` runs your cinematic + `skills/fallback.js` (generic visuals, outside the caster look engine); magic declares it
  `'archetype'` via the attuned element; a bespoke look is P1 (it needs a caster impl or a hook in the fallback).
  (3) `debug.newMaterials()` counts every `THREE.Material` (mobs' status icons included); MG1 measures the per-cast count without enemies.
- **vfx**: (1) `vfx.debug.byCast(id).coverage` accumulates follow-ribbon coverage across frames (fire.phoenix: 0.31 vs ≤ 0.07 per frame);
  MG1 uses the per-frame `vfx.debug.coverage().screens` with only that cast alive, verified by the counting override (`PT.fragments`)
  whenever the estimator exceeds the tier ceiling. (2) `kit.bolt` halo colour is always the ramp `light` step (only the core is configurable):
  lightning bolts cannot reach saturation ≥ 0.40 on grass; a `halo` colour option would help. (3) P1: a caustic UV scroll in the FM shader
  for `water.sheet` (the row asks for it; the sheet has the crest line only). (4) `vfx.debug.setVisible('player', true)` makes every
  player-owned mesh visible, including pooled meshes that were hidden — MG1 uses its own visible-set toggle.
- **player**: `game.spells.castLock` is > 0 only during the ultimate anticipation (0.14 s, awakened 0.2 s) and while a finisher plays;
  every other cast is instant (0), so the dodge buffer never waits on a caster.
- **tells / mobs / bosses**: none.
