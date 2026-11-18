/**
 * Scheme & Incentive Management domain model (Phase 6).
 * One common scheme engine configuration for EP, ST, CS, Retailer and DD. Every financial value is
 * explicitly configured by a Maker or left null; nothing defaults to a business value. Constructs whose
 * calculation is not confirmed by V-Guard keep their configuration but are blocked from activation.
 */
import type { ProgrammeCode } from "./domain";

/* ======================= Common ======================= */

export type SchemeStatus =
  | "draft"
  | "review"
  | "business_confirmation_required"
  | "pending_approval"
  | "returned"
  | "rejected"
  | "approved"
  | "scheduled"
  | "active"
  | "budget_exhausted"
  | "activation_failed"
  | "deactivated"
  | "completed"
  | "closed";

export type SchemeType = "base" | "rider" | "cross_sell" | "quantity" | "category" | "combined" | "milestone" | "slab" | "growth";
export type SchemeLevel = "L0" | "L1";
export type DurationType = "monthly" | "quarterly" | "half_yearly" | "financial_year" | "yearly" | "custom";
export type EvaluationType = "periodic" | "cumulative";
export type ComponentKey = "base" | "rider" | "crossSell" | "quantity" | "category" | "milestone" | "slab" | "growth";
export type AchievementBasis = "quantity" | "scan_count" | "points";

/**
 * How a reward is worked out. `fixed_points` and `points_per_unit` use a value the Maker states
 * explicitly. `business_formula` must reference a formula in the formula registry; while that formula
 * is pending the configuration is blocked from activation.
 */
export interface RewardDef {
  kind: "fixed_points" | "points_per_unit" | "business_formula";
  value: number | null;
  formulaId: string | null;
}

export interface ProductScope {
  allProducts: boolean;
  categoryIds: string[];
  subCategoryIds: string[];
  skuIds: string[];
}

export interface BranchScope {
  allBranches: boolean;
  stateCodes: string[];
  districtCodes: string[];
  branchCodes: string[];
}

/* ======================= Scheme Builder components ======================= */

/** Component 1 — basic configuration. */
export interface BasicConfig {
  name: string;
  code: string;
  description: string;
  type: SchemeType;
  level: SchemeLevel | null;
  /** True when a calculation depends on Level 0/1 semantics (OP-SB-LVL): blocks activation. */
  levelUsedInCalculation: boolean;
  programmes: ProgrammeCode[];
}

/** Component 2 — Base Points matrix row: one hierarchy level × branch scope × programme. */
export interface BasePointsRow {
  id: string;
  level: "category" | "sub_category" | "sku";
  refId: string;
  programme: ProgrammeCode;
  branchCodes: string[] | "all";
  points: number | null;
  /** Points are credited per scanned unit; the qualifying criterion text explains the event. */
  qualifying: string;
}
export interface BasePointsConfig {
  enabled: boolean;
  rows: BasePointsRow[];
  qualifyingCriteria: string;
}

/** Component 3 — Rider Points (OP-SB-RIDER). */
export interface RiderConfig {
  enabled: boolean;
  baseCondition: "base_points_threshold" | "base_quantity_threshold" | null;
  baseThreshold: number | null;
  eligibility: string;
  activationCondition: string;
  reward: RewardDef;
  programmes: ProgrammeCode[];
  segments: string[];
  contributesToMilestone: boolean;
}

/** Component 4 — Cross-selling. */
export interface CrossSellCategory {
  categoryId: string;
  basis: AchievementBasis;
  minimum: number | null;
}
export interface CrossSellConfig {
  enabled: boolean;
  categories: CrossSellCategory[];
  requiredCategoryCount: number | null;
  reward: RewardDef;
  combineWithBase: boolean;
  contributesToMilestone: boolean;
  eligibility: string;
}

/** Component 5 — Quantity-based. */
export interface QuantityConfig {
  enabled: boolean;
  basis: "quantity" | "scan_count";
  target: number | null;
  threshold: number | null;
  period: DurationType | "scheme_period";
  useSlabs: boolean;
  reward: RewardDef;
}

