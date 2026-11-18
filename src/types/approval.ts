/**
 * Maker-Checker approval engine model (Phase 3).
 * Approval status and execution status are separate dimensions: a request can be Approved and
 * still be Awaiting execution, Executing, Executed or Execution failed.
 */
import type { GeographyScope, ModuleId } from "./rbac";

export type Priority = "critical" | "high" | "medium" | "low";

export type ApprovalStatus =
  | "draft"
  | "submitted"
  | "pending_assignment"
  | "pending_approval"
  | "under_review"
  | "returned"
  | "resubmitted"
  | "partially_approved"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "cancelled"
  | "escalated"
  | "expired";

export type ExecutionStatus = "not_applicable" | "awaiting" | "executing" | "executed" | "failed" | "retry_pending";

export type RequestOperation = "create" | "modify" | "deactivate" | "delete" | "transaction";

export type FieldKind = "text" | "number" | "points" | "currency" | "date" | "status" | "percent";

/** One compared field. `before` is null for new records; `after` is null for removals. */
export interface FieldChange {
  key: string;
  label: string;
  kind: FieldKind;
  before: string | number | null;
  after: string | number | null;
  /** Financial or member-status material fields are highlighted to the Checker. */
  material?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  /** Mock attachments have no stored file; preview is metadata only. */
  restricted?: boolean;
}

export interface RequestVersion {
  version: number;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
  attachments: Attachment[];
  submittedAt: string | null;
  submittedBy: string;
  /** Read-only once submitted. */
  locked: boolean;
}

/** Business impact supplied by the originating module. Null means "not available for this request". */
export interface ImpactSummary {
  affectedMembers?: number;
  affectedProgrammes?: string[];
  affectedBranches?: string[];
  financialImpactInr?: number;
  pointsImpact?: number;
  schemeImpact?: string;
  operationalImpact?: string;
  effectiveDate?: string;
  dependencies?: string[];
}

export type StageRunStatus = "waiting" | "active" | "approved" | "returned" | "rejected" | "skipped";

export interface StageRun {
  stageId: string;
  name: string;
  status: StageRunStatus;
  /** Eligible approvers computed when the stage was activated (re-evaluated at decision time). */
  assignedTo: string[];
  activatedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decision: "approved" | "rejected" | "returned" | null;
  remarks: string;
  version: number;
  viewedBy: string[];
  dueAt: string | null;
}

export interface ExecutionAttempt {
  at: string;
  by: string;
  result: "success" | "failure";
  message: string;
}

export interface ExecutionRecord {
  status: ExecutionStatus;
  /** Idempotency key for the backend execution call. One approved version = one key. */
  ref: string | null;
  attempts: ExecutionAttempt[];
  maxAttempts: number;
  retryable: boolean;
  /** Development only: makes the mock adapter fail the first attempt (scenario H). */
  simulate?: "fail_once";
}

export interface HistoryEntry {
  id: string;
  at: string;
  userId: string;
  orgId: string | null;
  action: string;
  stage: string | null;
  version: number;
  remarks: string;
  ref: string;
}

export interface RequestLocation {
  state?: string;
  district?: string;
  branch?: string;
}

export type RoutingIssue = { kind: "no_workflow" | "multiple_workflows" | "workflow_not_approved" | "no_eligible_approver" | "policy_confirmation" | "workflow_inactive"; message: string; workflowIds: string[] };

export interface ApprovalRequest {
  id: string;
  title: string;
  module: ModuleId;
  requestType: string;
  operation: RequestOperation;
  /** Entity the request changes, e.g. a scheme or member reference (masked where personal). */
  entityRef: string;
  programme: string | null;
  location: RequestLocation | null;
  amount: number | null;
  makerId: string;
  makerOrgId: string;
  priority: Priority;
  status: ApprovalStatus;
  execution: ExecutionRecord;
  workflowId: string | null;
  routingIssue: RoutingIssue | null;
  stages: StageRun[];
  currentStage: number;
  versions: RequestVersion[];
  impact: ImpactSummary | null;
  policyId: string | null;
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  escalatedAt: string | null;
  /** Concurrency token: increments on every change. Decisions must quote the value they saw. */
  seq: number;
  history: HistoryEntry[];
  mock: true;
}

/* ---------------- Workflow configuration ---------------- */

