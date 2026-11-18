/**
 * FRAUD & RISK STORE — in-browser mock repository (Phase 10).
 *
 * - Detection belongs to backend services (identity registry, device risk, rule-based anomaly,
 *   predictive AF02, geo-velocity, geo-validation, QR integrity, SFDC sync). The functions marked
 *   "adapter" stand in for those services and feed ONE review queue; duplicate deliveries are ignored.
 * - Detection, case, recommendation, restriction and decision stay separate. A recommendation never
 *   applies a restriction: Program Block and Temporary Hold are applied in Member Management by a user
 *   with that permission; device blocks, thresholds and global restrictions go through approval.
 * - Nothing is deleted: cleared events and closed cases stay. Every mutation writes an audit event.
 * - Thresholds without business confirmation (OP-02) never activate.
 */
import { useSyncExternalStore } from "react";
import { ALERT, OPEN_CASE, RECOMMENDATION, SOW } from "@/config/riskCatalogue";
import { accessStore } from "@/features/access/store";
import { hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { accessLog } from "@/features/access/accessLog";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { commsStore, sendStaffAlert } from "@/features/comms/store";
import { geoOfMember, memberById } from "@/features/members/engine";
import { applyRestriction, memberStore, registryCheck, restrictionImpact, submitReinstatementRequest } from "@/features/members/store";
import { masterStore } from "@/features/masters/store";
import { schemeStore } from "@/features/schemes/store";
import { walletStore } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import { giftsStore } from "@/features/gifts/store";
import type { ApprovalRequest } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { AlertKind, AnomalyRule, CaseStatus, Device, Evidence, FraudVector, IdentityMatch, Period, RecommendationAction, RiskCase, RiskEvent, RiskState, Severity, TamperedQrCase } from "@/types/risk";
import { canTransition, duplicateQrMessage, exceededPeriods, maskTail, mismatchImpact, storeGateRedemption, storeGateScan, validateRule } from "./engine";
import { deviceSpec, globalSpec, thresholdSpec, type RiskSpec } from "./requests";
import { buildRiskSeed } from "./seed";

const STORAGE_KEY = "vg-rishta.risk-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[], w = 4) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1, w)}`;

/* ---------------- Store plumbing ---------------- */

function linkApprovals(s: RiskState): RiskState {
  const reqs = approvalStore.get().requests;
  const find = (ref: string) => [...reqs].reverse().find((r) => r.entityRef === ref)?.id ?? null;
  return { ...s, rules: s.rules.map((r) => ({ ...r, approvalRequestId: r.approvalRequestId ?? (r.status === "pending_approval" ? find(`${r.id} v${r.version}`) : null) })) };
}

let state: RiskState;
const listeners = new Set<() => void>();
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
/** The only write path: callers always pass a state produced by `audited`. Not exported. */
function commit(next: RiskState) {
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}
function load(): RiskState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RiskState;
  } catch {
    /* seed */
  }
  return linkApprovals(buildRiskSeed(mem(), walletStore.get(), schemeStore.get(), masterStore.get()));
}
state = load();
export const riskStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useRiskState = () => useSyncExternalStore(riskStore.subscribe, riskStore.get, riskStore.get);
export const resetRiskDemoData = () => {
  state = linkApprovals(buildRiskSeed(mem(), walletStore.get(), schemeStore.get(), masterStore.get()));
  persist();
  sendSeedAlerts();
  listeners.forEach((l) => l());
};

function audited(s: RiskState, actor: string, entity: string, entityId: string, action: string, after: string | null, reason: string, approvalRequestId: string | null = null, before: string | null = null): RiskState {
  return { ...s, audit: [...s.audit, { id: `RAE-${pad(s.audit.length + 1, 6)}`, at: now(), actor, entity, entityId, action, before, after, reason, approvalRequestId }] };
}

const LABEL: Record<string, string> = { "fraud-rules": "Fraud & risk rules", devices: "Device & security", members: "Member management" };
const need = (m: string, a: string) => `You need ${LABEL[m] ?? m}: ${a}`;
const can = (uid: string, module: string, action: ActionId) => hasPermission(acc(), uid, module, action).allowed;
/** Programme + geography check for a record that belongs to a member. */
export const canOnMember = (uid: string, module: string, action: ActionId, memberId: string | null) => {
  const m = memberId ? memberById(mem(), memberId) : undefined;
  return m ? hasPermission(acc(), uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed : can(uid, module, action);
};
export const eventVisible = (uid: string, e: RiskEvent) => canOnMember(uid, "fraud-rules", "view", e.memberId);
export const eventsFor = (uid: string) => state.events.filter((e) => eventVisible(uid, e));
const decisionConfirmed = (id: string) => state.decisions.find((d) => d.id === id)?.status === "confirmed";

function raise(uid: string, s: RiskSpec) {
  return createRequest(uid, { requestType: s.type, title: s.title, entityRef: s.entity, programme: s.programme, location: null, amount: null, fields: s.fields, purpose: s.purpose, reason: s.reason, justification: s.justification, attachments: [], impact: s.impact }, true);
}

/* ======================= Alerts (Communication Centre) ======================= */

/** Sends a staff alert once per (kind, reference). A repeated backend event never re-sends. */
function alertOn(s: RiskState, kind: AlertKind, ref: string, body: string): RiskState {
  const id = `ALR-${kind}-${ref}`;
  if (s.alerts.some((a) => a.id === id)) return s;
  const r = sendStaffAlert({ id, title: ALERT[kind], body, recipients: s.config.alertRecipients, sourceModule: "Fraud & risk", sourceRef: ref, at: now() });
  return { ...s, alerts: [...s.alerts, { id, kind, ref, title: ALERT[kind], recipients: s.config.alertRecipients, commId: r.commId, at: now() }] };
}
const ALERT_FOR: Partial<Record<FraudVector, AlertKind>> = { device_farming: "device_farming", scan_rate: "scan_rate", geo_velocity: "geo_velocity", duplicate_identity: "duplicate_identity", tampered_qr: "tampered_qr", branch_leakage: "branch_leakage" };

function sendSeedAlerts() {
  let s = state;
  for (const b of s.redemptionBlocks.filter((x) => !x.warning.alertRef)) {
    s = alertOn(s, "redemption_blocked", b.redemptionRef, `${b.redemptionRef} (${b.memberId}) blocked: ${b.trigger}`);
    const a = s.alerts.find((x) => x.ref === b.redemptionRef && x.kind === "redemption_blocked")!;
    s = { ...s, redemptionBlocks: s.redemptionBlocks.map((x) => (x.id === b.id ? { ...x, warning: { alertRef: a.commId, status: "sent" } } : x)) };
  }
  for (const e of s.events.filter((x) => !x.alertRef && ALERT_FOR[x.vector] && (x.vector !== "scan_rate" || x.source === "rule"))) {
    s = alertOn(s, ALERT_FOR[e.vector]!, e.id, `${e.id}: ${e.context}`);
    s = { ...s, events: s.events.map((x) => (x.id === e.id ? { ...x, alertRef: s.alerts[s.alerts.length - 1].commId } : x)) };
  }
  if (s !== state) commit(audited(s, "SYSTEM", "alert", "SEED", "alerts_dispatched", `${s.alerts.length} alert(s)`, "Staff alerts through the Communication Centre (mock email)"));
}

/* ======================= Review queue intake (all detection adapters) ======================= */

export interface Signal {
  sourceKey: string;
  vector: FraudVector;
  source: RiskEvent["source"];
  memberId: string | null;
  context: string;
  signal: RiskEvent["signal"];
  score?: number | null;
  severity?: Severity | null;
  priority?: number | null;
  ruleRef?: string | null;
  modelRef?: string | null;
  links?: Partial<RiskEvent["links"]>;
  at?: string;
}
/** Adapter: one signal from a detection service. The same source key twice is a duplicate, not a new flag. */
export function ingestSignal(sig: Signal): Res & { duplicate?: boolean } {
  const prior = state.events.find((e) => e.sourceKey === sig.sourceKey);
  if (prior) {
    commit(audited({ ...state, events: state.events.map((e) => (e.id === prior.id ? { ...e, receivedCount: e.receivedCount + 1 } : e)) }, "SYSTEM", "risk_event", prior.id, "duplicate_signal_ignored", String(prior.receivedCount + 1), `Source key ${sig.sourceKey} delivered again`));
    return { ...OK(prior.id, ["Duplicate detection delivery: no new risk event"]), duplicate: true };
  }
  const m = sig.memberId ? memberById(mem(), sig.memberId) : undefined;
  const id = nextId("RSK", state.events, 5);
  const e: RiskEvent = { id, sourceKey: sig.sourceKey, vector: sig.vector, source: sig.source, serviceRef: sig.sourceKey, memberId: m?.id ?? null, programme: m?.programme ?? null, branchCode: m?.branchCode ?? null, detectedAt: sig.at ?? now(), context: sig.context, signal: sig.signal, score: sig.score ?? null, severity: sig.severity ?? null, priority: sig.priority ?? null, ruleRef: sig.ruleRef ?? null, modelRef: sig.modelRef ?? null, links: { memberIds: m ? [m.id] : [], deviceIds: [], qrRefs: [], scanRefs: [], redemptionRefs: [], ledgerRefs: [], ...sig.links }, status: "new", caseId: null, receivedCount: 1, alertRef: null, simulated: true };
  let s: RiskState = { ...state, events: [...state.events, e] };
  s = audited(s, "SYSTEM", "risk_event", id, "risk_event_received", `${sig.vector} · ${sig.source}`, sig.context);
  const k = ALERT_FOR[sig.vector];
  if (k && sig.source !== "predictive") {
    s = alertOn(s, k, id, `${id}: ${sig.context}`);
    s = { ...s, events: s.events.map((x) => (x.id === id ? { ...x, alertRef: s.alerts[s.alerts.length - 1].commId } : x)) };
  }
  commit(s);
  return { ...OK(id), duplicate: false };
}

/* ======================= Cases ======================= */

const caseOf = (id: string) => state.cases.find((c) => c.id === id);
function setCase(s: RiskState, c: RiskCase): RiskState {
  return { ...s, cases: s.cases.map((x) => (x.id === c.id ? { ...c, updatedAt: now() } : x)) };
}
const moved = (c: RiskCase, by: string, to: CaseStatus, remarks: string): RiskCase => ({ ...c, status: to, history: [...c.history, { at: now(), by, from: c.status, to, remarks }] });

export function openCase(uid: string, eventIds: string[], title: string): Res {
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit (investigate)"));
  const evs = eventIds.map((id) => state.events.find((e) => e.id === id));
  if (!evs.length || evs.some((e) => !e)) return NO("Choose existing risk events");
  if (evs.some((e) => !eventVisible(uid, e!))) return NO("An event is outside your programme or geographical scope");
  const busy = evs.filter((e) => e!.caseId && OPEN_CASE.includes(caseOf(e!.caseId)!.status));
  if (busy.length) return NO(`${busy.map((e) => e!.id).join(", ")} already belong to an open case`);
  if (!title.trim()) return NO("Give the case a title");
  const id = nextId("CASE", state.cases);
  const merge = (k: keyof RiskEvent["links"]) => [...new Set(evs.flatMap((e) => e!.links[k]))];
  const c: RiskCase = { id, title: title.trim(), vector: evs[0]!.vector, eventIds, links: { memberIds: merge("memberIds"), deviceIds: merge("deviceIds"), qrRefs: merge("qrRefs"), scanRefs: merge("scanRefs"), redemptionRefs: merge("redemptionRefs"), ledgerRefs: merge("ledgerRefs") }, ownerId: null, priority: null, status: "new", notes: [], evidence: [], recommendations: [], decision: null, history: [{ at: now(), by: uid, from: null, to: "new", remarks: "Case opened" }], createdAt: now(), createdBy: uid, updatedAt: now() };
  let s: RiskState = { ...state, cases: [...state.cases, c], events: state.events.map((e) => (eventIds.includes(e.id) ? { ...e, status: "in_case", caseId: id } : e)) };
  s = audited(s, uid, "risk_case", id, "case_opened", eventIds.join(", "), c.title);
  if (evs.some((e) => e!.severity === "critical" || e!.severity === "high")) s = alertOn(s, "high_priority_case", id, `${id}: ${c.title}`);
  commit(s);
  return OK(id, evs.length > 1 ? [`${evs.length} events grouped; member records stay separate (no identity merge)`] : []);
}

export function addEventsToCase(uid: string, caseId: string, eventIds: string[]): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (c.status === "closed") return NO("The case is closed");
  const evs = eventIds.map((id) => state.events.find((e) => e.id === id));
  if (evs.some((e) => !e || (e.caseId && e.caseId !== caseId))) return NO("Each event must exist and not belong to another case");
  const links = { ...c.links };
  for (const e of evs) for (const k of Object.keys(links) as (keyof typeof links)[]) links[k] = [...new Set([...links[k], ...e!.links[k]])];
  commit(audited(setCase({ ...state, events: state.events.map((e) => (eventIds.includes(e.id) ? { ...e, status: "in_case", caseId } : e)) }, { ...c, eventIds: [...new Set([...c.eventIds, ...eventIds])], links }), uid, "risk_case", caseId, "events_grouped", eventIds.join(", "), "Related events grouped"));
  return OK(caseId);
}

