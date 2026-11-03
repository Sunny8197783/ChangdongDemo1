# ui — module notes (v3, wave 1)

Files: `src/ui.js` (factory `createUI(game)`), `src/ui.css`, `src/ui/*`:
`dom.js` (h/esc/formatKeys/anim queue), `text.js` (**all Korean UI strings**: tree, tour, tips, codex families, HUD, boss/victory cards,
controls panel rows, class/character labels), `icons.js` (9-element glyphs + void/physical, archetype glyphs `ARCH_GLYPH`, class silhouettes
`CLASS_SIL` by style, chain/shard icons; `ELEMENT_CSS` built from `elColor`), `skillTree.js`, `treeTour.js`, `hotbar3.js`, `bossbar.js`,
`prompt.js`, `gateMenu.js` (gate list + `createConfirm`), `classPanel.js`, `character.js`, `codex.js`, `settingsMenu.js`.
Static imports: own files, `src/core/*`, `three` only (rule 7). The tree's data fallback is `await import('../skills/trees/index.js')` in try/catch.
Checks: `node tools/playtest3.js ui` (≈ 35 s, 121 checks with the wave-1 modules merged; skills/combat/player-dependent checks SKIP when absent).

## Public API (`game.ui`, CONTRACT §18)
- `openSkillTree(el?)` / `closeSkillTree()` / `skillTreeOpen` · `openCharacter()` / `closeCharacter()` / `characterOpen` ·
  `openCodex(page?)` / `closeCodex()` / `codexOpen` (v2 `setGrimoire(on)` / `grimoireOpen` are aliases) ·
  `openClassPanel({onPick, onCancel?, current?})` / `closeClassPanel()` / `classPanelOpen` ·
  `openGateMenu(gates, onPick)` / `closeGateMenu()` / `gateMenuOpen` (`gates = [{id, name, zoneId, zoneName, reached, current}]`; onPick only for reached, non-current gates) ·
  `confirm(text, onYes, onNo?)` (Enter = yes, Escape = no) · `startTreeTour()` · `tip(id, text) → boolean` (one time per id) ·
  `serializeTips()` / `deserializeTips(arr)` (for `story.serialize`) · `anyModalOpen` · plus the v2 `toast`, `showBanner`, `showCard`,
  `flash`, `hint`, `queueTutorial`, `openSettings`.
- Emits `treeClosed {}` when the tree closes and `altarLeave {from:'class'|'gate'}` when the class panel / gate list closes (save.js autosave triggers).
- Test-only introspection: `_parts` (tree, tour, charSheet, codex, classPanel, gateMenu, confirmBox, prompt, hb3, bossBar) and `_cardLog`.

## Modals
One registry (`MODALS` in ui.js, Escape priority: confirm → tour → settings → controls → gate → class → tree → character → codex).
`syncModalLock()` = `input.lock('menu')` while any modal is open, plus the pause panel. The pausing menus (`gate`, `class`, `tree`, `character`,
`codex`) call `game.pause()` when opened from `playing` and `game.resume()` when the last one closes. Opened from the pause menu, they return to it.
K / C / Tab toggle (and switch between) the three menus, read through `input.raw`. `applyState` closes the menus when the state leaves
playing/paused. The class panel survives `dialogue`/`cutscene`, because story opens it from a talk.

## HUD
- **Hotbar:** `activeSkills().getHudState()`. When `hs.v === 3`, `hotbar3.js` draws 9 slots (LMB RMB 1–4 X G R): archetype glyph on an element
  frame, cooldown sweep, cost in MP/투지, low-resource tint, charges, the empty-slot state, the awakening ring on R and the V gift prompt from `hs.gift`.
  It also draws the attune gem arc from `hs.elements` (the attuned gem is big and glowing; 0-point elements are dimmed with a lock; points
  under each gem) and the signature widget from `hs.signature.kind` (attunement = 3 연쇄 orbs, enchant/focus = bar, seal = pips, familiars = icons,
  marks = count). Otherwise the v2 renderer runs, with the 5 classic gems.
- **Vitals:** HP / resource / stamina from `player.maxHp/maxMp/maxResolve/maxStamina`. `data-res="mp|resolve"` and `data-fam` sit on
  `.aw-vitals`/`.aw-hud` (no class ids). A regen strip under HP shows the delay progress from `player.regen.delayLeft/delay`, and the HP bar
  shimmers while `regen.active`. Level badge on the heart, a thin XP bar, the "[K] 스킬 포인트 N" pip, the level-up card with a gold ring burst
  and the `level_up` sfx, and "+N XP" numbers at the kill position (from `kill`/`damage`).
