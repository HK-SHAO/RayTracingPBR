import { expect, test } from "vite-plus/test";
import { cornell } from "../scene/plugins/cornell";
import { mirror } from "../scene/plugins/mirror";
import { defaultsFor, mergeParams, needsReset } from "./params";

test("defaults inherit scene optics and leave path depth unbounded", () => {
  const d = defaultsFor(mirror);
  expect(d.vfov).toBe(mirror.camera.vfov);
  expect(d.focus).toBe(mirror.camera.radius);
  expect(d.aperture).toBe(mirror.aperture);
  expect(d.exposure).toBe(mirror.exposure);
  expect(d.bounce).toBe(-1);
});

test("tone curve does not reset accumulation", () => {
  const a = defaultsFor(cornell);
  expect(needsReset(a, { ...a, exposure: 2 })).toBe(false);
  expect(needsReset(a, { ...a, vfov: 50 })).toBe(true);
  expect(needsReset(a, { ...a, aperture: 0.05 })).toBe(true);
  expect(needsReset(a, { ...a, hideIbl: 1 })).toBe(true);
});

test("merge clamps and ignores junk", () => {
  const a = defaultsFor(cornell);
  expect(mergeParams(a, { vfov: 9, bounce: 3.6, hideIbl: 0.9, exposure: Number.NaN })).toEqual({
    ...a,
    vfov: 18,
    bounce: 4,
    hideIbl: 1,
  });
});
