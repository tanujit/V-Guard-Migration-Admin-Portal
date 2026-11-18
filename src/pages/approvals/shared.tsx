import { useMemo, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, CheckCircle2, ClipboardList, Inbox, ListChecks, PlayCircle, Send, Settings2, Siren, Undo2, XCircle } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { DemoBadge, StatusBadge } from "@/components/ui/primitives";
import { APPROVAL_STATUS, DECIDABLE, EXECUTION_STATUS, PRIORITY, requestTypeById } from "@/config/approvalCatalogue";
import { moduleById } from "@/config/rbacCatalogue";
import { findBranch, findDistrict, findState } from "@/config/geography";
import { useSession } from "@/context/SessionContext";
import { fullName, type AccessState } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { canDecide, canViewRequest, isOverdue, isWorkflowAdmin, type ApprovalState } from "@/features/approvals/engine";
import { demoNow, useApprovalState } from "@/features/approvals/store";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import type { ApprovalRequest, ApprovalStatus, ExecutionStatus, FieldChange, Priority, RequestLocation } from "@/types/approval";
import { AccessDenied } from "@/pages/users/shared";

export const BASE = "/governance/approvals";

export const ApprovalStatusBadge = ({ status }: { status: ApprovalStatus }) => <StatusBadge tone={APPROVAL_STATUS[status].tone}>{APPROVAL_STATUS[status].label}</StatusBadge>;
export const ExecutionBadge = ({ status }: { status: ExecutionStatus }) => (status === "not_applicable" ? <span className="muted small">—</span> : <StatusBadge tone={EXECUTION_STATUS[status].tone}>{EXECUTION_STATUS[status].label}</StatusBadge>);
export const PriorityTag = ({ priority }: { priority: Priority }) => <span className={`prio prio--${priority}`}>{PRIORITY[priority].label}</span>;

export const moduleLabel = (m: string) => moduleById.get(m)?.label ?? m;
export const typeLabel = (t: string) => requestTypeById.get(t)?.label ?? t;
export const userLabel = (acc: AccessState, id: string | null | undefined) => (!id ? "—" : id === "SYSTEM" ? "System" : fullName(acc.users.find((u) => u.id === id)));
export const orgLabel = (acc: AccessState, id: string | null | undefined) => acc.organisations.find((o) => o.id === id)?.name ?? "—";

export function locationLabel(l: RequestLocation | null) {
  if (!l) return "Not location-bound";
  if (l.branch) return `${findBranch(l.branch)?.branch.name ?? l.branch} branch`;
  if (l.district) return findDistrict(l.district)?.district.name ?? l.district;
  if (l.state) return findState(l.state)?.name ?? l.state;
  return "Not location-bound";
}

