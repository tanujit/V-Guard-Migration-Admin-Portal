/**
 * Member, registration and KYC API contract — PLACEHOLDER for backend integration.
 *
 * Screens call the in-browser store (features/members/store.ts). No endpoints are defined because
 * none have been agreed. Aadhaar/DigiLocker/UIDAI, PAN (Signzy/NSDL or SFDC, OP-17), Signzy bank
 * verification, OTP, SMS/email and SFDC are NOT connected; the backend must own those calls,
 * enforce the same RBAC/scope rules and never return full identifiers or credentials.
 */
import * as store from "@/features/members/store";
import { requirementOf } from "@/config/memberProgrammes";
import type { PolicyResult } from "@/features/access/engine";
import type { KycDocument, Member, MemberEvent, ProgrammeCode, RestrictionType } from "@/types/members";
import { ApiNotConnectedError } from "./api";

export interface MemberApi {
  getMembers(): Promise<Member[]>;
  getMember360(id: string): Promise<Member | undefined>;
  createAssistedEPRegistration(actorId: string, input: store.AssistedInput): Promise<PolicyResult>;
  submitRegistrationDecision(actorId: string, memberId: string, decision: "approve" | "reject", remarks: string): Promise<PolicyResult>;
  getKycQueue(): Promise<KycDocument[]>;
  approveKycDocument(actorId: string, docId: string, remarks: string): Promise<PolicyResult>;
  rejectKycDocument(actorId: string, docId: string, reasonCode: string, remarks: string): Promise<PolicyResult>;
  requestDocumentReupload(actorId: string, docId: string, reasonCode: string, remarks: string): Promise<PolicyResult>;
  updateMemberProfile(actorId: string, memberId: string, patch: store.ProfilePatch, reason: string): Promise<PolicyResult>;
  requestVerifiedFieldOverride(actorId: string, memberId: string, field: "name" | "dob" | "homeAddress", proposed: string, justification: string): Promise<PolicyResult>;
  requestMobileChange(actorId: string, memberId: string, ticketRef: string, newMobile: string): Promise<PolicyResult>;
  applyRestriction(actorId: string, memberId: string, type: RestrictionType, reasonCode: string, remarks: string): Promise<PolicyResult>;
  submitReinstatementRequest(actorId: string, restrictionId: string, reason: string, evidence: string): Promise<PolicyResult>;
  triggerMpinReset(actorId: string, memberId: string, reason: string): Promise<PolicyResult>;
  getMemberActivityHistory(memberId: string): Promise<MemberEvent[]>;
  getProgrammeKycRequirements(programme: ProgrammeCode): ReturnType<typeof requirementOf>;
}

const s = () => store.memberStore.get();
export const mockMemberApi: MemberApi = {
  getMembers: async () => s().members,
  getMember360: async (id) => s().members.find((m) => m.id === id),
  createAssistedEPRegistration: async (a, i) => store.createAssistedEPRegistration(a, i),
  submitRegistrationDecision: async (a, id, d, r) => store.submitRegistrationDecision(a, id, d, r),
  getKycQueue: async () => s().documents.filter((d) => ["pending", "under_review"].includes(d.status)),
  approveKycDocument: async (a, id, r) => store.reviewDocument(a, id, "approve", "", r),
  rejectKycDocument: async (a, id, c, r) => store.reviewDocument(a, id, "reject", c, r),
  requestDocumentReupload: async (a, id, c, r) => store.reviewDocument(a, id, "reupload", c, r),
  updateMemberProfile: async (a, id, p, r) => store.updateMemberProfile(a, id, p, r),
  requestVerifiedFieldOverride: async (a, id, f, v, j) => store.requestVerifiedFieldOverride(a, id, f, v, j),
  requestMobileChange: async (a, id, t, n) => store.requestMobileChange(a, id, t, n),
  applyRestriction: async (a, id, t, c, r) => store.applyRestriction(a, id, t, c, r),
  submitReinstatementRequest: async (a, id, r, e) => store.submitReinstatementRequest(a, id, r, e),
  triggerMpinReset: async (a, id, r) => store.triggerMpinReset(a, id, r),
  getMemberActivityHistory: async (id) => s().events.filter((e) => e.memberId === id),
  getProgrammeKycRequirements: requirementOf,
};

const nc = (op: string) => async (): Promise<never> => {
  throw new ApiNotConnectedError(op);
};
export const httpMemberApi: MemberApi = {
  getMembers: nc("members.getMembers"),
  getMember360: nc("members.getMember360"),
  createAssistedEPRegistration: nc("members.createAssistedEPRegistration"),
  submitRegistrationDecision: nc("members.submitRegistrationDecision"),
  getKycQueue: nc("members.getKycQueue"),
  approveKycDocument: nc("members.approveKycDocument"),
  rejectKycDocument: nc("members.rejectKycDocument"),
  requestDocumentReupload: nc("members.requestDocumentReupload"),
  updateMemberProfile: nc("members.updateMemberProfile"),
  requestVerifiedFieldOverride: nc("members.requestVerifiedFieldOverride"),
  requestMobileChange: nc("members.requestMobileChange"),
  applyRestriction: nc("members.applyRestriction"),
  submitReinstatementRequest: nc("members.submitReinstatementRequest"),
  triggerMpinReset: nc("members.triggerMpinReset"),
  getMemberActivityHistory: nc("members.getMemberActivityHistory"),
  getProgrammeKycRequirements: requirementOf,
};
