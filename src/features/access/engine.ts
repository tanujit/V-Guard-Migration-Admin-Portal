/**
 * ACCESS CONTROL ENGINE — pure functions over an access snapshot.
 *
 * Precedence policy (documented in docs/ACCESS-CONTROL.md):
 *  1. Deny by default. Nothing is allowed unless an effective grant allows it.
 *  2. A grant is effective only if the account is active, the membership and organisation are
 *     active, the role is active, the assignment status is active and today is within its dates.
 *  3. Permissions are the union of effective grants, but every grant keeps its own scope. A View
 *     from one role and an Edit from another never combine into Edit outside the Edit grant's scope.
 *  4. There are no explicit "deny" rules; restrictions come from scope, status and validity.
 *  5. Delegation: an administrator can only grant a permission they hold themselves, within the
 *     scope they hold it, and only if they hold "User & role management: Assign access".
 *  6. Protected/platform roles, Maker/Checker provisioning and Evolve Super Admin have explicit,
 *     additional restrictions. Nobody can change their own access.
 * The same policy must be enforced by backend APIs; this module is the frontend reference.
 */
import { ASSIGN_ACCESS_KEY, key, moduleById, parseKey, PLATFORM_ADMIN_KEY } from "@/config/rbacCatalogue";
import { findBranch, findDistrict, GEOGRAPHY } from "@/config/geography";
import { PROGRAMMES } from "@/config/programmes";
import { ROLE } from "@/data/mock/rbacSeed";
import { DEMO_AS_OF } from "@/data/mock/time";
import type { AccessScope, ActionId, DirectGrant, GeographyScope, MakerNomination, ModuleId, Organisation, OrgMembership, PermissionKey, Role, RoleAssignment, User, AuditEvent } from "@/types/rbac";

export const TODAY = DEMO_AS_OF;

export interface AccessState {
  users: User[];
  organisations: Organisation[];
  memberships: OrgMembership[];
  roles: Role[];
  assignments: RoleAssignment[];
  directGrants: DirectGrant[];
  nominations: MakerNomination[];
  audit: AuditEvent[];
}

export type SourceKind = "role" | "profile" | "direct";

export interface AccessSource {
  kind: SourceKind;
  id: string;
  title: string;
  roleId: string | null;
  orgId: string | null;
  scope: AccessScope;
  keys: PermissionKey[];
  effective: boolean;
  /** Why the source is not effective (or a caution when it is). */
  note: string | null;
  status: RoleAssignment["status"];
  validFrom: string;
  validTo: string | null;
}

export interface Grant {
  key: PermissionKey;
  source: AccessSource;
}

export interface EffectiveAccess {
  user: User | undefined;
  accountActive: boolean;
  sources: AccessSource[];
  grants: Map<PermissionKey, Grant[]>;
  warnings: string[];
}

export interface Decision {
  allowed: boolean;
  reason: string;
  via?: AccessSource;
}

export interface PolicyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const ok = (warnings: string[] = []): PolicyResult => ({ ok: true, errors: [], warnings });
const result = (errors: string[], warnings: string[] = []): PolicyResult => ({ ok: errors.length === 0, errors, warnings });

/* ---------------- Lookups ---------------- */

export const fullName = (u?: Pick<User, "firstName" | "lastName"> | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "Unknown user");

export function userName(s: AccessState, id: string) {
  if (id === "SYSTEM") return "System";
  return fullName(s.users.find((u) => u.id === id));
}

export const roleById = (s: AccessState, id: string) => s.roles.find((r) => r.id === id);
export const orgById = (s: AccessState, id: string) => s.organisations.find((o) => o.id === id);
export const membershipsOf = (s: AccessState, userId: string) => s.memberships.filter((m) => m.userId === userId);
export const assignmentsOf = (s: AccessState, userId: string) => s.assignments.filter((a) => a.userId === userId);

/** Primary organisation: the earliest active membership. */
export function primaryOrg(s: AccessState, userId: string): Organisation | undefined {
  const ms = membershipsOf(s, userId).sort((a, b) => (a.status === b.status ? a.since.localeCompare(b.since) : a.status === "active" ? -1 : 1));
  return ms[0] ? orgById(s, ms[0].orgId) : undefined;
}

