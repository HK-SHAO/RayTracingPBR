import {
  compute,
  effect,
  frame,
  init,
  pingPongStorage,
  surface,
  type Gpu,
  type Surface,
} from "vgpu";

import { plugins, pluginById } from "../scene";
import { packWorld, type PackedScene } from "../scene/pack";
import { destroySceneGpu, worldTrace, writePacked, type SceneGpu } from "../scene/gpu";
import type { ScenePlugin } from "../scene/types";
import { readBytes } from "../media";
import {
  cameraFrame,
  cameraMoved,
  dolly,
  pinch,
  fpsPitchLimit,
  look,
  walkFps,
  withEye,
  withOrbitTarget,
  type CameraMode,
  type CameraState,
  type MoveInput,
} from "./camera";
import { uploadEnv, type EnvGpu, destroyStorage } from "./env";
import { buildEnv, decodeRgbe, EMPTY_ENV, fitEnvRgb } from "./hdr";
import { defaultsFor, needsReset, type DevParams } from "./params";
import { averageFps, MAX_BURST, mixMs, nextBurst, pushPresent, shouldDrain, waitMs } from "./pace";
import { CLEAR_WGSL, PRESENT_WGSL, TRACE_WGSL } from "./shaders";

const WG = 8;
const MAX_SPP = 8192000;

type PingPong = ReturnType<typeof pingPongStorage>;

export type Renderer = {
  ready: Promise<void>;
  dispose: () => void;
  setScene: (id: string) => void;
  setMode: (mode: CameraMode) => void;
  setParams: (next: DevParams) => void;
};

export type RendererBoot = {
  scene?: string;
  mode?: CameraMode;
  params?: DevParams;
};

export type RenderStats = {
  spp: number;
  fps?: number;
  burst?: number;
};

