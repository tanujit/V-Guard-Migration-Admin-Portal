import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Tabs, TextArea, TextField } from "@/components/form/Form";
import { dpdpRows, platformAudit, updateRiskDecision, type PlatformAuditRow } from "@/features/risk/store";
import type { RiskDecision } from "@/types/risk";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { approvalLink, dt, useFraudView, useParam, useRun, userName, type FraudView } from "./shared";

const CONFIG_ENTITIES = ["anomaly_rule", "global_restriction", "qr_digest", "decision", "device", "geo_fence", "export"];

/* ======================= Configuration history and decisions ======================= */

export function ConfigHistoryPage() {
  const v = useFraudView();
  const { result, run } = useRun();
  const rows = [...v.rs.audit].reverse().filter((e) => CONFIG_ENTITIES.includes(e.entity));
  return (
    <>
      <SectionTitle title="Risk configuration history and open decisions" description="Every threshold, global restriction, digest, device and decision change, with the open business decisions that keep production enforcement disabled. Open items stay listed even after their screens exist" />
      <PolicyMessages result={result} />
      <Panel title="Open business decision register" padded={false}>
        <table className="table">
          <thead><tr><th>Reference</th><th>Open decision</th><th>Impacted functionality</th><th>Decision owner</th><th>Status</th><th>Activation restriction</th><th>Confirmation notes</th></tr></thead>
          <tbody>{v.rs.decisions.map((d) => <DecisionRow key={d.id} v={v} d={d} run={run} />)}</tbody>
        </table>
      </Panel>
      <Panel title={`${rows.length} configuration change(s)`} padded={false}>
        <DataTable rows={rows} rowKey={(e) => e.id} caption="Risk configuration history" pageSize={15} columns={[
          { key: "id", header: "Audit ID", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
          { key: "at", header: "Timestamp", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> },
          { key: "a", header: "Actor", value: (e) => userName(v.acc, e.actor) },
          { key: "t", header: "Entity", value: (e) => e.entity.replace(/_/g, " ") },
          { key: "eid", header: "Reference", value: (e) => e.entityId, render: (e) => <span className="mono small">{e.entityId}</span> },
          { key: "act", header: "Action", value: (e) => e.action.replace(/_/g, " ") },
          { key: "b", header: "Old value", value: (e) => e.before ?? "", render: (e) => <span className="small">{e.before ?? "—"}</span> },
          { key: "af", header: "New value", value: (e) => e.after ?? "", render: (e) => <span className="small">{e.after ?? "—"}</span> },
          { key: "r", header: "Reason", value: (e) => e.reason, render: (e) => <span className="small">{e.reason}</span> },
          { key: "ap", header: "Approval", value: (e) => e.approvalRequestId ?? "", render: (e) => approvalLink(e.approvalRequestId) },
        ]} />
      </Panel>
    </>
  );
}

function DecisionRow({ v, d, run }: { v: FraudView; d: RiskDecision; run: ReturnType<typeof useRun>["run"] }) {
  const [status, setStatus] = useState(d.status);
  const [answer, setAnswer] = useState(d.answer);
  const edit = v.can("fraud-rules:manage");
  return (
    <tr id={d.id}>
      <td className="mono small">{d.ref}</td>
      <td className="small">{d.question}</td>
      <td className="small">{d.impacted}</td>
      <td className="small">{d.owner}</td>
      <td>{edit ? <select className="select select--xs" aria-label={`Status of ${d.ref}`} value={status} onChange={(e) => setStatus(e.target.value as RiskDecision["status"])}>{["open", "under_review", "confirmed", "deferred", "out_of_scope"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select> : <StatusBadge tone={d.status === "confirmed" ? "positive" : "warning"}>{d.status.replace("_", " ")}</StatusBadge>}</td>
      <td className="small">{d.restriction}</td>
      <td>{edit ? <div className="btn-row"><TextArea label="Notes" value={answer} onChange={setAnswer} rows={2} /><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(updateRiskDecision(v.uid, d.id, { status, answer }), "Decision updated")}>Save</button></div> : <span className="small">{d.answer || "—"}</span>}</td>
    </tr>
  );
}

/* ======================= Compliance and audit (9.6, 9.7) ======================= */

export function ComplianceAuditPage() {
  const v = useFraudView();
  const [tab, setTab] = useParam("tab", "dpdp");
  return (
    <>
      <SectionTitle title="Compliance & audit" description="Administrative visibility and evidence for DPDP, Income Tax / 26Q and RBI payout controls, and the read-only platform audit trail (SOW 9.6, 9.7). This is an evidence index, not a certification: enforcement sits in the backend and V-Guard's compliance governance" />
      <Tabs label="Compliance sections" value={tab} onChange={setTab} tabs={[{ id: "dpdp", label: "Data protection" }, { id: "tax", label: "Income Tax / 26Q" }, { id: "rbi", label: "RBI / payouts" }, { id: "evidence", label: "Evidence register", count: v.rs.evidence.length }, { id: "audit", label: "Audit investigation" }]} />
      {tab === "dpdp" && <Dpdp v={v} />}
      {tab === "tax" && <Links v={v} area="Income Tax / 26Q" intro="TDS computation, quarterly statements and 26Q reporting are done in Phase 7. They are not recalculated here." />}
      {tab === "rbi" && <Links v={v} area="RBI / payouts" intro="Payouts on regulated rails, provider references, UTR reconciliation, failed payouts and redemption limits come from Phase 7. No RBI certification is claimed." />}
      {tab === "evidence" && <Evidence v={v} />}
      {tab === "audit" && <AuditInvestigation v={v} />}
    </>
  );
}

function Dpdp({ v }: { v: FraudView }) {
  const rows = dpdpRows().filter((r) => r.memberIds.some((id) => v.canOn("fraud-rules", "view", id)));
  return (
    <>
      <Notice tone="warn">Statuses only: no raw PII is shown or exported, and nothing can be deleted from here. Consent, retention, tokenisation and data-subject handling are enforced by the backend; this view does not make the platform DPDP compliant.</Notice>
      <Panel title="Consent, retention and verified-field locks" subtitle="KYC retention: seven years after account closure (SOW 9.7)" padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.identityId} caption="Data protection status" columns={[
          { key: "i", header: "Identity", value: (r) => r.identityId, render: (r) => <span className="mono small">{r.identityId}</span> },
          { key: "m", header: "Memberships", value: (r) => r.memberIds.join(", "), render: (r) => <span className="small">{r.memberIds.join(", ")}</span> },
          { key: "c", header: "Consent", value: (r) => r.consent, render: (r) => <StatusBadge tone={r.consent === "given" ? "positive" : "warning"}>{r.consent}</StatusBadge> },
          { key: "ca", header: "Consent timestamp", value: (r) => r.consentAt ?? "", render: (r) => <span className="small">{dt(r.consentAt)}</span> },
          { key: "cs", header: "Consent source", value: (r) => r.consentSource.replace(/_/g, " ") },
          { key: "a", header: "Aadhaar", value: (r) => r.aadhaar, render: (r) => <span className="mono small">{r.aadhaar}</span> },
          { key: "cl", header: "Account closure", value: (r) => r.closedAt ?? "", render: (r) => <span className="small">{r.closedAt ?? "Open"}</span> },
          { key: "re", header: "Retention end", value: (r) => r.retentionEnd, render: (r) => <span className="small">{r.retentionEnd}</span> },
          { key: "l", header: "Verified-field lock", value: (r) => r.lockedFields },
          { key: "d", header: "Verified documents", value: (r) => r.verifiedDocs, align: "right" },
          { key: "t", header: "PII tokenisation", value: (r) => r.tokenisation, render: (r) => <span className="small muted">{r.tokenisation}</span> },
        ]} />
      </Panel>
    </>
  );
}

function Links({ v, area, intro }: { v: FraudView; area: string; intro: string }) {
  const rows = v.rs.evidence.filter((e) => e.area === area);
  return (
    <>
      <Notice tone="info">{intro}</Notice>
      <div className="grid-3">{rows.map((e) => <Panel key={e.id} title={e.description} subtitle={`${e.sourceModule} · ${e.controlRef}`}><p className="small">Last updated {dt(e.lastUpdated)} · owner {e.owner}</p>{e.openException ? <p className="small field__error">Open exception: {e.openException}</p> : <StatusBadge tone="positive">Evidence available</StatusBadge>}<p><Link to={e.link} className="btn btn--ghost btn--sm">Open {e.sourceModule}</Link></p></Panel>)}</div>
    </>
  );
}

function Evidence({ v }: { v: FraudView }) {
  return (
    <Panel title="Compliance evidence register" subtitle="Index of operational control evidence; not a certification engine" padded={false}>
      <DataTable rows={v.rs.evidence} rowKey={(e) => e.id} caption="Compliance evidence" columns={[
        { key: "c", header: "Control", value: (e) => e.controlRef, render: (e) => <span className="mono small">{e.controlRef}</span> },
        { key: "a", header: "Compliance area", value: (e) => e.area },
        { key: "d", header: "Control description", value: (e) => e.description, render: (e) => <span className="small">{e.description}</span> },
        { key: "s", header: "Source module", value: (e) => e.sourceModule },
        { key: "r", header: "Evidence", value: (e) => e.link, render: (e) => <Link to={e.link} className="small">{e.link}</Link> },
        { key: "u", header: "Last updated", value: (e) => e.lastUpdated, render: (e) => <span className="small">{dt(e.lastUpdated)}</span> },
        { key: "v", header: "Validation status", value: (e) => e.validation, render: (e) => <StatusBadge tone={e.validation === "evidence_available" ? "positive" : e.validation === "exception_open" ? "warning" : "neutral"}>{e.validation.replace(/_/g, " ")}</StatusBadge> },
        { key: "x", header: "Open exception", value: (e) => e.openException ?? "", render: (e) => <span className="small">{e.openException ?? "—"}</span> },
        { key: "o", header: "Owner", value: (e) => e.owner },
      ]} />
    </Panel>
  );
}

function AuditInvestigation({ v }: { v: FraudView }) {
  const all = useMemo(() => platformAudit(), [v.rs, v.mem, v.acc]);
  const [kind, setKind] = useParam("kind");
  const [source, setSource] = useParam("src");
  const [user, setUser] = useState("");
  const [member, setMember] = useState("");
  const [ref, setRef] = useState("");
  const [from, setFrom] = useState("");
  const rows = all.filter((r) => (!kind || r.kind === kind) && (!source || r.source === source) && (!user || r.actor.toLowerCase().includes(user.toLowerCase())) && (!member || (r.memberId ?? r.entityId).includes(member)) && (!ref || r.approvalRef === ref || r.id === ref || r.entityId === ref) && (!from || r.at >= from));
  const sources = [...new Set(all.map((r) => r.source))];
  const [open, setOpen] = useState<PlatformAuditRow | null>(null);
  return (
    <>
      <Notice tone="info">Read-only view over the audit records each module already keeps (no second audit engine). Access logs record sign-ins and identity switches; the mock authentication adapter captures no IP address, so location says "Not captured".</Notice>
      <div className="filters-bar">
        <SelectField label="Event type" value={kind} onChange={setKind} active={!!kind} options={[{ value: "", label: "All types" }, { value: "access", label: "Access logs" }, { value: "data_change", label: "Data changes" }, { value: "configuration", label: "Configuration changes" }, { value: "financial", label: "Financial adjustments" }, { value: "risk", label: "Fraud & risk" }]} />
        <SelectField label="Module" value={source} onChange={setSource} active={!!source} options={[{ value: "", label: "All modules" }, ...sources.map((s) => ({ value: s, label: s }))]} />
        <TextField label="User" value={user} onChange={setUser} />
        <TextField label="Member" value={member} onChange={setMember} />
        <TextField label="Audit / approval reference" value={ref} onChange={setRef} />
        <TextField label="From" type="date" value={from} onChange={setFrom} />
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title={`${rows.length} audit record(s)`} padded={false}>
          <DataTable rows={rows} rowKey={(r) => `${r.source}-${r.id}`} caption="Platform audit" pageSize={20} onRowClick={setOpen} columns={[
            { key: "at", header: "Timestamp", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
            { key: "s", header: "Module", value: (r) => r.source },
            { key: "k", header: "Type", value: (r) => r.kind.replace("_", " ") },
            { key: "a", header: "User", value: (r) => r.actor, render: (r) => <span className="small">{r.actor.startsWith("USR-") ? userName(v.acc, r.actor) : r.actor}</span> },
            { key: "e", header: "Entity", value: (r) => `${r.entity} ${r.entityId}`, render: (r) => <span className="small">{r.entity} · <span className="mono">{r.entityId}</span></span> },
            { key: "act", header: "Action", value: (r) => r.action, render: (r) => <span className="small">{r.action.replace(/_/g, " ")}</span> },
            { key: "ap", header: "Approval", value: (r) => r.approvalRef ?? "", render: (r) => approvalLink(r.approvalRef) },
          ]} />
        </Panel>
        <Panel title="Record detail" subtitle="Old and new values side by side">
          {open ? (
            <dl className="dl-grid small">
              <dt>Audit ID</dt><dd className="mono">{open.id}</dd>
              <dt>Module</dt><dd>{open.source}</dd>
              <dt>User</dt><dd>{open.actor.startsWith("USR-") ? userName(v.acc, open.actor) : open.actor}</dd>
              <dt>When</dt><dd>{dt(open.at)}</dd>
              <dt>Entity</dt><dd>{open.entity} · {open.entityId}</dd>
              <dt>Action</dt><dd>{open.action}</dd>
              <dt>Old value</dt><dd>{open.before ?? "—"}</dd>
              <dt>New value</dt><dd>{open.after ?? "—"}</dd>
              <dt>Reason</dt><dd>{open.reason || "—"}</dd>
              <dt>Approval</dt><dd>{approvalLink(open.approvalRef)}</dd>
              <dt>Location / device</dt><dd>{open.location ?? "—"} · {open.device ?? "—"}</dd>
            </dl>
          ) : <p className="muted small">Select a record</p>}
        </Panel>
      </div>
    </>
  );
}
