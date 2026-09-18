import { storage, type Gpu, type StorageBuffer } from "vgpu";
import { EMPTY_ENV, packEnv, type EnvMap } from "./hdr";

export type EnvGpu = {
  data: StorageBuffer;
  width: number;
  height: number;
};

export function writeStorage(buffer: StorageBuffer, data: Float32Array): void {
  buffer.write(data as unknown as BufferSource);
}

export function destroyStorage(buffer: StorageBuffer): void {
  const free = buffer as StorageBuffer & { destroy?: () => void };
  free.destroy?.();
}

export function uploadEnv(gpu: Gpu, env: EnvMap = EMPTY_ENV): EnvGpu {
  const packed = packEnv(env);
  const data = storage(gpu, Math.max(16, packed.byteLength), "read");
  writeStorage(data, packed);
  return { data, width: env.width, height: env.height };
}
