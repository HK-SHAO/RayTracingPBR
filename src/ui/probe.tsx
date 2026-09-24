import { useLayoutEffect, useRef } from "react";
import { PROBE_KIND_ENV, PROBE_KIND_NEE, projectPaths, type ProbeFrame } from "../render/probe";

export function ProbeOverlay({ frame }: { frame: ProbeFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * scale);
      const height = Math.round(rect.height * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.resetTransform();
      ctx.clearRect(0, 0, width, height);
      if (!frame || !width || !height) return;
      const [w, h] = frame.size;
      ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
      ctx.lineWidth = w / width;
      ctx.lineCap = "round";
      for (const seg of projectPaths(frame)) {
        ctx.strokeStyle = seg.color;
        ctx.globalAlpha = seg.alpha;
        ctx.setLineDash(
          seg.kind === PROBE_KIND_NEE
            ? [(4 * w) / width, (3 * w) / width]
            : seg.kind === PROBE_KIND_ENV
              ? [(1.5 * w) / width, (3 * w) / width]
              : [],
        );
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = "#fff";
      const x = frame.pixel[0] + 0.5;
      const y = frame.pixel[1] + 0.5;
      const r = (5 * w) / width;
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [frame]);

  return <canvas ref={canvasRef} className="probe" aria-hidden />;
}
