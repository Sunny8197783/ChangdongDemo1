// Inline SVG icon set for the UI (elements, spell kinds, statuses, compass markers).
import { ALL_ELEMENTS, PSEUDO_ELEMENTS, elColor } from '../core/elements.js';

export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
/** css colour per element (all 9 + physical + void), from the element registry (CONTRACT §3.1). */
export const ELEMENT_CSS = {};
for (const el of ALL_ELEMENTS) ELEMENT_CSS[el] = elColor(el, 'css');
for (const el of Object.keys(PSEUDO_ELEMENTS)) ELEMENT_CSS[el] = elColor(el, 'css');
export const elCss = (el) => ELEMENT_CSS[el] || '#ffffff';

// Glyph bodies on a 24x24 canvas. `currentColor` = element color.
const GLYPHS = {
  fire: `
    <path d="M12 1.8c.9 3.4 4.9 5.6 5.6 10.2.6 3.9-1.9 7.5-5.6 7.9-3.9.4-6.8-2.6-6.6-6.3.1-2.6 1.5-4.2 2.6-5.6.2 1.7 1 2.9 2.2 3.4-.5-3.6.4-6.6 1.8-9.6z"
      fill="currentColor" stroke="#fff6e0" stroke-width=".7" stroke-linejoin="round"/>
    <path d="M12.2 10.4c.5 1.8 2.6 2.9 2.6 5.2 0 1.9-1.3 3.2-2.9 3.2s-2.9-1.2-2.8-3c.1-1.3.8-2 1.4-2.6.2.8.6 1.3 1.1 1.5-.2-1.7.1-3 .6-4.3z"
      fill="#fff3c4" opacity=".95"/>`,
  ice: `
    <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none">
      <path d="M12 2.2v19.6M3.5 7.1l17 9.8M3.5 16.9l17-9.8"/>
      <path d="M9.6 3.8 12 6.2l2.4-2.4M9.6 20.2 12 17.8l2.4 2.4M4.2 10.4l3.3-.9-.9-3.3M19.8 13.6l-3.3.9.9 3.3M4.2 13.6l3.3.9-.9 3.3M19.8 10.4l-3.3-.9.9-3.3"/>
    </g>
    <circle cx="12" cy="12" r="2.1" fill="#ffffff"/>`,
  lightning: `
    <path d="M13.8 1.6 4.6 13.4h6.1l-1.7 9 9.6-12.6h-6.3l1.5-8.2z"
      fill="currentColor" stroke="#fff" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M12.6 5.2 8.3 11.6h3.2" stroke="#fff" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".85"/>`,
  wind: `
    <g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <path d="M2.5 8.5h11.2a3.2 3.2 0 1 0-3.1-3.9"/>
      <path d="M2.5 12.6h16.4a2.9 2.9 0 1 1-2.6 4.2"/>
      <path d="M4.5 16.6h7.2a2.4 2.4 0 1 1-2.1 3.5"/>
    </g>
    <circle cx="20.4" cy="7.4" r=".9" fill="#fff"/><circle cx="1.6" cy="20" r=".7" fill="#fff" opacity=".7"/>`,
  earth: `
    <path d="M3 18.6 6.2 9.4l4.6-4.2 5.1 2.2 3.9 5.4 1.2 5.8-6.3 2.5-6.4-.4z"
      fill="currentColor" stroke="#fff1d6" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M10.8 5.2 9.7 11l-6.7 7.6M9.7 11l5.4 2.4 5.9-.6M15.1 13.4l-.4 7.1" stroke="#5a3a1a" stroke-width=".9" fill="none" opacity=".55"/>
    <path d="M7.2 9.8 10 7.4l2.2 1" stroke="#fff" stroke-width=".9" fill="none" opacity=".8" stroke-linecap="round"/>`,
  water: `
    <path d="M12 2.4c3 4.4 6.4 8.2 6.4 12a6.4 6.4 0 0 1-12.8 0c0-3.8 3.4-7.6 6.4-12z" fill="currentColor" stroke="#e8f6ff" stroke-width=".8"/>
    <path d="M9 14.4a3.2 3.2 0 0 0 2.4 3.4" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".85"/>`,
  nature: `
    <path d="M12 21.6V11.2" stroke="#efffd6" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12 12.6C7.4 12.8 4.2 9.8 4 4.6c4.9-.3 8 2.6 8 8z" fill="currentColor" stroke="#f4ffd0" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M12 15.4c.2-5 3.4-8.2 8.2-8 .1 5-3.3 8-8.2 8z" fill="currentColor" stroke="#f4ffd0" stroke-width=".8" stroke-linejoin="round" opacity=".9"/>
    <path d="M6.4 6.8 11 11.6M17.8 9.6l-4.6 4.6" stroke="#2f7d3a" stroke-width=".8" opacity=".7"/>`,
  light: `
    <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2M4.6 4.6l2.2 2.2M17.2 17.2l2.2 2.2M4.6 19.4l2.2-2.2M17.2 6.8l2.2-2.2"/>
    </g>
    <circle cx="12" cy="12" r="5.2" fill="currentColor" stroke="#fffbe8" stroke-width=".8"/>
    <path d="M12 8.4 13 11 15.6 12 13 13 12 15.6 11 13 8.4 12 11 11z" fill="#fff"/>`,
  shadow: `
    <path d="M15.8 3.2A9 9 0 1 0 20.8 16 7.2 7.2 0 0 1 15.8 3.2z" fill="currentColor" stroke="#e7d4ff" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M8.6 9.2c.9-.6 2-.6 2.8 0M8.6 13.4c1.6 1.2 3.6 1.2 5.2 0" stroke="#1a0b2e" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".8"/>
    <circle cx="18.6" cy="5.4" r=".9" fill="#fff" opacity=".85"/>`,
  void: `
    <circle cx="12" cy="12" r="8.6" fill="#140a24" stroke="currentColor" stroke-width="1.4"/>
    <path d="M12 5.4a6.6 6.6 0 0 1 0 13.2 3.3 3.3 0 0 1 0-6.6 3.3 3.3 0 0 0 0-6.6z" fill="currentColor" opacity=".8"/>`,
  physical: `<path d="M5 19 19 5M14 5h5v5M7 14l3 3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`,
};

