/**
 * ACCESS STORE — in-browser mock repository for users, organisations, roles, assignments,
 * nominations and audit events. Persists to sessionStorage so changes survive navigation and
 * reloads within the tab. Every mutation:
 *   1. re-checks the policy in engine.ts with the acting user (never trusts the UI),
 *   2. writes an immutable audit event (including blocked attempts), and
 *   3. returns a PolicyResult the UI shows to the administrator.
 * Replace with API calls via services/accessApi.ts when the backend exists.
 */
import { useSyncExternalStore } from "react";
import { moduleById, parseKey } from "@/config/rbacCatalogue";
import { SEED_ASSIGNMENTS, SEED_AUDIT, SEED_DIRECT_GRANTS, SEED_MEMBERSHIPS, SEED_NOMINATIONS, SEED_ORGANISATIONS, SEED_ROLES, SEED_USERS, ROLE } from "@/data/mock/rbacSeed";
import type { AccessScope, AuditEvent, MakerNomination, ModuleId, Organisation, PermissionKey, Role, RoleAssignment, User } from "@/types/rbac";
import {
  canAssignRole,
  canChangeAccountStatus,
  canChangeAssignment,
  canGrantPermission,
  canManageOrganisations,
  canManageRoles,
  canManageUser,
  canNominate,
  canReviewNominations,
  describeScope,
  findDuplicates,
  fullName,
  hasPermission,
  orgById,
  primaryOrg,
  remainingSuperAdmins,
  roleById,
  TODAY,
  type AccessState,
  type AssignmentDraft,
  type PolicyResult,
} from "./engine";

const STORAGE_KEY = "vg-rishta.access-store.v17";

function seed(): AccessState {
  return {
    users: SEED_USERS,
    organisations: SEED_ORGANISATIONS,
    memberships: SEED_MEMBERSHIPS,
    roles: SEED_ROLES,
    assignments: SEED_ASSIGNMENTS,
    directGrants: SEED_DIRECT_GRANTS,
    nominations: SEED_NOMINATIONS,
    audit: SEED_AUDIT,
  };
}

function load(): AccessState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AccessState;
  } catch {
    /* storage unavailable: start from seed */
  }
  return seed();
}

let state: AccessState = load();
const listeners = new Set<() => void>();

