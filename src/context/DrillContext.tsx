import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock3 } from "lucide-react";
import { findNavItem } from "@/config/navigation";
import { describeFilters } from "@/lib/filterLabels";
import { useFilters } from "./FilterContext";
import { Drawer } from "@/components/ui/Overlay";
import { DemoBadge } from "@/components/ui/primitives";
import type { DrillTarget } from "@/types/dashboard";

interface DrillValue {
  openDrill: (target: DrillTarget & { value?: string }) => void;
}

const DrillContext = createContext<DrillValue | null>(null);

/**
 * Drill-downs open a panel that names the destination module and carries the current filters.
 * When the module is not yet built, the panel says so instead of pretending a detail view exists.
 */
export function DrillProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<(DrillTarget & { value?: string }) | null>(null);
  const { filters, period } = useFilters();
  const navigate = useNavigate();
  const close = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ openDrill: setTarget }), []);

  const module = target ? findNavItem(target.module) : undefined;
  const applied = target ? [...describeFilters(filters, period), ...Object.entries(target.context ?? {}).map(([label, v]) => ({ label: label[0].toUpperCase() + label.slice(1), value: v }))] : [];

  const openModule = () => {
    if (!module || !target) return;
    const params = new URLSearchParams({ from: "dashboard", view: target.title });
    applied.forEach((a) => params.append("f", `${a.label}: ${a.value}`));
    close();
    navigate(`${module.path}?${params.toString()}`);
  };

  return (
    <DrillContext.Provider value={value}>
      {children}
      <Drawer
        open={!!target}
        onClose={close}
        title={target?.title ?? ""}
        subtitle={
          <>
            {target?.value && <span className="num">{target.value}</span>}
            <DemoBadge />
          </>
        }
        footer={
          <>
            <button className="btn btn--secondary" onClick={close}>
              Back to dashboard
            </button>
            {module && (
              <button className="btn btn--primary" onClick={openModule}>
                Open {module.label}
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </>
        }
      >
        {module && (
          <div className="drill">
            <div className="drill__dest">
              <span className="drill__icon">
                <module.icon size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div>
                <p className="drill__eyebrow">Detailed view lives in</p>
                <p className="drill__module">
                  {module.group.label} / {module.label}
                </p>
              </div>
            </div>

            {module.status === "planned" && (
              <div className="callout callout--info">
                <Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />
                <p>
                  <strong>{module.label}</strong> is coming in a subsequent phase. The record-level list for this figure will open there with the filters below already applied.
                </p>
              </div>
            )}

            <h3 className="drill__h">Filters carried over</h3>
            <dl className="kv">
              {applied.map((a) => (
                <div key={`${a.label}-${a.value}`} className="kv__row">
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>

            <h3 className="drill__h">What the detailed view will hold</h3>
            <p className="drill__text">{module.summary}</p>
            {module.scope && (
              <ul className="drill__list">
                {module.scope.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>
    </DrillContext.Provider>
  );
}

export function useDrill() {
  const ctx = useContext(DrillContext);
  if (!ctx) throw new Error("useDrill must be used inside DrillProvider");
  return ctx;
}
