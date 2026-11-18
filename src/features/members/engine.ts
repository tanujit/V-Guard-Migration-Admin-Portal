/**
 * MEMBER ENGINE — pure functions for eligibility, KYC completeness, restrictions, scope and
 * masking. Programme rules come from config/memberProgrammes.ts; nothing is hardcoded per screen.
 */
import { requirementOf } from "@/config/memberProgrammes";
import { findBranch } from "@/config/geography";
import { getEffectiveAccess, hasPermission, primaryOrg, type AccessState } from "@/features/access/engine";
import { ORG, ROLE } from "@/data/mock/rbacSeed";
import type { ActionId } from "@/types/rbac";
import type { KycDocument, KycOverall, Member, MemberDecision, MemberEvent, MemberIdentity, MemberNotification, MobileChangeRequest, MpinReset, Restriction } from "@/types/members";

export interface MemberState {
  members: Member[];
  identities: MemberIdentity[];
  documents: KycDocument[];
  restrictions: Restriction[];
  events: MemberEvent[];
  notifications: MemberNotification[];
  mobileChanges: MobileChangeRequest[];
  mpinResets: MpinReset[];
  decisions: MemberDecision[];
}

export const memberById = (s: MemberState, id: string) => s.members.find((m) => m.id === id);
export const docsOf = (s: MemberState, memberId: string) => s.documents.filter((d) => d.memberId === memberId);
export const identityOf = (s: MemberState, m: Member) => s.identities.find((i) => i.id === m.identityId);
export const linkedMembers = (s: MemberState, m: Member) => s.members.filter((x) => x.identityId === m.identityId);
export const requirementFor = (m: Member, type: KycDocument["type"]) => requirementOf(m.programme).documents.find((d) => d.type === type);

export const geoOfMember = (m: Member) => {
  const b = findBranch(m.branchCode);
  return b ? { state: b.state.code, district: b.district.code, branch: b.branch.code } : {};
};
export const branchInfo = (m: Member) => findBranch(m.branchCode);

/** Programme + geography scoped permission check against Phase 2 RBAC. */
export const canOn = (acc: AccessState, uid: string, module: string, action: ActionId, m: Member) => hasPermission(acc, uid, module, action, { programme: m.programme, geo: geoOfMember(m) });

