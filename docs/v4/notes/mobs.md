# mobs — v4 notes (branch `v4/mobs`, from `core-p0a`; merged read-only: `core-b`, `tells-b.2`, `mobmodels-b`, vfx via core-b)

## What was built (all P0 items of the §9 task)
1. **Model contract** (§4.0): `base.modelFor(ctx, type, opts, legacy)` = `MobModels.createModel?.(type, opts) ?? MobModels.wrapLegacy?.(legacy()) ?? legacy()`;
   every behaviour file uses it (wolf alpha = pack slot 0 → `{variant:'alpha'}`, shaman `{element}`, chuchu `{variant}` incl. `wind`).
   `makeEnemy` forwards `e.rimSource()`, `e.tellAnchor(kind)`, `e.flashUniform`; `model.update(dt)` runs once per visual frame for v4 models;
   the v3 outline/shadow distance loop runs only for wrapped v3 models. `enemies.previewModel(type, opts)` → registered preview or `MobModels.preview`;
   `enemies.registerPreview(type, fn)` for bosses. `enemies.prewarm()` returns `MobModels.warmObject()` (+ `GolemMod.prewarmGolem?.(game)`).
2. **Attacks on one TellHandle**: `base.beginAttack(ctx, e, id, shape)` builds the `tells.attack` spec from `codex.ATTACK_SPECS` (exact §4 ids, tells,
   windups, rad half-angle shapes, lockAt) with `nameKo` from the codex, emits the extended `enemyAttack`; `null` → the AI repositions (strafe / cooldown).
   Strikes resolve only through `h.consumeStrike()`. Rhythm: anticipation (`windupK`) → **hold 0.13 s** (pose frozen, no damping) → strike ≤ 0.12 s
   (`RHYTHM`, `attackPhase`) → slump/recovery pose for the punish duration. Lobs use the release point (`attackPhase(h, h.lockAt)`).
3. **Hitbox = decal**: hits test `h.contains(playerPos)` (locked decal, pad 0.15); `ctx.meleeCheck` = cone through `tells.hitTest` (no +radius 0.4, no
   d < 1 m shortcut); `ctx.slam(center, r, {handle?, shape?, attack})` tests the handle/shape; jump avoid = feet − ground > 0.6 m. Travelling attacks
   (chuchu lunge capsule + landing circle, lizard lunge capsule w 1.6, wolf dart line ≤ 9 × 1.3) hit on body contact **inside the drawn shape** only.
   Every hit carries `attack:{id, nameKo, kind}` + `sourceName`; every enemy vfx call passes `owner:'enemy'` (loot / camp celebration `owner:'world'`).
4. **Punish**: `base.punishAfter(ctx, e, id)` → `tells.punish(e, dur × timeMul, {mul})` with the §4 table; recovery state lasts the window; `tells.canAttack`
   blocks attacks (verified). Shaman cast interrupted by a hit → `dazed` 1.5 s + punish ×1.5. Voidknight slam parry → `e.parryDur = 2.0` stagger.
5. **Projectiles** (`projectiles.js`, also bosses): homing ≤ 0.5 s at ≤ 120°/s (slerp-limited), then straight; speed capped 8 (mob) / 10 (`source.isBoss`);
   shaman 7.5, wraith 8; ≤ 6 enemy orbs (oldest fizzles); enemy style (dark core `fx.dark`, `fx.mid` rim, no white); `tells.projectile(orb)` marker;
   `enemies.orbCount()`, `enemies.orbEta(pos)`; casters take the single ranged token (`ctx.takeRangedToken`). Spore clouds are `tells.hazard`s and tick only
   while the hazard lives; the cloud sits on the drawn landing circle; fire hits inside a cloud burn it away; golem boulders telegraph via `ctx.tele`.
6. **Behaviour fixes**: voidknight bash = 0.55 s visible shield raise, only after 2 consecutive guarded hits, knockback only; combo decals one by one
   (0.80/0.55/0.65, cones 3.2/3.2/3.6, half-angles 1.0/0.70/1.0, rune slot per step via `model.setComboStep?.`); back hits ×1.5; wolf circle 4.5 m,
   one wolf attacks at a time (`ctx._wolfAttacker`), slide 0.8 s punish; shaman/wraith blink cd ≥ 8 s with a 0.4 s shimmer at the destination first,
   no cast for 1 s after a blink; wraith stays visible 1.2 s after firing (punish); chuchu aura every 2.0 s = 0.5 s glow + circle r 1.6 (`check` class);
   weak-element hits pop a 말랑이 at ≤ 40 % HP; lizard lightning ×1.5 while wet, ice in water → frozen 2 s, −30 % speed out of water; no wraith mask weak point.
