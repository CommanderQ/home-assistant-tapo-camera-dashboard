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
 * Resolve how to display live video for a camera entity / optional go2rtc override.
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

function canPlayHlsNatively(video: HTMLVideoElement): boolean {
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

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
      /* optional */
    }

    pc = new RTCPeerConnection(clientConfig);
    const remoteStream = new MediaStream();
    video.srcObject = remoteStream;

    pc.addEventListener("track", (ev) => {
      remoteStream.addTrack(ev.track);
      void video.play().catch(() => undefined);
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
        }
      },
      {
        type: "camera/webrtc/offer",
        entity_id: entityId,
        offer: offer.sdp,
      },
    );

    return { mode: "webrtc", stop: cleanup };
  } catch {
    cleanup();
    return null;
  }
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

  // Prefer HA camera WebRTC (also covers go2rtc-backed camera entities).
  if (
    video &&
    cameraEntityId &&
    typeof RTCPeerConnection !== "undefined" &&
    (resolved.mode === "webrtc" || !!go2rtc)
  ) {
    const handle = await attachHaWebRtc(hass, video, cameraEntityId);
    if (handle) {
      stopImg();
      return handle;
    }
    // Fall through to HLS / MJPEG
  }

  if ((resolved.mode === "hls" || resolved.mode === "webrtc") && video) {
    const hlsUrl = await fetchHlsUrl(hass, cameraEntityId);
    if (hlsUrl && canPlayHlsNatively(video)) {
      stopImg();
      video.srcObject = null;
      video.src = hlsUrl;
      void video.play().catch(() => undefined);
      return {
        mode: "hls",
        stop: () => {
          stopVideo();
        },
      };
    }
  }

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
  video: HTMLVideoElement,
  streamUrl: string | null,
): Promise<boolean> {
  if (!streamUrl || !video) return false;
  return false;
}
