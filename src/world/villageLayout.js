// 「바람결 마을」 layout data (pure numbers, no THREE) shared by terrain.js (pads, paths, pond) and village.js (meshes).
// Yaw convention for every spot: object.rotation.y = yaw makes a +Z-forward model face (sin yaw, cos yaw).

export const VILLAGE = {
  center: [0, 137], radius: 36,
  // terrain blend ellipse: inside it the mountain foot is pushed back and the ground is gently flattened
  mask: { x: 0, z: 139, rx: 50, rz: 31 },
  base: 7.0,
  plaza: { x: 0, z: 137, r: 7.5 },
  well: [0, 137],
  // houses: x, z, yaw (door faces the plaza), w (along door wall), d, style 0 thatch / 1 red tile / 2 blue tile
  houses: [
    { x: -13, z: 151, w: 6.4, d: 5.2, style: 1, home: true, floors: 2 },
    { x: -24, z: 131, w: 5.6, d: 4.8, style: 0 },
    { x: -26, z: 144, w: 6.0, d: 5.0, style: 2 },
    { x: 0, z: 156, w: 6.8, d: 5.4, style: 0, floors: 2 },
    { x: 13, z: 152, w: 5.8, d: 4.8, style: 1 },
    { x: 24, z: 146, w: 6.0, d: 5.0, style: 0 },
    { x: 30, z: 136, w: 5.4, d: 4.6, style: 2 },
    { x: -36, z: 134, w: 5.2, d: 4.4, style: 1 },
    { x: 37, z: 146, w: 5.4, d: 4.6, style: 1 },
    { x: -21, z: 161, w: 5.0, d: 4.4, style: 0 },
  ],
  stalls: [ // market stalls west and south of the plaza, opening toward the well
    { x: -12, z: 137.2, yaw: Math.PI / 2 }, { x: 3.5, z: 149.5, yaw: Math.atan2(-3.5, -12.5) },
  ],
  windmill: { x: -33, z: 155, r: 3.2 },
  pond: { x: 33, z: 125, r: 6.5, depth: 0.9 },
  altar: { x: -16, z: 120, r: 5.5 },
  training: { x: 18, z: 117, r: 8.5 },
  gate: { x: 0, z: 120 },
  // tutorial rock spire (top reachable only by riding a fire updraft)
  spire: { x: -42, z: 109, rBase: 6.5, rTop: 3.4, height: 16 },
  tutorialMeadow: { x: -31, z: 105 },
  laundry: [[-19, 139, -19, 145.5], [17, 157.5, 23, 155], [-30, 139, -31, 136.6]],
  gardens: [{ x: -6, z: 163, w: 9, d: 4 }, { x: 22, z: 158, w: 7, d: 4 }],
};

/** Yaw making a +Z-forward model at (x,z) face the point (tx,tz). */
export const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// Derive door positions: each house faces the plaza (or the main lane for the far ones).
for (const h of VILLAGE.houses) {
  h.yaw = yawTo(h.x, h.z, VILLAGE.plaza.x, VILLAGE.plaza.z);
  // snap to 8 directions so the street grid looks deliberate
  h.yaw = Math.round(h.yaw / (Math.PI / 4)) * (Math.PI / 4);
  const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
  h.door = [h.x + fx * (h.d / 2 + 0.9), h.z + fz * (h.d / 2 + 0.9)];
  h.pad = Math.hypot(h.w, h.d) / 2 + 1.2;
}

// Stone lanes (polylines [x,z]). Plaza → every door, altar, training, pond, windmill, gate, tutorial meadow.
const P = [VILLAGE.plaza.x, VILLAGE.plaza.z];
VILLAGE.lanes = [
  [P, [0, 128], [0, 121], [0, 113]],                       // north gate → main road
  [[-3, 130], [-9, 124], [-14, 121.5]],                    // altar
  [[3, 130], [10, 123], [15, 119]],                        // training
  [[-7, 134], [-18, 128], [-28, 116], [-31, 108]],         // west lane → tutorial meadow
  [[7, 133], [20, 129], [27, 127]],                        // pond
  [[-6, 142], [-18, 150], [-30, 154]],                     // windmill
  [[6, 142], [20, 140], [34, 142]],                        // east lane
];
for (const h of VILLAGE.houses) {
  const d = h.door; const ang = Math.atan2(d[1] - P[1], d[0] - P[0]);
  const edge = [P[0] + Math.cos(ang) * (VILLAGE.plaza.r - 1), P[1] + Math.sin(ang) * (VILLAGE.plaza.r - 1)];
  if (Math.hypot(d[0] - P[0], d[1] - P[1]) > VILLAGE.plaza.r) VILLAGE.lanes.push([edge, d]);
}

// Flatten pads: houses, stalls, altar, training, windmill, well/plaza.
VILLAGE.pads = [
  ...VILLAGE.houses.map((h) => ({ x: h.x, z: h.z, r: h.pad })),
  { x: VILLAGE.plaza.x, z: VILLAGE.plaza.z, r: VILLAGE.plaza.r + 1 },
  { x: VILLAGE.altar.x, z: VILLAGE.altar.z, r: VILLAGE.altar.r + 1.5 },
  { x: VILLAGE.training.x, z: VILLAGE.training.z, r: VILLAGE.training.r + 0.5 },
  { x: VILLAGE.windmill.x, z: VILLAGE.windmill.z, r: VILLAGE.windmill.r + 1.5 },
  ...VILLAGE.stalls.map((s) => ({ x: s.x, z: s.z, r: 2.6 })),
];

/** Training dummy spots (3, facing the village/plaza). */
{
  const T = VILLAGE.training;
  const face = yawTo(T.x, T.z, VILLAGE.plaza.x, VILLAGE.plaza.z);
  const rx = Math.cos(face), rz = -Math.sin(face);
  VILLAGE.dummies = [-1, 0, 1].map((j) => ({
    x: T.x + rx * j * 4 - Math.sin(face) * (Math.abs(j) * 1.2 + 1.5), z: T.z + rz * j * 4 - Math.cos(face) * (Math.abs(j) * 1.2 + 1.5), yaw: face,
  }));
}

// Explosive fire barrels (불씨 항아리): tutorial meadow beside the spire + a few in the camps' meadows (set in world.js).
VILLAGE.barrels = [[-33.5, 103.5], [-29.5, 107], [-35, 108.5], [-30.5, 101.5]];
