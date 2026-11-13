# AGENTS.md — `src/`

Card implementation lives here. Read root [`AGENTS.md`](../AGENTS.md) first (including commit / release note categories).

## Conventions

- **Lit** custom element: `TapoC260Card` in `tapo-c260-card.ts` (`custom:tapo-c260-card`)
- Keep stream lifecycle in `stream.ts`; PTZ must not tear down / swap streams for quality
- Styles: industrial Concept C in `styles.ts` — phone-first ≥44px targets; pad audio is mute + vertical volume (downlink)
- `tapo_control` entities via `ptz.ts` / `device.ts`; do not add proprietary Tapo cloud calls
- `go2rtc` config is optional; WebRTC path today is **recvonly** audio/video

## Do not start here without an ask

- Mic / talkback / sendonly transceiver (see `docs/future/talkback-mic-plan.md`)
- Runtime SD↔HD switching
- Multi-camera dashboards
