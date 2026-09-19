import type { CameraFrame } from "./camera";

export const PROBE_PATHS = 8;
export const PROBE_MAX = 48;
export const PROBE_STRIDE = 1 + PROBE_MAX * 2;
export const PROBE_FLOATS = PROBE_PATHS * PROBE_STRIDE * 4;
export const PROBE_BYTES = PROBE_FLOATS * 4;
export const PROBE_OFF = 0xffffffff;
export const PROBE_KIND_PATH = 0;
export const PROBE_KIND_NEE = 1;
export const PROBE_KIND_ENV = 2;

export type ProbeVert = {
  p: readonly [number, number, number];
  rgb: readonly [number, number, number];
  kind: number;
};

export type ProbePath = { verts: ProbeVert[] };

export type ProbeFrame = {
  paths: ProbePath[];
  view: CameraFrame;
  size: readonly [number, number];
  pixel: readonly [number, number];
  exposure: number;
  latest: number;
};

export type ProbeSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  kind: number;
  alpha: number;
};

export function parseProbe(data: Float32Array): ProbePath[] {
  const paths: ProbePath[] = [];
  for (let s = 0; s < PROBE_PATHS; s++) {
    const base = s * PROBE_STRIDE * 4;
    const n = Math.min(PROBE_MAX, Math.max(0, data[base] ?? 0)) | 0;
    const verts: ProbeVert[] = [];
    for (let i = 0; i < n; i++) {
      const o = base + 4 + i * 8;
      verts.push({
        p: [data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0],
        kind: data[o + 3] ?? 0,
        rgb: [data[o + 4] ?? 0, data[o + 5] ?? 0, data[o + 6] ?? 0],
      });
    }
    paths.push({ verts });
  }
  return paths;
}

export function project(
  p: readonly [number, number, number],
  view: CameraFrame,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const dx = p[0] - view.origin[0];
  const dy = p[1] - view.origin[1];
  const dz = p[2] - view.origin[2];
  const z = dx * view.forward[0] + dy * view.forward[1] + dz * view.forward[2];
  if (z <= 1e-4) return null;
  const x = dx * view.right[0] + dy * view.right[1] + dz * view.right[2];
  const y = dx * view.up[0] + dy * view.up[1] + dz * view.up[2];
  return {
    x: 0.5 * (1 + x / (z * view.halfW)) * width,
    y: 0.5 * (1 - y / (z * view.halfH)) * height,
  };
}

function aces(x: number): number {
  return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
}

function tone(rgb: readonly [number, number, number], exposure: number): string {
  const r = aces(Math.max(0, rgb[0]) * exposure) ** (1 / 2.2);
  const g = aces(Math.max(0, rgb[1]) * exposure) ** (1 / 2.2);
  const b = aces(Math.max(0, rgb[2]) * exposure) ** (1 / 2.2);
  const lift = 0.12;
  return `rgb(${Math.round((lift + (1 - lift) * r) * 255)} ${Math.round((lift + (1 - lift) * g) * 255)} ${Math.round((lift + (1 - lift) * b) * 255)})`;
}

export function projectPaths(frame: ProbeFrame): ProbeSeg[] {
  const [w, h] = frame.size;
  const segs: ProbeSeg[] = [];
  const n = frame.paths.length;
  for (let age = n - 1; age >= 0; age--) {
    const path = frame.paths[(((frame.latest - age) % n) + n) % n];
    if (!path || path.verts.length < 2) continue;
    const alpha = ((n - age) / n) * 0.92;
    let last: { x: number; y: number } | null = {
      x: frame.pixel[0] + 0.5,
      y: frame.pixel[1] + 0.5,
    };
    for (let v = 1; v < path.verts.length; v++) {
      const vert = path.verts[v]!;
      const to = project(vert.p, frame.view, w, h);
      if (last && to) {
        segs.push({
          x1: last.x,
          y1: last.y,
          x2: to.x,
          y2: to.y,
          color: tone(vert.rgb, frame.exposure),
          kind: vert.kind,
          alpha,
        });
      }
      if (vert.kind === PROBE_KIND_PATH) last = to;
    }
  }
  return segs;
}
