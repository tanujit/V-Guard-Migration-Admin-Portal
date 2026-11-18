/**
 * CENTRAL MAKER-CHECKER APPROVAL ENGINE — pure functions.
 *
 * Every operation takes the approval state, the access snapshot from Phase 2 and an explicit `now`,
 * and returns a new state plus a PolicyResult. Nothing here touches React or storage, so the same
 * logic drives the UI store, the seed scenarios and (as a reference) the future backend.
 *
 * Guarantees enforced here, not in UI components:
 *  - Explicit status transitions (config/approvalCatalogue.ts TRANSITIONS).
 *  - Approver eligibility from RBAC: active account + Checker profile on the module + module
 *    Approve permission + programme/geography scope + stage rules + separation of duties.
 *  - The Maker can never decide their own request, whatever roles they hold.
 *  - Approval and execution are separate; execution never runs twice for one approved version.
 *  - No request is approved because an approver or workflow is missing; it waits in Pending assignment.
 *  - Mandatory approvals cannot be bypassed by administrators.
 */
import { canExecTransition, canTransition, DECIDABLE, PRIORITY, requestTypeById } from "@/config/approvalCatalogue";
import { moduleById } from "@/config/rbacCatalogue";
import { ROLE } from "@/data/mock/rbacSeed";
import { describeScope, fullName, geoCovers, getEffectiveAccess, hasPermission, primaryOrg, type AccessSource, type AccessState, type PolicyResult } from "@/features/access/engine";
import type { ApprovalAuditEvent, ApprovalDelegation, ApprovalEvent, ApprovalNotification, ApprovalRequest, ApprovalStatus, Attachment, ExecutionStatus, FieldChange, GovernanceDecision, ImpactSummary, MandatoryApprovalPolicy, Priority, RequestLocation, StageRun, WorkflowStage, WorkflowTemplate } from "@/types/approval";

export interface ApprovalState {
  requests: ApprovalRequest[];
  workflows: WorkflowTemplate[];
  policies: MandatoryApprovalPolicy[];
  decisions: GovernanceDecision[];
  delegations: ApprovalDelegation[];
  /** Temporary delegation is disabled until the business confirms it is required. */
  delegationEnabled: boolean;
  notifications: ApprovalNotification[];
  audit: ApprovalAuditEvent[];
}

export interface Ctx {
  acc: AccessState;
  now: string;
}

type Out = { state: ApprovalState; result: PolicyResult; id?: string };

const OK: PolicyResult = { ok: true, errors: [], warnings: [] };
const fail = (state: ApprovalState, ...errors: string[]): Out => ({ state, result: { ok: false, errors, warnings: [] } });

/* =====================================================================
   Time helpers (mock clock; ISO "YYYY-MM-DDTHH:mm")
   ===================================================================== */

