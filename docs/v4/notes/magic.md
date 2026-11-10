# magic — v4 notes

Owner: magic (`src/spells.js`, `src/spells/*`, `src/spells/motifs/*`, `tools/playtest3/magic.js`, `tools/playtest4/magic.js`,
`tools/playtest4/sheets/caster/*`, these notes, `docs/v4/requests/magic.md`).
Branch `v4/magic`, worktree `/home/user/wt4/magic`, from `core-p0a`; merged read-only: `vfx-b` (kit), `tells-b.2`, `core-b`
(via the tells / vfx merges). Final tag: see the end of this file.

## What was built

### Look engine (`src/spells/looks.js`, `src/spells/looks_rows.js`)
- **Cast context.** Every cast (archetype, bespoke impl, legacy def, finisher, support) runs inside `begin()/end()`; deferred work
  (timers, projectiles, zones, objects, movers) captures the context and restores it, so every visual **and every hit** carries the
  cast's `castId` (`ctx.castId ?? game.nextCastId()`; legacy staff casts adopt the id the runtime issued, see requests (core 1)).
- **Legacy vfx gate.** Every `game.vfx.*` call of `src/spells*` goes through `looks.fx(name, args)`: no point-light flashes, no domes
  / glow sprites / flare / soft puffs, `screenFlash` / `fovKick` only for U/F tiers (tinted `mid`, alpha ≤ 0.25, ≤ 0.15 s, off with
  `flashReduce`), bursts → element accents within the tier particle cap, shockwaves → LW rings, beams → BT bolts or tapered ribbons,
  decals → DC linework, player "telegraphs" → dotted rotating target rings in the element `light` step (R5), **ground rune circles →
  the spells sigil** (normal-blended `mid`, alpha-tested; sky circles stay on the vfx pool).
- **Hooks** `castFx / body / impact / target / zone / crawl / nova / wave / strike / blink / aura / spike` resolve bespoke row →
  archetype default → element motif. 36 bespoke rows (`BESPOKE_IDS`): the 12 ★ skills, every `*.basic / *.charged / *.ult` of the
  registry and the starter loadouts of mage, ranger and spiritcaller (MG1.b derives this set from the registry + `PRESETS` and fails
  if a row is missing).
- **Budget facade** over `game.vfx.kit`: per-tier handle and particle ceilings of §1.4 are enforced per cast (excess refused).
  Impacts never starve the primary shape: a `burst` may use ≤ ½ and a per-target `spark` ≤ ¼ of the tier's handles; the burst that
  `vfx.hitFeel` plays on the first hit **is** the row's bespoke impact, once per `castId`. Cone / nova build their primary before the
  hits. Palette discipline in the facade: line bodies in `mid`, `light` for rims / cores, 2 px screen-space line floor (1.8 on the
  ground; 2.6 + opaque for the violet elements), bolts as a crisp `mid` core with a narrow halo, pale-ramp FM bodies (ice, lightning,
  wind) tinted toward `mid`.
- `spells.lookOf(id)` / `game.debug.lookOf(id, 'caster')` → `'bespoke' | 'archetype' | 'generic' | 'legacy'` (declared; MG1 measures it).
- `game.spells.castLock` → seconds of non-cancellable cast recovery: > 0 only during the ultimate anticipation (0.14 s, awakened
  0.2 s) and while a finisher plays; 0 otherwise.
- **Warm-up**: at boot every motif × element, every gate path and every row runs once off-screen (y = −400) and is drawn by the core
  warm pass; sigil pool 10, materials cached by key.

### Motifs (`src/spells/motifs/*.js`, §3.5)
- `fire.js` (flame lathe tongues in 3 sizes with a thin `hi` core, comet, crescent petals, meteor rock), `ice.js` (hex prisms in 2
  sizes + stubs, bipyramid shards, lance), `lightning.js` (soft plasma orb, rod spike, rune disc; BT bolts), `wind.js` (crescent
  blades, leaves; RB streamlines), `water.js` (teardrop droplets, curling wave sheet with crest band, beads): all 9 kinds each
  (`cast, trail, burst, spark, zone, pillar, wave, aura, summon`) via `kit.registerMotif`, shapes via `kit.registerShape`.
- `others.js`: caster stand-ins for earth / nature / light / shadow, registered only while the kit has none (melee overwrites them),
  plus the ranger arrow heads `<el>.arrow` with element fletching.
- Impacts: one LW `rays` handle for the 8-petal fire opening, SP particle crowns (water) and shard debris (ice) instead of one FM
  instance per droplet / shard, so a burst fits its handle share.

