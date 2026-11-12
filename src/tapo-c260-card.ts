import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { camera3d } from "./camera-3d";
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
import { isLikelyImageUrl, resolveStreamUrl, tryAttachWebRtc } from "./stream";
import type {
  HomeAssistant,
  Orientation,
  PtzDirection,
  TapoC260CardConfig,
} from "./types";

const CARD_TYPE = "tapo-c260-card";

@customElement("tapo-c260-card")
export class TapoC260Card extends LitElement {
  static styles = cardStyles;

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TapoC260CardConfig;
  @state() private _orientation: Orientation = createOrientation(false);
  @state() private _pressing = false;
  @state() private _activeDir: PtzDirection | null = null;
  @state() private _streamUrl: string | null = null;
  @state() private _streamAttached = false;
  @state() private _error: string | null = null;

  private _hold: HoldRepeater | null = null;
  private _videoRef = createRef<HTMLVideoElement>();
  private _angleHideTimer: ReturnType<typeof setTimeout> | null = null;

  public setConfig(config: TapoC260CardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (!config.camera) {
      throw new Error("`camera` is required");
    }
    if (!config.ptz?.up || !config.ptz?.down || !config.ptz?.left || !config.ptz?.right) {
      throw new Error("`ptz.up/down/left/right` button entities are required");
    }
    this._config = {
      ...config,
      hold_interval_ms: config.hold_interval_ms ?? 350,
    };
    this._error = null;
    this._refreshStream();
  }

  public getCardSize(): number {
    return 6;
  }

  public getGridOptions() {
    return {
      columns: 6,
      rows: 6,
      min_columns: 3,
      min_rows: 4,
    };
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

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass") || changed.has("_config")) {
      this._refreshStream();
      if (this._privacyLocked) {
        this._stopHold(true);
        this._clearAngleHideTimer();
      }
    }
    if (changed.has("_streamUrl") || changed.has("_streamAttached")) {
      void this._tryAttachStream();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopHold(true);
    this._clearAngleHideTimer();
  }

  private _clearAngleHideTimer(): void {
    if (this._angleHideTimer) {
      clearTimeout(this._angleHideTimer);
      this._angleHideTimer = null;
    }
  }

  private _scheduleAngleHide(delayMs = 700): void {
    this._clearAngleHideTimer();
    this._angleHideTimer = setTimeout(() => {
      this._pressing = false;
      this._angleHideTimer = null;
    }, delayMs);
  }

  private _refreshStream(): void {
    if (!this._config) return;
    const url = resolveStreamUrl(
      this.hass,
      this._config.camera,
      this._config.go2rtc,
    );
    if (url !== this._streamUrl) {
      this._streamUrl = url;
      this._streamAttached = false;
    }
  }

  private async _tryAttachStream(): Promise<void> {
    const video = this._videoRef.value;
    if (!video || !this._streamUrl || this._streamAttached) return;
    if (isLikelyImageUrl(this._streamUrl)) return;
    const ok = await tryAttachWebRtc(video, this._streamUrl);
    this._streamAttached = ok;
  }

  private get _privacyLocked(): boolean {
    return isPrivacyOn(this.hass, this._config?.privacy);
  }

  private get _yawStep(): number {
    return readMovementAngle(this.hass, this._config?.ptz.angle) ?? DEFAULT_YAW_STEP;
  }

  private get _pitchStep(): number {
    return readMovementAngle(this.hass, this._config?.ptz.angle) ?? DEFAULT_PITCH_STEP;
  }

  private get _showAngles(): boolean {
    return this._pressing && this._orientation.known;
  }

  private async _onNudge(direction: PtzDirection): Promise<void> {
    if (!this._config || this._privacyLocked) return;
    this._orientation = applyNudge(
      this._orientation,
      direction,
      this._yawStep,
      this._pitchStep,
    );
    await nudgeDirection(this.hass, this._config, direction);
  }

  private _startHold(direction: PtzDirection, event: PointerEvent): void {
    if (!this._config || this._privacyLocked) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId,
    );
    this._clearAngleHideTimer();
    this._stopHold(true);
    this._activeDir = direction;
    this._pressing = true;
    this._hold = new HoldRepeater(
      () => this._onNudge(direction),
      this._config.hold_interval_ms ?? 350,
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
    // Keep yaw/pitch visible briefly after click or hold release when known
    if (this._orientation.known) {
      this._scheduleAngleHide();
    } else {
      this._pressing = false;
    }
  }

  private async _onHome(event: PointerEvent): Promise<void> {
    if (!this._config || this._privacyLocked) return;
    event.preventDefault();
    this._pressing = true;
    this._orientation = resetOrientation();
    await calibrate(this.hass, this._config);
    this._scheduleAngleHide(900);
  }

  protected render() {
    if (this._error) {
      return html`<ha-card class="card"><div class="error">${this._error}</div></ha-card>`;
    }
    if (!this._config) {
      return nothing;
    }

    const title = this._config.title ?? "Feed · C260";
    const locked = this._privacyLocked;
    const streamUrl = this._streamUrl;
    const showImage = !!(streamUrl && isLikelyImageUrl(streamUrl));
    const showVideoSlot = !!(streamUrl && !showImage);
    const showPlaceholder =
      !streamUrl || (!showImage && !this._streamAttached);

    return html`
      <ha-card class="card">
        <div class="layout">
          <div class="stream" aria-label="Camera stream">
            <div class="stream-label">${title}</div>
            ${showImage
              ? html`<img class="stream-media" src=${streamUrl!} alt="Camera" />`
              : nothing}
            ${showVideoSlot
              ? html`<video
                  ${ref(this._videoRef)}
                  class="stream-media"
                  playsinline
                  muted
                  autoplay
                ></video>`
              : nothing}
            ${showPlaceholder
              ? html`
                  <div class="stream-placeholder">
                    <div>
                      <strong>Stream placeholder</strong>
                      <span
                        >go2rtc / WebRTC unavailable — configure
                        <code>go2rtc</code> or HA camera proxy</span
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
                    ?disabled=${locked || !this._config.ptz.calibrate}
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
