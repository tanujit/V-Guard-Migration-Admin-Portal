import type { DocStatus, DocType, KycOverall, ProgrammeCode, RegistrationSource, RegistrationStatus } from "@/types/members";
import type { StatusTone } from "@/types/domain";

/**
 * Programme requirement model. Registration channels, KYC documents, stages and eligibility gates
 * per programme live here, not in screens. "confirmation_required" marks SOW open points: such a
 * document is shown but never counted as pending or required.
 */
export type DocRequirement = "mandatory" | "optional" | "not_applicable" | "confirmation_required";

export interface ProgrammeRequirement {
  code: ProgrammeCode;
  label: string;
  memberType: string;
  sources: RegistrationSource[];
  ownership: "portal" | "sfdc";
  statusModel: "ep_journey" | "invite_journey" | "sfdc_provisioned";
  documents: { type: DocType; requirement: DocRequirement; stage: "registration" | "redemption" | "provisioning"; note?: string }[];
  /** Stage 1 (scan unlock) per source. */
  stage1: Partial<Record<RegistrationSource, "sr_pic_approval" | "not_required" | "sfdc_activation">>;
  /** Who verifies redemption-stage documents. */
  stage2Reviewer: "evolve" | "not_applicable";
  scanGate: string;
  redemptionGate: string;
  /** Field-source mapping. "unconfirmed" until OP-ST1 is answered. */
  fieldSource: Record<string, "sfdc" | "in_app" | "aadhaar" | "unconfirmed">;
  openPoints: string[];
}

const IDENTITY_FIELDS = ["name", "dob", "homeAddress", "workingLocation", "pan", "bank", "upi", "selfie"];
const unconfirmed = Object.fromEntries(IDENTITY_FIELDS.map((f) => [f, "unconfirmed" as const]));

