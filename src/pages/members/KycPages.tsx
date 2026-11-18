import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Ban, CheckCircle2, Download, Eye, FileCheck2, FileX2, Hourglass, Landmark, RotateCcw, ScanFace, Undo2, Wallet } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { ProgrammeTag, SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, TextArea } from "@/components/form/Form";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { DOC_LABEL, DOC_STATUS, PAN_ROUTE, PROGRAMME_REQUIREMENTS, REJECTION_REASONS } from "@/config/memberProgrammes";
import { GEOGRAPHY } from "@/config/geography";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { demoNow } from "@/features/approvals/store";
import { ageingDays, branchInfo, canOn, canReviewDocs, memberById, requirementFor } from "@/features/members/engine";
import { accessDocument, reviewDocument, startDocumentReview, updateMemberDecision } from "@/features/members/store";
import { formatDateTime } from "@/lib/format";
import type { DocType, KycDocument, Member, MemberDecision } from "@/types/members";
import { AccessDenied, PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { DocBadge, MemberEventsTable, useMemberView, userName } from "./shared";

interface Row {
  d: KycDocument;
  m: Member;
}

/** Documents that count: applicable to the programme (mandatory or optional) and inside the viewer's scope. */
function useKycRows() {
  const v = useMemberView("registration-kyc");
  const byId = new Map(v.visible.map((m) => [m.id, m]));
  const rows: Row[] = v.s.documents.filter((d) => byId.has(d.memberId)).map((d) => ({ d, m: byId.get(d.memberId)! })).filter(({ d, m }) => ["mandatory", "optional"].includes(requirementFor(m, d.type)?.requirement ?? ""));
  return { v, rows };
}

export function KycQueuePage() {
  const { v, rows } = useKycRows();
  const navigate = useNavigate();
  const now = demoNow();
  const [f, setF] = useState({ q: "", prog: "all", type: "all", status: "open", method: "all", state: "all", reviewer: "all", age: "all", mine: false });
  const set = (k: keyof typeof f, val: string | boolean) => setF((x) => ({ ...x, [k]: val }));
  const n = (type: DocType | null, statuses: string[]) => rows.filter(({ d }) => (!type || d.type === type) && statuses.includes(d.status)).length;
  const open = ["pending", "under_review"];
  const pendingUnlock = v.visible.filter((m) => ["active_scan", "redemption_kyc_pending"].includes(m.status) && rows.some((r) => r.m.id === m.id && r.d.type === "bank" && r.d.status !== "not_submitted")).length;
  const kp = (_id: string, type: DocType | "all", status: string) => () => setF((x) => ({ ...x, type, status }));
  const filtered = rows.filter(({ d, m }) => {
    const t = f.q.trim().toLowerCase();
    if (t && ![d.id, m.id, m.name].join(" ").toLowerCase().includes(t)) return false;
    if (f.prog !== "all" && m.programme !== f.prog) return false;
    if (f.type !== "all" && d.type !== f.type) return false;
    if (f.status === "open" ? !open.includes(d.status) : f.status !== "all" && d.status !== f.status) return false;
    if (f.method !== "all" && d.method !== f.method) return false;
    if (f.state !== "all" && branchInfo(m)?.state.code !== f.state) return false;
    if (f.reviewer !== "all" && d.reviewedBy !== f.reviewer) return false;
    if (f.age !== "all" && (!d.submittedAt || ageingDays(d.submittedAt, now) < Number(f.age))) return false;
    if (f.mine && !(open.includes(d.status) && canReviewDocs(v.acc, v.uid, m, "approve").ok)) return false;
    return true;
  });
  const cols: Column<Row>[] = [
    { key: "id", header: "KYC reference", value: (r) => r.d.id, render: (r) => <span className="mono small">{r.d.id}</span> },
    { key: "m", header: "Member ID", value: (r) => r.m.id, render: (r) => <span className="mono small">{r.m.id}</span> },
    { key: "name", header: "Member name", value: (r) => r.m.name },
    { key: "p", header: "Programme", value: (r) => r.m.programme, render: (r) => <ProgrammeTag code={r.m.programme} size="sm" /> },
    { key: "t", header: "Document", value: (r) => DOC_LABEL[r.d.type] },
    { key: "mask", header: "Masked identifier", value: (r) => r.d.maskedId ?? "", render: (r) => <span className="mono small">{r.d.maskedId ?? "—"}</span> },
    { key: "sub", header: "Submitted", value: (r) => r.d.submittedAt ?? "", render: (r) => <span className="small num">{r.d.submittedAt ? formatDateTime(r.d.submittedAt).split(",")[0] : "—"}</span> },
    { key: "meth", header: "Method", value: (r) => r.d.method, render: (r) => <span className="small">{r.d.method}</span> },
    { key: "st", header: "Status", value: (r) => r.d.status, render: (r) => <DocBadge status={r.d.status} /> },
    { key: "rev", header: "Reviewer", value: (r) => r.d.reviewedBy ?? "", render: (r) => <span className="small">{r.d.reviewedBy ? (r.d.reviewedBy === "SYSTEM" ? "System" : userName(v.acc, r.d.reviewedBy)) : "—"}</span> },
    { key: "age", header: "Ageing", value: (r) => (r.d.submittedAt ? ageingDays(r.d.submittedAt, now) : -1), align: "right", render: (r) => <span className="num">{r.d.submittedAt ? `${ageingDays(r.d.submittedAt, now)}d` : "—"}</span> },
    { key: "a", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (r) => r.d.submittedAt && <Link to={`/registration-kyc/kyc/doc/${r.d.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>Review</Link> },
  ];
  return (
    <>
      <SectionTitle title="KYC verification" description="Document-wise review. Only documents applicable to each programme are counted" />
      <KpiGrid cols={4} items={[
        { id: "all", label: "Total KYC records", value: rows.length, desc: "Applicable documents in scope", variant: "dark", icon: FileCheck2, onSelect: kp("all", "all", "all") },
        { id: "ap", label: "Pending Aadhaar", value: n("aadhaar", open), desc: "Awaiting verification", variant: "status", tone: "warning", icon: Hourglass, onSelect: kp("ap", "aadhaar", "open") },
        { id: "aa", label: "Approved Aadhaar", value: n("aadhaar", ["approved"]), desc: "Verified identity", variant: "status", tone: "positive", icon: BadgeCheck, onSelect: kp("aa", "aadhaar", "approved") },
        { id: "ar", label: "Rejected Aadhaar", value: n("aadhaar", ["rejected", "verification_failed"]), desc: "Rejected or failed", variant: "status", tone: "negative", icon: FileX2, onSelect: kp("ar", "aadhaar", "verification_failed") },
        { id: "pp", label: "Pending PAN", value: n("pan", open), desc: "Route pending OP-17", variant: "status", tone: "warning", icon: Hourglass, onSelect: kp("pp", "pan", "open") },
        { id: "pa", label: "Approved PAN", value: n("pan", ["approved"]), desc: "Verified PAN", variant: "light", icon: BadgeCheck, onSelect: kp("pa", "pan", "approved") },
        { id: "pr", label: "Rejected PAN", value: n("pan", ["rejected", "verification_failed"]), desc: "Rejected or failed", variant: "light", icon: FileX2, onSelect: kp("pr", "pan", "rejected") },
        { id: "bp", label: "Pending bank verification", value: n("bank", open), desc: "Penny-less verification", variant: "primary", icon: Landmark, onSelect: kp("bp", "bank", "open") },
        { id: "sp", label: "Pending selfie / liveness", value: n("selfie", open), desc: "Awaiting review", variant: "light", icon: ScanFace, onSelect: kp("sp", "selfie", "open") },
        { id: "rj", label: "Total KYC rejections", value: n(null, ["rejected"]), desc: "All document types", variant: "status", tone: "negative", icon: Ban, onSelect: kp("rj", "all", "rejected") },
        { id: "ru", label: "Re-uploads awaiting review", value: rows.filter(({ d }) => d.resubmissions > 0 && open.includes(d.status)).length + n(null, ["reupload_required"]), desc: "Re-upload requested or resubmitted", variant: "light", icon: RotateCcw, onSelect: kp("ru", "all", "reupload_required") },
        { id: "un", label: "Pending redemption unlock", value: pendingUnlock, desc: "Bank submitted; Stage 2 not complete", variant: "status", tone: "warning", icon: Wallet, onSelect: kp("un", "bank", "open") },
      ]} />
      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={f.q} onChange={(x) => set("q", x)} placeholder="KYC reference, member ID or name" label="Search KYC queue" />
          <SelectField label="Programme" value={f.prog} onChange={(x) => set("prog", x)} options={[{ value: "all", label: "All" }, ...PROGRAMME_REQUIREMENTS.map((r) => ({ value: r.code, label: r.code }))]} active={f.prog !== "all"} />
          <SelectField label="Document" value={f.type} onChange={(x) => set("type", x)} options={[{ value: "all", label: "All" }, ...Object.entries(DOC_LABEL).map(([k, l]) => ({ value: k, label: l }))]} active={f.type !== "all"} />
          <SelectField label="Status" value={f.status} onChange={(x) => set("status", x)} options={[{ value: "open", label: "Pending or under review" }, { value: "all", label: "All" }, ...Object.entries(DOC_STATUS).map(([k, x]) => ({ value: k, label: x.label }))]} active={f.status !== "all"} />
          <SelectField label="Method" value={f.method} onChange={(x) => set("method", x)} options={[{ value: "all", label: "All" }, ...Array.from(new Set(rows.map((r) => r.d.method))).map((x) => ({ value: x, label: x }))]} active={f.method !== "all"} />
          <SelectField label="State" value={f.state} onChange={(x) => set("state", x)} options={[{ value: "all", label: "All" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} active={f.state !== "all"} />
          <SelectField label="Reviewer" value={f.reviewer} onChange={(x) => set("reviewer", x)} options={[{ value: "all", label: "Any" }, ...Array.from(new Set(rows.map((r) => r.d.reviewedBy).filter(Boolean) as string[])).map((x) => ({ value: x, label: x === "SYSTEM" ? "System" : userName(v.acc, x) }))]} active={f.reviewer !== "all"} />
          <SelectField label="Ageing" value={f.age} onChange={(x) => set("age", x)} options={[{ value: "all", label: "Any" }, { value: "2", label: "Older than 2 days" }, { value: "7", label: "Older than 7 days" }]} active={f.age !== "all"} />
          <div className="filters-bar__end"><Checkbox label="Pending my action" checked={f.mine} onChange={(x) => set("mine", x)} /></div>
        </div>
        <p className="filters-bar__count">{filtered.length} documents</p>
        <DataTable rows={filtered} columns={cols} rowKey={(r) => r.d.id} caption="KYC verification queue" searchable={false} onRowClick={(r) => r.d.submittedAt && navigate(`/registration-kyc/kyc/doc/${r.d.id}`)} rowActionLabel={(r) => `Review ${r.d.id}`} initialSort={{ key: "sub", dir: "asc" }} emptyTitle="No documents match" />
      </Panel>
    </>
  );
}

export function DocumentReviewPage() {
  const { docId = "" } = useParams();
  const v = useMemberView("registration-kyc");
  const { notify } = useToast();
  const d = v.s.documents.find((x) => x.id === docId);
  const m = d ? memberById(v.s, d.memberId) : undefined;
  const [code, setCode] = useState("");
  const [remarks, setRemarks] = useState("");
  const [confirm, setConfirm] = useState<null | "approve" | "reject" | "reupload">(null);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [previewed, setPreviewed] = useState(false);
  useEffect(() => { if (d) startDocumentReview(v.uid, d.id); setPreviewed(false); }, [docId, v.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || !m) return <AccessDenied message={`Document ${docId} was not found.`} />;
  if (!canOn(v.acc, v.uid, "registration-kyc", "view", m).allowed) return <AccessDenied message={`${m.id} is outside your programme or geographical scope.`} />;
  const reviewer = canReviewDocs(v.acc, v.uid, m, "approve");
  const sensitive = canOn(v.acc, v.uid, "registration-kyc", "view_sensitive", m).allowed;
  const decidable = ["pending", "under_review"].includes(d.status);
  const prevRejects = d.history.filter((h) => h.status === "rejected" || h.status === "reupload_required");
  const act = (a: "approve" | "reject" | "reupload") => {
    setConfirm(null);
    const out = reviewDocument(v.uid, d.id, a, code, remarks);
    setRes(out);
    if (out.ok) { notify(`${DOC_LABEL[d.type]} ${a === "approve" ? "approved" : a === "reject" ? "rejected" : "sent back for re-upload"}`, a === "approve" ? "positive" : "info"); out.warnings.forEach((w) => notify(w, "positive")); }
  };
  const access = (kind: "preview" | "download") => {
    const out = accessDocument(v.uid, d.id, kind);
    if (out.ok && kind === "preview") setPreviewed(true);
    notify(out.ok ? (kind === "preview" ? "Preview opened (access recorded)" : "Download recorded. Development placeholder: no document content exists") : out.errors[0], out.ok ? "info" : "negative");
  };
  return (
    <div className="req">
      <Link to="/registration-kyc/kyc" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />KYC verification queue</Link>
      <section className="req-head panel">
        <div className="req-head__top">
          <div>
            <p className="req-head__id mono">{d.id} · {d.latestRef}</p>
            <h2 className="req-head__title">{DOC_LABEL[d.type]} · {m.name}</h2>
            <p className="req-head__type"><ProgrammeTag code={m.programme} size="sm" /> <Link to={`/members/member/${m.id}`} className="mono">{m.id}</Link> · {branchInfo(m)?.branch.name} · requirement: {requirementFor(m, d.type)?.requirement.replace("_", " ")}</p>
          </div>
          <div className="req-head__badges"><DocBadge status={d.status} /></div>
        </div>
      </section>
      <div className="req__grid">
        <div className="req__main">
          <Panel level={3} title="Document and verification">
            <dl className="kv kv--wide">
              <div className="kv__row"><dt>Masked identifier</dt><dd className="mono">{d.maskedId ?? "—"}</dd></div>
              <div className="kv__row"><dt>Submitted</dt><dd>{d.submittedAt ? formatDateTime(d.submittedAt) : "—"}</dd></div>
              <div className="kv__row"><dt>Verification method</dt><dd>{d.method}</dd></div>
              <div className="kv__row"><dt>Source</dt><dd>{d.source}</dd></div>
              <div className="kv__row"><dt>Verification response</dt><dd>{d.response ?? "None returned (mock)"}</dd></div>
              <div className="kv__row"><dt>Extracted fields</dt><dd>{sensitive ? (d.type === "aadhaar" ? `${m.name} · ${m.dob ?? "—"} · ${m.addresses.home?.line ?? "—"}` : d.type === "bank" ? "Account holder name matched: not returned by the mock" : "None extracted by the mock") : "Hidden: needs Registration & KYC: View sensitive"}</dd></div>
              <div className="kv__row"><dt>Resubmissions</dt><dd>{d.resubmissions}</dd></div>
              {d.type === "pan" && <div className="kv__row"><dt>PAN route</dt><dd className="small">{PAN_ROUTE.configured ?? `Not configured. Candidates: ${PAN_ROUTE.candidates.join(" / ")} (OP-17). PAN cannot be approved until one source of truth is confirmed`}</dd></div>}
            </dl>
            {d.exception && <Notice tone="danger">Verification exception: {d.exception}. Configured handling is pending business confirmation.</Notice>}
          </Panel>
          <Panel level={3} title="Supporting evidence" subtitle="Preview and download are separate permissions, and every access is recorded" actions={<div className="btn-row"><button type="button" className="btn btn--secondary btn--sm" onClick={() => access("preview")}><Eye size={14} strokeWidth={2} aria-hidden="true" />Preview</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => access("download")}><Download size={14} strokeWidth={2} aria-hidden="true" />Download</button></div>}>
            {previewed ? <div className="evidence-placeholder">Development placeholder for {DOC_LABEL[d.type]} {d.latestRef}. No real document, image or biometric data exists in this build.</div> : <p className="small muted">Evidence is not shown until you open the preview.</p>}
          </Panel>
          <Panel level={3} title="Submission and decision history">
            {prevRejects.length > 0 && <Notice tone="warn">Previous rejection remarks: {prevRejects.map((h) => h.remarks).filter(Boolean).join(" · ")}</Notice>}
            <ol className="hist">{[...d.history].reverse().map((h, i) => <li key={i} className="hist__item"><span className="hist__time small num muted">{formatDateTime(h.at)}</span><span className="hist__body"><span className="hist__action">{h.action}</span><span className="small muted">{h.by.startsWith("MEMBER:") ? "Member (app)" : h.by === "SYSTEM" ? "System" : userName(v.acc, h.by)} · {DOC_STATUS[h.status].label}</span>{h.remarks && <span className="hist__remark">{h.remarks}</span>}</span><span className="mono small muted hist__ref">{h.ref}</span></li>)}</ol>
          </Panel>
        </div>
        <aside className="req__side">
          <Panel level={3} title="Document decision" className={decidable && reviewer.ok ? "apr-decision" : ""}>
            {!decidable ? <p className="small">This document is {DOC_STATUS[d.status].label.toLowerCase()}. {d.status === "approved" ? "Approved documents cannot be altered through ordinary review." : ""}</p> : !reviewer.ok ? <p className="apr-decision__locked small">You can view this document. {reviewer.reason}</p> : (
              <>
                <SelectInput label="Reason (for reject / re-upload)" value={code} onChange={setCode} options={[{ value: "", label: "Choose from the catalogue" }, ...REJECTION_REASONS.filter((r) => r.docs.includes(d.type)).map((r) => ({ value: r.code, label: r.label }))]} />
                <TextArea label="Remarks" value={remarks} onChange={setRemarks} rows={3} hint="Mandatory to reject or request re-upload; included in the member and SR/PIC notification" />
                <PolicyMessages result={res} title="Decision not recorded" warnTitle="Recorded" />
                <div className="apr-decision__actions">
                  <button type="button" className="btn btn--primary" onClick={() => setConfirm("approve")}><CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />Approve document</button>
                  <button type="button" className="btn btn--secondary" onClick={() => setConfirm("reupload")}><Undo2 size={16} strokeWidth={2} aria-hidden="true" />Request re-upload</button>
                  <button type="button" className="btn btn--danger" onClick={() => setConfirm("reject")}><Ban size={16} strokeWidth={2} aria-hidden="true" />Reject document</button>
                </div>
                <p className="small muted">Only this document changes. Other document decisions are preserved.</p>
              </>
            )}
          </Panel>
        </aside>
      </div>
      <ConfirmDialog open={!!confirm} title={`${confirm === "approve" ? "Approve" : confirm === "reject" ? "Reject" : "Request re-upload of"} ${DOC_LABEL[d.type]}?`} confirmLabel={confirm === "approve" ? "Approve" : confirm === "reject" ? "Reject" : "Request re-upload"} tone={confirm === "reject" ? "danger" : "default"} onCancel={() => setConfirm(null)} onConfirm={() => confirm && act(confirm)} body={<p className="small">{confirm === "approve" ? "Completeness is recalculated for the programme. If every mandatory redemption document is approved, Stage 2 completes and redemption is enabled." : "The member and the SR/PIC are notified through the notification abstraction (recorded, not sent)."}</p>} />
    </div>
  );
}

export function KycExceptionsPage() {
  const v = useMemberView("registration-kyc");
  const ids = new Set(v.visible.map((m) => m.id));
  const docEx = v.s.documents.filter((d) => ids.has(d.memberId) && (d.exception || d.status === "verification_failed"));
  const sync = v.visible.filter((m) => ["failed", "conflict"].includes(m.registration.sfdcSync));
  const dup = v.visible.filter((m) => m.registration.registryCheck === "existing_other_programme");
  return (
    <>
      <SectionTitle title="KYC exceptions" description="Verification and data exceptions that need configured handling. No fallback route is invented" />
      <Panel level={3} title="Verification exceptions" padded={false}>
        <DataTable rows={docEx} rowKey={(d) => d.id} caption="Verification exceptions" searchable={false} columns={[
          { key: "id", header: "KYC reference", value: (d) => d.id, render: (d) => <Link to={`/registration-kyc/kyc/doc/${d.id}`} className="mono small">{d.id}</Link> },
          { key: "m", header: "Member", value: (d) => d.memberId, render: (d) => <Link to={`/members/member/${d.memberId}`} className="mono small">{d.memberId}</Link> },
          { key: "t", header: "Document", value: (d) => DOC_LABEL[d.type] },
          { key: "st", header: "Status", value: (d) => d.status, render: (d) => <DocBadge status={d.status} /> },
          { key: "ex", header: "Exception", value: (d) => d.exception ?? "", render: (d) => <span className="small cell-wrap">{d.exception ?? "Verification failed"}</span> },
          { key: "h", header: "Handling", value: () => "", render: (d) => <StatusBadge tone="warning">{d.exception?.match(/OP-\d+/)?.[0] ? `Business confirmation required (${d.exception.match(/OP-\d+/)![0]})` : "Review"}</StatusBadge> },
        ] as Column<KycDocument>[]} emptyTitle="No verification exceptions" />
      </Panel>
      <div className="grid-2">
        <Panel level={3} title="SFDC record issues" padded={false}>
          <DataTable rows={sync} rowKey={(m) => m.id} caption="SFDC issues" searchable={false} columns={[
            { key: "m", header: "Member", value: (m) => m.id, render: (m) => <Link to={`/registration-kyc/review/${m.id}`} className="mono small">{m.id}</Link> },
            { key: "s", header: "Sync", value: (m) => m.registration.sfdcSync },
            { key: "msg", header: "Detail", value: (m) => m.registration.sfdcMessage ?? "", render: (m) => <span className="small cell-wrap">{m.registration.sfdcMessage}</span> },
          ] as Column<Member>[]} emptyTitle="None" />
        </Panel>
        <Panel level={3} title="Cross-programme mobile matches" padded={false}>
          <DataTable rows={dup} rowKey={(m) => m.id} caption="Registry matches" searchable={false} columns={[
            { key: "m", header: "Member", value: (m) => m.id, render: (m) => <Link to={`/members/member/${m.id}`} className="mono small">{m.id}</Link> },
            { key: "p", header: "Programme", value: (m) => m.programme },
            { key: "d", header: "Treatment", value: () => "", render: () => <span className="small">Handled under the cross-programme duplicate policy; identity linked, not duplicated</span> },
          ] as Column<Member>[]} emptyTitle="None" />
        </Panel>
      </div>
    </>
  );
}

export function VerificationHistoryPage() {
  const v = useMemberView("registration-kyc");
  const ids = new Set(v.visible.map((m) => m.id));
  return <MemberEventsTable events={v.s.events.filter((e) => ids.has(e.memberId) && ["registration", "kyc", "sfdc", "security"].includes(e.category))} acc={v.acc} title="Verification and registration history" showMember pageSize={15} />;
}

const DSTATUS: Record<MemberDecision["status"], { label: string; tone: "warning" | "info" | "positive" | "neutral" }> = { open: { label: "Open", tone: "warning" }, under_review: { label: "Under review", tone: "info" }, confirmed: { label: "Confirmed", tone: "positive" }, deferred: { label: "Deferred", tone: "neutral" }, out_of_scope: { label: "Out of scope", tone: "neutral" } };

export function MemberDecisionsPage() {
  const v = useMemberView("registration-kyc");
  const { notify } = useToast();
  const [edit, setEdit] = useState<MemberDecision | null>(null);
  const [status, setStatus] = useState<MemberDecision["status"]>("open");
  const [answer, setAnswer] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const admin = v.can("users:manage");
  return (
    <>
      <SectionTitle title="Business confirmation register" description="Open registration, KYC and member-governance decisions. None is treated as an assumed rule" />
      <Panel padded={false}>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Decision register</caption>
            <thead><tr><th scope="col">Reference</th><th scope="col">Open question</th><th scope="col">Implementation treatment</th><th scope="col">Status</th>{admin && <th scope="col">Actions</th>}</tr></thead>
            <tbody>{v.s.decisions.map((d) => <tr key={d.id}><td className="mono small">{d.ref}</td><td className="small cell-wrap">{d.question}{d.answer && <span className="cell-2__sub">Answer: {d.answer}</span>}</td><td className="small cell-wrap">{d.treatment}</td><td><StatusBadge tone={DSTATUS[d.status].tone}>{DSTATUS[d.status].label}</StatusBadge></td>{admin && <td><button type="button" className="btn btn--secondary btn--xs" onClick={() => { setEdit(d); setStatus(d.status); setAnswer(d.answer); setRes(null); }}>Update</button></td>}</tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <ConfirmDialog open={!!edit} title={edit ? `${edit.ref} · update` : ""} confirmLabel="Save" onCancel={() => setEdit(null)} onConfirm={() => { const out = updateMemberDecision(v.uid, edit!.id, { status, answer }); if (!out.ok) return setRes(out); notify("Decision updated", "positive"); setEdit(null); }} body={edit && <div className="reason-dialog"><p className="small">{edit.question}</p><SelectInput label="Status" value={status} onChange={(x) => setStatus(x as MemberDecision["status"])} options={Object.entries(DSTATUS).map(([k, x]) => ({ value: k, label: x.label }))} /><TextArea label="Answer" value={answer} onChange={setAnswer} rows={3} /><PolicyMessages result={res} /></div>} />
    </>
  );
}


