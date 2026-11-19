import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, RotateCcw, ScanLine, Square } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextField } from "@/components/form/Form";
import { useSession } from "@/context/SessionContext";
import { APP_ENV, DEMO_DATASET, IS_SIMULATION } from "@/config/environment";
import { DEMO_PERSONAS, DEMO_SCENARIOS, personaOf } from "@/config/demoScenarios";
import { useAccessState } from "@/features/access/store";
import { getEffectiveAccess, hasPermission } from "@/features/access/engine";
import { useMemberState } from "@/features/members/store";
import { useWalletState, simulateMemberRedemption } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import { schemeStore } from "@/features/schemes/store";
import { useMasterState } from "@/features/masters/store";
import { pointsState } from "@/features/masters/engine";
import { useOpsState, simulateIntegrationEvent, SIM_INTEGRATIONS, type SimOutcome } from "@/features/ops/store";
import { useApprovalState } from "@/features/approvals/store";
import { platformAuditEvents } from "@/features/platform/store";
import { endDemoSession, simClock, startDemoSession, useDemoSession } from "@/features/demo/session";
import { clearScenario, demoOverview, fullReset, hasSnapshot, resetScenario, scenarioProgress, seedInventory, simulateScan, startScenario, type ScanResult } from "@/features/demo/store";
import { formatDateTime } from "@/lib/format";
import { PolicyMessages } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { useParam, useRun } from "@/pages/comms/shared";

const dt = (x: string | null | undefined) => (x ? formatDateTime(x) : "—");
function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div className="ana-tile"><span className="ana-tile__label">{label}</span><span className="ana-tile__value num">{value}</span>{sub && <span className="ana-tile__period">{sub}</span>}</div>;
}

export function DemoCentrePage() {
  const [tab, setTab] = useParam("tab", "overview");
  if (!IS_SIMULATION) {
    return <PageContainer><PageHeader title="Client demo centre" /><Notice tone="warn">This is a production build: simulation controls are not available.</Notice></PageContainer>;
  }
  return (
    <PageContainer>
      <PageHeader variant="hero" eyebrow="Platform administration · Simulation" title="Client demo centre" description="Run the portal as a working simulation: switch roles, follow guided scenarios, simulate scans and integration outcomes, watch the event timeline and reset the demo data. Every module reads the same shared demo records" meta={<span className="muted small">Environment: {APP_ENV} (set by the build, not by the browser) · {DEMO_DATASET}</span>} />
      <Tabs label="Demo centre sections" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview & controls" }, { id: "scenarios", label: "Guided scenarios" }, { id: "roles", label: "Simulated roles" }, { id: "scan", label: "Member app simulator" }, { id: "integrations", label: "Integration outcomes" }, { id: "timeline", label: "Event timeline" }, { id: "inventory", label: "Demo data" }]} />
      <div className="subnav-body">
        {tab === "overview" && <OverviewTab go={setTab} />}
        {tab === "scenarios" && <ScenariosTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "scan" && <ScanTab />}
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "timeline" && <TimelineTab />}
        {tab === "inventory" && <InventoryTab />}
      </div>
    </PageContainer>
  );
}

/* ======================= Overview and controls ======================= */

function ResetControl() {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <Notice tone="warn">
      <strong>Reset all demo data?</strong> Every module's demo records in this browser tab return to the original seeded dataset (members, ledger, schemes, approvals, gifts, communications, fraud, integrations, analytics, View-As and Module 12 prototype). Keys outside the demo dataset and your signed-in identity are kept. Nothing outside this browser is affected.
      <div className="btn-row"><button type="button" className="btn btn--primary btn--sm" onClick={() => { fullReset(); window.location.reload(); }}>Confirm full reset</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(false)}>Cancel</button></div>
    </Notice>
  ) : <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(true)}><RotateCcw size={14} aria-hidden="true" />Reset demo data / restore initial seed</button>;
}

