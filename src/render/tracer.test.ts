import { expect, test } from "vite-plus/test";
import { traceSamples } from "./headless";
import { classic } from "../scene/plugins/classic";
import { glass } from "../scene/plugins/glass";
import { studio } from "../scene/plugins/studio";
import { GUIDE_FIRST_EPOCH } from "./guiding";
import { parseProbe } from "./probe";

const skipGpu = process.env.VGPU_SKIP_GPU === "1";

function meanRgb(bytes: Float32Array): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const w = Math.max(bytes[i + 3] ?? 0, 1);
    r += (bytes[i] ?? 0) / w;
    g += (bytes[i + 1] ?? 0) / w;
    b += (bytes[i + 2] ?? 0) / w;
    n += 1;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

function meanLum(bytes: Float32Array): number {
  const [r, g, b] = meanRgb(bytes);
  return r + g + b;
}

test.skipIf(skipGpu)(
  "cornell left wall is redder than the right",
  async () => {
    const { gpu: context, bytes } = await traceSamples(48, 48, 8);
    try {
      let leftR = 0;
      let rightG = 0;
      let n = 0;
      for (let y = 16; y < 32; y++) {
        for (let x = 2; x < 10; x++) {
          const i = (y * 48 + x) * 4;
          const w = Math.max(bytes[i + 3] ?? 0, 1);
          leftR += (bytes[i] ?? 0) / w;
          n += 1;
        }
      }
      let m = 0;
      for (let y = 16; y < 32; y++) {
        for (let x = 38; x < 46; x++) {
          const i = (y * 48 + x) * 4;
          const w = Math.max(bytes[i + 3] ?? 0, 1);
          rightG += (bytes[i + 1] ?? 0) / w;
          m += 1;
        }
      }
      leftR /= n;
      rightG /= m;
      expect(leftR).toBeGreaterThan(0.02);
      expect(rightG).toBeGreaterThan(0.02);
      expect(leftR).toBeGreaterThan(rightG * 0.25);
    } finally {
      context.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "path guiding with continuation MIS matches unguided mean",
  async () => {
    const spp = GUIDE_FIRST_EPOCH + 48;
    const guided = await traceSamples(32, 32, spp, undefined, true);
    try {
      const unguided = await traceSamples(32, 32, spp, undefined, false);
      try {
        const a = meanRgb(guided.bytes);
        const b = meanRgb(unguided.bytes);
        for (let c = 0; c < 3; c++) {
          const ref = Math.max(b[c] ?? 0, 1e-6);
          expect(Math.abs((a[c] ?? 0) - (b[c] ?? 0)) / ref).toBeLessThan(0.12);
        }
        expect(guided.guideWeights.some((weight) => weight > 0)).toBe(true);
      } finally {
        unguided.gpu.dispose();
      }
    } finally {
      guided.gpu.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "path guiding learns indirect directions",
  async () => {
    const { gpu: context, guideWeights } = await traceSamples(24, 24, GUIDE_FIRST_EPOCH + 1);
    try {
      expect(guideWeights.some((weight) => weight > 0)).toBe(true);
    } finally {
      context.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "probe records a camera-to-hit segment",
  async () => {
    const { gpu: context, probeData } = await traceSamples(
      24,
      24,
      4,
      undefined,
      false,
      -1,
      [12, 12],
    );
    try {
      const paths = parseProbe(probeData);
      const live = paths.filter((path) => path.verts.length >= 2);
      expect(live.length).toBeGreaterThan(0);
      expect(live.some((path) => path.verts[0]?.kind === 0)).toBe(true);
    } finally {
      context.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "zero bounces still evaluates camera-visible direct light",
  async () => {
    const { gpu: context, bytes } = await traceSamples(24, 24, 4, undefined, false, 0);
    try {
      expect(meanLum(bytes)).toBeGreaterThan(0.01);
    } finally {
      context.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "classic mesh is visible",
  async () => {
    const { gpu: context, bytes } = await traceSamples(48, 48, 4, classic);
    try {
      expect(meanLum(bytes)).toBeGreaterThan(0.005);
    } finally {
      context.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "glass shell accumulates light",
  async () => {
    const { gpu: context, bytes } = await traceSamples(32, 32, 4, glass);
    try {
      expect(meanLum(bytes)).toBeGreaterThan(0.001);
    } finally {
      context.dispose();
    }
  },
  120_000,
);

test.skipIf(skipGpu)(
  "studio ibl lights the ground",
  async () => {
    const { gpu: context, bytes } = await traceSamples(32, 32, 4, studio);
    try {
      expect(meanLum(bytes)).toBeGreaterThan(0.005);
    } finally {
      context.dispose();
    }
  },
  120_000,
);
