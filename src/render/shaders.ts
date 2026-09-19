import { RR_MAX_SURVIVAL, RR_MIN_SURVIVAL, RR_START_DEPTH } from "./roulette";
import {
  GUIDE_CELL_COUNT,
  GUIDE_DIR_COUNT,
  GUIDE_FIRST_EPOCH,
  GUIDE_INC_MAX,
  GUIDE_PHI_BINS,
  GUIDE_PROBES,
  GUIDE_STRIDE,
  GUIDE_Z_BINS,
} from "./guiding";
import { PROBE_MAX, PROBE_PATHS, PROBE_STRIDE } from "./probe";
import { WGSL_SAMPLER } from "./sampler";

const wgslCore = (probe: boolean) => /* wgsl */ `
const PI = 3.141592653589793;
const RAY_EPS = 1e-4;
const OFFSET_EPS = 1e-3;
const MATH_EPS = 1e-8;
const T_MAX = 1e4;
const MIN_ALPHA = 0.002;
const RR_START = ${RR_START_DEPTH - 1}u;
const RR_MIN = ${RR_MIN_SURVIVAL};
const RR_MAX = ${RR_MAX_SURVIVAL};
const GUIDE_CELLS = ${GUIDE_CELL_COUNT}u;
const GUIDE_DIRS = ${GUIDE_DIR_COUNT}u;
const GUIDE_STRIDE = ${GUIDE_STRIDE}u;
const GUIDE_PROBES = ${GUIDE_PROBES}u;
const GUIDE_INC_MAX = ${GUIDE_INC_MAX}u;
const GUIDE_PHI = ${GUIDE_PHI_BINS}u;
const GUIDE_Z = ${GUIDE_Z_BINS}u;
const GUIDE_MIX = 0.5;
const GUIDE_CELL_SIZE = 0.5;
const GUIDE_MIN_WEIGHT = 64u;
const GUIDE_FIRST = ${GUIDE_FIRST_EPOCH}u;
${
  probe
    ? `const PROBE_PATHS = ${PROBE_PATHS}u;
const PROBE_MAX = ${PROBE_MAX}u;
const PROBE_STRIDE = ${PROBE_STRIDE}u;`
    : ""
}

const KIND_SPHERE = 0u;
const KIND_PLANE = 1u;
const KIND_QUAD = 2u;
const KIND_BOX = 3u;
const KIND_CYL = 4u;
const LIGHT_QUAD = 0u;
const LIGHT_SPHERE = 1u;
const LIGHT_CYL = 2u;
const LIGHT_TRI = 3u;

struct Trace {
  origin: vec3f,
  half_w: f32,
  right: vec3f,
  half_h: f32,
  up: vec3f,
  frame: u32,
  forward: vec3f,
  size_x: u32,
  size_y: u32,
  bounce: i32,
  prim_count: u32,
  light_count: u32,
  tri_count: u32,
  prim_off: u32,
  light_off: u32,
  mat_off: u32,
  tri_off: u32,
  node_off: u32,
  use_ibl: u32,
  env_w: u32,
  env_h: u32,
  focus: f32,
  aperture: f32,
  env_gain: f32,
  tot_power: f32,
  nrm_off: u32,
  n_sphere: u32,
  n_plane: u32,
  n_quad: u32,
  n_box: u32,
  n_cyl: u32,
  hide_ibl: u32,
  spp_k: u32,
  prim_node_off: u32,${
    probe
      ? `
  probe_x: u32,
  probe_y: u32,`
      : ""
  }
}

struct Prim { kind: u32, mat: u32, _0: u32, _1: u32, a: vec4f, b: vec4f, c: vec4f }
struct Light { kind: u32, prim: u32, le_x: f32, area: f32, origin: vec4f, u: vec4f, v: vec4f, pick: vec4f }
struct Mat { albedo: vec4f, emit: vec4f, extra: vec4f }
struct TriPos { a: vec4f, b: vec4f, c: vec4f }
struct TriN { n0: vec4f, n1: vec4f, n2: vec4f }
struct Node { bmin: vec4f, bmax: vec4f }
struct Isect { t: f32, prim: i32, tri: u32, bu: f32, bv: f32 }

@group(0) @binding(0) var<uniform> trace: Trace;
@group(0) @binding(1) var<storage, read_write> accum: array<vec4f>;
@group(0) @binding(3) var<storage, read> env: array<vec4f>;
@group(0) @binding(4) var<storage, read> world: array<vec4f>;
@group(0) @binding(5) var<storage, read> guide: array<u32>;
@group(0) @binding(6) var<storage, read_write> guide_train: array<atomic<u32>>;
${
  probe
    ? `@group(0) @binding(7) var<storage, read_write> probe: array<vec4f>;

