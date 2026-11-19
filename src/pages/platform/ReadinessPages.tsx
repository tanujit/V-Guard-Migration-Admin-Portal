import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { acceptanceMatrix, addPilotMember, capacityMatrix, caseResult, checklist, configureUat, gateBlockers, goLiveStatus, integrationTestMatrix, loadScenarioStatus, logDefect, migrationReconciliation, openCritical, performanceMatrix, raiseMigrationExceptions, recordEvidence, recordMeasurement, recordUatExecution, resolveMigrationException, securityMatrix, setMigrationScope, setRollbackPlan, signOffUat, updateChecklistItem, updateDefect, updateGate } from "@/features/platform/store";
import { LOAD_SCENARIOS, PER_HOP, PROGRAMMES } from "@/config/platformCatalogue";
import { TEST_RUN } from "@/data/mock/generated/testRunResults";
import type { Defect, EvidenceRecord, GateStatus, Measurement } from "@/types/platform";
import type { ProgrammeCode } from "@/types/members";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { DecisionRef, EvidenceBadge, Tile, dt, memberLink, usePlatformView, useParam, useRun, userName } from "./shared";

type Run = { script: string; module: string; area: string; passed: number; total: number; gapsConfirmed: number | null; exit: number; failed: readonly string[]; ms: number; found: boolean };
const RUN = TEST_RUN as unknown as { at: string | null; environment: string; buildRef: string; runs: readonly Run[] };
const GATE_STATUSES: GateStatus[] = ["not_started", "in_progress", "pending_evidence", "pending_review", "passed", "failed", "blocked"];
const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x.replace(/_/g, " ") }));

/* ======================= Evidence form (shared) ======================= */

function EvidenceForm({ subjects, kind, onDone }: { subjects: { id: string; label: string }[]; kind: EvidenceRecord["kind"]; onDone?: () => void }) {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [e, setE] = useState({ subject: subjects[0]?.id ?? "", result: "partial" as EvidenceRecord["result"], value: "", environment: "staging", runRef: "", evidence: "" });
  if (!v.can("release-readiness:edit")) return null;
  const set = (k: keyof typeof e) => (x: string) => setE({ ...e, [k]: x });
  return (
    <Panel title="Record evidence" subtitle="Passed needs a staging, load-test or production run. Local, mock and development results are refused as passed">
      <PolicyMessages result={result} />
      <div className="form-grid">
        <SelectInput label="Item" value={e.subject} onChange={set("subject")} options={subjects.map((s) => ({ value: s.id, label: s.label }))} />
        <SelectInput label="Result" value={e.result} onChange={set("result")} options={opts(["passed", "partial", "failed"])} />
        <TextField label="Measured value" value={e.value} onChange={set("value")} />
        <SelectInput label="Environment" value={e.environment} onChange={set("environment")} options={opts(["staging", "load_test", "production", "security_audit", "local_development", "mock"])} />
        <TextField label="Run / report reference" value={e.runRef} onChange={set("runRef")} />
        <TextArea label="Evidence (report location, summary)" value={e.evidence} onChange={set("evidence")} rows={2} />
      </div>
      <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(recordEvidence(v.uid, { ...e, kind }), "Evidence recorded"); if (r.ok) onDone?.(); }}>Record evidence</button>
    </Panel>
  );
}

/* ======================= Performance & capacity ======================= */

