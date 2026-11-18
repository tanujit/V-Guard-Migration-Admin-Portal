import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatList } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { ALERT_TYPE } from "@/config/opsCatalogue";
import { hasPermission } from "@/features/access/engine";
import { ALERT_FLOW, INC_FLOW, accessEvents, addIncidentNote, assignIncident, createIncident, incidentSnapshot, linkToIncident, setIncidentStatus, updateAlert, updateOpsDecision } from "@/features/ops/store";
import { correlationAt, hoursBefore } from "@/features/ops/engine";
import type { Incident, OpsAlert, OpsDecision } from "@/types/ops";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, RunBadge, approvalLink, commLink, dt, intLink, traceLink, useOpsView, useParam, useRun, userName, type OpsView } from "./shared";

type Run = ReturnType<typeof useRun>["run"];
const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const AlertBadge = ({ s }: { s: OpsAlert["status"] }) => <StatusBadge tone={s === "closed" || s === "resolved" ? "positive" : s === "escalated" ? "negative" : s === "created" ? "warning" : "info"}>{label(s)}</StatusBadge>;
const IncBadge = ({ s }: { s: Incident["status"] }) => <StatusBadge tone={s === "closed" || s === "resolved" ? "positive" : s === "open" ? "warning" : "info"}>{label(s)}</StatusBadge>;

/* ======================= Alerts and incidents ======================= */

export function IncidentsPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "alerts");
  const [alertSel, setAlertSel] = useParam("alert", "");
  const [incSel, setIncSel] = useParam("incident", "");
  const a = v.os.alerts.find((x) => x.id === alertSel);
  const i = v.os.incidents.find((x) => x.id === incSel);
  return (
    <>
      <SectionTitle title="Alerts & incidents" description="Monitoring alerts are sent to staff through the Communication Centre and move through acknowledgement, investigation, escalation and resolution. Incidents group alerts, traces and changes around one time window" />
      <PolicyMessages result={result} />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: "alerts", label: "Alerts", count: v.os.alerts.filter((x) => x.status !== "closed").length }, { id: "incidents", label: "Incidents", count: v.os.incidents.length }]} />
      {tab === "alerts" ? (
        <div className="grid-2 grid-2--wide-left">
          <Panel padded={false}>
            <DataTable rows={[...v.os.alerts].reverse()} rowKey={(x) => x.id} caption="Monitoring alerts" exportName="ops-alerts" onRowClick={(x) => setAlertSel(x.id)} columns={[
              { key: "id", header: "Alert", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
              { key: "t", header: "Type", value: (x) => ALERT_TYPE[x.type] },
              { key: "s", header: "Source", value: (x) => x.integrationId ?? x.service ?? "", render: (x) => (x.integrationId ? intLink(v.os, x.integrationId) : <span className="small">{x.service ?? "—"}</span>) },
              { key: "d", header: "Detected", value: (x) => x.detectedAt, render: (x) => <span className="small">{dt(x.detectedAt)}</span> },
              { key: "tr", header: "Trigger", value: (x) => x.trigger, render: (x) => <span className="small">{x.trigger}</span> },
              { key: "sv", header: "Severity", value: (x) => x.severity ?? "", render: (x) => (x.severity ? label(x.severity) : <span className="muted small">Not set</span>) },
              { key: "o", header: "Owner", value: (x) => x.owner ?? "", render: (x) => (x.owner ? userName(v.acc, x.owner) : "—") },
              { key: "st", header: "Status", value: (x) => x.status, render: (x) => <AlertBadge s={x.status} /> },
              { key: "c", header: "Communication", value: (x) => x.commId ?? "", render: (x) => commLink(x.commId) },
            ]} />
          </Panel>
          {a ? <AlertDetail v={v} a={a} run={run} /> : <Panel title="Alert detail"><p className="muted small">Select an alert</p></Panel>}
        </div>
      ) : (
        <>
          {v.can("health:create") && <NewIncident v={v} run={run} onCreated={setIncSel} />}
          <div className="grid-2 grid-2--wide-left">
            <Panel padded={false}>
              <DataTable rows={[...v.os.incidents].reverse()} rowKey={(x) => x.id} caption="Incidents" exportName="incidents" onRowClick={(x) => setIncSel(x.id)} columns={[
                { key: "id", header: "Incident", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
                { key: "t", header: "Title", value: (x) => x.title },
                { key: "w", header: "Window", value: (x) => x.window.from, render: (x) => <span className="small">{dt(x.window.from)} → {dt(x.window.to)}</span> },
                { key: "o", header: "Owner", value: (x) => x.owner ?? "", render: (x) => (x.owner ? userName(v.acc, x.owner) : "—") },
                { key: "s", header: "Status", value: (x) => x.status, render: (x) => <IncBadge s={x.status} /> },
              ]} />
            </Panel>
            {i ? <IncidentDetail v={v} i={i} run={run} /> : <Panel title="Incident detail"><p className="muted small">Select an incident</p></Panel>}
          </div>
        </>
      )}
    </>
  );
}