export function elementSVG(el, size = 24, extraClass = '') {
  const c = ELEMENT_CSS[el] || '#fff';
  return `<svg class="aw-ico ${extraClass}" viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${c}">${GLYPHS[el] || GLYPHS.physical}</svg>`;
}

// Spell icon: element glyph framed by a kind-specific motif.
export function spellSVG(el, kind, size = 44) {
  const c = ELEMENT_CSS[el] || '#fff';
  let frame = '';
  if (kind === 'basic') {
    frame = `<circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/>
             <circle cx="24" cy="24" r="11" fill="currentColor" opacity=".12"/>`;
  } else if (kind === 'heavy') {
    frame = `<circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2.2" opacity=".8"/>
             <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"/>
             <circle cx="24" cy="24" r="11" fill="currentColor" opacity=".16"/>`;
  } else {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = i % 2 ? 15 : 13.5, r1 = i % 2 ? 19 : 21.5;
      rays += `M${(24 + Math.cos(a) * r0).toFixed(2)} ${(24 + Math.sin(a) * r0).toFixed(2)}L${(24 + Math.cos(a) * r1).toFixed(2)} ${(24 + Math.sin(a) * r1).toFixed(2)}`;
    }
    frame = `<path d="${rays}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>
             <circle cx="24" cy="24" r="12.5" fill="currentColor" opacity=".2"/>
             <path d="M24 9.5 26 22 38.5 24 26 26 24 38.5 22 26 9.5 24 22 22z" fill="#fff" opacity=".14"/>`;
  }
  const s = kind === 'basic' ? 1.25 : kind === 'heavy' ? 1.12 : 1.05;
  const off = 24 - 12 * s;
  return `<svg class="aw-ico" viewBox="0 0 48 48" width="${size}" height="${size}" style="color:${c}">${frame}
    <g transform="translate(${off} ${off}) scale(${s})">${GLYPHS[el] || GLYPHS.physical}</g></svg>`;
}

// Rune reticle (crosshair).
export const RETICLE_SVG = `
<svg viewBox="0 0 64 64" width="64" height="64" class="aw-reticle-svg">
  <g fill="none" stroke="currentColor" stroke-linecap="round">
    <circle class="r-ring" cx="32" cy="32" r="9" stroke-width="1.8" stroke-dasharray="2.6 3.2" opacity=".85"/>
    <path class="r-ticks" d="M32 16v6M32 42v6M16 32h6M42 32h6" stroke-width="2.4"/>
    <path class="r-corners" d="M22 25l3-3M42 25l-3-3M22 39l3 3M42 39l-3 3" stroke-width="1.8" opacity=".9"/>
  </g>
  <circle cx="32" cy="32" r="2" fill="currentColor"/>
</svg>`;

