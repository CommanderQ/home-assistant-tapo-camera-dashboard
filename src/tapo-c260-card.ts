import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { camera3d } from "./camera-3d";
import { applyDeviceResolution } from "./device";
import "./editor";
import {
  applyNudge,
  cameraTransform,
  createOrientation,
  DEFAULT_PITCH_STEP,
  DEFAULT_YAW_STEP,
  formatAngles,
  resetOrientation,
} from "./orientation";
import {
  calibrate,
  HoldRepeater,
  isPrivacyOn,
  nudgeDirection,
  readMovementAngle,
} from "./ptz";
import { cardStyles } from "./styles";
import {
  activeCameraEntity,
  attachLiveStream,
  type StreamHandle,
  type StreamMode,
} from "./stream";
import type {
  HomeAssistant,
  Orientation,
  PtzDirection,
  TapoC260CardConfig,
} from "./types";

const CARD_TYPE = "tapo-c260-card";
/** Keep HD stream briefly after PTZ interaction ends. */
const HD_HOLD_MS = 8000;

@customElement("tapo-c260-card")
export class TapoC260Card extends LitElement {
  static styles = cardStyles;

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TapoC260CardConfig;
  @state() private _orientation: Orientation = createOrientation(false);
  @state() private _pressing = false;
  @state() private _activeDir: PtzDirection | null = null;
  @state() private _preferHd = false;
  @state() private _streamMode: StreamMode = "none";
  @state() private _streamReady = false;
  @state() private _error: string | null = null;

  private _hold: HoldRepeater | null = null;
  private _videoRef = createRef<HTMLVideoElement>();
  private _imgRef = createRef<HTMLImageElement>();
  private _angleHideTimer: ReturnType<typeof setTimeout> | null = null;
  private _hdHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private _streamHandle: StreamHandle | null = null;
  private _attachGeneration = 0;
  private _activeStreamEntity: string | undefined;

  public setConfig(config: TapoC260CardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    // Device-only configs are allowed until hass resolves entities.
    if (!config.device) {
      if (!config.camera) {
        throw new Error("`camera` or `device` is required");
      }
      if (
        !config.ptz?.up ||
        !config.ptz?.down ||
        !config.ptz?.left ||
        !config.ptz?.right
      ) {
        throw new Error("`ptz.up/down/left/right` button entities are required");
      }
    }
    this._config = {
      ...config,
      ptz: {
        up: config.ptz?.up ?? "",
        down: config.ptz?.down ?? "",
        left: config.ptz?.left ?? "",
        right: config.ptz?.right ?? "",
        angle: config.ptz?.angle,
        calibrate: config.ptz?.calibrate,
        preset: config.ptz?.preset,
      },
      hold_interval_ms: config.hold_interval_ms ?? 350,
    };
    this._error = null;
  }

  public getCardSize(): number {
    // Masonry units (~50px). Portrait stream + pad ≈ content height.
    return 5;
  }

  public getGridOptions() {
    // Sections view: full section width, height follows content (not a fixed row span).
    return {
      columns: "full" as const,
      rows: "auto" as const,
      min_columns: 6,
    };
  }

  public static getConfigElement(): HTMLElement {
    return document.createElement("tapo-c260-card-editor");
  }

  public static getStubConfig(): Partial<TapoC260CardConfig> {
    return {
      camera: "camera.living_room_sd",
      camera_hd: "camera.living_room_hd",
      title: "Feed · C260",
      ptz: {
        up: "button.living_room_move_up",
        down: "button.living_room_move_down",
        left: "button.living_room_move_left",
        right: "button.living_room_move_right",
        angle: "number.living_room_movement_angle",
        calibrate: "button.living_room_calibrate",
      },
      privacy: "switch.living_room_privacy",
    };
  }

  private get _resolvedConfig(): TapoC260CardConfig | undefined {
    if (!this._config) return undefined;
    return applyDeviceResolution(this.hass, this._config);
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass") || changed.has("_config") || changed.has("_preferHd")) {
      if (this._privacyLocked) {
        this._stopHold(true);
        this._clearAngleHideTimer();
      }
      void this._syncStream();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopHold(true);
    this._clearAngleHideTimer();
    this._clearHdHoldTimer();
    this._stopStream();
  }

