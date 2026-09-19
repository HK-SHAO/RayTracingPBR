import { compute, init, storage } from "vgpu/node";
import { packWorld } from "../scene/pack";
import { uploadPacked, worldTrace } from "../scene/gpu";
import { cornell } from "../scene/plugins/cornell";
import type { ScenePlugin } from "../scene/types";
import { cameraFrame } from "./camera";
import { uploadEnv, writeStorage } from "./env";
import { buildEnv, decodeRgbe, EMPTY_ENV, fitEnvRgb } from "./hdr";
import { clearGuiding, createGuiding, GUIDE_FIRST_EPOCH, GUIDE_MAX_EPOCH } from "./guiding";
import { readBytes } from "../media";
import { TRACE_PROBE_WGSL, TRACE_WGSL } from "./shaders";
import { PROBE_BYTES, PROBE_FLOATS } from "./probe";

const WG = 8;

export async function traceSamples(
  width: number,
  height: number,
  spp: number,
  plugin: ScenePlugin = cornell,
  guidingEnabled = true,
  bounce = -1,
  probePixel: readonly [number, number] | null = null,
) {
  const gpu = await init();
  try {
    const pixels = width * height;
    const accum = storage(gpu, pixels * 16);
    writeStorage(accum, new Float32Array(pixels * 4));
    const recording = probePixel != null;
    const probe = recording ? storage(gpu, PROBE_BYTES) : undefined;
    if (probe) writeStorage(probe, new Float32Array(PROBE_FLOATS));
    let env = uploadEnv(gpu, EMPTY_ENV);
    let useIbl = 0;
    if (plugin.ibl) {
      const decoded = decodeRgbe(await readBytes(plugin.ibl));
      const fitted = fitEnvRgb(decoded.rgb, decoded.width, decoded.height);
      env = uploadEnv(gpu, buildEnv(fitted.rgb, fitted.width, fitted.height));
      useIbl = 1;
    }
    const world = uploadPacked(gpu, packWorld(await plugin.build()));
    const guiding = createGuiding(gpu);
    const tracer = compute(gpu, recording ? TRACE_PROBE_WGSL : TRACE_WGSL, { label: "trace" });
    const view = cameraFrame(plugin.camera, width / height);
    let epochSize = GUIDE_FIRST_EPOCH;
    let epochEnd = GUIDE_FIRST_EPOCH;
    for (let frame = 0; frame < spp; frame++) {
      if (guidingEnabled && frame >= epochEnd) {
        guiding.swap();
        clearGuiding(guiding.write);
        epochSize = Math.min(GUIDE_MAX_EPOCH, epochSize * 2);
        epochEnd = frame + epochSize;
      }
      tracer.set({
        trace: {
          origin: view.origin,
          half_w: view.halfW,
          right: view.right,
          half_h: view.halfH,
          up: view.up,
          frame,
          forward: view.forward,
          size_x: width,
          size_y: height,
          bounce,
          use_ibl: useIbl,
          env_w: env.width,
          env_h: env.height,
          focus: plugin.camera.radius,
          aperture: 0,
          env_gain: 1,
          hide_ibl: plugin.hideIblDirect ? 1 : 0,
          ...(probePixel ? { probe_x: probePixel[0], probe_y: probePixel[1] } : {}),
          ...worldTrace(world),
        },
        accum,
        env: env.data,
        world: world.world,
        guide: guiding.read,
        guide_train: guiding.write,
        ...(probe ? { probe } : {}),
      });
      tracer.dispatch(Math.ceil(width / WG), Math.ceil(height / WG));
    }
    const bytes = new Float32Array(await accum.read());
    const guideWeights = new Uint32Array(await guiding.read.read());
    const probeData = probe ? new Float32Array(await probe.read()) : new Float32Array();
    return { gpu, bytes, guideWeights, probeData };
  } catch (error) {
    gpu.dispose();
    throw error;
  }
}
