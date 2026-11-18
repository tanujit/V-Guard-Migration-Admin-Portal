/**
 * SCHEME STORE — in-browser mock repository for Scheme & Incentive Management (Phase 6).
 * Every action re-checks RBAC (module, action, programme scope) and writes an append-only audit event.
 * Financial and lifecycle changes go through the central approval engine; registered execution
 * handlers apply them only after final approval. Approval never activates a scheme: activation is a
 * separate call to the (mock) scheme-engine adapter. Settlement is a two-level approved operation.
 */
import { useSyncExternalStore } from "react";
import { findBranch } from "@/config/geography";
import { REFERRAL_RELATIONSHIP } from "@/config/schemeCatalogue";
import { accessStore } from "@/features/access/store";
import { hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow, withdrawRequest } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { masterStore } from "@/features/masters/store";
import { memberStore } from "@/features/members/store";
import type { ApprovalRequest, FieldChange } from "@/types/approval";
import type { RequestInput } from "@/features/approvals/engine";
import type { ActionId } from "@/types/rbac";
import type { ActivationAttempt, BackendRedemption, Bonus, Campaign, ContestEntry, ExclusivityRule, GameConfig, GiftBatch, ReferralRule, Scheme, SchemeAuditEvent, SchemeConfig, SchemeDecision, SchemeState, SchemeVersion, SettlementRequest, SourceTxn, SpecialExtension, Tier } from "@/types/schemes";
import { branchesInScope, businessBlockers, campaignStates, configDiff, configFields, displayVersion, eligiblePopulation, exclusivityConflicts, latestVersion, schemeById, settlementPreview, validateBonus, validateCampaign, validateConfig, validateGame, versionOf } from "./engine";
import { evaluateTxn, postCandidates, postReversals, runPeriodEvaluation, type EngineCtx } from "./mockEngine";
import { buildSchemeState } from "./seed";

const STORAGE_KEY = "vg-rishta.scheme-store.v1";

/** Links seeded records to the approval requests raised for them in the approval seed (by entity reference). */
function linkApprovals(s: SchemeState): SchemeState {
  const reqs = approvalStore.get().requests;
  const find = (ref: string) => [...reqs].reverse().find((r) => r.entityRef === ref)?.id ?? null;
  return {
    ...s,
    schemes: s.schemes.map((sc) => ({ ...sc, versions: sc.versions.map((v) => ({ ...v, approvalRequestId: v.approvalRequestId ?? find(`${sc.id} v${v.version}`) })) })),
    extensions: s.extensions.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    exclusivity: s.exclusivity.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    settlements: s.settlements.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    releases: s.releases.map((x) => ({ ...x, approvalRef: x.approvalRef || find(x.requestId) || "" })),
    tiers: s.tiers.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    campaigns: s.campaigns.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    games: s.games.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    audit: s.audit.map((e) => (e.changeType === "approved" && !e.approvalRequestId ? { ...e, approvalRequestId: find(`${e.entityId} v${e.schemeVersion}`) } : e)),
  };
}
const build = (): SchemeState => linkApprovals(buildSchemeState());

function load(): SchemeState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SchemeState;
  } catch {
    /* seed */
  }
  return build();
}
let state: SchemeState = load();
const listeners = new Set<() => void>();
function commit(next: SchemeState) {
  if (next === state) return;
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const schemeStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useSchemeState = () => useSyncExternalStore(schemeStore.subscribe, schemeStore.get, schemeStore.get);
export const resetSchemeDemoData = () => commit(build());

type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const now = () => demoNow();
const today = () => demoNow().slice(0, 10);
const ms = () => masterStore.get();
const mem = () => memberStore.get();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");

/* ======================= Permissions ======================= */

/** The action must be allowed for every programme the record covers. */
export function canFor(uid: string, module: string, action: ActionId, programmes: string[] = []) {
  if (!programmes.length) return hasPermission(acc(), uid, module, action);
  for (const p of programmes) {
    const d = hasPermission(acc(), uid, module, action, { programme: p });
    if (!d.allowed) return d;
  }
  return { allowed: true, reason: "" };
}
const deny = (module: string, action: string, programmes: string[]) => `You need ${module.replace("-", " ")}: ${action.replace("_", " ")}${programmes.length ? ` for ${programmes.join(", ")}` : ""}`;

/* ======================= Audit ======================= */

function audit(s: SchemeState, uid: string, e: Omit<SchemeAuditEvent, "id" | "ref" | "by" | "orgId" | "at">): SchemeState {
  const n = s.audit.length + 1;
  const ev: SchemeAuditEvent = { ...e, id: `SAU-${pad(n, 6)}`, ref: `SRF-${n + 30000}`, by: uid, orgId: uid === "SYSTEM" ? null : primaryOrg(acc(), uid)?.id ?? null, at: now() };
  return { ...s, audit: [...s.audit, ev] };
}

/* ======================= Approval request helpers ======================= */

/** Programme and location for routing. Multi-programme / multi-state records route only to all-scope Checkers. */
function routing(programmes: string[], branchCodes: string[]) {
  const states = Array.from(new Set(branchCodes.map((b) => findBranch(b)?.state.code).filter(Boolean))) as string[];
  return { programme: programmes.length === 1 ? programmes[0] : programmes.length ? programmes.join(" + ") : null, location: states.length === 1 ? { state: states[0] } : states.length ? { state: "MULTI-STATE" } : null };
}
function raise(uid: string, input: Omit<RequestInput, "attachments" | "justification"> & { justification?: string }) {
  return createRequest(uid, { attachments: [], justification: input.justification ?? "", ...input }, true);
}
const reqOf = (id: string | null) => (id ? approvalStore.get().requests.find((r) => r.id === id) : undefined);
const approverOf = (r: ApprovalRequest) => r.stages.map((x) => x.decidedBy).filter(Boolean).pop() ?? "SYSTEM";

/* ======================= Scheme drafts ======================= */

const putScheme = (s: SchemeState, sc: Scheme): SchemeState => ({ ...s, schemes: s.schemes.map((x) => (x.id === sc.id ? { ...sc, updatedAt: now() } : x)) });
const EDITABLE: Scheme["status"][] = ["draft", "review", "business_confirmation_required"];

export function saveSchemeDraft(uid: string, schemeId: string | null, config: SchemeConfig, reason: string): Res {
  const progs = config.basic.programmes;
  const sc = schemeId ? schemeById(state, schemeId) : undefined;
  if (schemeId && !sc) return NO("Scheme not found");
  const action: ActionId = sc ? "edit" : "create";
  const p = canFor(uid, "schemes", action, progs);
  if (!p.allowed) return NO(deny("Scheme builder", action, progs), p.reason);
  if (!config.basic.name.trim()) return NO("Give the scheme a name before saving");
  const prev = sc ? (versionOf(sc, sc.activeVersion) ?? latestVersion(sc)).config : null;
  if ((prev?.budget.amount ?? null) !== config.budget.amount && !canFor(uid, "scheme-budget", "edit", progs).allowed) return NO("Changing the budget needs Scheme budget & exposure: Edit");
  if (prev && JSON.stringify(prev.settlement) !== JSON.stringify(config.settlement) && !canFor(uid, "scheme-settlement", "edit", progs).allowed) return NO("Changing settlement configuration needs Scheme settlement: Edit");
  if (!prev && JSON.stringify(config.settlement) !== JSON.stringify({ mode: "at_closure", tranches: [{ id: "T1", label: "Final settlement", pct: 100, trigger: "final_settlement", conditions: "After closure and validation" }] }) && !canFor(uid, "scheme-settlement", "edit", progs).allowed) return NO("Configuring partial settlement needs Scheme settlement: Edit");
  const blockers = businessBlockers(state, config);
  const t = now();
  let s = state;
  let id = schemeId;
  if (!sc) {
    id = `SCH-${pad(state.schemes.length + 1)}`;
    const v: SchemeVersion = { version: 1, status: "draft", config, changeReason: reason || "Initial configuration", createdBy: uid, createdAt: t, submittedAt: null, approvalRequestId: null, approvedBy: null, approvedAt: null, effectiveStart: null, effectiveEnd: null, ruleVersion: "R1.0", formulaVersions: {} };
    const ns: Scheme = { id, status: blockers.length ? "business_confirmation_required" : "draft", versions: [v], activeVersion: null, activations: [], settlementStatus: "not_started", createdBy: uid, createdAt: t, updatedAt: t, backdated: { status: "not_requested", requestId: null, dataAvailability: "not_checked", runs: [] }, closedAt: null, deactivatedAt: null };
    s = { ...s, schemes: [...s.schemes, ns] };
    s = audit(s, uid, { entity: "scheme", entityId: id, schemeVersion: 1, field: "Scheme", oldValue: null, newValue: `Draft · ${config.basic.name}`, changeType: "created", reason, approvalRequestId: null });
  } else {
    const last = latestVersion(sc);
    const inPlace = last.status === "draft" && EDITABLE.concat(["active", "approved", "scheduled", "budget_exhausted", "returned", "rejected", "activation_failed"]).includes(sc.status);
    if (!inPlace && ["pending_approval"].includes(sc.status)) return NO("A version is pending approval and is read-only. Wait for the decision");
    if (last.status === "submitted") return NO("The latest version is submitted and read-only");
    if (["closed", "deactivated"].includes(sc.status)) return NO(`The scheme is ${sc.status}; it cannot be changed`);
    const diff = configDiff(state, ms(), inPlace ? last.config : prev, config);
    if (!diff.length && inPlace) return NO("Nothing changed");
    let next: Scheme;
    let vn: number;
    if (inPlace) {
      vn = last.version;
      next = { ...sc, versions: sc.versions.map((v) => (v.version === vn ? { ...v, config, changeReason: reason || v.changeReason } : v)) };
    } else {
      vn = last.version + 1;
      next = { ...sc, versions: [...sc.versions, { version: vn, status: "draft", config, changeReason: reason, createdBy: uid, createdAt: t, submittedAt: null, approvalRequestId: null, approvedBy: null, approvedAt: null, effectiveStart: null, effectiveEnd: null, ruleVersion: `R${vn}.0`, formulaVersions: {} }] };
    }
    if (EDITABLE.includes(sc.status) || sc.status === "returned" || sc.status === "rejected") next = { ...next, status: blockers.length ? "business_confirmation_required" : "draft" };
    s = putScheme(s, next);
    for (const f of diff) s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: vn, field: f.label, oldValue: f.before == null ? null : String(f.before), newValue: f.after == null ? null : String(f.after), changeType: inPlace ? "draft_updated" : "version_created", reason, approvalRequestId: null });
  }
  commit(s);
  return OK(id!, blockers.length ? [`Saved with ${blockers.length} business-confirmation item(s); it cannot be submitted or activated until they are confirmed`] : []);
}

