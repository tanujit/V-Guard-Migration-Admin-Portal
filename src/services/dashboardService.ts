import type { DashboardFilters, SectionResult } from "@/types/dashboard";
import { DATA_MODE, httpDashboardSource } from "./api";
import type { DashboardDataSource } from "./dashboardSource";
import { mockDashboardSource } from "./mockDashboardSource";
import { DEMO_AS_OF, DEMO_AS_OF_TIME } from "@/data/mock/time";

const source: DashboardDataSource = DATA_MODE === "http" ? httpDashboardSource : mockDashboardSource;

/** Sections forced to fail, for exercising error states (?demoError=scanning,points). */
const forcedErrors = new Set<string>(
  typeof window === "undefined" ? [] : (new URLSearchParams(window.location.search).get("demoError") ?? "").split(",").filter(Boolean),
);

let refreshCounter = 0;

/** Mock refresh time: the demo as-of moment plus a few minutes per manual refresh. */
function demoRefreshedAt(): string {
  const [h, m] = DEMO_AS_OF_TIME.split(":").map(Number);
  const total = h * 60 + m + refreshCounter * 2;
  return `${DEMO_AS_OF}T${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export type SectionKey = keyof DashboardDataSource;

/**
 * Loads one dashboard section. Adds simulated latency in mock mode so loading states are real,
 * and wraps the payload with its refresh timestamp and source marker.
 */
export async function loadSection<K extends SectionKey>(
  key: K,
  filters: DashboardFilters,
  options: { manual?: boolean; args?: unknown[]; scope?: DashboardFilters["accessScope"] } = {},
): Promise<SectionResult<Awaited<ReturnType<DashboardDataSource[K]>>>> {
  if (options.manual) refreshCounter += 1;
  if (DATA_MODE === "mock") await delay(220 + Math.random() * 380);
  if (forcedErrors.has(key)) throw new Error("The demo data service returned an error for this section.");
  // Deny by default: with no scope supplied, nothing is visible.
  const scoped: DashboardFilters = { ...filters, accessScope: options.scope ?? { programmes: [], states: [] } };
  const fn = source[key] as (f: DashboardFilters, ...rest: unknown[]) => Promise<Awaited<ReturnType<DashboardDataSource[K]>>>;
  const data = await fn(scoped, ...(options.args ?? []));
  return { data, refreshedAt: demoRefreshedAt(), source: "demo" };
}
