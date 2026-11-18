/**
 * MASTER DATA & SCANNING CONFIGURATION ENGINE — pure functions.
 * Validation, scope checks, rule conflict detection and the development rule simulator. The store
 * calls these with the acting user; screens call them for previews. Nothing here touches storage.
 */
import { conditionDef, DAYS } from "@/config/scanCatalogue";
import { findBranch, GEOGRAPHY } from "@/config/geography";
import { hasPermission, type AccessState } from "@/features/access/engine";
import type { FieldChange } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { Category, HierarchyRecord, ImportBatch, ImportIssue, ImportKind, MasterAuditEvent, MasterDecision, OwnershipSetting, Product, ProductBranchMapping, RuleCondition, RuleGroup, RuleScope, RuleVersion, ScanException, ScanPointConfig, ScanPointVersion, ScanRule, Sku, SubCategory, SyncConflict, SyncRun } from "@/types/masters";

export interface MasterState {
  categories: Category[];
  subCategories: SubCategory[];
  products: Product[];
  skus: Sku[];
  mappings: ProductBranchMapping[];
  hierarchy: HierarchyRecord[];
  ownership: OwnershipSetting[];
  syncRuns: SyncRun[];
  conflicts: SyncConflict[];
  scanPoints: ScanPointConfig[];
  rules: ScanRule[];
  exceptions: ScanException[];
  imports: ImportBatch[];
  decisions: MasterDecision[];
  audit: MasterAuditEvent[];
}

export interface Validation {
  errors: string[];
  warnings: string[];
  info: string[];
}
const V = (): Validation => ({ errors: [], warnings: [], info: [] });

/* ---------------- Lookups ---------------- */

export const ALL_BRANCHES = GEOGRAPHY.flatMap((s) => s.districts.flatMap((d) => d.branches.map((b) => ({ code: b.code, name: b.name, state: s.code, stateName: s.name, district: d.code, districtName: d.name }))));
export const branchByCode = new Map(ALL_BRANCHES.map((b) => [b.code, b]));
export const branchLabel = (code: string) => branchByCode.get(code)?.name ?? code;
export const hierarchyOf = (s: MasterState, code: string) => s.hierarchy.find((h) => h.code === code);
export const isBranchActive = (s: MasterState, code: string) => hierarchyOf(s, code)?.status === "active";

export const productById = (s: MasterState, id: string) => s.products.find((p) => p.id === id);
export const skuById = (s: MasterState, id: string) => s.skus.find((k) => k.id === id);
export const categoryById = (s: MasterState, id: string) => s.categories.find((c) => c.id === id);
export const subById = (s: MasterState, id: string) => s.subCategories.find((c) => c.id === id);
export const skusOfProduct = (s: MasterState, productId: string) => s.skus.filter((k) => k.productId === productId);
export const productOfSku = (s: MasterState, skuId: string) => productById(s, skuById(s, skuId)?.productId ?? "");
export const skuLabel = (s: MasterState, id: string) => skuById(s, id)?.code ?? id;
export const geoOf = (code: string) => {
  const b = findBranch(code);
  return b ? { state: b.state.code, district: b.district.code, branch: b.branch.code } : {};
};

/** Current active version, the newest pending one and the newest of all. */
export function versionsOf<T extends { version: number; status: string }>(versions: T[]) {
  const active = versions.find((v) => v.status === "active");
  const latest = versions[versions.length - 1];
  const pending = versions.find((v) => v.status === "submitted");
  const draft = versions.find((v) => v.status === "draft");
  return { active, latest, pending, draft };
}

export type ConfigState = "active" | "inactive" | "draft" | "pending";
export function ruleState(r: ScanRule): ConfigState {
  const { active, pending, draft } = versionsOf(r.versions);
  if (active && !active.deactivate) return "active";
  if (pending) return "pending";
  if (draft && !active) return "draft";
  return "inactive";
}
export function pointsState(c: ScanPointConfig): ConfigState {
  if (c.retired) return "inactive";
  const { active, pending, draft } = versionsOf(c.versions);
  if (active) return "active";
  if (pending) return "pending";
  if (draft) return "draft";
  return "inactive";
}

/* ---------------- Permissions & scope ---------------- */

export const can = (acc: AccessState, uid: string, module: string, action: ActionId) => hasPermission(acc, uid, module, action).allowed;

/** Branches outside the actor's scope for `module:action`. */
export function outOfScope(acc: AccessState, uid: string, module: string, action: ActionId, branchCodes: string[], programme?: string) {
  return branchCodes.filter((code) => !hasPermission(acc, uid, module, action, { programme, geo: geoOf(code) }).allowed);
}

/** Visible when at least one branch is within the actor's view scope (or no branch is involved). */
export function visibleByBranches(acc: AccessState, uid: string, module: string, branchCodes: string[], allBranches = false) {
  if (allBranches) return hasPermission(acc, uid, module, "view", {}).allowed && outOfScope(acc, uid, module, "view", ALL_BRANCHES.map((b) => b.code)).length === 0;
  if (!branchCodes.length) return hasPermission(acc, uid, module, "view").allowed;
  return branchCodes.some((code) => hasPermission(acc, uid, module, "view", { geo: geoOf(code) }).allowed);
}

export const ownershipOf = (s: MasterState, t: OwnershipSetting["dataType"]) => s.ownership.find((o) => o.dataType === t)!;
export const isPortalEditable = (s: MasterState, t: OwnershipSetting["dataType"]) => ownershipOf(s, t).ownership === "portal_managed";

