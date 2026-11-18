import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarClock, CheckCircle2, ClipboardList, Download, Inbox, Plus, Save, Send, Users } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { RankedBars } from "@/components/ui/DataBars";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, RadioCards, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { CHANNEL, CHANNELS, COMMS_PERMISSIONS, COMMS_SERVICES, DEEP_LINKS, POLICY_LABEL, VARIABLES } from "@/config/commsCatalogue";
import { dispatchSurvey, recordExport, saveSurvey, setPolicy, setRetryPolicy, submitSurvey, updateCommDecision } from "@/features/comms/store";
import type { ApprovalPolicyKey, CommDecision, Survey } from "@/types/comms";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { AudienceBuilder } from "./ComposePage";
import { BcrTag, ChannelTag, ContentBadge, DecisionRef, KpiRow, approvalLink, commLink, dt, useCommsView, useParam, useRun, userName, type CommsView } from "./shared";

/* ======================= Surveys (SOW 7.7) ======================= */

export function SurveysPage() {
  const v = useCommsView();
  const [tab, setTab] = useParam("tab", "surveys");
  const [edit, setEdit] = useState<Survey | null>(null);
  const { result, run } = useRun();
  const s = v.cs.surveys;
  const r = v.cs.responses;
  const sent = s.filter((x) => x.dispatchCommId).reduce((n, x) => n + (v.cs.communications.find((c) => c.id === x.dispatchCommId)?.audienceCount ?? 0), 0);
  return (
    <>
      <SectionTitle title="Survey management" description="Member and Retailer surveys sent through N06 with a link. Authoring source, targeting and triggers are open (OP-SURV1); portal authoring is a labelled mock" actions={v.can("surveys:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", name: "", type: "member", source: "external_link", link: "https://", questions: [], audience: { programmes: ["EP"], states: [], districts: [], branches: [], memberIds: [], roles: [], statuses: [] }, trigger: "manual", geofence: { enabled: false, retailerRef: null, radius: null }, status: "draft", startDate: v.now.slice(0, 10), endDate: v.now.slice(0, 10), dispatchCommId: null, approvalRequestId: null, updatedAt: "", updatedBy: v.uid })}><Plus size={14} aria-hidden="true" />New survey</button>} />
      <Notice tone="warn">Survey source, targeting rules and triggers await confirmation (<DecisionRef id="CD-04" label="OP-SURV1" />). The geofence-triggered retailer survey is a disabled placeholder; no radius is assumed. Responses below are development data, not collected member responses.</Notice>
      <KpiRow
        items={[
          { id: "t", label: "Total surveys", value: s.length, desc: "All sources", icon: ClipboardList, variant: "primary", onSelect: () => setTab("surveys") },
          { id: "d", label: "Draft surveys", value: s.filter((x) => x.status === "draft").length, desc: "Not submitted", icon: ClipboardList, onSelect: () => setTab("surveys") },
          { id: "a", label: "Active surveys", value: s.filter((x) => x.status === "active").length, desc: "Approved and open", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setTab("surveys") },
          { id: "sc", label: "Scheduled surveys", value: s.filter((x) => x.status === "scheduled").length, desc: "Approved, future start", icon: CalendarClock, onSelect: () => setTab("surveys") },
          { id: "c", label: "Completed surveys", value: s.filter((x) => x.status === "completed").length, desc: "Closed", icon: CheckCircle2, onSelect: () => setTab("surveys") },
          { id: "i", label: "Invitations sent", value: sent, desc: "N06 recipients (simulated)", icon: Send, onSelect: () => setTab("surveys") },
          { id: "rr", label: "Responses received", value: r.filter((x) => x.status !== "duplicate_rejected").length, desc: "Development responses", icon: Inbox, onSelect: () => setTab("responses") },
          { id: "rate", label: "Response rate (%)", value: sent ? Math.round((r.filter((x) => x.status === "complete").length / sent) * 100) : 0, desc: sent ? "Complete responses / invitations" : "Not available until invitations are sent", icon: Users, onSelect: () => setTab("responses") },
        ]}
      />
      <PolicyMessages result={result} />
      <Tabs label="Survey sections" value={tab} onChange={setTab} tabs={[{ id: "surveys", label: "Surveys", count: s.length }, { id: "responses", label: "Responses", count: r.length }]} />
      {tab === "surveys" ? (
        <Panel title="Survey directory">
          <DataTable rows={s} rowKey={(x) => x.id} caption="Surveys" onRowClick={(x) => setEdit(structuredClone(x))} columns={[
            { key: "id", header: "Survey ID", value: (x) => x.id },
            { key: "n", header: "Name", value: (x) => x.name },
            { key: "t", header: "Type", value: (x) => x.type },
            { key: "src", header: "Source", value: (x) => x.source.replace("_", " "), render: (x) => <span className="small">{x.source.replace("_", " ")}{x.source === "portal" ? " (mock)" : ""}</span> },
            { key: "aud", header: "Programme", value: (x) => x.audience.programmes.join(", ") },
            { key: "tr", header: "Trigger", value: (x) => x.trigger, render: (x) => (x.trigger === "geofence" ? <BcrTag>Geofence · disabled</BcrTag> : x.trigger) },
            { key: "d", header: "Dispatch", value: (x) => x.dispatchCommId ?? "", render: (x) => (x.dispatchCommId ? commLink(x.dispatchCommId) : "—") },
            { key: "st", header: "Status", value: (x) => x.status, render: (x) => <ContentBadge status={x.status} /> },
            { key: "pd", header: "Period", value: (x) => `${x.startDate} – ${x.endDate}` },
            { key: "rc", header: "Responses", value: (x) => r.filter((y) => y.surveyId === x.id && y.status !== "duplicate_rejected").length, align: "right" },
            { key: "apr", header: "Approval", value: (x) => x.approvalRequestId ?? "", render: (x) => approvalLink(x.approvalRequestId) },
            { key: "act", header: "", value: () => "", render: (x) => (x.status === "draft" && x.trigger !== "geofence" ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(submitSurvey(v.uid, x.id), "Submitted for approval"); }}>Submit</button> : x.status === "active" && !x.dispatchCommId ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(dispatchSurvey(v.uid, x.id), "N06 invitations sent (simulated)"); }}>Send via N06</button> : null) },
          ]} />
        </Panel>
      ) : (
        <Responses v={v} />
      )}
      {edit && <SurveyDrawer v={v} s={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Responses({ v }: { v: CommsView }) {
  const { result, run } = useRun();
  const [survey, setSurvey] = useState("SRV-001");
  const sv = v.cs.surveys.find((x) => x.id === survey);
  const rows = v.cs.responses.filter((x) => x.surveyId === survey);
  const q = sv?.questions.find((x) => x.kind !== "text");
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel title="Response records" actions={<div className="btn-row"><SelectField label="Survey" value={survey} onChange={setSurvey} options={v.cs.surveys.map((x) => ({ value: x.id, label: x.name }))} />{v.can("surveys:export") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { if (run(recordExport(v.uid, "surveys", `survey-${survey}`, rows.length), "Export recorded").ok) downloadCsv(`survey-${survey}-responses.csv`, [{ header: "Response", value: (x: (typeof rows)[number]) => x.id }, { header: "Respondent", value: (x) => x.respondentId }, { header: "Programme", value: (x) => x.programme }, { header: "Submitted", value: (x) => x.submittedAt }, { header: "Status", value: (x) => x.status }, ...(sv?.questions ?? []).map((qq) => ({ header: qq.text, value: (x: (typeof rows)[number]) => x.answers[qq.id] ?? "" }))], rows, "Development responses"); }}><Download size={14} aria-hidden="true" />Export</button>}</div>}>
        <PolicyMessages result={result} />
        <DataTable rows={rows} rowKey={(x) => x.id} caption="Survey responses" columns={[{ key: "s", header: "Survey", value: (x) => x.surveyId }, { key: "m", header: "Respondent", value: (x) => x.respondentId }, { key: "p", header: "Programme", value: (x) => x.programme }, { key: "at", header: "Submitted", value: (x) => x.submittedAt, render: (x) => <span className="num small">{dt(x.submittedAt)}</span> }, { key: "st", header: "Status", value: (x) => x.status, render: (x) => <ContentBadge status={x.status === "duplicate_rejected" ? "rejected" : x.status} /> }, { key: "a", header: "Answer summary", value: (x) => Object.values(x.answers).filter(Boolean).join(" · ") }]} />
      </Panel>
      <Panel title="Aggregate" subtitle={q ? q.text : "No closed question"}>
        {q ? <RankedBars items={q.options.map((o) => ({ key: o, label: o, value: rows.filter((x) => x.status !== "duplicate_rejected" && x.answers[q.id] === o).length }))} /> : <p className="small muted">External surveys report results in the external tool.</p>}
      </Panel>
    </div>
  );
}

