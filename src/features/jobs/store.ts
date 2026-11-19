/**
 * PROPOSED Module 12 — Job Management & Field Tooling (SOW 12.1–12.11). Development / demo mode only.
 * - Access: `proposed-scope` permissions, held only by the Evolve Super Admin until a business approval
 *   is recorded. The View-As guard and every other access rule still apply.
 * - Siebel stays the system of record. Jobs arrive through a MOCK Siebel adapter; nothing calls Siebel.
 * - No real job is allocated, no notification or customer message is sent, and no points are credited:
 *   reward processing is simulated against the existing wallet service and never posts to the ledger.
 * - Members, branches, products, wallets, schemes and surveys are read from their own stores by ID.
 */
import { useSyncExternalStore } from "react";
import { FEATURE_GATES, MODULE12_DECISIONS } from "@/config/jobsCatalogue";
import { accessStore } from "@/features/access/store";
import { hasPermission, type PolicyResult } from "@/features/access/engine";
import { demoNow } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { geoOfMember, memberById } from "@/features/members/engine";
import { masterStore } from "@/features/masters/store";
import { walletStore } from "@/features/wallet/store";
import { schemeStore } from "@/features/schemes/store";
import { memberBalances } from "@/features/wallet/engine";
import type { ActionId } from "@/types/rbac";
import type { Member } from "@/types/members";
import type { Assignment, CompletionPhoto, JobEvent, JobRewardConfig, JobType, JobsState, ProposedDecisionStatus, ProposedJob, SiebelJobPayload, SiebelResult, Tri, VisitSurveyRule } from "@/types/jobs";

const STORAGE_KEY = "vg-rishta.jobs-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[], w = 4) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1, w)}`;
const can = (uid: string, action: ActionId) => uid === SEED || hasPermission(acc(), uid, "proposed-scope", action).allowed;
const SEED = "SYSTEM-SEED";
const NEED = (a: string) => `Proposed Module 12 is restricted: you need Proposed scope (Module 12): ${a}. Only the Evolve Super Admin holds it until V-Guard approves the scope`;
const hasApp = (m: Member) => !["pending", "rejected", "invited"].includes(m.status) && !!m.registration.firstLoginAt;
const ACTIVE_JOB: ProposedJob["status"][] = ["assigned", "accepted", "in_progress", "completion_submitted", "awaiting_siebel"];

/* ======================= State plumbing ======================= */