  private _clearAngleHideTimer(): void {
    if (this._angleHideTimer) {
      clearTimeout(this._angleHideTimer);
      this._angleHideTimer = null;
    }
  }

  private _clearHdHoldTimer(): void {
    if (this._hdHoldTimer) {
      clearTimeout(this._hdHoldTimer);
      this._hdHoldTimer = null;
    }
  }

  private _scheduleAngleHide(delayMs = 700): void {
    this._clearAngleHideTimer();
    this._angleHideTimer = setTimeout(() => {
      this._pressing = false;
      this._angleHideTimer = null;
    }, delayMs);
  }

  private _bumpHd(): void {
    if (!this._resolvedConfig?.camera_hd) return;
    this._clearHdHoldTimer();
    if (!this._preferHd) {
      this._preferHd = true;
    }
    this._hdHoldTimer = setTimeout(() => {
      this._preferHd = false;
      this._hdHoldTimer = null;
    }, HD_HOLD_MS);
  }

  private _stopStream(): void {
    this._streamHandle?.stop();
    this._streamHandle = null;
    this._activeStreamEntity = undefined;
    this._streamReady = false;
    this._streamMode = "none";
  }

  private async _syncStream(): Promise<void> {
    const config = this._resolvedConfig;
    if (!config?.camera) {
      this._stopStream();
      return;
    }

    const entityId = activeCameraEntity(config, this._preferHd);
    if (
      entityId === this._activeStreamEntity &&
      this._streamHandle &&
      this._streamMode !== "none"
    ) {
      return;
    }

    const generation = ++this._attachGeneration;
    this._stopStream();
    this._activeStreamEntity = entityId;

    // Wait a frame so video/img refs exist after render.
    await this.updateComplete;
    if (generation !== this._attachGeneration) return;

    const handle = await attachLiveStream({
      hass: this.hass,
      video: this._videoRef.value,
      img: this._imgRef.value,
      cameraEntityId: entityId,
      go2rtc: config.go2rtc,
    });

    if (generation !== this._attachGeneration) {
      handle.stop();
      return;
    }

    this._streamHandle = handle;
    this._streamMode = handle.mode;
    this._streamReady = handle.mode !== "none";
  }

  private get _privacyLocked(): boolean {
    return isPrivacyOn(this.hass, this._resolvedConfig?.privacy);
  }

  private get _yawStep(): number {
    return (
      readMovementAngle(this.hass, this._resolvedConfig?.ptz.angle) ??
      DEFAULT_YAW_STEP
    );
  }

  private get _pitchStep(): number {
    return (
      readMovementAngle(this.hass, this._resolvedConfig?.ptz.angle) ??
      DEFAULT_PITCH_STEP
    );
  }

  private get _showAngles(): boolean {
    return this._pressing && this._orientation.known;
  }

  private async _onNudge(direction: PtzDirection): Promise<void> {
    const config = this._resolvedConfig;
    if (!config || this._privacyLocked) return;
    this._bumpHd();
    this._orientation = applyNudge(
      this._orientation,
      direction,
      this._yawStep,
      this._pitchStep,
    );
    await nudgeDirection(this.hass, config, direction);
  }

