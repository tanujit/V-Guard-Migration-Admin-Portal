import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, Gamepad2, Gift, Landmark, LayoutDashboard, ListChecks, Medal, Scale, Share2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { DECISION_STATUS, SCHEME_STATUS } from "@/config/schemeCatalogue";
import { useSession } from "@/context/SessionContext";
import { hasPermission, type AccessState } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { useApprovalState, demoNow } from "@/features/approvals/store";
import type { MasterState } from "@/features/masters/engine";
import { useMasterState } from "@/features/masters/store";
import type { MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { displayVersion, type Blocker } from "@/features/schemes/engine";
import { useSchemeState } from "@/features/schemes/store";
import type { DecisionStatus, Scheme, SchemeState, SchemeStatus } from "@/types/schemes";
import { MastersLayout, userName } from "@/pages/masters/shared";
import { Notice } from "@/pages/approvals/shared";

export { userName };
export const BASE = "/schemes";

export function SchemesLayout() {
  return (
    <MastersLayout
      title="Schemes & incentives"
      description="Scheme Builder, settlement, tiers, referrals, campaigns and gamification on one common scheme engine for EP, ST, CS, Retailer and DD"
      permission="schemes:view"
      eyebrow="Masters & configuration"
      badge="Development scheme data"
      meta="Development / demo data. Rewards are calculated by a mock engine in this browser tab; the V-Guard scheme engine, wallet/ledger and member app are not connected"
      tabs={[
        { to: BASE, end: true, label: "Overview", icon: LayoutDashboard },
        { to: `${BASE}/list`, label: "Schemes", icon: ListChecks },
        { to: `${BASE}/calendar`, label: "Calendar", icon: CalendarDays },
        { to: `${BASE}/settlement`, label: "Settlement", icon: Landmark, perm: "scheme-settlement:view" },
        { to: `${BASE}/tiers`, label: "Tiers", icon: Medal, perm: "tiers:view" },
        { to: `${BASE}/referrals`, label: "Referrals", icon: Share2, perm: "referrals:view" },
        { to: `${BASE}/campaigns`, label: "Campaigns & contests", icon: Gift, perm: "campaigns:view" },
        { to: `${BASE}/gamification`, label: "Gamification & bonuses", icon: Gamepad2, perm: "gamification:view" },
        { to: `${BASE}/governance`, label: "Governance", icon: Scale },
      ]}
    />
  );
}

export interface SchemeView {
  s: SchemeState;
  ms: MasterState;
  mem: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  today: string;
  /** Schemes whose programmes are all inside the viewer's Scheme View scope. */
  visible: Scheme[];
  /** Permission for a module action covering every programme listed. */
  canOn: (module: string, action: Parameters<typeof hasPermission>[3], programmes: string[]) => boolean;
  financial: boolean;
  approvals: ReturnType<typeof useApprovalState>;
}

export function useSchemeView(): SchemeView {
  const s = useSchemeState();
  const ms = useMasterState();
  const mem = useMemberState();
  const acc = useAccessState();
  const approvals = useApprovalState();
  const { user, can } = useSession();
  const uid = user!.id;
  const canOn = (module: string, action: Parameters<typeof hasPermission>[3], programmes: string[]) => (programmes.length ? programmes.every((p) => hasPermission(acc, uid, module, action, { programme: p }).allowed) : hasPermission(acc, uid, module, action).allowed);
  const visible = useMemo(() => s.schemes.filter((sc) => displayVersion(sc).config.basic.programmes.some((p) => hasPermission(acc, uid, "schemes", "view", { programme: p }).allowed)), [s.schemes, acc, uid]);
  return { s, ms, mem, acc, uid, can, today: demoNow().slice(0, 10), visible, canOn, financial: can("schemes:view_financial"), approvals };
}

export const SchemeStatusBadge = ({ status }: { status: SchemeStatus }) => <StatusBadge tone={SCHEME_STATUS[status].tone}>{SCHEME_STATUS[status].label}</StatusBadge>;
export const DecisionBadge = ({ status }: { status: DecisionStatus }) => <StatusBadge tone={DECISION_STATUS[status].tone}>{DECISION_STATUS[status].label}</StatusBadge>;

/** Generic status pill for incentive records. */
const RECORD_TONE: Record<string, "positive" | "warning" | "neutral" | "info" | "negative" | "accent"> = { active: "positive", draft: "neutral", pending_approval: "warning", scheduled: "info", completed: "info", inactive: "neutral", returned: "warning", rejected: "negative", reserved_future: "neutral", executed: "positive", approved: "accent", partially_approved: "warning", execution_failed: "negative", withdrawn: "neutral", validated: "info", credited: "positive", accrued: "accent", rejected_duplicate: "negative", rejected_budget: "negative", excluded: "warning", reversal_pending: "warning", reversed: "neutral", failed: "negative", superseded: "neutral", submitted: "warning", activation_failed: "negative", running: "info", not_requested: "neutral", pending: "warning", winner: "positive", shortlisted: "info", under_review: "info", submitted_entry: "neutral", not_selected: "neutral", recorded_not_published: "info", blocked_rule_pending: "warning", blocked: "warning", flag: "warning", pass: "positive" };
export const RecordStatus = ({ status }: { status: string }) => <StatusBadge tone={RECORD_TONE[status] ?? "neutral"}>{status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</StatusBadge>;

export function DecisionRef({ id }: { id: string }) {
  return (
    <Link to={`${BASE}/governance?tab=decisions#${id}`} className="decision-ref mono" title="Open the decision register">
      {id}
    </Link>
  );
}

export function BlockerList({ blockers, title = "Business confirmation required" }: { blockers: Blocker[]; title?: string }) {
  if (!blockers.length) return null;
  return (
    <div className="vlist__block vlist__block--bcr">
      <p className="vlist__title">
        <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> {title} ({blockers.length}) · blocks submission and activation
      </p>
      <ul>
        {blockers.map((b) => (
          <li key={b.message}>
            <DecisionRef id={b.ref} /> {b.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const DevValue = ({ children = "Demo value" }: { children?: ReactNode }) => <span className="dev-value">{children}</span>;

export function NoFinancial() {
  return <Notice tone="info">Budget, exposure and liability figures need Scheme builder: View financial exposure.</Notice>;
}

export const pts = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-IN")}`);
export const schemeLink = (id: string, label?: string) => (
  <Link to={`${BASE}/scheme/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
    {label ?? id}
  </Link>
);

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv kv--tight">
      {rows.map(([k, v], i) => (
        <div className="kv__row" key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const userLabel = (acc: AccessState, id: string | null) => (id ? userName(acc, id) : "—");
