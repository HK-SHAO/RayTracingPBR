import { expect, test } from "vite-plus/test";
import { iblHdr, readBytes } from "../media";
import {
  buildEnv,
  decodeRgbe,
  envFitSize,
  envPdfIntegral,
  packedEnvBytes,
  texelSolidAngle,
} from "./hdr";

test("texel solid angles tile the sphere and constant luminance is 1/4π", () => {
  const width = 8;
  const height = 4;
  let omega = 0;
  for (let y = 0; y < height; y++) omega += width * texelSolidAngle(y, width, height);
  expect(omega).toBeCloseTo(4 * Math.PI, 6);
  expect(texelSolidAngle(0, width, height)).toBeLessThan(texelSolidAngle(1, width, height));
  const rgb = new Float32Array(width * height * 3).fill(1);
  const env = buildEnv(rgb, width, height, 1);
  expect(env.pdf[0]).toBeCloseTo(1 / (4 * Math.PI), 5);
  expect(envPdfIntegral(env)).toBeCloseTo(1, 5);
});

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