- **Enemy bars:** `STATUS_KEYS` come from `combat.STATUS_DEFS` (minus `playerOnly`; fallback: the old 7), plus the `voidShield` pseudo-pip.
  Stack statuses show digits. The break gauge shows when `breakMax` is set, the broken state comes from `combat.isBroken`, and weakness icons come
  from `entity.weakness` (string or array, optional). "다음 타격" runs at 10 Hz from `combat.previewReaction(aimTarget, skills.attuned)`; the
  reacting aura pip is highlighted in the family colour. Pips, break and hint DOM are written at the 20 Hz tick; position and hp per frame.
- **Boss bar** (`bossbar.js`): name, title, sub, phase pips and parts come from the `bossSpawn` payload. It follows `payload.boss`, else
  `enemies.boss`. It shows the `bossPhase` name, the break gauge, the void overlay, part sub-bars with lock element icons (`boss.getPart(id)` or
  `boss.parts[]`) and a `lockStripped` flash. No boss names in code; fallback text is in `text.js` (`BOSS_KO`). Boss cards: spawn = `title|name|sub`,
  defeat = `격파|payload.name`.
- **Prompt** (`prompt.js`): one "[F] label" from `interactChanged` / `interact.current()`, hidden in menus and cinematics. ui never reads F.
- Flashes for `break`, `resonance` (교향!), `bossCheck` start/success/fail and `bossPhase`. Reaction banners carry the family colour.
- Delayed cards use a UI-clock queue (`later()`, realDt) instead of `setTimeout`, so stepped tests stay deterministic.

## Menus
- **Skill tree** (`skillTree.js`): a ring of 9 sigils around the class emblem (primary gold, secondary silver, locked grey with a chain and the
  tooltip "◯◯·◯◯ 직업만 사용 가능" from `classesForElement`). A click zooms (CSS) into the constellation: 5 tier rows (the rune ring lights when the
  gate is met; struck through above `tierCap`), nodes at `pos.col/row`, SVG prerequisite lines (lit/open), "택1" tags between exclusive pairs.
  Node states: locked / avail (pulse) / nopts / learned / maxed / excl (crossed) / story (shard) / tierlock / planned.
  The detail panel shows name, type/tier/rank/cost badges, skill slot + MP·투지/cooldown, description, current → next (`skills.tooltip` or
  `descRank`), the modifier target, a caster/melee look note, the reactions it feeds, the gate reason, learn/unlearn and equip buttons.
  The header shows points (+ planned cost), mastery chips, respec status + 전체 초기화 (through `ui.confirm`), 직업 변경 at the altar
  (`canChangeClass` → class panel → `progression.changeClass`) and the planner toggle. The planner keeps a local rank map and evaluates the
  same rules as `progression.canLearn`; it never learns or equips. Quick-slot bar: drag a node onto 1–4/X/G, click a slot with a selected node,
  or hover + press 1–4/X/G → `skills.equip`; a rejection shows the `canEquip` reason. Learning plays a star flare + `skill_learn`.
  With skills stubbed it imports the tree data and calls `progression.registerTrees` (only if progression has none), so learning still works;
  if that import fails too it shows "스킬 데이터를 불러올 수 없습니다".
- **Tour/tips** (`treeTour.js`): 3 pages on the first tree open (not automatic in `?test` unless `&tour=1`). Tips: story-gated capstone, first
  exclusive pick, first mastery rank-up, unspent points within 30 m of a respec spot, first point after the class pick; skills' `emptySlot` tip.
- **Character** (C), **codex** (Tab: 6 families + 보편, "N / 49", family jump chips, animated mini icons per family, silhouettes "물 + 번개 …?",
  page 2 = learned skills by element), **class panel** (6 cards: silhouette, fantasy line, weapon, signature, gold/silver element chips, stat
  radar; "이 길로 간다" → confirm → `onPick(cls)`), **gate list**, **confirm**.
- **Settings:** new rows 난이도 (names from `settings.DIFFICULTY`), 화면 흔들림, 피해 숫자 표시 (`damageNumbers` off hides damage numbers), 효과 품질.
- **Controls panel** rebuilt from `CONTROLS` (K, C, Z, X, V, 1~4; F = 상호작용); `formatKeys` wraps the new keys. Title: 이어하기 when `save.has()`;
  모험 시작 / 새 게임 → `newGame({clearSave:true})`; the title shows all 9 element gems.

## Perf
All DOM is built once (tree constellations lazily on the first open, ~180 nodes). Per frame: vitals, charge ring, numbers, bar positions.
20 Hz: hotbar, defense, statuses/break/hint DOM. 10 Hz: `previewReaction`. 4 Hz: objective/markers. No layout reads in the loop (the codex
family jump reads `offsetTop` on click only). No draw calls, no materials.
