import { SEED_CATEGORIES, SEED_CONFLICTS, SEED_HIERARCHY, SEED_IMPORT_BATCHES, SEED_MAPPINGS, SEED_MASTER_AUDIT, SEED_MASTER_DECISIONS, SEED_OWNERSHIP, SEED_PRODUCTS, SEED_RULES, SEED_SCAN_POINTS, SEED_SKUS, SEED_SUBCATEGORIES, SEED_SYNC_RUNS } from "@/data/mock/masterSeed";
import type { MasterState } from "./engine";

/** Fresh development master-data state. Structured-cloned so seeds are never mutated. */
export function buildMasterState(): MasterState {
  return structuredClone({
    categories: SEED_CATEGORIES,
    subCategories: SEED_SUBCATEGORIES,
    products: SEED_PRODUCTS,
    skus: SEED_SKUS,
    mappings: SEED_MAPPINGS,
    hierarchy: SEED_HIERARCHY,
    ownership: SEED_OWNERSHIP,
    syncRuns: SEED_SYNC_RUNS,
    conflicts: SEED_CONFLICTS,
    scanPoints: SEED_SCAN_POINTS,
    rules: SEED_RULES,
    exceptions: [],
    imports: SEED_IMPORT_BATCHES,
    decisions: SEED_MASTER_DECISIONS,
    audit: SEED_MASTER_AUDIT,
  });
}