/* ---------------- Scope helpers ---------------- */

export function programmesOf(scope: AccessScope): string[] {
  return scope.programmes === "all" ? PROGRAMMES.map((p) => p.code) : scope.programmes;
}

export function geographyIsEmpty(g: GeographyScope) {
  return g.mode === "selected" && !g.states.length && !g.districts.length && !g.branches.length;
}

/** Does a geography scope cover a record located at the given place? */
export function geoCovers(g: GeographyScope, at: { state?: string; district?: string; branch?: string }): boolean {
  if (g.mode === "all") return true;
  if (at.branch) {
    const hit = findBranch(at.branch);
    if (!hit) return false;
    return g.branches.includes(at.branch) || g.districts.includes(hit.district.code) || g.states.includes(hit.state.code);
  }
  if (at.district) {
    const hit = findDistrict(at.district);
    if (!hit) return false;
    return g.districts.includes(at.district) || g.states.includes(hit.state.code);
  }
  if (at.state) return g.states.includes(at.state);
  return true;
}

/** Is `inner` entirely inside `outer`? Used for delegation ceilings. */
export function scopeWithin(inner: AccessScope, outer: AccessScope): boolean {
  if (outer.programmes !== "all") {
    if (inner.programmes === "all") return false;
    if (!inner.programmes.every((p) => (outer.programmes as string[]).includes(p))) return false;
  }
  if (outer.geography.mode === "all") return true;
  if (inner.geography.mode === "all") return false;
  const og = outer.geography;
  const ig = inner.geography;
  return ig.states.every((st) => og.states.includes(st)) && ig.districts.every((d) => geoCovers(og, { district: d })) && ig.branches.every((b) => geoCovers(og, { branch: b }));
}

export function describeScope(scope: AccessScope): { programmes: string; geography: string } {
  const programmes = scope.programmes === "all" ? "All programmes" : scope.programmes.length ? scope.programmes.join(", ") : "No programmes";
  let geography = "All geography";
  if (scope.geography.mode === "selected") {
    const g = scope.geography;
    const parts = [
      g.states.length ? `${g.states.length} state${g.states.length > 1 ? "s" : ""} (${g.states.map((c) => GEOGRAPHY.find((s) => s.code === c)?.name ?? c).join(", ")})` : "",
      g.districts.length ? `${g.districts.length} district${g.districts.length > 1 ? "s" : ""} (${g.districts.map((c) => findDistrict(c)?.district.name ?? c).join(", ")})` : "",
      g.branches.length ? `${g.branches.length} branch${g.branches.length > 1 ? "es" : ""} (${g.branches.map((c) => findBranch(c)?.branch.name ?? c).join(", ")})` : "",
    ].filter(Boolean);
    geography = parts.length ? parts.join(" · ") : "No geography assigned";
  }
  return { programmes, geography };
}

/** Broadest geography level used in a scope: "all" > "state" > "district" > "branch". */
function geoLevel(g: GeographyScope): "all" | "state" | "district" | "branch" | "none" {
  if (g.mode === "all") return "all";
  if (g.states.length) return "state";
  if (g.districts.length) return "district";
  if (g.branches.length) return "branch";
  return "none";
}
const LEVEL_RANK = { none: 0, branch: 1, district: 2, state: 3, all: 4 } as const;

/* ---------------- Effective access ---------------- */

/**
 * Keys a role confers, limited to `moduleLimit` for operational profiles. The Approval Centre itself
 * is always kept: a Maker or Checker for any module needs it to submit, track or decide requests.
 * What they can see or decide inside it is still checked per request module and scope.
 */
function roleKeys(role: Role, moduleLimit: ModuleId[] | null): PermissionKey[] {
  return role.permissions.filter((k) => {
    const { module, action } = parseKey(k);
    return moduleById.get(module)?.actions.includes(action) && (!moduleLimit || moduleLimit.includes(module) || module === "approvals");
  });
}

