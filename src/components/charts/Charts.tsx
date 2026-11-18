import { useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { formatCompact, formatCount, formatPercent } from "@/lib/format";
import type { SeriesDef, SeriesPoint, ShareItem } from "@/types/dashboard";
import { EmptyState } from "@/components/ui/primitives";
import { CHART, SERIES_GRADIENT } from "@/lib/chartColors";

const AXIS = { fontSize: 11, fill: "var(--chart-axis)", fontFamily: "var(--font-mono)" };

/** Yellow strokes are darkened to amber so lines keep ≥3:1 contrast against white. */
function strokeFor(color: string) {
  return color === CHART.lead ? "#e09e00" : color;
}

/** Chart entrance animation, off when the viewer asks for reduced motion. */
function useAnimate() {
  return useMemo(() => typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
}

/* ---------------- Legend with series toggling ---------------- */

export function ChartLegend({ series, hidden, onToggle }: { series: SeriesDef[]; hidden: Set<string>; onToggle?: (key: string) => void }) {
  return (
    <ul className="chart-legend">
      {series.map((s) => {
        const off = hidden.has(s.key);
        const swatch = <span className={`legend-swatch ${s.dashed ? "legend-swatch--dashed" : ""}`} style={{ background: s.dashed ? "transparent" : s.color, borderColor: s.color }} aria-hidden="true" />;
        return (
          <li key={s.key}>
            {onToggle ? (
              <button type="button" className={`chart-legend__item ${off ? "is-off" : ""}`} aria-pressed={!off} onClick={() => onToggle(s.key)} title={off ? `Show ${s.label}` : `Hide ${s.label}`}>
                {swatch}
                {s.label}
              </button>
            ) : (
              <span className="chart-legend__item">
                {swatch}
                {s.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function useHidden(series: SeriesDef[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else if (series.length - next.size > 1) next.add(key); // keep at least one series visible
      return next;
    });
  return { hidden, toggle };
}

/* ---------------- Tooltip ---------------- */

function ChartTooltip({ active, payload, label, valueFormat, series }: TooltipProps<number, string> & { valueFormat: (n: number) => string; series: SeriesDef[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{label}</p>
      {payload.map((p) => {
        const def = series.find((s) => s.key === p.dataKey);
        if (p.value === null || p.value === undefined) return null;
        return (
          <p key={String(p.dataKey)} className="chart-tip__row">
            <span className="legend-swatch" style={{ background: def?.color ?? (p.color as string) }} aria-hidden="true" />
            <span className="chart-tip__name">{def?.label ?? p.name}</span>
            <span className="chart-tip__val num">{valueFormat(Number(p.value))}</span>
          </p>
        );
      })}
    </div>
  );
}

function summaryText(data: SeriesPoint[], series: SeriesDef[], valueFormat: (n: number) => string) {
  if (!data.length) return "No data";
  const first = data[0];
  const last = data[data.length - 1];
  return series.map((s) => `${s.label}: ${valueFormat(Number(first[s.key] ?? 0))} in ${first.label}, ${valueFormat(Number(last[s.key] ?? 0))} in ${last.label}`).join(". ");
}

/* ---------------- Trend / bar chart ---------------- */

interface TrendProps {
  data: SeriesPoint[];
  series: SeriesDef[];
  kind?: "line" | "area" | "bar" | "stacked";
  height?: number;
  valueFormat?: (n: number) => string;
  axisFormat?: (n: number) => string;
  onSelect?: (point: SeriesPoint) => void;
  ariaLabel: string;
  legend?: boolean;
  /** Key of a point to emphasise (e.g. the current month). Others render in the neutral step. */
  highlightKey?: string;
}

export function TrendChart({ data, series, kind = "line", height = 260, valueFormat = formatCount, axisFormat = formatCompact, onSelect, ariaLabel, legend = true, highlightKey }: TrendProps) {
  const { hidden, toggle } = useHidden(series);
  const uid = useId().replace(/:/g, "");
  const animate = useAnimate();
  const visible = series.filter((s) => !hidden.has(s.key));
  const hasData = data.some((d) => series.some((s) => Number(d[s.key] ?? 0) > 0));
  const handleClick = (e: { activeTooltipIndex?: number } | null) => {
    if (onSelect && e && typeof e.activeTooltipIndex === "number" && data[e.activeTooltipIndex]) onSelect(data[e.activeTooltipIndex]);
  };

  if (!hasData) return <EmptyState title="No activity in this period">Change the date range or filters to see a trend</EmptyState>;

  const gid = (key: string) => `g-${uid}-${key}`;
  const motion = { isAnimationActive: animate, animationDuration: 700, animationEasing: "ease-out" as const };
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
    onClick: handleClick,
    style: { cursor: onSelect ? "pointer" : "default" },
  };
  const grid = <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} />;
  const xAxis = <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline-strong)" }} minTickGap={12} interval="preserveStartEnd" />;
  const yAxis = <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisFormat} width={56} />;
  const tooltip = <Tooltip content={<ChartTooltip valueFormat={valueFormat} series={series} />} cursor={kind === "bar" || kind === "stacked" ? { fill: "rgba(255, 208, 0, 0.12)" } : { stroke: CHART.leadInk, strokeDasharray: "3 3" }} isAnimationActive={false} />;

  // Vertical gradient per series: bars get a solid brand gradient, areas a fading wash.
  const defs = (
    <defs>
      {visible.map((s) => {
        const [top, bottom] = SERIES_GRADIENT[s.color] ?? [s.color, s.color];
        return kind === "bar" || kind === "stacked" ? (
          <linearGradient key={s.key} id={gid(s.key)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={top} />
            <stop offset="100%" stopColor={bottom} />
          </linearGradient>
        ) : (
          <linearGradient key={s.key} id={gid(s.key)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={s.color === CHART.lead ? 0.45 : 0.2} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
          </linearGradient>
        );
      })}
    </defs>
  );

  let chart: ReactNode;
  if (kind === "bar" || kind === "stacked") {
    chart = (
      <BarChart {...common} barCategoryGap="24%">
        {defs}
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {visible.map((s, idx) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={`url(#${gid(s.key)})`} stackId={kind === "stacked" ? "a" : undefined} radius={kind === "stacked" ? (idx === visible.length - 1 ? [5, 5, 0, 0] : 0) : [5, 5, 0, 0]} maxBarSize={38} {...motion}>
            {highlightKey && visible.length === 1 && data.map((d) => <Cell key={d.key} fill={d.key === highlightKey ? `url(#${gid(s.key)})` : CHART.neutral} />)}
          </Bar>
        ))}
      </BarChart>
    );
  } else if (kind === "area") {
    chart = (
      <AreaChart {...common}>
        {defs}
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {visible.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={strokeFor(s.color)} strokeWidth={2.5} fill={`url(#${gid(s.key)})`} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: strokeFor(s.color) }} {...motion} />
        ))}
      </AreaChart>
    );
  } else {
    // Lines: the lead series also gets a soft area wash beneath it for depth.
    chart = (
      <AreaChart {...common}>
        {defs}
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {visible.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={strokeFor(s.color)} strokeWidth={s.dashed ? 1.75 : 2.5} strokeDasharray={s.dashed ? "5 5" : undefined} fill={i === 0 && !s.dashed ? `url(#${gid(s.key)})` : "transparent"} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: strokeFor(s.color) }} connectNulls={false} {...motion} />
        ))}
      </AreaChart>
    );
  }

  return (
    <figure className="chart" aria-label={ariaLabel}>
      {legend && <ChartLegend series={series} hidden={hidden} onToggle={series.length > 1 ? toggle : undefined} />}
      <div style={{ height }} role="img" aria-label={`${ariaLabel}. ${summaryText(data, visible, valueFormat)}`}>
        <ResponsiveContainer width="100%" height="100%">
          {chart as ReactElement}
        </ResponsiveContainer>
      </div>
      {onSelect && <figcaption className="chart__hint">Select a point to open its detail</figcaption>}
    </figure>
  );
}

