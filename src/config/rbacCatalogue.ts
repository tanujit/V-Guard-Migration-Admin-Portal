import type { ActionDef, ActionId, ModuleDef, OrgTypeId, PermissionKey, RoleCategory } from "@/types/rbac";

/**
 * Central module & action catalogue. Module IDs are stable permission identifiers (they match the
 * navigation registry IDs, but permissions never depend on route paths).
 * Applicable actions per module are a development proposal pending business confirmation.
 */
export const ACTIONS: ActionDef[] = [
  { id: "view", label: "View", sow: true, restricted: false, description: "Open the module and read records in scope" },
  { id: "create", label: "Create", sow: true, restricted: false, description: "Create new records or drafts" },
  { id: "edit", label: "Edit", sow: true, restricted: false, description: "Change existing records" },
  { id: "submit", label: "Submit", sow: false, restricted: false, description: "Submit a change or request for approval" },
  { id: "approve", label: "Approve", sow: true, restricted: true, description: "Approve a submitted request" },
  { id: "reject", label: "Reject", sow: false, restricted: true, description: "Reject a submitted request" },
  { id: "return", label: "Return", sow: false, restricted: true, description: "Return a request for correction" },
  { id: "disable", label: "Disable", sow: true, restricted: true, description: "Disable, suspend or deactivate records" },
  { id: "export", label: "Export", sow: false, restricted: false, description: "Download data from the module" },
  { id: "execute", label: "Execute", sow: false, restricted: true, description: "Run jobs, payouts or batch operations" },
  { id: "manage", label: "Manage", sow: false, restricted: true, description: "Platform-level administration of the module" },
  { id: "assign_access", label: "Assign access", sow: false, restricted: true, description: "Grant or revoke access for other users" },
  { id: "view_sensitive", label: "View sensitive", sow: false, restricted: true, description: "See unmasked personal or financial data" },
  { id: "hold", label: "Temporary hold", sow: true, restricted: true, description: "Place a cross-programme temporary hold on a member identity" },
  { id: "reset_credentials", label: "Reset credentials", sow: true, restricted: true, description: "Trigger a member MPIN / credential reset (never reveals credentials)" },
  { id: "override", label: "Override verified data", sow: false, restricted: true, description: "Request a change to verified identity data under the override policy" },
  { id: "download", label: "Download documents", sow: false, restricted: true, description: "Download sensitive documents (separate from preview)" },
  { id: "activate", label: "Activate", sow: true, restricted: true, description: "Activate an approved configuration version through the engine adapter" },
  { id: "close", label: "Close", sow: true, restricted: true, description: "Raise closure of a completed scheme" },
  { id: "view_financial", label: "View financial exposure", sow: true, restricted: true, description: "See budget consumption, exposure and liability figures" },
  { id: "configure_formula", label: "Configure formula", sow: false, restricted: true, description: "Record a confirmed calculation formula in the formula registry" },
  { id: "cancel", label: "Cancel redemption", sow: true, restricted: true, description: "Initiate a redemption cancellation (SOW 10.5: Evolve Operations only, after checking payout status)" },
  { id: "publish", label: "Publish", sow: true, restricted: true, description: "Publish member-facing content or templates (separate from editing)" },
  { id: "recover", label: "Recover voucher", sow: true, restricted: true, description: "Ask the voucher service to re-send a lost voucher code (never issues a new voucher)" },
];

const A = (...ids: ActionId[]) => ids;