/* ---------------- Products, SKUs, categories ---------------- */

const norm = (x: string) => x.trim().toLowerCase();

export interface ProductDraft {
  code: string;
  name: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
  status: Product["status"];
  warranty: Product["warranty"];
  installationRequired: boolean;
}
export interface SkuDraft {
  code: string;
  name: string;
  status: Sku["status"];
  programmes: string[];
}

export function validateProduct(s: MasterState, d: ProductDraft, excludeId?: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name.trim()) e.name = "Product name is required";
  if (!d.code.trim()) e.code = "Product code is required";
  else if (s.products.some((p) => p.id !== excludeId && norm(p.code) === norm(d.code))) e.code = `Product code ${d.code.trim()} is already used`;
  const cat = categoryById(s, d.categoryId);
  if (!cat) e.categoryId = "Choose a category";
  else if (cat.status !== "active") e.categoryId = `${cat.name} is inactive`;
  const sub = subById(s, d.subCategoryId);
  if (!sub) e.subCategoryId = "Choose a sub-category";
  else if (sub.categoryId !== d.categoryId) e.subCategoryId = `${sub.name} belongs to another category`;
  else if (sub.status !== "active") e.subCategoryId = `${sub.name} is inactive`;
  if (d.warranty.value !== null && (!Number.isInteger(d.warranty.value) || d.warranty.value < 0)) e.warranty = "Warranty must be a whole number of months or years, 0 or more";
  return e;
}

export function validateSkus(s: MasterState, skus: SkuDraft[], excludeIds: string[] = []): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  skus.forEach((k, i) => {
    const label = `SKU ${i + 1}`;
    if (!k.code.trim()) errors.push(`${label}: SKU code is required`);
    else if (seen.has(norm(k.code))) errors.push(`${label}: ${k.code} appears twice in this product`);
    else if (s.skus.some((x) => !excludeIds.includes(x.id) && norm(x.code) === norm(k.code))) errors.push(`${label}: SKU code ${k.code} is already used`);
    seen.add(norm(k.code));
  });
  return errors;
}

export function categoryImpact(s: MasterState, opts: { categoryId?: string; subCategoryId?: string }) {
  const products = s.products.filter((p) => (opts.categoryId ? p.categoryId === opts.categoryId : p.subCategoryId === opts.subCategoryId));
  const skuIds = new Set(s.skus.filter((k) => products.some((p) => p.id === k.productId)).map((k) => k.id));
  const subIds = opts.categoryId ? s.subCategories.filter((x) => x.categoryId === opts.categoryId).map((x) => x.id) : [opts.subCategoryId!];
  const configs = s.scanPoints.filter((c) => pointsState(c) === "active" && skuIds.has(c.skuId));
  const rules = s.rules.filter((r) => {
    const v = versionsOf(r.versions).active ?? versionsOf(r.versions).pending;
    return v && ruleState(r) !== "inactive" && (v.scope.categoryIds.includes(opts.categoryId ?? "") || v.scope.subCategoryIds.some((x) => subIds.includes(x)) || v.scope.skuIds.some((x) => skuIds.has(x)));
  });
  return { products, activeProducts: products.filter((p) => p.status === "active"), skuCount: skuIds.size, activeSkus: s.skus.filter((k) => skuIds.has(k.id) && k.status === "active").length, configs, rules, subCategories: opts.categoryId ? s.subCategories.filter((x) => x.categoryId === opts.categoryId && x.status === "active") : [] };
}

/** Active configurations and rules that reference a SKU. */
export function skuDependencies(s: MasterState, skuId: string) {
  return {
    configs: s.scanPoints.filter((c) => c.skuId === skuId && ["active", "pending"].includes(pointsState(c))),
    rules: s.rules.filter((r) => {
      const v = versionsOf(r.versions);
      const live = [v.active, v.pending].filter(Boolean) as RuleVersion[];
      return ruleState(r) !== "inactive" && live.some((x) => x.scope.skuIds.includes(skuId) || x.relations.some((rel) => rel.parentSkuId === skuId || rel.childSkuIds.includes(skuId)));
    }),
  };
}