export function PerformancePage() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "performance");
  const perf = performanceMatrix();
  const [m, setM] = useState({ targetId: perf[0].id, p95: "", p99: "", timeouts: "", samples: "", window: "", environment: "staging" as Measurement["environment"], runRef: "", evidence: "" });
  const nav = typeof performance !== "undefined" ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined) : undefined;
  const num = (x: string) => (x.trim() === "" ? null : Number(x));
  return (
    <>
      <SectionTitle title="Performance & capacity" description="SOW 14.1 response targets, 14.2 capacity, the 14.6 load tests, 14.4 security controls and 14.5 acceptance criteria. Every status comes from recorded evidence. A fast mock service is not a measurement" />
      <Notice tone="warn">No staging or load-test environment is connected, so every target is <strong>Not tested</strong> or <strong>Pending engineering evidence</strong>. The reference device and per-hop budget are pending <DecisionRef id="OP-PERF1" />; load-test duration and ramp are pending <DecisionRef id="OP-LOAD1" />.</Notice>
      <PolicyMessages result={result} />
      <Tabs label="Readiness evidence" value={tab} onChange={setTab} tabs={[{ id: "performance", label: "Response times" }, { id: "capacity", label: "Capacity & load" }, { id: "security", label: "Security" }, { id: "acceptance", label: "Acceptance criteria" }]} />
      {tab === "performance" && (
        <>
          <div className="ana-tiles">
            <Tile label="SOW targets" value={perf.length} />
            <Tile label="Meets target" value={perf.filter((p) => p.status === "meets_target").length} />
            <Tile label="Not tested" value={perf.filter((p) => p.status === "not_tested").length} />
            <Tile label="Measurements recorded" value={v.ps.measurements.length} />
          </div>
          <Panel padded={false} title="Response time targets (SOW 14.1)" subtitle="p99 and timeout are shown only where the SOW defines them">
            <DataTable rows={perf} rowKey={(p) => p.id} caption="Performance targets" searchable={false} pageSize={15} columns={[
              { key: "r", header: "Request", value: (p) => p.request, render: (p) => <span><strong>{p.request}</strong><br /><span className="mono small muted">{p.id}</span></span> },
              { key: "95", header: "p95 target", value: (p) => p.p95 },
              { key: "99", header: "p99 target", value: (p) => p.p99, render: (p) => (p.p99Ms == null ? <span className="muted small">{p.p99}</span> : p.p99) },
              { key: "t", header: "Timeout", value: (p) => p.timeout, render: (p) => <span className="small">{p.timeout}</span> },
              { key: "f", header: "On failure", value: (p) => p.failure, render: (p) => <span className="small">{p.failure}</span> },
              { key: "m", header: "Latest measurement", value: (p) => p.latest?.p95Ms ?? -1, render: (p) => (p.latest ? <span className="small">p95 {p.latest.p95Ms ?? "—"} ms · p99 {p.latest.p99Ms ?? "—"} ms · {p.latest.samples} samples<br /><span className="muted">{p.latest.environment.replace(/_/g, " ")} · {p.latest.runRef}</span></span> : <span className="muted small">None</span>) },
              { key: "s", header: "Status", value: (p) => p.status, render: (p) => <EvidenceBadge s={p.status} /> },
            ]} />
          </Panel>
          <div className="grid-2">
            {v.can("release-readiness:edit") && (
              <Panel title="Record a measurement">
                <div className="form-grid">
                  <SelectInput label="Request" value={m.targetId} onChange={(x) => setM({ ...m, targetId: x })} options={perf.map((p) => ({ value: p.id, label: `${p.id} ${p.request}` }))} />
                  <SelectInput label="Environment" value={m.environment} onChange={(x) => setM({ ...m, environment: x as Measurement["environment"] })} options={opts(["staging", "load_test", "production", "local_development"])} />
                  <TextField label="p95 (ms)" value={m.p95} onChange={(x) => setM({ ...m, p95: x })} inputMode="numeric" />
                  <TextField label="p99 (ms)" value={m.p99} onChange={(x) => setM({ ...m, p99: x })} inputMode="numeric" />
                  <TextField label="Timeouts" value={m.timeouts} onChange={(x) => setM({ ...m, timeouts: x })} inputMode="numeric" />
                  <TextField label="Samples" value={m.samples} onChange={(x) => setM({ ...m, samples: x })} inputMode="numeric" />
                  <TextField label="Measurement window" value={m.window} onChange={(x) => setM({ ...m, window: x })} />
                  <TextField label="Test run reference" value={m.runRef} onChange={(x) => setM({ ...m, runRef: x })} />
                  <TextArea label="Evidence" value={m.evidence} onChange={(x) => setM({ ...m, evidence: x })} rows={2} />
                </div>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => run(recordMeasurement(v.uid, { targetId: m.targetId, p95Ms: num(m.p95), p99Ms: num(m.p99), timeouts: num(m.timeouts), samples: Number(m.samples || 0), window: m.window, environment: m.environment, runRef: m.runRef, evidence: m.evidence }), "Measurement recorded")}>Record</button>
              </Panel>
            )}
            <Panel title="This portal in this browser (reference only)" subtitle="The admin portal has no SOW response target. This is local page timing, not acceptance evidence">
              {nav ? (
                <dl className="dl-grid small">
                  <dt>Time to first byte</dt><dd>{Math.round(nav.responseStart - nav.startTime)} ms</dd>
                  <dt>DOM content loaded</dt><dd>{Math.round(nav.domContentLoadedEventEnd - nav.startTime)} ms</dd>
                  <dt>Page load complete</dt><dd>{nav.loadEventEnd > 0 ? `${Math.round(nav.loadEventEnd - nav.startTime)} ms` : "Still loading"}</dd>
                  <dt>Transferred</dt><dd>{nav.transferSize ? `${Math.round(nav.transferSize / 1024)} KB` : "From cache"}</dd>
                </dl>
              ) : <p className="muted small">Navigation timing is not available in this browser.</p>}
              <p className="small muted">Per-hop latency budget ({PER_HOP.join(", ")}): not defined in the SOW — pending OP-PERF1.</p>
            </Panel>
          </div>
        </>
      )}
      {tab === "capacity" && (
        <>
          <Panel padded={false} title="Capacity targets (SOW 14.2)">
            <DataTable rows={capacityMatrix()} rowKey={(c) => c.id} caption="Capacity" searchable={false} columns={[
              { key: "m", header: "Metric", value: (c) => c.metric, render: (c) => <span><strong>{c.metric}</strong><br /><span className="mono small muted">{c.id}</span></span> },
              { key: "t", header: "Target", value: (c) => c.target },
              { key: "e", header: "Evidence", value: (c) => c.evidence?.runRef ?? "", render: (c) => (c.evidence ? <span className="small">{c.evidence.value} · {c.evidence.environment} · {c.evidence.runRef}</span> : <span className="muted small">None</span>) },
              { key: "s", header: "Status", value: (c) => c.status, render: (c) => <EvidenceBadge s={c.status} /> },
            ]} />
          </Panel>
          <Panel padded={false} title="Load test scenarios" subtitle="Local or mock data is never evidence of production-scale capacity">
            <DataTable rows={LOAD_SCENARIOS.map((x) => ({ ...x, status: loadScenarioStatus(x.id) }))} rowKey={(x) => x.id} caption="Load tests" searchable={false} columns={[
              { key: "n", header: "Scenario", value: (x) => x.name, render: (x) => <strong>{x.name}</strong> },
              { key: "u", header: "Users", value: (x) => x.users },
              { key: "sc", header: "Scans", value: (x) => x.scans },
              { key: "no", header: "Note", value: (x) => x.note, render: (x) => <span className="small muted">{x.note}</span> },
              { key: "s", header: "Status", value: (x) => x.status, render: (x) => <EvidenceBadge s={x.status} /> },
            ]} />
          </Panel>
          <EvidenceForm kind="capacity" subjects={[...capacityMatrix().map((c) => ({ id: c.id, label: `${c.id} ${c.metric}` })), ...LOAD_SCENARIOS.map((x) => ({ id: x.id, label: x.name }))]} />
        </>
      )}
      {tab === "security" && (
        <>
          <Notice tone="info">Encryption, tokenisation and device binding are enforced by the backend and infrastructure. A frontend can only show masked values; it cannot prove TLS 1.3 or AES-256.</Notice>
          <Panel padded={false} title="Security controls (SOW 14.4)">
            <DataTable rows={securityMatrix()} rowKey={(c) => c.id} caption="Security controls" searchable={false} columns={[
              { key: "r", header: "Requirement", value: (c) => c.requirement, render: (c) => <span><strong>{c.requirement}</strong><br /><span className="mono small muted">{c.id}</span></span> },
              { key: "sp", header: "SOW specification", value: (c) => c.spec },
              { key: "b", header: "Enforced by", value: (c) => c.backend, render: (c) => <span className="small">{c.backend}</span> },
              { key: "f", header: "In this portal", value: (c) => c.frontend, render: (c) => <span className="small">{c.frontend}</span> },
              { key: "s", header: "Status", value: (c) => c.status, render: (c) => <EvidenceBadge s={c.status} /> },
            ]} />
          </Panel>
          <EvidenceForm kind="security" subjects={securityMatrix().map((c) => ({ id: c.id, label: `${c.id} ${c.requirement}` }))} />
        </>
      )}
      {tab === "acceptance" && (
        <>
          <Panel padded={false} title="Acceptance criteria (SOW 14.5)" subtitle="Measured during UAT on the reference device and staging backend">
            <DataTable rows={acceptanceMatrix()} rowKey={(c) => c.id} caption="Acceptance criteria" searchable={false} pageSize={15} columns={[
              { key: "f", header: "Flow", value: (c) => c.flow },
              { key: "r", header: "Criterion", value: (c) => c.requirement, render: (c) => <span><strong>{c.requirement}</strong><br /><span className="mono small muted">{c.id}</span></span> },
              { key: "m", header: "How it is measured", value: (c) => c.method, render: (c) => <span className="small">{c.method}</span> },
              { key: "e", header: "Evidence", value: (c) => c.evidence?.runRef ?? "", render: (c) => (c.evidence ? <span className="small">{c.evidence.value} · {c.evidence.runRef}</span> : <span className="muted small">None</span>) },
              { key: "s", header: "Status", value: (c) => c.status, render: (c) => <EvidenceBadge s={c.status} /> },
            ]} />
          </Panel>
          <EvidenceForm kind="acceptance" subjects={acceptanceMatrix().map((c) => ({ id: c.id, label: `${c.id} ${c.requirement}` }))} />
        </>
      )}
    </>
  );
}

