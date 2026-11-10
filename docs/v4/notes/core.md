# core — v4 notes

Owner: core (`index.html`, `src/main.js`, `src/core/*`, `src/skills*` (frozen except the §9 P0b items), the test tools, docs listed in PLAN §7.1).
Branch `v4/core`, worktree `/home/user/wt4/core`.

## Status

| Wave | Items | State |
|---|---|---|
| A — P0a (tag `core-p0a`) | (1)–(8) of the core task | **done** (C5 + boot green) |
| B — P0b (tag `core-b`) | (9) post4 render path, (10) pixel budget, (11) governor, (12) sub-steps + per-entity hitstop, (13) warm-up draws, (14) skills presentation, (15) bench.js, (16) debug hooks, (17) bootcheck config 3 / playtest2 / C1–C4, C7 | **done** (C1–C5, C7 green; legacy tests green) |
| P1 | uiScale CSS helper (if ux asks), half-res soft-smoke pass (if vfx asks) | **cut** for wave B (ux has not asked; vfx marked its ask "not needed for P0"); fallbacks: `uiScale` is a stored setting ux applies itself, smoke stays in the scene pass |
| C — integration round 1 | §7.10 | **done** (merged, requests resolved, tests run, review written; fix items handed back — see below) |

## What exists at `core-p0a` (the contract every owner codes against; wave B changes are listed in the next section)

### Settings, difficulty, assist (`src/core/settings.js`)
- Every PLAN §6.8 key with its default in `DEFAULTS` (and persisted in `aw_settings_v3`): `fxIntensity 1.0`, `threatEmphasis 'normal'|'strong'`, `tellMul 1|1.25|1.5`,
  `enemySpeed 1.0|0.9|0.8|0.7`, `iframeMul`, `perfectMul`, `witchSlowmo true`, `offscreenArrows true`, `teachSlowmo true`, `hints true`, `aimAssist 'off'|'weak'|'strong'` (P1),
  `colorblind 'off'|'protan'|'tritan'` (`'deutan'` is stored as `'protan'`: same palette), `flashReduce false`, `screenShake 0.6`, `uiScale 1.0`,
  `damageNumbers 'all'|'merged'|'off'` (default `'merged'`; v3 `true → 'merged'`, `false → 'off'`, also on `set()`), `cameraDist 'near'|'normal'|'far'`, `autoAllocate false`,
  `introShort true`, `keybinds {dodge:'KeyQ', dodgeAlt:'Mouse3', defend:'KeyE', jump:'Space', sprint:'ShiftLeft', interact:'KeyF', skills:'KeyK', codex:'Tab', confirm:'Enter'}`,
  `quality 'low'|'medium'|'high'|'custom'` (unknown → medium), `autoQuality true`, `dynamicRes true`, `fpsCap 60|30|0`, `showFps false`, plus `gpuTier`.
- `SETTING_DEFS` = menu metadata for ux (key, tab, Korean label, values with Korean labels / slider range). `SETTINGS_TEXT_KO` = tab names, `재시작 후 적용`, 성능 테스트 texts, the two quality offers.
- `PRESETS` v4 (§2.2): v3 keys kept + `budgetPx, dynResMin, msaa, fxaa, shadowType, shadowSize, shadowEvery, shadowCalls, shadowTris, bloomMips, bloomStrength, pointLights,
  grassNearFade, grassReceiveShadow, treeDist, floraOutlineDist, enemyOutlineDist, enemyLodDist, particleCap, additiveCap, coverageSoft, coverageHard, fxCalls, fxDetail`.
  Medium: 1.0 MP, MSAA 0, PCF 1024, bloom 3 mips 0.40, 0 point lights, grass 0.4, caps 1000/300, coverage 1.5/2.5, 40 FX calls. A stored non-custom quality re-applies the v4 preset on load.
  `msaa`, `shadowType`, `pointLights` apply at boot only (`RELOAD_KEYS`).
- `DIFFICULTY` = story/easy/normal/hard with `hpMul, dmgMul, tellMul, perfectMul, iframeMul, enemySpeed, autoRevive, checkAddSec, regenCombatMul, autoAllocate, nameKo, descKo`;
  `telegraphMul` alias fixed at 1, `checkAdd` alias = `checkAddSec`. `DIFFICULTY_ORDER = ['story','easy','normal','hard']`.
- `game.assist` (getter, one reused object, recomputed on every `settingsChanged`): `{difficulty, tellMul, enemySpeed, iframeMul, perfectMul, fxIntensity, threatStrong, colorblind (null|'protan'|'tritan'),
  flashReduce, teachSlowmo, witchSlowmo, offscreenArrows, autoRevive}`; multipliers = difficulty × slider. `enemySpeed` clamped to [0.5, 1].

### Palettes
- `src/core/elements.js`: `FX_RAMPS` (§3.2, incl. physical and a `void` ramp), `ELEMENT_DEFS[el].colors.fx`, legacy fields derived (`mid = hex = fx.mid`, `core = fx.hi`, `edge = fx.dark`; shadow `core = fx.dark`, `edge = fx.light`);
  `css` unchanged (UI). `game.elements.fx(el)` → `{hi, light, mid, dark}` numbers (unknown → physical). Physical pseudo-element `hex` = `0x8A8274` (no white). `utils.ELEMENT_COLORS` follows the ramps.
  Note: §3.2's "saturation ≤ 0.35 below hi" holds for light's body steps (light 0.15, mid 0.24); its binding dark edge `#5A4A2A` is 0.53 (HSV) — kept as written.