/* ---------------- Bulk import ---------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export interface ImportCheck {
  header: string[];
  records: Record<string, string>[];
  issues: ImportIssue[];
  validRows: number[];
  duplicateRows: number[];
}

const STATUSES = ["active", "inactive", "draft"];
const PROGRAMME_CODES = ["EP", "ST", "CS", "Retailer", "DD"];

export function validateImport(s: MasterState, kind: ImportKind, rows: string[][], required: string[], allowedFields: string[]): ImportCheck {
  const issues: ImportIssue[] = [];
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  const missingCols = required.filter((f) => !header.includes(f));
  if (missingCols.length) issues.push({ row: 1, code: "—", field: missingCols.join(", "), type: "missing", message: `Header is missing required column(s): ${missingCols.join(", ")}`, severity: "error" });
  header.filter((h) => !allowedFields.includes(h)).forEach((h) => issues.push({ row: 1, code: "—", field: h, type: "value", message: `Column "${h}" is not part of the template and is ignored`, severity: "warning" }));
  const seen = new Map<string, number>();
  const fileProducts = new Set(kind === "product" ? records.map((r) => norm(r.product_code ?? "")) : []);
  const duplicateRows: number[] = [];
  records.forEach((r, i) => {
    const row = i + 2;
    const code = kind === "product" ? r.product_code : r.sku_code;
    const add = (field: string, type: ImportIssue["type"], message: string, severity: ImportIssue["severity"] = "error") => issues.push({ row, code: code || "—", field, type, message, severity });
    required.forEach((f) => header.includes(f) && !r[f] && add(f, "missing", `${f} is required`));
    if (code) {
      const k = norm(code);
      if (seen.has(k)) {
        add(kind === "product" ? "product_code" : "sku_code", "duplicate", `Duplicate of row ${seen.get(k)} in this file`);
        duplicateRows.push(row);
      } else seen.set(k, row);
      const exists = kind === "product" ? s.products.some((p) => norm(p.code) === k) : s.skus.some((x) => norm(x.code) === k);
      if (exists) add(kind === "product" ? "product_code" : "sku_code", "duplicate", `${code} already exists in the master`);
    }
    if (r.status && !STATUSES.includes(r.status.toLowerCase())) add("status", "value", `"${r.status}" is not one of active, inactive, draft`);
    if (kind === "product") {
      const cat = s.categories.find((c) => norm(c.code) === norm(r.category_code ?? ""));
      if (r.category_code && !cat) add("category_code", "reference", `Category ${r.category_code} does not exist`);
      else if (cat && cat.status !== "active") add("category_code", "reference", `Category ${cat.code} is inactive`);
      const sub = s.subCategories.find((c) => norm(c.code) === norm(r.sub_category_code ?? ""));
      if (r.sub_category_code && !sub) add("sub_category_code", "reference", `Sub-category ${r.sub_category_code} does not exist`);
      else if (sub && cat && sub.categoryId !== cat.id) add("sub_category_code", "reference", `${sub.code} does not belong to ${cat.code}`);
      if (r.warranty_value && !/^\d+$/.test(r.warranty_value)) add("warranty_value", "format", "Warranty must be a whole number");
      if (r.warranty_unit && !["months", "years"].includes(r.warranty_unit.toLowerCase())) add("warranty_unit", "value", "Use months or years");
      if (r.warranty_value && !r.warranty_unit) add("warranty_unit", "missing", "Warranty unit is required when a value is given");
      if (r.installation_required && !["yes", "no"].includes(r.installation_required.toLowerCase())) add("installation_required", "value", "Use yes or no");
    } else {
      const known = s.products.some((p) => norm(p.code) === norm(r.product_code ?? "")) || fileProducts.has(norm(r.product_code ?? ""));
      if (r.product_code && !known) add("product_code", "reference", `Product ${r.product_code} does not exist`);
      const bad = (r.programmes ?? "").split("|").map((p) => p.trim()).filter((p) => p && !PROGRAMME_CODES.includes(p));
      if (bad.length) add("programmes", "value", `Unknown programme(s): ${bad.join(", ")}`);
      if (!r.programmes) add("programmes", "warning", "No programmes: the SKU will not be eligible for any programme until configured", "warning");
    }
  });
  const errorRows = new Set(issues.filter((x) => x.severity === "error" && x.row > 1).map((x) => x.row));
  const validRows = missingCols.length ? [] : records.map((_, i) => i + 2).filter((r) => !errorRows.has(r));
  return { header, records, issues, validRows, duplicateRows };
}

/* ---------------- Scan points ---------------- */

export interface ScanPointDraft {
  skuId: string;
  programmes: string[];
  branchCodes: string[];
  scanIn: number | null;
  scanOut: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  remarks: string;
}

export function validateScanPoints(s: MasterState, d: ScanPointDraft, configId?: string): Validation {
  const v = V();
  const sku = skuById(s, d.skuId);
  if (!sku) v.errors.push("Choose a SKU from the Product & SKU master");
  else {
    if (sku.status !== "active") v.errors.push(`SKU ${sku.code} is ${sku.status}; configurations need an active SKU`);
    if (productOfSku(s, sku.id)?.status !== "active") v.errors.push("The SKU's product is not active");
    const notEligible = d.programmes.filter((p) => !sku.programmes.includes(p));
    if (notEligible.length) v.errors.push(`${sku.code} is not eligible for ${notEligible.join(", ")}`);
  }
  if (!d.branchCodes.length) v.errors.push("Choose at least one branch. Branches are never assigned by default");
  const inactive = d.branchCodes.filter((c) => !isBranchActive(s, c));
  if (inactive.length) v.errors.push(`Inactive or unknown branch: ${inactive.map(branchLabel).join(", ")}`);
  const sku2 = sku && productOfSku(s, sku.id);
  const unmapped = sku2 ? d.branchCodes.filter((c) => !s.mappings.some((m) => m.productId === sku2.id && m.branchCode === c && m.status === "active")) : [];
  if (unmapped.length) v.warnings.push(`${unmapped.length} branch(es) are not in the product's branch mapping: ${unmapped.slice(0, 4).map(branchLabel).join(", ")}${unmapped.length > 4 ? "…" : ""}`);
  for (const [label, val] of [["Scan-In", d.scanIn], ["Scan-Out", d.scanOut]] as const) {
    if (val === null) v.info.push(`${label} points not set. It is left unconfigured, not treated as 0`);
    else if (!Number.isFinite(val) || val < 0) v.errors.push(`${label} points must be 0 or more`);
    else if (Math.round(val * 100) !== val * 100) v.errors.push(`${label} points allow at most 2 decimal places`);
    else if (val > 100000) v.errors.push(`${label} points exceed the supported range (100,000)`);
  }
  if (d.scanIn === null && d.scanOut === null) v.errors.push("Configure Scan-In, Scan-Out or both");
  if (d.effectiveFrom && d.effectiveTo && d.effectiveTo < d.effectiveFrom) v.errors.push("Effective end date is before the start date");
  const overlaps = s.scanPoints.filter((c) => c.id !== configId && c.skuId === d.skuId && ["active", "pending"].includes(pointsState(c)) && c.branchCodes.some((b) => d.branchCodes.includes(b)) && (!c.programmes.length || !d.programmes.length || c.programmes.some((p) => d.programmes.includes(p))));
  overlaps.forEach((c) => v.errors.push(`Overlaps ${c.id} for ${c.branchCodes.filter((b) => d.branchCodes.includes(b)).length} branch(es). Change that configuration instead, or narrow the branches`));
  return v;
}

