import type { ReactNode } from "react";
import { ChevronDown, RotateCw } from "lucide-react";
import type { DashboardSectionDef } from "@/config/dashboardSections";
import { useFilters } from "@/context/FilterContext";
import { FILTER_NAMES } from "@/lib/filterLabels";
import { formatDateTime } from "@/lib/format";
import { ErrorState, SectionSkeleton } from "@/components/ui/primitives";
import type { SectionState } from "@/hooks/useSection";

export interface SectionProps {
  def: DashboardSectionDef;
  open: boolean;
  onToggle: () => void;
  refreshToken: number;
}

/**
 * Shared frame for every dashboard section: collapsible header, refresh control, last-refresh
 * time, a one-line summary shown while collapsed, and an honest note when an active filter does
 * not apply to the section.
 */
export function DashboardSection<T>({ def, open, onToggle, state, summary, children }: Omit<SectionProps, "refreshToken"> & { state: SectionState<T>; summary?: ReactNode; children: (data: T) => ReactNode }) {
  const { filters, activeKeys } = useFilters();
  const geoActive = filters.state !== "all" || filters.district !== "all" || filters.branch !== "all";
  const ignored: string[] = [];
  if (activeKeys.includes("programme") && !def.responds.includes("programme")) ignored.push(FILTER_NAMES.programme.toLowerCase());
  if (geoActive && !def.responds.includes("state")) ignored.push("geography");
  if (activeKeys.includes("category") && !def.responds.includes("category")) ignored.push(FILTER_NAMES.category.toLowerCase());
  if ((activeKeys.includes("period") || activeKeys.includes("fy")) && !def.responds.includes("period")) ignored.push("date range");

  const bodyId = `sec-body-${def.id}`;
  const Icon = def.icon;

  return (
    <section className={`dsec ${open ? "is-open" : ""}`} id={`sec-${def.id}`} aria-labelledby={`sec-title-${def.id}`}>
      <header className="dsec__head">
        <button type="button" className="dsec__toggle" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
          <span className="dsec__icon" aria-hidden="true">
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className="dsec__titles">
            <h3 className="dsec__title" id={`sec-title-${def.id}`}>
              {def.title}
            </h3>
            <span className="dsec__desc">{def.description}</span>
          </span>
          <ChevronDown size={18} strokeWidth={2} className="dsec__chev" aria-hidden="true" />
        </button>
        <div className="dsec__meta">
          {!open && summary && state.data && <span className="dsec__summary">{summary}</span>}
          {ignored.length > 0 && <span className="dsec__ignored">Not filtered by {ignored.join(", ")}</span>}
          {state.refreshedAt && (
            <span className="dsec__time num" title="Refresh time of the demo data">
              {state.loading ? "Refreshing…" : `Demo data · ${formatDateTime(state.refreshedAt).split(", ")[1]}`}
            </span>
          )}
          <button type="button" className="icon-btn icon-btn--sm" onClick={state.refresh} aria-label={`Refresh ${def.title}`} disabled={state.loading}>
            <RotateCw size={14} strokeWidth={1.75} className={state.loading ? "spin" : ""} />
          </button>
        </div>
      </header>
      {open && (
        <div className="dsec__body" id={bodyId}>
          {state.error ? <ErrorState message={state.error} onRetry={state.refresh} /> : !state.data ? <SectionSkeleton /> : <div className={state.loading ? "is-stale" : ""}>{children(state.data)}</div>}
        </div>
      )}
    </section>
  );
}
