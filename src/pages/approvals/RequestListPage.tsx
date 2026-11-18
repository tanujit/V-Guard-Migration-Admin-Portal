import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, FilePlus2, Hourglass, Inbox, ListChecks, PlayCircle, RotateCcw, Siren, Timer, Undo2, UserX, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { KpiCard, type KpiTone, type KpiVariant } from "@/components/ui/KpiCard";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, SelectField } from "@/components/ui/primitives";
import { APPROVAL_STATUS, EXECUTION_STATUS, PENDING, PRIORITY, REQUEST_TYPES } from "@/config/approvalCatalogue";
import { PROGRAMMES } from "@/config/programmes";
import { useSession } from "@/context/SessionContext";
import { ageHours, canMake, currentRun, formatAge, hoursBetween, isOverdue, stageAgeHours } from "@/features/approvals/engine";
import { formatDateTime } from "@/lib/format";
import type { ApprovalRequest } from "@/types/approval";
import type { KpiMetric } from "@/types/dashboard";
import { SectionTitle } from "@/pages/users/shared";
import { ApprovalStatusBadge, BASE, ExecutionBadge, moduleLabel, Notice, orgLabel, PriorityTag, QUEUE_META, typeLabel, useApprovalView, userLabel, type ApprovalView, type Queue } from "./shared";

const AGE = [
  { value: "any", label: "Any age" },
  { value: "24", label: "Older than 24h" },
  { value: "72", label: "Older than 3 days" },
  { value: "168", label: "Older than 7 days" },
];

const PENDING_LIKE = ["pending_approval", "under_review", "partially_approved", "escalated"];

