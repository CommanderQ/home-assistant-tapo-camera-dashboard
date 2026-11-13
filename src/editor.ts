import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { resolveConfigFromDevice } from "./device";
import type { HomeAssistant, TapoC260CardConfig } from "./types";

/** Minimal ha-form schema shape used by the Lovelace visual editor. */
type HaFormSchema =
  | {
      name: string;
      required?: boolean;
      label?: string;
      helper?: string;
      default?: unknown;
      selector: Record<string, unknown>;
    }
  | {
      name: string;
      type: "expandable" | "grid";
      title?: string;
      label?: string;
      expanded?: boolean;
      flatten?: boolean;
      schema: HaFormSchema[];
    };

const EDITOR_SCHEMA: HaFormSchema[] = [
  {
    name: "device",
    required: true,
    label: "Tapo camera device",
    helper:
      "Pick your C260 (tapo_control). Camera, PTZ, privacy, and related entities fill in automatically.",
    selector: {
      device: {
        filter: [{ integration: "tapo_control" }],
        entity: [{ domain: "camera" }],
      },
    },
  },
  {
    name: "hold_interval_ms",
    label: "Hold interval (ms)",
    helper: "Press-and-hold repeat interval (default 350).",
    selector: {
      number: {
        min: 100,
        max: 2000,
        step: 50,
        mode: "box",
        unit_of_measurement: "ms",
      },
    },
  },
  {
    name: "advanced",
    type: "expandable",
    title: "Advanced",
    flatten: true,
    expanded: false,
    schema: [
      {
        name: "go2rtc",
        label: "go2rtc stream (optional)",
        helper:
          "go2rtc stream name, or absolute ws/http URL to /api/ws?src=… (or /api/webrtc/ws). Empty = HA camera WebRTC / multi-source MP4+HLS.",
        selector: { text: {} },
      },
    ],
  },
  {
    name: "entities",
    type: "expandable",
    title: "Entity overrides",
    flatten: true,
    expanded: false,
    schema: [
      {
        name: "camera",
        required: true,
        label: "Camera (SD / fallback)",
        helper:
          "Lower-quality camera entity. Used as primary when Camera HD is empty; otherwise a fallback source only.",
        selector: { entity: { domain: "camera" } },
      },
      {
        name: "camera_hd",
        label: "Camera HD (preferred)",
        helper:
          "Preferred live entity when set. Both HD and SD are collected as sources (HD first); there is no PTZ quality switch.",
        selector: { entity: { domain: "camera" } },
      },
      {
        name: "privacy",
        label: "Privacy switch",
        helper: "Disables the PTZ pad when on.",
        selector: { entity: { domain: "switch" } },
      },
      {
        name: "ptz",
        type: "expandable",
        title: "PTZ controls",
        expanded: true,
        schema: [
          {
            type: "grid",
            name: "",
            schema: [
              {
                name: "up",
                required: true,
                label: "Move up",
                selector: { entity: { domain: "button" } },
              },
              {
                name: "down",
                required: true,
                label: "Move down",
                selector: { entity: { domain: "button" } },
              },
              {
                name: "left",
                required: true,
                label: "Move left",
                selector: { entity: { domain: "button" } },
              },
              {
                name: "right",
                required: true,
                label: "Move right",
                selector: { entity: { domain: "button" } },
              },
            ],
          },
          {
            name: "angle",
            label: "Movement angle",
            helper: "number.*_movement_angle — degrees per nudge.",
            selector: { entity: { domain: "number" } },
          },
          {
            name: "calibrate",
            label: "Calibrate / home",
            helper: "Center pad control presses this button.",
            selector: { entity: { domain: "button" } },
          },
          {
            name: "preset",
            label: "Move to preset",
            helper: "Optional select.*_move_to_preset entity.",
            selector: { entity: { domain: "select" } },
          },
        ],
      },
    ],
  },
];

let haFormLoadPromise: Promise<void> | null = null;

