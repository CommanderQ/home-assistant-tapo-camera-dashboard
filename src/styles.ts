import { css } from "lit";

/**
 * Card chrome uses HA / MDC theme tokens.
 * Concept C industrial look is reserved for the CSS 3D camera graphic.
 */
export const cardStyles = css`
  :host {
    /* Local aliases → HA tokens first; Concept C hex only as fallbacks. */
    --tapo-bg: var(--primary-background-color, #1a1c1e);
    --tapo-card: var(--card-background-color, #2a2e32);
    --tapo-metal: var(--secondary-background-color, #3a4046);
    --tapo-metal-hi: var(--divider-color, var(--outline-color, #5a636c));
    --tapo-ink: var(--primary-text-color, #e6e8ea);
    --tapo-muted: var(--secondary-text-color, #9aa3ab);
    --tapo-amber: var(--accent-color, var(--mdc-theme-secondary, #d4a017));
    --tapo-amber-dim: var(--primary-color, var(--mdc-theme-primary, #8a6a12));
    --tapo-amber-rgb: var(--rgb-accent-color, 212, 160, 23);
    --tapo-muted-rgb: var(--rgb-secondary-text-color, 154, 163, 171);
    --tapo-ink-rgb: var(--rgb-primary-text-color, 230, 232, 234);
    /* MDC control tokens (ha-icon-button / range accent). */
    --mdc-theme-primary: var(--primary-color, var(--tapo-amber-dim));
    --mdc-theme-secondary: var(--accent-color, var(--tapo-amber));
    --mdc-theme-on-primary: var(--text-primary-color, var(--tapo-ink));
    --mdc-theme-text-primary-on-background: var(--primary-text-color, var(--tapo-ink));
    --mdc-theme-text-secondary-on-background: var(
      --secondary-text-color,
      var(--tapo-muted)
    );
    --mdc-icon-size: 24px;
    display: block;
    inline-size: 100%;
    block-size: auto;
  }

  ha-card,
  .card {
    inline-size: 100%;
    block-size: auto;
    background: var(
      --ha-card-background,
      var(--card-background-color, var(--tapo-card))
    );
    border-width: var(--ha-card-border-width, 1px);
    border-style: solid;
    border-color: var(--ha-card-border-color, var(--divider-color, #4a525a));
    border-radius: var(--ha-card-border-radius, 12px);
    box-shadow: var(--ha-card-box-shadow, none);
    overflow: hidden;
    color: var(--primary-text-color, var(--tapo-ink));
    font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, Noto, sans-serif));
  }

  .layout {
    display: flex;
    flex-direction: column;
  }

  /* Single-cell grid: media, placeholder, and privacy banner stack. */
  .stream {
    position: relative;
    aspect-ratio: 16 / 10;
    min-block-size: 180px;
    background:
      linear-gradient(180deg, #3d4a52 0%, #2a3338 50%, #1f2629 100%);
    border-block-end: 1px solid var(--divider-color, #15181b);
    display: grid;
    grid-template: 1fr / 1fr;
    overflow: hidden;
    /* Stream pinch/pan only — never reaches the PTZ pad. */
    touch-action: none;
  }

  .stream-media {
    grid-area: 1 / 1;
    inline-size: 100%;
    block-size: 100%;
    /* Native aspect — letterbox instead of crop/stretch. */
    object-fit: contain;
    background: #0e1012;
    z-index: 1;
    transform-origin: center center;
    will-change: transform;
  }

  /* HTML-native <video> fallback (last child after <source>s). */
  video.stream-media > .stream-fallback {
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
    background: #0e1012;
  }

  .stream-placeholder {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--tapo-muted);
    z-index: 1;
    padding: var(--ha-space-6, 24px);
  }

  .stream-placeholder strong {
    display: block;
    color: var(--tapo-ink);
    margin-block-end: var(--ha-space-1, 4px);
    letter-spacing: 0.06em;
  }

  .stream-placeholder span {
    font-size: 0.85rem;
  }

  .pad {
    padding: var(--ha-space-5, 18px) var(--ha-space-4, 16px) var(--ha-space-5, 20px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-3, 12px);
    background:
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 2px,
        rgba(255, 255, 255, 0.01) 2px,
        rgba(255, 255, 255, 0.01) 3px
      );
  }

  .angles {
    min-block-size: 1.2em;
    font-size: var(--ha-font-size-xs, 11px);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-color, var(--mdc-theme-secondary, var(--tapo-amber)));
    font-variant-numeric: tabular-nums;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .angles.visible {
    opacity: 1;
  }

  /* Lower control row: PTZ block (ring + hint) | privacy + audio; side matches ring. */
  .pad-controls {
    /* Shared so side chrome block-size tracks the ring, not ring+hint. */
    --ring-size: min(220px, 64vw, calc(100vw - 140px));
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: start;
    gap: var(--ha-space-2, 10px);
    inline-size: 100%;
    max-inline-size: 100%;
  }

  /* PTZ pad + hint: one column aligned to the control set width. */
  .pad-ptz {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ha-space-3, 12px);
    flex: 0 1 auto;
    min-inline-size: 0;
  }

  .ring-wrap {
    /* Leave room for privacy + vertical audio stack on phones. */
    inline-size: var(--ring-size);
    aspect-ratio: 1;
    flex: 0 0 auto;
    display: grid;
  }

  /* Pad chrome — HA surface / divider tokens (not Concept C metal paint). */
  .ring {
    inline-size: 100%;
    block-size: 100%;
    border-radius: 50%;
    background: radial-gradient(
      circle at 40% 30%,
      var(--secondary-background-color, var(--tapo-metal-hi)),
      var(--card-background-color, var(--tapo-card)) 55%,
      var(--primary-background-color, var(--tapo-bg))
    );
    border: var(--ha-card-border-width, 2px) solid
      var(--divider-color, var(--outline-color, var(--tapo-metal-hi)));
    box-shadow:
      inset 0 0 0 8px var(--ha-card-background, var(--card-background-color, var(--tapo-card))),
      inset 0 0 0 9px var(--divider-color, var(--tapo-metal-hi));
    display: grid;
    grid-template: 1fr / 1fr;
    touch-action: none;
  }

  .ticks {
    grid-area: 1 / 1;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 0deg 8deg,
      rgba(var(--tapo-amber-rgb), 0.35) 8deg 9deg,
      transparent 9deg 44deg,
      rgba(var(--tapo-muted-rgb), 0.25) 44deg 45deg,
      transparent 45deg 89deg,
      rgba(var(--tapo-amber-rgb), 0.5) 89deg 91deg,
      transparent 91deg 134deg,
      rgba(var(--tapo-muted-rgb), 0.25) 134deg 135deg,
      transparent 135deg 179deg,
      rgba(var(--tapo-amber-rgb), 0.5) 179deg 181deg,
      transparent 181deg 224deg,
      rgba(var(--tapo-muted-rgb), 0.25) 224deg 225deg,
      transparent 225deg 269deg,
      rgba(var(--tapo-amber-rgb), 0.5) 269deg 271deg,
      transparent 271deg 314deg,
      rgba(var(--tapo-muted-rgb), 0.25) 314deg 315deg,
      transparent 315deg 360deg
    );
    mask: radial-gradient(circle, transparent 72%, #000 73% 92%, transparent 93%);
    -webkit-mask: radial-gradient(
      circle,
      transparent 72%,
      #000 73% 92%,
      transparent 93%
    );
    pointer-events: none;
  }

  /* PTZ ha-icon-button — MDC / HA icon-button sizing; no custom metal chrome. */
  ha-icon-button.btn {
    grid-area: 1 / 1;
    --ha-icon-button-size: 48px;
    --mdc-icon-button-size: 48px;
    --mdc-icon-size: 24px;
    color: var(--mdc-theme-text-primary-on-background, var(--tapo-ink));
    z-index: 3;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  ha-icon-button.btn:hover:not([disabled]),
  ha-icon-button.btn:focus-visible:not([disabled]) {
    color: var(--primary-color, var(--mdc-theme-primary, var(--tapo-amber)));
  }

  ha-icon-button.btn.active:not([disabled]),
  ha-icon-button.btn[selected]:not([disabled]) {
    color: var(--accent-color, var(--mdc-theme-secondary, var(--tapo-amber)));
  }

  ha-icon-button.btn[disabled] {
    color: var(--disabled-text-color, var(--tapo-ink));
    opacity: 0.38;
    pointer-events: none;
  }

  ha-icon-button.btn.up {
    justify-self: center;
    align-self: start;
    margin-block-start: var(--ha-space-3, 12px);
  }
  ha-icon-button.btn.down {
    justify-self: center;
    align-self: end;
    margin-block-end: var(--ha-space-3, 12px);
  }
  ha-icon-button.btn.left {
    justify-self: start;
    align-self: center;
    margin-inline-start: var(--ha-space-3, 12px);
  }
  ha-icon-button.btn.right {
    justify-self: end;
    align-self: center;
    margin-inline-end: var(--ha-space-3, 12px);
  }

  .stage {
    grid-area: 1 / 1;
    margin: 52px;
    perspective: 520px;
    perspective-origin: 50% 45%;
    display: grid;
    place-items: center;
    z-index: 1;
    transform-style: preserve-3d;
  }

  /* Orientation readout only — not a control (PTZ arrows move the camera). */
  .orientation-view {
    inline-size: 96px;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 2;
    transform-style: preserve-3d;
  }

  .cam3d {
    inline-size: 88px;
    aspect-ratio: 1;
    position: relative;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  /*
   * CSS 3D extruded model — physical positioning and explicit face sizes are
   * required for rotateX/Y box geometry; flex/grid cannot replace them.
   */
  .cam-rig {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    /* Slight presentation pitch so face-on still shows thickness/top. */
    transform: translateY(4px) rotateX(14deg);
  }

  .cam-shadow {
    position: absolute;
    left: 50%;
    top: 78%;
    width: 52px;
    height: 16px;
    margin-left: -26px;
    border-radius: 50%;
    background: radial-gradient(
      ellipse at center,
      rgba(0, 0, 0, 0.55) 0%,
      rgba(0, 0, 0, 0) 70%
    );
    transform: translateZ(-22px) rotateX(90deg);
    transform-style: preserve-3d;
  }

  /* Neck + body only — pivots above the fixed base. */
  .cam-head {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transform-origin: 50% 70%;
    transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
  }

  .cam-base,
  .cam-neck,
  .cam-body {
    position: absolute;
    left: 50%;
    transform-style: preserve-3d;
  }

  .cam-base {
    width: 42px;
    height: 12px;
    margin-left: -21px;
    top: 70%;
  }

  .cam-neck {
    width: 12px;
    height: 18px;
    margin-left: -6px;
    top: 52%;
  }

  .cam-body {
    width: 56px;
    height: 34px;
    margin-left: -28px;
    top: 18%;
  }

  .face {
    position: absolute;
    left: 0;
    top: 0;
    box-sizing: border-box;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border: 1px solid rgba(122, 132, 142, 0.55);
  }

  /* Shared metal fills */
  .cam-base .face,
  .cam-neck .face {
    background: linear-gradient(160deg, #6a737c, #3a4046 55%, #23272b);
  }

  .cam-body .face {
    background: linear-gradient(160deg, #8a939c, #4a525a 45%, #2a2e32);
  }

  .cam-body .face.left,
  .cam-body .face.right {
    background:
      linear-gradient(
        90deg,
        rgba(var(--tapo-amber-rgb), 0.22) 0 2px,
        transparent 2px
      ),
      linear-gradient(180deg, #5a636c, #2e343a 60%, #1e2226);
  }

  .cam-body .face.back {
    background: linear-gradient(160deg, #5a636c, #2a2e32 60%, #1a1c1e);
  }

  .cam-body .face.top {
    background: linear-gradient(90deg, #6a737c, #4a525a 50%, #3a4046);
  }

  .cam-body .face.bottom {
    background: linear-gradient(90deg, #2a2e32, #1a1c1e);
  }

  /* Base box: 42 × 12 × 34 */
  .cam-base .face.front,
  .cam-base .face.back {
    width: 42px;
    height: 12px;
  }
  .cam-base .face.front {
    transform: translateZ(17px);
  }
  .cam-base .face.back {
    transform: rotateY(180deg) translateZ(17px);
  }
  .cam-base .face.left,
  .cam-base .face.right {
    width: 34px;
    height: 12px;
    left: 4px;
  }
  .cam-base .face.left {
    transform: rotateY(-90deg) translateZ(21px);
  }
  .cam-base .face.right {
    transform: rotateY(90deg) translateZ(21px);
  }
  .cam-base .face.top,
  .cam-base .face.bottom {
    width: 42px;
    height: 34px;
    top: -11px;
  }
  .cam-base .face.top {
    transform: rotateX(90deg) translateZ(6px);
    background: linear-gradient(180deg, #5a636c, #3a4046);
  }
  .cam-base .face.bottom {
    transform: rotateX(-90deg) translateZ(6px);
  }

  /* Neck box: 12 × 18 × 16 */
  .cam-neck .face.front,
  .cam-neck .face.back {
    width: 12px;
    height: 18px;
  }
  .cam-neck .face.front {
    transform: translateZ(8px);
  }
  .cam-neck .face.back {
    transform: rotateY(180deg) translateZ(8px);
  }
  .cam-neck .face.left,
  .cam-neck .face.right {
    width: 16px;
    height: 18px;
    left: -2px;
  }
  .cam-neck .face.left {
    transform: rotateY(-90deg) translateZ(6px);
  }
  .cam-neck .face.right {
    transform: rotateY(90deg) translateZ(6px);
  }
  .cam-neck .face.top,
  .cam-neck .face.bottom {
    width: 12px;
    height: 16px;
    top: 1px;
  }
  .cam-neck .face.top {
    transform: rotateX(90deg) translateZ(9px);
  }
  .cam-neck .face.bottom {
    transform: rotateX(-90deg) translateZ(9px);
  }

  /* Body box: 56 × 34 × 36 (deeper extrusion so edge-on stays chunky) */
  .cam-body .face.front,
  .cam-body .face.back {
    width: 56px;
    height: 34px;
  }
  .cam-body .face.front {
    transform: translateZ(18px);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .cam-body .face.back {
    transform: rotateY(180deg) translateZ(18px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .cam-body .face.left,
  .cam-body .face.right {
    width: 36px;
    height: 34px;
    left: 10px;
  }
  .cam-body .face.left {
    transform: rotateY(-90deg) translateZ(28px);
  }
  .cam-body .face.right {
    transform: rotateY(90deg) translateZ(28px);
  }
  .cam-body .face.top,
  .cam-body .face.bottom {
    width: 56px;
    height: 36px;
    top: -1px;
  }
  .cam-body .face.top {
    transform: rotateX(90deg) translateZ(17px);
    display: grid;
    place-items: start center;
    padding-block-start: 4px;
  }
  .cam-body .face.bottom {
    transform: rotateX(-90deg) translateZ(17px);
  }

  /* Decorative overlays on fixed-size 3D faces — absolute stays. */
  .led {
    position: absolute;
    top: 5px;
    left: 6px;
    width: 7px;
    height: 5px;
    border-radius: 1px;
    background: var(--tapo-amber);
    box-shadow: 0 0 4px rgba(var(--tapo-amber-rgb), 0.55);
  }

  .lens-bezel {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #1a1c1e;
    border: 1px solid #6a737c;
    box-shadow: inset 0 0 0 2px #2a2e32;
  }

  .lens {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 30%,
      #7ec8e3 0%,
      #1a3040 45%,
      #05080c 100%
    );
    box-shadow: inset 0 0 0 1px rgba(106, 115, 124, 0.6);
  }

  .glint {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.45);
    transform: translate(-5px, -5px);
  }

  .vent {
    width: 3px;
    height: 14px;
    border-radius: 1px;
    background: #15181b;
    border: 1px solid #4a525a;
  }

  .hood {
    width: 28px;
    height: 8px;
    border-radius: 2px 2px 0 0;
    background: linear-gradient(180deg, #3a4046, #2a2e32);
    border: 1px solid #5a636c;
    border-block-end: 0;
  }

  .hint {
    margin: 0;
    font-size: var(--ha-font-size-xs, var(--mdc-typography-caption-font-size, 11px));
    color: var(--secondary-text-color, var(--mdc-theme-text-secondary-on-background, var(--tapo-muted)));
    text-align: center;
    inline-size: 100%;
    max-inline-size: var(--ring-size);
    line-height: var(--ha-line-height-condensed, 1.4);
    letter-spacing: 0.03em;
  }

  /* Privacy (left) + mute/volume column — height matches PTZ ring. */
  .pad-media {
    display: flex;
    flex-direction: row;
    align-items: start;
    gap: var(--ha-space-2, 8px);
    block-size: var(--ring-size);
    flex: 0 0 auto;
    touch-action: manipulation;
  }

  .pad-audio {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: var(--ha-space-2, 8px);
    inline-size: 44px;
    block-size: 100%;
    flex: 0 0 auto;
    touch-action: manipulation;
  }

  ha-icon-button.privacy-toggle,
  ha-icon-button.audio-mute {
    --ha-icon-button-size: 44px;
    --mdc-icon-button-size: 44px;
    --mdc-icon-size: 22px;
    color: var(--mdc-theme-text-primary-on-background, var(--tapo-ink));
    touch-action: manipulation;
  }

  ha-icon-button.privacy-toggle:hover,
  ha-icon-button.privacy-toggle:focus-visible,
  ha-icon-button.audio-mute:hover,
  ha-icon-button.audio-mute:focus-visible {
    color: var(--primary-color, var(--mdc-theme-primary, var(--tapo-amber)));
  }

  ha-icon-button.privacy-toggle.on,
  ha-icon-button.privacy-toggle[selected] {
    color: var(--accent-color, var(--mdc-theme-secondary, var(--tapo-amber)));
  }

  ha-icon-button.audio-mute.muted,
  ha-icon-button.audio-mute[selected] {
    color: var(--secondary-text-color, var(--tapo-muted));
  }

  .audio-volume {
    /* Vertical range: low at bottom, high at top; fills leftover column height. */
    writing-mode: vertical-lr;
    direction: rtl;
    -webkit-appearance: slider-vertical;
    appearance: slider-vertical;
    /* Physical width/height: WebKit slider-vertical + writing-mode pairing. */
    width: 28px;
    flex: 1 1 auto;
    min-height: 64px;
    height: 100%;
    margin: 0;
    padding: 0;
    accent-color: var(
      --mdc-theme-primary,
      var(--primary-color, var(--tapo-amber))
    );
    color: var(--mdc-theme-primary, var(--primary-color, var(--tapo-amber)));
    cursor: pointer;
    touch-action: none;
  }

  .privacy-banner {
    grid-area: 1 / 1;
    z-index: 4;
    display: grid;
    place-items: center;
    /* Intentional video overlay black — not theme chrome. */
    background: rgba(10, 12, 14, 0.72);
    color: var(--accent-color, var(--mdc-theme-secondary, var(--tapo-amber)));
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: var(--ha-font-size-s, 12px);
  }

  .error {
    padding: var(--ha-space-4, 16px);
    color: var(--error-color, #f0a0a0);
    font-size: 0.9rem;
  }
`;
