/**
 * PROPOSED Module 12 — Job Management & Field Tooling (SOW 12.1–12.11). Every model here is a
 * proposed entity for evaluation and estimation, held separately from production entities. Members,
 * branches, products, wallets, schemes, surveys and communications are referenced by ID only, never
 * copied. Records are development / demo data; Siebel stays the system of record for jobs.
 */
import type { ProgrammeCode } from "./members";

export type ProposedDecisionStatus = "open" | "under_review" | "decision_received" | "confirmed" | "deferred" | "out_of_scope";
export type JobType = "installation" | "service";
export type JobStatus = "received" | "pending_allocation" | "assigned" | "accepted" | "in_progress" | "completion_submitted" | "awaiting_siebel" | "confirmed" | "rejected";
export type SiebelResult = "pending" | "confirmed" | "rejected" | "integration_error" | "timeout" | "awaiting_manual_resolution";
export type RewardStatus = "not_eligible" | "pending" | "eligible" | "simulated_credit";
export type Tri = "yes" | "no" | "unknown";

/** Draft inbound payload from the (mock) Siebel job adapter. Every field is pending OP-52 / OP-55. */
export interface SiebelJobPayload {
  siebelJobRef: string;
  jobType: JobType | null;
  customer: { ref: string | null; name: string | null; contactRef: string | null };
  address: { line: string | null; pincode: string | null; district: string | null; state: string | null };
  product: { skuRef: string | null; name: string | null; categoryId: string | null };
  warrantyRef: string | null;
  priority: string | null;
  branchCode: string | null;
  /** Additional attributes Siebel may send once confirmed; kept, never interpreted. */
  extensions: Record<string, string>;
}

export interface JobEvent {
  at: string;
  status: string;
  source: "Siebel (mock adapter)" | "Platform" | "Technician app (simulated)" | "Prototype user";
  ref: string | null;
  by: string;
  remarks: string;
}

export interface StartEvidence { selfieRef: string; capturedAt: string; gps: { lat: number; lng: number } | null; locationStatus: "captured" | "gps_unavailable" | "outside_service_area" | "not_validated" }
export interface CompletionPhoto { ref: string; category: string; uploadedAt: string; capture: "camera_verified" | "source_unconfirmed"; status: "received" | "under_review" | "accepted" | "rejected" }

export interface ProposedJob {
  id: string;
  siebelJobRef: string;
  payload: SiebelJobPayload;
  issues: string[];
  programme: ProgrammeCode;
  status: JobStatus;
  technicianId: string | null;
  createdAt: string;
  assignedAt: string | null;
  start: StartEvidence | null;
  photos: CompletionPhoto[];
  siebel: SiebelResult | null;
  reward: RewardStatus;
  timeline: JobEvent[];
  demo: true;
}

export interface InboundMessage { id: string; at: string; siebelJobRef: string; result: "accepted" | "duplicate" | "incomplete"; jobId: string | null; remarks: string }
export interface Assignment { id: string; jobId: string; technicianId: string; at: string; by: string; factors: Record<string, string>; notification: "not_sent_demo"; response: "awaiting" | "accepted" | "declined" | "no_response"; respondedAt: string | null; declineNote: string | null; mode: "manual_demo" }
export interface SiebelSubmission {
  id: string;
  jobId: string;
  technicianId: string;
  submittedAt: string;
  payload: { jobRef: string; technicianRef: string; completedAt: string; startEvidenceRef: string; locationEvidenceRef: string | null; photoRefs: string[]; completionStatus: "completed"; supportingInfo: string };
  result: SiebelResult;
  respondedAt: string | null;
  confirmationRef: string | null;
  rejectionReason: string | null;
  errorRef: string | null;
  retry: "none" | "awaiting_manual_resolution";
}
export interface SiebelCallback { id: string; at: string; requestRef: string; result: SiebelResult; confirmationRef: string | null; rejectionReason: string | null; outcome: "applied" | "duplicate_ignored" | "unknown_request" }
export interface IntegrationException { id: string; at: string; kind: "timeout" | "integration_error" | "rejection" | "duplicate_inbound" | "incomplete_payload"; ref: string; jobId: string | null; status: "open" | "investigating"; note: string }

