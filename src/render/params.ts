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
  { key: "bounce", min: -1, max: 64, step: 1, reset: true },
  { key: "env", min: 0, max: 3, step: 0.05, reset: true },
];

export const DEV_PARAM_KEYS = [
  "vfov",
  "focus",
  "aperture",
  "exposure",
  "bounce",
  "env",
  "hideIbl",
] as const satisfies readonly (keyof DevParams)[];

const RESET = new Set(DEV_KNOBS.filter((k) => k.reset).map((k) => k.key));

export function defaultsFor(plugin: ScenePlugin): DevParams {
  return {
    vfov: plugin.camera.vfov,
    focus: plugin.camera.radius,
    aperture: plugin.aperture ?? 0,
    exposure: plugin.exposure,
    bounce: -1,
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
  if (key === "bounce") return value === -1 ? "∞" : String(value);
  if (key === "hideIbl") return String(value);
  if (key === "aperture") return value.toFixed(3);
  if (key === "vfov") return value.toFixed(1);
  return value.toFixed(2);
}

export function clampParam(key: keyof DevParams, value: number): number {
  if (key === "hideIbl") return value >= 0.5 ? 1 : 0;
  const knob = DEV_KNOBS.find((item) => item.key === key);
  if (!knob) return value;
  const n = key === "bounce" ? Math.round(value) : value;
  return Math.min(knob.max, Math.max(knob.min, n));
}

export function mergeParams(base: DevParams, patch: Partial<DevParams>): DevParams {
  const next = { ...base };
  for (const key of DEV_PARAM_KEYS) {
    const value = patch[key];
    if (value === undefined || !Number.isFinite(value)) continue;
    next[key] = clampParam(key, value);
  }
  return next;
}
