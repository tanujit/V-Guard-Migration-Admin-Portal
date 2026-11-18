/**
 * DEMO RECORD LISTS — development data only.
 * Schemes, gifts, alerts, jobs and activity entries used by the dashboard until APIs exist.
 * Member references are masked; no personal identifiers are generated.
 */
import { PROGRAMMES } from "@/config/programmes";
import { GEOGRAPHY, PRODUCT_CATEGORIES } from "@/config/geography";
import type { ActivityRow, RiskAlert, SchemeRow } from "@/types/dashboard";
import type { StatusTone } from "@/types/domain";
import { hash01, pick } from "./random";
import { addDays, DEMO_AS_OF } from "./time";

const codes = PROGRAMMES.map((p) => p.code);

export const DEMO_SCHEMES: SchemeRow[] = [
  { id: "SCH-2611", name: "Festive stabilizer multiplier", programme: "EP", status: "active", start: "2026-10-01", end: "2026-11-30", participants: 48210, pointsIssued: 6_820_400, budget: 9_000_000 },
  { id: "SCH-2608", name: "Wires slab bonus Q3", programme: "Retailer", status: "active", start: "2026-10-01", end: "2026-12-31", participants: 21460, pointsIssued: 4_115_800, budget: 7_500_000 },
  { id: "SCH-2604", name: "Pump season double points", programme: "EP", status: "completed", start: "2026-04-01", end: "2026-06-30", participants: 39880, pointsIssued: 5_402_300, budget: 5_500_000 },
  { id: "SCH-2606", name: "Monsoon fan push", programme: "CS", status: "completed", start: "2026-06-15", end: "2026-08-31", participants: 9120, pointsIssued: 1_084_600, budget: 1_200_000 },
  { id: "SCH-2609", name: "Water heater early winter", programme: "ST", status: "active", start: "2026-10-15", end: "2027-01-15", participants: 6340, pointsIssued: 612_900, budget: 1_800_000 },
  { id: "SCH-2612", name: "Retailer year-end stock-up", programme: "Retailer", status: "scheduled", start: "2026-12-01", end: "2027-03-31", participants: 0, pointsIssued: 0, budget: 8_000_000 },
  { id: "SCH-2613", name: "Solar install bonus", programme: "EP", status: "pending_approval", start: "2026-12-01", end: "2027-02-28", participants: 0, pointsIssued: 0, budget: 2_500_000 },
  { id: "SCH-2614", name: "Distributor quarterly target", programme: "DD", status: "pending_approval", start: "2027-01-01", end: "2027-03-31", participants: 0, pointsIssued: 0, budget: 3_000_000 },
  { id: "SCH-2615", name: "Switchgear referral boost", programme: "EP", status: "draft", start: "2027-01-01", end: "2027-03-31", participants: 0, pointsIssued: 0, budget: null },
  { id: "SCH-2602", name: "Counter staff welcome drive", programme: "CS", status: "deactivated", start: "2026-05-01", end: "2026-07-31", participants: 2210, pointsIssued: 88_400, budget: 600_000 },
  { id: "SCH-2610", name: "Inverter service week", programme: "ST", status: "active", start: "2026-11-01", end: "2026-11-30", participants: 3880, pointsIssued: 241_300, budget: 500_000 },
  { id: "SCH-2601", name: "New FY welcome points", programme: "Retailer", status: "completed", start: "2026-04-01", end: "2026-05-31", participants: 17650, pointsIssued: 1_765_000, budget: 2_000_000 },
];

