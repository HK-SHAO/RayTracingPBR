import { expect, test } from "vite-plus/test";
import { averageFps, nextBurst, pushPresent, shouldDrain, TARGET_MS, waitMs } from "./pace";

test("burst adapts to the frame budget without reaching zero", () => {
  expect(nextBurst(1, TARGET_MS * 3)).toBe(1);
  expect(nextBurst(8, TARGET_MS * 0.75, 8)).toBe(8);
  expect(nextBurst(8, TARGET_MS * 1.5, 8)).toBeLessThan(8);
  expect(nextBurst(8, TARGET_MS * 0.2, 8)).toBeGreaterThan(8);
});

test("drain when GPU exceeds the frame budget", () => {
  expect(shouldDrain(TARGET_MS)).toBe(true);
  expect(shouldDrain(TARGET_MS * 0.5)).toBe(false);
});

test("waitMs sleeps the remainder of the frame", () => {
  expect(waitMs(0, 10)).toBeCloseTo(TARGET_MS - 10, 5);
  expect(waitMs(0, TARGET_MS + 5)).toBe(0);
});

test("average fps is presents over the window", () => {
  const times: number[] = [];
  for (let i = 0; i <= 10; i++) pushPresent(times, i * 100);
  expect(averageFps(times)).toBeCloseTo(10, 5);
  pushPresent(times, 1500);
  expect(times[0]).toBeGreaterThanOrEqual(500);
  expect(averageFps(times)).toBeGreaterThan(0);
});
