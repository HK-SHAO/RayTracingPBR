import { expect, test } from "vite-plus/test";
import { cornell } from "../scene/plugins/cornell";
import { glass } from "../scene/plugins/glass";
import { mirror } from "../scene/plugins/mirror";
import { defaultsFor, formatParam, mergeParams, needsReset } from "./params";

test("scene defaults are in range and pinhole-sharp", () => {
  const d = defaultsFor(cornell);
  expect(d.vfov).toBe(40);
  expect(d.focus).toBe(cornell.camera.radius);
  expect(d.aperture).toBe(0);
  expect(d.exposure).toBe(1);
  expect(d.bounce).toBe(0);
  expect(d.env).toBe(1);
  expect(d.hideIbl).toBe(0);
});

test("mirror keeps a wide interior view on the lamp", () => {
  const d = defaultsFor(mirror);
  expect(d.vfov).toBe(72);
  expect(d.focus).toBe(mirror.camera.radius);
  expect(d.aperture).toBe(0.01);
  expect(d.exposure).toBe(0.5);
});

test("glass hides ibl direct by default", () => {
  const d = defaultsFor(glass);
  expect(d.hideIbl).toBe(1);
  expect(glass.ibl).toBeDefined();
});

test("tone curve does not reset accumulation", () => {
  const a = defaultsFor(cornell);
  expect(needsReset(a, { ...a, exposure: 2 })).toBe(false);
  expect(needsReset(a, { ...a, vfov: 50 })).toBe(true);
  expect(needsReset(a, { ...a, aperture: 0.05 })).toBe(true);
  expect(needsReset(a, { ...a, hideIbl: 1 })).toBe(true);
});

test("format matches knob precision", () => {
  expect(formatParam("bounce", 8)).toBe("8");
  expect(formatParam("bounce", 0)).toBe("∞");
  expect(formatParam("aperture", 0.04)).toBe("0.040");
  expect(formatParam("vfov", 35)).toBe("35.0");
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