export function formatField(f: Pick<FieldChange, "kind">, v: string | number | null) {
  if (v === null || v === "") return "—";
  if (typeof v === "number") {
    if (f.kind === "currency") return formatInr(v);
    if (f.kind === "points") return `${v < 0 ? "−" : ""}${formatCount(Math.abs(v))} pts`;
    if (f.kind === "percent") return `${v}%`;
    return String(v);
  }
  if (f.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateTime(v);
  return v;
}

/** Queues the Approval Centre lists, each a filter over the requests the viewer may see. */
export type Queue = "inbox" | "all" | "mine" | "returned" | "approved" | "rejected" | "execution" | "overdue";

export interface ApprovalView {
  s: ApprovalState;
  acc: AccessState;
  uid: string;
  now: string;
  admin: boolean;
  visible: ApprovalRequest[];
  inbox: ApprovalRequest[];
  queue: (q: Queue) => ApprovalRequest[];
}

/** Visibility and queues for the signed-in user, evaluated through the engine. */
export function useApprovalView(): ApprovalView {
  const s = useApprovalState();
  const acc = useAccessState();
  const { user } = useSession();
  const uid = user!.id;
  return useMemo(() => {
    const now = demoNow();
    const admin = isWorkflowAdmin(acc, uid);
    const visible = s.requests.filter((r) => canViewRequest(s, acc, uid, r).ok);
    const inbox = visible.filter((r) => DECIDABLE.includes(r.status) && canDecide(s, acc, uid, r, "approve", now).ok);
    const mine = (r: ApprovalRequest) => r.makerId === uid;
    const queue = (q: Queue) => {
      switch (q) {
        case "inbox":
          return inbox;
        case "mine":
          return visible.filter(mine);
        case "returned":
          return visible.filter((r) => r.status === "returned");
        case "approved":
          return visible.filter((r) => r.status === "approved");
        case "rejected":
          return visible.filter((r) => r.status === "rejected");
        case "execution":
          return visible.filter((r) => r.status === "approved" && r.execution.status !== "executed");
        case "overdue":
          return visible.filter((r) => isOverdue(r, now) || r.status === "pending_assignment");
        default:
          return visible.filter((r) => r.status !== "draft" || mine(r));
      }
    };
    return { s, acc, uid, now, admin, visible, inbox, queue };
  }, [s, acc, uid]);
}

const SUBNAV: { to: string; end?: boolean; label: string; icon: typeof Inbox; queue?: Queue; admin?: boolean }[] = [
  { to: BASE, end: true, label: "My approval inbox", icon: Inbox, queue: "inbox" },
  { to: `${BASE}/all`, label: "All requests", icon: ListChecks, queue: "all" },
  { to: `${BASE}/mine`, label: "Requests I submitted", icon: Send, queue: "mine" },
  { to: `${BASE}/returned`, label: "Returned", icon: Undo2, queue: "returned" },
  { to: `${BASE}/approved`, label: "Approved", icon: CheckCircle2, queue: "approved" },
  { to: `${BASE}/rejected`, label: "Rejected", icon: XCircle, queue: "rejected" },
  { to: `${BASE}/execution`, label: "Awaiting execution", icon: PlayCircle, queue: "execution" },
  { to: `${BASE}/overdue`, label: "Escalated & overdue", icon: Siren, queue: "overdue" },
  { to: `${BASE}/workflows`, label: "Workflow configuration", icon: Settings2 },
  { to: `${BASE}/analytics`, label: "Analytics", icon: BarChart3 },
];

export function ApprovalsLayout() {
  const { can } = useSession();
  const view = useApprovalView();
  const { pathname } = useLocation();
  if (!can("approvals:view")) {
    return (
      <PageContainer>
        <PageHeader title="Approval centre" />
        <AccessDenied message="You need Approval centre: View, which comes with a Maker or Checker profile or a governance role. Ask an Evolve Super Admin to review your access." />
      </PageContainer>
    );
  }
  const inRequest = pathname.startsWith(`${BASE}/request/`);
  return (
    <PageContainer>
      <PageHeader
        variant="hero"
        eyebrow="Governance"
        title="Approval centre"
        description="Maker-Checker requests from every module: review, decide, track execution and configure routing"
        meta={
          <>
            <DemoBadge label="Mock approval data" />
            <span className="muted small">Requests and decisions are development data stored in this browser tab. No V-Guard system is changed and no email is sent</span>
          </>
        }
      />
      <nav className="subnav" aria-label="Approval centre">
        <ul>
          {SUBNAV.map((i) => {
            const n = i.queue && ["inbox", "returned", "execution", "overdue"].includes(i.queue) ? view.queue(i.queue).length : 0;
            return (
              <li key={i.to}>
                <NavLink to={i.to} end={i.end} className={({ isActive }) => `subnav__link ${isActive && !inRequest ? "is-active" : ""}`}>
                  <i.icon size={16} strokeWidth={2} aria-hidden="true" />
                  {i.label}
                  {n > 0 && <span className="subnav__count num">{n}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="subnav-body">
        <Outlet />
      </div>
    </PageContainer>
  );
}

export function Notice({ tone = "info", icon, children, action }: { tone?: "info" | "warn" | "danger" | "ok"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`apr-notice apr-notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon}
      <div className="apr-notice__body">{children}</div>
      {action}
    </div>
  );
}

export const QUEUE_META: Record<Queue, { title: string; description: string; empty: string; icon: typeof ClipboardList }> = {
  inbox: { title: "My approval inbox", description: "Requests waiting for your decision at their current stage. Only requests you are eligible to decide appear here", empty: "Nothing is waiting for your decision", icon: Inbox },
  all: { title: "All requests", description: "Every request you may see, within your modules, programmes and geography", empty: "No requests match these filters", icon: ListChecks },
  mine: { title: "Requests I submitted", description: "Your drafts and submissions, with their approval and execution status", empty: "You have not raised any requests", icon: Send },
  returned: { title: "Returned for correction", description: "Requests sent back to the Maker. The Maker edits a new version and resubmits", empty: "No returned requests", icon: Undo2 },
  approved: { title: "Approved", description: "Requests approved at every required stage. Execution status is tracked separately", empty: "No approved requests", icon: CheckCircle2 },
  rejected: { title: "Rejected", description: "Rejected requests are final and never executed", empty: "No rejected requests", icon: XCircle },
  execution: { title: "Awaiting execution", description: "Approved requests the originating module has not yet applied, including failed executions", empty: "Every approved request has been executed", icon: PlayCircle },
  overdue: { title: "Escalated & overdue", description: "Requests past their stage SLA, escalated, or waiting in Pending assignment because no eligible approver or workflow exists", empty: "Nothing is overdue or stuck", icon: Siren },
};
