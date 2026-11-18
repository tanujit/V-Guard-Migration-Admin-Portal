/**
 * Integration operations and system monitoring models (Phase 11, SOW Module 11 and 10.11).
 * The portal monitors; integrations execute in backend services. Records here are either derived from
 * the authoritative modules (members, wallet, KYC, comms, gifts, risk, masters, schemes) or produced
 * by mock telemetry adapters, and every simulated value is labelled as such.
 */
import type { ProgrammeCode } from "./members";

export type Direction = "both" | "in" | "out";
export type HealthStatus = "healthy" | "degraded" | "failed" | "delayed" | "disconnected" | "not_configured" | "bcr" | "unknown";
export type ErrorCategory = "timeout" | "http_5xx" | "validation" | "dependency" | "database" | "provider_rejected" | "not_found";

export interface Integration {
  id: string;
  code: string;
  name: string;
  category: string;
  source: string;
  target: string;
  direction: Direction;
  purpose: string;
  dataTypes: string[];
  frequency: string;
  frequencyStatus: "sow" | "business_confirmation_required";
  sowRef: string;
  environment: "development";
  connection: "mock_adapter" | "placeholder";
  authType: string | null;
  contractRef: string | null;
  contractStatus: "business_confirmation_required" | "confirmed";
  credentialRef: string | null;
  ownership: { business: string | null; technical: string | null; data: string | null };
  dataOwnership: string;
  failureHandling: string;
  retryPolicy: string | null;
  monitoring: "mock_telemetry" | "not_configured";
  decisions: string[];
  /** Approved configuration values (for example the SFDC invitation target frequency). */
  config: Record<string, string | null>;
}

/** One request / message exchanged with an external system (monitoring record). */
export interface IntegrationRequest {
  id: string;
  integrationId: string;
  operation: string;
  messageType: "member" | "scheme" | "scan" | "redemption" | "ticket" | "kyc" | "communication" | "location" | "logistics" | "hierarchy";
  businessRef: string;
  memberId: string | null;
  at: string;
  respondedAt: string | null;
  status: "success" | "failed" | "timeout" | "pending";
  httpStatus: number | null;
  durationMs: number | null;
  errorCategory: ErrorCategory | null;
  error: string | null;
  retryCount: number;
  traceId: string;
  /** Masked metadata only; raw payloads are never stored in the portal. */
  payload: Record<string, string | number | null>;
  sensitivePayload: boolean;
  source: string;
  financial: boolean;
}

export interface SfdcRecord {
  id: string;
  externalRef: string;
  recordType: "st_invitation" | "cs_invitation" | "retailer" | "dd";
  programme: ProgrammeCode;
  memberId: string | null;
  receivedAt: string;
  batchId: string;
  validation: "valid" | "missing_mandatory" | "conflict" | "duplicate";
  processing: "synced" | "pending" | "failed" | "held";
  callbackId: string | null;
  error: string | null;
}
export interface SfdcCallback {
  id: string;
  memberRef: string;
  kind: "registration_result" | "status_update" | "gst_certificate";
  result: string;
  reasonCode: string | null;
  messageRef: string;
  submittedAt: string;
  respondedAt: string | null;
  delivery: "acknowledged" | "pending" | "failed";
  retries: { at: string; outcome: "acknowledged" | "failed" }[];
  lastError: string | null;
  owner: string | null;
  approval: string | null;
}
export interface SyncBatch {
  id: string;
  integrationId: string;
  kind: "invitation_sync" | "hierarchy_sync";
  startedAt: string;
  completedAt: string | null;
  total: number;
  succeeded: number;
  failed: number;
  rejected: number;
  retried: number;
  status: "completed" | "partial" | "failed" | "missed" | "delayed";
  source: string;
}

