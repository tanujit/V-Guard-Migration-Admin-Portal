import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useAccessState } from "@/features/access/store";
import { useMemberState } from "@/features/members/store";
import { useJobsState } from "@/features/jobs/store";
import { CLASS_LABEL, JOBS_BASE, JOB_SECTIONS, type CapabilityClass } from "@/config/jobsCatalogue";
import { formatDateTime } from "@/lib/format";
import { AccessDenied } from "@/pages/users/shared";
import { userName } from "@/pages/masters/shared";

export { userName, JOBS_BASE };
export { useParam, useRun } from "@/pages/comms/shared";

export function JobsLayout() {
  const { can } = useSession();
  const { pathname } = useLocation();
  if (!can("proposed-scope:view")) {
    return (
      <PageContainer>
        <PageHeader title="Job management & field tooling (Proposed)" />
        <AccessDenied message="Proposed Module 12 is restricted to the Evolve Super Admin until V-Guard approves the scope." />
      </PageContainer>
    );
  }
  const rel = pathname.slice(JOBS_BASE.length).replace(/^\//, "");
  const isActive = (p: string) => (p === "" ? rel === "" : rel === p || rel.startsWith(`${p}/`));
  const group = JOB_SECTIONS.find((g) => g.items.some((i) => isActive(i.path))) ?? JOB_SECTIONS[0];
  return (
    <PageContainer>
      <PageHeader
        variant="hero"
        eyebrow="Future scope · Proposed"
        title="Job management & field tooling"
        description="SOW Module 12 (sections 12.1–12.11) is PROPOSED — not part of the agreed baseline. These screens are prototypes for evaluation and estimation. Siebel stays the system of record for jobs"
        meta={<><span className="proposed-badge"><FlaskConical size={14} aria-hidden="true" />Proposed · pending business approval</span><span className="muted small">Demo mode: no live Siebel calls, no real job allocation, no points credited, no customer messages</span></>}
      />
      <nav className="ana-groups" aria-label="Module 12 sections">
        {JOB_SECTIONS.map((g) => <NavLink key={g.group} to={`${JOBS_BASE}${g.items[0].path ? `/${g.items[0].path}` : ""}`} end className={() => `ana-groups__btn ${g.group === group.group ? "is-active" : ""}`}>{g.group}</NavLink>)}
      </nav>
      <nav className="subnav" aria-label={group.group}>
        <ul>{group.items.map((t) => <li key={t.path}><NavLink to={`${JOBS_BASE}${t.path ? `/${t.path}` : ""}`} end={t.path === ""} className={() => `subnav__link ${isActive(t.path) ? "is-active" : ""}`}>{t.label}</NavLink></li>)}</ul>
      </nav>
      <div className="subnav-body proposed-scope"><Outlet /></div>
    </PageContainer>
  );
}

export function useJobsView() {
  const js = useJobsState();
  const acc = useAccessState();
  useMemberState();
  const { user, can } = useSession();
  return { js, acc, uid: user!.id, can };
}

export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso.length === 10 ? `${iso}T00:00` : iso) : "—");
export const DemoTag = () => <span className="demo-tag">Demo data</span>;
export function DecisionLink({ id, label }: { id: string; label?: string }) {
  return <Link to={`${JOBS_BASE}/decisions#${id}`} className="decision-ref mono">{label ?? id}</Link>;
}
const CLS_TONE: Record<CapabilityClass, "positive" | "info" | "warning" | "neutral" | "negative"> = { existing: "positive", partially_existing: "info", new_proposal: "neutral", awaiting_confirmation: "warning", disabled_pending_approval: "negative" };
export const ClassBadge = ({ c }: { c: CapabilityClass }) => <StatusBadge tone={CLS_TONE[c]}>{CLASS_LABEL[c]}</StatusBadge>;
const TONES: Record<string, "positive" | "info" | "warning" | "neutral" | "negative"> = { confirmed: "positive", eligible: "info", simulated_credit: "info", accepted: "info", in_progress: "info", assigned: "warning", awaiting_siebel: "warning", pending: "warning", pending_allocation: "warning", received: "neutral", rejected: "negative", timeout: "negative", integration_error: "negative", awaiting_manual_resolution: "negative", not_eligible: "neutral", open: "warning", demo_granted: "info", revoked: "neutral", inactive: "neutral", blocked: "negative", draft: "neutral" };
export const label = (s: string) => (s === "simulated_credit" ? "Simulated (not credited)" : s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
export const Status = ({ s }: { s: string | null }) => (s ? <StatusBadge tone={TONES[s] ?? "neutral"}>{label(s)}</StatusBadge> : <span className="muted small">—</span>);
export const memberLink = (id: string | null) => (id ? <Link to={`/members/member/${id}`} className="mono small">{id}</Link> : <span className="muted small">—</span>);
export const jobLink = (id: string) => <Link to={`${JOBS_BASE}/jobs/${id}`} className="mono small">{id}</Link>;
export function Tile({ label: l, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "warn" }) {
  return <div className={`ana-tile ${tone ? `ana-tile--${tone}` : ""}`}><span className="ana-tile__label">{l}</span><span className="ana-tile__value num">{value}</span>{sub && <span className="ana-tile__period">{sub}</span>}</div>;
}
