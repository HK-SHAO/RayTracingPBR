import { storage, type Gpu, type StorageBuffer } from "vgpu";
import type { PackedScene } from "./pack";
import { destroyStorage, writeStorage } from "../render/env";

export type SceneGpu = {
  world: StorageBuffer;
  bytes: number;
  primCount: number;
  lightCount: number;
  triCount: number;
  primOff: number;
  lightOff: number;
  matOff: number;
  triOff: number;
  nodeOff: number;
  nrmOff: number;
  primNodeOff: number;
  nSphere: number;
  nPlane: number;
  nQuad: number;
  nBox: number;
  nCyl: number;
  powerSum: number;
};

export function worldTrace(world: SceneGpu | undefined) {
  return {
    prim_count: world?.primCount ?? 0,
    light_count: world?.lightCount ?? 0,
    tri_count: world?.triCount ?? 0,
    prim_off: world?.primOff ?? 0,
    light_off: world?.lightOff ?? 0,
    mat_off: world?.matOff ?? 0,
    tri_off: world?.triOff ?? 0,
    node_off: world?.nodeOff ?? 0,
    tot_power: world?.powerSum ?? 0,
    nrm_off: world?.nrmOff ?? 0,
    prim_node_off: world?.primNodeOff ?? 0,
    n_sphere: world?.nSphere ?? 0,
    n_plane: world?.nPlane ?? 0,
    n_quad: world?.nQuad ?? 0,
    n_box: world?.nBox ?? 0,
    n_cyl: world?.nCyl ?? 0,
  };
}

function gpuFromPacked(world: StorageBuffer, packed: PackedScene, bytes: number): SceneGpu {
  return {
    world,
    bytes,
    primCount: packed.primCount,
    lightCount: packed.lightCount,
    triCount: packed.triCount,
    primOff: packed.primOff,
    lightOff: packed.lightOff,
    matOff: packed.matOff,
    triOff: packed.triOff,
    nodeOff: packed.nodeOff,
    nrmOff: packed.nrmOff,
    primNodeOff: packed.primNodeOff,
    nSphere: packed.nSphere,
    nPlane: packed.nPlane,
    nQuad: packed.nQuad,
    nBox: packed.nBox,
    nCyl: packed.nCyl,
    powerSum: packed.powerSum,
  };
}

export function uploadPacked(gpu: Gpu, packed: PackedScene): SceneGpu {
  const bytes = Math.max(16, packed.atlas.byteLength);
  const world = storage(gpu, bytes, "read");
  writeStorage(world, packed.atlas);
  return gpuFromPacked(world, packed, bytes);
}

export function writePacked(gpu: Gpu, prev: SceneGpu | undefined, packed: PackedScene): SceneGpu {
  const bytes = Math.max(16, packed.atlas.byteLength);
  if (prev && prev.bytes >= bytes) {
    writeStorage(prev.world, packed.atlas);
    return gpuFromPacked(prev.world, packed, prev.bytes);
  }
  if (prev) destroySceneGpu(prev);
  return uploadPacked(gpu, packed);
}

export function destroySceneGpu(scene: SceneGpu): void {
  destroyStorage(scene.world);
}
