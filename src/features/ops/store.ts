/**
 * INTEGRATION OPERATIONS STORE — in-browser mock repository (Phase 11).
 *
 * - The portal monitors integrations; execution stays in backend adapters. Retry and reprocess go to
 *   the (mock) backend reprocessing contract: duplicates are refused and financial records are never
 *   re-sent from here (the Wallet & Redemption idempotent payout contract is not connected).
 * - Health is never "Healthy" without a recent successful request (engine.healthOf).
 * - Sensitive data (payloads, stack traces, member diagnostics, float) needs its own permission and
 *   every access is audited. Credentials and secrets are never stored.
 * - Integration configuration changes go through the Approval Engine.
 */
import { useSyncExternalStore } from "react";
import { ALERT_TYPE, HEALTH } from "@/config/opsCatalogue";
import { accessStore } from "@/features/access/store";
import { getEffectiveAccess, hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { accessLog } from "@/features/access/accessLog";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { commsStore, sendStaffAlert } from "@/features/comms/store";
import { giftsStore } from "@/features/gifts/store";
import { geoOfMember, maskMobile, memberById } from "@/features/members/engine";
import { memberStore } from "@/features/members/store";
import { masterStore } from "@/features/masters/store";
import { riskStore } from "@/features/risk/store";
import { schemeStore } from "@/features/schemes/store";
import { walletStore } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import type { ApprovalRequest } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { HealthStatus, Incident, IntegrationRequest, MonitoringRule, OpsAlert, OpsState } from "@/types/ops";
import { adoption, healthOf, hoursBefore, lastLogin, stats } from "./engine";
import { buildOpsSeed } from "./seed";

const STORAGE_KEY = "vg-rishta.ops-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[], w = 4) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1, w)}`;
const sources = () => ({ mem: mem(), ws: walletStore.get(), ss: schemeStore.get(), ms: masterStore.get(), cs: commsStore.get(), gs: giftsStore.get(), rs: riskStore.get(), now: now() });

/* ---------------- Store plumbing ---------------- */

let state: OpsState;
const listeners = new Set<() => void>();
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
/** Single write path (not exported): every caller passes a state produced by `audited`. */
function commit(next: OpsState) {
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}
function load(): OpsState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as OpsState;
  } catch {
    /* seed */
  }
  return buildOpsSeed(sources());
}
state = load();
export const opsStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useOpsState = () => useSyncExternalStore(opsStore.subscribe, opsStore.get, opsStore.get);
export const resetOpsDemoData = () => {
  state = buildOpsSeed(sources());
  persist();
  sendAlerts();
  listeners.forEach((l) => l());
};