export function linkToCase(uid: string, caseId: string, kind: keyof RiskEvent["links"], ref: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!ref.trim()) return NO("Enter the reference");
  if (kind === "memberIds" && !memberById(mem(), ref.trim())) return NO("Member not found");
  if (kind === "deviceIds" && !state.devices.some((d) => d.id === ref.trim())) return NO("Device not found");
  commit(audited(setCase(state, { ...c, links: { ...c.links, [kind]: [...new Set([...c.links[kind], ref.trim()])] } }), uid, "risk_case", caseId, "reference_linked", `${kind}: ${ref.trim()}`, "Linked for investigation; no record is merged"));
  return OK(caseId);
}

export function assignCase(uid: string, caseId: string, ownerId: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "manage")) return NO(need("fraud-rules", "Manage (assign investigators)"));
  if (!can(ownerId, "fraud-rules", "edit")) return NO("The investigator needs Fraud & risk rules: Edit");
  if (!["new", "pending_assignment", "assigned", "under_investigation"].includes(c.status)) return NO(`A ${c.status.replace(/_/g, " ")} case cannot be reassigned`);
  const to: CaseStatus = c.status === "under_investigation" ? "under_investigation" : "assigned";
  commit(audited(setCase(state, { ...moved(c, uid, to, `Assigned to ${ownerId}`), ownerId }), uid, "risk_case", caseId, c.ownerId ? "investigator_reassigned" : "investigator_assigned", ownerId, "", null, c.ownerId));
  return OK(caseId);
}

export function setCasePriority(uid: string, caseId: string, priority: RiskCase["priority"]): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "manage")) return NO(need("fraud-rules", "Manage (triage)"));
  commit(audited(setCase(state, { ...c, priority }), uid, "risk_case", caseId, "priority_set", priority, "Manual triage (no backend priority supplied)", null, c.priority));
  return OK(caseId);
}

/** Manual status change along the state machine. Decisions, restrictions and closure have their own actions. */
export function setCaseStatus(uid: string, caseId: string, to: CaseStatus, remarks: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (to === "cleared" || to === "confirmed_misuse") return NO("Record the outcome with a decision (Clear flag / Confirm misuse)");
  if (to === "closed") return closeCase(uid, caseId, remarks);
  if (!canTransition(c.status, to)) return NO(`Not allowed: ${c.status.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}`);
  if (!remarks.trim()) return NO("Remarks are required");
  let s = audited(setCase(state, moved(c, uid, to, remarks.trim())), uid, "risk_case", caseId, `status_${to}`, to, remarks.trim(), null, c.status);
  if (to === "escalated") s = alertOn(s, "case_escalated", `${caseId}-${c.history.length}`, `${caseId} escalated: ${remarks.trim()}`);
  commit(s);
  return OK(caseId);
}

export function decideCase(uid: string, caseId: string, outcome: "cleared" | "confirmed_misuse", remarks: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!canTransition(c.status, outcome)) return NO(`A ${c.status.replace(/_/g, " ")} case cannot be ${outcome === "cleared" ? "cleared" : "confirmed"}`);
  if (!remarks.trim()) return NO("Record the reasoning");
  const next: RiskCase = { ...moved(c, uid, outcome, remarks.trim()), decision: { outcome, by: uid, at: now(), remarks: remarks.trim() } };
  let s: RiskState = setCase({ ...state, events: state.events.map((e) => (c.eventIds.includes(e.id) ? { ...e, status: outcome === "cleared" ? "cleared" : "confirmed" } : e)) }, next);
  s = { ...s, predictive: s.predictive.map((p) => (p.riskEventId && c.eventIds.includes(p.riskEventId) ? { ...p, status: outcome === "cleared" ? "cleared" : "confirmed" } : p)), devices: s.devices.map((d) => (c.links.deviceIds.includes(d.id) && d.investigation === "under_review" ? { ...d, investigation: outcome === "cleared" ? "cleared" : "confirmed" } : d)) };
  commit(audited(s, uid, "risk_case", caseId, outcome === "cleared" ? "flag_cleared" : "misuse_confirmed", outcome, remarks.trim(), null, c.status));
  return OK(caseId, outcome === "cleared" ? ["Events marked cleared and kept in history"] : ["Confirmed misuse is a finding, not a restriction. Recommend an action next"]);
}

export function closeCase(uid: string, caseId: string, remarks: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!c.decision && c.status !== "restriction_applied" && c.status !== "reinstatement_requested") return NO("A case cannot be closed without a recorded decision");
  if (!canTransition(c.status, "closed")) return NO(`A ${c.status.replace(/_/g, " ")} case cannot be closed`);
  commit(audited(setCase(state, moved(c, uid, "closed", remarks.trim() || "Closed")), uid, "risk_case", caseId, "case_closed", c.decision?.outcome ?? c.status, remarks, null, c.status));
  return OK(caseId);
}

export function addNote(uid: string, caseId: string, text: string, eventId: string | null = null, visibility: "internal" | "shared_with_vguard" = "internal"): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!text.trim()) return NO("Write the note");
  const note = { id: nextId("NTE", state.cases.flatMap((x) => x.notes)), at: now(), by: uid, orgId: primaryOrg(acc(), uid)?.id ?? null, text: text.trim(), eventId, visibility };
  commit(audited(setCase(state, { ...c, notes: [...c.notes, note] }), uid, "risk_case", caseId, "note_added", note.id, "Notes are append-only"));
  return OK(note.id);
}

export function addEvidence(uid: string, caseId: string, ev: Pick<Evidence, "kind" | "ref" | "description" | "sensitive">): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!ev.ref.trim() || !ev.description.trim()) return NO("Enter the evidence reference and description");
  const e: Evidence = { ...ev, ref: ev.ref.trim(), description: ev.description.trim(), id: nextId("EVD", state.cases.flatMap((x) => x.evidence)), addedBy: uid, addedAt: now() };
  commit(audited(setCase(state, { ...c, evidence: [...c.evidence, e] }), uid, "risk_case", caseId, "evidence_attached", e.id, e.kind));
  return OK(e.id);
}
/** Sensitive evidence opens only with Fraud & risk rules: View sensitive. */
export function viewEvidence(uid: string, caseId: string, evidenceId: string): Res & { evidence?: Evidence } {
  const c = caseOf(caseId);
  const e = c?.evidence.find((x) => x.id === evidenceId);
  if (!c || !e) return NO("Evidence not found");
  if (e.sensitive && !can(uid, "fraud-rules", "view_sensitive")) return NO("You need Fraud & risk rules: View sensitive to open this evidence");
  if (!can(uid, "fraud-rules", "view")) return NO(need("fraud-rules", "View"));
  commit(audited(state, uid, "risk_case", caseId, "evidence_viewed", e.id, e.sensitive ? "Sensitive evidence opened" : ""));
  return { ...OK(e.id), evidence: e };
}

/* ---------------- Recommendations and restrictions (Member Management model) ---------------- */

export function recommend(uid: string, caseId: string, action: RecommendationAction, targetId: string, reason: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!["under_investigation", "escalated", "confirmed_misuse", "restriction_recommended"].includes(c.status)) return NO("Recommend an action while the case is under investigation, escalated or confirmed");
  if (!reason.trim()) return NO("Give the reason");
  if (action === "device_block" ? !state.devices.some((d) => d.id === targetId) : action !== "monitor" && !memberById(mem(), targetId)) return NO("Choose the member or device the recommendation targets");
  const supported = action !== "scan_block" && action !== "redemption_block";
  const rec = { id: nextId("REC", state.cases.flatMap((x) => x.recommendations)), action, targetId, reason: reason.trim(), by: uid, at: now(), status: supported ? ("recommended" as const) : ("not_supported" as const), appliedRef: null, appliedBy: null };
  const next = action === "monitor" || c.status === "restriction_recommended" ? { ...c, recommendations: [...c.recommendations, rec] } : { ...moved(c, uid, "restriction_recommended", `${RECOMMENDATION[action].label} recommended`), recommendations: [...c.recommendations, rec] };
  commit(audited(setCase(state, next), uid, "risk_case", caseId, "restriction_recommended", `${action} · ${targetId}`, reason.trim()));
  return OK(rec.id, supported ? ["Recommendation recorded. It does not restrict anything until applied through the authorised workflow"] : [RECOMMENDATION[action].applies]);
}

/** What a restriction would affect, read from Member Management and the wallet. */
export function restrictionPreview(memberId: string, type: "program_block" | "temporary_hold") {
  const im = restrictionImpact(memberId, type);
  const ws = walletStore.get();
  const ids = im.affected.map((m) => m.id);
  return {
    member: im.member,
    memberships: im.linked.map((m) => ({ id: m.id, programme: m.programme, status: m.status, affected: ids.includes(m.id) })),
    scanEligible: false,
    redemptionEligible: false,
    newEnrolmentBlocked: type === "temporary_hold",
    existing: mem().restrictions.filter((r) => r.status !== "lifted" && r.memberIds.some((x) => im.linked.some((l) => l.id === x))),
    pendingRedemptions: ws.redemptions.filter((r) => ids.includes(r.memberId) && !["paid", "delivered", "failed", "reversed", "cancelled"].includes(r.stage)).map((r) => r.id),
    balances: ids.map((id) => ({ id, available: memberBalances(ws, schemeStore.get(), mem(), id).available })),
  };
}

