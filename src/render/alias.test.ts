import { expect, test } from "vite-plus/test";
import { aliasTable } from "./alias";

test("alias samples match weights", () => {
  const w = new Float32Array([1, 3, 2, 4]);
  const { accept, alias } = aliasTable(w);
  const sum = 10;
  const hist = new Float64Array(4);
  const n = 200_000;
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) / n;
    const i = Math.min(3, Math.floor(x * 4));
    const f = x * 4 - i;
    const j = f < (accept[i] ?? 0) ? i : (alias[i] ?? i);
    hist[j] = (hist[j] ?? 0) + 1;
  }
  for (let i = 0; i < 4; i++) {
    expect(hist[i]! / n).toBeCloseTo((w[i] ?? 0) / sum, 2);
  }
});

test("uniform weights always accept", () => {
  const { accept, alias } = aliasTable([1, 1, 1, 1]);
  expect([...accept].every((a) => a >= 1 - 1e-6)).toBe(true);
  expect(alias.length).toBe(4);
});