let state: JobsState;
const listeners = new Set<() => void>();
function commit(next: JobsState) {
  if (next === state) return;
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const jobsStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useJobsState = () => useSyncExternalStore(jobsStore.subscribe, jobsStore.get, jobsStore.get);
function audit(actor: string, action: string, entity: string, detail: string, result: "success" | "refused" = "success") {
  state = { ...state, audit: [...state.audit, { id: `M12-${pad(state.audit.length + 1, 6)}`, at: now(), actor, action, entity, detail, result }] };
}
function refuse(uid: string, action: string, entity: string, reason: string): Res {
  audit(uid, action, entity, reason, "refused");
  commit({ ...state });
  return NO(reason);
}
const ev = (status: string, source: JobEvent["source"], by: string, remarks: string, ref: string | null = null): JobEvent => ({ at: now(), status, source, ref, by, remarks });
const setJob = (id: string, fn: (j: ProposedJob) => ProposedJob) => (state = { ...state, jobs: state.jobs.map((j) => (j.id === id ? fn(j) : j)) });

/* ======================= People (read from Member Management) ======================= */

export const technicians = () => mem().members.filter((m) => m.programme === "ST" && hasApp(m));
export const electricians = () => mem().members.filter((m) => m.programme === "EP" && hasApp(m));
export const retailers = () => mem().members.filter((m) => m.programme === "Retailer");

/* ======================= Mock Siebel inbound adapter (OP-52 / OP-55) ======================= */

/** Validates a draft payload. Missing customer data is flagged, never filled in. */
function payloadIssues(p: SiebelJobPayload) {
  const i: string[] = [];
  if (!p.customer.ref) i.push("Customer reference missing");
  if (!p.address.line && !p.address.pincode) i.push("Service address missing");
  if (!p.jobType) i.push("Job type missing");
  if (!p.product.skuRef && !p.product.name) i.push("Product missing");
  return i;
}
export function receiveSiebelJob(actor: string, p: SiebelJobPayload): Res {
  if (!can(actor, "edit")) return refuse(actor, "siebel_job_receive_refused", p.siebelJobRef, NEED("Edit"));
  if (!p.siebelJobRef?.trim()) return NO("Siebel job reference missing: the message is rejected");
  const dup = state.jobs.find((j) => j.siebelJobRef === p.siebelJobRef);
  if (dup) {
    const id = nextId("INB", state.inbound, 5);
    state = { ...state, inbound: [...state.inbound, { id, at: now(), siebelJobRef: p.siebelJobRef, result: "duplicate", jobId: dup.id, remarks: "Same Siebel job reference received again: not created twice" }], exceptions: [...state.exceptions, { id: nextId("M12X", state.exceptions), at: now(), kind: "duplicate_inbound", ref: p.siebelJobRef, jobId: dup.id, status: "open", note: "Duplicate inbound job message" }] };
    audit(actor, "siebel_job_duplicate", p.siebelJobRef, dup.id);
    commit({ ...state });
    return { ...NO(`Duplicate Siebel job reference ${p.siebelJobRef}: already recorded as ${dup.id}`), id: dup.id };
  }
  const issues = payloadIssues(p);
  const id = nextId("JOB", state.jobs);
  const job: ProposedJob = { id, siebelJobRef: p.siebelJobRef, payload: p, issues, programme: "ST", status: issues.length ? "received" : "pending_allocation", technicianId: null, createdAt: now(), assignedAt: null, start: null, photos: [], siebel: null, reward: "not_eligible", demo: true, timeline: [ev("Received", "Siebel (mock adapter)", actor, "Job message from the mock Siebel adapter", p.siebelJobRef), ev(issues.length ? "Validation failed" : "Validated", "Platform", "SYSTEM", issues.length ? issues.join("; ") : "Draft payload checks passed (OP-52 pending)")] };
  state = { ...state, jobs: [...state.jobs, job], inbound: [...state.inbound, { id: nextId("INB", state.inbound, 5), at: now(), siebelJobRef: p.siebelJobRef, result: issues.length ? "incomplete" : "accepted", jobId: id, remarks: issues.join("; ") || "Accepted" }], exceptions: issues.length ? [...state.exceptions, { id: nextId("M12X", state.exceptions), at: now(), kind: "incomplete_payload", ref: p.siebelJobRef, jobId: id, status: "open", note: issues.join("; ") }] : state.exceptions };
  audit(actor, "siebel_job_received", id, p.siebelJobRef);
  commit({ ...state });
  return OK(id, issues.length ? [`Held for missing data: ${issues.join("; ")}`] : []);
}

/* ======================= Allocation (OP-53): comparison only ======================= */

export interface Candidate { technicianId: string; name: string; branchCode: string; territory: Tri; verified: Tri; skill: Tri; workload: number; eligibility: "pending_rule" }
export function allocationCandidates(jobId: string): Candidate[] {
  const j = state.jobs.find((x) => x.id === jobId);
  if (!j) return [];
  return technicians().map((t) => {
    const territory: Tri = j.payload.branchCode ? (t.branchCode === j.payload.branchCode ? "yes" : "no") : j.payload.address.district && t.addresses.working?.district ? (t.addresses.working.district === j.payload.address.district ? "yes" : "no") : "unknown";
    const flag = state.flags.find((f) => f.technicianId === t.id && f.status === "demo_granted");
    return { technicianId: t.id, name: t.name, branchCode: t.branchCode, territory, verified: (flag ? "yes" : "no") as Tri, skill: "unknown" as Tri, workload: state.jobs.filter((x) => x.technicianId === t.id && ACTIVE_JOB.includes(x.status)).length, eligibility: "pending_rule" as const };
  }).sort((a, b) => (a.territory === b.territory ? 0 : a.territory === "yes" ? -1 : b.territory === "yes" ? 1 : 0));
}
export function createDemoAssignment(uid: string, jobId: string, technicianId: string): Res {
  if (!can(uid, "edit")) return refuse(uid, "demo_assignment_refused", jobId, NEED("Edit"));
  const j = state.jobs.find((x) => x.id === jobId);
  if (!j) return NO("Job not found");
  if (j.status !== "pending_allocation") return NO(j.status === "received" ? "The job is held for missing data and cannot be allocated" : `Already ${j.status.replace(/_/g, " ")}: a job is not assigned twice`);
  const c = allocationCandidates(jobId).find((x) => x.technicianId === technicianId);
  if (!c) return NO("Not an active Service Technician");
  if (c.territory === "no") return refuse(uid, "demo_assignment_refused", jobId, `${technicianId} is outside the job's territory. Territory rules are pending OP-53; the prototype only assigns territory-matched technicians`);
  const a: Assignment = { id: nextId("ASN", state.assignments), jobId, technicianId, at: now(), by: uid, factors: { territory: c.territory, verified: c.verified, skill: c.skill, workload: `${c.workload} active demo job(s)` }, notification: "not_sent_demo", response: "awaiting", respondedAt: null, declineNote: null, mode: "manual_demo" };
  state = { ...state, assignments: [...state.assignments, a] };
  setJob(jobId, (x) => ({ ...x, status: "assigned", technicianId, assignedAt: now(), timeline: [...x.timeline, ev("Assigned", "Prototype user", uid, `Demo assignment to ${technicianId}; notification not sent (demo mode)`, a.id)] }));
  audit(uid, "demo_assignment_created", jobId, `${technicianId} (${a.id})`);
  commit({ ...state });
  return OK(a.id, ["Demo only: no technician is notified and no production job is assigned"]);
}
/** Simulated technician response. No acceptance window or decline reason is invented. */
export function simulateTechnicianResponse(uid: string, jobId: string, response: "accepted" | "declined" | "no_response", note = ""): Res {
  if (!can(uid, "edit")) return refuse(uid, "technician_response_refused", jobId, NEED("Edit"));
  const a = [...state.assignments].reverse().find((x) => x.jobId === jobId && x.response === "awaiting");
  if (!a) return NO("No assignment is awaiting a response");
  state = { ...state, assignments: state.assignments.map((x) => (x.id === a.id ? { ...x, response, respondedAt: now(), declineNote: response === "declined" ? note || null : null } : x)) };
  if (response === "accepted") setJob(jobId, (x) => ({ ...x, status: "accepted", timeline: [...x.timeline, ev("Accepted", "Technician app (simulated)", a.technicianId, "Simulated acceptance", a.id)] }));
  else setJob(jobId, (x) => ({ ...x, status: "pending_allocation", technicianId: null, assignedAt: null, timeline: [...x.timeline, ev(response === "declined" ? "Declined" : "No response", "Technician app (simulated)", a.technicianId, response === "declined" ? note || "Declined (no reason codes defined)" : "No acceptance: handling pending OP-53; back to manual allocation", a.id)] }));
  audit(uid, `technician_${response}`, jobId, a.technicianId);
  commit({ ...state });
  return OK(a.id, response === "accepted" ? [] : ["Returned to Pending allocation; no-acceptance handling is pending OP-53"]);
}

/* ======================= Execution evidence ======================= */

export function recordJobStart(uid: string, jobId: string, e: { selfieRef: string; gps: { lat: number; lng: number } | null }): Res {
  if (!can(uid, "edit")) return refuse(uid, "job_start_refused", jobId, NEED("Edit"));
  const j = state.jobs.find((x) => x.id === jobId);
  if (!j) return NO("Job not found");
  if (j.status !== "accepted") return NO("Only an accepted job can start");
  if (!e.selfieRef.trim()) return refuse(uid, "job_start_refused", jobId, "Selfie missing or upload failed: the job cannot start without start evidence");
  if (!e.gps || !Number.isFinite(e.gps.lat) || !Number.isFinite(e.gps.lng)) return refuse(uid, "job_start_refused", jobId, "GPS unavailable: the job cannot start without location evidence");
  setJob(jobId, (x) => ({ ...x, status: "in_progress", start: { selfieRef: e.selfieRef, capturedAt: now(), gps: e.gps, locationStatus: "not_validated" }, timeline: [...x.timeline, ev("Started", "Technician app (simulated)", x.technicianId!, "Selfie and GPS captured; location validation rule pending V-Guard", e.selfieRef)] }));
  audit(uid, "job_started", jobId, e.selfieRef);
  commit({ ...state });
  return OK(jobId);
}
/** Completion with photo evidence, then a draft submission to the mock Siebel adapter. */
export function submitCompletion(uid: string, jobId: string, photos: { ref: string; category: string }[]): Res {
  if (!can(uid, "edit")) return refuse(uid, "completion_refused", jobId, NEED("Edit"));
  const j = state.jobs.find((x) => x.id === jobId);
  if (!j) return NO("Job not found");
  if (j.status === "awaiting_siebel" || j.status === "completion_submitted") return refuse(uid, "completion_duplicate_refused", jobId, "Completion already submitted: duplicates are not sent to Siebel");
  if (j.status !== "in_progress") return NO("Only a started job can be completed");
  const valid = photos.filter((p) => p.ref.trim());
  if (!valid.length) return refuse(uid, "completion_refused", jobId, "Completion evidence missing. The number and type of mandatory photos are for V-Guard to define");
  const ph: CompletionPhoto[] = valid.map((p) => ({ ref: p.ref.trim(), category: p.category || "Unclassified", uploadedAt: now(), capture: "source_unconfirmed", status: "received" }));
  const sub = { id: nextId("SUB", state.submissions), jobId, technicianId: j.technicianId!, submittedAt: now(), payload: { jobRef: j.siebelJobRef, technicianRef: j.technicianId!, completedAt: now(), startEvidenceRef: j.start!.selfieRef, locationEvidenceRef: j.start!.gps ? `GPS-${j.id}` : null, photoRefs: ph.map((p) => p.ref), completionStatus: "completed" as const, supportingInfo: "" }, result: "pending" as SiebelResult, respondedAt: null, confirmationRef: null, rejectionReason: null, errorRef: null, retry: "none" as const };
  state = { ...state, submissions: [...state.submissions, sub], rewards: [...state.rewards.filter((r) => r.jobId !== jobId), { jobId, technicianId: j.technicianId!, configId: null, expectedPoints: null, status: "pending", siebelConfirmationRef: null, simulatedLedgerRef: null, walletRef: null, note: "Not eligible until Siebel confirms completion" }] };
  setJob(jobId, (x) => ({ ...x, status: "awaiting_siebel", photos: ph, siebel: "pending", reward: "pending", timeline: [...x.timeline, ev("Completion submitted", "Technician app (simulated)", x.technicianId!, `${ph.length} photo reference(s)`), ev("Sent to Siebel", "Platform", "SYSTEM", "Draft completion payload to the mock Siebel adapter (OP-52)", sub.id)] }));
  audit(uid, "completion_submitted", jobId, sub.id);
  commit({ ...state });
  return OK(sub.id, ["Awaiting Siebel confirmation: points stay uncredited until Siebel confirms"]);
}

/* ======================= Siebel confirmation (mock callback) ======================= */

const matchConfig = (j: ProposedJob): JobRewardConfig | null => state.rewardConfigs.filter((c) => c.jobType === j.payload.jobType && (!c.productRef || c.productRef === j.payload.product.skuRef) && (!c.territory || c.territory === j.payload.branchCode)).slice(-1)[0] ?? null;
export function siebelCallback(actor: string, c: { requestRef: string; result: "confirmed" | "rejected" | "integration_error"; confirmationRef?: string; rejectionReason?: string }): Res {
  if (!can(actor, "edit")) return refuse(actor, "siebel_callback_refused", c.requestRef, NEED("Edit"));
  const sub = state.submissions.find((s) => s.id === c.requestRef);
  const id = nextId("CBK", state.callbacks);
  if (!sub) {
    state = { ...state, callbacks: [...state.callbacks, { id, at: now(), requestRef: c.requestRef, result: c.result, confirmationRef: c.confirmationRef ?? null, rejectionReason: c.rejectionReason ?? null, outcome: "unknown_request" }] };
    commit({ ...state });
    return NO("Unknown request reference: callback recorded, nothing changed");
  }
  if (sub.result === "confirmed" || sub.result === "rejected") {
    state = { ...state, callbacks: [...state.callbacks, { id, at: now(), requestRef: c.requestRef, result: c.result, confirmationRef: c.confirmationRef ?? null, rejectionReason: c.rejectionReason ?? null, outcome: "duplicate_ignored" }] };
    audit(actor, "siebel_callback_duplicate", sub.jobId, c.requestRef);
    commit({ ...state });
    return OK(id, ["Duplicate callback ignored: no second reward"]);
  }
  state = { ...state, callbacks: [...state.callbacks, { id, at: now(), requestRef: c.requestRef, result: c.result, confirmationRef: c.confirmationRef ?? null, rejectionReason: c.rejectionReason ?? null, outcome: "applied" }], submissions: state.submissions.map((s) => (s.id === sub.id ? { ...s, result: c.result, respondedAt: now(), confirmationRef: c.confirmationRef ?? null, rejectionReason: c.rejectionReason ?? null, errorRef: c.result === "integration_error" ? `ERR-${id}` : null, retry: c.result === "integration_error" ? "awaiting_manual_resolution" : "none" } : s)) };
  const j = state.jobs.find((x) => x.id === sub.jobId)!;
  if (c.result === "confirmed") {
    const cfg = matchConfig(j);
    state = { ...state, rewards: state.rewards.map((r) => (r.jobId === j.id ? { ...r, status: "eligible", configId: cfg?.id ?? null, expectedPoints: cfg?.points ?? null, siebelConfirmationRef: c.confirmationRef ?? null, note: cfg ? "Eligible under a DRAFT reward configuration (OP-56): not credited" : "Eligible, but no reward configuration exists (OP-56)" } : r)) };
    setJob(j.id, (x) => ({ ...x, status: "confirmed", siebel: "confirmed", reward: "eligible", timeline: [...x.timeline, ev("Siebel confirmed", "Siebel (mock adapter)", actor, "Authoritative confirmation (mock)", c.confirmationRef ?? null)] }));
  } else if (c.result === "rejected") {
    state = { ...state, rewards: state.rewards.map((r) => (r.jobId === j.id ? { ...r, status: "not_eligible", note: `Siebel rejected completion: ${c.rejectionReason || "no reason supplied"}` } : r)), exceptions: [...state.exceptions, { id: nextId("M12X", state.exceptions), at: now(), kind: "rejection", ref: sub.id, jobId: j.id, status: "open", note: c.rejectionReason || "No reason supplied" }] };
    setJob(j.id, (x) => ({ ...x, status: "rejected", siebel: "rejected", reward: "not_eligible", timeline: [...x.timeline, ev("Siebel rejected", "Siebel (mock adapter)", actor, c.rejectionReason || "No reason supplied; evidence retained", sub.id)] }));
  } else {
    state = { ...state, exceptions: [...state.exceptions, { id: nextId("M12X", state.exceptions), at: now(), kind: "integration_error", ref: sub.id, jobId: j.id, status: "open", note: "Integration error from the mock adapter" }] };
    setJob(j.id, (x) => ({ ...x, siebel: "awaiting_manual_resolution", timeline: [...x.timeline, ev("Integration error", "Siebel (mock adapter)", actor, "Job stays Awaiting Siebel confirmation", sub.id)] }));
  }
  audit(actor, `siebel_${c.result}`, j.id, c.requestRef);
  commit({ ...state });
  return OK(id);
}
/** No response from Siebel: nothing is approved or rejected automatically (OP-52 / OP-55). */
export function recordSiebelTimeout(uid: string, requestRef: string): Res {
  if (!can(uid, "edit")) return refuse(uid, "siebel_timeout_refused", requestRef, NEED("Edit"));
  const sub = state.submissions.find((s) => s.id === requestRef);
  if (!sub || sub.result !== "pending") return NO("Only a pending submission can time out");
  state = { ...state, submissions: state.submissions.map((s) => (s.id === requestRef ? { ...s, result: "timeout", retry: "awaiting_manual_resolution" } : s)), exceptions: [...state.exceptions, { id: nextId("M12X", state.exceptions), at: now(), kind: "timeout", ref: requestRef, jobId: sub.jobId, status: "open", note: "No Siebel response. Wait period and handling pending OP-52 / OP-55" }] };
  setJob(sub.jobId, (x) => ({ ...x, siebel: "timeout", timeline: [...x.timeline, ev("No Siebel response", "Platform", "SYSTEM", "Integration exception raised; job stays Awaiting Siebel confirmation; points not credited", requestRef)] }));
  audit(uid, "siebel_timeout_recorded", sub.jobId, requestRef);
  commit({ ...state });
  return OK(requestRef, ["No automatic approval or rejection: resolution pending OP-52 / OP-55"]);
}
/** A pending or rejected job is never turned into Confirmed by an administrator. */
export function overrideSiebelResult(uid: string, jobId: string): Res {
  return refuse(uid, "siebel_override_refused", jobId, "Only Siebel can confirm a job. A manual override needs an authorised business process, which is not defined (OP-52 / OP-55)");
}

/* ======================= Rewards (OP-56) ======================= */

export function createRewardConfigDraft(uid: string, c: { jobType: JobType; productRef?: string | null; territory?: string | null; campaignFrom?: string | null; campaignTo?: string | null; points: number; effectiveFrom: string }): Res {
  if (!can(uid, "edit")) return refuse(uid, "reward_config_refused", "reward-config", NEED("Edit"));
  if (!Number.isInteger(c.points) || c.points <= 0) return NO("Points must be a whole number above zero");
  if (!c.effectiveFrom) return NO("Effective date required");
  const id = nextId("JRC", state.rewardConfigs);
  state = { ...state, rewardConfigs: [...state.rewardConfigs, { id, jobType: c.jobType, productRef: c.productRef ?? null, territory: c.territory ?? null, campaignFrom: c.campaignFrom ?? null, campaignTo: c.campaignTo ?? null, points: c.points, effectiveFrom: c.effectiveFrom, status: "draft", createdBy: uid, createdAt: now() }] };
  audit(uid, "reward_config_draft_created", id, `${c.jobType} ${c.points} pts`);
  commit({ ...state });
  return OK(id, ["Draft only: activation is pending OP-56"]);
}
export function activateRewardConfig(uid: string, id: string): Res {
  return refuse(uid, "reward_config_activation_refused", id, "Job reward configurations cannot be activated: the Scheme Engine vs separate set-up decision (OP-56) is open");
}
/**
 * Simulated processing through the existing wallet service: confirms the technician has an active
 * wallet and produces a SIMULATED ledger reference. Nothing is posted to the ledger.
 */
export function simulateRewardProcessing(uid: string, jobId: string): Res {
  if (!can(uid, "edit")) return refuse(uid, "reward_simulation_refused", jobId, NEED("Edit"));
  const r = state.rewards.find((x) => x.jobId === jobId);
  const j = state.jobs.find((x) => x.id === jobId);
  if (!r || !j) return NO("No reward record for this job");
  if (r.status === "simulated_credit") return NO("Already processed (simulation): no second reward");
  if (j.siebel !== "confirmed" || r.status !== "eligible") return refuse(uid, "reward_before_confirmation_refused", jobId, "Not eligible: Siebel has not confirmed this job, so no points can be processed");
  if (!r.configId || r.expectedPoints == null) return NO("No reward configuration matches this job (OP-56)");
  const wallet = walletStore.get().wallets.find((w) => w.memberId === r.technicianId && w.status === "active");
  if (!wallet) return NO(`${r.technicianId} has no active wallet in the Wallet service`);
  const simulatedLedgerRef = `SIM-LED-${jobId}`;
  state = { ...state, rewards: state.rewards.map((x) => (x.jobId === jobId ? { ...x, status: "simulated_credit", simulatedLedgerRef, walletRef: `WAL-${wallet.memberId}`, note: `Simulated against wallet WAL-${wallet.memberId}: no ledger line was written` } : x)) };
  setJob(jobId, (x) => ({ ...x, reward: "simulated_credit", timeline: [...x.timeline, ev("Reward processed (simulated)", "Platform", uid, `${r.expectedPoints} points (draft configuration ${r.configId}); not credited`, simulatedLedgerRef)] }));
  audit(uid, "reward_simulated", jobId, `${simulatedLedgerRef} · WAL-${wallet.memberId}`);
  commit({ ...state });
  return OK(simulatedLedgerRef, ["Simulation only: the member's wallet balance is unchanged"]);
}
export function creditJobReward(uid: string, jobId: string): Res {
  return refuse(uid, "reward_credit_refused", jobId, "Production crediting of job rewards is disabled (OP-56, OP-52): Module 12 is Proposed");
}

/* ======================= Verified / Exclusive flag (OP-58) ======================= */

export function grantVerificationFlag(uid: string, technicianId: string, p: { reason: string; effectiveFrom: string; expiresOn?: string | null }): Res {
  if (!can(uid, "manage")) return refuse(uid, "flag_grant_refused", technicianId, NEED("Manage"));
  const t = memberById(mem(), technicianId);
  if (!t || t.programme !== "ST") return NO("Only Service Technicians can be flagged");
  if (!p.reason.trim()) return NO("Record the reason (V-Guard criteria are pending OP-58)");
  if (p.expiresOn && p.expiresOn < p.effectiveFrom) return NO("Expiry is before the effective date");
  if (state.flags.some((f) => f.technicianId === technicianId && f.status === "demo_granted")) return NO("Already flagged");
  const id = nextId("VTF", state.flags);
  state = { ...state, flags: [...state.flags, { id, technicianId, status: "demo_granted", effectiveFrom: p.effectiveFrom, expiresOn: p.expiresOn ?? null, grantedBy: uid, reason: p.reason.trim(), approval: "pending_op58", history: [{ at: now(), by: uid, change: `Granted (demo): ${p.reason.trim()}` }] }] };
  audit(uid, "flag_granted_demo", technicianId, id);
  commit({ ...state });
  return OK(id, ["Demo flag: V-Guard's approval route and criteria are pending OP-58; no benefit is unlocked"]);
}
export function revokeVerificationFlag(uid: string, flagId: string, reason: string): Res {
  if (!can(uid, "manage")) return refuse(uid, "flag_revoke_refused", flagId, NEED("Manage"));
  const f = state.flags.find((x) => x.id === flagId);
  if (!f || f.status !== "demo_granted") return NO("No active flag");
  if (!reason.trim()) return NO("Record the reason");
  state = { ...state, flags: state.flags.map((x) => (x.id === flagId ? { ...x, status: "revoked", history: [...x.history, { at: now(), by: uid, change: `Revoked: ${reason.trim()}` }] } : x)) };
  audit(uid, "flag_revoked_demo", f.technicianId, reason);
  commit({ ...state });
  return OK(flagId);
}
export const FLAG_CAPABILITIES = [
  { id: "FC-1", kind: "jobs" as const, description: "Specific jobs (to be defined)", active: false as const },
  { id: "FC-2", kind: "communications" as const, description: "Specific communications (to be defined)", active: false as const },
  { id: "FC-3", kind: "customer_opportunity" as const, description: "Customer-facing opportunities (to be defined)", active: false as const },
];

/* ======================= Happy Points (OP-57) and E-ID card (OP-59) ======================= */

export const HAPPY_CONFIG = { fields: [{ key: "rating", label: "Rating", note: "Scale shown as 1–5 for the preview only" }, { key: "comment", label: "Comment (optional)" }, { key: "jobRef", label: "Job reference (system)" }, { key: "submittedAt", label: "Feedback timestamp (system)" }], channel: "Pending OP-57 (WhatsApp or SMS)", conversion: null as null, beneficiary: null as null, microsite: "Preview only — not published" };
export function createFeedbackLink(uid: string, jobId: string): Res {
  if (!can(uid, "edit")) return refuse(uid, "feedback_link_refused", jobId, NEED("Edit"));
  const j = state.jobs.find((x) => x.id === jobId);
  if (!j || j.status !== "confirmed") return NO("Feedback links are only prepared for Siebel-confirmed jobs");
  if (state.feedbackLinks.some((l) => l.jobId === jobId)) return NO("A link already exists for this job");
  const id = nextId("HPL", state.feedbackLinks);
  state = { ...state, feedbackLinks: [...state.feedbackLinks, { id, jobId, technicianId: j.technicianId!, createdAt: now(), delivery: "not_sent_disabled", submissionId: null }] };
  audit(uid, "feedback_link_prepared", jobId, id);
  commit({ ...state });
  return OK(id, ["Prepared, not sent: customer messaging is disabled (OP-57, OP-59)"]);
}
export function sendFeedbackLink(uid: string, linkId: string): Res {
  return refuse(uid, "customer_message_refused", linkId, "Customer messaging is disabled: channel, consent policy and provider are not approved (OP-57)");
}
export function simulateFeedback(uid: string, linkId: string, rating: number, comment: string): Res {
  if (!can(uid, "edit")) return refuse(uid, "feedback_simulation_refused", linkId, NEED("Edit"));
  const l = state.feedbackLinks.find((x) => x.id === linkId);
  if (!l) return NO("Link not found");
  if (l.submissionId) return NO("Feedback already submitted for this link");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NO("Choose a rating (preview scale 1–5)");
  const id = nextId("HPF", state.feedback);
  state = { ...state, feedback: [...state.feedback, { id, linkId, jobId: l.jobId, technicianId: l.technicianId, at: now(), rating, comment: comment.slice(0, 280), happyPoints: "pending_decision", simulated: true }], feedbackLinks: state.feedbackLinks.map((x) => (x.id === linkId ? { ...x, submissionId: id } : x)) };
  audit(uid, "feedback_simulated", l.jobId, id);
  commit({ ...state });
  return OK(id, ["No Happy Points awarded: the conversion rule and beneficiary are pending OP-57"]);
}
/** E-ID card preview: no mobile number, address or photograph content — only a photo reference. */
export function previewEidCard(technicianId: string) {
  const t = memberById(mem(), technicianId);
  if (!t || t.programme !== "ST") return null;
  const flag = state.flags.find((f) => f.technicianId === technicianId && f.status === "demo_granted");
  return { name: t.name, technicianId: t.id, photo: "Photo reference only (not displayed in the preview)", branding: "V-Guard", verified: flag ? "Verified / Exclusive (demo flag, OP-58)" : "Not shown", validity: "Pending OP-59", qr: "Not approved (OP-59)" };
}
export function deliverEidCard(uid: string, jobId: string): Res {
  const j = state.jobs.find((x) => x.id === jobId);
  if (j && j.technicianId && can(uid, "edit")) state = { ...state, eidDeliveries: [...state.eidDeliveries, { id: nextId("EID", state.eidDeliveries), jobId, technicianId: j.technicianId, at: now(), channel: "whatsapp_proposed", consent: { status: "not_captured", at: null, source: null, purpose: "Identify the visiting technician", recordRef: null, withdrawn: null }, timing: "pending_op59", outcome: "blocked", reason: "No approved consent policy or customer messaging provider" }] };
  return refuse(uid, "eid_delivery_refused", jobId, "E-ID card delivery is disabled: card content, timing, channel and customer consent are pending OP-59");
}

/* ======================= Field tooling: quotations, tagging, visits, work location ======================= */

export function createQuotationDraft(uid: string, q: { electricianId: string; customerRef: string; description: string } & Record<string, unknown>): Res {
  if (!can(uid, "edit")) return refuse(uid, "quotation_refused", q.electricianId, NEED("Edit"));
  const financial = Object.keys(q).filter((k) => /price|amount|tax|gst|discount|total|rate/i.test(k));
  if (financial.length) return refuse(uid, "quotation_financial_refused", q.electricianId, `Financial fields are not approved (OP-29): ${financial.join(", ")}`);
  const e = memberById(mem(), q.electricianId);
  if (!e || e.programme !== "EP") return NO("Choose an electrician (EP member)");
  if (!q.customerRef.trim() || !q.description.trim()) return NO("Customer reference and description are required");
  const id = nextId("QTN", state.quotations);
  state = { ...state, quotations: [...state.quotations, { id, electricianId: e.id, customerRef: q.customerRef.trim(), description: q.description.trim(), date: now().slice(0, 10), status: "draft", shared: "not_shared", format: "pending_op29", createdBy: uid }] };
  audit(uid, "quotation_draft_created", id, e.id);
  commit({ ...state });
  return OK(id, ["Prototype draft: fields, calculations, tax and output format are pending OP-29"]);
}
export function issueQuotation(uid: string, id: string): Res {
  return refuse(uid, "quotation_issue_refused", id, "Quotations cannot be issued or shared: the module is not approved (OP-29)");
}
const addr = (m: Member) => m.addresses.working ?? m.addresses.home;
export function createRetailerTag(uid: string, electricianId: string, retailerId: string, source: "pincode" | "address"): Res {
  if (!can(uid, "edit")) return refuse(uid, "retailer_tag_refused", electricianId, NEED("Edit"));
  const e = memberById(mem(), electricianId), r = memberById(mem(), retailerId);
  if (!e || e.programme !== "EP") return NO("Choose an electrician (EP member)");
  if (!r || r.programme !== "Retailer") return NO("Choose a retailer (Retailer member)");
  if (state.tags.some((t) => t.electricianId === electricianId && t.retailerId === retailerId)) return NO("Already tagged");
  const a = addr(r);
  if (source === "pincode" && !a?.pincode) return NO("The retailer has no pincode on record");
  const id = nextId("RTG", state.tags);
  state = { ...state, tags: [...state.tags, { id, electricianId, retailerId, pincode: a?.pincode ?? null, address: source === "address" ? a?.line ?? null : null, source, status: "demo", effectiveFrom: now().slice(0, 10), updatedAt: now() }] };
  audit(uid, "retailer_tag_demo", id, `${electricianId} → ${retailerId}`);
  commit({ ...state });
  return OK(id, ["Demo tag: tagging rules and location source are pending OP-27"]);
}
export function saveRadiusDraft(uid: string, km: number | null): Res {
  if (!can(uid, "manage")) return refuse(uid, "radius_refused", "radius", NEED("Manage"));
  if (km != null && (!Number.isFinite(km) || km <= 0)) return NO("Radius must be a positive number of kilometres, or blank");
  state = { ...state, radius: { ...state.radius, radiusKm: km, status: "inactive" } };
  audit(uid, "radius_draft_saved", "radius", km == null ? "blank" : `${km} km`);
  commit({ ...state });
  return OK(undefined, ["Stays inactive: no default radius is set until OP-27 is confirmed"]);
}
const validCoord = (lat?: number | null, lng?: number | null) => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/** Distances only where both working locations have valid coordinates; nothing is estimated. */
export function retailerProximity(electricianId: string) {
  const e = memberById(mem(), electricianId);
  const ew = e?.addresses.working;
  const origin = ew && validCoord(ew.lat, ew.lng) ? { lat: ew.lat!, lng: ew.lng! } : null;
  return {
    origin: origin ? "Working location (coordinates on record)" : "No valid working-location coordinates",
    rows: state.tags.filter((t) => t.electricianId === electricianId).map((t) => {
      const r = memberById(mem(), t.retailerId)?.addresses.working;
      const dest = r && validCoord(r.lat, r.lng) ? { lat: r.lat!, lng: r.lng! } : null;
      return { retailerId: t.retailerId, pincode: t.pincode, distanceKm: origin && dest ? Math.round(km(origin, dest) * 10) / 10 : null, note: !origin ? "Electrician coordinates missing" : !dest ? "Retailer coordinates missing" : "Calculated from recorded coordinates" };
    }),
  };
}
export function saveVisitSurveyRule(uid: string, r: Partial<Omit<VisitSurveyRule, "id" | "status">>): Res {
  if (!can(uid, "manage")) return refuse(uid, "visit_rule_refused", "visit-rule", NEED("Manage"));
  const id = nextId("RVS", state.surveyRules);
  state = { ...state, surveyRules: [...state.surveyRules, { id, surveyRef: r.surveyRef ?? null, triggerDistanceM: r.triggerDistanceM ?? null, frequency: r.frequency ?? null, visitVerification: r.visitVerification ?? null, audience: r.audience ?? null, dedupWindow: r.dedupWindow ?? null, status: "inactive" }] };
  audit(uid, "visit_rule_draft", id, "inactive");
  commit({ ...state });
  return OK(id, ["Inactive: trigger distance, frequency and visit verification are pending OP-28; tagging pending OP-27"]);
}
export function triggerVisitSurvey(uid: string, electricianId: string, retailerId: string): Res {
  return refuse(uid, "visit_survey_refused", `${electricianId}→${retailerId}`, "Retailer-visit surveys are blocked until retailer tagging (OP-27) and the trigger rules (OP-28) are confirmed");
}
export function workLocationHistory() {
  const current = [...electricians(), ...technicians()].filter((m) => m.addresses.working).map((m) => ({ memberId: m.id, programme: m.programme, current: `${m.addresses.working!.line}, ${m.addresses.working!.district} ${m.addresses.working!.pincode}`, updatedAt: m.addresses.working!.updatedAt, source: m.addresses.working!.source, verification: m.addresses.working!.verification, branchCode: m.branchCode }));
  return { current, changes: state.workLocations };
}
export function recordWorkLocationChange(uid: string, memberId: string, to: string, reason: string): Res & { impact?: ReturnType<typeof workLocationImpact> } {
  if (!can(uid, "edit")) return refuse(uid, "work_location_refused", memberId, NEED("Edit"));
  const m = memberById(mem(), memberId);
  if (!m || !m.addresses.working) return NO("Member has no working location on record");
  if (!to.trim()) return NO("Enter the new working location");
  const id = nextId("WLC", state.workLocations);
  state = { ...state, workLocations: [...state.workLocations, { id, memberId, from: `${m.addresses.working.line}, ${m.addresses.working.district} ${m.addresses.working.pincode}`, to: to.trim(), at: now(), source: "prototype", status: "recorded_pending_policy", reason: reason.trim() }] };
  audit(uid, "work_location_change_recorded", memberId, id);
  commit({ ...state });
  return { ...OK(id, ["Recorded for review only: the member's location, branch mapping, retailer tags and geo-scheme eligibility are unchanged (OP-26)"]), impact: workLocationImpact(memberId) };
}
export function workLocationImpact(memberId: string) {
  const m = memberById(mem(), memberId)!;
  const geoSchemes = schemeStore.get().schemes.filter((s) => s.status === "active" && s.versions.some((v) => v.config.basic.programmes.includes(m.programme))).length;
  return { branchMapping: `${m.branchCode} (unchanged; re-mapping rule pending OP-26)`, retailerTags: state.tags.filter((t) => t.electricianId === memberId).length, geoSchemes: `${geoSchemes} active scheme(s) for ${m.programme} would need re-evaluation; not recalculated`, visibility: "Nearby-retailer visibility not recalculated" };
}

/* ======================= Sales Executive workspace (OP-36 / OP-37) ======================= */

/** Mapped members of a Sales Rep, using the access engine's scope and the existing wallet / scheme services. */
export function salesExecWorkspace(uid: string, salesRepId: string) {
  if (!can(uid, "view")) return { ...NO(NEED("View")), rows: [] };
  const rows = mem().members.filter((m) => hasPermission(acc(), salesRepId, "members", "view", { programme: m.programme, geo: geoOfMember(m) }).allowed).map((m) => {
    const docs = mem().documents.filter((d) => d.memberId === m.id && ["aadhaar", "pan", "bank"].includes(d.type));
    return { memberId: m.id, name: m.name, programme: m.programme, registration: m.status.replace(/_/g, " "), kyc: `${docs.filter((d) => d.status === "approved").length}/${docs.length} approved`, available: memberBalances(walletStore.get(), schemeStore.get(), mem(), m.id).available, schemes: new Set(schemeStore.get().accruals.filter((a) => a.memberId === m.id).map((a) => a.schemeId)).size, lastLogin: m.registration.firstLoginAt, followUp: m.status === "redemption_kyc_pending" ? "KYC pending" : !m.registration.firstLoginAt ? "Not logged in" : "—" };
  });
  return { ...OK(), rows };
}
export const salesExecCanSee = (salesRepId: string, memberId: string) => {
  const m = memberById(mem(), memberId);
  return !!m && hasPermission(acc(), salesRepId, "members", "view", { programme: m.programme, geo: geoOfMember(m) }).allowed;
};

/* ======================= Governance ======================= */

export function updateModule12Decision(uid: string, id: string, status: ProposedDecisionStatus, evidence: string): Res {
  if (!can(uid, "manage")) return refuse(uid, "decision_refused", id, NEED("Manage"));
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if ((status === "confirmed" || status === "decision_received") && !evidence.trim()) return NO("Record the confirmation evidence (who decided, when, reference)");
  state = { ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, status, evidence: evidence.trim(), decisionDate: status === "open" ? null : now().slice(0, 10) } : x)) };
  audit(uid, `decision_${status}`, id, evidence);
  commit({ ...state });
  return OK(id, ["Recording a decision does not activate any feature: production activation needs a formal scope approval"]);
}
export const decisionOf = (id: string) => state.decisions.find((d) => d.id === id)!;
/** Production activation is never available from the prototype. */
export function activateFeature(uid: string, gateId: string): Res {
  const g = FEATURE_GATES.find((x) => x.id === gateId);
  if (!g) return NO("Feature not found");
  const open = g.decisions.filter((d) => decisionOf(d)?.status !== "confirmed");
  return refuse(uid, "feature_activation_refused", gateId, open.length ? `Pending ${open.map((d) => decisionOf(d).ref).join(", ")}` : "Production activation needs a formal scope approval / change request; not available in this prototype");
}
export function jobTrace(jobId: string) {
  return {
    inbound: state.inbound.filter((x) => x.jobId === jobId),
    submissions: state.submissions.filter((x) => x.jobId === jobId),
    callbacks: state.callbacks.filter((c) => state.submissions.some((s) => s.id === c.requestRef && s.jobId === jobId)),
    exceptions: state.exceptions.filter((x) => x.jobId === jobId),
  };
}
/** Customer details are masked: nobody holds Proposed scope: View sensitive in this build. */
export function customerView(uid: string, j: ProposedJob) {
  const full = hasPermission(acc(), uid, "proposed-scope", "view_sensitive").allowed;
  const c = j.payload.customer;
  return { ref: c.ref ?? "Not supplied", name: c.name ? (full ? c.name : `${c.name[0]}•••• (masked)`) : "Not supplied", contact: c.contactRef ? (full ? c.contactRef : `••••${c.contactRef.slice(-4)}`) : "Not supplied", address: j.payload.address.line ? (full ? j.payload.address.line : "Masked (permission required)") : "Not supplied", pincode: j.payload.address.pincode ?? "Not supplied", district: j.payload.address.district ?? "Not supplied", product: j.payload.product.name ?? j.payload.product.skuRef ?? "Not supplied", warranty: j.payload.warrantyRef ?? "Not supplied" };
}
export function module12Overview() {
  const j = state.jobs, cnt = (s: ProposedJob["status"][]) => j.filter((x) => s.includes(x.status)).length;
  return {
    total: j.length, unassigned: cnt(["received", "pending_allocation"]), awaitingAcceptance: cnt(["assigned"]), accepted: cnt(["accepted"]), inProgress: cnt(["in_progress"]), awaitingEvidence: j.filter((x) => x.status === "in_progress" && !x.photos.length).length, awaitingSiebel: cnt(["awaiting_siebel", "completion_submitted"]), confirmed: cnt(["confirmed"]), rejected: cnt(["rejected"]),
    pointsPending: state.rewards.filter((r) => r.status === "pending" || r.status === "eligible").reduce((n, r) => n + (r.expectedPoints ?? 0), 0), pointsSimulated: state.rewards.filter((r) => r.status === "simulated_credit").reduce((n, r) => n + (r.expectedPoints ?? 0), 0), pointsCredited: 0,
    activeTechnicians: technicians().length, verified: state.flags.filter((f) => f.status === "demo_granted").length, feedbackLinks: state.feedbackLinks.length, feedbackPending: state.feedbackLinks.filter((l) => !l.submissionId).length,
    directOrder: "Assessment only — legacy build not supplied", openDecisions: state.decisions.filter((d) => d.status !== "confirmed").length, productionReady: false as const,
  };
}

