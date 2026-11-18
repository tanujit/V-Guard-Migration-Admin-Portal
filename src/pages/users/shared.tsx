import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AlertTriangle, ClipboardList, Eye, History, KeyRound, Lock, Network, ShieldCheck, UserCheck, Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { DemoBadge, StatusBadge } from "@/components/ui/primitives";
import { TextArea, TextField } from "@/components/form/Form";
import { useSession } from "@/context/SessionContext";
import { describeScope, TODAY, type PolicyResult } from "@/features/access/engine";
import { ROLE_CATEGORY_LABEL } from "@/config/rbacCatalogue";
import type { AccessScope, AccountStatus, AssignmentStatus, NominationStatus, RoleCategory } from "@/types/rbac";
import type { StatusTone } from "@/types/domain";

/* ---------------- Status vocabularies ---------------- */

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; tone: StatusTone }> = {
  invited: { label: "Invited", tone: "info" },
  pending_activation: { label: "Pending activation", tone: "warning" },
  active: { label: "Active", tone: "positive" },
  suspended: { label: "Suspended", tone: "negative" },
  locked: { label: "Locked", tone: "negative" },
  deactivated: { label: "Deactivated", tone: "neutral" },
};

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "info" },
  active: { label: "Active", tone: "positive" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Revoked", tone: "negative" },
  suspended: { label: "Suspended", tone: "warning" },
};

export const NOMINATION_STATUS: Record<NominationStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under Evolve review", tone: "warning" },
  approved: { label: "Approved for provisioning", tone: "accent" },
  rejected: { label: "Rejected", tone: "negative" },
  returned: { label: "Returned for clarification", tone: "warning" },
  provisioned: { label: "Provisioned", tone: "positive" },
  revoked: { label: "Revoked / withdrawn", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
};

export const AccountStatusBadge = ({ status }: { status: AccountStatus }) => <StatusBadge tone={ACCOUNT_STATUS[status].tone}>{ACCOUNT_STATUS[status].label}</StatusBadge>;
export const AssignmentStatusBadge = ({ status, validTo }: { status: AssignmentStatus; validTo?: string | null }) =>
  status === "active" && validTo && validTo < TODAY ? <StatusBadge tone="warning">Past end date</StatusBadge> : <StatusBadge tone={ASSIGNMENT_STATUS[status].tone}>{ASSIGNMENT_STATUS[status].label}</StatusBadge>;
export const NominationStatusBadge = ({ status }: { status: NominationStatus }) => <StatusBadge tone={NOMINATION_STATUS[status].tone}>{NOMINATION_STATUS[status].label}</StatusBadge>;

export function RoleCategoryTag({ category }: { category: RoleCategory }) {
  return <span className={`cat-tag cat-tag--${category}`}>{ROLE_CATEGORY_LABEL[category]}</span>;
}

/** Masks all but the last four digits unless the viewer holds "View sensitive" on users. */
export function maskMobile(mobile: string, canSee: boolean) {
  if (canSee) return mobile;
  const digits = mobile.replace(/\D/g, "");
  return digits.length >= 4 ? `•••••• ${digits.slice(-4)}` : "••••";
}

export function ScopeText({ scope, compact }: { scope: AccessScope; compact?: boolean }) {
  const d = describeScope(scope);
  return (
    <span className={`scope-text ${compact ? "scope-text--compact" : ""}`} title={`${d.programmes} · ${d.geography}`}>
      <span>{d.programmes}</span>
      <span className="muted">{compact ? (scope.geography.mode === "all" ? "All geography" : d.geography.split(" (")[0]) : d.geography}</span>
    </span>
  );
}

