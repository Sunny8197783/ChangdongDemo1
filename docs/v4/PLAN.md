# Arcane Wilds v4 "polish": Plan and Binding Contract (PLAN.md)

Revision **v4.1** (v4.0 + the engineering, performance and player-experience reviews; see §8 resolution log). Branch base: `v4-polish` (= finished v3).

This file is **binding** for every v4 owner. It extends `ARCHITECTURE.md`, `docs/v3/DESIGN.md` and `docs/v3/CONTRACT.md`;
those stay valid unless this file overrides them. **On any conflict, PLAN.md wins** (numbers and APIs).
Player-facing text is Korean; code, comments and this file are English.

Evidence for the numbers below: the investigation scripts and result files are preserved in `docs/v4/evidence/v4diag-*/` (copied from `/tmp/v4diag-*`;
the scripts still reference `/tmp` paths, so core copies the reusable ones (`v4diag-readability/fight.js`, `lib.js`, `common.js`, `v4diag-webvfx/percast.js`, `measure.js`,
`v4diag-perf/inject.js`, `synctest.js`) into `tools/playtest4/fixtures/` with fixed paths in `core-p0a`).
Screenshots stayed in `/tmp` and are not needed by any check.

---

## 0. Read me first

### 0.1 The user's feedback (verbatim) and what it means

> 일단 렉이 너무 심한것 같아. 그리고 게임이 좀 불친절한 것 같고 스킬 이펙트들은 마법진빼고는 너무 화려하기만 할 뿐 정교하진 않은 것 같아.
> 각 스킬들이 정교하게 예쁘게 생겼으면 좋겠고. 몹들도 또한 정교하게 모델링해서 디테일한 부분까지 세세하게 만들어줬으면 좋겠어.
> 그리고 몬스터 마다 공략법이나, 전투 중 회피가 더 쉬웠으면 좋겠어, 왜냐하면 스킬 이펙트 때문에 어딜 얼마나 빠르게 때리는지 보이지가 않거든,
> 이 부분 좀 확실하게 고쳐줬으면 좋겠어.

Target machine (user-confirmed, `docs/v4/PROGRESS.md`): **a laptop with integrated graphics running Chrome** (Windows → ANGLE/D3D11), window ≈ 1920×970.
The default experience is tuned for that machine, and an automatic quality governor that lowers quality on weaker devices is mandatory.

| # | Complaint | Root cause found by the investigation | v4 answer (section) |
|---|---|---|---|
| U1 | 렉이 너무 심함 (heavy lag) | GPU fill: skill VFX particles cover **30–225 screens/frame** in fights; MSAA 4× on an RGBA16F target; PCFSoft shadows; full-res post chain; 5 idle point lights in every lit shader; 115k-tri unchunked terrain with a triplanar shader; per-frame buffer uploads of 0.5–0.9 MB (`bufferSubData` 24 % of CPU); 9–11.5 MB/s of garbage; shader compiles at first use (50–300 ms each on ANGLE); hitstop freezes 22–32 % of melee frames; `dt = min(realDt, 1/20)` makes < 20 fps run in slow motion | §2 |
| U2 | 게임이 불친절함 (unfriendly) | No monster info anywhere, fake "longer warnings" on 쉬움, timed toast walls, empty death screen, overlapping HUD, jargon, 88.8 s intro + 16-line lore dump, no assist options, tips that name the wrong key for 2 of 6 classes | §6 |
| U3 | 스킬 이펙트가 화려하기만, 정교하지 않음 (magic circles are the exception) | Every element ramps to **pure white**; intensity ×1.25–2.5 above a 0.86 bloom threshold; one 8–10-layer gaussian-blob recipe for every element; full impact per target ×2.9; 128 px sprites stretched to metres; octahedron crystals, tan cylinders, glowing-sphere projectiles | §3 |
| U4 | 몹을 정교하게, 디테일까지 (detailed monsters) | 9 of 16 models share one 13-bone toy rig; no hands, jaws, lids, cloth; rigid weights; triangles spent on smooth spheres; dark-on-dark palettes | §4 |
| U5 | 몬스터마다 공략법, 회피가 더 쉽게 | Mechanics exist but are never taught; weaknesses hidden; unreactable attacks (0.18 s bash, 0.15 s counter, 0 s aura); homing orbs you cannot outrun; i-frames 0.2 s, perfect window 0.10 s, paladin 0 i-frames; dodge input dropped during combo locks; no readable rhythm in enemy animations | §4, §5 |
| U6 | 어딜 얼마나 빠르게 때리는지 안 보임 | **Bug: every v3 `vfx.telegraph` decal is back-face culled and never drawn** (`src/vfx/telegraph.js:96-97`: mirrored z, FrontSide: 0 px). Even fixed, telegraphs draw under every player effect, share hues with player elements, are bloomed, are hidden by grass, show *where* but not *when*, and the hitbox is larger than the decal | §5 |

**"확실하게" (decisively)** means: every complaint has a machine-checked acceptance number in §1 and a playtest4 assertion in §7.8, and the
"looks better" complaints (U3, U4) additionally pass a **visual review gate** (§1.8): numbers are necessary but not sufficient.

### 0.2 The decisive moves (summary)

1. **Threats get their own scene**, `game.render.threatScene`, drawn by core *after* the whole post chain straight to the canvas: never dimmed, bloomed, fogged or tone-mapped,
   with a reserved palette **and reserved shapes** no player effect may use (§5.1–5.3). Decals soft-occlude only behind real geometry (> 1 m above the decal plane),
   enemy body rims depth-test against the scene so they outline the pose instead of painting over it. The culled-decal bug is fixed and guarded by a pixel test.
2. **Player effects get better, not just dimmer**: default effect intensity stays **100 %**; player effects duck to 50 % only *inside* real threat shapes and safe zones,
   and even there their primary linework stays ≥ 70 %. Readability comes from the threat scene being on top, not from hiding the skills (§5.4).
3. **One VFX language** built on what the user already likes (the magic circles): crisp SDF linework, soft toon effect meshes, tapered ribbons, branching bolts;
   4-step element ramps with **no white**; anticipation → impact → dissipation; per-cast fill and particle budgets **plus positive craft floors** (minimum detail, crisp-edge ratio,
   distinct silhouettes per element) and a contact-sheet review (§3, §1.4, §1.8).
4. **Enemies are rebuilt for counterplay**: one telegraph-driven timing source (`tells`), minimum windups, a readable animation rhythm (anticipation → hold → strike → slump),
   hitbox = drawn decal (one shared hit-test), a visible punish window after every signature attack, weaknesses on every HP bar, a 몬스터 도감 with class-aware strategy text,
   and detailed models built once per type and shared by every instance (§4).
5. **Dodging is forgiving**: i-frames ≥ 0.30 s, perfect window 0.20 s + 0.05 s grace (with a real refund mechanism), a 0.25 s input buffer, dodge-cancel rules,
   post-hit protection against melee chains, a short optional witch time, per-entity hitstop so other enemies keep their rhythm, assist sliders (§5.8–5.12).
6. **The default preset is rebuilt for an integrated-GPU laptop**: render resolution chosen by a **pixel budget** (≈ 1.0 MP at medium), no MSAA (FXAA in one merged final pass),
   quarter-area bloom sampled in the final pass, PCF 1024 shadows with a 30-call / 50k-tri shadow pass, no point lights, chunked terrain with one texture fetch on flat ground,
   bounded uploads and garbage, async shader warm-up, a refresh-aware governor that can step back up, no-realloc dynamic resolution, a 60 fps cap, and an in-game 성능 테스트 (§2).
7. **Friendliness**: one-at-a-time action-gated hints with the player's real key names, first-sight monster cards (never mid-dodge), boss briefs, a legend with real rendered
   telegraph thumbnails, a death recap, objective beacon + "how" lines, HUD declutter, dialogue fast-forward, a short intro option (§6).

### 0.3 Owners (11, disjoint file sets; full table in §7.1)

`core` (contract, settings/assist, timing, render pipeline, governor, test harness, integration) · `world` (terrain/grass/flora perf, height field, beacon) ·
`vfx` (all `src/vfx*` + `src/combat*`: kit, budgets, ducking, impacts, enemy FX style, damage pipeline) · `tells` (NEW `src/tells*`: threat scene content, timing, hit-tests) ·
`mobs` (regular-enemy behaviour, projectiles, codex data, encounters) · `mobmodels` (regular-enemy models: rig, faces, LOD, proxy, model contract) ·
`bosses` (golem + 5 bosses: behaviour, models, briefs) · `magic` (caster skill looks + fire/ice/lightning/wind/water motifs, `src/spells*`) ·
`melee` (melee skill looks + earth/nature/light/shadow motifs, `src/sword*`, dodge-cancel windows) · `player` (dodge, defence, witch time, camera, player model) ·
`ux` (`src/ui*`, `src/story*`, `src/cinematic*`, `src/audio*`).

Schedule (§9): **wave A** = core alone until the tag `core-p0a` (≤ 2 h: every shared API as a working stub); **wave B** = all other owners in parallel from `core-p0a`
(core continues); early tags `tells-p0a`, `kit-p0a`, `world-p0a`, `models-p0a` are merged read-only by their dependents; **wave C** = integration + review gate (core).

---

## 1. Goals and measurable acceptance

### 1.0 Measurement rules (apply to every row below)

- Quality **medium**, `fxIntensity` **1.0**, `prod=1` (checkShaderErrors off, production render settings), `governor=0`, `seed=1`, pixel ratio 1.
- **Resolution**: counts that do not depend on resolution (draw calls, triangles, uploads, programs, particles, CPU ms, allocations) and the F-*/B-*/C6 runs use **640×360**.
  Pixel tests use 960×540 or 640×360 as noted. Fragment metrics (`PT.fragments()`) are ratios to screen pixels and are resolution-independent to first order. Viewports never exceed 1280×720.
- **Default runs** (`node tools/playtest4.js`): F-mage, F-ranger, B-nidhoggra, R-mage, R-sword, R-boss and all S-*; every other class/boss scene runs under `--full`.
- **Draw calls and triangles** are always reported as `scene + shadow + overlay` (the three passes) with each part also listed; targets are on the sum unless a row says otherwise.
- **GPU ratios** (`--perf`, hard gate, §1.2): the same frozen frame rendered v4 / v3 in **ABAB interleaving, ≥ 5 pairs, median of the pair ratios**, with `PT.gpuSync()` (1-px readPixels) around each render.
  Absolute SwiftShader ms are never compared across runs (measured noise ±26 %).

### 1.1 Named test scenes (implemented once in `tools/playtest4/harness.js`, §7.8)

| Id | Setup |
|---|---|
| `S-village`, `S-plains`, `S-mirwen`, `S-elderwood` | `?test=1&cls=mage&skills=preset:endgame_mage` + `zone=<id>` (plains spot = (−20, 45)); no enemies; 4-yaw camera sweep (0°, 90°, 180°, 270°); max over yaws |
| `F-<cls>` (6 classes) | plains (−20, 45); preset `endgame_<cls>`; **12 enemies**: 2 bokoblin, 2 wolf, lizard, shaman, voidknight, shroom, wraith, chuchu ×3 (normal, fire, ice) at 6–12 m, kept attacking (`PT.armor(e)`). Scripted rotation, seed 1: one loadout skill every **0.5 s** (round robin incl. charged at charge 1), basic attacks between, ultimate every 7 s, cooldowns reset. 1 s warm, then 6 s measured; sample every 10th frame with render |
| `B-<boss>` (golem, hydra, nox, treant, kalis, nidhoggra) | the quest stage `tools/playtest3/enemies.js` uses for that boss + `&boss=<id>`; mage `endgame_mage`, same rotation; 6 s |
| `R-<cls>`, `R-boss` | readability fight (method of `evidence/v4diag-readability/fight.js`): 7 armoured mobs (R-boss: kalis + 2 mobs), rotation every 0.55–0.7 s, ult every 7 s; frames rendered as A (full) / B (player VFX hidden) / C (VFX + tells hidden) / D (B minus the winding-up enemy) |
| `P-bench` | the in-game 성능 테스트 scene (§2.8): 20 s, F-mage-like, used by the user and by C7 |

### 1.2 G1 Performance (U1)

Per-scene draw-call budgets (sum must hold; each owner checks its own row, C6 checks the sum):

| Group (owner) | S-plains (max yaw) | F-* p95 | B-nidhoggra p95 |
|---|---|---|---|
| world: terrain, grass, flora, water, sky, props (world) | 110 scene + 14 shadow | 110 + 14 | 110 + 14 |
| player model (player) | 8 + 4 | 8 + 4 | 8 + 4 |
| enemies (mobmodels for mobs, bosses for bosses) | — | 36 + 12 (12 mobs × 3, shadow via LOD mesh × 1) | 40 + 6 |
| player FX: kit, particles, spell/sword objects (vfx caps; magic/melee users) | — | 40 + 0 (FX never cast shadows) | 40 + 0 |
| enemy-owned FX, orbs, enemy particles (vfx caps; mobs/bosses users) | — | 8 | 10 |
| tells in the threat scene (tells) | — | 12 overlay (decals ≤ 6, rims ≤ 4, sprites 1, markers 1) | 12 |
| world-space UI, beacon (ux, world) | 4 | 4 | 4 |
| **Total (scene + shadow + overlay)** | **≤ 140** | **≤ 250** | **≤ 250** |

| Metric | Scene | v3 measured | **v4 acceptance** |
|---|---|---|---|
| Draw calls, max over sweep | S-village / S-plains / S-mirwen / S-elderwood | 237 / 198 / 213 / 208 | **≤ 175 / 140 / 160 / 160** |
| Draw calls p95 | F-* / B-* (mid bosses) / B-nidhoggra | 398 / — / 241 | **≤ 250 / 225 / 250** |
| Shadow pass at medium | F-* | 30–60 calls, 50–113k tris | **≤ 30 calls, ≤ 50k tris** (terrain does not cast; enemies cast through their LOD mesh ≤ 2k; player ≤ 6k; world ≤ 20k) |
| Triangles max (scene + shadow) | S-* / F-* / B-nidhoggra | 800k / 911k / 744k | **≤ 600k / 700k / 700k** (F-*: world ≤ 420k, enemies ≤ 140k, player ≤ 30k, FX ≤ 60k, shadow ≤ 50k) |
| Transparent draws in scene pass p95 | F-* | 145 | **≤ 55** |
| Shaded fragments ÷ screen pixels (`PT.fragments()`, §7.8) | S-* scene / F-*, B-* scene + transparent p95 / post passes | — | **≤ 2.2 / ≤ 3.5 / ≤ 2.0 full-res-equivalent** |
| Player-owned FX fragments ÷ screen (`vfx.debug.coverage()` = counting override on owner=player objects) p95 / max | F-*, B-* | 30–225 (particles only) | **≤ 1.5 / ≤ 2.5** (low 1.0 / 1.5, high 3 / 5) |
| Enemy-owned FX fragments ÷ screen p95 | B-* | 56–157 | **≤ 1.0** (bosses) |
| World transparents (mist, spores, motes, smoke, fires, water) ÷ screen | S-* | — | **≤ 0.5** (world) |
| Live particles max | F-* | 7,000 (ranger) | **≤ 1,000** (= medium cap) |
| Buffer uploads per frame (`PT.draws().uploadBytes/uploads`) | S-* / F-* | 527 KB / 840–890 KB in 84–112 calls | **≤ 60 KB / ≤ 150 KB in ≤ 30 calls**; tells ≤ 16 KB |
| Simulation CPU ms/frame median (`PT.simMs`) | F-* / B-* | 11.1 / 8.4 | **≤ 3.5 / ≤ 4.5** |
| Render-submit CPU (`composer.render` + overlay wall time, no GPU sync) | F-* | — | **≤ 4 ms median, ≤ 6 ms p95** |
| Whole-frame CPU (update + submit) p99 | F-* | — | **≤ 12 ms** |
| Long frames, 30 s after warm (CPU-side) | F-* | — | **0 frames > 50 ms, ≤ 2 frames > 33 ms, 0 long tasks > 50 ms** |
| Hitches on transitions | zone change, first boss phase change, first sight of each mob type | 15–80 ms | **no frame > 50 ms; first sight ≤ 8 ms incl. warm; spawn ≤ 1 ms per mob** |
| JS allocation (CDP `HeapProfiler` sampling, 20 s after warm) | F-* / S-* | 9.0–11.5 MB per game-second | **≤ 1.0 / ≤ 0.3 MB per game-second; no GC pause > 10 ms** |
| `ui.update` p99 | F-* | 33–74 ms spikes | **≤ 6 ms** (median ≤ 1.5 ms) |
| New `THREE.Material` objects in 30 s after warm | F-mage, F-sword | 98–257 | **≤ 4** |
| Programs after full warm at medium | all | 142 | **≤ 130** (kit + tells ≤ 10 programs together); growth after the first 5 s **0** |
| First draws of never-drawn programs | B-* first 25 frames | 5–14 | **0** |
| Boot timings | — | — | `bootToTitleMs`, `bootToPlayableMs` recorded in notes (no target; regressions > 20 % flagged) |
| CPU cost of any skill's first cast after boot | all classes | 80 ms (lightning.basic) | **≤ 8 ms** |
| Object3D count during a fight | F-* | grows | **flat** (static world `matrixAutoUpdate = false`) |
| 5-min soak (sim-fast) | F-mage | 39 new geometries / 30 s | `renderer.info.memory` geometries/textures, heap, listeners **flat (≤ +2 %)** |
| Composer at medium | — | MSAA 4 + sanitize + bloom composite + output | **MSAA 0; full-res passes = scene + final + overlay only; bright pass at ¼ area, first blur mip ≤ 1/16 render area, 3 mips** |
| Render resolution at a 1920×970 window | medium | 1.86 MP | **≤ 1.0 MP** (pixel budget, §2.2) |
| Point lights at low/medium | — | 5 (intensity 0) | **0** |
| Hitstop-frozen share of frames, 10 s (per-entity; global freezes only for `ult`/`kill`) | F-sword | 32 % | **≤ 8 %** |
| Game-time / real-time at realDt = 1/15 s and 1/10 s | — | 0.75 / 0.50 | **≥ 0.99 / ≥ 0.99**, and CPU at realDt 1/15 ≤ 1.6 × one 1/60 step |
| **GPU ratio v4 medium ÷ v3 medium (MSAA 4), ABAB ≥ 5 pairs median — HARD gate (`--perf`)** | F-mage / F-ranger / S-plains | 1.00 | **≤ 0.45 / ≤ 0.45 / ≤ 0.65** |
| Terrain fragment share (`noTerrain` ablation, ABAB) | S-elderwood | 0.60 | **≥ 0.80** |

### 1.3 G2 Friendliness (U2)

| Check | Acceptance |
|---|---|
| Codex coverage | `game.enemies.codex()` has an entry for **every** spawnable type (bokoblin, shaman, chuchu + 8 variants, lizard, shroom, wolf, wraith, voidknight, golem, hydra, nox, treant, kalis, nidhoggra) with `weak`, `resist`, ≥ 1 attack with `tellKo`/`counterKo`, and `tipKo`; the 몬스터 도감 tab renders all of them (locked ones as silhouettes) with **rendered model thumbnails** |
| Class-correct copy | for every class, every hint/codex/card string shown contains only that class's real key labels (from `game.input.keymap`) and never tells a ranger or spiritcaller to parry (`parryKo` lines hidden when `kit.defend` cannot parry, §6.11); 0 windup seconds in codex/cards/hints (regex `\d+(\.\d+)?초 뒤`) |
| First encounter | the first **sight** of each type (≤ 30 m, in view) shows a one-line strip within 0.5 s; the full 첫 조우 card appears only when that enemy dies or 3 s after combat ends; never twice for a type in a save |
| Death | the death screen shows the killer's name + attack name, the last 5 hits (source, amount, element, seconds before death), one class-correct codex tip and buttons 다시 일어서기 / 보조 기능 조정 / 몬스터 도감 보기 / 위험 표시 보기 |
| Legend | the 가이드 tab's 위험 표시 읽는 법 shows a **rendered thumbnail of every tell kind** (from `tells.renderThumb`), opens automatically at the first pause, and is linked from the death recap |
| Hints | at most **1** hint/tutorial card visible at any time; 0 hint cards during boss fights except combat-teaching hints; timed `TUT` queue removed; ≤ 2 shows per id per save (persisted) |
| HUD | ≤ 6 floating damage numbers at once; 0 centre banners (level-up, area, camp cleared, reaction discovered) while any enemy is aggroed (queued until 3 s after combat); bark box never overlaps the HP bar or hotbar (rect test) |
| Difficulty | 새 게임 offers 이야기 / 쉬움 / 보통 / 어려움; easy/story stretch the **actual** enemy windup (`tellStart → damage` measured), not just the decal |
| Settings | the menu contains every key of §6.8 and each one changes the game (playtest toggles each and asserts its effect) |
| Copy | grep: 0 occurrences of `보코블린` and `PERFECT` in player-facing data; `HUD_KO.check.{stagger,rods,tide,freeze,kalis}` equal the §6.10 strings exactly; `KEY_NAMES_KO.codex === '도감'`; one dodge/defend name per kit (§6.10) |
| Dialogue | holding F or Space fast-forwards (≥ 3× text speed + auto-advance after 0.4 s); Esc → 대화 건너뛰기 confirm |
| Own-machine check | settings → 성능 테스트 runs 20 s and shows average fps, 1 % low, governor level, render resolution and GPU string with a 복사 button (C7, UX3) |

### 1.4 G3 Refined skill VFX (U3)

Measured with the `evidence/v4diag-webvfx/percast.js` method (640×360, plateau, one cast, peak over the cast window, `fxIntensity` 1.0): **newWhite** = share of pixels with
luma > 235 that were not before; **sat** = mean HSV saturation of changed pixels; **cov** = player-FX fragments ÷ screen (counting override, `vfx.debug.byCast(castId)`);
**detail** = changed px; **crisp** = share of changed-mask pixels whose 3×3 Sobel gradient magnitude > 40 (linework, not haze).

| Tier (§3.3) | Peak newWhite | Mean luma rise | sat | cov peak (ceiling) | **detail floor** | **crisp floor** | Particles per cast | Kit handles |
|---|---|---|---|---|---|---|---|---|
| B basic | ≤ 1.5 % | ≤ +6 | ≥ 0.40 | ≤ 0.05 | ≥ 500 px | ≥ 0.25 | ≤ 16 | ≤ 4 |
| C charged / A active | ≤ 4 % | ≤ +12 | ≥ 0.40 | ≤ 0.30 | ≥ 2,000 px | ≥ 0.25 | ≤ 80 | ≤ 8 |
| Z zone / support (persistent part) | ≤ 3 % | ≤ +8 | ≥ 0.35 | ≤ 0.15 | ≥ 1,200 px | ≥ 0.30 | ≤ 30 /s | ≤ 6 |
| U ultimate / awakened | ≤ 12 % for ≤ 0.15 s, then ≤ 5 % | ≤ +20 | ≥ 0.35 | ≤ 1.0 | ≥ 8,000 px | ≥ 0.20 | ≤ 150 | ≤ 12 |
| F finisher | ≤ 15 % for ≤ 0.15 s, then ≤ 6 % | — | ≥ 0.30 | ≤ 1.5 | ≥ 10,000 px | ≥ 0.20 | ≤ 250 | — |

