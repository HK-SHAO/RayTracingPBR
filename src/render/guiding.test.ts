import { expect, test } from "vite-plus/test";
import { GUIDE_BYTES, GUIDE_CELL_COUNT, GUIDE_DIR_COUNT, GUIDE_INC_MAX } from "./guiding";

test("guide histogram fits 4K epoch without u32 overflow at max increment", () => {
  expect(GUIDE_BYTES).toBe(GUIDE_CELL_COUNT * GUIDE_DIR_COUNT * 4);
  const paths = 3840 * 2160 * 256;
  const perCell = paths / GUIDE_CELL_COUNT;
  expect(perCell * GUIDE_INC_MAX).toBeLessThan(2 ** 32);
});