function sourceStatus(s: AccessState, user: User | undefined, membershipId: string, status: RoleAssignment["status"], validFrom: string, validTo: string | null, role?: Role): { effective: boolean; note: string | null } {
  if (!user) return { effective: false, note: "User not found" };
  if (user.accountStatus !== "active") return { effective: false, note: `Account is ${user.accountStatus.replace("_", " ")}` };
  const mem = s.memberships.find((m) => m.id === membershipId);
  if (!mem || mem.status !== "active") return { effective: false, note: "Organisation membership is inactive" };
  const org = orgById(s, mem.orgId);
  if (!org || org.status !== "active") return { effective: false, note: `${org?.name ?? "Organisation"} is deactivated` };
  if (role && role.status !== "active") return { effective: false, note: `Role ${role.name} is inactive` };
  if (status !== "active") return { effective: false, note: `Assignment is ${status}` };
  if (validFrom > TODAY) return { effective: false, note: `Starts on ${validFrom}` };
  if (validTo && validTo < TODAY) return { effective: false, note: `Ended on ${validTo} (expiry check will mark it expired)` };
  return { effective: true, note: null };
}

export function getEffectiveAccess(s: AccessState, userId: string): EffectiveAccess {
  const user = s.users.find((u) => u.id === userId);
  const sources: AccessSource[] = [];

  for (const a of assignmentsOf(s, userId)) {
    const role = roleById(s, a.roleId);
    if (!role) continue;
    const st = sourceStatus(s, user, a.membershipId, a.status, a.validFrom, a.validTo, role);
    const mem = s.memberships.find((m) => m.id === a.membershipId);
    let note = st.note;
    if (st.effective && geographyIsEmpty(a.scope.geography)) note = "No geography assigned: no location-bound records are visible";
    sources.push({
      kind: role.category === "operational" ? "profile" : "role",
      id: a.id,
      title: role.category === "operational" && a.moduleLimit ? `${role.name} · ${a.moduleLimit.map((mm) => moduleById.get(mm)?.label ?? mm).join(", ")}` : role.name,
      roleId: role.id,
      orgId: mem?.orgId ?? null,
      scope: a.scope,
      keys: roleKeys(role, a.moduleLimit),
      effective: st.effective,
      note,
      status: a.status,
      validFrom: a.validFrom,
      validTo: a.validTo,
    });
  }
  for (const d of s.directGrants.filter((g) => g.userId === userId)) {
    const st = sourceStatus(s, user, d.membershipId, d.status, d.validFrom, d.validTo);
    const mem = s.memberships.find((m) => m.id === d.membershipId);
    sources.push({ kind: "direct", id: d.id, title: "Direct grant", roleId: null, orgId: mem?.orgId ?? null, scope: d.scope, keys: d.permissions, effective: st.effective, note: st.note, status: d.status, validFrom: d.validFrom, validTo: d.validTo });
  }

  const grants = new Map<PermissionKey, Grant[]>();
  for (const src of sources.filter((x) => x.effective)) {
    for (const k of src.keys) {
      const list = grants.get(k) ?? [];
      list.push({ key: k, source: src });
      grants.set(k, list);
    }
  }

  const warnings: string[] = [];
  const accountActive = user?.accountStatus === "active";
  if (user && !accountActive) warnings.push(`Account is ${user.accountStatus.replace("_", " ")}: no access is effective`);
  if (accountActive && !sources.some((x) => x.effective && x.kind === "role")) warnings.push("No active business or platform role");
  if (sources.some((x) => !x.effective && x.status === "expired")) warnings.push("Some access has expired");
  if (sources.some((x) => x.effective && geographyIsEmpty(x.scope.geography))) warnings.push("An active assignment has no geography");
  if (sources.some((x) => x.kind === "profile" && x.status === "suspended")) warnings.push("An operational profile is suspended");
  const orgs = new Set(membershipsOf(s, userId).map((m) => m.orgId));
  if (orgs.size > 1) warnings.push(`Member of ${orgs.size} organisations; each assignment applies within its own organisation`);

  return { user, accountActive, sources, grants, warnings };
}

/**
 * Can the user perform `action` on `module`, optionally for a record in a programme/location?
 * Returns the deciding source, or the reason access is denied.
 */
/**
 * Session guards run inside the permission check itself, so every module's service layer is covered.
 * View-As (SOW 10.7) registers one: while a staff member has an active read-only session, only View
 * is allowed for them. A guard returns a refusal reason, or null to continue with the normal check.
 */