/** Errors (blocking) and warnings (non-blocking) from a policy check. */
export function PolicyMessages({ result, title, warnTitle = "Check before continuing" }: { result: Pick<PolicyResult, "errors" | "warnings"> | null; title?: string; warnTitle?: string }) {
  if (!result || (!result.errors.length && !result.warnings.length)) return null;
  return (
    <div className="policy" role={result.errors.length ? "alert" : "status"}>
      {result.errors.length > 0 && (
        <div className="policy__block policy__block--error">
          <p className="policy__title">
            <Lock size={14} strokeWidth={2} aria-hidden="true" />
            {title ?? "This change is blocked"}
          </p>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="policy__block policy__block--warn">
          <p className="policy__title">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
            {warnTitle}
          </p>
          <ul>
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Confirmation that requires a reason (and optionally an effective date) before a sensitive change.
 * `onConfirm` returns a PolicyResult; blocked results stay in the dialog instead of being discarded.
 */
export function ReasonDialog({ open, title, body, confirmLabel, tone = "default", withDate, onConfirm, onClose, children }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; tone?: "default" | "danger"; withDate?: boolean; onConfirm: (reason: string, date: string) => PolicyResult; onClose: () => void; children?: ReactNode }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(TODAY);
  const [res, setRes] = useState<PolicyResult | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setDate(TODAY);
      setRes(null);
    }
  }, [open]);
  return (
    <ConfirmDialog
      open={open}
      title={title}
      tone={tone}
      confirmLabel={confirmLabel}
      onCancel={onClose}
      onConfirm={() => {
        if (!reason.trim()) {
          setRes({ ok: false, errors: ["A reason is required and is recorded in the audit history"], warnings: [] });
          return;
        }
        const r = onConfirm(reason, date);
        if (r.ok) onClose();
        else setRes(r);
      }}
      body={
        <div className="reason-dialog">
          <div>{body}</div>
          {children}
          <TextArea label="Reason" required value={reason} onChange={setReason} rows={3} hint="Recorded in the immutable access history" />
          {withDate && <TextField label="Effective date" type="date" value={date} onChange={setDate} />}
          <PolicyMessages result={res} />
        </div>
      }
    />
  );
}

export function AccessDenied({ message }: { message: string }) {
  return (
    <div className="panel panel--pad">
      <div className="placeholder">
        <Lock size={20} strokeWidth={1.5} aria-hidden="true" />
        <h2 className="placeholder__title">You do not have access to this area</h2>
        <p className="placeholder__text">{message}</p>
      </div>
    </div>
  );
}

/* ---------------- Section layout with secondary navigation ---------------- */

const SUBNAV = [
  { to: "/governance/users", end: true, label: "User directory", icon: Users, perm: "users:view" },
  { to: "/governance/users/organisations", label: "Organisations", icon: Network, perm: "users:view" },
  { to: "/governance/users/roles", label: "Roles", icon: ShieldCheck, perm: "users:view" },
  { to: "/governance/users/permissions", label: "Permission matrix", icon: KeyRound, perm: "users:view" },
  { to: "/governance/users/nominations", label: "Maker nominations", icon: ClipboardList, perm: "users:view" },
  { to: "/governance/users/checkers", label: "Checker access", icon: UserCheck, perm: "users:view" },
  { to: "/governance/users/effective", label: "Effective access", icon: Eye, perm: "users:view" },
  { to: "/governance/users/audit", label: "Access history", icon: History, perm: "users:view" },
];

export function UsersLayout() {
  const { can } = useSession();
  const { pathname } = useLocation();
  // The directory tab stays highlighted while creating or viewing a user.
  const inDirectory = /^\/governance\/users(\/(new|user\/[^/]+))?\/?$/.test(pathname);
  if (!can("users:view")) {
    return (
      <PageContainer>
        <PageHeader title="User & role management" />
        <AccessDenied message="You need User & role management: View. Ask an Evolve Super Admin to review your access." />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader
        variant="hero"
        eyebrow="Governance"
        title="User & role management"
        description="Users, organisations, roles, permissions, programme and geography scope, Maker and Checker access"
        meta={
          <>
            <DemoBadge label="Mock identity data" />
            <span className="muted small">Changes are stored in this browser tab only. No emails are sent and no identity provider is connected</span>
          </>
        }
      />
      <nav className="subnav" aria-label="User & role management">
        <ul>
          {SUBNAV.filter((i) => can(i.perm)).map((i) => (
            <li key={i.to}>
              <NavLink to={i.to} end={i.end} className={({ isActive }) => `subnav__link ${isActive || (i.end && inDirectory) ? "is-active" : ""}`}>
                <i.icon size={16} strokeWidth={2} aria-hidden="true" />
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="subnav-body">
        <Outlet />
      </div>
    </PageContainer>
  );
}

export function SectionTitle({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sub-head">
      <div>
        <h2 className="sub-head__title">{title}</h2>
        {description && <p className="sub-head__desc">{description}</p>}
      </div>
      {actions && <div className="sub-head__actions">{actions}</div>}
    </div>
  );
}
