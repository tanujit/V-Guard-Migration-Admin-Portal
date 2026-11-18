/**
 * MOCK IDENTITY & ACCESS DATA — development only.
 * People, emails and mobiles are fictional (".example" domains). Role permission sets are
 * proposals pending business confirmation. Several records deliberately exercise edge cases
 * (noted inline) so the access engine and screens can be tested.
 */
import { ALL_PERMISSION_KEYS, key, MODULES } from "@/config/rbacCatalogue";
import type { ActionId, AuditEvent, DirectGrant, MakerNomination, OrgMembership, Organisation, PermissionKey, Role, RoleAssignment, User } from "@/types/rbac";

export const ORG = { EVOLVE: "ORG-0001", VGUARD: "ORG-0002", SAMPARK: "ORG-0003", LEGACY: "ORG-0004" } as const;
export const ROLE = {
  SUPER_ADMIN: "ROLE-0001",
  CLIENT_ADMIN: "ROLE-0002",
  REGIONAL_ADMIN: "ROLE-0003",
  BRANCH_MANAGER: "ROLE-0004",
  SALES_REP: "ROLE-0005",
  EVOLVE_OPS: "ROLE-0006",
  FINANCE: "ROLE-0007",
  MAKER: "ROLE-0008",
  CHECKER: "ROLE-0009",
} as const;

/** Keys for the given modules and actions, keeping only those the module supports. */
function perms(modules: string[] | "all", actions: ActionId[]): PermissionKey[] {
  const mods = modules === "all" ? MODULES.map((m) => m.id) : modules;
  return mods.flatMap((m) => {
    const def = MODULES.find((x) => x.id === m);
    return def ? actions.filter((a) => def.actions.includes(a)).map((a) => key(m, a)) : [];
  });
}
const uniq = (xs: PermissionKey[]) => Array.from(new Set(xs));

const OPERATIONS = ["members", "registration-kyc", "wallet", "scanning", "redemption", "tickets", "geo"];
/** Phase 7 financial operation modules (SOW Module 5 and 10.5). */
const FINANCE_OPS = ["points-ledger", "points-adjustment", "points-reversal", "points-transfer", "tds", "gst-gate", "fin-reconciliation", "gift-redemption", "redemption-limits", "emi"];
const MASTERS = ["products", "categories", "branches", "scan-config", "schemes", "scheme-budget", "scheme-settlement", "tiers", "referrals", "campaigns", "gamification", "financial", "communication", "content", "fraud-rules", "comm-templates", "banners", "comm-bot", "surveys"];
const INTEL = ["reports", "integrations", "health"];
/** Phase 9 Gift & Fulfilment and Insurance Card modules (SOW Module 8). */
const GIFT_OPS = ["gift-catalogue", "fulfilment-partners", "vouchers", "gift-orders", "insurance"];

const T0 = "2025-04-01T09:00";

export const SEED_ORGANISATIONS: Organisation[] = [
  { id: ORG.EVOLVE, code: "EVOLVE", name: "Evolve Brands", type: "platform_owner", description: "Platform owner and technology / operations partner", primaryContact: { name: "Platform administration", email: "platform-admin@evolve.example" }, status: "active", parentId: null, createdAt: T0, createdBy: "SYSTEM" },
  { id: ORG.VGUARD, code: "VGUARD", name: "V-Guard", type: "client", description: "Business client and governance authority", primaryContact: { name: "V-Guard HO administration", email: "ho-admin@vguard.example" }, status: "active", parentId: null, createdAt: T0, createdBy: "SYSTEM" },
  { id: ORG.SAMPARK, code: "SAMPARK", name: "Sampark Field Services (demo)", type: "external_partner", description: "Sample external partner used to test partner access", primaryContact: { name: "Partner desk", email: "desk@sampark.example" }, status: "active", parentId: null, createdAt: "2026-02-10T11:00", createdBy: "USR-1001" },
  { id: ORG.LEGACY, code: "LEGACYAUD", name: "Legacy Audit Partner (demo)", type: "other", description: "Sample deactivated organisation (edge case: users of an inactive organisation)", primaryContact: { name: "Audit liaison", email: "liaison@legacy-audit.example" }, status: "inactive", parentId: null, createdAt: "2025-06-01T10:00", createdBy: "USR-1001" },
];

/** Approval actions are never part of administrative or business templates: approval rights come only from the Checker profile. */
const APPROVAL: ActionId[] = ["approve", "reject", "return"];
const SENSITIVE_DATA_MODULES = ["members", "registration-kyc", "wallet", "financial", "scanning", "campaigns", "vouchers", "gift-orders", "insurance", "fraud-rules", "devices", "integrations", "health", "member-diagnostics", "auth-audit", "member-analytics", "finance-reports", "scan-reports"];
/** Business actions kept with Evolve Operations (SOW 10.5: only Evolve Operations cancels a redemption). */
const OPERATIONS_ONLY: ActionId[] = ["cancel", "recover"];

const superAdminPerms = ALL_PERMISSION_KEYS.filter((k) => {
  const [m, a] = [k.slice(0, k.lastIndexOf(":")), k.slice(k.lastIndexOf(":") + 1) as ActionId];
  if (APPROVAL.includes(a)) return false;
  if ((a === "view_sensitive" || a === "download") && SENSITIVE_DATA_MODULES.includes(m)) return false;
  if (a === "execute" && (m === "redemption" || m === "communication" || m === "integrations")) return false; // business executions and reprocessing stay with operations
  if (m === "member-diagnostics") return false; // separate technical-support permission (SOW 11.7)
  if (m === "float-monitoring" && a === "manage") return false; // finance policy
  if (OPERATIONS_ONLY.includes(a)) return false;
  if (m === "fin-reconciliation" && a === "manage") return false;
  if (m === "banners" && a === "publish") return false; // named HO Admin publishers only (direct grant)
  return true;
});

const role = (r: Omit<Role, "updatedAt" | "updatedBy" | "status"> & Partial<Pick<Role, "status">>): Role => ({ status: "active", updatedAt: T0, updatedBy: "SYSTEM", ...r });

