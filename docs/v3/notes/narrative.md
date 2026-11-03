# narrative — module notes (v3, wave 3)

Files: `src/story.js`, `src/story/{quests,script3,classSelect}.js` (new), `src/story/{script,npcs,ui}.js` (changed),
`src/cinematic.js`, `src/cinematic/{reveal,acts,finale,spirits9}.js` (new), `src/cinematic/{assets,ceremony,finisher,intro,overlay}.js` (changed),
`src/audio.js`, `src/audio/{sfx3,themes3}.js` (new), `src/audio/{music,themes,sfx2}.js` (changed), `tools/playtest3/narrative.js`.
Static imports: own files, `src/core/*` and `three` only (rule 7). Everything else is reached through `game.*` and feature-detected.

## Story (`game.story`, CONTRACT §17)
- **Stage table** (`story/quests.js`):
  - `QUESTS`: 17 stages with Korean titles, `objective(S, game, H)`, `markers(S, game, H)`, `kind`, `boss` and `xp`. `xp` is a number, or a
    function for region quests, which pay act-2 or act-3 XP depending on the play order.
  - Also exported: `STAGES`, `TITLES`, `REGIONS`, `REGION_OF`, `BOSS_OF_STAGE`, `SPIRIT_OF_BOSS`, `MIN_LEVEL`, `ACT_OF`, `TRAIN_STEPS`,
    `ASCENT_STEPS` (5 points: ruins gate → 2 updrafts → ledge rim → ledge), `nextStage(id, S)` (branch-aware) and
    `stagesBefore(stage, order)`.
  - story.js never hard-codes the stage order.
- **Branches:**
  - After `reveal` (talk to 이솔데), entering Mirwen or Elderwood starts that region. Entry is detected through `zoneEnter`, `gateTravel`
    or a 4 Hz zone check.
  - `story.regionOrder` (a readable array) records the order.
  - After a region's last boss, the other region starts. After both, `ascent` starts.
- **Bosses:**
  - `bossSpawn` and `bossDefeated` are filtered by id. Only the current stage's boss advances the stage.
  - A boss stage starts its fight when the player walks into `world.bossArenas[id]` (radius + 8, and not far below a raised arena).
    `cinematic.playBossIntro(id, onDone, {spawn, valid})` fades out, awaits `enemies.prewarmBoss(id)`, then calls story's spawn.
    No intro starts for a boss that `enemies.bosses.has()` does not know, so a missing bosses folder never loops the intro.
  - Act bosses: `addPoints(1, id)`, `freeSpirit(el)`, full HP/MP/stamina and the quest XP. Then `playSpiritFreed(el)` plays and the spirit
    NPC appears at its shrine.
  - Golem: `breakSeals()`, the stage becomes `reveal` at once, then `playReveal` plays.
  - Nidhoggra (`final:true`): stage `ending` → `playEnding` → `victory {stats: enemies.getRunStats()}`, emitted **once** (`S.victoryEmitted`)
    → `setState('victory')`. `story.continueEpilogue()`, or a victory → playing state change, moves to stage `done`.
  - Story no longer listens to `victory`.
- **Class choice** (`story/classSelect.js`):
  - In the `choose` stage, talking to any of the 6 mentors at the altar plays that mentor's pitch, then opens
    `ui.openClassPanel({current, onPick})`.
  - Without ui (stubbed or missing), a 6-option dialogue `ask` appears instead, plus a "later" option.
  - The pick runs `progression.setClass` → `player.setClass` → `cinematic.playClassRite(cls)` → `training`. It also shows the
    `firstPoint` tip ("K: 스킬 트리…").
  - After training, a mentor of another class offers **직업 변경** (`ui.confirm` → `progression.changeClass`, altar only).
- **Training** steps: `basic ×5 → charged → quick → defend → dodge → learn`.
  - Steps count from `skillCast` only; the slot comes from `skills.defs`. `spellCast` is the fallback, used only while skills is stubbed.
  - defend: `blocked`, `parry`, `counterStance`, `counter`, `focusStart`, `wardBreak`, or holding defend.
  - dodge: `dodge`, `blink`, `dash`, `perfectDodge`.
  - learn: `skillLearned` followed by `loadoutChanged`. Without skills, `skillLearned` alone counts.
- **NPCs** (21):
  - The 9 v2 villagers, the 4 new mentors, 이솔데 (sage), 하람 (trainer), 나엘 (lakeKeeper) and 모모 (forestChild).
  - The spirits 운디나, 실바니아, 녹스 and 루미엘 stay hidden until freed, then appear at their shrines.
  - Spots come from `world.village.npcSpots`, `world.zones[].npcSpots` and `world.shrines`, else the DESIGN §8.3 coordinates.
  - New NPCs use a **merged** model: body + head in 1 mesh, 1 outline and an optional glow.
  - Talk goes through `game.interact.offer('npc:'+id, …)` (label "이름과 대화하기"). Without `game.interact`, the v2 F prompt is used.
    `story.hasPrompt()` is the shim `!!interact.current()`.
