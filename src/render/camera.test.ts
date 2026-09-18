import { expect, test } from "vite-plus/test";
import {
  cameraOrigin,
  lookDir,
  orbitCam,
  pinch,
  walkFps,
  withEye,
  withOrbitTarget,
} from "./camera";

test("orbit origin sits opposite the look direction", () => {
  const cam = orbitCam([0, 0, 0], 4, 0, 0, 40);
  const origin = cameraOrigin(cam, "orbit");
  expect(origin[0]).toBeCloseTo(0);
  expect(origin[1]).toBeCloseTo(0);
  expect(origin[2]).toBeCloseTo(4);
  const dir = lookDir(0, 0);
  expect(dir[2]).toBeCloseTo(-1);
});

test("fps walk follows yaw on XZ and QE on Y", () => {
  const cam = withEye(orbitCam([0, 0, 0], 4, 0, 0, 40));
  const moved = walkFps(
    cam,
    { forward: true, back: false, left: false, right: false, up: true, down: false, fast: false },
    1,
    2,
  );
  expect(moved.eye[0]).toBeCloseTo(cam.eye[0]);
  expect(moved.eye[1]).toBeCloseTo(cam.eye[1] + 2);
  expect(moved.eye[2]).toBeCloseTo(cam.eye[2] - 2);
});

test("pinch out dollies in", () => {
  const cam = orbitCam([0, 0, 0], 4, 0, 0, 40);
  const next = pinch(cam, 2, 1, 12);
  expect(next.radius).toBe(2);
});

test("switching fps back to orbit keeps the eye", () => {
  let cam = withEye(orbitCam([0, 1, 0], 3, 0.4, 0.1, 40));
  cam = walkFps(
    cam,
    { forward: true, back: false, left: false, right: false, up: false, down: false, fast: false },
    0.5,
    2,
  );
  const orbit = withOrbitTarget(cam);
  const origin = cameraOrigin(orbit, "orbit");
  expect(origin[0]).toBeCloseTo(cam.eye[0], 5);
  expect(origin[1]).toBeCloseTo(cam.eye[1], 5);
  expect(origin[2]).toBeCloseTo(cam.eye[2], 5);
});
