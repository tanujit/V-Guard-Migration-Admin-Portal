/**
 * Phase 12 — Business analytics, reporting, KPI dashboards, Member 360 analytics and management
 * intelligence test suite (Build Prompt 12, section 29, scenarios 1–155).
 *   npm run test:analytics
 * Runs the real analytics store against Member Management, the wallet / ledger, schemes, masters,
 * risk, comms, gifts, ops and the approval engine in Node. SOW 13.1 calculations are asserted
 * deterministically (including on synthetic activity); unresolved formulas, targets and report
 * definitions (OP-KPI1, OP-REV1, OP-CAC1, OP-SEG1, OP-AGE1, OP-43, OP-62, OP-ALERT1) are asserted as
 * pending rather than calculated.
 */
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { walletStore } from "@/features/wallet/store";
import { schemeStore } from "@/features/schemes/store";
import { riskStore } from "@/features/risk/store";
import { giftsStore } from "@/features/gifts/store";
import { commsStore } from "@/features/comms/store";
import * as Ops from "@/features/ops/store";
import { memberBalances } from "@/features/wallet/engine";
import { exposureOf } from "@/features/schemes/engine";
import * as A from "@/features/analytics/store";
import * as E from "@/features/analytics/engine";
import { analyticsApi } from "@/services/analyticsApi";
import { KPI_SEED, REPORTS, fyBuckets } from "@/config/analyticsCatalogue";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import type { Member } from "@/types/members";

const RAHUL = "USR-1003", ANITA = "USR-2001", LAKSHMI = "USR-2003", TANUJIT = "USR-1001", VIKRAM = "USR-2006", KA_ADMIN = "USR-2004";
const NOW = "2026-11-09";
const as = () => A.analyticsStore.get();
const mem = () => memberStore.get();
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string) => decideRequest(uid, id, "approve", "Reviewed in test", req(id).seq);
const F: E.Filters = { from: "2025-04-01", to: NOW, programmes: [], state: null, district: null, branch: null, memberType: null, categoryId: null, schemeId: null };
const F30: E.Filters = { ...F, ...E.dateRange("30d", `${NOW}T14:30`) };

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: number; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
function test(n: number, name: string, kind: Kind, fn: () => string | void | Promise<string | void>) {
  const done = (ok: boolean, detail: string) => results.push({ n, name, kind, ok, detail });
  try {
    const r = fn();
    if (r instanceof Promise) pending.push(r.then((d) => done(true, d ?? "")).catch((e) => done(false, (e as Error).message)));
    else done(true, r ?? "");
  } catch (e) {
    done(false, (e as Error).message);
  }
}
const pending: Promise<void>[] = [];
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const ok = (r: { ok: boolean; errors: string[] }, what = "") => expect(r.ok, `${what} ${r.errors.join("; ")}`.trim());
const no = (r: { ok: boolean }, what: string) => expect(!r.ok, `${what} was allowed`);
const audited = (action: string, entity?: string) => as().audit.some((a) => a.action === action && (!entity || a.entity === entity));
const kpi = (id: string) => as().kpis.find((k) => k.id === id)!;
const dec = (id: string) => as().decisions.find((d) => d.id === id)!;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ctx = () => A.context();
const allIds = () => new Set(mem().members.map((m) => m.id));
/** Synthetic activity map for deterministic KPI checks. */
const act = (rows: [string, string, number][]) => { const m = new Map<string, Map<string, number>>(); rows.forEach(([id, d, n]) => (m.get(id) ?? m.set(id, new Map()).get(id)!).set(d, n)); return m; };
const view = <T,>(x: T) => x as Exclude<T, { denied: true }>;

/* ======================= KPI dictionary (1–12) ======================= */

const TEN = ["KPI-DAU", "KPI-A90", "KPI-PRR", "KPI-LTV", "KPI-CAC", "KPI-PAYBACK", "KPI-CHURN", "KPI-NPS", "KPI-SCAN", "KPI-FRAUD"];
test(1, "All ten SOW KPIs are registered", "deterministic", () => {
  expect(TEN.every((id) => as().kpis.some((k) => k.id === id && k.sowRef === "SOW 13.1")), "missing SOW KPI");
  return `${as().kpis.length} KPIs (10 SOW 13.1 + MAU from SOW 13.3)`;
});
test(2, "DAU uses the SOW definition", "deterministic", () => {
  expect(kpi("KPI-DAU").sowDefinition === "Members who did more than one action in the app in a day.", "wording");
  const a = act([["M1", "2026-11-01", 1], ["M2", "2026-11-01", 2], ["M3", "2026-11-01", 5]]);
  expect(E.activeOnDay(a, new Set(["M1", "M2", "M3"]), "2026-11-01") === 2, "one action must not count");
});
test(3, "90-Day Active uses the SOW definition", "deterministic", () => {
  expect(kpi("KPI-A90").sowDefinition === "Members who did more than one action in the last 90 days.", "wording");
  const a = act([["M1", "2026-10-01", 1], ["M2", "2026-09-01", 1], ["M2", "2026-10-15", 1], ["M3", "2026-07-01", 3]]);
  const s = E.active90(a, new Set(["M1", "M2", "M3"]), NOW);
  expect(s.size === 1 && s.has("M2"), "90-day window or count");
});
test(4, "Points Redemption Rate uses the defined 12-month period", "deterministic", () => {
  const r = E.pointsRedemptionRate(ctx(), allIds(), NOW);
  expect(r.from === "2025-11-10" && r.to === NOW && kpi("KPI-PRR").period === "Rolling 12 months", "period");
  expect(r.rate != null && Math.abs(r.rate - r.redeemed / r.issued) < 1e-9, "ratio");
  return `${(r.rate! * 100).toFixed(1)}%`;
});
test(5, "LTV uses the defined three-year period", "blocked", () => {
  expect(kpi("KPI-LTV").period === "Three years" && kpi("KPI-LTV").calculable === "inputs_missing" && A.kpiValues(RAHUL)["KPI-LTV"].value === null, "LTV");
});
test(6, "CAC uses marketing spend / new members gained", "deterministic", () => {
  expect(kpi("KPI-CAC").numerator === "Marketing spend" && E.cac(100000, 40) === 2500 && E.cac(null, 40) === null && E.cac(5000, 0) === null, "CAC");
});
test(7, "Churn uses the previous month's active-member base", "deterministic", () => {
  expect(kpi("KPI-CHURN").denominator === "Previous month's active members", "denominator");
  const a = act([["M1", "2026-09-05", 2], ["M2", "2026-09-06", 2], ["M3", "2026-09-07", 2], ["M4", "2026-09-08", 2], ["M1", "2026-10-02", 2], ["M5", "2026-10-03", 2]]);
  const c = E.churn30(a, new Set(["M1", "M2", "M3", "M4", "M5"]), "2026-10", NOW);
  expect(c.previousActive === 4 && c.churned === 3 && c.rate === 0.75 && !c.incomplete, "churn");
});
test(8, "NPS uses promoter / detractor / total response inputs", "deterministic", () => {
  expect(E.nps(50, 10, 100) === 40 && E.nps(0, 0, 0) === null && kpi("KPI-NPS").formula.includes("Promoters"), "NPS");
  expect(A.kpiValues(RAHUL)["KPI-NPS"].value === null, "NPS invented without a recommendation question");
});
test(9, "Scan Success Rate uses successful scans / total scan attempts", "deterministic", () => {
  const s = E.scanSuccess([{ type: "scan_out", status: "success" }, { type: "scan_out", status: "failed" }, { type: "scan_out", status: "success" }, { type: "scan_in", status: "success" }] as never, "scan_out");
  expect(s.attempts === 3 && s.successful === 2 && Math.abs(s.rate! - 2 / 3) < 1e-9, "scan success");
});
test(10, "Fraud Detection Rate references flagged cases and the amount saved", "blocked", () => {
  expect(/amount saved/.test(kpi("KPI-FRAUD").sowDefinition) && kpi("KPI-FRAUD").numerator!.includes("flagged") && A.kpiValues(RAHUL)["KPI-FRAUD"].value === null, "fraud KPI");
});
test(11, "KPI formula version is preserved", "governance", () => {
  no(A.requestKpiChange(ANITA, "KPI-DAU", "definition", { definition: "x", effectiveFrom: NOW }, "test"), "Client Admin submit (no Maker)");
  no(A.requestKpiChange(RAHUL, "KPI-DAU", "definition", { definition: "x", effectiveFrom: NOW }, ""), "no reason");
  const r = A.requestKpiChange(RAHUL, "KPI-SCAN", "definition", { definition: "Successful Scan-Out attempts divided by all Scan-Out attempts (confirmed in test)", effectiveFrom: "2026-11-15" }, "V-Guard confirmed in development test");
  ok(r);
  expect(kpi("KPI-SCAN").version === 1 && kpi("KPI-SCAN").status === "pending_business_confirmation", "applied before approval");
  ok(decide(ANITA, as().kpiChanges.find((c) => c.id === r.id)!.approvalRequestId!));
  const k = kpi("KPI-SCAN");
  expect(k.version === 2 && k.versions[0].definition === k.sowDefinition && k.versions[1].status === "confirmed" && k.approvedDefinition!.includes("confirmed in test"), "versioning");
  expect(audited("kpi_definition_confirmed", "KPI-SCAN"), "audit");
  return `KPI-SCAN v${k.version}`;
});
test(12, "Unconfirmed targets remain Pending Business Confirmation", "blocked", () => {
  expect(as().kpis.every((k) => k.target.value === null && k.target.status === "pending_business_confirmation"), "target invented");
  no(A.requestKpiChange(RAHUL, "KPI-DAU", "target", { targetValue: null, targetDirection: "min", effectiveFrom: NOW }, "No value"), "target without value");
  expect(dec("OP-KPI1").status === "open", "OP-KPI1");
});