- `src/core/threat.js`: `THREAT` (8 rows, exact legend texts, rim/edge/fill, shape/body/sound notes), `THREAT_KINDS`, `RESERVED_SHAPES`, `RESERVED_HUES`, `THREAT_FRONT`, `THREAT_LAYERS` (§5.2 numbers),
  `COLORBLIND`, `threatColor(kind, colorblind)` → frozen cached `{kind, rim, edge, fill, fillAlpha, rimAlpha, outline, stripes}`, `threatCss(n)`.

### Tells stub + reference geometry
- `src/core/tellgeom.js`: `hitTest(shape, p, pad = 0.15)`, `shapeDistance(shape, p)` (exact distance to circle / ring / cone / line / capsule / conecap; rad half-angles; XZ),
  `TELL_MIN`, `TELL_LOCK` (§5.7), `tellDuration(base, cls, tellMul, timeMul)`. The real tells may import it (T3 compares against it).
- `stubs.tells` (`isStub: true`): `attack(e, spec)` → handle `{id, enemy, start, dur, progress, remaining, locked, done, alive, consumeStrike(), contains(pos, pad), setPos, setDir, setEnd, extend, stop}`
  timed on `game.enemyTime` with floors × `assist.tellMul` × `e.timeMul`; emits `tellStart`, `tellCommit` (at lock, from `update()`), `tellEnd {reason}`; handles never consumed are cancelled 2 s after their hit.
  When `vfx.telegraph` exists the stub **also draws the fixed v3 decal** for the attack's shape (pass `spec.legacyDecal:false` to opt out), so callers that use `tells.attack` need no fallback decal.
  `canAttack` (punish window only), `nextImpact(pos)`, `windup(e, base, cls)`, `punish(e, dur, {mul})` (sets `e.vulnerableUntil` in enemyTime seconds + `vulnerableMul`, emits `punishWindow`),
  `projectile/hazard/safe → {stop}`, `active()` (reused empty array), `footprints()` (`{data: Float32Array(64), n: 0}` reused), `telegraph: null`, `renderThumb: null`, `MIN`, `LOCK`, `debug.pool()`.
- `NOT_FX` gains `kit, shared, applyPlayerFx, fxMulAt, fxFactor, debug` (read as `undefined` on the vfx stub).

### Render (`src/core/render.js`, `src/main.js`)
- `game.render = {tier, rendererName, msaa, pointLights, shadowType, threatScene, overlayCamera, warm(obj, {target:'scene'|'overlay', now}), snapshot(obj, {w, h, yaw, pitch, dist, scene}), flushWarm, drawOverlay}`.
  `threatScene` has no background/fog and is drawn after `composer.render()` (`tells.preOverlay()` → `setRenderTarget(null)` → `autoClear=false` → `overlayCamera.copy(camera)` incl. projection → render → `autoClear=true`); skipped when empty.
  `warm` (P0a) compiles against the right target and light set (scene: composer HalfFloat target + main-scene lights; overlay: canvas variant), idempotent per material, queued and flushed before the next render
  (`now:true` compiles immediately). The real first draw (64×64 / 1×1 scissor) is P0b item 13. `snapshot` renders the object alone (private hemi + sun) into an sRGB RGBA8 target → PNG data URL.
- Composer targets: both carry their own `DepthTexture`. `game.post` adds `sceneDepth {value: DepthTexture of the target the RenderPass wrote}`, `uvScale {value: Vector2(1,1)}` (dynamic resolution in P0b),
  `sceneRes`, `canvasRes` (drawing-buffer px), `cameraNear`, `cameraFar`, `projInv {value: camera.projectionMatrixInverse}`, `camWorld {value: camera.matrixWorld}` (live references), `bloomTex {value:null}` (P0b),
  `bloomStrength(v)`, `setGrade(id, strength, {priority, durReal, fade})` (layers by priority; the legacy `post.grade(...)` always wins = cinematic priority 10; `GRADES.witch` priority 1).
- Boot render state per preset: MSAA (`prod=1` or production: preset; plain test: 0), shadow type (PCF at medium), `pointLights` (false below high) — applies on reload only.
  `renderer.debug.checkShaderErrors = (test && !prod) || &shaderCheck` (off in production and with `prod=1`).

### Frame, time, plumbing (`src/main.js`, `src/core/timescale.js`, `save.js`, `keymap.js`, `input.js`)
- `ORDER = ['world','vfx','combat','tells','audio','player','spells','sword','skills','enemies','story','cinematic','ui']`, `FILES.tells = ['./tells.js','createTells']` (missing → core stub).
- Frame: per step `game.enemyTime += dt × assist.enemySpeed` (not during the global freeze), `game.frame = {step, n, lastStep, frameDt}` (reused object; **P0a: n = 1**, sub-steps in P0b),
  step group `player → stats → spells → sword → skills → enemies → combat → story → cinematic`, once per frame `world → tells → vfx → ui → audio`, render `composer → preOverlay → threat scene`.
- `game.timeScale.set(id, scale, durReal, {compensate, priority}) → granted`; arbitrated sources `witch 1 < teach 2 < cinematic 3` (or any `priority`): one at a time, a lower/equal request while one is active returns false;
  `comp()` = 1/value while any compensating entry (`focus` or `compensate:true`) is active; `slowmoSource()`.
- `game.hitstop(seconds, {tier, target})`: **P0a keeps the v3 global freeze** (playtest2 still expects it) but stamps `target.hitstopUntil` (`game.realTime` seconds) and logs every request;
  `game.debug.hitstopLog()` → last 64 `{t, sec, tier, granted, target}`. Per-entity semantics + budget = P0b item 12.
