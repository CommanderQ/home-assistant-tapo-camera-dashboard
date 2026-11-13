# AGENTS.md — Tapo C260 Camera Card

Guidance for AI coding tools working in this repository.

## What this is

- **Repo:** `CommanderQ/home-assistant-tapo-camera-dashboard` (public, MIT)
- **Lovelace card type:** `custom:tapo-c260-card`
- **Built artifact (HACS):** `dist/tapo-c260-card.js` — must match `hacs.json` → `filename`
- **Stack:** TypeScript, Lit, Vite; optional Playwright for source verification

This card is a **phone-first** Lovelace UI for a single Tapo C260: live stream viewport, circular PTZ pad, Concept C industrial 3D orientation graphic, mute/volume chrome.

## Required companion: `tapo_control`

HACS [Tapo: Cameras Control](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control) (`tapo_control`) is a **required companion**, not optional and not replaced by this card.

- PTZ / calibrate / privacy / angle / volume entities come from `tapo_control`
- The card presses buttons and reads entity state; it does not speak the Tapo proprietary protocol itself
- Device autofill in the editor (`src/device.ts`, `src/editor.ts`) assumes `tapo_control` entity naming

Do not invent a parallel integration or hard-code cloud credentials in the card.

## go2rtc is optional

`config.go2rtc` (stream name or WS/HTTP URL) is **optional**.

| Without go2rtc | With go2rtc |
| --- | --- |
| HA camera WebRTC / HLS / MJPEG / snapshot via `camera` / `camera_hd` | Preferred low-latency WebRTC over go2rtc WS; MP4/HLS candidates too |

- Prefer **HD** when `camera_hd` is set; SD is fallback only — **no runtime SD↔HD switching**
- Stream attach / retry lives in `src/stream.ts`; keep PTZ from tearing down the stream
- README documents URL resolution (`ws` / `http` / stream name)

## Commit messages

Every commit uses a short subject plus a **markdown body** with only the categories that apply:

```markdown
## Features
- Concise user-facing capability

## Fixes
- Concise bug fix

## Changes
- Non-fix behavior or structural change

## Other
- Docs, CI, chores, misc
```

Keep list items concise. Omit empty categories. Details: [`docs/commit-and-release.md`](docs/commit-and-release.md).

## Releases: only on `package.json` version bump

`.github/workflows/release.yml` publishes a GitHub Release **only when** `package.json` `version` changes on `main` vs `HEAD^` **and** tag `vX.Y.Z` does not already exist.

- **Do not** bump `package.json` / lockfile version unless the user explicitly wants a HACS release
- Docs-only, style, CI, and feature commits that leave version unchanged must **not** cut a release
- There is **no** auto patch-bump bot
- To ship: bump version deliberately → push `main` → workflow builds and attaches `tapo-c260-card.js`

### Version bump commit + GitHub Release notes

The bump commit body and the GitHub Release notes share this format (version from `package.json`):

```markdown
# Release x.x.x

## Features
- … ([#12](https://github.com/CommanderQ/home-assistant-tapo-camera-dashboard/pull/12))

## Fixes
- …

## Changes
- …

## Other
- …
```

- Consolidate **all commits since the previous version** into those categories
- Include a **PR link per change/PR** when one exists; omit empty categories
- Workflow uses `scripts/generate-release-notes.mjs` (prefers an authored `# Release` bump body; otherwise consolidates commit sections). Do **not** rely on GitHub `generate_release_notes`

## Layout / UX preferences (keep these)

- **Visual concept:** Concept C — industrial metal / 3D perspective PTZ graphic (`src/camera-3d.ts`, pad chrome in `src/styles.ts`)
- **Layout:** Stream-dominant, portrait (stream above pad); sections defaults `columns: "full"`, `rows: "auto"`
- **Stream display:** Native aspect via `object-fit: contain`; still fallback nested in `<video>` (poster + img); MJPEG as separate sibling img
- **PTZ:** Both click-to-nudge and press-and-hold (`src/ptz.ts` `HoldRepeater`)
- **Angle readout:** Yaw/pitch only while pressing, and only when values are known
- **Center control:** Home / calibrate (not presets)
- **Primary surface:** Phone / Companion — touch targets ≥ 44px
- **Single camera** only for v1 scope

Prefer incremental style/layout fixes over redesign. Do not swap Concept C for a generic Lovelace look.

## Talkback / mic → speaker: deferred

Live press-to-talk (browser mic → C260 speaker) is **researched and deferred**.

- Plan: [`docs/future/talkback-mic-plan.md`](docs/future/talkback-mic-plan.md)
- Preferred future path: go2rtc WebRTC duplex over `tapo://` + in-card `getUserMedia` sendonly track
- **Do not implement** talkback, mic button, or duplex renegotiation unless the user explicitly asks
- Current mute/volume chrome is **downlink only**

## Source map (where to edit)

| Area | Files |
| --- | --- |
| Card shell / state | `src/tapo-c260-card.ts` |
| Stream attach | `src/stream.ts` |
| Styles / pad chrome | `src/styles.ts` |
| PTZ services | `src/ptz.ts` |
| Orientation math / readout | `src/orientation.ts` |
| 3D graphic | `src/camera-3d.ts` |
| Pinch zoom / pan | `src/viewport-zoom.ts` |
| Config types | `src/types.ts` |
| Device autofill | `src/device.ts` |
| Lovelace editor | `src/editor.ts` |
| Local mock demo | `demo/` |
| HACS release workflow | `.github/workflows/release.yml` |
| Release notes generator | `scripts/generate-release-notes.mjs` |
| Commit / release conventions | `docs/commit-and-release.md` |
| Deferred plans | `docs/future/` |

## Commands

```bash
npm run typecheck    # tsc --noEmit
npm run build        # library card → dist/tapo-c260-card.js (HACS)
npm run demo         # Vite mock hass demo
npm run build:demo   # demo site only — not the HACS asset
npm run verify:sources
```

## Working rules for agents

1. Match existing Lit / TypeScript patterns; avoid drive-by refactors.
2. Do not bump `package.json` version unless asked to release.
3. Do not implement items under `docs/future/` unless asked.
4. Keep `tapo_control` as the entity source of truth; keep go2rtc optional.
5. Preserve phone-first hit targets and Concept C pad aesthetics.
6. After stream/UI changes, prefer `npm run typecheck` / `npm run build` before claiming done.
7. Write commit bodies with `## Features` / `## Fixes` / `## Changes` / `## Other` list items; on version bumps, use `# Release x.x.x` consolidated notes with PR links.
