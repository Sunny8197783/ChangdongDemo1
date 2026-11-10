# mobs → other owners (v4 requests)

## bosses
- `base.js` (append-only) now also exports `beginAttack(ctx, e, id, shape)`, `stopAttack`, `liveAttack`, `attackPhase(h, off)`, `windupK`, `RHYTHM`,
  `punishAfter`, `canAttack`, `shapeHit`, `attackMeta`, `rhythmDamp`, `modelFor`. `beginAttack` reads `codex.ATTACK_SPECS` — for boss ids call
  `game.tells.attack` directly (or add your own spec table) since ATTACK_SPECS only holds mob ids.
- `ctx.meleeCheck(e, range, halfAngle)` is now an exact cone test through `tells.hitTest` (no +radius 0.4, no d < 1 m any-angle hit): widen your ranges by
  the lunge if you relied on the old slack. `ctx.slam(center, r, {handle?, shape?, attack, jumpAvoid})` hits only inside the handle/shape (jumpAvoid: feet − ground > 0.6 m).
- `ctx.projectiles.orb(origin, el, source, {speed, homing, attackId|attack})`: speed is capped at 10 m/s when `source.isBoss` (8 otherwise), homing ≤ 0.5 s
  at ≤ 120°/s; ≤ 6 enemy orbs alive across mobs and bosses. `boulder()` telegraphs through `ctx.tele` (tells legacy adapter) instead of `ctx.telegraphs.show`.
- Please create `docs/v4/requests/bosses.md` with the playtest3 boss expectations you want in `tools/playtest3/enemies.js` (none existed at build time).
- `makeEnemy` now gives every entity `weakness/resist/immune` (from `codex.WEAK`, empty for bosses), `attacks` (empty for bosses), `debugAttack`,
  `timeMul`, `rimSource/tellAnchor/flashUniform` forwards — overwrite them on your entities.

## ux
- Story training: prefer `dummy.practice('danger' | 'parry')` (slow ×1.5 tells swing, returns `{kind, eta, source, tell}`); the v3
  `enemies.practiceAttack(entity)` keeps v3 timing for compatibility.
- `enemyEncounter.type` is the codex key: `chuchu:<variant>` for element 말랑이 (`enemies.codex()` has an entry for each), `bokoblin`, … .
- Codex entries carry `weakKo` (display string) besides `weak:[{el, mul}]`; `parryKo` exists on attacks (and on the entry for convenience).

## core
- `enemies.update` uses step dt × `assist.enemySpeed` (the same scale as `game.enemyTime`); a pure `enemyTime`-delta clock changed the legacy playtest2
  sword timings, so it was not used. No action needed.

## Resolution (core integration, wave C round 1)
- bosses (base.js exports, exact `meleeCheck`, orb caps, `docs/v4/requests/bosses.md`, entity fields): **done** — bosses wrote the requests file and use `game.tells.attack` with their own spec table (`bosses/codex.js`).
- ux (story training `dummy.practice`, codex keys, `weakKo`/`parryKo`): **done** on `ux-b` (feature-detected).
- core: none.

## Fix round 1
- **ux** (`src/ui/monsters.js` `nextThumb`): `await game.enemies.bossesReady` before `previewModel(type)` (or do not cache a null
  thumbnail): when the codex is opened right after boot the boss import is still pending, the 5 boss thumbnails are cached as null
  and stay glyphs for the session. `previewModel('chuchu:<variant>')` now returns the variant model (fixed on `v4/mobs`).
- **ux** (UX1 thumbnail check): count every codex key in the denominator (`Object.keys(game.enemies.codex())`, 22), not only the
  keys whose `previewModel` is non-null.
