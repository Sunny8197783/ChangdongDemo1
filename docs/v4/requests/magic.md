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
- **vfx (continued)**: (5) `vfx.hitFeel` plays `kit.motif(el, 'burst')` on the first hit of a cast, often *before* the cast's primary
  shape exists (cone / nova hits run synchronously). Magic's registered burst motifs now detect this (cast context by `castId`) and play
  the skill's bespoke impact once per `castId` inside a handle share (≤ ½ of the tier's handles). Melee's motifs reached through the
  same path are not inside magic's facade: their handle use counts for the caster casts of earth / nature / light / shadow after the
  melee merge — please keep each burst ≤ 4 handles. (6) Each `kit.mesh` instance is one handle, so impact crowns of 8 FM petals /
  prisms exhaust the C/A budget (8): a multi-instance call (`kit.meshes(name, n, fn)` → one handle) would let crowns stay FM.
  (7) The bolt halo is a soft premultiplied falloff that adds colour without covering the ground: violet over green reads grey
  (sat ≈ 0.2); magic narrows the halo to ≈ the core width for player bolts (`halo ≤ 1.2 × width`).
- **core**: (4) through the post chain an opaque `mid` swatch on the plains meadow reads sat ≈ 0.50 (lightning, shadow, earth), 0.55
  (wind), 0.59 (ice), 0.75 (fire, water), 0.21 (light, ivory by design). Thin AA lines over green lose another 0.1–0.2, so the
  violet elements sit right at the §1.4 floor of 0.40; MG1 uses a per-element floor of min(0.40, 0.85 × swatch) (only light and
  physical are actually relaxed by it). If the grade can keep violet / teal saturation (e.g. less desaturation above 0.8 luma in
  FinalPass), every caster look gains margin.
- **player**: `game.spells.castLock` is > 0 only during the ultimate anticipation (0.14 s, awakened 0.2 s) and while a finisher plays;
  every other cast is instant (0), so the dodge buffer never waits on a caster.
- **tells / mobs / bosses**: none.

## Resolution (core integration, wave C round 1)
- melee (register all motif kinds; keep `<el>.arrow`): **done** (`src/sword/motifs/{earth,nature,light,shadow}.js`; the arrow shape stays registered by magic).
- core (1) forward `castId`/`skillId` in the legacy adapter: **done** — integration fix 131a36a (`skills/runtime.js` passes `ctx.castId`, `adapters.js` forwards it to `castById` / `cast` / `playLegacy`).
- core (2) finisher bespoke look: **rejected for round 1** (P1 per PLAN; stays `'archetype'`).
- core (3) `debug.newMaterials()` counts every material: accepted as specified (C6 measures it over the whole rotation, enemies included).
- core (4) violet/teal saturation in the grade: **rejected** — changing FinalPass desaturation would move every look and the threat colours checked by C1 (ΔRGB ≤ 8); the per-element floor `min(0.40, 0.85 × swatch)` used by MG1/ML1 is accepted as the §1.4 measurement rule.
- vfx (1)–(7) (coverage accumulation, bolt halo colour, caustic scroll, setVisible, burst order, multi-instance `kit.meshes`, halo narrowing): **open for vfx (P1)**; none blocks a P0 budget — magic's workarounds stay.
- player (castLock semantics): noted, no action.

## Fix round 1 (new)
- **vfx**: hitFeel per-target bursts are charged to the cast's castId and push earth, nature, light and shadow casts over the §1.4 handle caps (light.ult 29). The facade spends 4 to 8 handles. Please share the per-tier cap with the look facade, or skip the per-target burst when the cast already played its impact.
- **ux**: `src/cinematic/assets.js:111/154/167` builds materials on every finisher (33 over 7 repeated finishers, 14 per `breadth.finisher` from `spirits9.js:79`). Please cache them by key.
- **player**: `spawnGhost` during fire dashes renders as a black silhouette at the start point (fire.phoenix sheet).
- **mobs**: `enemies/base.js:74` creates 4 to 5 materials per F-mage rotation (C6 limit 4).
