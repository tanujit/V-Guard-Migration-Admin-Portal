/**
 * MOCK MASTER DATA — development only.
 * Product and SKU codes carry a DEV- prefix so they are never mistaken for V-Guard codes; the real
 * code formats are not defined in the SOW. Names, pincodes, SFDC record IDs, sync runs and point
 * values are illustrative. No error/exception codes are seeded because no source catalogue exists.
 */
import { GEOGRAPHY, PRODUCT_CATEGORIES } from "@/config/geography";
import { hash01, pick } from "@/data/mock/random";
import type { Category, ConditionKind, HierarchyRecord, ImportBatch, MasterAuditEvent, MasterDecision, OwnershipSetting, Product, ProductBranchMapping, RuleGroup, RuleScope, RuleVersion, ScanPointConfig, ScanRule, Sku, SubCategory, SyncConflict, SyncRun } from "@/types/masters";

const T0 = "2025-04-01T09:00";
const SYS = "SYSTEM";
const RAHUL = "USR-1003";
const TANUJIT = "USR-1001";
const JOSEPH = "USR-2004";

/* ---------------- Categories ---------------- */

const SUBS: Record<string, string[]> = {
  wires: ["House wires", "Flexible cables", "Industrial cables"],
  stabilizers: ["Mainline stabilizers", "AC stabilizers", "Refrigerator stabilizers"],
  switchgear: ["Miniature circuit breakers", "Residual current breakers", "Distribution boards"],
  fans: ["Ceiling fans", "Pedestal fans", "Exhaust fans"],
  pumps: ["Domestic pumps", "Agricultural pumps"],
  water_heaters: ["Storage water heaters", "Instant water heaters"],
  inverters: ["Inverters", "Inverter batteries"],
  solar: ["Solar inverters", "Solar water heaters"],
};

const stamp = (by: string, at = T0) => ({ createdAt: at, createdBy: by, updatedAt: at, updatedBy: by });

export const SEED_CATEGORIES: Category[] = [
  ...PRODUCT_CATEGORIES.map((c, i) => ({ id: `CAT-${String(i + 1).padStart(3, "0")}`, code: c.key.toUpperCase(), name: c.name, description: `${c.name} product family`, status: "active" as const, ...stamp(SYS) })),
  { id: "CAT-009", code: "KITCHEN_LEGACY", name: "Kitchen appliances (legacy)", description: "Retired family kept for historical scans", status: "inactive", ...stamp(SYS) },
];

export const SEED_SUBCATEGORIES: SubCategory[] = PRODUCT_CATEGORIES.flatMap((c, i) =>
  SUBS[c.key].map((name, j) => ({
    id: `SUB-${String(i + 1).padStart(2, "0")}${j + 1}`,
    code: `${c.key.toUpperCase()}_${name.toUpperCase().replace(/[^A-Z]+/g, "_").replace(/_$/, "")}`,
    name,
    description: "",
    status: "active" as const,
    categoryId: `CAT-${String(i + 1).padStart(3, "0")}`,
    ...stamp(SYS),
  })),
);

/* ---------------- Products & SKUs ---------------- */