/* ======================= Member engagement (13–20) ======================= */

const eg = () => view(A.engagement(RAHUL, F30));
test(13, "Daily Active Users", "deterministic", () => {
  const e = eg();
  expect(e.dauToday === E.activeOnDay(A.activityMap(), allIds(), NOW) && e.dauToday === A.kpiValues(RAHUL)["KPI-DAU"].value, "DAU differs between dashboard and KPI");
  return `DAU ${e.dauToday}`;
});
test(14, "Monthly Active Users", "deterministic", () => {
  const e = eg();
  expect(e.mau[e.mau.length - 1].mau === A.kpiValues(RAHUL)["KPI-MAU"].value && e.mau.length === 12, "MAU");
});
test(15, "New registrations", "deterministic", () => {
  const n = mem().members.filter((m) => E.joinDate(m) >= F30.from && E.joinDate(m) <= F30.to).length;
  expect(eg().signups.total === n && sum(eg().signups.byProgramme.map((x) => x.value)) === n, "sign-ups");
  return `${n} in 30 days`;
});
test(16, "7-day trend", "deterministic", () => expect(eg().trend7.length === 7 && eg().trend7[6].key === NOW, "7-day"));
test(17, "30-day trend", "deterministic", () => expect(eg().trend30.length === 30 && eg().dau.length === 30, "30-day"));
test(18, "Programme drill-down", "deterministic", () => {
  const e = view(A.engagement(RAHUL, { ...F, programmes: ["EP"] }));
  const rows = e.drill("active");
  expect(rows.length > 0 && rows.every((r) => r.programme === "EP"), "programme drill");
});
test(19, "Region drill-down", "deterministic", () => {
  const rows = view(A.engagement(RAHUL, { ...F, state: "KL" })).drill("active");
  expect(rows.length > 0 && rows.every((r) => r.branch.startsWith("KL-")), "region drill");
});
test(20, "Category drill-down", "deterministic", () => {
  const e = view(A.engagement(RAHUL, F));
  const scans = ctx().scans.filter((s) => E.day(s.at) >= F.from && E.day(s.at) <= F.to);
  expect(e.byCategory.length > 1 && sum(e.byCategory.map((x) => x.value)) === scans.length, "category drill");
});

/* ======================= Points flow (21–30) ======================= */

const pf = () => view(A.pointsFlowView(RAHUL, F));
test(21, "Points issued", "deterministic", () => {
  const p = pf();
  expect(p.total.issued > 0 && sum(p.byProgramme.map((x) => x.issued)) === p.total.issued, "issued");
  return `${p.total.issued.toLocaleString("en-IN")} issued`;
});
test(22, "Points redeemed", "deterministic", () => expect(pf().total.redeemed > 0 && sum(pf().byProgramme.map((x) => x.redeemed)) === pf().total.redeemed, "redeemed"));
test(23, "Base points versus scheme points (stages not combined)", "governance", () => {
  const t = pf().total;
  expect(t.base > 0 && t.scheme > 0 && t.scheme === t.accrued && t.available !== t.issued, "stages");
});
test(24, "Points by category", "deterministic", () => expect(pf().byCategory.length > 1 && sum(pf().byCategory.map((x) => x.issued)) === pf().total.issued, "category"));
test(25, "Points by scheme", "deterministic", () => {
  const s = pf().byScheme;
  expect(s.length > 0 && s.every((x) => schemeStore.get().schemes.some((sc) => sc.id === x.key)), "scheme keys");
});
test(26, "Points by member type", "deterministic", () => expect(sum(pf().byMemberType.map((x) => x.issued)) === pf().total.issued, "member type"));
test(27, "Daily earning curve", "deterministic", () => expect(sum(pf().daily.map((d) => d.issued)) === pf().total.issued && pf().daily.every((d, i, a) => i === 0 || a[i - 1].key < d.key), "daily issued"));
test(28, "Daily redemption curve", "deterministic", () => expect(sum(pf().daily.map((d) => d.redeemed)) === pf().total.redeemed, "daily redeemed"));
test(29, "Ledger drill-down", "deterministic", () => {
  const p = view(A.pointsFlowView(RAHUL, F30));
  expect(p.lines.length > 0 && p.lines.every((l) => E.day(l.at) >= F30.from && !!l.ref && !!l.status), "drill lines");
});
test(30, "Financial totals reconcile with the wallet source", "deterministic", () => {
  const r = A.reconciliation(RAHUL);
  expect(r.find((x) => x.id === "points-issued")!.status === "matched" && r.find((x) => x.id === "points-redeemed")!.status === "matched", "wallet reconciliation");
});

/* ======================= Revenue impact (31–35) ======================= */

const rv = () => view(A.revenueView(RAHUL, F));
test(31, "Member join cohort", "deterministic", () => expect(sum(rv().cohorts.map((c) => c.members)) === mem().members.length, "cohort members"));
test(32, "Monthly revenue by cohort", "blocked", () => expect(rv().cohorts.every((c) => c.revenue === null), "revenue invented"));
test(33, "Month-on-month growth", "blocked", () => expect(rv().cohorts.every((c) => c.momGrowth === null), "growth invented"));
test(34, "Missing attribution methodology shows Business Confirmation Required", "blocked", () => expect(rv().methodStatus === "business_confirmation_required" && dec("OP-REV1").status === "open", "OP-REV1"));
test(35, "No fabricated incremental sales", "governance", () => expect(A.freshness("revenue").status === "unavailable" && A.kpiValues(RAHUL)["KPI-LTV"].value === null, "revenue source"));