function OverviewTab({ go }: { go: (t: string) => void }) {
  const s = useDemoSession();
  const { user } = useSession();
  useApprovalState(); useMemberState(); useWalletState(); useOpsState();
  const o = demoOverview();
  const p = scenarioProgress();
  const persona = personaOf(user?.id);
  return (
    <>
      <div className="ana-tiles">
        <Tile label="Simulation status" value={s.active ? "Session running" : "Idle"} sub={s.startedAt ? `Since ${dt(s.startedAt)}` : "Start a session to time the demo"} />
        <Tile label="Current scenario" value={p ? p.scenario.id : "None"} sub={p ? `${p.completed}/${p.steps.length} steps · ${p.scenario.name}` : "Load one from the library"} />
        <Tile label="Simulated user" value={persona?.label ?? user?.roles[0]?.label ?? "—"} sub={`${user?.name} · ${user?.organisation.name}`} />
        <Tile label="Active programmes" value={user?.scope.programmes === "all" ? "All" : (user?.scope.programmes as string[] | undefined)?.join(", ") || "None"} sub="From the simulated role's scope" />
        <Tile label="Demo data" value={s.lastResetAt ? "Reset" : "Seeded"} sub={`Last reset ${dt(s.lastResetAt)} · simulation time ${dt(simClock())}`} />
        <Tile label="Seeded members" value={o.members} />
        <Tile label="Transactions" value={o.transactions.toLocaleString("en-IN")} sub="Ledger lines + scheme accruals" />
        <Tile label="Pending approvals" value={o.pendingApprovals} />
        <Tile label="Open exceptions" value={o.openExceptions} sub="Integration, fraud and finance" />
        <Tile label="Simulated integration events" value={o.integrationEvents} />
        <Tile label="Completed workflows" value={o.completedWorkflows} sub="Approved and executed requests" />
      </div>
      <Panel title="Simulation controls">
        <div className="btn-row">
          {s.active ? <button type="button" className="btn btn--ghost btn--sm" onClick={endDemoSession}><Square size={14} aria-hidden="true" />End demo session</button> : <button type="button" className="btn btn--primary btn--sm" onClick={startDemoSession}><Play size={14} aria-hidden="true" />Start demo session</button>}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("scenarios")}>Load scenario</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!s.scenarioId} onClick={clearScenario}>Clear current scenario</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("roles")}>Switch simulated role</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("timeline")}>System event timeline</button>
          <Link to="/wallet/ledger" className="btn btn--ghost btn--sm">All simulated transactions</Link>
          <ResetControl />
        </div>
        <p className="small muted">Reset affects only the demo records held in this browser tab. Simulated actions never call SFDC, eSeal, Siebel, RazorPay, DigiLocker, Signzy, WhatsApp, SMS, Google Maps or logistics partners.</p>
      </Panel>
      <Panel padded={false} title="Scenario history">
        <DataTable rows={[...s.history].reverse()} rowKey={(h) => `${h.scenarioId}-${h.startedAt}`} caption="Scenario history" searchable={false} emptyTitle="No scenarios run yet" columns={[{ key: "s", header: "Scenario", value: (h) => h.scenarioId, render: (h) => <span><strong>{h.scenarioId}</strong> <span className="small muted">{DEMO_SCENARIOS.find((x) => x.id === h.scenarioId)?.name}</span></span> }, { key: "st", header: "Started", value: (h) => h.startedAt, render: (h) => <span className="small">{dt(h.startedAt)}</span> }, { key: "e", header: "Ended", value: (h) => h.endedAt ?? "", render: (h) => <span className="small">{h.endedAt ? dt(h.endedAt) : "Running"}</span> }, { key: "c", header: "Steps done", value: (h) => h.completed, render: (h) => `${h.completed}/${h.total}` }, { key: "r", header: "Reset", value: (h) => (h.reset ? 1 : 0), render: (h) => (h.reset ? "Yes" : "—") }]} />
      </Panel>
    </>
  );
}

/* ======================= Scenarios ======================= */