function AlertDetail({ v, a, run }: { v: OpsView; a: OpsAlert; run: Run }) {
  const [remarks, setRemarks] = useState("");
  const edit = v.can("integrations:manage") || v.can("health:edit");
  return (
    <Panel title={`${a.id} · ${ALERT_TYPE[a.type]}`} subtitle={a.trigger}>
      <dl className="dl-grid small">
        <dt>Expected</dt><dd>{a.expected}</dd>
        <dt>Actual</dt><dd>{a.actual}</dd>
        <dt>Threshold</dt><dd>{a.threshold ?? <BcrTag>Not confirmed</BcrTag>}</dd>
        <dt>Escalations</dt><dd>{a.escalation}</dd>
        <dt>Incident</dt><dd>{a.incidentId ?? "—"}</dd>
        <dt>Trace</dt><dd>{a.traceRef ? traceLink(a.traceRef) : "—"}</dd>
        <dt>Staff alert</dt><dd>{commLink(a.commId)}</dd>
        <dt>Resolution</dt><dd>{a.resolution ? `${a.resolution.remarks} · ${userName(v.acc, a.resolution.by)} · ${dt(a.resolution.at)}` : "—"}</dd>
      </dl>
      <ul className="activity-list small">{a.history.map((h, n) => <li key={n}>{dt(h.at)} · {userName(v.acc, h.by)} · {label(h.status)}{h.remarks ? `: ${h.remarks}` : ""}</li>)}</ul>
      {edit && ALERT_FLOW[a.status].length > 0 && (
        <>
          <TextArea label="Remarks" value={remarks} onChange={setRemarks} rows={2} hint="Required to escalate or resolve" />
          <div className="btn-row">{ALERT_FLOW[a.status].map((to) => <button key={to} type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(updateAlert(v.uid, a.id, to, remarks), `Alert ${to}`); if (r.ok) setRemarks(""); }}>{label(to)}</button>)}</div>
        </>
      )}
    </Panel>
  );
}

function NewIncident({ v, run, onCreated }: { v: OpsView; run: Run; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(hoursBefore(v.now, 2));
  const [to, setTo] = useState(v.now);
  const [services, setServices] = useState("");
  if (!open) return <div className="btn-row" style={{ marginBottom: 12 }}><button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}><Plus size={14} aria-hidden="true" />New incident</button></div>;
  return (
    <Panel title="New incident">
      <div className="form-grid">
        <TextField label="Title" value={title} onChange={setTitle} required />
        <TextField label="From" value={from} onChange={setFrom} type="datetime-local" />
        <TextField label="To" value={to} onChange={setTo} type="datetime-local" />
        <TextField label="Services affected" value={services} onChange={setServices} hint="Comma separated" />
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(createIncident(v.uid, { title, from, to, services: services.split(",").map((s) => s.trim()).filter(Boolean) }), "Incident created"); if (r.ok && r.id) { onCreated(r.id); setOpen(false); setTitle(""); } }}>Create</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </Panel>
  );
}

