// Element registry (v3). The ONE table every module reads for element ids, names, colours and spirits.
// v3 code iterates ALL_ELEMENTS (9). The legacy `ELEMENTS` export in utils.js stays the 5 classic elements.
// game.elements = { DEFS, list, classic, get, color, name }  (created in main.js before any module factory)

export const ELEMENT_DEFS = {
  fire: {
    id: 'fire', nameKo: '화염', short: '화', spirit: { id: 'ignis', name: '이그니스', title: '화염의 정령' },
    colors: { css: '#ff8a3d' },
    status: 'burning', shapes: ['ember', 'smoke'], sfxBase: 220, opposite: 'water', isNew: false, order: 0,
  },
  ice: {
    id: 'ice', nameKo: '빙결', short: '빙', spirit: { id: 'glacia', name: '글라시아', title: '서리의 정령' },
    colors: { css: '#8feaff' },
    status: 'chilled', shapes: ['shard', 'snow'], sfxBase: 330, opposite: 'fire', isNew: false, order: 1,
  },
  lightning: {
    id: 'lightning', nameKo: '번개', short: '뇌', spirit: { id: 'volta', name: '볼타', title: '번개의 정령' },
    colors: { css: '#d4b4ff' },
    status: 'shocked', shapes: ['spark', 'bolt'], sfxBase: 440, opposite: 'earth', isNew: false, order: 2,
  },
  wind: {
    id: 'wind', nameKo: '바람', short: '풍', spirit: { id: 'sylphia', name: '실피아', title: '바람의 정령' },
    colors: { css: '#9dffcb' },
    status: null, shapes: ['streak', 'leaf'], sfxBase: 294, opposite: null, isNew: false, order: 3,
  },
  earth: {
    id: 'earth', nameKo: '대지', short: '지', spirit: { id: 'teragon', name: '테라곤', title: '대지의 정령' },
    colors: { css: '#f0bd6e' },
    status: 'encrusted', shapes: ['rock', 'dust'], sfxBase: 147, opposite: 'lightning', isNew: false, order: 4,
  },
  water: {
    id: 'water', nameKo: '물', short: '수', spirit: { id: 'undina', name: '운디나', title: '물의 정령' },
    colors: { css: '#6fc8ff' },
    status: 'wet', shapes: ['droplet', 'bubble'], sfxBase: 262, opposite: 'fire', isNew: true, order: 5,
  },
  nature: {
    id: 'nature', nameKo: '자연', short: '목', spirit: { id: 'sylvania', name: '실바니아', title: '숲의 정령' },
    colors: { css: '#9be86a' },
    status: 'seeded', shapes: ['petal', 'thorn'], sfxBase: 196, opposite: null, isNew: true, order: 6,
  },
  light: {
    id: 'light', nameKo: '빛', short: '광', spirit: { id: 'lumiel', name: '루미엘', title: '빛의 정령' },
    colors: { css: '#ffe08a' },
    status: 'radiant', shapes: ['rune', 'feather'], sfxBase: 523, opposite: 'shadow', isNew: true, order: 7,
  },
  shadow: {
    id: 'shadow', nameKo: '그림자', short: '암', spirit: { id: 'nox', name: '녹스', title: '그림자의 정령' },
    colors: { css: '#b98bff' },
    status: 'corroded', shapes: ['wisp', 'raven'], sfxBase: 110, opposite: 'light', isNew: true, order: 8,
  },
};

/**
 * Element ramps v4 (PLAN §3.2): {hi (glint / thin core only), light, mid (body), dark (edge/outline)}. No pure white anywhere;
 * light is ivory (saturation <= 0.35 below hi; saturated gold is the reserved parry cue). Shadow keeps its "inverted value"
 * look (dark body, violet rims). The legacy colour fields are derived from these ramps (below).
 */
export const FX_RAMPS = {
  fire:      { hi: 0xFFE08A, light: 0xFFA53A, mid: 0xF0661A, dark: 0x7A1E0A },
  ice:       { hi: 0xE8FBFF, light: 0x8FDCF5, mid: 0x2F8FD6, dark: 0x12325E },
  lightning: { hi: 0xF4ECFF, light: 0xB49BFF, mid: 0x7048FF, dark: 0x241052 },
  wind:      { hi: 0xE6FFF4, light: 0x8FEFCB, mid: 0x2FA88A, dark: 0x0F4A3E },
  water:     { hi: 0xE3F6FF, light: 0x5AB8F0, mid: 0x1F6FB8, dark: 0x0A2A55 },
  earth:     { hi: 0xF0D8B0, light: 0xB08458, mid: 0x6A4A2A, dark: 0x2A1A0E },
  nature:    { hi: 0xF0FFC8, light: 0x9BE060, mid: 0x2F8A3A, dark: 0x12301A },
  light:     { hi: 0xFFF8E6, light: 0xF4EAD0, mid: 0xE8D9B0, dark: 0x5A4A2A },
  shadow:    { hi: 0xD6B8FF, light: 0x9A5CFF, mid: 0x4A1A7A, dark: 0x0C0614 },
  physical:  { hi: 0xF4F1EA, light: 0xCFC8BA, mid: 0x8A8274, dark: 0x2E2A24 },
};
// Legacy field mapping (all elements): mid := fx.mid, hex := fx.mid, core := fx.hi, edge := fx.dark;
// shadow keeps core := fx.dark, edge := fx.light (as v3 0x1a0b2e / 0xb14bff). css (UI/DOM) is unchanged.
for (const [id, d] of Object.entries(ELEMENT_DEFS)) {
  const r = FX_RAMPS[id];
  d.colors.fx = r;
  d.colors.mid = r.mid; d.colors.hex = r.mid;
  d.colors.core = id === 'shadow' ? r.dark : r.hi;
  d.colors.edge = id === 'shadow' ? r.light : r.dark;
}

/** The 9 elements in `order`. v3 code iterates THIS (never a literal list, never i<5). */
export const ALL_ELEMENTS = Object.keys(ELEMENT_DEFS).sort((a, b) => ELEMENT_DEFS[a].order - ELEMENT_DEFS[b].order);
/** The 5 classic elements (= the legacy utils.js ELEMENTS, same order). */
export const CLASSIC_ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'earth'];
/** Damage "elements" that are not real elements (no tree, no spirit). */
export const PSEUDO_ELEMENTS = {
  physical: { id: 'physical', nameKo: '물리', hex: 0x8A8274, css: '#ffffff', fx: null },
  void: { id: 'void', nameKo: '공허', hex: 0x7a3cff, css: '#9a6bff' },
};

PSEUDO_ELEMENTS.physical.fx = FX_RAMPS.physical;
// void (enemy damage pseudo-element) ramp: violet body, no white. Danger hue never depends on it (threat palette is separate).
FX_RAMPS.void = { hi: 0xD6C2FF, light: 0x9A6BFF, mid: 0x7A3CFF, dark: 0x1E0B40 };
PSEUDO_ELEMENTS.void.fx = FX_RAMPS.void;

/** Cached ramp {hi, light, mid, dark} (numbers) of an element or pseudo-element; unknown → physical. Never white. */
export function elFx(id) { return FX_RAMPS[id] || FX_RAMPS.physical; }

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
  get: elDef, color: elColor, name: elName, isElement, fx: elFx, FX_RAMPS,
};
