import { expect, test } from "vite-plus/test";
import { reverseBits, sample1d, sobol0, sobol1 } from "./sampler";

test("reverseBits is an involution", () => {
  expect(reverseBits(reverseBits(0x12345678))).toBe(0x12345678);
  expect(reverseBits(1)).toBe(0x80000000);
});

test("Owen-scrambled Sobol 2D fills a 4×4 grid at 16 spp", () => {
  const cells = new Set<string>();
  for (let i = 0; i < 16; i++) {
    const x = sample1d(7, i, 0);
    const y = sample1d(7, i, 1);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(1);
    cells.add(`${Math.floor(x * 4)}:${Math.floor(y * 4)}`);
  }
  expect(cells.size).toBe(16);
});

test("pixel scramble decorrelates streams; high dims stay in unit interval", () => {
  expect(sample1d(0, 3, 0)).not.toBe(sample1d(1, 3, 0));
  const deep = sample1d(4, 8, 80);
  expect(deep).toBeGreaterThanOrEqual(0);
  expect(deep).toBeLessThan(1);
  expect(sobol0(0)).toBe(0);
  expect(sobol1(0)).toBe(0);
});
