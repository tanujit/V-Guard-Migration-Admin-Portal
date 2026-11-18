import type { KycCheckKey, RegistrationStatusKey, StatusDefinition } from "@/types/domain";

/**
 * Status vocabularies. Labels are configurable and must be aligned with the confirmed
 * V-Guard workflows; each programme picks the subset that applies to it.
 */
export const REGISTRATION_STATUSES: StatusDefinition<RegistrationStatusKey>[] = [
  { key: "submitted", label: "Submitted", tone: "neutral", description: "Registration received, not yet picked up" },
  { key: "pending_verification", label: "Pending verification", tone: "info", description: "Awaiting identity or document verification" },
  { key: "pending_kyc", label: "Pending KYC", tone: "warning", description: "Member must complete KYC before approval" },
  { key: "under_review", label: "Under review", tone: "info", description: "With an operations reviewer" },
  { key: "approved", label: "Approved", tone: "positive" },
  { key: "rejected", label: "Rejected", tone: "negative" },
  { key: "blocked", label: "Blocked", tone: "negative", description: "Blocked by an authorised action" },
  { key: "inactive", label: "Inactive", tone: "neutral", description: "No qualifying activity in the inactivity window" },
];

export const PENDING_STATUSES: RegistrationStatusKey[] = ["submitted", "pending_verification", "pending_kyc", "under_review"];

export const KYC_CHECKS: { key: KycCheckKey; label: string; note?: string }[] = [
  { key: "aadhaar", label: "Aadhaar" },
  { key: "pan", label: "PAN" },
  { key: "pan_aadhaar_link", label: "PAN operative status", note: "Operative when PAN is linked with Aadhaar" },
  { key: "bank", label: "Bank account" },
  { key: "gst", label: "GST" },
];

export const KYC_OUTCOMES: StatusDefinition<"verified" | "pending" | "failed" | "not_submitted">[] = [
  { key: "verified", label: "Verified", tone: "positive" },
  { key: "pending", label: "Pending", tone: "warning" },
  { key: "failed", label: "Failed", tone: "negative" },
  { key: "not_submitted", label: "Not yet submitted", tone: "neutral" },
];

export const REDEMPTION_STATUSES: StatusDefinition<"successful" | "pending" | "rejected" | "cancelled">[] = [
  { key: "successful", label: "Successful", tone: "positive" },
  { key: "pending", label: "Pending", tone: "warning" },
  { key: "rejected", label: "Rejected", tone: "negative" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
];

export const SCHEME_STATUSES: StatusDefinition<"draft" | "pending_approval" | "scheduled" | "active" | "completed" | "deactivated">[] = [
  { key: "draft", label: "Draft", tone: "neutral" },
  { key: "pending_approval", label: "Pending approval", tone: "warning" },
  { key: "scheduled", label: "Scheduled", tone: "info" },
  { key: "active", label: "Active", tone: "positive" },
  { key: "completed", label: "Completed", tone: "neutral" },
  { key: "deactivated", label: "Deactivated", tone: "negative" },
];

export const FULFILMENT_STATUSES: StatusDefinition<"pending" | "dispatched" | "delivered" | "failed">[] = [
  { key: "pending", label: "Pending fulfilment", tone: "warning" },
  { key: "dispatched", label: "Dispatched", tone: "info" },
  { key: "delivered", label: "Delivered", tone: "positive" },
  { key: "failed", label: "Delivery failed", tone: "negative" },
];

export const REFERRAL_STATUSES: StatusDefinition<"successful" | "pending" | "rejected">[] = [
  { key: "successful", label: "Successful", tone: "positive" },
  { key: "pending", label: "Pending", tone: "warning" },
  { key: "rejected", label: "Rejected", tone: "negative" },
];

export const CASE_STATUSES: StatusDefinition<"new" | "under_review" | "escalated" | "resolved" | "dismissed">[] = [
  { key: "new", label: "New", tone: "info" },
  { key: "under_review", label: "Under review", tone: "warning" },
  { key: "escalated", label: "Escalated", tone: "negative" },
  { key: "resolved", label: "Resolved", tone: "positive" },
  { key: "dismissed", label: "Dismissed", tone: "neutral" },
];

export const PRIORITIES: StatusDefinition<"critical" | "high" | "medium" | "low">[] = [
  { key: "critical", label: "Critical", tone: "negative" },
  { key: "high", label: "High", tone: "warning" },
  { key: "medium", label: "Medium", tone: "info" },
  { key: "low", label: "Low", tone: "neutral" },
];

export const AGEING_BUCKETS = ["0–2 days", "3–7 days", "8–15 days", "16–30 days", "Over 30 days"] as const;

export function statusLabel<K extends string>(defs: StatusDefinition<K>[], key: K): string {
  return defs.find((d) => d.key === key)?.label ?? key;
}
