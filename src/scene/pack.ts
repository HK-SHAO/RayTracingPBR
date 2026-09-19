import { buildBvh, type BvhNode, type GpuTri } from "../mesh/bvh";
import { aliasTable } from "../render/alias";
import { lum } from "../render/physics";
import type { Vec3 } from "../math/vec";
import {
  KIND_BOX,
  KIND_CYLINDER,
  KIND_PLANE,
  KIND_QUAD,
  KIND_SPHERE,
  LIGHT_CYL,
  LIGHT_QUAD,
  LIGHT_SPHERE,
  LIGHT_TRI,
  type AreaLight,
  type BoxPrim,
  type Prim,
  type SceneWorld,
} from "./types";

export const PRIM_FLOATS = 16;
export const LIGHT_FLOATS = 20;
export const MAT_FLOATS = 12;
export const TRI_POS_FLOATS = 12;
export const TRI_N_FLOATS = 12;
export const TRI_FLOATS = TRI_POS_FLOATS + TRI_N_FLOATS;
export const NODE_FLOATS = 8;

export type PackedScene = {
  prims: Float32Array;
  lights: Float32Array;
  materials: Float32Array;
  triPos: Float32Array;
  triN: Float32Array;
  nodes: Float32Array;
  atlas: Float32Array;
  primOff: number;
  lightOff: number;
  matOff: number;
  triOff: number;
  nodeOff: number;
  nrmOff: number;
  primCount: number;
  lightCount: number;
  triCount: number;
  nodeCount: number;
  nSphere: number;
  nPlane: number;
  nQuad: number;
  nBox: number;
  nCyl: number;
  powerSum: number;
};

