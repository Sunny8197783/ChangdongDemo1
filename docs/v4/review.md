# v4 review gate (PLAN §1.8) — wave C round 1

Reviewer: core integration step. Input: every committed contact sheet in `tools/playtest4/sheets/{caster,melee,mobs,bosses}`
(52 + 62 + 11 + 6 PNGs, generated on the owner branches; the merged code of those files is unchanged by the integration) and one
R-* frame per class at 960×540 from the merged build (`R-mage`, `R-sword`, `R-ranger`, `R-paladin`, `R-spiritcaller`,
`R-shadowblade`, `R-boss`; captured after ≈ 5 s of the §1.1 readability rotation; PNGs stay untracked).
Criteria: the user's points 3 (refined and pretty, not merely flashy; magic circles are the reference), 4 (detailed monster
models) and 6 (where and how fast enemies attack must stay readable through player effects).

Verdict per item: **pass** or **fix** (every fix is also a fix item for its owner in the integration result).

## Skill contact sheets — caster (`magic`)

| Item | Verdict | Notes |
|---|---|---|
| Sheet format (§1.8: 3 frames at 640×360) | **fix** | Every sheet is 528×117 (frames ≈ 176×97 after the 150 KB downscale). At that size the looks cannot be judged; the effect sits ≈ 10 m from a camera behind the mage. Frame the caster from the side / closer, crop each frame around the effect or use fewer, larger frames so a frame stays ≥ 480 px wide. |
| Visibility of the looks (all 9 elements, B/C/A/Z) | **fix** | In 40+ of 52 sheets the impact frame shows only a 2–6 px sliver (earth.basic, ice.basic, nature.*, shadow.chains, water.*, wind.gust …). Restraint is right (§3), but a skill must still read: the anticipation glyph / circle and the impact linework should be visible at sheet scale. |
| Ultimates (fire/ice/lightning/wind/water/nature/shadow .ult) | **fix** | The U-tier impact and dissipation frames are empty or near-empty. The ultimate is the one place the plan allows a full rune circle + motif; none is visible. |
| Archetype × element sheets (cone, nova, projectile, zone) | **fix** | 27 cells per sheet at ≈ 95 px wide: nothing distinguishable. |
| fire.phoenix framing | **fix** | Camera sits inside the mage (half the frame is the hat). |
| In-game look (R-mage frame) | **fix** | Three solid ice crystals (ice prison / pillar) stand between the camera and the enemies and cover ≈ 25 % of the screen; the §5.4 near-camera fade / ducking does not reach these spell objects. Burning-grass flames on the left (see world). |

## Skill contact sheets — melee (`melee`)

| Item | Verdict | Notes |
|---|---|---|
| Sheet framing | **fix** | A tree trunk stands between the camera and the hero on the ML1 spot in ≈ 50 of 62 sheets and covers the swing. Move the spot or the camera. Leftovers of earlier casts (burning grass, soaked blue ground) appear in the anticipation frames of later casts (ice.nova, ice.prison, ice.slide, earth.*, light.*). |
| Element identity | **fix** | earth, nature, wind and water basics/charged/zone share the same pale cyan column + cyan ground pool; earth should read as rock/sand linework, nature as leaf/vine green. |
| fire, ice.nova, shadow (charged, step, ult), lightning.mine | pass | Distinct silhouettes in the element hue, crisp edges, no white wash; shadow.ult's crescent blades are the best melee look. |
| Opacity / fill | **fix** | fire.ember, fire.rising, fire.cyclone, fire.sup and fire.awakened stack many tall flame sprites around the hero; read as fill rather than linework (point 3: "flashy, not refined"). |
| In-game look (R-sword, R-paladin frames) | **fix** | R-paladin: tall orange flame cards fill the lower half of the screen (burning grass from the paladin's fire skill + the skill's own flames) — enemies are not visible. R-sword: earth spikes and a light pillar are fine, but no enemy is in view at the sampled moment (rotation aims away). |

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