- **Elderwood escort:** talking to 모모 makes her follow the player (simple steering; she catches up after gate travel). The stage moves
  to `nox` once the 3 rot walls are cleared (`world.rotWalls`, `rotWallCleared`) and 모모 is at 실바니아's grove.
- **Mirwen:** the 나엘 talk is optional. Reaching 운디나's shrine (within 5 m, or `shrineFound`/`shrineUse spirit_undina`) starts `hydra`.
- **Ascent:** each step pays 900 XP. The last step starts `kalis`.
- **Reaction trainer (P1):**
  - The 반응 수련 허수아비 spawns lazily at `village.reactionDummy` (0 XP) and cycles element auras every 5 s.
  - It never spawns in `?test` unless `story.spawnReactionTrainer()` is called.
- **Ambient lines (P1):** per-phase keys `early/training/updraft/camps/boss/act2/act3/act4/done`, with fallbacks. The epilogue lines
  are the `done` phase.
- **API:**
  - Read-only: `stage`, `regionOrder`, `ascentStep`.
  - `debugSkip(stage, {silent, order, second})` covers every stage:
    - It sets the default class, seals, spirits, points and level (≥ 9 / 15 / 21 / 25).
    - It teleports to the zone and prewarms the act boss behind a fade (instant in tests).
    - It stops a running cinematic and despawns a boss that belongs to another stage.
  - `debugComplete()` finishes the current non-boss objective; on a boss stage it spawns the boss.
  - Flow: `startBossFight()`, `pickRegion(r)`, `continueEpilogue()`, `currentBossId()`.
  - Save: `serialize()` / `deserialize(o)` cover the stage, branch order, flags, training, ascent step, feather and
    `tips: ui.serializeTips()`.
  - Dialogue and test helpers: `talkTo`, `advance`, `choose`, `getDialogueState`, `bark`, `banner`.
- Story calls `world.setActVisible(ACT_OF[stage])` on every stage start.
- **Test isolation:** story cinematics (rite, reveal, spirit freed, boss intro, ending) play by themselves in normal play. In `?test`
  runs they play only with `&cine=1` or `story.autoCinematics = true`; otherwise the stages still advance, with no cutscene. This keeps
  other owners' playtests (which emit `bossDefeated` or kill the golem) from stalling. The narrative section opts in.

## Cinematic (`game.cinematic`, CONTRACT §16)
- `playClassRite(cls, onDone)` (ceremony.js) shows only the spirits of `CLASS_DEFS[cls]`: primaries big in front, secondaries small
  behind. `playBlessing` is the shim.
- `playReveal` (reveal.js, ≈ 28 s): the core rune, 테라곤's memory, then a wisp along a root-channel spline to the plateau. There, an
  instanced wyrm silhouette (`assets.makeWyrm`, 1 draw call) carries the 5 oath shards under a greying crown.
- acts.js holds `playSpiritFreed(el)`, `playBossIntro(id, onDone, {spawn, valid})` and `playPhase(id, phase)`:
  - All three are parametric. `BOSS_CAM` holds the per-boss camera data: focus height, radius, sweep, fov, voice and grade.
  - The intro freezes the game (`cutscene`) behind the fade while prewarming, then returns the camera to where it was.
  - `playPhase` runs in gameplay mode: a slow-motion orbit with the phase name, ≤ 3.3 s.
- `playFinale(onDone)` (finale.js) runs in gameplay mode:
  - Time slows and the 9 colours gather into the weapon.
  - **One input** (LMB, R, X or Space; automatic after 0.5 s in tests) lands the strike.
  - 0.4 s of music silence, then a white flash and a light burst.
  - `onDone` fires at the impact, so `bossDefeated` and the dissolve run under the burst.
- `playEnding` v3: golden pollen over the plateau, the crown blooms, a time-lapse (Mirwen, Elderwood, the plateau), the festival,
  credits (6 mentors, the new NPCs, 9 spirits), 끝. Music: `ending_v3`.
- `finisher(o)` keeps its signature:
  - `o.element` is any of the 9 or `'symphony'`. `o.cls` sets the tag (from `CLASS_DEFS`).
  - The new elements and `'symphony'` get bespoke set pieces from `spirits9.js`: water leviathan, eternal forest, dawn wings, raven lord
    and the symphony ring.