const toMs = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00` : iso).getTime();
export const hoursBetween = (a: string, b: string) => (toMs(b) - toMs(a)) / 3_600_000;
export function addHours(iso: string, h: number) {
  const d = new Date(toMs(iso) + h * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* =====================================================================
   Lookups & labels
   ===================================================================== */

export const wfById = (s: ApprovalState, id: string | null) => s.workflows.find((w) => w.id === id);
export const reqById = (s: ApprovalState, id: string) => s.requests.find((r) => r.id === id);
export const currentVersion = (r: ApprovalRequest) => r.versions[r.versions.length - 1];
export const lastSubmittedVersion = (r: ApprovalRequest) => [...r.versions].reverse().find((v) => v.locked) ?? r.versions[0];
export const policyFor = (s: ApprovalState, requestType: string) => s.policies.find((p) => p.requestType === requestType);
export const stageDef = (s: ApprovalState, r: ApprovalRequest, i = r.currentStage): WorkflowStage | undefined => wfById(s, r.workflowId)?.stages.find((st) => st.id === r.stages[i]?.stageId);
export const currentRun = (r: ApprovalRequest): StageRun | undefined => r.stages[r.currentStage];

const ctxOf = (r: Pick<ApprovalRequest, "programme" | "location">) => ({ programme: r.programme ?? undefined, geo: r.location ?? undefined });

function actorProfile(acc: AccessState, userId: string) {
  if (userId === "SYSTEM") return "System";
  const a = getEffectiveAccess(acc, userId);
  const names = Array.from(new Set(a.sources.filter((x) => x.effective && x.roleId).map((x) => acc.roles.find((r) => r.id === x.roleId)?.name ?? "")));
  return names.join(", ") || "No active role";
}

const orgOf = (acc: AccessState, userId: string) => (userId === "SYSTEM" ? null : (primaryOrg(acc, userId)?.id ?? null));

/* =====================================================================
   Audit, history, notifications (append-only)
   ===================================================================== */

let seqCounter = 0;
const uid = (prefix: string, n: number) => `${prefix}${String(n).padStart(6, "0")}`;

function pushAudit(s: ApprovalState, ctx: Ctx, r: Pick<ApprovalRequest, "id" | "module"> & { version?: number }, e: { actor: string; action: ApprovalEvent; stage?: string | null; prev?: string | null; next?: string | null; prevValue?: string | null; newValue?: string | null; remarks?: string; override?: boolean }): ApprovalState {
  const n = s.audit.length + 1;
  const ev: ApprovalAuditEvent = {
    id: uid("AAU-", n),
    requestId: r.id,
    version: r.version ?? 1,
    at: ctx.now,
    actorUserId: e.actor,
    actorOrgId: orgOf(ctx.acc, e.actor),
    actorProfile: actorProfile(ctx.acc, e.actor),
    action: e.action,
    module: r.module,
    stage: e.stage ?? null,
    previousStatus: e.prev ?? null,
    newStatus: e.next ?? null,
    previousValue: e.prevValue ?? null,
    newValue: e.newValue ?? null,
    remarks: e.remarks ?? "",
    ref: `ARF-${String(n + 5000)}`,
    override: !!e.override,
  };
  return { ...s, audit: [...s.audit, ev] };
}

function hist(r: ApprovalRequest, ctx: Ctx, userId: string, action: string, remarks = "", stage: string | null = null): ApprovalRequest {
  const n = r.history.length + 1;
  return { ...r, history: [...r.history, { id: `${r.id}-H${n}`, at: ctx.now, userId, orgId: orgOf(ctx.acc, userId), action, stage, version: currentVersion(r).version, remarks, ref: `${r.id}-${String(n).padStart(3, "0")}` }] };
}

/** Central notification abstraction: only the in-portal channel is active; email/SMS are placeholders. */
function notify(s: ApprovalState, ctx: Ctx, r: ApprovalRequest, recipients: string[], event: ApprovalEvent, message: string): ApprovalState {
  const unique = Array.from(new Set(recipients.filter((x) => x && x !== "SYSTEM")));
  if (!unique.length) return s;
  const base = s.notifications.length;
  const items: ApprovalNotification[] = unique.map((recipientId, i) => ({ id: uid("ANT-", base + i + 1), event, requestId: r.id, module: r.module, message, recipientId, at: ctx.now, read: false, link: `/governance/approvals/request/${r.id}`, channels: ["portal"] }));
  return { ...s, notifications: [...s.notifications, ...items] };
}

function put(s: ApprovalState, r: ApprovalRequest): ApprovalState {
  const exists = s.requests.some((x) => x.id === r.id);
  const next = { ...r, seq: r.seq + 1 };
  return { ...s, requests: exists ? s.requests.map((x) => (x.id === r.id ? next : x)) : [...s.requests, next] };
}

function setStatus(r: ApprovalRequest, to: ApprovalStatus): ApprovalRequest {
  if (r.status === to) return r;
  if (!canTransition(r.status, to)) throw new Error(`Invalid transition ${r.status} → ${to}`);
  return { ...r, status: to };
}

function setExec(r: ApprovalRequest, to: ExecutionStatus): ApprovalRequest {
  if (!canExecTransition(r.execution.status, to)) throw new Error(`Invalid execution transition ${r.execution.status} → ${to}`);
  return { ...r, execution: { ...r.execution, status: to } };
}

/* =====================================================================
   RBAC integration: Checker eligibility
   ===================================================================== */

/** The Checker-profile grant that lets a user approve on this module for this record, if any. */
export function checkerSource(acc: AccessState, userId: string, module: string, r: Pick<ApprovalRequest, "programme" | "location">): AccessSource | null {
  const a = getEffectiveAccess(acc, userId);
  const grants = a.grants.get(`${module}:approve`) ?? [];
  const g = grants.find((x) => x.source.kind === "profile" && x.source.roleId === ROLE.CHECKER && (!r.programme || x.source.scope.programmes === "all" || coversProgramme(x.source.scope.programmes, r.programme)) && (!r.location || geoCovers(x.source.scope.geography, r.location)));
  return g?.source ?? null;
}

function activeDelegationsTo(s: ApprovalState, delegateId: string, r: ApprovalRequest, now: string) {
  if (!s.delegationEnabled) return [];
  const day = now.slice(0, 10);
  return s.delegations.filter((d) => d.status === "active" && d.toUserId === delegateId && d.startDate <= day && d.endDate >= day && d.modules.includes(r.module) && (d.programmes === "all" || !r.programme || coversProgramme(d.programmes, r.programme)) && (!r.location || geoCovers(d.geography, r.location)));
}

export interface Eligibility {
  eligible: { userId: string; via: string }[];
  excluded: { userId: string; reason: string }[];
}

/** Who may decide the given stage of the request right now. Evaluated live, never cached. */
export function eligibleApprovers(s: ApprovalState, acc: AccessState, r: ApprovalRequest, stage: WorkflowStage, stageIndex: number, now: string): Eligibility {
  const eligible: Eligibility["eligible"] = [];
  const excluded: Eligibility["excluded"] = [];
  const priorDeciders = new Set(r.stages.slice(0, stageIndex).map((x) => x.decidedBy).filter(Boolean) as string[]);
  const wf = wfById(s, r.workflowId);
  const makers = new Set([r.makerId, ...r.versions.map((v) => v.submittedBy)]);

  // Candidates: anyone holding Approve on the module from any source, plus fixed users and delegates.
  const candidates = new Set<string>([...stage.fixedUserIds, ...s.delegations.filter((d) => d.status === "active").map((d) => d.toUserId)]);
  for (const u of acc.users) {
    const a = getEffectiveAccess(acc, u.id);
    if (a.sources.some((x) => x.keys.includes(`${r.module}:approve`))) candidates.add(u.id);
  }

  for (const userId of candidates) {
    const u = acc.users.find((x) => x.id === userId);
    if (!u) continue;
    const ex = (reason: string) => excluded.push({ userId, reason });
    if (u.accountStatus !== "active") {
      ex(`Account ${u.accountStatus.replace("_", " ")}`);
      continue;
    }
    const delegations = activeDelegationsTo(s, userId, r, now);
    // Assignment model
    if (stage.approverModel === "fixed_user" && !stage.fixedUserIds.includes(userId)) {
      const viaDelegation = delegations.find((d) => stage.fixedUserIds.includes(d.fromUserId));
      if (!viaDelegation) {
        ex("Not a named approver for this stage");
        continue;
      }
    }
    if (stage.approverOrgIds.length && !acc.memberships.some((m) => m.userId === userId && m.status === "active" && stage.approverOrgIds.includes(m.orgId))) {
      ex("Not in the stage's approver organisation");
      continue;
    }
    if (stage.eligibleRoleIds.length) {
      const a = getEffectiveAccess(acc, userId);
      if (!a.sources.some((x) => x.effective && x.roleId && stage.eligibleRoleIds.includes(x.roleId))) {
        ex(`Does not hold ${stage.eligibleRoleIds.map((id) => acc.roles.find((x) => x.id === id)?.name).join(" or ")}`);
        continue;
      }
    }
    // Stage-level scope
    if (r.programme && stage.programmes !== "all" && !coversProgramme(stage.programmes, r.programme)) {
      ex(`Stage limited to ${stage.programmes.join(", ")}`);
      continue;
    }
    if (r.location && !geoCovers(stage.geography, r.location)) {
      ex("Request location is outside the stage's geography");
      continue;
    }
    // RBAC: Checker profile AND module Approve permission within scope — both are required.
    const perm = hasPermission(acc, userId, r.module, "approve", ctxOf(r));
    const checker = checkerSource(acc, userId, r.module, r);
    if (!perm.allowed || !checker) {
      ex(!checker ? `No active Checker profile for ${moduleById.get(r.module)?.label ?? r.module} covering this programme and location` : perm.reason);
      continue;
    }
    // Separation of duties, by stable user identity.
    if (makers.has(userId)) {
      ex("Initiated this request (separation of duties)");
      continue;
    }
    if (wf?.separation.distinctApproverPerStage && priorDeciders.has(userId)) {
      ex("Already approved an earlier stage of this request");
      continue;
    }
    eligible.push({ userId, via: stage.fixedUserIds.includes(userId) || stage.approverModel !== "fixed_user" ? checker.title : `Delegation from ${fullName(acc.users.find((x) => x.id === delegations[0]?.fromUserId))}` });
  }
  return { eligible, excluded };
}

/* =====================================================================
   Visibility & decision authority
   ===================================================================== */

export function canViewRequest(_s: ApprovalState, acc: AccessState, userId: string, r: ApprovalRequest): PolicyResult {
  const a = getEffectiveAccess(acc, userId);
  if (!a.accountActive) return { ok: false, errors: ["Account not active"], warnings: [] };
  if (r.makerId === userId || r.versions.some((v) => v.submittedBy === userId)) return OK;
  if (r.status === "draft") return { ok: false, errors: ["Drafts are visible only to their Maker"], warnings: [] };
  if (r.stages.some((st) => st.assignedTo.includes(userId) || st.decidedBy === userId)) return OK;
  if (checkerSource(acc, userId, r.module, r)) return OK;
  // Organisation-wide reporting: Approval Centre View from a business or platform role, within its scope.
  const view = (a.grants.get("approvals:view") ?? []).find((g) => g.source.kind !== "profile" && (!r.programme || g.source.scope.programmes === "all" || coversProgramme(g.source.scope.programmes, r.programme)) && (!r.location || geoCovers(g.source.scope.geography, r.location)));
  if (view) return OK;
  return { ok: false, errors: ["This request is outside your approval scope (module, programme or location)"], warnings: [] };
}

export type DecisionAction = "approve" | "reject" | "return";

export function canDecide(s: ApprovalState, acc: AccessState, userId: string, r: ApprovalRequest, action: DecisionAction, now: string, expectedSeq?: number): PolicyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!DECIDABLE.includes(r.status)) return { ok: false, errors: [`This request is ${r.status.replace("_", " ")}; there is nothing to decide`], warnings };
  if (expectedSeq !== undefined && expectedSeq !== r.seq) return { ok: false, errors: ["This request changed after you opened it (another decision or update). Reload to see the latest version before deciding"], warnings };
  if (r.makerId === userId || r.versions.some((v) => v.submittedBy === userId)) return { ok: false, errors: ["You submitted this request. A Maker cannot approve, reject or return their own request at any stage, whatever other roles they hold"], warnings };
  const wf = wfById(s, r.workflowId);
  const stage = stageDef(s, r);
  if (!wf || !stage) return { ok: false, errors: ["No workflow stage is active for this request"], warnings };
  if (wf.status !== "active") warnings.push(`Workflow ${wf.code} is ${wf.status}. In-flight requests complete under the configuration they started with`);
  if (action === "return" && !wf.policy.allowReturn) errors.push("This workflow does not allow returning requests for correction");
  const el = eligibleApprovers(s, acc, r, stage, r.currentStage, now);
  if (!el.eligible.some((e) => e.userId === userId)) {
    const why = el.excluded.find((e) => e.userId === userId)?.reason;
    errors.push(why ? `You are not an eligible approver for ${stage.name}: ${why}` : `You are not an eligible approver for ${stage.name}: you hold no Checker profile with Approve on ${moduleById.get(r.module)?.label ?? r.module} for this programme and location`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* =====================================================================
   Workflow resolution & routing
   ===================================================================== */

function conditionMatches(acc: AccessState, r: ApprovalRequest, c: WorkflowTemplate["conditions"][number]) {
  switch (c.field) {
    case "programme":
      return !!r.programme && r.programme.split(" + ").some((p) => c.values.includes(p));
    case "makerOrg":
      return c.values.includes(r.makerOrgId);
    case "makerRole":
      return getEffectiveAccess(acc, r.makerId).sources.some((x) => x.effective && x.roleId && c.values.includes(x.roleId));
    case "state":
      return !!r.location?.state && c.values.includes(r.location.state);
    case "category":
      return c.values.includes(requestTypeById.get(r.requestType)?.category ?? "");
    case "amount": {
      const v = Number(c.values[0]);
      return r.amount !== null && (c.op === "gte" ? r.amount >= v : r.amount <= v);
    }
  }
}

export function workflowMatches(acc: AccessState, wf: WorkflowTemplate, r: ApprovalRequest) {
  return wf.module === r.module && wf.requestTypes.includes(r.requestType) && (wf.makerOrgs === "any" || wf.makerOrgs.includes(r.makerOrgId)) && (wf.programmes === "all" || !r.programme || coversProgramme(wf.programmes, r.programme)) && wf.conditions.every((c) => conditionMatches(acc, r, c));
}

export function resolveWorkflow(s: ApprovalState, acc: AccessState, r: ApprovalRequest): { workflow: WorkflowTemplate | null; issue: ApprovalRequest["routingIssue"] } {
  const matching = s.workflows.filter((w) => w.status !== "inactive" && workflowMatches(acc, w, r));
  const usable = matching.filter((w) => w.status === "active" && !w.confirmationRequired);
  if (usable.length === 1) return { workflow: usable[0], issue: null };
  if (usable.length > 1) {
    const top = Math.max(...usable.map((w) => w.conditions.length));
    const best = usable.filter((w) => w.conditions.length === top);
    if (best.length === 1) return { workflow: best[0], issue: null };
    return { workflow: null, issue: { kind: "multiple_workflows", message: `${best.length} active workflows match this request equally (${best.map((w) => w.code).join(", ")}). A workflow administrator must make one of them more specific`, workflowIds: best.map((w) => w.id) } };
  }
  if (matching.length) {
    const w = matching[0];
    return { workflow: null, issue: { kind: "workflow_not_approved", message: `The matching workflow ${w.code} is ${w.confirmationRequired ? "awaiting business confirmation" : "a draft"} and cannot route requests as an approved business rule${w.configNote ? `: ${w.configNote}` : ""}`, workflowIds: matching.map((x) => x.id) } };
  }
  return { workflow: null, issue: { kind: "no_workflow", message: `No active workflow covers ${requestTypeById.get(r.requestType)?.label ?? r.requestType} for this programme and organisation. Nothing was approved or executed`, workflowIds: [] } };
}

/** Activates stage `index`, assigning eligible approvers; with none, the request waits in Pending assignment. */
function activateStage(s: ApprovalState, ctx: Ctx, r: ApprovalRequest, index: number, actor: string): { state: ApprovalState; r: ApprovalRequest } {
  const wf = wfById(s, r.workflowId)!;
  const def = wf.stages.find((x) => x.id === r.stages[index].stageId)!;
  const el = eligibleApprovers(s, ctx.acc, r, def, index, ctx.now);
  const run: StageRun = { ...r.stages[index], status: "active", activatedAt: ctx.now, assignedTo: el.eligible.map((e) => e.userId), version: currentVersion(r).version, viewedBy: [], dueAt: def.slaHours ? addHours(ctx.now, def.slaHours) : null, decidedAt: null, decidedBy: null, decision: null, remarks: "" };
  let next: ApprovalRequest = { ...r, currentStage: index, stages: r.stages.map((x, i) => (i === index ? run : x)) };
  let st = s;
  if (!el.eligible.length) {
    next = setStatus(next, "pending_assignment");
    next = { ...next, routingIssue: { kind: "no_eligible_approver", message: `${def.name} has no eligible approver. Candidates: ${el.excluded.length ? el.excluded.map((e) => `${fullName(ctx.acc.users.find((u) => u.id === e.userId))} — ${e.reason}`).join("; ") : "none hold a Checker profile with Approve on this module and scope"}`, workflowIds: [wf.id] } };
    next = hist(next, ctx, "SYSTEM", "Pending assignment: no eligible approver", next.routingIssue!.message, def.name);
    st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor: actor, action: "routing.exception", stage: def.name, prev: r.status, next: "pending_assignment", remarks: next.routingIssue!.message });
    const admins = ctx.acc.users.filter((u) => hasPermission(ctx.acc, u.id, "users", "manage").allowed).map((u) => u.id);
    st = notify(st, ctx, next, admins, "routing.exception", `${next.id} needs approver configuration: ${def.name} has no eligible Checker`);
    return { state: st, r: next };
  }
  next = setStatus(next, index === 0 ? "pending_approval" : "partially_approved");
  next = { ...next, routingIssue: null };
  next = hist(next, ctx, "SYSTEM", `${def.name} activated; assigned to ${el.eligible.length} eligible approver${el.eligible.length > 1 ? "s" : ""}`, el.eligible.map((e) => fullName(ctx.acc.users.find((u) => u.id === e.userId))).join(", "), def.name);
  st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor, action: "stage.activated", stage: def.name, prev: r.status, next: next.status });
  st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor: "SYSTEM", action: "approver.assigned", stage: def.name, newValue: el.eligible.map((e) => e.userId).join(", ") });
  st = notify(st, ctx, next, el.eligible.map((e) => e.userId), "approver.assigned", `${next.id} · ${next.title} is waiting for your ${def.name}`);
  return { state: st, r: next };
}

/** Route a submitted or resubmitted request. */
function route(s: ApprovalState, ctx: Ctx, r: ApprovalRequest, actor: string, resumeFrom = 0): { state: ApprovalState; r: ApprovalRequest } {
  const { workflow, issue } = resolveWorkflow(s, ctx.acc, r);
  let st = s;
  if (!workflow) {
    const policy = policyFor(s, r.requestType);
    if (issue?.kind === "no_workflow" && policy?.requirement === "not_required") {
      let next = setStatus({ ...r, routingIssue: null }, "approved");
      next = { ...next, completedAt: ctx.now };
      next = hist(next, ctx, "SYSTEM", "Approval not required by policy", `Policy ${policy.id}`);
      next = setExec(next, "awaiting");
      return { state: pushAudit(st, ctx, next, { actor: "SYSTEM", action: "approval.completed", prev: r.status, next: "approved", remarks: "Approval not required by policy" }), r: next };
    }
    let next = setStatus({ ...r, routingIssue: issue, workflowId: null, stages: [] }, "pending_assignment");
    next = hist(next, ctx, "SYSTEM", "Routing exception", issue!.message);
    st = pushAudit(st, ctx, next, { actor, action: "routing.exception", prev: r.status, next: "pending_assignment", remarks: issue!.message });
    const admins = ctx.acc.users.filter((u) => hasPermission(ctx.acc, u.id, "users", "manage").allowed).map((u) => u.id);
    st = notify(st, ctx, next, admins, "routing.exception", `${next.id} could not be routed: ${issue!.message}`);
    return { state: st, r: next };
  }
  const keepApproved = resumeFrom > 0;
  const stages: StageRun[] = workflow.stages.map((def, i) => (keepApproved && i < resumeFrom ? r.stages[i] : { stageId: def.id, name: def.name, status: "waiting", assignedTo: [], activatedAt: null, decidedAt: null, decidedBy: null, decision: null, remarks: "", version: currentVersion(r).version, viewedBy: [], dueAt: null }));
  let next: ApprovalRequest = { ...r, workflowId: workflow.id, stages, priority: PRIORITY[r.priority].rank <= PRIORITY[workflow.defaultPriority].rank ? r.priority : workflow.defaultPriority };
  next = hist(next, ctx, "SYSTEM", `Workflow ${workflow.code} selected`, workflow.name);
  st = pushAudit(st, ctx, next, { actor: "SYSTEM", action: "workflow.selected", newValue: `${workflow.code} · ${workflow.stages.length} stage(s)` });
  const policy = policyFor(s, r.requestType);
  if (policy?.requirement === "confirmation_required") next = hist(next, ctx, "SYSTEM", "Approval applied as a safeguard", `Policy ${policy.id} awaits business confirmation`);
  return activateStage(st, ctx, next, resumeFrom, actor);
}

/* =====================================================================
   Maker operations
   ===================================================================== */

export interface RequestInput {
  requestType: string;
  title: string;
  entityRef: string;
  programme: string | null;
  location: RequestLocation | null;
  amount: number | null;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
  attachments: Attachment[];
  impact: ImpactSummary | null;
  priority?: Priority;
}

/** Maker authority: a Maker profile with Submit on the module, within the record's programme and location. */
/** A request can cover several programmes ("EP + Retailer"); a scope must include every one of them. */
export function coversProgramme(scope: "all" | string[], programme: string | null) {
  return !programme || scope === "all" || programme.split(" + ").every((p) => scope.includes(p));
}

export function canMake(acc: AccessState, userId: string, module: string, r: Pick<ApprovalRequest, "programme" | "location">): PolicyResult {
  const a = getEffectiveAccess(acc, userId);
  if (!a.accountActive) return { ok: false, errors: ["Account not active"], warnings: [] };
  const g = (a.grants.get(`${module}:submit`) ?? []).find((x) => x.source.kind === "profile" && x.source.roleId === ROLE.MAKER && (!r.programme || x.source.scope.programmes === "all" || coversProgramme(x.source.scope.programmes, r.programme)) && (!r.location || geoCovers(x.source.scope.geography, r.location)));
  return g ? OK : { ok: false, errors: [`You need an active Maker profile with Submit on ${moduleById.get(module)?.label ?? module} covering this programme and location`], warnings: [] };
}

export function opCreate(s: ApprovalState, ctx: Ctx, actor: string, input: RequestInput): Out {
  const type = requestTypeById.get(input.requestType);
  if (!type) return fail(s, "Unknown request type");
  const may = canMake(ctx.acc, actor, type.module, input);
  if (!may.ok) return { state: s, result: may };
  const missing = [!input.title.trim() && "Give the request a title", !input.entityRef.trim() && "Enter the reference of the record being changed"].filter(Boolean) as string[];
  if (missing.length) return fail(s, ...missing);
  const n = s.requests.length + 1;
  const id = `APR-2026-${String(n + 1200).padStart(6, "0")}`;
  const org = primaryOrg(ctx.acc, actor)?.id ?? "";
  let r: ApprovalRequest = {
    id,
    title: input.title,
    module: type.module,
    requestType: type.id,
    operation: type.operation,
    entityRef: input.entityRef,
    programme: input.programme,
    location: input.location,
    amount: input.amount,
    makerId: actor,
    makerOrgId: org,
    priority: input.priority ?? "medium",
    status: "draft",
    execution: { status: "not_applicable", ref: null, attempts: [], maxAttempts: 3, retryable: true },
    workflowId: null,
    routingIssue: null,
    stages: [],
    currentStage: 0,
    versions: [{ version: 1, fields: input.fields, purpose: input.purpose, reason: input.reason, justification: input.justification, attachments: input.attachments, submittedAt: null, submittedBy: actor, locked: false }],
    impact: input.impact,
    policyId: policyFor(s, type.id)?.id ?? null,
    createdAt: ctx.now,
    submittedAt: null,
    updatedAt: ctx.now,
    completedAt: null,
    escalatedAt: null,
    seq: 0,
    history: [],
    mock: true,
  };
  r = hist(r, ctx, actor, "Draft created");
  let st = put(s, r);
  st = pushAudit(st, ctx, r, { actor, action: "request.created", next: "draft" });
  return { state: st, result: OK, id };
}

/** Edits the Maker's working version (draft, or the new version after a return). Submitted versions are read-only. */
export function opUpdateWorking(s: ApprovalState, ctx: Ctx, actor: string, id: string, patch: Partial<Pick<RequestInput, "title" | "fields" | "purpose" | "reason" | "justification" | "attachments" | "amount" | "impact">>): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  if (r.makerId !== actor) return fail(s, "Only the Maker can edit this request");
  if (!["draft", "returned"].includes(r.status)) return fail(s, "Submitted versions are read-only. Edits are possible only on drafts or after a return for correction");
  const v = currentVersion(r);
  if (v.locked) return fail(s, "This version is locked");
  const nv = { ...v, ...("fields" in patch && patch.fields ? { fields: patch.fields } : {}), ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}), ...(patch.reason !== undefined ? { reason: patch.reason } : {}), ...(patch.justification !== undefined ? { justification: patch.justification } : {}), ...(patch.attachments ? { attachments: patch.attachments } : {}) };
  let next: ApprovalRequest = { ...r, title: patch.title ?? r.title, amount: patch.amount !== undefined ? patch.amount : r.amount, impact: patch.impact !== undefined ? patch.impact : r.impact, versions: [...r.versions.slice(0, -1), nv], updatedAt: ctx.now };
  next = hist(next, ctx, actor, `Version ${nv.version} edited`);
  let st = put(s, next);
  st = pushAudit(st, ctx, { ...next, version: nv.version }, { actor, action: "request.updated", prev: r.status, next: r.status });
  return { state: st, result: OK, id };
}

function validateSubmission(s: ApprovalState, ctx: Ctx, actor: string, r: ApprovalRequest): string[] {
  const errors: string[] = [];
  const v = currentVersion(r);
  if (r.makerId !== actor) errors.push("Only the Maker can submit this request");
  const may = canMake(ctx.acc, actor, r.module, r);
  if (!may.ok) errors.push(...may.errors);
  if (!r.title.trim()) errors.push("Give the request a title");
  if (!v.fields.some((f) => f.before !== f.after)) errors.push("Nothing changes: at least one proposed value must differ from the current value");
  const policy = policyFor(s, r.requestType);
  if ((policy?.reasonRequired ?? true) && !v.reason.trim()) errors.push("A reason is mandatory for this type of request");
  if (!v.purpose.trim()) errors.push("Describe the business purpose");
  const dup = s.requests.find((x) => x.id !== r.id && x.requestType === r.requestType && x.entityRef === r.entityRef && !["draft", "approved", "rejected", "withdrawn", "cancelled", "expired"].includes(x.status));
  if (dup) errors.push(`Duplicate: ${dup.id} is already open for ${r.entityRef}. Withdraw it or wait for its decision`);
  return errors;
}

export function opSubmit(s: ApprovalState, ctx: Ctx, actor: string, id: string): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  if (r.status !== "draft") return fail(s, "Only drafts can be submitted; returned requests are resubmitted");
  const errors = validateSubmission(s, ctx, actor, r);
  if (errors.length) return fail(s, ...errors);
  const v = { ...currentVersion(r), submittedAt: ctx.now, locked: true };
  let next = setStatus({ ...r, versions: [...r.versions.slice(0, -1), v], submittedAt: ctx.now, updatedAt: ctx.now }, "submitted");
  next = hist(next, ctx, actor, `Version ${v.version} submitted`, v.reason);
  let st = pushAudit(s, ctx, { ...next, version: v.version }, { actor, action: "request.submitted", prev: "draft", next: "submitted", remarks: v.reason });
  const routed = route(st, ctx, next, actor);
  st = put(routed.state, routed.r);
  st = notify(st, ctx, routed.r, [actor], "request.submitted", `${id} submitted · ${routed.r.status === "pending_assignment" ? "waiting for routing" : "routed for approval"}`);
  return { state: st, result: { ok: true, errors: [], warnings: routed.r.routingIssue ? [routed.r.routingIssue.message] : [] }, id };
}

export function opResubmit(s: ApprovalState, ctx: Ctx, actor: string, id: string): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  if (r.status !== "returned") return fail(s, "Only requests returned for correction can be resubmitted");
  const errors = validateSubmission(s, ctx, actor, r);
  const prev = lastSubmittedVersion(r);
  const v = currentVersion(r);
  if (JSON.stringify(prev.fields) === JSON.stringify(v.fields) && prev.reason === v.reason && prev.justification === v.justification && JSON.stringify(prev.attachments) === JSON.stringify(v.attachments)) errors.push(`Version ${v.version} is identical to version ${prev.version}. Address the Checker's remarks before resubmitting`);
  if (errors.length) return fail(s, ...errors);
  const wf = wfById(s, r.workflowId);
  const returnedAt = r.stages.findIndex((x) => x.decision === "returned");
  const resumeFrom = wf?.policy.onResubmit === "resume_returning_stage" && returnedAt > 0 ? returnedAt : 0;
  const locked = { ...v, submittedAt: ctx.now, locked: true };
  let next = setStatus({ ...r, versions: [...r.versions.slice(0, -1), locked], updatedAt: ctx.now }, "resubmitted");
  next = hist(next, ctx, actor, `Version ${locked.version} resubmitted`, `${resumeFrom ? `Resumes at stage ${resumeFrom + 1}` : "Approval restarts from stage 1"} under workflow policy`);
  let st = pushAudit(s, ctx, { ...next, version: locked.version }, { actor, action: "request.resubmitted", prev: "returned", next: "resubmitted", remarks: v.reason });
  const routed = route(st, ctx, next, actor, resumeFrom);
  st = put(routed.state, routed.r);
  return { state: st, result: OK, id };
}

