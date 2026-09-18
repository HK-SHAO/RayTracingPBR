const PI = Math.PI;
const FPS_PITCH = PI / 2 - 0.04;

export type CameraMode = "orbit" | "fps";

export type CameraState = {
  target: readonly [number, number, number];
  eye: readonly [number, number, number];
  radius: number;
  yaw: number;
  pitch: number;
  vfov: number;
};

export type CameraFrame = {
  origin: readonly [number, number, number];
  right: readonly [number, number, number];
  up: readonly [number, number, number];
  forward: readonly [number, number, number];
  halfW: number;
  halfH: number;
};

export type MoveInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fast: boolean;
};

export function orbitCam(
  target: readonly [number, number, number],
  radius: number,
  yaw: number,
  pitch: number,
  vfov: number,
): CameraState {
  return withEye({ target, eye: [0, 0, 0], radius, yaw, pitch, vfov });
}

function add(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(a: readonly [number, number, number], s: number): [number, number, number] {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function lookDir(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function orbitOrigin(cam: CameraState): [number, number, number] {
  return add(cam.target, mul(lookDir(cam.yaw, cam.pitch), -cam.radius));
}

export function cameraOrigin(
  cam: CameraState,
  mode: CameraMode = "orbit",
): [number, number, number] {
  return mode === "fps" ? [cam.eye[0], cam.eye[1], cam.eye[2]] : orbitOrigin(cam);
}

export function cameraFrame(
  cam: CameraState,
  aspect: number,
  mode: CameraMode = "orbit",
): CameraFrame {
  const origin = cameraOrigin(cam, mode);
  const forward = lookDir(cam.yaw, cam.pitch);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const halfH = Math.tan((cam.vfov * 0.5 * PI) / 180);
  return { origin, right, up, forward, halfW: halfH * aspect, halfH };
}

export function withEye(cam: CameraState): CameraState {
  return { ...cam, eye: orbitOrigin(cam) };
}

export function withOrbitTarget(cam: CameraState): CameraState {
  const eye = cam.eye;
  const forward = lookDir(cam.yaw, cam.pitch);
  return { ...cam, target: add(eye, mul(forward, cam.radius)) };
}

export function look(cam: CameraState, dx: number, dy: number, pitchLimit: number): CameraState {
  return {
    ...cam,
    yaw: cam.yaw - dx * 0.005,
    pitch: Math.min(pitchLimit, Math.max(-pitchLimit, cam.pitch + dy * 0.005)),
  };
}

export function orbit(cam: CameraState, dx: number, dy: number, pitchLimit: number): CameraState {
  return look(cam, dx, dy, pitchLimit);
}

export function dolly(
  cam: CameraState,
  delta: number,
  radiusMin: number,
  radiusMax: number,
): CameraState {
  return pinch(cam, 1 / (1 + delta * 0.001), radiusMin, radiusMax);
}

export function pinch(
  cam: CameraState,
  scale: number,
  radiusMin: number,
  radiusMax: number,
): CameraState {
  if (!(scale > 0) || !Number.isFinite(scale)) return cam;
  return {
    ...cam,
    radius: Math.min(radiusMax, Math.max(radiusMin, cam.radius / scale)),
  };
}

export function fpsPitchLimit(): number {
  return FPS_PITCH;
}

export function walkFps(cam: CameraState, move: MoveInput, dt: number, speed = 2.4): CameraState {
  let x = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  let z = (move.forward ? 1 : 0) - (move.back ? 1 : 0);
  let y = (move.up ? 1 : 0) - (move.down ? 1 : 0);
  if (x === 0 && y === 0 && z === 0) return cam;
  const len = Math.hypot(x, z);
  if (len > 0) {
    x /= len;
    z /= len;
  }
  const yaw = cam.yaw;
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const step = speed * (move.fast ? 2.2 : 1) * dt;
  return {
    ...cam,
    eye: [
      cam.eye[0] + (fwdX * z + rightX * x) * step,
      cam.eye[1] + y * step,
      cam.eye[2] + (fwdZ * z + rightZ * x) * step,
    ],
  };
}

export function cameraMoved(a: CameraState, b: CameraState, eps = 1e-4): boolean {
  return (
    Math.abs(a.yaw - b.yaw) > eps ||
    Math.abs(a.pitch - b.pitch) > eps ||
    Math.abs(a.radius - b.radius) > eps ||
    Math.abs(a.vfov - b.vfov) > eps ||
    Math.abs(a.eye[0] - b.eye[0]) > eps ||
    Math.abs(a.eye[1] - b.eye[1]) > eps ||
    Math.abs(a.eye[2] - b.eye[2]) > eps ||
    Math.abs(a.target[0] - b.target[0]) > eps ||
    Math.abs(a.target[1] - b.target[1]) > eps ||
    Math.abs(a.target[2] - b.target[2]) > eps
  );
}
