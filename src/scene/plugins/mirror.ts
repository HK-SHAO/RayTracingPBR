import { orbitCam } from "../../render/camera";
import { vec3 } from "../../math/vec";
import { KIND_CYLINDER, KIND_QUAD, KIND_SPHERE, mat, type ScenePlugin } from "../types";

const H = 2;
const W = 4;
const LAMP: readonly [number, number, number] = [0, -1.5, 0];

export const mirror: ScenePlugin = {
  id: "mirror",
  name: "Mirror",
  camera: orbitCam(LAMP, 1.72, Math.PI / 4, 0.55, 72),
  limits: { pitch: 0.8, radiusMin: 0.65, radiusMax: 1.88 },
  exposure: 0.5,
  aperture: 0.01,
  build() {
    const chrome = mat(vec3(0.9, 0.9, 0.9), vec3(0, 0, 0), 0, 1, 0, 1.5);
    return {
      materials: [
        chrome,
        mat(vec3(1, 0.2, 0.2), vec3(0, 0, 0), 0.1, 0, 0, 1.46),
        mat(vec3(1, 1, 0.2), vec3(0, 0, 0), 1, 0, 0, 1.46),
        mat(vec3(0.2, 0.2, 1), vec3(0, 0, 0), 0.2, 1, 0, 1.1),
        mat(vec3(0.9, 0.9, 0.9), vec3(0, 0, 0), 0, 0, 1, 1.5),
        mat(vec3(1, 1, 1), vec3(10, 10, 10), 0, 1, 0, 1),
      ],
      prims: [
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-H, -H, -H),
          u: vec3(W, 0, 0),
          v: vec3(0, 0, W),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-H, H, H),
          u: vec3(W, 0, 0),
          v: vec3(0, 0, -W),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-H, -H, -H),
          u: vec3(W, 0, 0),
          v: vec3(0, W, 0),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-H, -H, H),
          u: vec3(W, 0, 0),
          v: vec3(0, W, 0),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-H, -H, -H),
          u: vec3(0, 0, W),
          v: vec3(0, W, 0),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(H, -H, H),
          u: vec3(0, 0, -W),
          v: vec3(0, W, 0),
        },
        { kind: KIND_SPHERE, material: 5, center: vec3(0, -1.5, 0), radius: 0.5 },
        {
          kind: KIND_CYLINDER,
          material: 1,
          center: vec3(-1, -1.7, 0),
          radius: 0.3,
          halfHeight: 0.3,
        },
        {
          kind: KIND_CYLINDER,
          material: 2,
          center: vec3(0, -1.7, -1),
          radius: 0.3,
          halfHeight: 0.3,
        },
        { kind: KIND_SPHERE, material: 3, center: vec3(1, -1.7, 0), radius: 0.3 },
        { kind: KIND_SPHERE, material: 4, center: vec3(0, -1.7, 1), radius: 0.3 },
      ],
      meshes: [],
    };
  },
};
