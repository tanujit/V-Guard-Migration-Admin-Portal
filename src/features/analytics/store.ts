/**
 * BUSINESS ANALYTICS STORE — in-browser reporting service (Phase 12, SOW Module 13).
 * - Reads the authoritative module stores; every figure comes from features/analytics/engine.
 * - Every query is scoped: member-level data is limited to the members the user may see for the
 *   module (programme and geography), and aggregate panels are computed over that same scope.
 * - KPI definitions and targets change only through the Approval Engine (WF-038). Threshold alerts
 *   stay draft while OP-ALERT1 is open; evaluation never dispatches an unconfirmed alert.
 * - Exports and scheduled runs re-check permission and scope; sensitive ones are audited.
 */
import { useSyncExternalStore } from "react";
import { LINEAGE, REPORTS } from "@/config/analyticsCatalogue";
import { accessStore } from "@/features/access/store";
import { getEffectiveAccess, hasPermission, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { commsStore, sendStaffAlert } from "@/features/comms/store";
import { giftsStore } from "@/features/gifts/store";
import { geoOfMember, memberById } from "@/features/members/engine";
import { memberStore } from "@/features/members/store";
import { masterStore } from "@/features/masters/store";
import { opsStore } from "@/features/ops/store";
import { lastLogin } from "@/features/ops/engine";
import { riskStore } from "@/features/risk/store";
import { schemeStore } from "@/features/schemes/store";
import { walletStore } from "@/features/wallet/store";
import { fullLedger, memberBalances } from "@/features/wallet/engine";
import type { ApprovalRequest } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { AnalyticsState, ExportRecord, FilterSnapshot, KpiChangeRequest, ReportSchedule, ThresholdPolicy } from "@/types/analytics";
import type { Member } from "@/types/members";
import * as E from "./engine";
import { buildAnalyticsSeed } from "./seed";

const STORAGE_KEY = "vg-rishta.analytics-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[], w = 4) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1, w)}`;
const sources = () => ({ mem: mem(), ws: walletStore.get(), ss: schemeStore.get(), ms: masterStore.get(), rs: riskStore.get(), os: opsStore.get(), now: now() });

/* ---------------- Store plumbing ---------------- */

let state: AnalyticsState;
const listeners = new Set<() => void>();
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function commit(next: AnalyticsState) {
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}
function load(): AnalyticsState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AnalyticsState;
  } catch {
    /* seed */
  }
  return buildAnalyticsSeed(sources());
}
state = load();
export const analyticsStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useAnalyticsState = () => useSyncExternalStore(analyticsStore.subscribe, analyticsStore.get, analyticsStore.get);

const roleOf = (uid: string) => (uid === "SYSTEM" ? "System" : getEffectiveAccess(acc(), uid).sources.find((x) => x.kind === "role")?.title ?? "—");
function audited(s: AnalyticsState, actor: string, action: string, entity: string, after: string | null, reason: string, sensitive = false, before: string | null = null): AnalyticsState {
  return { ...s, audit: [...s.audit, { id: `AAE-${pad(s.audit.length + 1, 6)}`, at: now(), actor, role: roleOf(actor), action, entity, before, after, reason, sensitive }] };
}
const can = (uid: string, module: string, action: ActionId) => hasPermission(acc(), uid, module, action).allowed;
const canKey = (uid: string, key: string) => { const i = key.lastIndexOf(":"); return can(uid, key.slice(0, i), key.slice(i + 1) as ActionId); };
const LABEL: Record<string, string> = { analytics: "Business analytics", reports: "Reports", "member-analytics": "Member 360 analytics", "finance-reports": "Finance reports", "scan-reports": "Scan & QR reports", "kpi-governance": "KPI governance" };
const need = (m: string, a: string) => `You need ${LABEL[m] ?? m}: ${a}`;

/* ---------------- Context and scope ---------------- */

let ctxMemo: { key: unknown[]; value: E.Ctx } | null = null;
/** One analytics context over the authoritative stores, rebuilt only when a source changes. */
export function context(): E.Ctx {
  const src = sources();
  const os = opsStore.get();
  const key = [src.mem, src.ws, src.ss, src.ms, src.rs, os.auth, os.config.dormancyDays, commsStore.get(), giftsStore.get(), state.scans, state.config.churnedDays, state.config.slowMovingDays, src.now];
  if (ctxMemo && ctxMemo.key.every((k, i) => k === key[i])) return ctxMemo.value;
  const value: E.Ctx = { mem: src.mem, members: src.mem.members, lines: fullLedger(src.ws, src.ss, src.mem), ws: src.ws, ss: src.ss, ms: src.ms, rs: src.rs, cs: commsStore.get(), gs: giftsStore.get(), auth: os.auth, scans: state.scans, now: src.now, dormancyDays: os.config.dormancyDays, churnedDays: state.config.churnedDays, slowMovingDays: state.config.slowMovingDays };
  ctxMemo = { key, value };
  return value;
}
let actMemo: { ctx: E.Ctx; act: ReturnType<typeof E.activity> } | null = null;
export const activityMap = () => { const c = context(); if (actMemo?.ctx !== c) actMemo = { ctx: c, act: E.activity(c) }; return actMemo.act; };