function commit(next: AccessState) {
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const accessStore = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Subscribe a component to the access store. Derive values with useMemo from the returned state. */
export function useAccessState(): AccessState {
  return useSyncExternalStore(accessStore.subscribe, accessStore.get, accessStore.get);
}

export function resetAccessDemoData() {
  commit(seed());
}

/* ---------------- Helpers ---------------- */

const stamp = () => `${TODAY}T${new Date().toTimeString().slice(0, 5)}`;

function nextId(prefix: string, ids: string[], pad = 4) {
  const max = ids.reduce((m, id) => {
    const n = Number(id.replace(/\D/g, "").slice(-pad));
    return Number.isFinite(n) && id.startsWith(prefix) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}

const accessRef = () => `ACC-${Math.floor(4500 + Math.random() * 5000)}`;

function audit(s: AccessState, e: Omit<AuditEvent, "id" | "at" | "ref" | "actorOrgId" | "module" | "status"> & Partial<Pick<AuditEvent, "status" | "module">>): AuditEvent {
  const id = nextId("AUD-", s.audit.map((a) => a.id), 6);
  return {
    id,
    at: stamp(),
    ref: `REF-${id.slice(4)}`,
    actorOrgId: e.actorUserId === "SYSTEM" ? null : (primaryOrg(s, e.actorUserId)?.id ?? null),
    module: "users",
    status: "success",
    ...e,
  };
}

function withAudit(s: AccessState, ...events: Parameters<typeof audit>[1][]): AccessState {
  let next = s;
  for (const e of events) next = { ...next, audit: [...next.audit, audit(next, e)] };
  return next;
}

/** Record a blocked attempt and return the policy result unchanged. */
function blocked(actorId: string, targetType: AuditEvent["targetType"], targetId: string, targetLabel: string, attempted: string, r: PolicyResult): PolicyResult {
  commit(withAudit(state, { actorUserId: actorId, action: "access.denied", targetType, targetId, targetLabel, previous: null, next: attempted, reason: `Blocked: ${r.errors.join("; ")}`, status: "blocked" }));
  return r;
}

export function describeAssignment(s: AccessState, a: Pick<RoleAssignment, "roleId" | "moduleLimit" | "scope" | "validTo">) {
  const role = roleById(s, a.roleId);
  const sc = describeScope(a.scope);
  const mods = a.moduleLimit ? ` [${a.moduleLimit.map((m) => moduleById.get(m)?.label ?? m).join(", ")}]` : "";
  return `${role?.name ?? a.roleId}${mods} · ${sc.programmes} · ${sc.geography}${a.validTo ? ` · until ${a.validTo}` : ""}`;
}

const label = (s: AccessState, userId: string) => fullName(s.users.find((u) => u.id === userId));

function profileAction(roleId: string, granted: boolean): AuditEvent["action"] {
  if (roleId === ROLE.CHECKER) return granted ? "checker.assigned" : "checker.revoked";
  if (roleId === ROLE.MAKER) return granted ? "maker.provisioned" : "role.removed";
  return granted ? "role.assigned" : "role.removed";
}

/* =====================================================================
   Users
   ===================================================================== */

export interface NewUserInput {
  identity: Pick<User, "firstName" | "lastName" | "email" | "mobile" | "employeeId" | "designation" | "department" | "reportingManagerId">;
  orgId: string;
  businessUnit: string | null;
  authMethod: User["authMethod"];
  assignments: { roleId: string; moduleLimit: ModuleId[] | null; scope: AccessScope; validFrom: string; validTo: string | null }[];
}

/** Builds the would-be state for a new user so the same policy checks can run before creation. */
export function previewNewUser(s: AccessState, input: NewUserInput) {
  const userId = nextId("USR-", s.users.map((u) => u.id));
  const membershipId = nextId("MEM-", s.memberships.map((m) => m.id));
  const user: User = {
    id: userId,
    ...input.identity,
    accountStatus: "invited",
    authMethod: input.authMethod,
    createdAt: stamp(),
    createdBy: "",
    lastLoginAt: null,
    invitation: { ref: `INV-${userId.slice(4)}`, sentAt: stamp(), status: "pending" },
    security: { failedLogins: 0, lastCredentialReset: null, mfa: "not_supported_yet", lockHistory: [] },
  };
  const membership = { id: membershipId, userId, orgId: input.orgId, department: input.identity.department, businessUnit: input.businessUnit, designation: input.identity.designation, status: "active" as const, since: TODAY };
  const temp: AccessState = { ...s, users: [...s.users, user], memberships: [...s.memberships, membership] };
  return { userId, membershipId, user, membership, temp };
}

export function validateNewUser(s: AccessState, actorId: string, input: NewUserInput): PolicyResult & { perAssignment: PolicyResult[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasPermission(s, actorId, "users", "create").allowed) errors.push("You need User & role management: Create");
  const dups = findDuplicates(s, input.identity.email, input.identity.mobile);
  if (dups.length) errors.push(`An account already exists with this email or mobile: ${dups.map((d) => `${fullName(d)} (${d.id})`).join(", ")}`);
  const org = orgById(s, input.orgId);
  if (!org) errors.push("Choose an organisation");
  else if (org.status !== "active") errors.push(`${org.name} is deactivated`);
  const { userId, membershipId, temp } = previewNewUser(s, input);
  const perAssignment = input.assignments.map((a) => canAssignRole(temp, actorId, { ...a, userId, membershipId }, { forNewUser: true }));
  perAssignment.forEach((r) => {
    errors.push(...r.errors);
    warnings.push(...r.warnings.filter((w) => !w.startsWith("Account is")));
  });
  if (!input.assignments.length) warnings.push("No role assigned: the user will be able to sign in but see nothing");
  return { ok: errors.length === 0, errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), perAssignment };
}

export function createUser(actorId: string, input: NewUserInput): PolicyResult & { userId?: string; inviteRef?: string } {
  const v = validateNewUser(state, actorId, input);
  const name = `${input.identity.firstName} ${input.identity.lastName}`.trim();
  if (!v.ok) return blocked(actorId, "user", "NEW", name, "Create user", v);
  const { userId, membershipId, user, membership } = previewNewUser(state, input);
  user.createdBy = actorId;
  let ids = state.assignments.map((a) => a.id);
  const assignments: RoleAssignment[] = input.assignments.map((a) => {
    const id = nextId("ASG-", ids);
    ids = [...ids, id];
    return { id, userId, membershipId, roleId: a.roleId, moduleLimit: a.moduleLimit, scope: a.scope, status: "pending", validFrom: a.validFrom, validTo: a.validTo, assignedBy: actorId, assignedAt: stamp(), reason: "Initial provisioning", source: "direct", accessRef: accessRef() };
  });
  let next: AccessState = { ...state, users: [...state.users, user], memberships: [...state.memberships, membership], assignments: [...state.assignments, ...assignments] };
  next = withAudit(
    next,
    { actorUserId: actorId, action: "user.created", targetType: "user", targetId: userId, targetLabel: name, previous: null, next: `Invited · ${orgById(state, input.orgId)?.name}`, reason: "New user provisioning" },
    { actorUserId: actorId, action: "user.invited", targetType: "user", targetId: userId, targetLabel: name, previous: null, next: `Invitation ${user.invitation!.ref} (mock, no email sent)`, reason: "" },
    ...assignments.map((a) => ({ actorUserId: actorId, action: profileAction(a.roleId, true), targetType: "user" as const, targetId: userId, targetLabel: name, previous: null, next: `${describeAssignment(state, a)} · pending activation`, reason: "Initial provisioning" })),
  );
  commit(next);
  return { ok: true, errors: [], warnings: v.warnings, userId, inviteRef: user.invitation!.ref };
}

/** Mock only: simulates the user accepting the invitation (no identity provider is connected). */
export function simulateInvitationAccepted(actorId: string, userId: string): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  if (!u || !["invited", "pending_activation"].includes(u.accountStatus)) return { ok: false, errors: ["User is not awaiting activation"], warnings: [] };
  const users = state.users.map((x) => (x.id === userId ? { ...x, accountStatus: "active" as const, lastLoginAt: stamp(), invitation: x.invitation ? { ...x.invitation, status: "accepted" as const } : null } : x));
  const assignments = state.assignments.map((a) => (a.userId === userId && a.status === "pending" && a.validFrom <= TODAY ? { ...a, status: "active" as const } : a));
  commit(withAudit({ ...state, users, assignments }, { actorUserId: actorId, action: "user.updated", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: u.accountStatus, next: "Active (mock activation); pending assignments now active", reason: "Simulated invitation acceptance" }));
  return { ok: true, errors: [], warnings: [] };
}

export function updateUser(actorId: string, userId: string, patch: Partial<Pick<User, "firstName" | "lastName" | "email" | "mobile" | "employeeId" | "designation" | "department" | "reportingManagerId">>): PolicyResult {
  const r = canManageUser(state, actorId, userId, "edit");
  const u = state.users.find((x) => x.id === userId);
  if (!u) return { ok: false, errors: ["User not found"], warnings: [] };
  const errors = [...r.errors];
  if (patch.email !== undefined || patch.mobile !== undefined) {
    const dups = findDuplicates(state, patch.email ?? u.email, patch.mobile ?? u.mobile, userId);
    if (dups.length) errors.push(`Another account already uses this email or mobile: ${dups.map((d) => d.id).join(", ")}`);
  }
  if (errors.length) return blocked(actorId, "user", userId, fullName(u), "Edit user", { ok: false, errors, warnings: [] });
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => patch[k] !== u[k]);
  if (!changed.length) return { ok: true, errors: [], warnings: ["Nothing changed"] };
  commit(
    withAudit(
      { ...state, users: state.users.map((x) => (x.id === userId ? { ...x, ...patch } : x)) },
      { actorUserId: actorId, action: "user.updated", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: changed.map((k) => `${k}: ${k === "mobile" ? "(masked)" : (u[k] ?? "—")}`).join("; "), next: changed.map((k) => `${k}: ${k === "mobile" ? "(masked)" : (patch[k] ?? "—")}`).join("; "), reason: "Profile update" },
    ),
  );
  return { ok: true, errors: [], warnings: [] };
}

