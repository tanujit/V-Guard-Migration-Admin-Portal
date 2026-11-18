/**
 * ANALYTICS ENGINE — pure functions (Phase 12).
 * Every panel, report, export, alert and test calls these functions, so one measure has one
 * calculation. Inputs are the authoritative module states; nothing here recalculates a business rule
 * that another module owns (points use the wallet's own balance function, scheme figures use the
 * scheme engine, tiers use the Tier service snapshots). A measure without its inputs returns null,
 * never zero.
 */
import { findBranch } from "@/config/geography";
import { CHANNEL_LABEL, fyBuckets, fyLabel, type DatePreset } from "@/config/analyticsCatalogue";
import { LEDGER_TYPE } from "@/config/walletCatalogue";
import { balancesFrom } from "@/features/wallet/engine";
import { displayVersion, eligiblePopulation, exposureOf, projectedLiability } from "@/features/schemes/engine";
import type { MemberState } from "@/features/members/engine";
import type { AuthEvent } from "@/types/ops";
import type { CommsState } from "@/types/comms";
import type { GiftState } from "@/types/gifts";
import type { MasterState } from "@/features/masters/engine";
import type { Member, ProgrammeCode } from "@/types/members";
import type { RiskState } from "@/types/risk";
import type { SchemeState } from "@/types/schemes";
import type { LedgerEntry, WalletState } from "@/types/wallet";
import type { ScanRecord } from "@/types/analytics";

/* ======================= Context, filters and dates ======================= */

export interface Ctx {
  mem: MemberState;
  members: Member[];
  lines: LedgerEntry[];
  ws: WalletState;
  ss: SchemeState;
  ms: MasterState;
  rs: RiskState;
  cs: CommsState;
  gs: GiftState;
  auth: AuthEvent[];
  scans: ScanRecord[];
  now: string;
  dormancyDays: number | null;
  churnedDays: number | null;
  slowMovingDays: number | null;
}
export interface Filters {
  from: string;
  to: string;
  programmes: ProgrammeCode[];
  state: string | null;
  district: string | null;
  branch: string | null;
  memberType: string | null;
  categoryId: string | null;
  schemeId: string | null;
}
export const day = (at: string) => at.slice(0, 10);
export const month = (at: string) => at.slice(0, 7);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400_000);
export const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
export const monthEnd = (m: string) => addDays(`${m === "9999-12" ? m : nextMonth(m)}-01`, -1);
export const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
/** Zero denominator gives null (shown as Not available), never 0 or infinity. */
export const ratio = (n: number | null, d: number | null) => (n == null || d == null || d === 0 ? null : n / d);