export interface EsealLookup {
  id: string;
  requestId: string;
  qrMasked: string;
  scanRef: string;
  memberId: string | null;
  skuId: string;
  eseal: { sku: string; category: string; subCategory: string; points: number | null; pinRequired: boolean | null; billedDate: string | null; manufacturingDate: string | null; stockOut: boolean; parentSku: string | null } | null;
  platform: { sku: string | null; category: string | null; subCategory: string | null; points: number | null };
  effectiveDate: string | null;
  dateReason: string;
  validation: "valid" | "mismatch" | "failed";
}
export interface PackMapping {
  id: string;
  parentSku: string;
  childSku: string;
  ref: string;
  source: string;
  lastReceived: string;
  status: "received" | "missing_child" | "source_unconfirmed";
  lastValidation: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  startedAt: string | null;
  completedAt: string | null;
  scheduledFor: string;
  received: number;
  processed: number;
  failed: number;
  skipped: number;
  status: "success" | "failed" | "running" | "missed" | "delayed";
  error: string | null;
  retries: string[];
}
export interface Job {
  id: string;
  name: string;
  integrationId: string;
  type: "scheduled" | "polling" | "callback_processing" | "batch";
  frequency: string;
  frequencyStatus: "sow" | "business_confirmation_required";
  source: string;
  runs: JobRun[];
}
export interface QueueSnapshot {
  id: string;
  alias: string;
  integrationId: string;
  pending: number;
  processing: number;
  lagSeconds: number;
  oldestAgeSeconds: number;
  deadLetter: number | null;
  ratePerMin: number;
  consumer: "healthy" | "degraded" | "unknown";
  at: string;
  series: { at: string; pending: number; lagSeconds: number }[];
}

export interface RetryRequest {
  id: string;
  scope: "request" | "job_run" | "callback";
  targetId: string;
  integrationId: string;
  idempotencyKey: string;
  requestedBy: string;
  at: string;
  reason: string;
  status: "accepted" | "completed" | "failed" | "refused_duplicate" | "refused_financial";
  result: string;
}

export type ExceptionKind = "member_not_synced" | "mobile_already_registered" | "mobile_mismatch" | "pan_gst_in_use" | "other_programme" | "blank_name" | "duplicate_bank";
export interface IntegrationException {
  id: string;
  kind: ExceptionKind;
  externalRef: string | null;
  memberId: string | null;
  programme: ProgrammeCode | null;
  detectedAt: string;
  detail: Record<string, string | null>;
  callbackStatus: "sent" | "pending" | "failed" | "not_applicable";
  status: "open" | "awaiting_source" | "resolved";
  decisionRef: string | null;
  sourceRef: string;
}

export type AlertType = "sync_missed" | "sync_delayed" | "api_failure" | "repeated_timeout" | "callback_failure" | "wallet_delay" | "bot_notification_failed" | "queue_backlog" | "provider_unavailable" | "reconciliation_difference" | "repeated_record_failure" | "db_error" | "api_5xx" | "high_latency" | "infra_utilisation" | "float_low" | "job_failed" | "crash_spike" | "login_failure_spike";
export interface OpsAlert {
  id: string;
  type: AlertType;
  integrationId: string | null;
  service: string | null;
  trigger: string;
  detectedAt: string;
  expected: string;
  actual: string;
  triggerValue: string | null;
  threshold: string | null;
  severity: "low" | "medium" | "high" | "critical" | null;
  owner: string | null;
  status: "created" | "assigned" | "acknowledged" | "investigating" | "escalated" | "resolved" | "closed";
  escalation: number;
  incidentId: string | null;
  traceRef: string | null;
  commId: string | null;
  history: { at: string; by: string; status: OpsAlert["status"]; remarks: string }[];
  resolution: { at: string; by: string; remarks: string } | null;
}
export interface MonitoringRule {
  id: string;
  integrationId: string;
  expectedFrequency: string | null;
  window: string | null;
  failureCondition: string | null;
  delayCondition: string | null;
  severity: OpsAlert["severity"];
  escalationGroup: string | null;
  channel: "in_portal" | "email" | null;
  active: boolean;
  status: "business_confirmation_required" | "confirmed";
}

export interface ServiceHealth {
  id: string;
  name: string;
  group: string;
  contract: string;
  series: { at: string; requests: number; failures: number; avgMs: number; p95Ms: number }[];
  errors: Partial<Record<ErrorCategory, number>>;
  lastSuccess: string | null;
  dependencies: { name: string; status: HealthStatus }[];
  failures: { id: string; correlationId: string; at: string; durationMs: number; http: number | null; category: ErrorCategory; dependency: string | null; stackRef: string | null; retries: number; resolution: "open" | "resolved"; memberId: string | null }[];
}