export const DEMO_TOP_PRODUCTS = [
  { sku: "VG-WR-FR1.5-90", name: "FR wire 1.5 sq mm, 90 m", category: "wires" },
  { sku: "VG-WR-FR2.5-90", name: "FR wire 2.5 sq mm, 90 m", category: "wires" },
  { sku: "VG-ST-VND400", name: "Stabilizer VND 400", category: "stabilizers" },
  { sku: "VG-SG-MCB-32", name: "MCB 32 A single pole", category: "switchgear" },
  { sku: "VG-FN-ESC1200", name: "Ceiling fan 1200 mm", category: "fans" },
  { sku: "VG-PM-1HP-SUB", name: "Submersible pump 1 HP", category: "pumps" },
  { sku: "VG-WH-15L", name: "Storage water heater 15 L", category: "water_heaters" },
  { sku: "VG-ST-VGSD50", name: "Stabilizer VGSD 50", category: "stabilizers" },
  { sku: "VG-IN-1100VA", name: "Inverter 1100 VA", category: "inverters" },
  { sku: "VG-SL-MOD-540", name: "Solar module 540 W", category: "solar" },
  { sku: "VG-WR-FR4-90", name: "FR wire 4 sq mm, 90 m", category: "wires" },
  { sku: "VG-SG-RCCB-40", name: "RCCB 40 A double pole", category: "switchgear" },
];

export const DEMO_GIFT_CATALOGUE = { total: 186, active: 162, outOfStock: 11 };

const RISK_CATEGORIES = [
  "Duplicate registration",
  "Suspicious device activity",
  "Unusual scan activity",
  "High-frequency scans",
  "Geo-location anomaly",
  "Suspicious redemption",
] as const;

export const RISK_CATEGORY_WEIGHTS: Record<(typeof RISK_CATEGORIES)[number], number> = {
  "Duplicate registration": 0.22,
  "Suspicious device activity": 0.14,
  "Unusual scan activity": 0.2,
  "High-frequency scans": 0.19,
  "Geo-location anomaly": 0.15,
  "Suspicious redemption": 0.1,
};

function priorityOf(roll: number, critical: number, high: number, medium: number): RiskAlert["priority"] {
  return roll < critical ? "critical" : roll < high ? "high" : roll < medium ? "medium" : "low";
}

function maskedMember(seed: string, programme: string) {
  const n = Math.floor(hash01(seed) * 9000 + 1000);
  return `RSH-${programme.slice(0, 3).toUpperCase()}-••••${n}`;
}

function timeOf(seed: string) {
  const h = Math.floor(hash01(seed) * 14) + 8;
  const m = Math.floor(hash01(`${seed}m`) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const DEMO_RISK_ALERTS: RiskAlert[] = Array.from({ length: 36 }, (_, i) => {
  const seed = `alert-${i}`;
  const programme = pick(`${seed}p`, codes.filter((c) => c !== "DD"));
  const daysAgo = Math.floor(hash01(`${seed}d`) * 40);
  const statusRoll = hash01(`${seed}s`);
  const status: RiskAlert["status"] =
    daysAgo < 3 ? "new" : statusRoll < 0.3 ? "under_review" : statusRoll < 0.42 ? "escalated" : statusRoll < 0.82 ? "resolved" : "dismissed";
  const pr = hash01(`${seed}pr`);
  return {
    id: `RA-${(48120 + i * 7).toString()}`,
    raisedAt: `${addDays(DEMO_AS_OF, -daysAgo)} ${timeOf(seed)}`,
    category: pick(`${seed}c`, RISK_CATEGORIES),
    programme,
    state: pick(`${seed}st`, GEOGRAPHY).code,
    memberRef: maskedMember(seed, programme),
    status,
    priority: priorityOf(pr, 0.12, 0.4, 0.75),
  };
}).sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1));

export const RISK_CATEGORY_LIST = RISK_CATEGORIES;

/** Integrations named generically; partners are not assumed beyond SFDC masters. */
export const DEMO_INTEGRATIONS = [
  { name: "SFDC branch & pincode sync", failed: 3, lastFailure: `${addDays(DEMO_AS_OF, -1)} 02:10` },
  { name: "KYC verification service", failed: 41, lastFailure: `${DEMO_AS_OF} 13:52` },
  { name: "Payout service", failed: 17, lastFailure: `${DEMO_AS_OF} 11:05` },
  { name: "SMS / notification gateway", failed: 126, lastFailure: `${DEMO_AS_OF} 14:12` },
  { name: "QR & product master feed", failed: 0, lastFailure: null },
];

