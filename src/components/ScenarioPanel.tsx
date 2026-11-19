import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, RotateCcw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { DEMO_PERSONAS } from "@/config/demoScenarios";
import { setStep, toggleManual, togglePanel, useDemoSession } from "@/features/demo/session";
import { clearScenario, rebaseline, resetScenario, scenarioProgress } from "@/features/demo/store";
import { memberStore } from "@/features/members/store";
import { walletStore } from "@/features/wallet/store";
import { schemeStore } from "@/features/schemes/store";
import { riskStore } from "@/features/risk/store";
import { giftsStore } from "@/features/gifts/store";
import { commsStore } from "@/features/comms/store";
import { opsStore } from "@/features/ops/store";
import { analyticsStore } from "@/features/analytics/store";
import { approvalStore } from "@/features/approvals/store";
import { viewAsStore } from "@/features/platform/viewAsSession";
import { jobsStore } from "@/features/jobs/store";

const STORES = [memberStore, walletStore, schemeStore, riskStore, giftsStore, commsStore, opsStore, analyticsStore, approvalStore, viewAsStore, jobsStore];
let tick = 0;
const subscribe = (fn: () => void) => {
  const offs = STORES.map((s) => s.subscribe(() => { tick++; fn(); }));
  return () => offs.forEach((o) => { o(); });
};
/** Re-renders when any shared demo store changes, so step detection is live. */
const useDemoTick = () => useSyncExternalStore(subscribe, () => tick, () => tick);

/**
 * Presenter guidance for the loaded scenario: a collapsible panel over the working screens. Steps are
 * detected from the shared demo state; viewing steps are ticked by the presenter.
 */
export function ScenarioPanel() {
  useDemoTick();
  const session = useDemoSession();
  const { user, switchIdentity } = useSession();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => rebaseline(), []);
  const p = scenarioProgress();
  if (!p) return null;
  const i = Math.min(session.currentStep, p.steps.length - 1);
  const step = p.steps[i];
  const persona = DEMO_PERSONAS.find((x) => x.key === step.persona);
  return (
    <aside className={`scenario-panel ${session.panelOpen ? "" : "is-collapsed"} ${p.scenario.proposed ? "is-proposed" : ""}`} aria-label="Scenario guidance">
      <button type="button" className="scenario-panel__head" onClick={togglePanel} aria-expanded={session.panelOpen}>
        <span><strong>{p.scenario.id}</strong> {p.scenario.name}{p.scenario.proposed ? " (Proposed / Demo only)" : ""}</span>
        <span className="scenario-panel__count">{p.completed}/{p.steps.length}</span>
        {session.panelOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
      </button>
      {session.panelOpen && (
        <div className="scenario-panel__body">
          <ol className="scenario-panel__steps">
            {p.steps.map((s) => (
              <li key={s.index} className={s.index === i ? "is-current" : ""}>
                <button type="button" onClick={() => setStep(s.index)} className="scenario-panel__step">
                  {s.done ? <CheckCircle2 size={14} className="pos" aria-label="Done" /> : <Circle size={14} aria-label="Not done" />}
                  <span>{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="scenario-panel__guide">
            <p className="small"><strong>Who:</strong> {persona?.label ?? step.persona}{user?.id !== persona?.userId && persona ? <> · <button type="button" className="linkish" onClick={() => switchIdentity(persona.userId)}>Switch to this role</button></> : " (current)"}</p>
            <p className="small"><strong>Why:</strong> {step.why}</p>
            <p className="small"><strong>What changes:</strong> {step.changes}</p>
            <p className="small"><strong>Audit:</strong> {step.audit}</p>
            <p className="small muted">{step.detect ? (step.auto ? "Detected in the shared demo state." : "Completes automatically when the action happens.") : "Viewing step: tick it when shown."}</p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => nav(step.route)}>Go to screen</button>
            {!step.detect && <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleManual(step.index)}>{step.done ? "Untick" : "Mark shown"}</button>}
            <button type="button" className="btn btn--ghost btn--sm" disabled={i === 0} onClick={() => setStep(i - 1)}>Previous</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={i === p.steps.length - 1} onClick={() => setStep(i + 1)}>Next</button>
          </div>
          <p className="small"><strong>Expected outcome:</strong> {p.scenario.expected}</p>
          <div className="btn-row">
            {confirm ? (
              <span className="small">Only demo data in this tab returns to the scenario's starting state. <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = resetScenario(); if (r.ok) window.location.reload(); }}>Confirm reset</button> <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(false)}>Keep data</button></span>
            ) : <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(true)}><RotateCcw size={14} aria-hidden="true" />Reset scenario</button>}
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearScenario}>Close scenario</button>
            <Link to="/governance/demo-centre?tab=scenarios" className="small">Scenario library</Link>
          </div>
        </div>
      )}
    </aside>
  );
}
