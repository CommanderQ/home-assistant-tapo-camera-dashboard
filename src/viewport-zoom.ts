/** Pure viewport crop helpers for stream pinch-zoom / pan (not PTZ). */

export const VIEWPORT_MIN_SCALE = 1;
export const VIEWPORT_MAX_SCALE = 4;

export interface ViewportTransform {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY_VIEWPORT: ViewportTransform = { scale: 1, x: 0, y: 0 };

/** Intrinsic media size when known (videoWidth / naturalWidth). */
export interface MediaIntrinsic {
  width: number;
  height: number;
}

/**
 * Displayed content size inside a contain-fitted element of `boxW` × `boxH`.
 * Falls back to the full box when intrinsic size is unknown.
 */
export function containContentSize(
  boxW: number,
  boxH: number,
  intrinsic?: MediaIntrinsic | null,
): { width: number; height: number } {
  if (
    !intrinsic ||
    !(intrinsic.width > 0) ||
    !(intrinsic.height > 0) ||
    !(boxW > 0) ||
    !(boxH > 0)
  ) {
    return { width: boxW, height: boxH };
  }
  const fit = Math.min(boxW / intrinsic.width, boxH / intrinsic.height);
  return {
    width: intrinsic.width * fit,
    height: intrinsic.height * fit,
  };
}

/**
 * Clamp translation so the scaled media never leaves empty viewport gaps.
 * Uses object-fit:contain content bounds when intrinsic size is known so
 * letterbox bars stay out of view once zoomed enough to cover them.
 */
export function clampViewport(
  t: ViewportTransform,
  boxW: number,
  boxH: number,
  intrinsic?: MediaIntrinsic | null,
): ViewportTransform {
  const scale = Math.min(
    VIEWPORT_MAX_SCALE,
    Math.max(VIEWPORT_MIN_SCALE, t.scale),
  );
  if (scale <= VIEWPORT_MIN_SCALE + 1e-6) {
    return { scale: VIEWPORT_MIN_SCALE, x: 0, y: 0 };
  }

  const content = containContentSize(boxW, boxH, intrinsic);
  const elMaxX = Math.max(0, (boxW * scale - boxW) / 2);
  const elMaxY = Math.max(0, (boxH * scale - boxH) / 2);
  const coverX = Math.max(0, (content.width * scale - boxW) / 2);
  const coverY = Math.max(0, (content.height * scale - boxH) / 2);
  // Once zoom covers the letterbox, clamp to content edges; otherwise clamp
  // to the media element so the stream container chrome never shows.
  const canCover =
    content.width * scale >= boxW - 0.5 && content.height * scale >= boxH - 0.5;
  const limX = canCover ? coverX : elMaxX;
  const limY = canCover ? coverY : elMaxY;

  return {
    scale,
    x: Math.min(limX, Math.max(-limX, t.x)),
    y: Math.min(limY, Math.max(-limY, t.y)),
  };
}

/** Zoom keeping the point `(focalX, focalY)` (box-local px) visually fixed. */
export function zoomAt(
  t: ViewportTransform,
  focalX: number,
  focalY: number,
  newScale: number,
  boxW: number,
  boxH: number,
  intrinsic?: MediaIntrinsic | null,
): ViewportTransform {
  const scale = Math.min(
    VIEWPORT_MAX_SCALE,
    Math.max(VIEWPORT_MIN_SCALE, newScale),
  );
  if (scale <= VIEWPORT_MIN_SCALE + 1e-6) {
    return { scale: VIEWPORT_MIN_SCALE, x: 0, y: 0 };
  }
  const ox = focalX - boxW / 2;
  const oy = focalY - boxH / 2;
  const ratio = scale / t.scale;
  return clampViewport(
    {
      scale,
      x: ox - (ox - t.x) * ratio,
      y: oy - (oy - t.y) * ratio,
    },
    boxW,
    boxH,
    intrinsic,
  );
}

export function panBy(
  t: ViewportTransform,
  dx: number,
  dy: number,
  boxW: number,
  boxH: number,
  intrinsic?: MediaIntrinsic | null,
): ViewportTransform {
  if (t.scale <= VIEWPORT_MIN_SCALE + 1e-6) {
    return { scale: VIEWPORT_MIN_SCALE, x: 0, y: 0 };
  }
  return clampViewport(
    { scale: t.scale, x: t.x + dx, y: t.y + dy },
    boxW,
    boxH,
    intrinsic,
  );
}

export function viewportCss(t: ViewportTransform): string {
  if (t.scale <= VIEWPORT_MIN_SCALE + 1e-6) {
    return "none";
  }
  return `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
}

export function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function touchMidpoint(
  a: Touch,
  b: Touch,
): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}