export function dateRange(preset: DatePreset, now: string, custom?: { from: string; to: string }): { from: string; to: string; label: string } {
  const t = day(now);
  const m = month(now);
  switch (preset) {
    case "today": return { from: t, to: t, label: "Today" };
    case "yesterday": return { from: addDays(t, -1), to: addDays(t, -1), label: "Yesterday" };
    case "7d": return { from: addDays(t, -6), to: t, label: "Last 7 days" };
    case "30d": return { from: addDays(t, -29), to: t, label: "Last 30 days" };
    case "month": return { from: `${m}-01`, to: t, label: "Current month" };
    case "prev_month": return { from: `${prevMonth(m)}-01`, to: monthEnd(prevMonth(m)), label: "Previous month" };
    case "quarter": { const mo = Number(m.slice(5)); const q0 = mo - ((mo - 1) % 3); return { from: `${m.slice(0, 4)}-${String(q0).padStart(2, "0")}-01`, to: t, label: "Current quarter" }; }
    case "fy": { const s = Number(fyLabel(t).slice(2, 6)); return { from: `${s}-04-01`, to: t, label: fyLabel(t) }; }
    default: return { from: custom?.from ?? addDays(t, -29), to: custom?.to ?? t, label: "Custom range" };
  }
}
export function comparisonRange(r: { from: string; to: string }, mode: "previous" | "last_year" | "none") {
  if (mode === "none") return null;
  if (mode === "last_year") return { from: `${Number(r.from.slice(0, 4)) - 1}${r.from.slice(4)}`, to: `${Number(r.to.slice(0, 4)) - 1}${r.to.slice(4)}` };
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export const geoOf = (branchCode: string) => {
  const g = findBranch(branchCode);
  return { state: g?.state.code ?? "—", stateName: g?.state.name ?? "Unknown", district: g?.district.code ?? "—", districtName: g?.district.name ?? "Unknown", branchName: g?.branch.name ?? branchCode };
};
export function memberMatches(m: Member, f: Partial<Filters>) {
  if (f.programmes?.length && !f.programmes.includes(m.programme)) return false;
  if (f.memberType && m.memberType !== f.memberType) return false;
  if (f.branch && m.branchCode !== f.branch) return false;
  if (f.state || f.district) {
    const g = geoOf(m.branchCode);
    if (f.state && g.state !== f.state) return false;
    if (f.district && g.district !== f.district) return false;
  }
  return true;
}
const inRange = (at: string, f: { from: string; to: string }) => day(at) >= f.from && day(at) <= f.to;
export const joinDate = (m: Member) => day(m.registration.submittedAt || m.createdAt);

/** Product category of a ledger line or scan: the line's own category, else the SKU master. */
export function categoryOf(ms: MasterState, skuCodeOrId: string | null | undefined, categoryId?: string | null) {
  if (categoryId) return categoryId;
  if (!skuCodeOrId) return null;
  const sku = ms.skus.find((s) => s.code === skuCodeOrId || s.id === skuCodeOrId);
  return sku ? ms.products.find((p) => p.id === sku.productId)?.categoryId ?? null : null;
}
export const categoryName = (ms: MasterState, id: string | null) => (id ? ms.categories.find((c) => c.id === id)?.name ?? id : "Not product-linked");

/* ======================= Activity (DAU / MAU / 90-day / churn) ======================= */

/**
 * App actions per member per day. One action each: a scan attempt, a redemption request, a successful
 * login. System and background events (bonuses, settlements, kitty postings) are not member actions.
 */
export function activity(ctx: Ctx): Map<string, Map<string, number>> {
  const a = new Map<string, Map<string, number>>();
  const add = (id: string, at: string) => {
    const d = day(at);
    const mm = a.get(id) ?? a.set(id, new Map()).get(id)!;
    mm.set(d, (mm.get(d) ?? 0) + 1);
  };
  ctx.scans.forEach((s) => add(s.memberId, s.at));
  ctx.ws.redemptions.forEach((r) => add(r.memberId, r.createdAt));
  ctx.auth.filter((e) => e.result === "success").forEach((e) => add(e.memberId, e.at));
  return a;
}
/** SOW 13.1: more than one action in a day. */
export const QUALIFYING = 2;
export function activeOnDay(act: Map<string, Map<string, number>>, memberIds: Set<string>, d: string) {
  let n = 0;
  memberIds.forEach((id) => { if ((act.get(id)?.get(d) ?? 0) >= QUALIFYING) n++; });
  return n;
}
export function activeIn(act: Map<string, Map<string, number>>, memberIds: Set<string>, from: string, to: string) {
  const out = new Set<string>();
  memberIds.forEach((id) => { for (const [d, n] of act.get(id) ?? []) if (d >= from && d <= to && n >= QUALIFYING) { out.add(id); break; } });
  return out;
}
/** 90-day active: more than one action within the 90 days (summed across days). */
export function active90(act: Map<string, Map<string, number>>, memberIds: Set<string>, asOn: string) {
  const from = addDays(asOn, -89);
  const out = new Set<string>();
  memberIds.forEach((id) => {
    let n = 0;
    for (const [d, c] of act.get(id) ?? []) if (d >= from && d <= day(asOn)) n += c;
    if (n >= QUALIFYING) out.add(id);
  });
  return out;
}
export const mauSet = (act: Map<string, Map<string, number>>, ids: Set<string>, m: string) => activeIn(act, ids, `${m}-01`, monthEnd(m));
export function churn30(act: Map<string, Map<string, number>>, ids: Set<string>, m: string, asOn: string) {
  const prev = mauSet(act, ids, prevMonth(m));
  const cur = mauSet(act, ids, m);
  const churned = [...prev].filter((id) => !cur.has(id));
  return { month: m, previousActive: prev.size, churned: churned.length, rate: ratio(churned.length, prev.size), incomplete: monthEnd(m) > day(asOn), churnedIds: churned };
}
export function dauSeries(act: Map<string, Map<string, number>>, ids: Set<string>, from: string, to: string) {
  const out: { key: string; label: string; dau: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, label: d.slice(5), dau: activeOnDay(act, ids, d) });
  return out;
}

/* ======================= Points flow (Wallet ledger) ======================= */

