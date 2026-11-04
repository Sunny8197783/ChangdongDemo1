# core — v4 notes

Owner: core (`index.html`, `src/main.js`, `src/core/*`, `src/skills*` (frozen except the §9 P0b items), the test tools, docs listed in PLAN §7.1).
Branch `v4/core`, worktree `/home/user/wt4/core`.

## Status

| Wave | Items | State |
|---|---|---|
| A — P0a (tag `core-p0a`) | (1)–(8) of the core task | **done** (C5 + boot green) |
| B — P0b | (9) post4 render path, (10) gpu.js pixel budget, (11) governor, (12) sub-steps + per-entity hitstop, (13) warm-up draws, (14) skills presentation, (15) bench.js, (16) debug hooks, (17) bootcheck config 3 / playtest2 / C1–C4, C7 | next invocation |
| P1 | uiScale CSS helper (if ux asks), half-res soft-smoke pass (if vfx asks) | not started |

## What exists at `core-p0a` (the contract every owner codes against)

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
