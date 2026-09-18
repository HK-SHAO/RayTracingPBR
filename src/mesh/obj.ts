export type ParsedMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

function pushTri(indices: number[], a: number, b: number, c: number): void {
  indices.push(a, b, c);
}

export function parseObj(text: string): ParsedMesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const outP: number[] = [];
  const outN: number[] = [];
  const indices: number[] = [];
  const map = new Map<string, number>();

  const vertex = (token: string): number => {
    const cached = map.get(token);
    if (cached !== undefined) return cached;
    const parts = token.split("/");
    const pi = Number(parts[0]);
    const ni = parts.length >= 3 && parts[2] !== "" ? Number(parts[2]) : NaN;
    const px = pi < 0 ? pos.length / 3 + pi : pi - 1;
    const i = outP.length / 3;
    outP.push(pos[px * 3] ?? 0, pos[px * 3 + 1] ?? 0, pos[px * 3 + 2] ?? 0);
    if (Number.isFinite(ni)) {
      const nx = ni < 0 ? nor.length / 3 + ni : ni - 1;
      outN.push(nor[nx * 3] ?? 0, nor[nx * 3 + 1] ?? 0, nor[nx * 3 + 2] ?? 0);
    } else {
      outN.push(0, 0, 0);
    }
    map.set(token, i);
    return i;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const p = line.slice(2).trim().split(/\s+/);
      pos.push(Number(p[0]), Number(p[1]), Number(p[2]));
    } else if (line.startsWith("vn ")) {
      const p = line.slice(3).trim().split(/\s+/);
      nor.push(Number(p[0]), Number(p[1]), Number(p[2]));
    } else if (line.startsWith("f ")) {
      const verts = line.slice(2).trim().split(/\s+/);
      const ids = verts.map(vertex);
      for (let i = 1; i + 1 < ids.length; i++) {
        const a = ids[0];
        const b = ids[i];
        const c = ids[i + 1];
        if (a === undefined || b === undefined || c === undefined) continue;
        pushTri(indices, a, b, c);
      }
    }
  }

  const positions = new Float32Array(outP);
  const normals = new Float32Array(outN);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] ?? 0;
    const ib = indices[t + 1] ?? 0;
    const ic = indices[t + 2] ?? 0;
    const ax = positions[ia * 3] ?? 0,
      ay = positions[ia * 3 + 1] ?? 0,
      az = positions[ia * 3 + 2] ?? 0;
    const bx = positions[ib * 3] ?? 0,
      by = positions[ib * 3 + 1] ?? 0,
      bz = positions[ib * 3 + 2] ?? 0;
    const cx = positions[ic * 3] ?? 0,
      cy = positions[ic * 3 + 1] ?? 0,
      cz = positions[ic * 3 + 2] ?? 0;
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const i of [ia, ib, ic]) {
      if (
        (normals[i * 3] ?? 0) === 0 &&
        (normals[i * 3 + 1] ?? 0) === 0 &&
        (normals[i * 3 + 2] ?? 0) === 0
      ) {
        normals[i * 3] = nx / len;
        normals[i * 3 + 1] = ny / len;
        normals[i * 3 + 2] = nz / len;
      }
    }
  }

  return { positions, normals, indices: new Uint32Array(indices) };
}

export function transformMesh(
  mesh: ParsedMesh,
  scale: number,
  offset: readonly [number, number, number],
): ParsedMesh {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = (mesh.positions[i] ?? 0) * scale + offset[0];
    positions[i + 1] = (mesh.positions[i + 1] ?? 0) * scale + offset[1];
    positions[i + 2] = (mesh.positions[i + 2] ?? 0) * scale + offset[2];
  }
  return { positions, normals: mesh.normals, indices: mesh.indices };
}

export function rotateY(mesh: ParsedMesh, yaw: number): ParsedMesh {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    positions[i] = x * c + z * s;
    positions[i + 1] = mesh.positions[i + 1] ?? 0;
    positions[i + 2] = -x * s + z * c;
    const nx = mesh.normals[i] ?? 0;
    const nz = mesh.normals[i + 2] ?? 0;
    normals[i] = nx * c + nz * s;
    normals[i + 1] = mesh.normals[i + 1] ?? 0;
    normals[i + 2] = -nx * s + nz * c;
  }
  return { positions, normals, indices: mesh.indices };
}

export function meshBounds(mesh: ParsedMesh): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const y = mesh.positions[i + 1] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  return { min, max };
}

export function fitMesh(
  mesh: ParsedMesh,
  height: number,
  standOn: number,
  x: number,
  z: number,
): ParsedMesh {
  const { min, max } = meshBounds(mesh);
  const sizeY = Math.max(1e-6, max[1] - min[1]);
  const s = height / sizeY;
  return transformMesh(mesh, s, [
    x - 0.5 * s * (min[0] + max[0]),
    standOn - s * min[1],
    z - 0.5 * s * (min[2] + max[2]),
  ]);
}