export function opWithdraw(s: ApprovalState, ctx: Ctx, actor: string, id: string, reason: string): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  const isAdmin = hasPermission(ctx.acc, actor, "users", "manage").allowed;
  if (r.makerId !== actor && !isAdmin) return fail(s, "Only the Maker or a workflow administrator can withdraw a request");
  if (!reason.trim()) return fail(s, "Give a reason for withdrawing");
  const wf = wfById(s, r.workflowId);
  if (wf?.policy.allowWithdraw === "never" && r.makerId === actor) return fail(s, "This workflow does not allow withdrawal");
  const decisionStarted = r.stages.some((x) => x.decision === "approved") || r.status === "under_review" || r.status === "partially_approved";
  if (decisionStarted) return fail(s, "A Checker decision has already started. The request can no longer be withdrawn; ask the Checker to return or reject it");
  if (!canTransition(r.status, "withdrawn")) return fail(s, `A ${r.status.replace("_", " ")} request cannot be withdrawn`);
  let next = setStatus({ ...r, updatedAt: ctx.now, completedAt: ctx.now }, "withdrawn");
  next = hist(next, ctx, actor, "Withdrawn", reason);
  let st = put(s, next);
  st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor, action: "request.withdrawn", prev: r.status, next: "withdrawn", remarks: reason });
  st = notify(st, ctx, next, currentRun(r)?.assignedTo ?? [], "request.withdrawn", `${id} was withdrawn`);
  return { state: st, result: OK, id };
}

