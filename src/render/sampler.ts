export function mixSeed(pixel: number, frame: number): number {
  let h = Math.imul((pixel + 1) >>> 0, 0x9e3779b9) ^ Math.imul(frame >>> 0, 0x85ebca6b);
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
