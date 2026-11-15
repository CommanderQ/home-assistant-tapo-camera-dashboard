import type { HomeAssistant, TapoC260CardConfig } from "./types";

function entityObjectId(entityId: string): string {
  const dot = entityId.indexOf(".");
  return dot >= 0 ? entityId.slice(dot + 1) : entityId;
}

function endsWithObjectId(entityId: string, suffix: string): boolean {
  return entityObjectId(entityId).endsWith(suffix);
}

function findBySuffix(entityIds: string[], suffix: string): string | undefined {
  return entityIds.find((id) => endsWithObjectId(id, suffix));
}

function findBySuffixes(
  entityIds: string[],
  suffixes: string[],
): string | undefined {
  for (const suffix of suffixes) {
    const hit = findBySuffix(entityIds, suffix);
    if (hit) return hit;
  }
  return undefined;
}

/** List entity_ids belonging to a device (from hass.entities registry map). */
export function entitiesForDevice(
  hass: HomeAssistant | undefined,
  deviceId: string | undefined,
): string[] {
  if (!hass?.entities || !deviceId) return [];
  return Object.values(hass.entities)
    .filter((entry) => entry?.device_id === deviceId && entry.entity_id)
    .map((entry) => entry.entity_id);
}

/**
 * tapo_control names cameras like:
 *   camera.<alias>_hd_stream / _sd_stream
 *   camera.<alias>_hd_stream_direct / _sd_stream_direct
 *   (older / slug variants) …_hd / …_sd
 * Matching only `endsWith("_hd")` misses `_hd_stream` and mis-assigns HD as SD.
 */
export function isDirectCameraEntity(entityId: string): boolean {
  return /(?:^|_)direct(?:_|$)/i.test(entityObjectId(entityId));
}

export function isTelephotoCameraEntity(entityId: string): boolean {
  return /telephoto/i.test(entityObjectId(entityId));
}

/** Main (non-telephoto) HD: stream1 / “HD Stream”. */
export function isHdCameraEntity(entityId: string): boolean {
  const id = entityObjectId(entityId).toLowerCase();
  if (isTelephotoCameraEntity(entityId)) return false;
  return /(?:^|_)hd(?:_stream)?(?:_direct)?$/.test(id);
}

/** Main (non-telephoto) SD: stream2 / “SD Stream”. */
export function isSdCameraEntity(entityId: string): boolean {
  const id = entityObjectId(entityId).toLowerCase();
  if (isTelephotoCameraEntity(entityId)) return false;
  return /(?:^|_)sd(?:_stream)?(?:_direct)?$/.test(id);
}

/** Prefer RTSP entities over “(Direct)” when both exist. */
export function preferNonDirectCamera(
  entityIds: string[],
): string | undefined {
  if (!entityIds.length) return undefined;
  const nonDirect = entityIds.filter((id) => !isDirectCameraEntity(id));
  return nonDirect[0] ?? entityIds[0];
}

/**
 * Map a tapo_control device's entities onto card config fields.
 * Prefers conventional `_hd_stream` / `_sd_stream` (and `_hd` / `_sd`) suffixes.
 */
export function resolveConfigFromDevice(
  hass: HomeAssistant | undefined,
  deviceId: string,
  base: Partial<TapoC260CardConfig> = {},
): Partial<TapoC260CardConfig> {
  const ids = entitiesForDevice(hass, deviceId);
  if (!ids.length) {
    return { ...base, device: deviceId };
  }

  const cameras = ids.filter((id) => id.startsWith("camera."));
  const buttons = ids.filter((id) => id.startsWith("button."));
  const numbers = ids.filter((id) => id.startsWith("number."));
  const switches = ids.filter((id) => id.startsWith("switch."));
  const selects = ids.filter((id) => id.startsWith("select."));

  const hdCandidates = cameras.filter(isHdCameraEntity);
  const sdCandidates = cameras.filter(isSdCameraEntity);

  const cameraHd = preferNonDirectCamera(hdCandidates);
  const cameraSd =
    preferNonDirectCamera(sdCandidates) ??
    // Last resort: only one unlabeled camera on the device.
    (cameras.length === 1 ? cameras[0] : undefined);

  const ptz = {
    up: findBySuffixes(buttons, ["_move_up"]) ?? base.ptz?.up ?? "",
    down: findBySuffixes(buttons, ["_move_down"]) ?? base.ptz?.down ?? "",
    left: findBySuffixes(buttons, ["_move_left"]) ?? base.ptz?.left ?? "",
    right: findBySuffixes(buttons, ["_move_right"]) ?? base.ptz?.right ?? "",
    angle:
      findBySuffixes(numbers, ["_movement_angle"]) ?? base.ptz?.angle,
    calibrate:
      findBySuffixes(buttons, ["_calibrate"]) ?? base.ptz?.calibrate,
    preset:
      findBySuffixes(selects, ["_move_to_preset"]) ?? base.ptz?.preset,
  };

  const privacy =
    findBySuffixes(switches, ["_privacy"]) ?? base.privacy;

  const next: Partial<TapoC260CardConfig> = {
    ...base,
    device: deviceId,
    // SD field is required on the card; fall back to HD only if no SD exists.
    camera: cameraSd || cameraHd || base.camera || "",
    ptz,
  };

  if (cameraHd) next.camera_hd = cameraHd;
  else delete next.camera_hd;

  if (privacy) next.privacy = privacy;
  else delete next.privacy;

  // Drop empty optional ptz keys
  if (!next.ptz?.angle) delete next.ptz!.angle;
  if (!next.ptz?.calibrate) delete next.ptz!.calibrate;
  if (!next.ptz?.preset) delete next.ptz!.preset;

  return next;
}

/** Merge device-resolved entities into a config when a device id is present. */
export function applyDeviceResolution(
  hass: HomeAssistant | undefined,
  config: TapoC260CardConfig,
): TapoC260CardConfig {
  if (!config.device || !hass?.entities) return config;
  const resolved = resolveConfigFromDevice(hass, config.device, config);
  return {
    ...config,
    ...resolved,
    ptz: {
      ...config.ptz,
      ...resolved.ptz,
    },
  } as TapoC260CardConfig;
}
