import { compute, init, storage } from "vgpu/node";
import { expect, test } from "vite-plus/test";
import { WGSL_BSDF, WGSL_CORE } from "./shaders";

const TEST_WGSL = `${WGSL_CORE}\n${WGSL_BSDF}
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@compute @workgroup_size(1)
fn main() {
  let mirror = sample_bsdf(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, 1.0), vec3f(0.9, 0.8, 0.7), 0.0, 1.0, 0.0, 1.5, true, vec2f(0.3), 0.5, vec2f(0.5));
  dst[0] = vec4f(mirror.wi, f32(mirror.delta));
  dst[1] = vec4f(mirror.weight, mirror.eta_scale);
  let glass = sample_bsdf(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, 1.0), vec3f(1.0), 0.0, 0.0, 1.0, 1.5, true, vec2f(0.3), 0.5, vec2f(0.5));
  dst[2] = vec4f(glass.wi, f32(glass.delta));
  dst[3] = vec4f(glass.weight, glass.eta_scale);
}`;

test("zero-roughness conductor and dielectric are exact delta events", async () => {
  const gpu = await init();
  try {
    const out = storage(gpu, 64);
    const kernel = compute(gpu, TEST_WGSL);
    kernel.set({ dst: out });
    kernel.dispatch(1);
    const values = new Float32Array(await out.read());
    expect(Array.from(values.slice(0, 4))).toEqual([0, 0, 1, 1]);
    expect(values[4]).toBeCloseTo(0.9, 5);
    expect(values[5]).toBeCloseTo(0.8, 5);
    expect(values[6]).toBeCloseTo(0.7, 5);
    expect(values[7]).toBe(1);
    expect(Array.from(values.slice(8, 12))).toEqual([0, 0, -1, 1]);
    expect(values[12]).toBeCloseTo(1 / 2.25, 5);
    expect(values[13]).toBeCloseTo(1 / 2.25, 5);
    expect(values[14]).toBeCloseTo(1 / 2.25, 5);
    expect(values[15]).toBeCloseTo(2.25, 5);
  } finally {
    gpu.dispose();
  }
});
