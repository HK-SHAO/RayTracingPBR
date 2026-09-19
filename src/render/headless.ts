import { compute, init, pingPongStorage } from "vgpu/node";
import { packWorld } from "../scene/pack";
import { uploadPacked, worldTrace } from "../scene/gpu";
import { cornell } from "../scene/plugins/cornell";
import type { ScenePlugin } from "../scene/types";
import { cameraFrame } from "./camera";
import { uploadEnv, writeStorage } from "./env";
import { buildEnv, decodeRgbe, EMPTY_ENV, fitEnvRgb } from "./hdr";
import { clearGuiding, createGuiding, GUIDE_FIRST_EPOCH, GUIDE_MAX_EPOCH } from "./guiding";
import { readBytes } from "../media";
import { TRACE_WGSL } from "./shaders";

const WG = 8;

export async function traceSamples(
  width: number,
  height: number,
  spp: number,
  plugin: ScenePlugin = cornell,
  guidingEnabled = true,
) {
  const gpu = await init();
  try {
    const pixels = width * height;
    const accum = pingPongStorage(gpu, pixels * 16);
    writeStorage(accum.read, new Float32Array(pixels * 4));
    writeStorage(accum.write, new Float32Array(pixels * 4));
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
    const tracer = compute(gpu, TRACE_WGSL, { label: "trace" });
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
          bounce: 0,
          use_ibl: useIbl,
          env_w: env.width,
          env_h: env.height,
          focus: plugin.camera.radius,
          aperture: 0,
          env_gain: 1,
          hide_ibl: plugin.hideIblDirect ? 1 : 0,
          ...worldTrace(world),
        },
        src: accum.read,
        dst: accum.write,
        env: env.data,
        world: world.world,
        guide: guiding.read,
        guide_train: guiding.write,
      });
      tracer.dispatch(Math.ceil(width / WG), Math.ceil(height / WG));
      accum.swap();
    }
    const bytes = new Float32Array(await accum.read.read());
    const guideWeights = new Uint32Array(await guiding.read.read());
    return { gpu, bytes, guideWeights };
  } catch (error) {
    gpu.dispose();
    throw error;
  }
}
