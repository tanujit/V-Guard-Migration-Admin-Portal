/**
 * Identity & access model (Phase 2).
 *
 * The dimensions below are deliberately independent:
 *   User · Organisation (membership) · Role (assignment) · Operational profile (Maker/Checker)
 *   · Module/action permissions · Programme scope · Geographical scope · Status
 * Nothing is inferred from another dimension: organisation never implies a role, a role never
 * implies Maker/Checker, and no assignment implies unrestricted programme or geography scope.
 * All IDs are stable identifiers; display names are never used as keys.
 */
import type { ProgrammeCode } from "./domain";

/* ---------------- Catalogue ---------------- */

export type ModuleId = string;

export type ActionId =
  | "view"
  | "create"
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "return"
  | "disable"
  | "export"
  | "execute"
  | "manage"
  | "assign_access"
  | "view_sensitive"
  | "hold"
  | "reset_credentials"
  | "override"
  | "download"
  | "activate"
  | "close"
  | "view_financial"
  | "configure_formula"
  | "cancel"
  | "recover"
  | "publish";

/** `${moduleId}:${actionId}` — the unit of permission. */
export type PermissionKey = string;

export type ModuleCategory = "overview" | "operations" | "masters" | "governance" | "intelligence";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  category: ModuleCategory;
  /** Actions that make sense for this module. Others cannot be granted. */
  actions: ActionId[];
  description: string;
}

export interface ActionDef {
  id: ActionId;
  label: string;
  /** Part of the original SOW permission vocabulary (View, Create, Edit, Approve, Disable). */
  sow: boolean;
  /** Restricted actions are highlighted in the matrix and need explicit intent to grant. */
  restricted: boolean;
  description: string;
}

/* ---------------- Organisations ---------------- */

export type OrgTypeId = "platform_owner" | "client" | "external_partner" | "other";

export interface Organisation {
  id: string;
  code: string;
  name: string;
  type: OrgTypeId;
  description: string;
  primaryContact: { name: string; email: string };
  status: "active" | "inactive";
  parentId: string | null;
  createdAt: string;
  createdBy: string;
}

/* ---------------- Roles ---------------- */

/** Platform roles administer the portal; business roles describe responsibilities; operational profiles are Maker/Checker. */
export type RoleCategory = "platform" | "business" | "operational";

/** Broadest geography a role may be scoped to. "all" = any; "branch" = must be limited to branches. */
export type GeoCeiling = "all" | "state" | "district" | "branch";

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  category: RoleCategory;
  /** Organisation IDs that may hold this role, or "any". */
  orgApplicability: string[] | "any";
  /** Seeded template shipped with the platform (can still be configured by authorised admins). */
  system: boolean;
  /** Protected roles need the platform-administration permission to change or assign. */
  protected: boolean;
  status: "active" | "inactive";
  permissions: PermissionKey[];
  scopeCeiling: { programmes: "all" | ProgrammeCode[]; geography: GeoCeiling };
  /** Legacy SOW role names mapped to this role for migration/compatibility. */
  legacyNames: string[];
  updatedAt: string;
  updatedBy: string;
  clonedFrom?: string;
}

/* ---------------- Scope ---------------- */

export type GeographyScope =
  | { mode: "all" }
  | { mode: "selected"; states: string[]; districts: string[]; branches: string[] };

export interface AccessScope {
  /** "all" means all programmes within the granting administrator's authority at the time of grant. */
  programmes: "all" | ProgrammeCode[];
  geography: GeographyScope;
}

/* ---------------- Users ---------------- */

export type AccountStatus = "invited" | "pending_activation" | "active" | "suspended" | "locked" | "deactivated";

export type AssignmentStatus = "pending" | "active" | "expired" | "revoked" | "suspended";