/* ======================= Fraud (36–41) ======================= */

const fr = () => view(A.fraudView(RAHUL, F));
test(36, "Risk alerts (Fraud & Risk data)", "governance", () => {
  no(A.fraudView(VIKRAM, F), "fraud analytics without permission");
  expect(fr().live === fr().events.filter((x) => x.s === "flagged").length && fr().live > 0, "live alerts");
});
test(37, "Blocked accounts", "deterministic", () => expect(fr().blockedAccounts === mem().restrictions.filter((r) => r.status !== "lifted").length, "blocked accounts"));
test(38, "Flagged transactions", "deterministic", () => expect(fr().flaggedTransactions > 0 && fr().flaggedTransactions <= fr().events.length, "flagged transactions"));
test(39, "Geographic heat map", "deterministic", () => expect(sum(fr().byDistrict.map((x) => x.total)) === fr().events.length, "district totals"));
test(40, "Product-wise risk distribution", "deterministic", () => expect(sum(fr().byProduct.map((x) => x.total)) === fr().events.length, "product totals"));
test(41, "Flagged and confirmed fraud remain distinct", "governance", () => {
  const f = fr();
  expect(f.live + f.investigating + f.confirmed + f.cleared + f.resolved === f.events.length && f.confirmed === f.events.filter((x) => x.s === "confirmed").length, "state split");
  return `flagged ${f.live}, investigating ${f.investigating}, confirmed ${f.confirmed}`;
});

/* ======================= Scheme performance (42–49) ======================= */

const sch = () => view(A.schemeView(RAHUL, F)).rows.find((r) => r.id === "SCH-0001")!;
const posted = () => schemeStore.get().accruals.filter((a) => a.schemeId === "SCH-0001" && (a.result === "credited" || a.result === "accrued"));
test(42, "Scheme participation", "deterministic", () => expect(sch().participants === new Set(posted().map((a) => a.memberId)).size, "participants"));
test(43, "Average points per member", "deterministic", () => expect(sch().avgPoints === sum(posted().map((a) => a.points)) / sch().participants, "average"));
test(44, "Return on spend", "blocked", () => expect(view(A.schemeView(RAHUL, F)).rows.every((r) => r.returnOnSpend === null), "ROS invented"));
test(45, "Scheme acquisition cost", "blocked", () => expect(view(A.schemeView(RAHUL, F)).rows.every((r) => r.acquisitionCost === null), "scheme CAC invented"));
test(46, "Scheme budget", "deterministic", () => { const sc = schemeStore.get().schemes.find((s) => s.id === "SCH-0001")!; expect(sch().budget === (exposureOf(schemeStore.get(), sc, NOW).budget || null), "budget"); });
test(47, "Exposure", "deterministic", () => { const sc = schemeStore.get().schemes.find((s) => s.id === "SCH-0001")!; expect(sch().exposure === exposureOf(schemeStore.get(), sc, NOW).consumed, "exposure"); });
test(48, "Actual liability", "blocked", () => expect(sch().liability.status === "pending_business_formula" && sch().liability.output === null, "liability"));
test(49, "Missing formulas remain unapproved", "blocked", () => expect(view(A.schemeView(RAHUL, F)).rows.every((r) => r.liability.output === null && r.qualified === null), "formula"));

/* ======================= Channel performance (50–57) ======================= */

const ch = () => view(A.channelView(RAHUL, F));
const chRow = (k: string) => ch().channels.find((c) => c.key === k)!;
test(50, "App", "deterministic", () => expect(chRow("app").transactions > 0, "app"));
test(51, "Web", "deterministic", () => expect(chRow("web").transactions > 0, "web"));
test(52, "POS", "deterministic", () => expect(chRow("pos").transactions > 0, "pos"));
test(53, "Points earned by channel", "deterministic", () => {
  const outPts = sum(ctx().scans.filter((s) => s.type === "scan_out" && s.status === "success" && E.day(s.at) >= F.from && E.day(s.at) <= F.to).map((s) => s.points));
  expect(sum(ch().channels.map((c) => c.pointsEarned)) === outPts, "channel points");
});
test(54, "Points redeemed by channel (no channel recorded → Unmapped)", "governance", () => {
  const r = ch().redeemedByChannel;
  expect(r.length === 1 && r[0].key === "unmapped" && r[0].points === sum(walletStore.get().redemptions.filter((x) => E.day(x.createdAt) >= F.from && E.day(x.createdAt) <= F.to).map((x) => x.points)), "redeemed by channel");
});
test(55, "Member-type breakdown", "deterministic", () => expect(sum(ch().byMemberType.flatMap((g) => g.rows.map((x) => x.transactions))) === sum(ch().channels.map((c) => c.transactions)), "member type"));
test(56, "Category breakdown", "deterministic", () => expect(sum(ch().byCategory.flatMap((g) => g.rows.map((x) => x.pointsEarned))) === sum(ch().channels.map((c) => c.pointsEarned)), "category"));
test(57, "Unknown channel remains Unmapped", "governance", () => {
  const nulls = ctx().scans.filter((s) => s.channel === null && E.day(s.at) >= F.from && E.day(s.at) <= F.to).length;
  expect(nulls > 0 && chRow("unmapped").transactions === nulls && chRow("unmapped").label.includes("unmapped"), "unmapped");
});

/* ======================= Geography and tiers (58–64) ======================= */

const geo = (level: "state" | "district" | "branch", f: E.Filters = F) => view(A.geoView(RAHUL, f, level)).rows;
test(58, "District active members", "deterministic", () => expect(sum(geo("district").map((r) => r.active)) === E.activeIn(A.activityMap(), allIds(), F.from, F.to).size, "active"));
test(59, "District scan counts", "deterministic", () => expect(sum(geo("district").map((r) => r.scans)) === ctx().scans.filter((s) => E.day(s.at) >= F.from && E.day(s.at) <= F.to).length, "scans"));
test(60, "District redemptions", "deterministic", () => expect(sum(geo("district").map((r) => r.redemptions)) === walletStore.get().redemptions.filter((r) => E.day(r.createdAt) >= F.from && E.day(r.createdAt) <= F.to).length, "redemptions"));
const tv = () => view(A.tierView(RAHUL, F));
test(61, "Tier distribution (Tier Master, not hardcoded)", "deterministic", () => {
  const t = tv();
  expect(t.tiers.every((x) => schemeStore.get().tiers.some((y) => y.id === x.id && y.name === x.name)) && sum(t.tiers.map((x) => x.members)) === sum(t.byBranch.map((s) => s.members)), "tiers");
});
test(62, "Tier upgrades", "deterministic", () => expect(sum(tv().tiers.map((t) => t.upgrades)) === sum(tv().byBranch.map((s) => s.upgrades30d)) && sum(tv().tiers.map((t) => t.upgrades)) > 0, "upgrades"));
test(63, "Tier downgrades", "deterministic", () => expect(sum(tv().tiers.map((t) => t.downgrades)) === sum(tv().byBranch.map((s) => s.downgrades30d)), "downgrades"));
test(64, "Branch drill-down", "deterministic", () => {
  const rows = geo("branch", { ...F, state: "KL", district: "KL-ERNAKULAM" });
  expect(rows.length > 0 && rows.every((r) => r.key.startsWith("KL-BR-")), "branch drill");
});

/* ======================= Support and retention (65–73) ======================= */

