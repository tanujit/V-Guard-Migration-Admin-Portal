/**
 * Phase 6 — Scheme & Incentive Management test suite (Section 20, cases 1–87; audit additions 88–107; fix regressions 108–118; start-up decoupling 119).
 * Runs the real store, engine and approval engine in Node against the development seed:
 *   npm run test:schemes
 * Cases whose calculation is fully defined by an explicit configured value assert deterministic
 * outputs (inputs are test fixtures, not business values). Cases whose rule is unconfirmed assert
 * that the system BLOCKS them; no invented financial value is ever expected.
 */
import { accessStore } from "@/features/access/store";
import { hasPermission } from "@/features/access/engine";
import { approvalStore, decideRequest, runExecution } from "@/features/approvals/store";
import { masterStore } from "@/features/masters/store";
import { memberStore } from "@/features/members/store";
import * as E from "@/features/schemes/engine";
import { evaluatePeriod, evaluateTxn, memberEligible, postCandidates, txnTargeting, windowNetQuantity, type Candidate } from "@/features/schemes/mockEngine";
import * as S from "@/features/schemes/store";
import { branchesIn, cfg } from "@/data/mock/schemeSeed";
import type { SchemeConfig } from "@/types/schemes";
import { buildModuleScenarioSteps } from "@/features/approvals/moduleScenarios";
import { MODULE_APPROVAL_STEPS } from "@/data/mock/generated/approvalModuleSteps";

