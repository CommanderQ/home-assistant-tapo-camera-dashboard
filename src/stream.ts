// Light build is enough for single-camera live playlists and keeps the HACS bundle smaller.
import Hls from "hls.js/light";
import type { HassEntity, HomeAssistant } from "./types";

export type StreamMode = "webrtc" | "hls" | "mjpeg" | "image" | "none";

export interface ResolvedStream {
  mode: StreamMode;
  /** Active camera entity used for this stream. */
  entityId?: string;
  /** Absolute or path URL for HLS / MJPEG / image / go2rtc ws. */
  url?: string;
}

export interface StreamHandle {
  mode: StreamMode;
  stop: () => void;
}

function hassUrl(hass: HomeAssistant | undefined, path: string): string {
  if (/^(https?:|wss?:|data:)/i.test(path)) return path;
  const base = hassBaseUrl(hass);
  if (!base) return path;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export function hassBaseUrl(hass: HomeAssistant | undefined): string | null {
  const fromAuth = hass?.auth?.data?.hassUrl;
  if (fromAuth) return fromAuth.replace(/\/$/, "");
  if (typeof hass?.hassUrl === "function") {
    try {
      const u = hass.hassUrl("/");
      if (typeof u === "string" && u.length) {
        return u.replace(/\/$/, "");
      }
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    if (
      window.location.port === "5173" ||
      window.location.pathname.includes("demo")
    ) {
      return null;
    }
    return window.location.origin;
  }
  return null;
}

export function isLikelyImageUrl(url: string): boolean {
  return (
    /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) ||
    /\/api\/camera_proxy\//i.test(url) ||
    url.startsWith("data:image/")
  );
}

export function isMjpegStreamUrl(url: string): boolean {
  return /\/api\/camera_proxy_stream\//i.test(url);
}

function cameraEntity(
  hass: HomeAssistant | undefined,
  entityId: string | undefined,
): HassEntity | undefined {
  if (!hass || !entityId) return undefined;
  return hass.states[entityId];
}

function accessToken(entity: HassEntity | undefined): string | undefined {
  const token = entity?.attributes?.access_token;
  return typeof token === "string" && token ? token : undefined;
}

function computeMjpegUrl(
  hass: HomeAssistant | undefined,
  entityId: string,
): string | null {
  const entity = cameraEntity(hass, entityId);
  const token = accessToken(entity);
  if (!token) return null;
  return hassUrl(
    hass,
    `/api/camera_proxy_stream/${entityId}?token=${encodeURIComponent(token)}`,
  );
}

function computeSnapshotUrl(
  hass: HomeAssistant | undefined,
  entityId: string,
): string | null {
  const entity = cameraEntity(hass, entityId);
  if (!entity) return null;
  const picture = entity.attributes.entity_picture;
  if (typeof picture === "string" && picture) {
    return hassUrl(hass, picture);
  }
  const token = accessToken(entity);
  if (!token) return null;
  return hassUrl(
    hass,
    `/api/camera_proxy/${entityId}?token=${encodeURIComponent(token)}`,
  );
}

function frontendStreamType(
  entity: HassEntity | undefined,
): "hls" | "webrtc" | undefined {
  const t = entity?.attributes?.frontend_stream_type;
  if (t === "hls" || t === "webrtc") return t;
  return undefined;
}

function supportsStream(entity: HassEntity | undefined): boolean {
  // CameraEntityFeature.STREAM = 2
  const features = Number(entity?.attributes?.supported_features ?? 0);
  return Number.isFinite(features) && (features & 2) === 2;
}

/**
 * Pick which camera entity to show: HD while interacting when configured,
 * otherwise the primary (usually SD) camera.
 */
export function activeCameraEntity(
  config: { camera: string; camera_hd?: string } | undefined,
  preferHd: boolean,
): string | undefined {
  if (!config?.camera) return undefined;
  if (preferHd && config.camera_hd) return config.camera_hd;
  return config.camera;
}

/**
 * Resolve preferred live mode for a camera entity / optional go2rtc override.
 * Prefers live modes over still snapshots.
 */
export function resolveStream(
  hass: HomeAssistant | undefined,
  cameraEntityId: string | undefined,
  go2rtc?: string,
): ResolvedStream {
  if (go2rtc) {
    if (/^(https?:|wss?:)/i.test(go2rtc)) {
      return { mode: "webrtc", url: go2rtc, entityId: cameraEntityId };
    }
    const base = hassBaseUrl(hass);
    if (base) {
      return {
        mode: "webrtc",
        entityId: cameraEntityId,
        url: `${base}/api/webrtc/ws?src=${encodeURIComponent(go2rtc)}`,
      };
    }
  }

  if (!hass || !cameraEntityId) {
    return { mode: "none" };
  }

  const entity = cameraEntity(hass, cameraEntityId);
  if (!entity) {
    return { mode: "none", entityId: cameraEntityId };
  }

  const streamType = frontendStreamType(entity);
  if (streamType === "webrtc" && typeof RTCPeerConnection !== "undefined") {
    return { mode: "webrtc", entityId: cameraEntityId };
  }
  // STREAM feature or HLS type → try live (WebRTC/HLS/MJPEG), not snapshot.
  if (streamType === "hls" || supportsStream(entity)) {
    return { mode: "hls", entityId: cameraEntityId };
  }

  const mjpeg = computeMjpegUrl(hass, cameraEntityId);
  if (mjpeg) {
    return { mode: "mjpeg", entityId: cameraEntityId, url: mjpeg };
  }

  const snapshot = computeSnapshotUrl(hass, cameraEntityId);
  if (snapshot) {
    return { mode: "image", entityId: cameraEntityId, url: snapshot };
  }

  return { mode: "none", entityId: cameraEntityId };
}

/** @deprecated Prefer resolveStream — kept for call sites that only need a URL hint. */
export function resolveStreamUrl(
  hass: HomeAssistant | undefined,
  cameraEntity?: string,
  go2rtc?: string,
): string | null {
  const resolved = resolveStream(hass, cameraEntity, go2rtc);
  return resolved.url ?? null;
}

async function fetchHlsUrl(
  hass: HomeAssistant,
  entityId: string,
): Promise<string | null> {
  try {
    if (typeof hass.callWS === "function") {
      const stream = await hass.callWS<{ url: string }>({
        type: "camera/stream",
        entity_id: entityId,
      });
      if (stream?.url) return hassUrl(hass, stream.url);
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Chrome/Edge often report canPlayType("…mpegurl") as "maybe" but cannot decode
 * HLS natively — that produces the console error the user saw. Prefer hls.js;
 * only use the video element alone when MSE/hls.js is unavailable (typical Safari).
 */
function canUseNativeHlsOnly(video: HTMLVideoElement): boolean {
  if (Hls.isSupported()) return false;
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

const WEBRTC_READY_MS = 8000;

async function attachHaWebRtc(
  hass: HomeAssistant,
  video: HTMLVideoElement,
  entityId: string,
): Promise<StreamHandle | null> {
  if (!hass.connection?.subscribeMessage || typeof RTCPeerConnection === "undefined") {
    return null;
  }

  let pc: RTCPeerConnection | undefined;
  let unsub: (() => void) | undefined;
  let sessionId: string | undefined;
  const pendingCandidates: RTCIceCandidateInit[] = [];

  const cleanup = () => {
    try {
      unsub?.();
    } catch {
      /* ignore */
    }
    unsub = undefined;
    try {
      pc?.getReceivers().forEach((r) => r.track?.stop());
      pc?.close();
    } catch {
      /* ignore */
    }
    pc = undefined;
    if (video.srcObject) {
      video.srcObject = null;
    }
  };

  try {
    let clientConfig: RTCConfiguration = {};
    try {
      if (typeof hass.callWS === "function") {
        const cfg = await hass.callWS<{ configuration?: RTCConfiguration }>({
          type: "camera/webrtc/get_client_config",
          entity_id: entityId,
        });
        if (cfg?.configuration) clientConfig = cfg.configuration;
      }
    } catch {
      /* Camera may be HLS-only; WebRTC config fails — try offer anyway / fall through. */
    }

    pc = new RTCPeerConnection(clientConfig);
    const remoteStream = new MediaStream();
    video.srcObject = remoteStream;

    const gotTrack = new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), WEBRTC_READY_MS);
      pc!.addEventListener("track", (ev) => {
        remoteStream.addTrack(ev.track);
        void video.play().catch(() => undefined);
        window.clearTimeout(timer);
        resolve(true);
      });
      pc!.addEventListener("connectionstatechange", () => {
        if (
          pc?.connectionState === "failed" ||
          pc?.connectionState === "closed" ||
          pc?.connectionState === "disconnected"
        ) {
          window.clearTimeout(timer);
          resolve(false);
        }
      });
    });

    pc.addEventListener("icecandidate", (ev) => {
      if (!ev.candidate || !sessionId || !hass.callWS) return;
      void hass
        .callWS({
          type: "camera/webrtc/candidate",
          entity_id: entityId,
          session_id: sessionId,
          candidate: ev.candidate.toJSON(),
        })
        .catch(() => undefined);
    });

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    unsub = await hass.connection.subscribeMessage(
      (event: unknown) => {
        const msg = event as {
          type?: string;
          session_id?: string;
          answer?: string;
          candidate?: RTCIceCandidateInit;
          code?: string;
          message?: string;
        };
        if (!pc) return;
        if (msg.type === "session" && msg.session_id) {
          sessionId = msg.session_id;
          for (const c of pendingCandidates) {
            void hass
              .callWS?.({
                type: "camera/webrtc/candidate",
                entity_id: entityId,
                session_id: sessionId,
                candidate: c,
              })
              .catch(() => undefined);
          }
          pendingCandidates.length = 0;
          return;
        }
        if (msg.type === "answer" && msg.answer) {
          void pc
            .setRemoteDescription({ type: "answer", sdp: msg.answer })
            .catch(() => undefined);
          return;
        }
        if (msg.type === "candidate" && msg.candidate) {
          void pc.addIceCandidate(msg.candidate).catch(() => undefined);
          return;
        }
        if (msg.type === "error") {
          cleanup();
        }
      },
      {
        type: "camera/webrtc/offer",
        entity_id: entityId,
        offer: offer.sdp,
      },
    );

    const ready = await gotTrack;
    if (!ready) {
      cleanup();
      return null;
    }

    return { mode: "webrtc", stop: cleanup };
  } catch {
    cleanup();
    return null;
  }
}

function attachHlsJs(
  video: HTMLVideoElement,
  url: string,
): StreamHandle | null {
  if (!Hls.isSupported()) return null;

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 30,
  });

  const stop = () => {
    try {
      hls.destroy();
    } catch {
      /* ignore */
    }
    video.pause();
    video.removeAttribute("src");
    video.srcObject = null;
    video.load();
  };

  hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean; type: string }) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
      return;
    }
    stop();
  });

  hls.loadSource(url);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    void video.play().catch(() => undefined);
  });

  return { mode: "hls", stop };
}

