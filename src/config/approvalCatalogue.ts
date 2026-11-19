import type { ApprovalStatus, ExecutionStatus, FieldKind, Priority, RequestOperation } from "@/types/approval";
import type { StatusTone } from "@/types/domain";

/**
 * Request-type registry. Each future module registers the request types it submits to the central
 * engine, with the fields the Checker compares. Field lists are development proposals.
 */
export interface RequestTypeDef {
  id: string;
  module: string;
  label: string;
  operation: RequestOperation;
  category: "financial" | "member" | "configuration";
  /** Template fields; `before` values for modify requests come from the module's current record. */
  fields: { key: string; label: string; kind: FieldKind; material?: boolean }[];
}

export const REQUEST_TYPES: RequestTypeDef[] = [
  { id: "points_adjustment", module: "points-adjustment", label: "Manual points adjustment", operation: "transaction", category: "financial", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "balance", label: "Available balance", kind: "points", material: true }, { key: "adjustment", label: "Adjustment", kind: "points", material: true }, { key: "reasonCode", label: "Adjustment reason", kind: "text" }] },
  { id: "points_reversal", module: "points-reversal", label: "Points reversal", operation: "transaction", category: "financial", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "scanRef", label: "Original scan / credit", kind: "text" }, { key: "points", label: "Points reversed", kind: "points", material: true }, { key: "balance", label: "Available balance", kind: "points", material: true }] },
  { id: "points_transfer", module: "points-transfer", label: "Points transfer", operation: "transaction", category: "financial", fields: [{ key: "from", label: "From member", kind: "text" }, { key: "to", label: "To member", kind: "text" }, { key: "points", label: "Points", kind: "points", material: true }] },
  { id: "redemption_cancellation", module: "redemption", label: "Redemption cancellation", operation: "modify", category: "financial", fields: [{ key: "redemption", label: "Redemption", kind: "text" }, { key: "status", label: "Redemption status", kind: "status", material: true }, { key: "points", label: "Points to refund", kind: "points", material: true }, { key: "value", label: "Value", kind: "currency", material: true }] },
  { id: "member_block", module: "members", label: "Member block", operation: "modify", category: "member", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "status", label: "Member status", kind: "status", material: true }, { key: "scope", label: "Block scope", kind: "text" }] },
  { id: "member_reinstate", module: "members", label: "Member reinstatement", operation: "modify", category: "member", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "status", label: "Member status", kind: "status", material: true }] },
  { id: "member_info_correction", module: "members", label: "Sensitive member information correction", operation: "modify", category: "member", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "bank", label: "Bank account (masked)", kind: "text", material: true }, { key: "pan", label: "PAN (masked)", kind: "text", material: true }] },
  { id: "registration_approval", module: "registration-kyc", label: "Registration approval", operation: "modify", category: "member", fields: [{ key: "member", label: "Applicant", kind: "text" }, { key: "status", label: "Registration status", kind: "status", material: true }] },
  { id: "kyc_status_override", module: "registration-kyc", label: "KYC status override", operation: "modify", category: "member", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "check", label: "Verification", kind: "text" }, { key: "status", label: "Verification status", kind: "status", material: true }] },
  { id: "scheme_create", module: "schemes", label: "Scheme creation", operation: "create", category: "configuration", fields: [{ key: "name", label: "Scheme name", kind: "text" }, { key: "start", label: "Start date", kind: "date" }, { key: "end", label: "End date", kind: "date" }, { key: "multiplier", label: "Points multiplier", kind: "number", material: true }, { key: "budget", label: "Points budget", kind: "points", material: true }] },
  { id: "scheme_modify", module: "schemes", label: "Scheme modification", operation: "modify", category: "configuration", fields: [{ key: "name", label: "Scheme name", kind: "text" }, { key: "end", label: "End date", kind: "date" }, { key: "multiplier", label: "Points multiplier", kind: "number", material: true }, { key: "budget", label: "Points budget", kind: "points", material: true }] },
  { id: "scheme_activation", module: "schemes", label: "Scheme activation / deactivation", operation: "modify", category: "configuration", fields: [{ key: "name", label: "Scheme", kind: "text" }, { key: "status", label: "Scheme status", kind: "status", material: true }] },
  { id: "sku_update", module: "products", label: "Product / SKU configuration change", operation: "modify", category: "configuration", fields: [{ key: "sku", label: "SKU", kind: "text" }, { key: "points", label: "Points per scan", kind: "points", material: true }, { key: "category", label: "Category", kind: "text" }, { key: "status", label: "SKU status", kind: "status" }] },
  { id: "financial_rule_change", module: "financial", label: "Financial rule change", operation: "modify", category: "financial", fields: [{ key: "rule", label: "Rule", kind: "text" }, { key: "programme", label: "Programme", kind: "text" }, { key: "rate", label: "Rate", kind: "percent", material: true }, { key: "effective", label: "Effective from", kind: "date" }] },
  { id: "communication_publish", module: "communication", label: "Communication publication", operation: "create", category: "configuration", fields: [{ key: "title", label: "Message title", kind: "text" }, { key: "audience", label: "Audience", kind: "text" }, { key: "channel", label: "Channel", kind: "text" }, { key: "sendOn", label: "Send on", kind: "date" }] },
  { id: "scan_restriction_change", module: "fraud-rules", label: "Scan restriction change", operation: "modify", category: "configuration", fields: [{ key: "rule", label: "Rule", kind: "text" }, { key: "limit", label: "Daily scan limit", kind: "number", material: true }, { key: "action", label: "Action on breach", kind: "text" }] },
  { id: "gift_catalogue_publish", module: "redemption", label: "Gift catalogue publication", operation: "modify", category: "configuration", fields: [{ key: "items", label: "Items published", kind: "number" }, { key: "status", label: "Catalogue status", kind: "status" }] },
  // Phase 4: scanning configuration changes, raised by the Scanning Configuration module.
  { id: "scan_rule_create", module: "scan-config", label: "Scan restriction rule creation", operation: "create", category: "configuration", fields: [] },
  { id: "scan_rule_modify", module: "scan-config", label: "Scan restriction rule change", operation: "modify", category: "configuration", fields: [] },
  { id: "scan_rule_deactivate", module: "scan-config", label: "Scan restriction rule deactivation", operation: "deactivate", category: "configuration", fields: [] },
  { id: "scan_points_change", module: "scan-config", label: "Scan-In / Scan-Out point configuration", operation: "modify", category: "configuration", fields: [] },
  // Phase 6: Scheme & Incentive Management. Fields come from the originating module's version comparison.
  { id: "scheme_closure", module: "schemes", label: "Scheme closure", operation: "modify", category: "configuration", fields: [] },
  { id: "scheme_extension", module: "schemes", label: "Special-member scheme extension", operation: "modify", category: "configuration", fields: [] },
  { id: "scheme_exclusivity", module: "schemes", label: "Scheme exclusivity rule", operation: "create", category: "configuration", fields: [] },
  { id: "scheme_budget_change", module: "scheme-budget", label: "Scheme budget change", operation: "modify", category: "financial", fields: [] },
  { id: "scheme_backdated_calc", module: "scheme-budget", label: "Backdated scheme calculation", operation: "transaction", category: "financial", fields: [] },
  { id: "tier_config", module: "tiers", label: "Tier configuration", operation: "modify", category: "configuration", fields: [] },
  { id: "referral_config", module: "referrals", label: "Referral rule configuration", operation: "modify", category: "configuration", fields: [] },
  { id: "campaign_publish", module: "campaigns", label: "Campaign publication", operation: "create", category: "configuration", fields: [] },
  { id: "gift_batch", module: "campaigns", label: "Bulk gift entitlement upload", operation: "transaction", category: "financial", fields: [] },
  { id: "backend_redemption", module: "campaigns", label: "Backend redemption on behalf of a member", operation: "transaction", category: "financial", fields: [] },
  { id: "gamification_config", module: "gamification", label: "Gamification configuration", operation: "modify", category: "configuration", fields: [] },
  { id: "bonus_config", module: "gamification", label: "Bonus configuration", operation: "modify", category: "configuration", fields: [] },
  // Phase 7: wallet, TDS, GST and redemption operations. Fields come from the wallet module.
  { id: "points_adjustment_bulk", module: "points-adjustment", label: "Bulk points adjustment (CSV)", operation: "transaction", category: "financial", fields: [] },
  { id: "gst_override", module: "gst-gate", label: "Retailer GST gate override", operation: "modify", category: "financial", fields: [] },
  { id: "tds_fy_reconciliation", module: "tds", label: "TDS Kitty FY reconciliation", operation: "transaction", category: "financial", fields: [] },
  { id: "gift_redemption", module: "gift-redemption", label: "Backend gift redemption (paid / FOC)", operation: "transaction", category: "financial", fields: [] },
  { id: "redemption_limit_change", module: "redemption-limits", label: "Redemption limit / minimum balance change", operation: "modify", category: "financial", fields: [] },
  { id: "retailer_reserve_change", module: "redemption-limits", label: "Retailer TDS reserve change", operation: "modify", category: "financial", fields: [] },
  // Phase 8: Communication Centre. Fields come from the communication module.
  { id: "comm_template_publish", module: "comm-templates", label: "Message template publication", operation: "modify", category: "configuration", fields: [] },
  { id: "content_publish", module: "content", label: "Content publication (testimonials)", operation: "create", category: "configuration", fields: [] },
  { id: "survey_publish", module: "surveys", label: "Survey publication", operation: "create", category: "configuration", fields: [] },
  { id: "bot_menu_publish", module: "comm-bot", label: "WhatsApp bot menu publication", operation: "modify", category: "configuration", fields: [] },
  { id: "gift_catalogue_publish", module: "gift-catalogue", label: "Gift catalogue publication", operation: "modify", category: "configuration", fields: [] },
  { id: "gift_point_cost_change", module: "gift-catalogue", label: "Gift point-cost change", operation: "modify", category: "financial", fields: [] },
  { id: "voucher_recovery", module: "vouchers", label: "Voucher recovery / reissue", operation: "transaction", category: "financial", fields: [] },
  { id: "insurance_batch_upload", module: "insurance", label: "Insurance card bulk upload", operation: "create", category: "member", fields: [] },
  { id: "risk_threshold_change", module: "fraud-rules", label: "Anomaly threshold change", operation: "modify", category: "configuration", fields: [] },
  { id: "global_restriction_change", module: "fraud-rules", label: "Global restriction policy change", operation: "modify", category: "configuration", fields: [] },
  { id: "risk_block_release", module: "fraud-rules", label: "Redemption risk block release", operation: "modify", category: "member", fields: [] },
  { id: "device_block", module: "devices", label: "Device block", operation: "deactivate", category: "member", fields: [] },
  { id: "device_release", module: "devices", label: "Device release", operation: "modify", category: "member", fields: [] },
  { id: "integration_config_change", module: "integrations", label: "Integration configuration change", operation: "modify", category: "configuration", fields: [] },
  { id: "kpi_definition_change", module: "kpi-governance", label: "KPI definition confirmation", operation: "modify", category: "configuration", fields: [] },
  { id: "kpi_target_change", module: "kpi-governance", label: "KPI target confirmation", operation: "modify", category: "configuration", fields: [] },
  { id: "app_theme_publish", module: "app-themes", label: "Member app theme", operation: "modify", category: "configuration", fields: [] },
  { id: "insurance_card_publish", module: "insurance", label: "Insurance card publication", operation: "modify", category: "member", fields: [] },
  // Candidate categories from the SOW. Registered so the policy registry covers them; no workflow routes them yet.
  { id: "points_addition", module: "wallet", label: "Manual points addition", operation: "transaction", category: "financial", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "balance", label: "Available balance", kind: "points", material: true }, { key: "points", label: "Points added", kind: "points", material: true }] },
  { id: "points_deduction", module: "wallet", label: "Manual points deduction", operation: "transaction", category: "financial", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "balance", label: "Available balance", kind: "points", material: true }, { key: "points", label: "Points deducted", kind: "points", material: true }] },
  { id: "sales_return_adjustment", module: "points-reversal", label: "Sales-return adjustment", operation: "transaction", category: "financial", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "invoice", label: "Return invoice", kind: "text" }, { key: "points", label: "Points reversed", kind: "points", material: true }] },
  { id: "scheme_settlement", module: "scheme-settlement", label: "Scheme settlement release", operation: "transaction", category: "financial", fields: [{ key: "scheme", label: "Scheme", kind: "text" }, { key: "points", label: "Points settled", kind: "points", material: true }, { key: "value", label: "Settlement value", kind: "currency", material: true }] },
  { id: "tds_gst_override", module: "financial", label: "TDS/GST administrative override", operation: "modify", category: "financial", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "rate", label: "Deduction rate", kind: "percent", material: true }, { key: "period", label: "Period", kind: "text" }] },
  { id: "programme_block_removal", module: "members", label: "Programme block removal", operation: "modify", category: "member", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "programme", label: "Programme", kind: "text" }, { key: "status", label: "Programme status", kind: "status", material: true }] },
  { id: "temporary_hold_change", module: "members", label: "Temporary hold change", operation: "modify", category: "member", fields: [{ key: "member", label: "Member", kind: "text" }, { key: "hold", label: "Hold", kind: "status", material: true }, { key: "until", label: "Hold until", kind: "date" }] },
];

