/**
 * Fraud, risk, device governance, data integrity and compliance models (Phase 10, SOW Module 9,
 * 3.2 and 10.x AF02 / AF09 / AF10 / AF12 / AF21).
 *
 * Detection, flag, investigation, restriction and final decision are separate records. Detection
 * outputs (scores, severities, distances, forecasts) are only ever what the source service supplied:
 * the portal never computes them. Sensitive identifiers are stored masked.
 */
import type { ProgrammeCode } from "./members";

export type FraudVector =
  | "duplicate_identity"
  | "device_farming"
  | "scan_rate"
  | "redemption_abuse"
  | "geo_velocity"
  | "geo_fence"
  | "store_geo_pending"
  | "cross_programme_kyc"
  | "branch_leakage"
  | "duplicate_qr"
  | "tampered_qr"
  | "data_integrity";
export type DetectionSource = "rule" | "predictive" | "system_validation";
export type Severity = "low" | "medium" | "high" | "critical";

export interface RiskLinks {
  memberIds: string[];
  deviceIds: string[];
  qrRefs: string[];
  scanRefs: string[];
  redemptionRefs: string[];
  ledgerRefs: string[];
}

/** One detection delivered by a backend detection service (mock adapters in this build). */
export interface RiskEvent {
  id: string;
  /** Stable reference from the detection service; a redelivered signal with the same key is a duplicate. */
  sourceKey: string;
  vector: FraudVector;
  source: DetectionSource;
  serviceRef: string;
  memberId: string | null;
  programme: ProgrammeCode | null;
  branchCode: string | null;
  detectedAt: string;
  context: string;
  /** Raw detection output as supplied by the service. */
  signal: Record<string, string | number | null>;
  score: number | null;
  severity: Severity | null;
  /** Backend-supplied priority; null when the service does not prioritise. */
  priority: number | null;
  ruleRef: string | null;
  modelRef: string | null;
  links: RiskLinks;
  status: "new" | "in_case" | "cleared" | "confirmed";
  caseId: string | null;
  receivedCount: number;
  alertRef: string | null;
  simulated: boolean;
}

export type CaseStatus =
  | "new"
  | "pending_assignment"
  | "assigned"
  | "under_investigation"
  | "awaiting_evidence"
  | "awaiting_external"
  | "escalated"
  | "cleared"
  | "confirmed_misuse"
  | "restriction_recommended"
  | "restriction_applied"
  | "reinstatement_requested"
  | "closed";

export type RecommendationAction = "redemption_block" | "scan_block" | "program_block" | "temporary_hold" | "device_block" | "monitor";

export interface InvestigationNote {
  id: string;
  at: string;
  by: string;
  orgId: string | null;
  text: string;
  eventId: string | null;
  visibility: "internal" | "shared_with_vguard";
}
export interface Evidence {
  id: string;
  kind: "scan" | "qr" | "device" | "login_location" | "transaction" | "rule_output" | "attachment";
  ref: string;
  description: string;
  sensitive: boolean;
  addedBy: string;
  addedAt: string;
}
export interface Recommendation {
  id: string;
  action: RecommendationAction;
  targetId: string;
  reason: string;
  by: string;
  at: string;
  status: "recommended" | "applied" | "declined" | "not_supported";
  appliedRef: string | null;
  appliedBy: string | null;
}

