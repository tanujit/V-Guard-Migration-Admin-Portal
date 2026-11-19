/**
 * PLATFORM ADMINISTRATION STORE (Phase 13) — governance, View-As, usage analytics, app themes and
 * go-live readiness. Business data stays in its owning module; this store reads it (registry, audit,
 * open points, coverage) and keeps only governance, evidence and readiness records.
 * - View-As is read-only through the central permission guard (viewAsSession.ts) and the member view
 *   returned here never contains Aadhaar, PAN, bank account or mobile values.
 * - No status becomes Passed / Meets target without recorded evidence; local development results are
 *   kept but never count as acceptance evidence. Nothing here deploys anything.
 */
import { useSyncExternalStore } from "react";
import { ERROR_CATALOGUE, FORBIDDEN_TERMS, GO_LIVE_GATES, CUTOVER_ITEMS, RELEASE_ITEMS, PERF_TARGETS, CAPACITY_TARGETS, SECURITY_CONTROLS, ACCEPTANCE_CRITERIA, INTEGRATION_TESTS, PLATFORM_DECISIONS, PROGRAMMES, SOW_ACTIONS, SOW_ROLES, SECOND_PERSON_ACTIONS, UAT_AREAS, AF_COVERAGE } from "@/config/platformCatalogue";
import { BUILDER_COMPONENTS } from "@/config/schemeCatalogue";
import { MODULES } from "@/config/rbacCatalogue";
import { REQUEST_TYPES } from "@/config/approvalCatalogue";
import { AUTH_CONFIG } from "@/services/auth";
import { accessStore } from "@/features/access/store";
import { accessLog } from "@/features/access/accessLog";
import { getEffectiveAccess, hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { commsStore } from "@/features/comms/store";
import { giftsStore } from "@/features/gifts/store";
import { geoOfMember, memberById } from "@/features/members/engine";
import { memberStore } from "@/features/members/store";
import { masterStore } from "@/features/masters/store";
import { opsStore } from "@/features/ops/store";
import { riskStore } from "@/features/risk/store";
import { schemeStore } from "@/features/schemes/store";
import { walletStore } from "@/features/wallet/store";
import { analyticsStore, context as analyticsContext } from "@/features/analytics/store";
import * as AE from "@/features/analytics/engine";
import { milestoneMeasure } from "@/features/schemes/engine";
import { fullLedger, memberBalances } from "@/features/wallet/engine";
import { fyLabel } from "@/config/analyticsCatalogue";
import type { ActionId } from "@/types/rbac";
import type { ApprovalRequest } from "@/types/approval";
import type { AppTheme, ChecklistItem, Defect, EvidenceRecord, EvidenceStatus, GateStatus, Measurement, MigrationException, PlatformState, UatCase } from "@/types/platform";
import type { ProgrammeCode } from "@/types/members";
import { activeSession, clientContext, endSession, recordAttempt, recordSession, setIdleMinutesCore, touchSession, viewAsStore } from "./viewAsSession";
import { buildUsageSessions, filterSessions, funnel, groupSessions, moduleUsage, screenStats, usageOverview, type UsageFilter } from "./usage";
import { developmentSourceSnapshot, reconcileHistory, reconcileKitty, reconcileMembers, reconcileWallets, type Snapshot } from "./migration";

const STORAGE_KEY = "vg-rishta.platform-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[], w = 4) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1, w)}`;
const can = (uid: string, module: string, action: ActionId) => hasPermission(acc(), uid, module, action).allowed;
const LABEL: Record<string, string> = { "platform-admin": "Platform administration", "view-as": "View-As", "app-usage": "App usage analytics", "app-themes": "App themes", "release-readiness": "Release & go-live readiness" };
const need = (m: string, a: string) => `You need ${LABEL[m] ?? m}: ${a}`;

/* ---------------- Seed and plumbing ---------------- */

function seed(): PlatformState {
  const t = now();
  return {
    viewAsIdleMinutes: viewAsStore.get().idleMinutes,
    themes: [],
    measurements: [],
    evidence: [],
    // Genuine open findings from this build (scheme gap probes and npm audit), not invented defects.
    defects: [
      { id: "DEF-0001", module: "Schemes", title: "Scheme gap probe G13: participation check has no date bound", description: "postCandidates' participation check excludes later credits for a member who took part in another scheme earlier (SCH-Q10)", severity: "untriaged", owner: null, status: "open", rootCause: null, fixVersion: null, retest: null, source: "npm run test:schemes:gaps", history: [{ at: t, by: "SYSTEM", change: "Logged from the Phase 6 audit probe" }] },
      { id: "DEF-0002", module: "Schemes", title: "Scheme gap probe G14: approved member extension earns nothing with branch-specific Base Points rows", description: "EXT-0001 extends SCH-0001 to a member outside the scheme's branch rows; no row matches the member's branch", severity: "untriaged", owner: null, status: "open", rootCause: null, fixVersion: null, retest: null, source: "npm run test:schemes:gaps", history: [{ at: t, by: "SYSTEM", change: "Logged from the Phase 6 audit probe" }] },
      { id: "DEF-0003", module: "Platform", title: "Dependency advisories: react-router (3 high), vite (high), esbuild (moderate)", description: "npm audit advisories in react-router / @remix-run/router (open redirect / XSS) and the Vite / esbuild development server", severity: "untriaged", owner: null, status: "open", rootCause: "Pinned dependency versions", fixVersion: null, retest: null, source: "npm audit (2026-11-18)", history: [{ at: t, by: "SYSTEM", change: "Logged from npm audit" }] },
    ],
    uat: [{ id: "UAT-01", name: "Business UAT (staging)", environment: "Staging (not provisioned)", plannedStart: null, plannedEnd: null, businessOwner: null, coordinator: null, teams: [], allocation: { EP: null, ST: null, CS: null, Retailer: null, DD: null }, pilotMembers: [], signOffAuthority: null, signOff: { status: "not_signed", by: null, at: null, comments: "", ref: null } }],
    uatCases: UAT_AREAS.flatMap((area, i) => [
      { id: `UTC-${pad(i * 2 + 1, 3)}`, cycleId: "UAT-01", area, programme: "All" as const, scenario: `${area}: main journey`, steps: "Follow the agreed UAT script for this area", expected: "Behaves as the approved requirement describes", executions: [] },
      { id: `UTC-${pad(i * 2 + 2, 3)}`, cycleId: "UAT-01", area, programme: PROGRAMMES[i % 5], scenario: `${area}: ${PROGRAMMES[i % 5]} variant`, steps: "Repeat with a pilot member of this programme", expected: "Programme-specific rules apply", executions: [] },
    ]),
    gates: GO_LIVE_GATES.map((g) => ({ ...g, status: "not_started" as GateStatus, evidence: [], validationDate: null, reviewer: null, signOffRef: null, remarks: "" })),
    checklists: [
      ...CUTOVER_ITEMS.map((item, i) => ({ id: `CUT-${pad(i + 1, 2)}`, group: "cutover" as const, item, status: "not_started" as GateStatus, owner: i < 2 ? "V-Guard Business" : "Evolve + V-Guard", evidence: null, updatedBy: null, updatedAt: null })),
      ...RELEASE_ITEMS.map((item, i) => ({ id: `REL-${pad(i + 1, 2)}`, group: "release" as const, item, status: "not_started" as GateStatus, owner: "Evolve Technology", evidence: null, updatedBy: null, updatedAt: null })),
    ],
    migrationExceptions: [],
    migrationScope: { programmes: { EP: "pending_confirmation", ST: "pending_confirmation", CS: "pending_confirmation", Retailer: "pending_confirmation", DD: "pending_confirmation" }, owner: null, validationOwner: null, plannedCutover: null, status: "pending_business_confirmation" },
    incidents: [],
    decisions: PLATFORM_DECISIONS.map((d) => ({ ...d })),
    rollbackPlan: { documented: false, expectedRestoration: null, steps: "", testedAt: null, testResult: null },
    audit: [],
  };
}
let state: PlatformState;
const listeners = new Set<() => void>();
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function commit(next: PlatformState) {
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}
function load(): PlatformState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PlatformState;
  } catch {
    /* seed */
  }
  return seed();
}
state = load();
export const platformStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const usePlatformState = () => useSyncExternalStore(platformStore.subscribe, platformStore.get, platformStore.get);
const roleOf = (uid: string) => (uid === "SYSTEM" ? "System" : getEffectiveAccess(acc(), uid).sources.find((x) => x.kind === "role")?.title ?? "—");
function audited(s: PlatformState, actor: string, action: string, entity: string, after: string | null, reason: string, result: "success" | "refused" = "success", before: string | null = null): PlatformState {
  return { ...s, audit: [...s.audit, { id: `PAE-${pad(s.audit.length + 1, 6)}`, at: now(), actor, role: roleOf(actor), action, entity, before, after, reason, result }] };
}
const refuse = (uid: string, action: string, entity: string, reason: string): Res => {
  commit(audited(state, uid, action, entity, null, reason, "refused"));
  return NO(reason);
};

/* ======================= Admin access and SSO (AF01) ======================= */

