import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Database, GitCompare, ListX, MapPinned, Network, Play, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextField } from "@/components/form/Form";
import { MISMATCH } from "@/config/riskCatalogue";
import { assignException, awaitConfirmation, confirmCorrection, markReconciled, proposeCorrection, reconImpact, recordSourceFix, remarkException, reprocessException, reprocessMismatch, resolveException, runSyncValidation, startMismatchReview } from "@/features/risk/store";
import type { HierarchyMismatch, ValidationException } from "@/types/risk";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { DecisionRef, dt, useFraudView, useRun, userName, type FraudView } from "./shared";

type Run = ReturnType<typeof useRun>["run"];
const ExBadge = ({ s }: { s: ValidationException["status"] }) => <StatusBadge tone={s === "resolved" ? "positive" : s === "open" ? "warning" : "info"}>{s.replace(/_/g, " ")}</StatusBadge>;

export function DataIntegrityPage() {
  const v = useFraudView();
  const { result, run } = useRun();
  const [sel, setSel] = useState<string | null>(null);
  const ex = v.rs.validationExceptions;
  const open = ex.filter((x) => x.status !== "resolved");
  const x = ex.find((e) => e.id === sel);
  return (
    <>
      <SectionTitle title="Data integrity & reconciliation" description="Mandatory-field validation before synchronisation, de-duplication integrity and a validation exception queue (SOW 9.5). Records are never repaired with guessed values: an exception resolves only after the authoritative source confirms its correction" actions={v.can("fraud-rules:manage") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(runSyncValidation([{ entityId: "SFDC-MOCK-EP-700001", name: "Demo Member A", branchCode: "KL-BR-KOCHI" }, { entityId: "SFDC-MOCK-EP-700002", name: "", branchCode: "KL-BR-KOCHI" }, { entityId: "SFDC-MOCK-CS-700003", name: "Demo Member C", branchCode: "KL-BR-NOWHERE" }]), "Mock sync batch validated")}><Play size={14} aria-hidden="true" />Run mock sync validation</button>} />
      <KpiGrid cols={5} items={[
        { id: "t", label: "Data validation events", value: v.rs.validationBatches.reduce((n, b) => n + b.total, 0), desc: `${v.rs.validationBatches.length} batches`, icon: Database, variant: "primary", onSelect: () => setSel(null) },
        { id: "m", label: "Missing mandatory fields", value: open.filter((e) => e.errorType === "missing_mandatory").length, desc: "Blocked from sync", icon: ListX, variant: "status", tone: "warning", onSelect: () => setSel(open.find((e) => e.errorType === "missing_mandatory")?.id ?? null) },
        { id: "d", label: "Duplicate identity records", value: v.rs.identityMatches.filter((m) => m.status === "open" || m.status === "under_review").length, desc: "Identity registry", icon: Copy, variant: "light", onSelect: () => setSel(null) },
        { id: "s", label: "SFDC sync exceptions", value: open.filter((e) => e.source.startsWith("SFDC")).length, desc: "From SFDC syncs", icon: AlertTriangle, variant: "light", onSelect: () => setSel(null) },
        { id: "dm", label: "District mapping mismatches", value: v.rs.mismatches.filter((m) => m.kind === "district_mismatch" && m.status !== "reconciled").length, desc: "SFDC vs platform", icon: MapPinned, variant: "light", onSelect: () => setSel(null) },
        { id: "bm", label: "Branch mapping mismatches", value: v.rs.mismatches.filter((m) => m.kind === "branch_mismatch" && m.status !== "reconciled").length + open.filter((e) => e.field === "Branch").length, desc: "Incl. branch leakage routes", icon: MapPinned, variant: "light", onSelect: () => setSel(null) },
        { id: "ih", label: "Invalid hierarchy references", value: open.filter((e) => e.errorType === "invalid_reference").length + v.rs.mismatches.filter((m) => m.kind === "invalid_parent" && m.status !== "reconciled").length, desc: "Unknown branch / parent", icon: Network, variant: "light", onSelect: () => setSel(null) },
        { id: "p", label: "Pending reconciliation cases", value: open.length + v.rs.mismatches.filter((m) => m.status !== "reconciled").length, desc: "Exceptions + mismatches", icon: GitCompare, variant: "status", tone: "warning", onSelect: () => setSel(null) },
        { id: "r", label: "Resolved reconciliation cases", value: ex.filter((e) => e.status === "resolved").length + v.rs.mismatches.filter((m) => m.status === "reconciled").length, desc: "Source-confirmed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setSel(null) },
        { id: "f", label: "Failed validation batches", value: v.rs.validationBatches.filter((b) => b.status !== "completed").length, desc: "Partial or failed", icon: XCircle, variant: "status", tone: "negative", onSelect: () => setSel(null) },
      ]} />
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="Mandatory-field validation rules" subtitle="Only fields the SOW or the source data define; no new mandatory member fields are invented" padded={false}>
          <DataTable rows={v.rs.validationRules} rowKey={(r) => r.id} caption="Validation rules" searchable={false} columns={[
            { key: "e", header: "Source entity", value: (r) => r.entity },
            { key: "f", header: "Field", value: (r) => r.field },
            { key: "m", header: "Mandatory", value: (r) => (r.mandatory ? "Yes" : "No") },
            { key: "ref", header: "Rule reference", value: (r) => r.ruleRef, render: (r) => <span className="small">{r.ruleRef}</span> },
            { key: "s", header: "Source system", value: (r) => r.source },
            { key: "c", header: "Errors", value: (r) => r.errorCount, align: "right" },
            { key: "l", header: "Last validation", value: (r) => r.lastValidation ?? "", render: (r) => <span className="small">{dt(r.lastValidation)}</span> },
            { key: "st", header: "Status", value: (r) => r.status },
          ]} />
        </Panel>
        <Panel title="Validation batches" subtitle="Records failing validation are never shown as synced" padded={false}>
          <DataTable rows={v.rs.validationBatches} rowKey={(b) => b.id} caption="Validation batches" searchable={false} columns={[{ key: "id", header: "Batch", value: (b) => b.id }, { key: "at", header: "Run", value: (b) => b.at, render: (b) => <span className="small">{dt(b.at)}</span> }, { key: "s", header: "Source", value: (b) => b.source }, { key: "t", header: "Records", value: (b) => b.total, align: "right" }, { key: "ok", header: "Synced", value: (b) => b.synced, align: "right" }, { key: "f", header: "Failed", value: (b) => b.failed, align: "right" }, { key: "st", header: "Status", value: (b) => b.status, render: (b) => <StatusBadge tone={b.status === "completed" ? "positive" : "warning"}>{b.status}</StatusBadge> }]} />
        </Panel>
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Validation exception queue" padded={false}>
          <DataTable rows={ex} rowKey={(e) => e.id} caption="Validation exceptions" onRowClick={(e) => setSel(e.id)} columns={[
            { key: "id", header: "Exception", value: (e) => e.id },
            { key: "t", header: "Entity type", value: (e) => e.entityType },
            { key: "eid", header: "Entity ID", value: (e) => e.entityId, render: (e) => <span className="mono small">{e.entityId}</span> },
            { key: "s", header: "Source", value: (e) => e.source },
            { key: "f", header: "Field", value: (e) => e.field },
            { key: "v", header: "Submitted value", value: (e) => e.valueMasked, render: (e) => <span className="mono small">{e.valueMasked}</span> },
            { key: "et", header: "Error type", value: (e) => e.errorType.replace(/_/g, " ") },
            { key: "m", header: "Validation message", value: (e) => e.message, render: (e) => <span className="small">{e.message}</span> },
            { key: "d", header: "Detected", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
            { key: "st", header: "Resolution", value: (e) => e.status, render: (e) => <ExBadge s={e.status} /> },
            { key: "o", header: "Owner", value: (e) => e.owner ?? "", render: (e) => (e.owner ? userName(v.acc, e.owner) : "—") },
          ]} />
        </Panel>
        {x ? <ExceptionDetail v={v} x={x} run={run} /> : <Panel title="Exception detail"><p className="muted small">Select an exception</p></Panel>}
      </div>
    </>
  );
}

function ExceptionDetail({ v, x, run }: { v: FraudView; x: ValidationException; run: Run }) {
  const [text, setText] = useState("");
  const [ref, setRef] = useState("");
  const edit = v.can("fraud-rules:edit");
  return (
    <Panel title={`${x.id} · ${x.field}`} subtitle={x.message}>
      <dl className="dl-grid small">
        <dt>Entity</dt><dd>{x.entityType} · <span className="mono">{x.entityId}</span></dd>
        <dt>Source</dt><dd>{x.source}{x.batchId ? ` · ${x.batchId}` : ""}</dd>
        <dt>Status</dt><dd><ExBadge s={x.status} /></dd>
        <dt>Source correction</dt><dd>{x.sourceFix ? `${x.sourceFix.ref} · ${userName(v.acc, x.sourceFix.by)} · ${dt(x.sourceFix.at)}` : "Not confirmed"}</dd>
        <dt>Reprocessing</dt><dd>{x.reprocess.map((r) => `${dt(r.at)} ${r.outcome.replace("_", " ")}`).join("; ") || "—"}</dd>
      </dl>
      <ul className="activity-list">{x.remarks.map((r, k) => <li key={k} className="small">{r.text} <span className="muted">{dt(r.at)} · {userName(v.acc, r.by)}</span></li>)}</ul>
      {edit && x.status !== "resolved" && (
        <>
          <div className="btn-row"><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(assignException(v.uid, x.id, v.uid), "Assigned to you")}>Assign to me</button></div>
          <TextField label="Remark" value={text} onChange={setText} />
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => { if (run(remarkException(v.uid, x.id, text), "Remark added").ok) setText(""); }}>Add remark</button>
          <TextField label="Source correction reference" value={ref} onChange={setRef} hint="From the authoritative system that corrected the record" />
          <div className="btn-row">
            <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(recordSourceFix(v.uid, x.id, ref), "Source correction recorded")}>Record source correction</button>
            <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(reprocessException(v.uid, x.id), "Reprocessed")}>Reprocess</button>
            <button type="button" className="btn btn--primary btn--xs" onClick={() => run(resolveException(v.uid, x.id), "Resolved")}>Mark resolved</button>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ======================= SFDC district / branch reconciliation (OP-64 / OP-20) ======================= */

export function SfdcReconPage() {
  const v = useFraudView();
  const { result, run } = useRun();
  const [sel, setSel] = useState(v.rs.mismatches[0]?.id ?? "");
  const m = v.rs.mismatches.find((x) => x.id === sel);
  const b = v.rs.reconBatches[v.rs.reconBatches.length - 1];
  const mm = v.rs.mismatches;
  const cnt = (k: HierarchyMismatch["kind"][]) => mm.filter((x) => k.includes(x.kind) && x.status !== "reconciled").length;
  return (
    <>
      <SectionTitle title="SFDC hierarchy reconciliation" description="District and branch differences between SFDC and the platform (OP-64 / OP-20). They affect member branch mapping, branch-based scheme eligibility, geo-validation, reporting and access scopes. Neither side is overwritten automatically" />
      <Notice tone="warn">Ownership of corrections, the reconciliation cadence, the cleanup owner and SFDC mandatory name validation are open (<DecisionRef id="OP-64" label="OP-64 / OP-20" />). Each mismatch records the system that owns its correction; it closes only after that correction is confirmed. Development data until SFDC is connected.</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "SFDC hierarchy records", value: b?.total ?? 0, desc: `${b?.id ?? "—"} · ${dt(b?.at)}`, icon: Database, variant: "primary", onSelect: () => undefined },
        { id: "md", label: "Matched districts", value: b?.matchedDistricts ?? 0, desc: "Mock batch", icon: CheckCircle2, variant: "light", onSelect: () => undefined },
        { id: "mb", label: "Matched branches", value: b?.matchedBranches ?? 0, desc: "Mock batch", icon: CheckCircle2, variant: "light", onSelect: () => undefined },
        { id: "dm", label: "District mismatches", value: cnt(["district_mismatch", "invalid_parent"]), desc: "Open", icon: MapPinned, variant: "status", tone: "warning", onSelect: () => setSel(mm.find((x) => x.kind === "district_mismatch")?.id ?? sel) },
        { id: "bm", label: "Branch mismatches", value: cnt(["branch_mismatch", "pincode_mismatch"]), desc: "Open", icon: MapPinned, variant: "status", tone: "warning", onSelect: () => setSel(mm.find((x) => x.kind === "pincode_mismatch")?.id ?? sel) },
        { id: "mp", label: "Missing platform references", value: cnt(["missing_branch", "missing_district"]), desc: "In SFDC only", icon: ListX, variant: "light", onSelect: () => setSel(mm.find((x) => x.kind === "missing_branch")?.id ?? sel) },
        { id: "ms", label: "Missing / stale SFDC references", value: cnt(["stale_reference"]), desc: "In the platform only", icon: ListX, variant: "light", onSelect: () => setSel(mm.find((x) => x.kind === "stale_reference")?.id ?? sel) },
        { id: "du", label: "Duplicate mapping records", value: cnt(["duplicate_source"]), desc: "Same source key", icon: Copy, variant: "light", onSelect: () => setSel(mm.find((x) => x.kind === "duplicate_source")?.id ?? sel) },
        { id: "pc", label: "Pending correction", value: mm.filter((x) => x.status !== "reconciled").length, desc: "Not yet confirmed", icon: GitCompare, variant: "light", onSelect: () => undefined },
        { id: "rc", label: "Reconciled records", value: mm.filter((x) => x.status === "reconciled").length, desc: "Source-confirmed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => undefined },
      ]} />
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Mismatches" padded={false}>
          <DataTable rows={mm} rowKey={(x) => x.id} caption="Hierarchy mismatches" searchable={false} onRowClick={(x) => setSel(x.id)} columns={[
            { key: "id", header: "Mismatch", value: (x) => x.id },
            { key: "k", header: "Category", value: (x) => MISMATCH[x.kind] },
            { key: "r", header: "Record", value: (x) => x.recordCode, render: (x) => <span className="mono small">{x.recordCode}</span> },
            { key: "c", header: "Sync conflict", value: (x) => x.conflictRef ?? "", render: (x) => <span className="mono small">{x.conflictRef ?? "—"}</span> },
            { key: "o", header: "Owning system", value: (x) => x.owningSystem ?? "", render: (x) => <span className="small">{x.owningSystem?.toUpperCase() ?? "Not decided"}</span> },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "reconciled" ? "positive" : x.status === "open" ? "warning" : "info"}>{x.status.replace(/_/g, " ")}</StatusBadge> },
          ]} />
        </Panel>
        {m && <MismatchDetail v={v} m={m} run={run} />}
      </div>
    </>
  );
}