const sv = () => view(A.supportView(RAHUL, F));
test(65, "Ticket volume by type", "deterministic", () => expect(sum(sv().byType.map((t) => t.count)) === sv().total && sv().total === commsStore.get().queries.filter((q) => E.day(q.receivedAt) >= F.from).length, "ticket types"));
test(66, "Average resolution time", "deterministic", () => {
  const h = sv().queries.filter((q) => q.resolvedAt).map((q) => (Date.parse(`${q.resolvedAt}:00Z`) - Date.parse(`${q.receivedAt}:00Z`)) / 3600_000);
  expect(sv().avgResolutionHours === Math.round((sum(h) / h.length) * 10) / 10, "average");
});
test(67, "Satisfaction by issue type (not available, not zero)", "blocked", () => expect(sv().byType.every((t) => t.satisfaction === null), "satisfaction invented"));
const synthMembers = (): Member[] => [
  { ...mem().members[0], id: "SYN-1", registration: { ...mem().members[0].registration, submittedAt: "2026-06-01T10:00" } },
  { ...mem().members[0], id: "SYN-2", registration: { ...mem().members[0].registration, submittedAt: "2026-06-10T10:00" } },
  { ...mem().members[0], id: "SYN-3", registration: { ...mem().members[0].registration, submittedAt: "2026-11-01T10:00" } },
];
const synthAct = act([["SYN-1", "2026-06-20", 2], ["SYN-1", "2026-07-20", 3], ["SYN-1", "2026-08-25", 2], ["SYN-2", "2026-06-15", 2]]);
const matrix = () => E.retentionMatrix(synthAct, synthMembers(), NOW);
test(68, "30-day retention", "deterministic", () => expect(matrix().find((m) => m.cohort === "2026-06")!.d30 === 1, "30-day"));
test(69, "60-day retention", "deterministic", () => expect(matrix().find((m) => m.cohort === "2026-06")!.d60 === 0.5, "60-day"));
test(70, "90-day retention", "deterministic", () => expect(matrix().find((m) => m.cohort === "2026-06")!.d90 === 0.5, "90-day"));
test(71, "Cohort retention matrix", "deterministic", () => {
  const r = view(A.retentionView(RAHUL, F));
  expect(sum(r.matrix.map((m) => m.members)) === mem().members.length && r.matrix.every((m, i, a) => i === 0 || a[i - 1].cohort < m.cohort), "matrix");
});
test(72, "Immature cohorts display Not Yet Available", "blocked", () => {
  const n = matrix().find((m) => m.cohort === "2026-11")!;
  const real = view(A.retentionView(RAHUL, F)).matrix.slice(-1)[0];
  expect(n.d30 === null && n.d60 === null && n.d90 === null && real.d30 === null, "immature cohort evaluated");
});
test(73, "Active / Dormant / Churned uses the approved source rules", "governance", () => {
  expect(view(A.segmentationView(RAHUL, F)).rows.every((r) => r.segment === "never_logged_in" || r.segment === "not_classified"), "classified without thresholds");
  ok(Ops.setDormancy(RAHUL, 60));
  ok(A.setAnalyticsConfig(RAHUL, "churnedDays", 180));
  const seg = view(A.segmentationView(RAHUL, F)).rows;
  const adoption = Ops.adoptionRows(RAHUL);
  const mismatch = adoption.filter((a) => { const s = seg.find((x) => x.member.id === a.member.id)?.segment; return (a.status === "dormant" && !(s === "dormant" || s === "churned")) || (a.status === "active" && s !== "active") || (a.status === "never_logged_in" && s !== "never_logged_in"); });
  ok(Ops.setDormancy(RAHUL, null));
  ok(A.setAnalyticsConfig(RAHUL, "churnedDays", null));
  expect(!mismatch.length, `${mismatch.length} members classified differently from Adoption monitoring`);
  return `${seg.filter((x) => x.segment === "active").length} active, ${seg.filter((x) => x.segment === "dormant").length} dormant, ${seg.filter((x) => x.segment === "churned").length} churned at X=60, Y=180`;
});

/* ======================= Acquisition and redemption (74–81) ======================= */

const aq = () => view(A.acquisitionView(RAHUL, F));
test(74, "Marketing spend", "blocked", () => expect(aq().spend === null && A.freshness("marketing").status === "unavailable", "spend invented"));
test(75, "New members by acquisition channel", "deterministic", () => {
  const sources = new Set(mem().members.map((m) => m.registration.source));
  expect(sum(aq().bySource.map((x) => x.value)) === aq().newMembers && aq().bySource.every((x) => sources.has(x.key as never)), "sources");
});
test(76, "CAC", "blocked", () => expect(aq().cac === null && dec("OP-CAC1").status === "open", "CAC invented"));
test(77, "Payback forecast", "blocked", () => expect(aq().payback === null && A.kpiValues(RAHUL)["KPI-PAYBACK"].value === null, "payback invented"));
const rp = () => view(A.redemptionView(RAHUL, F));
test(78, "Redemption by product", "deterministic", () => {
  const r = rp();
  expect(sum(r.items.map((i) => i.redemptions)) === sum(r.orders.map((o) => o.quantity)) && r.items.every((x, i, a) => i === 0 || a[i - 1].redemptions >= x.redemptions), "items");
});
test(79, "Slow-moving stock (threshold not invented)", "blocked", () => {
  expect(rp().items.every((i) => i.slow === null), "classified without a threshold");
  ok(A.setAnalyticsConfig(RAHUL, "slowMovingDays", 30));
  const r = rp();
  ok(A.setAnalyticsConfig(RAHUL, "slowMovingDays", null));
  expect(r.items.every((i) => typeof i.slow === "boolean") && dec("OP-SLOW1").status === "open", "classification");
});
test(80, "Gift redemption by member type", "deterministic", () => expect(sum([...rp().byMemberType.values()].flatMap((m) => [...m.values()])) === sum(rp().orders.map((o) => o.quantity)), "member type matrix"));
test(81, "Unsupported recommendations are not fabricated", "governance", () => {
  const keys = Object.keys(rp());
  expect(!keys.some((k) => /recommend|suitab|score|insight/i.test(k)), "recommendation output");
});

/* ======================= Member 360 analytics (82–94) ======================= */

