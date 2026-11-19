/**
 * APPROVAL STORE — in-browser mock repository for the central approval engine.
 * Same pattern as the access store: sessionStorage persistence, every mutation goes through the
 * engine with the acting user and the live Phase 2 access snapshot, and returns a PolicyResult.
 * Replace with services/approvalApi.ts calls when the backend exists.
 */
import { useSyncExternalStore } from "react";
import { DEMO_AS_OF, DEMO_AS_OF_TIME } from "@/data/mock/time";
import { accessStore } from "@/features/access/store";
import type { PolicyResult } from "@/features/access/engine";
import type { ApprovalDelegation, GovernanceDecision, MandatoryApprovalPolicy, WorkflowTemplate } from "@/types/approval";
import { addHours, isWorkflowAdmin, opCreate, opDecide, opExecFinish, opExecStart, opOverrideAttempt, opReroute, opResubmit, opRunSla, opSaveDelegation, opSavePolicy, opSaveWorkflow, opSubmit, opUpdateWorking, opView, opWithdraw, reqById, type ApprovalState, type Ctx, type DecisionAction, type RequestInput } from "./engine";
import { autoExecutes, getAdapter } from "./execution";
import { buildApprovalSeed } from "./scenarios";

const STORAGE_KEY = "vg-rishta.approval-store.v12";
const CLOCK_KEY = "vg-rishta.approval-clock.v1";
const DEMO_NOW = `${DEMO_AS_OF}T${DEMO_AS_OF_TIME}`;

/**
 * Demo clock: starts at the pinned demo moment and advances with real elapsed time, so new events
 * always sort after the seeded ones and SLA timers move during a session.
 */
function clockStart(): number {
  try {
    const raw = window.sessionStorage.getItem(CLOCK_KEY);
    if (raw) return Number(raw);
    const t = Date.now();
    window.sessionStorage.setItem(CLOCK_KEY, String(t));
    return t;
  } catch {
    return Date.now();
  }
}
const started = clockStart();
export const demoNow = () => addHours(DEMO_NOW, (Date.now() - started) / 3_600_000);

function load(): ApprovalState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ApprovalState;
  } catch {
    /* fall through to seed */
  }
  return buildApprovalSeed(accessStore.get());
}

let state: ApprovalState = load();
const listeners = new Set<() => void>();