/* =====================================================================
   Checker operations
   ===================================================================== */

/** Records that an eligible approver opened the request (status Under review at stage 1). */
export function opView(s: ApprovalState, ctx: Ctx, actor: string, id: string): Out {
  const r = reqById(s, id);
  if (!r || !DECIDABLE.includes(r.status)) return { state: s, result: OK };
  const run = currentRun(r);
  if (!run || run.viewedBy.includes(actor) || !run.assignedTo.includes(actor)) return { state: s, result: OK };
  let next: ApprovalRequest = { ...r, stages: r.stages.map((x, i) => (i === r.currentStage ? { ...x, viewedBy: [...x.viewedBy, actor] } : x)) };
  if (r.status === "pending_approval") next = setStatus(next, "under_review");
  next = hist(next, ctx, actor, "Opened for review", "", run.name);
  let st = put(s, next);
  st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor, action: "request.viewed", stage: run.name, prev: r.status, next: next.status });
  return { state: st, result: OK, id };
}

export function opDecide(s: ApprovalState, ctx: Ctx, actor: string, id: string, action: DecisionAction, remarks: string, expectedSeq?: number): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  const check = canDecide(s, ctx.acc, actor, r, action, ctx.now, expectedSeq);
  const wf = wfById(s, r.workflowId);
  const def = stageDef(s, r);
  const errors = [...check.errors];
  if (action !== "approve" && !remarks.trim()) errors.push(action === "reject" ? "A rejection reason is mandatory" : "Explain what the Maker must correct");
  if (action === "approve" && def?.remarksOnApprove === "required" && !remarks.trim()) errors.push(`${def.name} requires approval remarks`);
  if (errors.length) {
    const st = pushAudit(s, ctx, { ...r, version: currentVersion(r).version }, { actor, action: "decision.blocked", stage: def?.name ?? null, prev: r.status, next: r.status, newValue: `Attempted ${action}`, remarks: errors.join("; ") });
    return { state: st, result: { ok: false, errors, warnings: check.warnings } };
  }
  const run = currentRun(r)!;
  const decided: StageRun = { ...run, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned", decision: action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned", decidedAt: ctx.now, decidedBy: actor, remarks };
  let next: ApprovalRequest = { ...r, stages: r.stages.map((x, i) => (i === r.currentStage ? decided : x)), updatedAt: ctx.now };
  let st = s;
  const version = currentVersion(r).version;
  const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Returned for correction";
  next = hist(next, ctx, actor, `${label} at ${run.name}`, remarks, run.name);
  st = pushAudit(st, ctx, { ...next, version }, { actor, action: action === "approve" ? "request.approved" : action === "reject" ? "request.rejected" : "request.returned", stage: run.name, prev: r.status, remarks });

  if (action === "approve") {
    st = pushAudit(st, ctx, { ...next, version }, { actor, action: "stage.completed", stage: run.name });
    const nextIndex = r.currentStage + 1;
    if (wf && nextIndex < wf.stages.length) {
      next = hist(next, ctx, "SYSTEM", `Stage ${nextIndex + 1} activated`, "", wf.stages[nextIndex].name);
      const out = activateStage(st, ctx, next, nextIndex, actor);
      st = out.state;
      next = out.r;
      st = notify(st, ctx, next, [r.makerId], "stage.completed", `${id}: ${run.name} approved; ${wf.stages[nextIndex].name} is next`);
    } else {
      next = setStatus(next, "approved");
      next = { ...next, completedAt: ctx.now };
      next = setExec(next, "awaiting");
      next = { ...next, execution: { ...next.execution, ref: `EXE-${id}-V${version}` } };
      next = hist(next, ctx, "SYSTEM", "All required stages approved; handed to execution", `Idempotency key ${next.execution.ref}`);
      st = pushAudit(st, ctx, { ...next, version }, { actor, action: "approval.completed", prev: r.status, next: "approved", newValue: `Execution ${next.execution.ref}` });
      st = notify(st, ctx, next, [r.makerId], "approval.completed", `${id} approved · awaiting execution`);
    }
  } else if (action === "reject") {
    next = setStatus(next, "rejected");
    next = { ...next, completedAt: ctx.now };
    st = notify(st, ctx, next, [r.makerId], "request.rejected", `${id} rejected: ${remarks}`);
  } else {
    next = setStatus(next, "returned");
    // Working copy for the Maker: a new, editable version. The submitted version stays read-only.
    const prev = currentVersion(next);
    next = { ...next, versions: [...next.versions, { ...prev, version: prev.version + 1, submittedAt: null, locked: false }] };
    st = notify(st, ctx, next, [r.makerId], "request.returned", `${id} returned for correction: ${remarks}`);
  }
  // Every decision, of whatever kind, is attached to the version it was taken on.
  const lastAudit = st.audit[st.audit.length - 1];
  st = { ...st, audit: st.audit.map((a) => (a === lastAudit ? { ...a, newStatus: next.status } : a)) };
  return { state: put(st, next), result: { ok: true, errors: [], warnings: check.warnings }, id };
}

