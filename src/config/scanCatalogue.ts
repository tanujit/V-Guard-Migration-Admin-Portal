import type { ConditionKind, ConflictKind, Ownership, RuleType, SyncStatus, VersionStatus } from "@/types/masters";
import type { StatusTone } from "@/types/domain";

/**
 * Structured condition schema for the scan restriction rule builder. The UI renders controls from
 * this table; adding a condition kind means adding an entry here and its evaluation in the engine.
 * `valueSource` names the master list a value is picked from; "config" means the value lives in the
 * rule's own time / re-scan / parent-child section rather than in the condition.
 */
export interface ConditionDef {
  kind: ConditionKind;
  label: string;
  operators: { id: string; label: string }[];
  valueSource: "branches" | "skus" | "sub_categories" | "relations" | "config";
  help: string;
}

export const CONDITIONS: ConditionDef[] = [
  { kind: "branch", label: "Branch", operators: [{ id: "in", label: "is one of" }, { id: "not_in", label: "is not one of" }], valueSource: "branches", help: "Branch where the scan happens" },
  { kind: "sku", label: "SKU", operators: [{ id: "in", label: "is one of" }, { id: "not_in", label: "is not one of" }], valueSource: "skus", help: "SKU being scanned" },
  { kind: "sub_category", label: "Sub-category", operators: [{ id: "in", label: "is one of" }, { id: "not_in", label: "is not one of" }], valueSource: "sub_categories", help: "Sub-category of the scanned SKU" },
  { kind: "time", label: "Time", operators: [{ id: "within_window", label: "falls within the configured window" }, { id: "outside_window", label: "falls outside the configured window" }], valueSource: "config", help: "Uses the rule's time restriction" },
  { kind: "rescan", label: "Re-scan", operators: [{ id: "is_rescan", label: "is a re-scan of the same code" }, { id: "exceeds_configured", label: "exceeds the configured re-scan limits" }], valueSource: "config", help: "Uses the rule's re-scan restriction" },
  { kind: "parent_child", label: "Parent-child", operators: [{ id: "parent_scanned", label: "parent SKU already scanned" }, { id: "child_scanned", label: "child SKU already scanned" }], valueSource: "relations", help: "Uses the rule's parent-child relationships" },
];

export const conditionDef = (k: ConditionKind) => CONDITIONS.find((c) => c.kind === k)!;

export const RULE_TYPES: { id: RuleType; label: string }[] = [
  { id: "branch", label: "Branch restriction" },
  { id: "sku", label: "SKU restriction" },
  { id: "sub_category", label: "Sub-category restriction" },
  { id: "time", label: "Time-based restriction" },
  { id: "rescan", label: "Re-scan restriction" },
  { id: "parent_child", label: "Parent-child rule" },
  { id: "composite", label: "Combined (AND/OR)" },
];
export const ruleTypeLabel = (t: RuleType) => RULE_TYPES.find((r) => r.id === t)?.label ?? t;

export const CONTEXT_LABEL = { scan_in: "Scan-In", scan_out: "Scan-Out", both: "Scan-In and Scan-Out" } as const;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const VERSION_STATUS: Record<VersionStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted for approval", tone: "warning" },
  active: { label: "Active", tone: "positive" },
  superseded: { label: "Superseded", tone: "neutral" },
  rejected: { label: "Rejected", tone: "negative" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const SYNC_STATUS: Record<SyncStatus, { label: string; tone: StatusTone }> = {
  synced: { label: "Synced", tone: "positive" },
  failed: { label: "Sync failed", tone: "negative" },
  conflict: { label: "Conflict", tone: "warning" },
  pending: { label: "Pending sync", tone: "info" },
};

export const OWNERSHIP: Record<Ownership, { label: string; tone: StatusTone; meaning: string }> = {
  sfdc_managed: { label: "SFDC managed", tone: "info", meaning: "Read-only in the portal; changes come from SFDC synchronisation" },
  portal_managed: { label: "Portal managed", tone: "accent", meaning: "Editable by authorised portal users" },
  pending_confirmation: { label: "Business confirmation required", tone: "warning", meaning: "Editability not approved; treated as read-only" },
};

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  source_changed: "Source record changed",
  missing_in_source: "No longer in source",
  pincode_mismatch: "Pincode mapping differs",
  parent_changed: "Parent reference changed",
  duplicate_source: "Duplicate source records",
  validation_failed: "Failed validation",
};

/** Bulk import templates. Only SOW-listed attributes; no pricing, stock or tax fields. */
export const IMPORT_TEMPLATES = {
  product: [
    { field: "product_code", required: true, format: "Text, unique across products (case-insensitive)", allowed: "" },
    { field: "product_name", required: true, format: "Text", allowed: "" },
    { field: "description", required: false, format: "Text", allowed: "" },
    { field: "category_code", required: true, format: "Reference", allowed: "Active category code from Category & Sub-Category" },
    { field: "sub_category_code", required: true, format: "Reference", allowed: "Active sub-category code belonging to category_code" },
    { field: "status", required: true, format: "Value", allowed: "active | inactive | draft" },
    { field: "warranty_value", required: false, format: "Whole number ≥ 0", allowed: "" },
    { field: "warranty_unit", required: false, format: "Value", allowed: "months | years" },
    { field: "installation_required", required: true, format: "Value", allowed: "yes | no" },
  ],
  sku: [
    { field: "sku_code", required: true, format: "Text, unique across SKUs (case-insensitive)", allowed: "" },
    { field: "product_code", required: true, format: "Reference", allowed: "Existing product code, or one in the same file" },
    { field: "sku_name", required: false, format: "Text", allowed: "" },
    { field: "status", required: true, format: "Value", allowed: "active | inactive | draft" },
    { field: "programmes", required: false, format: "List separated by |", allowed: "EP | ST | CS | Retailer | DD" },
  ],
} as const;