/* ======================= Testing & UAT ======================= */

const REGRESSION = [
  { area: "View-As read-only guard", modules: "All modules (permission service)", check: "Every non-view action refused while a View-As session is open", suite: "test:platform" },
  { area: "Maker-Checker", modules: "Approvals, schemes, wallet, gifts, risk, analytics, themes", check: "Super Admin cannot approve own or bypass the checker", suite: "test:schemes, test:wallet, test:platform" },
  { area: "Masking", modules: "Members, finance reports, audit, View-As", check: "Aadhaar, PAN and bank numbers never complete in UI, state or export", suite: "test:analytics, test:platform" },
  { area: "Wallet buckets", modules: "Wallet, schemes, migration", check: "Available, Scheme, Redeemed and TDS Kitty never merged", suite: "test:wallet, test:platform" },
  { area: "Scope filters", modules: "Members, analytics, usage, View-As", check: "Regional and branch users see only their scope", suite: "test:analytics, test:platform" },
  { area: "Integration failure handling", modules: "Integration monitoring", check: "Timeouts never reported healthy; retries idempotent", suite: "test:ops" },
];
export function TestingPage() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "automated");
  const cycle = v.ps.uat[0];
  const cases = v.ps.uatCases.filter((c) => c.cycleId === cycle.id);
  const [cfg, setCfg] = useState({ plannedStart: cycle.plannedStart ?? "", plannedEnd: cycle.plannedEnd ?? "", businessOwner: cycle.businessOwner ?? "", coordinator: cycle.coordinator ?? "", signOffAuthority: cycle.signOffAuthority ?? "", alloc: Object.fromEntries(PROGRAMMES.map((p) => [p, cycle.allocation[p] == null ? "" : String(cycle.allocation[p])])) as Record<string, string> });
  const [pilot, setPilot] = useState("");
  const [ex, setEx] = useState({ caseId: cases[0]?.id ?? "", actual: "", result: "pass" as "pass" | "fail" | "blocked", defectId: "", evidence: "" });
  const [so, setSo] = useState("");
  const [d, setD] = useState({ module: "", title: "", description: "", severity: "untriaged" as Defect["severity"], source: "UAT" });
  const [du, setDu] = useState<{ id: string; severity: Defect["severity"]; status: Defect["status"]; owner: string; reason: string } | null>(null);
  const totals = RUN.runs.filter((r) => r.script !== "test:schemes:gaps").reduce((n, r) => ({ passed: n.passed + r.passed, total: n.total + r.total }), { passed: 0, total: 0 });
  const it = integrationTestMatrix();
  return (
    <>
      <SectionTitle title="Testing & UAT" description="Automated test results, integration test coverage, the UAT cycle (SOW 14.6), defects and cross-module regression" />
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Automated tests passing" value={RUN.at ? `${totals.passed}/${totals.total}` : "Not run"} sub={RUN.at ? `Run ${dt(RUN.at)}` : "npm run report:tests"} />
        <Tile label="UAT cases passed" value={`${cases.filter((c) => caseResult(c) === "pass").length}/${cases.length}`} />
        <Tile label="Open P0 / P1 defects" value={openCritical().length} tone={openCritical().length ? "warn" : undefined} />
        <Tile label="Untriaged defects" value={v.ps.defects.filter((x) => x.severity === "untriaged" && x.status === "open").length} />
        <Tile label="UAT sign-off" value={cycle.signOff.status === "signed" ? "Signed" : "Not signed"} />
      </div>
      <Tabs label="Testing sections" value={tab} onChange={setTab} tabs={[{ id: "automated", label: "Automated tests" }, { id: "integration", label: "Integration tests" }, { id: "uat", label: "UAT" }, { id: "defects", label: "Defects", count: v.ps.defects.length }, { id: "regression", label: "Regression" }]} />
      {tab === "automated" && (
        <Panel padded={false} title="Automated test suites" subtitle={RUN.at ? `${RUN.environment} · ${RUN.buildRef} · ${dt(RUN.at)}. Unit and service tests against development stores; not UAT evidence` : "No recorded run. Run npm run report:tests to record results"}>
          <DataTable rows={[...RUN.runs]} rowKey={(r) => r.script} caption="Test suites" searchable={false} emptyTitle="No recorded run" columns={[
            { key: "m", header: "Module", value: (r) => r.module, render: (r) => <span><strong>{r.module}</strong><br /><span className="small muted">{r.area}</span></span> },
            { key: "s", header: "Script", value: (r) => r.script, render: (r) => <span className="mono small">npm run {r.script}</span> },
            { key: "p", header: "Result", value: (r) => r.passed, render: (r) => (r.gapsConfirmed != null ? <span>{r.gapsConfirmed} of {r.total} known gaps still present</span> : <span>{r.passed}/{r.total} passed</span>), align: "right" },
            { key: "t", header: "Time", value: (r) => r.ms, render: (r) => `${(r.ms / 1000).toFixed(1)} s`, align: "right" },
            { key: "st", header: "Status", value: (r) => r.exit, render: (r) => (r.gapsConfirmed != null ? <StatusBadge tone="warning">Known gaps</StatusBadge> : r.found && r.exit === 0 && r.passed === r.total ? <StatusBadge tone="positive">Passing</StatusBadge> : <StatusBadge tone="negative">{r.found ? "Failures" : "Not run"}</StatusBadge>) },
            { key: "f", header: "Failed tests", value: (r) => r.failed.length, render: (r) => <span className="small">{r.failed.join("; ") || "—"}</span> },
          ]} />
        </Panel>
      )}
      {tab === "integration" && (
        <>
          <Notice tone="info">Mock adapter coverage shows the portal handles each case. Passing an integration test needs the provider's sandbox or staging.</Notice>
          <Panel padded={false} title="Integration test matrix" subtitle="SFDC, eSeal, DigiLocker, payment gateway and WhatsApp × 8 scenarios">
            <DataTable rows={it} rowKey={(x) => x.id} caption="Integration tests" pageSize={16} columns={[
              { key: "i", header: "Integration", value: (x) => x.integration },
              { key: "s", header: "Scenario", value: (x) => x.scenario },
              { key: "e", header: "Expected", value: (x) => x.expected, render: (x) => <span className="small">{x.expected}</span> },
              { key: "m", header: "Mock coverage", value: (x) => x.mockCovered ?? "", render: (x) => <span className="small muted">{x.mockCovered ?? "—"}</span> },
              { key: "st", header: "Status", value: (x) => x.status, render: (x) => <EvidenceBadge s={x.status} /> },
            ]} />
          </Panel>
          <EvidenceForm kind="integration_test" subjects={it.map((x) => ({ id: x.id, label: `${x.integration} · ${x.scenario}` }))} />
        </>
      )}
      {tab === "uat" && (
        <>
          <Notice tone="warn">Participants, pilot members, allocation, window and sign-off authority are pending <DecisionRef id="OP-UAT1" />. Values here are a draft plan. Sign-off is refused while OP-UAT1 is open, any case is not passed, any P0 / P1 is open, or a programme has no pilot member.</Notice>
          <div className="grid-2">
            <Panel title={`${cycle.name} · ${cycle.environment}`}>
              <div className="form-grid">
                <TextField label="Planned start" type="date" value={cfg.plannedStart} onChange={(x) => setCfg({ ...cfg, plannedStart: x })} />
                <TextField label="Planned end" type="date" value={cfg.plannedEnd} onChange={(x) => setCfg({ ...cfg, plannedEnd: x })} />
                <TextField label="Business owner" value={cfg.businessOwner} onChange={(x) => setCfg({ ...cfg, businessOwner: x })} />
                <TextField label="UAT coordinator" value={cfg.coordinator} onChange={(x) => setCfg({ ...cfg, coordinator: x })} />
                <TextField label="Sign-off authority" value={cfg.signOffAuthority} onChange={(x) => setCfg({ ...cfg, signOffAuthority: x })} />
                {PROGRAMMES.map((p) => <TextField key={p} label={`${p} pilot allocation`} value={cfg.alloc[p]} onChange={(x) => setCfg({ ...cfg, alloc: { ...cfg.alloc, [p]: x } })} inputMode="numeric" hint="Not set in the SOW" />)}
              </div>
              {v.can("release-readiness:edit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(configureUat(v.uid, cycle.id, { plannedStart: cfg.plannedStart || null, plannedEnd: cfg.plannedEnd || null, businessOwner: cfg.businessOwner || null, coordinator: cfg.coordinator || null, signOffAuthority: cfg.signOffAuthority || null, allocation: Object.fromEntries(PROGRAMMES.map((p) => [p, cfg.alloc[p] === "" ? null : Number(cfg.alloc[p])])) as Record<ProgrammeCode, number | null> }), "UAT plan saved")}>Save draft plan</button>}
            </Panel>
            <Panel title="Pilot members" subtitle={`${cycle.pilotMembers.length} proposed · the SOW plans about 20`}>
              <DataTable rows={cycle.pilotMembers} rowKey={(p) => p.memberId} caption="Pilot members" searchable={false} emptyTitle="No pilot members yet" columns={[{ key: "m", header: "Member", value: (p) => p.memberId, render: (p) => memberLink(p.memberId) }, { key: "p", header: "Programme", value: (p) => p.programme }, { key: "s", header: "Status", value: (p) => p.status }]} />
              {v.can("release-readiness:edit") && <div className="form-grid"><TextField label="Member ID" value={pilot} onChange={setPilot} /><div><button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(addPilotMember(v.uid, cycle.id, pilot.trim()), "Pilot member proposed"); if (r.ok) setPilot(""); }}>Add</button></div></div>}
            </Panel>
          </div>
          <Panel padded={false} title="UAT test cases" subtitle="14 SOW areas, a main journey and a programme variant each">
            <DataTable rows={cases} rowKey={(c) => c.id} caption="UAT cases" pageSize={14} columns={[
              { key: "id", header: "Case", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
              { key: "a", header: "Area", value: (c) => c.area },
              { key: "s", header: "Scenario", value: (c) => c.scenario, render: (c) => <span className="small">{c.scenario}</span> },
              { key: "p", header: "Programme", value: (c) => c.programme },
              { key: "x", header: "Executions", value: (c) => c.executions.length, align: "right" },
              { key: "r", header: "Latest result", value: (c) => caseResult(c), render: (c) => <StatusBadge tone={caseResult(c) === "pass" ? "positive" : caseResult(c) === "fail" ? "negative" : caseResult(c) === "blocked" ? "warning" : "neutral"}>{caseResult(c).replace("_", " ")}</StatusBadge> },
            ]} />
          </Panel>
          <div className="grid-2">
            {v.can("release-readiness:edit") && (
              <Panel title="Record an execution">
                <div className="form-grid">
                  <SelectInput label="Case" value={ex.caseId} onChange={(x) => setEx({ ...ex, caseId: x })} options={cases.map((c) => ({ value: c.id, label: `${c.id} ${c.scenario}` }))} />
                  <SelectInput label="Result" value={ex.result} onChange={(x) => setEx({ ...ex, result: x as typeof ex.result })} options={opts(["pass", "fail", "blocked"])} />
                  <TextField label="Defect (required for a fail)" value={ex.defectId} onChange={(x) => setEx({ ...ex, defectId: x })} />
                  <TextArea label="Actual result" value={ex.actual} onChange={(x) => setEx({ ...ex, actual: x })} rows={2} />
                  <TextField label="Evidence" value={ex.evidence} onChange={(x) => setEx({ ...ex, evidence: x })} />
                </div>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => { const prev = cases.find((c) => c.id === ex.caseId)?.executions.slice(-1)[0]; run(recordUatExecution(v.uid, ex.caseId, { actual: ex.actual, result: ex.result, defectId: ex.defectId.trim() || null, evidence: ex.evidence, retestOf: prev && prev.result !== "pass" ? prev.id : null }), "Execution recorded"); }}>Record</button>
              </Panel>
            )}
            <Panel title="UAT sign-off" subtitle={cycle.signOff.status === "signed" ? `Signed ${dt(cycle.signOff.at)} by ${userName(v.acc, cycle.signOff.by ?? "")}` : "Not signed"}>
              <TextArea label="Sign-off comments" value={so} onChange={setSo} rows={2} />
              <button type="button" className="btn btn--primary btn--sm" disabled={!v.can("release-readiness:approve")} onClick={() => run(signOffUat(v.uid, cycle.id, so), "UAT signed off")}>Sign off UAT</button>
            </Panel>
          </div>
        </>
      )}
      {tab === "defects" && (
        <>
          <Panel padded={false} title="Defect register" subtitle="Downgrading a P0 / P1 needs approval authority and is recorded; a defect closes only after a passed retest">
            <DataTable rows={v.ps.defects} rowKey={(x) => x.id} caption="Defects" onRowClick={(x) => setDu({ id: x.id, severity: x.severity, status: x.status, owner: x.owner ?? "", reason: "" })} columns={[
              { key: "id", header: "Defect", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
              { key: "t", header: "Title", value: (x) => x.title, render: (x) => <span><strong>{x.title}</strong><br /><span className="small muted">{x.module} · {x.source}</span></span> },
              { key: "sv", header: "Severity", value: (x) => x.severity, render: (x) => <StatusBadge tone={x.severity === "P0" || x.severity === "P1" ? "negative" : x.severity === "untriaged" ? "warning" : "neutral"}>{x.severity}</StatusBadge> },
              { key: "s", header: "Status", value: (x) => x.status, render: (x) => <span className="small">{x.status.replace(/_/g, " ")}</span> },
              { key: "o", header: "Owner", value: (x) => x.owner ?? "", render: (x) => x.owner ?? <span className="muted small">Unassigned</span> },
              { key: "h", header: "Last change", value: (x) => x.history.slice(-1)[0]?.at ?? "", render: (x) => <span className="small">{x.history.slice(-1)[0]?.change ?? "—"}</span> },
            ]} />
          </Panel>
          <div className="grid-2">
            {du && v.can("release-readiness:edit") && (
              <Panel title={`Update ${du.id}`}>
                <div className="form-grid">
                  <SelectInput label="Severity" value={du.severity} onChange={(x) => setDu({ ...du, severity: x as Defect["severity"] })} options={opts(["P0", "P1", "P2", "P3", "untriaged"])} />
                  <SelectInput label="Status" value={du.status} onChange={(x) => setDu({ ...du, status: x as Defect["status"] })} options={opts(["open", "in_progress", "fixed", "retest_passed", "retest_failed", "closed", "deferred"])} />
                  <TextField label="Owner" value={du.owner} onChange={(x) => setDu({ ...du, owner: x })} />
                  <TextArea label="Reason for the change" value={du.reason} onChange={(x) => setDu({ ...du, reason: x })} rows={2} />
                </div>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => { const cur = v.ps.defects.find((x) => x.id === du.id)!; const p: Parameters<typeof updateDefect>[2] = {}; if (du.severity !== cur.severity) p.severity = du.severity; if (du.status !== cur.status) p.status = du.status; if ((du.owner || null) !== cur.owner) p.owner = du.owner || null; const r = run(updateDefect(v.uid, du.id, p, du.reason), "Defect updated"); if (r.ok) setDu(null); }}>Save</button>
              </Panel>
            )}
            {v.can("release-readiness:edit") && (
              <Panel title="Log a defect">
                <div className="form-grid">
                  <TextField label="Module" value={d.module} onChange={(x) => setD({ ...d, module: x })} />
                  <TextField label="Title" value={d.title} onChange={(x) => setD({ ...d, title: x })} />
                  <SelectInput label="Severity" value={d.severity} onChange={(x) => setD({ ...d, severity: x as Defect["severity"] })} options={opts(["untriaged", "P0", "P1", "P2", "P3"])} />
                  <SelectInput label="Found in" value={d.source} onChange={(x) => setD({ ...d, source: x })} options={opts(["UAT", "Automated test", "Regression", "Code review", "Production"])} />
                  <TextArea label="Description" value={d.description} onChange={(x) => setD({ ...d, description: x })} rows={2} />
                </div>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(logDefect(v.uid, d), "Defect logged"); if (r.ok) setD({ ...d, title: "", description: "" }); }}>Log defect</button>
              </Panel>
            )}
          </div>
        </>
      )}
      {tab === "regression" && (
        <Panel padded={false} title="Cross-module regression" subtitle="Platform rules that cut across modules, and the suites that check them">
          <DataTable rows={REGRESSION.map((r) => ({ ...r, ok: r.suite.split(", ").every((s) => { const x = RUN.runs.find((y) => y.script === s); return x && x.exit === 0 && x.passed === x.total; }) }))} rowKey={(r) => r.area} caption="Regression" searchable={false} columns={[
            { key: "a", header: "Rule", value: (r) => r.area, render: (r) => <strong>{r.area}</strong> },
            { key: "m", header: "Modules", value: (r) => r.modules, render: (r) => <span className="small">{r.modules}</span> },
            { key: "c", header: "Check", value: (r) => r.check, render: (r) => <span className="small">{r.check}</span> },
            { key: "s", header: "Suites", value: (r) => r.suite, render: (r) => <span className="mono small">{r.suite}</span> },
            { key: "st", header: "Last run", value: (r) => (r.ok ? 1 : 0), render: (r) => (RUN.at ? <StatusBadge tone={r.ok ? "positive" : "negative"}>{r.ok ? "Passing" : "Failing or not run"}</StatusBadge> : <StatusBadge tone="neutral">Not run</StatusBadge>) },
          ]} />
        </Panel>
      )}
    </>
  );
}