export function adminSsoStatus() {
  const s = AUTH_CONFIG.saml;
  const configured = Object.values(s).every((v) => v != null);
  return {
    mode: AUTH_CONFIG.mode,
    provider: configured ? "SAML identity provider configured" : "Not connected",
    live: AUTH_CONFIG.mode === "saml" && configured,
    method: AUTH_CONFIG.mode === "mock" ? "Development identities (mock authentication adapter)" : "V-Guard SSO",
    memberMpin: "Never used for admin login: the portal has no MPIN or member login route",
    missing: Object.entries(s).filter(([, v]) => v == null).map(([k]) => k),
    capabilities: AUTH_CONFIG.capabilities,
  };
}
/** Role-scoped landing: organisation, role, programme and geography scope, and the modules shown. */
export function landingFor(uid: string) {
  const a = getEffectiveAccess(acc(), uid);
  const mods = MODULES.filter((m) => hasPermission(acc(), uid, m.id, "view").allowed).map((m) => m.id);
  return { user: a.user ? `${a.user.firstName} ${a.user.lastName}` : uid, org: primaryOrg(acc(), uid)?.name ?? "—", roles: a.sources.filter((x) => x.kind === "role" && x.effective).map((x) => x.title), landing: mods.includes("dashboard") ? "/" : mods.includes("members") ? "/members" : mods.includes("reports") ? "/reports" : "/account/profile", modules: mods };
}

/* ======================= Role and permission governance (OP-RBAC1) ======================= */

export function roleMappingMatrix() {
  const roles = acc().roles;
  return SOW_ROLES.map((s) => {
    const mapped = s.portalRoles.map((code) => roles.find((r) => r.code === code)).filter(Boolean) as typeof roles;
    const keys = mapped.flatMap((r) => r.permissions);
    const modules = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf(":"))))];
    return {
      ...s,
      roles: mapped.map((r) => ({ id: r.id, code: r.code, name: r.name, org: r.orgApplicability === "any" ? "Any organisation" : (r.orgApplicability as string[]).map((o) => acc().organisations.find((x) => x.id === o)?.name ?? o).join(", "), programmeScope: String(r.scopeCeiling.programmes === "all" ? "All programmes" : r.scopeCeiling.programmes), geoScope: String(r.scopeCeiling.geography) })),
      moduleCount: modules.length,
      actions: SOW_ACTIONS.filter((a) => keys.some((k) => k.endsWith(`:${a}`))),
      approvalAuthority: keys.some((k) => k.endsWith(":approve")) ? "In role" : "Through a Checker profile only",
      confirmation: decisionStatus("OP-RBAC1") === "confirmed" ? "confirmed" : "business_confirmation_required",
    };
  });
}
/** Which of the five SOW baseline actions each module offers. Additional actions never stand in for them. */
export function validateRoleCoverage() {
  return MODULES.map((m) => ({ module: m.id, label: m.label, baseline: SOW_ACTIONS.filter((a) => m.actions.includes(a)), missing: SOW_ACTIONS.filter((a) => !m.actions.includes(a)), additional: m.actions.filter((a) => !(SOW_ACTIONS as readonly string[]).includes(a)) }));
}
export function secondPersonCheck() {
  const wfs = approvalStore.get().workflows;
  return SECOND_PERSON_ACTIONS.map((a) => {
    const types = a.requestTypes.filter((t) => REQUEST_TYPES.some((r) => r.id === t));
    const covering = wfs.filter((w) => w.status !== "inactive" && w.requestTypes.some((t) => a.requestTypes.includes(t)));
    return { ...a, knownTypes: types, workflows: covering.map((w) => w.id), reasonRequired: true, selfApprovalBlocked: true, status: types.length && covering.length ? "covered" : "gap" };
  });
}
export function authorityHolders(module: string, action: ActionId) {
  return acc().users.filter((u) => u.accountStatus === "active" && hasPermission(acc(), u.id, module, action).allowed).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: roleOf(u.id), org: primaryOrg(acc(), u.id)?.name ?? "—" }));
}

/* ======================= View-As (SOW 10.7) ======================= */