/* =====================================================================
   Execution (separate from approval)
   ===================================================================== */

export function canOperateExecution(acc: AccessState, userId: string, module: string): PolicyResult {
  if (userId === "SYSTEM") return OK;
  const mod = moduleById.get(module);
  const exec = mod?.actions.includes("execute") ? hasPermission(acc, userId, module, "execute").allowed : false;
  return exec || hasPermission(acc, userId, "users", "manage").allowed ? OK : { ok: false, errors: ["Only operators with Execute on the module, or platform administrators, can run or retry execution"], warnings: [] };
}

export function opExecStart(s: ApprovalState, ctx: Ctx, actor: string, id: string): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  if (r.status !== "approved") return fail(s, "Only approved requests can be executed");
  if (r.execution.status === "executing") return fail(s, `Execution already in progress under ${r.execution.ref}. Duplicate execution is blocked`);
  if (r.execution.status === "executed") return fail(s, `Already executed under ${r.execution.ref}. The same approved version is never executed twice`);
  if (r.execution.attempts.length >= r.execution.maxAttempts) return fail(s, `Retry limit reached (${r.execution.maxAttempts} attempts). Investigate the failure; a changed payload needs a new approval request`);
  const may = canOperateExecution(ctx.acc, actor, r.module);
  if (!may.ok) return { state: s, result: may };
  const retry = r.execution.status === "failed" || r.execution.status === "retry_pending";
  let next = r;
  if (r.execution.status === "failed") next = setExec(next, "retry_pending");
  next = setExec(next, "executing");
  next = hist({ ...next, updatedAt: ctx.now }, ctx, actor, retry ? `Execution retried (attempt ${r.execution.attempts.length + 1})` : "Execution started", `Key ${r.execution.ref}`);
  let st = put(s, next);
  st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor, action: retry ? "execution.retried" : "execution.started", prev: r.execution.status, next: "executing", newValue: r.execution.ref });
  return { state: st, result: OK, id };
}

