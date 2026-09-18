import { useEffect, useRef, useState } from "react";
import { createRenderer } from "./render/renderer";
import type { CameraMode } from "./render/camera";
import { defaultsFor, DEV_KNOBS, formatParam, type DevParams } from "./render/params";
import { FPS_WINDOW, TARGET_FPS } from "./render/pace";
import { pluginById, plugins } from "./scene";

const FPS_MAX = TARGET_FPS * 2;

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

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const [spp, setSpp] = useState(0);
  const [fps, setFps] = useState(0);
  const [fpsHist, setFpsHist] = useState<number[]>([]);
  const [scene, setScene] = useState(plugins[0]!.id);
  const [mode, setMode] = useState<CameraMode>("orbit");
  const [params, setParams] = useState<DevParams>(() => defaultsFor(plugins[0]!));
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas, (stats) => {
      setSpp(stats.spp);
      const fpsNow = stats.fps;
      if (fpsNow === undefined) return;
      setFps(fpsNow);
      setFpsHist((prev) => {
        const next = prev.length >= FPS_WINDOW ? prev.slice(1) : prev.slice();
        next.push(fpsNow);
        return next;
      });
    });
    rendererRef.current = renderer;
    renderer.ready.catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    return () => renderer.dispose();
  }, []);

  const applyParams = (next: DevParams) => {
    setParams(next);
    rendererRef.current?.setParams(next);
  };

  return (
    <>
      <canvas ref={canvasRef} />
      <aside className={open ? "dev open" : "dev"}>
        <header className="dev-bar">
          <span className="dev-title">raygame</span>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "hide" : "dev"}
          </button>
        </header>
        {open ? (
          <div className="dev-body">
            <section className="dev-block">
              <h2>Scene</h2>
              <div className="dev-row">
                {plugins.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={scene === item.id}
                    onClick={() => {
                      const next = defaultsFor(pluginById(item.id));
                      setScene(item.id);
                      applyParams(next);
                      rendererRef.current?.setScene(item.id);
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>
            <section className="dev-block">
              <h2>Camera</h2>
              <div className="dev-row">
                <button
                  type="button"
                  aria-pressed={mode === "orbit"}
                  onClick={() => {
                    setMode("orbit");
                    rendererRef.current?.setMode("orbit");
                  }}
                >
                  Orbit
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "fps"}
                  onClick={() => {
                    setMode("fps");
                    rendererRef.current?.setMode("fps");
                  }}
                >
                  FPS
                </button>
              </div>
              <p className="dev-hint">
                {mode === "fps" ? "WASDQE · look drag · Shift" : "orbit drag · wheel"}
              </p>
            </section>
            <section className="dev-block">
              <h2>IBL</h2>
              <div className="dev-row">
                <button
                  type="button"
                  aria-pressed={params.hideIbl === 0}
                  onClick={() => applyParams({ ...params, hideIbl: 0 })}
                >
                  Direct
                </button>
                <button
                  type="button"
                  aria-pressed={params.hideIbl === 1}
                  onClick={() => applyParams({ ...params, hideIbl: 1 })}
                >
                  Hidden
                </button>
              </div>
              <p className="dev-hint">{params.hideIbl ? "no camera env" : "camera sees env"}</p>
            </section>
            <section className="dev-block">
              <h2>Params</h2>
              {DEV_KNOBS.map((knob) => (
                <label key={knob.key} className="dev-knob">
                  <span>{knob.key}</span>
                  <output>{formatParam(knob.key, params[knob.key])}</output>
                  <input
                    type="range"
                    min={knob.min}
                    max={knob.max}
                    step={knob.step}
                    value={params[knob.key]}
                    onChange={(e) => applyParams({ ...params, [knob.key]: Number(e.target.value) })}
                  />
                </label>
              ))}
              <label className="dev-knob">
                <span>spp</span>
                <output>{error ?? spp}</output>
              </label>
              <label className="dev-fps">
                <span>fps</span>
                <FpsPlot values={fpsHist} />
                <output>{fps.toFixed(0)}</output>
              </label>
            </section>
          </div>
        ) : null}
      </aside>
    </>
  );
}
