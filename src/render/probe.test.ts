import { expect, test } from "vite-plus/test";
import { cameraFrame, orbitCam } from "./camera";
import {
  parseProbe,
  PROBE_KIND_NEE,
  PROBE_KIND_PATH,
  PROBE_MAX,
  PROBE_STRIDE,
  project,
  projectPaths,
  type ProbeFrame,
} from "./probe";

test("project puts the look target on the image center", () => {
  const cam = orbitCam([0, 0, 0], 4, 0, 0, 40);
  const view = cameraFrame(cam, 1, "orbit");
  const p = project([0, 0, 0], view, 64, 64);
  expect(p?.x).toBeCloseTo(32, 3);
  expect(p?.y).toBeCloseTo(32, 3);
});

test("parseProbe reads ring slots and projectPaths keeps the latest on top", () => {
  const data = new Float32Array(8 * PROBE_STRIDE * 4);
  data[0] = 2;
  data[4] = 0;
  data[5] = 0;
  data[6] = 4;
  data[7] = PROBE_KIND_PATH;
  data[8] = 1;
  data[9] = 1;
  data[10] = 1;
  data[12] = 0;
  data[13] = 0;
  data[14] = 0;
  data[15] = PROBE_KIND_PATH;
  data[16] = 2;
  data[17] = 0.1;
  data[18] = 0.1;
  const paths = parseProbe(data);
  expect(paths).toHaveLength(8);
  expect(paths[0]?.verts).toHaveLength(2);
  expect(paths[0]?.verts[1]?.kind).toBe(PROBE_KIND_PATH);
  const cam = orbitCam([0, 0, 0], 4, 0, 0, 40);
  const frame: ProbeFrame = {
    paths,
    view: cameraFrame(cam, 1, "orbit"),
    size: [64, 64],
    pixel: [0, 0],
    exposure: 1,
    latest: 0,
  };
  const segs = projectPaths(frame);
  expect(segs).toHaveLength(1);
  expect(segs[0]?.kind).toBe(PROBE_KIND_PATH);
  expect(PROBE_MAX).toBeGreaterThan(8);
  expect(PROBE_KIND_NEE).toBe(1);
});
