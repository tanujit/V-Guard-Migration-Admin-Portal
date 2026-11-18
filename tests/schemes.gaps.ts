/**
 * Phase 6 audit — financial-integrity GAP PROBES (not part of the 87-case acceptance suite).
 *   npm run test:schemes:gaps
 * Each probe reproduces a suspected defect against the real engine / store and reports
 * "GAP CONFIRMED" or "OK (no gap)". Probes never assert invented business values: they check
 * internal consistency (configured rules vs what the engine does). Exit code is always 0.
 */
import { decideRequest } from "@/features/approvals/store";
import { approvalStore } from "@/features/approvals/store";
import { masterStore } from "@/features/masters/store";
import { memberStore } from "@/features/members/store";
import * as E from "@/features/schemes/engine";
import { evaluatePeriod, evaluateTxn, memberEligible, windowNetQuantity } from "@/features/schemes/mockEngine";
import * as S from "@/features/schemes/store";
import type { Scheme, SchemeConfig, SchemeState, SourceTxn } from "@/types/schemes";

const RAHUL = "USR-1003", ANITA = "USR-2001", LAKSHMI = "USR-2003";
const TODAY = "2026-11-09";
const st = () => S.schemeStore.get();
const ms = () => masterStore.get();
const mem = () => memberStore.get();
const sc = (id: string) => E.schemeById(st(), id)!;
const ctx = { ms: ms(), now: `${TODAY}T15:00`, origin: "live_mock" as const, memberOf: (id: string) => mem().members.find((m) => m.id === id), restrictions: mem().restrictions }; // same context the store passes
const txn = (p: Partial<SourceTxn> & Pick<SourceTxn, "memberId" | "skuId">): SourceTxn => { const m = mem().members.find((x) => x.id === p.memberId)!; return { id: `TXN-PROBE-${Math.random().toString(36).slice(2, 7)}`, kind: "scan", programme: m.programme, branchCode: m.branchCode, qty: 1, date: TODAY, originalTxnId: null, ...p }; };
/** A clone of an active scheme with a replaced configuration, active from its start date. */
function withConfig(base: Scheme, patch: (c: SchemeConfig) => SchemeConfig): { s: SchemeState; scheme: Scheme } {
  const v = E.versionOf(base, base.activeVersion)!;
  const scheme: Scheme = { ...base, id: "SCH-PROBE", status: "active", activeVersion: 1, versions: [{ ...v, version: 1, status: "active", effectiveStart: patch(v.config).duration.start, effectiveEnd: null, config: patch(structuredClone(v.config)) }] };
  return { s: { ...st(), schemes: [...st().schemes, scheme] }, scheme };
}

const out: { id: string; area: string; title: string; gap: boolean; evidence: string }[] = [];
function probe(id: string, area: string, title: string, fn: () => { gap: boolean; evidence: string }) {
  try { out.push({ id, area, title, ...fn() }); } catch (e) { out.push({ id, area, title, gap: true, evidence: `Probe error: ${(e as Error).message}` }); }
}

probe("G1", "Partial settlement", "A during-scheme tranche can be requested again and release more than its configured %", () => {
  // SCH-0002: T1 60% during scheme, T2 40% final. SET-0002 already released 60% of Sep–Oct accruals.
  const p = E.settlementPreview(st(), sc("SCH-0002"), "T1", "2026-09-01", "2026-10-31", TODAY);
  const acc = st().accruals.filter((a) => p.accruals.some((x) => x.id === a.id));
  const cumulative = acc.map((a) => (a.releasedPoints + (p.lines.find((l) => l.id === a.id)?.release ?? 0)) / a.points);
  const max = Math.max(0, ...cumulative);
  return { gap: max > 0.6 + 1e-9, evidence: `A second T1 request over the same range would release ${p.releasePoints} more points; cumulative release per accrual reaches ${(max * 100).toFixed(0)}% against a configured 60% during-scheme share (T2 is supposed to hold 40% until final settlement)` };
});

