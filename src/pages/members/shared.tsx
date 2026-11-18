import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, BadgeCheck, CircleHelp, ClipboardList, FileSearch, FileWarning, History, IdCard, KeyRound, LayoutDashboard, Lock, ShieldBan, UserPlus, Users } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ProgrammeTag, StatusBadge } from "@/components/ui/primitives";
import { DOC_STATUS, KYC_OVERALL, REG_STATUS, SOURCE_LABEL } from "@/config/memberProgrammes";
import { useSession } from "@/context/SessionContext";
import { useAccessState } from "@/features/access/store";
import { canOn, kycOverall, maskMobile, redemptionEligibility, restrictionLabel, scanEligibility, type MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { formatDateTime } from "@/lib/format";
import type { DocStatus, KycOverall, Member, MemberEvent, RegistrationStatus } from "@/types/members";
import { MastersLayout, userName } from "@/pages/masters/shared";
import type { AccessState } from "@/features/access/engine";

export { userName };

export function MembersLayout() {
  return (
    <MastersLayout
      title="Member management"
      description="Members across EP, ST, CS, Retailer and DD: Member 360, restrictions, activity and MPIN reset"
      permission="members:view"
      eyebrow="Programme operations"
      badge="Development member data"
      meta="Development member data. Aadhaar, PAN and bank numbers exist only in masked form; no verification service, SFDC or mobile app is connected"
      tabs={[
        { to: "/members", end: true, label: "Overview", icon: LayoutDashboard },
        { to: "/members/directory", label: "Member directory", icon: Users },
        { to: "/members/360", label: "Member 360", icon: IdCard },
        { to: "/members/restrictions", label: "Status & restrictions", icon: ShieldBan },
        { to: "/members/activity", label: "Activity history", icon: Activity },
        { to: "/members/mpin", label: "MPIN reset", icon: KeyRound, perm: "members:reset_credentials" },
      ]}
    />
  );
}

export function RegistrationLayout() {
  return (
    <MastersLayout
      title="Registration & KYC"
      description="Programme-specific registration journeys and document-wise KYC verification"
      permission="registration-kyc:view"
      eyebrow="Programme operations"
      badge="Development member data"
      meta="Verification results shown are mock responses. Aadhaar/DigiLocker/UIDAI, Signzy, NSDL, SFDC, OTP, SMS and email are not connected"
      tabs={[
        { to: "/registration-kyc", end: true, label: "Registration overview", icon: LayoutDashboard },
        { to: "/registration-kyc/queue", label: "Registration queue", icon: ClipboardList },
        { to: "/registration-kyc/assisted", label: "Assisted EP registration", icon: UserPlus, perm: "members:create" },
        { to: "/registration-kyc/kyc", label: "KYC verification", icon: BadgeCheck },
        { to: "/registration-kyc/exceptions", label: "KYC exceptions", icon: FileWarning },
        { to: "/registration-kyc/history", label: "Verification history", icon: History },
        { to: "/registration-kyc/decisions", label: "Decision register", icon: CircleHelp },
      ]}
    />
  );
}

export interface MemberView {
  s: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  /** Members inside the viewer's programme and geography scope for the module. */
  visible: Member[];
  sensitive: (m: Member) => boolean;
}

export function useMemberView(module: "members" | "registration-kyc" = "members"): MemberView {
  const s = useMemberState();
  const acc = useAccessState();
  const { user, can } = useSession();
  const uid = user!.id;
  const visible = useMemo(() => s.members.filter((m) => canOn(acc, uid, module, "view", m).allowed), [s.members, acc, uid, module]);
  return { s, acc, uid, can, visible, sensitive: (m) => canOn(acc, uid, "members", "view_sensitive", m).allowed };
}

export const RegBadge = ({ status }: { status: RegistrationStatus }) => <StatusBadge tone={REG_STATUS[status].tone}>{REG_STATUS[status].label}</StatusBadge>;
export const DocBadge = ({ status }: { status: DocStatus }) => <StatusBadge tone={DOC_STATUS[status].tone}>{DOC_STATUS[status].label}</StatusBadge>;
export const KycBadge = ({ status }: { status: KycOverall }) => <StatusBadge tone={KYC_OVERALL[status].tone}>{KYC_OVERALL[status].label}</StatusBadge>;
export const Gate = ({ ok, label }: { ok: boolean; label?: string }) => <StatusBadge tone={ok ? "positive" : "negative"}>{label ?? (ok ? "Allowed" : "Blocked")}</StatusBadge>;
export function RestrictionBadge({ s, m }: { s: MemberState; m: Member }) {
  const r = restrictionLabel(s, m);
  return r === "None" ? <span className="muted small">None</span> : <span className={`restr restr--${r === "Temporary hold" ? "hold" : "block"}`}>{r}</span>;
}
export const LockedTag = () => (
  <span className="locked-tag" title="Verified through Aadhaar; editable only by an approved override">
    <Lock size={11} strokeWidth={2.5} aria-hidden="true" />
    Verified · locked
  </span>
);

export const memberCells = (s: MemberState, reveal: (m: Member) => boolean) => ({
  id: { key: "id", header: "Member ID", value: (m: Member) => m.id, render: (m: Member) => <Link to={`/members/member/${m.id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{m.id}</Link> } as Column<Member>,
  name: { key: "name", header: "Member name", value: (m: Member) => m.name } as Column<Member>,
  mobile: { key: "mobile", header: "Mobile", value: (m: Member) => maskMobile(m.mobile, reveal(m)), noSearch: true, render: (m: Member) => <span className="mono small">{maskMobile(m.mobile, reveal(m))}</span> } as Column<Member>,
  programme: { key: "programme", header: "Programme", value: (m: Member) => m.programme, render: (m: Member) => <ProgrammeTag code={m.programme} size="sm" /> } as Column<Member>,
  source: { key: "source", header: "Registration source", value: (m: Member) => SOURCE_LABEL[m.registration.source], render: (m: Member) => <span className="small">{SOURCE_LABEL[m.registration.source]}</span> } as Column<Member>,
  status: { key: "status", header: "Registration status", value: (m: Member) => REG_STATUS[m.status].label, render: (m: Member) => <RegBadge status={m.status} /> } as Column<Member>,
  scan: { key: "scan", header: "Scan", value: (m: Member) => (scanEligibility(s, m).allowed ? "Allowed" : "Blocked"), render: (m: Member) => <Gate ok={scanEligibility(s, m).allowed} /> } as Column<Member>,
  redemption: { key: "redemption", header: "Redemption", value: (m: Member) => (redemptionEligibility(s, m).allowed ? "Allowed" : "Blocked"), render: (m: Member) => <Gate ok={redemptionEligibility(s, m).allowed} /> } as Column<Member>,
  kyc: { key: "kyc", header: "KYC", value: (m: Member) => KYC_OVERALL[kycOverall(s, m)].label, render: (m: Member) => <KycBadge status={kycOverall(s, m)} /> } as Column<Member>,
  restriction: { key: "restriction", header: "Restriction", value: (m: Member) => restrictionLabel(s, m), render: (m: Member) => <RestrictionBadge s={s} m={m} /> } as Column<Member>,
});

const CATEGORY_LABEL: Record<MemberEvent["category"], string> = { registration: "Registration", kyc: "KYC", profile: "Profile", address: "Address", restriction: "Restriction", mpin: "MPIN", activity: "Activity", sfdc: "SFDC", security: "Security", notification: "Notification" };

export function MemberEventsTable({ events, acc, title = "Change history", showMember = false, pageSize = 10 }: { events: MemberEvent[]; acc: AccessState; title?: string; showMember?: boolean; pageSize?: number }) {
  const who = (id: string) => (id.startsWith("MEMBER:") ? "Member (app)" : userName(acc, id));
  const cols: Column<MemberEvent>[] = [
    { key: "at", header: "Date and time", value: (e) => e.at, render: (e) => <span className="small num">{formatDateTime(e.at)}</span> },
    ...(showMember ? [{ key: "member", header: "Member", value: (e: MemberEvent) => e.memberId, render: (e: MemberEvent) => <Link to={`/members/member/${e.memberId}`} className="mono small" onClick={(x) => x.stopPropagation()}>{e.memberId}</Link> }, { key: "prog", header: "Programme", value: (e: MemberEvent) => e.programme }] : []),
    { key: "cat", header: "Type", value: (e) => CATEGORY_LABEL[e.category], render: (e) => <span className={`ev-cat ev-cat--${e.category}`}>{CATEGORY_LABEL[e.category]}</span> },
    { key: "action", header: "Activity", value: (e) => e.action, render: (e) => <span className="small cell-wrap">{e.action}</span> },
    { key: "old", header: "Old value", value: (e) => e.oldValue ?? "", render: (e) => <span className="small cell-wrap muted">{e.oldValue ?? "—"}</span> },
    { key: "new", header: "New value", value: (e) => e.newValue ?? "", render: (e) => <span className="small cell-wrap">{e.newValue ?? "—"}</span> },
    { key: "by", header: "Performed by", value: (e) => who(e.by), render: (e) => <span className="cell-2"><span className="cell-2__main small">{who(e.by)}</span><span className="cell-2__sub">{e.role}{e.orgId ? ` · ${acc.organisations.find((o) => o.id === e.orgId)?.name}` : ""}</span></span> },
    { key: "remarks", header: "Reason / remarks", value: (e) => e.remarks, render: (e) => <span className="small cell-wrap">{e.remarks || "—"}</span> },
    { key: "ref", header: "Reference", value: (e) => e.ref, render: (e) => (e.approvalRequestId ? <Link to={`/governance/approvals/request/${e.approvalRequestId}`} className="mono small">{e.approvalRequestId}</Link> : <span className="mono small muted">{e.ref}</span>) },
  ];
  return (
    <Panel title={title} subtitle="Append-only. Entries cannot be edited or removed from the portal" level={3} padded={false}>
      <DataTable rows={events} columns={cols} rowKey={(e) => e.id} caption={title} searchPlaceholder="Search history" pageSize={pageSize} initialSort={{ key: "at", dir: "desc" }} exportName="member-history" emptyTitle="No history" />
    </Panel>
  );
}

export const DocTypeIcon = FileSearch;
export { DOC_STATUS };