function ScenariosTab() {
  const s = useDemoSession();
  const nav = useNavigate();
  const { result, setResult } = useRun();
  const [open, setOpen] = useState<string | null>(s.scenarioId ?? DEMO_SCENARIOS[0].id);
  const sc = DEMO_SCENARIOS.find((x) => x.id === open)!;
  return (
    <>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title="Scenario library" subtitle="Each scenario is performed interactively on the working screens">
          <DataTable rows={DEMO_SCENARIOS} rowKey={(x) => x.id} caption="Scenarios" searchable={false} pageSize={12} onRowClick={(x) => setOpen(x.id)} columns={[{ key: "id", header: "", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}{x.id === s.scenarioId ? " ●" : ""}</span> }, { key: "n", header: "Scenario", value: (x) => x.name, render: (x) => <span><strong>{x.name}</strong>{x.proposed ? <> <StatusBadge tone="warning">Proposed / Demo only</StatusBadge></> : null}<br /><span className="small muted">{x.modules.join(" · ")}</span></span> }, { key: "p", header: "Programme", value: (x) => x.programme }, { key: "st", header: "Steps", value: (x) => x.steps.length, align: "right" }]} />
        </Panel>
        <Panel title={`${sc.id} · ${sc.name}`} subtitle={sc.purpose}>
          <dl className="dl-grid small"><dt>Programme</dt><dd>{sc.programme}</dd><dt>Starting conditions</dt><dd>{sc.start}</dd><dt>Expected result</dt><dd>{sc.expected}</dd><dt>Related modules</dt><dd>{sc.modules.join(", ")}</dd></dl>
          <ol className="small">{sc.steps.map((st, i) => <li key={i}>{st.title} <span className="muted">— {DEMO_PERSONAS.find((p) => p.key === st.persona)?.label}</span></li>)}</ol>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = startScenario(sc.id); setResult({ ok: r.ok, errors: r.ok ? [] : [r.message], warnings: r.ok ? [r.message] : [] }); if (r.ok) nav(sc.steps[0].route); }}><Play size={14} aria-hidden="true" />Start scenario</button>
            {s.scenarioId === sc.id && hasSnapshot() && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = resetScenario(); if (r.ok) window.location.reload(); }}><RotateCcw size={14} aria-hidden="true" />Reset scenario</button>}
          </div>
          <p className="small muted">Starting a scenario records a snapshot of the current demo state so it can be repeated; the guidance panel then follows you across screens.</p>
        </Panel>
      </div>
    </>
  );
}

/* ======================= Roles ======================= */

function RolesTab() {
  const acc = useAccessState();
  const { user, switchIdentity } = useSession();
  const rows = DEMO_PERSONAS.map((p) => {
    const e = getEffectiveAccess(acc, p.userId);
    const can = (m: string, a: string) => hasPermission(acc, p.userId, m, a as never).allowed;
    return { ...p, name: e.user ? `${e.user.firstName} ${e.user.lastName}` : p.userId, roles: [...new Set(e.sources.filter((s) => s.kind === "role" && s.effective).map((s) => s.title))].join(", "), approve: can("approvals", "approve"), submit: can("wallet", "submit") || can("schemes", "submit"), sensitive: can("members", "view_sensitive"), platform: can("platform-admin", "view") };
  });
  const yes = (b: boolean) => (b ? <StatusBadge tone="positive">Yes</StatusBadge> : <span className="muted small">No</span>);
  return (
    <Panel padded={false} title="Simulated roles" subtitle="Existing development identities with their real roles and scopes. Switching changes navigation, actions, scope, masking and approval authority; audit records the simulated actor">
      <DataTable rows={rows} rowKey={(r) => r.key} caption="Simulated roles" searchable={false} pageSize={12} columns={[
        { key: "l", header: "Simulated role", value: (r) => r.label, render: (r) => <span><strong>{r.label}</strong><br /><span className="small muted">{r.note}</span></span> },
        { key: "u", header: "Identity", value: (r) => r.name, render: (r) => <span className="small">{r.name} ({r.userId})<br /><span className="muted">{r.org}</span></span> },
        { key: "r", header: "Roles", value: (r) => r.roles, render: (r) => <span className="small">{r.roles}</span> },
        { key: "s", header: "Submit (Maker)", value: (r) => (r.submit ? 1 : 0), render: (r) => yes(r.submit) },
        { key: "a", header: "Approve (Checker)", value: (r) => (r.approve ? 1 : 0), render: (r) => yes(r.approve) },
        { key: "v", header: "Unmasked member data", value: (r) => (r.sensitive ? 1 : 0), render: (r) => yes(r.sensitive) },
        { key: "p", header: "Platform admin", value: (r) => (r.platform ? 1 : 0), render: (r) => yes(r.platform) },
        { key: "x", header: "", value: () => "", render: (r) => (user?.id === r.userId ? <StatusBadge tone="info">Current</StatusBadge> : <button type="button" className="btn btn--ghost btn--sm" onClick={() => switchIdentity(r.userId)}>Switch</button>) },
      ]} />
    </Panel>
  );
}

