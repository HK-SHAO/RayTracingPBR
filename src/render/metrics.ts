export function pixelLum(bytes: Float32Array, i: number): number {
  const w = Math.max(bytes[i + 3] ?? 0, 1);
  return ((bytes[i] ?? 0) + (bytes[i + 1] ?? 0) + (bytes[i + 2] ?? 0)) / w;
}

export function meanLum(bytes: Float32Array): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    s += pixelLum(bytes, i);
    n += 1;
  }
  return s / Math.max(1, n);
}

export function mseLum(a: Float32Array, b: Float32Array): number {
  let e = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = pixelLum(a, i) - pixelLum(b, i);
    e += d * d;
    n += 1;
  }
  return e / Math.max(1, n);
}

export function patchStd(
  bytes: Float32Array,
  width: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  let mean = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      mean += pixelLum(bytes, (y * width + x) * 4);
      n += 1;
    }
  }
  mean /= Math.max(1, n);
  let v = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = pixelLum(bytes, (y * width + x) * 4) - mean;
      v += d * d;
    }
  }
  return Math.sqrt(v / Math.max(1, n));
}