function SurveyDrawer({ v, s, onClose }: { v: CommsView; s: Survey; onClose: () => void }) {
  const { result, run } = useRun();
  const [x, setX] = useState(s);
  return (
    <Drawer open onClose={onClose} width={760} title={x.id || "New survey"} footer={<button type="button" className="btn btn--primary" onClick={() => { const r = run(saveSurvey(v.uid, x), "Saved as draft"); if (r.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button>}>
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        <TextField label="Survey name" value={x.name} onChange={(n) => setX({ ...x, name: n })} />
        <SelectInput label="Survey type" value={x.type} onChange={(t) => setX({ ...x, type: t as Survey["type"] })} options={[{ value: "member", label: "Member survey" }, { value: "retailer", label: "Retailer survey" }]} />
        <TextField label="Start date" type="date" value={x.startDate} onChange={(d) => setX({ ...x, startDate: d })} />
        <TextField label="End date" type="date" value={x.endDate} onChange={(d) => setX({ ...x, endDate: d })} />
      </div>
      <RadioCards name="src" label="Authoring source (OP-SURV1)" value={x.source} onChange={(src) => setX({ ...x, source: src })} options={[{ value: "external_link", label: "External link" }, { value: "external_tool", label: "External survey tool" }, { value: "portal", label: "Portal authored (mock)", description: "Development demonstration only" }]} />
      {x.source !== "portal" ? <TextField label="Survey link" value={x.link ?? ""} onChange={(l) => setX({ ...x, link: l })} hint="https:// only" /> : (
        <>
          {x.questions.map((q, i) => <TextField key={q.id} label={`Question ${i + 1} (${q.kind})`} value={q.text} onChange={(t) => setX({ ...x, questions: x.questions.map((y, j) => (j === i ? { ...y, text: t } : y)) })} />)}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setX({ ...x, questions: [...x.questions, { id: `Q${x.questions.length + 1}`, text: "", kind: "rating", options: ["1", "2", "3", "4", "5"] }] })}><Plus size={14} aria-hidden="true" />Add rating question</button>
        </>
      )}
      <SelectInput label="Trigger" value={x.trigger} onChange={(t) => setX({ ...x, trigger: t as Survey["trigger"] })} options={[{ value: "manual", label: "Manual (N06 send)" }, { value: "scheduled", label: "Scheduled" }, { value: "event", label: "Event / rule (pending OP-SURV1)" }, { value: "geofence", label: "Geofence near tagged retailer (disabled)" }]} />
      {x.trigger === "geofence" && <Checkbox label="Enable geofence trigger" checked={false} disabled onChange={() => undefined} description="Disabled until OP-SURV1 confirms scope, radius and retailer tagging" />}
      <h4 className="cfg-sub">Audience</h4>
      <AudienceBuilder v={v} f={x.audience} setF={(p) => setX({ ...x, audience: { ...x.audience, ...p } })} channels={["whatsapp", "inapp"]} />
    </Drawer>
  );
}

/* ======================= Configuration and governance ======================= */

export function CommsConfigPage() {
  const v = useCommsView();
  const [tab, setTab] = useParam("tab", "channels");
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [hash, tab]);
  const { result, run } = useRun();
  const [retry, setRetry] = useState("");
  return (
    <>
      <SectionTitle title="Communication configuration" description="Channels, languages, approval policies, retry, deep links, variables, role-based profile actions, open decisions, service contracts, permissions and audit" />
      <PolicyMessages result={result} />
      <Tabs label="Configuration sections" value={tab} onChange={setTab} tabs={[{ id: "channels", label: "Channels & languages" }, { id: "policies", label: "Approval policies" }, { id: "links", label: "Deep links & variables" }, { id: "profile", label: "Profile actions" }, { id: "decisions", label: "Decision register", count: v.cs.decisions.filter((d) => d.status === "open" || d.status === "under_review").length }, { id: "services", label: "Service contracts" }, { id: "permissions", label: "Permissions" }, { id: "audit", label: "Audit", count: v.cs.audit.length }]} />
      {tab === "channels" && (
        <>
          <Panel title="Five channels">
            <table className="table table--compact"><thead><tr><th>Channel</th><th>SOW use</th><th>Contact</th><th>Provider</th></tr></thead><tbody>{CHANNELS.map((c) => <tr key={c}><th scope="row"><ChannelTag ch={c} /> {CHANNEL[c].label}</th><td className="small">{CHANNEL[c].sowUse}</td><td className="small">{CHANNEL[c].contact}</td><td className="small muted">Mock adapter (not connected)</td></tr>)}</tbody></table>
          </Panel>
          <Panel title="Language coverage by channel" subtitle="Eight languages (development list, CD-05). Coverage marked Unconfirmed until OP-A21 is answered">
            <table className="table table--compact"><thead><tr><th>Language</th>{CHANNELS.map((c) => <th key={c}>{CHANNEL[c].short}</th>)}<th>Bot</th></tr></thead><tbody>{v.cs.languages.map((l) => <tr key={l.code}><th scope="row">{l.name} ({l.code})</th>{[...CHANNELS, "bot" as const].map((c) => <td key={c}>{l.coverage[c] === "confirmed" ? <span className="pos small">Confirmed</span> : <span className="warn-text small">Unconfirmed</span>}</td>)}</tr>)}</tbody></table>
          </Panel>
          <Panel title="Retry and fallback">
            <p className="small">WhatsApp → SMS fallback: only for catalogue entries flagged critical transactional. Retry: {v.cs.retry.maxAttempts == null ? <BcrTag>Not configured · CD-07</BcrTag> : `${v.cs.retry.maxAttempts} attempts`}</p>
            {v.can("communication:manage") && <div className="btn-row"><TextField label="Confirmed max attempts" value={retry} onChange={setRetry} inputMode="numeric" /><button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setRetryPolicy(v.uid, Number(retry)), "Retry policy recorded")}>Record</button></div>}
          </Panel>
        </>
      )}
      {tab === "policies" && (
        <Panel title="Approval policies" subtitle="Development defaults; which categories use the Approval Engine is configurable. Banner publication is restricted to named publishers regardless">
          <table className="table table--compact"><thead><tr><th>Category</th><th>Approval</th><th>Note</th><th /></tr></thead><tbody>{(Object.keys(v.cs.policies) as ApprovalPolicyKey[]).map((k) => <tr key={k}><th scope="row">{POLICY_LABEL[k]}</th><td>{v.cs.policies[k].approval ? "Required" : "Not required"}</td><td className="small">{v.cs.policies[k].note}</td><td>{v.can("communication:manage") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(setPolicy(v.uid, k, !v.cs.policies[k].approval, "Changed in configuration"), "Policy changed")}>Toggle</button>}</td></tr>)}</tbody></table>
        </Panel>
      )}
      {tab === "links" && (
        <div className="grid-2">
          <Panel title="Approved deep-link catalogue"><table className="table table--compact"><tbody>{DEEP_LINKS.map((d) => <tr key={d.id}><td>{d.label}</td><td className="mono small">{d.id}</td></tr>)}</tbody></table></Panel>
          <Panel title="Template-variable registry" subtitle="* required">{Object.entries(VARIABLES).map(([k, vs]) => <p key={k} className="small"><strong>{k}</strong>: <span className="mono">{vs.map((x) => `{{${x.name}}}${x.required ? "*" : ""}`).join(" ")}</span></p>)}</Panel>
        </div>
      )}
      {tab === "profile" && (
        <Panel title="Role-based profile actions (SOW 7.6)" subtitle="The member acts in the app; the backend records it; the communication service receives the resulting event. The portal never simulates consent, activation or KYC completion">
          <table className="table table--compact"><thead><tr><th>Programmes</th><th>Profile information</th><th>Required action</th><th>Deep link</th><th>Notification</th><th>Completion event</th><th>Resulting event</th></tr></thead><tbody>{v.cs.profileActions.map((p) => <tr key={p.id}><td>{p.programmes.join(", ")}</td><td className="small">{p.profileFields.join(", ")}</td><td>{p.action}</td><td className="mono small">{p.deepLink}</td><td>{p.notificationId}</td><td className="mono small">{p.completionEvent}</td><td className="mono small">{p.resultingEvent}</td></tr>)}</tbody></table>
        </Panel>
      )}
      {tab === "decisions" && <Decisions v={v} />}
      {tab === "services" && <Panel title="Service contracts" subtitle="src/services/commsApi.ts · no production endpoints invented"><table className="table table--compact"><tbody>{COMMS_SERVICES.map((s) => <tr key={s.service}><th scope="row">{s.service}</th><td className="small">{s.status}</td></tr>)}</tbody></table></Panel>}
      {tab === "permissions" && <Panel title="Communication permissions"><table className="table table--compact"><thead><tr><th>Permission</th><th>Key</th><th>You</th><th>Note</th></tr></thead><tbody>{COMMS_PERMISSIONS.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td className="mono small">{p.key}</td><td>{v.can(p.key) ? <span className="pos small">Yes</span> : <span className="muted small">No</span>}</td><td className="small">{p.note ?? ""}</td></tr>)}</tbody></table></Panel>}
      {tab === "audit" && <Panel title="Communication audit trail" subtitle="Append-only"><DataTable rows={[...v.cs.audit].reverse()} rowKey={(a) => a.id} caption="Communication audit" columns={[{ key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="num small">{dt(a.at)}</span> }, { key: "ac", header: "Actor", value: (a) => userName(v.acc, a.actor) }, { key: "e", header: "Entity", value: (a) => `${a.entity} ${a.entityId}` }, { key: "a", header: "Action", value: (a) => a.action.replace(/_/g, " ") }, { key: "b", header: "Before", value: (a) => a.before ?? "" }, { key: "af", header: "After", value: (a) => a.after ?? "" }, { key: "r", header: "Reason", value: (a) => a.reason }, { key: "apr", header: "Approval", value: (a) => a.approvalRequestId ?? "", render: (a) => approvalLink(a.approvalRequestId) }]} /></Panel>}
    </>
  );
}