export function pointsFields(s: MasterState, c: Pick<ScanPointConfig, "skuId" | "branchCodes" | "programmes">, before: ScanPointVersion | null, after: ScanPointVersion | ScanPointDraft, retire = false): FieldChange[] {
  const sku = skuById(s, c.skuId);
  return [
    { key: "sku", label: "SKU", kind: "text", before: sku ? `${sku.code} · ${sku.name}` : c.skuId, after: sku ? `${sku.code} · ${sku.name}` : c.skuId },
    { key: "branches", label: "Branches", kind: "text", before: describeBranches(c.branchCodes), after: describeBranches(c.branchCodes) },
    { key: "programmes", label: "Programmes", kind: "text", before: c.programmes.join(", ") || "—", after: c.programmes.join(", ") || "—" },
    { key: "scanIn", label: "Scan-In points", kind: "points", material: true, before: before ? before.scanIn : null, after: retire ? null : after.scanIn },
    { key: "scanOut", label: "Scan-Out points", kind: "points", material: true, before: before ? before.scanOut : null, after: retire ? null : after.scanOut },
    { key: "effective", label: "Effective from", kind: "date", before: before?.effectiveFrom ?? null, after: after.effectiveFrom ?? null },
    { key: "state", label: "Configuration state", kind: "status", material: true, before: before ? "Active" : null, after: retire ? "Inactive" : "Active" },
  ];
}

export function describeBranches(codes: string[], all = false) {
  if (all) return "All branches (explicitly selected)";
  if (!codes.length) return "None";
  const states = Array.from(new Set(codes.map((c) => branchByCode.get(c)?.state)));
  const full = states.filter((st) => ALL_BRANCHES.filter((b) => b.state === st).every((b) => codes.includes(b.code)));
  const rest = codes.filter((c) => !full.includes(branchByCode.get(c)?.state));
  return [...full.map((st) => `All ${GEOGRAPHY.find((g) => g.code === st)?.name} branches`), ...rest.map(branchLabel)].join(", ");
}

/* ---------------- Scan restriction rules ---------------- */

/** SKUs a rule scope covers, expanded through products, categories and sub-categories. */
export function scopeSkus(s: MasterState, sc: RuleScope): Set<string> | "all" {
  if (sc.allSkus) return "all";
  const out = new Set(sc.skuIds);
  s.skus.forEach((k) => {
    const p = productById(s, k.productId);
    if (!p) return;
    if (sc.productIds.includes(p.id) || sc.subCategoryIds.includes(p.subCategoryId) || sc.categoryIds.includes(p.categoryId)) out.add(k.id);
  });
  return out;
}
const scopeBranches = (sc: RuleScope): Set<string> | "all" => (sc.allBranches ? "all" : new Set(sc.branchCodes));
function intersectCount(a: Set<string> | "all", b: Set<string> | "all", universe: number) {
  if (a === "all" && b === "all") return universe;
  if (a === "all") return (b as Set<string>).size;
  if (b === "all") return a.size;
  let n = 0;
  a.forEach((x) => b.has(x) && n++);
  return n;
}

export const allConditions = (g: RuleGroup): RuleCondition[] => g.items.flatMap((i) => (i.type === "group" ? allConditions(i) : [i]));
const allGroups = (g: RuleGroup): RuleGroup[] => [g, ...g.items.flatMap((i) => (i.type === "group" ? allGroups(i) : []))];

export interface RuleConflict {
  ruleId: string;
  code: string;
  skus: number;
  branches: number;
  blocking: boolean;
  reason: string;
}

/** Live versions of other rules that a proposal overlaps with. */
export function ruleConflicts(s: MasterState, ruleId: string | null, rule: Pick<ScanRule, "ruleType" | "context">, v: RuleVersion): RuleConflict[] {
  if (v.deactivate) return [];
  const mySkus = scopeSkus(s, v.scope);
  const myBranches = scopeBranches(v.scope);
  const out: RuleConflict[] = [];
  for (const other of s.rules) {
    if (other.id === ruleId) continue;
    const o = versionsOf(other.versions);
    const live = o.pending ?? (o.active && !o.active.deactivate ? o.active : undefined);
    if (!live) continue;
    const skus = intersectCount(mySkus, scopeSkus(s, live.scope), s.skus.length);
    const branches = intersectCount(myBranches, scopeBranches(live.scope), ALL_BRANCHES.length);
    const progOverlap = !v.scope.programmes.length || !live.scope.programmes.length || v.scope.programmes.some((p) => live.scope.programmes.includes(p));
    const ctxOverlap = rule.context === "both" || other.context === "both" || rule.context === other.context;
    if (!skus || !branches || !progOverlap || !ctxOverlap) continue;
    const sameKind = other.ruleType === rule.ruleType;
    out.push({ ruleId: other.id, code: other.code, skus, branches, blocking: sameKind, reason: sameKind ? `Same rule type and scan context; precedence between ${other.code} and this rule is not confirmed (Business confirmation required)` : `Different rule type; both would apply to ${skus} SKU(s) at ${branches} branch(es)` });
  }
  return out;
}