/* ======================= Data migration ======================= */

export function MigrationPage() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "reconciliation");
  const r = useMemo(() => migrationReconciliation(), [v.ps]); // eslint-disable-line react-hooks/exhaustive-deps
  const [res, setRes] = useState<{ id: string; status: "investigating" | "resolved" | "accepted"; evidence: string; owner: string } | null>(null);
  const exs = v.ps.migrationExceptions;
  return (
    <>
      <SectionTitle title="Data migration readiness" description="Scope, reconciliation and exceptions for moving existing members, wallets, TDS Kitty and history (SOW 14.8). Nothing here migrates data — that runs through the backend migration tooling" />
      <Notice tone="warn">The legacy source is not connected. Reconciliation compares this build's data with a <strong>development test snapshot</strong> carrying labelled test differences, to prove the checks work. Scope and owners are pending <DecisionRef id="OP-MIG1" />.</Notice>
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Members matched" value={`${r.members.matched}/${r.members.sourceCount}`} sub={`${r.members.missing} missing · ${r.members.duplicates} duplicate · ${r.members.failed} mapping`} />
        <Tile label="Wallet buckets matched" value={`${r.wallets.matched}/${r.wallets.rows.length}`} sub="Available, Scheme, Redeemed separately" />
        <Tile label="TDS Kitty matched" value={`${r.kitty.matched}/${r.kitty.rows.length}`} sub="Per member and financial year" />
        <Tile label="Scans matched" value={`${r.scans.matched}/${r.scans.source}`} sub={`${r.scans.missing.length} missing`} />
        <Tile label="Redemptions matched" value={`${r.redemptions.matched}/${r.redemptions.source}`} sub={`${r.redemptions.duplicates} duplicate`} />
        <Tile label="Open exceptions" value={exs.filter((x) => x.status === "open" || x.status === "investigating").length} tone="warn" />
      </div>
      <Tabs label="Migration sections" value={tab} onChange={setTab} tabs={[{ id: "reconciliation", label: "Reconciliation" }, { id: "exceptions", label: "Exceptions", count: exs.length }, { id: "scope", label: "Scope" }, { id: "cutover", label: "Cutover checklist" }]} />
      {tab === "reconciliation" && (
        <>
          <Panel padded={false} title="Member reconciliation" subtitle={`${r.source.label} vs ${r.target.label}`}>
            <DataTable rows={r.members.rows.filter((x) => x.issues.length)} rowKey={(x) => `${x.source.sourceRef}-${x.issues.join()}`} caption="Member differences" searchable={false} emptyTitle="All members matched" columns={[
              { key: "s", header: "Source reference", value: (x) => x.source.sourceRef, render: (x) => <span className="mono small">{x.source.sourceRef}</span> },
              { key: "t", header: "Target member", value: (x) => x.target?.targetId ?? "", render: (x) => memberLink(x.target?.targetId ?? null) },
              { key: "i", header: "Issues", value: (x) => x.issues.join(", "), render: (x) => <span className="small">{x.issues.map((i) => i.replace(/_/g, " ")).join(", ")}</span> },
              { key: "b", header: "Branch (source → target)", value: (x) => x.source.branchCode, render: (x) => <span className="small mono">{x.source.branchCode} → {x.target?.branchCode ?? "—"}</span> },
            ]} />
          </Panel>
          <div className="grid-2">
            <Panel padded={false} title="Wallet differences" subtitle="Each bucket compared on its own">
              <DataTable rows={r.wallets.differences} rowKey={(x) => `${x.memberId}-${x.bucket}`} caption="Wallet differences" searchable={false} emptyTitle="No differences" columns={[{ key: "m", header: "Member", value: (x) => x.memberId, render: (x) => memberLink(x.memberId) }, { key: "b", header: "Bucket", value: (x) => x.bucket }, { key: "s", header: "Source", value: (x) => x.source, align: "right" }, { key: "t", header: "Target", value: (x) => x.target ?? -1, render: (x) => x.target ?? "Missing", align: "right" }, { key: "d", header: "Difference", value: (x) => x.difference ?? 0, render: (x) => x.difference ?? "—", align: "right" }]} />
            </Panel>
            <Panel padded={false} title="TDS Kitty differences" subtitle="Kitty is neither Available points nor TDS paid">
              <DataTable rows={r.kitty.differences} rowKey={(x) => `${x.memberId}-${x.fy}`} caption="Kitty differences" searchable={false} emptyTitle="No differences" columns={[{ key: "m", header: "Member", value: (x) => x.memberId, render: (x) => memberLink(x.memberId) }, { key: "fy", header: "FY", value: (x) => x.fy }, { key: "s", header: "Source", value: (x) => x.kitty, align: "right" }, { key: "t", header: "Target", value: (x) => x.target ?? -1, render: (x) => x.target ?? "Missing", align: "right" }]} />
            </Panel>
          </div>
          {v.can("release-readiness:edit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(raiseMigrationExceptions(v.uid), "Exceptions raised")}>Raise exceptions for differences</button>}
        </>
      )}
      {tab === "exceptions" && (
        <>
          <Panel padded={false} title="Migration exceptions" subtitle="Closed with evidence of the cause. Target data is never changed to force a match">
            <DataTable rows={exs} rowKey={(x) => x.id} caption="Migration exceptions" emptyTitle="No exceptions raised yet" onRowClick={(x) => x.status !== "resolved" && x.status !== "accepted" && setRes({ id: x.id, status: "investigating", evidence: x.evidence ?? "", owner: x.owner ?? "" })} columns={[
              { key: "id", header: "Exception", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
              { key: "k", header: "Kind", value: (x) => x.kind, render: (x) => <span className="small">{x.kind.replace(/_/g, " ")}</span> },
              { key: "s", header: "Source", value: (x) => x.sourceRef, render: (x) => <span className="mono small">{x.sourceRef}</span> },
              { key: "d", header: "Difference", value: (x) => x.difference, render: (x) => <span className="small">{x.difference}</span> },
              { key: "o", header: "Owner", value: (x) => x.owner ?? "", render: (x) => x.owner ?? <span className="muted small">Unassigned</span> },
              { key: "st", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "open" ? "warning" : x.status === "investigating" ? "info" : "positive"}>{x.status}</StatusBadge> },
              { key: "e", header: "Evidence", value: (x) => x.evidence ?? "", render: (x) => <span className="small">{x.evidence ?? "—"}</span> },
            ]} />
          </Panel>
          {res && v.can("release-readiness:edit") && (
            <Panel title={`Work on ${res.id}`}>
              <div className="form-grid">
                <SelectInput label="Status" value={res.status} onChange={(x) => setRes({ ...res, status: x as typeof res.status })} options={opts(["investigating", "resolved", "accepted"])} />
                <TextField label="Owner" value={res.owner} onChange={(x) => setRes({ ...res, owner: x })} />
                <TextArea label="Evidence (cause and how it was fixed at source, or why the difference is accepted)" value={res.evidence} onChange={(x) => setRes({ ...res, evidence: x })} rows={2} />
              </div>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => { const x = run(resolveMigrationException(v.uid, res.id, res.status, res.evidence, res.owner || undefined), "Exception updated"); if (x.ok) setRes(null); }}>Save</button>
            </Panel>
          )}
        </>
      )}
      {tab === "scope" && (
        <Panel title="Migration scope" subtitle={`Status: ${v.ps.migrationScope.status.replace(/_/g, " ")}`}>
          <DataTable rows={PROGRAMMES.map((p) => ({ p, s: v.ps.migrationScope.programmes[p] }))} rowKey={(x) => x.p} caption="Programme scope" searchable={false} columns={[
            { key: "p", header: "Programme", value: (x) => x.p },
            { key: "s", header: "Scope", value: (x) => x.s, render: (x) => (v.can("release-readiness:edit") ? <SelectInput label={`${x.p} scope`} value={x.s} onChange={(val) => run(setMigrationScope(v.uid, x.p, val as "included"), "Scope recorded")} options={opts(["pending_confirmation", "included", "excluded"])} /> : x.s.replace(/_/g, " ")) },
          ]} />
          <p className="small muted">Member volumes per programme are not stated in the SOW and are not estimated here.</p>
        </Panel>
      )}
      {tab === "cutover" && <ChecklistPanel group="cutover" title="Cutover checklist" />}
    </>
  );
}

