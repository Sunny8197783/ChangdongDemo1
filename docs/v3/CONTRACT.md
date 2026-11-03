# Arcane Wilds v3 — Binding Technical Contract (CONTRACT.md)

This contract is **binding** (revision **v3.1**). It extends `ARCHITECTURE.md`: the v1 and v2 sections stay valid unless this file overrides them.
Game design and numbers live in `docs/v3/DESIGN.md`. If DESIGN and CONTRACT disagree on a number, DESIGN wins. If they
disagree on an API, CONTRACT wins.

General rules (they apply to every owner):
1. **One owner per file.** Never edit a file you do not own. If you need something from another owner, use the API in
   this contract. If the API is missing, **feature-detect** it (`game.x?.fn?.()`) and fall back gracefully.
   - Write requests to **your own** file `docs/v3/requests/<owner>.md`.
   - Write module notes to **your own** file `docs/v3/notes/<owner>.md`.
   - Core creates both directories, with an empty file per owner, in wave 0. Nobody edits `ARCHITECTURE.md` except core.
     The integration step concatenates the notes into it.
2. **Data over code.** Element-, class-, skill- and reaction-specific numbers go in data tables
   (`src/core/elements.js`, `src/core/classes.js`, `src/skills/trees/*.js`, `src/combat/reactions.js`,
   `src/combat/statuses.js`). Nobody loops `for (i<5)`, and nobody hard-codes an element list. Iterate the registry.
3. **Perf rules** (§23 and ARCHITECTURE §Performance):
   - No per-frame allocation. Use pools.
   - **No new lights.**
   - Pre-warm every new material.
   - Never flip `transparent`/`alphaTest`/`vertexColors` after creation.
   - Per-scene draw-call targets apply (DESIGN §12).
4. **Korean** for all player-facing strings. They live in data tables, not scattered through code.
5. **Every module still boots alone.** If a dependency is missing or a call throws, catch it, log it once, and continue.
6. Plain ES modules, no build step, vendored three r160. No new dependencies.
7. **Import rule (boot safety).** A file may **statically** import only:
   - (a) files of its own owner,
   - (b) `src/core/*`,
   - (c) `three` / `three/addons/*`.

   Anything owned by another owner is reached at runtime through `game.*`, or with `await import()` inside try/catch.
   `tools/bootcheck.js` has configs that rename `src/skills/` and `src/enemies/bosses/` away and assert the game still boots (§21).
8. **No class literals.** Use `familyOf(cls)`, `styleOf(cls)`, `CLASS_DEFS[cls].*` or the kit tables. Never compare a class
   with `'sword'` or `'mage'`. Acceptance check per owner: `grep -nE "=== ?'(sword|mage)'"` on your files returns nothing
   outside `src/core/classes.js` and `src/player/kits.js`.
9. **No 5-element assumptions in v3 code.** The legacy export `ELEMENTS` keeps its 5 entries (§3.1). v3 code iterates `ALL_ELEMENTS`.
10. **Worktrees.** Each owner works in its own git worktree, on branch `v3/<owner>`, created from the wave-0 commit. Owners commit only their own files.
    Merging is a plain octopus merge, which is conflict-free because file sets are disjoint and the notes and requests files are per owner.
11. **Priorities.** Every deliverable is tagged **P0** (must ship) or **P1** (may slip). An owner ships every P0 item before starting any P1 item.
    A P1 item that slips must leave a working fallback, never a stub that only passes feature detection.

---

## 0. Review resolution (v3.1)

| # | Finding (engineering review) | Where it is resolved |
|---|---|---|
| E1 | Static cross-owner imports break boot | Rule 7; `progression.registerTrees` (§4); dynamic bosses import (§14); ui fallback (§18); bootcheck configs (§21) |
| E2 | `ELEMENTS` changing to 9 breaks legacy code | `ELEMENTS` stays 5, `ALL_ELEMENTS` is the 9-element list, `elColor`/`elName` fallbacks, file:line audit list (§3.1) |
| E3 | Sky platforms vs `getHeight` (21 call sites) | Option (a): both arenas are on real terrain (the root plateau). Floating islands are scenery (§13). Platforms only for small stand-on objects |
| E4 | Agent scope too large | Wave 0 (core, serial) + 3 waves. P0/P1 per deliverable. Bosses folded into enemies, vfx into combat, audio into narrative (10 owners). Scope cuts: no spine running, 35 P0 reactions, a parametric preset recipe (§24) |
| E5 | Damage multipliers counted twice | One canonical formula, applied only in `combat.dealDamage`. `sword.js:121` atkMul is removed. `damageMul` = mastery only (§8.3) |
| E6 | `player.mods` migration | `player.mods` becomes getters over `stats`. Writers are converted in wave 1. `doubleJump` → `extraJumps` (§5) |
| E7 | Timed stats have no tick | `stats.update(dt)` in the frame order, lazy recompute, pooled sources (§2, §5) |
| E8 | Regen spec and test contradict | A precise per-frame rule; net-loss tracking via `onBeforeDamage`; `regenState()` (§10.3, §21) |
| E9 | Global slow-mo slot | Keyed `game.timeScale` stack; `slowmo` is a shim; compensated vs game dt listed (§3.3) |
| E10 | F key conflict | The ultimate moves to X. `game.interact` registry; skills never read F (§3.3, §6) |
| E11 | Double events | Exactly one emitter per cast and per element change; `silent` setters; a count test (§7.2, §9) |
| E12 | `applyStatus` signature / `hit.status` ambiguity | Signature kept, plus `extra:{stacks, source, power}`; `{dur, stacks}` schema (§8.1) |
| E13 | Binary class checks (~30 sites) | `familyOf`/`styleOf`; per-file audit list in each task; grep acceptance (rule 8, §24) |
| E14 | Shared-file contention | Per-owner notes/requests/playtest files; worktrees (rules 1, 10) |
| E15 | Shader/post ownership gaps | Core owns the toon `uDissolve` chunk and `game.post.pulse`; fx clones materials (§3.3, §20) |
| E16 | Mid-fight compiles | `setColorAt` at construction, no program-key flips, idempotent `prewarmBoss` everywhere, no new lights, a programs-count test (§23, §21) |
| E17 | 8×4 atlas vs square shader | 8×8 atlas at 128 px; `FRAMES` name map (§20) |
| E18 | Respec/save edge cases | `canUnlearn` gate reason; granted = 1 toward gates / 0 toward mastery; cleanup on unlearn; the save stores ranks and world state; points recomputed (§4) |
| E19 | Missing signatures | Taunt, stealth, threat, run stats, projectile blocking/reflect, `applyPreset`, `debugDefeat`, platform delta (§7, §13, §14) |
| E20 | Several hitFeel callers | Only `combat.dealDamage` calls it (§8.3) |
| E21 | Reaction cascades | Staggered queue, depth cap, index by trigger, a per-frame preset cap, pools from DESIGN §12 (§8.2) |
| E22 | Perf headroom | Per-scene targets, culling, the merged NPC pipeline, a reaction-heavy stress spot (§23, §21) |
| E23 | Victory flow loops | story drops its `victory` listener and filters by id; the fanfare plays on `bossDefeated{final}`; the defeat card uses the payload name (§9, §17) |
| E24 | Spirit gate vs new classes | Only capstones are gated (DESIGN §5.4); `tierCap` (§4) |
| E25 | Cinematic API mismatch | `finisher(o)` kept; `SPIRITS` stays 5 + `LOST_SPIRITS` (§16) |
| E26 | Stub contract | Full stub shape; registries exist after the factory (§2) |
| E27 | Status representation | `voidShield` numeric only; `st.el` tags; `freeNext`/`nextMul` in Mods; mage kind `attunement` (§5, §8) |
| E28 | Test hooks | Presets pick `a`, use `setRanks`, set ungate; `PT.dummyRing`, `PT.frameStats`; legacy configs need `unlock=all` (§21) |
| E29 | Equip rule contradiction | One rule; planner never commits (§7.2) |
| E30 | Platform scan perf | 8 m grid buckets; moving platforms dropped (§13) |
| E31 | Kill XP sources | `xpValue > 0` only; default `zoneLevel` 1; codex XP in the pacing table (§4) |
| E32 | Settings migration | Read v3, else copy v2 once; presets set `effectQuality`; difficulty key (§19) |

The design-review resolutions are listed in DESIGN §17.

---

## 1. File owners (v3.1, 10 owners)

| Owner (agent) | Files (owned exclusively) |
|---|---|
| **core** | `src/main.js`, `src/core/*` (existing `utils.js`, `progression.js`, `input.js`, `settings.js`, `stubs.js`, `events.js`; NEW `elements.js`, `classes.js`, `stats.js`, `save.js`, `keymap.js`, `debug.js`, `archetypes.js` (archetype + impl registry), `interact.js`, `timescale.js`), `tools/bootcheck.js`, `tools/playtest3.js`, `tools/playtest3/harness.js`, `tools/playtest3/core.js`, `tools/playtest3/fixtures/*`, `tools/playtest.js`, `tools/playtest2.js`, `ARCHITECTURE.md`, `docs/v3/notes/`, `docs/v3/requests/` (directory creation only) |
| **skills** | `src/skills.js`, `src/skills/*`: `runtime.js` (cooldowns, loadout, attune, cast pipeline, archetype ctx), `adapters.js` (legacy spells/sword bridge), `trees/fire.js … trees/shadow.js` (9 data files), `trees/index.js` (+ `PRESETS`), `classkits.js` (signatures: mage 원소 연쇄, sword 인챈트, ranger 집중 meter, paladin seal counter, spiritcaller familiars, shadowblade marks), `familiars.js`, `procs.js`, `talents.js`; `tools/playtest3/skills.js` |
| **combat** | `src/combat.js`, `src/combat/*` (existing `statusfx.js`; NEW `reactions.js`, `statuses.js`, `break.js`, `resonance.js`, `pipeline.js`), **plus all VFX**: `src/vfx.js`, `src/vfx/*` (NEW `vfx/feel.js`, `vfx/presets2.js`, `vfx/dissolve.js`, `vfx/telegraph.js`, `vfx/runes.js`, `vfx/smear.js`; the atlas in `vfx/textures.js`); `tools/playtest3/combat.js` |
| **magic** | `src/spells.js`, `src/spells/*` (incl. NEW `spells/zones2.js`, `spells/objects.js` for pods/crystals/mines/droplets/soul orbs/flowers/turrets/rods, `spells/archetypes.js` = **caster** implementations of all 24 archetypes, `spells/bespoke.js` = bespoke caster ultimates); `tools/playtest3/magic.js` |
| **melee** | `src/sword.js`, `src/sword/*` (existing; NEW `sword/weapons.js`, `sword/classmoves.js` (paladin + shadowblade movesets), `sword/elmoves2.js` (new-element basic/charged), `sword/archetypes.js` = **melee** implementations of all 24 archetypes, `sword/bespoke.js`); `tools/playtest3/melee.js` |
| **player** | `src/player.js`, `src/player/*` (existing; NEW `player/classes.js` (outfits + weapon props: bow, hammer, shield, daggers, totem), `player/kits.js`, `player/regen.js`, `player/resource.js` (투지), `player/springs.js`, `player/ik.js`, `player/poses.js`); `tools/playtest3/player.js` |
| **world** | `src/world.js`, `src/world/*` (existing; NEW `world/zones.js`, `world/mirwen.js`, `world/elderwood.js`, `world/plateau.js` (root plateau, Kalis ledge, ascent updrafts, scenery islands), `world/gates.js` (spirit gates, shrines), `world/surface2.js` (mud, blessed, cursed, overgrowth, rubble), `world/platforms.js` (small stand-on platforms, grid-bucketed), `world/colliders.js` (temporary colliders)); `tools/playtest3/world.js` |
| **enemies** | `src/enemies.js`, `src/enemies/*` **including** `src/enemies/bosses/*` (NEW `encounters.js`, `scaling.js`, `bossbase.js`, `threat.js` (taunt/stealth/targeting), `lizard.js`, `shroom.js`, `wolf.js`, `wraith.js`, `voidknight.js`, the renamed slime/goblin variants; `bosses/hydra.js`, `nox.js`, `treant.js`, `kalis.js`, `nidhoggra.js`, `nidhoggra_model.js`, `index.js`); `tools/playtest3/enemies.js` |
| **narrative** | `src/story.js`, `src/story/*` (NEW `story/quests.js`, `story/script3.js`, `story/classSelect.js`), `src/cinematic.js`, `src/cinematic/*` (NEW `cinematic/reveal.js`, `cinematic/acts.js`, `cinematic/finale.js`, `cinematic/spirits9.js`), **plus all audio**: `src/audio.js`, `src/audio/*` (NEW `audio/sfx3.js`, `audio/themes3.js`); `tools/playtest3/narrative.js` |
| **ui** | `src/ui.js`, `src/ui.css`, `src/ui/*` (NEW `ui/skillTree.js`, `ui/treeTour.js`, `ui/character.js`, `ui/codex.js`, `ui/classPanel.js`, `ui/hotbar3.js`, `ui/bossbar.js`, `ui/gateMenu.js`, `ui/prompt.js`); `tools/playtest3/ui.js` |

`docs/v3/DESIGN.md` and `docs/v3/CONTRACT.md` are owned by the design lead and read-only for every agent.

---

## 2. Module order, boot, states, stubs (core)

**ORDER (main.js):**

`world → vfx → combat → audio → player → spells → sword → skills → enemies → story → cinematic → ui`

- Modules are already loaded with `await import()` in main.js (`FILES`), so a missing or broken module file is stubbed, not fatal. Keep it that way.
- `main.js` statically imports **only** `src/core/*` and three. `core/progression.js` must never import `src/skills/*`. Tree data reaches it through `progression.registerTrees(trees)`, which skills calls **inside its factory**.
- `skills` is new. It comes after `spells` and `sword` so it can wrap them, and before `enemies` so encounters can query the build.
- `FILES.skills = './skills.js'`, which exports `createSkills(game)`.
- **Registries exist after the factory, not after init.** `spells.init` runs before `skills.init`, so any registry another module may call during its own init must exist when that factory returns. This covers `skills.registerImpl`/`registerArchetype` (forwarding to `game.archetypes`) and `progression.registerTrees`.
- `game.progression`, `game.settings`, `game.stats`, `game.elements`, `game.classes`, `game.save`, `game.archetypes`,
  `game.interact`, `game.timeScale` and `game.post` are created in main.js **before any module factory runs**.

**Stub for skills** (`src/core/stubs.js`, `skills(game)`) must return:
```js
{ ownsInput:false, loadout:{}, attuned:null, trees:{}, nodes:new Map(), defs:new Map(),
  registerImpl:(...a)=>game.archetypes.registerImpl(...a), registerArchetype:(...a)=>game.archetypes.registerArchetype(...a),
  applyPreset(){ return false }, update(){}, cast(){return false}, castSlot(){return false}, equip(){return false},
  canEquip(){ return {ok:false, reason:'stub'} }, resetCooldowns(){}, family:()=>game.player?.family || 'caster',
  getHudState(){ const m = familyOf(game.progression?.cls) === 'melee' ? game.sword : game.spells; return m?.getHudState?.() } }
```
`game.activeSkills()` returns `game.skills` when it is not the stub. Otherwise it keeps the v2 switch, using `familyOf(cls)` instead of a class literal.

**Frame order while `playing`:**

`player → stats.update(dt) → spells → sword → skills → enemies → combat → story → cinematic`, then world, vfx, ui, audio.

- `skills.update(dt, realDt)` must run **before** enemies so a cast happens in the same frame as its input.
- `game.stats.update(dt)` runs in **game time** (slowed by hitstop and the time scale), only while `playing`.
- `game.timeScale.update(realDt)` runs first in the frame, in every state.

The state list is unchanged:

`'title' | 'cutscene' | 'playing' | 'dialogue' | 'paused' | 'dead' | 'victory'`

- No new state is added. Menus (skill tree, character, codex, class panel, gate list) use `game.pause()` + `input.lock('menu')`, the same as the grimoire.

`game.newGame()` is unchanged, plus `game.save.clear()` when the player chooses 새 게임. The title gets a **이어하기** button when
`game.save.has()`.

---

## 3. Registries & core services (core)

### 3.1 Elements — `src/core/elements.js`
```js
export const ELEMENT_DEFS = {
  fire:     { id:'fire',     nameKo:'화염', short:'화', spirit:{id:'ignis',   name:'이그니스', title:'화염의 정령'},
              colors:{ core:0xfff3c4, mid:0xff8a1f, edge:0xc2261b, css:'#ff8a3d', hex:0xff6a1f },
              status:'burning', shapes:['ember','smoke'], sfxBase:220, opposite:'water', isNew:false, order:0 },
  ice:      { ..., nameKo:'빙결', spirit:{id:'glacia', name:'글라시아', ...}, colors:{core:0xffffff, mid:0x9fe8ff, edge:0x2f7bd6, css:'#8feaff', hex:0x7fe3ff}, status:'chilled', opposite:'fire', order:1 },
  lightning:{ ..., nameKo:'번개', spirit:{id:'volta', name:'볼타'},   colors:{core:0xffffff, mid:0xe9d8ff, edge:0x7b5cff, css:'#d4b4ff', hex:0xc9a4ff}, status:'shocked', opposite:'earth', order:2 },
  wind:     { ..., nameKo:'바람', spirit:{id:'sylphia',name:'실피아'}, colors:{core:0xffffff, mid:0xc8ffe9, edge:0x5fd6b0, css:'#9dffcb', hex:0x8fffc1}, status:null, opposite:null, order:3 },
  earth:    { ..., nameKo:'대지', spirit:{id:'teragon',name:'테라곤'}, colors:{core:0xfff1d6, mid:0xc8955a, edge:0x5b3b22, css:'#f0bd6e', hex:0xe0a85a}, status:'encrusted', opposite:'lightning', order:4 },
  water:    { ..., nameKo:'물',   spirit:{id:'undina', name:'운디나'}, colors:{core:0xffffff, mid:0x7fd3ff, edge:0x1f6fb8, css:'#6fc8ff', hex:0x4fb4ff}, status:'wet', opposite:'fire', isNew:true, order:5 },
  nature:   { ..., nameKo:'자연', spirit:{id:'sylvania',name:'실바니아'},colors:{core:0xf4ffd0, mid:0x8fe05a, edge:0x2f7d3a, css:'#9be86a', hex:0x7fd84a}, status:'seeded', opposite:null, isNew:true, order:6 },
  light:    { ..., nameKo:'빛',   spirit:{id:'lumiel', name:'루미엘'}, colors:{core:0xffffff, mid:0xffe9a8, edge:0xffc24a, css:'#ffe08a', hex:0xffd36a}, status:'radiant', opposite:'shadow', isNew:true, order:7 },
  shadow:   { ..., nameKo:'그림자',spirit:{id:'nox',    name:'녹스'},   colors:{core:0x1a0b2e, mid:0x5b2a8a, edge:0xb14bff, css:'#b98bff', hex:0x9a5cff}, status:'corroded', opposite:'light', isNew:true, order:8 },
};
export const ALL_ELEMENTS = Object.keys(ELEMENT_DEFS);      // 9, in `order` — v3 code iterates THIS
export const CLASSIC_ELEMENTS = ['fire','ice','lightning','wind','earth'];
export const PSEUDO_ELEMENTS = { physical:{nameKo:'물리', hex:0xffffff, css:'#ffffff'}, void:{nameKo:'공허', hex:0x7a3cff, css:'#9a6bff'} };
export function elDef(id) { return ELEMENT_DEFS[id] || null; }
export function elColor(id, part='hex') { … }   // ELEMENT_DEFS → PSEUDO_ELEMENTS → physical; never undefined
export function elName(id) { … }                // nameKo with the same fallback chain
```
**Legacy semantics are frozen:**
- `src/core/utils.js` keeps exporting `ELEMENTS`, and it **stays the 5 classic elements** (same order as today). It is `CLASSIC_ELEMENTS`.
- `ELEMENT_COLORS` and `ELEMENT_NAMES_KO` keep their existing 5 values. They are wrapped in a `Proxy` that returns the
  `physical` value for unknown keys, so legacy code given a new element renders white instead of crashing. They also gain the
  explicit keys `water, nature, light, shadow, physical, void`.
- `ELEMENT_NAMES_KO.ice` stays `'냉기'` for legacy strings. New UI uses `elName(el)`, which is `'빙결'`.
- `game.elements = { DEFS: ELEMENT_DEFS, list: ALL_ELEMENTS, classic: CLASSIC_ELEMENTS, get: elDef, color: elColor, name: elName }`.

**5-element audit list** (sites that must move to `ALL_ELEMENTS` / registry lookups, or stay classic on purpose; the owner is in brackets):

