# skills — module notes (v3, wave 1)

Files: `src/skills.js` (factory), `src/skills/{runtime,adapters,fallback,classkits,talents,procs,familiars,tooltip}.js`,
`src/skills/trees/{_shape,index,fire,ice,lightning,wind,earth,water,nature,light,shadow}.js`, `tools/playtest3/skills.js`.
Static imports: own files, `src/core/*`, `three` only (rule 7). Renaming `src/skills/` away boots on the core stub (bootcheck `@noSkills`).

## Data (`src/skills/trees/*`)
- `_shape.js` `buildTree(el, spec)` materialises every node from the DESIGN §6.1 shape: `slotRole` → tier / cost / maxRank / type / `pos`,
  the prerequisite rule (a3/a4/u → attune, m1 → a2, m2 → a3, m3 → t4, ult/sig → `requiresAny [a3,a4]`, rx → p1, key/p2 → rx, sup/t4/cap → ult),
  `modifies` + `exclusive` pairs, `grants` (attune → basic+charged, actives → own id, ult/sup, cap → awakened+finisher), `primaryOnly` (tier ≥ 4).
  Skill defs get `id`, `element`, `node`, `slotRole`, `modifiers` stamped. `RX_BY_ELEMENT` + `rxBonus(el)` turn "<el> reactions +15%" into `rx_<id>` mods.
