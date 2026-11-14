import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { camera3d } from "./camera-3d";
import { applyDeviceResolution } from "./device";
import "./editor";
import {
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiChevronUp,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiVolumeHigh,
  mdiVolumeOff,
} from "./icons";
import {
  applyNudge,
  cameraTransform,
  createOrientation,
  DEFAULT_PITCH_STEP,
  DEFAULT_YAW_STEP,
  formatAngles,
} from "./orientation";
import {
  HoldRepeater,
  isPrivacyOn,
  nudgeDirection,
  readMovementAngle,
  togglePrivacy,
} from "./ptz";
import { cardStyles } from "./styles";
import {
  attachLiveStream,
  collectHttpStreamCandidates,
  fallbackCameraEntity,
  filterNativeSourceCandidates,
  primaryCameraEntity,
  type HttpStreamCandidate,
  type StreamHandle,
  type StreamMode,
} from "./stream";
import type {
  HomeAssistant,
  Orientation,
  PtzDirection,
  TapoC260CardConfig,
} from "./types";
import {
  IDENTITY_VIEWPORT,
  panBy,
  touchDistance,
  touchMidpoint,
  viewportCss,
  zoomAt,
  type MediaIntrinsic,
  type ViewportTransform,
} from "./viewport-zoom";

const CARD_TYPE = "tapo-c260-card";
/** Cap retries after a failed attach so hass thrash cannot storm reconnects. */
const MAX_ATTACH_RETRIES = 5;
const ATTACH_RETRY_BASE_MS = 1500;
const ATTACH_RETRY_MAX_MS = 30000;

const PTZ_PATHS: Record<PtzDirection, string> = {
  up: mdiChevronUp,
  down: mdiChevronDown,
  left: mdiChevronLeft,
  right: mdiChevronRight,
};

@customElement("tapo-c260-card")
export class TapoC260Card extends LitElement {
  static styles = cardStyles;

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TapoC260CardConfig;
  @state() private _orientation: Orientation = createOrientation(false);
  @state() private _pressing = false;
  @state() private _activeDir: PtzDirection | null = null;
  @state() private _streamMode: StreamMode = "none";
  @state() private _streamReady = false;
  /** Full HTTP candidate list (incl. HLS for hls.js). DOM uses a filtered subset. */
  @state() private _httpSources: HttpStreamCandidate[] = [];
  @state() private _error: string | null = null;
  /** CSS viewport crop of the received stream — never drives PTZ. */
  @state() private _viewport: ViewportTransform = IDENTITY_VIEWPORT;
  /** Default muted so autoplay is allowed; custom chrome only (no native controls). */
  @state() private _muted = true;
  @state() private _volume = 1;

  private _hold: HoldRepeater | null = null;
  private _videoRef = createRef<HTMLVideoElement>();
  /** Nested HTML fallback inside <video> (poster companion). */
  private _fallbackImgRef = createRef<HTMLImageElement>();
  /** Visible sibling for MJPEG live (cannot play inside <video>). */
  private _mjpegImgRef = createRef<HTMLImageElement>();
  private _streamRef = createRef<HTMLDivElement>();
  private _angleHideTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _streamHandle: StreamHandle | null = null;
  private _attachGeneration = 0;
  private _streamIdentity: string | undefined;
  private _retryAttempt = 0;
  /** Active stream-area touch gesture (pinch / pan); independent of PTZ hold. */
  private _gesture:
    | { mode: "pan"; lastX: number; lastY: number }
    | {
        mode: "pinch";
        startDist: number;
        startScale: number;
        startX: number;
        startY: number;
      }
    | null = null;

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
    if (changed.has("hass") || changed.has("_config")) {
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
    this._clearRetryTimer();
    this._stopStream();
  }

  private _clearAngleHideTimer(): void {
    if (this._angleHideTimer) {
      clearTimeout(this._angleHideTimer);
      this._angleHideTimer = null;
    }
  }

