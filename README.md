# Tapo C260 Camera Card

Home Assistant Lovelace card (`custom:tapo-c260-card`) for a **Tapo C260**: live stream viewport, compact circular PTZ pad, and a Concept C industrial 3D orientation graphic.

**Required companion:** HACS [Tapo: Cameras Control](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control) (`tapo_control`). This card does **not** replace that integration — it presses the move / calibrate buttons and reads movement angle / privacy entities that `tapo_control` exposes.

## Features (v1 scaffold)

- Portrait, stream-dominant layout with circular pad below the feed
- Sections layout defaults to **full width** and **height: auto** (fit content)
- Click-to-nudge **and** press-and-hold repeat on pan/tilt
- Center control = home / calibrate
- Yaw / pitch readout **on press only**, and only once orientation is known (hidden when unknown)
- Live camera stream via HA **WebRTC → HLS → MJPEG** (snapshot only as last resort)
- SD idle stream with **HD upgrade while using PTZ** when `camera_hd` is set
- Phone-first touch targets (≥44px)
- Single camera
- Lovelace visual editor: pick the **Tapo device** and entities auto-fill
- Local Vite demo with mock `hass` (no HA install)

## Lovelace config

### Visual editor

After the card resource is loaded, use the dashboard UI:

1. Edit a dashboard → **Add card** → search **Tapo C260 Camera Card**.
2. Select your **Tapo camera device** (from `tapo_control`) — camera SD/HD, PTZ buttons, angle, calibrate, preset, and privacy fill in automatically.
3. Optionally set title / go2rtc / hold interval. Open **Entity overrides** only if a mapping needs a tweak.
4. Save.

### YAML

```yaml
type: custom:tapo-c260-card
# Preferred: set device and let the card/editor resolve entities
# device: <tapo_control device id>
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
  # preset: select.living_room_move_to_preset
privacy: switch.living_room_privacy
```

Entity IDs are instance-specific — the visual editor fills them from the device. Manual YAML can still paste IDs from the `tapo_control` device page.

### Stream behavior

| Mode | When |
| --- | --- |
| WebRTC | Tried first for stream-capable cameras (HA go2rtc / WebRTC path) |
| HLS | **hls.js** on Chrome/Edge/Firefox; native only on Safari (never raw `m3u8` on Chromium) |
| MJPEG | `/api/camera_proxy_stream/…` live multipart fallback |
| Snapshot | Last resort only if no live path is available |

`camera` is the idle/default feed (usually SD). When `camera_hd` is set, the card switches to HD while you press the PTZ pad / home, and holds HD briefly afterward.

### Optional keys

| Key | Purpose |
| --- | --- |
| `device` | `tapo_control` device id — auto-associates entities |
| `camera_hd` | HD entity used while controlling PTZ |
| `go2rtc` | Optional stream name or absolute URL (otherwise HA camera stream) |
| `title` | Stream chrome label (default `Feed · C260` or device name) |
| `hold_interval_ms` | Hold-to-repeat interval (default `350`) |
| `privacy` | Privacy switch — disables the pad when `on` |
| `ptz.preset` | Optional preset select entity |

## Dependencies

1. Home Assistant with [HACS](https://hacs.xyz/)
2. **[Tapo: Cameras Control](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control)** installed and a C260 added
3. Recommended for live video: [go2rtc](https://github.com/AlexxIT/go2rtc) (HA built-in go2rtc integration and/or [WebRTC Camera](https://github.com/AlexxIT/WebRTC))

Do **not** run the official `tplink` integration and `tapo_control` on the same camera.

PTZ uses current `tapo_control` surfaces only: `button.press` on move / calibrate entities, optional `number.*_movement_angle`, optional `switch.*_privacy`. Legacy `tapo_control.ptz` is not used.

## Install

This is a Lovelace **frontend** card (Lit bundle + `hacs.json`). Install via HACS as a custom repository when a release asset is available, or copy the built module manually.

### Option A — HACS (custom repository)

1. Install [HACS](https://hacs.xyz/) if you do not already have it.
2. Open **HACS → Frontend** (three-dot menu) → **Custom repositories**.
3. Add this repository:
   - **Repository:** `https://github.com/CommanderQ/home-assistant-tapo-camera-dashboard`
   - **Category:** **Lovelace**
4. Find **Tapo C260 Camera Card** in HACS → Frontend → download / install it.
5. When prompted, reload the frontend (or restart Home Assistant).
6. Confirm a dashboard resource exists (**Settings → Dashboards → Resources**):
   - URL similar to `/hacsfiles/home-assistant-tapo-camera-dashboard/tapo-c260-card.js`
   - Type: **JavaScript Module**  
   HACS usually adds this for you; add it manually only if it is missing.
7. Add the card from the dashboard UI ([visual editor](#visual-editor)) or paste the YAML from [Lovelace config](#lovelace-config).

`hacs.json` names the frontend file as `tapo-c260-card.js`. HACS serves that file from a **GitHub Release** asset with the same filename. If no release is published yet, use Option B (manual) after building locally, or wait for a release that includes `tapo-c260-card.js`.

### Option B — Manual resource

Use this when developing from source or when no HACS release asset exists yet.

1. Clone the repo and build the card:

   ```bash
   git clone https://github.com/CommanderQ/home-assistant-tapo-camera-dashboard.git
   cd home-assistant-tapo-camera-dashboard
   npm ci
   npm run build
   ```

2. Copy the bundle into Home Assistant’s www folder (create `www` if needed):

   ```bash
   # Example paths — adjust for your HA config directory
   cp dist/tapo-c260-card.js /config/www/tapo-c260-card.js
   ```

3. **Settings → Dashboards → Resources → Add resource**
   - **URL:** `/local/tapo-c260-card.js`
   - **Resource type:** JavaScript Module
4. Reload the browser (hard refresh) and add the card YAML from [Lovelace config](#lovelace-config).

Updating later: rebuild, replace `config/www/tapo-c260-card.js`, then hard-refresh the dashboard.

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
