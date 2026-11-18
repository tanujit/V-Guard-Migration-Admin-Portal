/**
 * Identity & access API contract — PLACEHOLDER for backend integration.
 *
 * Screens call the mock implementation (features/access/store.ts). When the backend exists,
 * implement `httpAccessApi` against the agreed endpoints; none are defined here because none have
 * been agreed. The backend MUST enforce the same policy as features/access/engine.ts — the
 * frontend checks are for usability, not security.
 */
import * as store from "@/features/access/store";
import type { AccessScope, AuditEvent, MakerNomination, Organisation, PermissionKey, Role, User } from "@/types/rbac";
import type { AssignmentDraft, PolicyResult } from "@/features/access/engine";
import { ApiNotConnectedError } from "./api";

export interface AccessAdminApi {
  listUsers(): Promise<User[]>;
  createUser(actorId: string, input: store.NewUserInput): Promise<PolicyResult & { userId?: string; inviteRef?: string }>;
  updateUser(actorId: string, userId: string, patch: Partial<User>): Promise<PolicyResult>;
  assignRole(actorId: string, draft: AssignmentDraft, reason: string): Promise<PolicyResult>;
  revokeAssignment(actorId: string, assignmentId: string, reason: string): Promise<PolicyResult>;
  changeAssignmentScope(actorId: string, assignmentId: string, scope: AccessScope, validTo: string | null, reason: string): Promise<PolicyResult>;
  addDirectGrant(actorId: string, userId: string, membershipId: string, permissions: PermissionKey[], scope: AccessScope, validTo: string | null, reason: string): Promise<PolicyResult>;
  suspendUser(actorId: string, userId: string, reason: string): Promise<PolicyResult>;
  reactivateUser(actorId: string, userId: string, reason: string, effectiveDate: string, restore: string[]): Promise<PolicyResult>;
  listOrganisations(): Promise<Organisation[]>;
  saveOrganisation(actorId: string, draft: store.OrgDraft, id?: string): Promise<PolicyResult>;
  listRoles(): Promise<Role[]>;
  saveRole(actorId: string, draft: store.RoleDraft, id: string | undefined, reason: string): Promise<PolicyResult>;
  listNominations(): Promise<MakerNomination[]>;
  saveNomination(actorId: string, draft: store.NominationDraft, submit: boolean, id?: string): Promise<PolicyResult>;
  decideNomination(actorId: string, id: string, decision: "approved" | "rejected" | "returned", remarks: string): Promise<PolicyResult>;
  provisionNomination(actorId: string, id: string): Promise<PolicyResult>;
  listAuditEvents(filter?: { targetId?: string }): Promise<AuditEvent[]>;
}

const s = () => store.accessStore.get();

/** Mock implementation backed by the in-browser store. */
export const mockAccessApi: AccessAdminApi = {
  listUsers: async () => s().users,
  createUser: async (a, i) => store.createUser(a, i),
  updateUser: async (a, id, p) => store.updateUser(a, id, p),
  assignRole: async (a, d, r) => store.assignRole(a, d, r),
  revokeAssignment: async (a, id, r) => store.revokeAssignment(a, id, r),
  changeAssignmentScope: async (a, id, sc, to, r) => store.changeAssignmentScope(a, id, sc, to, r),
  addDirectGrant: async (a, u, m, p, sc, to, r) => store.addDirectGrant(a, u, m, p, sc, to, r),
  suspendUser: async (a, u, r) => store.suspendUser(a, u, r),
  reactivateUser: async (a, u, r, d, x) => store.reactivateUser(a, u, r, d, x),
  listOrganisations: async () => s().organisations,
  saveOrganisation: async (a, d, id) => store.saveOrganisation(a, d, id),
  listRoles: async () => s().roles,
  saveRole: async (a, d, id, r) => store.saveRole(a, d, id, r),
  listNominations: async () => s().nominations,
  saveNomination: async (a, d, sub, id) => store.saveNomination(a, d, sub, id),
  decideNomination: async (a, id, d, r) => store.decideNomination(a, id, d, r),
  provisionNomination: async (a, id) => store.provisionNomination(a, id),
  listAuditEvents: async (f) => (f?.targetId ? s().audit.filter((e) => e.targetId === f.targetId) : s().audit),
};

const nc = (op: string) => async (): Promise<never> => {
  throw new ApiNotConnectedError(op);
};

/** Future HTTP implementation: one method per operation so endpoints can be agreed one by one. */
export const httpAccessApi: AccessAdminApi = {
  listUsers: nc("access.listUsers"),
  createUser: nc("access.createUser"),
  updateUser: nc("access.updateUser"),
  assignRole: nc("access.assignRole"),
  revokeAssignment: nc("access.revokeAssignment"),
  changeAssignmentScope: nc("access.changeAssignmentScope"),
  addDirectGrant: nc("access.addDirectGrant"),
  suspendUser: nc("access.suspendUser"),
  reactivateUser: nc("access.reactivateUser"),
  listOrganisations: nc("access.listOrganisations"),
  saveOrganisation: nc("access.saveOrganisation"),
  listRoles: nc("access.listRoles"),
  saveRole: nc("access.saveRole"),
  listNominations: nc("access.listNominations"),
  saveNomination: nc("access.saveNomination"),
  decideNomination: nc("access.decideNomination"),
  provisionNomination: nc("access.provisionNomination"),
  listAuditEvents: nc("access.listAuditEvents"),
};