| File:line | Owner | Required change |
|---|---|---|
| `spells.js:23,30,413` | magic | `AWAKENED[el]`/`SPELLS[el_*]` built only for CLASSIC; new elements come from `skills` defs; `elements = …` stays CLASSIC in legacy mode; nothing indexes `SPELLS['water_basic']` |
| `sword.js:577,579,610,667` | melee | HUD element entries: legacy = CLASSIC; v3 HUD comes from skills. `AMB`/`PAL`/`STATUS3` maps go through `elColor`/`ELEMENT_DEFS` |
| `ui.js:181,451,613,1060-1067` | ui | the gem ring renders `hs.elements` (v3) or CLASSIC (v2) — never `ELEMENTS.length` |
| `world/village.js:21,328-331` | world | the altar is `InstancedMesh(…, ALL_ELEMENTS.length)` (the local 5-array is removed) |
| `cinematic/ceremony.js:4,17` | narrative | the class rite spawns only the class's elements (`CLASS_DEFS[cls].primary/secondary`) |
| `cinematic/intro.js:36,47,94,238,246` · `cinematic/assets.js SPIRITS` | narrative | intro stays on `SPIRITS` (5); `i<5` loops become `SPIRITS.length`; new spirits use `LOST_SPIRITS` (§16) |
| `audio/sfx2.js:254` | narrative | charge-pitch table → `ELEMENT_DEFS[el].sfxBase` |
| `player/model.js:553,577` | player | element-tinted gem/aura maps → `elColor` |
| `story.js:348,372` (Digit1-5 choices) | narrative | removed with the path dialogue; legacy keymap only |
| `core/progression.js:7,25` | core | rewritten (§4) |
| all `ELEMENT_COLORS[...]` sites (54) | each owner | safe through the Proxy; new code uses `elColor` |

### 3.2 Classes — `src/core/classes.js`
```js
export const CLASS_DEFS = {
  mage:        { id:'mage', nameKo:'마법사', title:'원소 학자', family:'caster', style:'staff', weapon:'staff',
                 resource:'mp', primary:['fire','ice'], secondary:['lightning','wind','water','shadow'],
                 base:{ hp:100, mp:100, resolve:0, stamina:100, power:1.0, defense:0, crit:0.10, move:1.0 },
                 dodge:'blink', defend:'barrier', signature:'attunement', mentor:'mageMentor',
                 talents:{ 1:'mage.t1', 10:'mage.t10', 20:'mage.t20', 25:['mage.t25a','mage.t25b'] } },
  sword:       { family:'melee', style:'longsword', weapon:'longsword', resource:'resolve', primary:['lightning','earth'],
                 secondary:['fire','wind','ice','light'], base:{hp:130, mp:0, resolve:100, stamina:110, power:1.0, defense:0.10, crit:0.10, move:1.0},
                 dodge:'dashstep', defend:'guard', signature:'enchant', mentor:'swordMentor', ... },
  ranger:      { family:'caster', style:'bow', weapon:'bow', resource:'mp', primary:['wind','light'],
                 secondary:['lightning','nature','ice','fire'], base:{hp:110, mp:100, stamina:110, power:1.0, defense:0.05, crit:0.12, move:1.04},
                 dodge:'backflip', defend:'focus', signature:'focus', mentor:'rangerMentor' },
  paladin:     { family:'melee', style:'hammer', weapon:'hammer', offhand:'shield', resource:'resolve', primary:['light','fire'],
                 secondary:['earth','water','nature','shadow'], base:{hp:160, mp:0, resolve:100, stamina:110, power:0.95, defense:0.18, crit:0.08, move:0.94},
                 dodge:'shieldstep', defend:'shield', signature:'seal', mentor:'paladinMentor' },
  spiritcaller:{ family:'caster', style:'totem', weapon:'totem', resource:'mp', primary:['nature','water'],
                 secondary:['earth','wind','light','shadow'], base:{hp:105, mp:120, stamina:100, power:0.95, defense:0.05, crit:0.10, move:1.0},
                 dodge:'spiritswap', defend:'ward', signature:'familiars', mentor:'spiritMentor' },
  shadowblade: { family:'melee', style:'daggers', weapon:'daggers', resource:'resolve', primary:['shadow','nature'],
                 secondary:['ice','lightning','earth','water'], base:{hp:105, mp:0, resolve:100, stamina:120, power:1.0, defense:0, crit:0.20, move:1.08},
                 dodge:'shadowroll', defend:'counter', signature:'marks', mentor:'shadowMentor' },
};
export const CLASS_IDS = Object.keys(CLASS_DEFS);
export function access(cls, el) { const c = CLASS_DEFS[cls]; return !c ? null : c.primary.includes(el) ? 'primary' : c.secondary.includes(el) ? 'secondary' : null; }
export function familyOf(cls) { return CLASS_DEFS[cls]?.family || 'caster'; }   // unknown → caster, logged once
export function styleOf(cls)  { return CLASS_DEFS[cls]?.style  || 'staff'; }
export function classElements(cls) { const c = CLASS_DEFS[cls]; return c ? [...c.primary, ...c.secondary] : []; }
export const TALENTS = { 'mage.t1': {nameKo:'원소 연쇄', desc:'…'}, … };    // texts from DESIGN §2.2
```
`game.classes = { DEFS: CLASS_DEFS, ids: CLASS_IDS, get: id => CLASS_DEFS[id], access, familyOf, styleOf, classElements, TALENTS }`.
The access table is data-checked in `tools/playtest3/core.js`: each element is reachable by 4 classes, and each class has 6 elements (DESIGN §2.1).

### 3.3 Core runtime services

**Archetype & implementation registry** — `src/core/archetypes.js`, `game.archetypes`:
```ts
registerArchetype(name, family:'caster'|'melee', impl:(ctx)=>void): void   // magic registers caster impls, melee registers melee impls
getArchetype(name, family): fn|null
registerImpl(skillId, family, fn): void;  getImpl(skillId, family): fn|null   // bespoke ultimates/capstones/finishers
list(): {archetypes:[{name, caster:boolean, melee:boolean}], impls:[…]}      // for playtest coverage
```
`game.skills.registerImpl/registerArchetype` forward here, so registration works even while skills is stubbed.

**Interaction registry** — `src/core/interact.js`, `game.interact`:
```ts
offer(id, {pos:Vector3|()=>Vector3, r, label, onUse, priority=0, enabled?:()=>boolean}): void;  withdraw(id): void
current(): {id, label}|null        // nearest enabled offer within r of the player, highest priority first; evaluated at 10 Hz
use(): boolean                      // called by core input on KeyF
```
- Story (NPC talk), world (gates, shrines, rot walls), enemies (gift prompts) and ui all register offers.
- ui renders the one current prompt.
- **F is interact only.** Skills, spells and sword never read F. The checks `story.hasPrompt()` at spells.js:436 and sword.js:689 are removed. `story.hasPrompt()` stays as a shim → `!!game.interact.current()`.

**Time scale stack** — `src/core/timescale.js`, `game.timeScale`:
```ts
set(id, scale, durReal): void;  clear(id): void;  update(realDt): void;  value(): number   // effective = min over active entries
```
- `game.slowmo(scale, s)` stays as a shim → `timeScale.set('legacy', scale, s)`.
- Ids used: `focus` (ranger), `break`, `parry`, `bossDeath`, `ult`, `hitfeel`.
- **Compensated time:** the player's movement, the skills runtime (cooldowns, casting, channels) and sword actions use `dt / timeScale.value()` while `focus` is active. `player.timeComp()` returns that factor.
- **Game time:** enemies, projectiles, zones, statuses, `stats.update` and regen.

**Post-processing hook** — `game.post`: core adds `uChroma` and `uRadial` to the existing sanitize/grade pass and exposes
`game.post.pulse(amount, durReal)` and `game.post.grade(name, blend)`. fx (owned by combat) only calls these.

**Toon dissolve chunk** — core adds `uniform float uDissolve` (default −1, a no-op), `uDissolveColor` and the noise/discard/edge-glow
chunk to `toonMat`/`toonRim` in `src/core/utils.js`, under the program cache key `'toonRim+dis'`. It is chained after
`world/prefab.js`'s occlusion `onBeforeCompile`. Every toon material therefore has the uniform from boot, and dissolving needs no compile.
`vfx.dissolve(entity)` clones the entity's materials once (same program) and animates the clone's `uDissolve`.

---

## 4. Progression v3 (`game.progression`, core/progression.js)

Old method names stay as **shims**. See §22. Progression never imports skills files (rule 7).

```ts
// state
cls: string|null;  classDef: object|null;  chosen: boolean;
level: number (1..30);  xp: number (into current level);  totalXp: number;
ranks: Map<nodeId, number>;  granted: Set<nodeId>;  talentChoice: 'a'|'b'|null;
spiritsFreed: Set<elementId>;  sealsBroken: boolean;  lumielFeather: boolean;  bossesDefeated: Set<id>;  shrinesFound: Set<id>
awakening: number 0..100
get points(): number                        // DERIVED, never stored: earned(level, bossesDefeated, shrinesFound) − spent(ranks)

// tree data (filled by skills inside its factory)
registerTrees(trees: {[el]: TreeData}): void   // builds the node index; may be called again (hot replace in tests)
node(id): NodeDef|null                      // from the registered index only; null if skills never registered

// class
setClass(cls): void                         // resets the build: ranks cleared, both primary `<el>.attune` granted; emits classChosen {cls}
canChangeClass(): {ok, reason?:'place'|'boss'}   // altar only, not during a boss fight
// XP / level
xpToNext(L = level): number                 // round(40 * L^1.4 + 60)
addXp(n, source = {kind:'kill'|'quest'|'reaction'|'shrine'|'landmark'|'boss'|'debug', id?, zoneLevel?}): void
                                            // kind 'kill': only when target.xpValue > 0; zoneLevel default 1;
                                            // ×0.5 if level ≥ zoneLevel+6, ×1.5 if level ≤ zoneMin−3 (DESIGN §5.1);
                                            // emits xpGained {amount, source, level, xp, xpToNext}; levelUp {level, pointsGained}
setLevel(L): void                           // debug/test; points follow automatically (derived)
// tree
pointsIn(el, {forGates=true}): number       // spent ranks×cost in that tree; granted nodes count 1 when forGates, 0 for mastery
access(el): 'primary'|'secondary'|null      // class gate (CLASS_DEFS)
tierCap(el): null|'T3'|'T4'|'CAP'           // null = no access; secondary → 'T3'; primary → 'CAP' if storyGateOpen(el) else 'T4'
storyGateOpen(el): boolean                  // classic: sealsBroken; water/shadow/nature: spiritsFreed.has(el); light: lumielFeather
canLearn(id): {ok, reason?:'class'|'tier'|'gate'|'prereq'|'exclusive'|'points'|'maxRank'|'story'}
learn(id): boolean                          // +1 rank; emits skillLearned {id, rank, element}
canUnlearn(id): {ok, reason?:'granted'|'dependent'|'gate'|'place'}
                                            // 'gate': simulate the removal; reject if any learned node's tier gate would fail
unlearn(id): boolean                        // −1 rank; only if canRespecHere() or test; emits skillUnlearned {id, rank, element}
respecAll(): void                           // keeps granted; emits respec {}
setRanks(map: {[nodeId]: rank}, {ignoreBudget=false, ignoreGates=false}): void   // presets/tests; validates ids; emits respec + skillLearned per node
canRespecHere(): boolean                    // world.respecSpots within 8 m (altar, gates) or game.isTest
rank(id); isLearned(id); hasSkill(skillId); learnedNodes(); learnedSkills()
mastery(el): {points, rank:'none'|'입문'|'숙련'|'전문'|'대가', dmgBonus, milestones:[5,10,15 reached]}   // uses pointsIn(el,{forGates:false})
breadth(): {trees5:number, bonus:number, awakened:boolean}   // DESIGN §5.7 방랑자
judgmentThreshold(): number                 // min(5, milestone10 ? 4 : 5, light.p2 rank1 ? 4 : rank2 ? 3 : 5), floor 3
// elements
unlockedElements(): string[]                // class-accessible elements with pointsIn>0 (granted counts)
isElementUnlocked(el): boolean
freeSpirit(el): void                        // emits spiritFreed {element}; sets lumielFeather when 2 of water/shadow/nature are freed
breakSeals(): void                          // after golem
// combat hooks
damageMul(el): number                       // MASTERY ONLY: 1 + 0.02 × min(15, pointsIn(el,{forGates:false})). Nothing else.
// awakening
addAwakening(n) / canFinisher() / consumeAwakening()   // enabled iff any capstone learned OR breadth().awakened
// persistence
serialize(): {cls, level, totalXp, ranks, talentChoice, spiritsFreed, sealsBroken, lumielFeather, bossesDefeated, shrinesFound}
deserialize(obj): void                      // unknown node ids are dropped (their points come back automatically, since points are derived)
reset(): void
```

Rules:
- `canLearn` enforces the following:
  - Access: no access → `class`. A secondary tree stops at T3 (`tier`).
  - Tier gates: T2 needs 2, T3 needs 5, T4 needs 9, CAP needs 14 points in that tree (`pointsIn` with `forGates`).
  - The single `requires` prerequisite, or `requiresAny`.
  - Exclusive modifier pairs.
  - The story gate for capstones only (`story`).
  - Points.
- **On `skillUnlearned` / `respec`** (listeners, each owner in its module):
  - skills unequips slots whose skill is no longer learned.
  - skills clears `buff:<skillId>` sources and despawns familiars and the treant.
  - progression zeroes `awakening` if neither a capstone nor breadth awakening remains.
- **Test override:** `progression.debug.ungate = true` (or URL `&unlock=all`) skips the class, tier, story and seal gates. Points and prerequisites still apply unless `&points=inf`. `debug.ungate` is **never serialized**.
- `stats.markDirty()` is called after any learn, unlearn, level or class change (§5).

**Save** (`src/core/save.js`, `game.save`):
- API: `has()`, `save()`, `load()`, `clear()`.
- localStorage key `aw_save_v3`. Content: `{v:3, progression: serialize(), loadout: skills.loadout, story: story.serialize?.(), world: world.serialize?.(), codex:[ids], difficulty, time}`.
  - `world.serialize()` covers gates reached, shrines found, rot walls burned or purified, act visibility and camps cleared.
  - **No position and no HP are saved.** A load always spawns at the last reached spirit gate (or the village) with full HP.
- Autosave only at **stage boundaries** (`questComplete`) and when you leave the altar or tree. It **never** saves while `enemies.boss` is alive or during a cinematic. It is debounced to 2 s, all of it in try/catch, and it is never used in test mode unless `&save=1`.
- Load order: `progression.deserialize`, then `skills.deserialize` (it drops unlearned skills from slots), then `story.deserialize`, then `world.deserialize`. Then `enemies.prewarmBoss` for the current act's boss, behind the load fade.

---

## 5. Stats & modifier aggregator (`game.stats`, core/stats.js)

**`player.mods` is no longer a data object.** It is an object of **getters** that delegate to `game.stats.get(key)`. It is never written to.
- There is no migration window. In wave 1, melee converts `sword.js:521-530` (`startBuff`) and magic converts `spells/master.js:455-474` to
  `game.stats.set('buff:'+id, mods, {duration})`, and they delete the save/restore code.
- `player.mods.doubleJump` is a getter returning `stats.get('extraJumps') > 0`. This is the only alias.

```ts
set(sourceId: string, mods: Partial<Mods>, {duration?: number /* game time, s */}): void   // replaces that source's contribution
clear(sourceId): void;  has(sourceId): boolean;  timeLeft(sourceId): number
get(key): number|boolean            // aggregated value (recomputes first if dirty)
markDirty(): void                   // lazy: recompute happens at most once per frame, on the next get() or in update()
update(dt): void                    // core frame order (§2): expires timed sources, then recomputes if dirty; emits ONE statsChanged per frame at most
derived(): { maxHp, maxMp, maxResolve, maxStamina, power, defense, crit, critMul, move, regenDelay, regenDelayOOC, regenRate, regenRateOOC }
elementDmg(el): number              // product of all sources' <el>Dmg (incl. keystones) — NOT mastery
reactionDmg(id): number             // product of rx_<id> and the family bonuses
registerProc(sourceId, eventName, fn) // procs from passives (e.g. fire.p2 on kill); auto-removed on clear(sourceId)
```
- Source records are **pre-allocated and reused**: `set()` copies into an existing record for that id. No object is created per call.
- `consume(key)`: an additive or flag key that is used up, such as `freeNext`. It clears the key's owning source and is used by skills for resonance.

**Mods keys:**

| Group | Keys |
|---|---|
| Multiplicative (default 1) | `atkMul`, `dmgTakenMul`, `moveMul`, `atkSpeed`, `castSpeed`, `cdrMul`, `maxHpMul`, `maxResMul`, `healMul`, `regenRateMul`, `poiseMul`, `glideStamMul`, `dashDistMul`, `<el>Dmg` (one per element in `ALL_ELEMENTS`), `rx_<reactionId>`, `rxFamily_<family>`, `nextMul` |
| Additive (default 0) | `critChance`, `critMul`, `regenDelayAdd`, `regenRateAdd`, `lifesteal`, `chainBonus`, `extraDash`, `extraJumps`, `parryWindowAdd`, `chillToFreezeAdd`, `seededMaxAdd`, `corrodedMaxAdd`, `podCapAdd`, `resolveRegenAdd` |
| Flags (OR) | `noKnockback`, `noGlide`, `regenDisabled`, `burnImmune`, `infiniteGlide`, `noRegenPause`, `freeNext`, `blightImmune` |

- Sources follow this naming: `node:<id>`, `talent:<id>`, `buff:<skillId>`, `class`, `level`, `zone`, `difficulty`, `boss:<id>`, `rx:resonance`, `breadth`.
  Mastery is **not** a stats source. It lives only in `progression.damageMul`.
- **Combat** reads `elementDmg`, `reactionDmg`, `critChance`, `critMul`, `atkMul` and `lifesteal` (§8.3).
- **Player** reads `derived()` for max HP and resources, move and regen.

---

## 6. Input & key map v3 (core/input.js, core/keymap.js)

```js
// src/core/keymap.js
export const KEYS = { basic:'Mouse0', charged:'Mouse2', q1:'Digit1', q2:'Digit2', q3:'Digit3', q4:'Digit4',
  ult:'KeyX', sup:'KeyG', fin:'KeyR', attuneNext:'KeyZ', dodge:'KeyQ', defend:'KeyE', gift:'KeyV',
  tree:'KeyK', character:'KeyC', codex:'Tab', interact:'KeyF', pause:'Escape', mute:'KeyM' };
export function keymapMode(game) { return game.isTest && new URLSearchParams(location.search).has('path') ? 'legacy' : 'v3'; }
```
- **Legacy mode** (any URL with `path=`): Digit1–5 select elements as before. The old `game.spells` and `game.sword` input handlers
  stay active, and skills does **not** read the digits. F keeps its legacy ultimate meaning *only* in legacy mode, when `game.interact.current()` is null.
- **v3 mode:**
  - `game.skills` owns LMB, RMB, 1–4, X, G, R, Z, V and the wheel.
  - `spells.js` and `sword.js` must **not** read their own skill inputs. They check `game.skills?.ownsInput === true`.
  - **F is interact only**, handled by core through `game.interact.use()`.
  - Player still owns WASD, Shift, Space, Q, E and the camera. UI owns K, C, Tab and Esc.
- `input.raw` is unchanged.

---

## 7. Skills (`game.skills`, src/skills.js + src/skills/*) — owner **skills**

