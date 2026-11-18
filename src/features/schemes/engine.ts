/**
 * SCHEME ENGINE — pure functions (Phase 6).
 * Validation, applicability resolution, overlap and exclusivity analysis, deterministic evaluation of
 * explicitly configured rules, exposure metrics and settlement previews. These functions describe and
 * check configuration; the authoritative reward calculation belongs to the backend scheme engine.
 * Anything that depends on an unconfirmed rule returns a "blocked" result instead of a number.
 */
import { findBranch, GEOGRAPHY } from "@/config/geography";
import { CAMPAIGN_TYPE, COMPONENT_LABEL, LUCKY_DRAW_EXCLUDED_STATES, SCHEME_TYPE, TARGET_DIMENSIONS } from "@/config/schemeCatalogue";
import { fyOf, fyRange } from "@/data/mock/time";
import { ALL_BRANCHES, categoryById, productById, skuById, subById, type MasterState } from "@/features/masters/engine";
import type { MemberState } from "@/features/members/engine";
import type { FieldChange } from "@/types/approval";
import type { Member } from "@/types/members";
import type {
  BasePointsRow,
  Bonus,
  BranchScope,
  Campaign,
  ComponentKey,
  DurationConfig,
  GameConfig,
  ProductScope,
  RewardAccrual,
  RewardDef,
  Scheme,
  SchemeConfig,
  SchemeState,
  SchemeVersion,
  SettlementConfig,
  Slab,
  TargetingCondition,
} from "@/types/schemes";

/* ======================= Builders ======================= */

export const emptyReward = (): RewardDef => ({ kind: "fixed_points", value: null, formulaId: null });
export const emptyProducts = (): ProductScope => ({ allProducts: false, categoryIds: [], subCategoryIds: [], skuIds: [] });
export const emptyBranches = (): BranchScope => ({ allBranches: false, stateCodes: [], districtCodes: [], branchCodes: [] });

export function emptyConfig(): SchemeConfig {
  return {
    basic: { name: "", code: "", description: "", type: "base", level: null, levelUsedInCalculation: false, programmes: [] },
    base: { enabled: true, rows: [], qualifyingCriteria: "" },
    rider: { enabled: false, baseCondition: null, baseThreshold: null, eligibility: "", activationCondition: "", reward: emptyReward(), programmes: [], segments: [], contributesToMilestone: false },
    crossSell: { enabled: false, categories: [], requiredCategoryCount: null, reward: emptyReward(), combineWithBase: false, contributesToMilestone: false, eligibility: "" },
    quantity: { enabled: false, basis: "quantity", target: null, threshold: null, period: "scheme_period", useSlabs: false, reward: emptyReward() },
    products: emptyProducts(),
    combined: { enabled: false, components: [], relation: "all_of", dependencies: [], note: "" },
    milestone: { enabled: false, contribution: "base", measure: "points", levels: [], memberProgress: true },
    slab: { enabled: false, slabs: [], reversal: { eligible: null, reductionHandling: null, adjustmentFormulaId: null, downgradeOutcome: "" } },
    growth: { enabled: false, baselineFrom: "", baselineTo: "", comparisonFrom: "", comparisonTo: "", requiredGrowthPct: null, basis: null, riderActivation: false, milestoneContribution: false, programmeApplicability: [], reward: { kind: "business_formula", value: null, formulaId: "FRM-GROWTH" } },
    duration: { type: "custom", start: "", end: "", evaluation: "cumulative" },
    eligibility: { branchScope: emptyBranches(), groups: [], segments: [], selectedMemberIds: [], elite: "any", segmentNotes: [] },
    targeting: [],
    backdated: { enabled: false, announcementDate: "", historicalFrom: "", historicalTo: "" },
    budget: { unit: "points", amount: null, autoStop: true, alertPct: null },
    settlement: { mode: "at_closure", tranches: [{ id: "T1", label: "Final settlement", pct: 100, trigger: "final_settlement", conditions: "After closure and validation" }] },
  };
}

/* ======================= Lookups ======================= */

export const schemeById = (s: SchemeState, id: string) => s.schemes.find((x) => x.id === id);
export const latestVersion = (sc: Scheme) => sc.versions[sc.versions.length - 1];
export const versionOf = (sc: Scheme, v: number | null) => (v == null ? undefined : sc.versions.find((x) => x.version === v));
export const activeConfig = (sc: Scheme) => versionOf(sc, sc.activeVersion)?.config;
/** The configuration people should look at: the active version if there is one, otherwise the latest. */
export const displayVersion = (sc: Scheme): SchemeVersion => versionOf(sc, sc.activeVersion) ?? latestVersion(sc);
export const schemeName = (s: SchemeState, id: string) => schemeById(s, id) ? displayVersion(schemeById(s, id)!).config.basic.name : id;
export const isEarning = (sc: Scheme) => sc.status === "active" && sc.activeVersion != null;

export const formulaById = (s: SchemeState, id: string | null) => (id ? s.formulas.find((f) => f.id === id) : undefined);
export const decisionById = (s: SchemeState, id: string) => s.decisions.find((d) => d.id === id);
export const decisionConfirmed = (s: SchemeState, id: string) => decisionById(s, id)?.status === "confirmed";
/** A formula may be used only once it is confirmed and its decision is confirmed. */
export const formulaUsable = (s: SchemeState, id: string | null) => {
  const f = formulaById(s, id);
  return !!f && f.status === "confirmed" && decisionConfirmed(s, f.decisionRef);
};

export const skuCategory = (ms: MasterState, skuId: string) => {
  const p = productById(ms, skuById(ms, skuId)?.productId ?? "");
  return { categoryId: p?.categoryId ?? null, subCategoryId: p?.subCategoryId ?? null };
};

/** SKUs covered by a product scope. A selected sub-category covers every SKU beneath it (SOW 6.2.6). */
export function skusInScope(ms: MasterState, sc: ProductScope): Set<string> {
  if (sc.allProducts) return new Set(ms.skus.map((k) => k.id));
  const out = new Set(sc.skuIds);
  ms.skus.forEach((k) => {
    const { categoryId, subCategoryId } = skuCategory(ms, k.id);
    if ((categoryId && sc.categoryIds.includes(categoryId)) || (subCategoryId && sc.subCategoryIds.includes(subCategoryId))) out.add(k.id);
  });
  return out;
}

export function branchesInScope(sc: BranchScope): Set<string> {
  if (sc.allBranches) return new Set(ALL_BRANCHES.map((b) => b.code));
  const out = new Set(sc.branchCodes);
  ALL_BRANCHES.forEach((b) => {
    if (sc.stateCodes.includes(b.state) || sc.districtCodes.includes(b.district)) out.add(b.code);
  });
  return out;
}
const scopeEmpty = (sc: BranchScope) => !sc.allBranches && !sc.stateCodes.length && !sc.districtCodes.length && !sc.branchCodes.length;
const productsEmpty = (sc: ProductScope) => !sc.allProducts && !sc.categoryIds.length && !sc.subCategoryIds.length && !sc.skuIds.length;

/** SKUs a base-points row covers. */
export function rowSkus(ms: MasterState, r: BasePointsRow): string[] {
  if (r.level === "sku") return [r.refId];
  return ms.skus.filter((k) => { const c = skuCategory(ms, k.id); return r.level === "category" ? c.categoryId === r.refId : c.subCategoryId === r.refId; }).map((k) => k.id);
}
const rowBranches = (r: BasePointsRow) => (r.branchCodes === "all" ? ALL_BRANCHES.map((b) => b.code) : r.branchCodes);

/* ======================= Text helpers ======================= */

