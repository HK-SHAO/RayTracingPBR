import { KIND_PLANE, KIND_QUAD, mat, type ScenePlugin } from "../types";
import { vec3 } from "../../math/vec";
import { fitMesh, parseObj, rotateY } from "../../mesh/obj";
import { dragonObj, readText, teapotObj } from "../../media";

const DRAGON_YAW = Math.PI;
const TEAPOT_YAW = -Math.PI / 2;

export const classic: ScenePlugin = {
  id: "classic",
  name: "Dragon",
  camera: { target: [0, 0, 0], eye: [0, 0, 0], radius: 3.6, yaw: 0.6, pitch: -0.2, vfov: 40 },
  limits: { pitch: 1.1, radiusMin: 1.8, radiusMax: 12 },
  exposure: 1,
  async build() {
    const [dragonSrc, teapotSrc] = await Promise.all([readText(dragonObj), readText(teapotObj)]);
    const dragon = fitMesh(rotateY(parseObj(dragonSrc), DRAGON_YAW), 1.2, -1, -0.72, 0);
    const teapot = fitMesh(rotateY(parseObj(teapotSrc), TEAPOT_YAW), 0.62, -1, 0.78, 0.05);
    return {
      materials: [
        mat(vec3(0.73, 0.73, 0.73)),
        mat(vec3(0.14, 0.45, 0.22), vec3(0, 0, 0), 0.35, 0),
        mat(vec3(0.82, 0.65, 0.28), vec3(0, 0, 0), 0.2, 1),
        mat(vec3(0, 0, 0), vec3(18, 18, 18)),
      ],
      prims: [
        { kind: KIND_PLANE, material: 0, y: -1 },
        {
          kind: KIND_QUAD,
          material: 0,
          origin: vec3(-3, -1, -1.5),
          u: vec3(6, 0, 0),
          v: vec3(0, 3, 0),
        },
        {
          kind: KIND_QUAD,
          material: 3,
          origin: vec3(-0.4, 1.45, -0.4),
          u: vec3(0.8, 0, 0),
          v: vec3(0, 0, 0.8),
        },
      ],
      meshes: [
        { ...dragon, material: 1 },
        { ...teapot, material: 2 },
      ],
    };
  },
};