export const MODULES: ModuleDef[] = [
  { id: "dashboard", label: "Dashboard", category: "overview", actions: A("view", "export"), description: "Consolidated operational dashboard" },
  { id: "members", label: "Member management", category: "operations", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "hold", "reset_credentials", "override", "export", "view_sensitive"), description: "Member records, Member 360, restrictions and MPIN reset" },
  { id: "registration-kyc", label: "Registration & KYC", category: "operations", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "export", "view_sensitive", "download"), description: "Registration queues and verification" },
  { id: "wallet", label: "Wallet & points", category: "operations", actions: A("view", "export", "view_sensitive"), description: "Wallet overview, member wallets and balances (SOW 5.1). Sensitive financial data needs View sensitive" },
  { id: "points-ledger", label: "Points ledger & passbook", category: "operations", actions: A("view", "export"), description: "Immutable points ledger, transaction detail and passbook (SOW 5.7)" },
  { id: "points-adjustment", label: "Points adjustments", category: "operations", actions: A("view", "create", "submit", "approve", "reject", "return", "export"), description: "Single and bulk manual add / deduct (SOW 10.5 AF04)" },
  { id: "points-reversal", label: "Sales return & reversals", category: "operations", actions: A("view", "create", "submit", "approve", "reject", "return", "export"), description: "Sales-return, invalid-claim and wrong-credit reversals" },
  { id: "points-transfer", label: "Points transfers", category: "operations", actions: A("view", "create", "submit", "approve", "reject", "return", "export"), description: "Member-to-member transfers within a programme" },
  { id: "tds", label: "TDS management", category: "operations", actions: A("view", "export", "edit", "submit", "approve", "reject", "return"), description: "TDS Kitty, FY reconciliation, redemption TDS, quarterly and 26Q reports (SOW 5.4)" },
  { id: "gst-gate", label: "Retailer GST gate", category: "operations", actions: A("view", "create", "submit", "approve", "reject", "return", "export"), description: "GST eligibility, locked points and administrative overrides (SOW 5.5)" },
  { id: "fin-reconciliation", label: "Financial reconciliation", category: "operations", actions: A("view", "manage", "export"), description: "Reconciliation views and financial exceptions" },
  { id: "scanning", label: "Scanning management", category: "operations", actions: A("view", "edit", "submit", "export", "view_sensitive"), description: "QR scan records and failures" },
  { id: "redemption", label: "Redemption & fulfilment", category: "operations", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "execute", "export", "cancel", "recover"), description: "Redemptions, payouts, vouchers and cancellations" },
  { id: "gift-redemption", label: "Backend gift redemption", category: "operations", actions: A("view", "create", "submit", "approve", "reject", "return", "export"), description: "Gift redemption on behalf of a member, paid or FOC (SOW 10.5 AF03)" },
  { id: "redemption-limits", label: "Redemption limits & controls", category: "operations", actions: A("view", "edit", "submit", "approve", "reject", "return"), description: "Minimum balance, thresholds and limits (SOW 10.5 AF22/AF23)" },
  { id: "emi", label: "EMI via points", category: "operations", actions: A("view", "export"), description: "Retailer EMI point burns and financing references (SOW 5.6, OP-FIN1)" },
  { id: "vouchers", label: "Voucher operations", category: "operations", actions: A("view", "create", "submit", "approve", "reject", "return", "manage", "view_sensitive", "export"), description: "Voucher inventory, issuance, codes and recovery (SOW 8.2). Codes need View sensitive" },
  { id: "gift-orders", label: "Physical gift orders", category: "operations", actions: A("view", "manage", "view_sensitive", "export"), description: "Physical and V-Guard.com orders, address confirmation, tracking and delivery exceptions (SOW 8.3). Full address needs View sensitive" },
  { id: "insurance", label: "Insurance cards", category: "operations", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "publish", "activate", "disable", "export", "view_sensitive", "download"), description: "Insurance card types, CSV upload, preview, test download and on / off without an app release (SOW 8.4, AF20)" },
  { id: "tickets", label: "Tickets & support", category: "operations", actions: A("view", "create", "edit", "manage", "export"), description: "Support tickets and escalations" },
  { id: "geo", label: "Geo & location", category: "operations", actions: A("view", "export"), description: "Geography visibility (SFDC masters read only)" },
  { id: "products", label: "Product & SKU master", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "export"), description: "Products, SKUs and point values" },
  { id: "categories", label: "Category & sub-category", category: "masters", actions: A("view", "create", "edit", "submit", "disable"), description: "Product category hierarchy" },
  { id: "branches", label: "Branch & hierarchy", category: "masters", actions: A("view", "edit", "export", "manage"), description: "Branch hierarchy (SFDC-managed data stays read-only whatever the permission)" },
  { id: "scan-config", label: "Scanning configuration", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "export"), description: "Scan-In/Scan-Out points, scan restriction rules and exception settings" },
  { id: "schemes", label: "Scheme builder", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "activate", "disable", "close", "export", "view_financial", "configure_formula"), description: "Scheme design, versions, lifecycle and performance" },
  { id: "scheme-budget", label: "Scheme budget & exposure", category: "masters", actions: A("view", "edit", "submit", "approve", "reject", "return", "export"), description: "Scheme budgets, budget changes and backdated calculation exposure" },
  { id: "scheme-settlement", label: "Scheme settlement", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "execute", "export"), description: "Unsettled scheme points, partial release and settlement approval" },
  { id: "tiers", label: "Tier management", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "export"), description: "Tiers, tier benefits and branch-wise tier configuration" },
  { id: "referrals", label: "Referral management", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "export"), description: "Referral rules, relationships and tracking" },
  { id: "campaigns", label: "Campaigns & contests", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "export", "view_sensitive"), description: "Campaigns, contests, FOC and gift entitlements" },
  { id: "gamification", label: "Gamification & bonuses", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable"), description: "Badges, streaks, scratch cards, spin wheel, leaderboards and bonuses" },
  { id: "financial", label: "Financial configuration", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "view_sensitive"), description: "Point values, TDS and payout settings" },
  { id: "communication", label: "Communication centre", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "execute", "cancel", "manage", "export"), description: "Notifications and templates" },
  { id: "content", label: "Content & testimonials", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "publish", "manage"), description: "App content and testimonials" },
  { id: "comm-templates", label: "Notification catalogue & templates", category: "masters", actions: A("view", "edit", "submit", "approve", "reject", "return", "disable", "publish"), description: "N01–N11 configuration, localised templates and versions (SOW 7.2)" },
  { id: "banners", label: "Banners & home scrollers", category: "masters", actions: A("view", "create", "edit", "disable", "publish"), description: "Home banners and scrollers. Publish is reserved for named HO Admin users (SOW 10.8 AF06)" },
  { id: "comm-bot", label: "WhatsApp bot", category: "masters", actions: A("view", "edit", "submit", "approve", "reject", "return", "publish"), description: "Role-based bot menus, safe actions and conversation monitoring (SOW 7.3)" },
  { id: "surveys", label: "Surveys", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "publish", "export"), description: "Survey configuration, N06 dispatch and responses (SOW 7.7)" },
  { id: "gift-catalogue", label: "Gift catalogue", category: "masters", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "publish", "disable", "export", "manage"), description: "Gift items, categories, segment point costs and segmentation (SOW 8.1 / 8.5)" },
  { id: "fulfilment-partners", label: "Fulfilment partners", category: "masters", actions: A("view", "create", "edit", "manage", "export"), description: "Fulfilment partners, partner / SKU mapping and integration status (SOW 8.1)" },
  { id: "fraud-rules", label: "Fraud & risk rules", category: "governance", actions: A("view", "create", "edit", "submit", "approve", "reject", "return", "disable", "execute", "manage", "view_sensitive", "export"), description: "Fraud review queue, risk cases, anomaly thresholds, QR integrity, data integrity, reconciliation and compliance (SOW Module 9). Sensitive evidence needs View sensitive" },
  { id: "users", label: "User & role management", category: "governance", actions: A("view", "create", "edit", "submit", "disable", "export", "manage", "assign_access", "view_sensitive"), description: "Users, organisations, roles and access" },
  { id: "approvals", label: "Approval centre", category: "governance", actions: A("view", "approve", "reject", "return"), description: "Maker-Checker queues (Phase 3)" },
  { id: "audit", label: "Audit trail", category: "governance", actions: A("view", "export"), description: "Immutable action history" },
  { id: "devices", label: "Device & security", category: "governance", actions: A("view", "edit", "submit", "approve", "reject", "return", "disable", "manage", "view_sensitive", "export"), description: "Device and IMEI governance, login locations, device block and release (SOW 3.2 / 9.2). Login locations need View sensitive" },
  { id: "reports", label: "Reports & analytics", category: "intelligence", actions: A("view", "export", "execute", "create", "manage"), description: "Report catalogue, report execution, exports and scheduled reports. Create schedules a report; Manage administers all schedules and recipients" },
  { id: "analytics", label: "Business analytics dashboards", category: "intelligence", actions: A("view", "export"), description: "Business overview and analytics dashboards (SOW 13.3). Export saves a dashboard as PDF or PNG. Raw member-level export needs the report permissions" },
  { id: "member-analytics", label: "Member 360 analytics", category: "intelligence", actions: A("view", "export", "view_sensitive"), description: "Member 360 reporting view, mapped-member performance and Member 360 export (SOW 13.4)" },
  { id: "finance-reports", label: "Finance reports", category: "intelligence", actions: A("view", "export", "view_sensitive", "view_financial"), description: "Points ageing and TDS monthly liability (SOW 13.6). View sensitive shows the PAN reference unmasked" },
  { id: "scan-reports", label: "Scan & QR reports", category: "intelligence", actions: A("view", "export", "view_sensitive"), description: "QR / scan, Scan-In, Scan-Out and parent-child reports (SOW 13.5). View sensitive shows precise scan location and the salesperson field" },
  { id: "kpi-governance", label: "KPI governance", category: "intelligence", actions: A("view", "edit", "submit", "approve", "reject", "return", "manage"), description: "KPI dictionary, definition and target changes (Maker-Checker), threshold alerts and analytics decisions (SOW 13.1, 13.8)" },
  { id: "integrations", label: "Integration monitoring", category: "intelligence", actions: A("view", "edit", "submit", "approve", "reject", "return", "execute", "manage", "view_sensitive", "export"), description: "Integration directory, connection health, SFDC, eSeal and other connections, message trace, sync, jobs and queues, failures, retry and reprocessing (SOW Module 11). Retry and reprocess need Execute; personal payload data needs View sensitive" },
  { id: "health", label: "System health", category: "intelligence", actions: A("view", "create", "edit", "close", "execute", "manage", "view_sensitive", "export"), description: "API health, performance, crashes, infrastructure, alerts and incidents. Stack traces need View sensitive" },
  { id: "member-diagnostics", label: "Member diagnostics", category: "intelligence", actions: A("view", "view_sensitive"), description: "Technical support view of one member: logins, devices, API failures and app errors. Separate from Member 360; every access is logged" },
  { id: "auth-audit", label: "Authentication audit", category: "intelligence", actions: A("view", "view_sensitive", "export"), description: "Login, MPIN, SAML / Single Sign-On and device authentication events (never MPIN values)" },
  { id: "adoption", label: "Adoption monitoring", category: "intelligence", actions: A("view", "manage", "export"), description: "Enrolled members who never logged in and members dormant for X days (SOW 10.11)" },
  { id: "float-monitoring", label: "Redemption float monitoring", category: "intelligence", actions: A("view", "manage", "export"), description: "RazorPay redemption payout float and low-balance alerts, kept separate from TDS Kitty and points balances" },
];