export interface ViewAsDecision { allowed: boolean; reason: string; override: boolean }
export function validateViewAsAccess(uid: string, memberRef: string, override?: { reason: string }): ViewAsDecision & { memberId?: string } {
  const canView = can(uid, "view-as", "view");
  const canOverride = can(uid, "view-as", "override");
  if (!canView && !canOverride) return { allowed: false, reason: "Insufficient permission: you need View-As: View (own branch) or the HO / Admin override", override: false };
  const ref = memberRef.trim();
  const digits = ref.replace(/\D/g, "").slice(-10);
  const m = memberById(mem(), ref) ?? (digits.length === 10 && can(uid, "members", "view_sensitive") ? mem().members.find((x) => x.mobile.replace(/\D/g, "").slice(-10) === digits) : undefined);
  if (!m) return { allowed: false, reason: digits.length === 10 && !can(uid, "members", "view_sensitive") ? "Search by mobile needs Member management: View sensitive" : "Member not found", override: false };
  if (["pending", "rejected", "invited"].includes(m.status) || !m.registration.firstLoginAt) return { allowed: false, reason: "Member app data unavailable: the member has no active app account yet", override: false, memberId: m.id };
  const inScope = canView && hasPermission(acc(), uid, "view-as", "view", { programme: m.programme, geo: geoOfMember(m) }).allowed;
  if (inScope) return { allowed: true, reason: "Member within your branch / scope", override: false, memberId: m.id };
  if (!override) return { allowed: false, reason: canView ? `${m.id} is outside your branch (${m.branchCode}). Only an HO / Admin user with the View-As override can open it` : "HO / Admin View-As always uses the override: record the reason", override: false, memberId: m.id };
  if (!canOverride) return { allowed: false, reason: "Override refused: you do not hold the View-As override", override: true, memberId: m.id };
  if (!override.reason.trim()) return { allowed: false, reason: "Override refused: record the reason (ticket or member request)", override: true, memberId: m.id };
  return { allowed: true, reason: `HO / Admin override: ${override.reason.trim()}`, override: true, memberId: m.id };
}
export function startViewAs(uid: string, memberRef: string, opts: { override?: { reason: string } } = {}, at = Date.now()): Res & { sessionId?: string } {
  const env = clientContext();
  const d = validateViewAsAccess(uid, memberRef, opts.override);
  const a = getEffectiveAccess(acc(), uid);
  recordAttempt({ adminId: uid, role: roleOf(uid), memberRef: d.memberId ?? memberRef, at, result: d.allowed ? "started" : "refused", reason: d.reason, ip: env.ip, device: env.device, override: d.override });
  if (!d.allowed) {
    commit(audited(state, uid, "view_as_refused", d.memberId ?? memberRef, null, d.reason, "refused"));
    return NO(d.reason);
  }
  if (activeSession(uid, at)) endSession(uid, "exit", at);
  const m = memberById(mem(), d.memberId!)!;
  const s = recordSession({ adminId: uid, orgId: primaryOrg(acc(), uid)?.id ?? null, role: roleOf(uid), memberId: m.id, programme: m.programme, branchCode: m.branchCode, ip: env.ip, device: env.device, startedAt: at, lastActivityAt: at, endedAt: null, exitReason: null, override: d.override ? { authority: a.sources.find((x) => x.keys.includes("view-as:override"))?.title ?? "View-As override", reason: opts.override!.reason.trim() } : null });
  commit(audited(state, uid, d.override ? "view_as_override_started" : "view_as_started", m.id, s.id, d.reason));
  return { ...OK(s.id), sessionId: s.id };
}
export function endViewAs(uid: string, reason: "exit" | "sign_out" = "exit", at = Date.now()): Res {
  const s = endSession(uid, reason, at);
  if (!s) return NO("No active View-As session");
  commit(audited(state, uid, "view_as_ended", s.memberId, `${Math.round((s.endedAt! - s.startedAt) / 1000)} s`, reason));
  return OK(s.id);
}
export function setViewAsIdle(uid: string, minutes: number): Res {
  if (!can(uid, "platform-admin", "manage")) return NO(need("platform-admin", "Manage"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return NO("Enter whole minutes between 1 and 240");
  setIdleMinutesCore(minutes);
  commit(audited({ ...state, viewAsIdleMinutes: minutes }, uid, "view_as_idle_changed", "OP-VIEWAS1", String(minutes), "Development setting (OP-VIEWAS1 open)"));
  return OK(undefined, ["Development setting: the production timeout is not confirmed (OP-VIEWAS1)"]);
}
export const DISABLED_IN_VIEW_AS = ["Scan", "Redeem", "Edit KYC", "Edit bank details", "Adjust points", "Referrals", "Edit profile", "Send messages"];
/** The member's app, read-only, from the authoritative services. No Aadhaar, PAN, bank or mobile value is included. */
export function viewAsMemberApp(uid: string, at = Date.now()) {
  const s = activeSession(uid, at);
  if (!s) return { ...NO("No active View-As session (it may have ended after inactivity)"), app: null };
  touchSession(uid, at);
  const m = memberById(mem(), s.memberId)!;
  const c = analyticsContext();
  const today = now().slice(0, 10);
  const wallet = AE.memberWallet(c, m.id, `${today.slice(0, 4)}-01-01`, today);
  const ss = schemeStore.get();
  const restricted = mem().restrictions.filter((r) => r.status !== "lifted" && r.memberIds.includes(m.id)).map((r) => (r.type === "program_block" ? "Program Block" : "Temporary Hold"));
  const active = ss.schemes.filter((sc) => sc.status === "active" && sc.versions.some((v) => v.config.basic.programmes.includes(m.programme))).map((sc) => sc.versions.find((v) => v.version === sc.activeVersion)?.config.basic.name ?? sc.id);
  const unsettled = ss.accruals.filter((a) => a.memberId === m.id && a.bucket === "unsettled" && (a.result === "accrued" || a.result === "credited"));
  return {
    ...OK(s.id),
    app: {
      session: { id: s.id, member: m.id, staff: uid, started: s.startedAt, override: s.override },
      home: { name: m.name, programme: m.programme, memberType: m.memberType, status: m.status.replace(/_/g, " "), restrictions: restricted, available: wallet.available, lifetime: wallet.lifetimeEarned },
      schemes: { active, progress: AE.memberSchemeProgress(c, m.id, milestoneMeasure as never) },
      passbook: AE.memberPassbook(c, m.id).slice(0, 25).map((p) => ({ at: p.at, ref: p.ref, type: p.type, points: p.points, status: p.status })),
      wallet,
      settlement: { unsettledPoints: memberBalances(c.ws, c.ss, c.mem, m.id).scheme, accruals: unsettled.length, released: unsettled.reduce((n, a) => n + a.releasedPoints, 0) },
      kyc: mem().documents.filter((d) => d.memberId === m.id && ["aadhaar", "pan", "bank"].includes(d.type)).map((d) => ({ type: d.type === "aadhaar" ? "Aadhaar" : d.type === "pan" ? "PAN" : "Bank account", status: d.status === "approved" ? "Approved" : d.status === "rejected" ? "Rejected" : "Pending" })),
      disabled: DISABLED_IN_VIEW_AS,
    },
  };
}
export function viewAsHistory(uid: string) {
  if (!can(uid, "view-as", "view") && !can(uid, "platform-admin", "view")) return { sessions: [], attempts: [] };
  const all = can(uid, "platform-admin", "view");
  const v = viewAsStore.get();
  return { sessions: v.sessions.filter((x) => all || x.adminId === uid), attempts: v.attempts.filter((x) => all || x.adminId === uid) };
}

/* ======================= Application usage analytics (SOW 10.12) ======================= */

let usageMemo: { key: unknown; sessions: ReturnType<typeof buildUsageSessions> } | null = null;
export function usageSessions() {
  const k = mem().members;
  if (usageMemo?.key !== k) usageMemo = { key: k, sessions: buildUsageSessions(k, now()) };
  return usageMemo.sessions;
}
const usageScope = (uid: string) => new Set(mem().members.filter((m) => hasPermission(acc(), uid, "app-usage", "view", { programme: m.programme, geo: geoOfMember(m) }).allowed).map((m) => m.id));
export function usageView(uid: string, f: UsageFilter) {
  if (!can(uid, "app-usage", "view")) return { ...NO(need("app-usage", "View")), denied: true as const };
  const s = filterSessions(usageSessions(), f, usageScope(uid));
  return {
    ...OK(),
    sessions: s.length,
    overview: usageOverview(s),
    screens: screenStats(s),
    modules: ["Scanning", "Schemes", "Wallet", "Passbook"].map((m) => moduleUsage(s, m)),
    byProgramme: groupSessions(s, (x) => x.programme),
    byRegion: groupSessions(s, (x) => x.state),
    byVersion: groupSessions(s, (x) => x.appVersion).map((g) => ({ ...g, errors: opsStore.get().crashes.filter((c) => c.version === g.key).reduce((n, c) => n + c.count, 0) })),
    funnel: (stages: string[]) => funnel(s, stages),
    source: "Mock telemetry adapter (development): definitions pending OP-USAGE1",
  };
}
/** Member-level usage needs View sensitive and every access is audited. */
export function memberUsage(uid: string, memberId: string) {
  if (!can(uid, "app-usage", "view_sensitive")) return { ...NO("Member-level usage needs App usage analytics: View sensitive"), sessions: [] };
  commit(audited(state, uid, "member_usage_viewed", memberId, null, "Member-level usage data"));
  return { ...OK(), sessions: usageSessions().filter((x) => x.memberId === memberId) };
}

/* ======================= App themes (SOW 10.8, OP-THEME1) ======================= */

export type ThemeInput = Pick<AppTheme, "name" | "type" | "programmes" | "tierIds" | "eventRef" | "effectiveFrom" | "effectiveTo" | "tokens" | "assets" | "screens">;
const HEX = /^#[0-9a-fA-F]{6}$/;
function validateTheme(t: ThemeInput): string[] {
  const e: string[] = [];
  if (!t.name.trim()) e.push("Give the theme a name");
  if (!t.programmes.length) e.push("Choose at least one programme");
  if (t.type === "tier" && !t.tierIds.length) e.push("Choose the tiers this theme applies to");
  if (t.type === "tier" && t.tierIds.some((id) => !schemeStore.get().tiers.some((x) => x.id === id))) e.push("Tier not found in the Tier Master");
  if (t.type === "festival" && !t.eventRef?.trim()) e.push("Enter the approved festival / event reference");
  if (t.type === "festival" && (!t.effectiveFrom || !t.effectiveTo)) e.push("A festival theme needs an effective period");
  if (t.effectiveFrom && t.effectiveTo && t.effectiveTo < t.effectiveFrom) e.push("The end date is before the start date");
  if (Object.values(t.tokens).some((v) => !HEX.test(v))) e.push("Colour tokens must be #RRGGBB");
  return e;
}
export function createThemeDraft(uid: string, t: ThemeInput): Res {
  if (!can(uid, "app-themes", "create")) return NO(need("app-themes", "Create"));
  const errs = validateTheme(t);
  if (errs.length) return NO(...errs);
  const id = nextId("THM", state.themes);
  const theme: AppTheme = { ...t, id, status: "draft", version: 1, versions: [{ version: 1, at: now(), by: uid, change: "Draft created", tokens: t.tokens, status: "draft" }], approvalRequestId: null, createdBy: uid, updatedAt: now() };
  commit(audited({ ...state, themes: [...state.themes, theme] }, uid, "theme_draft_created", id, t.name, ""));
  return OK(id);
}
export function updateTheme(uid: string, id: string, t: ThemeInput, change: string): Res {
  const th = state.themes.find((x) => x.id === id);
  if (!th) return NO("Theme not found");
  if (!can(uid, "app-themes", "edit")) return NO(need("app-themes", "Edit"));
  if (th.status === "pending_approval") return NO("The theme is awaiting approval");
  const errs = validateTheme(t);
  if (errs.length) return NO(...errs);
  const version = th.version + 1;
  // A published theme stays live; edits create a new draft version that needs approval again.
  const next: AppTheme = { ...th, ...t, status: "draft", version, versions: [...th.versions, { version, at: now(), by: uid, change: change || "Edited", tokens: t.tokens, status: "draft" }], approvalRequestId: null, updatedAt: now() };
  commit(audited({ ...state, themes: state.themes.map((x) => (x.id === id ? next : x)) }, uid, "theme_edited", id, `v${version}`, change, "success", `v${th.version}`));
  return OK(id);
}
export function previewTheme(id: string) {
  const t = state.themes.find((x) => x.id === id);
  if (!t) return null;
  const tiers = schemeStore.get().tiers.filter((x) => t.tierIds.includes(x.id)).map((x) => `${x.programme} ${x.name}`);
  return { theme: t, target: { programmes: t.programmes, tiers, event: t.eventRef }, version: t.version, screens: t.screens.length ? t.screens : ["Not confirmed (OP-THEME1)"], period: `${t.effectiveFrom ?? "—"} → ${t.effectiveTo ?? "open"}`, note: "Desktop preview of the member app surfaces: not a mobile release" };
}
export function submitThemeForApproval(uid: string, id: string, reason: string): Res {
  const t = state.themes.find((x) => x.id === id);
  if (!t) return NO("Theme not found");
  if (!can(uid, "app-themes", "submit")) return NO(need("app-themes", "Submit"));
  if (t.status !== "draft") return NO(`Only a draft can be submitted (status ${t.status})`);
  if (!reason.trim()) return NO("Give the reason for the theme");
  const q = createRequest(uid, { requestType: "app_theme_publish", title: `App theme ${t.name} v${t.version}`, entityRef: `${t.id}@${t.version}`, programme: t.programmes.join(" + "), location: null, amount: null, fields: [{ key: "theme", label: "Theme", kind: "text", before: t.version > 1 ? `v${t.version - 1}` : "None", after: `${t.name} v${t.version} (${t.type})`, material: true }], purpose: "Member app theme (SOW 10.8)", reason: reason.trim(), justification: "Publishing stays disabled while OP-THEME1 is open", attachments: [], impact: { operationalImpact: `Member app theme for ${t.programmes.join(", ")}` } }, true);
  if (!q.ok) return q;
  commit(audited({ ...state, themes: state.themes.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: q.id ?? null } : x)) }, uid, "theme_submitted", id, q.id ?? null, reason));
  return OK(q.id, ["Approval does not publish: publishing is disabled until OP-THEME1 is confirmed"]);
}
export function publishTheme(uid: string, id: string): Res {
  const t = state.themes.find((x) => x.id === id);
  if (!t) return NO("Theme not found");
  if (!can(uid, "app-themes", "publish")) return refuse(uid, "theme_publish_refused", id, need("app-themes", "Publish"));
  if (decisionStatus("OP-THEME1") !== "confirmed") return refuse(uid, "theme_publish_refused", id, "OP-THEME1 is open: tier / festival themes and their screens are not confirmed, so no theme can be published");
  if (t.status !== "approved") return refuse(uid, "theme_publish_refused", id, "Only an approved theme can be published");
  commit(audited({ ...state, themes: state.themes.map((x) => (x.id === id ? { ...x, status: "published", versions: x.versions.map((v) => (v.version === x.version ? { ...v, status: "published" } : v)) } : x)) }, uid, "theme_published", id, `v${t.version}`, "Theme configuration service (mock); no app release"));
  return OK(id);
}
registerExecutionHandler("app-themes", (r: ApprovalRequest) => {
  const [id, v] = r.entityRef.split("@");
  const t = state.themes.find((x) => x.id === id);
  if (!t) return { ok: false, message: `Not executed: theme ${id} not found` };
  if (String(t.version) !== v) return { ok: false, message: `Not executed: theme ${id} changed after submission` };
  commit(audited({ ...state, themes: state.themes.map((x) => (x.id === id ? { ...x, status: "approved", versions: x.versions.map((y) => (y.version === x.version ? { ...y, status: "approved" } : y)) } : x)) }, "SYSTEM", "theme_approved", id, `v${t.version}`, `Approved (${r.id}); not published`));
  return { ok: true, message: `${t.name} v${t.version} approved. Publishing stays disabled until OP-THEME1 is confirmed` };
});
approvalStore.subscribe(() => {
  const reqs = approvalStore.get().requests;
  const back = (id: string | null) => ["rejected", "returned", "withdrawn"].includes(reqs.find((r) => r.id === id)?.status ?? "");
  if (state.themes.some((t) => t.status === "pending_approval" && back(t.approvalRequestId))) commit({ ...state, themes: state.themes.map((t) => (t.status === "pending_approval" && back(t.approvalRequestId) ? { ...t, status: reqs.find((r) => r.id === t.approvalRequestId)?.status === "rejected" ? "rejected" : "draft" } : t)) });
});