function commit(next: ApprovalState) {
  if (next === state) return;
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const approvalStore = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useApprovalState(): ApprovalState {
  return useSyncExternalStore(approvalStore.subscribe, approvalStore.get, approvalStore.get);
}

export function resetApprovalDemoData() {
  try {
    window.sessionStorage.removeItem(CLOCK_KEY);
  } catch {
    /* ignore */
  }
  commit(buildApprovalSeed(accessStore.get()));
}

const ctx = (): Ctx => ({ acc: accessStore.get(), now: demoNow() });

type Res = PolicyResult & { id?: string };
function run(out: { state: ApprovalState; result: PolicyResult; id?: string }): Res {
  commit(out.state);
  return { ...out.result, id: out.id };
}

/* ---------------- Maker ---------------- */
export const createRequest = (actor: string, input: RequestInput, submit: boolean): Res => {
  const created = opCreate(state, ctx(), actor, input);
  if (!created.result.ok || !submit) return run(created);
  const submitted = opSubmit(created.state, ctx(), actor, created.id!);
  if (!submitted.result.ok) {
    // Keep the draft so the Maker does not lose their work; report why it was not submitted.
    commit(created.state);
    return { ...submitted.result, id: created.id };
  }
  return run(submitted);
};
export const updateWorkingVersion = (actor: string, id: string, patch: Parameters<typeof opUpdateWorking>[4]) => run(opUpdateWorking(state, ctx(), actor, id, patch));
export const submitRequest = (actor: string, id: string) => run(opSubmit(state, ctx(), actor, id));
export const resubmitRequest = (actor: string, id: string) => run(opResubmit(state, ctx(), actor, id));
export const withdrawRequest = (actor: string, id: string, reason: string) => run(opWithdraw(state, ctx(), actor, id, reason));

/* ---------------- Checker ---------------- */
export const markViewed = (actor: string, id: string) => {
  const out = opView(state, ctx(), actor, id);
  if (out.state !== state) commit(out.state);
};
export function decideRequest(actor: string, id: string, action: DecisionAction, remarks: string, expectedSeq: number): Res {
  const out = run(opDecide(state, ctx(), actor, id, action, remarks, expectedSeq));
  const r = reqById(state, id);
  // Modules with a registered execution handler are executed by the system right after final approval.
  if (out.ok && r?.status === "approved" && r.execution.status === "awaiting" && autoExecutes(r.module)) {
    const exec = runExecution("SYSTEM", id);
    return { ...out, warnings: [...out.warnings, exec.ok ? "Approved and activated by the module's execution adapter" : `Approved, but execution failed: ${exec.errors[0]}. The approval decision stands`] };
  }
  return out;
}

/* ---------------- Execution ---------------- */
export function runExecution(actor: string, id: string): Res {
  const started = opExecStart(state, ctx(), actor, id);
  if (!started.result.ok) return run(started);
  const r = reqById(started.state, id)!;
  const outcome = getAdapter(r.module).execute(r);
  return run(opExecFinish(started.state, ctx(), actor, id, outcome));
}

/* ---------------- Administration ---------------- */
export const rerouteRequest = (actor: string, id: string) => run(opReroute(state, ctx(), actor, id));
export const attemptOverride = (actor: string, id: string, reason: string) => run(opOverrideAttempt(state, ctx(), actor, id, reason));
export function runSlaCheck(actor: string): Res & { escalated: number; overdue: number } {
  if (!isWorkflowAdmin(accessStore.get(), actor)) return { ok: false, errors: ["Only workflow administrators can run the SLA check"], warnings: [], escalated: 0, overdue: 0 };
  const out = opRunSla(state, ctx());
  commit(out.state);
  return { ok: true, errors: [], warnings: [], escalated: out.escalated, overdue: out.overdue };
}
export const saveWorkflow = (actor: string, wf: WorkflowTemplate, reason: string) => run(opSaveWorkflow(state, ctx(), actor, wf, reason));
export const savePolicy = (actor: string, id: string, patch: Pick<MandatoryApprovalPolicy, "requirement" | "reasonRequired" | "note">, reason: string) => run(opSavePolicy(state, ctx(), actor, id, patch, reason));
export const saveDelegation = (actor: string, d: Omit<ApprovalDelegation, "id" | "status" | "createdBy" | "createdAt">) => run(opSaveDelegation(state, ctx(), actor, d));

export function revokeDelegation(actor: string, id: string): Res {
  const d = state.delegations.find((x) => x.id === id);
  if (!d) return { ok: false, errors: ["Delegation not found"], warnings: [] };
  if (actor !== d.fromUserId && !isWorkflowAdmin(accessStore.get(), actor)) return { ok: false, errors: ["Only the delegating approver or a workflow administrator can revoke"], warnings: [] };
  commit({ ...state, delegations: state.delegations.map((x) => (x.id === id ? { ...x, status: "revoked" } : x)) });
  return { ok: true, errors: [], warnings: [], id };
}

export function setDelegationEnabled(actor: string, enabled: boolean, reason: string): Res {
  if (!isWorkflowAdmin(accessStore.get(), actor)) return { ok: false, errors: ["Only Evolve platform administrators can change this setting"], warnings: [] };
  if (!reason.trim()) return { ok: false, errors: ["Give a reason"], warnings: [] };
  const n = state.audit.length + 1;
  commit({
    ...state,
    delegationEnabled: enabled,
    delegations: enabled ? state.delegations : state.delegations.map((d) => (d.status === "active" ? { ...d, status: "revoked" } : d)),
    audit: [...state.audit, { id: `AAU-${String(n).padStart(6, "0")}`, requestId: "SETTING-DELEGATION", version: 1, at: demoNow(), actorUserId: actor, actorOrgId: null, actorProfile: "Workflow administrator", action: "workflow.changed", module: "approvals", stage: null, previousStatus: enabled ? "disabled" : "enabled", newStatus: enabled ? "enabled" : "disabled", previousValue: null, newValue: `Temporary delegation ${enabled ? "enabled" : "disabled"}`, remarks: reason, ref: `ARF-${n + 5000}`, override: false }],
  });
  return { ok: true, errors: [], warnings: enabled ? [] : ["Active delegations were revoked"] };
}

export function updateGovernanceDecision(actor: string, id: string, patch: Pick<GovernanceDecision, "status" | "answer">): Res {
  if (!isWorkflowAdmin(accessStore.get(), actor)) return { ok: false, errors: ["Only Evolve platform administrators record governance decisions"], warnings: [] };
  if (patch.status === "confirmed" && !patch.answer.trim()) return { ok: false, errors: ["Record the confirmed answer and who confirmed it"], warnings: [] };
  const prev = state.decisions.find((d) => d.id === id);
  if (!prev) return { ok: false, errors: ["Decision not found"], warnings: [] };
  const n = state.audit.length + 1;
  commit({
    ...state,
    decisions: state.decisions.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    audit: [...state.audit, { id: `AAU-${String(n).padStart(6, "0")}`, requestId: id, version: 1, at: demoNow(), actorUserId: actor, actorOrgId: null, actorProfile: "Workflow administrator", action: "workflow.changed", module: "approvals", stage: null, previousStatus: prev.status, newStatus: patch.status, previousValue: prev.answer || null, newValue: patch.answer || null, remarks: `Governance decision ${id} recorded`, ref: `ARF-${n + 5000}`, override: false }],
  });
  return { ok: true, errors: [], warnings: patch.status === "confirmed" ? ["Confirming a decision does not activate any workflow. Update and activate the affected workflow separately"] : [] };
}

/* ---------------- Notifications ---------------- */
export function markNotificationsRead(userId: string, ids?: string[]) {
  const target = (n: ApprovalState["notifications"][number]) => n.recipientId === userId && !n.read && (!ids || ids.includes(n.id));
  if (!state.notifications.some(target)) return;
  commit({ ...state, notifications: state.notifications.map((n) => (target(n) ? { ...n, read: true } : n)) });
}
