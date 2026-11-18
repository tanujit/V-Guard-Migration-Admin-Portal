import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, BellRing, CircleHelp, Copy, Eye, Pencil, Plus, Power, PowerOff, ShieldCheck, Siren, Timer, UserRoundCog } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { EmptyState, SelectField, StatusBadge } from "@/components/ui/primitives";
import { PROGRAMMES } from "@/config/programmes";
import { MultiSelect, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { useToast } from "@/context/ToastContext";
import { MODULES } from "@/config/rbacCatalogue";
import { TODAY, fullName, type PolicyResult } from "@/features/access/engine";
import { stageCandidates, validateWorkflow } from "@/features/approvals/engine";
import { CHANNELS, EVENT_LABEL } from "@/features/approvals/notifications";
import { revokeDelegation, runSlaCheck, saveDelegation, savePolicy, saveWorkflow, setDelegationEnabled, updateGovernanceDecision } from "@/features/approvals/store";
import { formatDateTime } from "@/lib/format";
import type { GovernanceDecision, MandatoryApprovalPolicy, PolicyRequirement, WorkflowTemplate } from "@/types/approval";
import { PolicyMessages, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { BASE, moduleLabel, Notice, typeLabel, useApprovalView, userLabel } from "./shared";

type Tab = "templates" | "decisions" | "policies" | "sla" | "delegation" | "notifications";

export function WorkflowConfigPage() {
  const view = useApprovalView();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "templates";
  const openDecisions = view.s.decisions.filter((d) => d.status !== "confirmed").length;
  return (
    <>
      <SectionTitle
        title="Workflow configuration"
        description={view.admin ? "Approval routing, policies and escalation. Only Evolve platform administrators can change them" : "Read only. Workflow configuration is managed by Evolve platform administrators"}
        actions={
          view.admin && tab === "templates" && (
            <Link to={`${BASE}/workflows/new`} className="btn btn--primary">
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              New workflow
            </Link>
          )
        }
      />
      <Tabs<Tab>
        label="Workflow configuration"
        value={tab}
        onChange={(t) => setParams(t === "templates" ? {} : { tab: t })}
        tabs={[
          { id: "templates", label: "Templates", count: view.s.workflows.length },
          { id: "decisions", label: "Governance decisions", count: openDecisions },
          { id: "policies", label: "Approval policy" },
          { id: "sla", label: "SLA & escalation" },
          { id: "delegation", label: "Delegation" },
          { id: "notifications", label: "Notifications" },
        ]}
      />
      {tab === "templates" && <Templates />}
      {tab === "decisions" && <Decisions />}
      {tab === "policies" && <Policies />}
      {tab === "sla" && <Sla />}
      {tab === "delegation" && <Delegation />}
      {tab === "notifications" && <Notifications />}
    </>
  );
}

const WF_STATUS: Record<WorkflowTemplate["status"], { label: string; tone: "positive" | "neutral" | "warning" }> = {
  active: { label: "Active", tone: "positive" },
  draft: { label: "Draft", tone: "warning" },
  inactive: { label: "Inactive", tone: "neutral" },
};

function Templates() {
  const { s, acc, admin, uid } = useApprovalView();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [toggle, setToggle] = useState<WorkflowTemplate | null>(null);
  const [fMod, setFMod] = useState("all");
  const [fProg, setFProg] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const rows = s.workflows.filter((w) => (fMod === "all" || w.module === fMod) && (fProg === "all" || w.programmes === "all" || w.programmes.includes(fProg)) && (fStatus === "all" || (fStatus === "confirmation" ? w.confirmationRequired : w.status === fStatus)));
  const columns: Column<WorkflowTemplate>[] = [
    { key: "id", header: "Workflow ID", value: (w) => w.id, render: (w) => <span className="mono small">{w.id}</span> },
    { key: "code", header: "Code", value: (w) => w.code, render: (w) => <span className="mono small">{w.code}</span> },
    {
      key: "name",
      header: "Workflow",
      value: (w) => w.name,
      render: (w) => (
        <span className="cell-2">
          <span className="cell-2__main">{w.name}</span>
          <span className="cell-2__sub">{w.requestTypes.map(typeLabel).join(", ")}</span>
        </span>
      ),
    },
    { key: "module", header: "Module", value: (w) => moduleLabel(w.module) },
    { key: "prog", header: "Programme scope", value: (w) => (w.programmes === "all" ? "All" : w.programmes.join(", ")) },
    { key: "stages", header: "Stages", value: (w) => w.stages.length, align: "right", render: (w) => <span className="num">{w.stages.length}</span> },
    { key: "model", header: "Approval model", value: (w) => (w.model === "single" ? "Single stage" : "Sequential"), render: (w) => <span className="small">{w.model === "single" ? "Single stage" : "Sequential"}</span> },
    {
      key: "approvers",
      header: "Eligible now",
      value: (w) => Math.min(...w.stages.map((st) => stageCandidates(acc, w, st).length)),
      align: "right",
      render: (w) => {
        const counts = w.stages.map((st) => stageCandidates(acc, w, st).length);
        const none = counts.some((c) => c === 0);
        return <span className={`num ${none ? "neg" : ""}`} title="Potential approvers per stage, before separation of duties">{counts.join(" / ")}{none && " · gap"}</span>;
      },
    },
    { key: "inflight", header: "In flight", value: (w) => s.requests.filter((r) => r.workflowId === w.id && ["pending_approval", "under_review", "partially_approved", "escalated"].includes(r.status)).length, align: "right" },
    {
      key: "status",
      header: "Status",
      value: (w) => WF_STATUS[w.status].label,
      render: (w) => (
        <span className="profile-chips">
          <StatusBadge tone={WF_STATUS[w.status].tone}>{WF_STATUS[w.status].label}</StatusBadge>
          {w.confirmationRequired && <StatusBadge tone="warning">Business confirmation required</StatusBadge>}
        </span>
      ),
    },
    { key: "created", header: "Created by", value: (w) => userLabel(acc, w.createdBy), render: (w) => <span className="small">{userLabel(acc, w.createdBy)}</span> },
    { key: "modified", header: "Last modified", value: (w) => w.updatedAt, render: (w) => <span className="small num">{formatDateTime(w.updatedAt)}</span> },
    {
      key: "actions",
      header: "Actions",
      value: () => null,
      sortable: false,
      noSearch: true,
      render: (w) => (
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          <Link className="icon-btn icon-btn--sm" to={`${BASE}/workflows/${w.id}`} aria-label={`View ${w.code}`} title="View">
            <Eye size={15} strokeWidth={2} />
          </Link>
          {admin && (
            <>
              <Link className="icon-btn icon-btn--sm" to={`${BASE}/workflows/${w.id}/edit`} aria-label={`Edit ${w.code}`} title="Edit">
                <Pencil size={15} strokeWidth={2} />
              </Link>
              <Link className="icon-btn icon-btn--sm" to={`${BASE}/workflows/${w.id}/clone`} aria-label={`Clone ${w.code}`} title="Clone">
                <Copy size={15} strokeWidth={2} />
              </Link>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => setToggle(w)} aria-label={`${w.status === "active" ? "Deactivate" : "Activate"} ${w.code}`} title={w.status === "active" ? "Deactivate" : "Activate"}>
                {w.status === "active" ? <PowerOff size={15} strokeWidth={2} /> : <Power size={15} strokeWidth={2} />}
              </button>
            </>
          )}
        </span>
      ),
    },
  ];
  const gaps = s.workflows.filter((w) => w.status === "active" && w.stages.some((st) => stageCandidates(acc, w, st).length === 0));
  const target = toggle ? (toggle.status === "active" ? "inactive" : "active") : "active";
  return (
    <>
      {gaps.length > 0 && (
        <Notice tone="danger" icon={<AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />}>
          <strong>{gaps.map((w) => w.code).join(", ")}</strong> {gaps.length > 1 ? "have" : "has"} a stage with no eligible approver. Requests routed there wait in Pending assignment until the workflow or Checker access is fixed.
        </Notice>
      )}
      <Panel padded={false}>
        <DataTable
          rows={rows}
          toolbar={
            <>
              <SelectField label="Module" value={fMod} onChange={setFMod} options={[{ value: "all", label: "All modules" }, ...Array.from(new Set(s.workflows.map((w) => w.module))).map((m) => ({ value: m, label: moduleLabel(m) }))]} active={fMod !== "all"} />
              <SelectField label="Programme" value={fProg} onChange={setFProg} options={[{ value: "all", label: "All programmes" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} active={fProg !== "all"} />
              <SelectField label="Status" value={fStatus} onChange={setFStatus} options={[{ value: "all", label: "Any status" }, { value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "inactive", label: "Inactive" }, { value: "confirmation", label: "Business confirmation required" }]} active={fStatus !== "all"} />
            </>
          }
          columns={columns} rowKey={(w) => w.id} caption="Workflow templates" searchPlaceholder="Search workflows" exportName="approval-workflows" onRowClick={(w) => navigate(`${BASE}/workflows/${w.id}`)} rowActionLabel={(w) => `Open ${w.code}`} initialSort={{ key: "code", dir: "asc" }} />
      </Panel>
      <ReasonDialog
        open={!!toggle}
        title={toggle ? `${target === "active" ? "Activate" : "Deactivate"} ${toggle.code}` : ""}
        confirmLabel={target === "active" ? "Activate" : "Deactivate"}
        tone={target === "active" ? "default" : "danger"}
        body={target === "active" ? "The workflow starts routing new submissions that match it. Activation is blocked while business confirmation is pending or a stage has no eligible approver." : "New submissions stop matching this workflow. Requests already in flight keep their current routing."}
        onClose={() => setToggle(null)}
        onConfirm={(reason) => {
          const out = saveWorkflow(uid, { ...toggle!, status: target }, reason);
          if (out.ok) notify(`${toggle!.code} ${target === "active" ? "activated" : "deactivated"}`, "positive");
          return out;
        }}
      />
    </>
  );
}

function Decisions() {
  const { s, admin, uid } = useApprovalView();
  const { notify } = useToast();
  const [edit, setEdit] = useState<GovernanceDecision | null>(null);
  const [status, setStatus] = useState<GovernanceDecision["status"]>("open");
  const [answer, setAnswer] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  return (
    <>
      <Notice tone="info" icon={<CircleHelp size={16} strokeWidth={2} aria-hidden="true" />}>
        These questions come from the SOW and are not yet answered by the business. Workflows that depend on them stay in Draft and cannot be activated. Recording an answer here never activates a workflow by itself.
      </Notice>
      <div className="decision-list">
        {s.decisions.map((d) => (
          <Panel key={d.id} level={3} className="gov-decision">
            <div className="gov-decision__head">
              <span className="mono small muted">{d.id}</span>
              <StatusBadge tone={d.status === "confirmed" ? "positive" : d.status === "proposed" ? "info" : "warning"}>{d.status === "confirmed" ? "Confirmed" : d.status === "proposed" ? "Proposal under review" : "Business confirmation required"}</StatusBadge>
            </div>
            <h3 className="gov-decision__q">{d.question}</h3>
            <p className="small">{d.context}</p>
            <p className="small muted">
              Owner: {d.owner} · {d.sowRef}
              {d.workflowIds.length > 0 && <> · Affects {d.workflowIds.map((id) => <Link key={id} to={`${BASE}/workflows/${id}`} className="mono">{id} </Link>)}</>}
            </p>
            {d.answer && <p className="gov-decision__a small"><strong>Recorded answer:</strong> {d.answer}</p>}
            {admin && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setEdit(d); setStatus(d.status); setAnswer(d.answer); setRes(null); }}>
                Record outcome
              </button>
            )}
          </Panel>
        ))}
      </div>
      <ConfirmDialog
        open={!!edit}
        title={edit ? `${edit.id} · record outcome` : ""}
        confirmLabel="Save"
        onCancel={() => setEdit(null)}
        onConfirm={() => {
          const out = updateGovernanceDecision(uid, edit!.id, { status, answer });
          if (!out.ok) return setRes(out);
          notify(`${edit!.id} updated`, "positive");
          out.warnings.forEach((w) => notify(w, "info"));
          setEdit(null);
        }}
        body={
          edit && (
            <div className="reason-dialog">
              <p className="small">{edit.question}</p>
              <SelectInput label="Status" value={status} onChange={(v) => setStatus(v as GovernanceDecision["status"])} options={[{ value: "open", label: "Open" }, { value: "proposed", label: "Proposal under review" }, { value: "confirmed", label: "Confirmed by the business" }]} />
              <TextArea label="Answer and who confirmed it" value={answer} onChange={setAnswer} rows={3} />
              <PolicyMessages result={res} />
            </div>
          )
        }
      />
    </>
  );
}

