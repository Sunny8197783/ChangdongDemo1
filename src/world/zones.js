// v3 zone registry (CONTRACT §13, DESIGN §8.2). Pure layout data (no THREE at module level, so terrain.js and the
// terraform can read it while the height grid is baked) + createZones(): getZoneAt and the 4 Hz zoneEnter/zoneExit tracker.
// Coordinates are world metres, +Z is south. All player-facing names are Korean and live here.

export const WATER = 1.5;   // == terrain.js WATER_LEVEL (terrain re-exports this value)

/** Terraform pieces (consumed by world/terraform.js while baking the height grid). Heights are absolute metres. */
export const TF = {
  mirwen: {
    x: -80, z: -72, rx: 30, rz: 24, floor: WATER - 2.5,
    // ~8 lily-pad / ruin islands (r 3–6); top = absolute height of the island crown
    islands: [
      { id: 'undina', x: -96, z: -88, r: 6, top: WATER + 1.5 },   // 운디나's shrine island
      { id: 'i2', x: -70, z: -63, r: 4, top: WATER + 0.8 },
      { id: 'i3', x: -61, z: -79, r: 3.5, top: WATER + 0.7 },
      { id: 'i4', x: -88, z: -61, r: 4.5, top: WATER + 0.9 },
      { id: 'i5', x: -104, z: -74, r: 3.5, top: WATER + 0.8 },
      { id: 'i6', x: -76, z: -95, r: 3, top: WATER + 0.7 },
      { id: 'islet', x: -68, z: -87, r: 3, top: WATER + 0.9 },     // frozen-bridge islet (seed shrine)
      { id: 'i8', x: -95, z: -55, r: 3.5, top: WATER + 0.8 },
    ],
    // the west-edge waterfall cliff (the old (−96,−70) mesa moved onto the shore) + the slot cave behind the falls
    cliff: { x: -119, z: -70, r: 10, h: 21 },
    cave: { x0: -112, x1: -104.5, z: -70, hw: 1.8, floor: WATER + 0.9 },   // slot canyon running west into the cliff
    shorePad: { x: -56, z: -58, r: 6, y: WATER + 2.2 },                     // gate + lake keeper dock (dry)
  },
  elderwood: {
    x: 82, z: -62, r: 32,
    glade: { x: 64, z: -48, r: 14 },       // 녹스's dark glade (flattened)
    grove: { x: 100, z: -66, r: 8 },       // 실바니아's grove
    hollow: { x: 92, z: -80, r: 22 },      // 모르그로스's hollow (flattened; the (108,−92) mesa is its cliff)
    // root ridges (terrain): arcs of giant roots; gaps sealed by the 3 rot walls
    ridges: [
      { x: 95, z: -74, r: 27, a0: 1.2, a1: 4.85, h: 6.5, w: 3.2, gaps: [2.55, 1.62] },   // the deep wood (grove + hollow): W1 west gap, W2 south gap
      { x: 62, z: -72, r: 5.5, a0: -3.2, a1: 3.2, h: 5.5, w: 2.4, gaps: [0.46] },        // seed pocket: W3
    ],
    gapHalfM: 3.0,   // half width of a ridge gap (metres) = half the rot wall span
    mushroom: { x: 80, z: -62, top: 13, capR: 4.6 },   // the giant mushroom whose cap holds a seed
    sporeVent: { x: 84.5, z: -64.5, r: 2.2, h: 19, strength: 20 },
  },
  ledge: { x: 60, z: -150, r: 18, top: 38, cliff: 7 },                   // 거울의 정원 (+24 m)
  plateau: { x: 108, z: -132, r: 34, top: 52, cliff: 9 },                 // 세계수 뿌리 고원 (+38 m)
  pillars: { r: 22, a0: 0.25, count: 5, rTop: 2.6, rBase: 3.6, h: 12 },  // 5 root-pillar spires on the plateau
  // the ascent valley (golem arena → ledge → plateau): mountains carved down to a floor
  valley: { pts: [[6, -128], [40, -140], [64, -146], [96, -128]], hw: 24, floor: 15 },
  // root ramps (walkable): polyline + start/end heights; hw = half width of the walkable crown
  ramps: [
    { id: 'rampLedge', pts: [[20, -108], [34, -106], [46, -114], [50, -126], [52, -134]], y0: 15.2, y1: 38.2, hw: 2.8 },
    { id: 'rampPlateau', pts: [[66, -138], [64, -124], [70, -110], [82, -102], [88, -106]], y0: 38.2, y1: 52.2, hw: 2.8 },
  ],
  // prism-mirror alcove on the ledge's back rim (seed shrine behind a light-activated mirror door)
  alcove: { x: 60, z: -165, r: 3.6, gapA: Math.PI / 2, h: 5 },
};

