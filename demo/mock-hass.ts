import type { HassEntity, HomeAssistant } from "../src/types";

export interface MockHassOptions {
  onService?: (domain: string, service: string, data?: Record<string, unknown>) => void;
  /** Fired after any mock state mutation so the demo can reassign `card.hass`. */
  onStatesChanged?: () => void;
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

function setEntityState(
  states: Record<string, HassEntity>,
  entityId: string,
  state: string,
): boolean {
  const ent = states[entityId];
  if (!ent || ent.state === state) return false;
  // Replace the entity object — in-place mutation does not notify Lit `hass`.
  states[entityId] = { ...ent, state };
  return true;
}

export function createMockHass(options: MockHassOptions = {}): HomeAssistant {
  const states = structuredClone(ENTITIES);

  const notify = (): void => {
    options.onStatesChanged?.();
  };

  const hass: HomeAssistant = {
    states,
    async callService(domain, service, data) {
      options.onService?.(domain, service, data);

      let changed = false;

      if (domain === "switch" && data?.entity_id) {
        const id = String(data.entity_id);
        const ent = states[id];
        if (ent) {
          if (service === "toggle") {
            changed = setEntityState(
              states,
              id,
              ent.state === "on" ? "off" : "on",
            );
          } else if (service === "turn_on") {
            changed = setEntityState(states, id, "on");
          } else if (service === "turn_off") {
            changed = setEntityState(states, id, "off");
          }
        }
      }

      if (domain === "button" && service === "press" && data?.entity_id) {
        const id = String(data.entity_id);
        if (states[id]) {
          changed = setEntityState(states, id, new Date().toISOString());
        }
      }

      if (changed) notify();
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

/** Demo chrome helper — same path as the card (`switch.toggle`). */
export async function togglePrivacy(hass: HomeAssistant): Promise<void> {
  await hass.callService("switch", "toggle", {
    entity_id: "switch.living_room_privacy",
  });
}
