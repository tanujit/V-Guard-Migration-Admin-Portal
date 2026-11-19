import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AlertTriangle, BookCheck, Database, Eye, FlaskConical, Gauge, KeyRound, LayoutDashboard, MousePointerClick, Palette, Rocket, ScrollText, Settings2, ShieldCheck, Undo2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { DemoBadge, StatusBadge } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useAccessState } from "@/features/access/store";
import { useApprovalState, demoNow } from "@/features/approvals/store";
import { useMemberState } from "@/features/members/store";
import { usePlatformState } from "@/features/platform/store";
import { useViewAsState } from "@/features/platform/viewAsSession";
import { formatDateTime } from "@/lib/format";
import type { CoverageStatus, EvidenceStatus, GateStatus } from "@/types/platform";
import { AccessDenied } from "@/pages/users/shared";
import { userName } from "@/pages/masters/shared";

export { userName };
export { useParam, useRun } from "@/pages/comms/shared";
export const PBASE = "/governance/platform";

type Tab = { to: string; label: string; icon: typeof Eye; perm?: string; end?: boolean };
const GROUPS: { id: string; label: string; tabs: Tab[] }[] = [
  { id: "admin", label: "Administration", tabs: [
    { to: PBASE, end: true, label: "Platform overview", icon: LayoutDashboard },
    { to: `${PBASE}/access`, label: "Admin access & SSO", icon: KeyRound },
    { to: `${PBASE}/roles`, label: "Roles & permissions", icon: ShieldCheck },
    { to: `${PBASE}/configuration`, label: "Configuration registry", icon: Settings2 },
    { to: `${PBASE}/audit`, label: "Audit & error catalogue", icon: ScrollText },
  ] },
  { id: "member", label: "Member experience", tabs: [
    { to: `${PBASE}/view-as`, label: "View-As", icon: Eye, perm: "view-as" },
    { to: `${PBASE}/app-usage`, label: "App usage analytics", icon: MousePointerClick, perm: "app-usage:view" },
    { to: `${PBASE}/themes`, label: "App themes", icon: Palette, perm: "app-themes:view" },
  ] },
  { id: "sow", label: "SOW & governance", tabs: [
    { to: `${PBASE}/coverage`, label: "SOW feature coverage", icon: BookCheck },
    { to: `${PBASE}/open-points`, label: "Open points & scope", icon: AlertTriangle },
  ] },
  { id: "ready", label: "Readiness", tabs: [
    { to: `${PBASE}/performance`, label: "Performance & capacity", icon: Gauge, perm: "release-readiness:view" },
    { to: `${PBASE}/testing`, label: "Testing & UAT", icon: FlaskConical, perm: "release-readiness:view" },
    { to: `${PBASE}/migration`, label: "Data migration", icon: Database, perm: "release-readiness:view" },
    { to: `${PBASE}/go-live`, label: "Go-live checklist", icon: Rocket, perm: "release-readiness:view" },
    { to: `${PBASE}/release`, label: "Release & rollback", icon: Undo2, perm: "release-readiness:view" },
  ] },
];

export function PlatformLayout() {
  const { can } = useSession();
  const { pathname } = useLocation();
  const allowed = (t: Tab) => (t.perm === "view-as" ? can("view-as:view") || can("view-as:override") : t.perm ? can(t.perm) : can("platform-admin:view"));
  const groups = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter(allowed) })).filter((g) => g.tabs.length);
  if (!groups.length) {
    return (
      <PageContainer>
        <PageHeader title="Platform administration" />
        <AccessDenied message="You need Platform administration, View-As, App usage, App themes or Release readiness access. Ask an Evolve Super Admin to review your access." />
      </PageContainer>
    );
  }
  const all = groups.flatMap((g) => g.tabs);
  const active = [...all].sort((a, b) => b.to.length - a.to.length).find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)));
  const group = groups.find((g) => g.tabs.includes(active!)) ?? groups[0];
  return (
    <PageContainer>
      <PageHeader
        variant="hero"
        eyebrow="Governance"
        title="Platform administration"
        description="Access and role governance, configuration, View-As, app usage and themes, central audit, SOW coverage, open points, and the evidence behind UAT, migration and go-live (SOW 10.1, 10.2, 10.7, 10.8, 10.12, 10.13, Module 14, Annexure A)"
        meta={<><DemoBadge label="Development governance data" /><span className="muted small">Readiness shows recorded evidence only. Nothing here is a production sign-off, a measured production result or a deployment</span></>}
      />
      <nav className="ana-groups" aria-label="Platform sections">
        {groups.map((g) => <NavLink key={g.id} to={g.tabs[0].to} end={g.tabs[0].end} className={() => `ana-groups__btn ${g.id === group.id ? "is-active" : ""}`}>{g.label}</NavLink>)}
      </nav>
      <nav className="subnav" aria-label={group.label}>
        <ul>{group.tabs.map((t) => <li key={t.to}><NavLink to={t.to} end={t.end} className={() => `subnav__link ${active === t ? "is-active" : ""}`}><t.icon size={16} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink></li>)}</ul>
      </nav>
      <div className="subnav-body"><Outlet /></div>
    </PageContainer>
  );
}

