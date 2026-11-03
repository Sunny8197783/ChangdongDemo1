# core — module notes (v3, wave 0)

Files: `src/main.js`, `src/core/{elements,classes,stats,progression,archetypes,interact,timescale,keymap,save,debug,settings,stubs,utils,input,events}.js`,
`tools/{bootcheck,playtest3,playtest,playtest2}.js`, `tools/playtest3/{harness,core}.js`, `tools/playtest3/fixtures/tree_fire.js`.

## Boot
- main.js creates, **before any module factory**: `game.KEYS`, `game.keymapMode` (`'v3'` | `'legacy'` when the test URL has `path=`),
  `game.elements`, `game.classes`, `game.timeScale`, `game.settings`, `game.stats`, `game.progression`, `game.archetypes`,
  `game.interact`, `game.save`, `game.debug`, `game.post`, `game.difficulty`.
- `ORDER = world → vfx → combat → audio → player → spells → sword → skills → enemies → story → cinematic → ui`; `FILES.skills = ['./skills.js','createSkills']`.
  A missing/broken file or a throwing factory is replaced by its stub from `core/stubs.js` (the skills stub is the full CONTRACT §2 shape, `isStub:true`).
- Frame: `timeScale.update(realDt)` (every state) → input → [playing: F → `interact.use()` → player → `stats.update(dt)` → spells → sword → skills → enemies → combat → story → cinematic]
  → `stats.flush()` when not playing → `interact.update` (10 Hz) → `save.update` (debounce) → `post.update` → world, vfx, ui, audio.
- Game dt = `min(realDt, 1/20) × timeScale.value() × hitstop × cinematic.timeScale`. `game.slowmo(s, t)` is a shim to `timeScale.set('legacy', …)`;
  `game._slowScale` / `game._slowTime` are read-only getters over the stack (v2 `player.timeComp` keeps working).
- `game.activeSkills()` = `game.skills` unless it is the stub, else the v2 switch via `familyOf(cls)`.
- `game.continueGame()` = 이어하기 (save.load, spawn at gate/village, full HP). `game.newGame({skipIntro, clearSave})` (`clearSave` for 새 게임).

## Registries
- `elements.js`: `ELEMENT_DEFS` (9; earth status `encrusted`), `ALL_ELEMENTS`, `CLASSIC_ELEMENTS`, `PSEUDO_ELEMENTS` (physical, void), `elDef`, `elColor(id, part)`, `elName(id)` — never undefined.
  `utils.js` keeps `ELEMENTS` = 5 classic; `ELEMENT_COLORS` / `ELEMENT_NAMES_KO` are Proxies (unknown key → physical) with explicit new keys; `ELEMENT_NAMES_KO.ice` stays `'냉기'`.
- `classes.js`: `CLASS_DEFS` (6; access table of DESIGN §2.1, 4 classes per element), `access`, `familyOf` (unknown → caster, warns once), `styleOf`,
  `classElements`, `classesForElement`, `TALENTS` (Korean, DESIGN §2.2), `talentsFor(cls, level, choice)`. Extra Korean fields: `weaponKo`, `signatureKo`, `fantasyKo`.
- `archetypes.js`: `registerArchetype(name, 'caster'|'melee', fn)`, `getArchetype`, `registerImpl(skillId, family, fn)`, `getImpl`, `list()`, `NAMES` (the 24).

## Stats (`game.stats`)
- Pooled source records; `set(id, mods, {duration})` copies into the record (no allocation); `get(key)` lazily recomputes; `update(dt)` (game time) expires
  timed sources and emits **at most one** `statsChanged` per frame; `flush()` does the same without expiry (used outside `playing`).
- Key kinds: the CONTRACT §5 lists, plus the convention for unknown keys: `*Mul` / `*Dmg` / `rx_*` / `rxFamily_*` multiply, booleans OR, the rest add.
  `reactionDmg(id, family?)` = `rx_<id> × rxAll × rxFamily_<family>` (`rxAll` is a multiplicative key, e.g. breadth `1 + 0.04 × trees`) (family looked up in `combat.REACTION_DEFS` when omitted).
- `consume(key)` clears every source contributing that key; `clearPrefix('buff:')`; `registerProc(sourceId, event, fn)` (removed by `clear(sourceId)`); `dump()` for tests.
- `derived()` (reused object): class base × level growth (DESIGN §5.3) × `maxHpMul`/`maxResMul`/`moveMul`; `critMul = 1.5 + critMul`; regen 5 s/3 s, 1.5 %/8 % (hard: in-combat ×0.8).
- **progression owns the `node:<id>` sources** (`node.mods(rank)`), refreshed on learn/unlearn/setRanks/respec/class change/load. Skills must not set them.

