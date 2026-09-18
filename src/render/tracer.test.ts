import { expect, test } from "vite-plus/test";
import { traceSamples } from "./headless";
import { classic } from "../scene/plugins/classic";
import { glass } from "../scene/plugins/glass";
import { mirror } from "../scene/plugins/mirror";
import { mis } from "../scene/plugins/mis";
import { studio } from "../scene/plugins/studio";

const skipGpu = process.env.VGPU_SKIP_GPU === "1";

function meanLum(bytes: Float32Array): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const w = Math.max(bytes[i + 3] ?? 0, 1);
    sum += ((bytes[i] ?? 0) + (bytes[i + 1] ?? 0) + (bytes[i + 2] ?? 0)) / w;
    n += 1;
  }
  return n ? sum / n : 0;
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
  "mis scene accumulates light",
  async () => {
    const { gpu: context, bytes } = await traceSamples(32, 32, 4, mis);
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
  "mirror room accumulates light",
  async () => {
    const { gpu: context, bytes } = await traceSamples(32, 32, 4, mirror);
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
