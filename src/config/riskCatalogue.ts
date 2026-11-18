/**
 * Fraud & risk configuration (Phase 10). Labels, the case state machine, SOW-defined constants and
 * the open decision register. Values the SOW does not define are never added here.
 */
import type { AlertKind, CaseStatus, DetectionSource, FraudVector, IdentifierType, MismatchKind, RecommendationAction, RiskDecision, Severity } from "@/types/risk";

export const VECTOR: Record<FraudVector, { label: string; short: string; sow: string }> = {
  duplicate_identity: { label: "Duplicate identity", short: "Duplicate", sow: "9.1 Duplicate accounts" },
  device_farming: { label: "Device farming", short: "Device", sow: "9.1 / 9.2 Device farming" },
  scan_rate: { label: "Scan-rate anomaly", short: "Rate", sow: "9.1 Bot / automated scanning, 9.3" },
  redemption_abuse: { label: "Redemption abuse", short: "Redemption", sow: "9.1 Redemption abuse" },
  geo_velocity: { label: "Geo-velocity", short: "Geo-velocity", sow: "9.1 Geo-velocity" },
  geo_fence: { label: "Scan geo-fence", short: "Geo-fence", sow: "9.1 Scan geo-fencing (Retailer, CS)" },
  store_geo_pending: { label: "Store geo-validation pending", short: "Store geo", sow: "9.1 Store geo-validation (Retailer, DD, CS)" },
  cross_programme_kyc: { label: "Cross-programme KYC misuse", short: "KYC", sow: "9.1 Cross-programme KYC" },
  branch_leakage: { label: "Branch leakage", short: "Branch", sow: "9.1 Branch leakage" },
  duplicate_qr: { label: "Duplicate QR", short: "Dup QR", sow: "9.4 Duplicate QR" },
  tampered_qr: { label: "Tampered QR", short: "Tampered", sow: "9.4 Tampered / suspicious QR" },
  data_integrity: { label: "Data integrity", short: "Data", sow: "9.5 Data integrity" },
};
export const SOURCE: Record<DetectionSource, string> = { rule: "Rule-based", predictive: "Predictive", system_validation: "System validation" };
export const SEVERITY: Record<Severity, { label: string; tone: "neutral" | "warning" | "negative" }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "warning" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "negative" },
};

export const CASE_STATUS: Record<CaseStatus, string> = {
  new: "New",
  pending_assignment: "Pending assignment",
  assigned: "Assigned",
  under_investigation: "Under investigation",
  awaiting_evidence: "Awaiting evidence",
  awaiting_external: "Awaiting external confirmation",
  escalated: "Escalated",
  cleared: "Cleared",
  confirmed_misuse: "Confirmed misuse",
  restriction_recommended: "Restriction recommended",
  restriction_applied: "Restriction applied",
  reinstatement_requested: "Reinstatement requested",
  closed: "Closed",
};
/**
 * Allowed manual transitions. Restriction applied and Reinstatement requested are set only by the
 * Member Management / device workflows; Assigned only by assignment; Closed needs a recorded decision.
 */
export const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  new: ["pending_assignment"],
  pending_assignment: [],
  assigned: ["under_investigation"],
  under_investigation: ["awaiting_evidence", "awaiting_external", "escalated", "cleared", "confirmed_misuse", "restriction_recommended"],
  awaiting_evidence: ["under_investigation"],
  awaiting_external: ["under_investigation"],
  escalated: ["under_investigation", "cleared", "confirmed_misuse", "restriction_recommended"],
  cleared: ["closed"],
  confirmed_misuse: ["restriction_recommended", "closed"],
  restriction_recommended: ["under_investigation", "closed"],
  restriction_applied: ["closed"],
  reinstatement_requested: ["closed"],
  closed: [],
};
export const OPEN_CASE: CaseStatus[] = ["new", "pending_assignment", "assigned", "under_investigation", "awaiting_evidence", "awaiting_external", "escalated", "restriction_recommended", "restriction_applied", "reinstatement_requested", "confirmed_misuse"];

export const RECOMMENDATION: Record<RecommendationAction, { label: string; applies: string }> = {
  redemption_block: { label: "Redemption restriction", applies: "Not a separate status in the Member Management block model: confirm under OP-BLK1, or apply a Program Block / Temporary Hold" },
  scan_block: { label: "Scan restriction", applies: "Not a separate status in the Member Management block model: confirm under OP-BLK1, or apply a Program Block / Temporary Hold" },
  program_block: { label: "Program Block", applies: "Applied in Member Management (Member management: Disable); one programme only" },
  temporary_hold: { label: "Temporary Hold", applies: "Applied in Member Management (Member management: Temporary hold); every linked membership" },
  device_block: { label: "Device block", applies: "Device block request, approved through the Approval Engine" },
  monitor: { label: "No restriction · continue monitoring", applies: "No restriction is applied" },
};