const scopeMemo = new Map<string, { key: unknown[]; ids: Set<string> }>();
/** Members the user may see in a module (programme + geography of each member). */
export function scopeIds(uid: string, module: string, action: ActionId = "view"): Set<string> {
  const k = `${uid}|${module}|${action}`;
  const key = [acc(), mem()];
  const hit = scopeMemo.get(k);
  if (hit && hit.key.every((x, i) => x === key[i])) return hit.ids;
  const ids = new Set(mem().members.filter((m) => hasPermission(acc(), uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed).map((m) => m.id));
  scopeMemo.set(k, { key, ids });
  return ids;
}
export function scopedMembers(uid: string, module: string, f: Partial<E.Filters> = {}) {
  const ids = scopeIds(uid, module);
  return mem().members.filter((m) => ids.has(m.id) && E.memberMatches(m, f));
}
export const scopeLabel = (uid: string, module: string) => { const n = scopeIds(uid, module).size; return n === mem().members.length ? "All programmes and geographies" : `${n} of ${mem().members.length} members in your programme / geography scope`; };

/* ---------------- Freshness, lineage and refresh ---------------- */

export function freshness(domain: string): { status: "live" | "near_real_time" | "scheduled" | "stale" | "unavailable"; lastRefresh: string; source: string } {
  const l = LINEAGE.find((x) => x.domain === domain)!;
  if (state.config.unavailable.includes(domain)) return { status: "stale", lastRefresh: state.refreshedAt, source: l.source };
  return { status: l.freshness, lastRefresh: state.refreshedAt, source: l.source };
}
export function refreshAnalytics(uid: string): Res {
  if (!can(uid, "analytics", "view")) return NO(need("analytics", "View"));
  commit(audited({ ...state, refreshedAt: now() }, uid, "analytics_refreshed", "dashboard", now(), "Manual refresh"));
  return OK();
}
/** Development control: mark a source as unavailable to exercise stale / unavailable states. */
export function setSourceAvailability(uid: string, domain: string, available: boolean): Res {
  if (!can(uid, "kpi-governance", "manage")) return NO(need("kpi-governance", "Manage"));
  const unavailable = available ? state.config.unavailable.filter((d) => d !== domain) : [...new Set([...state.config.unavailable, domain])];
  commit(audited({ ...state, config: { ...state.config, unavailable } }, uid, available ? "source_restored" : "source_marked_unavailable", domain, null, "Development source availability"));
  return OK();
}
export const lineage = () => LINEAGE.map((l) => ({ ...l, ...freshness(l.domain) }));

/* ======================= KPI values (shared by every view) ======================= */

export function kpiValues(uid: string, asOn = E.day(now()), f: Partial<E.Filters> = {}) {
  const ids = new Set(scopedMembers(uid, "analytics", f).map((m) => m.id));
  return E.kpiValues(context(), ids, asOn, activityMap());
}

/* ======================= Dashboard panels ======================= */

const guard = (uid: string, key = "analytics:view") => (canKey(uid, key) ? null : NO(`You need ${key.replace(":", ": ")}`));

export function engagement(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const act = activityMap();
  const members = scopedMembers(uid, "analytics", f);
  const ids = new Set(members.map((m) => m.id));
  const months = [...new Set(Array.from({ length: 12 }, (_, i) => E.month(E.addDays(`${E.month(f.to)}-15`, -30 * (11 - i)))))];
  const signups = members.filter((m) => E.joinDate(m) >= f.from && E.joinDate(m) <= f.to);
  return {
    ...OK(),
    dau: E.dauSeries(act, ids, f.from, f.to),
    dauToday: E.activeOnDay(act, ids, f.to),
    mau: months.map((m) => ({ key: m, label: m, mau: E.mauSet(act, ids, m).size })),
    a90: E.active90(act, ids, f.to).size,
    trend7: E.dauSeries(act, ids, E.addDays(f.to, -6), f.to),
    trend30: E.dauSeries(act, ids, E.addDays(f.to, -29), f.to),
    signups: { total: signups.length, byDay: groupCount(signups, (m) => E.joinDate(m)), byMonth: groupCount(members, (m) => E.month(E.joinDate(m))), byProgramme: groupCount(signups, (m) => m.programme), bySource: groupCount(signups, (m) => m.registration.source) },
    byProgramme: groupCount(members.filter((m) => E.activeIn(act, new Set([m.id]), f.from, f.to).size), (m) => m.programme),
    byRegion: groupCount(members.filter((m) => E.activeIn(act, new Set([m.id]), f.from, f.to).size), (m) => E.geoOf(m.branchCode).stateName),
    byCategory: groupCount(c.scans.filter((s) => ids.has(s.memberId) && E.day(s.at) >= f.from && E.day(s.at) <= f.to), (s) => E.categoryName(c.ms, s.categoryId)),
    drill: (kind: "active" | "signups") => (kind === "signups" ? signups : members.filter((m) => E.activeIn(act, new Set([m.id]), f.from, f.to).size)).map((m) => memberRow(m)),
    freshness: freshness("activity"),
  };
}
function groupCount<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1));
  return [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => (a.key < b.key ? -1 : 1));
}
function memberRow(m: Member) {
  const act = activityMap().get(m.id);
  const lastAct = act ? [...act.keys()].sort().slice(-1)[0] : null;
  return { id: m.id, name: m.name, programme: m.programme, joined: E.joinDate(m), branch: m.branchCode, lastLogin: lastLogin(opsStore.get().auth, m.id, m.registration.firstLoginAt), lastActivity: lastAct };
}

export function pointsFlowView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const ids = new Set(scopedMembers(uid, "analytics", f).map((m) => m.id));
  const lines = E.filterLines(c, f, ids);
  const cat = (l: (typeof lines)[number]) => E.categoryName(c.ms, E.categoryOf(c.ms, l.skuCode, l.categoryId));
  return {
    ...OK(),
    total: E.pointsFlow(lines),
    byProgramme: E.pointsBy(lines, (l) => l.programme),
    byCategory: E.pointsBy(lines, cat),
    byScheme: E.pointsBy(lines.filter((l) => l.schemeId), (l) => l.schemeId!),
    byMemberType: E.pointsBy(lines, (l) => memberById(c.mem, l.memberId)?.memberType ?? "—"),
    daily: E.pointsDaily(lines),
    monthly: E.pointsMonthly(lines),
    lines,
    freshness: freshness("points"),
  };
}

export function revenueView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const members = scopedMembers(uid, "analytics", f);
  const cohorts = [...new Set(members.map((m) => E.month(E.joinDate(m))))].sort();
  return { ...OK(), methodStatus: "business_confirmation_required" as const, decision: "OP-REV1", cohorts: cohorts.map((c) => ({ cohort: c, members: members.filter((m) => E.month(E.joinDate(m)) === c).length, revenue: null as number | null, momGrowth: null as number | null })), freshness: freshness("revenue") };
}

export function fraudView(uid: string, f: E.Filters) {
  const g = guard(uid) ?? guard(uid, "fraud-rules:view");
  if (g) return { ...g, denied: true as const };
  const c = context();
  const ids = scopeIds(uid, "fraud-rules");
  const ev = c.rs.events.filter((e) => (!e.memberId || ids.has(e.memberId)) && E.day(e.detectedAt) >= f.from && E.day(e.detectedAt) <= f.to && (!f.programmes.length || !e.programme || f.programmes.includes(e.programme)));
  const states = ev.map((e) => ({ e, s: E.FRAUD_STATE(e, c.rs) }));
  const scanById = new Map(c.scans.map((s) => [s.id, s]));
  const catOf = (e: (typeof ev)[number]) => { const sc = e.links.scanRefs.map((r) => scanById.get(r)).find(Boolean); return sc ? E.categoryName(c.ms, sc.categoryId) : "Not linked to a product"; };
  const blocked = mem().restrictions.filter((r) => r.status !== "lifted" && r.memberIds.some((id) => ids.has(id)));
  return {
    ...OK(),
    live: states.filter((x) => x.s === "flagged").length,
    investigating: states.filter((x) => x.s === "investigating").length,
    confirmed: states.filter((x) => x.s === "confirmed").length,
    cleared: states.filter((x) => x.s === "cleared").length,
    resolved: states.filter((x) => x.s === "resolved").length,
    blockedAccounts: blocked.length,
    redemptionBlocks: c.rs.redemptionBlocks.filter((b) => b.blockStatus === "blocked").length,
    flaggedTransactions: ev.filter((e) => e.links.scanRefs.length || e.links.redemptionRefs.length || e.links.ledgerRefs.length).length,
    detectionRate: null as number | null,
    amountSaved: null as number | null,
    byDistrict: groupStates(states, (x) => (x.e.branchCode ? E.geoOf(x.e.branchCode).districtName : "No branch")),
    byProduct: groupStates(states, (x) => catOf(x.e)),
    events: states,
    freshness: freshness("fraud"),
  };
}
type StateCounts = { flagged: number; investigating: number; confirmed: number; cleared: number; resolved: number };
function groupStates<T extends { s: keyof StateCounts }>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, StateCounts>();
  xs.forEach((x) => { const r = m.get(key(x)) ?? m.set(key(x), { flagged: 0, investigating: 0, confirmed: 0, cleared: 0, resolved: 0 }).get(key(x))!; r[x.s]++; });
  return [...m.entries()].map(([k, v]) => ({ key: k, ...v, total: v.flagged + v.investigating + v.confirmed + v.cleared + v.resolved })).sort((a, b) => b.total - a.total);
}

