import {
  compute,
  effect,
  frame,
  init,
  storage,
  surface,
  type Gpu,
  type StorageBuffer,
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
import { uploadEnv, type EnvGpu, destroyStorage, writeStorage } from "./env";
import { buildEnv, decodeRgbe, EMPTY_ENV, fitEnvRgb } from "./hdr";
import {
  clearGuiding,
  createGuiding,
  GUIDE_FIRST_EPOCH,
  GUIDE_MAX_EPOCH,
  type GuidingGpu,
} from "./guiding";
import { defaultsFor, needsReset, type DevParams } from "./params";
import { averageFps, MAX_BURST, mixMs, nextBurst, pushPresent, shouldDrain, waitMs } from "./pace";
import { CLEAR_WGSL, PRESENT_WGSL, TRACE_PROBE_WGSL, TRACE_WGSL } from "./shaders";
import { PROBE_BYTES, PROBE_FLOATS, PROBE_PATHS, parseProbe, type ProbeFrame } from "./probe";
import { clampAxis, clampStickOrigin, stickAxes, stickRole, STICK_RADIUS } from "./stick";

const WG = 8;
const MAX_SPP = 8192000;

export type Renderer = {
  ready: Promise<void>;
  dispose: () => void;
  setScene: (id: string) => void;
  setMode: (mode: CameraMode) => void;
  setParams: (next: DevParams) => void;
  setPad: (key: "up" | "down", down: boolean) => void;
  setProbeArmed: (on: boolean) => void;
};

export type RendererBoot = {
  scene?: string;
  mode?: CameraMode;
  params?: DevParams;
  onProbe?: (frame: ProbeFrame | null) => void;
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
  let accum: StorageBuffer | undefined;
  let probeBuf: StorageBuffer | undefined;
  let probeKernel: ReturnType<typeof compute> | undefined;
  let tracer: ReturnType<typeof compute> | undefined;
  let clearer: ReturnType<typeof compute> | undefined;
  let presenter: ReturnType<typeof effect> | undefined;
  let env: EnvGpu | undefined;
  let world: SceneGpu | undefined;
  let guiding: GuidingGpu | undefined;
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
  let dragDist = 0;
  let probeArmed = false;
  let probePixel: readonly [number, number] | null = null;
  let probeBusy = false;
  let lastPaths: ReturnType<typeof parseProbe> | null = null;
  const onProbe = boot.onProbe;
  let pinchSpan = 0;
  const pointers = new Map<number, { x: number; y: number; role: "look" | "move" | "orbit" }>();
  let stickX = 0;
  let stickY = 0;
  let padUp = false;
  let padDown = false;
  let stickEl: HTMLDivElement | null = null;
  let knobEl: HTMLSpanElement | null = null;
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
  let guideSamples = 0;
  let guideEpochSize = GUIDE_FIRST_EPOCH;
  let guideEpochEnd = GUIDE_FIRST_EPOCH;
  const held = new Set<string>();
  const envCache = new Map<string, EnvGpu>();

  const reset = () => {
    spp = 0;
    const count = size[0] * size[1];
    if (!accum || !clearer || count === 0) return;
    const groups = Math.ceil(count / 64);
    clearer.set({ dst: accum });
    clearer.dispatch(groups);
    if (probeBuf && probePixel) writeStorage(probeBuf, new Float32Array(PROBE_FLOATS));
  };

  const rebuild = (next: readonly [number, number]) => {
    if (!gpu) return;
    if (gpu && accum) {
      destroyStorage(accum);
    }
    size = next;
    accum = storage(gpu, next[0] * next[1] * 16);
    reset();
  };

  const uniforms = (k = 1) => {
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
      spp_k: k,
      ...(probePixel && probeKernel ? { probe_x: probePixel[0], probe_y: probePixel[1] } : {}),
      ...worldTrace(world),
    };
  };

  const moveFromHeld = (): MoveInput => ({
    forward: clampAxis((held.has("KeyW") ? 1 : 0) - (held.has("KeyS") ? 1 : 0) + stickY),
    right: clampAxis((held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0) + stickX),
    up: clampAxis((held.has("KeyE") || padUp ? 1 : 0) - (held.has("KeyQ") || padDown ? 1 : 0)),
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
    const guidingNow = guiding;
    if (
      !gpuNow ||
      !outputNow ||
      !accum ||
      !tracerNow ||
      !clearer ||
      !presenterNow ||
      !envNow ||
      !worldNow ||
      !guidingNow
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
      let left = n;
      while (left > 0) {
        if (guideSamples >= guideEpochEnd) {
          guidingNow.swap();
          clearGuiding(guidingNow.write);
          guideEpochSize = Math.min(GUIDE_MAX_EPOCH, guideEpochSize * 2);
          guideEpochEnd = guideSamples + guideEpochSize;
        }
        const recording = probeArmed && probePixel && probeKernel && probeBuf;
        const kernel = (recording ? probeKernel : tracerNow) ?? tracerNow;
        const k = Math.min(
          recording ? 1 : 8,
          left,
          MAX_SPP - spp,
          Math.max(1, guideEpochEnd - guideSamples),
        );
        kernel.set({
          trace: uniforms(k),
          accum: accumLive,
          env: envNow.data,
          world: worldLive.world,
          guide: guidingNow.read,
          guide_train: guidingNow.write,
          ...(recording ? { probe: probeBuf } : {}),
        });
        kernel.dispatch(Math.ceil(size[0] / WG), Math.ceil(size[1] / WG));
        spp += k;
        guideSamples += k;
        taken += k;
        left -= k;
      }
    }
    presenterNow.set({
      present: { size: [size[0], size[1]], exposure: params.exposure },
      accum: accumLive,
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
    if (probeArmed && probePixel && onProbe && probeBuf) {
      const view = cameraFrame(cam, size[0] / Math.max(1, size[1]), mode);
      const pixel = probePixel;
      const exposure = params.exposure;
      const latest = shownSpp > 0 ? (shownSpp - 1) % PROBE_PATHS : 0;
      const wh: readonly [number, number] = [size[0], size[1]];
      if (lastPaths) {
        onProbe({ paths: lastPaths, view, size: wh, pixel, exposure, latest });
      }
      if (!probeBusy && taken > 0) {
        probeBusy = true;
        void probeBuf
          .read()
          .then((raw) => {
            if (disposed || !probeArmed || probePixel !== pixel) return;
            lastPaths = parseProbe(new Float32Array(raw));
          })
          .finally(() => {
            probeBusy = false;
          });
      }
    }
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
  const showStick = (x: number, y: number) => {
    if (!stickEl) {
      stickEl = document.createElement("div");
      stickEl.className = "fps-stick";
      stickEl.setAttribute("aria-hidden", "true");
      knobEl = document.createElement("span");
      stickEl.append(knobEl);
      canvas.parentElement?.append(stickEl);
    }
    stickEl.style.transform = `translate3d(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px, 0)`;
    stickEl.dataset.active = "true";
    if (knobEl) knobEl.style.transform = "";
  };
  const hideStick = () => {
    stickX = 0;
    stickY = 0;
    if (knobEl) knobEl.style.transform = "";
    if (stickEl) stickEl.dataset.active = "false";
  };
  const dropProbeGpu = () => {
    if (probeBuf) destroyStorage(probeBuf);
    probeBuf = undefined;
    probeKernel = undefined;
  };

  const ensureProbeGpu = () => {
    if (!gpu || probeKernel) return;
    probeKernel = compute(gpu, TRACE_PROBE_WGSL, { label: "trace-probe" });
    probeBuf = storage(gpu, PROBE_BYTES);
    writeStorage(probeBuf, new Float32Array(PROBE_FLOATS));
  };

  const pixelAt = (e: PointerEvent): readonly [number, number] => {
    const r = canvas.getBoundingClientRect();
    const x = Math.min(
      size[0] - 1,
      Math.max(0, Math.floor(((e.clientX - r.left) / Math.max(r.width, 1)) * size[0])),
    );
    const y = Math.min(
      size[1] - 1,
      Math.max(0, Math.floor(((e.clientY - r.top) / Math.max(r.height, 1)) * size[1])),
    );
    return [x, y];
  };

  const applyProbe = (pixel: readonly [number, number] | null) => {
    if (pixel && probePixel && pixel[0] === probePixel[0] && pixel[1] === probePixel[1]) {
      pixel = null;
    }
    probePixel = pixel;
    probeBusy = false;
    if (probeBuf) writeStorage(probeBuf, new Float32Array(PROBE_FLOATS));
    if (!pixel) {
      lastPaths = null;
      onProbe?.(null);
      return;
    }
    lastPaths = parseProbe(new Float32Array(PROBE_FLOATS));
    if (!onProbe || size[0] < 1) return;
    onProbe({
      paths: lastPaths,
      view: cameraFrame(cam, size[0] / Math.max(1, size[1]), mode),
      size: [size[0], size[1]],
      pixel,
      exposure: params.exposure,
      latest: 0,
    });
  };

  const setProbeArmed = (on: boolean) => {
    if (on === probeArmed) return;
    probeArmed = on;
    canvas.classList.toggle("probe-on", on);
    if (on) ensureProbeGpu();
    else {
      applyProbe(null);
      dropProbeGpu();
    }
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") e.preventDefault();
    dragDist = 0;
    if (mode === "fps") {
      const touch = e.pointerType !== "mouse";
      const moving = [...pointers.values()].some((p) => p.role === "move");
      const role =
        touch &&
        !moving &&
        stickRole(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight) === "move"
          ? "move"
          : "look";
      if (role === "move") {
        const origin = clampStickOrigin(
          e.clientX,
          e.clientY,
          canvas.clientWidth,
          canvas.clientHeight,
        );
        pointers.set(e.pointerId, { x: origin.x, y: origin.y, role });
        stickX = 0;
        stickY = 0;
        showStick(origin.x, origin.y);
      } else {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, role: "look" });
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, role: "orbit" });
    if (pointers.size >= 2) {
      dragging = false;
      pinchSpan = spanOf();
      return;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (e.pointerType !== "mouse") e.preventDefault();
    dragDist += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
    if (prev.role === "move") {
      const axes = stickAxes(e.clientX - prev.x, e.clientY - prev.y);
      stickX = axes.right;
      stickY = axes.forward;
      if (knobEl) knobEl.style.transform = `translate3d(${axes.knobX}px, ${axes.knobY}px, 0)`;
      return;
    }
    if (prev.role === "look") {
      cam = look(cam, e.clientX - prev.x, e.clientY - prev.y, fpsPitchLimit());
      pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
      reset();
      return;
    }
    pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const span = spanOf();
      if (pinchSpan > 1 && span > 1) {
        cam = pinch(cam, span / pinchSpan, plugin.limits.radiusMin, plugin.limits.radiusMax);
        reset();
      }
      pinchSpan = span;
      return;
    }
    if (!dragging) return;
    cam = look(cam, e.clientX - lastX, e.clientY - lastY, plugin.limits.pitch);
    lastX = e.clientX;
    lastY = e.clientY;
    reset();
  };
  const onUp = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (prev?.role === "move") hideStick();
    const tap = dragDist < 5 && pointers.size === 0 && prev?.role !== "move";
    if (tap && probeArmed) applyProbe(pixelAt(e));
    if (mode === "fps") return;
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
    if (e.key === "Escape" && probePixel) {
      applyProbe(null);
      return;
    }
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
    applyProbe(null);
    cam = withEye({ ...next.camera, vfov: params.vfov });
    const packed = packWorld(await next.build(0));
    if (disposed || token !== sceneToken) return;
    packedCpu = packed;
    world = writePacked(gpu, world, packed);
    if (guiding) {
      clearGuiding(guiding.read);
      clearGuiding(guiding.write);
      guideSamples = 0;
      guideEpochSize = GUIDE_FIRST_EPOCH;
      guideEpochEnd = GUIDE_FIRST_EPOCH;
    }
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
    stickEl?.remove();
    stickEl = null;
    knobEl = null;
    if (world) destroySceneGpu(world);
    dropProbeGpu();
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
    guiding = createGuiding(gpu);
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
      padUp = false;
      padDown = false;
      hideStick();
      reset();
    },
    setParams: (next) => {
      const prev = params;
      params = next;
      if (cam.vfov !== next.vfov) cam = { ...cam, vfov: next.vfov };
      if (needsReset(prev, next)) reset();
    },
    setPad: (key, down) => {
      if (key === "up") padUp = down;
      else padDown = down;
    },
    setProbeArmed,
  };
}