## Progression (`game.progression`)
- Everything of CONTRACT §4. Points are derived: `levelPoints(L)` (+1 class, L2–20, even 22–30) + act bosses (`bossesDefeated` ∩ golem/hydra/nox/treant/kalis) +
  seed shrines + `bonusPoints` − spent (granted nodes cost 0). 38 at cap with everything found.
- `canLearn` order: unknown → maxRank → class → tier (secondary T4+) → story (capstones only) → gate (pointsIn ≥ 0/2/5/9/14) → prereq → exclusive → points.
  `debug.ungate` skips class/tier/story/gate; `debug.infPoints` skips points; `debug.strictPlace` disables the test-mode respec-anywhere bypass.
- `canUnlearn` 'gate' is strict: after the refund, every learned node of tier t still needs ≥ gate(t) points in the tiers **below** t.
- `canRespecHere()`: within 8 m of `world.respecSpots` / the altar (`world.altar || world.village.altar`), or test mode. `canChangeClass()` / `changeClass(to)`: altar only, never with a live boss.
- XP listeners: `kill` (only `xpValue > 0`; `zoneLevel` default 1; falloff ×0.5 at ≥ zoneLevel+6, catch-up ×1.5 at ≤ zoneMin−3), `reactionDiscovered` (+60),
  `shrineFound` (seed: +1 point, +300; landmark: +80), `bossDefeated` (records act bosses). `addPoints(n, bossId)` is idempotent with that listener.
- Note: DESIGN §5.1's example column (L5 → 454, …) does not match its own formula; the formula `round(40·L^1.4+60)` is implemented (L5 → 441).
- `mastery(el)` / `breadth()` return reused objects. `unlockedElements()` returns a cached array (do not mutate).
- v2 shims: `choose(cls, path, el)` = setClass + `skills.applyPreset('legacy_all'|'legacy_master_<el>')` + ungate + `pathChosen`.
  While **no trees are registered** (skills stubbed) the v2 behaviour is kept as a fallback (`_legacy`: 5 classic elements, master ×1.25, master awakening/support).
- Extra events: `treesRegistered {count}`, `sealsBroken {}`, `talentChosen {cls, choice}`; `classChosen` gets `{loaded:true}` after a save load.

## Core services
- `game.input.actionDown/actionPressed/actionReleased(name)` read a KEYS binding (keys or MouseN).
- `game.timeScale`: `set(id, scale, durReal)`, `clear`, `has`, `timeLeft`, `value()` (min), `comp()` (= 1/value while `focus`), `active()`.
- `game.interact`: `offer(id, {pos|()=>pos, r=2.5, label, onUse, priority, enabled})`, `withdraw`, `current()` (10 Hz, reused view), `use()`. Emits `interactChanged`.
  Core calls `use()` on KeyF while playing (v3 keymap always; legacy keymap only when an offer is current).
- `game.post`: `pulse(amount, durReal, {radial})` (chromatic split + radial blur, scaled down when `screenShake` is 0), `grade(name, blend, dur)` with
  `GRADES` none/void/memory/holy/cold/boss/finale/dawn/break. Uniforms live in the existing sanitize pass (uniform branches; no extra pass).
- Toon dissolve: every `toonMat` (rim on) has `uDissolve` (−1 = off) and `uDissolveColor`, key `'toonRim+dis'` (chained before prefab occlusion).
  `dissolveUniforms(mat)` (utils.js) returns the per-material uniforms; clone the material once (copy `onBeforeCompile` + `customProgramCacheKey`), then animate the clone's uniforms — no new program.
- `game.save`: `has/save/load/clear/request/update`; key `aw_save_v3`; autosave on `questComplete`, `treeClosed`, `altarLeave`, `classChanged` (2 s debounce, never with a live boss or a cinematic, test mode only with `&save=1`).
  Optional hooks it calls: `skills.serialize/deserialize`, `story.serialize/deserialize/currentBossId`, `world.serialize/deserialize/lastGateSpawn`, `player.placeAt`, `enemies.prewarmBoss`.
- `game.settings`: v3 keys `difficulty`, `screenShake`, `damageNumbers`, `effectQuality`, `holdToCast`; `aw_settings_v3` with a copy-once v2 migration; presets set `effectQuality`;
  `effectMul()`; `set(k, v, {persist:false})`. `game.difficulty` = DESIGN §16 row (`hpMul`, `dmgMul`, `telegraphMul`, `checkAddSec`, `regenCombatMul`).
- `game.debug`: every CONTRACT §21 function (feature-detected, never throws) + `spawnDummy(pos, {aggro, hp})`, `nearestEnemy`, `stats()`; `events.count(name)` (enabled in test mode).
  `hurt(n, {combat:true})` marks a dummy within 30 m with `aggro = debugAggro = true`.