/** Applies a recommendation through its own workflow. The applying user needs that workflow's permission. */
export function applyRecommendation(uid: string, caseId: string, recId: string, remarks: string): Res {
  const c = caseOf(caseId);
  const rec = c?.recommendations.find((r) => r.id === recId);
  if (!c || !rec) return NO("Recommendation not found");
  if (rec.status !== "recommended") return NO(`The recommendation is ${rec.status.replace("_", " ")}`);
  if (!remarks.trim()) return NO("Remarks are mandatory");
  if (rec.action === "monitor") return NO("Continue monitoring applies no restriction");
  if (rec.action === "device_block") {
    const d = state.devices.find((x) => x.id === rec.targetId)!;
    const r = requestDeviceBlock(uid, d.id, `${caseId}: ${remarks.trim()}`, d.associations.map((a) => a.memberId));
    if (!r.ok) return r;
    const fresh = caseOf(caseId)!;
    commit(audited(setCase(state, { ...fresh, recommendations: fresh.recommendations.map((x) => (x.id === recId ? { ...x, status: "applied", appliedRef: r.id ?? null, appliedBy: uid } : x)) }), uid, "risk_case", caseId, "device_block_requested", r.id ?? null, "Device block awaits approval; the case moves to Restriction applied once executed"));
    return OK(r.id, r.warnings);
  }
  const type = rec.action === "program_block" ? "program_block" : "temporary_hold";
  const r = applyRestriction(uid, rec.targetId, type, c.vector === "duplicate_identity" || c.vector === "cross_programme_kyc" ? "DUPLICATE_IDENTITY" : "FRAUD_SUSPECTED", `${caseId}: ${remarks.trim()}`);
  if (!r.ok) return r;
  const fresh = caseOf(caseId)!;
  let s = setCase(state, { ...moved(fresh, uid, "restriction_applied", `${r.id} applied in Member Management`), recommendations: fresh.recommendations.map((x) => (x.id === recId ? { ...x, status: "applied", appliedRef: r.id ?? null, appliedBy: uid } : x)) });
  s = { ...s, identityMatches: s.identityMatches.map((m) => (c.eventIds.includes(m.riskEventId ?? "") ? { ...m, status: "resolved_restricted", restrictionId: r.id ?? null } : m)) };
  commit(audited(s, uid, "risk_case", caseId, "restriction_applied", r.id ?? null, remarks.trim()));
  return OK(r.id, r.warnings);
}

/** Reinstatement goes through Member Management and the Approval Engine (member_reinstate). */
export function requestCaseReinstatement(uid: string, caseId: string, restrictionId: string, reason: string): Res {
  const c = caseOf(caseId);
  if (!c) return NO("Case not found");
  const r = submitReinstatementRequest(uid, restrictionId, `${caseId}: ${reason}`, `Risk case ${caseId}`);
  if (!r.ok) return r;
  commit(audited(setCase(state, moved(c, uid, "reinstatement_requested", `${restrictionId} reinstatement ${r.id}`)), uid, "risk_case", caseId, "reinstatement_requested", r.id ?? null, reason, r.id ?? null));
  return OK(r.id, r.warnings);
}

/* ======================= Identity registry adapters ======================= */

/** Adapter: real-time mobile de-duplication at registration (across all programmes). */
export function mobileDedupCheck(mobile: string, attemptedProgramme: string, attemptRef: string, at = now()): Res & { duplicate?: boolean } {
  const hits = registryCheck(mobile);
  if (!hits.length) return { ...OK(undefined), duplicate: false };
  const a = hits[0];
  const key = `mobile|${a.id}|${attemptRef}`;
  if (state.identityMatches.some((m) => m.matchKey === key)) return { ...OK(undefined, ["Duplicate callback ignored"]), duplicate: true };
  const r = ingestSignal({ sourceKey: `IDR-MOBILE-${attemptRef}`, vector: "duplicate_identity", source: "system_validation", memberId: a.id, context: `Registration ${attemptRef} (${attemptedProgramme}) used a mobile already registered to ${a.id}`, signal: { identifier: "mobile", masked: maskTail(mobile.replace(/\D/g, ""), 3), attempt: attemptRef }, at });
  const match: IdentityMatch = { id: nextId("DUP", state.identityMatches), matchKey: key, identifier: "mobile", masked: `+91 ${maskTail(mobile.replace(/\D/g, "").slice(-10), 3)}`, originalMemberId: a.id, matchingMemberId: attemptRef, programmes: [a.programme], method: "realtime", batchRef: null, detectedAt: at, status: "open", restrictionId: null, riskEventId: r.id ?? null };
  commit(audited({ ...state, identityMatches: [...state.identityMatches, match] }, "SYSTEM", "identity_match", match.id, "mobile_duplicate_realtime", match.masked, `Registration ${attemptRef} rejected by the identity registry (mock)`));
  return { ...OK(match.id, ["Registration rejected by the identity registry; existing profile unchanged"]), duplicate: true };
}

/** Adapter: the nightly (midnight) Aadhaar / PAN / bank de-duplication batch of the identity registry. */
export function runNightlyDedup(at: string): Res & { matches?: number } {
  if (!at.endsWith("T00:00")) return NO("The identity registry runs this batch at midnight (SOW 9.1)");
  const id = nextId("DBB", state.dedupBatches);
  let s = state;
  let n = 0;
  for (const f of state.registryFeed) {
    if (s.identityMatches.some((m) => m.matchKey === f.matchKey)) continue;
    state = s;
    const e = ingestSignal({ sourceKey: `IDR-${f.identifier.toUpperCase()}-${f.matchKey}`, vector: "duplicate_identity", source: "system_validation", memberId: f.matchingMemberId, context: `${f.identifier.toUpperCase()} matches ${f.originalMemberId} (nightly batch ${id})`, signal: { identifier: f.identifier, masked: f.masked }, links: { memberIds: [f.originalMemberId, f.matchingMemberId] }, at });
    s = state;
    s = { ...s, identityMatches: [...s.identityMatches, { ...f, id: nextId("DUP", s.identityMatches), batchRef: id, detectedAt: at, status: "open", restrictionId: null, riskEventId: e.id ?? null }] };
    n++;
  }
  s = { ...s, dedupBatches: [...s.dedupBatches, { id, runAt: at, identifiers: ["aadhaar", "pan", "bank"], scanned: mem().identities.length, matches: n, status: "completed" }], registryFeed: [] };
  commit(audited(s, "SYSTEM", "dedup_batch", id, "nightly_dedup_completed", `${n} match(es)`, "Identity registry nightly batch (mock). No profile is merged or deleted"));
  return { ...OK(id), matches: n };
}

