# Highest-quality stream zoom proposal

**Status:** research only — do not implement yet  
**Card:** `custom:tapo-c260-card`  
**Task:** HACD-54  
**Related code:** `src/viewport-zoom.ts`, `src/styles.ts` (`.stream` / `.stream-media`), `src/tapo-c260-card.ts` (gesture + transform), `src/stream.ts` (attach / decode)

---

## Verdict on the user assertion

**Partial agree.**

| Claim | Assessment |
| --- | --- |
| Media is laid out to the **container** size, then pinch applies CSS `transform` on that same element | **Agree** — concrete code evidence below |
| Zoom is therefore into a **downsized bitmap**, so detail is lost | **Partially agree as a product risk** — decode stays at stream resolution (`video.videoWidth` × `video.videoHeight`); whether pinch recovers source pixels depends on compositor path. Container-sized layout + upscale is the **unsafe** default on phone / Companion WebViews. Treat “zooming a fitted box” as soft until proven otherwise on device. |
| Want: full-res render → CSS scale-down to fit → further CSS transforms for zoom so zoom reveals native detail | **Agree as the guarantee strategy** — standard “map / lightbox” pattern; makes quality independent of compositor luck |

**Bottom line:** The current gesture math and CSS already use transforms (good). The missing piece is **sizing the painted media layer at (or near) decode resolution before the fit+zoom scale**, not replacing CSS transforms with a different zoom API.

---

## Current implementation (evidence)

### Layout

`.stream` is the clipped viewport (`overflow: hidden`, fixed `aspect-ratio: 16 / 10`).  
`.stream-media` (`<video>` or MJPEG `<img>`) fills that box:

```css
.stream-media {
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
  transform-origin: center center;
  will-change: transform;
}
```

So the media **element’s CSS box** matches the container, not the stream’s intrinsic pixels. `object-fit: contain` letterboxes the decoded frame inside that box.

### Zoom / pan

- State: `_viewport: { scale, x, y }` (`VIEWPORT_MIN_SCALE = 1` … `VIEWPORT_MAX_SCALE = 4`)
- Applied as an inline style on the media element: `transform: translate(…) scale(…)` via `viewportCss()`
- Intrinsic size (`video.videoWidth` / `img.naturalWidth`) is read only for **clamp / letterbox-aware pan math** (`containContentSize` / `clampViewport`) — **not** for laying out the element larger than the box
- Reconnect / re-attach resets to identity (`_resetViewport()` in `_attachForIdentity` / `_stopStream`)

### Decode vs display

- `src/stream.ts` attaches WebRTC / MSE / HLS / MJPEG; it never sets `video.width` / `video.height` attributes and never sizes the element to `videoWidth` × `videoHeight`
- Decode resolution is whatever the track / playlist delivers (prefer HD when `camera_hd` / go2rtc HD `src` is configured). Layout does not change that decode size; it only changes how frames are **mapped into the CSS box**.

### Browser / CSS behavior (why “partial”)

1. **Intrinsic vs CSS size:** `HTMLVideoElement.videoWidth` / `videoHeight` are the decoded frame dimensions. CSS `width`/`height` (here 100% of `.stream`) set the **layout** box. They are independent.
2. **`object-fit: contain`:** Scales the frame into the layout box with letterboxing; does not change decode resolution.
3. **`transform: scale()`:** A compositor transform. On many desktop GPU paths, `<video>` keeps a full-res texture and upscale-from-fit can still look sharp up to ~`decode / CSS_content` ratio. On constrained mobile WebViews, paint may effectively sample into a layer sized near the CSS box × DPR; further `scale()` then magnifies that intermediate → soft zoom.
4. **Setting `video.width` / `video.height` IDL** (or CSS px equal to intrinsic) changes **layout** size only; it does not re-encode. Combined with an outer clip + `transform: scale(fit * zoom)`, it is the reliable way to keep the layer dense enough that zoom reveals native detail.

---

## Proposed highest-quality approach

### Goal

At zoom 1×: same visual as today (contain-fitted in `.stream`, letterboxed).  
At zoom &gt; 1×: visible detail approaches the **decoded** stream (up to `devicePixelRatio` and max scale), not a soft upsample of the fitted box.

### Recommended wrapper hierarchy

```
.stream                    /* fixed viewport: aspect-ratio, overflow:hidden, touch handlers */
  .stream-zoom             /* optional: holds transform; keeps gesture target = viewport */
    video.stream-media     /* or img.stream-media — sized near intrinsic / DPR-aware */
    img.stream-media       /* MJPEG sibling — same sizing rules */
```

Keep touch handlers on `.stream` (unchanged UX; PTZ stays on the pad). Prefer applying `transform` on `.stream-zoom` (or the media) while the clip rect stays on `.stream`.

### Sizing + transform strategy

