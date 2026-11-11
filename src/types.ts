/** Lovelace card config for custom:tapo-c260-card */
export interface TapoC260CardConfig {
  type?: string;
  /** SD / idle camera entity (preferred default stream). */
  camera: string;
  /** Optional HD camera entity upgraded on interaction. */
  camera_hd?: string;
  /** Optional go2rtc stream name or absolute WebRTC URL. */
  go2rtc?: string;
  /** Optional title shown in the stream chrome. */
  title?: string;
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

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown> | void;
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
