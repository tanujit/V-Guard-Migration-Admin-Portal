/**
 * Scheme & Incentive Management catalogue (Phase 6). Labels, SOW references and the source-data
 * availability of every targeting dimension. Nothing here is a business value: thresholds, points,
 * percentages and probabilities are configured per record or remain unconfigured.
 */
import type { StatusTone } from "@/types/domain";
import type { AchievementBasis, BonusType, CampaignType, ComponentKey, DecisionStatus, DurationType, EvaluationType, GameKind, MilestoneContribution, ReferralRelationship, SchemeStatus, SchemeType, TargetDimension } from "@/types/schemes";

export const SCHEME_STATUS: Record<SchemeStatus, { label: string; tone: StatusTone; meaning: string }> = {
  draft: { label: "Draft", tone: "neutral", meaning: "Editable by the Maker; generates no rewards" },
  review: { label: "Review", tone: "info", meaning: "Maker is reviewing validation before submission; generates no rewards" },
  business_confirmation_required: { label: "Business confirmation required", tone: "warning", meaning: "Uses a construct whose rule V-Guard has not confirmed; cannot be submitted or activated" },
  pending_approval: { label: "Pending approval", tone: "warning", meaning: "Submitted to the Approval Centre; read-only; generates no rewards" },
  returned: { label: "Returned for correction", tone: "warning", meaning: "Checker returned it; the Maker revises a new version" },
  rejected: { label: "Rejected", tone: "negative", meaning: "Not approved; never activated" },
  approved: { label: "Approved", tone: "accent", meaning: "Approved, not yet activated. Approval does not make a scheme active" },
  scheduled: { label: "Scheduled", tone: "info", meaning: "Approved; activates through the engine adapter on its start date" },
  active: { label: "Active", tone: "positive", meaning: "Activated in the development scheme engine" },
  budget_exhausted: { label: "Budget exhausted", tone: "negative", meaning: "Auto-stopped by the mock engine when the budget cap was reached" },
  activation_failed: { label: "Activation failed", tone: "negative", meaning: "The activation adapter refused or failed; nothing was activated" },
  deactivated: { label: "Deactivated", tone: "neutral", meaning: "Stopped after approval; history and ledger kept" },
  completed: { label: "Completed", tone: "info", meaning: "End date passed; awaiting closure and settlement" },
  closed: { label: "Closed", tone: "neutral", meaning: "Closed after approval. Settlement may still be pending" },
};

/** Statuses in which a scheme can never produce a reward. */
export const NON_EARNING: SchemeStatus[] = ["draft", "review", "business_confirmation_required", "pending_approval", "returned", "rejected", "approved", "scheduled", "activation_failed", "deactivated", "closed", "completed", "budget_exhausted"];

export const SCHEME_TYPE: Record<SchemeType, string> = {
  base: "Base Points",
  rider: "Rider Points",
  cross_sell: "Cross-selling",
  quantity: "Quantity-based",
  category: "Category-specific",
  combined: "Combined rules",
  milestone: "Milestone",
  slab: "Slab",
  growth: "Growth-based",
};

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  base: "Base Points",
  rider: "Rider Points",
  crossSell: "Cross-selling",
  quantity: "Quantity-based",
  category: "Category-specific",
  milestone: "Milestone",
  slab: "Slab",
  growth: "Growth-based",
};