function audited(s: OpsState, actor: string, module: string, action: string, entity: string, after: string | null, reason: string, relatedRef: string | null = null, before: string | null = null): OpsState {
  const role = actor === "SYSTEM" ? "System" : getEffectiveAccess(acc(), actor).sources.find((x) => x.kind === "role")?.title ?? "—";
  return { ...s, audit: [...s.audit, { id: `OAE-${pad(s.audit.length + 1, 6)}`, at: now(), actor, orgId: actor === "SYSTEM" ? null : primaryOrg(acc(), actor)?.id ?? null, role, module, action, entity, before, after, reason, relatedRef }] };
}
const LABEL: Record<string, string> = { integrations: "Integration monitoring", health: "System health", "member-diagnostics": "Member diagnostics", "auth-audit": "Authentication audit", adoption: "Adoption monitoring", "float-monitoring": "Redemption float monitoring" };
const need = (m: string, a: string) => `You need ${LABEL[m] ?? m}: ${a}`;
const can = (uid: string, module: string, action: ActionId) => hasPermission(acc(), uid, module, action).allowed;
const canOnMember = (uid: string, module: string, action: ActionId, memberId: string | null) => {
  const m = memberId ? memberById(mem(), memberId) : undefined;
  return m ? hasPermission(acc(), uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed : can(uid, module, action);
};

/* ======================= Alerts (Communication Centre) ======================= */

const ALERT_TO = ["USR-1003"];
function sendAlerts() {
  let s = state;
  for (const a of s.alerts.filter((x) => !x.commId)) {
    const r = sendStaffAlert({ id: `OPS-${a.id}`, title: ALERT_TYPE[a.type], body: `${a.trigger}. Expected: ${a.expected}. Actual: ${a.actual}`, recipients: a.type === "float_low" ? s.float.recipients : ALERT_TO, sourceModule: "Integration monitoring", sourceRef: a.id, at: now() });
    s = { ...s, alerts: s.alerts.map((x) => (x.id === a.id ? { ...x, commId: r.commId } : x)) };
  }
  if (s !== state) commit(audited(s, "SYSTEM", "integrations", "alerts_dispatched", "alerts", String(s.alerts.filter((a) => a.commId).length), "Staff alerts through the Communication Centre (mock email)"));
}
function raiseAlert(s: OpsState, type: OpsAlert["type"], p: Partial<OpsAlert> & Pick<OpsAlert, "trigger" | "expected" | "actual">): OpsState {
  const id = nextId("OAL", s.alerts);
  const a: OpsAlert = { id, type, integrationId: null, service: null, detectedAt: now(), triggerValue: null, threshold: null, severity: null, owner: null, status: "created", escalation: 0, incidentId: null, traceRef: null, commId: null, history: [{ at: now(), by: "SYSTEM", status: "created", remarks: "" }], resolution: null, ...p };
  const r = sendStaffAlert({ id: `OPS-${id}`, title: ALERT_TYPE[type], body: `${a.trigger}. Expected: ${a.expected}. Actual: ${a.actual}`, recipients: type === "float_low" ? s.float.recipients : ALERT_TO, sourceModule: "Integration monitoring", sourceRef: id, at: now() });
  return { ...s, alerts: [...s.alerts, { ...a, commId: r.commId }] };
}

/* ======================= Queries ======================= */

export const integrationById = (id: string) => state.integrations.find((i) => i.id === id);
export const requestsOf = (id: string) => state.requests.filter((r) => r.integrationId === id);
export function healthFor(id: string, windowH = 24): HealthStatus {
  const i = integrationById(id);
  return i ? healthOf(i, state.requests, state.jobs, now(), windowH) : "unknown";
}
export function statsFor(id: string, windowH = 168) {
  const from = hoursBefore(now(), windowH);
  return stats(state.requests.filter((r) => r.integrationId === id && r.at >= from && r.at <= now()));
}
export const healthLabel = (h: HealthStatus) => HEALTH[h].label;

/** Masked request view for lists. Sensitive payload fields need Integration monitoring: View sensitive. */
export function payloadFor(uid: string, requestId: string): Res & { payload?: IntegrationRequest["payload"] } {
  const r = state.requests.find((x) => x.id === requestId);
  if (!r) return NO("Request not found");
  if (!can(uid, "integrations", "view")) return NO(need("integrations", "View"));
  if (r.sensitivePayload && !can(uid, "integrations", "view_sensitive")) return NO("This payload holds personal data: you need Integration monitoring: View sensitive");
  commit(audited(state, uid, "integrations", "payload_viewed", r.id, null, r.sensitivePayload ? "Sensitive payload metadata viewed" : "Payload metadata viewed", r.traceId));
  return { ...OK(r.id, ["Masked metadata only: raw payloads are not kept in the portal"]), payload: r.payload };
}

/* ---------------- Message trace (SOW 11.6) ---------------- */

export interface TraceStep {
  at: string;
  system: string;
  stage: string;
  ref: string;
  status: "success" | "failed" | "pending" | "info";
  detail: string;
  durationMs: number | null;
  retryCount: number;
}
/** Follows one record across SFDC, the platform and Evolve using the references the modules share. */
export function trace(uid: string, kind: "member" | "transaction" | "scheme" | "reference", q: string): Res & { steps?: TraceStep[]; requests?: IntegrationRequest[] } {
  if (!can(uid, "integrations", "view")) return NO(need("integrations", "View (trace)"));
  const ref = q.trim();
  if (!ref) return NO("Enter a reference");
  const steps: TraceStep[] = [];
  const reqStep = (r: IntegrationRequest, stage: string) => {
    const i = integrationById(r.integrationId)!;
    steps.push({ at: r.at, system: `${i.direction === "out" ? "Platform → " : i.direction === "in" ? `${i.name} → ` : `${i.name} ↔ `}${i.direction === "out" ? i.name : "Platform"}`, stage: `${stage}: ${r.operation}`, ref: r.id, status: r.status === "success" ? "success" : r.status === "pending" ? "pending" : "failed", detail: r.error ?? r.businessRef, durationMs: r.durationMs, retryCount: r.retryCount });
  };
  let reqs: IntegrationRequest[] = [];
  if (kind === "member") {
    const m = memberById(mem(), ref);
    if (!m) return NO("Member not found");
    if (!canOnMember(uid, "integrations", "view", m.id)) return NO("This member is outside your programme or geography");
    const rec = state.sfdcRecords.find((x) => x.memberId === m.id);
    if (rec) {
      steps.push({ at: rec.receivedAt, system: "SFDC", stage: "Source system created record", ref: rec.externalRef, status: "info", detail: rec.recordType.replace("_", " "), durationMs: null, retryCount: 0 });
      steps.push({ at: rec.receivedAt, system: "SFDC → Platform", stage: "Invitation / record received", ref: rec.id, status: rec.processing === "synced" ? "success" : rec.processing === "pending" ? "pending" : "failed", detail: rec.error ?? `Validation ${rec.validation}`, durationMs: null, retryCount: 0 });
    }
    steps.push({ at: m.registration.submittedAt.slice(0, 16), system: "Platform", stage: "Internal processing", ref: m.registration.ref, status: m.status === "rejected" ? "failed" : "success", detail: `Registration ${m.registration.source.replace(/_/g, " ")} · ${m.status.replace(/_/g, " ")}`, durationMs: null, retryCount: 0 });
    for (const c of state.callbacks.filter((x) => x.memberRef === m.id)) steps.push({ at: c.submittedAt, system: "Platform → SFDC", stage: `Callback sent: ${c.kind.replace(/_/g, " ")}`, ref: c.id, status: c.delivery === "acknowledged" ? "success" : c.delivery === "pending" ? "pending" : "failed", detail: c.lastError ?? c.result, durationMs: null, retryCount: c.retries.length });
    reqs = state.requests.filter((r) => r.memberId === m.id);
  } else if (kind === "transaction") {
    reqs = state.requests.filter((r) => r.businessRef === ref || (r.payload.redemption as string | undefined) === ref);
    const red = walletStore.get().redemptions.find((r) => r.id === ref);
    const pay = walletStore.get().payouts.find((p) => p.redemptionId === ref || p.id === ref);
    const acr = schemeStore.get().accruals.filter((a) => a.sourceRef === ref);
    if (!reqs.length && !red && !acr.length && !pay) return NO("No integration activity for this transaction reference");
    if (red) steps.push({ at: red.createdAt, system: "Platform", stage: "Redemption requested", ref: red.id, status: "info", detail: `${red.method} · ${red.points} points`, durationMs: null, retryCount: 0 });
    if (pay) for (const cb of pay.callbacks) steps.push({ at: cb.at, system: "RazorPay → Platform", stage: "Provider callback", ref: cb.id, status: cb.status === "success" ? "success" : "failed", detail: cb.duplicate ? "Duplicate callback ignored" : `UTR ${cb.utr ? `••••${cb.utr.slice(-4)}` : "missing"}`, durationMs: null, retryCount: 0 });
    for (const a of acr) steps.push({ at: a.calculatedAt, system: "Platform", stage: "Points processed", ref: a.id, status: a.result === "credited" || a.result === "accrued" ? "success" : "failed", detail: `${a.schemeId} · ${a.points} points · ledger ${a.ledgerRef ?? "—"}`, durationMs: null, retryCount: 0 });
  } else if (kind === "scheme") {
    const acr = schemeStore.get().accruals.filter((a) => a.schemeId === ref);
    if (!acr.length) return NO("No scheme activity for this scheme ID");
    const txns = new Set(acr.map((a) => a.sourceRef));
    reqs = state.requests.filter((r) => txns.has(r.businessRef));
    for (const a of acr.slice(-12)) steps.push({ at: a.calculatedAt, system: "Platform", stage: "Scheme reward calculated", ref: a.id, status: a.result === "credited" || a.result === "accrued" ? "success" : "failed", detail: `${a.sourceRef} · ${a.points} points (${a.result})`, durationMs: null, retryCount: 0 });
  } else {
    reqs = state.requests.filter((r) => r.id === ref || r.traceId === ref || r.businessRef === ref);
    const b = state.batches.find((x) => x.id === ref);
    if (b) steps.push({ at: b.startedAt, system: "SFDC → Platform", stage: `Sync batch ${b.kind.replace("_", " ")}`, ref: b.id, status: b.status === "completed" ? "success" : b.status === "missed" ? "failed" : "pending", detail: `${b.succeeded}/${b.total} records`, durationMs: null, retryCount: b.retried });
    const cb = state.callbacks.find((x) => x.id === ref);
    if (cb) steps.push({ at: cb.submittedAt, system: "Platform → SFDC", stage: "Callback sent", ref: cb.id, status: cb.delivery === "acknowledged" ? "success" : cb.delivery === "pending" ? "pending" : "failed", detail: cb.lastError ?? cb.result, durationMs: null, retryCount: cb.retries.length });
    if (!reqs.length && !b && !cb) return NO("No record with this reference");
  }
  for (const r of reqs) reqStep(r, r.status === "pending" ? "Request sent, awaiting response" : r.status === "success" ? "External system responded" : "Request failed");
  for (const r of state.retries.filter((x) => reqs.some((y) => y.id === x.targetId))) steps.push({ at: r.at, system: "Platform", stage: "Retry through the backend contract", ref: r.id, status: r.status === "completed" ? "success" : r.status.startsWith("refused") ? "failed" : "pending", detail: r.result, durationMs: null, retryCount: 1 });
  steps.sort((a, b) => a.at.localeCompare(b.at));
  commit(audited(state, uid, "integrations", "trace_viewed", `${kind}:${ref}`, `${steps.length} steps`, ""));
  return { ...OK(ref), steps, requests: reqs };
}

/* ======================= Configuration (approval) and ownership ======================= */

export function recordOwnership(uid: string, integrationId: string, p: { business: string; technical: string; data: string; contractRef: string }): Res {
  const i = integrationById(integrationId);
  if (!i) return NO("Integration not found");
  if (!can(uid, "integrations", "edit")) return NO(need("integrations", "Edit (configuration metadata)"));
  if (/(secret|token|password|api[_ -]?key|bearer)/i.test(Object.values(p).join(" "))) return NO("Never record credentials or secrets: reference the secret store only");
  const next = { ...i, ownership: { business: p.business.trim() || null, technical: p.technical.trim() || null, data: p.data.trim() || null }, contractRef: p.contractRef.trim() || null };
  commit(audited({ ...state, integrations: state.integrations.map((x) => (x.id === integrationId ? next : x)) }, uid, "integrations", "ownership_recorded", integrationId, JSON.stringify(next.ownership), "Ownership and contract reference recorded (contract stays unconfirmed until approved)", null, JSON.stringify(i.ownership)));
  return OK(integrationId);
}

/** Production-impacting configuration (for example the SFDC invitation target frequency) needs approval. */
export function requestConfigChange(uid: string, integrationId: string, key: string, value: string, reason: string): Res {
  const i = integrationById(integrationId);
  if (!i) return NO("Integration not found");
  if (!can(uid, "integrations", "submit")) return NO(need("integrations", "Submit (configuration change)"));
  if (i.connection === "placeholder") return NO(`${i.name} is a placeholder (OP-45): it cannot be configured or activated`);
  if (!value.trim() || !reason.trim()) return NO("Enter the value and a reason");
  if (state.pendingConfig.some((p) => p.integrationId === integrationId && p.key === key && p.status === "pending_approval")) return NO("A change to this setting is already awaiting approval");
  const id = nextId("CFG", state.pendingConfig);
  const q = createRequest(uid, { requestType: "integration_config_change", title: `${i.name}: ${key} → ${value.trim()}`, entityRef: id, programme: null, location: null, amount: null, fields: [{ key, label: key, kind: "text", before: i.config[key] ?? "Not set", after: value.trim(), material: true }], purpose: "Integration configuration change", reason: reason.trim(), justification: i.decisions.length ? `Related open decisions: ${i.decisions.join(", ")}` : "", attachments: [], impact: { operationalImpact: `${i.name} ${key}` } }, true);
  if (!q.ok) return q;
  commit(audited({ ...state, pendingConfig: [...state.pendingConfig, { id, integrationId, key, value: value.trim(), approvalRequestId: q.id ?? null, status: "pending_approval", requestedBy: uid, at: now() }] }, uid, "integrations", "config_change_requested", `${integrationId}.${key}`, value.trim(), reason.trim(), q.id ?? null, i.config[key] ?? null));
  return OK(id, ["Applied only after approval (WF-037)"]);
}

/* ======================= Retry and reprocessing ======================= */

/** Backend reprocessing contract (mock): idempotent by target; financial records are never re-sent here. */
export function retryRequest(uid: string, requestId: string, reason: string): Res {
  const r = state.requests.find((x) => x.id === requestId);
  if (!r) return NO("Request not found");
  if (!can(uid, "integrations", "execute")) return NO(need("integrations", "Execute (retry / reprocess)"));
  if (!reason.trim()) return NO("Give a reason");
  if (r.status !== "failed" && r.status !== "timeout") return NO("Only failed or timed-out requests can be retried");
  const key = `RETRY|${r.integrationId}|${r.businessRef}`;
  const prior = state.retries.find((x) => x.idempotencyKey === key && (x.status === "accepted" || x.status === "completed"));
  if (prior) {
    commit(audited({ ...state, retries: [...state.retries, { id: nextId("RTY", state.retries), scope: "request", targetId: r.id, integrationId: r.integrationId, idempotencyKey: key, requestedBy: uid, at: now(), reason, status: "refused_duplicate", result: `Already reprocessed by ${prior.id}` }] }, uid, "integrations", "retry_refused_duplicate", r.id, prior.id, reason));
    return NO(`Duplicate reprocessing prevented: ${prior.id} already reprocessed this record`);
  }
  if (r.financial) {
    commit(audited({ ...state, retries: [...state.retries, { id: nextId("RTY", state.retries), scope: "request", targetId: r.id, integrationId: r.integrationId, idempotencyKey: key, requestedBy: uid, at: now(), reason, status: "refused_financial", result: "Financial transaction: retry only through the Wallet & Redemption idempotent payout contract (not connected)" }] }, uid, "integrations", "retry_refused_financial", r.id, null, reason));
    return NO("Financial records are not reprocessed from monitoring: the payout must be retried by the Wallet & Redemption service with its duplicate-prevention checks (contract not connected)");
  }
  const id = nextId("RTY", state.retries);
  const retried: IntegrationRequest = { ...r, id: `REQ-${pad(state.requests.length + 1, 6)}`, at: now(), respondedAt: now(), status: "success", httpStatus: 200, durationMs: 640, errorCategory: null, error: null, retryCount: r.retryCount + 1, traceId: r.traceId, source: `Retry ${id} (mock backend reprocessing contract)` };
  let s: OpsState = { ...state, requests: [...state.requests, retried], retries: [...state.retries, { id, scope: "request", targetId: r.id, integrationId: r.integrationId, idempotencyKey: key, requestedBy: uid, at: now(), reason, status: "completed", result: `Reprocessed as ${retried.id}; original ${r.id} kept` }] };
  s = audited(s, uid, "integrations", "retry_initiated", r.id, retried.id, reason, r.traceId);
  commit(s);
  return OK(id, ["Mock backend adapter: no external system was called"]);
}
export function retryJobRun(uid: string, runId: string, reason: string): Res {
  const job = state.jobs.find((j) => j.runs.some((r) => r.id === runId));
  const run = job?.runs.find((r) => r.id === runId);
  if (!job || !run) return NO("Job run not found");
  if (!can(uid, "integrations", "execute")) return NO(need("integrations", "Execute (retry job)"));
  if (!reason.trim()) return NO("Give a reason");
  if (!["failed", "missed"].includes(run.status)) return NO("Only failed or missed runs can be retried");
  if (job.integrationId === "INT-RZP") return NO("Financial reconciliation is re-run by the Finance service, not from monitoring");
  if (run.retries.length) return NO(`Duplicate retry prevented: already retried (${run.retries[run.retries.length - 1]})`);
  const id = nextId("RTY", state.retries);
  const fresh = { ...run, id: `${run.id}-RT1`, startedAt: now(), completedAt: now(), status: "success" as const, error: null, retries: [] };
  commit(audited({ ...state, jobs: state.jobs.map((j) => (j.id === job.id ? { ...j, runs: [...j.runs.map((r) => (r.id === runId ? { ...r, retries: [...r.retries, id] } : r)), fresh] } : j)), retries: [...state.retries, { id, scope: "job_run", targetId: runId, integrationId: job.integrationId, idempotencyKey: `JOB|${runId}`, requestedBy: uid, at: now(), reason, status: "completed", result: `Re-run ${fresh.id}` }] }, uid, "integrations", "job_retry_initiated", runId, fresh.id, reason));
  return OK(id, ["Mock backend scheduler: run recorded, no external system called"]);
}
export function retryCallback(uid: string, callbackId: string, reason: string): Res {
  const c = state.callbacks.find((x) => x.id === callbackId);
  if (!c) return NO("Callback not found");
  if (!can(uid, "integrations", "execute")) return NO(need("integrations", "Execute (retry callback)"));
  if (c.delivery !== "failed") return NO("Only failed callbacks can be retried");
  if (!reason.trim()) return NO("Give a reason");
  const outcome = "failed" as const;
  commit(audited({ ...state, callbacks: state.callbacks.map((x) => (x.id === callbackId ? { ...x, retries: [...x.retries, { at: now(), outcome }], lastError: "SFDC rejected the callback again: contract and reason codes not confirmed (OP-24)" } : x)) }, uid, "integrations", "callback_retry", callbackId, outcome, reason));
  return OK(callbackId, ["Retry recorded. SFDC still rejects the callback (OP-24 contract open)"]);
}
export function acknowledgeRun(uid: string, runId: string, remarks: string): Res {
  if (!can(uid, "integrations", "execute") && !can(uid, "health", "edit")) return NO(need("integrations", "Execute"));
  const job = state.jobs.find((j) => j.runs.some((r) => r.id === runId));
  if (!job) return NO("Job run not found");
  if (!remarks.trim()) return NO("Remarks are required");
  commit(audited(state, uid, "integrations", "job_failure_acknowledged", runId, null, remarks));
  return OK(runId);
}

/* ======================= Alerts and monitoring rules ======================= */

export const ALERT_FLOW: Record<OpsAlert["status"], OpsAlert["status"][]> = { created: ["assigned", "acknowledged"], assigned: ["acknowledged", "investigating"], acknowledged: ["investigating", "escalated", "resolved"], investigating: ["escalated", "resolved"], escalated: ["investigating", "resolved"], resolved: ["closed"], closed: [] };
export function updateAlert(uid: string, id: string, to: OpsAlert["status"], remarks: string, owner?: string): Res {
  const a = state.alerts.find((x) => x.id === id);
  if (!a) return NO("Alert not found");
  if (!can(uid, "integrations", "manage") && !can(uid, "health", "edit")) return NO(need("health", "Edit (alerts)"));
  if (!ALERT_FLOW[a.status].includes(to)) return NO(`Not allowed: ${a.status} → ${to}`);
  if ((to === "resolved" || to === "escalated") && !remarks.trim()) return NO("Remarks are required");
  const next: OpsAlert = { ...a, status: to, owner: owner ?? (to === "assigned" ? uid : a.owner), escalation: to === "escalated" ? a.escalation + 1 : a.escalation, history: [...a.history, { at: now(), by: uid, status: to, remarks }], resolution: to === "resolved" ? { at: now(), by: uid, remarks } : a.resolution };
  commit(audited({ ...state, alerts: state.alerts.map((x) => (x.id === id ? next : x)) }, uid, "integrations", `alert_${to}`, id, to, remarks, a.incidentId, a.status));
  return OK(id);
}
export function saveMonitoringRule(uid: string, r: MonitoringRule): Res {
  if (!can(uid, "integrations", "manage")) return NO(need("integrations", "Manage (monitoring rules)"));
  const prev = state.rules.find((x) => x.id === r.id);
  if (!prev) return NO("Rule not found");
  const confirmed = state.decisions.find((d) => d.id === "OP-MON1")?.status === "confirmed";
  const next = { ...r, status: confirmed ? ("confirmed" as const) : ("business_confirmation_required" as const) };
  commit(audited({ ...state, rules: state.rules.map((x) => (x.id === r.id ? next : x)) }, uid, "integrations", "monitoring_rule_changed", r.id, JSON.stringify({ window: r.window, failure: r.failureCondition, delay: r.delayCondition, severity: r.severity }), confirmed ? "OP-MON1 confirmed" : "Recorded; thresholds stay Business Confirmation Required (OP-MON1)", null, JSON.stringify({ window: prev.window, failure: prev.failureCondition })));
  return OK(r.id, confirmed ? [] : ["Thresholds are recorded but remain Business Confirmation Required (OP-MON1)"]);
}

/* ======================= System health: stack traces, incidents, snapshot ======================= */

export function viewStack(uid: string, crashId: string): Res & { stack?: string } {
  const c = state.crashes.find((x) => x.id === crashId);
  if (!c) return NO("Crash not found");
  if (!can(uid, "health", "view_sensitive")) return NO("Stack traces need System health: View sensitive");
  commit(audited(state, uid, "health", "stack_trace_viewed", c.id, c.stackRef, ""));
  return { ...OK(c.id), stack: c.stack };
}

export function createIncident(uid: string, p: { title: string; from: string; to: string; services: string[]; alertIds?: string[] }): Res {
  if (!can(uid, "health", "create")) return NO(need("health", "Create (incident)"));
  if (!p.title.trim()) return NO("Give the incident a title");
  if (!p.from || !p.to || p.to < p.from) return NO("Enter a valid time window");
  const id = nextId("INC", state.incidents);
  const inc: Incident = { id, title: p.title.trim(), status: "open", owner: null, severity: null, window: { from: p.from, to: p.to }, services: p.services, traces: [], changes: [], alerts: p.alertIds ?? [], notes: [], history: [{ at: now(), by: uid, status: "open", remarks: "Created" }], createdBy: uid, createdAt: now(), resolvedAt: null };
  commit(audited({ ...state, incidents: [...state.incidents, inc], alerts: state.alerts.map((a) => (p.alertIds?.includes(a.id) ? { ...a, incidentId: id } : a)) }, uid, "health", "incident_created", id, inc.title, ""));
  return OK(id);
}
export const INC_FLOW: Record<Incident["status"], Incident["status"][]> = { open: ["assigned", "investigating"], assigned: ["investigating"], investigating: ["monitoring", "resolved"], monitoring: ["investigating", "resolved"], resolved: ["closed", "investigating"], closed: [] };
function updInc(uid: string, id: string, f: (i: Incident) => Incident | string, action: string, detail: string, perm: ActionId = "edit"): Res {
  const i = state.incidents.find((x) => x.id === id);
  if (!i) return NO("Incident not found");
  if (!can(uid, "health", perm)) return NO(need("health", perm === "close" ? "Close (incident)" : "Edit (incident)"));
  const next = f(i);
  if (typeof next === "string") return NO(next);
  commit(audited({ ...state, incidents: state.incidents.map((x) => (x.id === id ? next : x)) }, uid, "health", action, id, detail, "", id, i.status));
  return OK(id);
}
export const assignIncident = (uid: string, id: string, owner: string) => updInc(uid, id, (i) => (i.status === "closed" ? "Closed" : { ...i, owner, status: i.status === "open" ? "assigned" : i.status, history: [...i.history, { at: now(), by: uid, status: i.status === "open" ? "assigned" : i.status, remarks: `Owner ${owner}` }] }), "incident_assigned", owner);
export const addIncidentNote = (uid: string, id: string, text: string) => updInc(uid, id, (i) => (i.status === "closed" ? "Closed incidents are read-only" : !text.trim() ? "Write the note" : { ...i, notes: [...i.notes, { at: now(), by: uid, text: text.trim() }] }), "incident_note", text);
export const linkToIncident = (uid: string, id: string, kind: "traces" | "changes" | "alerts" | "services", ref: string) => updInc(uid, id, (i) => (i.status === "closed" ? "Closed incidents are read-only" : !ref.trim() ? "Enter the reference" : { ...i, [kind]: [...new Set([...i[kind], ref.trim()])] }), "incident_linked", `${kind}: ${ref}`);
export const setIncidentStatus = (uid: string, id: string, to: Incident["status"], remarks: string) => updInc(uid, id, (i) => (!INC_FLOW[i.status].includes(to) ? `Not allowed: ${i.status} → ${to}` : to === "resolved" && !remarks.trim() ? "Record the resolution" : { ...i, status: to, resolvedAt: to === "resolved" ? now() : i.resolvedAt, history: [...i.history, { at: now(), by: uid, status: to, remarks }] }), `incident_${to}`, to, to === "closed" ? "close" : "edit");

/** What changed around a moment: deployments, configuration, schema, vendors and flags (correlation, not cause). */
export function incidentSnapshot(from: string, to: string) {
  const inWin = (at: string) => at >= from && at <= to;
  const cfgEntities = ["anomaly_rule", "global_restriction", "qr_digest", "decision", "config", "policy", "render_config"];
  const config = [
    ...state.audit.filter((a) => inWin(a.at) && /config|rule|threshold/.test(a.action)).map((a) => ({ id: a.id, at: a.at, parameter: a.entity, before: a.before, after: a.after, by: a.actor, source: "Integration monitoring" })),
    ...riskStore.get().audit.filter((a) => inWin(a.at) && cfgEntities.includes(a.entity)).map((a) => ({ id: a.id, at: a.at, parameter: `${a.entity} ${a.entityId}`, before: a.before, after: a.after, by: a.actor, source: "Fraud & risk" })),
    ...commsStore.get().audit.filter((a) => inWin(a.at) && ["policy", "config", "catalogue"].includes(a.entity)).map((a) => ({ id: a.id, at: a.at, parameter: `${a.entity} ${a.entityId}`, before: a.before, after: a.after, by: a.actor, source: "Communication centre" })),
    ...walletStore.get().audit.filter((a) => inWin(a.at) && a.entity === "config").map((a) => ({ id: a.id, at: a.at, parameter: `${a.entity} ${a.entityId}`, before: a.before, after: a.after, by: a.actor, source: "Wallet & finance" })),
  ];
  const ch = state.changes.filter((c) => inWin(c.at) || (c.kind === "vendor_outage" && c.at <= to && (!c.endAt || c.endAt >= from)));
  return { deployments: ch.filter((c) => c.kind === "deployment"), schema: ch.filter((c) => c.kind === "schema"), flags: ch.filter((c) => c.kind === "feature_flag"), vendors: ch.filter((c) => c.kind === "vendor_outage"), config, missingDeployment: !ch.some((c) => c.kind === "deployment") };
}

/* ======================= Member diagnostics, authentication, adoption ======================= */

export function memberDiagnostic(uid: string, by: "member" | "mobile", query: string, reason: string): Res & { view?: ReturnType<typeof diagnosticView> } {
  if (!can(uid, "member-diagnostics", "view")) return NO("You need Member diagnostics: View (a separate technical permission)");
  if (by === "mobile" && !can(uid, "member-diagnostics", "view_sensitive")) return NO("Searching by mobile number needs Member diagnostics: View sensitive");
  if (!reason.trim()) return NO("Record the reason for access (support ticket or incident reference)");
  const norm = query.replace(/\D/g, "").slice(-10);
  const m = by === "member" ? memberById(mem(), query.trim()) : mem().members.find((x) => x.mobile.replace(/\D/g, "").slice(-10) === norm);
  if (!m) {
    commit(audited(state, uid, "member-diagnostics", "diagnostic_search_no_result", by, null, reason));
    return NO("No member found");
  }
  if (!canOnMember(uid, "member-diagnostics", "view", m.id)) return NO("This member is outside your programme or geography");
  commit(audited(state, uid, "member-diagnostics", "diagnostic_accessed", m.id, by, reason.trim()));
  return { ...OK(m.id), view: diagnosticView(uid, m.id) };
}
function diagnosticView(uid: string, memberId: string) {
  const m = memberById(mem(), memberId)!;
  const sens = can(uid, "member-diagnostics", "view_sensitive");
  const devices = riskStore.get().devices.filter((d) => d.associations.some((a) => a.memberId === m.id));
  const auth = state.auth.filter((a) => a.memberId === m.id).sort((a, b) => b.at.localeCompare(a.at));
  const lastOk = auth.find((a) => a.result === "success");
  const lastDevLogin = devices.flatMap((d) => d.logins.filter((l) => l.memberId === m.id)).sort((a, b) => b.at.localeCompare(a.at))[0];
  const apiFailures = [...state.requests.filter((r) => r.memberId === m.id && (r.status === "failed" || r.status === "timeout")).map((r) => ({ service: integrationById(r.integrationId)!.name, ref: r.id, at: r.at, category: r.errorCategory, status: r.httpStatus, correlation: r.traceId, module: r.messageType })), ...state.services.flatMap((s) => s.failures.filter((f) => f.memberId === m.id).map((f) => ({ service: s.name, ref: f.id, at: f.at, category: f.category, status: f.http, correlation: f.correlationId, module: s.group })))];
  return {
    member: { id: m.id, programme: m.programme, status: m.status, mobile: sens ? maskMobile(m.mobile) : "Restricted" },
    lastLogin: lastLogin(state.auth, m.id, m.registration.firstLoginAt),
    lastDevice: lastOk?.deviceId ?? lastDevLogin ? `${lastOk?.deviceId ?? ""} ${lastOk?.deviceModel ?? ""}`.trim() || "—" : "—",
    lastLocation: sens ? lastDevLogin?.location ?? "Not captured" : "Restricted",
    apiFailures,
    appErrors: state.crashes.filter((c) => c.relatedFailures.some((f) => apiFailures.some((a) => a.ref === f))).map((c) => ({ id: c.id, errorType: c.errorType, version: c.version })),
    devices: devices.map((d) => ({ id: d.id, model: state.auth.find((a) => a.deviceId === d.id)?.deviceModel ?? "—", appVersion: d.logins.slice(-1)[0]?.appVersion ?? "—", os: state.auth.find((a) => a.deviceId === d.id)?.os ?? "—", logins: d.logins.filter((l) => l.memberId === m.id).length, status: d.status, alerts: riskStore.get().events.filter((e) => e.links.deviceIds.includes(d.id)).length })),
    restrictions: mem().restrictions.filter((r) => r.status !== "lifted" && r.memberIds.includes(m.id)).map((r) => `${r.type === "program_block" ? "Program Block" : "Temporary Hold"} ${r.id}`),
    lastSync: state.sfdcRecords.find((r) => r.memberId === m.id)?.processing === "synced" ? state.sfdcRecords.find((r) => r.memberId === m.id)!.receivedAt : null,
  };
}

export function authEvents(uid: string): Res & { rows?: OpsState["auth"] } {
  if (!can(uid, "auth-audit", "view")) return NO(need("auth-audit", "View"));
  return { ...OK(), rows: state.auth.filter((a) => canOnMember(uid, "auth-audit", "view", a.memberId)) };
}
export function exportAuth(uid: string, rows: number): Res {
  if (!can(uid, "auth-audit", "export")) return NO(need("auth-audit", "Export"));
  commit(audited(state, uid, "auth-audit", "authentication_audit_exported", "auth-events", `${rows} rows`, "Scoped export"));
  return OK();
}

export function adoptionRows(uid: string) {
  if (!can(uid, "adoption", "view")) return [];
  return adoption(mem().members.filter((m) => canOnMember(uid, "adoption", "view", m.id)), state.auth, now(), state.config.dormancyDays);
}
export function setDormancy(uid: string, days: number | null): Res {
  if (!can(uid, "adoption", "manage")) return NO(need("adoption", "Manage (dormancy threshold)"));
  if (days != null && (!Number.isInteger(days) || days < 1)) return NO("Enter a whole number of days");
  const confirmed = state.decisions.find((d) => d.id === "OP-DORM")?.status === "confirmed";
  commit(audited({ ...state, config: { ...state.config, dormancyDays: days, dormancyStatus: days == null ? "business_confirmation_required" : confirmed ? "confirmed" : "development_setting" } }, uid, "adoption", "dormancy_threshold_changed", "OP-DORM", days == null ? null : String(days), confirmed ? "OP-DORM confirmed" : "Development setting (OP-DORM open)", null, state.config.dormancyDays == null ? null : String(state.config.dormancyDays)));
  return OK(undefined, confirmed ? [] : ["Recorded as a development setting: V-Guard has not confirmed X"]);
}
export function exportAdoption(uid: string, rows: number): Res {
  if (!can(uid, "adoption", "export")) return NO(need("adoption", "Export"));
  commit(audited(state, uid, "adoption", "adoption_exported", "adoption", `${rows} rows`, "Telecalling / SR follow-up list (no automatic contact)"));
  return OK();
}

/* ======================= Redemption float and kitties ======================= */

export function floatView(uid: string): Res & { view?: ReturnType<typeof floatSummary> } {
  if (!can(uid, "float-monitoring", "view")) return NO(need("float-monitoring", "View (financial float)"));
  commit(audited(state, uid, "float-monitoring", "float_viewed", "float", null, "Financial float accessed"));
  return { ...OK(), view: floatSummary() };
}
/** Same view without a new audit entry (screens audit once per visit through floatView). */
export function floatData(uid: string): Res & { view?: ReturnType<typeof floatSummary> } {
  if (!can(uid, "float-monitoring", "view")) return NO(need("float-monitoring", "View (financial float)"));
  return { ...OK(), view: floatSummary() };
}
function floatSummary() {
  const ws = walletStore.get();
  const snaps = state.float.snapshots;
  const last = snaps[snaps.length - 1];
  const committed = ws.payouts.filter((p) => p.status === "in_process").reduce((n, p) => n + p.amountInr, 0) + ws.redemptions.filter((r) => r.stage === "processing" && ["dbt", "upi"].includes(r.method)).reduce((n, r) => n + r.grossInr, 0);
  const paid = ws.payouts.filter((p) => p.status === "success").reduce((n, p) => n + p.amountInr, 0);
  const recent = snaps.slice(-7);
  const burn = Math.round(recent.reduce((n, s) => n + s.payouts, 0) / Math.max(1, recent.length));
  const low = state.float.lowThreshold != null && last.closing < state.float.lowThreshold;
  return { available: last.closing, committed, paid, remaining: last.closing - committed, burnRate: burn, projectedBurn: null as number | null, timeToThreshold: null as string | null, low, lastUpdated: last.date, source: state.float.source, snapshots: snaps, threshold: state.float.lowThreshold, thresholdStatus: state.float.thresholdStatus };
}
export function setFloatThreshold(uid: string, amount: number | null): Res {
  if (!can(uid, "float-monitoring", "manage")) return NO(need("float-monitoring", "Manage (finance policy)"));
  if (amount != null && (!Number.isFinite(amount) || amount <= 0)) return NO("Enter a positive amount");
  let s: OpsState = { ...state, float: { ...state.float, lowThreshold: amount, thresholdStatus: amount == null ? "business_confirmation_required" : "development_setting" } };
  s = audited(s, uid, "float-monitoring", "float_threshold_changed", "OP-FLOAT", amount == null ? null : String(amount), "Development setting (OP-FLOAT open)", null, state.float.lowThreshold == null ? null : String(state.float.lowThreshold));
  const last = s.float.snapshots[s.float.snapshots.length - 1];
  if (amount != null && last.closing < amount && !s.alerts.some((a) => a.type === "float_low" && a.status !== "closed")) s = raiseAlert(s, "float_low", { trigger: `Float ₹${last.closing.toLocaleString("en-IN")} below the development threshold`, expected: `At least ₹${amount.toLocaleString("en-IN")} (development setting)`, actual: `₹${last.closing.toLocaleString("en-IN")}`, threshold: String(amount), triggerValue: String(last.closing) });
  commit(s);
  return OK(undefined, ["Development setting: no production threshold is confirmed (OP-FLOAT)"]);
}
/** Separate financial concepts, never added together. */
export function kittySummary(uid: string): Res & { view?: { tdsKitty: number; scheme: number; available: number } } {
  if (!can(uid, "float-monitoring", "view")) return NO(need("float-monitoring", "View"));
  const ws = walletStore.get();
  const ss = schemeStore.get();
  let tds = 0, scheme = 0, available = 0;
  for (const m of mem().members) {
    const b = memberBalances(ws, ss, mem(), m.id);
    tds += b.tdsKitty;
    scheme += b.scheme;
    available += b.available;
  }
  return { ...OK(), view: { tdsKitty: tds, scheme, available } };
}

/* ======================= Exceptions and crashes ======================= */

/** SOW 11.5 exceptions resolve only when the source system confirms; nothing is repaired with guessed values. */
export function updateException(uid: string, id: string, to: "awaiting_source" | "resolved", remarks: string, sourceRef = ""): Res {
  const x = state.exceptions.find((e) => e.id === id);
  if (!x) return NO("Exception not found");
  if (!can(uid, "integrations", "edit")) return NO(need("integrations", "Edit (exceptions)"));
  if (x.status === "resolved") return NO("Already resolved");
  if (!remarks.trim()) return NO("Remarks are required");
  if (to === "resolved" && !sourceRef.trim()) return NO("Record the source-system confirmation reference: exceptions are resolved only after the authoritative source confirms the correction");
  commit(audited({ ...state, exceptions: state.exceptions.map((e) => (e.id === id ? { ...e, status: to } : e)) }, uid, "integrations", `exception_${to}`, id, sourceRef.trim() || null, remarks.trim(), x.decisionRef, x.status));
  return OK(id);
}
export function setCrashStatus(uid: string, id: string, to: "investigating" | "resolved", remarks: string, incidentId?: string): Res {
  const c = state.crashes.find((x) => x.id === id);
  if (!c) return NO("Crash not found");
  if (!can(uid, "health", "edit")) return NO(need("health", "Edit (crash status)"));
  if (to === "resolved" && !remarks.trim()) return NO("Record the resolution");
  if (incidentId && !state.incidents.some((i) => i.id === incidentId)) return NO("Incident not found");
  let s: OpsState = { ...state, crashes: state.crashes.map((x) => (x.id === id ? { ...x, status: to, incidentId: incidentId ?? x.incidentId } : x)) };
  if (incidentId) s = { ...s, incidents: s.incidents.map((i) => (i.id === incidentId ? { ...i, traces: [...new Set([...i.traces, c.stackRef])] } : i)) };
  commit(audited(s, uid, "health", `crash_${to}`, id, incidentId ?? null, remarks, incidentId ?? null, c.status));
  return OK(id);
}

/* ======================= Governance ======================= */

export function updateOpsDecision(uid: string, id: string, patch: { status: OpsState["decisions"][number]["status"]; answer: string }): Res {
  if (!can(uid, "integrations", "manage")) return NO(need("integrations", "Manage"));
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, uid, "integrations", `decision_${patch.status}`, id, patch.answer, d.question, null, d.status));
  return OK(id);
}
export function recordOpsExport(uid: string, module: string, name: string, rows: number): Res {
  if (!can(uid, module, "export")) return NO(need(module, "Export"));
  commit(audited(state, uid, module, "exported", name, `${rows} rows`, "CSV export"));
  return OK();
}
export const accessEvents = () => accessLog();