const richest = () => [...mem().members].sort((a, b) => memberBalances(walletStore.get(), schemeStore.get(), mem(), b.id).lifetime - memberBalances(walletStore.get(), schemeStore.get(), mem(), a.id).lifetime)[0];
const m360 = (id: string, uid = RAHUL) => view(A.member360(uid, id));
test(82, "Lifetime points earned", "deterministic", () => { const m = richest(); expect(m360(m.id).points.lifetimeEarned === memberBalances(walletStore.get(), schemeStore.get(), mem(), m.id).lifetime, "lifetime"); });
test(83, "Lifetime points redeemed", "deterministic", () => { const m = richest(); expect(m360(m.id).points.lifetimeRedeemed === memberBalances(walletStore.get(), schemeStore.get(), mem(), m.id).redeemed, "redeemed"); });
test(84, "Current available balance", "deterministic", () => { const m = richest(); expect(m360(m.id).points.available === memberBalances(walletStore.get(), schemeStore.get(), mem(), m.id).available, "available"); });
test(85, "Last scan", "deterministic", () => { const m = richest(); expect(m360(m.id).lastScan === ctx().scans.filter((s) => s.memberId === m.id && s.status === "success").map((s) => s.at).sort().slice(-1)[0], "last scan"); });
test(86, "Last redemption", "deterministic", () => { const m = richest(); expect(m360(m.id).lastRedemption === walletStore.get().redemptions.filter((r) => r.memberId === m.id).map((r) => r.createdAt).sort().slice(-1)[0], "last redemption"); });
test(87, "TDS by financial year (paid and kitty separate)", "deterministic", () => {
  const r = walletStore.get().redemptions.find((x) => x.tds.status === "recorded" && (x.tds.amountInr ?? 0) > 0)!;
  const v = m360(r.memberId);
  const recorded = sum(walletStore.get().redemptions.filter((x) => x.memberId === r.memberId && x.tds.status === "recorded").map((x) => x.tds.amountInr ?? 0));
  expect(sum(v.tds.map((t) => t.paidInr)) === recorded && v.tds.every((t) => /^FY\d{4}-\d{2}$/.test(t.fy) && "kittyPoints" in t), "TDS by FY");
});
test(88, "Branch mapping", "deterministic", () => { const m = richest(); expect(m360(m.id).mapping.branch === m.branchCode && m360(m.id).mapping.district === E.geoOf(m.branchCode).districtName, "branch"); });
test(89, "Registered by", "deterministic", () => { const m = richest(); expect(m360(m.id).mapping.registeredBy === m.registration.registeredBy, "registered by"); });
test(90, "Approved by", "deterministic", () => {
  const m = mem().members.find((x) => x.registration.stage1)!;
  expect(m360(m.id).mapping.approvedBy === (m.registration.stage2 ?? m.registration.stage1)!.by, "approved by");
});
test(91, "Three separate addresses", "governance", () => {
  const m = mem().members.find((x) => x.addresses.home && x.addresses.working && x.addresses.gift) ?? richest();
  const a = m360(m.id).addresses;
  expect(a.map((x) => x.kind).join() === "home,working,gift" && a.every((x) => x.address === m.addresses[x.kind] && x.updatedAt === (m.addresses[x.kind]?.updatedAt ?? null)), "addresses");
});
test(92, "Complete change history", "deterministic", () => {
  const m = mem().members.find((x) => mem().events.filter((e) => e.memberId === x.id && e.category === "profile").length) ?? richest();
  const ev = mem().events.filter((e) => e.memberId === m.id && ["profile", "address", "kyc", "registration", "restriction", "mpin"].includes(e.category));
  const ch = m360(m.id).changes;
  expect(ch.length === ev.length && ch.every((c) => "previous" in c && "updated" in c && "by" in c && "reason" in c), "history");
});
test(93, "Role / branch / district / sales rep filters", "governance", () => {
  const m = mem().members.find((x) => x.sr?.includes("USR-2006"))!;
  const f = A.member360List(RAHUL, { role: m.memberType, branch: m.branchCode, district: E.geoOf(m.branchCode).district, salesRep: m.sr! });
  expect(f.length > 0 && f.every((x) => x.memberType === m.memberType && x.branchCode === m.branchCode && x.sr === m.sr), "filters");
  const v = A.member360List(VIKRAM, {});
  expect(v.length > 0 && v.every((x) => x.programme === "EP" && x.branchCode === "TN-BR-CHENNAI-NORTH"), "sales rep scope");
  no(A.member360(VIKRAM, mem().members.find((x) => x.branchCode.startsWith("KL-"))!.id), "member outside scope");
});
test(94, "Permission-controlled export", "governance", () => {
  no(A.exportReport(VIKRAM, "RPT-M360", "csv", { role: null }, 3, { containsMembers: true }), "Sales Rep Member 360 export");
  const r = A.exportReport(RAHUL, "RPT-M360", "csv", { branch: "KL-BR-KOCHI" }, 5, { containsMembers: true });
  ok(r);
  expect(r.record!.sensitive && as().audit.some((a) => a.action === "report_exported" && a.entity === "RPT-M360" && a.sensitive), "export audit");
});

/* ======================= Member-facing analytics coverage (95–103) ======================= */

const appMember = () => richest().id;
test(95, "Wallet date filters", "deterministic", async () => {
  const id = appMember();
  const year = await analyticsApi.memberWallet(id, "2026-01-01", NOW);
  const month = await analyticsApi.memberWallet(id, "2026-11-01", NOW);
  const week = await analyticsApi.memberWallet(id, E.addDays(NOW, -6), NOW);
  const dayW = await analyticsApi.memberWallet(id, NOW, NOW);
  expect(year.earnedInPeriod >= month.earnedInPeriod && month.earnedInPeriod >= week.earnedInPeriod && week.earnedInPeriod >= dayW.earnedInPeriod && year.lifetimeEarned === memberBalances(walletStore.get(), schemeStore.get(), mem(), id).lifetime, "date windows");
  expect(["lifetimeEarned", "available", "redeemed", "schemePoints", "tdsDeductedPoints"].every((k) => k in year), "wallet fields");
});
test(96, "Earnings by category (earning lines only)", "deterministic", async () => {
  const id = appMember();
  const e = await analyticsApi.memberEarningsByCategory(id, "2020-01-01", NOW);
  expect(e.length > 0 && sum(e.map((x) => x.points)) === memberBalances(walletStore.get(), schemeStore.get(), mem(), id).lifetime, "earnings by category");
});
test(97, "Geo-tagged scan history, latest first", "deterministic", async () => {
  const geoMember = ctx().scans.find((s) => s.location.lat != null)!.memberId;
  const h = await analyticsApi.memberScanHistory(geoMember);
  expect(h.length > 0 && h.every((x, i, a) => i === 0 || a[i - 1].at >= x.at) && h.some((x) => x.geoTagged), "scan history");
});
test(98, "Claim ID", "deterministic", () => {
  const ids = ctx().scans.map((s) => s.claimId);
  expect(ids.every((c) => /^CLM-\d{9}$/.test(c)) && ctx().scans.every((s) => !/^[A-Z0-9]{12,}$/.test(s.qrMasked)), "claim IDs / masked QR");
});
test(99, "Passbook filters", "deterministic", async () => {
  const id = appMember();
  const all = await analyticsApi.memberPassbook(id);
  const done = await analyticsApi.memberPassbook(id, { status: "completed" });
  const sc = all.find((x) => x.schemeId)?.schemeId;
  const bySch = sc ? await analyticsApi.memberPassbook(id, { schemeId: sc }) : [];
  const region = await analyticsApi.memberPassbook(id, { region: all[0].region });
  expect(all.length > 0 && done.every((x) => x.status === "completed") && bySch.every((x) => x.schemeId === sc) && region.length === all.length, "passbook filters");
});
test(100, "CSV / PDF statement export", "deterministic", async () => {
  const id = appMember();
  const csv = await analyticsApi.memberStatement(id, "2026-01-01", NOW, "csv");
  const pdf = await analyticsApi.memberStatement(id, "2026-01-01", NOW, "pdf");
  expect(csv.body!.split("\n").length === csv.rows + 1 && pdf.body === null && !!pdf.pdf, "statement");
});
test(101, "Scheme and milestone progress", "deterministic", async () => {
  const id = schemeStore.get().accruals.find((a) => a.result === "credited" || a.result === "accrued")!.memberId;
  const p = await analyticsApi.memberSchemeProgress(id);
  expect(p.length > 0 && p.every((x) => x.achieved !== null || !!x.note) && p.every((x) => !x.next || x.next.remaining > 0), "progress");
});
test(102, "Home page date / product / category filtering", "deterministic", async () => {
  const id = appMember();
  const all = await analyticsApi.memberPassbook(id);
  const cat = all.find((x) => x.categoryId)?.categoryId;
  const f = cat ? await analyticsApi.memberPassbook(id, { categoryId: cat, from: "2026-01-01", to: NOW }) : [];
  expect(!!cat && f.every((x) => x.categoryId === cat && E.day(x.at) >= "2026-01-01"), "home filters");
});
test(103, "No duplicate mobile application screens are created", "governance", () => {
  expect(!ALL_NAV_ITEMS.some((i) => /member app|mobile app/i.test(i.label)) && !REPORTS.some((r) => /app screen/i.test(r.name)), "member app screens in portal");
});

