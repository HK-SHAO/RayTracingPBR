import { PROBE_KIND_ENV, PROBE_KIND_NEE, projectPaths, type ProbeFrame } from "../render/probe";

export function ProbeOverlay({ frame }: { frame: ProbeFrame | null }) {
  if (!frame) return null;
  const segs = projectPaths(frame);
  const [w, h] = frame.size;
  const [px, py] = frame.pixel;
  return (
    <svg className="probe" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {segs.map((seg, i) => (
        <line
          key={i}
          className={
            seg.kind === PROBE_KIND_NEE ? "nee" : seg.kind === PROBE_KIND_ENV ? "env" : undefined
          }
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={seg.color}
          strokeOpacity={seg.alpha}
        />
      ))}
      <g className="mark" transform={`translate(${px + 0.5} ${py + 0.5})`}>
        <line x1="-5" y1="0" x2="5" y2="0" />
        <line x1="0" y1="-5" x2="0" y2="5" />
      </g>
    </svg>
  );
}
