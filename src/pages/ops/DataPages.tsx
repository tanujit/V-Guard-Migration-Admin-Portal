import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Copy, Layers, ListChecks, Repeat, Search, ShieldOff, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { TrendChart } from "@/components/charts/Charts";
import { SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { ALERT_TYPE } from "@/config/opsCatalogue";
import { acknowledgeRun, retryJobRun, retryRequest, trace, updateException, type TraceStep } from "@/features/ops/store";
import { hoursBefore } from "@/features/ops/engine";
import { commsStore } from "@/features/comms/store";
import { walletStore } from "@/features/wallet/store";
import type { ExceptionKind, IntegrationException, IntegrationRequest } from "@/types/ops";
import { KpiGrid } from "@/pages/masters/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, OBASE, ReqBadge, RunBadge, SimTag, dt, intLink, memberLink, ms, traceLink, useOpsView, useParam, useRun, userName, type OpsView } from "./shared";

type Run = ReturnType<typeof useRun>["run"];

/* ======================= Message trace ======================= */

export function MessageTracePage() {
  const v = useOpsView();
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") ?? "member") as "member" | "transaction" | "scheme" | "reference";
  const q = params.get("q") ?? "";
  const [draftKind, setDraftKind] = useState<string>(kind);
  const [draft, setDraft] = useState(q);
  const [out, setOut] = useState<{ ok: boolean; errors: string[]; warnings: string[]; steps?: TraceStep[]; requests?: IntegrationRequest[] } | null>(null);
  useEffect(() => {
    setDraft(q);
    setDraftKind(kind);
    setOut(q ? trace(v.uid, kind, q) : null);
    // Trace runs once per search (each trace is audited).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, q]);
  const sample = { member: v.os.sfdcRecords.find((r) => r.memberId)?.memberId ?? "", transaction: v.os.requests.find((r) => r.integrationId === "INT-RZP" && r.businessRef)?.businessRef ?? "", scheme: "", reference: v.os.batches[0]?.id ?? "" };
  return (
    <>
      <SectionTitle title="Message trace" description="Follow one record from the source system through internal processing to the callback and the final result (SOW 11.6). Search by member ID, transaction ID, scheme ID or any request, batch or callback reference" />
      <Panel>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); setParams({ kind: draftKind, q: draft.trim() }); }}>
          <SelectInput label="Search by" value={draftKind} onChange={setDraftKind} options={[{ value: "member", label: "Member ID" }, { value: "transaction", label: "Transaction ID" }, { value: "scheme", label: "Scheme ID" }, { value: "reference", label: "Request, batch or callback reference" }]} />
          <TextField label="Reference" value={draft} onChange={setDraft} hint={sample[draftKind as keyof typeof sample] ? `For example ${sample[draftKind as keyof typeof sample]}` : undefined} />
          <div><button type="submit" className="btn btn--primary btn--sm"><Search size={14} aria-hidden="true" />Trace</button></div>
        </form>
      </Panel>
      {out && !out.ok && <PolicyMessages result={out} />}
      {out?.ok && out.steps && (
        <div className="grid-2 grid-2--wide-left">
          <Panel title={`Trace: ${q}`} subtitle={`${out.steps.length} steps in time order`}>
            {out.steps.length ? (
              <ol className="ops-trace">
                {out.steps.map((s, n) => (
                  <li key={`${s.ref}-${n}`} className={`ops-trace__step ops-trace__step--${s.status}`}>
                    <div className="ops-trace__head"><strong>{s.stage}</strong> <span className="muted small">{dt(s.at)}</span></div>
                    <div className="small">{s.system} · <span className="mono">{s.ref}</span>{s.durationMs != null ? ` · ${ms(s.durationMs)}` : ""}{s.retryCount ? ` · ${s.retryCount} retr${s.retryCount === 1 ? "y" : "ies"}` : ""}</div>
                    <div className="small muted">{s.detail}</div>
                  </li>
                ))}
              </ol>
            ) : <p className="muted small">No steps recorded</p>}
          </Panel>
          <Panel title="Integration requests in this trace" padded={false}>
            <DataTable rows={out.requests ?? []} rowKey={(r) => r.id} caption="Traced requests" searchable={false} columns={[
              { key: "i", header: "Integration", value: (r) => r.integrationId, render: (r) => intLink(v.os, r.integrationId) },
              { key: "op", header: "Operation", value: (r) => r.operation },
              { key: "s", header: "Status", value: (r) => r.status, render: (r) => <ReqBadge s={r.status} /> },
              { key: "t", header: "Trace ID", value: (r) => r.traceId, render: (r) => <span className="mono small">{r.traceId}</span> },
            ]} />
          </Panel>
        </div>
      )}
    </>
  );
}

