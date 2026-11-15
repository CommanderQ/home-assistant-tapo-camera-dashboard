# Recorded video history plan — Tapo C260

**Status:** research only — do not implement yet  
**Card:** `custom:tapo-c260-card` (`CommanderQ/home-assistant-tapo-camera-dashboard`)  
**Companion:** HACS `tapo_control` (JurajNyiri/HomeAssistant-Tapo-Control); C260 listed supported  
**Task:** HACD-52 (research); saved under `docs/future/` as HACD-53

---

## Verdict

**SD-card recordings (video + audio) are accessible in Home Assistant today** via **`tapo_control` → Media Source → HA Media Browser**. That is the primary path.

| Path | Accessible? | Video + audio? | Role |
| --- | --- | --- | --- |
| **`tapo_control`** | **Yes** | **Yes** (typical; see caveats) | Lists SD clips, downloads/decrypts, remuxes to MP4, optional background sync |
| **HA Media Browser** | **Yes** | Same as above | UI surface for the Media Source (`media-source://tapo_control/...`) |
| **SD card** | **Yes (via camera API)** | Yes when Audio Recording is on | Source of truth on-device; not mounted as a filesystem by HA |
| **Cloud (Tapo Care)** | **No in HA** | N/A in HA | App/subscription only; `tapo_control` does not browse Care clips |
| **go2rtc** | **No for SD/Care history** | Live only (or separate NVR you build) | Live restream / duplex; does not read camera SD or Care |

**Recommended product path for a future history UI:** lean on `tapo_control` Media Source (browse + play synced/on-demand MP4s). Do **not** wait on go2rtc or Tapo Care APIs for camera-native history.

---

## Path details

### 1. `tapo_control` (integration)

**What it exposes for history**

- **Media Source** — browse and play recordings stored on the camera (SD).
- **Media sync** — optional background download of the last *N* hours into HA storage for instant play.
- **`switch.*_media_sync`** — enable/disable sync.
- **Sensor** — media sync status.
- **`switch.*` Recording / Audio Recording** — whether the camera writes video (and audio) to SD.
- **`tapo_control.set_record_plan`** — weekly SD schedule (continuous vs motion); **Record to SD Card** switch reflects enabled.
- **Event** `tapo_control_media_downloaded` — `{ entry_id, startDate, endDate, filePath }` when a clip finishes downloading.

**How download works (local, not Care)**

1. Needs **TP-Link cloud account password** in the integration config (“Invalid cloud password” / “Cloud password is required…”). That password authenticates the camera’s recording API; **traffic stays local** (pytapo: “everything is still local”).
2. Clips are **not** raw files on a share. Camera serves encrypted stream over proprietary protocol (**TCP/8800**); pytapo decrypts MPEG-TS and **ffmpeg remuxes to MP4** (video copy, **audio re-encoded to AAC** from PCMA/PCMU when present).
3. Default cold store: `/config/.storage/tapo_control/{entry_id}/videos` (+ `thumbs`). Hot/serve path under `www/tapo_control/...`. Configurable cold path (e.g. `/media/tapo_control/...`) to keep clips out of HA backups.
4. Sync off by default; on-demand play works but is slow — enable **Configure media** → hours to sync for snappy playback. `✓` prefix in Media Browser = video already downloaded.
5. One download at a time; “Already downloading…” if another is in progress.

**Audio caveats**

