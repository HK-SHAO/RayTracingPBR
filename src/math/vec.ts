export type Vec3 = readonly [number, number, number];

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}