## Test URL params (main.js `applyTestParams`)
`cls` (default mage; `none`), `level`, `skills=all|primary|<ids>|preset:<name>`, `equip`, `difficulty`, `attune`, `unlock=all`, `points=inf`, `quest` (default camps),
`zone`, `boss`, `phase`, `save=1`, legacy `path`/`el`, plus `stub=all|<modules>` (force core stubs) and `intro=1`.
The deprecated `pathChosen` bridge emit after `setClass` was removed at integration (every listener also handles `classChosen`); the v2 `progression.choose` shim still emits it.

## Tools
- `node tools/playtest3.js [owner…]` — runs `tools/playtest3/<owner>.js` sections through `tools/playtest3/harness.js` (`PT.boot`, `pg.run`, in-page `PT.check/skip/step/dummyRing/frameStats/countEvents/fixture`).
  Checks that need a later-wave module are SKIPped. 404s for module files that do not exist yet are not counted as console errors.
- `node tools/bootcheck.js` — 15 configs incl. one per class with `starter_<cls>`, the final boss, legacy configs, and the two boot-safety configs (`@noSkills`, `@noBosses`).
- `tools/playtest.js` / `playtest2.js` add `&path=all` (legacy keymap) unless the URL already has `path=` or `cls=none`; viewport 640×360.
  `playtest.js --quick` skips screenshots and exits 1 on a LEGACY CHECKS failure (19 classic reactions/fusions, golem → `reveal`, no victory).
  `playtest2.js` story: `&cls=none&cine=1`, class panel pick (`ui._parts.classPanel.pick('sword', {noConfirm:true})`), the v3 training steps,
  the `legacy_master_lightning` preset before the R finisher, golem → `reveal` (not victory).
- `tools/playtest3/core.js` check 11: village / plains / Mirwen / Elderwood and the plateau with nidhoggra phase 1 and 2 — calls, tris, programs,
  and frame time (`updateMs` = simulation step without rendering, `frameMs` = step + SwiftShader render).

## Integration (wave 4) — resolved requests
- core: `stats` add key `maxStaminaAdd` (+ `maxStaminaMul`) in `derived().maxStamina`; `game.post.GRADES` has `dusk` / `golden`; `pathChosen` bridge dropped;
  playtest3 core clears the skills `breadth` source before the "rx keys default 1" assertion.
- player: `grantIframes(s)`, `addShield(amount, s, {element})` (combat subtracts `entity.shieldHp` before HP), `refundDash(n)`, `startGlide()`, `addResolve(n)`,
  `restoreMp(n)`, `refreshStats()`, `getWeaponBase('main'|'off', out)`; reads `dodgeCdMul`, `freeSprintOOC`, `noRegenPause` / `noRegenPauseInWater`.
- combat: `combat.enqueue(delay, fn, depth)`; `damage` carries `backstab`, `charged`, `slot`, `headshot`; reads `burnDurAdd`, `burnTickMul`, `wetDurAdd`,
  `frozenDurAdd`, `frozenDurMul`, `chillSlowAdd`, `shockedTakenAdd`, `seededDotMul`, `iceUnfrozenMul`, `airDmgMul`, `headshotMul` (bow hits above 78 % height),
  `nonNatureHealMul` (regen / nature heals exempt), `selfElectroImmune`, `corrodeNoFadeInCurse`, `swirlTwoAuras`, `swirlRadiusAdd`, `chainThroughWater` +
  `chainWaterRange`, `judgmentSplash`, `crystalShieldMul`, `podHealAdd`, `slamJudgment` (hammer heavy → judgment at 3), `lethalSave` + `lethalSaveCd`;
  `ice.prison`'s `shatterMul` is honoured by the shatter handler.
- world: `world.platformAt(x, z, yHint)`, `world.isTallGrass(x, z)`, `surface.isGrass/isTallGrass/meltIce/regrow`, `surface2.isOvergrowth` alias.
- enemies: `setSightMul(e, mul, dur)` + per-enemy `sightMul`/`sightMulUntil` in the sight check; `reflectProjectiles(origin, dir, len, deg)`.
- magic: light beams refract with `lightRefract`. melee: i-frames through `player.grantIframes`; the left dagger trail uses `getWeaponBase('off')`.
- ui: victory screen "에필로그 계속" → `story.continueEpilogue()`; `tree_open` cue on opening the tree.
- story: the 바람 깃털 bonus is the `story:feather {maxStaminaAdd: 20}` source (cleared on a new game); training defers `quick` until something is slotted
  (a fresh class has no quick skill before the `learn` step).
- Not done (optional / no consumer yet): enemy lightning bolts striking lightning rods first; `revealedUntil` (no stealthed enemy type exists);
  a skills recast hook (`opts.recast`); a dedicated water-walk flag (magic keeps its platform discs).