export const SEED_ROLES: Role[] = [
  role({ id: ROLE.SUPER_ADMIN, code: "EVOLVE_SUPER_ADMIN", name: "Evolve Super Admin", description: "Complete platform administration. Holds no approval rights: financial and member-status approvals still need a Checker", category: "platform", orgApplicability: [ORG.EVOLVE], system: true, protected: true, permissions: superAdminPerms, scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: [] }),
  role({ id: ROLE.CLIENT_ADMIN, code: "VGUARD_CLIENT_ADMIN", name: "V-Guard Client Admin", description: "Client-side governance: monitors operations, manages delegated V-Guard users and nominates Makers", category: "business", orgApplicability: [ORG.VGUARD], system: true, protected: true, permissions: uniq([...perms(["dashboard"], ["view", "export"]), ...perms([...OPERATIONS, ...FINANCE_OPS, ...MASTERS, ...GIFT_OPS, ...INTEL, "devices"], ["view", "export"]), ...perms(["tickets"], ["create", "edit"]), ...perms(["users"], ["view", "create", "edit", "submit", "disable", "export", "assign_access"]), ...perms(["approvals", "audit"], ["view", "export"]), ...perms(["members"], ["disable", "hold"]), ...perms(["schemes"], ["view_financial"]), ...perms(["auth-audit", "adoption"], ["view", "export"]), ...perms(["float-monitoring"], ["view"]), ...perms(["analytics", "member-analytics", "scan-reports"], ["view", "export"]), ...perms(["reports"], ["execute", "create"]), ...perms(["finance-reports", "kpi-governance"], ["view"])]), scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: ["HO Admin"] }),
  role({ id: ROLE.REGIONAL_ADMIN, code: "REGIONAL_ADMIN", name: "Regional Admin", description: "Regional business administration within assigned states", category: "business", orgApplicability: [ORG.VGUARD], system: true, protected: false, permissions: uniq([...perms(["dashboard"], ["view", "export"]), ...perms(["members", "registration-kyc", "wallet", "scanning", "redemption", "geo", "reports", "gift-orders", "vouchers", "fraud-rules"], ["view", "export"]), ...perms(["devices"], ["view"]), ...perms(["tickets"], ["view", "edit", "export"]), ...perms(["users"], ["view"]), ...perms(["adoption"], ["view", "export"]), ...perms(["analytics", "member-analytics", "scan-reports"], ["view"]), ...perms(["reports"], ["execute"])]), scopeCeiling: { programmes: "all", geography: "state" }, legacyNames: ["Regional Admin"] }),
  role({ id: ROLE.BRANCH_MANAGER, code: "BRANCH_MANAGER_PIC", name: "Branch Manager/PIC", description: "Branch-level operational responsibility", category: "business", orgApplicability: [ORG.VGUARD], system: true, protected: false, permissions: uniq([...perms(["dashboard", "members", "registration-kyc", "scanning", "geo", "reports"], ["view"]), ...perms(["tickets"], ["view", "create", "edit"])]), scopeCeiling: { programmes: "all", geography: "branch" }, legacyNames: ["Branch Manager", "PIC"] }),
  role({ id: ROLE.SALES_REP, code: "SALES_REP", name: "Sales Rep", description: "Assigned sales visibility and activity", category: "business", orgApplicability: [ORG.VGUARD], system: true, protected: false, permissions: uniq([...perms(["members"], ["create"]), ...perms(["registration-kyc"], ["view"]), ...perms(["dashboard", "members", "scanning", "reports"], ["view"]), ...perms(["tickets"], ["view", "create"]), ...perms(["member-analytics"], ["view"])]), scopeCeiling: { programmes: "all", geography: "branch" }, legacyNames: ["Sales Rep"] }),
  role({ id: ROLE.EVOLVE_OPS, code: "EVOLVE_OPERATIONS", name: "Evolve Operations", description: "Platform operational activities", category: "business", orgApplicability: [ORG.EVOLVE], system: true, protected: false, permissions: uniq([...perms(["members"], ["reset_credentials"]), ...perms(["dashboard"], ["view", "export"]), ...perms([...OPERATIONS, ...FINANCE_OPS, ...MASTERS, ...GIFT_OPS], ["view", "export"]), ...perms(["gift-orders"], ["manage", "view_sensitive"]), ...perms(["vouchers", "fulfilment-partners", "gift-catalogue"], ["manage"]), ...perms(["gift-catalogue"], ["publish", "disable"]), ...perms(["insurance"], ["publish", "activate", "disable"]), ...perms(["fraud-rules"], ["edit", "manage", "execute", "export"]), ...perms(["devices"], ["view", "export", "edit", "disable", "manage"]), ...perms(["members", "registration-kyc", "tickets"], ["edit"]), ...perms(["tickets"], ["create", "manage"]), ...perms(["redemption", "communication"], ["execute"]), ...perms(["redemption"], ["cancel", "recover"]), ...perms(["fin-reconciliation"], ["manage"]), ...perms(["content"], ["publish", "manage"]), ...perms(["communication"], ["cancel", "manage"]), ...perms(["tickets"], ["edit"]), ...perms(INTEL, ["view", "execute", "export"]), ...perms(["integrations"], ["edit", "manage"]), ...perms(["health"], ["create", "edit", "close", "manage"]), ...perms(["member-diagnostics", "auth-audit", "adoption"], ["view"]), ...perms(["auth-audit", "adoption"], ["export"]), ...perms(["adoption"], ["manage"]), ...perms(["analytics", "member-analytics", "scan-reports"], ["view", "export"]), ...perms(["reports"], ["create", "manage"]), ...perms(["kpi-governance"], ["view", "edit", "manage"]), ...perms(["audit"], ["view"]), ...perms(["schemes"], ["activate", "disable", "close"]), ...perms(["campaigns"], ["view_sensitive"])]), scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: ["Evolve Operations"] }),
  role({ id: ROLE.FINANCE, code: "FINANCE", name: "Finance", description: "Financial visibility and permitted finance operations", category: "business", orgApplicability: "any", system: true, protected: false, permissions: uniq([...perms(["dashboard"], ["view", "export"]), ...perms(["wallet", "redemption", "financial", "reports", "vouchers", "gift-orders", "fraud-rules", ...FINANCE_OPS], ["view", "export"]), ...perms(["wallet", "financial"], ["view_sensitive"]), ...perms(["fin-reconciliation"], ["manage"]), ...perms(["schemes", "scheme-budget", "scheme-settlement"], ["view", "export"]), ...perms(["schemes"], ["view_financial"]), ...perms(["float-monitoring"], ["view", "manage", "export"]), ...perms(["integrations"], ["view"]), ...perms(["analytics"], ["view", "export"]), ...perms(["reports"], ["execute", "create"]), ...perms(["finance-reports"], ["view", "export", "view_financial"]), ...perms(["kpi-governance"], ["view"])]), scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: ["Finance"] }),
  role({ id: ROLE.MAKER, code: "MAKER", name: "Maker", description: "Creates and submits operational changes. Cannot approve", category: "operational", orgApplicability: "any", system: true, protected: true, permissions: uniq([...perms([...OPERATIONS, ...FINANCE_OPS, ...MASTERS, ...GIFT_OPS, "devices"], ["view", "create", "edit", "submit"]), ...perms(["integrations"], ["view", "submit"]), ...perms(["kpi-governance"], ["view", "submit"]), ...perms(["schemes"], ["view_financial"]), ...perms(["approvals"], ["view"])]), scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: [] }),
  role({ id: ROLE.CHECKER, code: "CHECKER", name: "Checker", description: "Reviews submitted requests: approve, reject or return with remarks", category: "operational", orgApplicability: "any", system: true, protected: true, permissions: uniq([...perms([...OPERATIONS, ...FINANCE_OPS, ...MASTERS, ...GIFT_OPS, "devices", "integrations", "kpi-governance"], ["view", "approve", "reject", "return"]), ...perms(["schemes"], ["view_financial"]), ...perms(["approvals"], ["view", "approve", "reject", "return"])]), scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: [] }),
];

