# melee — v4 notes

Owner: melee (`src/sword.js`, `src/sword/*`, `src/sword/motifs/*`, `tools/playtest3/melee.js`, `tools/playtest4/melee.js`,
`tools/playtest4/sheets/melee/*`, these notes, `docs/v4/requests/melee.md`).
Branch `v4/melee` (from `core-p0a`), worktree `/home/user/wt4/melee`. Merged read-only: `core-b`, `vfx-b` (includes `kit-p0a`),
`tells-b.2` (includes `tells-p0a`). No magic tag existed, so the five caster-owned elements use melee-local recipes (below).

## What was built

### Look engine (`src/sword/looks.js`)
Every melee move runs inside a **cast context** `cc = {castId, tier, el, skillId, kind, row | arch, budgets…}` opened by the engine
(combo press, charged release, skill, ultimate, finisher, support, counter) and carried by the action and by every task it schedules
(`S.after` / `S.every` keep the cast they were scheduled in).
- **castId** = `ctx.castId ?? game.nextCastId()` per move; on every hit (`hit.castId`) and every kit / particle spec.
- **The gate** (`L.call`): every legacy `vfx.*` call of the sword files is restyled to the v4 language: element 4-step ramps (mid step
  for bodies and lines, no white), no glow / flare / puff sprites (→ element accent shapes), normal-blended sparks (no white-out),
  per-tier particle and handle budgets (§1.4), `explosion` / `impact` → one element `burst` per cast (none on tier B: §3.6 basic =
  smear + ≤ 6 sparks per hit, nothing persists), `shockwave` → linework ring, `beam` → bolt or tapered ribbon, `flash*` → 2-frame
  4-point star glint, `runeCircle` → **rune circle in kit linework** (outer ring → tick band → element sigil, opposed spins, back-out
  scale-in; C / U / F only), `screenFlash` / `fovKick` only for U / F (tinted, ≤ 0.2 alpha / 0.15 s, off with 섬광 줄이기), shake ×0.6.
- **Handle budget** = handles actually spawned for the castId (`vfx.debug.byCast`) + slash crescents; motif handle costs are learned
  per `el:kind:tier` so later casts budget them exactly.
- `sword.lookOf(id)` → `'bespoke'` for rows of `sword/rows.js`, else `'archetype'` (every registry id has an archetype look).
- Without `vfx.kit` everything degrades to the restrained legacy calls (feature detection; logged once).

### Primary shape: the slash crescent (`src/sword/fx.js`)
Vertex-built crescent band (inner 40 % empty, saturated `mid` body ≤ 0.7 alpha, thin `dark` inner line, rim mixing `mid`→`light`,
1–2-frame `hi` line only at the head), leading edge carrying the element motif (fire tongues, ice frost teeth, lightning arc-crawl,
wind streamlines, water crest, earth chipped edge, nature thorns, light halo ticks, shadow inverted value). Dissipation by erosion
(no alpha haze; fragments below 0.12 alpha discarded). The plane leans 0.3 rad toward the chase camera so a swing reads as a shape.
Blade trail: same ramp rules. The legacy `vfx.smear` duplicate is skipped when the kit exists. Per-element crescent profiles
(band, span, height, life) give distinct silhouettes; daggers' basic cuts live ≤ 0.14 s.

### Motifs (`src/sword/motifs/{earth,nature,light,shadow}.js`, shared helpers in `common.js`)
FM shapes registered with `kit.registerShape`: `earth.rock` (faceted, strata vertex bands), `earth.spike`, `earth.slab`, `earth.chip`,
`nature.vine` (S-curve tapered tube, growth), `nature.thorn`, `nature.petal` (5-petal flower), `nature.leaf`, `nature.pod`,
`light.ray`, `light.halo`, `light.feather`, `shadow.tendril`, `shadow.crescent`, `shadow.raven` + `shadow.raven2` (2-frame flap).
All 9 motif kinds per element via `kit.registerMotif` (cast, trail, burst, spark, zone, pillar, wave, aura, summon), following the
§3.5 never-lists (light ivory, never saturated gold; shadow never magenta; no hatch / chevrons / diamonds; earth never additive).
Fire / ice / lightning / wind / water: magic's motifs are used automatically once registered; until then melee plays its own
melee-local recipes from kit primitives (never the generic fallback).

### Looks per skill (`src/sword/rows.js`)
- **Archetype looks** (`ARCH_LOOKS`, all 24 melee archetypes): weapon glyph flash at the start (2 frames) + one element motif at the
  strike placed by the §3.6 rules (hit → burst at the target once per cast; crawler / lane / dash / blink / beam → ground `wave`
  from the impact point forward; nova / leapslam / rain → burst + ring; pillar → `pillar`; zone / wall / mine → `zone`; summon;
  buff → `aura`; cone → `wave` arc).
- **Bespoke rows** (36 = the melee bespoke set enumerated from the registry: 12 ★ + every `*.basic`, `*.charged`, `*.ult` +
  `starter_sword` / `starter_paladin` / `starter_shadowblade` skills): each row's first key shape is its signature (unique inside its
  element), from the §3.7 melee delta column (e.g. fire.charged = fan of flame petals on the ground ahead of the overhead slash,
  ice.nova = hexagonal frost ring + crystal fan from the impact point, earth.charged = strata spikes from the impact point forward,
  light.ult = halo rings with ticks along the prism beam, water.ult = three outward wave rings with foam lines, shadow.step = ink
  splash at departure and arrival + crescent bite …). Hooks: `start` (first action), `strike` (first hit window / event / archetype
  strike, before the legacy fx of that frame); skills without an engine action run both at once.

### Dodge-cancel windows (§5.8) — `game.player.action.dodgeCancelable`
Written every frame an action runs (true when idle): combo swings cancellable before `t0` and from `min(t1, t0 + 0.25 s)`;
charged attacks while charging and from 0.10 s after release; actives from 0.10 s after their first damage frame (planned strike
frame until then, 0.35 s without damage); ultimates from the first damage frame; finishers never, and fully invulnerable
(`player.grantIframes(0.15)` every frame + super armour). No `game.hitstop` in melee files (feel through `vfx.hitFeel` tiers).

### Rules
0 `0xffffff` / `#ffffff` and no intensity multiplier > 1.2 in `src/sword*`; no program-key flips (colours via uniforms /
instance attributes); every private material through `vfx.applyPlayerFx(m, {role})` and returned from `warmup()`; all player FX
`depthWrite:false`; pooled meshes, 0 new materials per cast; rows and motifs allocate only per cast, never per frame.

## Tests — `node tools/playtest4.js melee [--full] [--sheets]`
Dev split: `MELEE_PART=first|dodge|measure|iou|probe`, `MELEE_IDS=a,b`, `MELEE_EVERY=6`, `MELEE_VERBOSE=1`.
Static (rule 5, reserved shapes, no hitstop, files) · ML1.a first casts · ML1.b registration + declared looks · ML1.c per-cast
measurement (ceilings + floors) · ML1.d materials · ML1.e stacked rotation · ML1.f element IoU · ML1.g dodge windows · sheets.

RESULTS_PLACEHOLDER

## P1
Cut: bespoke looks for the remaining (non-bespoke-set) rows — they use their archetype look; finisher polish (the finishers run the
v3 cinematics through the gate: one tinted flash ≤ 0.15 s, budgets F); per-weapon smear textures.