/** Starts a new draft version of an approved / active scheme (the prior version is never overwritten). */
export function newVersion(uid: string, schemeId: string, reason: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const last = latestVersion(sc);
  if (last.status === "draft") return OK(schemeId, ["A draft version already exists"]);
  const base = (versionOf(sc, sc.activeVersion) ?? last).config;
  return saveSchemeDraft(uid, schemeId, structuredClone({ ...base, basic: { ...base.basic } }), reason || "New version");
}

export function markReview(uid: string, schemeId: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const v = latestVersion(sc);
  if (!canFor(uid, "schemes", "edit", v.config.basic.programmes).allowed) return NO("You need Scheme builder: Edit");
  if (v.status !== "draft") return NO("Only a draft can move to Review");
  const val = validateConfig(state, ms(), sc.id, v.config, { today: today(), members: mem() });
  if (val.blockers.length) { commit(putScheme(state, { ...sc, status: "business_confirmation_required" })); return NO(...val.blockers.map((b) => `${b.ref}: ${b.message}`)); }
  if (!EDITABLE.includes(sc.status)) return OK(schemeId, ["Validation reviewed"]);
  let s = putScheme(state, { ...sc, status: "review" });
  s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Status", oldValue: sc.status, newValue: "Review", changeType: "review", reason: `${val.errors.length} error(s), ${val.warnings.length} warning(s)`, approvalRequestId: null });
  commit(s);
  return OK(schemeId, val.errors.length ? [`${val.errors.length} error(s) must be fixed before submission`] : []);
}

function impactFor(sc: Scheme, v: SchemeVersion, extra: string[] = []) {
  const c = v.config;
  const pop = eligiblePopulation(mem(), ms(), c);
  const val = validateConfig(state, ms(), sc.id, c, { today: today(), members: mem() });
  const branches = [...branchesInScope(c.eligibility.branchScope)];
  return {
    affectedMembers: pop.lowerBound,
    affectedProgrammes: c.basic.programmes,
    affectedBranches: branches.length > 8 ? [`${branches.length} branches`] : branches.map((b) => findBranch(b)?.branch.name ?? b),
    pointsImpact: c.budget.amount ?? undefined,
    schemeImpact: `Budget cap ${c.budget.amount?.toLocaleString("en-IN") ?? "not set"} points · Projected liability: Pending business formula (OP-SB-LIAB), no estimate available · Settlement: ${c.settlement.tranches.map((t) => `${t.label} ${t.pct}%`).join(", ")} with two-level approval`,
    effectiveDate: c.duration.start,
    operationalImpact: `Eligible members in the development member master: ${pop.count ?? `${pop.lowerBound}+ (not computable: ${pop.notComputable.join(", ")})`}. Approval does not activate the scheme`,
    dependencies: [...val.warnings, ...extra],
  };
}

export function submitScheme(uid: string, schemeId: string, note = ""): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const v = latestVersion(sc);
  const progs = v.config.basic.programmes;
  if (!canFor(uid, "schemes", "submit", progs).allowed) return NO(deny("Scheme builder", "submit", progs));
  if (v.status !== "draft") return NO("Only a draft version can be submitted");
  const val = validateConfig(state, ms(), sc.id, v.config, { today: today(), members: mem() });
  if (val.blockers.length) {
    commit(putScheme(state, { ...sc, status: "business_confirmation_required" }));
    return NO("Business confirmation required before submission:", ...val.blockers.map((b) => `${b.ref}: ${b.message}`));
  }
  if (val.errors.length) return NO(...val.errors);
  const prior = sc.versions.filter((x) => ["approved", "active", "superseded"].includes(x.status)).pop();
  const isBudgetOnly = !!prior && configDiff(state, ms(), prior.config, v.config).every((f) => f.key === "budget");
  const type = isBudgetOnly ? "scheme_budget_change" : prior || sc.activeVersion ? "scheme_modify" : "scheme_create";
  if (type === "scheme_budget_change" && !canFor(uid, "scheme-budget", "submit", progs).allowed) return NO("Submitting a budget change needs Scheme budget & exposure: Submit");
  const rt = routing(progs, [...branchesInScope(v.config.eligibility.branchScope)]);
  const fields: FieldChange[] = configFields(state, ms(), prior?.config ?? null, v.config).filter((f) => !prior || String(f.before) !== String(f.after) || f.material);
  const out = raise(uid, { requestType: type, title: `${type === "scheme_create" ? "Create" : type === "scheme_budget_change" ? "Change budget of" : "Modify"} scheme ${v.config.basic.name} (v${v.version})`, entityRef: `${sc.id} v${v.version}`, programme: rt.programme, location: rt.location, amount: v.config.budget.amount, fields, purpose: v.config.basic.description || v.config.basic.name, reason: v.changeReason || note || "Scheme configuration", justification: note, impact: impactFor(sc, v), priority: "high" });
  if (!out.ok || !out.id) return out;
  // Withdraw an earlier returned request that this version supersedes.
  const returned = sc.versions.filter((x) => x.status === "returned" && x.approvalRequestId);
  returned.forEach((x) => { const r = reqOf(x.approvalRequestId); if (r?.status === "returned" && r.makerId === uid) withdrawRequest(uid, r.id, `Superseded by ${sc.id} v${v.version}`); });
  const live = sc.activeVersion != null && ["active", "budget_exhausted"].includes(sc.status);
  let s = putScheme(state, { ...sc, status: live ? sc.status : "pending_approval", versions: sc.versions.map((x) => (x.version === v.version ? { ...x, status: "submitted", submittedAt: now(), approvalRequestId: out.id! } : x.status === "returned" ? { ...x, status: "withdrawn" } : x)) });
  s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Status", oldValue: sc.status, newValue: "Pending approval", changeType: "submitted", reason: note, approvalRequestId: out.id });
  commit(s);
  return OK(out.id, [...out.warnings, "Submitted. Approval does not activate the scheme; activation is a separate step after approval"]);
}

/* ======================= Activation (mock engine adapter) ======================= */

export function activationChecks(sc: Scheme, v: SchemeVersion) {
  const r = reqOf(v.approvalRequestId);
  const val = validateConfig(state, ms(), sc.id, v.config, { today: today() });
  const conflicts = exclusivityConflicts(state).filter((c) => c.schemes.includes(sc.id));
  return [
    { label: "Approved version", ok: v.status === "approved" && (!r || r.status === "approved"), detail: r ? `${r.id} · ${r.status}` : v.approvedAt ? `Approved ${v.approvedAt}` : "No approval" },
    { label: "Business confirmation", ok: !val.blockers.length, detail: val.blockers.length ? val.blockers.map((b) => b.ref).join(", ") : "No open blockers" },
    { label: "Configuration still valid against the masters", ok: !val.errors.length, detail: val.errors[0] ?? "Valid" },
    { label: "Budget cap", ok: (v.config.budget.amount ?? 0) > 0, detail: v.config.budget.amount ? `${v.config.budget.amount.toLocaleString("en-IN")} points` : "Not set" },
    { label: "Exclusivity conflicts", ok: !conflicts.length, detail: conflicts.length ? conflicts[0].message : "None involving this scheme" },
    { label: "Start date reached", ok: v.config.duration.start <= today(), detail: v.config.duration.start <= today() ? `Started ${v.config.duration.start}` : `Starts ${v.config.duration.start}: will stay Scheduled` },
    { label: "Production engine", ok: true, detail: "Not connected: activation applies to the development engine only. Production activation stays blocked by OP-SB-LIAB" },
  ];
}

export function activateScheme(uid: string, schemeId: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const v = [...sc.versions].reverse().find((x) => x.status === "approved");
  if (!v) return NO("There is no approved version to activate. Approval comes first; activation never bypasses it");
  const progs = v.config.basic.programmes;
  if (uid !== "SYSTEM" && !canFor(uid, "schemes", "activate", progs).allowed) return NO(deny("Scheme builder", "activate", progs));
  const checks = activationChecks(sc, v);
  const blocking = checks.filter((c) => !c.ok && c.label !== "Start date reached");
  const notYet = !checks.find((c) => c.label === "Start date reached")!.ok;
  const t = now();
  const attempt = (result: ActivationAttempt["result"], message: string): ActivationAttempt => ({ at: t, by: uid, version: v.version, result, checks, message, engine: "mock_development" });
  const hadActive = sc.activeVersion != null;
  if (blocking.length || sc.simulateActivationFailure) {
    const message = blocking.length ? `Activation refused: ${blocking.map((b) => b.label).join(", ")}` : "Mock engine adapter returned a failure (simulated). Nothing was activated";
    const next: Scheme = { ...sc, simulateActivationFailure: false, status: hadActive ? sc.status : "activation_failed", activations: [...sc.activations, attempt("failure", message)], versions: sc.versions.map((x) => (x.version === v.version && !blocking.length ? x : x)) };
    let s = putScheme(state, next);
    s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Activation", oldValue: sc.status, newValue: "Activation failed", changeType: "activation_failed", reason: message, approvalRequestId: v.approvalRequestId });
    commit(s);
    return NO(message, ...(hadActive ? [`The prior active version v${sc.activeVersion} keeps running unchanged`] : []));
  }
  if (notYet) {
    if (hadActive) return NO(`v${v.version} starts ${v.config.duration.start}; the active version continues until then`);
    let s = putScheme(state, { ...sc, status: "scheduled" });
    s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Status", oldValue: sc.status, newValue: "Scheduled", changeType: "scheduled", reason: `Starts ${v.config.duration.start}`, approvalRequestId: v.approvalRequestId });
    commit(s);
    return OK(schemeId, [`Scheduled: the engine activates it on ${v.config.duration.start}`]);
  }
  const start = v.config.duration.start > today() ? v.config.duration.start : today();
  const next: Scheme = {
    ...sc,
    status: "active",
    activeVersion: v.version,
    activations: [...sc.activations, attempt("success", "Activated in the development scheme engine (mock adapter). Not a production activation")],
    versions: sc.versions.map((x) => (x.version === v.version ? { ...x, status: "active", effectiveStart: start } : x.version === sc.activeVersion ? { ...x, status: "superseded", effectiveEnd: start } : x)),
  };
  let s = putScheme(state, next);
  s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Activation", oldValue: hadActive ? `v${sc.activeVersion} active` : sc.status, newValue: `v${v.version} active (development engine)`, changeType: "activated", reason: "", approvalRequestId: v.approvalRequestId });
  commit(s);
  return OK(schemeId, hadActive ? [`v${sc.activeVersion} superseded; transactions already calculated keep their version`] : []);
}

