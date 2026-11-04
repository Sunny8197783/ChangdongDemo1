# tells — v4 notes

Owner: tells (`src/tells.js`, `src/tells/*`, `tools/playtest4/tells.js`, `docs/v4/notes/tells.md`, `docs/v4/requests/tells.md`).
Branch `v4/tells` (from `core-p0a`), worktree `/home/user/wt4/tells`. Merged read-only: `world-p0a`, `world-b`, `kit-p0a` (vfx). `core-b` did not exist at the final run, so the core
render path is the `core-p0a` version (v3 composer chain, global hitstop).

Tags: **`tells-p0a`** (attack / handle / hitTest / canAttack / punish / events + the instanced decal), `tells-b` (before `kit-p0a`
appeared), **`tells-b.2`** (this state: `kit-p0a` merged, T2 re-run with kit linework over the decals).

## What exists

`game.tells` (factory `createTells(game)` in `src/tells.js`; returns null → core stub when `game.render.threatScene` is missing). Every visual lives in
`game.render.threatScene` (drawn by core after the post chain: never bloomed, fogged, tone-mapped or dimmed by player FX).

| File | Content |
|---|---|
| `src/tells.js` | TellHandle timing, events, persistence (`tells` save section), canAttack / punish / nextImpact, active() / footprints(), rim assignment, legacy `telegraph(o)` adapter, `hazardAt`, debug |
| `src/tells/shapes.js` | shape records, decal quads, footprint packing (`FOOT_KIND`), `hitTest`/`shapeDistance` = core `tellgeom.js` reference |
| `src/tells/timing.js` | §5.7 floors (`MIN`, `LOCK` from core), melee classification, sounds, perfect window, teaching slow-mo, end animation |
| `src/tells/decals.js` | ONE ShaderMaterial for every decal shape; instanced families `radial` (circle/ring/cone, 16 shared with `linear`), `linear` (line/capsule/conecap), `zone` (hazard/safe, 8), `wave` (jump shockwaves, 4), `marker` (projectile rings, 12), `ribbon` (P1, 6) |
| `src/tells/icons.js` | ONE instanced sprite batch (64) over a canvas mask atlas: glint star, ⚠, ⤒, !, diamond sparkle, rising chevron, ring, `공격 기회!` |
| `src/tells/body.js` | rim clones (4 slots; skinned + static material per slot), `rimSources(e)` fallback chain |
| `src/tells/zones.js` | hazard / safe zones, projectile markers, shockwaves, punish sparkles |
| `src/tells/thumbs.js` | `renderThumb(kind, size)` via `game.render.snapshot` (same materials) |
| `src/tells/text.js` | Korean world text (`공격 기회!`) |

### Timing (one source)
- `attack(e, spec)` → `TellHandle | null` (null while `canAttack(e, {melee})` is false). `dur = tellDuration(windup, cls, assist.tellMul, e.timeMul)` (core reference:
  `max(windup, MIN[cls]) × max(0.9, tellMul) × timeMul`), on `game.enemyTime`; lock at `max(spec.lockAt ?? 0.35, LOCK[cls])` before the hit. No first-encounter bonus.
- `consumeStrike()` is the only strike latch: true exactly once on the first sub-step with `enemyTime ≥ start + dur` (emits `tellEnd {reason:'strike'}`); `stop(reason)` →
  `tellEnd {reason}`. Handles never consumed are cancelled 2 s after their hit; handles of dead/dying/removed enemies are cancelled.
- `tellCommit` at the lock (from `update`, once per frame) + `tell_commit` / `tell_parry` sound + glint; `tellFirst {tell}` once per kind per save (save section `tells`
  = `{seen}`); teaching slow motion `timeScale.set('teach', 0.4, 0.6, {compensate, priority: 2})` ~0.3 s before the hit of that first tell when `assist.teachSlowmo`.
- Per-entity hitstop: `update` extends un-struck handles by the frame's `enemyTime` delta while `e.hitstopUntil > realTime` (see requests/core).
- `spec.shape.follow`: origin follows the enemy until the lock; `setPos/setDir/setEnd` are ignored after the lock (aim frozen).
- Jump tells: travelling ring from the hit (12 m/s, 0.25 m band, `maxR`), `h.shockwaveR()`, `h.shockwaveHits(pos, pad)`.
- `canAttack(e, {melee})`: false during the punish window; with `melee` also false when the enemy is outside the camera frustum and > 3 m from the player.
  `attack()` classifies melee from `spec.melee` or `cls ∈ {mobLight, mobHeavy, combo, elite}` (projectile tells are never melee).
