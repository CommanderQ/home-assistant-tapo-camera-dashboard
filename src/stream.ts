// Light build is enough for single-camera live playlists and keeps the HACS bundle smaller.
import Hls from "hls.js/light";
import type { HassEntity, HomeAssistant } from "./types";

export type StreamMode = "webrtc" | "mse" | "hls" | "mjpeg" | "image" | "none";

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

export interface HttpStreamCandidate {
  src: string;
  /** MIME type hint for <source type="…"> */
  type: string;
  /** Preference label for fallbacks (mp4 before hls). */
  kind: "mp4" | "hls";
}

const PLAYBACK_TIMEOUT_MS = 8000;

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

/** Convert http(s) → ws(s); leave ws(s) unchanged. */
export function toWebSocketUrl(url: string): string {
  if (/^wss?:/i.test(url)) return url;
  if (/^https:/i.test(url)) return `wss:${url.slice(6)}`;
  if (/^http:/i.test(url)) return `ws:${url.slice(5)}`;
  return url;
}

/** Convert ws(s) → http(s) for deriving REST endpoints from a go2rtc WS URL. */
function toHttpUrl(url: string): string {
  if (/^https?:/i.test(url)) return url;
  if (/^wss:/i.test(url)) return `https:${url.slice(4)}`;
  if (/^ws:/i.test(url)) return `http:${url.slice(3)}`;
  return url;
}

/**
 * Resolve go2rtc WebSocket candidate URLs from config.
 *
 * Accepted `go2rtc` values:
 * - Absolute `ws(s)://` or `http(s)://` URL (http is converted to ws)
 * - Stream name → HA-proxied `/api/webrtc/ws?src=` and `/api/ws?src=`
 */
export function resolveGo2rtcWsUrls(
  hass: HomeAssistant | undefined,
  go2rtc?: string,
): string[] {
  if (!go2rtc) return [];
  const trimmed = go2rtc.trim();
  if (!trimmed) return [];

  if (/^(https?:|wss?:)/i.test(trimmed)) {
    return [toWebSocketUrl(trimmed)];
  }

  const base = hassBaseUrl(hass);
  if (!base) return [];

  const src = encodeURIComponent(trimmed);
  // Prefer AlexxIT WebRTC Camera proxy, then bare go2rtc /api/ws (addon / ingress).
  return [
    `${base}/api/webrtc/ws?src=${src}`,
    `${base}/api/ws?src=${src}`,
  ];
}

function go2rtcHttpApiBase(wsUrl: string): string | null {
  try {
    const http = new URL(toHttpUrl(wsUrl));
    const idx = http.pathname.indexOf("/api/");
    if (idx >= 0) {
      return `${http.origin}${http.pathname.slice(0, idx + 4)}`;
    }
    return `${http.origin}/api`;
  } catch {
    return null;
  }
}

function go2rtcSrcFromWs(wsUrl: string): string | null {
  try {
    return new URL(toHttpUrl(wsUrl)).searchParams.get("src");
  } catch {
    return null;
  }
}

/**
 * Resolve how to display live video for a camera entity / optional go2rtc override.
 * Actual attach prefers WebRTC, then multi-<source> HTTP (mp4/hls), then still.
 */
export function resolveStream(
  hass: HomeAssistant | undefined,
  cameraEntityId: string | undefined,
  go2rtc?: string,
): ResolvedStream {
  const ws = resolveGo2rtcWsUrls(hass, go2rtc)[0];
  if (ws) {
    return { mode: "webrtc", url: ws, entityId: cameraEntityId };
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

function waitForVideoData(
  video: HTMLVideoElement,
  timeoutMs = PLAYBACK_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("playing", onReady);
      video.removeEventListener("error", onError);
      resolve(ok);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
    video.addEventListener("error", onError);
  });
}

function clearVideoSources(video: HTMLVideoElement): void {
  video.querySelectorAll("source").forEach((el) => el.remove());
  video.removeAttribute("src");
  video.srcObject = null;
}

function openGo2rtcSocket(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("go2rtc WebSocket timeout"));
    }, PLAYBACK_TIMEOUT_MS);
    ws.addEventListener("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("go2rtc WebSocket error"));
    });
  });
}