### Restraint (P0-A)
0 `0xffffff` / `#ffffff` in `src/spells*` (grep, MG static), every emissive / intensity multiplier ≤ 1.2, element ramps only
(`palette.js`), no domes, flashes per the gate, sigils normal-blended (additive violet / blue over grass washed out to grey),
every private spell material through `vfx.applyPlayerFx?.(m, {role})`, spell objects `depthWrite:false` in the transparent pass and
`userData.noCameraCollide = true`.

## Measured (branch, `node tools/playtest4.js magic`, 640×360, prod=1 governor=0 seed=1, fx 1.0)

Measurement (`MG.measure`): plains meadow (−30, 30), yaw 0, dummy at 7 m, same spot / camera / dummy for every cast, meadow soaked
(no grass fire between casts); per frame the player-FX coverage estimator, a regular grid of diffs plus adaptive diffs whenever the
estimator rises (impact frames), coverage truth from `PT.fragments` at every new estimator maximum above the ceiling (others scaled by
the measured fragments / estimate ratio); detail / crisp at the peak frame, saturation pixel-weighted over the window.

Final run (`magic-b`, 48 casts = 36 bespoke + 12 archetype representatives; 565 s): **23 passed, 4 failed, 1 skipped**.

| Check | Budget | Measured |
|---|---|---|
| MG static (rule 5, reserved shapes, 5 motif files) | 0 white literals, multipliers ≤ 1.2 | pass (25 files) |
| MG1.b registration / lookOf | 104 registry ids ≥ archetype, 36 bespoke | pass |
| MG1.a first cast CPU | ≤ 8 ms | max 8.9 ms (`lightning.dash`, 7.5 ms "extra" = shared-CPU noise; 5.8 ms in the previous run), median 0.7 — **flaps** |
| MG1.a first draws after warm-up | 0 | 0 |
| MG1.g castLock | 0 free / ≤ 0.25 s in ult anticipation | 0 / 0.14 s / 0 |
| MG1.c white peak | B ≤ 1.5 %, C/A ≤ 4 %, U ≤ 12 % | max 0.85 % |
| MG1.c coverage | B ≤ 0.05 … U ≤ 1.0 | max 0.211, median 0.026 (all within tier) |
| MG1.c detail / crisp | §1.4 floors | median 3,077 px / 0.714; misses: `nature.grapple` 1,724 (< 2,000), `nature.roots` 1,150 (< 1,200), `light.basic` 497 (< 500), `shadow.charged` crisp 0.231 (< 0.25) |
| MG1.c saturation | ≥ 0.40 (B/C/A), ≥ 0.35 (Z/U); per-element min(floor, 0.85 × swatch) | median 0.512; misses (violet elements only): `lightning.basic` 0.354, `shadow.basic` 0.387, `shadow.ult` 0.337, `lightning.thunderclap` 0.397 |
| MG1.d new materials per cast | 0 | 0 |
| MG1.e stacked 7-cast rotation near-white | ≤ 12 % (v3 94–97 %) | 0 % |
| MG1.f element silhouette IoU | < 0.5 | projectile 0.36, nova 0.30, cone 0.13, zone 0.46 |
| page errors | 0 | 0 |
| retention (R-mage / R-boss) | ≥ 95 % | SKIP (I, integration) |

Run-to-run spread: the borderline rows move by ±0.03 sat / ±10 % detail between full runs and differ again in `MG_IDS` subset
runs (e.g. `lightning.charged` 0.40+ in the full order, 0.36–0.37 alone), so the 4 to 6 misses above flap.
Root cause of the violet misses: an opaque lightning / shadow `mid` swatch reads sat ≈ 0.49 through the post chain on the meadow,
so thin AA linework lands at 0.35–0.40 (requests core (4)).

Other suites in this worktree: `tools/bootcheck.js` exit 0 (all configs, no console errors); `tools/playtest3.js magic` 41/41
(the rule-8 static scan now recurses into `src/spells/motifs/`, §7.9); `tools/playtest.js` exit 0; `tools/playtest2.js` exit 0,
one sword-section line `FAIL wind combo hitstop on the first hit of each castId` (melee / core, not a magic file).

## P1 cut / open
- P1 bespoke rows for awakened skills, the remaining actives and finisher polish were not started (they use the archetype looks,
  which meet the tier budgets); seeded glyph variations not done.
