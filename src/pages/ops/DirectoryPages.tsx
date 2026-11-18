import { Fragment, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Segmented, StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { DIRECTION, HEALTH } from "@/config/opsCatalogue";
import { healthFor, payloadFor, recordOwnership, requestConfigChange, saveMonitoringRule, statsFor } from "@/features/ops/store";
import type { HealthStatus, Integration, IntegrationRequest, MonitoringRule } from "@/types/ops";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, HealthBadge, OBASE, ReqBadge, RunBadge, approvalLink, dt, intLink, memberLink, ms, pct, traceLink, useOpsView, useRun, userName, type OpsView } from "./shared";

export function DirectoryPage() {
  const v = useOpsView();
  const nav = useNavigate();
  return (
    <>
      <SectionTitle title="Integration directory" description="The ten SOW integrations (SOW 11.1) and the requested Channel Check placeholder. Authentication types, endpoints, payload contracts, retry policies and ownership are not recorded unless confirmed: the portal never stores credentials" />
      <Panel padded={false}>
        <DataTable rows={v.os.integrations} rowKey={(i) => i.id} caption="Integrations" exportName="integration-directory" onRowClick={(i) => nav(`${OBASE}/directory/${i.id}`)} columns={[
          { key: "n", header: "Integration", value: (i) => i.name, render: (i) => <span><strong>{i.name}</strong><br /><span className="muted small">{i.category}</span></span> },
          { key: "dir", header: "Direction", value: (i) => DIRECTION[i.direction], render: (i) => <span className="small">{i.source} → {i.target}<br /><span className="muted">{DIRECTION[i.direction]}</span></span> },
          { key: "p", header: "Purpose", value: (i) => i.purpose, render: (i) => <span className="small">{i.purpose}</span> },
          { key: "f", header: "Frequency", value: (i) => i.frequency, render: (i) => <span className="small">{i.frequency}{i.frequencyStatus === "business_confirmation_required" && <><br /><BcrTag>Not confirmed</BcrTag></>}</span> },
          { key: "c", header: "Connection", value: (i) => i.connection, render: (i) => <StatusBadge tone={i.connection === "placeholder" ? "neutral" : "info"}>{i.connection === "placeholder" ? "Placeholder" : "Mock adapter"}</StatusBadge> },
          { key: "ct", header: "Contract", value: (i) => i.contractRef ?? "", render: (i) => (i.contractRef ? <span className="mono small">{i.contractRef}</span> : <BcrTag>Not provided</BcrTag>) },
          { key: "o", header: "Technical owner", value: (i) => i.ownership.technical ?? "", render: (i) => <span className="small">{i.ownership.technical ?? "Not assigned"}</span> },
          { key: "h", header: "Health (24 h)", value: (i) => healthFor(i.id), render: (i) => <HealthBadge h={healthFor(i.id)} /> },
          { key: "s", header: "SOW", value: (i) => i.sowRef, render: (i) => <span className="small mono">{i.sowRef}</span> },
        ]} />
      </Panel>
    </>
  );
}

export function IntegrationDetailPage() {
  const { integrationId = "" } = useParams();
  const v = useOpsView();
  const i = v.os.integrations.find((x) => x.id === integrationId);
  if (!i) return <Notice tone="warn">Integration {integrationId} not found. <Link to={`${OBASE}/directory`}>Back to the directory</Link></Notice>;
  return <Detail v={v} i={i} />;
}

