/**
 * Master data & scanning configuration API contract — PLACEHOLDER for backend integration.
 *
 * Screens call the in-browser store (features/masters/store.ts). No endpoints are defined because
 * none have been agreed. The backend must enforce the same rules as features/masters/engine.ts and
 * store.ts: RBAC and geographical scope, SFDC data ownership, dependency checks, rule validation,
 * and activation of scanning changes only through the approval engine's execution step.
 * Hierarchy data arrives from SFDC; the portal never writes back to SFDC.
 */
import * as store from "@/features/masters/store";
import type { ImportCheck, ProductDraft, ScanPointDraft, SkuDraft } from "@/features/masters/engine";
import { simulate, validateRule, type SimContext } from "@/features/masters/engine";
import type { PolicyResult } from "@/features/access/engine";
import type { Category, HierarchyRecord, ImportKind, Product, ScanPointConfig, ScanRule, Sku, SubCategory, SyncRun } from "@/types/masters";
import { ApiNotConnectedError } from "./api";

export interface MasterDataApi {
  getProducts(): Promise<Product[]>;
  createProduct(actorId: string, d: ProductDraft, skus: SkuDraft[]): Promise<PolicyResult>;
  updateProduct(actorId: string, id: string, d: ProductDraft, reason: string): Promise<PolicyResult>;
  getSkus(): Promise<Sku[]>;
  saveSku(actorId: string, productId: string, skuId: string | null, d: SkuDraft, reason: string): Promise<PolicyResult>;
  getCategories(): Promise<Category[]>;
  getSubCategories(): Promise<SubCategory[]>;
  getBranchHierarchy(): Promise<HierarchyRecord[]>;
  getHierarchySyncHistory(): Promise<SyncRun[]>;
  getScanPointConfigurations(): Promise<ScanPointConfig[]>;
  saveScanPointConfiguration(actorId: string, id: string | null, d: ScanPointDraft): Promise<PolicyResult>;
  getScanRestrictionRules(): Promise<ScanRule[]>;
  validateScanRestrictionRule: typeof validateRule;
  simulateScanRestrictionRule: typeof simulate;
  submitConfigurationForApproval(actorId: string, kind: "rule" | "points", id: string): Promise<PolicyResult>;
  processBulkImport(actorId: string, kind: ImportKind, meta: { fileName: string; sizeKb: number }, check: ImportCheck, mode: "valid_only" | "atomic"): Promise<PolicyResult>;
}

const s = () => store.masterStore.get();

export const mockMasterDataApi: MasterDataApi = {
  getProducts: async () => s().products,
  createProduct: async (a, d, k) => store.createProduct(a, d, k),
  updateProduct: async (a, id, d, r) => store.updateProduct(a, id, d, r),
  getSkus: async () => s().skus,
  saveSku: async (a, p, id, d, r) => store.saveSku(a, p, id, d, r),
  getCategories: async () => s().categories,
  getSubCategories: async () => s().subCategories,
  getBranchHierarchy: async () => s().hierarchy,
  getHierarchySyncHistory: async () => s().syncRuns,
  getScanPointConfigurations: async () => s().scanPoints,
  saveScanPointConfiguration: async (a, id, d) => store.saveScanPointDraft(a, id, d),
  getScanRestrictionRules: async () => s().rules,
  validateScanRestrictionRule: validateRule,
  simulateScanRestrictionRule: simulate,
  submitConfigurationForApproval: async (a, kind, id) => (kind === "rule" ? store.submitRule(a, id, true) : store.submitScanPoints(a, id)),
  processBulkImport: async (a, k, m, c, mode) => store.runImport(a, k, m, c, mode),
};

const nc = (op: string) => async (): Promise<never> => {
  throw new ApiNotConnectedError(op);
};

/** HTTP implementation: not connected. Pure validation and simulation stay client-side previews. */
export const httpMasterDataApi: MasterDataApi = {
  getProducts: nc("masters.getProducts"),
  createProduct: nc("masters.createProduct"),
  updateProduct: nc("masters.updateProduct"),
  getSkus: nc("masters.getSkus"),
  saveSku: nc("masters.saveSku"),
  getCategories: nc("masters.getCategories"),
  getSubCategories: nc("masters.getSubCategories"),
  getBranchHierarchy: nc("masters.getBranchHierarchy"),
  getHierarchySyncHistory: nc("masters.getHierarchySyncHistory"),
  getScanPointConfigurations: nc("masters.getScanPointConfigurations"),
  saveScanPointConfiguration: nc("masters.saveScanPointConfiguration"),
  getScanRestrictionRules: nc("masters.getScanRestrictionRules"),
  validateScanRestrictionRule: validateRule,
  simulateScanRestrictionRule: simulate,
  submitConfigurationForApproval: nc("masters.submitConfigurationForApproval"),
  processBulkImport: nc("masters.processBulkImport"),
};

export type { SimContext };
