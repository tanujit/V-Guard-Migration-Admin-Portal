/**
 * MOCK SCHEME & INCENTIVE DATA — development only (Phase 6).
 * Scheme names carry no V-Guard production meaning. Point values, budgets, thresholds and tier
 * thresholds below are development demo values typed in as a Maker would; they are not business
 * values and nothing in the engine defaults to them. Open SOW decisions stay open.
 */
import { GEOGRAPHY } from "@/config/geography";
import { emptyBranches, emptyConfig, emptyProducts } from "@/features/schemes/engine";
import type { BasePointsRow, Bonus, Campaign, ContestEntry, ExclusivityRule, Formula, GameConfig, ReferralRecord, ReferralRule, Scheme, SchemeConfig, SchemeDecision, SchemeVersion, SpecialExtension, Tier, TierSnapshot } from "@/types/schemes";

export const RAHUL = "USR-1003";
export const ANITA = "USR-2001";
export const LAKSHMI = "USR-2003";
export const TANUJIT = "USR-1001";

export const branchesIn = (states: string[]) => GEOGRAPHY.filter((g) => states.includes(g.code)).flatMap((g) => g.districts.flatMap((d) => d.branches.map((b) => b.code)));

type Patch = { [K in keyof SchemeConfig]?: Partial<SchemeConfig[K]> };
export function cfg(p: Patch): SchemeConfig {
  const base = emptyConfig();
  const out = { ...base } as SchemeConfig;
  (Object.keys(p) as (keyof SchemeConfig)[]).forEach((k) => {
    const v = p[k];
    (out as unknown as Record<string, unknown>)[k] = Array.isArray(base[k]) ? v : { ...(base[k] as object), ...(v as object) };
  });
  return out;
}
const row = (id: string, level: BasePointsRow["level"], refId: string, programme: string, points: number, branchCodes: string[] | "all", qualifying = "Per unit scanned (Scan-In)"): BasePointsRow => ({ id, level, refId, programme, branchCodes, points, qualifying });
const states = (codes: string[]) => ({ ...emptyBranches(), stateCodes: codes });
const cats = (ids: string[]) => ({ ...emptyProducts(), categoryIds: ids });

export function ver(version: number, status: SchemeVersion["status"], config: SchemeConfig, o: Partial<SchemeVersion> = {}): SchemeVersion {
  return { version, status, config, changeReason: version === 1 ? "Initial configuration" : "", createdBy: RAHUL, createdAt: "2026-09-01T10:00", submittedAt: null, approvalRequestId: null, approvedBy: null, approvedAt: null, effectiveStart: null, effectiveEnd: null, ruleVersion: `R${version}.0`, formulaVersions: {}, ...o };
}
const scheme = (id: string, status: Scheme["status"], versions: SchemeVersion[], o: Partial<Scheme> = {}): Scheme => ({
  id,
  status,
  versions,
  activeVersion: null,
  activations: [],
  settlementStatus: "not_started",
  createdBy: RAHUL,
  createdAt: versions[0].createdAt,
  updatedAt: versions[versions.length - 1].createdAt,
  backdated: { status: "not_requested", requestId: null, dataAvailability: "not_checked", runs: [] },
  closedAt: null,
  deactivatedAt: null,
  ...o,
});
const approved = (submittedAt: string, approvedAt: string, effectiveStart: string | null, effectiveEnd: string | null = null) => ({ submittedAt, approvedBy: ANITA, approvedAt, effectiveStart, effectiveEnd, createdAt: submittedAt.replace(/T.*/, "T09:00") });
const act = (at: string, version: number) => ({ at, by: RAHUL, version, result: "success" as const, checks: [{ label: "Approved version", ok: true, detail: `v${version} approved` }, { label: "Business confirmation", ok: true, detail: "No open blockers" }, { label: "Budget cap", ok: true, detail: "Configured" }], message: "Activated in the development scheme engine (mock adapter)", engine: "mock_development" as const });

/* ---------------- Scheme configurations ---------------- */

const DESC = "Development demo scheme. ";
const S1v1 = cfg({ basic: { name: "EP Wires Base Points · Kerala", code: "DEV-EP-WIRE-KL", description: `${DESC}Base Points for EP wires by sub-category in Kerala`, type: "base", level: "L0", programmes: ["EP"] }, products: cats(["CAT-001"]), eligibility: { branchScope: states(["KL"]) }, base: { enabled: true, rows: [row("BP-1", "sub_category", "SUB-011", "EP", 5, branchesIn(["KL"])), row("BP-2", "sub_category", "SUB-012", "EP", 8, branchesIn(["KL"])), row("BP-3", "sub_category", "SUB-013", "EP", 12, branchesIn(["KL"]))], qualifyingCriteria: "Successful Scan-In of an eligible wire SKU by an active EP member" }, duration: { type: "monthly", start: "2026-10-01", end: "2027-03-31", evaluation: "cumulative" }, budget: { amount: 250000, alertPct: 80 } });
const S1v2 = cfg({ ...S1v1, base: { ...S1v1.base, rows: S1v1.base.rows.map((r) => (r.id === "BP-2" ? { ...r, points: 9 } : r)) } });