function ChecklistPanel({ group, title }: { group: "cutover" | "release"; title: string }) {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [sel, setSel] = useState<{ id: string; status: GateStatus; evidence: string } | null>(null);
  const items = checklist(group);
  return (
    <>
      <PolicyMessages result={result} />
      <Panel padded={false} title={title}>
        <DataTable rows={items} rowKey={(x) => x.id} caption={title} searchable={false} pageSize={15} onRowClick={(x) => setSel({ id: x.id, status: x.status, evidence: x.evidence ?? "" })} columns={[
          { key: "i", header: "Item", value: (x) => x.item, render: (x) => <span><strong>{x.item}</strong><br /><span className="mono small muted">{x.id}</span></span> },
          { key: "o", header: "Owner", value: (x) => x.owner },
          { key: "s", header: "Status", value: (x) => x.status, render: (x) => <EvidenceBadge s={x.status} /> },
          { key: "e", header: "Evidence", value: (x) => x.evidence ?? "", render: (x) => <span className="small">{x.evidence ?? "—"}</span> },
          { key: "u", header: "Updated", value: (x) => x.updatedAt ?? "", render: (x) => <span className="small">{x.updatedAt ? `${dt(x.updatedAt)} · ${userName(v.acc, x.updatedBy ?? "")}` : "—"}</span> },
        ]} />
      </Panel>
      {sel && v.can("release-readiness:edit") && (
        <Panel title={`Update ${sel.id}`}>
          <div className="form-grid">
            <SelectInput label="Status" value={sel.status} onChange={(x) => setSel({ ...sel, status: x as GateStatus })} options={opts(GATE_STATUSES)} />
            <TextArea label="Evidence" value={sel.evidence} onChange={(x) => setSel({ ...sel, evidence: x })} rows={2} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updateChecklistItem(v.uid, sel.id, sel.status, sel.evidence), "Checklist updated"); if (r.ok) setSel(null); }}>Save</button>
        </Panel>
      )}
    </>
  );
}

