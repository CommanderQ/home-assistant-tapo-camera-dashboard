# Tapo C260 Camera Card

Home Assistant Lovelace card (`custom:tapo-c260-card`) for a **Tapo C260**: live stream viewport, compact circular PTZ pad, and a Concept C industrial 3D orientation graphic.

**Required companion:** HACS [Tapo: Cameras Control](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control) (`tapo_control`). This card does **not** replace that integration — it presses the move / calibrate buttons and reads movement angle / privacy entities that `tapo_control` exposes.

## Features (v1 scaffold)

- Portrait, stream-dominant layout with circular pad below the feed
- Click-to-nudge **and** press-and-hold repeat on pan/tilt
- Center control = home / calibrate
- Yaw / pitch readout **on press only**, and only once orientation is known (hidden when unknown)
- go2rtc / WebRTC stream wiring with an industrial **placeholder** when unavailable
- Phone-first touch targets (≥44px)
- Single camera
- Local Vite demo with mock `hass` (no HA install)

## Lovelace config

```yaml
type: custom:tapo-c260-card
camera: camera.living_room_sd
camera_hd: camera.living_room_hd
title: Feed · C260
# Optional: go2rtc stream name, or absolute ws/http URL
# go2rtc: living_room
ptz:
  up: button.living_room_move_up
  down: button.living_room_move_down
  left: button.living_room_move_left
  right: button.living_room_move_right
  angle: number.living_room_movement_angle
  calibrate: button.living_room_calibrate
privacy: switch.living_room_privacy
```

Entity IDs are instance-specific — copy them from your `tapo_control` device page.

### Optional keys

| Key | Purpose |
| --- | --- |
| `camera_hd` | HD entity for a future idle→HD upgrade path |
| `go2rtc` | Stream name (resolved via `/api/webrtc/ws?src=…`) or absolute URL |
| `title` | Stream chrome label (default `Feed · C260`) |
| `hold_interval_ms` | Hold-to-repeat interval (default `350`) |
| `privacy` | Privacy switch — disables the pad when `on` |

## Dependencies

1. Home Assistant with [HACS](https://hacs.xyz/)
2. **[Tapo: Cameras Control](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control)** installed and a C260 added
3. Recommended for live video: [go2rtc](https://github.com/AlexxIT/go2rtc) (HA built-in go2rtc integration and/or [WebRTC Camera](https://github.com/AlexxIT/WebRTC))

Do **not** run the official `tplink` integration and `tapo_control` on the same camera.

PTZ uses current `tapo_control` surfaces only: `button.press` on move / calibrate entities, optional `number.*_movement_angle`, optional `switch.*_privacy`. Legacy `tapo_control.ptz` is not used.

## Install (manual / early)

Until a HACS release asset is published:

1. Build the card: `npm ci && npm run build`
2. Copy `dist/tapo-c260-card.js` to `config/www/tapo-c260-card.js`
3. **Settings → Dashboards → Resources → Add**  
   URL: `/local/tapo-c260-card.js` · Type: JavaScript Module
4. Add the card YAML above to a dashboard

`hacs.json` is included for a future Marketplace / HACS plugin listing (`filename`: `tapo-c260-card.js`).

## Local demo (no Home Assistant)

```bash
npm ci
npm run demo
```

Open the URL Vite prints (default [http://127.0.0.1:5173](http://127.0.0.1:5173)).

- Mock `hass` logs `button.press` / privacy toggles in the on-page service log
- Stream shows the Concept C placeholder until a real go2rtc / camera proxy URL is configured
- Use **Toggle privacy** to verify pad lockout

### Other scripts

| Command | What it does |
| --- | --- |
| `npm run demo` | Vite dev server for `demo/` |
| `npm run build` | Production ES module → `dist/tapo-c260-card.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Preview a production demo build |

## Orientation model

Tapo / `tapo_control` expose **relative** moves, not an absolute pan/tilt sensor. The center graphic **dead-reckons** from commanded nudges (using Movement Angle when available). **Calibrate / home** resets yaw/pitch to `0` and marks orientation known. Treat the readout as approximate until a later ONVIF/`GetStatus` path is proven.

## License

[MIT](./LICENSE)
