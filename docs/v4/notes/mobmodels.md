# mobmodels — v4 notes

Owner: mobmodels (`src/enemies/models.js`, `src/enemies/models2.js`, `src/enemies/mobs/*`, `tools/playtest4/mobmodels.js`, `tools/playtest4/sheets/mobs/*`).
Branch `v4/mobmodels`, worktree `/home/user/wt4/mobmodels`.

## models-p0a (early contract tag)
- `src/enemies/mobs/index.js`: `createModel(type, opts)` (null until a type has a v4 factory), `wrapLegacy(v3Model | Object3D)`, `preview(type)`, `prewarm(game)`, `TYPES`.
- `wrapLegacy` augments the v3 model object in place (all v3 fields stay) with `meshes, proxy (= v3 outline mesh), lod (= body), bones, features (all false, legacy:true),
  tellAnchors, flashUniform (setter; lazily clones the body materials once per entity, same program keys), rimSource(), pose(name, t), update(), dispose()`.