export const requestTypeById = new Map(REQUEST_TYPES.map((r) => [r.id, r]));

export const APPROVAL_STATUS: Record<ApprovalStatus, { label: string; tone: StatusTone; meaning: string }> = {
  draft: { label: "Draft", tone: "neutral", meaning: "Created but not submitted" },
  submitted: { label: "Submitted", tone: "info", meaning: "Submitted for approval" },
  pending_assignment: { label: "Pending assignment", tone: "warning", meaning: "No eligible approver or workflow yet" },
  pending_approval: { label: "Pending approval", tone: "warning", meaning: "Awaiting a Checker decision" },
  under_review: { label: "Under review", tone: "info", meaning: "A Checker has opened the request" },
  returned: { label: "Returned for correction", tone: "warning", meaning: "Back with the Maker for changes" },
  resubmitted: { label: "Resubmitted", tone: "info", meaning: "Corrected request submitted again" },
  partially_approved: { label: "Partially approved", tone: "accent", meaning: "Some stages approved; more pending" },
  approved: { label: "Approved", tone: "positive", meaning: "All required stages approved" },
  rejected: { label: "Rejected", tone: "negative", meaning: "Rejected; not executed" },
  withdrawn: { label: "Withdrawn", tone: "neutral", meaning: "Withdrawn by the Maker or an administrator" },
  cancelled: { label: "Cancelled", tone: "neutral", meaning: "Cancelled under an authorised process" },
  escalated: { label: "Escalated", tone: "negative", meaning: "Past its SLA and escalated" },
  expired: { label: "Expired", tone: "neutral", meaning: "Expired under a configured policy" },
};

