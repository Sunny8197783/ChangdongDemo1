# Requests from narrative

## core
- `game.stats`: support an additive `maxStaminaAdd` key in `derived().maxStamina`. Story sets the source `story:feather {maxStaminaAdd: 20}`
  for the 바람 깃털 reward. Today the direct `player.maxStamina += 20` is lost on the next `statsChanged` refresh.
- Integration (playtest2): the path-dialogue section must use the class panel instead (`&cls=none` → talk to a mentor →
  `ui._parts.classPanel.pick(cls, {noConfirm:true})`). With ui stubbed, use `story.talkTo(<mentor>)` + `story.choose(k)`.
  The golem step now expects stage `reveal`, not victory. The reveal cinematic follows and can be skipped with `cinematic.skip()`.
- `bootcheck`: `&quest=final&boss=nidhoggra` now really skips to `final` (level 25, all spirits freed). Expect stage `final`.
  The `@noBosses` config with that URL stays in `playing`: story never starts a boss intro for a boss the registry does not have.

## ui
- Victory screen: add a "에필로그 계속" button that calls `game.story.continueEpilogue()` (stage `done`, free roam). Today only
  "새로운 모험" (restart) exists. Story also moves to `done` on any victory → playing state change.
- The story hides its own F prompt whenever `game.interact` and ui exist. ui's `prompt.js` renders the NPC talk label
  ("<이름>과/와 대화하기", offer id `npc:<id>`).
- Optional: play `game.audio.play('tree_open')` when the skill tree opens. Audio has the recipe, but no event exists for it.

## enemies
- None blocking. Story spawns act bosses through `enemies.spawnBoss(id)` after `cinematic.playBossIntro` has awaited `prewarmBoss(id)`.
  `cinematic.subtitle(text, sec)` and `cinematic.mode` exist as requested. `playPhase` calls `onDone` (≤ 3.3 s).

## world
- None. Story calls `world.setActVisible(act)` on every stage start. It reads `village.npcSpots`, `zones[].npcSpots`, `shrines`,
  `rotWalls`, `bossArenas`, `gates` and `village.reactionDummy`.