Plus:
- **Distinct silhouettes**: for each archetype, the impact-frame changed masks of the 9 elements have pairwise IoU **< 0.5**; inside one element, two skill rows may not share the same primary shape + motion (each row's first key shape in §3.7 is its signature).
- A stacked 1 s rotation of 7 mage casts ≤ **12 %** near-white (v3: 94–97 %).
- **0** `0xffffff` literals as an effect colour in `src/vfx*`, `src/spells*`, `src/sword*`, `src/combat*`, `src/tells*`, `src/skills*`, `src/enemies*` (grep; white only via `kit.ramp(el).hi` glints ≤ 2 frames); no element `colors.core` equals `#ffffff`.
- **Look coverage**: the skill list is **enumerated from the registry** (`game.skills.registry` ids; 103 at v4-polish HEAD), never hard-coded. `game.debug.lookOf(id, family)` returns the declared level
  `'bespoke' | 'archetype' | 'generic' | 'legacy'`. MG1/ML1 count a declared `'bespoke'`/`'archetype'` **only** when that skill's measured cast meets its tier ceilings and floors; a declaration whose
  measurement fails is a failure (the status cannot be passed by self-report). Acceptance: every registry skill is ≥ `'archetype'` in both families; the **bespoke set** (§3.7) is `'bespoke'`; `'generic'` and `'legacy'` count as failures.
- Contact sheets exist for every bespoke skill and every archetype (§1.8).

### 1.5 G4 Detailed monsters (U4)

| Check | Acceptance |
|---|---|
| Triangle budgets (body; outline proxy separate) | regular mob ≤ 9k + proxy ≤ 3k + LOD ≤ 3.2k (shadow caster ≤ 2k); golem ≤ 14k; nox, kalis ≤ 16k; treant ≤ 32k; hydra ≤ 32k and nidhoggra ≤ 60k (**remodels are P1**; P0 keeps the v3 meshes with the §4.0 contract) |
| Aggregate enemy budget F-* | ≤ 140k scene tris + ≤ 24k shadow tris, ≤ 36 scene + 12 shadow calls |
| Draw calls per regular mob | ≤ 3 (body, glow, outline proxy); LOD beyond 25 m ≤ 2 (no outline) |
| Feature checklist (`model.features`, §4.0) | every regular mob reports `face` (eyes with iris + pupil + highlight, brows or equivalent, mouth/jaw), `hands` (or species equivalent), ≥ 2 `springs`, `aoVertexColors`; per-species items of §4 tables present |
| Readable at gameplay distance | at 8 m on 1280×720 the eye group is ≥ 6 px wide; the outline proxy is visible on all four sides on the Elderwood floor; wolf, voidknight, nox, wraith body mean luma ≥ 0.18 linear on the Elderwood floor |
| Build cost | geometry built once per type (boot or `requestIdleCallback`), instances share `BufferGeometry` and clone only the skeleton; spawn ≤ 1 ms per mob; first sight ≤ 8 ms; boss models built inside `prewarmBoss` |
| Turntable sheets | §1.8 |

### 1.6 G5 Strategy and easier dodging (U5)

| Check | Acceptance |
|---|---|
| Windup floors (tellStart → damage, normal difficulty) | regular melee ≥ 0.75 s · combo follow-up ≥ 0.55 s (own decal) · ranged cast ≥ 0.9 s · elite ≥ 0.8 s · boss ≥ 1.0 s · boss AoE > 6 m ≥ 1.2 s · unblockable ≥ 1.0 s; aim locks ≥ 0.35 s before the hit. Asserted for **every attack id** of §4 via `e.debugAttack(id)` |
| Animation rhythm | every attack anim: anticipation until lock → **hold 0.10–0.15 s at lock** (bone angular velocity ≈ 0 for ≥ 0.1 s) → strike ≤ 0.12 s → visible recovery/slump for the punish duration (M1/B1) |
| No silent attacks | 0 player damage events from an enemy attack without a preceding `tellStart` for that enemy (DoT/hazard ticks excepted, which need an active `tells.hazard`) |
| Hitbox = decal | player centre 0.3 m outside the drawn edge → no hit; 0.3 m inside → hit, for every shape of every attack id; all enemy hits resolve through `tells.hitTest` |
| Punish windows | every attack marked with a punish in §4 emits `punishWindow {enemy, dur, mul}`; the enemy takes `×mul` (applied by `combat/pipeline.js`) and `tells.attack` refuses to start attacks during it |
| Homing | enemy orbs home ≤ 0.5 s at ≤ 120°/s then fly straight; ≤ 6 enemy orbs alive; walking sideways at 5.5 m/s from 10 m dodges a mob orb |
| Dodge | every class has i-frames ≥ 0.30 s except paladin (0.20 s + super armour 0.38 s); perfect window 0.20 s (shadowblade 0.22 s, paladin brace 0.15 s) **+ 0.05 s grace** for every class; a dodge press during any lock executes within 0.25 s (`dodgeBuffered`) or emits `dodgeRejected`; every dodge follows movement input when a direction is held |
| Weakness display | every enemy HP bar shows weakness/resist icons after the first hit |

### 1.7 G6 Visibility of enemy attacks (U6)

| Check | Acceptance |
|---|---|
| Telegraph renders | each shape (circle r 3, ring 2–5, cone r 4 / half-angle 0.785 rad, line 8 × 1.6, capsule, conecap) alone at 8 m camera distance, plains with grass: **≥ 600 changed px** at 960×540 (v3: 0) |
| Never occluded by player VFX | in R-mage, R-sword and R-boss, telegraph pixels with player VFX on ÷ with VFX hidden **≥ 0.95** in every sample (v3 with the cull fix: 52 % / 80 % avg) |
| Not occluded by grass | telegraph pixels with grass ÷ without **≥ 0.95** (soft occlusion counts only scene points > 1.0 m above the decal plane, §5.3) |
| Geometry occlusion | where a wall/enemy body taller than 1 m stands in front, the decal still shows at 40 % ± 5 % alpha |
| Not bloomed / exact colour | rim pixel colour with bloom on vs off: ΔRGB ≤ 8 (threat scene drawn after the post chain) |
| Rim clones outline, never fill | pixels inside the enemy's own silhouette changed by its rim clone ≤ **15 %**; rim visible on ≥ 60 % of the silhouette perimeter while not occluded |
| Enemy body visible during windup | R-mage / R-sword: enemy pixels lost to player VFX ≤ **30 %** avg, no sample > 60 % (v3: 69 % / 75 %) |
| Retention during the worst skills | for `fire.charged, wind.charged, wind.gust, earth.ult, earth.charged, water.ult, light.sanctuary, light.flash, lightning.ult, ice.nova, light.ult, nature.roots` (both families): telegraph signal retained **≥ 95 %** at +0.45 s and +0.9 s (v3: 0–48 %) |
| Reserved cues are unique | no player-owned object uses the reserved shapes (diamond sparkle, rising chevrons, hatch) or a reserved hue at saturation > 0.6 within 15 m of an enemy (T4 grep + runtime check) |
| Off-screen | an attack starting outside the frustum (or behind the player within 6 m) shows an edge arrow within 1 frame; it fills with the telegraph progress; off-screen enemies > 3 m away never start melee windups |
| Timing readable | telegraph fill is linear in time (abs(fill − t/dur) ≤ 0.02); damage resolves within 1 frame of the fill reaching the rim; the front turns near-white during the last perfect window; 0 flashes faster than 3 Hz |

### 1.8 Visual review gates (U3, U4; necessary in addition to the numbers)

- **Skill contact sheets**: `tools/playtest4/sheets/{caster,melee}/<id>.png` (anticipation / impact / dissipation, 3 frames at 640×360, generated by MG1/ML1 `--sheets`) for the bespoke set and one skill per archetype × element.
- **Model turntables**: `tools/playtest4/sheets/{mobs,bosses}/<type>.png` (3 m and 8 m; front / ¾ / side; idle and windup frames; v3 model in the row above), generated by MM2/B2 `--sheets`.
- Sheets are committed (PNG, ≤ 150 KB each). At integration (§9 wave C) core runs a **review pass**: a reviewer agent compares each sheet against §3 / §4 and files
  `docs/v4/review.md` with pass / fix items; fix items go back to the owning file's owner before the merge to `v4-polish`. A P0 visual item is done only when its numbers pass **and** its sheet passed review.

---

## 2. Performance plan (owner tags in brackets)

### 2.1 Ranked fixes (SwiftShader ablations from `evidence/v4diag-perf/proposal_*.json`; noise ±26 %, so only gains well outside noise are claimed)

| # | Fix | Owner | Evidence |
|---|---|---|---|
| 1 | **Player-FX fill cap**: fragment-counted coverage budget with a hard cap, per-cast caps (§1.4), projected-size clamp, no domes, white-free ramps, `uBoost` 1.25 → 1.0, particle caps 1,000/300, emitters routed through the budget, oldest persistent visuals collapse to linework under pressure (§3, §5.4) | vfx, magic, melee | all-particles-hidden bound = **0.17×** of fight GPU time; the largest single lever |
| 2 | MSAA 4 → 0 + one merged FinalPass (tone map, grade, chroma/radial, NaN guard, FXAA with tone-mapped taps, sRGB output) | core | ×0.66 alone (measured) |
| 3 | Render resolution by pixel budget (≈ 1.0 MP at medium) + no-realloc dynamic resolution | core | ×0.58–0.74 at scale 0.75 (measured); the user's 1.86 MP window is 2× what v3 tests measured |
| 4 | Terrain: 8×8 chunks + frustum culling + 2 LODs; **fragment**: one texture fetch where slope < 0.35, single mask fetch for surface overlays, burn/bless/curse only inside the active region circle; terrain does not cast shadows at medium | world | `noTerrain` = 0.60 (Elderwood), 0.67 (Mirwen): fragment-bound, so the shader change is the gain; chunking cuts vertex/shadow work |
| 5 | Per-frame uploads: `addUpdateRange(0, live × itemSize)` on every dynamic attribute; flora re-culls at most every 4th frame or when the frustum moves > 2° / 1 m; trail/beam/debris/kit pools upload live ranges only | world, vfx | `bufferSubData` 24 % + `uniformMatrix4fv` 21 % of sampled CPU; 0.5–0.9 MB/frame |
| 6 | Garbage: scratch objects in `separate`, `queryRadius`, `statusfx.update`, `cape.update`, `Object.assign` hot paths; reused return objects for every per-frame API | mobs, vfx, player, ux, tells | 9–11.5 MB/s measured |
| 7 | Shader warm-up: `renderer.compileAsync` (KHR_parallel_shader_compile) during title/intro, then one real warm draw per material (overlay materials against the canvas); `checkShaderErrors` off outside test | core (+ every owner's `warmup()`) | first-use stalls 15–80 ms on SwiftShader, 50–300 ms per program on ANGLE/D3D11 |
| 8 | No point lights below high (decided at boot): every lit shader loops 2 lights instead of 7 | core, vfx, world | unmeasurable on SwiftShader; large on iGPUs |
| 9 | Draw calls: player 25 → ≤ 8; spell meshes pooled/instanced; materials cached by key; village-only meshes culled; flora 350 → 200 m, flora outlines 62 → 35 m, enemy outlines 45 → 25 m | player, magic, melee, world, mobmodels | −60 to −160 calls in fights |
| 10 | Shadows: PCF 1024 at medium every frame with a **30-call / 50k-tri** shadow pass (LOD casters, no terrain caster), camera snapped to texels; grass `receiveShadow = false` at medium | core, world, mobmodels, bosses, player | shadow pass cost measured 30–60 calls; ratio gain inside noise, budget enforced by counts |
| 11 | Bloom rebuilt: bright pass at ¼ area, first blur mip 1/16 area, 3 mips, bloom texture sampled in FinalPass (no full-res composite) | core | removes one full-res pass; v3 first mip was already ¼ area, so only the composite is a claimed gain |
| 12 | Grass density 0.4 at medium, near fade ×0.7, skip zero-fade chunks, coarse far LOD | world | inside noise on SwiftShader; kept for iGPU fill, checked by `PT.fragments()` (S-plains ≤ 2.2) |
| 13 | Simulation sub-stepping (logic only, n ≤ 2) and per-entity hitstop | core (+ every playing module) | removes slow motion < 20 fps without a CPU spiral |
| 14 | Frame cap 60 by default | core | 120/144 Hz panels render 2.4× the frames and throttle iGPUs over minutes |

### 2.2 Quality presets v4 (core owns `src/core/settings.js PRESETS`; consumers in brackets)

| Key | low | **medium (default for every GPU tier)** | high (opt-in, §2.3) | Consumer |
|---|---|---|---|---|
| Pixel budget `budgetPx` | 0.6 MP | **1.0 MP** | 1.6 MP | core |
| `renderScale` (upper bound) | 0.85 | 1.0 | 1.0 | core |
| Base scale | `min(renderScale, sqrt(budgetPx / (w · h · pr²)))`, never below 0.5 | | | core; settings shows `렌더 해상도 1344×756` (live value) |
| Dynamic resolution range (× base) | 0.70–1.0 | 0.80–1.0 | 0.85–1.0 | core governor |
| CAS-lite sharpen in FinalPass | when scale < 1 | when scale < 1 | when scale < 1 | core |
| `msaa` | 0 | 0 | 4 | core (boot) |
| FXAA | on | on | off when MSAA 4 | core |
| `shadows` / type / size / every | off | on / PCF / 1024 / 1 | on / PCFSoft / 2048 / 1 | core (type, every), world (size, extent ±32 m, caster distance 60 m) |
| Shadow pass budget | — | ≤ 30 calls, ≤ 50k tris | ≤ 45 calls, ≤ 90k tris | world, mobmodels, bosses, player |
| `bloom` | off | ¼-area bright, 3 mips, thr 1.0, str 0.40 (0.30 while `enemies.aggroCount() ≥ 3`) | 5 mips, str 0.45 | core |
| `pointLights` | 0 | 0 | existing 5 | core decides at boot → `game.render.pointLights`; vfx, world honour |
| `grassDensity` / near fade / receiveShadow | 0.25 / ×0.6 / off | 0.4 / ×0.7 / off | 0.85 / ×1.0 / on | world |
| Tree draw distance / flora outlines | 120 m / 20 m | 200 m / 35 m | 350 m / 55 m | world |
| Enemy outlines / LOD distance | 15 m / 18 m | 25 m / 25 m | 40 m / 35 m | mobmodels, bosses |
| Particle caps alpha+additive / additive | 500 / 150 | **1,000 / 300** | 2,000 / 600 | vfx |
| Player-FX coverage soft / hard (screens) | 1.0 / 1.5 | 1.5 / 2.5 | 3 / 5 | vfx |
| Player-FX draw calls p95 | 30 | 40 | 60 | vfx (runtime-enforced) |
| `effectQuality` / `fxDetail` | low / 0 | medium / 1 | high / 2 | vfx, magic, melee |
| `fpsCap` | 60 | **60** | 60 | core (setting: 60 / 30 / 무제한) |

Changing `msaa`, the shadow type or `pointLights` recompiles every program: these apply **on reload** only (settings shows "재시작 후 적용"). Everything else applies live.
**Quality values** stored in `settings.quality` are exactly `'low' | 'medium' | 'high' | 'custom'`; "자동" is **not** a quality value — automatic adjustment is the separate
`autoQuality` toggle (default on). Unknown stored values reset to `medium` (existing `settings.js:55` behaviour, kept).

**GPU tier and first run** (`src/core/gpu.js`): `WEBGL_debug_renderer_info` → `settings.gpuTier` (`/Intel|UHD|Iris|Radeon\(TM\) Graphics|Vega \d+ Graphics|Mali|Adreno|Apple M/i` → `integrated`;
`/NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc A/i` → `discrete`; else `unknown`). **Every tier starts at medium.** The 2 s title-screen benchmark (§2.3, P0) picks the starting governor level;
when it measures ≥ 1.6× headroom at medium on a `discrete` tier, the title shows once `그래픽 품질을 높음으로 바꿀까요? (재시작 필요)` [바꾸기 / 그대로]. If the user runs high and the governor sits at ≥ L2 for 30 s,
a toast offers `보통 품질로 낮출까요? (재시작 필요)` once per session.

### 2.3 Governor v4 (core, `src/core/quality.js`, replaces `main.js:527-544`; runtime only, never persisted)

**Inputs**: refresh interval `T` = 10th-percentile rAF delta over the last 2 s (re-estimated continuously; handles 60/120/144 Hz and the `fpsCap`: `T = max(T, 1/fpsCap)`);
CPU work ms (update + render submit, `performance.now`); GPU ms from `EXT_disjoint_timer_query_webgl2` when present (P0 when the extension exists, ignored otherwise); a **miss** = a frame whose rAF delta > 1.5 T.

| Level | Adds (cumulative) |
|---|---|
| L0 | the user's preset |
| L1 | `budget.fxDetail` −1 (secondary shapes and accents dropped, FM outlines off, ribbon segments ÷ 2), coverage ×0.6, particle caps ×0.6, flare/glow size ×0.7, enemy LOD distance ×0.8 |
| L2 | dynamic resolution active (controller below) |
| L3 | shadows every 2nd frame (camera texel-snapped), enemy outlines off beyond 15 m, enemy LOD distance ×0.6 |
| L4 | bloom off (FinalPass `uBloomOn = 0`, bloom pass skipped; no program change), grass density ×0.5, flora distance ×0.6, flora outlines 20 m |
| L5 | emergency: dynamic-res floor 0.6 × base, shadow map frozen, particle cap 300 |

**Rules**
- **Overload** = > 20 % misses over the last 1 s, or GPU ms > 0.9 T, or CPU work ms > 0.8 T, sustained for 1 s → step down one level; **two levels** when the frame-time EMA > 1.6 T.
- **Step up by probing**: after 6 s at a level with < 2 % misses, try one level up; if misses exceed 5 % within 2 s, revert and double that level's probe delay (6 → 12 → 24 s, max 48 s).
- **Dynamic resolution (L2+)**: with GPU timing, a proportional controller `scale = clamp(scale × sqrt(0.85 T / gpuMs), floor, 1)` every 0.25 s (settles ≤ 1 s); without it,
  `scale ×= 0.92` every 0.25 s while misses > 20 %, and `scale ×= 1.03` every 2 s while misses < 2 %. Changes ≥ 0.02 only.
- Changes never reallocate render targets (§2.4); a step costs ≤ 2 ms CPU.
- **Pre-emptive headroom**: on `bossSpawn` and on `skillCast` of slot `ultimate`/`finisher`, apply L1's budget for 4 s if the level is < 1 (budget-only; no resolution or shadow change).
- **Title benchmark (P0)**: 2 s orbit render of the village at the chosen preset behind the title; misses and CPU/GPU ms pick the starting level (0, 1 or 2) and feed the high-tier offer of §2.2.
- `game.perfScale` stays as a legacy view (= particle factor). Event `qualityLevel {level, scale, reason}`. The FPS overlay (ux) shows `자동 품질 L2 · 렌더 1344×756`.
- Settings: `autoQuality` (default on) disables all steps when off; `dynamicRes` (default on) disables only the L2 controller.

### 2.4 Render path v4 (core, `src/main.js` + new `src/core/post4.js`)

```
composer (targets allocated ONCE at the maximum render size = canvas size × renderScale; never disposed at runtime):
  RenderPass(scene, camera)        → target A (HalfFloat, samples 0|4, DepthTexture on both ping-pong targets),
                                     viewport/scissor = round(maxSize × scale)  (dynamic resolution without reallocation)
  BloomPass4 (own pass, not an UnrealBloom subclass):
      bright: NaN/Inf scrub + clamp 16 + threshold 1.0 into a ¼-area target; blur chain 3 mips (5 at high), first mip ≤ 1/16 render area;
      output = bloom texture (game.post.bloomTex); NO blend back into the scene target; overrides setSize; samples with uUvScale
  FinalPass (renderToScreen): sample scene × uUvScale, FXAA 3.11-lite whose every tap is tone-mapped (ACES 1.05) before luma/edge tests,
      + bloom × strength (uBloomOn) + grade (game.post.grade) + chroma/radial (game.post.pulse) + CAS-lite sharpen when scale < 1
      + dither + NaN guard + linear→sRGB output conversion (what OutputPass did)
after composer.render():                                    (core, main.js; not a composer pass)
  game.tells?.preOverlay?.()                                // tells copies rim-clone matrices
  renderer.setRenderTarget(null); renderer.autoClear = false;
  overlayCamera.copy(camera) (incl. projectionMatrix); renderer.render(game.render.threatScene, overlayCamera); renderer.autoClear = true
```
- `game.render.threatScene` is a separate `THREE.Scene` with **no background and no fog**; it is never part of the main scene, so it is invisible to the main and shadow passes.
  Its materials are `toneMapped:false`, `fog:false`, write sRGB output (`#include <colorspace_fragment>`), and are warmed against the canvas (1×1 scissor draw).
- `game.post.sceneDepth` = `{value: DepthTexture}` of the target the RenderPass wrote this frame; `game.post.uvScale` = `{value: Vector2}` (render viewport ÷ allocated size);
  `game.post.sceneRes`, `cameraNear`, `cameraFar`, `projInv` (`camera.projectionMatrixInverse`), `camWorld` (`camera.matrixWorld`) uniforms updated every frame. Overlay shaders sample depth at
  `gl_FragCoord.xy / canvasRes × uvScale`.
- `sanitizePass` and `OutputPass` are removed (their work moves into BloomPass4/FinalPass). `uChroma`/`uRadial`/grade uniform names stay under `game.post`.
- C1 asserts: full-res passes = scene + final + overlay only; MSAA 0 at medium; bloom mip sizes; a resolution step leaves `renderer.info.memory.textures` unchanged and costs ≤ 2 ms CPU with no frame > 25 ms.
- The NaN `pow/sqrt` source guard (main.js) stays.

### 2.5 Hitches and timing (core)

- `renderer.debug.checkShaderErrors = !isTest || params.has('shaderCheck')`; all §1.2 perf rows run with `prod=1`.
- **Warm-up**: after every module's `warmup()/prewarm()`, core calls `renderer.compileAsync(scene, camera)` (and for the threat scene) during the title/intro, then draws each returned material once
  (real `render` into a 64×64 target for scene materials; a 1×1 scissored canvas draw for threat-scene materials, so the sRGB canvas variant is the one compiled).
  `game.render.warm(object3D, {target:'scene'|'overlay'})` queues the same for later objects (idempotent per material). Element and colour variations are **uniforms or attributes, never `defines`**.
- **Sub-stepping** (`game.frame`): `realDt` capped at 0.1 s; `n = min(2, ceil(realDt / (1/30)))` (step dt ≤ 1/20); if the previous frame's sim time exceeded 8 ms, `n = 1` with dt = realDt × scale.
  Only **gameplay logic** is sub-stepped (movement, AI decisions, hit tests, timers, projectiles); each playing module receives `game.frame = {step, n, lastStep:boolean, frameDt}` and does its
  **visual-only work once per frame** when `lastStep` is true, using `frameDt` (animation mixers, skinning poses, springs, cape, model `update`, VFX bookkeeping). world/tells/vfx/ui/audio run once.
  `game.step(n, dt)` keeps its deterministic contract (dt ≤ 1/20 per step, `lastStep` on the final one).
- **Hitstop v4 is per-entity** (`game.hitstop(seconds, {tier, target})`): freezes the struck `target` (`target.hitstopUntil`, enemies skip their update, their TellHandle is extended by the frozen time)
  and the player's animation (not player input buffering); **other enemies, telegraphs and projectiles keep running**. Only tiers `ult` and `kill` (final blow of a boss) freeze globally.
  Single request capped at 0.10 s (0.12 for `break`, `parry`); the 3–4 frame floor applies only below 50 fps; a rolling 1 s window may be frozen at most 80 ms, except `ult`, `break`, `parry`, `kill`
  (always granted ≤ 0.10 s). Over-budget requests are dropped. `game.debug.hitstopLog()` returns the last 64 requests `{t, sec, tier, granted, target}` (for legacy tests).
- **Slow-motion arbitration** (`game.timeScale`): `set(id, scale, durReal, {compensate})` where `compensate:true` makes `comp()` return `1/scale` for player movement, skills runtime and sword actions
  while that entry is active (v3 compensated only `focus`). At most **one** non-`focus` slow-motion entry is active at a time (`witch`, `teach`, cinematics): a new request while one is active is ignored
  unless its priority is higher (cinematic > teach > witch).
- Frame cap: `fpsCap` 60 (default) / 30 / 0 = 무제한; core skips rAF callbacks that arrive earlier than `1/fpsCap − 2 ms` after the last rendered frame.

### 2.6 Hard budgets per owner (all P0; the scene sums are in §1.2)

| Owner | Budget |
|---|---|
| vfx | all particles ≤ 2 calls; kit linework ≤ 2 calls (instanced, 1 program); FM pools: one instanced mesh per element family over a merged shape atlas (vertex shader collapses non-selected shapes), each ≤ 2 calls incl. its outline; ribbons ≤ 1 call per 8; player FX ≤ 40 calls p95 enforced at runtime (over budget → oldest persistent visuals collapse to linework only); coverage per §2.2; kit + tells ≤ 10 programs together |
| magic / melee | ≤ 6 extra draw calls per cast on top of kit/particles; 0 new materials per cast (cache by key); spell objects ≤ 2 calls each; per-cast caps §1.4 |
| tells | decals ≤ 6 calls (instanced per shape family, height from `world.heightField` in the vertex shader; fallback without it: ≤ 16 calls of CPU grids rebuilt only when a decal moves > 0.1 m) + rim clones ≤ 4 + 1 sprite batch + 1 marker batch; ≤ 16 KB uploads/frame |
| mobs / bosses | no per-frame allocation in AI; skinned enemies beyond 30 m animate at half rate, beyond 60 m paused; enemy-owned FX ≤ 1.0 screens p95 in B-* |
| mobmodels | per §1.5; casters = LOD mesh only (never accessories, springs, glow, eyes) |
| player | ≤ 8 scene calls + ≤ 4 shadow calls, ≤ 30k tris, ≤ 6k shadow tris |
| world | §1.2 world rows; terrain ≤ 24 visible chunks; 0 always-drawn meshes outside the village radius; world transparents ≤ 0.5 screens; `heightField` exposed |
| ux | `ui.update` ≤ 1.5 ms median, ≤ 6 ms p99; DOM writes on change only; no per-frame layout reads |

### 2.7 CPU, upload and garbage rules (binding for every owner; rule 10 of §7.2)

- No `new`, closures, `.map/.filter/.forEach` with fresh callbacks, spread, `Object.assign` into fresh objects, `clone()` or array literals in per-frame paths; module-level scratch objects instead.
- Per-frame APIs return **reused** objects: `tells.active()` (reused records with reused Vector3s), `tells.footprints()` (one module-level `Float32Array`), `vfx.debug.*` excepted.
- Every dynamic `BufferAttribute` uses `setUsage(DynamicDrawUsage)` + `addUpdateRange(0, live × itemSize)`; never `needsUpdate` on a full-capacity array when fewer items are live.
- Static world objects: `matrixAutoUpdate = false` + one `updateMatrix()` at build.
- Every new material is created at build/warm-up time; colour changes go through uniforms or instance attributes.

### 2.8 Own-machine check (core runner + ux screen)

`game.quality.benchmark({seconds:20})` (core, `src/core/bench.js`): freezes input, teleports to the plains spot, spawns 8 training mobs when `game.enemies.spawnBench?` exists (mobs provides it; else none),
plays a scripted mage-like rotation through `game.skills` when present, orbits the camera, and returns `{avgFps, low1Fps, level, renderW, renderH, gpu, tier, cpuMs, gpuMs?}`; then restores the game.
ux adds 설정 → 그래픽 → `성능 테스트` (button, confirm `20초 동안 성능을 측정합니다. 진행할까요?`) and a result card with a `복사` button (plain text). The FPS overlay (설정 → 그래픽 → `FPS 표시`) shows `60 fps · 자동 품질 L1 · 렌더 1344×756`.

---

## 3. VFX v4 language ("정교하게, 예쁘게")

### 3.1 Why the magic circles work, and the rules that follow from it

The rune circles (`spells/props.js sigil()`, `vfx/runes.js`) are the only effects the user praised. They are: thin precise lines filling < 20 % of their area;
saturated mid-value colour (white only on detail); a clear line-weight hierarchy (outer double ring → glyph band → star → spokes → inner ring); layered timed motion
(0.28 s back-out scale-in, opposed spins, hold, fade in the last 30 %); on the ground plane, never between camera and action; deterministic (same crisp shape every time).
Every v4 effect follows the same rules:

| Rule | Binding numbers |
|---|---|
| **R1 Value** | Effect *bodies* are normal-blended or premultiplied (`CustomBlending`, `OneFactor`, `OneMinusSrcAlphaFactor`), linear luminance ≤ 0.6. Additive only on thin lines/cores covering ≤ 10 % of the effect's area, HDR ≤ 1.1. White (`ramp.hi`) only on 1–2-frame impact glints and thin inner cores ≤ 10 % of area. Emissive/intensity multipliers ≤ **1.2** everywhere (`coreMat` 2.2–2.5, `fresnelMat` 1.4–2.4, slash ×1.7–2.2, `flameMat` ×1.25, particle `uBoost` 1.25 all go to ≤ 1.2 / 1.0) |
| **R2 Shape first** | Each cast = **one primary shape** (focal point, highest value, crisp silhouette) + ≤ 2 secondary shapes at 40–60 % of its value/opacity + accent particles. No soft glow sprite with world radius > 1.0 m or projected size > 12 % of screen height. No domes or shells that enclose or approach the camera (shells ≤ 2 m radius, rim-only). No "puff" sprites for wind, light or lightning. Soft organic bodies (flame tongues, water, plasma) are soft-edged toon shapes, **not faceted gems** |
| **R3 Timing** | Anticipation 0.08–0.30 s (sigil or line forming, inward motion) → impact 2–4 frames (one glint) → dissipation 0.3–0.6 s by erosion/shrink/break-up, never by haze. Secondary layers start later and end earlier than the primary. Smoke/dust ≤ 0.8 s, alpha ≤ 0.35, kept below 1.2 m height |
| **R4 Restraint** | Basic attacks leave **nothing** behind. Per-target hit = one crisp spark (≤ 12 particles, no flare). The full impact plays **once per cast** (`castId`) at the epicentre. `screenFlash` only for U/F tiers, tinted (never white), alpha ≤ 0.25, ≤ 0.15 s, off with 섬광 줄이기. `fovKick` only U/F. Shake ×0.6 of v3 |
| **R5 Ground language** | Player ground effects use **linework** (rings, glyph bands, stipple, radial lines, ember dots ≤ 0.35 alpha); they never use filled discs, **diagonal hatch**, static solid rings near enemies, or any threat vocabulary (dark outer band + saturated rim + linear fill front, rising chevrons, diamond sparkles; §5.1). Player target rings are **dotted or glyph-band, rotating, in the element `light` step** |
| **R6 Palette** | Only the 4-step element ramps of §3.2; saturation of `mid` ≥ 0.5 except light (≤ 0.35, ivory) and physical; never a reserved threat hue (§5.1) at saturation > 0.6 within 15 m of an enemy |
| **R7 Determinism** | Signature shapes (glyphs, petal counts, crystal layouts, bolt branch counts) are seeded per `castId`, not random puffs; randomness only in accents |
| **R8 Camera & ducking** | Every player FX material goes through `vfx.applyPlayerFx` (§5.4): per-vertex/per-instance fade by view depth smoothstep(1.5, 4.0), ×0.3 within 1.0 m of the camera→player segment, and the threat ducking. Spell *objects* (ice pillar, walls, tornado, phoenix) use the same rule. These are readability rules; they are not counted as performance gains |
| **R9 Bloom** | Bloom threshold 1.0: only cores and thin lines exceed it. Nothing persistent (zones, buffs, auras) exceeds 0.9 linear |
| **R10 Cost & depth** | ≤ 6 extra draw calls per cast, 0 new materials per cast, per-cast coverage and particles per tier (§1.4). Detail comes from **meshes and SDF lines**, not particle count. **Every player-owned FX object has `depthWrite:false`** and renders in the transparent pass (alpha 1 for "solid" rocks/crystals; convex shapes, back-face culled; FM pools sort live instances back-to-front when ≤ 64) so player FX never enter `sceneDepth` and never soft-occlude telegraphs |
| **R11 Enemy style** | Enemy-owned effects (`owner:'enemy'`) use a distinct style implemented by vfx: **dark core (`fx.dark`) + thin element rim (`fx.mid`)**, never `ramp.hi` glints, never the rune-circle / glyph-band look, never a reserved threat hue (`#FF2A3D`, `#FFD23A`, `#FF2BD6`, punish/safe colours); markers for enemy attacks are tells decals, not sigils |

### 3.2 Element ramps v4 (core writes them into `src/core/elements.js` as `colors.fx = {hi, light, mid, dark}`)

Legacy field mapping (all elements): `colors.mid := fx.mid`, `colors.hex := fx.mid`, `colors.core := fx.hi`, `colors.edge := fx.dark` — **except shadow**, whose "inverted value" look keeps
`colors.core := fx.dark` and `colors.edge := fx.light` (as v3 `0x1a0b2e` / `0xb14bff`). Core updates the `tools/playtest3/core.js:123-125` assertions to the new values in the same commit.

| Element | hi (glint / thin core only) | light | **mid (body)** | dark (edge/outline) | Notes |
|---|---|---|---|---|---|
| 화염 fire | `#FFE08A` | `#FFA53A` | `#F0661A` | `#7A1E0A` | orange body, deep-red only as low-value edge (threat crimson is reserved) |
| 빙결 ice | `#E8FBFF` | `#8FDCF5` | `#2F8FD6` | `#12325E` | |
| 번개 lightning | `#F4ECFF` | `#B49BFF` | `#7048FF` | `#241052` | afterglow decays to `mid` |
| 바람 wind | `#E6FFF4` | `#8FEFCB` | `#2FA88A` | `#0F4A3E` | ducked inside safe zones (mint safe cue) |
| 물 water | `#E3F6FF` | `#5AB8F0` | `#1F6FB8` | `#0A2A55` | |
| 대지 earth | `#F0D8B0` | `#B08458` | `#6A4A2A` | `#2A1A0E` | "solid" toon, never additive |
| 자연 nature | `#F0FFC8` | `#9BE060` | `#2F8A3A` | `#12301A` | dark edge always (green on grass) |
| 빛 light | `#FFF8E6` | `#F4EAD0` | `#E8D9B0` | `#5A4A2A` | **ivory**, saturation ≤ 0.35 on every step below `hi`; saturated gold `#FFD23A` is the reserved **parry** cue |
| 그림자 shadow | `#D6B8FF` | `#9A5CFF` | `#4A1A7A` | `#0C0614` | dark bodies with violet rims ("inverted value"), never additive violet haze |
| physical | `#F4F1EA` | `#CFC8BA` | `#8A8274` | `#2E2A24` | |

`game.elements.fx(el)` → cached `{hi, light, mid, dark}` as numbers; `game.vfx.kit.ramp(el)` → cached `THREE.Color`s.

### 3.3 Tiers and budgets

| Tier | Skills | Anticipation | Impact | Dissipation | Budget (also §1.4) |
|---|---|---|---|---|---|
| **B** basic | `*.basic` | ≤ 0.1 s small sigil/charge line | 1 glint ≤ 2 frames + ≤ 8 accents | ≤ 0.3 s, no residue | ≤ 16 particles, ≤ 4 handles, cov ≤ 0.05 |
| **C** charged | `*.charged` | grows with charge: sigil r 0.3 → 0.7 m, rotating | primary shape + ring | ≤ 0.6 s, small decal ≤ 2 s | ≤ 48 particles, ≤ 6 handles, cov ≤ 0.3 |
| **A** active | quick-slot skills incl. t4/sig | 0.12–0.25 s | primary shape | ≤ 0.6 s | ≤ 80, ≤ 8, cov ≤ 0.3 |
| **Z** zone/buff/summon (persistent part) | zones, buffs, summons, `*.sup` | as A | as A | persistent ground linework ≤ 0.35 alpha; ≤ 30 particles/s | ≤ 6 handles, cov ≤ 0.15 |
| **U** ultimate/awakened | `*.ult`, `*.awakened` | 0.6–1.0 s large rune + sky sigil (keep v3 circles) | one big shape; tinted flash ≤ 0.15 s | ≤ 0.8 s + crater/ground linework ≤ 6 s at ≤ 0.3 alpha | ≤ 150, ≤ 12, cov ≤ 1.0 |
| **F** finisher | `*.finisher` | cinematic | as U, ≤ 0.15 s flash | — | ≤ 250, cov ≤ 1.5 |

Every kit/particle spec carries the `castId` it belongs to; `vfx.debug.byCast(id)` → `{particles, handles, calls, coverage}` measures the per-cast numbers.

### 3.4 Shared kit vocabulary (vfx builds it; used by magic, melee and — in enemy style — mobs and bosses; API §7.4.3)

| Code | Primitive | Technique |
|---|---|---|
| `LW` | SDF linework: `ring`, `arc`, `poly` (n-gon), `star` (n points), `ticks`, `rays` (thin wedges), `spiral`, `crescent`, `glyph` (atlas), `dots` (dotted ring), `stipple` | one instanced ShaderMaterial (premultiplied, optional additive core), per-instance shape id/params/colours/life; screen-space minimum line width (px) via `fwidth`; **rings and arcs are tight annulus / arc-strip meshes** (inner/outer radius ± AA width), never full quads; planes `ground` (terrain-conforming via `world.heightField`), `billboard`, `oriented`; back-out scale-in, spin, erosion fade. No `hatch` and no chevrons for player FX (reserved) |
| `GL` | glyph atlas | **1024² single-channel SDF (R8, ≈ 1.3 MB)**, 4×4 cells of 256 px, generated at boot (distance transform of canvas-drawn glyphs; crispness from the SDF): 9 element sigils (fire 3-petal flame, ice snowflake-hex, lightning forked-rune, wind triple spiral, water wave-crown, earth strata-diamond, nature 5-leaf, light 8-ray star, shadow crescent-eye), hexagram, futhark band, 12-tick ring, lichtenberg, frost-hex grid, flower-5, feather |
| `FM:<el>.<shape>` | instanced toon effect mesh | `kit.registerShape` adds a geometry to its element's **merged shape atlas**; one instanced mesh per element family selects the shape per instance (vertex shader collapses the others); shared `kit.fxMaterial` (toon ramp from the 4-step ramp via a gradient attribute, emissive band ≤ 1.2, per-instance life → erosion `discard` with a 0.04 rim band in `light`, optional inverted-hull outline in `dark`); `depthWrite:false`, transparent pass, instance sort ≤ 64. **Element geometries are authored by the motif owners** (§3.5) |
| `RB` | tapered ribbon | upgrade of `vfx/trail.js`: arc-length resampling, width taper head → tail, head saturated / tail desaturated, alpha trail shorter than additive edge, fast→slow UV scroll, premultiplied, live-range uploads |
| `BT` | branching bolt | recursive midpoint displacement, 2–3 forks, core 0.06–0.12 m in `hi`, halo 0.3 m in `light`, regenerated every 2–3 frames, life 2–3 frames + 0.25 s afterglow line in `mid` |
| `SP` | accent sparks | the particle system, owner-tagged, streak/ember/petal/shard/leaf/droplet/feather/mote frames only; no `soft`/`glow`/`flare`/`puff` for player FX above tier B accents; per-particle duck factor computed on the CPU (`fxMulAt`, once per frame into an attribute); particles with factor < 0.05 are not emitted |
| `DC` | ground linework decal | `crack` (Voronoi-edge lines), `scorch` (broken concentric rings + ember stipple), `frost` (hex grid), `lichtenberg`, `ripple` (sin rings), `flower`, `rune`, `strata` — all lines/dots, ≤ 0.35 alpha, **no diagonal hatch** (V4 greps the DC kinds) |
| `SM` | smoke/dust | alpha-blended only (never additive), ≤ 0.8 s, ≤ 0.35 alpha, ≤ 1.2 m high, ≤ 12 per cast |
| `FR` | fresnel rim shell | rim-only, ≤ 2 m radius, alpha ≤ 0.35, object-space noise, never around the camera |

### 3.5 Element motifs (`kit.motif(el, kind, spec)`)

Motif kinds every element implements: `cast` (hand/weapon anticipation), `trail` (projectile body + trail), `burst` (impact at epicentre), `spark` (per-target hit),
`zone` (persistent ground pattern), `pillar` (vertical eruption), `wave` (directional sweep), `aura` (buff on an entity), `summon` (spawn flourish).
**Authoring split** (each registers with `game.vfx.kit.registerMotif(el, kind, fn)` from its own files): `magic` → fire, ice, lightning, wind, water in `src/spells/motifs/<el>.js`;
`melee` → earth, nature, light, shadow in `src/sword/motifs/<el>.js`; `vfx` → physical + the **generic fallback** (element-ramped linework) and the enemy-style variants.
When a motif is missing, `kit.motif` uses the generic fallback **and the skill's look reports `'generic'`** (a failure for skills, §1.4).

| Element | Primary shapes (FM geometry to author) | Secondary | Accents (SP) | Signature details | Never |
|---|---|---|---|---|---|
| 화염 | `flame` lathe teardrop tongues (3 sizes, 10–14 segs, soft-edged toon bands, eroded tips, base band `light`, tip `dark`, thin `hi` inner core ≤ 10 % area), `crescent` flame petals for impacts | `LW` heat-shimmer rings (thin, 2 px), `DC scorch` | ember streaks ≤ 12 rising with drag | tongues lean along motion; outline in `dark`; impact = ring of 8 petals opening in 0.2 s | full-screen orange puffs; faceted orbs; white cores; red that reads as threat crimson; hatch |
| 빙결 | `prism` hexagonal prisms (2–3 sizes, flat-shaded, inner gradient + fresnel edge line in `light`), `shard` bipyramids | `DC frost` hex grid, `LW` 6-spoke star | ≤ 10 shard glints that twinkle slowly | 6-fold symmetry everywhere; crystals grow (scale-in with overshoot) and shatter into `shard` debris | octahedron blobs, white frost floors, snow sprites as noise |
| 번개 | `BT` bolts (primary), soft plasma `orb` (no facets) for ball lightning | violet afterglow line, `DC lichtenberg` | ≤ 8 arc-crawl sparks on targets | strong zig-zag silhouette, 1–2-frame flashes only on the bolt itself | flare blobs, faceted gems, long screen flashes, purple-white dome |
| 바람 | `RB` streamlines (tapered, crisp leading edge), `crescent` air blades (thin, alpha body, `hi` leading edge) | `LW spiral` polar bands on the ground | ≤ 20 leaf flecks following the curl | polar-coordinate spirals, curved motion, everything translucent | fog walls, opaque tornado cylinders, mint puffs, upward chevrons |
| 물 | `droplet` teardrops (normal blend + highlight), wave `sheet` ribbon mesh with caustic scroll and crest line | `DC ripple`, foam `LW` rings | droplet crowns ≤ 12 | crest highlight line on every wave; foam edge separates water from ground | flat blue planes covering the screen |
| 대지 | `rock` faceted chunks with strata vertex bands, `spike` wedge spikes, `slab` strata blocks | `DC crack`, `DC strata` | chips with gravity ≤ 12; dust `SM` ≤ 0.6 s | heavy, slow, solid; cracks glow `light` only at the bottom of the line | additive dust, smooth tan cylinders, fire-coloured flashes |
| 자연 | `vine` tubes grown along splines (growth mask), `thorn` spikes, `petal` (5-petal flowers), `leaf` | `DC flower` glyph, leaf glyph ring | petal drift ≤ 16, pollen ≤ 10 | S-curves; vines grow over 0.3 s and wither (erode) | glare balls, green decals without a dark edge |
| 빛 | `ray` thin wedges/pillars (fresnel × vertical gradient, r ≤ 0.6 m), `halo` ring meshes with ticks, `feather` | `LW` halo rings with tick marks, `GL` 8-ray star | ≤ 12 slow descending motes | precise geometry, 4-point star glints, rune-circle craft, ivory not gold | domes, thick white columns, saturated gold, diamond sparkles |
| 그림자 | ink `tendril` ribbons (normal-blended near-black, `light` rim), `crescent` bites, `raven` low-poly birds (2-frame wing flap via vertex shader) | dark `SM` (darkening), violet fresnel edges | soul wisps ≤ 12 travelling inward | inverted value: dark cores with crisp violet rims (keep the shadow.ult approach) | additive violet/pink haze, magenta (reserved unblockable hue) |

### 3.6 Caster vs melee variants (binding)

| Aspect | Caster (`magic`: mage staff, ranger bow, spiritcaller totem) | Melee (`melee`: sword longsword, paladin hammer+shield, shadowblade daggers) |
|---|---|---|
| Anticipation | `motif cast`: element glyph (`GL`, r 0.35–0.6 m) at the staff tip / bow string / totem head; targeted skills add a **dotted or glyph-band rotating ring** in the element `light` step at the target (never the threat style) | weapon **charge line**: an `RB` along the blade edge in `light`→`mid` (0.08–0.2 s) + a 2-frame glyph flash at the hilt; circles only for charged and U/F |
| Release | shape travels (projectile, crawler, beam); ranger arrows carry element fletching (`FM` head + `RB` trail), spiritcaller casts echo on familiars at 50 % scale | the **slash ribbon is the primary shape**: smear arc carries the element motif on its leading edge (fire tongues, ice frost-teeth, lightning arc-crawl, wind streamline, water crest, earth chip edge, nature thorn edge, light halo ticks, shadow ink edge); alpha ≤ 0.7, rim ≤ 1.1 |
| Impact | `motif burst` at the target | per blade contact: `motif spark` (≤ 6 particles per hit); the full `burst` only on the move's final hit; ground motifs (cracks, waves, spikes) start at the weapon's impact point and run forward along the swing |
| Class nuance | staff: circle-heavy, symmetric; bow: linear, long thin trails, string glyph; totem: organic, spirits echo | longsword: wide crescent ribbons; hammer: radial ground impacts + shield rune flash (paladin defend); daggers: twin thin cuts (2 ribbons, life 0.12 s), shadow afterimages |
| Basic attack | ≤ 1 projectile shape + trail, 1 glint | smear + ≤ 6 sparks per hit, nothing persists |
| Skill-system presentation (core-owned `src/skills*`) | spiritcaller familiars (`skills/familiars.js`) and proc bursts (`skills/procs.js`) use element ramps (no `0xffffff`), carry `castId`, and play through `kit.motif(el,'spark'|'burst')` when the kit exists (core, §9 core P0b) | paladin smear/shockwave/explosion and shadowblade `impact_shadow` in `skills/classkits.js` route through `kit.motif` with the cast's `castId` (one burst per cast) (core) |

### 3.7 Per-skill look table (every castable skill)

The skill list is enumerated from the registry (`game.skills.registry`; 103 ids at HEAD). The rows below cover the named skills; a registry skill without a row inherits its
**archetype look** (the archetype's v4 implementation with the element's motifs) and must still meet its tier ceilings and floors.

**Look levels**: P0 = (a) every archetype has a v4 look built from the element motifs (so every skill is at least `'archetype'`), and (b) the **bespoke set** gets its own row-exact look in
its family: the 12 ★ skills, every `*.basic`, `*.charged` and `*.ult`, and the skills of each class's `starter_<cls>` loadout (casters: mage, ranger, spiritcaller → magic; melee: sword, paladin,
shadowblade → melee). P1 = bespoke looks for the remaining rows (awakened, finisher polish, other actives), each keeping the tier budgets.
Each row's **first key shape is its signature** (unique inside its element, §1.4).

Columns: **tier**, **A** anticipation → **I** impact → **D** dissipation (caster default), **key shapes / technique**, **melee delta** (only where the melee form differs beyond §3.6).
`hold` = persistent part. Every row obeys §3.1 and the tier budget. Skills keep their gameplay (radius, damage, hitboxes); only visuals change.
Owners: caster column → `magic`, melee column → `melee`. Rows marked ★ are in the 12-skill readability regression list (§1.7).

#### 화염 fire
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| fire.basic | 화염구 | B | 3-petal glyph at tip 0.08 s → soft toon flame body (r 0.25, thin `hi` inner core ≤ 10 % area) with 3 swept tongues + `RB` 1.2 m → crescent flare ring r 0.8 (2 frames) + 6 embers → scorch ring r 0.6, 0.4 s | FM flame, RB, LW crescent, DC scorch | combo smears with flame tongues along the leading edge, 4 embers/hit |
| fire.charged ★ | 업화의 구슬 | C | 2 counter-rotating rings at hand (r 0.3→0.7 with charge), tongues spiral inward → orb capped r 0.45 with 4 tongues; impact: thin shock ring + 8 flame petals opening outward + 12 embers → fire zone = scorch linework (concentric broken rings + ember stipple, 0.3 alpha) + ≤ 6 small tongues at the edge | no fireball haze, no FOV kick | heavy overhead slash leaves a fan of flame petals on the ground ahead |
| fire.salamander | 살라만더 | A | salamander glyph at feet 0.15 s → a head of 3 tongues crawls; trail = instanced tongues (0.4–0.6 m, staggered flicker) over a 1.2 m ember-stipple line with dark edge → tongues shrink/erode over 0.5 s at line end | FM flame instanced along path, DC scorch line | crawler starts at the blade's ground contact (upper) |
| fire.cyclone | 홍련 선풍 | A | 1 m ring with 8 ticks spinning 0.12 s → 3 flame `RB` arcs sweep 360° in 0.25 s (r 1.5→5) + thin shock ring r 5 + 12 tongues on the outer arc → arcs erode 0.4 s, 10 embers | RB, LW ring, FM flame | anchored to the spin smear |
| fire.rising | 화염 상승 | A | dotted rotating target ring r 2.5 (`light`) + crack glyph 0.2 s → column of 5 stacked tongues (3.5 m) twisting, hot band only at the base, 10 rising embers → collapses top-down 0.4 s, scorch | FM flame (scaled y), LW, DC | erupts 3 m ahead of the upper slash |
| fire.ember | 불씨 투척 | A | flick glyph → spinning soft ember seed (flame tongue curled) + thin RB → 3 tongues + ignite | FM flame small, RB | thrown from the blade tip |
| fire.phoenix | 불새 돌진 | A | wing glyph behind the player 0.12 s → bird silhouette: 2 wing RB sweeps (span ≤ 4 m) + tail RB + 12 FM feathers; path ignites grass → end: twin wing crescents, feather embers | RB, FM feather/flame; **camera-segment fade mandatory** | iaido: silhouette follows the draw-cut line |
| fire.ult | 메테오 | U | keep the meteor rune 1.0 s + small sky rune → dark strata FM rock with flame-tongue mantle + RB trail → one crisp flare ring r 7 (2 frames), shock ring, 16 radial flame petals, 24 embers, low dust ring; orange tint 0.15 s → crater: radial cracks glowing `light` at the bottom, fading 6 s at 0.3 alpha, ≤ 8 tongues | FM rock, FM flame, LW, DC crack | same |
| fire.awakened | 천체 낙하 · 각성 | U | counter-rotating double sky sigil 1 s → 6 smaller meteors, 0.25 s apart; only the last impact gets the ring+tint, others = petals + embers → one shared crater | as fire.ult | same |
| fire.finisher | 불사조 강림 | F | cinematic: phoenix built from 40 instanced FM feathers + RB tail; flash ≤ 0.15 s amber | FM feather, RB | same |
| fire.sup | 불꽃 정령 소환 | Z | flame glyph ring r 1 at feet 0.3 s → familiar = soft flame core + 3 tongues orbiting; shots = mini fire.basic | FM flame/orb | same |

#### 빙결 ice
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| ice.basic | 빙결 파편 | B | snowflake glyph 0.08 s → 3 FM shards with short frost RB → 6-spoke LW star r 0.5 (2 frames) + 6 shard debris → frost-hex decal r 0.4, 0.4 s | FM shard, LW star, DC frost | smear with frost-teeth edge |
| ice.charged | 서리 창 | C | 6 shards converge into a lance during charge → long faceted FM prism lance with fresnel edge line → crown of 6 prisms r 1.2 → prisms crack (erode) 0.5 s | FM prism | thrust: lance extends from the blade |
| ice.nova ★ | 서리 폭발 | A | hex ground glyph r 1 spinning → thin hexagonal LW ring expanding to r + 12 prisms in 2 rings (≤ 1.2 m, outward-leaning) + frost hex-grid decal → shatter to debris 0.4 s. **No white dome** | LW poly(6), FM prism, DC frost | overhead: crystals radiate in a 120° fan from the impact point |
| ice.pillar | 빙주 | A | dotted target hex ring (`light`) → cluster of 3 prisms (central 3 m) + frost decal → shatter; camera-segment transparency 0.25 | FM prism | overhead impact point |
| ice.prison | 빙결 감옥 | A | snowflake glyph above target 0.2 s → 6 prisms close in around the target (lean inward) + hex ring → shatter on break | FM prism, LW | thrust |
| ice.slide | 빙판길 | Z | lane frost-hex linework (0.35 alpha) with polished highlight streaks, tiny prisms every 2 m → melts by erosion | DC frost, FM prism small | slashR start |
| ice.glacier | 빙하 낙하 | A | large hex glyph at target → 4 m prism-cluster block slams, radial frost cracks, 8 shards → erodes 0.6 s | FM prism cluster, DC | leap slam |
| ice.ult | 빙하 송곳 | U | keep the ice ult circle → prisms erupt sequentially along the path (1.5→3 m) as a wave front + frost line → shatter in sequence | FM prism instanced, DC frost | same |
| ice.awakened | 빙하기 · 각성 | U | keep circle → 3 expanding hex rings, 24 prisms in 3 rings, ≤ 60 small snow flecks (normal blend), pale-blue tint 0.12 s | LW, FM prism, SP | same |
| ice.finisher | 영원의 겨울 | F | sky snowflake glyph + crystal-flower blossoms (prism petals) | GL, FM prism | same |
| ice.sup | 서리 반격 | Z | hex ring at feet (0.4 alpha) + 3 orbiting shards; trigger → shard burst | LW, FM shard | same |

#### 번개 lightning
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| lightning.basic | 전격 | B | 2-frame spark + forked-rune glyph → BT bolt (core 0.08 m, halo 0.3 m) hand→target, regenerated twice → afterglow line 0.25 s + 4 arc-crawl sparks; **no flare sprite** | BT, SP | thrust smear with arc-crawl edge |
| lightning.charged | 연쇄 번개 | C | 3 small BT loops crackle around the hand during charge → thicker bolts (0.12 m) with 2 forks per jump → lichtenberg decal under each target 0.5 s | BT, DC lichtenberg | charged thrust |
| lightning.mine | 뇌전 지뢰 | Z | small rune-etched disc FM + rotating dotted LW triangle on the ground (0.4 alpha) → trigger: vertical BT strike + lichtenberg | FM, LW poly(3), BT | thrust plants it |
| lightning.dash | 뇌신 질주 | A | 1 frame → one straight BT along the path + 2 afterimage silhouettes (player mesh, fresnel `mid`, 0.2 s) → 4-point star r 0.6 at the end. Removes the 225-screen flares | BT, LW star | iaido line |
| lightning.ball | 구전 | A | glyph → soft plasma orb (`mid` body, crisp `light` rim, no facets) caged by 3 orbiting BT loops, zapping nearby enemies every 0.3 s → star + lichtenberg | FM orb, BT | — |
| lightning.rod | 피뢰침 | Z | tall thin FM spike with 3 ring fins + base ring → periodic sky BT strikes (2 frames) | FM spike, BT, LW | thrust plants it |
| lightning.thunderclap | 뇌신 강림 | A | BT forks gather in the air above → thick vertical BT pillar + LW shock ring + radial lichtenberg r 4 | BT, LW, DC | leap slam |
| lightning.ult ★ | 천벌의 뇌우 | U | keep the ult circle; storm = dark LW cloud-glyph ring overhead (no cloud sprites) → vertical BT strikes (2 frames each) + lichtenberg, **≤ 2 strikes per 0.3 s**, no full-screen flash; reaction strikes use `spark` only | BT, LW, DC | same |
| lightning.awakened | 뇌신의 심판 · 각성 | U | double sky sigil → 8 strikes converge on a ring → final thick pillar + tint 0.12 s | BT, LW | same |
| lightning.finisher | 천뢰 강림 | F | thunder-god silhouette drawn in BT linework | BT | same |
| lightning.sup | 번개 가속 | Z | thin violet RB streaks trailing limbs while moving; a small crackle every 0.8 s | RB, BT tiny | same |

#### 바람 wind
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| wind.basic | 바람의 칼날 | B | triple-spiral glyph → thin spinning FM crescent blade (alpha body, `hi` leading edge) + 2 RB streamlines → 3 leaf flecks + LW crescent | FM crescent, RB | — |
| wind.charged ★ | 돌풍 | C | spiral LW at hand → 5 RB streamlines sweeping the cone on curves + one expanding LW arc front + 8 leaves → streamlines thin out 0.35 s. **No fog** | RB, LW arc | — |
| wind.vortex | 소용돌이 | Z | → polar LW spiral disc on the ground + 3 helical RB streamlines rising 3 m (0.5 alpha) + ≤ 20 circling leaves | LW spiral, RB | — |
| wind.gust ★ | 반발 돌풍 | A | → short crescent wave (LW arc + 3 RB) + 6 leaves | LW, RB | slashR |
| wind.step | 질풍 보법 | A | → 2 RB streamlines from the feet along the path + leaves | RB | iaido |
| wind.updraft | 바람 기둥 | Z | ground spiral → 3 helical RB (r 1.2, h 6, 0.45 alpha) | RB, LW | spin |
| wind.skyfall | 천공 낙하 | A | descending spiral RB → crescent shock ring + radial streak lines | RB, LW rays | plunge |
| wind.ult | 대회오리 | U | → tornado of 6 helical tapered RB (r 1→4 over 10 m) + ground spiral band + ≤ 40 leaves; walls ≤ 0.4 alpha; near-camera fade | RB, LW spiral, SP | same |
| wind.awakened | 천공의 폭풍 · 각성 | U | sky spiral sigil → 3 tornadoes (as ult, 0.7 scale) | RB, LW | same |
| wind.finisher | 천공의 눈 | F | giant storm-eye spiral in the sky + ribbons | LW, RB | same |
| wind.sup | 바람의 날개 | Z | 2 wing-shaped thin RB arcs at the shoulders + foot streaks on dodge (v3 = 135-screen overdraw) | RB | same |

#### 물 water
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| water.basic | 물방울 탄 | B | wave glyph → 3 FM droplets + tiny RB → droplet crown (6) + ripple decal | FM droplet, DC ripple | slashR smear with crest edge |
| water.charged | 해일 | C | → curling wave sheet (caustic scroll, crest line, foam LW edge, 0.6 alpha) sweeps the cone → foam rings | FM sheet, LW, DC ripple | chargeSlash: sheet launched from the blade |
| water.whirl | 물살 감옥 | Z | → 3 circular RB current loops around targets + caustic ring | RB, LW | — |
| water.spring | 치유의 샘 | Z | → slow concentric ripple rings + ≤ 12 rising droplet beads + small fountain RB | LW ring, FM droplet | — |
| water.bubble | 거품 감옥 | A | → FR bubble around the target (rim only, 0.35, iridescent hue shift `light`→`mid`) → pop: droplet crown | FR, FM droplet | — |
| water.surf | 물살 타기 | A | → wake RB pair + foam spray droplets | RB, FM droplet | iaido |
| water.clone | 신기루 분신 | Z | → clone = player silhouette with a water fresnel material (0.5 alpha) + ripple base | FR material, DC | — |
| water.whip | 물의 채찍 | A | → RB water rope with caustic scroll + droplet spray at the tip | RB, FM droplet | slashL |
| water.ult ★ | 대홍수 | U | → concentric outward wave rings (3 at a time) + foam lines + caustic disc at 0.25 alpha limited to r; visible body ≤ 4 s, then ripples only; **never > 25 % of the screen** | LW, FM sheet, DC | same |
| water.awakened | 대해일 · 각성 | U | → tall wave-wall sheet crossing the arena with a foam crest line | FM sheet, LW | same |
| water.finisher | 심해의 노래 | F | whale silhouette in ribbon lines + caustic sky ring | RB, LW | same |
| water.sup | 정화의 비 | Z | → ≤ 60 thin rain streaks (normal blend) + ripple dots | SP streak, DC ripple | same |

#### 대지 earth
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| earth.basic | 바위 탄환 | B | strata-diamond glyph → spinning faceted FM rock with strata bands → 4 chips + small crack decal | FM rock, DC crack | combo smear with chip edge |
| earth.charged ★ | 대지 창 | C | crack line runs from the player to the target during charge → 3 angled strata FM spikes erupt + chips + low dust ≤ 0.6 s / 0.3 alpha | FM spike, DC crack, SM | charged overhead: spikes from the impact point forward |
| earth.spikes | 암석 가시 | A | → sequence of strata spikes along the path + crack line (reads as stone, not fire) | FM spike instanced, DC | upper |
| earth.wall | 대지의 벽 | Z | → wall of 5 strata slabs rising with dust; camera-segment transparent | FM slab | — |
| earth.boulder | 굴러가는 바위 | A | → large strata FM rock rolling + crack trail | FM rock, DC | slashR |
| earth.steps | 돌계단 | Z | → 3 slabs rising in sequence | FM slab | overhead |
| earth.colossus | 거신의 주먹 | A | → giant rock-cluster fist rising from the ground + radial cracks | FM rock cluster, DC | overhead |
| earth.ult ★ | 대지진 | U | → radial crack decal with `light` glow at line bottoms + 3 concentric uplift rings of rock chips + low dust ring (≤ 1 m high, ≤ 0.3 alpha, ≤ 0.6 s); **no screen-wide cloud** | DC crack, FM rock, SM | same |
| earth.awakened | 대륙 붕괴 · 각성 | U | → tectonic slabs tilt up in a ring + cracks | FM slab, DC | same |
| earth.finisher | 거신 소환 | F | colossus silhouette assembled from slabs | FM slab/rock | same |
| earth.sup | 도발의 석상 | Z | → statue of stacked strata rocks with glowing rune strips + ring | FM rock, LW | same |

#### 자연 nature
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| nature.basic | 가시 사격 | B | 5-leaf glyph → 3 FM thorns (dark green, `light` edge) + petal flecks | FM thorn, SP petal | slashL smear with thorn edge |
| nature.charged | 씨앗 폭탄 | C | → seed pod FM → 5-petal flower decal + ≤ 16 petals + 2 vine curls (RB) | FM pod, DC flower, RB | chargeThrust |
| nature.roots ★ | 덩굴 속박 | Z | → 3 vine tubes per target grow along splines (0.3 s growth mask) with thorn tips + leaf glyph decal → wither (erode). **No glare balls** | FM vine, FM thorn, GL | — |
| nature.spore | 포자 구름 | Z | → ≤ 24 olive spore puffs (normal blend, ≤ 0.3 alpha, low) + mushroom-cap glyph decal | SM, GL | — |
| nature.treant | 나무정령 소환 | Z | → leaf glyph circle + vines rise and shape the treant | GL, FM vine | — |
| nature.grapple | 덩굴 끌어당기기 | A | → vine tube shoots to the target and retracts | FM vine | slashR |
| nature.podseed | 씨앗 파종 | Z | → pods (existing objects) get a leaf glyph and a sprout | GL, FM leaf | thrust |
| nature.thorngrove | 가시 숲 | Z | → row of thorn spikes wrapped in vines | FM thorn, FM vine | — |
| nature.ult | 세계수의 분노 | U | → falling seed pods bloom into 5-petal flowers, root vines erupt | FM pod/petal/vine | same |
| nature.awakened | 세계수 강림 · 각성 | U | → world-tree root ring + flower-field glyph | FM vine, GL | same |
| nature.finisher | 영원의 숲 | F | tree grown from vines | FM vine/leaf | same |
| nature.sup | 생명의 꽃 | Z | → flower glyph at feet + 3 orbiting petals | GL, FM petal | same |

#### 빛 light
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| light.basic | 광휘탄 | B | 8-ray glyph → 4-point FM star shard + thin RB → star glint (2 frames) + 4 motes | FM ray, LW star | slashR smear with halo-tick edge |
| light.charged | 심판의 기둥 | C | halo ring with ticks above the target 0.25 s → thin ray pillar (r ≤ 0.6, 0.7 alpha) + ground halo → pillar narrows to a line 0.3 s | FM ray, LW ring/ticks | chargeOver |
| light.flash ★ | 섬광 | A | → 8 thin radial LW rays from the player + expanding halo ring with ticks + star glint (2 frames); cream tint ≤ 0.1 s at 0.15. **No dome** | LW rays/ring, LW star | — |
| light.sanctuary ★ | 성역 | Z | → ground hexagram + halo linework (ivory, 0.35 alpha, lines only) + ≤ 12 descending motes. **Not a glowing sheet** | LW, GL hexagram, SP mote | — |
| light.aegis | 수호의 방패 | Z | → hex-cell FR rim (0.3) for 0.3 s, then 3 orbiting feathers | FR, FM feather | — |
| light.beacon | 빛의 표지 | Z | → crystal spire FM + vertical thin ray + ring | FM ray, LW | thrust |
| light.mirror | 빛의 거울 | Z | → hexagonal faceted mirror FM + LW frame ring | FM, LW | — |
| light.spear | 천사의 창 | A | → long FM ray lance with 2 feather fletches + RB → star + halo | FM ray/feather, RB | thrust |
| light.ult ★ | 새벽의 심판 | U | sky sigil → beam = 1 central ray (r 0.5) + 2 orbiting thin rays + halo rings descending. **No 3 m white column** | FM ray, LW | same |
| light.awakened | 아스트라의 빛 · 각성 | U | → 6 rays converge on a halo | FM ray, LW | same |
| light.finisher | 여명의 날개 | F | feather wings (instanced FM feathers) | FM feather | same |
| light.sup | 축복 | Z | → halo ring above the head + motes | LW, SP | same |

#### 그림자 shadow
| id | 이름 | tier | A → I → D | Key shapes / technique | Melee delta |
|---|---|---|---|---|---|
| shadow.basic | 그림자 화살 | B | crescent-eye glyph → near-black ink arrow with violet rim + ink RB | FM, RB | slashR smear with ink edge |
| shadow.charged | 영혼 흡수 | C | → ink tendril RB from the target to the hand, soul wisps travel inward | RB tendril, SP wisp | iaido |
| shadow.step | 그림자 걸음 | A | → ink splash decal at start and end + crescent bite | DC, FM crescent | iaido |
| shadow.hex | 그림자 낙인 | A | keep (readable): small glyph over the target | GL | — |
| shadow.reap | 영혼 수확 | A | → dark scythe crescent with violet edge sweeping the cone + inward wisps | FM crescent, SP | slashL |
| shadow.shade | 그림자 숨기 | Z | → player dither + ink wisps at the feet | SP wisp | — |
| shadow.raven | 까마귀 떼 | A | → 5 low-poly FM ravens flapping with ink RB | FM raven, RB | — |
| shadow.chains | 그림자 사슬 | A | → instanced chain links + ink | FM chain | — |
| shadow.ult | 어둠의 심연 | U | keep the dark core + crisp ring (works today) + tendrils | FM, LW, RB | same |
| shadow.awakened | 영겁의 밤 · 각성 | U | → dark sky sigil + crescent moons | LW, FM crescent | same |
| shadow.finisher | 까마귀 군주 | F | raven-lord silhouette of instanced ravens | FM raven | same |
| shadow.sup | 그림자 장막 | Z | → veil ribbons around the player | RB | same |

### 3.8 Impacts, reactions, hit feel, status visuals, enemy style (vfx)

- `preset('impact_<el>')` / `explosion_<el>` = `kit.motif(el, 'burst', {r, castId})` + ≤ 12 sparks; the 8–10-layer v3 recipe is deleted. `presets.js SZ 1.45 / LF 1.25` and `presets2.js SZ 1.35` → 1.0.
- `hitFeel(tier, pos, dir, el, {castId})`: per target = `motif spark` only; a `burst` plays once per `castId` within 0.3 s (`castId` comes from `game.nextCastId()` via the skills runtime, §7.4.1). DoT ticks: no visuals beyond a 1-particle tick.
- Reaction presets (`rx_<id>`, 49): one recipe per family rebuilt from kit (≤ 60 particles, no domes, ≤ 1 LW ring, tinted flash only for 붕괴/심판-class reactions at ≤ 0.1 s). Reaction name text is ux's (§6.9).
- `vfx.dome()` keeps its signature but renders a `LW ring` + `FR` rim ≤ 2 m; `flashSprite` capped at 1.5 m.
- `flashEntity` never clones per hit: one cached flash material set per entity (WeakMap), created at first flash, or the shared `e.flashUniform` when the entity offers it (mobmodels/bosses add it).
- Burning status / grass fire (`combat/statusfx.js`, `flameMat`): base `light`, tip `dark` at alpha 0.6 (was white base ×1.25 fading to 0); ×1.0 intensity.
- **Enemy style** (R11): every `vfx.preset/burst/motif/flashSprite` call with `owner:'enemy'` is rendered in the enemy style (dark core + `fx.mid` rim, no `hi`, no glyph circle, size ≤ 1.5 m for flashes), never ducked,
  and counted in the enemy-FX coverage budget (≤ 1.0 screens p95). Bosses replace every `runeCircle`/sigil marker for an attack with a tells decal (e.g. `kalis.js:146-210`).
- **Punish damage**: `combat/pipeline.js` multiplies damage by `e.vulnerableMul` while `game.enemyTime < e.vulnerableUntil` (set by `tells.punish`), after weakness/resist.
- **Hit metadata**: enemy hits carry `hit.attack = {id, nameKo, kind:'melee'|'projectile'|'hazard'|'surface'}`; the pipeline fills `hit.appliedStatuses` (array of status ids it applied) and passes both into `playerHurt` (§7.5).

---

## 4. Enemy v4 (models, attacks, strategy, codex)

### 4.0 Shared rules (mobs, mobmodels and bosses)

**Model contract** (mobmodels builds it for regular enemies in `src/enemies/mobs/*`; bosses build the same shape for theirs). A model factory is registered per type and returns, per instance:
```ts
EnemyModel: { root:Object3D, meshes:SkinnedMesh[] /*body, merged per material*/, proxy:SkinnedMesh /*outline + rim source, ≤ 3k*/, lod:SkinnedMesh /*≤ 3.2k, shadow caster ≤ 2k*/,
              bones:{root, spine, head, jaw?, lidL?, lidR?, armL, armR, handL, handR, weapon?, tail?: Bone[], …}, features:{face, hands, springs:n, aoVertexColors, lod},
              tellAnchors:{weapon?, head, hand?, mouth?, core?} /*Object3D*/, flashUniform:{value:number}, rimSource():SkinnedMesh[] /*≤ 2, proxy or current LOD*/,
              pose(name:'idle'|'walk'|'windup'|'hold'|'strike'|'recover'|'stagger'|'die', t:number):void, update(frameDt):void /*springs, blink, LOD switch*/, dispose():void }
```
- Geometry and materials are built **once per type** (boot or `requestIdleCallback`) and cached; instances share `BufferGeometry`/materials and clone only the skeleton. Spawn ≤ 1 ms per mob.
- Behaviour files (mobs) drive the model only through this contract (`pose`, `bones`, `tellAnchors`); v3 models are wrapped in the same contract by `models-p0a` so mobs can code against it immediately.
- `e.model` = the EnemyModel; `e.rimSource()`, `e.tellAnchor(kind)`, `e.flashUniform` forward to it.

**Model upgrade rules**
- **Rig `humanoid2`** (mobmodels, NEW `src/enemies/mobs/rig.js`; `models.js humanoid()` stays unchanged for old callers): 13 v3 bones + `jaw`, `lidL/lidR` (blink = scale-y of the lid geometry), 2 finger groups per hand (`thumb`, `fingers`), and up to 4 spring bones (ears, tail, cloth, hair, straps) driven by the existing `Spring` class in `common.js`. Shoulders, hips and knees get smooth 2-bone weights in a 6 cm band (0.5/0.5 blend) to remove gaps. Species set their own proportions (no bokoblin presets reused for lizard).
- **Budget moves**: sphere segments 16×12 → ~10×8 (toon shading hides it); spend the savings on features (faces, hands, accessories, bevels).
- **Faces**: eyes = sclera + iris + pupil + 1 highlight dot (3 tiny merged geos, glow material where species-appropriate), brows/brow ridge, a mouth line or jaw. Blink every 3–6 s (seeded). Eye group ≥ 6 px wide at 8 m on 1280×720 (scale eyes up rather than lose them).
- **Materials**: vertex colours carry AO in crevices (−25 % value), belly/underside gradients, darker extremities, and a lighter rim band on edges (+15 %). Keep the toon pipeline (`vcMat`, `vcFlatMat`); outlines via the **silhouette-only proxy mesh** (≤ 3k tris: head, torso, limbs, weapon; no small parts) instead of a full duplicate.
- **LOD** beyond 25 m (medium): ~35 % tris, no outline, glow kept; it is also the **only shadow caster** (accessories, springs, glow and eyes never cast).
- **Secondary motion**: ≥ 2 springs per mob; idle breathing; all of it runs once per frame on `lastStep` (§2.5).
- Palette rule: no body below linear luma 0.12 overall; dark species get a lighter secondary colour (muzzle, chest blaze, trim) and a rim band.

**Animation rhythm (binding for every attack of mobs and bosses)** — the "how fast" channel on the body:
anticipation (windup pose, squash ×1.15) from tell start until lock → **hold the pose 0.10–0.15 s at lock** (the body freezes at the top) → strike ≤ 0.12 s → **visible recovery/slump** for the
recovery/punish duration (weapon stuck, head low, kneel…). M1/B1 assert the hold (tracked bone angular velocity ≈ 0 for ≥ 0.1 s around lock).

**Attack rules (binding; §5.7 floors)**
- Every attack is started with `const h = game.tells.attack(e, spec)` (§7.4.4) using the attack id and numbers below; `nameKo` is read from the codex data (`src/enemies/codex.js` / `src/enemies/bosses/codex.js`), never written inline.
  `attack()` returns **null** when the enemy may not attack (punish window, off-screen melee rule, concurrency); the AI then repositions.
- **One strike latch**: the enemy calls `if (h.consumeStrike()) resolveHit()` in its update; it returns true exactly once, on the first sub-step where `game.enemyTime ≥ h.start + h.dur`. There is no `onStrike` callback.
  Fallback when `game.tells` is the stub: the stub implements the same handle on `game.enemyTime` with `windup × assist.tellMul`, and `ctx.tele` draws the fixed `vfx.telegraph` decal.
- Windups listed are **normal difficulty**; `tells` applies `assist.tellMul` (story ×1.5, easy ×1.3, hard ×0.9, never below floor ×0.9) and `e.timeMul` to both decal and state machine (one source; the v3
  bug where only the decal stretched is removed). `difficulty.telegraphMul` stays as an alias fixed at **1** so old reads cannot double-apply.
- Aim tracks until `lockAt` (default 0.35 s before the hit), then freezes; `tellCommit` fires at lock.
- **Hitbox = decal**, one implementation: every enemy hit (mobs and bosses, incl. `ctx.slam`, `ctx.meleeCheck`, `ctx.tele` users) resolves through `game.tells.hitTest(shape, pos, pad = 0.15)` or `h.contains(pos)`;
  the v3 `+radius 0.4` and the `d < 1.0` any-angle shortcut (`enemies.js:107-135`) are removed. Lunges are part of the decal shape (cone length + lunge distance, or a capsule).
- Angles everywhere are **radians, half-angle**. The legacy `tells.telegraph(o)` adapter converts the v3 full-angle degrees (`telegraph.js:128`).
- Attack metadata travels with the hit: `ctx.hitPlayer(e, {amount, …, attack:{id, nameKo, kind}})` and `ctx.slam(…, {…, attack})`.
- **Punish window** after the signature attacks: `game.tells.punish(e, dur, {mul})` (diamond sparkles + `공격 기회!` text, `punishWindow` event); damage ×`mul` is applied by `combat/pipeline.js`;
  `tells.canAttack(e)` is false during it, and the recovery pose plays for its full length.
- **Projectiles** (mobs `enemies/projectiles.js`, also used by bosses): home ≤ 0.5 s at ≤ 120°/s, then straight; mob orb speed ≤ 8 m/s, boss orb ≤ 10 m/s; enemy style (dark core + element rim) +
  `tells.projectile(orb)` ground marker; ≤ 6 enemy orbs alive (oldest fizzles); casters take an attack token; `enemies.orbEta(pos)` → seconds until the nearest orb aimed at `pos` arrives (or Infinity).
- **Concurrency**: ≤ 2 melee attackers (existing tokens) + ≤ 1 ranged cast at a time; an enemy that is **off-screen and more than 3 m from the player never starts a melee windup** (it repositions into view first;
  enforced inside `tells.attack`/`canAttack(e, {melee:true})`), independent of the off-screen arrow setting.
- **Weakness data on every enemy**: `e.weakness = [el…]`, `e.resist = {el: mul}`, `e.immune = [el…]`; the HP bar (ux) shows them after the first hit.
- `e.attacks = [{id, nameKo, tell, windup, punishDur?}]`, `e.debugAttack(id)` starts that attack now (test hook).
- Codex entry per type registered with `game.enemies.registerCodex(entries)` (§7.4.5). Korean texts below are final copy; owners may tighten wording but keep the facts.
  **Copy rules**: no windup seconds anywhere (players cannot count them, and difficulty changes them) — describe the cue instead (`빨간 영역이 가득 차기 직전`); punish durations may appear only through the
  `{punishSec}` token, filled by ux from live values; parry advice lives only in `parryKo` (shown to classes whose defend can parry, §6.11); key names only through `{dodgeKey}`, `{defendKey}`, `{jumpKey}`.

Legend for attack tables: **tell** = `danger` (red, dodge or block), `parry` (gold dashed, perfect guard → stagger), `unblockable` (pink ⚠ double rim, must dodge),
`jump` (white ⤒, jump over the travelling shockwave), `projectile` (red aim line + orb marker), `hazard` (lingering red hatch). Windup "v3 → v4" is tell-start → damage. Angles are rad, half-angle.

### 4.1 뿔도깨비 (bokoblin) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 8k body + 2.5k proxy, 2 draws + proxy): `humanoid2`; tusked under-bite jaw animated on swing and roar; brow ridge; **two distinct curved horns** with 2 ring bands each (readable from the front); 4-finger hands gripping the club; club = knotted wood with 3 bone spikes and a leather wrap; cloth loincloth + shoulder strap + belt pouch + bone necklace (merged); ear springs + loincloth spring; war-paint stripe in vertex colour; belly gradient.

| id | nameKo | tell | windup v3 → v4 | Shape (hitbox = decal) | Recovery / punish |
|---|---|---|---|---|---|
| bokoblin.swing | 몽둥이 휘두르기 | danger | 0.62 (no decal) → **0.80**, lock −0.40 | cone r 2.9 + lunge 0.6, half-angle 1.0 rad | 0.55 → 0.70 s, punish ×1.25 |
| bokoblin.leap | 도약 내려찍기 | danger | 0.5 prep + 0.75 flight → **1.25** (decal from prep start) | circle r 2.9 at landing | club stuck **1.2 s**, punish ×1.25 |

Strategy: weak **화염 ×1.3**; parry → dizzy 1.6 s; guard block → 0.6 s recoil.
**Codex** — 역할 `근접 돌격병` · 약점 `화염` · 공략 `몽둥이를 머리 위로 치켜들면 앞쪽 부채꼴 범위를 내려칩니다. 빨간 영역이 가득 차기 직전에 옆으로 피하고, 헛친 직후 몰아치세요.` · parryKo `몽둥이 휘두르기를 {defendKey}로 완벽하게 막으면 {punishSec}초 동안 기절시킬 수 있어요.`
Attacks: `몽둥이 휘두르기 — 예고: 몽둥이를 치켜듦 · 빨간 부채꼴 — 대처: 가득 차기 직전에 옆으로 {dodgeKey} 회피` · `도약 내려찍기 — 예고: 웅크린 뒤 도약 · 착지 원 — 대처: 원 밖으로 / 착지 후 {punishSec}초 동안 무방비`.

### 4.2 도깨비 주술사 (shaman) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 7k): `humanoid2` with a visible face (nose, mouth, painted brow), long-fingered hands, robe as a lathe with a **tattered hem on 2 spring strips**, hood with a feather crest, staff with a skull + feather head holding the gem inside an **orbiting ring that grows during the cast**, glyph trim in vertex colour.

| id | nameKo | tell | windup v3 → v4 | Shape | Notes / punish |
|---|---|---|---|---|---|
| shaman.orb | 저주 구슬 | projectile | 0.95 (gem sparks) → **1.0**, gem ring grows + red dashed aim line 6 m | orb r 0.5, speed 8.5 → **7.5 m/s**, homing **0.5 s** then straight | perfect block / wind reflects (×4, min 50); interrupt on hit during the cast → **dazed 1.5 s** (punish ×1.5) |
| shaman.blink | 순간이동 | — | when player < 5 m, cd 4.5–6.5 → **≥ 8 s**; 0.4 s shimmer at the destination first | — | after a blink it cannot cast for 1.0 s |

Strategy: weak **번개 ×1.3**, own element ×0.5; it takes a ranged token.
**Codex** — `원거리 술사` · 약점 `번개` · `지팡이 보석의 고리가 다 자라면 저주 구슬을 쏩니다. 구슬은 잠깐만 따라오니 옆으로 달리면 빗나가요. 시전 중에 맞히면 잠시 멍해집니다.` · parryKo `{defendKey} 완벽 방어로 구슬을 되받아칠 수 있어요.`
Attacks: `저주 구슬 — 예고: 보석 고리 · 붉은 조준선 — 대처: 옆으로 달리기` · `순간이동 — 예고: 도착 지점이 먼저 일렁임 — 대처: 일렁이는 곳으로 원거리 공격`.

### 4.3 말랑이 (chuchu) + 8 variants — mobs (behaviour) + mobmodels (model)
**Model** (≤ 4k): translucent shell (26×18 → 20×14) with the **inner core visible** (core = element glyph-shaped crystal for variants), squash-ring highlight band, mouth shapes per state (`O` on lunge, smile idle, `x x` eyes on death). Variant silhouettes: 불꽃 = ember crown of 3 flame tongues; 얼음 = 3 hex prisms on top; 전기 = 2 antenna sparks; 바람 = leaf swirl tuft; 물방울 = droplet top-knot; 새싹 = sprout with 2 leaves; 햇살 = small halo ring; 그늘 = 2 shadow horns.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| chuchu.lunge | 몸통 박치기 | danger | 0.55 → **0.75** quiver | line from body to landing (width 1.2) + circle r 1.2 at landing | lands squashed **0.8 s**, ×1.5 |
| chuchu.aura | 원소 오라 (variants) | danger | 0 → **0.5 s** body glow, every **2.0 s** (was 1.2) | circle r 1.6 | — |

Strategy: variants are immune to their own element and weak to one counter (data table `CHU_WEAK` in mobs' files): 불꽃 → 물 ×2 · 얼음 → 화염 ×2 · 전기 → 대지 ×2 · 물방울 → 번개 ×2 · 햇살 → 그림자 ×2 · 그늘 → 빛 ×2 · 바람 → 대지 ×1.5 · 새싹 → 화염 ×1.5; normal 말랑이 has none. Weak hits pop it instantly when HP ≤ 40 %.
**Codex** — `약한 점액 생물` · 약점 `상극 원소 ×2` (variants) · `몸을 부르르 떨면 몸통 박치기가 옵니다. 착지해 납작해진 동안 받는 피해가 1.5배예요. 원소 말랑이의 몸이 빛나면 주변에 오라가 터지니 잠시 떨어지세요.`

### 4.4 수렁도마뱀 (lizard) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 8.5k): new reptile rig (not bokoblin proportions): digitigrade legs, long tapered snout with a teeth row and a jaw bone, slit-pupil eyes, **4-bone tail on springs**, dorsal frill that flares on windup (spring + pose), scale-ridge vertex bands along the spine, wet-skin gradient (darker back, pale belly), bone-tipped spear with a cloth wrap, shell pauldron.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| lizard.thrust | 창 찌르기 | danger | 0.62 (lock at 0.42) → **0.80**, lock −0.40, frill flare | line 3.6 × 1.2 | spear stuck **0.7 s**, ×1.25 |
| lizard.lunge | 물살 돌진 | danger | 0.5 + flight → **0.80** to launch, decal shows the whole arc | capsule start→landing, width 1.6 (hits only along it) | lands prone 0.6 s |

Strategy: resist 물 ×0.5; weak **번개 ×1.5 while wet** (always wet in water); **빙결 freezes it in water (2 s)**; out of water it moves −30 %.
**Codex** — `수중 매복병` · 약점 `번개 (젖었을 때)` · `등지느러미가 펼쳐지면 창 찌르기가 직선으로 옵니다. 선 밖으로 비켜서고, 창이 땅에 꽂힌 동안 반격하세요. 물속에 있을 땐 얼음으로 얼리거나 번개를 쓰세요.`

### 4.5 포자 버섯병 (shroom) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 7k): cap with **gill fans underneath**, spore pores (glow material) that light up before the lob, cap on a spring bone (bounce), root-toe feet (3 per foot), moss/lichen patches in vertex colour, little stub arms with 3 fingers, sleepy eyes with lids.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| shroom.lob | 포자 투척 | projectile | 0.75 → **0.90** pore glow; landing circle visible from windup start through the 1.0 s flight | circle r 2.2 → cloud = `tells.hazard` r 2.2, 4 s | cap droop **1.0 s**, ×1.25 |
| shroom.deathCloud | 죽음의 포자 | hazard | 0 → **0.6 s** swelling | `tells.hazard` r 2.4, 3.5 s | — |

Strategy: weak **화염 ×1.5** (fire burns clouds away and ignites the cap); resist 자연 ×0.5; hitting the cap during the windup pops the sac on itself.
**Codex** — `포자 투척병` · 약점 `화염` · `갓의 구멍이 빛나면 포자 덩어리를 던집니다. 착지 원을 피하고, 붉은 빗금 구역(포자 구름)에는 들어가지 마세요. 불로 태우면 구름이 사라집니다.`

### 4.6 타락 늑대 (wolf, pack of 3) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 8k): lighter palette — slate grey-violet body `#5E5A72`, pale muzzle + chest blaze `#B9B3C8`, dark back stripe; **fur-tuft card clusters** (merged cones/cards) on neck, shoulders and tail; 3-bone tail spring; ear springs; visible fangs; larger eyes with glowing amber irises; void cracks on the flanks that pulse during the crouch; the pack **alpha** has a bigger mane and a white scar.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| wolf.bite | 돌진 물기 | danger | 0.55 (lock at 0.35) → **0.75**, lock −0.40, crouch + flank cracks pulse | line ≤ 9 × 1.3 | slides **0.8 s** after the bite, ×1.25 |

Behaviour: circle radius 6.2 → **4.5 m** (inside melee reach); one wolf attacks at a time; killing the alpha makes the others hesitate 3 s (P1; not mentioned in the codex until shipped).
Strategy: weak **빛 ×1.5** (was 1.25); resist 그림자 ×0.6.
**Codex** — `무리 사냥꾼` · 약점 `빛` · `몸을 낮추면 직선으로 돌진해 뭅니다. 화면 가장자리의 붉은 화살표를 보고 돌아서 옆으로 피하세요. 물고 난 뒤 미끄러지는 동안이 공격 기회예요.`

### 4.7 공허 망령 (wraith) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 6k): hood with a **bone mask** inside (eye glow), skeletal hands with claws, a chain wrapped around the torso (instanced links merged), robe hem as **3 spring strips** (tattered), trailing smoke `RB` (enemy-owned, dark).

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| wraith.bolt | 공허 화살 | projectile | 0.9 → **1.0** orb gather + aim line | speed 9.5 → **8 m/s**, homing 0.5 s | stays visible **1.2 s** after firing (no blink), ×1.25 |
| wraith.blink | 순간이동 | — | when player < 4.5 m, every 4–6 s → **≥ 8 s**, 0.4 s shimmer at the arrival point | — | — |

Strategy: voidShield 60 — **빛** breaks it (×1.3); resist 그림자 ×0.5; (no mask weak point: headshots exist only for bows).
**Codex** — `공허의 술사` · 약점 `빛 (보호막 파괴)` · `보랏빛 구슬을 다 모으면 발사합니다. 쏜 직후에는 잠시 도망가지 못하니 그때 공격하세요. 순간이동 전에는 도착 지점이 먼저 일렁입니다.`

### 4.8 공허 기사 (voidknight, elite) — mobs (behaviour) + mobmodels (model)
**Model** (≤ 9k): bevelled **layered pauldrons** (3 plates), plate segments with a lighter edge trim (vertex rim), rivets as merged small spheres, **tabard cloth on a spring**, glowing rune slots on sword and shield that light up per combo step (1, 2, 3), visor glow kept, armour base `#3B3550` with steel-blue trim `#8C93B8` (no black on black).

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| voidknight.combo1/2/3 | 3연격 | danger | 0.70 / **0.45** / 0.60 → **0.80 / 0.55 / 0.65**; each follow-up decal appears when the previous hit resolves; lock −0.35 | cones r 3.2 / 3.2 / 3.6, half-angle 1.0 / 0.70 / 1.0 rad | after hit 3: **1.0 s** recovery, ×1.25 |
| voidknight.slam | 내려찍기 | parry | 1.0 → **1.1**, gold glint on the blade at −0.35 | circle r 2.8 | perfect parry → **2 s** stagger |
| voidknight.bash | 방패 밀치기 | danger | **0.18 (no tell) → 0.55** shield-raise + rim; only after **2** consecutive guarded hits | cone r 2.0, half-angle 0.52 rad | knockback only (no stun) |

Strategy: frontal light hits ×0.35; **back ×1.5**; weak 빛 ×1.3; voidShield 100; break 60 → 2 s stagger.
**Codex** — `정예 · 방패 기사` · 약점 `빛 · 등 뒤` · `3연격은 부채꼴이 하나씩 차례로 표시됩니다. 금빛 점선으로 번쩍이는 내려찍기는 가득 차기 직전에 피하세요. 연달아 막히면 방패를 들어 밀쳐내니, 정면을 고집하지 말고 뒤로 돌아가세요.` · parryKo `금빛 내려찍기를 {defendKey}로 패링하면 {punishSec}초 동안 기절시킬 수 있어요!`

### 4.9 고대 바위 골렘 (golem, boss) — bosses (`src/enemies/golem.js`, new model file `src/enemies/bosses/golem_model.js`)
**Model** (2.1k → ≤ 14k): detail-2 rocks with carved rune strips (glow material in the phase colour), moss strands on springs, crack seams glowing in the phase colour (phase 2 brighter), a crystal core inside a **rock cage ring that opens when staggered**, fists as rock clusters with knuckle shards.

| id | nameKo | tell | windup v3 (p1 / p2) → v4 | Shape | Punish |
|---|---|---|---|---|---|
| golem.slam | 대지 강타 | jump | 1.15 / 0.85 → **1.2 / 1.0** (fill = slam) | circle r 7.5 fill, then a **shockwave ring** travels r 1 → 7.5 at 12 m/s (`spec.shockwave`); hit when the front passes the player and feet − ground ≤ **0.6 m** (v3 checked > 0.9 m on the impact frame) | recover 1.3 s, ×1.25 |
| golem.throw | 바위 던지기 | danger | 1.0 / 0.74 → **1.0 / 0.9** + flight 0.9–1.6 s; landing circle shown from the windup start, aim locks −0.35 before release | circle r 3.4 | — |
| golem.punch | 휩쓸기 주먹 | parry | 0.8 / 0.59 (no decal) → **1.0 / 0.85**, fist glow | cone r 8.5, half-angle 1.05 rad | fist planted **1.2 s**, cage opens: core **×2** |

Strategy: core ×2 while staggered or after the punch; resist 대지 ×0.5; poise 280 → 2.4 s stagger (cd 9).
**Codex** — `봉인의 수호자` · 약점 `수정 핵 (경직·주먹 회복 중 ×2)` · `흰 ⤒ 표시와 함께 땅을 내려치면 충격파가 바깥으로 퍼집니다. 파동이 닿기 직전에 {jumpKey}로 점프해 넘으세요. 금빛 주먹 휩쓸기를 피하면 주먹이 땅에 박혀 수정 핵이 드러납니다. 바위 투척은 착지 원이 미리 보입니다.` · parryKo `금빛 주먹을 {defendKey}로 패링해도 수정 핵이 드러나요.`
**Brief** (3 bullets): `⤒ 표시 = 퍼지는 충격파를 점프로 넘기` · `금빛 주먹을 피하거나 패링 → 수정 핵 노출` · `바위 투척: 착지 원 밖으로`.

### 4.10 삼두 물뱀 레비아탄 (hydra) — bosses
**Model** (P0: v3 mesh + §4.0 contract fields, proxy/LOD casters, slit-pupil eye glow, lifted palette; **P1 remodel** 13.1k → ≤ 32k + proxy 6k): fin frills on springs per head, eyes with slit pupils, a teeth row in each jaw, gill flaps, a scale-ridge band down each neck (instanced crest), **colour-coded head crests per element** (also the shield cue), wet sheen via a fresnel band in vertex colour.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| hydra.bite | 물어뜯기 | danger | 1.1 → **1.2**, head pulls back | line ≤ 17 × 3.2 | head lies low **2.0 s** (was 1.5), ×1.5, "공격 기회!" shimmer |
| hydra.spit | 독침 연사 | projectile | 0.7 (no decal) → **1.0** mouth glow | 3 orbs, **no homing**, aimed at predicted positions, each with a landing marker r 1.2 | — |
| hydra.tide | 해일 | danger | 1.7 → **2.0** | ring 5.5–19 m; **safe tiles (ice discs, pillar tops) drawn with `tells.safe`** | — |
| hydra.spouts | 물기둥 | danger | 1.2 / 1.55 / 1.9 (keep) | 3 circles r 2.6 | — |

Concurrency: ≤ 1 bite at a time + ≤ 1 other attack (was 2 heads at once). Camera hint `{dist:1.6, height:1.5}`. The `freeze` check gets a label (§6.10).
Strategy: head element shields ×0.3 except counters; freezing the lake makes ice discs; severing a head swaps the others' elements; body ×0.15 until phase 2.
**Codex** — `호수의 군주` · 약점 `머리마다 다름 (상극 원소)` · `머리를 뒤로 젖히면 직선 물어뜯기. 피하면 머리가 땅에 엎드리고 ◆ 공격 기회! 표시가 뜹니다. 해일이 오면 초록 안전 표시가 있는 얼음 원판이나 기둥 위로 올라가세요.`
**Brief**: `머리 볏의 색 = 그 머리의 속성 → 상극 원소로 공격` · `물어뜯기를 피하면 머리가 엎드림 → 공격 기회` · `해일: 초록 안전 표시 위로`.

### 4.11 녹스 (nox) — bosses
**Model** (4.3k → ≤ 16k): raven knight with a **beak helm** (layered plates), layered feather cloak as spring strips (6), feather pauldrons, a glowing feather blade, talon gauntlets; palette lifted: charcoal `#2E2838` + violet trim `#9A7CFF` + pale bone beak.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| nox.teleportSlash | 순간 베기 | parry | vanish 0.45 → arrival **raven-smoke marker 0.3 s in front/side of the player inside the camera view (±0.87 rad of camera forward)**, then **0.8 s** line; gold glint −0.35 | line len 7, width **1.6** (hitbox 2.6 → 1.6) | perfect parry → **2 s** stagger |
| nox.volley | 까마귀 화살 | projectile | 0.7 (no decal) → **1.0** feather-fan glow | 5 → **3** orbs (phase 2: 4), homing 0.5 s | — |
| nox.wave | 그림자 파도 | danger | 0.9 → **1.1** | cone r 7, half-angle 0.61 rad | — |

Phase 2 clone: translucent look, same tells; ≤ 1 teleportSlash active at a time. Breaking the voidShield → **3 s kneel** (punish ×1.5).
**Codex** — `그림자의 기사` · 약점 `빛 (보호막)` · `까마귀 연기와 함께 사라지면 당신 앞쪽에 연기 표식이 생기고 곧 직선 베기가 옵니다. 선 밖으로 피하세요. 빛으로 보호막을 깨면 한동안 무릎을 꿇습니다.` · parryKo `금빛 섬광에 맞춰 {defendKey}로 패링하면 {punishSec}초 동안 기절시킬 수 있어요!`
**Brief**: `사라진 뒤 연기 표식 → 직선 베기 (금빛 = 패링 가능)` · `빛으로 보호막 파괴 → 무릎 꿇음` · `까마귀 화살은 옆으로 달려 회피`.

### 4.12 모르그로스 (treant) — bosses
**Model** (3.7k → ≤ 32k): bark plates as bevelled slabs with crack lines (burnable plates glow ember-orange when burning), hanging vines and moss on springs, a glowing rot **heart behind rib-roots**, root fingers, a mushroom cluster on the shoulders, a readable face (eye hollows with glow, mouth knot). Camera hint `{dist:1.7, height:1.6}` so the arm windup is in frame.

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| treant.stomp | 짓밟기 | danger | 1.3 → **1.4** | circle r 6.5 | — |
| treant.sweep | 팔 휩쓸기 | danger | 1.4 (keep), camera pulls back | cone r 12, half-angle 1.05 rad | arm stuck **1.5 s**, arm hittable, plate damage ×2 |
| treant.roots | 뿌리 가시 | danger | 1.2 → **1.3** | 3 (phase 3: 5) lines 18 × 2.2; hitbox half-width 1.3 → **1.1** | — |
| treant.pods | 포자 꼬투리 | danger | pods glow **1.0 s** before bursting | circle r 3 | pods are a fire source |

Strategy: 화염 burns plates (×1.6); burning all 4 plates → **8 s kneel**, heart ×2.5 (keep).
**Codex** — `썩은 숲의 거목` · 약점 `화염 (껍질 판) · 심장 ×2.5` · `팔을 높이 들면 넓은 부채꼴 휩쓸기. 피한 뒤 땅에 박힌 팔을 치면 판 피해가 2배. 껍질 판 4개를 모두 태우면 무릎을 꿇고 심장이 드러납니다. 불이 없다면 포자 꼬투리를 터뜨려 불을 붙이세요.`
**Brief**: `껍질 판을 불로 태우기 (꼬투리로 점화 가능)` · `판 4개 → 무릎 꿇음 → 심장 공격` · `팔 휩쓸기 후 박힌 팔이 공격 기회`.

### 4.13 칼리스 (kalis) — bosses
**Model** (3.7k → ≤ 16k): white plate armour with a **glass-blue gradient**, a crown of facets, a cape on springs, **mirror shards orbiting him** (instanced, shiny, they crack during the punish window), spear with a mirror blade. His copied player-element effects are **enemy-owned** in the vfx enemy style (dark core + the element's `mid` rim; never crimson, gold or pink, never the player's look or rune circles).

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| kalis.slash | 돌진 베기 | danger | 0.7 → **1.0**; the decal = **capsule along the 5.5 m dash + the end cone** drawn together (`conecap`) | capsule w 1.8 + cone r 3.2, half-angle 1.0 rad | mirror armour cracks **1.0 s**, ×1.5 |
| kalis.counter | 반격 | danger | **0.15 (no tell) → 0.5**; visible "반격 자세" stance (mirror shield glows) | cone r 3, half-angle 0.44 rad | — |
| kalis.volley | 거울 화살 | projectile | 0.55 → **1.0** | 3–5 → **3** (phase 2: 4) orbs, homing 0.5 s | — |
| kalis.burst | 거울 폭발 | danger | 1.0 → **1.1** | circle r 3.4 (the v3 `runeCircle` marker is removed; the tells decal is the marker) | — |
| kalis.beams | 반사 광선 (p2) | danger | 1.1 → **1.2** | lines | — |
| kalis.check | 결정 깨기 (stagger check) | check | 10 s | the gold arena wash is replaced by a bar + 3 crystal targets | success → 4 s stagger |

**Codex** — `거울의 기사` · 약점 `따라 한 원소의 상극` · `돌진 베기는 돌진 경로와 끝의 부채꼴이 함께 표시됩니다. 돌진 직후 거울 갑옷에 금이 가 무방비가 됩니다. 거울 방패가 빛나는 '반격 자세'일 때 때리면 반격하니 공격을 멈추고 피하세요.`
**Brief**: `그가 따라 한 원소의 상극으로 공격` · `방패가 빛나면 공격 중지` · `돌진 후 갑옷에 금 → 공격 기회`.

### 4.14 니드호그라 (nidhoggra) — bosses
**Model** (P0: v3 mesh + §4.0 contract fields, proxy/LOD casters, eye-row glow, lifted palette; **P1 remodel** ≤ 60k, instanced segments): head plate with ridges and layered horns, **eye rows** (3 per side, glow), teeth, an instanced crest along the spine, wing membranes with vein linework (alpha-tested, not mist), scales with ridges (normal-mapped look via vertex colour bands).

| id | nameKo | tell | windup v3 → v4 | Shape | Punish |
|---|---|---|---|---|---|
| nidhoggra.claw | 발톱 내려찍기 | parry | 1.2 → **1.3** | circle r 5 | head sags **2.6 s** after a parry, **1.2 s** after a whiff (so non-parry classes get a window) |
| nidhoggra.breath | 공허 숨결 | unblockable | 1.5 → **1.8** | cone r 26, half-angle 0.61 rad; **root-pillar shadow wedges drawn with `tells.safe`** | — |
| nidhoggra.rain | 공허 낙하 | danger | 1.4–2.0 (min 1.4) | 4 circles r 3 | — |
| nidhoggra.rods | 피뢰침 (check) | check | 4 s (keep) | cone + 3 rings | — |
| nidhoggra.tide | 공허 해일 (check) | check | 12 s (keep) | ring | — |

Telegraph pool 16, never recycles an active decal (rods 4 + rain 4 + claw = 9 fits).
**Codex** — `공허룡` · 약점 `부위마다 잠금 (상극 원소로 해제)` · `금빛 발톱 내려찍기를 피하면 머리가 잠시 늘어집니다. 분홍색 ⚠ 숨결은 막을 수 없으니 초록 안전 표시가 있는 뿌리 기둥 뒤로 숨으세요. 하늘에서 떨어지는 공허는 원 4개 밖으로 피하세요.` · parryKo `금빛 발톱을 {defendKey}로 패링하면 머리가 {punishSec}초 동안 늘어집니다.`
**Brief**: `부위의 잠금 색 = 그 부위를 여는 상극 원소` · `⚠ 숨결: 초록 안전 표시가 있는 기둥 뒤로` · `금빛 발톱을 피하면 → 머리 공격 기회`.


### 4.15 Boss break (bosses, `bossbase.js`)
`break` on any boss becomes a real **3.5 s stagger** (no attacks, kneel/slump pose, ×1.5 damage through the punish path) with a "붕괴!" banner (event `bossBroken {boss, dur}`, ux shows it) and a cd of 12 s;
the void knight keeps its 2 s. Boss attack names are announced under the boss bar for attacks ≥ 1 s (`tellStart.nameKo`, ux).

---

## 5. Combat readability and dodge v4 ("어딜 얼마나 빠르게 때리는지")

### 5.1 Threat palette and reserved shapes (core: `src/core/threat.js` exports `THREAT`, `threatColor`)

Reserved = no player effect may use these hues at saturation > 0.6 within 15 m of an enemy, **nor these shapes anywhere** (rising chevrons, diamond sparkles, diagonal hatch, dashed rims, double rims).

| Tell | Legend text (exact, used by codex, hints and the 가이드 legend) | Rim | Dark edge | Fill | Shape signature (colour-blind safe) | Body cue | Sound (ux) |
|---|---|---|---|---|---|---|---|
| `danger` | `빨강 = 피하거나 막기` | `#FF2A3D` | `#1A0006` | `#FF2A3D` | solid rim + flat ground chevrons toward the hit direction | red rim | `tell_light` / `tell_heavy` at start, `tell_commit` at lock |
| `parry` | `금빛 = 패링할 수 있는 공격` | `#FFD23A` | `#2A1A00` | `#FF2A3D` (still dangerous) | **dashed** rim (12 dashes per circle, 1 m dashes on lines) | gold glint star on the weapon at lock | `tell_parry` "ting" at the glint |
| `unblockable` | `분홍색 ⚠ = 막을 수 없음, 반드시 회피` | `#FF2BD6` | `#22001C` | `#FF2BD6` | **double** rim + ⚠ icon above the head from windup start | pink rim | `tell_unblockable` low horn |
| `jump` | `흰색 ⤒ = 퍼지는 충격파를 점프로 넘기` | `#F4F4F4` | `#202020` | `#FF2A3D` | ⤒ icon + at the hit a **travelling shockwave ring** (12 m/s, 0.25 m band) drawn in the threat scene | white rim | `tell_jump` |
| `projectile` | `붉은 선 = 조준` | `#FF2A3D` | `#1A0006` | — | dashed-free solid aim line (6 m) + orb ground ring | gem/mouth glow | `tell_light` |
| `hazard` | `붉은 빗금 = 머물면 피해` | `#FF2A3D` @0.5 | `#1A0006` | hatch 0.18 | slow diagonal hatch, no fill front | — | — |
| `safe` | `초록 화살표 = 안전 지대` | `#C8FFE0` | `#0A3020` | `#C8FFE0` @0.12 | **rising vertical chevrons** (billboards drifting up) over a thin ring | — | — |
| `punish` | `◆ 반짝임 = 공격 기회` | `#F2FFFF` with `#0A2A30` outline | — | — | **rotating diamond sparkles** around the enemy + `공격 기회!` world text (all enemies) | recovery pose | `punish` chime |

The **lock flash** brightens the tell's own hue (+35 % value, 0.1 s), never toward white. In the last perfect window (`0.20 s × assist.perfectMul` before impact) the **time front** turns near-white `#FFF4F0`,
so "가득 차기 직전" is visible rather than guessed.
Colour-blind presets (`settings.colorblind`): `protan`/`deutan` → danger `#FF8C00`, parry `#3A8DFF`, unblockable `#FFFFFF` with black stripes; `tritan` → danger `#FF3060`, parry `#00E0C0`.
Shape signatures never change with the colour-blind preset. **Danger hue never depends on the enemy's element** (v3 "void" violet decals are gone).

### 5.2 Telegraph visual spec v4 (tells; one program for all decal shapes)

Shapes: `circle`, `ring` (inner/outer), `cone` (r, half-angle rad), `line` (len × width, from origin), `capsule` (start → end, width), `conecap` (capsule + cone at the end; Kalis).
Layers bottom → top, in the decal shader:
1. **Dark outer band**: width max(0.12 m, 3 px), alpha 0.75, `edge` colour — value contrast against bright grass/sand.
2. **Rim**: width max(0.18 m, 3 px) (`strong` emphasis: 5 px), alpha 0.95; dashed for `parry`, double for `unblockable`.
3. **Fill**: 0.16 alpha (`strong`: 0.28); `hazard` adds its hatch; directional shapes add 3 flat chevrons scrolling toward the hit direction (0.6 Hz).
4. **Time front (the "when")**: `p = (enemyTime − start) / dur` **linear**; the region behind the front fills to 0.32 alpha; the front is a 0.12 m line in a lighter rim colour (near-white in the last perfect window).
   Circles/rings fill centre → rim, cones/lines/capsules origin → tip. The front reaches the rim exactly at the hit (damage resolves the sub-step the decal completes).
5. **Lock** (at `dur − lockAt`): the rim flashes once (0.1 s, own hue brighter) and stays 1.5× thicker; aim is frozen from here.
6. **End**: at p = 1 the decal snaps to 0.5 fill for 2 frames and fades in 0.12 s. No lingering; any blink ≤ 3 Hz.

Placement: instanced per shape family; vertex shader samples `world.heightField` (§7.4.2) to conform to the terrain, lifted 0.06 m; triangle normals up **and** `DoubleSide` (the v3 mirrored-plane bug is a regression test, T1).
Fallback when `world.heightField` is absent: CPU 24×24 grids, rebuilt only when the decal moves > 0.1 m. Pool **16**, never recycles an active decal: if 16 are active the new decal is skipped but the handle still times
the attack (warn once). All decals live in `game.render.threatScene`.

### 5.3 Threat scene rules (core render path + tells content)

- Drawn after the post chain directly to the canvas (§2.4), full canvas resolution (unaffected by dynamic resolution), no bloom, no fog, no tone mapping.
- Contents: telegraph decals, enemy body rim clones, glint/icon/diamond sprites, projectile ground markers, hazard/safe zones, travelling shockwave rings, the objective beacon's ground ring (world, P1).
  **Nothing a player casts is ever in the threat scene.**
- **Decal soft occlusion**: the decal shader reconstructs the world position of the scene point behind each fragment from `sceneDepth` (`projInv`, `camWorld`, `uvScale`); it counts as an occluder only if that point is
  **more than 1.0 m above the decal plane** (enemy bodies, walls, trees, cliffs; never grass, which is < 0.85 m, nor flat ground). Occluded decal pixels draw at **40 %** alpha instead of disappearing.
  Player FX never write depth (R10), so they never occlude.
- **Body rim clones**: a `SkinnedMesh` in the threat scene built from `e.rimSource()` (≤ 2 meshes: the outline proxy or current LOD; shares geometry and skeleton via `bind(skeleton, src.bindMatrix)`),
  `matrixAutoUpdate = false`, matrix copied from the source `matrixWorld` in `tells.preOverlay()`; inverted-hull material (2–3 px, tell colour, intensity 0 → 1 over the windup, flash at lock).
  The fragment shader does a **hard depth compare** against `sceneDepth`: it draws only where the hull fragment is not behind the scene (`hullDepth ≤ sceneDepth + 0.05 m`), so the interior of the enemy's
  own body (and anything solid in front) hides it and only the outline shows — the windup pose stays visible. ≤ 4 rim clones at once (nearest by remaining time). The 40 % rule is for decals only.

### 5.4 Player-VFX ducking (vfx implements; magic, melee and player apply it to their own private materials)

`game.vfx.shared` (uniform objects shared by reference): `uPlayerFxMul` (float; recomputed by vfx every frame as `settings.fxIntensity × Π active fxFactors`), `uThreat` (`Vector4[16]` = 8 footprints × 2),
`uThreatN` (int), `uCamPos`, `uPlayerPos`.
`game.vfx.applyPlayerFx(material, {additive, role:'line'|'fill'|'particle'})` patches a material **at construction** (chains any existing `onBeforeCompile`, sets `customProgramCacheKey` = previous key + role);
it is called **for its side effect only** (`vfx.applyPlayerFx?.(m)`, never `m = …`) and **only on private player-FX materials** (never on shared caches like `core/utils toonMat` or `enemies/common glowSpriteMat`;
it warns and refuses when `material.userData.shared` is set). `game.vfx.fxMulAt(worldPos, role)` is the CPU equivalent (particles: once per frame into a per-particle attribute).
`game.vfx.fxFactor(id, mul, durReal)` multiplies `uPlayerFxMul` for `durReal` real seconds (used by witch time); it is the only way other owners change it.

The factor `m` is computed **per vertex / per instance** (never per fragment); the fragment stage only multiplies:
```
m = uPlayerFxMul                                     // settings.fxIntensity (1.0 / 0.7 / 0.4, default 1.0) × fxFactors (witch 0.6)
m *= inside any footprint (true shape: circle, ring, cone, capsule/line, safe zone; +0.5 m) ? 0.5 : 1
m *= smoothstep(1.5, 4.0, viewDepth)                 // near-camera fade (readability)
m *= (distance to camera→player segment < 1.0 m) ? 0.3 : 1
role 'line': m = max(m, 0.7 × uPlayerFxMul)          // primary linework/silhouette never below 70 % (except the near-camera fade)
alpha *= m  (additive: rgb *= m); particles/instances with m < 0.05 are not emitted / are culled
```
Footprints come from `game.tells.footprints()` (active telegraphs in their true shapes + safe zones + winding-up enemy bodies as circles r = radius + 1.0 m), 8 most relevant, refreshed every frame.
Enemy-owned FX, tells, UI and world effects are **never** dimmed. All §1.4 budgets are measured at `fxIntensity` 1.0. Bloom strength 0.40 → 0.30 while `game.enemies.aggroCount() ≥ 3` (core).

### 5.5 Enemy tells, 3 channels on every attack (tells + mobs/bosses + ux audio)

| Channel | At windup start | At lock (−0.35 s default) | At the hit | During punish |
|---|---|---|---|---|
| Ground | decal appears (§5.2) | rim flash (own hue) + thickening; front turns near-white in the perfect window | decal completes and vanishes; `jump` → shockwave ring travels | — |
| Body | anticipation pose (§4.0 rhythm), rim clone pulse, icon for unblockable/jump | **pose hold 0.10–0.15 s**; glint star at `e.tellAnchor` (gold for parry) | strike ≤ 0.12 s | recovery pose + diamond sparkles + `공격 기회!` |
| Audio | `tell_light` / `tell_heavy` / `tell_unblockable` / `tell_jump` — spatialised, **≤ 2 concurrent tell sounds** (nearest by remaining time), music ducked −3 dB while a tell targets the player | `tell_commit` tick; `tell_parry` "ting" | existing strike sfx | `punish` chime |
| UI | off-screen arrow if needed (§5.6); boss attack name under the boss bar (attacks ≥ 1 s) | arrow flashes | arrow vanishes | — |

### 5.6 Off-screen and direction indicators (ux, data from `game.tells.active()`)

- An arrow (chevron) on an ellipse at 42 % of min(w, h) from the screen centre, pointing at the attacker, for any active tell whose attacker **or** decal centroid is outside the view frustum, or behind the player within 6 m.
  Colour = tell colour; a ring around the chevron fills with `progress`; flashes at lock. Max 4 (nearest by remaining time). Appears within 1 frame of `tellStart`.
- Enemy orbs off-screen get a small dot on the same ellipse.
- **Directional damage arc** replaces the radial hurt vignette: a red arc on the screen edge toward `playerHurt.dir`, 0.6 s.
- Standing in a hazard: tinted edge vignette + a small icon with the source name ("🔥 불길 위", "☁ 포자 구름") while inside.
- The arrows are information only: whether an off-screen enemy may attack is decided by the §4.0 rule, not by this setting.

### 5.7 Timing floors (tells enforces them in `attack()`; numbers at normal difficulty)

| Class (`spec.cls`) | Minimum tell-start → hit | Aim lock before hit |
|---|---|---|
| `mobLight` / `mobHeavy` | 0.75 s / 0.85 s | ≥ 0.35 s |
| `combo` (follow-ups, each with its own decal) | 0.55 s | ≥ 0.30 s |
| `mobRanged` | 0.90 s | ≥ 0.35 s |
| `elite` | 0.80 s | ≥ 0.35 s |
| `boss` / `bossAoE` (r > 6 m) | 1.00 s / 1.20 s | ≥ 0.40 s |
| `unblockable` | 1.00 s + icon | ≥ 0.40 s |
| `check` | as authored | — |

`dur = max(windup, MIN[cls]) × assist.tellMul × (e.timeMul ?? 1)`, where `assist.tellMul` = difficulty (story 1.5, easy 1.3, normal 1.0, hard 0.9, never below floor × 0.9) × `settings.tellMul` (×1 / ×1.25 / ×1.5).
There is **no first-encounter bonus** (it would teach a rhythm that then changes); the first tell of each kind instead gets the optional teaching slow-motion (`teachSlowmo`, §6.2).
Enemy speed assist (`enemySpeed` 0.7–1.0) scales `game.enemyTime`, so enemy logic, telegraph time and projectile speed stretch together.

### 5.8 Dodge, i-frames, perfect, buffer, cancel (player; kit numbers in `src/player/kits.js`)

| Class | Dodge | i-frames v3 → **v4** | Perfect window v3 → **v4** (+0.05 s grace for all) | Other |
|---|---|---|---|---|
| mage | 점멸 blink 7 m / 0.12 s | 0.20 → **0.30** | 0.10 → **0.20** | perfect: 8 MP (keep) |
| sword | 질풍보 dashstep 6 m / 0.18 s, 2 charges | 0.25 → **0.30** | 0.10 → **0.20** | perfect: counter flurry (keep) |
| ranger | 백덤블링 backflip 6 m / 0.42 s, **toward the held movement direction** (backward when none) | 0.30 → **0.42 (whole flip)** | 0.10 → **0.20** | — |
| paladin | 방패 돌진 shieldstep 4 m | 0 (super armour 0.38) → **0.20 + super armour 0.38** | 0 → **0.15 "perfect brace"** | brace = perfect-block effects |
| spiritcaller | 정령 교대 spiritswap 5 m | 0.20 → **0.30** | 0.10 → **0.20** | decoy absorbs one hit (keep) |
| shadowblade | 그림자 구르기 shadowroll 5.5 m, 2 charges | 0.40 (keep) | 0.14 → **0.22** | perfect: teleport behind (keep) |

Every dodge moves along the held movement input when one is held (camera-relative), so "옆으로 피하세요" works for every class.

- **Perfect window mechanism** (player):
  - *Before impact*: on a dodge press, the player asks `t = min(game.tells.nextImpact(player.pos), game.enemies.orbEta(player.pos))` — `nextImpact` = the smallest `remaining` among active tells whose shape (`h.contains`)
    holds the player or that target the player. If `t ≤ perfectWin × assist.perfectMul`, the dodge is *pending-perfect*; when the i-frames then absorb that attack's hit, emit `perfectDodge`.
  - *After impact (grace 0.05 s)*: the player records the last enemy hit `{t, amount, attacker, attack, appliedStatuses}` (from `playerHurt`); a dodge pressed within 0.05 s after it **refunds the HP**,
    removes those statuses (`game.combat.clearStatus(player, id)`) and emits `perfectDodge {grace:true}`.
  - Guard/parry perfect windows 0.18/0.20 → **0.22 s** with the same pending/grace logic. Windows × `assist.perfectMul` (story 2, easy 1.4, hard 0.75, setting ×1/×1.5/×2).
- i-frames × `assist.iframeMul` (story 1.5, easy 1.25, setting ×1/×1.5/×2).
- **Input buffer 0.25 s** for the keymap actions `dodge`, `dodgeAlt`, `defend` (player reads keys only through `game.input.keymap`; the `KeyQ`/`KeyE` literals in `player.js:1122-1148` go):
  a press while the gate is closed is queued and executes on the first allowed frame; if it expires, emit `dodgeRejected {action, reason}` (ux flashes the key and plays `dodge_rejected`); `dodgeBuffered {action, waited}` on success.
  Gates: `game.player.action.dodgeCancelable` (written by melee per the rules below; read today at `player.js:1121`) and `game.spells.castLock` (seconds of non-cancellable cast recovery, magic; 0 when free).
- **Cancel rules** (melee writes `game.player.action.dodgeCancelable`; magic writes `game.spells.castLock`):
  - any basic/combo swing is dodge-cancellable during its windup (before `t0`) and from `t1` (end of its hit window) — the lock between them is ≤ 0.25 s for every swing (v3: up to 0.61 s for c4 fire);
  - charged attacks: cancellable while charging and from 0.10 s after release;
  - active skills: from 0.10 s after their first damage frame (or 0.35 s after cast start if no damage);
  - ultimates: from the first damage frame; **finishers**: not cancellable but fully invulnerable for their duration.
- **Post-hit protection**: after any non-DoT hit ≥ 12 damage, the player ignores further hits with `attack.kind === 'melee'` for 0.35 s (projectiles, hazards and surfaces still apply).
- Stamina unchanged (100, dodge 12–14, regen 30/s after 0.5 s).

### 5.9 Perfect dodge reward ("witch time", player; optional)

On a perfect dodge or perfect parry, **if** `settings.witchSlowmo` is on (default on), the dodged attack's tell targeted the player, no other tell targeting the player completes within 0.3 s of that impact,
and the last witch time ended ≥ 4 s ago: `game.timeScale.set('witch', 0.5, 0.6, {compensate:true})` (real seconds), `game.post.setGrade('witch', 0.6)` (core `GRADES.witch`: 30 % desaturation, priority below cinematics),
`game.vfx.fxFactor('witch', 0.6, 0.6)`, enemy rim clones lit. Always (even without witch time): a `완벽 회피!` / `완벽 패링!` / `완벽 방벽!` callout (ux, small, near the crosshair), `perfectDodge {attacker, witch, grace}`,
and `counterReady` for 1.2 s (the next basic attack is the class counter). Slow-motion arbitration (§2.5) allows one slow-motion source at a time.

### 5.10 Hitstop v4 (vfx `feel.js` durations, core budget §2.5)

| Tier | v3 | **v4** (per-entity unless noted) |
|---|---|---|
| light | 0.03 s + 3–4 frame floor | 0.025 s, floor only below 50 fps |
| heavy | 0.07 | 0.05 |
| crit | 0.10 | 0.06 |
| ult | 0.16 | 0.10 (global) |
| break / parry | — | 0.10 / 0.08 |
| kill (boss final blow) | — | 0.10 (global) |

Spell ticks and multi-hit ticks: no hitstop; one hitstop per `castId`. Budget ≤ 80 ms frozen per rolling second (§2.5). Melee files never call `game.hitstop`; finisher and parry feel go through `vfx.hitFeel` tiers `ult`/`parry`.

### 5.11 Camera (player)

- While ≥ 1 enemy is aggroed within 15 m: boom 5.5 → **6.6 m**, FOV +4°, shoulder offset 1.2 → 0.9 (eased over 0.6 s); out of combat it returns.
- During any boss tell: +10 % boom. Boss camera hint `e.cameraHint = {dist, height}` (hydra 1.6/1.5, treant 1.7/1.6, nidhoggra 1.5/1.4) applied while the boss is aggroed within 40 m.
- Spell objects (ice pillar, walls, rods) never jam the boom (camera collision ignores `userData.noCameraCollide`; magic/melee set it).
- Setting 카메라 거리 가까이/보통/멀리 = ×0.9 / ×1 / ×1.15. Because the boom grows, enemy detail is judged at gameplay distance (§1.5, §1.8).
- P1: soft lock-on (T or middle mouse): keeps the locked enemy in the frame's middle third; the lock ring pulses at that enemy's `tellStart`.

### 5.12 Assist options (core settings + consumers; Korean labels in §6.8)

`game.assist` (core getter, recomputed on `settingsChanged`) = `{tellMul, enemySpeed, iframeMul, perfectMul, fxIntensity, threatStrong, colorblind, flashReduce, teachSlowmo, witchSlowmo, offscreenArrows, autoRevive}`,
combining the difficulty row (§6.8) and the individual sliders (product for multipliers). Every consumer reads `game.assist` lazily each use (no caching across frames).
`autoRevive` (story) is implemented by **player** in its respawn path (`player.js:656`): revive in place with 50 % HP after 2 s instead of the respawn screen.

---

## 6. Friendliness v4 ("불친절함" → 친절함; owner ux unless tagged)

### 6.1 Onboarding flow (first 15 minutes)

| Step | v3 | v4 |
|---|---|---|
| Title → 모험 시작 | difficulty only in Settings | **difficulty cards** (이야기 / 쉬움 / 보통 / 어려움, one line each, §6.8) + **오프닝: 짧게 (약 25초) / 전체** (default 짧게 on first run); the title benchmark (§2.3) runs behind the title |
| Intro | 88.8 s, hold Space to skip | short version = 4 key shots of `cinematic/intro.js` (≈ 25 s); full stays; skip hint kept |
| Noah | 16 lore lines, 2 presses per line | **6 lines**; the rest behind the choice "옛이야기를 더 듣는다"; hold F/Space fast-forward; Esc → 대화 건너뛰기 |
| Class choice | dense cards | "입문 추천" badges on 마법사 and 성기사, ★ difficulty (마법사 ★, 성기사 ★, 궁수 ★★, 정령술사 ★★, 검사 ★★, 암살자 ★★★), one "이렇게 싸워요" line per class (below), formula numbers behind "자세히", and "레벨은 유지된 채 제단에서 언제든 바꿀 수 있어요" |
| Training | basic×5 → charged → defend → dodge → learn → quick | + **telegraph lesson**: the dummy performs a slow `danger` swing (decal visible, ×1.5 time) → `빨간 영역이 가득 차기 직전에 {dodgeKey}로 회피!` ×2; then a `parry` swing → for classes that can parry `금빛 = 패링할 수 있는 공격. 가득 차기 직전에 {defendKey}!` ×1, otherwise `금빛 공격도 {dodgeKey}로 피할 수 있어요.` ×1 (story owns the steps; the dummy's API is mobs': `dummy.practice(kind)`) |
| Tips | timed `TUT` queue (5.6 s each, stacked 3 high) | **action-gated hints**, 1 slot, each ≤ 2 shows per save (§6.2) |
| Skill points | "K 스킬 포인트 N" chip, wrong tip | on `levelUp` with unspent points: pulsing K chip + hint `unspent`; the tree glows the **추천** node |

Class one-liners (templated keys): 마법사 `멀리서 원소 마법을 쏘고, 위험하면 {dodgeKey} 점멸로 빠지세요.` · 검사 `가까이 붙어 연속 베기, 금빛 공격은 {defendKey}로 패링!` · 궁수 `거리를 두고 활을 당기세요. 공중에서 {defendKey}로 시간을 늦출 수 있어요.` ·
성기사 `방패로 막으며 버티는 수호자. 막기만 잘해도 강해요.` · 정령술사 `정령과 함께 싸우는 지원형. 소환수가 시선을 끌어 줍니다.` · 암살자 `빠르게 구르며 등 뒤를 노리는 고수용 클래스.`

### 6.2 Hint catalogue (`game.ui.hint(id, textKo, opts)`; one slot top-left under the compass; dismissed by doing the action; ≤ 2 shows per id per save (save section `hints`); off with 도움말 끔)

All `{…}` tokens are filled from `game.input.keymap` labels and the current kit (§6.11). Variant B is used when the class's defend cannot parry.

| id | Trigger (event) | Text | Done when |
|---|---|---|---|
| `move_sprint` | walked 20 m without sprint | `{sprintKey}를 누르고 있으면 달립니다.` | sprint used |
| `tell_danger` | first `tellFirst {tell:'danger'}` targeting the player | `빨간 영역이 차오르면 공격이 옵니다. 가득 차기 직전에 {dodgeKey}로 회피!` (teaching slow-mo 0.4× for 0.6 s when `teachSlowmo`) | a dodge or the hit |
| `tell_parry` | first `parry` tell | A: `금빛 = 패링할 수 있는 공격. 그 순간 {defendKey}를 누르면 패링!` · B: `금빛 = 패링할 수 있는 공격. 이 직업은 {dodgeKey}로 피하세요.` | a parry/guard/dodge |
| `tell_unblockable` | first `unblockable` | `⚠ 분홍색 경고는 막을 수 없습니다. 반드시 피하세요!` | tell end |
| `tell_jump` | first `jump` | `⤒ 표시: 원이 다 차면 충격파가 퍼져요. 파동이 닿기 직전에 {jumpKey}로 점프!` | tell end |
| `punish` | first `punishWindow` | `◆ 반짝임 = 공격 기회! 지금 몰아치세요.` | 1 hit on that enemy |
| `projectile` | first enemy orb aimed at the player | A: `구슬은 잠깐만 따라옵니다. 옆으로 달리거나 {defendKey} 완벽 방어로 되받아치세요.` · B: `구슬은 잠깐만 따라옵니다. 옆으로 달리면 빗나가요.` | orb ends |
| `front_guard` | first hit absorbed by a frontal guard | `정면 방어 중! 뒤로 돌아가 공격하세요.` | back hit |
| `offscreen` | first off-screen arrow | `화면 가장자리의 화살표 = 보이지 않는 곳의 공격.` | tell end |
| `weakness` | first hit on an enemy with a weakness | `적 체력 바의 아이콘 = 약점 원소. 약점으로 공격하면 더 아파요.` | 8 s |
| `hazard` | first time inside a hazard | `붉은 빗금 구역에서는 계속 피해를 입습니다. 벗어나세요!` | leaves |
| `mp_low` | MP < 15 % in combat, once | `마력이 부족해요. 기본 공격으로 마력을 회복하세요.` — UX3 verifies that basic hits raise MP for the class; where they do not, the text is `마력이 부족해요. 잠시 기다리면 마력이 차올라요.` | MP > 40 % |
| `unspent` | levelUp with points | `{skillsKey}를 눌러 어디서든 배울 수 있어요 (초기화만 제단에서).` | a node learned |
| `equip` | first skill learned | `노드를 고른 뒤 아래 슬롯을 클릭하거나 1~4 · X · G로 장착하세요.` | equipped |
| `codex` | first encounter card shown | `{codexKey} → 도감의 몬스터 탭에서 공략을 다시 볼 수 있어요.` | codex opened |
| `legend` | first death or first pause | `위험 표시가 헷갈리면 가이드 → 위험 표시 읽는 법을 보세요.` | guide opened |

Rules: never during cinematics/dialogue; during boss fights only the `tell_*`, `punish`, `projectile`, `hazard` hints; never stacked (queue, 1 visible).

### 6.3 Objective waypoints

- world: `world.setBeacon(pos|null, {kind:'quest'|'camp'|'boss'})` — a thin vertical light pillar (unlit, 40 m, alpha fades within 15 m of the player and when the target is reached) + a ground ring; ≤ 2 draw calls; the compass keeps its marker.
- story (ux) sets the beacon on every `questStart` and objective step; camps point at the **entrance**, not the centre (world exposes `world.camps[i].entrance` — P1 for world; ux falls back to the centre).
- Objective panel gets a second "how" line per step (story `quests.js`), e.g. updraft: `불씨 항아리를 깨거나 풀에 불을 붙이고 → 불 위에서 점프 → {jumpKey} 길게`; camps: `입구는 나침반의 깃발 방향`; shrines: `{interactKey}로 조사`.
- P1: breadcrumb dots every 4 m along a navigable path; "목표까지 안내" toggle.

### 6.4 Help / guide (pause menu → **가이드** tab; P0; opens automatically at the first pause)

Sections: **핵심 조작** (from the keymap: 이동 · 시점 · 점프 · 달리기 · 회피 · 방어 · 공격 · 1~4 스킬 · X 궁극기 · 상호작용; the rest under "고급");
**위험 표시 읽는 법** — the §5.1 legend with **real rendered thumbnails** of each tell kind (`game.tells.renderThumb(kind, 160)` → dataURL via `game.render.snapshot`; filled once and cached), each with its exact legend text;
**회피와 방어** (timing diagram: `영역이 가득 차기 직전 = 완벽 회피` with the near-white front shown; class-correct parry line); **원소 반응 기초** (top 6 reactions for the class's elements, plain words, e.g. `용해: 화염 + 빙결 → 큰 피해 1회`);
**현재 목표** with its how-line; link to the 몬스터 도감. The death recap links here (`위험 표시 보기`).

### 6.5 몬스터 도감 (codex tab `몬스터`)

- Entry states: unknown (silhouette, "???") → **seen** (unlocked on first sight: name, role, 1-line tip, weak/resist icons) → **defeated** (first kill: all attacks with tell/counter, punish windows, kill count).
- Layout per entry: **model thumbnail** (P0: `game.render.snapshot(game.enemies.previewModel(type), {w:160, h:160, yaw:0.6})` once at unlock, cached as dataURL in memory; fallback coloured glyph), 역할, 약점/저항 icons,
  공략 tip, attack list `이름 — 예고 — 대처` (+ `parryKo` when the class can parry), 처치 수.
- Data: `game.enemies.codex()` (§7.4.5) — texts in §4. Unlock state persisted with `game.save.section('monsterCodex', …)` (the v3 save key `codex` keeps storing reaction discoveries; fallback without `save.section`: localStorage `aw_monster_codex_v4`, try/catch).
- **First sight** (`enemyEncounter {type, enemy, first:true, sight:true}`, emitted by mobs/bosses when an enemy of a new type is within 30 m and in view, before aggro): a one-line strip under the objective
  (`새로운 적: 도깨비 주술사 — 도감에 기록됨`). The **full 첫 조우 card** (`새로운 적 — 도깨비 주술사` + tip + weakness icons + class-correct counter) appears when that enemy dies or 3 s after combat ends, never during combat (6 s, non-blocking).
- **Boss brief** after the boss intro: a card with the 3 brief bullets of §4 (6 s or until a key), plus larger weakness icons on the boss bar.

### 6.6 Tooltips, recommended builds, auto-allocate

- Reaction chips in the tree and codex: hover → plain-words effect (data: `game.combat.reactions` names + a new `descKo` per reaction family written by ux in `src/ui/text.js`).
- Every locked node shows its reason inline ("왜 못 배우지?" from existing REASON_KO).
- **추천 path** per class = union of preset node lists in order `starter_<cls>` → `act2_<cls>` → `endgame_<cls>` (read via `game.skills?.presets ?? await import('/src/skills/trees/index.js')` guarded), ordered by tier then cost; the next learnable node glows.
- **자동 배분** toggle (default off; on for 이야기): on `levelUp`, spend points along the 추천 path through `progression.canLearn/learn`, auto-equip new actives into empty slots, toast `자동 배분: 살라만더 습득 · 2번 슬롯 장착`.
- P1: 화력 / 생존 alternative paths (ux data table), one-click 적용 at an altar.
- Equip hint text on the tree: `노드를 고른 뒤 아래 슬롯을 클릭하세요`; clicking a slot after selecting a node equips (already works; now said).

### 6.7 Death recap (replaces "쓰러졌다…")

- Data: ring buffer of the last 8 `playerHurt` events (payload §7.5: `sourceName`, `attackNameKo`, `element`, `amount`, `dot`, `time`).
- Screen: title `쓰러졌다` + line `「뿔도깨비 · 도약 내려찍기」에 쓰러졌습니다 (18 피해)`; list of the last 5 hits (`-3.1초 · 공허 망령 · 공허 화살 · 31`), DoT/hazards grouped (`불길 ×6 · 12`);
  one class-correct tip from the killer's codex attack `counterKo` (+ `parryKo` when applicable); buttons **다시 일어서기 ({confirmKey})**, **보조 기능 조정**, **몬스터 도감 보기**, **위험 표시 보기**; respawn line `부활 위치: 마을 광장`.
- After 3 deaths to the same boss: suggest `쉬움으로 바꿀까요? (언제든 되돌릴 수 있어요)` once.
- Story difficulty: no recap screen (player's `autoRevive`, §5.12); a small strip `쓰러졌지만 다시 일어섰어요 — 「…」` instead.

### 6.8 Settings v4 (core defines keys/defaults; ux builds the menu; consumers in brackets)

**Difficulty table** (core `DIFFICULTY`; mobs' `enemies/scaling.js` table gains the same `story` row; the boss check key is `checkAddSec` everywhere — `kalis.js:207` reads `checkAddSec ?? checkAdd`; `telegraphMul` stays as an alias = 1):

| id | nameKo | desc (card text) | hpMul | dmgMul | tellMul | perfectMul | iframeMul | enemySpeed | other |
|---|---|---|---|---|---|---|---|---|---|
| story | 이야기 | `이야기를 즐기고 싶다면. 적이 느리고 약하며, 쓰러져도 그 자리에서 일어납니다.` | 0.6 | 0.4 | 1.5 | 2.0 | 1.5 | 0.85 | autoRevive, checkAddSec 6, regenCombatMul 1.5, 자동 배분 on |
| easy | 쉬움 | `여유 있게. 공격 예고가 길고 완벽 판정이 넓습니다.` | 0.7 | 0.6 | 1.3 | 1.4 | 1.25 | 1.0 | checkAddSec 4 |
| normal | 보통 | `처음이라면 추천. 균형 잡힌 기본 난이도예요.` | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | — |
| hard | 어려움 | `숙련자용. 적이 강하고 판정이 엄격합니다.` | 1.3 | 1.25 | 0.9 | 0.75 | 1.0 | 1.0 | regenCombatMul 0.8 |

**Keys** (all persisted in `aw_settings_v3` with defaults; tab in brackets):

| Key | Korean label | Values (default **bold**) | Consumer |
|---|---|---|---|
| `fxIntensity` | 내 스킬 이펙트 강도 [보조 기능] | **1.0** / 0.7 / 0.4 (100 / 70 / 40 %) | vfx |
| `threatEmphasis` | 적 공격 강조 [보조 기능] | **기본** / 강함 | tells |
| `tellMul` | 공격 예고 시간 [보조 기능] | **×1** / ×1.25 / ×1.5 | tells |
| `enemySpeed` | 적 속도 [보조 기능] | **100** / 90 / 80 / 70 % | core (`enemyTime`), mobs, bosses, tells |
| `iframeMul` | 회피 무적 시간 [보조 기능] | **×1** / ×1.5 / ×2 | player |
| `perfectMul` | 완벽 회피·패링 판정 [보조 기능] | **×1** / ×1.5 / ×2 | player |
| `witchSlowmo` | 완벽 회피 슬로 모션 [보조 기능] | **켬** / 끔 | player |
| `offscreenArrows` | 화면 밖 공격 표시 [보조 기능] | **켬** / 끔 | ux |
| `teachSlowmo` | 첫 공격 슬로 모션 안내 [보조 기능] | **켬** / 끔 | tells |
| `hints` | 도움말 [보조 기능] | **켬** / 끔 | ux |
| `aimAssist` (P1) | 조준 보조 [보조 기능] | **끔** / 약 / 강 | player |
| `colorblind` | 색약 모드 [접근성] | **끔** / 적록 / 청황 | tells, ux |
| `flashReduce` | 섬광 줄이기 [접근성] | **끔** / 켬 | vfx, magic, melee, ux (cinematic) |
| `screenShake` | 화면 흔들림 [접근성] | 0–1, **0.6** | vfx |
| `uiScale` | UI 크기 [접근성] | 0.9–1.3, **1.0** (12 px floor at 1.0) | ux |
| `damageNumbers` | 데미지 숫자 [게임] | 전체 / **합산** / 끔 (v3 boolean migrates true → 합산, false → 끔) | ux |
| `cameraDist` | 카메라 거리 [게임] | 가까이 / **보통** / 멀리 | player |
| `autoAllocate` | 자동 배분 [게임] | **끔** / 켬 | ux |
| `introShort` | 짧은 오프닝 [게임] | **켬** / 끔 | ux |
| `keybinds` | 키 설정 [조작] | `{dodge:'KeyQ', defend:'KeyE', dodgeAlt:'Mouse3', …}` (`Mouse3` = mouse button index 3, "마우스 4번 버튼"; `Mouse0` = LMB) | core (keymap), ux (menu; P0: dodge, dodgeAlt, defend; P1 the full list) |
| `quality` | 그래픽 품질 [그래픽] | 낮음 / **보통** / 높음 (stored `low`/`medium`/`high`/`custom`) | core |
| `autoQuality` | 자동 품질 조절 [그래픽] | **켬** / 끔 | core |
| `dynamicRes` | 동적 해상도 [그래픽] | **켬** / 끔 | core |
| `fpsCap` | 프레임 제한 [그래픽] | **60** / 30 / 무제한 | core |
| `showFps` | FPS 표시 [그래픽] | **끔** / 켬 | ux |
| — | 렌더 해상도 [그래픽] (read-only line) | live `game.quality.renderSize()` → `1344×756` | ux |
| — | 성능 테스트 [그래픽] (button, §2.8) | — | core runner, ux screen |

### 6.9 HUD declutter (ux)

- Damage numbers: ≤ 6 visible; same-target hits within 0.4 s merge (`합산` mode); DoT numbers small grey; crit numbers keep colour. Merging uses a fixed pool (no per-frame allocation).
- Reaction names: one at a time, small, at the hit point, ≤ 0.6 s; discovery banners and level-up/area/camp banners are **queued while any enemy is aggroed** and shown 3 s after combat (boss name/phase banners excepted).
- XP gains merge into one corner counter.
- Bark box moves to the top-centre (below the boss bar); bottom 160 px is a safe zone (HP, hotbar only).
- "마력이 부족합니다" at most once per 10 s + MP bar pulse.
- Status pips on enemy bars: top 4 + "+N".
- Interact prompts hidden while aggroed unless within 2 m.
- `getBoundingClientRect` and layout reads cached (resize/menu open only).
- Pointer-lock loss after a cutscene/dialogue shows a small `클릭하여 계속` overlay instead of the pause menu.

### 6.10 Copy and glossary (ux text tables; world/player own their strings)

| Concept | Term (only this one) |
|---|---|
| Dodges | 점멸 (mage) · 질풍보 (sword) · 백덤블링 (ranger) · 방패 돌진 (paladin) · 정령 교대 (spiritcaller) · 그림자 구르기 (shadowblade) — `player/kits.js` names + `story/script3.js` + `ui/text.js` all match |
| Defends | 마력 방벽 (mage) · 막기 (sword) · 방패 막기 (paladin) · 정령 결계 (spiritcaller) · 반격 자세 (shadowblade) · 집중 (ranger) |
| Perfect callouts | `완벽 회피!` · `완벽 패링!` · `완벽 방벽!` (replaces `PERFECT BARRIER / PERFECT PARRY`) |
| Camps | `서쪽/동쪽/북쪽 뿔도깨비 야영지` (world `terrain.js:34-36`, replaces 보코블린) |
| Ice spirit | 빙결의 글라시아 (Noah line: replace 냉기의) |
| Boss checks (`HUD_KO.check`, exact) | `stagger` → `빈틈 만들기 — 큰 피해를 몰아넣으세요` · `rods` → `피뢰침 — 번개 머리를 먼저 공격` · `tide` → `해일 — 초록 안전 표시 위로 올라가세요` · `freeze` (new) → `빙판 생성 — 지금 머리를 공격하세요` · `kalis` → `결정 깨기 — 빛나는 결정 3개를 부수세요` |
| Key names | core `KEY_NAMES_KO.codex` = `도감` (was `원소 도감`); the 도감 has tabs `원소` and `몬스터` |
| Jargon | `택1` → `둘 중 하나`, `T3` → `3단계`, `수정자` → `강화`, `핵심` → `핵심 특성` (tree UI) |
| Break | `붕괴!` (boss break banner), `공격 기회!` (punish) |

### 6.11 Templated, class-aware copy (ux `src/ui/text.js` `fmtKo(text, ctx)`)

- Tokens: `{dodgeKey}`, `{defendKey}`, `{jumpKey}`, `{sprintKey}`, `{interactKey}`, `{skillsKey}`, `{codexKey}`, `{confirmKey}` → `game.input.keymap.label(action)` (Korean key labels, rebinding-safe);
  `{dodgeName}`, `{defendName}` → the current kit names (§6.10); `{punishSec}` → `(attack.punishDur × e.timeMul ÷ assist.enemySpeed).toFixed(1)` from live values.
- **Can-parry rule**: `canParry = kit.defend.type ∈ {barrier, guard, shield, counter}` and its perfect window > 0 (mage, sword, paladin, shadowblade). Ranger (`focus`) and spiritcaller (`ward`, `perfect: 0`) cannot:
  for them every `parryKo` line is hidden and hint variant B is used. Generic fallback when a string needs a verb the class lacks: `피하세요`.
- Codex/hint/card strings never contain literal key names (`Q`, `E`, `Space`, `Tab`) — UX3 greps the data tables.

---

## 7. Binding technical contract

### 7.1 Owners and files (disjoint; **any file not listed below belongs to core**)

| Owner | Files (exclusive) |
|---|---|
| **core** | `index.html`, `src/main.js`, `src/core/*` (NEW `core/post4.js`, `core/quality.js`, `core/gpu.js`, `core/threat.js`, `core/bench.js`), `src/skills.js` + `src/skills/*` (**frozen** except the §9 core P0b items: castId stamping, familiar/proc/classkit presentation), `tools/bootcheck.js`, `tools/shot.js`, `tools/playtest.js`, `tools/playtest2.js`, `tools/playtest3.js`, `tools/playtest3/harness.js`, `tools/playtest3/core.js`, `tools/playtest3/skills.js`, `tools/playtest3/fixtures/*`, `tools/playtest4.js`, `tools/playtest4/harness.js`, `tools/playtest4/core.js`, `tools/playtest4/fixtures/*`, `ARCHITECTURE.md`, `README.md`, `PROGRESS-v2.md`, `.gitignore`, `vendor/*`, `docs/v4/PROGRESS.md`, `docs/v4/review.md`, `docs/v4/notes/core.md`, `docs/v4/requests/core.md` |
| **world** | `src/world.js`, `src/world/*`, `tools/playtest3/world.js`, `tools/playtest4/world.js`, `docs/v4/notes/world.md`, `docs/v4/requests/world.md` |
| **vfx** | `src/vfx.js`, `src/vfx/*` (NEW `vfx/kit.js`, `linework.js`, `glyphs.js`, `fxmesh.js`, `ribbon.js`, `bolt.js`, `duck.js`, `coverage.js`, `enemystyle.js`, `motifs_generic.js`), `src/combat.js`, `src/combat/*`, `tools/playtest3/combat.js`, `tools/playtest4/vfx.js`, `docs/v4/notes/vfx.md`, `docs/v4/requests/vfx.md` |
| **tells** | NEW `src/tells.js`, `src/tells/*` (`decals.js`, `shapes.js`, `body.js`, `icons.js`, `zones.js`, `timing.js`, `thumbs.js`, `text.js`), `tools/playtest4/tells.js`, `docs/v4/notes/tells.md`, `docs/v4/requests/tells.md` |
| **mobs** | `src/enemies.js`, `src/enemies/base.js`, `common.js`, `bokoblin.js`, `shaman.js`, `chuchu.js`, `lizard.js`, `shroom.js`, `wolf.js`, `wraith.js`, `voidknight.js`, `dummy.js`, `projectiles.js`, `loot.js`, `scaling.js`, `threat.js`, `encounters.js`, NEW `src/enemies/codex.js`; `tools/playtest3/enemies.js`, `tools/playtest4/mobs.js`, `docs/v4/notes/mobs.md`, `docs/v4/requests/mobs.md` |
| **mobmodels** | `src/enemies/models.js`, `src/enemies/models2.js`, NEW `src/enemies/mobs/*` (`index.js` registry, `rig.js` humanoid2, one `<type>.js` per species, `lod.js`, `proxy.js`), `tools/playtest4/mobmodels.js`, `tools/playtest4/sheets/mobs/*`, `docs/v4/notes/mobmodels.md`, `docs/v4/requests/mobmodels.md` |
| **bosses** | `src/enemies/bossbase.js`, `src/enemies/golem.js`, `src/enemies/bosses/*` (NEW `bosses/golem_model.js`, `bosses/codex.js`, `bosses/rig.js`, `bosses/models/*`), `tools/playtest4/bosses.js`, `tools/playtest4/sheets/bosses/*`, `docs/v4/notes/bosses.md`, `docs/v4/requests/bosses.md` |
| **magic** | `src/spells.js`, `src/spells/*` (NEW `spells/motifs/{fire,ice,lightning,wind,water}.js`, `spells/looks.js`), `tools/playtest3/magic.js`, `tools/playtest4/magic.js`, `tools/playtest4/sheets/caster/*`, `docs/v4/notes/magic.md`, `docs/v4/requests/magic.md` |
| **melee** | `src/sword.js`, `src/sword/*` (NEW `sword/motifs/{earth,nature,light,shadow}.js`, `sword/looks.js`), `tools/playtest3/melee.js`, `tools/playtest4/melee.js`, `tools/playtest4/sheets/melee/*`, `docs/v4/notes/melee.md`, `docs/v4/requests/melee.md` |
| **player** | `src/player.js`, `src/player/*`, `tools/playtest3/player.js`, `tools/playtest4/player.js`, `docs/v4/notes/player.md`, `docs/v4/requests/player.md` |
| **ux** | `src/ui.js`, `src/ui.css`, `src/ui/*`, `src/story.js`, `src/story/*`, `src/cinematic.js`, `src/cinematic/*`, `src/audio.js`, `src/audio/*`, `tools/playtest3/ui.js`, `tools/playtest3/narrative.js`, `tools/playtest4/ux.js`, `docs/v4/notes/ux.md`, `docs/v4/requests/ux.md` |

`docs/v4/PLAN.md` and `docs/v4/evidence/*` are read-only for every owner. `docs/v3/*` stay read-only.

### 7.2 Rules (CONTRACT v3 rules 1–11 still apply; additions)

1. **Imports.** A file statically imports only its own owner's files, `src/core/*` and `three`/`three/addons/*`. Allowed cross-owner static imports (exporter keeps every export and signature that exists at its
   last published tag — append-only; the importer reaches **new** exports only through `import * as NS from '…'` + feature detection):
   mobs `src/enemies.js` → `./enemies/golem.js` (bosses; becomes `import * as GolemMod`, calls `GolemMod.prewarmGolem?.(game)`); bosses → `../base.js`, `../common.js`, `../scaling.js` (mobs),
   `../models.js`, `../mobs/rig.js` (mobmodels); mobs behaviour files → `./models.js`, `./models2.js`, `./mobs/index.js` (mobmodels); mobmodels → `../common.js` (mobs: `Spring`, shared materials).
2. **Feature-detect every cross-owner API** in this file (`game.tells?.attack?.(…)`, `game.vfx?.kit?.line?.(…)`) and keep a working fallback. Log once per missing API.
3. **Worktrees, branches, tags.** Each owner works in `/home/user/wt4/<owner>` on branch `v4/<owner>`; core branches from `v4-polish`, every other owner from the tag `core-p0a`. Commit only your files; never push.
   Early contract tags: `core-p0a` (core), `tells-p0a` (tells), `kit-p0a` (vfx), `world-p0a` (world), `models-p0a` (mobmodels). A tag is created once with `git tag <name>` and is **immutable**: never moved,
   rebased or amended after creation (fixes are ordinary later commits; a second contract drop is a new tag `<name>.2`). Any owner may `git merge <tag>` **read-only** into its worktree at any time
   (and only tags, never another owner's branch head); it never edits merged files. The final octopus merge stays conflict-free because file sets are disjoint.
4. **No new lights**; point lights exist only when `game.render.pointLights` is true (decided at boot). **No program-key flips** after creation; colour/element variation through uniforms or attributes, never `defines`;
   every new material is returned from the owner's `warmup()`/`prewarm()` or warmed with `game.render.warm`.
5. **No `0xffffff` effect colours** and no emissive multiplier > 1.2 in `src/vfx*`, `src/combat*`, `src/spells*`, `src/sword*`, `src/tells*`, `src/skills*`, `src/enemies*` (grep check in each owner's playtest4 section;
   UI/DOM colours exempt; the threat palette lives only in `core/threat.js` and `src/tells*`).
6. **Korean text** in data tables only: `src/ui/text.js`, `src/enemies/codex.js`, `src/enemies/bosses/codex.js`, `src/tells/text.js` (world text such as `공격 기회!`), `src/story/*`, kit names in `src/player/kits.js`, world name tables, core `settings`/keymap label tables.
   Attack specs read `nameKo` from the codex tables. Player-facing strings use the §6.11 tokens instead of literal key names.
7. Notes in `docs/v4/notes/<owner>.md`; requests to other owners in `docs/v4/requests/<owner>.md` (each owner creates its own two files).
8. **P0 before P1** inside every task; a slipped P1 leaves a working fallback.
9. Owners update their **own** playtest3 section when a v4 change intentionally alters behaviour it asserted, using the expectations of §7.9, and say so in their notes.
10. **Per-frame code** follows §2.7 (no allocation, reused return objects, live-range uploads, `matrixAutoUpdate = false` on static objects); visual-only work runs once per frame on `game.frame.lastStep` (§2.5).
11. **Persistence** only through `game.save.section(name, {serialize, load})`. Reserved names: tells `tells`, ux `hints` and `monsterCodex`, mobs `encounters`. The v3 snapshot keys (incl. `codex` = reaction discoveries) are unchanged.
12. `vfx.applyPlayerFx` is called only for its side effect and only on private player-FX materials (§5.4).

### 7.3 Load order, frame order, boot

- `ORDER = ['world', 'vfx', 'combat', 'tells', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui']`; `FILES.tells = ['./tells.js', 'createTells']`.
- **Core stubs** (`core/stubs.js`, all in `core-p0a`):
  - `tells` stub = the full §7.4.4 surface with `isStub:true`: `attack(e, spec)` → a real handle timed on `game.enemyTime` (`dur = max(windup, MIN[cls]) × assist.tellMul × (e.timeMul ?? 1)`, `consumeStrike`, `contains`, `progress`, `remaining`, `locked`),
    `hitTest(shape, pos, pad)` (circle/ring/cone/line/capsule/conecap in rad half-angles — the reference geometry; T3 asserts the real tells matches it on 10,000 random points), `canAttack(e)` (punish window only),
    `nextImpact(pos)`, `windup`, `punish` (sets `e.vulnerableUntil/Mul` + emits `punishWindow`), `projectile/hazard/safe` → `{stop(){}}`, `active()` → reused empty array, `footprints()` → `{data:Float32Array(64), n:0}`,
    `telegraph:null`, `renderThumb:null`, `update(){}`, `preOverlay(){}`. `vfx.telegraph` forwards to `game.tells.telegraph` only when it exists and `!game.tells.isStub`.
  - `vfx` stub: `NOT_FX` gains `kit`, `shared`, `applyPlayerFx`, `fxMulAt`, `fxFactor`, `debug` (so they read as absent and feature detection works).
- Before any factory: core creates `game.render` (incl. `threatScene`, `overlayCamera`, `warm`, `snapshot`), `game.post` uniforms (incl. `sceneDepth`), `game.quality`, `game.assist`, `game.enemyTime = 0`, `game.frame`,
  `game.save.section`, `game.nextCastId`, `game.input.keymap` (plus everything v3 created).
- **Frame** (`playing`): `timeScale.update(realDt)` once → per step (n ≤ 2, §2.5): `game.enemyTime += dt × assist.enemySpeed` (not while a global hitstop holds), `game.frame.lastStep = (step === n − 1)`, then
  `player → stats.update → spells → sword → skills → enemies → combat → story → cinematic` → once per frame: `world → tells → vfx → ui → audio` → render: composer (main, bloom, final) → `tells.preOverlay()` → threat scene.
  (`tells` runs before `vfx` so `footprints()` are current for the ducking uniforms.)
- Boot: all `init()`s → boss/look prewarms → `renderer.compileAsync` during the title → real warm draws (§2.5) → title benchmark (§2.3).

### 7.4 APIs

#### 7.4.1 core
```ts
game.render: { tier:'integrated'|'discrete'|'unknown', rendererName:string, msaa:0|4, pointLights:boolean, shadowType:'basic'|'pcf'|'pcfsoft',
               threatScene:THREE.Scene /*no background, no fog*/, overlayCamera:THREE.PerspectiveCamera,
               warm(obj:THREE.Object3D, {target?:'scene'|'overlay'}?): void,          // idempotent per material
               snapshot(obj:THREE.Object3D, {w, h, yaw?, pitch?, dist?, scene?:'scene'|'threat'}): Promise<string /*dataURL*/> }
game.quality: { level:0..5, preset:'low'|'medium'|'high'|'custom', scale:number, renderSize():{w, h},
                budget:{ particleMul, coverageMul, flareMul, fxDetail:0|1|2, enemyOutlineDist, enemyLodMul, floraMul, grassMul, shadowEvery, bloom:boolean, particleCap },
                set(level, reason?), lock(on:boolean), history(): {t, level, reason}[], benchmark({seconds}): Promise<BenchResult> }
game.post += { sceneDepth:{value:DepthTexture}, uvScale:{value:Vector2}, sceneRes, cameraNear, cameraFar, projInv:{value:Matrix4}, camWorld:{value:Matrix4}, bloomTex, bloomStrength(v),
               setGrade(id:'witch'|'cinematic'|…, strength:number, {priority?, durReal?}) }   // GRADES.witch added; direct legacy writes to post.grade = cinematic priority
game.assist (getter; §5.12) ; game.enemyTime (enemy-speed-scaled game seconds) ; game.frame: {step, n, lastStep, frameDt}
game.timeScale.set(id, scale, durReal, {compensate?:boolean, priority?:number}) ; game.timeScale.comp()   // honours every compensate:true entry
game.hitstop(seconds, {tier?:'light'|'heavy'|'crit'|'ult'|'break'|'parry'|'kill', target?:entity})   // per-entity, budgeted §2.5
game.nextCastId(): number          // the skills runtime stamps ctx.castId before perform and puts it in the skillCast payload
game.save.section(name, {serialize():any, load(data):void}): void
game.elements.fx(el) → {hi, light, mid, dark}   // numbers; §3.2 (shadow core/edge special case)
import { THREAT, threatColor } from 'src/core/threat.js'   // threatColor(kind, colorblind) → {rim, edge, fill}
game.input.keymap: { get(action), rebind(action, code), label(action) /*Korean key label*/ }  // actions: dodge, dodgeAlt ('Mouse3'), defend, jump, sprint, interact, skills, codex, confirm …; persisted in settings.keybinds
game.settings: keys §6.8; DIFFICULTY gains 'story' and the §6.8 columns (+ telegraphMul alias = 1)
game.debug += governor(), perf(), hitstopLog(), overdraw(on), coverage(), tells(), forceAttack(target, attackId), lookOf(skillId, family), newMaterials(), firstDraws(), fragments()
```

#### 7.4.2 world
```ts
world.heightField: { tex:THREE.DataTexture /*R32F or HalfFloat heights*/, origin:{x, z}, size:{x, z} /*metres*/, texel:number /*metres per texel*/ }   // world-p0a
world.setBeacon(pos:Vector3|null, {kind:'quest'|'camp'|'boss'}?): void
world.camps[i].entrance?: Vector3            // P1
world.debug.setGrassVisible(on), world.debug.terrainChunks() → {total, visible}, world.debug.transparents() → number
// honours game.quality.budget (grassMul, floraMul) and game.render.pointLights; surface damage hits carry attack:{id:'surface.<kind>', nameKo, kind:'surface'}
```
Surface names: burning `불길`, mud `진흙` (no damage), cursed `저주받은 땅`, blight `오염`, void `공허`.

#### 7.4.3 vfx (+ combat)
```ts
vfx.shared: { uPlayerFxMul:{value}, uThreat:{value:Vector4[16]}, uThreatN:{value}, uCamPos:{value}, uPlayerPos:{value} }
vfx.applyPlayerFx(material, {additive?:boolean, role?:'line'|'fill'|'particle'}): void   // side effect only; private materials only; chains onBeforeCompile; sets customProgramCacheKey
vfx.fxMulAt(worldPos:Vector3, role?) → number ; vfx.fxFactor(id, mul, durReal): void
vfx.kit: {
  line(spec) → Handle            // spec: {shape:'ring'|'arc'|'poly'|'star'|'ticks'|'rays'|'spiral'|'crescent'|'glyph'|'dots'|'stipple', pos, plane:'ground'|'billboard'|'oriented',
                                 //        quat?, r, r2?, width, minPx=1.5, sides?, points?, arc?:[a0,a1], glyph?, color|el, color2?, alpha=0.85,
                                 //        life, tIn=0.12, tOut=0.3, spin=0, scaleIn='backOut'|'linear', erode=false, additiveCore=0, role='line', owner='player', castId?, follow?:Object3D}
  registerShape(name:'<el>.<shape>', geometry, {blend:'solid'|'alpha'|'premul', outline?, max=64, emissiveBand?}) → void   // adds to the element's merged shape atlas
  mesh(name, {pos, quat?, scale?, el|colors, life, tIn, tOut, erode=true, vel?, spin?, grow?, follow?, owner, castId?}) → Handle
  ribbon({points?:Vector3[], follow?:Object3D, width, taper=1, life, el|colors, headSat=1, tailSat=0.3, uvSpeed, owner, castId?}) → Handle & {push(p)}
  bolt({from, to, forks=2, width=0.08, halo=0.3, life=0.05, afterglow=0.25, el, seed?, owner, castId?}) → Handle
  spark(pos, el, n=8, dir?, {owner, castId}?) ; decal(kind, pos, r, life, {el, alpha<=0.35, rot, castId}?) → Handle
  glyph(name) → {tex, uv:[u0,v0,u1,v1]} ; GLYPHS: string[]
  ramp(el) → {hi, light, mid, dark}: THREE.Color ; fxMaterial(opts) → Material (cached by key)
  registerMotif(el, kind, fn:(spec, kit) => Handle|Handle[]|void) ; motif(el, kind, spec /*incl. castId, owner*/) → Handle|null ; hasMotif(el, kind) → boolean
  tier(code:'B'|'C'|'A'|'Z'|'U'|'F') → {particles, handles, coverage, flashMax, flashAlpha}
}
Handle: { alive:boolean, stop(fade=true), setPos(v), setDir(v), setScale(s), setAlpha(a) }
vfx.hitFeel(tier, pos, dir, el, {castId?, dot?})       // ONLY combat.dealDamage calls it (unchanged rule)
vfx.burst/preset/flashSprite/… opts.owner:'player'(default)|'enemy'|'world', opts.castId   // 'enemy' → enemy style (R11)
vfx.telegraph(o) → forwards to tells.telegraph(o) when available and not the stub; else the fixed v3 decal (DoubleSide, renderOrder 30)
vfx.debug: { coverage() → {screens, byOwner:{player, enemy, world}}, byCast(id) → {particles, handles, calls, coverage}, overdraw(on), setVisible(owner, on), telegraphs() → {count, pixels?} }
combat.dealDamage(target, hit)   // hit.castId?, hit.attack?:{id, nameKo, kind}; applies e.vulnerableMul during punish windows; fills hit.appliedStatuses; playerHurt payload §7.5
combat.clearStatus(entity, id)
```

#### 7.4.4 tells
```ts
tells.attack(e, spec) → TellHandle | null        // null while !canAttack(e, spec)
  spec: { id:string, tell:'danger'|'parry'|'unblockable'|'jump'|'projectile', nameKo?:string /*default: codex lookup by id*/,
          cls:'mobLight'|'mobHeavy'|'combo'|'mobRanged'|'elite'|'boss'|'bossAoE'|'unblockable'|'check', melee?:boolean,
          windup:number /*normal-difficulty seconds; raised to the §5.7 floor*/, lockAt?:number /*default 0.35*/, punishDur?:number,
          shape?: { kind:'circle'|'ring'|'cone'|'line'|'capsule'|'conecap', pos?:Vector3, dir?:Vector3, r?, inner?, angle? /*rad, half*/, len?, width?, end?:Vector3, follow?:boolean },
          anchor?: 'weapon'|'head'|'hand'|'mouth'|'core'|THREE.Object3D, body?:boolean /*rim clone, default true*/, icon?:boolean, sound?:boolean /*default true*/,
          targetsPlayer?:boolean /*default true*/, shockwave?:{speed:12, band:0.25, maxR} /*jump tells*/ }
  TellHandle: { id, enemy, start, dur, progress /*0..1 linear*/, remaining, locked:boolean, done:boolean, alive:boolean,
                consumeStrike():boolean /*true exactly once when enemyTime ≥ start + dur*/, contains(pos, pad = 0.15):boolean,
                setPos(v), setDir(v), setEnd(v), extend(sec), stop(reason='cancel') }
tells.hitTest(shape, pos, pad = 0.15) → boolean ; tells.canAttack(e, {melee?}?) → boolean ; tells.nextImpact(pos) → seconds (Infinity if none)
tells.windup(e, base, cls) → number ; tells.telegraph(o) → v3-compatible handle   // legacy {shape, pos, dir, r|len|width|angle(deg, full), dur, color, parryable}; converts to rad half-angle
tells.punish(e, dur, {mul = 1.25}?) ; tells.projectile(obj3d, {r = 0.6}) → {stop()} ; tells.hazard({pos, r, dur, kind, nameKo}) → {stop()} ; tells.safe({pos, r|shape, dur}) → {stop()}
tells.active() → ReadonlyArray<{enemy, id, nameKo, tell, pos:Vector3, dur, progress, remaining, onScreen:boolean, behind:boolean, targetsPlayer}>   // reused records
tells.footprints() → {data:Float32Array(64) /*8 × (x, z, kind, r, dirX, dirZ, param, len)*/, n}                                           // reused
tells.preOverlay() ; tells.renderThumb(kind, size) → Promise<dataURL> ; tells.MIN ; tells.debug: { setVisible(on), pixelsOf(handle), pool() → {active, max:16}, rims() → number }
```
Timing uses `game.enemyTime`. Strikes resolve through `consumeStrike()` (one latch); `tellEnd {reason:'strike'}` is emitted by `consumeStrike`, `{reason:'cancel'}` by `stop`. Content lives in `game.render.threatScene`.

#### 7.4.5 enemies (mobs; bosses fill the same fields for their entities)
```ts
enemies.registerCodex(entries: CodexEntry[]) ; enemies.codex() → Record<type, CodexEntry>
CodexEntry: { type, nameKo, roleKo, boss:boolean, elite:boolean, weak:{el, mul}[], resist:{el, mul}[], immune:string[], weakPointKo?, tipKo,
              briefKo?:[string, string, string], attacks:{id, nameKo, tell, tellKo, counterKo, parryKo?, punishKo?, punishDur?}[] }   // no windup seconds in any *Ko field
e.weakness:string[] ; e.resist:{[el]:mul} ; e.immune:string[] ; e.attacks:{id, nameKo, tell, windup, punishDur?}[] ; e.debugAttack(id)
e.model:EnemyModel (§4.0) ; e.rimSource() ; e.tellAnchor(kind) → Object3D ; e.flashUniform ; e.timeMul ; e.cameraHint? (bosses) ; e.vulnerableUntil, e.vulnerableMul (set by tells.punish) ; e.hitstopUntil
ctx.hitPlayer(e, {amount, element, knockback, launch, status, attack:{id, nameKo, kind}}) ; ctx.slam(center, r, {…, attack}, source)   // both resolve through tells.hitTest
dummy.practice(kind:'danger'|'parry') → starts a slow (×1.5) training attack   // used by story's training lesson
enemies.orbCount() → number (≤ 6) ; enemies.orbEta(pos) → seconds ; enemies.aggroCount() → number ; enemies.spawnBench?(n) → entity[] (benchmark, §2.8)
enemies.noteEncounter(type, {sight}) → {first:boolean}   // persisted in save section 'encounters'; bosses call it too
enemies.previewModel(type) → Object3D | null              // mobs forwards to mobmodels' registry; bosses register theirs via enemies.registerPreview?(type, fn)
```
Bosses add `brief: briefKo` to the `bossSpawn` payload and register `BOSS_CODEX` from `bosses/codex.js` on module load (`game.enemies.registerCodex?.(…)`).

#### 7.4.6 mobmodels
```ts
// src/enemies/mobs/index.js
export function createModel(type:string, opts:{variant?, scale?, palette?}) → EnemyModel | null   // §4.0 contract; null → caller keeps its v3 model
export function prewarm(game) → Material[] ; export function preview(type) → Object3D ; export const TYPES:string[]
export function wrapLegacy(root, opts) → EnemyModel     // models-p0a: v3 models behind the contract
```

#### 7.4.7 magic and melee
```ts
spells.lookOf(skillId) → 'bespoke'|'archetype'|'generic'|'legacy'|null ; sword.lookOf(skillId) → same     // declared level; MG1/ML1 verify it by measurement (§1.4)
// castId: ctx.castId ?? game.nextCastId() for every cast/move; passed in each hit (hit.castId) and every kit/particle spec
// spell objects: userData.noCameraCollide = true; their private materials go through vfx.applyPlayerFx
// motif files register on factory: game.vfx?.kit?.registerMotif(el, kind, fn) and kit.registerShape('<el>.<shape>', geo, opts)
game.player.action.dodgeCancelable   // written by melee per §5.8 (existing field, read at player.js:1121)
game.spells.castLock                 // seconds of non-cancellable cast recovery (magic); 0 when free
```

#### 7.4.8 player
```ts
player.kit.dodge.{iframes, perfectWin} per §5.8 ; player.counterReady:boolean ; player.camera.hint (read from enemies.boss?.cameraHint)
player.inputBuffer: {action, t} | null ; player.lastEnemyHit: {t, amount, attacker, attack, appliedStatuses} | null
// reads game.assist (iframeMul, perfectMul, witchSlowmo, autoRevive), settings.cameraDist, keys only via game.input.keymap
```

#### 7.4.9 ux
```ts
ui.hint(id, textKo, {until?:string /*event*/, maxShows=2, boss?:boolean}) ; ui.encounterStrip(type) ; ui.encounterCard(type) ; ui.bossBrief(payload) ; ui.fmtKo(text, ctx)
ui.debug: { arrows() → {id, angle, progress}[], hintVisible() → id|null, recap() → object|null, damageNumbers() → number, bannersQueued() → number, legendThumbs() → number }
audio.play(name, {pos?}) names (ux implements in src/audio/*): 'tell_light','tell_heavy','tell_parry','tell_unblockable','tell_jump','tell_commit',
  'punish','offscreen','perfect_dodge','dodge_rejected','break_boss','codex_unlock'   // unknown names are silent no-ops; tell sounds limited to 2 concurrent
```

### 7.5 Events (new and changed)

| Event | Payload | Emitter |
|---|---|---|
| `tellStart` | `{enemy, id, nameKo, tell, windup, pos, targetsPlayer}` | tells |
| `tellCommit` | `{enemy, id}` (aim locked) | tells |
| `tellEnd` | `{enemy, id, reason:'strike'\|'cancel'}` | tells |
| `tellFirst` | `{tell}` first time each tell kind is shown in a save (save section `tells`) | tells |
| `punishWindow` | `{enemy, dur, mul}` | tells |
| `enemyAttack` (extended) | `{enemy, kind, id?, nameKo?, tell?, windup?}` — still emitted by mobs/bosses at windup start | mobs, bosses |
| `enemyEncounter` | `{type, enemy, first:boolean, sight:boolean}` on first sight (≤ 30 m, in view) and on first aggro of a type per session (`first` = first in save) | mobs (bosses for bosses) |
| `bossSpawn` (extended) | `+ brief:[3 strings]` | bosses |
| `bossBroken` | `{boss, dur}` | bosses |
| `skillCast` (extended) | `+ castId` | core (skills runtime) |
| `playerHurt` (extended) | `{amount, element, source, sourceName, attackId, attackNameKo, attackKind:'melee'\|'projectile'\|'hazard'\|'surface', appliedStatuses, dot:boolean, surface?:string, dir:{x,z}, time}` | combat (vfx owner) |
| `dodgeBuffered` / `dodgeRejected` | `{action:'dodge'\|'defend', waited}` / `{action, reason:'locked'\|'stamina'\|'cooldown'}` | player |
| `perfectDodge` (existing) | `+ {attacker, witch:boolean, grace:boolean}` | player |
| `counterReady` | `{dur}` | player |
| `qualityLevel` | `{level, scale, reason}` | core |
| `hintShown` | `{id}` | ux |

### 7.6 Test URL params (core parses; `?test=1` implied)

| Param | Meaning |
|---|---|
| `quality=low\|medium\|high` | apply the preset (test mode keeps MSAA 0 unless `prod=1`) |
| `gpu=integrated\|discrete\|unknown` | override GPU tier detection |
| `prod=1` | production render settings in test (checkShaderErrors off, MSAA per preset) — **required for every §1.2 row** |
| `governor=0\|1` | governor off by default in test mode; `1` enables it |
| `budgetPx=<MP>` | override the pixel budget (C1 uses it to test resolution selection inside a ≤ 1280×720 viewport) |
| `refresh=60\|144` | governor test cadence: quantise the measured rAF delta to that refresh (C2) |
| `stub=<module>[,…]` | force the core stub for those modules (e.g. `stub=tells` for legacy telegraph checks and bootcheck) |
| `fx=1\|0.7\|0.4` | `fxIntensity` |
| `difficulty=story\|easy\|normal\|hard` | (story added) |
| `colorblind=protan\|tritan`, `threat=strong`, `hints=0`, `seed=N`, `witch=0` | settings / deterministic seed for rotations, AI and glyph seeds |

### 7.7 Debug hooks (core forwards; each owner implements its part)
`game.debug.governor()` → `{level, scale, T, misses, ema, history}` and `.simulate({frameMs, gpuMs?, refresh?})`; `perf()` → per-module median ms over the last 120 frames;
`hitstopLog()`; `overdraw(on)` → `vfx.debug.overdraw`; `coverage()` → `vfx.debug.coverage()`; `fragments()` → the `PT.fragments()` counting override (core); `tells()` → `tells.active()`;
`forceAttack(type|entity, id)` → `e.debugAttack(id)` on the nearest of that type; `lookOf(id, family)` → `spells.lookOf`/`sword.lookOf`; `newMaterials()` → count since last call; `firstDraws()` → programs drawn for the first time since last call.

### 7.8 `tools/playtest4.js` (core) and sections `tools/playtest4/<owner>.js`

Runner: `node tools/playtest4.js [owner…] [--perf] [--full] [--sheets] [--list]`; `ORDER = ['core','world','vfx','tells','mobs','mobmodels','bosses','magic','melee','player','ux']`; exit 1 on any failure.
Viewports ≤ 1280×720; F/B/C6 at 640×360; each section's default run ≤ 4 min on the 4-CPU machine (`--full`/`--perf`/`--sheets` may take longer). Harness (`tools/playtest4/harness.js`, core, in `core-p0a`):

| Helper (in page unless noted) | Does |
|---|---|
| `PT.boot(params, {w, h})` (node) | as playtest3, with viewport size; always adds `prod=1&governor=0&seed=1` unless overridden |
| `PT.scene(id)` | sets up the §1.1 scenes deterministically |
| `PT.sweep(fn)` | runs fn at 4 yaws, returns max/median |
| `PT.draws()` | `{calls, tris, shadowCalls, shadowTris, overlayCalls, transparent, additive, uploadBytes, uploads, programs}` for the last frame (wraps `renderBufferDirect`, `bufferSubData`, `bufferData`) |
| `PT.fragments({owner?})` | renders the frozen frame with a counting override (additive 1/255 per fragment into an R16F target; `discard`/alphaTest kept) and returns shaded fragments ÷ screen pixels per pass `{scene, transparent, post, player, enemy, world}` |
| `PT.rotate(cls, seconds, {cadence=0.5, ultEvery=7})` | scripted casting rotation; returns per-sample metrics `{draws, coverage, particles}` |
| `PT.simMs(frames)` / `PT.cpuFrame(frames)` | median simulation ms (render off) / whole-frame CPU ms and render-submit ms (render on, no GPU sync) |
| `PT.longFrames(seconds)` | counts frames > 33 / 50 ms and long tasks (`PerformanceObserver('longtask')`) |
| `PT.alloc(seconds)` (node, CDP) | `HeapProfiler.startSampling` → MB allocated per game-second + top allocators; GC pauses from `Tracing` |
| `PT.pixels.render()` / `.diff(toggle, {thr=25})` / `.luma()` / `.mask(objects)` / `.sobel(mask)` / `.iou(a, b)` | readPixels metrics (changed px, near-white share, saturation, object masks, crisp-edge ratio, IoU) |
| `PT.armor(e)` | test-only super armour so mobs keep attacking |
| `PT.waitEvent(name, sec)` / `PT.events(name)` | event capture with timestamps (`game.enemyTime` and `game.time`) |
| `PT.gpuRatio(sceneA, sceneB, {pairs = 5})` | frozen-frame ABAB GPU ratio with `PT.gpuSync()` (1-px readPixels), median of pair ratios |
| `PT.sheet(frames, path)` (node) | writes a contact sheet PNG (≤ 150 KB) |

**Required checks** (ids are cited by the build tasks). *Where*: **B** = must pass on the owner branch (with the tags it merged and stubs for the rest); **I** = must pass at integration (wave C); **B+I** = both.

| Id | Owner | Where | Check |
|---|---|---|---|
| C1 | core | B+I | composer chain and pass sizes (full-res passes = scene + final + overlay; bright ¼ area; first mip ≤ 1/16; 3 mips); MSAA 0 at low/medium; shadow type/size/every per §2.2; 0 point lights at medium; `budgetPx` resolution selection (unit test of `renderSize(1920, 970, 1)` ≤ 1.0 MP + a boot with `budgetPx=0.5`); resolution step: textures count unchanged, ≤ 2 ms CPU, no frame > 25 ms; threat scene drawn after FinalPass with ΔRGB ≤ 8 bloom on/off |
| C2 | core | B | governor with `simulate`: overload at `refresh=60` steps down within 1.2 s; 2-level jump at > 1.6 T; probe up after 6 s and revert on misses, backoff 6 → 12 → 24 s; works at `refresh=144`; L2 changes `quality.scale` and not the canvas size; `fpsCap` respected |
| C3 | core | B | sub-stepping: realDt 1/15 and 1/10 → game-time ratio ≥ 0.99; n ≤ 2; CPU at realDt 1/15 ≤ 1.6× one 1/60 step; `game.step` determinism unchanged; `lastStep` set on the final step only |
| C4 | core | B | hitstop: 30 light-hit requests in 1 s freeze the target ≤ 80 ms and never other enemies; an `ult` request is global and granted ≤ 0.10 s; slow-motion arbitration (one source at a time); `comp()` compensates `witch` |
| C5 | core | B | settings: every §6.8 key with its default; damageNumbers migration; `difficulty=story` sets `assist`; keymap rebind of dodge persists and `label()` follows it; `save.section` round-trips; `nextCastId` monotonic and in `skillCast`; stubs: `vfx.kit`/`shared`/`applyPlayerFx` read as undefined, tells stub handle times and hit-tests correctly |
| C6 | core | I | §1.2 aggregate at 640×360: S-*/F-*/B-* draw-call sums per the budget table (with each group's share), triangles, shadow pass, transparents, fragments, uploads, sim/submit/frame CPU, materials, programs, first draws |
| C7 | core | B | `game.quality.benchmark({seconds:3})` returns all fields and restores the game state (positions, HP, cooldowns); title benchmark picks a level |
| C8 | core | I (`--perf`) | **hard gates**: GPU ratios (F-mage ≤ 0.45, F-ranger ≤ 0.45, S-plains ≤ 0.65); long frames; allocation; transitions; 5-min soak flat |
| W1 | world | B | terrain: visible chunks ≤ 24 and < total; S-* world rows; `noTerrain` ≥ 0.80 in S-elderwood (ABAB); point lights 0 at medium; village-only meshes hidden in S-plains/S-elderwood; flora/grass distances per preset; uploads ≤ 60 KB in S-*; world transparents ≤ 0.5; `heightField` matches `getHeight` within 0.05 m; beacon ≤ 2 calls and hides within 15 m |
| V1 | vfx | B | particle caps per preset; player-FX coverage p95 ≤ 1.5 / max ≤ 2.5 in F-mage and F-ranger (with whatever looks are present); player FX ≤ 40 calls p95 (runtime collapse works); projected-size clamp; per-cast `byCast` accounting |
| V2 | vfx | B | ducking: `fxMulAt` = 1.0 default, 0.5 inside a cone/capsule/circle/safe footprint and 1.0 just outside its true shape, `role:'line'` ≥ 0.7, near-camera fade < 0.05 at 1 m, `fxFactor` composes; enemy-owned particles unaffected; patched materials keep distinct program keys |
| V3 | vfx | B | impacts: `preset('impact_<el>')` for all 9 elements and 6 reaction families: newWhite ≤ 1.5 % / 4 %, ≤ 12 sparks per per-target hit, 1 burst per castId; enemy style has no `hi` and no reserved hue; punish multiplier applied; `playerHurt` carries `attackKind` and `appliedStatuses`; new materials ≤ 4 in a 30 s F-sword run; flashEntity clones ≤ 1 set per entity |
| V4 | vfx | B | kit: every primitive renders (pixel diff > 200 px), rings are annulus meshes, linework 1 program, kit programs ≤ 6, all kit materials prewarmed, FM pools ≤ 2 calls per element; no `hatch`/chevron/diamond in player kinds (grep); grep rule 5 clean |
| T1 | tells | B | each shape alone at 8 m in S-plains with grass: ≥ 600 changed px (960×540); winding regression (triangle normal.y > 0 and DoubleSide); heightField conformance (decal within 0.1 m of terrain) |
| T2 | tells | B (with `kit-p0a` + legacy particles) / I (R-mage, R-sword, R-boss with real looks) | telegraph pixels with VFX ÷ hidden ≥ 0.95 every sample; with grass ÷ without ≥ 0.95; behind a > 1 m wall 40 % ± 5 %; rim colour bloom on/off ΔRGB ≤ 8 |
| T3 | tells | B | timing: progress linear (±0.02); `consumeStrike` true once within 1 sub-step of dur; floors per class; tellMul for story/easy/hard; enemySpeed 0.7 stretches dur ×1/0.7; `hitTest` equals the core stub's reference on 10,000 random points; `canAttack` false during punish and for off-screen melee > 3 m; pool 16 never recycles active; ≤ 3 Hz flashes; uploads ≤ 16 KB |
| T4 | tells | B | rim clone changes ≤ 15 % of the enemy interior and outlines ≥ 60 % of its perimeter; glint, icons, diamond punish sparkles, rising-chevron safe zones and the jump shockwave appear per kind; `footprints()` filled with true shapes; colour-blind palettes swap colours but keep shapes; perfect-window front turns near-white; `renderThumb` returns an image per kind |
| M1 | mobs | B (with `tells-p0a`) | for every mob attack id of §4.1–4.8 via `debugAttack`: `tellStart` precedes damage by ≥ floor; hold pose ≥ 0.1 s at lock; hitbox = decal (±0.3 m) through `tells.hitTest`; punish windows emit `punishWindow` and block attacks; orbs home ≤ 0.5 s, ≤ 6 alive, `orbEta` correct; walking sideways dodges a shaman orb; off-screen melee rule |
| M3 | mobs | B | codex: every mob type + variant complete, no windup seconds, `parryKo` separated; `enemyEncounter` on first sight once per type (persisted); weakness fields on every entity; `playerHurt` carries `attackNameKo`/`attackKind` for each mob attack; `aggroCount`; enemy-style FX only |
| MM1 | mobmodels | B | model contract for every type (incl. `wrapLegacy`); build once per type: spawn ≤ 1 ms, first sight ≤ 8 ms, shared geometry across instances; tri budgets; ≤ 3 draws (LOD ≤ 2 beyond 25 m); shadow via LOD ≤ 2k; aggregate 12-mob budget (≤ 140k + 24k shadow, ≤ 36 + 12 calls) |
| MM2 | mobmodels | B + review | `features` checklist; eye group ≥ 6 px at 8 m; outline visible on 4 sides on the Elderwood floor; wolf/voidknight/wraith body luma ≥ 0.18; turntable sheets written |
| B1 | bosses | B (with `tells-p0a`) / I | as M1 for every boss attack id of §4.9–4.14 (floors, hold pose, hitbox = decal incl. nox width 1.6, kalis conecap, treant roots 1.1, golem shockwave + y > 0.6 m jump); hydra ≤ 1 bite at a time; break → 3.5 s stagger + `bossBroken`; nox arrival marker inside the camera view; no `runeCircle` attack markers; enemy FX ≤ 1.0 screens p95 (I) |
| B2 | bosses | B + review | models: golem/nox/treant/kalis tri budgets, contract fields on all six (incl. hydra/nidhoggra v3 meshes), boss draw-call targets (mid-bosses ≤ 22, nidhoggra ≤ 40), built in `prewarmBoss`, 0 first draws in B-*; camera hints; `brief` in `bossSpawn`; codex entries complete; turntable sheets written |
| MG1 | magic | B (budgets, floors, sheets with `kit-p0a`) / I (retention) | caster family: every registry skill ≥ `'archetype'` and the bespoke set `'bespoke'` (measured status); per-tier ceilings **and** floors (§1.4) for the bespoke set + 1 skill per archetype (all with `--full`); element silhouette IoU < 0.5 per archetype; stacked 7-cast rotation ≤ 12 % near-white; 0 new materials per cast; first cast ≤ 8 ms; `castLock` correct; retention ≥ 95 % (I); contact sheets written |
| ML1 | melee | B / I (retention) | same as MG1 for the melee family; combo dodge-lock ≤ 0.25 s per swing via `player.action.dodgeCancelable`; finishers invulnerable; no `game.hitstop` in melee files |
| PL1 | player | B | kit numbers (§5.8) per class; perfect: injected tell impact at −0.18 s → pending-perfect + `perfectDodge`; injected hit then dodge at +0.04 s → HP refunded, statuses cleared, `grace:true`; buffer: dodge during sword c4-fire lock executes ≤ 0.25 s later or `dodgeRejected`; keymap-only input; witch time 0.5 × for 0.6 s real only under the §5.9 conditions and ≤ once per 4 s, off with `witch=0`; paladin brace; post-hit protection ignores melee only; dodge follows input; camera 6.6 m when aggroed; autoRevive on story; ≤ 8 scene + 4 shadow calls |
| UX1 | ux | B | death recap content (killer, attack, last 5 hits, class-correct tip, 4 buttons); codex tab lists all entries with thumbnails; first-sight strip + card after combat, once; boss brief on bossSpawn; legend with rendered thumbnails auto-opens at the first pause |
| UX2 | ux | B | ≤ 1 hint visible; no centre banners while aggroed (queued count > 0, shown after combat); ≤ 6 damage numbers; bark box rect does not intersect HP/hotbar rects; off-screen arrow within 1 frame of a tell behind the player; ≤ 2 concurrent tell sounds |
| UX3 | ux | B | settings menu contains all §6.8 keys and toggling each emits `settingsChanged`; 성능 테스트 screen; difficulty cards; dialogue fast-forward; grep: no `보코블린`/`PERFECT`, no literal key names or windup seconds in codex/hint data; `HUD_KO.check` exact strings; class-correct hint variants for all 6 classes; short intro ≤ 30 s |

`--sheets` writes the §1.8 contact sheets (magic, melee, mobmodels, bosses). `--perf` runs C8.

### 7.9 Existing tests (new expectations, written into the owning section)

| Test | v3 assertion | v4 expectation (owner) |
|---|---|---|
| `tools/playtest2.js:171,377` | hitstop ≥ 0.03 on every hit | the first hit of each `castId` logs a granted hitstop ≥ 0.025 s in `game.debug.hitstopLog()`; ticks/multi-hits log none (core) |
| `tools/playtest3/melee.js:19` | no `game.hitstop` in melee files | unchanged: melee keeps hitstop out of its files and uses `hitFeel` tiers `parry`/`ult` (melee) |
| `tools/playtest3/combat.js:423-428` | `vfx-telegraph` meshes in `game.scene`, geometry read | runs with `&stub=tells` and asserts pixels (> 500 px per shape) + pool 16 via `vfx.debug.telegraphs()`; with real tells, asserts through `tells.debug.pool()` (vfx) |
| `tools/playtest3/core.js:123-125` | v3 element colours | §3.2 values incl. the shadow special case (core) |
| `tools/playtest3/enemies.js` | v3 windups, telegraph handles, boss checks | §4 windups via `tellStart → damage`; boss expectations from `docs/v4/requests/bosses.md` (mobs) |
| `tools/playtest3/player.js` | v3 kit numbers | §5.8 numbers (player) |
| `tools/playtest3/ui.js`, `narrative.js` | TUT queue, death screen, bark position | hints/recap/bark per §6 (ux) |
| `tools/bootcheck.js` | 2 configs | + a third: `src/tells.js` renamed away → boots on the tells stub, enemies still telegraph through the fixed `vfx.telegraph`, no uncaught errors (core) |

`tools/bootcheck.js`, `tools/playtest.js`, `tools/playtest2.js`, `tools/playtest3.js` (all sections) **must keep passing** at the end of v4. The v3 perf caps (≤ 350 calls, ≤ 900k tris) remain as a floor under the stricter §1.2 targets.

### 7.10 Integration (core, wave C)

1. Octopus-merge `v4/*` into `v4-polish` (conflict-free by §7.1).
2. Append `docs/v4/notes/*.md` to ARCHITECTURE.md under `## v4 polish contract (binding)` → `### v4 module notes`; resolve `docs/v4/requests/*.md` (each request: done / rejected with reason).
3. Run bootcheck, playtest, playtest2, playtest3 (all), playtest4 (all, `--full`), `--sheets`, then `--perf` (C8 hard gates).
4. **Review gate** (§1.8): a reviewer pass over every sheet + one R-* frame per class writes `docs/v4/review.md` (pass / fix per item); fix items go back to the owning owner (re-invoked on its branch, then re-merged).
5. Record the final §1 numbers in `docs/v4/notes/core.md`, including the GPU ratios and the title-benchmark result, so the user can compare with their own 성능 테스트.

---

## 8. Resolution log (v4.0 → v4.1)

Reviews: **E** = engineering, **P** = performance, **X** = player experience. Severity C = critical, M = major, m = minor. Every finding is resolved; "partly" notes what was deliberately kept.

| Id | Sev | Finding | Resolution (section) |
|---|---|---|---|
| E1 | C | Threat overlay as a composer pass/layer 30 cannot work on r160 | separate `game.render.threatScene` (no background, no fog) drawn by core after `composer.render()` to the canvas; rim clones copy `matrixWorld`; FinalPass does sRGB output; FXAA taps tone-mapped (§2.4, §5.3) |
| E2 | C | Soft occlusion catches grass | world position rebuilt from `sceneDepth` (`projInv`, `camWorld`); occluder only > 1.0 m above the decal plane (§5.3) |
| E3 | C | Rim clone with depthTest off paints the body | hard depth compare against `sceneDepth` (+0.05 m); `e.rimSource()` ≤ 2 meshes (proxy/LOD); T4 interior ≤ 15 % (§5.3, §4.0) |
| E4 | C | One-wave dependency model breaks acceptance | waves A/B/C; immutable tags `core-p0a`, `tells-p0a`, `kit-p0a`, `world-p0a`, `models-p0a`; `depends_on` filled; B/I column per check (§7.2 rule 3, §7.8, §9) |
| E5 | C | Hitbox = decal split across owners | tells owns the geometry: `tells.hitTest`, `h.contains`; mobs' `ctx.slam`/`meleeCheck` delegate; reference geometry in the core stub (§4.0, §7.4.4) |
| E6 | M | vfx stub Proxy breaks new APIs | `NOT_FX` gains `kit, shared, applyPlayerFx, fxMulAt, fxFactor, debug`; `applyPlayerFx` side-effect only (§7.3, §7.2 rule 12) |
| E7 | M | Frozen `src/skills*` holds player FX and cast plumbing | explicit core P0b: castId stamping + `skillCast.castId`, proc castId, familiar palette, classkit routing; rule 5 covers `src/skills*` (§3.6, §9) |
| E8 | M | castId collisions | `game.nextCastId()`; runtime stamps `ctx.castId`; spells/sword use `ctx.castId ?? game.nextCastId()` (§7.4.1, §7.4.7) |
| E9 | M | `sword.dodgeOk` does not exist; Q/E hard-coded | `game.player.action.dodgeCancelable` (melee), `game.spells.castLock` (magic); player uses the keymap (§5.8, §7.4.7) |
| E10 | M | Perfect-dodge grace has no mechanism | pending-perfect from `tells.nextImpact` / `enemies.orbEta`; after-impact refund of HP + `appliedStatuses` (§5.8) |
| E11 | M | Post-hit protection cannot tell melee from projectiles | `attack.kind` on hits and `playerHurt.attackKind` (§3.8, §7.5) |
| E12 | M | Nobody applies/enforces punish | pipeline applies `vulnerableMul`; `tells.attack` returns null / `canAttack` false during the window (§3.8, §4.0) |
| E13 | M | No per-save persistence | `game.save.section`; key `monsterCodex`; reserved section names (§7.2 rule 11) |
| E14 | M | No witch-time plumbing | `timeScale.set(…, {compensate})`, `GRADES.witch` via `post.setGrade` with priority, `vfx.fxFactor` (§2.5, §5.9, §7.4.1) |
| E15 | M | Draw-call targets have no allocation; shadow ambiguity | per-scene budget table that sums; calls = scene + shadow + overlay; FM pools per element atlas, ≤ 2 calls each; player FX ≤ 40 (§1.0, §1.2, §2.6) |
| E16 | M | Instanced decals need a height lookup | `world.heightField` in `world-p0a`; fallback ≤ 16 calls, rebuild only on > 0.1 m moves (§5.2, §7.4.2) |
| E17 | M | Colour remap inverts shadow, leaves parry-gold conflict | shadow special case; `hex := fx.mid`; light ramp → ivory (sat ≤ 0.35); playtest3/core.js updated (§3.2) |
| E18 | M | Scope per owner unrealistic | registry enumeration (103); P0 = archetype looks + bespoke set; measured `lookOf` statuses; mobs split into `mobs` + `mobmodels`; hydra/nidhoggra remodels P1 (§1.4, §3.7, §7.1) |
| E19 | M | Legacy tests will break | §7.9 table of new expectations; `stub=tells` param; `hitstopLog` |
| E20 | M | Test time unrealistic | F/B/C6 at 640×360; default runs F-mage, F-ranger, B-nidhoggra; rest `--full` (§1.0) |
| E21 | M | Sub-stepping death spiral | n ≤ 2, skip when the last sim > 8 ms, logic-only sub-steps; C3 asserts CPU (§2.5) |
| E22 | M | Nobody owns enemy FX style | vfx `owner:'enemy'` style (R11, §3.8); bosses replace `runeCircle` markers; rule 5 covers `src/enemies*` |
| E23 | m | Bloom target already met | own BloomPass4: ¼-area bright, first mip ≤ 1/16, bloom texture sampled in FinalPass; overrides `setSize` (§2.4) |
| E24 | m | Angle units | radians, half-angle everywhere; legacy adapter converts (§4.0, §7.4.4) |
| E25 | m | Two strike mechanisms; frame order | one latch `consumeStrike()`; tells before vfx (§4.0, §7.3) |
| E26 | m | Difficulty key mismatch | `telegraphMul` alias = 1; `story` row in `scaling.js`; `checkAddSec` everywhere (§6.8) |
| E27 | m | autoRevive has no owner | player (§5.12) |
| E28 | m | No aggro count source | `enemies.aggroCount()` (§7.4.5) |
| E29 | m | `Mouse4` misnamed | `Mouse3` (§6.8) |
| E30 | m | Worktree/tag hygiene | `/home/user/wt4/<owner>`; tags immutable (§7.2 rule 3) |
| E31 | m | Evidence only in `/tmp` | copied to `docs/v4/evidence/`; core moves reusable scripts into `tools/playtest4/fixtures/` (header) |
| E32 | m | Unowned files | any unlisted file belongs to core; README, PROGRESS-v2, .gitignore, vendor, docs/v4/PROGRESS.md listed (§7.1) |
| E33 | m | Rule 6 vs inline `nameKo` | specs read `nameKo` from codex tables (§4.0, §7.2 rule 6) |
| E34 | m | Paladin numbers disagree | one set: i-frames 0.20 + SA 0.38, brace 0.15 + 0.05 grace (§1.6, §5.8) |
| E35 | m | Per-cast budgets unmeasurable | `castId` on every kit/particle spec; `vfx.debug.byCast` (§3.3) |
| E36 | m | `applyPlayerFx` on shared materials | private materials only, refuses `userData.shared`, chains `onBeforeCompile` (§5.4) |
| E37 | m | "자동" quality value | not a value; `autoQuality` toggle (§2.2, §6.8) |
| E38 | m | Label nits | exact `HUD_KO.check` strings; `KEY_NAMES_KO.codex = '도감'` (§1.3, §6.10) |
| P1 | C | No hard perf gate; ratios in noise | C8 hard gates (ABAB ≥ 5 pairs median): F-mage/F-ranger ≤ 0.45, S-plains ≤ 0.65; `PT.fragments()` budgets; §2.1 claims trimmed to measured gains (§1.0, §1.2, §2.1) |
| P2 | C | Coverage counts only particles | fragment-counted player-FX coverage incl. LW/FM/RB/FR/DC/spell objects; 1.5/2.5 at medium; per-cast caps; annulus/arc-strip meshes (§1.2, §1.4, §3.4) |
| P3 | C | Governor cannot step up on vsync; too slow | refresh estimate, miss ratio, probe-up with backoff, 2-level jump, P-controller dynamic res, title benchmark P0; C2 at 60/144 Hz (§2.3) |
| P4 | C | Dynamic res reallocates targets | allocate once, viewport/scissor + `uvScale`; C1 asserts textures unchanged, ≤ 2 ms (§2.4) |
| P5 | M | Hidden full-res bloom composite | bloom texture sampled in FinalPass; C1 counts full-res passes (§2.4) |
| P6 | M | Tests cover 0.92 MP, user window ≈ 2 MP | pixel-budget resolution (1.0 MP medium); live `렌더 해상도`; C1 via `budgetPx` within the viewport limit (§2.2, §7.6) |
| P7 | M | Default high on discrete is risky | medium for every tier; high only after a benchmark and the user's yes; offer to drop back (§2.2) |
| P8 | M | No GC budget | ≤ 1.0 / 0.3 MB per game-second; reused return objects; §2.7 rules (§1.2) |
| P9 | M | Per-frame uploads missing | ≤ 150 / 60 KB, ≤ 30 uploads; `addUpdateRange`; flora re-cull rule (§1.2, §2.1, §2.7) |
| P10 | M | Render-side CPU unbudgeted | submit ≤ 4/6 ms, frame p99 ≤ 12 ms, long tasks 0, flat Object3D count (§1.2) |
| P11 | M | Ducking adds per-fragment cost | `m` per vertex/instance (CPU for particles); cull m < 0.05; fades reclassified as readability; `customProgramCacheKey` (§5.4, R8) |
| P12 | M | Sub-stepping runs everything | logic-only sub-steps, visuals once on `lastStep`; C3 CPU check (§2.5) |
| P13 | M | Shader programs and compile hitches | ≤ 130 programs, kit + tells ≤ 10, uniforms not defines, `compileAsync`, overlay warmed on the canvas, 0 first draws in B-*, boot timings (§1.2, §2.5) |
| P14 | M | Enemy/world FX unbudgeted | enemy FX ≤ 1.0 screens (bosses), world transparents ≤ 0.5 (world) (§1.2, §2.6) |
| P15 | M | Shadow pass unbudgeted | ≤ 30 calls / 50k tris; LOD casters; no terrain caster; grass no receive at medium; texel snap (§1.2, §2.2) |
| P16 | M | Spawn/first-sight hitches | build once per type, shared geometry, spawn ≤ 1 ms, first sight ≤ 8 ms, boss models in `prewarmBoss`; aggregate enemy budget; rims use the proxy (§1.5, §4.0) |
| P17 | M | Player-FX calls uncapped | ≤ 40 p95 runtime-enforced; FM shape + outline ≤ 2 calls; element atlas pools (§2.6) |
| P18 | m | Particle caps too loose | 1,000/300 medium, 500/150 low, 2,000/600 high (§2.2) |
| P19 | m | Terrain gain mis-attributed | fragment fixes; `noTerrain` ≥ 0.80 in S-elderwood (§2.1, W1) |
| P20 | m | No frame cap or soak | `fpsCap` 60/30/무제한; 5-min soak in C8 (§2.5, §1.2) |
| P21 | m | Glyph atlas oversized | 1024² R8 SDF (§3.4) |
| P22 | m | Measurement hygiene | `prod=1`, `governor=0`, seed, ABAB (§1.0, §7.6) |
| P23 | m | Governor ignores new VFX | `budget.fxDetail`, enemy LOD multiplier, bloom-off uniform (§2.3) |
| P24 | m | No own-machine check | 성능 테스트 + FPS overlay (§2.8, §6.8) |
| P25 | m | Decal CPU cost | instanced with heightField; fallback rebuild on > 0.1 m; ≤ 16 KB (§5.2) |
| X1 | C | Dimming stack hides the skills | default `fxIntensity` 1.0; no blanket ×0.6; duck 0.5 only inside true shapes; linework ≥ 0.7; budgets at 1.0 (§5.4) |
| X2 | C | No positive acceptance for beauty | detail/crisp floors, element IoU < 0.5, `'generic'` fails, bespoke set, contact sheets + review gate (§1.4, §1.8) |
| X3 | C | Rim clones render as blobs | = E3 (§5.3, T4) |
| X4 | C | Opaque player FX soft-occlude telegraphs | every player FX object `depthWrite:false` in the transparent pass (R10) |
| X5 | C | E-based tips wrong for ranger/spiritcaller | `parryKo` split + can-parry rule + key tokens from the keymap (§4.0, §6.11) |
| X6 | M | Reserved colours collide with ramps | punish → white-cyan rotating diamonds + `공격 기회!` for all enemies; safe = rising chevrons + ducking inside safe zones; light ramp ivory; shape signatures asserted in T4 (§5.1, §3.2) |
| X7 | M | Player ground decals reuse threat vocabulary | no hatch in player DC/LW (stipple/ember dots); player target rings dotted/glyph-band, rotating, `light` step (R5, §3.4, §3.7) |
| X8 | M | Governor never steps up | = P3 (§2.3) |
| X9 | M | No hitch metric | long-frame, GC, transition rows; GPU ratio hard gate (§1.2, C8) |
| X10 | M | Every-2nd-frame shadows judder | medium redraws every frame within the 30-call / 50k budget; every 2nd frame only at governor L3 (§2.2, §2.3) |
| X11 | M | Slow motion will feel like lag | witch 0.5 × for 0.6 s, ≤ once / 4 s, conditions, setting `witchSlowmo`; one slow-mo source at a time; per-entity hitstop P0 (§2.5, §5.9) |
| X12 | M | No animation-phase rule | anticipation → hold 0.10–0.15 s → strike ≤ 0.12 s → slump; near-white front in the perfect window; asserted in M1/B1 (§4.0, §5.1) |
| X13 | M | Jump tell has no learnable timing | travelling shockwave ring (12 m/s) in the threat scene; jump check y > 0.6 m; new hint copy; lock flash keeps the hue (§5.1, §4.9) |
| X14 | M | Codex promises P1/class-limited mechanics | wolf alpha sentence cut; bokoblin `헛친 직후 몰아치세요`; wraith mask weak point dropped (§4.1, §4.6, §4.7) |
| X15 | M | Hard-coded seconds in copy | no windup seconds; `{punishSec}` from live values; first-encounter bonus removed (§4.0, §5.7) |
| X16 | M | First-encounter card at the worst moment | first-sight strip; full card after the kill or combat (§6.5) |
| X17 | M | Legend and thumbnails were P1 | legend with rendered tell thumbnails P0, auto-opened, linked from the recap; codex model thumbnails P0 (§6.4, §6.5) |
| X18 | M | No visual gate for monsters | turntable sheets + review; eye ≥ 6 px at 8 m; outline 4 sides (§1.5, §1.8) |
| X19 | M | Kalis/enemy FX unbudgeted, red rims | enemy style uses element dark/mid, never reserved hues; enemy FX ≤ 1.0 screens; R-boss scene (R11, §1.2, §1.7) |
| X20 | m | Linework blurs at low scale | CAS-lite sharpen when scale < 1; dynamic-res floors 0.80 (medium) of the pixel-budget base (§2.2) — partly: player linework stays in the scene target (threat scene is reserved for threats) |
| X21 | m | Faceted gem looks for fire/lightning; same signature per element | soft toon flame bodies and plasma orbs; unique signature per row (R2, §3.5, §3.7) |
| X22 | m | Korean copy fixes | all applied (§4, §6.2, §6.8) |
| X23 | m | Tell audio wall | spatialised, ≤ 2 concurrent, music −3 dB (§5.5) |
| X24 | m | Dodges must follow input | every dodge follows held movement input; ranger backflip toward input (§5.8) |
| X25 | m | Off-screen melee rule tied to arrow setting | enforced by `tells.canAttack` (> 3 m off-screen never starts melee) independent of arrows (§4.0, §5.6) |

---

## 9. Build tasks

**Eleven owners, disjoint files (§7.1), three waves.**

| Wave | Who | Starts from | Ends with |
|---|---|---|---|
| **A** | core alone | `v4-polish` | tag `core-p0a` (target ≤ 2 h): every §7.4.1 API, the full stubs, the threat-scene draw, `sceneDepth`, `enemyTime`, `game.frame`, `save.section`, `nextCastId`, keymap, settings/assist/palettes, test params and the playtest4 harness |
| **B** | all 11 owners in parallel (core continues with its P0b) | tag `core-p0a` (core: its own branch) | each owner's B checks green on its branch |
| **C** | core (integration) + review gate | all `v4/*` branches | §7.10: merge, all tests, `--perf` hard gates, sheet review, fix loop |

**Early contract tags inside wave B** (immutable, §7.2 rule 3): `world-p0a` (heightField, ≤ 1 h), `models-p0a` (model registry + `wrapLegacy`, ≤ 1 h), `tells-p0a` (attack/handle/hitTest/canAttack/punish/events, ≤ 2 h),
`kit-p0a` (kit + ducking + enemy style, ≤ 2.5 h).

**`depends_on` semantics (binding for the orchestrator)**: `core` in `depends_on` is a **hard** edge on the tag `core-p0a` (not on core's whole task): a task starts as soon as `core-p0a` exists.
Every other entry is **soft**: the dependent starts at once, codes against the core stubs, and `git merge`s that owner's `-p0a` tag read-only as soon as it exists (for `mobs`/`bosses` listed under ux:
their data is consumed at integration; no tag). No task waits for another task to *finish* except wave C. Which checks must pass where is the *Where* column of §7.8 (B = owner branch, I = integration).

Estimated effort (wave B, per owner): core 7 h (incl. wave A 2 h), world 4.5 h, vfx 7 h, tells 6 h, mobs 6 h, mobmodels 7 h, bosses 7 h, magic 8 h, melee 8 h, player 5 h, ux 8 h; wave C 3–4 h plus fix loops.

```json
[
  {
    "owner": "core",
    "files": [
      "index.html",
      "src/main.js",
      "src/core/*",
      "src/skills.js",
      "src/skills/*",
      "src/skills/trees/*",
      "tools/bootcheck.js",
      "tools/shot.js",
      "tools/playtest.js",
      "tools/playtest2.js",
      "tools/playtest3.js",
      "tools/playtest3/harness.js",
      "tools/playtest3/core.js",
      "tools/playtest3/skills.js",
      "tools/playtest3/fixtures/*",
      "tools/playtest4.js",
      "tools/playtest4/harness.js",
      "tools/playtest4/core.js",
      "tools/playtest4/fixtures/*",
      "ARCHITECTURE.md",
      "README.md",
      "PROGRESS-v2.md",
      ".gitignore",
      "vendor/*",
      "docs/v4/PROGRESS.md",
      "docs/v4/review.md",
      "docs/v4/notes/core.md",
      "docs/v4/requests/core.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/core on branch v4/core, created from v4-polish. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). You run alone first (wave A): publish the tag core-p0a as fast as possible (target <= 2 h), because every other owner starts from it. Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/core.md (what you built, APIs, numbers measured) and docs/v4/requests/core.md (requests to other owners). Put your automated checks in tools/playtest4/core.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: the shared contract every other owner codes against, the render pipeline, quality presets and the refresh-aware governor, timing (sub-steps, per-entity hitstop, slow-motion arbitration), settings/assist, palettes, the v4 test harness, the own-machine benchmark, and the final integration (U1 lag plus plumbing). WAVE A = P0a, then 'git tag core-p0a' (every API below must exist and work, even if simple; stubs where noted): (1) Settings + data: every PLAN §6.8 key with its default (fxIntensity 1.0, witchSlowmo, fpsCap, showFps, keybinds incl. dodgeAlt 'Mouse3'; quality values exactly low/medium/high/custom, unknown -> medium; autoQuality is a separate toggle), damageNumbers migration true->'merged' false->'off'; DIFFICULTY gains 'story' and the §6.8 columns (hpMul, dmgMul, tellMul, perfectMul, iframeMul, enemySpeed, autoRevive, checkAddSec, regenCombatMul) plus telegraphMul kept as an alias fixed at 1; game.assist getter (§5.12) recomputed on settingsChanged. (2) src/core/elements.js colors.fx per §3.2 (light ramp ivory), legacy mapping mid:=fx.mid, hex:=fx.mid, core:=fx.hi, edge:=fx.dark except shadow (core:=fx.dark, edge:=fx.light); game.elements.fx(el); update tools/playtest3/core.js:123-125. NEW src/core/threat.js THREAT + threatColor(kind, colorblind) with every §5.1 row incl. colour-blind variants and the punish/safe/jump colours. (3) Stubs (src/core/stubs.js, §7.3): the full tells stub (attack -> handle on game.enemyTime with consumeStrike/contains/progress/remaining/locked, hitTest with the reference geometry for circle/ring/cone/line/capsule/conecap in rad half-angles, canAttack (punish window), nextImpact, windup, punish setting e.vulnerableUntil/vulnerableMul and emitting punishWindow, projectile/hazard/safe -> {stop}, active() reused empty array, footprints() -> {data: Float32Array(64), n:0}, preOverlay, renderThumb null, isStub true); NOT_FX gains kit, shared, applyPlayerFx, fxMulAt, fxFactor, debug. (4) game.render = {tier, rendererName, msaa, pointLights, shadowType, threatScene (separate THREE.Scene, no background, no fog), overlayCamera, warm(obj,{target}), snapshot(obj,{w,h,yaw,pitch,dist}) -> dataURL}; in main.js after composer.render(): game.tells?.preOverlay?.(), setRenderTarget(null), autoClear=false, overlayCamera.copy(camera) incl. projection, render(threatScene, overlayCamera), autoClear=true; DepthTexture on both composer targets; game.post.sceneDepth/uvScale/sceneRes/cameraNear/cameraFar/projInv/camWorld updated every frame; game.post.setGrade(id, strength, {priority, durReal}) with GRADES.witch below cinematics. (5) Module order and frame (§7.3): ORDER/FILES with tells after combat; game.enemyTime += dt*assist.enemySpeed per step; game.frame = {step, n, lastStep, frameDt}; once-per-frame group world -> tells -> vfx -> ui -> audio. (6) game.save.section(name, {serialize, load}) (new save keys, v3 snapshot unchanged; reserved names tells, hints, monsterCodex, encounters); game.nextCastId() and the skills runtime (src/skills/runtime.js ~420) stamping ctx.castId before perform and adding castId to the skillCast payload; game.timeScale.set(id, scale, durReal, {compensate, priority}) honoured by comp() with one-slow-motion-source arbitration; game.hitstop(seconds, {tier, target}) signature (per-entity semantics may land in P0b) + game.debug.hitstopLog(); game.input.keymap get/rebind/label for dodge, dodgeAlt, defend, jump, sprint, interact, skills, codex, confirm; KEY_NAMES_KO.codex = '도감'. (7) Test params §7.6 (prod, governor, budgetPx, refresh, stub=<module>, fx, difficulty, witch, colorblind, threat, hints, seed). (8) tools/playtest4.js runner (owners incl. mobmodels; --perf --full --sheets --list) and tools/playtest4/harness.js with every §7.8 helper (PT.boot adds prod=1&governor=0&seed=1; PT.draws with shadow/overlay/upload counters; PT.fragments counting override; PT.cpuFrame; PT.longFrames; PT.alloc via CDP HeapProfiler; PT.pixels incl. sobel and iou; PT.gpuRatio ABAB >= 5 pairs median; PT.sheet); copy the reusable evidence scripts from docs/v4/evidence/ (v4diag-readability fight.js/lib.js/common.js, v4diag-webvfx percast.js/measure.js, v4diag-perf inject.js/synctest.js) into tools/playtest4/fixtures/ with fixed paths. C5 passes. Tag core-p0a. P0b (in this order, commit after each): (9) Render path §2.4 in NEW src/core/post4.js + main.js: targets allocated once at the maximum size, dynamic resolution by viewport/scissor + uvScale (never dispose at runtime), own BloomPass4 (NaN/Inf scrub + clamp 16 + threshold 1.0 into a 1/4-area bright target, 3 mips at medium / 5 at high, first mip <= 1/16 render area, output texture only, overrides setSize), FinalPass (FXAA with every tap tone-mapped ACES 1.05, bloom sample x strength with a uBloomOn uniform, grade, pulse chroma/radial, CAS-lite sharpen when scale < 1, dither, NaN guard, linear->sRGB), sanitizePass and OutputPass removed with every game.post uniform name kept; bloom 0.30 while game.enemies.aggroCount?.() >= 3; MSAA and shadow type per preset at boot; shadows every frame at medium with the shadow camera snapped to texels; checkShaderErrors off unless test or &shaderCheck. (10) NEW src/core/gpu.js: tier regexes of §2.2, medium for every tier on first run, pixel-budget base scale min(renderScale, sqrt(budgetPx/(w*h*pr^2))) (low 0.6, medium 1.0, high 1.6 MP; never < 0.5), game.quality.renderSize(), the one-time high-quality offer after the title benchmark and the drop-back offer (texts in §2.2). (11) NEW src/core/quality.js governor §2.3 replacing main.js:527-544: refresh interval T from the 10th-percentile rAF delta, misses > 1.5T, overload rules, 2-level jump, probe-up with 6/12/24/48 s backoff, dynamic-resolution controller (P-controller with EXT_disjoint_timer_query_webgl2 when present, miss-ratio stepping otherwise), levels L0-L5 with the §7.4.1 budget object (fxDetail, enemyLodMul ...), budget-only pre-emptive headroom on bossSpawn/ultimate/finisher, qualityLevel event, legacy game.perfScale, autoQuality/dynamicRes/fpsCap honoured, debug.governor().simulate({frameMs, gpuMs, refresh}); the 2 s title benchmark (P0) picks the start level. (12) Timing §2.5: realDt cap 0.1, n = min(2, ceil(realDt/(1/30))) logic-only sub-steps with game.frame.lastStep, n = 1 when the previous frame's sim time > 8 ms; game.step(n, dt) deterministic; per-entity hitstop (target.hitstopUntil + player animation; global only for ult/kill), caps, floor below 50 fps, 80 ms rolling budget with ult/break/parry/kill exempt; frame cap. (13) Warm-up §2.5: renderer.compileAsync over scene and threat scene during title/intro, then one real draw per returned material (64x64 target for scene materials, 1x1 scissored canvas draw for threat-scene materials); game.render.warm queue. (14) src/skills* presentation (PLAN §3.6): castId on proc hits (procs.js), familiars.js palette from element ramps (no 0xffffff, kit.motif spark/burst when present), classkits.js paladin smear/shockwave/explosion and shadowblade impact through kit.motif with the cast's castId; grep rule 5 clean in src/skills*. (15) NEW src/core/bench.js game.quality.benchmark({seconds}) per §2.8 (uses game.enemies.spawnBench?.(8) and game.skills when present, restores state exactly). (16) Debug hooks §7.7 (fragments, firstDraws, newMaterials, governor, perf, lookOf forwarders). (17) tools/bootcheck.js third config (src/tells.js renamed away, &stub=tells path), tools/playtest2.js hitstop expectations per §7.9, keep playtest.js/playtest2.js/playtest3.js green; tools/playtest4/core.js with C1-C5 and C7 (B) and C6/C8 (I). P1: uiScale CSS helper if ux asks; half-resolution soft-smoke pass if vfx requests it. ACCEPTANCE (B): C1-C5, C7; bootcheck (all three configs), playtest, playtest2, playtest3 pass. INTEGRATION (wave C, when re-invoked after all owners finish): PLAN §7.10 exactly - octopus-merge v4/*, append docs/v4/notes/*.md to ARCHITECTURE.md under '## v4 polish contract (binding)' -> '### v4 module notes', resolve docs/v4/requests/*.md, run bootcheck + playtest + playtest2 + playtest3 + playtest4 --full + --sheets, then --perf (C6 and C8 hard gates: GPU ratio F-mage <= 0.45, F-ranger <= 0.45, S-plains <= 0.65 ABAB median), run the review gate over the contact sheets into docs/v4/review.md, send fix items back to their owners, fix integration breaks under the owning file's rules, and record the final §1 numbers in docs/v4/notes/core.md.",
    "depends_on": []
  },
  {
    "owner": "world",
    "files": [
      "src/world.js",
      "src/world/*",
      "tools/playtest3/world.js",
      "tools/playtest4/world.js",
      "docs/v4/notes/world.md",
      "docs/v4/requests/world.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/world on branch v4/world, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/world.md (what you built, APIs, numbers measured) and docs/v4/requests/world.md (requests to other owners). Put your automated checks in tools/playtest4/world.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: open-world GPU/CPU cost (U1), the terrain height field for instanced telegraphs, the objective beacon (U2) and world-side copy. FIRST (target <= 1 h, then 'git tag world-p0a'): world.heightField = {tex (DataTexture, R32F or HalfFloat heights), origin {x,z}, size {x,z} metres, texel metres} matching getHeight within 0.05 m (PLAN §7.4.2), and matrixAutoUpdate=false + one updateMatrix() on every static world object. P0: (1) Terrain: split the 115,200-tri terrain (terrain.js SEG 240) into 8x8 chunks with bounding spheres + frustum culling, 2 LODs with skirts (far ~1/3 density beyond 120 m); getHeight/getGroundHeight/raycasts unchanged; FRAGMENT cost is the gain (noTerrain 0.60 in Elderwood): one texture fetch where slope < 0.35 (triplanar only above), one mask fetch for burn/bless/curse/strata overlays and only inside a uniform bounding circle of the active region; terrain does not cast shadows at low/medium (terrain.js:447 castShadow). (2) Point lights in world/fire.js and world/surface.js only when game.render?.pointLights === true (decided at boot, never added/removed later). (3) Grass: density/near fade per preset (medium 0.4 and x0.7), receiveShadow false at low/medium, skip chunks whose fade factor is 0 on the CPU, coarse far LOD, budget.grassMul live. (4) Flora: tree draw distance 120/200/350 m, flora outlines 20/35/55 m, budget.floraMul; flora.js refreshSet re-culls at most every 4th frame or when the frustum moved > 2 degrees / 1 m, and uploads only live ranges with addUpdateRange (it re-uploads full capacity every camera rotation today: 527 KB/frame in S-plains). (5) Cull always-drawn village meshes outside the village by zone/distance (signLabels structures.js:493, chimneySmoke village.js:632 frustumCulled=false, fires, worldTreeMotes worldtree.js:188, water): 0 always-drawn meshes outside the village radius. (6) World transparents (mirwenMist, elderSpores, worldTreeMotes, chimneySmoke, fires, water) <= 0.5 screens of fragments in every S-* scene (PT.fragments owner world): fewer/smaller/lower-alpha sprites. (7) Shadows: map size per preset (1024 medium, 2048 high), extent +-32 m, caster distance 60 m; world share of the medium shadow pass <= 14 calls / <= 20k tris (trees cast with their far LOD; rocks/props only near). (8) World draw-call share per PLAN §1.2: <= 110 scene + 14 shadow in S-plains and F-* at the max yaw (S-village <= 175 total incl. the player, S-mirwen/S-elderwood <= 160); uploads <= 60 KB/frame in S-*. (9) world.setBeacon(pos|null, {kind}) per §6.3: thin unlit pillar (40 m, alpha fading within 15 m) + ground ring, <= 2 calls, prewarmed. (10) Surface damage hits carry attack:{id:'surface.<kind>', nameKo, kind:'surface'} (names §7.4.2) and owner:'world' on vfx calls. (11) Camp names in terrain.js:34-36 -> '서쪽/동쪽/북쪽 뿔도깨비 야영지'. (12) world.debug.setGrassVisible(on), terrainChunks(), transparents(). P1: crush grass inside game.tells.footprints(); world.camps[i].entrance + entrance banners; coarse navigable path helper for ux breadcrumbs; see-through prefab variant only for objects within 30 m. ACCEPTANCE (B): playtest4 world W1 (incl. noTerrain >= 0.80 in S-elderwood by ABAB, heightField accuracy, uploads, transparents); the world rows of §1.2; playtest3 world section still passes.",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "vfx",
    "files": [
      "src/vfx.js",
      "src/vfx/*",
      "src/combat.js",
      "src/combat/*",
      "tools/playtest3/combat.js",
      "tools/playtest4/vfx.js",
      "docs/v4/notes/vfx.md",
      "docs/v4/requests/vfx.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/vfx on branch v4/vfx, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: world (world-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/vfx.md (what you built, APIs, numbers measured) and docs/v4/requests/vfx.md (requests to other owners). Put your automated checks in tools/playtest4/vfx.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: the shared VFX kit every skill look is built from, player-FX fill/call budgets and ducking, the enemy-owned FX style, impacts/reactions/hit feel, and the damage pipeline payloads (U1, U3, U6). magic and melee merge your tag kit-p0a to build on the kit: deliver P0-A FIRST (target <= 2.5 h) and tag it 'kit-p0a'; never rebase or amend after tagging. P0-A (PLAN §3.4, §3.5 generic, §5.4, §7.4.3, R10, R11): NEW src/vfx/kit.js (game.vfx.kit): linework.js (one instanced premultiplied SDF ShaderMaterial for ring/arc/poly/star/ticks/rays/spiral/crescent/glyph/dots/stipple; rings/arcs as tight annulus/arc-strip meshes, never full quads; ground plane conforming via world.heightField when present; screen-space min width via fwidth; back-out scale-in, spin, erosion; <= 2 calls; NO hatch or chevron shapes for player FX), glyphs.js (1024x1024 single-channel R8 SDF atlas, 4x4 cells of 256 px, generated at boot from canvas-drawn glyphs: 9 element sigils, hexagram, futhark band, tick ring, lichtenberg, frost hex, flower5, feather), fxmesh.js (registerShape adds to the element's merged shape atlas; one instanced mesh per element family selecting the shape per instance (vertex shader collapses others), fxMaterial toon ramp, per-instance life + erosion discard with a light rim band, optional inverted-hull outline in dark, depthWrite:false transparent pass with back-to-front instance sort when <= 64, live-range uploads, <= 2 calls per element incl. outline), ribbon.js (trail.js upgrade: arc-length resampling, taper, head-saturated tail-desaturated, uv scroll, premultiplied, live ranges), bolt.js (beam.js upgrade: midpoint displacement, 2-3 forks, core + halo, 2-3 frame regeneration, afterglow), spark(), decal kinds crack/scorch(broken rings + ember stipple)/frost/lichtenberg/ripple/flower/rune/strata as <= 0.35-alpha lines/dots (no hatch), ramp(el), tier(code) incl. coverage caps, registerMotif/motif/hasMotif, motifs_generic.js implementing all 9 motif kinds for every element + physical (a look that relies on it reports 'generic'); castId on every spec + vfx.debug.byCast(id); duck.js: game.vfx.shared (uThreat Vector4[16] = 8 true-shape footprints incl. safe zones from game.tells.footprints()), applyPlayerFx(material, {additive, role}) called for side effect only, refusing userData.shared materials, chaining onBeforeCompile and setting customProgramCacheKey, factor m computed per vertex/instance per §5.4 (fxIntensity default 1.0, 0.5 inside true shapes, role 'line' >= 0.7, near-camera fade, camera-segment fade), fxMulAt(pos, role) CPU path, fxFactor(id, mul, durReal); enemystyle.js: every preset/burst/motif/flashSprite with owner:'enemy' rendered dark core + fx.mid rim, no hi, no glyph circles, no reserved hue, never ducked. P0-B: (1) particles.js: projected-size clamp (12% of screen height for soft/smoke/puff/glow/flare, 20% others), per-particle duck attribute from fxMulAt once per frame and no emission when < 0.05, uBoost 1.0, owner flag, caps 500/150 low, 1,000/300 medium, 2,000/600 high, emitters routed through the budget (vfx.js:149 bypass removed), live-range uploads. (2) coverage.js: player/enemy/world coverage = fragment-counted (use core's counting override in tests; a cheap runtime estimator drives the budget) with soft/hard budgets 1.0/1.5 low, 1.5/2.5 medium, 3/5 high shrinking the largest contributors first; runtime player-FX call cap 40 (medium) collapsing the oldest persistent visuals to linework only; budget.fxDetail and coverageMul honoured; enemy-owned FX coverage reported for bosses. (3) Restraint §3.1/§3.8: flashSprite <= 1.5 m; dome() = linework ring + rim-only shell <= 2 m; screenFlash only for ult/break/finisher tiers, tinted, alpha <= 0.25, <= 0.15 s, off with flashReduce; fovKick only ult/finisher; shake x0.6 and screenShake; hitstop durations of §5.10 requested once per castId through game.hitstop({tier, target}); hitFeel: per target one motif spark (<= 12 particles), burst once per castId within 0.3 s; presets.js/presets2.js impact_<el>/explosion_<el> = kit.motif(el,'burst') + <= 12 sparks, SZ/LF multipliers 1.0; the 6 reaction families rebuilt (<= 60 particles, no domes, <= 1 ring, tinted flash <= 0.1 s only for the big families); flashEntity never clones per hit (WeakMap set or e.flashUniform); pooled point lights only when game.render.pointLights; trail/beam/debris live-range uploads; no 0xffffff in your files. (4) combat: statusfx.js burning re-ramp; scratch objects in statusfx.update and queryRadius; pipeline.js applies e.vulnerableMul while game.enemyTime < e.vulnerableUntil, carries hit.attack {id, nameKo, kind}, fills hit.appliedStatuses, emits playerHurt exactly per §7.5 (attackKind, appliedStatuses, sourceName, attackNameKo, dot, surface, dir, time), passes castId to hitFeel; combat.clearStatus(entity, id). (5) vfx/telegraph.js fallback: winding fixed (normals up AND DoubleSide), renderOrder 30, depthTest false, toneMapped false, linear fill, pool 16, rad half-angle adapter, forwarding to game.tells.telegraph when tells exists and is not the stub; vfx.debug.telegraphs(); tools/playtest3/combat.js per §7.9 (run with &stub=tells, assert pixels > 500 per shape and pool 16). P1: half-resolution soft-smoke target at governor L1+ (request core), octagon quads for large soft sprites, bespoke reaction signatures. ACCEPTANCE (B): playtest4 vfx V1-V4; tools/playtest.js reaction section; grep rule 5 clean in src/vfx* and src/combat*.",
    "depends_on": [
      "core",
      "world"
    ]
  },
  {
    "owner": "tells",
    "files": [
      "src/tells.js",
      "src/tells/*",
      "tools/playtest4/tells.js",
      "docs/v4/notes/tells.md",
      "docs/v4/requests/tells.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/tells on branch v4/tells, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: world (world-p0a), vfx (kit-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/tells.md (what you built, APIs, numbers measured) and docs/v4/requests/tells.md (requests to other owners). Put your automated checks in tools/playtest4/tells.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: the threat-readability module game.tells - telegraph timing, hit geometry, threat-scene content (U6 'I cannot see where or how fast they hit' - fix it decisively; U5 fair timing). Factory: export function createTells(game) in src/tells.js (core already lists it in ORDER from core-p0a). Everything you draw lives in game.render.threatScene (drawn by core after the post chain). FIRST (target <= 2 h, then 'git tag tells-p0a'; mobs and bosses build on it): attack(e, spec) -> TellHandle|null with consumeStrike() (one latch, true exactly once when enemyTime >= start + dur) and contains(pos, pad=0.15); hitTest(shape, pos, pad) identical to the core stub's reference geometry (circle/ring/cone/line/capsule/conecap, rad half-angles); canAttack(e, {melee}) (false during a punish window, and for melee when the enemy is off-screen and > 3 m away); nextImpact(pos); windup(); punish(e, dur, {mul}) setting e.vulnerableUntil/vulnerableMul + punishWindow; dur = max(windup, MIN[cls]) x assist.tellMul x (e.timeMul ?? 1) on game.enemyTime (no first-encounter bonus); events tellStart/tellCommit/tellEnd/tellFirst (persisted in save section 'tells')/punishWindow; active() and footprints() returning reused objects (true shapes incl. safe zones and winding-up bodies); a basic decal drawn in the threat scene. P0: (1) Decal shader (PLAN §5.2): one program for all shapes; dark outer band, rim with px minimums (dashed parry, double unblockable), fill + flat chevrons on directional shapes, hatch only for hazard, LINEAR time front that turns near-white #FFF4F0 in the last 0.20 s x assist.perfectMul, lock flash brightening the tell's own hue + 1.5x thicker rim, snap-and-fade end, no flash > 3 Hz; instanced per shape family, conforming in the vertex shader via world.heightField (fallback: CPU 24x24 grids rebuilt only when the decal moves > 0.1 m), triangle normals up AND DoubleSide, lifted 0.06 m, toneMapped false, fog off; soft occlusion (§5.3): rebuild the scene point's world position from game.post.sceneDepth with projInv/camWorld/uvScale and count it as an occluder only if it is > 1.0 m above the decal plane -> 40% alpha; pool 16 that never recycles an active decal; <= 6 decal calls; <= 16 KB uploads/frame. (2) Body tells (§5.3, §5.5): rim clones built from e.rimSource() (<= 2 meshes, SkinnedMesh bound to the source skeleton and bindMatrix, matrixAutoUpdate=false, matrix copied in preOverlay()), inverted hull 2-3 px in the tell colour ramping over the windup and flashing at lock, fragment hard depth compare against sceneDepth (draw only where hullDepth <= sceneDepth + 0.05 m) so only the outline shows; max 4 nearest by remaining time; glint star at e.tellAnchor?.(spec.anchor) at lock (gold for parry); icons ⚠ and ⤒; jump tells: spec.shockwave travelling ring (12 m/s, 0.25 m band) with h.shockwaveR(); punish: rotating white-cyan diamond sparkles + '공격 기회!' world text (string in NEW src/tells/text.js). (3) projectile(obj, {r}) ground ring markers (pool 12), hazard({pos, r, dur, kind, nameKo}) lingering red hatch, safe({pos, r|shape, dur}) mint ring + rising vertical chevrons (and added to footprints so player FX duck there). (4) Audio calls game.audio.play(name, {pos}) per §5.5 (ux limits concurrency). (5) Settings: threatEmphasis strong (5 px rim, 0.28 fill, icons on all), colour-blind palettes from core threatColor keeping shapes, teachSlowmo on the first tell of each kind via game.timeScale.set('teach', 0.4, 0.6, {compensate:true, priority}). (6) Legacy adapter telegraph(o) (v3 full-angle degrees -> rad half; damage/void -> danger, grab -> unblockable, parryable -> parry). (7) renderThumb(kind, size) -> dataURL via game.render.snapshot for the ux legend. (8) Warm every material against the canvas (game.render.warm(obj, {target:'overlay'})); <= 4 programs; no per-frame allocation. (9) tells.debug.setVisible/pixelsOf/pool/rims. P1: 0.35 m vertical rising-edge ribbon on AoE rims > 6 m for grazing camera angles; faint element glyph in the fill. ACCEPTANCE (B): playtest4 tells T1, T3, T4 and the branch form of T2 (kit-p0a merged plus legacy particles spawned over the decals to prove the threat scene wins; grass on/off; a > 1 m wall); T2 with real looks (R-mage, R-sword, R-boss) is verified at integration.",
    "depends_on": [
      "core",
      "world",
      "vfx"
    ]
  },
  {
    "owner": "mobmodels",
    "files": [
      "src/enemies/models.js",
      "src/enemies/models2.js",
      "src/enemies/mobs/*",
      "tools/playtest4/mobmodels.js",
      "tools/playtest4/sheets/mobs/*",
      "docs/v4/notes/mobmodels.md",
      "docs/v4/requests/mobmodels.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/mobmodels on branch v4/mobmodels, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/mobmodels.md (what you built, APIs, numbers measured) and docs/v4/requests/mobmodels.md (requests to other owners). Put your automated checks in tools/playtest4/mobmodels.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: precise, detailed regular-enemy models (U4) behind the model contract of PLAN §4.0 / §7.4.6, cheap to render and to spawn (U1). mobs' behaviour files consume your registry; bosses may import src/enemies/mobs/rig.js via 'import * as'. Keep every existing export and signature of models.js/models2.js (append-only; humanoid() unchanged). You may statically import ../common.js (mobs: Spring, shared materials). FIRST (target <= 1 h, then 'git tag models-p0a'): NEW src/enemies/mobs/index.js with createModel(type, opts) (returns null for types not built yet), wrapLegacy(root, opts) that wraps any v3 model in the EnemyModel contract (meshes, proxy = the existing outline mesh, lod = body, bones map, features all false, tellAnchors from bones or the bounding box, flashUniform, rimSource(), pose() adapter, update(), dispose()), preview(type), prewarm(game), TYPES. P0: (1) NEW src/enemies/mobs/rig.js humanoid2 (13 v3 bones + jaw, lidL/lidR, thumb/fingers per hand, up to 4 Spring bones, smooth 2-bone weights in a 6 cm band, species proportions) plus a reptile variant (lizard: digitigrade legs, 4-bone tail) and a quadruped rig (wolf). (2) One file per species in src/enemies/mobs/: bokoblin, shaman, chuchu + 8 variant silhouettes, lizard, shroom, wolf (+ alpha mane and scar), wraith, voidknight, training dummy, implementing every item of the PLAN §4.1-4.8 Model lines and the §4.0 rules: sphere segments ~10x8, faces (sclera, iris, pupil, highlight; brows; mouth/jaw; seeded blink 3-6 s; eye group >= 6 px wide at 8 m on 1280x720), hands, accessories, AO/belly-gradient/rim vertex colours, >= 2 springs, lighter palettes (wolf/voidknight/wraith body luma >= 0.18 on the Elderwood floor, no body below 0.12), poses idle/walk/windup/hold/strike/recover/stagger/die exaggerated for readability (anticipation squash x1.15). (3) Budgets: body <= 9k tris (per-species numbers in §4), silhouette-only outline proxy <= 3k (also the rim source), LOD beyond budget distance (25 m medium x budget.enemyLodMul) <= 3.2k with no outline, shadow caster = LOD mesh only (<= 2k; accessories, springs, glow and eyes never cast), <= 3 draws per mob (LOD <= 2), outlines within game.quality.budget.enemyOutlineDist; aggregate 12-mob scene <= 140k tris + 24k shadow, <= 36 + 12 calls. (4) Build once per type at boot or in requestIdleCallback; instances share BufferGeometry and materials and clone only the skeleton; spawn <= 1 ms per mob; first sight <= 8 ms including game.render.warm; springs, blink and LOD switch in update(frameDt) only on game.frame.lastStep; no per-frame allocation. (5) model.features = {face, hands, springs, aoVertexColors, lod}; flashUniform shared by the body materials for vfx.flashEntity; prewarm() returns every material. (6) --sheets: turntables to tools/playtest4/sheets/mobs/<type>.png (3 m and 8 m, front / 3-4 / side, idle and windup, the v3 model in the row above; <= 150 KB each). P1: LOD cross-fade, extra accessories, variant idle FX. ACCEPTANCE (B): playtest4 mobmodels MM1 and MM2; sheets written for the integration review gate (PLAN §1.8).",
    "depends_on": [
      "core"
    ]
  },
  {
    "owner": "mobs",
    "files": [
      "src/enemies.js",
      "src/enemies/base.js",
      "src/enemies/common.js",
      "src/enemies/bokoblin.js",
      "src/enemies/shaman.js",
      "src/enemies/chuchu.js",
      "src/enemies/lizard.js",
      "src/enemies/shroom.js",
      "src/enemies/wolf.js",
      "src/enemies/wraith.js",
      "src/enemies/voidknight.js",
      "src/enemies/dummy.js",
      "src/enemies/projectiles.js",
      "src/enemies/loot.js",
      "src/enemies/scaling.js",
      "src/enemies/threat.js",
      "src/enemies/encounters.js",
      "src/enemies/codex.js",
      "tools/playtest3/enemies.js",
      "tools/playtest4/mobs.js",
      "docs/v4/notes/mobs.md",
      "docs/v4/requests/mobs.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/mobs on branch v4/mobs, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: tells (tells-p0a), mobmodels (models-p0a), vfx (kit-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/mobs.md (what you built, APIs, numbers measured) and docs/v4/requests/mobs.md (requests to other owners). Put your automated checks in tools/playtest4/mobs.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: behaviour, counterplay, timing, projectiles, codex data and encounters for the 8 regular enemy types + chuchu variants + training dummy (U5, U6, U2 data). Models belong to mobmodels (src/enemies/models.js, models2.js, src/enemies/mobs/*); bosses (bossbase.js, golem.js, bosses/*) belong to bosses, who statically import your base.js, common.js and scaling.js: keep every existing export and signature (append-only). P0: (1) Model contract (PLAN §4.0): behaviour files get models through 'import * as MobModels from ./mobs/index.js' -> MobModels.createModel?.(type, opts) ?? MobModels.wrapLegacy?.(<v3 model>) ?? <v3 model>, drive them only through pose()/bones/tellAnchors, and forward e.model, e.rimSource(), e.tellAnchor(kind), e.flashUniform; enemies.previewModel(type) forwards to MobModels.preview; enemies.registerPreview?(type, fn) for bosses. (2) Every regular attack starts with game.tells.attack(e, spec) using the exact ids, tells, windups, shapes (rad half-angles) and lockAt of PLAN §4.1-4.8, nameKo read from src/enemies/codex.js; null -> reposition; strikes resolve only through h.consumeStrike(); the animation rhythm of §4.0 (anticipation, hold the pose 0.10-0.15 s at lock, strike <= 0.12 s, recovery/slump for the punish duration). (3) Hitbox = decal: ctx.slam, ctx.meleeCheck and ctx.tele users resolve through game.tells.hitTest / h.contains (pad 0.15); remove the +radius 0.4 and the d < 1.0 any-angle shortcut (enemies.js:107-135); the jump check (enemies.js:143) becomes feet - ground > 0.6 m when the shockwave front passes; lunges are part of the shape; hits carry attack:{id, nameKo, kind:'melee'|'projectile'|'hazard'}; every vfx call passes owner:'enemy'. (4) Punish windows via game.tells.punish with the table durations/multipliers (damage multiplier is applied by vfx's combat pipeline); AI checks tells.canAttack(e, {melee}) (punish window, off-screen melee > 3 m). (5) Projectiles (used by bosses too): homing <= 0.5 s at <= 120 deg/s then straight; mob orb speed <= 8 m/s (shaman 7.5, wraith 8); enemy-style orbs (vfx owner:'enemy'); game.tells.projectile marker; <= 6 enemy orbs alive (oldest fizzles); ranged casters take an attack token; enemies.orbCount(), enemies.orbEta(pos). (6) Behaviour fixes: voidknight bash -> 0.55 s visible shield raise only after 2 consecutive guarded hits, knockback only; voidknight combo follow-up decals one by one; wolf circle radius 4.5 m, one wolf attacks at a time; shaman/wraith blink cd >= 8 s with a 0.4 s shimmer at the destination first; shaman interrupt -> dazed 1.5 s; chuchu aura every 2.0 s with a 0.5 s glow + small circle tell; lizard lunge decal = the whole arc capsule; no wraith mask weak point. (7) Data: e.weakness/resist/immune on every entity (values in §4 incl. CHU_WEAK), e.attacks with punishDur, e.debugAttack(id), e.timeMul; NEW src/enemies/codex.js with complete CodexEntry objects (§7.4.5) for bokoblin, shaman, chuchu + 8 variants, lizard, shroom, wolf, wraith, voidknight using the exact §4 Korean copy (no windup seconds; parry advice only in parryKo; tokens {dodgeKey} {defendKey} {jumpKey} {punishSec}); registerCodex/codex(); enemies.noteEncounter(type, {sight}) persisted in save section 'encounters'; enemyEncounter {type, enemy, first, sight} on first sight (<= 30 m and in view) and on first aggro; enemies.aggroCount(); enemies.spawnBench(n) for core's benchmark; dummy.practice(kind) slow x1.5 danger or parry swing. (8) Time: enemy logic on game.enemyTime deltas (assist.enemySpeed); per-entity hitstop (skip the update while e.hitstopUntil is in the future and extend the active TellHandle by the frozen time); scaling.js gains the 'story' row, telegraphMul is no longer multiplied anywhere (alias 1), the check key is checkAddSec. (9) Perf: logic in sub-steps, visual work (mixers, springs, model.update) once on game.frame.lastStep; skinned animation at half rate beyond 30 m and paused beyond 60 m; outlines and LOD distances from game.quality.budget (enemyOutlineDist, enemyLodMul); game.render.warm on the first spawn of each type; remove the allocations in separate (enemies.js:438), integrate (common.js:307), updateEnemy (base.js:355) and queryRadius callers with module scratch objects. (10) enemies.js: 'import * as GolemMod from ./enemies/golem.js' (GolemMod.createGolem, GolemMod.prewarmGolem?.(game)). P1: alpha-wolf hesitation (then add its codex sentence), extra behaviours. ACCEPTANCE (B): playtest4 mobs M1 and M3 (with tells-p0a merged); tools/playtest3/enemies.js updated per §7.9 (it also covers bosses: keep the boss checks working and apply the exact expectations bosses file in docs/v4/requests/bosses.md) and passing.",
    "depends_on": [
      "core",
      "tells",
      "mobmodels",
      "vfx"
    ]
  },
  {
    "owner": "bosses",
    "files": [
      "src/enemies/bossbase.js",
      "src/enemies/golem.js",
      "src/enemies/bosses/*",
      "tools/playtest4/bosses.js",
      "tools/playtest4/sheets/bosses/*",
      "docs/v4/notes/bosses.md",
      "docs/v4/requests/bosses.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/bosses on branch v4/bosses, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: tells (tells-p0a), mobmodels (models-p0a), vfx (kit-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/bosses.md (what you built, APIs, numbers measured) and docs/v4/requests/bosses.md (requests to other owners). Put your automated checks in tools/playtest4/bosses.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: 고대 바위 골렘 and the 5 bosses (hydra, nox, treant, kalis, nidhoggra): counterplay, timing, punish windows, briefs, codex, enemy-owned FX and models (U4, U5, U6). You may keep the existing static imports of ../base.js, ../common.js, ../scaling.js (mobs) and ../models.js (mobmodels), reaching anything new only via 'import * as M' + feature detection (e.g. ../mobs/rig.js), or build your own rig in NEW bosses/rig.js. P0 gameplay (PLAN §4.9-4.15 tables are the spec): (1) every boss attack via game.tells.attack with the exact ids, tells, windups, shapes (rad half-angles), lockAt and punish windows, nameKo from bosses/codex.js; strikes only through h.consumeStrike(); every hit through tells.hitTest / h.contains (also when you call mobs' ctx.slam/meleeCheck/tele, which delegate) - nox teleport-slash width 1.6, kalis one conecap decal, treant roots half-width 1.1, golem punch 8.5 m cone; attack:{id, nameKo, kind} on every hit; AI checks tells.canAttack; the §4.0 animation rhythm (hold 0.10-0.15 s at lock, visible recovery). (2) Reworks: golem slam = jump tell with spec.shockwave (ring 12 m/s; hit when the front passes the player and feet - ground <= 0.6 m), throw landing circle from windup start, punch -> fist planted 1.2 s with the core exposed x2; hydra <= 1 bite + <= 1 other attack, spit = 3 non-homing orbs at predicted positions with landing markers, tide safe tiles via tells.safe, head low 2.0 s with a punish window, freeze check emits bossCheck kind 'freeze'; nox arrival raven-smoke marker 0.3 s in front/side of the player within +-0.87 rad of the camera forward, then the 0.8 s line, volley 3 (phase 2: 4) homing 0.5 s, voidShield break -> 3 s kneel, <= 1 teleport-slash incl. the clone; treant sweep arm stuck 1.5 s and hittable (plate damage x2), pods glow 1.0 s before bursting; kalis visible 0.5 s counter stance, volley 3 (4), mirror-crack punish 1.0 s after the dash, stagger check = bar + 3 crystal targets (no gold arena wash), reads checkAddSec ?? checkAdd; nidhoggra breath 'unblockable' 1.8 s with root-pillar shadow wedges via tells.safe, claw -> head sag 2.6 s after a parry and 1.2 s after a whiff, <= 16 simultaneous decals. (3) Enemy-owned FX: every vfx call owner:'enemy' (vfx renders the enemy style); replace every runeCircle/sigil attack marker (e.g. kalis.js:146-210) with tells decals; no white flashSprites, no reserved threat hues; boss spell effects (hydra breath/spit, nox volley, nidhoggra breath, treant roots, kalis copies) shrunk/darkened to <= 1.0 screens of enemy-FX fragments p95 in every B-* scene. (4) bossbase: break -> real 3.5 s stagger (no attacks, kneel pose, x1.5 via the punish path) + bossBroken {boss, dur}, cd 12 s; bossSpawn payload gains brief (3 Korean strings from §4); e.cameraHint (hydra 1.6/1.5, treant 1.7/1.6, nidhoggra 1.5/1.4); e.weakness/resist/immune, e.attacks with punishDur, e.debugAttack, e.tellAnchor, e.rimSource, e.timeMul, e.flashUniform on every boss; per-entity hitstop (skip update while e.hitstopUntil, extend the TellHandle); boss time on game.enemyTime; game.enemies.noteEncounter + enemyEncounter on first sight; game.enemies.registerPreview?(type, fn). (5) NEW bosses/codex.js with complete CodexEntry objects for golem, hydra, nox, treant, kalis, nidhoggra using the exact §4 Korean texts and briefs (no windup seconds, parryKo separate, tokens), registered with game.enemies.registerCodex?.() on module load; file the exact new expectations for the boss parts of tools/playtest3/enemies.js (owned by mobs) in docs/v4/requests/bosses.md. P0 models (§4.9-4.14, §4.0 contract): golem in NEW bosses/golem_model.js (golem.js switches to it; export prewarmGolem(game)), nox, treant and kalis (instanced orbiting mirror shards) remodelled within golem <= 14k, nox/kalis <= 16k, treant <= 32k (+ proxy); hydra and nidhoggra keep their v3 meshes but gain the contract fields (proxy and LOD shadow casters, rimSource, tellAnchors, flashUniform), lifted palettes and eye/teeth glow; all built inside prewarmBoss during the approach/intro with game.render.warm (0 first draws in B-*); boss draw calls mid-bosses <= 22, nidhoggra <= 40 (+ <= 6 shadow); secondary motion with the existing Spring class on game.frame.lastStep; --sheets turntables to tools/playtest4/sheets/bosses/<type>.png. P1: hydra (<= 32k) and nidhoggra (<= 60k) remodels, extra secondary motion, kalis shard cracks during punish, nidhoggra wing veins, boss voice barks at tellStart. ACCEPTANCE (B): playtest4 bosses B1 (with tells-p0a merged; enemy-FX coverage verified at integration) and B2; sheets written for the review gate.",
    "depends_on": [
      "core",
      "tells",
      "mobmodels",
      "vfx"
    ]
  },
  {
    "owner": "magic",
    "files": [
      "src/spells.js",
      "src/spells/*",
      "src/spells/motifs/*",
      "tools/playtest3/magic.js",
      "tools/playtest4/magic.js",
      "tools/playtest4/sheets/caster/*",
      "docs/v4/notes/magic.md",
      "docs/v4/requests/magic.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/magic on branch v4/magic, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: vfx (kit-p0a), tells (tells-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/magic.md (what you built, APIs, numbers measured) and docs/v4/requests/magic.md (requests to other owners). Put your automated checks in tools/playtest4/magic.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: the refined, beautiful look of every skill in the CASTER family (mage staff, ranger bow, spiritcaller totem) and the fire/ice/lightning/wind/water element motifs shared with melee (U3, U1, U6). Gameplay (damage, radii, hitboxes, timings) does not change. The skill list is enumerated from the registry (game.skills.registry; 103 ids at HEAD), never hard-coded. P0-A (no kit needed): (1) restraint in src/spells*: emissive/intensity multipliers <= 1.2 (coreMat 2.2-2.5, fresnelMat 1.4-2.4, meshes2 orbs, flameMat), every 0xffffff effect colour replaced by game.elements.fx(el) ramps (§3.2), no domes, no screenFlash/fovKick outside ultimate/awakened/finisher, settings.flashReduce honoured; (2) fresnelMat/coreMat/flame/etc. cached by key (0 new materials per cast after the first), per-cast spell meshes pooled/instanced; (3) castId = ctx.castId ?? game.nextCastId() on every cast, on every hit (hit.castId) and every vfx/kit spec; (4) every PRIVATE spell material through game.vfx.applyPlayerFx?.(m, {role}) for side effect only; every player FX object depthWrite:false in the transparent pass (R10); spell objects (ice pillar, walls, rods, tornado, phoenix) userData.noCameraCollide = true; (5) game.spells.castLock = seconds of non-cancellable cast recovery (0 when free) for player's dodge buffer; (6) first-cast warm: at boot run each archetype's asset creation once and game.render.warm its objects so no first cast costs > 8 ms (lightning.basic 80 ms today); (7) per-cast tier ceilings of §1.4 (particles, handles, coverage). P0-B (merge kit-p0a): (8) NEW src/spells/motifs/{fire,ice,lightning,wind,water}.js: the §3.5 shapes (fire.flame soft-edged toon lathe tongues in 3 sizes with a thin hi core - NOT faceted orbs, fire.crescent petals, ice.prism hex prisms 2-3 sizes, ice.shard bipyramids, lightning soft plasma orb + rod spike, wind.crescent blades, water.droplet teardrops and water.sheet wave ribbon with caustic scroll + crest line) via kit.registerShape('<el>.<shape>', ...), and all 9 motif kinds per element via kit.registerMotif following the §3.5 primary/secondary/accent rules and never-lists; no hatch, chevrons or diamonds; player target rings dotted/glyph-band, rotating, element light step. (9) Archetype-level v4 looks for EVERY caster archetype (spells/archetypes.js, defs.js, zones/zones2, projectiles/meshes2, objects, summons) so every registry skill declares at least 'archetype' and meets its tier ceilings and floors. (10) Bespoke caster looks (rows of §3.7) for the bespoke set: the 12 starred skills, every *.basic, *.charged and *.ult, and the skills of starter_mage, starter_ranger, starter_spiritcaller loadouts; keep the v3 rune circles (meteor mark, ice/lightning ult circles) as anticipation; each row's first key shape is its unique signature; §3.6 caster rules incl. ranger element fletching + trail and spiritcaller familiar echo at 50%. (11) NEW src/spells/looks.js: spells.lookOf(id) -> declared level 'bespoke'|'archetype'|'generic'|'legacy'; MG1 measures every declared skill (newWhite, luma, sat, coverage ceilings, detail and crisp floors, element IoU < 0.5 per archetype) and fails declarations whose measurement fails. (12) --sheets: contact sheets tools/playtest4/sheets/caster/<id>.png (anticipation / impact / dissipation) for the bespoke set and one skill per archetype x element. P1: bespoke looks for the remaining rows (awakened, other actives), finisher polish within the F budget, seeded glyph variations. ACCEPTANCE (B): playtest4 magic MG1 (all registry skills >= 'archetype' and the bespoke set 'bespoke', verified by measurement; ceilings and floors; stacked 7-cast mage rotation <= 12% near-white; 0 new materials per cast; first cast <= 8 ms; castLock); telegraph retention >= 95% is verified at integration (I); tools/playtest3/magic.js and the skills cast checks still pass.",
    "depends_on": [
      "core",
      "vfx",
      "tells"
    ]
  },
  {
    "owner": "melee",
    "files": [
      "src/sword.js",
      "src/sword/*",
      "src/sword/motifs/*",
      "tools/playtest3/melee.js",
      "tools/playtest4/melee.js",
      "tools/playtest4/sheets/melee/*",
      "docs/v4/notes/melee.md",
      "docs/v4/requests/melee.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/melee on branch v4/melee, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: vfx (kit-p0a), tells (tells-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/melee.md (what you built, APIs, numbers measured) and docs/v4/requests/melee.md (requests to other owners). Put your automated checks in tools/playtest4/melee.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: the refined, beautiful look of every skill in the MELEE family (sword longsword, paladin hammer + shield, shadowblade daggers), the earth/nature/light/shadow element motifs shared with casters, and the melee dodge-cancel windows (U3, U5, U6). Gameplay damage/hitboxes do not change. The skill list is enumerated from the registry (103 ids), never hard-coded. Classkit presentation in src/skills/classkits.js is core's (it will route through your motifs via kit.motif). P0-A (no kit needed): (1) slash arcs and sword fx (sword/fx.js uColA*1.7 / uColB*2.2 and the white rim) -> body alpha <= 0.7, rim <= 1.1 in ramp.hi as a thin edge, colours from game.elements.fx(el) (light is ivory); no 0xffffff effect colour in your files; screenFlash/fovKick (sword/moves.js has 10 screenFlash calls) only for ultimate/awakened/finisher; settings.flashReduce; NEVER call game.hitstop in your files - finisher and parry feel go through vfx.hitFeel tiers 'ult'/'parry' (playtest3/melee.js:19 stays); (2) castId = ctx.castId ?? game.nextCastId() per move on every hit and spec; every PRIVATE material through game.vfx.applyPlayerFx?.(m, {role}) (side effect only); every player FX object depthWrite:false in the transparent pass; cached materials (0 per move) and pooled meshes; (3) dodge-cancel windows (PLAN §5.8) written to game.player.action.dodgeCancelable (existing field written at sword.js:408-416 and read at player.js:1121; there is no sword.dodgeOk): every combo swing cancellable before t0 and from t1 with the locked span <= 0.25 s (v3 up to 0.61 s for c4 fire), charged cancellable while charging and from 0.10 s after release, actives from 0.10 s after the first damage frame (0.35 s if none), ultimates from the first damage frame, finishers not cancellable but fully invulnerable; (4) per-cast tier ceilings of §1.4. P0-B (merge kit-p0a): (5) NEW src/sword/motifs/{earth,nature,light,shadow}.js: the §3.5 shapes (earth.rock faceted chunks with strata vertex bands, earth.spike, earth.slab, nature.vine growth-mask tubes, nature.thorn, nature.petal 5-petal, nature.leaf, light.ray wedges/pillars, light.halo, light.feather, shadow.tendril, shadow.crescent, shadow.raven low-poly with 2-frame wing flap) via kit.registerShape and all 9 motif kinds per element via kit.registerMotif following the §3.5 rules and never-lists (light ivory, never saturated gold; shadow never magenta; no hatch/chevrons/diamonds). (6) Archetype-level v4 looks for EVERY melee archetype (sword/archetypes.js, moves.js, elmoves2.js, classmoves.js, bespoke.js, fx.js) so every registry skill declares at least 'archetype' and meets its ceilings and floors, plus the §3.6 melee rules (charge line anticipation, slash ribbon carrying the element motif on its leading edge, <= 6 sparks per contact, burst only on the final hit, ground motifs from the impact point forward; longsword wide crescents, hammer radial ground impacts + shield rune flash, daggers twin thin cuts 0.12 s with shadow afterimages). (7) Bespoke melee looks (melee delta column of §3.7) for the bespoke set: the 12 starred skills, every *.basic, *.charged and *.ult, and the skills of starter_sword, starter_paladin, starter_shadowblade loadouts; each row's signature shape unique inside its element. (8) NEW src/sword/looks.js: sword.lookOf(id) -> declared level; ML1 verifies by measurement. (9) --sheets: tools/playtest4/sheets/melee/<id>.png. P1: bespoke looks for the remaining rows, finisher polish within the F budget, per-weapon smear textures. ACCEPTANCE (B): playtest4 melee ML1 (all registry skills >= 'archetype', bespoke set 'bespoke', verified by measurement; ceilings and floors; combo dodge lock <= 0.25 s per swing via player.action.dodgeCancelable; finishers invulnerable; 0 new materials per move; no game.hitstop in melee files); retention >= 95% verified at integration; tools/playtest3/melee.js passes.",
    "depends_on": [
      "core",
      "vfx",
      "tells"
    ]
  },
  {
    "owner": "player",
    "files": [
      "src/player.js",
      "src/player/*",
      "tools/playtest3/player.js",
      "tools/playtest4/player.js",
      "docs/v4/notes/player.md",
      "docs/v4/requests/player.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/player on branch v4/player, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: tells (tells-p0a). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/player.md (what you built, APIs, numbers measured) and docs/v4/requests/player.md (requests to other owners). Put your automated checks in tools/playtest4/player.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: easier, fairer dodging and defence, the optional witch time, story auto-revive, the combat camera, and the player model's draw-call cost (U5, U6, U1). P0: (1) Kits (PLAN §5.8) in player/kits.js: i-frames mage 0.30, sword 0.30, ranger 0.42 (whole flip), paladin 0.20 + super armour 0.38, spiritcaller 0.30, shadowblade 0.40; perfect windows 0.20 (shadowblade 0.22, paladin 'perfect brace' 0.15 with perfect-block effects), +0.05 s grace for every class; guard/parry perfect 0.22; kit names exactly the §6.10 glossary; expose kit.defend.canParry per §6.11 (barrier, guard, shield, counter; not focus or ward). (2) Perfect mechanism (§5.8): on a dodge press take t = min(game.tells.nextImpact(pos), game.enemies.orbEta?.(pos)); t <= perfectWin x assist.perfectMul -> pending-perfect, emit perfectDodge when the i-frames absorb that hit; record player.lastEnemyHit {t, amount, attacker, attack, appliedStatuses} from playerHurt and, for a dodge within 0.05 s after it, refund the HP, clear those statuses (game.combat.clearStatus) and emit perfectDodge {grace:true}; i-frames x assist.iframeMul. (3) Input only through game.input.keymap (actions dodge, dodgeAlt, defend, jump, sprint ...; remove the KeyQ/KeyE literals in player.js:1122-1148); 0.25 s buffer for dodge/dodgeAlt/defend queued while game.player.action.dodgeCancelable is false or game.spells.castLock > 0, executed on the first allowed frame; dodgeBuffered/dodgeRejected (§7.5). Every dodge moves along the held movement direction (camera-relative) when one is held; ranger backflip flips toward the input (backward when none). (4) Post-hit protection: after any non-DoT hit >= 12 damage ignore hits whose attack.kind is 'melee' for 0.35 s. (5) Witch time (§5.9), only if settings.witchSlowmo, the dodged tell targeted the player, no other tell targeting the player completes within 0.3 s of that impact, and >= 4 s since the last: game.timeScale.set('witch', 0.5, 0.6, {compensate:true}), game.post.setGrade('witch', 0.6), game.vfx.fxFactor?.('witch', 0.6, 0.6); always: perfectDodge {attacker, witch, grace}, counterReady {dur:1.2} (next basic attack = class counter). (6) Per-entity hitstop: the player's animation freezes while game.player.hitstopUntil is in the future; input buffering continues. (7) Story autoRevive (§5.12) in the respawn path (player.js:656): revive in place with 50% HP after 2 s. (8) Camera (§5.11): boom 5.5 -> 6.6 m, FOV +4, shoulder 1.2 -> 0.9 while an enemy is aggroed within 15 m (eased 0.6 s); +10% during any boss tell (game.tells.active()); boss cameraHint while the boss is aggroed within 40 m; settings.cameraDist x0.9/1/1.15; ignore userData.noCameraCollide in the boom collision. (9) Player model (player/model.js, classes.js, cape.js): merge into one skinned mesh per material -> <= 8 scene calls, <= 4 shadow calls, <= 30k tris, <= 6k shadow tris for every class (v3: 25 + shadow); player/fx.js effects through game.vfx.applyPlayerFx on private materials and element ramps (no white); remove the per-frame allocations in cape.update (cape.js:85), _bake (fx.js:190) and deform (model.js:134); cape/animation visual work once per frame on game.frame.lastStep. P1: soft lock-on (T / middle mouse) keeping the target in the middle third with the ring pulsing on tellStart; aim assist (settings.aimAssist); directional hurt poses. ACCEPTANCE (B): playtest4 player PL1 (all items of the PLAN §7.8 row); tools/playtest3/player.js updated for the new kit numbers and passing.",
    "depends_on": [
      "core",
      "tells"
    ]
  },
  {
    "owner": "ux",
    "files": [
      "src/ui.js",
      "src/ui.css",
      "src/ui/*",
      "src/story.js",
      "src/story/*",
      "src/cinematic.js",
      "src/cinematic/*",
      "src/audio.js",
      "src/audio/*",
      "tools/playtest3/ui.js",
      "tools/playtest3/narrative.js",
      "tools/playtest4/ux.js",
      "docs/v4/notes/ux.md",
      "docs/v4/requests/ux.md"
    ],
    "task": "Read docs/v4/PLAN.md fully: it is binding (revision v4.1) and wins over docs/v3/* and ARCHITECTURE.md on any conflict; read ARCHITECTURE.md and docs/v3/CONTRACT.md for the existing module layout. Work in the git worktree /home/user/wt4/ux on branch v4/ux, created from the tag core-p0a. Edit ONLY your files (PLAN §7.1; any file not listed there belongs to core); reach every other module through game.* with feature detection and a working fallback (PLAN §7.2 rules 1-2; cross-owner static imports only for the pairs listed in rule 1, new exports only via 'import * as NS'). Your start is gated only by the tag core-p0a (wave B). Soft dependencies: tells (tells-p0a), mobs (none (read its codex data at integration)), bosses (none (read its codex data at integration)). Before a tag exists, code against the core stubs and fallbacks; as soon as it exists (git fetch is not needed: all worktrees share the repo; check with 'git tag -l'), 'git merge <tag>' read-only into your worktree. Merge only tags, never another owner's branch head, and never edit merged files (PLAN §7.2 rule 3). Binding rules: no new lights; no program-key flips (colour/element variation through uniforms or attributes, never defines); every new material returned from warmup()/prewarm() or warmed with game.render.warm; per-frame code follows PLAN §2.7 (no allocation, reused return objects, addUpdateRange on dynamic attributes, matrixAutoUpdate=false on static objects) and visual-only work runs once per frame when game.frame.lastStep is true (§2.5); no 0xffffff effect colours and no emissive multiplier > 1.2 (rule 5); player-facing Korean text only in the data tables of rule 6, with the exact PLAN strings and the §6.11 tokens ({dodgeKey}, {defendKey}, {jumpKey}, {punishSec} ...); persistence only through game.save.section with your reserved section names (rule 11); angles in radians, half-angle. Ship every P0 item before any P1 item; a slipped P1 must leave a working fallback. Create and write docs/v4/notes/ux.md (what you built, APIs, numbers measured) and docs/v4/requests/ux.md (requests to other owners). Put your automated checks in tools/playtest4/ux.js on the core harness tools/playtest4/harness.js (PLAN §7.8; it is in tag core-p0a). Keep tools/bootcheck.js, playtest.js, playtest2.js and playtest3.js passing; update ONLY your own playtest3 section, using the expectations of PLAN §7.9, and note it. Run the game headless with the pre-installed playwright (do NOT install anything): chromium.launch with args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], served by a tiny node http server on a random port 8100-8999 (tools/shot.js is a ready example), URL params of docs/v3/CONTRACT.md §21 plus PLAN §7.6 (every performance measurement with prod=1&governor=0&seed=1); viewports <= 1280x720, F-*/B-* scenes at 640x360, runs short (4 CPUs shared with other agents; SwiftShader absolute timings are not representative, but draw calls, triangles, fragments, uploads, pixel counts and CPU ms are). Commit only your files in small commits with clear messages; never push; never rebase or amend a commit you tagged. Your task is done when every check of yours marked B in the PLAN §7.8 table passes on your branch (with the tags you merged and stubs for the rest) and the legacy tests pass; checks marked I are verified by core at integration, so make them as likely to pass as you can and report their branch-side numbers in your notes. YOUR SCOPE: friendliness (U2) and the UI/audio half of readability (U6): HUD, menus, codex, hints, guide/legend, story onboarding, cinematics and all audio. Data you consume (feature-detect all): game.enemies.codex() (until mobs/bosses data exists at integration, test with a fixture entry inside your playtest section), game.tells.active() + tell events + tells.renderThumb, playerHurt (§7.5), enemyEncounter, bossSpawn.brief, bossBroken, qualityLevel, dodgeRejected, game.quality (renderSize, benchmark), game.input.keymap.label, game.settings keys of §6.8. P0: (1) Templated, class-aware copy (§6.11): ui.fmtKo(text, ctx) with tokens {dodgeKey} {defendKey} {jumpKey} {sprintKey} {interactKey} {skillsKey} {codexKey} {confirmKey} from game.input.keymap.label, {dodgeName} {defendName} from the kit, {punishSec} from live values; the can-parry rule (mage, sword, paladin, shadowblade yes; ranger, spiritcaller no -> parryKo hidden, hint variant B); no literal key names or windup seconds in any data table. (2) Hints (§6.2): game.ui.hint(id, textKo, opts) with ONE slot top-left under the compass, action-gated dismissal, <= 2 shows per id per save persisted with game.save.section('hints'), the full catalogue with exact Korean texts and variants; remove the timed TUT queue (ui.js:709, 926-938, 1457); never during cinematics/dialogue; only tell/punish/projectile/hazard hints in boss fights; MP hint text chosen after checking whether basic hits restore MP. (3) Codex (§6.5): 도감 tab '몬스터' (unknown / seen / defeated, role, weak/resist icons, tip, attacks 이름 — 예고 — 대처 + parryKo when allowed, kill count) with model thumbnails from game.render.snapshot(game.enemies.previewModel(type)) at unlock (fallback glyph), persisted with game.save.section('monsterCodex') (fallback localStorage 'aw_monster_codex_v4', try/catch; the v3 'codex' save key stays reaction discoveries); first-sight one-line strip on enemyEncounter {sight:true} and the full 첫 조우 card only after that enemy dies or 3 s after combat; boss brief card from bossSpawn.brief; weakness/resist icons on every enemy HP bar after the first hit (larger on the boss bar); boss attack name under the boss bar for tells >= 1 s; '붕괴!' banner on bossBroken. (4) 가이드 tab (§6.4, P0): 핵심 조작 from the keymap, 위험 표시 읽는 법 with REAL rendered thumbnails from game.tells.renderThumb(kind) and the exact §5.1 legend texts, 회피와 방어, 원소 반응 기초, 현재 목표; auto-opens at the first pause; linked from the death recap. (5) Death recap (§6.7) from a ring buffer of playerHurt: killer + attack line, last 5 hits, grouped DoT/hazards, class-correct codex tip, buttons 다시 일어서기 / 보조 기능 조정 / 몬스터 도감 보기 / 위험 표시 보기, respawn line, the 3-deaths easy suggestion; story difficulty shows only the auto-revive strip. (6) Threat UI (§5.6): off-screen arrows from game.tells.active() (ellipse at 42%, tell colour, progress ring, max 4, within 1 frame of tellStart, settings.offscreenArrows), enemy orb dots, directional damage arc replacing the radial hurt vignette, hazard edge vignette with the source name. (7) Settings menu (§6.8): tabs 보조 기능 / 접근성 / 게임 / 조작 / 그래픽 with every key, exact Korean labels and values ('재시작 후 적용' for msaa/shadow type/point lights), quality values 낮음/보통/높음 (자동 품질 조절 is the separate toggle), read-only 렌더 해상도 line, 성능 테스트 button + result card with 복사 (§2.8), FPS overlay '60 fps · 자동 품질 L1 · 렌더 1344×756', the high-quality offer and drop-back toasts of §2.2 (texts there), key rebinding for dodge, dodgeAlt and defend through game.input.keymap.rebind, difficulty cards on 새 게임 with the §6.8 descriptions (normal: '처음이라면 추천. 균형 잡힌 기본 난이도예요.'), uiScale CSS variable with a 12 px floor. (8) HUD declutter (§6.9) with pooled DOM nodes and no per-frame layout reads; ui.update <= 1.5 ms median / <= 6 ms p99. (9) Onboarding (§6.1): short intro (~25 s, 4 key shots of cinematic/intro.js, default on first run, settings.introShort), Noah trimmed to 6 lines + '옛이야기를 더 듣는다', hold F/Space fast-forward (>= 3x text + auto-advance 0.4 s) and Esc -> '대화 건너뛰기', class panel badges/stars/templated one-liners/'자세히'/change-later line, training telegraph lesson (dummy.practice('danger') x2, ('parry') x1 with class-correct texts), objective 'how' lines in story/quests.js and world.setBeacon on every objective (§6.3). (10) Build help (§6.6): 추천 node glow, 자동 배분 (on for 이야기) through progression.canLearn/learn + auto-equip + toast, reaction chip tooltips (descKo per family in ui/text.js), inline lock reasons, equip hint. (11) Copy (§6.10): callouts 완벽 회피!/완벽 패링!/완벽 방벽!, HUD_KO.check exact strings incl. freeze and kalis, jargon replacements, dodge/defend names in story/script3.js and ui/text.js, '빙결의 글라시아', all §6.2/§4 copy fixes. (12) Audio (src/audio*): synth recipes for 'tell_light','tell_heavy','tell_parry','tell_unblockable','tell_jump','tell_commit','punish','offscreen','perfect_dodge','dodge_rejected','break_boss','codex_unlock' (distinct, short, readable under music), spatialised tell sounds with <= 2 concurrent (nearest by remaining time), music ducked -3 dB while a tell targets the player; unknown names silent no-ops; cinematic flashes <= 0.15 s, never pure white, off with flashReduce. P1: dialogue backlog, 화력/생존 build paths, breadcrumb trail. ACCEPTANCE (B): playtest4 ux UX1-UX3 (codex/encounter checks with a fixture entry on the branch; real data at integration); tools/playtest3/ui.js and narrative.js updated per §7.9 and passing.",
    "depends_on": [
      "core",
      "tells",
      "mobs",
      "bosses"
    ]
  }
]
```
