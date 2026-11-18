import { PROGRAMMES } from "@/config/programmes";
import { SelectField } from "@/components/ui/primitives";
import { DEMO_DEFAULT_FILTERS } from "@/data/period";
import { availableFinancialYears, DATA_START, DEMO_AS_OF } from "@/data/mock/time";
import type { DashboardFilters, PeriodPreset } from "@/types/dashboard";

/** Date range filter: preset, financial year and an optional custom span. */
export function DateRangeFilter({ filters, onChange }: { filters: DashboardFilters; onChange: (patch: Partial<DashboardFilters>) => void }) {
  return (
    <>
      <SelectField
        label="Date range"
        value={filters.period}
        active={filters.period !== DEMO_DEFAULT_FILTERS.period}
        onChange={(v) => onChange({ period: v as PeriodPreset })}
        options={[
          { value: "fy", label: "Financial year" },
          { value: "this_month", label: "This month" },
          { value: "last_3_months", label: "Last 3 months" },
          { value: "custom", label: "Custom range" },
        ]}
      />
      <SelectField label="Financial year" value={filters.fy} active={filters.fy !== DEMO_DEFAULT_FILTERS.fy} onChange={(v) => onChange({ fy: v, period: "fy" })} options={availableFinancialYears().map((fy) => ({ value: fy, label: `FY ${fy}` }))} />
      {filters.period === "custom" && (
        <div className="field field--range">
          <span className="field__label" id="custom-range-label">
            Custom range
          </span>
          <div className="range" role="group" aria-labelledby="custom-range-label">
            <input type="date" className="select is-set" aria-label="From date" min={DATA_START} max={filters.to} value={filters.from} onChange={(e) => e.target.value && onChange({ from: e.target.value })} />
            <span className="muted" aria-hidden="true">
              to
            </span>
            <input type="date" className="select is-set" aria-label="To date" min={filters.from} max={DEMO_AS_OF} value={filters.to} onChange={(e) => e.target.value && onChange({ to: e.target.value })} />
          </div>
        </div>
      )}
    </>
  );
}

/** Programme filter, populated from the central programme configuration. */
export function ProgrammeFilter({ value, onChange, allowed = "all" }: { value: string; onChange: (v: string) => void; allowed?: "all" | string[] }) {
  const list = PROGRAMMES.filter((p) => allowed === "all" || allowed.includes(p.code));
  return <SelectField label="Programme" value={value} active={value !== "all"} onChange={onChange} options={[{ value: "all", label: allowed === "all" ? "All programmes" : "All my programmes" }, ...list.map((p) => ({ value: p.code, label: p.code }))]} />;
}