type P = [key: string, sub: number, name: string, skus: string[], programmes: string[], warranty: [number | null, "months" | "years"], install: boolean];
const PRODUCTS: P[] = [
  ["wires", 0, "FR house wire 1.0 sq mm", ["90 m coil", "180 m coil"], ["EP", "Retailer"], [null, "years"], false],
  ["wires", 0, "FR house wire 1.5 sq mm", ["90 m coil", "180 m coil"], ["EP", "Retailer"], [null, "years"], false],
  ["wires", 0, "FR house wire 2.5 sq mm", ["90 m coil"], ["EP", "Retailer"], [null, "years"], false],
  ["wires", 1, "Multi-core flexible cable", ["3 core 100 m"], ["EP", "Retailer", "DD"], [null, "years"], false],
  ["wires", 2, "Armoured industrial cable", ["4 core 50 m"], ["EP", "DD"], [null, "years"], false],
  ["stabilizers", 0, "Mainline stabilizer 5 kVA", ["Digital display"], ["EP", "Retailer"], [3, "years"], true],
  ["stabilizers", 1, "AC stabilizer 1.5 ton", ["Wall mount", "Floor"], ["EP", "Retailer", "DD"], [3, "years"], false],
  ["stabilizers", 2, "Refrigerator stabilizer 300 L", ["Standard"], ["Retailer"], [2, "years"], false],
  ["switchgear", 0, "Single-pole MCB 16 A", ["C curve"], ["EP"], [5, "years"], false],
  ["switchgear", 1, "4-pole RCCB 40 A", ["30 mA"], ["EP"], [5, "years"], false],
  ["switchgear", 2, "8-way distribution board", ["Double door"], ["EP"], [2, "years"], true],
  ["fans", 0, "Ceiling fan 1200 mm", ["Brown", "White"], ["Retailer", "DD"], [2, "years"], true],
  ["fans", 0, "BLDC ceiling fan 1200 mm", ["Remote"], ["Retailer", "DD"], [3, "years"], true],
  ["fans", 1, "Pedestal fan 400 mm", ["Standard"], ["Retailer"], [1, "years"], false],
  ["fans", 2, "Exhaust fan 200 mm", ["Kitchen"], ["Retailer"], [1, "years"], true],
  ["pumps", 0, "Domestic monoblock pump 0.5 HP", ["Single phase"], ["EP", "ST"], [1, "years"], true],
  ["pumps", 1, "Submersible pump 1.5 HP", ["Borewell 4 in"], ["EP", "ST"], [18, "months"], true],
  ["pumps", 1, "Openwell pump 1 HP", ["Single phase"], ["ST"], [18, "months"], true],
  ["water_heaters", 0, "Storage water heater 25 L", ["Vertical", "Horizontal"], ["Retailer", "DD"], [5, "years"], true],
  ["water_heaters", 1, "Instant water heater 3 L", ["Standard"], ["Retailer"], [2, "years"], true],
  ["inverters", 0, "Sine-wave inverter 1100 VA", ["Standard"], ["EP", "Retailer"], [2, "years"], true],
  ["inverters", 1, "Tubular inverter battery 150 Ah", ["Tall tubular"], ["EP", "Retailer"], [36, "months"], true],
  ["solar", 0, "Solar PCU 1 kVA", ["Off-grid"], ["ST", "CS"], [2, "years"], true],
  ["solar", 1, "Solar water heater 200 L", ["ETC"], ["ST", "CS"], [5, "years"], true],
];

const catIndex = (key: string) => PRODUCT_CATEGORIES.findIndex((c) => c.key === key);

export const SEED_PRODUCTS: Product[] = [];
export const SEED_SKUS: Sku[] = [];
PRODUCTS.forEach(([key, sub, name, skus, programmes, warranty, install], i) => {
  const ci = catIndex(key);
  const id = `PRD-${String(i + 1).padStart(4, "0")}`;
  const code = `DEV-${key.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`;
  const created = `2025-0${4 + (i % 5)}-1${i % 9}T10:00`;
  SEED_PRODUCTS.push({ id, code, name, description: "", categoryId: `CAT-${String(ci + 1).padStart(3, "0")}`, subCategoryId: `SUB-${String(ci + 1).padStart(2, "0")}${sub + 1}`, status: i === 13 ? "inactive" : "active", warranty: { value: warranty[0], unit: warranty[1] }, installationRequired: install, source: "seed", ...stamp(SYS, created) });
  skus.forEach((variant, j) => {
    SEED_SKUS.push({ id: `SKU-${String(SEED_SKUS.length + 1).padStart(5, "0")}`, code: `${code}-${String.fromCharCode(65 + j)}`, name: `${name} · ${variant}`, productId: id, status: i === 13 ? "inactive" : i === 7 && j === 0 ? "draft" : "active", programmes, ...stamp(SYS, created) });
  });
});