probe("G2", "Partial settlement", "Month-end tranche accepts a range that does not end on a month end", () => {
  const c = E.settlementPreview(st(), sc("SCH-0003"), "T1", "2026-10-01", "2026-10-29", TODAY).checks.find((x) => x.label.startsWith("Closure"))!;
  return { gap: c.ok, evidence: `Range ending 2026-10-29 → criteria check "${c.ok ? "passed" : "failed"}" (${c.detail}). The check only tests day ≥ 28` };
});

probe("G3", "Eligibility", "Members under a Program Block / Temporary Hold still earn in the mock engine", () => {
  // MBR-CS-0002 is under Program Block RST-0001 (CS). Probe with an active all-branch CS solar scheme.
  const { s, scheme } = withConfig(sc("SCH-0002"), (c) => ({ ...c, basic: { ...c.basic, programmes: ["CS"] }, products: { allProducts: false, categoryIds: ["CAT-008"], subCategoryIds: [], skuIds: [] }, eligibility: { ...c.eligibility, branchScope: { allBranches: true, stateCodes: [], districtCodes: [], branchCodes: [] } }, base: { ...c.base, rows: [{ id: "BP-1", level: "category", refId: "CAT-008", programme: "CS", branchCodes: "all", points: 20, qualifying: "" }] }, duration: { ...c.duration, start: "2026-11-01", end: "2026-12-31" }, milestone: { ...c.milestone, enabled: false } }));
  const solar = ms().skus.find((k) => k.status === "active" && k.programmes.includes("CS"))!;
  const ev = evaluateTxn(s, ctx, txn({ memberId: "MBR-CS-0002", skuId: solar.id, qty: 2 }), scheme.id);
  const restricted = mem().restrictions.some((r) => r.status !== "lifted" && r.memberIds.includes("MBR-CS-0002"));
  return { gap: restricted && ev.candidates.length > 0, evidence: `MBR-CS-0002 under Program Block=${restricted}; scan of ${solar.code} → ${ev.candidates.length ? `credited ${ev.candidates[0].points} points` : ev.trace[0]?.result}` };
});

probe("G4", "Eligibility", "Elite / group / segment eligibility is not enforced by the engine", () => {
  const { s, scheme } = withConfig(sc("SCH-0002"), (c) => ({ ...c, eligibility: { ...c.eligibility, elite: "elite_only", segments: ["DEV-SEG-ELITE"] } }));
  const el = memberEligible(s, scheme, E.versionOf(scheme, 1)!.config, mem().members.find((m) => m.id === "MBR-RT-0001"), "Retailer", "KL-BR-KOCHI");
  return { gap: el.ok, evidence: `Elite-only scheme: MBR-RT-0001 (no Elite attribute exists) → eligible=${el.ok} (${el.reason}). Expected: "cannot evaluate", like unconnected targeting` };
});

probe("G5", "Targeting", "Product, date-range and event targeting conditions are ignored when crediting", () => {
  const { s, scheme } = withConfig(sc("SCH-0001"), (c) => ({ ...c, targeting: [{ id: "T1", dimension: "product_category", operator: "in", values: ["CAT-002"], days: null, pct: null }, { id: "T2", dimension: "date_range", operator: "in", values: ["2027-01-01..2027-01-31"], days: null, pct: null }] }));
  const ev = evaluateTxn(s, ctx, txn({ memberId: "MBR-EP-0005", skuId: "SKU-00001" }), scheme.id);
  return { gap: ev.candidates.length > 0, evidence: `Targeting says category CAT-002 (stabilizers) and January only; a wire scan on ${TODAY} → ${ev.candidates.length ? `credited ${ev.candidates[0].points} points` : "not credited"}` };
});

probe("G6", "Quantity-based", "Quantity period setting is not used; windows come only from Duration & evaluation", () => {
  const c = E.displayVersion(sc("SCH-0008")).config; // quantity.period = monthly, duration monthly periodic
  const custom = { ...c.duration, type: "custom" as const, evaluation: "cumulative" as const };
  const w = E.quantityWindows({ ...c, duration: custom });
  return { gap: c.quantity.period === "monthly" && w.length === 1, evidence: `quantity.period=${c.quantity.period}; with Duration=custom/cumulative quantity is evaluated in ${w.length} window(s) for ${custom.start}..${custom.end}` };
});