export function rewardText(r: RewardDef, s?: SchemeState) {
  if (r.kind === "business_formula") {
    const f = s ? formulaById(s, r.formulaId) : undefined;
    return `Business formula ${r.formulaId ?? "(none selected)"}${f ? ` · ${f.status === "confirmed" ? `v${f.version}` : "pending confirmation"}` : ""}`;
  }
  if (r.value == null) return "Not configured";
  return r.kind === "fixed_points" ? `${r.value.toLocaleString("en-IN")} points (fixed)` : `${r.value.toLocaleString("en-IN")} points per unit`;
}
export function productScopeText(ms: MasterState, sc: ProductScope) {
  if (sc.allProducts) return "All products";
  const parts = [
    ...sc.categoryIds.map((id) => `${categoryById(ms, id)?.name ?? id} (category)`),
    ...sc.subCategoryIds.map((id) => `${subById(ms, id)?.name ?? id} (sub-category)`),
    ...sc.skuIds.map((id) => skuById(ms, id)?.code ?? id),
  ];
  return parts.length ? parts.join(", ") : "None selected";
}
export function branchScopeText(sc: BranchScope) {
  if (sc.allBranches) return "All branches";
  const parts = [...sc.stateCodes.map((c) => GEOGRAPHY.find((g) => g.code === c)?.name ?? c), ...sc.districtCodes, ...sc.branchCodes.map((c) => findBranch(c)?.branch.name ?? c)];
  return parts.length ? parts.join(", ") : "None selected";
}
export function refLabel(ms: MasterState, r: Pick<BasePointsRow, "level" | "refId">) {
  return r.level === "category" ? categoryById(ms, r.refId)?.name ?? r.refId : r.level === "sub_category" ? subById(ms, r.refId)?.name ?? r.refId : skuById(ms, r.refId)?.code ?? r.refId;
}
export function targetingText(c: TargetingCondition) {
  const d = TARGET_DIMENSIONS[c.dimension];
  const vals = c.values.length ? c.values.join(", ") : "";
  const x = c.days == null ? "X (not set)" : `${c.days}`;
  if (c.dimension === "inactive_scan" || c.dimension === "inactive_app") return `${d.label.replace("X", x)}`;
  if (c.dimension === "business_decline") return `Business fallen by ${c.pct == null ? "Y (not set)" : c.pct}% over ${x} days`;
  return `${d.label} ${c.operator === "not_in" ? "not in" : c.operator === "between" ? "between" : "in"} ${vals || "(no values)"}`;
}

/* ======================= Business confirmation (blockers) ======================= */

export interface Blocker {
  ref: string;
  message: string;
}

/** Constructs that cannot be activated until V-Guard confirms the rule (SOW 6.7 open points). */
export function businessBlockers(s: SchemeState, c: SchemeConfig): Blocker[] {
  const out: Blocker[] = [];
  const rewardUsable = (r: RewardDef, where: string) => {
    if (r.kind === "business_formula" && !formulaUsable(s, r.formulaId)) {
      const f = formulaById(s, r.formulaId);
      out.push({ ref: f?.decisionRef ?? "FORMULA", message: `${where}: business formula ${r.formulaId ?? "(not selected)"} is not confirmed` });
    }
  };
  if (c.basic.levelUsedInCalculation && !decisionConfirmed(s, "OP-SB-LVL")) out.push({ ref: "OP-SB-LVL", message: `Scheme Level ${c.basic.level ?? ""} is marked as used in a calculation, but Level 0/1 semantics are not confirmed` });
  if (c.rider.enabled && !decisionConfirmed(s, "OP-SB-RIDER")) out.push({ ref: "OP-SB-RIDER", message: "Rider Points: activation logic and formula are not confirmed" });
  if (c.growth.enabled && !decisionConfirmed(s, "OP-01")) out.push({ ref: "OP-01", message: "Growth-based: calculation basis, reward mechanics and programme applicability are not confirmed" });
  if (c.milestone.enabled && c.milestone.contribution.includes("rider") && !decisionConfirmed(s, "OP-SB-RIDER")) out.push({ ref: "OP-SB-RIDER", message: "Milestone counts Rider contribution, which depends on the unconfirmed Rider rule" });
  if (c.combined.enabled && c.combined.components.includes("rider") && !decisionConfirmed(s, "OP-SB-RIDER")) out.push({ ref: "OP-SB-RIDER", message: "Combined rule includes Rider Points" });
  if (c.crossSell.enabled) rewardUsable(c.crossSell.reward, "Cross-sell bonus");
  if (c.quantity.enabled) rewardUsable(c.quantity.reward, "Quantity reward");
  if (c.milestone.enabled) c.milestone.levels.forEach((l) => rewardUsable(l.reward, `Milestone ${l.name}`));
  if (c.slab.enabled) c.slab.slabs.forEach((x) => rewardUsable(x.reward, `Slab ${x.name}`));
  // Deduplicate by message
  return out.filter((b, i) => out.findIndex((x) => x.message === b.message) === i);
}

/* ======================= Validation ======================= */

