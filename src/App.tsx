import { useEffect, useRef, useState } from "react";
import { createRenderer } from "./render/renderer";
import { defaultsFor } from "./render/params";
import { FPS_WINDOW } from "./render/pace";
import type { ProbeFrame } from "./render/probe";
import { plugins } from "./scene";
import { readSession, writeSession, type Session } from "./session";
import { DevPanel, FpsPad } from "./ui/dev";
import { ProbeOverlay } from "./ui/probe";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const [session, setSession] = useState(readSession);
  const [spp, setSpp] = useState(0);
  const [fps, setFps] = useState(0);
  const [fpsHist, setFpsHist] = useState<number[]>([]);
  const [error, setError] = useState<string>();
  const [probe, setProbe] = useState<ProbeFrame | null>(null);
  const [probeArmed, setProbeArmed] = useState(false);
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
      { scene: boot.scene, mode: boot.mode, params: boot.params, onProbe: setProbe },
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

  const armProbe = (on: boolean) => {
    setProbeArmed(on);
    if (!on) setProbe(null);
    rendererRef.current?.setProbeArmed(on);
  };

  return (
    <>
      <canvas ref={canvasRef} className={probeArmed ? "probe-on" : undefined} />
      {probeArmed ? <ProbeOverlay frame={probe} /> : null}
      <footer className="credit">
        © 2026 烧风
        <a href="https://github.com/HK-SHAO/RayTracingPBR" rel="noreferrer">
          github.com/HK-SHAO/RayTracingPBR
        </a>
      </footer>
      {mode === "fps" ? (
        <FpsPad onPad={(key, down) => rendererRef.current?.setPad(key, down)} />
      ) : null}
      <DevPanel
        open={open}
        scene={scene}
        mode={mode}
        params={params}
        probeArmed={probeArmed}
        spp={spp}
        fps={fps}
        fpsHist={fpsHist}
        error={error}
        onToggleOpen={() => setSession((cur) => ({ ...cur, open: !cur.open }))}
        onScene={(id) => {
          const plugin = plugins.find((item) => item.id === id);
          if (plugin) commit({ ...session, scene: id, params: defaultsFor(plugin) });
        }}
        onMode={(next) => commit({ ...session, mode: next })}
        onParams={(next) => commit({ ...session, params: next })}
        onProbeArmed={armProbe}
      />
    </>
  );
}