probe("G7", "Applicability", "Inactive / draft SKUs inside a category are credited", () => {
  const inactive = ms().skus.find((k) => k.status !== "active" && E.skuCategory(ms(), k.id).categoryId === "CAT-004")!;
  const ev = evaluateTxn(st(), ctx, txn({ memberId: "MBR-RT-0001", skuId: inactive.id, qty: 1 }), "SCH-0002");
  return { gap: ev.candidates.length > 0, evidence: `${inactive.code} (status ${inactive.status}) scanned in SCH-0002 → ${ev.candidates.length ? `credited ${ev.candidates[0].points} points` : ev.trace[0]?.result}` };
});

probe("G8", "Applicability", "Inactive branches inside the scope are credited although validation says they are ignored", () => {
  const inactive = ms().hierarchy.find((h) => h.level === "branch" && h.status === "inactive")!.code;
  const m = mem().members.find((x) => x.branchCode === inactive && x.programme === "EP");
  if (!m) return { gap: false, evidence: `No EP member at ${inactive}` };
  const { s, scheme } = withConfig(sc("SCH-0001"), (c) => ({ ...c, eligibility: { ...c.eligibility, branchScope: { allBranches: true, stateCodes: [], districtCodes: [], branchCodes: [] } }, base: { ...c.base, rows: c.base.rows.map((r) => ({ ...r, branchCodes: "all" as const })) } }));
  const ev = evaluateTxn(s, ctx, txn({ memberId: m.id, skuId: "SKU-00001" }), scheme.id);
  return { gap: ev.candidates.length > 0, evidence: `${m.id} at inactive branch ${inactive} → ${ev.candidates.length ? `credited ${ev.candidates[0].points} points` : ev.trace[0]?.result}` };
});

probe("G9", "Slab reversal", "A sales return reduces the window it is dated in, not the window of the original sale", () => {
  const ret = st().txns.find((t) => t.kind === "sales_return")!;
  const orig = st().txns.find((t) => t.id === ret.originalTxnId)!;
  const nov = { from: "2026-11-01", to: "2026-11-30" };
  const cfg3 = E.displayVersion(sc("SCH-0003")).config;
  const net = (s: SchemeState) => windowNetQuantity(s, ms(), cfg3, ret.memberId, nov, TODAY);
  const withRet = net(st());
  const without = net({ ...st(), txns: st().txns.filter((t) => t.id !== ret.id) });
  return { gap: orig.date < nov.from && withRet !== without, evidence: `Return ${ret.id} (${ret.date}) reverses sale ${orig.id} (${orig.date}); November net quantity for ${ret.memberId}: ${without} without the return, ${withRet} with it. October is only flagged pending` };
});

probe("G10", "Settlement", "Execution does not re-check reversal/validation checks raised after the request", () => {
  // Raise a during-scheme release on SCH-0002, then record a sales return in the same range, then approve both stages.
  const r = S.createSettlementRequest(RAHUL, "SCH-0002", "T1", "2026-11-01", TODAY);
  if (!r.ok) return { gap: false, evidence: `No new release possible to test (${r.errors[0]})` };
  const req = st().settlements.find((x) => x.id === r.id)!;
  const accrual = st().accruals.find((a) => req.accrualIds.includes(a.id))!;
  const scan = st().txns.find((t) => t.memberId === accrual.memberId && t.kind === "scan" && t.date >= "2026-11-01")!;
  S.postMockTransaction(RAHUL, { memberId: scan.memberId, skuId: scan.skuId, qty: 1, date: TODAY, kind: "sales_return", originalTxnId: scan.id });
  const pendingRev = st().accruals.filter((a) => a.schemeId === "SCH-0002" && a.result === "reversal_pending").length;
  const id = req.approvalRequestId!;
  decideRequest(ANITA, id, "approve", "probe", approvalStore.get().requests.find((x) => x.id === id)!.seq);
  decideRequest(LAKSHMI, id, "approve", "probe", approvalStore.get().requests.find((x) => x.id === id)!.seq);
  const executed = st().settlements.find((x) => x.id === r.id)!.status === "executed";
  return { gap: pendingRev > 0 && executed, evidence: `${pendingRev} reversal(s) pending on SCH-0002 at execution of ${r.id}; settlement status after both approvals: ${st().settlements.find((x) => x.id === r.id)!.status}` };
});