export function addMembership(actorId: string, userId: string, orgId: string, department: string, designation: string, reason: string): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  const org = orgById(state, orgId);
  const errors: string[] = [];
  if (!hasPermission(state, actorId, "users", "manage").allowed) errors.push("Only platform administrators add organisation memberships");
  if (actorId === userId) errors.push("You cannot change your own memberships");
  if (!org || org.status !== "active") errors.push("Organisation is not active");
  if (state.memberships.some((m) => m.userId === userId && m.orgId === orgId && m.status === "active")) errors.push("User is already a member of this organisation");
  if (!reason.trim()) errors.push("Give a reason");
  if (errors.length) return blocked(actorId, "user", userId, fullName(u), `Add membership ${org?.name ?? orgId}`, { ok: false, errors, warnings: [] });
  const id = nextId("MEM-", state.memberships.map((m) => m.id));
  commit(withAudit({ ...state, memberships: [...state.memberships, { id, userId, orgId, department, designation, businessUnit: null, status: "active", since: TODAY }] }, { actorUserId: actorId, action: "membership.added", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: null, next: `${org!.name} · ${designation}`, reason }));
  return { ok: true, errors: [], warnings: ["The membership carries no access until a role is assigned within it"] };
}

/* ---------------- Assignments ---------------- */

export function assignRole(actorId: string, d: AssignmentDraft, reason: string, source: RoleAssignment["source"] = "direct", nominationId?: string): PolicyResult & { assignmentId?: string } {
  const r = canAssignRole(state, actorId, d);
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason for this access change");
  const role = roleById(state, d.roleId);
  if (errors.length) return blocked(actorId, "user", d.userId, label(state, d.userId), `Assign ${role?.name ?? d.roleId}`, { ok: false, errors, warnings: r.warnings });
  const target = state.users.find((u) => u.id === d.userId)!;
  const id = nextId("ASG-", state.assignments.map((a) => a.id));
  const asg: RoleAssignment = { id, ...d, status: target.accountStatus === "active" && d.validFrom <= TODAY ? "active" : "pending", assignedBy: actorId, assignedAt: stamp(), reason, source, nominationId, accessRef: accessRef() };
  commit(withAudit({ ...state, assignments: [...state.assignments, asg] }, { actorUserId: actorId, action: profileAction(d.roleId, true), targetType: "user", targetId: d.userId, targetLabel: fullName(target), previous: null, next: `${describeAssignment(state, asg)} · ${asg.status} · ${asg.accessRef}`, reason }));
  return { ok: true, errors: [], warnings: r.warnings, assignmentId: id };
}

export function revokeAssignment(actorId: string, assignmentId: string, reason: string): PolicyResult {
  const a = state.assignments.find((x) => x.id === assignmentId);
  if (!a) return { ok: false, errors: ["Assignment not found"], warnings: [] };
  const r = canChangeAssignment(state, actorId, assignmentId);
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason");
  if (a.status === "revoked") errors.push("Already revoked");
  if (errors.length) return blocked(actorId, "assignment", a.userId, label(state, a.userId), `Revoke ${describeAssignment(state, a)}`, { ok: false, errors, warnings: [] });
  commit(withAudit({ ...state, assignments: state.assignments.map((x) => (x.id === assignmentId ? { ...x, status: "revoked" as const } : x)) }, { actorUserId: actorId, action: profileAction(a.roleId, false), targetType: "user", targetId: a.userId, targetLabel: label(state, a.userId), previous: `${describeAssignment(state, a)} · ${a.status}`, next: "Revoked", reason }));
  return { ok: true, errors: [], warnings: [] };
}

export function setAssignmentSuspended(actorId: string, assignmentId: string, suspended: boolean, reason: string): PolicyResult {
  const a = state.assignments.find((x) => x.id === assignmentId);
  if (!a) return { ok: false, errors: ["Assignment not found"], warnings: [] };
  const r = canChangeAssignment(state, actorId, assignmentId);
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason");
  if (suspended && a.status !== "active") errors.push("Only active access can be suspended");
  if (!suspended && a.status !== "suspended") errors.push("Only suspended access can be restored");
  if (errors.length) return blocked(actorId, "assignment", a.userId, label(state, a.userId), `${suspended ? "Suspend" : "Restore"} ${describeAssignment(state, a)}`, { ok: false, errors, warnings: [] });
  const status = suspended ? ("suspended" as const) : ("active" as const);
  commit(withAudit({ ...state, assignments: state.assignments.map((x) => (x.id === assignmentId ? { ...x, status } : x)) }, { actorUserId: actorId, action: suspended ? "user.access_revoked" : "role.assigned", targetType: "user", targetId: a.userId, targetLabel: label(state, a.userId), previous: `${describeAssignment(state, a)} · ${a.status}`, next: status, reason }));
  return { ok: true, errors: [], warnings: [] };
}

