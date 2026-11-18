/**
 * Wallet, points, TDS and redemption catalogue (Phase 7, SOW Module 5 and 10.5).
 * Labels, classifications and the SOW-stated values. Values the SOW leaves open are carried with a
 * "business confirmation required" status and are never used as if they were confirmed.
 */
import type { StatusTone } from "@/types/domain";
import type { ProgrammeCode } from "@/types/members";
import type { Bucket, FinDecision, LedgerType, OpStatus, PolicyValue, RedemptionMethod, RedemptionStage, RedemptionTrack, ReconType, WalletConfig } from "@/types/wallet";

export const PROGRAMMES: ProgrammeCode[] = ["EP", "ST", "CS", "Retailer", "DD"];

/* ---------------- Ledger categories (SOW 5.7, 10.5) ---------------- */
/**
 * earning: counts towards Lifetime Points. earningReversal: reduces Lifetime Points.
 * Every category posts only through the wallet service; none can be edited or deleted in the UI.
 */
export const LEDGER_TYPE: Record<LedgerType, { label: string; earning?: boolean; earningReversal?: boolean; tone: StatusTone }> = {
  scan_credit: { label: "Scan points credit", earning: true, tone: "positive" },
  base_credit: { label: "Base points credit", earning: true, tone: "positive" },
  scheme_accrual: { label: "Scheme points accrual", earning: true, tone: "accent" },
  settlement_release: { label: "Scheme settlement release", tone: "info" },
  welcome_bonus: { label: "Welcome bonus", earning: true, tone: "positive" },
  other_bonus: { label: "Other configured bonus", earning: true, tone: "positive" },
  manual_add: { label: "Manual points addition", earning: true, tone: "positive" },
  manual_deduct: { label: "Manual points deduction", earningReversal: true, tone: "negative" },
  sales_return_reversal: { label: "Sales return reversal", earningReversal: true, tone: "negative" },
  invalid_claim_reversal: { label: "Invalid claim reversal", earningReversal: true, tone: "negative" },
  wrong_credit_reversal: { label: "Wrong credit reversal", earningReversal: true, tone: "negative" },
  transfer_debit: { label: "Points transfer debit", tone: "negative" },
  transfer_credit: { label: "Points transfer credit", tone: "positive" },
  redemption_debit: { label: "Redemption debit", tone: "negative" },
  redemption_reversal: { label: "Redemption reversal", tone: "info" },
  tds_kitty_deduction: { label: "TDS Kitty deduction", tone: "warning" },
  tds_kitty_refund: { label: "TDS Kitty refund", tone: "info" },
  tds_paid: { label: "TDS paid", tone: "neutral" },
  gst_lock: { label: "GST lock", tone: "warning" },
  gst_unlock: { label: "GST unlock", tone: "info" },
  expiry: { label: "Expiry", tone: "neutral" },
  emi_burn: { label: "EMI point burn", tone: "negative" },
  other_adjustment: { label: "Other configured adjustment", tone: "neutral" },
};

export const BUCKET: Record<Bucket, { label: string; short: string; desc: string; tone: StatusTone; redeemable: boolean }> = {
  available: { label: "Available points", short: "Available", desc: "Redeemable now, subject to KYC, restrictions, the Retailer GST gate and reserve", tone: "positive", redeemable: true },
  pending: { label: "Pending points", short: "Pending", desc: "Credited by the scan service but not yet validated. Not redeemable", tone: "warning", redeemable: false },
  scheme_unsettled: { label: "Scheme points (unsettled)", short: "Scheme", desc: "Scheme / milestone points held until scheme closure and two-level settlement (SOW 5.2). Not redeemable", tone: "accent", redeemable: false },
  tds_kitty: { label: "TDS Kitty", short: "TDS Kitty", desc: "EP/IMP scan-time TDS held until financial-year reconciliation (SOW 5.4.1). Not redeemable", tone: "warning", redeemable: false },
  tds_paid: { label: "TDS paid", short: "TDS paid", desc: "Kitty points moved to TDS Paid after an above-threshold FY outcome. Never returned to the wallet", tone: "neutral", redeemable: false },
  gst_locked: { label: "GST-locked points", short: "GST locked", desc: "Retailer Base Points above the GST threshold, locked until GSTIN is verified (SOW 5.5)", tone: "warning", redeemable: false },
  redeemed: { label: "Redeemed points", short: "Redeemed", desc: "Points consumed by redemptions", tone: "info", redeemable: false },
  expired: { label: "Expired points", short: "Expired", desc: "Points that expired under the wallet service's expiry policy", tone: "neutral", redeemable: false },
};