export const MODULE_CATEGORY_LABEL: Record<ModuleDef["category"], string> = {
  overview: "Overview",
  operations: "Programme operations",
  masters: "Masters & configuration",
  governance: "Governance",
  intelligence: "Intelligence & monitoring",
};

export const ROLE_CATEGORY_LABEL: Record<RoleCategory, string> = {
  platform: "Platform role",
  business: "Business role",
  operational: "Operational profile",
};

export const ORG_TYPE_LABEL: Record<OrgTypeId, string> = {
  platform_owner: "Platform owner",
  client: "Client",
  external_partner: "External partner",
  other: "Other",
};

export const key = (module: string, action: ActionId): PermissionKey => `${module}:${action}`;

export function parseKey(k: PermissionKey): { module: string; action: ActionId } {
  const i = k.lastIndexOf(":");
  return { module: k.slice(0, i), action: k.slice(i + 1) as ActionId };
}

export const moduleById = new Map(MODULES.map((m) => [m.id, m]));
export const actionById = new Map(ACTIONS.map((a) => [a.id, a]));

/** Every grantable permission key. */
export const ALL_PERMISSION_KEYS: PermissionKey[] = MODULES.flatMap((m) => m.actions.map((a) => key(m.id, a)));

export function isGrantable(k: PermissionKey) {
  const { module, action } = parseKey(k);
  return !!moduleById.get(module)?.actions.includes(action);
}

/** Modules where Maker/Checker operational profiles are meaningful (they have a submit or approve action). */
export const MAKER_MODULES = MODULES.filter((m) => m.actions.includes("submit")).map((m) => m.id);
export const CHECKER_MODULES = MODULES.filter((m) => m.actions.includes("approve")).map((m) => m.id);

/** Permissions that must stay behind explicit platform administration. */
export const PLATFORM_ADMIN_KEY = key("users", "manage");
export const ASSIGN_ACCESS_KEY = key("users", "assign_access");
