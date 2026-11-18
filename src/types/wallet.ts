/**
 * Wallet, points, TDS, redemption and financial-operations models (Phase 7, SOW Module 5 and 10.5).
 *
 * The authoritative wallet, ledger, tax and payout systems are backend services. In this build they
 * are represented by a MOCK wallet service (features/wallet/mockService.ts) running in the browser.
 * Every record carries a stable identifier, its source reference and audit fields. Display values
 * and names are never keys.
 */
import type { ProgrammeCode } from "./members";

/* ======================= Ledger ======================= */

export type LedgerType =
  | "scan_credit"
  | "base_credit"
  | "scheme_accrual"
  | "settlement_release"
  | "welcome_bonus"
  | "other_bonus"
  | "manual_add"
  | "manual_deduct"
  | "sales_return_reversal"
  | "invalid_claim_reversal"
  | "wrong_credit_reversal"
  | "transfer_debit"
  | "transfer_credit"
  | "redemption_debit"
  | "redemption_reversal"
  | "tds_kitty_deduction"
  | "tds_kitty_refund"
  | "tds_paid"
  | "gst_lock"
  | "gst_unlock"
  | "expiry"
  | "emi_burn"
  | "other_adjustment";

/**
 * Wallet buckets. Each maps to a wallet-service state; balances are sums of ledger lines per bucket.
 *  available        redeemable (subject to KYC, restrictions, GST gate and reserve)
 *  pending          credited by the scan service but not yet validated
 *  scheme_unsettled scheme / milestone points awaiting settlement (SOW 5.2)
 *  tds_kitty        EP/IMP scan-time TDS held until FY reconciliation (SOW 5.4.1)
 *  tds_paid         kitty points moved to TDS Paid after an above-threshold FY outcome
 *  gst_locked       Retailer Base Points locked by the GST gate (SOW 5.5)
 *  redeemed         points consumed by redemptions
 *  expired          points that expired
 */
export type Bucket = "available" | "pending" | "scheme_unsettled" | "tds_kitty" | "tds_paid" | "gst_locked" | "redeemed" | "expired";

export type LedgerStatus = "completed" | "pending" | "reversed" | "failed";
export type LedgerSource = "scan" | "scheme" | "settlement" | "bonus" | "manual" | "reversal" | "transfer" | "redemption" | "tds" | "gst" | "expiry" | "emi";

export interface LedgerEntry {
  /** Unique financial transaction identifier. */
  id: string;
  /** Business reference (scan, adjustment, transfer, redemption, settlement...). Linked lines share it. */
  ref: string;
  /** Idempotency key of the operation that posted the line. */
  opKey: string;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  at: string;
  type: LedgerType;
  bucket: Bucket;
  /** Signed effect on the bucket: positive credit, negative debit. */
  points: number;
  /** Gross points earned before the EP/IMP kitty split (scan credits only). */
  gross?: number;
  source: LedgerSource;
  channel: "scan" | "manual_adjustment" | "system" | "redemption" | "scheme";
  status: LedgerStatus;
  schemeId?: string | null;
  schemeVersion?: number | null;
  campaignId?: string | null;
  categoryId?: string | null;
  skuCode?: string | null;
  /** Original line this one reverses or corrects. */
  originalId?: string | null;
  /** Line that later reversed this one. */
  reversalId?: string | null;
  settlementRef?: string | null;
  approvalRequestId?: string | null;
  initiatedBy: string;
  approvedBy?: string[];
  remarks: string;
  /** Lot expiry date supplied by the wallet service (expiry policy itself is not configured here). */
  expiresOn?: string | null;
  /** seed: development dataset · mock_service: posted by the mock wallet service · scheme_module: read from Phase 6. */
  origin: "seed" | "mock_service" | "scheme_module";
}

/* ======================= Wallet ======================= */

export interface WalletRecord {
  memberId: string;
  programme: ProgrammeCode;
  createdAt: string;
  updatedAt: string;
  /** EP/IMP only: PAN status used by the scan-time provisional TDS (supplied by KYC). */
  status: "active" | "frozen" | "not_created";
}

