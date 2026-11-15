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

/** Contain fit factor: media layout → viewport box (1× zoom looks letterboxed). */
export function fitScale(
  boxW: number,
  boxH: number,
  mediaW: number,
  mediaH: number,
): number {
  if (!(mediaW > 0) || !(mediaH > 0) || !(boxW > 0) || !(boxH > 0)) {
    return 1;
  }
  return Math.min(boxW / mediaW, boxH / mediaH);
}

/**
 * CSS layout size for the media layer.
 *
 * Prefer full decode resolution so `scale(fit × zoom)` can reveal native
 * detail (C260 HD/4K). `box` / `maxZoom` / `dpr` are reserved for a future
 * memory cap if Companion OOMs on always-on 4K layers — do not shrink below
 * decode for typical streams or zoom quality regresses again.
 */
export function layoutMediaSize(
  intrinsic: MediaIntrinsic,
  _boxW?: number,
  _boxH?: number,
  _maxZoom = VIEWPORT_MAX_SCALE,
  _dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0
    ? devicePixelRatio
    : 1,
): MediaIntrinsic {
  return { width: intrinsic.width, height: intrinsic.height };
}

/**
 * Clamp translation so the scaled media never leaves empty viewport gaps.
 *
 * When `media` is the laid-out (intrinsic) layer size, composite scale is
 * `fit × zoom` and letterboxing is empty `.stream` chrome — not object-fit
 * bars inside a container-sized element.
 *
 * When `media` is omitted, falls back to scaling a box-filling element.
 */
export function clampViewport(
  t: ViewportTransform,
  boxW: number,
  boxH: number,
  media?: MediaIntrinsic | null,
): ViewportTransform {
  const scale = Math.min(
    VIEWPORT_MAX_SCALE,
    Math.max(VIEWPORT_MIN_SCALE, t.scale),
  );
  if (scale <= VIEWPORT_MIN_SCALE + 1e-6) {
    return { scale: VIEWPORT_MIN_SCALE, x: 0, y: 0 };
  }

  if (
    media &&
    media.width > 0 &&
    media.height > 0 &&
    boxW > 0 &&
    boxH > 0
  ) {
    const fit = fitScale(boxW, boxH, media.width, media.height);
    const shownW = media.width * fit * scale;
    const shownH = media.height * fit * scale;
    const limX = Math.max(0, (shownW - boxW) / 2);
    const limY = Math.max(0, (shownH - boxH) / 2);
    return {
      scale,
      x: Math.min(limX, Math.max(-limX, t.x)),
      y: Math.min(limY, Math.max(-limY, t.y)),
    };
  }

  const elMaxX = Math.max(0, (boxW * scale - boxW) / 2);
  const elMaxY = Math.max(0, (boxH * scale - boxH) / 2);
  return {
    scale,
    x: Math.min(elMaxX, Math.max(-elMaxX, t.x)),
    y: Math.min(elMaxY, Math.max(-elMaxY, t.y)),
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
  media?: MediaIntrinsic | null,
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
    media,
  );
}

export function panBy(
  t: ViewportTransform,
  dx: number,
  dy: number,
  boxW: number,
  boxH: number,
  media?: MediaIntrinsic | null,
): ViewportTransform {
  if (t.scale <= VIEWPORT_MIN_SCALE + 1e-6) {
    return { scale: VIEWPORT_MIN_SCALE, x: 0, y: 0 };
  }
  return clampViewport(
    { scale: t.scale, x: t.x + dx, y: t.y + dy },
    boxW,
    boxH,
    media,
  );
}

/**
 * Paint transform. `fit` is 1 for the legacy box-fill path; for intrinsic
 * layout use `fitScale(box, media)` so 1× zoom is contain-fitted via CSS scale.
 */
export function viewportCss(t: ViewportTransform, fit = 1): string {
  const f = fit > 0 ? fit : 1;
  const s = f * t.scale;
  if (
    Math.abs(s - 1) < 1e-6 &&
    Math.abs(t.x) < 1e-6 &&
    Math.abs(t.y) < 1e-6
  ) {
    return "none";
  }
  return `translate(${t.x}px, ${t.y}px) scale(${s})`;
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