fn probe_push(rec: bool, n: ptr<function, u32>, p: vec3f, rgb: vec3f, kind: f32) {
  if (!rec || *n >= PROBE_MAX) { return; }
  let b = (trace.frame % PROBE_PATHS) * PROBE_STRIDE;
  let i = *n;
  probe[b + 1u + i * 2u] = vec4f(p, kind);
  probe[b + 2u + i * 2u] = vec4f(max(rgb, vec3f(0.0)), 0.0);
  *n += 1u;
  probe[b] = vec4f(f32(*n), 0.0, 0.0, 0.0);
}`
    : ""
}

fn load_prim(i: u32) -> Prim {
  var p: Prim;
  let o = trace.prim_off + i * 4u;
  let h = world[o];
  p.kind = bitcast<u32>(h.x); p.mat = bitcast<u32>(h.y); p._0 = bitcast<u32>(h.z); p._1 = bitcast<u32>(h.w);
  p.a = world[o + 1u]; p.b = world[o + 2u]; p.c = world[o + 3u];
  return p;
}
fn load_prim_slot(i: u32, slot: u32) -> vec4f {
  return world[trace.prim_off + i * 4u + slot];
}
fn load_light(i: u32) -> Light {
  var L: Light;
  let o = trace.light_off + i * 5u;
  let h = world[o];
  L.kind = bitcast<u32>(h.x); L.prim = bitcast<u32>(h.y); L.le_x = h.z; L.area = h.w;
  L.origin = world[o + 1u]; L.u = world[o + 2u]; L.v = world[o + 3u]; L.pick = world[o + 4u];
  return L;
}
fn load_mat(i: u32) -> Mat {
  var m: Mat;
  let o = trace.mat_off + i * 3u;
  m.albedo = world[o]; m.emit = world[o + 1u]; m.extra = world[o + 2u];
  return m;
}
fn load_tri_pos(i: u32) -> TriPos {
  var t: TriPos;
  let o = trace.tri_off + i * 3u;
  t.a = world[o]; t.b = world[o + 1u]; t.c = world[o + 2u];
  return t;
}
fn load_tri_n(i: u32) -> TriN {
  var t: TriN;
  let o = trace.nrm_off + i * 3u;
  t.n0 = world[o]; t.n1 = world[o + 1u]; t.n2 = world[o + 2u];
  return t;
}
fn load_node_at(off: u32, i: u32) -> Node {
  var n: Node;
  let o = off + i * 2u;
  n.bmin = world[o]; n.bmax = world[o + 1u];
  return n;
}
fn load_node(i: u32) -> Node { return load_node_at(trace.node_off, i); }

struct Hit {
  ok: bool,
  t: f32,
  p: vec3f,
  n: vec3f,
  gn: vec3f,
  albedo: vec3f,
  emission: vec3f,
  roughness: f32,
  metallic: f32,
  transmission: f32,
  ior: f32,
  prim: i32,
  tri: u32,
}

struct Sampled { wi: vec3f, weight: vec3f, pdf: f32, eta_scale: f32, delta: u32 }
struct Evaluated { f: vec3f, pdf: f32 }
struct Bsdf { albedo: vec3f, roughness: f32, metallic: f32, transmission: f32, ior: f32, enter: bool }
struct Frame { t: vec3f, b: vec3f, n: vec3f }
struct Vertex { p: vec3f, gn: vec3f, f: Frame, b: Bsdf, cell: u32 }

fn pcg(state: ptr<function, u32>) -> f32 {
  *state = *state * 747796405u + 2891336453u;
  var word = ((*state >> ((*state >> 28u) + 4u)) ^ *state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) * 2.3283064365386963e-10;
}
${WGSL_SAMPLER}
fn disk(u: vec2f) -> vec2f {
  let p = u * 2.0 - vec2f(1.0);
  if (abs(p.x) < MATH_EPS && abs(p.y) < MATH_EPS) { return vec2f(0.0); }
  var r = 0.0;
  var phi = 0.0;
  if (abs(p.x) > abs(p.y)) { r = p.x; phi = (PI * 0.25) * (p.y / p.x); }
  else { r = p.y; phi = (PI * 0.5) - (PI * 0.25) * (p.x / p.y); }
  return vec2f(cos(phi), sin(phi)) * r;
}
fn mis2(a: f32, b: f32) -> f32 { let a2 = a * a; return a2 / (a2 + b * b); }
fn lum(c: vec3f) -> f32 { return 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z; }
fn max3(v: vec3f) -> f32 { return max(v.x, max(v.y, v.z)); }
fn safe_inv(d: vec3f) -> vec3f {
  return vec3f(
    select(1e8, 1.0 / d.x, abs(d.x) > 1e-8),
    select(1e8, 1.0 / d.y, abs(d.y) > 1e-8),
    select(1e8, 1.0 / d.z, abs(d.z) > 1e-8)
  );
}

fn frame_n(n: vec3f) -> Frame {
  var f: Frame;
  f.n = n;
  let sign = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (sign + n.z);
  let k = n.x * n.y * a;
  f.t = vec3f(1.0 + sign * n.x * n.x * a, sign * k, -sign * n.x);
  f.b = vec3f(k, sign + n.y * n.y * a, -n.y);
  return f;
}
fn to_world(f: Frame, v: vec3f) -> vec3f { return f.t * v.x + f.b * v.y + f.n * v.z; }
fn to_local(f: Frame, v: vec3f) -> vec3f { return vec3f(dot(f.t, v), dot(f.b, v), dot(f.n, v)); }

fn spatial_key(p: vec3f) -> u32 {
  let q = bitcast<vec3u>(vec3i(floor(p / GUIDE_CELL_SIZE)));
  var h = (q.x * 0x8da6b343u) ^ (q.y * 0xd8163841u) ^ (q.z * 0xcb1ab31fu);
  h ^= h >> 16u;
  return max(h, 1u);
}
fn guide_bin_at(slot: u32, bin: u32) -> u32 { return slot * GUIDE_STRIDE + 1u + bin; }
fn guide_lookup(p: vec3f) -> u32 {
  let key = spatial_key(p);
  for (var i = 0u; i < GUIDE_PROBES; i++) {
    let s = (key + i) % GUIDE_CELLS;
    if (guide[s * GUIDE_STRIDE] == key) { return s; }
  }
  return GUIDE_CELLS;
}
fn claim_train(key: u32) -> u32 {
  for (var i = 0u; i < GUIDE_PROBES; i++) {
    let s = (key + i) % GUIDE_CELLS;
    let ki = s * GUIDE_STRIDE;
    loop {
      let prev = atomicLoad(&guide_train[ki]);
      if (prev == key) { return s; }
      if (prev != 0u) { break; }
      let r = atomicCompareExchangeWeak(&guide_train[ki], 0u, key);
      if (r.exchanged || r.old_value == key) { return s; }
      if (r.old_value != 0u) { break; }
    }
  }
  return GUIDE_CELLS;
}
fn guide_bin_local(wi: vec3f) -> u32 {
  let phi = atan2(wi.y, wi.x) + PI;
  let p = min(GUIDE_PHI - 1u, u32(phi * f32(GUIDE_PHI) / (2.0 * PI)));
  let z = min(GUIDE_Z - 1u, u32(clamp(wi.z, 0.0, 1.0) * f32(GUIDE_Z)));
  return z * GUIDE_PHI + p;
}
fn guide_total(cell: u32) -> u32 {
  if (cell >= GUIDE_CELLS) { return 0u; }
  var total = 0u;
  for (var i = 0u; i < GUIDE_DIRS; i++) { total += guide[guide_bin_at(cell, i)]; }
  return total;
}
fn guide_pdf(cell: u32, f: Frame, wi: vec3f, total: u32) -> f32 {
  let local = to_local(f, wi);
  if (cell >= GUIDE_CELLS || local.z <= 0.0 || total == 0u) { return 0.0; }
  let weight = guide[guide_bin_at(cell, guide_bin_local(local))];
  return f32(weight) / f32(total) * f32(GUIDE_DIRS) / (2.0 * PI);
}
struct GuideSample { wi: vec3f, pdf: f32 }
fn sample_guide(cell: u32, f: Frame, total: u32, u: vec3f) -> GuideSample {
  let pick = min(total - 1u, u32(u.x * f32(total)));
  var sum = 0u;
  var bin = 0u;
  for (var i = 0u; i < GUIDE_DIRS; i++) {
    sum += guide[guide_bin_at(cell, i)];
    if (sum > pick) { bin = i; break; }
  }
  let pb = bin % GUIDE_PHI;
  let zb = bin / GUIDE_PHI;
  let phi = (f32(pb) + u.y) * (2.0 * PI / f32(GUIDE_PHI)) - PI;
  let z = (f32(zb) + u.z) / f32(GUIDE_Z);
  let r = sqrt(max(0.0, 1.0 - z * z));
  var out: GuideSample;
  out.wi = to_world(f, vec3f(r * cos(phi), r * sin(phi), z));
  out.pdf = guide_pdf(cell, f, out.wi, total);
  return out;
}
fn guide_eligible(b: Bsdf) -> bool {
  return b.roughness >= 0.15 && b.metallic < 0.5 && b.transmission < 0.1;
}
fn make_vertex(hit: Hit, ns: vec3f, gs: vec3f, enter: bool) -> Vertex {
  var v: Vertex;
  v.p = hit.p;
  v.gn = gs;
  v.f = frame_n(ns);
  v.b.albedo = hit.albedo;
  v.b.roughness = hit.roughness;
  v.b.metallic = hit.metallic;
  v.b.transmission = hit.transmission;
  v.b.ior = hit.ior;
  v.b.enter = enter;
  v.cell = guide_lookup(hit.p);
  return v;
}

fn cosine_hemisphere(u: vec2f) -> vec3f {
  let r = sqrt(u.x);
  let phi = 2.0 * PI * u.y;
  return vec3f(cos(phi) * r, sin(phi) * r, sqrt(max(0.0, 1.0 - u.x)));
}
fn schlick(f0: vec3f, cos_theta: f32) -> vec3f {
  let m = 1.0 - cos_theta; let m2 = m * m;
  return f0 + (1.0 - f0) * m2 * m2 * m;
}
fn ggx_d(nh: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha; let d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
fn smith_g1(nz: f32, alpha: f32) -> f32 {
  let n = max(nz, MATH_EPS); let a2 = alpha * alpha;
  return 2.0 * n / (n + sqrt(a2 + (1.0 - a2) * n * n));
}
fn sample_vndf(wo: vec3f, alpha: f32, u: vec2f) -> vec3f {
  let vh = normalize(vec3f(alpha * wo.x, alpha * wo.y, wo.z));
  let lensq = vh.x * vh.x + vh.y * vh.y;
  var t1 = vec3f(1.0, 0.0, 0.0);
  if (lensq > 0.0) { let inv = 1.0 / sqrt(lensq); t1 = vec3f(-vh.y * inv, vh.x * inv, 0.0); }
  let t2 = cross(vh, t1);
  let r = sqrt(u.x); let phi = 2.0 * PI * u.y;
  let p1 = r * cos(phi); var p2 = r * sin(phi);
  let s = 0.5 * (1.0 + vh.z);
  p2 = (1.0 - s) * sqrt(max(0.0, 1.0 - p1 * p1)) + s * p2;
  let nh = p1 * t1 + p2 * t2 + sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2)) * vh;
  return normalize(vec3f(alpha * nh.x, alpha * nh.y, max(MATH_EPS, nh.z)));
}
fn conductor_fg(wo: vec3f, wi: vec3f, f0: vec3f, alpha: f32) -> Evaluated {
  var out: Evaluated; out.f = vec3f(0.0); out.pdf = 0.0;
  if (wo.z <= 0.0 || wi.z <= 0.0) { return out; }
  let h = normalize(wo + wi);
  let woh = dot(wo, h);
  if (woh <= 0.0) { return out; }
  let D = ggx_d(h.z, alpha);
  let G1o = smith_g1(wo.z, alpha);
  out.f = D * G1o * smith_g1(wi.z, alpha) * schlick(f0, woh) / (4.0 * wo.z * wi.z);
  out.pdf = G1o * D / (wo.z * 4.0);
  return out;
}
fn ior_f0(ior: f32) -> f32 { let a = (ior - 1.0) / (ior + 1.0); return a * a; }
fn spec_prob(wo: vec3f, f0: vec3f) -> f32 {
  let f = schlick(f0, max(wo.z, 0.0));
  return clamp(0.2126 * f.x + 0.7152 * f.y + 0.0722 * f.z, 0.05, 0.9);
}
fn fresnel_dielectric(cos_i: f32, eta: f32) -> f32 {
  let c = min(1.0, abs(cos_i));
  let g2 = eta * eta - 1.0 + c * c;
  if (g2 < 0.0) { return 1.0; }
  let g = sqrt(g2);
  let a = (g - c) / (g + c);
  let b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
  return 0.5 * a * a * (1.0 + b * b);
}
`;

