# Requests from magic

Everything below is feature-detected in magic's code; nothing crashes if it is missing (a fallback is in place).

## player
- `player.grantIframes(seconds)` — dash / blink / leap i-frames. Fallback today: magic sets `entity.invulnerable` and clears it with its own timer
  (only if it set it).
- `player.addShield(amount, dur, {element})` — crystal pickups (12% maxHp, 6 s) and `light.aegis` (25% maxHp). Fallback: magic refunds absorbed
  damage on the `damage` event (works, but a lethal hit still kills through it).
- `player.refundDash(n)` (wind.step "refunds 1 dash pip") and `player.startGlide()` (wind.m3b "glide straight out of the slam") — no-ops until present.
- `player.addResolve(n)` (soul orbs give +15 resolve to melee classes) — optional.

## enemies
- `enemies.setTauntTarget(entity|null, dur)` / `getThreatTarget(e)` (CONTRACT §14): the treant, stone totem and water clone are combat allies
  (`team:'player'`, registered with `combat.registerAlly`) and call `setTauntTarget(ent, life)`.
- `enemies.setPlayerStealth(mul, dur)` for `shadow.sup` (0) and `shadow.shade` (0.15).
- Per-enemy sight loss for the raven swarm: `enemies.setSightMul(e, mul, dur)`; fallback fields `e.sightMul`, `e.sightMulUntil` (please honour them).
- Light beacon sets `e.revealedUntil` (game time) and clears `e.stealth` on enemies within 12 m — please treat `revealedUntil > game.time` as visible.
- Wind gust reflection (`wind.gust` `reflect:true`): magic flips `vel` and sets `team='player'`, `reflected=true` on `enemies.projectiles.active`
  (or `.list`) entries inside the cone and calls `p.onReflect?.()`; alternatively expose `enemies.reflectProjectiles(origin, dir, len, angleDeg)`.
- Enemy projectiles should query `world.projectileBlockAt` (the light mirror returns `'reflect'` for 3 projectiles; earth walls / aegis dome block).
- Lightning rods: `api.objects.near('rod', pos, r, out)` lists live rods, so enemy lightning bolts can strike a rod first (DESIGN §6.13).

## combat
- Please expose the cascade queue officially as `combat.enqueue(delay, fn, depth)` (magic uses `combat.enqueue || combat._debug.rx.enqueue`,
  falling back to its own timer) — used for mine chain triggers.
- `hit.fixed` is set by magic for the reaper execute and the shadow copies: please keep skipping the formula for `fixed` hits.
- `target.shatterMul` / `shatterMulUntil` is set by `ice.prison` (shatter +50% on that target) — optional to honour in the shatter handler.

## skills
- `lightning.m2b` (연속 질주, 2 charges) needs a charges counter in the runtime (`params.charges`); the archetype ignores it.
- `shadow.m1b` / `fire.m3b` "recast within 3 s": without a runtime recast hook magic does the return automatically at the end of the window /
  after the dash (documented deviation). A `skills` recast hook (`opts.recast`) would let us make it player-driven.
- `api.despawnSummon(skillId)` is available (treant / totem / clone / beacon / mirror / rods / mines).

## world
- Water-walk: `water.surf` and the ice bridge add short-lived `world.addPlatform` discs on the water surface; a dedicated "walk on water for t"
  flag would be nicer.
- `world.surface.meltIce(pos, r)` / `world.surface.regrow(pos, r)` are called if present (phoenix dash melting ice sheets; nature ultimates regrowing grass).

## narrative (cinematic / audio)
- `cinematic.finisher({element, cls, name, target, center, skillId, onBuildup, onImpact, onEnd})` is used for `water|nature|light|shadow.finisher`.
  Optional `cinematic.burstAt(point, element)` hook is called at the finisher impact.
- SFX keys used (all guarded): `cast_<el>`, `impact_<el>`, `explode_<el>` for the 9 elements, `charge`, `blessing`, `crystal`, `finisher_charge`,
  `finisher_impact`, `ui_select`.