/* ======================= Configuration registry ======================= */

export interface ConfigEntry { id: string; name: string; module: string; category: string; version: string; value: string; effective: string | null; modified: string | null; by: string | null; approval: string; owner: string; route: string }
/** A read-only inventory of governed configurations. Changes go through each owning module. */
export function configurationRegistry(): ConfigEntry[] {
  const ms = masterStore.get(), ss = schemeStore.get(), ws = walletStore.get(), cs = commsStore.get(), gs = giftsStore.get(), rs = riskStore.get(), os = opsStore.get(), as = analyticsStore.get(), ap = approvalStore.get();
  const out: ConfigEntry[] = [];
  acc().roles.forEach((r) => out.push({ id: `CFG-ROLE-${r.id}`, name: `Role: ${r.name}`, module: "RBAC", category: "Access", version: "—", value: `${r.permissions.length} permissions · ${r.status}`, effective: null, modified: r.updatedAt, by: r.updatedBy, approval: r.system ? "System role" : "Portal-managed", owner: "Evolve Platform Administration", route: `/governance/users/roles` }));
  ap.workflows.forEach((w) => out.push({ id: `CFG-${w.id}`, name: `Workflow: ${w.name}`, module: "Approval Engine", category: "Governance", version: "—", value: `${w.stages.length} stage(s) · ${w.requestTypes.length} request types`, effective: null, modified: w.updatedAt, by: null, approval: w.status, owner: "Evolve Platform Administration", route: `/governance/approvals/workflows/${w.id}` }));
  ms.scanPoints.forEach((c) => { const v = c.versions[c.versions.length - 1]; out.push({ id: `CFG-${c.id}`, name: `Scan points ${c.skuId}`, module: "Scanning configuration", category: "Scanning", version: `v${v.version}`, value: `Scan-In ${v.scanIn ?? "—"} · Scan-Out ${v.scanOut ?? "—"}`, effective: v.effectiveFrom, modified: v.updatedAt, by: v.createdBy, approval: v.status, owner: "V-Guard Business", route: `/masters/scanning/points/${c.id}` }); });
  ms.rules.forEach((r) => { const v = r.versions[r.versions.length - 1]; out.push({ id: `CFG-${r.id}`, name: `Scan rule ${r.name}`, module: "Scanning configuration", category: "Scanning", version: `v${v?.version ?? 1}`, value: `${r.ruleType} · ${r.context.replace("_", " ")}`, effective: null, modified: v?.createdAt ?? r.createdAt, by: v?.createdBy ?? r.createdBy, approval: v?.status ?? "—", owner: "V-Guard Business", route: `/masters/scanning/rules/${r.id}` }); });
  ss.schemes.forEach((sc) => out.push({ id: `CFG-${sc.id}`, name: `Scheme ${sc.versions.find((v) => v.version === (sc.activeVersion ?? sc.versions.length))?.config.basic.name ?? sc.id}`, module: "Scheme Builder", category: "Schemes", version: `v${sc.activeVersion ?? sc.versions.length}`, value: sc.status, effective: null, modified: sc.updatedAt, by: sc.createdBy, approval: sc.status, owner: "V-Guard Business", route: `/schemes/scheme/${sc.id}` }));
  ws.policies.forEach((p) => out.push({ id: `CFG-${p.id}`, name: `Redemption limits ${p.programmes.join(" ")} ${p.method}`, module: "Wallet & Redemption", category: "Finance", version: `v${p.version}`, value: p.status, effective: p.effectiveFrom, modified: p.updatedAt, by: p.updatedBy, approval: p.status, owner: "V-Guard Finance", route: "/redemption/limits" }));
  out.push({ id: "CFG-WALLET", name: "Wallet & TDS configuration", module: "Wallet & TDS", category: "Finance", version: "—", value: "TDS models and kitty rules", effective: null, modified: null, by: null, approval: "See TDS management", owner: "V-Guard Finance", route: "/wallet/config" });
  cs.templates.forEach((t) => { const v = t.versions.find((x) => x.version === t.activeVersion) ?? t.versions[t.versions.length - 1]; out.push({ id: `CFG-${t.id}`, name: `Template ${t.name}`, module: "Communication Centre", category: "Communication", version: `v${v?.version ?? 1}`, value: `${t.channel} · ${v?.status ?? "—"}`, effective: null, modified: t.updatedAt, by: null, approval: v?.status ?? "—", owner: "V-Guard Business", route: "/masters/communication/templates" }); });
  gs.items.forEach((i) => out.push({ id: `CFG-${i.id}`, name: `Gift ${i.name}`, module: "Gift catalogue", category: "Gifts", version: `v${i.version}`, value: i.status, effective: i.effectiveFrom, modified: i.updatedAt, by: i.updatedBy, approval: i.status, owner: "V-Guard Business", route: `/gifts/catalogue/${i.id}` }));
  rs.rules.forEach((r) => out.push({ id: `CFG-${r.id}`, name: `Risk rule ${r.name ?? r.id}`, module: "Fraud & Risk", category: "Risk", version: `v${r.version ?? 1}`, value: r.status ?? "—", effective: null, modified: null, by: null, approval: r.status ?? "—", owner: "V-Guard Business + Evolve Operations", route: "/governance/fraud/rules" }));
  os.integrations.forEach((i) => out.push({ id: `CFG-${i.id}`, name: `Integration ${i.name}`, module: "Integration Monitoring", category: "Integrations", version: "—", value: `${i.connection.replace("_", " ")} · credentials never stored`, effective: null, modified: null, by: null, approval: i.contractStatus.replace(/_/g, " "), owner: i.ownership.technical ?? "Not assigned", route: `/monitoring/integrations/directory/${i.id}` }));
  as.kpis.forEach((k) => out.push({ id: `CFG-${k.id}`, name: `KPI ${k.name}`, module: "Analytics", category: "KPI", version: `v${k.version}`, value: k.status.replace(/_/g, " "), effective: k.effectiveFrom, modified: k.updatedAt, by: k.updatedBy, approval: k.status.replace(/_/g, " "), owner: "V-Guard management", route: `/reports/kpis?kpi=${k.id}` }));
  as.thresholds.forEach((t) => out.push({ id: `CFG-${t.id}`, name: `Threshold ${t.kpiId}`, module: "Analytics", category: "Alerts", version: `v${t.version}`, value: t.status, effective: t.effectiveFrom, modified: null, by: t.createdBy, approval: t.status, owner: "V-Guard management", route: "/reports/alerts" }));
  out.push({ id: "CFG-VIEWAS-IDLE", name: "View-As inactivity timeout", module: "Platform", category: "Security", version: "—", value: `${viewAsStore.get().idleMinutes} minutes (development)`, effective: null, modified: null, by: null, approval: "OP-VIEWAS1 open", owner: "V-Guard IT", route: "/governance/platform/view-as" });
  out.push({ id: "CFG-USAGE-DORMANCY", name: "Dormancy threshold (X days)", module: "Integration Monitoring", category: "Members", version: "—", value: os.config.dormancyDays == null ? "Not set" : `${os.config.dormancyDays} days`, effective: null, modified: null, by: null, approval: os.config.dormancyStatus.replace(/_/g, " "), owner: "V-Guard Business", route: "/monitoring/integrations/adoption" });
  state.themes.forEach((t) => out.push({ id: `CFG-${t.id}`, name: `App theme ${t.name}`, module: "App themes", category: "Member app", version: `v${t.version}`, value: t.status, effective: t.effectiveFrom, modified: t.updatedAt, by: t.createdBy, approval: t.status, owner: "V-Guard Marketing", route: "/governance/platform/themes" }));
  return out;
}