/** Component 7 — Combined rules. Execution precedence is never assumed. */
export interface CombinedConfig {
  enabled: boolean;
  components: ComponentKey[];
  relation: "all_of" | "any_of";
  dependencies: { component: ComponentKey; dependsOn: ComponentKey }[];
  note: string;
}

/** Component 8 — Milestones. */
export type MilestoneContribution = "base" | "base_rider" | "base_cross_sell" | "base_rider_cross_sell";
export interface MilestoneLevel {
  id: string;
  name: string;
  threshold: number | null;
  reward: RewardDef;
}
export interface MilestoneConfig {
  enabled: boolean;
  contribution: MilestoneContribution;
  measure: AchievementBasis;
  levels: MilestoneLevel[];
  memberProgress: boolean;
}

/** Component 9 — Slabs, with downgrade / reversal handling. */
export interface Slab {
  id: string;
  name: string;
  min: number | null;
  max: number | null;
  achievement: AchievementBasis;
  reward: RewardDef;
  qualificationRule: string;
  priority: number;
}
export interface SlabReversal {
  eligible: boolean | null;
  reductionHandling: "re_evaluate_net_activity" | null;
  adjustmentFormulaId: string | null;
  downgradeOutcome: string;
}
export interface SlabConfig {
  enabled: boolean;
  slabs: Slab[];
  reversal: SlabReversal;
}

/** Component 10 — Growth-based (OP-01). */
export interface GrowthConfig {
  enabled: boolean;
  baselineFrom: string;
  baselineTo: string;
  comparisonFrom: string;
  comparisonTo: string;
  requiredGrowthPct: number | null;
  basis: AchievementBasis | null;
  riderActivation: boolean;
  milestoneContribution: boolean;
  /** Programme applicability is part of OP-01: never preselected. */
  programmeApplicability: ProgrammeCode[];
  reward: RewardDef;
}

/** Component 11 — Duration & evaluation. */
export interface DurationConfig {
  type: DurationType;
  start: string;
  end: string;
  evaluation: EvaluationType;
}

/** Component 12 — Eligibility. */
export interface EligibilityConfig {
  branchScope: BranchScope;
  groups: string[];
  segments: string[];
  selectedMemberIds: string[];
  elite: "any" | "elite_only" | "exclude_elite";
  segmentNotes: { segment: string; note: string }[];
}

/** Component 14 — Targeting. */
export type TargetDimension =
  | "programme"
  | "role"
  | "retailer_type"
  | "product_category"
  | "sub_category"
  | "sku"
  | "billed_to_party"
  | "state"
  | "district"
  | "branch"
  | "pincode"
  | "member_ids"
  | "date_range"
  | "event"
  | "rfm"
  | "group"
  | "segment"
  | "elite"
  | "inactive_scan"
  | "inactive_app"
  | "business_decline";
export interface TargetingCondition {
  id: string;
  dimension: TargetDimension;
  operator: "in" | "not_in" | "between" | "at_least";
  values: string[];
  /** X days for inactivity / decline targeting. Never defaulted. */
  days: number | null;
  /** Y % for business decline. Never defaulted. */
  pct: number | null;
}

/** Component 15 — Backdated calculation. */
export type BackdatedStatus = "not_requested" | "draft" | "pending_approval" | "approved" | "running" | "completed" | "failed" | "rejected";
export interface BackdatedConfig {
  enabled: boolean;
  announcementDate: string;
  historicalFrom: string;
  historicalTo: string;
}

/** Component 17 — settlement configuration (Module 5.2). */
export interface SettlementTranche {
  id: string;
  label: string;
  pct: number | null;
  trigger: "during_scheme" | "month_end" | "final_settlement";
  conditions: string;
}
export interface SettlementConfig {
  mode: "at_closure" | "partial_release";
  tranches: SettlementTranche[];
}

export interface BudgetConfig {
  unit: "points";
  amount: number | null;
  autoStop: boolean;
  alertPct: number | null;
}

/** The complete configuration of one scheme version. */
export interface SchemeConfig {
  basic: BasicConfig;
  base: BasePointsConfig;
  rider: RiderConfig;
  crossSell: CrossSellConfig;
  quantity: QuantityConfig;
  /** Component 6 — the scheme's product applicability (category / sub-category / SKU). */
  products: ProductScope;
  combined: CombinedConfig;
  milestone: MilestoneConfig;
  slab: SlabConfig;
  growth: GrowthConfig;
  duration: DurationConfig;
  eligibility: EligibilityConfig;
  targeting: TargetingCondition[];
  backdated: BackdatedConfig;
  budget: BudgetConfig;
  settlement: SettlementConfig;
}

