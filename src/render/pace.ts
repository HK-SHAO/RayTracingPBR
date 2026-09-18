export const TARGET_FPS = 30;
export const TARGET_MS = 1000 / TARGET_FPS;
export const MIN_BURST = 1;
export const MAX_BURST = 1024;
export const FPS_WINDOW = 48;
export const FPS_AVG_MS = 1000;
export const FILL = 0.75;

export function nextBurst(burst: number, usedMs: number, samples = burst): number {
  if (usedMs <= 0 || samples <= 0) return burst;
  const budget = TARGET_MS * FILL;
  const want = Math.round(budget / (usedMs / samples));
  const target = Math.min(MAX_BURST, Math.max(MIN_BURST, want));
  if (target > burst) return Math.min(MAX_BURST, burst + 1);
  if (target < burst) {
    const over = usedMs > TARGET_MS;
    const drop = over ? Math.max(2, Math.ceil((burst - target) / 2)) : 1;
    return Math.max(MIN_BURST, burst - Math.min(burst - target, drop));
  }
  if (usedMs > budget && burst > MIN_BURST) return burst - 1;
  return burst;
}

export function shouldDrain(gpuMs: number): boolean {
  return gpuMs > TARGET_MS * 0.85;
}

export function mixMs(ema: number, sample: number, alpha = 0.35): number {
  if (ema <= 0) return sample;
  return ema * (1 - alpha) + sample * alpha;
}

export function waitMs(startedAt: number, now: number): number {
  return Math.max(0, startedAt + TARGET_MS - now);
}

export function pushPresent(times: number[], now: number, windowMs = FPS_AVG_MS): void {
  times.push(now);
  const cut = now - windowMs;
  let drop = 0;
  while (drop + 1 < times.length && (times[drop] ?? 0) < cut) drop += 1;
  if (drop) times.splice(0, drop);
}

export function averageFps(times: readonly number[]): number {
  if (times.length < 2) return 0;
  const dt = (times[times.length - 1] ?? 0) - (times[0] ?? 0);
  if (dt <= 0) return 0;
  return ((times.length - 1) * 1000) / dt;
}
