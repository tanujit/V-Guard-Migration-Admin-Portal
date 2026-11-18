import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, Bug, Cable, Cpu, Database, FileSearch, GitCompare, Gauge, History, KeyRound, ListChecks, Network, PlugZap, RefreshCw, Repeat, ScanLine, Siren, Stethoscope, UserCheck, Wallet, Workflow } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { HEALTH } from "@/config/opsCatalogue";
import { useSession } from "@/context/SessionContext";
import { hasPermission, type AccessState } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { demoNow } from "@/features/approvals/store";
import { geoOfMember, memberById, type MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { useOpsState } from "@/features/ops/store";
import { formatDateTime } from "@/lib/format";
import type { ActionId } from "@/types/rbac";
import type { HealthStatus, OpsState } from "@/types/ops";
import { MastersLayout, userName } from "@/pages/masters/shared";

export { userName };
export { useParam, useRun } from "@/pages/comms/shared";
export const OBASE = "/monitoring/integrations";

export function OpsLayout() {
  return (
    <MastersLayout
      title="Integration monitoring"
      description="SOW integrations, connection health, SFDC and eSeal data exchange, message trace, synchronisation, jobs and queues, failures, retry and reprocessing, reconciliation, system health, crashes, infrastructure, authentication, member diagnostics, adoption, redemption float and incidents (SOW Module 11, 10.11)"
      permission="integrations:view"
      eyebrow="Intelligence & monitoring"
      badge="Development monitoring data"
      meta="Development / demo data. Every connection is a mock adapter or a placeholder: no SFDC, eSeal, Siebel, RazorPay, DigiLocker, Signzy, WhatsApp, SMS, Google Maps or logistics endpoint is called from the browser, and no credential is stored here. Telemetry not derived from the platform modules is simulated and labelled"
      tabs={[
        { to: OBASE, end: true, label: "Overview", icon: BarChart3 },
        { to: `${OBASE}/directory`, label: "Directory", icon: Network },
        { to: `${OBASE}/connection-health`, label: "Connection health", icon: PlugZap },
        { to: `${OBASE}/sfdc`, label: "SFDC", icon: Cable },
        { to: `${OBASE}/eseal`, label: "eSeal", icon: ScanLine },
        { to: `${OBASE}/connections`, label: "Other connections", icon: Workflow },
        { to: `${OBASE}/trace`, label: "Message trace", icon: FileSearch },
        { to: `${OBASE}/sync`, label: "Data sync", icon: RefreshCw },
        { to: `${OBASE}/jobs`, label: "Jobs & queues", icon: ListChecks },
        { to: `${OBASE}/failures`, label: "Errors & failures", icon: AlertTriangle },
        { to: `${OBASE}/retry`, label: "Retry & reprocessing", icon: Repeat },
        { to: `${OBASE}/reconciliation`, label: "Reconciliation", icon: GitCompare },
        { to: `${OBASE}/system-health`, label: "System health", icon: Activity, perm: "health:view" },
        { to: `${OBASE}/api-performance`, label: "API performance", icon: Gauge, perm: "health:view" },
        { to: `${OBASE}/crashes`, label: "Crashes & errors", icon: Bug, perm: "health:view" },
        { to: `${OBASE}/infrastructure`, label: "Infrastructure", icon: Cpu, perm: "health:view" },
        { to: `${OBASE}/authentication`, label: "Authentication", icon: KeyRound, perm: "auth-audit:view" },
        { to: `${OBASE}/member-diagnostics`, label: "Member diagnostics", icon: Stethoscope, perm: "member-diagnostics:view" },
        { to: `${OBASE}/adoption`, label: "Adoption", icon: UserCheck, perm: "adoption:view" },
        { to: `${OBASE}/float`, label: "Float & kitty", icon: Wallet, perm: "float-monitoring:view" },
        { to: `${OBASE}/incidents`, label: "Alerts & incidents", icon: Siren },
        { to: `${OBASE}/audit`, label: "Audit & decisions", icon: History },
      ]}
    />
  );
}

export interface OpsView {
  os: OpsState;
  mem: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  now: string;
  canOn: (module: string, action: ActionId, memberId: string | null) => boolean;
}
export function useOpsView(): OpsView {
  const os = useOpsState();
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
  return { os, mem, acc, uid, can, now: demoNow(), canOn };
}

export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : "—");
export const ms = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} s` : `${v} ms`);
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const HealthBadge = ({ h }: { h: HealthStatus }) => <span title={h === "unknown" ? "No request in the health window: health cannot be reported" : undefined}><StatusBadge tone={HEALTH[h].tone}>{HEALTH[h].label}</StatusBadge></span>;
export const ReqBadge = ({ s }: { s: "success" | "failed" | "timeout" | "pending" }) => <StatusBadge tone={s === "success" ? "positive" : s === "pending" ? "info" : "negative"}>{s === "timeout" ? "Timed out" : s[0].toUpperCase() + s.slice(1)}</StatusBadge>;
export const RunBadge = ({ s }: { s: string }) => <StatusBadge tone={s === "success" || s === "completed" || s === "acknowledged" || s === "synced" ? "positive" : s === "running" || s === "pending" ? "info" : s === "delayed" || s === "partial" || s === "held" ? "warning" : "negative"}>{s.replace(/_/g, " ")}</StatusBadge>;
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;
export const SimTag = ({ title = "Simulated by a mock telemetry adapter" }: { title?: string }) => <span className="risk-sim" title={title}>Simulated</span>;
export const DerivedTag = ({ from }: { from: string }) => <span className="ops-derived" title={`Derived from ${from}`}><Database size={11} aria-hidden="true" />{from}</span>;
export const intLink = (os: OpsState, id: string | null) => (id ? <Link to={`${OBASE}/directory/${id}`} className="small" onClick={(e) => e.stopPropagation()}>{os.integrations.find((i) => i.id === id)?.name ?? id}</Link> : <span className="muted small">—</span>);
export const memberLink = (id: string | null) => (id ? <Link to={`/members/member/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const approvalLink = (id: string | null | undefined) => (id ? <Link to={`/governance/approvals/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const commLink = (id: string | null) => (id ? <Link to={`/masters/communication/history/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const traceLink = (ref: string, kind = "reference") => <Link to={`${OBASE}/trace?kind=${kind}&q=${encodeURIComponent(ref)}`} className="mono small" onClick={(e) => e.stopPropagation()}>{ref}</Link>;
export function DecisionRef({ id, label }: { id: string; label?: string }) {
  return <Link to={`${OBASE}/audit?tab=decisions#${id}`} className="decision-ref mono">{label ?? id}</Link>;
}
export const Fig = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="ops-fig">
    <span className="ops-fig__label">{label}</span>
    <span className="ops-fig__value num">{children}</span>
  </div>
);
