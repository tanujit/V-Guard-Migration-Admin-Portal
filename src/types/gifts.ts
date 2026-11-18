/**
 * Gift catalogue, voucher, physical fulfilment and insurance-card models (Phase 9, SOW Module 8 and
 * 10.8 AF20). Partners, voucher providers, tracking APIs and insurers are MOCK adapters in this build.
 * Voucher codes and insurance numbers are never primary keys and are stored masked; development
 * values are labelled as such.
 */
import type { ProgrammeCode } from "./members";

export type GiftType = "voucher" | "physical" | "vguard_com";
export type Availability = "available" | "out_of_stock" | "unavailable" | "unknown";
export type CatalogueStatus = "draft" | "pending_approval" | "active" | "inactive" | "rejected";

export interface Segmentation {
  programmes: ProgrammeCode[];
  states: string[];
  districts: string[];
  branches: string[];
  tiers: string[];
}

export interface GiftItem {
  id: string;
  code: string;
  name: string;
  type: GiftType;
  categoryId: string;
  description: string;
  terms: string;
  partnerId: string | null;
  /** Phase 4 Product & SKU master reference, where the gift maps to a V-Guard SKU. */
  productSkuId: string | null;
  voucher?: { denomination: number | null; validityNote: string; productRef: string };
  physical?: { imageRef: string | null; delivery: string };
  vguard?: { catalogueRef: string; arrangement: string };
  availability: Availability;
  inventory: { reference: string | null; quantity: number | null; source: "inventory_service" | "not_supplied"; syncedAt: string | null };
  segmentation: Segmentation;
  channels: { influencerApp: boolean; retailerApp: boolean; microsite: boolean };
  status: CatalogueStatus;
  version: number;
  history: { version: number; at: string; by: string; change: string; approvalRequestId: string | null }[];
  approvalRequestId: string | null;
  effectiveFrom: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  publishedAt: string | null;
  /** Pending change to a live item: the live version stays visible until this is approved. */
  draft: GiftItemDraft | null;
}
export type GiftItemDraft = Omit<GiftItem, "draft" | "history"> & { reason: string };