export interface WalletBalances {
  lifetime: number;
  available: number;
  redeemed: number;
  scheme: number;
  pending: number;
  tdsKitty: number;
  tdsPaid: number;
  gstLocked: number;
  expired: number;
  /** TDS deducted, by model: points for the EP/IMP kitty model, ₹ for redemption-time TDS. */
  tdsDeductedPoints: number;
  tdsDeductedInr: number;
}

/** What the wallet service returned last. A failed refresh never replaces a good snapshot with zero. */
export interface BalanceSnapshot {
  memberId: string;
  balances: WalletBalances;
  retrievedAt: string;
  reconciledAt: string;
  source: "live";
}

export type ServiceMode = "available" | "unavailable" | "timeout";

export interface BalanceView {
  state: "live" | "last_known" | "none";
  balances: WalletBalances | null;
  retrievedAt: string | null;
  reconciledAt: string | null;
  message: string;
}

/* ======================= Manual adjustments (AF04) ======================= */

export type OpStatus = "draft" | "pending_approval" | "approved" | "rejected" | "returned" | "withdrawn" | "executing" | "completed" | "failed" | "business_confirmation_required";

export interface PointsAdjustment {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  direction: "add" | "deduct";
  category: "base" | "scheme";
  points: number;
  reasonCode: string;
  remarks: string;
  approvalCode: string;
  evidence: string[];
  batchId: string | null;
  opKey: string;
  status: OpStatus;
  approvalRequestId: string | null;
  ledgerIds: string[];
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  failure: string | null;
}

export interface BatchRow {
  row: number;
  memberId: string;
  programme: string;
  category: string;
  direction: string;
  points: string;
  reasonCode: string;
  remarks: string;
  errors: string[];
  duplicateOf: number | null;
  result: "valid" | "invalid" | "duplicate" | "completed" | "failed" | "not_executed";
  ledgerIds: string[];
  message: string;
}

export interface AdjustmentBatch {
  id: string;
  fileName: string;
  policy: "atomic" | "row_level";
  rows: BatchRow[];
  approvalCode: string;
  remarks: string;
  status: OpStatus;
  approvalRequestId: string | null;
  opKey: string;
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
}

/* ======================= Reversals ======================= */

export type ReversalType = "sales_return" | "invalid_claim" | "wrong_credit";

export interface PointsReversal {
  id: string;
  originalLedgerId: string;
  memberId: string;
  programme: ProgrammeCode;
  sourceRef: string;
  originalPoints: number;
  points: number;
  type: ReversalType;
  reasonCode: string;
  comment: string;
  evidence: string[];
  opKey: string;
  status: OpStatus;
  approvalRequestId: string | null;
  ledgerIds: string[];
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  failure: string | null;
}

/* ======================= Transfers ======================= */

export interface PointsTransfer {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  programme: ProgrammeCode;
  points: number;
  reasonCode: string;
  comment: string;
  evidence: string[];
  opKey: string;
  status: OpStatus;
  approvalRequestId: string | null;
  ledgerIds: string[];
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  failure: string | null;
}

/* ======================= Redemption ======================= */

export type RedemptionMethod = "dbt" | "upi" | "voucher" | "vguard_com" | "product" | "emi";
/** SOW 5.7 tracking status. */
export type RedemptionTrack = "pass" | "in_process" | "fail";
export type RedemptionStage =
  | "blocked"
  | "manual_validation"
  | "mail_approval"
  | "processing"
  | "payout_initiated"
  | "paid"
  | "delivered"
  | "failed"
  | "reversal_pending"
  | "reversed"
  | "cancellation_pending"
  | "cancelled";

export interface RedemptionTds {
  model: "kitty_at_scan" | "on_redemption" | "not_configured";
  /** calculated: from the tax adapter · recorded: legacy record · bcr: slab not confirmed (OP-TDS1) · not_applicable. */
  status: "recorded" | "bcr" | "not_applicable";
  panStatus: "verified" | "not_verified" | "unknown";
  panSource: string;
  ratePct: number | null;
  amountInr: number | null;
}