  private _startHold(direction: PtzDirection, event: PointerEvent): void {
    const config = this._resolvedConfig;
    if (!config || this._privacyLocked) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId,
    );
    this._clearAngleHideTimer();
    this._stopHold(true);
    this._bumpHd();
    this._activeDir = direction;
    this._pressing = true;
    this._hold = new HoldRepeater(
      () => this._onNudge(direction),
      config.hold_interval_ms ?? 350,
    );
    this._hold.start();
  }

  private _stopHold(immediate = false): void {
    this._hold?.stop();
    this._hold = null;
    this._activeDir = null;
    if (immediate) {
      this._pressing = false;
      return;
    }
    if (this._orientation.known) {
      this._scheduleAngleHide();
    } else {
      this._pressing = false;
    }
  }

  private async _onHome(event: PointerEvent): Promise<void> {
    const config = this._resolvedConfig;
    if (!config || this._privacyLocked) return;
    event.preventDefault();
    this._bumpHd();
    this._pressing = true;
    this._orientation = resetOrientation();
    await calibrate(this.hass, config);
    this._scheduleAngleHide(900);
  }

  protected render() {
    if (this._error) {
      return html`<ha-card class="card"><div class="error">${this._error}</div></ha-card>`;
    }
    const config = this._resolvedConfig;
    if (!config) {
      return nothing;
    }

    const title = config.title ?? "Feed · C260";
    const locked = this._privacyLocked;
    const mode = this._streamMode;
    const showVideo =
      mode === "webrtc" || mode === "mse" || mode === "hls";
    const showImg = mode === "mjpeg" || mode === "image";
    const showPlaceholder = !this._streamReady;

    return html`
      <ha-card class="card">
        <div class="layout">
          <div class="stream" aria-label="Camera stream">
            <div class="stream-label">${title}</div>
            <video
              ${ref(this._videoRef)}
              class="stream-media"
              style=${styleMap({ display: showVideo ? "block" : "none" })}
              playsinline
              muted
              autoplay
            ></video>
            <img
              ${ref(this._imgRef)}
              class="stream-media"
              style=${styleMap({ display: showImg ? "block" : "none" })}
              alt="Camera"
            />
            ${showPlaceholder
              ? html`
                  <div class="stream-placeholder">
                    <div>
                      <strong>Connecting stream…</strong>
                      <span
                        >WebRTC first, then multi-source MP4/HLS (hls.js on
                        Chrome). Set <code>camera_hd</code> for HD while
                        controlling PTZ.</span
                      >
                    </div>
                  </div>
                `
              : nothing}
            ${locked
              ? html`<div class="privacy-banner">Privacy on</div>`
              : nothing}
          </div>

          <div class="pad">
            <div
              class=${classMap({ angles: true, visible: this._showAngles })}
              aria-live="polite"
            >
              ${this._showAngles ? formatAngles(this._orientation) : "\u00a0"}
            </div>

            <div class="ring-wrap">
              <div class="ring">
                <div class="ticks" aria-hidden="true"></div>
                ${this._dirButton("up", "▲", "Tilt up")}
                ${this._dirButton("down", "▼", "Tilt down")}
                ${this._dirButton("left", "◀", "Pan left")}
                ${this._dirButton("right", "▶", "Pan right")}
                <div class="stage">
                  <button
                    class="home-hit"
                    type="button"
                    aria-label="Home / calibrate"
                    title="Home / calibrate"
                    ?disabled=${locked || !config.ptz.calibrate}
                    @pointerdown=${this._onHome}
                    @pointercancel=${() => {
                      this._pressing = false;
                    }}
                  >
                    <div class="cam3d">
                      ${camera3d(cameraTransform(this._orientation))}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <p class="hint">
              Click to nudge · hold to repeat · center = home/calibrate
            </p>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _dirButton(dir: PtzDirection, label: string, aria: string) {
    const locked = this._privacyLocked;
    return html`
      <button
        class=${classMap({
          btn: true,
          [dir]: true,
          active: this._activeDir === dir,
        })}
        type="button"
        data-dir=${dir}
        aria-label=${aria}
        ?disabled=${locked}
        @pointerdown=${(e: PointerEvent) => this._startHold(dir, e)}
        @pointerup=${() => this._stopHold()}
        @pointercancel=${() => this._stopHold()}
        @lostpointercapture=${() => this._stopHold()}
      >
        ${label}
      </button>
    `;
  }
}

if (!customElements.get("ha-card")) {
  class HaCard extends HTMLElement {}
  customElements.define("ha-card", HaCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: CARD_TYPE,
  name: "Tapo C260 Camera Card",
  description:
    "Industrial PTZ card for Tapo C260 — live stream, circular pad, 3D orientation graphic. Requires HACS tapo_control.",
  preview: true,
  documentationURL:
    "https://github.com/CommanderQ/home-assistant-tapo-camera-dashboard",
});

declare global {
  interface HTMLElementTagNameMap {
    "tapo-c260-card": TapoC260Card;
  }
}