/* ======================= Data sync monitoring ======================= */

export function DataSyncPage() {
  const v = useOpsView();
  const inv = v.os.batches.filter((b) => b.kind === "invitation_sync").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const hier = v.os.batches.filter((b) => b.kind === "hierarchy_sync").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const syncAlerts = v.os.alerts.filter((a) => a.type === "sync_missed" || a.type === "sync_delayed");
  return (
    <>
      <SectionTitle title="Data sync monitoring" description="Invitation sync from SFDC (approximately hourly today) and the hierarchy syncs from Master Data. Missed and delayed runs raise sync alerts" />
      <Notice tone="warn">The invitation sync target frequency is not confirmed (<DecisionRef id="OP-SYNC1" />). A missed run is shown as missed; it is never back-filled as successful.</Notice>
      <KpiGrid cols={5} items={[
        { id: "r", label: "Invitation runs (24 h)", value: inv.length, desc: "Scheduled hourly", icon: Layers, variant: "primary", onSelect: () => undefined },
        { id: "c", label: "Completed", value: inv.filter((b) => b.status === "completed").length, desc: "All records processed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => undefined },
        { id: "m", label: "Missed", value: inv.filter((b) => b.status === "missed").length, desc: "No run started", icon: XCircle, variant: "status", tone: "negative", onSelect: () => undefined },
        { id: "d", label: "Delayed", value: inv.filter((b) => b.status === "delayed").length, desc: "Started late", icon: Clock, variant: "status", tone: "warning", onSelect: () => undefined },
        { id: "a", label: "Sync alerts", value: syncAlerts.length, desc: "Missed or delayed sync", icon: AlertTriangle, variant: "light", onSelect: () => undefined },
      ]} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Invitation sync, last 24 hours" subtitle="Records received per run">
          <TrendChart data={inv.map((b) => ({ key: b.id, label: b.startedAt.slice(11, 16), succeeded: b.succeeded, failed: b.failed + b.rejected }))} kind="stacked" ariaLabel="Invitation sync records per run" series={[{ key: "succeeded", label: "Succeeded", color: "var(--chart-neutral-1)" }, { key: "failed", label: "Failed or rejected", color: "var(--vg-amber)" }]} />
        </Panel>
        <Panel title="Sync alerts" padded={false}>
          <DataTable rows={syncAlerts} rowKey={(a) => a.id} caption="Sync alerts" searchable={false} columns={[
            { key: "t", header: "Alert", value: (a) => ALERT_TYPE[a.type] },
            { key: "d", header: "Detected", value: (a) => a.detectedAt, render: (a) => <span className="small">{dt(a.detectedAt)}</span> },
            { key: "x", header: "Trigger", value: (a) => a.trigger, render: (a) => <span className="small">{a.trigger}</span> },
            { key: "s", header: "Status", value: (a) => a.status, render: (a) => <RunBadge s={a.status === "closed" || a.status === "resolved" ? "completed" : "pending"} /> },
          ]} />
        </Panel>
      </div>
      <Panel title="Hierarchy and master syncs" padded={false}>
        <DataTable rows={hier} rowKey={(b) => b.id} caption="Hierarchy syncs" searchable={false} columns={[
          { key: "id", header: "Run", value: (b) => b.id, render: (b) => traceLink(b.id) },
          { key: "s", header: "Started", value: (b) => b.startedAt, render: (b) => <span className="small">{dt(b.startedAt)}</span> },
          { key: "t", header: "Records", value: (b) => b.total, align: "right" },
          { key: "ok", header: "Succeeded", value: (b) => b.succeeded, align: "right" },
          { key: "f", header: "Failed", value: (b) => b.failed, align: "right" },
          { key: "st", header: "Status", value: (b) => b.status, render: (b) => <RunBadge s={b.status} /> },
          { key: "src", header: "Source", value: (b) => b.source, render: (b) => <span className="small">{b.source}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Jobs and queues ======================= */

export function JobsQueuesPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "jobs");
  const [reason, setReason] = useState("");
  const exec = v.can("integrations:execute");
  const runs = v.os.jobs.flatMap((j) => j.runs.map((r) => ({ j, r }))).sort((a, b) => b.r.scheduledFor.localeCompare(a.r.scheduledFor));
  return (
    <>
      <SectionTitle title="Jobs & queues" description="Scheduled, polling, callback and batch jobs, and the message queues between the platform and connected systems. Queue names are aliases: the production queue and dead-letter design is not assumed" />
      <PolicyMessages result={result} />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: "jobs", label: "Jobs", count: v.os.jobs.length }, { id: "runs", label: "Job runs", count: runs.length }, { id: "queues", label: "Queues", count: v.os.queues.length }]} />
      {tab === "jobs" && (
        <Panel padded={false}>
          <DataTable rows={v.os.jobs} rowKey={(j) => j.id} caption="Jobs" exportName="jobs" columns={[
            { key: "n", header: "Job", value: (j) => j.name, render: (j) => <span><strong>{j.name}</strong><br /><span className="mono small muted">{j.id}</span></span> },
            { key: "i", header: "Integration", value: (j) => j.integrationId, render: (j) => intLink(v.os, j.integrationId) },
            { key: "t", header: "Type", value: (j) => j.type.replace("_", " ") },
            { key: "f", header: "Frequency", value: (j) => j.frequency, render: (j) => <span className="small">{j.frequency} {j.frequencyStatus === "business_confirmation_required" && <BcrTag>Not confirmed</BcrTag>}</span> },
            { key: "r", header: "Runs", value: (j) => j.runs.length, align: "right" },
            { key: "fl", header: "Failed or missed", value: (j) => j.runs.filter((r) => r.status === "failed" || r.status === "missed").length, align: "right" },
            { key: "l", header: "Latest", value: (j) => j.runs[j.runs.length - 1]?.status ?? "", render: (j) => (j.runs.length ? <RunBadge s={j.runs[j.runs.length - 1].status} /> : "—") },
            { key: "s", header: "Source", value: (j) => j.source, render: (j) => <span className="small">{j.source}</span> },
          ]} />
        </Panel>
      )}
      {tab === "runs" && (
        <>
          {exec && <Panel><TextField label="Reason for retry or acknowledgement" value={reason} onChange={setReason} hint="Required. Retries go through the mock backend scheduler; each run can be retried once" /></Panel>}
          <Panel padded={false}>
            <DataTable rows={runs} rowKey={(x) => x.r.id} caption="Job runs" exportName="job-runs" columns={[
              { key: "id", header: "Run", value: (x) => x.r.id, render: (x) => <span className="mono small">{x.r.id}</span> },
              { key: "j", header: "Job", value: (x) => x.j.name },
              { key: "s", header: "Scheduled", value: (x) => x.r.scheduledFor, render: (x) => <span className="small">{dt(x.r.scheduledFor)}</span> },
              { key: "st", header: "Started", value: (x) => x.r.startedAt ?? "", render: (x) => <span className="small">{dt(x.r.startedAt)}</span> },
              { key: "c", header: "Completed", value: (x) => x.r.completedAt ?? "", render: (x) => <span className="small">{dt(x.r.completedAt)}</span> },
              { key: "rc", header: "Received", value: (x) => x.r.received, align: "right" },
              { key: "p", header: "Processed", value: (x) => x.r.processed, align: "right" },
              { key: "f", header: "Failed", value: (x) => x.r.failed, align: "right" },
              { key: "sk", header: "Skipped", value: (x) => x.r.skipped, align: "right" },
              { key: "ss", header: "Status", value: (x) => x.r.status, render: (x) => <RunBadge s={x.r.status} /> },
              { key: "e", header: "Error", value: (x) => x.r.error ?? "", render: (x) => <span className="small">{x.r.error ?? (x.r.retries.length ? `Retried: ${x.r.retries.join(", ")}` : "—")}</span> },
              { key: "a", header: "", value: () => "", noSearch: true, render: (x) => (exec && (x.r.status === "failed" || x.r.status === "missed") && !x.r.retries.length ? (
                <span className="btn-row">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); run(retryJobRun(v.uid, x.r.id, reason), "Job re-run recorded"); }}>Retry</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); run(acknowledgeRun(v.uid, x.r.id, reason), "Failure acknowledged"); }}>Acknowledge</button>
                </span>
              ) : null) },
            ]} />
          </Panel>
        </>
      )}
      {tab === "queues" && (
        <>
          <Notice tone="info">Queue figures are simulated by the mock telemetry adapter <SimTag />. Dead-letter counts are shown as Not configured because the dead-letter architecture is not confirmed. Queued records can be neither deleted nor purged from the portal.</Notice>
          <Panel padded={false}>
            <DataTable rows={v.os.queues} rowKey={(q) => q.id} caption="Queues" searchable={false} columns={[
              { key: "a", header: "Queue (alias)", value: (q) => q.alias },
              { key: "i", header: "Integration", value: (q) => q.integrationId, render: (q) => intLink(v.os, q.integrationId) },
              { key: "p", header: "Pending", value: (q) => q.pending, align: "right" },
              { key: "pr", header: "Processing", value: (q) => q.processing, align: "right" },
              { key: "l", header: "Lag", value: (q) => q.lagSeconds, render: (q) => `${q.lagSeconds} s`, align: "right" },
              { key: "o", header: "Oldest message", value: (q) => q.oldestAgeSeconds, render: (q) => `${q.oldestAgeSeconds} s`, align: "right" },
              { key: "r", header: "Rate", value: (q) => q.ratePerMin, render: (q) => `${q.ratePerMin}/min`, align: "right" },
              { key: "d", header: "Dead letter", value: (q) => q.deadLetter ?? -1, render: (q) => (q.deadLetter == null ? <span className="muted small">Not configured</span> : q.deadLetter) },
              { key: "c", header: "Consumer", value: (q) => q.consumer, render: (q) => <RunBadge s={q.consumer === "healthy" ? "completed" : q.consumer === "degraded" ? "delayed" : "pending"} /> },
            ]} />
          </Panel>
          <div className="grid-3">
            {v.os.queues.map((q) => (
              <Panel key={q.id} title={q.alias} subtitle="Pending messages, last 24 hours">
                <TrendChart data={q.series.map((p) => ({ key: p.at, label: p.at.slice(11, 16), pending: p.pending }))} kind="area" height={160} legend={false} ariaLabel={`${q.alias} pending messages`} series={[{ key: "pending", label: "Pending", color: "var(--vg-amber)" }]} />
              </Panel>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ======================= Errors and failures ======================= */

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  member_not_synced: "Member invited but not synced",
  mobile_already_registered: "Mobile number already registered",
  mobile_mismatch: "Mobile number mismatch (SFDC vs Rishta)",
  pan_gst_in_use: "PAN or GST already in use",
  other_programme: "Member belongs to another programme",
  blank_name: "Blank member name",
  duplicate_bank: "Duplicate bank account",
};

export function FailuresPage() {
  const v = useOpsView();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useParam("tab", "requests");
  const [cat, setCat] = useState("");
  const failed = v.os.requests.filter((r) => (r.status === "failed" || r.status === "timeout") && (!cat || r.errorCategory === cat)).sort((a, b) => b.at.localeCompare(a.at));
  const all = v.os.requests.filter((r) => r.status === "failed" || r.status === "timeout");
  const cats = [...new Set(all.map((r) => r.errorCategory ?? "uncategorised"))];
  const kindFilter = params.get("kind");
  const ex = v.os.exceptions.filter((x) => !kindFilter || x.kind === kindFilter);
  return (
    <>
      <SectionTitle title="Errors & failures" description="Failed and timed-out requests by integration and error category, and the integration exceptions named in SOW 11.5" />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: "requests", label: "Failed requests", count: all.length }, { id: "exceptions", label: "Integration exceptions", count: v.os.exceptions.filter((x) => x.status !== "resolved").length }]} />
      {tab === "requests" ? (
        <>
          <div className="grid-2">
            <Panel title="Failures by error category"><RankedBars items={cats.map((c) => ({ key: c, label: c.replace(/_/g, " "), value: all.filter((r) => (r.errorCategory ?? "uncategorised") === c).length }))} highlightKey={cat || undefined} onSelect={(x) => setCat(cat === x.key ? "" : x.key)} /></Panel>
            <Panel title="Failures by integration"><RankedBars items={v.os.integrations.map((i) => ({ key: i.id, label: i.name, value: all.filter((r) => r.integrationId === i.id).length })).filter((x) => x.value)} onSelect={(x) => nav(`${OBASE}/directory/${x.key}`)} /></Panel>
          </div>
          {cat && <Notice tone="info">Filtered to {cat.replace(/_/g, " ")}. <button type="button" className="link-btn" onClick={() => setCat("")}>Clear</button></Notice>}
          <Panel padded={false}>
            <DataTable rows={failed} rowKey={(r) => r.id} caption="Failed requests" exportName="failed-requests" columns={[
              { key: "id", header: "Request", value: (r) => r.id, render: (r) => traceLink(r.id) },
              { key: "i", header: "Integration", value: (r) => r.integrationId, render: (r) => intLink(v.os, r.integrationId) },
              { key: "op", header: "Operation", value: (r) => r.operation },
              { key: "b", header: "Business reference", value: (r) => r.businessRef, render: (r) => <span className="mono small">{r.businessRef}</span> },
              { key: "m", header: "Member", value: (r) => r.memberId ?? "", render: (r) => memberLink(r.memberId) },
              { key: "at", header: "At", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
              { key: "s", header: "Status", value: (r) => r.status, render: (r) => <ReqBadge s={r.status} /> },
              { key: "c", header: "Category", value: (r) => r.errorCategory ?? "", render: (r) => <span className="small">{r.errorCategory?.replace(/_/g, " ") ?? "—"}</span> },
              { key: "e", header: "Error", value: (r) => r.error ?? "", render: (r) => <span className="small">{r.error ?? "—"}</span> },
              { key: "rt", header: "Retries", value: (r) => r.retryCount, align: "right" },
            ]} />
          </Panel>
        </>
      ) : (
        <ExceptionsView v={v} rows={ex} filtered={!!kindFilter} />
      )}
    </>
  );
}

function ExceptionsView({ v, rows, filtered }: { v: OpsView; rows: IntegrationException[]; filtered: boolean }) {
  const { result, run } = useRun();
  const [sel, setSel] = useState<string | null>(null);
  const x = rows.find((e) => e.id === sel);
  return (
    <>
      {filtered && <Notice tone="info">Filtered by exception type. <Link to={`${OBASE}/failures?tab=exceptions`}>Show all</Link></Notice>}
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title="Integration exceptions" subtitle="SOW 11.5. Resolution rules that are not defined stay open (OP-18, OP-19)">
          <DataTable rows={rows} rowKey={(e) => e.id} caption="Integration exceptions" exportName="integration-exceptions" onRowClick={(e) => setSel(e.id)} columns={[
            { key: "id", header: "Exception", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
            { key: "k", header: "Type", value: (e) => EXCEPTION_LABEL[e.kind] },
            { key: "m", header: "Member", value: (e) => e.memberId ?? "", render: (e) => memberLink(e.memberId) },
            { key: "p", header: "Programme", value: (e) => e.programme ?? "—" },
            { key: "d", header: "Detected", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
            { key: "cb", header: "Callback", value: (e) => e.callbackStatus, render: (e) => <span className="small">{e.callbackStatus.replace(/_/g, " ")}</span> },
            { key: "s", header: "Status", value: (e) => e.status, render: (e) => <RunBadge s={e.status === "resolved" ? "completed" : e.status === "awaiting_source" ? "pending" : "held"} /> },
            { key: "dr", header: "Decision", value: (e) => e.decisionRef ?? "", render: (e) => (e.decisionRef ? <DecisionRef id={e.decisionRef} /> : "—") },
          ]} />
        </Panel>
        {x ? <ExceptionDetail v={v} x={x} run={run} /> : <Panel title="Exception detail"><p className="muted small">Select an exception</p></Panel>}
      </div>
    </>
  );
}

function ExceptionDetail({ v, x, run }: { v: OpsView; x: IntegrationException; run: Run }) {
  const [remarks, setRemarks] = useState("");
  const [ref, setRef] = useState("");
  const edit = v.can("integrations:edit") && x.status !== "resolved";
  return (
    <Panel title={`${x.id} · ${EXCEPTION_LABEL[x.kind]}`} subtitle={`Source ${x.sourceRef}${x.externalRef ? ` · SFDC ${x.externalRef}` : ""}`}>
      <dl className="dl-grid small">
        {Object.entries(x.detail).map(([k, val]) => <Fragment key={k}><dt>{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt><dd>{val ?? "—"}</dd></Fragment>)}
      </dl>
      {edit && (
        <>
          <TextArea label="Remarks" value={remarks} onChange={setRemarks} rows={2} />
          <TextField label="Source confirmation reference" value={ref} onChange={setRef} hint="Needed to resolve: the source system must confirm the correction" />
          <div className="btn-row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(updateException(v.uid, x.id, "awaiting_source", remarks), "Marked awaiting source")}>Awaiting source</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => run(updateException(v.uid, x.id, "resolved", remarks, ref), "Exception resolved")}>Resolve</button>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ======================= Retry and reprocessing ======================= */

export function RetryPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const exec = v.can("integrations:execute");
  const eligible = v.os.requests.filter((r) => (r.status === "failed" || r.status === "timeout") && r.at >= hoursBefore(v.now, 24 * 30)).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <SectionTitle title="Retry & reprocessing" description="Retries are sent to the backend reprocessing contract (mock), never simulated by changing a status on screen. Each record is reprocessed at most once per idempotency key, and the original record is kept" />
      <Notice tone="warn">Financial transactions (RazorPay payouts) are never retried from monitoring: the Wallet & Redemption service must retry them with its own duplicate-prevention checks. Retry and reprocess need Integration monitoring: Execute, which administrators and the Evolve Super Admin do not hold.</Notice>
      <KpiGrid cols={5} items={[
        { id: "e", label: "Failed requests (30 d)", value: eligible.length, desc: `${eligible.filter((r) => r.financial).length} financial`, icon: ListChecks, variant: "primary", onSelect: () => undefined },
        { id: "c", label: "Reprocessed", value: v.os.retries.filter((r) => r.status === "completed").length, desc: "Through the backend contract", icon: Repeat, variant: "status", tone: "positive", onSelect: () => undefined },
        { id: "d", label: "Duplicates prevented", value: v.os.retries.filter((r) => r.status === "refused_duplicate").length, desc: "Same idempotency key", icon: Copy, variant: "light", onSelect: () => undefined },
        { id: "f", label: "Financial retries refused", value: v.os.retries.filter((r) => r.status === "refused_financial").length, desc: "Wallet & Redemption only", icon: ShieldOff, variant: "light", onSelect: () => undefined },
      ]} />
      <PolicyMessages result={result} />
      {exec ? <Panel><TextField label="Reason" value={reason} onChange={setReason} hint="Required for every retry (recorded in the integration audit)" /></Panel> : <Notice tone="info">You can view retries. Retrying needs Integration monitoring: Execute.</Notice>}
      <Panel title="Failed requests" padded={false}>
        <DataTable rows={eligible} rowKey={(r) => r.id} caption="Retry candidates" columns={[
          { key: "id", header: "Request", value: (r) => r.id, render: (r) => traceLink(r.id) },
          { key: "i", header: "Integration", value: (r) => r.integrationId, render: (r) => intLink(v.os, r.integrationId) },
          { key: "op", header: "Operation", value: (r) => r.operation },
          { key: "b", header: "Business reference", value: (r) => r.businessRef, render: (r) => <span className="mono small">{r.businessRef}</span> },
          { key: "at", header: "At", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
          { key: "e", header: "Error", value: (r) => r.error ?? "", render: (r) => <span className="small">{r.error ?? "—"}</span> },
          { key: "f", header: "Financial", value: (r) => (r.financial ? "Yes" : ""), render: (r) => (r.financial ? <StatusBadge tone="warning">Financial</StatusBadge> : null) },
          { key: "a", header: "", value: () => "", noSearch: true, render: (r) => (exec ? <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); run(retryRequest(v.uid, r.id, reason), "Reprocessed through the backend contract"); }}>Retry</button> : null) },
        ]} />
      </Panel>
      <Panel title="Retry history" padded={false}>
        <DataTable rows={[...v.os.retries].reverse()} rowKey={(r) => r.id} caption="Retry history" exportName="retry-history" emptyTitle="No retries recorded" columns={[
          { key: "id", header: "Retry", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "sc", header: "Scope", value: (r) => r.scope.replace("_", " ") },
          { key: "t", header: "Target", value: (r) => r.targetId, render: (r) => traceLink(r.targetId) },
          { key: "i", header: "Integration", value: (r) => r.integrationId, render: (r) => intLink(v.os, r.integrationId) },
          { key: "k", header: "Idempotency key", value: (r) => r.idempotencyKey, render: (r) => <span className="mono small">{r.idempotencyKey}</span> },
          { key: "by", header: "Requested by", value: (r) => userName(v.acc, r.requestedBy) },
          { key: "at", header: "At", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
          { key: "rs", header: "Reason", value: (r) => r.reason, render: (r) => <span className="small">{r.reason}</span> },
          { key: "s", header: "Outcome", value: (r) => r.status, render: (r) => <RunBadge s={r.status === "completed" ? "completed" : r.status === "accepted" ? "pending" : "failed"} /> },
          { key: "res", header: "Result", value: (r) => r.result, render: (r) => <span className="small">{r.result}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Integration reconciliation ======================= */

export function ReconciliationPage() {
  const v = useOpsView();
  const ws = walletStore.get();
  const cs = commsStore.get();
  const rows = [
    { id: "sfdc-members", check: "SFDC invitations → platform members", source: v.os.sfdcRecords.length, platform: v.os.sfdcRecords.filter((r) => r.processing === "synced").length, note: "Pending and rejected records explain the difference", link: `${OBASE}/sfdc` },
    { id: "sfdc-callbacks", check: "Callbacks sent → acknowledged by SFDC", source: v.os.callbacks.length, platform: v.os.callbacks.filter((c) => c.delivery === "acknowledged").length, note: "Response contract open (OP-24)", link: `${OBASE}/sfdc?tab=callbacks` },
    { id: "rzp", check: "Payouts initiated → provider success", source: ws.payouts.length, platform: ws.payouts.filter((p) => p.status === "success").length, note: "In-process and failed payouts are reconciled by Finance", link: `${OBASE}/connections?i=INT-RZP` },
    { id: "rzp-days", check: "Daily payout reconciliation days with a difference", source: v.os.float.snapshots.length, platform: v.os.float.snapshots.filter((s) => s.reconciliation === "matched").length, note: "Finance reconciliation job", link: `${OBASE}/connections?i=INT-RZP` },
    { id: "eseal", check: "eSeal lookups → matching platform SKU and points", source: v.os.eseal.filter((l) => l.eseal).length, platform: v.os.eseal.filter((l) => l.validation === "valid").length, note: "Mismatches are shown for review; neither side is overwritten", link: `${OBASE}/eseal` },
    { id: "comms", check: "WhatsApp and SMS attempts → delivered", source: cs.attempts.filter((a) => a.channel === "whatsapp" || a.channel === "sms").length, platform: v.os.requests.filter((r) => (r.integrationId === "INT-WA" || r.integrationId === "INT-SMS") && r.status === "success").length, note: "Provider delivery reports", link: `${OBASE}/connections?i=INT-WA` },
    { id: "logi", check: "Logistics tracking polls → partner update received", source: v.os.requests.filter((r) => r.integrationId === "INT-LOGI").length, platform: v.os.requests.filter((r) => r.integrationId === "INT-LOGI" && r.status === "success").length, note: "Missing partner updates", link: `${OBASE}/connections?i=INT-LOGI` },
  ];
  return (
    <>
      <SectionTitle title="Integration reconciliation" description="Counts on each side of a connection, from the records the platform holds. A difference is a prompt for review, not an automatic correction" />
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Integration reconciliation" exportName="integration-reconciliation" searchable={false} columns={[
          { key: "c", header: "Check", value: (r) => r.check, render: (r) => <Link to={r.link}>{r.check}</Link> },
          { key: "s", header: "Sent / received", value: (r) => r.source, align: "right" },
          { key: "p", header: "Confirmed", value: (r) => r.platform, align: "right" },
          { key: "d", header: "Difference", value: (r) => r.source - r.platform, align: "right" },
          { key: "st", header: "Status", value: (r) => (r.source === r.platform ? "matched" : "difference"), render: (r) => <RunBadge s={r.source === r.platform ? "completed" : "partial"} /> },
          { key: "n", header: "Note", value: (r) => r.note, render: (r) => <span className="small">{r.note}</span> },
        ]} />
      </Panel>
    </>
  );
}