export type WorkflowStatus = "draft" | "active" | "inactive";

export type ConditionField = "programme" | "makerOrg" | "makerRole" | "state" | "amount" | "category";

export interface TriggerCondition {
  id: string;
  field: ConditionField;
  op: "in" | "gte" | "lte";
  values: string[];
}

export type ApproverModel = "fixed_user" | "role_group" | "org_group" | "programme_group" | "geography_group";

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  approverModel: ApproverModel;
  fixedUserIds: string[];
  approverOrgIds: string[];
  eligibleRoleIds: string[];
  /** Always the Checker operational profile in this phase. */
  requiredProfile: "checker";
  /** Action permission required on the request's module. */
  requiredAction: "approve";
  programmes: "all" | string[];
  geography: GeographyScope;
  mandatory: boolean;
  remarksOnApprove: "required" | "optional";
  slaHours: number | null;
}

export interface WorkflowTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  module: ModuleId;
  requestTypes: string[];
  makerOrgs: "any" | string[];
  programmes: "all" | string[];
  status: WorkflowStatus;
  /** Set while the routing is an unresolved business interpretation. Blocks activation. */
  confirmationRequired: boolean;
  configNote: string;
  sowRef: string;
  conditions: TriggerCondition[];
  model: "single" | "sequential";
  stages: WorkflowStage[];
  separation: { makerExcluded: true; distinctApproverPerStage: boolean };
  policy: {
    allowReturn: boolean;
    rejectionTerminal: boolean;
    allowNewRequestAfterReject: boolean;
    rejectRemarks: "required";
    returnRemarks: "required";
    allowWithdraw: "before_decision" | "never";
    onResubmit: "restart" | "resume_returning_stage";
    expiryDays: number | null;
  };
  sla: {
    calendar: "calendar_hours" | "business_hours";
    escalateAfterHours: number | null;
    escalationRoleIds: string[];
    behaviour: "notify" | "notify_and_flag" | "backup_approver";
    backupUserIds: string[];
  };
  defaultPriority: Priority;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/* ---------------- Policies, decisions, delegation, notifications, audit ---------------- */

export type PolicyRequirement = "required" | "not_required" | "confirmation_required";

export interface MandatoryApprovalPolicy {
  id: string;
  module: ModuleId;
  requestType: string;
  label: string;
  category: "financial" | "member" | "configuration";
  requirement: PolicyRequirement;
  reasonRequired: boolean;
  sowRef: string;
  note: string;
}

export interface GovernanceDecision {
  id: string;
  question: string;
  context: string;
  sowRef: string;
  workflowIds: string[];
  status: "open" | "proposed" | "confirmed";
  owner: string;
  answer: string;
}

export interface ApprovalDelegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  modules: ModuleId[];
  programmes: "all" | string[];
  geography: GeographyScope;
  startDate: string;
  endDate: string;
  reason: string;
  status: "active" | "revoked";
  createdBy: string;
  createdAt: string;
}

export type ApprovalEvent =
  | "request.created"
  | "request.updated"
  | "request.submitted"
  | "workflow.selected"
  | "routing.exception"
  | "stage.activated"
  | "approver.assigned"
  | "request.viewed"
  | "request.approved"
  | "request.rejected"
  | "request.returned"
  | "request.resubmitted"
  | "stage.completed"
  | "request.withdrawn"
  | "request.escalated"
  | "request.overdue"
  | "approval.delegated"
  | "approval.completed"
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "execution.retried"
  | "admin.override"
  | "decision.blocked"
  | "workflow.changed";

export interface ApprovalNotification {
  id: string;
  event: ApprovalEvent;
  requestId: string;
  module: ModuleId;
  message: string;
  recipientId: string;
  at: string;
  read: boolean;
  link: string;
  /** Channels a future integration may use. Only "portal" is active. */
  channels: ("portal" | "email" | "sms")[];
}

export interface ApprovalAuditEvent {
  id: string;
  requestId: string;
  version: number;
  at: string;
  actorUserId: string;
  actorOrgId: string | null;
  actorProfile: string;
  action: ApprovalEvent;
  module: ModuleId;
  stage: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  previousValue: string | null;
  newValue: string | null;
  remarks: string;
  ref: string;
  override: boolean;
}