export interface PointsFlow {
  issued: number;
  redeemed: number;
  accrued: number;
  credited: number;
  unsettled: number;
  settled: number;
  available: number;
  base: number;
  scheme: number;
  bonus: number;
}
const BASE_TYPES = new Set(["scan_credit", "base_credit"]);
const BONUS_TYPES = new Set(["welcome_bonus", "other_bonus"]);
/** Points stages from the wallet's own balance function; stages overlap and are never added together. */
export function pointsFlow(lines: LedgerEntry[]): PointsFlow {
  const b = balancesFrom(lines);
  const done = lines.filter((l) => l.status === "completed");
  const pos = (f: (l: LedgerEntry) => boolean) => done.filter((l) => l.points > 0 && f(l)).reduce((n, l) => n + (l.gross ?? l.points), 0);
  return {
    issued: b.lifetime,
    redeemed: b.redeemed,
    accrued: pos((l) => l.type === "scheme_accrual"),
    credited: pos((l) => l.bucket === "available" && !!LEDGER_TYPE[l.type].earning),
    unsettled: b.scheme,
    settled: pos((l) => l.type === "settlement_release" && l.bucket === "available"),
    available: b.available,
    base: pos((l) => BASE_TYPES.has(l.type)),
    scheme: pos((l) => l.type === "scheme_accrual"),
    bonus: pos((l) => BONUS_TYPES.has(l.type)),
  };
}
export function filterLines(ctx: Ctx, f: Partial<Filters>, memberIds: Set<string>) {
  return ctx.lines.filter((l) => memberIds.has(l.memberId) && (!f.from || inRange(l.at, f as Filters)) && (!f.schemeId || l.schemeId === f.schemeId) && (!f.categoryId || categoryOf(ctx.ms, l.skuCode, l.categoryId) === f.categoryId));
}
export function pointsBy(lines: LedgerEntry[], key: (l: LedgerEntry) => string) {
  const groups = new Map<string, LedgerEntry[]>();
  lines.forEach((l) => (groups.get(key(l)) ?? groups.set(key(l), []).get(key(l))!).push(l));
  return [...groups.entries()].map(([k, ls]) => ({ key: k, ...pointsFlow(ls) })).sort((a, b) => b.issued - a.issued);
}
export function pointsDaily(lines: LedgerEntry[]) {
  const days = [...new Set(lines.map((l) => day(l.at)))].sort();
  return days.map((d) => { const f = pointsFlow(lines.filter((l) => day(l.at) === d)); return { key: d, label: d.slice(5), issued: f.issued, redeemed: f.redeemed }; });
}
export function pointsMonthly(lines: LedgerEntry[]) {
  const ms = [...new Set(lines.map((l) => month(l.at)))].sort();
  return ms.map((m) => { const f = pointsFlow(lines.filter((l) => month(l.at) === m)); return { key: m, label: m, issued: f.issued, redeemed: f.redeemed }; });
}

/* ======================= Scans and channels ======================= */

export interface ScanFilter {
  from?: string;
  to?: string;
  programmes?: ProgrammeCode[];
  memberId?: string;
  memberName?: string;
  qr?: string;
  claimId?: string;
  type?: "scan_in" | "scan_out" | "";
  skuCode?: string;
  categoryId?: string;
  state?: string;
  district?: string;
  branch?: string;
  salesperson?: string;
  status?: string;
  channel?: string;
}
export function filterScans(ctx: Ctx, f: ScanFilter, memberIds: Set<string>) {
  return ctx.scans.filter((s) => {
    if (!memberIds.has(s.memberId)) return false;
    if (f.from && day(s.at) < f.from) return false;
    if (f.to && day(s.at) > f.to) return false;
    if (f.programmes?.length && !f.programmes.includes(s.programme)) return false;
    if (f.memberId && s.memberId !== f.memberId) return false;
    if (f.memberName && !(ctx.members.find((m) => m.id === s.memberId)?.name ?? "").toLowerCase().includes(f.memberName.toLowerCase())) return false;
    if (f.qr && !s.qrMasked.toLowerCase().includes(f.qr.toLowerCase())) return false;
    if (f.claimId && s.claimId !== f.claimId) return false;
    if (f.type && s.type !== f.type) return false;
    if (f.skuCode && s.skuCode !== f.skuCode) return false;
    if (f.categoryId && s.categoryId !== f.categoryId) return false;
    if (f.branch && s.branchCode !== f.branch) return false;
    if (f.state || f.district) { const g = geoOf(s.branchCode); if (f.state && g.state !== f.state) return false; if (f.district && g.district !== f.district) return false; }
    if (f.salesperson && s.salesperson !== f.salesperson) return false;
    if (f.status && s.status !== f.status) return false;
    if (f.channel && (f.channel === "unmapped" ? s.channel !== null : s.channel !== f.channel)) return false;
    return true;
  });
}
/** SOW 13.1 Scan Success Rate, per scan type (Scan-In and Scan-Out are never pooled). */
export function scanSuccess(scans: ScanRecord[], type: "scan_in" | "scan_out") {
  const t = scans.filter((s) => s.type === type && s.status !== "pending_validation");
  const ok = t.filter((s) => s.status === "success").length;
  return { attempts: t.length, successful: ok, rate: ratio(ok, t.length) };
}
export const channelKey = (c: ScanRecord["channel"]) => (c ? c : "unmapped");
export const channelLabel = (c: string) => (c === "unmapped" ? "Unknown / unmapped" : CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL]);
export function channelPerformance(scans: ScanRecord[]) {
  const keys = ["app", "web", "pos", "unmapped"];
  return keys.map((k) => {
    const s = scans.filter((x) => channelKey(x.channel) === k);
    const out = s.filter((x) => x.type === "scan_out" && x.status === "success");
    return { key: k, label: channelLabel(k), transactions: s.length, successful: s.filter((x) => x.status === "success").length, pointsEarned: out.reduce((n, x) => n + x.points, 0) };
  });
}