export interface SchemeValidation {
  errors: string[];
  warnings: string[];
  blockers: Blocker[];
  info: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const missingReward = (r: RewardDef) => (r.kind === "business_formula" ? !r.formulaId : r.value == null || !(r.value > 0));

/** Base-points rows that overlap: same SKU, branch and programme configured more than once. */
export function baseOverlaps(ms: MasterState, rows: BasePointsRow[]) {
  const seen = new Map<string, BasePointsRow>();
  const out: { a: BasePointsRow; b: BasePointsRow; sku: string; branch: string; sameLevel: boolean }[] = [];
  for (const r of rows) {
    for (const sku of rowSkus(ms, r)) {
      for (const br of rowBranches(r)) {
        const k = `${sku}|${br}|${r.programme}`;
        const prev = seen.get(k);
        if (prev && prev.id !== r.id && !out.some((o) => (o.a.id === prev.id && o.b.id === r.id))) out.push({ a: prev, b: r, sku, branch: br, sameLevel: prev.level === r.level });
        else if (!prev) seen.set(k, r);
      }
    }
  }
  return out;
}

export function validateConfig(s: SchemeState, ms: MasterState, schemeId: string | null, c: SchemeConfig, opts: { today: string; members?: MemberState } ): SchemeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const b = c.basic;
  if (!b.name.trim()) errors.push("Scheme name is mandatory");
  if (b.code && s.schemes.some((x) => x.id !== schemeId && x.versions.some((v) => v.config.basic.code.toLowerCase() === b.code.trim().toLowerCase()))) errors.push(`Scheme code ${b.code} is already used by another scheme`);
  if (!b.programmes.length) errors.push("Select at least one programme");
  if (!b.level) warnings.push("Scheme Level not selected (Level 0/1 meaning is pending OP-SB-LVL; it has no effect on calculation)");
  else info.push(`Level ${b.level === "L0" ? "0" : "1"} recorded. Its business meaning is pending OP-SB-LVL and it does not change any calculation`);
  // Duration
  const d = c.duration;
  if (!DATE.test(d.start) || !DATE.test(d.end)) errors.push("Start and end dates are mandatory");
  else if (d.end < d.start) errors.push("End date is before the start date");
  else if (d.end < opts.today && !c.backdated.enabled) warnings.push("The scheme ends in the past");
  // Products & branches
  if (productsEmpty(c.products)) errors.push("Product applicability is empty: select categories, sub-categories, SKUs or All");
  const inactiveCats = c.products.categoryIds.filter((id) => categoryById(ms, id)?.status !== "active");
  const inactiveSubs = c.products.subCategoryIds.filter((id) => subById(ms, id)?.status !== "active");
  const inactiveSkus = c.products.skuIds.filter((id) => skuById(ms, id)?.status !== "active");
  if (inactiveCats.length || inactiveSubs.length || inactiveSkus.length) errors.push(`Inactive or unknown master records selected: ${[...inactiveCats, ...inactiveSubs, ...inactiveSkus.map((x) => skuById(ms, x)?.code ?? x)].join(", ")}`);
  const scopeSkus = skusInScope(ms, c.products);
  const prodSkus = [...scopeSkus].filter((k) => skuById(ms, k)?.status === "active");
  const progMismatch = b.programmes.filter((p) => !prodSkus.some((k) => skuById(ms, k)?.programmes.includes(p)));
  if (prodSkus.length && progMismatch.length) errors.push(`No selected SKU is eligible for programme ${progMismatch.join(", ")} in the Product & SKU master`);
  if (scopeEmpty(c.eligibility.branchScope)) errors.push("Branch applicability is empty: select branches, districts, states or All");
  const inactiveBranches = [...branchesInScope(c.eligibility.branchScope)].filter((code) => ms.hierarchy.find((h) => h.code === code)?.status === "inactive");
  if (inactiveBranches.length) warnings.push(`${inactiveBranches.length} inactive branch(es) inside the scope are ignored: ${inactiveBranches.join(", ")}`);
  // Base points
  if (c.base.enabled) {
    if (!c.base.rows.length) errors.push("Base Points is enabled but the matrix has no rows");
    c.base.rows.forEach((r) => {
      if (r.points == null || !(r.points > 0)) errors.push(`Base Points row ${refLabel(ms, r)} · ${r.programme}: point value is not configured`);
      if (!b.programmes.includes(r.programme)) errors.push(`Base Points row ${refLabel(ms, r)} uses programme ${r.programme}, which the scheme does not include`);
      const skus = rowSkus(ms, r);
      if (!skus.length) errors.push(`Base Points row ${refLabel(ms, r)} resolves to no SKU`);
      if (skus.some((k) => !scopeSkus.has(k))) warnings.push(`Base Points row ${refLabel(ms, r)} covers SKUs outside the scheme's product applicability; those SKUs are ignored`);
      if (r.level === "sku" && skuById(ms, r.refId)?.status !== "active") errors.push(`Base Points row uses inactive SKU ${refLabel(ms, r)}`);
    });
    const ov = baseOverlaps(ms, c.base.rows);
    const same = ov.filter((o) => o.sameLevel);
    const cross = ov.filter((o) => !o.sameLevel);
    if (same.length) errors.push(`Duplicate Base Points configuration: ${same.length} SKU × branch combination(s) are configured twice at the same level (first: ${skuById(ms, same[0].sku)?.code} at ${same[0].branch})`);
    if (cross.length) errors.push(`Overlapping Base Points at different hierarchy levels for ${cross.length} SKU × branch combination(s) (first: ${skuById(ms, cross[0].sku)?.code}, ${cross[0].a.level} vs ${cross[0].b.level}). Precedence between levels is not defined (SCH-Q1): keep one level per SKU and branch`);
    if (!c.base.qualifyingCriteria.trim()) warnings.push("Base Points qualifying criteria are not described");
  }
  // Rider
  if (c.rider.enabled) {
    if (!c.base.enabled) errors.push("Rider Points depend on a Base Points achievement: enable Base Points");
    if (!c.rider.baseCondition || c.rider.baseThreshold == null) errors.push("Rider Points: the associated Base Points condition and threshold are not configured");
    if (!c.rider.activationCondition.trim()) errors.push("Rider Points: activation condition is not described");
    if (missingReward(c.rider.reward)) errors.push("Rider Points: reward value is not configured (no default is applied)");
  }
  // Cross-sell
  if (c.crossSell.enabled) {
    if (c.crossSell.categories.length < 2) errors.push("Cross-selling needs at least two participating categories");
    c.crossSell.categories.forEach((x) => { if (x.minimum == null || !(x.minimum > 0)) errors.push(`Cross-selling: minimum for ${categoryById(ms, x.categoryId)?.name ?? x.categoryId} is not configured`); });
    if (c.crossSell.requiredCategoryCount == null || c.crossSell.requiredCategoryCount < 2) errors.push("Cross-selling: number of categories that must qualify is not configured (at least 2)");
    else if (c.crossSell.requiredCategoryCount > c.crossSell.categories.length) errors.push("Cross-selling: required category count exceeds the participating categories");
    if (missingReward(c.crossSell.reward)) errors.push("Cross-selling: bonus is not configured");
  }
  // Quantity
  if (c.quantity.enabled) {
    if (c.quantity.threshold == null || !(c.quantity.threshold > 0)) errors.push("Quantity-based: qualifying threshold is not configured");
    if (c.quantity.target != null && c.quantity.threshold != null && c.quantity.target < c.quantity.threshold) errors.push("Quantity-based: target is below the qualifying threshold");
    if (c.quantity.useSlabs && !c.slab.enabled) errors.push("Quantity-based uses slabs, but the Slab component is not enabled");
    if (DATE.test(d.start) && DATE.test(d.end) && !quantityAligned(c) && (c.quantity.useSlabs || (c.combined.enabled && c.combined.components.includes("quantity")))) errors.push("Quantity period must match the evaluation windows (Duration & evaluation) when quantity uses slabs or is part of a combined rule");
    else if (DATE.test(d.start) && DATE.test(d.end) && !quantityAligned(c)) info.push(`Quantity is evaluated in its own ${c.quantity.period.replace(/_/g, " ")} windows (${quantityWindows(c).length}), separately from the scheme's evaluation windows`);
    if (!c.quantity.useSlabs && missingReward(c.quantity.reward)) errors.push("Quantity-based: reward is not configured");
  }
  // Milestone
  if (c.milestone.enabled) {
    if (!c.milestone.levels.length) errors.push("Milestone: add at least one level");
    const ths = c.milestone.levels.map((l) => l.threshold);
    if (ths.some((t) => t == null || !(t > 0))) errors.push("Milestone: every level needs a threshold");
    else if (ths.some((t, i) => i > 0 && t! <= ths[i - 1]!)) errors.push("Milestone: level thresholds must increase from one level to the next");
    c.milestone.levels.forEach((l) => { if (missingReward(l.reward)) errors.push(`Milestone ${l.name || "level"}: reward is not configured`); });
    if (c.milestone.contribution.includes("cross_sell") && !c.crossSell.enabled) errors.push("Milestone counts Cross-sell contribution, but Cross-selling is not enabled");
    if (c.milestone.contribution.includes("rider") && !c.rider.enabled) errors.push("Milestone counts Rider contribution, but Rider Points is not enabled");
    if (!c.base.enabled) errors.push("Milestone contribution always includes Base Points: enable Base Points");
  }
  // Slabs
  if (c.slab.enabled) {
    const sl = c.slab.slabs;
    if (!sl.length) errors.push("Slab: add at least one slab");
    sl.forEach((x) => {
      if (x.min == null) errors.push(`Slab ${x.name || x.id}: minimum threshold is not configured`);
      if (x.max != null && x.min != null && x.max <= x.min) errors.push(`Slab ${x.name || x.id}: maximum must be above minimum`);
      if (missingReward(x.reward)) errors.push(`Slab ${x.name || x.id}: reward is not configured`);
    });
    const sorted = [...sl].filter((x) => x.min != null).sort((a, z) => a.min! - z.min!);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (prev.max == null || prev.max >= sorted[i].min!) {
        if (prev.priority === sorted[i].priority) errors.push(`Slabs ${prev.name} and ${sorted[i].name} overlap and have the same priority`);
        else warnings.push(`Slabs ${prev.name} and ${sorted[i].name} overlap; priority decides which applies`);
      }
    }
    if (new Set(sl.map((x) => x.priority)).size !== sl.length) warnings.push("Two or more slabs share a priority");
    if (new Set(sl.map((x) => x.achievement)).size > 1) errors.push("All slabs must use the same achievement basis (quantity, scan count or points): one achievement is measured per window");
    if (c.slab.reversal.eligible == null) warnings.push("Slab reversal / downgrade handling is not configured");
    if (c.slab.reversal.eligible && !formulaUsable(s, c.slab.reversal.adjustmentFormulaId)) warnings.push("Slab downgrade adjustment formula is not confirmed (SCH-Q7): reductions create linked reversal records marked pending, never a calculated correction");
  }
  // Growth
  if (c.growth.enabled) {
    if (!c.growth.baselineFrom || !c.growth.baselineTo || !c.growth.comparisonFrom || !c.growth.comparisonTo) errors.push("Growth-based: baseline and comparison periods are mandatory");
    else if (c.growth.baselineTo >= c.growth.comparisonFrom) errors.push("Growth-based: the baseline period must end before the comparison period starts");
    if (c.growth.requiredGrowthPct == null) errors.push("Growth-based: required growth percentage is not configured");
    if (!c.growth.basis) errors.push("Growth-based: calculation basis is not selected");
    if (!c.growth.programmeApplicability.length) errors.push("Growth-based: programme applicability is not selected (no programme is assumed)");
    if (c.growth.riderActivation && !c.rider.enabled) errors.push("Growth-based activates a Rider, but Rider Points is not enabled");
  }
  // Combined
  if (c.combined.enabled) {
    const comps = c.combined.components;
    if (comps.length < 2) errors.push("Combined rules need at least two components");
    const enabled: Record<ComponentKey, boolean> = { base: c.base.enabled, rider: c.rider.enabled, crossSell: c.crossSell.enabled, quantity: c.quantity.enabled, category: !productsEmpty(c.products), milestone: c.milestone.enabled, slab: c.slab.enabled, growth: c.growth.enabled };
    comps.forEach((k) => { if (!enabled[k]) errors.push(`Combined rules include ${COMPONENT_LABEL[k]}, which is not configured`); });
    if (comps.includes("rider") && !comps.includes("base")) errors.push("Invalid combination: Rider Points must be combined with Base Points");
    if (comps.includes("slab") && !comps.includes("quantity") && !comps.includes("base")) errors.push("Invalid combination: Slabs need an achievement source (Quantity or Base Points)");
    c.combined.dependencies.forEach((dep) => { if (!comps.includes(dep.dependsOn)) errors.push(`Combined rules: ${COMPONENT_LABEL[dep.component]} depends on ${COMPONENT_LABEL[dep.dependsOn]}, which is not part of the combination`); });
    info.push("Execution precedence between combined components is not assumed (SCH-Q4); the engine evaluates the configured relationship only");
  }
  const anyEarning = c.base.enabled || c.rider.enabled || c.crossSell.enabled || c.quantity.enabled || c.milestone.enabled || c.slab.enabled || c.growth.enabled;
  if (!anyEarning) errors.push("No earning component is configured");
  // Eligibility & targeting
  if (c.eligibility.groups.length || c.eligibility.segments.length || c.eligibility.elite !== "any") warnings.push("Group, segment and Elite eligibility come from the SFDC retailer master, which is not connected: the population cannot be verified and the engine credits no one until that source exists");
  if (c.eligibility.elite !== "any" && !c.basic.programmes.includes("Retailer")) errors.push("Elite classification applies to Retailer: include the Retailer programme or set Elite to Any");
  if (opts.members) {
    const unknown = c.eligibility.selectedMemberIds.filter((id) => !opts.members!.members.some((m) => m.id === id));
    if (unknown.length) errors.push(`Unknown member IDs: ${unknown.join(", ")}`);
    const wrongProg = c.eligibility.selectedMemberIds.map((id) => opts.members!.members.find((m) => m.id === id)).filter((m): m is Member => !!m && !c.basic.programmes.includes(m.programme));
    if (wrongProg.length) errors.push(`Selected members outside the scheme's programmes: ${wrongProg.map((m) => `${m.id} (${m.programme})`).join(", ")}`);
  }
  c.targeting.forEach((t) => {
    const def = TARGET_DIMENSIONS[t.dimension];
    if (def.needsDays && (t.days == null || !(t.days > 0))) errors.push(`Targeting "${def.label}": X days is not configured (no default)`);
    if (def.needsPct && (t.pct == null || !(t.pct > 0))) errors.push(`Targeting "${def.label}": Y% is not configured (no default)`);
    if (!def.needsDays && !t.values.length) errors.push(`Targeting "${def.label}": no values selected`);
    if (!def.available) warnings.push(`Targeting "${def.label}" uses ${def.source}: the population cannot be counted until that source is connected`);
    if (t.dimension === "programme" && t.values.some((v) => !c.basic.programmes.includes(v))) errors.push("Targeting selects a programme the scheme does not include");
    if (t.dimension === "date_range" && t.values.some((v) => !/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(v) || v.split("..")[1] < v.split("..")[0])) errors.push("Targeting \"Applicable date\": enter ranges as YYYY-MM-DD..YYYY-MM-DD with the end on or after the start");
  });
  // Backdated
  if (c.backdated.enabled) {
    if (!DATE.test(c.backdated.announcementDate)) errors.push("Backdated calculation: announcement date is mandatory");
    else if (DATE.test(d.start) && c.backdated.announcementDate <= d.start) errors.push("Backdated calculation: the announcement date must be after the effective start date");
    if (!DATE.test(c.backdated.historicalFrom) || !DATE.test(c.backdated.historicalTo)) errors.push("Backdated calculation: eligible historical period is mandatory");
    else if (c.backdated.historicalFrom < d.start || c.backdated.historicalTo > d.end) errors.push("Backdated calculation: the historical period must sit inside the effective period");
    warnings.push("Backdated calculation creates exposure for past transactions. It runs only as a separate approved backend operation, never on approval of the scheme");
  }
  // Budget
  if (c.budget.amount == null || !(c.budget.amount > 0)) errors.push("Budget cap is mandatory (every scheme needs budget / exposure control)");
  if (!c.budget.autoStop) warnings.push("Auto-stop at budget cap is off: accruals beyond the cap would need manual intervention");
  // Settlement
  settlementConfigErrors(c.settlement).forEach((e) => errors.push(e));
  // Overlaps
  if (DATE.test(d.start) && DATE.test(d.end)) {
    const ov = overlappingSchemes(s, ms, schemeId, c);
    if (ov.length) warnings.push(`Overlaps with ${ov.length} scheme(s): ${ov.map((o) => `${o.name} (${o.relation})`).join("; ")}. Schemes are inclusive unless an exclusivity rule applies`);
  }
  if (c.budget.amount && c.budget.amount >= 5_000_000) warnings.push("Large budget: review the estimated population and exposure carefully");
  if (opts.members) {
    const pop = eligiblePopulation(opts.members, ms, c);
    if (pop.count != null && pop.count === 0) warnings.push("No member in the development member master matches the eligibility and targeting");
  }
  info.push("Projected liability: Pending business formula (OP-SB-LIAB). No estimate is shown and financial sign-off cannot be recorded");
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), blockers: businessBlockers(s, c), info };
}

