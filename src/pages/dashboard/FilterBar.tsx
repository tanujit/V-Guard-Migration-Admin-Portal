import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useFilters } from "@/context/FilterContext";
import { useSession } from "@/context/SessionContext";
import { GEOGRAPHY, PRODUCT_CATEGORIES, findDistrict, findState } from "@/config/geography";
import { DateRangeFilter, ProgrammeFilter } from "@/components/filters/Filters";
import { SelectField } from "@/components/ui/primitives";
import { FILTER_NAMES, filterValueLabel } from "@/lib/filterLabels";
import { DEMO_DEFAULT_FILTERS } from "@/data/period";
import type { DashboardFilters } from "@/types/dashboard";

/**
 * Global dashboard filters. Changing a value updates every section in place (no reload).
 * Geography cascades State → District → Branch; children stay disabled until a parent is chosen.
 */
export function FilterBar() {
  const { filters, setFilters, setFilter, clearAll, activeKeys, period } = useFilters();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const allowedProgrammes = user?.scope.programmes ?? [];
  const allowedStates = user?.scope.states ?? [];
  const stateOptions = GEOGRAPHY.filter((s) => allowedStates === "all" || allowedStates.includes(s.code));

  // A filter left over from another identity must never point outside the current user's scope.
  useEffect(() => {
    if (filters.programme !== "all" && allowedProgrammes !== "all" && !allowedProgrammes.includes(filters.programme)) setFilter("programme", "all");
    if (filters.state !== "all" && allowedStates !== "all" && !allowedStates.includes(filters.state)) setFilter("state", "all");
  }, [filters.programme, filters.state, allowedProgrammes, allowedStates, setFilter]);

  const state = filters.state !== "all" ? findState(filters.state) : undefined;
  const district = filters.district !== "all" ? findDistrict(filters.district)?.district : undefined;

  const chips = activeKeys.filter((k) => k !== "from" && k !== "to" && !(k === "period" && filters.period === "fy"));

  const reset = (k: keyof DashboardFilters) => {
    if (k === "fy" || k === "period") setFilters({ period: DEMO_DEFAULT_FILTERS.period, fy: DEMO_DEFAULT_FILTERS.fy });
    else setFilter(k, "all");
  };

  return (
    <div className="filterbar" role="region" aria-label="Dashboard filters">
      <div className="filterbar__top">
        <span className="filterbar__title">
          <span className="filterbar__title-icon" aria-hidden="true">
            <SlidersHorizontal size={14} strokeWidth={2} />
          </span>
          Filters
          {chips.length > 0 && <span className="filterbar__count num">{chips.length}</span>}
        </span>
        <button type="button" className="btn btn--secondary btn--sm filterbar__toggle" aria-expanded={open} aria-controls="filter-fields" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide filters" : "Show filters"}
        </button>
        <p className="filterbar__period">
          <span className="filterbar__range num">{period.label}</span>
          {period.previous ? <span className="muted"> · compared with {period.previous.label}</span> : <span className="muted"> · no earlier data to compare</span>}
          {period.monthInProgress && <span className="muted"> · monthly charts show complete months</span>}
        </p>
        <button type="button" className="btn btn--ghost btn--sm filterbar__clear" onClick={clearAll} disabled={!chips.length}>
          <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
          Clear all
        </button>
      </div>

      <div id="filter-fields" className={`filterbar__fields ${open ? "is-open" : ""}`}>
        <DateRangeFilter filters={filters} onChange={setFilters} />
        <ProgrammeFilter value={filters.programme} allowed={allowedProgrammes} onChange={(v) => setFilter("programme", v)} />
        <SelectField label="State" value={filters.state} active={filters.state !== "all"} onChange={(v) => setFilter("state", v)} options={[{ value: "all", label: allowedStates === "all" ? "All states" : "All my states" }, ...stateOptions.map((s) => ({ value: s.code, label: s.name }))]} />
        <SelectField label="District" value={filters.district} active={filters.district !== "all"} hint="Select a state first" onChange={(v) => setFilter("district", v)} disabled={!state} options={[{ value: "all", label: state ? "All districts" : "Select a state first" }, ...(state?.districts.map((d) => ({ value: d.code, label: d.name })) ?? [])]} />
        <SelectField label="Branch" value={filters.branch} active={filters.branch !== "all"} hint="Select a district first" onChange={(v) => setFilter("branch", v)} disabled={!district} options={[{ value: "all", label: district ? "All branches" : "Select a district first" }, ...(district?.branches.map((b) => ({ value: b.code, label: b.name })) ?? [])]} />
        <SelectField label="Product category" value={filters.category} active={filters.category !== "all"} onChange={(v) => setFilter("category", v)} options={[{ value: "all", label: "All categories" }, ...PRODUCT_CATEGORIES.map((c) => ({ value: c.key, label: c.name }))]} />
      </div>

      {chips.length > 0 && (
        <div className="filterbar__chips">
          <span className="filterbar__chips-label">Active</span>
          <ul>
            {chips.map((k) => (
              <li key={k}>
                <span className="chip">
                  <span className="chip__k">{FILTER_NAMES[k]}</span>
                  <span className="chip__v">{filterValueLabel(k, filters)}</span>
                  <button type="button" className="chip__x" onClick={() => reset(k)} aria-label={`Remove ${FILTER_NAMES[k]} filter`}>
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
