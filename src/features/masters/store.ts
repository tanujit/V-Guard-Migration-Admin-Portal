/**
 * MASTER DATA STORE — in-browser mock repository for Phase 4.
 * Every mutation re-checks RBAC (module, action, programme and geography), honours the SFDC data
 * ownership setting, writes a structured audit event and returns a PolicyResult. Scanning changes
 * are never activated here directly: they are submitted to the central approval engine, whose
 * execution adapter calls `activateFromApproval` after the final approval.
 */
import { useSyncExternalStore } from "react";
import { accessStore } from "@/features/access/store";
import { hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow, resubmitRequest, updateWorkingVersion } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import type { ApprovalRequest } from "@/types/approval";
import type { Category, ImportKind, MasterAuditEvent, MasterDecision, Ownership, OwnershipSetting, Product, RuleVersion, ScanRule, Sku, SubCategory, SyncConflict, SyncRun } from "@/types/masters";
import { ALL_BRANCHES, branchLabel, can, categoryById, categoryImpact, isBranchActive, isPortalEditable, outOfScope, pointsFields, productById, productOfSku, ruleConflicts, ruleFields, skuById, skuDependencies, skusOfProduct, validateProduct, validateRule, validateScanPoints, validateSkus, versionsOf, geoOf, type ImportCheck, type MasterState, type ProductDraft, type ScanPointDraft, type SkuDraft } from "./engine";
import { buildMasterState } from "./seed";

const STORAGE_KEY = "vg-rishta.master-store.v2";

function load(): MasterState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MasterState;
  } catch {
    /* fall through */
  }
  return buildMasterState();
}

let state: MasterState = load();
const listeners = new Set<() => void>();
function commit(next: MasterState) {
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const masterStore = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
export const useMasterState = () => useSyncExternalStore(masterStore.subscribe, masterStore.get, masterStore.get);
export const resetMasterDemoData = () => commit(buildMasterState());

/* ---------------- helpers ---------------- */

type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const now = () => demoNow();

function nextId(prefix: string, ids: string[], pad = 4) {
  const max = ids.reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, "")) || 0), 0);
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}

function audit(s: MasterState, e: Omit<MasterAuditEvent, "id" | "at" | "actorOrgId" | "ref" | "approvalRequestId" | "previousValue" | "newValue" | "remarks"> & Partial<Pick<MasterAuditEvent, "approvalRequestId" | "previousValue" | "newValue" | "remarks">>): MasterState {
  const n = s.audit.length + 1;
  const ev: MasterAuditEvent = { previousValue: null, newValue: null, remarks: "", approvalRequestId: null, ...e, id: `MAU-${String(n + 100).padStart(6, "0")}`, at: now(), actorOrgId: e.actorUserId === "SYSTEM" ? null : (primaryOrg(acc(), e.actorUserId)?.id ?? null), ref: `MRF-${String(9000 + n)}` };
  return { ...s, audit: [...s.audit, ev] };
}
const denied = (uid: string, module: string, action: Parameters<typeof can>[3]) => !can(acc(), uid, module, action);
const stampNew = (uid: string) => ({ createdAt: now(), createdBy: uid, updatedAt: now(), updatedBy: uid });

/** Latest approval request raised for a configuration version, if any. */
export function approvalFor(entityRef: string): ApprovalRequest | undefined {
  return [...approvalStore.get().requests].reverse().find((r) => r.entityRef === entityRef);
}

/* ======================= Products & SKUs ======================= */

export function createProduct(uid: string, d: ProductDraft, skus: SkuDraft[]): Res {
  if (denied(uid, "products", "create")) return NO("You need Product & SKU master: Create");
  const errs = validateProduct(state, d);
  const skuErrs = validateSkus(state, skus);
  if (Object.keys(errs).length || skuErrs.length) return NO(...Object.values(errs), ...skuErrs);
  const id = nextId("PRD-", state.products.map((p) => p.id));
  const product: Product = { id, code: d.code.trim(), name: d.name.trim(), description: d.description.trim(), categoryId: d.categoryId, subCategoryId: d.subCategoryId, status: d.status, warranty: d.warranty, installationRequired: d.installationRequired, source: "portal", ...stampNew(uid) };
  let s: MasterState = { ...state, products: [...state.products, product] };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "product", entityId: id, action: "product.created", newValue: `${product.code} · ${product.name} (${product.status})` });
  skus.forEach((k) => {
    const skuId = nextId("SKU-", s.skus.map((x) => x.id), 5);
    s = { ...s, skus: [...s.skus, { id: skuId, code: k.code.trim(), name: k.name.trim(), productId: id, status: k.status, programmes: k.programmes, ...stampNew(uid) }] };
    s = audit(s, { actorUserId: uid, module: "products", entityType: "sku", entityId: skuId, action: "sku.created", newValue: `${k.code} under ${product.code}` });
  });
  commit(s);
  return OK(id, skus.length ? [] : ["No SKU yet: add at least one SKU before configuring scan points"]);
}

