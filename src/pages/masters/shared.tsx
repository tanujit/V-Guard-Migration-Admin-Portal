import { useMemo, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { KpiCard, type KpiTone, type KpiVariant } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/primitives";
import { HubSwitcher, useHub } from "@/components/layout/HubSwitcher";
import type { MultiOption } from "@/components/form/Form";
import { APPROVAL_STATUS } from "@/config/approvalCatalogue";
import { OWNERSHIP, SYNC_STATUS, VERSION_STATUS } from "@/config/scanCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { useSession } from "@/context/SessionContext";
import { fullName, type AccessState } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { useApprovalState } from "@/features/approvals/store";
import { ALL_BRANCHES, type ConfigState, type MasterState } from "@/features/masters/engine";
import { useMasterState } from "@/features/masters/store";
import type { Ownership, RecordStatus, SyncStatus, VersionStatus } from "@/types/masters";
import { AccessDenied } from "@/pages/users/shared";

export const userName = (acc: AccessState, id: string) => (id === "SYSTEM" ? "System" : fullName(acc.users.find((u) => u.id === id)));

export interface MasterView {
  s: MasterState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  approvals: ReturnType<typeof useApprovalState>;
}

export function useMasterView(): MasterView {
  const s = useMasterState();
  const acc = useAccessState();
  const approvals = useApprovalState();
  const { user, can } = useSession();
  return { s, acc, uid: user!.id, can, approvals };
}

/** The approval request raised for a configuration version, read from the shared approval store. */
export function useApprovalLookup() {
  const approvals = useApprovalState();
  return useMemo(() => {
    const map = new Map<string, (typeof approvals.requests)[number]>();
    approvals.requests.forEach((r) => map.set(r.entityRef, r));
    return (ref: string) => map.get(ref);
  }, [approvals]);
}

export interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  perm?: string;
}

