import { pingPongStorage, type Gpu, type StorageBuffer } from "vgpu";

export const GUIDE_CELL_COUNT = 512;
export const GUIDE_PHI_BINS = 8;
export const GUIDE_Z_BINS = 4;
export const GUIDE_DIR_COUNT = GUIDE_PHI_BINS * GUIDE_Z_BINS;
export const GUIDE_BYTES = GUIDE_CELL_COUNT * GUIDE_DIR_COUNT * 4;
export const GUIDE_FIRST_EPOCH = 64;
export const GUIDE_MAX_EPOCH = 256;

export type GuidingGpu = {
  read: StorageBuffer;
  write: StorageBuffer;
  swap: () => void;
};

const EMPTY_GUIDE = new Uint32Array(GUIDE_BYTES / 4);

export function createGuiding(gpu: Gpu): GuidingGpu {
  const guiding = pingPongStorage(gpu, GUIDE_BYTES);
  clearGuiding(guiding.read);
  clearGuiding(guiding.write);
  return guiding;
}

export function clearGuiding(buffer: StorageBuffer): void {
  buffer.write(EMPTY_GUIDE as unknown as BufferSource);
}