const BRANCHES = GEOGRAPHY.flatMap((s) => s.districts.flatMap((d) => d.branches.map((b) => ({ state: s.code, district: d.code, code: b.code }))));
const skusOf = (productIdx: number) => SEED_SKUS.filter((s) => s.productId === `PRD-${String(productIdx + 1).padStart(4, "0")}`);
const branchesIn = (states: string[]) => BRANCHES.filter((b) => states.includes(b.state)).map((b) => b.code);

/** Each active product is mapped to the branches of a few states (never "all branches" by default). */
export const SEED_MAPPINGS: ProductBranchMapping[] = SEED_PRODUCTS.flatMap((p, i) => {
  const states = GEOGRAPHY.filter((s) => hash01(`map|${p.id}|${s.code}`) < (i < 5 ? 0.75 : 0.45)).map((s) => s.code);
  return branchesIn(states.length ? states : ["KL"]).map((code, j) => ({ id: `MAP-${p.id.slice(4)}-${String(j + 1).padStart(2, "0")}`, productId: p.id, branchCode: code, status: "active" as const, createdAt: p.createdAt, createdBy: SYS }));
});

/* ---------------- Hierarchy mirror & SFDC ---------------- */

const PIN_PREFIX: Record<string, string> = { KL: "68", TN: "60", KA: "56", MH: "41", AP: "52", TS: "50", UP: "22", GJ: "38", WB: "70", RJ: "30", DL: "11", OD: "75", MP: "45" };
const SYNC_AT = "2026-11-09T02:12";
const FAILED = new Set(["UP-BR-GHAZIABAD", "WB-BR-HOWRAH", "RJ-BR-JODHPUR"]);
const CONFLICT = new Set(["TN-BR-COIMBATORE", "KA-BR-MANGALURU"]);

let sf = 1;
const rec = (level: HierarchyRecord["level"], code: string, pincodes: string[] = []): HierarchyRecord => {
  const failed = FAILED.has(code);
  const conflict = CONFLICT.has(code);
  return {
    id: `HIR-${String(sf).padStart(4, "0")}`,
    level,
    code,
    sourceRecordId: `SFDC-MOCK-${String(sf++).padStart(5, "0")}`,
    status: code === "OD-BR-CUTTACK" ? "inactive" : "active",
    pincodes,
    syncStatus: failed ? "failed" : conflict ? "conflict" : code === "MP-BR-BHOPAL" ? "pending" : "synced",
    lastSyncedAt: failed || conflict ? "2026-11-07T02:11" : code === "MP-BR-BHOPAL" ? null : SYNC_AT,
    lastSyncError: failed ? pick(code, ["Parent district reference not found in payload", "Mandatory field BranchCode__c missing", "Pincode value failed format validation"]) : conflict ? "Differs from the portal record; held for review" : null,
  };
};

export const SEED_HIERARCHY: HierarchyRecord[] = GEOGRAPHY.flatMap((s) => [
  rec("state", s.code),
  ...s.districts.flatMap((d) => [
    rec("district", d.code),
    ...d.branches.map((b, k) => rec("branch", b.code, [`${PIN_PREFIX[s.code]}${String(Math.floor(1000 + hash01(`pin|${b.code}`) * 8999)).slice(0, 4)}`, ...(k === 0 && hash01(`pin2|${b.code}`) > 0.5 ? [`${PIN_PREFIX[s.code]}${String(Math.floor(1000 + hash01(`pinb|${b.code}`) * 8999)).slice(0, 4)}`] : [])])),
  ]),
]);

export const SEED_OWNERSHIP: OwnershipSetting[] = [
  { dataType: "hierarchy", label: "State, district and branch hierarchy", ownership: "sfdc_managed", decisionRef: "OP-51 / OP-10", updatedAt: T0, updatedBy: SYS },
  { dataType: "pincode", label: "Pincode mapping", ownership: "pending_confirmation", decisionRef: "OP-51 / OP-10", updatedAt: T0, updatedBy: SYS },
];

