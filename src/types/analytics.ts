/**
 * Business analytics, reporting and KPI governance models (Phase 12, SOW Module 13).
 * Analytics never owns business data: every figure is read from the module that owns it (members,
 * wallet / ledger, schemes, risk, comms, gifts, masters, ops). The only records this module keeps are
 * the KPI dictionary, report definitions, executions, exports, schedules, threshold policies, alerts,
 * decisions and its audit — plus the mock scan-service adapter output, labelled as development data.
 */
import type { ProgrammeCode } from "./members";

export type ConfirmationStatus = "pending_business_confirmation" | "confirmed";
export type Freshness = "live" | "near_real_time" | "scheduled" | "historical_snapshot" | "stale" | "unavailable";

export interface KpiVersion {
  version: number;
  definition: string;
  formula: string;
  numerator: string | null;
  denominator: string | null;
  period: string;
  status: ConfirmationStatus;
  effectiveFrom: string | null;
  decisionRef: string | null;
  approvalRequestId: string | null;
  changedBy: string;
  changedAt: string;
  note: string;
}
export interface KpiDefinition {
  id: string;
  name: string;
  category: "engagement" | "points" | "financial" | "acquisition" | "retention" | "satisfaction" | "scanning" | "fraud";
  sowDefinition: string;
  sowRef: string;
  /** null until V-Guard confirms a definition (OP-KPI1). */
  approvedDefinition: string | null;
  formula: string;
  numerator: string | null;
  denominator: string | null;
  period: string;
  aggregation: string;
  programmes: ProgrammeCode[];
  sourceModule: string;
  sourceDataset: string;
  refresh: string;
  unit: "members" | "percent" | "ratio" | "inr" | "months" | "score";
  /** Target is kept apart from the formula and stays null until confirmed. */
  target: { value: number | null; direction: "min" | "max" | null; status: ConfirmationStatus; effectiveFrom: string | null; approvalRequestId: string | null };
  businessOwner: string | null;
  status: ConfirmationStatus;
  effectiveFrom: string | null;
  version: number;
  versions: KpiVersion[];
  calculable: "provisional" | "inputs_missing";
  inputsMissing: string | null;
  updatedBy: string;
  updatedAt: string;
}
export interface KpiChangeRequest {
  id: string;
  kpiId: string;
  kind: "definition" | "target";
  proposed: { definition?: string; formula?: string; targetValue?: number | null; targetDirection?: "min" | "max" | null; effectiveFrom: string };
  reason: string;
  requestedBy: string;
  at: string;
  approvalRequestId: string | null;
  status: "pending_approval" | "applied" | "rejected";
}

export type ScanType = "scan_in" | "scan_out";
export type ScanChannel = "app" | "web" | "pos";
/** One scan attempt as the (mock) scan service records it. */
export interface ScanRecord {
  id: string;
  claimId: string;
  qrMasked: string;
  memberId: string;
  programme: ProgrammeCode;
  scannedBy: string;
  skuCode: string;
  skuId: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  type: ScanType;
  at: string;
  branchCode: string;
  location: { lat: number | null; lng: number | null; label: string; source: string };
  salesperson: string | null;
  /** Channel exactly as recorded by the scan service; null is reported as Unmapped. */
  channel: ScanChannel | null;
  status: "success" | "failed" | "pending_validation";
  failureReason: string | null;
  points: number;
  ledgerRef: string | null;
  schemeRef: string | null;
  source: string;
}
export interface ParentChildLink {
  id: string;
  parentPack: string;
  parentSku: string;
  childUnit: string;
  childSku: string;
  childScanId: string | null;
  mappingSource: string;
  status: "scanned" | "not_scanned" | "mapping_missing";
}

export interface ReportDef {
  id: string;
  name: string;
  description: string;
  category: "business" | "scheme" | "scanning" | "finance" | "fraud" | "support" | "programme";
  sourceModule: string;
  programmes: ProgrammeCode[];
  permission: string;
  filters: string[];
  formats: ("csv" | "xlsx" | "pdf" | "png")[];
  route: string;
  status: "available" | "linked" | "business_confirmation_required" | "proposed";
  sensitive: boolean;
  decisionRef: string | null;
}

