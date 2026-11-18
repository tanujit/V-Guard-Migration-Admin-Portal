import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeCheck,
  Boxes,
  Building2,
  ClipboardCheck,
  FolderTree,
  Gift,
  History,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Map,
  Megaphone,
  MessageSquareQuote,
  Network,
  QrCode,
  ShieldAlert,
  UserCog,
  Users,
  Wallet,
  Workflow,
  BarChart3,
  CircleUser,
  Smartphone,
  Database,
  ScanLine,
  PackageCheck,
} from "lucide-react";

/**
 * Navigation registry. Each item declares the permission that will govern its visibility once
 * RBAC lands; `phase` marks modules that are not yet implemented so they never look finished.
 */
export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Catalogue permission key (module:action) that governs visibility. Evaluated by the access engine. */
  permission: string;
  status: "live" | "planned";
  /** One line describing the module's intended scope, shown on its placeholder page. */
  summary: string;
  /** Things the module is expected to hold, used by placeholder and drill-down views. */
  scope?: string[];
  action?: "logout";
  /** Highlight only on an exact path match (for section landing pages). */
  exact?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard, permission: "dashboard:view", status: "live", summary: "Consolidated view of the V-Guard Rishta ecosystem" },
    ],
  },
  {
    id: "operations",
    label: "Programme operations",
    items: [
      { id: "members", label: "Member management", path: "/members", icon: Users, permission: "members:view", status: "live", summary: "Search, view and govern member records across programmes", scope: ["Member search and profile", "Status changes through Maker-Checker", "Programme and geography scoped lists"] },
      { id: "registration-kyc", label: "Registration & KYC", path: "/registration-kyc", icon: BadgeCheck, permission: "registration-kyc:view", status: "live", summary: "Registration queues, verification outcomes and KYC case handling", scope: ["Registration queues by status", "Verification outcomes", "KYC case ageing"] },
      { id: "wallet", label: "Wallet & points", path: "/wallet", icon: Wallet, permission: "wallet:view", status: "live", summary: "Unified wallet, points ledger, adjustments, reversals, transfers, settlement, TDS, GST gate, reports and reconciliation", scope: ["Member points ledger", "Adjustments through approval", "TDS Kitty ledger kept separate"] },
      { id: "scanning", label: "Scanning management", path: "/scanning", icon: QrCode, permission: "scanning:view", status: "planned", summary: "QR scan records, failures and scan points", scope: ["Scan records with filters", "Failure reasons", "Scan points issued"] },
      { id: "redemption", label: "Redemption & fulfilment", path: "/redemption", icon: Gift, permission: "redemption:view", status: "live", summary: "Redemption requests, payouts, vouchers, products, backend gifts, cancellation, limits and EMI", scope: ["Redemption requests", "Payout status", "Gift orders and delivery"] },
      { id: "gift-fulfilment", label: "Gift & fulfilment", path: "/gifts", icon: PackageCheck, permission: "gift-orders:view", status: "live", summary: "Gift catalogue, segment point costs, partners, vouchers, physical orders, delivery tracking, backend gifts and insurance cards", scope: ["Catalogue and point costs", "Vouchers and recovery", "Orders and delivery tracking", "Insurance cards"] },
      { id: "tickets", label: "Tickets & support", path: "/tickets", icon: LifeBuoy, permission: "tickets:view", status: "planned", summary: "Member support tickets, escalations and SLA", scope: ["Ticket queues", "Escalations", "SLA tracking"] },
      { id: "geo", label: "Geo & location", path: "/geo", icon: Map, permission: "geo:view", status: "planned", summary: "Geography hierarchy visibility (SFDC-owned masters are read only)", scope: ["State, district and branch views", "Location anomalies"] },
    ],
  },
  {
    id: "masters",
    label: "Masters & configuration",
    items: [
      { id: "masters-overview", label: "Master data overview", path: "/masters", icon: Database, permission: "products:view", status: "live", summary: "Products, categories, hierarchy and scanning configuration at a glance", exact: true },
      { id: "products", label: "Product & SKU master", path: "/masters/products", icon: Boxes, permission: "products:view", status: "live", summary: "Products, SKUs, branch mapping, warranty and installation" },
      { id: "categories", label: "Category & sub-category", path: "/masters/categories", icon: FolderTree, permission: "categories:view", status: "live", summary: "Product category hierarchy" },
      { id: "branches", label: "Branch & hierarchy", path: "/masters/branches", icon: Building2, permission: "branches:view", status: "live", summary: "State, district and branch hierarchy with SFDC synchronisation status" },
      { id: "scanning-config", label: "Scanning configuration", path: "/masters/scanning", icon: ScanLine, permission: "scan-config:view", status: "live", summary: "Scan-In/Scan-Out points, scan restriction rules and exception settings" },
      { id: "schemes", label: "Schemes & incentives", path: "/schemes", icon: Workflow, permission: "schemes:view", status: "live", summary: "Scheme Builder, settlement, tiers, referrals, campaigns and gamification" },
      { id: "financial", label: "Financial configuration", path: "/masters/financial", icon: Landmark, permission: "financial:view", status: "planned", summary: "Point values, TDS rules and payout settings per programme" },
      { id: "communication", label: "Communication centre", path: "/masters/communication", icon: Megaphone, permission: "communication:view", status: "live", summary: "In-app notifications, SMS and templates" },
      { id: "content", label: "Content & testimonials", path: "/masters/content", icon: MessageSquareQuote, permission: "content:view", status: "planned", summary: "App content, banners and testimonials" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { id: "users", label: "User & role management", path: "/governance/users", icon: UserCog, permission: "users:view", status: "live", summary: "Portal users, roles, permissions and access scopes" },
      { id: "approvals", label: "Approval centre", path: "/governance/approvals", icon: ClipboardCheck, permission: "approvals:view", status: "live", summary: "Maker-Checker queues with change comparison and history" },
      { id: "audit", label: "Audit trail", path: "/governance/audit", icon: History, permission: "audit:view", status: "planned", summary: "Immutable record of every action in the portal" },
      { id: "fraud-rules", label: "Fraud & risk rules", path: "/governance/fraud", icon: ShieldAlert, permission: "fraud-rules:view", status: "live", summary: "Fraud review queue, risk cases, anomaly rules, device governance, QR integrity, data integrity, SFDC reconciliation and compliance", scope: ["Central fraud review queue", "Risk case management", "Device governance", "Data integrity and reconciliation"] },
      { id: "devices", label: "Device & security", path: "/governance/fraud/devices", icon: Smartphone, permission: "devices:view", status: "live", summary: "Device and IMEI directory, shared-device visibility, login locations, device block and release" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence & monitoring",
    items: [
      { id: "reports", label: "Reports & analytics", path: "/reports", icon: BarChart3, permission: "reports:view", status: "live", summary: "Business overview, KPI dictionary, engagement, points, schemes, scans, finance and programme reports, exports, schedules and threshold alerts (SOW Module 13)", scope: ["Central KPI dictionary", "Business dashboards", "Scan & QR and finance reports", "Scheduled reports and alerts"] },
      { id: "integrations", label: "Integration monitoring", path: "/monitoring/integrations", icon: Network, permission: "integrations:view", status: "live", summary: "SOW integrations, connection health, SFDC, eSeal, message trace, sync, jobs and queues, failures, retry, reconciliation and integration audit", scope: ["Integration directory and health", "Message trace", "Retry through backend contracts", "Incidents and alerts"] },
      { id: "health", label: "System health", path: "/monitoring/integrations/system-health", icon: Activity, permission: "health:view", status: "live", summary: "API health, performance, crashes, infrastructure and incident management" },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { id: "profile", label: "Profile & preferences", path: "/account/profile", icon: CircleUser, permission: "profile:view", status: "planned", summary: "Your details, notification preferences and sessions" },
      { id: "logout", label: "Sign out", path: "/signed-out", icon: LogOut, permission: "session:signout", status: "live", summary: "End your session", action: "logout" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAVIGATION.flatMap((g) => g.items.map((i) => ({ ...i, group: g })));

export function findNavItemByPath(pathname: string) {
  return ALL_NAV_ITEMS.find((i) => i.path === pathname);
}

export function findNavItem(id: string) {
  return ALL_NAV_ITEMS.find((i) => i.id === id);
}