const sec = (over: Partial<User["security"]> = {}): User["security"] => ({ failedLogins: 0, lastCredentialReset: null, mfa: "not_supported_yet", lockHistory: [], ...over });

const u = (id: string, firstName: string, lastName: string, email: string, mobile: string, designation: string, department: string, over: Partial<User> = {}): User => ({
  id,
  firstName,
  lastName,
  email,
  mobile,
  employeeId: null,
  designation,
  department,
  reportingManagerId: null,
  accountStatus: "active",
  authMethod: "mock",
  createdAt: "2025-05-12T10:00",
  createdBy: "USR-1001",
  lastLoginAt: "2026-11-08T18:20",
  invitation: { ref: `INV-${id.slice(4)}`, sentAt: "2025-05-12T10:00", status: "accepted" },
  security: sec(),
  ...over,
});

export const SEED_USERS: User[] = [
  u("USR-1001", "Tanujit", "Roy", "tanujit.roy@evolve.example", "+91 98470 11001", "Head of Platform", "Platform", { employeeId: "EVB-0007", createdAt: "2025-04-01T09:00", createdBy: "SYSTEM", lastLoginAt: "2026-11-09T09:12" }),
  u("USR-1002", "Meera", "Pillai", "meera.pillai@evolve.example", "+91 98470 11002", "Platform Administrator", "Platform", { employeeId: "EVB-0011", createdAt: "2025-04-01T09:05", createdBy: "SYSTEM", lastLoginAt: "2026-11-07T16:44" }),
  u("USR-1003", "Rahul", "Menon", "rahul.menon@evolve.example", "+91 98470 11003", "Operations Lead", "Operations", { employeeId: "EVB-0023", lastLoginAt: "2026-11-09T10:02" }),
  u("USR-1004", "Sneha", "Das", "sneha.das@evolve.example", "+91 98470 11004", "Operations Analyst", "Operations", { employeeId: "EVB-0031" }),
  // Edge: active account, suspended operational profile
  u("USR-1005", "Arjun", "Varghese", "arjun.varghese@evolve.example", "+91 98470 11005", "Content Specialist", "Operations", { employeeId: "EVB-0035", lastLoginAt: "2026-11-02T12:10" }),
  // Invited, not yet accepted
  u("USR-1006", "Kavya", "Iyer", "kavya.iyer@evolve.example", "+91 98470 11006", "Operations Analyst", "Operations", { accountStatus: "invited", lastLoginAt: null, createdAt: "2026-11-06T15:00", invitation: { ref: "INV-1006", sentAt: "2026-11-06T15:00", status: "pending" } }),
  // Locked after failed sign-ins
  u("USR-1007", "Nikhil", "Bose", "nikhil.bose@evolve.example", "+91 98470 11007", "Support Engineer", "Support", { accountStatus: "locked", lastLoginAt: "2026-10-28T09:40", security: sec({ failedLogins: 5, lockHistory: [{ at: "2026-11-08T22:14", reason: "Five failed sign-in attempts" }] }) }),
  u("USR-2001", "Anita", "Krishnan", "anita.krishnan@vguard.example", "+91 94460 22001", "Head - Channel Loyalty", "Marketing", { employeeId: "VG-10421", lastLoginAt: "2026-11-09T11:30" }),
  // Edge: multiple roles with overlapping permissions
  u("USR-2002", "Suresh", "Nair", "suresh.nair@vguard.example", "+91 94460 22002", "Regional Manager - South", "Sales", { employeeId: "VG-10877" }),
  u("USR-2003", "Lakshmi", "Raman", "lakshmi.raman@vguard.example", "+91 94460 22003", "Finance Manager", "Finance", { employeeId: "VG-11002" }),
  u("USR-2004", "Joseph", "Mathew", "joseph.mathew@vguard.example", "+91 94460 22004", "Regional Manager - Karnataka", "Sales", { employeeId: "VG-11240" }),
  u("USR-2005", "Priya", "Shenoy", "priya.shenoy@vguard.example", "+91 94460 22005", "Branch Manager - Ernakulam", "Sales", { employeeId: "VG-12011", reportingManagerId: "USR-2002" }),
  u("USR-2006", "Vikram", "Rao", "vikram.rao@vguard.example", "+91 94460 22006", "Sales Representative", "Sales", { employeeId: "VG-12560", reportingManagerId: "USR-2002" }),
  // Edge: account active, only role assignment expired → no active role
  u("USR-2007", "Farhan", "Qureshi", "farhan.qureshi@vguard.example", "+91 94460 22007", "Branch PIC - Hyderabad", "Sales", { employeeId: "VG-12688", lastLoginAt: "2026-10-30T09:00" }),
  // Edge: active role, expired programme access (second assignment for EP expired)
  u("USR-2008", "Deepa", "Joshi", "deepa.joshi@vguard.example", "+91 94460 22008", "Regional Manager - West", "Sales", { employeeId: "VG-12702" }),
  // Edge: programme access but no geography
  u("USR-2009", "Rohit", "Kulkarni", "rohit.kulkarni@vguard.example", "+91 94460 22009", "Sales Representative", "Sales", { employeeId: "VG-12745", lastLoginAt: "2026-11-04T17:15" }),
  u("USR-2010", "Ganesh", "Iyer", "ganesh.iyer@vguard.example", "+91 94460 22010", "Sales Representative", "Sales", { employeeId: "VG-12801", accountStatus: "suspended", lastLoginAt: "2026-09-14T10:00" }),
  // Edge: deactivated user with a pending nomination
  u("USR-2011", "Divya", "Menon", "divya.menon@vguard.example", "+91 94460 22011", "Marketing Executive", "Marketing", { employeeId: "VG-12850", accountStatus: "deactivated", lastLoginAt: "2026-08-02T10:00" }),
  // Edge: temporary access that has passed its end date (expiry check marks it expired)
  u("USR-2012", "Harish", "Kumar", "harish.kumar@vguard.example", "+91 94460 22012", "Branch Manager - Coimbatore (acting)", "Sales", { employeeId: "VG-12903", lastLoginAt: "2026-11-05T19:05" }),
  u("USR-2013", "Neha", "Gupta", "neha.gupta@vguard.example", "+91 94460 22013", "Finance Analyst", "Finance", { accountStatus: "pending_activation", lastLoginAt: null, createdAt: "2026-11-03T12:00", invitation: { ref: "INV-2013", sentAt: "2026-11-03T12:00", status: "accepted" } }),
  u("USR-3001", "Imran", "Shaikh", "imran.shaikh@sampark.example", "+91 90000 33001", "Field Content Coordinator", "Field services", { lastLoginAt: "2026-11-08T13:00" }),
  // Edge: member of two organisations with independent roles
  u("USR-3002", "Pooja", "Reddy", "pooja.reddy@evolve.example", "+91 90000 33002", "Partner Success Manager", "Partnerships", { employeeId: "EVB-0049" }),
  // Edge: user of a deactivated organisation
  u("USR-3003", "Karan", "Malhotra", "karan.malhotra@legacy-audit.example", "+91 90000 33003", "Audit Associate", "Audit", { lastLoginAt: "2026-06-30T11:00" }),
];