### 7.1 Node & skill definition schema (pure data, `src/skills/trees/<el>.js`)
```js
export default {
  element: 'fire',
  nodes: [
    { id:'fire.attune', nameKo:'화염 각인', type:'active', tier:1, cost:1, maxRank:1, requires:null,
      grants:['fire.basic','fire.charged'], pos:{col:0,row:0},
      desc:'LMB 화염구 · RMB 업화의 구슬', tags:['setup'] },
    { id:'fire.p1', type:'passive', tier:1, cost:1, maxRank:3, requires:null,
      mods:(rank)=>({ burnDurAdd:0.5*rank, burnTickMul:1+0.15*rank }), desc:'화상 +{0.5r}초, 화상 피해 +{15r}%' },
    { id:'fire.m1a', type:'modifier', tier:2, cost:1, maxRank:1, requires:'fire.salamander', modifies:'fire.salamander',
      exclusive:'fire.m1b', params:{ lineDur:7, lineWidth:2 } },
    { id:'fire.ult', type:'ultimate', tier:3, cost:2, maxRank:1, requiresAny:['fire.cyclone','fire.rising'], grants:['fire.ult'] },
    { id:'fire.cap', type:'capstone', tier:5, cost:2, maxRank:1, requires:'fire.ult', grants:['fire.awakened','fire.finisher'],
      mods:()=>({ burnImmune:true }), procs:[{ event:'damage', fn:'fire.cap.every3' }] },
    // … all 19 (classic) / 20 (new element) nodes per DESIGN §6.4–6.13 (ids exactly as written there)
    // shape slots → tier: attune/a2/p1 = 1; a3/a4/u/m1 = 2; ult/rx/m2/sig = 3; sup/t4/m3/key/p2 = 4; cap = 5
  ],
  skills: {           // castable skills granted by nodes
    'fire.basic':    { slot:'basic',   nameKo:'화염구', cost:4, cd:0.3, legacy:{spell:'fire_basic', sword:'combo'} },
    'fire.charged':  { slot:'charged', nameKo:'업화의 구슬', cost:16, cd:1.2, chargeTime:1.1, legacy:{spell:'fire_heavy', sword:'heavy'} },
    'fire.salamander':{ slot:'quick', nameKo:'살라만더', cost:14, cd:6, archetype:'crawler', anim:'slam',
      params:{ dist:14, speed:9, dmg:14, status:{burning:{dur:2}}, line:{dur:4, width:1.2, tick:6, every:0.5}, ignite:true },
      melee:{ tpl:'upper', hitT:0.35 }, modifiers:['fire.m1a','fire.m1b'] },
    'fire.ult':      { slot:'ultimate', nameKo:'메테오', cost:45, cd:14, legacy:{spell:'fire_ultimate', sword:'ultimate'} },
    'fire.awakened': { slot:'ultimate', replaces:'fire.ult', nameKo:'천체 낙하 · 각성', legacy:{spell:'fire_awakened', sword:'ultimateAwakened'} },
    'fire.finisher': { slot:'finisher', nameKo:'불사조 강림', legacy:{spell:'fire_finisher', sword:'finisher'} },
    'fire.sup':      { slot:'support', nameKo:'불꽃 정령 소환', cost:25, cd:24, legacy:{spell:'fire_support', sword:'support'} },
    // …
  },
};
```
**Node fields:**

| Field | Values |
|---|---|
| `type` | `'active'`, `'ultimate'`, `'support'`, `'modifier'`, `'passive'`, `'keystone'`, `'capstone'` |
| `slotRole` | `'attune'`, `'a2'`, `'a3'`, `'a4'`, `'u'`, `'sig'`, `'t4'`, `'m1a'`, …, `'cap'`: the DESIGN §6.1 shape slot, used by the UI layout and by coverage tests |
| `primaryOnly` | true for T4 and cap nodes (derived from tier ≥ 4; listed explicitly for readability) |
| `tier` | 1–4, or 5 for the capstone |
| `requires` | an id or null; `requiresAny` is an array |
| `exclusive` | the id of the paired modifier |
| `grants` | an array of skill ids |
| `mods(rank)` | returns a Mods object for `game.stats` |
| `procs` | `[{event, fn: procId}]`; procs are implemented in `src/skills/procs.js` and registered by id |
| `params` | the modifier's overrides, merged into the modified skill's params at cast time |
| `pos` | UI layout hint |

**Skill fields:**

| Field | Values |
|---|---|
| `slot` | `'basic'`, `'charged'`, `'quick'`, `'ultimate'`, `'support'`, `'finisher'` |
| `cost` | in MP; melee pays 투지 (resolve) = cost × 0.8 |
| `cd` | cooldown in seconds |
| `chargeTime` | optional |
| `archetype` + `params` | how the skill is built (§7.3). `params` hold **unscaled base** numbers at level 1 (§8.3) |
| `params.status` | `{<statusId>: number}` = seconds (legacy), or `{<statusId>: {dur?, stacks?}}`. **Stacks are always written as `{stacks:n}`**, never as a bare number |
| `twist` | short tag of the world interaction (DESIGN §13.1), for tests and tooltips |
| `custom` | the id of a bespoke implementation |
| `legacy` | `{spell, sword}` ids for the adapters |
| `anim` | the player cast kind (§10.4) |
| `melee` | `{tpl, hitT, shape?}` overrides |
| `ranger` | `{arrow:true}` (default for bow), presentation overrides |
| `tags` | array of strings |
| `iconGlyph` | archetype glyph for the UI |

### 7.2 Runtime API
```ts
game.skills = {
  ownsInput: boolean,                       // true in v3 keymap mode
  defs: Map<skillId, SkillDef>, nodes: Map<nodeId, NodeDef>, trees: {[el]: TreeData},   // filled in the FACTORY; also calls progression.registerTrees(trees)
  loadout: { q1:id|null, q2, q3, q4, ult, sup },     // persisted in save
  attuned: elementId|null,
  attune(el, {silent=false}={}): boolean;  cycleAttune(dir=+1): void   // only progression.unlockedElements(); emits attuneChanged + elementChanged ONCE
  equip(slot, skillId): boolean;  unequip(slot): void
  canEquip(slot, skillId): {ok, reason?:'unlearned'|'slot'|'combat'}
        // ONE rule (DESIGN §5.5): ok when !player.inCombat(), OR (ui.skillTreeOpen && game paused && now−player.lastHurtT ≥ 5)
  autoEquip(): void                         // after learn: fill empty q-slots / ult / sup with newly learned skills
  cast(skillId, opts?:{free?:boolean, charge?:number(0..1), aim?:{point,dir,target}, noAttune?:boolean}): boolean
  castSlot(slot: 'basic'|'charged'|'q1'..'q4'|'ult'|'sup'|'fin', opts?): boolean
  isReady(skillId): boolean;  cooldownLeft(skillId): number;  resetCooldowns(): void
  family(): 'caster'|'melee';  style(): string
  effectiveParams(skillId): object          // params merged with learned modifiers (NOT scaled by power or stats; §8.3)
  applyPreset(name, {ignoreBudget=true}={}): boolean   // PRESETS[name] → progression.setRanks(map, {ignoreBudget, ignoreGates:true}) + loadout
  getHudState(): HudState                   // §7.5
  registerImpl(skillId, family, fn), registerArchetype(name, family, fn)   // forward to game.archetypes (§3.3)
  useGift(): boolean                        // V: game.enemies.bosses?.gift?.ready → gift.use()
  update(dt, realDt): void;  warmup(): Object3D[] (prewarm)
  serialize()/deserialize()
};
```
**Cast pipeline:**
1. Gate the cast:
   - `progression.hasSkill(id)`, unless `free` or test.
   - Not on cooldown.
   - Enough resource: `player.spendMp` (caster) or `player.spendResolve` (melee) (§10).
   - `combat.canAct(player)`.
2. Auto-attune to the skill's element, unless `noAttune`. This emits `attuneChanged` once and calls the spells/sword setters with `{silent:true}`.
3. Resolve the implementation, in this order:
   1. `game.archetypes.getImpl(id, family)` (bespoke).
   2. `legacy` through the adapters.
   3. `game.archetypes.getArchetype(def.archetype, family)`.
   4. The caster archetype fired from the weapon tip.
4. **Events, exactly one of each per cast:**
   - Skills always emits `skillCast {id, element, slot, cls, family, origin}`.
   - The legacy `spellCast {element, kind, spellId}` is emitted by **whatever code actually performs the cast**: the legacy paths (`spells.castById`, `sword.api.playLegacy`) emit it themselves; for archetype/bespoke paths, skills emits it (it sets `opts._emitted = true` so nothing emits twice).
   - The kind mapping is: basic → basic, charged → heavy, ultimate → ultimate, everything else → `'skill'`.
5. Start the cooldown: `cd × stats.get('cdrMul')`. It ticks in compensated time (§3.3).
6. If `stats.get('freeNext')`: the cost is 0, `nextMul` is applied through `hit.castMul`, and then `stats.consume('freeNext')`.

Modifiers are applied by `effectiveParams`. Archetypes read only `ctx.params`.

### 7.3 Archetypes (implemented by magic and melee, registered in `game.archetypes`)
`ctx` is built by `skills/runtime.js`:
```
{ game, skillId, def, element, params, family, style, origin:Vector3, aim:{point,dir,target}, charge,
  S: game.spells.api, M: game.sword.api, hit(base) → hitSpec (adds skillId, slot, element, source:'player', tier), after(t,fn),
  powerForDisplay }   // powerForDisplay is for tooltips ONLY; never multiply damage by it
```
Required archetypes (24). Each needs a **caster** implementation (magic, `src/spells/archetypes.js`) and a **melee**
implementation (melee, `src/sword/archetypes.js`). The melee default is "start a `M.startAction` with the hit window at
`params.melee.hitT`, then run the caster effect from the weapon tip". An archetype marked "melee default ok" needs no bespoke melee form.

| Archetype | Caster | Melee | Used by (examples) |
|---|---|---|---|
| `projectile` | single bolt / arrow / wisp | slash wave from the blade | shadow LMB, 천사의 창 |
| `volley` | N spread / bounce | default ok | 가시 사격 |
| `lob` | arc + land effect | default ok | 씨앗 폭탄, 불씨 투척 |
| `crawler` | ground-travelling | ground wave from a low slash | 살라만더 |
| `beam` | channel or instant, `params.prism` refracts | default ok | 새벽의 심판 |
| `cone` | instant cone | wide sweep | 반발 돌풍 |
| `nova` | ring around self | weapon plant ring | 서리 폭발, 홍련 선풍 |
| `zone` | placed area via `S.zones.spawn` | default ok | 치유의 샘, 성역 |
| `wall` | temporary collider via `world.addTempCollider` | default ok | 대지의 벽, 가시 숲 |
| `pillar` | knock-up + optional platform via `world.addPlatform` | default ok | 빙주, 빙하 낙하, 돌계단, 거신의 주먹 |
| `chain` | jumps between N targets | default ok | 흑뢰 |
| `rain` | N strikes over time | default ok | 대홍수 |
| `summon` | ally entity (`skills/familiars.js` visuals, `team:'player'`, pooled) | default ok | 나무정령, 도발의 석상, 분신, 거울, 피뢰침 |
| `blink` | teleport + path damage | dash-slash | 뇌신 질주, 그림자 걸음 |
| `dash` | self-dash with a body effect | lunge (`TPL.iaido`) | 불새 돌진, 물살 타기 |
| `leapslam` | leap + landing AoE | plunge | 뇌신 강림, 천공 낙하 |
| `grapple` | vine pull to point / pull target | vine whip | 덩굴 끌어당기기 |
| `buff` | `game.stats.set('buff:'+id, mods, {duration})` + aura VFX | default ok | 축복, 번개 가속 |
| `mark` | apply status + target VFX | default ok | 그림자 낙인 |
| `chainbind` | root N targets with tethers | default ok | 그림자 사슬 |
| `tether` | channel link + lifesteal | whip channel | 영혼 흡수, 물의 채찍 |
| `lane` | placed strip surface/zone | default ok | 빙판길, 순풍의 길 |
| `mine` | placed trap object via `S.objects` | default ok | 뇌전 지뢰 |
| `bubble` | single-target float CC | default ok | 거품 감옥 |

- Presentation rules:
  - The `bow` style replaces the projectile mesh with `arrow` and the origin with the bow string, and lobs fire as arrows.
  - The `totem` style uses wisps.
  - `hammer` uses radius ×1.2 and speed ×0.85. `daggers` use radius ×0.85 and speed ×1.25.
- Each archetype must pre-allocate its scratch objects and use pools. Each implementation file exports `warmup()`, which returns one hidden instance of every visual.
- Any InstancedMesh an archetype may tint calls `setColorAt(0, c)` and sets `instanceColor.needsUpdate` **at construction**.

### 7.4 Legacy adapters (`src/skills/adapters.js`)
- **Caster legacy:** a `legacy.spell` id maps to `game.spells.castById(spellId, opts)`. This is a new magic API that runs
  the existing `SPELLS[id].cast` with gating bypassed, because skills already gated it. It emits `spellCast` itself.
- Spell id map: `fire_basic`, `fire_heavy`, `fire_ultimate`, `fire_awakened`, `fire_support`, `fire_finisher`, and the same for ice, lightning, wind and earth.
- **Melee legacy:** a `legacy.sword` kind maps to `game.sword.api.playLegacy(element, kind, opts)`. Kind is one of `combo`, `heavy`, `ultimate`, `ultimateAwakened`, `support`, `finisher`.
  - The combo/heavy for **paladin and shadowblade** route to their class movesets with an element payload (melee owner).
- Finishers keep the cinematic path through `game.cinematic.finisher({element, cls, …})` (§16).

### 7.5 HUD state (replaces the v2 shape; ui must also accept the v2 shape as a fallback)
```ts
HudState = {
  v: 3, cls, family, resource:'mp'|'resolve', resourceValue, resourceMax,
  attuned: el|null,
  elements: [{ id, name, color, css, access:'primary'|'secondary', unlocked:boolean, attuned:boolean, points, mastery }],
  slots: [{ slot:'basic'|'charged'|'q1'|'q2'|'q3'|'q4'|'ult'|'sup'|'fin', key:'LMB'|'RMB'|'1'|'2'|'3'|'4'|'X'|'G'|'R',
            id|null, name, desc, element, kind:'basic'|'heavy'|'skill'|'ultimate'|'support'|'finisher', archetype,
            cost, resource, cooldown, cooldownLeft, ready, locked:boolean, awakened:boolean }],
  charging:boolean, chargeFrac:number,
  awakening:{ enabled, value, ready },
  signature:{ kind:'attunement'|'enchant'|'focus'|'seal'|'familiars'|'marks', value:number, max:number, extra? },
  gift:{ ready, charges, element }|null,
  // v2 compatibility: also expose `element`, `index` (index into elements[])
}
```
- `kind` keeps the v2 names, so the v2 hotbar code renders something sensible until ui ships `hotbar3`.
- The HUD state object and its arrays are **reused** across calls. `getHudState()` must not allocate per frame.

### 7.6 Class kits (`src/skills/classkits.js`)
- Each class's signature mechanic, as in DESIGN §2.2.
- It listens to `damage`, `reaction`, `blocked`, `perfectDodge` and `skillCast`, and exposes its state through `getHudState().signature`.
- Movement-level kits (dodge and defend) belong to **player** (§10.2). Class kits only cover the *combat* signature:
  - mage 원소 연쇄 stacks (kind `attunement`)
  - sword enchant gauge + parry wave
  - ranger focus meter value (player owns the time slow)
  - paladin seal counter + seal spawn, via `S.zones.spawn('holy',…)`
  - spiritcaller familiars, via `skills/familiars.js`
  - shadowblade marks, via combat status `marked`, registered in the status table by combat
- Talents are applied as `game.stats` sources (`talent:<id>`) on `levelUp` and `classChosen`.
- The breadth reward (DESIGN §5.7) is the `breadth` stats source, refreshed on `skillLearned`/`respec`.

---

## 8. Combat v3 (owner **combat**; VFX in §20 are also combat's)

### 8.1 Status registry (`src/combat/statuses.js`)
```js
export const STATUS_DEFS = {
  burning:  { nameKo:'화상', color:'#ff7a2a', element:'fire', dur:4, dot:{dmg:6, every:0.5}, cancels:['wet','chilled'], spreads:true },
  wet:      { nameKo:'젖음', color:'#5fb8ff', element:'water', dur:8, speedMul:0.92, cancels:['burning'] },
  chilled:  { nameKo:'냉기', color:'#9fe8ff', element:'ice', dur:4, stack:{max:6, onMax:'frozen'}, speedMul:0.6 },
  frozen:   { nameKo:'빙결', color:'#d8f6ff', dur:2.5, preventsAct:true, bossMul:0.4, blocks:['burning','chilled'], drImmune:2.0 },
  shocked:  { nameKo:'감전', color:'#c9a4ff', dur:5, dot:{dmg:3, every:0.9}, microStun:true },
  stunned:  { nameKo:'경직', color:'#e0a85a', dur:1.0, preventsAct:true, bossMul:0.4, drImmune:1.5, aura:false },   // CC only, never an aura
  encrusted:{ nameKo:'석화', color:'#c8955a', element:'earth', dur:6, speedMul:0.9, breakTakenMul:1.2 },        // the earth aura
  airborne: { nameKo:'공중', … }, exposed: { nameKo:'노출', dur:6, dmgTakenMul:1.3 },
  seeded:   { nameKo:'씨앗', color:'#8fe05a', element:'nature', dur:8, stack:{max:5, maxStat:'seededMaxAdd'}, dot:{dmg:2, every:1, perStack:true, element:'nature'} },
  radiant:  { nameKo:'성흔', color:'#ffe08a', element:'light', dur:10, stack:{max:5}, elDmgTaken:{light:0.03, perStack:true} },
  corroded: { nameKo:'침식', color:'#b14bff', element:'shadow', dur:8, stack:{max:5, maxStat:'corrodedMaxAdd'}, dmgTakenPerStack:0.05, lifestealPerStack:0.01 },
  dazzled:  { nameKo:'눈부심', color:'#fff6c0', dur:3, windupMul:1.4, spreadAdd:15, parryWindowAdd:0.1, bossMul:0.5 },
  rooted:   { nameKo:'속박', color:'#6fcf4a', dur:2, preventsMove:true, bossImmune:'break', breakOnImmune:40 },
  asleep:   { nameKo:'수면', color:'#c9b8ff', dur:4, preventsAct:true, wakeOnHit:true, firstHitMul:1.5, buildup:100, bossImmune:true },
  muddy:    { nameKo:'진흙', color:'#8a6a3a', dur:1, speedMul:0.55, noDodge:true },
  hexed:    { nameKo:'저주', color:'#7a3cff', dur:10, dmgTakenMul:1.2 },
  quickened:{ nameKo:'촉진', color:'#c8ff6a', dur:6, flatOn:{lightning:25, nature:25} },
  cracked:  { nameKo:'균열', color:'#9a7bff', dur:6 },
  marked:   { nameKo:'표식', color:'#b98bff', dur:6, stack:{max:5} },          // shadowblade marks
  blight:   { nameKo:'공허 침식', color:'#5a2a9a', dur:6, playerOnly:true, flags:['regenDisabled'], dmgDealtMul:0.9 },
};
```
- **The signature is kept:** `applyStatus(t, name, seconds, extra)`, which has 27 call sites today. `extra = {stacks?, source?, power?, el?}`.
  - `stacks` adds that many stacks (capped by `stack.max` plus the `maxStat` from stats, but only when `source` is the player).
  - `source` is passed through by combat from `hit.source`.
  - `power` is the source's power snapshot, which DoT ticks use (§8.3).
  - `el` is the element that applied it. It is stored as `st.el`.
- **`hit.status` schema:** `{name: seconds}` (legacy number = seconds), or `{name: {dur?, stacks?}}`. combat calls
  `applyStatus(t, name, dur ?? def.dur, {stacks, source: hit.source, power, el: hit.element})`.
- **Auras are matched on `(status, st.el)`.** A status applied by a non-element source (a parry stun, a mine) is never an aura. Only statuses whose def has an `element` (and no `aura:false`) are auras.
- **Aura order:** each entity keeps a small ring `auraOrder` (most recent first) for the priority rule in §8.2. It is updated on apply and refresh.
- `voidShield` is **not** a status. It is numeric `entity.voidShield` only (§8.4). ui shows it as a pseudo-pip.
- `combat.statusInfo(id)` returns the def, for the UI. `combat.STATUS_DEFS` is exported.

### 8.2 Reaction registry (`src/combat/reactions.js`)
```js
export const REACTION_DEFS = [
  { id:'melt', nameKo:'융해', desc:'…', family:'burst', elements:['fire','ice'], opposite:true,
    match:{ trigger:'fire', aura:['frozen','chilled'] }, mult:2.0, consume:['frozen','chilled'], apply:{wet:{dur:8}},
    surface:{ op:'meltIce' }, fx:'rx_melt', p:0 },
  { id:'melt', variant:'ice', match:{ trigger:'ice', aura:['burning'] }, mult:1.6, … },
  { id:'judgment', family:'blessing', match:{ trigger:['physical','light','*fallback'], aura:['radiant'], minStacks:'threshold',
    requireTag:['heavy','charged','finisher'], orStat:'judgmentAnyLight' }, cdTarget:6, cdBoss:12, consumeAllStacks:true, bossBreak:20, custom:'judgment', p:0 },
  { id:'burgeon', match:{ trigger:'fire', object:'pod' }, … },
  { id:'electro_water', fusion:true, match:{ trigger:'lightning', zone:'water' }, … },
  { id:'pollen', swirlVariant:true, match:{ trigger:'wind', aura:['seeded'] }, … },
  …   // all 49 reaction entries from DESIGN §4.3 (variants share an id); every entry has `family` (DESIGN §4.5) and `p` (0 = P0, 1 = P1)
];
```
- **Index at load:** `BY_TRIGGER[el]` = entries whose trigger matches `el`, sorted by aura. There is no linear scan over 49 entries per hit.
- **Evaluation (the DESIGN §4.5 priority rule):** `react(target, el, hit, point)`:
  1. If `hit.object` is set, use `reactObject`.
  2. Otherwise, walk `target.auraOrder` newest first. For each aura, look up `BY_TRIGGER[el]` and take the first entry that is not on cooldown (1.0 s per target per id, plus `cdTarget`/`cdBoss`).
  3. Then the judgment fallback.

  At most one reaction fires per target per hit. When one fires:
  - It consumes the auras. A 상극 (`opposite:true`) entry removes the aura completely, stacks included.
  - It applies `mult × stats.reactionDmg(id)` (only for player sources).
  - It applies statuses through `applyStatus` with `extra`.
  - It calls `custom` handlers (`reactions.js` exports `HANDLERS[id](ctx)`).
  - It performs `surface` ops through `world.surface` / `world.surface2`.
  - It spawns objects through `game.spells.api.objects`.
  - It plays `vfx.preset(fx)`. **It does not call `hitFeel`**: the reaction raises the hit's tier to `'reaction'` instead (§8.3).