/* ---------------- Masking ---------------- */
/** Masks every digit except the leading one and the last four, whatever the stored format. */
export function maskMobile(mobile: string, reveal = false) {
  if (reveal) return mobile;
  const d = mobile.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d[0]}XXXX X${d.slice(-4)}` : "XXXXXXXXXX";
}

/* ---------------- Restrictions ---------------- */
export const activeRestrictions = (s: MemberState, m: Member) => s.restrictions.filter((r) => r.status !== "lifted" && r.memberIds.includes(m.id));
export const restrictionLabel = (s: MemberState, m: Member) => {
  const r = activeRestrictions(s, m);
  if (r.some((x) => x.type === "temporary_hold")) return "Temporary hold";
  if (r.some((x) => x.type === "program_block")) return "Program block";
  return "None";
};

/* ---------------- KYC completeness ---------------- */
export function kycOverall(s: MemberState, m: Member): KycOverall {
  const req = requirementOf(m.programme);
  const mandatory = req.documents.filter((d) => d.requirement === "mandatory").map((d) => docsOf(s, m.id).find((x) => x.type === d.type)).filter(Boolean) as KycDocument[];
  if (mandatory.some((d) => d.status === "rejected" || d.status === "verification_failed")) return "rejected";
  if (mandatory.some((d) => d.status === "reupload_required")) return "action_required";
  if (mandatory.length && mandatory.every((d) => d.status === "approved")) return "verified";
  if (mandatory.some((d) => d.status === "approved")) return "partially_verified";
  return "pending";
}

/** Mandatory redemption-stage documents still missing approval. */
export function redemptionGaps(s: MemberState, m: Member) {
  return requirementOf(m.programme).documents.filter((d) => d.requirement === "mandatory" && d.stage === "redemption").filter((d) => docsOf(s, m.id).find((x) => x.type === d.type)?.status !== "approved");
}

export interface Eligibility {
  allowed: boolean;
  reason: string;
}

export function scanEligibility(s: MemberState, m: Member): Eligibility {
  const r = activeRestrictions(s, m);
  if (r.some((x) => x.type === "temporary_hold")) return { allowed: false, reason: "Temporary hold across linked programmes" };
  if (r.some((x) => x.type === "program_block")) return { allowed: false, reason: `Program Block on ${m.programme}` };
  if (m.programme === "DD") {
    const off = m.dd?.schemeScan.filter((x) => !x.enabled) ?? [];
    return { allowed: true, reason: off.length ? `Allowed per scheme; disabled for ${off.map((x) => x.scheme).join(", ")}` : "Allowed per scheme" };
  }
  if (m.status === "provisioned") return { allowed: true, reason: "SFDC-provisioned and active" };
  if (["active_scan", "redemption_kyc_pending", "redemption_enabled"].includes(m.status)) return { allowed: true, reason: m.registration.source === "sr_assisted" ? "SR-assisted creation" : m.registration.source === "self" ? "Stage-1 approved" : "Invitation completed" };
  if (m.status === "rejected") return { allowed: false, reason: "Registration rejected" };
  return { allowed: false, reason: m.status === "invited" ? "Invitation not completed" : "Stage-1 approval pending" };
}

export function redemptionEligibility(s: MemberState, m: Member): Eligibility {
  const scan = scanEligibility(s, m);
  if (!scan.allowed && scan.reason !== "Invitation not completed") return { allowed: false, reason: scan.reason };
  if (m.programme === "Retailer") {
    const pan = docsOf(s, m.id).find((d) => d.type === "pan");
    if (pan?.status !== "approved") return { allowed: false, reason: "PAN not verified in SFDC" };
    if (m.retailer?.gstStatus !== "eligible") return { allowed: false, reason: `GST eligibility gate: ${m.retailer?.gstStatus.replace("_", " ")}` };
    return { allowed: true, reason: "PAN verified and GST gate passed" };
  }
  if (m.programme === "DD") return { allowed: false, reason: "Governed by DD earning rules in the Wallet module (not derived here)" };
  if (m.status === "redemption_enabled") return { allowed: true, reason: "Stage-2 complete" };
  const gaps = redemptionGaps(s, m);
  return { allowed: false, reason: gaps.length ? `Stage-2 pending: ${gaps.map((g) => g.type).join(", ")}` : "Stage-2 not completed" };
}

/* ---------------- Reviewer eligibility ---------------- */
const SR_PIC_ROLES: string[] = [ROLE.BRANCH_MANAGER, ROLE.SALES_REP, ROLE.REGIONAL_ADMIN];

/** Stage 1 (EP self-registration): a V-Guard SR/PIC with Approve on Registration & KYC for the member's programme and branch. */
export function canStage1(acc: AccessState, uid: string, m: Member): { ok: boolean; reason: string } {
  if (m.registration.source !== "self") return { ok: false, reason: "Only EP self-registrations have a Stage-1 SR/PIC approval" };
  if (!canOn(acc, uid, "registration-kyc", "approve", m).allowed) return { ok: false, reason: "You need Registration & KYC: Approve for this programme and branch" };
  const a = getEffectiveAccess(acc, uid);
  if (primaryOrg(acc, uid)?.id !== ORG.VGUARD || !a.sources.some((x) => x.effective && x.roleId && SR_PIC_ROLES.includes(x.roleId))) return { ok: false, reason: "Stage 1 is an SR/PIC decision: it needs a V-Guard Sales Rep, Branch Manager/PIC or Regional Admin role" };
  return { ok: true, reason: "" };
}

/** Stage 2 and document review: Evolve verification desk with Approve on Registration & KYC in scope. */
export function canReviewDocs(acc: AccessState, uid: string, m: Member, action: "approve" | "reject" | "return"): { ok: boolean; reason: string } {
  if (!canOn(acc, uid, "registration-kyc", action, m).allowed) return { ok: false, reason: `You need Registration & KYC: ${action === "return" ? "Return" : action[0].toUpperCase() + action.slice(1)} for this programme and branch` };
  if (requirementOf(m.programme).stage2Reviewer === "evolve" && primaryOrg(acc, uid)?.id !== ORG.EVOLVE) return { ok: false, reason: "Document-wise verification is performed by Evolve" };
  return { ok: true, reason: "" };
}

export function actorRole(acc: AccessState, uid: string) {
  if (uid === "SYSTEM") return "System";
  const a = getEffectiveAccess(acc, uid);
  return Array.from(new Set(a.sources.filter((x) => x.effective && x.roleId).map((x) => acc.roles.find((r) => r.id === x.roleId)?.name ?? ""))).join(", ") || "No active role";
}

export function ageingDays(from: string, now: string) {
  return Math.max(0, Math.floor((new Date(now).getTime() - new Date(from).getTime()) / 86400000));
}