export function setMatchStatus(uid: string, id: string, status: "under_review" | "linked_identity" | "resolved_no_action", remarks: string): Res {
  const m = state.identityMatches.find((x) => x.id === id);
  if (!m) return NO("Match not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (!remarks.trim()) return NO("Remarks are required");
  commit(audited({ ...state, identityMatches: state.identityMatches.map((x) => (x.id === id ? { ...x, status } : x)) }, uid, "identity_match", id, `match_${status}`, status, remarks, null, m.status));
  return OK(id);
}

/* ======================= Device governance ======================= */

const deviceOf = (id: string) => state.devices.find((d) => d.id === id);
const setDevice = (s: RiskState, d: Device): RiskState => ({ ...s, devices: s.devices.map((x) => (x.id === d.id ? d : x)) });

/** Adapter: the identity service enforces one profile per device across all programmes. */
export function profileCreationAttempt(deviceId: string, newMemberId: string, at = now()): Res {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  if (d.createdProfile) {
    const login = { id: `DLG-${d.id.slice(4)}-${pad(d.logins.length + 1, 3)}`, memberId: newMemberId, at, lat: null, lng: null, location: "Not captured", sessionRef: `SES-REJ-${pad(d.logins.length + 1, 4)}`, appVersion: null, outcome: "profile_creation_rejected" as const };
    commit(audited(setDevice(state, { ...d, logins: [...d.logins, login], lastSeen: at }), "SYSTEM", "device", d.id, "profile_creation_rejected", newMemberId, `One profile per device: ${d.createdProfile} was created on this device`));
    ingestSignal({ sourceKey: `DEV-CREATE-${d.id}-${newMemberId}`, vector: "device_farming", source: "system_validation", memberId: d.createdProfile, context: `Second profile creation attempted on ${d.imeiMasked} (rejected by the identity service)`, signal: { device: d.id, attempted: newMemberId }, links: { deviceIds: [d.id], memberIds: [d.createdProfile] }, at });
    return NO(`Profile creation rejected: ${d.identifierMasked} already holds profile ${d.createdProfile} (one profile per device across all programmes)`);
  }
  commit(audited(setDevice(state, { ...d, createdProfile: newMemberId, associations: [...d.associations, { memberId: newMemberId, kind: "created_profile", firstAt: at, lastAt: at }], lastSeen: at }), "SYSTEM", "device", d.id, "profile_created", newMemberId, "First profile on this device"));
  return OK(d.id);
}

/** Adapter: an existing profile logs in. Shared devices are allowed (SOW 3.2); only a blocked device refuses. */
export function deviceLogin(deviceId: string, memberId: string, at = now(), loc: { lat: number | null; lng: number | null; location: string } = { lat: null, lng: null, location: "Not captured" }): Res {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  if (!memberById(mem(), memberId)) return NO("Only existing profiles log in");
  if (d.status === "blocked") {
    commit(audited(state, "SYSTEM", "device", d.id, "login_refused_blocked_device", memberId, "Device is blocked"));
    return NO("Device is blocked");
  }
  const assoc = d.associations.some((a) => a.memberId === memberId) ? d.associations.map((a) => (a.memberId === memberId ? { ...a, lastAt: at } : a)) : [...d.associations, { memberId, kind: "login" as const, firstAt: at, lastAt: at }];
  const login = { id: `DLG-${d.id.slice(4)}-${pad(d.logins.length + 1, 3)}`, memberId, at, ...loc, sessionRef: `SES-${pad(d.logins.length + 1, 4)}-${memberId.slice(-4)}`, appVersion: "4.2.0 (mock)", outcome: "success" as const };
  commit(audited(setDevice(state, { ...d, associations: assoc, logins: [...d.logins, login], lastSeen: at }), "SYSTEM", "device", d.id, "device_login", memberId, d.associations.length > 1 ? "Shared-device login (allowed)" : ""));
  return OK(login.id);
}

/** Adapter: the device risk service reports a pattern (its own rule decides; no count is assumed here). */
export function deviceRiskSignal(deviceId: string, pattern: "shared_imei_scans" | "device_hopping", memberIds: string[], detail: string, at = now()): Res & { duplicate?: boolean } {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  const r = ingestSignal({ sourceKey: `DRS-${pattern}-${deviceId}-${memberIds.join("+")}`, vector: "device_farming", source: "rule", memberId: memberIds[0] ?? null, context: detail, signal: { device: deviceId, pattern, accounts: memberIds.length }, links: { memberIds, deviceIds: [deviceId] }, ruleRef: "Device risk service rule (mock)", at });
  if (r.ok && !r.duplicate) commit(audited(setDevice(state, { ...deviceOf(deviceId)!, investigation: "under_review" }), "SYSTEM", "device", deviceId, "device_flagged", pattern, detail));
  return r;
}

export function deviceImpact(deviceId: string) {
  const d = deviceOf(deviceId)!;
  return d.associations.map((a) => ({ memberId: a.memberId, kind: a.kind, member: memberById(mem(), a.memberId), restrictions: mem().restrictions.filter((r) => r.status !== "lifted" && r.memberIds.includes(a.memberId)).map((r) => r.id) }));
}

export function requestDeviceBlock(uid: string, deviceId: string, reason: string, impactReviewed: string[]): Res {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  if (!can(uid, "devices", "disable")) return NO(need("devices", "Disable (block device)"));
  if (d.status === "blocked") return NO("The device is already blocked");
  if (d.actions.some((a) => a.status === "pending_approval")) return NO("A device action is already awaiting approval");
  if (!reason.trim()) return NO("A reason is mandatory");
  const linked = d.associations.map((a) => a.memberId);
  if (!linked.every((m) => impactReviewed.includes(m))) return NO(`Review the impact on every linked account first (${linked.length} account(s))`);
  const q = raise(uid, deviceSpec(d, "block", reason.trim()));
  if (!q.ok) return q;
  const a = { id: nextId("DBA", state.devices.flatMap((x) => x.actions)), action: "block" as const, reason: reason.trim(), requestedBy: uid, requestedAt: now(), approvalRequestId: q.id ?? null, status: "pending_approval" as const, executedAt: null, previous: "active" as const, next: "blocked" as const, impactReviewed };
  commit(audited(setDevice(state, { ...d, actions: [...d.actions, a] }), uid, "device", d.id, "device_block_requested", a.id, reason.trim(), q.id ?? null));
  return OK(a.id, linked.length > 1 ? [`${linked.length} linked accounts lose this device while blocked: shared-device use is not itself fraud`] : []);
}
export function requestDeviceRelease(uid: string, deviceId: string, reason: string): Res {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  if (!can(uid, "devices", "manage")) return NO(need("devices", "Manage (release device)"));
  if (d.status !== "blocked") return NO("Only a blocked device can be released");
  if (d.actions.some((a) => a.status === "pending_approval")) return NO("A device action is already awaiting approval");
  if (!reason.trim()) return NO("A reason is mandatory");
  const q = raise(uid, deviceSpec(d, "release", reason.trim()));
  if (!q.ok) return q;
  const a = { id: nextId("DBA", state.devices.flatMap((x) => x.actions)), action: "release" as const, reason: reason.trim(), requestedBy: uid, requestedAt: now(), approvalRequestId: q.id ?? null, status: "pending_approval" as const, executedAt: null, previous: "blocked" as const, next: "active" as const, impactReviewed: d.associations.map((x) => x.memberId) };
  commit(audited(setDevice(state, { ...d, actions: [...d.actions, a] }), uid, "device", d.id, "device_release_requested", a.id, reason.trim(), q.id ?? null));
  return OK(a.id);
}
export function clearDeviceReview(uid: string, deviceId: string, remarks: string): Res {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  if (!can(uid, "devices", "edit")) return NO(need("devices", "Edit"));
  if (!remarks.trim()) return NO("Remarks are required");
  commit(audited(setDevice(state, { ...d, investigation: "cleared" }), uid, "device", d.id, "device_review_cleared", "cleared", remarks, null, d.investigation));
  return OK(d.id, ["Cleared without a block; history kept"]);
}
/** Device location history is sensitive: needs Device & security: View sensitive. */
export function deviceLocations(uid: string, deviceId: string): Res & { logins?: Device["logins"] } {
  const d = deviceOf(deviceId);
  if (!d) return NO("Device not found");
  if (!can(uid, "devices", "view_sensitive")) return NO("You need Device & security: View sensitive to see login locations");
  return { ...OK(d.id), logins: d.logins };
}

/* ======================= Anomaly rules (OP-02) ======================= */

export function saveRule(uid: string, r: AnomalyRule, reason: string): Res {
  const prev = r.id ? state.rules.find((x) => x.id === r.id) : undefined;
  if (!can(uid, "fraud-rules", prev ? "edit" : "create")) return NO(need("fraud-rules", prev ? "Edit" : "Create"));
  const errors = validateRule(r);
  if (errors.length) return NO(...errors);
  if (!r.demo && !decisionConfirmed("OP-02")) return NO("Business-supplied thresholds can be entered only after OP-02 is confirmed. Until then values are Demo configuration");
  if (prev && prev.status === "pending_approval") return NO("This rule is awaiting approval");
  let s: RiskState;
  let id: string;
  if (!prev || prev.status === "draft" || prev.status === "rejected") {
    id = prev?.id ?? nextId("ANR", state.rules, 3);
    const next: AnomalyRule = { ...r, id, status: "draft", version: prev?.version ?? 1, approvalRequestId: null, history: [...(prev?.history ?? []), { at: now(), by: uid, action: "drafted", detail: reason || (r.demo ? "Demo configuration" : "Business-supplied values"), approvalRequestId: null }], updatedBy: uid, updatedAt: now() };
    s = { ...state, rules: prev ? state.rules.map((x) => (x.id === id ? next : x)) : [...state.rules, next] };
  } else {
    id = nextId("ANR", state.rules, 3);
    const next: AnomalyRule = { ...r, id, status: "draft", version: prev.version + 1, replaces: prev.id, approvalRequestId: null, history: [{ at: now(), by: uid, action: "drafted", detail: reason || `New version of ${prev.id}`, approvalRequestId: null }], updatedBy: uid, updatedAt: now() };
    s = { ...state, rules: [...state.rules, next] };
  }
  commit(audited(s, uid, "anomaly_rule", id, "threshold_drafted", JSON.stringify(r.limits), reason || "Threshold draft", null, prev ? JSON.stringify(prev.limits) : null));
  return OK(id, r.demo ? ["Saved as Demo configuration: never an approved production value"] : []);
}
export function submitRule(uid: string, id: string): Res {
  const r = state.rules.find((x) => x.id === id);
  if (!r) return NO("Rule not found");
  if (r.status !== "draft") return NO(`Rule is ${r.status.replace("_", " ")}`);
  if (!can(uid, "fraud-rules", "submit")) return NO(need("fraud-rules", "Submit"));
  const errors = validateRule(r);
  if (errors.length) return NO(...errors);
  const q = raise(uid, thresholdSpec(r, r.replaces ? state.rules.find((x) => x.id === r.replaces) : undefined));
  if (!q.ok) return q;
  commit(audited({ ...state, rules: state.rules.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: q.id ?? null, history: [...x.history, { at: now(), by: uid, action: "submitted", detail: "Submitted for approval", approvalRequestId: q.id ?? null }] } : x)) }, uid, "anomaly_rule", id, "threshold_submitted", null, "Maker-Checker", q.id ?? null));
  return OK(id);
}
/** Activation is a separate, deliberate step: only for confirmed (OP-02), non-demo, approved rules. */
export function activateRule(uid: string, id: string, reason: string): Res {
  const r = state.rules.find((x) => x.id === id);
  if (!r) return NO("Rule not found");
  if (!can(uid, "fraud-rules", "execute")) return NO(need("fraud-rules", "Execute (activate)"));
  if (!decisionConfirmed("OP-02")) return NO("OP-02 is not confirmed: thresholds stay inactive (Business Confirmation Required)");
  if (r.demo) return NO("Demo configuration can never be activated. Enter the confirmed business values as a new version");
  if (r.status !== "approved_inactive" && r.status !== "inactive") return NO(`Only an approved rule can be activated (now ${r.status.replace("_", " ")})`);
  if (!reason.trim()) return NO("Give a reason");
  const old = r.replaces ? state.rules.find((x) => x.id === r.replaces) : undefined;
  commit(audited({ ...state, rules: state.rules.map((x) => (x.id === id ? { ...x, status: "active", history: [...x.history, { at: now(), by: uid, action: "activated", detail: reason, approvalRequestId: x.approvalRequestId }] } : old && x.id === old.id ? { ...x, status: "superseded" } : x)) }, uid, "anomaly_rule", id, "threshold_activated", "active", reason, r.approvalRequestId, r.status));
  return OK(id);
}
export function deactivateRule(uid: string, id: string, reason: string): Res {
  const r = state.rules.find((x) => x.id === id);
  if (!r) return NO("Rule not found");
  if (!can(uid, "fraud-rules", "disable")) return NO(need("fraud-rules", "Disable"));
  if (r.status !== "active") return NO("Only an active rule can be deactivated");
  if (!reason.trim()) return NO("Give a reason");
  commit(audited({ ...state, rules: state.rules.map((x) => (x.id === id ? { ...x, status: "inactive", history: [...x.history, { at: now(), by: uid, action: "deactivated", detail: reason, approvalRequestId: null }] } : x)) }, uid, "anomaly_rule", id, "threshold_deactivated", "inactive", reason, null, "active"));
  return OK(id);
}

/**
 * Mock rule-based anomaly service: compares reported activity with an ACTIVE rule and, when the rule
 * auto-flags, sends the result to the review queue. Inactive or demo rules only report a simulation.
 */
export function ruleServiceEvaluate(ruleId: string, memberId: string, counts: Partial<Record<Period, number>>, at = now()): Res & { exceeded?: ReturnType<typeof exceededPeriods>; flagged?: boolean } {
  const r = state.rules.find((x) => x.id === ruleId);
  if (!r) return NO("Rule not found");
  const ex = exceededPeriods(r, counts);
  if (r.status !== "active") return { ...OK(undefined, [`Simulation only: ${r.id} is ${r.status.replace("_", " ")}${r.demo ? " (Demo configuration)" : ""}. Nothing was flagged`]), exceeded: ex, flagged: false };
  if (!ex.length || !r.autoFlag) return { ...OK(undefined), exceeded: ex, flagged: false };
  const out = ingestSignal({ sourceKey: `RBA-${r.id}-${memberId}-${at}-${ex.map((x) => x.period).join("")}`, vector: r.kind === "redemption" ? "redemption_abuse" : "scan_rate", source: "rule", memberId, context: `${r.name}: ${ex.map((x) => `${x.period} ${x.observed} > ${x.limit}`).join(", ")}`, signal: { rule: r.id, kind: r.kind, ...Object.fromEntries(ex.map((x) => [`${x.period}_observed`, x.observed])) }, ruleRef: `${r.id} v${r.version}`, at });
  return { ...out, exceeded: ex, flagged: true };
}

/* ======================= Global restrictions ======================= */