- `game.save.section(name, {serialize, load})`: stored under the new snapshot key `sections` (v3 keys unchanged); `load(data)` on save load, `load(null)` on `clear()`, immediate `load` for late registrations;
  `RESERVED = {tells, hints, monsterCodex, encounters}`; test helpers `snapshot()`, `sectionsSnapshot()`, `loadSections(obj)`.
- `game.nextCastId()`; the skills runtime stamps `ctx.castId` (or `opts.castId`) before `perform` and adds `castId` to `skillCast` (`skills.lastCastId`).
- `game.input.keymap = {get, rebind, label, actionOf, reset, pressed, down, released, actions, NAMES_KO}`; persisted in `settings.keybinds`; rebinding dodge/defend/interact/codex/skills also updates the legacy `KEYS`.
  Korean labels: `Q`, `마우스 4번 버튼` (Mouse3), `마우스 왼쪽/오른쪽/휠 버튼`, `스페이스바`, `Shift`, `Tab`, `Enter` … `KEY_NAMES_KO.codex = '도감'`. Mouse buttons 3/4 no longer navigate back/forward.
- `game.quality` (P0a shell, `src/core/quality.js`): `{level, preset, scale, baseScale, budget, renderSize(), set(level, reason), lock(on), history(), headroom(sec), benchmark({seconds})}`;
  `budgetFor(level, preset)` implements the cumulative L0–L5 rows of §2.3 (`particleMul, coverageMul, flareMul, fxDetail, enemyOutlineDist, enemyLodMul, floraMul, grassMul, floraOutlineDist,
  shadowEvery, shadowFrozen, bloom, particleCap, dynRes, dynResFloor`); `qualityLevel {level, scale, reason}` event; budget-only L1 headroom for 4 s on `bossSpawn` and ultimate/finisher `skillCast`;
  `game.perfScale` = `budget.particleMul` (legacy view). The governor controller, pixel budget and title benchmark are P0b (the v3 EMA governor still runs outside tests / with `governor=1`).
- Frame cap: rAF callbacks earlier than `1/fpsCap − 2 ms` are skipped (`fpsCap` 0 = unlimited).
- `gpu.js`: `detectGpu` (WEBGL_debug_renderer_info → tier regexes of §2.2), `baseScale(w, h, pr, budgetPx, renderScale)`, `renderSizeFor` (P0b wires them).
- Debug (§7.7): `hitstopLog`, `governor`, `perf` (null until P0b), `overdraw`, `coverage`, `tells`, `forceAttack(type|entity, id)`, `lookOf(id, family)`, `newMaterials()`, `firstDraws()`, `fragments()`.

### Test params (§7.6)
`prod=1`, `governor=0|1` (test default off), `budgetPx`, `refresh`, `seed=N` (mulberry32 replaces `Math.random`), `gpu=`, `quality=` (transient preset), `fx`, `difficulty` (incl. story), `witch=0`,
`colorblind=`, `threat=strong`, `hints=0`, `stub=<module>[,…]` (incl. `tells`). Setting params are applied with `persist:false`. `game.testParams` holds the parsed values.

### playtest4 (`tools/playtest4.js`, `tools/playtest4/harness.js`)
Runner: `node tools/playtest4.js [owner…] [--perf] [--full] [--sheets] [--list]`, ORDER of §7.8, exit 1 on failure, `PT.flags`.
Harness: `PT.boot(params, {w, h})` (adds `prod=1&governor=0&seed=1` unless given), `PT.bootScene(id)` + in-page `PT.scene(id)` for S-*/F-*/B-*/R-*/P-bench, `PT.sweep`, `PT.draws()`
(scene/shadow/overlay/post calls + tris, transparent, additive, upload bytes/calls, programs, `byGroup` world/player/enemies/fx/enemyFx/tells/ui), `PT.measure(fn)`, `PT.fragments({owner})` (counting override,
first call recompiles patched variants: ~18 s on SwiftShader, cached after), `PT.rotate`, `PT.simMs`, `PT.cpuFrame`, `PT.longFrames`, `PT.alloc` (CDP), `PT.pixels.{render, diff, luma, mask, sobel, iou, dataURL}`,
`PT.armor` (sets `e.ptArmor`), `PT.keepAlive`, `PT.clearEnemies`, `PT.waitEvent`, `PT.events`, `PT.gpuSync`, `PT.gpuMs`, `PT.gpuRatio` (same page), `PT.gpuRatioPages` (two pages),
`PT.baseline()` (v3 build `de5d823` via `git archive` into `tools/playtest4/out/v3base`), `PT.sheet` (contact sheet ≤ 150 KB).
Fixtures (`tools/playtest4/fixtures/`): the evidence scripts `fight.js, lib.js, common.js, percast.js, measure.js, inject.js, synctest.js` with repo-relative paths, output in `tools/playtest4/out/<name>/` (git-ignored).
`.gitignore` keeps `*.png` ignored except `tools/playtest4/sheets/**`.

## Wave B (P0b) — what was built, APIs

### (9) Render path v4 — `src/core/post4.js` + `src/main.js`
- `createComposer4(renderer, scene, camera, {msaa, bloomMips})` replaces EffectComposer + RenderPass + sanitize ShaderPass + UnrealBloomPass + OutputPass. EffectComposer-shaped:
  `passes = [RenderPass, BloomPass4, FinalPass4]`, `readBuffer`/`renderTarget1`/`renderTarget2` (= the single scene target), `render(dt)`, `setSize(cw, ch, maxScale)`, `setScale(s)`, `viewport {w, h}`,
  `uvScale`, `state {allocW, allocH, vw, vh, reallocs}`, `bloomActive`, `bloomMul`, `setBloomMips(n)`, `materials()`. `game.composer` / `game.bloomPass` point at it (`bloomPass.enabled/strength/threshold/radius/mips`).