function attachNativeHls(
  video: HTMLVideoElement,
  url: string,
): StreamHandle {
  video.srcObject = null;
  video.src = url;
  void video.play().catch(() => undefined);
  return {
    mode: "hls",
    stop: () => {
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
      video.load();
    },
  };
}

/**
 * Attach the best available live stream to a video (and optional img for MJPEG).
 * Returns a handle whose stop() tears down peers / clears media.
 */
export async function attachLiveStream(options: {
  hass: HomeAssistant | undefined;
  video: HTMLVideoElement | null | undefined;
  img?: HTMLImageElement | null | undefined;
  cameraEntityId: string | undefined;
  go2rtc?: string;
}): Promise<StreamHandle> {
  const { hass, video, img, cameraEntityId, go2rtc } = options;
  const resolved = resolveStream(hass, cameraEntityId, go2rtc);

  const stopImg = () => {
    if (img) img.removeAttribute("src");
  };
  const stopVideo = () => {
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.srcObject = null;
    video.load();
  };

  if (!hass || !cameraEntityId || resolved.mode === "none") {
    stopImg();
    stopVideo();
    return { mode: "none", stop: () => undefined };
  }

  const entity = cameraEntity(hass, cameraEntityId);
  const shouldTryLive =
    resolved.mode === "webrtc" ||
    resolved.mode === "hls" ||
    !!go2rtc ||
    supportsStream(entity);

  // 1) WebRTC — try for any live-capable camera (HA go2rtc can serve HLS cams too).
  if (video && shouldTryLive && typeof RTCPeerConnection !== "undefined") {
    const handle = await attachHaWebRtc(hass, video, cameraEntityId);
    if (handle) {
      stopImg();
      return handle;
    }
  }

  // 2) HLS via hls.js (Chrome/Edge/Firefox) or native Safari only.
  if (video && shouldTryLive) {
    const hlsUrl = await fetchHlsUrl(hass, cameraEntityId);
    if (hlsUrl) {
      const viaJs = attachHlsJs(video, hlsUrl);
      if (viaJs) {
        stopImg();
        return viaJs;
      }
      if (canUseNativeHlsOnly(video)) {
        stopImg();
        return attachNativeHls(video, hlsUrl);
      }
      // Do NOT assign m3u8 to video.src on Chromium — causes:
      // "No decoders for requested formats: application/vnd.apple.mpegurl"
    }
  }

  // 3) MJPEG live multipart proxy.
  const mjpeg = computeMjpegUrl(hass, cameraEntityId);
  if (mjpeg && img) {
    stopVideo();
    img.src = mjpeg;
    return {
      mode: "mjpeg",
      stop: () => {
        stopImg();
      },
    };
  }

  // 4) Snapshot last resort.
  const snapshot = computeSnapshotUrl(hass, cameraEntityId);
  if (snapshot && img) {
    stopVideo();
    img.src = snapshot;
    return {
      mode: "image",
      stop: () => {
        stopImg();
      },
    };
  }

  stopImg();
  stopVideo();
  return { mode: "none", stop: () => undefined };
}

/**
 * Attempt a minimal WebRTC offer handshake against go2rtc / HA.
 * @deprecated Use attachLiveStream.
 */
export async function tryAttachWebRtc(
  _video: HTMLVideoElement,
  streamUrl: string | null,
): Promise<boolean> {
  if (!streamUrl) return false;
  return false;
}