type SessionGuard = (userId: string, module: ModuleId, action: ActionId) => string | null;
let sessionGuard: SessionGuard | null = null;
export function registerSessionGuard(fn: SessionGuard | null) {
  sessionGuard = fn;
}

export function hasPermission(s: AccessState, userId: string, module: ModuleId, action: ActionId, ctx: { programme?: string; geo?: { state?: string; district?: string; branch?: string } } = {}, access = getEffectiveAccess(s, userId)): Decision {
  const def = moduleById.get(module);
  if (!def) return { allowed: false, reason: "Unknown module" };
  if (!def.actions.includes(action)) return { allowed: false, reason: `${def.label} has no ${action} action` };
  const blocked = sessionGuard?.(userId, module, action);
  if (blocked) return { allowed: false, reason: blocked };
  if (!access.user) return { allowed: false, reason: "User not found" };
  if (!access.accountActive) return { allowed: false, reason: `Account is ${access.user.accountStatus.replace("_", " ")}` };

  const k = key(module, action);
  const candidates = access.grants.get(k) ?? [];
  if (!candidates.length) {
    const blocked = access.sources.find((x) => !x.effective && x.keys.includes(k));
    return { allowed: false, reason: blocked ? `Only granted by ${blocked.title}, which is not effective: ${blocked.note}` : "No role, profile or direct grant includes this permission" };
  }
  let pool = candidates;
  if (ctx.programme) {
    pool = pool.filter((g) => ctx.programme!.split(" + ").every((part) => programmesOf(g.source.scope).includes(part)));
    if (!pool.length) return { allowed: false, reason: `Granted, but not for programme ${ctx.programme}` };
  }
  if (ctx.geo && (ctx.geo.state || ctx.geo.district || ctx.geo.branch)) {
    pool = pool.filter((g) => geoCovers(g.source.scope.geography, ctx.geo!));
    if (!pool.length) return { allowed: false, reason: "Granted, but not for this location" };
  }
  const via = pool[0].source;
  return { allowed: true, reason: `Allowed through ${via.kind === "direct" ? "a direct grant" : via.title}`, via };
}

/** Modules the user can open, and the actions allowed in each. */
export function getEffectivePermissions(s: AccessState, userId: string, access = getEffectiveAccess(s, userId)): Map<ModuleId, ActionId[]> {
  const out = new Map<ModuleId, ActionId[]>();
  for (const k of access.grants.keys()) {
    const { module, action } = parseKey(k);
    out.set(module, [...(out.get(module) ?? []), action]);
  }
  return out;
}

/** Programmes the user can see (for a module's View permission, or across all grants). */
export function getAccessibleProgrammes(s: AccessState, userId: string, module?: ModuleId, access = getEffectiveAccess(s, userId)): "all" | string[] {
  const grants = module ? (access.grants.get(key(module, "view")) ?? []) : [...access.grants.values()].flat();
  if (grants.some((g) => g.source.scope.programmes === "all")) return "all";
  return Array.from(new Set(grants.flatMap((g) => programmesOf(g.source.scope))));
}

/** Union of geography the user can see (for a module's View permission, or across all grants). */
export function getAccessibleGeography(s: AccessState, userId: string, module?: ModuleId, access = getEffectiveAccess(s, userId)): GeographyScope {
  const grants = module ? (access.grants.get(key(module, "view")) ?? []) : [...access.grants.values()].flat();
  if (grants.some((g) => g.source.scope.geography.mode === "all")) return { mode: "all" };
  const states = new Set<string>();
  const districts = new Set<string>();
  const branches = new Set<string>();
  for (const g of grants) {
    const geo = g.source.scope.geography;
    if (geo.mode === "selected") {
      geo.states.forEach((x) => states.add(x));
      geo.districts.forEach((x) => districts.add(x));
      geo.branches.forEach((x) => branches.add(x));
    }
  }
  return { mode: "selected", states: [...states], districts: [...districts], branches: [...branches] };
}

