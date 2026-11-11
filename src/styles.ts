import { css } from "lit";

/** Concept C — industrial metal / amber accents, portrait stream-over-pad. */
export const cardStyles = css`
  :host {
    --tapo-bg: #1a1c1e;
    --tapo-card: #2a2e32;
    --tapo-metal: #3a4046;
    --tapo-metal-hi: #5a636c;
    --tapo-ink: #e6e8ea;
    --tapo-muted: #9aa3ab;
    --tapo-amber: #d4a017;
    --tapo-amber-dim: #8a6a12;
    display: block;
  }

  ha-card,
  .card {
    background: linear-gradient(160deg, #32383e, #23272b 60%, #1e2226);
    border: 1px solid #4a525a;
    border-radius: 10px;
    box-shadow:
      0 0 0 1px #15181b,
      0 12px 28px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    overflow: hidden;
    color: var(--tapo-ink);
    font-family: "DIN Alternate", "Helvetica Neue", "Arial Narrow", sans-serif;
  }

  .layout {
    display: flex;
    flex-direction: column;
  }

  .stream {
    position: relative;
    aspect-ratio: 16 / 10;
    min-height: 180px;
    background:
      linear-gradient(180deg, #3d4a52 0%, #2a3338 50%, #1f2629 100%);
    border-bottom: 1px solid #15181b;
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .stream::after {
    content: "";
    position: absolute;
    inset: 10px;
    border: 1px solid rgba(212, 160, 23, 0.25);
    border-radius: 4px;
    pointer-events: none;
    z-index: 2;
  }

  .stream-label {
    position: absolute;
    top: 18px;
    left: 18px;
    z-index: 3;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--tapo-amber);
    border: 1px solid var(--tapo-amber-dim);
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.35);
  }

  .stream-media,
  .stream-placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .stream-media {
    object-fit: cover;
    background: #0e1012;
    z-index: 1;
  }

  .stream-placeholder {
    display: grid;
    place-items: center;
    text-align: center;
    color: var(--tapo-muted);
    z-index: 1;
    padding: 24px;
  }

  .stream-placeholder strong {
    display: block;
    color: var(--tapo-ink);
    margin-bottom: 4px;
    letter-spacing: 0.06em;
  }

  .stream-placeholder span {
    font-size: 0.85rem;
  }

  .pad {
    padding: 18px 16px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
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
    min-height: 1.2em;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tapo-amber);
    font-variant-numeric: tabular-nums;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .angles.visible {
    opacity: 1;
  }

  .ring-wrap {
    width: min(220px, 72vw);
    height: min(220px, 72vw);
    position: relative;
  }

  .ring {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 30%, #4a525a, #2a2e32 55%, #1a1c1e);
    border: 2px solid #5a636c;
    box-shadow:
      inset 0 0 0 8px #23272b,
      inset 0 0 0 9px #4a525a,
      0 10px 24px rgba(0, 0, 0, 0.5);
    position: relative;
    touch-action: none;
  }

  .ticks {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 0deg 8deg,
      rgba(212, 160, 23, 0.35) 8deg 9deg,
      transparent 9deg 44deg,
      rgba(154, 163, 171, 0.25) 44deg 45deg,
      transparent 45deg 89deg,
      rgba(212, 160, 23, 0.5) 89deg 91deg,
      transparent 91deg 134deg,
      rgba(154, 163, 171, 0.25) 134deg 135deg,
      transparent 135deg 179deg,
      rgba(212, 160, 23, 0.5) 179deg 181deg,
      transparent 181deg 224deg,
      rgba(154, 163, 171, 0.25) 224deg 225deg,
      transparent 225deg 269deg,
      rgba(212, 160, 23, 0.5) 269deg 271deg,
      transparent 271deg 314deg,
      rgba(154, 163, 171, 0.25) 314deg 315deg,
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

  .btn {
    position: absolute;
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
    border-radius: 6px;
    border: 1px solid var(--tapo-metal-hi);
    background: linear-gradient(180deg, #4a525a, #2e343a);
    color: var(--tapo-ink);
    cursor: pointer;
    font-size: 14px;
    z-index: 3;
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .btn:hover:not(:disabled) {
    border-color: var(--tapo-amber);
    color: var(--tapo-amber);
  }

  .btn:active:not(:disabled),
  .btn.active:not(:disabled) {
    background: #1e2226;
    border-color: var(--tapo-amber);
    color: var(--tapo-amber);
  }

  .btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn.up {
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
  }
  .btn.down {
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
  }
  .btn.left {
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
  }
  .btn.right {
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }

  .stage {
    position: absolute;
    inset: 52px;
    perspective: 520px;
    display: grid;
    place-items: center;
    z-index: 1;
  }

  .home-hit {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
    width: 96px;
    height: 96px;
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    cursor: pointer;
    display: grid;
    place-items: center;
    touch-action: manipulation;
    z-index: 2;
  }

  .home-hit:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .home-hit:focus-visible {
    outline: 2px solid var(--tapo-amber);
    outline-offset: 2px;
  }

  .cam3d {
    width: 88px;
    height: 88px;
    transform-style: preserve-3d;
    transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
    pointer-events: none;
  }

  .cam3d svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.55));
  }

  .hint {
    font-size: 11px;
    color: var(--tapo-muted);
    text-align: center;
    max-width: 240px;
    line-height: 1.4;
    letter-spacing: 0.03em;
  }

  .privacy-banner {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-items: center;
    background: rgba(10, 12, 14, 0.72);
    color: var(--tapo-amber);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 12px;
  }

  .error {
    padding: 16px;
    color: #f0a0a0;
    font-size: 0.9rem;
  }
`;