export function changeAssignmentScope(actorId: string, assignmentId: string, scope: AccessScope, validTo: string | null, reason: string): PolicyResult {
  const a = state.assignments.find((x) => x.id === assignmentId);
  if (!a) return { ok: false, errors: ["Assignment not found"], warnings: [] };
  const change = canChangeAssignment(state, actorId, assignmentId);
  const grant = canAssignRole(state, actorId, { userId: a.userId, membershipId: a.membershipId, roleId: a.roleId, moduleLimit: a.moduleLimit, scope, validFrom: a.validFrom, validTo }, { excludeAssignmentId: a.id });
  const errors = Array.from(new Set([...change.errors, ...grant.errors]));
  if (!reason.trim()) errors.push("Give a reason");
  if (errors.length) return blocked(actorId, "assignment", a.userId, label(state, a.userId), `Change scope of ${describeAssignment(state, a)}`, { ok: false, errors, warnings: grant.warnings });
  const before = describeScope(a.scope);
  const after = describeScope(scope);
  const events: Parameters<typeof audit>[1][] = [];
  const base = { actorUserId: actorId, targetType: "user" as const, targetId: a.userId, targetLabel: label(state, a.userId), reason };
  if (before.programmes !== after.programmes) events.push({ ...base, action: "scope.programme_changed", previous: `${roleById(state, a.roleId)?.name}: ${before.programmes}`, next: after.programmes });
  if (before.geography !== after.geography) events.push({ ...base, action: "scope.geography_changed", previous: `${roleById(state, a.roleId)?.name}: ${before.geography}`, next: after.geography });
  if ((a.validTo ?? "") !== (validTo ?? "")) events.push({ ...base, action: "role.assigned", previous: `Valid until ${a.validTo ?? "open-ended"}`, next: `Valid until ${validTo ?? "open-ended"}` });
  if (!events.length) return { ok: true, errors: [], warnings: ["Nothing changed"] };
  commit(withAudit({ ...state, assignments: state.assignments.map((x) => (x.id === assignmentId ? { ...x, scope, validTo } : x)) }, ...events));
  return { ok: true, errors: [], warnings: grant.warnings };
}

/* ---------------- Direct grants ---------------- */

export function addDirectGrant(actorId: string, userId: string, membershipId: string, permissions: PermissionKey[], scope: AccessScope, validTo: string | null, reason: string): PolicyResult {
  const errors: string[] = [];
  if (actorId === userId) errors.push("You cannot grant access to yourself");
  if (!hasPermission(state, actorId, "users", "assign_access").allowed) errors.push("You need User & role management: Assign access");
  if (!permissions.length) errors.push("Choose at least one permission");
  const beyond = permissions.filter((k) => !canGrantPermission(state, actorId, k, scope));
  if (beyond.length) errors.push(`Beyond your delegation authority: ${beyond.map((k) => `${moduleById.get(parseKey(k).module)?.label}: ${parseKey(k).action}`).join("; ")}`);
  if (!reason.trim()) errors.push("Give a reason");
  if (errors.length) return blocked(actorId, "user", userId, label(state, userId), "Direct permission grant", { ok: false, errors, warnings: [] });
  const id = nextId("DG-", state.directGrants.map((g) => g.id));
  const g = { id, userId, membershipId, permissions, scope, status: "active" as const, validFrom: TODAY, validTo, assignedBy: actorId, assignedAt: stamp(), reason, accessRef: accessRef() };
  const sc = describeScope(scope);
  commit(withAudit({ ...state, directGrants: [...state.directGrants, g] }, { actorUserId: actorId, action: "permission.added", targetType: "user", targetId: userId, targetLabel: label(state, userId), previous: null, next: `${permissions.map((k) => `${moduleById.get(parseKey(k).module)?.label}: ${parseKey(k).action}`).join(", ")} · ${sc.programmes} · ${sc.geography}`, reason }));
  return { ok: true, errors: [], warnings: [] };
}

export function revokeDirectGrant(actorId: string, grantId: string, reason: string): PolicyResult {
  const g = state.directGrants.find((x) => x.id === grantId);
  if (!g) return { ok: false, errors: ["Grant not found"], warnings: [] };
  const errors: string[] = [];
  if (actorId === g.userId) errors.push("You cannot change your own access");
  if (!g.permissions.every((k) => canGrantPermission(state, actorId, k, g.scope))) errors.push("This grant is beyond your delegation authority");
  if (!reason.trim()) errors.push("Give a reason");
  if (errors.length) return blocked(actorId, "user", g.userId, label(state, g.userId), "Revoke direct grant", { ok: false, errors, warnings: [] });
  commit(withAudit({ ...state, directGrants: state.directGrants.map((x) => (x.id === grantId ? { ...x, status: "revoked" as const } : x)) }, { actorUserId: actorId, action: "permission.removed", targetType: "user", targetId: g.userId, targetLabel: label(state, g.userId), previous: g.permissions.join(", "), next: "Revoked", reason }));
  return { ok: true, errors: [], warnings: [] };
}

/* ---------------- Account lifecycle ---------------- */

export function suspendUser(actorId: string, userId: string, reason: string): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  const r = canChangeAccountStatus(state, actorId, userId, "suspended");
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason");
  if (u?.accountStatus === "suspended") errors.push("Already suspended");
  if (errors.length) return blocked(actorId, "user", userId, fullName(u), "Suspend account", { ok: false, errors, warnings: [] });
  commit(withAudit({ ...state, users: state.users.map((x) => (x.id === userId ? { ...x, accountStatus: "suspended" as const } : x)) }, { actorUserId: actorId, action: "user.suspended", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: u!.accountStatus, next: "Suspended (all assignments ineffective while suspended)", reason }));
  return { ok: true, errors: [], warnings: [] };
}

/** Reactivation never restores revoked access; suspended assignments are restored only if listed. */
export function reactivateUser(actorId: string, userId: string, reason: string, effectiveDate: string, restoreAssignmentIds: string[]): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  const r = canChangeAccountStatus(state, actorId, userId, "active");
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason");
  if (!u || !["suspended", "locked", "deactivated"].includes(u.accountStatus)) errors.push("Only suspended, locked or deactivated accounts can be reactivated");
  if (effectiveDate > TODAY) errors.push("Future-dated reactivation needs the backend scheduler; choose today or earlier");
  const notAllowed = restoreAssignmentIds.filter((id) => !canChangeAssignment(state, actorId, id).ok);
  if (notAllowed.length) errors.push(`You cannot restore ${notAllowed.join(", ")}`);
  if (errors.length) return blocked(actorId, "user", userId, fullName(u), "Reactivate account", { ok: false, errors, warnings: [] });
  const users = state.users.map((x) => (x.id === userId ? { ...x, accountStatus: "active" as const, security: { ...x.security, failedLogins: 0 } } : x));
  const assignments = state.assignments.map((a) => (restoreAssignmentIds.includes(a.id) && a.status === "suspended" ? { ...a, status: "active" as const } : a));
  commit(
    withAudit(
      { ...state, users, assignments },
      { actorUserId: actorId, action: "user.reactivated", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: u!.accountStatus, next: `Active from ${effectiveDate}${restoreAssignmentIds.length ? ` · restored ${restoreAssignmentIds.join(", ")}` : " · no suspended access restored"}`, reason },
    ),
  );
  return { ok: true, errors: [], warnings: [] };
}

