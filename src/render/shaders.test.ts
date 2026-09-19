import { expect, test } from "vite-plus/test";
import { CLEAR_WGSL, PRESENT_WGSL, TRACE_WGSL } from "./shaders";

test("path tracer has no firefly clamp", () => {
  expect(TRACE_WGSL).not.toMatch(/\bfn fire\b/);
  expect(TRACE_WGSL).toContain("fn safe_inv");
  expect(TRACE_WGSL).toContain("LIGHT_TRI");
  expect(TRACE_WGSL).toContain("fn occluded");
  expect(TRACE_WGSL).toContain("tot_power");
  expect(TRACE_WGSL).toContain("nrm_off");
  expect(TRACE_WGSL).toContain("acos(clamp(rd.y");
  expect(TRACE_WGSL).not.toContain("asin(clamp(rd.y");
  expect(TRACE_WGSL).toContain("hide_ibl");
  expect(TRACE_WGSL).toMatch(/if \(!hit\.ok\) \{[\s\S]*?hide_ibl[\s\S]*?break;/);
  expect(TRACE_WGSL).not.toMatch(/hide_ibl == 0u\) \{\s*\n\s*radiance \+= beta \* next_event_env/);
  expect(TRACE_WGSL).toContain("aperture * 0.5");
  expect(TRACE_WGSL).toContain("L.pick");
  expect(TRACE_WGSL).toContain("trace.bounce == 0u || bounce < trace.bounce");
  expect(TRACE_WGSL).toContain("max3(beta * eta_scale)");
  expect(TRACE_WGSL).toContain("sampled.eta_scale");
  expect(TRACE_WGSL).toContain("fn sample_guided_bsdf");
  expect(TRACE_WGSL).toContain("atomicAdd(&guide_train");
  expect(TRACE_WGSL).toContain("mix(ev.pdf, g.pdf, mix_weight)");
});

test("present encodes aces for a linear unorm canvas", () => {
  expect(PRESENT_WGSL).toContain("aces(");
  expect(PRESENT_WGSL).toContain("1.0 / 2.2");
});

test("accum clear is a gpu kernel", () => {
  expect(CLEAR_WGSL).toContain("workgroup_size(64)");
});