const m = (id: string, userId: string, orgId: string, department: string, designation: string, since = "2025-05-12"): OrgMembership => ({ id, userId, orgId, department, businessUnit: null, designation, status: "active", since });

export const SEED_MEMBERSHIPS: OrgMembership[] = [
  m("MEM-1001", "USR-1001", ORG.EVOLVE, "Platform", "Head of Platform", "2025-04-01"),
  m("MEM-1002", "USR-1002", ORG.EVOLVE, "Platform", "Platform Administrator", "2025-04-01"),
  m("MEM-1003", "USR-1003", ORG.EVOLVE, "Operations", "Operations Lead"),
  m("MEM-1004", "USR-1004", ORG.EVOLVE, "Operations", "Operations Analyst"),
  m("MEM-1005", "USR-1005", ORG.EVOLVE, "Operations", "Content Specialist"),
  m("MEM-1006", "USR-1006", ORG.EVOLVE, "Operations", "Operations Analyst", "2026-11-06"),
  m("MEM-1007", "USR-1007", ORG.EVOLVE, "Support", "Support Engineer"),
  m("MEM-2001", "USR-2001", ORG.VGUARD, "Marketing", "Head - Channel Loyalty"),
  m("MEM-2002", "USR-2002", ORG.VGUARD, "Sales", "Regional Manager - South"),
  m("MEM-2003", "USR-2003", ORG.VGUARD, "Finance", "Finance Manager"),
  m("MEM-2004", "USR-2004", ORG.VGUARD, "Sales", "Regional Manager - Karnataka"),
  m("MEM-2005", "USR-2005", ORG.VGUARD, "Sales", "Branch Manager - Ernakulam"),
  m("MEM-2006", "USR-2006", ORG.VGUARD, "Sales", "Sales Representative"),
  m("MEM-2007", "USR-2007", ORG.VGUARD, "Sales", "Branch PIC - Hyderabad"),
  m("MEM-2008", "USR-2008", ORG.VGUARD, "Sales", "Regional Manager - West"),
  m("MEM-2009", "USR-2009", ORG.VGUARD, "Sales", "Sales Representative"),
  m("MEM-2010", "USR-2010", ORG.VGUARD, "Sales", "Sales Representative"),
  m("MEM-2011", "USR-2011", ORG.VGUARD, "Marketing", "Marketing Executive"),
  m("MEM-2012", "USR-2012", ORG.VGUARD, "Sales", "Branch Manager - Coimbatore (acting)"),
  m("MEM-2013", "USR-2013", ORG.VGUARD, "Finance", "Finance Analyst", "2026-11-03"),
  m("MEM-3001", "USR-3001", ORG.SAMPARK, "Field services", "Field Content Coordinator", "2026-02-12"),
  m("MEM-3002", "USR-3002", ORG.EVOLVE, "Partnerships", "Partner Success Manager"),
  m("MEM-3003", "USR-3002", ORG.SAMPARK, "Partner finance", "Finance liaison (secondment)", "2026-03-01"),
  m("MEM-3004", "USR-3003", ORG.LEGACY, "Audit", "Audit Associate", "2025-06-01"),
];

const ALL = { programmes: "all" as const, geography: { mode: "all" as const } };
const geo = (states: string[], districts: string[] = [], branches: string[] = []) => ({ mode: "selected" as const, states, districts, branches });

let refN = 4100;
const a = (id: string, userId: string, membershipId: string, roleId: string, scope: RoleAssignment["scope"], over: Partial<RoleAssignment> = {}): RoleAssignment => ({
  id,
  userId,
  membershipId,
  roleId,
  moduleLimit: null,
  scope,
  status: "active",
  validFrom: "2025-05-12",
  validTo: null,
  assignedBy: "USR-1001",
  assignedAt: "2025-05-12T10:00",
  reason: "Initial provisioning (mock seed)",
  source: "seed",
  accessRef: `ACC-${refN++}`,
  ...over,
});