/* ======================= Scan simulator ======================= */

function ScanTab() {
  const ms = useMasterState();
  const mem = useMemberState();
  const ws = useWalletState();
  const enabled = useMemo(() => ms.scanPoints.filter((c) => pointsState(c) === "active").map((c) => ({ c, sku: ms.skus.find((k) => k.id === c.skuId)! })).filter((x) => x.sku && x.sku.status === "active"), [ms]);
  const members = mem.members.filter((m) => ["active_scan", "redemption_kyc_pending", "redemption_enabled", "provisioned"].includes(m.status));
  const [f, setF] = useState({ memberId: members.find((m) => m.programme === "EP")?.id ?? members[0]?.id ?? "", skuId: (enabled.find((x) => (x.c.versions.find((v) => v.status === "active")?.scanOut ?? 0) > 0) ?? enabled[0])?.sku.id ?? "", type: "scan_out" as "scan_in" | "scan_out", gps: "granted" as "granted" | "denied", distance: "20", qr: `QR-DEMO-${Date.now().toString().slice(-8)}` });
  const [res, setRes] = useState<ScanResult | null>(null);
  const [last, setLast] = useState("");
  const m = mem.members.find((x) => x.id === f.memberId);
  const bal = m ? memberBalances(ws, schemeStore.get(), mem, m.id) : null;
  const run = () => { const r = simulateScan({ memberId: f.memberId, skuId: f.skuId, type: f.type, qrRef: f.qr, gps: f.gps, distanceM: f.distance.trim() === "" ? null : Number(f.distance) }); setRes(r); setLast(f.qr); };
  return (
    <>
      <Notice tone="info">Stands in for a member scanning in the app. The scan goes through the real portal services in order: member status and restrictions → product lookup (mock eSeal) → scan-point configuration → geo-validation (Retailer / CS) → QR integrity → wallet ledger (with EP TDS Kitty) → active schemes → scan report. <strong>Simulated: no eSeal or app is involved.</strong></Notice>
      <div className="grid-2">
        <Panel title="Scan">
          <div className="form-grid">
            <SelectInput label="Member" value={f.memberId} onChange={(x) => setF({ ...f, memberId: x })} options={members.slice(0, 120).map((x) => ({ value: x.id, label: `${x.id} · ${x.programme} · ${x.branchCode}` }))} />
            <SelectInput label="Product (SKU with an approved scan-point configuration)" value={f.skuId} onChange={(x) => setF({ ...f, skuId: x })} options={[...enabled.map(({ sku, c }) => ({ value: sku.id, label: `${sku.code} · ${sku.name} (${c.programmes.join("/") || "all"})` })), { value: "SKU-NOT-REAL", label: "Unrecognised QR (invalid product)" }]} />
            <SelectInput label="Scan type" value={f.type} onChange={(x) => setF({ ...f, type: x as "scan_out" })} options={[{ value: "scan_out", label: "Scan-Out" }, { value: "scan_in", label: "Scan-In" }]} />
            <TextField label="QR reference (synthetic)" value={f.qr} onChange={(x) => setF({ ...f, qr: x })} />
            <SelectInput label="GPS" value={f.gps} onChange={(x) => setF({ ...f, gps: x as "granted" })} options={[{ value: "granted", label: "Granted" }, { value: "denied", label: "Denied" }]} />
            <TextField label="Distance from registered location (m)" value={f.distance} onChange={(x) => setF({ ...f, distance: x })} inputMode="numeric" hint="Geo-fence applies to Retailer and CS (100 m)" />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" disabled={!f.memberId || !f.skuId} onClick={run}><ScanLine size={14} aria-hidden="true" />Scan</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, qr: `QR-DEMO-${Date.now().toString().slice(-8)}` })}>New QR</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={!last} onClick={() => setF({ ...f, qr: last })}>Reuse last QR (duplicate)</button>
          </div>
          {m && bal && <p className="small">Wallet {m.id}: <strong>{bal.available.toLocaleString("en-IN")}</strong> available · {bal.tdsKitty.toLocaleString("en-IN")} TDS Kitty · <Link to={`/wallet/member/${m.id}`}>open wallet</Link></p>}
        </Panel>
        <Panel title="Result" subtitle={res ? `${res.scanId} · ${res.accepted ? "Accepted" : "Rejected"}` : "No scan yet"}>
          {res && (
            <>
              <Notice tone={res.accepted ? "info" : "warn"}><strong>Member sees:</strong> {res.message}</Notice>
              <ol className="small scan-steps">{res.steps.map((x, i) => <li key={i} className={x.ok ? "" : "text-warning"}>{x.ok ? "✓" : "✕"} <strong>{x.check}</strong> — {x.detail}</li>)}</ol>
              <p className="small">{res.ledgerRef ? <Link to={`/wallet/ledger/${res.ledgerRef}`}>Ledger line {res.ledgerRef}</Link> : "No ledger line"} · <Link to="/reports/scans">Scan report</Link> · <Link to="/masters/communication/history">N03 in Communication</Link> · <Link to="/governance/fraud/qr">QR integrity</Link></p>
            </>
          )}
        </Panel>
      </div>
      <RedemptionPanel />
    </>
  );
}

