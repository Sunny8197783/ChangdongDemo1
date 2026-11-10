# v4 review gate (PLAN §1.8) — wave C round 2

Reviewer: core integration step, after merging every v4/* fix-round-1 branch. Input: all contact sheets regenerated from the merged build
with `node tools/playtest4.js --sheets` (caster 65, melee 62, mobs 11, bosses 6; committed) and one R-* frame per class at 960×540
(`R-mage`, `R-sword`, `R-ranger`, `R-paladin`, `R-spiritcaller`, `R-shadowblade`, `R-boss`, captured when an enemy attack aimed at the
player is 45–85 % through its windup; PNGs untracked). Criteria: user points 3 (refined, not flashy), 4 (detailed models), 6 (enemy attacks readable).

## Round 1 items re-checked

| Item (round 1) | Round 2 | Notes |
|---|---|---|
| caster U circles faint (light / nature / wind) | pass | Ground ink and impact sigils present (MG1 floors met for U except shadow.ult saturation). |
| caster U sheets 2 frames | pass | Every U sheet has anticipation / impact / dissipation. |
| caster B / C legibility at the v4 camera | **fix** | Most B looks are still a few px at the shipped camera: wind.basic and fire.basic show nothing readable in their sheets; MG1.c detail floors: earth.basic 318, light.basic 340 (≥ 400); --full also nature.roots, nature.charged, wind.charged, lightning.charged. |
| earth strata / walls | pass | earth.charged now pale tan strata with dark outlines; wall archetype shows element-shaped columns (fire tongues, ice shards, lightning spikes) — refined, not slabs. |
| water.charged dome | pass | Low 0.22-alpha sheet with crest arcs. |
| fire.phoenix | **fix** | The dash still leaves the player's black `spawnGhost` silhouette in the impact frame and the dissipation frame has the camera inside the mage (player + magic). |
| caster archetype sheets | pass | Split in 3 sheets with cropped cells; nova·fire/ice/lightning and wall rows read clearly. |
| ice crystals hiding enemies (R-mage) | pass | R-mage: the ice look is a small crystal cluster; enemies and their windups stay visible. |
| melee sheet framing (tree) | pass | The ML1 spot is clear; no trunk or canopy in the frame. |
| melee visibility at the shipped camera | **fix** | Melee sheets are not cropped (hero ≈ 15 px tall in a 640×360 frame scaled to 175 px); sigils exist (shadow.hex ring, fire.cyclone sigil) but cannot be judged. `arch_*` sheets: 9 cells of ≈ 95 px, nothing readable. Crop to the action like the caster sheets and split the archetype sheets. ML1.c: violet / cyan saturation under 0.40 (ice / lightning / shadow rows), light.sanctuary coverage 0.249. |
| melee fire restraint | pass | fire.cyclone / fire.ult: one slim flame + linework sigil, no stacked flame cards. |
| voidknight | pass (minor) | Darker plate with violet rune slots; still mid grey-violet rather than v3's near-black, readable. |
| wolf | pass | Dark fur, orange eyes, violet crack runes; corrupted identity back. 3 m frames still crop the body (sheet). |
| wraith | pass | Deep violet robe, glowing orb and hood ring. |
| other mobs (bokoblin, shaman, lizard, shroom, chuchu ×9, dummy) | pass | Unchanged; detailed. |
| boss sheet framing | pass (minor) | Bosses now fill ≈ 55–65 % of the cell height (was ≈ 25 %). |
| golem | pass | Glowing core in a cage ring visible from the front, moss caps, rune cracks. |
| hydra | pass (minor) | Frills, eye glow and jaws read; the neck surface pattern looks like noise dots at sheet size. |
| nidhoggra | pass (minor) | Thicker coil, larger element shards on the spine; still slim at long range. |
| treant | pass | Split chest plates with the rot-heart window, vines with leaves, root claws. |
| nox, kalis | pass | |
| enemy hit flash (vfx) | pass | No white-out silhouettes in any R-* frame under sustained hits. |
| damage / reaction numbers (ux) | **fix** | R-spiritcaller: a ≈ 40 px "붕괴!" label sits in the screen centre over the enemies (break / reaction banner); numbers themselves are small now. |
| persistent hint (ux) | pass | The skill-slot hint is gone; contextual hints sit at the left edge. |
| R-boss top-centre stack (ux + core) | **fix** | R-boss: the boss 공략 card (칼리스) opens mid-fight over the screen centre; "임무 완료", the boss title and a ghosted area banner overlap at the top. |
| burning grass (world) | pass | Low linework tongues; no tall flame cards in R-paladin / R-mage. |

## New items (round 2)

| Item | Verdict | Owner | Notes |
|---|---|---|---|
| Level-up card in combat | **fix** | ux | Every R-* frame (the scenes start at level 30) shows "Lv 30 / 스킬 포인트 +24 · {skillsKey} 스킬 트리" in the screen centre over the enemies: the `{skillsKey}` token is not formatted (`ui.js:946` passes `HUD_KO.levelUpSub` without `fmt`) and the card is not deferred during fights. |
| R-paladin camera in a tree canopy | **fix** | player | The combat boom ends inside a tree crown: the top third of the frame is a flat green canopy. Camera collision / fade must treat foliage as an occluder (or fade it). |
| R-shadowblade pale spikes | **fix** | melee | Big pale pink-white spiky solids (the loadout's 서리 폭발 / thorn motifs) lie on the ground across the lower half, drawn over the red telegraph decal. They read as flat fills, not linework, and hide the threat footprint. |
| R-ranger dust wash | **fix** | magic | A pale dust / smoke cloud fills the screen centre over the enemies (ranger wind casts); enemy bodies are barely visible. |
| Telegraph readability (point 6) | pass | tells | Red cone / rectangle / circle decals and rim outlines read clearly in R-sword, R-paladin, R-shadowblade and R-boss, including through player effects. |

---

# v4 review gate (PLAN §1.8) — wave C round 2 (round 1 kept below)

Reviewer: core integration step. Input: every contact sheet in `tools/playtest4/sheets/{caster,melee,mobs,bosses}` (52 + 62 + 11 + 6 PNGs; caster, mobs
and bosses regenerated from the merged build with `--sheets`, melee as noted below) and one
R-* frame per class at 960×540 from the merged build (`R-mage`, `R-sword`, `R-ranger`, `R-paladin`, `R-spiritcaller`,
`R-shadowblade`, `R-boss`; captured after ≈ 5 s of the §1.1 readability rotation; PNGs stay untracked).
Criteria: the user's points 3 (refined and pretty, not merely flashy; magic circles are the reference), 4 (detailed monster
models) and 6 (where and how fast enemies attack must stay readable through player effects).

Verdict per item: **pass** or **fix** (every fix is also a fix item for its owner in the integration result).

## Skill contact sheets — caster (`magic`)

Reviewed twice: the branch sheets (v3 camera) and the sheets regenerated from the merged build with `--sheets` (v4 combat
camera from `player`; these are the committed ones). Verdicts refer to the merged sheets.

| Item | Verdict | Notes |
|---|---|---|
| Ultimate rune circles (fire, ice, lightning, shadow, water .ult) | pass | Crisp concentric linework in the element `mid` hue, no white wash, the hero stays readable — exactly the "magic circle" quality the user likes. shadow.ult's orb + ring reads well. |
| light.ult, nature.ult, wind.ult | **fix** | The circle is faint (pale on pale grass) and the impact frame shows no motif; light.ult also exceeds its handle cap (29). |
| U-tier sheets have only 2 frames | **fix** | fire/ice/light/lightning/nature/shadow/water/wind .ult sheets lack the dissipation frame (§1.8 asks for 3). |
| B / C / A / Z looks (basic, charged, actives) | **fix** | At the shipped camera most bespoke B/C looks are a 3–10 px sliver next to the staff (fire.basic, ice.basic, lightning.basic, nature.*, wind.*, water.basic, light.basic); MG1.c confirms: detail floors fail for 36/36 bespoke rows on the merged build (fire.basic 448 px). Restraint is right, but each skill needs one legible shape (glyph, crisp ring or arc) at gameplay distance. |
| earth.charged / earth.ult / earth.wall | **fix** | Large dark-brown opaque slabs; they read heavy and block the view — use the earth ramp's lighter steps and linework edges instead of near-black solids. |
| water.charged | **fix** | An opaque saturated blue dome covers the target and the ground around it (fill, not linework). |
| fire.phoenix framing | **fix** | The sheet camera sits inside the mage (half the frame is the hat / a black silhouette). |
| Archetype × element sheets | **fix** | 27 cells per sheet at ≈ 95 px wide; only cone·water, nova·fire and nova·lightning are visible. Use larger cells. |
| In-game look (R-mage frame) | **fix** | Three solid ice crystals (ice prison / pillar) stand between the camera and the enemies and cover ≈ 25 % of the screen; the §5.4 near-camera fade / ducking does not reach these spell objects. |

## Skill contact sheets — melee (`melee`)

Reviewed twice: the branch sheets (v3 camera) and the sheets regenerated from the merged build (v4 combat camera; committed).

| Item | Verdict | Notes |
|---|---|---|
| Sheet framing | **fix** | On the ML1 spot a tree trunk and its canopy sit between the camera and the hero in ≈ 55 of 62 merged sheets; the canopy covers the top third and the trunk the swing. Move the spot or the camera. |
| Visibility at the shipped camera | **fix** | With the v4 combat camera most looks shrink to a few px around the hero (earth.basic, fire.basic, light.basic, lightning.basic, nature.*, water.*, wind.*); ML1.c detail floors fail for 36/36 bespoke rows on the merged build. Each swing needs one legible arc / ring at gameplay distance. |
| ice.nova crystals, shadow.ult crescent + rings, light.sanctuary ring, ice.ult / water.ult ground lines | pass | Crisp, element-coloured, readable without fill; these match the "magic circle" quality. |
| Element identity (branch sheets) | **fix** | On the branch sheets earth, nature, wind and water basics / charged / zone shared one pale cyan column + cyan pool; in the merged sheets they are too small to tell apart (ML1.f IoU: projectile lightning/wind 0.61, zone wind/water 0.64). |
| Opacity / fill (fire family, branch sheets) | **fix** | fire.ember, fire.rising, fire.cyclone, fire.sup and fire.awakened stacked tall flame sprites around the hero (fill rather than linework). |
| Leftovers between casts | **fix** | Burning grass and soaked ground from earlier casts show in later anticipation frames (ice.nova, ice.prison, ice.slide on the branch). |
| In-game look (R-sword, R-paladin frames) | **fix** | R-paladin: tall orange flame cards fill the lower half of the screen (burning grass lit by the paladin's fire skill + the skill's own flames) — enemies are hidden. R-sword: earth spikes and a light pillar are fine, but no enemy is in view at the sampled moment. |

## Model turntables — mobs (`mobmodels`)

| Item | Verdict | Notes |
|---|---|---|
| bokoblin | pass | Two ringed horns, under-bite tusks, belt and loincloth, club grip: clearly more detailed than v3, silhouette preserved. |
| shaman | pass | Skull necklace, gem ring halo, staff details. |
| lizard | pass | Frill, spear, shoulder pad, tail; windup pose reads. |
| shroom | pass (minor) | Face and cap read; pores/spore detail barely visible at 3 m. |
| chuchu ×9 | pass | Each variant has its own element accent (flame crown, ice cube, antennae, halo …). |
| voidknight | **fix** | v4 body reads light grey / lavender; v3's dark void armour identity is lost and the knight now looks like a plain silver knight. Darken the albedo (the void ramp `dark` step) and keep the violet rune slots as the bright accents. |
| wolf | **fix** | v4 reads as a light grey wolf; "타락 늑대" lost its dark, corrupted look (only small violet crack marks). Same albedo issue; the 3 m frames also crop the body. |
| wraith | **fix** | Pale lavender robe; the void-spirit reads washed out next to v3. |
| dummy | pass | |

## Model turntables — bosses (`bosses`)

| Item | Verdict | Notes |
|---|---|---|
| Sheet framing | **fix** | Bosses occupy ≈ 1/4 of each cell (camera too far); small details cannot be judged. |
| golem | **fix** | v4 is a heap of rounded rocks: the v3 glowing core / face is hidden from the front; the moss and rune cracks of §4.9 are hard to find. |
| hydra | **fix** | Reads as two thin necks on a disc; heads lack the §4.10 detail (jaws, fins, eye glow) at turntable size. |
| nidhoggra | **fix** | Tiny thin serpent in frame; the element shards read as dots. |
| nox | pass (minor) | Shard armour and blade silhouette read; sheet too far. |
| kalis | pass (minor) | Ice armour, spear, shield and floating crystals read. |
| treant | **fix** | Brown blob: bark plates, rot heart and vines of §4.12 are not visible. |

## Readability through player effects (point 6) — R-* frames

| Item | Verdict | Notes |
|---|---|---|
| Enemy hit flash under sustained hits (vfx) | **fix** | R-spiritcaller: two mobs render as solid white silhouettes while a 254-hit combo lands — their windup pose cannot be read. Cap the hit-flash amount when hits repeat (e.g. ≤ 0.35 after the first flash within 0.5 s). |
| Reaction / damage numbers (ux) | **fix** | R-ranger: a reaction label "57 확산·오로라" and "79" at ≈ 40 px height sit across the enemies in the screen centre; numbers should stay small and off the enemy bodies. |
| Persistent hint during combat (ux) | **fix** | The skill-slot hint "노드를 고른 뒤 아래 슬롯을 클릭하거나…" stays on screen in every R-* frame during the fight (§6.2: hints are action-gated and combat-limited). |
| R-boss | **fix (core harness + ux)** | The R-boss scene leaves the player at the shrine (kalis is not in view) and the boss title, quest banner and dialogue text overlap in the upper centre. core: teleport R-boss to the boss; ux: queue the boss title behind dialogue. |
| Burning-grass flames (world) | **fix** | R-paladin / R-mage: world grass fire spawns tall opaque orange flame cards that hide enemies and telegraphs; they should stay low (≤ knee height), linework-like and duck under threat footprints like player FX. |
| Telegraph decals / rim clones | pass (by numbers) | No tell was mid-windup in the sampled frames, so this rests on the tells section's T2 retention numbers (see the integration test results). |