export function globalImpact(programmes: string[]) {
  return programmes.map((p) => ({ programme: p, members: mem().members.filter((m) => m.programme === p && m.status !== "rejected").length }));
}
export function requestGlobalRestriction(uid: string, id: string, target: "active" | "inactive", programmes: string[], reason: string, impactReviewed: boolean): Res {
  const g = state.globals.find((x) => x.id === id);
  if (!g) return NO("Restriction not found");
  if (!can(uid, "fraud-rules", "execute")) return NO(need("fraud-rules", "Execute (global restriction)"));
  if (g.status.startsWith("pending")) return NO("A change to this restriction is already awaiting approval");
  if (target === "active" && g.status === "active") return NO("Already active");
  if (target === "inactive" && g.status !== "active") return NO("Not active");
  if (target === "active" && !programmes.length) return NO("Choose the programmes in scope");
  if (!impactReviewed) return NO("Review the impact preview before requesting a global restriction");
  if (!reason.trim()) return NO("A reason is mandatory");
  const q = raise(uid, globalSpec(g, target, target === "active" ? programmes : g.programmes, reason.trim()));
  if (!q.ok) return q;
  commit(audited({ ...state, globals: state.globals.map((x) => (x.id === id ? { ...x, status: target === "active" ? "pending_activation" : "pending_deactivation", reason: reason.trim(), requestedBy: uid, approvalRequestId: q.id ?? null, programmes: target === "active" ? (programmes as typeof x.programmes) : x.programmes, history: [...x.history, { at: now(), by: uid, action: `request_${target}`, detail: reason.trim(), approvalRequestId: q.id ?? null }] } : x)) }, uid, "global_restriction", id, `global_${target}_requested`, programmes.join(", "), reason.trim(), q.id ?? null, g.status));
  return OK(id, ["Not applied until approved (Maker-Checker)"]);
}
/** A global restriction cannot be switched on directly. */
export function toggleGlobalRestriction(uid: string, id: string): Res {
  void uid;
  void id;
  return NO("Global restrictions cannot be switched with a toggle: request the change with an impact review and approval");
}

/* ======================= Predictive anomalies (AF02, simulated) ======================= */

export function ingestPredictive(p: { memberId: string; expected: number; observed: number; deviation: string; window: string; flagged: boolean; modelRef: string; at?: string }): Res {
  const m = memberById(mem(), p.memberId);
  if (!m) return NO("Member not found");
  const at = p.at ?? now();
  const ev = p.flagged ? ingestSignal({ sourceKey: `PRD-${p.memberId}-${p.window}`, vector: "scan_rate", source: "predictive", memberId: m.id, context: `Observed ${p.observed} against an expected ${p.expected} (${p.window})`, signal: { expected: p.expected, observed: p.observed, deviation: p.deviation }, modelRef: p.modelRef, at }) : null;
  const id = nextId("PRD", state.predictive);
  commit(audited({ ...state, predictive: [...state.predictive, { id, memberId: m.id, programme: m.programme, expected: p.expected, observed: p.observed, deviation: p.deviation, window: p.window, detectedAt: at, modelRef: p.modelRef, simulated: true, status: p.flagged ? "flagged" : "cleared", riskEventId: ev?.id ?? null }] }, "SYSTEM", "predictive", id, "predictive_result", p.flagged ? "flagged" : "within expectation", "Simulated AF02 output: no model is trained in this build"));
  return OK(id, p.flagged ? ["Sent to the review queue as a predictive signal. No restriction is applied"] : []);
}

/* ======================= Redemption risk ======================= */

/** Adapter: the redemption service blocked a redemption on a risk trigger. Never silent: admins are warned. */
export function redemptionRiskBlocked(redemptionId: string, trigger: string, providerResponse: string, at = now()): Res {
  const r = walletStore.get().redemptions.find((x) => x.id === redemptionId);
  if (!r) return NO("Redemption not found");
  if (state.redemptionBlocks.some((b) => b.redemptionRef === redemptionId && b.trigger === trigger)) return OK(undefined, ["Duplicate block callback ignored"]);
  const ev = ingestSignal({ sourceKey: `RRK-${redemptionId}-${trigger}`, vector: "redemption_abuse", source: "rule", memberId: r.memberId, context: trigger, signal: { redemption: redemptionId, points: r.points, provider: providerResponse }, links: { redemptionRefs: [redemptionId], ledgerRefs: r.debitLedgerId ? [r.debitLedgerId] : [] }, ruleRef: "Redemption risk rule (backend)", at });
  const id = nextId("RRB", state.redemptionBlocks);
  let s: RiskState = { ...state, redemptionBlocks: [...state.redemptionBlocks, { id, redemptionRef: r.id, memberId: r.memberId, programme: r.programme, method: r.method, amountInr: r.grossInr, points: r.points, trigger, providerResponse, detectedAt: at, source: "rule", blockStatus: "blocked", warning: { alertRef: null, status: "not_sent" }, riskEventId: ev.id ?? null, lift: null }] };
  s = alertOn(s, "redemption_blocked", r.id, `${r.id} (${r.memberId}) blocked: ${trigger}`);
  const a = s.alerts.find((x) => x.kind === "redemption_blocked" && x.ref === r.id)!;
  s = { ...s, redemptionBlocks: s.redemptionBlocks.map((x) => (x.id === id ? { ...x, warning: { alertRef: a.commId, status: "sent" } } : x)) };
  commit(audited(s, "SYSTEM", "redemption_block", id, "redemption_blocked", trigger, `${providerResponse}. Admin warning ${a.commId}`));
  return OK(id);
}

/** Lifting a risk block needs approval (risk_block_release); never while a member restriction is active. */
export function requestRedemptionRelease(uid: string, blockId: string, reason: string): Res {
  const b = state.redemptionBlocks.find((x) => x.id === blockId);
  if (!b) return NO("Block not found");
  if (b.blockStatus !== "blocked") return NO("The block is already lifted");
  if (!canOnMember(uid, "fraud-rules", "submit", b.memberId)) return NO(need("fraud-rules", "Submit"));
  if (!reason.trim()) return NO("A reason is mandatory");
  const active = mem().restrictions.filter((r) => r.status !== "lifted" && r.memberIds.includes(b.memberId));
  if (active.length) return NO(`A conflicting member restriction remains (${active.map((r) => r.id).join(", ")}): lift it through Member Management reinstatement first`);
  const q = createRequest(uid, { requestType: "risk_block_release", title: `Lift redemption risk block ${b.id} · ${b.redemptionRef}`, entityRef: b.id, programme: b.programme, location: null, amount: null, fields: [{ key: "block", label: "Redemption risk block", kind: "status", before: "Blocked", after: "Lifted", material: true }, { key: "trigger", label: "Trigger", kind: "text", before: b.trigger, after: b.trigger }], purpose: "Reinstate a redemption blocked by a risk rule", reason: reason.trim(), justification: "The original risk flag and redemption history are kept", attachments: [], impact: { affectedMembers: 1 } }, true);
  if (!q.ok) return q;
  commit(audited(state, uid, "redemption_block", b.id, "release_requested", q.id ?? null, reason.trim(), q.id ?? null));
  return OK(q.id);
}

/* ======================= Geography ======================= */

/** Adapter: the geo-velocity service reports consecutive scans; distance and time are its values. */
export function geoVelocitySignal(memberId: string, previous: RiskState["geoVelocity"][number]["previous"], current: RiskState["geoVelocity"][number]["current"], distanceKm: number | null, elapsedMin: number | null, serviceRef: string): Res {
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  const ev = ingestSignal({ sourceKey: `GVS-${serviceRef}`, vector: "geo_velocity", source: "rule", memberId, context: `${distanceKm ?? "?"} km in ${elapsedMin ?? "?"} min between ${previous.scanRef} and ${current.scanRef}`, signal: { distanceKm, elapsedMin }, links: { scanRefs: [previous.scanRef, current.scanRef] }, ruleRef: "Geo-velocity service rule", at: current.at });
  if (ev.duplicate) return ev;
  const id = nextId("GVE", state.geoVelocity);
  commit(audited({ ...state, geoVelocity: [...state.geoVelocity, { id, memberId, programme: m.programme, previous, current, distanceKm, elapsedMin, rule: "Geo-velocity service rule", serviceRef, riskEventId: ev.id ?? null }] }, "SYSTEM", "geo_velocity", id, "geo_velocity_flag", `${distanceKm} km / ${elapsedMin} min`, "Values supplied by the geo-velocity service"));
  return OK(id);
}

/**
 * Adapter: backend geo-validation of a Retailer / CS scan (SOW: within 100 m of the SFDC location).
 * GPS denial and low accuracy are the service's verdicts; no accuracy threshold is set here.
 */
export function geoFenceScan(memberId: string, scan: { distanceM: number | null; accuracyM: number | null; gps: "granted" | "denied"; serviceVerdict?: "low_accuracy" }, at = now()): Res & { allowed?: boolean; banner?: string | null } {
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  if (!(SOW.geoFenceProgrammes as readonly string[]).includes(m.programme)) return { ...OK(undefined, [`The 100 m geo-fence applies to Retailer and CS only (${m.programme} not checked)`]), allowed: true, banner: null };
  const override = state.geoFence.find((g) => g.memberId === memberId && g.override.status === "approved");
  const result = scan.gps === "denied" ? "gps_denied" : scan.serviceVerdict === "low_accuracy" ? "low_accuracy" : scan.distanceM != null && scan.distanceM <= SOW.geoFenceMetres ? "within" : "outside_blocked";
  const allowed = result === "within" || (result === "outside_blocked" && !!override);
  const banner = result === "within" ? null : result === "outside_blocked" ? (override ? `Allowed by audited override ${override.override.ref}` : `Scan blocked: you are outside ${SOW.geoFenceMetres} m of your registered store location`) : result === "gps_denied" ? "Location permission is off. Turn on location to scan, or contact support" : "Location accuracy is too low to verify your store. Move to an open area and retry, or contact support";
  const ev = allowed ? null : ingestSignal({ sourceKey: `GEO-${memberId}-${at}`, vector: "geo_fence", source: "system_validation", memberId, context: banner!, signal: { distanceM: scan.distanceM, accuracyM: scan.accuracyM, result }, at });
  const id = nextId("GFC", state.geoFence);
  const w = m.addresses.working;
  commit(audited({ ...state, geoFence: [...state.geoFence, { id, memberId, programme: m.programme, registered: { lat: w?.lat ?? null, lng: w?.lng ?? null, source: "SFDC onboarding location" }, scan: { scanRef: `SCN-GEO-${pad(state.geoFence.length + 1, 5)}`, lat: null, lng: null, location: "Reported by the app", branchCode: m.branchCode, at }, distanceM: scan.distanceM, accuracyM: scan.accuracyM, result, banner, override: override ? { ...override.override } : { status: "none", ref: null, by: null, reason: null, at: null }, riskEventId: ev?.id ?? null }] }, "SYSTEM", "geo_fence", id, allowed ? "scan_allowed" : "scan_blocked", result, banner ?? "Within the geo-fence"));
  return { ...OK(id), allowed, banner };
}
/** Audited override for legitimate cases (for example several branches of one store). */
export function approveGeoOverride(uid: string, checkId: string, reason: string): Res {
  const g = state.geoFence.find((x) => x.id === checkId);
  if (!g) return NO("Geo-fence check not found");
  if (!canOnMember(uid, "fraud-rules", "execute", g.memberId)) return NO(need("fraud-rules", "Execute (geo-fence override)"));
  if (g.result !== "outside_blocked") return NO("Overrides apply to scans blocked for distance only (GPS issues need the member's device fixed)");
  if (!reason.trim()) return NO("A reason is mandatory");
  const ref = nextId("GOV", state.geoFence.filter((x) => x.override.ref).map((x) => ({ id: x.override.ref! })));
  commit(audited({ ...state, geoFence: state.geoFence.map((x) => (x.id === checkId ? { ...x, override: { status: "approved", ref, by: uid, reason: reason.trim(), at: now() } } : x)) }, uid, "geo_fence", checkId, "geo_override_approved", ref, reason.trim()));
  return OK(ref);
}