async function attachGo2rtcWebRtc(
  video: HTMLVideoElement,
  wsUrl: string,
): Promise<StreamHandle | null> {
  if (typeof RTCPeerConnection === "undefined") return null;

  let ws: WebSocket | undefined;
  let pc: RTCPeerConnection | undefined;

  const cleanup = () => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = undefined;
    try {
      pc?.getReceivers().forEach((r) => r.track?.stop());
      pc?.close();
    } catch {
      /* ignore */
    }
    pc = undefined;
    if (video.srcObject) video.srcObject = null;
  };

  try {
    ws = await openGo2rtcSocket(wsUrl);
    pc = new RTCPeerConnection({
      bundlePolicy: "max-bundle",
      iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
      ],
    });

    const remoteStream = new MediaStream();
    clearVideoSources(video);
    video.srcObject = remoteStream;

    pc.addEventListener("track", (ev) => {
      remoteStream.addTrack(ev.track);
      void video.play().catch(() => undefined);
    });

    pc.addEventListener("icecandidate", (ev) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const candidate = ev.candidate ? ev.candidate.toJSON().candidate : "";
      ws.send(JSON.stringify({ type: "webrtc/candidate", value: candidate }));
    });

    const answerReady = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("go2rtc WebRTC answer timeout")),
        PLAYBACK_TIMEOUT_MS,
      );
      ws!.addEventListener("message", (ev) => {
        if (typeof ev.data !== "string") return;
        let msg: { type?: string; value?: string };
        try {
          msg = JSON.parse(ev.data) as { type?: string; value?: string };
        } catch {
          return;
        }
        if (msg.type === "webrtc/answer" && msg.value && pc) {
          void pc
            .setRemoteDescription({ type: "answer", sdp: msg.value })
            .then(() => {
              clearTimeout(timer);
              resolve();
            })
            .catch(reject);
        } else if (msg.type === "webrtc/candidate" && msg.value && pc) {
          void pc
            .addIceCandidate({ candidate: msg.value, sdpMid: "0" })
            .catch(() => undefined);
        } else if (
          msg.type === "error" &&
          typeof msg.value === "string" &&
          msg.value.includes("webrtc")
        ) {
          clearTimeout(timer);
          reject(new Error(msg.value));
        }
      });
    });

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "webrtc/offer", value: offer.sdp }));

    await answerReady;
    const ok = await waitForVideoData(video);
    if (!ok) {
      cleanup();
      return null;
    }

    return { mode: "webrtc", stop: cleanup };
  } catch {
    cleanup();
    return null;
  }
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
    clearVideoSources(video);
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

    const ok = await waitForVideoData(video);
    if (!ok) {
      cleanup();
      return null;
    }

    return { mode: "webrtc", stop: cleanup };
  } catch {
    cleanup();
    return null;
  }
}

/**
 * Collect HTTP stream URLs suitable for <source> children.
 * Order: go2rtc progressive MP4 (MSE-friendly), then HLS playlists.
 */
export async function collectHttpStreamCandidates(options: {
  hass: HomeAssistant | undefined;
  cameraEntityId: string | undefined;
  go2rtc?: string;
}): Promise<HttpStreamCandidate[]> {
  const { hass, cameraEntityId, go2rtc } = options;
  const out: HttpStreamCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: HttpStreamCandidate) => {
    if (!candidate.src || seen.has(candidate.src)) return;
    seen.add(candidate.src);
    out.push(candidate);
  };

  for (const wsUrl of resolveGo2rtcWsUrls(hass, go2rtc)) {
    const api = go2rtcHttpApiBase(wsUrl);
    const src = go2rtcSrcFromWs(wsUrl);
    if (!api || !src) continue;
    const q = encodeURIComponent(src);
    push({
      src: `${api}/stream.mp4?src=${q}`,
      type: "video/mp4",
      kind: "mp4",
    });
    push({
      src: `${api}/stream.m3u8?src=${q}`,
      type: "application/vnd.apple.mpegurl",
      kind: "hls",
    });
  }

  if (hass && cameraEntityId) {
    const hlsUrl = await fetchHlsUrl(hass, cameraEntityId);
    if (hlsUrl) {
      push({
        src: hlsUrl,
        type: "application/vnd.apple.mpegurl",
        kind: "hls",
      });
    }
  }

  // Prefer mp4 before hls so Chrome can pick a playable source without native HLS.
  out.sort((a, b) => {
    if (a.kind === b.kind) return 0;
    return a.kind === "mp4" ? -1 : 1;
  });

  return out;
}

/**
 * Attach multiple HTTP candidates as <source> children and let the browser choose.
 * Returns null if nothing becomes playable (e.g. Chrome with only HLS sources).
 */