- `breadth.finisher` is declared `'archetype'` through the attuned element (core's `skills/fallback.js` draws it; requests core 2).
- earth / nature / light / shadow use magic's stand-in motifs on this branch; once melee's motifs merge, the caster casts of those
  elements use them (their handle use is then melee's).
- **Open B misses (MG1.c / MG1.a, see Measured)**: violet saturation for 4 rows, detail for `nature.grapple` / `nature.roots` /
  `light.basic`, crisp for `shadow.charged`, first-cast 8.9 ms once. Next steps: dark-step outlines for lightning / shadow lines
  (more chroma at lower luma), a larger grapple anchor glyph in screen space, and a measurement that averages 2 casts per row.

Final tag: `magic-b`.

## Fix round 1 (review.md caster items, merged build with the v4 combat camera)

Measured on the merged state (`node tools/playtest4.js magic --sheets`, 640×360, 48 casts, 1,297 s run).

| Item | Before | After | Root cause / change |
|---|---|---|---|
| Bespoke detail floors (§1.4) at the v4 camera | 14 of 36 bespoke rows under the floor on the integrated build (fire.basic 425, fire.charged 1,764, nature.roots 983 …) | 2 of 36 (`wind.basic` 365, `lightning.basic` 466; both flap between 365 and 1,362 from run to run); bespoke median 3,017 px | The camera sits 13.3 m from the dummy (fov 66°, about 21 px/m at 360 p), so fixed metre sizes became 3 to 10 px slivers. `looks.px(pos, frac)` sizes each cast's primary shape and its line weight as a fraction of the screen height (B 0.07 to 0.09, C/A 0.10 to 0.13). The impact radius floor is in `looks.impact`, and the line floor goes from 1.8/2.2 to 2.4/2.8 px. Short flares (0.07 s) now hold for 0.3 s. Impact shares put the legible shape first (ice.charged). The nature flower sits above the grass in the `light` step, and the salamander head rides above the grass. MG1.c also takes a diff 4 and 10 frames after a cast spawns new shapes, so a burst between two grid samples is measured. |
| 0 new materials per cast | F-mage rotation 31, F-ranger 12, MG1.d --full 33 | F-mage 0 from magic (4 from `enemies/base.js:74`), F-ranger 0, MG1.d 0 / 48. All 104 registry casts repeated: 0 outside the cinematic | Pool misses built new materials. Zone ground discs and tornado parts now share one material per kind or role, and their per-object uniforms are copied in `onBeforeRender` with `uniformsNeedUpdate`. Meteor, aura and tornado-core materials are cached, and the per-element ones are built at boot. The 33 under --full are `src/cinematic/assets.js` finisher materials (ux), now reported separately by MG1.d. |
| Ult circles faint (light, nature, wind) | pale / grass-green circle | ground ink: light, nature and wind circles in the `dark` step, at 0.95 alpha and ≥ 0.009 screen-height weight. Impact sigils added (light hexagram, nature glyph) | |
| U sheets with only 2 frames | 8 of 8 U sheets | 3 frames | The grid holds floor(N / every) < `samples` samples, so the last grid sample is now the dissipation frame. |
| earth.charged / ult / wall slabs | near-black opaque instanced rocks | `props.pillars` → `looks.spike`: earth strata as FM `physical.shard` in the earth `light` step with a dark outline, leaning in a zig-zag. Other elements' walls and pillars use the element column (fire tongue, lightning spike, water droplet, wind crescent, leaf, feather, tendril) | Collider props (`keep`) fall back to the instanced prop only when refused. |
| water.charged dome | 0.85-alpha sheet growing ×1.7 | 0.22-alpha low sheet plus 2 travelling crest arcs (linework) | |
| fire.phoenix framing | camera inside the mage | the dash dummy sits 1.2 m off the path, so the boom no longer collides with it | The dash leaves the player's black `spawnGhost` silhouette (player). |
| Archetype sheets too small | 27 cells of ≈ 95 px | `arch_<name>_{1,2,3}.png`, 3 elements each; every sheet is cropped to the action (≥ 208×117 window around the peak mask, player and dummy) | The 150 KB cap still downscales grass-heavy cells to about 0.5. |
| Ice prison / pillar crystals hide enemies | solid crystals between camera and enemies | every eruption ≥ 1.2 m is an occluder: when it cuts the camera → player or camera → enemy segment (12 nearest enemies within 30 m) it fades to 0.25 alpha (`looks.occlusion`, once per frame). The prison uses 4 prisms instead of 6 | |
| MG1.f IoU | wall fire/earth 0.86 | wall 0.48 (ice/water); projectile 0.36, nova 0.38, cone 0.18, zone 0.48 | All non-ice walls had raised the same rock row. |

Still open (not in this round's items, cross-owner):
- **Handles over the cap**: earth.charged 15, earth.ult 19, light.ult 29, earth.basic 11, nature.basic 10, nature.charged 13 and others. The magic facade stays within the cap (traces show 4 to 8). The rest comes from `vfx` hitFeel per-target bursts that use melee's earth, nature, light and shadow motifs under the same castId.
- **Saturation**: violet saturation stays at the floor (`lightning.basic` 0.33 to 0.38, `shadow.ult` 0.33); see requests core (4).
- **Archetype representatives under the floor**: ice.prison 1,417, ice.slide 1,154, lightning.mine (its trigger is refused once the placement has spent the Z budget), shadow.chains, nature.grapple and lightning.thunderclap.