export function createRenderer(
  canvas: HTMLCanvasElement,
  onStats: (stats: RenderStats) => void,
  boot: RendererBoot = {},
): Renderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let accum: PingPong | undefined;
  let tracer: ReturnType<typeof compute> | undefined;
  let clearer: ReturnType<typeof compute> | undefined;
  let presenter: ReturnType<typeof effect> | undefined;
  let env: EnvGpu | undefined;
  let world: SceneGpu | undefined;
  let plugin: ScenePlugin = plugins.find((item) => item.id === boot.scene) ?? plugins[0]!;
  let mode: CameraMode = boot.mode === "fps" ? "fps" : "orbit";
  let params: DevParams = boot.params ?? defaultsFor(plugin);
  let cam: CameraState =
    mode === "fps"
      ? withEye({ ...plugin.camera, vfov: params.vfov })
      : { ...plugin.camera, vfov: params.vfov };
  let size: readonly [number, number] = [0, 0];
  let spp = 0;
  let waitTimer = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pinchSpan = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let lastTick = performance.now();
  let burst = 1;
  let running = false;
  const presents: number[] = [];
  let gpuWait: Promise<void> | undefined;
  let gpuMsEma = 0;
  let prevSamples = 0;
  let packedCpu: PackedScene | undefined;
  let sceneToken = 0;
  let clock0 = 0;
  const held = new Set<string>();
  const envCache = new Map<string, EnvGpu>();

  const reset = () => {
    spp = 0;
    const count = size[0] * size[1];
    if (!accum || !clearer || count === 0) return;
    const groups = Math.ceil(count / 64);
    clearer.set({ dst: accum.read });
    clearer.dispatch(groups);
    clearer.set({ dst: accum.write });
    clearer.dispatch(groups);
  };

  const rebuild = (next: readonly [number, number]) => {
    if (!gpu) return;
    if (gpu && accum) {
      destroyStorage(accum.read);
      destroyStorage(accum.write);
    }
    size = next;
    accum = pingPongStorage(gpu, next[0] * next[1] * 16);
    reset();
  };

  const uniforms = () => {
    const view = cameraFrame(cam, size[0] / Math.max(1, size[1]), mode);
    return {
      origin: view.origin,
      half_w: view.halfW,
      right: view.right,
      half_h: view.halfH,
      up: view.up,
      frame: spp,
      forward: view.forward,
      size_x: size[0],
      size_y: size[1],
      bounce: params.bounce,
      use_ibl: plugin.ibl ? 1 : 0,
      env_w: env?.width ?? 1,
      env_h: env?.height ?? 1,
      focus: params.focus,
      aperture: params.aperture,
      env_gain: params.env,
      hide_ibl: params.hideIbl ? 1 : 0,
      ...worldTrace(world),
    };
  };

  const moveFromHeld = (): MoveInput => ({
    forward: held.has("KeyW"),
    back: held.has("KeyS"),
    left: held.has("KeyA"),
    right: held.has("KeyD"),
    up: held.has("KeyE"),
    down: held.has("KeyQ"),
    fast: held.has("ShiftLeft") || held.has("ShiftRight"),
  });

  const arm = (startedAt: number) => {
    if (disposed) return;
    const wait = waitMs(startedAt, performance.now());
    if (wait > 0) {
      waitTimer = window.setTimeout(() => {
        waitTimer = 0;
        void runFrame();
      }, wait);
      return;
    }
    void runFrame();
  };

  const runFrame = async () => {
    if (disposed || running) return;
    running = true;
    const start = performance.now();
    const dt = Math.min(0.05, (start - lastTick) / 1000);
    lastTick = start;
    if (mode === "fps") {
      const next = walkFps(cam, moveFromHeld(), dt);
      if (next !== cam) {
        cam = next;
        reset();
      }
    }
    const gpuNow = gpu;
    const outputNow = output;
    const tracerNow = tracer;
    const presenterNow = presenter;
    const envNow = env;
    const worldNow = world;
    if (
      !gpuNow ||
      !outputNow ||
      !accum ||
      !tracerNow ||
      !clearer ||
      !presenterNow ||
      !envNow ||
      !worldNow
    ) {
      running = false;
      arm(start);
      return;
    }
    const [w, h] = outputNow.size;
    if (w !== size[0] || h !== size[1]) rebuild([Math.max(1, w), Math.max(1, h)]);
    const live = plugin.pose;
    if (live) {
      const posed = live((start - clock0) / 1000);
      const nextCam = withEye({ ...posed.camera, vfov: params.vfov });
      const moved = cameraMoved(cam, nextCam);
      cam = nextCam;
      packedCpu = packWorld(posed.world, packedCpu);
      world = writePacked(gpuNow, worldNow, packedCpu);
      if (moved) reset();
    }
    const worldLive = world;
    const accumLive = accum;
    if (!accumLive || !worldLive) {
      running = false;
      arm(start);
      return;
    }
    let taken = 0;
    if (spp < MAX_SPP) {
      const n = Math.min(burst, MAX_SPP - spp, MAX_BURST);
      for (let i = 0; i < n; i++) {
        tracerNow.set({
          trace: uniforms(),
          src: accumLive.read,
          dst: accumLive.write,
          env: envNow.data,
          world: worldLive.world,
        });
        tracerNow.dispatch(Math.ceil(size[0] / WG), Math.ceil(size[1] / WG));
        accumLive.swap();
        spp += 1;
        taken += 1;
      }
    }
    presenterNow.set({
      present: { size: [size[0], size[1]], exposure: params.exposure },
      accum: accumLive.read,
    });
    frame(gpuNow, (current) => current.pass(outputNow, presenterNow));
    const shownSpp = spp;
    const submittedAt = performance.now();
    let gpuMs = 0;
    const submitted = gpuNow.gpu.queue
      .onSubmittedWorkDone()
      .then(() => {
        gpuMs = performance.now() - submittedAt;
      })
      .catch(() => {
        gpuMs = 0;
      });
    if (gpuWait) {
      try {
        await gpuWait;
      } catch {
        /* queue lost */
      }
    }
    if (shouldDrain(gpuMsEma)) {
      try {
        await submitted;
      } catch {
        /* queue lost */
      }
      if (gpuMs > 0) gpuMsEma = mixMs(gpuMsEma, gpuMs);
      if (taken > 0 && gpuMsEma > 0) burst = nextBurst(burst, gpuMsEma, taken);
      gpuWait = undefined;
      prevSamples = 0;
    } else {
      if (prevSamples > 0 && gpuMsEma > 0) burst = nextBurst(burst, gpuMsEma, prevSamples);
      gpuWait = submitted.then(() => {
        if (gpuMs > 0) gpuMsEma = mixMs(gpuMsEma, gpuMs);
      });
      prevSamples = taken;
    }
    const now = performance.now();
    pushPresent(presents, now);
    const fps = averageFps(presents);
    onStats(fps > 0 ? { spp: shownSpp, fps, burst } : { spp: shownSpp, burst });
    running = false;
    arm(start);
  };

  const spanOf = () => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    const a = pts[0]!;
    const b = pts[1]!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      dragging = false;
      pinchSpan = spanOf();
      return;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    if (e.pointerType !== "mouse") e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const next = spanOf();
      if (mode !== "fps" && pinchSpan > 1 && next > 1) {
        cam = pinch(cam, next / pinchSpan, plugin.limits.radiusMin, plugin.limits.radiusMax);
        reset();
      }
      pinchSpan = next;
      return;
    }
    if (!dragging) return;
    cam = look(
      cam,
      e.clientX - lastX,
      e.clientY - lastY,
      mode === "fps" ? fpsPitchLimit() : plugin.limits.pitch,
    );
    lastX = e.clientX;
    lastY = e.clientY;
    reset();
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pointers.size >= 2) {
      pinchSpan = spanOf();
      return;
    }
    pinchSpan = 0;
    const left = pointers.values().next().value;
    if (left) {
      dragging = true;
      lastX = left.x;
      lastY = left.y;
      return;
    }
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (mode === "fps") return;
    cam = dolly(cam, e.deltaY, plugin.limits.radiusMin, plugin.limits.radiusMax);
    reset();
  };
  const onTouch = (e: TouchEvent) => {
    e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      mode === "fps" &&
      (e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD" ||
        e.code === "KeyQ" ||
        e.code === "KeyE")
    ) {
      e.preventDefault();
    }
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };

  async function applyPlugin(next: ScenePlugin) {
    if (!gpu) return;
    const token = ++sceneToken;
    plugin = next;
    clock0 = performance.now();
    cam = withEye({ ...next.camera, vfov: params.vfov });
    const packed = packWorld(await next.build(0));
    if (disposed || token !== sceneToken) return;
    packedCpu = packed;
    world = writePacked(gpu, world, packed);
    if (next.ibl) {
      const key = next.ibl.href;
      let uploaded = envCache.get(key);
      if (!uploaded) {
        const decoded = decodeRgbe(await readBytes(next.ibl));
        if (disposed || token !== sceneToken || !gpu) return;
        const fitted = fitEnvRgb(decoded.rgb, decoded.width, decoded.height);
        uploaded = uploadEnv(gpu, buildEnv(fitted.rgb, fitted.width, fitted.height));
        envCache.set(key, uploaded);
      }
      env = uploaded;
    } else {
      env = envCache.get("");
    }
    reset();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (waitTimer) {
      clearTimeout(waitTimer);
      waitTimer = 0;
    }
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouch);
    canvas.removeEventListener("touchmove", onTouch);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    if (world) destroySceneGpu(world);
    gpu?.dispose();
  }

  const ready = (async () => {
    gpu = await init();
    if (disposed) {
      gpu.dispose();
      return;
    }
    output = surface(gpu, canvas, { dpr: [1, 1] });
    env = uploadEnv(gpu, EMPTY_ENV);
    envCache.set("", env);
    tracer = compute(gpu, TRACE_WGSL, { label: "trace" });
    clearer = compute(gpu, CLEAR_WGSL, { label: "clear" });
    presenter = effect(gpu, PRESENT_WGSL, { label: "present" });
    rebuild([Math.max(1, output.size[0]), Math.max(1, output.size[1])]);
    await presenter.compile({ colors: [output.format] });
    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    await applyPlugin(plugin);
    if (!disposed) void runFrame();
  })();

  return {
    ready,
    dispose,
    setScene: (id) => {
      void applyPlugin(pluginById(id));
    },
    setMode: (next) => {
      if (next === mode) return;
      cam = next === "fps" ? withEye(cam) : withOrbitTarget(cam);
      mode = next;
      reset();
    },
    setParams: (next) => {
      const prev = params;
      params = next;
      if (cam.vfov !== next.vfov) cam = { ...cam, vfov: next.vfov };
      if (needsReset(prev, next)) reset();
    },
  };
}
