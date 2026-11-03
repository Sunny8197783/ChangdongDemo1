# melee — module notes (v3)

Owner files: `src/sword.js`, `src/sword/*`, `tools/playtest3/melee.js`.

## Map

| File | Role |
|---|---|
| `src/sword.js` | The melee engine (`game.sword`) for every class with `familyOf(cls) === 'melee'` (검사, 성기사, 암살자). Action timeline (pose templates + timed events + swept hit windows), buffering, cancel windows, soft-lock lunge (clamped to target − 0.8 m), blade sparks, smear, ribbon trails, charge presentation. Legacy keymap input (v2), v3 entry points (`api.playLegacy`, archetypes). |
| `src/sword/pose.js` | Melee-owned copy of the 16-float torso-space pose layout (`PF`, `SP`, `STANCE` incl. hammer/dagger idle + charge). Replaces the old static import of `player/swordpose.js` (rule 7). |
| `src/sword/anim.js` | Pose templates `TPL` (+ `hammerR/L`, `hammerSlam`, `shieldBash`, `hammerCharge`, `daggerR/L`, `daggerFlurry`, `daggerCross`, `backstab`, `daggerDash`, `reverseSlash`) and `tplFor(id, style)`: generic template ids map to the hammer / dagger poses. |
| `src/sword/weapons.js` | `WEAPONS` profiles `longsword / hammer / daggers` (`reachMul`, `arcMul`, `speedMul`, `hitstopMul`, `poiseMul`, `trail{width, life, noise, edge}`, `smear`, `tips`, `twoHanded`), `weaponFor(style)`. Element palette `PAL`/`palOf(el)` built from `ELEMENT_DEFS` (classic five keep their v2 colours; unknown → physical), `statusOf`, blade ambience `AMB`/`ambOf`, `CAST_KIND`. |
| `src/sword/moves.js` | Longsword movesets: 4-hit combo (4th hit per element), charged, ultimates (+awakened), supports, finishers, the 반격 flurry with per-weapon variants. Statuses via `ELEMENT_DEFS[el].status`. |
| `src/sword/elmoves2.js` | New elements for the longsword (water/nature/light/shadow 4th hit + charged: 물결/덩굴/성광/그림자 검술, 수류 일섬, 가시 돌진, 광휘 내려치기, 그림자 일격) and the shared **element payload** `payload(el, p, {r, dmg, kb, launch, big, tier, spec})` used by every melee moveset/archetype (9 elements + safe default). Also `vineLash`, `dashThrough`, `FX[el]` (visual only). |
| `src/sword/classmoves.js` | Paladin (3-hit hammer combo, hitstop 0.09/0.10/0.16, 3rd = ground slam r 3 + payload; RMB 방패 돌진 강타 6 m bash → slam) and shadowblade (6-hit dagger combo, 0.04 / 6th 0.10 + payload; nature 6th = vine lash; RMB 관통 일격 9 m dash-through). |
| `src/sword/archetypes.js` | Melee implementations of all 24 archetypes, registered in the sword **factory** (`game.archetypes.registerArchetype(name, 'melee', fn)`). |
| `src/sword/bespoke.js` | Melee forms of `water/nature/light/shadow .ult` and `.awakened` via `registerImpl(id, 'melee', fn)`. |
| `src/sword/fx.js` | Pooled fx: slash arcs, blade ribbon (16 samples → 31 Catmull-Rom points, two-layer scrolling noise mask, gradient ramp, per-weapon width/life/noise), ice/rock spikes, **crystal spikes** (one InstancedMesh with instance colours set at construction: thorns, light crystals, shadow spikes, mines), stone swords, orbit blades, dragon. |

## API (`game.sword.api`, CONTRACT §12)
`startAction(spec)`, `hitCircle(c, r, spec, set, yRange, el)`, `hitLine(from, dir, len, width, spec, set, el)`, `applyHit(e, spec, point, dir, el)`,
`findTarget`, `after`, `every`, `weapon()`, `playLegacy(el, kind, {charge, skillId, awakened})`, `setElement(el, {silent})`,
`playClassCombo(el)`, `playClassCharged(el, frac)`, `TPL`, plus `arc`, `smear`, `foesNear`, `payload`, `S` (toolkit), `act`, `mines`.

- `playLegacy` kinds: `combo | heavy | ultimate | ultimateAwakened | support | finisher`. Gating is done by skills (always free here).
  It emits **one** `spellCast` per call that returns true (kind basic/heavy/ultimate, else `'skill'`). A combo press that arrives
  mid-swing is buffered (0.42 s) and still returns true. With `counterReady` the press becomes the 반격 flurry.
  Paladin / shadowblade `combo`/`heavy` route to their class movesets with the element payload; all 9 elements work.
