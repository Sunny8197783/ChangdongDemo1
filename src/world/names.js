// World name tables (PLAN v4 §7.2 rule 6: player-facing Korean text lives in data tables). Owner: world.
// Surface damage descriptors (§7.4.2): every world-caused hit carries attack {id:'surface.<kind>', nameKo, kind:'surface'}.
export const SURFACE_NAMES_KO = Object.freeze({
  burning: '불길', mud: '진흙', cursed: '저주받은 땅', blight: '오염', void: '공허',
  barrel: '불씨 항아리 폭발',
});
/** Frozen attack descriptors by surface kind (mud deals no damage; listed for completeness). */
export const SURFACE_ATTACKS = Object.freeze(Object.fromEntries(Object.entries(SURFACE_NAMES_KO)
  .map(([k, n]) => [k, Object.freeze({ id: 'surface.' + k, nameKo: n, kind: 'surface', surface: k })])));
/** Pseudo-sources for world-caused damage on the PLAYER (statuses keep object sources; death recap reads name/attack). */
export const SURFACE_SOURCES = Object.freeze(Object.fromEntries(Object.entries(SURFACE_ATTACKS)
  .map(([k, a]) => [k, Object.freeze({ id: a.id, team: 'world', owner: 'world', isSurface: true, surface: k, name: a.nameKo, nameKo: a.nameKo, attack: a })])));