export interface CrashRecord {
  id: string;
  app: string;
  version: string;
  module: string;
  deviceModel: string;
  os: string;
  kind: "crash" | "non_fatal";
  errorType: string;
  message: string;
  stackRef: string;
  stack: string;
  count: number;
  affectedDevices: number;
  firstSeen: string;
  lastSeen: string;
  reproduce: string;
  status: "new" | "investigating" | "resolved";
  relatedFailures: string[];
  incidentId: string | null;
}

export interface MetricSeries {
  key: "cpu" | "memory" | "disk" | "net_in" | "net_out" | "db_pool" | "queue_lag";
  label: string;
  unit: string;
  source: string;
  points: { at: string; v: number }[];
}
export interface ChangeEvent {
  id: string;
  kind: "deployment" | "configuration" | "schema" | "feature_flag" | "vendor_outage";
  at: string;
  title: string;
  ref: string;
  detail: string;
  by: string | null;
  before: string | null;
  after: string | null;
  services: string[];
  endAt: string | null;
}
export interface FeatureFlag {
  key: string;
  state: boolean;
  changedBy: string;
  changedAt: string;
  ref: string;
}
export interface Incident {
  id: string;
  title: string;
  status: "open" | "assigned" | "investigating" | "monitoring" | "resolved" | "closed";
  owner: string | null;
  severity: "low" | "medium" | "high" | "critical" | null;
  window: { from: string; to: string };
  services: string[];
  traces: string[];
  changes: string[];
  alerts: string[];
  notes: { at: string; by: string; text: string }[];
  history: { at: string; by: string; status: Incident["status"]; remarks: string }[];
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuthEvent {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  at: string;
  result: "success" | "failure";
  reason: "wrong_mpin" | "blocked_user" | "device_blacklisted" | null;
  appVersion: string;
  deviceModel: string;
  os: string;
  deviceId: string | null;
  deviceStatus: "active" | "blocked" | "unknown";
  sessionRef: string | null;
}

export interface FloatSnapshot {
  date: string;
  opening: number;
  incoming: number;
  payouts: number;
  closing: number;
  reconciliation: "matched" | "difference" | "pending";
  ref: string;
}

export interface OpsDecision {
  id: string;
  ref: string;
  question: string;
  integration: string;
  businessOwner: string;
  technicalOwner: string;
  restriction: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
}

export interface OpsAuditEvent {
  id: string;
  at: string;
  actor: string;
  orgId: string | null;
  role: string;
  module: string;
  action: string;
  entity: string;
  before: string | null;
  after: string | null;
  reason: string;
  relatedRef: string | null;
}

export interface OpsState {
  integrations: Integration[];
  requests: IntegrationRequest[];
  sfdcRecords: SfdcRecord[];
  callbacks: SfdcCallback[];
  batches: SyncBatch[];
  eseal: EsealLookup[];
  packs: PackMapping[];
  jobs: Job[];
  queues: QueueSnapshot[];
  retries: RetryRequest[];
  exceptions: IntegrationException[];
  alerts: OpsAlert[];
  rules: MonitoringRule[];
  services: ServiceHealth[];
  crashes: CrashRecord[];
  metrics: MetricSeries[];
  autoscaling: { id: string; at: string; action: "scale_out" | "scale_in"; from: number; to: number; reason: string }[];
  changes: ChangeEvent[];
  flags: FeatureFlag[];
  incidents: Incident[];
  auth: AuthEvent[];
  float: { snapshots: FloatSnapshot[]; source: string; lowThreshold: number | null; thresholdStatus: "business_confirmation_required" | "development_setting" | "confirmed"; recipients: string[] };
  config: { dormancyDays: number | null; dormancyStatus: "business_confirmation_required" | "development_setting" | "confirmed"; rejectionCodes: { code: string; label: string; status: "sow_example" | "configured" }[] };
  pendingConfig: { id: string; integrationId: string; key: string; value: string; approvalRequestId: string | null; status: "pending_approval" | "applied" | "rejected"; requestedBy: string; at: string }[];
  decisions: OpsDecision[];
  audit: OpsAuditEvent[];
}