export function settlementConfigErrors(sc: SettlementConfig): string[] {
  const e: string[] = [];
  if (!sc.tranches.length) return ["Settlement: configure at least the final settlement"];
  if (sc.tranches.some((t) => t.pct == null || !(t.pct > 0))) e.push("Settlement: every tranche needs an explicit release percentage");
  const total = sc.tranches.reduce((a, t) => a + (t.pct ?? 0), 0);
  if (Math.abs(total - 100) > 1e-9) e.push(`Settlement: release percentages add up to ${total}%, not 100%. Residual percentages are never rounded or discarded`);
  if (!sc.tranches.some((t) => t.trigger === "final_settlement")) e.push("Settlement: a final-settlement tranche is required");
  if (sc.mode === "at_closure" && sc.tranches.length > 1) e.push("Settlement: 'At closure' has a single final tranche; use partial release for more");
  if (sc.mode === "partial_release" && sc.tranches.length < 2) e.push("Settlement: partial release needs at least one tranche before the final settlement");
  return e;
}

/* ======================= Overlap & exclusivity ======================= */

const periodsOverlap = (a: DurationConfig, b: DurationConfig) => a.start <= b.end && b.start <= a.end;
const LIVEISH = ["pending_approval", "approved", "scheduled", "active", "budget_exhausted"];

