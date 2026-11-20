import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { IS_SIMULATION, DEMO_DATASET } from "@/config/environment";
import { DEMO_PERSONAS, personaOf } from "@/config/demoPersonas";
import { simClock, useDemoSession } from "@/features/demo/session";
import { formatDateTime } from "@/lib/format";

const ScenarioPanel = lazy(() => import("./ScenarioPanel").then((m) => ({ default: m.ScenarioPanel })));

/**
 * Persistent DEMO / SIMULATION MODE indicator (Build Prompt 14A, 2.3), shown on every page of a
 * simulation build together with the simulated identity, dataset and simulation clock, and the
 * persona switcher. Production builds render nothing.
 */
export function SimulationBanner() {
  const { user, switchIdentity } = useSession();
  const session = useDemoSession();
  if (!IS_SIMULATION) return null;
  const persona = personaOf(user?.id);
  return (
    <>
      <div className="sim-banner" role="status">
        <div className="sim-banner__main" title={`${DEMO_DATASET} · reset ${session.lastResetAt ? formatDateTime(session.lastResetAt) : "never"} · simulation time ${formatDateTime(simClock())}`}>
          <FlaskConical size={16} aria-hidden="true" />
          <strong>Demo mode</strong>
          <span className="sr-only">All transactions and integrations are simulated</span>
        </div>
        {user && (
          <div className="sim-banner__meta">
            <label className="sim-banner__switch">
              <span className="sim-banner__as">Viewing as</span>
              <select value={persona?.userId ?? ""} onChange={(e) => e.target.value && switchIdentity(e.target.value)} aria-label="Switch simulated role">
                {!persona && <option value="">{user.name}</option>}
                {DEMO_PERSONAS.map((p) => <option key={p.key} value={p.userId}>{p.label}</option>)}
              </select>
            </label>
            <Link to="/governance/demo-centre" className="sim-banner__link">Demo centre</Link>
          </div>
        )}
      </div>
      {user && session.scenarioId && (
        <Suspense fallback={null}>
          <ScenarioPanel />
        </Suspense>
      )}
    </>
  );
}
