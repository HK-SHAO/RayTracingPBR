import { writeFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { classic } from "../scene/plugins/classic";
import { traceSamples } from "./headless";
import { meanLum, mseLum } from "./metrics";

const skip = process.env.VGPU_SKIP_GPU === "1" || process.env.TRACE_BENCH !== "1";

test.skipIf(skip)(
  "trace throughput and spp convergence",
  async () => {
    const w = 32;
    await traceSamples(16, 16, 2, classic, false);
    const t0 = performance.now();
    const a = await traceSamples(w, w, 64, classic, false);
    const b = await traceSamples(w, w, 64, classic, false);
    const ms64 = performance.now() - t0;
    const t1 = performance.now();
    const c = await traceSamples(w, w, 256, classic, false);
    const d = await traceSamples(w, w, 256, classic, false);
    const ms256 = performance.now() - t1;
    const report = {
      ms64,
      ms256,
      mean64: meanLum(a.bytes),
      mean256: meanLum(c.bytes),
      mse64: mseLum(a.bytes, b.bytes),
      mse256: mseLum(c.bytes, d.bytes),
    };
    writeFileSync("bench-out.json", JSON.stringify(report, null, 2));
    expect(report.mean64).toBeGreaterThan(0.02);
    a.gpu.dispose();
    b.gpu.dispose();
    c.gpu.dispose();
    d.gpu.dispose();
  },
  180_000,
);