const storeOf = (memberId: string) => state.storeGeo.find((r) => r.memberId === memberId);
/** Adapter: a scan from a Retailer / DD / CS store whose SFDC geo-validation may be pending. */
export function storeScanAttempt(memberId: string, at = now()): Res & { allowed?: boolean; message?: string | null } {
  const r = storeOf(memberId);
  if (!r) return { ...OK(undefined, ["No store geo-validation record"]), allowed: true, message: null };
  const g = storeGateScan(r);
  const next = g.allowed ? { ...r, scanCount: r.sfdcStatus === "pending" ? r.scanCount + 1 : r.scanCount } : { ...r, scansBlocked: r.scansBlocked + 1 };
  let s: RiskState = { ...state, storeGeo: state.storeGeo.map((x) => (x.memberId === memberId ? next : x)) };
  s = audited(s, "SYSTEM", "store_geo", memberId, g.allowed ? "store_scan_allowed" : "store_scan_blocked", String(next.scanCount), g.message ?? "Store geo-validated");
  commit(s);
  if (!g.allowed) ingestSignal({ sourceKey: `SGV-${memberId}-${r.scanCount + r.scansBlocked + 1}`, vector: "store_geo_pending", source: "system_validation", memberId, context: "Scan blocked: store geo-validation pending in SFDC", signal: { storeRef: r.storeRef, scans: r.scanCount }, at });
  return { ...OK(memberId), allowed: g.allowed, message: g.message };
}
export function storeRedemptionAttempt(memberId: string): Res & { allowed?: boolean; message?: string | null } {
  const r = storeOf(memberId);
  if (!r) return { ...OK(undefined), allowed: true, message: null };
  const g = storeGateRedemption(r);
  commit(audited({ ...state, storeGeo: state.storeGeo.map((x) => (x.memberId === memberId ? { ...x, redemptionAttempts: x.redemptionAttempts + (g.allowed ? 0 : 1) } : x)) }, "SYSTEM", "store_geo", memberId, g.allowed ? "store_redemption_allowed" : "store_redemption_blocked", null, g.message ?? ""));
  return { ...OK(memberId), allowed: g.allowed, message: g.message };
}
/** Adapter: SFDC reports the store geo-validated; both restrictions lift automatically. */
export function sfdcStoreValidated(memberId: string, validationRef: string, at = now()): Res {
  const r = storeOf(memberId);
  if (!r) return NO("No store record");
  commit(audited({ ...state, storeGeo: state.storeGeo.map((x) => (x.memberId === memberId ? { ...x, sfdcStatus: "validated", validationRef, lastSync: at } : x)) }, "SYSTEM", "store_geo", memberId, "store_geo_validated", validationRef, "SFDC geo-validation complete: scan and redemption gates lifted"));
  return OK(memberId);
}
/** The store gate is not reset or overridden by a general admin action. */
export function overrideStoreGate(uid: string, memberId: string): Res {
  void uid;
  void memberId;
  return NO("The store geo-validation gate cannot be reset or overridden by an administrator. It lifts when SFDC geo-validation completes; any exception needs an explicitly authorised process (OP-GEO1)");
}

