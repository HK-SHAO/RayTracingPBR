import { aliasTable } from "./alias";

const FORMAT = "32-bit_rle_rgbe";

export type EnvMap = {
  width: number;
  height: number;
  rgb: Float32Array;
  pdf: Float32Array;
  cdfU: Float32Array;
  cdfV: Float32Array;
};

function rgbeToRgb(scan: Uint8Array, width: number, out: Float32Array, y: number) {
  for (let x = 0; x < width; x++) {
    const e = scan[x + width * 3]!;
    const f = e === 0 ? 0 : 2 ** (e - 128) / 256;
    const o = (y * width + x) * 3;
    out[o] = scan[x]! * f;
    out[o + 1] = scan[x + width]! * f;
    out[o + 2] = scan[x + width * 2]! * f;
  }
}

function headerBreak(data: Uint8Array): number {
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 10 && data[i + 1] === 10) return i;
  }
  throw new Error("HDR header");
}

export function decodeRgbe(data: Uint8Array): { width: number; height: number; rgb: Float32Array } {
  const breakAt = headerBreak(data);
  const header = new TextDecoder().decode(data.subarray(0, breakAt));
  if (!header.includes(FORMAT)) throw new Error("unsupported HDR");
  let i = breakAt + 2;
  const lineEnd = data.indexOf(0x0a, i);
  const res = new TextDecoder().decode(data.subarray(i, lineEnd)).trim().split(/\s+/);
  const height = Number(res[1]);
  const width = Number(res[3]);
  const rgb = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  i = lineEnd + 1;
  for (let y = 0; y < height; y++) {
    if (data[i] !== 2 || data[i + 1] !== 2) throw new Error("old-style RGBE is not supported");
    i += 4;
    for (let ch = 0; ch < 4; ch++) {
      let x = 0;
      while (x < width) {
        const count = data[i++]!;
        if (count > 128) {
          const run = count - 128;
          scan.fill(data[i++]!, ch * width + x, ch * width + x + run);
          x += run;
        } else {
          scan.set(data.subarray(i, i + count), ch * width + x);
          i += count;
          x += count;
        }
      }
    }
    rgbeToRgb(scan, width, rgb, y);
  }
  return { width, height, rgb };
}

export const MAX_PACKED_ENV_BYTES = 128 * 1024 * 1024;

export function packedEnvBytes(width: number, height: number): number {
  const n = width * height;
  return (n + Math.ceil((2 * n) / 4)) * 16;
}

export function envFitSize(
  width: number,
  height: number,
  maxBytes = MAX_PACKED_ENV_BYTES,
): [number, number] {
  if (packedEnvBytes(width, height) <= maxBytes) return [width, height];
  const aspect = height / Math.max(width, 1);
  let w = Math.max(1, Math.floor(Math.sqrt(maxBytes / (24 * aspect))));
  let h = Math.max(1, Math.round(w * aspect));
  while (packedEnvBytes(w, h) > maxBytes && w > 1) {
    w -= 1;
    h = Math.max(1, Math.round(w * aspect));
  }
  return [w, h];
}

export function resizeRgb(
  rgb: Float32Array,
  width: number,
  height: number,
  nextW: number,
  nextH: number,
): Float32Array {
  if (nextW === width && nextH === height) return rgb;
  const out = new Float32Array(nextW * nextH * 3);
  const sx = width / nextW;
  const sy = height / nextH;
  for (let y = 0; y < nextH; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < nextW; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 3;
          r += rgb[i] ?? 0;
          g += rgb[i + 1] ?? 0;
          b += rgb[i + 2] ?? 0;
          n += 1;
        }
      }
      const o = (y * nextW + x) * 3;
      const inv = n ? 1 / n : 0;
      out[o] = r * inv;
      out[o + 1] = g * inv;
      out[o + 2] = b * inv;
    }
  }
  return out;
}

