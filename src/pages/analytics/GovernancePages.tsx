import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { FRESHNESS_LABEL, REPORTS } from "@/config/analyticsCatalogue";
import { hasPermission } from "@/features/access/engine";
import { activateThreshold, createSchedule, evaluateThreshold, exportHistory, kpiValues, lineage, reconciliation, recipientCheck, requestKpiChange, runSchedule, saveThreshold, setScheduleStatus, setSourceAvailability, updateAnalyticsDecision } from "@/features/analytics/store";
import type { AnalyticsDecision, KpiDefinition, ReportDef, ThresholdPolicy } from "@/types/analytics";
import { SectionTitle, PolicyMessages } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, ProvisionalTag, dt, num, useAnalyticsView, useParam, useRun, userName } from "./shared";

const approvalLinkTo = (id: string | null) => (id ? <Link to={`/governance/approvals/request/${id}`} className="mono small">{id}</Link> : <span className="muted small">—</span>);

const CAT: Record<ReportDef["category"], string> = { business: "A · Business performance", scheme: "B · Scheme and incentive", scanning: "C · Scanning and QR", finance: "D · Finance", fraud: "E · Fraud and risk", support: "F · Support and communication", programme: "G · Programme and member type" };
const STATUS_TONE = { available: "positive", linked: "info", business_confirmation_required: "warning", proposed: "neutral" } as const;

/* ======================= Report catalogue ======================= */