const total = SEED_HIERARCHY.length;
export const SEED_SYNC_RUNS: SyncRun[] = [
  { id: "SYN-2611-04", source: "SFDC", startedAt: "2026-11-04T02:00", completedAt: "2026-11-04T02:11", total, succeeded: total, failed: 0, skipped: 0, status: "completed", errors: [], mock: true },
  { id: "SYN-2611-05", source: "SFDC", startedAt: "2026-11-05T02:00", completedAt: "2026-11-05T02:12", total, succeeded: total, failed: 0, skipped: 0, status: "completed", errors: [], mock: true },
  { id: "SYN-2611-06", source: "SFDC", startedAt: "2026-11-06T02:00", completedAt: null, total: 0, succeeded: 0, failed: 0, skipped: 0, status: "failed", errors: [{ recordCode: "—", error: "Source connection timed out before any record was received (mock)" }], mock: true },
  { id: "SYN-2611-07", source: "SFDC", startedAt: "2026-11-07T02:00", completedAt: "2026-11-07T02:13", total, succeeded: total - 2, failed: 0, skipped: 0, status: "partial", errors: [{ recordCode: "TN-BR-COIMBATORE", error: "Pincode differs from portal record; held for review" }, { recordCode: "KA-BR-MANGALURU", error: "Parent district reference changed in source; held for review" }], mock: true },
  { id: "SYN-2611-08", source: "SFDC", startedAt: "2026-11-08T02:00", completedAt: "2026-11-08T02:10", total, succeeded: total - 5, failed: 3, skipped: 2, status: "partial", errors: Array.from(FAILED).map((c) => ({ recordCode: c, error: SEED_HIERARCHY.find((h) => h.code === c)!.lastSyncError! })), mock: true },
  { id: "SYN-2611-09", source: "SFDC", startedAt: "2026-11-09T02:00", completedAt: SYNC_AT, total, succeeded: total - 6, failed: 3, skipped: 3, status: "partial", errors: [...Array.from(FAILED).map((c) => ({ recordCode: c, error: SEED_HIERARCHY.find((h) => h.code === c)!.lastSyncError! })), { recordCode: "MP-BR-BHOPAL", error: "New branch received without an approved parent mapping; skipped" }], mock: true },
];

export const SEED_CONFLICTS: SyncConflict[] = [
  { id: "CNF-001", kind: "pincode_mismatch", recordCode: "TN-BR-COIMBATORE", level: "branch", portalValue: SEED_HIERARCHY.find((h) => h.code === "TN-BR-COIMBATORE")!.pincodes.join(", "), sourceValue: "641018", detectedAt: "2026-11-07T02:13", syncRunId: "SYN-2611-07", status: "open", note: "" },
  { id: "CNF-002", kind: "parent_changed", recordCode: "KA-BR-MANGALURU", level: "branch", portalValue: "KA-DAKSHINA-KANNADA", sourceValue: "KA-UDUPI (not in portal hierarchy)", detectedAt: "2026-11-07T02:13", syncRunId: "SYN-2611-07", status: "under_review", note: "Udupi district does not exist in the portal hierarchy" },
  { id: "CNF-003", kind: "missing_in_source", recordCode: "OD-BR-CUTTACK", level: "branch", portalValue: "Active in portal until 2026-10-31", sourceValue: "Not present in payload", detectedAt: "2026-11-01T02:12", syncRunId: "SYN-2611-04", status: "open", note: "Marked inactive locally; awaiting SFDC confirmation" },
  { id: "CNF-004", kind: "duplicate_source", recordCode: "MP-BR-BHOPAL", level: "branch", portalValue: "—", sourceValue: "Two source records share BranchCode__c", detectedAt: "2026-11-09T02:12", syncRunId: "SYN-2611-09", status: "open", note: "" },
  { id: "CNF-005", kind: "validation_failed", recordCode: "RJ-BR-JODHPUR", level: "branch", portalValue: SEED_HIERARCHY.find((h) => h.code === "RJ-BR-JODHPUR")!.pincodes.join(", "), sourceValue: "34200A", detectedAt: "2026-11-08T02:10", syncRunId: "SYN-2611-08", status: "open", note: "" },
];

