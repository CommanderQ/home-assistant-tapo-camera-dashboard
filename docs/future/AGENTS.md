# AGENTS.md — `docs/future/`

Plans in this folder are **research / deferred work**. They are not a backlog to implement by default.

## Rules

1. **Do not implement** a future plan unless the user (or an explicit task) asks for that feature.
2. Prefer updating the plan document when research changes; keep **Status** accurate (`deferred`, `research only`, etc.).
3. When implementing later, open a normal feature branch/PR; still follow root [`AGENTS.md`](../../AGENTS.md) (especially: categorized commit bodies, and no accidental `package.json` version bump).
4. Talkback / mic uplink lives in [`talkback-mic-plan.md`](./talkback-mic-plan.md) — mute/volume in the card today remain downlink-only.
5. Recorded SD / Media Source history lives in [`recorded-video-history-plan.md`](./recorded-video-history-plan.md) — live stream only for now; no in-card history UI yet.
6. Highest-quality pinch-zoom layout lives in [`zoom-quality-proposal.md`](./zoom-quality-proposal.md) — current viewport crop stays as-is until that plan is explicitly implemented.
