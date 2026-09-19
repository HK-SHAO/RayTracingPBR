import { expect, test } from "vite-plus/test";
import { buildBvh } from "./bvh";

test("sah split keeps consecutive children and all triangles", () => {
  const n = 32;
  const positions = new Float32Array(n * 9);
  const normals = new Float32Array(n * 9);
  const indices = new Uint32Array(n * 3);
  const materials = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i % 8) * 0.4;
    const z = Math.floor(i / 8) * 0.4;
    const b = i * 9;
    positions[b] = x;
    positions[b + 1] = 0;
    positions[b + 2] = z;
    positions[b + 3] = x + 0.3;
    positions[b + 4] = 0;
    positions[b + 5] = z;
    positions[b + 6] = x;
    positions[b + 7] = 0.3;
    positions[b + 8] = z;
    indices[i * 3] = i * 3;
    indices[i * 3 + 1] = i * 3 + 1;
    indices[i * 3 + 2] = i * 3 + 2;
    normals[b + 1] = 1;
    normals[b + 4] = 1;
    normals[b + 7] = 1;
  }
  const { nodes, tris } = buildBvh(positions, normals, indices, materials);
  expect(tris.length).toBe(n);
  const root = nodes[0];
  expect(root).toBeTruthy();
  expect(root?.count).toBe(0);
  const left = nodes[root?.start ?? 0];
  const right = nodes[(root?.start ?? 0) + 1];
  expect(left).toBeTruthy();
  expect(right).toBeTruthy();
  const leaves = nodes.filter((node) => node.count > 0);
  expect(leaves.reduce((s, node) => s + node.count, 0)).toBe(n);
});