/* ---------------- Scan points ---------------- */

const spv = (v: Partial<ScanPointConfig["versions"][number]> & { scanIn: number | null; scanOut: number | null; createdBy: string; createdAt: string }) => ({ version: 1, status: "active" as const, effectiveFrom: null, effectiveTo: null, remarks: "", approvalRequestId: null, updatedAt: v.createdAt, activatedAt: v.createdAt, ...v });

const sp = (n: number, productIdx: number, skuIdx: number, states: string[], scanIn: number | null, scanOut: number | null, extra: Partial<ScanPointConfig> = {}): ScanPointConfig => {
  const sku = skusOf(productIdx)[skuIdx];
  const at = `2026-0${6 + (n % 4)}-0${1 + (n % 8)}T11:00`;
  return { id: `SPC-${String(n).padStart(4, "0")}`, skuId: sku.id, programmes: sku.programmes, branchCodes: branchesIn(states), createdBy: RAHUL, createdAt: at, retired: false, versions: [spv({ scanIn, scanOut, createdBy: RAHUL, createdAt: at })], ...extra };
};

export const SEED_SCAN_POINTS: ScanPointConfig[] = [
  sp(1, 1, 0, ["KL", "TN"], 6, 0),
  sp(2, 1, 1, ["KL", "TN"], 12, 0),
  sp(3, 5, 0, ["KL", "KA"], 22, 10),
  sp(4, 6, 0, ["KL", "TN", "KA"], 18, 8),
  sp(5, 11, 0, ["MH", "GJ"], 14, 6),
  sp(6, 12, 0, ["MH", "GJ", "KA"], 20, 8),
  sp(7, 15, 0, ["TN", "AP"], 30, 12),
  sp(8, 16, 0, ["TN", "AP", "TS"], 45, 15),
  sp(9, 18, 0, ["KL"], 26, null),
  sp(10, 20, 0, ["UP", "DL"], 40, 20),
  sp(11, 22, 0, ["TN", "KA"], 45, 0),
  // Karnataka-only configuration maintained by the regional Maker; v2 is waiting for approval.
  {
    ...sp(12, 6, 1, ["KA"], 18, 8),
    createdBy: JOSEPH,
    versions: [spv({ scanIn: 18, scanOut: 8, createdBy: JOSEPH, createdAt: "2026-10-02T10:00" }), { version: 2, status: "submitted", scanIn: 20, scanOut: 8, effectiveFrom: "2026-12-01", effectiveTo: null, remarks: "Align with the Karnataka summer push", approvalRequestId: null, createdBy: JOSEPH, createdAt: "2026-11-08T14:00", updatedAt: "2026-11-08T14:00", activatedAt: null }],
  },
  // Draft, never submitted.
  { ...sp(13, 19, 0, ["KL"], null, null), versions: [{ version: 1, status: "draft", scanIn: 24, scanOut: null, effectiveFrom: null, effectiveTo: null, remarks: "Scan-Out value to be confirmed", approvalRequestId: null, createdBy: RAHUL, createdAt: "2026-11-07T16:00", updatedAt: "2026-11-07T16:00", activatedAt: null }] },
];

/* ---------------- Scan restriction rules ---------------- */

const scope = (s: Partial<RuleScope>): RuleScope => ({ productIds: [], skuIds: [], categoryIds: [], subCategoryIds: [], branchCodes: [], programmes: [], allSkus: false, allBranches: false, ...s });
const group = (op: "AND" | "OR", items: RuleGroup["items"], id = "G1"): RuleGroup => ({ id, type: "group", op, items });
const cond = (id: string, kind: ConditionKind, operator: string, values: string[] = []) => ({ id, type: "condition" as const, kind, operator, values });