export const SEED_ASSIGNMENTS: RoleAssignment[] = [
  a("ASG-0001", "USR-1001", "MEM-1001", ROLE.SUPER_ADMIN, ALL, { assignedBy: "SYSTEM", validFrom: "2025-04-01" }),
  a("ASG-0002", "USR-1002", "MEM-1002", ROLE.SUPER_ADMIN, ALL, { assignedBy: "SYSTEM", validFrom: "2025-04-01" }),
  a("ASG-0003", "USR-1003", "MEM-1003", ROLE.EVOLVE_OPS, ALL),
  a("ASG-0004", "USR-1003", "MEM-1003", ROLE.MAKER, ALL, { moduleLimit: ["schemes", "products", "categories", "scan-config", "scheme-budget", "scheme-settlement", "tiers", "referrals", "campaigns", "gamification", "communication", "comm-templates", "content", "comm-bot", "surveys", "banners", "gift-catalogue", "fulfilment-partners", "insurance", "integrations", "kpi-governance"], source: "nomination", nominationId: "NOM-0006", assignedAt: "2026-09-18T12:00", validFrom: "2026-09-18", reason: "Provisioned from nomination MAN-2026-0006" }),
  a("ASG-0005", "USR-1004", "MEM-1004", ROLE.EVOLVE_OPS, ALL),
  a("ASG-0006", "USR-1005", "MEM-1005", ROLE.EVOLVE_OPS, ALL),
  a("ASG-0007", "USR-1005", "MEM-1005", ROLE.MAKER, { programmes: ["EP", "ST"], geography: { mode: "all" } }, { moduleLimit: ["content", "communication"], status: "suspended", reason: "Suspended pending content-quality review" }),
  a("ASG-0008", "USR-1006", "MEM-1006", ROLE.EVOLVE_OPS, ALL, { status: "pending", assignedAt: "2026-11-06T15:00", validFrom: "2026-11-06", reason: "Awaiting invitation acceptance" }),
  a("ASG-0009", "USR-1007", "MEM-1007", ROLE.EVOLVE_OPS, ALL),
  a("ASG-0010", "USR-2001", "MEM-2001", ROLE.CLIENT_ADMIN, ALL),
  a("ASG-0011", "USR-2002", "MEM-2002", ROLE.REGIONAL_ADMIN, { programmes: "all", geography: geo(["KL", "TN"]) }),
  a("ASG-0012", "USR-2002", "MEM-2002", ROLE.FINANCE, { programmes: ["EP", "Retailer"], geography: geo(["KL", "TN"]) }, { assignedBy: "USR-2001", assignedAt: "2026-04-02T10:00", validFrom: "2026-04-02" }),
  a("ASG-0013", "USR-2003", "MEM-2003", ROLE.FINANCE, ALL, { assignedBy: "USR-2001" }),
  a("ASG-0014", "USR-2003", "MEM-2003", ROLE.CHECKER, ALL, { moduleLimit: ["wallet", "redemption", "financial", "scheme-budget", "scheme-settlement", "points-adjustment", "points-reversal", "points-transfer", "tds", "gift-redemption", "redemption-limits", "vouchers"], assignedAt: "2026-05-02T10:00", validFrom: "2026-05-02", reason: "Finance approvals for points and payouts" }),
  a("ASG-0015", "USR-2004", "MEM-2004", ROLE.REGIONAL_ADMIN, { programmes: "all", geography: geo(["KA"]) }),
  a("ASG-0016", "USR-2004", "MEM-2004", ROLE.CHECKER, { programmes: ["EP"], geography: geo(["KA"]) }, { moduleLimit: ["schemes"], assignedAt: "2026-07-01T10:00", validFrom: "2026-07-01", reason: "Regional scheme approvals for EP" }),
  a("ASG-0017", "USR-2005", "MEM-2005", ROLE.BRANCH_MANAGER, { programmes: ["EP", "Retailer"], geography: geo([], [], ["KL-BR-KOCHI", "KL-BR-ALUVA"]) }, { assignedBy: "USR-2001" }),
  a("ASG-0018", "USR-2006", "MEM-2006", ROLE.SALES_REP, { programmes: ["EP"], geography: geo([], [], ["TN-BR-CHENNAI-NORTH"]) }, { assignedBy: "USR-2001" }),
  a("ASG-0019", "USR-2007", "MEM-2007", ROLE.BRANCH_MANAGER, { programmes: ["EP", "CS"], geography: geo([], [], ["TS-BR-HYDERABAD-CENTRAL"]) }, { status: "expired", validTo: "2026-10-31", reason: "Fixed-term assignment" }),
  a("ASG-0020", "USR-2008", "MEM-2008", ROLE.REGIONAL_ADMIN, { programmes: ["ST"], geography: geo(["MH"]) }),
  a("ASG-0021", "USR-2008", "MEM-2008", ROLE.REGIONAL_ADMIN, { programmes: ["EP"], geography: geo(["MH"]) }, { status: "expired", validFrom: "2026-06-01", validTo: "2026-09-30", reason: "Temporary EP cover during vacancy" }),
  a("ASG-0022", "USR-2009", "MEM-2009", ROLE.SALES_REP, { programmes: ["Retailer"], geography: geo([], [], []) }, { assignedBy: "USR-2001", reason: "Geography to be confirmed by regional office" }),
  a("ASG-0023", "USR-2010", "MEM-2010", ROLE.SALES_REP, { programmes: ["EP"], geography: geo([], [], ["KA-BR-MYSURU"]) }),
  a("ASG-0024", "USR-2011", "MEM-2011", ROLE.REGIONAL_ADMIN, { programmes: ["EP"], geography: geo(["KL"]) }, { status: "revoked", reason: "Employee exited" }),
  a("ASG-0025", "USR-2012", "MEM-2012", ROLE.BRANCH_MANAGER, { programmes: ["EP", "ST"], geography: geo([], [], ["TN-BR-COIMBATORE"]) }, { validFrom: "2026-10-01", validTo: "2026-11-05", reason: "Acting cover while the branch manager is on leave" }),
  a("ASG-0026", "USR-2013", "MEM-2013", ROLE.FINANCE, ALL, { status: "pending", assignedBy: "USR-2001", assignedAt: "2026-11-03T12:00", validFrom: "2026-11-03", reason: "Starts after account activation" }),
  a("ASG-0027", "USR-3001", "MEM-3001", ROLE.MAKER, { programmes: ["ST", "CS"], geography: { mode: "all" } }, { moduleLimit: ["content", "communication"], assignedAt: "2026-02-12T10:00", validFrom: "2026-02-12", reason: "Partner content operations" }),
  a("ASG-0028", "USR-3002", "MEM-3002", ROLE.EVOLVE_OPS, { programmes: ["Retailer", "DD"], geography: { mode: "all" } }),
  a("ASG-0029", "USR-3002", "MEM-3003", ROLE.FINANCE, { programmes: ["DD"], geography: { mode: "all" } }, { assignedAt: "2026-03-01T10:00", validFrom: "2026-03-01", reason: "Secondment to partner finance" }),
  a("ASG-0030", "USR-3003", "MEM-3004", ROLE.FINANCE, ALL, { validFrom: "2025-06-01" }),
  // Phase 3 approval scenarios. Rahul is deliberately both Maker and Checker on Product & SKU master (separation-of-duties test).
  a("ASG-0031", "USR-1003", "MEM-1003", ROLE.CHECKER, ALL, { moduleLimit: ["products"], assignedAt: "2026-08-01T10:00", validFrom: "2026-08-01", reason: "SKU change reviews for other operators" }),
  a("ASG-0032", "USR-1004", "MEM-1004", ROLE.MAKER, ALL, { moduleLimit: ["wallet", "redemption", "fraud-rules", "members", "financial", "points-adjustment", "points-reversal", "points-transfer", "tds", "gst-gate", "gift-redemption", "redemption-limits", "vouchers", "devices"], assignedAt: "2026-06-01T10:00", validFrom: "2026-06-01", reason: "Evolve operations raises points, redemption and member requests on V-Guard's behalf" }),
  a("ASG-0033", "USR-1004", "MEM-1004", ROLE.CHECKER, ALL, { moduleLimit: ["products", "registration-kyc"], assignedAt: "2026-06-01T10:00", validFrom: "2026-06-01", reason: "Evolve verification reviews" }),
  a("ASG-0034", "USR-2001", "MEM-2001", ROLE.CHECKER, ALL, { moduleLimit: ["wallet", "members", "schemes", "communication", "content", "scan-config", "scheme-budget", "scheme-settlement", "tiers", "referrals", "campaigns", "gamification", "points-adjustment", "points-reversal", "points-transfer", "gst-gate", "redemption-limits", "comm-templates", "comm-bot", "surveys", "gift-catalogue", "insurance", "fraud-rules", "devices", "integrations", "kpi-governance"], assignedAt: "2026-06-01T10:00", validFrom: "2026-06-01", reason: "V-Guard governance approvals" }),
  // Phase 4: regional Maker for scanning configuration in Karnataka only (geographical-scope test).
  a("ASG-0036", "USR-2004", "MEM-2004", ROLE.MAKER, { programmes: "all", geography: geo(["KA"]) }, { moduleLimit: ["scan-config"], assignedAt: "2026-10-01T10:00", validFrom: "2026-10-01", reason: "Regional scan-point configuration for Karnataka" }),
  // Phase 5: Branch PIC Stage-1 registration approvals for the Kochi and Aluva branches.
  a("ASG-0037", "USR-2005", "MEM-2005", ROLE.CHECKER, { programmes: ["EP"], geography: geo([], [], ["KL-BR-KOCHI", "KL-BR-ALUVA"]) }, { moduleLimit: ["registration-kyc"], assignedBy: "USR-2001", assignedAt: "2026-07-01T10:00", validFrom: "2026-07-01", reason: "SR/PIC Stage-1 approval of EP self-registrations" }),
  a("ASG-0035", "USR-2002", "MEM-2002", ROLE.CHECKER, { programmes: "all", geography: geo(["KL", "TN"]) }, { moduleLimit: ["registration-kyc", "members"], assignedAt: "2026-06-01T10:00", validFrom: "2026-06-01", reason: "Regional business review for Kerala and Tamil Nadu" }),
];