export function deactivateUser(actorId: string, userId: string, reason: string): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  const r = canChangeAccountStatus(state, actorId, userId, "deactivated");
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason");
  if (errors.length) return blocked(actorId, "user", userId, fullName(u), "Deactivate account", { ok: false, errors, warnings: r.warnings });
  const open = ["draft", "submitted", "under_review", "approved", "returned"];
  const withdrawn = state.nominations.filter((n) => n.candidate.existingUserId === userId && open.includes(n.status));
  const nominations = state.nominations.map((n) => (withdrawn.includes(n) ? { ...n, status: "revoked" as const, history: [...n.history, { at: stamp(), by: actorId, status: "revoked" as const, remarks: "Withdrawn: candidate account deactivated" }] } : n));
  commit(
    withAudit(
      { ...state, users: state.users.map((x) => (x.id === userId ? { ...x, accountStatus: "deactivated" as const } : x)), nominations },
      { actorUserId: actorId, action: "user.deactivated", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: u!.accountStatus, next: `Deactivated${withdrawn.length ? ` · ${withdrawn.length} nomination(s) withdrawn` : ""}`, reason },
    ),
  );
  return { ok: true, errors: [], warnings: r.warnings };
}

/** Revokes every role, profile and direct grant without deactivating the account. */
export function revokeAllAccess(actorId: string, userId: string, reason: string): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  const r = canChangeAccountStatus(state, actorId, userId, "revoke_all");
  const live = state.assignments.filter((a) => a.userId === userId && ["active", "pending", "suspended"].includes(a.status));
  const errors = [...r.errors];
  live.forEach((a) => errors.push(...canChangeAssignment(state, actorId, a.id).errors));
  if (!reason.trim()) errors.push("Give a reason");
  const uniqueErrors = Array.from(new Set(errors));
  if (uniqueErrors.length) return blocked(actorId, "user", userId, fullName(u), "Revoke all access", { ok: false, errors: uniqueErrors, warnings: [] });
  commit(
    withAudit(
      {
        ...state,
        assignments: state.assignments.map((a) => (live.includes(a) ? { ...a, status: "revoked" as const } : a)),
        directGrants: state.directGrants.map((g) => (g.userId === userId && g.status === "active" ? { ...g, status: "revoked" as const } : g)),
      },
      { actorUserId: actorId, action: "user.access_revoked", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: `${live.length} live assignment(s)`, next: "All portal access revoked (account kept)", reason },
    ),
  );
  return { ok: true, errors: [], warnings: [] };
}

/** Mock: records the request. No identity provider is connected, so nothing is reset. */
export function requestCredentialReset(actorId: string, userId: string): PolicyResult {
  const u = state.users.find((x) => x.id === userId);
  const r = canManageUser(state, actorId, userId, "edit");
  if (!r.ok) return blocked(actorId, "user", userId, fullName(u), "Request credential reset", r);
  commit(withAudit({ ...state, users: state.users.map((x) => (x.id === userId ? { ...x, security: { ...x.security, lastCredentialReset: stamp() } } : x)) }, { actorUserId: actorId, action: "user.credential_reset_requested", targetType: "user", targetId: userId, targetLabel: fullName(u), previous: null, next: "Reset requested (mock: identity provider not connected)", reason: "" }));
  return { ok: true, errors: [], warnings: ["Recorded only. No reset link is sent until the authentication service is connected"] };
}

/* =====================================================================
   Organisations
   ===================================================================== */

export type OrgDraft = Pick<Organisation, "name" | "code" | "type" | "description" | "primaryContact" | "status" | "parentId">;