/** Routes a branch-mapping question to Data Integrity reconciliation. The member's branch is not changed. */
export function routeLeakToReconciliation(uid: string, leakId: string): Res {
  const l = state.leaks.find((x) => x.id === leakId);
  if (!l) return NO("Branch leakage event not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  if (l.reconciliationRef) return NO(`Already routed (${l.reconciliationRef})`);
  const id = nextId("DIX", state.validationExceptions);
  let s: RiskState = { ...state, validationExceptions: [...state.validationExceptions, { id, entityType: "Member branch mapping", entityId: l.memberId, source: "SFDC branch mapping", field: "Branch", valueMasked: l.mappedBranch, errorType: "invalid_reference", message: `Scans at ${l.scanBranch} while mapped to ${l.mappedBranch}: confirm the mapping at source`, detectedAt: now(), batchId: null, status: "open", owner: null, remarks: [], sourceFix: null, reprocess: [] }], leaks: state.leaks.map((x) => (x.id === leakId ? { ...x, reconciliationRef: id } : x)) };
  s = audited(s, uid, "branch_leak", leakId, "routed_to_reconciliation", id, "Member branch mapping unchanged");
  commit(s);
  return OK(id);
}

/* ======================= QR integrity ======================= */

/** Adapter: the QR integrity service at scan time. Already-scanned codes are rejected with a clear message. */
export function scanQr(qrRef: string, memberId: string, at = now()): Res & { accepted?: boolean; message?: string } {
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  const first = state.qrRegistry[qrRef];
  if (!first) {
    commit(audited({ ...state, qrRegistry: { ...state.qrRegistry, [qrRef]: { memberId, at, skuId: null } } }, "SYSTEM", "qr", `QR ••••${qrRef.slice(-4)}`, "qr_scanned", memberId, "First scan"));
    return { ...OK(qrRef), accepted: true, message: "Scan accepted" };
  }
  const fm = memberById(mem(), first.memberId)!;
  const same = first.memberId === memberId;
  const message = duplicateQrMessage(same, first.memberId, first.at);
  const ev = ingestSignal({ sourceKey: `QRV-${qrRef}-${memberId}-${at}`, vector: "duplicate_qr", source: "system_validation", memberId, context: same ? "QR already scanned by the same member" : "QR already scanned by another member", signal: { qr: `QR ••••${qrRef.slice(-4)}`, sameMember: same ? "yes" : "no" }, links: { qrRefs: [qrRef], memberIds: same ? [memberId] : [memberId, first.memberId] }, at });
  const id = nextId("DQR", state.duplicateQr);
  commit(audited({ ...state, duplicateQr: [...state.duplicateQr, { id, qrRef, qrMasked: `QR ••••${qrRef.slice(-4)}`, skuId: first.skuId, first: { memberId: fm.id, programme: fm.programme, branchCode: fm.branchCode, at: first.at }, attempt: { memberId: m.id, programme: m.programme, branchCode: m.branchCode, at }, sameMember: same, memberMessage: message, rejectionRef: `QRV-REJ-${pad(state.duplicateQr.length + 1, 5)}`, investigationStatus: "logged", riskEventId: ev.id ?? null }] }, "SYSTEM", "qr", id, "duplicate_qr_rejected", same ? "same member" : "other member (masked)", message));
  return { ...OK(id), accepted: false, message };
}

export function reportTamperedQr(qrRef: string, memberId: string, reason: string, at = now()): Res {
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  if (state.tampered.some((t) => t.qrRef === qrRef && t.status !== "closed")) return OK(undefined, ["Already under investigation"]);
  const ev = ingestSignal({ sourceKey: `QRT-${qrRef}`, vector: "tampered_qr", source: "system_validation", memberId, context: reason, signal: { qr: `QR ••••${qrRef.slice(-4)}` }, links: { qrRefs: [qrRef] }, at });
  const id = nextId("TQR", state.tampered);
  const c: TamperedQrCase = { id, qrRef, qrMasked: `QR ••••${qrRef.slice(-4)}`, skuId: null, memberId, programme: m.programme, branchCode: m.branchCode, reason, at, evidence: [], remarks: [], ownerId: null, status: "open", pin: { status: "not_recorded", party: null, owner: null, decision: null, remarks: null, decisionRef: null, ruleStatus: "business_confirmation_required" }, closure: null, riskEventId: ev.id ?? null };
  commit(audited({ ...state, tampered: [...state.tampered, c] }, "SYSTEM", "tampered_qr", id, "tampered_qr_escalated", reason, "Escalated for investigation, not silently failed"));
  return OK(id);
}
function updTampered(uid: string, id: string, f: (t: TamperedQrCase) => TamperedQrCase | string, action: string, detail: string): Res {
  const t = state.tampered.find((x) => x.id === id);
  if (!t) return NO("Investigation not found");
  if (!canOnMember(uid, "fraud-rules", "edit", t.memberId)) return NO(need("fraud-rules", "Edit"));
  const next = f(t);
  if (typeof next === "string") return NO(next);
  commit(audited({ ...state, tampered: state.tampered.map((x) => (x.id === id ? next : x)) }, uid, "tampered_qr", id, action, detail, ""));
  return OK(id);
}
export const assignTampered = (uid: string, id: string, owner: string) => updTampered(uid, id, (t) => (t.status === "closed" ? "Closed" : { ...t, ownerId: owner, status: "assigned" }), "investigator_assigned", owner);
export const remarkTampered = (uid: string, id: string, text: string) => updTampered(uid, id, (t) => (!text.trim() ? "Write the remark" : { ...t, remarks: [...t.remarks, { at: now(), by: uid, text: text.trim() }] }), "remark_added", text);
export const evidenceTampered = (uid: string, id: string, ref: string, description: string) => updTampered(uid, id, (t) => (!ref.trim() ? "Enter the evidence reference" : { ...t, evidence: [...t.evidence, { id: `EVD-${id}-${t.evidence.length + 1}`, kind: "attachment", ref: ref.trim(), description, sensitive: false, addedBy: uid, addedAt: now() }] }), "evidence_attached", ref);
export const escalateTampered = (uid: string, id: string, reason: string) => updTampered(uid, id, (t) => (t.status === "closed" ? "Closed" : !reason.trim() ? "Give a reason" : { ...t, status: "escalated", remarks: [...t.remarks, { at: now(), by: uid, text: `Escalated: ${reason.trim()}` }] }), "escalated", reason);
/** PIN-sharing responsibility is recorded; adjudication rules are open (OP-QR1). No MPIN is collected. */
export const recordPinResponsibility = (uid: string, id: string, p: { party: string; decision: string; remarks: string }) => updTampered(uid, id, (t) => (/\b\d{4,6}\b/.test(`${p.party} ${p.decision} ${p.remarks}`) ? "Do not enter PIN or MPIN values" : !p.party.trim() ? "Record the party / role" : { ...t, pin: { status: "recorded", party: p.party.trim(), owner: t.ownerId ?? uid, decision: p.decision.trim() || "Recorded for review", remarks: p.remarks.trim(), decisionRef: `PIN-REC-${pad(state.tampered.filter((x) => x.pin.decisionRef).length + 1)}`, ruleStatus: decisionConfirmed("OP-QR1") ? "confirmed" : "business_confirmation_required" } }), "pin_responsibility_recorded", p.party);
export const closeTampered = (uid: string, id: string, outcome: string) => updTampered(uid, id, (t) => (!outcome.trim() ? "Record the outcome" : t.status === "closed" ? "Already closed" : { ...t, status: "closed", closure: { by: uid, at: now(), outcome: outcome.trim() } }), "investigation_closed", outcome);

export function setDigestConfig(uid: string, cfg: { schedule: string | null; recipientGroup: string | null }): Res {
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  commit(audited({ ...state, digest: { ...state.digest, schedule: cfg.schedule, recipientGroup: cfg.recipientGroup } }, uid, "qr_digest", "CONFIG", "digest_configured", `${cfg.schedule ?? "—"} · ${cfg.recipientGroup ?? "—"}`, "Configuration only; inactive until OP-QR1 is confirmed"));
  return OK();
}
export function activateDigest(uid: string): Res {
  if (!can(uid, "fraud-rules", "execute")) return NO(need("fraud-rules", "Execute"));
  if (!decisionConfirmed("OP-QR1")) return NO("The duplicate-QR digest stays inactive until OP-QR1 confirms scope, recipients and ownership");
  if (!state.digest.schedule || !state.digest.recipientGroup) return NO("Configure the schedule and recipient group");
  commit(audited({ ...state, digest: { ...state.digest, enabled: true, status: "confirmed" } }, uid, "qr_digest", "CONFIG", "digest_activated", state.digest.schedule, "OP-QR1 confirmed"));
  return OK();
}
export function buildDigestPreview(date: string): Res {
  const day = state.duplicateQr.filter((d) => d.attempt.at.startsWith(date));
  const id = nextId("QDG", state.digest.previews);
  commit(audited({ ...state, digest: { ...state.digest, previews: [...state.digest.previews, { id, date, duplicateCount: day.length, categories: [], branches: [...new Set(day.map((d) => d.attempt.branchCode))], recipientGroup: state.digest.recipientGroup, dispatch: "not_dispatched" }] } }, "SYSTEM", "qr_digest", id, "digest_preview_built", `${day.length} duplicate(s)`, "Preview only: not dispatched"));
  return OK(id);
}

/* ======================= Data integrity ======================= */

/** Adapter: SFDC member sync validation. Records failing a mandatory rule are never reported as synced. */
export function runSyncValidation(records: { entityId: string; name: string; branchCode: string }[], source = "SFDC member sync (mock)", at = now()): Res & { synced?: string[]; failed?: string[] } {
  const batchId = nextId("DVB", state.validationBatches);
  const branches = new Set(masterStore.get().hierarchy.filter((h) => h.level === "branch").map((h) => h.code));
  const exceptions = [...state.validationExceptions];
  const synced: string[] = [];
  const failed: string[] = [];
  for (const r of records) {
    const errs: { field: string; value: string; type: "missing_mandatory" | "invalid_reference"; msg: string }[] = [];
    if (!r.name.trim()) errs.push({ field: "Member name", value: "(empty)", type: "missing_mandatory", msg: "Member name is mandatory before sync (SOW 9.5)" });
    if (!branches.has(r.branchCode)) errs.push({ field: "Branch reference", value: r.branchCode || "(empty)", type: "invalid_reference", msg: "Branch code not in the Branch & Hierarchy master" });
    if (!errs.length) synced.push(r.entityId);
    else {
      failed.push(r.entityId);
      for (const e of errs) exceptions.push({ id: `DIX-${pad(exceptions.length + 1)}`, entityType: "Member (SFDC)", entityId: r.entityId, source, field: e.field, valueMasked: e.value, errorType: e.type, message: e.msg, detectedAt: at, batchId, status: "open", owner: null, remarks: [], sourceFix: null, reprocess: [] });
    }
  }
  let s: RiskState = { ...state, validationExceptions: exceptions, validationBatches: [...state.validationBatches, { id: batchId, at, source, total: records.length, synced: synced.length, failed: failed.length, status: failed.length ? (synced.length ? "partial" : "failed") : "completed" }], validationRules: state.validationRules.map((v) => ({ ...v, lastValidation: at, errorCount: exceptions.filter((x) => x.field === v.field && x.status !== "resolved").length })) };
  if (failed.length) s = alertOn(s, "mandatory_field_failure", batchId, `${batchId}: ${failed.length} record(s) failed validation and were not synced`);
  commit(audited(s, "SYSTEM", "validation_batch", batchId, "sync_validated", `${synced.length} synced · ${failed.length} failed`, source));
  return { ...OK(batchId), synced, failed };
}
function updException(uid: string, id: string, f: (x: RiskState["validationExceptions"][number]) => RiskState["validationExceptions"][number] | string, action: string, detail: string): Res {
  const x = state.validationExceptions.find((e) => e.id === id);
  if (!x) return NO("Exception not found");
  if (!can(uid, "fraud-rules", "edit")) return NO(need("fraud-rules", "Edit"));
  const next = f(x);
  if (typeof next === "string") return NO(next);
  commit(audited({ ...state, validationExceptions: state.validationExceptions.map((e) => (e.id === id ? next : e)) }, uid, "validation_exception", id, action, detail, "", null, x.status));
  return OK(id);
}
export const assignException = (uid: string, id: string, owner: string) => updException(uid, id, (x) => ({ ...x, owner, status: x.status === "open" ? "assigned" : x.status }), "owner_assigned", owner);
export const remarkException = (uid: string, id: string, text: string) => updException(uid, id, (x) => (!text.trim() ? "Write the remark" : { ...x, remarks: [...x.remarks, { at: now(), by: uid, text: text.trim() }] }), "remark_added", text);
/** The authoritative source confirms its correction; the portal never repairs the record itself. */
export const recordSourceFix = (uid: string, id: string, ref: string) => updException(uid, id, (x) => (!ref.trim() ? "Enter the source correction reference" : { ...x, sourceFix: { ref: ref.trim(), by: uid, at: now() }, status: "awaiting_source_fix" }), "source_fix_recorded", ref);
export const reprocessException = (uid: string, id: string) => updException(uid, id, (x) => ({ ...x, reprocess: [...x.reprocess, { at: now(), outcome: x.sourceFix ? "synced" : "still_failing" }] }), "reprocessed", "Integration reprocess (mock)");
export const resolveException = (uid: string, id: string) => updException(uid, id, (x) => (!x.sourceFix ? "Resolve only after the authoritative source correction is confirmed" : !x.reprocess.some((r) => r.outcome === "synced") ? "Reprocess the record after the source correction" : { ...x, status: "resolved" }), "resolved", "Source correction confirmed and reprocessed");

/* ======================= SFDC hierarchy reconciliation (OP-64 / OP-20) ======================= */

export const reconImpact = (id: string) => {
  const m = state.mismatches.find((x) => x.id === id);
  return m ? mismatchImpact(m, mem(), schemeStore.get()) : { members: [], schemes: [] };
};
function updMismatch(uid: string, id: string, f: (x: RiskState["mismatches"][number]) => RiskState["mismatches"][number] | string, action: string, detail: string): Res {
  const x = state.mismatches.find((e) => e.id === id);
  if (!x) return NO("Mismatch not found");
  if (!can(uid, "fraud-rules", "edit") && !can(uid, "branches", "manage")) return NO("You need Fraud & risk rules: Edit or Branch & hierarchy: Manage");
  const next = f(x);
  if (typeof next === "string") return NO(next);
  commit(audited({ ...state, mismatches: state.mismatches.map((e) => (e.id === id ? { ...next, history: [...next.history, { at: now(), by: uid, action, detail }] } : e)) }, uid, "hierarchy_mismatch", id, action, detail, "Neither SFDC nor the platform is overwritten automatically", null, x.status));
  return OK(id);
}
export const startMismatchReview = (uid: string, id: string) => updMismatch(uid, id, (x) => (x.status !== "open" ? "Already under review" : { ...x, status: "under_review" }), "review_started", "");
export const proposeCorrection = (uid: string, id: string, p: { correction: string; owningSystem: "sfdc" | "platform"; team: string }) => updMismatch(uid, id, (x) => (!p.correction.trim() || !p.team.trim() ? "Record the proposed correction and the responsible team" : x.status === "reconciled" ? "Already reconciled" : { ...x, proposedCorrection: p.correction.trim(), owningSystem: p.owningSystem, responsibleTeam: p.team.trim(), status: "correction_proposed" }), "correction_proposed", `${p.owningSystem}: ${p.correction}`);
export const awaitConfirmation = (uid: string, id: string) => updMismatch(uid, id, (x) => (x.status !== "correction_proposed" ? "Propose the correction first" : { ...x, status: "awaiting_confirmation" }), "awaiting_confirmation", "");
export const confirmCorrection = (uid: string, id: string, ref: string) => updMismatch(uid, id, (x) => (x.status !== "awaiting_confirmation" ? "The correction must be awaiting confirmation" : !ref.trim() ? "Enter the confirmation reference from the owning system" : { ...x, confirmation: { ref: ref.trim(), by: uid, at: now() } }), "correction_confirmed", ref);
export const reprocessMismatch = (uid: string, id: string) => updMismatch(uid, id, (x) => (!x.confirmation ? "Confirm the authoritative correction first" : { ...x, reprocess: { at: now(), outcome: "Platform mapping refreshed from the corrected source (mock)" } }), "mapping_reprocessed", "");
export const markReconciled = (uid: string, id: string) => updMismatch(uid, id, (x) => (!x.confirmation ? "Not reconciled: the authoritative correction is not confirmed" : !x.reprocess ? "Refresh the platform mapping before closing" : { ...x, status: "reconciled" }), "reconciled", "");

/* ======================= Compliance ======================= */

/** DPDP view rows: statuses only, never raw PII. */
export function dpdpRows() {
  const s = mem();
  return s.identities.map((i) => {
    const members = s.members.filter((m) => i.memberIds.includes(m.id));
    const docs = s.documents.filter((d) => i.memberIds.includes(d.memberId));
    return { identityId: i.id, memberIds: i.memberIds, programmes: members.map((m) => m.programme), consent: i.consent.given ? "given" : "not captured", consentAt: i.consent.at, consentSource: i.consent.source, aadhaar: i.maskedAadhaar ?? "Not captured", closedAt: i.accountClosedAt, retentionEnd: i.accountClosedAt ? `${Number(i.accountClosedAt.slice(0, 4)) + SOW.kycRetentionYears}${i.accountClosedAt.slice(4, 10)} (SOW 9.7 rule; policy service not connected)` : "Account open", lockedFields: members.some((m) => m.addresses.home?.locked) ? "Home address locked" : "None locked", verifiedDocs: docs.filter((d) => d.status === "approved").length, tokenisation: "Not supplied by the backend" };
  });
}

/* ======================= Platform audit (read-only aggregation) ======================= */

export interface PlatformAuditRow {
  id: string;
  source: string;
  kind: "access" | "data_change" | "configuration" | "financial" | "risk";
  at: string;
  actor: string;
  memberId: string | null;
  programme: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: string | null;
  after: string | null;
  reason: string;
  approvalRef: string | null;
  location: string | null;
  device: string | null;
}
/** Reads the audit records each module already keeps. Nothing is written or edited here. */
export function platformAudit(): PlatformAuditRow[] {
  const rows: PlatformAuditRow[] = [];
  for (const e of accessLog()) rows.push({ id: e.id, source: "Access log", kind: "access", at: e.at, actor: e.userId, memberId: null, programme: null, entity: "session", entityId: e.sessionRef, action: e.action, before: null, after: null, reason: "", approvalRef: null, location: e.location, device: e.device });
  for (const e of accessStore.get().audit) rows.push({ id: e.id, source: "User & role management", kind: "configuration", at: e.at, actor: e.actorUserId, memberId: null, programme: null, entity: e.targetType, entityId: e.targetId, action: e.action, before: e.previous, after: e.next, reason: e.reason, approvalRef: null, location: null, device: null });
  for (const e of memberStore.get().events) rows.push({ id: e.id, source: "Member management", kind: "data_change", at: e.at, actor: e.by, memberId: e.memberId, programme: e.programme, entity: e.category, entityId: e.memberId, action: e.action, before: e.oldValue, after: e.newValue, reason: e.remarks, approvalRef: e.approvalRequestId, location: null, device: null });
  for (const e of masterStore.get().audit) rows.push({ id: e.id, source: "Master data", kind: "configuration", at: e.at, actor: e.actorUserId, memberId: null, programme: null, entity: e.entityType, entityId: e.entityId, action: e.action, before: e.previousValue, after: e.newValue, reason: e.remarks, approvalRef: e.approvalRequestId, location: null, device: null });
  for (const e of walletStore.get().audit) rows.push({ id: e.id, source: "Wallet & finance", kind: "financial", at: e.at, actor: e.actor, memberId: null, programme: null, entity: e.entity, entityId: e.entityId, action: e.action, before: e.before ?? null, after: e.after ?? null, reason: e.reason, approvalRef: e.approvalRequestId ?? null, location: null, device: null });
  for (const e of commsStore.get().audit) rows.push({ id: e.id, source: "Communication centre", kind: "configuration", at: e.at, actor: e.actor, memberId: null, programme: null, entity: e.entity, entityId: e.entityId, action: e.action, before: e.before, after: e.after, reason: e.reason, approvalRef: e.approvalRequestId, location: null, device: null });
  for (const e of giftsStore.get().audit) rows.push({ id: e.id, source: "Gift & fulfilment", kind: "data_change", at: e.at, actor: e.actor, memberId: null, programme: null, entity: e.entity, entityId: e.entityId, action: e.action, before: e.before, after: e.after, reason: e.reason, approvalRef: e.approvalRequestId, location: null, device: null });
  for (const e of state.audit) rows.push({ id: e.id, source: "Fraud & risk", kind: "risk", at: e.at, actor: e.actor, memberId: null, programme: null, entity: e.entity, entityId: e.entityId, action: e.action, before: e.before, after: e.after, reason: e.reason, approvalRef: e.approvalRequestId, location: null, device: null });
  for (const r of approvalStore.get().requests) for (const h of r.history ?? []) rows.push({ id: h.id, source: "Approval centre", kind: r.module.startsWith("points") || r.module === "wallet" ? "financial" : "configuration", at: h.at, actor: h.userId, memberId: null, programme: r.programme, entity: r.requestType, entityId: r.entityRef, action: h.action, before: null, after: h.stage, reason: h.remarks, approvalRef: r.id, location: null, device: null });
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/* ======================= Governance ======================= */

export function updateRiskDecision(uid: string, id: string, patch: { status: RiskState["decisions"][number]["status"]; answer: string }): Res {
  if (!can(uid, "fraud-rules", "manage")) return NO(need("fraud-rules", "Manage"));
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, uid, "decision", id, patch.status, patch.answer, d.question, null, d.status));
  return OK(id);
}
/** Exports stay inside the user's programme and geography scope. */
export function exportEvents(uid: string): Res & { rows?: RiskEvent[] } {
  if (!can(uid, "fraud-rules", "export")) return NO(need("fraud-rules", "Export"));
  const rows = eventsFor(uid);
  commit(audited(state, uid, "export", "risk-events", "exported", `${rows.length} rows`, "Scoped to the user's programmes and geography"));
  return { ...OK(), rows };
}