/* ---------------- Donut ---------------- */

export function DonutChart({ items, centerLabel, onSelect, height = 220, valueFormat = formatCount, ariaLabel }: { items: ShareItem[]; centerLabel: string; onSelect?: (item: ShareItem) => void; height?: number; valueFormat?: (n: number) => string; ariaLabel: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const animate = useAnimate();
  const visible = useMemo(() => items.filter((i) => !hidden.has(i.key) && i.value > 0), [items, hidden]);
  const totalValue = visible.reduce((a, b) => a + b.value, 0);
  const allTotal = items.reduce((a, b) => a + b.value, 0) || 1;

  if (!allTotal || !items.some((i) => i.value > 0)) return <EmptyState title="No data for this selection" />;

  return (
    <div className="donut">
      <div className="donut__chart" style={{ height }} role="img" aria-label={`${ariaLabel}: ${items.map((i) => `${i.label} ${valueFormat(i.value)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={visible} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="92%" paddingAngle={1.5} cornerRadius={4} stroke="#fff" strokeWidth={2} isAnimationActive={animate} animationDuration={700} onClick={(d: ShareItem) => onSelect?.(d)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              {visible.map((i) => (
                <Cell key={i.key} fill={i.color ?? "var(--chart-neutral-1)"} />
              ))}
            </Pie>
            <Tooltip
              isAnimationActive={false}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="chart-tip">
                    <p className="chart-tip__row">
                      <span className="legend-swatch" style={{ background: (payload[0].payload as ShareItem).color }} aria-hidden="true" />
                      <span className="chart-tip__name">{payload[0].name}</span>
                      <span className="chart-tip__val num">{valueFormat(Number(payload[0].value))}</span>
                    </p>
                    <p className="chart-tip__sub num">{formatPercent(Number(payload[0].value) / (totalValue || 1))} of shown</p>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut__center" aria-hidden="true">
          <span className="donut__total num">{formatCompact(totalValue)}</span>
          <span className="donut__label">{centerLabel}</span>
        </div>
      </div>
      <ul className="donut__legend">
        {items.map((i) => {
          const off = hidden.has(i.key);
          return (
            <li key={i.key} className="donut__legend-row">
              <button
                type="button"
                className={`chart-legend__item ${off ? "is-off" : ""}`}
                aria-pressed={!off}
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(i.key)) n.delete(i.key);
                    else if (items.length - n.size > 1) n.add(i.key);
                    return n;
                  })
                }
                title={off ? `Show ${i.label}` : `Hide ${i.label}`}
              >
                <span className="legend-swatch" style={{ background: i.color }} aria-hidden="true" />
                {i.label}
              </button>
              <span className="donut__legend-val num">{valueFormat(i.value)}</span>
              <span className="donut__legend-pct num">{formatPercent(i.value / allTotal, 1)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
