import { html, TemplateResult } from "lit";

/**
 * Extruded CSS-3D C260 graphic for Concept C.
 * Multi-face body/neck/base so yaw/pitch keep a readable silhouette
 * (unlike a single flat SVG spun with rotateY).
 */
export function camera3d(): TemplateResult {
  return html`
    <div class="cam-rig" aria-hidden="true">
      <div class="cam-shadow"></div>

      <div class="cam-base">
        <div class="face front"></div>
        <div class="face back"></div>
        <div class="face left"></div>
        <div class="face right"></div>
        <div class="face top"></div>
        <div class="face bottom"></div>
      </div>

      <div class="cam-neck">
        <div class="face front"></div>
        <div class="face back"></div>
        <div class="face left"></div>
        <div class="face right"></div>
        <div class="face top"></div>
        <div class="face bottom"></div>
      </div>

      <div class="cam-body">
        <div class="face front">
          <span class="led"></span>
          <span class="lens-bezel"></span>
          <span class="lens"></span>
          <span class="glint"></span>
        </div>
        <div class="face back">
          <span class="vent"></span>
          <span class="vent"></span>
          <span class="vent"></span>
        </div>
        <div class="face left"></div>
        <div class="face right"></div>
        <div class="face top">
          <span class="hood"></span>
        </div>
        <div class="face bottom"></div>
      </div>
    </div>
  `;
}
