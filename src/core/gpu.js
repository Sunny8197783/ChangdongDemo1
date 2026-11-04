// GPU tier detection and pixel-budget render resolution (PLAN v4 §2.2). Owned by core.
// P0a: tier + renderer string + the base-scale formula; P0b adds the title-benchmark offers.
//   detectGpu(renderer) → {tier:'integrated'|'discrete'|'unknown', rendererName}
//   baseScale(w, h, pr, budgetPx (MP), renderScale) = min(renderScale, sqrt(budgetPx·1e6 / (w·h·pr²))), never below 0.5
export const TIER_INTEGRATED = /Intel|UHD|Iris|Radeon\(TM\) Graphics|Vega \d+ Graphics|Mali|Adreno|Apple M/i;
export const TIER_DISCRETE = /NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc A/i;

export function tierOf(name) {
  if (!name) return 'unknown';
  if (TIER_DISCRETE.test(name)) return 'discrete';     // "Intel Arc A770" and "NVIDIA ... (Intel host)" → discrete first
  if (TIER_INTEGRATED.test(name)) return 'integrated';
  return 'unknown';
}

export function detectGpu(renderer) {
  let rendererName = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    rendererName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  } catch (_) { rendererName = ''; }
  return { tier: tierOf(rendererName), rendererName };
}

/** Render scale (fraction of the canvas size) that keeps the render at or under budgetPx megapixels. */
export function baseScale(w, h, pr = 1, budgetPx = 1.0, renderScale = 1) {
  const px = Math.max(1, w * h * pr * pr);
  const s = Math.sqrt((budgetPx * 1e6) / px);
  return Math.max(0.5, Math.min(renderScale || 1, s, 1));
}
/** {w, h} of the render at a canvas size (CSS px) × pixel ratio × scale (rounded like the viewport). */
export function renderSizeFor(w, h, pr, scale, out = { w: 0, h: 0 }) {
  out.w = Math.max(1, Math.round(w * pr * scale)); out.h = Math.max(1, Math.round(h * pr * scale));
  return out;
}