- `previewReaction(target, el): {id, nameKo, family}|null` is the same evaluation without side effects. ui uses it for the "다음 타격" hint (DESIGN §4.1). It is called at most at 10 Hz.
- `export const REACTIONS = REACTION_DEFS.filter(uniqueById).map(r => ({id, name:r.nameKo, desc, elements, fusion, family}))`
  stays in `combat.js` for the codex. It keeps the old 19 entries first, in the same order.
- **Object and zone reactions** (pods, crystals, ice pillars, puddles, tornadoes, lava, blight) are evaluated by `combat.reactObject(obj, el, hit)`. Spells and zones call it whenever a skill hit overlaps an object or zone. Zone fusions never use up the target's reaction (DESIGN §4.5 step 2).
- **Cascade control:**
  - An object burst caused by another burst (pod → pod, fire.rx explosions, eclipse, wildfire spread, electrocute or blackbolt chains) is **queued** with a 0.08–0.12 s stagger. The chain depth is capped at 3 per frame.
  - At most **4 full reaction presets per frame**. Extra ones play `preset(fx, {reduced:true})`, which uses a quarter of the particles and no decal.
  - Pool sizes come from DESIGN §12 only.
- Existing zone fusions in `spells/zones.js` may keep their own logic. They must still call `combat.discover(id)` and emit `zoneCombo`.

### 8.3 dealDamage additions & the canonical damage formula

**New hit fields** (all optional):

| Field | Meaning |
|---|---|
| `hit.skillId` | the skill that caused the hit |
| `hit.slot` | its slot |
| `hit.poise` | break/poise damage; default `amount × 0.5` |
| `hit.tier` | `'light'`, `'heavy'`, `'crit'`, `'reaction'`, `'ult'`, `'break'`; set by the attacker (melee, archetypes) |
| `hit.hitstop` | an explicit override (melee only, rare) |
| `hit.charged`, `hit.finisher` | booleans |
| `hit.backstab` | boolean, computed by combat if the source faces the target's back within ±60° |
| `hit.object` | the object entity the hit collided with (pods, crystals, …) |
| `hit.castMul` | from the resonance `nextMul`, set by skills |
| `hit.isDot` | DoT tick: no crit, no hitFeel, uses `hit.powerSnap` |
| `hit.lifesteal` | fraction |
| `hit.ignoreShield` | boolean |
| `hit.heal` | for ally heals; `team:'player'` targets only |

**The canonical formula (the only place where outgoing player damage is scaled).** Inside `combat.dealDamage`, when `isPlayerSource(hit)`:
```
final = base                                   // unscaled number from data / legacy defs
      × power(level)                           // stats.derived().power; DoT ticks use hit.powerSnap taken at application
      × progression.damageMul(el)              // mastery ONLY
      × stats.get('atkMul') × stats.elementDmg(el) × (hit.castMul || 1)
      × conditional(target)                    // exposed, hexed, corroded, radiant(light), broken, backstab, quickened flat added last
      × reaction                               // mult × stats.reactionDmg(id) × family bonus
      × resist(target, el)
      × crit                                   // chance = stats.derived().crit + stats.get('critChance'); mul = 1.5 + stats.get('critMul')
```
- **Forbidden elsewhere:** archetypes, legacy defs, sword and spells pass unscaled base amounts.
  - `sword.js:121` (`* pl.mods.atkMul`) is deleted by melee.
  - `ctx.powerForDisplay` is for tooltips only.
  - The hard-coded crit at `combat.js:426` is replaced with the stats crit.
- Enemy → player hits use `× source.zoneDmgMul × difficulty.dmgMul`, then `× stats.get('dmgTakenMul')`.
- **Pipeline order:**
  1. invulnerable
  2. `target.onBeforeDamage?.(hit)`, which the player uses to snapshot HP (§10.3)
  3. block hook
  4. voidShield
  5. react
  6. the formula above
  7. HP
  8. lifesteal
  9. break gauge
  10. awakening
  11. statuses
  12. knockback
  13. **hitFeel**
  14. `target.onHit` / `onDeath`

**hitFeel has a single caller.** Only `combat.dealDamage` calls `vfx.hitFeel(tier, pos, dir, el)`, once per non-DoT hit. The tier is
`max(hit.tier, reacted ? 'reaction' : _, crit ? 'crit' : _, killed ? +bonus : _)`.
- The old per-hit shake/hitstop computation (`combat.js:476-510`) is replaced by the table lookup.
- It keeps the existing **0.12 s rate limit** for spell volleys and the **3–4 frame minimum** hitstop.
- Melee no longer calls `game.hitstop` itself. It sets `hit.tier` (and `hit.hitstop` for rare overrides). Skills and reactions never call `hitFeel`.

**New combat API:** `statusInfo`, `previewReaction`, `reactObject`, `REACTION_DEFS`, `STATUS_DEFS`, `addBreak(target, n)`, `isBroken(t)`,
`healPlayer(amount, source, {hot=false})`, `registerAlly(entity)`, `unregisterAlly(entity)`.
- `healPlayer` respects `stats.healMul`, emits `heal`, and in boss fights clamps HoT sources so that HoT plus regen stay ≤ 5% maxHp/s (DESIGN §7).
- Allies are valid enemy targets through `enemies.getThreatTarget` (§14).

### 8.4 Break gauge & void shield (`src/combat/break.js`)
**Break gauge:**
- Entities with `entity.breakMax` (elites 60, mid-bosses 100–150, the final boss phases 150–200) have `entity.breakValue`.
- Hits subtract `poise × mod`:

| Hit | Break modifier |
|---|---|
| earth / lightning | ×1.5 |
| reaction | ×3 |
| target `encrusted` | ×1.2 |
| parry (via `blocked` event with `parried`) | +15 flat |
| `rooted` on a boss | +40 |

- At 0: emit `break {target}`, apply `broken` for 4 s (+50% damage taken; `target.onBreak?.()`), set `timeScale.set('break', 0.05, 0.25)`, then refill after 6 s. While broken, the gauge doesn't drain.

**Void shield:**
- `entity.voidShield` (0–100, numeric only). While it is above 0, damage is ×0.3.
- Depletion per hit is `poise × factor`: light ×4, reaction ×2, other ×1. A break empties it at once.
- Emits `voidShieldBroken {target}`.

### 8.5 Resonance / 원소 교향 (`src/combat/resonance.js`)
- Tracks the reaction ids per target over a 6 s window. When it sees 3 distinct ones, it emits `resonance {target, ids}` and calls
  `game.stats.set('rx:resonance', {freeNext:true, nextMul:1.3}, {duration:8})`.
- Skills consume it on the next cast (§7.2 step 6).
- Internal cooldown 10 s.
- The mage signature is kind `attunement` (원소 연쇄). It is a separate mechanic and never listens to `resonance`.

---

## 9. Events (all new and changed; canonical names and payloads)

| Event | Payload | Emitter |
|---|---|---|
| `classChosen` | `{cls}` | progression |
| `xpGained` | `{amount, source, level, xp, xpToNext}` | progression |
| `levelUp` | `{level, pointsGained}` | progression |
| `pointsChanged` | `{points, reason}` | progression |
| `skillLearned` / `skillUnlearned` | `{id, rank, element}` | progression |
| `respec` | `{}` | progression |
| `spiritFreed` | `{element}` | progression (called by story) |
| `lumielFeather` | `{}` | progression (when 2 of water/shadow/nature are freed) |
| `classChanged` | `{from, to}` | progression (altar class change; followed by `respec`) |
| `statsChanged` | `{}` | stats, at most once per frame |
| `skillCast` | `{id, element, slot, cls, family, origin}` | skills, exactly once per cast |
| `spellCast` (legacy) | `{element, kind, spellId}` | exactly once per cast, by the code that performs it (§7.2 step 4) |
| `skillFail` | `{id, reason:'resource'\|'cooldown'\|'locked'\|'cantAct'}` | skills (also emits legacy `spellFail`) |
| `attuneChanged` | `{element, prev}` | skills. Skills also emits the legacy `elementChanged {element, index}` **once**; the spells/sword setters it calls run with `{silent:true}` |
| `loadoutChanged` | `{slot, id}` | skills |
| `signatureChanged` | `{kind, value, max}` | skills/classkits |
| `familiarSpawn` / `familiarEnd` | `{element}` | skills |
| `reaction` | `{id, name, point, target, elements, variant?, family}` (shape extended) | combat |
| `reactionDiscovered` | `{id}` (unchanged) | combat; progression listens → `addXp(60,{kind:'reaction',id})` |
| `break` / `breakRecover` | `{target}` | combat |
| `voidShieldBroken` | `{target}` | combat |
| `resonance` | `{target, ids}` | combat |
| `heal` | `{target, amount, source}` | combat |
| `objectSpawn` / `objectBurst` | `{kind:'pod'\|'crystal'\|'mine'\|'droplet'\|'soul'\|'flower'\|'turret', point}` | spells |
| `crystalPickup` | `{element}` | spells |
| `hpRegenStart` / `hpRegenStop` | `{rate}` / `{reason}` | player |
| `focusStart` / `focusEnd` | `{}` | player (ranger) |
| `zoneEnter` / `zoneExit` | `{zoneId, name, level}` | world |
| `interactChanged` | `{id, label}\|null` | core (`game.interact`) |
| `gateTravel` | `{from, to}` | world |
| `shrineFound` | `{id, kind:'seed'\|'landmark'\|'spirit'}` | world; progression listens (seed → +1 point + 300 XP, landmark → 80 XP) |
| `bossSpawn` | `{boss, id, name, title, sub, phases:[{at:0.66, name}], parts?:[{id,name}], locks?:[{partId, lock, counters}]}` (**extended**) | enemies |
| `bossPhase` | `{boss, id, phase, name}` | enemies (bosses) |
| `bossDefeated` | `{boss, id, name, final:boolean}` (**extended**; `final` only for nidhoggra) | enemies |
| `bossCheck` | `{id, kind:'stagger'\|'rods'\|'tide', duration, state:'start'\|'success'\|'fail'}` | enemies (bosses) |
| `lockStripped` | `{boss, partId, lock, by:'counter'\|'reaction'\|'gift'}` | enemies (finale) |
| `giftReady` / `giftUsed` | `{element, purpose}` | enemies (finale) |
| `victory` | `{stats}` from `enemies.getRunStats()` — emitted **exactly once**, by **story**, **only** after `bossDefeated{final:true}` and the ending cinematic. Enemies no longer emit it. Story no longer *listens* to it | story |
| `questStart` / `questComplete` | `{id, title}` (stage ids per §17) | story |

The existing events (`damage`, `kill`, `playerHurt`, `blocked`, `parry`, `perfectDodge`, `updraftEnter/Exit`, …) are unchanged.
- `kill` gains `xp` and `zoneLevel`. Enemies set `target.xpValue` and `target.zoneLevel`, and progression awards XP from that only when `xpValue > 0`. Props, barrels and dummies have `xpValue = 0`.

---

## 10. Player v3 (owner **player**)

### 10.1 Class setup
- `player.setClass(cls)` accepts the 6 ids.
- `player/classes.js` builds **every** class's gear **before** `skinMerge` at boot:

| Prop | Sockets |
|---|---|
| bow | `tip` = arrow nock, `base` = grip, plus a `string` handle |
| hammer | `tip`, `base` |
| shield | — |
| twin daggers | `tipL`, `tipR` |
| totem | `tip` = head charm |

  It also uses the existing staff and longsword.
- `setOutfit(cls)` generalizes to `CLASS_OUTFITS[cls] = {show:[...], hide:[...], tint:{robe, trim, cape}, tex?:{...}, weapon, offhand?}`.
  All props share the existing materials. Budget: +0 draw calls, ≤ +18k triangles total.
- `entity.name` comes from `CLASS_DEFS[cls].nameKo`.
- Base stats come from `game.stats.derived()`. **Remove the hard-coded 100 MP.** Use `player.maxMp`, `maxResolve`, `maxStamina` and `maxHp`, refreshed on `statsChanged`, so the current value keeps the same percentage.
- `player.mods` becomes the getter view of §5, and nothing writes it.
- New API:
  - `player.spendStamina(n): boolean` (dodge, block, glide, sprint)
  - `player.spendResolve(n): boolean` (melee skills; `player/resource.js`: regen 6/s + `resolveRegenAdd`, +2 per landed hit, +4 per reaction)
  - `player.resource` (`'mp'|'resolve'`)
  - `player.getWeaponTip(which='main'|'off')`
  - `player.family`, `player.style` (from `familyOf`/`styleOf`)
  - `player.inCombat(): boolean` (§10.3)
  - `player.lastHurtT`
- **Binary class audit** (player owns every site): `player.js:227,231,238,243,246,265,280,328,339,342,343,452,461,463,497,522-524,684,693,706,711,713,718,763,901,923,928,960,979,988,1013,1025` and `player/swordsman.js:238`. Each becomes a `KITS[cls]` lookup or a `familyOf` check.

### 10.2 Kits (`player/kits.js`)
`KITS[cls] = { dodge:{type, dist, iframes, cost, cd?}, defend:{type, …}, aim:boolean, stance:'mage'|'sword'|'ranger'|'paladin'|'spirit'|'shadow' }`

All the binary `cls==='sword'` branches become kit lookups. The behaviours follow DESIGN §2.2:

**Dodge types:**

| Type | Behaviour |
|---|---|
| `blink` | existing |
| `dashstep` | existing sword |
| `backflip` | 6 m backwards, 0.3 s i-frames |
| `shieldstep` | 4 m, super armor |
| `spiritswap` | 5 m blink plus a decoy that absorbs 1 hit |
| `shadowroll` | 0.4 s i-frames; perfect dodge teleports behind the attacker |

**Defend types:**

| Type | Behaviour |
|---|---|
| `barrier` | existing |
| `guard` | existing sword guard/parry |
| `shield` | 85% frontal block, perfect window 0.2 s → parry; Lv10 talent reflects projectiles |
| `ward` | 60% damage reduction dome with a capacity of 35% maxHp and an 8 s recharge |
| `counter` | 0.3 s counter stance; on hit: negate the hit, teleport behind, `nextCrit` |
| `focus` | ranger: hold E while airborne, gliding, or ≤ 0.6 s after a dodge → `game.timeScale.set('focus', 0.35, 0.2)`, refreshed each frame, and `clear('focus')` on release. The player moves at full speed (via `timeComp`, §3.3); drains 25 stamina/s; emits focusStart/End |

- Parry windows add `stats.parryWindowAdd`, and +0.1 s against a `dazzled` attacker.
- Aiming (the raycast cone) is enabled for `aim:true` classes: mage, ranger and spiritcaller.

### 10.3 HP regen (`player/regen.js`, DESIGN §7)
- **Net loss tracking (not the damage event):**
  - In `player.onBeforeDamage(hit)` (called by combat, §8.3 step 2), snapshot `hpBefore = hp`.
  - In `onHit`/`onDeath`, which run after the block refunds and after `dmgTakenMul` (the refund at `player.js:204` moves *before* this point), set `lastHurtT = game.time` **iff `hp < hpBefore`**.
  - DoT ticks go through `dealDamage`, so they are covered. The 1-damage minimum on partially blocked hits (`combat.js:431`) counts, because HP dropped.
- **`inCombat()`** = `game.time − lastHurtT < 3` **or** `game.enemies.anyAggroWithin(player.position, 30)`. Dealing damage does not count.
- **Each frame**, in `player.update` after the resource regen:
  - `delay = (inCombat() ? derived.regenDelay /*5*/ : derived.regenDelayOOC /*3*/) + stats.get('regenDelayAdd')`, floor 1.0.
  - In a blessed zone, `delay × 0.5`. The test is `world.surface2?.isBlessed(pos)` or `game.spells.api.zones.isInside('holy', pos)`.
  - This is **re-evaluated every frame** against `game.time − lastHurtT`.
  - `rate = (inCombat() ? regenRate /*1.5%*/ : regenRateOOC /*8%*/) × regenRateMul + regenRateAdd`. Add 1%/s in a blessed zone. Multiply by 0.6 in a boss fight. It eases in over 1 s.
  - The heal goes through `combat.healPlayer(amount, 'regen', {hot:true})`, so the boss HoT cap applies.
  - **Disabled** when dead/dying, `stats.get('regenDisabled')`, or the `blight` status.
- `player.regen = { active, delay, delayLeft, inCombat, rate }` is a read-only object, reused every frame. `game.debug.regenState()` returns it.
- Emits `hpRegenStart {rate}` and `hpRegenStop {reason}`. Spawns motes through `vfx.burst`, pooled, 2 per 0.3 s.

### 10.4 Animation (player/poses.js, springs.js, ik.js)
- `playCast(kind)` accepts these kinds:
  - existing: `basic`, `heavy`, `ultimate`
  - new: `throw`, `slam`, `channel`, `summon`, `buff`, `beam`, `bowDraw`, `bowRelease`, `totemRaise`
  - unknown kinds fall back to `basic`
- Each kind has `{antic, strike, hold, recover}` timing.
- New layers:
  - dodge pose per kit
  - directional hurt (from `hit.direction`)
  - hard-landing recovery (fall > 6 m)
  - idle fidgets per stance every 8–14 s
  - turn lean
  - breathing
  - head look-at
