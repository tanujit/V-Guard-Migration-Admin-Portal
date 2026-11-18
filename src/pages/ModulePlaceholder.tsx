import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock3, Lock } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import { useSession } from "@/context/SessionContext";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { Panel } from "@/components/ui/Panel";

/**
 * Honest placeholder for modules scheduled in later phases. It names the module, what it will
 * hold, and — when reached from a dashboard drill-down — the view and filters that were requested.
 */
export function ModulePlaceholder() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { can } = useSession();
  const item = ALL_NAV_ITEMS.find((i) => i.path === pathname);
  if (!item) return null;

  if (!can(item.permission)) {
    return (
      <PageContainer>
        <PageHeader title={item.label} />
        <Panel>
          <div className="placeholder">
            <Lock size={20} strokeWidth={1.5} aria-hidden="true" />
            <h2 className="placeholder__title">You do not have access to this module</h2>
            <p className="placeholder__text">Ask an Evolve Super Admin to review your role and access scope.</p>
          </div>
        </Panel>
      </PageContainer>
    );
  }

  const requestedView = params.get("from") === "dashboard" ? params.get("view") : null;
  const carried = params.getAll("f");

  return (
    <PageContainer>
      <PageHeader title={item.label} description={item.summary} meta={<span className="phase-tag">Coming in a subsequent phase</span>} />
      <div className="grid grid--12">
        <Panel span={7}>
          <div className="placeholder">
            <Clock3 size={20} strokeWidth={1.5} aria-hidden="true" />
            <h2 className="placeholder__title">This module is not built yet</h2>
            <p className="placeholder__text">
              {item.label} sits under {item.group.label} and will be delivered in a later phase. Nothing on this page reads or changes data.
            </p>
            {item.scope && (
              <>
                <h3 className="placeholder__h">Planned scope</h3>
                <ul className="drill__list">
                  {item.scope.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <Link to="/" className="btn btn--secondary">
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              Back to dashboard
            </Link>
          </div>
        </Panel>
        <Panel span={5} level={2} title={requestedView ? "Requested from the dashboard" : "Access"}>
          {requestedView ? (
            <>
              <p className="drill__text">
                View: <strong>{requestedView}</strong>
              </p>
              <dl className="kv">
                {carried.map((c) => {
                  const [label, ...rest] = c.split(": ");
                  return (
                    <div key={c} className="kv__row">
                      <dt>{label}</dt>
                      <dd>{rest.join(": ")}</dd>
                    </div>
                  );
                })}
              </dl>
              <p className="muted small">These filters will open the record list once the module is live.</p>
            </>
          ) : (
            <dl className="kv">
              <div className="kv__row">
                <dt>Permission</dt>
                <dd className="mono">{item.permission}</dd>
              </div>
              <div className="kv__row">
                <dt>Status</dt>
                <dd>Planned</dd>
              </div>
            </dl>
          )}
        </Panel>
      </div>
    </PageContainer>
  );
}