export function overlappingSchemes(s: SchemeState, ms: MasterState, schemeId: string | null, c: SchemeConfig) {
  const mySkus = skusInScope(ms, c.products);
  const myBranches = branchesInScope(c.eligibility.branchScope);
  return s.schemes
    .filter((x) => x.id !== schemeId && LIVEISH.includes(x.status))
    .map((x) => ({ x, oc: displayVersion(x).config }))
    .filter(({ oc }) => periodsOverlap(oc.duration, c.duration) && oc.basic.programmes.some((p) => c.basic.programmes.includes(p)) && [...skusInScope(ms, oc.products)].some((k) => mySkus.has(k)) && [...branchesInScope(oc.eligibility.branchScope)].some((b) => myBranches.has(b)))
    .map(({ x, oc }) => {
      const ex = schemeId ? s.exclusivity.find((r) => r.status === "active" && ((r.schemeA === schemeId && r.schemeB === x.id) || (r.schemeB === schemeId && r.schemeA === x.id))) : undefined;
      return { id: x.id, name: oc.basic.name, status: x.status, relation: ex ? `exclusive (${ex.id})` : "inclusive", exclusivityId: ex?.id ?? null };
    });
}

/**
 * Unresolved exclusivity: A⊥B and B⊥C active while A and C are inclusive. A member qualifying for all
 * three gets a different outcome depending on which rule is applied first, and no precedence is defined.
 */
export function exclusivityConflicts(s: SchemeState) {
  const active = s.exclusivity.filter((r) => r.status === "active");
  const ex = (a: string, b: string) => active.some((r) => (r.schemeA === a && r.schemeB === b) || (r.schemeA === b && r.schemeB === a));
  const ids = Array.from(new Set(active.flatMap((r) => [r.schemeA, r.schemeB])));
  const out: { schemes: [string, string, string]; message: string }[] = [];
  for (const b of ids) {
    const partners = ids.filter((x) => x !== b && ex(x, b));
    for (let i = 0; i < partners.length; i++) for (let j = i + 1; j < partners.length; j++) {
      const [a, c] = [partners[i], partners[j]];
      if (!ex(a, c)) out.push({ schemes: [a, b, c], message: `${a} and ${c} are both exclusive with ${b} but inclusive with each other. Which scheme a member keeps depends on precedence, which is not defined (SCH-Q10). Needs authorised review` });
    }
  }
  return out;
}

/* ======================= Eligible population ======================= */

/** Counts members in the development member master. Dimensions without a connected source are listed, not guessed. */
export function eligiblePopulation(mem: MemberState, ms: MasterState, c: SchemeConfig) {
  const branches = branchesInScope(c.eligibility.branchScope);
  const notComputable = Array.from(new Set([
    ...c.targeting.filter((t) => !TARGET_DIMENSIONS[t.dimension].available).map((t) => TARGET_DIMENSIONS[t.dimension].label),
    ...(c.eligibility.groups.length ? ["Group"] : []),
    ...(c.eligibility.segments.length ? ["Segment"] : []),
    ...(c.eligibility.elite !== "any" ? ["Elite classification"] : []),
  ]));
  const match = (m: Member) => {
    if (!c.basic.programmes.includes(m.programme)) return false;
    if (c.eligibility.selectedMemberIds.length && !c.eligibility.selectedMemberIds.includes(m.id)) return false;
    if (!branches.has(m.branchCode)) return false;
    if (ms.hierarchy.find((h) => h.code === m.branchCode)?.status === "inactive") return false;
    if (["rejected", "pending", "invited"].includes(m.status)) return false;
    const geo = findBranch(m.branchCode);
    return c.targeting.every((t) => {
      if (!TARGET_DIMENSIONS[t.dimension].available) return true;
      const inV = (v: string | undefined) => (t.operator === "not_in" ? !t.values.includes(v ?? "") : t.values.includes(v ?? ""));
      switch (t.dimension) {
        case "programme": return inV(m.programme);
        case "role": return inV(m.memberType);
        case "state": return inV(geo?.state.code);
        case "district": return inV(geo?.district.code);
        case "branch": return inV(m.branchCode);
        case "pincode": return inV(m.addresses.working?.pincode ?? m.addresses.home?.pincode);
        case "member_ids": return inV(m.id);
        default: return true;
      }
    });
  };
  const hits = mem.members.filter(match);
  const byProgramme = c.basic.programmes.map((p) => ({ programme: p, count: hits.filter((m) => m.programme === p).length }));
  return { count: notComputable.length ? null : hits.length, lowerBound: hits.length, notComputable, byProgramme, members: hits, source: `Development member master (${mem.members.length} records)` };
}

/* ======================= Deterministic evaluation of configured rules ======================= */

export type RewardResult = { ok: true; points: number } | { ok: false; reason: string };

/** Points for a reward definition. Only explicit values are computed; formulas need a confirmed registry entry. */
export function rewardPoints(s: SchemeState, r: RewardDef, units: number): RewardResult {
  if (r.kind === "business_formula") return formulaUsable(s, r.formulaId) ? { ok: false, reason: `Formula ${r.formulaId} is confirmed but runs only in the backend engine` } : { ok: false, reason: `Formula ${r.formulaId ?? "(none)"} is pending business confirmation` };
  if (r.value == null) return { ok: false, reason: "Reward value not configured" };
  return { ok: true, points: r.kind === "fixed_points" ? r.value : r.value * units };
}

/** Base Points for one scanned transaction line: the single row covering SKU, branch and programme. */
export function basePointsFor(ms: MasterState, c: SchemeConfig, skuId: string, branchCode: string, programme: string): { row: BasePointsRow; pointsPerUnit: number } | { error: string } | null {
  if (!c.base.enabled) return null;
  const rows = c.base.rows.filter((r) => r.programme === programme && rowSkus(ms, r).includes(skuId) && rowBranches(r).includes(branchCode));
  if (!rows.length) return null;
  if (rows.length > 1) return { error: `Overlapping Base Points rows ${rows.map((r) => r.id).join(", ")}: precedence not defined (SCH-Q1)` };
  if (rows[0].points == null) return { error: "Point value not configured" };
  return { row: rows[0], pointsPerUnit: rows[0].points };
}

export const quantityQualifies = (q: SchemeConfig["quantity"], achieved: number) => q.enabled && q.threshold != null && achieved >= q.threshold;

/** Slab for an achievement: all slabs whose range contains it, then the lowest priority number wins. */
export function selectSlab(slabs: Slab[], achieved: number): Slab | null {
  const hits = slabs.filter((x) => x.min != null && achieved >= x.min && (x.max == null || achieved <= x.max));
  if (!hits.length) return null;
  return [...hits].sort((a, b) => a.priority - b.priority || (b.min ?? 0) - (a.min ?? 0))[0];
}

export function milestonesAchieved(m: SchemeConfig["milestone"], achieved: number) {
  return m.levels.filter((l) => l.threshold != null && achieved >= l.threshold);
}

/** Contribution counted toward milestones. Rider contribution is blocked while OP-SB-RIDER is open. */
export function milestoneMeasure(s: SchemeState, m: SchemeConfig["milestone"], parts: { base: number; rider: number; crossSell: number }): RewardResult {
  if (m.contribution.includes("rider") && !decisionConfirmed(s, "OP-SB-RIDER")) return { ok: false, reason: "Rider contribution to milestones is pending OP-SB-RIDER" };
  let v = parts.base;
  if (m.contribution.includes("rider")) v += parts.rider;
  if (m.contribution.includes("cross_sell")) v += parts.crossSell;
  return { ok: true, points: v };
}

export function crossSellQualifies(cs: SchemeConfig["crossSell"], byCategory: Record<string, number>) {
  const met = cs.categories.filter((x) => x.minimum != null && (byCategory[x.categoryId] ?? 0) >= x.minimum).map((x) => x.categoryId);
  return { qualified: cs.enabled && cs.requiredCategoryCount != null && met.length >= cs.requiredCategoryCount, met };
}

export function combinedQualifies(cb: SchemeConfig["combined"], results: Partial<Record<ComponentKey, boolean | "blocked">>): boolean | "blocked" {
  const vals = cb.components.map((k) => results[k] ?? false);
  if (vals.includes("blocked")) return "blocked";
  return cb.relation === "all_of" ? vals.every(Boolean) : vals.some(Boolean);
}

