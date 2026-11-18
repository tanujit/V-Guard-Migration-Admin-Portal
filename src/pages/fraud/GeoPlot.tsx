/**
 * Minimal coordinate plot (no map tiles): points are drawn on an India-sized lat/lng frame.
 * Only coordinates supplied by the source service are drawn; nothing is interpolated.
 */
export interface PlotPoint {
  lat: number;
  lng: number;
  label: string;
  tone?: "accent" | "dark" | "negative";
}
const LAT: [number, number] = [6, 36];
const LNG: [number, number] = [67, 98];
export function GeoPlot({ points, line = false, height = 240, ariaLabel }: { points: PlotPoint[]; line?: boolean; height?: number; ariaLabel: string }) {
  const w = 320;
  const x = (lng: number) => ((lng - LNG[0]) / (LNG[1] - LNG[0])) * w;
  const y = (lat: number) => height - ((lat - LAT[0]) / (LAT[1] - LAT[0])) * height;
  if (!points.length) return <p className="muted small">No coordinates supplied by the source service</p>;
  return (
    <svg className="geo-plot" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel} width="100%" height={height}>
      <rect x="0" y="0" width={w} height={height} rx="12" className="geo-plot__bg" />
      {line && points.length > 1 && <polyline points={points.map((p) => `${x(p.lng)},${y(p.lat)}`).join(" ")} className="geo-plot__line" fill="none" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.lng)} cy={y(p.lat)} r="6" className={`geo-plot__pt geo-plot__pt--${p.tone ?? "accent"}`} />
          <text x={x(p.lng) + 9} y={y(p.lat) + 4} className="geo-plot__label">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
