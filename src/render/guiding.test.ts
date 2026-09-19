import { expect, test } from "vite-plus/test";
import {
  GUIDE_BYTES,
  GUIDE_CELL_COUNT,
  GUIDE_DIR_COUNT,
  GUIDE_INC_MAX,
  GUIDE_STRIDE,
} from "./guiding";

test("guide slots store a spatial key plus bins and cannot overflow u32 at 4K epoch", () => {
  expect(GUIDE_STRIDE).toBe(GUIDE_DIR_COUNT + 1);
  expect(GUIDE_BYTES).toBe(GUIDE_CELL_COUNT * GUIDE_STRIDE * 4);
  const paths = 3840 * 2160 * 256;
  const perCell = paths / GUIDE_CELL_COUNT;
  expect(perCell * GUIDE_INC_MAX).toBeLessThan(2 ** 32);
});