const S2 = cfg({ basic: { name: "Retailer Fans Milestone · South", code: "DEV-RT-FAN-MS", description: `${DESC}Base Points with two milestone levels; partial release during the scheme`, type: "milestone", level: "L1", programmes: ["Retailer"] }, products: cats(["CAT-004"]), eligibility: { branchScope: states(["KL", "TN", "KA"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-004", "Retailer", 10, branchesIn(["KL", "TN", "KA"]))], qualifyingCriteria: "Scan-In of an eligible fan SKU" }, milestone: { enabled: true, contribution: "base", measure: "points", levels: [{ id: "M1", name: "Milestone 1", threshold: 150, reward: { kind: "fixed_points", value: 100, formulaId: null } }, { id: "M2", name: "Milestone 2", threshold: 300, reward: { kind: "fixed_points", value: 250, formulaId: null } }], memberProgress: true }, duration: { type: "custom", start: "2026-09-01", end: "2026-12-31", evaluation: "cumulative" }, budget: { amount: 400000, alertPct: 85 }, settlement: { mode: "partial_release", tranches: [{ id: "T1", label: "Mid-scheme release", pct: 60, trigger: "during_scheme", conditions: "Milestone points earned up to the release date" }, { id: "T2", label: "Final settlement", pct: 40, trigger: "final_settlement", conditions: "After closure and validation" }] } });

const S3 = cfg({ basic: { name: "EP Pumps Quantity Slabs · Tamil Nadu", code: "DEV-EP-PUMP-SLAB-TN", description: `${DESC}Monthly quantity slabs for EP pump installations`, type: "slab", level: "L0", programmes: ["EP"] }, products: { ...emptyProducts(), subCategoryIds: ["SUB-051", "SUB-052"] }, eligibility: { branchScope: states(["TN"]) }, base: { enabled: false, rows: [], qualifyingCriteria: "" }, quantity: { enabled: true, basis: "quantity", threshold: 4, target: 15, period: "monthly", useSlabs: true, reward: { kind: "fixed_points", value: null, formulaId: null } }, slab: { enabled: true, slabs: [{ id: "S1", name: "Slab A", min: 4, max: 7, achievement: "quantity", reward: { kind: "fixed_points", value: 120, formulaId: null }, qualificationRule: "Net installed quantity in the month", priority: 3 }, { id: "S2", name: "Slab B", min: 8, max: 14, achievement: "quantity", reward: { kind: "fixed_points", value: 300, formulaId: null }, qualificationRule: "Net installed quantity in the month", priority: 2 }, { id: "S3", name: "Slab C", min: 15, max: null, achievement: "quantity", reward: { kind: "fixed_points", value: 700, formulaId: null }, qualificationRule: "Net installed quantity in the month", priority: 1 }], reversal: { eligible: true, reductionHandling: "re_evaluate_net_activity", adjustmentFormulaId: "FRM-REVERSAL", downgradeOutcome: "Re-evaluate the month's slab on net quantity; correction posted as a linked reversal once the formula is confirmed" } }, combined: { enabled: true, components: ["quantity", "slab"], relation: "all_of", dependencies: [{ component: "slab", dependsOn: "quantity" }], note: "Quantity threshold gates the slab reward" }, duration: { type: "monthly", start: "2026-08-01", end: "2027-01-31", evaluation: "periodic" }, budget: { amount: 300000, alertPct: 80 }, settlement: { mode: "partial_release", tranches: [{ id: "T1", label: "Month-end release", pct: 50, trigger: "month_end", conditions: "Closed month, no pending reversal" }, { id: "T2", label: "Final settlement", pct: 50, trigger: "final_settlement", conditions: "After closure" }] } });

const S4 = cfg({ basic: { name: "ST Solar & Pumps Cross-sell", code: "DEV-ST-XSELL", description: `${DESC}Cross-sell bonus when solar and pump minimums are both met in the quarter`, type: "cross_sell", level: "L0", programmes: ["ST"] }, products: cats(["CAT-008", "CAT-005"]), eligibility: { branchScope: { ...emptyBranches(), allBranches: true } }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-008", "ST", 20, "all"), row("BP-2", "category", "CAT-005", "ST", 15, "all")], qualifyingCriteria: "Scan-In by an active ST member" }, crossSell: { enabled: true, categories: [{ categoryId: "CAT-008", basis: "quantity", minimum: 1 }, { categoryId: "CAT-005", basis: "quantity", minimum: 2 }], requiredCategoryCount: 2, reward: { kind: "fixed_points", value: 250, formulaId: null }, combineWithBase: true, contributesToMilestone: false, eligibility: "Both categories in the same quarter" }, duration: { type: "quarterly", start: "2026-07-01", end: "2026-09-30", evaluation: "periodic" }, budget: { amount: 200000, alertPct: 80 } });

const S5 = cfg({ basic: { name: "EP Pumps Monsoon Base · Tamil Nadu", code: "DEV-EP-PUMP-TN", description: `${DESC}Base Points on domestic pumps; runs alongside the slab scheme (inclusive)`, type: "base", level: "L0", programmes: ["EP"] }, products: { ...emptyProducts(), subCategoryIds: ["SUB-051"] }, eligibility: { branchScope: states(["TN"]) }, base: { enabled: true, rows: [row("BP-1", "sub_category", "SUB-051", "EP", 12, branchesIn(["TN"]))], qualifyingCriteria: "Scan-In of a domestic pump" }, duration: { type: "custom", start: "2026-10-01", end: "2026-12-31", evaluation: "cumulative" }, budget: { amount: 150000, alertPct: 80 } });

const S6 = cfg({ basic: { name: "Retailer Elite Rider Pilot · Kerala", code: "DEV-RT-RIDER", description: `${DESC}Rider Points layered on Base Points for Elite retailers`, type: "rider", level: "L1", programmes: ["Retailer"] }, products: cats(["CAT-004"]), eligibility: { branchScope: states(["KL"]), elite: "elite_only", segments: ["DEV-SEG-ELITE"] }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-004", "Retailer", 8, branchesIn(["KL"]))], qualifyingCriteria: "Scan-In of an eligible fan SKU" }, rider: { enabled: true, baseCondition: "base_points_threshold", baseThreshold: 1000, eligibility: "Elite retailers in Kerala", activationCondition: "Base Points in the month reach the threshold", reward: { kind: "business_formula", value: null, formulaId: "FRM-RIDER" }, programmes: ["Retailer"], segments: ["DEV-SEG-ELITE"], contributesToMilestone: true }, duration: { type: "monthly", start: "2026-12-01", end: "2027-03-31", evaluation: "periodic" }, budget: { amount: 100000, alertPct: 80 } });

const S7 = cfg({ basic: { name: "Retailer Stabilizer Growth · FY 2026-27", code: "DEV-RT-GROWTH", description: `${DESC}Growth over the previous year's baseline`, type: "growth", level: null, programmes: ["Retailer"] }, products: cats(["CAT-002"]), eligibility: { branchScope: states(["KL", "KA"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-002", "Retailer", 20, branchesIn(["KL", "KA"]))], qualifyingCriteria: "Scan-In of a stabilizer" }, growth: { enabled: true, baselineFrom: "2025-10-01", baselineTo: "2026-03-31", comparisonFrom: "2026-10-01", comparisonTo: "2027-03-31", requiredGrowthPct: null, basis: "quantity", riderActivation: false, milestoneContribution: false, programmeApplicability: ["Retailer"], reward: { kind: "business_formula", value: null, formulaId: "FRM-GROWTH" } }, duration: { type: "financial_year", start: "2026-10-01", end: "2027-03-31", evaluation: "cumulative" }, budget: { amount: 500000, alertPct: 80 } });

const S8 = cfg({ basic: { name: "CS Solar Winter · Kerala", code: "DEV-CS-SOLAR-KL", description: `${DESC}Base Points plus a monthly quantity reward`, type: "quantity", level: "L0", programmes: ["CS"] }, products: cats(["CAT-008"]), eligibility: { branchScope: states(["KL"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-008", "CS", 25, branchesIn(["KL"]))], qualifyingCriteria: "Scan-In of a solar SKU" }, quantity: { enabled: true, basis: "quantity", threshold: 3, target: null, period: "monthly", useSlabs: false, reward: { kind: "fixed_points", value: 100, formulaId: null } }, duration: { type: "monthly", start: "2026-12-01", end: "2027-02-28", evaluation: "periodic" }, budget: { amount: 80000, alertPct: 80 } });

const S9 = cfg({ basic: { name: "DD Water Heater Year-end", code: "", description: `${DESC}Draft in progress`, type: "base", level: null, programmes: ["DD"] }, products: cats(["CAT-006"]), eligibility: { branchScope: { ...emptyBranches(), allBranches: true } }, base: { enabled: true, rows: [], qualifyingCriteria: "" }, duration: { type: "custom", start: "2026-12-15", end: "2027-03-31", evaluation: "cumulative" } });

const S10 = cfg({ basic: { name: "EP Switchgear Q2 · Karnataka", code: "DEV-EP-SWG-KA", description: `${DESC}Base Points with one milestone; closed and settled`, type: "milestone", level: "L0", programmes: ["EP"] }, products: cats(["CAT-003"]), eligibility: { branchScope: states(["KA"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-003", "EP", 6, branchesIn(["KA"]))], qualifyingCriteria: "Scan-In of switchgear" }, milestone: { enabled: true, contribution: "base", measure: "points", levels: [{ id: "M1", name: "Milestone 1", threshold: 120, reward: { kind: "fixed_points", value: 100, formulaId: null } }], memberProgress: true }, duration: { type: "custom", start: "2026-07-01", end: "2026-09-30", evaluation: "cumulative" }, budget: { amount: 120000, alertPct: 80 } });

const S11 = cfg({ basic: { name: "Retailer Water Heater Winter · North", code: "DEV-RT-WH-N", description: `${DESC}Approved and waiting for its start date`, type: "base", level: "L0", programmes: ["Retailer"] }, products: cats(["CAT-006"]), eligibility: { branchScope: states(["UP", "DL", "MP"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-006", "Retailer", 18, branchesIn(["UP", "DL", "MP"]))], qualifyingCriteria: "Scan-In of a water heater" }, duration: { type: "custom", start: "2026-12-01", end: "2027-02-28", evaluation: "cumulative" }, budget: { amount: 180000, alertPct: 80 } });

const S12 = cfg({ basic: { name: "EP Wires Monsoon · Karnataka", code: "DEV-EP-WIRE-KA", description: `${DESC}Small budget to show auto-stop at the cap`, type: "base", level: "L0", programmes: ["EP"] }, products: cats(["CAT-001"]), eligibility: { branchScope: states(["KA"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-001", "EP", 4, branchesIn(["KA"]))], qualifyingCriteria: "Scan-In of a wire SKU" }, duration: { type: "custom", start: "2026-08-01", end: "2026-11-30", evaluation: "cumulative" }, budget: { amount: 400, autoStop: true, alertPct: 80 } });

const S13 = cfg({ basic: { name: "ST Pumps Service Push · Maharashtra", code: "DEV-ST-PUMP-MH", description: `${DESC}Returned by the Checker for correction`, type: "base", level: "L0", programmes: ["ST"] }, products: cats(["CAT-005"]), eligibility: { branchScope: states(["MH"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-005", "ST", 15, branchesIn(["MH"]))], qualifyingCriteria: "Scan-In of a pump" }, duration: { type: "custom", start: "2026-12-01", end: "2027-01-31", evaluation: "cumulative" }, budget: { amount: 90000, alertPct: 80 } });

const S14 = cfg({ basic: { name: "CS Solar Summer", code: "DEV-CS-SOLAR-SUM", description: `${DESC}Deactivated early after approval`, type: "base", level: "L0", programmes: ["CS"] }, products: cats(["CAT-008"]), eligibility: { branchScope: { ...emptyBranches(), allBranches: true } }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-008", "CS", 20, "all")], qualifyingCriteria: "Scan-In of a solar SKU" }, duration: { type: "custom", start: "2026-04-01", end: "2026-06-30", evaluation: "cumulative" }, budget: { amount: 60000, alertPct: 80 } });

const S15 = cfg({ basic: { name: "EP Inverter Backdated · Kerala", code: "DEV-EP-INV-KL", description: `${DESC}Announced on 5 November with effect from 1 October`, type: "base", level: "L0", programmes: ["EP"] }, products: cats(["CAT-007"]), eligibility: { branchScope: states(["KL"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-007", "EP", 15, branchesIn(["KL"]))], qualifyingCriteria: "Scan-In of an inverter or battery" }, backdated: { enabled: true, announcementDate: "2026-11-05", historicalFrom: "2026-10-01", historicalTo: "2026-11-04" }, duration: { type: "custom", start: "2026-10-01", end: "2026-12-31", evaluation: "cumulative" }, budget: { amount: 120000, alertPct: 80 } });

const S16 = cfg({ basic: { name: "Retailer Inverter Festive · Kerala", code: "DEV-RT-INV-KL", description: `${DESC}Approved; ready to activate`, type: "base", level: "L0", programmes: ["Retailer"] }, products: cats(["CAT-007"]), eligibility: { branchScope: states(["KL"]) }, base: { enabled: true, rows: [row("BP-1", "category", "CAT-007", "Retailer", 20, branchesIn(["KL"]))], qualifyingCriteria: "Scan-In of an inverter or battery" }, duration: { type: "custom", start: "2026-11-01", end: "2027-01-31", evaluation: "cumulative" }, budget: { amount: 140000, alertPct: 80 } });

export const SEED_SCHEMES: Scheme[] = [
  scheme("SCH-0001", "active", [ver(1, "superseded", S1v1, approved("2026-09-26T11:00", "2026-09-28T16:00", "2026-10-01", "2026-10-20")), ver(2, "active", S1v2, { ...approved("2026-10-17T10:00", "2026-10-19T15:00", "2026-10-20"), changeReason: "Multi-core cable value revised after the first fortnight" })], { activeVersion: 2, activations: [act("2026-09-30T09:00", 1), act("2026-10-20T09:00", 2)] }),
  scheme("SCH-0002", "active", [ver(1, "active", S2, approved("2026-08-25T10:00", "2026-08-27T12:00", "2026-09-01"))], { activeVersion: 1, activations: [act("2026-09-01T08:00", 1)], settlementStatus: "partially_settled" }),
  scheme("SCH-0003", "active", [ver(1, "active", S3, approved("2026-07-24T10:00", "2026-07-28T12:00", "2026-08-01"))], { activeVersion: 1, activations: [act("2026-08-01T08:00", 1)] }),
  scheme("SCH-0004", "completed", [ver(1, "active", S4, approved("2026-06-20T10:00", "2026-06-24T12:00", "2026-07-01"))], { activeVersion: 1, activations: [act("2026-07-01T08:00", 1)], settlementStatus: "settlement_pending" }),
  scheme("SCH-0005", "active", [ver(1, "active", S5, approved("2026-09-22T10:00", "2026-09-25T12:00", "2026-10-01"))], { activeVersion: 1, activations: [act("2026-10-01T08:00", 1)] }),
  scheme("SCH-0006", "business_confirmation_required", [ver(1, "draft", S6, { createdAt: "2026-11-02T10:00" })]),
  scheme("SCH-0007", "business_confirmation_required", [ver(1, "draft", S7, { createdAt: "2026-11-04T10:00" })]),
  scheme("SCH-0008", "pending_approval", [ver(1, "submitted", S8, { createdAt: "2026-11-07T15:00", submittedAt: "2026-11-08T10:00" })]),
  scheme("SCH-0009", "draft", [ver(1, "draft", S9, { createdAt: "2026-11-09T09:30" })]),
  scheme("SCH-0010", "closed", [ver(1, "active", S10, approved("2026-06-22T10:00", "2026-06-26T12:00", "2026-07-01", "2026-10-01"))], { activeVersion: 1, activations: [act("2026-07-01T08:00", 1)], closedAt: "2026-10-15T12:00", settlementStatus: "settled" }),
  scheme("SCH-0011", "scheduled", [ver(1, "approved", S11, approved("2026-11-03T10:00", "2026-11-06T12:00", null))]),
  scheme("SCH-0012", "active", [ver(1, "active", S12, approved("2026-07-25T10:00", "2026-07-29T12:00", "2026-08-01"))], { activeVersion: 1, activations: [act("2026-08-01T08:00", 1)] }),
  scheme("SCH-0013", "returned", [ver(1, "returned", S13, { createdAt: "2026-11-05T10:00", submittedAt: "2026-11-05T15:00" })]),
  scheme("SCH-0014", "deactivated", [ver(1, "active", S14, approved("2026-03-20T10:00", "2026-03-24T12:00", "2026-04-01", "2026-05-20"))], { activeVersion: 1, activations: [act("2026-04-01T08:00", 1)], deactivatedAt: "2026-05-20T12:00" }),
  scheme("SCH-0015", "active", [ver(1, "active", S15, approved("2026-11-03T10:00", "2026-11-04T17:00", "2026-11-05"))], { activeVersion: 1, activations: [act("2026-11-05T08:00", 1)] }),
  scheme("SCH-0016", "approved", [ver(1, "approved", S16, approved("2026-11-05T10:00", "2026-11-07T12:00", null))]),
];

export const SEED_EXTENSIONS: SpecialExtension[] = [
  { id: "EXT-0001", schemeId: "SCH-0001", baseVersion: 2, kind: "member", memberIds: ["MBR-EP-0010"], branchCodes: [], reason: "Member relocated to Chennai mid-scheme; V-Guard asked to keep him in the Kerala scheme (demo)", effectiveFrom: "2026-10-26", status: "active", approvalRequestId: null, createdBy: RAHUL, createdAt: "2026-10-23T11:00" },
  { id: "EXT-0002", schemeId: "SCH-0002", baseVersion: 1, kind: "branch", memberIds: [], branchCodes: ["AP-BR-VIJAYAWADA"], reason: "Pilot extension to one Andhra branch (demo)", effectiveFrom: "2026-11-15", status: "pending_approval", approvalRequestId: null, createdBy: RAHUL, createdAt: "2026-11-08T16:00" },
];

const allP = emptyProducts();
export const SEED_EXCLUSIVITY: ExclusivityRule[] = [
  { id: "EXR-0001", schemeA: "SCH-0001", schemeB: "SCH-0015", programmes: ["EP"], products: allP, branchScope: states(["KL"]), from: "2026-11-01", to: "2026-12-31", description: "EP members in Kerala take part in either the wires scheme or the inverter scheme (demo)", status: "active", approvalRequestId: null, createdBy: RAHUL, createdAt: "2026-11-01T10:00" },
  { id: "EXR-0002", schemeA: "SCH-0015", schemeB: "SCH-0005", programmes: ["EP"], products: allP, branchScope: emptyBranches(), from: "2026-11-01", to: "2026-12-31", description: "Inverter scheme is exclusive with the Tamil Nadu pump scheme (demo)", status: "active", approvalRequestId: null, createdBy: RAHUL, createdAt: "2026-11-02T10:00" },
];

/* ---------------- Governance ---------------- */

export const SEED_SCHEME_DECISIONS: SchemeDecision[] = [
  { id: "OP-SB-LVL", source: "sow", description: "Meaning of Scheme Level 0 and Level 1", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Basic configuration: Scheme Level", restriction: "Level is recorded only. A scheme marked as using level semantics in a calculation cannot be submitted or activated", notes: "" },
  { id: "OP-SB-RIDER", source: "sow", description: "Rider Points activation logic and formula, including milestone contribution", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Rider Points; Milestones counting Rider; Combined rules including Rider", restriction: "Configuration allowed; submission and activation blocked", notes: "" },
  { id: "OP-01", source: "sow", description: "Growth calculation basis, growth reward mechanics and programme applicability", owner: "V-Guard Sales / Finance", status: "open", impacted: "Growth-based schemes", restriction: "Configuration allowed; submission and activation blocked", notes: "" },
  { id: "OP-SB-LIAB", source: "sow", description: "Projected-liability formula", owner: "V-Guard Finance", status: "open", impacted: "Review step, scheme scorecard, financial sign-off", restriction: "Projected liability shown as Pending Business Formula. Financial sign-off cannot be recorded and production activation is blocked; development-engine activation is labelled as such", notes: "" },
  { id: "OP-SB-GUIDE", source: "sow", description: "Scheme Configuration Guide requirement and ownership", owner: "Not assigned", status: "open", impacted: "Governance · Configuration guide", restriction: "Template provided; ownership pending", notes: "" },
  { id: "OP-07", source: "sow", description: "Branch-specific tier valuation versus only threshold differences", owner: "V-Guard Finance", status: "open", impacted: "Tier branch configuration", restriction: "Thresholds and valuation are separate fields; valuation stays unconfigured", notes: "" },
  { id: "OP-SB-BONUS", source: "sow", description: "Welcome, Assured Scratch and Mega Scratch triggers and eligibility", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Bonus configuration", restriction: "Configuration allowed; activation blocked", notes: "" },
  { id: "OP-REF1", source: "sow", description: "Active referral mechanics; scope of future Retailer → Consumer", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Referral rules, Referral Milestone campaigns", restriction: "Rules stay in draft; Retailer → Consumer reserved and inactive", notes: "" },
  { id: "SCH-Q1", source: "portal", description: "Precedence when Base Points are configured at more than one hierarchy level for the same SKU and branch", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Base Points matrix", restriction: "Overlap is a validation error: one level per SKU and branch", notes: "Raised during Phase 6 build" },
  { id: "SCH-Q2", source: "portal", description: "Whether an accrual that crosses the budget cap is credited in part", owner: "V-Guard Finance", status: "open", impacted: "Budget auto-stop", restriction: "Mock engine refuses the crossing accrual and stops the scheme", notes: "" },
  { id: "SCH-Q3", source: "portal", description: "Rounding of partial-release points", owner: "V-Guard Finance", status: "open", impacted: "Partial settlement", restriction: "Fractions are held and shown, never discarded", notes: "" },
  { id: "SCH-Q4", source: "portal", description: "Execution precedence between combined components", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Combined rules", restriction: "Only the configured relationship (all of / any of) is evaluated", notes: "" },
  { id: "SCH-Q5", source: "portal", description: "Scratch-card and spin reward allocation / probabilities", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Scratch cards, spin wheel, Spin campaigns", restriction: "No random distribution until an allocation is approved", notes: "" },
  { id: "SCH-Q6", source: "portal", description: "Buy-X-Get-Y qualifying rule where X / Y are not stated", owner: "V-Guard Channel Loyalty", status: "open", impacted: "FOC campaigns", restriction: "Campaigns without explicit X and Y are blocked", notes: "" },
  { id: "SCH-Q7", source: "portal", description: "Reversal / downgrade correction formula after a sales return", owner: "V-Guard Finance", status: "open", impacted: "Slab downgrade, all reversals", restriction: "Linked reversal records stay pending; originals are kept; settlement waits", notes: "" },
  { id: "SCH-Q8", source: "portal", description: "Leaderboard ranking formula and tie-break", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Leaderboards", restriction: "Leaderboards without a tie-break rule are blocked", notes: "" },
  { id: "SCH-Q9", source: "portal", description: "Source and rules for RFM, inactivity and business-decline targeting", owner: "V-Guard Analytics", status: "open", impacted: "Targeting", restriction: "Configurable; population not computable; mock engine does not credit on these dimensions", notes: "" },
  { id: "SCH-Q10", source: "portal", description: "Precedence between conflicting exclusivity rules", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Concurrency & exclusivity", restriction: "Conflicts are flagged; simultaneous qualification is not credited", notes: "" },
  { id: "SCH-Q11", source: "portal", description: "Streak duration and reward", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Streaks", restriction: "Streaks without a duration are blocked", notes: "" },
  { id: "SCH-Q12", source: "portal", description: "Milestone rewards: each level's reward when reached, or only the highest level", owner: "V-Guard Channel Loyalty", status: "open", impacted: "Milestones", restriction: "Mock engine accrues each level's configured reward once when reached; confirm before production", notes: "" },
];

export const SEED_FORMULAS: Formula[] = [
  { id: "FRM-LIAB", name: "Projected liability", appliesTo: "Review & validation, scorecard", decisionRef: "OP-SB-LIAB", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
  { id: "FRM-RIDER", name: "Rider Points calculation", appliesTo: "Rider Points", decisionRef: "OP-SB-RIDER", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
  { id: "FRM-GROWTH", name: "Growth reward", appliesTo: "Growth-based", decisionRef: "OP-01", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
  { id: "FRM-XSELL", name: "Cross-sell bonus (formula-based)", appliesTo: "Cross-selling (when not a fixed value)", decisionRef: "SCH-Q4", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
  { id: "FRM-REVERSAL", name: "Reversal / downgrade correction", appliesTo: "Slabs, sales returns", decisionRef: "SCH-Q7", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
  { id: "FRM-BONUS", name: "Bonus reward", appliesTo: "Welcome / Assured / Mega Scratch", decisionRef: "OP-SB-BONUS", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
  { id: "FRM-REF", name: "Referral reward", appliesTo: "Referral rules", decisionRef: "OP-REF1", status: "pending", version: null, definition: "", confirmedBy: null, confirmedAt: null },
];

/* ---------------- Tiers ---------------- */

const T = "2026-10-12T10:00";
const benefit = (id: string, name: string, redeemUpTo: string) => ({ id, name, description: "Development demo benefit text", eligibility: "Members holding this tier", branchCodes: "all" as const, redeemUpTo, validity: "While the tier is held" });
const tier = (id: string, programme: string, rank: number, name: string, threshold: number | null, status: Tier["status"], benefits: Tier["benefits"], branchConfigs: Tier["branchConfigs"] = []): Tier => ({ id, code: `DEV-${programme.toUpperCase()}-${name.toUpperCase()}`, name, description: "SOW example tier name; V-Guard's tier master is not confirmed", programme, rank, threshold, thresholdBasis: threshold == null ? null : "points", qualification: threshold == null ? "" : "Points earned in the validity period (demo)", validity: "Financial year (demo)", branchConfigs, benefits, status, version: 1, approvalRequestId: null, updatedBy: RAHUL, updatedAt: T });
export const SEED_TIERS: Tier[] = [
  tier("TIER-EP-1", "EP", 1, "Bronze", 0, "active", [benefit("TB-01", "Standard catalogue", "Redeem up to the standard catalogue (demo text)")]),
  tier("TIER-EP-2", "EP", 2, "Silver", 2000, "active", [benefit("TB-02", "Priority support", "Redeem up to Silver catalogue items (demo text)")], [{ branchCode: "KL-BR-KOCHI", threshold: 1800, valuation: { configured: false, note: "OP-07: valuation by branch not confirmed" } }]),
  tier("TIER-EP-3", "EP", 3, "Gold", 6000, "active", [benefit("TB-03", "Gold catalogue", "Redeem up to Gold catalogue items (demo text)")]),
  tier("TIER-EP-4", "EP", 4, "Diamond", 15000, "pending_approval", [benefit("TB-04", "Diamond catalogue", "Redeem up to Diamond catalogue items (demo text)")]),
  tier("TIER-RT-1", "Retailer", 1, "Bronze", null, "draft", []),
  tier("TIER-RT-2", "Retailer", 2, "Silver", null, "draft", []),
];
export function tierSnapshots(): TierSnapshot[] {
  const out: TierSnapshot[] = [];
  const kl = branchesIn(["KL", "TN", "KA"]);
  kl.forEach((b, i) => ["TIER-EP-1", "TIER-EP-2", "TIER-EP-3"].forEach((t, j) => out.push({ programme: "EP", tierId: t, branchCode: b, members: [42, 17, 5][j] + ((i * 7 + j * 3) % 11), nearNext: j < 2 ? 2 + ((i + j) % 5) : 0, upgrades30d: (i + j) % 4, downgrades30d: (i + 2 * j) % 2 })));
  return out;
}

/* ---------------- Referrals ---------------- */

const rr = (id: string, name: string, relationship: ReferralRule["relationship"], referrer: string[], referred: ReferralRule["referredProgramme"], status: ReferralRule["status"]): ReferralRule => ({ id, name, relationship, referrerProgrammes: referrer, referredProgramme: referred, branchScope: { ...emptyBranches(), allBranches: true }, eligibility: "", trigger: null, reward: { kind: "business_formula", value: null, formulaId: "FRM-REF" }, settlementBucket: "referral_unsettled", status, approvalRequestId: null, updatedBy: RAHUL, updatedAt: "2026-10-28T10:00" });
export const SEED_REFERRAL_RULES: ReferralRule[] = [
  rr("REF-R-01", "Influencer refers Influencer", "influencer_influencer", ["EP"], "EP", "draft"),
  rr("REF-R-02", "Retailer refers EP", "retailer_ep", ["Retailer"], "EP", "draft"),
  rr("REF-R-03", "Retailer refers ST", "retailer_st", ["Retailer"], "ST", "draft"),
  rr("REF-R-04", "Retailer refers Consumer (future)", "retailer_consumer", ["Retailer"], "Consumer", "reserved_future"),
];
const chk = (selfRef: "pass" | "flag", dup: "pass" | "flag", restricted: "pass" | "flag") => [
  { check: "Referrer and referred are different KYC identities", result: selfRef, detail: selfRef === "pass" ? "Different identities" : "Same identity: flagged for review" },
  { check: "Referred member was not already registered in the programme", result: dup, detail: dup === "pass" ? "New registration" : "Registered before the referral date: flagged" },
  { check: "Referrer is not under a Program Block or Temporary Hold", result: restricted, detail: restricted === "pass" ? "No restriction" : "Referrer restricted: flagged" },
];
export const SEED_REFERRALS: ReferralRecord[] = [
  ["REF-0001", "REF-R-01", "MBR-EP-0004", "EP", "MBR-EP-0120", "EP", "2026-10-02", "Active — Scan enabled", "Partially verified", chk("pass", "pass", "pass")],
  ["REF-0002", "REF-R-01", "MBR-EP-0005", "EP", "MBR-EP-0138", "EP", "2026-10-09", "Active — Scan enabled", "Pending", chk("pass", "pass", "pass")],
  ["REF-0003", "REF-R-02", "MBR-RT-0001", "Retailer", "MBR-EP-0003", "EP", "2026-10-14", "Redemption KYC pending", "Partially verified", chk("pass", "pass", "pass")],
  ["REF-0004", "REF-R-02", "MBR-RT-0101", "Retailer", "MBR-EP-0001", "EP", "2026-11-01", "Pending Stage 1", "Pending", chk("pass", "pass", "pass")],
  ["REF-0005", "REF-R-03", "MBR-RT-0002", "Retailer", "MBR-ST-0003", "ST", "2026-10-21", "Active — Scan enabled", "Pending", chk("pass", "pass", "pass")],
  ["REF-0006", "REF-R-03", "MBR-RT-0102", "Retailer", "MBR-ST-0100", "ST", "2026-10-25", "Active — Scan enabled", "Pending", chk("pass", "flag", "pass")],
  ["REF-0007", "REF-R-01", "MBR-EP-0010", "EP", "MBR-EP-0106", "EP", "2026-09-18", "Redemption enabled", "Verified", chk("pass", "flag", "pass")],
  ["REF-0008", "REF-R-02", "MBR-RT-0103", "Retailer", "MBR-EP-0128", "EP", "2026-09-30", "Redemption enabled", "Verified", chk("pass", "pass", "flag")],
].map(([id, ruleId, referrerId, rp, referredId, dp, date, registration, kyc, checks]) => ({ id: id as string, ruleId: ruleId as string, referrerId: referrerId as string, referrerProgramme: rp as string, referredId: referredId as string, referredProgramme: dp as string, date: date as string, registration: registration as string, kyc: kyc as string, qualification: "blocked_rule_pending" as const, reward: "blocked" as const, settlement: "not_started" as const, checks: checks as ReferralRecord["checks"] }));

/* ---------------- Campaigns ---------------- */

const camp = (c: Partial<Campaign> & Pick<Campaign, "id" | "code" | "name" | "type" | "programmes" | "start" | "end" | "status">): Campaign => ({ description: "Development demo campaign", allStates: false, stateCodes: [], branchCodes: [], targeting: [], budget: 50000, reward: { kind: "fixed_points", value: null, formulaId: null }, rewardNote: "", foc: null, approvalRequestId: null, updatedBy: RAHUL, updatedAt: "2026-10-30T10:00", ...c });
export const SEED_CAMPAIGNS: Campaign[] = [
  camp({ id: "CMP-0001", code: "DEV-HH-WIRE-KA", name: "Happy Hour on wires · Karnataka", type: "happy_hour", programmes: ["EP"], stateCodes: ["KA"], start: "2026-11-15", end: "2026-11-30", status: "scheduled", reward: { kind: "fixed_points", value: 5, formulaId: null }, rewardNote: "Extra points per scan between 18:00 and 20:00 (window typed by the Maker)", budget: 30000 }),
  camp({ id: "CMP-0002", code: "DEV-LD-SOUTH", name: "Lucky Draw · South", type: "lucky_draw", programmes: ["EP"], stateCodes: ["KL", "TN"], start: "2026-12-01", end: "2026-12-31", status: "draft", reward: { kind: "fixed_points", value: 1000, formulaId: null }, rewardNote: "Draw prize (demo)", budget: 25000 }),
  camp({ id: "CMP-0003", code: "DEV-DC-KL-KA", name: "Display Contest · Kerala & Karnataka", type: "display_contest", programmes: ["Retailer", "CS"], stateCodes: ["KL", "KA"], start: "2026-10-15", end: "2026-11-30", status: "active", reward: { kind: "fixed_points", value: 500, formulaId: null }, rewardNote: "Regional winners (demo)", budget: 20000 }),
  camp({ id: "CMP-0004", code: "DEV-FOC-FAN", name: "Buy fans, get one free · Kerala", type: "foc", programmes: ["Retailer"], stateCodes: ["KL"], start: "2026-11-01", end: "2026-12-31", status: "active", foc: { variant: "same_sku", qualifyingSkuIds: ["SKU-00015"], rewardSkuId: "SKU-00015", giftName: "", qualifyingQty: 10, rewardQty: 1, formulaId: null }, rewardNote: "X and Y typed explicitly by the Maker (demo)", budget: 40000 }),
  camp({ id: "CMP-0005", code: "DEV-GIFT-RT", name: "Retailer Diwali gift entitlement", type: "foc", programmes: ["Retailer"], stateCodes: ["KL", "TN", "KA"], start: "2026-10-20", end: "2026-11-30", status: "active", foc: { variant: "gift_entitlement", qualifyingSkuIds: ["SKU-00015", "SKU-00017"], rewardSkuId: null, giftName: "Festive gift hamper (demo)", qualifyingQty: 20, rewardQty: 1, formulaId: null }, budget: 60000 }),
  camp({ id: "CMP-0006", code: "DEV-SPIN-EP", name: "EP Spin & Win", type: "spin", programmes: ["EP"], allStates: true, start: "2026-12-01", end: "2026-12-31", status: "draft", reward: { kind: "fixed_points", value: null, formulaId: null } }),
  camp({ id: "CMP-0007", code: "DEV-SB-ST", name: "ST Scan Bonus · Tamil Nadu", type: "scan_bonus", programmes: ["ST"], stateCodes: ["TN"], start: "2026-10-01", end: "2026-12-31", status: "active", reward: { kind: "fixed_points", value: 10, formulaId: null }, rewardNote: "Bonus per scan after the configured count (demo)" }),
  camp({ id: "CMP-0008", code: "DEV-COMBO-RT", name: "Retailer Combo · fans + water heaters", type: "combo", programmes: ["Retailer"], stateCodes: ["KL"], start: "2026-08-01", end: "2026-09-30", status: "completed", reward: { kind: "fixed_points", value: 200, formulaId: null } }),
  camp({ id: "CMP-0009", code: "DEV-REFMS", name: "Referral Milestone · EP", type: "referral_milestone", programmes: ["EP"], allStates: true, start: "2026-12-01", end: "2027-01-31", status: "draft", reward: { kind: "business_formula", value: null, formulaId: "FRM-REF" } }),
];

const entry = (n: number, memberId: string, programme: string, region: string, capture: ContestEntry["capture"], status: ContestEntry["status"], day: number, gps: ContestEntry["gps"]): ContestEntry => ({ id: `DCE-${String(n).padStart(4, "0")}`, campaignId: "CMP-0003", memberId, programme, region, photoRef: `DEV-PHOTO-${String(n).padStart(4, "0")} (no image stored)`, capture, gps, capturedAt: `2026-10-${String(day).padStart(2, "0")}T11:${String(10 + n).padStart(2, "0")}`, submittedAt: `2026-10-${String(day).padStart(2, "0")}T11:${String(12 + n).padStart(2, "0")}`, status, reviewedBy: status === "submitted" ? null : RAHUL, remarks: status === "winner" ? "Regional winner (demo)" : "" });
export const SEED_CONTEST_ENTRIES: ContestEntry[] = [
  entry(1, "MBR-RT-0001", "Retailer", "Kerala", "camera_verified", "winner", 18, { lat: 9.98, lng: 76.28 }),
  entry(2, "MBR-RT-0101", "Retailer", "Kerala", "camera_verified", "shortlisted", 19, { lat: 10.52, lng: 76.21 }),
  entry(3, "MBR-CS-0103", "CS", "Kerala", "camera_verified", "under_review", 21, { lat: 11.25, lng: 75.78 }),
  entry(4, "MBR-RT-0107", "Retailer", "Karnataka", "camera_verified", "winner", 22, { lat: 12.3, lng: 76.65 }),
  entry(5, "MBR-CS-0110", "CS", "Karnataka", "source_unconfirmed", "submitted", 24, null),
  entry(6, "MBR-RT-0108", "Retailer", "Karnataka", "camera_verified", "not_selected", 25, { lat: 12.91, lng: 74.86 }),
  entry(7, "MBR-CS-0109", "CS", "Kerala", "camera_verified", "submitted", 27, { lat: 9.97, lng: 76.3 }),
];

/* ---------------- Gamification & bonuses ---------------- */

const scope0 = { skuIds: [], categoryIds: [], branchCodes: [], geoFencePincodes: [] };
const game = (g: Partial<GameConfig> & Pick<GameConfig, "id" | "kind" | "name" | "programmes" | "status">): GameConfig => ({ description: "Development demo configuration", scope: scope0, settings: {}, options: [], budget: null, start: "2026-11-01", end: "2027-03-31", approvalRequestId: null, updatedBy: RAHUL, updatedAt: "2026-10-30T10:00", ...g });
export const SEED_GAMES: GameConfig[] = [
  game({ id: "GAM-0001", kind: "badge", name: "First 100 scans", programmes: ["EP"], status: "active", settings: { criteria: "100 successful Scan-Ins (typed by the Maker, demo)", recognition: "Badge on profile" } }),
  game({ id: "GAM-0002", kind: "badge", name: "Pump specialist", programmes: ["EP", "ST"], status: "draft", scope: { ...scope0, categoryIds: ["CAT-005"] }, settings: { criteria: "", recognition: "" } }),
  game({ id: "GAM-0003", kind: "streak", name: "Daily Scan-In streak", programmes: ["EP"], status: "draft", settings: { event: "Daily Scan-In", frequency: "Daily", requiredDuration: null, reward: "" } }),
  game({ id: "GAM-0004", kind: "scratch_card", name: "Scan-In scratch card", programmes: ["EP", "Retailer"], status: "draft", settings: { action: "Successful Scan-In", memberScope: "Active members", scheme: "" }, options: [{ id: "O1", label: "Option A", reward: { kind: "fixed_points", value: 10, formulaId: null }, probabilityPct: null }, { id: "O2", label: "Option B", reward: { kind: "fixed_points", value: 50, formulaId: null }, probabilityPct: null }], budget: 25000 }),
  game({ id: "GAM-0005", kind: "spin_wheel", name: "Monthly spin", programmes: ["EP"], status: "draft", settings: { action: "Monthly target met", memberScope: "Active EP members" }, options: [{ id: "O1", label: "Segment 1", reward: { kind: "fixed_points", value: 20, formulaId: null }, probabilityPct: null }], budget: 20000 }),
  game({ id: "GAM-0006", kind: "leaderboard", name: "District leaderboard · Kerala EP", programmes: ["EP"], status: "draft", scope: { ...scope0, branchCodes: branchesIn(["KL"]) }, settings: { scopeLevel: "District", metric: "Points earned in the month", period: "Monthly", segment: "Active EP members", display: "Top 10 and own position", tieBreak: null } }),
  game({ id: "GAM-0007", kind: "leaderboard", name: "Outlet leaderboard · Retailer", programmes: ["Retailer"], status: "draft", settings: { scopeLevel: "Outlet", metric: "", period: "", segment: "", display: "", tieBreak: null } }),
  game({ id: "GAM-0008", kind: "achievement", name: "Achievement feed", programmes: ["EP", "ST", "CS", "Retailer", "DD"], status: "active", settings: { feed: "Tier changes, milestones reached, badges earned", progress: "Only schemes and achievements the member qualifies for" } }),
];
const bonus = (id: string, name: string, type: Bonus["type"]): Bonus => ({ id, name, type, trigger: null, eligibility: null, programmes: ["EP"], scope: scope0, reward: { kind: "business_formula", value: null, formulaId: "FRM-BONUS" }, budget: 50000, start: "2026-12-01", end: "2027-03-31", status: "draft", approvalRequestId: null, updatedBy: RAHUL, updatedAt: "2026-10-30T10:00" });
export const SEED_BONUSES: Bonus[] = [bonus("BON-0001", "EP Welcome Bonus", "welcome"), bonus("BON-0002", "Assured Scratch", "assured_scratch"), bonus("BON-0003", "Mega Scratch", "mega_scratch")];
