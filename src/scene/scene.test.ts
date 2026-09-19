import { expect, test } from "vite-plus/test";
import { lightsFromEmissive, NODE_FLOATS, packWorld } from "./pack";
import {
  KIND_BOX,
  KIND_PLANE,
  KIND_QUAD,
  KIND_SPHERE,
  LIGHT_QUAD,
  LIGHT_SPHERE,
  mat,
  type SceneWorld,
} from "./types";
import { cornell } from "./plugins/cornell";

function world(emission: readonly [number, number, number] = [4, 4, 4]): SceneWorld {
  return {
    materials: [mat([0.5, 0.5, 0.5]), mat([0, 0, 0], [...emission])],
    prims: [
      { kind: KIND_PLANE, material: 0, y: 0 },
      { kind: KIND_SPHERE, material: 1, center: [0, 1, 0], radius: 0.5 },
      {
        kind: KIND_QUAD,
        material: 1,
        origin: [-1, 2, -1],
        u: [2, 0, 0],
        v: [0, 0, 2],
      },
      {
        kind: KIND_BOX,
        material: 1,
        center: [0, 0.5, 0],
        half: [0.5, 0.5, 0.5],
        yaw: 0,
      },
    ],
    meshes: [],
  };
}

test("emissive primitives become sampleable area lights", () => {
  const lights = lightsFromEmissive(world());
  expect(lights).toHaveLength(8);
  expect(lights.filter((light) => light.kind === LIGHT_SPHERE)).toHaveLength(1);
  expect(lights.filter((light) => light.kind === LIGHT_QUAD)).toHaveLength(7);
  expect(lights.every((light) => light.area > 0)).toBe(true);
});

test("packing groups primitive kinds and remaps light indices", () => {
  const packed = packWorld(world());
  expect(packed.primCount).toBe(4);
  expect(packed.nSphere).toBe(1);
  expect(packed.nPlane).toBe(1);
  expect(packed.nQuad).toBe(1);
  expect(packed.nBox).toBe(1);
  expect(packed.lightCount).toBe(8);
  expect(new Uint32Array(packed.lights.buffer, packed.lights.byteOffset, 4)[1]).toBe(0);
  expect(new Uint32Array(packed.prims.buffer, packed.prims.byteOffset, 4)[3]).toBe(1);
});

test("analytic primitive BVH pads zero-thickness quads", async () => {
  const packed = packWorld(await cornell.build());
  const base = packed.primNodeOff * 4;
  let leaves = 0;
  for (let o = base; o + 7 < packed.atlas.length; o += NODE_FLOATS) {
    const count = packed.atlas[o + 7] ?? 0;
    if (count <= 0) continue;
    leaves += 1;
    expect((packed.atlas[o + 4] ?? 0) - (packed.atlas[o] ?? 0)).toBeGreaterThan(0.001);
    expect((packed.atlas[o + 5] ?? 0) - (packed.atlas[o + 1] ?? 0)).toBeGreaterThan(0.001);
    expect((packed.atlas[o + 6] ?? 0) - (packed.atlas[o + 2] ?? 0)).toBeGreaterThan(0.001);
  }
  expect(leaves).toBe(packed.nSphere + packed.nQuad + packed.nBox + packed.nCyl);
});

test("packing reuses empty mesh acceleration storage", () => {
  const first = packWorld(world());
  const second = packWorld(world([8, 4, 2]), first);
  expect(second.triPos).toEqual(first.triPos);
  expect(second.triN).toEqual(first.triN);
  expect(second.nodes).toEqual(first.nodes);
  expect(second.lights).not.toEqual(first.lights);
});