/* ======================= Execution handler ======================= */

function execConfig(r: ApprovalRequest) {
  const p = state.pendingConfig.find((x) => x.id === r.entityRef);
  if (!p) return { ok: false, message: `Not executed: no configuration change ${r.entityRef}` };
  if (p.status === "applied") return { ok: true, message: "Already applied (idempotent)" };
  const i = integrationById(p.integrationId)!;
  commit(audited({ ...state, pendingConfig: state.pendingConfig.map((x) => (x.id === p.id ? { ...x, status: "applied" } : x)), integrations: state.integrations.map((x) => (x.id === i.id ? { ...x, config: { ...x.config, [p.key]: p.value } } : x)) }, "SYSTEM", "integrations", "config_changed", `${i.id}.${p.key}`, p.value, `Approved (${r.id}); backend adapter configuration is not connected`, r.id, i.config[p.key] ?? null));
  return { ok: true, message: `${i.name} ${p.key} = ${p.value} recorded (configuration service mock; open decisions stay open)` };
}
registerExecutionHandler("integrations", execConfig);

function syncFromApprovals() {
  const reqs = approvalStore.get().requests;
  const back = (id: string | null) => ["rejected", "returned", "withdrawn"].includes(reqs.find((r) => r.id === id)?.status ?? "");
  if (state.pendingConfig.some((p) => p.status === "pending_approval" && back(p.approvalRequestId))) commit({ ...state, pendingConfig: state.pendingConfig.map((p) => (p.status === "pending_approval" && back(p.approvalRequestId) ? { ...p, status: "rejected" } : p)) });
}
approvalStore.subscribe(syncFromApprovals);
sendAlerts();

