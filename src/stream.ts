import type { HomeAssistant } from "./types";

/**
 * Resolve a stream URL for go2rtc / WebRTC wiring.
 * Returns null when unavailable so the card can show a placeholder.
 *
 * Strategies (v1 scaffold):
 * 1. Explicit `go2rtc` absolute URL (ws/http)
 * 2. Explicit go2rtc stream name → `/api/webrtc/ws?src=…` relative to HA
 * 3. Camera entity entity_picture / frontend stream (still image fallback)
 */
export function resolveStreamUrl(
  hass: HomeAssistant | undefined,
  cameraEntity?: string,
  go2rtc?: string,
): string | null {
  if (go2rtc) {
    if (/^(https?:|wss?:)/i.test(go2rtc)) {
      return go2rtc;
    }
    const base = hassBaseUrl(hass);
    if (!base) return null;
    // HA go2rtc WebRTC websocket path (AlexxIT / built-in go2rtc)
    return `${base}/api/webrtc/ws?src=${encodeURIComponent(go2rtc)}`;
  }

  if (!hass || !cameraEntity) return null;

  const entity = hass.states[cameraEntity];
  if (!entity) return null;

  const attrs = entity.attributes;
  const entityPicture =
    typeof attrs.entity_picture === "string" ? attrs.entity_picture : null;
  if (entityPicture) {
    if (/^(https?:|data:)/i.test(entityPicture)) return entityPicture;
    const base = hassBaseUrl(hass);
    return base ? `${base}${entityPicture}` : entityPicture;
  }

  // Signal that a live stream *could* be wired via camera entity + go2rtc later
  return null;
}

export function hassBaseUrl(hass: HomeAssistant | undefined): string | null {
  const fromAuth = hass?.auth?.data?.hassUrl;
  if (fromAuth) return fromAuth.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    // Demo / local Vite has no HA — treat as unavailable unless absolute go2rtc set
    if (window.location.port === "5173" || window.location.pathname.includes("demo")) {
      return null;
    }
  }
  return null;
}

/**
 * Attempt a minimal WebRTC offer handshake against go2rtc.
 * Scaffold stub: returns false so UI keeps the placeholder until HA is present.
 * Real wiring lands in a follow-up once validated against a live go2rtc instance.
 */
export async function tryAttachWebRtc(
  _video: HTMLVideoElement,
  streamUrl: string | null,
): Promise<boolean> {
  if (!streamUrl) return false;
  // Full peer connection + SDP exchange is intentionally deferred;
  // returning false keeps the industrial placeholder visible in demo / missing go2rtc.
  return false;
}

export function isLikelyImageUrl(url: string): boolean {
  return (
    /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) ||
    url.includes("/camera_proxy/") ||
    url.startsWith("data:image/")
  );
}