- `punish(e, dur, {mul = 1.25})` → `e.vulnerableUntil` (enemyTime) / `e.vulnerableMul`, `punishWindow`, `punish` sound, 4 rotating diamonds + `공격 기회!`.

### Decal shader (§5.2, §5.3)
Local shape SDF per fragment (circle, ring, cone = pie SDF, line = box, capsule = segment, conecap = segment ∪ rotated pie), metres-per-pixel from `fwidth`:
dark outer band `max(0.12 m, 3 px)` α 0.75 outside the true edge · rim `max(0.18 m, 3 px | strong 5 px)` α 0.95 inside the edge (parry: 12 dashes per circle / 1 m dashes on
straight edges; unblockable: double rim), ×1.5 after the lock, lock flash = own hue × (1 + 0.35) clamped (never toward white) for 0.1 s · fill 0.16 (strong 0.28, hazard hatch
0.18, safe 0.12) · region behind the linear front 0.32 · front line 0.12 m (≥ 1 px) in a lighter rim tint, `#FFF4F0` once `remaining ≤ 0.20 s × assist.perfectMul` · 3 flat
chevrons scrolling 0.6 Hz toward the hit on directional shapes · end: 0.5 fill for 2 frames, fade 0.12 s. Colours are uniform arrays indexed by tell kind, refreshed from
`threatColor(kind, assist.colorblind)` when the preset changes (shapes unchanged). Placement: grid quads mapped in the vertex shader (orientation-preserving, normals +y,
DoubleSide), height from `world.heightField` (same triangle interpolation as `getHeight`, texelFetch), lift 0.06 m; flat at `pos.y` when the shape stands > 1 m above the terrain.
Fallback without `heightField`: per-decal 24×24 CPU height grid rows in one R32F texture, rebuilt only when the decal moves > 0.1 m (same program, same families).
Soft occlusion: scene point from `post.sceneDepth` (`projInv`, `camWorld`), occluder only when nearer by > 0.3 m **and** > 1.0 m above the decal plane → α × 0.40.

### Body tells
Rim clones of `e.rimSource()` (≤ 2 meshes; fallback `e.model.skin.meshes`, then the two largest opaque meshes): SkinnedMesh bound to the source skeleton/bindMatrix (or Mesh),
`matrixAutoUpdate = false`, matrices copied in `preOverlay()`; BackSide hull expanded 2–3 px in clip space (+1 px after the lock, +1 px strong), alpha 0.35 → 1 over the windup,
flash at lock; fragment hard depth compare `hullDepth ≤ sceneDepth + 0.05 m`. ≤ 4 rim draw calls (nearest by remaining time, one mesh per enemy first, then second meshes).
`preOverlay` clears the canvas depth when rims are active (the hull self-occludes with depthTest).

### Other APIs
`projectile(obj, {r = 0.6})` · `hazard({pos, r|shape, dur, kind, nameKo})` · `safe({pos, r|shape, dur})` (safe zones are in `footprints()`) · `hazardAt(pos, pad)` ·
`telegraph(o)` (v3 adapter: full degrees → rad half-angle, or `halfAngle` in rad; `tell` / `unblockable` / grab → unblockable, parryable → parry, else danger;
times on `game.time` like v3; v3 handle + `setPosition` alias + `onDone`; `owner:'player'` → timed handle without a decal, since the threat scene is enemy-only) ·
`active()` (reused records + `locked`, `handle`) · `footprints()` (`{data: Float32Array(64), n}`, 8 nearest to the player: true shapes, conecap = capsule + cone, safe zones,
hazards, winding-up bodies r + 1 m) · `renderThumb(kind, size)` (`danger, parry, unblockable, jump, projectile, hazard, safe, punish, perfect`) · `MIN`, `LOCK` ·
`debug.{setVisible, pixelsOf, pool, rims, sprites, occlusion, heightAt, reset, resetSeen, handles, …}`.

## Measured (branch, SwiftShader, `prod=1&governor=0&seed=1`, medium)