function Detail({ v, i }: { v: OpsView; i: Integration }) {
  const { result, run } = useRun();
  const nav = useNavigate();
  const s24 = statsFor(i.id, 24);
  const s7 = statsFor(i.id);
  const reqs = v.os.requests.filter((r) => r.integrationId === i.id).sort((a, b) => b.at.localeCompare(a.at));
  const rule = v.os.rules.find((r) => r.integrationId === i.id);
  const jobs = v.os.jobs.filter((j) => j.integrationId === i.id);
  const pending = v.os.pendingConfig.filter((p) => p.integrationId === i.id);
  const [payload, setPayload] = useState<{ id: string; p: IntegrationRequest["payload"] } | null>(null);
  return (
    <>
      <SectionTitle title={i.name} description={i.purpose} actions={<Link to={`${OBASE}/directory`} className="btn btn--ghost btn--sm"><ArrowLeft size={14} aria-hidden="true" />Directory</Link>} />
      {i.connection === "placeholder" && <Notice tone="warn">Channel Check is a placeholder requested under <DecisionRef id="OP-45" />: data, frequency, purpose and source are not confirmed. It cannot be configured or activated, and it is never reported as live.</Notice>}
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Integration profile">
          <dl className="dl-grid small">
            <dt>Code</dt><dd className="mono">{i.code}</dd>
            <dt>Category</dt><dd>{i.category}</dd>
            <dt>Source → target</dt><dd>{i.source} → {i.target} ({DIRECTION[i.direction]})</dd>
            <dt>Data exchanged</dt><dd>{i.dataTypes.join(", ") || "Not confirmed"}</dd>
            <dt>Frequency</dt><dd>{i.frequency} {i.frequencyStatus === "business_confirmation_required" && <BcrTag>Not confirmed</BcrTag>}</dd>
            <dt>Environment</dt><dd>Development (mock)</dd>
            <dt>Connection</dt><dd>{i.connection === "placeholder" ? "Placeholder" : "Mock adapter: no external call from the browser"}</dd>
            <dt>Authentication type</dt><dd>{i.authType ?? <BcrTag>Not provided</BcrTag>}</dd>
            <dt>Credential reference</dt><dd>{i.credentialRef ?? "None stored (credentials live in the backend secret store only)"}</dd>
            <dt>Integration contract</dt><dd>{i.contractRef ? <span className="mono">{i.contractRef}</span> : <BcrTag>Not provided</BcrTag>} {i.contractStatus === "business_confirmation_required" && i.contractRef && <BcrTag>Unconfirmed</BcrTag>}</dd>
            <dt>Retry policy</dt><dd>{i.retryPolicy ?? <BcrTag>Not provided</BcrTag>}</dd>
            <dt>Data ownership</dt><dd>{i.dataOwnership}</dd>
            <dt>Failure handling</dt><dd>{i.failureHandling}</dd>
            <dt>Monitoring</dt><dd>{i.monitoring === "mock_telemetry" ? "Mock telemetry" : "Not configured"}</dd>
            <dt>SOW reference</dt><dd className="mono">{i.sowRef}</dd>
            <dt>Open decisions</dt><dd>{i.decisions.length ? i.decisions.map((d) => <span key={d} style={{ marginRight: 6 }}><DecisionRef id={d} /></span>) : "None"}</dd>
            <dt>Configuration</dt><dd>{Object.entries(i.config).length ? Object.entries(i.config).map(([k, val]) => <div key={k}><span className="mono">{k}</span>: {val ?? <BcrTag>Not set</BcrTag>}</div>) : "None"}</dd>
          </dl>
        </Panel>
        <div>
          <Panel title="Health" subtitle="Current health over 24 hours; statistics over 7 days">
            <p><HealthBadge h={healthFor(i.id)} /> <span className="muted small">{HEALTH[healthFor(i.id)].label}{healthFor(i.id) === "unknown" ? ": no request recorded in the last 24 hours" : ""}</span></p>
            <dl className="dl-grid small">
              <dt>Requests</dt><dd>{s24.total} in 24 h · {s7.total} in 7 d</dd>
              <dt>Successful / failed</dt><dd>{s7.success} / {s7.failed}{s7.pending ? ` · ${s7.pending} pending` : ""}</dd>
              <dt>Failure rate</dt><dd>{pct(s7.failureRate)}</dd>
              <dt>Average / p95</dt><dd>{ms(s7.avgMs)} / {ms(s7.p95Ms)}</dd>
              <dt>Last success</dt><dd>{dt(s7.lastSuccess)}</dd>
              <dt>Last failure</dt><dd>{dt(s7.lastFailure)}</dd>
              <dt>Primary error</dt><dd>{s7.primaryError?.replace(/_/g, " ") ?? "—"}</dd>
              <dt>Recent error</dt><dd>{s7.recentError ?? "—"}</dd>
            </dl>
          </Panel>
          <OwnershipForm v={v} i={i} run={run} />
          <ConfigForm v={v} i={i} run={run} />
        </div>
      </div>
      {pending.length > 0 && (
        <Panel title="Configuration changes" padded={false}>
          <DataTable rows={pending} rowKey={(p) => p.id} caption="Configuration changes" searchable={false} columns={[
            { key: "id", header: "Change", value: (p) => p.id },
            { key: "k", header: "Setting", value: (p) => p.key, render: (p) => <span className="mono small">{p.key}</span> },
            { key: "v", header: "Requested value", value: (p) => p.value },
            { key: "by", header: "Requested by", value: (p) => userName(v.acc, p.requestedBy) },
            { key: "at", header: "Requested", value: (p) => p.at, render: (p) => <span className="small">{dt(p.at)}</span> },
            { key: "a", header: "Approval", value: (p) => p.approvalRequestId ?? "", render: (p) => approvalLink(p.approvalRequestId) },
            { key: "s", header: "Status", value: (p) => p.status, render: (p) => <RunBadge s={p.status} /> },
          ]} />
        </Panel>
      )}
      {rule && <RulePanel v={v} rule={rule} run={run} />}
      {jobs.length > 0 && (
        <Panel title="Jobs" padded={false}>
          <DataTable rows={jobs} rowKey={(j) => j.id} caption="Jobs" searchable={false} onRowClick={() => nav(`${OBASE}/jobs`)} columns={[
            { key: "n", header: "Job", value: (j) => j.name },
            { key: "f", header: "Frequency", value: (j) => j.frequency, render: (j) => <span className="small">{j.frequency}</span> },
            { key: "r", header: "Runs", value: (j) => j.runs.length, align: "right" },
            { key: "l", header: "Latest run", value: (j) => j.runs[j.runs.length - 1]?.status ?? "", render: (j) => (j.runs.length ? <RunBadge s={j.runs[j.runs.length - 1].status} /> : "—") },
          ]} />
        </Panel>
      )}
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Requests" subtitle="Masked metadata only: raw payloads are not kept in the portal" padded={false}>
          <DataTable rows={reqs} rowKey={(r) => r.id} caption="Integration requests" exportName={`${i.code.toLowerCase()}-requests`} columns={[
            { key: "id", header: "Request", value: (r) => r.id, render: (r) => traceLink(r.id) },
            { key: "op", header: "Operation", value: (r) => r.operation },
            { key: "b", header: "Business reference", value: (r) => r.businessRef, render: (r) => <span className="mono small">{r.businessRef}</span> },
            { key: "m", header: "Member", value: (r) => r.memberId ?? "", render: (r) => memberLink(r.memberId) },
            { key: "at", header: "Sent", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
            { key: "s", header: "Status", value: (r) => r.status, render: (r) => <ReqBadge s={r.status} /> },
            { key: "h", header: "HTTP", value: (r) => r.httpStatus ?? "", align: "right" },
            { key: "d", header: "Duration", value: (r) => r.durationMs ?? -1, render: (r) => ms(r.durationMs), align: "right" },
            { key: "e", header: "Error", value: (r) => r.error ?? "", render: (r) => <span className="small">{r.error ?? "—"}</span> },
            { key: "pl", header: "Payload", value: () => "", noSearch: true, render: (r) => <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); const x = run(payloadFor(v.uid, r.id), "Metadata shown"); if (x.ok && x.payload) setPayload({ id: r.id, p: x.payload }); }}><Eye size={14} aria-hidden="true" />{r.sensitivePayload ? "Sensitive" : "View"}</button> },
          ]} />
        </Panel>
        <Panel title="Payload metadata" subtitle={payload ? payload.id : "Select View on a request"}>
          {payload ? (
            <dl className="dl-grid small">{Object.entries(payload.p).map(([k, val]) => <Fragment key={k}><dt>{k}</dt><dd className="mono">{val ?? "—"}</dd></Fragment>)}</dl>
          ) : (
            <p className="muted small">Personal data in payloads needs Integration monitoring: View sensitive. Every view is audited</p>
          )}
        </Panel>
      </div>
    </>
  );
}

