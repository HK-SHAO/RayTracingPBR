import { expect, test } from "vite-plus/test";
import { cameraFrame, orbitOrigin } from "../render/camera";
import { readText, teapotObj } from "../media";
import { classic } from "./plugins/classic";
import { cornell } from "./plugins/cornell";
import { glass } from "./plugins/glass";
import { mirror } from "./plugins/mirror";
import { mis } from "./plugins/mis";
import { studio } from "./plugins/studio";
import { KIND_BOX, KIND_CYLINDER, KIND_SPHERE, LIGHT_QUAD, LIGHT_SPHERE, mat } from "./types";
import { lightsFromEmissive, packWorld } from "./pack";
import { parseObj } from "../mesh/obj";

test("classic packs dragon and teapot triangles", async () => {
  const packed = packWorld(await classic.build());
  expect(packed.triCount).toBeGreaterThan(20000);
  expect(packed.nodeCount).toBeGreaterThan(2);
  expect(packed.primCount).toBe(3);
});

test("teapot obj is self-contained", async () => {
  const mesh = parseObj(await readText(teapotObj));
  expect(mesh.indices.length).toBeGreaterThan(300);
  expect(mesh.positions.length).toBeGreaterThan(300);
});

test("emissive prims fill the light table", async () => {
  const cornellLights = lightsFromEmissive(await cornell.build());
  expect(cornellLights).toHaveLength(1);
  expect(cornellLights[0]?.kind).toBe(LIGHT_QUAD);
  expect(cornellLights[0]?.prim).toBe(5);
  expect(cornellLights[0]?.origin).toEqual([-0.25, 0.99, -0.25]);
  expect(packWorld(await cornell.build()).lightCount).toBe(1);

  const studioLights = lightsFromEmissive(await studio.build());
  expect(studioLights).toHaveLength(1);
  expect(studioLights[0]?.kind).toBe(LIGHT_SPHERE);
  expect(studioLights[0]?.origin).toEqual([0, 2, -1]);

  const veach = lightsFromEmissive(await mis.build());
  expect(veach).toHaveLength(4);
  expect(veach.map((l) => l.prim)).toEqual([5, 6, 7, 8]);
  expect(veach.map((l) => l.radius)).toEqual([0.05, 0.2, 0.4, 0.8]);

  const dragon = lightsFromEmissive(await classic.build());
  expect(dragon).toHaveLength(1);
  expect(dragon[0]?.prim).toBe(2);

  const mirrorLights = lightsFromEmissive(await mirror.build());
  expect(mirrorLights).toHaveLength(1);
  expect(mirrorLights[0]?.kind).toBe(LIGHT_SPHERE);
  expect(mirrorLights[0]?.radius).toBe(0.5);
  expect(mirrorLights[0]?.origin).toEqual([0, -1.5, 0]);
  expect(packWorld(await mirror.build()).lightCount).toBe(1);

  const glassLights = lightsFromEmissive(await glass.build());
  expect(glassLights).toHaveLength(1);
  expect(glassLights[0]?.kind).toBe(LIGHT_SPHERE);
  expect(glassLights[0]?.radius).toBe(0.5);
  expect(glassLights[0]?.origin).toEqual([0, 0, 0]);
  expect(packWorld(await glass.build()).lightCount).toBe(1);
});

test("hk-shao glass camera sits on the lookat diagonal", () => {
  const glassEye = orbitOrigin(glass.camera);
  expect(glassEye[0]).toBeCloseTo(9, 5);
  expect(glassEye[1]).toBeCloseTo(9, 5);
  expect(glassEye[2]).toBeCloseTo(9, 5);
  expect(glass.camera.vfov).toBe(40);
});

