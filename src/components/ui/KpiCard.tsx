import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatValue, percentChange, signedPercent } from "@/lib/format";
import type { KpiMetric } from "@/types/dashboard";

/**
 * KPI card variants (V-Guard design system):
 *  primary  yellow gradient, black text — headline metrics
 *  dark     black-to-charcoal glass, yellow accents — prominent operational/financial metrics
 *  light    white glass with a soft yellow overlay — supporting metrics
 *  status   neutral glass with a semantic accent (positive / warning / negative)
 */
export type KpiVariant = "primary" | "dark" | "light" | "status";
export type KpiTone = "positive" | "warning" | "negative";

const SPARK_COLORS: Record<string, { stroke: string; fill: string }> = {
  primary: { stroke: "#111318", fill: "#111318" },
  dark: { stroke: "#ffd000", fill: "#ffd000" },
  light: { stroke: "#b88700", fill: "#ffc400" },
  positive: { stroke: "#1e9e62", fill: "#1e9e62" },
  warning: { stroke: "#e07b00", fill: "#f08c00" },
  negative: { stroke: "#d63a3f", fill: "#e5484d" },
};

interface Props {
  metric: KpiMetric;
  onSelect: (m: KpiMetric) => void;
  variant?: KpiVariant;
  tone?: KpiTone;
  icon: LucideIcon;
  /** Denser card for directories and secondary dashboards. */
  compact?: boolean;
}

/**
 * A clickable KPI: icon, title, prominent value, change against the comparison period (only when
 * the data supports it), a sparkline when history exists, and a one-line explanation. Trend colour
 * follows the metric's good direction, so a rising backlog reads as bad.
 */
export function KpiCard({ metric, onSelect, variant = "light", tone, icon: Icon, compact }: Props) {
  const change = metric.comparison ? percentChange(metric.value, metric.comparison.previous) : null;
  const flat = change === null || Math.abs(change) < 0.0005;
  let judgement: "good" | "bad" | "flat" = "flat";
  if (!flat && metric.goodDirection !== "neutral") {
    const up = change! > 0;
    judgement = (up && metric.goodDirection === "up") || (!up && metric.goodDirection === "down") ? "good" : "bad";
  }
  const Arrow = flat ? Minus : change! > 0 ? ArrowUpRight : ArrowDownRight;
  const spark = SPARK_COLORS[variant === "status" ? (tone ?? "warning") : variant];
  const valueText = formatValue(metric.value, metric.format);

  return (
    <button
      type="button"
      className={`kpi-card kpi-card--${variant} ${variant === "status" ? `kpi-card--tone-${tone ?? "warning"}` : ""} ${compact ? "kpi-card--compact" : ""}`}
      onClick={() => onSelect(metric)}
      aria-label={`${metric.label}: ${valueText}${metric.format === "points" ? " points" : ""}. Open detail`}
      title={metric.description}
    >
      {variant === "status" && <span className="kpi-card__bar" aria-hidden="true" />}
      <span className="kpi-card__top">
        <span className="kpi-card__icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2} />
        </span>
        <span className="kpi-card__label">{metric.label}</span>
      </span>
      <ChevronRight className="kpi-card__go" size={16} strokeWidth={2} aria-hidden="true" />

      <span className="kpi-card__value num">
        {valueText}
        {metric.format === "points" && <span className="kpi-card__unit">pts</span>}
      </span>

      <span className="kpi-card__meta">
        {metric.comparison && change !== null ? (
          <span className="kpi-card__change">
            <span className={`kpi-card__delta kpi-card__delta--${judgement}`}>
              <Arrow size={13} strokeWidth={2.5} aria-hidden="true" />
              <span className="num">{signedPercent(change)}</span>
            </span>{" "}
            <span className="kpi-card__vs">{metric.comparison.label}</span>
          </span>
        ) : metric.reference && !/^(Select to open|No comparison)/.test(metric.reference) ? (
          <span className="kpi-card__ref">{metric.reference}</span>
        ) : null}
        {metric.trend && <Sparkline data={metric.trend} stroke={spark.stroke} fill={spark.fill} label={`${metric.label}, ${metric.trendLabel ?? "recent history"}`} />}
      </span>

    </button>
  );
}