// v2 fallback status table (used only when combat does not export STATUS_DEFS).
export const STATUS_COLORS = {
  burning: '#ff7a2a', frozen: '#bff4ff', wet: '#4fa8ff', shocked: '#d6b4ff',
  chilled: '#8fe0ff', airborne: '#9effcc', stunned: '#ffe27a',
};
export const STATUS_NAMES = {
  burning: '화상', frozen: '빙결', wet: '젖음', shocked: '감전', chilled: '냉기', airborne: '공중', stunned: '경직',
};

export const MARKER_SVG = {
  camp: `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="#3a1a14" stroke="#ff8a6a" stroke-width="1.4"/>
    <path d="M8 9.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5c0 1.6-.8 2.4-1.6 2.9v1.6H9.6v-1.6C8.8 11.9 8 11.1 8 9.5z" fill="#ffd2c4"/>
    <circle cx="10.4" cy="9.6" r="1" fill="#3a1a14"/><circle cx="13.6" cy="9.6" r="1" fill="#3a1a14"/><path d="M10 16.5h4" stroke="#ffd2c4" stroke-width="1.4"/></svg>`,
  boss: `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 1.5 22 7v10l-10 5.5L2 17V7z" fill="#2a1030" stroke="#ffcf6a" stroke-width="1.5"/>
    <path d="M6.5 8.5 9 11l3-4.5 3 4.5 2.5-2.5-1 7h-9z" fill="#ffcf6a"/></svg>`,
  done: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" fill="#1d2a22" stroke="#9fe8b0" stroke-width="1.2" opacity=".8"/>
    <path d="M8 12.2 11 15l5-6" stroke="#9fe8b0" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
};

// v2 additions: quest / npc compass markers and small HUD glyphs.
MARKER_SVG.quest = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="#2c2410" stroke="#ffd36a" stroke-width="1.5"/>
    <path d="M12 5.5 13.6 10.4 18.5 12 13.6 13.6 12 18.5 10.4 13.6 5.5 12 10.4 10.4z" fill="#ffe39a"/></svg>`;
MARKER_SVG.npc = `<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9.5" fill="#132430" stroke="#9fe0ff" stroke-width="1.4"/>
    <circle cx="12" cy="9.4" r="3" fill="#dff6ff"/><path d="M6.8 17.4c.9-2.6 2.9-3.9 5.2-3.9s4.3 1.3 5.2 3.9" fill="#dff6ff"/></svg>`;

export const LOCK_SVG = `<svg viewBox="0 0 16 16" width="13" height="13" class="aw-lock"><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="#d9c08a" stroke="#3a2c14" stroke-width=".8"/>
  <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="#d9c08a" stroke-width="1.6"/><circle cx="8" cy="10.6" r="1.1" fill="#3a2c14"/></svg>`;
export const SHIELD_SVG = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.2 20 5v6.4c0 5-3.4 8.8-8 10.4-4.6-1.6-8-5.4-8-10.4V5z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M12 5.4v13.2M7.2 9.6h9.6" stroke="currentColor" stroke-width="1.2" opacity=".7"/></svg>`;
export const DASH_SVG = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 7h7M2 12h9M3 17h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
  <path d="M12 4.5 21 12l-9 7.5 2.4-7.5z" fill="currentColor"/></svg>`;
export const STAMINA_SVG = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M13.5 2 5.5 13.2h5.6L9.8 22l8.7-12h-5.7z" fill="#9dff7a" stroke="#efffe6" stroke-width="1" stroke-linejoin="round"/></svg>`;