function IncidentDetail({ v, i, run }: { v: OpsView; i: Incident; run: Run }) {
  const [note, setNote] = useState("");
  const [remarks, setRemarks] = useState("");
  const [owner, setOwner] = useState(i.owner ?? "");
  const [linkKind, setLinkKind] = useState("alerts");
  const [ref, setRef] = useState("");
  const snap = incidentSnapshot(i.window.from, i.window.to);
  const corr = correlationAt(v.os.metrics, i.window.to, Math.max(1, Math.round((Date.parse(`${i.window.to}:00Z`) - Date.parse(`${i.window.from}:00Z`)) / 3600_000)));
  const edit = v.can("health:edit");
  const owners = v.acc.users.filter((u) => u.accountStatus === "active" && hasPermission(v.acc, u.id, "health", "edit").allowed);
  const next = INC_FLOW[i.status].filter((to) => to !== "closed" || v.can("health:close"));
  return (
    <Panel title={`${i.id} · ${i.title}`} subtitle={`${dt(i.window.from)} → ${dt(i.window.to)}`}>
      <dl className="dl-grid small">
        <dt>Status</dt><dd><IncBadge s={i.status} /></dd>
        <dt>Owner</dt><dd>{i.owner ? userName(v.acc, i.owner) : "Not assigned"}</dd>
        <dt>Services</dt><dd>{i.services.join(", ") || "—"}</dd>
        <dt>Alerts</dt><dd className="mono">{i.alerts.join(", ") || "—"}</dd>
        <dt>Traces</dt><dd className="mono">{i.traces.join(", ") || "—"}</dd>
        <dt>Changes</dt><dd className="mono">{i.changes.join(", ") || "—"}</dd>
        <dt>Created</dt><dd>{userName(v.acc, i.createdBy)} · {dt(i.createdAt)}</dd>
      </dl>
      <h4 className="ops-subhead">What changed in this window</h4>
      <p className="muted small">Correlation, not cause. Changes come from the release record, flags, vendor status and the configuration audit of each module</p>
      <StatList items={[
        ...snap.deployments.map((d) => ({ label: `Deployment: ${d.title}`, value: dt(d.at), note: `${d.before ?? "—"} → ${d.after ?? "—"}` })),
        ...snap.schema.map((d) => ({ label: `Schema: ${d.title}`, value: dt(d.at) })),
        ...snap.flags.map((d) => ({ label: `Feature flag: ${d.title}`, value: dt(d.at), note: `${d.before ?? "—"} → ${d.after ?? "—"}` })),
        ...snap.vendors.map((d) => ({ label: `Vendor outage: ${d.title}`, value: dt(d.at) })),
        ...snap.config.map((d) => ({ label: `Configuration: ${d.parameter}`, value: dt(d.at), note: `${d.source} · ${d.before ?? "—"} → ${d.after ?? "—"}` })),
      ]} />
      {snap.missingDeployment && <p className="muted small">No deployment recorded in this window</p>}
      <StatList items={corr.filter((c) => c.change != null).map((c) => ({ label: c.label, value: `${c.before} → ${c.peak} ${c.unit}` }))} />
      <h4 className="ops-subhead">Notes</h4>
      <ul className="activity-list small">{i.notes.map((n, k) => <li key={k}>{dt(n.at)} · {userName(v.acc, n.by)}: {n.text}</li>)}{!i.notes.length && <li className="muted">No notes</li>}</ul>
      <ul className="activity-list small">{i.history.map((h, k) => <li key={k}>{dt(h.at)} · {userName(v.acc, h.by)} · {label(h.status)}{h.remarks ? `: ${h.remarks}` : ""}</li>)}</ul>
      {edit && i.status !== "closed" && (
        <>
          <div className="form-grid">
            <SelectInput label="Owner" value={owner} onChange={setOwner} options={[{ value: "", label: "Select" }, ...owners.map((u) => ({ value: u.id, label: userName(v.acc, u.id) }))]} />
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(assignIncident(v.uid, i.id, owner), "Owner assigned")} disabled={!owner}>Assign</button></div>
            <SelectInput label="Link" value={linkKind} onChange={setLinkKind} options={[{ value: "alerts", label: "Alert" }, { value: "traces", label: "Trace / stack reference" }, { value: "changes", label: "Change" }, { value: "services", label: "Service" }]} />
            <TextField label="Reference" value={ref} onChange={setRef} />
            <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(linkToIncident(v.uid, i.id, linkKind as "alerts", ref), "Linked"); if (r.ok) setRef(""); }}>Link</button></div>
          </div>
          <TextArea label="Note" value={note} onChange={setNote} rows={2} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(addIncidentNote(v.uid, i.id, note), "Note added"); if (r.ok) setNote(""); }}>Add note</button>
          <TextArea label="Status remarks" value={remarks} onChange={setRemarks} rows={2} hint="Required to resolve" />
          <div className="btn-row">{next.map((to) => <button key={to} type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(setIncidentStatus(v.uid, i.id, to, remarks), `Incident ${to}`); if (r.ok) setRemarks(""); }}>{label(to)}</button>)}</div>
        </>
      )}
    </Panel>
  );
}