- Spring chains for hair/scarf, totem charms, quiver feathers and tabard. They must be built pre-merge, or driven as bones.
- Two-bone foot IK on `world.getGroundHeight(x, z, footY)`, player only. Enemies are handled by the enemies owner.
- All of it uses pre-allocated scratch objects. Springs and IK run at full rate (it's the player).

### 10.5 Platforms and bounds
- Player movement uses `world.getGroundHeight(x, z, yHint)`. That function includes the small stand-on platforms near `yHint` (§13).
- When standing on a platform that has a `delta` (a moving obsidian slab, the rare case), the player adds `handle.delta` each frame.
- `world.clampToBounds(pos)` replaces the radial clamps at player.js L409 and L839. It includes the root plateau AABB.
- There is no kill plane. Falls are ordinary fall damage on terrain.

---

## 11. Spells v3 (owner **magic**) — `game.spells.api`

```ts
game.spells.castById(spellId, opts?:{free:true, charge, aim}): boolean     // legacy defs, gating bypassed (skills gated); emits spellCast once
game.spells.setElement(i, {silent=false}={})                               // silent:true when called by skills.attune
game.spells.api = {
  projectiles: { spawn(opts) },                  // existing opts + element generic for 9 elements; opts.mesh 'arrow'|'wisp'|'thorn'|'bubble'|'shadowbolt'|'lance' (pooled meshes)
  zones: { spawn(type, pos, opts), isInside(type, pos): boolean, list },   // NEW types: 'water' (exists), 'mud', 'holy', 'miasma', 'spore', 'overgrowth', 'flood', 'spring', 'vortex'(=tornado alias), 'sand'
  objects: { spawn(kind, pos, opts), near(kind, pos, r, out), burst(obj, el, hit) },
                                                 // kinds 'pod'(16), 'crystal'(8), 'mine'(6), 'droplet'(12), 'soul'(8), 'flower'(4), 'turret'(2), 'rod'(4) — DESIGN §12
                                                 // bursts triggered by bursts go through combat's stagger queue (§8.2)
                                                 // InstancedMesh per kind, one draw call each; objects call combat.reactObject when hit
  aoe(center, r, hitSpec), cone(origin, dir, len, angle, hitSpec), line(a, b, width, hitSpec), chain(from, n, range, hitSpec),
  beam({origin, dir, len, width, dur, tick, hitSpec, prism}),      // prism: refract at ice pillars, crystals, frozen enemies (≤ 3 segments)
  decalRing, later, laterReal, terrain:{ignite, extinguish, chill, soak, wind},  // existing S toolkit, element-generic
  nearestEnemy, aim(): {point, dir, target},
}
```
- `STATUS_OF` becomes `ELEMENT_DEFS[el].status`.
- Infusion (`projectiles.js`) is generic: its tint comes from `ELEMENT_DEFS`.
- Remove the `for i<5` Digit loop when `game.skills?.ownsInput` is set. Keep it in legacy mode.
- `spells.getHudState()` remains in its v2 form for legacy mode.
- `spells.isActive()` is now true only in legacy mode. In v3, `game.skills` drives casts.
- **Buffs:** `spells/master.js:455-474` writes to `player.mods`. Convert it to `game.stats.set('buff:'+id, def.mods, {duration})` and delete the save/restore code (§5).
- **Audit:** `spells.js:23,30,413` (5-element maps, §3.1); `spells.js:137,469` (`cls==='mage'` → `familyOf(cls)==='caster'` in legacy mode only); `spells.js:436` (`story.hasPrompt()` → removed, since F is interact only); `spells.js:224,331` (`game.slowmo` → `timeScale.set('ult'|'parry', …)`).
- **Archetypes:** `src/spells/archetypes.js` registers the **caster** implementation of all 24 archetypes (§7.3) via `game.archetypes.registerArchetype(name, 'caster', fn)` in the spells **factory**.
- Every per-element tint on a pooled mesh is a uniform or an instance colour. Never toggle a material's program-key flags.
- New zone visuals use the existing shared materials (`fresnelMat`, `rainMat`, …) recoloured per element: ≤ 1 draw call per zone instance.
- The magic owner also **implements the bespoke caster forms** for these skills and registers them through
  `game.archetypes.registerImpl(id, 'caster', fn)`:
  - new-element capstone awakened ultimates
  - `water.ult` (flood)
  - `nature.ult`
  - `light.ult` (beam)
  - `shadow.ult` (black hole)
  - `nature.treant` (summon visuals)
- New-element finishers go through `game.cinematic.finisher({element, cls, …})`, which works for all 9 elements.

---

## 12. Melee v3 (owner **melee**) — `game.sword.api`

```ts
game.sword.api = {
  startAction(spec), hitCircle, hitLine, applyHit, findTarget, after, every,      // existing engine, exposed
  weapon(): WeaponProfile,                    // from sword/weapons.js by player.style: longsword | hammer | daggers
  playLegacy(element, kind, opts): boolean,   // kind: 'combo'|'heavy'|'ultimate'|'ultimateAwakened'|'support'|'finisher'; emits spellCast once
  setElement(el, {silent=false}={}),
  playClassCombo(element), playClassCharged(element, frac),   // paladin / shadowblade base movesets with element payload
  TPL,                                        // pose templates (+ new: hammerSlam, shieldBash, daggerFlurry, daggerCross, backstab, reverseSlash)
}
```
- **WeaponProfile:** `{id, reachMul, arcMul, speedMul, hitstopMul, trail:{width, color}, smear:'arc'|'wide'|'twin', tips:['tip']|['tipL','tipR'], twoHanded}`.
- The engine reads `player.getWeaponTip()`. **Remove the hard-coded 5-element `AMB`/`PAL`/`STATUS3` maps.** Use `ELEMENT_DEFS`, plus melee-only extras that are keyed by element and default safely for unknown ones.
- Cooldowns become **per skill id** (via `game.skills`) in v3. Sword's kind cooldowns (`heavy`, `ultimate`, `support`) remain only for legacy mode.
- The melee owner implements:
  - the melee presentations of the **new elements' basic and charged** attacks (DESIGN §6.9–6.12): water/nature/light/shadow combo 4th hit and charged
  - **paladin** and **shadowblade** base movesets (DESIGN §2.2)
  - bespoke melee forms of the four new ultimates, registered with `game.archetypes.registerImpl(id, 'melee', fn)`
  - the **melee** implementation of all 24 archetypes in `src/sword/archetypes.js` (§7.3), registered in the sword **factory**
- `hit.tier` is set on every melee hit (`light`, `heavy`, `crit`, `ult`). **Melee no longer calls `game.hitstop` itself**: combat's hitFeel is the single source (§8.3). Weapon `hitstopMul` is passed as `hit.hitstopMul`.
- **Damage:** delete the `pl.mods.atkMul` multiply at `sword.js:121`. Base amounts are unscaled (§8.3).
- **Buffs:** `sword.js:521-530` (`startBuff`) becomes `game.stats.set('buff:'+id, def.mods, {duration})`, and the save/restore code is deleted.
- **Audit:** `sword.js:50` (`active = cls==='sword'` → `familyOf(cls)==='melee'`, which turns the engine on for paladin and shadowblade), `sword.js:728,768` (class literals), `sword.js:577,579,610,667` (5-element maps), `sword.js:689` (`story.hasPrompt()` → removed).
- Melee skills spend **투지** via `player.spendResolve`. Stamina stays for dodge/block.

---

## 13. World v3 (owner **world**)

**Ground rule (resolves the sky/getHeight trap):** every arena is on real terrain. The root plateau and the Kalis ledge are
**terraformed heights** in the existing grid. So all 21 `world.getHeight(x,z)` call sites (spells, zones, decals, crawlers,
enemies/common.js, loot, vfx, cinematic) stay correct without changes. Floating islands are scenery only. Platforms exist
only for small, short-lived stand-on objects (ice pillar top, glacier block, ice bridge, stepping stones, obsidian), and only
the player stands on them.

```ts
world.zones: [{ id:'village'|'plains'|'ruins'|'mirwen'|'elderwood'|'ascent'|'plateau', name, center:Vector3, radius, level:[min,max],
                grade?: 'dusk'|'void'|'golden'|null, music:'village'|'field'|'mirwen'|'elderwood'|'sky'|'final_boss', fuel:boolean,
                arena?: {id, position, radius} }]
world.getZoneAt(x, z): zone                // emits zoneEnter/zoneExit (checked at 4 Hz)
world.bossArenas: { golem:{...existing bossArena}, hydra:{position(-82,·,-80), radius:20}, nox:{(64,·,-48), r:14},
                    treant:{(92,·,-80), r:22}, kalis:{(60,·,-150), r:18}, nidhoggra:{(108,·,-132), r:34, pillars:[5 × {pos, top}]} }
                                           // y of every arena = terrain height (getHeight), never a constant
world.bossArena                            // kept = bossArenas.golem
world.getHeight(x, z)                      // unchanged: terrain incl. the terraformed plateau/ledge/Mirwen basin
world.getGroundHeight(x, z, yHint)         // max(getHeight, spire, ice, platforms whose top ≤ yHint+1.2) — the PLAYER's ground
world.addPlatform({id, shape:'disc'|'box', center, r?|size?, top, life?}): handle   // handle {id, top, velocity:Vector3, delta:Vector3}; static unless moved by its owner
world.removePlatform(handle)               // platforms live in an 8 m grid bucket; getGroundHeight checks only the cell of (x,z); ≤ 16 alive
world.addTempCollider({shape:'box'|'cyl', pos, size|r, h, yaw, life, blocksProjectiles, onProjectile?:(p)=>'block'|'reflect'}): handle; world.removeCollider(h)
world.collidersBlockingProjectiles          // live array read by enemies/projectiles.js and spells projectiles (8 m bucketed query: world.projectileBlockAt(p, out))
world.addUpdraft({pos, r, h, strength, life?}): handle    // static/temp updraft volumes, merged into surface.getUpdraft(pos)
world.clampToBounds(pos): void             // circle r 170 plus the plateau/ledge AABBs
world.gates: [{id, zoneId, position, name}]; world.travelTo(gateId)   // fade 1.2 s, teleports player, emits gateTravel
world.respecSpots: Vector3[]               // altar + gates
world.shrines: [{id, kind:'seed'|'spirit'|'landmark', position, found}]; world.markShrine(id)   // proximity 3 m → shrineFound
world.setActVisible(act: 1..5)             // shows/hides zone dressing (scenery islands hidden < 4)
world.setRotWalls(state) / world.burnRotWall(id) / world.purifyRotWall(id) / world.smashRotWall(id)   // Elderwood blockers (colliders)
world.surface2: { mud(pos,r,s), bless(pos,r,s), curse(pos,r,s), overgrow(pos,r,s), rubble(pos,r,s),
                  isBlessed(pos), isCursed(pos), isMud(pos), surfaceAt(pos): 'none'|'mud'|'blessed'|'cursed'|'overgrowth'|'rubble' }
                                           // reuse surface.js grid (172², 2 m) + active lists at 10 Hz; tint via burn texture B/A channels
world.setShrineGlow(id, on)                // generalized from setAltarGlow; altar shows 9 pillars (ring over ALL_ELEMENTS)
world.serialize() / world.deserialize(o)   // gates reached, shrines found, rot walls, act visibility, camps cleared
```
- **Interact offers:** world registers `game.interact.offer` for gates (→ `ui.openGateMenu`), shrines and rot walls. It never reads F itself.
- **Zone placement** follows DESIGN §8.2:
  - **Mirwen.** Terraform an ellipse at (−80, −72), rx 30, rz 24, to WATER_LEVEL − 2.5. The mesa at (−96, −70) becomes a waterfall cliff. Add 8 islands and ruins. The hydra arena is at (−82, −80), r 20, with 6 pillars at r 14.
  - **Elderwood.** Centred at (82, −62), r 32. Instanced mushrooms in 3 sizes, root arches, rot walls ×3, 녹스's glade at (64, −48), the grove at (100, −66), and the treant hollow at (92, −80), r 22 (mesa (108, −92) becomes the cliff).
  - **Root plateau** (108, −132), r 34. Terraform a +38 m mesa with cliff sides and 5 root-pillar spires (h +12 m, r 3) at r 22, plus static spirit updrafts at each pillar.
  - **Kalis ledge** (60, −150), r 18, +24 m.
  - **Ascent.** Static updraft columns and root ramps run arena → ledge → plateau. Scenery islands I1–I5 float overhead (merged, ≤ 12 calls, no colliders).
  - **Gates.** Village (−6, 126), Mirwen shore (−56, −58), Elderwood edge (60, −40), the arena top (0, −110), and the Kalis ledge.
  - **Seed shrines.** Exactly 8, at the locations listed in DESIGN §8.2.
- Every new zone must also update `flora allowed()` exclusions, the vertex-colour loop and the signposts.
- `world.getHeight` call sites inside world (`world.js`, `flora.js`, `structures.js`, `surface.js`, `terrain.js`, `village.js`) need no change. Their output simply includes the terraform.

**Budget:**
- Per-scene targets (DESIGN §12). ≤ 15 draw calls per zone; zone dressing culls at drawDistance × 0.6 and casts no shadows. ≤ 12 calls for the scenery islands.
- Terrain triangle count is unchanged (no grid resize).
- During the plateau fight, world forces flora LOD low and turns off shadow casting for far terrain chunks (`world.setBossFightLOD(on)`, called by enemies on the nidhoggra spawn and despawn).

**Village altar** (`village.js`): pillars and crystals loop over `ALL_ELEMENTS` (9) with `InstancedMesh(…, ALL_ELEMENTS.length)`. Add the
5 mentor/sage spots to `npcSpots` (`rangerMentor`, `paladinMentor`, `spiritMentor`, `shadowMentor`, `sage`) and the **reaction trainer dummy** spot.
The NPCs use the merged villager pipeline (≤ +12 calls total).

---

## 14. Enemies v3 (owner **enemies**)

```ts
enemies.FACTORIES += { lizard, shroom, wolf, wraith, voidknight } + chuchu variants water/nature/light/shadow
enemies.spawn(type, pos, opts:{zoneId, level, element?, elite?:boolean})
enemies.encounters.load(zoneId) / unload(zoneId)        // encounters.js table: {zoneId, groups:[{pos, r, spawns:[{type,count,opts}], onCleared}]}
                                                        // lazy spawn on zoneEnter, despawn > 120 m or zoneExit+30 s; ≤ 18 alive
enemies.scaling(zoneId): {hpMul, dmgMul, level}         // DESIGN §5.3; sets e.zoneDmgMul, e.zoneLevel, e.xpValue
enemies.bosses: { register(id, factory), get(id), gift }  // golem (existing) + filled by bosses/index.js, which is loaded in init:
                                                        //   import('./enemies/bosses/index.js').then(m => m.registerBosses(api)).catch(warnOnce)
enemies.spawnBoss(id, opts?): entity                    // uses world.bossArenas[id]; calls prewarmBoss(id) behind a fade first; emits bossSpawn (extended payload)
enemies.prewarmBoss(id): Promise                       // IDEMPOTENT; builds the model once and compiles with renderer.compileAsync;
                                                        // called by spawnBoss, story.debugSkip, save load and the act-earlier cinematic
enemies.boss                                            // current boss entity (audio/ui read this)
enemies.getObjective(): { phase:'camps'|'boss'|'zone'|'done', zoneId, campsCleared, campsTotal, boss, groupsLeft }
enemies.inCombat: boolean                              // any aggro within 30 m (legacy flag)
enemies.anyAggroWithin(pos, r): boolean                 // used by player.inCombat()
enemies.setTauntTarget(entity|null, dur): void          // ally taunts (treant, stone totem, water clone): enemies in range retarget
enemies.getThreatTarget(e): entity                      // AI target resolution: taunt target if alive & in range, else player
enemies.setPlayerStealth(mul, dur): void                // sight range ×mul (shadow.sup, 은신, 유령, raven swarm); 0 = lose track
enemies.getRunStats(): {kills, time, maxCombo, reactions}   // victory payload, read by story
enemies.debugDefeat(id?): void                          // forces the current boss through its proper defeat path (Nox purify, Kalis's 2nd life, etc.)
// projectiles.js: before moving, query world.projectileBlockAt(p); on 'block' despawn, on 'reflect' call p.onReflect?.() and flip team
```
- **Golem changes:**
  - It no longer triggers victory. On its death, emit `bossDefeated {id:'golem', final:false}`.
  - The `victoryT` / `victory` emission moves to story, which emits victory only on `final:true`.
  - The `allCampsCleared → spawnBoss('golem')` path stays.
- **bossbase.js** is the shared framework, used by every boss in `src/enemies/bosses/`:
  - HP phases with names
  - invulnerable transitions that call `opts.onPhase(i)`
  - break gauge setup
  - voidShield
  - weak-point sub-entities: `addPart({id, name, hp, offset, radius, height, mul, element?, shield?, onBreak})`, each registered with combat as `team:'enemy', isBossPart:true` and forwarding to the parent through `onHit`
  - per-phase checkpoint: `respawnPhase()` on player death restores the phase start
  - arena clamp
  - telegraph helpers: `vfx.telegraph`
  - music hint
- **Hit reactions and poise** follow DESIGN §9 A2. **Telegraphs** use the fx `vfx.telegraph` API, falling back to the existing common.js ring.
- **Dissolve on death** uses `vfx.dissolve(entity)`, falling back to the existing `dissolveFx`.
- **Ownership:** enemies owns the regular enemies, the framework **and** all bosses (`src/enemies/bosses/*`). Bosses stay in their own folder, loaded dynamically, so a broken boss file never breaks the enemies module.
- **AI targeting** goes through `getThreatTarget(e)` in `enemies/common.js` and every factory. Nothing targets `game.player` directly any more.
- **Renamed mobs** (DESIGN §14): 츄츄 → 말랑이, 보코블린 → 뿔도깨비, 주술사 → 도깨비 주술사. This changes only the `nameKo` data. Ids stay.
- **XP:** set `xpValue` per DESIGN §5.1, with 0 for props and dummies. Set `zoneLevel` from `scaling()`, default 1.
- **Scaling:** `scaling(zoneId)` reads the act order (`story.regionOrder`) so that the second region uses the Act 3 row (DESIGN §5.3). Multiply by the difficulty (§19).
- **Audit:** `enemies.js:155` (`game.slowmo` → `timeScale.set('bossDeath', …)`); `enemies.js:37` and `enemies/common.js:321,337` stay on `getHeight` (terrain-only is correct now).

**New mobs** (stats at zone level 1 before scaling; scaled by `scaling()`):

| Type | 이름 | HP | Behaviour |
|---|---|---|---|
| `lizard` | 수렁도마뱀 | 160 | spear thrust + a lunge out of water; resists water 0.5 |
| `shroom` | 포자 버섯병 | 120 | lobs spore clouds (seeded on the player = poison), slow |
| `wolf` | 타락 늑대 | 110 | pack of 3, circles and darts; void |
| `wraith` | 공허 망령 | 140 | teleports, void bolt; voidShield 60 |
| `voidknight` | 공허 기사 | 420 (elite) | guard stance, voidShield 100, breakMax 60 |

---

## 15. Bosses (owner **enemies**) — `src/enemies/bosses/*`

`index.js` exports `registerBosses(api)`, which calls `api.bosses.register(id, factory)` for
`hydra`, `nox`, `treant`, `kalis` and `nidhoggra`.
- Each factory is `(ctx, arena) → entity` and is built on `bossbase.js`.
- Mechanics and numbers follow DESIGN §8.5–8.6.
- Each boss must:
  - support `prewarm()`, which `enemies.prewarmBoss(id)` calls (idempotent);
  - emit `bossPhase`, `bossCheck` and `bossDefeated {id, name, final:id==='nidhoggra'}`;
  - implement `debugPhase(n)` and `debugDefeat()`;
  - keep its draw calls within the budget: 20 for each mid-boss, 40 for the final boss.
- **P0 per boss:** spawn, 2–3 telegraphed attacks, phase thresholds and the signature mechanic in its simplest form. Those are: hydra head shields + a frozen-lake ring; Nox voidShield + parryable teleport + purify-on-0; treant burnable plates + kneel weak point; Kalis kit-copy of the top-2 elements + one revive; nidhoggra phases 1–2.
  **P1:** everything else in DESIGN §8.5, plus nidhoggra phase 3. Its fallback is the cut line 3 in DESIGN §8.6.

**니드호그라 (Nidhoggra)**, split across `nidhoggra.js` (logic) and `nidhoggra_model.js` (spline-instanced body):
- The fight is on the root plateau (`world.bossArenas.nidhoggra`), which is real terrain. **There are no moving platforms and no spine running.**
- **Locks:** `part.lock = {element, counters:[…]}` per DESIGN §8.6. A hit whose element is in `counters` strips `poise × 1`, a reaction on the part strips ×2, and the gift strips 50% once.
  `lockStripped {by}` decides the shard buff (counter or reaction only). The lock table is **data** in `nidhoggra.js`, exported for the playtest coverage check.
- **Phase 1:** head-plate rotation (5 locks, 20 s, the order biased to the player's counters), claw slam (parryable, golden glint), breath sweep, minions, and the lightning-rod check (3 rod entities plus any player `lightning.rod`; `bossCheck{kind:'rods'}`).
- **Phase 2:** the coil animation drapes one shard segment beside a root-pillar top for 10 s every 15 s (the spline sampled at the render rate; shards are boss parts with a world position, not platforms). There are 5 shard parts and the tide stagger check is 12 s. The cut-line fallback is static perches.
- **Phase 3 (P1):** ring updrafts above the plateau (`world.addUpdraft`), each with a trigger volume that grants the +50% buff and the X reset. Also meteors, 4 eye parts (which take full damage from any player ranged hit or ultimate) and the heart part.
- **Gift API:**
  - `enemies.bosses.gift = { ready, charges, element, purpose:'lock'|'spear', use() }`.
  - Pressing **V** (read by skills, `skills.useGift()`) strips 50% of the current lock or throws 루미엘의 창.
  - Emits `giftReady` and `giftUsed`.
- The final strike calls `game.cinematic.playFinale(onDone)`. On done, emit `bossDefeated {id:'nidhoggra', name, final:true}`.

---

## 16. Cinematic v3 (owner **narrative**)

```ts
cinematic.playReveal(onDone)           // golem core rune, Teragon memory, mist down a root channel to the plateau, wyrm coiled on the roots
cinematic.playClassRite(cls, onDone)   // replaces playBlessing(el|'all'): spirits of CLASS_DEFS[cls] primary (front, big) + secondary
cinematic.playBlessing(el|'all', onDone)   // kept as shim → playClassRite(progression.cls)
cinematic.playSpiritFreed(element, onDone) // 운디나/녹스/실바니아/루미엘 freeing (6–8 s)
cinematic.playBossIntro(id, onDone)    // ONE parametric template + per-boss camera-path data (P0); bespoke shots are P1. Awaits enemies.prewarmBoss(id)
cinematic.playPhase(id, phase, onDone) // gameplay-mode transitions (≤ 6 s, skippable)
cinematic.playFinale(onDone)           // the dive strike (gameplay mode, one input)
cinematic.playEnding(onDone)           // rewritten: void→golden pollen, tree bloom, zone time-lapse, festival, credits (9 spirits, new NPCs)
cinematic.finisher(o = {})             // EXISTING signature kept (cinematic.js:250); o gains `element` (all 9 + 'symphony' for 원소 교향곡) and `cls`.
                                       // Template recoloured; set pieces for new elements: water leviathan, eternal forest, dawn wings,
                                       // raven lord — via spirits9.js
```
- `assets.js` `SPIRITS` **stays the classic 5** (the intro lore). Add `LOST_SPIRITS` (water, nature, light, shadow) and `SPIRITS_ALL = [...SPIRITS, ...LOST_SPIRITS]` for the class rite and the ending credits.
  Fix the `i<5` loop at `intro.js:246` to use `SPIRITS.length`.
- `playSpiritFreed` is one parametric template keyed by element (P0).
- **Audit:** `cinematic/finisher.js:123` (class literal → `familyOf`), `ceremony.js:17` (class rite elements), `intro.js:36,47,94,238,246`.
- `overlay.js` `ELEMENT_GRAD` and `ELEMENT_GLYPH` cover all 9 elements plus physical.

---

## 17. Story v3 (owner **narrative**)

The stage machine becomes data: `story/quests.js`.
```js
export const QUESTS = [
  { id:'wake', title:'깨어난 각인', … },  { id:'choose', title:'여섯 갈래의 길' }, { id:'training', title:'첫 수련' },
  { id:'updraft' }, { id:'camps' }, { id:'boss', title:'봉인의 유적' },
  { id:'reveal', title:'갈라진 봉인' }, { id:'mirwen', title:'물안개 너머' }, { id:'hydra', title:'세 개의 머리' },
  { id:'elderwood', title:'잿빛 숲의 속삭임' }, { id:'nox', title:'타락한 정령' }, { id:'treant', title:'수호수의 심장' },
  { id:'ascent', title:'하늘로 가는 뿌리' }, { id:'kalis', title:'거울의 사도' }, { id:'final', title:'세계수의 새벽' },
  { id:'ending' }, { id:'done', title:'에필로그' },
];
// each: { id, title, giver?, objective(S, game) → {title, desc, progress?, marker?}, markers(S, game) → [...],
//         dialogue?: {[npcId]: nodes|fn}, onStart(S, game), onComplete(S, game), next, xp, points? }
```
**Rules:**
- **Non-linear acts:** after `reveal`, the stages `mirwen→hydra` and `elderwood→nox→treant` are two branches. `story.regionOrder = ['mirwen'|'elderwood', …]` records the order. `ascent` starts when both branches are complete.
- **Interact:** NPC talk prompts are `game.interact.offer('npc:'+id, …)`. `story.hasPrompt()` is a shim.
- `story.stage` and `story.debugSkip(stageId, {silent})` cover every stage. `debugSkip` sets up the needed state:
  - the class (`progression.cls` or the test default),
  - `breakSeals`, `freeSpirit` and the level for later stages: mirwen/elderwood (first) ≥ 9, second region ≥ 15, ascent ≥ 21, final ≥ 25, unless `&level=` is given,
  - the zone teleport,
  - `await enemies.prewarmBoss(id)` behind a fade, then spawning the act boss when the stage is a boss stage.
- **Class choice:** the `choose` stage calls `game.ui.openClassPanel({onPick: cls => …})`. The fallback, if ui is missing, is a 6-option dialogue `ask`.
  On confirm: `progression.setClass(cls)`, `player.setClass(cls)`, `cinematic.playClassRite(cls)`, then training.
  **Remove** the path/element dialogue (`PATH_DESC`, `pathExplain`, `elementPick`).
- **Training:** the steps are `['basic','charged','quick','defend','dodge','learn']`, where `learn` completes on `skillLearned` followed by `loadoutChanged`. Step counting listens to `skillCast` only (one event per cast).
- **Victory flow:** story **removes** its `'victory'` listener (`story.js:723`). It handles `bossSpawn`/`bossDefeated` **filtered by id**: the `camps` completion (`story.js:719`) fires only for `bossSpawn{id:'golem'}` while the stage is `camps`, so debug spawns of other bosses never corrupt the stage machine.
- **On bossDefeated**, by id:

| id | Next |
|---|---|
| `golem` | `breakSeals()`, then `cinematic.playReveal`, then stage `reveal` |
| `hydra` | `freeSpirit('water')`, then `playSpiritFreed`, then the other branch or `ascent` |
| `nox` | `freeSpirit('shadow')`, then `treant` |
| `treant` | `freeSpirit('nature')`, then the other branch or `ascent` |
| `kalis` | `freeSpirit('light')`, then `final` |
| `nidhoggra` | `ending`, then `cinematic.playEnding`, then `events.emit('victory', {stats: enemies.getRunStats()})` **once**, then `setState('victory')`, then stage `done` on continue |

  Each act boss also gives `addPoints(1)` and its XP (bosses set `xpValue`, and progression awards it on `kill`). Quests give the XP listed in their `xp` field.
- **Audit:** `story.js:113,141,149,167,770` and `story/script.js:95,96,171,172,179,270,280` (class literals → `familyOf`/class data); `story.js:348,372` (the Digit1-5 path choices are removed).
- **New NPCs:**
  - Mentors: `rangerMentor` 아리엔, `paladinMentor` 오르벤, `spiritMentor` 세리아, `shadowMentor` 카이렌.
  - Others: `sage` 이솔데, `lakeKeeper` 나엘, `forestChild` 모모, and the village `trainer` (the reaction-trainer dummy's keeper).
  - The elder gains the post-reveal line "다섯이라 배웠지만… 사실은 아홉이었구나" (DESIGN §8.1).
  - Spirits as NPC models: `undina`, `sylvania`, `nox`, `lumiel`.
  - Each needs `SPEAKERS`, `CHARS` and `NPC_IDS` entries. Spots for zone NPCs come from `world.zones[].npcSpots`, or the story uses its own coordinates from DESIGN §8.3.
- `story.serialize()` / `story.deserialize()` for save: stage, the branch order, completed steps and the onboarding tips seen.
- **Dialogue scope:** P0 is every quest-giver line needed to progress plus the reveal. Ambient barks and the epilogue lines are P1.
- **Ambient lines:** add a phase key per act.
- The XP and point awards are emitted through progression APIs. Story never mutates progression fields directly.

---

## 18. UI v3 (owner **ui**)

```ts
ui.openSkillTree(el?), ui.closeSkillTree(), ui.skillTreeOpen
ui.openCharacter(), ui.closeCharacter(), ui.characterOpen
ui.openCodex() (Tab grimoire, now interactive/scrollable), ui.codexOpen
ui.openClassPanel({onPick}), ui.closeClassPanel()
ui.openGateMenu(gates, onPick)
ui.confirm(text, onYes)                     // generic modal (respec, class change)
ui.startTreeTour()                          // the 3-page first-open tour (DESIGN §5.6)
ui.tip(id, text)                            // one-time contextual tip (persisted via story.serialize)
```
- **Modal handling:** every modal is added to `syncModalLock`, to `applyState` (closing on state change), to the Escape cascade and to the key handler (K, C, Tab).
- **HUD sources:**
  - The hotbar renders from `game.activeSkills().getHudState()`. If `v === 3`, use the 9-slot array layout (`ui/hotbar3.js`). Otherwise use the v2 renderer.
  - The attune gem arc comes from `hs.elements`, and the signature widget from `hs.signature`.
- **Vitals:**
  - Read `player.maxHp`, `maxMp` and `maxStamina`.
  - The HUD resource CSS uses `data-res="mp|stamina"`, replacing `data-cls`.
  - The regen strip and shimmer come from `player.regen`.
  - Level badge and XP bar from progression. The `levelUp` card and `+XP` numbers.
- **Enemy bars:** `STATUS_KEYS` are built from `combat.STATUS_DEFS` (fallback: the old 7). Stack digits show for stack statuses. The break gauge shows when `breakMax` is set.
- **Boss bar** (`ui/bossbar.js`): built from the `bossSpawn` payload (name, title, sub, phases, parts), `bossPhase`, `break` and voidShield. Remove the golem hard-codes in ui.js L506–508, L689, L733, L801–804 and L1187, replacing them with data.
- **Skill tree:** follows DESIGN §10. It reads only `game.skills.trees` / `nodes` / `defs`, `progression` and `classes`. The fallback, if skills is stubbed, is `await import('./skills/trees/index.js')` inside try/catch (rule 7). If that fails too, the tree shows "스킬 데이터를 불러올 수 없습니다".
- **Equip:** drag/press actions call `skills.equip`. In planner mode, nothing commits. A rejection shows the `canEquip` reason.
- **Next-hit hint:** at 10 Hz, `combat.previewReaction(lockedTarget, skills.attuned)` drives the pip icon and the "다음 타격" label.
- **Prompt:** `ui/prompt.js` renders `game.interact.current()` on `interactChanged`.
- **Boss defeat card:** uses `payload.name` (replace the "수문장 정화" hard-code at ui.js:800-804).
- **Audit:** `ui.js:593,829,836,844,949,984,1040,1301` (class literals → `hs.family`/`hs.resource`); `ui.js:181,451,613,1060-1067` (§3.1).
- **Controls panel** and `formatKeys`: add K, C, Z, X, V and 1~4. F is shown as "상호작용".
- **Settings menu:** add rows for `difficulty` (쉬움/보통/어려움), `screenShake` (0..1), `damageNumbers` (on/off) and `effectQuality` (low/med/high → particle multiplier). These need core settings keys (§19).

---

## 19. Settings additions (core)
- New keys: `difficulty` ('normal'; 'easy'|'normal'|'hard' → DESIGN §16, applied as the stats source `difficulty` and `game.difficulty = {hpMul, dmgMul, telegraphMul}`), `screenShake` (default 1), `damageNumbers` (true), `effectQuality` ('medium'), `holdToCast` (true).
- Storage key `aw_settings_v3`. **Migration:** read v3; if it is absent, read `aw_settings_v2`, copy it into v3 once, and keep v2 untouched, so old playtests that preset v2 still work.
- Quality presets (`applyPreset('low'|'medium'|'high')`) also set `effectQuality`. playtest3 core checks the migration.

---

## 20. VFX v3 (owner **combat**) & audio v3 (owner **narrative**)

**VFX API additions (`game.vfx`, combat owner):**
```ts
hitFeel(tier:'light'|'heavy'|'crit'|'reaction'|'ult'|'break', pos, dir, element?, opts?): void   // DESIGN §9 S1; ONLY combat.dealDamage calls it
preset(id, pos, opts?:{reduced?, dir?, scale?})   // 'impact_<el>', 'explosion_<el>', 'rx_<reactionId>'; unknown → physical
impact/explosion(pos,{element})  // existing; now 9 elements via elColor
telegraph({shape:'circle'|'line'|'cone'|'ring', pos, dir?, r|len|width|angle, dur, color:'damage'|'void'|'grab', parryable?}): handle  // pool 8
dissolve(entity|mesh, {dur=0.9, color, embers=true}): void   // clones materials once (same program), animates the clone's uDissolve (§3.3)
runeCircle(pos, {element, r, dur, rotSpeed}): handle         // pool 6
smear(weapon:'arc'|'wide'|'twin', origin, quat, scale, element): void
groundDecal(kind:'crack'|'scorch'|'frost'|'lichtenberg'|'ripple'|'flowers'|'rune'|'violet', pos, r, life)
windLines(on, intensity)
```
- **Reaction presets are parametric (P0):** one recipe per family (DESIGN §4.5) × the two element ramps + one signature shape, so all 49 `rx_<id>` exist from ~6 recipes. Bespoke signatures (DESIGN §9 S6 table) are P1.
- **Atlas:** it becomes **8×8 at 128 px** (1024², square, so `particles.js:38-40` and `textures.js:49` keep working; only `ATLAS_COLS` changes to 8). Frames are addressed through the `FRAMES` name map (`FRAMES.ember`, …). The existing 16 frames are re-laid out in the new grid, and every caller uses names, never raw indices. New frames: `rune`, `petal`, `droplet`, `feather`, `bubble`, `wisp`, `thorn`, `raven`.
- **Trauma shake:** moves to 3-octave noise on pitch, yaw and roll.
- **Chroma pulse:** fx calls `game.post.pulse(amount, dur)` (core-owned, §3.3).
- **Lights:** no new lights. The heavy-hit flash becomes an emissive sprite. Existing pooled lights stay visible at intensity 0.
- Every pooled InstancedMesh calls `setColorAt(0, c)` at construction. All new materials are returned from `vfx.warmup()`.
- **Audit:** `vfx/debris.js:81`, `vfx/ground.js:109,117` and `vfx/particles.js:192` stay on `getHeight` (terrain-only arenas).

**Audio additions (narrative owner):**
- SFX recipes per DESIGN §11:
  - `cast_/impact_/explode_` for `water`, `nature`, `light` and `shadow`
  - class weapon sfx
  - `rx_<id>`: the switch in audio.js becomes a map lookup with a family-based fallback, so all 49 exist (P0 = family fallback; distinct cues are P1)
  - UI cues
  - boss voices (P1)
- Charge-pitch map from `ELEMENT_DEFS[el].sfxBase`. The double cast SFX is gone, because `spellCast` fires once per cast.
- **Music:**
  - New themes `mirwen`, `elderwood`, `sky`, `final_boss` (with `layer(phase)`) and `ending_v3`. They are added to `LAYERS`/`MIX`, `THEMES` in `themes3.js`, and audio's `THEMES`.
  - `pickMode` uses `world.getZoneAt(player).music`, plus the `game.enemies.boss` rule, plus the `bossPhase` layer.
- **Victory:** the fanfare and victory music move from `'victory'` (audio.js:496) to `bossDefeated {final:true}`. `ending_v3` plays during the ending cinematic.
- **Audit:** `audio.js:516,573` (class literals → `familyOf`); `audio/sfx2.js:254`.
- Listen to the new events: `levelUp`, `skillLearned`, `skillUnlearned`, `loadoutChanged`, `hpRegenStart`, `gateTravel`, `break`, `resonance`, `bossCheck`, `lockStripped` and `giftUsed`.

---

## 21. Test hooks (core owns parsing; each owner implements its part)

URL parameters (with `?test=1`):

| Param | Meaning |
|---|---|
| `cls=mage\|sword\|ranger\|paladin\|spiritcaller\|shadowblade\|none` | class (default `mage`). `none` = story from the start |
| `level=N` | `progression.setLevel(N)` with points |
| `skills=all\|primary\|<id,id,…>\|preset:<name>` | learn nodes via `skills.applyPreset` → `progression.setRanks(map, {ignoreBudget:true, ignoreGates:true})` (it also sets `debug.ungate`). `all` = every node the class may learn; for exclusive pairs it **always picks the `a` modifier**. `primary` = both primary trees full |
| `equip=q1:<id>,q2:<id>,ult:<id>,sup:<id>` | loadout |
| `difficulty=easy\|normal\|hard` | difficulty (default normal) |
| `attune=<el>` | starting attuned element |
| `unlock=all` | `progression.debug.ungate = true` (class, spirit and seal gates off) |
| `points=inf` | no point limit |
| `quest=<stageId>` | `story.debugSkip` (default `camps`) |
| `zone=<zoneId>` | teleport to the zone centre |
| `boss=<id>` | spawn that boss in its arena (after quest skip) |
| `phase=N` | force the boss phase (bosses implement `debugPhase(n)`) |
| `save=1` | allow the save system in test mode |
| `path=all\|master&el=<el>` | **legacy**: keymap `'legacy'`; `path=all` → `skills=preset:legacy_all` + `unlock=all` (all 5 classic trees to T3; old Digit1–5 element select; old `spells.cast(el,kind)` works); `path=master&el=X` → preset `legacy_master_X` (tree X to its capstone). **Legacy configs always imply `unlock=all`**: the mage has no earth access, so the old earth cases (shatter, magma, skyslam) in tools/playtest.js work only through it |

Presets live in `src/skills/trees/index.js` as `PRESETS`: `{name: {ranks:{nodeId:rank}, loadout?, cls?}}`. They include `legacy_all`, `legacy_master_<el>` for the 5 classic elements,
`starter_<cls>` (≈ level 3), `act2_<cls>`, `endgame_<cls>` (38 points, a realistic build), and `showcase_<el>` (every active in that tree).
Presets always pick the `a` modifier of a pair, ignore the budget and set `ungate`.

**Debug functions** (`game.debug`, core/debug.js; every function feature-detects its target):
- `level(n)`, `xp(n)`, `learn(id)`, `learnAll()`, `respec()`, `equip(slot,id)`, `cast(id, opts)` (free), `preset(name)`
- `freeSpirits()`, `breakSeals()`, `tp(zoneId|gateId)`, `spawn(type, opts)`, `boss(id)`, `bossPhase(n)`, `killBoss()` → `enemies.debugDefeat()` (the proper defeat path, including Nox's purify and Kalis's revive)
- `hurt(amount, {combat=false})`: `combat:true` also marks an aggroed dummy within 30 m, so `inCombat()` is true
- `regenState()` → `player.regen` `{active, delay, delayLeft, inCombat, rate}`
- `react(id)`: forces a reaction on the nearest enemy, through `combat.debugReact(id, target)`
- `drawStats()`: `{calls, tris, programs, particles, decals, lights}`. It handles `renderer.info.autoReset = false` the same way as `playtest2:383`.
- `events.count(name)`: a per-event counter enabled in test mode (used by the single-emission tests)

**Tests:**
- `tools/bootcheck.js` (core) gets these configs:
  - one per class (`&cls=<id>&skills=preset:starter_<cls>`),
  - one `&quest=final&boss=nidhoggra`,
  - the old legacy configs,
  - **two boot-safety configs** that run with `src/skills/` and then `src/enemies/bosses/` temporarily renamed. Each asserts that the game reaches `playing` with that module stubbed or bosses missing, and that there are no uncaught errors.

  It prints draw calls, triangles and `renderer.info.programs.length`.
- **`tools/playtest3.js`** is the core harness. It loads `tools/playtest3/<owner>.js` sections, each owned by that owner. The harness provides:
  - `PT.check(name, cond)`
  - `PT.boot(params)`
  - `PT.step(seconds)` (deterministic fixed-dt stepping)
  - `PT.dummyRing(n, r, {aggro=false, hp=1e6})`, which spawns training dummies (`xpValue 0`) around the player
  - `PT.frameStats()` (autoReset handling copied from playtest2:383)
  - `PT.countEvents(name)`

**Required checks (owner in brackets):**
1. **[core] Boot:** for each of the 6 classes, the game boots with no stubbed modules and no console errors. The class-access table: 4 classes per element and 6 elements per class. The settings v2 → v3 migration.
2. **[core] Progression:**
   - `canLearn` rejects a locked tree (`class`), a secondary T4 (`tier`) and a capstone before its story gate (`story`).
   - `canUnlearn` returns `gate` when a refund would break a learned tier.
   - Points are derived (the save round-trip has no `points` field).
   - At level 8, **each class can learn and equip at least one ultimate from a primary tree** (using `starter_<cls>` + level 8).
   - Respec works only at the altar.
3. **[core] Damage formula:** a 100-base fire hit at L1 with no nodes gives exactly 100 (crit forced off). At L10 with `fire.key` (+35%) and 5 fire points, it gives `100 × 1.36 × 1.10 × 1.35`, within ±0.5. Both through `debug.cast` and through a legacy `castById`.
4. **[core] Stats buffs:** start the legacy fire sword buff, emit `levelUp`, end the buff, and assert `stats.get('atkMul') === 1`. 10 buffs expiring in one frame produce one `statsChanged`.
5. **[skills] Casts:** for each class, cast every skill in `endgame_<cls>` and `showcase_<el>` (for accessible elements) with `{free:true}` at a `PT.dummyRing(6, 6)`. Each cast deals damage > 0 or applies its effect (buff, zone, summon, platform or collider present). No exceptions. **Exactly one `skillCast`, one `spellCast` and at most one `elementChanged`** per cast.
6. **[combat] Reactions:** `debug.react(id)` for all 49 ids emits `reaction {id}`. Natural triggers for the 35 P0 ids (scripted pairs as in playtest.js). The priority worked example of DESIGN §4.5. The judgment cooldown (two triggers within 6 s → one judgment). A 16-pod chain stays within the depth cap, with ≤ 4 full presets per frame.
7. **[player] HP regen** (assert on `debug.regenState()`, not on wall time):
   - Hurt 30 with an aggroed dummy: `inCombat` is true, `delay` is 5, and HP does not rise at 4.5 s but rises at 5.5 s.
   - Without aggro: it rises at 3.5 s.
   - A hit in between resets the timer. A fully blocked hit does not. A DoT tick does.
   - In `light.sanctuary`, `delay` is 2.5.
   - The boss HoT cap holds at ≤ 5%/s.
8. **[narrative] Story:**
   - `quest=boss` → kill the golem → the stage becomes `reveal` (not victory).
   - Both branch orders reach `ascent`.
   - `debugSkip` through every boss stage, where each boss spawns and `killBoss` advances.
   - `final` → kill → ending → **exactly one `victory` event, and none before `bossDefeated{final:true}`**.
   - The fanfare plays on `bossDefeated{final}`.
9. **[ui] UI:**
   - `openSkillTree`, `openCharacter` and `openCodex` lock and unlock input.
   - The hotbar shows 9 slots in v3 mode.
   - The tree works with the skills stub (the dynamic-import fallback).
   - The interact prompt shows at a gate, and pressing F there does **not** cast anything.
10. **[enemies] Bosses:**
    - Each boss spawns via `&boss=<id>` with `prewarmBoss` done first.
    - `debugPhase(n)` works, and `debugDefeat` emits the right `bossDefeated`.
    - The nidhoggra lock table gives each class ≥ 4 of 5 per phase (DESIGN §8.6).
    - Taunt: an enemy retargets to a `setTauntTarget` entity.
11. **[core + all] Perf** (medium), using `PT.frameStats()`:
    - The DESIGN §12 per-scene targets in the village, plains, Mirwen, Elderwood and the root plateau with nidhoggra in phase 1 and phase 2.
    - A **reaction-heavy stress spot**: 8 skills cast in 2 s on 12 enemies with pods, puddles and a tornado.
    - Calls ≤ 350 and tris ≤ 900k everywhere.
    - `renderer.info.programs.length` must not grow after the first 5 s of boot during the stress fight, a boss spawn or a boss phase change.
- **`tools/playtest.js` and `tools/playtest2.js` must still pass in legacy mode.** Core owns tools/, and the fixes land in the **integration wave** (§24):
  - playtest2's path-dialogue section is replaced by a class-panel pick when `&cls=none`.
  - The golem → victory step becomes golem → reveal.

---

## 22. Backwards compatibility & migration

| Old API | v3 behaviour |
|---|---|
| `progression.choose(cls, path, el)` | **shim**: `setClass(cls)` + applies preset `legacy_all` (path `'all'`) or `legacy_master_<el>` (path `'master'`), sets `debug.ungate = true`, and emits `pathChosen` (deprecated) and `classChosen` |
| `progression.path`, `element`, `isMaster()`, `hasAwakenedUltimate()`, `hasFinisher()`, `hasSupport()` | derived getters: `path` = `'master'` if any capstone is learned, else `'all'`; `element` = the element of the first learned capstone; `hasFinisher()` = any capstone; `hasSupport()` = any support learned |
| `progression.unlockedElements()` / `isElementUnlocked()` | class-accessible elements with points (in legacy presets, the 5 classic) |
| `progression.damageMul(el)` | mastery only (§4); everything else is in the §8.3 formula |
| `game.activeSkills()` | `game.skills` (stub fallback: the old switch via `familyOf`) |
| `game.slowmo(scale, s)` | shim → `game.timeScale.set('legacy', scale, s)` |
| `story.hasPrompt()` | shim → `!!game.interact.current()` |
| `cinematic.finisher(o)` | unchanged signature; `o.element` may be any of the 9, `o.cls` added |
| `spells.cast(el, kind, opts)` | still works: maps to `castById('${el}_${kind}')`. In v3 mode it is used only by adapters and tests |
| `spells.setElement(i)`, `sword.setElement(el)` | in v3 mode they forward to `skills.attune(...)`; when called *by* skills they run with `{silent:true}` and emit nothing |
| `getHudState()` v2 shape | spells and sword keep it. ui accepts both |
| `cinematic.playBlessing(el\|'all')` | shim → `playClassRite(progression.cls)` |
| `enemies` emitting `victory` | **removed**. story emits it after the final boss |
| `player.mods` | getter view over `game.stats` (§5); **no writes**; both legacy writers are converted in wave 1 |
| `ELEMENTS` (5) | **unchanged** (the 5 classic elements); v3 code uses `ALL_ELEMENTS` (§3.1) |
| `ELEMENT_COLORS` / `ELEMENT_NAMES_KO` | same values; a Proxy fallback for unknown keys |
| Save | none in v2. v3 save is new. Settings key moves to v3 with a copy-once migration (§19) |

**Old path system migration:**
- The `choose` stage dialogue (`PATH_DESC`, `pathExplain`, `elementPick`, `confirm` in `story/script.js`) is deleted and replaced by the class panel.
- The `master` awakened/finisher/support content is reached through the capstone and support nodes in each tree.
- `pathChosen` listeners (spells `onPath`, sword `onPathChosen`, ui tutorials) switch to `classChosen` and `skillLearned`.

---

## 23. Perf rules for v3 (all owners)
- Every pool size in DESIGN §12 is a hard cap: drop or recycle the oldest, never allocate.
- InstancedMesh for every repeated object: pods, crystals, mines, droplets, souls, rods, mushrooms, scenery-island rocks, nidhoggra segments, shards and familiars.
- **Instance colours:** every InstancedMesh that will ever be tinted calls `setColorAt(0, c)` and sets `instanceColor.needsUpdate = true` **at construction**. Otherwise the first tint recompiles with `USE_INSTANCING_COLOR`.
- **Never flip `transparent`, `alphaTest` or `vertexColors`** after creation. Recolour per element with uniforms or instance colours.
- **No new lights.** Do not add or hide lights, because a light-count change recompiles every lit material. Existing pooled lights idle at intensity 0.
- All new materials are returned from the owner module's `warmup()`/`prewarm()`. Boss models go through the idempotent `enemies.prewarmBoss(id)` (spawn, debug skip, save load, act-earlier cinematic), using `renderer.compileAsync` behind a fade.
- No `new THREE.Vector3()` inside update loops. Use module-level scratch objects. `getHudState()`, `previewReaction()` and `stats.get()` allocate nothing.
- Reaction cascades follow §8.2: staggered queue, depth ≤ 3, ≤ 4 full presets per frame.
- Hide zone dressing and scenery islands by act and by distance (drawDistance × 0.6), with no shadows. Enemy AI LOD stays as it is today. Procedural IK and springs run at half rate beyond 20 m and not at all beyond 40 m.
- If your feature adds more than 10 draw calls in the worst case, gate it behind `settings.effectQuality` or `quality`.
- The perf checks in playtest3 (§21, check 11) must pass, including the programs-count check.

---

## 24. Build tasks

**Owners: 10.** The file sets are disjoint (§1). Bosses are folded into **enemies**, VFX into **combat** (it is the single hitFeel
caller and owns the reaction presets), and audio into **narrative** (themes and cues follow the story beats).
Scope is controlled by the P0/P1 split inside every task (rule 11) and by the pre-decided cuts:
- no spine running and no moving platforms (the fight is on the terrain plateau),
- 35 P0 reactions plus 14 P1 reactions with family-preset fallbacks,
- parametric reaction presets, audio cues and boss intros,
- the nidhoggra phase-3 cut line (DESIGN §8.6).

**Waves** (the `depends_on` field encodes them; an owner starts once all its dependencies have merged):

| Wave | Owners | Notes |
|---|---|---|
| 0 | core | serial, ~1.5–2 h. Registries, stats, progression (with a fixture tree), keymap, interact, timeScale, post/dissolve, save, settings, stubs, the playtest3 harness, the per-owner notes/requests files |
| 1 | skills, combat, player, world, ui | in parallel, after core |
| 2 | magic, melee (need skills + combat), enemies (needs combat + world) | in parallel |
| 3 | narrative (needs enemies + ui) | — |
| 4 | **integration** (core, re-invoked) | merge the `v3/<owner>` branches (an octopus merge is conflict-free); concatenate `docs/v3/notes/*.md` into ARCHITECTURE.md; resolve `docs/v3/requests/*.md`; apply the playtest/playtest2 legacy fixes; run bootcheck, playtest, playtest2 and playtest3 (all sections); fix integration breaks; review |

Every task references the DESIGN sections it implements and ends with acceptance checks drawn from §21. An owner is done
when its `tools/playtest3/<owner>.js` section passes on its own branch, with the other modules stubbed or present.

**BUILD TASK LIST** (machine-readable; array of `{owner, files, task, depends_on}`):

```json
[
  {
    "owner": "core",
    "files": [
      "src/main.js",
      "src/core/*",
      "tools/bootcheck.js",
      "tools/playtest3.js",
      "tools/playtest3/harness.js",
      "tools/playtest3/core.js",
      "tools/playtest3/fixtures/*",
      "tools/playtest.js",
      "tools/playtest2.js",
      "ARCHITECTURE.md",
      "docs/v3/notes/core.md",
      "docs/v3/requests/core.md"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/core, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/core.md and API requests to other owners in docs/v3/requests/core.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/core.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 0 (serial, everyone else waits for you; target ~1.5-2 h). Build the shared foundation exactly as specified in CONTRACT §2, §3, §4, §5, §6, §19, §21, §22 (core parts). P0: (1) src/core/elements.js with ELEMENT_DEFS (earth status 'encrusted'), ALL_ELEMENTS, CLASSIC_ELEMENTS, PSEUDO_ELEMENTS, elDef/elColor/elName; utils.js keeps ELEMENTS as the 5 classic elements and wraps ELEMENT_COLORS/ELEMENT_NAMES_KO in a Proxy with a 'physical' fallback (§3.1; do NOT change ELEMENTS to 9). (2) src/core/classes.js with the v3.1 access table (DESIGN §2.1: every element reachable by exactly 4 classes; melee resource 'resolve'), familyOf/styleOf/classElements, TALENTS texts from DESIGN §2.2. (3) src/core/stats.js: pooled source records, lazy markDirty/recompute, update(dt) expiring timed sources in game time, at most one statsChanged per frame, consume(), the Mods keys of §5; player.mods is a getter view (player implements the view, you supply stats.get). (4) src/core/progression.js rewritten per §4: registerTrees (never import src/skills), derived points, tierCap/storyGateOpen (DESIGN §5.4: only capstones are story-gated; lumielFeather after 2 of water/shadow/nature), canLearn/canUnlearn incl. the 'gate' reason, setRanks, granted nodes count 1 for gates and 0 for mastery, damageMul = mastery only, breadth() for DESIGN §5.7, judgmentThreshold(), XP with xpValue>0 only, catch-up and falloff (DESIGN §5.1), serialize without points, class change at the altar; keep all v2 shims of §22. (5) src/core/archetypes.js (game.archetypes registry), src/core/interact.js (game.interact; F calls interact.use(); story.hasPrompt shim), src/core/timescale.js (keyed stack; game.slowmo shim -> id 'legacy'; timeComp factor), game.post.pulse/grade with uChroma/uRadial added to the sanitize pass in main.js, and the toon dissolve chunk (uniform uDissolve default -1, key 'toonRim+dis') in utils.js toonMat/toonRim chained after world/prefab.js occlusion (§3.3). (6) keymap.js (ult=KeyX, interact=KeyF) and input wiring (§6); save.js (§4 Save: ranks + world state, no position/HP, stage-boundary autosave, never mid-boss); settings v3 keys incl. difficulty and the copy-once v2 migration (§19); debug.js (§21 debug functions incl. hurt(n,{combat}), regenState, drawStats with programs, events.count). (7) main.js: ORDER with skills, frame order with timeScale.update first and stats.update after player (§2), the full skills stub from §2 in stubs.js, activeSkills via familyOf (remove the class literal at main.js:140). (8) Create docs/v3/notes/<owner>.md and docs/v3/requests/<owner>.md (empty) for all 10 owners, tools/playtest3.js + tools/playtest3/harness.js (PT.check, boot, step, dummyRing, frameStats with the playtest2:383 autoReset handling, countEvents) and tools/playtest3/fixtures/tree_fire.js (a 19-node sample tree matching CONTRACT §7.1) so progression is testable before skills exists. (9) tools/bootcheck.js configs per §21 incl. the two boot-safety configs (src/skills/ and src/enemies/bosses/ renamed away). Acceptance (tools/playtest3/core.js): checks 1-4 of CONTRACT §21; boots with every module stubbed except core; ?test=1&cls=<each of 6> boots; legacy ?test=1 still runs tools/playtest.js (legacy configs imply unlock=all). INTEGRATION PASS (run again after all other owners merge, as directed by the orchestrator): merge the owner branches, concatenate docs/v3/notes/*.md into ARCHITECTURE.md under '## v3 RPG Expansion contract (binding)' -> 'v3 module notes', apply the playtest.js/playtest2.js legacy fixes of CONTRACT §21 (class-panel pick for &cls=none, golem -> reveal), resolve docs/v3/requests/*.md, then run bootcheck + playtest + playtest2 + playtest3 and fix integration breakages.",
    "depends_on": []
  },
  {
    "owner": "skills",
    "files": [
      "src/skills.js",
      "src/skills/*",
      "docs/v3/notes/skills.md",
      "docs/v3/requests/skills.md",
      "tools/playtest3/skills.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/skills, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/skills.md and API requests to other owners in docs/v3/requests/skills.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/skills.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 1. Implement game.skills per CONTRACT §7 (all subsections) and DESIGN §5.5-5.7, §6 (all trees incl. §6.13 added nodes), §2.2 (class signatures). P0: (1) The 9 tree data files src/skills/trees/<el>.js with EVERY node of DESIGN §6.4-6.13 (19 nodes per classic tree, 20 per new-element tree, 175 total) using the exact ids, Korean names (incl. the v3.1 renames: '<el> 각인' attune names, 서리 반격, 도발의 석상, 정화의 비, 물살 감옥, 어둠의 심연, 흡혼 저주, 그늘의 계약, 그림자 낙인, 광휘탄, 찬란한 지혜 ...), costs, prerequisites, slotRole, params as UNSCALED base numbers, status written as {dur,stacks} objects for stacks, archetype names from the 24 in §7.3, legacy ids for the 30 legacy-backed skills, and twist tags from DESIGN §13.1. trees/index.js exports the trees and PRESETS (legacy_all, legacy_master_<el>, starter_<cls>, act2_<cls>, endgame_<cls>, showcase_<el>; always pick the 'a' modifier). (2) In the createSkills FACTORY: build defs/nodes/trees, call game.progression.registerTrees(trees), and forward registerImpl/registerArchetype to game.archetypes (§2: registries must exist after the factory). (3) runtime.js: loadout, attune (emits attuneChanged + legacy elementChanged ONCE; calls spells/sword setters with {silent:true}), per-id cooldowns in compensated time, the cast pipeline of §7.2 with the single-emission rule for skillCast/spellCast, resource via player.spendMp / player.spendResolve, freeNext/nextMul consumption, effectiveParams (modifiers only, no power scaling), canEquip with the ONE equip rule, autoEquip, applyPreset via progression.setRanks, useGift for V; key handling for LMB/RMB/1-4/X/G/R/Z/V/wheel only in v3 keymap mode (never F). (4) adapters.js (legacy spells/sword bridge, §7.4). (5) getHudState v3 shape (§7.5), reused objects, no allocation. (6) classkits.js (mage 원소 연쇄 kind 'attunement', sword enchant, ranger focus meter value, paladin seal counter -> S.zones.spawn('holy'), spiritcaller familiars, shadowblade marks), talents.js (stats sources talent:<id>), procs.js, the breadth stats source (DESIGN §5.7). (7) On skillUnlearned/respec: unequip unlearned skills, clear buff:<id> sources, despawn familiars/treant (§4 rules). P1: familiars.js polished visuals (P0 = simple pooled instanced wisps), tooltip text formatting with current->next numbers. Acceptance: CONTRACT §21 check 5 (every skill in endgame_<cls> and showcase_<el> casts in both families once magic/melee land; before that, archetype calls must fail soft and log once); exactly one skillCast/spellCast per cast; legacy keymap reads nothing; works when spells or sword is stubbed.",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "combat",
    "files": [
      "src/combat.js",
      "src/combat/*",
      "src/vfx.js",
      "src/vfx/*",
      "docs/v3/notes/combat.md",
      "docs/v3/requests/combat.md",
      "tools/playtest3/combat.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/combat, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/combat.md and API requests to other owners in docs/v3/requests/combat.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/combat.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 1. You own combat AND all VFX. Implement CONTRACT §8 and §20 (VFX part) with DESIGN §4 (all), §7 heal cap, §9, §12. P0: (1) statuses.js STATUS_DEFS incl. encrusted (the earth aura) and stunned as non-aura CC; keep applyStatus(t, name, seconds, extra) with extra={stacks,source,power,el}; st.el tags; auraOrder ring; hit.status number-or-{dur,stacks} schema (§8.1). voidShield numeric only. (2) reactions.js: all 49 REACTION_DEFS from DESIGN §4.3 with family and p fields, index BY_TRIGGER at load, the DESIGN §4.5 priority rule (object > zone fusion > newest aura > judgment fallback), opposite (상극) full aura removal, judgment rules (consume all stacks, 6 s/12 s per-target cooldown, threshold from progression.judgmentThreshold(), boss break +20), HANDLERS for custom reactions, reactObject for objects/zones, previewReaction (no side effects), the cascade queue (0.08-0.12 s stagger, depth <=3/frame, <=4 full presets/frame). P0 = the 35 entries marked P0 must trigger naturally; the 14 P1 entries must at least fire via debugReact with a family preset. (3) pipeline.js / combat.js: the canonical damage formula of §8.3 applied ONLY here for player sources (power x mastery x atkMul x elementDmg x castMul x conditionals x reaction x resist x crit from stats; DoT ticks use powerSnap; replace the hard-coded crit at combat.js:426), the pipeline order incl. target.onBeforeDamage, healPlayer with the 5%/s boss HoT clamp, registerAlly/unregisterAlly, addBreak/isBroken. (4) break.js (break gauge incl. encrusted x1.2, timeScale.set('break',0.05,0.25); voidShield), resonance.js (원소 교향: stats source rx:resonance {freeNext,nextMul}). (5) VFX: vfx.hitFeel(tier,...) driven by the DESIGN §9 S1 table, called ONLY from dealDamage once per non-DoT hit (replace the shake/hitstop code at combat.js:476-510, keep the 0.12 s volley rate limit and 3-4 frame minimum); presets: impact_/explosion_ for 9 elements and rx_<id> for all 49 via one parametric recipe per family (DESIGN §4.5); telegraph (pool 8, decal radius = hitbox radius, golden parry glint); dissolve(entity) cloning materials once and animating the core uDissolve uniform; the atlas becomes 8x8 at 128 px addressed through a FRAMES name map (no raw indices); 3-octave trauma shake; no new lights (flash light -> emissive sprite); call game.post.pulse for ultimates/break. P1: runes (pool 6), smear meshes, ground decal atlas kinds, bespoke reaction signatures (DESIGN §9 S6), wind lines. Audit: combat.js:239,312,363 stay on getHeight (terrain-only arenas); combat.js:527 slowmo -> timeScale. Acceptance: CONTRACT §21 check 6 and the reaction-heavy part of check 11; tools/playtest.js reaction section still passes in legacy mode; the DESIGN §15 balance sim as a data check in tools/playtest3/combat.js.",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "player",
    "files": [
      "src/player.js",
      "src/player/*",
      "docs/v3/notes/player.md",
      "docs/v3/requests/player.md",
      "tools/playtest3/player.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/player, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/player.md and API requests to other owners in docs/v3/requests/player.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/player.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 1. Implement CONTRACT §10 (all) with DESIGN §2 (class sheets: kits, stances, 투지), §7 (HP regen) and §9 (A2, A6-A9). P0: (1) player.mods as a getter view over game.stats (doubleJump -> stats.get('extraJumps')>0); stat-driven maxHp/maxMp/maxResolve/maxStamina keeping percentages on statsChanged; remove the hard-coded 100 MP. (2) player/resource.js: 투지 (resolve) with spendResolve, regen 6/s + hits/reactions; spendStamina for dodge/block/glide/sprint. (3) player/kits.js: KITS for all 6 classes (dodge: blink, dashstep, backflip, shieldstep, spiritswap, shadowroll; defend: barrier, guard, shield, ward, counter, focus) replacing EVERY binary class branch listed in the §10.1 audit (player.js:227...1025, player/swordsman.js:238); ranger Focus via game.timeScale.set('focus',0.35,0.2) and timeComp from the time-scale stack; parry window + stats.parryWindowAdd + dazzled bonus. (4) player/regen.js exactly per §10.3: net-loss tracking with onBeforeDamage snapshot and onHit/onDeath comparison after refunds (move the dmgTakenMul refund at player.js:204 before the comparison), inCombat() = hurt within 3 s or enemies.anyAggroWithin(30), per-frame re-evaluated delay 5 s / 3 s, rates 1.5%/s / 8%/s, boss x0.6, blessed zones delay x0.5 and +1%/s, heals through combat.healPlayer(...,{hot:true}), disabled by blight/regenDisabled, player.regen object reused, hpRegenStart/Stop events, pooled motes. (5) player/classes.js: outfits + weapon props (bow with string handle, hammer, shield, twin daggers, totem) built before skinMerge, +0 draw calls, <= +18k tris; getWeaponTip(main|off); family/style from familyOf/styleOf. (6) Platforms: movement uses world.getGroundHeight(x,z,yHint), carries handle.delta when standing on a moved platform; world.clampToBounds replaces the radial clamps at player.js L409/L839. P1: player/poses.js new cast kinds (throw, slam, channel, summon, buff, beam, bowDraw, bowRelease, totemRaise; unknown -> basic), dodge poses, directional hurt, hard landing, idle fidgets, player/springs.js (hair/scarf, totem charms, quiver feathers, tabard), player/ik.js foot IK, breathing, look-at, turn lean (DESIGN §9 A6-A9). Audit: player/model.js:553,577 element maps -> elColor; player.js:281,297,317 slowmo -> timeScale ids. Acceptance: CONTRACT §21 check 7 (regen, asserted on debug.regenState()); each class shows its weapon, dodge and defend; grep for class literals returns nothing outside player/kits.js.",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "world",
    "files": [
      "src/world.js",
      "src/world/*",
      "docs/v3/notes/world.md",
      "docs/v3/requests/world.md",
      "tools/playtest3/world.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/world, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/world.md and API requests to other owners in docs/v3/requests/world.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/world.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 1. Implement CONTRACT §13 with DESIGN §8.2 (layout), §12 (budgets) and §5.5 (respec spots). The ground rule: every arena is real terrain; floating islands are scenery only; there is no sky layer, no kill plane and no moving boss platform. P0: (1) world/zones.js zone registry + getZoneAt (4 Hz, zoneEnter/zoneExit), bossArenas with y from terrain (hydra, nox, treant, kalis ledge (60,-150) r18, nidhoggra root plateau (108,-132) r34 with 5 root-pillar spires at r22). (2) Terraform: Mirwen basin + waterfall mesa + 8 islands (world/mirwen.js); Elderwood dressing, instanced mushrooms, rot walls x3 with burn/purify/smash (world/elderwood.js); world/plateau.js: the +38 m root plateau with cliff sides and pillars + static spirit updrafts, the +24 m Kalis ledge with prism mirrors, the ascent updraft columns and root ramps, scenery islands I1-I5 (merged, <=12 calls, hidden before act 4); clampToBounds incl. the plateau/ledge AABBs; setBossFightLOD(on). (3) world/platforms.js (small stand-on platforms, 8 m grid buckets, <=16 alive, handles with velocity/delta), getGroundHeight(x,z,yHint) incl. platforms; world/colliders.js addTempCollider with blocksProjectiles/onProjectile and projectileBlockAt(p,out); addUpdraft merged into surface.getUpdraft. (4) world/gates.js: spirit gates (village, Mirwen shore, Elderwood edge, arena top, Kalis ledge) offering game.interact prompts that open ui.openGateMenu and travelTo with a 1.2 s fade; respecSpots; the 8 seed shrines + spirit/landmark shrines with shrineFound; world.serialize/deserialize (gates, shrines, rot walls, act visibility, camps). (5) world/surface2.js channels mud, blessed (isBlessed), cursed, overgrowth, rubble on the existing 172x172 2 m grid at 10 Hz. (6) village.js: the 9-pillar altar as InstancedMesh(ALL_ELEMENTS.length) (remove the local 5-array at village.js:21,328-331), 5 mentor/sage npcSpots plus the reaction-trainer dummy spot, merged villager pipeline. P1: extra dressing polish, bioluminescent vertex colours, waterfall cave interior. Per-scene budgets: village <=290, plains <=300, Mirwen/Elderwood <=310, plateau <=330 calls incl. the boss; dressing culls at drawDistance x0.6 without shadows; terrain grid not resized. Acceptance: walk from the village to each zone; freeze bridges in Mirwen; burn/purify/smash rot walls; glide the ascent to the ledge and plateau via updrafts; F at a gate opens the gate menu; the perf targets in CONTRACT §21 check 11 for your zones.",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "ui",
    "files": [
      "src/ui.js",
      "src/ui.css",
      "src/ui/*",
      "docs/v3/notes/ui.md",
      "docs/v3/requests/ui.md",
      "tools/playtest3/ui.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/ui, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/ui.md and API requests to other owners in docs/v3/requests/ui.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/ui.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 1. Implement CONTRACT §18 with DESIGN §10 (all UI), §5.6 (onboarding), §4.1/§4.5 (next-hit hint, codex families), §14 (names). P0: (1) ui/skillTree.js: the 원소 별자리 screen (ring of 9 sigils with primary gold / secondary silver / locked chain + '◯◯ 직업만 사용 가능'), per-element constellation with 5 tier rows and the v3.1 shape (19/20 nodes, slotRole layout), node states incl. story-gated capstone, detail panel, header points/mastery/respec status, planner mode that never commits, the quick-slot bar (1-4/X/G); reads game.skills.trees/nodes/defs, progression, classes; fallback via await import('./skills/trees/index.js') in try/catch (never a static import). (2) ui/treeTour.js 3-page first-open tour + ui.tip one-time contextual tips (DESIGN §5.6). (3) ui/hotbar3.js 9-slot hotbar for HudState v3 (keys LMB RMB 1 2 3 4 X G R), the attune gem arc from hs.elements, signature widgets incl. the 투지 bar and mage 연쇄 orbs; v2 fallback stays. (4) Vitals from player.maxHp/maxMp/maxResolve/maxStamina with data-res='mp|resolve', the regen strip + shimmer from player.regen, level badge, XP bar, level-up card, +XP numbers. (5) Enemy bars: STATUS_KEYS from combat.STATUS_DEFS (fallback the old 7), stack digits, break gauge, voidShield pseudo-pip, and the next-hit hint from combat.previewReaction at 10 Hz. (6) ui/bossbar.js from the bossSpawn payload (phases, parts, locks), bossPhase, break, voidShield; remove the golem hard-codes at ui.js L506-508, L689, L733, L801-804, L1187; the defeat card uses payload.name. (7) ui/prompt.js renders game.interact.current() on interactChanged; ui/gateMenu.js; ui.confirm (respec, class change); ui/classPanel.js 6 class cards (DESIGN §5.6); ui/character.js; ui/codex.js with reactions grouped into the 6 families and the 'N / 49' counter. (8) Controls panel + formatKeys (K, C, Z, X, V, 1~4; F = 상호작용), settings rows difficulty/screenShake/damageNumbers/effectQuality. Audit: ui.js:593,829,836,844,949,984,1040,1301 class literals -> hs.family/hs.resource; ui.js:181,451,613,1060-1067 element loops. All DOM, built once, no per-frame layout reads, every modal in syncModalLock/applyState/Escape cascade. P1: animated codex mini icons, star-flare learn animation polish. Acceptance: CONTRACT §21 check 9; works with the skills stub.",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "magic",
    "files": [
      "src/spells.js",
      "src/spells/*",
      "docs/v3/notes/magic.md",
      "docs/v3/requests/magic.md",
      "tools/playtest3/magic.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/magic, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/magic.md and API requests to other owners in docs/v3/requests/magic.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/magic.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 2. Implement CONTRACT §11 and the CASTER half of §7.3, with DESIGN §6 (all caster forms incl. §6.13), §6.14, §12 (pools), §13.1 (twists). P0: (1) castById (emits spellCast once), setElement(i,{silent}), v3 input gating (game.skills.ownsInput), spells.isActive only in legacy mode; remove the story.hasPrompt check at spells.js:436; AWAKENED/SPELLS stay CLASSIC-only (spells.js:23,30,413) and nothing indexes SPELLS['water_basic']; spells.js:137,469 class literals -> familyOf; spells.js:224,331 slowmo -> timeScale ids. (2) Convert spells/master.js:455-474 buffs to game.stats.set('buff:'+id, mods, {duration}) and delete the player.mods save/restore. (3) spells.api toolkit (projectiles with meshes arrow/wisp/thorn/bubble/shadowbolt/lance, zones incl. new types water/mud/holy/miasma/spore/overgrowth/flood/spring/vortex/sand in spells/zones2.js, aoe/cone/line/chain/beam with prism refraction <=3 segments, terrain helpers), STATUS_OF from ELEMENT_DEFS, generic infusion for 9 elements. (4) spells/objects.js pooled InstancedMeshes: pod 16, crystal 8, mine 6, droplet 12, soul 8, flower 4, turret 2, rod 4 (setColorAt at construction); objects call combat.reactObject; bursts go through combat's stagger queue. (5) spells/archetypes.js: caster implementations of ALL 24 archetypes (projectile, volley, lob, crawler, beam, cone, nova, zone, wall, pillar, chain, rain, summon, blink, dash, leapslam, grapple, buff, mark, chainbind, tether, lane, mine, bubble) registered with game.archetypes.registerArchetype(name,'caster',fn) in the spells FACTORY; bow style = arrows from the string, totem = wisps; every archetype passes UNSCALED base damage (combat scales, CONTRACT §8.3) and sets hit.tier; warmup() returns one instance of every visual. (6) spells/bespoke.js caster forms registered via game.archetypes.registerImpl: water.ult (flood), nature.ult, light.ult (beam), shadow.ult (black hole), the 4 new awakened ultimates, nature.treant visuals; new-element finishers call game.cinematic.finisher({element, cls}). P1: bespoke polish for the t4 actives beyond their archetype. Acceptance: legacy tools/playtest.js passes; every new zone type and object spawns and expires; CONTRACT §21 check 5 passes for the caster classes (mage, ranger, spiritcaller) in tools/playtest3/magic.js; no class literals in your files.",
    "depends_on": [
      "core",
      "skills",
      "combat"
    ]
  },
  {
    "owner": "melee",
    "files": [
      "src/sword.js",
      "src/sword/*",
      "docs/v3/notes/melee.md",
      "docs/v3/requests/melee.md",
      "tools/playtest3/melee.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/melee, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/melee.md and API requests to other owners in docs/v3/requests/melee.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/melee.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 2. Implement CONTRACT §12 and the MELEE half of §7.3, with DESIGN §2.2 (sword, paladin, shadowblade movesets), §6 (melee forms of all skills incl. §6.13), §9 (A1 weapon trails per weapon). P0: (1) sword.js:50 active = familyOf(cls)==='melee' (so paladin and shadowblade run the engine); remove class literals at sword.js:728,768; remove the story.hasPrompt check at sword.js:689; replace the 5-element AMB/PAL/STATUS3 maps and the HUD element entries at sword.js:577,579,610,667 with ELEMENT_DEFS/elColor (legacy HUD stays CLASSIC). (2) Delete the pl.mods.atkMul multiply at sword.js:121 (combat applies the canonical formula); convert startBuff at sword.js:521-530 to game.stats.set('buff:'+id, mods, {duration}); stop calling game.hitstop directly and set hit.tier (+ hit.hitstopMul from the weapon profile) instead. (3) sword.api (startAction, hitCircle, hitLine, applyHit, findTarget, after, every, weapon(), playLegacy emitting spellCast once, setElement(el,{silent}), playClassCombo/playClassCharged, TPL incl. hammerSlam, shieldBash, daggerFlurry, daggerCross, backstab, reverseSlash); sword/weapons.js profiles longsword/hammer/daggers. (4) sword/classmoves.js: paladin 3-hit hammer combo + shield-bash charged; shadowblade 6-hit dagger combo + dash-through charged; sword/elmoves2.js: water/nature/light/shadow combo 4th hit and charged. Skills cost 투지 via player.spendResolve; stamina only for dodge/block. (5) sword/archetypes.js: melee implementations of ALL 24 archetypes registered with game.archetypes.registerArchetype(name,'melee',fn) in the sword FACTORY (the 'default ok' ones may wrap startAction + the caster effect from the weapon tip); hammer radius x1.2 speed x0.85, daggers radius x0.85 speed x1.25; unscaled base damage. (6) sword/bespoke.js melee forms of the 4 new ultimates via registerImpl. P1: per-weapon smear/trail tuning, counter-flurry variants. Acceptance: playtest2 sword section passes in legacy mode; each melee class hits a dummy with combo, charged and each new-element basic; CONTRACT §21 check 5 for sword/paladin/shadowblade in tools/playtest3/melee.js; the CONTRACT §21 check 4 buff test passes.",
    "depends_on": [
      "core",
      "skills",
      "combat"
    ]
  },
  {
    "owner": "enemies",
    "files": [
      "src/enemies.js",
      "src/enemies/*",
      "docs/v3/notes/enemies.md",
      "docs/v3/requests/enemies.md",
      "tools/playtest3/enemies.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/enemies, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/enemies.md and API requests to other owners in docs/v3/requests/enemies.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/enemies.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 2. You own the regular enemies, the boss framework AND all bosses (src/enemies/bosses/*). Implement CONTRACT §14 and §15 with DESIGN §5.1 (XP values), §5.3 (scaling), §8.5 (mid-bosses), §8.6 (final boss), §9 A2/A3/A4, §12, §14 (renamed mobs), §16 (difficulty). P0: (1) scaling.js (zone rows, second region uses the Act 3 row via story.regionOrder, difficulty multipliers; sets zoneDmgMul, zoneLevel default 1, xpValue with 0 for props/dummies), encounters.js lazy spawn/despawn (<=18 alive, despawn >120 m), the new mobs lizard/shroom/wolf/wraith/voidknight and renamed nameKo (말랑이, 뿔도깨비, 도깨비 주술사). (2) threat.js: setTauntTarget, getThreatTarget (used by enemies/common.js and every factory instead of targeting the player directly), setPlayerStealth, anyAggroWithin; enemies/projectiles.js honours world.projectileBlockAt (block/reflect + onReflect). getRunStats(); golem emits bossDefeated{id:'golem', name, final:false} and never victory; enemies.js:155 slowmo -> timeScale 'bossDeath'. (3) bossbase.js: phases with names, invulnerable transitions, break gauge, voidShield, addPart with locks, per-phase checkpoint, arena clamp, telegraph via vfx.telegraph with fallback, dissolve via vfx.dissolve with fallback; prewarmBoss(id) idempotent with renderer.compileAsync behind a fade, called from spawnBoss (and exposed for story/save). Load bosses ONLY with import('./enemies/bosses/index.js').then(m=>m.registerBosses(api)).catch(warnOnce) in init. (4) Bosses at P0 depth (CONTRACT §15): hydra (삼두 물뱀 레비아탄: head element shields + frozen-lake ring), nox (voidShield, parryable teleport slash, purify at 0 HP), treant (burnable bark plates, kneel weak point), kalis (copies the player's kit and top-2 elements, one revive), nidhoggra phases 1-2 on the root plateau (no moving platforms, no spine running): head-plate lock rotation with the DESIGN §8.6 lock table as exported data, claw slam with parry glint, breath sweep, minions, lightning-rod check; phase 2 coil past the 5 root pillars with shard parts and the tide stagger check; gift API for V (50% strip, no buff); lockStripped events; debugPhase/debugDefeat; final strike -> cinematic.playFinale -> bossDefeated{final:true}. P1: the rest of DESIGN §8.5 mechanics, nidhoggra phase 3 (rings with +50%/X reset, eyes taking the player's ranged skills, 루미엘의 창 charges; fallback = cut line 3: the heart opens after phase 2), bespoke boss voices hooks. Budgets: mid-boss <=20 calls, nidhoggra <=40 + VFX; call world.setBossFightLOD on the nidhoggra spawn/despawn. Acceptance: CONTRACT §21 check 10; &boss=<id> spawns each boss; enemies module boots when src/enemies/bosses/ is missing.",
    "depends_on": [
      "core",
      "combat",
      "world"
    ]
  },
  {
    "owner": "narrative",
    "files": [
      "src/story.js",
      "src/story/*",
      "src/cinematic.js",
      "src/cinematic/*",
      "src/audio.js",
      "src/audio/*",
      "docs/v3/notes/narrative.md",
      "docs/v3/requests/narrative.md",
      "tools/playtest3/narrative.js"
    ],
    "task": "Read docs/v3/CONTRACT.md fully (it is binding, revision v3.1) and the DESIGN.md sections named below. Work in your own git worktree on branch v3/narrative, created from the wave-0 commit. Edit ONLY the files listed for you; reach every other module through game.* or feature detection (CONTRACT rules 1, 5, 7). Never statically import another owner's file. Never compare a class with 'sword'/'mage' (rule 8); never assume 5 elements in v3 code (rule 9, use ALL_ELEMENTS). No new lights, no per-frame allocation, pre-warm every new material, call setColorAt at construction for tinted InstancedMeshes (CONTRACT §23). All player-facing text in Korean, from data tables. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback (rule 11). Put module notes in docs/v3/notes/narrative.md and API requests to other owners in docs/v3/requests/narrative.md (do not edit ARCHITECTURE.md). Put your automated checks in tools/playtest3/narrative.js using the PT harness (CONTRACT §21). Commit only your files on your branch; do not push. WAVE 3. You own story, cinematics AND all audio. Implement CONTRACT §16, §17 and §20 (audio part) with DESIGN §5.6 (class choice flow, 각인 의식, training, onboarding tips persistence), §8.1 (the unified lore), §8.3-8.4 (NPCs, quest chain incl. the non-linear Act 2/3 branches), §8.6 (finale strike, ending, music), §11 (audio), §14 (names/glossary). P0: (1) story/quests.js data table of all stages with the branch order story.regionOrder; story.debugSkip for every stage (class default, breakSeals/freeSpirit/levels per §17, await enemies.prewarmBoss behind a fade, boss spawn). (2) Victory flow: remove the 'victory' listener at story.js:723; filter bossSpawn/bossDefeated by id (story.js:719 camps completion only for golem); on nidhoggra: ending -> playEnding -> emit victory ONCE with enemies.getRunStats() -> setState('victory'). (3) story/classSelect.js: ui.openClassPanel with a 6-option dialogue fallback; progression.setClass, player.setClass, cinematic.playClassRite (only the class's spirits; SPIRITS stays the classic 5, add LOST_SPIRITS/SPIRITS_ALL); remove PATH_DESC/pathExplain/elementPick and the Digit1-5 choices (story.js:348,372); class change at the altar via ui.confirm. (4) NPC talk via game.interact.offer; new NPCs (4 mentors, 이솔데, 나엘, 모모, the trainer, spirit NPCs) with Korean dialogue for every quest-critical line, the reveal lore of DESIGN §8.1 incl. the elder line '다섯이라 배웠지만… 사실은 아홉이었구나'; training steps counting skillCast once per cast; story.serialize/deserialize incl. tips seen. (5) Cinematics: playReveal (mist down a root channel to the plateau), one parametric playSpiritFreed, one parametric playBossIntro with per-boss camera data, playPhase, playFinale (dive strike, one input), playEnding rewritten (golden pollen, tree bloom, plateau greens, festival, credits with 9 spirits); finisher(o) keeps its signature with o.element for all 9 + 'symphony' and o.cls; fix intro.js:246 i<5 -> SPIRITS.length; class literal at cinematic/finisher.js:123 -> familyOf. (6) Audio: cast_/impact_/explode_ recipes for water/nature/light/shadow, rx_<id> map lookup with a family fallback for all 49, class weapon sfx, UI cues (level_up, skill_learn, skill_unlearn, tree_open, slot_equip, xp_tick, codex_new, regen_start, gate_travel), charge pitch from ELEMENT_DEFS.sfxBase (audio/sfx2.js:254), themes mirwen/elderwood/sky/final_boss(layer by phase)/ending_v3 in audio/themes3.js, pickMode by world.getZoneAt().music; move the fanfare from 'victory' (audio.js:496) to bossDefeated{final:true}; class literals at audio.js:516,573 -> familyOf. P1: ambient barks per act, epilogue lines, bespoke boss-intro shots, distinct rx cues, boss voices. Acceptance: CONTRACT §21 check 8 (exactly one victory, none before bossDefeated{final:true}; both branch orders reach ascent); every cinematic is skippable and restores state; class pick works with and without ui.",
    "depends_on": [
      "core",
      "enemies",
      "ui"
    ]
  }
]
```
