import { compute, init, pingPongStorage } from "vgpu/node";
import { packWorld } from "../scene/pack";
import { uploadPacked, worldTrace } from "../scene/gpu";
import { cornell } from "../scene/plugins/cornell";
import type { ScenePlugin } from "../scene/types";
import { cameraFrame } from "./camera";
import { uploadEnv, writeStorage } from "./env";
import { buildEnv, decodeRgbe, EMPTY_ENV, fitEnvRgb } from "./hdr";
import { readBytes } from "../media";
import { TRACE_WGSL } from "./shaders";

const WG = 8;

export async function traceSamples(
  width: number,
  height: number,
  spp: number,
  plugin: ScenePlugin = cornell,
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
    const tracer = compute(gpu, TRACE_WGSL, { label: "trace" });
    const view = cameraFrame(plugin.camera, width / height);
    for (let frame = 0; frame < spp; frame++) {
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
          bounce: 5,
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
      });
      tracer.dispatch(Math.ceil(width / WG), Math.ceil(height / WG));
      accum.swap();
    }
    const bytes = new Float32Array(await accum.read.read());
    return { gpu, bytes };
  } catch (error) {
    gpu.dispose();
    throw error;
  }
}