// v3: archetype glyphs (skill icon centre marks; drawn in currentColor on a 20×20 canvas).
const AG = (d, fill = false) => `<svg viewBox="0 0 20 20">${fill ? `<path d="${d}" fill="currentColor"/>` : `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`}</svg>`;
export const ARCH_GLYPH = {
  projectile: AG('M3 10h10M10 6l4 4-4 4'), volley: AG('M3 6h9M3 10h12M3 14h9'), lob: AG('M3 15Q10 1 17 15'),
  crawler: AG('M2 14q2-4 4 0t4 0 4 0 4 0'), beam: AG('M2 10h16M2 7.5h16M2 12.5h16'), cone: AG('M3 10 17 4M3 10l14 6M3 10h14'),
  nova: AG('M10 3a7 7 0 1 0 .01 0M10 7a3 3 0 1 0 .01 0'), zone: AG('M3 13a7 3.4 0 1 0 14 0 7 3.4 0 1 0-14 0M10 4v6'),
  wall: AG('M3 16V7h4v9M8 16V5h4v11M13 16V8h4v8'), pillar: AG('M7 17V4h6v13M5 17h10'), chain: AG('M3 15l4-5 3 3 3-6 4 5'),
  rain: AG('M5 3l-2 5M10 3 8 8M15 3l-2 5M7 11l-2 5M13 11l-2 5'), summon: AG('M10 3a3 3 0 1 0 .01 0M5 17q5-9 10 0'),
  blink: AG('M3 15 8 5l2 6 5-7M14 4h3v3'), dash: AG('M2 7h6M2 13h6M9 4l7 6-7 6'), leapslam: AG('M4 4q6 0 6 9M3 16h14M6 13l4 3 4-3'),
  grapple: AG('M3 16q4-12 13-11M13 3l3 2-2 3'), buff: AG('M10 2v16M4 8l6-6 6 6'), mark: AG('M10 2l2.4 5.6L18 10l-5.6 2.4L10 18l-2.4-5.6L2 10l5.6-2.4z'),
  chainbind: AG('M4 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0M10 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0'), tether: AG('M3 10q3.5-6 7 0t7 0'),
  lane: AG('M2 16 8 4M18 16 12 4M10 15v-2M10 10V8'), mine: AG('M10 5a5 5 0 1 0 .01 0M10 1v3M10 16v3M1 10h3M16 10h3'),
  bubble: AG('M10 3a7 7 0 1 0 .01 0M7 8a2 2 0 0 1 2-2'),
  basic: AG('M3 15 Q9 3 17 4'), heavy: AG('M4 12 L10 6 L16 12 M4 17 L10 11 L16 17'),
  support: AG('M10 2 L17 5 V10 C17 14 14 17 10 18 C6 17 3 14 3 10 V5 Z', true),
  ultimate: AG('M10 1 L12.2 7.5 L19 7.6 L13.6 11.8 L15.6 18.5 L10 14.5 L4.4 18.5 L6.4 11.8 L1 7.6 L7.8 7.5 Z', true),
  finisher: AG('M2 16 L4 6 L8 10 L10 3 L12 10 L16 6 L18 16 Z', true),
  passive: AG('M10 3a7 7 0 1 0 .01 0M10 6v4l3 2'), keystone: AG('M10 2 17 10 10 18 3 10z', true),
  modifier: AG('M4 10h12M10 4v12'), capstone: AG('M3 15h14L15 6l-3 4-2-6-2 6-3-4z', true),
};

/** Small class silhouettes (class cards, character sheet). Keyed by CLASS_DEFS[cls].style. */
const SIL = (body, weapon) => `<svg viewBox="0 0 64 80" class="aw-sil"><g fill="currentColor">${body}</g><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${weapon}</g></svg>`;
const BODY = '<circle cx="32" cy="14" r="8"/><path d="M20 30q12-8 24 0l4 30H16z"/><path d="M22 60h8v18h-8zM34 60h8v18h-8z"/>';
export const CLASS_SIL = {
  staff: SIL(BODY + '<path d="M18 30 8 70h12z" opacity=".55"/>', '<path d="M50 8v66"/><circle cx="50" cy="7" r="4" fill="currentColor"/>'),
  longsword: SIL(BODY, '<path d="M50 12v42M44 52h12M50 54v8"/>'),
  bow: SIL(BODY, '<path d="M48 8q14 30 0 62"/><path d="M48 8v62" stroke-width="1.2"/>'),
  hammer: SIL(BODY + '<path d="M6 34h14v20q-7 6-14 0z" opacity=".85"/>', '<path d="M52 20v46"/><path d="M44 12h16v10H44z" fill="currentColor"/>'),
  totem: SIL(BODY, '<path d="M50 14v60"/><path d="M44 8h12v12H44z" fill="currentColor"/><path d="M42 24l-4 8M58 24l4 8"/>'),
  daggers: SIL(BODY, '<path d="M10 36l-4 16M54 36l4 16M8 34l6 4M56 34l-6 4"/>'),
};
export const classSVG = (style) => CLASS_SIL[style] || CLASS_SIL.staff;
export const CHAIN_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" class="aw-chain"><g fill="none" stroke="#9a9a9a" stroke-width="2"><rect x="2" y="8" width="10" height="7" rx="3.5"/><rect x="12" y="9" width="10" height="7" rx="3.5"/></g></svg>`;
export const SHARD_SVG = `<svg viewBox="0 0 16 16" width="14" height="14" class="aw-shard"><path d="M8 1 12 6 9 15 4 7z" fill="#cfe8ff" stroke="#fff" stroke-width=".7"/><path d="M8 1 9 15" stroke="#7fb2ff" stroke-width=".6"/></svg>`;
