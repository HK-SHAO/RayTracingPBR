type BuildTri = {
  centre: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
  index: number;
};

export type BvhNode = {
  min: [number, number, number];
  max: [number, number, number];
  start: number;
  count: number;
};

export type GpuTri = {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  n0: [number, number, number];
  n1: [number, number, number];
  n2: [number, number, number];
  material: number;
};

const LEAF = 8;
const MAX_DEPTH = 24;
const BINS = 16;

function grow(min: [number, number, number], max: [number, number, number], t: BuildTri): void {
  for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a] ?? Infinity, t.min[a] ?? Infinity);
    max[a] = Math.max(max[a] ?? -Infinity, t.max[a] ?? -Infinity);
  }
}

function bounds(
  build: BuildTri[],
  start: number,
  count: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < start + count; i++) {
    const t = build[i];
    if (t) grow(min, max, t);
  }
  return { min, max };
}

function area(min: [number, number, number], max: [number, number, number]): number {
  const x = Math.max(0, max[0] - min[0]);
  const y = Math.max(0, max[1] - min[1]);
  const z = Math.max(0, max[2] - min[2]);
  return 2 * (x * y + y * z + z * x);
}

function binOf(t: BuildTri, axis: number, origin: number, extent: number): number {
  const u = ((t.centre[axis] ?? 0) - origin) / extent;
  return Math.min(BINS - 1, Math.max(0, Math.floor(u * BINS)));
}

function partition(
  build: BuildTri[],
  start: number,
  count: number,
  axis: number,
  origin: number,
  extent: number,
  maxBin: number,
): number {
  let i = start;
  let j = start + count - 1;
  while (i <= j) {
    while (i <= j && binOf(build[i]!, axis, origin, extent) <= maxBin) i += 1;
    while (i <= j && binOf(build[j]!, axis, origin, extent) > maxBin) j -= 1;
    if (i < j) {
      const tmp = build[i]!;
      build[i] = build[j]!;
      build[j] = tmp;
      i += 1;
      j -= 1;
    }
  }
  return i - start;
}

function vertexN(
  normals: Float32Array,
  i: number,
  gx: number,
  gy: number,
  gz: number,
): [number, number, number] {
  const nx = normals[i] ?? 0;
  const ny = normals[i + 1] ?? 0;
  const nz = normals[i + 2] ?? 0;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-8) return [gx, gy, gz];
  return [nx / len, ny / len, nz / len];
}

