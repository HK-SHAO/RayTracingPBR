import { expect, test } from "vite-plus/test";
import {
  beer,
  iorF0,
  lightPower,
  lightSolidAnglePdf,
  lum,
  mis2,
  sphereSolidAnglePdf,
  visRange,
} from "./physics";

test("shadow vis range uses a fixed offset, not a relative gap", () => {
  expect(100 - visRange(100)).toBeCloseTo(1e-3, 12);
  expect(visRange(100)).toBeGreaterThan(99.99);
});

test("power heuristic is one-sided at zero", () => {
  expect(mis2(1, 0)).toBe(1);
  expect(mis2(0, 1)).toBe(0);
  expect(mis2(2, 2)).toBe(0.5);
});

test("MIS partitions only when both techniques use the same pdf pair", () => {
  const pLight = 0.2;
  const pBsdf = 0.08;
  const pGuide = 0.5;
  const pCont = 0.5 * pBsdf + 0.5 * pGuide;
  expect(mis2(pLight, pCont) + mis2(pCont, pLight)).toBeCloseTo(1, 10);
  expect(mis2(pLight, pBsdf) + mis2(pCont, pLight)).not.toBeCloseTo(1, 2);
});

test("Beer-Lambert transmittance is albedo^t", () => {
  expect(beer([1, 1, 1], 10)).toEqual([1, 1, 1]);
  const tint = beer([0.2, 0.2, 1], 0.6);
  expect(tint[0]).toBeCloseTo(0.2 ** 0.6, 5);
  expect(tint[1]).toBeCloseTo(0.2 ** 0.6, 5);
  expect(tint[2]).toBe(1);
  expect(tint[2]).toBeGreaterThan(tint[0]);
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