export function usePlatformView() {
  const ps = usePlatformState();
  const va = useViewAsState();
  const acc = useAccessState();
  useApprovalState();
  useMemberState();
  const { user, can } = useSession();
  return { ps, va, acc, uid: user!.id, can, now: demoNow() };
}

export const dt = (iso: string | number | null | undefined) => (iso == null ? "—" : typeof iso === "number" ? formatDateTime(new Date(iso).toISOString().slice(0, 16)) : formatDateTime(iso.length === 10 ? `${iso}T00:00` : iso));
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;
export function DecisionRef({ id }: { id: string }) {
  return <Link to={`${PBASE}/open-points#${id}`} className="decision-ref mono">{id}</Link>;
}
const COVERAGE: Record<CoverageStatus, { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "info" }> = {
  fully_implemented: { label: "Fully implemented", tone: "positive" }, partially_implemented: { label: "Partially implemented", tone: "warning" }, ui_only: { label: "UI only", tone: "warning" }, mock_service_only: { label: "Mock service only", tone: "info" }, backend_integration_prepared: { label: "Backend integration prepared", tone: "info" }, live_integration: { label: "Live integration", tone: "positive" }, business_confirmation_required: { label: "Business confirmation required", tone: "warning" }, not_implemented: { label: "Not implemented", tone: "negative" }, not_applicable: { label: "Not applicable", tone: "neutral" },
};
export const CoverageBadge = ({ s }: { s: CoverageStatus }) => <StatusBadge tone={COVERAGE[s].tone}>{COVERAGE[s].label}</StatusBadge>;
const EV: Record<string, { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "info" }> = {
  not_tested: { label: "Not tested", tone: "neutral" }, pending_engineering_evidence: { label: "Pending engineering evidence", tone: "warning" }, meets_target: { label: "Meets target", tone: "positive" }, at_risk: { label: "At risk", tone: "warning" }, fails_target: { label: "Fails target", tone: "negative" }, insufficient_samples: { label: "Insufficient samples", tone: "warning" }, telemetry_unavailable: { label: "Telemetry unavailable", tone: "neutral" },
  passed: { label: "Passed", tone: "positive" }, failed: { label: "Failed", tone: "negative" }, partial: { label: "Partial", tone: "warning" }, not_tested_backend_required: { label: "Not tested — backend integration required", tone: "neutral" }, mock_adapter_only: { label: "Mock adapter only", tone: "info" },
  not_started: { label: "Not started", tone: "neutral" }, in_progress: { label: "In progress", tone: "info" }, pending_evidence: { label: "Pending evidence", tone: "warning" }, pending_review: { label: "Pending review", tone: "warning" }, blocked: { label: "Blocked", tone: "negative" },
};
export const EvidenceBadge = ({ s }: { s: EvidenceStatus | GateStatus | string }) => <StatusBadge tone={EV[s]?.tone ?? "neutral"}>{EV[s]?.label ?? s.replace(/_/g, " ")}</StatusBadge>;
export const memberLink = (id: string | null) => (id ? <Link to={`/members/member/${id}`} className="mono small">{id}</Link> : <span className="muted small">—</span>);
export function Tile({ label, value, sub, onClick, tone }: { label: string; value: ReactNode; sub?: string; onClick?: () => void; tone?: "warn" | "accent" }) {
  const body = <><span className="ana-tile__label">{label}</span><span className="ana-tile__value num">{value}</span>{sub && <span className="ana-tile__period">{sub}</span>}</>;
  return onClick ? <button type="button" className={`ana-tile ana-tile--btn ${tone ? `ana-tile--${tone}` : ""}`} onClick={onClick}>{body}</button> : <div className={`ana-tile ${tone ? `ana-tile--${tone}` : ""}`}>{body}</div>;
}
