import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, Eye, EyeOff, KeyRound, PauseCircle, Pencil, Phone, RotateCcw, ShieldBan, UserCog } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Drawer } from "@/components/ui/Overlay";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FigureRow } from "@/components/ui/DataBars";
import { ProgrammeTag, SelectField, StatusBadge } from "@/components/ui/primitives";
import { RadioCards, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { DOC_LABEL, requirementOf, RESTRICTION_REASONS, SOURCE_LABEL } from "@/config/memberProgrammes";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { activeRestrictions, branchInfo, canOn, docsOf, identityOf, kycOverall, linkedMembers, maskMobile, redemptionEligibility, scanEligibility } from "@/features/members/engine";
import { memberLedger } from "@/features/members/ledger";
import { accessDocument, applyRestriction, requestMobileChange, requestVerifiedFieldOverride, restrictionImpact, submitReinstatementRequest, triggerMpinReset, updateMemberProfile } from "@/features/members/store";
import { formatCount, formatDateTime } from "@/lib/format";
import type { Address, KycDocument, Member, Restriction, RestrictionType } from "@/types/members";
import { AccessDenied, PolicyMessages, ReasonDialog } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { DocBadge, Gate, KycBadge, LockedTag, MemberEventsTable, RegBadge, RestrictionBadge, useMemberView, userName } from "./shared";

type Tab = "overview" | "profile" | "addresses" | "kyc" | "registration" | "activity" | "restrictions" | "history" | "consent";

export function Member360Page() {
  const { memberId = "" } = useParams();
  const v = useMemberView();
  const { s, acc, uid } = v;
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "overview";
  const m = s.members.find((x) => x.id === memberId);
  const [reveal, setReveal] = useState(false);
  const [dialog, setDialog] = useState<null | "edit" | "override" | "mobile" | "block" | "hold" | "reinstate" | "mpin">(null);
  useEffect(() => setReveal(false), [memberId]);
  if (!m) return <AccessDenied message={`Member ${memberId} was not found.`} />;
  if (!canOn(acc, uid, "members", "view", m).allowed) return <AccessDenied message={`${m.id} is outside your programme or geographical scope. Access denied.`} />;
  const can = (module: string, action: Parameters<typeof canOn>[3]) => canOn(acc, uid, module, action, m).allowed;
  const sensitive = can("members", "view_sensitive");
  const scan = scanEligibility(s, m);
  const red = redemptionEligibility(s, m);
  const b = branchInfo(m);
  const restrictions = s.restrictions.filter((r) => r.memberIds.includes(m.id));
  const active = activeRestrictions(s, m);
  const linked = linkedMembers(s, m).filter((x) => x.id !== m.id);
  const initials = m.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const actions = [
    can("members", "edit") && { id: "edit", label: "Edit permitted details", icon: Pencil },
    can("members", "override") && m.verifiedIdentity && { id: "override", label: "Request verified-data override", icon: UserCog },
    can("members", "edit") && { id: "mobile", label: "Mobile change request", icon: Phone },
    can("members", "disable") && { id: "block", label: "Place Program Block", icon: ShieldBan },
    can("members", "hold") && { id: "hold", label: "Place Temporary Hold", icon: PauseCircle },
    can("members", "submit") && active.some((r) => r.status === "active") && { id: "reinstate", label: "Request reinstatement", icon: RotateCcw },
    can("members", "reset_credentials") && { id: "mpin", label: "Trigger MPIN reset", icon: KeyRound },
  ].filter(Boolean) as { id: typeof dialog; label: string; icon: typeof Pencil }[];
  return (
    <div className="req m360">
      <Link to="/members/directory" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Member directory</Link>
      <section className="req-head panel m360-head">
        <div className="req-head__top">
          <div className="m360-id">
            <span className="m360-avatar" aria-hidden="true">{initials}</span>
            <div>
              <p className="req-head__id mono">{m.id} · {m.registration.ref}</p>
              <h2 className="req-head__title">{m.name}{m.verifiedIdentity && <LockedTag />}</h2>
              <p className="req-head__type">
                <ProgrammeTag code={m.programme} size="sm" /> {m.memberType} · {SOURCE_LABEL[m.registration.source]} · <span className="mono">{maskMobile(m.mobile, reveal && sensitive)}</span>
                {sensitive && <button type="button" className="icon-btn icon-btn--sm" aria-label={reveal ? "Mask mobile" : "Show full mobile"} onClick={() => setReveal((x) => !x)}>{reveal ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
              </p>
            </div>
          </div>
          <div className="req-head__badges">
            <RegBadge status={m.status} />
            <RestrictionBadge s={s} m={m} />
          </div>
        </div>
        <dl className="req-head__facts">
          <div><dt>Scan eligibility</dt><dd><Gate ok={scan.allowed} /> <span className="small muted">{scan.reason}</span></dd></div>
          <div><dt>Redemption eligibility</dt><dd><Gate ok={red.allowed} /> <span className="small muted">{red.reason}</span></dd></div>
          <div><dt>KYC</dt><dd><KycBadge status={kycOverall(s, m)} /></dd></div>
          <div><dt>Registered</dt><dd className="num">{formatDateTime(m.registration.submittedAt)}</dd></div>
          <div><dt>Branch</dt><dd>{b?.branch.name} · {b?.district.name}, {b?.state.name}</dd></div>
          <div><dt>Sales Rep</dt><dd>{m.sr ?? "—"}</dd></div>
        </dl>
        {(can("view-as", "view") || can("view-as", "override")) && (
          <div className="btn-row m360-actions">
            <Link to={`/governance/platform/view-as?member=${m.id}`} className="btn btn--secondary btn--sm">View as member (read-only)</Link>
          </div>
        )}
        {actions.length > 0 && (
          <div className="btn-row m360-actions">
            {actions.map((a) => <button key={a.id} type="button" className={`btn btn--sm ${a.id === "block" || a.id === "hold" ? "btn--ghost" : "btn--secondary"}`} onClick={() => setDialog(a.id)}><a.icon size={14} strokeWidth={2} aria-hidden="true" />{a.label}</button>)}
            <Link to="/registration-kyc/kyc" className="btn btn--ghost btn--sm">Review KYC</Link>
          </div>
        )}
      </section>
      {linked.length > 0 && <Notice tone="info">Same KYC identity as {linked.map((x) => <Link key={x.id} to={`/members/member/${x.id}`} className="mono">{x.id} ({x.programme}) </Link>)}. Program Blocks apply per programme; a Temporary Hold applies to all of them.</Notice>}
      <Tabs<Tab> label="Member 360 sections" value={tab} onChange={(t) => setParams(t === "overview" ? {} : { tab: t })} tabs={[{ id: "overview", label: "Overview" }, { id: "profile", label: "Profile" }, { id: "addresses", label: "Addresses" }, { id: "kyc", label: "KYC documents" }, { id: "registration", label: "Registration & approvals" }, { id: "activity", label: "Points, scans & redemption" }, { id: "restrictions", label: "Blocks & holds", count: restrictions.length }, { id: "history", label: "Change history" }, { id: "consent", label: "Consent & retention" }]} />
      {tab === "overview" && <OverviewTab m={m} />}
      {tab === "profile" && <ProfileTab m={m} sensitive={sensitive} />}
      {tab === "addresses" && <AddressesTab m={m} sensitive={sensitive} />}
      {tab === "kyc" && <KycTab m={m} />}
      {tab === "registration" && <RegistrationTab m={m} />}
      {tab === "activity" && <ActivityTab m={m} />}
      {tab === "restrictions" && <RestrictionsTable rows={restrictions} />}
      {tab === "history" && <MemberEventsTable events={s.events.filter((e) => e.memberId === m.id)} acc={acc} title="Profile and activity change history" />}
      {tab === "consent" && <ConsentTab m={m} />}
      <ActionDialogs m={m} dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function OverviewTab({ m }: { m: Member }) {
  const { acc } = useMemberView();
  const l = memberLedger(m);
  const who = (id: string) => (id.startsWith("MEMBER:") ? "Member (self)" : id === "SYSTEM" ? "System" : userName(acc, id));
  return (
    <>
      <div className="grid-2">
        <Panel level={3} title="Membership">
          <dl className="kv kv--tight">
            {[["Member ID", m.id], ["Programme", `${m.programme} · ${requirementOf(m.programme).label}`], ["Registration source", SOURCE_LABEL[m.registration.source]], ["Registered by", who(m.registration.registeredBy)], ["Stage 1", m.registration.stage1 ? `${m.registration.stage1.decision.replace("_", " ")} · ${who(m.registration.stage1.by)} · ${formatDateTime(m.registration.stage1.at)}` : "Pending"], ["Stage 2", m.registration.stage2 ? `${m.registration.stage2.decision} · ${who(m.registration.stage2.by)} · ${formatDateTime(m.registration.stage2.at)}` : requirementOf(m.programme).stage2Reviewer === "evolve" ? "Not completed" : "Not applicable"], ["Branch / district / state", `${branchInfo(m)?.branch.name} · ${branchInfo(m)?.district.name} · ${branchInfo(m)?.state.name}`]].map(([k, val]) => <div key={k} className="kv__row"><dt>{k}</dt><dd>{val}</dd></div>)}
            {m.dd && <><div className="kv__row"><dt>Distributor ID</dt><dd className="mono">{m.dd.distributorId}</dd></div><div className="kv__row"><dt>Territory / target</dt><dd>{m.dd.territory} · {m.dd.salesTarget}</dd></div></>}
            {m.retailer && <div className="kv__row"><dt>GST eligibility gate</dt><dd><StatusBadge tone={m.retailer.gstStatus === "eligible" ? "positive" : m.retailer.gstStatus === "pending" ? "warning" : "negative"}>{m.retailer.gstStatus.replace("_", " ")}</StatusBadge> <span className="small muted">source: SFDC (mock)</span></dd></div>}
          </dl>
        </Panel>
        <Panel level={3} title="Points summary" subtitle="Read-only from the ledger abstraction (mock). Adjustments belong to Wallet & Points">
          <FigureRow items={[{ label: "Lifetime earned", value: `${formatCount(l.earned)} pts` }, { label: "Lifetime redeemed", value: `${formatCount(l.redeemed)} pts` }, { label: "Available balance", value: `${formatCount(l.balance)} pts`, tone: "accent" }]} />
        </Panel>
      </div>
      <div className="grid-3">
        <Panel level={3} title="Scans"><dl className="kv kv--tight"><div className="kv__row"><dt>Total scans</dt><dd>{l.scans.length}</dd></div><div className="kv__row"><dt>Last scan</dt><dd>{l.scans[0] ? `${formatDateTime(l.scans[0].at)} · ${l.scans[0].sku} · ${l.scans[0].status}` : "None"}</dd></div></dl></Panel>
        <Panel level={3} title="Redemption"><dl className="kv kv--tight"><div className="kv__row"><dt>Lifetime redeemed</dt><dd>{formatCount(l.redeemed)} pts</dd></div><div className="kv__row"><dt>Last redemption</dt><dd>{l.redemptions[0] ? `${formatDateTime(l.redemptions[0].at)} · ${l.redemptions[0].ref}` : "None"}</dd></div><div className="kv__row"><dt>Pending</dt><dd>{l.pendingRedemption ? `${formatCount(l.pendingRedemption)} pts` : "None"}</dd></div></dl></Panel>
        <Panel level={3} title="TDS" subtitle="Kept separate from points and TDS Kitty"><dl className="kv kv--tight">{l.tds.length ? l.tds.map((t) => <div key={t.fy} className="kv__row"><dt>{t.fy}</dt><dd>{formatCount(t.deducted)} pts-equivalent deducted</dd></div>) : <div className="kv__row"><dt>TDS</dt><dd>None recorded</dd></div>}</dl></Panel>
      </div>
    </>
  );
}

function ProfileTab({ m, sensitive }: { m: Member; sensitive: boolean }) {
  const fs = requirementOf(m.programme).fieldSource;
  const row = (label: string, value: string | null, verified: boolean, source: string) => <div key={label} className="kv__row"><dt>{label}</dt><dd>{value ?? <span className="muted">Not available</span>} {verified && <LockedTag />} <span className="small muted">· source: {source}</span></dd></div>;
  return (
    <Panel level={3} title="Profile details" subtitle={sensitive ? "Verified values shown because you hold View sensitive" : "Verified identity values are hidden without View sensitive"}>
      <dl className="kv kv--wide">
        {row("Full name", m.name, m.verifiedIdentity, fs.name)}
        {row("Date of birth", sensitive ? m.dob : m.dob ? "Hidden (sensitive)" : null, m.verifiedIdentity, fs.dob)}
        {row("Registered mobile", maskMobile(m.mobile, sensitive), m.registration.mobileVerified, "Mobile ownership check")}
        {row("Gender", m.gender, false, "Member")}
        {row("Email", m.email, false, "Member")}
        {row("Member type", m.memberType, false, "Programme master")}
        {row("Programme", `${m.programme} · ${requirementOf(m.programme).label}`, false, "Programme master")}
        {m.invite && row("SFDC invitation", `${m.invite.ref} · ${m.invite.completion.replace("_", " ")}`, false, "SFDC (mock)")}
      </dl>
      {(m.programme === "ST" || m.programme === "CS") && <Notice tone="info">ST/CS field sources are unconfirmed (OP-ST1): the split between SFDC-provided and in-app fields is not assumed.</Notice>}
    </Panel>
  );
}

function AddressCard({ title, a, note, sensitive, hide }: { title: string; a: Address | null; note: string; sensitive: boolean; hide?: boolean }) {
  return (
    <Panel level={3} title={title} subtitle={note}>
      {!a ? <p className="muted small">Not captured</p> : (
        <dl className="kv kv--tight">
          <div className="kv__row"><dt>Address</dt><dd>{hide && !sensitive ? "Hidden (sensitive)" : `${a.line}, ${a.district}, ${a.state} ${a.pincode}`} {a.locked && <LockedTag />}</dd></div>
          <div className="kv__row"><dt>Status</dt><dd>{a.verification.replace("_", " ")}</dd></div>
          {a.lat != null && <div className="kv__row"><dt>Coordinates</dt><dd className="mono small">{a.lat.toFixed(4)}, {a.lng?.toFixed(4)}</dd></div>}
          <div className="kv__row"><dt>Source</dt><dd>{a.source.replace("_", " ")}</dd></div>
          <div className="kv__row"><dt>Last updated</dt><dd>{formatDateTime(a.updatedAt)}</dd></div>
        </dl>
      )}
    </Panel>
  );
}

function AddressesTab({ m, sensitive }: { m: Member; sensitive: boolean }) {
  return (
    <div className="grid-3">
      <AddressCard title="Aadhaar home address" a={m.addresses.home} note="From verified identity. Locked after approval; changed only by an approved override" sensitive={sensitive} hide />
      <AddressCard title="Working location" a={m.addresses.working} note="Separate from the home address; member-editable under programme rules" sensitive={sensitive} />
      <AddressCard title="Gift delivery address" a={m.addresses.gift} note="Separate record; editable per business rules" sensitive={sensitive} />
    </div>
  );
}

function KycTab({ m }: { m: Member }) {
  const v = useMemberView();
  const { notify } = useToast();
  const req = requirementOf(m.programme);
  const docs = docsOf(v.s, m.id);
  const open = (d: KycDocument, kind: "preview" | "download") => {
    const out = accessDocument(v.uid, d.id, kind);
    notify(out.ok ? `${kind === "preview" ? "Preview" : "Download"} recorded. Development placeholder: no document content exists` : out.errors[0], out.ok ? "info" : "negative");
  };
  const cols: Column<KycDocument>[] = [
    { key: "type", header: "Document", value: (d) => DOC_LABEL[d.type], render: (d) => { const r = req.documents.find((x) => x.type === d.type); return <span className="cell-2"><span className="cell-2__main">{DOC_LABEL[d.type]}</span><span className="cell-2__sub">{r?.requirement.replace("_", " ")}{r?.note ? ` · ${r.note}` : ""}</span></span>; } },
    { key: "id", header: "Identifier", value: (d) => d.maskedId ?? "", render: (d) => <span className="mono small">{d.maskedId ?? "—"}</span> },
    { key: "sub", header: "Submitted", value: (d) => d.submittedAt ?? "", render: (d) => <span className="small num">{d.submittedAt ? formatDateTime(d.submittedAt) : "—"}</span> },
    { key: "method", header: "Method / source", value: (d) => d.method, render: (d) => <span className="small">{d.method}</span> },
    { key: "status", header: "Status", value: (d) => d.status, render: (d) => <DocBadge status={d.status} /> },
    { key: "rev", header: "Reviewed", value: (d) => d.reviewedAt ?? "", render: (d) => <span className="small">{d.reviewedBy ? `${d.reviewedBy === "SYSTEM" ? "System" : userName(v.acc, d.reviewedBy)} · ${formatDateTime(d.reviewedAt!)}` : "—"}</span> },
    { key: "why", header: "Rejection / exception", value: (d) => d.rejectionReason ?? d.exception ?? "", render: (d) => <span className="small cell-wrap neg">{d.rejectionReason ?? d.exception ?? ""}</span> },
    { key: "re", header: "Resubmissions", value: (d) => d.resubmissions, align: "right" },
    { key: "ref", header: "Latest ref", value: (d) => d.latestRef ?? "", render: (d) => <span className="mono small">{d.latestRef ?? "—"}</span> },
    { key: "act", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (d) => d.submittedAt && (
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <Link to={`/registration-kyc/kyc/doc/${d.id}`} className="btn btn--secondary btn--xs">Open</Link>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Preview ${DOC_LABEL[d.type]} evidence`} title="Preview evidence (permission checked)" onClick={() => open(d, "preview")}><Eye size={14} /></button>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Download ${DOC_LABEL[d.type]} evidence`} title="Download (separate permission)" onClick={() => open(d, "download")}><Download size={14} /></button>
      </span>
    ) },
  ];
  return (
    <Panel level={3} title="KYC documents" subtitle={`Document-wise status for ${m.programme}. Overall KYC is derived from the mandatory documents only`} padded={false}>
      <DataTable rows={docs} columns={cols} rowKey={(d) => d.id} caption="KYC documents" searchable={false} />
    </Panel>
  );
}

function RegistrationTab({ m }: { m: Member }) {
  const v = useMemberView();
  const events = v.s.events.filter((e) => e.memberId === m.id && ["registration", "kyc", "sfdc"].includes(e.category)).sort((a, b) => (a.at < b.at ? -1 : 1));
  const req = requirementOf(m.programme);
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel level={3} title="Registration and approval timeline">
        <ol className="hist">
          {events.map((e) => <li key={e.id} className="hist__item"><span className="hist__time small num muted">{formatDateTime(e.at)}</span><span className="hist__body"><span className="hist__action">{e.action}</span><span className="small muted">{e.by.startsWith("MEMBER:") ? "Member (app)" : e.by === "SYSTEM" ? "System" : userName(v.acc, e.by)} · {e.role}</span>{e.remarks && <span className="hist__remark">{e.remarks}</span>}</span><span className="mono small muted hist__ref">{e.ref}</span></li>)}
        </ol>
      </Panel>
      <Panel level={3} title="Programme journey">
        <dl className="kv kv--tight">
          <div className="kv__row"><dt>Status model</dt><dd>{req.statusModel.replace("_", " ")}</dd></div>
          <div className="kv__row"><dt>Scan gate</dt><dd className="small">{req.scanGate}</dd></div>
          <div className="kv__row"><dt>Redemption gate</dt><dd className="small">{req.redemptionGate}</dd></div>
          <div className="kv__row"><dt>Registry check</dt><dd>{m.registration.registryCheck.replace(/_/g, " ")}</dd></div>
          <div className="kv__row"><dt>MPIN</dt><dd>{m.registration.mpin.replace("_", " ")}</dd></div>
          {m.registration.sfdcRef && <div className="kv__row"><dt>SFDC</dt><dd className="small"><span className="mono">{m.registration.sfdcRef}</span> · {m.registration.sfdcSync}{m.registration.sfdcMessage ? ` · ${m.registration.sfdcMessage}` : ""}</dd></div>}
          <div className="kv__row"><dt>Open points</dt><dd className="small">{req.openPoints.join(", ")}</dd></div>
        </dl>
        <Link to={`/registration-kyc/review/${m.id}`} className="btn btn--secondary btn--sm">Open registration review</Link>
      </Panel>
    </div>
  );
}

function ActivityTab({ m }: { m: Member }) {
  const l = memberLedger(m);
  const [st, setSt] = useState("all");
  return (
    <>
      <Notice tone="info">Read-only development view through the ledger abstraction. Wallet, Scanning, Redemption and Finance are not connected and own these figures; no adjustment is possible here.</Notice>
      <Panel level={3} title="Scan history" padded={false}>
        <DataTable rows={l.scans.filter((x) => st === "all" || x.status === st)} rowKey={(x) => x.at + x.sku} caption="Scans" searchable={false} pageSize={8} toolbar={<SelectField label="Status" value={st} onChange={setSt} options={[{ value: "all", label: "All" }, { value: "Accepted", label: "Accepted" }, { value: "Rejected", label: "Rejected" }, { value: "Reversed", label: "Reversed" }]} active={st !== "all"} />} columns={[
          { key: "at", header: "Scanned", value: (x) => x.at, render: (x) => <span className="small num">{formatDateTime(x.at)}</span> },
          { key: "sku", header: "SKU", value: (x) => x.sku, render: (x) => <span className="mono small">{x.sku}</span> },
          { key: "pts", header: "Points", value: (x) => x.points, align: "right" },
          { key: "st", header: "Status", value: (x) => x.status },
        ] as Column<(typeof l.scans)[number]>[]} emptyTitle="No scans" />
      </Panel>
      <div className="grid-2">
        <Panel level={3} title="Redemptions" padded={false}>
          <DataTable rows={l.redemptions} rowKey={(x) => x.ref} caption="Redemptions" searchable={false} columns={[
            { key: "at", header: "Date", value: (x) => x.at, render: (x) => <span className="small num">{formatDateTime(x.at)}</span> },
            { key: "ref", header: "Reference", value: (x) => x.ref, render: (x) => <span className="mono small">{x.ref}</span> },
            { key: "pts", header: "Points", value: (x) => x.points, align: "right" },
            { key: "st", header: "Status", value: (x) => x.status },
          ] as Column<(typeof l.redemptions)[number]>[]} emptyTitle="No redemptions" />
        </Panel>
        <Panel level={3} title="TDS by financial year" padded={false}>
          <DataTable rows={l.tds} rowKey={(x) => x.fy} caption="TDS" searchable={false} columns={[
            { key: "fy", header: "Financial year", value: (x) => x.fy },
            { key: "d", header: "Deducted", value: (x) => x.deducted, align: "right" },
            { key: "b", header: "Basis", value: (x) => x.basis, render: (x) => <span className="small">{x.basis}</span> },
          ] as Column<(typeof l.tds)[number]>[]} emptyTitle="No TDS recorded" />
        </Panel>
      </div>
    </>
  );
}

export function RestrictionsTable({ rows, showMember = false }: { rows: Restriction[]; showMember?: boolean }) {
  const v = useMemberView();
  const who = (id: string | null | undefined) => (!id ? "—" : id === "SYSTEM" ? "System" : userName(v.acc, id));
  return (
    <Panel level={3} title="Block and hold history" subtitle="Restrictions never delete member data; lifted restrictions stay in history" padded={false}>
      <DataTable rows={rows} rowKey={(r) => r.id} caption="Restrictions" searchable={showMember} searchPlaceholder="Search restrictions" initialSort={{ key: "at", dir: "desc" }} emptyTitle="No restrictions" columns={[
        { key: "id", header: "Reference", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
        { key: "type", header: "Type", value: (r) => r.type, render: (r) => <span className={`restr restr--${r.type === "temporary_hold" ? "hold" : "block"}`}>{r.type === "temporary_hold" ? "Temporary hold" : "Program block"}</span> },
        ...(showMember ? [{ key: "members", header: "Members", value: (r: Restriction) => r.memberIds.join(", "), render: (r: Restriction) => <span className="small">{r.memberIds.map((id) => <Link key={id} to={`/members/member/${id}`} className="mono">{id} </Link>)}</span> }] : []),
        { key: "prog", header: "Programme", value: (r) => r.programme ?? "All linked", render: (r) => <span className="small">{r.programme ?? "All linked programmes"}</span> },
        { key: "at", header: "Applied", value: (r) => r.appliedAt, render: (r) => <span className="small">{formatDateTime(r.appliedAt)} · {who(r.appliedBy)}</span> },
        { key: "reason", header: "Reason", value: (r) => r.reasonCode, render: (r) => <span className="small cell-wrap">{r.reasonCode} · {r.remarks}{r.dedup ? ` · ${r.dedup.match.toUpperCase()} match ${r.dedup.masked} (related ${r.dedup.relatedMemberIds.join(", ")}, detected ${formatDateTime(r.dedup.detectedAt)})` : ""}</span> },
        { key: "trigger", header: "Trigger", value: (r) => r.trigger, render: (r) => <span className="small">{r.trigger.replace("_", " ")}</span> },
        { key: "status", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "active" ? "negative" : r.status === "reinstatement_pending" ? "warning" : "neutral"}>{r.status.replace("_", " ")}</StatusBadge> },
        { key: "rein", header: "Reinstatement", value: (r) => r.reinstatement?.requestId ?? "", render: (r) => (r.reinstatement ? <span className="small"><Link to={`/governance/approvals/request/${r.reinstatement.requestId}`} className="mono">{r.reinstatement.requestId}</Link>{r.reinstatement.liftedAt ? ` · lifted ${formatDateTime(r.reinstatement.liftedAt)} by ${who(r.reinstatement.liftedBy)}` : " · awaiting approval"}</span> : <span className="muted small">—</span>) },
      ] as Column<Restriction>[]} />
    </Panel>
  );
}

function ConsentTab({ m }: { m: Member }) {
  const v = useMemberView();
  const id = identityOf(v.s, m);
  return (
    <Panel level={3} title="Consent and retention metadata">
      <dl className="kv kv--wide">
        <div className="kv__row"><dt>Aadhaar consent</dt><dd>{id?.consent.given ? "Given" : "Not captured"}</dd></div>
        <div className="kv__row"><dt>Consent timestamp</dt><dd>{id?.consent.at ? formatDateTime(id.consent.at) : "—"}</dd></div>
        <div className="kv__row"><dt>Consent source</dt><dd>{id?.consent.source.replace("_", " ")}</dd></div>
        <div className="kv__row"><dt>Policy acknowledgement</dt><dd>{id?.consent.policyAcknowledged ? "Acknowledged at signup" : "Not recorded"}</dd></div>
        <div className="kv__row"><dt>Masked Aadhaar</dt><dd className="mono">{id?.maskedAadhaar ?? "—"}</dd></div>
        <div className="kv__row"><dt>Account closure</dt><dd>{id?.accountClosedAt ? formatDateTime(id.accountClosedAt) : "Account open"}</dd></div>
        <div className="kv__row"><dt>Retention</dt><dd className="small">SOW: KYC data retained for seven years after account closure; scan and transaction records retained for audit. Enforcement belongs to the backend and V-Guard governance. Showing these fields does not by itself make the portal compliant, and nothing is deleted automatically here</dd></div>
      </dl>
    </Panel>
  );
}

/* ---------------- Actions ---------------- */

function ActionDialogs({ m, dialog, onClose }: { m: Member; dialog: null | "edit" | "override" | "mobile" | "block" | "hold" | "reinstate" | "mpin"; onClose: () => void }) {
  const v = useMemberView();
  const { notify } = useToast();
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [p, setP] = useState({ email: m.email ?? "", gender: m.gender ?? "", working: m.addresses.working?.line ?? "", workingPin: m.addresses.working?.pincode ?? "", gift: m.addresses.gift?.line ?? "", giftPin: m.addresses.gift?.pincode ?? "", name: m.name });
  const [reason, setReason] = useState("");
  const [field, setField] = useState<"name" | "dob" | "homeAddress">("name");
  const [proposed, setProposed] = useState("");
  const [ticket, setTicket] = useState("");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [restriction, setRestriction] = useState("");
  const [evidence, setEvidence] = useState("");
  useEffect(() => { setRes(null); setReason(""); setCode(""); setProposed(""); setEvidence(""); }, [dialog]);
  const done = (out: PolicyResult & { id?: string }, msg: string) => {
    setRes(out);
    if (out.ok) {
      notify(msg, "positive");
      out.warnings.forEach((w) => notify(w, "info"));
      onClose();
    }
  };
  const footer = (label: string, act: () => void, danger = false) => <><button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button><button type="button" className={`btn ${danger ? "btn--danger" : "btn--primary"}`} onClick={act}>{label}</button></>;
  const type: RestrictionType = dialog === "hold" ? "temporary_hold" : "program_block";
  const impact = dialog === "block" || dialog === "hold" ? restrictionImpact(m.id, type) : null;
  const activeR = activeRestrictions(v.s, m).filter((r) => r.status === "active");
  return (
    <>
      <Drawer open={dialog === "edit"} onClose={onClose} title={`Edit ${m.id}`} subtitle="Only fields that are not verified-locked and are permitted by your role" width={560} footer={footer("Save changes", () => {
        const patch = { email: p.email, gender: p.gender, ...(p.working !== (m.addresses.working?.line ?? "") || p.workingPin !== (m.addresses.working?.pincode ?? "") ? { working: { line: p.working, pincode: p.workingPin } } : {}), ...(p.gift !== (m.addresses.gift?.line ?? "") || p.giftPin !== (m.addresses.gift?.pincode ?? "") ? { gift: { line: p.gift, pincode: p.giftPin } } : {}), ...(!m.verifiedIdentity && p.name !== m.name ? { name: p.name } : {}) };
        done(updateMemberProfile(v.uid, m.id, patch, reason), "Profile updated");
      })}>
        <div className="form-grid">
          {m.verifiedIdentity ? <div className="field"><span className="field__label">Name, date of birth, home address</span><p className="small"><LockedTag /> Verified through Aadhaar. Ordinary edits are blocked; use “Request verified-data override”.</p></div> : <TextField label="Full name" value={p.name} onChange={(x) => setP({ ...p, name: x })} />}
          <TextField label="Email" value={p.email} onChange={(x) => setP({ ...p, email: x })} />
          <SelectInput label="Gender" value={p.gender} onChange={(x) => setP({ ...p, gender: x })} options={[{ value: "", label: "Not provided" }, { value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} />
          <div className="form-grid form-grid--2"><TextField label="Working location" value={p.working} onChange={(x) => setP({ ...p, working: x })} /><TextField label="Pincode" value={p.workingPin} onChange={(x) => setP({ ...p, workingPin: x })} /></div>
          <div className="form-grid form-grid--2"><TextField label="Gift delivery address" value={p.gift} onChange={(x) => setP({ ...p, gift: x })} /><TextField label="Pincode" value={p.giftPin} onChange={(x) => setP({ ...p, giftPin: x })} /></div>
          <p className="small muted">Each address is stored separately; changing one never overwrites another.</p>
          <TextArea label="Reason" required value={reason} onChange={setReason} rows={2} />
          <PolicyMessages result={res} title="Not saved" />
        </div>
      </Drawer>

      <Drawer open={dialog === "override"} onClose={onClose} title="Request verified-data override" subtitle="Needs the override permission, a justification and approval in the Approval Centre (WF-013)" width={560} footer={footer("Submit for approval", () => done(requestVerifiedFieldOverride(v.uid, m.id, field, proposed, reason), "Override request submitted for approval"))}>
        <div className="form-grid">
          <SelectInput label="Verified field" value={field} onChange={(x) => setField(x as typeof field)} options={[{ value: "name", label: "Name" }, { value: "dob", label: "Date of birth" }, { value: "homeAddress", label: "Aadhaar home address" }]} />
          <div className="field"><span className="field__label">Current value</span><p>{field === "name" ? m.name : v.sensitive(m) ? (field === "dob" ? m.dob : `${m.addresses.home?.line}, ${m.addresses.home?.pincode}`) : "Hidden (needs View sensitive)"} <LockedTag /></p></div>
          <TextField label="Proposed value" required value={proposed} onChange={setProposed} type={field === "dob" ? "date" : "text"} hint={field === "homeAddress" ? "Format: address line, 6-digit pincode" : undefined} />
          <TextArea label="Justification" required value={reason} onChange={setReason} rows={3} hint="Mandatory; shown to the Checker and kept in the audit trail" />
          <PolicyMessages result={res} title="Not submitted" />
        </div>
      </Drawer>

      <Drawer open={dialog === "mobile"} onClose={onClose} title="Mobile number change request" width={520} footer={footer("Record request", () => done(requestMobileChange(v.uid, m.id, ticket, mobile), "Mobile change request recorded"))}>
        <div className="form-grid">
          <Notice tone="warn">A support ticket and OTP verification on both the existing and the new number are required. The OTP service is not connected, so the request stays “Awaiting verification” and the number is not changed from here.</Notice>
          <TextField label="Support ticket reference" required value={ticket} onChange={setTicket} placeholder="TCK-12345" />
          <TextField label="New mobile number" required value={mobile} onChange={setMobile} />
          <PolicyMessages result={res} title="Not recorded" />
        </div>
      </Drawer>

      <Drawer open={dialog === "block" || dialog === "hold"} onClose={onClose} title={dialog === "hold" ? "Place Temporary Hold" : `Place Program Block on ${m.programme}`} subtitle={dialog === "hold" ? "Applies to every programme linked to this KYC identity" : "Applies only to the selected programme"} width={600} footer={footer(dialog === "hold" ? "Apply Temporary Hold" : "Apply Program Block", () => done(applyRestriction(v.uid, m.id, type, code, reason), dialog === "hold" ? "Temporary hold applied" : "Program block applied"), true)}>
        {impact && (
          <div className="form-grid">
            <div className={`impact-callout impact-callout--${dialog}`}>
              <p className="small"><strong>{dialog === "hold" ? "Temporary Hold impact" : "Program Block impact"}</strong></p>
              <ul className="small">
                {impact.linked.map((x) => {
                  const hit = impact.affected.some((a) => a.id === x.id);
                  return <li key={x.id}><span className="mono">{x.id}</span> · {x.programme} · {hit ? <strong className="neg">scan and redemption blocked</strong> : <span className="pos">not affected</span>}</li>;
                })}
              </ul>
              <p className="small muted">{dialog === "hold" ? "New enrolment with this identity is blocked while the hold is active. History is retained." : "The member may stay eligible in other programmes; KYC can be reused as permitted. History is retained."}</p>
            </div>
            <SelectInput label="Reason code" required value={code} onChange={setCode} options={[{ value: "", label: "Choose" }, ...RESTRICTION_REASONS.filter((r) => r.type === "both" || r.type === type).map((r) => ({ value: r.code, label: r.label }))]} />
            <TextArea label="Remarks" required value={reason} onChange={setReason} rows={2} />
            <PolicyMessages result={res} title="Not applied" />
          </div>
        )}
      </Drawer>

      <Drawer open={dialog === "reinstate"} onClose={onClose} title="Request reinstatement" subtitle="Second-person approval in the Approval Centre (WF-012). You cannot approve your own request" width={560} footer={footer("Submit for approval", () => done(submitReinstatementRequest(v.uid, restriction, reason, evidence), "Reinstatement submitted for approval"))}>
        <div className="form-grid">
          <RadioCards name="restriction" label="Restriction to lift" value={restriction} onChange={setRestriction} options={activeR.map((r) => ({ value: r.id, label: `${r.id} · ${r.type === "temporary_hold" ? "Temporary hold" : `Program block (${r.programme})`}`, description: `${r.reasonCode} · applied ${formatDateTime(r.appliedAt)}` }))} />
          <TextArea label="Proposed reinstatement reason" required value={reason} onChange={setReason} rows={2} />
          <TextArea label="Evidence / remarks" value={evidence} onChange={setEvidence} rows={2} />
          <Notice tone="info">OP-BLK1: reason codes, pre-conditions and who may lift each restriction are not confirmed. The SOW minimum, second-person approval, is applied.</Notice>
          <PolicyMessages result={res} title="Not submitted" />
        </div>
      </Drawer>

      <ReasonDialog open={dialog === "mpin"} title={`Trigger MPIN reset · ${m.id}`} confirmLabel="Trigger reset" tone="danger" body={<div className="small"><p>The existing MPIN is never shown and no new MPIN is generated or stored here. The member completes the recovery step defined by OP-MPIN1 (not yet confirmed).</p><p className="muted">Account: {m.status.replace(/_/g, " ")} · masked mobile {maskMobile(m.mobile)}</p></div>} onClose={onClose} onConfirm={(r) => { const out = triggerMpinReset(v.uid, m.id, r); if (out.ok) notify(`MPIN reset initiated (${out.id})`, "positive"); return out; }} />
    </>
  );
}