7. **Data**: NEW `src/enemies/codex.js` — `CODEX` (16 entries: 8 types + 8 `chuchu:<variant>`), `ATTACK_SPECS`, `WEAK`, `CHU_WEAK`, `CHU_NAMES`, `TYPE_NAMES`,
   `nameOf`, `attackMeta`, `attacksOf`, `applyWeakness`. Every entity: `weakness/resist/immune`, `attacks`, `debugAttack(id)`, `timeMul`, `type`, `codexKey`.
   `enemies.registerCodex/codex()`, `noteEncounter(type)` (save section `encounters`), `enemyEncounter {type, enemy, first, sight}` on first sight
   (≤ 30 m, in the frustum, scanned every 0.25 s) and on first aggro per session, `aggroCount()`, `spawnBench(n)` / `despawnBench(list)` (no damage /
   loot / XP / kill count), `debugResetEncounters()` (test hook). `dummy.practice('danger'|'parry')` = slow ×1.5 tells swing; the v3
   `enemies.practiceAttack(entity)` keeps v3 timing (legacy decal through the tells adapter) so story/playtest2 stay unchanged.
8. **Time**: enemy logic dt = step dt × `assist.enemySpeed` (tells times the windups on `game.enemyTime`); per-entity hitstop skips the whole update while
   `e.hitstopUntil > game.realTime` (tells extends the frozen handle); `scaling.js` DIFFICULTY_FALLBACK gains `story`, `telegraphMul` = 1 everywhere,
   `checkAddSec` (+ `checkAdd` alias); `ctx.tele` no longer multiplies anything.
9. **Perf**: `enemies.substeps = true`; poses / springs / `model.update` / icons only on `game.frame.lastStep`; animation half rate 30–60 m, paused > 60 m
   (camera distance); `game.render.warm(e.object)` on the first spawn of each type+variant; wander allocations removed; tell shapes are per-entity reusable
   objects; `separate()` unchanged (no `new`; the sampled "allocation" there is V8 heap-number churn).
10. `enemies.js`: `import * as GolemMod from './enemies/golem.js'` (`GolemMod.createGolem`, `GolemMod.prewarmGolem?.(game)`).

Korean player text lives only in `codex.js` (entity names via `typeName`); remaining Korean in mobs files: the v3 `'붕괴!'` canvas word texture
(`common.js`) and `GOLEM_INFO` (bosses data kept in `enemies.js` for the golem) — both exempted in the rule-6 check and listed here.

## Measured (branch, SwiftShader, 640×360, prod=1&governor=0&seed=1)
- `node tools/playtest4.js mobs`: **116 passed, 0 failed** (≈ 28 s). M1 per attack (tellStart → damage, hold before the strike):
  boko swing 0.80 s / hold 0.32 s* · boko leap 1.25 / 0.12 · shaman orb (cast 1.0) · chuchu lunge 0.78 / 0.12 · chuchu aura 0.50 (check class) / 0.12 ·
  lizard thrust 0.80 / 0.12 · lizard lunge 0.93 / 0.12 · shroom lob 1.90 (+ cloud tick) / 0.12 · wolf bite 0.90 / 0.12 · wraith bolt (cast 1.0) / 0.12 ·
  voidknight combo 0.80 / 0.55 / 0.65 · slam 1.10 · bash 0.55 — every id ≥ its §5.7 floor; hitbox ±0.3 m correct for every non-projectile shape.
  (*longest still run; includes the converged anticipation.)
- Orbs: last homing turn at 0.50 s, max turn rate 36°/s (limit 120°/s), shaman 7.5 m/s; sideways walk at 5.5 m/s from 10 m dodges; `orbEta` within
  0.11 s of the real arrival; 10 orbs requested → 6 alive.
- Animation rate: 60 / 30 / 0 pose updates per second at < 30 m / 30–60 m / > 60 m.
- `enemies.update` with the 12-mob F roster (armoured, attacking): median **0.30 ms**, p95 0.90 ms per frame (host CPU, render off).
- Enemy-owned FX ≤ 1.0 screens p95 in B-* and the C6 draw-call rows are integration (I) checks — not measured here; enemy FX now go through
  `owner:'enemy'` (enemy style) and orb visuals shrank (halo 1.3→1.1, 2.6→1.9 m, trails 0.42→0.3 m wide, emitter 32→18/s).

## Legacy tests (this branch)
- `tools/bootcheck.js` exit 0 (all configs playing, no console errors). `tools/playtest.js --quick` all PASS. `tools/playtest2.js --only sword` 0 FAIL
  (full run earlier: story/settings/perf unchanged). `tools/playtest3.js enemies`: **139 passed, 0 failed, 1 skipped**.
- §7.9: `tools/playtest3/enemies.js` gained "§4 windups: tellStart → damage" (bokoblin.swing, lizard.thrust, voidknight.combo1 = 0.80 s). The boss
  checks are unchanged: `docs/v4/requests/bosses.md` did not exist when this branch was built, so no new boss expectations were applied.

## P1
- Cut: alpha-wolf hesitation after the alpha dies (codex does not mention it), shroom "hit the cap during the windup pops the sac", wolf crack pulse
  driven from behaviour (mobmodels' `pose('windup')` offers it; the behaviour pose code drives the v3 pivots). Fallbacks: v3 behaviour.