/* ======================= Geography ======================= */

export function geography(ctx: Ctx, level: "state" | "district" | "branch", members: Member[], act: Map<string, Map<string, number>>, f: { from: string; to: string }, scans: ScanRecord[]) {
  const keyOf = (b: string) => { const g = geoOf(b); return level === "state" ? g.state : level === "district" ? g.district : b; };
  const nameOf = (b: string) => { const g = geoOf(b); return level === "state" ? g.stateName : level === "district" ? g.districtName : g.branchName; };
  const rows = new Map<string, { key: string; name: string; members: number; active: number; scans: number; redemptions: number; programmes: Record<string, number> }>();
  const row = (b: string) => { const k = keyOf(b); return rows.get(k) ?? rows.set(k, { key: k, name: nameOf(b), members: 0, active: 0, scans: 0, redemptions: 0, programmes: {} }).get(k)!; };
  const ids = new Set(members.map((m) => m.id));
  const active = activeIn(act, ids, f.from, f.to);
  members.forEach((m) => { const r = row(m.branchCode); r.members++; r.programmes[m.programme] = (r.programmes[m.programme] ?? 0) + 1; if (active.has(m.id)) r.active++; });
  scans.filter((s) => ids.has(s.memberId) && inRange(s.at, f)).forEach((s) => row(s.branchCode).scans++);
  ctx.ws.redemptions.filter((r) => ids.has(r.memberId) && inRange(r.createdAt, f)).forEach((r) => row(r.branchCode).redemptions++);
  return [...rows.values()].sort((a, b) => b.members - a.members);
}

/* ======================= Retention and segmentation ======================= */

export function retentionMatrix(act: Map<string, Map<string, number>>, members: Member[], asOn: string) {
  const cohorts = [...new Set(members.map((m) => month(joinDate(m))))].sort();
  return cohorts.map((c) => {
    const ms = members.filter((m) => month(joinDate(m)) === c);
    const at = (n: 30 | 60 | 90) => {
      // Matured only when every member of the cohort has had n days since joining.
      const matured = ms.every((m) => addDays(joinDate(m), n) <= day(asOn));
      if (!matured) return null;
      const kept = ms.filter((m) => activeIn(act, new Set([m.id]), addDays(joinDate(m), n - 29), addDays(joinDate(m), n)).size).length;
      return ratio(kept, ms.length);
    };
    return { cohort: c, members: ms.length, d30: at(30), d60: at(60), d90: at(90) };
  });
}
export type Segment = "active" | "dormant" | "churned" | "never_logged_in" | "not_classified";
/**
 * Active / Dormant / Churned on the login-inactivity basis Adoption monitoring uses (SOW 10.11), with
 * Dormant after X days (OP-DORM, shared with Phase 11) and Churned after Y days (OP-SEG1). Until both
 * are set, members are Not classified.
 */
export function segmentOf(ctx: Ctx, lastLoginAt: string | null): Segment {
  if (!lastLoginAt) return "never_logged_in";
  const X = ctx.dormancyDays, Y = ctx.churnedDays;
  if (X == null || Y == null || Y <= X) return "not_classified";
  const since = daysBetween(lastLoginAt, ctx.now);
  return since > Y ? "churned" : since > X ? "dormant" : "active";
}

/* ======================= Schemes, tiers, support, fraud, redemption ======================= */