export function CataloguePage() {
  const v = useAnalyticsView();
  const [cat, setCat] = useState("");
  const rows = REPORTS.filter((r) => !cat || r.category === cat);
  return (
    <>
      <SectionTitle title="Report catalogue" description="Every report in one place, grouped by area. Linked reports open in the module that owns them; nothing is recalculated here" />
      <Panel><SelectInput label="Area" value={cat} onChange={setCat} options={[{ value: "", label: "All areas" }, ...Object.entries(CAT).map(([k, l]) => ({ value: k, label: l }))]} /></Panel>
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Report catalogue" pageSize={50} columns={[
          { key: "id", header: "Report ID", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "n", header: "Report", value: (r) => r.name, render: (r) => (hasPermission(v.acc, v.uid, r.permission.split(":")[0], r.permission.split(":")[1] as never).allowed && r.status !== "proposed" ? <Link to={r.route}><strong>{r.name}</strong></Link> : <span><strong>{r.name}</strong><br /><span className="muted small">{r.status === "proposed" ? "Not built" : "No access"}</span></span>) },
          { key: "d", header: "Description", value: (r) => r.description, render: (r) => <span className="small">{r.description}</span> },
          { key: "c", header: "Area", value: (r) => CAT[r.category] },
          { key: "s", header: "Source module", value: (r) => r.sourceModule, render: (r) => <span className="small">{r.sourceModule}</span> },
          { key: "p", header: "Programmes", value: (r) => r.programmes.join(" ") || "—" },
          { key: "perm", header: "Permission", value: (r) => r.permission, render: (r) => <span className="mono small">{r.permission}</span> },
          { key: "f", header: "Filters", value: (r) => r.filters.join(", "), render: (r) => <span className="small">{r.filters.join(", ") || "—"}</span> },
          { key: "x", header: "Exports", value: (r) => r.formats.join(", ").toUpperCase() || "—" },
          { key: "st", header: "Status", value: (r) => r.status, render: (r) => <span><StatusBadge tone={STATUS_TONE[r.status]}>{r.status === "linked" ? "Linked module report" : r.status.replace(/_/g, " ")}</StatusBadge>{r.decisionRef && <><br /><DecisionRef id={r.decisionRef} /></>}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Scheduled reports ======================= */

export function SchedulesPage() {
  const v = useAnalyticsView();
  const { result, run } = useRun();
  const schedulable = REPORTS.filter((r) => r.status === "available" || r.status === "business_confirmation_required");
  const [reportId, setReportId] = useState(schedulable[0].id);
  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayName, setDayName] = useState("Monday");
  const [time, setTime] = useState("08:00");
  const [range, setRange] = useState("Last 7 days");
  const [format, setFormat] = useState<"csv" | "xlsx" | "pdf">("csv");
  const [start, setStart] = useState(v.now.slice(0, 10));
  const [sel, setSel] = useState<string | null>(null);
  const users = v.acc.users;
  const s = v.as.schedules.find((x) => x.id === sel);
  const runs = v.as.runs.filter((r) => r.scheduleId === sel).reverse();
  return (
    <>
      <SectionTitle title="Scheduled reports" description="Reports emailed to stakeholders through the Communication Centre (mock email). Each recipient is re-checked at every run and receives data in their own scope; there are no default recipients" />
      <Notice tone="warn">Who should receive each scheduled report is not confirmed (<DecisionRef id="OP-ALERT1" />). Schedules here are development configurations and every delivery is a mock email.</Notice>
      <PolicyMessages result={result} />
      {v.can("reports:create") && (
        <Panel title="New schedule">
          <div className="form-grid">
            <SelectInput label="Report or dashboard" value={reportId} onChange={setReportId} options={schedulable.map((r) => ({ value: r.id, label: r.name }))} />
            <TextField label="Schedule name" value={name} onChange={setName} />
            <SelectInput label="Frequency" value={freq} onChange={(x) => setFreq(x as typeof freq)} options={[{ value: "daily", label: "Daily (operational views)" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
            {freq === "weekly" && <SelectInput label="Day" value={dayName} onChange={setDayName} options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => ({ value: d, label: d }))} />}
            <TextField label="Time" value={time} onChange={setTime} hint="HH:MM" />
            <SelectInput label="Date range in each run" value={range} onChange={setRange} options={["Yesterday", "Last 7 days", "Last 30 days", "Previous month"].map((x) => ({ value: x, label: x }))} />
            <SelectInput label="Format" value={format} onChange={(x) => setFormat(x as typeof format)} options={[{ value: "csv", label: "CSV" }, { value: "xlsx", label: "Excel" }, { value: "pdf", label: "PDF" }]} />
            <TextField label="Start date" type="date" value={start} onChange={setStart} />
          </div>
          <fieldset className="ana-recipients"><legend>Recipients (checked against the report permission)</legend>
            {users.filter((u) => u.accountStatus === "active").map((u) => { const why = recipientCheck(reportId, u.id); return (
              <label key={u.id} className={`ana-chip ${recipients.includes(u.id) ? "is-on" : ""} ${why ? "is-blocked" : ""}`} title={why ?? undefined}>
                <input type="checkbox" checked={recipients.includes(u.id)} onChange={() => setRecipients(recipients.includes(u.id) ? recipients.filter((x) => x !== u.id) : [...recipients, u.id])} />{u.firstName} {u.lastName}{why ? " · not permitted" : ""}
              </label>
            ); })}
          </fieldset>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(createSchedule(v.uid, { reportId, name: name || REPORTS.find((x) => x.id === reportId)!.name, recipients, recipientGroup: null, frequency: freq, day: freq === "weekly" ? dayName : null, time, dateRange: range, filters: {}, format, startDate: start, endDate: null }), "Schedule created"); if (r.ok) { setRecipients([]); setName(""); } }}>Create schedule</button>
        </Panel>
      )}
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title="Schedules">
          <DataTable rows={v.as.schedules} rowKey={(x) => x.id} caption="Schedules" emptyTitle="No schedules yet" onRowClick={(x) => setSel(x.id)} columns={[
            { key: "id", header: "Schedule", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
            { key: "n", header: "Name", value: (x) => x.name },
            { key: "f", header: "Frequency", value: (x) => x.frequency, render: (x) => `${x.frequency}${x.day ? ` · ${x.day}` : ""} · ${x.time}` },
            { key: "r", header: "Recipients", value: (x) => x.recipients.length, align: "right" },
            { key: "by", header: "Created by", value: (x) => userName(v.acc, x.createdBy) },
            { key: "l", header: "Last run", value: (x) => x.lastRun ?? "", render: (x) => <span className="small">{dt(x.lastRun)}</span> },
            { key: "nx", header: "Next run", value: (x) => x.nextRun, render: (x) => <span className="small">{dt(x.nextRun)}</span> },
            { key: "ls", header: "Last delivery", value: (x) => x.lastStatus ?? "", render: (x) => (x.lastStatus ? <StatusBadge tone={x.lastStatus === "delivered" ? "positive" : x.lastStatus === "failed" ? "negative" : "warning"}>{x.lastStatus.replace(/_/g, " ")}</StatusBadge> : "—") },
            { key: "s", header: "Status", value: (x) => x.status },
          ]} />
        </Panel>
        {s ? (
          <Panel title={`${s.id} · ${s.name}`} subtitle={`${REPORTS.find((r) => r.id === s.reportId)?.name} · ${s.format.toUpperCase()} · ${s.dateRange}`}>
            <dl className="dl-grid small">
              <dt>Recipients</dt><dd>{s.recipients.map((r) => userName(v.acc, r)).join(", ")}</dd>
              <dt>Start</dt><dd>{s.startDate}</dd>
              <dt>Last failure</dt><dd>{s.lastFailure ?? "—"}</dd>
            </dl>
            <div className="btn-row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(runSchedule(v.uid, s.id, s.nextRun, () => 0), "Run delivered")}>Run next slot now</button>
              {s.status === "active" ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setScheduleStatus(v.uid, s.id, "paused"), "Paused")}>Pause</button> : <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setScheduleStatus(v.uid, s.id, "active"), "Resumed")}>Resume</button>}
            </div>
            <DataTable rows={runs} rowKey={(r) => r.id} caption="Delivery history" searchable={false} emptyTitle="No runs yet" columns={[
              { key: "s", header: "Slot", value: (r) => r.slot, render: (r) => <span className="small">{dt(r.slot)}</span> },
              { key: "st", header: "Outcome", value: (r) => r.status, render: (r) => r.status.replace(/_/g, " ") },
              { key: "d", header: "Deliveries", value: (r) => r.deliveries.length, render: (r) => <span className="small">{r.deliveries.map((d) => `${userName(v.acc, d.recipient)}: ${d.status.replace(/_/g, " ")}${d.reason ? ` (${d.reason})` : ""}`).join("; ") || "—"}</span> },
            ]} />
          </Panel>
        ) : <Panel title="Schedule detail"><p className="muted small">Select a schedule</p></Panel>}
      </div>
    </>
  );
}