export interface JobRewardConfig { id: string; jobType: JobType; productRef: string | null; territory: string | null; campaignFrom: string | null; campaignTo: string | null; points: number; effectiveFrom: string; status: "draft"; createdBy: string; createdAt: string }
export interface JobReward { jobId: string; technicianId: string; configId: string | null; expectedPoints: number | null; status: RewardStatus; siebelConfirmationRef: string | null; simulatedLedgerRef: string | null; walletRef: string | null; note: string }

export interface VerificationFlag { id: string; technicianId: string; status: "demo_granted" | "revoked"; effectiveFrom: string; expiresOn: string | null; grantedBy: string; reason: string; approval: "pending_op58"; history: { at: string; by: string; change: string }[] }
export interface FlagCapability { id: string; kind: "jobs" | "communications" | "customer_opportunity"; description: string; active: false }

export interface FeedbackLink { id: string; jobId: string; technicianId: string; createdAt: string; delivery: "not_sent_disabled"; submissionId: string | null }
export interface FeedbackSubmission { id: string; linkId: string; jobId: string; technicianId: string; at: string; rating: number; comment: string; happyPoints: "pending_decision" ; simulated: true }
export interface EidDelivery { id: string; jobId: string; technicianId: string; at: string; channel: "whatsapp_proposed"; consent: { status: "not_captured"; at: null; source: null; purpose: string; recordRef: null; withdrawn: null }; timing: "pending_op59"; outcome: "blocked"; reason: string }

export interface QuotationDraft { id: string; electricianId: string; customerRef: string; description: string; date: string; status: "draft"; shared: "not_shared"; format: "pending_op29"; createdBy: string }
export interface RetailerTag { id: string; electricianId: string; retailerId: string; pincode: string | null; address: string | null; source: "pincode" | "address"; status: "demo"; effectiveFrom: string; updatedAt: string }
export interface RadiusConfig { radiusKm: number | null; configurable: "pending_op27"; programme: ProgrammeCode | null; scope: string | null; effectiveFrom: string | null; status: "inactive" }
export interface VisitSurveyRule { id: string; surveyRef: string | null; triggerDistanceM: number | null; frequency: string | null; visitVerification: string | null; audience: string | null; dedupWindow: string | null; status: "inactive" }
export interface WorkLocationChange { id: string; memberId: string; from: string | null; to: string; at: string; source: "member_app" | "prototype"; status: "recorded_pending_policy"; reason: string }

export interface ProposedDecision {
  id: string;
  ref: string;
  sow: string;
  question: string;
  affected: string;
  dependency: string;
  businessOwner: string | null;
  technicalOwner: string | null;
  status: ProposedDecisionStatus;
  decisionDate: string | null;
  evidence: string;
  restriction: string;
}
export interface ProposedAudit { id: string; at: string; actor: string; action: string; entity: string; detail: string; result: "success" | "refused" }

export interface JobsState {
  jobs: ProposedJob[];
  inbound: InboundMessage[];
  assignments: Assignment[];
  submissions: SiebelSubmission[];
  callbacks: SiebelCallback[];
  exceptions: IntegrationException[];
  rewardConfigs: JobRewardConfig[];
  rewards: JobReward[];
  flags: VerificationFlag[];
  feedbackLinks: FeedbackLink[];
  feedback: FeedbackSubmission[];
  eidDeliveries: EidDelivery[];
  quotations: QuotationDraft[];
  tags: RetailerTag[];
  radius: RadiusConfig;
  surveyRules: VisitSurveyRule[];
  workLocations: WorkLocationChange[];
  decisions: ProposedDecision[];
  audit: ProposedAudit[];
}