export function validateRule(s: MasterState, ruleId: string | null, header: Pick<ScanRule, "name" | "code" | "ruleType" | "context">, v: RuleVersion): Validation & { conflicts: RuleConflict[] } {
  const r = { ...V(), conflicts: [] as RuleConflict[] };
  if (!header.name.trim()) r.errors.push("Rule name is required");
  if (!/^[A-Z0-9_-]{3,32}$/.test(header.code)) r.errors.push("Rule code: 3–32 capitals, digits, - or _");
  if (s.rules.some((x) => x.id !== ruleId && x.code === header.code)) r.errors.push(`Rule code ${header.code} is already used`);
  if (!v.justification.trim()) r.errors.push("Give a business justification");
  const sc = v.scope;
  // 1, 4, 5, 15: references and inactive masters
  sc.productIds.forEach((id) => {
    const p = productById(s, id);
    if (!p) r.errors.push(`Product ${id} does not exist`);
    else if (p.status !== "active") r.errors.push(`Product ${p.code} is ${p.status}`);
  });
  sc.skuIds.forEach((id) => {
    const k = skuById(s, id);
    if (!k) r.errors.push(`SKU ${id} does not exist`);
    else if (k.status !== "active") r.errors.push(`SKU ${k.code} is ${k.status}`);
  });
  sc.categoryIds.forEach((id) => categoryById(s, id)?.status !== "active" && r.errors.push(`Category ${categoryById(s, id)?.name ?? id} is missing or inactive`));
  // 2: category / sub-category combination
  sc.subCategoryIds.forEach((id) => {
    const sub = subById(s, id);
    if (!sub) r.errors.push(`Sub-category ${id} does not exist`);
    else if (sub.status !== "active") r.errors.push(`Sub-category ${sub.name} is inactive`);
    else if (sc.categoryIds.length && !sc.categoryIds.includes(sub.categoryId)) r.errors.push(`${sub.name} does not belong to the selected categories`);
  });
  if (!sc.allSkus && !sc.productIds.length && !sc.skuIds.length && !sc.categoryIds.length && !sc.subCategoryIds.length) r.errors.push("Define the product scope: products, SKUs, categories, sub-categories, or explicitly choose all SKUs");
  // 3, 6: branch scope
  if (!sc.allBranches && !sc.branchCodes.length) r.errors.push("Missing branch scope. Select branches, or explicitly choose all branches; no selection never means everywhere");
  sc.branchCodes.forEach((c) => {
    if (!branchByCode.has(c)) r.errors.push(`Branch ${c} does not exist`);
    else if (!isBranchActive(s, c)) r.errors.push(`${branchLabel(c)} is inactive`);
  });
  if (sc.allSkus) r.warnings.push("Applies to every SKU. Acknowledge that this is intended");
  if (sc.allBranches) r.warnings.push("Applies at every branch. Acknowledge that this is intended");
  // 7, 8: structure
  allGroups(v.conditions).forEach((g) => {
    if (!g.items.length) r.errors.push(`${g === v.conditions ? "The rule" : "A condition group"} has no conditions`);
    else if (g.items.length === 1 && g !== v.conditions) r.warnings.push(`An ${g.op} group with a single condition has no effect; remove the group or add a condition`);
  });
  const depth = (g: RuleGroup): number => 1 + Math.max(0, ...g.items.map((i) => (i.type === "group" ? depth(i) : 0)));
  if (depth(v.conditions) > 3) r.errors.push("Condition groups can be nested at most three levels deep");
  const conds = allConditions(v.conditions);
  conds.forEach((c) => {
    const def = conditionDef(c.kind);
    if (!def.operators.some((o) => o.id === c.operator)) r.errors.push(`${def.label} condition has an unsupported operator`);
    if (["branches", "skus", "sub_categories", "relations"].includes(def.valueSource) && !c.values.length) r.errors.push(`${def.label} condition has no value`);
    if (c.kind === "branch") c.values.forEach((b) => !sc.allBranches && !sc.branchCodes.includes(b) && r.warnings.push(`Condition references ${branchLabel(b)}, which is outside the rule's branch scope`));
  });
  // 9: contradictions inside one AND group
  allGroups(v.conditions).filter((g) => g.op === "AND").forEach((g) => {
    const direct = g.items.filter((i): i is RuleCondition => i.type === "condition");
    for (const kind of ["branch", "sku", "sub_category"] as const) {
      const ins = direct.filter((c) => c.kind === kind && c.operator === "in");
      const outs = direct.filter((c) => c.kind === kind && c.operator === "not_in");
      if (ins.length > 1) {
        const common = ins.reduce((acc, c) => acc.filter((x) => c.values.includes(x)), ins[0].values);
        if (!common.length) r.errors.push(`Contradictory ${conditionDef(kind).label.toLowerCase()} conditions: AND of disjoint “is one of” lists can never be true`);
      }
      ins.forEach((i) => outs.forEach((o) => i.values.every((x) => o.values.includes(x)) && r.errors.push(`Contradictory ${conditionDef(kind).label.toLowerCase()} conditions: every value is both included and excluded`)));
    }
    const times = direct.filter((c) => c.kind === "time");
    if (times.some((c) => c.operator === "within_window") && times.some((c) => c.operator === "outside_window")) r.errors.push("Contradictory time conditions: within and outside the same window");
  });
  // 13: time configuration
  if (conds.some((c) => c.kind === "time")) {
    const t = v.time;
    if (!t || (!t.windowStart && !t.windowEnd)) r.info.push("Time window not set: values require business confirmation, so the time condition cannot be evaluated yet");
    else if (!t.windowStart || !t.windowEnd) r.errors.push("Time window needs both a start and an end");
    else if (t.windowStart === t.windowEnd) r.errors.push("Time window start and end are the same");
    if (t && t.days.some((d) => !DAYS.includes(d))) r.errors.push("Time restriction has an invalid day");
  }
  // 14: re-scan configuration
  if (conds.some((c) => c.kind === "rescan")) {
    const rs = v.rescan;
    if (!rs || (rs.eligible === null && rs.minIntervalHours === null && rs.maxCount === null)) r.info.push("Re-scan limits not set: values require business confirmation");
    if (rs?.minIntervalHours !== null && rs?.minIntervalHours !== undefined && rs.minIntervalHours < 0) r.errors.push("Re-scan interval cannot be negative");
    if (rs?.maxCount !== null && rs?.maxCount !== undefined && (!Number.isInteger(rs.maxCount) || rs.maxCount < 0)) r.errors.push("Re-scan count must be a whole number, 0 or more");
    if (conds.some((c) => c.kind === "rescan" && c.operator === "exceeds_configured") && rs && rs.minIntervalHours === null && rs.maxCount === null) r.warnings.push("“Exceeds configured limits” has no limits configured yet");
  }
  // 11, 18: parent-child
  v.relations.forEach((rel) => {
    if (!skuById(s, rel.parentSkuId)) r.errors.push("A parent-child relationship has no valid parent SKU");
    if (!rel.childSkuIds.length) r.errors.push(`Relationship for ${skuLabel(s, rel.parentSkuId)} has no child SKU`);
    rel.childSkuIds.forEach((c) => {
      if (!skuById(s, c)) r.errors.push(`Child SKU ${c} does not exist`);
      else if (skuById(s, c)!.status !== "active") r.errors.push(`Child SKU ${skuLabel(s, c)} is inactive`);
    });
    if (rel.childSkuIds.includes(rel.parentSkuId)) r.errors.push(`${skuLabel(s, rel.parentSkuId)} cannot be its own child`);
    if (!rel.confirmed) r.info.push(`Relationship for ${skuLabel(s, rel.parentSkuId)}: business meaning and outcome are not confirmed`);
  });
  const parents = new Set(v.relations.map((x) => x.parentSkuId));
  v.relations.forEach((rel) => rel.childSkuIds.forEach((c) => parents.has(c) && r.warnings.push(`${skuLabel(s, c)} is both a parent and a child in this rule`)));
  conds.filter((c) => c.kind === "parent_child").forEach((c) => c.values.forEach((id) => !v.relations.some((x) => x.id === id) && r.errors.push("A parent-child condition refers to a relationship that is not defined")));
  if (conds.some((c) => c.kind === "parent_child") && !v.relations.length) r.errors.push("Parent-child condition without any relationship");
  // outcome
  if (v.outcome.kind === "unconfigured") r.info.push("Rule outcome is not configured: no source-defined error/exception catalogue has been supplied");
  // 10, 12: overlaps and duplicates
  r.conflicts = ruleConflicts(s, ruleId, header, v);
  r.conflicts.forEach((c) => (c.blocking ? r.errors : r.warnings).push(`Overlaps ${c.code} on ${c.skus} SKU(s) × ${c.branches} branch(es). ${c.reason}`));
  const sig = JSON.stringify([header.ruleType, header.context, v.scope, stripIds(v.conditions)]);
  s.rules.forEach((o) => {
    if (o.id === ruleId) return;
    const live = versionsOf(o.versions).active ?? versionsOf(o.versions).pending;
    if (live && JSON.stringify([o.ruleType, o.context, live.scope, stripIds(live.conditions)]) === sig) r.errors.push(`Duplicate of ${o.code}: same type, scope and conditions`);
  });
  return r;
}