/* ======================= Central audit console ======================= */

export interface CentralAudit { id: string; at: string; actor: string; module: string; action: string; entity: string; before: string | null; after: string | null; reason: string; approvalRef: string | null; result: string; memberRef: string | null }
const MASK = (v: string | null) => (v == null ? null : v.replace(/\b\d{10,}\b/g, (x) => `••••••${x.slice(-4)}`).replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, (x) => `••••••${x.slice(-4)}`));
export function platformAuditEvents(uid: string): CentralAudit[] {
  if (!can(uid, "platform-admin", "view")) return [];
  const n = (x: Partial<CentralAudit> & Pick<CentralAudit, "id" | "at" | "actor" | "module" | "action" | "entity">): CentralAudit => ({ reason: "", approvalRef: null, result: "success", memberRef: null, ...x, before: MASK(x.before ?? null), after: MASK(x.after ?? null) });
  const out: CentralAudit[] = [];
  accessLog().forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.userId, module: "Access", action: e.action, entity: e.sessionRef, reason: `${e.location} · ${e.device}` })));
  acc().audit.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.actorUserId, module: "RBAC", action: e.action, entity: `${e.targetType} ${e.targetId}`, before: e.previous, after: e.next, reason: e.reason, result: e.status })));
  approvalStore.get().requests.forEach((r) => r.history.forEach((h) => out.push(n({ id: h.id, at: h.at, actor: h.userId, module: "Approval Engine", action: h.action, entity: r.entityRef, reason: h.remarks, approvalRef: r.id, result: r.execution.status }))));
  mem().events.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.by, module: "Members", action: e.action, entity: e.memberId, before: e.oldValue, after: e.newValue, reason: e.remarks, approvalRef: e.approvalRequestId, memberRef: e.memberId })));
  masterStore.get().audit.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.actorUserId, module: "Masters", action: e.action, entity: `${e.entityType} ${e.entityId}`, before: e.previousValue, after: e.newValue, reason: e.remarks, approvalRef: e.approvalRequestId })));
  schemeStore.get().audit.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.by, module: "Schemes", action: e.changeType, entity: `${e.entity} ${e.entityId}`, before: e.oldValue, after: e.newValue, reason: e.reason, approvalRef: e.approvalRequestId })));
  ([["Wallet & finance", walletStore.get().audit], ["Communication", commsStore.get().audit], ["Gifts", giftsStore.get().audit], ["Fraud & risk", riskStore.get().audit]] as const).forEach(([mod, list]) => (list as { id: string; at: string; actor: string; entity: string; entityId: string; action: string; before: string | null; after: string | null; reason: string; approvalRequestId: string | null }[]).forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.actor, module: mod, action: e.action, entity: `${e.entity} ${e.entityId}`, before: e.before, after: e.after, reason: e.reason, approvalRef: e.approvalRequestId }))));
  opsStore.get().audit.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.actor, module: "Integration monitoring", action: e.action, entity: e.entity, before: e.before, after: e.after, reason: e.reason, approvalRef: e.relatedRef?.startsWith("APR") ? e.relatedRef : null })));
  analyticsStore.get().audit.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.actor, module: "Analytics", action: e.action, entity: e.entity, before: e.before, after: e.after, reason: e.reason })));
  const v = viewAsStore.get();
  v.attempts.forEach((a) => out.push(n({ id: a.id, at: new Date(a.at).toISOString().slice(0, 16), actor: a.adminId, module: "View-As", action: a.result === "started" ? "view_as_attempt_started" : "view_as_attempt_refused", entity: a.memberRef, reason: `${a.reason} · IP ${a.ip} · ${a.device}`, result: a.result === "started" ? "success" : "refused", memberRef: a.memberRef })));
  v.sessions.forEach((s) => out.push(n({ id: s.id, at: new Date(s.startedAt).toISOString().slice(0, 16), actor: s.adminId, module: "View-As", action: "view_as_session", entity: s.memberId, after: s.endedAt ? `${Math.round((s.endedAt - s.startedAt) / 1000)} s · ${s.exitReason}` : "open", reason: s.override ? `Override: ${s.override.reason}` : "Own scope", memberRef: s.memberId })));
  state.audit.forEach((e) => out.push(n({ id: e.id, at: e.at, actor: e.actor, module: "Platform", action: e.action, entity: e.entity, before: e.before, after: e.after, reason: e.reason, result: e.result })));
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
export function exportAudit(uid: string, rows: number): Res {
  if (!can(uid, "platform-admin", "export")) return refuse(uid, "audit_export_refused", "central-audit", need("platform-admin", "Export"));
  commit(audited(state, uid, "audit_exported", "central-audit", `${rows} rows`, "Central audit export (masked)"));
  return OK();
}

/* ======================= Open points (carried forward) ======================= */

export interface OpenPoint { ref: string; module: string; description: string; status: string; owner: string; restriction: string; source: string; route: string; editable: boolean }
const STATUS_MAP: Record<string, string> = { proposed: "under_review" };
export function openPointRegister(): OpenPoint[] {
  const out: OpenPoint[] = [];
  const add = (list: { id: string; ref?: string; question?: string; description?: string; status: string; owner?: string; restriction?: string; treatment?: string; answer?: string; impacted?: string }[], module: string, route: string) => list.forEach((d) => out.push({ ref: d.ref ?? d.id, module, description: d.question ?? d.description ?? "", status: STATUS_MAP[d.status] ?? d.status, owner: d.owner ?? "—", restriction: d.restriction ?? d.treatment ?? "", source: module, route, editable: false }));
  add(approvalStore.get().decisions.map((d) => ({ ...d, ref: d.id, description: d.question, restriction: d.context })), "Approval Engine", "/governance/approvals/workflows");
  add(masterStore.get().decisions, "Master data", "/masters/decisions");
  add(mem().decisions, "Members & KYC", "/registration-kyc/decisions");
  add(schemeStore.get().decisions.map((d) => ({ ...d, ref: d.id })), "Schemes", "/schemes/governance");
  add(walletStore.get().decisions, "Wallet & finance", "/wallet/config");
  add(commsStore.get().decisions, "Communication", "/masters/communication/config");
  add(giftsStore.get().decisions, "Gifts & insurance", "/gifts/settings");
  add(riskStore.get().decisions, "Fraud & risk", "/governance/fraud/config-history");
  add(opsStore.get().decisions, "Integration monitoring", "/monitoring/integrations/audit?tab=decisions");
  add(analyticsStore.get().decisions, "Analytics", "/reports/history?tab=decisions");
  state.decisions.forEach((d) => out.push({ ref: d.ref, module: d.module, description: d.description, status: d.status, owner: d.businessOwner, restriction: d.restriction, source: "Platform (Phase 13)", route: "/governance/platform/open-points", editable: true }));
  return out;
}
export const decisionStatus = (id: string) => state.decisions.find((d) => d.id === id)?.status ?? "open";
export function updatePlatformDecision(uid: string, id: string, status: PlatformState["decisions"][number]["status"], evidence: string): Res {
  if (!can(uid, "platform-admin", "manage")) return NO(need("platform-admin", "Manage"));
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if ((status === "confirmed" || status === "decision_received" || status === "implemented") && !evidence.trim()) return NO("Record the decision evidence (who decided, when, reference)");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, status, evidence, decisionDate: status === "open" ? null : now().slice(0, 10) } : x)) }, uid, `decision_${status}`, id, evidence, d.description, "success", d.status));
  return OK(id);
}

/* ======================= Error catalogue and incidents (SOW 14.3, OP-TICKET1) ======================= */

