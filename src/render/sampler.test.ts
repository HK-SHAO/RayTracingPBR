import { expect, test } from "vite-plus/test";
import { mixSeed } from "./sampler";

test("pixel and frame seeds do not collide on the old linear mapping", () => {
  expect(mixSeed(1973, 0)).not.toBe(mixSeed(0, 0));
  const a = 1385 + 4 * 1973;
  expect(mixSeed(a, 0)).not.toBe(mixSeed(0, 1));
});