export function updateProduct(uid: string, id: string, d: ProductDraft, reason: string): Res {
  if (denied(uid, "products", "edit")) return NO("You need Product & SKU master: Edit");
  const p = productById(state, id);
  if (!p) return NO("Product not found");
  const errs = validateProduct(state, d, id);
  if (Object.keys(errs).length) return NO(...Object.values(errs));
  if (d.status !== p.status) return NO("Change status with Activate / Deactivate so dependencies are checked");
  const changes = (["code", "name", "description", "categoryId", "subCategoryId"] as const).filter((k) => p[k] !== d[k]).map((k) => `${k}: ${p[k]} → ${d[k]}`);
  if (p.warranty.value !== d.warranty.value || p.warranty.unit !== d.warranty.unit) changes.push(`warranty: ${p.warranty.value ?? "—"} ${p.warranty.unit} → ${d.warranty.value ?? "—"} ${d.warranty.unit}`);
  if (p.installationRequired !== d.installationRequired) changes.push(`installation: ${p.installationRequired ? "yes" : "no"} → ${d.installationRequired ? "yes" : "no"}`);
  if (!changes.length) return NO("Nothing changed");
  const catChange = p.categoryId !== d.categoryId || p.subCategoryId !== d.subCategoryId;
  const affected = catChange ? state.rules.filter((r) => { const v = versionsOf(r.versions).active; return v && (v.scope.subCategoryIds.includes(p.subCategoryId) || v.scope.categoryIds.includes(p.categoryId)); }) : [];
  if (catChange && !reason.trim()) return NO("Give a reason: changing the category affects how scan rules apply");
  let s: MasterState = { ...state, products: state.products.map((x) => (x.id === id ? { ...x, ...d, code: d.code.trim(), name: d.name.trim(), updatedAt: now(), updatedBy: uid } : x)) };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "product", entityId: id, action: catChange ? "product.category_changed" : "product.updated", previousValue: changes.map((c) => c.split(" → ")[0]).join("; "), newValue: changes.join("; "), remarks: reason });
  commit(s);
  return OK(id, affected.length ? [`Category change affects active scan rules ${affected.map((r) => r.code).join(", ")}. They were not changed; review them in Scanning configuration`] : []);
}

export function setProductStatus(uid: string, id: string, status: Product["status"], reason: string): Res {
  if (denied(uid, "products", status === "inactive" ? "disable" : "edit")) return NO(`You need Product & SKU master: ${status === "inactive" ? "Disable" : "Edit"}`);
  const p = productById(state, id);
  if (!p) return NO("Product not found");
  if (!reason.trim()) return NO("A reason is required");
  if (status === "inactive") {
    const activeSkus = skusOfProduct(state, id).filter((k) => k.status === "active");
    if (activeSkus.length) return NO(`${activeSkus.length} SKU(s) are still active (${activeSkus.map((k) => k.code).join(", ")}). Deactivate them first; their scan configurations are checked there`);
  }
  if (status === "active") {
    const cat = categoryById(state, p.categoryId);
    if (cat?.status !== "active") return NO(`Category ${cat?.name} is inactive`);
  }
  let s: MasterState = { ...state, products: state.products.map((x) => (x.id === id ? { ...x, status, updatedAt: now(), updatedBy: uid } : x)) };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "product", entityId: id, action: status === "inactive" ? "product.deactivated" : "product.activated", previousValue: p.status, newValue: status, remarks: reason });
  commit(s);
  return OK(id);
}

export function saveSku(uid: string, productId: string, skuId: string | null, d: SkuDraft, reason: string): Res {
  const p = productById(state, productId);
  if (!p) return NO("Product not found");
  if (denied(uid, "products", skuId ? "edit" : "create")) return NO(`You need Product & SKU master: ${skuId ? "Edit" : "Create"}`);
  const errs = validateSkus(state, [d], skuId ? [skuId] : []);
  if (errs.length) return NO(...errs.map((e) => e.replace("SKU 1: ", "")));
  if (!skuId) {
    const id = nextId("SKU-", state.skus.map((x) => x.id), 5);
    let s: MasterState = { ...state, skus: [...state.skus, { id, code: d.code.trim(), name: d.name.trim(), productId, status: d.status, programmes: d.programmes, ...stampNew(uid) }] };
    s = audit(s, { actorUserId: uid, module: "products", entityType: "sku", entityId: id, action: "sku.created", newValue: `${d.code} under ${p.code}` });
    commit(s);
    return OK(id);
  }
  const k = skuById(state, skuId)!;
  const deps = skuDependencies(state, skuId);
  const referenced = deps.configs.length + deps.rules.length > 0;
  if (referenced && k.code !== d.code.trim()) return NO(`SKU code cannot change while ${[...deps.configs.map((c) => c.id), ...deps.rules.map((r) => r.code)].join(", ")} reference it`);
  if (d.status !== k.status) {
    if (!reason.trim()) return NO("A reason is required to change SKU status");
    if (d.status !== "active" && referenced) return NO(`Cannot deactivate: active or pending configurations reference this SKU (${[...deps.configs.map((c) => c.id), ...deps.rules.map((r) => r.code)].join(", ")}). Retire them first`);
    if (d.status === "active" && p.status !== "active") return NO("The product is not active");
    if (denied(uid, "products", "disable") && d.status === "inactive") return NO("You need Product & SKU master: Disable");
  }
  const dropped = k.programmes.filter((x) => !d.programmes.includes(x));
  const changes = [k.code !== d.code ? `code ${k.code} → ${d.code}` : "", k.name !== d.name ? `name → ${d.name}` : "", k.status !== d.status ? `status ${k.status} → ${d.status}` : "", JSON.stringify(k.programmes) !== JSON.stringify(d.programmes) ? `programmes ${k.programmes.join("|") || "—"} → ${d.programmes.join("|") || "—"}` : ""].filter(Boolean);
  if (!changes.length) return NO("Nothing changed");
  let s: MasterState = { ...state, skus: state.skus.map((x) => (x.id === skuId ? { ...x, ...d, code: d.code.trim(), name: d.name.trim(), updatedAt: now(), updatedBy: uid } : x)) };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "sku", entityId: skuId, action: d.status !== k.status ? (d.status === "inactive" ? "sku.deactivated" : "sku.status_changed") : "sku.updated", newValue: changes.join("; "), remarks: reason });
  commit(s);
  return OK(skuId, referenced ? [`Referenced by ${[...deps.configs.map((c) => c.id), ...deps.rules.map((r) => r.code)].join(", ")}; those configurations were not changed${dropped.length ? `. Removing ${dropped.join(", ")} may leave them pointing at programmes the SKU no longer serves` : ""}`] : []);
}