export const SEED_DIRECT_GRANTS: DirectGrant[] = [
  // Phase 8: named HO Admin banner publisher (SOW 10.8 AF06). The Client Admin role alone does not publish.
  { id: "DG-0004", userId: "USR-1003", membershipId: "MEM-1003", permissions: [key("insurance", "view_sensitive"), key("insurance", "download")], scope: { programmes: ["EP", "ST", "CS"], geography: { mode: "all" } }, status: "active", validFrom: "2026-10-15", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-10-15T10:00", reason: "Named insurance desk operator: card preview and test download", accessRef: "ACC-4402" },
  { id: "DG-0005", userId: "USR-1004", membershipId: "MEM-1004", permissions: [key("vouchers", "view_sensitive")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-10-15", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-10-15T10:00", reason: "Voucher code viewing for recovery support", accessRef: "ACC-4403" },
  { id: "DG-0007", userId: "USR-1003", membershipId: "MEM-1003", permissions: [key("integrations", "view_sensitive"), key("health", "view_sensitive"), key("member-diagnostics", "view_sensitive"), key("auth-audit", "view_sensitive")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-11-01", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-11-01T10:00", reason: "Named technical support lead: personal payload metadata, stack traces, member diagnostics and authentication detail", accessRef: "ACC-4405" },
  { id: "DG-0008", userId: "USR-2003", membershipId: "MEM-2003", permissions: [key("finance-reports", "view_sensitive")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-11-01", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-11-01T10:00", reason: "Named finance compliance user: PAN reference in the TDS monthly liability report and its export", accessRef: "ACC-4406" },
  { id: "DG-0009", userId: "USR-1003", membershipId: "MEM-1003", permissions: [key("scan-reports", "view_sensitive"), key("member-analytics", "view_sensitive")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-11-01", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-11-01T10:00", reason: "Scan dispute investigation: precise scan location and salesperson field", accessRef: "ACC-4407" },
  { id: "DG-0006", userId: "USR-1004", membershipId: "MEM-1004", permissions: [key("fraud-rules", "view_sensitive"), key("devices", "view_sensitive")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-11-01", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-11-01T10:00", reason: "Fraud investigation desk: sensitive evidence and device login locations", accessRef: "ACC-4404" },
  { id: "DG-0003", userId: "USR-2001", membershipId: "MEM-2001", permissions: [key("banners", "publish")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-10-01", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-10-01T10:00", reason: "Named HO Admin publisher for banners and home scrollers", accessRef: "ACC-4401" },
  // Phase 5: Evolve KYC reviewer may see and download KYC evidence, and raise verified-data overrides.
  { id: "DG-0002", userId: "USR-1004", membershipId: "MEM-1004", permissions: [key("registration-kyc", "view_sensitive"), key("registration-kyc", "download"), key("members", "view_sensitive"), key("members", "override")], scope: { programmes: "all", geography: { mode: "all" } }, status: "active", validFrom: "2026-06-01", validTo: null, assignedBy: "USR-1001", assignedAt: "2026-06-01T10:00", reason: "Evolve KYC verification desk", accessRef: "ACC-4302" },
  { id: "DG-0001", userId: "USR-1004", membershipId: "MEM-1004", permissions: [key("reports", "execute")], scope: { programmes: ["EP", "ST"], geography: { mode: "all" } }, status: "active", validFrom: "2026-10-15", validTo: "2026-12-31", assignedBy: "USR-1001", assignedAt: "2026-10-15T10:00", reason: "Quarter-end report runs", accessRef: "ACC-4301" },
];

const nomScope = (programmes: RoleAssignment["scope"]["programmes"], states: string[]) => ({ programmes, geography: states.length ? geo(states) : ({ mode: "all" } as const) });

export const SEED_NOMINATIONS: MakerNomination[] = [
  { id: "NOM-0001", ref: "MAN-2026-0001", candidate: { name: "Asha Thomas", email: "asha.thomas@vguard.example", mobile: "+91 94460 22101", orgId: ORG.VGUARD, designation: "Scheme Executive", department: "Marketing", existingUserId: null }, profile: "maker", modules: ["schemes", "products"], scope: nomScope(["EP", "Retailer"], ["KL"]), startDate: "2026-11-15", endDate: null, justification: "Will prepare Kerala scheme drafts for the Q4 retailer push", nominatedBy: "USR-2001", submittedAt: "2026-11-08T11:05", status: "submitted", review: null, provisioned: null, history: [{ at: "2026-11-08T11:05", by: "USR-2001", status: "submitted", remarks: "" }] },
  { id: "NOM-0002", ref: "MAN-2026-0002", candidate: { name: "Priya Shenoy", email: "priya.shenoy@vguard.example", mobile: "+91 94460 22005", orgId: ORG.VGUARD, designation: "Branch Manager - Ernakulam", department: "Sales", existingUserId: "USR-2005" }, profile: "maker", modules: ["members", "registration-kyc"], scope: { programmes: ["EP", "Retailer"], geography: geo([], [], ["KL-BR-KOCHI", "KL-BR-ALUVA"]) }, startDate: "2026-11-12", endDate: "2027-03-31", justification: "Branch to correct member records directly instead of raising tickets", nominatedBy: "USR-2001", submittedAt: "2026-11-05T15:30", status: "under_review", review: null, provisioned: null, history: [{ at: "2026-11-05T15:30", by: "USR-2001", status: "submitted", remarks: "" }, { at: "2026-11-06T10:00", by: "USR-1002", status: "under_review", remarks: "Checking branch scope" }] },
  { id: "NOM-0003", ref: "MAN-2026-0003", candidate: { name: "Ritu Sharma", email: "ritu.sharma@evolve.example", mobile: "+91 98470 11040", orgId: ORG.EVOLVE, designation: "Campaign Analyst", department: "Operations", existingUserId: null }, profile: "maker", modules: ["campaigns", "communication"], scope: nomScope("all", []), startDate: "2026-11-10", endDate: null, justification: "Evolve analyst to build V-Guard festive campaigns on V-Guard's request", nominatedBy: "USR-2001", submittedAt: "2026-10-30T10:00", status: "approved", review: { by: "USR-1002", at: "2026-11-04T17:00", decision: "approved", remarks: "Approved for all programmes; campaigns only" }, provisioned: null, history: [{ at: "2026-10-30T10:00", by: "USR-2001", status: "submitted", remarks: "" }, { at: "2026-11-04T17:00", by: "USR-1002", status: "approved", remarks: "Approved for all programmes; campaigns only" }] },
  { id: "NOM-0004", ref: "MAN-2026-0004", candidate: { name: "Vikram Rao", email: "vikram.rao@vguard.example", mobile: "+91 94460 22006", orgId: ORG.VGUARD, designation: "Sales Representative", department: "Sales", existingUserId: "USR-2006" }, profile: "maker", modules: ["wallet", "financial"], scope: nomScope("all", []), startDate: "2026-10-20", endDate: null, justification: "Wants to adjust points for his dealers", nominatedBy: "USR-2001", submittedAt: "2026-10-15T09:30", status: "rejected", review: { by: "USR-1001", at: "2026-10-16T12:00", decision: "rejected", remarks: "Financial configuration is outside a sales role; raise point adjustments through Finance" }, provisioned: null, history: [{ at: "2026-10-15T09:30", by: "USR-2001", status: "submitted", remarks: "" }, { at: "2026-10-16T12:00", by: "USR-1001", status: "rejected", remarks: "Financial configuration is outside a sales role; raise point adjustments through Finance" }] },
  { id: "NOM-0005", ref: "MAN-2026-0005", candidate: { name: "Imran Shaikh", email: "imran.shaikh@sampark.example", mobile: "+91 90000 33001", orgId: ORG.SAMPARK, designation: "Field Content Coordinator", department: "Field services", existingUserId: "USR-3001" }, profile: "maker", modules: ["schemes"], scope: nomScope(["ST"], []), startDate: "2026-11-20", endDate: "2027-01-31", justification: "Partner to draft ST service schemes", nominatedBy: "USR-2001", submittedAt: "2026-11-01T14:00", status: "returned", review: { by: "USR-1002", at: "2026-11-03T11:00", decision: "returned", remarks: "Please confirm geography: should the partner see all states?" }, provisioned: null, history: [{ at: "2026-11-01T14:00", by: "USR-2001", status: "submitted", remarks: "" }, { at: "2026-11-03T11:00", by: "USR-1002", status: "returned", remarks: "Please confirm geography: should the partner see all states?" }] },
  { id: "NOM-0006", ref: "MAN-2026-0006", candidate: { name: "Rahul Menon", email: "rahul.menon@evolve.example", mobile: "+91 98470 11003", orgId: ORG.EVOLVE, designation: "Operations Lead", department: "Operations", existingUserId: "USR-1003" }, profile: "maker", modules: ["schemes", "products"], scope: nomScope("all", []), startDate: "2026-09-18", endDate: null, justification: "Evolve operations to configure schemes and SKUs on V-Guard's behalf", nominatedBy: "USR-2001", submittedAt: "2026-09-10T10:00", status: "provisioned", review: { by: "USR-1001", at: "2026-09-17T16:00", decision: "approved", remarks: "Approved" }, provisioned: { userId: "USR-1003", assignmentId: "ASG-0004", accessRef: "ACC-4103", at: "2026-09-18T12:00" }, history: [{ at: "2026-09-10T10:00", by: "USR-2001", status: "submitted", remarks: "" }, { at: "2026-09-17T16:00", by: "USR-1001", status: "approved", remarks: "Approved" }, { at: "2026-09-18T12:00", by: "USR-1001", status: "provisioned", remarks: "Linked to existing user" }] },
  { id: "NOM-0007", ref: "MAN-2026-0007", candidate: { name: "Sunil Varma", email: "sunil.varma@vguard.example", mobile: "+91 94460 22120", orgId: ORG.VGUARD, designation: "Product Executive", department: "Product", existingUserId: null }, profile: "maker", modules: ["products", "categories"], scope: nomScope("all", []), startDate: "2026-12-01", endDate: null, justification: "", nominatedBy: "USR-2001", submittedAt: null, status: "draft", review: null, provisioned: null, history: [] },
  { id: "NOM-0008", ref: "MAN-2026-0008", candidate: { name: "Divya Menon", email: "divya.menon@vguard.example", mobile: "+91 94460 22011", orgId: ORG.VGUARD, designation: "Marketing Executive", department: "Marketing", existingUserId: "USR-2011" }, profile: "maker", modules: ["content"], scope: nomScope(["EP"], ["KL"]), startDate: "2026-08-01", endDate: null, justification: "Testimonials for Kerala EP", nominatedBy: "USR-2001", submittedAt: "2026-07-25T10:00", status: "submitted", review: null, provisioned: null, history: [{ at: "2026-07-25T10:00", by: "USR-2001", status: "submitted", remarks: "" }] },
];

let auditN = 900;
const ev = (at: string, actorUserId: string, actorOrgId: string | null, action: AuditEvent["action"], targetType: AuditEvent["targetType"], targetId: string, targetLabel: string, previous: string | null, next: string | null, reason = "", status: AuditEvent["status"] = "success"): AuditEvent => ({
  id: `AUD-${String(auditN++).padStart(6, "0")}`,
  at,
  actorUserId,
  actorOrgId,
  targetType,
  targetId,
  targetLabel,
  action,
  module: "users",
  previous,
  next,
  reason,
  ref: `REF-${auditN + 7000}`,
  status,
});

export const SEED_AUDIT: AuditEvent[] = [
  ev("2025-04-01T09:00", "SYSTEM", null, "role.assigned", "user", "USR-1001", "Tanujit Roy", null, "Evolve Super Admin · all programmes · all geography", "Platform bootstrap"),
  ev("2025-04-01T09:05", "SYSTEM", null, "role.assigned", "user", "USR-1002", "Meera Pillai", null, "Evolve Super Admin · all programmes · all geography", "Platform bootstrap"),
  ev("2025-05-12T10:00", "USR-1001", ORG.EVOLVE, "user.created", "user", "USR-2001", "Anita Krishnan", null, "Invited · V-Guard", "V-Guard HO admin onboarding"),
  ev("2025-05-12T10:01", "USR-1001", ORG.EVOLVE, "role.assigned", "user", "USR-2001", "Anita Krishnan", null, "V-Guard Client Admin", "Maps legacy SOW role HO Admin"),
  ev("2026-02-10T11:00", "USR-1001", ORG.EVOLVE, "organisation.created", "organisation", ORG.SAMPARK, "Sampark Field Services (demo)", null, "Active · External partner", "Partner content operations"),
  ev("2026-04-02T10:00", "USR-2001", ORG.VGUARD, "role.assigned", "user", "USR-2002", "Suresh Nair", null, "Finance · EP, Retailer · KL, TN", "Covers regional finance reviews"),
  ev("2026-05-02T10:00", "USR-1001", ORG.EVOLVE, "checker.assigned", "user", "USR-2003", "Lakshmi Raman", null, "Checker · Wallet & points, Redemption & fulfilment, Financial configuration", "Finance approvals for points and payouts"),
  ev("2026-07-01T10:00", "USR-1001", ORG.EVOLVE, "checker.assigned", "user", "USR-2004", "Joseph Mathew", null, "Checker · Scheme builder · EP · KA", "Regional scheme approvals for EP"),
  ev("2026-09-10T10:00", "USR-2001", ORG.VGUARD, "maker.nominated", "nomination", "NOM-0006", "MAN-2026-0006 · Rahul Menon", null, "Submitted", "Evolve operations to configure schemes and SKUs"),
  ev("2026-09-17T16:00", "USR-1001", ORG.EVOLVE, "maker.nomination_approved", "nomination", "NOM-0006", "MAN-2026-0006 · Rahul Menon", "Submitted", "Approved", "Approved"),
  ev("2026-09-18T12:00", "USR-1001", ORG.EVOLVE, "maker.provisioned", "user", "USR-1003", "Rahul Menon", null, "Maker · Scheme builder, Product & SKU master · ACC-4103", "Provisioned from MAN-2026-0006"),
  ev("2026-09-14T10:05", "USR-1001", ORG.EVOLVE, "user.suspended", "user", "USR-2010", "Ganesh Iyer", "Active", "Suspended", "Under HR investigation"),
  ev("2026-08-02T10:10", "USR-1002", ORG.EVOLVE, "user.deactivated", "user", "USR-2011", "Divya Menon", "Active", "Deactivated", "Employee exited"),
  ev("2026-08-02T10:11", "USR-1002", ORG.EVOLVE, "role.removed", "user", "USR-2011", "Divya Menon", "Regional Admin · EP · KL", "Revoked", "Employee exited"),
  ev("2026-09-30T23:59", "SYSTEM", null, "role.expired", "user", "USR-2008", "Deepa Joshi", "Regional Admin · EP · MH (active)", "Expired", "End date reached"),
  ev("2026-10-16T12:00", "USR-1001", ORG.EVOLVE, "maker.nomination_rejected", "nomination", "NOM-0004", "MAN-2026-0004 · Vikram Rao", "Submitted", "Rejected", "Financial configuration is outside a sales role"),
  ev("2026-10-15T10:00", "USR-1001", ORG.EVOLVE, "permission.added", "user", "USR-1004", "Sneha Das", null, "Reports & analytics: Execute · EP, ST · until 31 Dec 2026", "Quarter-end report runs"),
  ev("2026-10-31T23:59", "SYSTEM", null, "role.expired", "user", "USR-2007", "Farhan Qureshi", "Branch Manager/PIC (active)", "Expired", "End date reached"),
  ev("2026-11-03T11:00", "USR-1002", ORG.EVOLVE, "maker.nomination_returned", "nomination", "NOM-0005", "MAN-2026-0005 · Imran Shaikh", "Submitted", "Returned", "Please confirm geography"),
  ev("2026-11-04T17:00", "USR-1002", ORG.EVOLVE, "maker.nomination_approved", "nomination", "NOM-0003", "MAN-2026-0003 · Ritu Sharma", "Submitted", "Approved", "Approved for all programmes; campaigns only"),
  ev("2026-11-05T15:30", "USR-2001", ORG.VGUARD, "maker.nominated", "nomination", "NOM-0002", "MAN-2026-0002 · Priya Shenoy", null, "Submitted", "Branch to correct member records"),
  ev("2026-11-06T15:00", "USR-1001", ORG.EVOLVE, "user.invited", "user", "USR-1006", "Kavya Iyer", null, "Invited · INV-1006", "New operations analyst"),
  ev("2026-11-07T09:30", "USR-2001", ORG.VGUARD, "access.denied", "user", "USR-2001", "Anita Krishnan", null, "Attempted to assign Evolve Super Admin", "Blocked: platform role can only be assigned by an Evolve Super Admin", "blocked"),
  ev("2026-11-08T11:05", "USR-2001", ORG.VGUARD, "maker.nominated", "nomination", "NOM-0001", "MAN-2026-0001 · Asha Thomas", null, "Submitted", "Q4 retailer push"),
  ev("2026-11-08T22:14", "SYSTEM", null, "user.updated", "user", "USR-1007", "Nikhil Bose", "Active", "Locked", "Five failed sign-in attempts"),
];
