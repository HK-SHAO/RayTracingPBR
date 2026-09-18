import type { ScenePlugin } from "../scene/types";

export type DevParams = {
  vfov: number;
  focus: number;
  aperture: number;
  exposure: number;
  bounce: number;
  env: number;
  hideIbl: number;
};

export type DevKnob = {
  key: keyof DevParams;
  min: number;
  max: number;
  step: number;
  reset: boolean;
};

export const DEV_KNOBS: readonly DevKnob[] = [
  { key: "vfov", min: 18, max: 80, step: 0.5, reset: true },
  { key: "focus", min: 0.3, max: 16, step: 0.05, reset: true },
  { key: "aperture", min: 0, max: 0.2, step: 0.002, reset: true },
  { key: "exposure", min: 0.1, max: 4, step: 0.05, reset: false },
  { key: "bounce", min: 1, max: 12, step: 1, reset: true },
  { key: "env", min: 0, max: 3, step: 0.05, reset: true },
];

const RESET = new Set(DEV_KNOBS.filter((k) => k.reset).map((k) => k.key));

export function defaultsFor(plugin: ScenePlugin): DevParams {
  return {
    vfov: plugin.camera.vfov,
    focus: plugin.camera.radius,
    aperture: plugin.aperture ?? 0,
    exposure: plugin.exposure,
    bounce: 8,
    env: 1,
    hideIbl: plugin.hideIblDirect ? 1 : 0,
  };
}

export function needsReset(prev: DevParams, next: DevParams): boolean {
  if (prev.hideIbl !== next.hideIbl) return true;
  for (const key of RESET) if (prev[key] !== next[key]) return true;
  return false;
}

export function formatParam(key: keyof DevParams, value: number): string {
  if (key === "bounce") return String(value);
  if (key === "aperture") return value.toFixed(3);
  if (key === "vfov") return value.toFixed(1);
  return value.toFixed(2);
}