function MismatchDetail({ v, m, run }: { v: FraudView; m: HierarchyMismatch; run: Run }) {
  const [p, setP] = useState({ correction: m.proposedCorrection, owningSystem: (m.owningSystem ?? "sfdc") as "sfdc" | "platform", team: m.responsibleTeam ?? "" });
  const [ref, setRef] = useState("");
  const impact = reconImpact(m.id);
  const rows: { f: keyof HierarchyMismatch["sfdc"]; label: string }[] = [{ f: "state", label: "State" }, { f: "district", label: "District" }, { f: "branch", label: "Branch" }, { f: "pincode", label: "Pincode" }, { f: "sourceRef", label: "Source reference" }];
  const edit = v.can("fraud-rules:edit") || v.can("branches:manage");
  return (
    <Panel title={`${m.id} · ${MISMATCH[m.kind]}`} subtitle={`${m.recordCode} · batch ${m.batchId}`}>
      <table className="table table--compact recon-compare">
        <thead><tr><th>Field</th><th>SFDC value</th><th>Platform value</th><th>Match</th></tr></thead>
        <tbody>{rows.map((r) => { const same = (m.sfdc[r.f] ?? "") === (m.platform[r.f] ?? ""); return <tr key={r.f} className={same ? "" : "row--warn"}><td>{r.label}</td><td className="mono small">{m.sfdc[r.f] ?? "—"}</td><td className="mono small">{m.platform[r.f] ?? "—"}</td><td>{same ? <StatusBadge tone="positive">Match</StatusBadge> : <StatusBadge tone="warning">Mismatch</StatusBadge>}</td></tr>; })}</tbody>
      </table>
      <dl className="dl-grid small">
        <dt>Impacted members</dt><dd>{impact.members.length ? `${impact.members.length}: ${impact.members.slice(0, 6).join(", ")}${impact.members.length > 6 ? "…" : ""}` : "None mapped"}</dd>
        <dt>Branch-based schemes</dt><dd>{impact.schemes.join(", ") || "None"}</dd>
        <dt>Reports / configuration</dt><dd>Branch reports, geo-validation, access scopes on {m.recordCode}</dd>
        <dt>Proposed correction</dt><dd>{m.proposedCorrection || "—"}</dd>
        <dt>Owning system / team</dt><dd>{m.owningSystem ? `${m.owningSystem.toUpperCase()} · ${m.responsibleTeam}` : "Not decided (OP-64 / OP-20)"}</dd>
        <dt>Confirmation</dt><dd>{m.confirmation ? `${m.confirmation.ref} · ${userName(v.acc, m.confirmation.by)} · ${dt(m.confirmation.at)}` : "Not confirmed"}</dd>
        <dt>Platform refresh</dt><dd>{m.reprocess ? `${dt(m.reprocess.at)} · ${m.reprocess.outcome}` : "—"}</dd>
      </dl>
      {edit && m.status !== "reconciled" && (
        <>
          {m.status === "open" && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(startMismatchReview(v.uid, m.id), "Review started")}>Start review</button>}
          <TextField label="Proposed correction" value={p.correction} onChange={(x) => setP({ ...p, correction: x })} />
          <div className="form-row">
            <SelectInput label="System that owns the correction" value={p.owningSystem} onChange={(x) => setP({ ...p, owningSystem: x as "sfdc" })} options={[{ value: "sfdc", label: "SFDC" }, { value: "platform", label: "Platform" }]} />
            <TextField label="Responsible team" value={p.team} onChange={(x) => setP({ ...p, team: x })} />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(proposeCorrection(v.uid, m.id, p), "Correction proposed")}>Record proposal</button>
            <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(awaitConfirmation(v.uid, m.id), "Awaiting confirmation")}>Send to owner for confirmation</button>
          </div>
          <TextField label="Confirmation reference" value={ref} onChange={setRef} />
          <div className="btn-row">
            <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(confirmCorrection(v.uid, m.id, ref), "Correction confirmed")}>Record confirmation</button>
            <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(reprocessMismatch(v.uid, m.id), "Platform mapping refreshed")}>Refresh platform mapping</button>
            <button type="button" className="btn btn--primary btn--xs" onClick={() => run(markReconciled(v.uid, m.id), "Reconciled")}>Close as reconciled</button>
          </div>
        </>
      )}
      <ul className="activity-list">{[...m.history].reverse().map((h, k) => <li key={k} className="small">{h.action.replace(/_/g, " ")} {h.detail} <span className="muted">{dt(h.at)} · {userName(v.acc, h.by)}</span></li>)}</ul>
    </Panel>
  );
}
