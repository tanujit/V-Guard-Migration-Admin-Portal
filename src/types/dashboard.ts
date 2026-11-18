import type { KycCheckKey, ProgrammeCode, RegistrationStatusKey, StatusTone } from "./domain";

/* ---------------- Filters ---------------- */

export type PeriodPreset = "this_month" | "last_3_months" | "fy" | "custom";

export interface DashboardFilters {
  period: PeriodPreset;
  /** Financial year label, e.g. "2026-27" (April to March). Used when period is "fy". */
  fy: string;
  /** ISO dates (YYYY-MM-DD) for a custom range. */
  from: string;
  to: string;
  programme: ProgrammeCode | "all";
  state: string | "all";
  district: string | "all";
  branch: string | "all";
  category: string | "all";
  /**
   * Data scope of the signed-in user, injected by the data layer (never set from the UI).
   * Every query is clamped to it, so filters can only narrow what the user may see.
   */
  accessScope?: { programmes: "all" | ProgrammeCode[]; states: "all" | string[] };
}

export interface DateSpan {
  from: string;
  to: string;
  label: string;
}

export interface ResolvedPeriod extends DateSpan {
  /** Comparable earlier span, or null when it falls before the data starts. */
  previous: DateSpan | null;
  /** Month keys (YYYY-MM) used by trend charts: at least six complete months ending at or before `to`. */
  trendMonths: string[];
  /** True when the period ends inside a month that is still in progress (excluded from monthly trends). */
  monthInProgress: boolean;
}

/* ---------------- Shared view-model shapes ---------------- */

export type GoodDirection = "up" | "down" | "neutral";

export interface Comparison {
  previous: number;
  label: string;
}

export interface KpiMetric {
  id: string;
  label: string;
  value: number;
  format: "count" | "points" | "inr" | "percent" | "decimal";
  description: string;
  /** Present only when the source data supports a comparison. */
  comparison?: Comparison;
  /** Shown instead of a comparison, e.g. "Yesterday 41,230 (full day)". */
  reference?: string;
  goodDirection: GoodDirection;
  drill: DrillTarget;
  /** Recent history for a sparkline, oldest first. Only present when the data supports it. */
  trend?: number[];
  /** What the sparkline covers, e.g. "Last 14 days" or "Monthly, Apr–Oct 26". */
  trendLabel?: string;
}

export interface DrillTarget {
  /** Navigation id of the module that will hold the detailed view. */
  module: string;
  title: string;
  /** Extra filter context added on top of the global filters. */
  context?: Record<string, string>;
}

export interface SeriesPoint {
  key: string;
  label: string;
  [series: string]: string | number;
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  /** Optional dashed stroke for comparison series. */
  dashed?: boolean;
}

export interface ShareItem {
  key: string;
  label: string;
  value: number;
  color?: string;
  tone?: StatusTone;
}

/* ---------------- Section payloads ---------------- */

export interface OverviewData {
  members: KpiMetric[];
  scansToday: KpiMetric[];
  value: KpiMetric[];
  governance: KpiMetric[];
}

export interface ProgrammeRow {
  code: ProgrammeCode;
  registered: number;
  active: number;
  approved: number;
  pending: number;
  scans: number;
  pointsEarned: number;
  pointsRedeemed: number;
}

export interface ProgrammeDistributionData {
  rows: ProgrammeRow[];
}

export interface RegistrationAnalyticsData {
  monthly: SeriesPoint[];
  quarterly: SeriesPoint[];
  yearly: SeriesPoint[];
  byProgrammeMonthly: SeriesPoint[];
  byMemberType: ShareItem[];
  totals: { registrations: number; approvals: number; previousRegistrations: number | null };
  momRows: { month: string; registrations: number; previous: number | null; change: number | null }[];
}

export interface StatusSummaryRow {
  code: ProgrammeCode;
  counts: Partial<Record<RegistrationStatusKey, number>>;
  total: number;
}

export interface RegistrationStatusData {
  overall: ShareItem[];
  byProgramme: StatusSummaryRow[];
  approvalTrend: SeriesPoint[];
  ageing: ShareItem[];
  pendingByProgramme: ShareItem[];
  pendingByState: { code: string; name: string; pending: number; oldest: string }[];
}

export interface ActiveUsersData {
  dailyActive: SeriesPoint[];
  monthlyActive: SeriesPoint[];
  latestDau: number;
  latestMau: number;
  uniqueActiveInPeriod: number;
  totalMembers: number;
  byProgramme: { code: ProgrammeCode; active: number; inactive: number }[];
}

export interface GeoRow {
  code: string;
  name: string;
  members: number;
  active: number;
  approved: number;
  pending: number;
  scans: number;
  childCount: number;
  byProgramme: Record<ProgrammeCode, number>;
}

export interface GeographyData {
  level: "state" | "district" | "branch";
  parent?: { code: string; name: string; level: "state" | "district" };
  rows: GeoRow[];
}