const stripIds = (g: RuleGroup): unknown => ({ op: g.op, items: g.items.map((i) => (i.type === "group" ? stripIds(i) : { k: i.kind, o: i.operator, v: [...i.values].sort() })) });

/* ---------------- Readable rule text (Checker comparison, review step) ---------------- */

export function valueText(s: MasterState, c: RuleCondition, relations: RuleVersion["relations"]) {
  const def = conditionDef(c.kind);
  const names = c.values.map((v) => (def.valueSource === "branches" ? branchLabel(v) : def.valueSource === "skus" ? skuLabel(s, v) : def.valueSource === "sub_categories" ? subById(s, v)?.name ?? v : def.valueSource === "relations" ? `${skuLabel(s, relations.find((r) => r.id === v)?.parentSkuId ?? "")} → ${(relations.find((r) => r.id === v)?.childSkuIds ?? []).map((x) => skuLabel(s, x)).join(", ")}` : v));
  return names.length > 4 ? `${names.slice(0, 4).join(", ")} +${names.length - 4} more` : names.join(", ");
}

export function conditionText(s: MasterState, c: RuleCondition, relations: RuleVersion["relations"]) {
  const def = conditionDef(c.kind);
  const op = def.operators.find((o) => o.id === c.operator)?.label ?? c.operator;
  const val = valueText(s, c, relations);
  return `${def.label} ${op}${val ? ` [${val}]` : ""}`;
}