/* ======================= Go-live gates ======================= */

const GO_LIVE_LABEL = { not_ready: "Not ready", in_progress: "In progress", blocked: "Blocked", ready_for_formal_approval: "Ready for formal approval" } as const;
export function GoLivePage() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [sel, setSel] = useState<{ id: string; status: GateStatus; evidence: string; signOffRef: string; remarks: string } | null>(null);
  const status = goLiveStatus();
  const blockers = Object.fromEntries(gateBlockers().map((b) => [b.id, b.blocker]));
  return (
    <>
      <SectionTitle title="Go-live checklist" description="The eight SOW 14.7 gates. A gate passes only with evidence, a sign-off reference and approval authority, and only when its precondition holds. Passing every gate makes the release ready for formal approval — it does not deploy anything" />
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Go-live status" value={GO_LIVE_LABEL[status]} tone={status === "blocked" ? "warn" : undefined} />
        <Tile label="Gates passed" value={`${v.ps.gates.filter((g) => g.status === "passed").length}/${v.ps.gates.length}`} />
        <Tile label="Gates with blockers" value={Object.values(blockers).filter(Boolean).length} tone="warn" />
      </div>
      <Panel padded={false} title="Go-live gates (SOW 14.7)">
        <DataTable rows={v.ps.gates} rowKey={(g) => g.id} caption="Go-live gates" searchable={false} onRowClick={(g) => setSel({ id: g.id, status: g.status, evidence: "", signOffRef: g.signOffRef ?? "", remarks: g.remarks })} columns={[
          { key: "c", header: "Gate", value: (g) => g.check, render: (g) => <span><strong>{g.check}</strong><br /><span className="mono small muted">{g.id}</span></span> },
          { key: "o", header: "Owner", value: (g) => g.owner, render: (g) => <span className="small">{g.owner}{g.supporting ? ` (with ${g.supporting})` : ""}</span> },
          { key: "re", header: "Required evidence", value: (g) => g.requiredEvidence, render: (g) => <span className="small">{g.requiredEvidence}</span> },
          { key: "b", header: "Blocker", value: (g) => blockers[g.id] ?? "", render: (g) => (blockers[g.id] ? <span className="small text-warning">{blockers[g.id]}</span> : <span className="muted small">None detected</span>) },
          { key: "e", header: "Evidence / sign-off", value: (g) => g.evidence.length, render: (g) => <span className="small">{g.evidence.slice(-1)[0] ?? "—"}{g.signOffRef ? ` · ${g.signOffRef}` : ""}</span> },
          { key: "s", header: "Status", value: (g) => g.status, render: (g) => <EvidenceBadge s={g.status} /> },
        ]} />
      </Panel>
      {sel && v.can("release-readiness:edit") && (
        <Panel title={`Update ${sel.id}`}>
          <div className="form-grid">
            <SelectInput label="Status" value={sel.status} onChange={(x) => setSel({ ...sel, status: x as GateStatus })} options={opts(GATE_STATUSES)} />
            <TextField label="Sign-off reference" value={sel.signOffRef} onChange={(x) => setSel({ ...sel, signOffRef: x })} />
            <TextArea label="Evidence" value={sel.evidence} onChange={(x) => setSel({ ...sel, evidence: x })} rows={2} />
            <TextArea label="Remarks" value={sel.remarks} onChange={(x) => setSel({ ...sel, remarks: x })} rows={2} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updateGate(v.uid, sel.id, sel.status, { evidence: sel.evidence || undefined, signOffRef: sel.signOffRef || undefined, remarks: sel.remarks }), "Gate updated"); if (r.ok) setSel(null); }}>Save</button>
        </Panel>
      )}
    </>
  );
}

