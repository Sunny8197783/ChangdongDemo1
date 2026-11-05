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

RESULTS_PLACEHOLDER

## P1 cut / open
- P1 bespoke rows for awakened skills, the remaining actives and finisher polish were not started (they use the archetype looks,
  which meet the tier budgets); seeded glyph variations not done.
- `breadth.finisher` is declared `'archetype'` through the attuned element (core's `skills/fallback.js` draws it; requests core 2).
- earth / nature / light / shadow use magic's stand-in motifs on this branch; once melee's motifs merge, the caster casts of those
  elements use them (their handle use is then melee's).