export function schemeView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const rows = c.ss.schemes.map((s) => E.schemeScorecard(c, s.id)).filter((r) => (!f.programmes.length || r.programmes.some((p) => f.programmes.includes(p as never))) && (!f.schemeId || r.id === f.schemeId));
  return { ...OK(), rows, freshness: freshness("schemes") };
}

export function channelView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const ids = new Set(scopedMembers(uid, "analytics", f).map((m) => m.id));
  const scans = E.filterScans(c, { from: f.from, to: f.to, categoryId: f.categoryId ?? undefined }, ids);
  const redeemed = c.ws.redemptions.filter((r) => ids.has(r.memberId) && E.day(r.createdAt) >= f.from && E.day(r.createdAt) <= f.to);
  const by = (key: (s: (typeof scans)[number]) => string) => { const keys = [...new Set(scans.map(key))]; return keys.map((k) => ({ key: k, rows: E.channelPerformance(scans.filter((s) => key(s) === k)) })); };
  return {
    ...OK(),
    channels: E.channelPerformance(scans),
    redeemedByChannel: [{ key: "unmapped", label: "Unknown / unmapped", points: redeemed.reduce((n, r) => n + r.points, 0), count: redeemed.length, note: "The redemption service does not record a channel" }],
    byProgramme: by((s) => s.programme),
    byMemberType: by((s) => memberById(c.mem, s.memberId)?.memberType ?? "—"),
    byCategory: by((s) => E.categoryName(c.ms, s.categoryId)),
    daily: [...new Set(scans.map((s) => E.day(s.at)))].sort().map((d) => ({ key: d, label: d.slice(5), ...Object.fromEntries(E.channelPerformance(scans.filter((s) => E.day(s.at) === d)).map((x) => [x.key, x.pointsEarned])) })),
    freshness: freshness("scans"),
  };
}

export function geoView(uid: string, f: E.Filters, level: "state" | "district" | "branch") {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const members = scopedMembers(uid, "analytics", f);
  return { ...OK(), rows: E.geography(c, level, members, activityMap(), f, c.scans), freshness: freshness("geography") };
}

export function tierView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const tiers = c.ss.tiers.filter((t) => t.status === "active" && (!f.programmes.length || f.programmes.includes(t.programme as never)));
  const snaps = c.ss.tierSnapshots.filter((s) => tiers.some((t) => t.id === s.tierId) && (!f.branch || s.branchCode === f.branch) && (!f.state || E.geoOf(s.branchCode).state === f.state));
  const total = snaps.reduce((n, s) => n + s.members, 0);
  return {
    ...OK(),
    tiers: tiers.map((t) => { const s = snaps.filter((x) => x.tierId === t.id); const n = s.reduce((a, x) => a + x.members, 0); return { id: t.id, name: t.name, programme: t.programme, rank: t.rank, members: n, share: E.ratio(n, total), upgrades: s.reduce((a, x) => a + x.upgrades30d, 0), downgrades: s.reduce((a, x) => a + x.downgrades30d, 0), nearNext: s.reduce((a, x) => a + x.nearNext, 0) }; }).sort((a, b) => (a.programme === b.programme ? a.rank - b.rank : a.programme < b.programme ? -1 : 1)),
    byBranch: snaps,
    memberLevel: null as null,
    note: "Member-level tier history is not supplied by the Tier service snapshot: drill-down stops at branch",
    freshness: freshness("tiers"),
  };
}

export function supportView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const ids = new Set(scopedMembers(uid, "analytics", f).map((m) => m.id));
  return { ...OK(), ...E.supportStats(context(), ids, f), freshness: freshness("support") };
}

export function retentionView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const act = activityMap();
  const members = scopedMembers(uid, "analytics", f);
  const ids = new Set(members.map((m) => m.id));
  const asOn = E.day(now());
  const months = Array.from({ length: 6 }, (_, i) => { let m = E.month(asOn); for (let k = 0; k < 5 - i; k++) m = E.prevMonth(m); return m; });
  return {
    ...OK(),
    matrix: E.retentionMatrix(act, members, asOn),
    churn: months.map((m) => E.churn30(act, ids, m, asOn)),
    churnByProgramme: (["EP", "ST", "CS", "Retailer", "DD"] as const).map((p) => ({ key: p, ...E.churn30(act, new Set(members.filter((m) => m.programme === p).map((m) => m.id)), E.month(asOn), asOn) })),
    churnByState: [...new Set(members.map((m) => E.geoOf(m.branchCode).state))].map((s) => ({ key: s, ...E.churn30(act, new Set(members.filter((m) => E.geoOf(m.branchCode).state === s).map((m) => m.id)), E.month(asOn), asOn) })),
    freshness: freshness("activity"),
  };
}

export function segmentationView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const auth = opsStore.get().auth;
  const rows = scopedMembers(uid, "analytics", f).filter((m) => !["pending", "rejected"].includes(m.status)).map((m) => { const ll = lastLogin(auth, m.id, m.registration.firstLoginAt); return { member: m, lastLogin: ll, segment: E.segmentOf(c, ll) }; });
  return { ...OK(), rows, thresholds: { dormantDays: c.dormancyDays, churnedDays: c.churnedDays }, classified: c.dormancyDays != null && c.churnedDays != null && c.churnedDays > c.dormancyDays, freshness: freshness("members") };
}

export function acquisitionView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const members = scopedMembers(uid, "analytics", f).filter((m) => E.joinDate(m) >= f.from && E.joinDate(m) <= f.to);
  return { ...OK(), newMembers: members.length, bySource: groupCount(members, (m) => m.registration.source), byProgramme: groupCount(members, (m) => m.programme), byRegion: groupCount(members, (m) => E.geoOf(m.branchCode).stateName), byCohort: groupCount(members, (m) => E.month(E.joinDate(m))), spend: null as number | null, cac: E.cac(null, members.length), payback: null as number | null, decision: "OP-CAC1", freshness: freshness("marketing") };
}