export type AuthMethod = "mock" | "sso_saml" | "email_otp";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  employeeId: string | null;
  designation: string;
  department: string;
  reportingManagerId: string | null;
  accountStatus: AccountStatus;
  authMethod: AuthMethod;
  createdAt: string;
  createdBy: string;
  lastLoginAt: string | null;
  invitation: { ref: string; sentAt: string; status: "pending" | "accepted" | "expired" } | null;
  security: {
    failedLogins: number;
    lastCredentialReset: string | null;
    mfa: "not_supported_yet" | "enrolled" | "not_enrolled";
    lockHistory: { at: string; reason: string }[];
  };
}

export interface OrgMembership {
  id: string;
  userId: string;
  orgId: string;
  department: string;
  businessUnit: string | null;
  designation: string;
  status: "active" | "inactive";
  since: string;
}

/**
 * One grant of a role to a user, within one organisation membership, with its own scope and validity.
 * Operational profiles (Maker/Checker) are role assignments of an operational role, limited to modules.
 */
export interface RoleAssignment {
  id: string;
  userId: string;
  membershipId: string;
  roleId: string;
  /** Operational profiles only: modules this Maker/Checker assignment covers. */
  moduleLimit: ModuleId[] | null;
  scope: AccessScope;
  status: AssignmentStatus;
  validFrom: string;
  validTo: string | null;
  assignedBy: string;
  assignedAt: string;
  reason: string;
  source: "direct" | "nomination" | "seed";
  nominationId?: string;
  accessRef: string;
}

/** A permission granted to a user directly (outside any role). Kept rare and always scoped. */
export interface DirectGrant {
  id: string;
  userId: string;
  membershipId: string;
  permissions: PermissionKey[];
  scope: AccessScope;
  status: AssignmentStatus;
  validFrom: string;
  validTo: string | null;
  assignedBy: string;
  assignedAt: string;
  reason: string;
  accessRef: string;
}

/* ---------------- Maker nominations ---------------- */

export type NominationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "returned"
  | "provisioned"
  | "revoked"
  | "expired";

export interface MakerNomination {
  id: string;
  ref: string;
  candidate: {
    name: string;
    email: string;
    mobile: string;
    orgId: string;
    designation: string;
    department: string;
    existingUserId: string | null;
  };
  profile: "maker";
  modules: ModuleId[];
  scope: AccessScope;
  startDate: string;
  endDate: string | null;
  justification: string;
  nominatedBy: string;
  submittedAt: string | null;
  status: NominationStatus;
  review: { by: string; at: string; decision: "approved" | "rejected" | "returned"; remarks: string } | null;
  provisioned: { userId: string; assignmentId: string; accessRef: string; at: string } | null;
  history: { at: string; by: string; status: NominationStatus; remarks: string }[];
}

/* ---------------- Audit ---------------- */

export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.invited"
  | "user.suspended"
  | "user.reactivated"
  | "user.deactivated"
  | "user.access_revoked"
  | "user.credential_reset_requested"
  | "membership.added"
  | "membership.changed"
  | "role.assigned"
  | "role.removed"
  | "role.expired"
  | "permission.added"
  | "permission.removed"
  | "scope.programme_changed"
  | "scope.geography_changed"
  | "maker.nominated"
  | "maker.nomination_returned"
  | "maker.nomination_approved"
  | "maker.nomination_rejected"
  | "maker.provisioned"
  | "checker.assigned"
  | "checker.revoked"
  | "role_template.created"
  | "role_template.changed"
  | "role_template.cloned"
  | "organisation.created"
  | "organisation.changed"
  | "organisation.deactivated"
  | "admin.override"
  | "access.denied";

export interface AuditEvent {
  id: string;
  at: string;
  actorUserId: string;
  actorOrgId: string | null;
  targetType: "user" | "organisation" | "role" | "nomination" | "assignment";
  targetId: string;
  targetLabel: string;
  action: AuditAction;
  module: ModuleId;
  previous: string | null;
  next: string | null;
  reason: string;
  ref: string;
  status: "success" | "blocked";
}
