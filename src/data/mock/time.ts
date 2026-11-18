/**
 * Date helpers for the demo dataset. All demo data is pinned to a fixed "as of" moment so that
 * figures are stable between sessions and clearly identifiable as development data.
 */
export const DATA_START = "2024-04-01";
export const DEMO_AS_OF = "2026-11-09";
export const DEMO_AS_OF_TIME = "14:30";
/** Share of the as-of day that has elapsed, used for partial "today" figures. */
export const DEMO_TODAY_FRACTION = 0.6;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  let cur = fromYm;
  while (cur <= toYm) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

export function monthLabel(ym: string, withYear = true): string {
  const [y, m] = ym.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1];
}

export function dayLabel(iso: string): string {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function longDate(iso: string): string {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function minIso(a: string, b: string) {
  return a < b ? a : b;
}

export function maxIso(a: string, b: string) {
  return a > b ? a : b;
}

/** Financial year label (April–March) for a date, e.g. "2026-27". */
export function fyOf(iso: string): string {
  const d = toDate(iso);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function fyRange(fy: string): { from: string; to: string } {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function availableFinancialYears(): string[] {
  const out: string[] = [];
  let cur = fyOf(DATA_START);
  const last = fyOf(DEMO_AS_OF);
  while (cur <= last) {
    out.push(cur);
    const next = Number(cur.slice(0, 4)) + 1;
    cur = `${next}-${String((next + 1) % 100).padStart(2, "0")}`;
  }
  return out;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
