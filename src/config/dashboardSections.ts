import type { LucideIcon } from "lucide-react";
import { Activity, Coins, Gauge, Gift, Landmark, LayoutDashboard, ListChecks, MapPinned, Package, PieChart, QrCode, Share2, ShieldAlert, ShieldCheck, UserPlus, Workflow } from "lucide-react";
import type { DashboardFilters } from "@/types/dashboard";

type FilterKey = keyof Pick<DashboardFilters, "period" | "programme" | "state" | "category">;

export interface DashboardSectionDef {
  id: string;
  /** Section icon shown in the section header. */
  icon: LucideIcon;
  /** Reference to the Phase 1 brief (A–P). Not shown in the UI. */
  letter: string;
  title: string;
  description: string;
  group: string;
  defaultOpen: boolean;
  /** Filters this section responds to. Geography (state/district/branch) is grouped as "state". */
  responds: FilterKey[];
}

const ALL: FilterKey[] = ["period", "programme", "state", "category"];
const NO_CATEGORY: FilterKey[] = ["period", "programme", "state"];

export const DASHBOARD_GROUPS = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "activity", label: "Scans, points & redemption" },
  { id: "compliance", label: "Verification & finance" },
  { id: "engagement", label: "Schemes, gifts & referrals" },
  { id: "control", label: "Risk & operations" },
] as const;

export const DASHBOARD_SECTIONS: DashboardSectionDef[] = [
  { id: "overview", icon: LayoutDashboard, letter: "A", title: "Platform overview", description: "Headline figures for the selected period", group: "overview", defaultOpen: true, responds: ALL },
  { id: "programmes", icon: PieChart, letter: "B", title: "Programme distribution", description: "Members, scans and points by programme", group: "overview", defaultOpen: true, responds: ALL },
  { id: "registrations", icon: UserPlus, letter: "C", title: "Registration analytics", description: "Registrations and approvals over time", group: "members", defaultOpen: true, responds: NO_CATEGORY },
  { id: "approvals", icon: ListChecks, letter: "D", title: "Registration & approval status", description: "Where registrations sit in each programme's workflow", group: "members", defaultOpen: false, responds: NO_CATEGORY },
  { id: "active", icon: Activity, letter: "E", title: "Active members", description: "Daily and monthly activity", group: "members", defaultOpen: false, responds: NO_CATEGORY },
  { id: "geography", icon: MapPinned, letter: "F", title: "Geography", description: "State, district and branch distribution", group: "members", defaultOpen: false, responds: ["period", "programme", "state"] },
  { id: "scanning", icon: QrCode, letter: "G", title: "Scanning analytics", description: "QR scan volume, outcomes and products", group: "activity", defaultOpen: true, responds: ALL },
  { id: "points", icon: Coins, letter: "H", title: "Points summary", description: "Earning, balances and deductions", group: "activity", defaultOpen: false, responds: NO_CATEGORY },
  { id: "redemption", icon: Gift, letter: "I", title: "Redemption & payouts", description: "Requests, outcomes and pending payouts", group: "activity", defaultOpen: false, responds: NO_CATEGORY },
  { id: "kyc", icon: ShieldCheck, letter: "J", title: "KYC & verification", description: "Verification outcomes, aggregated counts only", group: "compliance", defaultOpen: false, responds: NO_CATEGORY },
  { id: "tds", icon: Landmark, letter: "M", title: "TDS & financial", description: "TDS by deduction model, kept apart from points", group: "compliance", defaultOpen: false, responds: NO_CATEGORY },
  { id: "schemes", icon: Workflow, letter: "K", title: "Scheme performance", description: "Scheme pipeline, issuance and budgets", group: "engagement", defaultOpen: false, responds: ["period", "programme"] },
  { id: "gifts", icon: Package, letter: "L", title: "Gifts & fulfilment", description: "Gift catalogue and order fulfilment", group: "engagement", defaultOpen: false, responds: NO_CATEGORY },
  { id: "referrals", icon: Share2, letter: "N", title: "Referral programme", description: "Referrals for programmes where referral is enabled", group: "engagement", defaultOpen: false, responds: NO_CATEGORY },
  { id: "risk", icon: ShieldAlert, letter: "O", title: "Fraud & risk", description: "Alerts and investigations — summary only", group: "control", defaultOpen: false, responds: NO_CATEGORY },
  { id: "operations", icon: Gauge, letter: "P", title: "Operational performance", description: "Approvals, tickets, integrations and jobs", group: "control", defaultOpen: true, responds: ["programme"] },
];
