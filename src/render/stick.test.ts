import { expect, test } from "vite-plus/test";
import { clampStickOrigin, stickAxes, stickRole } from "./stick";

test("bottom-left thumb is move, the rest is look", () => {
  expect(stickRole(40, 580, 400, 600)).toBe("move");
  expect(stickRole(300, 580, 400, 600)).toBe("look");
  expect(stickRole(40, 40, 400, 600)).toBe("look");
});

test("stick deflection maps to analog axes and clamps to the disc", () => {
  const half = stickAxes(0, -29, 58);
  expect(half.forward).toBeCloseTo(0.5);
  expect(half.right).toBeCloseTo(0);
  const over = stickAxes(100, 0, 58);
  expect(over.right).toBeCloseTo(1);
  expect(over.knobX).toBeCloseTo(58);
});

test("stick origin stays on-screen", () => {
  const origin = clampStickOrigin(0, 800, 400, 600);
  expect(origin.x).toBe(74);
  expect(origin.y).toBe(584);
});
