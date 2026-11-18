import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, FolderPlus, Link2, Plus, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, TextArea, TextField } from "@/components/form/Form";
import { CASE_STATUS, OPEN_CASE, RECOMMENDATION, SEVERITY, SOURCE, TRANSITIONS, VECTOR } from "@/config/riskCatalogue";
import { findBranch } from "@/config/geography";
import { stateOptions } from "@/pages/masters/shared";
import { addEvidence, addEventsToCase, addNote, applyRecommendation, assignCase, closeCase, decideCase, eventsFor, linkToCase, openCase, recommend, requestCaseReinstatement, restrictionPreview, setCasePriority, setCaseStatus, viewEvidence } from "@/features/risk/store";
import { useSchemeState } from "@/features/schemes/store";
import { useWalletState } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import { downloadCsv } from "@/lib/csv";
import { exportEvents } from "@/features/risk/store";
import type { CaseStatus, Evidence, RecommendationAction, RiskCase, RiskEvent } from "@/types/risk";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { CaseBadge, EventStatus, FBASE, Score, SeverityBadge, SimTag, SourceTag, VectorTag, approvalLink, caseLink, deviceLink, dt, memberLink, memberName, restrictionState, useFraudView, useParam, useRun, userName, type FraudView } from "./shared";

const investigators = (v: FraudView) => v.acc.users.filter((u) => ["USR-1003", "USR-1004"].includes(u.id));
const ownerOf = (v: FraudView, e: RiskEvent) => v.rs.cases.find((c) => c.id === e.caseId)?.ownerId ?? null;

/* ======================= Central review queue ======================= */

