import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_DEFAULT_FILTERS, resolvePeriod } from "@/data/period";
import type { DashboardFilters, ResolvedPeriod } from "@/types/dashboard";

interface FilterValue {
  filters: DashboardFilters;
  period: ResolvedPeriod;
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  clearAll: () => void;
  /** Filters that differ from the defaults. */
  activeKeys: (keyof DashboardFilters)[];
}

const FilterContext = createContext<FilterValue | null>(null);
const STORAGE_KEY = "vg-rishta.dashboard-filters";

function readInitial(): DashboardFilters {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEMO_DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<DashboardFilters>) };
  } catch {
    /* ignore */
  }
  return DEMO_DEFAULT_FILTERS;
}

/** Geography filters cascade: changing a parent clears its children. */
function applyCascade(prev: DashboardFilters, patch: Partial<DashboardFilters>): DashboardFilters {
  const next = { ...prev, ...patch };
  if ("state" in patch && patch.state !== prev.state) {
    next.district = patch.district ?? "all";
    next.branch = patch.branch ?? "all";
  }
  if ("district" in patch && patch.district !== prev.district && !("branch" in patch)) next.branch = "all";
  if ("fy" in patch && !("period" in patch)) next.period = "fy";
  return next;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setState] = useState<DashboardFilters>(readInitial);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const setFilters = useCallback((patch: Partial<DashboardFilters>) => setState((prev) => applyCascade(prev, patch)), []);
  const setFilter = useCallback(<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => setFilters({ [key]: value } as Partial<DashboardFilters>), [setFilters]);
  const clearAll = useCallback(() => setState(DEMO_DEFAULT_FILTERS), []);

  const value = useMemo<FilterValue>(() => {
    const activeKeys = (Object.keys(filters) as (keyof DashboardFilters)[]).filter((k) => {
      if (k === "from" || k === "to") return filters.period === "custom";
      return filters[k] !== DEMO_DEFAULT_FILTERS[k];
    });
    return { filters, period: resolvePeriod(filters), setFilter, setFilters, clearAll, activeKeys };
  }, [filters, setFilter, setFilters, clearAll]);

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used inside FilterProvider");
  return ctx;
}