const REQ_LABEL: Record<PolicyRequirement, { label: string; tone: "positive" | "warning" | "neutral" }> = {
  required: { label: "Approval required", tone: "positive" },
  confirmation_required: { label: "Business confirmation required", tone: "warning" },
  not_required: { label: "Approval not required", tone: "neutral" },
};

function Policies() {
  const { s, admin, uid } = useApprovalView();
  const { notify } = useToast();
  const [edit, setEdit] = useState<MandatoryApprovalPolicy | null>(null);
  const [req, setReq] = useState<PolicyRequirement>("required");
  const columns: Column<MandatoryApprovalPolicy>[] = [
    { key: "label", header: "Action", value: (p) => p.label, render: (p) => <span className="cell-2"><span className="cell-2__main">{p.label}</span><span className="cell-2__sub">{moduleLabel(p.module)}</span></span> },
    { key: "cat", header: "Category", value: (p) => p.category, render: (p) => <span className="small">{p.category === "financial" ? "Financial" : p.category === "member" ? "Member" : "Configuration"}</span> },
    { key: "req", header: "Requirement", value: (p) => REQ_LABEL[p.requirement].label, render: (p) => <StatusBadge tone={REQ_LABEL[p.requirement].tone}>{REQ_LABEL[p.requirement].label}</StatusBadge> },
    { key: "reason", header: "Reason", value: (p) => (p.reasonRequired ? "Mandatory" : "Optional"), render: (p) => <span className="small">{p.reasonRequired ? "Mandatory" : "Optional"}</span> },
    { key: "wf", header: "Active workflow", value: (p) => s.workflows.filter((w) => w.status === "active" && w.requestTypes.includes(p.requestType)).map((w) => w.code).join(", ") || "None", render: (p) => { const w = s.workflows.filter((x) => x.status === "active" && x.requestTypes.includes(p.requestType)); return w.length ? <span className="mono small">{w.map((x) => x.code).join(", ")}</span> : <span className="neg small">None: requests wait for routing</span>; } },
    { key: "note", header: "Note", value: (p) => p.note, render: (p) => <span className="small muted">{p.note}</span> },
    ...(admin ? [{ key: "edit", header: "", value: () => null, sortable: false, noSearch: true, render: (p: MandatoryApprovalPolicy) => <button type="button" className="icon-btn icon-btn--sm" aria-label={`Change policy for ${p.label}`} onClick={(e) => { e.stopPropagation(); setEdit(p); setReq(p.requirement); }}><Pencil size={15} strokeWidth={2} /></button> } as Column<MandatoryApprovalPolicy>] : []),
  ];
  return (
    <>
      <Notice tone="info" icon={<ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />}>
        Money-related and member-status actions always need a second-person approval with a reason, and no administrative role can bypass it. Where the requirement awaits business confirmation, requests are still routed for approval as a safeguard.
      </Notice>
      <Panel padded={false}>
        <DataTable rows={s.policies} columns={columns} rowKey={(p) => p.id} caption="Mandatory approval policy" searchPlaceholder="Search actions" exportName="approval-policy" pageSize={20} />
      </Panel>
      <ReasonDialog
        open={!!edit}
        title={edit ? `Approval requirement · ${edit.label}` : ""}
        confirmLabel="Save policy"
        body={edit && edit.category !== "configuration" ? "Financial and member-status actions cannot be set to Approval not required." : "Choose the requirement the business has confirmed."}
        onClose={() => setEdit(null)}
        onConfirm={(reason) => {
          const out = savePolicy(uid, edit!.id, { requirement: req, reasonRequired: edit!.reasonRequired, note: edit!.note }, reason);
          if (out.ok) notify("Policy updated", "positive");
          return out;
        }}
      >
        <SelectInput label="Requirement" value={req} onChange={(v) => setReq(v as PolicyRequirement)} options={(Object.keys(REQ_LABEL) as PolicyRequirement[]).map((k) => ({ value: k, label: REQ_LABEL[k].label, disabled: k === "not_required" && edit?.category !== "configuration" }))} />
      </ReasonDialog>
    </>
  );
}