export function errorCatalogue() {
  const langs = commsStore.get().languages.map((l) => l.code);
  return { languages: langs, rows: ERROR_CATALOGUE.map((e) => ({ ...e, translations: Object.fromEntries(langs.map((l) => [l, l === "en" ? e.message : null])) })) };
}
/** The member-facing message for a technical error, never the technical text. Missing translations fall back to English. */
export function memberMessage(technical: string, lang = "en") {
  const t = technical.toUpperCase();
  const row = /TIMEOUT|504|ETIMEDOUT/.test(t) ? ERROR_CATALOGUE.find((e) => e.id === "ERR-TIMEOUT")! : /NETWORK|OFFLINE|ECONN/.test(t) ? ERROR_CATALOGUE.find((e) => e.id === "ERR-NET")! : /429/.test(t) ? ERROR_CATALOGUE.find((e) => e.id === "ERR-RATE")! : /^HTTP_5|^5\d\d|INTERNAL/.test(t) ? ERROR_CATALOGUE.find((e) => e.id === "ERR-5XX")! : ERROR_CATALOGUE.find((e) => e.code.split(" ").some((c) => t.includes(c) && c.length > 6)) ?? null;
  if (!row) return { message: "Something went wrong. Please try again.", errorRef: null, translated: lang === "en", retry: "Retry" };
  return { message: row.message, errorRef: row.id, translated: lang === "en", retry: row.retry, incident: row.incident };
}
export function reportServerError(module: string, technicalCode: string, memberRef: string | null = null): Res & { incidentId?: string; message?: string } {
  const m = memberMessage(technicalCode);
  if (!m.incident) return { ...OK(), message: m.message };
  const id = nextId("ERI", state.incidents, 6);
  commit(audited({ ...state, incidents: [...state.incidents, { id, errorRef: m.errorRef!, technicalCode, module, at: now(), memberRef, ticketRef: null, resolution: null }] }, "SYSTEM", "server_error_incident", id, technicalCode, module));
  return { ...OK(id), incidentId: id, message: m.message };
}
export function linkTicket(uid: string, incidentId: string, ticketRef: string, resolution: string): Res {
  if (!can(uid, "platform-admin", "edit")) return NO(need("platform-admin", "Edit"));
  const i = state.incidents.find((x) => x.id === incidentId);
  if (!i) return NO("Incident not found");
  commit(audited({ ...state, incidents: state.incidents.map((x) => (x.id === incidentId ? { ...x, ticketRef: ticketRef.trim() || null, resolution: resolution.trim() || null } : x)) }, uid, "incident_ticket_linked", incidentId, ticketRef, "Ticketing tool not connected (OP-TICKET1)"));
  return OK(incidentId, ["Recorded manually: the ticketing tool is not confirmed (OP-TICKET1)"]);
}
export const containsTechnicalTerms = (msg: string) => FORBIDDEN_TERMS.some((t) => msg.toLowerCase().includes(t.toLowerCase()));

/* ======================= Performance, capacity, security and acceptance evidence ======================= */

export function measurementStatus(targetId: string, m: Measurement | undefined): EvidenceStatus {
  const t = PERF_TARGETS.find((x) => x.id === targetId)!;
  if (!m) return "not_tested";
  if (m.environment === "local_development") return "pending_engineering_evidence";
  if (m.p95Ms == null) return "telemetry_unavailable";
  if (m.samples < 1) return "insufficient_samples";
  if (t.p95Ms == null) return "pending_engineering_evidence";
  if (m.p95Ms > t.p95Ms) return "fails_target";
  if (t.p99Ms != null && m.p99Ms != null && m.p99Ms > t.p99Ms) return "at_risk";
  if (t.p99Ms != null && m.p99Ms == null) return "at_risk";
  return "meets_target";
}
export function recordMeasurement(uid: string, m: Omit<Measurement, "id" | "by" | "at">): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  if (!PERF_TARGETS.some((t) => t.id === m.targetId)) return NO("Unknown request type");
  if (!m.runRef.trim() || !m.evidence.trim()) return NO("A test run reference and evidence are required");
  if (!Number.isInteger(m.samples) || m.samples < 0) return NO("Enter the sample count");
  const id = nextId("MSR", state.measurements);
  const rec: Measurement = { ...m, id, by: uid, at: now() };
  commit(audited({ ...state, measurements: [...state.measurements, rec] }, uid, "measurement_recorded", m.targetId, `${m.environment} p95 ${m.p95Ms ?? "—"} ms`, m.runRef));
  return OK(id, m.environment === "local_development" ? ["Local development measurement: kept for reference, not acceptance evidence"] : []);
}
export function performanceMatrix() {
  return PERF_TARGETS.map((t) => {
    const ms = state.measurements.filter((m) => m.targetId === t.id);
    const latest = [...ms].filter((m) => m.environment !== "local_development").slice(-1)[0] ?? ms.slice(-1)[0];
    return { ...t, latest: latest ?? null, status: measurementStatus(t.id, latest), count: ms.length };
  });
}
export function recordEvidence(uid: string, e: Omit<EvidenceRecord, "id" | "by" | "at">): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  if (!e.evidence.trim() || !e.runRef.trim()) return NO("Evidence and a run / document reference are required");
  if (e.result === "passed" && /local|mock|development/i.test(e.environment)) return NO("Local, mock or development results cannot be recorded as passed evidence");
  const id = nextId("EVD", state.evidence);
  commit(audited({ ...state, evidence: [...state.evidence, { ...e, id, by: uid, at: now() }] }, uid, "evidence_recorded", e.subject, e.result, e.runRef));
  return OK(id);
}
const evidenceFor = (subject: string) => state.evidence.filter((e) => e.subject === subject).slice(-1)[0] ?? null;
export const capacityMatrix = () => CAPACITY_TARGETS.map((c) => ({ ...c, evidence: evidenceFor(c.id), status: evidenceFor(c.id)?.result ?? "not_tested" }));
export const loadScenarioStatus = (id: string) => evidenceFor(id)?.result ?? "not_tested";
export const securityMatrix = () => SECURITY_CONTROLS.map((c) => ({ ...c, evidence: evidenceFor(c.id), status: evidenceFor(c.id)?.result ?? "not_tested" }));
export const acceptanceMatrix = () => ACCEPTANCE_CRITERIA.map((c) => ({ ...c, evidence: evidenceFor(c.id), status: evidenceFor(c.id)?.result ?? "not_tested_backend_required" }));
export const integrationTestMatrix = () => INTEGRATION_TESTS.map((t) => ({ ...t, evidence: evidenceFor(t.id), status: evidenceFor(t.id)?.result ?? (t.mockCovered ? "mock_adapter_only" : "not_tested") }));

/* ======================= Defects ======================= */

export function logDefect(uid: string, d: Pick<Defect, "module" | "title" | "description" | "severity" | "source">): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  if (!d.title.trim()) return NO("Describe the defect");
  const id = nextId("DEF", state.defects);
  commit(audited({ ...state, defects: [...state.defects, { ...d, id, owner: null, status: "open", rootCause: null, fixVersion: null, retest: null, history: [{ at: now(), by: uid, change: `Logged as ${d.severity}` }] }] }, uid, "defect_logged", id, d.severity, d.title));
  return OK(id);
}
const SEV = ["P0", "P1", "P2", "P3"];
export function updateDefect(uid: string, id: string, p: Partial<Pick<Defect, "severity" | "status" | "owner" | "rootCause" | "fixVersion" | "retest">>, reason: string): Res {
  const d = state.defects.find((x) => x.id === id);
  if (!d) return NO("Defect not found");
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  if (!reason.trim()) return NO("Give the reason for the change");
  // Downgrading a critical defect needs approval authority and is recorded.
  if (p.severity && SEV.includes(d.severity) && SEV.indexOf(p.severity) > SEV.indexOf(d.severity) && (d.severity === "P0" || d.severity === "P1") && !can(uid, "release-readiness", "approve")) return refuse(uid, "defect_downgrade_refused", id, "Downgrading a P0 / P1 defect needs Release & go-live readiness: Approve");
  if (p.status === "closed" && d.status !== "retest_passed" && d.status !== "deferred") return NO("Close a defect only after a passed retest");
  const change = Object.entries(p).map(([k, v]) => `${k}: ${String((d as unknown as Record<string, unknown>)[k])} → ${String(v)}`).join("; ");
  commit(audited({ ...state, defects: state.defects.map((x) => (x.id === id ? { ...x, ...p, history: [...x.history, { at: now(), by: uid, change: `${change} (${reason})` }] } : x)) }, uid, "defect_updated", id, change, reason));
  return OK(id);
}
export const openCritical = () => state.defects.filter((d) => (d.severity === "P0" || d.severity === "P1") && !["closed", "retest_passed"].includes(d.status));

/* ======================= UAT (SOW 14.6, OP-UAT1) ======================= */