export function setProductMappings(uid: string, productId: string, branchCodes: string[], reason: string): Res {
  if (denied(uid, "products", "edit")) return NO("You need Product & SKU master: Edit");
  const p = productById(state, productId);
  if (!p) return NO("Product not found");
  if (!reason.trim()) return NO("A reason is required");
  const current = state.mappings.filter((m) => m.productId === productId && m.status === "active").map((m) => m.branchCode);
  const added = branchCodes.filter((c) => !current.includes(c));
  const removed = current.filter((c) => !branchCodes.includes(c));
  const outside = outOfScope(acc(), uid, "products", "edit", [...added, ...removed]);
  if (outside.length) return NO(`Outside your geographical scope: ${outside.map(branchLabel).join(", ")}`);
  const inactive = added.filter((c) => !isBranchActive(state, c));
  if (inactive.length) return NO(`Cannot map to inactive branch(es): ${inactive.map(branchLabel).join(", ")}`);
  const skuIds = skusOfProduct(state, productId).map((k) => k.id);
  const inUse = removed.filter((c) => state.scanPoints.some((sp) => skuIds.includes(sp.skuId) && sp.branchCodes.includes(c) && !sp.retired && versionsOf(sp.versions).active));
  if (inUse.length) return NO(`Active scan point configurations use ${inUse.map(branchLabel).join(", ")}. Retire those configurations before removing the mapping`);
  if (!added.length && !removed.length) return NO("Nothing changed");
  let s: MasterState = { ...state, mappings: [...state.mappings.map((m) => (m.productId === productId && removed.includes(m.branchCode) ? { ...m, status: "inactive" as const } : m)), ...added.map((c, i) => ({ id: `MAP-${productId.slice(4)}-N${Date.now().toString(36)}${i}`, productId, branchCode: c, status: "active" as const, createdAt: now(), createdBy: uid }))] };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "mapping", entityId: productId, action: "mapping.changed", previousValue: `${current.length} branches`, newValue: `+${added.length} / −${removed.length} → ${branchCodes.length} branches`, remarks: reason });
  commit(s);
  return OK(productId);
}

/* ======================= Bulk import ======================= */

export function runImport(uid: string, kind: ImportKind, meta: { fileName: string; sizeKb: number }, check: ImportCheck, mode: "valid_only" | "atomic"): Res {
  if (denied(uid, "products", "create")) return NO("You need Product & SKU master: Create");
  const id = nextId("IMP-", state.imports.map((b) => b.id));
  const errorCount = check.records.length - check.validRows.length;
  const reject = mode === "atomic" && (errorCount > 0 || check.issues.some((i) => i.row === 1 && i.severity === "error"));
  let s = state;
  let imported = 0;
  if (!reject) {
    for (const row of check.validRows) {
      const r = check.records[row - 2];
      if (kind === "product") {
        const cat = s.categories.find((c) => c.code.toLowerCase() === r.category_code.toLowerCase())!;
        const sub = s.subCategories.find((c) => c.code.toLowerCase() === r.sub_category_code.toLowerCase())!;
        const pid = nextId("PRD-", s.products.map((p) => p.id));
        s = { ...s, products: [...s.products, { id: pid, code: r.product_code, name: r.product_name, description: r.description ?? "", categoryId: cat.id, subCategoryId: sub.id, status: r.status.toLowerCase() as Product["status"], warranty: { value: r.warranty_value ? Number(r.warranty_value) : null, unit: (r.warranty_unit?.toLowerCase() || "years") as "months" | "years" }, installationRequired: r.installation_required?.toLowerCase() === "yes", source: "bulk_import", ...stampNew(uid) }] };
      } else {
        const p = s.products.find((x) => x.code.toLowerCase() === r.product_code.toLowerCase());
        if (!p) continue;
        const sid = nextId("SKU-", s.skus.map((x) => x.id), 5);
        s = { ...s, skus: [...s.skus, { id: sid, code: r.sku_code, name: r.sku_name ?? "", productId: p.id, status: r.status.toLowerCase() as Sku["status"], programmes: (r.programmes ?? "").split("|").map((x) => x.trim()).filter(Boolean), ...stampNew(uid) }] };
      }
      imported++;
    }
  }
  const total = check.records.length;
  const batch = { id, kind, fileName: meta.fileName, sizeKb: meta.sizeKb, uploadedAt: now(), uploadedBy: uid, mode, total, imported, rejected: reject ? total : errorCount, skipped: reject ? 0 : total - imported - errorCount, status: reject ? ("rejected" as const) : errorCount ? ("partial" as const) : ("completed" as const), completedAt: now(), issues: check.issues };
  s = { ...s, imports: [...s.imports, batch] };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "import", entityId: id, action: `import.${batch.status}`, newValue: `${kind}: ${imported} imported, ${batch.rejected} rejected of ${total}`, remarks: `${meta.fileName} · mode ${mode === "atomic" ? "reject whole batch on any error" : "import valid rows"}` });
  commit(s);
  return { ok: !reject, errors: reject ? [`Batch rejected: ${errorCount} invalid row(s) and the atomic mode allows none`] : [], warnings: [], id };
}

/* ======================= Categories ======================= */

export function saveCategory(uid: string, id: string | null, d: Pick<Category, "name" | "code" | "description">): Res {
  if (denied(uid, "categories", id ? "edit" : "create")) return NO(`You need Category & sub-category: ${id ? "Edit" : "Create"}`);
  const errors: string[] = [];
  if (!d.name.trim()) errors.push("Category name is required");
  if (!/^[A-Z0-9_]{2,40}$/.test(d.code)) errors.push("Category code: 2–40 capitals, digits or _");
  if (state.categories.some((c) => c.id !== id && c.name.trim().toLowerCase() === d.name.trim().toLowerCase())) errors.push(`A category named ${d.name.trim()} already exists`);
  if (state.categories.some((c) => c.id !== id && c.code === d.code)) errors.push(`Category code ${d.code} is already used`);
  if (errors.length) return NO(...errors);
  const nid = id ?? nextId("CAT-", state.categories.map((c) => c.id), 3);
  const prev = id ? categoryById(state, id) : undefined;
  let s: MasterState = id ? { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, ...d, name: d.name.trim(), updatedAt: now(), updatedBy: uid } : c)) } : { ...state, categories: [...state.categories, { id: nid, ...d, name: d.name.trim(), status: "active", ...stampNew(uid) }] };
  s = audit(s, { actorUserId: uid, module: "categories", entityType: "category", entityId: nid, action: id ? "category.updated" : "category.created", previousValue: prev ? `${prev.code} · ${prev.name}` : null, newValue: `${d.code} · ${d.name}` });
  commit(s);
  return OK(nid);
}

