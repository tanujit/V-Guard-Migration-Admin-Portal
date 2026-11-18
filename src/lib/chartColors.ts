/**
 * Chart palette (V-Guard theme). Charts are SVG, so they need literal values; keep these in step
 * with src/styles/tokens.css.
 *
 *  lead      yellow/amber — the primary series
 *  leadInk   darker amber stroke so yellow lines keep ≥3:1 contrast on white
 *  support   charcoal — the comparison or secondary series
 *  semantic  green / orange / red / teal only where the data means success, pending, failure
 */
export const CHART = {
  lead: "#ffc400",
  leadDeep: "#f2b900",
  leadInk: "#b88700",
  support: "#242833",
  supportSoft: "#5b6070",
  neutral: "#c9cbc6",
  positive: "#1e9e62",
  warning: "#f08c00",
  negative: "#e5484d",
  teal: "#14a39a",
  info: "#3b82f6",
} as const;

/** Gradient stops for series fills, keyed by base colour. Falls back to a flat fill. */
export const SERIES_GRADIENT: Record<string, [string, string]> = {
  [CHART.lead]: ["#ffd000", "#f2b900"],
  [CHART.support]: ["#3a3f4c", "#1a1d24"],
  [CHART.positive]: ["#34c47f", "#1a8a55"],
  [CHART.negative]: ["#f26a6e", "#d63a3f"],
  [CHART.warning]: ["#ffa630", "#e07b00"],
  [CHART.teal]: ["#2cc0b6", "#0f8a83"],
};