export function buildBvh(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  materials: Uint32Array,
): { nodes: BvhNode[]; tris: GpuTri[] } {
  const build: BuildTri[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ia = (indices[i] ?? 0) * 3;
    const ib = (indices[i + 1] ?? 0) * 3;
    const ic = (indices[i + 2] ?? 0) * 3;
    const ax = positions[ia] ?? 0,
      ay = positions[ia + 1] ?? 0,
      az = positions[ia + 2] ?? 0;
    const bx = positions[ib] ?? 0,
      by = positions[ib + 1] ?? 0,
      bz = positions[ib + 2] ?? 0;
    const cx = positions[ic] ?? 0,
      cy = positions[ic + 1] ?? 0,
      cz = positions[ic + 2] ?? 0;
    build.push({
      centre: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
      min: [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz)],
      max: [Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)],
      index: i,
    });
  }

  const nodes: BvhNode[] = [];
  if (build.length === 0) {
    return { nodes: [{ min: [0, 0, 0], max: [0, 0, 0], start: 0, count: 0 }], tris: [] };
  }

  const split = (nodeIndex: number, start: number, count: number, depth: number): void => {
    const { min, max } = bounds(build, start, count);
    if (count <= LEAF || depth >= MAX_DEPTH) {
      nodes[nodeIndex] = { min, max, start, count };
      return;
    }
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as const;
    const axis = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
    const origin = min[axis] ?? 0;
    const extent = size[axis];
    if (extent < 1e-12) {
      nodes[nodeIndex] = { min, max, start, count };
      return;
    }

    const binMin: [number, number, number][] = Array.from({ length: BINS }, () => [
      Infinity,
      Infinity,
      Infinity,
    ]);
    const binMax: [number, number, number][] = Array.from({ length: BINS }, () => [
      -Infinity,
      -Infinity,
      -Infinity,
    ]);
    const binN = new Int32Array(BINS);
    for (let i = start; i < start + count; i++) {
      const t = build[i];
      if (!t) continue;
      const b = binOf(t, axis, origin, extent);
      binN[b] = (binN[b] ?? 0) + 1;
      grow(binMin[b]!, binMax[b]!, t);
    }

    const parentA = Math.max(area(min, max), 1e-12);
    let bestCost = count;
    let bestBin = -1;
    let leftN = 0;
    const leftMin: [number, number, number] = [Infinity, Infinity, Infinity];
    const leftMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let b = 0; b < BINS - 1; b++) {
      const n = binN[b] ?? 0;
      if (n) {
        const tmin = binMin[b];
        const tmax = binMax[b];
        if (tmin && tmax) {
          leftMin[0] = Math.min(leftMin[0], tmin[0]);
          leftMin[1] = Math.min(leftMin[1], tmin[1]);
          leftMin[2] = Math.min(leftMin[2], tmin[2]);
          leftMax[0] = Math.max(leftMax[0], tmax[0]);
          leftMax[1] = Math.max(leftMax[1], tmax[1]);
          leftMax[2] = Math.max(leftMax[2], tmax[2]);
        }
        leftN += n;
      }
      const rightN = count - leftN;
      if (leftN === 0 || rightN === 0) continue;
      let rmin: [number, number, number] = [Infinity, Infinity, Infinity];
      let rmax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (let k = b + 1; k < BINS; k++) {
        if (!(binN[k] ?? 0)) continue;
        const tmin = binMin[k];
        const tmax = binMax[k];
        if (!tmin || !tmax) continue;
        rmin = [Math.min(rmin[0], tmin[0]), Math.min(rmin[1], tmin[1]), Math.min(rmin[2], tmin[2])];
        rmax = [Math.max(rmax[0], tmax[0]), Math.max(rmax[1], tmax[1]), Math.max(rmax[2], tmax[2])];
      }
      const cost =
        1 + (area(leftMin, leftMax) / parentA) * leftN + (area(rmin, rmax) / parentA) * rightN;
      if (cost < bestCost) {
        bestCost = cost;
        bestBin = b;
      }
    }

    if (bestBin < 0) {
      nodes[nodeIndex] = { min, max, start, count };
      return;
    }
    const leftCount = partition(build, start, count, axis, origin, extent, bestBin);
    if (leftCount === 0 || leftCount === count) {
      nodes[nodeIndex] = { min, max, start, count };
      return;
    }
    const left = nodes.length;
    nodes.push({ min: [0, 0, 0], max: [0, 0, 0], start: 0, count: 0 });
    const right = nodes.length;
    nodes.push({ min: [0, 0, 0], max: [0, 0, 0], start: 0, count: 0 });
    nodes[nodeIndex] = { min, max, start: left, count: 0 };
    split(left, start, leftCount, depth + 1);
    split(right, start + leftCount, count - leftCount, depth + 1);
  };

  nodes.push({ min: [0, 0, 0], max: [0, 0, 0], start: 0, count: 0 });
  split(0, 0, build.length, 0);

  const tris: GpuTri[] = build.map((t) => {
    const ia = (indices[t.index] ?? 0) * 3;
    const ib = (indices[t.index + 1] ?? 0) * 3;
    const ic = (indices[t.index + 2] ?? 0) * 3;
    const ax = positions[ia] ?? 0,
      ay = positions[ia + 1] ?? 0,
      az = positions[ia + 2] ?? 0;
    const bx = positions[ib] ?? 0,
      by = positions[ib + 1] ?? 0,
      bz = positions[ib + 2] ?? 0;
    const cx = positions[ic] ?? 0,
      cy = positions[ic + 1] ?? 0,
      cz = positions[ic + 2] ?? 0;
    const gx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const gy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const gz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const fn: [number, number, number] = [gx / gl, gy / gl, gz / gl];
    return {
      a: [ax, ay, az],
      b: [bx, by, bz],
      c: [cx, cy, cz],
      n0: vertexN(normals, ia, fn[0], fn[1], fn[2]),
      n1: vertexN(normals, ib, fn[0], fn[1], fn[2]),
      n2: vertexN(normals, ic, fn[0], fn[1], fn[2]),
      material: materials[t.index / 3] ?? 0,
    };
  });

  return { nodes, tris };
}