/** States touched by a geography scope (used to filter state-level dashboard data). */
export function statesTouched(g: GeographyScope): "all" | string[] {
  if (g.mode === "all") return "all";
  const set = new Set(g.states);
  g.districts.forEach((d) => {
    const hit = findDistrict(d);
    if (hit) set.add(hit.state.code);
  });
  g.branches.forEach((b) => {
    const hit = findBranch(b);
    if (hit) set.add(hit.state.code);
  });
  return [...set];
}

/* ---------------- Delegation & governance policy ---------------- */

export function isEffectiveSuperAdmin(s: AccessState, userId: string, access = getEffectiveAccess(s, userId)) {
  return access.sources.some((x) => x.effective && x.roleId === ROLE.SUPER_ADMIN);
}

/** Effective Super Admin assignments that would remain after excluding the given assignments/users. */
export function remainingSuperAdmins(s: AccessState, exclude: { assignmentIds?: string[]; userIds?: string[] }) {
  return s.assignments.filter((a) => {
    if (a.roleId !== ROLE.SUPER_ADMIN) return false;
    if (exclude.assignmentIds?.includes(a.id) || exclude.userIds?.includes(a.userId)) return false;
    const user = s.users.find((u) => u.id === a.userId);
    return sourceStatus(s, user, a.membershipId, a.status, a.validFrom, a.validTo, roleById(s, a.roleId)).effective;
  });
}

/** Can the actor grant `k` at `scope`? They must hold it themselves within at least that scope. */
export function canGrantPermission(s: AccessState, actorId: string, k: PermissionKey, scope: AccessScope, access = getEffectiveAccess(s, actorId)): boolean {
  return (access.grants.get(k) ?? []).some((g) => scopeWithin(scope, g.source.scope));
}

/** Can the actor administer this user at all (view is separate)? */
export function canManageUser(s: AccessState, actorId: string, targetId: string, need: ActionId = "edit"): PolicyResult {
  const actor = getEffectiveAccess(s, actorId);
  const errors: string[] = [];
  if (actorId === targetId) errors.push("You cannot change your own account or access");
  if (!hasPermission(s, actorId, "users", need, {}, actor).allowed) errors.push(`You need User & role management: ${need === "disable" ? "Disable" : need === "edit" ? "Edit" : need} permission`);
  const target = getEffectiveAccess(s, targetId);
  const targetIsSuper = target.sources.some((x) => x.roleId === ROLE.SUPER_ADMIN && x.status !== "revoked");
  if (targetIsSuper && !isEffectiveSuperAdmin(s, actorId, actor)) errors.push("Only an Evolve Super Admin can manage an Evolve Super Admin account");
  if (!actor.grants.has(PLATFORM_ADMIN_KEY)) {
    const actorOrgs = new Set(membershipsOf(s, actorId).filter((m) => m.status === "active").map((m) => m.orgId));
    const outside = membershipsOf(s, targetId).filter((m) => !actorOrgs.has(m.orgId));
    if (outside.length) errors.push("This user belongs to an organisation outside your delegated authority");
  }
  return result(errors);
}

export interface AssignmentDraft {
  userId: string;
  membershipId: string;
  roleId: string;
  scope: AccessScope;
  moduleLimit: ModuleId[] | null;
  validFrom: string;
  validTo: string | null;
}