export interface RiskCase {
  id: string;
  title: string;
  vector: FraudVector;
  eventIds: string[];
  links: RiskLinks;
  ownerId: string | null;
  priority: "p1" | "p2" | "p3" | "p4" | null;
  status: CaseStatus;
  notes: InvestigationNote[];
  evidence: Evidence[];
  recommendations: Recommendation[];
  decision: { outcome: "cleared" | "confirmed_misuse" | "no_action"; by: string; at: string; remarks: string } | null;
  history: { at: string; by: string; from: CaseStatus | null; to: CaseStatus; remarks: string }[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/* ======================= Identity ======================= */

export type IdentifierType = "mobile" | "aadhaar" | "pan" | "bank" | "device";
export interface IdentityMatch {
  id: string;
  matchKey: string;
  identifier: IdentifierType;
  masked: string;
  originalMemberId: string;
  matchingMemberId: string;
  programmes: ProgrammeCode[];
  method: "realtime" | "nightly_batch" | "device_capture";
  batchRef: string | null;
  detectedAt: string;
  status: "open" | "under_review" | "linked_identity" | "resolved_restricted" | "resolved_no_action";
  restrictionId: string | null;
  riskEventId: string | null;
}
export interface DedupBatch {
  id: string;
  runAt: string;
  identifiers: IdentifierType[];
  scanned: number;
  matches: number;
  status: "completed" | "failed";
}

/* ======================= Devices ======================= */

export interface DeviceLogin {
  id: string;
  memberId: string;
  at: string;
  lat: number | null;
  lng: number | null;
  location: string;
  sessionRef: string;
  appVersion: string | null;
  outcome: "success" | "profile_creation_rejected";
}
export interface DeviceAction {
  id: string;
  action: "block" | "release";
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approvalRequestId: string | null;
  status: "pending_approval" | "executed" | "rejected";
  executedAt: string | null;
  previous: "active" | "blocked";
  next: "active" | "blocked";
  impactReviewed: string[];
}
export interface Device {
  id: string;
  identifierMasked: string;
  imeiMasked: string;
  type: string;
  firstSeen: string;
  lastSeen: string;
  /** The single profile created on this device (one-profile-per-device rule, SOW 3.2). */
  createdProfile: string | null;
  associations: { memberId: string; kind: "created_profile" | "login"; firstAt: string; lastAt: string }[];
  logins: DeviceLogin[];
  status: "active" | "blocked";
  investigation: "none" | "under_review" | "cleared" | "confirmed";
  actions: DeviceAction[];
}

/* ======================= Anomaly configuration ======================= */

export type RuleKind = "redemption" | "scan_in" | "scan_out";
export type Period = "hour" | "day" | "week" | "month";
export interface AnomalyRule {
  id: string;
  kind: RuleKind;
  name: string;
  programme: ProgrammeCode | null;
  memberType: string | null;
  categoryId: string | null;
  skuId: string | null;
  states: string[];
  unit: "scans" | "units" | "points" | "redemptions";
  limits: Record<Period, number | null>;
  effectiveFrom: string;
  effectiveTo: string | null;
  autoFlag: boolean;
  /** Development sample values are always labelled Demo configuration. */
  demo: boolean;
  status: "draft" | "pending_approval" | "approved_inactive" | "active" | "inactive" | "rejected" | "superseded";
  version: number;
  replaces: string | null;
  approvalRequestId: string | null;
  history: { at: string; by: string; action: string; detail: string; approvalRequestId: string | null }[];
  updatedBy: string;
  updatedAt: string;
}

export interface GlobalRestriction {
  id: string;
  type: "block_all_scan" | "redemption_block";
  programmes: ProgrammeCode[];
  triggerConditions: string;
  status: "inactive" | "pending_activation" | "active" | "pending_deactivation";
  reason: string;
  requestedBy: string | null;
  approvedBy: string | null;
  executedAt: string | null;
  approvalRequestId: string | null;
  history: { at: string; by: string; action: string; detail: string; approvalRequestId: string | null }[];
}

export interface PredictiveResult {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  expected: number;
  observed: number;
  deviation: string;
  window: string;
  detectedAt: string;
  modelRef: string;
  simulated: true;
  status: "flagged" | "in_review" | "cleared" | "confirmed";
  riskEventId: string | null;
}

/* ======================= Redemption risk and geography ======================= */

export interface RedemptionRiskBlock {
  id: string;
  redemptionRef: string;
  memberId: string;
  programme: ProgrammeCode;
  method: string;
  amountInr: number;
  points: number;
  trigger: string;
  providerResponse: string;
  detectedAt: string;
  source: DetectionSource;
  blockStatus: "blocked" | "lifted";
  warning: { alertRef: string | null; status: "sent" | "not_sent" };
  riskEventId: string | null;
  lift: { by: string; at: string; reason: string; approvalRef: string } | null;
}

export interface ScanPoint {
  scanRef: string;
  lat: number | null;
  lng: number | null;
  location: string;
  branchCode: string | null;
  at: string;
}
export interface GeoVelocityEvent {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  previous: ScanPoint;
  current: ScanPoint;
  /** As supplied by the geo-velocity service. */
  distanceKm: number | null;
  elapsedMin: number | null;
  rule: string;
  serviceRef: string;
  riskEventId: string | null;
}
export interface GeoFenceCheck {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  registered: { lat: number | null; lng: number | null; source: string };
  scan: ScanPoint;
  distanceM: number | null;
  accuracyM: number | null;
  result: "within" | "outside_blocked" | "gps_denied" | "low_accuracy";
  banner: string | null;
  override: { status: "none" | "approved"; ref: string | null; by: string | null; reason: string | null; at: string | null };
  riskEventId: string | null;
}
export interface StoreGeoRecord {
  memberId: string;
  programme: ProgrammeCode;
  storeRef: string;
  sfdcStatus: "validated" | "pending";
  scanCount: number;
  scansBlocked: number;
  redemptionAttempts: number;
  lastSync: string | null;
  validationRef: string | null;
}
export interface BranchLeakEvent {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  mappedBranch: string;
  mappedTerritory: string;
  scanBranch: string;
  scanRef: string;
  scanAt: string;
  detail: string;
  rule: string;
  mappingSource: string;
  reconciliationRef: string | null;
  riskEventId: string | null;
}

/* ======================= QR integrity ======================= */

export interface DuplicateQrEvent {
  id: string;
  qrRef: string;
  qrMasked: string;
  skuId: string | null;
  first: { memberId: string; programme: ProgrammeCode; branchCode: string; at: string };
  attempt: { memberId: string; programme: ProgrammeCode; branchCode: string; at: string };
  sameMember: boolean;
  memberMessage: string;
  rejectionRef: string;
  investigationStatus: "logged" | "under_review" | "closed";
  riskEventId: string | null;
}
export interface TamperedQrCase {
  id: string;
  qrRef: string;
  qrMasked: string;
  skuId: string | null;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  reason: string;
  at: string;
  evidence: Evidence[];
  remarks: { at: string; by: string; text: string }[];
  ownerId: string | null;
  status: "open" | "assigned" | "escalated" | "closed";
  pin: { status: "not_recorded" | "recorded"; party: string | null; owner: string | null; decision: string | null; remarks: string | null; decisionRef: string | null; ruleStatus: "business_confirmation_required" | "confirmed" };
  closure: { by: string; at: string; outcome: string } | null;
  riskEventId: string | null;
}
export interface QrDigest {
  id: string;
  date: string;
  duplicateCount: number;
  categories: string[];
  branches: string[];
  recipientGroup: string | null;
  dispatch: "not_dispatched" | "dispatched";
}

/* ======================= Data integrity and reconciliation ======================= */

export interface ValidationRule {
  id: string;
  entity: string;
  field: string;
  mandatory: boolean;
  ruleRef: string;
  source: string;
  errorCount: number;
  lastValidation: string | null;
  status: "active" | "inactive";
}
export interface ValidationException {
  id: string;
  entityType: string;
  entityId: string;
  source: string;
  field: string;
  valueMasked: string;
  errorType: "missing_mandatory" | "invalid_reference" | "duplicate_identity" | "sync_failed";
  message: string;
  detectedAt: string;
  batchId: string | null;
  status: "open" | "assigned" | "awaiting_source_fix" | "resolved";
  owner: string | null;
  remarks: { at: string; by: string; text: string }[];
  sourceFix: { ref: string; by: string; at: string } | null;
  reprocess: { at: string; outcome: "synced" | "still_failing" }[];
}
export interface ValidationBatch {
  id: string;
  at: string;
  source: string;
  total: number;
  synced: number;
  failed: number;
  status: "completed" | "partial" | "failed";
}

export type MismatchKind = "district_mismatch" | "branch_mismatch" | "pincode_mismatch" | "missing_district" | "missing_branch" | "invalid_parent" | "duplicate_source" | "stale_reference";
export interface HierarchyValues {
  state: string | null;
  district: string | null;
  branch: string | null;
  pincode: string | null;
  sourceRef: string | null;
}
export interface HierarchyMismatch {
  id: string;
  batchId: string;
  kind: MismatchKind;
  recordCode: string;
  sfdc: HierarchyValues;
  platform: HierarchyValues;
  conflictRef: string | null;
  proposedCorrection: string;
  owningSystem: "sfdc" | "platform" | null;
  responsibleTeam: string | null;
  confirmation: { ref: string; by: string; at: string } | null;
  status: "open" | "under_review" | "correction_proposed" | "awaiting_confirmation" | "reconciled";
  reprocess: { at: string; outcome: string } | null;
  history: { at: string; by: string; action: string; detail: string }[];
}
export interface ReconBatch {
  id: string;
  at: string;
  total: number;
  matchedDistricts: number;
  matchedBranches: number;
  mismatches: number;
  status: "completed";
  mock: true;
}

/* ======================= Compliance, alerts and governance ======================= */

export interface ComplianceEvidence {
  id: string;
  controlRef: string;
  area: "DPDP / data protection" | "Income Tax / 26Q" | "RBI / payouts" | "Audit trail" | "Fraud controls";
  description: string;
  sourceModule: string;
  link: string;
  lastUpdated: string;
  validation: "evidence_available" | "exception_open" | "not_connected";
  openException: string | null;
  owner: string;
}

export type AlertKind =
  | "redemption_blocked"
  | "high_priority_case"
  | "device_farming"
  | "scan_rate"
  | "geo_velocity"
  | "duplicate_identity"
  | "tampered_qr"
  | "branch_leakage"
  | "sfdc_reconciliation"
  | "mandatory_field_failure"
  | "case_escalated"
  | "device_blocked"
  | "device_released"
  | "member_reinstated";
export interface RiskAlert {
  id: string;
  kind: AlertKind;
  ref: string;
  title: string;
  recipients: string[];
  commId: string | null;
  at: string;
}

export interface RiskDecision {
  id: string;
  ref: string;
  question: string;
  impacted: string;
  owner: string;
  restriction: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
}

export interface RiskAuditEvent {
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

export interface RiskState {
  events: RiskEvent[];
  cases: RiskCase[];
  identityMatches: IdentityMatch[];
  dedupBatches: DedupBatch[];
  /** Identity-registry matches the next nightly batch will report (mock registry feed). */
  registryFeed: Omit<IdentityMatch, "id" | "status" | "restrictionId" | "riskEventId" | "batchRef" | "detectedAt">[];
  devices: Device[];
  rules: AnomalyRule[];
  globals: GlobalRestriction[];
  predictive: PredictiveResult[];
  redemptionBlocks: RedemptionRiskBlock[];
  geoVelocity: GeoVelocityEvent[];
  geoFence: GeoFenceCheck[];
  storeGeo: StoreGeoRecord[];
  leaks: BranchLeakEvent[];
  qrRegistry: Record<string, { memberId: string; at: string; skuId: string | null }>;
  duplicateQr: DuplicateQrEvent[];
  tampered: TamperedQrCase[];
  digest: { enabled: boolean; schedule: string | null; recipientGroup: string | null; status: "business_confirmation_required" | "confirmed"; previews: QrDigest[] };
  validationRules: ValidationRule[];
  validationExceptions: ValidationException[];
  validationBatches: ValidationBatch[];
  reconBatches: ReconBatch[];
  mismatches: HierarchyMismatch[];
  evidence: ComplianceEvidence[];
  alerts: RiskAlert[];
  config: { investigationSlaDays: number | null; alertRecipients: string[] };
  decisions: RiskDecision[];
  audit: RiskAuditEvent[];
}
