// Cinematic screen flashes (PLAN v4 §9 ux P0 12): ≤ 0.15 s, never pure white (clamped to a warm off-white, peak ≤ 0.6),
// and none at all with settings.flashReduce. Every cinematic file calls safeFlash(vfx, colour, alpha, seconds).
let G = null;
export function setFlashGame(game) { G = game; }
const OFF_WHITE = 0xfff0dc;
export function safeFlash(vfx, color, alpha = 0.5, seconds = 0.15) {
  if (G?.settings?.values?.flashReduce) return;
  let c = +color || OFF_WHITE;
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (r > 245 && g > 245 && b > 245) c = OFF_WHITE;
  vfx?.screenFlash?.(c, Math.min(0.6, alpha), Math.min(0.15, seconds));
}
