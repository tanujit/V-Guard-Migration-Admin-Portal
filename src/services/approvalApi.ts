/**
 * Approval engine API contract — PLACEHOLDER for backend integration.
 *
 * Future modules (Wallet, Scheme Builder, Member management, …) submit change requests through
 * `submitChangeRequest`; they never write approval state directly. The Approval Centre reads and
 * decides through the same contract. No endpoints are defined because none have been agreed.
 * The backend MUST enforce the rules in features/approvals/engine.ts — eligibility from RBAC,
 * separation of duties, explicit transitions, the concurrency token and idempotent execution.
 */
import type { PolicyResult } from "@/features/access/engine";
import type { DecisionAction, RequestInput } from "@/features/approvals/engine";
import * as store from "@/features/approvals/store";
import type { ApprovalAuditEvent, ApprovalRequest, WorkflowTemplate } from "@/types/approval";
import { ApiNotConnectedError } from "./api";

export interface ApprovalApi {
  /** Called by an originating module with the before/after values it owns. */
  submitChangeRequest(actorId: string, input: RequestInput, submit: boolean): Promise<PolicyResult & { id?: string }>;
  listRequests(): Promise<ApprovalRequest[]>;
  getRequest(id: string): Promise<ApprovalRequest | undefined>;
  decide(actorId: string, id: string, action: DecisionAction, remarks: string, expectedSeq: number): Promise<PolicyResult>;
  resubmit(actorId: string, id: string): Promise<PolicyResult>;
  withdraw(actorId: string, id: string, reason: string): Promise<PolicyResult>;
  /** Execution is triggered by the backend after approval; exposed for controlled retries only. */
  retryExecution(actorId: string, id: string): Promise<PolicyResult>;
  listWorkflows(): Promise<WorkflowTemplate[]>;
  saveWorkflow(actorId: string, wf: WorkflowTemplate, reason: string): Promise<PolicyResult>;
  listAuditEvents(filter?: { requestId?: string }): Promise<ApprovalAuditEvent[]>;
}

const s = () => store.approvalStore.get();

export const mockApprovalApi: ApprovalApi = {
  submitChangeRequest: async (a, i, sub) => store.createRequest(a, i, sub),
  listRequests: async () => s().requests,
  getRequest: async (id) => s().requests.find((r) => r.id === id),
  decide: async (a, id, act, rem, seq) => store.decideRequest(a, id, act, rem, seq),
  resubmit: async (a, id) => store.resubmitRequest(a, id),
  withdraw: async (a, id, r) => store.withdrawRequest(a, id, r),
  retryExecution: async (a, id) => store.runExecution(a, id),
  listWorkflows: async () => s().workflows,
  saveWorkflow: async (a, wf, r) => store.saveWorkflow(a, wf, r),
  listAuditEvents: async (f) => (f?.requestId ? s().audit.filter((e) => e.requestId === f.requestId) : s().audit),
};

const nc = (op: string) => async (): Promise<never> => {
  throw new ApiNotConnectedError(op);
};

/** HTTP implementation: not connected. Every call fails loudly rather than pretending to succeed. */
export const httpApprovalApi: ApprovalApi = {
  submitChangeRequest: nc("approvals.submitChangeRequest"),
  listRequests: nc("approvals.listRequests"),
  getRequest: nc("approvals.getRequest"),
  decide: nc("approvals.decide"),
  resubmit: nc("approvals.resubmit"),
  withdraw: nc("approvals.withdraw"),
  retryExecution: nc("approvals.retryExecution"),
  listWorkflows: nc("approvals.listWorkflows"),
  saveWorkflow: nc("approvals.saveWorkflow"),
  listAuditEvents: nc("approvals.listAuditEvents"),
};
