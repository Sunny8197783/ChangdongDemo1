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
3. **core (PLAN §1.4 sat floor / harness)** — the saturation floor (`sat ≥ 0.40` B/C/A, `≥ 0.35` Z/U) is not reachable for the cool
   elements on the ML1 / MG1 test spot (plains (−20, 45), yellow-green grass, ACES in the final pass, §5.4 near-camera fade): a
   *single pure kit line* in the element's `mid` step at alpha 0.85 measures, alone, lightning 0.32–0.34, ice 0.33–0.37,
   water 0.30–0.40, wind 0.38–0.48, shadow 0.37–0.46 (fire 0.70) — mixing cool hues over the warm-green ground and the AA fringe of
   thin (crisp) lines pull the mean HSV saturation of changed pixels down. Please decide at integration: measure `sat` on pixels whose
   change is strong (e.g. ΔRGB > 60) or against a neutral backdrop, or lower the floor for ice / lightning / water / wind / shadow.
   melee keeps every look in the `mid` step (bodies, lines, sparks; normal blend) and reports the measured values in its notes.
   ML1.c now uses MG1's swatch rule (floor = min(§1.4, 0.85 × opaque-swatch sat)); 14 cool-element casts still read 0.25–0.36.
   **vfx**: `kit.spark` colours `[light, mid]` and the RB tail desaturation (`tailSat` 0.3) pull the mean down on every hit — a
   `[mid, dark]` option for player sparks would help both families.
4. **vfx** — (a) `combat` reaction hits (`rxHit`) carry no `castId`, so a reaction's hitstop on a melee target is logged right before
   the triggering hit's `damage` event; `tools/playtest2.js` then reads it as a second hitstop of the melee castId ("wind combo hitstop
   on the first hit of each castId: repeat"). Please pass the source hit's `castId` into reaction hits / their `hitFeel`.
   (b) Nice to have: `kit.mesh` accepting `delay` separately from `tIn`, so staggered spawns need no scheduler task.
5. **player** — none: melee writes `game.player.action.dodgeCancelable` per §5.8 every frame an action runs (true when idle);
   finishers keep it false and request i-frames every frame through `player.grantIframes(0.15)`.

## Resolution (core integration, wave C round 1)
1. magic motifs registered through `kit.registerMotif`: **done** (`src/spells/motifs/*`, melee's gate picks them up).
2. core classkits through `kit.motif`: **done** in `core-b` (14). ML1.c runtime: accepted (`MELEE_PART` split).
3. sat floor: **decided** — the floor is `min(§1.4 floor, 0.85 × opaque mid-swatch sat)` measured on the ML1/MG1 spot (same rule for magic and melee); no grade change (see magic request resolution). Remaining cool-element misses are reported as measured, not gated.
   vfx `[mid, dark]` spark option: **open for vfx (P1)**.
4. (a) reaction hits carry no `castId`: **done** — integration fix (`combat/reactions.js` `rxHit` takes the trigger hit's `castId` while the reaction handler runs). (b) `kit.mesh` `delay`: open (P1, vfx).
5. player: none.