export function saveSubCategory(uid: string, id: string | null, d: Pick<SubCategory, "name" | "code" | "description" | "categoryId">): Res {
  if (denied(uid, "categories", id ? "edit" : "create")) return NO(`You need Category & sub-category: ${id ? "Edit" : "Create"}`);
  const errors: string[] = [];
  const parent = categoryById(state, d.categoryId);
  if (!parent) errors.push("Parent category is required");
  else if (parent.status !== "active") errors.push(`${parent.name} is inactive; choose an active parent category`);
  if (!d.name.trim()) errors.push("Sub-category name is required");
  if (!/^[A-Z0-9_]{2,60}$/.test(d.code)) errors.push("Sub-category code: 2–60 capitals, digits or _");
  if (state.subCategories.some((c) => c.id !== id && c.categoryId === d.categoryId && c.name.trim().toLowerCase() === d.name.trim().toLowerCase())) errors.push(`${parent?.name} already has a sub-category named ${d.name.trim()}`);
  if (state.subCategories.some((c) => c.id !== id && c.code === d.code)) errors.push(`Code ${d.code} is already used`);
  const prev = id ? state.subCategories.find((x) => x.id === id) : undefined;
  if (prev && prev.categoryId !== d.categoryId && state.products.some((p) => p.subCategoryId === id)) errors.push("Products use this sub-category; it cannot move to another parent category. Create a new sub-category instead");
  if (errors.length) return NO(...errors);
  const nid = id ?? `SUB-${String(state.subCategories.length + 100)}`;
  let s: MasterState = id ? { ...state, subCategories: state.subCategories.map((c) => (c.id === id ? { ...c, ...d, name: d.name.trim(), updatedAt: now(), updatedBy: uid } : c)) } : { ...state, subCategories: [...state.subCategories, { id: nid, ...d, name: d.name.trim(), status: "active", ...stampNew(uid) }] };
  s = audit(s, { actorUserId: uid, module: "categories", entityType: "sub_category", entityId: nid, action: id ? "sub_category.updated" : "sub_category.created", previousValue: prev ? `${prev.code} · ${prev.name}` : null, newValue: `${d.code} · ${d.name} under ${parent?.name}` });
  commit(s);
  return OK(nid);
}

export function setCategoryStatus(uid: string, kind: "category" | "sub_category", id: string, status: "active" | "inactive", reason: string): Res {
  if (denied(uid, "categories", status === "inactive" ? "disable" : "edit")) return NO(`You need Category & sub-category: ${status === "inactive" ? "Disable" : "Edit"}`);
  if (!reason.trim()) return NO("A reason is required");
  const rec = kind === "category" ? categoryById(state, id) : state.subCategories.find((x) => x.id === id);
  if (!rec) return NO("Not found");
  if (status === "inactive") {
    const imp = categoryImpact(state, kind === "category" ? { categoryId: id } : { subCategoryId: id });
    const blockers = [imp.activeProducts.length ? `${imp.activeProducts.length} active product(s)` : "", imp.activeSkus ? `${imp.activeSkus} active SKU(s)` : "", imp.configs.length ? `${imp.configs.length} active scan point configuration(s)` : "", imp.rules.length ? `${imp.rules.length} live scan rule(s)` : "", imp.subCategories.length ? `${imp.subCategories.length} active sub-categories` : ""].filter(Boolean);
    if (blockers.length) return NO(`${rec.name} cannot be deactivated while it has ${blockers.join(", ")}. Products are never remapped automatically; move or retire them first`);
  } else if (kind === "sub_category") {
    const parent = categoryById(state, (rec as SubCategory).categoryId);
    if (parent?.status !== "active") return NO(`Parent category ${parent?.name} is inactive`);
  }
  let s: MasterState = kind === "category" ? { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, status, updatedAt: now(), updatedBy: uid } : c)) } : { ...state, subCategories: state.subCategories.map((c) => (c.id === id ? { ...c, status, updatedAt: now(), updatedBy: uid } : c)) };
  s = audit(s, { actorUserId: uid, module: "categories", entityType: kind, entityId: id, action: `${kind}.${status === "inactive" ? "deactivated" : "activated"}`, previousValue: rec.status, newValue: status, remarks: reason });
  commit(s);
  return OK(id);
}

/* ======================= Branch hierarchy & SFDC ======================= */

export function setOwnership(uid: string, dataType: OwnershipSetting["dataType"], ownership: Ownership, reason: string): Res {
  if (denied(uid, "branches", "manage")) return NO("Only administrators with Branch & hierarchy: Manage change data ownership");
  if (!reason.trim()) return NO("A reason is required");
  const decision = state.decisions.find((d) => d.id === "MDR-01");
  if (ownership === "portal_managed" && decision?.status !== "confirmed") return NO(`Portal managed cannot be enabled while ${decision?.ref} is ${decision?.status.replace("_", " ")}. Record the business confirmation in the decision register first`);
  const prev = state.ownership.find((o) => o.dataType === dataType)!;
  let s: MasterState = { ...state, ownership: state.ownership.map((o) => (o.dataType === dataType ? { ...o, ownership, updatedAt: now(), updatedBy: uid } : o)) };
  s = audit(s, { actorUserId: uid, module: "branches", entityType: "setting", entityId: dataType, action: "ownership.changed", previousValue: prev.ownership, newValue: ownership, remarks: reason });
  commit(s);
  return OK(dataType);
}