export const WGSL_CORE = wgslCore(false);

export const WGSL_BSDF = /* wgsl */ `
fn is_delta(b: Bsdf) -> bool {
  return b.roughness <= 0.0 && ((b.metallic >= 1.0 && b.transmission <= 0.0) || b.transmission >= 1.0);
}
fn eval_plastic(wo: vec3f, wi: vec3f, albedo: vec3f, alpha: f32, ior: f32) -> Evaluated {
  var out: Evaluated; out.f = vec3f(0.0); out.pdf = 0.0;
  let f0 = vec3f(ior_f0(ior));
  let p_spec = spec_prob(wo, f0);
  var diff_f = vec3f(0.0); var diff_pdf = 0.0;
  if (wo.z > 0.0 && wi.z > 0.0) {
    let h = normalize(wo + wi);
    let F = schlick(f0, max(0.0, dot(wo, h)));
    diff_f = albedo * (vec3f(1.0) - F) / PI;
    diff_pdf = wi.z / PI;
  }
  let spec = conductor_fg(wo, wi, f0, alpha);
  out.f = spec.f + diff_f;
  out.pdf = spec.pdf * p_spec + diff_pdf * (1.0 - p_spec);
  return out;
}
fn eval_opaque(wo: vec3f, wi: vec3f, albedo: vec3f, alpha: f32, metallic: f32, ior: f32) -> Evaluated {
  if (metallic <= 0.0) { return eval_plastic(wo, wi, albedo, alpha, ior); }
  if (metallic >= 1.0) { return conductor_fg(wo, wi, albedo, alpha); }
  let d = eval_plastic(wo, wi, albedo, alpha, ior);
  let c = conductor_fg(wo, wi, albedo, alpha);
  var out: Evaluated;
  out.f = mix(d.f, c.f, metallic);
  out.pdf = mix(d.pdf, c.pdf, metallic);
  return out;
}
fn eval_glass(wo: vec3f, wi: vec3f, alpha: f32, eta_i: f32, eta_t: f32) -> Evaluated {
  var out: Evaluated; out.f = vec3f(0.0); out.pdf = 0.0;
  if (abs(wo.z) < MATH_EPS) { return out; }
  let same = wo.z * wi.z > 0.0;
  var h: vec3f;
  if (same) {
    if (wo.z <= 0.0 || wi.z <= 0.0) { return out; }
    h = normalize(wo + wi);
  } else {
    h = eta_i * wo + eta_t * wi;
    let hl = length(h);
    if (hl < MATH_EPS) { return out; }
    h = h / hl;
  }
  if (h.z < 0.0) { h = -h; }
  let woh = abs(dot(wo, h));
  let wih = abs(dot(wi, h));
  if (woh < MATH_EPS || wih < MATH_EPS) { return out; }
  let F = fresnel_dielectric(woh, eta_t / eta_i);
  let D = ggx_d(max(h.z, 0.0), alpha);
  let G = smith_g1(abs(wo.z), alpha) * smith_g1(abs(wi.z), alpha);
  if (same) {
    out.f = vec3f(D * G * F / (4.0 * wo.z * wi.z));
    out.pdf = smith_g1(wo.z, alpha) * D / (wo.z * 4.0) * F;
  } else {
    let denom = eta_i * woh + eta_t * wih;
    let d2 = max(denom * denom, MATH_EPS);
    let eta = eta_i / eta_t;
    let btdf = D * G * (1.0 - F) * woh * wih / (abs(wo.z) * abs(wi.z) * d2) * (eta * eta);
    out.f = vec3f(max(btdf, 0.0));
    let pdf_h = smith_g1(abs(wo.z), alpha) * D * woh / max(abs(wo.z), MATH_EPS);
    out.pdf = pdf_h * (eta_t * eta_t * wih) / d2 * (1.0 - F);
  }
  return out;
}
fn eval_local(wo: vec3f, wi: vec3f, b: Bsdf) -> Evaluated {
  var out: Evaluated; out.f = vec3f(0.0); out.pdf = 0.0;
  let alpha = max(MIN_ALPHA, b.roughness * b.roughness);
  let o = eval_opaque(wo, wi, b.albedo, alpha, b.metallic, b.ior);
  if (b.transmission <= 0.0) { return o; }
  let g = eval_glass(wo, wi, alpha, select(b.ior, 1.0, b.enter), select(1.0, b.ior, b.enter));
  if (b.transmission >= 1.0) { return g; }
  out.f = mix(o.f, g.f, b.transmission);
  out.pdf = mix(o.pdf, g.pdf, b.transmission);
  return out;
}
fn eval_bsdf(f: Frame, wo_w: vec3f, wi_w: vec3f, b: Bsdf) -> Evaluated {
  if (is_delta(b)) {
    var delta: Evaluated;
    delta.f = vec3f(0.0);
    delta.pdf = 0.0;
    return delta;
  }
  return eval_local(to_local(f, wo_w), to_local(f, wi_w), b);
}
fn finish_local(f: Frame, wo: vec3f, local: vec3f, b: Bsdf) -> Sampled {
  var sampled: Sampled;
  sampled.wi = to_world(f, local);
  sampled.delta = 0u;
  sampled.eta_scale = 1.0;
  if (wo.z * local.z < 0.0) {
    let eta_i = select(b.ior, 1.0, b.enter);
    let eta_t = select(1.0, b.ior, b.enter);
    sampled.eta_scale = (eta_t * eta_t) / (eta_i * eta_i);
  }
  let ev = eval_local(wo, local, b);
  sampled.pdf = ev.pdf;
  if (ev.pdf > 0.0) { sampled.weight = ev.f * abs(local.z) / ev.pdf; }
  else { sampled.weight = vec3f(0.0); }
  return sampled;
}
fn sample_bsdf(f: Frame, wo_w: vec3f, b: Bsdf, u: vec2f, u_lobe: f32, u_sel: vec2f) -> Sampled {
  var sampled: Sampled; sampled.wi = f.n; sampled.weight = vec3f(0.0); sampled.pdf = 0.0; sampled.eta_scale = 1.0; sampled.delta = 0u;
  let wo = to_local(f, wo_w);
  if (b.roughness <= 0.0 && b.metallic >= 1.0 && b.transmission <= 0.0) {
    sampled.wi = to_world(f, reflect(-wo, vec3f(0.0, 0.0, 1.0)));
    sampled.weight = schlick(b.albedo, max(wo.z, 0.0));
    sampled.pdf = 1.0;
    sampled.delta = 1u;
    return sampled;
  }
  if (b.roughness <= 0.0 && b.transmission >= 1.0) {
    let eta_i = select(b.ior, 1.0, b.enter);
    let eta_t = select(1.0, b.ior, b.enter);
    let eta = eta_i / eta_t;
    let Fr = fresnel_dielectric(wo.z, eta_t / eta_i);
    var local = reflect(-wo, vec3f(0.0, 0.0, 1.0));
    sampled.weight = vec3f(1.0);
    if (u_lobe >= Fr) {
      let sin2 = eta * eta * (1.0 - wo.z * wo.z);
      if (sin2 < 1.0) {
        local = vec3f(-eta * wo.x, -eta * wo.y, -sqrt(max(0.0, 1.0 - sin2)));
        sampled.weight = vec3f(eta * eta);
        sampled.eta_scale = (eta_t * eta_t) / (eta_i * eta_i);
      }
    }
    sampled.wi = to_world(f, local);
    sampled.pdf = 1.0;
    sampled.delta = 1u;
    return sampled;
  }
  let alpha = max(MIN_ALPHA, b.roughness * b.roughness);
  var local = vec3f(0.0, 0.0, 1.0);
  if (u_sel.x < b.transmission) {
    let eta_i = select(b.ior, 1.0, b.enter);
    let eta_t = select(1.0, b.ior, b.enter);
    let h = sample_vndf(wo, alpha, u);
    let woh = max(dot(wo, h), 0.0);
    let Fr = fresnel_dielectric(woh, eta_t / eta_i);
    if (u_lobe < Fr) { local = reflect(-wo, h); }
    else {
      let eta = eta_i / eta_t;
      let sin2 = eta * eta * (1.0 - woh * woh);
      if (sin2 >= 1.0) { local = reflect(-wo, h); }
      else {
        let ct = sqrt(max(0.0, 1.0 - sin2));
        local = normalize(eta * -wo + (eta * woh - ct) * h);
      }
    }
  } else if (u_sel.y < b.metallic) {
    local = reflect(-wo, sample_vndf(wo, alpha, u));
  } else {
    let f0 = vec3f(ior_f0(b.ior)); let p_spec = spec_prob(wo, f0);
    if (u_lobe < p_spec) { local = reflect(-wo, sample_vndf(wo, alpha, u)); }
    else { local = cosine_hemisphere(u); }
  }
  return finish_local(f, wo, local, b);
}
struct GuideState { mix: f32, total: u32 }
fn guide_state(v: Vertex) -> GuideState {
  var gs: GuideState;
  gs.total = 0u;
  gs.mix = 0.0;
  if (guide_eligible(v.b) && trace.frame >= GUIDE_FIRST) {
    gs.total = guide_total(v.cell);
    gs.mix = select(0.0, GUIDE_MIX, gs.total >= GUIDE_MIN_WEIGHT);
  }
  return gs;
}
fn continuation_pdf(v: Vertex, wi: vec3f, pb: f32, gs: GuideState) -> f32 {
  if (gs.mix <= 0.0) { return pb; }
  return mix(pb, guide_pdf(v.cell, v.f, wi, gs.total), gs.mix);
}
fn sample_guided_bsdf(v: Vertex, wo: vec3f, pixel: u32, bounce: u32, gs: GuideState) -> Sampled {
  if (gs.mix > 0.0 && sample1d(pixel, bounce_dim(bounce, S_MIX)) < gs.mix) {
    let g = sample_guide(v.cell, v.f, gs.total, vec3f(
      sample1d(pixel, bounce_dim(bounce, S_GUIDE)),
      sample1d(pixel, bounce_dim(bounce, S_GUIDE + 1u)),
      sample1d(pixel, bounce_dim(bounce, S_GUIDE + 2u)),
    ));
    let ev = eval_bsdf(v.f, wo, g.wi, v.b);
    var sampled: Sampled;
    sampled.wi = g.wi;
    sampled.pdf = continuation_pdf(v, g.wi, ev.pdf, gs);
    sampled.weight = select(vec3f(0.0), ev.f * max(0.0, dot(v.f.n, g.wi)) / sampled.pdf, sampled.pdf > 0.0);
    sampled.eta_scale = 1.0;
    sampled.delta = 0u;
    return sampled;
  }
  var sampled = sample_bsdf(v.f, wo, v.b, sample2d(pixel, bounce_dim(bounce, S_BSDF)), sample1d(pixel, bounce_dim(bounce, S_LOBE)), sample2d(pixel, bounce_dim(bounce, S_SEL)));
  if (gs.mix > 0.0 && sampled.pdf > 0.0) {
    let ev = eval_bsdf(v.f, wo, sampled.wi, v.b);
    sampled.pdf = continuation_pdf(v, sampled.wi, ev.pdf, gs);
    sampled.weight = select(vec3f(0.0), ev.f * abs(dot(v.f.n, sampled.wi)) / sampled.pdf, sampled.pdf > 0.0);
  }
  return sampled;
}
`;

