import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, Briefcase, Fingerprint, GitCompare, History, Inbox, MapPin, QrCode, Radar, Scale, Settings2, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { CASE_STATUS, SEVERITY, SOURCE, VECTOR } from "@/config/riskCatalogue";
import { useSession } from "@/context/SessionContext";
import { hasPermission, type AccessState } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { demoNow } from "@/features/approvals/store";
import { geoOfMember, memberById, type MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { useRiskState } from "@/features/risk/store";
import { formatDateTime } from "@/lib/format";
import type { ActionId } from "@/types/rbac";
import type { CaseStatus, DetectionSource, FraudVector, RiskState, Severity } from "@/types/risk";
import { MastersLayout, userName } from "@/pages/masters/shared";

export { userName };
export { useParam, useRun } from "@/pages/comms/shared";
export const FBASE = "/governance/fraud";

export function FraudLayout() {
  return (
    <MastersLayout
      title="Fraud & risk"
      description="Central fraud review queue, risk cases, anomaly rules, device governance, duplicate identity, QR integrity, geo-velocity and branch leakage, redemption risk, data integrity, SFDC reconciliation and compliance evidence (SOW Module 9)"
      permission="fraud-rules:view"
      eyebrow="Governance"
      badge="Development risk data"
      meta="Development / demo data. Detection services (identity registry, device risk, rule-based and predictive anomaly, geo-velocity, geo-validation, QR integrity, SFDC) are mock adapters: no flag here is a detected production fraud, and no handset, scan or redemption is actually blocked"
      tabs={[
        { to: FBASE, end: true, label: "Overview", icon: BarChart3 },
        { to: `${FBASE}/queue`, label: "Review queue", icon: Inbox },
        { to: `${FBASE}/cases`, label: "Risk cases", icon: Briefcase },
        { to: `${FBASE}/rules`, label: "Risk rules", icon: Settings2 },
        { to: `${FBASE}/anomaly`, label: "Anomaly detection", icon: Radar },
        { to: `${FBASE}/devices`, label: "Devices", icon: Smartphone, perm: "devices:view" },
        { to: `${FBASE}/identity`, label: "Duplicate identity", icon: Fingerprint },
        { to: `${FBASE}/qr`, label: "QR integrity", icon: QrCode },
        { to: `${FBASE}/geo`, label: "Geo-velocity & branch", icon: MapPin },
        { to: `${FBASE}/redemption`, label: "Redemption risk", icon: Wallet },
        { to: `${FBASE}/rate`, label: "Scan rate controls", icon: Activity },
        { to: `${FBASE}/data`, label: "Data integrity", icon: AlertTriangle },
        { to: `${FBASE}/sfdc`, label: "SFDC reconciliation", icon: GitCompare },
        { to: `${FBASE}/history`, label: "Investigation history", icon: History },
        { to: `${FBASE}/config-history`, label: "Configuration & decisions", icon: Scale },
        { to: `${FBASE}/compliance`, label: "Compliance & audit", icon: ShieldCheck },
      ]}
    />
  );
}

export interface FraudView {
  rs: RiskState;
  mem: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  now: string;
  canOn: (module: string, action: ActionId, memberId: string | null) => boolean;
}
export function useFraudView(): FraudView {
  const rs = useRiskState();
  const mem = useMemberState();
  const acc = useAccessState();
  const { user, can } = useSession();
  const uid = user!.id;
  const canOn = useMemo(
    () => (module: string, action: ActionId, memberId: string | null) => {
      const m = memberId ? memberById(mem, memberId) : undefined;
      return m ? hasPermission(acc, uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed : hasPermission(acc, uid, module, action).allowed;
    },
    [acc, uid, mem],
  );
  return { rs, mem, acc, uid, can, now: demoNow(), canOn };
}

export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : "—");
export const memberName = (mem: MemberState, id: string | null) => (id ? memberById(mem, id)?.name ?? id : "—");
export const VectorTag = ({ v }: { v: FraudVector }) => <span className={`risk-vector risk-vector--${v}`} title={VECTOR[v].sow}>{VECTOR[v].label}</span>;
export const SourceTag = ({ s }: { s: DetectionSource }) => <span className={`risk-source risk-source--${s}`}>{SOURCE[s]}</span>;
/** Only what the detection service supplied. */
export const SeverityBadge = ({ s }: { s: Severity | null }) => (s ? <StatusBadge tone={SEVERITY[s].tone}>{SEVERITY[s].label}</StatusBadge> : <span className="muted small">Not supplied</span>);
export const Score = ({ v }: { v: number | null }) => (v == null ? <span className="muted small">Not available</span> : <span className="num" title="Source-supplied score">{v.toFixed(2)}</span>);
export const CaseBadge = ({ s }: { s: CaseStatus }) => <StatusBadge tone={s === "cleared" || s === "closed" ? "positive" : s === "confirmed_misuse" || s === "restriction_applied" ? "negative" : s === "escalated" || s === "restriction_recommended" ? "warning" : "info"}>{CASE_STATUS[s]}</StatusBadge>;
export const EventStatus = ({ s }: { s: RiskState["events"][number]["status"] }) => <StatusBadge tone={s === "cleared" ? "positive" : s === "confirmed" ? "negative" : s === "in_case" ? "info" : "warning"}>{s === "in_case" ? "In case" : s === "new" ? "New" : s === "cleared" ? "Cleared" : "Confirmed"}</StatusBadge>;
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;
export const SimTag = () => <span className="risk-sim" title="Development output of a mock detection service">Simulated</span>;

export const approvalLink = (id: string | null | undefined) => (id ? <Link to={`/governance/approvals/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const memberLink = (id: string | null) => (id ? <Link to={`/members/member/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const caseLink = (id: string | null) => (id ? <Link to={`${FBASE}/cases/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const deviceLink = (id: string) => <Link to={`${FBASE}/devices/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>;
export const commLink = (id: string | null) => (id ? <Link to={`/masters/communication/history/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export function DecisionRef({ id, label }: { id: string; label?: string }) {
  return <Link to={`${FBASE}/config-history#${id}`} className="decision-ref mono">{label ?? id}</Link>;
}
export const restrictionState = (mem: MemberState, memberId: string | null) => {
  if (!memberId) return "—";
  const r = mem.restrictions.filter((x) => x.status !== "lifted" && x.memberIds.includes(memberId));
  return r.length ? r.map((x) => `${x.type === "program_block" ? "Program Block" : "Temporary Hold"} ${x.id}${x.status === "reinstatement_pending" ? " (reinstatement pending)" : ""}`).join(", ") : "None";
};