// `description`, `meta`, `eyebrow` and `badge` are accepted for compatibility; the portal shows the title only.
export function MastersLayout({ title, permission, tabs }: { title: string; description?: string; permission: string; tabs: TabDef[]; meta?: ReactNode; eyebrow?: string; badge?: string }) {
  const { can } = useSession();
  const { pathname } = useLocation();
  const hub = useHub();
  const inHub = hub.item && hub.sections.length > 1;
  const heading = inHub ? hub.item!.label : title;
  if (!can(permission)) {
    return (
      <PageContainer>
        <PageHeader title={heading} />
        <AccessDenied message={`You need ${permission.replace(":", ": ")}. Ask an Evolve Super Admin to review your access.`} />
      </PageContainer>
    );
  }
  const visible = tabs.filter((t) => !t.perm || can(t.perm));
  // The longest matching tab is active, so nested detail pages keep their section highlighted.
  const active = [...visible].sort((a, b) => b.to.length - a.to.length).find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)));
  return (
    <PageContainer>
      <PageHeader title={heading} />
      {inHub && <HubSwitcher label={heading} sections={hub.sections} active={hub.active} />}
      {visible.length > 1 && (
        <nav className="subnav" aria-label={title}>
          <ul>
            {visible.map((t) => (
              <li key={t.to}>
                <NavLink to={t.to} end={t.end} className={() => `subnav__link ${active === t ? "is-active" : ""}`}>
                  <t.icon size={16} strokeWidth={2} aria-hidden="true" />
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="subnav-body">
        <Outlet />
      </div>
    </PageContainer>
  );
}

const RECORD: Record<RecordStatus, { label: string; tone: "positive" | "neutral" | "warning" }> = { active: { label: "Active", tone: "positive" }, inactive: { label: "Inactive", tone: "neutral" }, draft: { label: "Draft", tone: "warning" } };
export const RecordBadge = ({ status }: { status: RecordStatus }) => <StatusBadge tone={RECORD[status].tone}>{RECORD[status].label}</StatusBadge>;
export const VersionBadge = ({ status }: { status: VersionStatus }) => <StatusBadge tone={VERSION_STATUS[status].tone}>{VERSION_STATUS[status].label}</StatusBadge>;
export const SyncBadge = ({ status }: { status: SyncStatus }) => <StatusBadge tone={SYNC_STATUS[status].tone}>{SYNC_STATUS[status].label}</StatusBadge>;
export const OwnershipBadge = ({ o }: { o: Ownership }) => <StatusBadge tone={OWNERSHIP[o].tone}>{OWNERSHIP[o].label}</StatusBadge>;
const CONFIG: Record<ConfigState, { label: string; tone: "positive" | "neutral" | "warning" | "info" }> = { active: { label: "Active", tone: "positive" }, inactive: { label: "Inactive", tone: "neutral" }, draft: { label: "Draft", tone: "info" }, pending: { label: "Pending approval", tone: "warning" } };
export const ConfigBadge = ({ state }: { state: ConfigState }) => <StatusBadge tone={CONFIG[state].tone}>{CONFIG[state].label}</StatusBadge>;

export function ApprovalLink({ request }: { request?: { id: string; status: keyof typeof APPROVAL_STATUS } }) {
  if (!request) return <span className="muted small">—</span>;
  return (
    <Link to={`/governance/approvals/request/${request.id}`} className="approval-link" onClick={(e) => e.stopPropagation()}>
      <StatusBadge tone={APPROVAL_STATUS[request.status].tone}>{APPROVAL_STATUS[request.status].label}</StatusBadge>
      <span className="mono small">{request.id}</span>
    </Link>
  );
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  desc: string;
  variant: KpiVariant;
  tone?: KpiTone;
  icon: LucideIcon;
  onSelect: () => void;
  reference?: string;
}
export function KpiGrid({ items, cols = 5 }: { items: Kpi[]; cols?: 4 | 5 }) {
  return (
    <div className={`kpi-grid ${cols === 5 ? "kpi-grid--5" : ""}`}>
      {items.map((k) => (
        <div key={k.id}>
          <KpiCard metric={{ id: k.id, label: k.label, value: k.value, format: "count", description: k.desc, goodDirection: "neutral", reference: k.reference ?? "Select to open the filtered list", drill: { module: "masters", title: k.label } }} onSelect={k.onSelect} variant={k.variant} tone={k.tone} icon={k.icon} compact />
        </div>
      ))}
    </div>
  );
}

/** Branch options grouped by state for the searchable multi-select, limited to an allowed set. */
export function branchOptions(allowed?: (code: string) => boolean, inactive?: Set<string>): MultiOption[] {
  return ALL_BRANCHES.filter((b) => !allowed || allowed(b.code)).map((b) => ({ value: b.code, label: `${b.name} · ${b.districtName}${inactive?.has(b.code) ? " (inactive)" : ""}`, group: b.stateName, disabled: inactive?.has(b.code) }));
}
export const stateOptions = () => GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }));

export function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="field__error" role="alert">{msg}</p> : null;
}

export function ValidationList({ v }: { v: { errors: string[]; warnings: string[]; info: string[] } }) {
  if (!v.errors.length && !v.warnings.length && !v.info.length) return <p className="valid-ok small">No validation issues</p>;
  return (
    <div className="vlist">
      {v.errors.length > 0 && (
        <div className="vlist__block vlist__block--error">
          <p className="vlist__title">Errors · must be resolved ({v.errors.length})</p>
          <ul>{v.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {v.warnings.length > 0 && (
        <div className="vlist__block vlist__block--warn">
          <p className="vlist__title">Warnings · review and acknowledge ({v.warnings.length})</p>
          <ul>{v.warnings.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {v.info.length > 0 && (
        <div className="vlist__block vlist__block--info">
          <p className="vlist__title">Information ({v.info.length})</p>
          <ul>{v.info.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