- New API: `subtitle(text, sec, speaker)`, `burstAt(point, element)`, a `mode` getter (`'gameplay'|'world'|null`), and
  `SPIRITS` (5) / `LOST_SPIRITS` (4) / `SPIRITS_ALL` (9). In `overlay`, `ELEMENT_GRAD` and `ELEMENT_GLYPH` cover the 9 elements plus
  physical, symphony and void.
- Perf:
  - Every set piece lives in a per-cinematic Stage, disposed on end.
  - It is built from sprite, rune, pillar, mist, motes and instanced-silhouette programs that `init()` warms (+1 program at boot).
  - No lights.
  - The test asserts that reveal, the intro and the ending compile no new programs.

## Audio (`game.audio`, CONTRACT §20)
- `audio/sfx3.js`:
  - `cast_`, `impact_` and `explode_` recipes for water, nature, light and shadow.
  - Weapon sfx: `bow_draw`, `bow_release`, `arrow_whizz`, `hammer_swing`, `hammer_hit`, `shield_block`, `dagger_swish`,
    `totem_rattle`. They play once per `skillCast`, chosen by `styleOf(cls)`.
  - UI cues: `level_up`, `skill_learn`, `skill_unlearn`, `tree_open`, `slot_equip`, `xp_tick`, `codex_new`, `regen_start`,
    `gate_travel`, `ui_deny`.
  - Reaction cues: the family recipes `rx_burst`, `rx_control`, `rx_spread`, `rx_surface`, `rx_blessing`, `rx_curse`, plus
    `resonance` (an arpeggio) and `break_gong`.
  - Boss voices (P1): `hydra_roar`, `treant_groan`, `nox_voice`, `kalis_voice`, `wyrm_roar`.
  - The misc cues other owners call: `wolf_howl`, `splash`, `throw`, `swing`, `rock_smash`, `vine_hit`, `holy_chime`, `gate_awaken`,
    `shrine_seed`, `shrine_found`, `crystal`, `firework`.
- `reaction` lookup order: `RX_CUES[id]` (a [recipe, pitch] pair, distinct per id) → `RX_FAMILY[payload.family]` → the generic
  `reaction` cue. All 49 ids resolve.
- The charge loop base is `ELEMENT_DEFS[el].sfxBase × 0.5`. Music ducks on crits and ultimates. `silence(s)` cuts the music bus.
- **Music** (`audio/themes3.js`):
  - New themes: `mirwen`, `elderwood`, `sky`, `final_boss` and `ending_v3`.
  - `final_boss` layers by `music.bossPhase`. Broken shards add their leitmotifs, read from `lockStripped` and `shardBuff`.
  - `pickMode` order:
    1. the forced theme;
    2. the victory sting;
    3. a boss (`final_boss` for nidhoggra);
    4. battle;
    5. `world.getZoneAt(player).music` (the plateau plays `sky` until the wyrm rises);
    6. the v2 village/field rule.
- **Victory:** the fanfare plays on `bossDefeated {final:true}`. The `victory` event plays nothing new.
- Test hooks: every requested cue is logged, even while silent. Hooks: `audio.cueCount(name)`, `audio.lastCues`, `audio.fanfareCount`,
  `audio.wantedMode()`, `audio.musicLayer`.

## Measurements
bootcheck (640×360, medium):
- Default config: 271 calls / 830k tris / 142 programs. Before narrative v3: 257 / 775k / 141.
- Village with all 15 village NPCs: ≤ 290 calls, asserted in playtest3.

## Tests
`node tools/playtest3.js narrative` takes ≈ 40 s: 3 boots, 153 checks. It covers:
- static checks: rules 7/8/9, the removed path dialogue and the removed victory listener;
- golem → reveal, and the reveal talk with the elder line;
- both branch orders reaching ascent;
- the escort, the shrine, and the proximity boss intro;
- the ascent steps;
- debugSkip + killBoss for every boss stage (spirits, points);
- final → finale → ending → exactly one victory, after bossDefeated{final}, with the fanfare;
- serialize / deserialize;
- every cinematic: skippable, state restored, no new programs;
- the finisher for all 9 elements + symphony;
- audio: recipes, rx coverage, cues, zone music, offline renders;
- village draw calls and the reaction trainer;
- the class pick, with the ui panel and with the dialogue fallback (`&stub=ui`);
- training counted per `skillCast`.

## Not done / fallbacks
- Bespoke per-boss intro shots (P1): every boss uses the parametric intro with its `BOSS_CAM` row.
- The 2 sage / lake-keeper side requests in the act-4 XP budget are not built. The ascent pays its 5 × 900 XP.
- The feather's +20 stamina uses a `story:feather` stats source with the key `maxStaminaAdd`, which needs core (see requests). It also
  does a direct `player.maxStamina += 20`, which a later `statsChanged` refresh may overwrite.