- 9 tree files: 175 nodes (19 classic / 20 new), 103 castable defs (30 legacy-backed via `legacy.spell`; the 4 new elements' basic/charged
  carry `legacy.sword` so melee's `playLegacy` can present them). Params are unscaled base numbers; statuses use `{dur}` / `{stacks}` objects;
  every quick active has a `twist` tag (DESIGN §13.1); Korean `nameKo`/`desc` everywhere; passives with ranks have `descRank(r)` for tooltips.
  `custom` marks bespoke ultimates (water/nature/light/shadow `.ult` / `.awakened`) — magic/melee `registerImpl` under the skill id.
- `index.js`: `TREES` (ALL_ELEMENTS order), `EXTRA_SKILLS` (`breadth.finisher` 원소 교향곡, DESIGN §5.7), `PRESETS`
  (`legacy_all`, `legacy_master_<classic>`, `showcase_<el>`, `starter_<cls>` = 3 pts, `act2_<cls>` = 20, `endgame_<cls>` = 38 with loadouts; always the `a` modifier),
  `presetCost(name)`. The ui fallback may `await import('./skills/trees/index.js')`.

## Factory (`src/skills.js`)
Builds `defs` (Map, 104 incl. the breadth finisher), `nodes` (Map, 175), `trees`; calls `progression.registerTrees(TREES)` and forwards
`registerImpl/registerArchetype` to `game.archetypes` — all inside the factory (CONTRACT §2). `init()` refreshes talents/procs/kits/attune.
`update(dt, realDt)` = runtime → procs → class kits/familiars. `warmup()`/`prewarm()` return the familiar InstancedMesh.
Extra API: `def(id)`, `node(id)`, `tooltip(nodeOrSkillId, {rank})` (P1: `{title, lines, current, next, text}` with "현재 → 다음"), `kits`, `procs`,
`talents`, `familiars`, `adapters`, `lastPath` (`impl|legacy|archetype|casterArchetype|cinematic|generic`), `skillForSlot(slot)`, `lastCast`.

## Runtime (`runtime.js`) — CONTRACT §7.2
- **Cast pipeline:** gate (hasSkill unless free/test, cooldown/charges, `combat.canAct`, finisher needs `canFinisher`) → resource
  (`spendMp` caster / `spendResolve` melee = cost × 0.8; free via resonance `freeNext` (`nextMul` → `hit.castMul`, then `stats.consume`),
  mage 원소 연쇄 3 stacks (+30%), ranger `focusFreeCast` during focus; lightning keystone `castHpCost`) → auto-attune (once; setters silent) →
  resolve: `getImpl(id|custom)` → legacy adapters → finisher cinematic (`cinematic.finisher({element, cls, onImpact})`) → family archetype →
  caster archetype from the weapon tip (melee "검기") → **generic fallback** (`fallback.js`, logged once per archetype/family).
- **Events:** exactly one `skillCast {id, element, slot, cls, family, origin, path}`; `spellCast` is counted by a listener — if the performing
  (legacy) code did not emit it, skills emits `{element, kind, spellId}` once (kind basic/heavy/ultimate/skill). `skillFail` + legacy `spellFail`.
- **Cooldowns:** per id, `cd × cdrMul`, ticked in compensated time (`timeScale.comp()`); `charges`/`recharge` (lightning.mine; `lightning.m2b` gives 2).
- **ctx** (§7.3): `{game, skillId, def, element, params (effectiveParams), family, style, cls, origin, aim, charge, slot, awakened, castMul, S, M,
  hit(base) (adds skillId, slot, element, source = player entity, tier, castMul, charged/finisher flags, +1 stack when awakened), after(t, fn),
  powerForDisplay, baseDamage()}`. Breadth awakening (방랑자의 각성) makes X cast the equipped ult with `awakened` (+30%, +1 stack).
- **effectiveParams:** def params deep-merged with learned modifiers' params; cached per progression `rev`; never scaled.
- **attune(el, {silent})**: only `unlockedElements()`; emits `attuneChanged` + legacy `elementChanged` once; v3 setters get `{silent:true}`,
  v2 setters (which emit) run muted. `cycleAttune` on Z / wheel (0.15 s debounce).
- **Loadout:** `equip/unequip/canEquip` (the ONE rule: out of combat, or `ui.skillTreeOpen` + paused + no damage for 5 s; reasons
  `unlearned|slot|combat`), `autoEquip` on `skillLearned`; `skillUnlearned`/`respec`: unequip unlearned, clear `buff:<id>`, despawn summons
  (`spells.api.despawnSummon(id)` if present), refresh familiars. X → `<el>.awakened` when its capstone is learned; R → attuned finisher
  (or any learned, or `breadth.finisher`).
- **Input** only when `game.keymapMode === 'v3'` (`ownsInput`): LMB (hold-to-cast), RMB hold/release (charge, `chargeSpeedMul`), 1–4, X, G, R, Z, wheel, V
  (`useGift` → `enemies.bosses.gift.use()`). Never F. Legacy keymap reads nothing.
- **HUD** (§7.5): one reused object; reused `elements` (pooled entries) / `slots` (9 entries) arrays; v2 `element`/`index` mirrors.
  Slot entries add `charges`. `signature` filled by class kits.
- `serialize()` = `{q1..q4, ult, sup, attuned}`; `deserialize` drops unlearned/mis-slotted ids. `applyPreset(name)` → `setRanks(…, {ignoreGates})`
  + preset loadout + autoEquip + preset attune; `false` for unknown names.

## Class kits (`classkits.js`) — by `CLASS_DEFS[cls].signature`
- `attunement` (mage 원소 연쇄): a non-basic cast of a different element within 3 s → +1 stack (max 3; `chainRefundMp` talent); at 3 the next skill is free, +30%.
- `enchant` (sword): +4 per landed hit (+8 on reaction); full + perfect parry (`blocked{parried|perfect}` or `parry`) → 8 m cone wave, 80 + element status;
  `player.setEnchantGlow?.(0..1)` at 10 Hz.
- `focus` (ranger): signature = stamina/maxStamina, `extra` = focus active (player owns the slow-mo).
- `seal` (paladin): every 4 blocks or 8 hits → `spells.api.zones.spawn('holy', …)`; fallback = `proc:seal` stats source while inside (rule 11). Emits `sealPlanted`.
- `familiars` (spiritcaller): up to 2 (+1 `familiarSlotsAdd`) wisps for the most-invested trees with ≥ 3 points; they shoot the element's basic at 50 % every 1.6 s
  (≤ 18 m). `familiars.js`: ONE InstancedMesh (cores + halos + 10 pooled bolts + glows), instance colours set at construction, hidden when idle,
  sparkle trails through pooled `vfx.burst`. Emits `familiarSpawn/End`.
- `marks` (shadowblade): every hit +1 `marked` (combat status; WeakMap fallback while combat is v2); backstab or charged hit detonates +12 %/mark as shadow
  damage (`detonateRefund`, `markExecute` talents); tall-grass stealth via `enemies.setPlayerStealth` at 4 Hz.

## Talents / breadth / procs
- `talents.js`: `talent:<id>` sources from `classes.talentsFor(cls, level, choice)` (numbers in `TALENT_MODS`), refreshed on classChosen/levelUp/talentChosen.
  `breadth` source `{rxAll: 1 + 0.04 × trees≥5 (max 4), breadthAwakened}` refreshed on learn/unlearn/respec.
- `procs.js`: node `procs:[{event, fn}]` dispatched by one listener per event to the learned nodes' procs; `tick` procs at 4 Hz; re-entry guarded
  (proc hits never proc). Dynamic sources use `proc:<id>` (earth.cap, water.cap, nature.cap, shadow.cap, seal). Buff riders: `params.hits`
  (서리 반격: 3 hits taken, freezes attackers) and next-hit riders (`nextCrit/nextHit/firstHit`) act on the `buff:<id>` source.
- Node passive `mods(rank)` are applied by **progression** (`node:<id>`); skills never sets `node:` sources.

## Tests
`node tools/playtest3.js skills` (≈ 85 s): static rule 7/8/9 + F grep; data shape (175 nodes, 103 defs, 30 legacy, tiers/costs/prereqs/exclusives,
exact ids, v3.1 names, archetype names, status schema, twists, Korean); presets; runtime (HUD reuse, attune event counts, equip rule, cooldowns,
charges, freeNext, effectiveParams, respec cleanup, save round trip, talents, breadth, tooltip, archetype/impl resolution); mage 원소 연쇄; v3 input
(F casts nothing, X, 1, Z, RMB charge); legacy keymap reads nothing; **check 5** for all 6 classes (endgame + showcase: every skill has an effect,
exactly one skillCast/spellCast, ≤ 1 elementChanged); spells+sword stubbed; spiritcaller familiars. Dummies are ringed at 4.5 m (not 6) so the
smallest novas (r 5) reach them before the real archetypes land.
