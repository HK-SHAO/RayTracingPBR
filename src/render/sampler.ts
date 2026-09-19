export const SOBOL_MAX_DIM = 64;
const D_BASE = 4;
export const BOUNCE_STRIDE = 20;
export const D_PIX = 0;
export const D_LENS = 2;
export const S_MIX = 0;
export const S_GUIDE = 1;
export const S_BSDF = 4;
export const S_LOBE = 6;
export const S_SEL = 7;
export const S_LIGHT = 9;
export const S_LIGHT_U = 10;
export const S_ENV = 15;
export const S_RR = 18;
export const S_RESERVOIR = 19;

export function bounceDim(bounce: number, slot: number): number {
  return D_BASE + bounce * BOUNCE_STRIDE + slot;
}

export function reverseBits(n: number): number {
  let x = n >>> 0;
  x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1);
  x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
  x = ((x >>> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
  x = ((x >>> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
  return ((x >>> 16) | (x << 16)) >>> 0;
}

export function sobol0(index: number): number {
  return reverseBits(index >>> 0);
}

export function sobol1(index: number): number {
  let x = 0;
  let c = 0x80000000;
  let n = index >>> 0;
  while (n) {
    if (n & 1) x ^= c;
    c ^= c >>> 1;
    n >>>= 1;
  }
  return x >>> 0;
}

export function owen(n: number, seed: number): number {
  let v = reverseBits(n);
  v = (v ^ Math.imul(v, 0x3d20adea)) >>> 0;
  v = (v + (seed >>> 0)) >>> 0;
  v = Math.imul(v, ((seed >>> 16) | 1) >>> 0) >>> 0;
  v = (v ^ Math.imul(v, 0x05526c56)) >>> 0;
  v = (v ^ Math.imul(v, 0x53a22864)) >>> 0;
  return reverseBits(v);
}

export function mixSeed(pixel: number, dim: number): number {
  let h = Math.imul(pixel >>> 0, 0x9e3779b9) ^ Math.imul(dim >>> 0, 0x85ebca6b);
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

function pcgKeyed(pixel: number, index: number, dim: number): number {
  let state =
    ((pixel >>> 0) ^ Math.imul(index >>> 0, 0x9e3779b9) ^ Math.imul(dim >>> 0, 0x85ebca6b)) >>> 0;
  state = Math.imul(state, 747796405) + 2891336453;
  state = state >>> 0;
  let word = (((state >>> ((state >>> 28) + 4)) ^ state) >>> 0) * 277803737;
  word = word >>> 0;
  word = ((word >>> 22) ^ word) >>> 0;
  return word * 2.3283064365386963e-10;
}

export function sample1d(pixel: number, index: number, dim: number): number {
  if (dim >= SOBOL_MAX_DIM) return pcgKeyed(pixel, index, dim);
  const raw = dim & 1 ? sobol1(index) : sobol0(index);
  return owen(raw, mixSeed(pixel, dim)) * 2.3283064365386963e-10;
}

export const WGSL_SAMPLER = /* wgsl */ `
const SOBOL_MAX_DIM = ${SOBOL_MAX_DIM}u;
const D_PIX = ${D_PIX}u;
const D_LENS = ${D_LENS}u;
const D_BASE = ${D_BASE}u;
const D_STRIDE = ${BOUNCE_STRIDE}u;
const S_MIX = ${S_MIX}u;
const S_GUIDE = ${S_GUIDE}u;
const S_BSDF = ${S_BSDF}u;
const S_LOBE = ${S_LOBE}u;
const S_SEL = ${S_SEL}u;
const S_LIGHT = ${S_LIGHT}u;
const S_LIGHT_U = ${S_LIGHT_U}u;
const S_ENV = ${S_ENV}u;
const S_RR = ${S_RR}u;
const S_RESERVOIR = ${S_RESERVOIR}u;

fn bounce_dim(bounce: u32, slot: u32) -> u32 { return D_BASE + bounce * D_STRIDE + slot; }
fn mix_seed(pixel: u32, dim: u32) -> u32 {
  var h = (pixel * 0x9e3779b9u) ^ (dim * 0x85ebca6bu);
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  return h;
}
fn owen(n: u32, seed: u32) -> u32 {
  var v = reverseBits(n);
  v ^= v * 0x3d20adeau;
  v += seed;
  v *= (seed >> 16u) | 1u;
  v ^= v * 0x05526c56u;
  v ^= v * 0x53a22864u;
  return reverseBits(v);
}
fn sobol0(index: u32) -> u32 { return reverseBits(index); }
fn sobol1(index: u32) -> u32 {
  var x = 0u;
  var c = 0x80000000u;
  var n = index;
  while (n != 0u) {
    if ((n & 1u) != 0u) { x ^= c; }
    c ^= c >> 1u;
    n >>= 1u;
  }
  return x;
}
fn sample1d(pixel: u32, dim: u32) -> f32 {
  if (dim >= SOBOL_MAX_DIM) {
    var s = (pixel ^ (trace.frame * 0x9e3779b9u)) ^ (dim * 0x85ebca6bu);
    return pcg(&s);
  }
  let raw = select(sobol0(trace.frame), sobol1(trace.frame), (dim & 1u) == 1u);
  return f32(owen(raw, mix_seed(pixel, dim))) * 2.3283064365386963e-10;
}
fn sample2d(pixel: u32, dim: u32) -> vec2f { return vec2f(sample1d(pixel, dim), sample1d(pixel, dim + 1u)); }
`;