const RAHUL = "USR-1003", ANITA = "USR-2001", LAKSHMI = "USR-2003", JOSEPH = "USR-2004", TANUJIT = "USR-1001";
const st = () => S.schemeStore.get();
const ms = () => masterStore.get();
const mem = () => memberStore.get();
const TODAY = "2026-11-09";

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: number; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
function test(n: number, name: string, kind: Kind, fn: () => string | void) {
  try {
    const d = fn();
    results.push({ n, name, kind, ok: true, detail: d ?? "" });
  } catch (e) {
    results.push({ n, name, kind, ok: false, detail: (e as Error).message });
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string, action: "approve" | "reject" | "return", remarks = "Reviewed in test") => decideRequest(uid, id, action, remarks, req(id).seq);
const sc = (id: string) => E.schemeById(st(), id)!;
const KL = branchesIn(["KL"]);

const base: SchemeConfig = cfg({
  basic: { name: "TEST EP Wires Kerala", code: "TEST-EP-WIRE", description: "Test fixture", type: "base", level: "L0", programmes: ["EP"] },
  products: { allProducts: false, categoryIds: ["CAT-001"], subCategoryIds: [], skuIds: [] },
  eligibility: { branchScope: { allBranches: false, stateCodes: ["KL"], districtCodes: [], branchCodes: [] } },
  base: { enabled: true, rows: [{ id: "BP-1", level: "sub_category", refId: "SUB-011", programme: "EP", branchCodes: KL, points: 7, qualifying: "Per unit" }], qualifyingCriteria: "Scan-In" },
  duration: { type: "custom", start: "2026-11-01", end: "2027-01-31", evaluation: "cumulative" },
  budget: { amount: 50000, alertPct: 80 },
});
let newId = "";
let newReq = "";

/* ---------------- Scheme configuration (1–10) ---------------- */
test(1, "Create a basic scheme", "governance", () => {
  const r = S.saveSchemeDraft(RAHUL, null, base, "Test scheme");
  expect(r.ok && r.id, r.errors.join("; "));
  newId = r.id!;
  expect(sc(newId).status === "draft", `status ${sc(newId).status}`);
  return `${newId} created as Draft`;
});
test(2, "Configure multiple programmes", "deterministic", () => {
  const c = cfg({ ...base, basic: { ...base.basic, programmes: ["EP", "Retailer"] }, base: { ...base.base, rows: [...base.base.rows, { ...base.base.rows[0], id: "BP-2", programme: "Retailer" }] } });
  const v = E.validateConfig(st(), ms(), null, c, { today: TODAY });
  expect(!v.errors.some((e) => e.includes("programme")), v.errors.join("; "));
  const bad = E.validateConfig(st(), ms(), null, cfg({ ...c, basic: { ...c.basic, programmes: ["EP", "CS"] } }), { today: TODAY });
  expect(bad.errors.some((e) => e.includes("No selected SKU is eligible for programme CS")), "CS should be rejected for wires");
  return "EP + Retailer valid; CS rejected because no wire SKU is CS-eligible";
});
test(3, "Configure different branches", "deterministic", () => {
  const c = cfg({ ...base, base: { ...base.base, rows: [{ ...base.base.rows[0], branchCodes: ["KL-BR-KOCHI"], points: 7 }, { ...base.base.rows[0], id: "BP-2", branchCodes: ["KL-BR-ALUVA"], points: 9 }] } });
  const a = E.basePointsFor(ms(), c, "SKU-00001", "KL-BR-KOCHI", "EP");
  const b = E.basePointsFor(ms(), c, "SKU-00001", "KL-BR-ALUVA", "EP");
  expect(a && "pointsPerUnit" in a && a.pointsPerUnit === 7 && b && "pointsPerUnit" in b && b.pointsPerUnit === 9, "branch values differ");
  return "Kochi 7 / Aluva 9 points per unit";
});
test(4, "Configure different SKU values", "deterministic", () => {
  const c = cfg({ ...base, base: { ...base.base, rows: [{ ...base.base.rows[0], level: "sku", refId: "SKU-00001", points: 5 }, { ...base.base.rows[0], id: "BP-2", level: "sku", refId: "SKU-00002", points: 8 }] } });
  const a = E.basePointsFor(ms(), c, "SKU-00001", "KL-BR-KOCHI", "EP");
  const b = E.basePointsFor(ms(), c, "SKU-00002", "KL-BR-KOCHI", "EP");
  expect(a && "pointsPerUnit" in a && a.pointsPerUnit === 5 && b && "pointsPerUnit" in b && b.pointsPerUnit === 8, "SKU values");
  const overlap = E.validateConfig(st(), ms(), null, cfg({ ...c, base: { ...c.base, rows: [...c.base.rows, { ...base.base.rows[0], id: "BP-3" }] } }), { today: TODAY });
  expect(overlap.errors.some((e) => e.includes("different hierarchy levels")), "overlap across levels must be an error");
  return "SKU-00001 5 / SKU-00002 8; cross-level overlap rejected (precedence not assumed)";
});
test(5, "Configure one member or multiple members", "deterministic", () => {
  const one = E.eligiblePopulation(mem(), ms(), cfg({ ...base, eligibility: { ...base.eligibility, selectedMemberIds: ["MBR-EP-0005"] } }));
  const many = E.eligiblePopulation(mem(), ms(), cfg({ ...base, eligibility: { ...base.eligibility, selectedMemberIds: ["MBR-EP-0005", "MBR-EP-0004"] } }));
  expect(one.count === 1 && many.count === 2, `${one.count} / ${many.count}`);
  return "1 and 2 members";
});
test(6, "Configure a custom duration", "deterministic", () => {
  const w = E.evaluationWindows({ type: "custom", start: "2026-11-01", end: "2027-01-31", evaluation: "periodic" });
  expect(w.length === 1 && w[0].from === "2026-11-01" && w[0].to === "2027-01-31", JSON.stringify(w));
});
test(7, "Save draft and resume", "governance", () => {
  const c = cfg({ ...base, basic: { ...base.basic, description: "Resumed draft" } });
  const r = S.saveSchemeDraft(RAHUL, newId, c, "Edit description");
  expect(r.ok, r.errors.join("; "));
  expect(sc(newId).versions.length === 1 && E.latestVersion(sc(newId)).config.basic.description === "Resumed draft", "draft updated in place");
});
test(8, "Submit scheme for approval", "governance", () => {
  const r = S.submitScheme(RAHUL, newId);
  expect(r.ok && r.id, r.errors.join("; "));
  newReq = r.id!;
  expect(sc(newId).status === "pending_approval" && E.latestVersion(sc(newId)).status === "submitted", sc(newId).status);
  return `${newReq}`;
});
test(9, "Approve scheme (approval does not activate)", "governance", () => {
  const r = decide(ANITA, newReq, "approve");
  expect(r.ok, r.errors.join("; "));
  expect(sc(newId).status === "approved" && sc(newId).activeVersion == null, `status ${sc(newId).status}`);
  return "Approved, not active";
});
test(10, "Activate scheme", "governance", () => {
  const r = S.activateScheme(RAHUL, newId);
  expect(r.ok, r.errors.join("; "));
  expect(sc(newId).status === "active" && sc(newId).activeVersion === 1, sc(newId).status);
  expect(sc(newId).activations.at(-1)!.engine === "mock_development", "labelled development engine");
});

/* ---------------- Earning constructs (11–22) ---------------- */
test(11, "Base Points earning", "deterministic", () => {
  const before = st().accruals.length;
  const r = S.postMockTransaction(RAHUL, { memberId: "MBR-EP-0005", skuId: "SKU-00006", qty: 3, date: TODAY, kind: "scan" });
  expect(r.ok, r.errors.join("; "));
  const mine = st().accruals.slice(before).filter((a) => a.schemeId === "SCH-0001");
  expect(mine.length === 1 && mine[0].points === 27 && mine[0].bucket === "redeemable" && mine[0].ruleVersion === "R2.0", JSON.stringify(mine));
  return "3 units × 9 points (SCH-0001 v2, BP-2) = 27, redeemable";
});
test(12, "Rider Points depend on Base Points (blocked: OP-SB-RIDER)", "blocked", () => {
  const noBase = cfg({ ...base, base: { ...base.base, enabled: false }, rider: { enabled: true, baseCondition: "base_points_threshold", baseThreshold: 100, activationCondition: "x", eligibility: "", reward: { kind: "business_formula", value: null, formulaId: "FRM-RIDER" }, programmes: ["EP"], segments: [], contributesToMilestone: false } });
  const v1 = E.validateConfig(st(), ms(), null, noBase, { today: TODAY });
  expect(v1.errors.some((e) => e.includes("depend on a Base Points")), "dependency error");
  const withBase = cfg({ ...noBase, base: base.base });
  const v2 = E.validateConfig(st(), ms(), null, withBase, { today: TODAY });
  expect(v2.blockers.some((b) => b.ref === "OP-SB-RIDER"), "rider blocker");
  return "Dependency enforced; calculation blocked pending OP-SB-RIDER";
});
test(13, "Cross-sell qualification", "deterministic", () => {
  const cs = { ...base.crossSell, enabled: true, categories: [{ categoryId: "CAT-008", basis: "quantity" as const, minimum: 1 }, { categoryId: "CAT-005", basis: "quantity" as const, minimum: 2 }], requiredCategoryCount: 2 };
  expect(E.crossSellQualifies(cs, { "CAT-008": 1, "CAT-005": 2 }).qualified, "both met");
  expect(!E.crossSellQualifies(cs, { "CAT-008": 3, "CAT-005": 1 }).qualified, "one met");
});
test(14, "Quantity threshold qualification", "deterministic", () => {
  const q = { ...base.quantity, enabled: true, threshold: 4 };
  expect(E.quantityQualifies(q, 4) && !E.quantityQualifies(q, 3), "threshold 4");
});
test(15, "Category-specific selection (sub-category covers all SKUs)", "deterministic", () => {
  const skus = E.skusInScope(ms(), { allProducts: false, categoryIds: [], subCategoryIds: ["SUB-011"], skuIds: [] });
  const expected = ms().skus.filter((k) => ["PRD-0001", "PRD-0002", "PRD-0003"].includes(k.productId)).map((k) => k.id);
  expect(expected.every((k) => skus.has(k)) && skus.size === expected.length, `${skus.size} vs ${expected.length}`);
  return `${skus.size} SKUs under SUB-011`;
});
test(16, "Combined rules evaluation", "deterministic", () => {
  const cb = { enabled: true, components: ["quantity", "slab"] as const, relation: "all_of" as const, dependencies: [], note: "" };
  expect(E.combinedQualifies({ ...cb, components: [...cb.components] }, { quantity: true, slab: true }) === true, "all true");
  expect(E.combinedQualifies({ ...cb, components: [...cb.components] }, { quantity: true, slab: false }) === false, "all_of false");
  expect(E.combinedQualifies({ ...cb, components: [...cb.components], relation: "any_of" }, { quantity: true, slab: false }) === true, "any_of");
  const invalid = E.validateConfig(st(), ms(), null, cfg({ ...base, rider: { ...base.rider, enabled: true }, base: { ...base.base, enabled: true }, combined: { enabled: true, components: ["rider", "quantity"], relation: "all_of", dependencies: [], note: "" } }), { today: TODAY });
  expect(invalid.errors.some((e) => e.includes("Rider Points must be combined with Base Points")), "invalid combination");
});
test(17, "Multi-level milestone qualification", "deterministic", () => {
  const m = { ...base.milestone, enabled: true, levels: [{ id: "M1", name: "L1", threshold: 150, reward: { kind: "fixed_points" as const, value: 100, formulaId: null } }, { id: "M2", name: "L2", threshold: 300, reward: { kind: "fixed_points" as const, value: 250, formulaId: null } }] };
  expect(E.milestonesAchieved(m, 149).length === 0 && E.milestonesAchieved(m, 150).length === 1 && E.milestonesAchieved(m, 320).length === 2, "levels");
  const seeded = st().accruals.filter((a) => a.schemeId === "SCH-0002" && a.component === "milestone");
  expect(seeded.every((a) => a.points === 100 || a.points === 250), "seeded milestone rewards match configured values");
});
test(18, "Slab selection and priority", "deterministic", () => {
  const slab = (id: string, min: number, max: number | null, priority: number) => ({ id, name: id, min, max, achievement: "quantity" as const, reward: { kind: "fixed_points" as const, value: 1, formulaId: null }, qualificationRule: "", priority });
  const slabs = [slab("A", 4, 7, 3), slab("B", 8, 14, 2), slab("C", 15, null, 1), slab("X", 6, 9, 1)];
  expect(E.selectSlab(slabs, 5)!.id === "A" && E.selectSlab(slabs, 7)!.id === "X" && E.selectSlab(slabs, 12)!.id === "B" && E.selectSlab(slabs, 20)!.id === "C" && E.selectSlab(slabs, 2) === null, "selection");
  return "Overlap at 7 resolved by priority (X, priority 1)";
});
test(19, "Slab downgrade due to sales return (correction pending SCH-Q7)", "blocked", () => {
  const cfg3 = E.displayVersion(sc("SCH-0003")).config;
  expect(E.selectSlab(cfg3.slab.slabs, 9)!.id === "S2" && E.selectSlab(cfg3.slab.slabs, 7)!.id === "S1", "net quantity re-selects lower slab");
  const rev = st().accruals.filter((a) => a.schemeId === "SCH-0003" && a.result === "reversal_pending");
  expect(rev.length >= 1 && rev.every((r) => r.points === 0 && r.reversalOf && st().accruals.find((a) => a.id === r.reversalOf)!.result === "accrued"), "linked pending reversal, original kept");
  return "Downgrade identified; correction amount not calculated (formula pending), original accrual kept";
});
test(20, "Growth-based qualification (blocked: OP-01)", "blocked", () => {
  const v = E.validateConfig(st(), ms(), "SCH-0007", E.displayVersion(sc("SCH-0007")).config, { today: TODAY });
  expect(v.blockers.some((b) => b.ref === "OP-01"), "growth blocker");
  expect(!E.rewardPoints(st(), { kind: "business_formula", value: null, formulaId: "FRM-GROWTH" }, 10).ok, "no growth reward computed");
});
test(21, "Periodic evaluation", "deterministic", () => {
  const w = E.evaluationWindows({ type: "monthly", start: "2026-08-01", end: "2027-01-31", evaluation: "periodic" });
  const q = E.evaluationWindows({ type: "quarterly", start: "2026-04-01", end: "2027-03-31", evaluation: "periodic" });
  expect(w.length === 6 && w[0].to === "2026-08-31" && q.length === 4 && q[3].from === "2027-01-01", JSON.stringify(q));
  return "6 monthly windows; 4 FY quarters (April–March)";
});
test(22, "Cumulative evaluation", "deterministic", () => {
  const w = E.evaluationWindows({ type: "monthly", start: "2026-08-01", end: "2027-01-31", evaluation: "cumulative" });
  expect(w.length === 1 && w[0].from === "2026-08-01" && w[0].to === "2027-01-31", JSON.stringify(w));
});

/* ---------------- Targeting (23–34) ---------------- */
const pop = (t: SchemeConfig["targeting"], progs = ["EP"]) => E.eligiblePopulation(mem(), ms(), cfg({ ...base, basic: { ...base.basic, programmes: progs }, eligibility: { ...base.eligibility, branchScope: { allBranches: true, stateCodes: [], districtCodes: [], branchCodes: [] } }, targeting: t }));
const cond = (dimension: SchemeConfig["targeting"][number]["dimension"], values: string[], extra: Partial<SchemeConfig["targeting"][number]> = {}) => ({ id: "T1", dimension, operator: "in" as const, values, days: null, pct: null, ...extra });
// Active EP members at active branches (inactive branches never earn and are not counted).
const activeEP = () => mem().members.filter((m) => m.programme === "EP" && !["rejected", "pending", "invited"].includes(m.status) && ms().hierarchy.find((h) => h.code === m.branchCode)?.status !== "inactive");
test(23, "Programme targeting", "deterministic", () => {
  const p = pop([cond("programme", ["EP"])], ["EP", "ST"]);
  expect(p.count === activeEP().length, `${p.count} vs ${activeEP().length}`);
});
test(24, "Branch targeting", "deterministic", () => {
  const p = pop([cond("branch", ["KL-BR-KOCHI"])]);
  expect(p.count === activeEP().filter((m) => m.branchCode === "KL-BR-KOCHI").length, String(p.count));
});
test(25, "District targeting", "deterministic", () => {
  const p = pop([cond("district", ["TN-CHENNAI"])]);
  expect(p.count === activeEP().filter((m) => m.branchCode.startsWith("TN-BR-CHENNAI")).length, String(p.count));
});
test(26, "Geo-fenced pincode targeting", "deterministic", () => {
  const m = activeEP().find((x) => x.addresses.working?.pincode)!;
  const p = pop([cond("pincode", [m.addresses.working!.pincode])]);
  expect((p.count ?? 0) >= 1, String(p.count));
});
test(27, "Selected Rishta ID targeting", "deterministic", () => { expect(pop([cond("member_ids", ["MBR-EP-0005"])]).count === 1, "one id"); });
test(28, "Multi-select member targeting", "deterministic", () => { expect(pop([cond("member_ids", ["MBR-EP-0005", "MBR-EP-0010", "MBR-EP-0104"])]).count === 3, "three ids"); });
test(29, "Product targeting", "deterministic", () => {
  const ev = evaluateTxn(st(), { ms: ms(), now: `${TODAY}T15:00`, origin: "live_mock", memberOf: (id) => mem().members.find((m) => m.id === id) }, { id: "TXN-T29", kind: "scan", memberId: "MBR-EP-0005", programme: "EP", branchCode: "KL-BR-KOCHI", skuId: "SKU-00012", qty: 1, date: TODAY, originalTxnId: null }, "SCH-0001");
  expect(ev.trace[0].result === "SKU outside product applicability", ev.trace[0].result);
  const targeted = cfg({ ...base, targeting: [{ id: "T1", dimension: "product_category", operator: "in", values: ["CAT-002"], days: null, pct: null }] });
  expect(!txnTargeting(ms(), targeted, "SKU-00001", TODAY).ok, "product targeting condition ignored");
  return "Out-of-scope SKU refused; in-scope wire SKU refused by a stabilizer-only targeting condition";
});
test(30, "Billed-to party targeting (source not connected)", "blocked", () => {
  const p = pop([cond("billed_to_party", ["DEV-PARTY-1"])]);
  expect(p.count === null && p.notComputable.includes("Billed-to party"), "not computable");
});
test(31, "Date-range targeting is applied per transaction; event targeting is not evaluable", "deterministic", () => {
  const dated = cfg({ ...base, targeting: [cond("date_range", ["2026-11-01..2026-11-30"])] });
  expect(txnTargeting(ms(), dated, "SKU-00001", "2026-11-09").ok && !txnTargeting(ms(), dated, "SKU-00001", "2026-12-01").ok, "date range not applied");
  const bad = E.validateConfig(st(), ms(), newId, cfg({ ...base, targeting: [cond("date_range", ["November"])] }), { today: TODAY });
  expect(bad.errors.some((e) => e.includes("Applicable date")), "malformed range accepted");
  const ev = E.validateConfig(st(), ms(), newId, cfg({ ...base, targeting: [cond("event", ["registration_approved"])] }), { today: TODAY });
  expect(ev.warnings.some((w) => w.includes("cannot be counted")) && E.eligiblePopulation(mem(), ms(), cfg({ ...base, targeting: [cond("event", ["registration_approved"])] })).count === null, "event treated as evaluable");
  return "9 Nov inside the range credited, 1 Dec refused; event selection rule not confirmed";
});
test(32, "RFM targeting (blocked: source and rules not confirmed)", "blocked", () => {
  const c = cfg({ ...base, targeting: [cond("rfm", ["DEV-RFM-HIGH"])] });
  expect(pop(c.targeting).count === null, "not computable");
  const el = memberEligible(st(), sc("SCH-0001"), c, mem().members.find((m) => m.id === "MBR-EP-0005"), "EP", "KL-BR-KOCHI");
  expect(!el.ok && el.reason.includes("Cannot evaluate"), el.reason);
});
test(33, "Inactivity targeting (X days never defaulted)", "blocked", () => {
  const v = E.validateConfig(st(), ms(), null, cfg({ ...base, targeting: [cond("inactive_scan", [])] }), { today: TODAY });
  expect(v.errors.some((e) => e.includes("X days is not configured")), "X required");
  const v2 = E.validateConfig(st(), ms(), null, cfg({ ...base, targeting: [cond("inactive_scan", [], { days: 30 })] }), { today: TODAY });
  expect(!v2.errors.some((e) => e.includes("X days")) && v2.warnings.some((w) => w.includes("cannot be counted")), "configured but not computable");
});
test(34, "Business-decline targeting (Y% never defaulted)", "blocked", () => {
  const v = E.validateConfig(st(), ms(), null, cfg({ ...base, targeting: [cond("business_decline", [], { days: 60 })] }), { today: TODAY });
  expect(v.errors.some((e) => e.includes("Y% is not configured")), "Y required");
});

/* ---------------- Backdated & special member (35–40) ---------------- */
let bdReq = "";
test(35, "Backdated scheme announcement", "deterministic", () => {
  const bad = E.validateConfig(st(), ms(), null, cfg({ ...base, backdated: { enabled: true, announcementDate: "2026-10-15", historicalFrom: "2026-11-01", historicalTo: "2026-11-05" } }), { today: TODAY });
  expect(bad.errors.some((e) => e.includes("announcement date must be after")), "announcement before start rejected");
  const ok = E.validateConfig(st(), ms(), "SCH-0015", E.displayVersion(sc("SCH-0015")).config, { today: TODAY });
  expect(!ok.errors.length && ok.warnings.some((w) => w.includes("separate approved backend operation")), ok.errors.join("; "));
});
test(36, "Backdated transaction eligibility (two-level approval, nothing credited by approval)", "governance", () => {
  const before = st().accruals.filter((a) => a.schemeId === "SCH-0015" && a.origin === "backdated").length;
  const r = S.requestBackdated(RAHUL, "SCH-0015", "Announced 5 Nov with effect from 1 Oct");
  expect(r.ok && r.id, r.errors.join("; "));
  bdReq = r.id!;
  expect(decide(ANITA, bdReq, "approve").ok, "stage 1");
  expect(sc("SCH-0015").backdated.status === "pending_approval", "still pending after stage 1");
  expect(decide(LAKSHMI, bdReq, "approve").ok, "stage 2");
  expect(sc("SCH-0015").backdated.status === "approved", sc("SCH-0015").backdated.status);
  expect(st().accruals.filter((a) => a.schemeId === "SCH-0015" && a.origin === "backdated").length === before, "approval credited nothing");
});
test(37, "Historical reward calculation", "deterministic", () => {
  const r = S.runBackdated(RAHUL, "SCH-0015");
  expect(r.ok, r.errors.join("; "));
  const acc = st().accruals.filter((a) => a.schemeId === "SCH-0015" && a.origin === "backdated" && a.result === "credited");
  expect(acc.length > 0 && acc.every((a) => a.effectiveDate <= "2026-11-04" && a.points === 15 * (st().txns.find((t) => t.id === a.sourceRef)!.qty)), "15 points per unit");
  return `${acc.length} historical credits at the configured 15 points per unit`;
});
test(38, "Duplicate credit prevention", "deterministic", () => {
  const credited = st().accruals.filter((a) => a.result === "credited" || a.result === "accrued").length;
  const r = S.runBackdated(RAHUL, "SCH-0015");
  expect(r.ok && st().accruals.filter((a) => a.result === "credited" || a.result === "accrued").length === credited, "re-run credited nothing");
  const t = st().txns.find((x) => x.memberId === "MBR-EP-0005" && x.date === TODAY)!;
  const d = S.postMockTransaction(RAHUL, { id: t.id, memberId: t.memberId, skuId: t.skuId, qty: t.qty, date: t.date, kind: "scan" });
  expect(d.warnings.some((w) => w.includes("Duplicate")) && st().accruals.some((a) => a.result === "rejected_duplicate" && a.sourceRef === t.id), "duplicate submission refused");
});
let extId = "";
test(39, "Special-member extension", "governance", () => {
  const vBefore = JSON.stringify(E.displayVersion(sc(newId)).config);
  const r = S.requestExtension(RAHUL, newId, { kind: "member", memberIds: ["MBR-EP-0104"], branchCodes: [], reason: "Test extension", effectiveFrom: TODAY });
  expect(r.ok && r.id, r.errors.join("; "));
  extId = r.id!;
  const e = st().extensions.find((x) => x.id === extId)!;
  expect(decide(ANITA, e.approvalRequestId!, "approve").ok, "approve");
  expect(st().extensions.find((x) => x.id === extId)!.status === "active" && JSON.stringify(E.displayVersion(sc(newId)).config) === vBefore, "extension active; config unchanged");
  const el = memberEligible(st(), sc(newId), E.displayVersion(sc(newId)).config, mem().members.find((m) => m.id === "MBR-EP-0104"), "EP", "TN-BR-COIMBATORE");
  expect(el.ok && el.reason === "Special-member extension", el.reason);
});
test(40, "Branch-level extension", "governance", () => {
  const e = st().extensions.find((x) => x.id === "EXT-0002")!;
  expect(decide(ANITA, e.approvalRequestId!, "approve").ok, "approve");
  const el = memberEligible(st(), sc("SCH-0002"), E.displayVersion(sc("SCH-0002")).config, mem().members.find((m) => m.id === "MBR-RT-0003"), "Retailer", "AP-BR-VIJAYAWADA");
  expect(el.ok, el.reason);
});

/* ---------------- Concurrency & budget (41–47) ---------------- */
test(41, "Two inclusive schemes running together", "deterministic", () => {
  const ov = E.overlappingSchemes(st(), ms(), "SCH-0005", E.displayVersion(sc("SCH-0005")).config);
  expect(ov.some((o) => o.id === "SCH-0003" && o.relation === "inclusive"), JSON.stringify(ov));
  const both = new Set(st().accruals.filter((a) => (a.result === "credited" || a.result === "accrued") && ["SCH-0003", "SCH-0005"].includes(a.schemeId)).map((a) => `${a.memberId}|${a.schemeId}`));
  const members = [...both].map((x) => x.split("|")[0]);
  expect(members.some((m) => both.has(`${m}|SCH-0003`) && both.has(`${m}|SCH-0005`)), "a member earns in both");
});
test(42, "Explicit exclusivity restriction", "deterministic", () => {
  const before = st().accruals.length;
  const inv = ms().skus.find((k) => k.productId === "PRD-0021")!;
  S.postMockTransaction(RAHUL, { memberId: "MBR-EP-0004", skuId: inv.id, qty: 1, date: TODAY, kind: "scan" });
  const rec = st().accruals.slice(before).find((a) => a.schemeId === "SCH-0015");
  expect(rec?.result === "excluded" && rec.note.includes("SCH-0001"), JSON.stringify(rec));
});
test(43, "Overlapping exclusivity conflict flagged", "governance", () => {
  const c = E.exclusivityConflicts(st());
  expect(c.some((x) => x.schemes.join() === "SCH-0001,SCH-0015,SCH-0005"), JSON.stringify(c));
});
test(44, "Budget near exhaustion", "deterministic", () => {
  const e = E.exposureOf(st(), sc("SCH-0012"), TODAY);
  expect(e.nearExhaustion && e.utilisation >= 0.8, String(e.utilisation));
});
test(45, "Budget exhaustion", "deterministic", () => {
  const e = E.exposureOf(st(), sc("SCH-0012"), TODAY);
  expect(sc("SCH-0012").status === "budget_exhausted" && e.consumed === 400 && e.remaining === 0, `${sc("SCH-0012").status} ${e.consumed}`);
});
test(46, "Auto-stop at the cap", "deterministic", () => {
  const s0 = { ...st(), schemes: st().schemes.map((x) => (x.id === "SCH-0012" ? { ...x, status: "active" as const } : x)) };
  const s12 = s0.schemes.find((x) => x.id === "SCH-0012")!;
  const c: Candidate = { scheme: s12, version: s12.versions[0], component: "base", ruleId: "BP-1", sourceRef: "TXN-T46", calcRef: "scan", memberId: "MBR-EP-0113", programme: "EP", branchCode: "KA-BR-MANGALURU", skuId: "SKU-00001", points: 4, bucket: "redeemable", effectiveDate: TODAY, note: "" };
  const out = postCandidates(s0, { ms: ms(), now: `${TODAY}T15:00`, origin: "live_mock", memberOf: () => undefined }, [c]);
  expect(out.summary.budgetRefused === 1 && out.state.schemes.find((x) => x.id === "SCH-0012")!.status === "budget_exhausted" && out.state.accruals.at(-1)!.result === "rejected_budget", JSON.stringify(out.summary));
  return "Crossing accrual refused; scheme stopped (mock engine, not production enforcement)";
});
test(47, "Failed activation leaves nothing active; retry succeeds", "governance", () => {
  expect(S.setActivationFailureSimulation(RAHUL, "SCH-0016", true).ok, "flag");
  const r = S.activateScheme(RAHUL, "SCH-0016");
  expect(!r.ok && sc("SCH-0016").status === "activation_failed" && sc("SCH-0016").activeVersion == null, sc("SCH-0016").status);
  const r2 = S.activateScheme(RAHUL, "SCH-0016");
  expect(r2.ok && sc("SCH-0016").status === "active", r2.errors.join("; "));
});

/* ---------------- Settlement (48–58) ---------------- */
test(48, "Base Points redeemable immediately", "deterministic", () => {
  const b = st().accruals.filter((a) => a.component === "base" && a.result === "credited");
  expect(b.length > 0 && b.every((a) => a.bucket === "redeemable"), "base redeemable");
  return "Redemption itself remains subject to KYC / redemption eligibility (Member Management)";
});
test(49, "Scheme Points remain unsettled", "deterministic", () => {
  const m = st().accruals.filter((a) => ["milestone", "slab", "crossSell", "quantity"].includes(a.component) && a.result === "accrued");
  expect(m.length > 0 && m.every((a) => a.bucket === "unsettled"), "scheme points unsettled");
});
test(50, "Partial release", "deterministic", () => {
  const p = E.settlementPreview(st(), sc("SCH-0002"), "T1", "2026-09-01", TODAY, TODAY);
  const expected = p.accruals.reduce((n, a) => n + Math.max(0, Math.floor((a.points * 60) / 100 + 1e-9) - a.releasedPoints), 0);
  expect(p.releasePct === 60 && p.releasePoints === expected, `${p.releasePoints} vs ${expected}`);
  const again = E.settlementPreview(st(), sc("SCH-0002"), "T1", "2026-09-01", "2026-10-31", TODAY);
  expect(again.releasePoints === 0 && !again.ok, `repeat release ${again.releasePoints}`);
  return `${p.unsettled} unsettled → ${p.releasePoints} up to the 60% cumulative cap; Sep–Oct (already at 60%) → 0`;
});
test(51, "Held percentage", "deterministic", () => {
  const rel = st().releases.find((r) => r.requestId === "SET-0002")!;
  const req2 = st().settlements.find((r) => r.id === "SET-0002")!;
  expect(rel.heldPoints === req2.unsettledPoints - rel.releasedPoints && rel.heldPoints > 0, JSON.stringify(rel));
  expect(E.settlementConfigErrors({ mode: "partial_release", tranches: [{ id: "a", label: "a", pct: 60, trigger: "during_scheme", conditions: "" }, { id: "b", label: "b", pct: 30, trigger: "final_settlement", conditions: "" }] }).some((e) => e.includes("not 100%")), "residual % rejected");
});
test(52, "Month-end release", "deterministic", () => {
  const ok = E.settlementPreview(st(), sc("SCH-0003"), "T1", "2026-10-01", "2026-10-31", TODAY).checks.find((c) => c.label.startsWith("Closure"))!;
  const no = E.settlementPreview(st(), sc("SCH-0003"), "T1", "2026-11-01", "2026-11-15", TODAY).checks.find((c) => c.label.startsWith("Closure"))!;
  expect(ok.ok && !no.ok, `${ok.detail} / ${no.detail}`);
});
test(53, "Scheme closure does not settle points", "governance", () => {
  const r = S.requestClosure(RAHUL, "SCH-0004", "Quarter ended");
  expect(r.ok && r.id, r.errors.join("; "));
  expect(decide(ANITA, r.id!, "approve").ok, "approve");
  expect(sc("SCH-0004").status === "closed" && sc("SCH-0004").settlementStatus === "settlement_pending", `${sc("SCH-0004").status} ${sc("SCH-0004").settlementStatus}`);
});
test(54, "Validation pending blocks settlement", "blocked", () => {
  const r = S.createSettlementRequest(RAHUL, "SCH-0003", "T1", "2026-10-01", "2026-10-31");
  expect(!r.ok && r.errors.some((e) => e.includes("Reversal checks")), r.errors.join("; "));
});
test(55, "Two-level settlement approval", "governance", () => {
  const set3 = st().settlements.find((x) => x.id === "SET-0003")!;
  expect(decide(ANITA, set3.approvalRequestId!, "approve", "Closure verified").ok, "stage 1");
  expect(st().settlements.find((x) => x.id === "SET-0003")!.status === "partially_approved" && !st().releases.some((r) => r.requestId === "SET-0003"), "nothing released after stage 1");
  expect(decide(LAKSHMI, set3.approvalRequestId!, "approve", "Ledger checked").ok, "stage 2");
  expect(st().settlements.find((x) => x.id === "SET-0003")!.status === "executed", "executed");
});
test(56, "Settlement execution failure and retry", "governance", () => {
  const r = S.createSettlementRequest(RAHUL, "SCH-0002", "T1", "2026-09-01", TODAY, true);
  expect(r.ok && r.id, r.errors.join("; "));
  const q = st().settlements.find((x) => x.id === r.id)!;
  decide(ANITA, q.approvalRequestId!, "approve", "ok");
  decide(LAKSHMI, q.approvalRequestId!, "approve", "ok");
  expect(st().settlements.find((x) => x.id === r.id)!.status === "execution_failed" && !st().releases.some((x) => x.requestId === r.id), "failed, nothing released");
  const retry = runExecution(TANUJIT, q.approvalRequestId!);
  expect(retry.ok && st().settlements.find((x) => x.id === r.id)!.status === "executed", retry.errors.join("; "));
  const again = runExecution(TANUJIT, q.approvalRequestId!);
  expect(!again.ok && st().releases.filter((x) => x.requestId === r.id).length === 1, "no double release");
});
test(57, "Settlement release ledger reference", "deterministic", () => {
  const rel = st().releases.find((r) => r.requestId === "SET-0003")!;
  expect(rel.ledgerRef.startsWith("LDG-REL-") && rel.approvalRef === st().settlements.find((x) => x.id === "SET-0003")!.approvalRequestId && rel.approvers.join() === `${ANITA},${LAKSHMI}`, JSON.stringify(rel));
});
test(58, "Reversal after qualification reduction (linked, original kept)", "blocked", () => {
  const before = st().accruals.length;
  const orig = st().accruals.find((a) => a.schemeId === "SCH-0001" && a.result === "credited" && a.origin === "live_mock")!;
  const t = st().txns.find((x) => x.id === orig.sourceRef)!;
  const r = S.postMockTransaction(RAHUL, { memberId: t.memberId, skuId: t.skuId, qty: 1, date: TODAY, kind: "sales_return", originalTxnId: t.id });
  expect(r.ok, r.errors.join("; "));
  const rev = st().accruals.slice(before).find((a) => a.result === "reversal_pending" && a.reversalOf === orig.id);
  expect(rev && rev.reversalRef && st().accruals.find((a) => a.id === orig.id)!.result === "credited", "pending reversal linked to original");
  return "Correction amount not invented (SCH-Q7)";
});

/* ---------------- Other incentives (59–78) ---------------- */
test(59, "Tier qualification thresholds configured explicitly", "governance", () => {
  const ep = st().tiers.filter((t) => t.programme === "EP" && t.status === "active").sort((a, b) => a.rank - b.rank);
  expect(ep.every((t, i) => i === 0 || (t.threshold ?? 0) > (ep[i - 1].threshold ?? 0)), "increasing");
  const rt = st().tiers.find((t) => t.id === "TIER-RT-1")!;
  expect(!S.submitTier(RAHUL, rt.id).ok, "no threshold → cannot submit");
  return "Tier calculation itself belongs to the tier service; no rule invented";
});
test(60, "Branch-specific tier configuration (valuation separate, OP-07)", "blocked", () => {
  const t = st().tiers.find((x) => x.id === "TIER-EP-2")!;
  expect(t.branchConfigs.some((b) => b.threshold != null && !b.valuation.configured), "branch threshold set, valuation not");
});
test(61, "Tier benefit display", "deterministic", () => { expect(st().tiers.filter((t) => t.status === "active").every((t) => t.benefits.length && t.benefits[0].redeemUpTo), "benefits"); });
test(62, "Influencer → Influencer referral (configured, blocked by OP-REF1)", "blocked", () => { expect(!S.submitReferralRule(RAHUL, "REF-R-01").ok, "blocked"); });
test(63, "Retailer → EP referral (configured, blocked by OP-REF1)", "blocked", () => { expect(st().referrals.some((r) => r.ruleId === "REF-R-02") && !S.submitReferralRule(RAHUL, "REF-R-02").ok, "blocked"); });
test(64, "Retailer → ST referral (configured, blocked by OP-REF1)", "blocked", () => { expect(st().referrals.some((r) => r.ruleId === "REF-R-03") && !S.submitReferralRule(RAHUL, "REF-R-03").ok, "blocked"); });
test(65, "Future Retailer → Consumer held inactive", "blocked", () => {
  const r = S.submitReferralRule(RAHUL, "REF-R-04");
  expect(!r.ok && st().referralRules.find((x) => x.id === "REF-R-04")!.status === "reserved_future", r.errors.join("; "));
});
test(66, "Campaign type configuration (all eight types)", "governance", () => {
  const types = ["scan_bonus", "combo", "happy_hour", "referral_milestone", "spin", "lucky_draw", "display_contest", "foc"] as const;
  types.forEach((t) => expect(st().campaigns.some((c) => c.type === t), `missing ${t}`));
});
test(67, "Lucky Draw cannot target Tamil Nadu", "governance", () => {
  const c = st().campaigns.find((x) => x.id === "CMP-0002")!;
  expect(E.validateCampaign(st(), c).errors.some((e) => e.includes("Tamil Nadu")), "TN error");
  expect(E.validateCampaign(st(), { ...c, stateCodes: [], allStates: true }).errors.some((e) => e.includes("All states")), "all states includes TN");
  expect(E.validateCampaign(st(), { ...c, stateCodes: ["KL"], branchCodes: ["TN-BR-MADURAI"] }).errors.length > 0, "TN branch");
  expect(!S.submitCampaign(TANUJIT, c.id).ok && !S.submitCampaign(RAHUL, c.id).ok, "no role can submit");
  expect(!E.validateCampaign(st(), { ...c, stateCodes: ["KL"] }).errors.some((e) => e.includes("Tamil Nadu")), "Kerala-only allowed");
});
test(68, "Display Contest submission metadata", "governance", () => {
  const e = st().contestEntries;
  expect(e.every((x) => x.capturedAt && x.submittedAt && x.photoRef) && e.some((x) => x.gps), "metadata");
  const unconfirmed = e.find((x) => x.capture === "source_unconfirmed")!;
  expect(!S.reviewContestEntry(RAHUL, unconfirmed.id, "winner", "x").ok, "unconfirmed capture cannot win");
  expect(!S.accessContestPhoto(ANITA, e[0].id).ok && S.accessContestPhoto(RAHUL, e[0].id).ok, "photo permission");
});
test(69, "Winners gallery, CSV and regional banner", "governance", () => {
  const winners = st().contestEntries.filter((x) => x.status === "winner");
  expect(winners.length >= 2, "winners");
  const r = S.triggerWinnerBanner(RAHUL, "CMP-0003", "Kerala");
  expect(r.ok && st().bannerTriggers.at(-1)!.status === "recorded_not_published", r.errors.join("; "));
});
test(70, "FOC / Buy-X-Get-Y, gift CSV and backend redemption", "governance", () => {
  expect(!E.validateCampaign(st(), st().campaigns.find((c) => c.id === "CMP-0004")!).errors.length, "explicit X/Y valid");
  const noXY = { ...st().campaigns.find((c) => c.id === "CMP-0004")!, foc: { ...st().campaigns.find((c) => c.id === "CMP-0004")!.foc!, qualifyingQty: null } };
  expect(E.validateCampaign(st(), noXY).blockers.some((b) => b.ref === "SCH-Q6"), "missing X blocked");
  const up = S.uploadGiftBatch(RAHUL, "CMP-0005", "gifts.csv", "member_id,gift,qty\nMBR-RT-0001,Hamper,1\nMBR-EP-0005,Hamper,1\nMBR-RT-0002,Hamper,x");
  expect(up.ok && st().giftBatches.at(-1)!.rows.filter((r) => r.error).length === 2, JSON.stringify(st().giftBatches.at(-1)));
  expect(S.submitGiftBatch(RAHUL, up.id!).ok, "batch submitted for approval");
  const br = S.requestBackendRedemption(RAHUL, "CMP-0005", "MBR-RT-0001", "Festive hamper", "Member unable to redeem in app");
  expect(br.ok && st().backendRedemptions.at(-1)!.status === "pending_approval", br.errors.join("; "));
});
const game = (id: string) => st().games.find((g) => g.id === id)!;
test(71, "Badge configuration", "governance", () => { expect(!E.validateGame(st(), game("GAM-0001")).blockers.length && game("GAM-0001").status === "active", "badge valid"); });
test(72, "Streak configuration (duration never defaulted)", "blocked", () => { expect(E.validateGame(st(), game("GAM-0003")).blockers.some((b) => b.ref === "SCH-Q11") && !S.submitGame(RAHUL, "GAM-0003").ok, "blocked"); });
test(73, "Scratch card configuration (no random allocation without approval)", "blocked", () => { expect(E.validateGame(st(), game("GAM-0004")).blockers.some((b) => b.ref === "SCH-Q5"), "blocked"); });
test(74, "Spin wheel configuration", "blocked", () => { expect(E.validateGame(st(), game("GAM-0005")).blockers.some((b) => b.ref === "SCH-Q5"), "blocked"); });
test(75, "Leaderboard configuration (ranking / tie-break not invented)", "blocked", () => { expect(E.validateGame(st(), game("GAM-0006")).blockers.some((b) => b.ref === "SCH-Q8"), "blocked"); });
const bonus = (t: string) => st().bonuses.find((b) => b.type === t)!;
test(76, "Welcome Bonus configuration (OP-SB-BONUS)", "blocked", () => { expect(E.validateBonus(st(), bonus("welcome")).blockers.length && !S.submitBonus(RAHUL, bonus("welcome").id).ok, "blocked"); });
test(77, "Assured Scratch configuration (OP-SB-BONUS)", "blocked", () => { expect(E.validateBonus(st(), bonus("assured_scratch")).blockers.some((b) => b.ref === "OP-SB-BONUS"), "blocked"); });
test(78, "Mega Scratch configuration (OP-SB-BONUS)", "blocked", () => { expect(E.validateBonus(st(), bonus("mega_scratch")).blockers.some((b) => b.ref === "OP-SB-BONUS"), "blocked"); });

/* ---------------- Governance (79–87) ---------------- */
test(79, "Maker self-approval blocked", "governance", () => {
  const r = S.saveSchemeDraft(RAHUL, null, cfg({ ...base, basic: { ...base.basic, name: "TEST self approval", code: "TEST-SELF" } }), "t");
  const sub = S.submitScheme(RAHUL, r.id!);
  expect(sub.ok, sub.errors.join("; "));
  const d = decide(RAHUL, sub.id!, "approve");
  expect(!d.ok, "maker cannot approve");
  return d.errors[0];
});
test(80, "Checker scope validation", "governance", () => {
  const pending = E.latestVersion(sc("SCH-0008")).approvalRequestId!;
  const d = decide(JOSEPH, pending, "approve");
  expect(!d.ok, "Joseph (EP · Karnataka) cannot approve a CS Kerala scheme");
  const multi = req(E.latestVersion(sc("SCH-0002")).approvalRequestId!);
  expect(multi.location?.state === "MULTI-STATE", "multi-state schemes route only to all-geography Checkers");
  return d.errors[0];
});
test(81, "Unresolved formula prevents activation", "blocked", () => {
  const s6 = S.submitScheme(RAHUL, "SCH-0006");
  expect(!s6.ok && s6.errors.some((e) => e.includes("OP-SB-RIDER")) && sc("SCH-0006").status === "business_confirmation_required", s6.errors.join("; "));
  expect(!S.activateScheme(TANUJIT, "SCH-0006").ok, "no approved version to activate; super admin cannot bypass");
});
test(82, "Missing liability formula blocks financial sign-off", "blocked", () => {
  const l = E.projectedLiability(st(), sc("SCH-0001"), 2, null, `${TODAY}T15:00`);
  expect(l.status === "pending_business_formula" && l.output === null, "no figure");
  expect(!S.recordLiabilitySignOff(ANITA, "SCH-0001").ok && st().audit.at(-1)!.changeType === "liability_signoff_refused", "refused and audited");
});
test(83, "Scheme version history", "governance", () => {
  const r = S.newVersion(RAHUL, "SCH-0001", "Test new version");
  expect(r.ok, r.errors.join("; "));
  const s1 = sc("SCH-0001");
  expect(s1.versions.map((v) => `${v.version}:${v.status}`).join() === "1:superseded,2:active,3:draft" && s1.activeVersion === 2, s1.versions.map((v) => `${v.version}:${v.status}`).join());
});
test(84, "Configuration audit with old and new values", "governance", () => {
  const ev = st().audit.find((a) => a.entityId === newId && a.field === "Description");
  expect(ev && ev.oldValue === "Test fixture" && ev.newValue === "Resumed draft" && ev.by === RAHUL, JSON.stringify(ev));
});
test(85, "User without permission cannot change budget", "governance", () => {
  expect(hasPermission(accessStore.get(), ANITA, "schemes", "view").allowed && hasPermission(accessStore.get(), ANITA, "scheme-budget", "view").allowed, "Anita can view");
  const r = S.requestBudgetChange(ANITA, "SCH-0005", 999999, "test");
  expect(!r.ok && r.errors[0].includes("Scheme budget & exposure: Edit"), r.errors.join("; "));
});
test(86, "User without permission cannot approve settlement", "governance", () => {
  let r = S.createSettlementRequest(RAHUL, "SCH-0002", "T1", "2026-09-01", TODAY);
  if (!r.ok) {
    // Everything under the cap is released: a member earns a new milestone first (scan, then period evaluation).
    const kl = new Set(E.displayVersion(sc("SCH-0002")).config.eligibility.branchScope.stateCodes);
    const m = mem().members.find((x) => x.programme === "Retailer" && kl.has(x.branchCode.slice(0, 2)) && !st().accruals.some((a) => a.schemeId === "SCH-0002" && a.memberId === x.id && a.component === "milestone"))!;
    S.postMockTransaction(RAHUL, { memberId: m.id, skuId: "SKU-00015", qty: 20, date: TODAY, kind: "scan" });
    S.runPeriodNow(RAHUL, "SCH-0002");
    r = S.createSettlementRequest(RAHUL, "SCH-0002", "T1", "2026-09-01", TODAY);
  }
  const pending = r.ok ? st().settlements.find((x) => x.id === r.id)!.approvalRequestId! : st().settlements.find((x) => x.status === "pending_approval")?.approvalRequestId;
  expect(pending, "a pending settlement exists");
  expect(!decide(JOSEPH, pending!, "approve").ok && !decide(RAHUL, pending!, "approve").ok, "Joseph and Rahul refused");
  expect(!decide(LAKSHMI, pending!, "approve").ok || req(pending!).stages[0].decidedBy !== LAKSHMI, "Finance cannot take the V-Guard programme stage");
});
test(87, "Previous scheme version remains traceable", "governance", () => {
  const a = st().accruals.filter((x) => x.schemeId === "SCH-0001" && x.result === "credited");
  const v1 = a.filter((x) => x.schemeVersion === 1);
  const v2 = a.filter((x) => x.schemeVersion === 2);
  expect(v1.length && v2.length && v1.every((x) => x.ruleVersion === "R1.0" && x.effectiveDate < "2026-10-20") && v2.every((x) => x.ruleVersion === "R2.0"), `${v1.length}/${v2.length}`);
  return `${v1.length} accruals on v1, ${v2.length} on v2`;
});


/* ---------------- Audit additions (88–107): rules that are fully defined by configuration ---------------- */
const ectx = { ms: ms(), now: `${TODAY}T15:00`, origin: "live_mock" as const, memberOf: (id: string) => mem().members.find((m) => m.id === id), restrictions: mem().restrictions };
const mkTxn = (memberId: string, skuId: string, qty = 1, date = TODAY) => { const m = mem().members.find((x) => x.id === memberId)!; return { id: `TXN-T-${memberId}-${skuId}-${date}`, kind: "scan" as const, memberId, programme: m.programme, branchCode: m.branchCode, skuId, qty, date, originalTxnId: null }; };
const POSTED = (r: string) => r === "credited" || r === "accrued";
function activeClone(baseId: string, patch: (c: SchemeConfig) => SchemeConfig) {
  const b = sc(baseId);
  const v = E.versionOf(b, b.activeVersion) ?? E.latestVersion(b);
  const config = patch(structuredClone(v.config));
  const scheme = { ...b, id: `${baseId}-T`, status: "active" as const, activeVersion: 1, versions: [{ ...v, version: 1, status: "active" as const, effectiveStart: config.duration.start, effectiveEnd: null, config }] };
  return { s: { ...st(), schemes: [...st().schemes, scheme] }, scheme };
}
test(88, "Schemes that are not active generate no rewards (draft, review, BCR, pending, approved, scheduled, returned)", "governance", () => {
  const never = ["SCH-0006", "SCH-0007", "SCH-0009", "SCH-0011", "SCH-0013"];
  expect(never.every((id) => !st().accruals.some((a) => a.schemeId === id)), "an inactive scheme has accruals");
  const wh = ms().skus.find((k) => k.status === "active" && E.skuCategory(ms(), k.id).categoryId === "CAT-006" && k.programmes.includes("Retailer"))!;
  const ev = evaluateTxn(st(), ectx, mkTxn("MBR-RT-0109", wh.id), "SCH-0011");
  expect(ev.candidates.length === 0 && ev.trace[0].result.startsWith("Not earning"), ev.trace[0]?.result);
  return `SCH-0011 (${sc("SCH-0011").status}): ${ev.trace[0].result}`;
});
test(89, "Transaction before the effective period is not credited", "deterministic", () => {
  const ev = evaluateTxn(st(), ectx, mkTxn("MBR-EP-0104", ms().skus.find((k) => k.productId === "PRD-0016")!.id, 2, "2026-09-15"), "SCH-0005");
  expect(ev.candidates.length === 0, ev.trace[0]?.result);
  return ev.trace[0].result;
});
test(90, "Member outside the branch scope is not credited", "deterministic", () => {
  const ev = evaluateTxn(st(), ectx, mkTxn("MBR-EP-0113", "SKU-00001"), "SCH-0001");
  expect(ev.candidates.length === 0 && ev.trace[0].result === "Branch outside scheme scope", ev.trace[0]?.result);
});
test(91, "Member of a programme the scheme does not include is not credited", "deterministic", () => {
  const ev = evaluateTxn(st(), ectx, mkTxn("MBR-RT-0001", "SKU-00001"), "SCH-0001");
  expect(ev.candidates.length === 0 && ev.trace[0].result === "Programme not in scheme", ev.trace[0]?.result);
});
test(92, "Slab boundaries are inclusive at min and max", "deterministic", () => {
  const sl = E.displayVersion(sc("SCH-0003")).config.slab.slabs;
  const got = [3, 4, 7, 8, 14, 15, 99].map((n) => E.selectSlab(sl, n)?.id ?? "none").join(",");
  expect(got === "none,S1,S1,S2,S2,S3,S3", got);
  return got;
});
test(93, "Re-running period evaluation never credits a milestone twice", "deterministic", () => {
  const n0 = st().accruals.filter((a) => a.schemeId === "SCH-0002" && POSTED(a.result)).length;
  S.runPeriodNow(RAHUL, "SCH-0002");
  const n1 = st().accruals.filter((a) => a.schemeId === "SCH-0002" && POSTED(a.result)).length;
  S.runPeriodNow(RAHUL, "SCH-0002");
  const n2 = st().accruals.filter((a) => a.schemeId === "SCH-0002" && POSTED(a.result)).length;
  expect(n2 === n1, `${n0} → ${n1} → ${n2}`);
  const keys = st().accruals.filter((a) => a.schemeId === "SCH-0002" && a.component === "milestone" && POSTED(a.result)).map((a) => `${a.memberId}|${a.ruleId}`);
  expect(new Set(keys).size === keys.length, "a member holds the same milestone level twice");
  return `${n1} posted after the first run, ${n2} after the second`;
});
test(94, "Monthly slab rewards recompute exactly from that month's net quantity (periodic reset)", "deterministic", () => {
  const c = E.displayVersion(sc("SCH-0003")).config;
  const scope = E.skusInScope(ms(), c.products);
  const rows = st().accruals.filter((a) => a.schemeId === "SCH-0003" && a.component === "slab" && POSTED(a.result) && a.origin === "seed");
  const bad = rows.filter((a) => {
    const [from, to] = a.sourceRef.slice(7).split("..");
    const qty = st().txns.filter((t) => t.memberId === a.memberId && t.date >= from && t.date <= to && t.date <= a.effectiveDate && scope.has(t.skuId)).reduce((n, t) => n + (t.kind === "scan" ? t.qty : -t.qty), 0);
    const slab = E.selectSlab(c.slab.slabs, qty);
    return !slab || slab.id !== a.ruleId || slab.reward.value !== a.points;
  });
  expect(rows.length > 0 && bad.length === 0, `${bad.length} of ${rows.length} mismatched`);
  return `${rows.length} slab rewards across ${new Set(rows.map((a) => a.sourceRef)).size} monthly windows recomputed`;
});
test(95, "Every Base Points credit equals points-per-unit × quantity of the version used", "deterministic", () => {
  const rows = st().accruals.filter((a) => a.component === "base" && a.result === "credited");
  const bad = rows.filter((a) => {
    const t = st().txns.find((x) => x.id === a.sourceRef)!;
    const cfgV = E.versionOf(sc(a.schemeId), a.schemeVersion)!.config;
    const bp = E.basePointsFor(ms(), cfgV, a.skuId!, a.branchCode, a.programme);
    return !bp || "error" in bp || bp.pointsPerUnit * t.qty !== a.points || bp.row.id !== a.ruleId;
  });
  expect(rows.length > 0 && bad.length === 0, `${bad.length} of ${rows.length} mismatched (first ${bad[0]?.id})`);
  return `${rows.length} Base Points credits recomputed from their own scheme version`;
});
test(96, "Budget boundary: an accrual reaching the cap exactly is credited, the next is refused", "deterministic", () => {
  const { s, scheme } = activeClone("SCH-0001", (c) => ({ ...c, budget: { ...c.budget, amount: 12, autoStop: true } }));
  const cand = (n: number) => ({ scheme, version: scheme.versions[0], component: "base" as const, ruleId: "BP-1", sourceRef: `TXN-B${n}`, calcRef: "scan", memberId: "MBR-EP-0005", programme: "EP", branchCode: "KL-BR-KOCHI", skuId: "SKU-00001", points: 6, bucket: "redeemable" as const, effectiveDate: TODAY, note: "" });
  const out = postCandidates(s, ectx, [cand(1), cand(2), cand(3)]);
  const mine = out.state.accruals.filter((a) => a.schemeId === scheme.id);
  expect(mine.map((a) => a.result).join() === "credited,credited,rejected_budget" && mine.filter((a) => a.result === "credited").reduce((n, a) => n + a.points, 0) === 12, mine.map((a) => a.result).join());
  return "6 + 6 = 12 credited at a 12-point cap; third refused";
});
test(97, "Refused, excluded and pending-reversal records carry no points and do not consume budget", "deterministic", () => {
  const nonPosted = st().accruals.filter((a) => !POSTED(a.result));
  expect(nonPosted.length > 0 && nonPosted.every((a) => a.points === 0), "non-posted record with points");
  const s12 = sc("SCH-0012");
  const posted = st().accruals.filter((a) => a.schemeId === s12.id && POSTED(a.result)).reduce((n, a) => n + a.points, 0);
  expect(E.exposureOf(st(), s12, TODAY).consumed === posted, "consumption includes refused records");
  return `${nonPosted.length} non-posted records, all 0 points`;
});
test(98, "Accruals in a pending settlement request are locked from a second request", "deterministic", () => {
  const pending = st().settlements.find((x) => ["pending_approval", "partially_approved"].includes(x.status));
  expect(pending, "no pending settlement in state");
  const p = E.settlementPreview(st(), sc(pending!.schemeId), pending!.trancheId, pending!.earnedFrom, pending!.earnedTo, TODAY);
  expect(!p.accruals.some((a) => pending!.accrualIds.includes(a.id)), "locked accrual offered again");
  return `${pending!.id}: ${pending!.accrualIds.length} accruals locked`;
});
test(99, "Final settlement is refused while the scheme is still earning", "governance", () => {
  const r = S.createSettlementRequest(RAHUL, "SCH-0002", "T2", "2026-09-01", TODAY);
  expect(!r.ok && r.errors.some((e) => e.includes("Closure")), r.errors.join("; "));
});
test(100, "No accrual is ever released beyond its points", "deterministic", () => {
  expect(st().accruals.every((a) => a.releasedPoints >= 0 && a.releasedPoints <= a.points), "over-release");
  expect(st().releases.every((r) => r.releasedPoints >= 0 && r.heldPoints >= 0), "negative release");
});
test(101, "Executed release equals the amount approved on the request", "deterministic", () => {
  const ex = st().settlements.filter((x) => x.status === "executed");
  const bad = ex.filter((x) => st().releases.find((r) => r.requestId === x.id)?.releasedPoints !== x.releasePoints);
  expect(ex.length > 0 && bad.length === 0, `mismatch on ${bad.map((b) => b.id).join(", ")}`);
  return `${ex.length} executed releases match their approved amount`;
});
test(102, "DD programme earns Base Points; another programme on the same SKU does not", "deterministic", () => {
  const wh = ms().skus.find((k) => k.status === "active" && k.programmes.includes("DD") && E.skuCategory(ms(), k.id).categoryId === "CAT-006")!;
  const { s, scheme } = activeClone("SCH-0009", (c) => ({ ...c, duration: { ...c.duration, start: "2026-11-01" }, budget: { ...c.budget, amount: 5000 }, base: { ...c.base, rows: [{ id: "BP-1", level: "category", refId: "CAT-006", programme: "DD", branchCodes: "all", points: 10, qualifying: "test" }] } }));
  const dd = evaluateTxn(s, ectx, mkTxn("MBR-DD-0104", wh.id, 3), scheme.id);
  const rt = evaluateTxn(s, ectx, mkTxn("MBR-RT-0109", wh.id, 3), scheme.id);
  expect(dd.candidates[0]?.points === 30 && rt.candidates.length === 0, `${dd.trace[0]?.result} / ${rt.trace[0]?.result}`);
  return "DD member 3 × 10 = 30; Retailer member refused (programme)";
});
test(103, "A special-member extension has no effect until approved", "governance", () => {
  const r = S.requestExtension(RAHUL, newId, { kind: "member", memberIds: ["MBR-EP-0115"], branchCodes: [], reason: "Test pending extension", effectiveFrom: TODAY });
  expect(r.ok, r.errors.join("; "));
  const el = memberEligible(st(), sc(newId), E.displayVersion(sc(newId)).config, mem().members.find((m) => m.id === "MBR-EP-0115"), "EP", "GJ-BR-AHMEDABAD");
  expect(!el.ok, el.reason);
});
test(104, "Seed data covers all five programmes", "governance", () => {
  const progs = ["EP", "ST", "CS", "Retailer", "DD"];
  const withScheme = progs.filter((p) => st().schemes.some((x) => E.displayVersion(x).config.basic.programmes.includes(p)));
  const withAccruals = progs.filter((p) => st().accruals.some((a) => a.programme === p && POSTED(a.result)));
  expect(withScheme.length === 5, withScheme.join(","));
  return `Schemes: ${withScheme.join(", ")} · seeded rewards: ${withAccruals.join(", ")} (DD earning is covered by case 102)`;
});
test(105, "Ledger traceability is complete on every posted reward", "deterministic", () => {
  const posted = st().accruals.filter((a) => POSTED(a.result));
  const bad = posted.filter((a) => { const v = E.versionOf(sc(a.schemeId), a.schemeVersion); return !a.ledgerRef || !v || v.ruleVersion !== a.ruleVersion || !a.idempotencyKey.includes(`|${a.schemeId}|v${a.schemeVersion}|`) || !a.sourceRef; });
  expect(bad.length === 0, `${bad.length} incomplete (first ${bad[0]?.id})`);
  return `${posted.length} posted rewards carry ledger ref, scheme version, matching rule version and idempotency key`;
});
test(106, "Cross-sell rewards recompute from the quarter's category quantities", "deterministic", () => {
  const c = E.displayVersion(sc("SCH-0004")).config;
  const rows = st().accruals.filter((a) => a.schemeId === "SCH-0004" && a.component === "crossSell" && POSTED(a.result));
  const bad = rows.filter((a) => {
    const [from, to] = a.sourceRef.slice(7).split("..");
    const by: Record<string, number> = {};
    st().txns.filter((t) => t.memberId === a.memberId && t.date >= from && t.date <= to).forEach((t) => { const k = E.skuCategory(ms(), t.skuId).categoryId!; by[k] = (by[k] ?? 0) + (t.kind === "scan" ? t.qty : -t.qty); });
    return !E.crossSellQualifies(c.crossSell, by).qualified || a.points !== c.crossSell.reward.value;
  });
  expect(rows.length > 0 && bad.length === 0, `${bad.length} of ${rows.length} mismatched`);
  return `${rows.length} cross-sell rewards of ${c.crossSell.reward.value} points recomputed`;
});
test(107, "Each milestone reward matches its level's configured reward", "deterministic", () => {
  const rows = st().accruals.filter((a) => a.component === "milestone" && POSTED(a.result));
  const bad = rows.filter((a) => { const l = E.versionOf(sc(a.schemeId), a.schemeVersion)!.config.milestone.levels.find((x) => x.id === a.ruleId); return !l || l.reward.value !== a.points; });
  expect(rows.length > 0 && bad.length === 0, `${bad.length} mismatched`);
  return `${rows.length} milestone rewards across ${new Set(rows.map((a) => a.schemeId)).size} schemes`;
});

/* ---------------- Fix regressions (108–111): G3, G4, G1, G10 ---------------- */
test(108, "Restricted members earn nothing while the restriction is in force (G3)", "deterministic", () => {
  const solar = ms().skus.find((k) => k.status === "active" && k.programmes.includes("CS"))!;
  const { s, scheme } = activeClone("SCH-0002", (c) => ({ ...c, basic: { ...c.basic, programmes: ["CS"] }, products: { allProducts: false, categoryIds: ["CAT-008"], subCategoryIds: [], skuIds: [] }, eligibility: { ...c.eligibility, branchScope: { allBranches: true, stateCodes: [], districtCodes: [], branchCodes: [] } }, base: { ...c.base, rows: [{ id: "BP-1", level: "category", refId: "CAT-008", programme: "CS", branchCodes: "all", points: 20, qualifying: "" }] }, milestone: { ...c.milestone, enabled: false }, duration: { ...c.duration, start: "2026-11-01" } }));
  const blocked = evaluateTxn(s, ectx, mkTxn("MBR-CS-0002", solar.id, 2), scheme.id);
  const ok = evaluateTxn(s, ectx, mkTxn("MBR-CS-0103", solar.id, 2), scheme.id);
  expect(blocked.candidates.length === 0 && blocked.trace[0].result.includes("Program Block") && ok.candidates[0]?.points === 40, `${blocked.trace[0]?.result} / ${ok.trace[0]?.result}`);
  const holdBefore = memberEligible(st(), sc("SCH-0001"), E.displayVersion(sc("SCH-0001")).config, mem().members.find((m) => m.id === "MBR-EP-0010"), "EP", "TN-BR-CHENNAI-NORTH", { date: "2026-11-07", restrictions: mem().restrictions });
  const holdAfter = memberEligible(st(), sc("SCH-0001"), E.displayVersion(sc("SCH-0001")).config, mem().members.find((m) => m.id === "MBR-EP-0010"), "EP", "TN-BR-CHENNAI-NORTH", { date: TODAY, restrictions: mem().restrictions });
  expect(holdBefore.ok && !holdAfter.ok, `${holdBefore.reason} / ${holdAfter.reason}`);
  return "Program Block member refused, unrestricted CS member 2 × 20 = 40; Temporary Hold (from 8 Nov) eligible on 7 Nov, refused on 9 Nov";
});
test(109, "Group / segment / Elite conditions refuse credit while their source is not connected (G4)", "blocked", () => {
  const { s, scheme } = activeClone("SCH-0002", (c) => ({ ...c, eligibility: { ...c.eligibility, elite: "elite_only" } }));
  const ev = evaluateTxn(s, ectx, mkTxn("MBR-RT-0001", "SKU-00015", 1), scheme.id);
  expect(ev.candidates.length === 0 && ev.trace[0].result.startsWith("Cannot evaluate group / segment / Elite"), ev.trace[0]?.result);
});
test(110, "A during-scheme tranche never releases beyond its cumulative share before final settlement (G1)", "deterministic", () => {
  const acc = st().accruals.filter((a) => a.schemeId === "SCH-0002" && a.bucket === "unsettled" && (a.result === "accrued" || a.result === "credited"));
  expect(acc.length > 0 && acc.every((a) => a.releasedPoints <= Math.floor(a.points * 0.6 + 1e-9)), "an accrual is above 60% released");
  const r = S.createSettlementRequest(RAHUL, "SCH-0002", "T1", "2026-09-01", "2026-10-31");
  expect(!r.ok && r.errors.some((e) => e.includes("tranche cap")), r.errors.join("; "));
  return `${acc.length} SCH-0002 accruals all at or below 60% released; repeat request refused`;
});
test(111, "Settlement execution re-checks and refuses when a reversal appears after the request (G10)", "governance", () => {
  const q = st().settlements.find((x) => x.schemeId === "SCH-0002" && ["pending_approval", "partially_approved"].includes(x.status))!;
  expect(q, "no pending SCH-0002 settlement");
  const a = st().accruals.find((x) => q.accrualIds.includes(x.id))!;
  const scan = [...st().txns].reverse().find((t) => t.memberId === a.memberId && t.kind === "scan" && t.date >= "2026-11-01")!;
  S.postMockTransaction(RAHUL, { memberId: scan.memberId, skuId: scan.skuId, qty: 1, date: TODAY, kind: "sales_return", originalTxnId: scan.id });
  decide(ANITA, q.approvalRequestId!, "approve", "ok");
  decide(LAKSHMI, q.approvalRequestId!, "approve", "ok");
  const after = st().settlements.find((x) => x.id === q.id)!;
  expect(after.status === "execution_failed" && !st().releases.some((r) => r.requestId === q.id) && st().audit.some((e) => e.entityId === q.id && e.changeType === "settlement_execution_refused"), after.status);
  return `${q.id}: approved by both stages, refused at execution, nothing released`;
});

/* ---------------- Fix regressions (112–118): G2, G6, G7, G8, G9, G11, G12 ---------------- */
test(112, "Month-end tranche requires the real last day of the month (G2)", "deterministic", () => {
  const chk = (to: string) => E.settlementPreview(st(), sc("SCH-0003"), "T1", "2026-10-01", to, TODAY).checks.find((c) => c.label.startsWith("Closure"))!.ok;
  expect(chk("2026-10-31") && !chk("2026-10-29") && !chk("2026-10-30") && E.lastDayOfMonth("2027-02-10") === "2027-02-28" && E.lastDayOfMonth("2028-02-10") === "2028-02-29", "month-end rule");
  return "31 Oct accepted; 29 and 30 Oct refused; February handled including leap years";
});
test(113, "Quantity is decided in its own period windows (G6)", "deterministic", () => {
  const c8 = E.displayVersion(sc("SCH-0008")).config;
  const custom = { ...c8, duration: { ...c8.duration, type: "custom" as const, evaluation: "cumulative" as const } };
  expect(E.quantityWindows(custom).map((w) => `${w.from}..${w.to}`).join() === "2026-12-01..2026-12-31,2027-01-01..2027-01-31,2027-02-01..2027-02-28" && !E.quantityAligned(custom) && E.quantityAligned(c8), "quantity windows");
  const slabbed = E.validateConfig(st(), ms(), "SCH-0003", { ...E.displayVersion(sc("SCH-0003")).config, quantity: { ...E.displayVersion(sc("SCH-0003")).config.quantity, period: "quarterly" } }, { today: TODAY });
  expect(slabbed.errors.some((e) => e.includes("Quantity period must match")), "misaligned quantity feeding slabs accepted");
  return "Monthly quantity in a cumulative custom scheme → 3 monthly windows; misaligned quantity feeding slabs is an error";
});
test(114, "Inactive or draft SKUs and inactive branches earn nothing (G7, G8)", "deterministic", () => {
  const inactiveSku = ms().skus.find((k) => k.status !== "active" && E.skuCategory(ms(), k.id).categoryId === "CAT-004")!;
  const a = evaluateTxn(st(), ectx, mkTxn("MBR-RT-0001", inactiveSku.id), "SCH-0002");
  const { s, scheme } = activeClone("SCH-0001", (c) => ({ ...c, eligibility: { ...c.eligibility, branchScope: { allBranches: true, stateCodes: [], districtCodes: [], branchCodes: [] } }, base: { ...c.base, rows: c.base.rows.map((r) => ({ ...r, branchCodes: "all" as const })) } }));
  const b = evaluateTxn(s, ectx, mkTxn("MBR-EP-0110", "SKU-00001"), scheme.id);
  const ok = evaluateTxn(s, ectx, mkTxn("MBR-EP-0005", "SKU-00001"), scheme.id);
  expect(a.candidates.length === 0 && b.candidates.length === 0 && ok.candidates[0]?.points === 5, `${a.trace[0]?.result} / ${b.trace[0]?.result}`);
  return `${inactiveSku.code} (${inactiveSku.status}) refused; Cuttack (inactive branch) refused; Kochi credited 5`;
});
test(115, "A sales return counts in the window of the sale it reverses (G9)", "deterministic", () => {
  const ret = st().txns.find((x) => x.kind === "sales_return" && x.id === "TXN-000688") ?? st().txns.find((x) => x.kind === "sales_return")!;
  const orig = st().txns.find((x) => x.id === ret.originalTxnId)!;
  const c3 = E.displayVersion(sc("SCH-0003")).config;
  const oct = { from: "2026-10-01", to: "2026-10-31" }, nov = { from: "2026-11-01", to: "2026-11-30" };
  const without = { ...st(), txns: st().txns.filter((x) => x.id !== ret.id) };
  const dOct = windowNetQuantity(without, ms(), c3, ret.memberId, oct, TODAY) - windowNetQuantity(st(), ms(), c3, ret.memberId, oct, TODAY);
  const dNov = windowNetQuantity(without, ms(), c3, ret.memberId, nov, TODAY) - windowNetQuantity(st(), ms(), c3, ret.memberId, nov, TODAY);
  const beforeReturn = windowNetQuantity(st(), ms(), c3, ret.memberId, oct, "2026-10-31") === windowNetQuantity(without, ms(), c3, ret.memberId, oct, "2026-10-31");
  expect(orig.date.startsWith("2026-10") && dOct === ret.qty && dNov === 0 && beforeReturn, `Oct −${dOct}, Nov −${dNov}`);
  return `Return of ${ret.qty} (dated ${ret.date}) reduces October by ${ret.qty}, November by 0; not visible before it happened`;
});
test(116, "Milestones in a combined rule wait for the window to close (G11)", "deterministic", () => {
  const { s, scheme } = activeClone("SCH-0002", (c) => ({ ...c, milestone: { ...c.milestone, measure: "quantity", levels: [{ id: "M1", name: "Level", threshold: 1, reward: { kind: "fixed_points", value: 1, formulaId: null } }] }, quantity: { ...c.quantity, enabled: true, period: "scheme_period", threshold: 9999, useSlabs: false, reward: { kind: "fixed_points", value: 1, formulaId: null } }, combined: { enabled: true, components: ["quantity", "milestone"], relation: "all_of", dependencies: [], note: "" } }));
  const w = { from: "2026-09-01", to: "2026-12-31" };
  const mid = evaluatePeriod(s, ectx, scheme, w, TODAY).candidates.filter((x) => x.component === "milestone").length;
  const closed = evaluatePeriod(s, ectx, scheme, w, "2027-01-05").candidates.filter((x) => x.component === "milestone").length;
  const { s: s2, scheme: plain } = activeClone("SCH-0002", (c) => ({ ...c, milestone: { ...c.milestone, measure: "quantity", levels: [{ id: "M1", name: "Level", threshold: 1, reward: { kind: "fixed_points", value: 1, formulaId: null } }] } }));
  const midPlain = evaluatePeriod(s2, ectx, plain, w, TODAY).candidates.filter((x) => x.component === "milestone").length;
  expect(mid === 0 && closed === 0 && midPlain > 0, `combined mid ${mid}, closed ${closed}, plain mid ${midPlain}`);
  return `Combined (unreachable quantity): 0 milestones mid-window and 0 at close; without a combined rule ${midPlain} accrue when reached`;
});
test(117, "All slabs must share one achievement basis (G12)", "deterministic", () => {
  const c = E.displayVersion(sc("SCH-0003")).config;
  const mixed = { ...c, slab: { ...c.slab, slabs: c.slab.slabs.map((x, i) => (i === 1 ? { ...x, achievement: "points" as const } : x)) } };
  expect(E.validateConfig(st(), ms(), "SCH-0003", mixed, { today: TODAY }).errors.some((e) => e.includes("same achievement basis")) && !E.validateConfig(st(), ms(), "SCH-0003", c, { today: TODAY }).errors.some((e) => e.includes("achievement basis")), "mixed basis");
});
test(118, "Seeded scheme rewards still recompute after the eligibility fixes", "deterministic", () => {
  const credits = st().accruals.filter((a) => (a.result === "credited" || a.result === "accrued") && a.origin === "seed");
  const bad = credits.filter((a) => (a.skuId && !(ms().skus.find((k) => k.id === a.skuId)?.status === "active")) || ms().hierarchy.find((h) => h.code === a.branchCode)?.status === "inactive" || mem().restrictions.some((r) => r.memberIds.includes(a.memberId) && r.appliedAt.slice(0, 10) <= a.effectiveDate));
  expect(credits.length > 0 && bad.length === 0, `${bad.length} seeded rewards on inactive SKUs / branches or restricted members (first ${bad[0]?.id})`);
  return `${credits.length} seeded rewards: none on an inactive SKU, inactive branch or restricted member`;
});

/* ---------------- Start-up decoupling (119) ---------------- */
test(119, "Precomputed module approval steps match the current master and scheme seeds", "deterministic", () => {
  const fresh = buildModuleScenarioSteps();
  expect(JSON.stringify(fresh) === JSON.stringify(MODULE_APPROVAL_STEPS), "src/data/mock/generated/approvalModuleSteps.ts is out of date: run npm run seed:approval-steps");
  const raised = [...fresh.scanConfig, ...fresh.schemes].filter((x) => x.k === "raise").length;
  const missing = ["SET-0001", "SET-0002", "SET-0003"].filter((id) => !approvalStore.get().requests.some((r) => r.requestType === "scheme_settlement" && r.entityRef === id));
  expect(missing.length === 0, `seeded settlements without an approval request: ${missing.join(", ")}`);
  return `${raised} module-raised requests replayed from the generated steps; matches a fresh build of the seeds`;
});

/* ---------------- Report ---------------- */
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(2)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (pass !== results.length) process.exit(1);