export interface RedemptionRequest {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  method: RedemptionMethod;
  points: number;
  /** ₹ value supplied by the wallet service. */
  grossInr: number;
  tds: RedemptionTds;
  netInr: number | null;
  createdAt: string;
  updatedAt: string;
  stage: RedemptionStage;
  track: RedemptionTrack;
  blockedReasons: string[];
  manualValidation: { required: boolean; reason: string; callCentreRef: string | null; outcome: "pending" | "cleared" | "rejected" | null };
  fraudCheck: "passed" | "flagged" | "pending";
  utr: string | null;
  externalRef: string | null;
  provider: string | null;
  debitLedgerId: string | null;
  reversalLedgerId: string | null;
  voucher?: { provider: string; codeMasked: string; issuedAt: string; expiresOn: string; delivery: "delivered" | "pending" | "failed"; recovery: "none" | "requested" | "recovered" | "refused" };
  product?: { item: string; catalogueRef: string; fulfilment: "ordered" | "dispatched" | "delivered" | "returned"; delivery: "pending" | "in_transit" | "delivered" | "failed" };
  emi?: { loanRef: string; instalmentRef: string; financingRef: string | null };
  origin: "legacy_record" | "mock_service";
}

export interface PayoutRecord {
  id: string;
  redemptionId: string;
  provider: string;
  amountInr: number;
  initiatedAt: string;
  status: "initiated" | "success" | "failed" | "in_process";
  utr: string | null;
  failureReason: string | null;
  reconciliation: "matched" | "missing_utr" | "unmatched_external" | "amount_mismatch" | "pending";
  callbacks: { id: string; at: string; status: "success" | "failed"; utr: string | null; duplicate: boolean }[];
}

export interface VoucherRecovery {
  id: string;
  redemptionId: string;
  memberId: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  outcome: "recovered" | "refused" | "pending";
  message: string;
  opKey: string;
}

export interface RedemptionCancellation {
  id: string;
  redemptionId: string;
  reason: string;
  eligibility: { ok: boolean; checks: { label: string; ok: boolean; detail: string }[] };
  status: OpStatus;
  approvalRequestId: string | null;
  reversalLedgerId: string | null;
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  failure: string | null;
}

export interface GiftRedemption {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  item: string;
  catalogueRef: string;
  quantity: number;
  pointsPerUnit: number;
  foc: boolean;
  reason: string;
  remarks: string;
  evidence: string[];
  batchId: string | null;
  opKey: string;
  status: OpStatus;
  approvalRequestId: string | null;
  ledgerIds: string[];
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  failure: string | null;
}

export interface GiftBatchRecord {
  id: string;
  fileName: string;
  giftIds: string[];
  rows: { row: number; memberId: string; catalogueRef: string; quantity: string; foc: string; errors: string[]; result: "valid" | "invalid" | "duplicate" | "completed" | "failed" | "not_executed" }[];
  status: OpStatus;
  createdBy: string;
  createdAt: string;
}

/* ======================= Policies and limits (AF22/AF23) ======================= */

export type PolicyValueStatus = "sow_value" | "confirmed" | "business_confirmation_required" | "not_applicable";

export interface PolicyValue {
  value: number | null;
  unit: "inr" | "points" | "count";
  status: PolicyValueStatus;
  note: string;
}

