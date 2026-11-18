import { useId } from "react";

/**
 * Tiny inline trend line for KPI cards. Purely visual: the card's text carries the value, and the
 * sparkline exposes a short text summary for assistive tech.
 */
export function Sparkline({ data, stroke, fill, width = 96, height = 34, label }: { data: number[]; stroke: string; fill: string; width?: number; height?: number; label: string }) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const pts = data.map((v, i) => [pad + (i / (data.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  const direction = data[data.length - 1] >= data[0] ? "rising" : "falling";

  return (
    <svg className="kpi-card__spark sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${direction} trend`}>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={0.45} />
          <stop offset="100%" stopColor={fill} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path className="sparkline__line" d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      <circle cx={lx} cy={ly} r={3} fill={stroke} />
    </svg>
  );
}