/** Ensure ha-form (and its selectors) are registered in the dashboard. */
function ensureHaFormLoaded(): Promise<void> {
  if (customElements.get("ha-form")) {
    return Promise.resolve();
  }
  if (haFormLoadPromise) {
    return haFormLoadPromise;
  }
  haFormLoadPromise = (async () => {
    const win = window as Window & {
      loadCardHelpers?: () => Promise<{
        createCardElement: (config: Record<string, unknown>) => Promise<{
          constructor: { getConfigElement?: () => Promise<unknown> };
        }>;
      }>;
    };
    try {
      if (typeof win.loadCardHelpers === "function") {
        const helpers = await win.loadCardHelpers();
        const el = await helpers.createCardElement({
          type: "entities",
          entities: [],
        });
        await el.constructor.getConfigElement?.();
      }
    } catch {
      // Outside HA (demo/build) ha-form stays unavailable; editor shows a hint.
    }
    await customElements.whenDefined("ha-form").catch(() => undefined);
  })();
  return haFormLoadPromise;
}

function scrubConfig(config: TapoC260CardConfig): TapoC260CardConfig {
  const next: TapoC260CardConfig = {
    ...config,
    ptz: { ...(config.ptz ?? { up: "", down: "", left: "", right: "" }) },
  };

  for (const key of [
    "device",
    "camera_hd",
    "go2rtc",
    "privacy",
  ] as const) {
    const v = next[key];
    if (v === "" || v === undefined || v === null) {
      delete next[key];
    }
  }
  for (const key of ["angle", "calibrate", "preset"] as const) {
    const v = next.ptz[key];
    if (v === "" || v === undefined || v === null) {
      delete next.ptz[key];
    }
  }
  if (
    next.hold_interval_ms === undefined ||
    next.hold_interval_ms === null ||
    Number.isNaN(Number(next.hold_interval_ms))
  ) {
    delete next.hold_interval_ms;
  } else {
    next.hold_interval_ms = Number(next.hold_interval_ms);
  }
  return next;
}

@customElement("tapo-c260-card-editor")
export class TapoC260CardEditor extends LitElement {
  static styles = css`
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.875rem;
      margin: 8px 0 0;
    }
  `;

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TapoC260CardConfig;
  @state() private _formReady = false;

  public setConfig(config: TapoC260CardConfig): void {
    this._config = {
      ...config,
      ptz: { ...(config.ptz ?? { up: "", down: "", left: "", right: "" }) },
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    void ensureHaFormLoaded().then(() => {
      this._formReady = !!customElements.get("ha-form");
      this.requestUpdate();
    });
  }

  protected render() {
    if (!this._config) {
      return nothing;
    }
    if (!this._formReady) {
      return html`<p class="hint">Loading Home Assistant form controls…</p>`;
    }
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${EDITOR_SCHEMA}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <p class="hint">
        Select the Tapo device to auto-fill camera / PTZ / privacy. Open Advanced
        for go2rtc, or Entity overrides only if you need to tweak associations.
      </p>
    `;
  }

  private _computeLabel = (schema: { name?: string; label?: string }): string => {
    if (schema.label) return schema.label;
    return schema.name ?? "";
  };

  private _computeHelper = (schema: {
    name?: string;
    helper?: string;
  }): string | undefined => schema.helper;

  private _valueChanged(ev: CustomEvent<{ value: TapoC260CardConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const value = ev.detail?.value;
    if (!value) return;

    let next: TapoC260CardConfig = {
      ...value,
      ptz: {
        ...(value.ptz ?? this._config.ptz ?? { up: "", down: "", left: "", right: "" }),
      },
    };

    const deviceChanged =
      !!next.device && next.device !== this._config.device;
    if (deviceChanged && next.device) {
      const resolved = resolveConfigFromDevice(this.hass, next.device, next);
      next = {
        ...next,
        ...resolved,
        ptz: {
          ...next.ptz,
          ...(resolved.ptz as TapoC260CardConfig["ptz"]),
        },
      } as TapoC260CardConfig;
    }

    next = scrubConfig(next);
    this._config = next;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tapo-c260-card-editor": TapoC260CardEditor;
    /** Provided by Home Assistant frontend. */
    "ha-form": HTMLElement;
  }
}
