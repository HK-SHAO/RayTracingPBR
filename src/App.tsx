import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createRenderer } from "./render/renderer";
import { defaultsFor, DEV_KNOBS, formatParam } from "./render/params";
import { FPS_WINDOW, TARGET_FPS } from "./render/pace";
import { plugins } from "./scene";
import { readSession, writeSession, type Session } from "./session";

const FPS_MAX = TARGET_FPS * 2;

function FpsPad({ onPad }: { onPad: (key: "up" | "down", down: boolean) => void }) {
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
        <button type="button" className="fps-key" aria-label="down" {...hold("down")}>
          Down
        </button>
        <button type="button" className="fps-key" aria-label="up" {...hold("up")}>
          Up
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

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const [session, setSession] = useState(readSession);
  const [spp, setSpp] = useState(0);
  const [fps, setFps] = useState(0);
  const [fpsHist, setFpsHist] = useState<number[]>([]);
  const [error, setError] = useState<string>();
  const { scene, mode, params, open } = session;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const boot = readSession();
    const renderer = createRenderer(
      canvas,
      (stats) => {
        setSpp(stats.spp);
        const fpsNow = stats.fps;
        if (fpsNow === undefined) return;
        setFps(fpsNow);
        setFpsHist((prev) => {
          const next = prev.length >= FPS_WINDOW ? prev.slice(1) : prev.slice();
          next.push(fpsNow);
          return next;
        });
      },
      { scene: boot.scene, mode: boot.mode, params: boot.params },
    );
    rendererRef.current = renderer;
    renderer.ready.catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    return () => renderer.dispose();
  }, []);

  useEffect(() => writeSession(session), [session]);

  useEffect(() => {
    const onPop = () => {
      const next = readSession();
      setSession(next);
      const renderer = rendererRef.current;
      renderer?.setScene(next.scene);
      renderer?.setMode(next.mode);
      renderer?.setParams(next.params);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const commit = (next: Session) => {
    setSession(next);
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (next.scene !== session.scene) renderer.setScene(next.scene);
    if (next.mode !== session.mode) renderer.setMode(next.mode);
    if (next.params !== session.params) renderer.setParams(next.params);
  };

  const applyParams = (next: typeof params) => commit({ ...session, params: next });

  return (
    <>
      <canvas ref={canvasRef} />
      {mode === "fps" ? (
        <FpsPad onPad={(key, down) => rendererRef.current?.setPad(key, down)} />
      ) : null}
      <aside className={open ? "dev open" : "dev"}>
        <header className="dev-bar">
          <span className="dev-title">RayTracingPBR</span>
          <button
            type="button"
            onClick={() => setSession((cur) => ({ ...cur, open: !cur.open }))}
            aria-expanded={open}
          >
            {open ? "Hide" : "Open"}
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
                    onClick={() =>
                      commit({ ...session, scene: item.id, params: defaultsFor(item) })
                    }
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
                  onClick={() => commit({ ...session, mode: "orbit" })}
                >
                  Orbit
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "fps"}
                  onClick={() => commit({ ...session, mode: "fps" })}
                >
                  FPS
                </button>
              </div>
              <p className="dev-hint">
                {mode === "fps" ? "WASDQE · look · stick" : "orbit drag · pinch / wheel"}
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
