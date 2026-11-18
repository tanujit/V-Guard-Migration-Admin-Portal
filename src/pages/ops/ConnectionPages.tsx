import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Inbox, PackageX, RefreshCw, ScanLine, SearchX, Timer, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatList } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { Tabs } from "@/components/form/Form";
import { healthFor, retryCallback, statsFor } from "@/features/ops/store";
import { KpiGrid } from "@/pages/masters/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, DerivedTag, HealthBadge, OBASE, ReqBadge, RunBadge, dt, inr, intLink, memberLink, ms, pct, traceLink, useOpsView, useParam, useRun } from "./shared";

export function SfdcPage() {
  const v = useOpsView();
  const nav = useNavigate();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "records");
  const sf = v.os.integrations.find((i) => i.id === "INT-SFDC")!;
  const recs = v.os.sfdcRecords;
  const cbs = v.os.callbacks;
  const inv = v.os.batches.filter((b) => b.kind === "invitation_sync").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const lastInv = inv[inv.length - 1];
  const exec = v.can("integrations:execute");
  return (
    <>
      <SectionTitle title="SFDC integration" description="Inbound invitations and hierarchy from SFDC, outbound registration results, status updates and GST certificates (SOW 11.2). SFDC owns its own validation (for example the member name); the portal shows what was received and what was sent back" actions={<HealthBadge h={healthFor("INT-SFDC")} />} />
      <Notice tone="warn">The callback response contract and rejection reason codes are not confirmed (<DecisionRef id="OP-24" />). The invitation sync target frequency is not confirmed (<DecisionRef id="OP-SYNC1" />): runs are approximately hourly today and the current setting is <strong>{sf.config.invitationTargetFrequency ?? "not set"}</strong>. A member invited but not yet synced has loyalty switched off until the sync completes; logging out and back in after about an hour is a temporary workaround, not a fix.</Notice>
      <KpiGrid cols={5} items={[
        { id: "r", label: "Inbound records", value: recs.length, desc: "Invitations, retailer and DD records", icon: Inbox, variant: "primary", onSelect: () => setTab("records") },
        { id: "s", label: "Synced", value: recs.filter((r) => r.processing === "synced").length, desc: "Member created and synced", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setTab("records") },
        { id: "p", label: "Invited, not synced", value: recs.filter((r) => r.processing === "pending").length, desc: "Waiting for the next run", icon: Clock, variant: "status", tone: "warning", onSelect: () => nav(`${OBASE}/failures?tab=exceptions&kind=member_not_synced`) },
        { id: "f", label: "Rejected or held", value: recs.filter((r) => r.processing === "failed" || r.processing === "held").length, desc: "Validation or conflict", icon: XCircle, variant: "status", tone: "negative", onSelect: () => setTab("records") },
        { id: "cb", label: "Callbacks not acknowledged", value: cbs.filter((c) => c.delivery !== "acknowledged").length, desc: `${cbs.filter((c) => c.delivery === "failed").length} failed`, icon: AlertTriangle, variant: "light", onSelect: () => setTab("callbacks") },
        { id: "b", label: "Invitation sync runs (24 h)", value: inv.length, desc: `${inv.filter((b) => b.status === "missed").length} missed, ${inv.filter((b) => b.status === "delayed").length} delayed`, icon: RefreshCw, variant: "light", onSelect: () => setTab("batches") },
        { id: "l", label: "Records in last run", value: lastInv?.total ?? 0, desc: lastInv ? `${lastInv.status} · ${dt(lastInv.startedAt)}` : "No run", icon: CalendarClock, variant: "light", onSelect: () => setTab("batches") },
      ]} />
      <PolicyMessages result={result} />
      <Tabs label="SFDC sections" value={tab} onChange={setTab} tabs={[{ id: "records", label: "Inbound records", count: recs.length }, { id: "callbacks", label: "Outbound callbacks", count: cbs.length }, { id: "batches", label: "Sync batches", count: v.os.batches.length }, { id: "codes", label: "Rejection reason codes" }]} />
      {tab === "records" && (
        <Panel padded={false}>
          <DataTable rows={recs} rowKey={(r) => r.id} caption="SFDC inbound records" exportName="sfdc-inbound" columns={[
            { key: "id", header: "Record", value: (r) => r.id, render: (r) => traceLink(r.id) },
            { key: "x", header: "SFDC reference", value: (r) => r.externalRef, render: (r) => <span className="mono small">{r.externalRef}</span> },
            { key: "t", header: "Type", value: (r) => r.recordType.replace("_", " ") },
            { key: "p", header: "Programme", value: (r) => r.programme },
            { key: "m", header: "Member", value: (r) => r.memberId ?? "", render: (r) => memberLink(r.memberId) },
            { key: "at", header: "Received", value: (r) => r.receivedAt, render: (r) => <span className="small">{dt(r.receivedAt)}</span> },
            { key: "b", header: "Batch", value: (r) => r.batchId, render: (r) => <span className="mono small">{r.batchId}</span> },
            { key: "v", header: "Validation", value: (r) => r.validation, render: (r) => <RunBadge s={r.validation === "valid" ? "completed" : r.validation} /> },
            { key: "s", header: "Processing", value: (r) => r.processing, render: (r) => <RunBadge s={r.processing} /> },
            { key: "e", header: "Error", value: (r) => r.error ?? "", render: (r) => <span className="small">{r.error ?? "—"}</span> },
          ]} />
        </Panel>
      )}
      {tab === "callbacks" && (
        <Panel padded={false} title="Callbacks to SFDC" subtitle="Retry goes through the SFDC callback adapter; it never edits the SFDC record directly">
          <DataTable rows={cbs} rowKey={(c) => c.id} caption="SFDC callbacks" exportName="sfdc-callbacks" columns={[
            { key: "id", header: "Callback", value: (c) => c.id, render: (c) => traceLink(c.id) },
            { key: "m", header: "Member", value: (c) => c.memberRef, render: (c) => memberLink(c.memberRef) },
            { key: "k", header: "Kind", value: (c) => c.kind.replace(/_/g, " ") },
            { key: "r", header: "Result sent", value: (c) => c.result },
            { key: "rc", header: "Reason code", value: (c) => c.reasonCode ?? "", render: (c) => (c.reasonCode ? <span className="mono small">{c.reasonCode}</span> : "—") },
            { key: "at", header: "Submitted", value: (c) => c.submittedAt, render: (c) => <span className="small">{dt(c.submittedAt)}</span> },
            { key: "d", header: "Delivery", value: (c) => c.delivery, render: (c) => <RunBadge s={c.delivery} /> },
            { key: "rt", header: "Retries", value: (c) => c.retries.length, align: "right" },
            { key: "e", header: "Last error", value: (c) => c.lastError ?? "", render: (c) => <span className="small">{c.lastError ?? "—"}</span> },
            { key: "a", header: "", value: () => "", noSearch: true, render: (c) => (exec && c.delivery === "failed" ? <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); run(retryCallback(v.uid, c.id, "Retry after SFDC rejection (monitoring)"), "Retry recorded"); }}>Retry</button> : null) },
          ]} />
        </Panel>
      )}
      {tab === "batches" && (
        <Panel padded={false}>
          <DataTable rows={[...v.os.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt))} rowKey={(b) => b.id} caption="Sync batches" exportName="sfdc-batches" columns={[
            { key: "id", header: "Batch", value: (b) => b.id, render: (b) => traceLink(b.id) },
            { key: "k", header: "Kind", value: (b) => b.kind.replace("_", " ") },
            { key: "s", header: "Started", value: (b) => b.startedAt, render: (b) => <span className="small">{dt(b.startedAt)}</span> },
            { key: "c", header: "Completed", value: (b) => b.completedAt ?? "", render: (b) => <span className="small">{dt(b.completedAt)}</span> },
            { key: "t", header: "Records", value: (b) => b.total, align: "right" },
            { key: "ok", header: "Succeeded", value: (b) => b.succeeded, align: "right" },
            { key: "f", header: "Failed", value: (b) => b.failed, align: "right" },
            { key: "rj", header: "Rejected", value: (b) => b.rejected, align: "right" },
            { key: "st", header: "Status", value: (b) => b.status, render: (b) => <RunBadge s={b.status} /> },
            { key: "src", header: "Source", value: (b) => b.source, render: (b) => <span className="small">{b.source}</span> },
          ]} />
        </Panel>
      )}
      {tab === "codes" && (
        <Panel title="Rejection reason codes" subtitle="SOW 11.2 examples only. The production code list is part of the callback contract (OP-24)">
          <StatList items={v.os.config.rejectionCodes.map((c) => ({ label: c.label, value: c.code, note: c.status === "sow_example" ? "SOW example: not a confirmed code" : "Configured" }))} />
        </Panel>
      )}
    </>
  );
}