/** Boss arena definitions (y is filled from the terrain at runtime: never a constant). */
export const ARENA_DEFS = {
  hydra: { x: -82, z: -80, r: 20, pillarR: 14, pillarCount: 6, pillarTop: WATER + 3.6 },
  nox: { x: 64, z: -48, r: 14 },
  treant: { x: 92, z: -80, r: 22 },
  kalis: { x: 60, z: -150, r: 18 },
  nidhoggra: { x: 108, z: -132, r: 34 },
};

/** Zones in getZoneAt priority order (first match wins; plains is the fallback). */
export const ZONE_DEFS = [
  { id: 'plateau', name: '세계수 뿌리 고원', x: 108, z: -132, r: 40, level: [24, 26], grade: null, music: 'final_boss', fuel: false, arena: 'nidhoggra' },
  { id: 'ascent', name: '하늘로 가는 뿌리', x: 42, z: -138, r: 34, level: [20, 25], grade: 'golden', music: 'sky', fuel: false, arena: 'kalis' },
  { id: 'mirwen', name: '안개호수 미르웬', x: -80, z: -72, r: 36, level: [8, 16], grade: 'dusk', music: 'mirwen', fuel: false, arena: 'hydra' },
  { id: 'elderwood', name: '잿빛 수림 엘더우드', x: 84, z: -62, r: 38, level: [12, 21], grade: 'void', music: 'elderwood', fuel: true, arena: 'treant' },
  { id: 'ruins', name: '봉인의 유적', x: 0, z: -120, r: 34, level: [6, 9], grade: null, music: 'field', fuel: false, arena: 'golem' },
  { id: 'village', name: '바람결 마을', x: 0, z: 137, r: 42, level: [1, 3], grade: null, music: 'village', fuel: false },
  { id: 'plains', name: '바람의 평원', x: 0, z: 10, r: 1e6, level: [2, 8], grade: null, music: 'field', fuel: true },
];
/** Zone colour-grade blends (game.post.grade). */
export const GRADE_BLEND = { dusk: 0.4, void: 0.25, golden: 0.3 };
/** Grades core may not define yet (registered at runtime only when missing). */
export const EXTRA_GRADES = {
  dusk: { tint: [0.92, 0.95, 1.1], sat: 0.82, contrast: 1.04 },
  golden: { tint: [1.08, 1.02, 0.88], sat: 1.06, contrast: 1.02 },
};

/** 정령의 문 (spirit gates). The village gate is reached from the start. */
export const GATE_DEFS = [
  { id: 'gate_village', zoneId: 'village', x: -6, z: 126, name: '바람결 마을', yaw: 0.35, reached: true },
  { id: 'gate_ruins', zoneId: 'ruins', x: 0, z: -110, name: '봉인의 유적', yaw: Math.PI },
  { id: 'gate_mirwen', zoneId: 'mirwen', x: -56, z: -58, name: '미르웬 호숫가', yaw: -2.2 },
  { id: 'gate_elderwood', zoneId: 'elderwood', x: 60, z: -40, name: '엘더우드 숲 어귀', yaw: 2.5 },
  { id: 'gate_kalis', zoneId: 'ascent', x: 46, z: -141, name: '거울의 정원', yaw: -2.0 },
];
export const GATE_REACH_R = 14;     // walking this close marks a gate as reached
export const GATE_USE_R = 3.2;      // interact radius

/** Shrines: 8 seeds (+1 point each, DESIGN §8.2), spirit shrines, landmarks. y: 'top:<id>' resolves to a stand-on top. */
export const SHRINE_DEFS = [
  // 정령의 씨앗 ×8
  { id: 'seed_spire', kind: 'seed', x: -42, z: 109, y: 'spire', name: '바위 첨탑 꼭대기' },
  { id: 'seed_windmill', kind: 'seed', x: -38.5, z: 161.5, name: '풍차 뒤뜰' },
  { id: 'seed_islet', kind: 'seed', x: -68, z: -87, name: '얼음다리 작은 섬' },
  { id: 'seed_cave', kind: 'seed', x: -110.5, z: -70, name: '폭포 뒤 동굴' },
  { id: 'seed_rotwall', kind: 'seed', x: 62, z: -72, name: '썩은 덩굴 너머' },
  { id: 'seed_mushroom', kind: 'seed', x: 80, z: -62, y: 'top:mushroom', name: '거대 버섯 꼭대기' },
  { id: 'seed_pillar', kind: 'seed', y: 'top:pillar0', name: '뿌리 기둥 꼭대기' },
  { id: 'seed_mirror', kind: 'seed', x: 60, z: -166, name: '거울 문 안쪽' },
  // spirit shrines
  { id: 'spirit_undina', kind: 'spirit', x: -96, z: -88, element: 'water', name: '운디나의 성소' },
  { id: 'spirit_nox', kind: 'spirit', x: 64, z: -48, element: 'shadow', name: '녹스의 성소' },
  { id: 'spirit_sylvania', kind: 'spirit', x: 100, z: -66, element: 'nature', name: '실바니아의 숲' },
  { id: 'spirit_lumiel', kind: 'spirit', x: 66, z: -154, element: 'light', name: '루미엘의 거울' },
  // landmarks (80 XP each)
  { id: 'lm_ford', kind: 'landmark', x: 0, z: 0, ford: true, name: '여울목 징검다리' },
  { id: 'lm_lake', kind: 'landmark', x: 40, z: 62, name: '거울 호수' },
  { id: 'lm_arch', kind: 'landmark', x: -71, z: -73, name: '가라앉은 아치' },
  { id: 'lm_falls', kind: 'landmark', x: -106, z: -60, name: '안개 폭포' },
  { id: 'lm_rootarch', kind: 'landmark', x: 70, z: -60, name: '거대 뿌리 아치' },
  { id: 'lm_ring', kind: 'landmark', x: 76, z: -38, name: '버섯 고리' },
  { id: 'lm_channel', kind: 'landmark', x: 24, z: -134, name: '뿌리 수로' },
  { id: 'lm_overlook', kind: 'landmark', x: 86, z: -112, name: '고원 전망대' },
];
export const SHRINE_R = 3;

