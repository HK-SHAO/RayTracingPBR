import { expect, test } from "vite-plus/test";
import { iorF0, lightPower, lightSolidAnglePdf, lum, mis2, sphereSolidAnglePdf } from "./physics";

test("power heuristic is one-sided at zero", () => {
  expect(mis2(1, 0)).toBe(1);
  expect(mis2(0, 1)).toBe(0);
  expect(mis2(2, 2)).toBe(0.5);
});

test("dielectric F0 for glass", () => {
  expect(iorF0(1.5)).toBeCloseTo(0.04, 3);
});

test("area pdf converts to solid angle", () => {
  const area = 0.25;
  const dist2 = 4;
  const cosL = 1;
  expect(lightSolidAnglePdf(1 / area, dist2, cosL)).toBe(16);
});

test("sphere cone pdf rises as the source shrinks", () => {
  const far = sphereSolidAnglePdf(16, 0.5);
  const near = sphereSolidAnglePdf(4, 0.5);
  expect(far).toBeGreaterThan(near);
  expect(far).toBeGreaterThan(0);
});

test("light power is luminance times area", () => {
  expect(lum([1, 1, 1])).toBeCloseTo(1, 5);
  expect(lightPower([1, 0, 0], 2)).toBeCloseTo(0.4252, 3);
});