export function saveOrganisation(actorId: string, draft: OrgDraft, id?: string): PolicyResult & { id?: string } {
  const r = canManageOrganisations(state, actorId);
  const errors = [...r.errors];
  if (!draft.name.trim()) errors.push("Organisation name is required");
  if (!/^[A-Z0-9_-]{2,16}$/.test(draft.code)) errors.push("Code must be 2–16 capital letters, digits, - or _");
  if (state.organisations.some((o) => o.code === draft.code && o.id !== id)) errors.push("Another organisation already uses this code");
  if (draft.parentId && draft.parentId === id) errors.push("An organisation cannot be its own parent");
  if (errors.length) return blocked(actorId, "organisation", id ?? "NEW", draft.name, id ? "Edit organisation" : "Create organisation", { ok: false, errors, warnings: [] });
  if (id) {
    const before = orgById(state, id)!;
    const changed = (Object.keys(draft) as (keyof OrgDraft)[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(before[k]));
    if (draft.status === "inactive" && before.status === "active") return { ok: false, errors: ["Use Deactivate so affected users are reviewed first"], warnings: [] };
    commit(withAudit({ ...state, organisations: state.organisations.map((o) => (o.id === id ? { ...o, ...draft } : o)) }, { actorUserId: actorId, action: "organisation.changed", targetType: "organisation", targetId: id, targetLabel: draft.name, previous: changed.map((k) => `${k}: ${JSON.stringify(before[k])}`).join("; ") || null, next: changed.map((k) => `${k}: ${JSON.stringify(draft[k])}`).join("; ") || "No change", reason: "" }));
    return { ok: true, errors: [], warnings: [], id };
  }
  const newId = nextId("ORG-", state.organisations.map((o) => o.id));
  commit(withAudit({ ...state, organisations: [...state.organisations, { id: newId, ...draft, createdAt: stamp(), createdBy: actorId }] }, { actorUserId: actorId, action: "organisation.created", targetType: "organisation", targetId: newId, targetLabel: draft.name, previous: null, next: `${draft.status} · ${draft.type}`, reason: "" }));
  return { ok: true, errors: [], warnings: ["The organisation has no users or access until users are invited and roles assigned"], id: newId };
}

export function organisationImpact(s: AccessState, orgId: string) {
  const members = s.memberships.filter((m) => m.orgId === orgId && m.status === "active");
  const users = members.map((m) => s.users.find((u) => u.id === m.userId)).filter(Boolean) as User[];
  const assignments = s.assignments.filter((a) => members.some((m) => m.id === a.membershipId) && ["active", "pending"].includes(a.status));
  return { users, assignments };
}

export function setOrganisationStatus(actorId: string, orgId: string, status: "active" | "inactive", reason: string): PolicyResult {
  const org = orgById(state, orgId);
  const r = canManageOrganisations(state, actorId);
  const errors = [...r.errors];
  if (!reason.trim()) errors.push("Give a reason");
  if (status === "inactive") {
    const simulated: AccessState = { ...state, organisations: state.organisations.map((o) => (o.id === orgId ? { ...o, status: "inactive" as const } : o)) };
    if (!remainingSuperAdmins(simulated, {}).length) errors.push("Deactivating this organisation would leave no active Evolve Super Admin");
    if (state.memberships.some((m) => m.userId === actorId && m.orgId === orgId && m.status === "active")) errors.push("You cannot deactivate an organisation you belong to");
  }
  if (errors.length) return blocked(actorId, "organisation", orgId, org?.name ?? orgId, status === "inactive" ? "Deactivate organisation" : "Reactivate organisation", { ok: false, errors, warnings: [] });
  const impact = organisationImpact(state, orgId);
  commit(withAudit({ ...state, organisations: state.organisations.map((o) => (o.id === orgId ? { ...o, status } : o)) }, { actorUserId: actorId, action: status === "inactive" ? "organisation.deactivated" : "organisation.changed", targetType: "organisation", targetId: orgId, targetLabel: org!.name, previous: org!.status, next: status === "inactive" ? `Inactive · ${impact.users.length} users and ${impact.assignments.length} assignments no longer effective` : "Active", reason }));
  return { ok: true, errors: [], warnings: [] };
}

/* =====================================================================
   Roles
   ===================================================================== */

export type RoleDraft = Pick<Role, "name" | "code" | "description" | "category" | "orgApplicability" | "status" | "permissions" | "scopeCeiling" | "legacyNames"> & { clonedFrom?: string };

export function roleImpact(s: AccessState, roleId: string) {
  const live = s.assignments.filter((a) => a.roleId === roleId && ["active", "pending", "suspended"].includes(a.status));
  return { assignments: live, users: Array.from(new Set(live.map((a) => a.userId))) };
}

export function saveRole(actorId: string, draft: RoleDraft, id: string | undefined, reason: string): PolicyResult & { id?: string } {
  const existing = id ? roleById(state, id) : undefined;
  const r = canManageRoles(state, actorId, existing);
  const errors = [...r.errors];
  if (!draft.name.trim()) errors.push("Role name is required");
  if (!/^[A-Z0-9_]{3,40}$/.test(draft.code)) errors.push("Role code must be 3–40 capital letters, digits or _");
  if (state.roles.some((x) => x.code === draft.code && x.id !== id)) errors.push("Another role already uses this code");
  if (state.roles.some((x) => x.name.toLowerCase() === draft.name.trim().toLowerCase() && x.id !== id)) errors.push("Another role already uses this name");
  if (!draft.permissions.length) errors.push("Select at least one permission");
  if (existing && (existing.system || existing.protected) && !reason.trim()) errors.push("Changes to system roles need a reason");
  if (existing?.id === ROLE.SUPER_ADMIN && draft.status !== "active") errors.push("The Evolve Super Admin role cannot be deactivated");
  if (draft.category !== "operational" && draft.permissions.some((k) => ["approve", "reject", "return"].includes(parseKey(k).action))) errors.push("Approval actions (Approve, Reject, Return) belong to the Checker operational profile, not to business or platform roles");
  if (errors.length) return blocked(actorId, "role", id ?? "NEW", draft.name, id ? "Change role" : "Create role", { ok: false, errors, warnings: [] });

  if (existing) {
    const added = draft.permissions.filter((k) => !existing.permissions.includes(k));
    const removed = existing.permissions.filter((k) => !draft.permissions.includes(k));
    const impact = roleImpact(state, existing.id);
    commit(
      withAudit(
        { ...state, roles: state.roles.map((x) => (x.id === id ? { ...x, ...draft, updatedAt: stamp(), updatedBy: actorId } : x)) },
        { actorUserId: actorId, action: "role_template.changed", targetType: "role", targetId: existing.id, targetLabel: draft.name, previous: `${existing.permissions.length} permissions · ${existing.status}${removed.length ? ` · removed: ${removed.join(", ")}` : ""}`, next: `${draft.permissions.length} permissions · ${draft.status}${added.length ? ` · added: ${added.join(", ")}` : ""} · affects ${impact.users.length} user(s)`, reason: reason || "Role update" },
      ),
    );
    return { ok: true, errors: [], warnings: [], id };
  }
  const newId = nextId("ROLE-", state.roles.map((x) => x.id));
  const role: Role = { id: newId, ...draft, name: draft.name.trim(), system: false, protected: false, updatedAt: stamp(), updatedBy: actorId };
  commit(withAudit({ ...state, roles: [...state.roles, role] }, { actorUserId: actorId, action: draft.clonedFrom ? "role_template.cloned" : "role_template.created", targetType: "role", targetId: newId, targetLabel: role.name, previous: draft.clonedFrom ? `Cloned from ${roleById(state, draft.clonedFrom)?.name}` : null, next: `${role.permissions.length} permissions · ${role.category}`, reason: reason || "New custom role" }));
  return { ok: true, errors: [], warnings: [], id: newId };
}

/* =====================================================================
   Maker nominations
   ===================================================================== */

export type NominationDraft = Pick<MakerNomination, "candidate" | "modules" | "scope" | "startDate" | "endDate" | "justification">;

export function validateNomination(s: AccessState, d: NominationDraft): string[] {
  const errors: string[] = [];
  if (!d.candidate.name.trim()) errors.push("Candidate name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.candidate.email)) errors.push("Enter a valid business email");
  if (d.candidate.mobile && d.candidate.mobile.replace(/\D/g, "").length < 10) errors.push("Enter a 10-digit mobile number");
  const org = orgById(s, d.candidate.orgId);
  if (!org || org.status !== "active") errors.push("Choose an active organisation");
  if (!d.modules.length) errors.push("Choose at least one module");
  if (d.scope.programmes !== "all" && !d.scope.programmes.length) errors.push("Choose at least one programme");
  if (!d.justification.trim()) errors.push("Business justification is required");
  if (d.endDate && d.endDate < d.startDate) errors.push("End date is before start date");
  return errors;
}

export function saveNomination(actorId: string, d: NominationDraft, submit: boolean, id?: string): PolicyResult & { id?: string } {
  const r = canNominate(state, actorId);
  const errors = [...r.errors, ...(submit ? validateNomination(state, d) : d.candidate.name.trim() ? [] : ["Candidate name is required"])];
  const existing = id ? state.nominations.find((n) => n.id === id) : undefined;
  if (existing && !["draft", "returned"].includes(existing.status)) errors.push("Only draft or returned nominations can be edited");
  const dupUser = findDuplicates(state, d.candidate.email, d.candidate.mobile)[0];
  if (dupUser && d.candidate.existingUserId !== dupUser.id) d = { ...d, candidate: { ...d.candidate, existingUserId: dupUser.id } };
  const warnings: string[] = [];
  if (dupUser) warnings.push(`Matched existing user ${fullName(dupUser)} (${dupUser.id}); provisioning will update this account instead of creating a new one`);
  if (dupUser && dupUser.accountStatus === "deactivated") errors.push(`${fullName(dupUser)} is deactivated. Reactivate the account before nominating`);
  if (errors.length) return blocked(actorId, "nomination", id ?? "NEW", d.candidate.name, submit ? "Submit Maker nomination" : "Save Maker nomination", { ok: false, errors, warnings });
  const status = submit ? ("submitted" as const) : ("draft" as const);
  if (existing) {
    const updated: MakerNomination = { ...existing, ...d, status, submittedAt: submit ? stamp() : existing.submittedAt, review: submit ? null : existing.review, history: submit ? [...existing.history, { at: stamp(), by: actorId, status, remarks: existing.status === "returned" ? "Resubmitted after clarification" : "" }] : existing.history };
    commit(withAudit({ ...state, nominations: state.nominations.map((n) => (n.id === id ? updated : n)) }, ...(submit ? [{ actorUserId: actorId, action: "maker.nominated" as const, targetType: "nomination" as const, targetId: existing.id, targetLabel: `${existing.ref} · ${d.candidate.name}`, previous: existing.status, next: "Submitted", reason: d.justification }] : [])));
    return { ok: true, errors: [], warnings, id };
  }
  const newId = nextId("NOM-", state.nominations.map((n) => n.id));
  const ref = `MAN-2026-${newId.slice(4)}`;
  const nom: MakerNomination = { id: newId, ref, ...d, profile: "maker", nominatedBy: actorId, submittedAt: submit ? stamp() : null, status, review: null, provisioned: null, history: submit ? [{ at: stamp(), by: actorId, status, remarks: "" }] : [] };
  commit(submit ? withAudit({ ...state, nominations: [...state.nominations, nom] }, { actorUserId: actorId, action: "maker.nominated", targetType: "nomination", targetId: newId, targetLabel: `${ref} · ${d.candidate.name}`, previous: null, next: "Submitted (not an access grant)", reason: d.justification }) : { ...state, nominations: [...state.nominations, nom] });
  return { ok: true, errors: [], warnings, id: newId };
}

export function startNominationReview(actorId: string, id: string): PolicyResult {
  const n = state.nominations.find((x) => x.id === id);
  const r = canReviewNominations(state, actorId);
  if (!n) return { ok: false, errors: ["Nomination not found"], warnings: [] };
  if (!r.ok) return r;
  if (n.status !== "submitted") return { ok: true, errors: [], warnings: [] };
  commit({ ...state, nominations: state.nominations.map((x) => (x.id === id ? { ...x, status: "under_review" as const, history: [...x.history, { at: stamp(), by: actorId, status: "under_review" as const, remarks: "Review started" }] } : x)) });
  return { ok: true, errors: [], warnings: [] };
}

export function decideNomination(actorId: string, id: string, decision: "approved" | "rejected" | "returned", remarks: string, adjusted?: Pick<MakerNomination, "modules" | "scope" | "endDate">): PolicyResult {
  const n = state.nominations.find((x) => x.id === id);
  const r = canReviewNominations(state, actorId);
  const errors = [...r.errors];
  if (!n) return { ok: false, errors: ["Nomination not found"], warnings: [] };
  if (!["submitted", "under_review"].includes(n.status)) errors.push("Only submitted nominations can be decided");
  if (n.nominatedBy === actorId) errors.push("You cannot review a nomination you raised");
  if (n.candidate.existingUserId === actorId) errors.push("You cannot review a nomination for yourself");
  if (decision !== "approved" && !remarks.trim()) errors.push(decision === "rejected" ? "A reason is mandatory when rejecting" : "Say what needs clarification");
  if (decision === "approved" && adjusted && !adjusted.modules.length) errors.push("Approve at least one module");
  if (errors.length) return blocked(actorId, "nomination", id, `${n.ref} · ${n.candidate.name}`, `Nomination decision: ${decision}`, { ok: false, errors, warnings: [] });
  const updated: MakerNomination = { ...n, ...(adjusted ?? {}), status: decision, review: { by: actorId, at: stamp(), decision, remarks }, history: [...n.history, { at: stamp(), by: actorId, status: decision, remarks }] };
  const action = decision === "approved" ? "maker.nomination_approved" : decision === "rejected" ? "maker.nomination_rejected" : "maker.nomination_returned";
  commit(withAudit({ ...state, nominations: state.nominations.map((x) => (x.id === id ? updated : x)) }, { actorUserId: actorId, action, targetType: "nomination", targetId: id, targetLabel: `${n.ref} · ${n.candidate.name}`, previous: `${n.status} · ${n.modules.join(", ")}`, next: `${decision}${adjusted ? ` · approved scope: ${adjusted.modules.join(", ")} · ${describeScope(adjusted.scope).programmes}` : ""}`, reason: remarks }));
  return { ok: true, errors: [], warnings: [] };
}

/**
 * Provisioning: links to the existing account (matched by ID, email or mobile) or creates an
 * invited account, then assigns the approved Maker profile with exactly the approved scope.
 */
export function provisionNomination(actorId: string, id: string): PolicyResult & { userId?: string; accessRef?: string } {
  const n = state.nominations.find((x) => x.id === id);
  if (!n) return { ok: false, errors: ["Nomination not found"], warnings: [] };
  const errors = [...canReviewNominations(state, actorId).errors];
  if (n.status !== "approved") errors.push("Only approved nominations can be provisioned");
  if (errors.length) return blocked(actorId, "nomination", id, n.ref, "Provision Maker access", { ok: false, errors, warnings: [] });

  let working = state;
  let userId = n.candidate.existingUserId ?? findDuplicates(state, n.candidate.email, n.candidate.mobile)[0]?.id ?? null;
  const events: Parameters<typeof audit>[1][] = [];
  const [firstName, ...rest] = n.candidate.name.trim().split(" ");
  if (!userId) {
    const p = previewNewUser(working, { identity: { firstName, lastName: rest.join(" "), email: n.candidate.email, mobile: n.candidate.mobile, employeeId: null, designation: n.candidate.designation, department: n.candidate.department, reportingManagerId: null }, orgId: n.candidate.orgId, businessUnit: null, authMethod: "mock", assignments: [] });
    p.user.createdBy = actorId;
    working = { ...working, users: [...working.users, p.user], memberships: [...working.memberships, p.membership] };
    userId = p.userId;
    events.push({ actorUserId: actorId, action: "user.created", targetType: "user", targetId: userId, targetLabel: n.candidate.name, previous: null, next: `Invited · created from ${n.ref}`, reason: "Maker provisioning" });
  } else if (!working.memberships.some((m) => m.userId === userId && m.orgId === n.candidate.orgId && m.status === "active")) {
    const memId = nextId("MEM-", working.memberships.map((m) => m.id));
    working = { ...working, memberships: [...working.memberships, { id: memId, userId, orgId: n.candidate.orgId, department: n.candidate.department, designation: n.candidate.designation, businessUnit: null, status: "active", since: TODAY }] };
    events.push({ actorUserId: actorId, action: "membership.added", targetType: "user", targetId: userId, targetLabel: n.candidate.name, previous: null, next: `${orgById(working, n.candidate.orgId)?.name}`, reason: `Required for ${n.ref}` });
  }
  const membershipId = working.memberships.find((m) => m.userId === userId && m.orgId === n.candidate.orgId && m.status === "active")!.id;
  const draft: AssignmentDraft = { userId, membershipId, roleId: ROLE.MAKER, moduleLimit: n.modules, scope: n.scope, validFrom: n.startDate < TODAY ? TODAY : n.startDate, validTo: n.endDate };
  const check = canAssignRole(working, actorId, draft);
  if (!check.ok) return blocked(actorId, "nomination", id, n.ref, "Provision Maker access", check);

  const target = working.users.find((u) => u.id === userId)!;
  const asgId = nextId("ASG-", working.assignments.map((a) => a.id));
  const ref = accessRef();
  const asg: RoleAssignment = { id: asgId, ...draft, status: target.accountStatus === "active" && draft.validFrom <= TODAY ? "active" : "pending", assignedBy: actorId, assignedAt: stamp(), reason: `Provisioned from nomination ${n.ref}`, source: "nomination", nominationId: n.id, accessRef: ref };
  const nominations = working.nominations.map((x) => (x.id === id ? { ...x, status: "provisioned" as const, provisioned: { userId: userId!, assignmentId: asgId, accessRef: ref, at: stamp() }, candidate: { ...x.candidate, existingUserId: userId }, history: [...x.history, { at: stamp(), by: actorId, status: "provisioned" as const, remarks: n.candidate.existingUserId ? "Linked to existing user" : "New invited account" }] } : x));
  events.push({ actorUserId: actorId, action: "maker.provisioned", targetType: "user", targetId: userId, targetLabel: n.candidate.name, previous: null, next: `${describeAssignment(working, asg)} · ${asg.status} · ${ref}`, reason: `From ${n.ref}` });
  commit(withAudit({ ...working, assignments: [...working.assignments, asg], nominations }, ...events));
  return { ok: true, errors: [], warnings: check.warnings, userId, accessRef: ref };
}

/* =====================================================================
   Mock scheduler
   ===================================================================== */

/** Marks assignments, direct grants and provisioned nominations whose end date has passed as expired. */
export function runExpirySweep(): { expired: number } {
  const due = state.assignments.filter((a) => a.status === "active" && a.validTo && a.validTo < TODAY);
  const dueGrants = state.directGrants.filter((g) => g.status === "active" && g.validTo && g.validTo < TODAY);
  if (!due.length && !dueGrants.length) return { expired: 0 };
  const next: AccessState = {
    ...state,
    assignments: state.assignments.map((a) => (due.includes(a) ? { ...a, status: "expired" as const } : a)),
    directGrants: state.directGrants.map((g) => (dueGrants.includes(g) ? { ...g, status: "expired" as const } : g)),
  };
  commit(withAudit(next, ...due.map((a) => ({ actorUserId: "SYSTEM", action: "role.expired" as const, targetType: "user" as const, targetId: a.userId, targetLabel: label(state, a.userId), previous: `${describeAssignment(state, a)} · active`, next: "Expired", reason: `End date ${a.validTo} reached (mock expiry check)` })), ...dueGrants.map((g) => ({ actorUserId: "SYSTEM", action: "permission.removed" as const, targetType: "user" as const, targetId: g.userId, targetLabel: label(state, g.userId), previous: g.permissions.join(", "), next: "Expired", reason: `End date ${g.validTo} reached (mock expiry check)` }))));
  return { expired: due.length + dueGrants.length };
}

export function pendingExpiries(s: AccessState) {
  return s.assignments.filter((a) => a.status === "active" && a.validTo && a.validTo < TODAY).length + s.directGrants.filter((g) => g.status === "active" && g.validTo && g.validTo < TODAY).length;
}