type Run = ReturnType<typeof useRun>["run"];

function OwnershipForm({ v, i, run }: { v: OpsView; i: Integration; run: Run }) {
  const [b, setB] = useState(i.ownership.business ?? "");
  const [t, setT] = useState(i.ownership.technical ?? "");
  const [d, setD] = useState(i.ownership.data ?? "");
  const [c, setC] = useState(i.contractRef ?? "");
  if (!v.can("integrations:edit") || i.connection === "placeholder") return null;
  return (
    <Panel title="Ownership and contract reference" subtitle="Recorded as metadata. Never enter credentials or secrets">
      <div className="form-grid">
        <TextField label="Business owner" value={b} onChange={setB} />
        <TextField label="Technical owner" value={t} onChange={setT} />
        <TextField label="Data owner" value={d} onChange={setD} />
        <TextField label="Contract document reference" value={c} onChange={setC} hint="Document ID only" />
      </div>
      <button type="button" className="btn btn--primary btn--sm" onClick={() => run(recordOwnership(v.uid, i.id, { business: b, technical: t, data: d, contractRef: c }), "Ownership recorded")}>Save ownership</button>
    </Panel>
  );
}

function ConfigForm({ v, i, run }: { v: OpsView; i: Integration; run: Run }) {
  const keys = Object.keys(i.config).filter((k) => k !== "disconnected");
  const [key, setKey] = useState(keys[0] ?? "");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  if (!v.can("integrations:submit") || !keys.length || i.connection === "placeholder") return null;
  return (
    <Panel title="Request a configuration change" subtitle="Production-impacting settings are applied only after approval (WF-037)">
      <div className="form-grid">
        <SelectInput label="Setting" value={key} onChange={setKey} options={keys.map((k) => ({ value: k, label: k }))} />
        <TextField label="New value" value={value} onChange={setValue} hint={key === "invitationTargetFrequency" ? "The target is not confirmed (OP-SYNC1): approval records the value but does not close the decision" : undefined} />
      </div>
      <TextArea label="Reason" value={reason} onChange={setReason} rows={2} />
      <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(requestConfigChange(v.uid, i.id, key, value, reason), "Sent for approval"); if (r.ok) { setValue(""); setReason(""); } }}><Send size={14} aria-hidden="true" />Submit for approval</button>
    </Panel>
  );
}

