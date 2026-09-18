import { orbitCam, type CameraState } from "../../render/camera";
import { vec3, type Vec3 } from "../../math/vec";
import {
  KIND_PLANE,
  KIND_QUAD,
  KIND_SPHERE,
  mat,
  type QuadPrim,
  type ScenePlugin,
  type ScenePose,
  type SceneWorld,
  type SpherePrim,
} from "../types";

const FOV = 45;
const HALF_W = 2.3;
const LIGHT_Y = 1.4;
const LIGHT_Z = -5;
const MOVE = 0.7;
const LIGHT_TIME = 4;
const LIGHT_SPEED = 2;
const PHASE = 0.4;
const TOTAL_I = 6;
const SAT = 0.7;
const HUE_SPAN = 0.6;
const BLINN = [4096, 128, 32] as const;
const LIGHTS = [
  { x: -2, r: 0.05 },
  { x: -1.1, r: 0.2 },
  { x: 0, r: 0.4 },
  { x: 1.6, r: 0.8 },
] as const;
const PLATES = [
  { k: 1.2, d: 3.8, z0: -5.8, z1: -5 },
  { k: 0.7, d: 2.8, z0: -4.8, z1: -4 },
  { k: 0.3, d: 1.8, z0: -3.8, z1: -3 },
] as const;

function hsv2rgb(h: number, s: number, v: number): Vec3 {
  const fract = (x: number) => x - Math.floor(x);
  const ch = (off: number) => {
    const p = Math.abs(fract(h + off) * 6 - 3);
    return v * (1 + (Math.min(1, Math.max(0, p - 1)) - 1) * s);
  };
  return vec3(ch(1), ch(2 / 3), ch(1 / 3));
}

function blinnRough(exp: number): number {
  return Math.sqrt(2 / (exp + 2));
}

function lightCenter(i: number, time: number): Vec3 {
  const light = LIGHTS[i]!;
  const amp = MOVE * (1 - i * 0.25);
  const a = i * PHASE + time * LIGHT_TIME * LIGHT_SPEED;
  return vec3(light.x, LIGHT_Y + Math.sin(a) * amp, LIGHT_Z + Math.cos(a) * amp);
}

function lightEmission(i: number): Vec3 {
  const light = LIGHTS[i]!;
  const span = LIGHTS[3]!.x - LIGHTS[0]!.x;
  const rgb = hsv2rgb(
    ((light.x - LIGHTS[0]!.x) / span) * HUE_SPAN,
    SAT,
    1 / (4 * Math.PI * light.r * light.r),
  );
  return vec3(rgb[0] * TOTAL_I, rgb[1] * TOTAL_I, rgb[2] * TOTAL_I);
}

function plate(i: number, material: number): QuadPrim {
  const { k, d, z0, z1 } = PLATES[i]!;
  const y = (z: number) => -k * z - d * Math.hypot(1, k);
  return {
    kind: KIND_QUAD,
    material,
    origin: vec3(-HALF_W, y(z1), z1),
    u: vec3(HALF_W * 2, 0, 0),
    v: vec3(0, y(z0) - y(z1), z0 - z1),
  };
}

function lookAt(eye: Vec3, target: Vec3, vfov: number): CameraState {
  const dx = target[0] - eye[0];
  const dy = target[1] - eye[1];
  const dz = target[2] - eye[2];
  const radius = Math.hypot(dx, dy, dz) || 1;
  return orbitCam(
    [target[0], target[1], target[2]],
    radius,
    Math.atan2(-dx, -dz),
    Math.asin(Math.min(1, Math.max(-1, -dy / radius))),
    vfov,
  );
}

function cameraAt(time: number): CameraState {
  return lookAt(
    vec3(0, 1 + Math.sin(time * 0.45), 3 + Math.sin(time * 0.4) * 3),
    vec3(Math.sin(time * 0.4) * 0.3, 0, LIGHT_Z),
    FOV,
  );
}

function worldAt(time: number): SceneWorld {
  return {
    materials: [
      mat(vec3(1, 1, 1)),
      ...BLINN.map((exp) => mat(vec3(0.8, 0.8, 0.8), vec3(0, 0, 0), blinnRough(exp), 1)),
      ...LIGHTS.map((_, i) => mat(vec3(0, 0, 0), lightEmission(i))),
    ],
    prims: [
      { kind: KIND_PLANE, material: 0, y: -1 },
      {
        kind: KIND_QUAD,
        material: 0,
        origin: vec3(-8, -1, -6.2),
        u: vec3(16, 0, 0),
        v: vec3(0, 10, 0),
      },
      ...PLATES.map((_, i) => plate(i, 1 + i)),
      ...LIGHTS.map((light, i): SpherePrim => ({
        kind: KIND_SPHERE,
        material: 4 + i,
        center: lightCenter(i, time),
        radius: light.r,
      })),
    ],
    meshes: [],
  };
}

export function pose(time: number): ScenePose {
  return { world: worldAt(time), camera: cameraAt(time) };
}

export const mis: ScenePlugin = {
  id: "mis",
  name: "Veach",
  camera: cameraAt(0),
  limits: { pitch: 1.1, radiusMin: 2, radiusMax: 18 },
  exposure: 0.55,
  build: (time = 0) => worldAt(time),
  pose,
};