export function configureUat(uid: string, cycleId: string, p: Partial<Pick<PlatformState["uat"][number], "plannedStart" | "plannedEnd" | "businessOwner" | "coordinator" | "teams" | "allocation" | "signOffAuthority" | "environment">>): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  const c = state.uat.find((x) => x.id === cycleId);
  if (!c) return NO("UAT cycle not found");
  const next = { ...c, ...p };
  const warnings: string[] = [];
  if (next.plannedStart && next.plannedEnd) {
    const days = Math.round((Date.parse(next.plannedEnd) - Date.parse(next.plannedStart)) / 86400_000) + 1;
    if (days < 1) return NO("The end date is before the start date");
    if (days !== 14) warnings.push(`Window is ${days} days; the SOW plans a two-week window (OP-UAT1)`);
  }
  const total = Object.values(next.allocation).reduce((n: number, v) => n + (v ?? 0), 0);
  if (p.allocation && Math.abs(total - 20) > 5) warnings.push(`Allocation totals ${total}; the SOW plans about 20 pilot members`);
  commit(audited({ ...state, uat: state.uat.map((x) => (x.id === cycleId ? next : x)) }, uid, "uat_configured", cycleId, JSON.stringify(p), "Configuration (OP-UAT1 open)"));
  return OK(cycleId, ["Pending V-Guard confirmation (OP-UAT1)", ...warnings]);
}
export function addPilotMember(uid: string, cycleId: string, memberId: string): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  const c = state.uat.find((x) => x.id === cycleId);
  const m = memberById(mem(), memberId);
  if (!c || !m) return NO("UAT cycle or member not found");
  if (c.pilotMembers.some((p) => p.memberId === memberId)) return NO("Already a pilot member");
  const cap = c.allocation[m.programme];
  const current = c.pilotMembers.filter((p) => p.programme === m.programme && p.status !== "withdrawn").length;
  if (cap != null && current >= cap) return NO(`${m.programme} allocation (${cap}) is full`);
  commit(audited({ ...state, uat: state.uat.map((x) => (x.id === cycleId ? { ...x, pilotMembers: [...x.pilotMembers, { memberId, programme: m.programme, status: "proposed" }] } : x)) }, uid, "pilot_member_added", memberId, cycleId, "Proposed (OP-UAT1)"));
  return OK(memberId);
}
export function recordUatExecution(uid: string, caseId: string, e: Omit<UatCase["executions"][number], "id" | "at" | "tester">): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  const c = state.uatCases.find((x) => x.id === caseId);
  if (!c) return NO("Test case not found");
  if (!e.actual.trim() || !e.evidence.trim()) return NO("Record the actual result and the evidence");
  if (e.result === "fail" && !e.defectId) return NO("A failed test needs a defect reference");
  if (e.defectId && !state.defects.some((d) => d.id === e.defectId)) return NO("Defect not found");
  const id = nextId("UEX", state.uatCases.flatMap((x) => x.executions), 5);
  commit(audited({ ...state, uatCases: state.uatCases.map((x) => (x.id === caseId ? { ...x, executions: [...x.executions, { ...e, id, at: now(), tester: uid }] } : x)) }, uid, e.retestOf ? "uat_retest" : "uat_executed", caseId, e.result, e.actual));
  return OK(id);
}
export const caseResult = (c: UatCase) => c.executions.slice(-1)[0]?.result ?? "not_run";
export function signOffUat(uid: string, cycleId: string, comments: string): Res {
  const c = state.uat.find((x) => x.id === cycleId);
  if (!c) return NO("UAT cycle not found");
  if (!can(uid, "release-readiness", "approve")) return refuse(uid, "uat_signoff_refused", cycleId, need("release-readiness", "Approve (sign-off)"));
  const problems: string[] = [];
  if (decisionStatus("OP-UAT1") !== "confirmed") problems.push("OP-UAT1 is open: participants, pilot members, window and sign-off authority are not confirmed");
  const cases = state.uatCases.filter((x) => x.cycleId === cycleId);
  if (cases.some((x) => caseResult(x) !== "pass")) problems.push(`${cases.filter((x) => caseResult(x) !== "pass").length} test cases are not passed`);
  if (openCritical().length) problems.push(`${openCritical().length} open P0 / P1 defects`);
  if (PROGRAMMES.some((p) => !c.pilotMembers.some((m) => m.programme === p && m.status !== "withdrawn"))) problems.push("Pilot members do not cover all five programmes");
  if (problems.length) return refuse(uid, "uat_signoff_refused", cycleId, problems.join("; "));
  commit(audited({ ...state, uat: state.uat.map((x) => (x.id === cycleId ? { ...x, signOff: { status: "signed", by: uid, at: now(), comments, ref: `SO-${cycleId}` } } : x)) }, uid, "uat_signed_off", cycleId, "signed", comments));
  return OK(cycleId);
}

/* ======================= Migration (SOW 14.8, OP-MIG1) ======================= */

export function targetSnapshot(): Snapshot {
  const c = analyticsContext();
  const ws = walletStore.get(), ss = schemeStore.get();
  const lines = fullLedger(ws, ss, mem());
  const members = mem().members.filter((m) => m.status !== "rejected");
  return {
    label: "Target platform (this build's module stores)",
    takenAt: now(),
    members: members.map((m) => ({ sourceRef: m.id, targetId: m.id, programme: m.programme, status: m.status, kyc: mem().documents.filter((d) => d.memberId === m.id && d.status === "approved").length ? "verified" : "pending", branchCode: m.branchCode })),
    wallets: members.map((m) => { const b = memberBalances(ws, ss, mem(), m.id); return { memberId: m.id, programme: m.programme, available: b.available, scheme: b.scheme, redeemed: b.redeemed }; }),
    kitty: members.filter((m) => m.programme === "EP").flatMap((m) => { const by = new Map<string, number>(); lines.filter((l) => l.memberId === m.id && l.bucket === "tds_kitty" && l.status === "completed").forEach((l) => by.set(fyLabel(l.at), (by.get(fyLabel(l.at)) ?? 0) + l.points)); return [...by.entries()].map(([fy, kitty]) => ({ memberId: m.id, programme: m.programme, fy, kitty })); }),
    history: members.map((m) => ({ memberId: m.id, scans: c.scans.filter((s) => s.memberId === m.id).map((s) => s.id), redemptions: ws.redemptions.filter((r) => r.memberId === m.id).map((r) => r.id) })),
  };
}
export function migrationReconciliation() {
  const target = targetSnapshot();
  const source = developmentSourceSnapshot(target);
  return { source: { label: source.label, members: source.members.length }, target: { label: target.label, members: target.members.length }, members: reconcileMembers(source, target), wallets: reconcileWallets(source, target), kitty: reconcileKitty(source, target), scans: reconcileHistory(source, target, "scans"), redemptions: reconcileHistory(source, target, "redemptions") };
}
export function raiseMigrationExceptions(uid: string): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  const r = migrationReconciliation();
  const ex: Omit<MigrationException, "id" | "owner" | "status" | "evidence" | "signOff">[] = [
    ...r.members.rows.flatMap((x) => x.issues.map((k) => ({ kind: k as MigrationException["kind"], sourceRef: x.source.sourceRef, targetRef: x.target?.targetId ?? null, difference: k === "invalid_branch" || k === "member_mapping" ? `Branch ${x.source.branchCode} vs ${x.target?.branchCode}` : k.replace(/_/g, " ") }))),
    ...r.wallets.differences.map((x) => ({ kind: (x.bucket === "scheme" ? "scheme_points_difference" : "wallet_difference") as MigrationException["kind"], sourceRef: `${x.memberId}/${x.bucket}`, targetRef: x.memberId, difference: `${x.bucket}: source ${x.source} vs target ${x.target ?? "missing"}` })),
    ...r.kitty.differences.map((x) => ({ kind: "tds_kitty_difference" as const, sourceRef: `${x.memberId}/${x.fy}`, targetRef: x.memberId, difference: `TDS Kitty ${x.fy}: source ${x.kitty} vs target ${x.target ?? "missing"}` })),
    ...r.scans.missing.map((x) => ({ kind: "missing_scan_history" as const, sourceRef: x.ref, targetRef: x.memberId, difference: "Scan not found in target" })),
    ...(r.redemptions.duplicates ? [{ kind: "missing_redemption_history" as const, sourceRef: "SOURCE-REDEMPTIONS", targetRef: null, difference: `${r.redemptions.duplicates} duplicate redemption reference(s) in source` }] : []),
  ];
  let list = state.migrationExceptions;
  let added = 0;
  for (const e of ex) {
    if (list.some((x) => x.kind === e.kind && x.sourceRef === e.sourceRef)) continue;
    list = [...list, { ...e, id: nextId("MEX", list), owner: null, status: "open", evidence: null, signOff: null }];
    added++;
  }
  commit(audited({ ...state, migrationExceptions: list }, uid, "migration_exceptions_raised", "migration", `${added} new`, "Development test snapshot reconciliation"));
  return OK(undefined, [`${added} new exception(s); existing ones kept. Target data was not changed`]);
}
export function resolveMigrationException(uid: string, id: string, status: "investigating" | "resolved" | "accepted", evidence: string, owner?: string): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  const x = state.migrationExceptions.find((e) => e.id === id);
  if (!x) return NO("Exception not found");
  if ((status === "resolved" || status === "accepted") && !evidence.trim()) return NO("Record the evidence: exceptions are never closed by changing target data to match");
  if (status === "accepted" && !can(uid, "release-readiness", "approve")) return refuse(uid, "migration_accept_refused", id, "Accepting a difference needs Release & go-live readiness: Approve");
  commit(audited({ ...state, migrationExceptions: state.migrationExceptions.map((e) => (e.id === id ? { ...e, status, evidence: evidence || e.evidence, owner: owner ?? e.owner, signOff: status === "accepted" ? uid : e.signOff } : e)) }, uid, `migration_exception_${status}`, id, evidence, x.difference));
  return OK(id);
}
export function setMigrationScope(uid: string, programme: ProgrammeCode, value: "included" | "excluded" | "pending_confirmation"): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  commit(audited({ ...state, migrationScope: { ...state.migrationScope, programmes: { ...state.migrationScope.programmes, [programme]: value } } }, uid, "migration_scope_changed", programme, value, "Draft scope (OP-MIG1 open)"));
  return OK(programme, decisionStatus("OP-MIG1") === "confirmed" ? [] : ["Draft: migration scope is not confirmed (OP-MIG1)"]);
}