function Sla() {
  const { s, acc, admin, uid } = useApprovalView();
  const { notify } = useToast();
  return (
    <>
      <Notice tone="info" icon={<Timer size={16} strokeWidth={2} aria-hidden="true" />} action={admin && <button type="button" className="btn btn--dark btn--sm" onClick={() => { const r = runSlaCheck(uid); notify(r.ok ? `SLA check: ${r.overdue} overdue, ${r.escalated} escalated` : r.errors[0], r.ok ? "positive" : "negative"); }}>Run SLA check (mock)</button>}>
        There is no backend scheduler yet. The SLA check runs on demand against the demo clock. Escalation notifies and flags; it never approves a request or skips a mandatory stage.
      </Notice>
      <Panel padded={false}>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">SLA and escalation per workflow</caption>
            <thead>
              <tr>
                <th scope="col">Workflow</th>
                <th scope="col">Stage SLAs</th>
                <th scope="col">Calendar</th>
                <th scope="col">Escalate after</th>
                <th scope="col">Behaviour</th>
                <th scope="col">Escalation recipients</th>
              </tr>
            </thead>
            <tbody>
              {s.workflows.map((w) => (
                <tr key={w.id}>
                  <td><span className="mono small">{w.code}</span> <span className="small muted">{w.name}</span></td>
                  <td className="small">{w.stages.map((st) => `${st.name}: ${st.slaHours ?? "—"}h`).join(" · ")}</td>
                  <td className="small">{w.sla.calendar === "business_hours" ? "Business hours (calendar not configured; counted as calendar hours)" : "Calendar hours"}</td>
                  <td className="num small">{w.sla.escalateAfterHours === null ? "No escalation" : `${w.sla.escalateAfterHours}h past due`}</td>
                  <td className="small">{w.sla.behaviour === "notify" ? "Notify approvers" : w.sla.behaviour === "notify_and_flag" ? "Notify and mark Escalated" : "Add backup approver"}</td>
                  <td className="small">{w.sla.escalationRoleIds.map((id) => acc.roles.find((r) => r.id === id)?.name).join(", ") || "Assigned approvers only"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Delegation() {
  const { s, acc, admin, uid } = useApprovalView();
  const { notify } = useToast();
  const [toggle, setToggle] = useState(false);
  const [form, setForm] = useState({ from: uid, to: "", modules: [] as string[], start: TODAY, end: TODAY, reason: "" });
  const [res, setRes] = useState<PolicyResult | null>(null);
  const users = acc.users.filter((u) => u.accountStatus === "active");
  return (
    <>
      <Notice tone={s.delegationEnabled ? "warn" : "info"} icon={<UserRoundCog size={16} strokeWidth={2} aria-hidden="true" />} action={admin && <button type="button" className="btn btn--secondary btn--sm" onClick={() => setToggle(true)}>{s.delegationEnabled ? "Disable delegation" : "Enable delegation"}</button>}>
        <strong>Temporary delegation is {s.delegationEnabled ? "enabled" : "disabled"}.</strong> It stays disabled until the business confirms it is needed (governance decision GD-05). A delegate must independently hold a Checker profile with Approve on the module; delegation never creates authority and never lets a Maker approve their own request.
      </Notice>
      {s.delegationEnabled && (
        <Panel title="New delegation" level={3}>
          <div className="form-grid form-grid--3">
            <SelectInput label="From approver" value={form.from} onChange={(v) => setForm({ ...form, from: v })} options={users.map((u) => ({ value: u.id, label: fullName(u) }))} disabled={!admin} />
            <SelectInput label="To delegate" value={form.to} onChange={(v) => setForm({ ...form, to: v })} options={[{ value: "", label: "Choose" }, ...users.filter((u) => u.id !== form.from).map((u) => ({ value: u.id, label: fullName(u) }))]} />
            <MultiSelect label="Modules" value={form.modules} onChange={(v) => setForm({ ...form, modules: v })} options={MODULES.filter((m) => m.actions.includes("approve")).map((m) => ({ value: m.id, label: m.label }))} />
            <TextField label="Start" type="date" value={form.start} onChange={(v) => setForm({ ...form, start: v })} />
            <TextField label="End" type="date" value={form.end} onChange={(v) => setForm({ ...form, end: v })} />
            <TextField label="Reason" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
          </div>
          <PolicyMessages result={res} />
          <button type="button" className="btn btn--primary" onClick={() => { const out = saveDelegation(uid, { fromUserId: form.from, toUserId: form.to, modules: form.modules, programmes: "all", geography: { mode: "all" }, startDate: form.start, endDate: form.end, reason: form.reason }); setRes(out); if (out.ok) notify("Delegation created", "positive"); }}>Create delegation</button>
        </Panel>
      )}
      <Panel title="Delegations" level={3}>
        {s.delegations.length === 0 ? (
          <EmptyState title="No delegations" compact>None have been created.</EmptyState>
        ) : (
          <ul className="deleg-list">
            {s.delegations.map((d) => (
              <li key={d.id} className="small">
                <span className="mono">{d.id}</span> · {userLabel(acc, d.fromUserId)} → {userLabel(acc, d.toUserId)} · {d.modules.map(moduleLabel).join(", ")} · {d.startDate} to {d.endDate} · <StatusBadge tone={d.status === "active" ? "positive" : "neutral"}>{d.status}</StatusBadge>
                {d.status === "active" && <button type="button" className="btn btn--ghost btn--xs" onClick={() => { const out = revokeDelegation(uid, d.id); notify(out.ok ? "Delegation revoked" : out.errors[0], out.ok ? "positive" : "negative"); }}>Revoke</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ReasonDialog
        open={toggle}
        title={s.delegationEnabled ? "Disable temporary delegation" : "Enable temporary delegation"}
        confirmLabel={s.delegationEnabled ? "Disable" : "Enable"}
        body={s.delegationEnabled ? "Active delegations are revoked." : "Only enable this once the business has confirmed delegation is required."}
        onClose={() => setToggle(false)}
        onConfirm={(reason) => {
          const out = setDelegationEnabled(uid, !s.delegationEnabled, reason);
          if (out.ok) notify(`Delegation ${s.delegationEnabled ? "disabled" : "enabled"}`, "positive");
          return out;
        }}
      />
    </>
  );
}

function Notifications() {
  const { s } = useApprovalView();
  const byEvent = Object.entries(EVENT_LABEL).map(([event, label]) => ({ event, label, count: s.notifications.filter((n) => n.event === event).length }));
  return (
    <>
      <Notice tone="info" icon={<BellRing size={16} strokeWidth={2} aria-hidden="true" />}>
        Notifications go through one service. Only the in-portal channel is active; email and SMS are declared for later and send nothing.
      </Notice>
      <div className="grid-2">
        <Panel title="Channels" level={3}>
          <ul className="channel-list">
            {CHANNELS.map((c) => (
              <li key={c.id} className="channel">
                <span className="channel__name">{c.label}</span>
                <StatusBadge tone={c.active ? "positive" : "neutral"}>{c.active ? "Active" : "Not configured"}</StatusBadge>
                <span className="small muted">{c.status}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Events raised" level={3} subtitle="In-portal notifications generated in this session's demo data">
          <ul className="channel-list">
            {byEvent.map((e) => (
              <li key={e.event} className="channel">
                <span className="channel__name">{e.label}</span>
                <span className="mono small muted">{e.event}</span>
                <span className="num">{e.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

/* ---------------- Workflow detail (read-only view) ---------------- */

export function WorkflowDetailPage({ id }: { id: string }) {
  const { s, acc, admin } = useApprovalView();
  const w = s.workflows.find((x) => x.id === id);
  if (!w) return <EmptyState title="Workflow not found" />;
  const v = validateWorkflow(s, acc, w);
  return (
    <>
      <SectionTitle
        title={`${w.code} · ${w.name}`}
        description={w.description}
        actions={
          admin && (
            <>
              <Link to={`${BASE}/workflows/${w.id}/clone`} className="btn btn--secondary"><Copy size={16} strokeWidth={2} aria-hidden="true" />Clone</Link>
              <Link to={`${BASE}/workflows/${w.id}/edit`} className="btn btn--primary"><Pencil size={16} strokeWidth={2} aria-hidden="true" />Edit</Link>
            </>
          )
        }
      />
      {w.confirmationRequired && (
        <Notice tone="warn" icon={<Siren size={16} strokeWidth={2} aria-hidden="true" />}>
          <strong>Business confirmation required.</strong> {w.configNote} This workflow cannot route requests until the governance decision is confirmed.
        </Notice>
      )}
      <PolicyMessages result={{ errors: v.errors, warnings: v.warnings }} title="Configuration gaps" warnTitle="Check" />
      <div className="grid-2">
        <Panel title="Scope" level={3}>
          <dl className="kv kv--tight">
            <div className="kv__row"><dt>Status</dt><dd><StatusBadge tone={WF_STATUS[w.status].tone}>{WF_STATUS[w.status].label}</StatusBadge></dd></div>
            <div className="kv__row"><dt>Module</dt><dd>{moduleLabel(w.module)}</dd></div>
            <div className="kv__row"><dt>Request types</dt><dd>{w.requestTypes.map(typeLabel).join(", ")}</dd></div>
            <div className="kv__row"><dt>Maker organisations</dt><dd>{w.makerOrgs === "any" ? "Any" : w.makerOrgs.map((o) => acc.organisations.find((x) => x.id === o)?.name).join(", ")}</dd></div>
            <div className="kv__row"><dt>Programmes</dt><dd>{w.programmes === "all" ? "All" : w.programmes.join(", ")}</dd></div>
            <div className="kv__row"><dt>Conditions</dt><dd>{w.conditions.length ? w.conditions.map((c) => `${c.field} ${c.op} ${c.values.join(", ")}`).join("; ") : "None"}</dd></div>
            <div className="kv__row"><dt>SOW reference</dt><dd className="small">{w.sowRef || "—"}</dd></div>
            <div className="kv__row"><dt>Last changed</dt><dd className="small">{formatDateTime(w.updatedAt)} by {userLabel(acc, w.updatedBy)}</dd></div>
          </dl>
        </Panel>
        <Panel title="Policy" level={3}>
          <dl className="kv kv--tight">
            <div className="kv__row"><dt>Logic</dt><dd>{w.model === "single" ? "Single stage" : "Sequential stages"}</dd></div>
            <div className="kv__row"><dt>Separation of duties</dt><dd>Maker excluded{w.separation.distinctApproverPerStage ? "; a different approver at each stage" : ""}</dd></div>
            <div className="kv__row"><dt>Return</dt><dd>{w.policy.allowReturn ? `Allowed; resubmission ${w.policy.onResubmit === "restart" ? "restarts from stage 1" : "resumes at the returning stage"}` : "Not allowed"}</dd></div>
            <div className="kv__row"><dt>Reject</dt><dd>Final, remarks required{w.policy.allowNewRequestAfterReject ? "; a new request may be raised" : ""}</dd></div>
            <div className="kv__row"><dt>Withdraw</dt><dd>{w.policy.allowWithdraw === "never" ? "Not allowed" : "Before any decision"}</dd></div>
            <div className="kv__row"><dt>SLA escalation</dt><dd>{w.sla.escalateAfterHours === null ? "None" : `${w.sla.escalateAfterHours}h past due`}</dd></div>
          </dl>
        </Panel>
      </div>
      <Panel title="Stages" level={3}>
        <ol className="route">
          {w.stages.map((st, i) => {
            const c = stageCandidates(acc, w, st);
            return (
              <li key={st.id} className="route__stage">
                <p className="route__name">{i + 1}. {st.name} <span className="route__status small">{st.slaHours ?? "—"}h SLA · remarks on approve {st.remarksOnApprove}</span></p>
                <p className="small">{st.description}</p>
                <p className="small muted">
                  {st.approverModel === "fixed_user" ? `Named: ${st.fixedUserIds.map((u) => userLabel(acc, u)).join(", ")}` : st.approverModel === "org_group" ? `Organisation: ${st.approverOrgIds.map((o) => acc.organisations.find((x) => x.id === o)?.name).join(", ")}` : `Roles: ${st.eligibleRoleIds.map((r) => acc.roles.find((x) => x.id === r)?.name).join(", ")}${st.approverOrgIds.length ? ` in ${st.approverOrgIds.map((o) => acc.organisations.find((x) => x.id === o)?.name).join(", ")}` : ""}`}
                  {" · "}needs Checker profile with Approve on {moduleLabel(w.module)}
                </p>
                <p className={`small ${c.length ? "" : "neg"}`}>Potential approvers: {c.length ? c.map((u) => fullName(u)).join(", ") : "none"}</p>
              </li>
            );
          })}
        </ol>
      </Panel>
    </>
  );
}