/* ======================= Audit history and decisions ======================= */

export function OpsAuditPage() {
  const v = useOpsView();
  const { hash } = useLocation();
  const [tab, setTab] = useParam("tab", "audit");
  const [module, setModule] = useState("");
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [hash, tab]);
  const modules = [...new Set(v.os.audit.map((a) => a.module))];
  const audit = [...v.os.audit].reverse().filter((a) => !module || a.module === module);
  return (
    <>
      <SectionTitle title="Integration audit & decisions" description="Every configuration, retry, alert, incident, sensitive view and export recorded by this module, the open decision register, monitoring rules and portal sign-in history" />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: "audit", label: "Audit history", count: v.os.audit.length }, { id: "decisions", label: "Decision register", count: v.os.decisions.length }, { id: "rules", label: "Monitoring rules", count: v.os.rules.length }, { id: "config", label: "Configuration changes", count: v.os.pendingConfig.length }, { id: "access", label: "Portal access log" }]} />
      {tab === "audit" && (
        <>
          <Panel><SelectInput label="Module" value={module} onChange={setModule} options={[{ value: "", label: "All" }, ...modules.map((m) => ({ value: m, label: m }))]} /></Panel>
          <Panel padded={false}>
            <DataTable rows={audit} rowKey={(a) => a.id} caption="Integration audit" exportName="integration-audit" columns={[
              { key: "id", header: "Event", value: (a) => a.id, render: (a) => <span className="mono small">{a.id}</span> },
              { key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="small">{dt(a.at)}</span> },
              { key: "u", header: "User", value: (a) => userName(v.acc, a.actor) },
              { key: "r", header: "Role", value: (a) => a.role },
              { key: "m", header: "Module", value: (a) => a.module },
              { key: "a", header: "Action", value: (a) => a.action, render: (a) => <span className="small">{label(a.action)}</span> },
              { key: "e", header: "Entity", value: (a) => a.entity, render: (a) => <span className="mono small">{a.entity}</span> },
              { key: "b", header: "Before", value: (a) => a.before ?? "", render: (a) => <span className="small">{a.before ?? "—"}</span> },
              { key: "af", header: "After", value: (a) => a.after ?? "", render: (a) => <span className="small">{a.after ?? "—"}</span> },
              { key: "rs", header: "Reason", value: (a) => a.reason, render: (a) => <span className="small">{a.reason || "—"}</span> },
              { key: "rel", header: "Related", value: (a) => a.relatedRef ?? "", render: (a) => (a.relatedRef?.startsWith("APR") ? approvalLink(a.relatedRef) : <span className="mono small">{a.relatedRef ?? "—"}</span>) },
            ]} />
          </Panel>
        </>
      )}
      {tab === "decisions" && <Decisions v={v} />}
      {tab === "rules" && (
        <Panel padded={false} title="Monitoring rules" subtitle="Edit on each integration's profile. Thresholds stay Business Confirmation Required while OP-MON1 is open">
          <DataTable rows={v.os.rules} rowKey={(r) => r.id} caption="Monitoring rules" searchable={false} columns={[
            { key: "i", header: "Integration", value: (r) => r.integrationId, render: (r) => intLink(v.os, r.integrationId) },
            { key: "f", header: "Expected frequency", value: (r) => r.expectedFrequency ?? "", render: (r) => r.expectedFrequency ?? <span className="muted small">Not set</span> },
            { key: "fc", header: "Failure condition", value: (r) => r.failureCondition ?? "", render: (r) => r.failureCondition ?? <span className="muted small">Not set</span> },
            { key: "dc", header: "Delay condition", value: (r) => r.delayCondition ?? "", render: (r) => r.delayCondition ?? <span className="muted small">Not set</span> },
            { key: "s", header: "Severity", value: (r) => r.severity ?? "", render: (r) => r.severity ?? <span className="muted small">Not set</span> },
            { key: "st", header: "Status", value: (r) => r.status, render: (r) => (r.status === "confirmed" ? <StatusBadge tone="positive">Confirmed</StatusBadge> : <BcrTag>Not confirmed</BcrTag>) },
          ]} />
        </Panel>
      )}
      {tab === "config" && (
        <Panel padded={false}>
          <DataTable rows={v.os.pendingConfig} rowKey={(p) => p.id} caption="Configuration changes" searchable={false} emptyTitle="No configuration change requested" columns={[
            { key: "id", header: "Change", value: (p) => p.id },
            { key: "i", header: "Integration", value: (p) => p.integrationId, render: (p) => intLink(v.os, p.integrationId) },
            { key: "k", header: "Setting", value: (p) => p.key, render: (p) => <span className="mono small">{p.key}</span> },
            { key: "v", header: "Value", value: (p) => p.value },
            { key: "by", header: "Requested by", value: (p) => userName(v.acc, p.requestedBy) },
            { key: "a", header: "Approval", value: (p) => p.approvalRequestId ?? "", render: (p) => approvalLink(p.approvalRequestId) },
            { key: "s", header: "Status", value: (p) => p.status, render: (p) => <RunBadge s={p.status === "applied" ? "completed" : p.status === "rejected" ? "failed" : "pending"} /> },
          ]} />
        </Panel>
      )}
      {tab === "access" && (
        <Panel padded={false} title="Portal access log" subtitle="Sign-ins and identity switches recorded by the mock authentication adapter">
          <DataTable rows={[...accessEvents()].reverse()} rowKey={(e) => e.id} caption="Access log" searchable={false} emptyTitle="No access recorded in this session" columns={[
            { key: "at", header: "At", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> },
            { key: "u", header: "User", value: (e) => userName(v.acc, e.userId) },
            { key: "a", header: "Action", value: (e) => label(e.action) },
            { key: "l", header: "Location", value: (e) => e.location, render: (e) => <span className="small">{e.location}</span> },
            { key: "d", header: "Device", value: (e) => e.device, render: (e) => <span className="small">{e.device}</span> },
            { key: "s", header: "Session", value: (e) => e.sessionRef, render: (e) => <span className="mono small">{e.sessionRef}</span> },
          ]} />
        </Panel>
      )}
    </>
  );
}