export const IDENTIFIER: Record<IdentifierType, { label: string; timing: string; method: "realtime" | "nightly_batch" | "device_capture" }> = {
  mobile: { label: "Mobile number", timing: "Real time, across all programmes", method: "realtime" },
  aadhaar: { label: "Aadhaar", timing: "Nightly batch at midnight", method: "nightly_batch" },
  pan: { label: "PAN", timing: "Nightly batch at midnight", method: "nightly_batch" },
  bank: { label: "Bank account number", timing: "Nightly batch at midnight", method: "nightly_batch" },
  device: { label: "Device ID", timing: "Captured and flagged for device governance", method: "device_capture" },
};

export const MISMATCH: Record<MismatchKind, string> = {
  district_mismatch: "District mismatch",
  branch_mismatch: "Branch mismatch",
  pincode_mismatch: "Pincode mismatch",
  missing_district: "Missing district",
  missing_branch: "Missing branch",
  invalid_parent: "Invalid parent mapping",
  duplicate_source: "Duplicate source mapping",
  stale_reference: "Stale hierarchy reference",
};

export const ALERT: Record<AlertKind, string> = {
  redemption_blocked: "Redemption blocked by a risk rule",
  high_priority_case: "New high-priority fraud case",
  device_farming: "Device farming detected",
  scan_rate: "Scan-rate threshold exceeded",
  geo_velocity: "Geo-velocity flag",
  duplicate_identity: "Duplicate identity detected",
  tampered_qr: "Tampered QR investigation created",
  branch_leakage: "Branch leakage detected",
  sfdc_reconciliation: "SFDC reconciliation exception",
  mandatory_field_failure: "Mandatory-field synchronisation failure",
  case_escalated: "Risk case escalated",
  device_blocked: "Device blocked",
  device_released: "Device released",
  member_reinstated: "Member reinstated",
};

/** SOW-defined constants (Module 9). Nothing here is a business assumption. */
export const SOW = {
  geoFenceMetres: 100,
  geoFenceProgrammes: ["Retailer", "CS"] as const,
  storeGeoProgrammes: ["Retailer", "DD", "CS"] as const,
  storeGeoMaxScans: 5,
  geoVelocityExample: { km: 500, minutes: 120, text: "SOW example: more than 500 km in under 2 hours" },
  kycRetentionYears: 7,
};

export const RISK_DECISIONS: RiskDecision[] = [
  { id: "OP-02", ref: "OP-02", question: "Rule-plus-predictive approach versus a custom AI / ML model; the daily, weekly and monthly thresholds for Scan-In, Scan-Out and redemption", impacted: "Anomaly rule configuration, scan-rate controls, predictive monitoring", owner: "V-Guard programme / risk team", restriction: "Thresholds stay draft or approved-inactive; nothing activates until confirmed. Predictive results are simulated; no model is claimed", status: "open", answer: "" },
  { id: "OP-QR1", ref: "OP-QR1", question: "Tampered-QR escalation workflow, PIN-sharing responsibility and the daily duplicate-QR digest to Service Engineers", impacted: "Tampered QR investigation, PIN-sharing responsibility, duplicate-QR digest", owner: "V-Guard service team", restriction: "Responsibility fields are recorded but not adjudicated; the digest stays inactive", status: "open", answer: "" },
  { id: "OP-64", ref: "OP-64 / OP-20", question: "Ownership of SFDC / platform district and branch corrections, reconciliation cadence, cleanup owner and SFDC mandatory name validation", impacted: "SFDC hierarchy reconciliation, data validation", owner: "V-Guard IT (SFDC) and Evolve", restriction: "Neither source is overwritten; a mismatch closes only after the owning system's correction is confirmed", status: "open", answer: "" },
  { id: "OP-BLK1", ref: "OP-BLK1", question: "Program Block and Temporary Hold reinstatement SOP; whether scan-only or redemption-only restrictions exist", impacted: "Restriction recommendations, reinstatement", owner: "V-Guard HO", restriction: "Only Program Block and Temporary Hold are applied (Member Management); scan-only / redemption-only recommendations are recorded, not applied", status: "open", answer: "" },
  { id: "OP-DEV1", ref: "OP-DEV1", question: "Module 3 device governance policy: what constitutes device farming and who authorises device blocks", impacted: "Device farming review, device block / release", owner: "V-Guard / Evolve security", restriction: "No account or device count is treated as fraud; blocks need an impact review and approval", status: "open", answer: "" },
  { id: "OP-GEO1", ref: "OP-GEO1", question: "Geo-validation ownership: GPS accuracy threshold, geo-fence override authority and SFDC store geo-validation integration", impacted: "Scan geo-fencing, store geo-validation gate", owner: "V-Guard IT (SFDC)", restriction: "The backend's verdict is displayed; no accuracy threshold is set in the portal", status: "open", answer: "" },
  { id: "RK-SLA", ref: "RK-SLA", question: "Investigation SLA (when a case counts as overdue)", impacted: "Overdue investigations KPI", owner: "V-Guard risk team", restriction: "Not configured: no case is reported overdue", status: "open", answer: "" },
];