export function EsealPage() {
  const v = useOpsView();
  const [tab, setTab] = useParam("tab", "lookups");
  const ls = v.os.eseal;
  const found = ls.filter((l) => l.eseal);
  return (
    <>
      <SectionTitle title="eSeal integration" description="QR lookups return SKU, category, sub-category, points, PIN requirement, billed and manufacturing dates (SOW 11.3). The transaction date is the customer-billed date; when it is blank or the item is stock-out, the manufacturing date is used" actions={<HealthBadge h={healthFor("INT-ESEAL")} />} />
      <Notice tone="warn">Parent-child pack mappings are received from eSeal, but the source of the mapping and its use in point calculation are not confirmed (<DecisionRef id="OP-32" label="OP-32 / OP-44" />). Differences between eSeal and the platform are shown for review; neither record is overwritten.</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "QR lookups", value: ls.length, desc: "Latest scan transactions", icon: ScanLine, variant: "primary", onSelect: () => setTab("lookups") },
        { id: "nf", label: "Not found", value: ls.filter((l) => !l.eseal && l.validation === "failed" && !v.os.requests.find((r) => r.id === l.requestId && r.status === "timeout")).length, desc: "eSeal had no record", icon: SearchX, variant: "light", onSelect: () => setTab("lookups") },
        { id: "to", label: "Timeouts", value: ls.filter((l) => v.os.requests.find((r) => r.id === l.requestId)?.status === "timeout").length, desc: "No response", icon: Timer, variant: "status", tone: "warning", onSelect: () => setTab("lookups") },
        { id: "mm", label: "Data mismatches", value: ls.filter((l) => l.validation === "mismatch").length, desc: "eSeal vs platform", icon: AlertTriangle, variant: "status", tone: "warning", onSelect: () => setTab("lookups") },
        { id: "mf", label: "Manufacturing date used", value: found.filter((l) => !l.eseal!.billedDate || l.eseal!.stockOut).length, desc: "Billed blank or stock-out", icon: CalendarClock, variant: "light", onSelect: () => setTab("lookups") },
        { id: "pk", label: "Pack mappings", value: v.os.packs.length, desc: `${v.os.packs.filter((p) => p.status !== "received").length} need review`, icon: PackageX, variant: "light", onSelect: () => setTab("packs") },
      ]} />
      <Tabs label="eSeal sections" value={tab} onChange={setTab} tabs={[{ id: "lookups", label: "QR lookups", count: ls.length }, { id: "packs", label: "Parent-child packs", count: v.os.packs.length }]} />
      {tab === "lookups" ? (
        <Panel padded={false}>
          <DataTable rows={ls} rowKey={(l) => l.id} caption="eSeal lookups" exportName="eseal-lookups" columns={[
            { key: "q", header: "QR (masked)", value: (l) => l.qrMasked, render: (l) => <span className="mono small">{l.qrMasked}</span> },
            { key: "s", header: "Scan", value: (l) => l.scanRef, render: (l) => traceLink(l.scanRef, "transaction") },
            { key: "m", header: "Member", value: (l) => l.memberId ?? "", render: (l) => memberLink(l.memberId) },
            { key: "sku", header: "SKU eSeal / platform", value: (l) => l.eseal?.sku ?? "", render: (l) => <span className={`small mono ${l.eseal && l.eseal.sku !== l.platform.sku ? "text-warning" : ""}`}>{l.eseal?.sku ?? "—"} / {l.platform.sku ?? "—"}</span> },
            { key: "cat", header: "Category", value: (l) => l.eseal?.category ?? "", render: (l) => <span className="small">{l.eseal ? `${l.eseal.category} · ${l.eseal.subCategory}` : "—"}</span> },
            { key: "pts", header: "Points eSeal / platform", value: (l) => l.eseal?.points ?? -1, render: (l) => <span className={`small num ${l.eseal && l.eseal.points !== l.platform.points ? "text-warning" : ""}`}>{l.eseal?.points ?? "—"} / {l.platform.points ?? "—"}</span>, align: "right" },
            { key: "pin", header: "PIN", value: (l) => (l.eseal?.pinRequired == null ? "" : l.eseal.pinRequired ? "Yes" : "No") },
            { key: "bd", header: "Billed date", value: (l) => l.eseal?.billedDate ?? "", render: (l) => <span className="small">{l.eseal ? l.eseal.billedDate ?? "Blank" : "—"}{l.eseal?.stockOut ? " (stock-out)" : ""}</span> },
            { key: "md", header: "Manufacturing date", value: (l) => l.eseal?.manufacturingDate ?? "", render: (l) => <span className="small">{l.eseal?.manufacturingDate ?? "—"}</span> },
            { key: "ed", header: "Transaction date used", value: (l) => l.effectiveDate ?? "", render: (l) => <span className="small" title={l.dateReason}><strong>{l.effectiveDate ?? "—"}</strong><br /><span className="muted">{l.dateReason}</span></span> },
            { key: "v", header: "Validation", value: (l) => l.validation, render: (l) => <StatusBadge tone={l.validation === "valid" ? "positive" : l.validation === "mismatch" ? "warning" : "negative"}>{l.validation}</StatusBadge> },
          ]} />
        </Panel>
      ) : (
        <Panel padded={false} title="Parent-child pack mappings" actions={<BcrTag>OP-32 / OP-44 open</BcrTag>}>
          <DataTable rows={v.os.packs} rowKey={(p) => p.id} caption="Pack mappings" searchable={false} columns={[
            { key: "id", header: "Mapping", value: (p) => p.id },
            { key: "p", header: "Parent SKU", value: (p) => p.parentSku, render: (p) => <span className="mono small">{p.parentSku}</span> },
            { key: "c", header: "Child SKU", value: (p) => p.childSku, render: (p) => <span className="mono small">{p.childSku}</span> },
            { key: "r", header: "Mapping reference", value: (p) => p.ref, render: (p) => <span className="mono small">{p.ref}</span> },
            { key: "s", header: "Source", value: (p) => p.source },
            { key: "l", header: "Last received", value: (p) => p.lastReceived, render: (p) => <span className="small">{dt(p.lastReceived)}</span> },
            { key: "lv", header: "Last validation", value: (p) => p.lastValidation, render: (p) => <span className="small">{dt(p.lastValidation)}</span> },
            { key: "st", header: "Status", value: (p) => p.status, render: (p) => <RunBadge s={p.status === "received" ? "completed" : p.status === "missing_child" ? "failed" : "held"} /> },
          ]} />
        </Panel>
      )}
    </>
  );
}