/* ======================= Client Demo: simulated integration outcomes ======================= */

export type SimOutcome = "success" | "validation_error" | "timeout" | "provider_failure" | "duplicate_callback";
const SIM_OP: Record<string, { op: string; type: IntegrationRequest["messageType"]; financial?: boolean }> = {
  "INT-SFDC": { op: "Inbound member record", type: "member" }, "INT-ESEAL": { op: "Product lookup", type: "scan" }, "INT-SIEBEL": { op: "Customer lookup", type: "ticket" }, "INT-RZP": { op: "UPI payout", type: "redemption", financial: true }, "INT-DIGI": { op: "Aadhaar verification", type: "kyc" }, "INT-SIGNZY": { op: "PAN verification", type: "kyc" }, "INT-WA": { op: "WhatsApp message", type: "communication" }, "INT-SMS": { op: "SMS message", type: "communication" }, "INT-MAPS": { op: "Reverse geocode", type: "location" }, "INT-LOGI": { op: "Shipment status", type: "logistics" },
};
export const SIM_INTEGRATIONS = Object.keys(SIM_OP);
/**
 * Presenter control (simulation only): records one request with the chosen outcome against a mock
 * adapter, so failures, retries and traces can be shown. Nothing external is called.
 */
export function simulateIntegrationEvent(uid: string, integrationId: string, outcome: SimOutcome, businessRef?: string): Res & { requestId?: string } {
  if (!can(uid, "integrations", "view")) return NO(need("integrations", "View"));
  const spec = SIM_OP[integrationId];
  if (!spec) return NO("Not one of the ten SOW integrations");
  const n = state.requests.length + 1;
  const id = `REQ-${pad(n, 6)}`;
  const ref = businessRef?.trim() || `SIM-${integrationId.slice(4)}-${pad(n, 5)}`;
  const fail = outcome === "validation_error" || outcome === "timeout" || outcome === "provider_failure";
  const req: IntegrationRequest = {
    id, integrationId, operation: outcome === "duplicate_callback" ? `${spec.op} — callback (duplicate ignored)` : spec.op, messageType: spec.type, businessRef: ref, memberId: null, at: now(), respondedAt: outcome === "timeout" ? null : now(),
    status: outcome === "timeout" ? "timeout" : fail ? "failed" : "success", httpStatus: outcome === "validation_error" ? 422 : outcome === "provider_failure" ? 503 : outcome === "timeout" ? null : 200, durationMs: outcome === "timeout" ? 30000 : 420,
    errorCategory: outcome === "validation_error" ? "validation" : outcome === "provider_failure" ? "http_5xx" : outcome === "timeout" ? "timeout" : null,
    error: outcome === "validation_error" ? "Mandatory field missing (simulated)" : outcome === "provider_failure" ? "Provider unavailable (simulated)" : outcome === "timeout" ? "No response within the timeout (simulated)" : null,
    retryCount: 0, traceId: `TRC-SIM-${pad(n, 6)}`, payload: { simulated: "yes", outcome }, sensitivePayload: false, source: "Client Demo (simulated adapter)", financial: !!spec.financial,
  };
  commit(audited({ ...state, requests: [...state.requests, req] }, uid, "integrations", `simulated_${outcome}`, id, ref, "Client Demo presenter control: simulated adapter, no external call", req.traceId));
  return { ...OK(id, outcome === "duplicate_callback" ? ["Duplicate callback recognised and ignored"] : []), requestId: id };
}