export function redemptionView(uid: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const ids = new Set(scopedMembers(uid, "analytics", f).map((m) => m.id));
  return { ...OK(), ...E.redemptionByProduct(context(), ids, f), slowThreshold: state.config.slowMovingDays, freshness: freshness("gifts") };
}

/* ======================= Member 360 analytics ======================= */

export interface M360Filter { role?: string; branch?: string; district?: string; salesRep?: string; programme?: string }
export function member360List(uid: string, f: M360Filter) {
  if (!can(uid, "member-analytics", "view")) return [];
  const ids = scopeIds(uid, "member-analytics");
  return mem().members.filter((m) => ids.has(m.id) && (!f.role || m.memberType === f.role) && (!f.branch || m.branchCode === f.branch) && (!f.district || E.geoOf(m.branchCode).district === f.district) && (!f.salesRep || m.sr === f.salesRep) && (!f.programme || m.programme === f.programme));
}
export function member360(uid: string, memberId: string) {
  if (!can(uid, "member-analytics", "view")) return { ...NO(need("member-analytics", "View")), denied: true as const };
  const m = memberById(mem(), memberId);
  if (!m) return { ...NO("Member not found"), denied: true as const };
  if (!scopeIds(uid, "member-analytics").has(m.id)) return { ...NO("This member is outside your programme or geography"), denied: true as const };
  const c = context();
  const b = memberBalances(c.ws, c.ss, c.mem, m.id);
  const scans = c.scans.filter((s) => s.memberId === m.id);
  const reds = c.ws.redemptions.filter((r) => r.memberId === m.id).sort((a, x) => x.createdAt.localeCompare(a.createdAt));
  const tdsLines = c.lines.filter((l) => l.memberId === m.id && (l.type === "tds_paid" || (l.type === "tds_kitty_deduction" && l.bucket === "tds_kitty")));
  const fys = [...new Set([...tdsLines.map((l) => E.fyOf(l.at)), ...reds.filter((r) => r.tds.status === "recorded").map((r) => E.fyOf(r.createdAt))])].sort();
  const events = mem().events.filter((e) => e.memberId === m.id).sort((a, x) => x.at.localeCompare(a.at));
  const approval = m.registration.stage2 ?? m.registration.stage1;
  commit(audited(state, uid, "member360_viewed", m.id, null, "Member 360 analytics", false));
  return {
    ...OK(m.id),
    member: m,
    points: { lifetimeEarned: b.lifetime, lifetimeRedeemed: b.redeemed, available: b.available, scheme: b.scheme, source: "Wallet & Ledger" },
    lastScan: scans.filter((s) => s.status === "success").map((s) => s.at).sort().slice(-1)[0] ?? null,
    lastRedemption: reds[0]?.createdAt ?? null,
    tds: fys.map((fy) => ({ fy, paidInr: reds.filter((r) => E.fyOf(r.createdAt) === fy && r.tds.status === "recorded").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0), paidPoints: tdsLines.filter((l) => l.type === "tds_paid" && E.fyOf(l.at) === fy).reduce((n, l) => n + l.points, 0), kittyPoints: tdsLines.filter((l) => l.type === "tds_kitty_deduction" && E.fyOf(l.at) === fy).reduce((n, l) => n + l.points, 0) })),
    mapping: { branch: m.branchCode, district: E.geoOf(m.branchCode).districtName, salesRep: m.sr, registeredBy: m.registration.registeredBy, registeredAt: m.registration.submittedAt, approvedBy: approval?.by ?? null, approvedAt: approval?.at ?? null },
    addresses: (["home", "working", "gift"] as const).map((k) => ({ kind: k, label: k === "home" ? "Aadhaar home address" : k === "working" ? "Working location" : "Gift delivery address", address: m.addresses[k], updatedAt: m.addresses[k]?.updatedAt ?? null })),
    changes: events.filter((e) => ["profile", "address", "kyc", "registration", "restriction", "mpin"].includes(e.category)).map((e) => ({ at: e.at, field: e.action, previous: e.oldValue, updated: e.newValue, by: e.by, reason: e.remarks })),
    sourceTimestamp: state.refreshedAt,
  };
}

/* ======================= Scan & QR reporting ======================= */

export function scanReport(uid: string, f: E.ScanFilter = {}) {
  if (!can(uid, "scan-reports", "view")) return { ...NO(need("scan-reports", "View")), rows: [], preciseLocation: false, salespersonField: "restricted" as const };
  const sens = can(uid, "scan-reports", "view_sensitive");
  const rows = E.filterScans(context(), f, scopeIds(uid, "scan-reports")).map((s) => ({
    ...s,
    location: sens ? s.location : { lat: null, lng: null, label: `${E.geoOf(s.branchCode).districtName}, ${E.geoOf(s.branchCode).stateName}`, source: "District only (precise location needs Scan reports: View sensitive)" },
    salesperson: sens ? s.salesperson : null,
  }));
  return { ...OK(), rows, preciseLocation: sens, salespersonField: sens ? state.config.salespersonField : ("restricted" as const) };
}
export function scanDetail(uid: string, id: string) {
  const r = scanReport(uid, {});
  if (!r.ok) return { ...r, scan: undefined };
  const s = r.rows.find((x) => x.id === id);
  if (!s) return { ...NO("Scan not found in your scope"), scan: undefined };
  const c = context();
  const ledger = s.ledgerRef ? c.lines.find((l) => l.id === s.ledgerRef) ?? null : null;
  return { ...OK(id), scan: s, ledger, validation: s.status === "success" ? "Accepted" : s.status === "pending_validation" ? "Awaiting validation" : `Rejected: ${s.failureReason}`, children: state.parentChild.filter((p) => p.childScanId === s.id) };
}
export function parentChildReport(uid: string) {
  if (!can(uid, "scan-reports", "view")) return { ...NO(need("scan-reports", "View")), rows: [], preciseLocation: false, salespersonField: "restricted" as const };
  const sens = can(uid, "scan-reports", "view_sensitive");
  const scans = new Map(context().scans.map((s) => [s.id, s]));
  return { ...OK(), detailed: sens, rows: state.parentChild.map((p) => { const s = p.childScanId ? scans.get(p.childScanId) : undefined; return { ...p, scan: s && scopeIds(uid, "scan-reports").has(s.memberId) ? { memberId: sens ? s.memberId : null, at: s.at, location: sens ? s.location.label : `${E.geoOf(s.branchCode).districtName}`, branch: s.branchCode, status: s.status } : null }; }) };
}

/* ======================= Finance reports ======================= */