export function opExecFinish(s: ApprovalState, ctx: Ctx, actor: string, id: string, outcome: { ok: boolean; message: string }): Out {
  const r = reqById(s, id);
  if (!r || r.execution.status !== "executing") return fail(s, "No execution in progress");
  let next = setExec(r, outcome.ok ? "executed" : "failed");
  next = { ...next, updatedAt: ctx.now, execution: { ...next.execution, attempts: [...next.execution.attempts, { at: ctx.now, by: actor, result: outcome.ok ? "success" : "failure", message: outcome.message }] } };
  next = hist(next, ctx, "SYSTEM", outcome.ok ? "Executed" : "Execution failed (approval decision unchanged)", outcome.message);
  let st = put(s, next);
  st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor: "SYSTEM", action: outcome.ok ? "execution.completed" : "execution.failed", prev: "executing", next: next.execution.status, remarks: outcome.message });
  st = notify(st, ctx, next, [r.makerId, ...r.stages.map((x) => x.decidedBy ?? "")], outcome.ok ? "execution.completed" : "execution.failed", `${id} ${outcome.ok ? "executed" : `execution failed: ${outcome.message}`}`);
  return { state: st, result: outcome.ok ? OK : { ok: false, errors: [outcome.message], warnings: [] }, id };
}

/* =====================================================================
   Administration: re-routing, SLA, override, workflows, policies, delegation
   ===================================================================== */

