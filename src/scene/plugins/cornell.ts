import { KIND_BOX, KIND_QUAD, mat, type ScenePlugin, type SceneWorld } from "../types";
import { vec3 } from "../../math/vec";

export const cornell: ScenePlugin = {
  id: "cornell",
  name: "Cornell",
  camera: { target: [0, 0, 0], eye: [0, 0, 0], radius: 3.9, yaw: 0, pitch: 0, vfov: 40 },
  limits: { pitch: 0.45, radiusMin: 2.6, radiusMax: 8 },
  exposure: 1,
  build(): SceneWorld {
    const white = mat(vec3(0.73, 0.73, 0.73));
    const red = mat(vec3(0.65, 0.05, 0.05));
    const green = mat(vec3(0.12, 0.45, 0.15));
    const gold = mat(vec3(1, 0.71, 0.29), vec3(0, 0, 0), 0.25, 1);
    const lamp = mat(vec3(0, 0, 0), vec3(15, 15, 15));
    const light: SceneWorld["prims"][number] = {
      kind: KIND_QUAD,
      material: 4,
      origin: vec3(-0.25, 0.99, -0.25),
      u: vec3(0.5, 0, 0),
      v: vec3(0, 0, 0.5),
    };
    return {
      materials: [white, red, green, gold, lamp],
      prims: [
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-1, -1, -1),
          u: vec3(2, 0, 0),
          v: vec3(0, 0, 2),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-1, 1, 1),
          u: vec3(2, 0, 0),
          v: vec3(0, 0, -2),
        },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-1, -1, -1),
          u: vec3(2, 0, 0),
          v: vec3(0, 2, 0),
        },
        {
          kind: KIND_QUAD,
          material: 1,
          origin: vec3(-1, -1, -1),
          u: vec3(0, 0, 2),
          v: vec3(0, 2, 0),
        },
        {
          kind: KIND_QUAD,
          material: 2,
          origin: vec3(1, -1, 1),
          u: vec3(0, 0, -2),
          v: vec3(0, 2, 0),
        },
        light,
        {
          kind: KIND_BOX,
          material: 3,
          center: vec3(0.4, -0.7, 0.2),
          half: vec3(0.3, 0.3, 0.3),
          yaw: (18 * Math.PI) / 180,
        },
        {
          kind: KIND_BOX,
          material: 0,
          center: vec3(-0.4, -0.4, -0.2),
          half: vec3(0.28, 0.6, 0.28),
          yaw: (-18 * Math.PI) / 180,
        },
      ],
      meshes: [],
    };
  },
};