export function ReviewQueuePage() {
  const v = useFraudView();
  const nav = useNavigate();
  const { result, run } = useRun();
  const [vector, setVector] = useParam("vector");
  const [source, setSource] = useParam("source");
  const [severity, setSeverity] = useParam("severity");
  const [status, setStatus] = useParam("status");
  const [programme, setProgramme] = useParam("programme");
  const [state, setState] = useParam("state");
  const [from, setFrom] = useParam("from");
  const [to, setTo] = useParam("to");
  const [owner, setOwner] = useParam("owner");
  const [restricted, setRestricted] = useParam("restricted");
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const all = eventsFor(v.uid);
  const rows = all.filter((e) => {
    const st = e.branchCode ? findBranch(e.branchCode)?.state.code : null;
    const rst = restrictionState(v.mem, e.memberId);
    return (!vector || e.vector === vector) && (!source || e.source === source) && (!severity || (severity === "none" ? !e.severity : e.severity === severity)) && (!status || e.status === status) && (!programme || e.programme === programme) && (!state || st === state) && (!from || e.detectedAt.slice(0, 10) >= from) && (!to || e.detectedAt.slice(0, 10) <= to) && (!owner || ownerOf(v, e) === owner) && (!restricted || (restricted === "yes" ? rst !== "None" && rst !== "—" : rst === "None"));
  });
  const clear = () => [setVector, setSource, setSeverity, setStatus, setProgramme, setState, setFrom, setTo, setOwner, setRestricted].forEach((f) => f(""));
  const openCases = v.rs.cases.filter((c) => OPEN_CASE.includes(c.status));
  return (
    <>
      <SectionTitle title="Central fraud review queue" description="Rule-based, predictive and system-validation signals from every detection service in one queue (SOW 9.1, 9.3). A flag is a signal for review: grouping it into a case, clearing it or recommending a restriction are separate steps" actions={v.can("fraud-rules:export") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(exportEvents(v.uid), "Export recorded"); if (r.ok && r.rows) downloadCsv("risk-events.csv", [{ header: "Event", value: (e: RiskEvent) => e.id }, { header: "Member", value: (e) => e.memberId ?? "" }, { header: "Programme", value: (e) => e.programme ?? "" }, { header: "Vector", value: (e) => e.vector }, { header: "Source", value: (e) => e.source }, { header: "Severity", value: (e) => e.severity ?? "Not supplied" }, { header: "Score", value: (e) => e.score ?? "Not available" }, { header: "Detected", value: (e) => e.detectedAt }, { header: "Status", value: (e) => e.status }, { header: "Case", value: (e) => e.caseId ?? "" }], r.rows, "Development / demo risk data, scoped to the exporting user"); }}>Export</button>} />
      <div className="filters-bar">
        <SelectField label="Fraud vector" value={vector} onChange={setVector} active={!!vector} options={[{ value: "", label: "All vectors" }, ...Object.entries(VECTOR).map(([k, x]) => ({ value: k, label: x.label }))]} />
        <SelectField label="Detection source" value={source} onChange={setSource} active={!!source} options={[{ value: "", label: "All sources" }, ...Object.entries(SOURCE).map(([k, x]) => ({ value: k, label: x }))]} />
        <SelectField label="Severity" value={severity} onChange={setSeverity} active={!!severity} options={[{ value: "", label: "Any severity" }, ...Object.entries(SEVERITY).map(([k, x]) => ({ value: k, label: x.label })), { value: "none", label: "Not supplied" }]} />
        <SelectField label="Investigation status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "Any status" }, { value: "new", label: "New" }, { value: "in_case", label: "In case" }, { value: "cleared", label: "Cleared" }, { value: "confirmed", label: "Confirmed" }]} />
        <SelectField label="Programme" value={programme} onChange={setProgramme} active={!!programme} options={[{ value: "", label: "All programmes" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} />
        <SelectField label="State" value={state} onChange={setState} active={!!state} options={[{ value: "", label: "All states" }, ...stateOptions()]} />
        <SelectField label="Restriction" value={restricted} onChange={setRestricted} active={!!restricted} options={[{ value: "", label: "Any" }, { value: "yes", label: "Member restricted" }, { value: "no", label: "Not restricted" }]} />
        <SelectField label="Investigator" value={owner} onChange={setOwner} active={!!owner} options={[{ value: "", label: "Anyone" }, ...investigators(v).map((u) => ({ value: u.id, label: userName(v.acc, u.id) }))]} />
        <TextField label="From" type="date" value={from} onChange={setFrom} />
        <TextField label="To" type="date" value={to} onChange={setTo} />
        {[vector, source, severity, status, programme, state, from, to, owner, restricted].some(Boolean) && <button type="button" className="btn btn--ghost btn--sm" onClick={clear}>Clear all</button>}
      </div>
      {v.can("fraud-rules:edit") && sel.length > 0 && (
        <div className="selection-bar">
          <span className="small"><strong>{sel.length}</strong> event(s) selected</span>
          <TextField label="Case title" value={title} onChange={setTitle} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(openCase(v.uid, sel, title), "Investigation case opened"); if (r.ok) { setSel([]); nav(`${FBASE}/cases/${r.id}`); } }}><FolderPlus size={14} aria-hidden="true" />Open case</button>
          <SelectInput label="Add to open case" value={target} onChange={setTarget} options={[{ value: "", label: "Choose case" }, ...openCases.map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` }))]} />
          <button type="button" className="btn btn--secondary btn--sm" disabled={!target} onClick={() => { if (run(addEventsToCase(v.uid, target, sel), "Events grouped").ok) setSel([]); }}><Link2 size={14} aria-hidden="true" />Group</button>
        </div>
      )}
      <PolicyMessages result={result} />
      <Panel title={`${rows.length} risk event(s)`} subtitle="Score, severity and priority are shown only when the detection service supplied them" padded={false}>
        <DataTable rows={rows} rowKey={(e) => e.id} caption="Fraud review queue" pageSize={15} initialSort={{ key: "d", dir: "desc" }} onRowClick={(e) => e.caseId && nav(`${FBASE}/cases/${e.caseId}`)} columns={[
          { key: "sel", header: "", value: () => "", noSearch: true, render: (e) => (e.status === "new" && v.can("fraud-rules:edit") ? <input type="checkbox" aria-label={`Select ${e.id}`} checked={sel.includes(e.id)} onClick={(x) => x.stopPropagation()} onChange={(x) => setSel(x.target.checked ? [...sel, e.id] : sel.filter((y) => y !== e.id))} /> : null) },
          { key: "id", header: "Risk event", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}{e.receivedCount > 1 && <span className="muted" title="Duplicate deliveries ignored"> ×{e.receivedCount}</span>}</span> },
          { key: "m", header: "Member ID", value: (e) => e.memberId ?? "", render: (e) => memberLink(e.memberId) },
          { key: "mn", header: "Member name", value: (e) => memberName(v.mem, e.memberId) },
          { key: "p", header: "Programme", value: (e) => e.programme ?? "—" },
          { key: "v", header: "Fraud vector", value: (e) => VECTOR[e.vector].label, render: (e) => <VectorTag v={e.vector} /> },
          { key: "src", header: "Detection source", value: (e) => e.source, render: (e) => <span className="btn-row"><SourceTag s={e.source} />{e.simulated && <SimTag />}</span> },
          { key: "sc", header: "Risk score", value: (e) => e.score, render: (e) => <Score v={e.score} />, align: "right" },
          { key: "sev", header: "Severity", value: (e) => e.severity ?? "", render: (e) => <SeverityBadge s={e.severity} /> },
          { key: "pr", header: "Priority", value: (e) => e.priority ?? "", render: (e) => (e.priority != null ? <span className="num">{e.priority}</span> : <span className="muted small">Manual triage</span>) },
          { key: "d", header: "Detected", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
          { key: "ctx", header: "Detection context", value: (e) => e.context, render: (e) => <span className="small">{e.context}</span> },
          { key: "acc", header: "Account status", value: (e) => (e.memberId ? v.mem.members.find((m) => m.id === e.memberId)?.status ?? "" : ""), render: (e) => <span className="small">{e.memberId ? v.mem.members.find((m) => m.id === e.memberId)?.status.replace(/_/g, " ") : "—"}</span> },
          { key: "rs", header: "Restriction status", value: (e) => restrictionState(v.mem, e.memberId), render: (e) => <span className="small">{restrictionState(v.mem, e.memberId)}</span> },
          { key: "is", header: "Investigation", value: (e) => e.status, render: (e) => <span className="btn-row"><EventStatus s={e.status} />{caseLink(e.caseId)}</span> },
          { key: "o", header: "Investigator", value: (e) => ownerOf(v, e) ?? "", render: (e) => <span className="small">{ownerOf(v, e) ? userName(v.acc, ownerOf(v, e)!) : "—"}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Case list ======================= */

export function CasesPage() {
  const v = useFraudView();
  const nav = useNavigate();
  const [state, setState] = useParam("state");
  const [status, setStatus] = useParam("status");
  const [severity] = useParam("severity");
  const rows = v.rs.cases.filter((c) => (!state || (state === "open" ? OPEN_CASE.includes(c.status) : !OPEN_CASE.includes(c.status))) && (!status || c.status === status) && (!severity || c.eventIds.some((id) => v.rs.events.find((e) => e.id === id)?.severity === severity)) && c.links.memberIds.every((m) => v.canOn("fraud-rules", "view", m)));
  return (
    <>
      <SectionTitle title="Risk case management" description="An investigation groups one or more risk events, members, devices, QR codes and transactions. Member records are never merged; cleared events stay in history" />
      <div className="filters-bar">
        <SelectField label="State" value={state} onChange={setState} active={!!state} options={[{ value: "", label: "All cases" }, { value: "open", label: "Open" }, { value: "resolved", label: "Cleared / closed" }]} />
        <SelectField label="Status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "Any status" }, ...Object.entries(CASE_STATUS).map(([k, x]) => ({ value: k, label: x }))]} />
      </div>
      <Panel title={`${rows.length} case(s)`} padded={false}>
        <DataTable rows={rows} rowKey={(c) => c.id} caption="Risk cases" onRowClick={(c) => nav(`${FBASE}/cases/${c.id}`)} initialSort={{ key: "u", dir: "desc" }} columns={[
          { key: "id", header: "Case", value: (c) => c.id, render: (c) => caseLink(c.id) },
          { key: "t", header: "Title", value: (c) => c.title },
          { key: "v", header: "Category", value: (c) => c.vector, render: (c) => <VectorTag v={c.vector} /> },
          { key: "e", header: "Events", value: (c) => c.eventIds.length, align: "right" },
          { key: "m", header: "Members", value: (c) => c.links.memberIds.join(", "), render: (c) => <span className="small">{c.links.memberIds.join(", ")}</span> },
          { key: "o", header: "Owner", value: (c) => c.ownerId ?? "", render: (c) => (c.ownerId ? userName(v.acc, c.ownerId) : <span className="muted small">Unassigned</span>) },
          { key: "p", header: "Priority", value: (c) => c.priority ?? "", render: (c) => <span className="small">{c.priority?.toUpperCase() ?? "—"}</span> },
          { key: "s", header: "Status", value: (c) => c.status, render: (c) => <CaseBadge s={c.status} /> },
          { key: "u", header: "Updated", value: (c) => c.updatedAt, render: (c) => <span className="small">{dt(c.updatedAt)}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Investigation detail ======================= */

const MANUAL: CaseStatus[] = ["pending_assignment", "under_investigation", "awaiting_evidence", "awaiting_external", "escalated", "restriction_recommended", "closed"];

export function CaseDetailPage() {
  const { caseId = "" } = useParams();
  const v = useFraudView();
  const ws = useWalletState();
  const ss = useSchemeState();
  const { result, run } = useRun();
  const c = v.rs.cases.find((x) => x.id === caseId);
  const [remarks, setRemarks] = useState("");
  if (!c) return <Notice tone="danger">Case {caseId} not found. <Link to={`${FBASE}/cases`}>Back to cases</Link></Notice>;
  if (!c.links.memberIds.every((m) => v.canOn("fraud-rules", "view", m))) return <Notice tone="danger">This case involves members outside your programme or geographical scope.</Notice>;
  const events = v.rs.events.filter((e) => c.eventIds.includes(e.id));
  const edit = v.can("fraud-rules:edit");
  const next = TRANSITIONS[c.status].filter((s) => MANUAL.includes(s));
  const first = events[0];
  return (
    <>
      <div className="wallet-head">
        <div>
          <Link to={`${FBASE}/cases`} className="btn btn--ghost btn--sm"><ArrowLeft size={14} aria-hidden="true" />Cases</Link>
          <h2 className="wallet-head__title">{c.id} · {c.title} <CaseBadge s={c.status} /></h2>
          <p className="muted small">Opened {dt(c.createdAt)} by {userName(v.acc, c.createdBy)} · updated {dt(c.updatedAt)}</p>
        </div>
      </div>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="A · Case summary">
          <dl className="dl-grid">
            <dt>Case ID</dt><dd className="mono">{c.id}</dd>
            <dt>Members</dt><dd>{c.links.memberIds.map((m) => <span key={m}>{memberLink(m)} {memberName(v.mem, m)} · </span>)}</dd>
            <dt>Risk category</dt><dd><VectorTag v={c.vector} /></dd>
            <dt>Severity</dt><dd><SeverityBadge s={events.find((e) => e.severity)?.severity ?? null} /></dd>
            <dt>Detection</dt><dd>{first ? <>{dt(first.detectedAt)} · <SourceTag s={first.source} /></> : "—"}</dd>
            <dt>Case owner</dt><dd>{c.ownerId ? userName(v.acc, c.ownerId) : "Unassigned"}</dd>
            <dt>Priority</dt><dd>{c.priority?.toUpperCase() ?? "Not triaged"} <span className="muted small">(no backend priority supplied)</span></dd>
            <dt>Linked devices</dt><dd>{c.links.deviceIds.map((d) => <span key={d}>{deviceLink(d)} </span>)}{!c.links.deviceIds.length && "—"}</dd>
            <dt>QR / scans / redemptions</dt><dd className="small">{[...c.links.qrRefs.map((q) => `QR ••••${q.slice(-4)}`), ...c.links.scanRefs, ...c.links.redemptionRefs].join(", ") || "—"}</dd>
          </dl>
        </Panel>
        <Panel title="Workflow" subtitle="Transitions follow the case state machine">
          {v.can("fraud-rules:manage") && <AssignBox v={v} c={c} run={run} />}
          {edit && next.length > 0 && (
            <div className="form-inline">
              <TextField label="Remarks" value={remarks} onChange={setRemarks} />
              <div className="btn-row">{next.map((s) => <button key={s} type="button" className="btn btn--secondary btn--xs" onClick={() => { if (run(s === "closed" ? closeCase(v.uid, c.id, remarks) : setCaseStatus(v.uid, c.id, s, remarks), `${CASE_STATUS[s]}`).ok) setRemarks(""); }}>{s === "awaiting_evidence" ? "Request more information" : s === "escalated" ? "Escalate" : CASE_STATUS[s]}</button>)}</div>
            </div>
          )}
          <ul className="activity-list">{[...c.history].reverse().map((h, k) => <li key={k} className="small"><strong>{CASE_STATUS[h.to]}</strong> {h.remarks} <span className="muted">{dt(h.at)} · {userName(v.acc, h.by)}</span></li>)}</ul>
        </Panel>
      </div>
      <Panel title="B · Risk events" padded={false}>
        <DataTable rows={events} rowKey={(e) => e.id} caption="Case events" searchable={false} columns={[
          { key: "id", header: "Event", value: (e) => e.id },
          { key: "v", header: "Type", value: (e) => e.vector, render: (e) => <VectorTag v={e.vector} /> },
          { key: "t", header: "Trigger", value: (e) => e.context, render: (e) => <span className="small">{e.context}</span> },
          { key: "d", header: "Date / time", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
          { key: "s", header: "Source", value: (e) => e.source, render: (e) => <SourceTag s={e.source} /> },
          { key: "r", header: "Rule / model", value: (e) => e.ruleRef ?? e.modelRef ?? "", render: (e) => <span className="small">{e.ruleRef ?? e.modelRef ?? "—"}</span> },
          { key: "o", header: "Detection output", value: (e) => JSON.stringify(e.signal), render: (e) => <code className="small">{Object.entries(e.signal).map(([k, x]) => `${k}: ${x ?? "—"}`).join(" · ")}</code> },
          { key: "sc", header: "Score", value: (e) => e.score, render: (e) => <Score v={e.score} /> },
          { key: "st", header: "Status", value: (e) => e.status, render: (e) => <EventStatus s={e.status} /> },
        ]} />
      </Panel>
      <div className="grid-2">
        <MemberContext v={v} c={c} ws={ws} ss={ss} />
        <Panel title="D · Financial impact" subtitle="Read from the Wallet and Finance services; nothing is recalculated here">
          {c.links.memberIds.map((m) => {
            const b = memberBalances(ws, ss, v.mem, m);
            const reds = ws.redemptions.filter((r) => r.memberId === m);
            return (
              <div key={m} className="review-card small">
                <strong>{m}</strong> · available {b.available.toLocaleString("en-IN")} · scheme (unsettled) {b.scheme.toLocaleString("en-IN")} points
                <div>Redemptions: {reds.length} · pending {reds.filter((r) => !["paid", "delivered", "failed", "reversed", "cancelled"].includes(r.stage)).map((r) => r.id).join(", ") || "none"}</div>
                <div>Ledger references in this case: {c.links.ledgerRefs.map((l) => <Link key={l} to={`/wallet/ledger/${l}`} className="mono">{l} </Link>)}{!c.links.ledgerRefs.length && "none"}</div>
                <div>Reversals: {ws.reversals.filter((r) => r.memberId === m).map((r) => r.id).join(", ") || "none"}</div>
              </div>
            );
          })}
        </Panel>
      </div>
      <div className="grid-2">
        <EvidencePanel v={v} c={c} run={run} />
        <NotesPanel v={v} c={c} run={run} events={events} />
      </div>
      <DecisionPanel v={v} c={c} run={run} />
    </>
  );
}

type Run = ReturnType<typeof useRun>["run"];

function AssignBox({ v, c, run }: { v: FraudView; c: RiskCase; run: Run }) {
  const [owner, setOwner] = useState(c.ownerId ?? "");
  return (
    <div className="form-row">
      <SelectInput label="Investigator" value={owner} onChange={setOwner} options={[{ value: "", label: "Choose" }, ...investigators(v).map((u) => ({ value: u.id, label: userName(v.acc, u.id) }))]} />
      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--xs" disabled={!owner} onClick={() => run(assignCase(v.uid, c.id, owner), "Investigator assigned")}>Assign</button>
        <select className="select select--xs" value={c.priority ?? ""} aria-label="Priority" onChange={(e) => run(setCasePriority(v.uid, c.id, (e.target.value || null) as RiskCase["priority"]), "Priority set")}><option value="">No priority</option>{["p1", "p2", "p3", "p4"].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}</select>
      </div>
    </div>
  );
}

function MemberContext({ v, c, ws, ss }: { v: FraudView; c: RiskCase; ws: ReturnType<typeof useWalletState>; ss: ReturnType<typeof useSchemeState> }) {
  return (
    <Panel title="C · Member context" subtitle="Summary only: open Member 360 for the full profile">
      {c.links.memberIds.map((id) => {
        const m = v.mem.members.find((x) => x.id === id);
        if (!m) return null;
        const linked = v.mem.members.filter((x) => x.identityId === m.identityId);
        const docs = v.mem.documents.filter((d) => d.memberId === id);
        const scans = ss.txns.filter((t) => t.memberId === id && t.kind === "scan");
        const devs = v.rs.devices.filter((d) => d.associations.some((a) => a.memberId === id));
        return (
          <div key={id} className="review-card small">
            <strong>{memberLink(id)} {m.name}</strong> · {m.programme} · {m.status.replace(/_/g, " ")} · <Link to={`/members/member/${id}`}>Member 360</Link>
            <div>Memberships under this identity: {linked.map((x) => `${x.id} (${x.programme})`).join(", ")}</div>
            <div>Registration: {m.registration.source.replace(/_/g, " ")} · {m.registration.ref}</div>
            <div>KYC: {docs.filter((d) => d.status === "approved").length} approved of {docs.filter((d) => d.status !== "not_applicable").length}</div>
            <div>Restrictions: {restrictionState(v.mem, id)}</div>
            <div>Branch mapping: {m.branchCode} ({findBranch(m.branchCode)?.district.name ?? "—"})</div>
            <div>Scans: {scans.length} · last {scans.slice(-1)[0]?.date ?? "—"} · Redemptions: {ws.redemptions.filter((r) => r.memberId === id).length}</div>
            <div>Devices: {devs.map((d) => <span key={d.id}>{deviceLink(d.id)} </span>)}{!devs.length && "none recorded"}</div>
          </div>
        );
      })}
    </Panel>
  );
}

function EvidencePanel({ v, c, run }: { v: FraudView; c: RiskCase; run: Run }) {
  const [f, setF] = useState<Pick<Evidence, "kind" | "ref" | "description" | "sensitive">>({ kind: "scan", ref: "", description: "", sensitive: false });
  const [link, setLink] = useState<{ kind: keyof RiskCase["links"]; ref: string }>({ kind: "memberIds", ref: "" });
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  return (
    <Panel title="E · Evidence" subtitle="Sensitive evidence opens only with Fraud & risk rules: View sensitive">
      <ul className="check-list">
        {c.evidence.map((e) => (
          <li key={e.id} className="small">
            <span className="mono">{e.id}</span> · {e.kind.replace("_", " ")} · {e.sensitive && !opened[e.id] ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => { const r = run(viewEvidence(v.uid, c.id, e.id), "Evidence opened (audited)"); if (r.ok) setOpened({ ...opened, [e.id]: true }); }}>Open sensitive evidence</button> : <>{e.ref} · {e.description}</>} <span className="muted">{dt(e.addedAt)} · {userName(v.acc, e.addedBy)}</span>
          </li>
        ))}
        {!c.evidence.length && <li className="muted small">No evidence attached</li>}
      </ul>
      {v.can("fraud-rules:edit") && c.status !== "closed" && (
        <>
          <div className="form-row">
            <SelectInput label="Evidence type" value={f.kind} onChange={(x) => setF({ ...f, kind: x as Evidence["kind"] })} options={["scan", "qr", "device", "login_location", "transaction", "rule_output", "attachment"].map((k) => ({ value: k, label: k.replace("_", " ") }))} />
            <TextField label="Reference" value={f.ref} onChange={(x) => setF({ ...f, ref: x })} />
          </div>
          <TextField label="Description" value={f.description} onChange={(x) => setF({ ...f, description: x })} />
          <Checkbox label="Sensitive (masked unless authorised)" checked={f.sensitive} onChange={(x) => setF({ ...f, sensitive: x })} />
          <button type="button" className="btn btn--secondary btn--xs" onClick={() => { if (run(addEvidence(v.uid, c.id, f), "Evidence attached").ok) setF({ ...f, ref: "", description: "" }); }}><Plus size={12} aria-hidden="true" />Attach evidence</button>
          <div className="form-row form-inline">
            <SelectInput label="Link reference" value={link.kind} onChange={(x) => setLink({ ...link, kind: x as keyof RiskCase["links"] })} options={[{ value: "memberIds", label: "Member ID" }, { value: "deviceIds", label: "Device ID" }, { value: "qrRefs", label: "QR reference" }, { value: "scanRefs", label: "Scan reference" }, { value: "redemptionRefs", label: "Redemption" }, { value: "ledgerRefs", label: "Ledger entry" }]} />
            <TextField label="Reference" value={link.ref} onChange={(x) => setLink({ ...link, ref: x })} />
          </div>
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => { if (run(linkToCase(v.uid, c.id, link.kind, link.ref), "Reference linked").ok) setLink({ ...link, ref: "" }); }}><Link2 size={12} aria-hidden="true" />Link (no record is merged)</button>
        </>
      )}
    </Panel>
  );
}

function NotesPanel({ v, c, run, events }: { v: FraudView; c: RiskCase; run: Run; events: RiskEvent[] }) {
  const [text, setText] = useState("");
  const [eventId, setEventId] = useState("");
  return (
    <Panel title="F · Investigator notes" subtitle="Append-only: earlier notes cannot be edited">
      <ul className="activity-list">{c.notes.map((n) => <li key={n.id} className="small"><strong>{userName(v.acc, n.by)}</strong> <span className="muted">{dt(n.at)} · {n.orgId ?? "—"} · {n.visibility.replace(/_/g, " ")}{n.eventId ? ` · ${n.eventId}` : ""}</span><div>{n.text}</div></li>)}</ul>
      {v.can("fraud-rules:edit") && c.status !== "closed" && (
        <>
          <TextArea label="Note" value={text} onChange={setText} />
          <SelectInput label="Linked event" value={eventId} onChange={setEventId} options={[{ value: "", label: "None" }, ...events.map((e) => ({ value: e.id, label: e.id }))]} />
          <button type="button" className="btn btn--secondary btn--xs" onClick={() => { if (run(addNote(v.uid, c.id, text, eventId || null), "Note added").ok) setText(""); }}>Add note</button>
        </>
      )}
    </Panel>
  );
}

function DecisionPanel({ v, c, run }: { v: FraudView; c: RiskCase; run: Run }) {
  const [action, setAction] = useState<RecommendationAction>("program_block");
  const [targetId, setTargetId] = useState(c.links.memberIds[0] ?? "");
  const [reason, setReason] = useState("");
  const [outcomeRemarks, setOutcomeRemarks] = useState("");
  const [applyRemarks, setApplyRemarks] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const can = v.can("fraud-rules:edit");
  const pv = preview ? (() => { const rec = c.recommendations.find((r) => r.id === preview)!; return rec.action === "program_block" || rec.action === "temporary_hold" ? restrictionPreview(rec.targetId, rec.action) : null; })() : null;
  return (
    <Panel title="G · Decision" subtitle="A recommendation never applies a restriction. Program Block and Temporary Hold are applied in Member Management by a user with that permission; device blocks need approval">
      {c.decision && <Notice tone={c.decision.outcome === "cleared" ? "ok" : "warn"}>Decision: <strong>{c.decision.outcome.replace("_", " ")}</strong> by {userName(v.acc, c.decision.by)} on {dt(c.decision.at)}: {c.decision.remarks}</Notice>}
      {can && ["under_investigation", "escalated"].includes(c.status) && (
        <div className="form-inline">
          <TextField label="Decision reasoning" value={outcomeRemarks} onChange={setOutcomeRemarks} />
          <div className="btn-row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(decideCase(v.uid, c.id, "cleared", outcomeRemarks), "Flag cleared")}>Clear flag</button>
            <button type="button" className="btn btn--danger btn--sm" onClick={() => run(decideCase(v.uid, c.id, "confirmed_misuse", outcomeRemarks), "Misuse confirmed")}>Confirm misuse</button>
          </div>
        </div>
      )}
      {can && ["under_investigation", "escalated", "confirmed_misuse", "restriction_recommended"].includes(c.status) && (
        <div className="form-inline">
          <div className="form-row">
            <SelectInput label="Recommend" value={action} onChange={(x) => { setAction(x as RecommendationAction); setTargetId(x === "device_block" ? c.links.deviceIds[0] ?? "" : c.links.memberIds[0] ?? ""); }} options={Object.entries(RECOMMENDATION).map(([k, x]) => ({ value: k, label: x.label }))} />
            <SelectInput label="Target" value={targetId} onChange={setTargetId} options={(action === "device_block" ? c.links.deviceIds : c.links.memberIds).map((x) => ({ value: x, label: x }))} />
          </div>
          <p className="small muted">{RECOMMENDATION[action].applies}</p>
          <TextField label="Reason" value={reason} onChange={setReason} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(recommend(v.uid, c.id, action, targetId, reason), "Recommendation recorded")}><Send size={14} aria-hidden="true" />Record recommendation</button>
        </div>
      )}
      <DataTable rows={c.recommendations} rowKey={(r) => r.id} caption="Recommendations" searchable={false} columns={[
        { key: "id", header: "Recommendation", value: (r) => r.id },
        { key: "a", header: "Action", value: (r) => RECOMMENDATION[r.action].label },
        { key: "t", header: "Target", value: (r) => r.targetId },
        { key: "r", header: "Reason", value: (r) => r.reason, render: (r) => <span className="small">{r.reason}</span> },
        { key: "by", header: "By", value: (r) => userName(v.acc, r.by) },
        { key: "s", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "applied" ? "negative" : r.status === "not_supported" ? "neutral" : "warning"}>{r.status.replace("_", " ")}</StatusBadge> },
        { key: "ref", header: "Applied reference", value: (r) => r.appliedRef ?? "", render: (r) => <span className="mono small">{r.appliedRef ?? "—"}{r.appliedBy ? ` · ${userName(v.acc, r.appliedBy)}` : ""}</span> },
        { key: "x", header: "", value: () => "", render: (r) => (r.status === "recommended" && r.action !== "monitor" ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => setPreview(r.id)}>Review impact</button> : null) },
      ]} />
      {preview && (
        <div className="review-card">
          <strong>Restriction impact preview</strong>
          {pv ? (
            <dl className="dl-grid small">
              <dt>Member</dt><dd>{pv.member.id} · {pv.member.name}</dd>
              <dt>Programme memberships</dt><dd>{pv.memberships.map((m) => `${m.id} (${m.programme})${m.affected ? " · restricted" : " · unaffected"}`).join("; ")}</dd>
              <dt>Scan / redemption</dt><dd>Blocked for the restricted membership(s)</dd>
              <dt>New enrolment</dt><dd>{pv.newEnrolmentBlocked ? "Blocked for this identity" : "Not affected"}</dd>
              <dt>Existing restrictions</dt><dd>{pv.existing.map((r) => r.id).join(", ") || "None"}</dd>
              <dt>Pending redemptions</dt><dd>{pv.pendingRedemptions.join(", ") || "None"}</dd>
              <dt>Available points</dt><dd>{pv.balances.map((b) => `${b.id}: ${b.available.toLocaleString("en-IN")}`).join("; ")}</dd>
            </dl>
          ) : <p className="small">Device block: the linked accounts are listed on the device page; the request needs approval.</p>}
          <TextField label="Remarks (mandatory)" value={applyRemarks} onChange={setApplyRemarks} hint="Applying needs the Member Management or Device permission; you act under your own access" />
          <div className="btn-row">
            <button type="button" className="btn btn--danger btn--sm" onClick={() => { if (run(applyRecommendation(v.uid, c.id, preview, applyRemarks), "Applied through the authorised workflow").ok) setPreview(null); }}>Apply through authorised workflow</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
      {c.status === "restriction_applied" && <Reinstate v={v} c={c} run={run} />}
      {c.status === "closed" && <p className="small muted"><Briefcase size={12} aria-hidden="true" /> Closed cases and their events stay in Investigation history.</p>}
    </Panel>
  );
}

function Reinstate({ v, c, run }: { v: FraudView; c: RiskCase; run: Run }) {
  const applied = c.recommendations.filter((r) => r.status === "applied" && r.appliedRef?.startsWith("RST-"));
  const [reason, setReason] = useState("");
  if (!applied.length) return null;
  return (
    <div className="form-inline">
      <p className="small">Reinstatement goes through Member Management and the Approval Engine (member_reinstate).</p>
      <TextField label="Reinstatement reason" value={reason} onChange={setReason} />
      <div className="btn-row">{applied.map((r) => <button key={r.id} type="button" className="btn btn--secondary btn--xs" onClick={() => run(requestCaseReinstatement(v.uid, c.id, r.appliedRef!, reason), "Reinstatement submitted")}>Request reinstatement of {r.appliedRef}</button>)}</div>
      {applied.map((r) => <span key={r.id} className="small muted">{approvalLink(v.mem.restrictions.find((x) => x.id === r.appliedRef)?.reinstatement?.requestId)}</span>)}
    </div>
  );
}

/* ======================= Investigation history ======================= */

export function InvestigationHistoryPage() {
  const v = useFraudView();
  const nav = useNavigate();
  const closed = v.rs.cases.filter((c) => !OPEN_CASE.includes(c.status));
  const cleared = v.rs.events.filter((e) => e.status === "cleared" || e.status === "confirmed");
  return (
    <>
      <SectionTitle title="Fraud investigation history" description="Closed and cleared cases with their decisions. Risk events are never deleted: a wrongly flagged member keeps their full history" />
      <Panel title={`${closed.length} resolved case(s)`} padded={false}>
        <DataTable rows={closed} rowKey={(c) => c.id} caption="Resolved cases" onRowClick={(c) => nav(`${FBASE}/cases/${c.id}`)} columns={[
          { key: "id", header: "Case", value: (c) => c.id, render: (c) => caseLink(c.id) },
          { key: "t", header: "Title", value: (c) => c.title },
          { key: "v", header: "Category", value: (c) => c.vector, render: (c) => <VectorTag v={c.vector} /> },
          { key: "d", header: "Decision", value: (c) => c.decision?.outcome ?? "", render: (c) => <span className="small">{c.decision ? `${c.decision.outcome.replace("_", " ")} · ${c.decision.remarks}` : c.recommendations.map((r) => `${r.action} ${r.appliedRef ?? ""}`).join(", ") || "—"}</span> },
          { key: "by", header: "Decided by", value: (c) => c.decision?.by ?? "", render: (c) => (c.decision ? userName(v.acc, c.decision.by) : "—") },
          { key: "s", header: "Status", value: (c) => c.status, render: (c) => <CaseBadge s={c.status} /> },
        ]} />
      </Panel>
      <Panel title={`${cleared.length} reviewed risk event(s)`} subtitle="Kept with their original detection output" padded={false}>
        <DataTable rows={cleared} rowKey={(e) => e.id} caption="Reviewed events" columns={[
          { key: "id", header: "Event", value: (e) => e.id },
          { key: "m", header: "Member", value: (e) => e.memberId ?? "", render: (e) => memberLink(e.memberId) },
          { key: "v", header: "Vector", value: (e) => e.vector, render: (e) => <VectorTag v={e.vector} /> },
          { key: "c", header: "Context", value: (e) => e.context, render: (e) => <span className="small">{e.context}</span> },
          { key: "d", header: "Detected", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
          { key: "s", header: "Outcome", value: (e) => e.status, render: (e) => <EventStatus s={e.status} /> },
          { key: "case", header: "Case", value: (e) => e.caseId ?? "", render: (e) => caseLink(e.caseId) },
        ]} />
      </Panel>
    </>
  );
}