function RedemptionPanel() {
  const mem = useMemberState();
  const ws = useWalletState();
  const { result, run } = useRun();
  const eligible = mem.members.filter((m) => m.status === "redemption_enabled");
  const [f, setF] = useState({ memberId: eligible[0]?.id ?? "", method: "upi" as "upi" | "dbt", points: "500" });
  const b = f.memberId ? memberBalances(ws, schemeStore.get(), mem, f.memberId) : null;
  const mine = ws.redemptions.filter((r) => r.origin === "mock_service" && r.id && ws.payouts.some((p) => p.redemptionId === r.id && p.id.startsWith("PAY-SIM"))).slice(-5).reverse();
  return (
    <Panel title="Redemption (member app)" subtitle="SIMULATED FINANCIAL TRANSACTION — no actual payment will be made">
      <PolicyMessages result={result} />
      <div className="form-grid">
        <SelectInput label="Member (redemption enabled)" value={f.memberId} onChange={(x) => setF({ ...f, memberId: x })} options={mem.members.slice(0, 150).map((m) => ({ value: m.id, label: `${m.id} · ${m.programme} · ${m.status.replace(/_/g, " ")}` }))} />
        <SelectInput label="Method" value={f.method} onChange={(x) => setF({ ...f, method: x as "upi" })} options={[{ value: "upi", label: "UPI" }, { value: "dbt", label: "Bank transfer (DBT)" }]} />
        <TextField label="Points" value={f.points} onChange={(x) => setF({ ...f, points: x })} inputMode="numeric" />
      </div>
      {b && <p className="small">Available {b.available.toLocaleString("en-IN")} points · GST-locked {b.gstLocked.toLocaleString("en-IN")}</p>}
      <button type="button" className="btn btn--primary btn--sm" onClick={() => run(simulateMemberRedemption(f.memberId, f.method, Number(f.points)), "Redemption submitted (simulated)")}>Submit redemption</button>
      {mine.length > 0 && <ul className="small">{mine.map((r) => <li key={r.id}><Link to={`/redemption/request/${r.id}`}>{r.id}</Link> · {r.points} points · {r.stage.replace(/_/g, " ")} · payout {ws.payouts.find((p) => p.redemptionId === r.id)?.status}</li>)}</ul>}
      <p className="small muted">Simulate the payout result on <Link to="/redemption/payouts">Redemption → Payouts</Link>; a failed payout is reversed by the configured automatic reversal (FD-05).</p>
    </Panel>
  );
}

/* ======================= Integration outcomes ======================= */