export function logicText(s: MasterState, g: RuleGroup, relations: RuleVersion["relations"], indent = ""): string {
  const parts = g.items.map((i) => (i.type === "group" ? `${indent}(\n${logicText(s, i, relations, indent + "  ")}\n${indent})` : `${indent}${conditionText(s, i, relations)}`));
  return parts.join(`\n${indent}${g.op}\n`);
}

export function scopeText(s: MasterState, sc: RuleScope) {
  const parts = [
    sc.allSkus ? "All SKUs (explicit)" : "",
    sc.productIds.length ? `Products: ${sc.productIds.map((id) => productById(s, id)?.code ?? id).join(", ")}` : "",
    sc.skuIds.length ? `SKUs: ${sc.skuIds.length > 5 ? `${sc.skuIds.slice(0, 5).map((id) => skuLabel(s, id)).join(", ")} +${sc.skuIds.length - 5}` : sc.skuIds.map((id) => skuLabel(s, id)).join(", ")}` : "",
    sc.categoryIds.length ? `Categories: ${sc.categoryIds.map((id) => categoryById(s, id)?.name ?? id).join(", ")}` : "",
    sc.subCategoryIds.length ? `Sub-categories: ${sc.subCategoryIds.map((id) => subById(s, id)?.name ?? id).join(", ")}` : "",
    `Branches: ${describeBranches(sc.branchCodes, sc.allBranches)}`,
    `Programmes: ${sc.programmes.length ? sc.programmes.join(", ") : "Not programme-specific"}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function timeText(v: RuleVersion) {
  if (!v.time) return "Not used";
  const t = v.time;
  if (!t.windowStart && !t.windowEnd) return `Not configured (business confirmation required)${t.note ? ` · ${t.note}` : ""}`;
  return `${t.windowStart ?? "?"}–${t.windowEnd ?? "?"}${t.days.length ? ` on ${t.days.join(", ")}` : " every day"}${t.note ? ` · ${t.note}` : ""}`;
}
export function rescanText(v: RuleVersion) {
  if (!v.rescan) return "Not used";
  const r = v.rescan;
  const parts = [r.eligible ? `Re-scan ${r.eligible === "allowed" ? "allowed" : "not allowed"}` : "Eligibility not set", r.minIntervalHours !== null ? `minimum ${r.minIntervalHours} h apart` : "interval not set", r.maxCount !== null ? `at most ${r.maxCount} re-scans` : "count not set"];
  return `${parts.join(" · ")}${r.note ? ` · ${r.note}` : ""}`;
}
export function relationsText(s: MasterState, v: RuleVersion) {
  return v.relations.length ? v.relations.map((r) => `${skuLabel(s, r.parentSkuId)} → ${r.childSkuIds.map((c) => skuLabel(s, c)).join(", ")}${r.confirmed ? "" : " (meaning unconfirmed)"}`).join("; ") : "None";
}
export const outcomeText = (s: MasterState, v: RuleVersion) => (v.outcome.kind === "unconfigured" ? "Not configured (business confirmation required)" : `Source exception ${s.exceptions.find((e) => e.id === v.outcome.exceptionId)?.code ?? v.outcome.exceptionId}`);

export function ruleFields(s: MasterState, rule: ScanRule, before: RuleVersion | null, after: RuleVersion): FieldChange[] {
  const f = (key: string, label: string, b: string | null, a: string | null, material = false): FieldChange => ({ key, label, kind: "text", before: b, after: a, material });
  return [
    f("rule", "Rule", before ? `${rule.code} · ${rule.name}` : null, `${rule.code} · ${rule.name}`),
    f("scope", "Applicability", before ? scopeText(s, before.scope) : null, scopeText(s, after.scope), true),
    f("conditions", "Conditions (AND/OR)", before ? logicText(s, before.conditions, before.relations) : null, logicText(s, after.conditions, after.relations), true),
    f("time", "Time restriction", before ? timeText(before) : null, timeText(after)),
    f("rescan", "Re-scan restriction", before ? rescanText(before) : null, rescanText(after), true),
    f("relations", "Parent-child relationships", before ? relationsText(s, before) : null, relationsText(s, after)),
    f("outcome", "Rule outcome", before ? outcomeText(s, before) : null, outcomeText(s, after)),
    f("state", "Rule state", before ? "Active" : null, after.deactivate ? "Inactive" : "Active", true),
  ];
}

/* ---------------- Development rule simulator ---------------- */

export type Tri = true | false | "unknown";
export interface SimContext {
  skuId: string;
  branchCode: string;
  programme: string;
  time: string;
  day: string;
  rescan: "yes" | "no" | "";
  rescanCount: string;
  hoursSinceLast: string;
  parentScanned: "yes" | "no" | "";
  childScanned: "yes" | "no" | "";
}
export interface SimNode {
  label: string;
  result: Tri;
  reason?: string;
  children?: SimNode[];
}

function evalCondition(s: MasterState, v: RuleVersion, c: RuleCondition, ctx: SimContext): SimNode {
  const label = conditionText(s, c, v.relations);
  const yesno = (x: "yes" | "no" | "") => (x === "" ? "unknown" : x === "yes");
  const inList = (val: string) => (c.operator === "not_in" ? !c.values.includes(val) : c.values.includes(val));
  switch (c.kind) {
    case "branch":
      return { label, result: inList(ctx.branchCode) };
    case "sku":
      return { label, result: inList(ctx.skuId) };
    case "sub_category":
      return { label, result: inList(productOfSku(s, ctx.skuId)?.subCategoryId ?? "") };
    case "time": {
      const t = v.time;
      if (!t?.windowStart || !t.windowEnd) return { label, result: "unknown", reason: "Time window requires business configuration" };
      if (!ctx.time) return { label, result: "unknown", reason: "No scan time entered" };
      const dayOk = !t.days.length || (ctx.day && t.days.includes(ctx.day));
      const inWindow = t.windowStart <= t.windowEnd ? ctx.time >= t.windowStart && ctx.time < t.windowEnd : ctx.time >= t.windowStart || ctx.time < t.windowEnd;
      const within = !!dayOk && inWindow;
      return { label, result: c.operator === "within_window" ? within : !within };
    }
    case "rescan": {
      if (c.operator === "is_rescan") {
        const r = yesno(ctx.rescan);
        return { label, result: r, reason: r === "unknown" ? "Say whether this is a re-scan" : undefined };
      }
      const rs = v.rescan;
      if (!rs || (rs.maxCount === null && rs.minIntervalHours === null)) return { label, result: "unknown", reason: "Re-scan limits require business configuration" };
      const countOver = rs.maxCount !== null && ctx.rescanCount !== "" ? Number(ctx.rescanCount) > rs.maxCount : null;
      const tooSoon = rs.minIntervalHours !== null && ctx.hoursSinceLast !== "" ? Number(ctx.hoursSinceLast) < rs.minIntervalHours : null;
      if (countOver === null && tooSoon === null) return { label, result: "unknown", reason: "Enter the re-scan count or hours since the last scan" };
      return { label, result: !!(countOver || tooSoon) };
    }
    case "parent_child": {
      const r = yesno(c.operator === "parent_scanned" ? ctx.parentScanned : ctx.childScanned);
      return { label, result: r, reason: r === "unknown" ? "Say whether the related SKU was already scanned" : undefined };
    }
  }
}

function evalGroup(s: MasterState, v: RuleVersion, g: RuleGroup, ctx: SimContext): SimNode {
  const children = g.items.map((i) => (i.type === "group" ? evalGroup(s, v, i, ctx) : evalCondition(s, v, i, ctx)));
  const rs = children.map((c) => c.result);
  const result: Tri = g.op === "AND" ? (rs.includes(false) ? false : rs.includes("unknown") ? "unknown" : true) : rs.includes(true) ? true : rs.includes("unknown") ? "unknown" : false;
  return { label: `${g.op} group`, result, children };
}

export interface SimResult {
  rule: ScanRule;
  version: RuleVersion;
  inScope: boolean;
  scopeReason: string;
  tree: SimNode | null;
  outcome: string;
}

export function simulate(s: MasterState, ctx: SimContext, candidates: { rule: ScanRule; version: RuleVersion }[]): { results: SimResult[]; conflict: boolean } {
  const results = candidates.map(({ rule, version }) => {
    const skus = scopeSkus(s, version.scope);
    const skuIn = skus === "all" || skus.has(ctx.skuId);
    const branchIn = version.scope.allBranches || version.scope.branchCodes.includes(ctx.branchCode);
    const progIn = !version.scope.programmes.length || !ctx.programme || version.scope.programmes.includes(ctx.programme);
    const inScope = skuIn && branchIn && progIn;
    const scopeReason = inScope ? "In scope" : [!skuIn && "SKU outside scope", !branchIn && "branch outside scope", !progIn && "programme outside scope"].filter(Boolean).join(", ");
    const tree = inScope ? evalGroup(s, version, version.conditions, ctx) : null;
    const outcome = !tree ? "Rule does not apply" : tree.result === false ? "Conditions not met: the rule does not apply" : tree.result === "unknown" ? "Evaluation requires business configuration" : version.outcome.kind === "unconfigured" ? "Conditions met. The outcome requires business configuration: no source-defined exception is linked" : `Conditions met. Source exception ${version.outcome.exceptionId}`;
    return { rule, version, inScope, scopeReason, tree, outcome };
  });
  return { results, conflict: results.filter((r) => r.tree && r.tree.result !== false).length > 1 };
}

export const emptyScope = (): RuleScope => ({ productIds: [], skuIds: [], categoryIds: [], subCategoryIds: [], branchCodes: [], programmes: [], allSkus: false, allBranches: false });

export function branchesForStates(states: string[]) {
  return ALL_BRANCHES.filter((b) => states.includes(b.state)).map((b) => b.code);
}

export type { Category, Product, Sku, SubCategory };
