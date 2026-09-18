import { expect, test } from "vite-plus/test";
import { iblHdr, readBytes } from "../media";
import {
  buildEnv,
  decodeRgbe,
  envFitSize,
  envPdfIntegral,
  packedEnvBytes,
  packEnv,
  resizeRgb,
} from "./hdr";

test("IBL HDR decodes and has energy", async () => {
  const decoded = decodeRgbe(await readBytes(iblHdr));
  expect(decoded.width).toBeGreaterThan(1000);
  expect(decoded.height).toBeGreaterThan(500);
  const env = buildEnv(decoded.rgb, decoded.width, decoded.height, 1);
  expect(env.cdfV[env.cdfV.length - 1]).toBeCloseTo(1, 2);
  expect(envPdfIntegral(env)).toBeCloseTo(1, 1);
  const mean = env.rgb.reduce((s, v) => s + v, 0) / env.rgb.length;
  expect(mean).toBeGreaterThan(0.01);
  let max = 0;
  for (let i = 0; i < decoded.rgb.length; i += 97) {
    const v = decoded.rgb[i] ?? 0;
    if (v > max) max = v;
  }
  expect(max).toBeGreaterThan(1);
});

test("packed env fits the default WebGPU storage bind limit", () => {
  const [w, h] = envFitSize(3200, 1600);
  expect(packedEnvBytes(3200, 1600)).toBe(122880000);
  expect(packedEnvBytes(w, h)).toBeLessThanOrEqual(134217728);
  expect(w).toBeGreaterThan(2000);
});

test("resizeRgb averages a 2x2 tile", () => {
  const rgb = new Float32Array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0]);
  const out = resizeRgb(rgb, 2, 2, 1, 1);
  expect(out[0]).toBeCloseTo(0.5);
  expect(out[1]).toBeCloseTo(0.5);
  expect(out[2]).toBeCloseTo(0);
});

test("packEnv stores alias weights after rgb", () => {
  const env = buildEnv(new Float32Array([1, 1, 1, 4, 4, 4, 1, 1, 1, 1, 1, 1]), 2, 2, 1);
  const packed = packEnv(env);
  expect(packed.byteLength).toBe(packedEnvBytes(2, 2));
  const n = 4;
  expect(packed[n * 4] ?? 0).toBeGreaterThan(0);
  expect(packed[n * 4 + n] ?? -1).toBeGreaterThanOrEqual(0);
});
