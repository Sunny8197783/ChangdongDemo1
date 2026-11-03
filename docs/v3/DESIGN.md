# 아케인 와일즈 v3 — 게임 디자인 문서 (DESIGN.md)

Status: **binding design** for the v3 build. The technical counterpart is `docs/v3/CONTRACT.md` (APIs, owners,
events, tests). When the two disagree on a *number*, DESIGN.md wins; when they disagree on an *API*, CONTRACT.md wins.
Player-facing text is Korean. Prose may be English. Every number in this file is a **starting tuning value**: put it
in a data table (never inline magic numbers), so balancing later is a data edit.

**Revision v3.1.** This revision resolves the engineering and design reviews. The resolution log is §17. The headline
changes are:
- Class access is rebalanced so that every element is reachable by exactly 4 classes (§2.1).
- The story gate now blocks only capstones, so every class plays its own fantasy from Act 1 (§5.4).
- Trees grow to 19–20 nodes, with 5–6 quick-slot actives each (§6).
- Earth has a lingering aura, 석화 `encrusted` (§4).
- Reaction priority is published (§4.5).
- Judgment is capped (§4.3 D).
- Regen numbers are retuned (§7).
- The story lore is unified (§8.1).
- Both sky arenas now stand on real terrain, the 세계수 뿌리 고원 (§8.2).
- The finale reads the player's build (§8.6).
- The ultimate key moves to **X**, so F is only ever *interact* (§6.2).
- New sections: a glossary (§14), a balance sim (§15) and difficulty settings (§16).

Contents
1. Pillars · 2. Classes · 3. Elements · 4. Interaction matrix & reactions · 5. Progression · 6. Skill trees (all nodes)
7. HP regen · 8. Story extension & final boss · 9. Animation & VFX plan · 10. UI · 11. Audio · 12. Perf budget
13. Market-research takeaways (13.1 per-element survey) · 14. Glossary · 15. Balance sim · 16. Difficulty · 17. Review resolution log

---

## 1. Pillars

1. **밝은 판타지 그대로.** BotW-style cel-shaded painterly world, spirits, the World Tree 아스트라, a warm village. New
   content uses the same toon material, the same rim light, the same palette logic (white-hot core → saturated mid →
   dark edge). No photoreal smoke, no gore. Darkness exists only as the antagonist's **공허 (Void)** and as the
   redeemed shadow spirit's element, always rimmed with violet light.
2. **원소는 화학이다 (rules, not scripts).** Every element leaves a status on enemies and a *surface* or *object* in
   the world, and every other element changes it. Players solve problems by intuition: water conducts, fire spreads,
   light purifies, seeds sprout, and so on.
3. **빌드는 선택이다.** Six classes, nine elements, 175 tree nodes, a 38-point budget (+2 free 각인 nodes), 4 quick slots. A class
   decides **which** elements it may touch; points decide **how deep**; slots decide **what you bring to a fight**.
4. **타격감 우선.** Every hit reads: hitstop tiers, hit-pose pop, layered impact VFX, layered SFX. The visual weight
   matches the gameplay weight (a basic hit never looks like an ultimate).
5. **짧고 단단한 이야기.** Four compact acts + finale. The golem is no longer the end: it is the first of five seals.
   The finale is a 70 m void wyrm fought on the 세계수 뿌리 고원: on the plateau, around its root pillars, and gliding
   through light rings above it. Every system you learned is required once.
6. **렉 없는 게임 (performance is a feature).** Medium preset: **≤ 350 draw calls, ≤ 900k triangles, no new lights
   (emissive + bloom only), no per-frame allocations, all shaders pre-warmed**, in every zone including the final boss. New
   content is data + pooled archetypes, not new meshes per skill.

---

## 2. Classes (직업)

All six classes share the **same humanoid rig** (`buildWizard` in `src/player/model.js`). A class changes: outfit
(visibility + material tint table), weapon prop (built before `skinMerge`), stance/pose set, moveset, dodge/defend
kit, resource, base stats and element access. Two *families* share runtime code:

- **caster family** (원거리, MP): 마법사, 궁수, 정령술사. Skills use the spells runtime (projectiles / zones / AoE),
  origin = weapon tip (staff gem, bow string, totem head), presented by `style` (`staff` / `bow` / `totem`).
- **melee family** (근접, **투지 Resolve**): 검사, 성기사, 암살자. Skills cost 투지; stamina stays for dodge, block,
  glide and sprint (all classes). Skills use the sword action engine (`startAction`,
  `TPL` poses, swept hit shapes), weapon = `longsword` / `hammer` (+ shield) / `daggers`.

Every skill in the tree has a `caster` form and a `melee` form (see §6). If a form is missing, the fallback is the
caster form fired from the melee weapon tip ("검기") so nothing is ever unusable.

### 2.1 Element access (직업별 접근 가능 속성)

- **주속성 (Primary)**: the full tree, including tier T4 and the capstone (awakened ultimate + finisher).
- **부속성 (Secondary)**: tiers T1–T3 only (including the normal ultimate). T4 and the capstone show as locked
  with the label "주속성 전용".
- **잠김**: the tree shows greyed out with a chain icon and the label "◯◯ 직업만 사용 가능", which advertises the other classes.

| 직업 | id | 무기 | 주속성 | 부속성 | 자원 |
|---|---|---|---|---|---|
| 마법사 | `mage` | 지팡이 staff | 화염, 빙결 | 번개, 바람, 물, 그림자 | MP |
| 검사 | `sword` | 장검 longsword | 번개, 대지 | 화염, 바람, 빙결, 빛 | 투지 |
| 궁수 | `ranger` | 장궁 bow | 바람, 빛 | 번개, 자연, 빙결, 화염 | MP |
| 성기사 | `paladin` | 전투 망치 + 방패 | 빛, 화염 | 대지, 물, 자연, 그림자 | 투지 |
| 정령술사 | `spiritcaller` | 토템 지팡이 totem | 자연, 물 | 대지, 바람, 빛, 그림자 | MP |
| 암살자 | `shadowblade` | 쌍단검 twin daggers | 그림자, 자연 | 빙결, 번개, 대지, 물 | 투지 |

Every class has 2 primaries and 4 secondaries (36 slots in total), and **every element is reachable by exactly 4 classes**.
Flavour of the v3.1 additions:
- 검사 + 빛 is the **성검** line.
- 궁수 + 화염 gives the classic fire arrows.
- 성기사 + 그림자 is the **타락 기사** temptation line (light + shadow → 일식), and 성기사 + 자연 is the **세계수 수호기사** line.
- 정령술사 + 그림자 is the 녹스 medium.
- 암살자 + 물/대지 is a trapper who works in mist and stone.

Coverage check (data-checked by `tools/playtest3/core.js`):

| 속성 | 접근 가능 직업 (4 each) |
|---|---|
| 화염 | 마법사 (주), 성기사 (주), 검사, 궁수 |
| 빙결 | 마법사 (주), 검사, 궁수, 암살자 |
| 번개 | 검사 (주), 마법사, 궁수, 암살자 |
| 바람 | 궁수 (주), 마법사, 검사, 정령술사 |
| 대지 | 검사 (주), 성기사, 정령술사, 암살자 |
| 물 | 정령술사 (주), 마법사, 성기사, 암살자 |
| 자연 | 정령술사 (주), 암살자 (주), 궁수, 성기사 |
| 빛 | 궁수 (주), 성기사 (주), 정령술사, 검사 |
| 그림자 | 암살자 (주), 마법사, 성기사, 정령술사 |

Internal reaction pairs per class. Each class has at least 4; **bold** pairs use only the class's primaries.

| 직업 | Pairs |
|---|---|
| 마법사 | **melt**, overload, superconduct, evaporate, flashfreeze, electrocute, swirl, necroflame, 명빙, blackbolt, miasma |
| 검사 | **grounded**, magma, shatter/crystallize, overload, superconduct, swirl, sandstorm, sanctify, prism, radiant_burst |
| 궁수 | **aurora**, swirl, pollen, prism, radiant_burst, photosynthesis, quicken, frostbloom, wildfire, overload, melt |
| 성기사 | **sanctify**, eclipse, purify, holywater, photosynthesis, magma, evaporate, wildfire, necroflame, mudslide, entangle, bloom, rot, miasma |
| 정령술사 | **bloom**, entangle, mudslide, pollen, photosynthesis, holywater, rot, miasma, eclipse, sandstorm |
| 암살자 | **rot**, 명빙, blackbolt, miasma, quicken, frostbloom, entangle, bloom, flashfreeze, electrocute, mudslide, grounded |

### 2.2 Class sheets

Base stats are at level 1 (see the growth rules in §5.3). In the key column, Q is dodge and E is defend.

**Melee resource, 투지 (Resolve).** Melee classes have a 100-point 투지 gauge for skills. It regenerates 6/s, plus 2 per
landed hit and 4 per reaction. A skill's 투지 cost is its MP cost × 0.8. Stamina is a separate pool used for dodge, block,
glide and sprint by every class. This way a melee player never has to choose between dodging and casting.

**Class trial and class change.**
- Before the choice, each mentor offers a 30 s **체험 대련** against 3 training dummies with the `starter_<cls>` preset (P1).
- After the choice, the 원소의 제단 offers **직업 변경** at any time. It is free, keeps the level, and resets the tree.
  It is blocked during a boss fight.

#### 마법사 (mage) — 원소 학자
- **Fantasy:** a scholar of the elements who chains different elements together to set off reactions.
- **Weapon:** the existing staff, with the attuned element shown in its gem.
- **Moveset:**
  - LMB: the attuned element's basic bolt. Holding it auto-casts (existing behaviour).
  - RMB: hold, then release a charged spell.
  - Q: **점멸 (blink)**, 7 m, 0.2 s i-frames, existing.
  - E: **마법 방벽 (barrier dome)**, existing, with an 80% damage reduction drain.
- **Signature mechanic, 원소 연쇄 (kind `attunement`):**
  - Casting a skill of a *different* element from the last one within 3 s gives a 연쇄 stack (max 3).
  - At 3 stacks, the next skill costs 0 MP and deals +30% damage, then the stacks reset.
  - The HUD shows 3 small orbs above the gem ring.
  - The universal reaction is named differently (원소 교향, §4.3 E), so the two are never confused.
- **Stats:** HP 100 · MP 100 · stamina 100 · power 1.00 · defense 0 · move 1.00.
- **직업 특성 (automatic, by level):**
  - Lv1: 원소 연쇄.
  - Lv10: 연쇄 stacks also refund 5 MP each.
  - Lv20: blink leaves a 1.5 s decoy rune that explodes for 30 damage of the attuned element.
  - Lv25, choose one: **[대마도사]** charged spells charge 30% faster, or **[원소 폭주]** each reaction you trigger has a 15% chance to reset the cooldown of the skill that caused it.

#### 검사 (sword) — 원소검
- **Fantasy:** a knight who enchants the blade and wins on rhythm and parries.
- **Weapon:** the existing longsword.
- **Moveset:** the existing 4-hit combo (the 4th hit changes by element), RMB charged slash, Q dash step with afterimages, E guard + parry (existing). The counter flurry stays.
- **Signature mechanic, 인챈트 블레이드:**
  - Hits fill the 인챈트 gauge by 4 each (8 on a reaction).
  - When the gauge is full, the next perfect parry releases an element wave: an 8 m cone, 80 damage, plus the element's status.
  - The gauge is shown as the blade's glow intensity.
- **Stats:** HP 130 · stamina 110 · power 1.00 · defense 0.10 · move 1.00.
- **직업 특성:**
  - Lv1: 인챈트 블레이드.
  - Lv10: the parry window is +0.05 s.
  - Lv20: the 4th combo hit applies the attuned status twice.
  - Lv25, choose one: **[검성]** combo hits +15%, or **[반격의 대가]** the counter flurry has +2 hits and heals 3%.

#### 궁수 (ranger) — 바람의 사수 (NEW)
- **Fantasy:** a BotW-style archer who aims in slow motion and dances in the air.
- **Weapon:** a longbow on the left hand. The right hand draws the string. String IK uses the two-handed `solveArm` path.
- **Moveset:**
  - LMB: quick shot (0.35 s). Every 3rd shot pierces.
  - RMB: hold to draw. A full draw (1.0 s) does ×2.2 damage, pierces, and leaves a small trail.
  - Q: **백덤블링**, a backflip 6 m backwards with 0.3 s i-frames.
  - E: **집중 (Focus)**. Hold while airborne or gliding, or within 0.6 s after a dodge, to slow time to ×0.35. This is the time-scale entry `focus` (CONTRACT §3.3). The player and the skills runtime use compensated time; enemies, projectiles and regen use game time. It drains 25 stamina/s. While on the ground, E aims without slow motion.
- **Signature mechanic, 원소 화살:**
  - Every caster skill is presented as arrows: a single arrow, a volley, or an arrow that blooms into the skill's zone where it lands.
  - The skill's effect is identical to the mage cast. Only the origin and projectile mesh differ (`style: 'bow'`).
- **Stats:** HP 110 · MP 100 · stamina 110 · power 1.00 · defense 0.05 · move 1.04.
- **직업 특성:**
  - Lv1: 집중.
  - Lv10: headshot zone (upper 25% of an enemy capsule) does ×1.5.
  - Lv20: shots fired during Focus cost 0 MP.
  - Lv25, choose one: **[매의 눈]** full draw adds 2 extra arrows in a fan, or **[바람의 춤]** a backflip refunds 15 stamina and reloads a full draw instantly.

#### 성기사 (paladin) — 빛의 방패 (NEW)
- **Fantasy:** a tanky holy knight whose zones of light keep allies (himself) alive.
- **Weapon:** a warhammer in the right hand and a round shield on the left forearm.
- **Moveset:**
  - LMB: a slow, heavy 3-hit combo. Each hit has hitstop 0.09/0.10/0.16 and the 3rd hit is a ground slam (r 3).
  - RMB: charged **방패 돌진 강타**, a shield bash dash of 6 m that ends in a hammer slam.
  - Q: **방패 돌격 스텝**, 4 m with super armor (no knockback) instead of i-frames.
  - E: **방패 막기**. Blocks 85% of frontal damage. The perfect-block window of 0.2 s is wider than the sword's and causes a parry.
- **Signature mechanic, 수호의 맹세:**
  - Every 4 blocks/parries **or** every 8 landed hits plants a **성인 (holy seal)** at your feet: r 4, 6 s.
  - Inside the seal, the HP regen delay is −50%, the regen rate is +1% maxHp/s, and you take 10% less damage. The §7 boss heal cap applies.
- **Stats:** HP 160 · stamina 110 · power 0.95 · defense 0.18 · move 0.94.
- **직업 특성:**
  - Lv1: 수호의 맹세.
  - Lv10: perfect block reflects projectiles.
  - Lv20: seal radius +1.5 m, and enemies inside get radiant 1/s.
  - Lv25, choose one: **[수호자]** block costs −40% stamina, or **[심판관]** hammer slams on radiant enemies trigger 심판 at 3 stacks. The 심판 cooldowns in §4.3 D still apply.

#### 정령술사 (spiritcaller) — 숲의 목소리 (NEW)
- **Fantasy:** a druid/summoner who fights alongside small element spirits.
- **Weapon:** a totem staff (carved wood, feathers, hanging charms on spring bones).
- **Moveset:**
  - LMB: 정령 탄. Two slow homing wisps of the attuned element, alternating left and right.
  - RMB: a charged spell.
  - Q: **정령 교대**, a short 5 m blink that leaves a wisp behind to absorb one hit.
  - E: **정령 결계**, a dome with 60% damage reduction. It does not drain, but breaks after absorbing 35% maxHp and recharges over 8 s.
- **Signature mechanic, 정령 동료:**
  - Up to **2 familiars** orbit you, one per learned element (each needs ≥ 3 points in that tree). The two most-invested trees win.
  - Each familiar auto-casts that element's LMB bolt at 50% damage every 1.6 s at the nearest enemy within 18 m.
  - Familiars are tiny instanced spirit meshes, pooled, with no shadows.
- **Stats:** HP 105 · MP 120 · stamina 100 · power 0.95 · defense 0.05 · move 1.00.
- **직업 특성:**
  - Lv1: 정령 동료.
  - Lv10: familiars apply their status every shot.
  - Lv20: a 3rd familiar slot.
  - Lv25, choose one: **[교감의 숲]** familiar shots can trigger reactions at full strength, or **[수호 정령]** each familiar absorbs one hit per 10 s.

#### 암살자 (shadowblade) — 그림자 칼날 (NEW)
- **Fantasy:** a fast duelist who stacks marks and detonates them from behind.
- **Weapon:** twin daggers, one in each hand (left hand is FK, right hand uses grip IK).
- **Moveset:**
  - LMB: a fast 6-hit combo (light hitstop 0.04, the 6th hit 0.10).
  - RMB: charged **관통 일격**, a dash-through strike of 9 m.
  - Q: **그림자 구르기**, a roll with 0.4 s i-frames. A *perfect* dodge teleports you behind the attacker.
  - E: **반격 자세**. A 0.3 s counter stance. If you are hit during it, you teleport behind the attacker, the hit is negated, and your next hit is a crit.
- **Signature mechanic, 그림자 표식:**
  - Every hit adds a mark to the target (max 5, 6 s).
  - Backstabs (hits from the rear ±60°) and RMB detonate the marks for +12% damage per mark, dealt as shadow damage.
  - **은신 (auto):** while out of combat, walking (not sprinting) through tall grass gives stealth automatically: enemies' sight range is ×0.3, via `enemies.setPlayerStealth`. There is no crouch key.
- **Stats:** HP 105 · stamina 120 · power 1.00 · crit +10% · defense 0 · move 1.08.
- **직업 특성:**
  - Lv1: 그림자 표식.
  - Lv10: backstab ×1.3.
  - Lv20: detonating 5 marks refunds the RMB cooldown.
  - Lv25, choose one: **[처형자]** marks also execute non-boss enemies below 12% HP, or **[유령]** perfect dodge gives 2 s of stealth.

---

## 3. Elements (속성)

Nine player elements plus one enemy-only pseudo-element, **공허 (`void`)**. The existing ids stay. Water was already a
pseudo-element (`wet`). It becomes a real element.