export const DEMO_JOBS: { name: string; status: "on_time" | "delayed" | "failed"; lastRun: string; schedule: string }[] = [
  { name: "Daily points settlement", status: "on_time", lastRun: `${DEMO_AS_OF} 01:30`, schedule: "Daily 01:30" },
  { name: "SFDC master sync", status: "delayed", lastRun: `${addDays(DEMO_AS_OF, -1)} 02:00`, schedule: "Daily 02:00" },
  { name: "TDS computation", status: "on_time", lastRun: `${DEMO_AS_OF} 03:00`, schedule: "Daily 03:00" },
  { name: "Inactive member sweep", status: "failed", lastRun: `${DEMO_AS_OF} 04:15`, schedule: "Daily 04:15" },
  { name: "Dashboard snapshot", status: "on_time", lastRun: `${DEMO_AS_OF} 14:30`, schedule: "Every 30 min" },
];

export const DEMO_SYSTEM_ALERTS: { at: string; message: string; tone: StatusTone }[] = [
  { at: `${DEMO_AS_OF} 14:12`, message: "SMS gateway failure rate above 5% for 20 minutes", tone: "negative" },
  { at: `${DEMO_AS_OF} 04:20`, message: "Inactive member sweep failed at step 2 of 3", tone: "negative" },
  { at: `${DEMO_AS_OF} 02:40`, message: "SFDC master sync running 38 minutes late", tone: "warning" },
  { at: `${addDays(DEMO_AS_OF, -1)} 18:05`, message: "KYC verification latency recovered", tone: "positive" },
];

const ACTIVITY_TYPES: { type: string; statuses: [string, StatusTone][] }[] = [
  { type: "Scheme change request", statuses: [["Pending approval", "warning"], ["Approved", "positive"], ["Returned", "neutral"]] },
  { type: "Points adjustment", statuses: [["Pending approval", "warning"], ["Approved", "positive"], ["Rejected", "negative"]] },
  { type: "Member status change", statuses: [["Pending approval", "warning"], ["Approved", "positive"]] },
  { type: "Bulk payout batch", statuses: [["Processing", "info"], ["Completed", "positive"], ["Partially failed", "negative"]] },
  { type: "Product master update", statuses: [["Pending approval", "warning"], ["Approved", "positive"]] },
  { type: "Escalated ticket", statuses: [["Open", "warning"], ["Resolved", "positive"]] },
  { type: "Fraud case", statuses: [["Under review", "warning"], ["Escalated", "negative"], ["Resolved", "positive"]] },
  { type: "Communication campaign", statuses: [["Scheduled", "info"], ["Sent", "positive"]] },
];

const ACTORS = ["R. Menon · Evolve Ops", "A. Iyer · V-Guard", "S. Das · Evolve Ops", "K. Nair · V-Guard Finance", "P. Varghese · Evolve Ops", "System"];

export const DEMO_ACTIVITIES: ActivityRow[] = Array.from({ length: 64 }, (_, i) => {
  const seed = `act-${i}`;
  const t = ACTIVITY_TYPES[Math.floor(hash01(`${seed}t`) * ACTIVITY_TYPES.length)];
  const [status, tone] = t.statuses[Math.floor(hash01(`${seed}s`) * t.statuses.length)];
  const daysAgo = Math.floor(i / 6);
  const pr = hash01(`${seed}p`);
  const programmeRoll = hash01(`${seed}g`);
  return {
    id: seed,
    at: `${addDays(DEMO_AS_OF, -daysAgo)} ${timeOf(seed)}`,
    type: t.type,
    reference: `${t.type.split(" ").map((w) => w[0]).join("").toUpperCase()}-${(20450 + i * 13).toString()}`,
    programme: programmeRoll < 0.12 ? "All" : pick(`${seed}pg`, codes),
    initiatedBy: t.type === "Bulk payout batch" ? "System" : pick(`${seed}a`, ACTORS.slice(0, 5)),
    status,
    statusTone: tone,
    priority: priorityOf(pr, 0.08, 0.3, 0.7),
  };
}).sort((a, b) => (a.at < b.at ? 1 : -1));

export function categoryName(key: string) {
  return PRODUCT_CATEGORIES.find((c) => c.key === key)?.name ?? key;
}