- Camera **Audio Recording** must be on; **Microphone Mute** can silence what gets recorded.
- Happy path (C310-class, H.264 + PCMA/PCMU): synced MP4s include AAC audio. C260 is **H.264 4K**, so this path is the expected one.
- Known edge: some models (e.g. C575D HEVC / non-PCMA audio) sync **video-only** while the Tapo app export has audio ([Discussion #1421](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control/discussions/1421)). Treat C260 audio-in-sync as **expected but verify once** on Mike’s device before building UI around it.

**Not exposed**

- No Tapo Care cloud library.
- No go2rtc history endpoint.
- Direct (proprietary) live camera entities are unrelated to Media Source playback of stored clips.

### 2. HA Media Browser

**Yes — this is the stock HA UI for path 1.**

Browse hierarchy (from `TapoMediaSource`):

1. Root → Tapo cameras  
2. Camera → dates with recordings  
3. Date → clip list (time ranges; `✓` = cached)  
4. Clip → play (triggers download if needed)

Playable in Media Browser / media player once resolved to a local/hot URL. Custom cards can later call HA’s media-source browse/resolve APIs against the same identifiers; no separate protocol required.

**Prerequisite:** cloud password configured; SD present; initial media scan completed (retries if card was missing).

### 3. SD card (on camera)

**Yes as storage; access only through the camera.**

- C260: microSD up to **512 GB**; init/format in Tapo app (`Camera Settings → microSD Card`).
- `tapo_control` / pytapo list and download via camera APIs (`getRecordingsList` / `getRecordings` / Downloader) — **not** by mounting the card in HA.
- If no SD: media scan fails / empty; integration retries (mains ~60s).
- TP-Link concurrency rule: **only two of** Tapo Care, SD recording, and NVR/RTSP-ONVIF recording at once. SD + Care can both store detection clips, but then NVR recording is disabled until the SD is removed. Live RTSP for the dashboard can still be used carefully; treat heavy NVR record + SD + Care as a hardware conflict.

### 4. Cloud (Tapo Care)

**Not accessible via `tapo_control`, Media Browser, or go2rtc.**

- Care clips live in TP-Link’s cloud / Tapo app only.
- The “cloud password” in `tapo_control` is **account auth for local SD download**, not a Care API client.
- For HA history without Care: rely on SD + Media Sync, or a separate NVR (Frigate, etc.) recording the live stream.

### 5. go2rtc

**Live (and optional self-made NVR), not camera SD/Care history.**

| Capability | go2rtc |
| --- | --- |
| Live C260 (RTSP `stream1`/`stream2` or `tapo://`) | Yes — already card/live path |
| Two-way audio (`tapo://`) | Yes — see [`talkback-mic-plan.md`](./talkback-mic-plan.md) |
| Browse/play clips already on C260 SD | **No** |
| Browse Tapo Care | **No** |
| Use `tapo_control` Direct streams as source | **No** (integration README: Direct ≠ go2rtc/WebRTC card) |

Separate history via Frigate (or similar) + go2rtc restream is a **second archive** of the live stream, not access to the camera’s SD timeline. Audio there needs AAC transcoding (`preset-record-generic-audio-aac` / go2rtc `#audio=aac`) because Tapo often emits PCMA.

---

## Implications for the card (planning only)

| Option | Fit | Notes |
| --- | --- | --- |
| **A. Deep-link / open HA Media Browser** to this camera’s Media Source | Lowest effort | Reuse existing UX; poor in-card UX on phone |
| **B. In-card history** via media-source browse + `<video>` / HA media player | Best match for dashboard | Depends on sync for snappy play; show download progress / `✓` |
| **C. Frigate / external NVR timeline** | Parallel product | Own retention & audio pipeline; duplicates storage; ignores SD library |
| **D. Tapo Care in-card** | Dead end | No supported HA API |

**Suggested future scope (not this task):** Option **B** after verifying one C260 clip plays **with audio** from Media Browser; wire card to `media-source://tapo_control/...` only — do not reimplement Downloader in the frontend. Keep go2rtc for **live** only.

**Out of scope for v1** (per existing prefs): history UI; stick to live go2rtc/WebRTC + PTZ.

---

## Preconditions checklist (ops)

1. microSD inserted and initialized; Recording (+ Audio Recording) on.  
2. `tapo_control` configured with **cloud password**.  
3. Media Browser → Tapo → camera → date → clip plays (confirm audio).  
4. Optionally enable **Configure media** sync hours + non-backup cold path.  
5. Keep go2rtc on RTSP or `tapo://` for live; do not expect it to list SD dates.

---

## Sources

- [JurajNyiri/HomeAssistant-Tapo-Control README](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control) — Media Source, Media Sync, C260 support, Direct vs go2rtc, Care/SD/NVR FAQ  
- [tapo_control `media_source.py`](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control/blob/main/custom_components/tapo_control/media_source.py) — browse hierarchy, cloud-password gate  
- [pytapo README — Downloading Recordings](https://github.com/JurajNyiri/pytapo) — local download, AAC remux, cloud password meaning  
- [Discussion #1421](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control/discussions/1421) — audio missing on some sync paths  
- [Tapo ONVIF/RTSP FAQ](https://tapo.com/us/faqs/tapo-camera-onvif-and-rtsp-common-questions-answered/) — Care + SD + NVR concurrency  
- [C260 user guide](https://static.tp-link.com/upload/manual/2025/202506/20250627/1900000487_Tapo%20C260%201.0_UG_V1.pdf) — microSD / Care storage  
- Related deferred plan: [`talkback-mic-plan.md`](./talkback-mic-plan.md)