export function schemeScorecard(ctx: Ctx, schemeId: string) {
  const sc = ctx.ss.schemes.find((s) => s.id === schemeId)!;
  const cfg = displayVersion(sc).config;
  const posted = ctx.ss.accruals.filter((a) => a.schemeId === sc.id && (a.result === "credited" || a.result === "accrued"));
  const participants = new Set(posted.map((a) => a.memberId));
  const ex = exposureOf(ctx.ss, sc, day(ctx.now));
  let eligible: number | null = null;
  try { eligible = eligiblePopulation(ctx.mem, ctx.ms, cfg).count; } catch { eligible = null; }
  const earned = posted.reduce((n, a) => n + a.points, 0);
  return {
    id: sc.id, name: cfg.basic.name, programmes: cfg.basic.programmes, period: `${cfg.duration.start} → ${cfg.duration.end}`, status: sc.status,
    participants: participants.size, eligible, qualified: null as number | null, avgPoints: ratio(earned, participants.size),
    earned, settled: ex.released, budget: ex.budget || null, exposure: ex.consumed, liability: projectedLiability(ctx.ss, sc, displayVersion(sc).version, eligible, ctx.now),
    returnOnSpend: null as number | null, acquisitionCost: null as number | null,
  };
}
export function supportStats(ctx: Ctx, memberIds: Set<string>, f: { from: string; to: string }) {
  const q = ctx.cs.queries.filter((x) => memberIds.has(x.memberId) && inRange(x.receivedAt, f));
  const resolved = q.filter((x) => x.resolvedAt);
  const hours = resolved.map((x) => (Date.parse(`${x.resolvedAt}:00Z`) - Date.parse(`${x.receivedAt}:00Z`)) / 3600_000);
  const sla = (cat: string) => ctx.cs.sla.find((s) => s.category === cat)?.resolutionHours ?? null;
  const overdue = q.filter((x) => !x.resolvedAt && sla(x.category) != null && (Date.parse(`${ctx.now}:00Z`) - Date.parse(`${x.receivedAt}:00Z`)) / 3600_000 > sla(x.category)!);
  const types = [...new Set(q.map((x) => x.category))];
  return {
    total: q.length, open: q.filter((x) => x.status === "open" || x.status === "reopened").length, inProgress: q.filter((x) => ["assigned", "awaiting_member", "escalated"].includes(x.status)).length,
    resolved: resolved.length, overdue: overdue.length, avgResolutionHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    byType: types.map((t) => ({ type: t, count: q.filter((x) => x.category === t).length, satisfaction: null as number | null })), queries: q,
  };
}
export const FRAUD_STATE = (e: RiskState["events"][number], rs: RiskState) => {
  const c = e.caseId ? rs.cases.find((x) => x.id === e.caseId) : undefined;
  if (e.status === "confirmed" || c?.status === "confirmed_misuse" || c?.decision?.outcome === "confirmed_misuse") return "confirmed" as const;
  if (e.status === "cleared" || c?.status === "cleared") return "cleared" as const;
  if (c && (c.status === "closed" || c.status === "restriction_applied")) return "resolved" as const;
  if (c) return "investigating" as const;
  return "flagged" as const;
};
export function redemptionByProduct(ctx: Ctx, memberIds: Set<string>, f: { from: string; to: string }) {
  const orders = ctx.gs.orders.filter((o) => memberIds.has(o.memberId) && inRange(o.createdAt, f));
  const items = ctx.gs.items.map((i) => {
    const os = ctx.gs.orders.filter((o) => o.giftId === i.id && memberIds.has(o.memberId));
    const inPeriod = os.filter((o) => inRange(o.createdAt, f));
    const last = os.map((o) => o.createdAt).sort().slice(-1)[0] ?? null;
    const slow = ctx.slowMovingDays == null ? null : !last || daysBetween(last, ctx.now) > ctx.slowMovingDays;
    return { id: i.id, name: i.name, categoryId: i.categoryId, type: i.type, stock: i.inventory.quantity, stockSource: i.inventory.source, redemptions: inPeriod.reduce((n, o) => n + o.quantity, 0), points: inPeriod.reduce((n, o) => n + o.points, 0), last, slow };
  }).sort((a, b) => b.redemptions - a.redemptions);
  const methods = [...new Set(ctx.ws.redemptions.map((r) => r.method))].map((mt) => { const rs = ctx.ws.redemptions.filter((r) => r.method === mt && memberIds.has(r.memberId) && inRange(r.createdAt, f)); return { method: mt, count: rs.length, points: rs.reduce((n, r) => n + r.points, 0), valueInr: rs.reduce((n, r) => n + r.grossInr, 0) }; });
  const byType = (key: (o: (typeof orders)[number]) => string) => { const m = new Map<string, Map<string, number>>(); orders.forEach((o) => { const cat = ctx.gs.items.find((i) => i.id === o.giftId)?.categoryId ?? "—"; const k = key(o); const inner = m.get(k) ?? m.set(k, new Map()).get(k)!; inner.set(cat, (inner.get(cat) ?? 0) + o.quantity); }); return m; };
  return { items, methods, byProgramme: byType((o) => o.programme), byMemberType: byType((o) => ctx.members.find((m) => m.id === o.memberId)?.memberType ?? "—"), orders };
}

/* ======================= Finance: points ageing and TDS liability ======================= */

export interface AgeingRow { memberId: string; name: string; mobileMasked: string; programme: ProgrammeCode; branchCode: string; role: string; category: string; buckets: Record<string, number>; total: number }
/**
 * Available (unused) points by member, product category and financial year earned, as on a date.
 * Allocation: spending consumes the oldest earned points first (development method, OP-AGE1). The
 * per-member total equals the wallet's available balance at the as-on date.
 */