export function pointsAgeingReport(uid: string, asOn: string, f: { branch?: string; district?: string; role?: string; categoryId?: string; programme?: string }) {
  if (!can(uid, "finance-reports", "view")) return { ...NO(need("finance-reports", "View")), rows: [], buckets: [] as string[], asOn, check: [], method: "" };
  const ids = scopeIds(uid, "finance-reports");
  const members = mem().members.filter((m) => ids.has(m.id) && (!f.branch || m.branchCode === f.branch) && (!f.district || E.geoOf(m.branchCode).district === f.district) && (!f.role || m.memberType === f.role) && (!f.programme || m.programme === f.programme));
  const r = E.pointsAgeing(context(), members, asOn, f.categoryId || null);
  const cats = context().ms;
  return { ...OK(), asOn, buckets: r.buckets, rows: r.rows.map((x) => ({ ...x, categoryName: x.category === "none" ? "Not product-linked" : E.categoryName(cats, x.category) })), check: r.check, method: "Oldest earned points are treated as spent first (development method, OP-AGE1). No provision is calculated" };
}
const panRef = (memberId: string) => mem().documents.find((d) => d.memberId === memberId && d.type === "pan" && d.status === "approved")?.maskedId ?? null;
export const maskPan = (p: string | null) => (p ? `••••••${p.slice(-4)}` : null);
export function tdsLiabilityReport(uid: string, m: string, f: { role?: string; branch?: string; programme?: string }, unmasked = false) {
  if (!can(uid, "finance-reports", "view")) return { ...NO(need("finance-reports", "View")), rows: [] };
  if (unmasked && !can(uid, "finance-reports", "view_sensitive")) return { ...NO("Unmasked PAN needs Finance reports: View sensitive"), rows: [] };
  const ids = scopeIds(uid, "finance-reports");
  const members = mem().members.filter((x) => ids.has(x.id) && (!f.role || x.memberType === f.role) && (!f.branch || x.branchCode === f.branch) && (!f.programme || x.programme === f.programme));
  const rows = E.tdsMonthly(context(), members, m, (id) => (unmasked ? panRef(id) : maskPan(panRef(id))));
  if (unmasked) commit(audited(state, uid, "pan_unmasked_view", `TDS ${m}`, `${rows.length} rows`, "TDS monthly liability with PAN reference", true));
  return { ...OK(), month: m, fy: E.fyOf(`${m}-01`), rows, unmasked, note: "PAN is held by the KYC / tax service; the portal stores only the masked reference. Taxable value is not supplied by the Finance service (OP-TAXV). DD TDS model not configured" };
}

/* ======================= Programme and sales executive reporting ======================= */

export function programmeReport(uid: string, programme: string, f: E.Filters) {
  const g = guard(uid);
  if (g) return { ...g, denied: true as const };
  const c = context();
  const members = scopedMembers(uid, "analytics", { ...f, programmes: [programme as never] });
  const ids = new Set(members.map((m) => m.id));
  const scans = c.scans.filter((s) => ids.has(s.memberId) && E.day(s.at) >= f.from && E.day(s.at) <= f.to);
  const lines = E.filterLines(c, { from: f.from, to: f.to }, ids);
  return {
    ...OK(),
    members: members.length,
    byStatus: groupCount(members, (m) => m.status),
    points: E.pointsFlow(lines),
    scanOut: E.scanSuccess(scans, "scan_out"),
    scanIn: E.scanSuccess(scans, "scan_in"),
    byCategory: E.pointsBy(lines, (l) => E.categoryName(c.ms, E.categoryOf(c.ms, l.skuCode, l.categoryId))),
    schemes: c.ss.schemes.map((s) => E.schemeScorecard(c, s.id)).filter((s) => s.programmes.includes(programme)),
    topMembers: members.map((m) => ({ id: m.id, name: m.name, issued: E.pointsFlow(lines.filter((l) => l.memberId === m.id)).issued })).sort((a, b) => b.issued - a.issued).slice(0, 10),
    ddSpecific: programme === "DD" ? { status: "business_confirmation_required" as const, decision: "OP-43", slabSchemes: c.ss.schemes.filter((s) => s.versions.some((v) => v.config.basic.programmes.includes("DD") && v.config.slab.enabled)).map((s) => s.id) } : null,
  };
}
/** Members mapped to a sales executive (Member Management SR mapping), limited to the viewer's scope. */
export function salesExecMembers(uid: string, srUserId: string) {
  if (!can(uid, "member-analytics", "view")) return { ...NO(need("member-analytics", "View")), rows: [] };
  const ids = scopeIds(uid, "member-analytics");
  const c = context();
  const rows = mem().members.filter((m) => ids.has(m.id) && (m.sr ?? "").includes(`(${srUserId})`)).map((m) => {
    const b = memberBalances(c.ws, c.ss, c.mem, m.id);
    const sc = c.scans.filter((s) => s.memberId === m.id);
    return { ...memberRow(m), status: m.status, kyc: mem().documents.filter((d) => d.memberId === m.id && d.status === "approved").length, scans: sc.length, scanOutOk: sc.filter((s) => s.type === "scan_out" && s.status === "success").length, issued: b.lifetime, redeemed: b.redeemed, redemptions: c.ws.redemptions.filter((r) => r.memberId === m.id).length };
  });
  return { ...OK(), rows };
}

/* ======================= Report execution, export and history ======================= */

const reportById = (id: string) => REPORTS.find((r) => r.id === id);
const checksum = (x: unknown) => { const s = JSON.stringify(x); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return `CHK-${(h >>> 0).toString(16).toUpperCase()}`; };
export function executeReport(uid: string, reportId: string, filters: FilterSnapshot, rows: unknown[]): Res & { executionId?: string } {
  const r = reportById(reportId);
  if (!r) return NO("Report not found");
  if (!canKey(uid, r.permission) || !can(uid, "reports", "execute")) return NO(`You need ${r.permission.replace(":", ": ")} and Reports: Execute`);
  const id = nextId("REX", state.executions, 6);
  commit(audited({ ...state, executions: [...state.executions, { id, reportId, by: uid, at: now(), filters, scope: scopeLabel(uid, r.permission.split(":")[0]), rows: rows.length, sourceTimestamp: state.refreshedAt, kpiVersions: Object.fromEntries(state.kpis.map((k) => [k.id, k.version])), checksum: checksum(rows) }] }, uid, "report_executed", reportId, `${rows.length} rows`, JSON.stringify(filters), r.sensitive));
  return { ...OK(id), executionId: id };
}
const EXPORT_PERM: Record<string, string> = { finance: "finance-reports:export", scanning: "scan-reports:export" };
export function exportReport(uid: string, reportId: string, format: ExportRecord["format"], filters: FilterSnapshot, rows: number, opts: { unmasked?: boolean; executionId?: string; containsMembers?: boolean } = {}): Res & { record?: ExportRecord } {
  const r = reportById(reportId);
  if (!r) return NO("Report not found");
  if (!r.formats.includes(format)) return NO(`${r.name} does not export to ${format.toUpperCase()}`);
  const dashboard = format === "pdf" || format === "png";
  const perms = dashboard ? ["analytics:export", r.permission] : ["reports:export", r.permission, ...(EXPORT_PERM[r.category] ? [EXPORT_PERM[r.category]] : []), ...(reportId === "RPT-M360" ? ["member-analytics:export"] : [])];
  const missing = perms.filter((p) => !canKey(uid, p));
  const unmaskedDenied = opts.unmasked && !can(uid, "finance-reports", "view_sensitive");
  const id = nextId("EXP", state.exports, 6);
  const rec: ExportRecord = { id, reportId, executionId: opts.executionId ?? null, format, by: uid, at: now(), filters, rows, sensitive: r.sensitive || !!opts.containsMembers, unmasked: !!opts.unmasked && !unmaskedDenied, status: missing.length || unmaskedDenied ? "refused" : "generated", reason: missing.length ? `Missing ${missing.join(", ")}` : unmaskedDenied ? "Unmasked export needs Finance reports: View sensitive" : null, sourceTimestamp: state.refreshedAt };
  commit(audited({ ...state, exports: [...state.exports, rec] }, uid, rec.status === "generated" ? "report_exported" : "export_refused", reportId, `${format} · ${rows} rows${rec.unmasked ? " · unmasked" : ""}`, JSON.stringify(filters), rec.sensitive || rec.unmasked));
  return rec.status === "generated" ? { ...OK(id), record: rec } : { ...NO(rec.reason!), record: rec };
}
export function exportHistory(uid: string) {
  if (!can(uid, "reports", "view")) return [];
  const all = can(uid, "reports", "manage");
  return state.exports.filter((e) => all || e.by === uid);
}

