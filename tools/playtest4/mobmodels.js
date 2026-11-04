// playtest4 section: mobmodels (PLAN v4 §7.8 MM1, MM2). Owned by mobmodels.
//   MM1 (B): model contract for every type (incl. wrapLegacy); build once per type (spawn ≤ 1 ms, first sight ≤ 8 ms, shared geometry);
//            tri budgets; ≤ 3 draws (LOD ≤ 2 beyond the LOD distance); shadow via LOD ≤ 2k; aggregate 12-mob budget (≤ 140k + 24k shadow, ≤ 36 + 12 calls).
//   MM2 (B + review): features checklist; eye group ≥ 6 px at 8 m (1280×720); outline visible on 4 sides on the Elderwood floor;
//            wolf / voidknight / wraith body luma ≥ 0.18 linear; turntable sheets (--sheets) → tools/playtest4/sheets/mobs/<type>.png.
// Branch-side: the mobs behaviour files may still build v3 models, so MM1/MM2 instantiate the registry directly in the booted page.
const path = require('path');

const TYPES = ['bokoblin', 'shaman', 'chuchu', 'lizard', 'shroom', 'wolf', 'wraith', 'voidknight', 'dummy'];
const CHU = ['normal', 'fire', 'ice', 'lightning', 'wind', 'water', 'nature', 'light', 'shadow'];
const BUDGET = { bokoblin: 8000, shaman: 7000, chuchu: 4000, lizard: 8500, shroom: 7000, wolf: 8000, wraith: 6000, voidknight: 9000, dummy: 9000 };
const PROXY = { bokoblin: 2500 };

module.exports = async function mobmodels(PT) {
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage', { w: 640, h: 360 });
  PT.check('boot: game.ready', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }

  // ------------------------------------------------------------------ MM1: registry + wrapLegacy contract (models-p0a)
  const p0a = await pg.run('MM1 contract', async ({ TYPES }) => {
    const MM = await import('/src/enemies/mobs/index.js');
    const g = window.game, T = g.THREE;
    PT.check('registry exports createModel/wrapLegacy/preview/prewarm/TYPES', ['createModel', 'wrapLegacy', 'preview', 'prewarm'].every((k) => typeof MM[k] === 'function') && Array.isArray(MM.TYPES));
    const mats = MM.prewarm(g);
    PT.check('prewarm(game) returns materials', Array.isArray(mats) && mats.length >= 3 && mats.every((m) => m && m.isMaterial), mats.map((m) => m?.type));
    const contract = (m, label, legacy) => {
      const bad = [];
      if (!m || !m.root?.isObject3D) return ['root'];
      if (!Array.isArray(m.meshes) || !m.meshes.length || !m.meshes.every((x) => x.isSkinnedMesh || x.isMesh)) bad.push('meshes');
      if (!legacy && !(m.proxy && m.proxy.isSkinnedMesh)) bad.push('proxy');
      if (!(m.lod && (m.lod.isSkinnedMesh || m.lod.isMesh))) bad.push('lod');
      for (const k of ['root', 'spine', 'head']) if (!m.bones?.[k]?.isObject3D) bad.push('bones.' + k);
      const f = m.features || {};
      for (const k of ['face', 'hands', 'springs', 'aoVertexColors', 'lod']) if (!(k in f)) bad.push('features.' + k);
      for (const k of ['head', 'core']) if (!m.tellAnchors?.[k]?.isObject3D) bad.push('tellAnchors.' + k);
      if (!m.flashUniform || typeof m.flashUniform.value !== 'number') bad.push('flashUniform');
      const rs = m.rimSource?.();
      if (!Array.isArray(rs) || rs.length < 1 || rs.length > 2 || !rs.every((x) => x.isSkinnedMesh || x.isMesh)) bad.push('rimSource');
      for (const k of ['pose', 'update', 'dispose']) if (typeof m[k] !== 'function') bad.push(k);
      try { for (const n of ['idle', 'walk', 'windup', 'hold', 'strike', 'recover', 'stagger', 'die']) m.pose(n, 0.5); m.pose('idle', 0); m.update(1 / 60); } catch (e) { bad.push('pose/update threw ' + e.message); }
      return bad;
    };
    const out = {};
    for (const t of TYPES) {
      const v3 = MM.legacyModel(t, t === 'chuchu' ? { variant: 'fire' } : {});
      const w = MM.wrapLegacy(v3);
      const bad = contract(w, t, true);
      PT.check(`wrapLegacy(${t}) fills the contract`, bad.length === 0, bad);
      PT.check(`wrapLegacy(${t}) keeps the v3 object (rig/headTop)`, w === v3 && w.root === v3.root && w.features.legacy === true);
      // flash: a value > 0 drives the (lazily cloned) emissive
      w.flashUniform.value = 0.8;
      let lit = false; w.root.traverse((o) => { if (o.isMesh && o.name !== 'outline' && o.material?.emissive && o.material.emissive.r > 0.5) lit = true; });
      w.flashUniform.value = 0;
      PT.check(`wrapLegacy(${t}) flashUniform drives a flash`, lit);
      out[t] = { ok: bad.length === 0 };
    }
    PT.check('wrapLegacy(Object3D) works', contract(MM.wrapLegacy(new T.Group()), 'group', true).filter((b) => !b.startsWith('meshes') && !b.startsWith('lod') && !b.startsWith('rimSource')).length === 0);
    const v4 = {};
    for (const t of TYPES) {
      const m = MM.createModel(t, { game: g });
      v4[t] = m ? contract(m, t, false) : null;
    }
    return { out, v4, types: MM.TYPES.slice() };
  }, { TYPES });
  const v4Types = p0a?.types || [];
  PT.note(`v4 model factories: ${v4Types.join(', ') || '(none yet)'}`);
  for (const t of v4Types) PT.check(`createModel(${t}) fills the contract`, p0a.v4[t] && p0a.v4[t].length === 0, p0a.v4[t]);

  PT.check('no page errors', pg.errors().length === 0, pg.errors().slice(0, 5));
  await pg.close();
};
module.exports.TYPES = TYPES; module.exports.CHU = CHU; module.exports.BUDGET = BUDGET; module.exports.PROXY = PROXY;
