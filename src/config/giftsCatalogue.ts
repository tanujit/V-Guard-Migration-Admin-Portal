/**
 * Gift & Fulfilment and Insurance Card configuration (Phase 9). Labels, CSV templates and the open
 * decision register. Development data: no partner, insurer or provider named here is connected.
 */
import type { Availability, DeliveryMilestone, GiftDecision, GiftType, OrderStatus, RecoveryOutcome, VoucherStatus } from "@/types/gifts";

export const GIFT_TYPE: Record<GiftType, { label: string; short: string; note: string }> = {
  voucher: { label: "Digital voucher", short: "Voucher", note: "E-code issued by the voucher partner and delivered by WhatsApp / in-app (SOW 8.2)" },
  physical: { label: "Physical product", short: "Physical", note: "Shipped by the fulfilment partner after address confirmation (SOW 8.3)" },
  vguard_com: { label: "V-Guard.com merchandise", short: "V-Guard.com", note: "Fulfilled through the V-Guard.com arrangement (SOW 8.1)" },
};

export const AVAILABILITY: Record<Availability, { label: string; tone: "positive" | "warning" | "negative" | "neutral" }> = {
  available: { label: "Available", tone: "positive" },
  out_of_stock: { label: "Out of stock", tone: "warning" },
  unavailable: { label: "Unavailable", tone: "negative" },
  unknown: { label: "Not supplied", tone: "neutral" },
};

/** SOW 8.3 milestones, in order. These are the tracking adapter's service contract, not partner codes. */
export const MILESTONES: { id: DeliveryMilestone; label: string }[] = [
  { id: "placed", label: "Placed" },
  { id: "dispatched", label: "Dispatched" },
  { id: "out_for_delivery", label: "Out for Delivery" },
  { id: "delivered", label: "Delivered" },
];
export const ORDER_STATUS: Record<OrderStatus, string> = { awaiting_address: "Awaiting address confirmation", placed: "Placed", dispatched: "Dispatched", out_for_delivery: "Out for Delivery", delivered: "Delivered", exception: "Exception" };

export const VOUCHER_STATUS: Record<VoucherStatus, { label: string; implementation?: boolean }> = {
  available: { label: "Available", implementation: true },
  reserved: { label: "Reserved", implementation: true },
  issued: { label: "Issued" },
  used: { label: "Used" },
  expired: { label: "Expired" },
  replaced: { label: "Replaced by reissue", implementation: true },
};

export const RECOVERY_OUTCOME: Record<RecoveryOutcome, string> = {
  open: "Awaiting approval",
  code_retrieved: "Code retrieved",
  reissued: "Reissue successful",
  failed: "Recovery failed",
  provider_review: "Provider review required",
  expired: "Voucher expired",
  not_recoverable: "Not recoverable",
  rejected: "Rejected by Checker",
};
export const RECOVERY_REASONS = [
  { code: "VRC-LOST", label: "Member lost or deleted the code" },
  { code: "VRC-NOT-RECEIVED", label: "Code not received" },
  { code: "VRC-PROVIDER", label: "Provider issue reported by member" },
];

export const EXCEPTION_KIND: Record<string, string> = {
  address_issue: "Address issue",
  failed_delivery: "Failed delivery",
  partner_update_missing: "Partner update missing",
  not_dispatched: "Order not dispatched",
  tracking_unavailable: "Tracking unavailable",
  returned: "Returned delivery",
  unmapped_status: "Partner status not in the tracking contract",
};

export const SOW_TARGETS = {
  voucher: "Voucher delivery target under 30 seconds (SOW 8.2 operational target, not a guarantee of the mock or future integration)",
  physical: "Approximately 2–3 days depending on the item and partner (SOW 8.3 indicative target, not an SLA)",
};

/**
 * Backend gift redemption CSV. Same header as Phase 7 (the engine is reused); catalogue_ref now takes
 * a Gift Catalogue item ID.
 */
export const BACKEND_GIFT_CSV_HEADER = ["member_id", "catalogue_ref", "quantity", "foc", "reason_code", "remarks"];

/**
 * Insurance card CSV. The seven SOW 8.4 fields keep their SOW names. member_id and card_type are the
 * implementation's mapping references (to confirm against the approved contract, OP-INS1).
 */
export const INSURANCE_CSV_FIELDS: { name: string; sow: boolean; required: boolean; description: string }[] = [
  { name: "member_id", sow: false, required: true, description: "Implementation mapping: Rishta member ID (EP, ST or CS)" },
  { name: "card_type", sow: false, required: true, description: "Implementation mapping: insurance card type ID configured in the portal" },
  { name: "Name", sow: true, required: true, description: "Insured name as printed on the card" },
  { name: "Number", sow: true, required: true, description: "Insurance number. No format is assumed; masked after upload" },
  { name: "Qualification", sow: true, required: false, description: "Qualification field (mandatory or optional to confirm, OP-INS1)" },
  { name: "Toll-Free Number", sow: true, required: false, description: "Insurer toll-free number: digits, spaces, + and - only (mandatory or optional to confirm, OP-INS1)" },
  { name: "Insurance Amount", sow: true, required: true, description: "Insured amount in rupees: a positive number. No limit is assumed" },
  { name: "Validity Dates", sow: true, required: true, description: "Development convention: YYYY-MM-DD to YYYY-MM-DD (to confirm, OP-INS1)" },
  { name: "Insurer Name", sow: true, required: true, description: "Insurer name" },
];
export const INSURANCE_CSV_HEADER = INSURANCE_CSV_FIELDS.map((f) => f.name);
export const INSURANCE_PROGRAMMES = ["EP", "ST", "CS"] as const;

export const GIFT_DECISIONS: GiftDecision[] = [
  { id: "OP-GIFT1", ref: "OP-GIFT1", question: "Physical gift address confirmation method (OTP or another method) and the delivery-tracking API / partner", module: "Physical fulfilment", owner: "V-Guard programme team", restriction: "Verification method is configurable and blank by default; no OTP or tracking partner is assumed. Dispatch stays blocked until an address is confirmed", status: "open", answer: "" },
  { id: "OP-INS1", ref: "OP-INS1", question: "Final insurance-card fields, JPEG / PDF download requirement, bulk-upload approval authority and watermark rules", module: "Insurance cards", owner: "V-Guard HR / insurance desk", restriction: "Both JPEG and PDF are prepared; the production format stays Business Confirmation Required. Watermark text, position and opacity are development settings only", status: "open", answer: "" },
  { id: "GD-03", ref: "GD-03", question: "Insurance number uniqueness rule (per insurer or across all insurers)", module: "Insurance cards", owner: "V-Guard insurance desk", restriction: "Development setting: unique per insurer. Changing it re-validates new uploads only", status: "open", answer: "" },
  { id: "GD-04", ref: "GD-04", question: "Point-cost precedence when two rules match the same member", module: "Gift catalogue", owner: "V-Guard programme team", restriction: "No precedence is invented: an ambiguous match blocks redemption of that item for the member", status: "open", answer: "" },
  { id: "GD-05", ref: "GD-05", question: "Voucher provider reissue support (does the provider issue a replacement or only re-send the code?)", module: "Voucher operations", owner: "Voucher partner", restriction: "The mock adapter re-sends the existing code. A reissue never creates a second active voucher for the same redemption", status: "open", answer: "" },
  { id: "GD-06", ref: "GD-06", question: "Insurance cards for Retailer and DD", module: "Insurance cards", owner: "V-Guard programme team", restriction: "Insurance cards are limited to EP, ST and CS (SOW 8.4)", status: "out_of_scope", answer: "Not in the current SOW" },
];
