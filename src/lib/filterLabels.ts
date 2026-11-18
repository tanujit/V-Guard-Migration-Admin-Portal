import { findBranch, findCategory, findDistrict, findState } from "@/config/geography";
import type { DashboardFilters, ResolvedPeriod } from "@/types/dashboard";

export const FILTER_NAMES: Record<keyof DashboardFilters, string> = {
  period: "Date range",
  fy: "Financial year",
  from: "From",
  to: "To",
  programme: "Programme",
  state: "State",
  district: "District",
  branch: "Branch",
  category: "Product category",
  accessScope: "Your access scope",
};

export function filterValueLabel(key: keyof DashboardFilters, f: DashboardFilters): string {
  switch (key) {
    case "period":
      return { this_month: "This month", last_3_months: "Last 3 months", fy: "Financial year", custom: "Custom range" }[f.period];
    case "fy":
      return `FY ${f.fy}`;
    case "programme":
      return f.programme === "all" ? "All programmes" : f.programme;
    case "state":
      return f.state === "all" ? "All states" : (findState(f.state)?.name ?? f.state);
    case "district":
      return f.district === "all" ? "All districts" : (findDistrict(f.district)?.district.name ?? f.district);
    case "branch":
      return f.branch === "all" ? "All branches" : (findBranch(f.branch)?.branch.name ?? f.branch);
    case "category":
      return f.category === "all" ? "All categories" : (findCategory(f.category)?.name ?? f.category);
    default:
      return String(f[key]);
  }
}

/** Human-readable list of the filters in force, used by drill-downs and exports. */
export function describeFilters(f: DashboardFilters, period: ResolvedPeriod): { label: string; value: string }[] {
  const out = [{ label: "Period", value: period.label }];
  for (const k of ["programme", "state", "district", "branch", "category"] as const) {
    if (f[k] !== "all") out.push({ label: FILTER_NAMES[k], value: filterValueLabel(k, f) });
  }
  return out;
}