const rv = (v: Partial<RuleVersion> & Pick<RuleVersion, "scope" | "conditions" | "createdBy" | "createdAt">): RuleVersion => ({
  version: 1,
  status: "active",
  time: null,
  rescan: null,
  relations: [],
  outcome: { kind: "unconfigured", exceptionId: null, note: "Outcome to be confirmed against the source error/exception catalogue" },
  justification: "",
  deactivate: false,
  approvalRequestId: null,
  updatedAt: v.createdAt,
  activatedAt: v.status && v.status !== "active" && v.status !== "superseded" ? null : v.createdAt,
  ...v,
});

const pumpSkus = [...skusOf(15), ...skusOf(16), ...skusOf(17)].map((s) => s.id);
const tnBranches = branchesIn(["TN"]);
const kaBranches = branchesIn(["KA"]);
const stabSkus = [...skusOf(5), ...skusOf(6), ...skusOf(7)].map((s) => s.id);
const solarPcu = skusOf(22)[0].id;
const solarHeater = skusOf(23)[0].id;
const battery = skusOf(21)[0].id;

export const SEED_RULES: ScanRule[] = [
  {
    id: "SRR-0001", code: "KL-WIRE-RESCAN", name: "Kerala house-wire re-scan control", description: "Re-scan restriction for house wires scanned in Kerala branches", ruleType: "rescan", context: "scan_in", createdBy: RAHUL, createdAt: "2026-08-12T10:00",
    versions: [rv({ scope: scope({ subCategoryIds: ["SUB-011"], branchCodes: branchesIn(["KL"]) }), conditions: group("AND", [cond("C1", "branch", "in", branchesIn(["KL"])), cond("C2", "sub_category", "in", ["SUB-011"]), cond("C3", "rescan", "is_rescan")]), rescan: { eligible: null, minIntervalHours: null, maxCount: null, note: "Interval and count limits require business confirmation" }, justification: "SOW: re-scan restrictions", createdBy: RAHUL, createdAt: "2026-08-12T10:00" })],
  },
  {
    id: "SRR-0002", code: "TN-PUMP-SCAN", name: "Pump scans in Tamil Nadu branches", description: "Combined branch and product condition for pumps", ruleType: "composite", context: "scan_in", createdBy: RAHUL, createdAt: "2026-09-02T10:00",
    versions: [rv({ scope: scope({ skuIds: pumpSkus, subCategoryIds: ["SUB-052"], branchCodes: tnBranches, programmes: ["EP", "ST"] }), conditions: group("AND", [cond("C1", "branch", "in", tnBranches), group("OR", [cond("C2", "sku", "in", pumpSkus.slice(0, 1)), cond("C3", "sub_category", "in", ["SUB-052"])], "G2")]), justification: "Regional control requested by the Tamil Nadu office (development example)", createdBy: RAHUL, createdAt: "2026-09-02T10:00" })],
  },
  {
    id: "SRR-0003", code: "KA-STAB-TIME", name: "Stabilizer scan window in Karnataka", description: "Time-based restriction for stabilizer scans", ruleType: "time", context: "scan_in", createdBy: RAHUL, createdAt: "2026-09-20T10:00",
    versions: [
      rv({ status: "active", scope: scope({ skuIds: stabSkus.slice(0, 2), branchCodes: kaBranches.slice(0, 2) }), conditions: group("AND", [cond("C1", "branch", "in", kaBranches.slice(0, 2)), cond("C2", "sku", "in", stabSkus.slice(0, 2)), cond("C3", "time", "outside_window")]), time: { windowStart: null, windowEnd: null, days: [], note: "Window to be confirmed by V-Guard" }, justification: "SOW: time-based restrictions", createdBy: RAHUL, createdAt: "2026-09-20T10:00" }),
      rv({ version: 2, status: "submitted", scope: scope({ skuIds: stabSkus, branchCodes: kaBranches }), conditions: group("AND", [cond("C1", "branch", "in", kaBranches), cond("C2", "sku", "in", stabSkus), cond("C3", "time", "outside_window")]), time: { windowStart: null, windowEnd: null, days: [], note: "Window to be confirmed by V-Guard" }, justification: "Extend to all Karnataka branches and every stabilizer SKU", createdBy: RAHUL, createdAt: "2026-11-08T11:00" }),
    ],
  },
  {
    id: "SRR-0004", code: "SOLAR-KIT-PC", name: "Solar kit parent-child scans", description: "Relationship between the solar PCU and its kit components", ruleType: "parent_child", context: "scan_in", createdBy: RAHUL, createdAt: "2026-11-06T10:00",
    versions: [rv({ status: "submitted", scope: scope({ skuIds: [solarPcu, solarHeater, battery], branchCodes: branchesIn(["TN", "KA"]), programmes: ["ST", "CS"] }), conditions: group("AND", [cond("C1", "sku", "in", [solarHeater]), cond("C2", "parent_child", "parent_scanned", ["REL-1"])]), relations: [{ id: "REL-1", parentSkuId: solarPcu, childSkuIds: [solarHeater], description: "Kit relationship as described by the solar team (meaning to be confirmed)", confirmed: false }], justification: "Kit scanning control for solar installations", createdBy: RAHUL, createdAt: "2026-11-06T10:00" })],
  },
  {
    id: "SRR-0005", code: "TN-PUMP-ST", name: "ST pump scans in Tamil Nadu", description: "Draft overlapping an active rule (conflict example)", ruleType: "composite", context: "scan_in", createdBy: RAHUL, createdAt: "2026-11-09T09:30",
    versions: [rv({ status: "draft", scope: scope({ skuIds: pumpSkus.slice(0, 2), branchCodes: tnBranches.slice(0, 3), programmes: ["ST"] }), conditions: group("AND", [cond("C1", "branch", "in", tnBranches.slice(0, 3)), cond("C2", "sku", "in", pumpSkus.slice(0, 2))]), justification: "", createdBy: RAHUL, createdAt: "2026-11-09T09:30" })],
  },
  {
    id: "SRR-0006", code: "MH-FAN-OLD", name: "Legacy fan scan rule, Maharashtra", description: "Deactivated after the 2026 fan range change", ruleType: "sku", context: "scan_out", createdBy: TANUJIT, createdAt: "2026-04-10T10:00",
    versions: [
      rv({ status: "superseded", scope: scope({ skuIds: skusOf(11).map((s) => s.id), branchCodes: branchesIn(["MH"]) }), conditions: group("AND", [cond("C1", "branch", "in", branchesIn(["MH"])), cond("C2", "sku", "in", skusOf(11).map((s) => s.id))]), createdBy: TANUJIT, createdAt: "2026-04-10T10:00" }),
      rv({ version: 2, status: "active", deactivate: true, scope: scope({ skuIds: skusOf(11).map((s) => s.id), branchCodes: branchesIn(["MH"]) }), conditions: group("AND", [cond("C1", "branch", "in", branchesIn(["MH"])), cond("C2", "sku", "in", skusOf(11).map((s) => s.id))]), justification: "Fan range replaced", createdBy: TANUJIT, createdAt: "2026-10-15T10:00" }),
    ],
  },
];