export const EXECUTION_STATUS: Record<ExecutionStatus, { label: string; tone: StatusTone }> = {
  not_applicable: { label: "Not started", tone: "neutral" },
  awaiting: { label: "Awaiting execution", tone: "warning" },
  executing: { label: "Executing", tone: "info" },
  executed: { label: "Executed", tone: "positive" },
  failed: { label: "Execution failed", tone: "negative" },
  retry_pending: { label: "Retry pending", tone: "warning" },
};

export const PRIORITY: Record<Priority, { label: string; tone: StatusTone; rank: number }> = {
  critical: { label: "Critical", tone: "negative", rank: 0 },
  high: { label: "High", tone: "warning", rank: 1 },
  medium: { label: "Medium", tone: "info", rank: 2 },
  low: { label: "Low", tone: "neutral", rank: 3 },
};

/**
 * Explicit state machine. Every status change goes through `canTransition`; UI components never set
 * a status directly. Execution status has its own transitions below.
 */
export const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["pending_approval", "pending_assignment", "approved"],
  resubmitted: ["pending_approval", "pending_assignment"],
  pending_assignment: ["pending_approval", "withdrawn", "cancelled"],
  pending_approval: ["under_review", "partially_approved", "approved", "rejected", "returned", "withdrawn", "escalated", "pending_assignment", "expired"],
  under_review: ["partially_approved", "approved", "rejected", "returned", "escalated", "pending_assignment"],
  partially_approved: ["under_review", "partially_approved", "approved", "rejected", "returned", "escalated", "pending_assignment"],
  escalated: ["under_review", "partially_approved", "approved", "rejected", "returned", "pending_assignment"],
  returned: ["resubmitted", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
  cancelled: [],
  expired: [],
};

export const EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  not_applicable: ["awaiting"],
  awaiting: ["executing"],
  executing: ["executed", "failed"],
  failed: ["retry_pending"],
  retry_pending: ["executing"],
  executed: [],
};

export const canTransition = (from: ApprovalStatus, to: ApprovalStatus) => TRANSITIONS[from].includes(to);
export const canExecTransition = (from: ExecutionStatus, to: ExecutionStatus) => EXECUTION_TRANSITIONS[from].includes(to);

/** Statuses in which the current stage can be decided by a Checker. */
export const DECIDABLE: ApprovalStatus[] = ["pending_approval", "under_review", "partially_approved", "escalated"];
/** Statuses counted as "pending" for queues and KPIs. */
export const PENDING: ApprovalStatus[] = ["pending_approval", "under_review", "partially_approved", "escalated", "pending_assignment"];
