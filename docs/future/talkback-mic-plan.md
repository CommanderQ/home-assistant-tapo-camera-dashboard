# Talkback mic plan — device mic → Tapo C260 speaker

**Status:** research only — **do not implement yet** (deferred)  
**Card:** `custom:tapo-c260-card`  
**Target:** press-to-talk from Companion / browser mic to C260 speaker

---

## Verdict

**Feasible**, with a clear preferred path: **go2rtc WebRTC duplex over a `tapo://` stream**, driven from the card with `getUserMedia` + a send-only audio transceiver.

`tapo_control` alone **cannot** do live talkback. HA Core’s new camera two-way-audio Labs feature (2026.11) is also **not** a usable path for this card today, because `tapo_control` does not declare `CameraEntityCapabilities.two_way_audio`.

---

## Research summary

### 1. `tapo_control` (HACS) — entities / services

What it **does** expose (relevant to audio):

| Kind | Examples | Role for talkback |
| --- | --- | --- |
| `number` | Speaker Volume, Microphone Volume | Loudness only |
| `switch` | Microphone Mute, Microphone Noise Cancelling | Camera-side mic settings |
| `camera` | HD / SD streams (RTSP / proprietary) | One-way video (+ downlink audio if stream has it) |

What it **does not** expose:

- No push-to-talk / talkback / “speak into speaker” service
- No live uplink audio entity
- Issue [#99](https://github.com/JurajNyiri/HomeAssistant-Tapo-Control/issues/99) (two-way audio) was closed with guidance to use **go2rtc / WebRTC**; author declined to implement duplex in the integration

**Implication:** keep `tapo_control` as the companion for PTZ / privacy / volume entities; do **not** wait on it for mic→speaker.

### 2. go2rtc duplex

go2rtc explicitly supports two-way audio for **TP-Link Tapo** via the proprietary source:

```yaml
streams:
  c260:
    - tapo://CLOUD_PASSWORD@192.168.x.x
    # optional: RTSP/ffmpeg for record/detect — keep tapo:// for duplex
```

Producer media (typical probe):

- `video, recvonly, H264`
- `audio, recvonly, PCMA/8000` (or newer firmwares: `PCMU/16000`)
- `audio, sendonly, PCMA/8000` ← **speaker uplink**

Constraints that matter for the card:

- Duplex only works over **WebRTC** (MSE / HLS / MP4 are receive-only)
- Signaling must use go2rtc’s **WS protocol** (`/api/ws?src=…`), which supports async WebRTC + two-way audio (WHEP does not)
- Browser HTTPS required for mic
- One backchannel session at a time (last client usually wins)
- C260 community reports (Frigate + go2rtc) confirm two-way works when `tapo://` is present; RTSP-only is not enough for Tapo duplex

Card already has a go2rtc WS WebRTC path in `src/stream.ts` (`attachGo2rtcWebRtc`), but today it only adds:

```ts
pc.addTransceiver("video", { direction: "recvonly" });
pc.addTransceiver("audio", { direction: "recvonly" });
```

That is the main code gap: **no send track**.

### 3. HA camera speak / stream APIs

| API | Purpose | Talkback? |
| --- | --- | --- |
| `camera/stream` | HLS playlist URL | No |
| `camera/webrtc/offer` + `candidate` | HA-native WebRTC view | Receive-only unless entity declares two-way audio **and** Labs is on |
| `CameraEntityCapabilities.two_way_audio` (HA 2026.11 Labs) | Frontend may enable mic when WebRTC + HTTPS | **Not set by `tapo_control`** |
| AlexxIT `media_player` (`platform: webrtc`, `audio: pcma`) | TTS / file → camera speaker via go2rtc | One-shot playback, not live PTT |
| `tts.speak` → that media_player | Automation announcements | Out of scope for live mic button |

**Implication:** for this Lovelace card, prefer **direct go2rtc WebRTC duplex in the card**, not HA Labs camera two-way or a separate media_player entity.

### 4. Browser `getUserMedia`

Hard requirements:

- **Secure context** — HTTPS (or `localhost`). On HTTP, `navigator.mediaDevices` is `undefined`
- Companion App Assist already fails on HTTP internal URLs for the same reason
- Certificate must match the hostname (IP + domain cert → mic often unavailable)
- Must run from a **user gesture** (pointerdown / click on mic)

Recommended constraints (ideal, not guaranteed):

```ts
navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,   // critical when stream audio is unmuted
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  video: false,
});
```

Verify with `track.getSettings()` after grant. Stop tracks on release / disconnect.

Reference pattern (AlexxIT `VideoRTC.createOffer`): if `media` includes `microphone`, `getUserMedia` → `pc.addTransceiver(track, { direction: "sendonly" })`, then add recvonly video/audio.

---

## Preferred approach

**In-card go2rtc WebRTC push-to-talk**, gated on an active go2rtc WebRTC session.

### Flow

1. User already watching via go2rtc WebRTC (`config.go2rtc` resolved to WS).
2. User presses mic (pointer down).
3. Card calls `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl, channelCount: 1 } })`.
4. Add mic track as **sendonly** on the existing `RTCPeerConnection` (or renegotiate if the peer was created recvonly-only — see open questions).
5. go2rtc forwards Opus/PCMA to the camera’s `tapo://` sendonly audio.
6. On pointer up / cancel / disconnect: disable/stop track, remove sender (or mute track), clear UI state.

### Why this over alternatives

| Approach | Pros | Cons | Decision |
| --- | --- | --- | --- |
| **A. Extend card go2rtc WebRTC (preferred)** | Fits existing stream path; same UX surface as mute/volume; proven by AlexxIT / Frigate | Needs go2rtc + `tapo://`; HTTPS; renegotiation complexity | **Ship this** |
| B. HA Labs camera two-way | Native frontend someday | Requires `tapo_control` to declare capability; Labs flag; card would still need custom UI | Defer / watch |
| C. Embed / depend on `custom:webrtc-camera` | Mic already implemented | Breaks industrial card UI; dual cards | Reject |
| D. Separate WebSocket ADPCM (Reolink-style) | Full control | Reinvents Tapo proprietary audio; high risk | Reject |
| E. TTS / media_player only | Easy for announcements | Not live talkback | Out of scope (optional later) |

### Prerequisites (user / install)

1. go2rtc running (addon, Frigate-bundled, or AlexxIT WebRTC bundle) with a stream that includes **`tapo://…`**
2. Card `go2rtc:` set to that stream name or WS URL (already supported)
3. HA reached over **HTTPS** (Nabu Casa, reverse proxy, or valid local cert) — especially Companion
4. Mic permission granted; Assist mic working is a good smoke test
5. Prefer go2rtc ≥ **1.9.13** if C260 firmware uses PCMU/16000 (codec churn on newer Tapo FW)

### Implementation sketch (for a later PR — not now)

1. **`src/stream.ts`**
   - Keep recvonly offer for normal view.
   - Add talkback helpers: `startTalkback(pc | handle)`, `stopTalkback()`, expose whether current mode is go2rtc WebRTC.
   - On start: `getUserMedia` → `addTrack` / `addTransceiver(…, sendonly)` → renegotiate offer/answer over existing WS if needed.
   - On stop: `track.stop()`, remove/replace sender, optional renegotiate.
2. **`src/tapo-c260-card.ts`**
   - State: `_talking`, `_talkError`, `_talkAvailable`.
   - Mic available only when `_streamMode === "webrtc"` **and** go2rtc path was used (not HA-only WebRTC unless Labs path is added later).
   - Press-and-hold (match PTZ hold UX); also support click-toggle as optional config later.
3. **`src/styles.ts`**
   - Mic button left of volume stack; 44px hit target; amber active while talking.
4. **Docs / README**
   - Document `tapo://` go2rtc requirement, HTTPS, and that mute/volume remain downlink-only.

---

## UI plan

Current chrome (post mute/volume work):

- `.pad-controls`: PTZ block | vertical `.pad-audio` (mute on top, vertical volume below)

Requested:

- **Mic button to the left of volume**

Proposed layout (phone-first):

```
[ PTZ ring + hint ]     [ mic ] [ mute ]
                        [      volume (vertical) ]
```

Details:

- New `.audio-mic` button, **44×44**, same metal treatment as `.audio-mute`
- Place mic **immediately left of** the mute + volume column (sibling before `.pad-audio`, or mic as first child of a wider audio cluster)
- Press-and-hold to talk (aligned with PTZ hold preference)
- Visual states: idle / talking (amber) / unavailable (disabled + short reason) / denied
- `stopPropagation` on pointer events so stream pinch/pan and PTZ never see mic gestures
- While talking with downlink unmuted, rely on `echoCancellation: true`; optionally auto-duck `_volume` during PTT (open question)
- Do **not** put mic in the stream overlay hero; keep it in the pad audio chrome

Disable / hide mic when:

- Stream mode is not go2rtc WebRTC (HLS / MSE / MJPEG / image / HA WebRTC without duplex)
- Privacy mode on (optional — open question)
- `navigator.mediaDevices` missing (insecure context)
- Permission denied after attempt

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| HTTP / bad cert → no `mediaDevices` | Mic dead on LAN Companion | Document HTTPS; detect and show “HTTPS required” |
| Stream uses RTSP-only go2rtc source | WebRTC works but no sendonly | Document `tapo://` requirement; probe/docs |
| Recvonly PC cannot add send later without renegotiation | PTT fails silently | Design renegotiation or create duplex-capable PC from the start when talkback enabled |
| Echo / feedback | User hears themselves / camera squeal | echoCancellation; optional duck/mute downlink while talking |
| Single backchannel | Second viewer steals talk | Accept; document; stop cleanly on PC failure |
| Tapo codec churn (PCMA/8000 vs PCMU/16000) | Uplink silent after FW update | go2rtc ≥ 1.9.13; re-probe after FW changes |
| Mic permission UX on iOS WebView | Confusing deny | Match Assist; clear error copy |
| Concurrent TTS media_player + live talk | One session wins / fails | Document mutual exclusion |
| Renegotiation flapping during PTZ / stream retry | Dropped talk or reconnect storm | Isolate talkback lifecycle from attach retry generation |

---

## Open questions

1. **Hold vs toggle:** Prefer press-and-hold only (PTZ-like), or also a latched toggle for hands-free?
2. **When to create send transceiver:** Always on go2rtc WebRTC connect (mic track muted until PTT), vs renegotiate only on first press?
3. **Auto-duck:** Mute or lower downlink volume while talking?
4. **Privacy lock:** Disable mic when privacy switch is on?
5. **Config surface:** Always-on when go2rtc WebRTC is active, or opt-in `talkback: true` / `go2rtc` required flag in card YAML?
6. **HA-native path later:** If `tapo_control` ever sets `two_way_audio`, should the card also support HA `camera/webrtc` duplex, or stay go2rtc-only?
7. **C260 probe on install:** Confirm go2rtc stream info shows `audio, sendonly` for the configured `tapo://` source before coding.
8. **TTS later?** Separate enhancement using AlexxIT `media_player` — not required for live mic.

---

## Suggested validation before coding

1. In go2rtc WebUI → stream probe for the C260 stream: confirm `sendonly` audio.
2. Open go2rtc **WebRTC** player (not MSE) over HTTPS; confirm stock mic button works to the C260 speaker.
3. Confirm Companion Assist mic works on the same HA URL (HTTPS smoke test).
4. Only then implement card PTT against that known-good stream.

---

## Out of scope (this plan)

- Implementation / PR
- TTS announcements to the camera speaker
- Multi-camera talkback
- Changing `tapo_control` itself
