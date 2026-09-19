export const RR_START_DEPTH = 4;
export const RR_MIN_SURVIVAL = 0.05;
export const RR_MAX_SURVIVAL = 0.95;

export function rouletteSurvival(throughput: readonly [number, number, number]): number {
  return Math.min(RR_MAX_SURVIVAL, Math.max(RR_MIN_SURVIVAL, ...throughput));
}