/** Signposts for the new zones (merged into structures' sign label atlas). */
export const ZONE_SIGNS = [
  { x: -40, z: -40, rotY: 0.9, boards: [{ text: '← 안개호수 미르웬', dir: 0 }] },
  { x: 40, z: -28, rotY: -0.7, boards: [{ text: '잿빛 수림 →', dir: 0 }] },
  { x: 12, z: -104, rotY: -1.2, boards: [{ text: '거울의 정원 ↗', dir: 0 }] },
];

/** NPC spots that live in zones (story reads world.zones[].npcSpots). */
export const ZONE_NPCS = {
  mirwen: { lakeKeeper: { x: -59, z: -61.5, face: [-80, -72] } },
  elderwood: { forestChild: { x: 63, z: -44, face: [82, -62] } },
};

/** Story stage → act (setActVisible fallback when nobody calls it). */
export const STAGE_ACT = {
  wake: 1, choose: 1, training: 1, updraft: 1, camps: 1, boss: 1,
  reveal: 2, mirwen: 2, hydra: 2, elderwood: 2, nox: 3, treant: 3,
  ascent: 4, kalis: 4, final: 5, ending: 5, done: 5,
};

/**
 * Zone runtime: world.zones (array, with THREE vectors), getZoneAt(x, z), 4 Hz zoneEnter / zoneExit on the player.
 * @param {object} game
 * @param {object} world   needs getHeight
 * @param {object} THREE
 */
export function createZones(game, world, THREE) {
  const zones = ZONE_DEFS.map((d) => {
    const z = {
      id: d.id, name: d.name, center: new THREE.Vector3(d.x, 0, d.z), radius: d.r, level: d.level.slice(),
      grade: d.grade, music: d.music, fuel: d.fuel, arena: null, npcSpots: {},
    };
    if (d.r < 1e5) z.center.y = world.getHeight(d.x, d.z);
    else z.center.set(0, world.getHeight(0, 10), 10);
    const n = ZONE_NPCS[d.id];
    if (n) for (const k in n) {
      const s = n[k];
      z.npcSpots[k] = { position: new THREE.Vector3(s.x, world.getHeight(s.x, s.z), s.z), yaw: Math.atan2(s.face[0] - s.x, s.face[1] - s.z) };
    }
    z._def = d;
    return z;
  });
  const byId = Object.fromEntries(zones.map((z) => [z.id, z]));
  const fallback = byId.plains;
  function getZoneAt(x, z) {
    for (let i = 0; i < zones.length; i++) {
      const Z = zones[i]; const dx = x - Z.center.x, dz = z - Z.center.z;
      if (dx * dx + dz * dz < Z.radius * Z.radius) return Z;
    }
    return fallback;
  }
  let cur = null, acc = 0.25;
  const payload = { zoneId: '', name: '', level: null };
  function emit(name, Z) {
    payload.zoneId = Z.id; payload.name = Z.name; payload.level = Z.level;
    try { game.events?.emit?.(name, { zoneId: Z.id, name: Z.name, level: Z.level }); } catch (err) { console.error('[world] ' + name, err); }
  }
  return {
    zones, byId, getZoneAt,
    get current() { return cur; },
    /** 4 Hz player zone check (real time; runs in every state so teleports register). */
    update(realDt) {
      acc += realDt;
      if (acc < 0.25) return;
      acc = 0;
      const pp = game.player?.object?.position; if (!pp) return;
      const Z = getZoneAt(pp.x, pp.z);
      if (Z === cur) return;
      const prev = cur; cur = Z;
      if (prev) emit('zoneExit', prev);
      emit('zoneEnter', Z);
    },
    /** Force a re-check next update (after a teleport). */
    poke() { acc = 1; },
  };
}