/* ======================= Seed (labelled demo data, built through the same functions) ======================= */

function demoPayload(i: number, t: Member | undefined, missing = false): SiebelJobPayload {
  const sku = masterStore.get().skus[i % Math.max(1, masterStore.get().skus.length)];
  const w = t?.addresses.working ?? t?.addresses.home;
  return { siebelJobRef: `SBL-DEMO-${1001 + i}`, jobType: i % 3 === 0 ? "service" : "installation", customer: { ref: missing ? null : `CUST-DEMO-${pad(i + 1)}`, name: missing ? null : `Demo Customer ${pad(i + 1, 2)}`, contactRef: missing ? null : `CNT-DEMO-${pad(7000 + i)}` }, address: { line: missing ? null : `Demo service address ${i + 1}`, pincode: missing ? null : w?.pincode ?? null, district: w?.district ?? null, state: w?.state ?? null }, product: { skuRef: sku?.id ?? null, name: sku?.name ?? null, categoryId: null }, warrantyRef: i % 2 ? `WRT-DEMO-${pad(i + 1)}` : null, priority: null, branchCode: t?.branchCode ?? null, extensions: {} };
}
function seed(): JobsState {
  state = { jobs: [], inbound: [], assignments: [], submissions: [], callbacks: [], exceptions: [], rewardConfigs: [], rewards: [], flags: [], feedbackLinks: [], feedback: [], eidDeliveries: [], quotations: [], tags: [], radius: { radiusKm: null, configurable: "pending_op27", programme: "EP", scope: null, effectiveFrom: null, status: "inactive" }, surveyRules: [], workLocations: [], decisions: MODULE12_DECISIONS.map((d) => ({ ...d })), audit: [] };
  const techs = technicians();
  const S = SEED;
  createRewardConfigDraft(S, { jobType: "installation", points: 100, effectiveFrom: "2026-12-01" });
  createRewardConfigDraft(S, { jobType: "service", points: 50, effectiveFrom: "2026-12-01" });
  const ids = Array.from({ length: 11 }, (_, i) => receiveSiebelJob(S, demoPayload(i, techs[i % techs.length])).id!);
  receiveSiebelJob(S, demoPayload(11, techs[0], true)); // incomplete customer data
  receiveSiebelJob(S, demoPayload(0, techs[0])); // duplicate of SBL-DEMO-1001
  const tech = (i: number) => techs[i % techs.length].id;
  const go = (i: number, upTo: number) => {
    const id = ids[i];
    if (upTo >= 1) createDemoAssignment(S, id, tech(i));
    if (upTo >= 2) simulateTechnicianResponse(S, id, "accepted");
    if (upTo >= 3) recordJobStart(S, id, { selfieRef: `SELFIE-DEMO-${id}`, gps: { lat: 13.08, lng: 80.27 } });
    if (upTo >= 4) submitCompletion(S, id, [{ ref: `PHOTO-DEMO-${id}-1`, category: "Installed product" }, { ref: `PHOTO-DEMO-${id}-2`, category: "Site" }]);
  };
  go(3, 1); go(4, 2); go(5, 3); go(6, 4); go(7, 4); go(8, 4); go(9, 4); go(10, 4);
  const sub = (i: number) => state.submissions.find((s) => s.jobId === ids[i])!.id;
  siebelCallback(S, { requestRef: sub(7), result: "confirmed", confirmationRef: "SBL-CNF-DEMO-7" });
  siebelCallback(S, { requestRef: sub(8), result: "confirmed", confirmationRef: "SBL-CNF-DEMO-8" });
  simulateRewardProcessing(S, ids[8]);
  siebelCallback(S, { requestRef: sub(9), result: "rejected", rejectionReason: "Demo: photographs did not show the installed unit" });
  recordSiebelTimeout(S, sub(10));
  createFeedbackLink(S, ids[8]);
  return state;
}
function load(): JobsState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as JobsState;
  } catch {
    /* seed */
  }
  return seed();
}
state = load();