- Scene target: HalfFloat, samples = boot MSAA (0 at low/medium, 4 at high), own `DepthTexture`; allocated once at **drawing buffer × renderScale**; re-allocated only on a canvas resize or a
  renderScale change. Dynamic resolution = `rt.viewport/scissor` = floor(alloc × scale) (no dispose, no program change). One scene target instead of two ping-pong targets (nothing ping-pongs any more).
- BloomPass4: bright pass (4 Karis-weighted taps, NaN/Inf scrub, clamp 16, threshold 1.0, hue-preserving knee) into a ¼-area target; down chain of 3 mips (5 at high) from 1/16 area;
  additive 3×3-tent up chain back to the first mip; output = `bloomPass.texture` = `game.post.bloomTex` (never blended into the scene target). Every tap is clamped to the live viewport.
- FinalPass4 (to the canvas): scene × uvScale; FXAA 3.11-lite whose every tap is graded + ACES-tone-mapped (exposure 1.05) before the luma/edge tests; bloom added as
  `TM(c + bloom·strength) − TM(c)` (HDR before the curve, identical to v3 off edges); grade (`uGrade*`), pulse (`uChroma`/`uRadial`, HDR radial + chroma path), CAS-lite sharpen while the render
  is smaller than the canvas (`uSharpen`), ±0.5 LSB dither, NaN guard, linear → sRGB. All switches are uniforms (`uBloomOn`, `uFxaa`, `uSharpen`); `game.post.uniforms` = FinalPass uniforms (v3 names kept).
- Bloom strength = preset (`0.40` medium, `0.45` high) × 0.75 while `enemies.aggroCount?.() ≥ 3` (checked every 0.25 s) → 0.30; L4 → `uBloomOn = 0` and the bloom pass is skipped.
  Presets are re-applied after module `init()` (world v3 overwrote the bloom pass fields).
- `game.post.sceneRes` = live scene viewport (px), `uvScale` = viewport ÷ allocation, `canvasRes` = drawing buffer, `sceneDepth` = the scene target's DepthTexture.
- Shadows: `autoUpdate` off; the map is rendered every frame at medium, every 2nd at low / L3 (`budget.shadowEvery`), frozen at L5; **shadows off** = one shadow pass with no casters (view camera
  on layer 31 for that single render) and then no updates. Texel snapping stays in world.
- `renderer.setPixelRatio(min(dpr, 1.0 medium / 1.5 high))`; renderScale is no longer multiplied into the pixel ratio.
### (10) Pixel budget — `src/core/gpu.js`
- `budgetSize(w, h, pr, budgetPx, renderScale, dyn)` (floor → never above the budget), `baseScale` (P0a), tier regexes (P0a; medium for every tier on first run — the settings default).
- main: `base = baseScale(drawingBuffer, budgetPx (test param or preset), renderScale)`, total = base × `game.quality.scale` → `composer.setScale(total / renderScale)`; `game.quality.baseScale` holds base.
- `game.quality.renderSize()` → live `{w, h}`; `renderSize(w, h, pr)` → what the current preset picks (C1 unit test: 1920×970 → 1406×710 = 0.998 MP).
- Offers: `showOffer(game, 'high'|'medium')`, `maybeOfferHigh(game, titleBench)` (discrete tier, headroom ≥ 1.6, `settings.highOffered` once); `game.ui.qualityOffer(offer)` or event
  `qualityOffer`, fallback DOM card outside tests (texts from `SETTINGS_TEXT_KO`). Drop-back offer: high + governor ≥ L2 for 30 s, once per session.
### (11) Governor — `src/core/quality.js`
- `game.quality.frame(dtMs, cpuMs, gpuMs)` is called by the rAF loop once per rendered frame (production; tests only with `governor=1`). T = p10 rAF delta of the last 2 s, snapped to common
  refresh rates, minimum of the last 30 s of estimates, `max(T, 1/fpsCap − 0.5 ms)`; `refresh=` quantises deltas and fixes T.
- Overload (> 20 % misses / GPU > 0.9 T / CPU EMA > 0.8 T, 1 s) → +1 level (+2 when EMA > 1.6 T); at L2+ a GPU/miss overload is first absorbed by the resolution controller until it reaches its floor.
  Probe up after `delays[level]` (6 s) with < 2 % misses; > 5 % misses within 2 s → revert, `delays[level] ×= 2` (6 → 12 → 24 → 48). Dynamic resolution at L2+ (`dynamicRes`): GPU timer →
  `scale ×= sqrt(0.85 T / gpu)` every 0.25 s; otherwise ×0.92 / 0.25 s while misses > 20 %, ×1.03 / 2 s while < 2 %; floor = preset `dynResMin` (L5: 0.6); changes ≥ 0.02.
- `gpuTimer` (EXT_disjoint_timer_query_webgl2, pool of 4, disjoint-safe), `governor()` state, `simulate({frameMs, gpuMs, cpuMs, refresh, seconds, log})` (fast synthetic frames, C2), `endSimulation()`,
  `titleBenchmark({seconds:2})` (production boot, state `title`: real rAF frames + a few 1-px-synchronised renders → start level 0/1/2, headroom → high offer; `lastTitleBench`, event `titleBenchmark`).
  `autoQuality` off → L0 and scale 1; `dynamicRes` off → scale 1. The v3 EMA governor in main.js is gone (`game.perfScale` = `budget.particleMul`).