/* ---------------- Programme TDS models (SOW 5.4) ---------------- */
export const TDS_MODEL: Record<ProgrammeCode, { model: "kitty_at_scan" | "on_redemption" | "not_configured"; label: string; detail: string }> = {
  EP: { model: "kitty_at_scan", label: "Deducted at scan, held in TDS Kitty", detail: "SOW 5.4.1: provisional 10% with PAN, 20% without PAN at scan; FY-end reconciliation against ₹20,000" },
  ST: { model: "on_redemption", label: "Deducted at redemption", detail: "SOW 5.4.2: no scan-time TDS and no Kitty; rate from PAN validation and slab (OP-TDS1)" },
  CS: { model: "on_redemption", label: "Deducted at redemption", detail: "SOW 5.4.2: no scan-time TDS and no Kitty; rate from PAN validation and slab (OP-TDS1)" },
  Retailer: { model: "on_redemption", label: "Deducted at redemption", detail: "SOW 5.4.2: no scan-time TDS and no Kitty; ₹2,000 minimum TDS reserve; rate from PAN and slab (OP-TDS1)" },
  DD: { model: "not_configured", label: "Business confirmation required", detail: "The SOW does not establish DD TDS treatment. Nothing is calculated" },
};

/* ---------------- Redemption ---------------- */
export const REDEMPTION_METHOD: Record<RedemptionMethod, { label: string; detail: string }> = {
  dbt: { label: "DBT (bank transfer)", detail: "Instant bank transfer to the verified account. SOW expectation: under one minute, daily reconciliation" },
  upi: { label: "UPI", detail: "Instant transfer to the verified UPI ID" },
  voucher: { label: "Voucher", detail: "Amazon, Flipkart, BigBasket, BookMyShow, MMT" },
  vguard_com: { label: "V-Guard.com gift", detail: "Gift from the V-Guard.com catalogue (Gift & Fulfilment module)" },
  product: { label: "Product", detail: "Member-type products. SOW indicates 2–3 days fulfilment (not a live SLA)" },
  emi: { label: "EMI via points", detail: "Retailer financing instalment paid with points (SOW 5.6, OP-FIN1)" },
};

export const TRACK: Record<RedemptionTrack, { label: string; tone: StatusTone }> = {
  pass: { label: "Pass", tone: "positive" },
  in_process: { label: "In process", tone: "warning" },
  fail: { label: "Fail", tone: "negative" },
};