export const PROGRAMME_REQUIREMENTS: ProgrammeRequirement[] = [
  {
    code: "EP",
    label: "Electrician / Plumber",
    memberType: "Influencer (IMP)",
    sources: ["self", "sr_assisted"],
    ownership: "portal",
    statusModel: "ep_journey",
    documents: [
      { type: "aadhaar", requirement: "mandatory", stage: "registration" },
      { type: "pan", requirement: "optional", stage: "redemption" },
      { type: "selfie", requirement: "mandatory", stage: "redemption" },
      { type: "bank", requirement: "mandatory", stage: "redemption" },
      { type: "upi", requirement: "optional", stage: "redemption" },
      { type: "gst", requirement: "not_applicable", stage: "redemption" },
    ],
    stage1: { self: "sr_pic_approval", sr_assisted: "not_required" },
    stage2Reviewer: "evolve",
    scanGate: "Stage-1 SR/PIC approval (self-registration) or successful SR-assisted creation",
    redemptionGate: "Bank submitted and every mandatory redemption document approved by Evolve (Stage 2)",
    fieldSource: { name: "aadhaar", dob: "aadhaar", homeAddress: "aadhaar", workingLocation: "in_app", pan: "in_app", bank: "in_app", upi: "in_app", selfie: "in_app" },
    openPoints: ["OP-15", "OP-16", "OP-17"],
  },
  {
    code: "ST",
    label: "Service Technician",
    memberType: "Service technician",
    sources: ["sfdc_invite"],
    ownership: "sfdc",
    statusModel: "invite_journey",
    documents: [
      { type: "aadhaar", requirement: "mandatory", stage: "registration" },
      { type: "pan", requirement: "optional", stage: "redemption" },
      { type: "selfie", requirement: "mandatory", stage: "redemption" },
      { type: "bank", requirement: "mandatory", stage: "redemption" },
      { type: "upi", requirement: "optional", stage: "redemption" },
      { type: "gst", requirement: "not_applicable", stage: "redemption" },
    ],
    stage1: { sfdc_invite: "sfdc_activation" },
    stage2Reviewer: "evolve",
    scanGate: "Invitation accepted and registration completed in the app",
    redemptionGate: "Full KYC: every mandatory redemption document approved",
    fieldSource: unconfirmed,
    openPoints: ["OP-ST1", "OP-24"],
  },
  {
    code: "CS",
    label: "Counter Sales Boy",
    memberType: "Counter sales",
    sources: ["sfdc_invite"],
    ownership: "sfdc",
    statusModel: "invite_journey",
    documents: [
      { type: "aadhaar", requirement: "mandatory", stage: "registration" },
      { type: "pan", requirement: "optional", stage: "redemption" },
      { type: "selfie", requirement: "mandatory", stage: "redemption" },
      { type: "bank", requirement: "mandatory", stage: "redemption" },
      { type: "upi", requirement: "optional", stage: "redemption" },
      { type: "gst", requirement: "not_applicable", stage: "redemption" },
    ],
    stage1: { sfdc_invite: "sfdc_activation" },
    stage2Reviewer: "evolve",
    scanGate: "Invitation accepted and registration completed in the app",
    redemptionGate: "Full KYC: every mandatory redemption document approved",
    fieldSource: unconfirmed,
    openPoints: ["OP-ST1", "OP-24"],
  },
  {
    code: "Retailer",
    label: "Retailer",
    memberType: "Retailer",
    sources: ["sfdc_provisioned"],
    ownership: "sfdc",
    statusModel: "sfdc_provisioned",
    documents: [
      { type: "aadhaar", requirement: "mandatory", stage: "provisioning" },
      { type: "pan", requirement: "mandatory", stage: "provisioning", note: "Maintained in SFDC" },
      { type: "gst", requirement: "mandatory", stage: "provisioning", note: "GST eligibility gate supplied by the source" },
      { type: "selfie", requirement: "confirmation_required", stage: "redemption", note: "OP-RET1" },
      { type: "bank", requirement: "confirmation_required", stage: "redemption", note: "OP-RET1 / Finance workflow" },
      { type: "upi", requirement: "not_applicable", stage: "redemption" },
    ],
    stage1: { sfdc_provisioned: "sfdc_activation" },
    stage2Reviewer: "not_applicable",
    scanGate: "Provisioned from SFDC and active",
    redemptionGate: "PAN verified in SFDC and GST eligibility gate passed",
    fieldSource: { name: "sfdc", dob: "unconfirmed", homeAddress: "sfdc", workingLocation: "sfdc", pan: "sfdc", bank: "unconfirmed", upi: "unconfirmed", selfie: "unconfirmed" },
    openPoints: ["OP-RET1", "OP-41", "OP-42"],
  },
  {
    code: "DD",
    label: "Direct Dealer",
    memberType: "Direct dealer",
    sources: ["sfdc_provisioned"],
    ownership: "sfdc",
    statusModel: "sfdc_provisioned",
    documents: [
      { type: "aadhaar", requirement: "mandatory", stage: "provisioning" },
      { type: "pan", requirement: "confirmation_required", stage: "provisioning", note: "OP-41 / OP-42" },
      { type: "gst", requirement: "confirmation_required", stage: "provisioning", note: "OP-41 / OP-42" },
      { type: "selfie", requirement: "confirmation_required", stage: "redemption" },
      { type: "bank", requirement: "confirmation_required", stage: "redemption" },
      { type: "upi", requirement: "not_applicable", stage: "redemption" },
    ],
    stage1: { sfdc_provisioned: "sfdc_activation" },
    stage2Reviewer: "not_applicable",
    scanGate: "Provisioned from SFDC; scanning is controlled per scheme",
    redemptionGate: "Per DD earning rules (owned by the Wallet module); not derived here",
    fieldSource: { name: "sfdc", dob: "unconfirmed", homeAddress: "sfdc", workingLocation: "sfdc", pan: "unconfirmed", bank: "unconfirmed", upi: "unconfirmed", selfie: "unconfirmed" },
    openPoints: ["OP-41", "OP-42"],
  },
];

export const requirementOf = (p: ProgrammeCode) => PROGRAMME_REQUIREMENTS.find((r) => r.code === p)!;