function Decisions({ v }: { v: CommsView }) {
  const { result, run } = useRun();
  const [edit, setEdit] = useState<CommDecision | null>(null);
  const [f, setF] = useState({ status: "open" as CommDecision["status"], answer: "" });
  return (
    <Panel title="Open business decisions" subtitle="Kept visible even where the configuration screens exist">
      <PolicyMessages result={result} />
      <table className="table">
        <thead><tr><th>ID</th><th>Reference</th><th>Question</th><th>Affected module</th><th>Owner</th><th>Implementation restriction</th><th>Status</th><th /></tr></thead>
        <tbody>{v.cs.decisions.map((d) => <tr key={d.id} id={d.id}><td className="mono small">{d.id}</td><td className="small">{d.ref}</td><td className="small">{d.question}{d.answer && <p className="small pos">Answer: {d.answer}</p>}</td><td className="small">{d.module}</td><td className="small">{d.owner}</td><td className="small">{d.treatment}</td><td><StatusBadge tone={d.status === "confirmed" ? "positive" : d.status === "open" ? "warning" : "neutral"}>{d.status.replace("_", " ")}</StatusBadge></td><td>{(v.can("comm-templates:edit") || v.can("communication:manage")) && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => { setEdit(d); setF({ status: d.status, answer: d.answer }); }}>Update</button>}</td></tr>)}</tbody>
      </table>
      {edit && (
        <div className="form-inline">
          <h4 className="cfg-sub">{edit.id} · {edit.ref}</h4>
          <div className="form-grid form-grid--2">
            <SelectInput label="Status" value={f.status} onChange={(x) => setF({ ...f, status: x as CommDecision["status"] })} options={["open", "under_review", "confirmed", "deferred", "out_of_scope"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
            <TextArea label="Confirmation notes" value={f.answer} onChange={(x) => setF({ ...f, answer: x })} rows={2} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updateCommDecision(v.uid, edit.id, f), "Decision updated"); if (r.ok) setEdit(null); }}>Save</button>
        </div>
      )}
    </Panel>
  );
}