/** Evaluation windows. Periodic: one window per duration period inside the scheme; cumulative: one window. */
export function evaluationWindows(d: DurationConfig, upTo?: string): { from: string; to: string }[] {
  const end = upTo && upTo < d.end ? upTo : d.end;
  if (d.evaluation === "cumulative" || d.type === "custom") return [{ from: d.start, to: end }];
  const out: { from: string; to: string }[] = [];
  const startOf = (iso: string) => {
    const [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
    if (d.type === "monthly") return `${y}-${String(m).padStart(2, "0")}-01`;
    if (d.type === "financial_year") return fyRange(fyOf(iso)).from;
    if (d.type === "yearly") return `${y}-01-01`;
    const fyStart = Number(fyRange(fyOf(iso)).from.slice(0, 4));
    const monthsIn = (m - 4 + 12) % 12;
    const size = d.type === "quarterly" ? 3 : 6;
    const startMonth = 4 + Math.floor(monthsIn / size) * size;
    const yy = startMonth > 12 ? fyStart + 1 : fyStart;
    return `${yy}-${String(((startMonth - 1) % 12) + 1).padStart(2, "0")}-01`;
  };
  const addMonthsIso = (iso: string, n: number) => {
    const dt = new Date(`${iso}T00:00:00Z`);
    dt.setUTCMonth(dt.getUTCMonth() + n);
    return dt.toISOString().slice(0, 10);
  };
  const len = d.type === "monthly" ? 1 : d.type === "quarterly" ? 3 : d.type === "half_yearly" ? 6 : 12;
  let cur = startOf(d.start);
  while (cur <= end) {
    const next = addMonthsIso(cur, len);
    const last = addMonthsIso(next, 0);
    const to = new Date(`${last}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() - 1);
    const toIso = to.toISOString().slice(0, 10);
    out.push({ from: cur < d.start ? d.start : cur, to: toIso > end ? end : toIso });
    cur = next;
  }
  return out;
}

/** Windows in which the quantity component is decided. "Scheme period" / "custom" = the whole scheme. */
export function quantityWindows(c: SchemeConfig): { from: string; to: string }[] {
  const p = c.quantity.period;
  if (p === "scheme_period" || p === "custom") return [{ from: c.duration.start, to: c.duration.end }];
  return evaluationWindows({ type: p, start: c.duration.start, end: c.duration.end, evaluation: "periodic" });
}
/** True when quantity is decided in exactly the scheme's evaluation windows. */
export const quantityAligned = (c: SchemeConfig) => JSON.stringify(quantityWindows(c)) === JSON.stringify(evaluationWindows(c.duration));

/** Last calendar day of the month of a date. */
export function lastDayOfMonth(iso: string) {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Idempotency key for a reward calculation (Section 22). */
export const idempotencyKey = (p: { sourceRef: string; memberId: string; schemeId: string; version: number; component: ComponentKey; calcRef: string }) => `${p.sourceRef}|${p.memberId}|${p.schemeId}|v${p.version}|${p.component}|${p.calcRef}`;

/* ======================= Exposure & liability ======================= */

const POSTED = (a: RewardAccrual) => a.result === "credited" || a.result === "accrued";

export function exposureOf(s: SchemeState, sc: Scheme, today: string) {
  const acc = s.accruals.filter((a) => a.schemeId === sc.id);
  const posted = acc.filter(POSTED);
  const reversals = acc.filter((a) => a.result === "reversed");
  const sum = (xs: RewardAccrual[]) => xs.reduce((n, a) => n + a.points, 0);
  const cfg = displayVersion(sc).config;
  const budget = cfg.budget.amount ?? 0;
  const base = sum(posted.filter((a) => a.bucket === "redeemable"));
  const schemePts = sum(posted.filter((a) => a.bucket === "unsettled"));
  const reversed = sum(reversals);
  const released = s.releases.filter((r) => r.schemeId === sc.id).reduce((n, r) => n + r.releasedPoints, 0);
  const consumed = base + schemePts - reversed;
  const start = cfg.duration.start;
  const days = Math.max(1, Math.round((new Date(`${(today < cfg.duration.end ? today : cfg.duration.end)}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1);
  const by = <K extends keyof RewardAccrual>(k: K) => {
    const m = new Map<string, number>();
    posted.forEach((a) => m.set(String(a[k]), (m.get(String(a[k])) ?? 0) + a.points));
    return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  };
  const extMembers = new Set(s.extensions.filter((e) => e.schemeId === sc.id && e.status === "active").flatMap((e) => e.memberIds));
  const extBranches = new Set(s.extensions.filter((e) => e.schemeId === sc.id && e.status === "active").flatMap((e) => e.branchCodes));
  return {
    budget,
    consumed,
    remaining: budget - consumed,
    utilisation: budget ? consumed / budget : 0,
    baseCredited: base,
    schemeAccrued: schemePts,
    reversed,
    released,
    unsettled: schemePts - released - sum(reversals.filter((a) => a.bucket === "unsettled")),
    burnRatePerDay: today >= start ? consumed / days : 0,
    exhausted: !!budget && consumed >= budget,
    nearExhaustion: !!budget && consumed / budget >= (cfg.budget.alertPct ?? 80) / 100,
    backdatedExposure: sum(posted.filter((a) => a.origin === "backdated")),
    extensionExposure: sum(posted.filter((a) => extMembers.has(a.memberId) || extBranches.has(a.branchCode))),
    byProgramme: by("programme"),
    byBranch: by("branchCode"),
    byComponent: by("component"),
    duplicatesRefused: acc.filter((a) => a.result === "rejected_duplicate").length,
    budgetRefusals: acc.filter((a) => a.result === "rejected_budget").length,
  };
}

/** OP-SB-LIAB: the service interface exists; the formula does not. */
export function projectedLiability(s: SchemeState, sc: Scheme, version: number, eligibleCount: number | null, now: string) {
  const f = formulaById(s, "FRM-LIAB");
  const usable = formulaUsable(s, "FRM-LIAB");
  const cfg = versionOf(sc, version)?.config ?? displayVersion(sc).config;
  return {
    status: usable ? ("formula_confirmed_backend_only" as const) : ("pending_business_formula" as const),
    formulaId: "FRM-LIAB",
    formulaVersion: f?.version ?? null,
    calculatedAt: now,
    dataSource: "Not calculated: no approved formula (OP-SB-LIAB)",
    inputs: [
      { label: "Scheme version", value: `v${version}` },
      { label: "Programmes", value: cfg.basic.programmes.join(", ") },
      { label: "Eligibility count (development member master)", value: eligibleCount == null ? "Not computable: some targeting sources are not connected" : String(eligibleCount) },
      { label: "Configured budget", value: cfg.budget.amount == null ? "Not set" : `${cfg.budget.amount.toLocaleString("en-IN")} points` },
      { label: "Earning components", value: activeComponents(cfg).map((k) => COMPONENT_LABEL[k]).join(", ") || "None" },
    ],
    assumptions: [] as string[],
    output: null as number | null,
    validation: usable ? "Formula confirmed; calculation runs in the backend service" : "Pending business formula. Do not treat any figure as a projected liability",
  };
}

export function activeComponents(c: SchemeConfig): ComponentKey[] {
  const out: ComponentKey[] = [];
  if (c.base.enabled) out.push("base");
  if (c.rider.enabled) out.push("rider");
  if (c.crossSell.enabled) out.push("crossSell");
  if (c.quantity.enabled) out.push("quantity");
  if (!productsEmpty(c.products) && !c.products.allProducts) out.push("category");
  if (c.milestone.enabled) out.push("milestone");
  if (c.slab.enabled) out.push("slab");
  if (c.growth.enabled) out.push("growth");
  return out;
}

/* ======================= Settlement ======================= */

export function settlementPreview(s: SchemeState, sc: Scheme, trancheId: string, from: string, to: string, today: string) {
  const v = versionOf(sc, sc.activeVersion) ?? latestVersion(sc);
  const t = v.config.settlement.tranches.find((x) => x.id === trancheId);
  const pending = new Set(s.settlements.filter((r) => r.schemeId === sc.id && ["pending_approval", "partially_approved", "approved", "execution_failed"].includes(r.status)).flatMap((r) => r.accrualIds));
  const accs = s.accruals.filter((a) => a.schemeId === sc.id && a.bucket === "unsettled" && POSTED(a) && a.effectiveDate >= from && a.effectiveDate <= to && !pending.has(a.id));
  const reversedIds = new Set(s.accruals.filter((a) => a.result === "reversed" && a.reversalOf).map((a) => a.reversalOf));
  const open = accs.filter((a) => a.points - a.releasedPoints > 0 && !reversedIds.has(a.id));
  const unsettled = open.reduce((n, a) => n + (a.points - a.releasedPoints), 0);
  const priorReleased = s.settlements.filter((r) => r.schemeId === sc.id && r.status === "executed");
  // A partial tranche may bring each accrual up to the CUMULATIVE share of the partial tranches up to
  // and including it (e.g. 60% for the first of 60 / 40). Repeating a request never releases more than
  // that cap, so the held share stays held until the final tranche, which releases what remains.
  // Fractions are held and shown (rounding policy SCH-Q3), never discarded.
  const partials = v.config.settlement.tranches.filter((x) => x.trigger !== "final_settlement");
  const upTo = t ? partials.slice(0, partials.findIndex((x) => x.id === t.id) + 1) : [];
  const share = t?.trigger === "final_settlement" ? 100 : upTo.reduce((n, x) => n + (x.pct ?? 0), 0);
  const lines = open.map((a) => {
    if (share >= 100) return { id: a.id, release: a.points - a.releasedPoints, fraction: 0 };
    const exact = (a.points * share) / 100;
    const target = Math.floor(exact + 1e-9);
    return { id: a.id, release: Math.max(0, target - a.releasedPoints), fraction: a.releasedPoints >= target ? 0 : exact - target };
  });
  const releasePoints = lines.reduce((n, l) => n + l.release, 0);
  const residual = Math.round(lines.reduce((n, l) => n + l.fraction, 0) * 100) / 100;
  const pendingReturns = s.accruals.filter((a) => a.schemeId === sc.id && a.result === "reversal_pending");
  const closedish = ["closed", "completed", "deactivated", "budget_exhausted"].includes(sc.status);
  const monthEnded = DATE.test(to) && to < today && to === lastDayOfMonth(to);
  const checks = [
    { label: "Tranche configured on the scheme version", ok: !!t && t.pct != null, detail: t ? `${t.label}: ${t.pct}% · ${t.trigger.replace(/_/g, " ")}` : "Unknown tranche" },
    { label: "Closure / partial-release criteria", ok: !t ? false : t.trigger === "final_settlement" ? closedish : t.trigger === "month_end" ? monthEnded : sc.status === "active" || closedish, detail: !t ? "—" : t.trigger === "final_settlement" ? (closedish ? `Scheme is ${sc.status}` : "Final settlement needs the scheme closed, completed or stopped") : t.trigger === "month_end" ? (monthEnded ? "Earned range ends at a past month end" : "Earned range must end at a completed month end") : "Partial release during the scheme" },
    { label: "Reversal checks", ok: pendingReturns.length === 0, detail: pendingReturns.length ? `${pendingReturns.length} sales-return reversal(s) pending a confirmed formula (validation pending)` : "No pending reversal" },
    { label: "Qualification evaluation complete", ok: t?.trigger !== "final_settlement" || sc.status !== "active", detail: "Final settlement only after the scheme stops earning" },
    { label: "Unsettled points in range", ok: unsettled > 0, detail: `${unsettled.toLocaleString("en-IN")} unsettled points from ${open.length} accrual(s)` },
    { label: "Release available within the tranche cap", ok: releasePoints > 0, detail: share >= 100 ? "Final tranche releases everything still unsettled" : `Cumulative cap ${share}% of each accrual; ${releasePoints.toLocaleString("en-IN")} points not yet released under it` },
  ];
  return { tranche: t, accruals: open, lines, unsettled, releasePct: share, releasePoints, heldPoints: unsettled - releasePoints, residual, checks, ok: checks.every((c) => c.ok), priorReleases: priorReleased.length };
}

/* ======================= Campaigns, games, bonuses ======================= */

export function campaignStates(c: Pick<Campaign, "allStates" | "stateCodes" | "branchCodes" | "targeting">) {
  if (c.allStates) return GEOGRAPHY.map((g) => g.code);
  const fromBranches = c.branchCodes.map((b) => findBranch(b)?.state.code).filter(Boolean) as string[];
  const fromTargeting = c.targeting.filter((t) => t.dimension === "state" && t.operator !== "not_in").flatMap((t) => t.values);
  const fromDistrict = c.targeting.filter((t) => t.dimension === "district").flatMap((t) => t.values.map((d) => d.split("-")[0]));
  return Array.from(new Set([...c.stateCodes, ...fromBranches, ...fromTargeting, ...fromDistrict]));
}

export function validateCampaign(s: SchemeState, c: Campaign): SchemeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockers: Blocker[] = [];
  if (!c.name.trim()) errors.push("Campaign name is mandatory");
  if (!c.programmes.length) errors.push("Select at least one programme");
  if (!DATE.test(c.start) || !DATE.test(c.end) || c.end < c.start) errors.push("Valid start and end dates are mandatory");
  if (!c.allStates && !c.stateCodes.length && !c.branchCodes.length) errors.push("Select the applicable geography");
  if (c.budget == null || !(c.budget > 0)) errors.push("Budget is mandatory");
  if (c.type === "lucky_draw") {
    const bad = campaignStates(c).filter((x) => LUCKY_DRAW_EXCLUDED_STATES.includes(x));
    if (bad.length) errors.push(c.allStates ? "Lucky Draw cannot target Tamil Nadu (Lottery Act, SOW 6.5). 'All states' includes Tamil Nadu: select states explicitly" : "Lucky Draw cannot target Tamil Nadu (Lottery Act, SOW 6.5). Remove Tamil Nadu and its branches");
  }
  if (c.type === "display_contest" && c.programmes.some((p) => !["Retailer", "CS"].includes(p))) errors.push("Display Contest applies to Retailer and CS (SOW 6.5)");
  if (c.type === "foc") {
    if (!c.foc) errors.push("FOC / Buy-X-Get-Y configuration is missing");
    else {
      if (!c.foc.qualifyingSkuIds.length) errors.push("FOC: select the qualifying item");
      if (c.foc.variant !== "gift_entitlement" && !c.foc.rewardSkuId) errors.push("FOC: select the reward item");
      if (c.foc.variant === "same_sku" && c.foc.rewardSkuId && !c.foc.qualifyingSkuIds.includes(c.foc.rewardSkuId)) errors.push("FOC same-SKU: the reward item must be the qualifying SKU");
      if (c.foc.variant === "gift_entitlement" && !c.foc.giftName.trim()) errors.push("FOC: name the gift entitlement");
      if (c.foc.qualifyingQty == null || c.foc.rewardQty == null) blockers.push({ ref: "SCH-Q6", message: "Buy-X-Get-Y qualifying quantity / reward quantity not approved: the qualifying formula is pending" });
    }
  } else if (c.reward.kind === "business_formula" ? !formulaUsable(s, c.reward.formulaId) : c.reward.value == null) {
    if (c.type === "spin") blockers.push({ ref: "SCH-Q5", message: "Spin allocation (probabilities) is not approved" });
    else if (c.reward.kind === "business_formula") blockers.push({ ref: formulaById(s, c.reward.formulaId)?.decisionRef ?? "FORMULA", message: `Reward formula ${c.reward.formulaId} is pending` });
    else errors.push("Reward is not configured");
  }
  if (c.type === "referral_milestone" && !decisionConfirmed(s, "OP-REF1")) blockers.push({ ref: "OP-REF1", message: "Referral mechanics are pending confirmation" });
  if (c.type === "spin" && !blockers.length) blockers.push({ ref: "SCH-Q5", message: "Spin allocation (probabilities) is not approved" });
  c.targeting.forEach((t) => { if (!TARGET_DIMENSIONS[t.dimension].available) warnings.push(`Targeting "${TARGET_DIMENSIONS[t.dimension].label}" depends on a source that is not connected`); });
  void CAMPAIGN_TYPE;
  return { errors, warnings, blockers, info: [] };
}

export function validateGame(s: SchemeState, g: GameConfig): SchemeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockers: Blocker[] = [];
  if (!g.name.trim()) errors.push("Name is mandatory");
  if (!g.programmes.length) errors.push("Select at least one programme");
  if (!DATE.test(g.start) || !DATE.test(g.end) || g.end < g.start) errors.push("Valid effective dates are mandatory");
  if (g.kind === "scratch_card" || g.kind === "spin_wheel") {
    if (!g.options.length) errors.push("Add the reward options");
    if (g.options.some((o) => o.probabilityPct == null)) blockers.push({ ref: "SCH-Q5", message: "Variable reward allocation / probabilities are not approved: random distribution is not enabled" });
    else if (Math.abs(g.options.reduce((n, o) => n + (o.probabilityPct ?? 0), 0) - 100) > 1e-9) errors.push("Allocation percentages must add up to 100%");
    if (g.budget == null) errors.push("Budget is mandatory for variable rewards");
  }
  if (g.kind === "streak" && (g.settings.requiredDuration == null || g.settings.requiredDuration === "")) blockers.push({ ref: "SCH-Q11", message: "Streak duration (number of days) is not configured; no default is assumed" });
  if (g.kind === "leaderboard" && !g.settings.tieBreak) blockers.push({ ref: "SCH-Q8", message: "Ranking formula / tie-break rule is not defined by the business" });
  if (!g.scope.branchCodes.length && !g.scope.geoFencePincodes.length) warnings.push("No branch or geo-fence selected: applies to the programme's whole geography");
  void s;
  return { errors, warnings, blockers, info: [] };
}