### (12) Timing — `src/main.js`
- Sub-steps: realDt ≤ 0.1, `n = min(2, ceil(realDt·30))`, step dt = realDt·scale / n (≤ 1/20), `n = 1` when the previous frame's simulation took > 8 ms. `game.frame = {step, n, lastStep, frameDt}`.
  **Opt-in:** a playing module with `substeps: true` runs every sub-step; others run once on the last step with the whole frame dt (v3-compatible; see requests). stats runs every step.
  `game.step(n, dt)` unchanged (1/60 → one step per frame). Game-time/real-time = 1.00 at 1/15 and 1/10 s.
- Hitstop: per-entity (`target.hitstopUntil`, `game.playerHitstopUntil`, `game.isHitstopped(e)`), global only for `ult`/`kill` and option-less legacy calls; caps 0.10 (0.12 break/parry,
  0.16 legacy); 3–4 frame floor only when the frame delta is below 50 fps; per-target 80 ms rolling budget (exempt: ult/break/parry/kill/legacy); log records `{t, sec, tier, granted, target, seq, reason}`.
- Per-module CPU ring (`game.debug.perf()`): median ms per module over 120 frames + `render`.
### (13) Warm-up — `src/core/render.js` + main `prewarm()`
- Boot: module `prewarm()` objects → `compileAsync` (production) / `compile` (tests) for the scene (composer-target variant) and the threat scene (canvas variant) → `render.bootWarm()`:
  one real draw of every object (hidden included, culling off, all layers) into a 64×64 HalfFloat target, and the threat scene as a 1×1 scissored canvas draw. `game.bootWarm = {compileMs, ms, draws}`.