export interface PointCostRule {
  id: string;
  giftId: string;
  programme: ProgrammeCode | null;
  memberType: string | null;
  states: string[];
  tiers: string[];
  points: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "draft" | "pending_approval" | "active" | "superseded" | "rejected";
  approvalRequestId: string | null;
  replaces: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface GiftCategory {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  updatedAt: string;
  updatedBy: string;
}

export interface FulfilmentPartner {
  id: string;
  code: string;
  name: string;
  type: GiftType;
  supportedTypes: GiftType[];
  description: string;
  contactRef: string;
  integrationRef: string;
  status: "active" | "inactive";
  integration: { connection: "mock" | "not_connected"; lastSuccess: string | null; lastFailure: string | null; sync: "ok" | "failed" | "never"; errorSummary: string | null; lastFulfilmentRef: string | null };
  updatedAt: string;
  updatedBy: string;
}

export interface SkuMapping {
  id: string;
  giftId: string;
  productSkuId: string | null;
  partnerId: string;
  partnerSku: string;
  partnerProductRef: string;
  availabilityMapping: "partner_stock" | "always_available_on_partner" | "manual";
  status: "active" | "inactive";
  updatedAt: string;
  updatedBy: string;
}

/* ======================= Vouchers ======================= */

export type VoucherStatus = "available" | "reserved" | "issued" | "used" | "expired" | "replaced";
export type DeliveryState = "pending" | "delivered" | "failed" | "not_applicable";

export interface VoucherRecord {
  id: string;
  partnerId: string;
  giftId: string;
  partnerSku: string;
  value: number;
  /** Masked display only. The code itself stays with the provider (vault reference). */
  codeMasked: string;
  vaultRef: string;
  status: VoucherStatus;
  memberId: string | null;
  redemptionRef: string | null;
  ledgerRef: string | null;
  issuedAt: string | null;
  expiresOn: string | null;
  usedAt: string | null;
  delivery: { whatsapp: DeliveryState; inapp: DeliveryState; commId: string | null };
  providerRef: string | null;
  recoverable: boolean;
  /** Provider callback IDs already applied (duplicate callbacks are ignored). */
  callbackIds: string[];
  origin: "provider_inventory_mock" | "phase7_redemption" | "backend_gift" | "recovery_reissue";
}

export type RecoveryOutcome = "open" | "code_retrieved" | "reissued" | "failed" | "provider_review" | "expired" | "not_recoverable" | "rejected";

export interface VoucherRecoveryRequest {
  id: string;
  voucherId: string;
  memberId: string;
  reason: string;
  remarks: string;
  evidence: string[];
  status: "pending_approval" | "approved" | "completed" | "rejected";
  outcome: RecoveryOutcome;
  outcomeDetail: string;
  reissuedVoucherId: string | null;
  approvalRequestId: string | null;
  commId: string | null;
  requestedBy: string;
  requestedAt: string;
  events: { at: string; event: string; detail: string }[];
}

/* ======================= Physical fulfilment ======================= */

export type DeliveryMilestone = "placed" | "dispatched" | "out_for_delivery" | "delivered";
export type OrderStatus = "awaiting_address" | DeliveryMilestone | "exception";

export interface AddressSnapshot {
  version: number;
  recipient: string;
  line: string;
  district: string;
  state: string;
  pincode: string;
  contactMasked: string;
  source: string;
  capturedAt: string;
}

export interface TrackingEvent {
  id: string;
  partnerStatus: string;
  milestone: DeliveryMilestone | null;
  at: string;
  source: "partner_adapter" | "order_service";
  partnerRef: string | null;
  remarks: string;
  duplicate: boolean;
  accepted: boolean;
}

export interface GiftOrder {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  giftId: string;
  productSkuId: string | null;
  quantity: number;
  points: number;
  foc: boolean;
  redemptionRef: string;
  ledgerRef: string | null;
  partnerId: string | null;
  partnerOrderRef: string | null;
  shipmentRef: string | null;
  address: AddressSnapshot;
  /** Earlier address versions used by this order, oldest first (never overwritten). */
  addressHistory: AddressSnapshot[];
  addressChanges: { at: string; version: number; detail: string }[];
  addressConfirmation: { status: "pending" | "confirmed" | "change_requested" | "failed" | "reconfirmation_required"; method: string | null; reference: string | null; at: string | null; simulated: boolean };
  status: OrderStatus;
  tracking: TrackingEvent[];
  exceptions: { id: string; kind: "address_issue" | "failed_delivery" | "partner_update_missing" | "not_dispatched" | "tracking_unavailable" | "returned" | "unmapped_status"; detail: string; at: string; remarks: string[]; issueRef: string | null; open: boolean }[];
  refundRef: string | null;
  createdAt: string;
  updatedAt: string;
  origin: "phase7_redemption" | "backend_gift" | "mock_order";
}

/* ======================= Insurance cards ======================= */

export interface InsuranceCardType {
  id: string;
  name: string;
  insurer: string;
  segmentation: Segmentation;
  /** AF20: on / off without an app release, per programme. */
  enabled: Record<"EP" | "ST" | "CS", boolean>;
  status: "active" | "inactive";
  updatedAt: string;
  updatedBy: string;
}

export interface InsuranceCard {
  id: string;
  typeId: string;
  memberId: string;
  programme: "EP" | "ST" | "CS";
  /** SOW CSV fields. */
  name: string;
  numberMasked: string;
  numberKey: string;
  qualification: string;
  tollFree: string;
  amount: number;
  validFrom: string;
  validTo: string;
  insurer: string;
  region: string;
  tier: string | null;
  active: boolean;
  publication: { status: "unpublished" | "pending_approval" | "published"; ref: string | null; at: string | null; approvalRequestId: string | null };
  batchId: string | null;
  createdAt: string;
  history: { at: string; by: string; action: string; detail: string }[];
}

export interface InsuranceRow {
  row: number;
  values: Record<string, string>;
  errors: { field: string; value: string; message: string }[];
  warnings: string[];
  result: "valid" | "invalid" | "duplicate" | "imported" | "rejected" | "skipped" | "failed";
  cardId: string | null;
}

export interface InsuranceBatch {
  id: string;
  fileName: string;
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  policy: "atomic" | "row_level";
  rows: InsuranceRow[];
  status: "validated" | "pending_approval" | "approved" | "completed" | "rejected" | "failed";
  approvalRequestId: string | null;
  approvedBy: string | null;
  completedAt: string | null;
}

export interface RenderConfig {
  formats: { jpeg: boolean; pdf: boolean };
  productionFormat: "jpeg" | "pdf" | "both" | null;
  watermark: { text: string | null; position: "diagonal" | "bottom" | "corner" | null; opacity: number | null; perProgramme: boolean; status: "development_setting" | "confirmed" | "not_set" };
}

export interface InsurancePublication {
  id: string;
  cardIds: string[];
  status: "pending_approval" | "published" | "rejected";
  approvalRequestId: string | null;
  requestedBy: string;
  requestedAt: string;
  publishedAt: string | null;
}

export interface TestDownload {
  id: string;
  cardId: string;
  format: "jpeg" | "pdf";
  at: string;
  by: string;
  watermark: string;
}

/* ======================= Fulfilment issues and backend batches ======================= */

export interface FulfilmentIssue {
  id: string;
  redemptionRef: string;
  memberId: string;
  giftId: string;
  kind: "voucher_unavailable" | "partner_inactive" | "provider_invalid_response" | "delivery_failed" | "order_failed";
  detail: string;
  at: string;
  status: "open" | "refund_requested" | "resolved";
  pointsDeducted: number;
  ledgerRef: string | null;
  refundRef: string | null;
  remarks: { at: string; by: string; text: string }[];
}

export interface BackendGiftBatch {
  id: string;
  fileName: string;
  hash: string;
  rows: { row: number; memberId: string; giftId: string; quantity: string; foc: string; result: "valid" | "invalid" | "duplicate"; message: string; giftRedemptionId: string | null }[];
  createdBy: string;
  createdAt: string;
}

/* ======================= Governance ======================= */

export interface GiftDecision {
  id: string;
  ref: string;
  question: string;
  module: string;
  owner: string;
  restriction: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
}

export interface GiftAuditEvent {
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
  partnerRef: string | null;
}

export interface GiftState {
  categories: GiftCategory[];
  items: GiftItem[];
  costs: PointCostRule[];
  partners: FulfilmentPartner[];
  mappings: SkuMapping[];
  vouchers: VoucherRecord[];
  recoveries: VoucherRecoveryRequest[];
  orders: GiftOrder[];
  cardTypes: InsuranceCardType[];
  cards: InsuranceCard[];
  batches: InsuranceBatch[];
  render: RenderConfig;
  publications: InsurancePublication[];
  downloads: TestDownload[];
  config: {
    addressMethod: string | null;
    trackingPartner: string | null;
    insuranceNumberRule: "unique_per_insurer" | "unique_global";
    insuranceRuleStatus: "development_setting" | "confirmed";
    /** Insurance upload processing policy (development setting under OP-INS1). */
    insurancePolicy: "atomic" | "row_level";
    /** Catalogue publication and point-cost changes go through the Approval Engine. */
    catalogueApproval: boolean;
    /** Development tier references per member: the tier service does not expose member tiers yet. */
    tierAssignments: Record<string, string>;
    sowFulfilmentTarget: string;
  };
  issues: FulfilmentIssue[];
  giftBatches: BackendGiftBatch[];
  /** Backend gift redemptions (Phase 7) already turned into fulfilment, keyed by redemption ID. */
  fulfilled: string[];
  decisions: GiftDecision[];
  audit: GiftAuditEvent[];
  seq: number;
}