/* ======================= Scan & QR reports (104–112) ======================= */

const sr = (uid = RAHUL, f: E.ScanFilter = {}) => A.scanReport(uid, f);
test(104, "Full QR scan detail", "deterministic", () => {
  const r = sr().rows.find((x) => x.type === "scan_out" && x.status === "success")!;
  expect(["id", "claimId", "qrMasked", "memberId", "programme", "scannedBy", "skuCode", "categoryId", "subCategoryId", "type", "at", "location", "branchCode", "salesperson", "channel", "status", "points", "failureReason", "schemeRef"].every((k) => k in r), "fields");
});
test(105, "Scan-In report", "deterministic", () => { const r = sr(RAHUL, { type: "scan_in" }).rows; expect(r.length > 0 && r.every((x) => x.type === "scan_in"), "scan-in"); });
test(106, "Scan-Out report", "deterministic", () => { const r = sr(RAHUL, { type: "scan_out" }).rows; expect(r.length > 0 && r.every((x) => x.type === "scan_out"), "scan-out"); });
test(107, "Only Scan-Out earns points", "governance", () => {
  const all = ctx().scans;
  const credits = ctx().lines.filter((l) => (l.type === "scan_credit" || l.type === "base_credit") && (l.bucket === "available" || l.bucket === "pending"));
  expect(all.filter((s) => s.type === "scan_in").every((s) => s.points === 0 && !s.ledgerRef), "Scan-In earned points");
  expect(sum(all.filter((s) => s.type === "scan_out").map((s) => s.points)) === sum(credits.map((l) => l.gross ?? l.points)), "Scan-Out points vs ledger credits");
});
test(108, "Parent-child mapping", "deterministic", () => {
  const r = A.parentChildReport(RAHUL).rows;
  expect(r.length > 0 && r.every((x) => x.parentPack && x.childUnit && x.parentSku && x.childSku) && r.some((x) => x.status === "mapping_missing"), "parent-child");
});
test(109, "Parent and child scan locations", "governance", () => {
  const sens = A.parentChildReport(RAHUL).rows.filter((x) => x.scan);
  const plain = A.parentChildReport(ANITA).rows.filter((x) => x.scan);
  expect(sens.length > 0 && sens.every((x) => x.scan!.memberId) && plain.every((x) => x.scan!.memberId === null), "child scan detail visibility");
});
test(110, "Salesperson Name field", "governance", () => {
  const r = sr().rows;
  expect(r.every((x) => x.salesperson === (mem().members.find((m) => m.id === x.memberId)?.sr ?? null)), "salesperson source");
  expect(sr(ANITA).rows.every((x) => x.salesperson === null && x.location.lat === null), "salesperson / location without View sensitive");
});
test(111, "OP-62 / OP-32 remain visible", "blocked", () => expect(dec("OP-62").status === "open" && as().config.salespersonField === "pending_business_confirmation" && as().config.parentChildVisibility === "pending_business_confirmation", "OP-62"));
test(112, "Member / transaction drill-down", "governance", () => {
  const s = sr().rows.find((x) => x.ledgerRef)!;
  const d = A.scanDetail(RAHUL, s.id);
  ok(d);
  expect(d.ledger?.id === s.ledgerRef && d.validation === "Accepted", "drill-down");
  const kl = ctx().scans.find((x) => x.branchCode.startsWith("KL-"))!;
  no(A.scanDetail(KA_ADMIN, kl.id), "scan outside regional scope");
});

/* ======================= Finance reports (113–126) ======================= */

const ag = (asOn = NOW, f = {}) => A.pointsAgeingReport(LAKSHMI, asOn, f);
test(113, "Points ageing as-on date", "deterministic", () => {
  const now = ag();
  const past = ag("2026-06-30");
  expect(now.check.every((c) => c.ageing === c.wallet) && past.check.every((c) => c.ageing === c.wallet) && sum(past.rows.map((r) => r.total)) !== sum(now.rows.map((r) => r.total)), "as-on cut-off");
});
test(114, "Member-wise ageing", "deterministic", () => {
  const r = ag();
  const m = richest();
  const avail = memberBalances(walletStore.get(), schemeStore.get(), mem(), m.id).available;
  expect(sum(r.rows.filter((x) => x.memberId === m.id).map((x) => x.total)) === Math.max(0, avail), "member total vs wallet available");
});
test(115, "Category-wise ageing", "deterministic", () => {
  const keys = ag().rows.map((r) => `${r.memberId}|${r.category}`);
  expect(new Set(keys).size === keys.length && new Set(ag().rows.map((r) => r.category)).size > 1, "category rows");
});
test(116, "Financial-year buckets from FY2021 to date", "deterministic", () => {
  expect(ag().buckets.join() === "FY2021-22,FY2022-23,FY2023-24,FY2024-25,FY2025-26,FY2026-27" && fyBuckets("2026-03-31").slice(-1)[0] === "FY2025-26", "FY buckets");
});
test(117, "Branch / district / role / category filters", "deterministic", () => {
  const b = ag(NOW, { branch: "KL-BR-KOCHI" }).rows;
  const d = ag(NOW, { district: "KL-ERNAKULAM" }).rows;
  const r = ag(NOW, { role: "Retailer" }).rows;
  const cat = ag().rows.find((x) => x.category !== "none")!.category;
  const c = ag(NOW, { categoryId: cat }).rows;
  expect(b.length && b.every((x) => x.branchCode === "KL-BR-KOCHI") && d.every((x) => x.branchCode.startsWith("KL-BR-")) && r.every((x) => x.role === "Retailer") && c.every((x) => x.category === cat), "filters");
});
test(118, "Excel export", "governance", () => {
  no(A.exportReport(ANITA, "RPT-AGEING", "xlsx", { asOn: NOW }, 10, { containsMembers: true }), "Client Admin finance export");
  ok(A.exportReport(LAKSHMI, "RPT-AGEING", "xlsx", { asOn: NOW }, ag().rows.length, { containsMembers: true }));
});
test(119, "CSV export", "deterministic", () => ok(A.exportReport(LAKSHMI, "RPT-AGEING", "csv", { asOn: NOW }, ag().rows.length, { containsMembers: true })));
test(120, "Pivot-friendly structure", "deterministic", () => {
  const r = ag();
  expect(r.rows.every((x) => r.buckets.every((b) => typeof x.buckets[b] === "number") && sum(r.buckets.map((b) => x.buckets[b])) === x.total), "pivot columns");
});
const month = () => walletStore.get().redemptions.find((r) => r.tds.status === "recorded" && (r.tds.amountInr ?? 0) > 0)!.createdAt.slice(0, 7);
const tds = (uid = LAKSHMI, f = {}, unmasked = false) => A.tdsLiabilityReport(uid, month(), f, unmasked);
test(121, "TDS monthly liability", "deterministic", () => expect(tds().rows.length > 0 && tds().rows.some((r) => r.tdsInr != null), "rows"));
test(122, "Required member and tax fields", "deterministic", () => {
  const r = tds().rows.find((x) => x.model === "On redemption")!;
  expect(["name", "memberId", "redeemValueInr", "taxableValueInr", "pan", "ratePct", "tdsInr"].every((k) => k in r) && r.taxableValueInr === null, "fields (taxable value not invented)");
});
test(123, "Role / branch filters", "deterministic", () => {
  const r = tds().rows[0];
  expect(tds(LAKSHMI, { role: r.role }).rows.every((x) => x.role === r.role) && tds(LAKSHMI, { branch: r.branchCode }).rows.every((x) => x.branchCode === r.branchCode), "filters");
});
test(124, "PAN masking", "governance", () => expect(tds().rows.filter((x) => x.pan).every((x) => x.pan!.startsWith("••••••") && x.pan!.length === 10), "masked PAN"));
test(125, "Finance-authorised unmasked export", "governance", () => {
  no(A.tdsLiabilityReport(ANITA, month(), {}, true), "Client Admin unmasked view");
  no(A.exportReport(RAHUL, "RPT-TDSM", "xlsx", { month: month() }, 3, { unmasked: true }), "Evolve Ops unmasked export");
  const u = A.tdsLiabilityReport(LAKSHMI, month(), {}, true);
  ok(u);
  const doc = mem().documents.find((d) => d.memberId === u.rows.find((x) => x.pan)?.memberId && d.type === "pan" && d.status === "approved");
  expect(u.rows.find((x) => x.pan)!.pan === doc?.maskedId && audited("pan_unmasked_view"), "PAN reference / audit");
  const e = A.exportReport(LAKSHMI, "RPT-TDSM", "xlsx", { month: month() }, u.rows.length, { unmasked: true });
  ok(e);
  expect(e.record!.unmasked && as().audit.some((a) => a.action === "report_exported" && a.entity === "RPT-TDSM" && a.sensitive), "unmasked export audit");
});
test(126, "TDS values reconcile with Phase 7 finance records", "deterministic", () => {
  const phase7 = sum(walletStore.get().redemptions.filter((r) => r.createdAt.startsWith(month()) && r.tds.status === "recorded" && r.stage !== "reversed" && r.stage !== "cancelled").map((r) => r.tds.amountInr ?? 0));
  expect(sum(tds().rows.map((r) => r.tdsInr ?? 0)) === phase7, "TDS reconciliation");
});