export type VersionStatus = "draft" | "submitted" | "returned" | "rejected" | "approved" | "active" | "superseded" | "activation_failed" | "withdrawn";

export interface SchemeVersion {
  version: number;
  status: VersionStatus;
  config: SchemeConfig;
  changeReason: string;
  createdBy: string;
  createdAt: string;
  submittedAt: string | null;
  approvalRequestId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  /** Rule version stamp written on every accrual calculated with this version. */
  ruleVersion: string;
  /** Formula registry versions referenced by this version (formulaId → version). */
  formulaVersions: Record<string, string>;
}

export interface ActivationAttempt {
  at: string;
  by: string;
  version: number;
  result: "success" | "failure";
  checks: { label: string; ok: boolean; detail: string }[];
  message: string;
  engine: "mock_development";
}

export interface Scheme {
  id: string;
  status: SchemeStatus;
  versions: SchemeVersion[];
  /** Version the (mock) engine is currently evaluating. Null until first activation. */
  activeVersion: number | null;
  activations: ActivationAttempt[];
  settlementStatus: "not_started" | "partially_settled" | "settlement_pending" | "settled";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Development only: makes the mock activation adapter fail the next activation (test 47). */
  simulateActivationFailure?: boolean;
  backdated: { status: BackdatedStatus; requestId: string | null; dataAvailability: "not_checked" | "available" | "partial" | "unavailable"; runs: { at: string; by: string; processed: number; credited: number; duplicates: number; points: number }[] };
  closedAt: string | null;
  deactivatedAt: string | null;
}

/** Component 15 — special-member extension, kept as a separate traceable change. */
export interface SpecialExtension {
  id: string;
  schemeId: string;
  baseVersion: number;
  kind: "member" | "members" | "branch";
  memberIds: string[];
  branchCodes: string[];
  reason: string;
  effectiveFrom: string;
  status: "pending_approval" | "active" | "rejected" | "returned" | "withdrawn";
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
}

/** Component 16 — explicit exclusivity. Schemes are inclusive unless one of these is active. */
export interface ExclusivityRule {
  id: string;
  schemeA: string;
  schemeB: string;
  programmes: ProgrammeCode[];
  products: ProductScope;
  branchScope: BranchScope;
  from: string;
  to: string;
  description: string;
  status: "draft" | "pending_approval" | "active" | "rejected" | "inactive";
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
}

/* ======================= Ledger contract (mock) ======================= */

/** A qualifying business transaction from the transaction feed (development data). */
export interface SourceTxn {
  id: string;
  kind: "scan" | "sales_return";
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  skuId: string;
  qty: number;
  date: string;
  /** For a sales return: the original transaction it reduces. */
  originalTxnId: string | null;
}

export type AccrualResult = "credited" | "accrued" | "rejected_duplicate" | "rejected_budget" | "excluded" | "failed" | "reversal_pending" | "reversed";

/** One reward calculation. Traceable to scheme, version, rule version, source transaction and ledger entry. */
export interface RewardAccrual {
  id: string;
  idempotencyKey: string;
  schemeId: string;
  schemeVersion: number;
  ruleId: string;
  ruleVersion: string;
  component: ComponentKey;
  sourceRef: string;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  skuId: string | null;
  categoryId: string | null;
  effectiveDate: string;
  calculatedAt: string;
  result: AccrualResult;
  points: number;
  /** Base Points are credited redeemable; Scheme / Milestone points stay unsettled. */
  bucket: "redeemable" | "unsettled";
  ledgerRef: string | null;
  reversalOf: string | null;
  reversalRef: string | null;
  releasedPoints: number;
  note: string;
  origin: "live_mock" | "backdated" | "seed";
}

/* ======================= Settlement ======================= */

export type SettlementStatus = "pending_approval" | "partially_approved" | "approved" | "executed" | "execution_failed" | "rejected" | "returned" | "withdrawn";