function Decisions({ v }: { v: OpsView }) {
  const { result, run } = useRun();
  const [sel, setSel] = useState<string | null>(null);
  const d = v.os.decisions.find((x) => x.id === sel);
  return (
    <>
      <Notice tone="warn">Open decisions are never turned into rules here. Recording an answer marks the question as confirmed for audit; any rule it affects still has to be configured and, where needed, approved.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false}>
          <table className="table">
            <thead><tr><th>Decision</th><th>Question</th><th>Integration</th><th>Restriction until confirmed</th><th>Status</th></tr></thead>
            <tbody>
              {v.os.decisions.map((x) => (
                <tr key={x.id} id={x.id} className={`is-clickable ${sel === x.id ? "is-selected" : ""}`} tabIndex={0} onClick={() => setSel(x.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(x.id); } }}>
                  <td className="mono small">{x.ref}</td>
                  <td className="small">{x.question}</td>
                  <td className="small">{x.integration}</td>
                  <td className="small">{x.restriction}</td>
                  <td><StatusBadge tone={x.status === "confirmed" ? "positive" : x.status === "open" ? "warning" : "neutral"}>{label(x.status)}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        {d ? <DecisionForm key={d.id} v={v} d={d} run={run} /> : <Panel title="Decision detail"><p className="muted small">Select a decision</p></Panel>}
      </div>
    </>
  );
}

function DecisionForm({ v, d, run }: { v: OpsView; d: OpsDecision; run: Run }) {
  const [status, setStatus] = useState<string>(d.status);
  const [answer, setAnswer] = useState(d.answer);
  return (
    <Panel title={d.ref} subtitle={d.question}>
      <dl className="dl-grid small">
        <dt>Business owner</dt><dd>{d.businessOwner}</dd>
        <dt>Technical owner</dt><dd>{d.technicalOwner}</dd>
        <dt>Restriction</dt><dd>{d.restriction}</dd>
        <dt>Answer</dt><dd>{d.answer || "—"}</dd>
      </dl>
      {v.can("integrations:manage") && (
        <>
          <SelectInput label="Status" value={status} onChange={setStatus} options={["open", "under_review", "confirmed", "deferred", "out_of_scope"].map((s) => ({ value: s, label: label(s) }))} />
          <TextArea label="Answer / notes" value={answer} onChange={setAnswer} rows={3} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(updateOpsDecision(v.uid, d.id, { status: status as OpsDecision["status"], answer }), "Decision updated")}>Save</button>
        </>
      )}
    </Panel>
  );
}