const WGSL_HIT = /* wgsl */ `
fn miss() -> Hit {
  var h: Hit; h.ok = false; h.t = T_MAX; h.prim = -1; h.ior = 1.5; h.tri = 0u; h.gn = vec3f(0.0, 1.0, 0.0); h.n = h.gn; return h;
}
fn apply_mat(h: Hit, mat_id: u32, prim: i32) -> Hit {
  var o = h;
  let m = load_mat(mat_id);
  o.albedo = m.albedo.xyz; o.roughness = m.albedo.w;
  o.emission = m.emit.xyz; o.metallic = m.emit.w;
  o.transmission = m.extra.x; o.ior = m.extra.y; o.prim = prim;
  return o;
}
fn rot_y(p: vec3f, c: f32, s: f32) -> vec3f { return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
fn rot_y_t(p: vec3f, c: f32, s: f32) -> vec3f { return vec3f(c * p.x - s * p.z, p.y, s * p.x + c * p.z); }
fn none() -> Isect { var s: Isect; s.t = T_MAX; s.prim = -1; s.tri = 0u; s.bu = 0.0; s.bv = 0.0; return s; }
fn keep(best: ptr<function, Isect>, t: f32, prim: i32, any_hit: bool) -> bool {
  if (t >= (*best).t || t <= RAY_EPS) { return false; }
  (*best).t = t; (*best).prim = prim;
  return any_hit;
}

fn t_sphere(ro: vec3f, rd: vec3f, a: vec4f) -> f32 {
  let oc = ro - a.xyz; let b = dot(oc, rd); let disc = b * b - dot(oc, oc) + a.w * a.w;
  if (disc < 0.0) { return T_MAX; }
  let s = sqrt(disc); var t = -b - s; if (t <= RAY_EPS) { t = -b + s; }
  if (t <= RAY_EPS) { return T_MAX; }
  return t;
}
fn t_plane(ro: vec3f, rd: vec3f, a: vec4f) -> f32 {
  if (abs(rd.y) < MATH_EPS) { return T_MAX; }
  let t = (a.w - ro.y) / rd.y;
  if (t <= RAY_EPS) { return T_MAX; }
  return t;
}
fn t_quad(ro: vec3f, rd: vec3f, a: vec4f, b: vec4f, c: vec4f) -> f32 {
  let n = cross(b.xyz, c.xyz); let area = length(n);
  if (area < MATH_EPS) { return T_MAX; }
  let nn = n / area; let denom = dot(nn, rd);
  if (abs(denom) < MATH_EPS) { return T_MAX; }
  let t = dot(nn, a.xyz - ro) / denom;
  if (t <= RAY_EPS) { return T_MAX; }
  let w = ro + rd * t - a.xyz;
  let uu = dot(b.xyz, b.xyz); let vv = dot(c.xyz, c.xyz); let uv = dot(b.xyz, c.xyz);
  let det = uv * uv - uu * vv;
  let s = (uv * dot(w, c.xyz) - vv * dot(w, b.xyz)) / det;
  let r = (uv * dot(w, b.xyz) - uu * dot(w, c.xyz)) / det;
  if (s < 0.0 || s > 1.0 || r < 0.0 || r > 1.0) { return T_MAX; }
  return t;
}
fn t_box(ro: vec3f, rd: vec3f, a: vec4f, b: vec4f, c: vec4f) -> f32 {
  let cs = c.x; let sn = c.y;
  let o = rot_y_t(ro - a.xyz, cs, sn); let d = rot_y_t(rd, cs, sn);
  let inv = safe_inv(d);
  let t0 = (-b.xyz - o) * inv; let t1 = (b.xyz - o) * inv;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  var t = tmin; if (tmin <= RAY_EPS) { t = tmax; }
  if (tmax < max(tmin, RAY_EPS) || t <= RAY_EPS) { return T_MAX; }
  return t;
}
fn t_cyl(ro: vec3f, rd: vec3f, data: vec4f, b_data: vec4f) -> f32 {
  let center = data.xyz; let radius = data.w; let hh = b_data.w;
  let o = ro - center; let a = rd.x * rd.x + rd.z * rd.z; let b = o.x * rd.x + o.z * rd.z;
  let cc = o.x * o.x + o.z * o.z - radius * radius;
  var t = T_MAX;
  if (a > MATH_EPS) {
    let disc = b * b - a * cc;
    if (disc >= 0.0) {
      var tc = (-b - sqrt(disc)) / a; if (tc <= RAY_EPS) { tc = (-b + sqrt(disc)) / a; }
      if (tc > RAY_EPS && tc < T_MAX && abs(o.y + tc * rd.y) <= hh) { t = tc; }
    }
  }
  if (abs(rd.y) > MATH_EPS) {
    for (var cap = 0u; cap < 2u; cap++) {
      let cy = select(-hh, hh, cap == 0u);
      let tc = (cy - o.y) / rd.y; let q = o + rd * tc;
      if (tc > RAY_EPS && tc < t && q.x * q.x + q.z * q.z <= radius * radius) { t = tc; }
    }
  }
  return t;
}

fn t_finite(ro: vec3f, rd: vec3f, i: u32) -> f32 {
  let kind = bitcast<u32>(load_prim_slot(i, 0u).x);
  if (kind == KIND_SPHERE) { return t_sphere(ro, rd, load_prim_slot(i, 1u)); }
  if (kind == KIND_QUAD) { return t_quad(ro, rd, load_prim_slot(i, 1u), load_prim_slot(i, 2u), load_prim_slot(i, 3u)); }
  if (kind == KIND_BOX) { return t_box(ro, rd, load_prim_slot(i, 1u), load_prim_slot(i, 2u), load_prim_slot(i, 3u)); }
  if (kind == KIND_CYL) { return t_cyl(ro, rd, load_prim_slot(i, 1u), load_prim_slot(i, 2u)); }
  return T_MAX;
}

fn scan_prims(ro: vec3f, rd: vec3f, tmax: f32, any_hit: bool) -> Isect {
  var best = none(); best.t = tmax;
  var i = trace.n_sphere;
  let planes = i + trace.n_plane;
  while (i < planes) { if (keep(&best, t_plane(ro, rd, load_prim_slot(i, 1u)), i32(i), any_hit)) { return best; } i += 1u; }
  if (trace.n_sphere + trace.n_quad + trace.n_box + trace.n_cyl == 0u) { return best; }
  var stack: array<u32, 32>;
  var sp = 1; stack[0] = 0u;
  let inv = safe_inv(rd);
  while (sp > 0) {
    sp = sp - 1; let ni = stack[sp];
    let node = load_node_at(trace.prim_node_off, ni);
    let count = i32(node.bmax.w);
    if (count > 0) {
      let prim = u32(node.bmin.w);
      if (keep(&best, t_finite(ro, rd, prim), i32(prim), any_hit)) { return best; }
    } else {
      let c0 = u32(node.bmin.w);
      let o = trace.prim_node_off + c0 * 2u;
      let n0min = world[o]; let n0max = world[o + 1u];
      let n1min = world[o + 2u]; let n1max = world[o + 3u];
      let d0 = ray_aabb(ro, inv, n0min.xyz, n0max.xyz);
      let d1 = ray_aabb(ro, inv, n1min.xyz, n1max.xyz);
      let near = select(c0 + 1u, c0, d0 <= d1); let far = select(c0, c0 + 1u, d0 <= d1);
      let dn = select(d1, d0, d0 <= d1); let df = select(d0, d1, d0 <= d1);
      if (df < best.t) { stack[sp] = far; sp = sp + 1; }
      if (dn < best.t) { stack[sp] = near; sp = sp + 1; }
    }
  }
  return best;
}

fn hit_tri(ro: vec3f, rd: vec3f, tri: TriPos) -> vec3f {
  let e1 = tri.b.xyz - tri.a.xyz; let e2 = tri.c.xyz - tri.a.xyz;
  let n = cross(e1, e2); let ao = ro - tri.a.xyz; let dao = cross(ao, rd);
  let det = -dot(rd, n); if (abs(det) < 1e-8) { return vec3f(T_MAX); }
  let inv = 1.0 / det; let t = dot(ao, n) * inv;
  let u = dot(e2, dao) * inv; let v = -dot(e1, dao) * inv;
  if (t < RAY_EPS || u < 0.0 || v < 0.0 || u + v > 1.0) { return vec3f(T_MAX); }
  return vec3f(t, u, v);
}

fn ray_aabb(ro: vec3f, inv: vec3f, bmin: vec3f, bmax: vec3f) -> f32 {
  let t0 = (bmin - ro) * inv; let t1 = (bmax - ro) * inv;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tmax < tmin || tmax < 0.0) { return T_MAX; }
  return select(tmin, 0.0, tmin < 0.0);
}

fn walk_bvh(ro: vec3f, rd: vec3f, tmax: f32, any_hit: bool) -> Isect {
  var best = none(); best.t = tmax;
  if (trace.tri_count == 0u) { return best; }
  var stack: array<u32, 32>;
  var sp = 1; stack[0] = 0u;
  let inv = safe_inv(rd);
  while (sp > 0) {
    sp = sp - 1; let ni = stack[sp];
    let node = load_node(ni);
    let count = i32(node.bmax.w);
    if (count > 0) {
      let start = u32(node.bmin.w);
      for (var i = 0u; i < u32(count); i++) {
        let hit = hit_tri(ro, rd, load_tri_pos(start + i));
        if (hit.x < best.t) {
          best.t = hit.x; best.prim = -2; best.tri = start + i; best.bu = hit.y; best.bv = hit.z;
          if (any_hit) { return best; }
        }
      }
    } else {
      let c0 = u32(node.bmin.w);
      let o = trace.node_off + c0 * 2u;
      let n0min = world[o]; let n0max = world[o + 1u];
      let n1min = world[o + 2u]; let n1max = world[o + 3u];
      let d0 = ray_aabb(ro, inv, n0min.xyz, n0max.xyz);
      let d1 = ray_aabb(ro, inv, n1min.xyz, n1max.xyz);
      let near = select(c0 + 1u, c0, d0 <= d1); let far = select(c0, c0 + 1u, d0 <= d1);
      let dn = select(d1, d0, d0 <= d1); let df = select(d0, d1, d0 <= d1);
      if (df < best.t) { stack[sp] = far; sp = sp + 1; }
      if (dn < best.t) { stack[sp] = near; sp = sp + 1; }
    }
  }
  return best;
}

fn shade_prim(ro: vec3f, rd: vec3f, it: Isect) -> Hit {
  var h = miss();
  let prim = load_prim(u32(it.prim));
  let t = it.t;
  h.ok = true; h.t = t; h.p = ro + rd * t;
  if (prim.kind == KIND_SPHERE) {
    h.n = normalize(h.p - prim.a.xyz); h.gn = h.n;
  } else if (prim.kind == KIND_PLANE) {
    h.n = vec3f(0.0, 1.0, 0.0); h.gn = h.n;
  } else if (prim.kind == KIND_QUAD) {
    h.n = normalize(cross(prim.b.xyz, prim.c.xyz)); h.gn = h.n;
  } else if (prim.kind == KIND_BOX) {
    let cs = prim.c.x; let sn = prim.c.y;
    let q = rot_y_t(h.p - prim.a.xyz, cs, sn);
    let ax = abs(q.x) / prim.b.x; let ay = abs(q.y) / prim.b.y; let az = abs(q.z) / prim.b.z;
    var n_obj = vec3f(0.0, 0.0, 1.0);
    if (ax >= ay && ax >= az) { n_obj = vec3f(select(-1.0, 1.0, q.x > 0.0), 0.0, 0.0); }
    else if (ay >= ax && ay >= az) { n_obj = vec3f(0.0, select(-1.0, 1.0, q.y > 0.0), 0.0); }
    else { n_obj = vec3f(0.0, 0.0, select(-1.0, 1.0, q.z > 0.0)); }
    h.n = rot_y(n_obj, cs, sn); h.gn = h.n;
  } else {
    let c = prim.a.xyz; let hh = prim.b.w; let q = h.p - c;
    if (abs(q.y) >= hh - 1e-3) { h.n = vec3f(0.0, select(-1.0, 1.0, q.y > 0.0), 0.0); }
    else { h.n = normalize(vec3f(q.x, 0.0, q.z)); }
    h.gn = h.n;
  }
  return apply_mat(h, prim.mat, it.prim);
}

fn shade_tri(ro: vec3f, rd: vec3f, it: Isect) -> Hit {
  var h = miss();
  let tp = load_tri_pos(it.tri);
  let tn = load_tri_n(it.tri);
  let gn = normalize(cross(tp.b.xyz - tp.a.xyz, tp.c.xyz - tp.a.xyz));
  var ns = normalize(tn.n0.xyz * (1.0 - it.bu - it.bv) + tn.n1.xyz * it.bu + tn.n2.xyz * it.bv);
  if (dot(ns, gn) < 0.0) { ns = -ns; }
  h.ok = true; h.t = it.t; h.p = ro + rd * it.t; h.n = ns; h.gn = gn; h.tri = it.tri;
  return apply_mat(h, u32(tp.a.w), -2);
}

fn closest(ro: vec3f, rd: vec3f) -> Isect {
  var best = scan_prims(ro, rd, T_MAX, false);
  let mesh = walk_bvh(ro, rd, best.t, false);
  if (mesh.prim != -1 && mesh.t < best.t) { best = mesh; }
  return best;
}

fn occluded(ro: vec3f, rd: vec3f, tmax: f32) -> bool {
  if (scan_prims(ro, rd, tmax, true).prim != -1) { return true; }
  return walk_bvh(ro, rd, tmax, true).prim != -1;
}

fn intersect(ro: vec3f, rd: vec3f) -> Hit {
  let it = closest(ro, rd);
  if (it.prim == -1) { return miss(); }
  if (it.prim == -2) { return shade_tri(ro, rd, it); }
  return shade_prim(ro, rd, it);
}
`;