async function attachMultiSource(
  video: HTMLVideoElement,
  candidates: HttpStreamCandidate[],
): Promise<StreamHandle | null> {
  if (!candidates.length) return null;

  // If the only options are HLS and this browser can't play mpegurl, skip
  // assigning them as <source> — Chrome logs "No decoders for … mpegurl".
  const playable = candidates.filter((c) => {
    if (c.kind === "hls") return canPlayHlsNatively(video);
    return video.canPlayType(c.type) !== "" || c.kind === "mp4";
  });
  if (!playable.length) return null;

  clearVideoSources(video);
  for (const c of playable) {
    const source = document.createElement("source");
    source.src = c.src;
    source.type = c.type;
    video.appendChild(source);
  }
  video.load();
  void video.play().catch(() => undefined);

  const ok = await waitForVideoData(video);
  if (!ok) {
    clearVideoSources(video);
    video.load();
    return null;
  }

  const usedHls = playable.some((c) => c.kind === "hls") &&
    !playable.some((c) => c.kind === "mp4");
  return {
    mode: usedHls ? "hls" : "mse",
    stop: () => {
      video.pause();
      clearVideoSources(video);
      video.load();
    },
  };
}

/** hls.js path when the browser cannot pick an HLS <source> natively (Chrome). */
async function attachHlsJs(
  video: HTMLVideoElement,
  hlsUrls: string[],
): Promise<StreamHandle | null> {
  if (!hlsUrls.length || !Hls.isSupported()) return null;

  clearVideoSources(video);

  for (const hlsUrl of hlsUrls) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    void video.play().catch(() => undefined);

    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), PLAYBACK_TIMEOUT_MS);
      const succeed = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const fail = () => {
        clearTimeout(timer);
        resolve(false);
      };
      hls.on(Hls.Events.MANIFEST_PARSED, succeed);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) fail();
      });
      video.addEventListener("loadeddata", succeed, { once: true });
      video.addEventListener("error", fail, { once: true });
    });

    if (ok) {
      return {
        mode: "hls",
        stop: () => {
          hls.destroy();
          video.pause();
          clearVideoSources(video);
          video.load();
        },
      };
    }

    hls.destroy();
    clearVideoSources(video);
    video.load();
  }

  return null;
}

/**
 * Attach the best available live stream to a video (and optional img for MJPEG).
 *
 * Order:
 * 1. WebRTC (go2rtc WS / HA camera) — cannot use <source>
 * 2. Multi-<source> HTTP candidates (go2rtc MP4 / HLS, HA HLS) — browser picks
 * 3. hls.js for HLS URLs when native <source> selection fails (Chrome)
 * 4. MJPEG → still / poster
 */
export async function attachLiveStream(options: {
  hass: HomeAssistant | undefined;
  video: HTMLVideoElement | null | undefined;
  img?: HTMLImageElement | null | undefined;
  cameraEntityId: string | undefined;
  go2rtc?: string;
}): Promise<StreamHandle> {
  const { hass, video, img, cameraEntityId, go2rtc } = options;

  const stopImg = () => {
    if (img) img.removeAttribute("src");
  };
  const stopVideo = () => {
    if (!video) return;
    video.pause();
    clearVideoSources(video);
    video.load();
  };

  if (!video && !img) {
    return { mode: "none", stop: () => undefined };
  }

  const wsUrls = resolveGo2rtcWsUrls(hass, go2rtc);

  // 1) WebRTC preferred (not expressible as <source>)
  if (video) {
    for (const wsUrl of wsUrls) {
      const handle = await attachGo2rtcWebRtc(video, wsUrl);
      if (handle) {
        stopImg();
        return handle;
      }
      stopVideo();
    }
  }

  if (
    video &&
    hass &&
    cameraEntityId &&
    typeof RTCPeerConnection !== "undefined"
  ) {
    const entity = cameraEntity(hass, cameraEntityId);
    const streamType = frontendStreamType(entity);
    if (streamType === "webrtc" || !!go2rtc || supportsStream(entity)) {
      const handle = await attachHaWebRtc(hass, video, cameraEntityId);
      if (handle) {
        stopImg();
        return handle;
      }
      stopVideo();
    }
  }

  // 2) One <video> + multiple <source> children (mp4 / hls)
  const candidates = video
    ? await collectHttpStreamCandidates({ hass, cameraEntityId, go2rtc })
    : [];

  if (video && candidates.length) {
    const multi = await attachMultiSource(video, candidates);
    if (multi) {
      stopImg();
      return multi;
    }
    stopVideo();

    // 3) Chrome / non-Safari: hls.js for HLS candidates the browser skipped
    const hlsUrls = candidates.filter((c) => c.kind === "hls").map((c) => c.src);
    const hlsHandle = await attachHlsJs(video, hlsUrls);
    if (hlsHandle) {
      stopImg();
      return hlsHandle;
    }
    stopVideo();
  }

  if (!cameraEntityId) {
    stopImg();
    stopVideo();
    return { mode: "none", stop: () => undefined };
  }

  // 4) MJPEG live multipart
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

  // 5) Still / poster
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
  const handle = await attachGo2rtcWebRtc(video, toWebSocketUrl(streamUrl));
  return !!handle;
}