/* ======================= Scheduled reports ======================= */

const nextRun = (s: Pick<ReportSchedule, "frequency" | "day" | "time" | "startDate">, from: string) => {
  let d = E.day(from) < s.startDate ? s.startDate : E.addDays(E.day(from), 1);
  if (s.frequency === "weekly") { const want = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(s.day ?? "Monday"); while ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7 !== want) d = E.addDays(d, 1); }
  if (s.frequency === "monthly") d = `${E.nextMonth(E.month(d))}-01`;
  return `${d}T${s.time}`;
};
/** A recipient may receive a report only if they could open it themselves. */
export function recipientCheck(reportId: string, recipient: string) {
  const r = reportById(reportId);
  const u = acc().users.find((x) => x.id === recipient);
  if (!r || !u) return "Unknown recipient";
  if (u.accountStatus !== "active") return "Account not active";
  if (!canKey(recipient, r.permission)) return `Not permitted to view ${r.name}`;
  return null;
}
export function createSchedule(uid: string, p: Omit<ReportSchedule, "id" | "status" | "createdBy" | "createdAt" | "lastRun" | "nextRun" | "lastStatus" | "lastFailure">): Res {
  const r = reportById(p.reportId);
  if (!r) return NO("Report not found");
  if (!can(uid, "reports", "create")) return NO(need("reports", "Create (schedule)"));
  if (!canKey(uid, r.permission)) return NO(`You cannot schedule a report you cannot view (${r.permission})`);
  if (r.status === "proposed" || r.status === "linked") return NO("Only reports built in this module can be scheduled");
  if (!p.recipients.length) return NO("Choose recipients: there are no default recipients (OP-ALERT1)");
  const bad = p.recipients.map((x) => ({ x, why: recipientCheck(p.reportId, x) })).filter((x) => x.why);
  if (bad.length) return NO(...bad.map((b) => `${b.x}: ${b.why}`));
  if (!/^\d{2}:\d{2}$/.test(p.time)) return NO("Enter the time as HH:MM");
  const id = nextId("SCH-RPT", state.schedules);
  const s: ReportSchedule = { ...p, id, status: "active", createdBy: uid, createdAt: now(), lastRun: null, nextRun: nextRun(p, now()), lastStatus: null, lastFailure: null };
  commit(audited({ ...state, schedules: [...state.schedules, s] }, uid, "schedule_created", id, `${p.frequency} ${p.reportId} → ${p.recipients.join(", ")}`, "", r.sensitive));
  return OK(id, ["Recipients receive data in their own scope only"]);
}
export function setScheduleStatus(uid: string, id: string, status: "active" | "paused" | "ended"): Res {
  const s = state.schedules.find((x) => x.id === id);
  if (!s) return NO("Schedule not found");
  if (!(can(uid, "reports", "manage") || (s.createdBy === uid && can(uid, "reports", "create")))) return NO(need("reports", "Manage"));
  commit(audited({ ...state, schedules: state.schedules.map((x) => (x.id === id ? { ...x, status } : x)) }, uid, `schedule_${status}`, id, status, "", false, s.status));
  return OK(id);
}
/** Runs one slot. Idempotent per schedule + slot; each recipient is re-checked and gets their own scope. */
export function runSchedule(actor: string, id: string, slot: string, rowsFor: (recipient: string) => number): Res & { runId?: string } {
  const s = state.schedules.find((x) => x.id === id);
  if (!s) return NO("Schedule not found");
  if (actor !== "SYSTEM" && !can(actor, "reports", "manage") && s.createdBy !== actor) return NO(need("reports", "Manage"));
  if (s.status !== "active") return NO(`Schedule is ${s.status}`);
  const runId = nextId("SRN", state.runs, 6);
  if (state.runs.some((r) => r.scheduleId === id && r.slot === slot && r.status !== "duplicate_skipped")) {
    commit(audited({ ...state, runs: [...state.runs, { id: runId, scheduleId: id, slot, at: now(), rows: 0, deliveries: [], status: "duplicate_skipped" }] }, actor, "schedule_duplicate_skipped", id, slot, "Slot already delivered"));
    return NO(`Slot ${slot} already ran: duplicate execution skipped`);
  }
  const r = reportById(s.reportId)!;
  const deliveries = s.recipients.map((rc) => {
    const why = recipientCheck(s.reportId, rc);
    if (why) return { recipient: rc, status: (why === "Account not active" ? "failed" : "refused_scope") as "failed" | "refused_scope", commId: null, reason: why };
    const n = rowsFor(rc);
    const c = sendStaffAlert({ id: `RPT-${id}-${slot}-${rc}`, title: `Scheduled report: ${r.name}`, body: `${s.name} (${s.frequency}, ${s.dateRange}). ${n} rows in your data scope, ${s.format.toUpperCase()}. Development / demo data`, recipients: [rc], sourceModule: "Reports & analytics", sourceRef: `${id}/${slot}`, at: now() });
    return { recipient: rc, status: "delivered" as const, commId: c.commId, reason: null };
  });
  const ok = deliveries.filter((d) => d.status === "delivered").length;
  const status = ok === deliveries.length ? "delivered" : ok ? "partially_delivered" : "failed";
  const fail = deliveries.find((d) => d.reason)?.reason ?? null;
  commit(audited({ ...state, runs: [...state.runs, { id: runId, scheduleId: id, slot, at: now(), rows: deliveries.length, deliveries, status }], schedules: state.schedules.map((x) => (x.id === id ? { ...x, lastRun: now(), nextRun: nextRun(x, slot), lastStatus: status, lastFailure: fail } : x)) }, actor, "schedule_run", id, `${slot}: ${status}`, ""));
  return { ...OK(runId), runId };
}

