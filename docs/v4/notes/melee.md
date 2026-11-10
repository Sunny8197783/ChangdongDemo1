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

### Measured (branch `v4/melee`, 640×360 SwiftShader, run by parts: `MELEE_PART=first|dodge|measure|iou`)
| Check | Result | Numbers vs budget |
|---|---|---|
| static (rule 5, reserved shapes, no `game.hitstop`, files) | PASS 8/8 | 17 files scanned, 0 hits |
| ML1.a first casts | PASS | max 2.1 ms CPU (≤ 8 ms) over 57 casts; 0 first draws of never-drawn programs |
| ML1.b registration / lookOf | PASS | 4 el × 9 motif kinds, 14 FM shapes; 104 ids ≥ archetype; 36 bespoke |
| ML1.g dodge windows | PASS | longsword worst 0.25 s (c4_fire), hammer 0.15 s, daggers 0.083 s (≤ 0.25); charged 0 s after release (≤ 0.10); actives ≤ 0.10 s after first damage; ults from first damage; fire.finisher 293 frames, 0 cancellable, 0 vulnerable |
| ML1.c ceilings (white, luma, cov, particles, handles) | PASS for all 57 | white max 0.02 % (≤ 1.5–15 %), cov max 0.465 (U ≤ 1.0; C ≤ 0.30 all pass), particles max 132 (U ≤ 150), handles ≤ tier cap (hard cap now) |
| ML1.c floors | **FAIL 16/57** | sat below the swatch floor for cool elements (ice.basic 0.357 / 0.387, ice.nova 0.362, ice.ult 0.321, lightning.basic 0.31 / 0.40, lightning.charged 0.251, lightning.ult 0.282, wind.basic 0.346 / 0.382, wind.ult 0.332, water.ult 0.346 / 0.35, water.charged 0.346, shadow.basic 0.312, shadow.charged 0.348, lightning.mine 0.333); detail lightning.ult 5855 and fire.ult 7619 (U ≥ 8000; 7417 / 7350 alone) |
| ML1.d materials | PASS | 0 new materials per cast after the first (57) |
| ML1.e stacked 7-cast rotation | PASS | 0.0 % near-white (≤ 12 %) |
| ML1.f element IoU | **FAIL 2/5 forms** | basic 0.35, nova 0.21, cone 0.48 pass; projectile 0.61 (water/light), zone 0.61 (wind/water) (< 0.5) |
| retention (I) | SKIP | integration |

Swatch saturation on the test ground (opaque `mid` ring + tinted solid, MG1 method): fire 0.748, ice 0.454, lightning 0.5,
wind 0.447, water 0.545, earth 0.665, nature 0.637, light 0.252, shadow 0.567. ML1.c judges sat against `min(§1.4, 0.85 × swatch)`
(MG1's rule, window-weighted), so the two families are measured alike.

Legacy (worktree): `tools/bootcheck.js` exit 0 (all configs playing, no uncaught errors); `tools/playtest3.js melee` 98/0;
`tools/playtest.js` exit 0; `tools/playtest2.js` exit 0 with one FAIL line "wind combo hitstop on the first hit of each castId:
repeat" — a reaction hit without `castId` (request 4a; flaky across owners' runs).

### Late fixes (this pass)
- Hard per-cast handle cap: every kit spawn of a motif (also the once-per-cast burst `vfx.hitFeel` plays through `kit.motif`, spark
  motifs and decals) runs under the cast's §1.4 cap; spawns past it return an inert handle.
- FX solids (FM meshes) stop when the chase camera reaches them (depth < 2.5 m or distance < 3 m): a lunge through the target carried
  the camera into the impact flower (nature.charged peak coverage 1.47 → 0.04).
- `light.ray` built at pillar width (uniform scale keeps the kit's coverage estimate honest: light.charged 0.60 → 0.15).
- Rows: lightning.ult owns its beams / impacts (paced strikes no longer starved by the legacy beam + burst), fire.ult inner ring,
  smaller roots / sanctuary footprints, Z decals ≤ 2.2 m, crescent and blade-trail rims lean to `mid` (less `light` / `hi` mix).
- ML1 harness isolation: spells zones cleared between casts (sanctuary kept ticking into later casts), meadow soaked / regrown,
  legacy leftovers waited out; these were the cause of most earlier sat / cov failures in the full sequence.


## Known issues / P1
- Open B floors (above): cool-element saturation (request 3) and two U detail floors; two IoU pairs (projectile water/light,
  zone wind/water) — the zone / projectile forms of those elements need more distinct primary shapes (P1 polish).
- ML1.c with all 57 casts takes ≈ 8–13 min on the shared machine; run it by parts.

Cut: bespoke looks for the remaining (non-bespoke-set) rows — they use their archetype look; finisher polish (the finishers run the
v3 cinematics through the gate: one tinted flash ≤ 0.15 s, budgets F); per-weapon smear textures.

## Fix round 1 (integration review)
- **Dodge lock in real time**: combo / recover lock spans are accumulated in real (unscaled) seconds and released at 0.25 s. Repro: the
  same c1 fire swing under the ultimate's 0.35× slow-mo locked 0.267 s before (0.317 s in the integration sequence), 0.233 s after.
- **Deferred delivery**: an archetype strike that deals no damage itself (zone, rain, projectile, wall …) marks its strike frame as the
  delivery frame (`action.dmgT`, `action.deferred`); the dodge window opens there. wind.vortex free 0.45 → 0.367 s (delivery 0.35),
  lightning.ult free = delivery 0.417 s. ML1.g reads the delivery frame when no damage event arrives inside the window.
- **Caster casts through melee motifs**: earth / nature / light / shadow motifs reached with a caster castId spawn through magic's budget
  facade (`spells.looks.kit`, with its burst / spark shares), so magic's per-cast cap counts them: MG1.c earth.charged and light.ult
  handles now within C 8 / U 12 (were 12 / 29). nature.roots MG1 detail 833 is unchanged by this (same on v4-polish; magic's row).
- **Legibility at the v4 combat camera**: every archetype look authors one upright element sigil (kit glyph, `mid` linework) first,
  its lowest point ≥ 1.9 m above the strike ground (never over an enemy body), with a per-element scale / height / side offset so two
  elements never share a footprint. fire.ult / lightning.ult / wind.ult / ice.charged / shadow.hex / lightning.mine signatures stand up
  (ground-only linework was edge-on). A-tier own particles 64 (vfx's per-target sparks fill the rest of §1.4's 80).
- **Fire restraint**: ≤ 2 flame solids (fire.flame / fire.petal) per melee motif call at 0.75 scale, ≤ 3 tongues, slim 2.2 m pillars.
  The remaining tall pale column at a burning target is combat's `burning` status flame (src/combat/fxassets.js, vfx owner).
- **ML1 harness**: spot moved to (−30, 30) (MG1's ground; the old spot had a tree between camera and hero), `surface2` cleared between
  casts, IoU sheets use the impact (peak) frame, `MELEE_RAW=<dir>` writes full-res frames for review.
- Still open (palette, not shape): cool / violet saturation floors (ice / lightning / shadow rows, request 3); light.sanctuary cov.
