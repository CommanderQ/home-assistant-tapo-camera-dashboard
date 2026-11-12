import type { HassEntity, HomeAssistant } from "../src/types";

export interface MockHassOptions {
  onService?: (domain: string, service: string, data?: Record<string, unknown>) => void;
}

const ENTITIES: Record<string, HassEntity> = {
  "camera.living_room_sd": {
    entity_id: "camera.living_room_sd",
    state: "idle",
    attributes: {
      friendly_name: "Living Room SD",
      // STREAM feature so the card attempts live paths in the demo.
      supported_features: 2,
      frontend_stream_type: "hls",
      access_token: "demo-token",
    },
  },
  "camera.living_room_hd": {
    entity_id: "camera.living_room_hd",
    state: "idle",
    attributes: {
      friendly_name: "Living Room HD",
      supported_features: 2,
      frontend_stream_type: "hls",
      access_token: "demo-token-hd",
    },
  },
  "button.living_room_move_up": {
    entity_id: "button.living_room_move_up",
    state: "unknown",
    attributes: { friendly_name: "Move Up" },
  },
  "button.living_room_move_down": {
    entity_id: "button.living_room_move_down",
    state: "unknown",
    attributes: { friendly_name: "Move Down" },
  },
  "button.living_room_move_left": {
    entity_id: "button.living_room_move_left",
    state: "unknown",
    attributes: { friendly_name: "Move Left" },
  },
  "button.living_room_move_right": {
    entity_id: "button.living_room_move_right",
    state: "unknown",
    attributes: { friendly_name: "Move Right" },
  },
  "button.living_room_calibrate": {
    entity_id: "button.living_room_calibrate",
    state: "unknown",
    attributes: { friendly_name: "Calibrate" },
  },
  "number.living_room_movement_angle": {
    entity_id: "number.living_room_movement_angle",
    state: "15",
    attributes: {
      friendly_name: "Movement Angle",
      min: 5,
      max: 60,
      step: 5,
      unit_of_measurement: "°",
    },
  },
  "switch.living_room_privacy": {
    entity_id: "switch.living_room_privacy",
    state: "off",
    attributes: { friendly_name: "Privacy" },
  },
};

export function createMockHass(options: MockHassOptions = {}): HomeAssistant {
  const states = structuredClone(ENTITIES);

  const hass: HomeAssistant = {
    states,
    async callService(domain, service, data) {
      options.onService?.(domain, service, data);

      if (domain === "switch" && service === "toggle" && data?.entity_id) {
        const id = String(data.entity_id);
        const ent = states[id];
        if (ent) {
          ent.state = ent.state === "on" ? "off" : "on";
        }
      }

      if (domain === "button" && service === "press" && data?.entity_id) {
        const id = String(data.entity_id);
        const ent = states[id];
        if (ent) {
          ent.state = new Date().toISOString();
        }
      }
    },
    async callWS<T = unknown>(message: Record<string, unknown>): Promise<T> {
      if (message.type === "camera/stream") {
        const entityId = String(message.entity_id ?? "camera.living_room_sd");
        return {
          url: `https://demo.invalid/api/hls/${encodeURIComponent(entityId)}/playlist.m3u8`,
        } as T;
      }
      throw new Error(`Unhandled mock WS: ${String(message.type)}`);
    },
  };

  return hass;
}

export function togglePrivacy(hass: HomeAssistant): void {
  const ent = hass.states["switch.living_room_privacy"];
  if (!ent) return;
  ent.state = ent.state === "on" ? "off" : "on";
}