export const isWorkflowAdmin = (acc: AccessState, userId: string) => hasPermission(acc, userId, "users", "manage").allowed;

/** Re-evaluate routing for a waiting request after configuration or access changes. Never bypasses policy. */
export function opReroute(s: ApprovalState, ctx: Ctx, actor: string, id: string): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  if (!isWorkflowAdmin(ctx.acc, actor)) return fail(s, "Only workflow administrators can re-run routing");
  if (!["pending_assignment", "pending_approval", "partially_approved", "escalated", "under_review"].includes(r.status)) return fail(s, "Only waiting requests can be re-routed");
  let st = s;
  let next: ApprovalRequest;
  if (!r.workflowId || r.routingIssue?.kind !== "no_eligible_approver") {
    const out = route(st, ctx, hist(r, ctx, actor, "Routing re-run by administrator"), actor);
    st = out.state;
    next = out.r;
  } else {
    const out = activateStage(st, ctx, hist(r, ctx, actor, "Approver assignment re-run by administrator"), r.currentStage, actor);
    st = out.state;
    next = out.r;
  }
  return { state: put(st, next), result: next.routingIssue ? { ok: false, errors: [next.routingIssue.message], warnings: [] } : OK, id };
}

/** Mock SLA check: flags overdue stages, escalates per workflow policy, notifies. Never approves or skips a stage. */
export function opRunSla(s: ApprovalState, ctx: Ctx): { state: ApprovalState; escalated: number; overdue: number } {
  let st = s;
  let escalated = 0;
  let overdue = 0;
  for (const r of s.requests) {
    const run = currentRun(r);
    if (!run?.dueAt || !["pending_approval", "under_review", "partially_approved"].includes(r.status) || run.dueAt > ctx.now) continue;
    overdue++;
    const wf = wfById(st, r.workflowId);
    const hoursOver = Math.round(hoursBetween(run.dueAt, ctx.now));
    if (wf?.sla.escalateAfterHours !== null && wf && hoursBetween(run.dueAt, ctx.now) >= (wf.sla.escalateAfterHours ?? 0) && wf.sla.behaviour !== "notify") {
      let next = setStatus({ ...r, escalatedAt: ctx.now }, "escalated");
      next = hist(next, ctx, "SYSTEM", "Escalated (SLA exceeded)", `${hoursOver}h past due at ${run.name}. No stage is skipped and nothing is auto-approved`, run.name);
      st = put(st, next);
      st = pushAudit(st, ctx, { ...next, version: currentVersion(next).version }, { actor: "SYSTEM", action: "request.escalated", stage: run.name, prev: r.status, next: "escalated" });
      const escalationUsers = ctx.acc.users.filter((u) => getEffectiveAccess(ctx.acc, u.id).sources.some((x) => x.effective && x.roleId && wf.sla.escalationRoleIds.includes(x.roleId))).map((u) => u.id);
      st = notify(st, ctx, next, [...run.assignedTo, ...escalationUsers], "request.escalated", `${r.id} escalated: ${hoursOver}h past SLA at ${run.name}`);
      escalated++;
    } else {
      st = pushAudit(st, ctx, { ...r, version: currentVersion(r).version }, { actor: "SYSTEM", action: "request.overdue", stage: run.name, remarks: `${hoursOver}h past due` });
      st = notify(st, ctx, r, run.assignedTo, "request.overdue", `${r.id} is ${hoursOver}h past its SLA`);
    }
  }
  return { state: st, escalated, overdue };
}

/** Administrative override. Mandatory approvals can never be bypassed; the attempt is audited. */
export function opOverrideAttempt(s: ApprovalState, ctx: Ctx, actor: string, id: string, reason: string): Out {
  const r = reqById(s, id);
  if (!r) return fail(s, "Request not found");
  const policy = policyFor(s, r.requestType);
  const errors: string[] = [];
  if (!reason.trim()) errors.push("An override needs a mandatory reason");
  if (!policy || policy.requirement !== "not_required") errors.push(`${policy?.label ?? "This action"} is ${policy?.requirement === "confirmation_required" ? "pending business confirmation and treated as approval required" : "marked Approval required"}. No administrative role can bypass Maker-Checker; an emergency override permission has not been configured`);
  const st = pushAudit(s, ctx, { ...r, version: currentVersion(r).version }, { actor, action: "admin.override", prev: r.status, next: r.status, remarks: `Blocked override attempt: ${reason || "no reason"}`, override: true });
  return { state: st, result: { ok: false, errors, warnings: [] } };
}

/** Potential approvers for a stage, independent of any request (used to validate workflows). */
export function stageCandidates(acc: AccessState, wf: WorkflowTemplate, stage: WorkflowStage) {
  return acc.users.filter((u) => {
    if (u.accountStatus !== "active") return false;
    if (stage.approverModel === "fixed_user" && !stage.fixedUserIds.includes(u.id)) return false;
    if (stage.approverOrgIds.length && !acc.memberships.some((m) => m.userId === u.id && m.status === "active" && stage.approverOrgIds.includes(m.orgId))) return false;
    const a = getEffectiveAccess(acc, u.id);
    if (stage.eligibleRoleIds.length && !a.sources.some((x) => x.effective && x.roleId && stage.eligibleRoleIds.includes(x.roleId))) return false;
    return (a.grants.get(`${wf.module}:approve`) ?? []).some((g) => g.source.kind === "profile" && g.source.roleId === ROLE.CHECKER);
  });
}

export function validateWorkflow(s: ApprovalState, acc: AccessState, wf: WorkflowTemplate): PolicyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!wf.name.trim()) errors.push("Workflow name is required");
  if (!/^[A-Z0-9_-]{3,32}$/.test(wf.code)) errors.push("Workflow code: 3–32 capitals, digits, - or _");
  if (s.workflows.some((w) => w.code === wf.code && w.id !== wf.id)) errors.push("Workflow code already used");
  if (!wf.requestTypes.length) errors.push("Choose at least one request type");
  if (!wf.stages.length) errors.push("A workflow needs at least one approval stage");
  if (wf.model === "single" && wf.stages.length > 1) errors.push("Single-stage model allows one stage; switch to sequential");
  wf.stages.forEach((st, i) => {
    const label = `Stage ${i + 1}${st.name ? ` (${st.name})` : ""}`;
    if (!st.name.trim()) errors.push(`${label}: name is required`);
    if (st.approverModel === "fixed_user" && !st.fixedUserIds.length) errors.push(`${label}: choose at least one named approver`);
    if (st.approverModel === "org_group" && !st.approverOrgIds.length) errors.push(`${label}: choose the approver organisation`);
    if (st.approverModel === "role_group" && !st.eligibleRoleIds.length) errors.push(`${label}: choose eligible roles`);
    if (st.approverModel === "programme_group" && st.programmes === "all") warnings.push(`${label}: programme-based group with all programmes behaves like a module-wide group`);
    if (st.approverModel === "geography_group" && st.geography.mode === "all") warnings.push(`${label}: geography-based group with all geography behaves like a module-wide group`);
    const cands = stageCandidates(acc, wf, st);
    if (!cands.length) errors.push(`${label}: no eligible approver. Nobody holds an active Checker profile with Approve on ${moduleById.get(wf.module)?.label} that also meets this stage's rules`);
    const prevCands = i > 0 ? stageCandidates(acc, wf, wf.stages[i - 1]) : [];
    if (wf.separation.distinctApproverPerStage && cands.length === 1 && prevCands.length > 0 && prevCands.every((c) => c.id === cands[0].id)) warnings.push(`${label}: the only candidate also approves the previous stage; distinct-approver rule may block it`);
  });
  const overlap = s.workflows.filter((w) => w.id !== wf.id && w.status === "active" && w.module === wf.module && w.requestTypes.some((t) => wf.requestTypes.includes(t)) && JSON.stringify(w.conditions) === JSON.stringify(wf.conditions));
  if (overlap.length) warnings.push(`Overlaps active workflow ${overlap.map((w) => w.code).join(", ")} with identical conditions; requests matching both will stop at routing`);
  if (wf.confirmationRequired) warnings.push("Marked Business confirmation required: it cannot be activated until the governance decision is confirmed");
  return { ok: errors.length === 0, errors, warnings };
}