/* ======================= Programme reporting (127–132) ======================= */

const dd = () => view(A.programmeReport(RAHUL, "DD", F));
test(127, "Dedicated DD reporting area", "deterministic", () => expect(REPORTS.some((r) => r.id === "RPT-PRG-DD" && r.programmes.join() === "DD") && dd().members === mem().members.filter((m) => m.programme === "DD").length, "DD area"));
test(128, "DD scheme / slab reference", "deterministic", () => {
  const slab = schemeStore.get().schemes.filter((s) => s.versions.some((v) => v.config.basic.programmes.includes("DD") && v.config.slab.enabled)).map((s) => s.id);
  expect(dd().ddSpecific!.slabSchemes.join() === slab.join(), "slab schemes");
});
test(129, "OP-43 remains visible", "blocked", () => expect(dd().ddSpecific!.status === "business_confirmation_required" && dec("OP-43").status === "open" && REPORTS.find((r) => r.id === "RPT-PRG-DD")!.status === "business_confirmation_required", "OP-43"));
test(130, "Sales executive mapped-member scope", "governance", () => {
  const own = A.salesExecMembers(VIKRAM, VIKRAM);
  ok(own);
  expect(own.rows.length > 0 && own.rows.every((r) => mem().members.find((m) => m.id === r.id)!.sr!.includes("(USR-2006)")), "mapped members");
  expect(A.salesExecMembers(VIKRAM, "USR-2009").rows.length === 0, "other executive's members");
});
test(131, "Member 360 integration", "governance", () => {
  const own = A.salesExecMembers(VIKRAM, VIKRAM).rows;
  expect(own.every((r) => A.member360(VIKRAM, r.id).ok), "Member 360 for mapped members");
});
test(132, "Proposed job dashboard is not committed functionality", "blocked", () => {
  expect(REPORTS.find((r) => r.id === "RPT-JOBS")!.status === "proposed" && dec("MOD-12").status === "out_of_scope", "job dashboard");
  no(A.createSchedule(RAHUL, { reportId: "RPT-JOBS", name: "Jobs", recipients: [RAHUL], recipientGroup: null, frequency: "daily", day: null, time: "08:00", dateRange: "Yesterday", filters: {}, format: "csv", startDate: NOW, endDate: null }), "scheduling the proposed job dashboard");
});

/* ======================= Export, scheduling and alerts (133–145) ======================= */