const OTHER = ["INT-RZP", "INT-DIGI", "INT-SIGNZY", "INT-WA", "INT-SMS", "INT-MAPS", "INT-LOGI", "INT-SIEBEL"];
const DERIVED: Record<string, string> = { "INT-RZP": "Wallet & Redemption payouts", "INT-DIGI": "Registration & KYC documents", "INT-SIGNZY": "Registration & KYC documents", "INT-WA": "Communication Centre attempts", "INT-SMS": "Communication Centre attempts", "INT-MAPS": "Fraud & risk geo checks, member addresses", "INT-LOGI": "Gift & Fulfilment tracking", "INT-SIEBEL": "Mock log lookups" };

export function OtherConnectionsPage() {
  const v = useOpsView();
  const [id, setId] = useParam("i", "INT-RZP");
  const i = v.os.integrations.find((x) => x.id === id) ?? v.os.integrations.find((x) => x.id === "INT-RZP")!;
  const reqs = v.os.requests.filter((r) => r.integrationId === i.id).sort((a, b) => b.at.localeCompare(a.at));
  const s = statsFor(i.id);
  const outage = v.os.changes.filter((c) => c.kind === "vendor_outage" && c.services.some((x) => i.name.includes(x) || x.includes(i.name)));
  return (
    <>
      <SectionTitle title="Other external connections" description="RazorPay, DigiLocker, Signzy, WhatsApp, SMS, Google Maps, logistics and Siebel. Each view shows the monitoring records derived from the module that owns the business data" />
      <Tabs label="Connections" value={i.id} onChange={setId} tabs={OTHER.map((x) => ({ id: x, label: v.os.integrations.find((y) => y.id === x)!.name }))} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title={i.name} subtitle={i.purpose} actions={<HealthBadge h={healthFor(i.id)} />}>
          <dl className="dl-grid small">
            <dt>Source</dt><dd><DerivedTag from={DERIVED[i.id]} /></dd>
            <dt>Requests (7 d)</dt><dd>{s.total} · {s.success} successful · {s.failed} failed</dd>
            <dt>Failure rate</dt><dd>{pct(s.failureRate)}</dd>
            <dt>Average / p95</dt><dd>{ms(s.avgMs)} / {ms(s.p95Ms)}</dd>
            <dt>Last success</dt><dd>{dt(s.lastSuccess)}</dd>
            <dt>Recent error</dt><dd>{s.recentError ?? "—"}</dd>
            <dt>Profile</dt><dd>{intLink(v.os, i.id)}</dd>
          </dl>
          {outage.map((o) => <Notice key={o.id} tone="warn">Vendor outage recorded: {o.title} ({dt(o.at)}{o.endAt ? ` to ${dt(o.endAt)}` : ", ongoing"})</Notice>)}
        </Panel>
        <ConnectionNotes id={i.id} />
      </div>
      {i.id === "INT-RZP" && <RazorPayRecon />}
      <Panel padded={false} title="Requests" subtitle="Masked metadata only">
        <DataTable rows={reqs} rowKey={(r) => r.id} caption={`${i.name} requests`} exportName={`${i.code.toLowerCase()}-requests`} columns={[
          { key: "id", header: "Request", value: (r) => r.id, render: (r) => traceLink(r.id) },
          { key: "op", header: "Operation", value: (r) => r.operation },
          { key: "b", header: "Business reference", value: (r) => r.businessRef, render: (r) => traceLink(r.businessRef, r.messageType === "redemption" ? "transaction" : "reference") },
          { key: "m", header: "Member", value: (r) => r.memberId ?? "", render: (r) => memberLink(r.memberId) },
          { key: "at", header: "Sent", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
          { key: "s", header: "Status", value: (r) => r.status, render: (r) => <ReqBadge s={r.status} /> },
          { key: "d", header: "Duration", value: (r) => r.durationMs ?? -1, render: (r) => ms(r.durationMs), align: "right" },
          { key: "e", header: "Error", value: (r) => r.error ?? "", render: (r) => <span className="small">{r.error ?? "—"}</span> },
          { key: "f", header: "Financial", value: (r) => (r.financial ? "Yes" : ""), render: (r) => (r.financial ? <StatusBadge tone="warning">Financial</StatusBadge> : null) },
        ]} />
      </Panel>
    </>
  );
}

function ConnectionNotes({ id }: { id: string }) {
  const notes: Record<string, string[]> = {
    "INT-RZP": ["Payout status and UTR come from the Phase 7 payout records (UTR masked)", "Financial requests are never retried from monitoring: the Wallet & Redemption service owns idempotent payout retries", "Daily reconciliation runs in the Finance reconciliation job"],
    "INT-DIGI": ["DigiLocker verification results from KYC documents", "Aadhaar numbers are never displayed: masked references only"],
    "INT-SIGNZY": ["PAN, bank and GST verification", "No Signzy request is recorded in the current window, so its health is Unknown rather than Healthy", "Nightly de-duplication job is listed under Jobs & queues"],
    "INT-WA": ["Delivery results come from Communication Centre attempts", "Bot notification failures raise a staff alert"],
    "INT-SMS": ["Delivery results come from Communication Centre attempts", "OTP values are never shown"],
    "INT-MAPS": ["Reverse geocoding for scan geo-fence checks and territory validation of member addresses", "No API key is stored in the portal"],
    "INT-LOGI": ["Tracking polls from gift order tracking events", "Missing partner updates appear as failed polls"],
    "INT-SIEBEL": ["Lookups only; ownership and contract not provided", "Records are mock log entries"],
  };
  return <Panel title="What this view shows"><ul className="activity-list small">{(notes[id] ?? []).map((n) => <li key={n}>{n}</li>)}</ul></Panel>;
}

function RazorPayRecon() {
  const v = useOpsView();
  const job = v.os.jobs.find((j) => j.id === "JOB-RZP-RECON");
  return (
    <div className="grid-2">
      <Panel title="Daily reconciliation" subtitle="Payouts initiated vs provider status (SOW 11.4)" padded={false}>
        <DataTable rows={[...v.os.float.snapshots].reverse()} rowKey={(s) => s.date} caption="Daily payout reconciliation" searchable={false} pageSize={7} columns={[
          { key: "d", header: "Date", value: (s) => s.date },
          { key: "p", header: "Payouts", value: (s) => s.payouts, render: (s) => inr(s.payouts), align: "right" },
          { key: "r", header: "Reconciliation", value: (s) => s.reconciliation, render: (s) => <RunBadge s={s.reconciliation === "matched" ? "completed" : s.reconciliation === "difference" ? "failed" : "pending"} /> },
          { key: "ref", header: "Reference", value: (s) => s.ref, render: (s) => <span className="mono small">{s.ref}</span> },
        ]} />
      </Panel>
      <Panel title="Reconciliation job runs" padded={false}>
        <DataTable rows={job?.runs ?? []} rowKey={(r) => r.id} caption="Reconciliation runs" searchable={false} columns={[
          { key: "id", header: "Run", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "s", header: "Scheduled", value: (r) => r.scheduledFor, render: (r) => <span className="small">{dt(r.scheduledFor)}</span> },
          { key: "p", header: "Processed", value: (r) => r.processed, align: "right" },
          { key: "f", header: "Differences", value: (r) => r.failed, align: "right" },
          { key: "st", header: "Status", value: (r) => r.status, render: (r) => <RunBadge s={r.status} /> },
        ]} />
      </Panel>
    </div>
  );
}