- `render.warm(obj, {target, now})`: compile + one real draw of obj alone (warm layer 30, the host scene's lights enabled on that layer for the call), idempotent per material; `warmStats()`, `isWarm(obj)`.
### (14) Skills presentation — `src/skills/*`
- familiars: instance colours from the element ramp (core light→mid, halo dark, bolt light, glow mid; base material colour default), spawn/impact via `kit.motif(el,'burst'|'spark')` when the kit exists
  (else a pooled burst in ramp colours), one `castId` per bolt in the hit and the FX. procs: every proc firing = one `castId` shared by its hits + its burst (`kit.motif` burst/spark or legacy
  preset with `castId`/`owner`). classkits: enchant wave (`kit.motif` wave + burst, else smear/shockwave/explosion with castId, ramp `mid` instead of `hex`) and shadow-mark detonation (`kit.motif('shadow','burst')`
  else `impact_shadow`) with the cast's castId. `grep 0xffffff src/skills*` = 0.
### (15) 성능 테스트 — `src/core/bench.js`
- `game.quality.benchmark({seconds = 20, rotate, mobs = 8})` → `{avgFps, low1Fps, level, renderW, renderH, gpu, tier, cpuMs, gpuMs, seconds, frames, cast, mobs, mode}`; live mode measures real rAF frames
  (CPU = `game.lastFrameCpuMs`), driven mode (game frozen, tests) steps the game itself. Input locked (`bench`), governor locked, player invulnerable + refilled, plains spot, `enemies.spawnBench?(8)`,
  rotation (loadout skill / 0.5 s, ult / 7 s), slow orbit. Restores state, position, look, HP/MP/stamina/resolve, invulnerability, velocity, cooldowns + charges (`skills.cooldownSnapshot/Restore`),
  governor lock, input, bench mobs. `game.quality.formatBench(r)` = 복사 text (template `SETTINGS_TEXT_KO.benchLine`).
### (16) Debug hooks (§7.7)
- `debug.governor()` (full governor state + `simulate`; also `debug.governor.simulate`), `perf()`, `firstDraws()` (programs drawn for the first time; lazy `renderBufferDirect` hook),
  `programs()`, `newMaterials()`, `fragments()`, `overdraw`, `coverage`, `tells`, `forceAttack`, `lookOf`, `hitstopLog`.
### (17) Tests
- `tools/bootcheck.js`: third safety config `@noTells` (renames `src/tells.js` away) and `&stub=tells`: boots on the stub, spawned mobs attack (`enemyAttack`/`tellStart`), and `tells.attack` with a
  shape shows the fixed v3 `vfx.telegraph` decal; no uncaught errors.
- `tools/playtest2.js` (§7.9): hitstop probe reads `game.debug.hitstopLog()` (by `seq`) and the hit's `castId` (captured at `combat.dealDamage`): the first hit of each castId logs a hitstop ≥ 0.025 s
  (granted, or dropped by the 80 ms per-target budget); with the v4 kit, later hits of the same castId log none; DoT ticks none. Legacy hits without a castId keep the v3 volley rule.
  Settings: "renderScale lowers the render size" (was: pixel ratio) and "shadows off" = map no longer updated (was: shadow-camera layer mask).
- `tools/playtest4/core.js`: C1, C2, C3, C4, C5, C7 + debug hooks; `PT4_CORE_ONLY=c1,c2,…` runs single blocks (blocks: c5 params seed c1 c2 c3 c4 c7).
- `seed=1` determinism check uses `game.seedRandom(1)` (the rAF loop consumes a boot-dependent number of draws before the harness freezes).

## Measured at core-b (SwiftShader, 640×360, prod=1, governor=0, seed=1, medium; this branch: v3 world/vfx/enemies/player, tells on the stub)

Counts are representative; SwiftShader wall-clock ms are not (the 4 shared CPUs made 1-px `readPixels` syncs take 1–16 s during these runs).

| Metric | Measured (branch) | Budget | Owner of the gap |
|---|---|---|---|
| Post passes, full-res equivalents (C1) | **1.41** (final 1.0 + bright 0.25 + 3 down / 2 up mips 0.16), 7 post calls | ≤ 2.0 | — |
| Bright target / first mip / mips (C1) | 0.25 / 0.0625 of the render area / 3 (high 5) | ¼ / ≤ 1/16 / 3 | — |
| MSAA at low / medium / high | 0 / 0 / 4 (FXAA off at high) | 0 / 0 / 4 | — |
| Render size at a 1920×970 window, medium | 1406 × 710 = 0.998 MP (`renderSize(1920, 970, 1)`) | ≤ 1.0 MP | — |
| Resolution step | viewport + uvScale follow, textures 38 → 38, 0 reallocations, ≈ 0 ms extra CPU | no realloc, ≤ 2 ms | — |
| Threat-scene colour, bloom on/off/scale 0.8 | (255, 42, 61) in all three | ΔRGB ≤ 8 | — |
| F-mage rotation p95 calls scene + shadow + overlay | 221 + 40 + 0 = **261** | ≤ 250 | vfx (player FX calls), world/mobmodels (shadow ≤ 30) |
| F-mage triangles scene / shadow p95 | 636k / 92k | ≤ 700k / 50k | world, mobmodels, player (shadow casters) |
| F-mage transparents in the scene pass p95 | 74 | ≤ 55 | vfx |
| F-mage uploads p95 | 1443 KB in 120 calls | ≤ 150 KB / 30 calls | vfx (v3 particle pools upload full capacity), world |
| F-mage simulation ms median (`PT.simMs`) | 1.4 | ≤ 3.5 | — |
| Programs after boot | 136 | ≤ 130 | vfx/tells (kit + tells ≤ 10) at integration; post4 itself uses 4 |
| First draws after boot (4-zone sweep) | 0 | 0 | — |
| Boot warm-up (compile + one real draw of every object) | ≈ 2.0 s, 1072 draws (SwiftShader) | — | first-view hitch at Mirwen 8.4 → 6.1 s, Elderwood 1.1 → 0.74 s, plains 1.3 → 0.70 s (sync'd SwiftShader frames) |
| Game-time / real-time at realDt 1/15 and 1/10 (C3) | 1.000 / 1.000 | ≥ 0.99 | — |
| CPU of a 1/15 s frame vs a 1/60 frame (C3) | ≈ 1.0× (no module declares `substeps` yet → legacy modules run once per frame) | ≤ 1.6× | each playing owner when it sets `substeps:true` |
| Hitstop: 30 light requests / s on one target (C4) | 0.075 s granted, rest dropped; other targets 0, no global freeze | ≤ 80 ms | — |
| 성능 테스트 3 s (C7, driven mode) | 10–11 fps avg, 1 % low 10, L0, 640×360, CPU 12–14 ms | fields + exact restore | — |
| Title benchmark (C7) | picks L2 on SwiftShader (misses 0.67–0.75, headroom ≈ 0) | picks a level | — |
| Boot to ready (harness) | 5.8–7.2 s (P0a: 3.7–4.7 s; +≈ 2 s warm draws on SwiftShader) | recorded | — |

Integration-only rows (C6, C8: GPU ratios, long frames, allocation, soak) are measured in wave C with every owner merged.

## Test results at core-b (this branch, tells on the stub, no other tags merged)
- `node tools/playtest4.js core`: **132 passed, 0 failed, 0 skipped** (C1, C2, C3, C4, C5, C7 + debug hooks; 239 s).
- `node tools/bootcheck.js`: all **17** configs OK (15 v3 configs + `@noTells` + `&stub=tells`: stub true, mobs attack, the stub's shaped attack shows the fixed v3 decal), exit 0.
- `node tools/playtest.js --quick`: all checks PASS, exit 0.
- `node tools/playtest2.js`: 75 PASS, 0 FAIL, exit 0 (hitstop and settings expectations updated per §7.9, see (17)).
- `node tools/playtest3.js` (all sections): **1260 passed, 0 failed, 1 skipped** (1270 s). No playtest3 expectation changed in wave B (core section unchanged since core-p0a).
- After the last governor fix (lock keeps the level): `PT4_CORE_ONLY=c2,c7` re-run 22/0.

## Measured at core-p0a (SwiftShader, 640×360, prod=1, governor=0, seed=1, medium; v3 render path still in place)

| Metric | F-mage (static frame after set-up) | Budget (§1.2) |
|---|---|---|
| Draw calls scene + shadow + overlay | 170 + 40 + 0 = 210 (rotation samples 249–261) | ≤ 250 (C6, integration) |
| Triangles scene + shadow | 600k + 90k | ≤ 700k |
| Shadow pass | 40 calls / 90k tris | ≤ 30 / 50k (world, mobmodels, player own the casters; P0b core shadow camera) |
| Post passes (full-res equivalents) | 4.17 (v3 chain: sanitize + bloom + output) | ≤ 2.0 (P0b post4) |
| Programs after boot | 142–144 | ≤ 130 |
| Allocation (2 s rotation) | 11.4 MB / game-s | ≤ 1.0 (owners' per-frame rules) |
| Sim ms median / frame CPU median | 2.2 / 9.9 ms (submit 6.2 ms) | ≤ 3.5 / — (submit ≤ 4) |

## Test results at core-p0a (this branch, tells/vfx-kit on their stubs)
- `node tools/playtest4.js` (core section): **73 passed, 0 failed, 5 skipped** (C1–C4, C7 = P0b) — C5 green; boot ≈ 3.7–4.7 s to ready (SwiftShader).
- `node tools/bootcheck.js`: all 15 default configs `playing` (tells stubbed), exit 0. The third config (`src/tells.js` renamed away) is P0b item 17 (today `src/tells.js` does not exist, so every config already boots on the tells stub).
- `node tools/playtest.js --quick`: all 4 legacy checks PASS (expected 404 of a missing module file is now ignored, like the playtest3 harness).
- `node tools/playtest2.js`: story / sword / settings / perf all PASS (hitstop still global in P0a).
- `node tools/playtest3.js` (all sections): 1259 passed, 1 failed (core `stub=all` count 12 → 13, fixed and re-run: core 198/0), 1 skipped.
- Harness smoke: `PT.longFrames`, `PT.gpuRatio`, `PT.pixels.mask/sobel/iou`, `PT.baseline()` (v3 build boots in 4.7 s), `PT.gpuRatioPages`, `PT.alloc`, `PT.sheet` (144 KB) all return data.

## Legacy test updates (rule 9 / §7.9)
- `tools/playtest3/core.js`: element colours per §3.2 incl. the shadow special case and the physical ramp; `screenShake` default 0.6; `damageNumbers` default `'merged'`.
- `tools/playtest3/harness.js`: `tells` added to the module list (its 404 is an expected stub).
- `tools/playtest3/core.js`: `stub=all` boots 13 stubs (ORDER gains tells).
- `tools/playtest.js`: a 404 of a module file missing on disk is not a page error.

## Wave C round 1 — integration (branch `v4-polish`)

Merged with `--no-ff`, one by one, no conflicts: `v4/core, world, mobmodels, tells, vfx, player, magic, melee, mobs, bosses, ux`
(every branch had new commits). Requests: every `docs/v4/requests/*.md` carries a "Resolution" section.

### Integration fixes (seams, committed as "integration fix: …")
- legacy skill adapter forwards `castId` / `skillId` (`skills/runtime.js`, `skills/adapters.js`); render warm layer 29 (30 = player `HIDDEN_LAYER`).
- `timeScale.comp()` = 1 / lowest *compensating* scale (witch + bossDeath no longer runs the player at 4×).
- reaction hits carry the trigger's `castId` (`combat/reactions.js`): one hitstop / burst per cast (playtest2 sword hitstop line passes).
- ux damage arc switches the vfx radial hurt vignette off (`ui/threatui.js`).
- `progression.mastery()` allocation-free (per-hit path).
- tells rim clones of a mob's hidden LOD view follow the body's visibility (`tells/body.js` + `mobs/rig.js lod.userData.rimVisibleWith`): rims were never drawn beyond the LOD distance.
- tests: C5 stub probe / overlay-call probe with the real tells; world beacon starts unset (ux sets objective beacons); vfx motif probe picks an unregistered pair;
  MG1.g waits for an earlier finisher; PL1 shadows magic's read-only `castLock` getter; T4 refreshes the v4 LOD state; harness attributes non-world objects
  (`world.debug.owns`) to `other`; C6 / C8 implemented in `tools/playtest4/core.js` (`--perf`, or `PT4_CORE_ONLY=c6,c8`; 9 ABAB pairs, `PT4_PAIRS`).

### Final §1 numbers (merged build, SwiftShader, 640×360, prod=1, governor=0, seed=1, medium)

GPU ratios were measured with the machine otherwise idle; an earlier run with playtest3 in parallel gave F-mage 0.553 (pairs 0.14–2.2): the ratio is only
meaningful on a quiet machine.

| Metric | Measured | Budget | Result |
|---|---|---|---|
| **GPU ratio v4 ÷ v3 (MSAA 4), ABAB 9 pairs median — F-mage** | **0.251** (pairs 0.21–0.57) | ≤ 0.45 | pass |
| **GPU ratio — F-ranger** | **0.335** (0.28–0.37) | ≤ 0.45 | pass |
| **GPU ratio — S-plains** | **0.338** (0.32–0.46) | ≤ 0.65 | pass |
| Draw calls max over sweep S-village / plains / mirwen / elderwood | 164 / 127 / 141 / 156 | ≤ 175 / 140 / 160 / 160 | pass |
| Draw calls p95 F-mage / F-ranger / B-nidhoggra (scene + shadow + overlay) | 176 (154+22+0) / 169 (147+22+0) / 104 (94+11+4) | ≤ 250 | pass |
| F-mage group shares p95 (scene / shadow) | world 112/7, enemies 23/12, fx 18/2, player 4/1, other 12/0 | §1.2 rows | pass |
| Shadow pass F-mage / F-ranger p95 | 22 calls / 26.5k tris; 22 / 26.1k | ≤ 30 / 50k | pass |
| Triangles max S-* / F-mage / F-ranger | ≤ 503k / 476k / 460k | ≤ 600k / 700k | pass |
| Transparent draws p95 F-mage / F-ranger | 40 / 30 | ≤ 55 | pass |
| Fragments ÷ screen S-plains scene / post / world transparents | 1.64 / 1.41 / 0.009 | ≤ 2.2 / 2.0 / 0.5 | pass |
| Fragments F-mage / F-ranger / B-nidhoggra scene+transparent | 1.54 / 1.62 / 1.23 | ≤ 3.5 | pass |
| Player-FX coverage p95 / max F-mage, F-ranger | 1.13 / 1.15; 0.39 / 0.46 | ≤ 1.5 / 2.5 | pass |
| Enemy-FX coverage p95 B-nidhoggra | 0 | ≤ 1.0 | pass |
| Live particles max F-mage / F-ranger | 257 / 452 | ≤ 1000 | pass |
| Uploads S-* median | 7.8–14.1 KB in 14–16 calls | ≤ 60 KB / 30 | pass |
| **Uploads p95 F-mage / F-ranger** | **513 KB in 119 calls / 216 KB in 96 calls** | ≤ 150 KB / 30 | **fail** (fix item) |
| Simulation ms median F-mage / F-ranger / B-nidhoggra | 1.4 / 1.3 / 1.2 | ≤ 3.5 / 4.5 | pass |
| Render submit F-mage median / p95 | 3.2 / 4.2 ms | ≤ 4 / 6 ms | pass (SwiftShader, includes rasterisation) |
| **New materials during the F-mage / F-ranger rotation** | **31 / 12** | ≤ 4 | **fail** (fix item) |
| **Programs after boot** | **161** (growth during rotations 0, first draws 0) | ≤ 130 | **fail** (fix item) |
| Long frames F-mage, 30 s simulation after warm | 0 > 50 ms, 0 > 33 ms (worst 15.9 ms) | 0 / ≤ 2 | pass (one earlier run under load: one 91 ms frame) |
| **JS allocation F-mage / S-plains** | **4.70 / 4.00 MB per game-second** (v3: 9.0–11.5) | ≤ 1.0 / 0.3 | **fail** (fix items: mobs, player, world) |
| 5-min soak (sim-fast) geometries / textures / objects | 664→664 / 76→76 / 2432→2228 | flat ≤ +2 % | pass |
| **Zone transition, worst simulation frame after a teleport** | plateau 2.8, ascent 5.1, **mirwen 75**, elderwood 3.2 ms | ≤ 50 ms | **fail** (world) |
| Render size at a 1920×970 window, medium (C1) | 1406 × 710 = 0.998 MP | ≤ 1.0 MP | pass |
| Post passes (C1) | 1.41 full-res equivalents, 7 calls, bright ¼, mip 1/16, 3 mips | ≤ 2.0 | pass |
| Point lights at medium | 0 | 0 | pass |
| Game-time / real-time at 1/15, 1/10 s (C3) | 1.000 / 1.000; CPU 1/15 frame 1.44 × a 1/60 step | ≥ 0.99; ≤ 1.6 × | pass |
| Hitstop 30 light requests / s (C4) | 0.075 s granted, no global freeze | ≤ 80 ms | pass |
| 성능 테스트 3 s (C7, driven mode) | 10 fps avg / 10 1 % low, L0, 640×360, CPU 14.6 ms, exact restore | fields + restore | pass |
| Title benchmark (C7) | L2 on SwiftShader (misses 0.5, headroom 0), applied | picks a level | pass |

### Integrated-laptop default (step 5)
- Default quality **medium** (`DEFAULTS.quality = 'medium'`, unknown → medium, C5); medium preset = 1.0 MP pixel budget, MSAA 0 + FXAA, PCF 1024, 3 bloom mips, 0 point lights,
  grass 0.4, particle caps 1000 / 300 (C5, C1).
- Pixel budget: `renderSize(1920, 970, 1)` = 1406 × 710 (0.998 MP), `budgetPx=0.5` at 1280×720 → 942 × 530 (C1).
- Governor (`debug.governor().simulate`, C2): 50 % misses at 60 Hz → L1 within 1.02 s; EMA > 1.6 T → L2 in one step; probe back up after 6 s with < 2 % misses
  (revert + backoff 6 → 12 → 24 s); works at 144 Hz; L2 resolution controller (GPU-timer P-control and the miss-driven ×0.92 path, floor 0.8); fpsCap 30 respected;
  `autoQuality` off and `dynamicRes` off honoured; L4 drops bloom without a new program.
- 성능 테스트 (`game.quality.benchmark`) returns every field, restores the game exactly and formats the 복사 line; the ux settings menu calls it (ux section green).

### Test results (merged build)
- `node tools/bootcheck.js`: all 17 configs `playing`, exit 0. Note: `@noBosses` boots with `stubbed:["enemies"]` (bossbase.js / golem.js import `./bosses/*` statically) — fix item bosses.
- `node tools/playtest.js --quick`: all PASS, exit 0.
- `node tools/playtest2.js`: 79 PASS, 0 FAIL, exit 0 (the "wind combo hitstop" line passes with the reaction castId fix).
- `node tools/playtest3.js` (all): 1273 passed, **1 failed** (core check 11: programs 161 → 162 after reaching nidhoggra: the boss's instanced `nid-body` with
  `instanceColor` compiles a toon variant that was not warmed — fix item bosses), 1 skipped.
- `node tools/playtest4.js --full` (7000 s cap; melee cut off near its end, player and ux re-run separately): 849 + 145 passed, 28 + 3 failed before the
  integration test fixes; after them the remaining failures are owner items (see the integration result / fix items): vfx V1 clamp + F-shadowblade
  coverage (counting override 1.86), tells T4 rim interior 20 % (≤ 15 %), bosses B1 treant.pods, magic MG1.c detail floors (36/36 bespoke; the v4 combat camera
  shrinks every look: v4/magic + v4/player alone gives fire.basic detail 417 vs 3,077 on the magic branch), MG1.d 33 new materials (--full), MG1.f IoU,
  melee ML1.c detail floors, ML1.g dodge lock (fire c1 0.317 s) and cancel windows (wind.vortex, lightning.ult), ML1.f IoU.
- Per section after the integration test fixes (latest run of each): core 130+ / 0 (C1–C5, C7), world all pass except noTerrain 0.799 vs ≥ 0.80
  (borderline, passed in the --full run), vfx 53 / 0, tells 100 / 1 (T4 rim interior 20 %), mobs 116 / 0, mobmodels 128 / 0, bosses 218 / 1 (B1 treant.pods),
  magic (default + sheets) 24 / 3 (MG1.c), melee (default + sheets) 30 / 4 (ML1.c, ML1.f), player 59 / 0, ux 89 / 0.
- `--sheets`: caster, melee, mobs, bosses sheets regenerated from the merged build and committed; review in `docs/v4/review.md`.
- `--perf`: C6 / C8 as in the table above (GPU gates pass; uploads, new materials, programs, allocation and the Mirwen transition fail).