function RulePanel({ v, rule, run }: { v: OpsView; rule: MonitoringRule; run: Run }) {
  const [r, setR] = useState(rule);
  const edit = v.can("integrations:manage");
  const set = (k: keyof MonitoringRule) => (val: string) => setR({ ...r, [k]: val || null });
  return (
    <Panel title="Monitoring rule" subtitle="Expected frequency, failure and delay conditions, severity and escalation" actions={rule.status === "business_confirmation_required" ? <BcrTag>OP-MON1 open</BcrTag> : <StatusBadge tone="positive">Confirmed</StatusBadge>}>
      {edit ? (
        <>
          <div className="form-grid">
            <TextField label="Expected frequency" value={r.expectedFrequency ?? ""} onChange={set("expectedFrequency")} />
            <TextField label="Monitoring window" value={r.window ?? ""} onChange={set("window")} />
            <TextField label="Failure condition" value={r.failureCondition ?? ""} onChange={set("failureCondition")} />
            <TextField label="Delay condition" value={r.delayCondition ?? ""} onChange={set("delayCondition")} />
            <SelectInput label="Severity" value={r.severity ?? ""} onChange={(x) => setR({ ...r, severity: (x || null) as MonitoringRule["severity"] })} options={[{ value: "", label: "Not set" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }]} />
            <TextField label="Escalation group" value={r.escalationGroup ?? ""} onChange={set("escalationGroup")} />
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(saveMonitoringRule(v.uid, r), "Rule recorded")}>Save rule</button>
        </>
      ) : (
        <dl className="dl-grid small">
          <dt>Expected frequency</dt><dd>{rule.expectedFrequency ?? "Not set"}</dd>
          <dt>Failure condition</dt><dd>{rule.failureCondition ?? "Not set"}</dd>
          <dt>Delay condition</dt><dd>{rule.delayCondition ?? "Not set"}</dd>
          <dt>Severity</dt><dd>{rule.severity ?? "Not set"}</dd>
        </dl>
      )}
    </Panel>
  );
}

