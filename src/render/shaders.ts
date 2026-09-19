import { RR_MAX_SURVIVAL, RR_MIN_SURVIVAL, RR_START_DEPTH } from "./roulette";
import { GUIDE_CELL_COUNT, GUIDE_DIR_COUNT, GUIDE_PHI_BINS, GUIDE_Z_BINS } from "./guiding";

const WGSL_CORE = /* wgsl */ `
const PI = 3.141592653589793;
const EPS = 1e-4;
const T_MAX = 1e4;
const MIN_ALPHA = 0.002;
const RR_START = ${RR_START_DEPTH - 1}u;
const RR_MIN = ${RR_MIN_SURVIVAL};
const RR_MAX = ${RR_MAX_SURVIVAL};
const GUIDE_CELLS = ${GUIDE_CELL_COUNT}u;
const GUIDE_DIRS = ${GUIDE_DIR_COUNT}u;
const GUIDE_PHI = ${GUIDE_PHI_BINS}u;
const GUIDE_Z = ${GUIDE_Z_BINS}u;
const GUIDE_MIX = 0.5;
const GUIDE_CELL_SIZE = 0.5;
const GUIDE_MIN_WEIGHT = 64u;
const GUIDE_RECORDS = 8u;
const R2A = 0.7548776662466927;
const R2B = 0.5698402909980532;
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
  bounce: u32,
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
}

struct Prim { kind: u32, mat: u32, _0: u32, _1: u32, a: vec4f, b: vec4f, c: vec4f }
struct Light { kind: u32, prim: u32, le_x: f32, area: f32, origin: vec4f, u: vec4f, v: vec4f, pick: vec4f }
struct Mat { albedo: vec4f, emit: vec4f, extra: vec4f }
struct TriPos { a: vec4f, b: vec4f, c: vec4f }
struct TriN { n0: vec4f, n1: vec4f, n2: vec4f }
struct Node { bmin: vec4f, bmax: vec4f }
struct Isect { t: f32, prim: i32, tri: u32, bu: f32, bv: f32 }

@group(0) @binding(0) var<uniform> trace: Trace;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> env: array<vec4f>;
@group(0) @binding(4) var<storage, read> world: array<vec4f>;
@group(0) @binding(5) var<storage, read> guide: array<u32>;
@group(0) @binding(6) var<storage, read_write> guide_train: array<atomic<u32>>;

fn load_prim(i: u32) -> Prim {
  var p: Prim;
  let o = trace.prim_off + i * 4u;
  let h = world[o];
  p.kind = bitcast<u32>(h.x); p.mat = bitcast<u32>(h.y); p._0 = 0u; p._1 = 0u;
  p.a = world[o + 1u]; p.b = world[o + 2u]; p.c = world[o + 3u];
  return p;
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
fn load_node(i: u32) -> Node {
  var n: Node;
  let o = trace.node_off + i * 2u;
  n.bmin = world[o]; n.bmax = world[o + 1u];
  return n;
}

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

fn pcg(state: ptr<function, u32>) -> f32 {
  *state = *state * 747796405u + 2891336453u;
  var word = ((*state >> ((*state >> 28u) + 4u)) ^ *state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) * 2.3283064365386963e-10;
}
fn rand2(state: ptr<function, u32>) -> vec2f { return vec2f(pcg(state), pcg(state)); }
fn disk(u: vec2f) -> vec2f {
  let p = u * 2.0 - vec2f(1.0);
  if (abs(p.x) < EPS && abs(p.y) < EPS) { return vec2f(0.0); }
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

struct Frame { t: vec3f, b: vec3f, n: vec3f }
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

fn guide_cell(p: vec3f) -> u32 {
  let q = bitcast<vec3u>(vec3i(floor(p / GUIDE_CELL_SIZE)));
  var h = (q.x * 0x8da6b343u) ^ (q.y * 0xd8163841u) ^ (q.z * 0xcb1ab31fu);
  h ^= h >> 16u;
  return h % GUIDE_CELLS;
}
fn guide_bin_local(wi: vec3f) -> u32 {
  let phi = atan2(wi.y, wi.x) + PI;
  let p = min(GUIDE_PHI - 1u, u32(phi * f32(GUIDE_PHI) / (2.0 * PI)));
  let z = min(GUIDE_Z - 1u, u32(clamp(wi.z, 0.0, 1.0) * f32(GUIDE_Z)));
  return z * GUIDE_PHI + p;
}
fn guide_total(cell: u32) -> u32 {
  var total = 0u;
  for (var i = 0u; i < GUIDE_DIRS; i++) { total += guide[cell * GUIDE_DIRS + i]; }
  return total;
}
fn guide_pdf(p: vec3f, n: vec3f, wi: vec3f, total: u32) -> f32 {
  let local = to_local(frame_n(n), wi);
  if (local.z <= 0.0 || total == 0u) { return 0.0; }
  let weight = guide[guide_cell(p) * GUIDE_DIRS + guide_bin_local(local)];
  return f32(weight) / f32(total) * f32(GUIDE_DIRS) / (2.0 * PI);
}
struct GuideSample { wi: vec3f, pdf: f32 }
fn sample_guide(p: vec3f, n: vec3f, total: u32, u: vec3f) -> GuideSample {
  let cell = guide_cell(p);
  let pick = min(total - 1u, u32(u.x * f32(total)));
  var sum = 0u;
  var bin = 0u;
  for (var i = 0u; i < GUIDE_DIRS; i++) {
    sum += guide[cell * GUIDE_DIRS + i];
    if (sum > pick) { bin = i; break; }
  }
  let pb = bin % GUIDE_PHI;
  let zb = bin / GUIDE_PHI;
  let phi = (f32(pb) + u.y) * (2.0 * PI / f32(GUIDE_PHI)) - PI;
  let z = (f32(zb) + u.z) / f32(GUIDE_Z);
  let r = sqrt(max(0.0, 1.0 - z * z));
  var out: GuideSample;
  out.wi = to_world(frame_n(n), vec3f(r * cos(phi), r * sin(phi), z));
  out.pdf = guide_pdf(p, n, out.wi, total);
  return out;
}
fn guide_eligible(roughness: f32, metallic: f32, transmission: f32) -> bool {
  return roughness >= 0.15 && metallic < 0.5 && transmission < 0.1;
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
  let n = max(nz, EPS); let a2 = alpha * alpha;
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
  return normalize(vec3f(alpha * nh.x, alpha * nh.y, max(EPS, nh.z)));
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

const WGSL_BSDF = /* wgsl */ `
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
fn eval_conductor(wo: vec3f, wi: vec3f, albedo: vec3f, alpha: f32) -> Evaluated {
  return conductor_fg(wo, wi, albedo, alpha);
}
fn eval_opaque(wo: vec3f, wi: vec3f, albedo: vec3f, alpha: f32, metallic: f32, ior: f32) -> Evaluated {
  if (metallic <= 0.0) { return eval_plastic(wo, wi, albedo, alpha, ior); }
  if (metallic >= 1.0) { return eval_conductor(wo, wi, albedo, alpha); }
  let d = eval_plastic(wo, wi, albedo, alpha, ior);
  let c = eval_conductor(wo, wi, albedo, alpha);
  var out: Evaluated;
  out.f = mix(d.f, c.f, metallic);
  out.pdf = mix(d.pdf, c.pdf, metallic);
  return out;
}
fn eval_glass(wo: vec3f, wi: vec3f, alpha: f32, eta_i: f32, eta_t: f32) -> Evaluated {
  var out: Evaluated; out.f = vec3f(0.0); out.pdf = 0.0;
  if (abs(wo.z) < EPS) { return out; }
  let same = wo.z * wi.z > 0.0;
  var h: vec3f;
  if (same) {
    if (wo.z <= 0.0 || wi.z <= 0.0) { return out; }
    h = normalize(wo + wi);
  } else {
    h = eta_i * wo + eta_t * wi;
    let hl = length(h);
    if (hl < EPS) { return out; }
    h = h / hl;
  }
  if (h.z < 0.0) { h = -h; }
  let woh = abs(dot(wo, h));
  let wih = abs(dot(wi, h));
  if (woh < EPS || wih < EPS) { return out; }
  let F = fresnel_dielectric(woh, eta_t / eta_i);
  let D = ggx_d(max(h.z, 0.0), alpha);
  let G = smith_g1(abs(wo.z), alpha) * smith_g1(abs(wi.z), alpha);
  if (same) {
    out.f = vec3f(D * G * F / (4.0 * wo.z * wi.z));
    out.pdf = smith_g1(wo.z, alpha) * D / (wo.z * 4.0) * F;
  } else {
    let denom = eta_i * woh + eta_t * wih;
    let d2 = max(denom * denom, EPS);
    let eta = eta_i / eta_t;
    let btdf = D * G * (1.0 - F) * woh * wih / (abs(wo.z) * abs(wi.z) * d2) * (eta * eta);
    out.f = vec3f(max(btdf, 0.0));
    let pdf_h = smith_g1(abs(wo.z), alpha) * D * woh / max(abs(wo.z), EPS);
    out.pdf = pdf_h * (eta_t * eta_t * wih) / d2 * (1.0 - F);
  }
  return out;
}
fn eval_local(wo: vec3f, wi: vec3f, albedo: vec3f, alpha: f32, metallic: f32, transmission: f32, ior: f32, enter: bool) -> Evaluated {
  var out: Evaluated; out.f = vec3f(0.0); out.pdf = 0.0;
  let o = eval_opaque(wo, wi, albedo, alpha, metallic, ior);
  if (transmission <= 0.0) { return o; }
  let g = eval_glass(wo, wi, alpha, select(ior, 1.0, enter), select(1.0, ior, enter));
  if (transmission >= 1.0) { return g; }
  out.f = mix(o.f, g.f, transmission);
  out.pdf = mix(o.pdf, g.pdf, transmission);
  return out;
}
fn eval_bsdf(n: vec3f, wo_w: vec3f, wi_w: vec3f, albedo: vec3f, roughness: f32, metallic: f32, transmission: f32, ior: f32, enter: bool) -> Evaluated {
  let f = frame_n(n);
  return eval_local(to_local(f, wo_w), to_local(f, wi_w), albedo, max(MIN_ALPHA, roughness * roughness), metallic, transmission, ior, enter);
}
fn finish_local(f: Frame, wo: vec3f, local: vec3f, albedo: vec3f, alpha: f32, metallic: f32, transmission: f32, ior: f32, enter: bool) -> Sampled {
  var sampled: Sampled;
  sampled.wi = to_world(f, local);
  sampled.delta = 0u;
  sampled.eta_scale = 1.0;
  if (wo.z * local.z < 0.0) {
    let eta_i = select(ior, 1.0, enter);
    let eta_t = select(1.0, ior, enter);
    sampled.eta_scale = (eta_t * eta_t) / (eta_i * eta_i);
  }
  let ev = eval_local(wo, local, albedo, alpha, metallic, transmission, ior, enter);
  sampled.pdf = ev.pdf;
  if (ev.pdf > EPS) { sampled.weight = ev.f * abs(local.z) / ev.pdf; }
  else { sampled.weight = vec3f(0.0); }
  return sampled;
}
fn sample_bsdf(n: vec3f, wo_w: vec3f, albedo: vec3f, roughness: f32, metallic: f32, transmission: f32, ior: f32, enter: bool, u: vec2f, u_lobe: f32, u_sel: vec2f) -> Sampled {
  var sampled: Sampled; sampled.wi = n; sampled.weight = vec3f(0.0); sampled.pdf = 0.0; sampled.eta_scale = 1.0; sampled.delta = 0u;
  let f = frame_n(n);
  let wo = to_local(f, wo_w);
  let alpha = max(MIN_ALPHA, roughness * roughness);
  var local = vec3f(0.0, 0.0, 1.0);
  if (u_sel.x < transmission) {
    let eta_i = select(ior, 1.0, enter);
    let eta_t = select(1.0, ior, enter);
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
  } else if (u_sel.y < metallic) {
    local = reflect(-wo, sample_vndf(wo, alpha, u));
  } else {
    let f0 = vec3f(ior_f0(ior)); let p_spec = spec_prob(wo, f0);
    if (u_lobe < p_spec) { local = reflect(-wo, sample_vndf(wo, alpha, u)); }
    else { local = cosine_hemisphere(u); }
  }
  return finish_local(f, wo, local, albedo, alpha, metallic, transmission, ior, enter);
}
fn sample_guided_bsdf(p: vec3f, n: vec3f, wo: vec3f, albedo: vec3f, roughness: f32, metallic: f32, transmission: f32, ior: f32, enter: bool, rng: ptr<function, u32>) -> Sampled {
  let eligible = guide_eligible(roughness, metallic, transmission);
  var total = 0u;
  if (eligible) { total = guide_total(guide_cell(p)); }
  let mix_weight = select(0.0, GUIDE_MIX, total >= GUIDE_MIN_WEIGHT);
  if (mix_weight > 0.0 && pcg(rng) < mix_weight) {
    let g = sample_guide(p, n, total, vec3f(pcg(rng), pcg(rng), pcg(rng)));
    let ev = eval_bsdf(n, wo, g.wi, albedo, roughness, metallic, transmission, ior, enter);
    var sampled: Sampled;
    sampled.wi = g.wi;
    sampled.pdf = mix(ev.pdf, g.pdf, mix_weight);
    sampled.weight = ev.f * max(0.0, dot(n, g.wi)) / max(sampled.pdf, EPS);
    sampled.eta_scale = 1.0;
    sampled.delta = 0u;
    return sampled;
  }
  var sampled = sample_bsdf(n, wo, albedo, roughness, metallic, transmission, ior, enter, rand2(rng), pcg(rng), rand2(rng));
  if (mix_weight > 0.0 && sampled.pdf > 0.0) {
    let ev = eval_bsdf(n, wo, sampled.wi, albedo, roughness, metallic, transmission, ior, enter);
    sampled.pdf = mix(sampled.pdf, guide_pdf(p, n, sampled.wi, total), mix_weight);
    sampled.weight = ev.f * abs(dot(n, sampled.wi)) / max(sampled.pdf, EPS);
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
  if (t >= (*best).t || t <= EPS) { return false; }
  (*best).t = t; (*best).prim = prim;
  return any_hit;
}

fn t_sphere(ro: vec3f, rd: vec3f, prim: Prim) -> f32 {
  let oc = ro - prim.a.xyz; let b = dot(oc, rd); let disc = b * b - dot(oc, oc) + prim.a.w * prim.a.w;
  if (disc < 0.0) { return T_MAX; }
  let s = sqrt(disc); var t = -b - s; if (t <= EPS) { t = -b + s; }
  if (t <= EPS) { return T_MAX; }
  return t;
}
fn t_plane(ro: vec3f, rd: vec3f, prim: Prim) -> f32 {
  if (abs(rd.y) < EPS) { return T_MAX; }
  let t = (prim.a.w - ro.y) / rd.y;
  if (t <= EPS) { return T_MAX; }
  return t;
}
fn t_quad(ro: vec3f, rd: vec3f, prim: Prim) -> f32 {
  let n = cross(prim.b.xyz, prim.c.xyz); let area = length(n);
  if (area < EPS) { return T_MAX; }
  let nn = n / area; let denom = dot(nn, rd);
  if (abs(denom) < EPS) { return T_MAX; }
  let t = dot(nn, prim.a.xyz - ro) / denom;
  if (t <= EPS) { return T_MAX; }
  let w = ro + rd * t - prim.a.xyz;
  let uu = dot(prim.b.xyz, prim.b.xyz); let vv = dot(prim.c.xyz, prim.c.xyz); let uv = dot(prim.b.xyz, prim.c.xyz);
  let det = uv * uv - uu * vv;
  let s = (uv * dot(w, prim.c.xyz) - vv * dot(w, prim.b.xyz)) / det;
  let r = (uv * dot(w, prim.b.xyz) - uu * dot(w, prim.c.xyz)) / det;
  if (s < 0.0 || s > 1.0 || r < 0.0 || r > 1.0) { return T_MAX; }
  return t;
}
fn t_box(ro: vec3f, rd: vec3f, prim: Prim) -> f32 {
  let cs = prim.c.x; let sn = prim.c.y;
  let o = rot_y_t(ro - prim.a.xyz, cs, sn); let d = rot_y_t(rd, cs, sn);
  let inv = safe_inv(d);
  let t0 = (-prim.b.xyz - o) * inv; let t1 = (prim.b.xyz - o) * inv;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  var t = tmin; if (tmin <= EPS) { t = tmax; }
  if (tmax < max(tmin, EPS) || t <= EPS) { return T_MAX; }
  return t;
}
fn t_cyl(ro: vec3f, rd: vec3f, prim: Prim) -> f32 {
  let c = prim.a.xyz; let radius = prim.a.w; let hh = prim.b.w;
  let o = ro - c; let a = rd.x * rd.x + rd.z * rd.z; let b = o.x * rd.x + o.z * rd.z;
  let cc = o.x * o.x + o.z * o.z - radius * radius;
  var t = T_MAX;
  if (a > EPS) {
    let disc = b * b - a * cc;
    if (disc >= 0.0) {
      var tc = (-b - sqrt(disc)) / a; if (tc <= EPS) { tc = (-b + sqrt(disc)) / a; }
      if (tc > EPS && tc < T_MAX && abs(o.y + tc * rd.y) <= hh) { t = tc; }
    }
  }
  if (abs(rd.y) > EPS) {
    for (var cap = 0u; cap < 2u; cap++) {
      let cy = select(-hh, hh, cap == 0u);
      let tc = (cy - o.y) / rd.y; let q = o + rd * tc;
      if (tc > EPS && tc < t && q.x * q.x + q.z * q.z <= radius * radius) { t = tc; }
    }
  }
  return t;
}

fn scan_prims(ro: vec3f, rd: vec3f, tmax: f32, any_hit: bool) -> Isect {
  var best = none(); best.t = tmax;
  var i = 0u;
  let s0 = trace.n_sphere;
  while (i < s0) { if (keep(&best, t_sphere(ro, rd, load_prim(i)), i32(i), any_hit)) { return best; } i += 1u; }
  let s1 = s0 + trace.n_plane;
  while (i < s1) { if (keep(&best, t_plane(ro, rd, load_prim(i)), i32(i), any_hit)) { return best; } i += 1u; }
  let s2 = s1 + trace.n_quad;
  while (i < s2) { if (keep(&best, t_quad(ro, rd, load_prim(i)), i32(i), any_hit)) { return best; } i += 1u; }
  let s3 = s2 + trace.n_box;
  while (i < s3) { if (keep(&best, t_box(ro, rd, load_prim(i)), i32(i), any_hit)) { return best; } i += 1u; }
  let s4 = s3 + trace.n_cyl;
  while (i < s4) { if (keep(&best, t_cyl(ro, rd, load_prim(i)), i32(i), any_hit)) { return best; } i += 1u; }
  return best;
}

fn hit_tri(ro: vec3f, rd: vec3f, tri: TriPos) -> vec3f {
  let e1 = tri.b.xyz - tri.a.xyz; let e2 = tri.c.xyz - tri.a.xyz;
  let n = cross(e1, e2); let ao = ro - tri.a.xyz; let dao = cross(ao, rd);
  let det = -dot(rd, n); if (abs(det) < 1e-8) { return vec3f(T_MAX); }
  let inv = 1.0 / det; let t = dot(ao, n) * inv;
  let u = dot(e2, dao) * inv; let v = -dot(e1, dao) * inv;
  if (t < EPS || u < 0.0 || v < 0.0 || u + v > 1.0) { return vec3f(T_MAX); }
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

const WGSL_LIGHT = /* wgsl */ `
fn light_le(i: u32) -> vec3f {
  let L = load_light(i);
  return vec3f(L.le_x, L.u.w, L.v.w);
}
fn light_power(i: u32) -> f32 {
  let L = load_light(i);
  return max(EPS, lum(light_le(i)) * L.area);
}
fn total_light_power() -> f32 { return max(trace.tot_power, EPS); }
fn vis_range(dist: f32) -> f32 { return dist - max(EPS * 16.0, dist * 1e-3); }
fn pick_light(rng: ptr<function, u32>, tot: f32) -> u32 {
  let n = trace.light_count;
  let x = pcg(rng) * f32(n);
  let i = min(u32(x), n - 1u);
  let L = load_light(i);
  if (fract(x) < L.pick.x) { return i; }
  return min(u32(L.pick.y), n - 1u);
}
fn pick_pdf(i: u32, tot: f32) -> f32 { return light_power(i) / tot; }

fn sphere_pdf_w(p: vec3f, c: vec3f, r: f32) -> f32 {
  let d2 = dot(c - p, c - p);
  if (d2 <= r * r) { return 1.0 / max(4.0 * PI * r * r, EPS); }
  let cos_max = sqrt(max(0.0, 1.0 - (r * r) / max(d2, EPS)));
  return 1.0 / max(2.0 * PI * (1.0 - cos_max), EPS);
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
  if (abs(det) < EPS) { return false; }
  let s = (uv * dot(w, L.v.xyz) - vv * dot(w, L.u.xyz)) / det;
  let r = (uv * dot(w, L.u.xyz) - uu * dot(w, L.v.xyz)) / det;
  return s >= -EPS && s <= 1.0 + EPS && r >= -EPS && r <= 1.0 + EPS;
}
fn area_pdf_w(p_pick: f32, area: f32, dist2: f32, cos_l: f32) -> f32 {
  return p_pick / max(area, EPS) * dist2 / max(cos_l, EPS);
}
fn reach(origin: vec3f, wi: vec3f, dist: f32) -> bool {
  return !occluded(origin, wi, vis_range(dist));
}

fn next_event(p: vec3f, n: vec3f, gn: vec3f, wo: vec3f, albedo: vec3f, roughness: f32, metallic: f32, transmission: f32, ior: f32, enter: bool, rng: ptr<function, u32>) -> vec3f {
  if (trace.light_count == 0u) { return vec3f(0.0); }
  let tot = total_light_power();
  let i = pick_light(rng, tot);
  let L = load_light(i);
  let p_pick = pick_pdf(i, tot);
  var wi = vec3f(0.0, 1.0, 0.0);
  var pdf_w = 1.0;
  let origin = p + gn * (EPS * 8.0);
  if (L.kind == LIGHT_SPHERE) {
    let c = L.origin.xyz; let r = L.origin.w;
    let to_c = c - p; let d2 = dot(to_c, to_c);
    if (d2 <= r * r) { return vec3f(0.0); }
    let cos_max = sqrt(max(0.0, 1.0 - (r * r) / d2));
    wi = sample_cone(to_c / sqrt(d2), cos_max, rand2(rng));
    if (dot(n, wi) <= 0.0) { return vec3f(0.0); }
    pdf_w = p_pick * sphere_pdf_w(p, c, r);
    var sph: Prim;
    sph.a = vec4f(c, r);
    let t = t_sphere(origin, wi, sph);
    if (t >= T_MAX || occluded(origin, wi, vis_range(t))) { return vec3f(0.0); }
  } else {
    var sample_p = L.origin.xyz;
    var ln = vec3f(0.0, 1.0, 0.0);
    if (L.kind == LIGHT_CYL) {
      let c = L.origin.xyz; let radius = L.origin.w; let hh = L.u.x;
      let aside = 2.0 * PI * radius * (2.0 * hh);
      let acap = 2.0 * PI * radius * radius;
      if (pcg(rng) * (aside + acap) < aside) {
        let y = (pcg(rng) * 2.0 - 1.0) * hh;
        let a = pcg(rng) * 2.0 * PI;
        let cs = cos(a); let sn = sin(a);
        sample_p = c + vec3f(radius * cs, y, radius * sn);
        ln = vec3f(cs, 0.0, sn);
      } else {
        let cap = select(-1.0, 1.0, pcg(rng) < 0.5);
        let dsk = disk(rand2(rng)) * radius;
        sample_p = c + vec3f(dsk.x, cap * hh, dsk.y);
        ln = vec3f(0.0, cap, 0.0);
      }
    } else if (L.kind == LIGHT_TRI) {
      let r1 = pcg(rng); let r2 = pcg(rng);
      let su = 1.0 - sqrt(r1); let sv = r2 * sqrt(r1);
      sample_p = L.origin.xyz + L.u.xyz * su + L.v.xyz * sv;
      ln = normalize(cross(L.u.xyz, L.v.xyz));
    } else {
      let uv = rand2(rng);
      sample_p = L.origin.xyz + L.u.xyz * uv.x + L.v.xyz * uv.y;
      ln = normalize(cross(L.u.xyz, L.v.xyz));
    }
    var to_l = sample_p - p; let dist2 = dot(to_l, to_l); let dist = sqrt(dist2);
    if (dist < EPS) { return vec3f(0.0); }
    wi = to_l / dist;
    let cos_l = -dot(ln, wi); let cos_p = dot(n, wi);
    if (cos_l <= 0.0 || cos_p <= 0.0) { return vec3f(0.0); }
    pdf_w = area_pdf_w(p_pick, L.area, dist2, cos_l);
    if (!reach(origin, wi, dist)) { return vec3f(0.0); }
  }
  let ev = eval_bsdf(n, wo, wi, albedo, roughness, metallic, transmission, ior, enter);
  if (pdf_w <= EPS) { return vec3f(0.0); }
  return ev.f * light_le(i) * max(dot(n, wi), 0.0) * mis2(pdf_w, ev.pdf) / pdf_w;
}

fn light_pdf_hit(hit: Hit, o: vec3f, d: vec3f) -> f32 {
  let tot = total_light_power();
  var pdf_w = 0.0;
  let dist2 = dot(hit.p - o, hit.p - o);
  let cos_l = max(0.0, -dot(hit.gn, d));
  for (var i = 0u; i < trace.light_count; i++) {
    let L = load_light(i);
    let p_pick = pick_pdf(i, tot);
    if (L.kind == LIGHT_SPHERE) {
      if (i32(L.prim) != hit.prim) { continue; }
      pdf_w += p_pick * sphere_pdf_w(o, L.origin.xyz, L.origin.w);
    } else if (L.kind == LIGHT_TRI) {
      if (L.prim != hit.tri) { continue; }
      pdf_w += area_pdf_w(p_pick, L.area, dist2, cos_l);
    } else if (L.kind == LIGHT_CYL) {
      if (i32(L.prim) != hit.prim) { continue; }
      pdf_w += area_pdf_w(p_pick, L.area, dist2, cos_l);
    } else {
      if (i32(L.prim) != hit.prim || !on_quad(hit.p, L)) { continue; }
      pdf_w += area_pdf_w(p_pick, L.area, dist2, cos_l);
    }
  }
  return pdf_w;
}

fn env_index(x: u32, y: u32) -> u32 { return y * trace.env_w + x; }
fn env_n() -> u32 { return trace.env_w * trace.env_h; }
fn env_f32(i: u32) -> f32 {
  let v = env[env_n() + (i >> 2u)];
  let k = i & 3u;
  return select(select(select(v.x, v.y, k == 1u), v.z, k == 2u), v.w, k == 3u);
}
fn env_dir_uv(rd: vec3f) -> vec2f {
  return vec2f(atan2(rd.z, rd.x) * 0.5 / PI + 0.5, acos(clamp(rd.y, -1.0, 1.0)) / PI);
}
fn env_pixel(rd: vec3f) -> vec2u {
  let uv = env_dir_uv(rd);
  return vec2u(min(u32(uv.x * f32(trace.env_w)), trace.env_w - 1u), min(u32(uv.y * f32(trace.env_h)), trace.env_h - 1u));
}
fn env_lookup(rd: vec3f) -> vec4f {
  if (trace.use_ibl == 0u) { return vec4f(0.0); }
  let px = env_pixel(rd);
  return env[env_index(px.x, px.y)];
}
fn sky(rd: vec3f) -> vec3f { return env_lookup(rd).xyz * trace.env_gain; }
fn env_pdf_dir(rd: vec3f) -> f32 { return env_lookup(rd).w; }
fn env_pick(rng: ptr<function, u32>) -> vec2u {
  let n = env_n();
  let x = pcg(rng) * f32(n);
  let i = min(u32(x), n - 1u);
  let j = select(i, min(u32(env_f32(n + i)), n - 1u), fract(x) >= env_f32(i));
  return vec2u(j % trace.env_w, j / trace.env_w);
}
fn next_event_env(p: vec3f, n: vec3f, gn: vec3f, wo: vec3f, albedo: vec3f, roughness: f32, metallic: f32, transmission: f32, ior: f32, enter: bool, rng: ptr<function, u32>) -> vec3f {
  if (trace.use_ibl == 0u) { return vec3f(0.0); }
  let px = env_pick(rng);
  let uv = vec2f((f32(px.x) + pcg(rng)) / f32(trace.env_w), (f32(px.y) + pcg(rng)) / f32(trace.env_h));
  let phi = (uv.x - 0.5) * 2.0 * PI;
  let theta = uv.y * PI;
  let st = sin(theta);
  let wi = vec3f(st * cos(phi), cos(theta), st * sin(phi));
  let pix = env[env_index(px.x, px.y)]; let pdf_e = pix.w; let le = pix.xyz * trace.env_gain;
  let cos_p = dot(n, wi);
  if (cos_p <= 0.0 || pdf_e <= EPS) { return vec3f(0.0); }
  if (occluded(p + gn * (EPS * 8.0), wi, T_MAX)) { return vec3f(0.0); }
  let ev = eval_bsdf(n, wo, wi, albedo, roughness, metallic, transmission, ior, enter);
  return ev.f * le * cos_p * mis2(pdf_e, ev.pdf) / pdf_e;
}
`;

const WGSL_PATH = /* wgsl */ `
fn trace_path(ro0: vec3f, rd0: vec3f, rng: ptr<function, u32>) -> vec3f {
  var radiance = vec3f(0.0); var o = ro0; var d = rd0; var beta = vec3f(1.0); var eta_scale = 1.0; var pdf = 1.0; var delta = true;
  var record_index: array<u32, 8>;
  var record_radiance: array<vec3f, 8>;
  var record_beta: array<vec3f, 8>;
  var record_count = 0u;
  for (var bounce = 0u; trace.bounce == 0u || bounce < trace.bounce; bounce++) {
    let hit = intersect(o, d);
    if (!hit.ok) {
      if (bounce > 0u || trace.hide_ibl == 0u) {
        let envl = env_lookup(d);
        radiance += beta * envl.xyz * trace.env_gain * select(mis2(pdf, envl.w), 1.0, delta);
      }
      break;
    }
    let front = dot(hit.gn, d) < 0.0;
    let ns = select(-hit.n, hit.n, dot(hit.n, d) < 0.0);
    let gs = select(-hit.gn, hit.gn, front);
    let wo = -d;
    if (max(hit.emission.x, max(hit.emission.y, hit.emission.z)) > 0.0) {
      if (front) { radiance += beta * hit.emission * select(mis2(pdf, light_pdf_hit(hit, o, d)), 1.0, delta); }
      break;
    }
    radiance += beta * next_event(hit.p, ns, gs, wo, hit.albedo, hit.roughness, hit.metallic, hit.transmission, hit.ior, front, rng);
    radiance += beta * next_event_env(hit.p, ns, gs, wo, hit.albedo, hit.roughness, hit.metallic, hit.transmission, hit.ior, front, rng);
    let s = sample_guided_bsdf(hit.p, ns, wo, hit.albedo, hit.roughness, hit.metallic, hit.transmission, hit.ior, front, rng);
    if (s.pdf <= 0.0 || max(s.weight.x, max(s.weight.y, s.weight.z)) <= 0.0) { break; }
    if (record_count < GUIDE_RECORDS && guide_eligible(hit.roughness, hit.metallic, hit.transmission)) {
      let local = to_local(frame_n(ns), s.wi);
      record_index[record_count] = guide_cell(hit.p) * GUIDE_DIRS + guide_bin_local(local);
      record_radiance[record_count] = radiance;
      record_beta[record_count] = beta;
      record_count++;
    }
    beta *= s.weight; eta_scale *= s.eta_scale; pdf = s.pdf; delta = s.delta == 1u;
    let g_out = select(-hit.gn, hit.gn, dot(hit.gn, s.wi) >= 0.0);
    o = hit.p + g_out * (EPS * 8.0); d = s.wi;
    if (bounce >= RR_START) {
      let q = clamp(max3(beta * eta_scale), RR_MIN, RR_MAX);
      if (pcg(rng) > q) { break; }
      beta /= q;
    }
  }
  for (var i = 0u; i < record_count; i++) {
    let future = max((radiance - record_radiance[i]) / max(record_beta[i], vec3f(EPS)), vec3f(0.0));
    let weight = u32(clamp(lum(future) * 64.0, 0.0, 4095.0));
    if (weight > 0u) { atomicAdd(&guide_train[record_index[i]], weight); }
  }
  return radiance;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= trace.size_x || id.y >= trace.size_y) { return; }
  let i = id.y * trace.size_x + id.x;
  var rng = id.x + id.y * 1973u + trace.frame * 9277u + 1u;
  rng = rng * 747796405u + 2891336453u;
  let jitter = fract(vec2f(pcg(&rng), pcg(&rng)) + vec2f(R2A, R2B) * f32(trace.frame));
  let u = (f32(id.x) + jitter.x) / f32(trace.size_x);
  let v = (f32(id.y) + jitter.y) / f32(trace.size_y);
  let pinhole = normalize(trace.forward + trace.right * ((2.0 * u - 1.0) * trace.half_w) + trace.up * ((1.0 - 2.0 * v) * trace.half_h));
  var ro = trace.origin;
  var rd = pinhole;
  if (trace.aperture > 0.0) {
    let lens = disk(rand2(&rng)) * trace.aperture * 0.5;
    ro = trace.origin + trace.right * lens.x + trace.up * lens.y;
    rd = normalize(trace.origin + pinhole * max(trace.focus, EPS) - ro);
  }
  let L = trace_path(ro, rd, &rng);
  let prev = src[i];
  dst[i] = vec4f(prev.xyz + L, prev.w + 1.0);
}
`;

export const TRACE_WGSL = [WGSL_CORE, WGSL_BSDF, WGSL_HIT, WGSL_LIGHT, WGSL_PATH].join("\n");

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