/* ======================= Go-live gates, checklists and rollback (SOW 14.7) ======================= */

function gatePrecondition(id: string): string | null {
  if (id === "GL-01" && openCritical().length) return `${openCritical().length} open P0 / P1 defects`;
  if (id === "GL-02" && !state.uat.some((u) => u.signOff.status === "signed")) return "UAT is not signed off";
  if (id === "GL-03" && loadScenarioStatus("LT-B") !== "passed") return "Load test Scenario B (10,000 users, 1 lakh scans) has no passed evidence";
  if (id === "GL-04" && securityMatrix().some((c) => c.status !== "passed")) return "Security controls lack passed evidence";
  if (id === "GL-05" && !(state.rollbackPlan.documented && state.rollbackPlan.expectedRestoration && state.rollbackPlan.testResult === "passed")) return "Rollback plan with expected restoration time and a passed rollback test is required";
  if (id === "GL-06" && opsStore.get().integrations.every((i) => i.connection !== "live" as never)) return "Monitoring runs on mock telemetry: live dashboards are not connected";
  if (id === "GL-08" && (decisionStatus("OP-MIG1") !== "confirmed" || state.migrationExceptions.some((e) => e.status === "open" || e.status === "investigating"))) return "OP-MIG1 open or migration exceptions unresolved";
  return null;
}
export function updateGate(uid: string, gateId: string, status: GateStatus, p: { evidence?: string; signOffRef?: string; remarks?: string }): Res {
  const g = state.gates.find((x) => x.id === gateId);
  if (!g) return NO("Gate not found");
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  if (status === "passed") {
    if (!can(uid, "release-readiness", "approve")) return refuse(uid, "gate_pass_refused", gateId, "Passing a go-live gate needs Release & go-live readiness: Approve");
    if (!p.evidence?.trim() || !p.signOffRef?.trim()) return refuse(uid, "gate_pass_refused", gateId, "A gate is passed only with evidence and a sign-off reference");
    const pre = gatePrecondition(gateId);
    if (pre) return refuse(uid, "gate_pass_refused", gateId, pre);
  }
  commit(audited({ ...state, gates: state.gates.map((x) => (x.id === gateId ? { ...x, status, evidence: p.evidence ? [...x.evidence, p.evidence] : x.evidence, signOffRef: p.signOffRef ?? x.signOffRef, remarks: p.remarks ?? x.remarks, reviewer: status === "passed" ? uid : x.reviewer, validationDate: status === "passed" ? now().slice(0, 10) : x.validationDate } : x)) }, uid, `gate_${status}`, gateId, p.evidence ?? null, p.remarks ?? "", "success", g.status));
  return OK(gateId);
}
export function goLiveStatus() {
  const g = state.gates;
  if (g.some((x) => x.status === "failed" || x.status === "blocked")) return "blocked" as const;
  if (g.every((x) => x.status === "passed")) return "ready_for_formal_approval" as const;
  if (g.some((x) => x.status !== "not_started")) return "in_progress" as const;
  return "not_ready" as const;
}
export const gateBlockers = () => state.gates.map((x) => ({ id: x.id, blocker: gatePrecondition(x.id) }));
export function updateChecklistItem(uid: string, id: string, status: GateStatus, evidence: string): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  const it = state.checklists.find((x) => x.id === id);
  if (!it) return NO("Item not found");
  if (status === "passed" && !evidence.trim()) return NO("Evidence is required to mark an item passed");
  if (status === "passed" && it.group === "cutover" && /confirmed/i.test(it.item) && decisionStatus("OP-MIG1") !== "confirmed") return refuse(uid, "cutover_refused", id, "Scope confirmation depends on OP-MIG1");
  commit(audited({ ...state, checklists: state.checklists.map((x) => (x.id === id ? { ...x, status, evidence: evidence || x.evidence, updatedBy: uid, updatedAt: now() } : x)) }, uid, "checklist_updated", id, status, evidence));
  return OK(id);
}
export function setRollbackPlan(uid: string, p: Partial<PlatformState["rollbackPlan"]>): Res {
  if (!can(uid, "release-readiness", "edit")) return NO(need("release-readiness", "Edit"));
  if (p.testResult === "passed" && !p.testedAt) return NO("Record when the rollback was tested");
  commit(audited({ ...state, rollbackPlan: { ...state.rollbackPlan, ...p } }, uid, "rollback_plan_updated", "rollback", JSON.stringify(p), ""));
  return OK();
}

/* ======================= SOW coverage and overview ======================= */

export function sowCoverage() {
  const sd = schemeStore.get().decisions;
  const sb = BUILDER_COMPONENTS.map((c) => {
    const dec = c.decision ? sd.find((d) => d.id === c.decision) : undefined;
    const open = dec && dec.status !== "confirmed";
    return { ref: `SB${String(c.n).padStart(2, "0")}`, feature: c.name, sowLocation: `SOW ${c.sow}`, where: c.where, decision: c.decision ?? null, status: (open ? "business_confirmation_required" : "fully_implemented") as "business_confirmation_required" | "fully_implemented", configuration: "Scheme Builder", validation: "validateConfig / businessBlockers", approval: "WF scheme_create / scheme_modify / scheme_activation", versioning: "SchemeVersion", safeguards: "Budget, exposure, idempotent accruals", audit: "Scheme audit", test: "schemes.test (119)" };
  });
  return { af: AF_COVERAGE, sb };
}
const PENDING: string[] = ["submitted", "pending_assignment", "pending_approval", "under_review", "resubmitted", "partially_approved", "escalated"];
export function platformOverview(uid: string) {
  const a = acc();
  const admins = a.users.filter((u) => a.memberships.some((m) => m.userId === u.id));
  const reqs = approvalStore.get().requests;
  const reg = configurationRegistry();
  const cov = sowCoverage();
  const all = [...cov.af.map((x) => x.status), ...cov.sb.map((x) => x.status)];
  const op = openPointRegister();
  return {
    totalAdmins: admins.length,
    activeAdmins: admins.filter((u) => u.accountStatus === "active").length,
    restricted: admins.filter((u) => u.accountStatus !== "active").length,
    pendingAccess: a.assignments.filter((x) => x.status === "pending").length,
    roles: a.roles.length,
    profiles: a.roles.filter((r) => r.category === "operational").length,
    workflows: approvalStore.get().workflows.filter((w) => w.status !== "inactive").length,
    pendingApprovals: reqs.filter((r) => PENDING.includes(r.status)).length,
    pendingAdminApprovals: reqs.filter((r) => PENDING.includes(r.status) && ["users", "app-themes", "kpi-governance", "integrations"].includes(r.module)).length,
    activeConfigs: reg.filter((x) => /active|approved|confirmed|published/i.test(x.approval)).length,
    pendingConfigs: reg.filter((x) => /pending|draft|submitted/i.test(x.approval)).length,
    auditExceptions: state.migrationExceptions.filter((x) => x.status === "open").length + state.audit.filter((x) => x.result === "refused").length,
    openDependencies: op.filter((x) => ["open", "under_review"].includes(x.status)).length,
    coverage: { full: all.filter((x) => x === "fully_implemented").length, partial: all.filter((x) => x === "partially_implemented").length, uiOnly: all.filter((x) => x === "ui_only").length, mockOnly: all.filter((x) => x === "mock_service_only").length, prepared: all.filter((x) => x === "backend_integration_prepared").length, bcr: all.filter((x) => x === "business_confirmation_required").length, notImplemented: all.filter((x) => x === "not_implemented").length },
    criticalDefects: openCritical().length,
    untriaged: state.defects.filter((d) => d.severity === "untriaged" && d.status === "open").length,
    uat: state.uat[0].signOff.status === "signed" ? "Signed off" : decisionStatus("OP-UAT1") === "confirmed" ? "In preparation" : "Pending OP-UAT1",
    migration: decisionStatus("OP-MIG1") === "confirmed" ? "In validation" : "Pending OP-MIG1",
    goLive: { passed: state.gates.filter((g) => g.status === "passed").length, total: state.gates.length, status: goLiveStatus() },
    performance: performanceMatrix().filter((p) => p.status === "meets_target").length,
    security: securityMatrix().filter((s) => s.status === "passed").length,
    sso: adminSsoStatus(),
    viewAs: viewAsStore.get().sessions.length,
    refusedPrivileged: state.audit.filter((x) => x.result === "refused").length,
    landing: landingFor(uid),
  };
}
export const checklist = (group: ChecklistItem["group"]) => state.checklists.filter((x) => x.group === group);