export const STAGE: Record<RedemptionStage, { label: string; tone: StatusTone }> = {
  blocked: { label: "Blocked", tone: "negative" },
  manual_validation: { label: "Manual validation", tone: "warning" },
  mail_approval: { label: "Pending mail approval", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  payout_initiated: { label: "Payout initiated", tone: "info" },
  paid: { label: "Paid", tone: "positive" },
  delivered: { label: "Delivered", tone: "positive" },
  failed: { label: "Failed", tone: "negative" },
  reversal_pending: { label: "Reversal pending", tone: "warning" },
  reversed: { label: "Reversed", tone: "neutral" },
  cancellation_pending: { label: "Cancellation pending", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** SOW-listed blocked reasons (5.3 / 10.5) plus configured restrictions. */
export const BLOCK_REASON = {
  kyc: "KYC pending",
  bank: "Bank not verified",
  upi: "UPI not verified",
  duplicate: "Duplicate account found",
  geo: "Store geo-validation pending",
  minimum: "Minimum points not met",
  restriction: "Member restriction in force",
  gst: "GST gate: amount above the unverified-GSTIN threshold",
  reserve: "Retailer TDS reserve would be breached",
  balance: "Insufficient available points",
  dd: "DD redemption rules not established (business confirmation required)",
} as const;

export const OP_STATUS: Record<OpStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved, not executed", tone: "accent" },
  rejected: { label: "Rejected", tone: "negative" },
  returned: { label: "Returned", tone: "warning" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  executing: { label: "Executing", tone: "info" },
  completed: { label: "Completed", tone: "positive" },
  failed: { label: "Failed", tone: "negative" },
  business_confirmation_required: { label: "Business confirmation required", tone: "warning" },
};

/* ---------------- Reason codes ---------------- */
export const ADJUSTMENT_REASONS = [
  { code: "ADJ-SCAN-FAIL", label: "Verified scan failed to post" },
  { code: "ADJ-GOODWILL", label: "Goodwill credit (ticket-backed)" },
  { code: "ADJ-SCHEME-CORR", label: "Scheme points correction" },
  { code: "ADJ-DUP-CREDIT", label: "Duplicate credit recovery" },
  { code: "ADJ-GIFT-FULFIL", label: "Failed gift fulfilment refund (linked to the original redemption)" },
  { code: "ADJ-OTHER", label: "Other (explain in remarks)" },
];
export const REVERSAL_REASONS = [
  { code: "REV-SALES-RETURN", label: "Sales return", type: "sales_return" as const },
  { code: "REV-INVALID-CLAIM", label: "Invalid claim", type: "invalid_claim" as const },
  { code: "REV-WRONG-CREDIT", label: "Wrong points credit", type: "wrong_credit" as const },
];
export const TRANSFER_REASONS = [
  { code: "TRF-DISPUTE", label: "Dispute resolution: scans by the wrong member" },
  { code: "TRF-DEVICE", label: "Scanned on another member's device" },
  { code: "TRF-OTHER", label: "Other (explain in comment)" },
];
export const GST_OVERRIDE_REASONS = [
  { code: "GST-SFDC-DELAY", label: "GSTIN verified offline, SFDC update delayed" },
  { code: "GST-EXCEPTION", label: "Exceptional business approval" },
];
export const GIFT_REASONS = [
  { code: "GFT-ON-BEHALF", label: "Member requested assistance" },
  { code: "GFT-CAMPAIGN", label: "Campaign / event gift" },
  { code: "GFT-SERVICE", label: "Service recovery (FOC)" },
];
export const CANCEL_REASONS = [
  { code: "CAN-UNDELIVERABLE", label: "Gift undeliverable" },
  { code: "CAN-WRONG-ACCOUNT", label: "Payout to a wrong / closed account" },
  { code: "CAN-MEMBER-REQUEST", label: "Member request before payout" },
];

export const VOUCHER_PROVIDERS = ["Amazon", "Flipkart", "BigBasket", "BookMyShow", "MMT"];

/** Read-only view of the Gift & Fulfilment catalogue service (mock). Points are catalogue data, not rules. */
export const GIFT_CATALOGUE = [
  { ref: "GFT-CAT-0101", item: "Tool kit (24 pieces)", points: 1800, available: true, programmes: ["EP", "ST"] as ProgrammeCode[] },
  { ref: "GFT-CAT-0102", item: "Digital multimeter", points: 1200, available: true, programmes: ["EP", "ST", "CS"] as ProgrammeCode[] },
  { ref: "GFT-CAT-0203", item: "Store display rack", points: 4500, available: true, programmes: ["Retailer"] as ProgrammeCode[] },
  { ref: "GFT-CAT-0204", item: "Branded umbrella", points: 300, available: true, programmes: ["EP", "ST", "CS", "Retailer"] as ProgrammeCode[] },
  { ref: "GFT-CAT-0305", item: "Safety helmet", points: 650, available: false, programmes: ["EP", "ST", "CS"] as ProgrammeCode[] },
];

/* ---------------- GST gate classification (SOW 5.5) ---------------- */
/**
 * Business configuration: how each Retailer scheme's points are classified for the GST gate.
 * Exceptions (DU, Battery, WSSG) are identified from this table, never from product names.
 * Development values: confirm the table with V-Guard.
 */
export const GST_SCHEME_CLASS: Record<string, { cls: "milestone" | "cross_category" | "one_vg" | "du" | "battery" | "wssg" | "rider"; note: string }> = {
  "SCH-0002": { cls: "milestone", note: "Milestone points: locked without verified GSTIN" },
  "SCH-0006": { cls: "rider", note: "Rider points: treated as scheme points, locked without verified GSTIN" },
  "SCH-0007": { cls: "cross_category", note: "Growth scheme across categories: locked without verified GSTIN" },
  "SCH-0011": { cls: "wssg", note: "WSSG scheme (development classification): GST gate exception" },
  "SCH-0016": { cls: "battery", note: "Battery scheme (development classification): GST gate exception" },
};
export const GST_EXCEPTION_CLASSES = ["du", "battery", "wssg"] as const;

/* ---------------- Policies (AF22/AF23) ---------------- */
export const pv = (value: number | null, unit: PolicyValue["unit"], status: PolicyValue["status"], note = ""): PolicyValue => ({ value, unit, status, note });
export const BCR = (unit: PolicyValue["unit"], note = "OP-08: value not confirmed"): PolicyValue => pv(null, unit, "business_confirmation_required", note);
export const NA = (unit: PolicyValue["unit"]): PolicyValue => pv(null, unit, "not_applicable");

export const DEFAULT_CONFIG: WalletConfig = {
  pointValueInr: 1,
  expiringSoonDays: 30,
  ep: { panRatePct: 10, noPanRatePct: 20, fyThresholdInr: 20000, slabConfigured: false },
  gst: { thresholdInr: 19999, exceptionCategories: ["du", "battery", "wssg"] },
  retailerReserveDefaultInr: 2000,
  batchPolicy: "atomic",
  autoReversal: { windowHours: null, status: "business_confirmation_required" },
  emi: { partner: null, enabled: false },
};

/* ---------------- Reconciliation ---------------- */
export const RECON_TYPE: Record<ReconType, { label: string; source: string; target: string }> = {
  wallet_ledger: { label: "Wallet balance vs ledger", source: "Wallet service snapshot", target: "Ledger sum" },
  redemption_payout: { label: "Redemption request vs payout", source: "DBT/UPI redemptions", target: "Payout records" },
  payout_utr: { label: "Payout vs UTR", source: "Successful payouts", target: "UTR / bank reference" },
  adjustment_approval: { label: "Points adjustment vs approval", source: "Posted manual lines", target: "Approved requests" },
  transfer_pair: { label: "Transfer debit vs credit", source: "Transfer debits", target: "Transfer credits" },
  settlement_release: { label: "Scheme settlement vs ledger release", source: "Phase 6 settlement releases", target: "Settlement release lines" },
  kitty_fy: { label: "TDS Kitty vs FY reconciliation", source: "Kitty balances", target: "FY reconciliation records" },
  tds_paid: { label: "TDS deducted vs TDS paid", source: "Above-threshold outcomes", target: "TDS paid lines" },
  failed_redemption_reversal: { label: "Failed redemption vs point reversal", source: "Failed redemptions", target: "Redemption reversal lines" },
  emi_reference: { label: "EMI point burn vs financing reference", source: "EMI burns", target: "External financing references" },
};

/* ---------------- Notifications (mock) ---------------- */
export const FIN_EVENTS = [
  "Points manually added", "Points manually deducted", "Reversal initiated", "Reversal approved", "Point transfer submitted", "Point transfer completed",
  "Redemption created", "Payout initiated", "Payout succeeded", "Payout failed", "Voucher issued", "Voucher recovered",
  "TDS Kitty reconciliation initiated", "TDS Kitty refund completed", "TDS paid", "GST override requested", "GST override approved", "GST gate updated",
  "Scheme settlement submitted", "Scheme settlement approved", "Scheme settlement completed", "EMI points used", "Financial reconciliation exception",
] as const;

/* ---------------- Business confirmation register ---------------- */
export const FIN_DECISIONS: FinDecision[] = [
  { id: "FD-01", ref: "OP-TDS1", question: "IMP/EP slab above ₹20,000 per FY, and the redemption TDS slab and PAN / no-PAN treatment for Retailer, ST and CS", treatment: "Provisional 10% / 20% scan-time rates and the ₹20,000 threshold are shown. Above-threshold FY outcomes and new redemption-time TDS calculations are blocked", status: "open", answer: "" },
  { id: "FD-02", ref: "OP-RET1", question: "Retailer GST certificate capture: Retailer App or SFDC only, and the SFDC write-back approval flow", treatment: "GST source and write-back are configurable status fields. No Retailer app journey or SFDC call is built", status: "open", answer: "" },
  { id: "FD-03", ref: "OP-FIN1", question: "EMI financing partner, payment rail, eligibility, limits, reversals, external references and reconciliation contract", treatment: "Monitoring and a configuration framework only. No partner or limit is set; EMI stays disabled", status: "open", answer: "" },
  { id: "FD-04", ref: "OP-08", question: "Daily and monthly redemption limits by value and by scan count, and the member types they apply to", treatment: "Controls exist; unresolved values show Business confirmation required and are not enforced", status: "open", answer: "" },
  { id: "FD-05", ref: "SOW 5.3", question: "Automatic reversal window for failed redemptions", treatment: "Reversal policy is configurable with no default window. Failed redemptions wait for the window to be set or for a manual reversal", status: "open", answer: "" },
  { id: "FD-06", ref: "SOW 10.5", question: "Retailer minimum redeemable threshold is written as ₹2,500 under 'minimum points to redeem': rupees or points?", treatment: "Value preserved as written (₹2,500) with its unit flagged. Not converted", status: "open", answer: "" },
  { id: "FD-07", ref: "Not in SOW", question: "Point value (₹ per point) per programme", treatment: "The mock wallet service uses a development conversion of 1 point = ₹1 for ₹ equivalents. The real value must come from the wallet service", status: "open", answer: "" },
  { id: "FD-08", ref: "SOW 5.4.1", question: "Does scan-time TDS apply to EP scheme / milestone points (at accrual or at settlement)?", treatment: "The Kitty split is applied to scan and Base Points credits only. EP scheme releases carry no Kitty deduction until confirmed", status: "open", answer: "" },
  { id: "FD-09", ref: "SOW 5.4.1", question: "The SOW compares 'total TDS deducted' with ₹20,000. Is the compared quantity the TDS or the value of benefits in the FY?", treatment: "Both quantities are shown on each FY record. The comparison uses the SOW wording (Kitty ₹ equivalent)", status: "open", answer: "" },
  { id: "FD-10", ref: "SOW 5.1", question: "Points expiry policy and the 'expiring soon' window", treatment: "Expiry dates come from the wallet service. The 30-day 'expiring soon' window is a display setting pending confirmation", status: "open", answer: "" },
  { id: "FD-11", ref: "SOW 5.4", question: "DD TDS treatment and DD redemption rules", treatment: "DD shows Not configured. No TDS or redemption is calculated for DD", status: "open", answer: "" },
];

/* ---------------- Service contracts (no endpoints invented) ---------------- */
export const WALLET_SERVICES: { service: string; responsibility: string; idempotency: string; status: string }[] = [
  { service: "Wallet service", responsibility: "Wallet record per member; programme architecture", idempotency: "memberId", status: "Mock (browser)" },
  { service: "Wallet balance service", responsibility: "Atomic balance with session; last-known balance; ~2 s refresh (SOW 5.1.1)", idempotency: "Read-only", status: "Mock; live refresh not connected" },
  { service: "Ledger service", responsibility: "Append-only ledger lines; immutable history", idempotency: "Operation key per posting", status: "Mock (browser)" },
  { service: "Points adjustment service", responsibility: "Single and bulk manual adjustments after approval", idempotency: "ADJ / batch id", status: "Mock (browser)" },
  { service: "Points transfer service", responsibility: "Atomic debit + credit under one transfer reference", idempotency: "Transfer id", status: "Mock (browser)" },
  { service: "Reversal service", responsibility: "Sales return, invalid claim and wrong-credit reversals linked to the original line", idempotency: "Reversal id + original line", status: "Mock (browser)" },
  { service: "Redemption service", responsibility: "Redemption creation, eligibility, limits, cancellation", idempotency: "Redemption id", status: "Mock (browser)" },
  { service: "Payout / payment adapter", responsibility: "DBT / UPI payout, callbacks, UTR", idempotency: "Redemption id + attempt", status: "Not connected (mock callbacks)" },
  { service: "Voucher service adapter", responsibility: "Voucher issue and recovery", idempotency: "Voucher reference", status: "Not connected (mock)" },
  { service: "Gift redemption adapter", responsibility: "Backend gift redemption, paid and FOC", idempotency: "Gift redemption id", status: "Not connected (mock)" },
  { service: "TDS calculation adapter", responsibility: "Scan-time provisional TDS; redemption TDS by PAN and slab", idempotency: "Source transaction", status: "Mock for EP scan-time only; redemption slab blocked (OP-TDS1)" },
  { service: "TDS reconciliation service", responsibility: "FY-end Kitty reconciliation; refund or TDS paid", idempotency: "memberId + FY", status: "Mock refund only; above-threshold blocked (OP-TDS1)" },
  { service: "GST eligibility service", responsibility: "GSTIN status from SFDC; gate and override", idempotency: "memberId", status: "Not connected (OP-RET1)" },
  { service: "Scheme settlement adapter", responsibility: "Phase 6 settlement release to the wallet", idempotency: "Settlement id", status: "Phase 6 mock settlement" },
  { service: "EMI financing adapter", responsibility: "EMI point burn and external reference", idempotency: "Instalment reference", status: "Blocked (OP-FIN1)" },
  { service: "Financial reconciliation service", responsibility: "Ten reconciliation views and exceptions", idempotency: "Reconciliation id", status: "Mock (browser)" },
  { service: "Approval engine adapter", responsibility: "Central Maker-Checker (Phase 3)", idempotency: "Approval request id + version", status: "In-browser approval engine" },
  { service: "Notification service", responsibility: "Financial events to portal / member channels", idempotency: "Event id", status: "Mock: recorded only, nothing sent" },
  { service: "Audit service", responsibility: "Append-only financial audit events", idempotency: "Event id", status: "Mock (browser)" },
  { service: "Reporting / export service", responsibility: "Wallet, TDS, 26Q, passbook and settlement reports", idempotency: "Report parameters", status: "CSV from the mock store; not statutory output" },
];

/** Phase 7 permissions requested by the brief, mapped to catalogue keys. */
export const FIN_PERMISSIONS: { label: string; key: string; note?: string }[] = [
  { label: "Wallet view", key: "wallet:view" },
  { label: "Wallet export", key: "wallet:export" },
  { label: "Ledger view", key: "points-ledger:view" },
  { label: "Points adjustment create", key: "points-adjustment:create" },
  { label: "Points adjustment approve", key: "points-adjustment:approve", note: "Checker profile" },
  { label: "Points transfer create", key: "points-transfer:create" },
  { label: "Points transfer approve", key: "points-transfer:approve", note: "Checker profile" },
  { label: "Reversal create", key: "points-reversal:create" },
  { label: "Reversal approve", key: "points-reversal:approve", note: "Checker profile" },
  { label: "Settlement view", key: "scheme-settlement:view" },
  { label: "Settlement initiate", key: "scheme-settlement:create" },
  { label: "Settlement approve stage 1", key: "scheme-settlement:approve", note: "WF-015 stage 1: V-Guard Client Admin role" },
  { label: "Settlement approve stage 2", key: "scheme-settlement:approve", note: "WF-015 stage 2: Finance role" },
  { label: "Redemption view", key: "redemption:view" },
  { label: "Redemption cancel", key: "redemption:cancel", note: "Evolve Operations only (SOW 10.5)" },
  { label: "Voucher recovery", key: "redemption:recover" },
  { label: "Backend gift redemption", key: "gift-redemption:create" },
  { label: "GST gate view", key: "gst-gate:view" },
  { label: "GST override create", key: "gst-gate:create" },
  { label: "GST override approve", key: "gst-gate:approve", note: "Checker profile" },
  { label: "TDS report view", key: "tds:view" },
  { label: "TDS report export", key: "tds:export" },
  { label: "TDS configuration", key: "tds:edit" },
  { label: "Redemption limit view", key: "redemption-limits:view" },
  { label: "Redemption limit edit", key: "redemption-limits:edit" },
  { label: "Financial reconciliation view", key: "fin-reconciliation:view" },
  { label: "Financial reconciliation manage", key: "fin-reconciliation:manage" },
  { label: "EMI monitoring", key: "emi:view" },
  { label: "Sensitive financial data view", key: "wallet:view_sensitive" },
];

export const fy = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
export const quarterOf = (iso: string) => {
  const m = Number(iso.slice(5, 7));
  return m >= 4 && m <= 6 ? "Q1" : m >= 7 && m <= 9 ? "Q2" : m >= 10 ? "Q3" : "Q4";
};