export function updateBranchRecord(uid: string, code: string, patch: { pincodes?: string[]; status?: "active" | "inactive" }, reason: string): Res {
  if (denied(uid, "branches", "edit")) return NO("You need Branch & hierarchy: Edit");
  if (patch.status !== undefined && !isPortalEditable(state, "hierarchy")) return NO("The branch hierarchy is SFDC managed. It is read-only in the portal; change it in SFDC and let the synchronisation bring it in");
  if (patch.pincodes !== undefined && !isPortalEditable(state, "pincode")) return NO("Pincode mapping is not portal managed (OP-51 / OP-10 awaiting confirmation). It stays read-only");
  if (outOfScope(acc(), uid, "branches", "edit", [code]).length) return NO("This branch is outside your geographical scope");
  if (!reason.trim()) return NO("A reason is required");
  const rec = state.hierarchy.find((h) => h.code === code);
  if (!rec) return NO("Branch not found");
  if (patch.pincodes?.some((p) => !/^\d{6}$/.test(p))) return NO("Pincodes are six digits");
  if (patch.status === "inactive" && state.scanPoints.some((c) => !c.retired && c.branchCodes.includes(code) && versionsOf(c.versions).active)) return NO("Active scan point configurations use this branch. Retire them first");
  let s: MasterState = { ...state, hierarchy: state.hierarchy.map((h) => (h.code === code ? { ...h, ...patch } : h)) };
  s = audit(s, { actorUserId: uid, module: "branches", entityType: "branch", entityId: code, action: "branch.updated", previousValue: JSON.stringify({ pincodes: rec.pincodes, status: rec.status }), newValue: JSON.stringify(patch), remarks: reason });
  commit(s);
  return OK(code);
}

/** Mock SFDC sync: records with open conflicts are skipped, failures are reported, nothing is overwritten. */
export function runMockSync(uid: string): Res & { run?: SyncRun } {
  if (denied(uid, "branches", "manage")) return NO("Only administrators with Branch & hierarchy: Manage can trigger a synchronisation");
  const at = now();
  const failed = state.hierarchy.filter((h) => h.syncStatus === "failed");
  // A record is either failed or skipped for an open conflict, never both.
  const conflicted = new Set(state.conflicts.filter((c) => c.status !== "resolved_by_source" && !failed.some((f) => f.code === c.recordCode)).map((c) => c.recordCode));
  const total = state.hierarchy.length;
  const run: SyncRun = { id: `SYN-${at.slice(2, 10).replace(/-/g, "")}-${state.syncRuns.length + 1}`, source: "SFDC", startedAt: at, completedAt: at, total, succeeded: total - failed.length - conflicted.size, failed: failed.length, skipped: conflicted.size, status: failed.length ? "partial" : "completed", errors: [...failed.map((h) => ({ recordCode: h.code, error: h.lastSyncError ?? "Validation failed" })), ...Array.from(conflicted).map((c) => ({ recordCode: c, error: "Open conflict: skipped, portal record not overwritten" }))], mock: true };
  let s: MasterState = { ...state, syncRuns: [...state.syncRuns, run], hierarchy: state.hierarchy.map((h) => (h.syncStatus === "synced" ? { ...h, lastSyncedAt: at } : h)) };
  s = audit(s, { actorUserId: uid, module: "branches", entityType: "sync", entityId: run.id, action: failed.length ? "sync.failed" : "sync.completed", newValue: `${run.succeeded} ok · ${run.failed} failed · ${run.skipped} skipped`, remarks: "Mock synchronisation (no SFDC connection)" });
  commit(s);
  return { ...OK(run.id, failed.length ? [`${failed.length} record(s) failed and ${conflicted.size} were skipped; existing records were left unchanged`] : []), run };
}

export function reviewConflict(uid: string, id: string, status: SyncConflict["status"], note: string): Res {
  if (denied(uid, "branches", "manage")) return NO("Only administrators with Branch & hierarchy: Manage review conflicts");
  if (!note.trim()) return NO("Add a review note");
  const c = state.conflicts.find((x) => x.id === id);
  if (!c) return NO("Conflict not found");
  let s: MasterState = { ...state, conflicts: state.conflicts.map((x) => (x.id === id ? { ...x, status, note } : x)) };
  s = audit(s, { actorUserId: uid, module: "branches", entityType: "sync", entityId: c.recordCode, action: "sync.conflict_reviewed", previousValue: c.status, newValue: status, remarks: note });
  commit(s);
  return OK(id, status === "resolved_by_source" ? ["Marked for resolution in SFDC. The portal value is unchanged until the next synchronisation brings the corrected record"] : []);
}

/* ======================= Scan points ======================= */

function scanScope(uid: string, branches: string[], action: "create" | "submit") {
  return outOfScope(acc(), uid, "scan-config", action, branches);
}

