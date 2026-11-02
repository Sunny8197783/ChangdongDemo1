// Inline SVG icon set for the UI (elements, spell kinds, statuses, compass markers).
import { ELEMENT_COLORS } from '../core/utils.js';

export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export const ELEMENT_CSS = Object.fromEntries(Object.entries(ELEMENT_COLORS).map(([k, v]) => [k, hex(v)]));
ELEMENT_CSS.water = '#4fa8ff';

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

export const STATUS_COLORS = {
  burning: '#ff7a2a', frozen: '#bff4ff', wet: '#4fa8ff', shocked: '#d6b4ff',
  chilled: '#8fe0ff', airborne: '#9effcc', stunned: '#ffe27a',
};
export const STATUS_NAMES = {
  burning: '화상', frozen: '빙결', wet: '젖음', shocked: '감전', chilled: '냉기', airborne: '공중', stunned: '기절',
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
