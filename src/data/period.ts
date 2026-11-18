import type { DashboardFilters, DateSpan, ResolvedPeriod } from "@/types/dashboard";
import {
  addDays,
  addMonths,
  DATA_START,
  DEMO_AS_OF,
  daysBetween,
  daysInMonth,
  fyOf,
  fyRange,
  longDate,
  minIso,
  monthKey,
  monthsBetween,
  toDate,
  toIso,
} from "./mock/time";

function span(from: string, to: string, label?: string): DateSpan {
  return { from, to, label: label ?? `${longDate(from)} – ${longDate(to)}` };
}

function shiftMonths(iso: string, n: number): string {
  const d = toDate(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}

/** Turns the filter selection into concrete date spans, including a comparable previous span. */
export function resolvePeriod(f: DashboardFilters): ResolvedPeriod {
  const asOf = DEMO_AS_OF;
  let current: DateSpan;
  let previous: DateSpan | null;

  switch (f.period) {
    case "this_month": {
      const from = `${monthKey(asOf)}-01`;
      current = span(from, asOf, `${longDate(from)} – ${longDate(asOf)}`);
      previous = span(shiftMonths(from, -1), shiftMonths(asOf, -1), "same days last month");
      break;
    }
    case "last_3_months": {
      const from = addDays(shiftMonths(asOf, -3), 1);
      current = span(from, asOf);
      previous = span(addDays(shiftMonths(from, -3), 0), addDays(from, -1), "previous 3 months");
      break;
    }
    case "custom": {
      const from = f.from < DATA_START ? DATA_START : f.from;
      const to = minIso(f.to, asOf);
      current = span(from, to);
      const len = daysBetween(from, to);
      previous = span(addDays(from, -len - 1), addDays(from, -1), "previous period of equal length");
      break;
    }
    case "fy":
    default: {
      const r = fyRange(f.fy);
      const to = minIso(r.to, asOf);
      const isCurrent = fyOf(asOf) === f.fy;
      current = span(r.from, to, isCurrent ? `FY ${f.fy} to date` : `FY ${f.fy}`);
      const prevFrom = shiftMonths(r.from, -12);
      previous = span(prevFrom, shiftMonths(to, -12), isCurrent ? "same period last FY" : "previous FY");
      break;
    }
  }

  if (previous && previous.from < DATA_START) previous = null;

  // Monthly trends show complete months only, so an in-progress month never reads as a drop.
  let endMonth = monthKey(current.to);
  const monthInProgress = current.to === asOf && Number(asOf.slice(8, 10)) < daysInMonth(endMonth);
  if (monthInProgress) endMonth = addMonths(endMonth, -1);
  let startMonth = monthKey(current.from);
  if (startMonth > endMonth) startMonth = endMonth;
  const minStart = addMonths(endMonth, -5);
  if (startMonth > minStart) startMonth = minStart;
  if (startMonth < monthKey(DATA_START)) startMonth = monthKey(DATA_START);

  return { ...current, previous, trendMonths: monthsBetween(startMonth, endMonth), monthInProgress };
}

export const DEMO_DEFAULT_FILTERS: DashboardFilters = {
  period: "fy",
  fy: fyOf(DEMO_AS_OF),
  from: `${monthKey(DEMO_AS_OF)}-01`,
  to: DEMO_AS_OF,
  programme: "all",
  state: "all",
  district: "all",
  branch: "all",
  category: "all",
};