export function saveScanPointDraft(uid: string, configId: string | null, d: ScanPointDraft, retire = false): Res {
  if (denied(uid, "scan-config", configId ? "edit" : "create")) return NO(`You need Scanning configuration: ${configId ? "Edit" : "Create"}`);
  const cfg = configId ? state.scanPoints.find((c) => c.id === configId) : undefined;
  if (configId && !cfg) return NO("Configuration not found");
  const branches = cfg ? cfg.branchCodes : d.branchCodes;
  const outside = scanScope(uid, branches, "create");
  if (outside.length) return NO(`Outside your geographical scope: ${outside.slice(0, 5).map(branchLabel).join(", ")}${outside.length > 5 ? "…" : ""}`);
  const draft = cfg ? { ...d, skuId: cfg.skuId, branchCodes: cfg.branchCodes, programmes: cfg.programmes } : d;
  if (!retire) {
    const v = validateScanPoints(state, draft, configId ?? undefined);
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };
  }
  const t = now();
  if (!cfg) {
    const id = nextId("SPC-", state.scanPoints.map((c) => c.id));
    let s: MasterState = { ...state, scanPoints: [...state.scanPoints, { id, skuId: d.skuId, programmes: d.programmes, branchCodes: d.branchCodes, createdBy: uid, createdAt: t, retired: false, versions: [{ version: 1, status: "draft", scanIn: d.scanIn, scanOut: d.scanOut, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo, remarks: d.remarks, approvalRequestId: null, createdBy: uid, createdAt: t, updatedAt: t, activatedAt: null }] }] };
    s = audit(s, { actorUserId: uid, module: "scan-config", entityType: "scan_points", entityId: id, action: "scan_points.created", newValue: `In ${d.scanIn ?? "—"} / Out ${d.scanOut ?? "—"} · ${d.branchCodes.length} branch(es)` });
    commit(s);
    return OK(id);
  }
  const vs = versionsOf(cfg.versions);
  const pendingApproval = vs.pending ? approvalFor(`${cfg.id} v${vs.pending.version}`) : undefined;
  if (vs.pending && pendingApproval?.status !== "returned" && !["rejected", "withdrawn"].includes(pendingApproval?.status ?? "")) return NO(`Version ${vs.pending.version} is waiting for approval (${pendingApproval?.id}). It cannot be edited until the Checker decides`);
  let versions = cfg.versions.map((v) => (v === vs.pending && pendingApproval && ["rejected", "withdrawn"].includes(pendingApproval.status) ? { ...v, status: pendingApproval.status as "rejected" | "withdrawn" } : v));
  const target = versions.find((v) => v.status === "draft") ?? (vs.pending && pendingApproval?.status === "returned" ? vs.pending : undefined);
  const fields = { scanIn: draft.scanIn, scanOut: draft.scanOut, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.effectiveTo, remarks: draft.remarks, retire, updatedAt: t };
  if (target) versions = versions.map((v) => (v.version === target.version ? { ...v, ...fields } : v));
  else versions = [...versions, { version: versions.length + 1, status: "draft", ...fields, approvalRequestId: null, createdBy: uid, createdAt: t, activatedAt: null }];
  let s: MasterState = { ...state, scanPoints: state.scanPoints.map((c) => (c.id === cfg.id ? { ...c, versions } : c)) };
  s = audit(s, { actorUserId: uid, module: "scan-config", entityType: "scan_points", entityId: cfg.id, action: target ? "scan_points.updated" : "scan_points.version_created", newValue: retire ? "Proposed retirement" : `In ${draft.scanIn ?? "—"} / Out ${draft.scanOut ?? "—"}`, remarks: draft.remarks });
  commit(s);
  return OK(cfg.id);
}

export function submitScanPoints(uid: string, configId: string): Res {
  const cfg = state.scanPoints.find((c) => c.id === configId);
  if (!cfg) return NO("Configuration not found");
  if (denied(uid, "scan-config", "submit")) return NO("You need Scanning configuration: Submit (a Maker profile)");
  const outside = scanScope(uid, cfg.branchCodes, "submit");
  if (outside.length) return NO(`Outside your geographical scope: ${outside.slice(0, 5).map(branchLabel).join(", ")}`);
  const vs = versionsOf(cfg.versions);
  const target = vs.draft ?? vs.pending;
  if (!target) return NO("There is no draft to submit");
  const existing = vs.pending ? approvalFor(`${cfg.id} v${vs.pending.version}`) : undefined;
  if (!target.retire) {
    const v = validateScanPoints(state, { skuId: cfg.skuId, programmes: cfg.programmes, branchCodes: cfg.branchCodes, scanIn: target.scanIn, scanOut: target.scanOut, effectiveFrom: target.effectiveFrom, effectiveTo: target.effectiveTo, remarks: target.remarks }, cfg.id);
    if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };
  }
  if (!target.remarks.trim()) return NO("Add remarks explaining the change; they are the reason the Checker sees");
  const fields = pointsFields(state, cfg, vs.active ?? null, target, !!target.retire);
  const sku = skuById(state, cfg.skuId);
  const states = Array.from(new Set(cfg.branchCodes.map((c) => geoOf(c).state)));
  let res: Res;
  if (existing?.status === "returned") {
    const up = updateWorkingVersion(uid, existing.id, { fields, reason: target.remarks, justification: target.remarks });
    res = up.ok ? resubmitRequest(uid, existing.id) : up;
    if (res.ok) res.id = existing.id;
  } else {
    res = createRequest(uid, { requestType: "scan_points_change", title: `${target.retire ? "Retire" : vs.active ? "Change" : "Configure"} scan points for ${sku?.code ?? cfg.skuId}`, entityRef: `${cfg.id} v${target.version}`, programme: cfg.programmes.length === 1 ? cfg.programmes[0] : null, location: states.length === 1 ? { state: states[0] } : null, amount: null, fields, purpose: target.remarks, reason: target.remarks, justification: "", attachments: [], impact: { affectedBranches: cfg.branchCodes.map(branchLabel), effectiveDate: target.effectiveFrom ?? undefined } }, true);
  }
  if (!res.ok || !res.id) return res;
  let s: MasterState = { ...state, scanPoints: state.scanPoints.map((c) => (c.id === cfg.id ? { ...c, versions: c.versions.map((v) => (v.version === target.version ? { ...v, status: "submitted" as const, approvalRequestId: res.id! } : v)) } : c)) };
  s = audit(s, { actorUserId: uid, module: "scan-config", entityType: "scan_points", entityId: cfg.id, action: "scan_points.submitted", newValue: `v${target.version}`, approvalRequestId: res.id });
  commit(s);
  return OK(res.id, res.warnings);
}

/* ======================= Scan restriction rules ======================= */

