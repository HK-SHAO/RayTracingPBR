import type { CameraState } from "../render/camera";
import type { Vec3 } from "../math/vec";

export const KIND_SPHERE = 0;
export const KIND_PLANE = 1;
export const KIND_QUAD = 2;
export const KIND_BOX = 3;
export const KIND_CYLINDER = 4;

export const LIGHT_QUAD = 0;
export const LIGHT_SPHERE = 1;
export const LIGHT_CYL = 2;
export const LIGHT_TRI = 3;

export type Material = {
  albedo: Vec3;
  emission: Vec3;
  roughness: number;
  metallic: number;
  transmission: number;
  ior: number;
};

export type SpherePrim = {
  kind: typeof KIND_SPHERE;
  material: number;
  center: Vec3;
  radius: number;
};

export type PlanePrim = {
  kind: typeof KIND_PLANE;
  material: number;
  y: number;
};

export type QuadPrim = {
  kind: typeof KIND_QUAD;
  material: number;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
};

export type BoxPrim = {
  kind: typeof KIND_BOX;
  material: number;
  center: Vec3;
  half: Vec3;
  yaw: number;
};

export type CylinderPrim = {
  kind: typeof KIND_CYLINDER;
  material: number;
  center: Vec3;
  radius: number;
  halfHeight: number;
};

export type Prim = SpherePrim | PlanePrim | QuadPrim | BoxPrim | CylinderPrim;

export type AreaLight = {
  kind: typeof LIGHT_QUAD | typeof LIGHT_SPHERE | typeof LIGHT_CYL | typeof LIGHT_TRI;
  prim: number;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  radius: number;
  emission: Vec3;
  area: number;
};

export type MeshInstance = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  material: number;
};

export type SceneWorld = {
  materials: Material[];
  prims: Prim[];
  meshes: MeshInstance[];
};

export type ViewLimits = {
  pitch: number;
  radiusMin: number;
  radiusMax: number;
};

export type ScenePose = {
  world: SceneWorld;
  camera: CameraState;
};

export type ScenePlugin = {
  id: string;
  name: string;
  camera: CameraState;
  limits: ViewLimits;
  exposure: number;
  aperture?: number;
  ibl?: URL;
  hideIblDirect?: boolean;
  build: (time?: number) => SceneWorld | Promise<SceneWorld>;
  pose?: (time: number) => ScenePose;
};

export function mat(
  albedo: Vec3,
  emission: Vec3 = [0, 0, 0],
  roughness = 1,
  metallic = 0,
  transmission = 0,
  ior = 1.5,
): Material {
  return { albedo, emission, roughness, metallic, transmission, ior };
}
