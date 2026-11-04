# vfx — v4 notes

Owner: vfx (`src/vfx.js`, `src/vfx/*`, `src/combat.js`, `src/combat/*`, `tools/playtest3/combat.js`, `tools/playtest4/vfx.js`, these notes, `docs/v4/requests/vfx.md`).
Branch `v4/vfx`, worktree `/home/user/wt4/vfx`, from `core-p0a`; merged read-only: `world-b` (heightField). Tags: **`kit-p0a`** (kit + ducking + enemy style), **`vfx-b`** (final).

## What was built

### P0-A — the kit (`game.vfx.kit`, tag `kit-p0a`)
| File | What |
|---|---|
| `vfx/kit.js` | assembly + API of §7.4.3: `line, registerShape, mesh, ribbon, bolt, spark, decal, glyph, GLYPHS, ramp, fxMaterial, registerMotif, motif, hasMotif, motifSource, tier, TIERS`. Handles `{alive, stop(fade), setPos, setDir, setScale, setAlpha}` (+ `push` for ribbons, `setEnds` for bolts). castId on every spec → `vfx.debug.byCast(id)`. Reserved shapes (`hatch`, `chevron`, `diamond`) are refused |
| `vfx/linework.js` | ONE instanced premultiplied SDF program for ring / arc / poly / star / ticks / rays / spiral / crescent / glyph / dots / stipple and the decal kinds crack (Voronoi edges) / scorch (broken rings + ember stipple) / frost (hex grid) / ripple / strata (+ lichtenberg / flower / rune as glyph cells). Each instance is an annulus strip (48 × 3, tight to the line band + AA; discs only for filled shapes); planes ground (terrain-conforming through `world.heightField.glsl` in the vertex shader), flat, billboard, oriented; screen-space minimum width (px) via fwidth; back-out / linear / expand / contract scale-in, spin, erosion with a rim band. Two meshes (player = ducked, enemy/world = never ducked) share the program → ≤ 2 calls. Static attributes upload one coalesced range on spawn, dynamic ones the live range |
| `vfx/glyphs.js` | 1024² R8 SDF atlas, 4×4 cells of 256 px, canvas-drawn + Felzenszwalb distance transform at boot (spread 16 px): 9 element sigils, hexagram, futhark band, 12-tick ring, lichtenberg, frost-hex, flower-5, feather |
| `vfx/fxmesh.js` | FM: `registerShape('<el>.<shape>', geo, {blend, outline, max, emissiveBand})` merges into the element's shape atlas; ONE InstancedMesh per element (vertex shader collapses the non-selected shapes) + an inverted-hull outline InstancedMesh sharing the instance buffers → ≤ 2 calls per element. Toon ramp uniforms per element (4-step ramp, gradient attribute `aGrad`), emissive ≤ 1.2, erosion discard with a 0.04 `light` rim band, depthWrite false, back-to-front instance sort ≤ 64, live-range uploads. vfx registers `physical.shard`, `physical.chunk` |
| `vfx/ribbon.js` | RB: camera-facing strips batched 8 per mesh, arc-length resampling (24 pts), taper, head-saturated / tail-desaturated colour, body alpha shorter than the edge, fast → slow streak scroll, premultiplied. Legacy `vfx.trail()` routes here |
| `vfx/bolt.js` | BT: seeded recursive midpoint displacement (17 pts), 0–3 forks, thin `hi` core + `light` halo, regenerated every 2–3 frames, `mid` afterglow line. Legacy `vfx.beam()` routes here (straight beams = jagged 0) |
| `vfx/motifs_generic.js` | the generic fallback for all 9 motif kinds × every element + physical, built from LW / SP / RB / BT with a distinct primary silhouette per element. A look relying on it marks its castId `generic` |
| `vfx/duck.js` | `vfx.shared` (`uPlayerFxMul`, `uThreat` Vector4[16], `uThreatN`, `uCamPos`, `uPlayerPos`), `applyPlayerFx(material, {additive, role})` (side effect only; refuses `userData.shared` and raw shaders; chains `onBeforeCompile`; `customProgramCacheKey` = previous key — or the previous onBeforeCompile source — + `|awfx:<role>`), the factor per vertex from `gl_Position` (projInv / camWorld), `fxMulAt(pos, role)` CPU twin, `fxFactor(id, mul, durReal)`. Footprints from `tells.footprints()` every frame (kinds of `tells/shapes.js`; +0.5 m pad); near-camera smoothstep(1.5, 4); ×0.3 within 1 m of the camera→player segment (segment clamped at 90 % so effects at the player's body are not dimmed); line role ≥ 0.7 × base |
| `vfx/enemystyle.js` | R11: `owner:'enemy'` → particles normal-blended "dark core + `fx.mid` rim" (shader flag), flashes ≤ 1.5 m, linework rings in dark / mid, no glyph circles (`runeCircle` with owner enemy → plain ring), never ducked; `isReservedHue`, `elementOfColor` (sRGB hue) |

### P0-B
1. **Particles** (`vfx/particles.js`): one premultiplied mesh per owner group (player 2,000 capacity / other 400): additive + normal in ONE call (additive particles write alpha 0). Projected-size clamp in the vertex shader (12 % of screen height for soft / glow / smoke / puff / flare / dust, 20 % otherwise, stretch clamped too). Per-particle duck factor (`fxMulAt`, once per frame), no emission where m < 0.05. `uBoost` 1.0, no push toward white; near-white legacy colours → the element's `hi` / `light`. Live caps from `settings.particleCap / additiveCap` × `quality.budget.particleMul` (L5 emergency cap honoured): 500/150 low, 1,000/300 medium, 2,000/600 high (enemy+world ≤ 30 % of the total). Emitters go through the budget (scaled, thinned past 85 %, ducked). castId per particle. P1 done: soft sprites draw an octagon (≈ 17 % fewer fragments).
2. **Coverage** (`vfx/coverage.js`): cast table (ring of 128, no allocation), a screen-space projector, a runtime estimator per item (particles, LW, FM, RB, BT, rune circles) driving soft / hard budgets (`coverageSoft/Hard × budget.coverageMul`): over soft the soft sprites shrink first, then other particles (only for their own share of the overshoot); over hard soft sprites stop emitting. Player-FX call cap (`settings.fxCalls`, 40 at medium): over it the oldest ghosts / shells / rune circles collapse (circles to a linework ring). `vfx.debug.coverage()` → `{screens, byOwner:{player, enemy, world}, parts, peak, calls}`; the counting override (`PT.fragments({owner:'player'})`) is the truth in tests.
3. **Restraint**: `flashSprite` ≤ 1.5 m (× `budget.flareMul`); `dome()` = LW ring + rim-only shell ≤ 2 m (never near the camera); `screenFlash` tinted (white → ivory), alpha ≤ 0.25, ≤ 0.15 s, off with `flashReduce`; `fovKick` ≤ 4°, used by hitFeel only for `ult`; `shake(t)` × `settings.screenShake` (default 0.6); hitstop durations of §5.10 once per castId through `game.hitstop(sec, {tier, target})`; per target one motif spark (≤ 12), one burst per castId within 0.3 s (tier ≥ heavy); DoT ticks = 1 particle. `impact_<el>` / `explosion_<el>` = `kit.motif(el, 'burst')` + sparks (SZ / LF multipliers gone); the 6 reaction families + universal rebuilt from kit (≤ 60 particles, no domes, ≤ 1 ring, tinted flash only for burst / judgment). `flashEntity`: one flash clone per **source material** (shared by every entity using it), built when an entity registers (`combat.register` → `vfx.prepareFlash`), or `e.flashUniform` when offered. Point lights only when `game.render.pointLights`. Debris / ribbons / bolts / linework upload live ranges; debris is depthWrite false. 0 `0xffffff` in `src/vfx*` / `src/combat*`; fresnel / flame / shell intensities ≤ 1.2.
4. **Combat**: burning re-ramp (`fxassets.flameMat`: base `fire.light` → `mid` → tip `fire.dark` at alpha 0.6, ×1.0); `statusfx.update` without per-frame iterator entries; `queryRadius` without per-call arrays (ring of 32 reused results when no `out`); `pipeline.js`: `× e.vulnerableMul` while `game.enemyTime < e.vulnerableUntil` (after resist; `lastFormula.vulnerable`), `hit.appliedStatuses`, `playerHurt {amount, element, source, sourceName, attackId, attackNameKo, attackKind, appliedStatuses, dot, surface, dir, time, attack}` (`dir` = unit xz toward the attacker), castId + dot passed to hitFeel; `combat.clearStatus(entity, id)`.
5. **Telegraph fallback** (`vfx/telegraph.js`): winding fixed (no mirrored grid: normals up) AND DoubleSide, renderOrder 30, depthTest false, toneMapped false, threat palette (`core/threat.js`), LINEAR time front, pool 16 that never recycles an active decal (timing-only handle when full), `halfAngle` (rad) or legacy degrees; forwards to `game.tells.telegraph` when the real tells exists; `vfx.debug.telegraphs()`.

## APIs (in addition to v3)
`vfx.kit.*` (above) · `vfx.shared` · `vfx.applyPlayerFx` · `vfx.fxMulAt` · `vfx.fxFactor` · `vfx.prepareFlash(entity)` · `vfx.hurtVignette = false` (ux opt-out) ·
`vfx.debug = {coverage(), byCast(id), calls(), budget(), resetPeaks(), overdraw(on), setVisible(owner, on), telegraphs(), flashClones(), screenFlash(), isReservedHue, duck, cast}` ·
every legacy call accepts `owner:'player'|'enemy'|'world'` and `castId`.

## Measured (SwiftShader, 640×360, medium, fxIntensity 1.0, legacy spell / sword looks on this branch)
| Metric | Measured | Budget |
|---|---|---|
| F-mage player-FX coverage (counting override) p95 / max | 0.41 / 0.41 screens (estimator p95 0.73) | ≤ 1.5 / 2.5 |
| F-ranger player-FX coverage p95 / max | 0.27 / 0.27 | ≤ 1.5 / 2.5 |
| F-mage / F-ranger player-FX draw calls p95 | 8 / 11 | ≤ 40 |
| F-mage / F-ranger live particles max | 354 / 411 | ≤ 1,000 |
| Kit programs | 5 (linework 1 shared by both pools) | ≤ 6 (kit + tells ≤ 10) |
| FM calls, 20 instances of 2 shapes | 2 | ≤ 2 per element |
| Ring solid raster ÷ disc (annulus check) | 0.15 | < 0.3 |
| impact_<el> ×9 newWhite peak | 0.00 % | ≤ 1.5 % |
| reaction families newWhite | ≤ 0.02 % | ≤ 4 % |
| reaction presets particles | 5–33 | ≤ 60 |
| new materials from vfx/combat in 30 s F-sword | 1 (total 25: 24 from `enemies/base.js showIcon`, mobs) | ≤ 4 |
| projected size soft / other | 0.07 / 0.16 of screen height | ≤ 0.12 / 0.20 |

(Every number above is reported by `node tools/playtest4.js vfx`. Integration (`I`) checks — retention, C6 sums — depend on the real looks of magic / melee.)

## Tests
- `node tools/playtest4.js vfx` — V1–V4 (functional page with shaderCheck, F-sword 30 s, F-mage + F-ranger; `--full` adds the other classes). Dev split: `VFX_PART=quick|fsword|f`.
- `tools/playtest3/combat.js` updated per §7.9 (rule 9): the telegraph block runs on a `&stub=tells` page and asserts the fallback pool 16, DoubleSide / renderOrder 30 / depthTest off, triangle normals up, linear fill, > 500 changed px for circle / ring / cone / line; on the main page with the real tells it asserts forwarding through `tells.debug.pool()`.
- Final run on this branch: `node tools/playtest4.js vfx` **53 passed, 0 failed** (231 s). Legacy: bootcheck all configs `playing` (exit 0), `playtest.js --quick` all PASS, `playtest3.js` (all sections) **1265 passed, 0 failed, 1 skipped**, `playtest3.js combat` 95 / 0. `playtest2.js` (exit 0) logs one FAIL "wind combo hitstop on every hit": two spell-tier light hits log 0.025 s — §5.10 sets light = 0.025 s and §7.9 hands that assertion to core (requests).

## P1
- Done: octagon quads for soft sprites; small signature layers for 13 reactions.
- Cut / open: half-resolution soft-smoke target at governor L1+ (needs core; requested); ribbon segments ÷ 2 at L1 (`fxDetail` currently only drops FM outlines); bespoke signatures for every reaction (families + 13 signatures only).

## Known issues
- The runtime coverage estimator over-estimates by ≈ 1.5–2× (conservative; rune circles / items near the camera are bounded by their on-screen box); the counting override is authoritative. With the L1 pre-emptive headroom on ultimates (coverage × 0.6) soft sprites may shrink for ~4 s in busy fights.
- Spell objects created by magic / melee that are not named `spells*`/`sword*` nor tagged `userData.owner = 'player'` are invisible to the harness's player group.
- Legacy callers of `screenFlash` / `fovKick` outside hitFeel are clamped (alpha ≤ 0.25, ≤ 0.15 s, ≤ 4°) but not tier-gated; magic / melee should stop calling them except for U / F tiers.
