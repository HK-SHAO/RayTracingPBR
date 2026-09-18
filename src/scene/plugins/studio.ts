import { KIND_BOX, KIND_CYLINDER, KIND_PLANE, KIND_SPHERE, mat, type ScenePlugin } from "../types";
import { vec3 } from "../../math/vec";
import { iblHdr } from "../../media";

export const studio: ScenePlugin = {
  id: "studio",
  name: "Studio",
  camera: { target: [0, 0, 0], eye: [0, 0, 0], radius: 4, yaw: 0, pitch: -0.05, vfov: 35 },
  limits: { pitch: 1.2, radiusMin: 1.8, radiusMax: 18 },
  exposure: 0.6,
  ibl: iblHdr,
  build() {
    return {
      materials: [
        mat(vec3(0.6, 0.6, 0.6)),
        mat(vec3(0.9, 0.9, 0.9), vec3(1, 10, 1), 0, 1),
        mat(vec3(0.18, 0.18, 0.9), vec3(0, 0, 0), 0.2, 1, 0, 1.1),
        mat(vec3(0.9, 0.9, 0.9), vec3(0, 0, 0), 0, 0, 1, 1.5),
        mat(vec3(0.9, 0.18, 0.18), vec3(0, 0, 0), 0, 0, 0, 1.46),
        mat(vec3(0.9, 0.9, 0.18), vec3(0, 0, 0), 0, 1),
        mat(vec3(0.9, 0.9, 0.9), vec3(0, 0, 0), 0, 1),
      ],
      prims: [
        { kind: KIND_PLANE, material: 0, y: -0.501 },
        { kind: KIND_SPHERE, material: 1, center: vec3(0, 1.5, 0), radius: 0.5 },
        { kind: KIND_SPHERE, material: 2, center: vec3(1, -0.2, 0), radius: 0.3 },
        { kind: KIND_SPHERE, material: 3, center: vec3(0, -0.2, 2), radius: 0.3 },
        {
          kind: KIND_CYLINDER,
          material: 4,
          center: vec3(-1, -0.2, 0),
          radius: 0.3,
          halfHeight: 0.3,
        },
        { kind: KIND_BOX, material: 5, center: vec3(0, 0, 5), half: vec3(2, 1, 0.2), yaw: 0 },
        { kind: KIND_BOX, material: 6, center: vec3(0, 0, -2), half: vec3(2, 1, 0.2), yaw: 0 },
      ],
      meshes: [],
    };
  },
};