function writeVec3(out: Float32Array, o: number, v: readonly [number, number, number]): void {
  out[o] = v[0];
  out[o + 1] = v[1];
  out[o + 2] = v[2];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function rotY(v: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

function packPrim(out: Float32Array, i: number, prim: Prim): void {
  const o = i * PRIM_FLOATS;
  const u = new Uint32Array(out.buffer, out.byteOffset + o * 4, 4);
  u[0] = prim.kind;
  u[1] = prim.material;
  if (prim.kind === KIND_SPHERE) {
    writeVec3(out, o + 4, prim.center);
    out[o + 7] = prim.radius;
  } else if (prim.kind === KIND_PLANE) {
    out[o + 5] = 1;
    out[o + 7] = prim.y;
  } else if (prim.kind === KIND_QUAD) {
    writeVec3(out, o + 4, prim.origin);
    writeVec3(out, o + 8, prim.u);
    writeVec3(out, o + 12, prim.v);
  } else if (prim.kind === KIND_BOX) {
    writeVec3(out, o + 4, prim.center);
    writeVec3(out, o + 8, prim.half);
    out[o + 12] = Math.cos(prim.yaw);
    out[o + 13] = Math.sin(prim.yaw);
  } else if (prim.kind === KIND_CYLINDER) {
    writeVec3(out, o + 4, prim.center);
    out[o + 7] = prim.radius;
    out[o + 11] = prim.halfHeight;
  }
}

function glowing(e: readonly [number, number, number]): boolean {
  return e[0] + e[1] + e[2] > 1e-8;
}

function quadArea(
  u: readonly [number, number, number],
  v: readonly [number, number, number],
): number {
  return Math.hypot(
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  );
}

function quadLight(prim: number, origin: Vec3, u: Vec3, v: Vec3, emission: Vec3): AreaLight {
  return {
    kind: LIGHT_QUAD,
    prim,
    origin,
    u,
    v,
    radius: 0,
    emission,
    area: quadArea(u, v),
  };
}

function boxFaceLights(prim: BoxPrim, index: number, emission: Vec3): AreaLight[] {
  const hx = prim.half[0];
  const hy = prim.half[1];
  const hz = prim.half[2];
  const local: [Vec3, Vec3, Vec3][] = [
    [
      [hx, -hy, -hz],
      [0, 2 * hy, 0],
      [0, 0, 2 * hz],
    ],
    [
      [-hx, -hy, hz],
      [0, 2 * hy, 0],
      [0, 0, -2 * hz],
    ],
    [
      [-hx, hy, hz],
      [2 * hx, 0, 0],
      [0, 0, -2 * hz],
    ],
    [
      [-hx, -hy, -hz],
      [2 * hx, 0, 0],
      [0, 0, 2 * hz],
    ],
    [
      [-hx, -hy, hz],
      [2 * hx, 0, 0],
      [0, 2 * hy, 0],
    ],
    [
      [hx, -hy, -hz],
      [-2 * hx, 0, 0],
      [0, 2 * hy, 0],
    ],
  ];
  return local.map(([o, u, v]) =>
    quadLight(
      index,
      add(prim.center, rotY(o, prim.yaw)),
      rotY(u, prim.yaw),
      rotY(v, prim.yaw),
      emission,
    ),
  );
}

export function lightsFromEmissive(world: SceneWorld, tris: GpuTri[] = []): AreaLight[] {
  const lights: AreaLight[] = [];
  for (let i = 0; i < world.prims.length; i++) {
    const prim = world.prims[i];
    const mat = prim ? world.materials[prim.material] : undefined;
    if (!prim || !mat || !glowing(mat.emission)) continue;
    if (prim.kind === KIND_SPHERE) {
      lights.push({
        kind: LIGHT_SPHERE,
        prim: i,
        origin: prim.center,
        u: [0, 0, 0],
        v: [0, 0, 0],
        radius: prim.radius,
        emission: mat.emission,
        area: 4 * Math.PI * prim.radius * prim.radius,
      });
    } else if (prim.kind === KIND_QUAD) {
      lights.push(quadLight(i, prim.origin, prim.u, prim.v, mat.emission));
    } else if (prim.kind === KIND_BOX) {
      lights.push(...boxFaceLights(prim, i, mat.emission));
    } else if (prim.kind === KIND_CYLINDER) {
      const r = prim.radius;
      const hh = prim.halfHeight;
      lights.push({
        kind: LIGHT_CYL,
        prim: i,
        origin: prim.center,
        u: [hh, 0, 0],
        v: [0, 0, 0],
        radius: r,
        emission: mat.emission,
        area: 2 * Math.PI * r * (2 * hh + r),
      });
    }
  }
  for (let i = 0; i < tris.length; i++) {
    const tri = tris[i];
    if (!tri) continue;
    const mat = world.materials[tri.material];
    if (!mat || !glowing(mat.emission)) continue;
    const u: Vec3 = [tri.b[0] - tri.a[0], tri.b[1] - tri.a[1], tri.b[2] - tri.a[2]];
    const v: Vec3 = [tri.c[0] - tri.a[0], tri.c[1] - tri.a[1], tri.c[2] - tri.a[2]];
    lights.push({
      kind: LIGHT_TRI,
      prim: i,
      origin: tri.a,
      u,
      v,
      radius: 0,
      emission: mat.emission,
      area: 0.5 * quadArea(u, v),
    });
  }
  return lights;
}

function writeLight(
  out: Float32Array,
  i: number,
  light: AreaLight,
  accept: number,
  alias: number,
): void {
  const o = i * LIGHT_FLOATS;
  const bits = new Uint32Array(out.buffer, out.byteOffset + o * 4, 4);
  bits[0] = light.kind;
  bits[1] = light.prim;
  out[o + 2] = light.emission[0];
  out[o + 3] = light.area;
  writeVec3(out, o + 4, light.origin);
  out[o + 7] = light.radius;
  writeVec3(out, o + 8, light.kind === LIGHT_SPHERE ? light.emission : light.u);
  out[o + 11] = light.emission[1];
  writeVec3(
    out,
    o + 12,
    light.kind === LIGHT_QUAD || light.kind === LIGHT_TRI ? light.v : [0, 0, 0],
  );
  out[o + 15] = light.emission[2];
  out[o + 16] = accept;
  out[o + 17] = alias;
}

export function packWorld(world: SceneWorld, prev?: PackedScene): PackedScene {
  const flatPos: number[] = [];
  const flatNor: number[] = [];
  const flatIdx: number[] = [];
  const triMat: number[] = [];
  for (const mesh of world.meshes) {
    const base = flatPos.length / 3;
    for (let i = 0; i < mesh.positions.length; i++) flatPos.push(mesh.positions[i] ?? 0);
    for (let i = 0; i < mesh.normals.length; i++) flatNor.push(mesh.normals[i] ?? 0);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      flatIdx.push(
        (mesh.indices[i] ?? 0) + base,
        (mesh.indices[i + 1] ?? 0) + base,
        (mesh.indices[i + 2] ?? 0) + base,
      );
      triMat.push(mesh.material);
    }
  }

  let nodes: BvhNode[] = [{ min: [0, 0, 0], max: [0, 0, 0], start: 0, count: 0 }];
  let gpuTris: GpuTri[] = [];
  const reuseMesh = flatIdx.length === 0 && prev && prev.triCount === 0;
  if (flatIdx.length > 0) {
    const packed = buildBvh(
      new Float32Array(flatPos),
      new Float32Array(flatNor),
      new Uint32Array(flatIdx),
      new Uint32Array(triMat),
    );
    nodes = packed.nodes;
    gpuTris = packed.tris;
  }

  const sceneLights = lightsFromEmissive(world, gpuTris);
  const remap = new Int32Array(world.prims.length);
  const ordered: Prim[] = [];
  const kindN = [0, 0, 0, 0, 0];
  for (let kind = 0; kind < 5; kind++) {
    for (let i = 0; i < world.prims.length; i++) {
      const prim = world.prims[i];
      if (!prim || prim.kind !== kind) continue;
      remap[i] = ordered.length;
      ordered.push(prim);
      kindN[kind] = (kindN[kind] ?? 0) + 1;
    }
  }
  const primCount = Math.max(1, ordered.length);
  const lightCount = Math.max(1, sceneLights.length);
  const prims = new Float32Array(primCount * PRIM_FLOATS);
  for (let i = 0; i < ordered.length; i++) {
    const prim = ordered[i];
    if (prim) packPrim(prims, i, prim);
  }

  const lights = new Float32Array(lightCount * LIGHT_FLOATS);
  const grouped: AreaLight[] = [];
  const firstAt = new Int32Array(ordered.length).fill(-1);
  const countAt = new Uint32Array(ordered.length);
  for (let i = 0; i < sceneLights.length; i++) {
    const light = sceneLights[i];
    if (!light) continue;
    if (light.kind === LIGHT_TRI) {
      grouped.push(light);
      continue;
    }
    const slot = remap[light.prim] ?? light.prim;
    if (slot < 0 || slot >= ordered.length) continue;
    const at = firstAt[slot] ?? -1;
    if (at < 0) firstAt[slot] = grouped.length;
    countAt[slot] = (countAt[slot] ?? 0) + 1;
    grouped.push({ ...light, prim: slot });
  }
  const powers = new Float32Array(Math.max(1, grouped.length));
  for (let i = 0; i < grouped.length; i++) {
    const light = grouped[i];
    powers[i] = light ? Math.max(1e-4, lum(light.emission) * light.area) : 1e-4;
  }
  const table = aliasTable(powers);
  for (let i = 0; i < grouped.length; i++) {
    const light = grouped[i];
    if (!light) continue;
    writeLight(lights, i, light, table.accept[i] ?? 1, table.alias[i] ?? i);
  }
  for (let i = 0; i < ordered.length; i++) {
    const o = i * PRIM_FLOATS;
    const u = new Uint32Array(prims.buffer, prims.byteOffset + o * 4, 4);
    const first = firstAt[i] ?? -1;
    u[2] = first >= 0 ? first : 0;
    u[3] = countAt[i] ?? 0;
  }

  const materials = new Float32Array(Math.max(1, world.materials.length) * MAT_FLOATS);
  for (let i = 0; i < world.materials.length; i++) {
    const m = world.materials[i];
    if (!m) continue;
    const o = i * MAT_FLOATS;
    writeVec3(materials, o, m.albedo);
    materials[o + 3] = m.roughness;
    writeVec3(materials, o + 4, m.emission);
    materials[o + 7] = m.metallic;
    materials[o + 8] = m.transmission;
    materials[o + 9] = m.ior;
  }

  const triCount = Math.max(1, gpuTris.length);
  const nodeCount = Math.max(1, nodes.length);
  let triPos = new Float32Array(triCount * TRI_POS_FLOATS);
  let triN = new Float32Array(triCount * TRI_N_FLOATS);
  let nodeData = new Float32Array(nodeCount * NODE_FLOATS);
  if (reuseMesh && prev) {
    triPos = new Float32Array(prev.triPos);
    triN = new Float32Array(prev.triN);
    nodeData = new Float32Array(prev.nodes);
  } else {
    for (let i = 0; i < gpuTris.length; i++) {
      const tri = gpuTris[i];
      if (!tri) continue;
      const o = i * TRI_POS_FLOATS;
      writeVec3(triPos, o, tri.a);
      triPos[o + 3] = tri.material;
      writeVec3(triPos, o + 4, tri.b);
      writeVec3(triPos, o + 8, tri.c);
      writeVec3(triN, o, tri.n0);
      writeVec3(triN, o + 4, tri.n1);
      writeVec3(triN, o + 8, tri.n2);
    }
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const o = i * NODE_FLOATS;
      writeVec3(nodeData, o, node.min);
      nodeData[o + 3] = node.start;
      writeVec3(nodeData, o + 4, node.max);
      nodeData[o + 7] = node.count;
    }
  }

  const primOff = 0;
  const lightOff = prims.length / 4;
  const matOff = lightOff + lights.length / 4;
  const triOff = matOff + materials.length / 4;
  const nodeOff = triOff + triPos.length / 4;
  const nrmOff = nodeOff + nodeData.length / 4;
  const atlas = new Float32Array(
    prims.length + lights.length + materials.length + triPos.length + nodeData.length + triN.length,
  );
  let at = 0;
  atlas.set(prims, at);
  at += prims.length;
  atlas.set(lights, at);
  at += lights.length;
  atlas.set(materials, at);
  at += materials.length;
  atlas.set(triPos, at);
  at += triPos.length;
  atlas.set(nodeData, at);
  at += nodeData.length;
  atlas.set(triN, at);

  let powerSum = 0;
  for (const light of sceneLights) {
    powerSum += Math.max(1e-4, lum(light.emission) * light.area);
  }

  return {
    prims,
    lights,
    materials,
    triPos,
    triN,
    nodes: nodeData,
    atlas,
    primOff,
    lightOff,
    matOff,
    triOff,
    nodeOff,
    nrmOff,
    primCount: world.prims.length,
    lightCount: sceneLights.length,
    triCount: gpuTris.length,
    nodeCount: nodes.length,
    nSphere: kindN[0] ?? 0,
    nPlane: kindN[1] ?? 0,
    nQuad: kindN[2] ?? 0,
    nBox: kindN[3] ?? 0,
    nCyl: kindN[4] ?? 0,
    powerSum,
  };
}