/* ======================= Release & rollback ======================= */

export function ReleasePage() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const rp = v.ps.rollbackPlan;
  const [p, setP] = useState({ documented: rp.documented, expectedRestoration: rp.expectedRestoration ?? "", steps: rp.steps, testedAt: rp.testedAt ?? "", testResult: rp.testResult ?? "" });
  return (
    <>
      <SectionTitle title="Release & rollback" description="Release readiness checks (zero-downtime deployment, compatibility, health checks) and the rollback plan that go-live gate GL-05 needs. Production deployment is never triggered from this portal" />
      <PolicyMessages result={result} />
      <ChecklistPanel group="release" title="Release readiness checklist" />
      <Panel title="Rollback plan" subtitle="GL-05 needs a documented plan, the expected restoration time and a passed rollback test">
        <div className="form-grid">
          <SelectInput label="Plan documented" value={p.documented ? "yes" : "no"} onChange={(x) => setP({ ...p, documented: x === "yes" })} options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
          <TextField label="Expected restoration time" value={p.expectedRestoration} onChange={(x) => setP({ ...p, expectedRestoration: x })} hint="Not set in the SOW: record the agreed value" />
          <TextField label="Rollback tested on" type="date" value={p.testedAt} onChange={(x) => setP({ ...p, testedAt: x })} />
          <SelectInput label="Rollback test result" value={p.testResult} onChange={(x) => setP({ ...p, testResult: x })} options={[{ value: "", label: "Not tested" }, { value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }]} />
          <TextArea label="Rollback steps" value={p.steps} onChange={(x) => setP({ ...p, steps: x })} rows={3} />
        </div>
        {v.can("release-readiness:edit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(setRollbackPlan(v.uid, { documented: p.documented, expectedRestoration: p.expectedRestoration || null, steps: p.steps, testedAt: p.testedAt || null, testResult: p.testResult || null }), "Rollback plan saved")}>Save rollback plan</button>}
      </Panel>
      <Panel title="Where this build stands">
        <ul className="small">
          <li>Preview deployments run on Vercel behind sign-in. Production promotion is a manual step outside this portal: see <Link to="/governance/platform/go-live">Go-live checklist</Link>.</li>
          <li>Integrations run on mock adapters. Live connections need the backend contracts listed in Integration Monitoring.</li>
          <li>Session data lives in the browser (sessionStorage) for development only.</li>
        </ul>
      </Panel>
    </>
  );
}