export interface FilterSnapshot {
  [key: string]: string | string[] | null;
}
export interface ReportExecution {
  id: string;
  reportId: string;
  by: string;
  at: string;
  filters: FilterSnapshot;
  scope: string;
  rows: number;
  sourceTimestamp: string;
  kpiVersions: Record<string, number>;
  checksum: string;
}
export interface ExportRecord {
  id: string;
  reportId: string;
  executionId: string | null;
  format: "csv" | "xlsx" | "pdf" | "png";
  by: string;
  at: string;
  filters: FilterSnapshot;
  rows: number;
  sensitive: boolean;
  unmasked: boolean;
  status: "generated" | "refused";
  reason: string | null;
  sourceTimestamp: string;
}
export interface ReportSchedule {
  id: string;
  reportId: string;
  name: string;
  recipients: string[];
  recipientGroup: string | null;
  frequency: "daily" | "weekly" | "monthly";
  day: string | null;
  time: string;
  dateRange: string;
  filters: FilterSnapshot;
  format: "csv" | "xlsx" | "pdf";
  startDate: string;
  endDate: string | null;
  status: "active" | "paused" | "ended";
  createdBy: string;
  createdAt: string;
  lastRun: string | null;
  nextRun: string;
  lastStatus: "delivered" | "partially_delivered" | "failed" | null;
  lastFailure: string | null;
}
export interface ScheduleRun {
  id: string;
  scheduleId: string;
  slot: string;
  at: string;
  rows: number;
  deliveries: { recipient: string; status: "delivered" | "refused_scope" | "failed"; commId: string | null; reason: string | null }[];
  status: "delivered" | "partially_delivered" | "failed" | "duplicate_skipped";
}

export interface ThresholdPolicy {
  id: string;
  kpiId: string;
  condition: "below" | "above" | "pct_change" | "variance_prev";
  value: number | null;
  period: string;
  scope: { programmes: ProgrammeCode[]; geography: string | null };
  recipients: string[];
  channel: "email" | "in_portal";
  effectiveFrom: string | null;
  status: "draft" | "pending_approval" | "active" | "inactive";
  confirmation: ConfirmationStatus;
  version: number;
  history: { at: string; by: string; change: string }[];
  approvalRequestId: string | null;
  createdBy: string;
}
export interface KpiAlert {
  id: string;
  policyId: string;
  kpiId: string;
  actual: number | null;
  threshold: number | null;
  period: string;
  scope: string;
  at: string;
  mode: "evaluation_only" | "dispatched";
  recipients: string[];
  commId: string | null;
  notification: "not_sent" | "sent";
  resolution: "open" | "resolved";
}

export interface AnalyticsDecision {
  id: string;
  ref: string;
  description: string;
  affects: string;
  businessOwner: string;
  calculation: string;
  restriction: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  notes: string;
}
export interface AnalyticsAudit {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  before: string | null;
  after: string | null;
  reason: string;
  sensitive: boolean;
}

export interface AnalyticsState {
  kpis: KpiDefinition[];
  kpiChanges: KpiChangeRequest[];
  scans: ScanRecord[];
  parentChild: ParentChildLink[];
  executions: ReportExecution[];
  exports: ExportRecord[];
  schedules: ReportSchedule[];
  runs: ScheduleRun[];
  thresholds: ThresholdPolicy[];
  alerts: KpiAlert[];
  decisions: AnalyticsDecision[];
  config: {
    churnedDays: number | null;
    slowMovingDays: number | null;
    salespersonField: ConfirmationStatus;
    parentChildVisibility: ConfirmationStatus;
    /** Data domains whose source refresh failed: their figures show the last good refresh, never zero. */
    unavailable: string[];
  };
  refreshedAt: string;
  audit: AnalyticsAudit[];
}