export function pointsAgeing(ctx: Ctx, members: Member[], asOn: string, categoryId: string | null = null): { rows: AgeingRow[]; buckets: string[]; check: { memberId: string; ageing: number; wallet: number }[] } {
  const buckets = fyBuckets(asOn);
  const rows: AgeingRow[] = [];
  const check: { memberId: string; ageing: number; wallet: number }[] = [];
  for (const m of members) {
    const ls = ctx.lines.filter((l) => l.memberId === m.id && l.bucket === "available" && l.status === "completed" && day(l.at) <= asOn);
    const lots = ls.filter((l) => l.points > 0).map((l) => ({ fy: fyLabel(l.at), cat: categoryOf(ctx.ms, l.skuCode, l.categoryId) ?? "none", left: l.points }));
    let spend = -ls.filter((l) => l.points < 0).reduce((n, l) => n + l.points, 0);
    for (const lot of lots) { const used = Math.min(lot.left, spend); lot.left -= used; spend -= used; }
    const wallet = balancesFrom(ls).available;
    const per = new Map<string, Record<string, number>>();
    lots.filter((l) => l.left > 0).forEach((l) => { const r = per.get(l.cat) ?? per.set(l.cat, {}).get(l.cat)!; r[l.fy] = (r[l.fy] ?? 0) + l.left; });
    check.push({ memberId: m.id, ageing: lots.reduce((n, l) => n + l.left, 0) - spend, wallet });
    for (const [cat, b] of per) {
      if (categoryId && cat !== categoryId) continue;
      const full = Object.fromEntries(buckets.map((k) => [k, b[k] ?? 0]));
      rows.push({ memberId: m.id, name: m.name, mobileMasked: `••••••${m.mobile.replace(/\D/g, "").slice(-4)}`, programme: m.programme, branchCode: m.branchCode, role: m.memberType, category: cat, buckets: full, total: Object.values(full).reduce((a, c) => a + c, 0) });
    }
  }
  return { rows, buckets, check };
}
export interface TdsRow { memberId: string; name: string; programme: ProgrammeCode; branchCode: string; role: string; model: string; redeemValueInr: number | null; taxableValueInr: number | null; pan: string | null; panStatus: string; ratePct: number | null; tdsInr: number | null; kittyPoints: number | null; refs: string[]; status: string }
/** One row per member for the month, from recorded Phase 7 values only (no slab is calculated here). */
export function tdsMonthly(ctx: Ctx, members: Member[], m: string, panOf: (memberId: string) => string | null): TdsRow[] {
  const out: TdsRow[] = [];
  for (const mb of members) {
    const base = { memberId: mb.id, name: mb.name, programme: mb.programme, branchCode: mb.branchCode, role: mb.memberType, pan: panOf(mb.id), taxableValueInr: null };
    if (mb.programme === "EP") {
      const k = ctx.lines.filter((l) => l.memberId === mb.id && l.type === "tds_kitty_deduction" && l.bucket === "tds_kitty" && month(l.at) === m && l.status === "completed");
      if (!k.length) continue;
      out.push({ ...base, model: "Kitty at scan (EP/IMP)", redeemValueInr: null, panStatus: base.pan ? "verified" : "not verified", ratePct: null, tdsInr: null, kittyPoints: k.reduce((n, l) => n + l.points, 0), refs: k.map((l) => l.ref), status: "Held in TDS Kitty until FY reconciliation" });
      continue;
    }
    if (mb.programme === "DD") continue;
    const rs = ctx.ws.redemptions.filter((r) => r.memberId === mb.id && month(r.createdAt) === m && r.stage !== "cancelled" && r.stage !== "reversed");
    if (!rs.length) continue;
    const recorded = rs.filter((r) => r.tds.status === "recorded");
    const rates = [...new Set(recorded.map((r) => r.tds.ratePct))];
    out.push({ ...base, model: "On redemption", redeemValueInr: rs.reduce((n, r) => n + r.grossInr, 0), panStatus: rs[0].tds.panStatus, ratePct: rates.length === 1 ? rates[0] : null, tdsInr: recorded.length ? recorded.reduce((n, r) => n + (r.tds.amountInr ?? 0), 0) : null, kittyPoints: null, refs: rs.map((r) => r.id), status: recorded.length === rs.length ? "Recorded" : `${rs.length - recorded.length} not recorded (slab not confirmed)` });
  }
  return out;
}

/* ======================= KPI calculations (dictionary formulas) ======================= */

