// Element registry (v3). The ONE table every module reads for element ids, names, colours and spirits.
// v3 code iterates ALL_ELEMENTS (9). The legacy `ELEMENTS` export in utils.js stays the 5 classic elements.
// game.elements = { DEFS, list, classic, get, color, name }  (created in main.js before any module factory)

export const ELEMENT_DEFS = {
  fire: {
    id: 'fire', nameKo: '화염', short: '화', spirit: { id: 'ignis', name: '이그니스', title: '화염의 정령' },
    colors: { core: 0xfff3c4, mid: 0xff8a1f, edge: 0xc2261b, css: '#ff8a3d', hex: 0xff6a1f },
    status: 'burning', shapes: ['ember', 'smoke'], sfxBase: 220, opposite: 'water', isNew: false, order: 0,
  },
  ice: {
    id: 'ice', nameKo: '빙결', short: '빙', spirit: { id: 'glacia', name: '글라시아', title: '서리의 정령' },
    colors: { core: 0xffffff, mid: 0x9fe8ff, edge: 0x2f7bd6, css: '#8feaff', hex: 0x7fe3ff },
    status: 'chilled', shapes: ['shard', 'snow'], sfxBase: 330, opposite: 'fire', isNew: false, order: 1,
  },
  lightning: {
    id: 'lightning', nameKo: '번개', short: '뇌', spirit: { id: 'volta', name: '볼타', title: '번개의 정령' },
    colors: { core: 0xffffff, mid: 0xe9d8ff, edge: 0x7b5cff, css: '#d4b4ff', hex: 0xc9a4ff },
    status: 'shocked', shapes: ['spark', 'bolt'], sfxBase: 440, opposite: 'earth', isNew: false, order: 2,
  },
  wind: {
    id: 'wind', nameKo: '바람', short: '풍', spirit: { id: 'sylphia', name: '실피아', title: '바람의 정령' },
    colors: { core: 0xffffff, mid: 0xc8ffe9, edge: 0x5fd6b0, css: '#9dffcb', hex: 0x8fffc1 },
    status: null, shapes: ['streak', 'leaf'], sfxBase: 294, opposite: null, isNew: false, order: 3,
  },
  earth: {
    id: 'earth', nameKo: '대지', short: '지', spirit: { id: 'teragon', name: '테라곤', title: '대지의 정령' },
    colors: { core: 0xfff1d6, mid: 0xc8955a, edge: 0x5b3b22, css: '#f0bd6e', hex: 0xe0a85a },
    status: 'encrusted', shapes: ['rock', 'dust'], sfxBase: 147, opposite: 'lightning', isNew: false, order: 4,
  },
  water: {
    id: 'water', nameKo: '물', short: '수', spirit: { id: 'undina', name: '운디나', title: '물의 정령' },
    colors: { core: 0xffffff, mid: 0x7fd3ff, edge: 0x1f6fb8, css: '#6fc8ff', hex: 0x4fb4ff },
    status: 'wet', shapes: ['droplet', 'bubble'], sfxBase: 262, opposite: 'fire', isNew: true, order: 5,
  },
  nature: {
    id: 'nature', nameKo: '자연', short: '목', spirit: { id: 'sylvania', name: '실바니아', title: '숲의 정령' },
    colors: { core: 0xf4ffd0, mid: 0x8fe05a, edge: 0x2f7d3a, css: '#9be86a', hex: 0x7fd84a },
    status: 'seeded', shapes: ['petal', 'thorn'], sfxBase: 196, opposite: null, isNew: true, order: 6,
  },
  light: {
    id: 'light', nameKo: '빛', short: '광', spirit: { id: 'lumiel', name: '루미엘', title: '빛의 정령' },
    colors: { core: 0xffffff, mid: 0xffe9a8, edge: 0xffc24a, css: '#ffe08a', hex: 0xffd36a },
    status: 'radiant', shapes: ['rune', 'feather'], sfxBase: 523, opposite: 'shadow', isNew: true, order: 7,
  },
  shadow: {
    id: 'shadow', nameKo: '그림자', short: '암', spirit: { id: 'nox', name: '녹스', title: '그림자의 정령' },
    colors: { core: 0x1a0b2e, mid: 0x5b2a8a, edge: 0xb14bff, css: '#b98bff', hex: 0x9a5cff },
    status: 'corroded', shapes: ['wisp', 'raven'], sfxBase: 110, opposite: 'light', isNew: true, order: 8,
  },
};

/** The 9 elements in `order`. v3 code iterates THIS (never a literal list, never i<5). */
export const ALL_ELEMENTS = Object.keys(ELEMENT_DEFS).sort((a, b) => ELEMENT_DEFS[a].order - ELEMENT_DEFS[b].order);
/** The 5 classic elements (= the legacy utils.js ELEMENTS, same order). */
export const CLASSIC_ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'earth'];
/** Damage "elements" that are not real elements (no tree, no spirit). */
export const PSEUDO_ELEMENTS = {
  physical: { id: 'physical', nameKo: '물리', hex: 0xffffff, css: '#ffffff' },
  void: { id: 'void', nameKo: '공허', hex: 0x7a3cff, css: '#9a6bff' },
};

export function elDef(id) { return ELEMENT_DEFS[id] || null; }
export function isElement(id) { return !!ELEMENT_DEFS[id]; }

/** Colour of an element part ('hex' | 'css' | 'core' | 'mid' | 'edge'). Falls back to pseudo → physical; never undefined. */
export function elColor(id, part = 'hex') {
  const d = ELEMENT_DEFS[id];
  if (d) { const c = d.colors[part]; return c !== undefined ? c : d.colors.hex; }
  const p = PSEUDO_ELEMENTS[id] || PSEUDO_ELEMENTS.physical;
  if (part === 'css') return p.css;
  return p.hex;
}

/** Korean display name (new UI naming: ice = '빙결'). Falls back to pseudo → '물리'. */
export function elName(id) {
  return ELEMENT_DEFS[id]?.nameKo || PSEUDO_ELEMENTS[id]?.nameKo || PSEUDO_ELEMENTS.physical.nameKo;
}

export const ELEMENTS_API = {
  DEFS: ELEMENT_DEFS, list: ALL_ELEMENTS, classic: CLASSIC_ELEMENTS, pseudo: PSEUDO_ELEMENTS,
  get: elDef, color: elColor, name: elName, isElement,
};