/* ======================= Execution handlers ======================= */

const approversOf = (r: ApprovalRequest) => r.stages.map((x) => x.decidedBy).filter(Boolean) as string[];
const notFound = (r: ApprovalRequest) => ({ ok: false, message: `Not executed: no Fraud & risk record matches ${r.entityRef}` });

function execFraud(r: ApprovalRequest) {
  if (r.requestType === "scan_restriction_change") return { ok: true, message: `Mock Fraud & risk adapter recorded "${r.title}". Development only: no V-Guard system was changed` };
  if (r.requestType === "risk_threshold_change") {
    const [id, ver] = r.entityRef.split(" v");
    const rule = state.rules.find((x) => x.id === id && String(x.version) === ver);
    if (!rule) return notFound(r);
    commit(audited({ ...state, rules: state.rules.map((x) => (x === rule ? { ...x, status: "approved_inactive", history: [...x.history, { at: now(), by: "SYSTEM", action: "approved_inactive", detail: `Approved by ${approversOf(r).join(", ")}. Activation is a separate step`, approvalRequestId: r.id }] } : x)) }, "SYSTEM", "anomaly_rule", id, "threshold_approved", "approved_inactive", "Approval does not activate a threshold", r.id));
    return { ok: true, message: `${id} approved and kept inactive${decisionConfirmed("OP-02") ? "" : " (OP-02 open)"}` };
  }
  if (r.requestType === "global_restriction_change") {
    const [id, target] = r.entityRef.split(" ");
    const g = state.globals.find((x) => x.id === id);
    if (!g) return notFound(r);
    const active = target === "active";
    commit(audited({ ...state, globals: state.globals.map((x) => (x.id === id ? { ...x, status: active ? "active" : "inactive", approvedBy: approversOf(r).slice(-1)[0] ?? null, executedAt: now(), history: [...x.history, { at: now(), by: "SYSTEM", action: active ? "activated" : "deactivated", detail: `Approved by ${approversOf(r).join(", ")}`, approvalRequestId: r.id }] } : x)) }, "SYSTEM", "global_restriction", id, active ? "global_restriction_activated" : "global_restriction_deactivated", g.programmes.join(", "), `Authorised by ${approversOf(r).join(", ")}; executed by the restriction adapter (mock)`, r.id, g.status));
    return { ok: true, message: `${id} ${active ? "active" : "inactive"} (mock restriction adapter; backend enforcement not connected)` };
  }
  if (r.requestType === "risk_block_release") {
    const b = state.redemptionBlocks.find((x) => x.id === r.entityRef);
    if (!b) return notFound(r);
    let s: RiskState = { ...state, redemptionBlocks: state.redemptionBlocks.map((x) => (x.id === b.id ? { ...x, blockStatus: "lifted", lift: { by: approversOf(r).slice(-1)[0] ?? "", at: now(), reason: r.versions[r.versions.length - 1]?.reason ?? "", approvalRef: r.id } } : x)) };
    s = alertOn(s, "member_reinstated", b.id, `${b.redemptionRef} redemption risk block lifted (${r.id})`);
    commit(audited(s, "SYSTEM", "redemption_block", b.id, "redemption_block_lifted", "lifted", "Original risk flag and redemption history kept", r.id, "blocked"));
    return { ok: true, message: `${b.id} lifted; risk flag ${b.riskEventId} kept` };
  }
  return { ok: true, message: `Recorded ${r.requestType}` };
}

function execDevice(r: ApprovalRequest) {
  const [id, action] = r.entityRef.split(" ");
  const d = deviceOf(id);
  if (!d) return { ok: false, message: `Not executed: no device ${id}` };
  const a = d.actions.find((x) => x.approvalRequestId === r.id);
  if (!a || a.status === "executed") return { ok: true, message: "Already executed (idempotent)" };
  const blocked = action === "block";
  let s = setDevice(state, { ...d, status: blocked ? "blocked" : "active", investigation: blocked ? "confirmed" : d.investigation, actions: d.actions.map((x) => (x.id === a.id ? { ...x, status: "executed", executedAt: now() } : x)) });
  s = { ...s, cases: s.cases.map((c) => (c.recommendations.some((x) => x.appliedRef === a.id) ? { ...moved(c, "SYSTEM", "restriction_applied", `Device ${id} blocked (${r.id})`), updatedAt: now() } : c)) };
  s = alertOn(s, blocked ? "device_blocked" : "device_released", a.id, `${id} ${blocked ? "blocked" : "released"} (${r.id})`);
  commit(audited(s, "SYSTEM", "device", id, blocked ? "device_blocked" : "device_released", blocked ? "blocked" : "active", `${a.reason}. Approved by ${approversOf(r).join(", ")}. Member restrictions are separate`, r.id, blocked ? "active" : "blocked"));
  return { ok: true, message: `${id} ${blocked ? "blocked" : "released"} (mock device service; handset enforcement not connected)` };
}

registerExecutionHandler("fraud-rules", execFraud);
registerExecutionHandler("devices", execDevice);

/** Keeps statuses in step with the approval engine (rejections, returns, withdrawals). */
function syncFromApprovals() {
  const reqs = approvalStore.get().requests;
  const st = (id: string | null) => reqs.find((r) => r.id === id)?.status;
  const back = (s?: string) => s === "rejected" || s === "returned" || s === "withdrawn";
  let changed = false;
  const rules = state.rules.map((x) => (x.status === "pending_approval" && back(st(x.approvalRequestId)) ? ((changed = true), { ...x, status: st(x.approvalRequestId) === "rejected" ? ("rejected" as const) : ("draft" as const) }) : x));
  const globals = state.globals.map((g) => (g.status.startsWith("pending") && back(st(g.approvalRequestId)) ? ((changed = true), { ...g, status: g.status === "pending_activation" ? ("inactive" as const) : ("active" as const) }) : g));
  const devices = state.devices.map((d) => (d.actions.some((a) => a.status === "pending_approval" && back(st(a.approvalRequestId))) ? ((changed = true), { ...d, actions: d.actions.map((a) => (a.status === "pending_approval" && back(st(a.approvalRequestId)) ? { ...a, status: "rejected" as const } : a)) }) : d));
  if (changed) commit({ ...state, rules, globals, devices });
}
/** Member reinstatements executed in Member Management raise a "member reinstated" alert once. */
function syncFromMembers() {
  let s = state;
  for (const r of mem().restrictions.filter((x) => x.status === "lifted" && state.cases.some((c) => c.recommendations.some((y) => y.appliedRef === x.id)))) s = alertOn(s, "member_reinstated", r.id, `${r.id} lifted for ${r.memberIds.join(", ")}`);
  if (s !== state) commit(audited(s, "SYSTEM", "alert", "member_reinstated", "alert_sent", null, "Reinstatement executed in Member Management"));
}

approvalStore.subscribe(syncFromApprovals);
syncFromApprovals();
memberStore.subscribe(syncFromMembers);
sendSeedAlerts();
export const ACTIVE_CASE_STATUSES = OPEN_CASE;