export interface SettlementRequest {
  id: string;
  schemeId: string;
  schemeVersion: number;
  trancheId: string;
  trancheLabel: string;
  earnedFrom: string;
  earnedTo: string;
  unsettledPoints: number;
  releasePct: number;
  releasePoints: number;
  heldPoints: number;
  /** Residual from percentage maths, held and shown (rounding policy is not configured). */
  residualHeld: number;
  accrualIds: string[];
  checks: { label: string; ok: boolean; detail: string }[];
  status: SettlementStatus;
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
  simulateFailure?: boolean;
}

export interface SettlementRelease {
  id: string;
  requestId: string;
  schemeId: string;
  schemeVersion: number;
  earnedFrom: string;
  earnedTo: string;
  settledAt: string;
  releasedPoints: number;
  heldPoints: number;
  approvers: string[];
  approvalRef: string;
  ledgerRef: string;
  passbookLabel: string;
}

/* ======================= Tiers ======================= */

export interface TierBenefit {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  branchCodes: string[] | "all";
  redeemUpTo: string;
  validity: string;
}
export interface TierBranchConfig {
  branchCode: string;
  threshold: number | null;
  /** OP-07: kept separate from thresholds and never assumed. */
  valuation: { configured: boolean; note: string };
}
export interface Tier {
  id: string;
  code: string;
  name: string;
  description: string;
  programme: ProgrammeCode;
  rank: number;
  threshold: number | null;
  thresholdBasis: AchievementBasis | null;
  qualification: string;
  validity: string;
  branchConfigs: TierBranchConfig[];
  benefits: TierBenefit[];
  status: "draft" | "pending_approval" | "active" | "inactive" | "returned" | "rejected";
  version: number;
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}
export interface TierSnapshot {
  programme: ProgrammeCode;
  tierId: string;
  branchCode: string;
  members: number;
  nearNext: number;
  upgrades30d: number;
  downgrades30d: number;
}

/* ======================= Referrals ======================= */

export type ReferralRelationship = "influencer_influencer" | "retailer_ep" | "retailer_st" | "retailer_consumer";
export interface ReferralRule {
  id: string;
  name: string;
  relationship: ReferralRelationship;
  referrerProgrammes: ProgrammeCode[];
  referredProgramme: ProgrammeCode | "Consumer";
  branchScope: BranchScope;
  eligibility: string;
  trigger: "registration_approved" | "kyc_completed" | "first_qualifying_scan" | null;
  reward: RewardDef;
  settlementBucket: "referral_unsettled";
  status: "draft" | "pending_approval" | "active" | "inactive" | "reserved_future" | "returned" | "rejected";
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}
export interface ReferralRecord {
  id: string;
  ruleId: string;
  referrerId: string;
  referrerProgramme: ProgrammeCode;
  referredId: string;
  referredProgramme: ProgrammeCode;
  date: string;
  registration: string;
  kyc: string;
  qualification: "pending" | "qualified" | "not_qualified" | "blocked_rule_pending";
  reward: "not_due" | "accrued" | "blocked" | "settled";
  settlement: "not_started" | "pending" | "released";
  checks: { check: string; result: "pass" | "flag" | "not_run"; detail: string }[];
}

/* ======================= Campaigns ======================= */

export type CampaignType = "scan_bonus" | "combo" | "happy_hour" | "referral_milestone" | "spin" | "lucky_draw" | "display_contest" | "foc";
export interface FocConfig {
  variant: "same_sku" | "different_sku" | "gift_entitlement";
  qualifyingSkuIds: string[];
  rewardSkuId: string | null;
  giftName: string;
  qualifyingQty: number | null;
  rewardQty: number | null;
  formulaId: string | null;
}
export interface Campaign {
  id: string;
  code: string;
  name: string;
  description: string;
  type: CampaignType;
  programmes: ProgrammeCode[];
  allStates: boolean;
  stateCodes: string[];
  branchCodes: string[];
  targeting: TargetingCondition[];
  start: string;
  end: string;
  budget: number | null;
  reward: RewardDef;
  rewardNote: string;
  foc: FocConfig | null;
  status: "draft" | "pending_approval" | "scheduled" | "active" | "completed" | "inactive" | "returned" | "rejected";
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}
export interface ContestEntry {
  id: string;
  campaignId: string;
  memberId: string;
  programme: ProgrammeCode;
  region: string;
  photoRef: string;
  /** What the source service states about the capture. Only "camera_verified" may be shown as live capture. */
  capture: "camera_verified" | "source_unconfirmed";
  gps: { lat: number; lng: number } | null;
  capturedAt: string;
  submittedAt: string;
  status: "submitted" | "under_review" | "shortlisted" | "winner" | "not_selected";
  reviewedBy: string | null;
  remarks: string;
}
export interface GiftBatch {
  id: string;
  campaignId: string;
  fileName: string;
  rows: { memberId: string; gift: string; qty: number; error: string | null }[];
  status: "validated" | "pending_approval" | "approved" | "rejected";
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
}
export interface BackendRedemption {
  id: string;
  campaignId: string;
  memberId: string;
  entitlement: string;
  reason: string;
  status: "pending_approval" | "approved" | "executed" | "rejected" | "returned";
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
}