const wgslLight = (probe: boolean) => /* wgsl */ `
fn light_le(L: Light) -> vec3f {
  return vec3f(L.le_x, L.u.w, L.v.w);
}
fn pick_pdf(L: Light, tot: f32) -> f32 { return max(MATH_EPS, lum(light_le(L)) * L.area) / tot; }
fn vis_range(dist: f32) -> f32 { return dist - OFFSET_EPS; }
fn pick_light(pixel: u32, bounce: u32) -> u32 {
  let n = trace.light_count;
  let x = sample1d(pixel, bounce_dim(bounce, S_LIGHT)) * f32(n);
  let i = min(u32(x), n - 1u);
  let pick = world[trace.light_off + i * 5u + 4u];
  if (fract(x) < pick.x) { return i; }
  return min(u32(pick.y), n - 1u);
}

fn sphere_pdf_w(p: vec3f, c: vec3f, r: f32) -> f32 {
  let d2 = dot(c - p, c - p);
  if (d2 <= r * r) { return 1.0 / max(4.0 * PI * r * r, MATH_EPS); }
  let cos_max = sqrt(max(0.0, 1.0 - (r * r) / max(d2, MATH_EPS)));
  return 1.0 / max(2.0 * PI * (1.0 - cos_max), MATH_EPS);
}
fn sample_cone(dir: vec3f, cos_max: f32, u: vec2f) -> vec3f {
  let cos_t = mix(cos_max, 1.0, u.x);
  let sin_t = sqrt(max(0.0, 1.0 - cos_t * cos_t));
  let phi = 2.0 * PI * u.y;
  return to_world(frame_n(dir), vec3f(cos(phi) * sin_t, sin(phi) * sin_t, cos_t));
}
fn on_quad(p: vec3f, L: Light) -> bool {
  let w = p - L.origin.xyz;
  let uu = dot(L.u.xyz, L.u.xyz); let vv = dot(L.v.xyz, L.v.xyz); let uv = dot(L.u.xyz, L.v.xyz);
  let det = uv * uv - uu * vv;
  if (abs(det) < MATH_EPS) { return false; }
  let s = (uv * dot(w, L.v.xyz) - vv * dot(w, L.u.xyz)) / det;
  let r = (uv * dot(w, L.u.xyz) - uu * dot(w, L.v.xyz)) / det;
  return s >= -MATH_EPS && s <= 1.0 + MATH_EPS && r >= -MATH_EPS && r <= 1.0 + MATH_EPS;
}
fn area_pdf_w(p_pick: f32, area: f32, dist2: f32, cos_l: f32) -> f32 {
  return p_pick / max(area, MATH_EPS) * dist2 / cos_l;
}

fn next_event(v: Vertex, wo: vec3f, pixel: u32, bounce: u32, gs: GuideState${probe ? ", rec: bool, pn: ptr<function, u32>, beta: vec3f" : ""}) -> vec3f {
  if (trace.light_count == 0u) { return vec3f(0.0); }
  let tot = max(trace.tot_power, MATH_EPS);
  let i = pick_light(pixel, bounce);
  let L = load_light(i);
  let p_pick = pick_pdf(L, tot);
  var wi = vec3f(0.0, 1.0, 0.0);
  var pdf_w = 1.0;
  ${probe ? "var light_p = v.p;" : ""}
  let n = v.f.n;
  let origin = v.p + v.gn * OFFSET_EPS;
  if (L.kind == LIGHT_SPHERE) {
    let c = L.origin.xyz; let r = L.origin.w;
    let to_c = c - v.p; let d2 = dot(to_c, to_c);
    if (d2 <= r * r) { return vec3f(0.0); }
    let cos_max = sqrt(max(0.0, 1.0 - (r * r) / d2));
    wi = sample_cone(to_c / sqrt(d2), cos_max, sample2d(pixel, bounce_dim(bounce, S_LIGHT_U)));
    if (dot(n, wi) <= 0.0) { return vec3f(0.0); }
    pdf_w = p_pick * sphere_pdf_w(v.p, c, r);
    let t = t_sphere(origin, wi, vec4f(c, r));
    if (t >= T_MAX || occluded(origin, wi, vis_range(t))) { return vec3f(0.0); }
    ${probe ? "light_p = origin + wi * t;" : ""}
  } else {
    var sample_p = L.origin.xyz;
    var ln = vec3f(0.0, 1.0, 0.0);
    if (L.kind == LIGHT_CYL) {
      let c = L.origin.xyz; let radius = L.origin.w; let hh = L.u.x;
      let aside = 2.0 * PI * radius * (2.0 * hh);
      let acap = 2.0 * PI * radius * radius;
      if (sample1d(pixel, bounce_dim(bounce, S_LIGHT_U)) * (aside + acap) < aside) {
        let y = (sample1d(pixel, bounce_dim(bounce, S_LIGHT_U + 1u)) * 2.0 - 1.0) * hh;
        let a = sample1d(pixel, bounce_dim(bounce, S_LIGHT_U + 2u)) * 2.0 * PI;
        let cs = cos(a); let sn = sin(a);
        sample_p = c + vec3f(radius * cs, y, radius * sn);
        ln = vec3f(cs, 0.0, sn);
      } else {
        let cap = select(-1.0, 1.0, sample1d(pixel, bounce_dim(bounce, S_LIGHT_U + 1u)) < 0.5);
        let dsk = disk(sample2d(pixel, bounce_dim(bounce, S_LIGHT_U + 2u))) * radius;
        sample_p = c + vec3f(dsk.x, cap * hh, dsk.y);
        ln = vec3f(0.0, cap, 0.0);
      }
    } else if (L.kind == LIGHT_TRI) {
      let r1 = sample1d(pixel, bounce_dim(bounce, S_LIGHT_U)); let r2 = sample1d(pixel, bounce_dim(bounce, S_LIGHT_U + 1u));
      let su = 1.0 - sqrt(r1); let sv = r2 * sqrt(r1);
      sample_p = L.origin.xyz + L.u.xyz * su + L.v.xyz * sv;
      ln = normalize(cross(L.u.xyz, L.v.xyz));
    } else {
      let uv = sample2d(pixel, bounce_dim(bounce, S_LIGHT_U));
      sample_p = L.origin.xyz + L.u.xyz * uv.x + L.v.xyz * uv.y;
      ln = normalize(cross(L.u.xyz, L.v.xyz));
    }
    var to_l = sample_p - v.p; let dist2 = dot(to_l, to_l); let dist = sqrt(dist2);
    if (dist < RAY_EPS) { return vec3f(0.0); }
    wi = to_l / dist;
    let cos_l = -dot(ln, wi); let cos_p = dot(n, wi);
    if (cos_l <= 0.0 || cos_p <= 0.0) { return vec3f(0.0); }
    pdf_w = area_pdf_w(p_pick, L.area, dist2, cos_l);
    if (occluded(origin, wi, vis_range(dist))) { return vec3f(0.0); }
    ${probe ? "light_p = sample_p;" : ""}
  }
  let ev = eval_bsdf(v.f, wo, wi, v.b);
  if (pdf_w <= 0.0) { return vec3f(0.0); }
  let q = continuation_pdf(v, wi, ev.pdf, gs);
  let contrib = ev.f * light_le(L) * max(dot(n, wi), 0.0) * mis2(pdf_w, q) / pdf_w;
  ${probe ? "if (max(contrib.x, max(contrib.y, contrib.z)) > 0.0) { probe_push(rec, pn, light_p, beta * contrib, 1.0); }" : ""}
  return contrib;
}

fn light_hit_pdf(L: Light, hit: Hit, o: vec3f, dist2: f32, cos_l: f32, tot: f32) -> f32 {
  let p_pick = pick_pdf(L, tot);
  if (L.kind == LIGHT_SPHERE) {
    if (i32(L.prim) != hit.prim) { return 0.0; }
    return p_pick * sphere_pdf_w(o, L.origin.xyz, L.origin.w);
  }
  if (L.kind == LIGHT_TRI) {
    if (L.prim != hit.tri) { return 0.0; }
    return area_pdf_w(p_pick, L.area, dist2, cos_l);
  }
  if (L.kind == LIGHT_CYL) {
    if (i32(L.prim) != hit.prim) { return 0.0; }
    return area_pdf_w(p_pick, L.area, dist2, cos_l);
  }
  if (i32(L.prim) != hit.prim || !on_quad(hit.p, L)) { return 0.0; }
  return area_pdf_w(p_pick, L.area, dist2, cos_l);
}
fn light_pdf_hit(hit: Hit, o: vec3f, d: vec3f) -> f32 {
  let tot = max(trace.tot_power, MATH_EPS);
  var pdf_w = 0.0;
  let dist2 = dot(hit.p - o, hit.p - o);
  let cos_l = max(0.0, -dot(hit.gn, d));
  if (hit.prim >= 0) {
    let p = load_prim(u32(hit.prim));
    for (var i = 0u; i < p._1; i++) { pdf_w += light_hit_pdf(load_light(p._0 + i), hit, o, dist2, cos_l, tot); }
    return pdf_w;
  }
  for (var i = 0u; i < trace.light_count; i++) { pdf_w += light_hit_pdf(load_light(i), hit, o, dist2, cos_l, tot); }
  return pdf_w;
}

fn env_index(x: u32, y: u32) -> u32 { return y * trace.env_w + x; }
fn env_n() -> u32 { return trace.env_w * trace.env_h; }
fn env_f32(i: u32) -> f32 {
  let v = env[env_n() + (i >> 2u)];
  let k = i & 3u;
  return select(select(select(v.x, v.y, k == 1u), v.z, k == 2u), v.w, k == 3u);
}
fn env_pixel(rd: vec3f) -> vec2u {
  let uv = vec2f(atan2(rd.z, rd.x) * 0.5 / PI + 0.5, acos(clamp(rd.y, -1.0, 1.0)) / PI);
  return vec2u(min(u32(uv.x * f32(trace.env_w)), trace.env_w - 1u), min(u32(uv.y * f32(trace.env_h)), trace.env_h - 1u));
}
fn env_lookup(rd: vec3f) -> vec4f {
  if (trace.use_ibl == 0u) { return vec4f(0.0); }
  let px = env_pixel(rd);
  return env[env_index(px.x, px.y)];
}
fn env_pick(pixel: u32, bounce: u32) -> vec2u {
  let n = env_n();
  let x = sample1d(pixel, bounce_dim(bounce, S_ENV)) * f32(n);
  let i = min(u32(x), n - 1u);
  let j = select(i, min(u32(env_f32(n + i)), n - 1u), fract(x) >= env_f32(i));
  return vec2u(j % trace.env_w, j / trace.env_w);
}
fn next_event_env(v: Vertex, wo: vec3f, pixel: u32, bounce: u32, gs: GuideState${probe ? ", rec: bool, pn: ptr<function, u32>, beta: vec3f" : ""}) -> vec3f {
  if (trace.use_ibl == 0u) { return vec3f(0.0); }
  let px = env_pick(pixel, bounce);
  let u0 = sample1d(pixel, bounce_dim(bounce, S_ENV + 1u)); let u1 = sample1d(pixel, bounce_dim(bounce, S_ENV + 2u));
  let phi = ((f32(px.x) + u0) / f32(trace.env_w) - 0.5) * 2.0 * PI;
  let c0 = cos((f32(px.y) / f32(trace.env_h)) * PI);
  let c1 = cos((f32(px.y + 1u) / f32(trace.env_h)) * PI);
  let cy = mix(c0, c1, u1);
  let st = sqrt(max(0.0, 1.0 - cy * cy));
  let wi = vec3f(st * cos(phi), cy, st * sin(phi));
  let pix = env[env_index(px.x, px.y)]; let pdf_e = pix.w; let le = pix.xyz * trace.env_gain;
  let cos_p = dot(v.f.n, wi);
  if (cos_p <= 0.0 || pdf_e <= 0.0) { return vec3f(0.0); }
  if (occluded(v.p + v.gn * OFFSET_EPS, wi, T_MAX)) { return vec3f(0.0); }
  let ev = eval_bsdf(v.f, wo, wi, v.b);
  let q = continuation_pdf(v, wi, ev.pdf, gs);
  let contrib = ev.f * le * cos_p * mis2(pdf_e, q) / pdf_e;
  ${probe ? "if (max(contrib.x, max(contrib.y, contrib.z)) > 0.0) { probe_push(rec, pn, v.p + wi * 8.0, beta * contrib, 2.0); }" : ""}
  return contrib;
}
`;