/* ======================= KPI governance (WF-038) ======================= */

export function requestKpiChange(uid: string, kpiId: string, kind: KpiChangeRequest["kind"], proposed: KpiChangeRequest["proposed"], reason: string): Res {
  const k = state.kpis.find((x) => x.id === kpiId);
  if (!k) return NO("KPI not found");
  if (!can(uid, "kpi-governance", "submit")) return NO(need("kpi-governance", "Submit (definition or target change)"));
  if (!reason.trim()) return NO("Record the business decision or reason");
  if (!proposed.effectiveFrom) return NO("Choose the effective date");
  if (kind === "definition" && !proposed.definition?.trim()) return NO("Enter the confirmed definition");
  if (kind === "target" && (proposed.targetValue == null || !Number.isFinite(proposed.targetValue) || !proposed.targetDirection)) return NO("Enter the target value and whether it is a minimum or a maximum");
  if (state.kpiChanges.some((c) => c.kpiId === kpiId && c.kind === kind && c.status === "pending_approval")) return NO("A change to this KPI is already awaiting approval");
  const id = nextId("KCR", state.kpiChanges);
  const before = kind === "definition" ? k.approvedDefinition ?? k.sowDefinition : k.target.value == null ? "Not set" : String(k.target.value);
  const after = kind === "definition" ? proposed.definition! : `${proposed.targetDirection === "min" ? "≥" : "≤"} ${proposed.targetValue}`;
  const q = createRequest(uid, { requestType: kind === "definition" ? "kpi_definition_change" : "kpi_target_change", title: `${k.name}: ${kind} change`, entityRef: id, programme: null, location: null, amount: null, fields: [{ key: kind, label: kind === "definition" ? "Definition" : "Target", kind: "text", before, after, material: true }], purpose: "KPI governance (OP-KPI1)", reason: reason.trim(), justification: `Effective ${proposed.effectiveFrom}`, attachments: [], impact: { operationalImpact: `${k.name} in every dashboard and report` } }, true);
  if (!q.ok) return q;
  commit(audited({ ...state, kpiChanges: [...state.kpiChanges, { id, kpiId, kind, proposed, reason: reason.trim(), requestedBy: uid, at: now(), approvalRequestId: q.id ?? null, status: "pending_approval" }] }, uid, `kpi_${kind}_change_requested`, kpiId, after, reason, false, before));
  return OK(id, ["Applied only after approval (WF-038)"]);
}
function execKpi(r: ApprovalRequest) {
  const c = state.kpiChanges.find((x) => x.id === r.entityRef);
  if (!c) return { ok: false, message: `Not executed: no KPI change ${r.entityRef}` };
  if (c.status === "applied") return { ok: true, message: "Already applied (idempotent)" };
  const k = state.kpis.find((x) => x.id === c.kpiId)!;
  const version = k.version + 1;
  const next = c.kind === "definition"
    ? { ...k, approvedDefinition: c.proposed.definition!, formula: c.proposed.formula?.trim() || k.formula, status: "confirmed" as const, effectiveFrom: c.proposed.effectiveFrom, version, versions: [...k.versions, { version, definition: c.proposed.definition!, formula: c.proposed.formula?.trim() || k.formula, numerator: k.numerator, denominator: k.denominator, period: k.period, status: "confirmed" as const, effectiveFrom: c.proposed.effectiveFrom, decisionRef: "OP-KPI1", approvalRequestId: r.id, changedBy: c.requestedBy, changedAt: now(), note: c.reason }], updatedBy: c.requestedBy, updatedAt: now() }
    : { ...k, target: { value: c.proposed.targetValue ?? null, direction: c.proposed.targetDirection ?? null, status: "confirmed" as const, effectiveFrom: c.proposed.effectiveFrom, approvalRequestId: r.id }, updatedBy: c.requestedBy, updatedAt: now() };
  commit(audited({ ...state, kpis: state.kpis.map((x) => (x.id === k.id ? next : x)), kpiChanges: state.kpiChanges.map((x) => (x.id === c.id ? { ...x, status: "applied" } : x)) }, "SYSTEM", `kpi_${c.kind}_confirmed`, k.id, c.kind === "definition" ? c.proposed.definition! : String(c.proposed.targetValue), `Approved (${r.id})`));
  return { ok: true, message: `${k.name} ${c.kind} recorded as confirmed from ${c.proposed.effectiveFrom}` };
}
registerExecutionHandler("kpi-governance", execKpi);
approvalStore.subscribe(() => {
  const reqs = approvalStore.get().requests;
  const back = (id: string | null) => ["rejected", "returned", "withdrawn"].includes(reqs.find((r) => r.id === id)?.status ?? "");
  if (state.kpiChanges.some((c) => c.status === "pending_approval" && back(c.approvalRequestId))) commit({ ...state, kpiChanges: state.kpiChanges.map((c) => (c.status === "pending_approval" && back(c.approvalRequestId) ? { ...c, status: "rejected" } : c)) });
});

/* ======================= Threshold alerts (OP-ALERT1) ======================= */