/* ======================= Gamification & bonuses ======================= */

export type GameKind = "badge" | "streak" | "scratch_card" | "spin_wheel" | "leaderboard" | "achievement";
export interface GameScope {
  skuIds: string[];
  categoryIds: string[];
  branchCodes: string[];
  geoFencePincodes: string[];
}
export interface GameConfig {
  id: string;
  kind: GameKind;
  name: string;
  description: string;
  programmes: ProgrammeCode[];
  scope: GameScope;
  /** Kind-specific settings. Null values are deliberately unconfigured. */
  settings: Record<string, string | number | null>;
  /** Scratch card / spin wheel reward options. Probability stays null until an allocation is approved. */
  options: { id: string; label: string; reward: RewardDef; probabilityPct: number | null }[];
  budget: number | null;
  start: string;
  end: string;
  status: "draft" | "pending_approval" | "active" | "inactive" | "returned" | "rejected";
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}
export type BonusType = "welcome" | "assured_scratch" | "mega_scratch";
export interface Bonus {
  id: string;
  name: string;
  type: BonusType;
  trigger: string | null;
  eligibility: string | null;
  programmes: ProgrammeCode[];
  scope: GameScope;
  reward: RewardDef;
  budget: number | null;
  start: string;
  end: string;
  status: "draft" | "pending_approval" | "active" | "inactive" | "returned" | "rejected";
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}

/* ======================= Governance ======================= */

export type DecisionStatus = "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
export interface SchemeDecision {
  id: string;
  source: "sow" | "portal";
  description: string;
  owner: string;
  status: DecisionStatus;
  impacted: string;
  restriction: string;
  notes: string;
}
export interface Formula {
  id: string;
  name: string;
  appliesTo: string;
  decisionRef: string;
  status: "pending" | "confirmed";
  version: string | null;
  definition: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export type SchemeAuditEntity = "scheme" | "extension" | "exclusivity" | "settlement" | "tier" | "referral" | "campaign" | "contest" | "gamification" | "bonus" | "decision" | "formula" | "ledger";
export interface SchemeAuditEvent {
  id: string;
  ref: string;
  entity: SchemeAuditEntity;
  entityId: string;
  schemeVersion: number | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  by: string;
  orgId: string | null;
  at: string;
  changeType: string;
  reason: string;
  approvalRequestId: string | null;
}

export interface SchemeState {
  schemes: Scheme[];
  extensions: SpecialExtension[];
  exclusivity: ExclusivityRule[];
  txns: SourceTxn[];
  accruals: RewardAccrual[];
  settlements: SettlementRequest[];
  releases: SettlementRelease[];
  tiers: Tier[];
  tierSnapshots: TierSnapshot[];
  referralRules: ReferralRule[];
  referrals: ReferralRecord[];
  campaigns: Campaign[];
  contestEntries: ContestEntry[];
  giftBatches: GiftBatch[];
  backendRedemptions: BackendRedemption[];
  games: GameConfig[];
  bonuses: Bonus[];
  decisions: SchemeDecision[];
  formulas: Formula[];
  audit: SchemeAuditEvent[];
  bannerTriggers: { id: string; campaignId: string; region: string; at: string; by: string; status: "recorded_not_published" }[];
}
