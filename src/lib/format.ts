const intGroup = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimal = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Indian grouping (12,34,567). Values of a crore and above shorten to "4.82 Cr". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${twoDecimal.format(n / 1e7)} Cr`;
  return intGroup.format(Math.round(n));
}

/** Compact form for axes and dense labels: 12.4 L, 3.1 Cr, 8.2 K. */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${oneDecimal.format(n / 1e7)} Cr`;
  if (abs >= 1e5) return `${oneDecimal.format(n / 1e5)} L`;
  if (abs >= 1e3) return `${oneDecimal.format(n / 1e3)} K`;
  return intGroup.format(Math.round(n));
}

export function formatInr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${twoDecimal.format(n / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${twoDecimal.format(n / 1e5)} L`;
  return `₹${intGroup.format(Math.round(n))}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatDecimal(n: number): string {
  return oneDecimal.format(n);
}

export function formatValue(n: number, format: "count" | "points" | "inr" | "percent" | "decimal"): string {
  switch (format) {
    case "inr":
      return formatInr(n);
    case "percent":
      return formatPercent(n);
    case "decimal":
      return formatDecimal(n);
    default:
      return formatCount(n);
  }
}

/** Signed change, e.g. "+6.2%". Returns null when there is no basis for comparison. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

export function signedPercent(fraction: number): string {
  const s = (fraction * 100).toFixed(1);
  return `${fraction > 0 ? "+" : fraction < 0 ? "−" : ""}${s.replace("-", "")}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-09T14:30:00" or "2026-11-09 14:30" → "9 Nov 2026, 14:30". */
export function formatDateTime(value: string): string {
  const [date, time] = value.replace("T", " ").split(" ");
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}${time ? `, ${time.slice(0, 5)}` : ""}`;
}

export function formatDate(value: string): string {
  return formatDateTime(value.slice(0, 10));
}
