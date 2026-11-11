import type { Orientation, PtzDirection } from "./types";

/** C260 approximate travel; dead-reckon until calibrate/preset. */
export const YAW_MAX = 180;
export const PITCH_MAX = 58;
export const DEFAULT_YAW_STEP = 15;
export const DEFAULT_PITCH_STEP = 10;

export function createOrientation(known = false): Orientation {
  return { yaw: 0, pitch: 0, known };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function applyNudge(
  current: Orientation,
  direction: PtzDirection,
  yawStep = DEFAULT_YAW_STEP,
  pitchStep = DEFAULT_PITCH_STEP,
): Orientation {
  const next = { ...current, known: true };
  switch (direction) {
    case "left":
      next.yaw = clamp(current.yaw - yawStep, -YAW_MAX, YAW_MAX);
      break;
    case "right":
      next.yaw = clamp(current.yaw + yawStep, -YAW_MAX, YAW_MAX);
      break;
    case "up":
      next.pitch = clamp(current.pitch + pitchStep, -PITCH_MAX, PITCH_MAX);
      break;
    case "down":
      next.pitch = clamp(current.pitch - pitchStep, -PITCH_MAX, PITCH_MAX);
      break;
  }
  return next;
}

export function resetOrientation(): Orientation {
  return { yaw: 0, pitch: 0, known: true };
}

export function formatAngles(o: Orientation): string {
  const yaw = `${o.yaw >= 0 ? "+" : ""}${Math.round(o.yaw)}°`;
  const pitch = `${o.pitch >= 0 ? "+" : ""}${Math.round(o.pitch)}°`;
  return `Yaw ${yaw} · Pitch ${pitch}`;
}

export function cameraTransform(o: Orientation): string {
  return `rotateX(${-o.pitch}deg) rotateY(${o.yaw}deg)`;
}
