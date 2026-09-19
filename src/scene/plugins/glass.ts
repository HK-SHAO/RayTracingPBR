import { iblHdr } from "../../media";
import { orbitCam } from "../../render/camera";
import { vec3 } from "../../math/vec";
import { KIND_BOX, KIND_CYLINDER, KIND_SPHERE, mat, type ScenePlugin } from "../types";

const S = 9;
const T = 0.5;
const OUTER = 3;
const MID = OUTER - T;
const YAW = Math.PI / 4;
const PITCH = Math.asin(1 / Math.sqrt(3));

export const glass: ScenePlugin = {
  id: "glass",
  name: "Glass",
  camera: orbitCam([0, 0, 0], S * Math.sqrt(3), YAW, PITCH, 40),
  limits: { pitch: 1.2, radiusMin: 4, radiusMax: 28 },
  exposure: 1,
  aperture: 0,
  ibl: iblHdr,
  hideIblDirect: false,
  build() {
    const shell = mat(vec3(0.85, 0.9, 1), vec3(0, 0, 0), 0, 0, 1, 1.5);
    return {
      materials: [
        mat(vec3(1, 1, 1), vec3(1, 10, 1), 0, 1, 0, 1),
        mat(vec3(1, 0.2, 0.2), vec3(0, 0, 0), 0.1, 0, 0, 1.46),
        mat(vec3(1, 1, 0.2), vec3(0, 0, 0), 1, 0, 0, 1.635),
        mat(vec3(0.2, 0.2, 1), vec3(0, 0, 0), 0.2, 1, 0, 1.1),
        mat(vec3(0.9, 0.9, 0.9), vec3(0, 0, 0), 0, 0, 1, 1.5),
        shell,
      ],
      prims: [
        {
          kind: KIND_BOX,
          material: 5,
          center: vec3(MID, 0, 0),
          half: vec3(T, OUTER, OUTER),
          yaw: 0,
        },
        {
          kind: KIND_BOX,
          material: 5,
          center: vec3(-MID, 0, 0),
          half: vec3(T, OUTER, OUTER),
          yaw: 0,
        },
        {
          kind: KIND_BOX,
          material: 5,
          center: vec3(0, MID, 0),
          half: vec3(OUTER, T, OUTER),
          yaw: 0,
        },
        {
          kind: KIND_BOX,
          material: 5,
          center: vec3(0, -MID, 0),
          half: vec3(OUTER, T, OUTER),
          yaw: 0,
        },
        {
          kind: KIND_BOX,
          material: 5,
          center: vec3(0, 0, MID),
          half: vec3(OUTER, OUTER, T),
          yaw: 0,
        },
        {
          kind: KIND_BOX,
          material: 5,
          center: vec3(0, 0, -MID),
          half: vec3(OUTER, OUTER, T),
          yaw: 0,
        },
        { kind: KIND_SPHERE, material: 0, center: vec3(0, 0, 0), radius: 0.5 },
        {
          kind: KIND_CYLINDER,
          material: 1,
          center: vec3(-1, -0.2, 0),
          radius: 0.3,
          halfHeight: 0.3,
        },
        {
          kind: KIND_CYLINDER,
          material: 2,
          center: vec3(0, -0.2, -1),
          radius: 0.3,
          halfHeight: 0.3,
        },
        { kind: KIND_SPHERE, material: 3, center: vec3(1, -0.2, 0), radius: 0.3 },
        { kind: KIND_SPHERE, material: 4, center: vec3(0, -0.2, 1), radius: 0.3 },
      ],
      meshes: [],
    };
  },
};
