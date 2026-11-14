import { html, TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";

/**
 * Extruded CSS-3D C260 orientation graphic.
 * Base stays planted; neck+body (`.cam-head`) take yaw/pitch so the
 * silhouette stays readable without spinning the whole stand.
 */
export function camera3d(headTransform: string): TemplateResult {
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

      <div
        class="cam-head"
        style=${styleMap({
          transform: headTransform,
        })}
      >
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
    </div>
  `;
}