export interface RedemptionLimitPolicy {
  id: string;
  programmes: ProgrammeCode[];
  memberType: string;
  method: RedemptionMethod | "all" | "dbt_upi";
  geography: string;
  minTotalPoints: PolicyValue;
  minBalance: PolicyValue;
  minRedemptionInr: PolicyValue;
  singleRedemptionInr: PolicyValue;
  dailyValueInr: PolicyValue;
  monthlyValueInr: PolicyValue;
  dailyCount: PolicyValue;
  monthlyCount: PolicyValue;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "pending_approval" | "draft" | "inactive";
  version: number;
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface RetailerReserve {
  id: string;
  memberId: string | null;
  reserveInr: number;
  reason: string;
  effectiveFrom: string;
  status: "active" | "pending_approval" | "superseded";
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}

/* ======================= TDS ======================= */

export interface TdsFyReconciliation {
  id: string;
  memberId: string;
  fy: string;
  kittyPoints: number;
  kittyInr: number;
  thresholdInr: number;
  outcome: "refund_kitty" | "tds_paid_bcr" | "pending";
  calculation: "ready" | "business_confirmation_required";
  slabRef: string | null;
  status: OpStatus;
  approvalRequestId: string | null;
  ledgerIds: string[];
  createdAt: string;
  executedAt: string | null;
  failure: string | null;
}

/* ======================= GST gate (SOW 5.5) ======================= */

export interface GstRecord {
  memberId: string;
  gstinMasked: string | null;
  verification: "verified" | "not_verified" | "pending" | "missing";
  source: "sfdc" | "retailer_app" | "not_captured";
  writeBack: "not_required" | "pending" | "not_connected";
  lastVerifiedAt: string | null;
  updatedAt: string;
  /** Administrative unlock: recorded separately, never turns the GSTIN into a verified one. */
  override: { requestId: string; approvedAt: string; until: string | null; reason: string } | null;
}

export interface GstOverrideRequest {
  id: string;
  memberId: string;
  gstStatus: GstRecord["verification"];
  currentGate: string;
  requested: "unlock_until" | "unlock_permanent_until_verified";
  until: string | null;
  reasonCode: string;
  remarks: string;
  evidence: string[];
  status: OpStatus;
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
}

/* ======================= EMI (SOW 5.6) ======================= */

export interface EmiBurn {
  id: string;
  memberId: string;
  loanRef: string;
  instalmentRef: string;
  points: number;
  ledgerId: string | null;
  financingRef: string | null;
  at: string;
  status: "success" | "failed" | "reversed" | "pending";
  reconciliation: "matched" | "unmatched" | "pending";
}

/* ======================= Reconciliation and governance ======================= */

export type ReconType = "wallet_ledger" | "redemption_payout" | "payout_utr" | "adjustment_approval" | "transfer_pair" | "settlement_release" | "kitty_fy" | "tds_paid" | "failed_redemption_reversal" | "emi_reference";

export interface FinancialException {
  id: string;
  reconType: ReconType;
  ref: string;
  memberId: string | null;
  expected: number;
  actual: number;
  detail: string;
  owner: string;
  status: "open" | "investigating" | "resolved_by_correction" | "accepted";
  resolutionRef: string | null;
  raisedAt: string;
  updatedAt: string;
}

export interface FinDecision {
  id: string;
  ref: string;
  question: string;
  treatment: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
}

export interface FinAuditEvent {
  id: string;
  at: string;
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  before: string | null;
  after: string | null;
  reason: string;
  approvalRequestId: string | null;
}

export interface FinNotification {
  id: string;
  at: string;
  event: string;
  ref: string;
  memberId: string | null;
  message: string;
  channels: ("portal" | "member_app" | "sms" | "email")[];
  delivery: "mock_recorded";
}

export interface WalletConfig {
  /** Development conversion the mock wallet service uses for ₹ equivalents (OP-PV: not confirmed). */
  pointValueInr: number;
  expiringSoonDays: number;
  ep: { panRatePct: number; noPanRatePct: number; fyThresholdInr: number; slabConfigured: boolean };
  gst: { thresholdInr: number; exceptionCategories: string[] };
  retailerReserveDefaultInr: number;
  batchPolicy: "atomic" | "row_level";
  autoReversal: { windowHours: number | null; status: PolicyValueStatus };
  emi: { partner: string | null; enabled: boolean };
}

export interface WalletState {
  wallets: WalletRecord[];
  ledger: LedgerEntry[];
  snapshots: Record<string, BalanceSnapshot>;
  service: { mode: ServiceMode; lastReconciledAt: string };
  adjustments: PointsAdjustment[];
  batches: AdjustmentBatch[];
  reversals: PointsReversal[];
  transfers: PointsTransfer[];
  redemptions: RedemptionRequest[];
  payouts: PayoutRecord[];
  recoveries: VoucherRecovery[];
  cancellations: RedemptionCancellation[];
  gifts: GiftRedemption[];
  giftBatches: GiftBatchRecord[];
  policies: RedemptionLimitPolicy[];
  reserves: RetailerReserve[];
  tdsFy: TdsFyReconciliation[];
  gst: GstRecord[];
  gstOverrides: GstOverrideRequest[];
  emi: EmiBurn[];
  exceptions: FinancialException[];
  decisions: FinDecision[];
  notifications: FinNotification[];
  audit: FinAuditEvent[];
  config: WalletConfig;
  seq: number;
}
