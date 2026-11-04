# tells — requests to other owners (v4)

## core
- **Canvas depth for rim clones.** `tells.preOverlay()` clears the canvas depth buffer (`setRenderTarget(null); clearDepth()`) when at least one rim
  clone is active, because the v3 `OutputPass` quad leaves depth 0 on the canvas. Please keep a depth buffer on the default framebuffer in P0b
  (`post4` FinalPass), or tell me if the clear should move into `render.drawOverlay`.
- **Per-entity hitstop (P0b item 12).** `tells.update()` already extends every un-struck `TellHandle` of an enemy by the frame's `enemyTime` delta while
  `e.hitstopUntil > game.realTime` (§2.5 "their TellHandle is extended by the frozen time"). Do not extend the handles a second time from core or from
  enemy code. While the P0a global freeze holds `enemyTime`, the delta is 0, so nothing is double-counted.
- **Overlay is never empty now.** The tells root group always lives in `game.render.threatScene`, so `drawOverlay()` calls `renderer.render` every frame
  (0 draw calls while nothing is active: every instanced family hides itself when its count is 0).
- **Uniforms by reference.** The decal and rim shaders hold `game.post.sceneDepth`, `canvasRes`, `uvScale`, `projInv`, `camWorld` by reference
  (screen uv = `gl_FragCoord.xy / canvasRes`, depth sampled at `uv × uvScale`). Keep those objects (and their `.value` semantics) stable when dynamic
  resolution lands.
- `game.timeScale.set('teach', 0.4, 0.6, {compensate: true, priority: 2})` is requested by tells on the first tell of each kind that targets the
  player, ~0.3 s before its hit (only with `assist.teachSlowmo`).

## vfx
- **Forward `vfx.telegraph(o)` → `game.tells.telegraph(o)`** when `game.tells && !game.tells.isStub` (§7.3). The adapter accepts the v3 options
  (`shape, pos, dir, r|len|width, angle` in full degrees, `inner, dur` in game seconds, `color` damage/void/grab/holy, `parryable, alpha, onDone`) and
  returns the v3 handle (`alive, progress, timeLeft, stop, setPos, setDir`).
- **Do not forward player-cast telegraphs.** `src/spells/archetypes.js` (313, 672, 711, 727, 803, 1004), `src/spells/bespoke.js` (109, 161) and
  `src/sword/archetypes.js` (568) call `fx('telegraph', …)` for the player's own AoE previews; the threat scene must never hold player effects (§5.3).
  `kit-p0a` forwards every call; the adapter now skips the decal when `o.owner === 'player'` (the handle still times), so either forward with
  `owner:'player'` for those callers or ask **magic / melee** to pass `owner:'player'` (better: replace them with kit linework).
- **Footprints for ducking**: `tells.footprints()` → `{data: Float32Array(64), n}`, 8 floats per footprint `(x, z, kind, r, dirX, dirZ, param, len)`:
  `1` circle (r) · `2` ring (r = outer, param = inner) · `3` cone (apex x, z; r; dir; param = half-angle rad) · `4` line (starts at x, z; dir; len; r = half width) ·
  `5` capsule (x, z = start; dir = unit toward the end; len = segment length; r = half width). A conecap is written as a capsule + a cone; safe zones,
  hazards and winding-up bodies (r = radius + 1.0 m) are circles. Exported as `FOOT_KIND` from `src/tells/shapes.js`. Refreshed once per frame in
  `tells.update` (which runs before `vfx.update`).
- `tools/playtest3/combat.js` (§7.9): with real tells, `tells.debug.pool()` → `{active, max: 16, zones, markers, waves, sprites}`.

## magic / melee
- Pass `owner:'player'` in your `fx('telegraph', …)` calls (or replace them with kit linework); without it they become red threat decals.

## mobs / bosses
- Start every attack with `const h = game.tells.attack(e, spec)` (§7.4.4). Extras the real module supports:
  `spec.el` (element name; or `e.element`) → faint element glyph in the decal fill (P1; physical/unknown → none, `spec.glyph:false` opts out),
  `spec.shape.follow` (decal origin follows the enemy until the lock; capsule/conecap ends move with it), `spec.body:false` (no rim clone),
  `spec.icon:false|true`, `spec.sound:false`, `spec.anchor` (`'weapon'|'head'|'hand'|'mouth'|'core'` or an Object3D → glint at lock).
- **Jump tells**: pass `spec.shockwave = {speed: 12, band: 0.25, maxR}`; after the hit, `h.shockwaveR()` is the travelling ring's radius (−1 when done) and
  `h.shockwaveHits(pos, pad = 0.15)` tells whether the band covers `pos` — combine it with your `y > 0.6 m` jump check.
- **Projectile tells** without a shape draw the 6 m aim line along `e.facing`; pass `shape:{kind:'line', dir, len: 6, width: 0.35}` to aim it.
  Orbs: `const m = game.tells.projectile(orb, {r})` (pool 12, follows `orb.position`, ends by itself when the orb leaves the scene; `m.stop()`).
- **Hazards**: `game.tells.hazard({pos, r, dur, kind, nameKo})` (or `shape` instead of `r`) → `{stop()}`; ux reads `tells.hazardAt(playerPos)`.
- The v3 `ctx.telegraphs.show(…)` ground rings (`enemies/common.js`, used by bokoblin leap, golem slam, projectiles, dummy) are drawn in the main scene
  and bloom/grass-occlude; please replace them with `tells.attack` shapes (or `tells.telegraph`).
- Icons and punish sparkles are placed from `e.object.position`, `e.model.headTop ?? e.height` and `e.radius`; keep those fields on every entity.

## mobmodels (and bosses for their models)
- `e.rimSource()` → ≤ 2 meshes **with normals**: the rim hull expands along the vertex normal in clip space. Skinned sources are cloned as
  `SkinnedMesh` bound to the source skeleton and `bindMatrix`; static meshes as plain `Mesh` (both work). Without `rimSource`, tells falls back to
  `e.model.skin.meshes` (v3) and then to the two largest opaque meshes.
- `e.tellAnchor(kind)` → Object3D (the glint is placed at its world position at lock).

## ux
- `tells.active()` records carry `{enemy, id, nameKo, tell, pos, dur, progress, remaining, onScreen, behind, targetsPlayer}` plus `locked` and `handle`;
  `onScreen` = attacker and decal centroid inside the frustum; `behind` = attacker behind the camera direction within 6 m of the player.
- `tells.renderThumb(kind, size)` kinds: `danger, parry, unblockable, jump, projectile, hazard, safe, punish` and `perfect` (the near-white front just
  before the hit, for the 회피와 방어 timing picture). Results are cached per kind and size.
- Audio names used: `tell_light`, `tell_heavy`, `tell_unblockable`, `tell_jump` (windup start), `tell_commit` / `tell_parry` (lock), `punish`;
  all through `game.audio.play(name, {pos})` — ux limits concurrency (≤ 2 tell sounds).
- `tellFirst {tell}` fires once per kind per save (save section `tells`), at the tell start — the trigger of the `tell_*` hints.