export const nps = (promoters: number, detractors: number, total: number) => (total ? ((promoters - detractors) / total) * 100 : null);
export const cac = (spend: number | null, newMembers: number) => ratio(spend, newMembers);
export function pointsRedemptionRate(ctx: Ctx, memberIds: Set<string>, asOn: string) {
  const from = addDays(asOn, -364);
  const f = pointsFlow(ctx.lines.filter((l) => memberIds.has(l.memberId) && day(l.at) >= from && day(l.at) <= asOn));
  return { redeemed: f.redeemed, issued: f.issued, rate: ratio(f.redeemed, f.issued), from, to: asOn };
}
export interface KpiValues { [kpiId: string]: { value: number | null; detail: string } }
/** The single KPI calculation used by every dashboard panel, report, alert and test. */
export function kpiValues(ctx: Ctx, memberIds: Set<string>, asOn: string, act = activity(ctx)): KpiValues {
  const d = day(asOn);
  const scans = ctx.scans.filter((s) => memberIds.has(s.memberId));
  const so = scanSuccess(scans.filter((s) => day(s.at) <= d), "scan_out");
  const prr = pointsRedemptionRate(ctx, memberIds, d);
  const ch = churn30(act, memberIds, month(d), d);
  const events = ctx.rs.events.filter((e) => !e.memberId || memberIds.has(e.memberId));
  return {
    "KPI-DAU": { value: activeOnDay(act, memberIds, d), detail: `Members with ${QUALIFYING}+ actions on ${d}` },
    "KPI-MAU": { value: mauSet(act, memberIds, month(d)).size, detail: `Members with an active day in ${month(d)}` },
    "KPI-A90": { value: active90(act, memberIds, d).size, detail: `${addDays(d, -89)} → ${d}` },
    "KPI-PRR": { value: prr.rate == null ? null : prr.rate * 100, detail: `${prr.redeemed.toLocaleString("en-IN")} redeemed ÷ ${prr.issued.toLocaleString("en-IN")} issued (12 months)` },
    "KPI-LTV": { value: null, detail: "Not calculated: no revenue source (OP-REV1)" },
    "KPI-CAC": { value: null, detail: "Not calculated: marketing spend not supplied (OP-CAC1)" },
    "KPI-PAYBACK": { value: null, detail: "Not calculated: needs CAC, LTV and a forecasting method" },
    "KPI-CHURN": { value: ch.rate == null ? null : ch.rate * 100, detail: `${ch.churned} of ${ch.previousActive} active in ${prevMonth(month(d))}${ch.incomplete ? " (month in progress)" : ""}` },
    "KPI-NPS": { value: null, detail: "Not calculated: no recommendation question with promoter / detractor bands" },
    "KPI-SCAN": { value: so.rate == null ? null : so.rate * 100, detail: `Scan-Out: ${so.successful} of ${so.attempts} attempts` },
    "KPI-FRAUD": { value: null, detail: `${events.length} risk events flagged; total incidents and amount saved not supplied` },
  };
}
export const FYS = (asOn: string) => fyBuckets(asOn);
export const fyOf = (at: string) => fyLabel(at);
/** Total redemption TDS (₹) through the monthly liability report path, for reconciliation. */
export function tdsMonthlyAll(ctx: Ctx) {
  const months = [...new Set(ctx.ws.redemptions.map((r) => month(r.createdAt)))];
  return months.reduce((n, m) => n + tdsMonthly(ctx, ctx.members, m, () => null).reduce((a, r) => a + (r.tdsInr ?? 0), 0), 0);
}

/* ======================= Member-facing analytics contracts (SOW 13.2) ======================= */