export function saveThreshold(uid: string, p: Omit<ThresholdPolicy, "id" | "status" | "confirmation" | "version" | "history" | "approvalRequestId" | "createdBy"> & { id?: string }): Res {
  if (!can(uid, "kpi-governance", "manage")) return NO(need("kpi-governance", "Manage (threshold alerts)"));
  if (!state.kpis.some((k) => k.id === p.kpiId)) return NO("KPI not found");
  if (p.value != null && !Number.isFinite(p.value)) return NO("Enter a number");
  if (p.recipients.some((x) => !acc().users.some((u) => u.id === x))) return NO("Unknown recipient");
  const prev = p.id ? state.thresholds.find((t) => t.id === p.id) : undefined;
  const id = prev?.id ?? nextId("THR", state.thresholds);
  const t: ThresholdPolicy = { ...p, id, status: "draft", confirmation: "pending_business_confirmation", version: (prev?.version ?? 0) + 1, history: [...(prev?.history ?? []), { at: now(), by: uid, change: `${p.condition} ${p.value ?? "(no value)"} · ${p.period}` }], approvalRequestId: null, createdBy: prev?.createdBy ?? uid };
  commit(audited({ ...state, thresholds: prev ? state.thresholds.map((x) => (x.id === id ? t : x)) : [...state.thresholds, t] }, uid, "threshold_saved", id, `${p.kpiId} ${p.condition} ${p.value}`, "Draft (OP-ALERT1)"));
  return OK(id, ["Saved as a draft: thresholds are not confirmed (OP-ALERT1)"]);
}
export function activateThreshold(uid: string, id: string): Res {
  const t = state.thresholds.find((x) => x.id === id);
  if (!t) return NO("Threshold not found");
  if (!can(uid, "kpi-governance", "manage")) return NO(need("kpi-governance", "Manage"));
  if (state.decisions.find((d) => d.id === "OP-ALERT1")?.status !== "confirmed") return NO("OP-ALERT1 is open: thresholds and recipients are not confirmed, so the alert cannot be activated");
  if (t.value == null || !t.recipients.length) return NO("A confirmed value and recipients are required");
  commit(audited({ ...state, thresholds: state.thresholds.map((x) => (x.id === id ? { ...x, status: "active", confirmation: "confirmed" } : x)) }, uid, "threshold_activated", id, "active", "OP-ALERT1 confirmed"));
  return OK(id);
}
/** Evaluates a threshold against the shared KPI value. Draft thresholds record the result but never dispatch. */
export function evaluateThreshold(uid: string, id: string): Res & { triggered?: boolean; actual?: number | null } {
  const t = state.thresholds.find((x) => x.id === id);
  if (!t) return NO("Threshold not found");
  if (!can(uid, "kpi-governance", "view")) return NO(need("kpi-governance", "View"));
  const v = kpiValues("SYSTEM" === uid ? "USR-1001" : uid, E.day(now()), { programmes: t.scope.programmes })[t.kpiId]?.value ?? null;
  if (v == null || t.value == null) return { ...OK(id, ["KPI value or threshold not available: nothing evaluated"]), triggered: false, actual: v };
  const triggered = t.condition === "below" ? v < t.value : t.condition === "above" ? v > t.value : false;
  if (!triggered) return { ...OK(id), triggered, actual: v };
  const live = t.status === "active";
  const aid = nextId("KAL", state.alerts);
  const comm = live ? sendStaffAlert({ id: `KPI-${aid}`, title: `KPI alert: ${t.kpiId}`, body: `Actual ${v.toFixed(1)} vs threshold ${t.value} (${t.period})`, recipients: t.recipients, sourceModule: "Reports & analytics", sourceRef: aid, at: now() }) : null;
  commit(audited({ ...state, alerts: [...state.alerts, { id: aid, policyId: id, kpiId: t.kpiId, actual: v, threshold: t.value, period: t.period, scope: t.scope.programmes.join(", ") || "All programmes", at: now(), mode: live ? "dispatched" : "evaluation_only", recipients: live ? t.recipients : [], commId: comm?.commId ?? null, notification: live ? "sent" : "not_sent", resolution: "open" }] }, uid, live ? "kpi_alert_dispatched" : "kpi_alert_evaluated", aid, String(v), live ? "Active threshold" : "Draft threshold: evaluation only, not dispatched"));
  return { ...OK(aid, live ? [] : ["Draft threshold: the breach is recorded but no alert was sent (OP-ALERT1)"]), triggered, actual: v };
}

/* ======================= Configuration and decisions ======================= */

export function setAnalyticsConfig(uid: string, key: "churnedDays" | "slowMovingDays", value: number | null): Res {
  if (!can(uid, "kpi-governance", "manage")) return NO(need("kpi-governance", "Manage"));
  if (value != null && (!Number.isInteger(value) || value < 1)) return NO("Enter a whole number of days");
  commit(audited({ ...state, config: { ...state.config, [key]: value } }, uid, `${key}_changed`, key === "churnedDays" ? "OP-SEG1" : "OP-SLOW1", value == null ? null : String(value), "Development setting (decision open)", false, state.config[key] == null ? null : String(state.config[key])));
  return OK(undefined, ["Development setting: the business decision stays open"]);
}
export function updateAnalyticsDecision(uid: string, id: string, status: AnalyticsState["decisions"][number]["status"], notes: string): Res {
  if (!can(uid, "kpi-governance", "manage")) return NO(need("kpi-governance", "Manage"));
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (status === "confirmed" && !notes.trim()) return NO("Record the confirmation notes");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, status, notes } : x)) }, uid, `decision_${status}`, id, notes, d.description, false, d.status));
  return OK(id);
}

/* ======================= Reconciliation ======================= */

/** Analytics totals against each authoritative source. A difference is reported, never forced to match. */
export function reconciliation(uid: string) {
  if (!can(uid, "analytics", "view")) return [];
  const c = context();
  const ws = c.ws;
  const all = new Set(c.members.map((m) => m.id));
  const flow = E.pointsFlow(c.lines);
  const sumMembers = (k: "lifetime" | "redeemed" | "scheme" | "available") => c.members.reduce((n, m) => n + memberBalances(ws, c.ss, c.mem, m.id)[k], 0);
  const schemePosted = c.ss.accruals.filter((a) => (a.result === "credited" || a.result === "accrued") && a.bucket === "unsettled").reduce((n, a) => n + a.points, 0);
  const tdsAnalytics = E.tdsMonthlyAll(c);
  const tdsFinance = ws.redemptions.filter((r) => r.tds.status === "recorded" && r.stage !== "reversed" && r.stage !== "cancelled").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0);
  const so = E.scanSuccess(c.scans, "scan_out");
  const credits = c.lines.filter((l) => (l.type === "scan_credit" || l.type === "base_credit") && l.bucket === "available" && l.status === "completed").length;
  const rows = [
    { id: "points-issued", check: "Points issued vs Wallet member balances (lifetime)", analytics: flow.issued, source: sumMembers("lifetime"), sourceName: "Wallet & Ledger" },
    { id: "points-redeemed", check: "Points redeemed vs Wallet redeemed bucket", analytics: flow.redeemed, source: sumMembers("redeemed"), sourceName: "Wallet & Ledger" },
    { id: "scheme-points", check: "Scheme points accrued vs scheme accruals (unsettled bucket)", analytics: flow.accrued, source: schemePosted, sourceName: "Scheme & Incentive Management" },
    { id: "tds", check: "TDS on redemption (₹) vs recorded redemption TDS", analytics: tdsAnalytics, source: tdsFinance, sourceName: "Finance / TDS" },
    { id: "scan-success", check: "Successful Scan-Out vs Wallet scan and base credits", analytics: so.successful - c.scans.filter((s) => s.type === "scan_out" && s.status === "success" && !s.ledgerRef).length, source: credits, sourceName: "Wallet & Ledger" },
    { id: "kpi-dau", check: "DAU on the dashboard vs DAU in the KPI dictionary", analytics: E.kpiValues(c, all, E.day(c.now))["KPI-DAU"].value ?? 0, source: E.activeOnDay(activityMap(), all, E.day(c.now)), sourceName: "KPI dictionary" },
  ];
  return rows.map((r) => ({ ...r, difference: r.analytics - r.source, status: r.analytics === r.source ? ("matched" as const) : ("exception" as const) }));
}

/** Scan-service record feed (simulation): appends one scan record, once per scan ID. */
export function recordScan(rec: AnalyticsState["scans"][number]): Res {
  if (state.scans.some((x) => x.id === rec.id)) return OK(rec.id, ["Scan already recorded"]);
  commit({ ...state, scans: [...state.scans, rec] });
  return OK(rec.id);
}