test("mirror looks at the lamp from inside and frames five prims", async () => {
  const cam = mirror.camera;
  expect(cam.target).toEqual([0, -1.5, 0]);
  expect(cam.vfov).toBe(72);
  expect(cam.radius).toBeLessThanOrEqual(mirror.limits.radiusMax);
  const eye = orbitOrigin(cam);
  expect(Math.max(Math.abs(eye[0]), Math.abs(eye[1]), Math.abs(eye[2]))).toBeLessThan(2);
  expect(eye[0]).toBeGreaterThan(0);
  expect(eye[2]).toBeGreaterThan(0);
  const world = await mirror.build();
  const view = cameraFrame(cam, 16 / 9);
  const bodies = world.prims.filter((p) => p.kind === KIND_SPHERE || p.kind === KIND_CYLINDER);
  expect(bodies).toHaveLength(5);
  for (const prim of bodies) {
    const p = prim.center;
    const rel = [p[0] - view.origin[0], p[1] - view.origin[1], p[2] - view.origin[2]] as const;
    const along = rel[0] * view.forward[0] + rel[1] * view.forward[1] + rel[2] * view.forward[2];
    expect(along).toBeGreaterThan(0.2);
    const x =
      (rel[0] * view.right[0] + rel[1] * view.right[1] + rel[2] * view.right[2]) /
      along /
      view.halfW;
    const y =
      (rel[0] * view.up[0] + rel[1] * view.up[1] + rel[2] * view.up[2]) / along / view.halfH;
    expect(Math.abs(x)).toBeLessThan(1);
    expect(Math.abs(y)).toBeLessThan(1);
  }
});

test("veach pose moves lights and camera", () => {
  const rest = lightsFromEmissive(mis.pose!(0).world);
  const moved = lightsFromEmissive(mis.pose!(1).world);
  expect(rest).toHaveLength(4);
  expect(rest.map((l) => l.prim)).toEqual([5, 6, 7, 8]);
  expect(rest.map((l) => l.radius)).toEqual([0.05, 0.2, 0.4, 0.8]);
  expect(rest.map((l) => l.origin)).not.toEqual(moved.map((l) => l.origin));
  expect(mis.pose!(0).camera.eye).not.toEqual(mis.pose!(1).camera.eye);
  expect(mis.pose!(0).camera.vfov).toBe(45);
});

test("emissive boxes explode to six quads", () => {
  const lights = lightsFromEmissive({
    materials: [mat([0, 0, 0], [4, 4, 4])],
    prims: [
      {
        kind: KIND_BOX,
        material: 0,
        center: [0, 0, 0],
        half: [0.5, 0.5, 0.5],
        yaw: 0,
      },
    ],
    meshes: [],
  });
  expect(lights).toHaveLength(6);
  expect(lights.every((l) => l.kind === LIGHT_QUAD && l.prim === 0)).toBe(true);
  expect(
    packWorld({
      materials: [mat([0, 0, 0], [4, 4, 4])],
      prims: [
        {
          kind: KIND_BOX,
          material: 0,
          center: [0, 0, 0],
          half: [0.5, 0.5, 0.5],
          yaw: 0,
        },
      ],
      meshes: [],
    }).lightCount,
  ).toBe(6);
});

test("packWorld sorts prims by kind and remaps lights", async () => {
  const packed = packWorld(await studio.build());
  expect(packed.nSphere).toBe(3);
  expect(packed.nPlane).toBe(1);
  expect(packed.nBox).toBe(2);
  expect(packed.nCyl).toBe(1);
  expect(new Uint32Array(packed.lights.buffer, packed.lights.byteOffset, 4)[1]).toBe(0);
  expect(packed.triPos.length).toBe(12);
  expect(packed.triN.length).toBe(12);
  expect(packed.nrmOff).toBeGreaterThan(packed.nodeOff);
});

test("packWorld reuses empty mesh buffers across poses", async () => {
  const a = packWorld(mis.pose!(0).world);
  const b = packWorld(mis.pose!(1).world, a);
  expect(b.triPos.length).toBe(a.triPos.length);
  expect(b.nodes.length).toBe(a.nodes.length);
  expect(b.lights).not.toEqual(a.lights);
});
