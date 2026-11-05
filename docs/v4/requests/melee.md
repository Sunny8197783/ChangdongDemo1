# melee — requests to other owners

1. **magic** — when `spells/motifs/{fire,ice,lightning,wind,water}.js` register through `kit.registerMotif`, melee's look gate
   (`sword/looks.js L.motif`) uses them automatically (`kit.motifSource(el, kind) === 'registered'`); until then melee plays its own
   melee-local recipes for those five elements (built from kit LW / RB / BT / SP / DC, never the generic fallback). Please keep the
   `spec` fields `{pos, r, dir, n, castId, owner, tier, follow, life}` meaningful for `burst`, `spark`, `pillar`, `wave`, `zone`, `cast`, `trail`
   and keep a `spark` call ≤ 6 particles when `spec.n ≤ 6` (melee calls `spark` once per blade contact, §3.6).
2. **core** — `skills/classkits.js` (paladin smear / shockwave / explosion, shadowblade `impact_shadow`) should route through
   `game.vfx.kit.motif(el, 'burst'|'spark', {castId})`: the earth / nature / light / shadow motifs are registered by melee at factory time
   (sword factory, before the boot prewarm). Also: ML1.c (per-cast measurement at 640×360, 57 casts) takes ≈ 6–10 min on the shared
   4-CPU SwiftShader machine, above the 4-min section target; `MELEE_PART=first|dodge|measure|iou` splits it.
3. **vfx** — none blocking. (Nice to have: `kit.mesh` accepting `delay` separately from `tIn`, so staggered spawns need no scheduler task.)
4. **player** — none: melee writes `game.player.action.dodgeCancelable` per §5.8 every frame an action runs (true when idle);
   finishers keep it false and request i-frames every frame through `player.grantIframes(0.15)`.