1. **Measure** once frames are ready: `intrinsic = { w: video.videoWidth, h: video.videoHeight }` (MJPEG: `naturalWidth` / `naturalHeight`). Fall back to today’s element-fill behavior if unknown.
2. **Layout the media** at intrinsic CSS pixels (or `intrinsic / dpr` only if memory forces it — prefer full intrinsic on phone when `intrinsic` ≤ ~4K and scale ≤ 4).
3. **Fit scale** at identity zoom:
   `fit = min(boxW / mediaW, boxH / mediaH)`  
   (same math as today’s `containContentSize`, but applied as a transform instead of `object-fit` filling a small box).
4. **Composite scale:** `transform: translate(pan) scale(fit * zoom)` with `transform-origin: center center` (or focal-point-aware origin if you refactor `zoomAt` to match).
5. **Drop `object-fit: contain` on the media** when using this path (media box already matches aspect); keep letterboxing as empty `.stream` background.
6. **Clamp** pan so scaled media never shows empty chrome gaps — reuse / adapt `clampViewport` with `mediaW/mediaH` as content size (letterbox cover logic stays valid).
7. **Cap** `VIEWPORT_MAX_SCALE` so `fit * zoom * media` does not wildly exceed useful pixels (e.g. stop when on-screen sample ≥ ~1 decoded pixel per CSS px, or keep max 4× as a UX cap).

### `video.width` / `video.height` vs CSS alone

| Mechanism | Role |
| --- | --- |
| CSS `width`/`height` on media | Sufficient if set to intrinsic (or wrapper + media both sized explicitly) |
| IDL `video.width` / `video.height` | Equivalent layout hint; optional; not required if CSS is explicit |
| `object-fit` | Prefer **not** combining with intrinsic-sized media + fit transform (double-fit confusion) |
| Decode / WebRTC | Unchanged — still prefer HD entity / go2rtc HD `src`; zoom cannot invent pixels above decode |

**CSS alone is enough** if the media box is intrinsic-sized before transforms. IDL attributes are optional sugar.

### Gesture math

Keep pure helpers in `viewport-zoom.ts`. Likely adjustments when implementing:

- Treat “content size” as the **laid-out media** size (intrinsic), not the contain-fitted rectangle inside a 100% box
- `zoomAt` / `panBy` inputs stay box-local (`.stream` rect) — stable hit testing
- Identity: `zoom = 1` ⇒ translate 0 and scale `fit` (not CSS `none`); or keep stored state as “user zoom” and multiply by `fit` only when painting

### Mobile / Companion constraints

- Phone-first: large 4K textures + `will-change: transform` cost GPU memory; test Companion iOS/Android WebViews specifically
- If memory pressure: size media to `min(intrinsic, box * maxZoom * dpr)` on each axis — still denser than today’s box-only layout, cheaper than always-4K
- `touch-action: none` on `.stream` stays; do not let zoom gestures reach the PTZ pad
- HTTPS / autoplay / mute paths unchanged — zoom is display-only

### Reset / reconnect

Keep today’s contract: identity viewport on stream identity change, attach restart, and `_stopStream`. After intrinsic-sized media, recompute `fit` on `loadeddata` / resize (ResizeObserver on `.stream`) so rotation / section width changes do not letterbox wrong.

### MJPEG / still / poster

Apply the same wrapper + intrinsic sizing to the MJPEG `<img>`. Nested `<video>` poster / fallback `<img>` should follow the video box (no separate zoom layer) so reconnect flicker does not desync crops.

---

## Tradeoffs

| Topic | Notes |
| --- | --- |
| **Sharpness** | Guarantees zoom can reveal decode detail up to stream resolution |
| **Memory / GPU** | Larger textures (esp. C260 4K) on always-on Companion views; mitigate with DPR-aware or `box * maxZoom` caps |
| **Letterboxing** | Same visual at 1× if `fit` matches contain; background stays `.stream` fill |
| **PTZ hit targets** | Unaffected if gestures remain on `.stream` only |
| **Complexity** | Need resize + intrinsic listeners; dual path while intrinsic unknown |
| **Reset-on-reconnect** | Keep; document that fit recomputes after new `videoWidth` |
| **Compositor luck** | Current path may already look OK on some desktops — do not rely on that for phone |

---

## Non-goals (this plan)

- Digital zoom that drives camera PTZ / optical zoom  
- Runtime SD↔HD switching for zoom (HD remain preferred at attach time)  
- Changing go2rtc encode resolution from the card  
- Implementing the layout change in this research task  

---

## Suggested validation before coding

1. On Companion (or remote debug): note `video.videoWidth/Height` vs `.stream` `getBoundingClientRect()` and DPR.  
2. Pinch to max on current build; screenshot a fine detail (text, leaf edges).  
3. Prototype intrinsic-sized + `scale(fit * zoom)` on the demo page; compare the same crop.  
4. Watch memory / dropped frames on a 4K go2rtc WebRTC session during pan.

---

## Implementation sketch (future PR only)

1. Introduce `.stream-zoom` wrapper in `tapo-c260-card.ts` render.  
2. Size media from `_mediaIntrinsic()`; apply `fit * zoom` in `viewportCss` (or a sibling helper).  
3. Adjust `clampViewport` / tests for intrinsic layout.  
4. ResizeObserver → reclamp.  
5. Manual Companion check; no `package.json` version bump until explicitly releasing.
