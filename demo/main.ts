import "../src/tapo-c260-card";
import type { TapoC260Card } from "../src/tapo-c260-card";
import { createMockHass, togglePrivacy } from "./mock-hass";

const logEl = document.getElementById("log")!;
const lines: string[] = [];

function log(msg: string): void {
  const stamp = new Date().toLocaleTimeString();
  lines.unshift(`[${stamp}] ${msg}`);
  logEl.textContent = lines.slice(0, 40).join("\n");
}

const hass = createMockHass({
  onService(domain, service, data) {
    log(`${domain}.${service} ${JSON.stringify(data ?? {})}`);
  },
});

const card = document.getElementById("card") as TapoC260Card;
card.setConfig({
  type: "custom:tapo-c260-card",
  camera: "camera.living_room_sd",
  camera_hd: "camera.living_room_hd",
  // Absolute go2rtc URL → Lit renders stream.mp4 + stream.m3u8 <source> children
  // (demo host has no HA base URL, so stream names alone would not resolve).
  go2rtc: "http://127.0.0.1:1984/api/ws?src=living_room",
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
});
card.hass = hass;

document.getElementById("toggle-privacy")?.addEventListener("click", () => {
  togglePrivacy(hass);
  // Re-assign to trigger Lit property update
  card.hass = { ...hass, states: { ...hass.states } };
  log(
    `privacy → ${hass.states["switch.living_room_privacy"]?.state ?? "unknown"}`,
  );
});

document.getElementById("clear-log")?.addEventListener("click", () => {
  lines.length = 0;
  logEl.textContent = "Service log…";
});

log("Demo ready — nudge the pad or hold a direction.");