  private _clearRetryTimer(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  private _scheduleAngleHide(delayMs = 700): void {
    this._clearAngleHideTimer();
    this._angleHideTimer = setTimeout(() => {
      this._pressing = false;
      this._angleHideTimer = null;
    }, delayMs);
  }

  private _streamIdentityKey(config: TapoC260CardConfig): string {
    const primary = primaryCameraEntity(config) ?? "";
    const fallback = fallbackCameraEntity(config) ?? "";
    return `${primary}|${fallback}|${config.go2rtc?.trim() ?? ""}`;
  }

  private _resetViewport(): void {
    this._gesture = null;
    this._viewport = IDENTITY_VIEWPORT;
  }

  private _stopStream(): void {
    this._attachGeneration += 1;
    this._clearRetryTimer();
    this._streamHandle?.stop();
    this._streamHandle = null;
    this._streamIdentity = undefined;
    this._streamReady = false;
    this._streamMode = "none";
    this._httpSources = [];
    this._resetViewport();
  }

  /**
   * Sync live attach only when stream identity changes.
   * A failed mode `"none"` does not re-attach on every hass tick — backoff owns retries.
   */
  private async _syncStream(): Promise<void> {
    const config = this._resolvedConfig;
    if (!config?.camera) {
      this._clearRetryTimer();
      this._retryAttempt = 0;
      this._stopStream();
      return;
    }

    const identity = this._streamIdentityKey(config);
    const identityChanged = identity !== this._streamIdentity;

    if (!identityChanged) {
      // Healthy session — ignore hass thrash.
      if (this._streamHandle && this._streamMode !== "none") return;
      // Failed or in-flight for this identity — backoff / generation owns recovery.
      return;
    }

    this._clearRetryTimer();
    this._retryAttempt = 0;
    await this._attachForIdentity(identity);
  }

  private _scheduleAttachRetry(identity: string): void {
    if (this._retryAttempt >= MAX_ATTACH_RETRIES) return;
    this._clearRetryTimer();
    const delay = Math.min(
      ATTACH_RETRY_MAX_MS,
      ATTACH_RETRY_BASE_MS * 2 ** this._retryAttempt,
    );
    this._retryAttempt += 1;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (this._streamIdentity !== identity) return;
      if (this._streamHandle && this._streamMode !== "none") return;
      void this._attachForIdentity(identity);
    }, delay);
  }

  private async _attachForIdentity(identity: string): Promise<void> {
    const config = this._resolvedConfig;
    if (!config?.camera) {
      this._stopStream();
      return;
    }

    const generation = ++this._attachGeneration;
    this._streamIdentity = identity;
    // Rebind / restart always recenters the local viewport crop.
    this._resetViewport();

    // Stop the previous session without flashing the placeholder when we already
    // had a ready frame — keep last paint until the new attach settles.
    const hadReady = this._streamReady;
    this._streamHandle?.stop();
    this._streamHandle = null;
    if (!hadReady) {
      this._streamReady = false;
      this._streamMode = "none";
    }

    const primary = primaryCameraEntity(config);
    const fallback = fallbackCameraEntity(config);

    const httpCandidates = await collectHttpStreamCandidates({
      hass: this.hass,
      cameraEntityId: primary,
      fallbackCameraEntityId: fallback,
      go2rtc: config.go2rtc,
    });
    if (generation !== this._attachGeneration) return;

    this._httpSources = httpCandidates;
    await this.updateComplete;
    if (generation !== this._attachGeneration) return;

    const handle = await attachLiveStream({
      hass: this.hass,
      video: this._videoRef.value,
      img: this._mjpegImgRef.value,
      fallbackImg: this._fallbackImgRef.value,
      cameraEntityId: primary,
      fallbackCameraEntityId: fallback,
      go2rtc: config.go2rtc,
      httpCandidates,
    });

    if (generation !== this._attachGeneration) {
      handle.stop();
      return;
    }

    this._streamHandle = handle;
    this._streamMode = handle.mode;
    this._streamReady = handle.mode !== "none";

    if (handle.mode === "none") {
      this._scheduleAttachRetry(identity);
    } else {
      this._retryAttempt = 0;
    }
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

  private _mediaIntrinsic(): MediaIntrinsic | null {
    const mode = this._streamMode;
    if (mode === "mjpeg") {
      const img = this._mjpegImgRef.value;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        return { width: img.naturalWidth, height: img.naturalHeight };
      }
      return null;
    }
    const video = this._videoRef.value;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      return { width: video.videoWidth, height: video.videoHeight };
    }
    return null;
  }

  private _streamBox(): { width: number; height: number; left: number; top: number } | null {
    const el = this._streamRef.value;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    return { width: r.width, height: r.height, left: r.left, top: r.top };
  }

  private _onStreamTouchStart(event: TouchEvent): void {
    // Stream crop only — PTZ lives on .pad buttons with their own handlers.
    if (event.touches.length === 2) {
      event.preventDefault();
      const dist = touchDistance(event.touches[0], event.touches[1]);
      if (!(dist > 0)) return;
      this._gesture = {
        mode: "pinch",
        startDist: dist,
        startScale: this._viewport.scale,
        startX: this._viewport.x,
        startY: this._viewport.y,
      };
      return;
    }
    if (event.touches.length === 1 && this._viewport.scale > 1) {
      event.preventDefault();
      this._gesture = {
        mode: "pan",
        lastX: event.touches[0].clientX,
        lastY: event.touches[0].clientY,
      };
    } else {
      this._gesture = null;
    }
  }

  private _onStreamTouchMove(event: TouchEvent): void {
    const box = this._streamBox();
    if (!box) return;
    const intrinsic = this._mediaIntrinsic();

    if (event.touches.length === 2) {
      event.preventDefault();
      const dist = touchDistance(event.touches[0], event.touches[1]);
      if (!(dist > 0)) return;
      const mid = touchMidpoint(event.touches[0], event.touches[1]);
      const focalX = mid.x - box.left;
      const focalY = mid.y - box.top;
      let base = this._viewport;
      if (this._gesture?.mode === "pinch") {
        base = {
          scale: this._gesture.startScale,
          x: this._gesture.startX,
          y: this._gesture.startY,
        };
        const nextScale =
          this._gesture.startScale * (dist / this._gesture.startDist);
        this._viewport = zoomAt(
          base,
          focalX,
          focalY,
          nextScale,
          box.width,
          box.height,
          intrinsic,
        );
      } else {
        this._gesture = {
          mode: "pinch",
          startDist: dist,
          startScale: this._viewport.scale,
          startX: this._viewport.x,
          startY: this._viewport.y,
        };
      }
      return;
    }

    if (
      event.touches.length === 1 &&
      this._gesture?.mode === "pan" &&
      this._viewport.scale > 1
    ) {
      event.preventDefault();
      const t = event.touches[0];
      const dx = t.clientX - this._gesture.lastX;
      const dy = t.clientY - this._gesture.lastY;
      this._gesture = { mode: "pan", lastX: t.clientX, lastY: t.clientY };
      this._viewport = panBy(
        this._viewport,
        dx,
        dy,
        box.width,
        box.height,
        intrinsic,
      );
    }
  }

  private _onStreamTouchEnd(event: TouchEvent): void {
    if (event.touches.length === 0) {
      this._gesture = null;
      return;
    }
    if (event.touches.length === 1 && this._viewport.scale > 1) {
      this._gesture = {
        mode: "pan",
        lastX: event.touches[0].clientX,
        lastY: event.touches[0].clientY,
      };
      return;
    }
    if (event.touches.length === 2) {
      const dist = touchDistance(event.touches[0], event.touches[1]);
      if (dist > 0) {
        this._gesture = {
          mode: "pinch",
          startDist: dist,
          startScale: this._viewport.scale,
          startX: this._viewport.x,
          startY: this._viewport.y,
        };
      }
      return;
    }
    this._gesture = null;
  }

  private _toggleMute(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const next = !this._muted;
    if (!next && this._volume <= 0) {
      this._volume = 0.7;
    }
    this._muted = next;
    this._applyAudioToVideo();
  }

  private _onPrivacyClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const entity = this._resolvedConfig?.privacy;
    void togglePrivacy(this.hass, entity);
  }

  private _onVolumeInput(event: Event): void {
    event.stopPropagation();
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    this._volume = Math.min(1, Math.max(0, value));
    if (this._volume > 0 && this._muted) {
      this._muted = false;
    } else if (this._volume <= 0) {
      this._muted = true;
    }
    this._applyAudioToVideo();
  }

  private _applyAudioToVideo(): void {
    const video = this._videoRef.value;
    if (!video) return;
    video.muted = this._muted;
    video.volume = this._volume;
  }

  protected render() {
    if (this._error) {
      return html`<ha-card class="card"><div class="error">${this._error}</div></ha-card>`;
    }
    const config = this._resolvedConfig;
    if (!config) {
      return nothing;
    }

    const locked = this._privacyLocked;
    const mode = this._streamMode;
    const showVideo =
      mode === "webrtc" ||
      mode === "mse" ||
      mode === "hls" ||
      mode === "image";
    const showMjpeg = mode === "mjpeg";
    const showPlaceholder = !this._streamReady;
    const domSources = filterNativeSourceCandidates(this._httpSources);
    const mediaTransform = viewportCss(this._viewport);
    const mediaStyle = (visible: boolean) =>
      styleMap({
        display: visible ? "block" : "none",
        transform: mediaTransform,
      });

    return html`
      <ha-card class="card">
        <div class="layout">
          <div
            class="stream"
            ${ref(this._streamRef)}
            aria-label="Camera stream"
            @touchstart=${this._onStreamTouchStart}
            @touchmove=${this._onStreamTouchMove}
            @touchend=${this._onStreamTouchEnd}
            @touchcancel=${this._onStreamTouchEnd}
          >
            <video
              ${ref(this._videoRef)}
              class="stream-media"
              style=${mediaStyle(showVideo)}
              playsinline
              .muted=${this._muted}
              .volume=${this._volume}
            >
              ${domSources.map(
                (s) => html`<source src=${s.src} type=${s.type} />`,
              )}
              <img
                ${ref(this._fallbackImgRef)}
                class="stream-fallback"
                alt="Camera"
              />
            </video>
            <img
              ${ref(this._mjpegImgRef)}
              class="stream-media"
              style=${mediaStyle(showMjpeg)}
              alt="Camera"
            />
            ${showPlaceholder
              ? html`
                  <div class="stream-placeholder">
                    <div>
                      <strong>Connecting stream…</strong>
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

            <div class="pad-controls">
              <div class="pad-ptz">
                <div class="ring-wrap">
                  <div class="ring">
                    <div class="ticks" aria-hidden="true"></div>
                    ${this._dirButton("up", "Tilt up")}
                    ${this._dirButton("down", "Tilt down")}
                    ${this._dirButton("left", "Pan left")}
                    ${this._dirButton("right", "Pan right")}
                    <div class="stage">
                      <div
                        class="orientation-view"
                        aria-hidden="true"
                        title="Camera orientation"
                      >
                        <div class="cam3d">
                          ${camera3d(cameraTransform(this._orientation))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p class="hint">
                  Click to nudge · hold to repeat · center shows orientation
                </p>
              </div>

              <div class="pad-media" aria-label="Privacy and stream audio">
                ${config.privacy
                  ? html`
                      <ha-icon-button
                        class=${classMap({
                          "privacy-toggle": true,
                          on: locked,
                        })}
                        .path=${locked ? mdiEyeOffOutline : mdiEyeOutline}
                        .label=${locked
                          ? "Disable privacy mode"
                          : "Enable privacy mode"}
                        .selected=${locked}
                        @click=${this._onPrivacyClick}
                      ></ha-icon-button>
                    `
                  : nothing}
                <div class="pad-audio" aria-label="Stream audio">
                  <ha-icon-button
                    class=${classMap({
                      "audio-mute": true,
                      muted: this._muted,
                    })}
                    .path=${this._muted ? mdiVolumeOff : mdiVolumeHigh}
                    .label=${this._muted ? "Unmute stream" : "Mute stream"}
                    .selected=${this._muted}
                    @click=${this._toggleMute}
                  ></ha-icon-button>
                  <input
                    class="audio-volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    .value=${String(this._volume)}
                    aria-label="Stream volume"
                    @input=${this._onVolumeInput}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _dirButton(dir: PtzDirection, aria: string) {
    const locked = this._privacyLocked;
    return html`
      <ha-icon-button
        class=${classMap({
          btn: true,
          [dir]: true,
          active: this._activeDir === dir,
        })}
        data-dir=${dir}
        .path=${PTZ_PATHS[dir]}
        .label=${aria}
        .disabled=${locked}
        .selected=${this._activeDir === dir}
        @pointerdown=${(e: PointerEvent) => this._startHold(dir, e)}
        @pointerup=${() => this._stopHold()}
        @pointercancel=${() => this._stopHold()}
        @lostpointercapture=${() => this._stopHold()}
      ></ha-icon-button>
    `;
  }
}

if (!customElements.get("ha-card")) {
  class HaCard extends HTMLElement {}
  customElements.define("ha-card", HaCard);
}

/** Demo / non-HA stub — real Lovelace provides ha-icon-button. */
if (!customElements.get("ha-icon-button")) {
  class HaIconButtonStub extends HTMLElement {
    static get observedAttributes() {
      return ["disabled"];
    }

    #path = "";
    #label = "";
    #disabled = false;
    #selected = false;
    #btn: HTMLButtonElement | null = null;
    #svgPath: SVGPathElement | null = null;

    get path() {
      return this.#path;
    }
    set path(value: string) {
      this.#path = value ?? "";
      if (this.#svgPath) this.#svgPath.setAttribute("d", this.#path);
    }

    get label() {
      return this.#label;
    }
    set label(value: string) {
      this.#label = value ?? "";
      if (this.#btn) {
        this.#btn.setAttribute("aria-label", this.#label);
        this.#btn.title = this.#label;
      }
    }

    get disabled() {
      return this.#disabled;
    }
    set disabled(value: boolean) {
      this.#disabled = Boolean(value);
      if (this.#disabled) this.setAttribute("disabled", "");
      else this.removeAttribute("disabled");
      if (this.#btn) this.#btn.disabled = this.#disabled;
    }

    get selected() {
      return this.#selected;
    }
    set selected(value: boolean) {
      this.#selected = Boolean(value);
      if (this.#selected) this.setAttribute("selected", "");
      else this.removeAttribute("selected");
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null) {
      if (name === "disabled") this.disabled = value !== null;
    }

    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            box-sizing: border-box;
            color: inherit;
            /* Consume --tapo-* / theme; never assign --ha-icon-button-size / --mdc-*. */
            width: var(--tapo-icon-button-size, var(--ha-icon-button-size, 48px));
            height: var(--tapo-icon-button-size, var(--ha-icon-button-size, 48px));
          }
          button {
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            border: none;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            cursor: pointer;
            display: grid;
            place-items: center;
            -webkit-tap-highlight-color: transparent;
          }
          button:disabled {
            color: var(--disabled-text-color, currentColor);
            opacity: 0.38;
            cursor: not-allowed;
          }
          :host([selected]) button {
            background: rgba(var(--rgb-primary-text-color, var(--tapo-ink-rgb)), 0.1);
          }
          svg {
            width: var(--tapo-icon-size, 24px);
            height: var(--tapo-icon-size, 24px);
            fill: currentColor;
          }
        </style>
        <button type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path></path></svg>
        </button>
      `;
      this.#btn = root.querySelector("button");
      this.#svgPath = root.querySelector("path");
      this.path = this.#path;
      this.label = this.#label;
      this.disabled = this.#disabled;
      this.selected = this.#selected;
    }
  }
  customElements.define("ha-icon-button", HaIconButtonStub);
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
