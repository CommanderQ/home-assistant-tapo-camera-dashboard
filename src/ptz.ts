import type { HomeAssistant, PtzDirection, TapoC260CardConfig } from "./types";

export function isPrivacyOn(
  hass: HomeAssistant | undefined,
  privacyEntity?: string,
): boolean {
  if (!hass || !privacyEntity) return false;
  const state = hass.states[privacyEntity]?.state;
  return state === "on" || state === "true";
}

export function readMovementAngle(
  hass: HomeAssistant | undefined,
  angleEntity?: string,
): number | null {
  if (!hass || !angleEntity) return null;
  const raw = hass.states[angleEntity]?.state;
  if (raw == null || raw === "unknown" || raw === "unavailable") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function pressButton(
  hass: HomeAssistant | undefined,
  entityId: string | undefined,
): Promise<void> {
  if (!hass || !entityId) return;
  await hass.callService("button", "press", { entity_id: entityId });
}

export async function nudgeDirection(
  hass: HomeAssistant | undefined,
  config: TapoC260CardConfig,
  direction: PtzDirection,
): Promise<void> {
  const entityId = config.ptz[direction];
  await pressButton(hass, entityId);
}

export async function calibrate(
  hass: HomeAssistant | undefined,
  config: TapoC260CardConfig,
): Promise<void> {
  await pressButton(hass, config.ptz.calibrate);
}

/**
 * Pointer hold helper: fire once immediately, then repeat while held.
 */
export class HoldRepeater {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private active = false;

  constructor(
    private readonly onTick: () => void | Promise<void>,
    private readonly intervalMs: number,
    private readonly delayMs = 280,
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    void this.onTick();
    this.timer = setTimeout(() => {
      if (!this.active) return;
      this.interval = setInterval(() => {
        void this.onTick();
      }, this.intervalMs);
    }, this.delayMs);
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  get isActive(): boolean {
    return this.active;
  }
}