/** Full policy check for granting a role or operational profile. */
export function canAssignRole(s: AccessState, actorId: string, d: AssignmentDraft, opts: { skipSelfCheck?: boolean; forNewUser?: boolean; excludeAssignmentId?: string } = {}): PolicyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const actor = getEffectiveAccess(s, actorId);
  const role = roleById(s, d.roleId);
  if (!role) return result(["Role not found"]);

  if (!opts.skipSelfCheck && actorId === d.userId) errors.push("You cannot grant access to yourself");
  if (!actor.grants.has(ASSIGN_ACCESS_KEY)) errors.push("You need User & role management: Assign access");
  if (role.status !== "active") errors.push(`${role.name} is inactive and cannot be assigned`);

  if (role.id === ROLE.SUPER_ADMIN && !isEffectiveSuperAdmin(s, actorId, actor)) errors.push("Only an authorised Evolve Super Admin can grant Evolve Super Admin");
  else if ((role.category === "platform" || role.protected) && !actor.grants.has(PLATFORM_ADMIN_KEY)) {
    errors.push(role.category === "operational" ? `${role.name} access is provisioned by Evolve. Raise a Maker nomination instead` : `${role.name} is a protected role that only platform administrators can assign`);
  }

  const mem = s.memberships.find((m) => m.id === d.membershipId);
  const org = mem ? orgById(s, mem.orgId) : undefined;
  if (!mem && !opts.forNewUser) errors.push("Choose the organisation membership this access belongs to");
  if (mem && mem.status !== "active") errors.push("That organisation membership is inactive");
  if (org && org.status !== "active") errors.push(`${org.name} is deactivated`);
  if (org && role.orgApplicability !== "any" && !role.orgApplicability.includes(org.id)) errors.push(`${role.name} is not available to members of ${org.name}`);

  // Role scope ceiling
  if (role.scopeCeiling.programmes !== "all") {
    const allowed = role.scopeCeiling.programmes;
    if (d.scope.programmes === "all" || d.scope.programmes.some((p) => !allowed.includes(p))) errors.push(`${role.name} is limited to programmes ${allowed.join(", ")}`);
  }
  const level = geoLevel(d.scope.geography);
  if (role.scopeCeiling.geography !== "all" && LEVEL_RANK[level] > LEVEL_RANK[role.scopeCeiling.geography]) errors.push(`${role.name} can be scoped no wider than ${role.scopeCeiling.geography} level`);
  if (d.scope.programmes !== "all" && d.scope.programmes.length === 0) errors.push("Choose at least one programme");

  // Operational profiles need modules, and each module must be covered by the profile
  if (role.category === "operational") {
    if (!d.moduleLimit || !d.moduleLimit.length) errors.push(`Choose the modules this ${role.name} access covers`);
    else {
      const uncovered = d.moduleLimit.filter((mm) => !role.permissions.some((k) => parseKey(k).module === mm));
      if (uncovered.length) errors.push(`${role.name} has no actions in ${uncovered.map((x) => moduleById.get(x)?.label ?? x).join(", ")}`);
    }
  }

  // Delegation ceiling: every permission must be grantable by the actor within the requested scope
  const keys = roleKeys(role, d.moduleLimit);
  const beyond = keys.filter((k) => !canGrantPermission(s, actorId, k, d.scope, actor));
  if (beyond.length && !errors.some((e) => e.startsWith("Only an authorised"))) {
    const sample = beyond.slice(0, 3).map((k) => `${moduleById.get(parseKey(k).module)?.label}: ${parseKey(k).action}`);
    errors.push(`Beyond your delegation authority: ${beyond.length} permission${beyond.length > 1 ? "s" : ""} (${sample.join("; ")}${beyond.length > 3 ? " …" : ""}) at this scope`);
  }

  if (d.validTo && d.validTo < d.validFrom) errors.push("End date is before start date");
  if (geographyIsEmpty(d.scope.geography)) warnings.push("No geography selected: the user will see no location-bound records");
  const target = s.users.find((u) => u.id === d.userId);
  if (target && target.accountStatus !== "active") warnings.push(`Account is ${target.accountStatus.replace("_", " ")}; this access takes effect once the account is active`);
  const dup = s.assignments.find((a) => a.id !== opts.excludeAssignmentId && a.userId === d.userId && a.roleId === d.roleId && a.membershipId === d.membershipId && (a.status === "active" || a.status === "pending"));
  if (dup) warnings.push(`Overlaps an existing ${role.name} assignment (${dup.id}); both scopes will apply`);
  if (role.category === "operational" && d.moduleLimit) {
    const other = role.id === ROLE.MAKER ? ROLE.CHECKER : ROLE.MAKER;
    const clash = s.assignments.find((a) => a.userId === d.userId && a.roleId === other && a.status === "active" && a.moduleLimit?.some((mm) => d.moduleLimit!.includes(mm)));
    if (clash) warnings.push("User would be both Maker and Checker on the same module. Per-request separation of duties is enforced in the Maker-Checker phase");
  }
  if (role.id === ROLE.SUPER_ADMIN) warnings.push("Evolve Super Admin is the highest platform privilege. It still carries no approval rights");
  return result(errors, warnings);
}

