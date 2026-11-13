/** Lovelace card config for custom:tapo-c260-card */
export interface TapoC260CardConfig {
  type?: string;
  /** Optional tapo_control device id — editor auto-fills entity fields from it. */
  device?: string;
  /** Camera entity (often SD). Used as primary when `camera_hd` is omitted; otherwise a fallback source. */
  camera: string;
  /**
   * Optional HD camera entity. Preferred for WebRTC / HTTP candidates when set;
   * `camera` remains a lower-quality fallback. No runtime SD↔HD switching.
   */
  camera_hd?: string;
  /** Optional go2rtc stream name or absolute WebRTC URL. */
  go2rtc?: string;
  ptz: {
    up: string;
    down: string;
    left: string;
    right: string;
    /** Movement angle number entity (degrees per nudge). */
    angle?: string;
    /** Calibrate / home button entity. */
    calibrate?: string;
    /** Preset select entity (optional; v1 center is calibrate). */
    preset?: string;
  };
  privacy?: string;
  /** Hold-repeat interval in ms (default 350). */
  hold_interval_ms?: number;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/** Entity registry row as exposed on `hass.entities`. */
export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  unique_id?: string;
  name?: string | null;
  original_name?: string | null;
}

/** Device registry row as exposed on `hass.devices`. */
export interface HassDeviceRegistryEntry {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  config_entries?: string[];
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  /** Entity registry map (entity_id → entry) when available in Lovelace. */
  entities?: Record<string, HassEntityRegistryEntry>;
  /** Device registry map (device_id → entry) when available in Lovelace. */
  devices?: Record<string, HassDeviceRegistryEntry>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown> | void;
  callWS?: <T = unknown>(message: Record<string, unknown>) => Promise<T>;
  hassUrl?: (path?: string) => string;
  connection?: {
    subscribeMessage?: (
      callback: (msg: unknown) => void,
      message: Record<string, unknown>,
    ) => Promise<() => void>;
  };
  auth?: {
    data?: {
      hassUrl?: string;
    };
  };
}

export type PtzDirection = "up" | "down" | "left" | "right";

export interface Orientation {
  yaw: number;
  pitch: number;
  /** False until first calibrate / known angle model. */
  known: boolean;
}

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
      preview?: boolean;
      documentationURL?: string;
    }>;
  }
}