export const DOC_LABEL: Record<DocType, string> = { aadhaar: "Aadhaar", pan: "PAN", selfie: "Selfie / liveness", bank: "Bank account", upi: "UPI", gst: "GST" };

export const DOC_STATUS: Record<DocStatus, { label: string; tone: StatusTone }> = {
  not_submitted: { label: "Not submitted", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  under_review: { label: "Under review", tone: "info" },
  approved: { label: "Approved", tone: "positive" },
  rejected: { label: "Rejected", tone: "negative" },
  reupload_required: { label: "Re-upload required", tone: "warning" },
  verification_failed: { label: "Verification failed", tone: "negative" },
  not_applicable: { label: "Not applicable", tone: "neutral" },
};

export const KYC_OVERALL: Record<KycOverall, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "warning" },
  partially_verified: { label: "Partially verified", tone: "info" },
  verified: { label: "Verified", tone: "positive" },
  rejected: { label: "Rejected", tone: "negative" },
  action_required: { label: "Action required", tone: "warning" },
};

export const REG_STATUS: Record<RegistrationStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "warning" },
  active_scan: { label: "Active — Scan enabled", tone: "info" },
  redemption_kyc_pending: { label: "Redemption KYC pending", tone: "warning" },
  redemption_enabled: { label: "Redemption enabled", tone: "positive" },
  rejected: { label: "Rejected", tone: "negative" },
  invited: { label: "Invited (SFDC)", tone: "neutral" },
  provisioned: { label: "Provisioned (SFDC)", tone: "accent" },
};

export const SOURCE_LABEL: Record<RegistrationSource, string> = { self: "Self registration", sr_assisted: "SR-assisted", sfdc_invite: "SFDC invitation", sfdc_provisioned: "SFDC provisioned" };

/** Rejection reason catalogue (development proposal; final list pending business confirmation). */
export const REJECTION_REASONS: { code: string; label: string; docs: DocType[] }[] = [
  { code: "IMG_UNREADABLE", label: "Document image is unreadable", docs: ["pan", "selfie", "gst"] },
  { code: "NAME_MISMATCH", label: "Name does not match the verified identity", docs: ["pan", "bank", "upi"] },
  { code: "INVALID_NUMBER", label: "Identifier failed validation", docs: ["pan", "gst", "bank"] },
  { code: "LIVENESS_FAILED", label: "Liveness or face match failed", docs: ["selfie"] },
  { code: "ACCOUNT_NOT_FOUND", label: "Bank account could not be verified", docs: ["bank"] },
  { code: "EXPIRED_OR_CANCELLED", label: "Document cancelled or expired at source", docs: ["pan", "gst"] },
  { code: "OTHER", label: "Other (explain in remarks)", docs: ["aadhaar", "pan", "selfie", "bank", "upi", "gst"] },
];

export const RESTRICTION_REASONS: { code: string; label: string; type: "program_block" | "temporary_hold" | "both" }[] = [
  { code: "FRAUD_SUSPECTED", label: "Suspected fraudulent scanning", type: "both" },
  { code: "DUPLICATE_IDENTITY", label: "Duplicate identity detected", type: "temporary_hold" },
  { code: "PROGRAMME_ELIGIBILITY", label: "No longer eligible for this programme", type: "program_block" },
  { code: "BRANCH_REQUEST", label: "Requested by the branch / SR", type: "program_block" },
  { code: "INVESTIGATION", label: "Under investigation", type: "both" },
];

/** OP-17: PAN verification route. One source of truth must be confirmed; until then PAN is never auto-verified. */
export const PAN_ROUTE = { configured: null as null | "signzy_nsdl" | "sfdc", candidates: ["Signzy / NSDL (base SOW)", "SFDC PAN validation (change request)"], decision: "OP-17" };

/** OP-MPIN1: recovery policy placeholders. Nothing here is invented as a final rule. */
export const MPIN_POLICY = { verificationMethod: null as string | null, length: null as 4 | 6 | null, lockout: null as string | null, decision: "OP-MPIN1" };
