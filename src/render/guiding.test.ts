import { expect, test } from "vite-plus/test";
import {
  GUIDE_BYTES,
  GUIDE_CELL_COUNT,
  GUIDE_DIR_COUNT,
  GUIDE_PHI_BINS,
  GUIDE_Z_BINS,
} from "./guiding";

test("guiding field has a compact aligned layout", () => {
  expect(GUIDE_DIR_COUNT).toBe(GUIDE_PHI_BINS * GUIDE_Z_BINS);
  expect(GUIDE_BYTES).toBe(GUIDE_CELL_COUNT * GUIDE_DIR_COUNT * 4);
  expect(GUIDE_BYTES % 16).toBe(0);
});