export interface ScanningData {
  totals: { total: number; successful: number; failed: number; points: number; perActive: number; previousTotal: number | null };
  daily: SeriesPoint[];
  monthly: SeriesPoint[];
  byProgramme: ProgrammeScanRow[];
  byCategory: ShareItem[];
  byMemberType: ShareItem[];
  topProducts: { sku: string; name: string; category: string; scans: number; points: number }[];
}

export interface ProgrammeScanRow {
  code: ProgrammeCode;
  total: number;
  successful: number;
  failed: number;
  points: number;
  successRate: number;
}

export interface PointsData {
  lifetimeEarned: number;
  available: number;
  scanPoints: number;
  welcomeBonus: number;
  schemePoints: number;
  bonusPoints: number;
  redeemed: number;
  reversed: number;
  pendingSettlement: number;
  tdsDeducted: number;
  tdsKitty: number;
  movement: SeriesPoint[];
  byProgramme: { code: ProgrammeCode; earned: number; redeemed: number; available: number; tdsModel: string; kitty: number | null }[];
}

export interface RedemptionData {
  totals: { requests: number; successful: number; pending: number; rejected: number; cancelled: number; points: number; valueInr: number; pendingPayouts: number; pendingPayoutValue: number; failedPayouts: number };
  trend: SeriesPoint[];
  byProgramme: { code: ProgrammeCode; requests: number; successful: number; pending: number; points: number; valueInr: number; modes: string }[];
}

export interface KycCheckSummary {
  check: KycCheckKey;
  label: string;
  verified: number;
  pending: number;
  failed: number;
  notSubmitted: number;
  applicableProgrammes: ProgrammeCode[];
}

export interface KycData {
  checks: KycCheckSummary[];
  panOperative: { operative: number; inoperative: number; unknown: number };
  ageing: ShareItem[];
  byProgramme: { code: ProgrammeCode; checks: KycCheckKey[]; verified: number; pending: number; failed: number }[];
}

export interface SchemeRow {
  id: string;
  name: string;
  programme: ProgrammeCode;
  status: "draft" | "pending_approval" | "scheduled" | "active" | "completed" | "deactivated";
  start: string;
  end: string;
  participants: number;
  pointsIssued: number;
  budget: number | null;
}

export interface SchemeData {
  schemes: SchemeRow[];
  pointsTrend: SeriesPoint[];
}

export interface GiftData {
  catalogue: { total: number; active: number; outOfStock: number };
  statuses: ShareItem[];
  requests: number;
  byProgramme: { code: ProgrammeCode; orders: number; pending: number; dispatched: number; delivered: number; failed: number }[];
}

export interface TdsData {
  accrualTds: number;
  redemptionTds: number;
  kittyBalance: number;
  availablePoints: number;
  periodTds: number;
  monthly: SeriesPoint[];
  panOperative: { operative: number; inoperative: number; unknown: number };
  byProgramme: { code: ProgrammeCode; model: string; accrual: number; redemption: number; kitty: number | null; pendingActions: number }[];
  pendingActivities: { label: string; count: number; module: string }[];
}

export interface ReferralData {
  totals: { total: number; successful: number; pending: number; rejected: number; pointsIssued: number; pointsRedeemed: number };
  trend: SeriesPoint[];
  byProgramme: { code: ProgrammeCode; enabled: boolean; total: number; successful: number; pending: number; rejected: number; pointsIssued: number }[];
}

export interface RiskAlert {
  id: string;
  raisedAt: string;
  category: string;
  programme: ProgrammeCode;
  state: string;
  memberRef: string;
  status: "new" | "under_review" | "escalated" | "resolved" | "dismissed";
  priority: "critical" | "high" | "medium" | "low";
}

export interface RiskData {
  totals: { flagged: number; pendingInvestigations: number; blocked: number; resolved: number };
  categories: ShareItem[];
  statuses: ShareItem[];
  trend: SeriesPoint[];
  ageing: ShareItem[];
  alerts: RiskAlert[];
}

export interface ActivityRow {
  id: string;
  at: string;
  type: string;
  reference: string;
  programme: ProgrammeCode | "All";
  initiatedBy: string;
  status: string;
  statusTone: StatusTone;
  priority: "critical" | "high" | "medium" | "low";
}

export interface OperationsData {
  approvals: { pending: number; ageing: ShareItem[] };
  tickets: { open: number; escalated: number; slaBreaches: number };
  integrations: { name: string; failed: number; lastFailure: string | null }[];
  jobs: { name: string; status: "on_time" | "delayed" | "failed"; lastRun: string; schedule: string }[];
  alerts: { at: string; message: string; tone: StatusTone }[];
  activities: ActivityRow[];
}

/** Common envelope for every section response. */
export interface SectionResult<T> {
  data: T;
  /** Timestamp of the (mock) data refresh. */
  refreshedAt: string;
  source: "demo";
}