const OUTCOMES: { value: SimOutcome; label: string }[] = [{ value: "success", label: "Success" }, { value: "validation_error", label: "Validation error" }, { value: "timeout", label: "Timeout" }, { value: "provider_failure", label: "Provider failure" }, { value: "duplicate_callback", label: "Duplicate callback" }];
function IntegrationsTab() {
  const os = useOpsState();
  const { user } = useSession();
  const { result, run } = useRun();
  const [f, setF] = useState({ id: "INT-SFDC", outcome: "validation_error" as SimOutcome, ref: "" });
  const sims = os.requests.filter((r) => r.source.startsWith("Client Demo")).slice(-15).reverse();
  return (
    <>
      <Notice tone="info">Presenter controls for the ten SOW integrations. Each produces one request on the mock adapter, visible in Integration monitoring, Failures, Retry and Message trace. <strong>Simulated: no credential is used and nothing external is called.</strong></Notice>
      <PolicyMessages result={result} />
      <Panel title="Simulate an integration event">
        <div className="form-grid">
          <SelectInput label="Integration" value={f.id} onChange={(x) => setF({ ...f, id: x })} options={SIM_INTEGRATIONS.map((x) => ({ value: x, label: os.integrations.find((i) => i.id === x)?.name ?? x }))} />
          <SelectInput label="Outcome" value={f.outcome} onChange={(x) => setF({ ...f, outcome: x as SimOutcome })} options={OUTCOMES} />
          <TextField label="Business reference (optional)" value={f.ref} onChange={(x) => setF({ ...f, ref: x })} />
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => run(simulateIntegrationEvent(user!.id, f.id, f.outcome, f.ref), "Simulated event recorded")}>Simulate</button>
      </Panel>
      <Panel padded={false} title="Recent simulated events">
        <DataTable rows={sims} rowKey={(r) => r.id} caption="Simulated integration events" searchable={false} emptyTitle="None yet" columns={[{ key: "id", header: "Request", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> }, { key: "i", header: "Integration", value: (r) => r.integrationId }, { key: "o", header: "Operation", value: (r) => r.operation, render: (r) => <span className="small">{r.operation}</span> }, { key: "s", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "success" ? "positive" : "negative"}>{r.status}</StatusBadge> }, { key: "e", header: "Error", value: (r) => r.error ?? "", render: (r) => <span className="small">{r.error ?? "—"}</span> }, { key: "t", header: "Trace", value: (r) => r.traceId, render: (r) => <Link to={`/monitoring/integrations/trace?q=${r.traceId}`} className="mono small">{r.traceId}</Link> }, { key: "x", header: "", value: () => "", render: (r) => (r.status !== "success" ? <Link to="/monitoring/integrations/retry" className="small">Retry →</Link> : null) }]} />
      </Panel>
    </>
  );
}

/* ======================= Event timeline ======================= */