export function validateBonus(s: SchemeState, b: Bonus): SchemeValidation {
  const errors: string[] = [];
  const blockers: Blocker[] = [];
  if (!b.name.trim()) errors.push("Name is mandatory");
  if (!b.programmes.length) errors.push("Select at least one programme");
  if (!DATE.test(b.start) || !DATE.test(b.end) || b.end < b.start) errors.push("Valid effective dates are mandatory");
  if (b.budget == null || !(b.budget > 0)) errors.push("Budget is mandatory");
  if (!decisionConfirmed(s, "OP-SB-BONUS")) blockers.push({ ref: "OP-SB-BONUS", message: `${b.type.replace("_", " ")} bonus trigger and eligibility are pending business confirmation` });
  if (!b.trigger) blockers.push({ ref: "OP-SB-BONUS", message: "Trigger not configured (no trigger is invented)" });
  return { errors, warnings: [], blockers: blockers.filter((x, i) => blockers.findIndex((y) => y.message === x.message) === i), info: [] };
}

/* ======================= Field comparison for approvals and audit ======================= */

type Flat = Record<string, { label: string; value: string; material: boolean; kind: FieldChange["kind"] }>;

export function flattenConfig(s: SchemeState, ms: MasterState, c: SchemeConfig): Flat {
  const f: Flat = {};
  const put = (key: string, label: string, value: string | number | null | undefined, material = false, kind: FieldChange["kind"] = "text") => { f[key] = { label, value: value == null || value === "" ? "—" : String(value), material, kind }; };
  const on = (x: boolean) => (x ? "Enabled" : "Off");
  put("name", "Scheme name", c.basic.name);
  put("code", "Scheme code", c.basic.code);
  put("type", "Scheme type", SCHEME_TYPE[c.basic.type]);
  put("level", "Scheme level (OP-SB-LVL)", c.basic.level);
  put("programmes", "Programmes", c.basic.programmes.join(", "), true);
  put("description", "Description", c.basic.description);
  put("start", "Effective start", c.duration.start, true, "date");
  put("end", "Effective end", c.duration.end, true, "date");
  put("duration", "Duration · evaluation", `${c.duration.type} · ${c.duration.evaluation}`);
  put("products", "Product applicability", productScopeText(ms, c.products), true);
  put("branches", "Branch applicability", branchScopeText(c.eligibility.branchScope), true);
  put("members", "Selected members", c.eligibility.selectedMemberIds.join(", "));
  put("segments", "Group / segment / Elite", [c.eligibility.groups.join(", "), c.eligibility.segments.join(", "), c.eligibility.elite].filter(Boolean).join(" · "));
  put("targeting", "Targeting", c.targeting.map(targetingText).join("; "));
  put("base", "Base Points", on(c.base.enabled), true);
  c.base.rows.forEach((r) => put(`base.${r.id}`, `Base Points · ${refLabel(ms, r)} · ${r.programme} · ${r.branchCodes === "all" ? "all branches" : `${r.branchCodes.length} branch(es)`}`, r.points, true, "points"));
  put("rider", "Rider Points", c.rider.enabled ? `Enabled · ${c.rider.baseCondition ?? "condition not set"} ≥ ${c.rider.baseThreshold ?? "—"} · ${rewardText(c.rider.reward, s)}` : "Off", true);
  put("crossSell", "Cross-selling", c.crossSell.enabled ? `${c.crossSell.categories.map((x) => `${categoryById(ms, x.categoryId)?.name ?? x.categoryId} ≥ ${x.minimum ?? "—"}`).join(", ")} · ${c.crossSell.requiredCategoryCount ?? "—"} must qualify · ${rewardText(c.crossSell.reward, s)}` : "Off", true);
  put("quantity", "Quantity-based", c.quantity.enabled ? `${c.quantity.basis} threshold ${c.quantity.threshold ?? "—"} · target ${c.quantity.target ?? "—"} · ${c.quantity.useSlabs ? "uses slabs" : rewardText(c.quantity.reward, s)}` : "Off", true);
  put("milestone", "Milestones", c.milestone.enabled ? c.milestone.levels.map((l) => `${l.name} ≥ ${l.threshold ?? "—"}: ${rewardText(l.reward, s)}`).join("; ") : "Off", true);
  put("slab", "Slabs", c.slab.enabled ? c.slab.slabs.map((x) => `${x.name} ${x.min ?? "—"}–${x.max ?? "∞"} (P${x.priority}): ${rewardText(x.reward, s)}`).join("; ") : "Off", true);
  put("growth", "Growth-based (OP-01)", c.growth.enabled ? `Baseline ${c.growth.baselineFrom}–${c.growth.baselineTo} vs ${c.growth.comparisonFrom}–${c.growth.comparisonTo} · ${c.growth.requiredGrowthPct ?? "—"}%` : "Off", true);
  put("combined", "Combined rules", c.combined.enabled ? `${c.combined.relation === "all_of" ? "All of" : "Any of"}: ${c.combined.components.map((k) => COMPONENT_LABEL[k]).join(" + ")}` : "Off");
  put("backdated", "Backdated calculation", c.backdated.enabled ? `Announced ${c.backdated.announcementDate}; historical ${c.backdated.historicalFrom}–${c.backdated.historicalTo}` : "Off", true);
  put("budget", "Budget cap", c.budget.amount, true, "points");
  put("autoStop", "Auto-stop at cap", c.budget.autoStop ? "Yes" : "No", true);
  put("settlement", "Settlement", c.settlement.tranches.map((t) => `${t.label} ${t.pct ?? "—"}% (${t.trigger.replace(/_/g, " ")})`).join("; "), true);
  return f;
}

export function configFields(s: SchemeState, ms: MasterState, before: SchemeConfig | null, after: SchemeConfig): FieldChange[] {
  const a = flattenConfig(s, ms, after);
  const b = before ? flattenConfig(s, ms, before) : null;
  const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a)]));
  return keys.map((k) => {
    const x = a[k] ?? b![k];
    const kind = x.kind === "points" ? "text" : x.kind;
    return { key: k, label: x.label, kind, before: b ? (b[k]?.value ?? null) : null, after: a[k]?.value ?? null, material: x.material };
  });
}

export function configDiff(s: SchemeState, ms: MasterState, before: SchemeConfig | null, after: SchemeConfig) {
  return configFields(s, ms, before, after).filter((f) => String(f.before ?? "") !== String(f.after ?? ""));
}