export type RuleHeader = Pick<ScanRule, "name" | "code" | "description" | "ruleType" | "context">;
export type RuleDraft = Omit<RuleVersion, "version" | "status" | "approvalRequestId" | "createdBy" | "createdAt" | "updatedAt" | "activatedAt">;

function ruleBranches(d: RuleDraft) {
  return d.scope.allBranches ? ["*"] : d.scope.branchCodes;
}

export function saveRuleDraft(uid: string, ruleId: string | null, header: RuleHeader, d: RuleDraft): Res {
  if (denied(uid, "scan-config", ruleId ? "edit" : "create")) return NO(`You need Scanning configuration: ${ruleId ? "Edit" : "Create"}`);
  const branches = ruleBranches(d);
  const outside = branches[0] === "*" ? (outOfScope(acc(), uid, "scan-config", "create", ALL_BRANCHES.map((b) => b.code)).length ? ["all branches"] : []) : scanScope(uid, branches, "create");
  if (outside.length) return NO(`Outside your geographical scope: ${outside.slice(0, 5).map((c) => (c === "all branches" ? c : branchLabel(c))).join(", ")}`);
  if (!header.name.trim()) return NO("Rule name is required");
  const t = now();
  const rule = ruleId ? state.rules.find((r) => r.id === ruleId) : undefined;
  if (ruleId && !rule) return NO("Rule not found");
  if (!rule) {
    if (state.rules.some((r) => r.code === header.code)) return NO(`Rule code ${header.code} is already used`);
    const id = nextId("SRR-", state.rules.map((r) => r.id));
    let s: MasterState = { ...state, rules: [...state.rules, { id, ...header, createdBy: uid, createdAt: t, versions: [{ ...d, version: 1, status: "draft", approvalRequestId: null, createdBy: uid, createdAt: t, updatedAt: t, activatedAt: null }] }] };
    s = audit(s, { actorUserId: uid, module: "scan-config", entityType: "scan_rule", entityId: id, action: "scan_rule.created", newValue: `${header.code} draft v1` });
    commit(s);
    return OK(id);
  }
  const vs = versionsOf(rule.versions);
  const pendingApproval = vs.pending ? approvalFor(`${rule.id} v${vs.pending.version}`) : undefined;
  if (vs.pending && pendingApproval && !["returned", "rejected", "withdrawn"].includes(pendingApproval.status)) return NO(`Version ${vs.pending.version} is waiting for approval (${pendingApproval.id}). The active version stays in force until the Checker decides`);
  let versions = rule.versions.map((v) => (v === vs.pending && pendingApproval && ["rejected", "withdrawn"].includes(pendingApproval.status) ? { ...v, status: pendingApproval.status as "rejected" | "withdrawn" } : v));
  const target = versions.find((v) => v.status === "draft") ?? (vs.pending && pendingApproval?.status === "returned" ? vs.pending : undefined);
  if (target) versions = versions.map((v) => (v.version === target.version ? { ...v, ...d, updatedAt: t } : v));
  else versions = [...versions, { ...d, version: versions.length + 1, status: "draft", approvalRequestId: null, createdBy: uid, createdAt: t, updatedAt: t, activatedAt: null }];
  const editableHeader = !vs.active;
  let s: MasterState = { ...state, rules: state.rules.map((r) => (r.id === rule.id ? { ...r, ...(editableHeader ? header : { name: header.name, description: header.description }), versions } : r)) };
  s = audit(s, { actorUserId: uid, module: "scan-config", entityType: "scan_rule", entityId: rule.id, action: target ? "scan_rule.updated" : "scan_rule.version_created", newValue: `v${target?.version ?? versions.length}${d.deactivate ? " (deactivation)" : ""}`, remarks: d.justification });
  commit(s);
  return OK(rule.id, target && vs.pending === target ? ["Correction saved to the returned version. Submit to resubmit it"] : []);
}

export function submitRule(uid: string, ruleId: string, acknowledged: boolean): Res & { validation?: ReturnType<typeof validateRule> } {
  const rule = state.rules.find((r) => r.id === ruleId);
  if (!rule) return NO("Rule not found");
  if (denied(uid, "scan-config", "submit")) return NO("You need Scanning configuration: Submit (a Maker profile). Viewers cannot change rules");
  const vs = versionsOf(rule.versions);
  const target = vs.draft ?? vs.pending;
  if (!target) return NO("There is no draft version to submit");
  const existing = vs.pending ? approvalFor(`${rule.id} v${vs.pending.version}`) : undefined;
  if (vs.pending && existing && existing.status !== "returned") return NO(`Version ${vs.pending.version} is already with ${existing.id}`);
  const branches = target.scope.allBranches ? [] : target.scope.branchCodes;
  const outside = scanScope(uid, branches, "submit");
  if (outside.length) return NO(`Outside your geographical scope: ${outside.slice(0, 5).map(branchLabel).join(", ")}`);
  const validation = validateRule(state, rule.id, rule, target);
  if (!target.deactivate && validation.errors.length) return { ok: false, errors: validation.errors, warnings: validation.warnings, validation };
  if (validation.warnings.length && !acknowledged) return { ok: false, errors: ["Review and acknowledge the warnings before submitting"], warnings: validation.warnings, validation };
  const type = target.deactivate ? "scan_rule_deactivate" : vs.active && !vs.active.deactivate ? "scan_rule_modify" : "scan_rule_create";
  const fields = ruleFields(state, rule, vs.active && !vs.active.deactivate ? vs.active : null, target);
  const states = Array.from(new Set(target.scope.branchCodes.map((c) => geoOf(c).state)));
  let res: Res;
  if (existing?.status === "returned") {
    const up = updateWorkingVersion(uid, existing.id, { fields, reason: target.justification, justification: target.justification });
    res = up.ok ? resubmitRequest(uid, existing.id) : up;
    if (res.ok) res.id = existing.id;
  } else {
    res = createRequest(uid, { requestType: type, title: `${type === "scan_rule_create" ? "Create" : type === "scan_rule_modify" ? "Change" : "Deactivate"} scan rule ${rule.code}`, entityRef: `${rule.id} v${target.version}`, programme: target.scope.programmes.length === 1 ? target.scope.programmes[0] : null, location: !target.scope.allBranches && states.length === 1 ? { state: states[0] } : null, amount: null, fields, purpose: rule.description || rule.name, reason: target.justification, justification: validation.warnings.length ? `Maker acknowledged: ${validation.warnings.join(" | ")}` : "", attachments: [], impact: { affectedBranches: target.scope.allBranches ? ["All branches"] : target.scope.branchCodes.map(branchLabel), operationalImpact: `${validation.conflicts.length ? `Overlaps ${validation.conflicts.map((c) => c.code).join(", ")}. ` : ""}Outcome: ${target.outcome.kind === "unconfigured" ? "not configured" : "source-defined exception"}` } }, true);
  }
  if (!res.ok || !res.id) return { ...res, validation };
  let s: MasterState = { ...state, rules: state.rules.map((r) => (r.id === rule.id ? { ...r, versions: r.versions.map((v) => (v.version === target.version ? { ...v, status: "submitted" as const, approvalRequestId: res.id! } : v)) } : r)) };
  s = audit(s, { actorUserId: uid, module: "scan-config", entityType: "scan_rule", entityId: rule.id, action: "scan_rule.submitted", newValue: `v${target.version} → ${type}`, approvalRequestId: res.id, remarks: target.justification });
  commit(s);
  return { ...OK(res.id, res.warnings), validation };
}