const FILT = { period: "2026-10-11 → 2026-11-09", programmes: ["EP", "Retailer"], state: "KL" };
test(133, "Dashboard PDF", "governance", () => {
  no(A.exportReport(VIKRAM, "RPT-OVERVIEW", "pdf", FILT, 11), "Sales Rep dashboard export");
  ok(A.exportReport(RAHUL, "RPT-OVERVIEW", "pdf", FILT, 11));
});
test(134, "Dashboard PNG", "deterministic", () => ok(A.exportReport(RAHUL, "RPT-OVERVIEW", "png", FILT, 11)));
test(135, "Report Excel", "deterministic", () => ok(A.exportReport(RAHUL, "RPT-QR", "xlsx", FILT, 50, { containsMembers: true })));
test(136, "Report CSV", "deterministic", () => {
  ok(A.exportReport(RAHUL, "RPT-QR", "csv", FILT, 50, { containsMembers: true }));
  no(A.exportReport(RAHUL, "RPT-OVERVIEW", "csv", FILT, 1), "format the report does not offer");
});
test(137, "Export preserves the selected filters", "deterministic", () => {
  const e = as().exports.filter((x) => x.reportId === "RPT-QR" && x.status === "generated").slice(-1)[0];
  expect(JSON.stringify(e.filters) === JSON.stringify(FILT) && e.sourceTimestamp === as().refreshedAt, "filters / source timestamp");
});
test(138, "Export history", "governance", () => {
  expect(A.exportHistory(RAHUL).length >= A.exportHistory(LAKSHMI).length && A.exportHistory(LAKSHMI).every((e) => e.by === LAKSHMI), "history scope");
  expect(as().exports.some((e) => e.status === "refused"), "refusals not recorded");
});
let weekly = "";
test(139, "Weekly scheduled report", "governance", () => {
  const r = A.createSchedule(LAKSHMI, { reportId: "RPT-POINTS", name: "Weekly points flow", recipients: [LAKSHMI, ANITA], recipientGroup: "Finance and V-Guard HO (test)", frequency: "weekly", day: "Monday", time: "08:00", dateRange: "Last 7 days", filters: FILT, format: "xlsx", startDate: NOW, endDate: null });
  ok(r);
  weekly = r.id!;
  const s = as().schedules.find((x) => x.id === weekly)!;
  expect(new Date(`${s.nextRun.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1 && s.nextRun > NOW, "next Monday");
  return s.nextRun;
});
test(140, "Daily operational report", "deterministic", () => {
  const r = A.createSchedule(RAHUL, { reportId: "RPT-ENGAGE", name: "Daily engagement", recipients: [RAHUL], recipientGroup: null, frequency: "daily", day: null, time: "07:30", dateRange: "Yesterday", filters: {}, format: "csv", startDate: NOW, endDate: null });
  ok(r);
  expect(as().schedules.find((x) => x.id === r.id)!.nextRun === `${E.addDays(NOW, 1)}T07:30`, "daily next run");
});
test(141, "Recipient scope validation", "governance", () => {
  no(A.createSchedule(RAHUL, { reportId: "RPT-OVERVIEW", name: "x", recipients: [VIKRAM], recipientGroup: null, frequency: "daily", day: null, time: "07:00", dateRange: "Yesterday", filters: {}, format: "pdf", startDate: NOW, endDate: null }), "recipient without access");
  no(A.createSchedule(RAHUL, { reportId: "RPT-OVERVIEW", name: "x", recipients: [], recipientGroup: null, frequency: "daily", day: null, time: "07:00", dateRange: "Yesterday", filters: {}, format: "pdf", startDate: NOW, endDate: null }), "default / empty recipients");
  no(A.createSchedule(RAHUL, { reportId: "RPT-AGEING", name: "x", recipients: [RAHUL], recipientGroup: null, frequency: "daily", day: null, time: "07:00", dateRange: "Yesterday", filters: {}, format: "csv", startDate: NOW, endDate: null }), "scheduling a report the creator cannot view");
  expect(A.recipientCheck("RPT-TDSM", RAHUL) !== null && A.recipientCheck("RPT-TDSM", LAKSHMI) === null, "finance recipient check");
});
test(142, "Delivery status (and duplicate execution)", "governance", () => {
  const s = as().schedules.find((x) => x.id === weekly)!;
  const r = A.runSchedule("SYSTEM", weekly, s.nextRun, () => 12);
  ok(r);
  const run = as().runs.find((x) => x.id === r.runId)!;
  expect(run.status === "delivered" && run.deliveries.every((d) => d.status === "delivered" && d.commId && commsStore.get().communications.some((c) => c.id === d.commId)), "delivery");
  no(A.runSchedule("SYSTEM", weekly, s.nextRun, () => 12), "duplicate slot");
  expect(as().runs.some((x) => x.status === "duplicate_skipped") && as().schedules.find((x) => x.id === weekly)!.lastStatus === "delivered", "duplicate skipped");
});
let thr = "";
test(143, "Threshold alert configuration", "governance", () => {
  no(A.saveThreshold(ANITA, { kpiId: "KPI-DAU", condition: "below", value: 1000, period: "Daily", scope: { programmes: [], geography: null }, recipients: [RAHUL], channel: "email", effectiveFrom: null }), "Client Admin threshold");
  const r = A.saveThreshold(RAHUL, { kpiId: "KPI-DAU", condition: "below", value: 1000, period: "Daily", scope: { programmes: [], geography: null }, recipients: [RAHUL, ANITA], channel: "email", effectiveFrom: null });
  ok(r);
  thr = r.id!;
  const t = as().thresholds.find((x) => x.id === thr)!;
  expect(t.status === "draft" && t.confirmation === "pending_business_confirmation" && t.version === 1, "draft");
});
test(144, "OP-ALERT1 remains visible", "blocked", () => {
  expect(dec("OP-ALERT1").status === "open", "OP-ALERT1");
  no(A.activateThreshold(RAHUL, thr), "activation while OP-ALERT1 is open");
});
test(145, "Unconfirmed thresholds are not activated", "governance", () => {
  const comms = commsStore.get().communications.length;
  const r = A.evaluateThreshold(RAHUL, thr);
  ok(r);
  const a = as().alerts.slice(-1)[0];
  expect(r.triggered && a.mode === "evaluation_only" && a.notification === "not_sent" && a.commId === null && commsStore.get().communications.length === comms, "draft alert dispatched");
});

/* ======================= Data consistency (146–155) ======================= */

const recon = (id: string) => A.reconciliation(RAHUL).find((x) => x.id === id)!;
test(146, "Identical KPI shows identical values across dashboard and report", "deterministic", () => {
  const k = A.kpiValues(RAHUL, NOW);
  const e = eg();
  const churn = view(A.retentionView(RAHUL, F)).churn.slice(-1)[0];
  expect(k["KPI-DAU"].value === e.dauToday && recon("kpi-dau").status === "matched" && k["KPI-CHURN"].value === (churn.rate == null ? null : churn.rate * 100), "KPI consistency");
  expect(KPI_SEED.every((s) => kpi(s.id).id === s.id), "dictionary IDs");
});
test(147, "Points issued reconcile with the ledger", "deterministic", () => expect(recon("points-issued").status === "matched", "issued"));
test(148, "Points redeemed reconcile with redemption", "deterministic", () => expect(recon("points-redeemed").status === "matched", "redeemed"));
test(149, "Scheme points reconcile with the scheme service", "deterministic", () => expect(recon("scheme-points").status === "matched", "scheme"));
test(150, "TDS reconciles with the finance service", "deterministic", () => expect(recon("tds").status === "matched" && recon("tds").analytics > 0, "TDS"));
test(151, "Scan success rate reconciles with scan attempts", "deterministic", () => {
  expect(recon("scan-success").status === "matched", "scan credits");
  const k = A.kpiValues(RAHUL, NOW)["KPI-SCAN"].value!;
  const s = E.scanSuccess(ctx().scans.filter((x) => E.day(x.at) <= NOW), "scan_out");
  expect(Math.abs(k - s.rate! * 100) < 1e-9, "KPI vs scan attempts");
});
test(152, "Stale data is identified", "governance", () => {
  no(A.setSourceAvailability(ANITA, "fraud", false), "Client Admin source control");
  ok(A.setSourceAvailability(RAHUL, "fraud", false));
  const f = A.freshness("fraud");
  ok(A.setSourceAvailability(RAHUL, "fraud", true));
  expect(f.status === "stale" && f.lastRefresh === as().refreshedAt && A.freshness("fraud").status === "near_real_time", "stale state");
});
test(153, "Missing data is not silently displayed as zero", "governance", () => {
  const k = A.kpiValues(RAHUL);
  expect(["KPI-LTV", "KPI-CAC", "KPI-PAYBACK", "KPI-NPS", "KPI-FRAUD"].every((id) => k[id].value === null) && E.ratio(5, 0) === null && view(A.supportView(RAHUL, F)).byType.every((t) => t.satisfaction === null), "nulls");
});
test(154, "Exports preserve filters and source timestamps (reproducible runs)", "deterministic", () => {
  const rows = view(A.pointsFlowView(RAHUL, F30)).lines;
  const a = A.executeReport(RAHUL, "RPT-POINTS", { period: `${F30.from} → ${F30.to}` }, rows);
  const b = A.executeReport(RAHUL, "RPT-POINTS", { period: `${F30.from} → ${F30.to}` }, view(A.pointsFlowView(RAHUL, F30)).lines);
  ok(a);
  ok(b);
  const ea = as().executions.find((x) => x.id === a.executionId)!, eb = as().executions.find((x) => x.id === b.executionId)!;
  expect(ea.checksum === eb.checksum && ea.kpiVersions["KPI-SCAN"] === 2 && ea.sourceTimestamp === as().refreshedAt && ea.filters.period === `${F30.from} → ${F30.to}`, "reproducibility");
});
test(155, "Unauthorised report access is blocked", "governance", () => {
  no(A.engagement(VIKRAM, F), "Sales Rep business dashboard");
  no(A.scanReport(VIKRAM), "Sales Rep scan report");
  no(A.pointsAgeingReport(RAHUL, NOW, {}), "Evolve Ops finance report");
  expect(A.scanReport(TANUJIT).rows.every((r) => r.location.lat === null && r.salesperson === null), "Super Admin precise location");
  no(A.tdsLiabilityReport(TANUJIT, month(), {}, true), "Super Admin unmasked PAN");
  const ka = A.scanReport(KA_ADMIN).rows;
  expect(ka.length > 0 && ka.every((r) => r.branchCode.startsWith("KA-")), "regional scope");
  expect(!("commit" in A) && !("setState" in A), "raw write path exported");
  return `KA Regional Admin sees ${ka.length} of ${ctx().scans.length} scans`;
});

/* ---------------- Report ---------------- */
void giftsStore;
void riskStore;
Promise.all(pending).then(() => {
  results.sort((a, b) => a.n - b.n);
  const pass = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const byKind = (k: Kind) => results.filter((r) => r.kind === k);
  console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
  if (pass !== results.length) process.exit(1);
});