const wgslPath = (probe: boolean) => /* wgsl */ `
fn trace_path(ro0: vec3f, rd0: vec3f, pixel: u32${probe ? ", rec: bool" : ""}) -> vec3f {
  var radiance = vec3f(0.0); var o = ro0; var d = rd0; var beta = vec3f(1.0); var eta_scale = 1.0; var pdf = 1.0; var delta = true;
  var sigma = vec3f(0.0);
  var record_key = 0u;
  var record_bin = 0u;
  var record_radiance = vec3f(0.0);
  var record_beta = vec3f(1.0);
  var record_count = 0u;
  ${probe ? "var pn = 0u;\n  if (rec) { probe[(trace.frame % PROBE_PATHS) * PROBE_STRIDE] = vec4f(0.0); }\n  probe_push(rec, &pn, ro0, vec3f(1.0), 0.0);" : ""}
  for (var bounce = 0u; ; bounce++) {
    let hit = intersect(o, d);
    if (hit.ok && max(sigma.x, max(sigma.y, sigma.z)) > 0.0) { beta *= exp(-sigma * hit.t); }
    if (!hit.ok) {
      if (bounce > 0u || trace.hide_ibl == 0u) {
        let envl = env_lookup(d);
        let envc = beta * envl.xyz * trace.env_gain * select(mis2(pdf, envl.w), 1.0, delta);
        radiance += envc;
        ${probe ? "probe_push(rec, &pn, o + d * 8.0, envc, 2.0);" : ""}
      }
      break;
    }
    let front = dot(hit.gn, d) < 0.0;
    let ns = select(-hit.n, hit.n, dot(hit.n, d) < 0.0);
    let gs = select(-hit.gn, hit.gn, front);
    let wo = -d;
    if (max(hit.emission.x, max(hit.emission.y, hit.emission.z)) > 0.0) {
      if (front) {
        let emit = beta * hit.emission * select(mis2(pdf, light_pdf_hit(hit, o, d)), 1.0, delta);
        radiance += emit;
        ${probe ? "probe_push(rec, &pn, hit.p, emit, 0.0);" : ""}
      }
      break;
    }
    ${probe ? "probe_push(rec, &pn, hit.p, beta, 0.0);" : ""}
    let v = make_vertex(hit, ns, gs, front);
    let gstate = guide_state(v);
    if (!is_delta(v.b)) {
      radiance += beta * next_event(v, wo, pixel, bounce, gstate${probe ? ", rec, &pn, beta" : ""});
      radiance += beta * next_event_env(v, wo, pixel, bounce, gstate${probe ? ", rec, &pn, beta" : ""});
    }
    if (trace.bounce >= 0 && bounce >= u32(trace.bounce)) { break; }
    let s = sample_guided_bsdf(v, wo, pixel, bounce, gstate);
    if (s.pdf <= 0.0 || max(s.weight.x, max(s.weight.y, s.weight.z)) <= 0.0) { break; }
    if (guide_eligible(v.b)) {
      record_count++;
      if (sample1d(pixel, bounce_dim(bounce, S_RESERVOIR)) * f32(record_count) < 1.0) {
        record_key = spatial_key(v.p);
        record_bin = guide_bin_local(to_local(v.f, s.wi));
        record_radiance = radiance;
        record_beta = beta;
      }
    }
    beta *= s.weight; eta_scale *= s.eta_scale; pdf = s.pdf; delta = s.delta == 1u;
    if (v.b.transmission > 0.0 && dot(v.f.n, wo) * dot(v.f.n, s.wi) < 0.0) {
      sigma = select(vec3f(0.0), -log(max(v.b.albedo, vec3f(MATH_EPS))), v.b.enter);
    }
    let g_out = select(-hit.gn, hit.gn, dot(hit.gn, s.wi) >= 0.0);
    o = hit.p + g_out * OFFSET_EPS; d = s.wi;
    if (bounce >= RR_START) {
      let q = clamp(max3(beta * eta_scale), RR_MIN, RR_MAX);
      if (sample1d(pixel, bounce_dim(bounce, S_RR)) > q) { break; }
      beta /= q;
    }
  }
  if (record_count > 0u) {
    let future = max((radiance - record_radiance) / max(record_beta, vec3f(MATH_EPS)), vec3f(0.0));
    let weight = min(u32(clamp(lum(future) * 64.0 * f32(record_count), 0.0, 4095.0)), GUIDE_INC_MAX);
    let slot = claim_train(record_key);
    if (weight > 0u && slot < GUIDE_CELLS) {
      let i = guide_bin_at(slot, record_bin);
      let old = atomicAdd(&guide_train[i], weight);
      if (old > 0xffffffffu - weight) { atomicStore(&guide_train[i], 0xffffffffu); }
    }
  }
  return radiance;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= trace.size_x || id.y >= trace.size_y) { return; }
  let pixel = id.y * trace.size_x + id.x;
  let k = max(1u, trace.spp_k);
  var sum = vec3f(0.0);
  for (var s = 0u; s < k; s++) {
    g_sample = trace.frame + s;
    let jitter = sample2d(pixel, D_PIX);
    let u = (f32(id.x) + jitter.x) / f32(trace.size_x);
    let v = (f32(id.y) + jitter.y) / f32(trace.size_y);
    let pinhole = normalize(trace.forward + trace.right * ((2.0 * u - 1.0) * trace.half_w) + trace.up * ((1.0 - 2.0 * v) * trace.half_h));
    var ro = trace.origin;
    var rd = pinhole;
    if (trace.aperture > 0.0) {
      let lens = disk(sample2d(pixel, D_LENS)) * trace.aperture * 0.5;
      ro = trace.origin + trace.right * lens.x + trace.up * lens.y;
      rd = normalize(trace.origin + pinhole * max(trace.focus, MATH_EPS) - ro);
    }
    sum += trace_path(ro, rd, pixel${probe ? ", id.x == trace.probe_x && id.y == trace.probe_y && s == 0u" : ""});
  }
  accum[pixel] += vec4f(sum, f32(k));
}
`;

export const TRACE_WGSL = [
  wgslCore(false),
  WGSL_BSDF,
  WGSL_HIT,
  wgslLight(false),
  wgslPath(false),
].join("\n");
export const TRACE_PROBE_WGSL = [
  wgslCore(true),
  WGSL_BSDF,
  WGSL_HIT,
  wgslLight(true),
  wgslPath(true),
].join("\n");

export const PRESENT_WGSL = /* wgsl */ `
struct Present { size: vec2f, exposure: f32 }
@group(0) @binding(0) var<uniform> present: Present;
@group(0) @binding(1) var<storage, read> accum: array<vec4f>;
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
@fragment fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(min(position.xy, present.size - vec2f(1.0)));
  let s = accum[p.y * u32(present.size.x) + p.x];
  return vec4f(pow(aces(s.xyz / max(s.w, 1.0) * present.exposure), vec3f(1.0 / 2.2)), 1.0);
}
`;

export const CLEAR_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> dst: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&dst)) { return; }
  dst[id.x] = vec4f(0.0);
}
`;
