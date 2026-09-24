import type { CSSProperties, PointerEvent } from "react";
import { DEV_KNOBS, formatParam, type DevParams } from "../render/params";
import { TARGET_FPS } from "../render/pace";
import { plugins } from "../scene";
import type { CameraMode } from "../render/camera";
import { t } from "../i18n";
import { version } from "../../package.json";

const FPS_MAX = TARGET_FPS * 2;

export function FpsPad({ onPad }: { onPad: (key: "up" | "down", down: boolean) => void }) {
  const hold = (key: "up" | "down") => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onPad(key, true);
    },
    onPointerUp: () => onPad(key, false),
    onPointerCancel: () => onPad(key, false),
  });
  return (
    <div className="fps-touch">
      <div className="fps-lift">
        <button type="button" className="fps-key" aria-label={t("liftDown")} {...hold("down")}>
          {t("liftDown")}
        </button>
        <button type="button" className="fps-key" aria-label={t("liftUp")} {...hold("up")}>
          {t("liftUp")}
        </button>
      </div>
    </div>
  );
}

function FpsPlot({ values }: { values: readonly number[] }) {
  const w = 152;
  const h = 28;
  const n = values.length;
  const line =
    n === 0
      ? ""
      : values
          .map((fps, i) => {
            const x = n <= 1 ? 0 : (i / (n - 1)) * w;
            const y = h - (Math.min(FPS_MAX, Math.max(0, fps)) / FPS_MAX) * h;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
  const targetY = h - (TARGET_FPS / FPS_MAX) * h;
  return (
    <svg className="dev-fps-plot" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <line x1="0" y1={targetY} x2={w} y2={targetY} />
      <polyline points={line} />
    </svg>
  );
}

export function DevPanel({
  open,
  scene,
  mode,
  params,
  probeArmed,
  spp,
  fps,
  fpsHist,
  error,
  onToggleOpen,
  onScene,
  onMode,
  onParams,
  onProbeArmed,
}: {
  open: boolean;
  scene: string;
  mode: CameraMode;
  params: DevParams;
  probeArmed: boolean;
  spp: number;
  fps: number;
  fpsHist: readonly number[];
  error?: string;
  onToggleOpen: () => void;
  onScene: (id: string) => void;
  onMode: (mode: CameraMode) => void;
  onParams: (params: DevParams) => void;
  onProbeArmed: (on: boolean) => void;
}) {
  return (
    <aside className={open ? "dev open" : "dev"}>
      <header className="dev-bar">
        <span className="dev-title">RayTracingPBR v{version}</span>
        <button type="button" onClick={onToggleOpen} aria-expanded={open}>
          {open ? t("hide") : t("open")}
        </button>
      </header>
      {open ? (
        <div className="dev-body">
          <section className="dev-block">
            <div className="dev-toggle">
              <label htmlFor="dev-scene">{t("scene")}</label>
              <select id="dev-scene" value={scene} onChange={(e) => onScene(e.target.value)}>
                {plugins.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="dev-toggle">
              <span>{t("camera")}</span>
              <button type="button" onClick={() => onMode(mode === "orbit" ? "fps" : "orbit")}>
                {mode === "orbit" ? t("orbit") : t("fpsMode")}
              </button>
            </div>
            <div className="dev-toggle">
              <span>{t("path")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={probeArmed}
                onClick={() => onProbeArmed(!probeArmed)}
              >
                {probeArmed ? t("on") : t("off")}
              </button>
            </div>
            <p className="dev-hint">
              {probeArmed ? t("hintPathOn") : mode === "fps" ? t("hintFps") : t("hintOrbit")}
            </p>
          </section>
          <section className="dev-block">
            {DEV_KNOBS.map((knob) => (
              <label
                key={knob.key}
                className="dev-knob"
                style={
                  {
                    "--knob": `${((params[knob.key] - knob.min) / (knob.max - knob.min)) * 100}%`,
                  } as CSSProperties
                }
              >
                <span>{t(knob.key)}</span>
                <output>{formatParam(knob.key, params[knob.key])}</output>
                <input
                  type="range"
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  value={params[knob.key]}
                  onChange={(e) => onParams({ ...params, [knob.key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <div className="dev-pair">
              <span>{t("spp")}</span>
              <output>{error ?? spp}</output>
            </div>
            <label className="dev-fps">
              <span>{t("fps")}</span>
              <FpsPlot values={fpsHist} />
              <output>{fps.toFixed(0)}</output>
            </label>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