/* ======================= Threshold alerts ======================= */

export function ThresholdAlertsPage() {
  const v = useAnalyticsView();
  const { result, run } = useRun();
  const [kpiId, setKpiId] = useState("KPI-DAU");
  const [cond, setCond] = useState<ThresholdPolicy["condition"]>("below");
  const [value, setValue] = useState("");
  const [period, setPeriod] = useState("Daily");
  const [prog, setProg] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const k = kpiValues(v.uid);
  return (
    <>
      <SectionTitle title="Threshold alerts" description="Alerts when a KPI crosses a set threshold (SOW 13.8), evaluated against the same KPI values every dashboard shows and delivered through the Communication Centre" />
      <Notice tone="warn">Threshold values (DAU floor, fraud-rate ceiling and others) and recipients are not confirmed (<DecisionRef id="OP-ALERT1" />). Thresholds can be drafted and evaluated, but a draft never sends an alert, and activation is refused until OP-ALERT1 is confirmed.</Notice>
      <PolicyMessages result={result} />
      {v.can("kpi-governance:manage") && (
        <Panel title="Draft a threshold">
          <div className="form-grid">
            <SelectInput label="KPI" value={kpiId} onChange={setKpiId} options={v.as.kpis.map((x) => ({ value: x.id, label: x.name }))} />
            <SelectInput label="Condition" value={cond} onChange={(x) => setCond(x as ThresholdPolicy["condition"])} options={[{ value: "below", label: "Below threshold" }, { value: "above", label: "Above threshold" }, { value: "pct_change", label: "Percentage change" }, { value: "variance_prev", label: "Variance from previous period" }]} />
            <TextField label="Threshold value" value={value} onChange={setValue} inputMode="numeric" hint="Leave empty if not yet known" />
            <SelectInput label="Measurement period" value={period} onChange={setPeriod} options={["Daily", "Weekly", "Monthly"].map((x) => ({ value: x, label: x }))} />
            <SelectInput label="Programme scope" value={prog} onChange={setProg} options={[{ value: "", label: "All programmes" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} />
          </div>
          <fieldset className="ana-recipients"><legend>Recipients</legend>
            {v.acc.users.filter((u) => u.accountStatus === "active" && hasPermission(v.acc, u.id, "analytics", "view").allowed).map((u) => <label key={u.id} className={`ana-chip ${recipients.includes(u.id) ? "is-on" : ""}`}><input type="checkbox" checked={recipients.includes(u.id)} onChange={() => setRecipients(recipients.includes(u.id) ? recipients.filter((x) => x !== u.id) : [...recipients, u.id])} />{u.firstName} {u.lastName}</label>)}
          </fieldset>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(saveThreshold(v.uid, { kpiId, condition: cond, value: value.trim() ? Number(value) : null, period, scope: { programmes: prog ? [prog as never] : [], geography: null }, recipients, channel: "email", effectiveFrom: null }), "Draft saved")}>Save draft</button>
        </Panel>
      )}
      <Panel padded={false} title="Thresholds">
        <DataTable rows={v.as.thresholds} rowKey={(t) => t.id} caption="Thresholds" emptyTitle="No thresholds drafted" columns={[
          { key: "id", header: "Policy", value: (t) => t.id, render: (t) => <span className="mono small">{t.id}</span> },
          { key: "k", header: "KPI", value: (t) => t.kpiId },
          { key: "c", header: "Condition", value: (t) => `${t.condition} ${t.value ?? "(no value)"}` },
          { key: "a", header: "Current value", value: (t) => k[t.kpiId]?.value ?? -1, render: (t) => (k[t.kpiId]?.value == null ? <span className="muted small">Not available</span> : num(k[t.kpiId].value, 1)) },
          { key: "p", header: "Period", value: (t) => t.period },
          { key: "sc", header: "Scope", value: (t) => t.scope.programmes.join(", ") || "All programmes" },
          { key: "r", header: "Recipients", value: (t) => t.recipients.length, align: "right" },
          { key: "s", header: "Status", value: (t) => t.status, render: (t) => <span><StatusBadge tone={t.status === "active" ? "positive" : "neutral"}>{t.status}</StatusBadge> {t.confirmation !== "confirmed" && <BcrTag>Not confirmed</BcrTag>}</span> },
          { key: "v", header: "Version", value: (t) => t.version, align: "right" },
          { key: "x", header: "", value: () => "", noSearch: true, render: (t) => (v.can("kpi-governance:view") ? <span className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(evaluateThreshold(v.uid, t.id), "Evaluated")}>Evaluate</button>{v.can("kpi-governance:manage") && t.status !== "active" && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(activateThreshold(v.uid, t.id), "Activated")}>Activate</button>}</span> : null) },
        ]} />
      </Panel>
      <Panel padded={false} title="Alert history">
        <DataTable rows={[...v.as.alerts].reverse()} rowKey={(a) => a.id} caption="Alert history" emptyTitle="No threshold breaches recorded" columns={[
          { key: "id", header: "Alert", value: (a) => a.id, render: (a) => <span className="mono small">{a.id}</span> },
          { key: "k", header: "KPI", value: (a) => a.kpiId },
          { key: "v", header: "Actual", value: (a) => a.actual ?? -1, render: (a) => num(a.actual, 1) },
          { key: "t", header: "Threshold", value: (a) => a.threshold ?? -1, render: (a) => num(a.threshold, 1) },
          { key: "p", header: "Period", value: (a) => a.period },
          { key: "s", header: "Scope", value: (a) => a.scope },
          { key: "at", header: "Triggered", value: (a) => a.at, render: (a) => <span className="small">{dt(a.at)}</span> },
          { key: "m", header: "Notification", value: (a) => a.notification, render: (a) => (a.mode === "evaluation_only" ? <StatusBadge tone="neutral">Evaluation only · not sent</StatusBadge> : <StatusBadge tone="positive">Sent</StatusBadge>) },
          { key: "r", header: "Resolution", value: (a) => a.resolution },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= KPI dictionary ======================= */

export function KpiDictionaryPage() {
  const v = useAnalyticsView();
  const [sel, setSel] = useParam("kpi", "");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const k = kpiValues(v.uid);
  const rows = v.as.kpis.filter((x) => (!cat || x.category === cat) && (!status || x.status === status));
  const d = v.as.kpis.find((x) => x.id === sel);
  return (
    <>
      <SectionTitle title="KPI dictionary" description="One approved definition per KPI, used by every dashboard, report, export and alert (SOW 13.1). Definitions and targets change only through approval (WF-038), and every change is a new version" />
      <Notice tone="warn"><strong>Pending Business Confirmation — OP-KPI1.</strong> The SOW definitions are stored word for word and used as provisional development measures. No target is set until V-Guard confirms it (<DecisionRef id="OP-KPI1" />).</Notice>
      <Panel>
        <div className="form-grid">
          <SelectInput label="Category" value={cat} onChange={setCat} options={[{ value: "", label: "All categories" }, ...[...new Set(v.as.kpis.map((x) => x.category))].map((c) => ({ value: c, label: c }))]} />
          <SelectInput label="Confirmation status" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "pending_business_confirmation", label: "Pending business confirmation" }, { value: "confirmed", label: "Confirmed" }]} />
        </div>
      </Panel>
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false}>
          <DataTable rows={rows} rowKey={(x) => x.id} caption="KPI dictionary" onRowClick={(x) => setSel(x.id)} columns={[
            { key: "n", header: "KPI", value: (x) => x.name, render: (x) => <span><strong>{x.name}</strong><br /><span className="mono small muted">{x.id} · v{x.version}</span></span> },
            { key: "d", header: "SOW definition", value: (x) => x.sowDefinition, render: (x) => <span className="small">{x.sowDefinition}</span> },
            { key: "c", header: "Category", value: (x) => x.category },
            { key: "v", header: "Current value", value: (x) => k[x.id]?.value ?? -1, render: (x) => (k[x.id]?.value == null ? <span className="muted small">Not available</span> : num(k[x.id].value, 1)) },
            { key: "t", header: "Target", value: (x) => x.target.value ?? -1, render: (x) => (x.target.value == null ? <span className="muted small">Not set</span> : `${x.target.direction === "min" ? "≥" : "≤"} ${x.target.value}`) },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => (x.status === "confirmed" ? <StatusBadge tone="positive">Confirmed</StatusBadge> : <ProvisionalTag />) },
          ]} />
        </Panel>
        {d ? <KpiDetail d={d} value={k[d.id]} /> : <Panel title="KPI detail"><p className="muted small">Select a KPI</p></Panel>}
      </div>
    </>
  );
}
function KpiDetail({ d, value }: { d: KpiDefinition; value?: { value: number | null; detail: string } }) {
  const v = useAnalyticsView();
  const { result, run } = useRun();
  const [kind, setKind] = useState<"definition" | "target">("definition");
  const [def, setDef] = useState(d.approvedDefinition ?? d.sowDefinition);
  const [formula, setFormula] = useState(d.formula);
  const [tv, setTv] = useState("");
  const [dir, setDir] = useState<"min" | "max">("min");
  const [eff, setEff] = useState(v.now.slice(0, 10));
  const [reason, setReason] = useState("");
  const pending = v.as.kpiChanges.filter((c) => c.kpiId === d.id);
  return (
    <div>
      <Panel title={d.name} subtitle={`${d.id} · version ${d.version} · ${d.sowRef}`}>
        <dl className="dl-grid small">
          <dt>SOW definition</dt><dd>{d.sowDefinition}</dd>
          <dt>Approved definition</dt><dd>{d.approvedDefinition ?? <BcrTag>Pending business confirmation</BcrTag>}</dd>
          <dt>Formula</dt><dd>{d.formula}</dd>
          <dt>Numerator</dt><dd>{d.numerator ?? "—"}</dd>
          <dt>Denominator</dt><dd>{d.denominator ?? "—"}</dd>
          <dt>Measurement period</dt><dd>{d.period}</dd>
          <dt>Aggregation</dt><dd>{d.aggregation}</dd>
          <dt>Programmes</dt><dd>{d.programmes.join(", ")}</dd>
          <dt>Source module</dt><dd>{d.sourceModule}</dd>
          <dt>Source dataset</dt><dd>{d.sourceDataset}</dd>
          <dt>Refresh</dt><dd>{d.refresh}</dd>
          <dt>Unit</dt><dd>{d.unit}</dd>
          <dt>Target</dt><dd>{d.target.value == null ? <BcrTag>Not set</BcrTag> : `${d.target.direction === "min" ? "At least" : "At most"} ${d.target.value} from ${d.target.effectiveFrom}`}</dd>
          <dt>Business owner</dt><dd>{d.businessOwner ?? "Not recorded"}</dd>
          <dt>Effective from</dt><dd>{d.effectiveFrom ?? "—"}</dd>
          <dt>Last modified</dt><dd>{userName(v.acc, d.updatedBy)} · {dt(d.updatedAt)}</dd>
          <dt>Current value</dt><dd>{value?.value == null ? "Not available" : num(value.value, 1)} <span className="muted">({value?.detail})</span></dd>
          {d.inputsMissing && <><dt>Inputs missing</dt><dd>{d.inputsMissing}</dd></>}
        </dl>
      </Panel>
      <Panel title="Version history" padded={false}>
        <DataTable rows={[...d.versions].reverse()} rowKey={(x) => String(x.version)} caption="Versions" searchable={false} columns={[{ key: "v", header: "Version", value: (x) => x.version }, { key: "d", header: "Definition", value: (x) => x.definition, render: (x) => <span className="small">{x.definition}</span> }, { key: "s", header: "Status", value: (x) => x.status }, { key: "e", header: "Effective", value: (x) => x.effectiveFrom ?? "—" }, { key: "a", header: "Approval", value: (x) => x.approvalRequestId ?? "", render: (x) => approvalLinkTo(x.approvalRequestId) }, { key: "n", header: "Note", value: (x) => x.note, render: (x) => <span className="small">{x.note}</span> }]} />
      </Panel>
      {pending.length > 0 && <Panel title="Change requests" padded={false}><DataTable rows={pending} rowKey={(c) => c.id} caption="Change requests" searchable={false} columns={[{ key: "id", header: "Request", value: (c) => c.id }, { key: "k", header: "Kind", value: (c) => c.kind }, { key: "a", header: "Approval", value: (c) => c.approvalRequestId ?? "", render: (c) => approvalLinkTo(c.approvalRequestId) }, { key: "s", header: "Status", value: (c) => c.status }]} /></Panel>}
      {v.can("kpi-governance:submit") && (
        <Panel title="Record a confirmed business decision" subtitle="Goes to V-Guard approval (WF-038); dashboards switch to the new version only after approval">
          <PolicyMessages result={result} />
          <SelectInput label="Change" value={kind} onChange={(x) => setKind(x as typeof kind)} options={[{ value: "definition", label: "Confirmed definition" }, { value: "target", label: "Confirmed target" }]} />
          {kind === "definition" ? (
            <>
              <TextArea label="Confirmed definition" value={def} onChange={setDef} rows={2} />
              <TextArea label="Formula (if it changes)" value={formula} onChange={setFormula} rows={2} />
            </>
          ) : (
            <div className="form-grid"><TextField label="Target value" value={tv} onChange={setTv} inputMode="numeric" /><SelectInput label="Direction" value={dir} onChange={(x) => setDir(x as typeof dir)} options={[{ value: "min", label: "Minimum (at least)" }, { value: "max", label: "Maximum (at most)" }]} /></div>
          )}
          <TextField label="Effective date" type="date" value={eff} onChange={setEff} />
          <TextArea label="Business decision / reason" value={reason} onChange={setReason} rows={2} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(requestKpiChange(v.uid, d.id, kind, kind === "definition" ? { definition: def, formula, effectiveFrom: eff } : { targetValue: tv.trim() ? Number(tv) : null, targetDirection: dir, effectiveFrom: eff }, reason), "Sent for approval")}>Submit for approval</button>
        </Panel>
      )}
    </div>
  );
}