function TimelineTab() {
  const { user, can } = useSession();
  const session = useDemoSession();
  useApprovalState(); useMemberState(); useWalletState(); useOpsState();
  const [f, setF] = useState({ module: "", actor: "", result: "", member: "", from: "", to: "", show: "session" });
  if (!can("platform-admin:view")) return <Notice tone="warn">The event timeline reads the central audit, which needs Platform administration: View. Switch to the Evolve Super Admin or V-Guard Client Admin persona.</Notice>;
  const all = platformAuditEvents(user!.id);
  const set = (k: keyof typeof f) => (x: string) => setF({ ...f, [k]: x });
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const clock = simClock().slice(0, 16);
  const since = (session.startedAt ?? session.lastResetAt ?? "2026-11-09T14:30").slice(0, 16);
  const rows = all.filter((e) => (f.show === "all" || (e.at.slice(0, 16) >= since && e.at.slice(0, 10) <= clock.slice(0, 10))) && (!f.module || e.module === f.module) && (!f.actor || e.actor === f.actor) && (!f.result || e.result === f.result) && (!f.member || (e.memberRef ?? e.entity).includes(f.member)) && (!f.from || e.at.slice(0, 10) >= f.from) && (!f.to || e.at.slice(0, 10) <= f.to));
  return (
    <>
      <Notice tone="info">Simulated audit events from every module, newest first: the same records as the central audit console. Identifiers are masked. The default view shows events from the demo session start (or last reset) up to the current simulation time; seeded history and future-dated seed records are under All events.</Notice>
      <Panel><div className="form-grid">
        <SelectInput label="Show" value={f.show} onChange={set("show")} options={[{ value: "session", label: "This demo session (since start / reset, simulation day)" }, { value: "all", label: "All events (seed history included)" }]} />
        <SelectInput label="Module" value={f.module} onChange={set("module")} options={[{ value: "", label: "All" }, ...uniq(all.map((e) => e.module)).map((x) => ({ value: x, label: x }))]} />
        <SelectInput label="Simulated user" value={f.actor} onChange={set("actor")} options={[{ value: "", label: "Anyone" }, ...uniq(all.map((e) => e.actor)).map((x) => ({ value: x, label: personaOf(x)?.label ? `${personaOf(x)!.label} (${x})` : x }))]} />
        <SelectInput label="Result" value={f.result} onChange={set("result")} options={[{ value: "", label: "All" }, ...uniq(all.map((e) => e.result)).map((x) => ({ value: x, label: x }))]} />
        <TextField label="Member / entity" value={f.member} onChange={set("member")} />
        <TextField label="From" type="date" value={f.from} onChange={set("from")} />
        <TextField label="To" type="date" value={f.to} onChange={set("to")} />
      </div></Panel>
      <Panel padded={false} title={`${rows.length.toLocaleString("en-IN")} events`}>
        <DataTable rows={rows} rowKey={(e) => `${e.module}-${e.id}`} caption="Simulation event timeline" pageSize={20} columns={[
          { key: "id", header: "Event", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
          { key: "at", header: "Time", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> },
          { key: "u", header: "Simulated user", value: (e) => e.actor, render: (e) => <span className="small">{personaOf(e.actor)?.label ?? e.actor}</span> },
          { key: "m", header: "Module", value: (e) => e.module },
          { key: "a", header: "Action", value: (e) => e.action, render: (e) => <span className="small">{e.action.replace(/_/g, " ")}</span> },
          { key: "en", header: "Entity / transaction", value: (e) => e.entity, render: (e) => <span className="mono small">{e.entity}</span> },
          { key: "c", header: "Previous → new", value: (e) => `${e.before ?? ""}${e.after ?? ""}`, render: (e) => <span className="small">{e.before || e.after ? `${e.before ?? "—"} → ${e.after ?? "—"}` : "—"}</span> },
          { key: "ap", header: "Approval", value: (e) => e.approvalRef ?? "", render: (e) => (e.approvalRef ? <Link to={`/governance/approvals/request/${e.approvalRef}`} className="mono small">{e.approvalRef}</Link> : "—") },
          { key: "r", header: "Result", value: (e) => e.result, render: (e) => <StatusBadge tone={e.result === "refused" ? "negative" : "positive"}>{e.result}</StatusBadge> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Demo data and functional audit ======================= */

const AUDIT_ROWS = [
  { area: "All 30+ module areas (Phases 1–14)", status: "Functional — mock service", note: "Every screen reads the shared module stores; actions go through the module services and the central approval engine" },
  { area: "Buttons without a handler", status: "None found", note: "Scanned every page and component; the only handler-less buttons are View-As's intentionally disabled member actions" },
  { area: "Menu links to placeholder pages", status: "Fixed", note: "Scanning, Tickets, Geo, Financial configuration, Content and Audit now open their working screens; Profile & preferences remains planned" },
  { area: "Scan → points pipeline", status: "Added (simulation)", note: "Previously each check existed separately; the scan simulator now chains them into one scan that credits the ledger once" },
  { area: "Integration outcomes", status: "Added (simulation)", note: "Presenter can create success / validation / timeout / provider failure / duplicate callback events on the ten SOW adapters" },
  { area: "External integrations", status: "Mock adapters only", note: "No live connection exists; production contracts remain prepared, not connected" },
];
function InventoryTab() {
  useMemberState(); useWalletState(); useOpsState();
  const inv = seedInventory();
  return (
    <>
      <Panel padded={false} title="Seed data inventory" subtitle="Synthetic, internally consistent dataset shared by every module. Names are fictional and identifiers are masked">
        <DataTable rows={inv} rowKey={(r) => r.area} caption="Seed inventory" searchable={false} pageSize={15} columns={[{ key: "a", header: "Area", value: (r) => r.area, render: (r) => <strong>{r.area}</strong> }, { key: "c", header: "Records", value: (r) => r.count, align: "right" }, { key: "d", header: "Detail", value: (r) => r.detail, render: (r) => <span className="small">{r.detail}</span> }]} />
      </Panel>
      <Panel padded={false} title="Functional audit summary" subtitle="Details in docs/PHASE-14A-REPORT.md, section 1">
        <DataTable rows={AUDIT_ROWS} rowKey={(r) => r.area} caption="Functional audit" searchable={false} columns={[{ key: "a", header: "Area", value: (r) => r.area, render: (r) => <strong>{r.area}</strong> }, { key: "s", header: "Status", value: (r) => r.status }, { key: "n", header: "Notes", value: (r) => r.note, render: (r) => <span className="small">{r.note}</span> }]} />
      </Panel>
    </>
  );
}