/** Wallet figures for one member over a date window (the member app date filter). */
export function memberWallet(ctx: Ctx, memberId: string, from: string, to: string) {
  const mine = ctx.lines.filter((l) => l.memberId === memberId);
  const inWin = mine.filter((l) => day(l.at) >= from && day(l.at) <= to);
  const upTo = balancesFrom(mine.filter((l) => day(l.at) <= to));
  const win = balancesFrom(inWin, ctx.ws.redemptions.filter((r) => r.memberId === memberId && day(r.createdAt) >= from && day(r.createdAt) <= to));
  return { from, to, lifetimeEarned: upTo.lifetime, earnedInPeriod: win.lifetime, available: upTo.available, redeemed: win.redeemed, schemePoints: upTo.scheme, tdsDeductedPoints: win.tdsDeductedPoints, tdsDeductedInr: win.tdsDeductedInr };
}
/** Earnings by product category from earning ledger lines only (never from redemptions). */
export function memberEarningsByCategory(ctx: Ctx, memberId: string, from: string, to: string) {
  // Earning and earning-reversal lines only; the wallet balance function applies its own status rules.
  const ls = ctx.lines.filter((l) => l.memberId === memberId && day(l.at) >= from && day(l.at) <= to && (LEDGER_TYPE[l.type].earning || LEDGER_TYPE[l.type].earningReversal));
  return pointsBy(ls, (l) => categoryName(ctx.ms, categoryOf(ctx.ms, l.skuCode, l.categoryId))).map((x) => ({ category: x.key, points: x.issued }));
}
/** Scan history: every scan, latest first, with claim ID and the location the scan service supplied. */
export function memberScanHistory(ctx: Ctx, memberId: string, f: { from?: string; to?: string; type?: "scan_in" | "scan_out"; status?: string } = {}) {
  return ctx.scans
    .filter((s) => s.memberId === memberId && (!f.from || day(s.at) >= f.from) && (!f.to || day(s.at) <= f.to) && (!f.type || s.type === f.type) && (!f.status || s.status === f.status))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((s) => ({ at: s.at, claimId: s.claimId, qr: s.qrMasked, sku: s.skuCode, type: s.type, status: s.status, points: s.points, location: s.location.label, geoTagged: s.location.lat != null, failureReason: s.failureReason }));
}
export interface PassbookFilter { from?: string; to?: string; schemeId?: string; categoryId?: string; status?: string; channel?: string; region?: string }
/** Passbook: every earning and redemption entry, filterable by date, scheme, category, status, channel and region. */
export function memberPassbook(ctx: Ctx, memberId: string, f: PassbookFilter = {}) {
  const scanByLedger = new Map(ctx.scans.filter((s) => s.ledgerRef).map((s) => [s.ledgerRef!, s]));
  return ctx.lines
    .filter((l) => l.memberId === memberId && (l.bucket === "available" || l.bucket === "scheme_unsettled" || l.bucket === "redeemed" || l.bucket === "pending"))
    .map((l) => {
      const sc = scanByLedger.get(l.id);
      return { at: l.at, ref: l.ref, type: l.type, points: l.points, schemeId: l.schemeId ?? null, categoryId: categoryOf(ctx.ms, l.skuCode, l.categoryId), status: l.status, channel: sc ? channelKey(sc.channel) : l.channel, region: geoOf(l.branchCode).state };
    })
    .filter((r) => (!f.from || day(r.at) >= f.from) && (!f.to || day(r.at) <= f.to) && (!f.schemeId || r.schemeId === f.schemeId) && (!f.categoryId || r.categoryId === f.categoryId) && (!f.status || r.status === f.status) && (!f.channel || r.channel === f.channel) && (!f.region || r.region === f.region))
    .sort((a, b) => b.at.localeCompare(a.at));
}
/** Statement for a chosen date range: CSV text here; the PDF layout belongs to the statement service. */
export function memberStatement(ctx: Ctx, memberId: string, from: string, to: string, format: "csv" | "pdf") {
  const rows = memberPassbook(ctx, memberId, { from, to });
  const csv = ["date,reference,type,points,scheme,category,status", ...rows.map((r) => [r.at, r.ref, r.type, r.points, r.schemeId ?? "", r.categoryId ?? "", r.status].join(","))].join("\n");
  return { format, from, to, rows: rows.length, body: format === "csv" ? csv : null, pdf: format === "pdf" ? "Rendered by the statement service (PDF layout not part of this portal build)" : null };
}
type MeasureFn = (s: SchemeState, m: never, parts: { base: number; rider: number; crossSell: number }) => { ok: boolean; points?: number; reason?: string };
/** Scheme and milestone progress from scheme accruals and the scheme engine milestone rule. */
export function memberSchemeProgress(ctx: Ctx, memberId: string, measure: MeasureFn) {
  const out: { schemeId: string; name: string; earned: number; achieved: number | null; next: { name: string; threshold: number; remaining: number } | null; achievedLevels: string[]; note: string | null }[] = [];
  for (const sc of ctx.ss.schemes) {
    const acc = ctx.ss.accruals.filter((a) => a.schemeId === sc.id && a.memberId === memberId && (a.result === "credited" || a.result === "accrued"));
    if (!acc.length) continue;
    const cfg = displayVersion(sc).config;
    const sum = (c: string) => acc.filter((a) => a.component === c).reduce((n, a) => n + a.points, 0);
    const earned = acc.reduce((n, a) => n + a.points, 0);
    const base = { schemeId: sc.id, name: cfg.basic.name, earned, achieved: null, next: null, achievedLevels: [] as string[] };
    if (!cfg.milestone.enabled) { out.push({ ...base, note: "No milestones in this scheme" }); continue; }
    if (cfg.milestone.measure !== "points") { out.push({ ...base, note: `Milestones measured by ${cfg.milestone.measure.replace("_", " ")}: supplied by the scheme service` }); continue; }
    const m = measure(ctx.ss, cfg.milestone as never, { base: sum("base"), rider: sum("rider"), crossSell: sum("crossSell") });
    if (!m.ok) { out.push({ ...base, note: m.reason ?? "Not computable" }); continue; }
    const v = m.points!;
    const levels = cfg.milestone.levels.filter((l) => l.threshold != null).sort((a, b) => a.threshold! - b.threshold!);
    const nx = levels.find((l) => l.threshold! > v);
    out.push({ ...base, achieved: v, next: nx ? { name: nx.name, threshold: nx.threshold!, remaining: nx.threshold! - v } : null, achievedLevels: levels.filter((l) => l.threshold! <= v).map((l) => l.name), note: null });
  }
  return out;
}