probe("G11", "Combined rules", "Milestones accrue mid-window without the combined-rule relationship being met", () => {
  const { s, scheme } = withConfig(sc("SCH-0002"), (c) => ({ ...c, milestone: { ...c.milestone, measure: "quantity", levels: [{ id: "M1", name: "Probe level", threshold: 1, reward: { kind: "fixed_points", value: 1, formulaId: null } }] }, quantity: { ...c.quantity, enabled: true, threshold: 9999, useSlabs: false, reward: { kind: "fixed_points", value: 1, formulaId: null } }, combined: { enabled: true, components: ["quantity", "milestone"], relation: "all_of", dependencies: [], note: "" } }));
  const ev = evaluatePeriod(s, { ...ctx, replay: false }, scheme, { from: "2026-09-01", to: "2026-12-31" }, TODAY);
  const ms1 = ev.candidates.filter((c) => c.component === "milestone").length;
  return { gap: ms1 > 0, evidence: `Quantity + Milestone (all of), quantity threshold unreachable: ${ms1} milestone reward(s) generated before the window closed` };
});

probe("G12", "Slabs", "Slabs with different achievement bases are accepted; the engine uses only the first slab's basis", () => {
  const c = E.displayVersion(sc("SCH-0003")).config;
  const mixed = { ...c, slab: { ...c.slab, slabs: c.slab.slabs.map((x, i) => (i === 1 ? { ...x, achievement: "points" as const } : x)) } };
  const v = E.validateConfig(st(), ms(), "SCH-0003", mixed, { today: TODAY });
  return { gap: !v.errors.some((e) => /achievement/i.test(e)), evidence: `Mixed quantity/points slabs → ${v.errors.length} error(s), none about the achievement basis` };
});

probe("G13", "Concurrency", "Exclusivity uses any past participation, not participation inside the rule's effective period", () => {
  // EXR-0001 (SCH-0001 ⟂ SCH-0015) is effective from 2026-11-01. Find an EP Kerala member whose SCH-0001 credits are all in October.
  const octOnly = Array.from(new Set(st().accruals.filter((a) => a.schemeId === "SCH-0001" && a.result === "credited").map((a) => a.memberId))).find((m) => st().accruals.filter((a) => a.schemeId === "SCH-0001" && a.memberId === m && a.result === "credited").every((a) => a.effectiveDate < "2026-11-01"));
  if (!octOnly) return { gap: false, evidence: "No member with only pre-rule participation" };
  return { gap: true, evidence: `${octOnly} took part in SCH-0001 only before 1 Nov; postCandidates' participation check has no date bound, so any November SCH-0015 credit is excluded. Interpretation needs confirmation (SCH-Q10)` };
});

probe("G14", "Special-member extension", "An approved member extension earns nothing when Base Points rows are branch-specific", () => {
  const ext = st().extensions.find((e) => e.id === "EXT-0001")!;
  const m = mem().members.find((x) => x.id === ext.memberIds[0])!;
  const credits = st().accruals.filter((a) => a.schemeId === ext.schemeId && a.memberId === m.id && a.result === "credited");
  const scans = st().txns.filter((t) => t.memberId === m.id && t.kind === "scan" && t.date >= ext.effectiveFrom).length;
  return { gap: scans > 0 && credits.length === 0, evidence: `${ext.id} extends ${ext.schemeId} to ${m.id} (${m.branchCode}); ${scans} in-scope scans after ${ext.effectiveFrom}, ${credits.length} credits. The scheme's rows list Kerala branches only, so no row matches the member's branch` };
});

for (const o of out) console.log(`${o.gap ? "GAP CONFIRMED" : "OK (no gap)  "}  ${o.id}  [${o.area}] ${o.title}\n               ${o.evidence}`);
console.log(`\n${out.filter((o) => o.gap).length} of ${out.length} probes confirmed a gap`);