export function ConnectionHealthPage() {
  const v = useOpsView();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [win, setWin] = useState<"24" | "168">("24");
  const want = params.get("h");
  const rows = v.os.integrations
    .map((i) => ({ i, h: healthFor(i.id, Number(win)) as HealthStatus, s: statsFor(i.id, Number(win)) }))
    .filter((x) => !want || (want === "degraded" ? x.h === "degraded" || x.h === "failed" : want === "unknown" ? ["unknown", "not_configured", "bcr"].includes(x.h) : x.h === want));
  return (
    <>
      <SectionTitle title="Connection health" description="Health is classified by a development rule (OP-MON1 open): Unknown when nothing was recorded in the window, Failed when no request succeeded, Delayed when a scheduled run was missed or late, Degraded when any request failed, Healthy otherwise" actions={<Segmented label="Window" value={win} onChange={setWin} options={[{ value: "24", label: "24 hours" }, { value: "168", label: "7 days" }]} />} />
      {want && <Notice tone="info">Filtered to {want}. <Link to={`${OBASE}/connection-health`}>Show all</Link></Notice>}
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(x) => x.i.id} caption="Connection health" exportName="connection-health" onRowClick={(x) => nav(`${OBASE}/directory/${x.i.id}`)} columns={[
          { key: "n", header: "Integration", value: (x) => x.i.name, render: (x) => intLink(v.os, x.i.id) },
          { key: "h", header: "Health", value: (x) => x.h, render: (x) => <HealthBadge h={x.h} /> },
          { key: "t", header: "Requests", value: (x) => x.s.total, align: "right" },
          { key: "ok", header: "Successful", value: (x) => x.s.success, align: "right" },
          { key: "f", header: "Failed", value: (x) => x.s.failed, align: "right" },
          { key: "p", header: "Pending", value: (x) => x.s.pending, align: "right" },
          { key: "rt", header: "Retried", value: (x) => x.s.retried, align: "right" },
          { key: "fr", header: "Failure rate", value: (x) => x.s.failureRate ?? -1, render: (x) => pct(x.s.failureRate), align: "right" },
          { key: "a", header: "Average", value: (x) => x.s.avgMs ?? -1, render: (x) => ms(x.s.avgMs), align: "right" },
          { key: "p95", header: "p95", value: (x) => x.s.p95Ms ?? -1, render: (x) => ms(x.s.p95Ms), align: "right" },
          { key: "ls", header: "Last success", value: (x) => x.s.lastSuccess ?? "", render: (x) => <span className="small">{dt(x.s.lastSuccess)}</span> },
          { key: "lf", header: "Last failure", value: (x) => x.s.lastFailure ?? "", render: (x) => <span className="small">{dt(x.s.lastFailure)}</span> },
          { key: "e", header: "Primary error", value: (x) => x.s.primaryError ?? "", render: (x) => <span className="small">{x.s.primaryError?.replace(/_/g, " ") ?? "—"}</span> },
        ]} />
      </Panel>
    </>
  );
}