/* ---------------- Decision register ---------------- */

export const SEED_MASTER_DECISIONS: MasterDecision[] = [
  { id: "MDR-01", ref: "OP-51 / OP-10", question: "Should pincode and geographical hierarchy data be editable in this portal, or stay SFDC-managed?", treatment: "Configurable source ownership. Hierarchy defaults to SFDC managed (read-only); pincode mapping is Business confirmation required (read-only)", status: "open", answer: "", owner: "V-Guard IT / Evolve" },
  { id: "MDR-02", ref: "Scan restriction policy", question: "What are the actual time windows and re-scan thresholds?", treatment: "Fields exist on every rule; values are empty until confirmed and the simulator reports “requires business configuration”", status: "open", answer: "", owner: "V-Guard channel loyalty" },
  { id: "MDR-03", ref: "Parent-child rules", question: "What is the business relationship between parent and child SKUs, and the expected scan outcome?", treatment: "Relationships can be recorded with a description; outcome is not inferred", status: "open", answer: "", owner: "V-Guard product team" },
  { id: "MDR-04", ref: "Rule precedence", question: "How should overlapping scan restriction rules be prioritised?", treatment: "Overlaps are detected; submission of an overlapping rule of the same type and context is blocked. No precedence is invented", status: "open", answer: "", owner: "V-Guard channel loyalty" },
  { id: "MDR-05", ref: "Error/exception catalogue", question: "What are the complete error codes, messages and blocking behaviours?", treatment: "Catalogue is empty until the source list is supplied; rule outcomes stay “unconfigured”", status: "open", answer: "", owner: "Evolve mobile team" },
  { id: "MDR-06", ref: "Product/SKU change approval", question: "Do product and SKU master changes need Maker-Checker approval?", treatment: "Direct changes by users with Create/Edit, fully audited. Can be routed through the Approval Engine once a policy is confirmed", status: "under_review", answer: "", owner: "V-Guard governance" },
  { id: "MDR-07", ref: "Scan-point approval", question: "Does every Scan-In/Scan-Out point change need approval?", treatment: "Routed through the Approval Engine as a safeguard (policy: Business confirmation required)", status: "open", answer: "", owner: "V-Guard finance" },
  { id: "MDR-08", ref: "Code formats", question: "What are the official product, SKU and category code formats and uniqueness rules?", treatment: "Demo codes use a DEV- prefix; uniqueness is case-insensitive across the master", status: "open", answer: "", owner: "V-Guard IT" },
];