| id | 이름 | 정령 | 정체성 | 상태이상 (target aura) | 색 core / mid / edge | 지형 상호작용 |
|---|---|---|---|---|---|---|
| `fire` | 화염 | 이그니스 | burst, DoT, the detonator | **burning 화상** | `#fff3c4` / `#ff8a1f` / `#c2261b` | Ignites grass (existing); updrafts; melts ice into puddles; dries mud into a crust |
| `ice` | 빙결 | 글라시아 | control, then freeze, then shatter | **chilled 냉기** → **frozen 빙결** at 6 stacks | `#ffffff` / `#9fe8ff` / `#2f7bd6` | Freezes water into walkable ice (existing); climbable ice pillars; slippery frost ground |
| `lightning` | 번개 | 볼타 | speed, chains, stun | **shocked 감전** | `#ffffff` / `#e9d8ff` / `#7b5cff` | Electrifies puddles and water (3 s charged surface); charges lightning rods |
| `wind` | 바람 | 실피아 | mobility, displacement, spreading | none (it absorbs auras: **swirl**); **airborne 공중** on launch | `#ffffff` / `#c8ffe9` / `#5fd6b0` | Spreads fire (existing); updraft columns; blows steam and miasma clouds away |
| `earth` | 대지 | 테라곤 | weight, armor, break | **encrusted 석화** (6 s lingering aura: −10% move, +20% break taken). The short **stunned 경직** CC is separate and is never an aura | `#fff1d6` / `#c8955a` / `#5b3b22` | Rubble surface; walls and pillars as temporary colliders; shatters ice sheets |
| `water` NEW | 물 | **운디나** | connector, healing, setup | **wet 젖음** (existing) | `#ffffff` / `#7fd3ff` / `#1f6fb8` | **Puddles 물웅덩이** (the existing `water` zone + surface wet cells); extinguishes fire; turns lava into obsidian |
| `nature` NEW | 자연 | **실바니아** | growth, poison DoT, summons, reaction hub | **seeded 씨앗** (stacks 1–5, poison DoT) | `#f4ffd0` / `#8fe05a` / `#2f7d3a` | **Overgrowth 덩굴밭** (slows enemies, burns into wildfire); seed pods; grass regrows instantly |
| `light` NEW | 빛 | **루미엘** | smite, protect, purify | **radiant 성흔** (stacks 1–5 → 심판); **dazzled 눈부심** from some skills | `#ffffff` / `#ffe9a8` / `#ffc24a` | **Blessed ground 축복의 땅** (regen delay −50%, rate +1%/s); refracts through ice and crystals; purifies void blight |
| `shadow` NEW | 그림자 | **녹스** | drain, curse, execute, stealth | **corroded 침식** (stacks 1–5: +5% damage taken each) | core `#1a0b2e`, mid `#5b2a8a`, rim `#b14bff` (contrast inversion) | **Cursed mist 독무** clouds; stealth in shadow; necroflame (which water can't put out) |
| `void` (enemy) | 공허 | — (니드호그라's breath) | corruption | **voidShield 공허 장막** (enemies); **blight 공허 침식** (on the player: regen disabled) | core `#0a0612`, rim `#7a3cff` | **Blight 저주지대**: buffs enemies, blocks regen; light or holy water purifies it |

### Why these four new elements
- **Water.** The research found it is the most combinable element on the market (Magicka, Genshin, BG3, DOS2). It already exists in our reactions (`wet`, `electro_water`, `freeze_water`), and it fills the missing **healer/support** role.
- **Nature.** It adds the **DoT-stack** and **summoner** archetypes. It also makes a *reaction hub* in the spirit of Genshin Dendro, with a twist: in Genshin, Bloom cores react with only two follow-up elements, while our **seed pods react with every element**. It fits the forest-spirit look.
- **Light.** It covers **smite + protect + purify**. It is the narrative counter to the Void wyrm, and its *dazzled* status feeds our existing parry system.
- **Shadow.** It gives the **cost-for-power** archetype (drain, curse, execute) and the assassin fantasy. To keep the tone bright, it belongs to the *redeemed* spirit 녹스, and it is visually distinct from the enemy 공허.
- **Rejected:** Astral/time (too abstract for the reaction chemistry; noted as an NG+ idea), blood and sound (off-tone), and poison as its own element (folded into nature).

### Element style record (one table, consumed everywhere)
Each element has one record: `{id, nameKo, short, spirit, colors{core,mid,edge,css}, status, particle shapes
[primary, secondary], dominant motion, sfxBase(Hz), opposite}`. The full list is in CONTRACT §3.

Dominant motion, from Riot's shape/colour/motion rule:

| 속성 | Dominant motion | Look |
|---|---|---|
| 화염 | rising flicker | teardrop flames, embers drifting up |
| 빙결 | angular shards | slow deceleration, hex frost decal |
| 번개 | jagged strobe | lasts 1–3 frames, branching |
| 바람 | curved spirals | leaves, low alpha |
| 대지 | blocky debris | heavy gravity, ground cracks |
| 물 | arcs and droplets | splash crown, foam ring |
| 자연 | slow petals and vines | lingering green puffs |
| 빛 | vertical pillars | radial rays, rotating rune circles, rising motes |
| 그림자 | inward-pulling particles | dark core, violet rim, normal-blended smoke |

---

## 4. Interaction matrix & reactions (원소 반응)

### 4.1 Rules
- **aura** = a status already on the target, or a surface/object it touches. **trigger** = the element of the incoming hit.
- Exactly one reaction fires per hit. Which one is decided by the **published priority rule in §4.5**: object > surface/zone > the newest aura > judgment.
  Most reactions consume the aura. The table says when one doesn't.
- **Next-hit hint:** when the attuned element would react with the locked target's newest aura, that aura's pip shows the
  reaction icon, and the target bar shows "다음 타격: 감전" (and so on). The player can always predict the result.
- Per-target, per-reaction cooldown is **1.0 s** (the existing `t._rxT`). Reaction damage hits are tagged `noReaction`.
- Statuses use **buildup** for the new stacking statuses (`seeded`, `radiant`, `corroded`). One hit adds one stack.
  DoT ticks never add stacks.
- **Bosses** take freeze, stun and root at ×0.4 duration. Rooted and asleep don't apply to bosses at all; they become
  **+break** instead.
- Every reaction has a colour pair, a Korean banner ("과부하!"), an SFX pitch and a hitstop tier (§9). The first time
  a reaction happens, its codex entry unlocks (+60 XP; included in the §5.1 pacing table).

### 4.2 Matrix (trigger = row, aura = column)

`—` means no reaction (the hit just applies its own status).

| trigger \ aura | burning | chilled/frozen | shocked | encrusted (earth) | airborne | wet | seeded | radiant | corroded |
|---|---|---|---|---|---|---|---|---|---|
| **fire** | — | 융해 melt | 과부하 overload | 용암 분출 magma | — | 증발 evaporate | 들불 wildfire | 성화 sanctify | 흑염 necroflame |
| **ice** | 융해 melt (×1.6) | — | 초전도 superconduct | — | — | 순간 빙결 flashfreeze | 서리꽃 frostbloom | 프리즘 prism | 명빙 voidfrost |
| **lightning** | 과부하 overload | 초전도 superconduct | — | 접지 grounded | — | 감전 electrocute | 촉진 quicken | 광휘 폭발 radiant_burst | 흑뢰 blackbolt |
| **wind** | 확산 swirl | 확산 swirl | 확산 swirl | 모래폭풍 sandstorm | 상승 돌풍 updraft | 확산 swirl | 확산·꽃가루 pollen | 확산·오로라 aurora | 확산·그림자 와류 void_rift |
| **earth** | 용암 분출 magma | 파쇄 shatter (frozen only) / 결정화 (chilled) | 접지 grounded | — (refresh) | 공중 강타 skyslam | 진흙 늪 mudslide | 속박 덩굴 entangle | 결정화 crystallize | 결정화 crystallize |
| **water** | 증발 evaporate (extinguish) | 순간 빙결 flashfreeze | 감전 electrocute | 진흙 늪 mudslide | — | — | 개화 bloom | 성수 holywater | 독무 miasma |
| **nature** | 들불 wildfire | 서리꽃 frostbloom | 촉진 quicken | 속박 덩굴 entangle | — | 개화 bloom | — | 광합성 photosynthesis | 부패 rot |
| **light** | 성화 sanctify | 프리즘 prism | 광휘 폭발 radiant_burst | — | — | 성수 holywater | 광합성 photosynthesis | — (adds stack) | 정화 purify |
| **shadow** | 흑염 necroflame | 명빙 voidfrost | 흑뢰 blackbolt | — | — | 독무 miasma | 부패 rot | 일식 eclipse | — (adds stack) |
| **physical heavy** | — | 파쇄 shatter (frozen) | — | — | — | — | — | 심판 judgment (stacks ≥ threshold) | — |

**Wind keeps one rule (확산):** wind spreads the aura it touches to enemies within 7 m. `pollen`, `aurora` and `void_rift`
are *swirl variants* with one extra effect each, not separate rules. They keep their own codex ids. The codex lists them
under 확산.

**Object and surface triggers.** These don't need an aura on an enemy:

| What gets hit | fire | lightning | ice | earth | water | light |
|---|---|---|---|---|---|---|
| Seed pod | 화염 개화 burgeon | 가시 번개 hyperbloom | 서리꽃 | — | — | 광합성 |
| Puddle | 증발 evaporate (variant `puddle`: steam cloud) | 전기 수면 electro_water | 수면 빙결 freeze_water | 진흙 mudslide | — | 성수 |
| Ice zone | 증기 폭발 steam_burst | — | — | — | — | — |
| Tornado | 화염 회오리 fire_tornado | 뇌전 회오리 storm_tornado | 눈보라 blizzard | — | — | — |
| Lava | — | — | 증기 폭발 | — | 흑요석 obsidian | — |
| Crystal or ice pillar | — | — | — | — | — | 프리즘 |
| Void blight | — | — | — | — | — | 정화 |

**상극 (opposite pairs):** fire ↔ water, fire ↔ ice, light ↔ shadow, lightning ↔ earth.
- On an enemy, they are ordinary reactions (melt really does ×2.0). The only extra rule is that a 상극 reaction **always removes the aura completely**, including all of its stacks.
- On the player, **casting** the opposite element cleanses the matching status from yourself: water removes burning, fire removes chilled, light removes corroded and blight, earth removes shocked. This is the defensive use.
- The word "cancel" means only these two rules.

Every one of the 36 unordered pairs of the 9 elements is listed above. Self-pairs only add stacks.

### 4.3 Reaction registry (49 entries: the 19 existing ids are kept + 30 new)

`P0` = must ship. `P1` = should ship. "×" = damage multiplier on the triggering hit. "AoE r" is in metres.
Numbers are at level 1 and scale with the attacker's power.

**A. Existing 19. Ids, names and behaviour are kept; numbers below match the current code unless marked ★.**

| id | 이름 | 조건 | 효과 | 지형/표면 | P |
|---|---|---|---|---|---|
| `melt` | 융해 | fire → chilled/frozen; ice → burning | ×2.0 (fire→ice) / ×1.6 (ice→fire). Clears frozen, leaves the target wet. | Melts an ice sheet into a puddle ★ | P0 |
| `shatter` | 파쇄 | earth or heavy physical/wind → frozen | ×3.0, ends frozen, ice shards fly out (6 × 8 dmg, r 3) ★, +30 break | Breaks frozen water into floating floes | P0 |
| `electrocute` | 감전 | lightning → wet; water → shocked ★ | ×1.5, stun 1.5 s, chains to up to 4 wet enemies within 9 m | The puddle under the target becomes charged for 3 s ★ | P0 |
| `superconduct` | 초전도 | lightning → chilled; ice → shocked ★ | ×1.25, r 4 frost burst, `exposed` 6 s (+30% damage taken) | — | P0 |
| `overload` | 과부하 | lightning ↔ burning | Explosion r 4, 60 dmg, strong knockback and launch | Ignites grass r 4 | P0 |
| `swirl` | 확산 | wind → burning/chilled/shocked/wet | ×1.2. Spreads that status to enemies within 7 m and takes on its colour | Spreads grass fire | P0 |
| `magma` | 용암 분출 | earth → burning; fire → encrusted ★ | Eruption r 3.5, launch, lava zone 4 s | Lava + water → obsidian | P0 |
| `flashfreeze` | 순간 빙결 | ice → wet; water → chilled ★ | Frozen 2.5 s | Puddle → ice sheet | P0 |
| `evaporate` | 증발 | fire → wet; water → burning ★; fire → puddle (variant `puddle`) | ×1.3 (fire→wet). Water→burning: extinguishes and deals ×1.2 | A steam cloud r 4 for 4 s that blocks enemy sight ★ (the "증기" surface) | P0 |
| `skyslam` | 공중 강타 | earth → airborne | ×1.8, AoE slam r 3 | Crater decal | P0 |
| `updraft` | 상승 돌풍 | wind → airborne | Launches higher (+3 m) | — | P0 |
| `fire_tornado` | 화염 회오리 | fire → tornado zone | Tornado becomes fire: +8 burn dmg/0.5 s | Ignites the grass along its path | P0 |
| `blizzard` | 눈보라 | ice → tornado | Chill +1 per second inside | Frost ground | P0 |
| `storm_tornado` | 뇌전 회오리 | lightning → tornado | Bolts from the tornado, 20 dmg / 0.6 s | — | P0 |
| `steam_burst` | 증기 폭발 | fire → ice zone | Burst r 5, 50 dmg, leaves a puddle | Ice → puddle | P0 |
| `electro_water` | 전기 수면 | lightning → puddle/rain zone | Shocks everyone in the water, 30 dmg + stun 1 s | Charged water 3 s | P0 |
| `freeze_water` | 수면 빙결 | ice → puddle | Freezes the zone; enemies inside become frozen | Ice zone | P0 |
| `fire_wave` | 화염 파도 | wind skill passes through a fire zone | The flame wave advances 10 m | Spreads fire | P0 |
| `infusion` | 원소 부여 | a projectile passes through an element zone | Adds that element's hit at ×0.6. Now generic for all 9 elements ★ | — | P0 |

**B. New: water and earth**

| id | 이름 | 조건 | 효과 | 지형/표면 | P |
|---|---|---|---|---|---|
| `mudslide` | 진흙 늪 | earth → wet; water → encrusted; earth → puddle | ×1.2. Mud surface r 4 for 6 s: enemies −45% move, can't dodge or leap; heavy enemies (mass ≥ 3) also root 1 s | Fire dries mud into a crust (passable) | P0 |
| `crystallize` | 결정화 | earth → chilled/radiant/corroded (no more specific earth reaction applies) | Drops a **crystal shard** of that element (pooled, max 8 alive, 10 s). Pickup: shield of 12% maxHp for 6 s **and** +20% damage on your next skill of that element. Light crystals refract light beams (prism relays). | — | P0 |
| `grounded` | 접지 | earth → shocked; lightning → encrusted (상극) | Removes the aura, ×1.2, +25 break. The player gains `lightningResist` 50% for 3 s | — | P1 |
| `sandstorm` | 모래폭풍 | wind → encrusted; wind zone over a rubble surface | A moving sand vortex r 4 for 4 s: `dazzled` 3 s, 5 dmg / 0.5 s | Consumes the rubble surface | P1 |
| `obsidian` | 흑요석 | water → lava zone | The lava becomes an obsidian platform 6 s (walkable, ice-like ground height) plus a steam puff | Lava → platform | P1 |

**C. New: nature (the seed family)**

| id | 이름 | 조건 | 효과 | 지형/표면 | P |
|---|---|---|---|---|---|
| `bloom` | 개화 | water → seeded; nature → wet | ×1.1. Spawns 1 **seed pod** (씨앗 꼬투리; +1 per 2 seed stacks consumed; pool max 16, §12). A pod pops after 5 s: 30 dmg r 3, and heals the player 3% maxHp if within 6 m | Grass regrows instantly r 4 (if burnt) | P0 |
| `wildfire` | 들불 | fire → seeded; nature → burning | ×1.6. Burning spreads to every seeded enemy within 5 m | Ignites grass and overgrowth r 4 (fire-spread cap 6 cells per tick) | P0 |
| `burgeon` | 화염 개화 | fire hits a seed pod | Pod explodes: 80 dmg r 5, burning 2. A pod caught in another burst detonates **0.1 s later** (staggered), with a chain depth cap of 3 per frame | Ignites grass r 3 | P0 |
| `hyperbloom` | 가시 번개 | lightning hits a seed pod | Pod becomes 3 homing thorn-bolts, 35 dmg each (lightning+nature, shocked) | — | P0 |
| `quicken` | 촉진 | lightning → seeded; nature → shocked | Target `quickened` 6 s: every lightning or nature hit on it deals +25 flat damage | — | P1 |
| `frostbloom` | 서리꽃 | ice → seeded; nature → chilled; ice hits a pod | An ice flower at the target (4 s) pulses chill 1 stack/s in r 4. An earth or heavy hit on the flower: AoE shatter ×2, r 5 | Frozen overgrowth becomes climbable ice vines | P1 |
| `entangle` | 속박 덩굴 | earth → seeded; nature → encrusted | `rooted` 2 s (boss: +40 break instead), plus a thorn ring of 8 dmg / 0.5 s | Rubble becomes a thorn wall (collider, 6 s) | P0 |
| `pollen` | 확산·꽃가루 (swirl variant) | wind → seeded | Spreads 2 seeded stacks to enemies within 7 m, plus **sleep buildup** +40 (100 → `asleep` 4 s; the first hit wakes them at ×1.5) | — | P1 |
| `photosynthesis` | 광합성 | light → seeded; nature → radiant; light hits a pod | Consumes the seeds: the player heals 2% per stack and a **sunflower turret** spawns (6 s, shoots light bolts 12 dmg / 0.6 s, radiant) | — | P1 |
| `rot` | 부패 | shadow → seeded; nature → corroded | Each seed stack detonates for 15 shadow damage and becomes 1 corroded stack | Overgrowth becomes withered land; light restores it | P1 |

**D. New: light and shadow (the modifier axis)**

| id | 이름 | 조건 | 효과 | 지형/표면 | P |
|---|---|---|---|---|---|
| `sanctify` | 성화 | light → burning; fire → radiant | Holy fire: burn ticks ×1.5 for the rest of the burn. Players within 5 m heal 1.5% maxHp/s for 4 s | A fire surface becomes holy flame (white-gold) | P0 |
| `holywater` | 성수 | light → wet; water → radiant; light → puddle | The puddle becomes a **healing spring** r 4 for 8 s: player regen delay −50%, heals +3% maxHp/s (inside the §7 cap); cleanses corroded and blight from the player | Puddle → 축복의 땅 | P0 |
| `prism` | 프리즘 굴절 | light → chilled/frozen; a light beam hits an ice pillar, crystal or frozen enemy | The hit splits into 3 rays toward the 3 nearest enemies within 12 m, 60% damage each, radiant +1 | Ice and crystal act as relay mirrors (light-seal puzzle doors in Act 4) | P0 |
| `radiant_burst` | 광휘 폭발 | lightning → radiant; light → shocked | Flash r 5: `dazzled` 3 s on all, ×1.4 + 10% per consumed radiant stack | — | P0 |
| `judgment` | 심판 | heavy/finisher/charged hit (or any light hit with node `light.p2`) on radiant **≥ threshold** stacks. The threshold is 5. The light mastery-10 milestone and `light.p2` each lower it, but they **don't stack**: take the lowest single value, with a **floor of 3** | **Consumes all radiant stacks.** A pillar of light from the sky: 8% target maxHp (boss: 3%, capped at 400 × power), +40 break (bosses **+20**), `dazzled` 2 s. **Own per-target cooldown: 6 s (bosses 12 s)**, on top of the 1 s reaction cooldown | Light decal | P0 |
| `aurora` | 확산·오로라 (swirl variant) | wind → radiant | Spreads 2 radiant stacks within 7 m. The player gets **오로라** for 6 s: +15% damage | — | P1 |
| `purify` | 정화 | light → corroded; light → enemy `voidShield`; light → blight | Removes corrosion. ×1.5 (×2.0 vs void-type enemies). Depletes voidShield ×4 (see §8.5). Heals the player 5% | Blight → normal ground (quests use this) | P0 |
| `eclipse` | 일식 | shadow → radiant | Unstable: pulls enemies within 7 m toward the centre for 0.6 s, then bursts for 120 dmg r 5. A player within 2 m takes 10% maxHp | — | P1 |
| `necroflame` | 흑염 | shadow → burning; fire → corroded | Black-violet fire for 6 s: 10 dmg / 0.5 s, 30% of it heals the player. Water can't put it out; only light (purify) | A cursed fire surface | P0 |
| `miasma` | 독무 | shadow → wet; water → corroded; shadow → steam cloud | Cursed mist cloud r 5 for 6 s: enemies inside −30% attack and +1 corroded/s | Puddle or steam → cursed | P1 |
| `voidfrost` | 명빙(冥氷) | shadow → chilled/frozen; ice → corroded | The target becomes `cracked`. When frozen ends or the target is shattered, a **soul orb** drops: +15 MP/stamina and +5% HP | — | P1 |
| `void_rift` | 확산·그림자 와류 (swirl variant) | wind → corroded | Shadow vortex r 6 for 2 s that pulls to the centre, +1 corroded/0.5 s | — | P1 |
| `blackbolt` | 흑뢰 | lightning → corroded; shadow → shocked | Chains to every corroded enemy within 10 m (max 5) at 40% damage and refreshes their stacks | — | P1 |

**E. Universal**

| id | 이름 | 조건 | 효과 | P |
|---|---|---|---|---|
| `break` | 붕괴 | An elite or boss **break gauge** reaches 0 (§8.5, §9) | Stagger 4 s (mid-boss 3 s), +50% damage taken, enables the class finisher prompt; 0.25 s near-freeze (timeScale 0.05) | P0 |
| `resonance` | 원소 교향 | 3 **different** reactions on the same target within 6 s | "교향!" banner. The player's next skill costs 0 and deals +30%. 10 s internal cooldown | P0 |

Total: 19 existing + 28 new element reactions + 2 universal = **49** named reactions. That is more than the 30 required.
Of these, P0 = 35.

### 4.4 Statuses (complete list)

| id | 이름 | 출처 | 지속 | 중첩 | 효과 | 보스 |
|---|---|---|---|---|---|---|
| burning | 화상 | fire | 4 s | — | 6 dmg / 0.5 s, contact spread; cancels wet and chilled | normal |
| wet | 젖음 | water | 8 s | — | speed ×0.92; cancels burning | normal |
| chilled | 냉기 | ice | 4 s | 1–6 | speed ×0.6; frozen at 6 stacks | frozen ×0.4 |
| frozen | 빙결 | ice | 2.5 s | — | cannot act | ×0.4 duration + DR immunity window (existing) |
| shocked | 감전 | lightning | 5 s | — | 3 dmg / 0.9 s + micro-stuns | normal |
| **encrusted** | 석화 | earth | 6 s | — | −10% move, +20% break taken; **the earth aura** for magma, mudslide, entangle, sandstorm and grounded | normal |
| stunned | 경직 | earth CC skills, electrocute, mines, parries | 1.0 s | — | cannot act; **not an aura** (no reaction keys off it) | ×0.4 |
| airborne | 공중 | launches | physics | — | juggle | immune |
| exposed | 노출 | superconduct | 6 s | — | +30% damage taken | normal |
| **seeded** | 씨앗 | nature | 8 s (refresh) | 1–5 (8 with a keystone) | nature DoT 2 × stacks per 1 s | normal |
| **radiant** | 성흔 | light | 10 s | 1–5 | +3% light damage taken per stack; at 5, judgment is ready | normal |
| **corroded** | 침식 | shadow | 8 s | 1–5 (7 with a node) | +5% damage taken per stack; player hits on it lifesteal 1% per stack | normal |
| **dazzled** | 눈부심 | light, sandstorm | 3 s | — | enemy wind-ups ×1.4 longer, projectile spread +15°, **player parry window +0.1 s** against it | ×0.5 |
| **rooted** | 속박 | entangle, roots | 2 s | — | cannot move (can attack) | immune → +break |
| **asleep** | 수면 | pollen | 4 s | buildup 100 | cannot act; first hit ×1.5 and wakes | immune |
| **muddy** | 진흙 | mud surface | while inside + 1 s | — | −45% move, no dodge or leap | −20% move only |
| **hexed** | 저주 | shadow.hex | 10 s | — | +20% damage taken | normal |
| **quickened** | 촉진 | quicken | 6 s | — | +25 flat per lightning/nature hit | normal |
| **cracked** | 균열 | voidfrost | 6 s | — | drops a soul orb when frozen ends | normal |
| **voidShield** | 공허 장막 | void enemies | until depleted | numeric `entity.voidShield` 0–100 (a UI pseudo-status, not in the status table) | damage taken ×0.3 while > 0 | — |
| **blight** (player) | 공허 침식 | void attacks, blight ground | 6 s | — | **HP regen disabled**, −10% damage dealt | — |

### 4.5 Reaction priority (published) & codex families

**Which reaction fires.** Each hit is evaluated per target, and at most **one** reaction fires on that target. The steps run in this order:

1. **Object.** If the hit's collider is an object (seed pod, crystal, ice pillar, sunflower turret), only that object's reaction is evaluated. The enemy behind it gets the plain hit.
2. **Zone/surface fusion.** Fusions are evaluated on the zone the projectile or effect passes through or lands in (tornado, puddle, ice zone, lava, fire zone → `fire_wave`, element zone → `infusion`, blight). A fusion changes the zone or the projectile. It **does not** use up the target's reaction. Infusion adds its element first, so the infused projectile can still react on the enemy.
3. **Aura (newest first).** On the target, take its auras from **newest applied to oldest**. The first aura whose matrix cell (§4.2) for the trigger element is not `—` and is not on that target's 1 s reaction cooldown fires. `frozen` counts as the same aura as `chilled`; when frozen, the frozen-specific cell wins (shatter over crystallize).
4. **Judgment** is checked only for `physical` or `light` triggers, or as the fallback when step 3 found nothing. It needs radiant ≥ threshold and the hit tag rules in §4.3 D.
5. Otherwise, there is no reaction and the hit applies its own status.

Worked example: an enemy is wet, then seeded, then radiant (radiant is the newest). A lightning hit fires **광휘 폭발**. If
광휘 폭발 is on cooldown, the next aura is seeded, so 촉진 fires. The HUD "다음 타격" hint (§4.1, §10) shows exactly this
evaluation. It is computed by the same function (`combat.previewReaction(target, el)`).

**Codex families** (6 families + 2 universal). Each family has a frame colour on the banner, the codex and the hint icon:

| Family | Colour | Members |
|---|---|---|
| 폭발 (burst) | `#ff7a3a` | melt, shatter, overload, magma, skyslam, steam_burst, burgeon, hyperbloom, radiant_burst, eclipse |
| 제어 (control) | `#8fd8ff` | electrocute, superconduct, flashfreeze, freeze_water, mudslide, grounded, quicken, frostbloom, entangle |
| 확산 (spread) | `#7fffc8` | swirl, pollen, aurora, void_rift, updraft, fire_wave, infusion, wildfire |
| 표면 (surface) | `#e0b870` | evaporate, electro_water, obsidian, sandstorm, fire_tornado, blizzard, storm_tornado |
| 축복 (blessing) | `#ffe08a` | sanctify, holywater, photosynthesis, purify, bloom, crystallize, prism, judgment |
| 저주 (curse) | `#b98bff` | necroflame, miasma, rot, voidfrost, blackbolt |
| 보편 (universal) | `#ffffff` | break, resonance |

---

## 5. Progression (성장)

The old v2 choice of **원소의 방랑자 (all elements) or 원소의 대가 (one element)** is removed. It is replaced by
**class + level + skill points + element trees + mastery**.
- The old *master* experience is "fill one primary tree to its capstone".
- The old *wanderer* experience is "spread points across 3–4 trees at T1–T3".

Both are now *emergent builds* rather than a menu choice.

### 5.1 Level & XP
- **Level cap 30.**
- `xpToNext(L) = round(40 · L^1.4 + 60)`. L1 needs 100, L5 → 454, L10 → 1064, L20 → 2712, L29 → 4524. Reaching L30 takes about 55k XP in total.
- **XP sources:**

| Source | XP |
|---|---|
| 말랑이 (slime; was "츄츄") | 6 |
| 뿔도깨비 (was "보코블린") | 15 |
| 도깨비 주술사 | 25 |
| Act 2–4 mobs | 35 (Act 2) / 45 (Act 3) / 60 (Act 4) |
| Elite (void knight etc.) | 90 |
| 첫 반응 발견 (codex entry) | 60 |
| 정령의 씨앗 shrine | 300 |
| Landmark discovery | 80 |
| Quest step | 200–1500 (see the per-act budget) |
| Act boss: 고대 바위 골렘 | 600 |
| Act boss: 레비아탄 | 1500 |
| Act boss: 녹스 | 1500 |
| Act boss: 모르그로스 | 2500 |
| Act boss: 칼리스 | 3000 |

  XP comes only from entities with `xpValue > 0`. Props, barrels and training dummies give 0. An entity without a `zoneLevel` counts as level 1.
  Kill XP is ×0.5 if the player is 6 or more levels above the zone level. It is ×1.5 (catch-up) if the player is 3 or more levels below the zone's minimum.
- **Per-act XP budget.** Every act reaches its target level **without grinding**. The cumulative XP needed comes from `xpToNext`.

| Act | Quest | Bosses | Mobs (≈ count × XP) | Codex (≈ entries × 60) | Shrines + landmarks | Act total | Cumulative | Level reached |
|---|---|---|---|---|---|---|---|---|
| 1 (→ golem) | 700 | 600 | 400 | 480 (8) | 600 + 240 | 3020 | 3020 | **8** (2513) |
| 2 (Mirwen or Elderwood first) | 2500 | 1500 | 1050 (30 × 35) | 720 (12) | 600 + 240 | 6610 | 9630 | **14** (9376) |
| 3 (the other region) | 7100 | 4000 | 2250 (50 × 45) | 720 (12) | 600 + 320 | 14990 | 24620 | **≈21** (24638) |
| 4 (ascent + Kalis) | 8500 (5 ascent steps × 900, Kalis 1500, 2 sage/lake-keeper requests 2500) | 3000 | 1800 (30 × 60) | 480 (8) | 600 + 160 | 14540 | 39160 | **25** (37395) |
| Finale | — | — | — | — | — | — | — | **25–26** |

  The finale is tuned for level 25 (power ×1.96). Post-game 정령 시련 (spirit trials: replay mid-bosses at +30% HP) takes you to 30.

### 5.2 Skill points (budget < tree cost)

| 출처 | 포인트 |
|---|---|
| Class choice (start) | +1. Both primary trees' `각인` (attune) node is also **granted free**. Granted nodes cost 0, can't be refunded, count **1 toward tier gates** and **0 toward mastery damage** |
| Levels 2–20: +1 each | +19 |
| Levels 22, 24, 26, 28, 30: +1 each | +5 |
| Act bosses: golem, hydra, Nox, treant, Kalis: +1 each | +5 |
| 정령의 씨앗 shrines (8 hidden: 2 in Act 1, 2 per region, 2 on the ascent): +1 each | +8 |
| **Total at cap** | **38** (+2 free 각인 nodes) |

- The save stores ranks, not points. Points are always **recomputed** as earned(level, bosses, shrines) − spent(ranks).
- **Tree costs (v3.1 shape, §6.1)**, with the free 각인 already subtracted:

| | Classic tree (19 nodes) | New-element tree (20 nodes) |
|---|---|---|
| Everything a secondary can take (T1–T3) | 12 paid | 13 paid |
| Full primary tree | 22 paid | 23 paid |
| Cheapest path to the capstone (gate 14, the 각인 counts 1) | **15 paid** | **15 paid** |

- **Class-reachable total** is about 2 × 22.5 + 4 × 12.5 ≈ **95**. All 9 trees together come to 5×22 + 4×23 = **202** (paid).
- **Budget use:** 38 points is about 40% of what a class can reach, so builds really differ. Adding nodes added *choice*, not power.
- **Points by act** (all shrines found; subtract the shrines you missed):

| Point | Level | Points |
|---|---|---|
| Act 1 end (golem) | 8 | **11** |
| Act 2 end | 14 | **20** |
| Act 3 end | 21 | **30** |
| Act 4 end | 25 | **35** |
| Level cap | 30 | **38** |

- **Earliest capstone:** 15 paid in one tree, plus the story gate (§5.4). That is Act 2, mid-way (≈ L12–13).
- **Example builds:**
  - (a) **대가형**, reachable in Act 3: one full primary (22) + one secondary to T3 (12) + 4 elsewhere.
  - (b) **쌍대가**, reachable by the end of Act 3: two capstones by the cheapest path (15 + 15 = 30), plus the rest.
  - (c) **방랑자형**: 3–4 trees at 5–12 points. It is rewarded by §5.7, so it is a real alternative, not a trap.

### 5.3 Stats (능력치)
- Stats are derived. There is no stat point-buy, so the skill tree is the only choice layer.
- Growth per level above 1:
  - `maxHp = base · (1 + 0.06 · (L − 1))`
  - `maxRes = base · (1 + 0.02 · (L − 1))`
  - `power = base · (1 + 0.04 · (L − 1))`
- Power multiplies all outgoing damage, including reactions and DoTs.
- Passives and buffs feed a **stacking modifier aggregator** (`game.stats`, CONTRACT §5). Keys include atkMul, dmgTakenMul, moveMul, atkSpeed, castSpeed, cdrMul, critChance, critMul, elementDmg[el], reactionDmg[id], regenDelayAdd, regenRateMul, maxHpMul, maxResMul and the flags.
- **Enemy zone scaling** (HP ×, damage ×) by `zoneLevel`:

| Zone | Level | HP × | Damage × |
|---|---|---|---|
| Act 1 | 1–8 | 1.0 | 1.0 |
| Act 2 (first region: Mirwen or Elderwood) | 9–14 | 1.9 | 1.5 |
| Act 3 (second region) | 15–21 | 2.8 | 1.9 |
| Act 4 (ascent, 거울의 정원) | 21–25 | 3.4 | 2.2 |
| Finale (뿌리 고원) | 25 | 3.6 | 2.4 |

  At level 25 the player has power ×1.96 and HP ×2.44, so fights stay meaningful.
  A region's level row is set when it is **entered first or second** (`enemies.scaling` reads the act order from story), so the non-linear order is still scaled correctly. Difficulty (§16) multiplies on top.

### 5.4 Tree gating
- **Tier gates** count points spent *in that tree*:

| Tier | Points in tree needed |
|---|---|
| T1 | 0 |
| T2 | 2 |
| T3 | 5 |
| T4 | 9 (primary only) |
| Capstone | 14 (primary only) |

- **Prerequisites:** each node lists one prerequisite node (or none).
- **Modifiers** come in exclusive pairs. Learning one locks its pair until respec.
- **Story gate (capstones only).** Story progress never blocks T1–T4. It blocks **only the capstone**, so every class plays its own element fantasy, including its normal ultimate, from the 각인 의식 on:
  - At the 각인 의식, each class's mentor gives a **정령의 파편** of every new element the class can access. It explains the lore of why the trees work before the spirit is freed.
  - **Classic 5 capstones:** after the golem ("봉인 해제").
  - **물:** after the hydra (운디나 freed). **그림자:** after Nox. **자연:** after the treant.
  - **빛:** after **루미엘의 깃털**, which wakes once **any two** of 운디나, 녹스 and 실바니아 are freed (mid Act 3). Kalis then frees 루미엘 fully, which grants the finale's light spear and the epilogue cameo.
  - Acts 2 and 3 are **non-linear**: after the reveal, Mirwen and Elderwood are both open from the hub, in either order. So a shadow or nature class can free its spirit first.
  - A locked capstone shows "◯◯의 정령을 해방하면 개방" with a shard icon.
- `tierCap(el)`: no access → none; secondary → T3; primary → T4, or CAP once its story gate is met.
- **Mastery (원소 숙련):** this is automatic, from the points in a tree.
  - Every point gives **+2% damage** with that element (max +30% at 15).
  - Ranks: 입문 (1–4) · 숙련 (5–9) · 전문 (10–13) · **대가 (14+, primary only)**.
  - At 5, 10 and 15 points there is a milestone:

| 속성 | 5 | 10 | 15 |
|---|---|---|---|
| 화염 | burning +1 s | burn ticks +20% | ignition spreads to adjacent enemies on kill |
| 빙결 | freeze at 5 stacks | frozen +0.5 s | shatter shards ×2 |
| 번개 | chain +1 | shocked micro-stun +50% | crits on shocked targets chain |
| 바람 | glide stamina −15% | knockback +30% | swirl r +3 |
| 대지 | poise damage +15% | damage taken −5% | slams leave rubble |
| 물 | wet +3 s | heals +15% | puddles last ×2 |
| 자연 | seeded max +1 | pod cap +2 | pods heal ×2 |
| 빛 | radiant +1 on crit | judgment threshold 4 (non-stacking with `light.p2`; floor 3) | blessed ground r +1 |
| 그림자 | lifesteal +2% | corroded max +1 | executes at 15% |

  This replaces the old flat ×1.25 master bonus.

### 5.5 Respec (초기화)
- **Single node refund:** free, at the 원소의 제단 (village altar, r 8) or at any **정령의 문** (spirit gate, see §8). Refunds that node's ranks. Blocked if another learned node depends on it, **or if the refund would drop the tree below the tier gate of any learned node** (reason "gate").
- **Full reset:** free at the same places. The two granted 각인 nodes stay.
- **What a refund clears:** slots holding skills that are no longer learned are emptied. `buff:<skill>` stat sources are cleared. Familiars and the treant despawn. The awakening gauge goes to 0 if no capstone remains.
- **In the field:** the tree is browsable and has **planner mode**: a preview that **never commits anything** (no learning, no equipping).
- **Equipping (one rule):** equipping is allowed when you are **out of combat** (§7 definition), **or** when the game is paused in the tree and you have taken no damage in the last 5 s.

### 5.6 What happens to the old path-choice scene
- The story stage `choose` ("두 스승") becomes **"여섯 갈래의 길"**:
  - The elder brings you to the 원소의 제단.
  - Six mentors stand around the altar: 엘리시아 (mage), 바르칸 (sword), and new 아리엔 (ranger), 오르벤 (paladin), 세리아 (spiritcaller) and 카이렌 (shadowblade).
  - Talking to one opens the **class card panel**: portrait silhouette, fantasy line, weapon, signature, element access chips (primary in gold, secondary in silver) and a stat radar. "이 길로 간다" confirms.
- The **blessing ceremony** (`buildBlessing`) becomes **"각인 의식"**:
  - Only the spirits of the class's elements descend: primaries are big and in front, secondaries small and behind.
  - The first point is granted, then the camera cuts to the skill tree tutorial overlay: "K: 스킬 트리를 열어 첫 포인트를 사용하세요".
- **Training** (`training` stage) steps become: basic → charged → quick skill (1) → block/defend → dash → **learn one node and equip it**.
- The old awakening gauge stays. It is enabled once any capstone is learned **or** the 방랑자 breadth milestone is reached (§5.7), and it fills toward the finisher (R).
- **Tree onboarding** (ui + story):
  - The first time the tree opens, a 3-page guided tour covers: (1) why a tree is locked (class) and the primary/secondary chips; (2) the tier-gate bar; (3) the "수정자 택1" popup.
  - Contextual one-time tips appear on the first story-gated capstone, the first exclusive pick, the first mastery rank-up, and the first time there are unspent points within 30 m of an altar or gate.
  - A **반응 수련 허수아비 (reaction trainer)** stands in the village. It cycles auras and shows the "다음 타격" hint large.

### 5.7 방랑자 (breadth) reward
The v2 wanderer path stays a real choice:
- **원소의 방랑자:** +4% reaction damage for each tree with ≥ 5 points (max 4 trees, +16%).
- **Breadth milestone:** with 3 trees at ≥ 5 points, you gain **방랑자의 각성**.
  - It enables the awakening gauge.
  - It makes any equipped ultimate cast an **awakened variant**: +30% damage and +1 status stack.
  - It unlocks the element-generic finisher **원소 교향곡** on R. This finisher uses the attuned element's colours and the 9-colour template.
- The breadth bonus and the mastery milestones do not exclude each other. The reward for a deep tree (its capstone aura and its 15-point milestone) stays unique.

---

## 6. Skill trees (원소별 스킬 트리)

### 6.1 Shape (v3.1: 19 nodes per classic tree, 20 per new-element tree)

```
T1 (0)    [각인 A]   [a2 A]   [p1 P ×3]
T2 (2)    [a3 A]   [a4 A]   [u A]   [m1a M | m1b M]          (u = utility active, §6.13; m1 = modifier on a2)
T3 (5)    [ult U ×2pt]   [rx P]   [m2a M | m2b M]   [sig A]*  (m2 = modifier on a3; *sig only in the 4 new trees) ← secondary stops here
T4 (9)    [sup S ×2pt]   [t4 A ×2pt]   [m3a M | m3b M]   [key K]   [p2 P ×2]     (t4 = primary-only active; m3 on t4)
CAP (14)  [cap C ×2pt]  = awakened ultimate (X) + finisher (R) + aura passive   ← primary only, story gate (§5.4)
```

The nodes `u`, `sig`, `t4` and `m3a/m3b` are listed per element in **§6.13**. The original 15 nodes are in §6.4–6.12.

**Node types:**
- `active`: castable. The attune node grants LMB and RMB. Other actives go in quick slots 1–4.
- `ultimate`: goes in slot X.
- `support`: goes in slot G, or in a quick slot.
- `modifier`: changes one active. Exclusive pair.
- `passive`: has ranks.
- `keystone`: a trade-off, PoE-style.
- `capstone`.

**Costs:** 각인 1 (granted free for primaries), a2 1, p1 1/rank (3), a3 1, a4 1, u 1, m1 1, ult 2, rx 1, m2 1, sig 1, sup 2, t4 2, m3 1, key 1, p2 1/rank (2), cap 2.
That gives **23 per classic tree** (24 for a new element) and **13 to T3** (14). The paid costs are in §5.2.

**Unlock prerequisites (this rule applies to every tree):**

| Node | Prerequisite |
|---|---|
| attune, a2, p1 | none |
| a3, a4, u | attune |
| m1 | a2 |
| sig | a3 or a4 |
| t4 | ult |
| m3 | t4 |
| ult | a3 or a4 (either) |
| rx | p1 (rank 1) |
| m2 | a3 |
| sup | ult |
| key | rx |
| p2 | rx |
| cap | ult, plus the tier gate |

**Per-class presentation.** Each node lists **caster** (마법사, 정령술사, 궁수) and **melee** (검사, 성기사, 암살자) forms.
- Bow and totem use the caster form with arrows or wisps as the projectile mesh.
- Hammer and daggers use the melee form with their weapon's TPL poses: paladin = slower, bigger radius ×1.2; shadowblade = faster ×1.25, radius ×0.85.
- Numbers are identical across forms unless stated, so the same tooltip covers both.
- **Resource cost:** "MP" for the caster family. The melee family pays **투지 = MP × 0.8** (§2.2).
- **One active, one world interaction.** Every active names an "Arcane Wilds twist" (§13.1): what it does to terrain, surfaces or objects.

### 6.2 Quick-slot model & keybinds (v3)

| Key | Slot | Accepts |
|---|---|---|
| LMB | 기본 공격 | attuned element's `basic` (granted by attune) |
| RMB (hold/release) | 충전 공격 | attuned element's `charged` |
| **1 · 2 · 3 · 4** | 빠른 슬롯 q1–q4 | any learned `active` or `support` of any accessible element |
| **X** | 궁극기 | any learned `ultimate`. If that element's capstone is learned (or 방랑자의 각성, §5.7), it casts the awakened version |
| **F** | 상호작용 | interact only (NPCs, gates, shrines, rot walls). F is never a combat input |
| **G** | 보조 | any learned `support` |
| **R** | 필살기 | the finisher of the *attuned* element (needs its capstone and a full awakening gauge) |
| **Wheel / Z** | 원소 조율 (attune) | cycles the class's elements that have ≥ 1 point. **Casting any quick skill auto-attunes to its element** (0.15 s), so LMB/RMB follow your last skill (the BotW flow) |
| Q / E | dodge / defend | class kit |
| V | 정령의 선물 | finale only (§8) |
| K / C / Tab | 스킬 트리 / 캐릭터 / 원소 도감 (grimoire) | menus |

- **Total equipped:** LMB, RMB, 4 quick slots, X, G and R, so **5 chosen actives + 1 ultimate**, plus the attuned basics.
- **Equip rules:** a skill can occupy only one slot. Re-equipping follows the single rule in §5.5. Planner mode never equips.
- **v2 habit:** in v3 the digits 1–4 are quick slots. The first time the player presses a digit with an empty slot, a tip says "1~4: 빠른 슬롯 · Z: 원소 전환".
- **Legacy test keymap:** when the URL has `path=`, Digit1–5 select elements (the old map) so the v1/v2 playtests run.

### 6.3 Damage convention
- Damage numbers are at level 1, power 1.0, and the existing code's values are kept for legacy skills.
- `cd` is the cooldown in seconds. `mp` is the cost.
- "→ legacy" means the node reuses an existing implementation (spell def id / sword moveset) unchanged.

---

### 6.4 화염 (fire) — 이그니스의 불꽃 · 마법사 (주), 성기사 (주), 검사, 궁수 (부)

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `fire.attune` | 화염 각인 | active (grants `fire.basic`, `fire.charged`) | 1 | — | LMB **화염구** 20 dmg + burning (mp 4, cd 0.3). RMB **업화의 구슬**: charge 1.1 s, 30–90 dmg, fire zone 4 s (mp 16) | → legacy `fire_basic`/`fire_heavy` · melee → legacy sword fire combo/heavy (화염 검술 / 염화 발도). Paladin: 3-hit hammer, 3rd hit fire ring r 3 |
| `fire.salamander` | 살라만더 | active | 1 | — | A flame crawls along the ground 14 m at 9 m/s, 14 dmg per enemy + burning; leaves a fire line 4 s (6 dmg / 0.5 s). mp 14, cd 6 | caster: staff or arrow plants the flame. melee: low upward slash sends a ground wave |
| `fire.p1` | 불씨 | passive ×3 | 1/rank | — | Burning +0.5 s and burn ticks +15% per rank | — |
| `fire.cyclone` | 홍련 선풍 | active | 1 | attune | Instant fire nova r 5 around you: 35 dmg, knockback 6, burning. mp 16, cd 8 | caster: staff spin + ring. melee: 360° spin slash (`TPL.spin`) |
| `fire.rising` | 화염 상승 | active | 1 | attune | Eruption at the aim point (melee: in front, 3 m): 28 dmg, **launch 2.5 m** (combo starter for skyslam). Melee also hops 1.2 m. mp 14, cd 7 | caster: geyser under target. melee: rising uppercut (`TPL.upper`) |
| `fire.m1a` | 장작불 | modifier (salamander) | 1 | salamander | The fire line lasts 7 s and is 2 m wide | — |
| `fire.m1b` | 화염 질주 | modifier (salamander) | 1 | salamander | Travels 22 m at ×2 speed and explodes at the end: 40 dmg r 3 | — |
| `fire.ult` | 메테오 | ultimate | 2 | cyclone or rising | Huge meteor after a 1.0 s telegraph: 160 dmg r 7, burning crater 6 s. mp 45, cd 14 | → legacy `fire_ultimate` · melee → legacy 홍련 난무 |
| `fire.rx` | 과열 | passive | 1 | p1 | **Burning enemies hit by any reaction explode** for 25 fire dmg r 3 (1.5 s per-target cooldown; staggered like pods, chain depth 3). Fire reactions +15% | — |
| `fire.m2a` | 이중 고리 | modifier (cyclone) | 1 | cyclone | A second ring 0.4 s later at 60% | — |
| `fire.m2b` | 불사의 고리 | modifier (cyclone) | 1 | cyclone | Heals 4% maxHp per enemy hit (max 12%) | — |
| `fire.sup` | 불꽃 정령 소환 | support (role: summon) | 2 | ult | A fire spirit orbits for 15 s and shoots fireballs at 40%. mp 25, cd 24 | → legacy `SUPPORTS.fire` / sword `SUPPORT.fire` (flame-blade buff) |
| `fire.key` | 연소의 맹약 | keystone | 1 | rx | **+35% fire damage**, but your HP regen delay is +3 s | — |
| `fire.p2` | 잉걸불 심장 | passive ×2 | 1/rank | rx | Killing a burning enemy restores 4 MP/stamina and 2% HP per rank | — |
| `fire.cap` | 이그니스의 각성 | capstone | 2 | ult, gate 14 | X becomes **천체 낙하 · 각성**. R unlocks **불사조 강림**. Aura **업화의 몸**: immune to burning; every 3rd hit adds +1 burning | → legacy `fire_awakened`, `FINISHERS.fire` / sword `ULT.fire(awakened)`, `FINISHER.fire` |

### 6.5 빙결 (ice) — 글라시아의 서리 · 마법사 (주), 검사, 궁수, 암살자 (부)

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `ice.attune` | 빙결 각인 | active (`ice.basic`, `ice.charged`) | 1 | — | LMB **빙결 파편** (3 shards, chill). RMB **서리 창** (piercing, freezes) | → legacy `ice_basic`/`ice_heavy` · melee 냉기 검술 / 빙결 일섬 |
| `ice.nova` | 서리 폭발 | active | 1 | — | Ring r 6: 20 dmg, chilled +3 stacks. mp 14, cd 9 | caster: staff slam. melee: blade plant, frost ring |
| `ice.p1` | 혹한 | passive ×3 | 1/rank | — | Chill slow +5% per rank, frozen duration +0.3 s per rank | — |
| `ice.pillar` | 빙주 | active | 1 | attune | An ice pillar at the aim point (h 6 m, 8 s): knock-up 1.8 m, 30 dmg. **Climbable / stand-on top** (world platform) | caster: aimed. melee: in front, 4 m |
| `ice.prison` | 빙결 감옥 | active | 1 | attune | Encases one target: frozen 3 s (boss: 0.8 s and +30 break). It takes +50% from shatter. mp 18, cd 14 | caster: ice orb. melee: thrust (`TPL.thrust`) |
| `ice.m1a` | 서리 지대 | modifier (nova) | 1 | nova | Leaves frost ground r 6 for 5 s (slippery, chill 1/s) | — |
| `ice.m1b` | 서리 껍질 | modifier (nova) | 1 | nova | The nova coats you in frost for 6 s: the next 2 melee attackers get chilled +3 and are knocked back 4 m (a reactive coat, not a shield) | — |
| `ice.ult` | 빙하 송곳 | ultimate | 2 | pillar or prison | A wave of ice spikes runs 24 m along the ground: 48 dmg per row, frozen 3 s, launch 4. mp 40, cd 13 | → legacy `ice_ultimate` · melee 절대영도 검무 |
| `ice.rx` | 파쇄의 지혜 | passive | 1 | p1 | **Shattering a frozen enemy flash-freezes** the chilled enemies within 4 m (1 jump, no chaining). Ice reactions +15% | — |
| `ice.m2a` | 빙교 | modifier (pillar) | 1 | pillar | The pillar falls forward into a 10 m walkable **ice bridge** for 8 s (a world platform; crosses water and gaps) | — |
| `ice.m2b` | 서리 첨탑 | modifier (pillar) | 1 | pillar | The pillar explodes after 4 s into 8 shards × 15 dmg | — |
| `ice.sup` | 서리 반격 | support (role: counter) | 2 | ult | For 8 s, the next 3 hits you take are −60%, and each one **freezes the attacker** (boss: +20 break, chilled +3). mp 22, cd 22 | caster: frost sigil on the body. melee: blade crossed in a frost guard. Reuses the legacy support visuals |
| `ice.key` | 영구동토 | keystone | 1 | rx | Freeze needs 4 stacks and frozen lasts ×2, but ice damage is −20% against targets that aren't frozen | — |
| `ice.p2` | 냉혈 | passive ×2 | 1/rank | rx | Hitting a frozen enemy refunds 3 MP / 4 stamina per rank (0.5 s internal cooldown) | — |
| `ice.cap` | 글라시아의 각성 | capstone | 2 | ult | X **빙하기 · 각성**. R **영원의 겨울**. Aura **서리 영역**: enemies within 6 m get chilled +1 every 2 s | → legacy |

### 6.6 번개 (lightning) — 볼타의 섬광 · 검사 (주), 마법사, 궁수, 암살자 (부)

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `lightning.attune` | 번개 각인 | active (`lightning.basic`, `lightning.charged`) | 1 | — | LMB **전격** (instant, chains 1). RMB **연쇄 번개** | → legacy · melee 번개 검술 / 뇌광 섬격 |
| `lightning.mine` | 뇌전 지뢰 | active | 1 | — | Place a mine (max 3, 20 s); trigger r 2.5: 40 dmg, shocked, stun 0.6 s. 3 charges, recharge 3 s each. mp 8 | caster: thrown. melee: stabbed into the ground |
| `lightning.p1` | 정전기 | passive ×3 | 1/rank | — | Shocked damage-taken +4% per rank; at rank 2, chains +1 | — |
| `lightning.dash` | 뇌신 질주 | active | 1 | attune | Blink 10 m along the aim; enemies on the path take 30 dmg + shocked; 0.25 s i-frames. mp 12, cd 7 | caster: bolt-teleport. melee: dash slash (`TPL.iaido`) |
| `lightning.ball` | 구전 | active | 1 | attune | A slow orb (4 m/s, 6 s) zaps the nearest enemy within 6 m every 0.5 s for 10 dmg. mp 18, cd 12 | — |
| `lightning.m1a` | 연쇄 지뢰 | modifier (mine) | 1 | mine | Mines chain-trigger each other within 8 m | — |
| `lightning.m1b` | 자석 지뢰 | modifier (mine) | 1 | mine | Mines pull enemies 4 m inward before exploding | — |
| `lightning.ult` | 천벌의 뇌우 | ultimate | 2 | dash or ball | Storm cloud r 8.5 for 5.5 s: rain makes enemies wet, bolts strike 16 dmg + shocked every tick; it leaves a puddle r 6.5 for 8 s. mp 45, cd 15 | → legacy · melee 천뢰 낙인 |
| `lightning.rx` | 과전류 | passive | 1 | p1 | **Chains travel through water:** electrocute and lightning chains may jump to any wet enemy or puddle within 12 m (normally 9), and puddles they cross stay charged +2 s. Lightning reactions +15% | — |
| `lightning.m2a` | 뇌광 잔상 | modifier (dash) | 1 | dash | Leaves 3 afterimages that explode for 25 each | — |
| `lightning.m2b` | 연속 질주 | modifier (dash) | 1 | dash | 2 charges | — |
| `lightning.sup` | 번개 가속 | support (role: tempo) | 2 | ult | Cast speed +60%, chains +2, move +20%, 12 s | → legacy |
| `lightning.key` | 폭주 회로 | keystone | 1 | rx | +40% attack and cast speed, but every skill cast costs 2% of current HP | — |
| `lightning.p2` | 뇌운 | passive ×2 | 1/rank | rx | Crits on shocked enemies call a bolt for 20 (+10 per rank) dmg (1 s internal cooldown) | — |
| `lightning.cap` | 볼타의 각성 | capstone | 2 | ult | X **뇌신의 심판 · 각성**. R **천뢰 강림**. Aura **정전기장**: every 3rd hit chains to 2 enemies at 30% | → legacy |

### 6.7 바람 (wind) — 실피아의 숨결 · 궁수 (주), 마법사, 검사, 정령술사 (부)

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `wind.attune` | 바람 각인 | active (`wind.basic`, `wind.charged`) | 1 | — | LMB **바람의 칼날** (piercing crescent, push). RMB **돌풍** (launch) | → legacy · melee 바람 검술 / 진공참 |
| `wind.vortex` | 소용돌이 | active | 1 | — | A wandering vortex 5 s: pulls r 6, lifts 1 m, 6 dmg / 0.5 s. It is a tornado zone, so it absorbs fire/ice/lightning/water zones (fusions). mp 16, cd 10 | — |
| `wind.p1` | 순풍 | passive ×3 | 1/rank | — | Glide stamina −10% per rank, move +3% per rank | — |
| `wind.gust` | 반발 돌풍 | active | 1 | attune | Cone 8 m / 70°: knockback 10, **reflects projectiles**, 15 dmg. mp 10, cd 6 | caster: palm blast. melee: wide sweep |
| `wind.step` | 질풍 보법 | active | 1 | attune | Dash 8 m with afterimages; your next attack within 2 s does +30% and launches. Refunds 1 dash pip. mp 8, cd 5 | — |
| `wind.m1a` | 흡인 | modifier (vortex) | 1 | vortex | Pull radius 9 m | — |
| `wind.m1b` | 상승 기류 | modifier (vortex) | 1 | vortex | The vortex is also an **updraft column** (lift 14 m/s², 20 m) for gliding | — |
| `wind.ult` | 대회오리 | ultimate | 2 | gust or step | A giant tornado r 4.5 travels to the aim point over 6.5 s: pulls, lifts, 7 dmg / 0.35 s. It is a tornado zone (fire, ice and lightning fusions). mp 40, cd 14 | → legacy · melee 폭풍 검진 |
| `wind.rx` | 바람의 인도 | passive | 1 | p1 | **Swirl carries two auras:** a 확산 spreads the two newest auras instead of one, and radius +3 m. Spread reactions +15% | — |
| `wind.m2a` | 순풍의 길 | modifier (gust) | 1 | gust | Leaves a 10 m tailwind lane for 5 s: +30% move, and your projectiles fired along it gain +20% speed and damage | — |
| `wind.m2b` | 폭풍 강타 | modifier (gust) | 1 | gust | Launches enemies 3 m instead of pushing | — |
| `wind.sup` | 바람의 날개 | support (role: mobility) | 2 | ult | Move +30%, double jump, endless glide, 15 s | → legacy |
| `wind.key` | 깃털의 몸 | keystone | 1 | rx | Triple jump and glide never drains stamina, but max HP −15% | — |
| `wind.p2` | 공중전 | passive ×2 | 1/rank | rx | +12% damage per rank to airborne enemies, and while you are airborne or gliding | — |
| `wind.cap` | 실피아의 각성 | capstone | 2 | ult | X **천공의 폭풍 · 각성**. R **천공의 눈**. Aura **순풍의 가호**: sprint is free out of combat, dash cooldown −25% | → legacy |

### 6.8 대지 (earth) — 테라곤의 반석 · 검사 (주), 성기사, 정령술사, 암살자 (부)

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `earth.attune` | 대지 각인 | active (`earth.basic`, `earth.charged`) | 1 | — | LMB **바위 탄환**. RMB **대지 창** | → legacy · melee 대지 검술 / 대지 가르기 |
| `earth.spikes` | 암석 가시 | active | 1 | — | A line of 6 spikes over 12 m: knock-up 1.5 m, 25 dmg each; leaves a **rubble** surface 6 s. mp 16, cd 8 | melee: blade drag along the ground |
| `earth.p1` | 단단한 피부 | passive ×3 | 1/rank | — | Damage taken −3% and poise damage +10% per rank | — |
| `earth.wall` | 대지의 벽 | active | 1 | attune | Wall 6 × 3 m for 8 s (temporary collider). It blocks projectiles, and enemies that run into it stagger. mp 18, cd 12 | — |
| `earth.boulder` | 굴러가는 바위 | active | 1 | attune | A boulder rolls 20 m: 45 dmg, knockdown, shatters frozen. mp 16, cd 9 | caster: summoned. melee: kicked or hammer-batted |
| `earth.m1a` | 삼갈래 분출 | modifier (spikes) | 1 | spikes | Spikes in a 3-way fan | — |
| `earth.m1b` | 가시 감옥 | modifier (spikes) | 1 | spikes | Spikes form a ring r 4 at the target point instead, rooting for 1.2 s | — |
| `earth.ult` | 대지진 | ultimate | 2 | wall or boulder | 3 expanding shockwaves (r 6 / 10 / 14): 42 dmg each, launch 7, stunned 1 s, encrusted. mp 45, cd 15 | → legacy · melee 대지의 심판 |
| `earth.rx` | 지각 변동 | passive | 1 | p1 | **Every earth reaction drops a crystal shard** of the consumed aura's element (4 s cooldown; the crystal pool max still applies). Crystal shields +50% | — |
| `earth.m2a` | 반사 벽 | modifier (wall) | 1 | wall | The wall reflects projectiles | — |
| `earth.m2b` | 붕괴 벽 | modifier (wall) | 1 | wall | The wall collapses forward when it ends: 60 dmg cone | — |
| `earth.sup` | 도발의 석상 | support (role: taunt) | 2 | ult | Raises a stone totem (HP 40% of your max) for 10 s. It taunts enemies within 10 m (`enemies.setTauntTarget`), and its collider blocks projectiles. When it is destroyed it erupts for 60 dmg r 4 and encrusted. mp 24, cd 24 | totem built from the earth wall mesh |
| `earth.key` | 거신의 무게 | keystone | 1 | rx | +30% earth damage and +50% poise damage, but dash distance −40% and you **can't glide** | — |
| `earth.p2` | 반격의 바위 | passive ×2 | 1/rank | rx | A perfect block or parry erupts spikes around you: 30 dmg per rank, r 3 | — |
| `earth.cap` | 테라곤의 각성 | capstone | 2 | ult | X **대륙 붕괴 · 각성**. R **거신 소환**. Aura **돌의 심장**: below 40% HP, −25% damage taken | → legacy |

### 6.9 물 (water) — 운디나의 물결 · 정령술사 (주), 마법사, 성기사, 암살자 (부)  [NEW]

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `water.attune` | 물 각인 | active (`water.basic`, `water.charged`) | 1 | — | LMB **물방울 탄**: 3 bouncing bubbles, 9 dmg each, wet (mp 4, cd 0.35). RMB **해일**: charge 1.0 s, forward wave 10 m × 5 m, 30–70 dmg, knockback, wet, leaves **puddles** (water zone r 3) (mp 16) | caster: bubbles from staff or totem; ranger: water arrows that burst into bubbles. melee **물결 검술**: a flowing combo whose 4th hit splashes wet r 3; charged **수류 일섬**: 8 m water-whip lash |
| `water.whirl` | 물살 감옥 | active | 1 | — | Whirlpool r 5 for 4 s: pull, 6 dmg / 0.5 s, wet; leaves a puddle. On a real water body, radius ×1.5. mp 14, cd 10 | — |
| `water.p1` | 흐르는 생명 | passive ×3 | 1/rank | — | HP regen delay −0.6 s and regen rate +10% per rank | — |
| `water.spring` | 치유의 샘 | active | 1 | attune | Spring zone r 4 for 8 s: heals **5% maxHp/s** (on top of regen, inside the §7 boss cap), cleanses burning, corroded and blight on entry; enemies inside become wet. mp 22, cd 18 | caster: staff plant. melee: weapon plant |
| `water.bubble` | 거품 감옥 | active | 1 | attune | Traps a target in a floating bubble 2.5 s (airborne; boss: wet + 20 break); it pops for 30 dmg r 3 wet. mp 16, cd 12 | — |
| `water.m1a` | 깊은 물 | modifier (whirl) | 1 | whirl | Lasts +3 s, then bursts for 50 | — |
| `water.m1b` | 물기둥 | modifier (whirl) | 1 | whirl | Becomes a spout that lifts enemies 2 m (airborne, so skyslam setup) | — |
| `water.ult` | 대홍수 | ultimate | 2 | spring or bubble | Floods r 14 for 10 s with shallow water: everyone inside is wet constantly; lightning and ice reactions +40%; 3 waves × 40 dmg. mp 45, cd 16 | — |
| `water.rx` | 수맥 | passive | 1 | p1 | **Wet spreads:** applying wet also wets the nearest other enemy within 4 m (once per application, no chain). Wet +3 s. Water reactions +15% | — |
| `water.m2a` | 생명의 물결 | modifier (spring) | 1 | spring | The spring follows you | — |
| `water.m2b` | 성난 샘 | modifier (spring) | 1 | spring | The spring also damages enemies 8 / 0.5 s | — |
| `water.sup` | 정화의 비 | support (role: cleanse) | 2 | ult | A rain cloud follows you for 8 s. It cleanses burning, corroded, blight and muddy every 1 s; gives **blight immunity**; heals 2% maxHp/s (counted in the §7 cap); and keeps nearby enemies wet. mp 22, cd 24 | reuses the lightning storm-cloud zone in rain-only mode |
| `water.key` | 조수의 맹세 | keystone | 1 | rx | Healing received +50%, and regen never pauses while you stand in water or a puddle, but your fire damage −30% | — |
| `water.p2` | 물방울 정령 | passive ×2 | 1/rank | rx | Every 4th hit spawns an orbiting droplet (max 3). Touching it heals 2% per rank | — |
| `water.cap` | 운디나의 각성 | capstone | 2 | ult | X **대해일 · 각성**: 3 tsunami waves × 90, puddles stay 30 s. R finisher **심해의 노래**: a water leviathan bursts from the ground, cinematic. Aura **물의 가호**: while wet, −15% damage taken and immune to your own electrocute | new |

### 6.10 자연 (nature) — 실바니아의 숲 · 정령술사 (주), 암살자 (주), 궁수, 성기사 (부)  [NEW]

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `nature.attune` | 자연 각인 | active (`nature.basic`, `nature.charged`) | 1 | — | LMB **가시 사격**: 3-thorn spread, 7 each, seeded +1 (mp 4, cd 0.35). RMB **씨앗 폭탄**: charge 0.9 s, a lobbed pod that roots r 4 for 1 s and **plants 2 seed pods** (mp 16) | melee **덩굴 검술**: the 4th hit (6th for daggers) is a vine lash that pulls a target 4 m. Charged **가시 돌진**: a dash that seeds every enemy it passes |
| `nature.roots` | 덩굴 속박 | active | 1 | — | Ground AoE r 4: rooted 2 s (boss: +30 break), seeded +2. mp 14, cd 10 | — |
| `nature.p1` | 숲의 숨결 | passive ×3 | 1/rank | — | Seeded DoT +15% per rank; pod heal +1% per rank | — |
| `nature.spore` | 포자 구름 | active | 1 | attune | Cloud r 5 for 6 s: 4 dmg / 0.5 s, seeded +1/s. **Flammable**: fire ignites it into a 60 dmg wildfire burst | — |
| `nature.treant` | 나무정령 소환 | active | 1 | attune | A treant ally for 15 s (HP 30% of your max) that taunts and slams for 25 dmg / 1.5 s; max 1. mp 26, cd 25 | instanced low-poly treant |
| `nature.m1a` | 가시 덩굴 | modifier (roots) | 1 | roots | Rooted enemies take 6 / 0.5 s | — |
| `nature.m1b` | 덩굴 길 | modifier (roots) | 1 | roots | Leaves an **overgrowth** surface r 5 for 10 s: enemies −40% move; you get +15% move | — |
| `nature.ult` | 세계수의 분노 | ultimate | 2 | spore or treant | Giant roots erupt in a ring out to 12 m in sequence: 6 × 50 dmg, root 2 s, seeds everything they hit. mp 45, cd 15 | — |
| `nature.rx` | 공생 | passive | 1 | p1 | **Pods re-seed:** a pod that pops or bursts leaves 1 mini pod (50% values, which can't re-seed again). Pod cap +4 (inside the 16 pool). Seed reactions +15% | — |
| `nature.m2a` | 독성 포자 | modifier (spore) | 1 | spore | The cloud seeds twice as fast | — |
| `nature.m2b` | 치유 포자 | modifier (spore) | 1 | spore | The cloud heals you 2%/s while you stand in it | — |
| `nature.sup` | 생명의 꽃 | support (role: burst heal) | 2 | ult | Lifebloom on you: 15% heal over 6 s, then a bloom that heals 10% and deals 40 dmg r 4. mp 20, cd 20 | — |
| `nature.key` | 야생의 맹약 | keystone | 1 | rx | Nature damage +35% and seeded max stacks 8, but healing from non-nature sources −50% | — |
| `nature.p2` | 역병 개화 | passive ×2 | 1/rank | rx | Enemies that die while seeded spread 2 (rank 1) or 3 (rank 2) stacks to enemies within 6 m | — |
| `nature.cap` | 실바니아의 각성 | capstone | 2 | ult | X **세계수 강림 · 각성**: a giant sapling erupts and makes a 12 s zone r 10 (roots, seeds, heals you 2%/s). R finisher **영원의 숲**, cinematic. Aura **숲의 가호**: standing on grass or overgrowth, regen delay −2 s | new |

### 6.11 빛 (light) — 루미엘의 광휘 · 궁수 (주), 성기사 (주), 정령술사, 검사 (부)  [NEW]

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `light.attune` | 빛 각인 | active (`light.basic`, `light.charged`) | 1 | — | LMB **광휘탄**: a fast piercing lance, 16 dmg, radiant +1 (mp 4, cd 0.3). RMB **심판의 기둥**: charge 1.0 s, a pillar at the aim point r 3, 40–80 dmg, dazzled 2 s, radiant +2 (mp 18) | ranger: light arrows (BotW light-arrow fantasy). melee **성광 검술**: the last hit releases radial rays r 3; charged **광휘 내려치기**: an overhead smash that drops a pillar |
| `light.flash` | 섬광 | active | 1 | — | Flash r 6: dazzled 3 s, 18 dmg. mp 12, cd 10 | — |
| `light.p1` | 은총 | passive ×3 | 1/rank | — | Parry or perfect block heals 3% per rank and adds +1 radiant to the attacker | — |
| `light.sanctuary` | 성역 | active | 1 | attune | A blessed circle r 5 for 8 s: your regen delay is −50% and you heal 2% maxHp/s (the §7 cap applies); enemies take 6 / 0.5 s and get radiant +1/s; corroded and blight are dispelled. mp 22, cd 20 | — |
| `light.aegis` | 수호의 방패 | active | 1 | attune | A dome r 3 for 4 s that blocks projectiles, plus a 25% maxHp shield. mp 18, cd 16 | — |
| `light.m1a` | 연쇄 섬광 | modifier (flash) | 1 | flash | Repeats after 1 s at 60% | — |
| `light.m1b` | 실명 | modifier (flash) | 1 | flash | Dazzled lasts 5 s and adds radiant +2 | — |
| `light.ult` | 새벽의 심판 | ultimate | 2 | sanctuary or aegis | A huge prism beam: 30 m long for 2.5 s, sweepable by aim, 18 dmg / 0.1 s; instantly triggers judgment on 5-stack targets. Refracts through ice and crystals. mp 50, cd 16 | — |
| `light.rx` | 찬란한 지혜 | passive | 1 | p1 | **Refraction:** light projectiles refract through ice pillars, crystals and frozen enemies (prism relay, ≤ 3 segments), and 심판 splashes 50% to enemies within 5 m. Light reactions +15% | — |
| `light.m2a` | 이동 성역 | modifier (sanctuary) | 1 | sanctuary | The sanctuary follows you at r 4 | — |
| `light.m2b` | 심판의 성역 | modifier (sanctuary) | 1 | sanctuary | When it ends, every enemy inside with ≥ 3 radiant takes judgment | — |
| `light.sup` | 축복 | support (role: damage aura) | 2 | ult | Aura for 12 s: +15% damage, +15% regen rate, +10% crit. mp 24, cd 24 | — |
| `light.key` | 순교자의 빛 | keystone | 1 | rx | Light damage +40%, but max MP/stamina −25% | — |
| `light.p2` | 낙인 | passive ×2 | 1/rank | rx | Judgment threshold: rank 1 → 4, rank 2 → 3. It does not stack with the mastery milestone (take the lowest; floor 3). At rank 2, **any** light hit can trigger judgment. The judgment cooldowns (§4.3 D) still apply | — |
| `light.cap` | 루미엘의 각성 | capstone | 2 | ult | X **아스트라의 빛 · 각성**: a three-beam gigaflare. R finisher **여명의 날개**: a six-winged descent, cinematic. Aura **여명**: once per 120 s, lethal damage leaves you at 1 HP plus 3 s invulnerability | new |

### 6.12 그림자 (shadow) — 녹스의 장막 · 암살자 (주), 마법사, 성기사, 정령술사 (부)  [NEW]

| id | 이름 | 유형 | 비용 | 선행 | 효과 | caster / melee |
|---|---|---|---|---|---|---|
| `shadow.attune` | 그림자 각인 | active (`shadow.basic`, `shadow.charged`) | 1 | — | LMB **그림자 화살**: a slow, slightly homing heavy bolt, 22 dmg, corroded +1 (mp 5, cd 0.45). RMB **영혼 흡수**: a tether channel up to 2 s on the target, 12 dmg / 0.2 s, heals you 30% of the damage (mp 6/s) | melee **그림자 검술**: daggers flicker with a shadow trail; marks +1 extra. Charged **그림자 일격**: dash-through 9 m, then reappear behind the target |
| `shadow.step` | 그림자 걸음 | active | 1 | — | Blink behind a target within 14 m; your next hit within 1.5 s is a crit (×1.5 more); 0.3 s i-frames. mp 10, cd 8 | — |
| `shadow.p1` | 어둠의 갈증 | passive ×3 | 1/rank | — | Lifesteal 2% of shadow damage per rank | — |
| `shadow.hex` | 그림자 낙인 | active | 1 | attune | Hex every enemy within r 4 of the aim point for 10 s: +20% damage taken, corroded +2. mp 14, cd 12 | — |
| `shadow.reap` | 영혼 수확 | active | 1 | attune | Scythe arc 5 m / 140°: 40 dmg; executes non-boss enemies below 15% HP (bosses take +50% below 15%). mp 16, cd 10 | caster: a spectral scythe swung by the staff. melee: cross-slash |
| `shadow.m1a` | 그림자 분신 | modifier (step) | 1 | step | Leaves a shade that copies your next 3 attacks at 40% | — |
| `shadow.m1b` | 그림자 매듭 | modifier (step) | 1 | step | Leaves a return knot: recast within 3 s to snap back to where you started (0.2 s i-frames) | — |
| `shadow.ult` | 어둠의 심연 | ultimate | 2 | hex or reap | A black hole r 8 pulls for 3 s, then implodes for 150 dmg and corroded +5. mp 45, cd 15 | — |
| `shadow.rx` | 침식의 지식 | passive | 1 | p1 | **Corrosion doesn't fade in curses:** corroded stacks don't expire while the target stands in cursed mist or necroflame. Corroded max 5 → 7. Curse reactions +15% | — |
| `shadow.m2a` | 전염 저주 | modifier (hex) | 1 | hex | When a hexed target dies, the hex jumps to the nearest enemy | — |
| `shadow.m2b` | 흡혼 저주 | modifier (hex) | 1 | hex | Hitting a hexed enemy heals you 2% (0.5 s internal cooldown) | — |
| `shadow.sup` | 그림자 장막 | support (role: stealth) | 2 | ult | Stealth for 6 s: enemies lose track of you. Your first attack out of stealth does +50% and crits. mp 22, cd 22 | — |
| `shadow.key` | 그늘의 계약 | keystone | 1 | rx | Shadow damage +45%, but **HP regen is disabled** (lifesteal only) | — |
| `shadow.p2` | 잔향 | passive ×2 | 1/rank | rx | Shadow hits store 10% of their damage per rank and replay it after 3 s (an echo) | — |
| `shadow.cap` | 녹스의 각성 | capstone | 2 | ult | X **영겁의 밤 · 각성**: 3 black holes in sequence. R finisher **까마귀 군주**: a raven-winged knight descends, cinematic. Aura **그림자 망토**: a perfect dodge gives 1.5 s stealth, and your next hit crits | new |

### 6.13 v3.1 added nodes: utility `u`, signature `sig`, T4 active `t4`, modifier pair `m3`

Every tree gains a T2 **utility active** (`u`, it does something to the world), a primary-only **T4 active** (`t4`, 2 points) with an exclusive
modifier pair (`m3a | m3b`). The 4 new elements also gain a T3 **signature active** (`sig`). The Twist column refers to §13.1.

| id | 이름 | 유형 | 비용 | 선행 | 효과 | Twist | caster / melee |
|---|---|---|---|---|---|---|---|
| `fire.ember` | 불씨 투척 | active (u) | 1 | 각인 | Lob an ember up to 20 m: **ignites grass, overgrowth, rot walls, braziers and barrels** at the landing point r 3; 20 dmg + burning 2. mp 6, cd 5 | puzzle igniter at range | caster: flicked ember. melee: blade-flick spark |
| `fire.phoenix` | 불새 돌진 | active (t4) | 2 | ult | Dash 14 m as a firebird: 60 dmg along the path + burning, 0.4 s i-frames; the path ignites grass and **melts ice sheets into puddles**. mp 24, cd 14 | path melts ice → water for electrocute | caster: robe bursts into wings. melee: flaming lunge (`TPL.iaido`) |
| `fire.m3a` | 재의 날개 | modifier (phoenix) | 1 | phoenix | It ends in an explosion: 70 dmg r 4 | — | — |
| `fire.m3b` | 귀환의 불꽃 | modifier (phoenix) | 1 | phoenix | Recast within 3 s to fly back along the path (second pass 40 dmg) | — | — |
| `ice.slide` | 빙판길 | active (u) | 1 | 각인 | Freeze a 12 m lane for 8 s. You skate at +40% move; enemies slip (chilled +1/s). **Over water, it is a walkable ice road** | water → road | caster: staff sweep. melee: blade drag |
| `ice.glacier` | 빙하 낙하 | active (t4) | 2 | ult | A glacier block drops at the aim point r 4: 110 dmg, frozen 2 s. The block stays 8 s as a **climbable platform** (2.5 m) | climbable block | caster: sky sigil. melee: leap + downward plunge |
| `ice.m3a` | 산산조각 | modifier (glacier) | 1 | glacier | When it expires, the block shatters into 8 shards × 20 dmg | — | — |
| `ice.m3b` | 영구 빙괴 | modifier (glacier) | 1 | glacier | The block lasts 16 s and chills enemies within r 5 +1/s | — | — |
| `lightning.rod` | 피뢰침 | active (u) | 1 | 각인 | Plant a rod for 12 s. Your lightning chains route through it (+1 chain), and **puddles within 6 m stay charged**. Enemy lightning bolts strike the rod first | charged puddles; the finale's rods echo it | caster: thrown spike. melee: stabbed in |
| `lightning.thunderclap` | 뇌신 강림 | active (t4) | 2 | ult | Leap up and crash down at the aim point (≤ 10 m): r 5, 90 dmg, shocked, stun 1 s. **Electrifies all water within r 8** | water network | caster: ride a bolt down. melee: overhead crash |
| `lightning.m3a` | 연쇄 낙뢰 | modifier (thunderclap) | 1 | thunderclap | 3 follow-up bolts × 30 on the nearest enemies | — | — |
| `lightning.m3b` | 정전기 장 | modifier (thunderclap) | 1 | thunderclap | Leaves a static field r 5 for 5 s: micro-stun every 1 s | — | — |
| `wind.updraft` | 바람 기둥 | active (u) | 1 | 각인 | An updraft column r 2.5, 18 m tall, for 6 s at the aim point (`world.addUpdraft`). It lifts enemies inside 2 m (airborne). **Glide anywhere** | portable updraft | caster: palm upward. melee: rising spin |
| `wind.skyfall` | 천공 낙하 | active (t4) | 2 | ult | Launch 8 m up, then slam down with a wind blade: r 5, 80 dmg, launches enemies 3 m (a skyslam setup) | sets up the airborne reactions | caster: twirling descent. melee: plunging slash |
| `wind.m3a` | 회오리 착지 | modifier (skyfall) | 1 | skyfall | The landing leaves a tornado zone for 3 s (fusions apply) | — | — |
| `wind.m3b` | 깃털 착지 | modifier (skyfall) | 1 | skyfall | Refunds 40 stamina, and you may glide straight out of the slam | — | — |
| `earth.steps` | 돌계단 | active (u) | 1 | 각인 | Raise 3 stepping pillars (2 / 4 / 6 m) in a line for 10 s: **a climb route** (world platforms) that also blocks projectiles | build terrain | caster: staff lift. melee: stomp |
| `earth.colossus` | 거신의 주먹 | active (t4) | 2 | ult | A giant stone fist bursts from the ground at the aim point: 120 dmg r 3.5, +60 break, knockdown, encrusted; shatters frozen; **smashes rot walls** | breaks blockers | caster: summoned fist. melee: the hammer/blade drives the fist up |
| `earth.m3a` | 연타 | modifier (colossus) | 1 | colossus | A second fist 0.6 s later at 60% | — | — |
| `earth.m3b` | 지진 균열 | modifier (colossus) | 1 | colossus | Leaves a 12 m fissure of rubble surface (slow; feeds sandstorm) | — | — |
| `water.surf` | 물살 타기 | active (u) | 1 | 각인 | Ride a wave 12 m forward: enemies are knocked aside for 20 dmg + wet, puddles form along the path, and you **cross deep water** for up to 2 s | traversal over water | caster: totem/staff surf. melee: weapon-ride |
| `water.clone` | 신기루 분신 | active (sig) | 1 | spring or bubble | A water clone for 8 s **taunts** (`enemies.setTauntTarget`). Enemies that hit it become wet. When it expires or breaks, it bursts for 60 dmg r 4 + wet. mp 20, cd 20 | taunt decoy that stands in puddles | `player.spawnGhost` with a water fresnel |
| `water.whip` | 물의 채찍 | active (t4) | 2 | ult | A 12 m water-whip channel for 1.5 s: 4 lashes × 30, wet; the last lash pulls its target to you; **extinguishes burning ground** along the path | firefighting | caster: whip from the staff/totem tip. melee: weapon-whip (`TPL.reverseSlash`) |
| `water.m3a` | 물의 올가미 | modifier (whip) | 1 | whip | Every lashed enemy is pulled, not just the last one | — | — |
| `water.m3b` | 얼음 채찍 | modifier (whip) | 1 | whip | Chilled +2 per lash; the 4th lash freezes wet targets | — | — |
| `nature.grapple` | 덩굴 끌어당기기 | active (u) | 1 | 각인 | Shoot a vine up to 16 m: it **pulls you to trees, pillars, mushroom caps and island rocks**, or pulls a small enemy to you. mp 8, cd 6 | grapple traversal | caster: vine from the totem. melee: vine whip |
| `nature.podseed` | 씨앗 파종 | active (sig) | 1 | spore or treant | Plant 3 seed pods in a triangle at the aim point (pod pool). This makes a **reaction hub for every element**. mp 12, cd 10 | the pod hub, on demand | caster: scatter. melee: a stab that sprouts pods |
| `nature.thorngrove` | 가시 숲 | active (t4) | 2 | ult | A thorn grove r 6 for 8 s: thorn walls (temporary colliders) around enemies, 10 dmg / 0.5 s, seeded +1/s. **Fire turns the grove into a wildfire** for 150 r 6 | flammable fortress | caster: the totem plants it. melee: weapon plant |
| `nature.m3a` | 독가시 | modifier (thorngrove) | 1 | thorngrove | Seeded +2/s, and the DoT is +30% | — | — |
| `nature.m3b` | 꽃의 감옥 | modifier (thorngrove) | 1 | thorngrove | When it ends, the grove blooms: heals you 10% and leaves 2 pods | — | — |
| `light.beacon` | 빛의 표지 | active (u) | 1 | 각인 | A light beacon for 12 s: it **reveals stealthed and void enemies within 12 m, purifies blight r 4**, and is a prism relay point. mp 8, cd 12 | purify + light puzzles | caster: planted lantern. melee: weapon plant |
| `light.mirror` | 빛의 거울 | active (sig) | 1 | sanctuary or aegis | A floating mirror for 8 s that **reflects the next 3 enemy projectiles** and relays your beams (prism). mp 14, cd 14 | mirror puzzle doors (거울의 정원) | a hovering mirror shard |
| `light.spear` | 천사의 창 | active (t4) | 2 | ult | Throw a giant light spear: pierces 30 m, 90 dmg, radiant +3. Where it lands it stands as a 6 s **light pillar**: a relay point plus blessed ground r 3. mp 26, cd 14 | relay pillar | caster: conjured spear. melee: a thrown hammer/blade of light that returns |
| `light.m3a` | 성흔의 창 | modifier (spear) | 1 | spear | Radiant +5 on the first target hit (the judgment cooldowns apply) | — | — |
| `light.m3b` | 세 갈래 창 | modifier (spear) | 1 | spear | It splits into 3 spears at 50% each | — | — |
| `shadow.shade` | 그림자 숨기 | active (u) | 1 | 각인 | Melt into your shadow for 3 s: untargetable, +30% move, and **cursed mist and blight have no effect**. You pass under enemies | hazard walking | dissolve into a ground shadow decal |
| `shadow.raven` | 까마귀 떼 | active (sig) | 1 | hex or reap | A raven swarm flies 18 m in a cone: 8 × 10 dmg, corroded +1. Enemies hit lose track of you (sight ×0.3 for 3 s). Ravens flying through cursed mist **carry it along their path** | spreads curse surfaces | ravens burst from the cape |
| `shadow.chains` | 그림자 사슬 | active (t4) | 2 | ult | Chain up to 4 enemies within 10 m for 3 s (rooted; boss: +30 break), corroded +2 | group control | caster: chains from the ground. melee: chains from the daggers/blade |
| `shadow.m3a` | 끌어모으기 | modifier (chains) | 1 | chains | When it ends, the chained enemies are yanked together: 60 dmg | — | — |
| `shadow.m3b` | 생명 사슬 | modifier (chains) | 1 | chains | Each chained enemy heals you 2%/s (inside the §7 cap) | — | — |

**Totals (honest count):**
- Nodes: 5 classic × 19 + 4 new × 20 = **175**.
- **49 distinct quick-slot actives**: 5 per classic tree (a2, a3, a4, u, t4) and 6 per new tree (+ sig). There are also **9 ultimates** and **9 supports**.
- The **variants** are counted separately, not as skills: 9 basic + 9 charged (granted by 각인), and 9 awakened ultimates + 9 finishers (granted by the capstone).
- Castable definitions in data: 5 × 11 + 4 × 12 = **103** (legacy-backed: 30; new: 73).
- Modifiers: 54 (27 exclusive pairs, no modifier repeated across trees). Keystones: 9. Each `rx` node has a unique rule.

### 6.14 Implementation strategy (so 73 new skills stay cheap)
New skills are **data over shared archetypes**:

| Archetype | Example |
|---|---|
| projectile | 그림자 화살, 천사의 창 |
| dash | 불새 돌진, 물살 타기 |
| leapslam | 뇌신 강림, 천공 낙하 |
| grapple | 덩굴 끌어당기기 |
| volley | 가시 사격 |
| lob | 씨앗 폭탄 |
| beam | 새벽의 심판 |
| cone | 반발 돌풍 |
| nova | 서리 폭발 |
| zone | 치유의 샘 |
| wall | 대지의 벽, 가시 숲 |
| pillar | 빙주, 빙하 낙하, 돌계단, 거신의 주먹 |
| chain | 흑뢰 |
| rain | 대홍수 waves |
| summon | 나무정령, 도발의 석상, 신기루 분신, 빛의 거울, 피뢰침 |
| blink | 그림자 걸음 |
| buff | 축복 |
| mark | 그림자 낙인 |
| chainbind | 그림자 사슬 |
| tether | 영혼 흡수, 물의 채찍 |
| lane | 빙판길, 순풍의 길 |

- Each archetype implements both the **caster** presentation (spells runtime) and the **melee** presentation (sword action engine, with an action template and a hit shape).
- Bespoke code is allowed only for ultimates, capstones and finishers.
- Legacy skills keep their existing code through adapters. See CONTRACT §7.

---

## 7. HP regen (체력 자동 회복)

| Parameter | Value |
|---|---|
| Delay after the last damage **actually taken** (net HP loss > 0) | **5.0 s** in combat |
| Delay out of combat | **3.0 s** |
| Rate in combat | **1.5% maxHp/s** (full HP in ≈ 67 s) |
| Rate out of combat | **8% maxHp/s** |
| Boss fight (a boss with `isBoss` is alive and within 75 m) | rate ×0.6 (0.9%/s) |
| Ramp | the rate eases in over the first 1.0 s (smoothstep) so it never jumps |
| What resets the timer | any **net HP loss**, **including DoT ticks** (burning from grass fire counts) and the 1-damage minimum on partially blocked hits |
| What does *not* reset it | fully blocked hits, parries, i-frame dodges, shield-absorbed damage, refunded damage (anything where HP did not drop) |
| Disabled while | dead/dying, `blight` status, keystone `shadow.key` |
| Blessed zones (`light.sanctuary`, `holywater`, paladin seal, 축복의 땅 surface) | delay **−50%** and regen rate **+1% maxHp/s**. They no longer skip the delay |
| Heal-over-time cap | in boss fights, the total of regen plus every heal-over-time source (springs, seals, lifebloom, chains, rain) is capped at **5% maxHp/s**. Burst heals (pickups, judgment heals, 정화) are not capped |
| Modifiers | `stats.regenDelayAdd` (seconds, can be negative; floor 1.0 s), `stats.regenRateMul` |

**Rule (evaluated every frame):** `delay = inCombat(now) ? 5.0 : 3.0` (+ modifiers). Regen runs while
`now − lastHurtT ≥ delay`. Because the rule is re-evaluated every frame, a delay that started in combat shortens as
soon as you leave combat.

**Out-of-combat definition:** no damage *taken* in the last 3 s **and** no enemy with an aggro/alert state within 30 m. Dealing
damage does not keep you in combat, so hitting a dummy never blocks regen.

Healer niche check:
- Water's spring (5%/s + cleanse), nature's lifebloom and light's sanctuary all heal **above** in-combat regen (1.5%/s).
- The boss-fight heal cap (5%/s) prevents a paladin from stacking a seal, a sanctuary and regen into immortality.

**UI:**
- Under the HP bar there is a 2 px **countdown strip** that fills left to right during the delay (scaleX only).
- While regenerating, the HP fill gets a soft green-gold **shimmer** (CSS class `.regen`, a moving gradient), and small
  rising "+" motes appear on the bar every 0.5 s.
- At the player's feet, faint green motes appear (2 particles / 0.3 s, pooled) during regen.
- The first time regen starts in the game, a toast says: "피해를 받지 않으면 체력이 자동으로 회복됩니다".

**Audio:** a soft rising chime when regen starts (`regen_start`, −18 dB), a gentle pad swell while healing, and stop on hit.

**Events:** `hpRegenStart {rate}`, `hpRegenStop {reason:'hurt'|'full'|'blocked'}`.

---

## 8. Story extension (이야기 확장)

### 8.1 What the golem reveals (one consistent lore chain)

**What the village believes (existing script).** 아스트라 gave birth to five spirits, and they keep 에테리아 in balance. The
mist that comes from the northern ruin is an old curse, and the golem guards it.

**What is true:**
1. Long ago, 아스트라 had **nine** children. The void wyrm **니드호그라** rose from the dark beneath the roots and
   breathed the void into the world. The spirits bound it with **five seals**.
2. The five *original* spirits (이그니스, 글라시아, 볼타, 실피아, 테라곤) each **split off a shard of their own power, their
   서약 (oath)**, and placed it in a seal as its key. 테라곤's oath was the first seal, under the northern ruin. The golem is
   its *jailer*.
3. Four spirits paid more. 녹스 tried to hold the wyrm alone, was corrupted, and fell. The people were terrified that a spirit
   could turn, so they **erased the four "lost children"** (운디나, 실바니아, 녹스, 루미엘) from their stories. That is why
   the elder only knows five.
4. Over a thousand years, the wyrm has gnawed the World Tree's roots. Through the **root channels**, it has pulled the five
   oath shards into its own body. **The northern ruin's mist is its breath**, flowing up those channels.

**The reveal (cinematic `reveal`):**
- When 고대 바위 골렘 falls, its core cracks open, and inside is a **sealing rune**.
- 테라곤's memory speaks: "봉인은 하나가 아니었다. 다섯 개의 서약이 공허를 묶었고, 나는 그중 하나였다. 그런데 그 서약들이… 놈에게 먹히고 있다."
- The camera follows violet mist from the ruin, **down a glowing root channel**, to the NE and the 세계수 뿌리 고원. There, a
  colossal serpent is coiled around the roots, and the tree's crown far above is turning grey.
- In the village, 이솔데 (the sage) reveals the erased four. The elder's line: "다섯이라 배웠지만… 사실은 아홉이었구나."

**What it means for play:**
- The wyrm's spine carries the 5 stolen **oath shards**. Breaking them in phase 2 is literally taking the oaths back.
- 루미엘 is the World Tree's **light**. Kalis keeps her imprisoned in a mirror. The 아스트라의 핵 (heart crystal) is the tree's **body**, trapped in the wyrm's chest.
- Freeing 루미엘 gives you the spear that reaches the heart. Freeing the heart ends the game.
- The four lost spirits must be freed to open their capstones (§5.4). The mentors' 정령의 파편 are the fragments the erased spirits left with their old orders.

### 8.2 World layout (compact; reuse existing pockets; all arenas on real terrain)

The coordinates are world metres (+Z is south). The village is at (0, 137), the golem arena at (0, −125) r 24, and the
World Tree (scenery, outside the playable terrain) at (215, −215). The terrain grid covers ±172 m and is not resized.

```
                     N (−Z)
                ⑥ 세계수 뿌리 고원 (108,−132) r34, top y≈+38 ── final boss (on terrain)
          ⑤ 거울의 정원 ledge (60,−150) r18, top y≈+24 ── Kalis (on terrain)
          ④ the ascent: updraft columns + root ramps from the golem arena → ledge → plateau;
             floating islands I1–I5 overhead are **glide scenery** (no gameplay on them)
  ② 안개호수 미르웬            ③ 봉인의 유적 (0,−125)          ③ 잿빛 수림 엘더우드
     centre (−80,−72) r34         golem arena r24                centre (82,−62) r32
     hydra arena (−82,−80) r20                                   treant hollow (92,−80) r22
     운디나 shrine island (−96,−88)                               녹스 shrine (64,−48)
                                                                 실바니아 grove (100,−66)
        camp0 (−80,20)        camp2 (10,−55)        camp1 (85,−5)
                          lake (38,38)
                        바람결 마을 (0,137)  ← 정령의 문 hub (−6,126)
                             S (+Z)
```

**Why it is on terrain:** every system (zones, decals, crawlers, puddles, mines, pods, enemies, loot, aim raycasts)
uses the terrain height. Fighting on real terrain means none of them needs a special case.

**② 안개호수 미르웬 (Mirwen, NW pocket):**
- Terraform an ellipse at (−80, −72), rx 30 × rz 24, to below `WATER_LEVEL` (−2.5 m). It lies inside the existing `WATER_BOX`, so the water plane already covers it.
- The mesa at (−96, −70) becomes a waterfall cliff on the west edge (it reuses the river-head waterfall look).
- About 8 lily-pad and ruin islands (r 3–6), half-sunk arches, and twilight fog (grade `dusk`, 40% blend inside the zone).
- **Traversal:** freeze water (existing `freezeWater`, or `ice.slide`) to make bridges between islands. Water players can `water.surf` across.
- **Encounters:** 물 말랑이, 수렁도마뱀 ×6. Hydra arena: the open lake (−82, −80) r 20, with 6 ruin pillars at r 14.
- **Shrine:** 운디나's shrine is on the island (−96, −88).

**③ 잿빛 수림 엘더우드 (Elderwood, NE pocket):**
- Giant mushrooms (instanced, 3 sizes), big root arches, bioluminescent flora (emissive vertex colour, no lights), and void-rot vines (purple).
- The mesa at (108, −92) becomes the treant's hollow cliff. Grass fuel is on, so the forest burns.
- **Rot vines** block 3 paths. They are burned with fire, purified with light, or smashed (`earth.colossus`).
- **Shrines:** 녹스's shadow shrine is a dark glade at (64, −48). 실바니아's grove is at (100, −66).
- **Encounters:** 포자 버섯병 ×6, 타락 늑대 ×5, 공허 망령 ×3.

**Acts 2 and 3 are non-linear:** after the reveal, both Mirwen and Elderwood gates open, and the player picks the order.

**④⑤⑥ The ascent and the root plateau (Act 4 + finale):**
- **세계수 뿌리 고원 (Root Plateau):** a terraformed mesa at (108, −132), r 34, top ≈ +38 m above its surroundings. Five
  giant **root pillars** (terrain spires, h +12 m, r 3) stand on it at r 22. It has cliff sides, vertex-coloured bark-and-moss,
  root arches, and a grey-crowned World Tree silhouette behind it (scenery, far fog).
- **거울의 정원 ledge:** a terraformed ledge at (60, −150), r 18, top ≈ +24 m. It has prism mirrors and crystal pillars.
- **Ascent route:** updraft columns (static) and root ramps run golem arena → ledge → plateau, as a glide-and-climb sequence. The world clamp is extended to include the plateau's AABB.
- **Floating islands I1–I5** are merged scenery above the route, for glide flavour only. They are hidden before Act 4 and never used as platforms.
- No kill plane is needed. A fall lands on terrain below and costs only fall damage.

**Hub travel, 정령의 문:**
- A spirit gate in the village at (−6, 126), with gates at each zone entrance and on the ledge.
- Interacting (F) opens a destination list of the zones you have reached. It is a 1.2 s fade teleport. Gates are also respec points (§5.5).

**정령의 씨앗 shrines (+1 skill point each):**
- 8 hidden glowing seeds, each guarded by a small puzzle or element task:
  - Act 1: the tutorial spire top and behind the windmill.
  - Mirwen: frozen-bridge islet and waterfall cave.
  - Elderwood: burn a rot wall, and the top of a giant mushroom (updraft or grapple).
  - Ascent: a root-pillar top reached by gliding, and a prism-mirror door at 거울의 정원.

### 8.3 New NPCs & spirits

| id | 이름 | 역할 | 위치 |
|---|---|---|---|
| `rangerMentor` | 아리엔 | 궁수 스승 (cheerful, light-hearted) | altar ring |
| `paladinMentor` | 오르벤 | 성기사 스승 (calm, old shield-bearer) | altar ring |
| `spiritMentor` | 세리아 | 정령술사 스승 (dreamy, talks to birds) | altar ring |
| `shadowMentor` | 카이렌 | 암살자 스승 (wry, ex-thief, redeemed) | altar ring |
| `sage` | 이솔데 | 기록관 — lore of the five seals; gives the act quests after the reveal | village library, beside the elder's house |
| `lakeKeeper` | 나엘 | 미르웬 호수지기 (an old fisher spirit-folk) | Mirwen shore (−56, −58) |
| `forestChild` | 모모 | 엘더우드 숲정령 아이 (Korok-like, escort quest) | Elderwood edge (60, −40) |
| spirit `undina` | 운디나 | 물의 정령 — a translucent blue maiden with a fish tail, calm | Mirwen shrine |
| spirit `sylvania` | 실바니아 | 자연의 정령 — an antlered deer wreathed in flowering vines | Elderwood grove |
| spirit `nox` | 녹스 | 그림자의 정령 — a raven-winged shadow knight, sardonic, redeemed | Elderwood glade |
| spirit `lumiel` | 루미엘 | 빛의 정령 — six golden wings, the World Tree's **light** (the heart crystal is its body) | 거울의 정원 (held in Kalis's mirror) |

### 8.4 Quest chain (stage ids, in order)

| # | stage id | 제목 | 요약 | 완료 조건 |
|---|---|---|---|---|
| 1 | `wake` | 깨어난 각인 | existing | talk to the elder |
| 2 | `choose` | **여섯 갈래의 길** | class choice at the altar, 각인 의식 | `classChosen` |
| 3 | `training` | 첫 수련 | the 6 training steps (incl. learn + equip) | all steps |
| 4 | `updraft` | 바람의 깃털 | existing | existing |
| 5 | `camps` | 평원의 그림자 | existing | all 3 camps cleared |
| 6 | `boss` | 봉인의 유적 | golem | `bossDefeated {id:'golem'}` |
| 7 | `reveal` | **갈라진 봉인** | reveal cinematic → talk to 이솔데. The 5 original capstones unlock | talk to the sage |
| 8 | `mirwen` | **물안개 너머** (8–9 and 10–12 may be played in either order) | spirit gate to Mirwen; reach 운디나's shrine over frozen bridges | reach the shrine |
| 9 | `hydra` | **세 개의 머리** | defeat 레비아탄, free 운디나 (water full) | `bossDefeated {id:'hydra'}` |
| 10 | `elderwood` | **잿빛 숲의 속삭임** | burn or purify 3 rot walls, escort 모모 | 3 walls + escort |
| 11 | `nox` | **타락한 정령** | duel 녹스, purify him (shadow full) | `bossDefeated {id:'nox'}` |
| 12 | `treant` | **수호수의 심장** | defeat 모르그로스, free 실바니아 (nature full) | `bossDefeated {id:'treant'}` |
| 13 | `ascent` | **하늘로 가는 뿌리** | 5 ascent steps (updrafts, root ramps, glide) to the 거울의 정원 ledge | reach the ledge |
| 14 | `kalis` | **거울의 사도** | defeat 칼리스, free 루미엘. Grants the finale tool 루미엘의 창 | `bossDefeated {id:'kalis'}` |
| 15 | `final` | **세계수의 새벽** | 니드호그라 on the root plateau, 3 phases | `bossDefeated {id:'nidhoggra', final:true}` |
| 16 | `ending` | — | ending cinematic → `victory` | cinematic end |
| 17 | `done` | 에필로그 | free roam, 정령 시련, NPC epilogue lines | — |

Each act boss gives +1 skill point, its XP, and a full HP/MP restore. The story gate of §5.4 is applied by the same handler
(for example, after hydra: `freeSpirit('water')`; once 2 of the lost three are freed: `lumielFeather`).

### 8.5 Mid-bosses

**Shared boss framework:**
- An HP bar plus a **break gauge** (붕괴 게이지, 0–100, shown under the HP bar). Break damage per hit is `hit.poise` or the default, ×3 on a reaction, and ×1.5 for earth and lightning.
- Phase thresholds with invulnerable transition cinematics (`mode:'gameplay'`).
- A checkpoint at each phase start (dying restarts that phase at 60% boss HP of the phase start).
- `voidShield`: damage ×0.3 while the shield is above 0. Its value depletes ×4 from light, ×2 from reactions, ×1 from other hits, and break empties it.

**삼두 물뱀 레비아탄 (id `hydra`, Act 2 or 3):**
- **Size and health:** 15 m tall, a body in the lake plus 3 heads (2500 HP each, element-tinted water/ice/lightning). Body 4000 HP.
- **Mechanics:**
  - Each head has an **element shield** (ring glyph): it takes ×0.3 except from its counter. The water head is countered by lightning (electrocute) or ice (flashfreeze). The ice head is countered by fire (melt). The lightning head is countered by earth (grounded) or water (electrocute).
  - Freezing the lake (any ice hit on water or `freeze_water`) creates a platform ring for 10 s so melee classes can reach the heads.
  - Severing a head makes the remaining heads swap elements and gain +20% speed.
  - The tidal sweep is telegraphed: dodge, or stand on frozen ice.
- **Teaches:** element shields, freezing water.

**녹스, 타락한 정령 (Act 3 duel):**
- **Size and health:** a human-size raven knight, 4000 HP, `voidShield` 100.
- **Mechanics:**
  - Teleport-slashes are telegraphed with a violet glint, so they can be parried.
  - A shadow clone appears at 50%.
  - At 0 HP he isn't killed. Instead comes the **purify** cinematic, and he joins (shadow unlocked).
- **Teaches:** voidShield (break or light), parry timing.

**모르그로스, 썩은 수호수 (Act 3):**
- **Size and health:** a 20 m walking treant, 9000 HP.
- **Phase 1:** bark armor (resist all ×0.4) is burned off in 4 plates (fire ignite on the plate or a fire skill; non-fire classes use explosive spore pods it drops: hit a pod with anything to ignite it).
- **Phase 2:** it kneels, and the arm-vines become **climbable ramps** (a surface-walk platform on its arm, 6 s) up to the glowing heart (weak point, ×2.5).
- **Phase 3:** a root storm, with seed pods everywhere (reaction playground).
- **Teaches:** climbing a boss, burning armor.

**칼리스, 거울의 사도 (Act 4, on the 거울의 정원 ledge):**
- **Size and health:** human-size, 7000 HP.
- **Mirror:** copies the **player's class kit** (dodge and defend style) and the **2 most-invested elements** (reads `progression`), and casts their attune basics plus one quick skill.
- **Hades-style twist:** at 0 HP he survives once ("거울은 깨지지 않는다"), the arena's mirrors activate, and his phase 2 projectiles can be **reflected by prism** (light beams through crystals) or parried back.
- **Teaches:** the stagger check (a 10 s break check before the "거울 붕괴" wipe attack).

### 8.6 Final boss: 공허룡 니드호그라 (Nidhoggra)

**Scale:** it is the largest thing in the game. The golem is 6 m, the hydra 15 m, the treant 20 m, and the wyrm 70 m.

**Look:**
- A serpentine dragon 70 m long and 18 m at the shoulder.
- Obsidian scales cracked with violet void light, and tattered wings of void mist.
- **5 stolen oath shards** embedded along its spine, glowing in the colours of fire, ice, lightning, wind and earth (§8.1).
- A ring of eyes around its head, and the 아스트라의 핵 (the World Tree's heart crystal, its body) trapped in its chest.

**Rendering:**
- 24 spine segments on a spline: instanced, 1 draw call for the body and 1 for the outline. Plus a head mesh, 2 wing ribbons, 5 shards (instanced) and 4 eye clusters.
- About 30 draw calls total, with an emissive fresnel shader. Distance fog hides the far body.
- `enemies.prewarmBoss('nidhoggra')` is idempotent. It runs behind the boss-intro fade on spawn, on save load and on debug skip, and also early during the Kalis cinematic.

**Total health (tuned for a 6–8 min fight at L25):** phase 1 head 8000 · phase 2 shards 5 × 1000 · phase 3 eye clusters 4 × 800
+ heart 4000 = 20200. All values are × the finale scaling (×3.6), so ≈ 72.7k in total. The §15 sim gives 6–8.5 min per build. There is a checkpoint at each phase.

**The build matters: lock elements.** Phases 1 and 2 use **9 lock types, one per element**. A lock is stripped by a hit
of one of its **counter** elements, at ×2 by a reaction on it, or by the 50% V fallback. Every class's 6 accessible elements
cover **at least 4 of the 5 locks in each phase**. With primaries only, a class covers at least 2. This is data-checked in
playtest3.

| Phase | Lock | Counters |
|---|---|---|
| 1 (head plates) | 거울 장막 (light) | shadow, lightning, earth |
| 1 | 물 장막 (water) | lightning, ice, nature, earth |
| 1 | 암석 장막 (earth) | water, wind, nature |
| 1 | 그림자 장막 (shadow) | light, fire, wind |
| 1 | 덩굴 장막 (nature) | fire, ice, shadow |
| 2 (oath shards) | 화염 서약 | water, ice, earth |
| 2 | 빙결 서약 | fire, light, earth |
| 2 | 번개 서약 | earth, water, nature, light |
| 2 | 바람 서약 | earth, ice, shadow |
| 2 | 대지 서약 | lightning, wind, water |

Locks each class can open (out of 5 per phase; the last column uses its two primaries only):

| 직업 | Phase 1 | Phase 2 | Primary-only (P1 / P2) |
|---|---|---|---|
| 마법사 | 5 | 5 | 3 / 3 |
| 검사 | 5 | 5 | 2 / 5 |
| 궁수 | 5 | 5 | 2 / 3 |
| 성기사 | 5 | 5 | 2 / 2 |
| 정령술사 | 5 | 5 | 2 / 3 |
| 암살자 | 4 | 5 | 4 / 2 |

**V, 정령의 선물 (the fallback, with a cost):** it strips **50%** of the current lock and **gives no shard buff**. It has 1
charge per lock. So a build that brings the right element is always faster and stronger.

**Phase 1, 「뿌리를 갉는 자」 (on the root plateau, r 34):**
- The head and forelimbs reach over the plateau's edge. The camera FOV widens to 70°.
- **Claw slam:** a 1.2 s telegraph with a golden parry glint. **Parry is the answer**: a big hitstop and +15 break.
- **Void breath sweep:** dash through it, block it (paladin), or step behind a root pillar.
- **Void mist minions:** 공허 망령 ×3, every 30 s.
- **Head plate:** one of the 5 phase-1 locks at a time, rotating every 20 s. The order is shuffled so that the plates the player can counter come first.
- **The lightning-rod moment at 66% HP:** it charges a lightning breath for 4 s, and 볼타's 3 rods rise on the plateau.
  - Hit the rods with *any* skill (they glow), or perfect-parry the breath. The lightning goes back into its jaw: a 6 s stagger, then phase 2.
  - A `lightning.rod` the player planted counts as a fourth rod.
  - If you fail, you take a heavy hit (40% maxHp), which is not lethal, and the rods reset.

**Phase 2, 「정령의 족쇄」 (the wyrm coils around the 5 root pillars):**
- **Goal:** break the **5 oath shards** on its back.
- **Reaching them:** there is no spine running and there are no moving platforms. Every 15 s, the wyrm's coil drapes a shard segment beside a **root pillar top** (+12 m) for a 10 s window, with a glowing ring telegraph. A static spirit updraft at each pillar lifts you to the top: glide, land, and hit the shard. Ranged classes can also hit it from the ground at ×0.7.
- **Each broken shard frees its oath** (a cameo VFX) and, *only when it was broken by a counter*, grants a buff for the rest of the fight:

| Shard | Buff |
|---|---|
| 화염 | weapon/spells add burning |
| 빙결 | parry freezes the attacker |
| 번개 | cast/attack speed +20% |
| 바람 | glide stamina free; updrafts +30% |
| 대지 | −20% damage taken |

- **Stagger check at 33%:** it gathers the **공허 해일 (Void Tide)**. You have 12 s to fill its break gauge with parries, heavy skills, reactions and gifts. Success leads to the phase 3 cinematic. Failure knocks you down and restarts the check (no wipe).

**Phase 3, 「여명의 하늘」 (in the air above the plateau; grade `void` → `golden`):**
- The wyrm rises above the plateau into an eclipse. 루미엘 opens **light rings**: updraft gates in a loop 20–40 m above the plateau. The ground below is always the real plateau, so a fall is just a landing.
- **Gameplay:**
  - Glide through rings. Each ring refills stamina, grants 2 s of Focus slow motion to every class, gives **+50% damage for 6 s**, and **resets the X (ultimate) cooldown** once per 20 s.
  - Dodge void meteors (telegraphed ground shadows on the plateau).
  - The **4 eye clusters** on its wings take **full damage from the player's own ranged skills and ultimates**, including melee ultimates' projectiles (sword waves, the thrown spear and hammer).
  - **루미엘의 창** (V, 3 charges, 5 s recharge) is the fallback for any class, and especially for melee builds. Each throw does 8% of an eye cluster.
  - All reactions on its body do **+50%** in this phase.
- The **heart crystal** opens: the final weak point, ×2.5, for a 20 s window, at ground level on the plateau. Then the finisher prompt.

**Cut lines (decided in advance, so a weak feature never blocks the ship):**
1. If the phase-3 ring loop proves unreadable, phase 3 stays on the plateau. The eyes drop low on the wings, and the rings become ground light pillars that give the same buffs.
2. If the wyrm's coil animation along the pillars is janky, the shards move to 5 static **perches** (the wyrm's body "petrifies" at each pillar for its window).
3. If phase 3 slips (P1), the heart opens straight after the phase-2 stagger check.

**Finale strike, 「세계수의 새벽」:**
1. The player dives from above. Time slows.
2. The colours of the 9 spirits merge into your weapon.
3. One input (LMB, R or X) lands the blow on the heart.
4. Silence for 0.4 s, then impact: a white flash and a 1.5 s light burst.
5. A staggered **dissolve into light petals and leaves**, limbs first and the core last.

**Ending cinematic (`buildEnding`, rewritten):**
1. The void mist turns into **golden pollen** raining over 에테리아.
2. 아스트라's grey crown blooms.
3. A time-lapse: Mirwen's lake clears, Elderwood blooms, the root plateau greens, and the floating islands settle into the crown.
4. The village festival with lanterns and fireworks.
5. Credits listing all 9 spirits and the new NPCs.
6. 끝, then the **epilogue** in free roam (`done`).

**Music:**
- Phase 1: percussion and low brass.
- Phase 2: adds choir, and each broken shard adds that element's leitmotif.
- Phase 3: the main title theme with full strings and choir.
- The finale strike cuts to silence before impact.
- The ending: a soft harp version of the village theme.

**Forgiving rules:** a checkpoint at each phase. HP regen works between phases (cinematics end with a 50% HP top-up). There is no instant death; the worst hit is 45% maxHp at 보통 difficulty. The target length is ≤ 8 min at 보통 (§15). Autosave never happens mid-boss.

---

## 9. Animation & VFX upgrade plan

The plan is prioritized by impact divided by cost. All of it stays inside §12's budget. "Existing" means it is already in the code.

### Tier S (first; nearly free)

**S1. Hit-feel tier table** (one table drives everything): `vfx.hitFeel(tier, pos, dir, element)`.
**Only `combat.dealDamage` calls it**, once per non-DoT hit. The tier is the max of the hit's tier, reaction, crit and kill
bonus. Melee code and skills only set `hit.tier`; reactions never call it separately. Spell volleys are rate-limited to one
hitstop per 0.12 s.

| tier | hitstop | trauma | fovKick | screenFlash | particles | flashEntity |
|---|---|---|---|---|---|---|
| light | 0.03 s | 0.08 | — | — | ~12 | 0.08 s |
| heavy | 0.07 s | 0.25 | +2° / 0.15 s | — | ~28 | 0.12 s |
| crit | 0.10 s | 0.40 | +4° | 0.12 α | ~40 | 0.12 s |
| reaction | 0.08 s | 0.30 | +3° | — | ~36 | 0.12 s |
| ult | 0.16 s | 0.70 | +6° | radial chroma pulse 0.2 s | ~70 | — |
| break | 0.25 s near-freeze (×0.05) | 0.6 | +5° | white 0.15 | ~60 | — |

- Mob kill: +0.04 s. Player hurt: no shake, a red vignette instead.
- Total trauma is capped at 1. A screen-shake % setting is respected (accessibility).

**S2. Hit-pose pop.**
- At hitstop start, the victim's additive hit layer snaps to its peak pose immediately.
- Attacker and victim both freeze, while particles keep running on `realDt`.

**S3. Shake upgrade.**
- The existing trauma system moves to 3-octave value noise on pitch, yaw and roll (max roll 2.5°), with trauma².
- A directional kick spring (critically damped, 0.12 s).

**S4. Move phase data.**
- Every melee and cast move gets `{antic, strike, hold, recover, cancelFrom}`, in the ranges antic 0.12–0.35, strike 0.05–0.08, hold 0.06–0.12, recover 0.2–0.45.
- Input buffer 0.15 s. Dash-cancel from recovery costs +10 stamina.
- **Root-motion lunges** clamp to the target distance −0.8 m.

**S5. 5-layer element impact recipe**, all from existing pools:
1. Core flash quad (white-hot → mid, 0.1 s).
2. Glow billboard.
3. Velocity-stretched sparks (8–20).
4. Normal-blended tinted smoke (3–6).
5. Debris and decal (lingering 4–8 s).

- Heavy hits and above add a shockwave ring and an emissive flash sprite (no light).
- Settings scale counts by low 0.5 / medium 1 / high 1.5.

**S6. Element language** (§3 table).
- Every element gets an `impact` and `explosion` preset (new ones for water, nature, light and shadow).
- **Every reaction** gets a signature preset that blends both ramps and adds one unique element, for example:

| Reaction | Signature |
|---|---|
| 증발 | white billows |
| 초전도 | blue sparks + frost ring |
| 들불 | petal-embers |
| 성화 | white-gold flame |
| 흑염 | inverted violet flame |
| 프리즘 | 3 coloured rays |
| 심판 | a sky pillar with a rune circle |

### Tier A (core of the "well-made fantasy" feel)

**A1. Weapon trails and smear.**
- A ribbon sampled from hilt and tip (16 samples, Catmull-Rom to 32 verts) with a scrolling two-layer noise mask and a gradient-mapped element ramp.
- A 1–2 frame **smear crescent mesh** during the strike (pooled, 1 draw call).
- Per weapon: longsword arc, hammer heavy wide arc, daggers twin thin arcs, bow string snap line, staff and totem a gem comet tail.

**A2. Additive hit reactions on all rigs.**
- Spring states on spine and head (ω ≈ 18, ζ ≈ 0.7). Impulse by hit direction: light 8°, heavy 18°, plus 0.1–0.4 m knockback.
- **Poise / break:**
  - Light hits drain poise without interrupting.
  - When poise breaks: a 0.8–1.2 s stagger with a big lean and a "붕괴!" pop.
  - Bosses never flinch; they only lose break gauge.

**A3. Telegraph system.**
- Three channels:
  1. Body wind-up with 1.2× hold and an emissive pulse, plus a white "tell flash" 0.25 s before unblockables.
  2. **Ground decal** with a fill that grows from the centre to the edge (`uProgress`). Red-orange for damage, violet for void, a gold rim when parryable.
  3. A rising tone.
- **The decal radius equals the hitbox radius exactly.**
- A **golden parry glint** 0.15 s before parryable hits.
- Wind-up length: mobs 0.5–0.8 s, elites 0.7–1.0 s, boss slams 1.0–1.5 s.

**A4. Death dissolve.**
- One `onBeforeCompile` chunk compiled into the shared toon material at boot by **core** (`uDissolve = −1` is a no-op): world-space 3D value noise, discard, and an edge glow in the element colour. At death, fx clones the entity's materials once (same program, so no compile) and animates the clone's uniform. Shared materials are never dissolved directly.
- **Death sequence:**
  1. Hitstop.
  2. A procedural collapse: spine forward, knees bend.
  3. A 0.9 s dissolve with 15 embers/s.
- Enemies: void-violet edge. Bosses: a multi-part staggered dissolve.

**A5. Ground decals.**
- Radial crack (earth and slams), scorch with ember speckles (fire), frost rim (ice), Lichtenberg burn (lightning), puddle ripple (water), flower ring (nature), rune circle (light), violet cracks (shadow).
- All are generated once on a canvas atlas. Pool 24, round-robin, 6–10 s life.

**A6. Secondary motion.**
- The cape verlet stays.
- New spring-bone chains, 3–4 links: hair/scarf (all), totem charms, quiver feathers, paladin tabard, shadowblade scarf tails.
- Breathing (chest scale 1 + 0.015·sin(1.6t)).
- Head look-at toward the aim (60%, clamped).
- Torso lean into turns (≤ 12°) and pitch on acceleration.

**A7. Locomotion blend and per-class style.**
- Speed-blended walk/run/sprint, with stride and cadence scaled by speed, and the pelvis bobbing at 2× step frequency.
- An upper/lower body split for casting while running.
- Per-class stance sets:

| Class | Stance |
|---|---|
| mage | upright |
| sword | guard |
| ranger | light bounce, bow low |
| paladin | heavy, shield forward |
| spiritcaller | floaty idle, totem charms swaying |
| shadowblade | crouched, daggers reverse grip |

**A8. Foot planting.**
- Two-bone analytic IK on legs using the heightfield (`world.getGroundHeight`), with pelvis lowering. IK weight follows the stance phase.
- Player always. Enemies within 25 m.

**A9. New poses** (in the 13-float player layer and the 16-float weapon layer):
- Dodge roll / backflip / shadow roll.
- Landing recovery (hard landings > 6 m).
- Directional hurt (front/back/left/right).
- Idle fidgets every 8–14 s per class (staff twirl, bow string check, hammer rest, dagger spin).
- New cast kinds: `throw`, `slam`, `channel`, `summon`, `buff`, `beam`, `bowDraw`, `bowRelease`.
- Every skill def names its `anim`.

**A10. Rune circles.**
- An instanced ring with a procedural per-element rune texture: it rotates, scales in with overshoot, and fades.
- Used under charged casts, ultimates, the skill-tree learn moment (in-world flash) and the shrines. Pool 6.

### Tier B (gated by graphics settings; off on low)

- **B1.** Heat haze only while fire ultimates or lava are active. Medium uses vertex-wobble heat sprites; high uses a half-res distortion pass.
- **B2.** A chromatic pulse and radial blur uniform (`uChroma`, `uRadial`) in the existing grade/sanitize pass, owned by core and triggered with `game.post.pulse(amount, dur)`, for ultimates, break and boss phase changes.
- **B3.** A fake lens flare and god-rays for light skills and the boss reveal (sprites; occlusion by a raycast at 10 Hz).
- **B4.** Soft-particle height fade in the vertex shader (free). Depth-based soft particles only on high.
- **B5.** Boss set pieces:
  - An arena-wide shadow decal before slams, and falling debris (pooled).
  - FOV pull-out to sell scale, and slow-mo at phase changes.
  - Per-phase grade blends (`void`, `dusk`, `golden`).

### Camera language
- A soft lock-on framing bias toward the boss's head.
- During boss telegraphs the camera pulls out by 10%.
- Finishers and phase changes use `cinematic.play({mode:'gameplay'})`.
- Ultimates get a 0.2 s anticipation push-in (existing) plus a radial chroma pulse.
- Gliding through light rings adds FOV +6° and a wind-line particle tunnel (pooled).

---

## 10. UI

All screens use the existing gold and parchment tokens (`--aw-gold`, `--aw-panel`, `--aw-panel-border`). They are DOM/CSS
overlays: no draw calls, build once, update on events, no layout reads per frame.

- **스킬 트리 (K):**
  - A night-sky "원소 별자리" screen.
  - **Ring view:** 9 element sigils in a ring around the class emblem. Primaries have a gold rim, secondaries silver, locked ones grey with a chain and the "◯◯ 직업만 사용 가능" tooltip.
  - **Selecting a sigil** zooms (CSS transform) into its constellation: 5 tier rows of star nodes, SVG connector lines, and a rune ring per tier that lights up when the points gate is met.
  - **Node states:** locked / available (pulsing) / learned / maxed / exclusive-blocked (crossed) / spirit-gated (a shard icon).
  - **Detail panel:** Korean name, type badge, rank x/y, cost, MP/cooldown, description with *current → next* numbers, caster and melee look notes, and the reactions it feeds.
  - **Header:** remaining points, mastery rank per element (입문 / 숙련 / 전문 / 대가), and the respec status ("제단에서만 초기화 가능").
  - **Planner mode** toggle.
  - **Quick-slot bar** at the bottom of the screen: drag a node onto 1–4/X/G, or hover a node and press 1–4/X/G (equip rule §5.5).
  - **Onboarding:** the 3-page first-open tour and the contextual tips (§5.6).
  - It pauses the game and locks input like the settings menu, with `pointer-events: auto`.
  - Learning a node plays a star-flare animation and the `skill_learn` sfx.
- **캐릭터 (C):**
  - Class emblem and name, level and XP bar, and the class signature description.
  - **Derived stats:** max HP/MP/stamina, power, defense, crit, move, regen delay and rate.
  - Element damage bonuses (mastery + passives), the list of keystones in effect, the class talents (Lv1/10/20/25 with the choice UI at 25), and the spirits freed (9 icons).
- **HUD:**
  - **Level badge** on the HP icon.
  - A **thin XP bar** under the vitals (scaleX).
  - A "+XP" floating number on kills, from the damage-number pool.
  - **Level-up card:** "레벨 업! Lv 12 · 스킬 포인트 +1", plus a gold ring burst at the player and the `level_up` fanfare.
  - An unspent-points pip: "[K] 스킬 포인트 2".
- **Hotbar:** LMB · RMB · 1 · 2 · 3 · 4 · X · G · R as an array of slots. Each slot shows the skill icon (element frame + archetype glyph), cooldown sweep, cost, low-resource tint, and the key label.
- **Element HUD (attune ring):**
  - Only the class's accessible elements (5–6), as small gems in an arc above the hotbar.
  - The attuned gem is big and glowing. Elements with 0 points are dimmed with a lock. The cycle key hint is shown.
  - Mage 연쇄 orbs, sword 인챈트 glow bar, a 투지 bar for melee classes, ranger Focus meter, paladin seal counter (4 pips), spiritcaller familiar icons, shadowblade mark count on the target's bar.
- **Enemy bars:**
  - Status pips extended to the new statuses: encrusted, seeded, radiant (with stack digits), corroded (stacks), dazzled, rooted, asleep, hexed, voidShield.
  - **Next-hit hint:** on the locked target, the newest aura pip that would react with the attuned element shows that reaction's icon in its family colour, and the bar shows "다음 타격: ◯◯" (from `combat.previewReaction`).
  - Elites and bosses show a **break gauge** and an element **weakness icon** (HSR-style).
- **Boss bar:**
  - Data-driven name, title and subtitle from the `bossSpawn` payload.
  - Phase pips from `phases[]` and the phase name.
  - A break gauge, a voidShield overlay, and multi-part sub-bars (hydra heads, shards, eyes).
- **원소 도감 (Tab grimoire → codex):**
  - Page 1: the reaction codex, **grouped into the 6 families of §4.5**, with family colours. Discovered entries show name, element pair chips, effect and an animated mini icon. Undiscovered ones are silhouettes with a hint ("물 + 번개 …?"). There is a discovery counter "23 / 49".
  - Page 2: the learned skills list.
  - The book becomes mouse-scrollable and interactive.
- **Class select panel** (story `choose`): 6 cards as described in §5.6.
- **Spirit gate list** (destinations), **respec confirmation** dialog, **class change** confirmation, **V gift prompt** (finale).
- **Interact prompt:** one prompt at a time, from `game.interact.current()` ("[F] 정령의 문", "[F] 대화").
- **Boss defeat card:** shows the boss name from the `bossDefeated` payload (not "수문장 정화" for every boss).
- **Victory screen:** level, class, build summary (top 3 trees), reactions discovered, time, kills, max combo.
- **Controls panel** updated with the new key map. `formatKeys` gets K, C, Z, X, V, 1~4.
- **Settings:** the 난이도 row (쉬움/보통/어려움, §16), screen shake, damage numbers and effect quality.

---

## 11. Audio additions

All audio is synthesized, as now.

- **Element recipes** for the 4 new elements:

| Element | Cast | Impact | Explode |
|---|---|---|---|
| water | bubble pops and a pitched splash | wet slap + droplet chimes | wave crash (pink noise swell) |
| nature | wooden knock + leaf rustle | thorny pluck | bloom (a rising harp gliss + pop) |
| light | bell + choir "ah" | crystalline ring | pillar (brass stab + shimmer) |
| shadow | reverse whoosh + low formant | muted thud + raven caw-ish FM | implosion (sub drop, reversed) |

  Charge loop base pitches: water 260, nature 196, light 523, shadow 98 Hz.
- **Hit layering:** whoosh + transient (0 ms attack) + element body + optional sub on heavy, with pitch ±6% and gain ±2 dB per play. Music ducks −4 dB for 0.3 s on crits and ultimates, and music cuts for 40 ms on ultimate hitstop.
- **Class weapon sfx:**
  - bow: draw creak loop, release thwip, arrow whizz.
  - hammer: heavy whoosh, thud.
  - shield: block clang.
  - daggers: light double swish.
  - totem: wooden rattle + chime.
- **New reaction cues** for every new reaction id (each with a distinct pitch). `resonance`: a 3-note arpeggio. `break`: a deep gong + glass.
- **UI:** `level_up` (horn fanfare + harp), `skill_learn` (star chime), `skill_unlearn`, `tree_open` (soft whoosh + pad), `slot_equip`, `xp_tick`, `codex_new`, `regen_start`, `gate_travel`.
- **Music themes** (new): `mirwen` (misty harp + flute, 6/8 feel), `elderwood` (marimba + low strings, mysterious), `sky` (bright strings + choir pads, for the ascent and plateau), `final_boss` with 3 layers (phase 1 percussion + brass, phase 2 + choir + leitmotifs, phase 3 the title theme orchestral), and `ending_v3` (harp village theme).
- **Boss voices:** hydra (3 pitched roars), treant (wood groan), Nox (low formant speech), Kalis (pitch-shifted player-voice reverse), Nidhoggra (sub roar + choir dissonance).
- **Voice limits:** the voice cap stays at 44 with priority by tier.
- **Victory fanfare** plays on `bossDefeated {final:true}`, at the kill. `ending_v3` plays during the ending cinematic. The `victory` event after the ending plays nothing new.

---

## 12. Perf budget for new content (medium preset)

**Measured baseline** (playtest2 perf, medium, before v3): village 242 calls / 655k tris, meadow 200 / 538k, camp 188, boss 158.

| Item | Budget |
|---|---|
| Hard ceiling, anywhere | **≤ 350 draw calls, ≤ 900k triangles** |
| **Per-scene targets** (worst view, busiest fight, including VFX) | village ≤ 290 · central plains ≤ 300 · Mirwen ≤ 310 · Elderwood ≤ 310 · root plateau with the final boss ≤ 330 |
| New lights | **none**. Use emissive + bloom. The existing pooled lights (vfx.js 3, world/fire.js, surface.js) stay visible at intensity 0 when idle, so the light count never changes |
| Per new zone static geometry | ≤ 15 draw calls (merged, vertex-coloured, one outline); dressing culls at drawDistance × 0.6 and casts no shadows |
| Floating scenery islands (all) | ≤ 12 draw calls; hidden before Act 4 |
| Village additions | 5 mentors + the sage use the merged villager pipeline (≤ +12 calls total); the 9-pillar altar is 1 InstancedMesh + outline |
| Particles | existing 8000 additive + 3000 alpha (2 draw calls); thinning above 900 live (existing) |
| **Object pools (the single source of truth)** | seed pods **16** · crystals **8** · droplets **12** · mines **6** · soul orbs **8** · ice flowers **4** · sunflower turrets **2** · familiars **3** · rods **4** |
| Summons (treant ally, fire spirit, totem, clone, mirror) | ≤ 4 alive, shared materials, no shadows for familiars |
| Decals / trails / telegraphs / rune circles / beams | pools of 28 (existing) / 20 (existing) / 8 / 6 / 18 (existing) |
| Reaction cascades | object bursts caused by other bursts are queued with a 0.08–0.12 s stagger, chain depth ≤ 3 per frame; ≤ 4 full reaction presets per frame (the rest play a reduced preset) |
| Enemies alive | ≤ 18 in a zone; lazy-spawned per zone, despawned beyond 120 m |
| Final boss | ≤ 40 draw calls (body instanced) + its VFX; during the plateau fight, grass/flora LOD is forced low and far terrain casts no shadows |
| Mid-bosses | ≤ 20 draw calls each |
| CPU | ≤ 8 ms/frame update at the camp benchmark on medium (current tools/playtest2 perf spot) |
| Shader warmup | every new material and archetype is compiled in `prewarm()`; `renderer.info.programs.length` must not grow after boot during the stress fight or a boss spawn |
| UI | DOM only; HUD writes on change; skill tree built once |
| Asset memory | the particle atlas grows from 4×4 to **8×8 at 128 px** (1024², one texture; 64 frames, 24 used) |

**Dynamic quality governor:** if the frame-time EMA is above 18 ms for 2 s, particle scale ×0.7 and procedural animation goes half-rate beyond 20 m.

---

## 13. Market-research takeaways

| Concept in Arcane Wilds v3 | Inspired by | How ours differs |
|---|---|---|
| Aura + trigger reactions, priority table | Genshin Impact | Real-time action with surfaces and objects; 9 elements with **opposite-pair cancels**; each reaction leaves terrain consequences |
| Seed pods that react with every element | Genshin Dendro Bloom / Burgeon / Hyperbloom | Our pods react with **all 8 other elements** (fire, ice, lightning, light, …), not just 2, and the grass-fire system can drop seeds |
| Surfaces: puddle, mud, holy ground, cursed mist, necroflame | Divinity OS2, BG3 | Light and shadow are a **modifier axis** over existing surfaces (bless/curse); everything runs on our 2 m BotW-style simulation grid at 10 Hz |
| Chemistry rules (fire burns grass, makes updrafts; ice freezes water) | Zelda BotW / TotK | Extended to new elements (water extinguishes, nature regrows grass, light purifies blight, earth walls are colliders) |
| One stacking status per element with its own tempo | Wuthering Waves, Elden Ring buildup | seeded (DoT), radiant (judgment at 5), corroded (+damage taken), with short readable stacks, not hidden meters |
| Break / toughness gauge, stagger checks | Honkai Star Rail, Lost Ark Valtan, Sekiro posture | Feeds our existing parry / hitstop / cinematic finisher; failing a check is never a wipe |
| Element trees with tier gates, key passives, capstones | Diablo IV, Last Epoch | Small fixed-shape trees (19–20 nodes), and the capstone *is* the old awakened ultimate + finisher |
| Primary / secondary affinity (full vs half tree) | Last Epoch masteries | Gated **by class**, not by a one-time mastery pick; secondaries still reach the normal ultimate |
| Mutually exclusive modifiers on actives | Lost Ark tripods | Only 2 modifier pairs per tree, so the UI stays readable in a short action RPG |
| Keystones with trade-offs | Path of Exile | Each element's keystone ties into our systems (regen delay, no glide, HP-cost casting) |
| Point budget below tree cost; late diminishing income | Grim Dawn, PoE | 38 points vs ≈ 95 reachable; there is a free respec at shrines (FFXVI / Lost Ark style) so experimenting is encouraged |
| Small equip loadout (4 + ultimate) | FFXVI (3 Eikons × 2), Dragon's Dogma augments | Casting auto-attunes LMB/RMB to the last element used, so slot choice shapes the reaction flow |
| Class-restricted element access | Lost Ark Sorceress, Blade & Soul Force Master | Every element is primary for at least one class, and locked trees advertise the other classes |
| Ranger focus slow-mo and element arrows | BotW bow + bullet time | Caster skills are re-presented as arrows, so one implementation serves two classes |
| Paladin holy seal linked to regen | WoW Consecration, D2 Paladin auras | It directly manipulates our new HP regen rule |
| Spirit familiars | Lost Ark Summoner, D4 Druid | Familiars mirror your two most-invested trees, so the build changes the companion |
| Boss-as-level, climbing weak points | Shadow of the Colossus, TotK Demon Dragon | Reached by our updraft + glide system: the wyrm coils past root pillars that you reach with updrafts (no moving platforms) |
| Spirit gifts guarantee every class can finish | BotW Champions, TotK Light Dragon | The 9 lock types read your build, and every class covers ≥ 4 of 5 per phase. The gift is a 50%, buff-less fallback, so no one is soft-locked, but the right element is always better |
| Mirror apostle that uses your kit | Hades (the father's mirror), Dark Souls mirror knight | Reads your actual progression (class + top 2 elements) |
| Enemy-element player debuffs | Monster Hunter blights | One clear one, `blight`, which disables regen (it reinforces requirement 5) |
| Hit-feel tiers, trauma shake, smear, dissolve | GDC talks: Vlambeer, Eiserloh, God of War, Riot VFX guide, Diablo III VFX | One data table drives hitstop, shake, FOV and particles per tier |

No single game's system is copied as a whole: each concept is adapted to our real-time BotW-style surface world, our parry and glide
systems, and our class-gated build model.

### 13.1 Per-element market survey → the Arcane Wilds twist

Sources: Diablo IV (D4), Path of Exile (PoE), Genshin Impact (GI), World of Warcraft (WoW), Final Fantasy XIV/XVI (FF),
Lost Ark (LA), Elden Ring (ER), Zelda BotW/TotK (Z), Magicka (MG) and Divinity OS2 / BG3 (DOS).
The left column lists what the market's skill kit for that element typically contains. The right column lists our version of each.
**Every active in §6 has at least one terrain, surface or object interaction** (pillar 2).

| 속성 | Market archetypes (where seen) | Arcane Wilds skill → twist |
|---|---|---|
| 화염 | fireball (D4, PoE, WoW) · meteor (D4, WoW, FF) · fire wall / burning line (D4, PoE) · nova (WoW) · burning aura (PoE Righteous Fire) · fire elemental summon (WoW, D4) · burn DoT (GI) · hot-air updraft (Z) | 화염구 ignites grass · **메테오** leaves a burning crater whose fire makes an updraft over grass · **살라만더** is the fire wall as a crawler that ignites its path · 홍련 선풍 nova · 화염 상승 geyser launch (skyslam setup) · **불씨 투척** remote-ignites rot walls, braziers and barrels · **불새 돌진** melts ice sheets into puddles · 불꽃 정령 summon |
| 빙결 | frost nova (WoW, D4) · ice shards/bolt (PoE, D4) · blizzard (WoW, D4) · ice armor/block (WoW, D4) · freeze → shatter (GI, D4) · glacial cascade (PoE) · freezing water (Z) | 서리 폭발 nova · **빙주** climbable pillar · 빙결 감옥 that earth shatters · **빙판길** road over water · **빙하 낙하** climbable block · 빙교 bridge · 빙하 송곳 cascade · 서리 반격 counter (armor reimagined as a counter-freeze) |
| 번개 | chain lightning (D4, WoW, PoE) · ball lightning (D4, PoE) · teleport/warp (D4, PoE) · mines/traps/brands (PoE, LA) · storm call (FF, WoW) · totems (WoW) · electro + hydro (GI) | 전격/연쇄 번개 chains · 구전 ball · 뇌신 질주 warp that damages its path · **뇌전 지뢰** charge puddles · **피뢰침** totem that routes chains and keeps water charged · 천벌의 뇌우 rain makes enemies wet, so it electrocutes · **뇌신 강림** electrifies all water nearby |
| 바람 | swirl spread (GI) · tornado (PoE, LA) · knockback/push (MG, FF) · updraft (Z Revali) · haste/dash (LA, FF) · projectile deflection (D4 shields) | 확산 spread · 소용돌이 tornado that absorbs zones (fusions) · **반발 돌풍** reflects projectiles · **바람 기둥** portable updraft, glide anywhere · 순풍의 길 tailwind lane · 천공 낙하 launch slam · 바람의 날개 |
| 대지 | earth spike/boulder/landslide (D4 Druid) · earthquake/sunder (PoE) · rock armor/shield (D4, WoW) · constructs + crystallize shields (GI Geo) · taunt (tanks) | 암석 가시 leaves a rubble surface (feeds sandstorm) · **대지의 벽** a real collider · **돌계단** climb route · 굴러가는 바위 shatters frozen · **거신의 주먹** smashes rot walls · 결정화 crystals · **도발의 석상** taunt totem |
| 물 | waves/push (MG, FF) · healing rain/spring (WoW, FF) · bubble CC (LA) · whirlpool (GI) · mirage clone (GI Mona) · wet + water surfaces (GI, DOS) · extinguish (MG, DOS) | 해일 leaves puddles (the electrocute and flashfreeze hub) · 치유의 샘 heal + cleanse · 거품 감옥 float CC · 물살 감옥 whirlpool · **신기루 분신** taunts and wets its attackers · **물의 채찍** extinguishes burning ground · **물살 타기** crosses deep water · **정화의 비** cleanses blight |
| 자연 | roots/entangle (WoW, D4) · poison DoT (PoE, D4) · treant summon (WoW, D4) · spore clouds (D4) · lifebloom HoT (WoW) · thorns (D4) · dendro bloom cores (GI) | 덩굴 속박 roots · seeded DoT · 나무정령 taunting summon · **포자 구름** is flammable · **씨앗 파종** builds a pod hub that reacts with every element · **덩굴 끌어당기기** grapples onto trees and pillars · **가시 숲** collider grove that fire turns into a wildfire · 생명의 꽃 |
| 빛 | smite pillar / judgment (WoW Paladin) · consecration holy ground (WoW, D2) · divine shield (WoW) · holy beam (FF, ER) · blessing aura (D2) · blind (FF) · light arrows (Z) | 심판의 기둥 · 성역 purifies blight · 수호의 방패 · **새벽의 심판** beam refracts through ice and crystals · 축복 aura · 섬광 dazzle feeds parries · **빛의 거울** reflects (the mirror-door puzzles) · **빛의 표지** reveals stealth/void · **천사의 창** leaves a relay pillar |
| 그림자 | drain/lifesteal (WoW Warlock, ER) · curse/hex DoT (WoW, PoE) · execute (WoW, D4 Rogue) · blink behind (D4, Dishonored) · stealth (D4 Rogue) · black hole (LA) · chains (D4, PoE) | 영혼 흡수 tether · 그림자 낙인 hex · 영혼 수확 execute · 그림자 걸음 · 그림자 장막 stealth · 어둠의 심연 black hole · **그림자 숨기** walks through hazards · **까마귀 떼** carries cursed mist along its path · **그림자 사슬** · 명빙 drops soul orbs |

---

## 14. Glossary (one term, one system)

Each Korean term below names exactly one thing. Nothing else in the game may reuse it.

| 용어 | Means only | Not to be used for |
|---|---|---|
| 각인 | a tree's entry node (`<el>.attune`), and the 각인 의식 class rite | — |
| 원소 연쇄 | the mage signature (kind `attunement`) | reactions |
| 원소 교향 | the universal reaction `resonance` | the mage signature |
| 성역 | `light.sanctuary` | the paladin seal (성인 / 수호의 맹세), the blessed surface (축복의 땅) |
| 섬광 | `light.flash` | 광휘 폭발 (radiant_burst), 뇌광 잔상 |
| 프리즘 | the reaction `prism` | the node `light.rx` (찬란한 지혜) |
| 소용돌이 | `wind.vortex` | 물살 감옥, 그림자 와류 |
| 공허 | the enemy element and the wyrm only | anything the player casts (shadow uses 그림자/어둠/명) |
| 흡혼 | `shadow.m2b` 흡혼 저주 | the shadow RMB (영혼 흡수) |
| 빛의 창 | — (retired) | use 광휘탄 (light LMB), 천사의 창 (`light.spear`), 루미엘의 창 (finale V) |
| 기력 | — (retired) | stamina is 스태미나; the melee skill resource is 투지 |

Tone rules: no blood or gore words (피, 핏빛, 혈). Use original enemy names, not other games' names (뿔도깨비, 말랑이,
도깨비 주술사; the boss `hydra` is named 삼두 물뱀 레비아탄).

---

## 15. Balance sim (L25, 보통, single target, sustained)

Assumptions:
- Base rotation DPS at L1 is 50–58, depending on the class.
- Damage is × power 1.96 × mastery × keystone/passives × the average reaction uplift.
- 심판 is limited by its 12 s boss cooldown.
- Kalis has 7000 × 3.6 = 25.2k HP.
- The finale is 20200 × 3.6 = 72.7k HP, with 80% uptime and ×1.12 for rings and shard buffs.

| Build | DPS | 심판 DPS | Kalis (min) | Finale (min) |
|---|---|---|---|---|
| 대가형 화염 마법사 (화염 22 + 빙결 12 + 4) | 218 | 0 | 1.9 | 6.2 |
| 쌍대가 검사 (번개 15 + 대지 15 + 8) | 189 | 0 | 2.2 | 7.2 |
| 방랑자 마법사 (4 trees × 8–10; §5.7 +16%) | 188 | 0 | 2.2 | 7.2 |
| 빛 성기사 (빛 22 + 화염 12) | 154 | 63 | 1.9 | 8.3 |
| 암살자 (그림자 22 + 자연 12) | 195 | 0 | 2.2 | 6.9 |
| 정령술사 (자연 22 + 물 12) | 168 | 0 | 2.5 | 8.0 |

- No build is more than ×1.4 faster than another.
- The capped judgment adds ≈ 63 DPS, about +40% for the light paladin, which is the lowest raw-DPS (tank) build. It no longer dominates.
- The tank classes (paladin, spiritcaller) are slower but have the most sustain, within the 5%/s boss heal cap.
- Re-run this table whenever a number in §4.3, §5 or §6 changes. It lives as a data check in `tools/playtest3/combat.js`.

---

## 16. Difficulty (난이도)

| 난이도 | Enemy HP | Enemy damage | Notes |
|---|---|---|---|
| 쉬움 | ×0.7 | ×0.6 | telegraphs +20% longer; stagger checks +4 s |
| 보통 (default) | ×1.0 | ×1.0 | — |
| 어려움 | ×1.3 | ×1.25 | regen in combat ×0.8 |

It is a settings row that can be changed at any time, outside a boss fight. It multiplies on top of zone scaling.

---

## 17. Review resolution log (v3.1)

This is the design-side summary. The technical side is in CONTRACT §0.

| Finding | Resolution |
|---|---|
| Spirit gate blocks class fantasy | Only capstones are story-gated, and mentors give shards (§5.4). Acts 2/3 are non-linear (§8.2). Light's capstone opens via 루미엘의 깃털 after any 2 lost spirits (§5.4) |
| Too few skills per tree | 19–20 nodes; 49 quick-slot actives + 9 ult + 9 sup; honest count (§6.13) |
| Judgment outlier | Consumes all stacks; 6 s / 12 s cooldown; floor 3; non-stacking; boss break +20 (§4.3 D); sim (§15) |
| Reaction readability | Published priority (§4.5); next-hit hint (§4.1, §10); 6 codex families; wind = one swirl rule; 상극 defined concretely (§4.2) |
| Earth aura unusable | `encrusted` 6 s aura; stun is no longer an aura (§3, §4.4) |
| Lore coherence | One chain: 9 children, 5 oath shards, 4 erased spirits, root channels, Lumiel = light / heart = body (§8.1) |
| Finale ignores build | 9 lock types, a per-class matrix, a costly V, eyes take the player's own ranged skills and ultimates, rings reset X (§8.6) |
| Build math / pacing / wanderer | Costs restated with the free 각인; points by act; earliest capstone; §5.7 breadth reward (§5.2) |
| Copy-paste nodes | A unique rule per `rx`; a distinct support role per element; de-duplicated modifiers; legacy ultimates numbered (§6.4–6.12) |
| Regen numbers / healer niche | 5 s / 1.5%/s in combat, 3 s / 8%/s out; zones −50% delay; 5%/s boss heal cap; OOC = no damage taken (§7) |
| Naming | Renames + glossary (§14) |
| Onboarding | 3-page tour, contextual tips, class trial, class change, reaction trainer, ultimate on X (§5.6, §2.2, §6.2) |
| XP pacing / difficulty | Per-act XP budget, catch-up XP, finale at L25, difficulty settings (§5.1, §16) |
| Market research | §13.1 per-element survey + a twist for every active |
| Coverage lopsided | 4 classes per element, ≥ 4 internal pairs per class (§2.1) |
| Melee resource conflict | 투지 resource for skills; stamina only for movement (§2.2) |
| Finale scope risk | All on terrain, no spine running or moving platforms, 3 pre-decided cut lines, a finale perf test (§8.6, CONTRACT §21) |