export function fitEnvRgb(
  rgb: Float32Array,
  width: number,
  height: number,
  maxBytes = MAX_PACKED_ENV_BYTES,
): { rgb: Float32Array; width: number; height: number } {
  const [nextW, nextH] = envFitSize(width, height, maxBytes);
  return { rgb: resizeRgb(rgb, width, height, nextW, nextH), width: nextW, height: nextH };
}

export function texelSolidAngle(y: number, width: number, height: number): number {
  const dphi = (2 * Math.PI) / Math.max(width, 1);
  const theta0 = (y / Math.max(height, 1)) * Math.PI;
  const theta1 = ((y + 1) / Math.max(height, 1)) * Math.PI;
  return dphi * Math.max(0, Math.cos(theta0) - Math.cos(theta1));
}

export function envPdfIntegral(env: EnvMap): number {
  let sum = 0;
  for (let y = 0; y < env.height; y++) {
    const solid = texelSolidAngle(y, env.width, env.height);
    for (let x = 0; x < env.width; x++) {
      sum += (env.pdf[y * env.width + x] ?? 0) * solid;
    }
  }
  return sum;
}

export function buildEnv(rgb: Float32Array, width: number, height: number, exposure = 1.4): EnvMap {
  const n = width * height;
  const scaled = new Float32Array(n * 3);
  for (let i = 0; i < scaled.length; i++) scaled[i] = rgb[i]! * exposure;
  const pdf = new Float32Array(n);
  const cdfU = new Float32Array(n);
  const cdfV = new Float32Array(height);
  const row = new Float32Array(height);
  let total = 0;
  for (let y = 0; y < height; y++) {
    const area = texelSolidAngle(y, width, height);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const lum = Math.max(
        0,
        0.2126 * scaled[i]! + 0.7152 * scaled[i + 1]! + 0.0722 * scaled[i + 2]!,
      );
      const e = lum * area;
      pdf[y * width + x] = e;
      total += e;
    }
  }
  total = Math.max(total, 1e-16);
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = pdf[i]! / total;
      pdf[i] =
        (0.2126 * scaled[i * 3]! + 0.7152 * scaled[i * 3 + 1]! + 0.0722 * scaled[i * 3 + 2]!) /
        total;
      run += p;
      cdfU[i] = run;
    }
    const last = Math.max(cdfU[y * width + width - 1]!, 1e-16);
    for (let x = 0; x < width; x++) cdfU[y * width + x] = Math.min(1, cdfU[y * width + x]! / last);
    row[y] = run;
  }
  let acc = 0;
  const rowSum = row.reduce((s, v) => s + v, 0) || 1e-16;
  for (let y = 0; y < height; y++) {
    acc += row[y]! / rowSum;
    cdfV[y] = Math.min(1, acc);
  }
  return { width, height, rgb: scaled, pdf, cdfU, cdfV };
}

export function packEnv(env: EnvMap): Float32Array {
  const n = env.width * env.height;
  const out = new Float32Array((n + Math.ceil((2 * n) / 4)) * 4);
  const weights = new Float32Array(n);
  for (let y = 0; y < env.height; y++) {
    const solid = texelSolidAngle(y, env.width, env.height);
    for (let x = 0; x < env.width; x++) {
      const i = y * env.width + x;
      out[i * 4] = env.rgb[i * 3] ?? 0;
      out[i * 4 + 1] = env.rgb[i * 3 + 1] ?? 0;
      out[i * 4 + 2] = env.rgb[i * 3 + 2] ?? 0;
      out[i * 4 + 3] = env.pdf[i] ?? 0;
      weights[i] = Math.max(0, (env.pdf[i] ?? 0) * solid);
    }
  }
  const { accept, alias } = aliasTable(weights);
  const base = n * 4;
  for (let i = 0; i < n; i++) out[base + i] = accept[i] ?? 1;
  for (let i = 0; i < n; i++) out[base + n + i] = alias[i] ?? i;
  return out;
}

export const EMPTY_ENV: EnvMap = {
  width: 1,
  height: 1,
  rgb: new Float32Array(3),
  pdf: new Float32Array(1),
  cdfU: new Float32Array([1]),
  cdfV: new Float32Array([1]),
};