/** Can the actor revoke or change an existing assignment? (Same authority as granting it.) */
export function canChangeAssignment(s: AccessState, actorId: string, assignmentId: string): PolicyResult {
  const a = s.assignments.find((x) => x.id === assignmentId);
  if (!a) return result(["Assignment not found"]);
  const role = roleById(s, a.roleId);
  const errors: string[] = [];
  if (actorId === a.userId) errors.push("You cannot change your own access");
  const actor = getEffectiveAccess(s, actorId);
  if (!actor.grants.has(ASSIGN_ACCESS_KEY)) errors.push("You need User & role management: Assign access");
  if (role?.id === ROLE.SUPER_ADMIN) {
    if (!isEffectiveSuperAdmin(s, actorId, actor)) errors.push("Only an Evolve Super Admin can change Evolve Super Admin access");
    if (!remainingSuperAdmins(s, { assignmentIds: [a.id] }).length) errors.push("This is the last active Evolve Super Admin. Assign another Super Admin first");
  } else if (role && (role.protected || role.category === "platform") && !actor.grants.has(PLATFORM_ADMIN_KEY)) {
    errors.push(`${role.name} can only be changed by a platform administrator`);
  } else if (role && !roleKeys(role, a.moduleLimit).every((k) => canGrantPermission(s, actorId, k, a.scope, actor))) {
    errors.push("This assignment is beyond your delegation authority");
  }
  return result(errors);
}

/** Guards for suspending, deactivating or revoking all access for a user. */
export function canChangeAccountStatus(s: AccessState, actorId: string, targetId: string, to: "suspended" | "deactivated" | "active" | "revoke_all"): PolicyResult {
  const base = canManageUser(s, actorId, targetId, "disable");
  const errors = [...base.errors];
  const warnings: string[] = [];
  if (to !== "active" && !remainingSuperAdmins(s, { userIds: [targetId] }).length) errors.push("This is the last active Evolve Super Admin. The platform must keep at least one");
  if (to === "deactivated") {
    const pending = s.nominations.filter((n) => n.candidate.existingUserId === targetId && ["submitted", "under_review", "approved", "returned", "draft"].includes(n.status));
    if (pending.length) warnings.push(`${pending.length} open Maker nomination${pending.length > 1 ? "s" : ""} for this user will be withdrawn`);
  }
  return result(errors, warnings);
}

export function canManageOrganisations(s: AccessState, actorId: string): PolicyResult {
  return hasPermission(s, actorId, "users", "manage").allowed ? ok() : result(["Only Evolve platform administrators can create or change organisations"]);
}

export function canManageRoles(s: AccessState, actorId: string, role?: Role): PolicyResult {
  const errors: string[] = [];
  if (!hasPermission(s, actorId, "users", "manage").allowed) errors.push("Only Evolve platform administrators can create or change role templates");
  if (role?.id === ROLE.SUPER_ADMIN && !isEffectiveSuperAdmin(s, actorId)) errors.push("Only an Evolve Super Admin can change the Evolve Super Admin role");
  return result(errors);
}

/** Nominations: V-Guard (or any holder of users:submit) may nominate; only platform admins review/provision. */
export function canNominate(s: AccessState, actorId: string): PolicyResult {
  return hasPermission(s, actorId, "users", "submit").allowed ? ok() : result(["You need User & role management: Submit to raise nominations"]);
}

export function canReviewNominations(s: AccessState, actorId: string): PolicyResult {
  return hasPermission(s, actorId, "users", "manage").allowed && hasPermission(s, actorId, "users", "assign_access").allowed ? ok() : result(["Only Evolve platform administrators review and provision Maker access"]);
}

/** Users who appear to match identity details (duplicate detection). */
export function findDuplicates(s: AccessState, email: string, mobile: string, excludeId?: string) {
  const e = email.trim().toLowerCase();
  const digits = mobile.replace(/\D/g, "").slice(-10);
  return s.users.filter((u) => u.id !== excludeId && ((e && u.email.toLowerCase() === e) || (digits.length === 10 && u.mobile.replace(/\D/g, "").slice(-10) === digits)));
}