export function opSaveWorkflow(s: ApprovalState, ctx: Ctx, actor: string, wf: WorkflowTemplate, reason: string): Out {
  if (!isWorkflowAdmin(ctx.acc, actor)) return fail(s, "Only Evolve platform administrators configure approval workflows");
  const v = validateWorkflow(s, ctx.acc, wf);
  const errors = wf.status === "active" ? [...v.errors] : v.errors.filter((e) => !e.includes("no eligible approver") && !e.includes("needs at least one approval stage"));
  if (wf.status === "active" && wf.confirmationRequired) errors.push("Cannot activate: business confirmation is still required for this routing");
  if (errors.length) return { state: s, result: { ok: false, errors, warnings: v.warnings } };
  const exists = s.workflows.some((w) => w.id === wf.id);
  const prev = s.workflows.find((w) => w.id === wf.id);
  const saved = { ...wf, updatedAt: ctx.now, updatedBy: actor, ...(exists ? {} : { createdAt: ctx.now, createdBy: actor }) };
  const pending = s.requests.filter((r) => r.workflowId === wf.id && ["pending_approval", "under_review", "partially_approved", "escalated"].includes(r.status)).length;
  let st: ApprovalState = { ...s, workflows: exists ? s.workflows.map((w) => (w.id === wf.id ? saved : w)) : [...s.workflows, saved] };
  st = pushAudit(st, ctx, { id: wf.id, module: wf.module }, { actor, action: "workflow.changed", prev: prev?.status ?? null, next: saved.status, prevValue: prev ? `${prev.stages.length} stage(s)` : null, newValue: `${saved.code} · ${saved.stages.length} stage(s) · ${saved.status}`, remarks: reason });
  return { state: st, result: { ok: true, errors: [], warnings: pending ? [...v.warnings, `${pending} in-flight request(s) keep their current routing; new submissions use this version`] : v.warnings }, id: wf.id };
}

export function opSavePolicy(s: ApprovalState, ctx: Ctx, actor: string, id: string, patch: Pick<MandatoryApprovalPolicy, "requirement" | "reasonRequired" | "note">, reason: string): Out {
  if (!isWorkflowAdmin(ctx.acc, actor)) return fail(s, "Only Evolve platform administrators change approval policies");
  if (!reason.trim()) return fail(s, "Give a reason for the policy change");
  const p = s.policies.find((x) => x.id === id);
  if (!p) return fail(s, "Policy not found");
  if (p.category !== "configuration" && patch.requirement === "not_required") return fail(s, "The SOW requires a second-person approval with a reason for money-related and member-status actions; these cannot be set to Approval not required");
  let st = { ...s, policies: s.policies.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  st = pushAudit(st, ctx, { id, module: p.module }, { actor, action: "workflow.changed", prevValue: `${p.label}: ${p.requirement}`, newValue: `${p.label}: ${patch.requirement}`, remarks: reason });
  return { state: st, result: OK, id };
}

export function opSaveDelegation(s: ApprovalState, ctx: Ctx, actor: string, d: Omit<ApprovalDelegation, "id" | "status" | "createdBy" | "createdAt">): Out {
  const errors: string[] = [];
  if (!s.delegationEnabled) errors.push("Temporary delegation is disabled until the business confirms it is required");
  if (actor !== d.fromUserId && !isWorkflowAdmin(ctx.acc, actor)) errors.push("Only the approver themself or a workflow administrator can create a delegation");
  if (d.fromUserId === d.toUserId) errors.push("A user cannot delegate to themself");
  if (!d.modules.length) errors.push("Choose at least one module");
  if (d.endDate < d.startDate) errors.push("End date is before start date");
  if (!d.reason.trim()) errors.push("Give a reason");
  for (const m of d.modules) {
    const probe = { programme: d.programmes === "all" ? null : d.programmes[0] ?? null, location: null };
    if (!checkerSource(ctx.acc, d.fromUserId, m, probe)) errors.push(`${fullName(ctx.acc.users.find((u) => u.id === d.fromUserId))} holds no Checker authority on ${moduleById.get(m)?.label} to delegate`);
    if (!checkerSource(ctx.acc, d.toUserId, m, probe)) errors.push(`${fullName(ctx.acc.users.find((u) => u.id === d.toUserId))} does not independently hold a Checker profile with Approve on ${moduleById.get(m)?.label}. Delegation never grants authority`);
  }
  if (errors.length) return { state: s, result: { ok: false, errors, warnings: [] } };
  const id = `DLG-${String(s.delegations.length + 1).padStart(4, "0")}`;
  let st: ApprovalState = { ...s, delegations: [...s.delegations, { ...d, id, status: "active", createdBy: actor, createdAt: ctx.now }] };
  st = pushAudit(st, ctx, { id, module: d.modules[0] }, { actor, action: "approval.delegated", newValue: `${d.fromUserId} → ${d.toUserId} · ${d.modules.join(", ")} · ${describeScope({ programmes: d.programmes, geography: d.geography }).programmes} · ${d.startDate}–${d.endDate}`, remarks: d.reason });
  return { state: st, result: { ok: true, errors: [], warnings: ["Delegation applies only to stages with named approvers; group-based stages already include every eligible Checker"] }, id };
}

/* =====================================================================
   Derived metrics
   ===================================================================== */

export function ageHours(r: ApprovalRequest, now: string) {
  return r.submittedAt ? hoursBetween(r.submittedAt, r.completedAt ?? now) : 0;
}

export function stageAgeHours(r: ApprovalRequest, now: string) {
  const run = currentRun(r);
  return run?.activatedAt ? hoursBetween(run.activatedAt, run.decidedAt ?? now) : 0;
}

export function isOverdue(r: ApprovalRequest, now: string) {
  const run = currentRun(r);
  return r.status === "escalated" || (!!run?.dueAt && ["pending_approval", "under_review", "partially_approved"].includes(r.status) && run.dueAt < now);
}

export function formatAge(hours: number) {
  if (hours < 1) return "under 1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function fieldsChanged(a: FieldChange[], b: FieldChange[]) {
  return b.filter((f) => {
    const p = a.find((x) => x.key === f.key);
    return !p || p.after !== f.after;
  }).map((f) => f.key);
}

export { seqCounter };