export const DURATION_LABEL: Record<DurationType, string> = { monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", financial_year: "Financial year (April–March, platform definition)", yearly: "Yearly", custom: "Custom range" };
export const EVALUATION_LABEL: Record<EvaluationType, { label: string; meaning: string }> = {
  periodic: { label: "Periodic", meaning: "Qualification resets at the start of each period" },
  cumulative: { label: "Cumulative", meaning: "Qualification accumulates across the whole scheme period" },
};
export const BASIS_LABEL: Record<AchievementBasis, string> = { quantity: "Quantity", scan_count: "Scan count", points: "Points earned" };
export const CONTRIBUTION_LABEL: Record<MilestoneContribution, string> = { base: "Base only", base_rider: "Base + Rider", base_cross_sell: "Base + Cross-sell", base_rider_cross_sell: "Base + Rider + Cross-sell" };

/** The 21 Scheme Builder components of SOW 6.2, with where each lives in the portal. */
export const BUILDER_COMPONENTS: { n: number; sow: string; name: string; where: string; decision?: string }[] = [
  { n: 1, sow: "6.2.1", name: "Basic scheme configuration", where: "Builder · Basics" },
  { n: 2, sow: "6.2.2", name: "Base Points", where: "Builder · Earning: Base Points matrix" },
  { n: 3, sow: "6.2.3", name: "Rider Points", where: "Builder · Advanced earning: Rider", decision: "OP-SB-RIDER" },
  { n: 4, sow: "6.2.4", name: "Cross-selling", where: "Builder · Advanced earning: Cross-sell" },
  { n: 5, sow: "6.2.5", name: "Quantity-based", where: "Builder · Advanced earning: Quantity" },
  { n: 6, sow: "6.2.6", name: "Category-specific rules", where: "Builder · Applicability" },
  { n: 7, sow: "6.2.7", name: "Combined rules", where: "Builder · Combined rules" },
  { n: 8, sow: "6.2.8", name: "Milestone", where: "Builder · Advanced earning: Milestone" },
  { n: 9, sow: "6.2.9", name: "Slab configuration", where: "Builder · Advanced earning: Slabs" },
  { n: 10, sow: "6.2.10", name: "Growth-based", where: "Builder · Advanced earning: Growth", decision: "OP-01" },
  { n: 11, sow: "6.2.11", name: "Duration & evaluation", where: "Builder · Basics" },
  { n: 12, sow: "6.2.12", name: "Retailer / member eligibility", where: "Builder · Eligibility & targeting" },
  { n: 13, sow: "6.2.13", name: "Branch & product applicability", where: "Builder · Applicability" },
  { n: 14, sow: "6.2.14", name: "Targeting dimensions", where: "Builder · Eligibility & targeting" },
  { n: 15, sow: "6.2.15", name: "Backdated calculation & special-member extension", where: "Builder · Backdated; Scheme detail · Extensions" },
  { n: 16, sow: "6.2.16", name: "Concurrency & exclusivity", where: "Scheme detail · Concurrency" },
  { n: 17, sow: "6.2.17", name: "Review, validation & projected liability", where: "Builder · Review; Scheme detail · Validation", decision: "OP-SB-LIAB" },
  { n: 18, sow: "6.2.18", name: "Lifecycle & approval", where: "Scheme detail actions + Approval Centre" },
  { n: 19, sow: "6.2.19", name: "Performance tracking", where: "Scheme detail · Performance" },
  { n: 20, sow: "6.2.20", name: "Audit trail", where: "Scheme detail · Audit; Governance · Audit" },
  { n: 21, sow: "6.2.21", name: "Scheme configuration guide", where: "Governance · Configuration guide", decision: "OP-SB-GUIDE" },
];

/**
 * Targeting dimensions and where their source attribute comes from. Only "available" dimensions can be
 * counted against the member master; the rest are configured but their population is "not computable"
 * until the source system is connected.
 */
export const TARGET_DIMENSIONS: Record<TargetDimension, { label: string; group: string; source: string; available: boolean; needsDays?: boolean; needsPct?: boolean }> = {
  programme: { label: "Profile / programme", group: "Profile", source: "Member master", available: true },
  role: { label: "Role / member type", group: "Profile", source: "Member master", available: true },
  retailer_type: { label: "Retailer type", group: "Segmentation", source: "SFDC retailer master (not connected)", available: false },
  group: { label: "Group", group: "Segmentation", source: "SFDC retailer master (not connected)", available: false },
  segment: { label: "Segment", group: "Segmentation", source: "SFDC retailer master (not connected)", available: false },
  elite: { label: "Elite classification", group: "Segmentation", source: "SFDC retailer master (not connected)", available: false },
  product_category: { label: "Product category", group: "Product", source: "Product & SKU master", available: true },
  sub_category: { label: "Sub-category", group: "Product", source: "Product & SKU master", available: true },
  sku: { label: "SKU", group: "Product", source: "Product & SKU master", available: true },
  billed_to_party: { label: "Billed-to party", group: "Commercial", source: "SFDC invoice data (not connected)", available: false },
  state: { label: "State", group: "Geography", source: "Branch hierarchy", available: true },
  district: { label: "District", group: "Geography", source: "Branch hierarchy", available: true },
  branch: { label: "Branch", group: "Geography", source: "Branch hierarchy", available: true },
  pincode: { label: "Geo-fenced pincode", group: "Geography", source: "Member working-location pincode", available: true },
  member_ids: { label: "Selected members / Rishta IDs", group: "User selection", source: "Member master", available: true },
  date_range: { label: "Applicable date", group: "Date & event", source: "Transaction date · enter YYYY-MM-DD..YYYY-MM-DD", available: true },
  event: { label: "Event", group: "Date & event", source: "Member lifecycle events (event-selection rule not confirmed)", available: false },
  rfm: { label: "RFM", group: "Behavioural", source: "Analytics service (not connected; rules not confirmed)", available: false },
  inactive_scan: { label: "Not scanned for X days", group: "Inactivity", source: "Scan service (not connected)", available: false, needsDays: true },
  inactive_app: { label: "Not opened the app for X days", group: "Inactivity", source: "App analytics (not connected)", available: false, needsDays: true },
  business_decline: { label: "Business fallen by Y% over X days", group: "Declining business", source: "Scan / sales aggregates (not connected)", available: false, needsDays: true, needsPct: true },
};

/** Member lifecycle events that exist in the Member Management module. */
export const TARGET_EVENTS = [
  { value: "registration_approved", label: "Registration approved (Stage 1)" },
  { value: "redemption_enabled", label: "Redemption enabled (Stage 2)" },
  { value: "invitation_completed", label: "SFDC invitation completed" },
];

export const CAMPAIGN_TYPE: Record<CampaignType, { label: string; sow: string; note: string }> = {
  scan_bonus: { label: "Scan Bonus", sow: "6.5", note: "Quantity-based construct of the scheme engine" },
  combo: { label: "Combo", sow: "6.5", note: "Combined / cross-sell construct of the scheme engine" },
  happy_hour: { label: "Happy Hour", sow: "6.5", note: "Time-window bonus; window configured explicitly" },
  referral_milestone: { label: "Referral Milestone", sow: "6.5", note: "Uses referral tracking milestones" },
  spin: { label: "Spin", sow: "6.5", note: "Uses spin-wheel allocation, which needs an approved allocation" },
  lucky_draw: { label: "Lucky Draw", sow: "6.5", note: "Excluded in Tamil Nadu under the Lottery Act (SOW)" },
  display_contest: { label: "Display Contest", sow: "6.5", note: "Retailer and CS: live photo, GPS and timestamp from the app" },
  foc: { label: "FOC / Buy-X-Get-Y", sow: "6.5", note: "Free item (same or different SKU) or gift entitlement" },
};

/** SOW legal restriction: Lucky Draw may never target these states. */
export const LUCKY_DRAW_EXCLUDED_STATES = ["TN"];

export const GAME_KIND: Record<GameKind, { label: string; sow: string; settings: { key: string; label: string; kind: "text" | "number" }[] }> = {
  badge: { label: "Badge", sow: "6.6", settings: [{ key: "criteria", label: "Eligibility criteria", kind: "text" }, { key: "recognition", label: "Reward or recognition", kind: "text" }] },
  streak: { label: "Streak", sow: "6.6", settings: [{ key: "event", label: "Qualifying event", kind: "text" }, { key: "frequency", label: "Frequency", kind: "text" }, { key: "requiredDuration", label: "Required duration (days)", kind: "number" }, { key: "reward", label: "Reward", kind: "text" }] },
  scratch_card: { label: "Scratch card", sow: "6.6", settings: [{ key: "action", label: "Qualifying action", kind: "text" }, { key: "memberScope", label: "Eligible member scope", kind: "text" }, { key: "scheme", label: "Applicable scheme / programme", kind: "text" }] },
  spin_wheel: { label: "Spin wheel", sow: "6.6", settings: [{ key: "action", label: "Qualifying action", kind: "text" }, { key: "memberScope", label: "Eligible member scope", kind: "text" }] },
  leaderboard: { label: "Leaderboard", sow: "6.6", settings: [{ key: "scopeLevel", label: "Leaderboard scope (e.g. district, outlet)", kind: "text" }, { key: "metric", label: "Ranking metric", kind: "text" }, { key: "period", label: "Time period", kind: "text" }, { key: "segment", label: "Eligible member segment", kind: "text" }, { key: "display", label: "Display rules", kind: "text" }, { key: "tieBreak", label: "Tie-break rule", kind: "text" }] },
  achievement: { label: "Achievement & progress", sow: "6.6", settings: [{ key: "feed", label: "Achievement feed items", kind: "text" }, { key: "progress", label: "Progress shown (tier, milestone, active schemes)", kind: "text" }] },
};

export const BONUS_TYPE: Record<BonusType, string> = { welcome: "Welcome Bonus", assured_scratch: "Assured Scratch", mega_scratch: "Mega Scratch" };

export const REFERRAL_RELATIONSHIP: Record<ReferralRelationship, { label: string; active: boolean; referrer: string[]; referred: string }> = {
  influencer_influencer: { label: "Influencer → Influencer", active: true, referrer: ["EP"], referred: "EP" },
  retailer_ep: { label: "Retailer → EP", active: true, referrer: ["Retailer"], referred: "EP" },
  retailer_st: { label: "Retailer → ST", active: true, referrer: ["Retailer"], referred: "ST" },
  retailer_consumer: { label: "Retailer → Consumer (future)", active: false, referrer: ["Retailer"], referred: "Consumer" },
};

export const DECISION_STATUS: Record<DecisionStatus, { label: string; tone: StatusTone }> = {
  open: { label: "Open", tone: "warning" },
  under_review: { label: "Under review", tone: "info" },
  confirmed: { label: "Confirmed", tone: "positive" },
  deferred: { label: "Deferred", tone: "neutral" },
  out_of_scope: { label: "Out of scope", tone: "neutral" },
};

/** Section 21 / OP-SB-GUIDE: structure of the Scheme Configuration Guide (template only). */
export const GUIDE_SECTIONS: { id: string; title: string; steps: string[] }[] = [
  { id: "create", title: "Scheme creation SOP", steps: ["Confirm the business brief, programme(s) and budget owner", "Create the scheme in Scheme Builder and save as Draft", "Record the scheme code, level (meaning pending OP-SB-LVL) and duration"] },
  { id: "eligibility", title: "Eligibility configuration SOP", steps: ["Select branches, geography and member scope from the masters", "Add targeting conditions; note dimensions whose source data is not connected", "Check the estimated eligible population on the Review step"] },
  { id: "base", title: "Base Points SOP", steps: ["Build the Base Points matrix at one hierarchy level per SKU and branch", "Resolve any overlap the validator reports; precedence between levels is not defined", "Base Points are credited redeemable, subject to KYC and redemption eligibility"] },
  { id: "advanced", title: "Advanced rule configuration SOP", steps: ["Configure Rider, Cross-sell, Quantity, Milestone, Slab and Growth components as needed", "Use only explicit values or a confirmed formula from the formula registry", "Expect constructs under open decisions to block activation"] },
  { id: "review", title: "Review and approval SOP", steps: ["Run validation and resolve every error", "Read warnings and business-confirmation items; they are shown to the Checker", "Submit; the Checker approves, rejects or returns in the Approval Centre"] },
  { id: "activation", title: "Activation SOP", steps: ["Activate the approved version through the scheme engine adapter", "Read the activation checks; a failure leaves the prior active version untouched", "Future-dated schemes stay Scheduled until the start date"] },
  { id: "budget", title: "Budget monitoring SOP", steps: ["Track consumed budget, burn rate and remaining budget daily", "Raise a budget change request before the cap is reached", "Auto-stop applies when configured; confirm production enforcement with the backend team"] },
  { id: "settlement", title: "Settlement SOP", steps: ["Raise a settlement request for the tranche and earned date range", "Clear closure, qualification and reversal checks", "Two-level approval; execution posts a Settlement Release entry through the ledger service"] },
  { id: "closure", title: "Deactivation / closure SOP", steps: ["Raise deactivation or closure through the Approval Centre", "Closure does not settle points; settle separately", "History, versions and ledger entries are kept"] },
  { id: "exceptions", title: "Exception handling SOP", steps: ["Failed activation or settlement: read the adapter message, fix, retry under the same approval", "Duplicate transactions are refused by the idempotency key, never credited twice", "Sales returns create linked reversal entries; originals are never deleted"] },
];

/** Prepared backend contracts (not connected). */
export const SERVICE_CONTRACTS: { service: string; operation: string; method: string; path: string; idempotency: string; status: string }[] = [
  { service: "Scheme configuration", operation: "Create / update draft version", method: "PUT", path: "/schemes/{schemeId}/versions/{version}", idempotency: "schemeId + version", status: "Prepared, not connected" },
  { service: "Rule validation", operation: "Validate a configuration version", method: "POST", path: "/schemes/{schemeId}/versions/{version}/validate", idempotency: "Read-only", status: "Prepared, not connected" },
  { service: "Projected liability", operation: "Calculate projected liability", method: "POST", path: "/schemes/{schemeId}/versions/{version}/liability", idempotency: "schemeId + version + formulaVersion", status: "Blocked: OP-SB-LIAB formula pending" },
  { service: "Scheme activation", operation: "Activate an approved version", method: "POST", path: "/schemes/{schemeId}/activations", idempotency: "schemeId + version + approvalRequestId", status: "Prepared, not connected" },
  { service: "Rule evaluation", operation: "Evaluate a qualifying transaction", method: "POST", path: "/scheme-engine/evaluate", idempotency: "sourceRef + memberId + schemeId + version + component + calculationRef", status: "Prepared, not connected" },
  { service: "Reward accrual", operation: "Post a reward to the ledger", method: "POST", path: "/ledger/accruals", idempotency: "Same key as evaluation", status: "Prepared, not connected" },
  { service: "Backdated calculation", operation: "Run an approved backdated calculation", method: "POST", path: "/schemes/{schemeId}/backdated-runs", idempotency: "approvalRequestId; per-transaction keys prevent double credit", status: "Prepared, not connected" },
  { service: "Settlement", operation: "Release unsettled scheme points", method: "POST", path: "/settlements/{requestId}/execute", idempotency: "approval execution key EXE-{request}-V{version}", status: "Prepared, not connected" },
  { service: "Wallet / ledger", operation: "Read scheme ledger entries", method: "GET", path: "/ledger?schemeId={id}", idempotency: "Read-only", status: "Prepared, not connected" },
  { service: "Tier", operation: "Publish tier configuration", method: "PUT", path: "/tiers/{tierId}", idempotency: "tierId + version", status: "Prepared, not connected" },
  { service: "Referral", operation: "Publish referral rule / read referral journey", method: "PUT/GET", path: "/referrals/rules/{ruleId}", idempotency: "ruleId + approvalRequestId", status: "Prepared, not connected" },
  { service: "Campaign", operation: "Publish campaign", method: "PUT", path: "/campaigns/{campaignId}", idempotency: "campaignId + approvalRequestId", status: "Prepared, not connected" },
  { service: "Gamification", operation: "Publish gamification / bonus configuration", method: "PUT", path: "/gamification/{configId}", idempotency: "configId + approvalRequestId", status: "Prepared, not connected" },
  { service: "Member app contract", operation: "Schemes, milestones, tier and achievements a member qualifies for", method: "GET", path: "/members/{memberId}/scheme-progress", idempotency: "Read-only", status: "Prepared for the mobile team; no app screens in this portal" },
];
