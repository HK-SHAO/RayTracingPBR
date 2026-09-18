export const STICK_RADIUS = 58;
export const STICK_EDGE = 16;
export const STICK_ZONE_X = 0.42;
export const STICK_ZONE_Y = 0.42;

export type StickRole = "look" | "move";

export function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

export function stickRole(x: number, y: number, width: number, height: number): StickRole {
  return x > width * STICK_ZONE_X || y < height * (1 - STICK_ZONE_Y) ? "look" : "move";
}

export function clampStickOrigin(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = STICK_RADIUS,
): { x: number; y: number } {
  const pad = radius + STICK_EDGE;
  return {
    x: Math.min(Math.max(x, pad), Math.max(pad, width - STICK_EDGE)),
    y: Math.min(Math.max(y, pad), Math.max(pad, height - STICK_EDGE)),
  };
}

export function stickAxes(
  dx: number,
  dy: number,
  radius = STICK_RADIUS,
): { right: number; forward: number; knobX: number; knobY: number } {
  const length = Math.hypot(dx, dy);
  const scale = length > radius ? radius / length : 1;
  const knobX = dx * scale;
  const knobY = dy * scale;
  return {
    right: clampAxis(knobX / radius),
    forward: clampAxis(-knobY / radius),
    knobX,
    knobY,
  };
}