/* ======================= History, exports, lineage, reconciliation, decisions ======================= */

export function HistoryPage() {
  const v = useAnalyticsView();
  const { hash } = useLocation();
  const [tab, setTab] = useParam("tab", "exports");
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" }); }, [hash, tab]);
  const ex = exportHistory(v.uid);
  return (
    <>
      <SectionTitle title="Report history & governance" description="Exports and report runs with the filters and source timestamps they used, data lineage and freshness, reconciliation against the authoritative modules, the decision register and the analytics audit" />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: "exports", label: "Export history", count: ex.length }, { id: "runs", label: "Report runs", count: v.as.executions.length }, { id: "lineage", label: "Lineage & freshness" }, { id: "recon", label: "Reconciliation" }, { id: "decisions", label: "Decision register", count: v.as.decisions.length }, { id: "audit", label: "Audit", count: v.as.audit.length }]} />
      {tab === "exports" && (
        <Panel padded={false} subtitle={v.can("reports:manage") ? "All users' exports" : "Your exports"}>
          <DataTable rows={[...ex].reverse()} rowKey={(e) => e.id} caption="Export history" emptyTitle="No exports yet" columns={[
            { key: "id", header: "Export", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
            { key: "r", header: "Report", value: (e) => REPORTS.find((r) => r.id === e.reportId)?.name ?? e.reportId },
            { key: "f", header: "Format", value: (e) => e.format.toUpperCase() },
            { key: "by", header: "Requested by", value: (e) => userName(v.acc, e.by) },
            { key: "at", header: "Requested", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> },
            { key: "fl", header: "Filters", value: (e) => JSON.stringify(e.filters), render: (e) => <span className="small">{Object.entries(e.filters).filter(([, x]) => x != null).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(",") : x}`).join(" · ") || "None"}</span> },
            { key: "n", header: "Records", value: (e) => e.rows, align: "right" },
            { key: "src", header: "Source timestamp", value: (e) => e.sourceTimestamp, render: (e) => <span className="small">{dt(e.sourceTimestamp)}</span> },
            { key: "s", header: "Status", value: (e) => e.status, render: (e) => <span><StatusBadge tone={e.status === "generated" ? "positive" : "negative"}>{e.status}</StatusBadge>{e.unmasked && <> <StatusBadge tone="warning">Unmasked</StatusBadge></>}{e.reason && <><br /><span className="small">{e.reason}</span></>}</span> },
            { key: "d", header: "Download", value: () => "", render: (e) => <span className="muted small">{e.status === "generated" ? "Generated in the browser at request time (no file store)" : "—"}</span> },
          ]} />
        </Panel>
      )}
      {tab === "runs" && (
        <Panel padded={false}>
          <DataTable rows={[...v.as.executions].reverse()} rowKey={(e) => e.id} caption="Report runs" emptyTitle="No report runs recorded" columns={[{ key: "id", header: "Run", value: (e) => e.id }, { key: "r", header: "Report", value: (e) => e.reportId }, { key: "by", header: "By", value: (e) => userName(v.acc, e.by) }, { key: "at", header: "At", value: (e) => e.at }, { key: "sc", header: "Scope", value: (e) => e.scope }, { key: "n", header: "Rows", value: (e) => e.rows, align: "right" }, { key: "c", header: "Checksum", value: (e) => e.checksum, render: (e) => <span className="mono small">{e.checksum}</span> }]} />
        </Panel>
      )}
      {tab === "lineage" && <Lineage />}
      {tab === "recon" && <Recon />}
      {tab === "decisions" && <Decisions />}
      {tab === "audit" && (
        <Panel padded={false}>
          <DataTable rows={[...v.as.audit].reverse()} rowKey={(a) => a.id} caption="Analytics audit" exportName="analytics-audit" columns={[{ key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="small">{dt(a.at)}</span> }, { key: "u", header: "User", value: (a) => userName(v.acc, a.actor) }, { key: "r", header: "Role", value: (a) => a.role }, { key: "a", header: "Action", value: (a) => a.action.replace(/_/g, " ") }, { key: "e", header: "Entity", value: (a) => a.entity, render: (a) => <span className="mono small">{a.entity}</span> }, { key: "af", header: "Detail", value: (a) => a.after ?? "", render: (a) => <span className="small">{a.after ?? "—"}</span> }, { key: "s", header: "Sensitive", value: (a) => (a.sensitive ? "Yes" : ""), render: (a) => (a.sensitive ? <StatusBadge tone="warning">Sensitive</StatusBadge> : null) }]} />
        </Panel>
      )}
    </>
  );
}
function Lineage() {
  const v = useAnalyticsView();
  const { result, run } = useRun();
  const rows = lineage();
  return (
    <>
      <PolicyMessages result={result} />
      <Panel padded={false} subtitle="Authoritative source per data domain (Build Prompt 12 §25.2)">
        <DataTable rows={rows} rowKey={(r) => r.domain} caption="Lineage" searchable={false} columns={[
          { key: "d", header: "Domain", value: (r) => r.domain },
          { key: "s", header: "Authoritative source", value: (r) => r.source },
          { key: "ds", header: "Dataset", value: (r) => r.dataset, render: (r) => <span className="small">{r.dataset}</span> },
          { key: "f", header: "Freshness", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "stale" || r.status === "unavailable" ? "warning" : "info"}>{FRESHNESS_LABEL[r.status]}</StatusBadge> },
          { key: "l", header: "Last refresh", value: (r) => r.lastRefresh, render: (r) => <span className="small">{dt(r.lastRefresh)}</span> },
          { key: "x", header: "", value: () => "", render: (r) => (v.can("kpi-governance:manage") && r.freshness !== "unavailable" ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setSourceAvailability(v.uid, r.domain, r.status === "stale"), r.status === "stale" ? "Source restored" : "Marked unavailable")}>{r.status === "stale" ? "Restore source" : "Simulate outage"}</button> : null) },
        ]} />
      </Panel>
    </>
  );
}
function Recon() {
  const v = useAnalyticsView();
  const rows = reconciliation(v.uid);
  return (
    <Panel padded={false} subtitle="Analytics totals against each authoritative module. A difference is shown as an exception, never forced to match">
      <DataTable rows={rows} rowKey={(r) => r.id} caption="Reconciliation" searchable={false} columns={[
        { key: "c", header: "Check", value: (r) => r.check },
        { key: "a", header: "Analytics", value: (r) => r.analytics, align: "right" },
        { key: "s", header: "Source", value: (r) => r.source, align: "right" },
        { key: "sn", header: "Source module", value: (r) => r.sourceName },
        { key: "d", header: "Difference", value: (r) => r.difference, align: "right" },
        { key: "st", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "matched" ? "positive" : "negative"}>{r.status === "matched" ? "Matched" : "Exception"}</StatusBadge> },
      ]} />
    </Panel>
  );
}
function Decisions() {
  const v = useAnalyticsView();
  const { result, run } = useRun();
  const [sel, setSel] = useState<AnalyticsDecision | null>(null);
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState("");
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel padded={false}>
        <table className="table">
          <thead><tr><th>Reference</th><th>Decision</th><th>Affects</th><th>Restriction until confirmed</th><th>Status</th></tr></thead>
          <tbody>{v.as.decisions.map((d) => (
            <tr key={d.id} id={d.id} className={`is-clickable ${sel?.id === d.id ? "is-selected" : ""}`} tabIndex={0} onClick={() => { setSel(d); setStatus(d.status); setNotes(d.notes); }} onKeyDown={(e) => { if (e.key === "Enter") { setSel(d); setStatus(d.status); setNotes(d.notes); } }}>
              <td className="mono small">{d.ref}</td><td className="small">{d.description}</td><td className="small">{d.affects}</td><td className="small">{d.restriction}</td>
              <td><StatusBadge tone={d.status === "confirmed" ? "positive" : d.status === "open" ? "warning" : "neutral"}>{d.status.replace(/_/g, " ")}</StatusBadge></td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
      {sel ? (
        <Panel title={sel.ref} subtitle={sel.description}>
          <dl className="dl-grid small"><dt>Business owner</dt><dd>{sel.businessOwner}</dd><dt>Affected calculation</dt><dd>{sel.calculation}</dd><dt>Restriction</dt><dd>{sel.restriction}</dd><dt>Notes</dt><dd>{sel.notes || "—"}</dd></dl>
          {v.can("kpi-governance:manage") && <>
            <PolicyMessages result={result} />
            <SelectInput label="Status" value={status} onChange={setStatus} options={["open", "under_review", "confirmed", "deferred", "out_of_scope"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
            <TextArea label="Confirmation notes" value={notes} onChange={setNotes} rows={3} />
            <button type="button" className="btn btn--primary btn--sm" onClick={() => run(updateAnalyticsDecision(v.uid, sel.id, status as AnalyticsDecision["status"], notes), "Decision updated")}>Save</button>
          </>}
        </Panel>
      ) : <Panel title="Decision detail"><p className="muted small">Select a decision</p></Panel>}
    </div>
  );
}
