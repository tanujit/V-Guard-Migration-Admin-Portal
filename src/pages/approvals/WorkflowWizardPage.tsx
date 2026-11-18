import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, RadioCards, SelectInput, Stepper, TextArea, TextField } from "@/components/form/Form";
import { REQUEST_TYPES, PRIORITY } from "@/config/approvalCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { PROGRAMMES } from "@/config/programmes";
import { MODULES } from "@/config/rbacCatalogue";
import { useToast } from "@/context/ToastContext";
import { fullName, TODAY, type PolicyResult } from "@/features/access/engine";
import { stageCandidates, validateWorkflow } from "@/features/approvals/engine";
import { saveWorkflow } from "@/features/approvals/store";
import type { ApproverModel, ConditionField, Priority, TriggerCondition, WorkflowStage, WorkflowTemplate } from "@/types/approval";
import { AccessDenied, PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { BASE, moduleLabel, Notice, typeLabel, useApprovalView } from "./shared";

const STEPS = ["Basics", "Triggers", "Stages", "Approvers", "Approval logic", "Return & reject", "Review & activate"];

const MODELS: { value: ApproverModel; label: string; description: string }[] = [
  { value: "role_group", label: "Role group", description: "Anyone holding the selected roles and a Checker profile" },
  { value: "org_group", label: "Organisation group", description: "Checkers belonging to the selected organisations" },
  { value: "programme_group", label: "Programme group", description: "Checkers whose scope covers the stage's programmes" },
  { value: "geography_group", label: "Geography group", description: "Checkers whose scope covers the request's location" },
  { value: "fixed_user", label: "Named user", description: "Specific people; each still needs a Checker profile" },
];

const CONDITION_FIELDS: { value: ConditionField; label: string }[] = [
  { value: "programme", label: "Programme" },
  { value: "makerOrg", label: "Maker organisation" },
  { value: "makerRole", label: "Maker role" },
  { value: "state", label: "State" },
  { value: "category", label: "Request category" },
  { value: "amount", label: "Amount (points)" },
];

const newStage = (wfId: string, n: number): WorkflowStage => ({ id: `${wfId}-S${n}-${Date.now().toString(36)}`, name: "", description: "", approverModel: "role_group", fixedUserIds: [], approverOrgIds: [], eligibleRoleIds: [], requiredProfile: "checker", requiredAction: "approve", programmes: "all", geography: { mode: "all" }, mandatory: true, remarksOnApprove: "optional", slaHours: 24 });

function blank(id: string, uid: string): WorkflowTemplate {
  return {
    id,
    code: "",
    name: "",
    description: "",
    module: "",
    requestTypes: [],
    makerOrgs: "any",
    programmes: "all",
    status: "draft",
    confirmationRequired: false,
    configNote: "",
    sowRef: "",
    conditions: [],
    model: "single",
    stages: [newStage(id, 1)],
    separation: { makerExcluded: true, distinctApproverPerStage: true },
    policy: { allowReturn: true, rejectionTerminal: true, allowNewRequestAfterReject: true, rejectRemarks: "required", returnRemarks: "required", allowWithdraw: "before_decision", onResubmit: "restart", expiryDays: null },
    sla: { calendar: "calendar_hours", escalateAfterHours: 24, escalationRoleIds: [], behaviour: "notify", backupUserIds: [] },
    defaultPriority: "medium",
    createdBy: uid,
    createdAt: `${TODAY}T00:00`,
    updatedBy: uid,
    updatedAt: `${TODAY}T00:00`,
  };
}

export function WorkflowWizardPage({ mode }: { mode: "new" | "edit" | "clone" }) {
  const { workflowId } = useParams();
  const { s, acc, uid, admin } = useApprovalView();
  const navigate = useNavigate();
  const { notify } = useToast();
  const source = s.workflows.find((w) => w.id === workflowId);
  const nextId = `WF-${String(s.workflows.length + 1).padStart(3, "0")}`;
  const [wf, setWf] = useState<WorkflowTemplate>(() => {
    if (mode === "edit" && source) return structuredClone(source);
    if (mode === "clone" && source) return { ...structuredClone(source), id: nextId, code: `${source.code}-COPY`.slice(0, 32), name: `${source.name} (copy)`, status: "draft", stages: source.stages.map((st, i) => ({ ...structuredClone(st), id: `${nextId}-S${i + 1}` })) };
    return blank(nextId, uid);
  });
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(mode === "new" ? 0 : STEPS.length - 1);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const validation = useMemo(() => validateWorkflow(s, acc, wf), [s, acc, wf]);

  if (!admin) return <AccessDenied message="Only Evolve platform administrators configure approval workflows." />;
  if ((mode === "edit" || mode === "clone") && !source) return <AccessDenied message={`Workflow ${workflowId} was not found.`} />;

  const set = (patch: Partial<WorkflowTemplate>) => setWf((w) => ({ ...w, ...patch }));
  const setStage = (i: number, patch: Partial<WorkflowStage>) => setWf((w) => ({ ...w, stages: w.stages.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  const go = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
  };
  const approvalModules = MODULES.filter((m) => m.actions.includes("approve") && m.id !== "approvals");
  const inflight = s.requests.filter((r) => r.workflowId === wf.id && ["pending_approval", "under_review", "partially_approved", "escalated"].includes(r.status)).length;

  const save = (status: WorkflowTemplate["status"]) => {
    if (!reason.trim()) return setRes({ ok: false, errors: ["Give a reason for this change; it is recorded in the audit history"], warnings: [] });
    const out = saveWorkflow(uid, { ...wf, status, model: wf.stages.length > 1 ? "sequential" : wf.model }, reason);
    if (!out.ok) return setRes(out);
    notify(`${wf.code} saved as ${status}`, "positive");
    out.warnings.forEach((w) => notify(w, "info"));
    navigate(`${BASE}/workflows/${wf.id}`);
  };

  return (
    <div className="wizard">
      <Link to={`${BASE}/workflows`} className="back-link">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
        Workflow configuration
      </Link>
      <SectionTitle title={mode === "new" ? "New approval workflow" : mode === "clone" ? `Clone ${source?.code}` : `Edit ${source?.code}`} description={inflight ? `${inflight} request(s) in flight keep their current routing. Changes apply to new submissions` : "Workflows route requests to eligible Checkers. They never grant approval rights"} />
      <Stepper steps={STEPS} current={step} onSelect={go} maxReached={maxReached} />

      <Panel level={3} title={STEPS[step]}>
        {step === 0 && (
          <div className="form-grid form-grid--2">
            <TextField label="Workflow name" required value={wf.name} onChange={(v) => set({ name: v })} />
            <TextField label="Code" required value={wf.code} onChange={(v) => set({ code: v.toUpperCase() })} hint="3–32 capitals, digits, - or _" />
            <TextArea label="Description" value={wf.description} onChange={(v) => set({ description: v })} rows={2} />
            <TextField label="SOW reference" value={wf.sowRef} onChange={(v) => set({ sowRef: v })} />
            <SelectInput label="Module" required value={wf.module} onChange={(v) => set({ module: v, requestTypes: [] })} options={[{ value: "", label: "Choose a module" }, ...approvalModules.map((m) => ({ value: m.id, label: m.label }))]} />
            <MultiSelect label="Request types" value={wf.requestTypes} onChange={(v) => set({ requestTypes: v })} options={REQUEST_TYPES.filter((t) => t.module === wf.module).map((t) => ({ value: t.id, label: t.label }))} emptyText="Choose a module first" />
            <MultiSelect label="Maker organisations" value={wf.makerOrgs === "any" ? [] : wf.makerOrgs} onChange={(v) => set({ makerOrgs: v.length ? v : "any" })} options={acc.organisations.filter((o) => o.status === "active").map((o) => ({ value: o.id, label: o.name }))} placeholder="Any organisation" />
            <MultiSelect label="Programmes" value={wf.programmes === "all" ? [] : wf.programmes} onChange={(v) => set({ programmes: v.length ? v : "all" })} options={PROGRAMMES.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))} placeholder="All programmes" />
            <SelectInput label="Default priority" value={wf.defaultPriority} onChange={(v) => set({ defaultPriority: v as Priority })} options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label }))} />
            <div>
              <Checkbox label="Business confirmation required" checked={wf.confirmationRequired} onChange={(v) => set({ confirmationRequired: v })} description="Set while this routing depends on an unresolved reading of the SOW. Blocks activation" />
              {wf.confirmationRequired && <TextField label="What needs confirming" value={wf.configNote} onChange={(v) => set({ configNote: v })} />}
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="small muted">Optional. With no conditions, the workflow applies to every request of the chosen types. When two active workflows match equally, the request stops at routing instead of guessing.</p>
            {wf.conditions.map((c, i) => (
              <div key={c.id} className="cond-row">
                <SelectInput label="Field" value={c.field} onChange={(v) => set({ conditions: wf.conditions.map((x, j) => (j === i ? { ...x, field: v as ConditionField, op: v === "amount" ? "gte" : "in" } : x)) })} options={CONDITION_FIELDS} />
                <SelectInput label="Operator" value={c.op} onChange={(v) => set({ conditions: wf.conditions.map((x, j) => (j === i ? { ...x, op: v as TriggerCondition["op"] } : x)) })} options={c.field === "amount" ? [{ value: "gte", label: "at least" }, { value: "lte", label: "at most" }] : [{ value: "in", label: "is one of" }]} />
                <TextField label="Values" value={c.values.join(", ")} onChange={(v) => set({ conditions: wf.conditions.map((x, j) => (j === i ? { ...x, values: v.split(",").map((t) => t.trim()).filter(Boolean) } : x)) })} hint={c.field === "programme" ? "e.g. EP, ST" : c.field === "state" ? "State codes, e.g. KL, TN" : c.field === "makerOrg" ? "e.g. ORG-0001" : c.field === "category" ? "financial, member or configuration" : undefined} />
                <button type="button" className="icon-btn" aria-label="Remove condition" onClick={() => set({ conditions: wf.conditions.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => set({ conditions: [...wf.conditions, { id: `C${Date.now().toString(36)}`, field: "programme", op: "in", values: [] }] })}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Add condition
            </button>
          </>
        )}

        {step === 2 && (
          <>
            {wf.stages.map((st, i) => (
              <div key={st.id} className="stage-edit">
                <div className="stage-edit__head">
                  <strong>Stage {i + 1}</strong>
                  <span className="row-actions">
                    <button type="button" className="icon-btn icon-btn--sm" aria-label="Move up" disabled={i === 0} onClick={() => set({ stages: wf.stages.map((x, j) => (j === i - 1 ? wf.stages[i] : j === i ? wf.stages[i - 1] : x)) })}>
                      <ArrowUp size={14} strokeWidth={2} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label="Move down" disabled={i === wf.stages.length - 1} onClick={() => set({ stages: wf.stages.map((x, j) => (j === i + 1 ? wf.stages[i] : j === i ? wf.stages[i + 1] : x)) })}>
                      <ArrowDown size={14} strokeWidth={2} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove stage ${i + 1}`} disabled={wf.stages.length === 1} onClick={() => set({ stages: wf.stages.filter((_, j) => j !== i) })}>
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </span>
                </div>
                <div className="form-grid form-grid--3">
                  <TextField label="Stage name" required value={st.name} onChange={(v) => setStage(i, { name: v })} />
                  <TextField label="SLA (hours)" type="number" value={st.slaHours?.toString() ?? ""} onChange={(v) => setStage(i, { slaHours: v ? Number(v) : null })} />
                  <SelectInput label="Remarks on approval" value={st.remarksOnApprove} onChange={(v) => setStage(i, { remarksOnApprove: v as WorkflowStage["remarksOnApprove"] })} options={[{ value: "optional", label: "Optional" }, { value: "required", label: "Required" }]} />
                </div>
                <TextArea label="What the approver checks" value={st.description} onChange={(v) => setStage(i, { description: v })} rows={2} />
                <Checkbox label="Mandatory stage" checked disabled onChange={() => undefined} description="Stages cannot be skipped, by escalation or by any administrator" />
              </div>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => set({ stages: [...wf.stages, newStage(wf.id, wf.stages.length + 1)], model: "sequential" })}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Add stage
            </button>
          </>
        )}

        {step === 3 &&
          wf.stages.map((st, i) => {
            const cands = wf.module ? stageCandidates(acc, wf, st) : [];
            return (
              <div key={st.id} className="stage-edit">
                <div className="stage-edit__head">
                  <strong>
                    Stage {i + 1}: {st.name || "Unnamed"}
                  </strong>
                  <StatusBadge tone={cands.length ? "positive" : "negative"}>{cands.length ? `${cands.length} potential approver${cands.length > 1 ? "s" : ""}` : "No eligible approver"}</StatusBadge>
                </div>
                <div className="form-grid form-grid--2">
                  <SelectInput label="Approver assignment" value={st.approverModel} onChange={(v) => setStage(i, { approverModel: v as ApproverModel })} options={MODELS.map((m) => ({ value: m.value, label: m.label }))} hint={MODELS.find((m) => m.value === st.approverModel)?.description} />
                  {st.approverModel === "fixed_user" && <MultiSelect label="Named approvers" value={st.fixedUserIds} onChange={(v) => setStage(i, { fixedUserIds: v })} options={acc.users.map((u) => ({ value: u.id, label: `${fullName(u)}${u.accountStatus !== "active" ? ` (${u.accountStatus})` : ""}` }))} />}
                  <MultiSelect label="Approver organisations" value={st.approverOrgIds} onChange={(v) => setStage(i, { approverOrgIds: v })} options={acc.organisations.filter((o) => o.status === "active").map((o) => ({ value: o.id, label: o.name }))} placeholder="Any organisation" />
                  <MultiSelect label="Eligible roles" value={st.eligibleRoleIds} onChange={(v) => setStage(i, { eligibleRoleIds: v })} options={acc.roles.filter((r) => r.status === "active").map((r) => ({ value: r.id, label: r.name }))} placeholder="Any role" />
                  <MultiSelect label="Stage programmes" value={st.programmes === "all" ? [] : st.programmes} onChange={(v) => setStage(i, { programmes: v.length ? v : "all" })} options={PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))} placeholder="All programmes" />
                  <MultiSelect label="Stage states" value={st.geography.mode === "all" ? [] : st.geography.states} onChange={(v) => setStage(i, { geography: v.length ? { mode: "selected", states: v, districts: [], branches: [] } : { mode: "all" } })} options={GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))} placeholder="All geography" />
                </div>
                <p className="small muted">Every approver must also hold an active Checker profile with Approve on {wf.module ? moduleLabel(wf.module) : "the module"}, within the request's programme and location. The Maker is excluded at decision time.</p>
                <p className={`small ${cands.length ? "" : "neg"}`}>Potential approvers now: {cands.length ? cands.map((u) => fullName(u)).join(", ") : "none"}</p>
              </div>
            );
          })}

        {step === 4 && (
          <div className="form-grid">
            <RadioCards
              name="model"
              label="How stages run"
              value={wf.stages.length > 1 ? "sequential" : wf.model}
              onChange={(v) => set({ model: v as WorkflowTemplate["model"] })}
              options={[
                { value: "single", label: "Single stage", description: "One eligible Checker decides", disabled: wf.stages.length > 1 },
                { value: "sequential", label: "Sequential", description: "Each stage must approve before the next is activated" },
              ]}
            />
            <Checkbox label="Maker is excluded from every stage" checked disabled onChange={() => undefined} description="Separation of duties by user ID. Cannot be switched off" />
            <Checkbox label="A different person must approve each stage" checked={wf.separation.distinctApproverPerStage} onChange={(v) => set({ separation: { makerExcluded: true, distinctApproverPerStage: v } })} />
            <Notice tone="info">Parallel and any-of/all-of stage logic are not offered in this phase. Approval is never automatic: a missing approver leaves the request in Pending assignment.</Notice>
          </div>
        )}

        {step === 5 && (
          <div className="form-grid form-grid--2">
            <Checkbox label="Checkers may return requests for correction" checked={wf.policy.allowReturn} onChange={(v) => set({ policy: { ...wf.policy, allowReturn: v } })} />
            <SelectInput label="After resubmission" value={wf.policy.onResubmit} onChange={(v) => set({ policy: { ...wf.policy, onResubmit: v as WorkflowTemplate["policy"]["onResubmit"] } })} options={[{ value: "restart", label: "Restart from stage 1" }, { value: "resume_returning_stage", label: "Resume at the stage that returned it" }]} disabled={!wf.policy.allowReturn} />
            <SelectInput label="Maker withdrawal" value={wf.policy.allowWithdraw} onChange={(v) => set({ policy: { ...wf.policy, allowWithdraw: v as WorkflowTemplate["policy"]["allowWithdraw"] } })} options={[{ value: "before_decision", label: "Allowed before any Checker decision" }, { value: "never", label: "Not allowed" }]} />
            <Checkbox label="A new request may be raised after rejection" checked={wf.policy.allowNewRequestAfterReject} onChange={(v) => set({ policy: { ...wf.policy, allowNewRequestAfterReject: v } })} description="Rejection is always final for the rejected request" />
            <TextField label="Escalate after (hours past due)" type="number" value={wf.sla.escalateAfterHours?.toString() ?? ""} onChange={(v) => set({ sla: { ...wf.sla, escalateAfterHours: v ? Number(v) : null } })} hint="Blank for no escalation" />
            <SelectInput label="When overdue" value={wf.sla.behaviour} onChange={(v) => set({ sla: { ...wf.sla, behaviour: v as WorkflowTemplate["sla"]["behaviour"] } })} options={[{ value: "notify", label: "Notify approvers" }, { value: "notify_and_flag", label: "Notify and mark Escalated" }]} />
            <MultiSelect label="Escalation recipients (roles)" value={wf.sla.escalationRoleIds} onChange={(v) => set({ sla: { ...wf.sla, escalationRoleIds: v } })} options={acc.roles.filter((r) => r.status === "active").map((r) => ({ value: r.id, label: r.name }))} />
            <SelectInput label="SLA calendar" value={wf.sla.calendar} onChange={(v) => set({ sla: { ...wf.sla, calendar: v as WorkflowTemplate["sla"]["calendar"] } })} options={[{ value: "calendar_hours", label: "Calendar hours" }, { value: "business_hours", label: "Business hours (calendar to be configured)" }]} />
          </div>
        )}

        {step === 6 && (
          <>
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Workflow</dt><dd>{wf.code || "—"} · {wf.name || "—"}</dd></div>
              <div className="kv__row"><dt>Applies to</dt><dd>{wf.module ? moduleLabel(wf.module) : "—"}: {wf.requestTypes.map(typeLabel).join(", ") || "no types"}</dd></div>
              <div className="kv__row"><dt>Conditions</dt><dd>{wf.conditions.length ? wf.conditions.map((c) => `${c.field} ${c.op} ${c.values.join(", ")}`).join("; ") : "None"}</dd></div>
              <div className="kv__row"><dt>Stages</dt><dd>{wf.stages.map((st, i) => `${i + 1}. ${st.name || "Unnamed"} (${MODELS.find((m) => m.value === st.approverModel)?.label})`).join(" → ")}</dd></div>
              <div className="kv__row"><dt>Return / reject</dt><dd>{wf.policy.allowReturn ? `Return allowed, ${wf.policy.onResubmit === "restart" ? "restart" : "resume"} on resubmit` : "No return"}; rejection final</dd></div>
            </dl>
            <PolicyMessages result={{ errors: validation.errors, warnings: validation.warnings }} title="Cannot activate yet" warnTitle="Check before activating" />
            <TextArea label="Reason for this change" required value={reason} onChange={setReason} rows={2} hint="Recorded in the approval audit history" />
            <PolicyMessages result={res} title="Not saved" />
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" onClick={() => save(mode === "edit" && wf.status === "inactive" ? "inactive" : "draft")}>
                <Save size={16} strokeWidth={2} aria-hidden="true" />
                Save as {mode === "edit" && wf.status === "inactive" ? "inactive" : "draft"}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => save("active")} disabled={!validation.ok || wf.confirmationRequired} title={wf.confirmationRequired ? "Business confirmation required" : !validation.ok ? "Resolve the errors above" : undefined}>
                Save and activate
              </button>
            </div>
            {wf.confirmationRequired && <p className="small muted">Activation is disabled while business confirmation is required.</p>}
          </>
        )}
      </Panel>

      <div className="wizard__nav">
        <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)} disabled={step === 0}>
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          Back
        </button>
        {step < STEPS.length - 1 && (
          <button type="button" className="btn btn--dark" onClick={() => go(step + 1)}>
            Next
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
