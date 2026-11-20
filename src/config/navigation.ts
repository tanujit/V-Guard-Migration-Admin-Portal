import type { LucideIcon } from "lucide-react";
import { IS_SIMULATION } from "@/config/environment";
import {
  Presentation as DemoIcon,
  Wrench as JobsIcon,
  Settings2 as PlatformIcon,
  MousePointerClick,
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
 * Navigation registry. The sidebar shows one entry per hub; a hub with several sections shows a
 * section switcher at the top of its pages. Shortcuts keep deep links reachable from search and
 * drill-downs without repeating them in the sidebar.
 */
export interface HubSection {
  label: string;
  path: string;
  permission: string;
  /** Extra path prefixes that belong to this section. */
  match?: string[];
  /** Match `path` exactly rather than as a prefix. */
  exact?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Catalogue permission key (module:action) that governs visibility. Evaluated by the access engine. */
  permission: string;
  status: "live" | "planned";
  /** One line describing the module's scope (search results and placeholders). */
  summary: string;
  scope?: string[];
  action?: "logout";
  /** Proposed scope (not in the agreed baseline): shown with a Proposed tag and its own treatment. */
  proposed?: boolean;
  /** Highlight only on an exact path match (for section landing pages). */
  exact?: boolean;
  /** Extra path prefixes that keep this entry highlighted. */
  match?: string[];
  /** Sections of a hub, shown as a switcher on its pages. */
  sections?: HubSection[];
  /** Not shown in the sidebar: reachable from search, drill-downs and links. */
  hidden?: boolean;
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
      { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard, permission: "dashboard:view", status: "live", summary: "Programme overview" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        id: "members", label: "Members", path: "/members", icon: Users, permission: "members:view", status: "live", summary: "Member records, registration and KYC",
        sections: [
          { label: "Members", path: "/members", permission: "members:view" },
          { label: "Registration & KYC", path: "/registration-kyc", permission: "registration-kyc:view" },
        ],
      },
      { id: "wallet", label: "Wallet & points", path: "/wallet", icon: Wallet, permission: "wallet:view", status: "live", summary: "Wallet, ledger, adjustments, settlement, TDS and configuration" },
      {
        id: "redemption", label: "Redemption & gifts", path: "/redemption", icon: Gift, permission: "redemption:view", status: "live", summary: "Redemptions, payouts, gift catalogue, orders and delivery",
        sections: [
          { label: "Redemption", path: "/redemption", permission: "redemption:view" },
          { label: "Gifts & orders", path: "/gifts", permission: "gift-orders:view" },
        ],
      },
      { id: "schemes", label: "Schemes & incentives", path: "/schemes", icon: Workflow, permission: "schemes:view", status: "live", summary: "Scheme builder, settlement, tiers, referrals and campaigns" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        id: "masters", label: "Master data", path: "/masters", icon: Database, permission: "products:view", status: "live", summary: "Products, categories, branches and scanning configuration",
        sections: [
          { label: "Overview", path: "/masters", permission: "products:view", match: ["/masters/decisions", "/masters/audit"], exact: true },
          { label: "Products", path: "/masters/products", permission: "products:view" },
          { label: "Categories", path: "/masters/categories", permission: "categories:view" },
          { label: "Branches", path: "/masters/branches", permission: "branches:view" },
          { label: "Scanning", path: "/masters/scanning", permission: "scan-config:view" },
        ],
      },
      { id: "communication", label: "Communication & helpdesk", path: "/masters/communication", icon: Megaphone, permission: "communication:view", status: "live", summary: "Notifications, templates, content and helpdesk" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { id: "users", label: "Users & roles", path: "/governance/users", icon: UserCog, permission: "users:view", status: "live", summary: "Portal users, roles, permissions and scope" },
      { id: "approvals", label: "Approvals", path: "/governance/approvals", icon: ClipboardCheck, permission: "approvals:view", status: "live", summary: "Maker-Checker requests and workflows" },
      { id: "fraud-rules", label: "Fraud & risk", path: "/governance/fraud", icon: ShieldAlert, permission: "fraud-rules:view", status: "live", summary: "Fraud queue, risk cases, rules and devices" },
      { id: "platform-admin", label: "Platform administration", path: "/governance/platform", icon: PlatformIcon, permission: "platform-admin:view", status: "live", summary: "Access governance, configuration, View-As, audit and readiness" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      { id: "reports", label: "Reports & analytics", path: "/reports", icon: BarChart3, permission: "reports:view", status: "live", summary: "Dashboards, reports, exports and alerts" },
      { id: "integrations", label: "Integrations & health", path: "/monitoring/integrations", icon: Network, permission: "integrations:view", status: "live", summary: "Integration health, failures, retries and system health", match: ["/monitoring"] },
    ],
  },
  ...(IS_SIMULATION
    ? [{ id: "demo", label: "Demo", items: [{ id: "demo-centre", label: "Demo centre", path: "/governance/demo-centre", icon: DemoIcon, permission: "session:demo-centre", status: "live" as const, summary: "Roles, guided scenarios, simulators and reset" }] }]
    : []),
  {
    id: "future",
    label: "Future scope",
    items: [
      { id: "job-management", label: "Job management", path: "/future/job-management", icon: JobsIcon, permission: "proposed-scope:view", status: "live", proposed: true, summary: "Proposed Module 12: technician jobs and field tooling, pending business approval" },
    ],
  },
];

/**
 * Deep links that used to repeat in the sidebar. They stay searchable and drillable, and keep the
 * ids other modules refer to.
 */
export const SHORTCUTS: NavItem[] = [
  { id: "registration-kyc", label: "Registration & KYC", path: "/registration-kyc", icon: BadgeCheck, permission: "registration-kyc:view", status: "live", summary: "Registration queues and KYC review", hidden: true },
  { id: "gift-fulfilment", label: "Gifts & orders", path: "/gifts", icon: PackageCheck, permission: "gift-orders:view", status: "live", summary: "Gift catalogue, vouchers, orders and delivery", hidden: true },
  { id: "scanning", label: "Scan & QR reports", path: "/reports/scans", icon: QrCode, permission: "scan-reports:view", status: "live", summary: "Scan-In / Scan-Out records and failures", hidden: true },
  { id: "tickets", label: "Helpdesk", path: "/masters/communication/helpdesk", icon: LifeBuoy, permission: "communication:view", status: "live", summary: "Helpdesk queries, escalations and SLA", hidden: true },
  { id: "content", label: "Content", path: "/masters/communication/content", icon: MessageSquareQuote, permission: "communication:view", status: "live", summary: "Content, FAQs and guides", hidden: true },
  { id: "products", label: "Products & SKUs", path: "/masters/products", icon: Boxes, permission: "products:view", status: "live", summary: "Products, SKUs and imports", hidden: true },
  { id: "categories", label: "Categories", path: "/masters/categories", icon: FolderTree, permission: "categories:view", status: "live", summary: "Category hierarchy", hidden: true },
  { id: "branches", label: "Branches & geography", path: "/masters/branches", icon: Building2, permission: "branches:view", status: "live", summary: "State, district and branch hierarchy", hidden: true },
  { id: "scanning-config", label: "Scanning configuration", path: "/masters/scanning", icon: ScanLine, permission: "scan-config:view", status: "live", summary: "Scan points, restriction rules and exceptions", hidden: true },
  { id: "financial", label: "Wallet configuration", path: "/wallet/config", icon: Landmark, permission: "wallet:view", status: "live", summary: "Wallet, TDS and redemption settings", hidden: true },
  { id: "audit", label: "Audit trail", path: "/governance/platform/audit", icon: History, permission: "platform-admin:view", status: "live", summary: "Central audit across modules", hidden: true },
  { id: "devices", label: "Devices", path: "/governance/fraud/devices", icon: Smartphone, permission: "devices:view", status: "live", summary: "Device directory, block and release", hidden: true },
  { id: "app-usage", label: "App usage", path: "/governance/platform/app-usage", icon: MousePointerClick, permission: "app-usage:view", status: "live", summary: "Member app screen and session usage", hidden: true },
  { id: "health", label: "System health", path: "/monitoring/integrations/system-health", icon: Activity, permission: "health:view", status: "live", summary: "API health, crashes and incidents", hidden: true },
  { id: "profile", label: "Profile & preferences", path: "/account/profile", icon: CircleUser, permission: "profile:view", status: "planned", summary: "Your details and preferences", hidden: true },
  { id: "logout", label: "Sign out", path: "/signed-out", icon: LogOut, permission: "session:signout", status: "live", summary: "End your session", action: "logout", hidden: true },
];

const SHORTCUT_GROUP: NavGroup = { id: "shortcuts", label: "Shortcuts", items: SHORTCUTS };

export const ALL_NAV_ITEMS = [...NAVIGATION, SHORTCUT_GROUP].flatMap((g) => g.items.map((i) => ({ ...i, group: g })));

export function findNavItemByPath(pathname: string) {
  return ALL_NAV_ITEMS.find((i) => i.path === pathname);
}

export function findNavItem(id: string) {
  return ALL_NAV_ITEMS.find((i) => i.id === id);
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

function sectionMatches(sec: HubSection, pathname: string) {
  return (sec.exact ? pathname === sec.path : under(pathname, sec.path)) || (sec.match ?? []).some((m) => under(pathname, m));
}

/** Length of the most specific prefix of `item` that matches `pathname` (0 when none). */
export function navMatchLength(item: NavItem, pathname: string): number {
  if (item.path === "/") return pathname === "/" ? 1 : 0;
  const hits = [
    ...(item.sections ?? []).filter((s) => sectionMatches(s, pathname)).map((s) => s.path),
    ...[item.path, ...(item.match ?? [])].filter((p) => under(pathname, p)),
  ];
  return hits.reduce((n, p) => Math.max(n, p.length), 0);
}

/** The sidebar entry that owns `pathname`: the most specific match wins. */
export function activeNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  let len = 0;
  for (const g of NAVIGATION)
    for (const i of g.items) {
      const n = navMatchLength(i, pathname);
      if (n > len) {
        best = i;
        len = n;
      }
    }
  return best;
}

/** The hub section shown for `pathname`. */
export function activeSection(item: NavItem, pathname: string): HubSection | undefined {
  return [...(item.sections ?? [])].sort((a, b) => b.path.length - a.path.length).find((s) => sectionMatches(s, pathname));
}
