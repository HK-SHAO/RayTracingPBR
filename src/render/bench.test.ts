import { writeFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { classic } from "../scene/plugins/classic";
import { GUIDE_FIRST_EPOCH } from "./guiding";
import { traceSamples } from "./headless";
import { meanLum, mseLum } from "./metrics";

const skip = process.env.VGPU_SKIP_GPU === "1" || process.env.TRACE_BENCH !== "1";

test.skipIf(skip)(
  "compare protocol vs baseline",
  async () => {
    const w = 48;
    await traceSamples(16, 16, 2, undefined, false);

    const tC = performance.now();
    const cornell128 = await traceSamples(w, w, 128, undefined, false);
    const cornellMs = performance.now() - tC;

    const a8 = await traceSamples(w, w, 8, undefined, false);
    const a32 = await traceSamples(w, w, 32, undefined, false);
    const a256 = await traceSamples(w, w, 256, undefined, false);

    const spp = GUIDE_FIRST_EPOCH + 48;
    const guided = await traceSamples(32, 32, spp, undefined, true);
    const unguided = await traceSamples(32, 32, spp, undefined, false);
    const g = meanLum(guided.bytes);
    const u = meanLum(unguided.bytes);

    const tD = performance.now();
    const dragon64 = await traceSamples(w, w, 64, classic, false);
    const dragonMs = performance.now() - tD;
    const d8 = await traceSamples(w, w, 8, classic, false);
    const d256 = await traceSamples(w, w, 256, classic, false);

    const report = {
      cornellMs128: cornellMs,
      cornellMean128: meanLum(cornell128.bytes),
      cornellMse8vs256: mseLum(a8.bytes, a256.bytes),
      cornellMse32vs256: mseLum(a32.bytes, a256.bytes),
      cornellMean32: meanLum(a32.bytes),
      cornellMean256: meanLum(a256.bytes),
      guidedMean: g,
      unguidedMean: u,
      guideRel: Math.abs(g - u) / Math.max(u, 1e-6),
      dragonMs64: dragonMs,
      dragonMean64: meanLum(dragon64.bytes),
      dragonMse8vs256: mseLum(d8.bytes, d256.bytes),
      dragonMean256: meanLum(d256.bytes),
    };
    writeFileSync("bench-out.json", JSON.stringify(report, null, 2));
    expect(report.cornellMean128).toBeGreaterThan(0.05);
    for (const run of [cornell128, a8, a32, a256, guided, unguided, dragon64, d8, d256]) {
      run.gpu.dispose();
    }
  },
  300_000,
);
