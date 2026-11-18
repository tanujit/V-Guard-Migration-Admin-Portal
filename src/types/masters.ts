/**
 * Master data and scanning configuration models (Phase 4).
 * Only attributes named in the SOW or present in the existing data are modelled: no price, MRP,
 * stock, tax or margin. Values that need business confirmation are nullable and flagged.
 */

export type RecordStatus = "active" | "inactive" | "draft";

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string;
  status: Exclude<RecordStatus, "draft">;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SubCategory extends Category {
  categoryId: string;
}

export type WarrantyUnit = "months" | "years";

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
  status: RecordStatus;
  warranty: { value: number | null; unit: WarrantyUnit };
  installationRequired: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  source: "portal" | "bulk_import" | "seed";
}

export interface Sku {
  id: string;
  code: string;
  name: string;
  productId: string;
  status: RecordStatus;
  /** Programmes the SKU is eligible for. Empty means not yet configured, never "all". */
  programmes: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Product availability at a branch. Portal-maintained (not SFDC). */
export interface ProductBranchMapping {
  id: string;
  productId: string;
  branchCode: string;
  status: "active" | "inactive";
  createdAt: string;
  createdBy: string;
}

/* ---------------- Geography & SFDC ---------------- */

export type HierarchyLevel = "state" | "district" | "branch";
export type SyncStatus = "synced" | "failed" | "conflict" | "pending";
export type Ownership = "sfdc_managed" | "portal_managed" | "pending_confirmation";

/** Portal-side record of a hierarchy node. Names and codes come from config/geography (SFDC mirror). */
export interface HierarchyRecord {
  id: string;
  level: HierarchyLevel;
  code: string;
  sourceRecordId: string | null;
  status: "active" | "inactive";
  pincodes: string[];
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface OwnershipSetting {
  dataType: "hierarchy" | "pincode";
  label: string;
  ownership: Ownership;
  decisionRef: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SyncRun {
  id: string;
  source: "SFDC";
  startedAt: string;
  completedAt: string | null;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  status: "completed" | "partial" | "failed" | "running";
  errors: { recordCode: string; error: string }[];
  mock: true;
}

export type ConflictKind = "source_changed" | "missing_in_source" | "pincode_mismatch" | "parent_changed" | "duplicate_source" | "validation_failed";

export interface SyncConflict {
  id: string;
  kind: ConflictKind;
  recordCode: string;
  level: HierarchyLevel;
  portalValue: string;
  sourceValue: string;
  detectedAt: string;
  syncRunId: string;
  status: "open" | "under_review" | "resolved_by_source";
  note: string;
}

/* ---------------- Scan points ---------------- */

export type VersionStatus = "draft" | "submitted" | "active" | "superseded" | "rejected" | "withdrawn";

export interface ScanPointVersion {
  version: number;
  status: VersionStatus;
  scanIn: number | null;
  scanOut: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  remarks: string;
  /** Set for a version proposing that the configuration is retired. */
  retire?: boolean;
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export interface ScanPointConfig {
  id: string;
  skuId: string;
  programmes: string[];
  branchCodes: string[];
  createdBy: string;
  createdAt: string;
  /** Set when the whole configuration was deactivated through an approved change. */
  retired: boolean;
  versions: ScanPointVersion[];
}

/* ---------------- Scan restriction rules ---------------- */

export type ConditionKind = "branch" | "sku" | "sub_category" | "time" | "rescan" | "parent_child";

export interface RuleCondition {
  id: string;
  type: "condition";
  kind: ConditionKind;
  operator: string;
  values: string[];
}

export interface RuleGroup {
  id: string;
  type: "group";
  op: "AND" | "OR";
  items: (RuleCondition | RuleGroup)[];
}

export interface TimeRestriction {
  windowStart: string | null;
  windowEnd: string | null;
  days: string[];
  note: string;
}

export interface RescanRestriction {
  eligible: "allowed" | "not_allowed" | null;
  minIntervalHours: number | null;
  maxCount: number | null;
  note: string;
}

export interface ParentChildRelation {
  id: string;
  parentSkuId: string;
  childSkuIds: string[];
  /** The business meaning is not defined in the SOW; recorded as text and flagged until confirmed. */
  description: string;
  confirmed: boolean;
}

export interface RuleScope {
  productIds: string[];
  skuIds: string[];
  categoryIds: string[];
  subCategoryIds: string[];
  branchCodes: string[];
  programmes: string[];
  /** Explicit choices; an empty selection never means "everything". */
  allSkus: boolean;
  allBranches: boolean;
}

export interface RuleOutcome {
  kind: "unconfigured" | "source_defined";
  exceptionId: string | null;
  note: string;
}

export interface RuleVersion {
  version: number;
  status: VersionStatus;
  scope: RuleScope;
  conditions: RuleGroup;
  time: TimeRestriction | null;
  rescan: RescanRestriction | null;
  relations: ParentChildRelation[];
  outcome: RuleOutcome;
  justification: string;
  /** Set for a version proposing deactivation of the rule. */
  deactivate: boolean;
  approvalRequestId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export type RuleType = "branch" | "sku" | "sub_category" | "time" | "rescan" | "parent_child" | "composite";

export interface ScanRule {
  id: string;
  code: string;
  name: string;
  description: string;
  ruleType: RuleType;
  context: "scan_in" | "scan_out" | "both";
  createdBy: string;
  createdAt: string;
  versions: RuleVersion[];
}

/** Error / exception catalogue entry. Only source-defined entries are allowed; none have been supplied. */
export interface ScanException {
  id: string;
  code: string;
  description: string;
  relatedConfig: string;
  status: "active" | "inactive";
  updatedAt: string;
  source: string;
}

/* ---------------- Bulk import ---------------- */

export type ImportKind = "product" | "sku";

export interface ImportIssue {
  row: number;
  code: string;
  field: string;
  type: "missing" | "format" | "duplicate" | "reference" | "value" | "warning";
  message: string;
  severity: "error" | "warning";
}

export interface ImportBatch {
  id: string;
  kind: ImportKind;
  fileName: string;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
  mode: "valid_only" | "atomic";
  total: number;
  imported: number;
  rejected: number;
  skipped: number;
  status: "completed" | "partial" | "rejected";
  completedAt: string;
  issues: ImportIssue[];
}

/* ---------------- Governance ---------------- */

export interface MasterDecision {
  id: string;
  ref: string;
  question: string;
  treatment: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
  owner: string;
}

export type MasterEntity = "product" | "sku" | "category" | "sub_category" | "branch" | "mapping" | "scan_points" | "scan_rule" | "import" | "sync" | "setting";

export interface MasterAuditEvent {
  id: string;
  at: string;
  actorUserId: string;
  actorOrgId: string | null;
  module: string;
  entityType: MasterEntity;
  entityId: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  remarks: string;
  approvalRequestId: string | null;
  ref: string;
}
