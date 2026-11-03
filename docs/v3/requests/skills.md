# Requests from skills (wave 1)

Everything below is feature-detected by skills; nothing crashes if it is missing. Without it the named feature uses the stated fallback.

## magic (spells)
- **Input:** `spells.js` must not read LMB/RMB/digits/F when `game.skills?.ownsInput === true` (today the v2 module double-casts on LMB/RMB and treats F as its
  ultimate in v3 mode — playtest3/skills re-heals around F because of it).
- `castById(spellId, {free, charge, aim, awakened})` (emits `spellCast` once) and `setElement(i, {silent:true})`, where `i` indexes `spells.elements`
  (strings or `{id}`); until then skills uses `spells.cast(el, kind, {free:true})` and mutes the v2 setter's `elementChanged`.
- Caster archetypes: read `ctx.params` only (already merged with modifiers), build hits with `ctx.hit({...})`, use `ctx.after`. Param names per archetype are
  in the tree files (e.g. crawler `dist/speed/r/line`, zone `type/r/dur/tick/every`, summon `kind/life/hpFrac/taunt/tauntR/burst`, mine `max/life/r`,
  tether `len/dur/lashes|tick/pullLast`, pillar `h/life/platform/launch`, lane `len/width/dur`). `ctx.charge` is 0..1 for charged skills.
- Bespoke impls (`registerImpl(id, 'caster', fn)`): `water.ult`, `water.awakened`, `nature.ult`, `nature.awakened`, `light.ult`, `light.awakened`,
  `shadow.ult`, `shadow.awakened`, `nature.treant` (defs carry `custom` = the same id).
- `ice.sup` (서리 반격) and `earth.sup` (도발의 석상) were redesigned in DESIGN but keep `legacy.spell` (the 30-legacy count); the legacy path wins by
  contract order, so please either update `ice_support`/`earth_support` to the new behaviour or `registerImpl('ice.sup'|'earth.sup', 'caster', …)`.
  (skills already applies the 3-hit counter-freeze rider to whatever sets `buff:ice.sup`.)
- `api.despawnSummon(skillId)` (unlearn cleanup of treant / totem / clone / rod / beacon / mirror).
- `api.objects.spawn('crystal', pos, {element})` (earth.rx) and `spawn('droplet', pos, {heal, orbit:true, max:3})` (water.p2).
- `api.zones.spawn('holy', pos, {r, dur, source:'seal', radiantPerSec, regenDelayMul, regenRateAdd, dmgTakenMul})` for the paladin seal.

## melee (sword)
- `sword.js` must not read its skill inputs when `game.skills?.ownsInput === true`.
- `api.playLegacy(element, kind, {free, charge, aim, skillId, awakened})` for all 9 elements (`combo`/`heavy` for the 4 new elements' basic/charged too:
  their defs carry `legacy.sword`), emitting `spellCast` once; `setElement(el, {silent:true})` must emit nothing (the v2 setter emits even when silent).
- Melee archetypes + bespoke melee forms of the four new ultimates (`registerImpl('<el>.ult'|'<el>.awakened', 'melee', fn)`). Defs give `melee:{tpl, hitT}`.

## combat
- `damage` event: please add `backstab`, `charged`, `slot`, `skillId` (shadowblade marks detonate on backstab/charged; today skills infers "charged" from
  the last cast slot within 0.6 s).
- Honour `hit.reactionMul` (familiar shots use 0.5 unless the `familiarFullReactions` talent) and `status` blocks of `{dur, stacks}`.
- Register `marked` (stack max 5, 6 s). `addBreak(target, n)` is used by the 서리 반격 rider on bosses.
- Stat keys set by tree passives/talents that combat should read: `burnDurAdd`, `burnTickMul`, `chillSlowAdd`, `frozenDurAdd`, `frozenDurMul`,
  `iceUnfrozenMul`, `shockedTakenAdd`, `chainThroughWater`, `chainWaterRange`, `swirlTwoAuras`, `swirlRadiusAdd`, `airDmgMul`, `crystalShieldMul`,
  `wetDurAdd`, `wetSpread` (skills also spreads wet itself via a proc), `seededDotMul`, `podHealAdd`, `podReseed`, `lightRefract`, `judgmentSplash`,
  `judgmentAnyLight`, `corrodeNoFadeInCurse`, `selfElectroImmune`, `nonNatureHealMul`, `headshotMul`, `backstabMul`, `comboDmgMul`, `overheat`, `shatterFlash`.

## player
- `spendResolve(n)`, `resource`, `resolve`/`maxResolve`, `addResolve(n)`, `restoreMp(n)`, `getWeaponTip('main', out)`, `inCombat()`, `lastHurtT`,
  `setCharging(active, el, frac)`, `playCast(kind, el)` (kinds used: basic, heavy, ultimate, throw, slam, channel, summon, buff, beam), `sprinting`.
- New: `setEnchantGlow(0..1)` (sword signature blade glow, called at 10 Hz).
- Stat keys to read: `lethalSave` + `lethalSaveCd` (light.cap 여명), `noRegenPauseInWater` (water.key), `maxStaminaMul` (light.key), `freeSprintOOC`,
  `dodgeCdMul` (wind.cap), `blinkDecoyRune` (mage Lv20), `backflipStamRefund`/`backflipReload`, `blockStamMul`, `perfectBlockReflect`, `perfectDodgeStealth`,
  `counterExtraHits`/`counterHealPct`, `comboStatusTwice`.

## enemies
- `setPlayerStealth(on, dur?)` (shadowblade grass stealth, shadow.cap cloak), `bosses.gift = {ready, charges, element, use()}` for V.

## world
- `isTallGrass(x, z)` (or `surface.isTallGrass(pos)`) for shadowblade stealth; `surface2.isOvergrowth(pos)` / `surface.isGrass(pos)` for nature.cap.

## ui
- `ui.skillTreeOpen` is read by `skills.canEquip` (the one equip rule); `ui.tip(id, text)` is called once for an empty quick slot.
- `skills.tooltip(id, {rank})` returns `{title, lines, current, next, text}` (node or skill); `skills.def(id)`, `skills.node(id)`, `skills.ROLES`, `TYPE_KO`, `SLOT_KO`.
- HUD: slot entries also have `charges`; `signature.extra` = focus active (ranger) / seal seconds left (paladin).

## core
- tools/playtest3/core.js "stats: rx keys default 1" fails once skills is present: by then the page has a tree with ≥ 5 points, so the DESIGN §5.7
  `breadth` source sets `rxAll = 1.04`. Please clear the `breadth` source (or respec) before that assertion.
