/**
 * Member, registration and KYC models (Phase 5).
 * Sensitive identifiers are never stored in full: Aadhaar, PAN, bank and UPI values exist only in
 * masked form. Stable internal IDs are used as keys; the display format is configurable (OP-14).
 */

export type ProgrammeCode = "EP" | "ST" | "CS" | "Retailer" | "DD";
export type RegistrationSource = "self" | "sr_assisted" | "sfdc_invite" | "sfdc_provisioned";

/** EP four-state journey; invite programmes reuse it; SFDC-provisioned programmes have their own. */
export type RegistrationStatus = "pending" | "active_scan" | "redemption_kyc_pending" | "redemption_enabled" | "rejected" | "invited" | "provisioned";

export type DocType = "aadhaar" | "pan" | "selfie" | "bank" | "upi" | "gst";
export type DocStatus = "not_submitted" | "pending" | "under_review" | "approved" | "rejected" | "reupload_required" | "verification_failed" | "not_applicable";
export type KycOverall = "pending" | "partially_verified" | "verified" | "rejected" | "action_required";

export interface Address {
  line: string;
  district: string;
  state: string;
  pincode: string;
  source: "aadhaar" | "member_app" | "sr_assisted" | "sfdc" | "staff";
  updatedAt: string;
  locked: boolean;
  verification: "verified" | "unverified" | "geo_validated" | "territory_mismatch" | "not_captured";
  lat?: number | null;
  lng?: number | null;
}

export interface AadhaarConsent {
  given: boolean;
  at: string | null;
  source: "member_app" | "sr_assisted" | "sfdc" | "not_captured";
  policyAcknowledged: boolean;
}

/** One KYC identity shared by every programme membership of the same person. */
export interface MemberIdentity {
  id: string;
  maskedAadhaar: string | null;
  consent: AadhaarConsent;
  memberIds: string[];
  accountClosedAt: string | null;
}

export interface DocEvent {
  at: string;
  by: string;
  action: string;
  status: DocStatus;
  remarks: string;
  ref: string;
}

export interface KycDocument {
  id: string;
  memberId: string;
  type: DocType;
  maskedId: string | null;
  status: DocStatus;
  submittedAt: string | null;
  method: string;
  source: string;
  response: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
  resubmissions: number;
  latestRef: string | null;
  exception: string | null;
  history: DocEvent[];
}

export interface StageDecision {
  decision: "approved" | "rejected" | "not_required" | "auto";
  by: string;
  at: string;
  remarks: string;
  ref: string;
}

export interface RegistrationRecord {
  ref: string;
  source: RegistrationSource;
  submittedAt: string;
  registeredBy: string;
  stage1: StageDecision | null;
  stage2: StageDecision | null;
  sfdcRef: string | null;
  sfdcSync: "synced" | "pending" | "failed" | "conflict" | "not_applicable";
  sfdcMessage: string | null;
  mobileVerified: boolean;
  registryCheck: "clear" | "existing_same_programme" | "existing_other_programme" | "not_run";
  mpin: "not_set" | "set" | "reset_pending";
  credentialIssuedAt: string | null;
  firstLoginAt: string | null;
}

export interface Member {
  id: string;
  identityId: string;
  programme: ProgrammeCode;
  name: string;
  memberType: string;
  mobile: string;
  gender: string | null;
  email: string | null;
  dob: string | null;
  verifiedIdentity: boolean;
  branchCode: string;
  sr: string | null;
  status: RegistrationStatus;
  registration: RegistrationRecord;
  addresses: { home: Address | null; working: Address | null; gift: Address | null };
  retailer?: { gstStatus: "eligible" | "not_eligible" | "pending" | "not_provided"; territory: string; panSource: string };
  dd?: { distributorId: string; territory: string; salesTarget: string; schemeScan: { scheme: string; enabled: boolean }[] };
  invite?: { ref: string; receivedAt: string; completion: "awaiting_member" | "in_progress" | "completed" };
  createdAt: string;
  updatedAt: string;
}

export type RestrictionType = "program_block" | "temporary_hold";

export interface Restriction {
  id: string;
  type: RestrictionType;
  identityId: string;
  /** Program Block: one membership. Temporary Hold: every membership of the identity. */
  memberIds: string[];
  programme: ProgrammeCode | null;
  reasonCode: string;
  remarks: string;
  trigger: "manual" | "dedup_batch" | "mobile_realtime";
  dedup: { match: "aadhaar" | "pan" | "bank" | "mobile" | "device"; masked: string; relatedMemberIds: string[]; detectedAt: string } | null;
  appliedAt: string;
  appliedBy: string;
  status: "active" | "reinstatement_pending" | "lifted";
  reinstatement: { requestId: string; requestedBy: string; reason: string; liftedAt: string | null; liftedBy: string | null } | null;
}

export interface MemberEvent {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  at: string;
  category: "registration" | "kyc" | "profile" | "address" | "restriction" | "mpin" | "activity" | "sfdc" | "security" | "notification";
  action: string;
  oldValue: string | null;
  newValue: string | null;
  by: string;
  orgId: string | null;
  role: string;
  remarks: string;
  approvalRequestId: string | null;
  ref: string;
}

export interface MobileChangeRequest {
  id: string;
  memberId: string;
  ticketRef: string;
  newMobileMasked: string;
  status: "awaiting_verification" | "verified" | "rejected";
  requestedBy: string;
  requestedAt: string;
  note: string;
}

export interface MpinReset {
  id: string;
  memberId: string;
  at: string;
  by: string;
  reason: string;
  status: "initiated" | "refused";
  result: string;
}

export interface MemberNotification {
  id: string;
  memberId: string;
  event: string;
  audience: "member" | "sr_pic" | "admin";
  channels: ("in_app" | "email" | "sms" | "dashboard")[];
  message: string;
  at: string;
  delivery: "mock_recorded";
}

export interface MemberDecision {
  id: string;
  ref: string;
  question: string;
  treatment: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
}
