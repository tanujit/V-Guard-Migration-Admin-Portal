import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Clock, FileWarning, Hourglass, RefreshCw, ScanLine, UserPlus, Wallet, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { RankedBars } from "@/components/ui/DataBars";
import { ProgrammeTag, SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, TextArea, TextField } from "@/components/form/Form";
import { DOC_LABEL, PROGRAMME_REQUIREMENTS, REG_STATUS, requirementOf, SOURCE_LABEL } from "@/config/memberProgrammes";
import { GEOGRAPHY } from "@/config/geography";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { demoNow } from "@/features/approvals/store";
import { ageingDays, branchInfo, canOn, canStage1, docsOf, kycOverall, maskMobile, redemptionEligibility, scanEligibility } from "@/features/members/engine";
import { createAssistedEPRegistration, registryCheck, submitRegistrationDecision, type AssistedInput } from "@/features/members/store";
import { hash01 } from "@/data/mock/random";
import { formatDateTime } from "@/lib/format";
import type { Member } from "@/types/members";
import { AccessDenied, PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { DocBadge, Gate, KycBadge, LockedTag, MemberEventsTable, RegBadge, useMemberView, userName } from "./shared";

export function stageOf(m: Member) {
  if (m.status === "pending" && m.registration.source === "self") return { stage: "Stage 1 · SR/PIC approval", approver: m.sr ?? "Branch SR/PIC" };
  if (m.status === "pending") return { stage: "In-app completion", approver: "Member" };
  if (m.status === "invited") return { stage: "Awaiting member (SFDC invitation)", approver: "Member" };
  if (m.status === "active_scan" || m.status === "redemption_kyc_pending") return { stage: requirementOf(m.programme).stage2Reviewer === "evolve" ? "Stage 2 · Evolve document review" : "—", approver: "Evolve KYC desk" };
  if (m.status === "provisioned") return { stage: "SFDC provisioned", approver: "—" };
  if (m.status === "rejected") return { stage: "Closed (rejected)", approver: "—" };
  return { stage: "Complete", approver: "—" };
}
const exceptionOf = (s: ReturnType<typeof useMemberView>["s"], m: Member) => docsOf(s, m.id).some((d) => d.exception || d.status === "verification_failed") || ["failed", "conflict"].includes(m.registration.sfdcSync);

type RPreset = "all" | "new" | "pending" | "active_scan" | "redemption_kyc_pending" | "redemption_enabled" | "rejected" | "exceptions" | "sfdc_pending" | "sync";
const rPreset = (p: RPreset, m: Member, s: ReturnType<typeof useMemberView>["s"], now: string) => {
  switch (p) {
    case "new": return ageingDays(m.registration.submittedAt, now) <= 7;
    case "pending": return m.status === "pending" && m.registration.source === "self";
    case "active_scan": case "redemption_kyc_pending": case "redemption_enabled": case "rejected": return m.status === p;
    case "exceptions": return exceptionOf(s, m);
    case "sfdc_pending": return m.registration.source.startsWith("sfdc") && (m.status === "invited" || m.status === "pending");
    case "sync": return ["failed", "conflict"].includes(m.registration.sfdcSync);
    default: return true;
  }
};

export function RegistrationOverviewPage() {
  const v = useMemberView("registration-kyc");
  const navigate = useNavigate();
  const now = demoNow();
  const c = (p: RPreset) => v.visible.filter((m) => rPreset(p, m, v.s, now)).length;
  const go = (p: RPreset) => () => navigate(`/registration-kyc/queue?preset=${p}`);
  return (
    <>
      <SectionTitle title="Registration overview" description="Each programme keeps its own journey: EP self/assisted, ST and CS invitations, Retailer and DD SFDC provisioning" />
      <KpiGrid items={[
        { id: "all", label: "Total registration records", value: v.visible.length, desc: "Within your scope", variant: "dark", icon: ClipboardList, onSelect: go("all") },
        { id: "new", label: "New registrations", value: c("new"), desc: "Last 7 days", variant: "light", icon: UserPlus, onSelect: go("new") },
        { id: "pending", label: "Pending registration approval", value: c("pending"), desc: "EP self-registration · Stage 1", variant: "status", tone: "warning", icon: Hourglass, onSelect: go("pending") },
        { id: "scan", label: "Active — Scan enabled", value: c("active_scan"), desc: "Redemption blocked", variant: "primary", icon: ScanLine, onSelect: go("active_scan") },
        { id: "rkyc", label: "Redemption KYC pending", value: c("redemption_kyc_pending"), desc: "Stage 2 in progress", variant: "status", tone: "warning", icon: Clock, onSelect: go("redemption_kyc_pending") },
        { id: "en", label: "Redemption enabled", value: c("redemption_enabled"), desc: "Stage 2 complete", variant: "status", tone: "positive", icon: Wallet, onSelect: go("redemption_enabled") },
        { id: "rej", label: "Rejected registrations", value: c("rejected"), desc: "Stage 1 rejected", variant: "status", tone: "negative", icon: XCircle, onSelect: go("rejected") },
        { id: "exc", label: "Registration exceptions", value: c("exceptions"), desc: "Verification or SFDC exceptions", variant: "status", tone: "negative", icon: AlertTriangle, onSelect: go("exceptions") },
        { id: "sfdc", label: "Pending SFDC-sourced records", value: c("sfdc_pending"), desc: "Invitations not completed", variant: "light", icon: FileWarning, onSelect: go("sfdc_pending") },
        { id: "sync", label: "Records with sync issues", value: c("sync"), desc: "SFDC failed or conflicting", variant: "light", icon: RefreshCw, onSelect: go("sync") },
      ]} />
      <div className="grid-2">
        <Panel title="By programme and source" level={3}>
          <RankedBars items={PROGRAMME_REQUIREMENTS.flatMap((r) => r.sources.map((src) => ({ key: `${r.code}-${src}`, label: `${r.code} · ${SOURCE_LABEL[src]}`, value: v.visible.filter((m) => m.programme === r.code && m.registration.source === src).length })))} />
        </Panel>
        <Panel title="Programme journeys" level={3}>
          <ul className="ref-list">{PROGRAMME_REQUIREMENTS.map((r) => <li key={r.code} className="small"><strong>{r.code}</strong> · {r.sources.map((x) => SOURCE_LABEL[x]).join(" / ")} · scan: {r.scanGate} · redemption: {r.redemptionGate}{r.openPoints.length ? ` · open: ${r.openPoints.join(", ")}` : ""}</li>)}</ul>
        </Panel>
      </div>
    </>
  );
}

export function RegistrationQueuePage() {
  const v = useMemberView("registration-kyc");
  const navigate = useNavigate();
  const now = demoNow();
  const [params, setParams] = useSearchParams();
  const preset = (params.get("preset") as RPreset) ?? "all";
  const [f, setF] = useState({ q: "", prog: "all", source: "all", status: "all", stage: "all", kyc: "all", state: "all", branch: "all", age: "all" });
  const set = (k: keyof typeof f, val: string) => setF((x) => ({ ...x, [k]: val }));
  const rows = v.visible.filter((m) => {
    const t = f.q.trim().toLowerCase();
    if (t && ![m.id, m.name, m.registration.ref, m.sr ?? ""].join(" ").toLowerCase().includes(t)) return false;
    if (f.prog !== "all" && m.programme !== f.prog) return false;
    if (f.source !== "all" && m.registration.source !== f.source) return false;
    if (f.status !== "all" && m.status !== f.status) return false;
    if (f.stage !== "all" && stageOf(m).stage !== f.stage) return false;
    if (f.kyc !== "all" && kycOverall(v.s, m) !== f.kyc) return false;
    if (f.state !== "all" && branchInfo(m)?.state.code !== f.state) return false;
    if (f.branch !== "all" && m.branchCode !== f.branch) return false;
    if (f.age !== "all" && ageingDays(m.registration.submittedAt, now) < Number(f.age)) return false;
    return rPreset(preset, m, v.s, now);
  });
  const stages = Array.from(new Set(v.visible.map((m) => stageOf(m).stage)));
  const cols: Column<Member>[] = [
    { key: "ref", header: "Registration ref", value: (m) => m.registration.ref, render: (m) => <span className="mono small">{m.registration.ref}</span> },
    { key: "id", header: "Member ID", value: (m) => m.id, render: (m) => <span className="mono small">{m.id}</span> },
    { key: "name", header: "Member name", value: (m) => m.name },
    { key: "mobile", header: "Mobile", value: (m) => maskMobile(m.mobile), noSearch: true, render: (m) => <span className="mono small">{maskMobile(m.mobile)}</span> },
    { key: "prog", header: "Programme", value: (m) => m.programme, render: (m) => <ProgrammeTag code={m.programme} size="sm" /> },
    { key: "src", header: "Channel", value: (m) => SOURCE_LABEL[m.registration.source], render: (m) => <span className="small">{SOURCE_LABEL[m.registration.source]}</span> },
    { key: "date", header: "Registered", value: (m) => m.registration.submittedAt, render: (m) => <span className="small num">{formatDateTime(m.registration.submittedAt).split(",")[0]}</span> },
    { key: "status", header: "Status", value: (m) => REG_STATUS[m.status].label, render: (m) => <RegBadge status={m.status} /> },
    { key: "stage", header: "Current stage", value: (m) => stageOf(m).stage, render: (m) => <span className="small">{stageOf(m).stage}</span> },
    { key: "kyc", header: "KYC", value: (m) => kycOverall(v.s, m), render: (m) => <KycBadge status={kycOverall(v.s, m)} /> },
    { key: "branch", header: "Branch", value: (m) => branchInfo(m)?.branch.name ?? "" },
    { key: "sr", header: "SR / PIC", value: (m) => m.sr ?? "", render: (m) => <span className="small">{m.sr ?? "—"}</span> },
    { key: "approver", header: "Current approver", value: (m) => stageOf(m).approver, render: (m) => <span className="small">{stageOf(m).approver}</span> },
    { key: "age", header: "Ageing", value: (m) => ageingDays(m.registration.submittedAt, now), align: "right", render: (m) => <span className="num">{ageingDays(m.registration.submittedAt, now)}d</span> },
    { key: "act", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (m) => <Link to={`/registration-kyc/review/${m.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>Review</Link> },
  ];
  return (
    <>
      <SectionTitle title="Registration queue" description="Registration cases within your scope, with their programme-specific stage" />
      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={f.q} onChange={(x) => set("q", x)} placeholder="Reference, member ID, name or SR" label="Search registrations" />
          <SelectField label="Programme" value={f.prog} onChange={(x) => set("prog", x)} options={[{ value: "all", label: "All" }, ...PROGRAMME_REQUIREMENTS.map((r) => ({ value: r.code, label: r.code }))]} active={f.prog !== "all"} />
          <SelectField label="Source" value={f.source} onChange={(x) => set("source", x)} options={[{ value: "all", label: "All" }, ...Object.entries(SOURCE_LABEL).map(([k, l]) => ({ value: k, label: l }))]} active={f.source !== "all"} />
          <SelectField label="Status" value={f.status} onChange={(x) => set("status", x)} options={[{ value: "all", label: "All" }, ...Object.entries(REG_STATUS).map(([k, x]) => ({ value: k, label: x.label }))]} active={f.status !== "all"} />
          <SelectField label="Approval stage" value={f.stage} onChange={(x) => set("stage", x)} options={[{ value: "all", label: "All" }, ...stages.map((x) => ({ value: x, label: x }))]} active={f.stage !== "all"} />
          <SelectField label="KYC" value={f.kyc} onChange={(x) => set("kyc", x)} options={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "partially_verified", label: "Partially verified" }, { value: "verified", label: "Verified" }, { value: "rejected", label: "Rejected" }, { value: "action_required", label: "Action required" }]} active={f.kyc !== "all"} />
          <SelectField label="State" value={f.state} onChange={(x) => set("state", x)} options={[{ value: "all", label: "All" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} active={f.state !== "all"} />
          <SelectField label="Branch" value={f.branch} onChange={(x) => set("branch", x)} options={[{ value: "all", label: "All" }, ...GEOGRAPHY.filter((g) => f.state === "all" || g.code === f.state).flatMap((g) => g.districts.flatMap((d) => d.branches.map((b) => ({ value: b.code, label: b.name }))))]} active={f.branch !== "all"} />
          <SelectField label="Ageing" value={f.age} onChange={(x) => set("age", x)} options={[{ value: "all", label: "Any" }, { value: "2", label: "Older than 2 days" }, { value: "7", label: "Older than 7 days" }, { value: "30", label: "Older than 30 days" }]} active={f.age !== "all"} />
          <div className="filters-bar__end"><button type="button" className="btn btn--ghost btn--sm" onClick={() => { setF({ q: "", prog: "all", source: "all", status: "all", stage: "all", kyc: "all", state: "all", branch: "all", age: "all" }); setParams({}); }}>Clear all</button></div>
        </div>
        <p className="filters-bar__count">{rows.length} of {v.visible.length} records{preset !== "all" ? ` · ${preset.replace(/_/g, " ")}` : ""}</p>
        <DataTable rows={rows} columns={cols} rowKey={(m) => m.id} caption="Registration queue" searchable={false} exportName={v.can("registration-kyc:export") ? "registration-queue" : undefined} onRowClick={(m) => navigate(`/registration-kyc/review/${m.id}`)} rowActionLabel={(m) => `Review ${m.id}`} initialSort={{ key: "date", dir: "desc" }} />
      </Panel>
    </>
  );
}

/* ---------------- Programme-specific review ---------------- */

export function RegistrationReviewPage() {
  const { memberId = "" } = useParams();
  const v = useMemberView("registration-kyc");
  const { notify } = useToast();
  const navigate = useNavigate();
  const [remarks, setRemarks] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const m = v.s.members.find((x) => x.id === memberId);
  if (!m) return <AccessDenied message={`Registration for ${memberId} was not found.`} />;
  if (!canOn(v.acc, v.uid, "registration-kyc", "view", m).allowed) return <AccessDenied message={`${m.id} is outside your programme or geographical scope.`} />;
  const sensitive = canOn(v.acc, v.uid, "members", "view_sensitive", m).allowed || canOn(v.acc, v.uid, "registration-kyc", "view_sensitive", m).allowed;
  const docs = docsOf(v.s, m.id);
  const aad = docs.find((d) => d.type === "aadhaar");
  const req = requirementOf(m.programme);
  const s1 = canStage1(v.acc, v.uid, m);
  const decide = (d: "approve" | "reject") => {
    const out = submitRegistrationDecision(v.uid, m.id, d, remarks);
    setRes(out);
    if (out.ok) notify(d === "approve" ? `${m.id} approved: Active — Scan enabled, Redemption blocked` : `${m.id} rejected`, d === "approve" ? "positive" : "negative");
  };
  const check = (label: string, ok: boolean | null, detail: string) => <div className="kv__row"><dt>{label}</dt><dd>{ok === null ? <StatusBadge tone="neutral">Not applicable</StatusBadge> : <StatusBadge tone={ok ? "positive" : "negative"}>{ok ? "Passed" : "Exception"}</StatusBadge>} <span className="small muted">{detail}</span></dd></div>;
  return (
    <div className="req">
      <Link to="/registration-kyc/queue" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Registration queue</Link>
      <section className="req-head panel">
        <div className="req-head__top">
          <div>
            <p className="req-head__id mono">{m.registration.ref} · {m.id}</p>
            <h2 className="req-head__title">{m.name}</h2>
            <p className="req-head__type"><ProgrammeTag code={m.programme} size="sm" /> {req.label} · {SOURCE_LABEL[m.registration.source]} · {branchInfo(m)?.branch.name} · SR {m.sr ?? "—"}</p>
          </div>
          <div className="req-head__badges"><RegBadge status={m.status} /><Link to={`/members/member/${m.id}`} className="btn btn--secondary btn--sm">Member 360</Link></div>
        </div>
        <dl className="req-head__facts">
          <div><dt>Current stage</dt><dd>{stageOf(m).stage}</dd></div>
          <div><dt>Scan</dt><dd><Gate ok={scanEligibility(v.s, m).allowed} /> <span className="small muted">{scanEligibility(v.s, m).reason}</span></dd></div>
          <div><dt>Redemption</dt><dd><Gate ok={redemptionEligibility(v.s, m).allowed} /> <span className="small muted">{redemptionEligibility(v.s, m).reason}</span></dd></div>
          <div><dt>KYC</dt><dd><KycBadge status={kycOverall(v.s, m)} /></dd></div>
        </dl>
      </section>

      <div className="grid-2 grid-2--wide-left">
        <div className="req__main">
          {m.programme === "EP" && (
            <Panel level={3} title={m.registration.source === "self" ? "EP self-registration checks" : "EP SR-assisted registration"}>
              <dl className="kv kv--wide">
                {check("Mobile ownership", m.registration.mobileVerified, "Verified during enrolment")}
                {check("Cross-programme registry", m.registration.registryCheck !== "existing_same_programme", m.registration.registryCheck.replace(/_/g, " "))}
                {check("Aadhaar consent", m.registration.source === "sr_assisted" || aad?.status !== "not_submitted", "Explicit consent before identity verification")}
                {check("Aadhaar / DigiLocker / UIDAI", aad?.status === "approved", aad?.exception ?? aad?.response ?? "Pending")}
                <div className="kv__row"><dt>Verified identity</dt><dd>{aad?.status === "approved" ? (sensitive ? <>{m.name} · {m.dob} · {m.addresses.home?.line}, {m.addresses.home?.pincode} <LockedTag /></> : <>Verified <LockedTag /> <span className="small muted">(details need View sensitive)</span></>) : "Not verified"}</dd></div>
                <div className="kv__row"><dt>Working location</dt><dd>{m.addresses.working ? `${m.addresses.working.line}, ${m.addresses.working.pincode}` : "Not captured"}</dd></div>
                <div className="kv__row"><dt>Branch / SR mapping</dt><dd>{branchInfo(m)?.branch.name} · {m.sr} <span className="small muted">(derived from geography and SFDC mapping)</span></dd></div>
                <div className="kv__row"><dt>MPIN setup</dt><dd>{m.registration.mpin.replace("_", " ")}{m.registration.credentialIssuedAt ? ` · credentials issued ${formatDateTime(m.registration.credentialIssuedAt)} (recorded, not sent)` : ""}</dd></div>
              </dl>
              {m.registration.source === "sr_assisted" && <Notice tone="info">SR-assisted: no separate Stage-1 approval. The account was created Active — Scan enabled, Redemption blocked. Stage-2 verification still applies.</Notice>}
            </Panel>
          )}
          {(m.programme === "ST" || m.programme === "CS") && (
            <Panel level={3} title={`${m.programme} invitation from SFDC`} subtitle={`${m.programme} is tracked separately from ${m.programme === "ST" ? "CS" : "ST"}`}>
              <dl className="kv kv--wide">
                <div className="kv__row"><dt>SFDC invitation</dt><dd className="mono">{m.invite?.ref} · received {m.invite ? formatDateTime(m.invite.receivedAt) : "—"}</dd></div>
                <div className="kv__row"><dt>In-app completion</dt><dd>{m.invite?.completion.replace("_", " ")}</dd></div>
                <div className="kv__row"><dt>MPIN setup</dt><dd>{m.registration.mpin.replace("_", " ")}</dd></div>
                <div className="kv__row"><dt>SFDC response</dt><dd>{m.registration.sfdcSync}{m.registration.sfdcMessage ? ` · ${m.registration.sfdcMessage}` : ""}</dd></div>
              </dl>
              <p className="small"><strong>Field-source mapping (OP-ST1)</strong></p>
              <div className="table-wrap"><table className="table"><caption className="sr-only">Field source mapping</caption><thead><tr><th scope="col">Field</th><th scope="col">Source</th></tr></thead><tbody>{Object.entries(req.fieldSource).map(([k, src]) => <tr key={k}><td>{k}</td><td>{src === "unconfirmed" ? <StatusBadge tone="warning">Unconfirmed (OP-ST1)</StatusBadge> : src}</td></tr>)}</tbody></table></div>
            </Panel>
          )}
          {m.programme === "Retailer" && (
            <Panel level={3} title="Retailer SFDC provisioning" subtitle="No in-app registration journey; Retailer app screens are built by Mobility">
              <dl className="kv kv--wide">
                <div className="kv__row"><dt>Retailer member ID</dt><dd className="mono">{m.id}</dd></div>
                <div className="kv__row"><dt>PAN</dt><dd><DocBadge status={docs.find((d) => d.type === "pan")?.status ?? "not_submitted"} /> <span className="mono small">{docs.find((d) => d.type === "pan")?.maskedId}</span> · maintained in SFDC</dd></div>
                <div className="kv__row"><dt>GST eligibility</dt><dd><StatusBadge tone={m.retailer?.gstStatus === "eligible" ? "positive" : m.retailer?.gstStatus === "pending" ? "warning" : "negative"}>{m.retailer?.gstStatus.replace("_", " ")}</StatusBadge> <span className="small muted">as supplied by the source; no in-app GST upload is assumed (OP-RET1)</span></dd></div>
                <div className="kv__row"><dt>Territory / branch</dt><dd>{m.retailer?.territory} · {branchInfo(m)?.branch.name}</dd></div>
                <div className="kv__row"><dt>SFDC reference</dt><dd className="mono">{m.registration.sfdcRef}</dd></div>
                <div className="kv__row"><dt>Last sync</dt><dd>{m.registration.sfdcSync}{m.registration.sfdcMessage ? ` · ${m.registration.sfdcMessage}` : ""}</dd></div>
                <div className="kv__row"><dt>Redemption eligibility</dt><dd><Gate ok={redemptionEligibility(v.s, m).allowed} /> {redemptionEligibility(v.s, m).reason}</dd></div>
              </dl>
            </Panel>
          )}
          {m.programme === "DD" && (
            <Panel level={3} title="DD SFDC provisioning" subtitle="DD keeps its own identity and attributes; it is not treated as an ordinary Retailer (OP-41 / OP-42)">
              <dl className="kv kv--wide">
                <div className="kv__row"><dt>DD member ID</dt><dd className="mono">{m.id}</dd></div>
                <div className="kv__row"><dt>Distributor ID</dt><dd className="mono">{m.dd?.distributorId}</dd></div>
                <div className="kv__row"><dt>Territory</dt><dd>{m.dd?.territory}</dd></div>
                <div className="kv__row"><dt>Sales targets</dt><dd>{m.dd?.salesTarget}</dd></div>
                <div className="kv__row"><dt>Branch / region</dt><dd>{branchInfo(m)?.branch.name} · {branchInfo(m)?.state.name}</dd></div>
                <div className="kv__row"><dt>SFDC</dt><dd><span className="mono">{m.registration.sfdcRef}</span> · {m.registration.sfdcSync}</dd></div>
                <div className="kv__row"><dt>Scheme scanning</dt><dd>{m.dd?.schemeScan.map((x) => <span key={x.scheme} className="tag-row small">{x.scheme}: <Gate ok={x.enabled} label={x.enabled ? "Enabled" : "Disabled"} /> </span>)}</dd></div>
              </dl>
            </Panel>
          )}
          <Panel level={3} title="KYC documents" padded={false}>
            <DataTable rows={docs} rowKey={(d) => d.id} caption="Documents" searchable={false} onRowClick={(d) => d.submittedAt && navigate(`/registration-kyc/kyc/doc/${d.id}`)} columns={[
              { key: "t", header: "Document", value: (d) => DOC_LABEL[d.type], render: (d) => <span className="cell-2"><span className="cell-2__main">{DOC_LABEL[d.type]}</span><span className="cell-2__sub">{req.documents.find((x) => x.type === d.type)?.requirement.replace("_", " ")}</span></span> },
              { key: "id", header: "Identifier", value: (d) => d.maskedId ?? "", render: (d) => <span className="mono small">{d.maskedId ?? "—"}</span> },
              { key: "st", header: "Status", value: (d) => d.status, render: (d) => <DocBadge status={d.status} /> },
              { key: "ex", header: "Exception / reason", value: (d) => d.exception ?? d.rejectionReason ?? "", render: (d) => <span className="small cell-wrap neg">{d.exception ?? d.rejectionReason ?? ""}</span> },
              { key: "a", header: "Actions", value: () => null, sortable: false, render: (d) => d.submittedAt && <Link to={`/registration-kyc/kyc/doc/${d.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>Open</Link> },
            ] as Column<(typeof docs)[number]>[]} />
          </Panel>
        </div>
        <aside className="req__side">
          {m.registration.source === "self" && (
            <Panel level={3} title="Stage 1 · SR/PIC decision" className={m.status === "pending" && s1.ok ? "apr-decision" : ""}>
              {m.registration.stage1 ? <p className="small">{m.registration.stage1.decision} by {userName(v.acc, m.registration.stage1.by)} · {formatDateTime(m.registration.stage1.at)}{m.registration.stage1.remarks ? ` · “${m.registration.stage1.remarks}”` : ""}</p> : m.status !== "pending" ? <p className="small muted">Not pending</p> : !s1.ok ? <p className="apr-decision__locked small">{s1.reason}</p> : (
                <>
                  <p className="small">Approval enables scanning. Redemption stays blocked until Stage 2.</p>
                  <TextArea label="Remarks" value={remarks} onChange={setRemarks} rows={3} hint="Required to reject" />
                  <PolicyMessages result={res} title="Not recorded" />
                  <div className="apr-decision__actions">
                    <button type="button" className="btn btn--primary" onClick={() => decide("approve")}><CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />Approve: enable scanning</button>
                    <button type="button" className="btn btn--danger" onClick={() => decide("reject")}><XCircle size={16} strokeWidth={2} aria-hidden="true" />Reject registration</button>
                  </div>
                </>
              )}
            </Panel>
          )}
          <Panel level={3} title="Stage 2 · Redemption unlock">
            <p className="small">{req.stage2Reviewer === "evolve" ? (m.registration.stage2 ? `Completed by ${userName(v.acc, m.registration.stage2.by)} · ${formatDateTime(m.registration.stage2.at)}` : `Evolve verifies each document. Unlocks when every mandatory redemption document is approved.`) : "Not applicable to this programme"}</p>
            <Link to="/registration-kyc/kyc" className="btn btn--secondary btn--sm">KYC verification queue</Link>
          </Panel>
        </aside>
      </div>
      <MemberEventsTable events={v.s.events.filter((e) => e.memberId === m.id && ["registration", "kyc", "sfdc"].includes(e.category))} acc={v.acc} title="Registration history" />
    </div>
  );
}

/* ---------------- Assisted EP registration ---------------- */

const emptyInput = (): AssistedInput => ({ mobile: "", branchCode: "", consent: false, aadhaarResult: "verified", aadhaarLast4: "", verifiedName: "", verifiedDob: "", verifiedAddress: "", verifiedPincode: "", workingAddress: "", workingPincode: "", gender: "", email: "", panLast4: "", bankLast4: "" });

export function AssistedRegistrationPage() {
  const v = useMemberView();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [i, setI] = useState<AssistedInput>(emptyInput);
  const [checked, setChecked] = useState<null | ReturnType<typeof registryCheck>>(null);
  const [verified, setVerified] = useState(false);
  const [mockResult, setMockResult] = useState<AssistedInput["aadhaarResult"]>("verified");
  const [res, setRes] = useState<(PolicyResult & { id?: string; existingId?: string }) | null>(null);
  const branches = useMemo(() => GEOGRAPHY.flatMap((g) => g.districts.flatMap((d) => d.branches.map((b) => ({ value: b.code, label: `${b.name} · ${g.name}` })))).filter((b) => canOn(v.acc, v.uid, "members", "create", { programme: "EP", branchCode: b.value } as Member).allowed), [v.acc, v.uid]);
  if (!v.can("members:create")) return <AccessDenied message="Assisted EP registration needs Member management: Create (Sales Reps registering EP members)." />;
  const set = (p: Partial<AssistedInput>) => setI((x) => ({ ...x, ...p }));
  const runVerification = () => {
    setRes(null);
    if (!i.consent) return setRes({ ok: false, errors: ["Capture Aadhaar consent before verification"], warnings: [] });
    if (mockResult !== "verified") { set({ aadhaarResult: mockResult }); setVerified(false); return setRes({ ok: false, errors: [mockResult === "not_on_digilocker" ? "Mock response: member is not registered on DigiLocker (OP-15). No fallback is configured; the registration cannot continue" : mockResult === "mobile_mismatch" ? "Mock response: Aadhaar-linked mobile mismatch (OP-16). Handling is not confirmed" : "Mock response: invalid response from the identity source"], warnings: [] }); }
    const seed = i.mobile || "x";
    const pin = `6${String(Math.floor(10000 + hash01(seed + "p") * 89999))}`;
    set({ aadhaarResult: "verified", aadhaarLast4: String(Math.floor(1000 + hash01(seed) * 8999)), verifiedName: `Demo Member ${String(Math.floor(hash01(seed + "n") * 900) + 100)}`, verifiedDob: "1989-04-12", verifiedAddress: "Ward 7, Demo Nagar (mock identity response)", verifiedPincode: pin });
    setVerified(true);
  };
  const submit = () => {
    const out = createAssistedEPRegistration(v.uid, i);
    setRes(out);
    if (out.ok) { notify(`${out.id} created: Active — Scan enabled, Redemption blocked`, "positive"); navigate(`/members/member/${out.id}`); }
  };
  return (
    <div className="wizard">
      <SectionTitle title="Assisted EP registration" description="For V-Guard Sales Reps registering an EP member in person. No separate Stage-1 approval; Stage 2 still applies" />
      <Notice tone="warn">Development mock: identity verification returns a demo response you choose below. Aadhaar/DigiLocker/UIDAI, Signzy, OTP and SMS are not connected. Never enter real personal data.</Notice>
      <div className="grid-2">
        <Panel level={3} title="1 · Mobile and registry check">
          <div className="form-grid">
            <TextField label="Member mobile" required value={i.mobile} onChange={(x) => { set({ mobile: x }); setChecked(null); }} placeholder="+91 9XXXX XXXXX" />
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setChecked(registryCheck(i.mobile))} disabled={i.mobile.replace(/\D/g, "").length < 10}>Check member registry</button>
            {checked && (checked.length === 0 ? <p className="small pos">No existing member uses this mobile.</p> : checked.map((m) => <p key={m.id} className={`small ${m.programme === "EP" ? "neg" : "warn-text"}`}>{m.programme === "EP" ? "Already registered in EP as " : `Registered in ${m.programme} as `}<Link to={`/members/member/${m.id}`} className="mono">{m.id}</Link>{m.programme === "EP" ? ". Open the existing profile; no duplicate will be created" : ". The KYC identity will be reused and linked (cross-programme policy)"}</p>))}
            <SelectInput label="Branch" required value={i.branchCode} onChange={(x) => set({ branchCode: x })} options={[{ value: "", label: "Choose" }, ...branches]} hint={`Branches within your scope (${branches.length})`} />
          </div>
        </Panel>
        <Panel level={3} title="2 · Aadhaar consent and verification">
          <div className="form-grid">
            <Checkbox label="Member has given explicit Aadhaar consent" checked={i.consent} onChange={(x) => set({ consent: x })} description="Recorded with timestamp and source “SR-assisted”" />
            <SelectInput label="Mock verification response" value={mockResult} onChange={(x) => { setMockResult(x as AssistedInput["aadhaarResult"]); setVerified(false); }} options={[{ value: "verified", label: "Verified" }, { value: "not_on_digilocker", label: "Not registered on DigiLocker (OP-15)" }, { value: "mobile_mismatch", label: "Aadhaar/mobile mismatch (OP-16)" }, { value: "invalid_response", label: "Invalid response" }]} hint="Development only" />
            <button type="button" className="btn btn--dark btn--sm" onClick={runVerification}>Run identity verification (mock)</button>
            {verified && (
              <dl className="kv kv--tight">
                <div className="kv__row"><dt>Aadhaar</dt><dd className="mono">XXXX XXXX {i.aadhaarLast4} <LockedTag /></dd></div>
                <div className="kv__row"><dt>Verified name</dt><dd>{i.verifiedName} <LockedTag /></dd></div>
                <div className="kv__row"><dt>Date of birth</dt><dd>{i.verifiedDob} <LockedTag /></dd></div>
                <div className="kv__row"><dt>Home address</dt><dd>{i.verifiedAddress}, {i.verifiedPincode} <LockedTag /></dd></div>
              </dl>
            )}
          </div>
        </Panel>
      </div>
      <Panel level={3} title="3 · Working location, profile and KYC details">
        <div className="form-grid form-grid--2">
          <TextField label="Working location" required value={i.workingAddress} onChange={(x) => set({ workingAddress: x })} hint="Separate from the Aadhaar home address" />
          <TextField label="Working pincode" value={i.workingPincode} onChange={(x) => set({ workingPincode: x })} />
          <SelectInput label="Gender" value={i.gender} onChange={(x) => set({ gender: x })} options={[{ value: "", label: "Not provided" }, { value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} />
          <TextField label="Email" value={i.email} onChange={(x) => set({ email: x })} />
          <TextField label="PAN · last 4 digits only" value={i.panLast4} onChange={(x) => set({ panLast4: x })} hint="Optional for EP. Stored as Pending, never as verified, while OP-17 is open" />
          <TextField label="Bank account · last 4 digits only" value={i.bankLast4} onChange={(x) => set({ bankLast4: x })} hint="Optional. Penny-less verification happens in Stage 2" />
        </div>
        <PolicyMessages result={res} title="Registration not created" warnTitle="Created, note" />
        {res?.existingId && <Link to={`/members/member/${res.existingId}`} className="btn btn--secondary btn--sm">Open existing profile {res.existingId}</Link>}
        <div className="btn-row"><button type="button" className="btn btn--primary" onClick={submit} disabled={!verified}><UserPlus size={16} strokeWidth={2} aria-hidden="true" />Create EP member</button></div>
      </Panel>
    </div>
  );
}
