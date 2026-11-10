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

/**
 * Render size {w, h} for a canvas of w × h CSS px at pixel ratio pr under a pixel budget (MP): floor so the product
 * never exceeds the budget (C1: renderSize(1920, 970, 1) ≤ 1.0 MP at medium).
 */
export function budgetSize(w, h, pr = 1, budgetPx = 1.0, renderScale = 1, dyn = 1, out = { w: 0, h: 0 }) {
  const s = baseScale(w, h, pr, budgetPx, renderScale) * dyn;
  out.w = Math.max(1, Math.floor(w * pr * s)); out.h = Math.max(1, Math.floor(h * pr * s));
  return out;
}

// ---------------------------------------------------------------- quality offers (§2.2)
// After the title benchmark: ≥ 1.6× headroom at medium on a discrete tier → one-time 'high' offer (settings.highOffered).
// Running high with the governor at ≥ L2 for 30 s → one 'medium' drop-back offer per session. Both need a restart.
// ux shows them through game.ui.qualityOffer(offer) when it exists (event 'qualityOffer' too); otherwise core shows a
// small fallback card (never in tests). Texts live in settings SETTINGS_TEXT_KO (rule 6).
let fallbackEl = null;
function fallbackCard(game, offer) {
  if (game.isTest || typeof document === 'undefined') return;
  try {
    fallbackEl?.remove();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:9999;background:rgba(20,22,30,.92);color:#eee;' +
      'font:15px/1.5 sans-serif;padding:14px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.18);display:flex;gap:12px;align-items:center';
    const t = document.createElement('span'); t.textContent = offer.textKo; el.appendChild(t);
    for (const [label, fn] of [[offer.yesKo, offer.accept], [offer.noKo, offer.decline]]) {
      const b = document.createElement('button'); b.textContent = label;
      b.style.cssText = 'font:inherit;padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:#2b3142;color:#fff;cursor:pointer';
      b.onclick = () => { el.remove(); fallbackEl = null; fn(); };
      el.appendChild(b);
    }
    document.body.appendChild(el); fallbackEl = el;
  } catch (_) { /* */ }
}
export function makeOffer(game, kind) {
  const T = game.settings?.TEXT_KO || {};
  const offer = {
    kind, // 'high' | 'medium'
    textKo: kind === 'high' ? T.offerHigh : T.offerLow,
    yesKo: T.offerHighYes || '바꾸기', noKo: T.offerHighNo || '그대로',
    accept() {
      const S = game.settings; if (!S) return;
      if (kind === 'high') S.set('highOffered', true);
      S.applyPreset(kind === 'high' ? 'high' : 'medium');
      if (!game.isTest) game.restart?.();
    },
    decline() { if (kind === 'high') game.settings?.set?.('highOffered', true); },
  };
  return offer;
}
export function showOffer(game, kind) {
  const offer = makeOffer(game, kind);
  game.quality && (game.quality.lastOffer = offer);
  try { game.events?.emit?.('qualityOffer', offer); } catch (_) { /* */ }
  if (typeof game.ui?.qualityOffer === 'function') { try { game.ui.qualityOffer(offer); return offer; } catch (_) { /* fall back */ } }
  fallbackCard(game, offer);
  return offer;
}
/** Decide the one-time high-quality offer from a title-benchmark result. Returns true when it was shown. */
export function maybeOfferHigh(game, bench) {
  const S = game.settings; if (!S || !bench) return false;
  if (S.values.highOffered || S.values.quality !== 'medium') return false;
  if ((game.render?.tier || bench.tier) !== 'discrete') return false;
  if (!(bench.headroom >= 1.6)) return false;
  showOffer(game, 'high');
  return true;
}