/* ---------------- Audit history ---------------- */

let au = 1;
const ev = (at: string, actor: string, entityType: MasterAuditEvent["entityType"], entityId: string, action: string, module: string, remarks = "", prev: string | null = null, next: string | null = null): MasterAuditEvent => ({ id: `MAU-${String(au++).padStart(6, "0")}`, at, actorUserId: actor, actorOrgId: actor === SYS ? null : actor.startsWith("USR-2") ? "ORG-0002" : "ORG-0001", module, entityType, entityId, action, previousValue: prev, newValue: next, remarks, approvalRequestId: null, ref: `MRF-${String(7000 + au)}` });

export const SEED_MASTER_AUDIT: MasterAuditEvent[] = [
  ev("2026-10-28T11:20", RAHUL, "product", "PRD-0013", "product.updated", "products", "Warranty corrected", "2 years", "3 years"),
  ev("2026-11-02T15:05", RAHUL, "sku", "SKU-00010", "sku.updated", "products", "Programme eligibility extended", "Retailer", "Retailer, DD"),
  ev("2026-11-03T10:40", TANUJIT, "sub_category", "SUB-052", "sub_category.updated", "categories", "Description added"),
  ev("2026-11-05T12:10", RAHUL, "mapping", "PRD-0016", "mapping.changed", "products", "Mapped to Andhra Pradesh branches", "TN", "TN, AP"),
  ev("2026-11-06T10:00", RAHUL, "scan_rule", "SRR-0004", "scan_rule.created", "scan-config", "Draft created"),
  ev("2026-11-07T16:00", RAHUL, "scan_points", "SPC-0013", "scan_points.created", "scan-config", "Draft configuration"),
  ev("2026-11-08T02:10", SYS, "sync", "SYN-2611-08", "sync.failed", "branches", "3 records failed validation; not applied"),
  ev("2026-11-08T11:00", RAHUL, "scan_rule", "SRR-0003", "scan_rule.version_created", "scan-config", "Version 2 drafted", "v1", "v2"),
  ev("2026-11-08T14:00", JOSEPH, "scan_points", "SPC-0012", "scan_points.version_created", "scan-config", "Version 2 drafted", "v1", "v2"),
  ev("2026-11-09T02:12", SYS, "sync", "SYN-2611-09", "sync.completed", "branches", "Completed with 3 failed and 3 skipped records"),
  ev("2026-11-09T09:30", RAHUL, "scan_rule", "SRR-0005", "scan_rule.created", "scan-config", "Draft created"),
];

export const SEED_IMPORT_BATCHES: ImportBatch[] = [];