export function setActivationFailureSimulation(uid: string, schemeId: string, on: boolean): Res {
  if (!hasPermission(acc(), uid, "schemes", "activate").allowed) return NO("You need Scheme builder: Activate");
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  commit(putScheme(state, { ...sc, simulateActivationFailure: on }));
  return OK(schemeId);
}

/** Scheduled → Active on the start date; Active → Completed after the end date. */
export function runLifecycleCheck(uid: string): Res {
  if (!hasPermission(acc(), uid, "schemes", "activate").allowed) return NO("You need Scheme builder: Activate");
  const msgs: string[] = [];
  for (const sc of state.schemes.filter((x) => x.status === "scheduled")) {
    const v = [...sc.versions].reverse().find((x) => x.status === "approved");
    if (v && v.config.duration.start <= today()) { const r = activateScheme("SYSTEM", sc.id); msgs.push(`${sc.id}: ${r.ok ? "activated" : r.errors[0]}`); }
  }
  for (const sc of state.schemes.filter((x) => x.status === "active" || x.status === "budget_exhausted")) {
    const c = displayVersion(sc).config;
    if (c.duration.end < today()) {
      let s = putScheme(state, { ...sc, status: "completed", settlementStatus: sc.settlementStatus === "not_started" ? "settlement_pending" : sc.settlementStatus });
      s = audit(s, "SYSTEM", { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Status", oldValue: sc.status, newValue: "Completed", changeType: "completed", reason: `End date ${c.duration.end} passed`, approvalRequestId: null });
      commit(s);
      msgs.push(`${sc.id}: completed`);
    }
  }
  return OK(undefined, msgs.length ? msgs : ["Nothing due"]);
}

/* ======================= Deactivation, closure, budget, backdated ======================= */

export function requestDeactivation(uid: string, schemeId: string, reason: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const c = displayVersion(sc).config;
  if (!canFor(uid, "schemes", "disable", c.basic.programmes).allowed || !canFor(uid, "schemes", "submit", c.basic.programmes).allowed) return NO("You need Scheme builder: Disable and Submit");
  if (!["active", "scheduled", "approved", "budget_exhausted"].includes(sc.status)) return NO(`A ${sc.status.replace(/_/g, " ")} scheme cannot be deactivated`);
  if (!reason.trim()) return NO("A reason is required");
  const rt = routing(c.basic.programmes, [...branchesInScope(c.eligibility.branchScope)]);
  const out = raise(uid, { requestType: "scheme_activation", title: `Deactivate scheme ${c.basic.name}`, entityRef: `${sc.id}:deactivate`, programme: rt.programme, location: rt.location, amount: null, fields: [{ key: "name", label: "Scheme", kind: "text", before: c.basic.name, after: c.basic.name }, { key: "status", label: "Scheme status", kind: "status", material: true, before: sc.status, after: "Deactivated" }], purpose: "Stop the scheme earning", reason, impact: { operationalImpact: "Accruals stop from the execution date. Ledger history, versions and performance are kept; unsettled points still need settlement" } });
  if (!out.ok) return out;
  commit(audit(state, uid, { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Deactivation", oldValue: sc.status, newValue: "Deactivation requested", changeType: "deactivation_requested", reason, approvalRequestId: out.id ?? null }));
  return OK(out.id, out.warnings);
}

export function requestClosure(uid: string, schemeId: string, reason: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const c = displayVersion(sc).config;
  if (!canFor(uid, "schemes", "close", c.basic.programmes).allowed || !canFor(uid, "schemes", "submit", c.basic.programmes).allowed) return NO("You need Scheme builder: Close and Submit");
  if (!["completed", "deactivated", "budget_exhausted"].includes(sc.status)) return NO("Only a completed, deactivated or budget-exhausted scheme can be closed");
  if (!reason.trim()) return NO("A reason is required");
  const rt = routing(c.basic.programmes, [...branchesInScope(c.eligibility.branchScope)]);
  const out = raise(uid, { requestType: "scheme_closure", title: `Close scheme ${c.basic.name}`, entityRef: `${sc.id}:close`, programme: rt.programme, location: rt.location, amount: null, fields: [{ key: "status", label: "Scheme status", kind: "status", material: true, before: sc.status, after: "Closed" }], purpose: "Close the scheme", reason, impact: { operationalImpact: "Closure does not settle points. Unsettled scheme points need a separate settlement request with two-level approval" } });
  if (!out.ok) return out;
  commit(audit(state, uid, { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Closure", oldValue: sc.status, newValue: "Closure requested", changeType: "closure_requested", reason, approvalRequestId: out.id ?? null }));
  return OK(out.id, out.warnings);
}

export function requestBudgetChange(uid: string, schemeId: string, amount: number | null, reason: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const base = displayVersion(sc).config;
  const progs = base.basic.programmes;
  if (!canFor(uid, "scheme-budget", "edit", progs).allowed) return NO("You need Scheme budget & exposure: Edit. Scheme View does not include budget changes");
  if (amount == null || !(amount > 0)) return NO("Enter the new budget");
  if (!reason.trim()) return NO("A reason is required");
  if (latestVersion(sc).status === "draft" || latestVersion(sc).status === "submitted") return NO("Finish or submit the open draft version first");
  const saved = saveSchemeDraft(uid, schemeId, { ...structuredClone(base), budget: { ...base.budget, amount } }, `Budget change: ${reason}`);
  if (!saved.ok) return saved;
  return submitScheme(uid, schemeId, reason);
}

export function requestBackdated(uid: string, schemeId: string, reason: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const c = displayVersion(sc).config;
  if (!canFor(uid, "scheme-budget", "submit", c.basic.programmes).allowed) return NO("You need Scheme budget & exposure: Submit");
  if (!c.backdated.enabled) return NO("Backdated calculation is not configured on this scheme version");
  if (sc.activeVersion == null) return NO("The scheme must be activated before a backdated run is requested");
  if (["pending_approval", "approved", "running", "completed"].includes(sc.backdated.status)) return NO(`A backdated calculation is already ${sc.backdated.status.replace("_", " ")}`);
  const earliest = state.txns.reduce((m, t) => (t.date < m ? t.date : m), "9999");
  const availability = earliest <= c.backdated.historicalFrom ? "available" : earliest <= c.backdated.historicalTo ? "partial" : "unavailable";
  if (availability === "unavailable") return NO("No transaction data is available for the historical period");
  const inRange = state.txns.filter((t) => t.date >= c.backdated.historicalFrom && t.date <= c.backdated.historicalTo);
  const rt = routing(c.basic.programmes, [...branchesInScope(c.eligibility.branchScope)]);
  const out = raise(uid, { requestType: "scheme_backdated_calc", title: `Backdated calculation · ${c.basic.name}`, entityRef: `${sc.id}:backdated`, programme: rt.programme, location: rt.location, amount: null, fields: [{ key: "period", label: "Historical period", kind: "text", before: null, after: `${c.backdated.historicalFrom} to ${c.backdated.historicalTo}`, material: true }, { key: "announced", label: "Announcement date", kind: "date", before: null, after: c.backdated.announcementDate }, { key: "data", label: "Data availability", kind: "text", before: null, after: `${availability} · ${inRange.length} transactions in the feed` }, { key: "exposure", label: "Estimated exposure", kind: "text", before: null, after: "Not available: projected liability formula pending (OP-SB-LIAB)", material: true }], purpose: "Credit eligible historical transactions under the approved configuration", reason, impact: { operationalImpact: "Runs as a separate backend operation after approval. Per-transaction idempotency keys prevent any double credit", dependencies: ["OP-SB-LIAB: no exposure estimate"] } });
  if (!out.ok) return out;
  let s = putScheme(state, { ...sc, backdated: { ...sc.backdated, status: "pending_approval", requestId: out.id ?? null, dataAvailability: availability } });
  s = audit(s, uid, { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Backdated calculation", oldValue: sc.backdated.status, newValue: "Pending approval", changeType: "backdated_requested", reason, approvalRequestId: out.id ?? null });
  commit(s);
  return OK(out.id, out.warnings);
}

const engineCtx = (origin: EngineCtx["origin"]): EngineCtx => ({ ms: ms(), now: now(), origin, memberOf: (id) => mem().members.find((m) => m.id === id), restrictions: mem().restrictions });

export function runBackdated(uid: string, schemeId: string): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  if (!hasPermission(acc(), uid, "schemes", "activate").allowed) return NO("Running the approved backdated calculation needs Scheme builder: Activate (engine operator)");
  if (!["approved", "completed"].includes(sc.backdated.status)) return NO("The backdated calculation has not been approved");
  const c = displayVersion(sc).config;
  const txns = state.txns.filter((t) => t.date >= c.backdated.historicalFrom && t.date <= c.backdated.historicalTo);
  let s = state;
  let posted = 0, points = 0, dups = 0;
  for (const t of txns) {
    const ev = evaluateTxn(s, engineCtx("backdated"), t, sc.id);
    const out = postCandidates(s, engineCtx("backdated"), ev.candidates, false);
    s = postReversals(out.state, ev.reversals);
    posted += out.summary.posted; points += out.summary.points; dups += out.summary.duplicates;
  }
  const cur = s.schemes.find((x) => x.id === sc.id)!;
  s = putScheme(s, { ...cur, backdated: { ...cur.backdated, status: "completed", runs: [...cur.backdated.runs, { at: now(), by: uid, processed: txns.length, credited: posted, duplicates: dups, points }] } });
  s = audit(s, uid, { entity: "ledger", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Backdated run", oldValue: null, newValue: `${posted} credited (${points} points); ${dups} already credited and skipped`, changeType: "backdated_run", reason: `${txns.length} historical transactions evaluated`, approvalRequestId: sc.backdated.requestId });
  commit(s);
  return OK(schemeId, [`${txns.length} historical transactions evaluated: ${posted} credited (${points.toLocaleString("en-IN")} points), ${dups} duplicates refused`]);
}

/* ======================= Extensions & exclusivity ======================= */

export function requestExtension(uid: string, schemeId: string, input: { kind: SpecialExtension["kind"]; memberIds: string[]; branchCodes: string[]; reason: string; effectiveFrom: string }): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const c = displayVersion(sc).config;
  if (!canFor(uid, "schemes", "submit", c.basic.programmes).allowed) return NO("You need Scheme builder: Submit");
  if (!["active", "approved", "scheduled"].includes(sc.status)) return NO("Extensions apply to approved, scheduled or active schemes");
  if (input.kind === "branch" ? !input.branchCodes.length : !input.memberIds.length) return NO(input.kind === "branch" ? "Select a branch" : "Select the member(s)");
  if (input.kind === "member" && input.memberIds.length > 1) return NO("A single-member extension takes one member");
  const unknown = input.memberIds.filter((id) => !mem().members.some((m) => m.id === id));
  if (unknown.length) return NO(`Unknown members: ${unknown.join(", ")}`);
  const wrong = input.memberIds.map((id) => mem().members.find((m) => m.id === id)!).filter((m) => !c.basic.programmes.includes(m.programme));
  if (wrong.length) return NO(`Members outside the scheme programmes: ${wrong.map((m) => m.id).join(", ")}`);
  if (!input.reason.trim()) return NO("A reason is required");
  const id = `EXT-${pad(state.extensions.length + 1)}`;
  const rt = routing(c.basic.programmes, input.branchCodes);
  const out = raise(uid, { requestType: "scheme_extension", title: `Extend ${c.basic.name} to ${input.kind === "branch" ? input.branchCodes.join(", ") : input.memberIds.join(", ")}`, entityRef: id, programme: rt.programme, location: rt.location, amount: null, fields: [{ key: "scheme", label: "Scheme (version kept unchanged)", kind: "text", before: `${sc.id} v${sc.activeVersion ?? latestVersion(sc).version}`, after: `${sc.id} v${sc.activeVersion ?? latestVersion(sc).version}` }, { key: "ext", label: input.kind === "branch" ? "Additional branch" : "Additional member(s)", kind: "text", material: true, before: null, after: input.kind === "branch" ? input.branchCodes.join(", ") : input.memberIds.join(", ") }, { key: "from", label: "Effective from", kind: "date", before: null, after: input.effectiveFrom }], purpose: "Special-member extension (SOW 6.2.15)", reason: input.reason, impact: { affectedMembers: input.memberIds.length || undefined, operationalImpact: "Recorded as a separate change; the scheme configuration version is not modified. Exposure is tracked separately" } });
  if (!out.ok) return out;
  let s: SchemeState = { ...state, extensions: [...state.extensions, { id, schemeId, baseVersion: sc.activeVersion ?? latestVersion(sc).version, kind: input.kind, memberIds: input.memberIds, branchCodes: input.branchCodes, reason: input.reason, effectiveFrom: input.effectiveFrom, status: "pending_approval", approvalRequestId: out.id ?? null, createdBy: uid, createdAt: now() }] };
  s = audit(s, uid, { entity: "extension", entityId: id, schemeVersion: sc.activeVersion, field: "Special-member extension", oldValue: null, newValue: input.kind === "branch" ? input.branchCodes.join(", ") : input.memberIds.join(", "), changeType: "extension_requested", reason: input.reason, approvalRequestId: out.id ?? null });
  commit(s);
  return OK(id, out.warnings);
}

export function requestExclusivity(uid: string, input: Pick<ExclusivityRule, "schemeA" | "schemeB" | "programmes" | "from" | "to" | "description">): Res {
  const a = schemeById(state, input.schemeA);
  const b = schemeById(state, input.schemeB);
  if (!a || !b || a.id === b.id) return NO("Choose two different schemes");
  const progs = Array.from(new Set([...displayVersion(a).config.basic.programmes, ...displayVersion(b).config.basic.programmes]));
  if (!canFor(uid, "schemes", "submit", progs).allowed) return NO("You need Scheme builder: Submit for both schemes' programmes");
  if (!input.from || !input.to || input.to < input.from) return NO("Enter a valid effective period");
  if (!input.description.trim()) return NO("Describe the conflict this rule prevents");
  if (state.exclusivity.some((r) => r.status !== "inactive" && r.status !== "rejected" && ((r.schemeA === a.id && r.schemeB === b.id) || (r.schemeA === b.id && r.schemeB === a.id)))) return NO("An exclusivity rule for these schemes already exists");
  const id = `EXR-${pad(state.exclusivity.length + 1)}`;
  const rule: ExclusivityRule = { id, schemeA: a.id, schemeB: b.id, programmes: input.programmes, products: { allProducts: false, categoryIds: [], subCategoryIds: [], skuIds: [] }, branchScope: { allBranches: false, stateCodes: [], districtCodes: [], branchCodes: [] }, from: input.from, to: input.to, description: input.description, status: "pending_approval", approvalRequestId: null, createdBy: uid, createdAt: now() };
  const preview = exclusivityConflicts({ ...state, exclusivity: [...state.exclusivity, { ...rule, status: "active" }] }).filter((c) => c.schemes.includes(a.id) || c.schemes.includes(b.id));
  const rt = routing(progs, []);
  const out = raise(uid, { requestType: "scheme_exclusivity", title: `Make ${a.id} and ${b.id} mutually exclusive`, entityRef: id, programme: rt.programme, location: null, amount: null, fields: [{ key: "pair", label: "Schemes", kind: "text", material: true, before: "Inclusive (default)", after: `${displayVersion(a).config.basic.name} ⟂ ${displayVersion(b).config.basic.name}` }, { key: "period", label: "Effective period", kind: "text", before: null, after: `${input.from} to ${input.to}` }], purpose: "Explicit exclusivity (SOW 6.2.16)", reason: input.description, impact: { dependencies: preview.map((p) => p.message) } });
  if (!out.ok) return out;
  let s: SchemeState = { ...state, exclusivity: [...state.exclusivity, { ...rule, approvalRequestId: out.id ?? null }] };
  s = audit(s, uid, { entity: "exclusivity", entityId: id, schemeVersion: null, field: "Exclusivity", oldValue: "Inclusive", newValue: `${a.id} ⟂ ${b.id}`, changeType: "exclusivity_requested", reason: input.description, approvalRequestId: out.id ?? null });
  commit(s);
  return OK(id, [...out.warnings, ...preview.map((p) => `Would create an unresolved conflict: ${p.message}`)]);
}

/** OP-SB-LIAB: a sign-off attempt is refused and recorded. */
export function recordLiabilitySignOff(uid: string, schemeId: string): Res {
  commit(audit(state, uid, { entity: "scheme", entityId: schemeId, schemeVersion: null, field: "Financial sign-off", oldValue: null, newValue: "Refused", changeType: "liability_signoff_refused", reason: "Projected-liability formula is pending (OP-SB-LIAB)", approvalRequestId: null }));
  return NO("Financial sign-off on projected liability cannot be recorded: the formula is pending business confirmation (OP-SB-LIAB). The attempt was recorded");
}

/* ======================= Mock engine operations ======================= */

export interface TxnInput {
  id?: string;
  memberId: string;
  skuId: string;
  qty: number;
  date: string;
  kind: SourceTxn["kind"];
  originalTxnId?: string | null;
}

/** Feeds one transaction to the mock evaluation adapter. Reusing a transaction ID simulates a duplicate submission. */
export function postMockTransaction(uid: string, t: TxnInput): Res & { trace?: { schemeId: string; result: string }[] } {
  if (!hasPermission(acc(), uid, "schemes", "activate").allowed) return NO("Posting to the mock engine needs Scheme builder: Activate (engine operator)");
  const m = mem().members.find((x) => x.id === t.memberId);
  if (!m) return NO("Unknown member");
  if (!ms().skus.some((k) => k.id === t.skuId)) return NO("Unknown SKU");
  if (!(t.qty > 0)) return NO("Quantity must be positive");
  let s = state;
  let txn = t.id ? s.txns.find((x) => x.id === t.id) : undefined;
  if (!txn) {
    txn = { id: t.id || `TXN-${pad(s.txns.length + 1, 6)}`, kind: t.kind, memberId: m.id, programme: m.programme, branchCode: m.branchCode, skuId: t.skuId, qty: t.qty, date: t.date, originalTxnId: t.originalTxnId ?? null };
    s = { ...s, txns: [...s.txns, txn] };
  }
  const ev = evaluateTxn(s, engineCtx("live_mock"), txn);
  const out = postCandidates(s, engineCtx("live_mock"), ev.candidates);
  s = postReversals(out.state, ev.reversals);
  s = audit(s, uid, { entity: "ledger", entityId: txn.id, schemeVersion: null, field: "Mock transaction", oldValue: null, newValue: `${out.summary.posted} posted (${out.summary.points} points), ${out.summary.duplicates} duplicate(s), ${out.summary.budgetRefused} budget refusal(s), ${out.summary.excluded} excluded`, changeType: "mock_evaluation", reason: "Development mock engine", approvalRequestId: null });
  commit(s);
  return { ...OK(txn.id, [...(out.summary.duplicates ? ["Duplicate detected by idempotency key: nothing credited twice"] : []), ...out.summary.stopped.map((x) => `${x} reached its budget cap and was auto-stopped (mock engine)`)]), trace: ev.trace };
}

export function runPeriodNow(uid: string, schemeId: string): Res {
  if (!hasPermission(acc(), uid, "schemes", "activate").allowed) return NO("You need Scheme builder: Activate (engine operator)");
  const sc = schemeById(state, schemeId);
  if (!sc || sc.activeVersion == null) return NO("No active version");
  const out = runPeriodEvaluation(state, engineCtx("live_mock"), sc, today(), false);
  commit(audit(out.state, uid, { entity: "ledger", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Period evaluation", oldValue: null, newValue: `${out.summary.posted} posted (${out.summary.points} points); ${out.summary.duplicates} already credited`, changeType: "mock_evaluation", reason: out.blocked.slice(0, 3).join("; "), approvalRequestId: null }));
  return OK(schemeId, [`${out.summary.posted} new accrual(s), ${out.summary.duplicates} already credited (not repeated)`, ...out.blocked.slice(0, 3)]);
}

/* ======================= Settlement ======================= */

export function createSettlementRequest(uid: string, schemeId: string, trancheId: string, from: string, to: string, simulateFailure = false): Res {
  const sc = schemeById(state, schemeId);
  if (!sc) return NO("Scheme not found");
  const c = displayVersion(sc).config;
  if (!canFor(uid, "scheme-settlement", "create", c.basic.programmes).allowed || !canFor(uid, "scheme-settlement", "submit", c.basic.programmes).allowed) return NO("You need Scheme settlement: Create and Submit");
  if (!from || !to || to < from) return NO("Enter a valid earned date range");
  const p = settlementPreview(state, sc, trancheId, from, to, today());
  if (!p.ok) return NO("Settlement checks did not pass:", ...p.checks.filter((x) => !x.ok).map((x) => `${x.label}: ${x.detail}`));
  const id = `SET-${pad(state.settlements.length + 1)}`;
  const v = sc.activeVersion ?? latestVersion(sc).version;
  const req: SettlementRequest = { id, schemeId, schemeVersion: v, trancheId, trancheLabel: p.tranche!.label, earnedFrom: from, earnedTo: to, unsettledPoints: p.unsettled, releasePct: p.releasePct, releasePoints: p.releasePoints, heldPoints: p.heldPoints, residualHeld: p.residual, accrualIds: p.accruals.map((a) => a.id), checks: p.checks, status: "pending_approval", approvalRequestId: null, createdBy: uid, createdAt: now(), simulateFailure };
  const rt = routing(c.basic.programmes, [...branchesInScope(c.eligibility.branchScope)]);
  const out = raise(uid, { requestType: "scheme_settlement", title: `Settle ${c.basic.name} · ${p.tranche!.label}`, entityRef: id, programme: rt.programme, location: rt.location, amount: p.releasePoints, fields: [{ key: "scheme", label: "Scheme", kind: "text", before: `${sc.id} v${v}`, after: `${sc.id} v${v}` }, { key: "range", label: "Earned date range", kind: "text", before: null, after: `${from} to ${to}` }, { key: "unsettled", label: "Unsettled points", kind: "points", before: p.unsettled, after: p.heldPoints, material: true }, { key: "release", label: `Release (${p.releasePct}%)`, kind: "points", before: 0, after: p.releasePoints, material: true }, { key: "residual", label: "Residual held (rounding not configured)", kind: "text", before: null, after: String(p.residual) }], purpose: "Move unsettled scheme points to the redeemable wallet (SOW 5.2)", reason: `${p.tranche!.label} for ${from} to ${to}`, impact: { pointsImpact: p.releasePoints, operationalImpact: "Execution posts a Settlement Release entry through the wallet/ledger adapter (mock). Base Points are not part of settlement", dependencies: p.checks.map((x) => `${x.label}: ${x.detail}`) } });
  if (!out.ok) return out;
  let s: SchemeState = { ...state, settlements: [...state.settlements, { ...req, approvalRequestId: out.id ?? null }] };
  s = audit(s, uid, { entity: "settlement", entityId: id, schemeVersion: v, field: "Settlement request", oldValue: `${p.unsettled} unsettled`, newValue: `${p.releasePoints} to release · ${p.heldPoints} held`, changeType: "settlement_requested", reason: p.tranche!.label, approvalRequestId: out.id ?? null });
  commit(s);
  return OK(id, out.warnings);
}

function executeSettlement(r: ApprovalRequest) {
  const req = state.settlements.find((x) => x.id === r.entityRef);
  if (!req) return { ok: false, message: `Settlement ${r.entityRef} not found` };
  if (state.releases.some((x) => x.requestId === req.id)) return { ok: true, message: `${req.id} was already released; nothing posted twice` };
  if (req.simulateFailure) {
    commit({ ...state, settlements: state.settlements.map((x) => (x.id === req.id ? { ...x, status: "execution_failed", simulateFailure: false } : x)) });
    return { ok: false, message: "Mock ledger adapter timed out (simulated). No points moved; the request can be retried under the same approval" };
  }
  const p = settlementPreview({ ...state, settlements: state.settlements.filter((x) => x.id !== req.id) }, schemeById(state, req.schemeId)!, req.trancheId, req.earnedFrom, req.earnedTo, today());
  const lines = p.lines.filter((l) => req.accrualIds.includes(l.id));
  const map = new Map(lines.map((l) => [l.id, l.release]));
  const released = lines.reduce((n, l) => n + l.release, 0);
  // Execution re-validates: the state may have changed between request and final approval
  // (a reversal, another release, a status change). Nothing is posted unless everything still holds
  // and the amount is exactly what the Checkers approved.
  const problems = [
    ...p.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`),
    ...(lines.length !== req.accrualIds.length ? [`${req.accrualIds.length - lines.length} accrual(s) in the request are no longer open`] : []),
    ...(released !== req.releasePoints ? [`Release now computes to ${released} points, not the ${req.releasePoints} approved`] : []),
  ];
  if (problems.length) {
    let f: SchemeState = { ...state, settlements: state.settlements.map((x) => (x.id === req.id ? { ...x, status: "execution_failed" } : x)) };
    f = audit(f, "SYSTEM", { entity: "settlement", entityId: req.id, schemeVersion: req.schemeVersion, field: "Settlement execution", oldValue: `${req.releasePoints} approved`, newValue: "Refused at execution", changeType: "settlement_execution_refused", reason: problems.join("; "), approvalRequestId: r.id });
    commit(f);
    return { ok: false, message: `Execution refused, nothing released: ${problems.join("; ")}. Retry under the same approval once resolved, or withdraw and raise a new request` };
  }
  const approvers = r.stages.map((x) => x.decidedBy).filter(Boolean) as string[];
  const sc = schemeById(state, req.schemeId)!;
  let s: SchemeState = { ...state, accruals: state.accruals.map((a) => (map.has(a.id) ? { ...a, releasedPoints: a.releasedPoints + map.get(a.id)! } : a)) };
  s = { ...s, settlements: s.settlements.map((x) => (x.id === req.id ? { ...x, status: "executed" } : x)), releases: [...s.releases, { id: `REL-${req.id.slice(4)}`, requestId: req.id, schemeId: req.schemeId, schemeVersion: req.schemeVersion, earnedFrom: req.earnedFrom, earnedTo: req.earnedTo, settledAt: now(), releasedPoints: released, heldPoints: req.unsettledPoints - released, approvers, approvalRef: r.id, ledgerRef: `LDG-REL-${req.id.slice(4)}`, passbookLabel: `Settlement Release · ${displayVersion(sc).config.basic.name} · ${req.trancheLabel}` }] };
  const unsettledLeft = s.accruals.filter((a) => a.schemeId === sc.id && a.bucket === "unsettled" && (a.result === "accrued" || a.result === "credited")).some((a) => a.points - a.releasedPoints > 0);
  s = putScheme(s, { ...schemeById(s, sc.id)!, settlementStatus: unsettledLeft ? "partially_settled" : "settled" });
  s = audit(s, "SYSTEM", { entity: "settlement", entityId: req.id, schemeVersion: req.schemeVersion, field: "Settlement release", oldValue: `${req.unsettledPoints} unsettled`, newValue: `${released} released · ${req.unsettledPoints - released} held`, changeType: "settlement_executed", reason: "Two-level approval complete", approvalRequestId: r.id });
  commit(s);
  return { ok: true, message: `${released.toLocaleString("en-IN")} points released to the redeemable wallet (mock ledger LDG-REL-${req.id.slice(4)}). Development store only` };
}

/* ======================= Tiers, referrals, campaigns, gamification ======================= */

function upsert<T extends { id: string }>(list: T[], item: T) {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

export function saveTier(uid: string, t: Tier): Res {
  const isNew = !state.tiers.some((x) => x.id === t.id);
  if (!canFor(uid, "tiers", isNew ? "create" : "edit", [t.programme]).allowed) return NO(`You need Tier management: ${isNew ? "Create" : "Edit"} for ${t.programme}`);
  if (!t.name.trim()) return NO("Tier name is mandatory");
  const prev = state.tiers.find((x) => x.id === t.id);
  if (prev?.status === "pending_approval") return NO("This tier is pending approval and read-only");
  const id = isNew ? `TIER-${t.programme.slice(0, 2).toUpperCase()}-${pad(state.tiers.length + 1, 2)}` : t.id;
  let s: SchemeState = { ...state, tiers: upsert(state.tiers, { ...t, id, status: "draft", version: prev ? prev.version + (prev.status === "active" ? 1 : 0) : 1, updatedBy: uid, updatedAt: now() }) };
  s = audit(s, uid, { entity: "tier", entityId: id, schemeVersion: null, field: "Tier", oldValue: prev ? `${prev.name} · threshold ${prev.threshold ?? "—"}` : null, newValue: `${t.name} · threshold ${t.threshold ?? "—"}`, changeType: isNew ? "created" : "draft_updated", reason: "", approvalRequestId: null });
  commit(s);
  return OK(id, t.branchConfigs.some((b) => b.valuation.configured) ? ["Branch valuation recorded, but OP-07 is open: it is not applied"] : []);
}

function submitSimple<T extends { id: string; status: string; approvalRequestId: string | null }>(uid: string, kind: "tier" | "referral" | "campaign" | "gamification" | "bonus", item: T | undefined, programmes: string[], module: string, requestType: string, title: string, fields: FieldChange[], blockers: string[], errors: string[], put: (s: SchemeState, x: T) => SchemeState): Res {
  if (!item) return NO("Record not found");
  if (!canFor(uid, module, "submit", programmes).allowed) return NO(`You need ${module}: Submit for ${programmes.join(", ")}`);
  if (!["draft", "returned", "rejected"].includes(item.status)) return NO(`Only a draft can be submitted (status: ${item.status.replace(/_/g, " ")})`);
  if (errors.length) return NO(...errors);
  if (blockers.length) return NO("Business confirmation required before submission:", ...blockers);
  const rt = routing(programmes, []);
  const out = raise(uid, { requestType, title, entityRef: item.id, programme: rt.programme, location: null, amount: null, fields, purpose: title, reason: "Configuration publication", impact: { operationalImpact: "Published to the development store after approval; no member app or production service is connected" } });
  if (!out.ok) return out;
  let s = put(state, { ...item, status: "pending_approval", approvalRequestId: out.id ?? null });
  s = audit(s, uid, { entity: kind, entityId: item.id, schemeVersion: null, field: "Status", oldValue: item.status, newValue: "Pending approval", changeType: "submitted", reason: "", approvalRequestId: out.id ?? null });
  commit(s);
  return OK(out.id, out.warnings);
}

export function submitTier(uid: string, id: string): Res {
  const t = state.tiers.find((x) => x.id === id);
  const errors = !t ? [] : [...(t.threshold == null ? ["Tier threshold is not configured"] : []), ...(!t.qualification.trim() ? ["Qualification criteria are not described"] : [])];
  return submitSimple(uid, "tier", t, t ? [t.programme] : [], "tiers", "tier_config", `Tier ${t?.name} (${t?.programme}) v${t?.version}`, t ? [{ key: "tier", label: "Tier", kind: "text", before: null, after: `${t.name} · ${t.programme}` }, { key: "threshold", label: "Threshold", kind: "points", material: true, before: null, after: t.threshold }, { key: "branches", label: "Branch-specific thresholds", kind: "text", before: null, after: t.branchConfigs.map((b) => `${b.branchCode}: ${b.threshold ?? "—"}`).join(", ") || "None" }, { key: "valuation", label: "Branch valuation (OP-07)", kind: "text", before: null, after: "Not applied: OP-07 open" }, { key: "benefits", label: "Benefits", kind: "text", before: null, after: t.benefits.map((b) => b.name).join(", ") || "None" }] : [], [], errors, (s, x) => ({ ...s, tiers: upsert(s.tiers, x) }));
}

export function saveReferralRule(uid: string, r: ReferralRule): Res {
  const isNew = !state.referralRules.some((x) => x.id === r.id);
  if (!canFor(uid, "referrals", isNew ? "create" : "edit", r.referrerProgrammes).allowed) return NO("You need Referral management: Create / Edit");
  if (!r.name.trim()) return NO("Name is mandatory");
  const prev = state.referralRules.find((x) => x.id === r.id);
  if (prev?.status === "pending_approval") return NO("Pending approval: read-only");
  const status = r.relationship === "retailer_consumer" ? "reserved_future" : "draft";
  const id = isNew ? `REF-R-${pad(state.referralRules.length + 1, 2)}` : r.id;
  let s: SchemeState = { ...state, referralRules: upsert(state.referralRules, { ...r, id, status, updatedBy: uid, updatedAt: now() }) };
  s = audit(s, uid, { entity: "referral", entityId: id, schemeVersion: null, field: "Referral rule", oldValue: prev?.name ?? null, newValue: `${r.name} · ${REFERRAL_RELATIONSHIP[r.relationship].label}`, changeType: isNew ? "created" : "draft_updated", reason: "", approvalRequestId: null });
  commit(s);
  return OK(id, status === "reserved_future" ? ["Retailer → Consumer is reserved for the future consumer referral capability and stays inactive (OP-REF1)"] : []);
}

export function submitReferralRule(uid: string, id: string): Res {
  const r = state.referralRules.find((x) => x.id === id);
  if (r?.status === "reserved_future") return NO("Retailer → Consumer is reserved and cannot be activated unless V-Guard confirms it is in scope (OP-REF1)");
  const blockers = !r ? [] : [...(state.decisions.find((d) => d.id === "OP-REF1")?.status !== "confirmed" ? ["OP-REF1: referral mechanics are not confirmed"] : []), ...(r.reward.kind === "business_formula" && state.formulas.find((f) => f.id === r.reward.formulaId)?.status !== "confirmed" ? [`Reward formula ${r.reward.formulaId} is pending`] : [])];
  const errors = !r ? [] : [...(!r.trigger ? ["Trigger / qualification stage is not selected"] : [])];
  return submitSimple(uid, "referral", r, r?.referrerProgrammes ?? [], "referrals", "referral_config", `Referral rule ${r?.name}`, r ? [{ key: "rel", label: "Relationship", kind: "text", before: null, after: REFERRAL_RELATIONSHIP[r.relationship].label }, { key: "trigger", label: "Trigger", kind: "text", before: null, after: r.trigger }] : [], blockers, errors, (s, x) => ({ ...s, referralRules: upsert(s.referralRules, x) }));
}

export function saveCampaign(uid: string, c: Campaign): Res {
  const isNew = !state.campaigns.some((x) => x.id === c.id);
  if (!canFor(uid, "campaigns", isNew ? "create" : "edit", c.programmes).allowed) return NO(`You need Campaigns & contests: ${isNew ? "Create" : "Edit"}`);
  if (!c.name.trim()) return NO("Name is mandatory");
  const prev = state.campaigns.find((x) => x.id === c.id);
  if (prev && !["draft", "returned", "rejected"].includes(prev.status)) return NO(`A ${prev.status} campaign is read-only`);
  const id = isNew ? `CMP-${pad(state.campaigns.length + 1)}` : c.id;
  let s: SchemeState = { ...state, campaigns: upsert(state.campaigns, { ...c, id, status: "draft", updatedBy: uid, updatedAt: now() }) };
  s = audit(s, uid, { entity: "campaign", entityId: id, schemeVersion: null, field: "Campaign", oldValue: prev?.name ?? null, newValue: `${c.name} · ${c.type}`, changeType: isNew ? "created" : "draft_updated", reason: "", approvalRequestId: null });
  commit(s);
  const v = validateCampaign(s, { ...c, id });
  return OK(id, [...v.errors, ...v.blockers.map((b) => `${b.ref}: ${b.message}`)]);
}

export function submitCampaign(uid: string, id: string): Res {
  const c = state.campaigns.find((x) => x.id === id);
  const v = c ? validateCampaign(state, c) : { errors: [], blockers: [] };
  return submitSimple(uid, "campaign", c, c?.programmes ?? [], "campaigns", "campaign_publish", `Publish campaign ${c?.name}`, c ? [{ key: "type", label: "Type", kind: "text", before: null, after: c.type }, { key: "geo", label: "Geography", kind: "text", material: true, before: null, after: c.allStates ? "All states" : campaignStates(c).join(", ") }, { key: "period", label: "Period", kind: "text", before: null, after: `${c.start} to ${c.end}` }, { key: "budget", label: "Budget", kind: "points", material: true, before: null, after: c.budget }] : [], v.blockers.map((b) => `${b.ref}: ${b.message}`), v.errors, (s, x) => ({ ...s, campaigns: upsert(s.campaigns, x) }));
}

export function reviewContestEntry(uid: string, entryId: string, status: ContestEntry["status"], remarks: string): Res {
  const e = state.contestEntries.find((x) => x.id === entryId);
  if (!e) return NO("Entry not found");
  if (!canFor(uid, "campaigns", "edit", [e.programme]).allowed) return NO("You need Campaigns & contests: Edit");
  if (status === "winner" && e.capture !== "camera_verified") return NO("Only entries the source service confirms as live camera captures can be selected as winners");
  let s: SchemeState = { ...state, contestEntries: state.contestEntries.map((x) => (x.id === entryId ? { ...x, status, reviewedBy: uid, remarks } : x)) };
  s = audit(s, uid, { entity: "contest", entityId: entryId, schemeVersion: null, field: "Review outcome", oldValue: e.status, newValue: status, changeType: "contest_reviewed", reason: remarks, approvalRequestId: null });
  commit(s);
  return OK(entryId);
}

export function accessContestPhoto(uid: string, entryId: string): Res {
  const e = state.contestEntries.find((x) => x.id === entryId);
  if (!e) return NO("Entry not found");
  const allowed = canFor(uid, "campaigns", "view_sensitive", [e.programme]).allowed;
  commit(audit(state, uid, { entity: "contest", entityId: entryId, schemeVersion: null, field: "Photo preview", oldValue: null, newValue: allowed ? "Viewed" : "Denied", changeType: allowed ? "photo_viewed" : "photo_denied", reason: allowed ? "Development placeholder; no image is stored" : "Missing Campaigns & contests: View sensitive", approvalRequestId: null }));
  return allowed ? OK(entryId) : NO("You need Campaigns & contests: View sensitive to preview submitted photos. The attempt was recorded");
}

export function triggerWinnerBanner(uid: string, campaignId: string, region: string): Res {
  const c = state.campaigns.find((x) => x.id === campaignId);
  if (!c) return NO("Campaign not found");
  if (!canFor(uid, "campaigns", "edit", c.programmes).allowed) return NO("You need Campaigns & contests: Edit");
  if (!state.contestEntries.some((e) => e.campaignId === campaignId && e.region === region && e.status === "winner")) return NO(`No winner selected for ${region}`);
  const id = `BNR-${pad(state.bannerTriggers.length + 1)}`;
  let s: SchemeState = { ...state, bannerTriggers: [...state.bannerTriggers, { id, campaignId, region, at: now(), by: uid, status: "recorded_not_published" }] };
  s = audit(s, uid, { entity: "campaign", entityId: campaignId, schemeVersion: null, field: "Regional winner banner", oldValue: null, newValue: `${region}: recorded, not published`, changeType: "banner_triggered", reason: "Member app and content service are not connected", approvalRequestId: null });
  commit(s);
  return OK(id, ["Recorded only: no banner is published because the member app is not connected"]);
}

export function uploadGiftBatch(uid: string, campaignId: string, fileName: string, text: string): Res {
  const c = state.campaigns.find((x) => x.id === campaignId);
  if (!c) return NO("Campaign not found");
  if (!canFor(uid, "campaigns", "create", c.programmes).allowed) return NO("You need Campaigns & contests: Create");
  if (c.type !== "foc" || c.foc?.variant !== "gift_entitlement") return NO("Bulk gift upload applies to gift-entitlement campaigns");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !/member/i.test(lines[0])) return NO("The first row must be the header: member_id,gift,qty");
  const rows = lines.slice(1).map((l) => {
    const [memberId = "", gift = "", qtyS = ""] = l.split(",").map((x) => x.trim());
    const m = mem().members.find((x) => x.id === memberId);
    const qty = Number(qtyS);
    const error = !m ? "Unknown member" : !c.programmes.includes(m.programme) ? `Programme ${m.programme} not in campaign` : !gift ? "Gift missing" : !(qty > 0 && Number.isInteger(qty)) ? "Quantity must be a whole number" : null;
    return { memberId, gift, qty: Number.isFinite(qty) ? qty : 0, error };
  });
  if (!rows.length) return NO("The file has no data rows");
  const id = `GFT-${pad(state.giftBatches.length + 1)}`;
  const batch: GiftBatch = { id, campaignId, fileName, rows, status: "validated", approvalRequestId: null, createdBy: uid, createdAt: now() };
  commit(audit({ ...state, giftBatches: [...state.giftBatches, batch] }, uid, { entity: "campaign", entityId: id, schemeVersion: null, field: "Gift batch", oldValue: null, newValue: `${rows.length} rows · ${rows.filter((r) => r.error).length} errors`, changeType: "gift_batch_uploaded", reason: fileName, approvalRequestId: null }));
  return OK(id, rows.some((r) => r.error) ? [`${rows.filter((r) => r.error).length} row(s) have errors and will not be issued`] : []);
}

export function submitGiftBatch(uid: string, id: string): Res {
  const b = state.giftBatches.find((x) => x.id === id);
  if (!b) return NO("Batch not found");
  const c = state.campaigns.find((x) => x.id === b.campaignId)!;
  if (!canFor(uid, "campaigns", "submit", c.programmes).allowed) return NO("You need Campaigns & contests: Submit");
  if (b.status !== "validated") return NO("Batch already submitted");
  const good = b.rows.filter((r) => !r.error);
  if (!good.length) return NO("No valid rows");
  const out = raise(uid, { requestType: "gift_batch", title: `Issue ${good.length} gift entitlement(s) · ${c.name}`, entityRef: id, programme: routing(c.programmes, []).programme, location: null, amount: null, fields: [{ key: "rows", label: "Valid rows", kind: "number", material: true, before: null, after: good.length }, { key: "excluded", label: "Rows with errors (excluded)", kind: "number", before: null, after: b.rows.length - good.length }], purpose: "Bulk gift entitlement (SOW 6.5)", reason: b.fileName, impact: { affectedMembers: new Set(good.map((r) => r.memberId)).size } });
  if (!out.ok) return out;
  commit({ ...state, giftBatches: state.giftBatches.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: out.id ?? null } : x)) });
  return OK(out.id, out.warnings);
}

export function requestBackendRedemption(uid: string, campaignId: string, memberId: string, entitlement: string, reason: string): Res {
  const c = state.campaigns.find((x) => x.id === campaignId);
  const m = mem().members.find((x) => x.id === memberId);
  if (!c || !m) return NO("Campaign or member not found");
  if (!canFor(uid, "campaigns", "submit", [m.programme]).allowed) return NO("You need Campaigns & contests: Submit for the member's programme");
  if (!c.programmes.includes(m.programme)) return NO("The member's programme is not in this campaign");
  if (!entitlement.trim() || !reason.trim()) return NO("Entitlement and reason are mandatory");
  const id = `BRD-${pad(state.backendRedemptions.length + 1)}`;
  const out = raise(uid, { requestType: "backend_redemption", title: `Backend redemption for ${m.id} · ${c.name}`, entityRef: id, programme: m.programme, location: { branch: m.branchCode }, amount: null, fields: [{ key: "member", label: "Member", kind: "text", before: null, after: m.id }, { key: "ent", label: "Entitlement redeemed on behalf", kind: "text", material: true, before: null, after: entitlement }], purpose: "Backend redemption on behalf of a member (SOW 6.5)", reason, impact: { affectedMembers: 1, operationalImpact: "Recorded in the development store; the redemption service is not connected" } });
  if (!out.ok) return out;
  const rec: BackendRedemption = { id, campaignId, memberId, entitlement, reason, status: "pending_approval", approvalRequestId: out.id ?? null, createdBy: uid, createdAt: now() };
  commit(audit({ ...state, backendRedemptions: [...state.backendRedemptions, rec] }, uid, { entity: "campaign", entityId: id, schemeVersion: null, field: "Backend redemption", oldValue: null, newValue: `${m.id}: ${entitlement}`, changeType: "backend_redemption_requested", reason, approvalRequestId: out.id ?? null }));
  return OK(id, out.warnings);
}

export function saveGame(uid: string, g: GameConfig): Res {
  const isNew = !state.games.some((x) => x.id === g.id);
  if (!canFor(uid, "gamification", isNew ? "create" : "edit", g.programmes).allowed) return NO(`You need Gamification & bonuses: ${isNew ? "Create" : "Edit"}`);
  if (!g.name.trim()) return NO("Name is mandatory");
  const prev = state.games.find((x) => x.id === g.id);
  if (prev && !["draft", "returned", "rejected", "active"].includes(prev.status)) return NO("Pending approval: read-only");
  const id = isNew ? `GAM-${pad(state.games.length + 1)}` : g.id;
  let s: SchemeState = { ...state, games: upsert(state.games, { ...g, id, status: "draft", updatedBy: uid, updatedAt: now() }) };
  s = audit(s, uid, { entity: "gamification", entityId: id, schemeVersion: null, field: g.kind, oldValue: prev?.name ?? null, newValue: g.name, changeType: isNew ? "created" : "draft_updated", reason: "", approvalRequestId: null });
  commit(s);
  const v = validateGame(s, { ...g, id });
  return OK(id, v.blockers.map((b) => `${b.ref}: ${b.message}`));
}
export function submitGame(uid: string, id: string): Res {
  const g = state.games.find((x) => x.id === id);
  const v = g ? validateGame(state, g) : { errors: [], blockers: [] };
  return submitSimple(uid, "gamification", g, g?.programmes ?? [], "gamification", "gamification_config", `Publish ${g?.kind.replace("_", " ")} ${g?.name}`, g ? [{ key: "kind", label: "Type", kind: "text", before: null, after: g.kind }, ...Object.entries(g.settings).map(([k, val]) => ({ key: k, label: k, kind: "text" as const, before: null, after: val == null ? "Not configured" : String(val) }))] : [], v.blockers.map((b) => `${b.ref}: ${b.message}`), v.errors, (s, x) => ({ ...s, games: upsert(s.games, x) }));
}
export function saveBonus(uid: string, b: Bonus): Res {
  const isNew = !state.bonuses.some((x) => x.id === b.id);
  if (!canFor(uid, "gamification", isNew ? "create" : "edit", b.programmes).allowed) return NO("You need Gamification & bonuses: Create / Edit");
  if (!b.name.trim()) return NO("Name is mandatory");
  const id = isNew ? `BON-${pad(state.bonuses.length + 1)}` : b.id;
  let s: SchemeState = { ...state, bonuses: upsert(state.bonuses, { ...b, id, status: "draft", updatedBy: uid, updatedAt: now() }) };
  s = audit(s, uid, { entity: "bonus", entityId: id, schemeVersion: null, field: "Bonus", oldValue: null, newValue: `${b.name} · trigger ${b.trigger ?? "not configured"}`, changeType: isNew ? "created" : "draft_updated", reason: "", approvalRequestId: null });
  commit(s);
  return OK(id, validateBonus(s, { ...b, id }).blockers.map((x) => `${x.ref}: ${x.message}`));
}
export function submitBonus(uid: string, id: string): Res {
  const b = state.bonuses.find((x) => x.id === id);
  const v = b ? validateBonus(state, b) : { errors: [], blockers: [] };
  return submitSimple(uid, "bonus", b, b?.programmes ?? [], "gamification", "bonus_config", `Bonus ${b?.name}`, [], v.blockers.map((x) => `${x.ref}: ${x.message}`), v.errors, (s, x) => ({ ...s, bonuses: upsert(s.bonuses, x) }));
}

/* ======================= Governance ======================= */

export function updateSchemeDecision(uid: string, id: string, patch: Pick<SchemeDecision, "status" | "notes" | "owner">): Res {
  if (!hasPermission(acc(), uid, "users", "manage").allowed) return NO("Only Evolve platform administrators record business decisions");
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (patch.status === "confirmed" && !patch.notes.trim()) return NO("Record the confirmed answer and who confirmed it in the notes");
  let s: SchemeState = { ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  s = audit(s, uid, { entity: "decision", entityId: id, schemeVersion: null, field: "Decision status", oldValue: d.status, newValue: patch.status, changeType: "decision_updated", reason: patch.notes, approvalRequestId: null });
  commit(s);
  return OK(id, patch.status === "confirmed" ? ["Confirming a decision changes no configuration by itself. Formulas still need to be recorded, and schemes revalidated and resubmitted"] : []);
}

export function confirmFormula(uid: string, id: string, version: string, definition: string): Res {
  if (!hasPermission(acc(), uid, "schemes", "configure_formula").allowed) return NO("You need Scheme builder: Configure formula");
  const f = state.formulas.find((x) => x.id === id);
  if (!f) return NO("Formula not found");
  if (state.decisions.find((d) => d.id === f.decisionRef)?.status !== "confirmed") return NO(`${f.decisionRef} is not confirmed. A formula cannot be recorded for an open business decision`);
  if (!version.trim() || !definition.trim()) return NO("Version and the confirmed definition are mandatory");
  let s: SchemeState = { ...state, formulas: state.formulas.map((x) => (x.id === id ? { ...x, status: "confirmed", version, definition, confirmedBy: uid, confirmedAt: now() } : x)) };
  s = audit(s, uid, { entity: "formula", entityId: id, schemeVersion: null, field: "Formula", oldValue: f.status, newValue: `Confirmed v${version}`, changeType: "formula_confirmed", reason: definition, approvalRequestId: null });
  commit(s);
  return OK(id, ["Recorded in the registry. The calculation itself runs only in the backend engine"]);
}

/* ======================= Approval execution & sync ======================= */

function executeSchemes(r: ApprovalRequest) {
  const at = now();
  const approver = approverOf(r);
  const [ref, op] = r.entityRef.split(":");
  if (r.entityRef.startsWith("EXT-")) {
    const x = state.extensions.find((e) => e.id === r.entityRef);
    if (!x) return { ok: false, message: "Extension not found" };
    commit(audit({ ...state, extensions: state.extensions.map((e) => (e.id === x.id ? { ...e, status: "active" } : e)) }, "SYSTEM", { entity: "extension", entityId: x.id, schemeVersion: x.baseVersion, field: "Status", oldValue: "Pending approval", newValue: "Active", changeType: "extension_active", reason: `Approved by ${approver}`, approvalRequestId: r.id }));
    return { ok: true, message: `${x.id} active from ${x.effectiveFrom}; ${x.schemeId} v${x.baseVersion} configuration unchanged` };
  }
  if (r.entityRef.startsWith("EXR-")) {
    const x = state.exclusivity.find((e) => e.id === r.entityRef);
    if (!x) return { ok: false, message: "Exclusivity rule not found" };
    commit(audit({ ...state, exclusivity: state.exclusivity.map((e) => (e.id === x.id ? { ...e, status: "active" } : e)) }, "SYSTEM", { entity: "exclusivity", entityId: x.id, schemeVersion: null, field: "Status", oldValue: "Pending approval", newValue: "Active", changeType: "exclusivity_active", reason: `Approved by ${approver}`, approvalRequestId: r.id }));
    return { ok: true, message: `${x.id} active` };
  }
  const sc = schemeById(state, ref.split(" ")[0]);
  if (!sc) return { ok: true, message: "Not a Scheme Builder record (Phase 3 demo request); recorded only" };
  if (op === "deactivate") {
    if (sc.status === "deactivated") return { ok: true, message: `${sc.id} is already deactivated` };
    let s = putScheme(state, { ...sc, status: "deactivated", deactivatedAt: at, versions: sc.versions.map((v) => (v.version === sc.activeVersion ? { ...v, effectiveEnd: at.slice(0, 10) } : v)) });
    s = audit(s, "SYSTEM", { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Status", oldValue: sc.status, newValue: "Deactivated", changeType: "deactivated", reason: `Approved by ${approver}`, approvalRequestId: r.id });
    commit(s);
    return { ok: true, message: `${sc.id} deactivated. Versions, ledger history and performance are kept` };
  }
  if (op === "close") {
    if (sc.status === "closed") return { ok: true, message: `${sc.id} is already closed` };
    const unsettled = state.accruals.some((a) => a.schemeId === sc.id && a.bucket === "unsettled" && (a.result === "accrued" || a.result === "credited") && a.points - a.releasedPoints > 0);
    let s = putScheme(state, { ...sc, status: "closed", closedAt: at, settlementStatus: unsettled ? "settlement_pending" : sc.settlementStatus === "not_started" ? "settled" : sc.settlementStatus });
    s = audit(s, "SYSTEM", { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Status", oldValue: sc.status, newValue: "Closed", changeType: "closed", reason: unsettled ? "Closed with settlement pending" : "Closed", approvalRequestId: r.id });
    commit(s);
    return { ok: true, message: `${sc.id} closed${unsettled ? "; unsettled scheme points still need a settlement request" : ""}` };
  }
  if (op === "backdated") {
    if (sc.backdated.status !== "pending_approval") return { ok: true, message: "Backdated calculation already decided" };
    let s = putScheme(state, { ...sc, backdated: { ...sc.backdated, status: "approved" } });
    s = audit(s, "SYSTEM", { entity: "scheme", entityId: sc.id, schemeVersion: sc.activeVersion, field: "Backdated calculation", oldValue: "Pending approval", newValue: "Approved, not run", changeType: "backdated_approved", reason: `Approved by ${approver}`, approvalRequestId: r.id });
    commit(s);
    return { ok: true, message: "Backdated calculation approved. It runs as a separate operation; nothing was credited by the approval" };
  }
  const vn = Number(ref.split(" v")[1]);
  const v = versionOf(sc, vn);
  if (!v) return { ok: false, message: `Version ${vn} not found` };
  if (v.status !== "submitted") return { ok: true, message: `Version ${vn} is already ${v.status}; nothing applied twice` };
  const wasLive = sc.activeVersion != null && ["active", "budget_exhausted"].includes(sc.status);
  const status: Scheme["status"] = wasLive ? sc.status : v.config.duration.start > at.slice(0, 10) ? "scheduled" : "approved";
  let s = putScheme(state, { ...sc, status, versions: sc.versions.map((x) => (x.version === vn ? { ...x, status: "approved", approvedBy: approver, approvedAt: at } : x)) });
  s = audit(s, "SYSTEM", { entity: "scheme", entityId: sc.id, schemeVersion: vn, field: "Status", oldValue: "Pending approval", newValue: wasLive ? "Approved (awaiting activation)" : status === "scheduled" ? "Approved · scheduled" : "Approved", changeType: "approved", reason: `Approved by ${approver}`, approvalRequestId: r.id });
  commit(s);
  return { ok: true, message: `${sc.id} v${vn} approved. Not active: activation through the scheme-engine adapter is a separate step` };
}

function executeSimple(r: ApprovalRequest) {
  const id = r.entityRef;
  const t = today();
  const mark = <T extends { id: string; status: string }>(list: T[], status: (x: T) => string) => list.map((x) => (x.id === id ? { ...x, status: status(x) } : x));
  if (id.startsWith("TIER-")) { commit(audit({ ...state, tiers: mark(state.tiers, () => "active") as Tier[] }, "SYSTEM", { entity: "tier", entityId: id, schemeVersion: null, field: "Status", oldValue: "Pending approval", newValue: "Active", changeType: "approved", reason: "", approvalRequestId: r.id })); return { ok: true, message: `${id} published (development store)` }; }
  if (id.startsWith("REF-R-")) { commit(audit({ ...state, referralRules: mark(state.referralRules, () => "active") as ReferralRule[] }, "SYSTEM", { entity: "referral", entityId: id, schemeVersion: null, field: "Status", oldValue: "Pending approval", newValue: "Active", changeType: "approved", reason: "", approvalRequestId: r.id })); return { ok: true, message: `${id} active` }; }
  if (id.startsWith("CMP-")) {
    const c = state.campaigns.find((x) => x.id === id);
    if (!c) return { ok: false, message: "Campaign not found" };
    const v = validateCampaign(state, c);
    if (v.errors.length || v.blockers.length) return { ok: false, message: `Publication refused by policy validation: ${[...v.errors, ...v.blockers.map((b) => b.message)][0]}` };
    commit(audit({ ...state, campaigns: mark(state.campaigns, (x) => (x.start > t ? "scheduled" : "active")) as Campaign[] }, "SYSTEM", { entity: "campaign", entityId: id, schemeVersion: null, field: "Status", oldValue: "Pending approval", newValue: c.start > t ? "Scheduled" : "Active", changeType: "approved", reason: "", approvalRequestId: r.id }));
    return { ok: true, message: `${id} published to the development store` };
  }
  if (id.startsWith("GFT-")) { commit({ ...state, giftBatches: state.giftBatches.map((x) => (x.id === id ? { ...x, status: "approved" } : x)) }); return { ok: true, message: `${id}: entitlements recorded (redemption service not connected)` }; }
  if (id.startsWith("BRD-")) { commit({ ...state, backendRedemptions: state.backendRedemptions.map((x) => (x.id === id ? { ...x, status: "executed" } : x)) }); return { ok: true, message: `${id}: redemption recorded on the member's behalf (mock)` }; }
  if (id.startsWith("GAM-")) { const g = state.games.find((x) => x.id === id); const v = g ? validateGame(state, g) : null; if (!g || v!.blockers.length || v!.errors.length) return { ok: false, message: "Refused: configuration has open blockers" }; commit({ ...state, games: mark(state.games, () => "active") as GameConfig[] }); return { ok: true, message: `${id} published` }; }
  if (id.startsWith("BON-")) { const b = state.bonuses.find((x) => x.id === id); if (!b || validateBonus(state, b).blockers.length) return { ok: false, message: "Refused: bonus trigger / eligibility pending OP-SB-BONUS" }; commit({ ...state, bonuses: mark(state.bonuses, () => "active") as Bonus[] }); return { ok: true, message: `${id} published` }; }
  return { ok: true, message: "Recorded" };
}

registerExecutionHandler("schemes", executeSchemes);
registerExecutionHandler("scheme-budget", (r) => (r.requestType === "scheme_backdated_calc" ? executeSchemes(r) : executeSchemes(r)));
registerExecutionHandler("scheme-settlement", executeSettlement);
["tiers", "referrals", "campaigns", "gamification"].forEach((m) => registerExecutionHandler(m, executeSimple));

/** Mirrors Checker decisions (return, reject, withdraw, partial approval) back onto the module records. */
function syncFromApprovals() {
  const reqs = approvalStore.get().requests;
  const st = (id: string | null) => (id ? reqs.find((r) => r.id === id)?.status : undefined);
  let changed = false;
  const schemes = state.schemes.map((sc) => {
    let touched = false;
    const versions = sc.versions.map((v) => {
      if (v.status !== "submitted") return v;
      const s = st(v.approvalRequestId);
      if (s === "returned" || s === "rejected" || s === "withdrawn") { touched = true; return { ...v, status: s }; }
      return v;
    });
    if (!touched) return sc;
    changed = true;
    const last = versions[versions.length - 1];
    const live = sc.activeVersion != null && ["active", "budget_exhausted"].includes(sc.status);
    return { ...sc, versions, status: live ? sc.status : last.status === "returned" ? "returned" : last.status === "rejected" ? "rejected" : "draft" } as Scheme;
  });
  const settlements = state.settlements.map((x) => {
    const s = st(x.approvalRequestId);
    const next = s === "partially_approved" ? "partially_approved" : s === "returned" || s === "rejected" || s === "withdrawn" ? s : null;
    if (next && x.status !== next && ["pending_approval", "partially_approved"].includes(x.status)) { changed = true; return { ...x, status: next as SettlementRequest["status"] }; }
    return x;
  });
  const simple = <T extends { status: string; approvalRequestId: string | null }>(list: T[]) => list.map((x) => {
    if (x.status !== "pending_approval") return x;
    const s = st(x.approvalRequestId);
    if (s === "returned" || s === "rejected") { changed = true; return { ...x, status: s }; }
    return x;
  });
  const extensions = simple(state.extensions as (SpecialExtension & { status: string })[]) as SpecialExtension[];
  const exclusivity = simple(state.exclusivity);
  const tiers = simple(state.tiers);
  const referralRules = simple(state.referralRules);
  const campaigns = simple(state.campaigns);
  const games = simple(state.games);
  const bonuses = simple(state.bonuses);
  const backdatedFix = schemes.map((sc) => {
    const s = st(sc.backdated.requestId);
    if (sc.backdated.status === "pending_approval" && (s === "rejected" || s === "returned")) { changed = true; return { ...sc, backdated: { ...sc.backdated, status: "rejected" as const } }; }
    return sc;
  });
  if (changed) commit({ ...state, schemes: backdatedFix, settlements, extensions, exclusivity, tiers, referralRules, campaigns, games, bonuses });
}
approvalStore.subscribe(syncFromApprovals);
syncFromApprovals();

export const approvalFor = (id: string | null) => reqOf(id);
export { executeSchemes as _executeSchemesForTests };
