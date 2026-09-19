import { expect, test } from "vite-plus/test";
import { rouletteSurvival, RR_MAX_SURVIVAL, RR_MIN_SURVIVAL, RR_START_DEPTH } from "./roulette";

test("roulette bounds survival and preserves the strongest channel", () => {
  expect(RR_START_DEPTH).toBe(4);
  expect(rouletteSurvival([0, 0, 0])).toBe(RR_MIN_SURVIVAL);
  expect(rouletteSurvival([0.01, 0.8, 0.1])).toBe(0.8);
  expect(rouletteSurvival([2, 1, 0])).toBe(RR_MAX_SURVIVAL);
});