export function RequestListPage({ queue }: { queue: Queue }) {
  const view = useApprovalView();
  const { acc, now, uid } = view;
  const { can } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("all");
  const [type, setType] = useState("all");
  const [exec, setExec] = useState("all");
  const [prio, setPrio] = useState("all");
  const [prog, setProg] = useState("all");
  const [org, setOrg] = useState("all");
  const [maker, setMaker] = useState("all");
  const [stage, setStage] = useState("all");
  const [age, setAge] = useState("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const status = params.get("status") ?? "all";
  const period = params.get("period");
  const setStatus = (v: string) => setParams(v === "all" ? {} : { status: v });
  const meta = QUEUE_META[queue];
  const rows = view.queue(queue);
  // Scope is checked per record when the request is raised; here any Maker profile on a module is enough.
  const canRaise = REQUEST_TYPES.some((t) => canMake(acc, uid, t.module, { programme: null, location: null }).ok);

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    if (t && ![r.id, r.title, r.entityRef, typeLabel(r.requestType)].join(" ").toLowerCase().includes(t)) return false;
    if (mod !== "all" && r.module !== mod) return false;
    if (type !== "all" && r.requestType !== type) return false;
    if (status === "pending" ? !PENDING.includes(r.status) : status !== "all" && r.status !== status) return false;
    if (exec !== "all" && r.execution.status !== exec) return false;
    if (prio !== "all" && r.priority !== prio) return false;
    if (prog !== "all" && r.programme !== prog) return false;
    if (org !== "all" && r.makerOrgId !== org) return false;
    if (maker !== "all" && r.makerId !== maker) return false;
    if (stage !== "all" && (currentRun(r)?.name !== stage || !PENDING.includes(r.status))) return false;
    if (age !== "any" && ageHours(r, now) < Number(age)) return false;
    const day = (r.submittedAt ?? r.createdAt).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (period === "month" && (!r.completedAt || r.completedAt.slice(0, 7) !== now.slice(0, 7))) return false;
    return true;
  });
  const modules = Array.from(new Set(rows.map((r) => r.module)));
  const makers = Array.from(new Set(rows.map((r) => r.makerId)));
  const stages = Array.from(new Set(rows.filter((r) => PENDING.includes(r.status)).map((r) => currentRun(r)?.name).filter(Boolean) as string[]));
  const anyFilter = q || mod !== "all" || type !== "all" || status !== "all" || exec !== "all" || prio !== "all" || prog !== "all" || org !== "all" || maker !== "all" || stage !== "all" || age !== "any" || from || to || period;
  const clear = () => {
    setQ("");
    setMod("all");
    setType("all");
    setExec("all");
    setPrio("all");
    setProg("all");
    setOrg("all");
    setMaker("all");
    setStage("all");
    setAge("any");
    setFrom("");
    setTo("");
    setParams({});
  };

  return (
    <>
      <SectionTitle
        title={meta.title}
        description={meta.description}
        actions={
          canRaise && (
            <Link to={`${BASE}/new`} className="btn btn--primary">
              <FilePlus2 size={16} strokeWidth={2} aria-hidden="true" />
              New request
            </Link>
          )
        }
      />
      {queue === "inbox" && <OverviewKpis view={view} />}
      {queue === "inbox" && view.admin && view.visible.some((r) => r.status === "pending_assignment") && (
        <Notice tone="warn" icon={<UserX size={16} strokeWidth={2} aria-hidden="true" />} action={<Link className="btn btn--dark btn--sm" to={`${BASE}/overdue`}>Review exceptions</Link>}>
          <strong>{view.visible.filter((r) => r.status === "pending_assignment").length} request(s) are waiting in Pending assignment.</strong> No eligible approver or approved workflow exists for them. Nothing was approved; fix the workflow or Checker access, then re-run routing.
        </Notice>
      )}

      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={q} onChange={setQ} placeholder="Request ID, description or record" label="Search requests" />
          <SelectField label="Module" value={mod} onChange={setMod} options={[{ value: "all", label: "All modules" }, ...modules.map((m) => ({ value: m, label: moduleLabel(m) }))]} active={mod !== "all"} />
          <SelectField label="Request type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...REQUEST_TYPES.filter((t) => mod === "all" || t.module === mod).map((t) => ({ value: t.id, label: t.label }))]} active={type !== "all"} />
          <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All programmes" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} active={prog !== "all"} />
          <SelectField label="Maker organisation" value={org} onChange={setOrg} options={[{ value: "all", label: "Any organisation" }, ...acc.organisations.map((o) => ({ value: o.id, label: o.name }))]} active={org !== "all"} />
          <SelectField label="Maker" value={maker} onChange={setMaker} options={[{ value: "all", label: "Anyone" }, ...makers.map((m) => ({ value: m, label: userLabel(acc, m) }))]} active={maker !== "all"} />
          <SelectField label="Current stage" value={stage} onChange={setStage} options={[{ value: "all", label: "Any stage" }, ...stages.map((s) => ({ value: s, label: s }))]} active={stage !== "all"} />
          <SelectField label="Priority" value={prio} onChange={setPrio} options={[{ value: "all", label: "Any priority" }, ...Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label }))]} active={prio !== "all"} />
          <SelectField label="Ageing" value={age} onChange={setAge} options={AGE} active={age !== "any"} />
          <SelectField label="Approval status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "pending", label: "Any pending" }, ...Object.entries(APPROVAL_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} active={status !== "all"} />
          <SelectField label="Execution" value={exec} onChange={setExec} options={[{ value: "all", label: "Any" }, ...Object.entries(EXECUTION_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} active={exec !== "all"} />
          <label className="field">
            <span className="field__label">Requested from</span>
            <input type="date" className={`select ${from ? "is-set" : ""}`} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Requested to</span>
            <input type="date" className={`select ${to ? "is-set" : ""}`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="filters-bar__end">
            <button type="button" className="btn btn--ghost btn--sm" onClick={clear} disabled={!anyFilter}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              Clear all
            </button>
          </div>
        </div>
        <p className="filters-bar__count" aria-live="polite">
          {filtered.length} of {rows.length} requests{period === "month" ? " · completed this month" : ""}
        </p>
        {rows.length === 0 ? (
          <EmptyState title={meta.empty}>{queue === "inbox" ? "Requests appear here when you hold an active Checker profile with Approve on the module, within the request's programme and location, and you did not submit them." : null}</EmptyState>
        ) : (
          <RequestTable rows={filtered} view={view} variant={queue === "mine" ? "maker" : "checker"} exportName={can("approvals:view") ? `approvals-${queue}` : undefined} onOpen={(r) => navigate(`${BASE}/request/${r.id}`)} />
        )}
      </Panel>

      {queue === "inbox" && <RecentActivity view={view} />}
    </>
  );
}

/** Request table. The Maker variant shows who holds the request; the Checker variant shows who raised it. */
export function RequestTable({ rows, view, exportName, onOpen, pageSize = 10, variant = "checker" }: { rows: ApprovalRequest[]; view: ApprovalView; exportName?: string; onOpen: (r: ApprovalRequest) => void; pageSize?: number; variant?: "checker" | "maker" }) {
  const { acc, now } = view;
  const approvers = (r: ApprovalRequest) => (PENDING_LIKE.includes(r.status) ? (currentRun(r)?.assignedTo ?? []).map((u) => userLabel(acc, u)).join(", ") : "");
  const columns: Column<ApprovalRequest>[] = [
    { key: "id", header: "Request ID", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
    { key: "module", header: "Module", value: (r) => moduleLabel(r.module), render: (r) => <span className="small">{moduleLabel(r.module)}</span> },
    { key: "type", header: "Request type", value: (r) => typeLabel(r.requestType), render: (r) => <span className="small">{typeLabel(r.requestType)}</span> },
    { key: "title", header: "Description", value: (r) => r.title, render: (r) => <span className="cell-wrap">{r.title}</span> },
    { key: "prog", header: "Programme", value: (r) => r.programme ?? "", render: (r) => r.programme ?? <span className="muted">All</span> },
    ...(variant === "checker"
      ? [
          { key: "maker", header: "Maker", value: (r: ApprovalRequest) => userLabel(acc, r.makerId) },
          { key: "org", header: "Maker organisation", value: (r: ApprovalRequest) => orgLabel(acc, r.makerOrgId), render: (r: ApprovalRequest) => <span className="small">{orgLabel(acc, r.makerOrgId)}</span> },
        ]
      : []),
    { key: "submitted", header: "Submitted on", value: (r) => r.submittedAt ?? r.createdAt, render: (r) => <span className="small num">{r.submittedAt ? formatDateTime(r.submittedAt) : "Draft"}</span> },
    {
      key: "stage",
      header: "Current stage",
      value: (r) => currentRun(r)?.name ?? "",
      render: (r) => {
        const run = currentRun(r);
        if (!run || !PENDING.includes(r.status)) return <span className="muted small">—</span>;
        return (
          <span className="cell-2">
            <span className="cell-2__main small">{run.name}</span>
            <span className="cell-2__sub">Stage {r.currentStage + 1} of {r.stages.length}</span>
          </span>
        );
      },
    },
    ...(variant === "maker" ? [{ key: "approver", header: "Assigned approver", value: (r: ApprovalRequest) => approvers(r), render: (r: ApprovalRequest) => (approvers(r) ? <span className="small">{approvers(r)}</span> : <span className="muted small">—</span>) }] : []),
    {
      key: "age",
      header: "Ageing",
      value: (r) => Math.round(ageHours(r, now)),
      align: "right",
      render: (r) => {
        const over = isOverdue(r, now);
        const run = currentRun(r);
        const live = PENDING.includes(r.status);
        const due = run?.dueAt && live ? hoursBetween(now, run.dueAt) : null;
        return (
          <span className={`age ${over ? "age--over" : ""}`} title={run?.dueAt ? `Stage due ${formatDateTime(run.dueAt)}` : undefined}>
            <span className="num">{r.submittedAt ? formatAge(ageHours(r, now)) : "—"}</span>
            {live && run?.activatedAt && <span className="age__stage">{formatAge(stageAgeHours(r, now))} at stage</span>}
            {over ? <span className="age__sub">Overdue</span> : due !== null && due < 8 ? <span className="age__sub age__sub--soon">Due in {formatAge(due)}</span> : null}
          </span>
        );
      },
    },
    { key: "prio", header: "Priority", value: (r) => PRIORITY[r.priority].rank, render: (r) => <PriorityTag priority={r.priority} /> },
    { key: "status", header: "Status", value: (r) => APPROVAL_STATUS[r.status].label, render: (r) => <ApprovalStatusBadge status={r.status} /> },
    { key: "exec", header: "Execution", value: (r) => EXECUTION_STATUS[r.execution.status].label, render: (r) => <ExecutionBadge status={r.execution.status} /> },
    ...(variant === "maker" ? [{ key: "updated", header: "Last updated", value: (r: ApprovalRequest) => r.updatedAt, render: (r: ApprovalRequest) => <span className="small num">{formatDateTime(r.updatedAt)}</span> }] : []),
    {
      key: "actions",
      header: "Actions",
      value: () => null,
      sortable: false,
      noSearch: true,
      render: (r) => (
        <Link to={`${BASE}/request/${r.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>
          {view.inbox.includes(r) ? "Review" : r.makerId === view.uid && ["draft", "returned"].includes(r.status) ? "Edit" : "View"}
        </Link>
      ),
    },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Approval requests" searchable={false} pageSize={pageSize} exportName={exportName} onRowClick={onOpen} rowActionLabel={(r) => `Open ${r.id}`} initialSort={{ key: "submitted", dir: "desc" }} emptyTitle="No requests match these filters" />;
}

/** The ten Approval Centre KPIs from the brief. Counts are within the viewer's visible scope. */
function OverviewKpis({ view }: { view: ApprovalView }) {
  const navigate = useNavigate();
  const { visible, inbox, now, admin } = view;
  const submitted = visible.filter((r) => r.status !== "draft");
  const decided = submitted.filter((r) => r.status === "approved" || r.status === "rejected");
  const avg = decided.length ? decided.reduce((n, r) => n + ageHours(r, now), 0) / decided.length : 0;
  const thisMonth = submitted.filter((r) => r.completedAt && r.completedAt.slice(0, 7) === now.slice(0, 7) && ["approved", "rejected", "withdrawn"].includes(r.status));
  const scopeNote = admin ? "Across all organisations" : "Within your modules, programmes and geography";
  const kpis: { id: string; label: string; value: number; desc: string; variant: KpiVariant; tone?: KpiTone; icon: LucideIcon; to: string; format?: KpiMetric["format"]; ref?: string }[] = [
    { id: "total", label: "Total approval requests", value: submitted.length, desc: scopeNote, variant: "dark", icon: ListChecks, to: `${BASE}/all` },
    { id: "mine", label: "Pending my approval", value: inbox.length, desc: "Eligible for you at the current stage", variant: "primary", icon: Inbox, to: BASE },
    { id: "pending", label: "Pending across organisation", value: submitted.filter((r) => PENDING.includes(r.status)).length, desc: "Awaiting a decision or an approver", variant: "status", tone: "warning", icon: Hourglass, to: `${BASE}/all?status=pending` },
    { id: "approved", label: "Approved requests", value: submitted.filter((r) => r.status === "approved").length, desc: "All required stages approved", variant: "status", tone: "positive", icon: CheckCircle2, to: `${BASE}/approved` },
    { id: "rejected", label: "Rejected requests", value: submitted.filter((r) => r.status === "rejected").length, desc: "Final; never executed", variant: "status", tone: "negative", icon: XCircle, to: `${BASE}/rejected` },
    { id: "returned", label: "Returned for correction", value: submitted.filter((r) => r.status === "returned").length, desc: "Back with the Maker", variant: "status", tone: "warning", icon: Undo2, to: `${BASE}/returned` },
    { id: "exec", label: "Awaiting execution", value: submitted.filter((r) => r.status === "approved" && r.execution.status !== "executed").length, desc: `Approved, not yet applied · ${submitted.filter((r) => r.execution.status === "failed").length} failed`, variant: "light", icon: PlayCircle, to: `${BASE}/execution` },
    { id: "overdue", label: "Overdue approvals", value: submitted.filter((r) => isOverdue(r, now)).length, desc: "Past the stage SLA or escalated", variant: "status", tone: "warning", icon: Siren, to: `${BASE}/overdue` },
    { id: "tat", label: "Average turnaround", value: Math.round(avg * 10) / 10, desc: "Hours from submission to final decision", variant: "light", icon: Timer, to: `${BASE}/analytics`, format: "decimal", ref: `Across ${decided.length} decided requests` },
    { id: "month", label: "Completed this month", value: thisMonth.length, desc: "Approved, rejected or withdrawn in November 2026", variant: "status", tone: "positive", icon: ClipboardList, to: `${BASE}/all?period=month` },
  ];
  return (
    <div className="kpi-grid kpi-grid--5">
      {kpis.map((k) => (
        <div key={k.id}>
          <KpiCard
            metric={{ id: k.id, label: k.label, value: k.value, format: k.format ?? "count", description: k.desc, goodDirection: "neutral", reference: k.ref ?? "Select to open the list", drill: { module: "approvals", title: k.label } }}
            onSelect={() => navigate(k.to)}
            variant={k.variant}
            tone={k.tone}
            icon={k.icon}
            compact
          />
        </div>
      ))}
    </div>
  );
}

const EVENT_TEXT: Record<string, string> = {
  "request.submitted": "Submitted",
  "request.resubmitted": "Resubmitted",
  "request.approved": "Approved",
  "request.rejected": "Rejected",
  "request.returned": "Returned",
  "request.withdrawn": "Withdrawn",
  "request.escalated": "Escalated",
  "approval.completed": "Approval completed",
  "execution.completed": "Executed",
  "execution.failed": "Execution failed",
  "execution.retried": "Execution retried",
  "routing.exception": "Routing exception",
  "decision.blocked": "Decision blocked",
  "admin.override": "Override blocked",
};

interface ActivityRow {
  id: string;
  at: string;
  event: string;
  r: ApprovalRequest;
}

function RecentActivity({ view }: { view: ApprovalView }) {
  const { acc } = view;
  const rows = useMemo<ActivityRow[]>(() => {
    const byId = new Map(view.visible.map((r) => [r.id, r]));
    return view.s.audit
      .filter((e) => byId.has(e.requestId) && e.action in EVENT_TEXT)
      .slice()
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id.localeCompare(a.id)))
      .slice(0, 25)
      .map((e) => ({ id: e.id, at: e.at, event: EVENT_TEXT[e.action], r: byId.get(e.requestId)! }));
  }, [view.s.audit, view.visible]);
  const navigate = useNavigate();
  const columns: Column<ActivityRow>[] = [
    { key: "at", header: "Activity time", value: (a) => a.at, render: (a) => <span className="small num">{formatDateTime(a.at)}</span> },
    { key: "event", header: "Activity", value: (a) => a.event, render: (a) => <span className={`activity-tag activity-tag--${a.event.toLowerCase().replace(/\s+/g, "-")}`}>{a.event}</span> },
    { key: "id", header: "Request ID", value: (a) => a.r.id, render: (a) => <span className="mono small">{a.r.id}</span> },
    { key: "module", header: "Module", value: (a) => moduleLabel(a.r.module), render: (a) => <span className="small">{moduleLabel(a.r.module)}</span> },
    { key: "type", header: "Request type", value: (a) => typeLabel(a.r.requestType), render: (a) => <span className="small">{typeLabel(a.r.requestType)}</span> },
    { key: "prog", header: "Programme", value: (a) => a.r.programme ?? "All" },
    { key: "maker", header: "Maker", value: (a) => userLabel(acc, a.r.makerId) },
    { key: "approver", header: "Current approver", value: (a) => (PENDING_LIKE.includes(a.r.status) ? (currentRun(a.r)?.assignedTo ?? []).map((u) => userLabel(acc, u)).join(", ") : ""), render: (a) => (PENDING_LIKE.includes(a.r.status) ? <span className="small">{(currentRun(a.r)?.assignedTo ?? []).map((u) => userLabel(acc, u)).join(", ")}</span> : <span className="muted small">—</span>) },
    { key: "stage", header: "Current stage", value: (a) => (PENDING.includes(a.r.status) ? currentRun(a.r)?.name ?? "" : ""), render: (a) => <span className="small">{PENDING.includes(a.r.status) ? currentRun(a.r)?.name ?? "—" : "—"}</span> },
    { key: "status", header: "Status", value: (a) => APPROVAL_STATUS[a.r.status].label, render: (a) => <ApprovalStatusBadge status={a.r.status} /> },
    { key: "prio", header: "Priority", value: (a) => PRIORITY[a.r.priority].rank, render: (a) => <PriorityTag priority={a.r.priority} /> },
    { key: "open", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (a) => <Link to={`${BASE}/request/${a.r.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>Open</Link> },
  ];
  return (
    <Panel title="Recent approval activity" subtitle="Latest decisions and status changes on requests you can see" level={3} padded={false}>
      <DataTable rows={rows} columns={columns} rowKey={(a) => a.id} caption="Recent approval activity" searchable={false} pageSize={8} onRowClick={(a) => navigate(`${BASE}/request/${a.r.id}`)} rowActionLabel={(a) => `Open ${a.r.id}`} initialSort={{ key: "at", dir: "desc" }} emptyTitle="No recent activity" />
    </Panel>
  );
}