| Metric | Measured | Budget |
|---|---|---|
| Overlay draw calls with every cue live (decals, zones, wave, marker, sprites, punish) | 6 (12,950 tris); + rims ≤ 4 | ≤ 12 (decals ≤ 6, rims ≤ 4, sprites 1, markers 1) |
| Decal draw calls (families visible) | ≤ 5 (radial, linear, zone, wave, ribbon) | ≤ 6 |
| tells programs | 4 (`tells-decal`, `tells-sprite`, `tells-rim` skinned + static) | ≤ 4 (kit + tells ≤ 10) |
| Uploads with 16 decals live | 1,536 B/frame (one interleaved bufferSubData per visible family) | ≤ 16 KB |
| Allocation in `tells.update` + `preOverlay` (10 tells + zones + marker + punish, CDP sampling 1 KB) | ≈ 6 B/frame | ~0 (§2.7) |
| `tells.update` CPU (same load) | median < 0.1 ms, p95 0.1 ms | — |
| T1 changed px at 8 m, 960×540, grass on | circle 61.8k, ring 166.8k, cone 32.7k, line 39.3k, capsule 34.7k, conecap 35.2k | ≥ 600 (v3: 0) |
| heightField conformance (6 m decal, 5 spots, vertices + cell midpoints) | max 0.008 m | ≤ 0.1 m |
| T2 telegraph px with player VFX over the decals ÷ hidden (kit-p0a linework + legacy particles) | 1.018 / 1.013 / 1.005 / 1.000 (before kit-p0a: 1.06–1.07) | ≥ 0.95 |
| T2 grass on ÷ off | 0.997–0.998 | ≥ 0.95 |
| T2 behind a 2.6 m wall (median per-pixel contribution ratio) | 0.418 (mean 0.437: the wall's lowest metre is not an occluder by rule) | 0.40 ± 0.05 |
| T2 rim colour bloom on vs off | ΔRGB max 1 | ≤ 8 |
| T4 rim clone (bokoblin, v3 model): interior changed / perimeter outlined | 8.1–12.6 % / 90–96 % (pose varies between runs) | ≤ 15 % / ≥ 60 % |
| Progress linearity / strike latch | error 0 / exactly once, on the due sub-step | ≤ 0.02 / ≤ 1 sub-step |
| hitTest vs core reference | 0 mismatches / 10,000 points (+ 1,000 handle `contains`) | 0 |
| Flash rate (rim region luminance, 20 Hz sampling) | 0 peaks | ≤ 3 Hz |
| Boot programs (bootcheck, all configs) | 146 (core-p0a baseline 142 + the 4 tells programs) | ≤ 130 overall (core/C6, integration) |

Integration-only (I) checks to verify at wave C: T2 with real looks (R-mage, R-sword, R-boss) — the branch form shows the threat scene is independent of anything drawn in the
main scene (ratios > 1 because particles behind the decal raise the per-pixel diff); enemy-body-visible rows depend on mobs adopting `tells.attack` + rim sources.

## Tests on this branch
- `node tools/playtest4.js tells`: **95 passed, 0 failed, 0 skipped** (110 s; T1–T4, the no-heightField fallback page, rule 5/6 greps), with world-b + kit-p0a merged. `TELLS_ONLY=<regex>` runs a subset (development only).
- `node tools/bootcheck.js` (15/15 configs reach their state; only the expected 404s of the two renamed-directory configs), `tools/playtest.js --quick`: pass.
- `tools/playtest2.js`: passed fully before `kit-p0a`; with `kit-p0a` merged one check fails — `sword: wind combo hitstop on every hit` (vfx's v4 hitstop
  0.025 s vs the v3 `≥ 0.03` assertion). That expectation is core's to rewrite (§7.9 row 1, `hitstopLog`); it is not caused by tells.
- `tools/playtest3.js` (all sections): before kit-p0a 1260 passed, 0 failed, 1 skipped; final run with kit-p0a: see the report.
- No playtest3 section is owned by tells (§7.1), so no legacy expectations changed (rule 9).

## P1
- **Done**: 0.35 m vertical rising-edge ribbon on circle/ring AoE rims > 6 m (same program, `ribbon` family, height grows with the progress; 1 call).
- **Cut**: the faint element glyph in the fill (needs the vfx glyph atlas from `kit-p0a`, which did not exist; fallback = no glyph, nothing else depends on it).

## Known issues / notes
- `kit-p0a`'s `vfx.telegraph` forwards **every** call to `tells.telegraph`, including the player-cast `fx('telegraph')` AoE previews of spells/sword archetypes, which
  therefore show as red danger decals in the threat scene until magic/melee pass `owner:'player'` (the adapter then skips the decal) or stop calling it (requests/vfx).
- Mobs/bosses still use `ctx.tele` (→ the adapter, timed on `game.time`) and `ctx.telegraphs.show` rings (main scene) until they adopt `tells.attack` (requests).
- `tools/playtest3.js combat` "natural P0 triggers … magma" (vfx-owned section, changed by `kit-p0a`) failed in 2 of 4 runs on this branch after the kit merge (passes on retry);
  it does not involve tells (no `tells.attack` callers exist yet).
- `canAttack`'s off-screen test uses the camera frustum with the enemy's upper-body sphere; it recomputes the frustum per call (cheap, allocation-free).
- Thumbnails and the `공격 기회!` text use the system Korean font of the canvas; on machines without one the text cell falls back to the browser's default sans-serif.
