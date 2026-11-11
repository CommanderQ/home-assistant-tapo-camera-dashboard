import { html, TemplateResult } from "lit";

/** Industrial C260-style body used as the Concept C center graphic. */
export function cameraSvg(): TemplateResult {
  return html`
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="tapo-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8a939c" />
          <stop offset="40%" stop-color="#4a525a" />
          <stop offset="100%" stop-color="#2a2e32" />
        </linearGradient>
        <radialGradient id="tapo-glass" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#7ec8e3" />
          <stop offset="45%" stop-color="#1a3040" />
          <stop offset="100%" stop-color="#05080c" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="102" rx="28" ry="6" fill="#000" opacity="0.45"></ellipse>
      <rect
        x="40"
        y="82"
        width="40"
        height="16"
        rx="4"
        fill="url(#tapo-steel)"
        stroke="#6a737c"
      ></rect>
      <rect
        x="54"
        y="62"
        width="12"
        height="22"
        rx="2"
        fill="#3a4046"
        stroke="#5a636c"
      ></rect>
      <g>
        <rect
          x="26"
          y="34"
          width="68"
          height="40"
          rx="8"
          fill="url(#tapo-steel)"
          stroke="#7a848e"
          stroke-width="1.2"
        ></rect>
        <rect x="30" y="38" width="8" height="6" rx="1" fill="#d4a017"></rect>
        <circle cx="60" cy="54" r="18" fill="#1a1c1e" stroke="#6a737c"></circle>
        <circle cx="60" cy="54" r="14" fill="url(#tapo-glass)"></circle>
        <circle cx="53" cy="48" r="3" fill="#fff" opacity="0.4"></circle>
        <path d="M48 28h24l4 8H44z" fill="#3a4046" stroke="#5a636c"></path>
      </g>
    </svg>
  `;
}