/* ======================= Activation (called by the approval execution adapter) ======================= */

function activateFromApproval(r: ApprovalRequest) {
  const [entityId, vTag] = r.entityRef.split(" ");
  const version = Number(vTag?.replace("v", ""));
  const t = now();
  if (entityId.startsWith("SRR-")) {
    const rule = state.rules.find((x) => x.id === entityId);
    const v = rule?.versions.find((x) => x.version === version);
    if (!rule || !v) return { ok: false, message: `Scanning configuration has no ${r.entityRef}; nothing was activated` };
    if (v.status === "active") return { ok: true, message: `${r.entityRef} is already active (idempotent re-run under ${r.execution.ref})` };
    const blocking = ruleConflicts(state, rule.id, rule, v).filter((c) => c.blocking && state.rules.find((x) => x.id === c.ruleId)?.versions.some((y) => y.status === "active" && !y.deactivate));
    if (blocking.length) return { ok: false, message: `Activation stopped: ${r.entityRef} now overlaps active rule ${blocking.map((c) => c.code).join(", ")} and precedence is not confirmed. The previous version stays active` };
    let s: MasterState = { ...state, rules: state.rules.map((x) => (x.id === rule.id ? { ...x, versions: x.versions.map((y) => (y.version === version ? { ...y, status: "active" as const, activatedAt: t, approvalRequestId: r.id } : y.status === "active" ? { ...y, status: "superseded" as const } : y)) } : x)) };
    s = audit(s, { actorUserId: "SYSTEM", module: "scan-config", entityType: "scan_rule", entityId: rule.id, action: v.deactivate ? "scan_rule.deactivated" : "scan_rule.activated", previousValue: versionsOf(rule.versions).active ? `v${versionsOf(rule.versions).active!.version}` : null, newValue: `v${version}`, approvalRequestId: r.id, remarks: `Approved and executed under ${r.execution.ref}` });
    commit(s);
    return { ok: true, message: `${rule.code} v${version} ${v.deactivate ? "deactivated the rule" : "is now active"}; the previous version is kept in history. Development store only: the mobile scan engine is not connected` };
  }
  if (entityId.startsWith("SPC-")) {
    const cfg = state.scanPoints.find((x) => x.id === entityId);
    const v = cfg?.versions.find((x) => x.version === version);
    if (!cfg || !v) return { ok: false, message: `Scanning configuration has no ${r.entityRef}; nothing was activated` };
    if (v.status === "active") return { ok: true, message: `${r.entityRef} is already active` };
    if (!v.retire && !cfg.branchCodes.every((c) => isBranchActive(state, c))) return { ok: false, message: "A branch in this configuration is now inactive. The previous version stays active" };
    let s: MasterState = { ...state, scanPoints: state.scanPoints.map((x) => (x.id === cfg.id ? { ...x, retired: !!v.retire, versions: x.versions.map((y) => (y.version === version ? { ...y, status: "active" as const, activatedAt: t, approvalRequestId: r.id } : y.status === "active" ? { ...y, status: "superseded" as const } : y)) } : x)) };
    s = audit(s, { actorUserId: "SYSTEM", module: "scan-config", entityType: "scan_points", entityId: cfg.id, action: v.retire ? "scan_points.retired" : "scan_points.activated", newValue: v.retire ? "Retired" : `v${version}: In ${v.scanIn ?? "—"} / Out ${v.scanOut ?? "—"}`, approvalRequestId: r.id });
    commit(s);
    return { ok: true, message: `${cfg.id} v${version} ${v.retire ? "retired" : "is now active"}. Development store only` };
  }
  return { ok: false, message: `Unrecognised configuration reference ${r.entityRef}` };
}
registerExecutionHandler("scan-config", activateFromApproval);

/* ======================= Decision register ======================= */

export function updateMasterDecision(uid: string, id: string, patch: Pick<MasterDecision, "status" | "answer">): Res {
  if (!hasPermission(acc(), uid, "users", "manage").allowed) return NO("Only Evolve platform administrators record business decisions");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer and who confirmed it");
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  let s: MasterState = { ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  s = audit(s, { actorUserId: uid, module: "products", entityType: "setting", entityId: id, action: "decision.recorded", previousValue: d.status, newValue: patch.status, remarks: patch.answer });
  commit(s);
  return OK(id, patch.status === "confirmed" ? ["Confirming a decision changes no configuration by itself"] : []);
}

export { productOfSku };
