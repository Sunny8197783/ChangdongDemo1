# Requests from ui

Everything below is feature-detected by ui. Nothing crashes when it is missing; the named widget falls back.

## narrative (story / audio)
- Class choice: call `game.ui.openClassPanel({ onPick: cls => … })` in the `choose` stage. The panel already asks "…의 길을 걷겠습니까?" through
  `ui.confirm`, so `onPick` is the final answer. `onCancel` is called when the player backs out (Escape).
- Persist the one-time tips / tour: include `game.ui.serializeTips?.()` in `story.serialize()` and call `game.ui.deserializeTips?.(arr)` on load.
- Victory: the screen reads `victory {stats}` (`kills`, `reactions`, `timeSec`, `maxCombo`) and the final boss name from `bossDefeated {final:true, name}`.
- audio: ui plays `skill_learn` (tree learn), `level_up` (level-up card) and `ui_deny` (rejected learn/equip), plus the existing `ui_click`/`ui_select`.

## enemies
- `bossSpawn` payload: please include the entity as `boss`, plus `title`, `sub`, `phases[{at, name}]` and `parts[{id, name}]`. The bar follows
  `payload.boss` (fallback `enemies.boss`). Part hp is read from `boss.getPart(id)` or from `boss.parts[]` entries `{id, hp, maxHp, alive, lock:{element}}`.
- `bossPhase {id, phase (1-based), name}`; `bossDefeated {id, name, final}`.
- Optional: `entity.weakness` (element id or array) on elites/bosses → weakness icons on the enemy bar; `entity.isElite` for the elite bar style.
- `getObjective()` may return `{title, desc, progress}` directly; otherwise ui uses the v2 camps/boss shape with the boss's own name.

## player
- `getDefenseHud()` `dodgeName` / `defendName` (Korean kit names) label the Q/E row; `player.regen` `{active, delay, delayLeft, disabled}` drives the regen strip.

## combat
- `previewReaction(target, el)` must stay allocation-free (called at 10 Hz on the locked target). ui reads `REACTION_DEFS[].match.aura` to pick the
  aura pip to highlight, `FAMILIES[f].color/nameKo` for hint and banner colours, and `isBroken(t)`.

## skills
- ui reads `skills.trees/nodes/defs/loadout/attuned`, `tooltip(id, {rank})`, `equip`, `canEquip`, and `getHudState()` v3 with
  `signature.kind/value/max/extra` and `gift`. `ui.skillTreeOpen` is true while the tree is open (game paused), for the equip rule.

## world
- Gate list: `ui.openGateMenu(list, onPick)` as world/gates.js already calls it. `world.respecSpots` drives the 30 m unspent-points tip.

## core
- None blocking. (`treeClosed` and `altarLeave` are emitted by ui as requested.)

## skills (tests)
- `tools/playtest3/skills.js:131` assigns `ui.skillTreeOpen = true`. ui keeps that working (a test-only override flag behind the getter), but
  prefer `game.ui.openSkillTree()` / `closeSkillTree()`, which also pause the game and lock input exactly as in play.
- With the override in place, `skills.js:133-134` ("refuses in the tree after recent damage") fails in the merged tree: at `game.time ≈ 0.1` the test
  writes `player.lastHurtT = g.time - 2` but reads back `-1e9` (player's setter / regen reset), so the 5 s rule sees no recent damage.
  Suggest stepping a few seconds first (so `g.time - 2 > 0`) or checking the setter (player owner).