- `setElement(el, {silent:true})` (what skills.attune uses) emits nothing and skips the unlock check. Any other v3 caller is forwarded
  to `skills.attune` (§22). Legacy: `setElement(el)` / `setElement(el, true)` behave as v2 (`elementChanged`).
- The v2 HUD (`getHudState`) stays for the legacy keymap and lists only the classic five.
- Test hook: `game.sword.debugUse('combo'|'heavy'|'ultimate'|'finisher'|'support'|'counter', {step, charge})`.

## Hit rules
- Every melee hit: `tags:['melee', weaponId]`, `hit.tier` (`light | heavy | crit | ult`; counter hits are `crit`), `hit.hitstopMul`
  = weapon profile (longsword 1.5, hammer 1.9, daggers 1.3). `hit.hitstop` only as the rare override (`spec.hsOverride`: the DESIGN
  §2.2 paladin / shadowblade combo values). The engine never calls `game.hitstop`, `fovKick` or `kick` per hit — combat's hitFeel does.
- Base damage is unscaled. `pl.mods.atkMul` is gone; the counter ×2 is a moveset base value. The 검성 talent (`comboDmgMul`) goes
  through `hit.castMul`, so the canonical formula applies it; 이중 각인 (`comboStatusTwice`) adds a stack to the 4th/3rd/6th-hit status;
  반격의 대가 (`counterExtraHits`, `counterHealPct`) extends the flurry and heals on completion. Skill hits carry `skillId`, `slot`
  (via `ctx.hit` for archetypes, via the action tag for legacy movesets), `charged` for heavy actions, `finisher` for finishers.
  Hammer hits add `poise = amount × 0.5 × 1.5`.
- Awakening: added by combat v3; the engine only adds the old melee contribution when combat is v2/stubbed.
- Buffs (legacy supports): `game.stats.set('buff:<skillId>' | 'buff:sword_<el>_support', mods, {duration})`; the buff ends when the source
  expires (game time). `doubleJump` became `extraJumps`. Nothing writes `player.mods`.
- v3 input: when `game.skills.ownsInput` the engine reads no LMB/RMB/F/G/R/digits/wheel; it shows the weapon charge pose while
  `game.skills.charging`. Legacy keymap: Digit1-5 (classic elements), wheel, LMB/RMB, F (only while `interact.current()` is null), G, R.

## Archetypes (melee forms)
Melee-native: projectile = travelling slash wave (lightning.ball = slow spark orb), crawler = ground wave (element spikes / fire line /
rubble), cone = wide sweep, nova = weapon-plant ring + payload, blink = dash-slash (behind target for shadow.step, next-crit rider),
dash = lunge with path hits (ignite / puddles / next-hit rider), leapslam = plunge with telegraph, grapple = vine whip (pulls small foes,
or the hero to the point), tether = whip channel (lashes, pull last/all, extinguish).
"Default ok": volley, lob, beam, zone, wall, pillar, chain, rain, summon, buff, mark, chainbind, lane, mine, bubble — the strike frame
runs magic's **caster** archetype from the weapon tip when it is registered (`ctx.origin` = weapon tip, `ctx.meleeFallback`), otherwise a
self-contained melee form: zones through `spells.api.zones` when present (else surface `wet`/`bless`/`ignite`), `world.addTempCollider`
(earth wall), `world.addPlatform` (ice pillar, glacier, stone steps), `world.addUpdraft`, `enemies.setTauntTarget` (totem / clone /
treant decoy), pooled mines (≤ 6), tick damage tagged `zone` (no hitFeel). Radii × `weapon.reachMul`; speed via the engine (× `speedMul`).

## Perf
No new lights, no per-frame allocation in the engine update (scratch vectors, reused HUD), one new InstancedMesh (`crystal`, colours
set at construction), one extra ribbon (left dagger, only drawn while active). All meshes live hidden in the scene from boot and are
compiled by `warmup()`; the playtest asserts `renderer.info.programs` does not grow during melee casts.

## Tests
`node tools/playtest3.js melee`: static rule checks (7/8/9, no `game.hitstop`, no `hasPrompt`, no `player.mods` writes); per melee class:
API + 24 archetypes + 8 impls registered, weapon profile, combo / charged / each new-element basic + charged hit a dummy with one
`spellCast` per press, per-weapon counter flurry, `hit.tier` + `hitstopMul` + `skillId` on every hit, silent setter, §21 check 5
(endgame + showcase casts, no generic fallback), programs stable, ≤ 350 calls; legacy keymap combo + §21 check 4 buff + F ultimate;
paladin with `stub=spells`. `node tools/playtest2.js --only sword` (legacy) passes.
