/**
 * Platform administration, View-As, application usage, app themes and go-live readiness models
 * (Phase 13, SOW Module 10.1 / 10.2 / 10.7 / 10.8 / 10.12 / 10.13, Module 14 and Annexure A).
 * Business data stays in its owning module: these models hold governance, evidence, readiness and
 * session records, plus the labelled mock telemetry for application usage.
 */
import type { ProgrammeCode } from "./members";

export type EvidenceStatus = "not_tested" | "pending_engineering_evidence" | "meets_target" | "at_risk" | "fails_target" | "insufficient_samples" | "telemetry_unavailable";
export type GateStatus = "not_started" | "in_progress" | "pending_evidence" | "pending_review" | "passed" | "failed" | "blocked";
export type CoverageStatus = "fully_implemented" | "partially_implemented" | "ui_only" | "mock_service_only" | "backend_integration_prepared" | "live_integration" | "business_confirmation_required" | "not_implemented" | "not_applicable";

/* ---------------- View-As (SOW 10.7) ---------------- */

export interface ViewAsSession {
  id: string;
  adminId: string;
  orgId: string | null;
  role: string;
  memberId: string;
  programme: ProgrammeCode;
  branchCode: string;
  ip: string;
  device: string;
  startedAt: number;
  lastActivityAt: number;
  endedAt: number | null;
  exitReason: "exit" | "inactivity_timeout" | "session_expired" | "sign_out" | null;
  override: { authority: string; reason: string } | null;
}
export interface ViewAsAttempt {
  id: string;
  adminId: string;
  role: string;
  memberRef: string;
  at: number;
  result: "started" | "refused";
  reason: string;
  ip: string;
  device: string;
  override: boolean;
}
export interface ViewAsMutationBlock {
  id: string;
  sessionId: string;
  adminId: string;
  module: string;
  action: string;
  at: number;
}

/* ---------------- Application usage telemetry (SOW 10.12) ---------------- */

export interface UsageSession {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  memberType: string;
  state: string;
  branchCode: string;
  appVersion: string;
  deviceModel: string;
  os: string;
  start: string;
  durationSec: number;
  views: { screen: string; module: string; at: string; seconds: number | null }[];
  /** Screen the session ended on (the source's exit event). */
  exitScreen: string;
}

/* ---------------- App themes (SOW 10.8, OP-THEME1) ---------------- */

export interface AppTheme {
  id: string;
  name: string;
  type: "tier" | "festival" | "default";
  programmes: ProgrammeCode[];
  tierIds: string[];
  eventRef: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  tokens: { primary: string; secondary: string; background: string; text: string; accent: string };
  assets: { background: string | null; banner: string | null };
  screens: string[];
  status: "draft" | "pending_approval" | "approved" | "published" | "expired" | "rejected";
  version: number;
  versions: { version: number; at: string; by: string; change: string; tokens: AppTheme["tokens"]; status: string }[];
  approvalRequestId: string | null;
  createdBy: string;
  updatedAt: string;
}

/* ---------------- Readiness, testing and acceptance (Module 14) ---------------- */

export interface Measurement {
  id: string;
  targetId: string;
  p95Ms: number | null;
  p99Ms: number | null;
  timeouts: number | null;
  samples: number;
  window: string;
  environment: "staging" | "production" | "load_test" | "local_development";
  runRef: string;
  evidence: string;
  by: string;
  at: string;
}
export interface EvidenceRecord {
  id: string;
  subject: string;
  kind: "capacity" | "security" | "acceptance" | "integration_test" | "gate" | "migration" | "release";
  result: "passed" | "failed" | "partial";
  value: string;
  environment: string;
  runRef: string;
  evidence: string;
  by: string;
  at: string;
}
export interface Defect {
  id: string;
  module: string;
  title: string;
  description: string;
  severity: "P0" | "P1" | "P2" | "P3" | "untriaged";
  owner: string | null;
  status: "open" | "in_progress" | "fixed" | "retest_passed" | "retest_failed" | "closed" | "deferred";
  rootCause: string | null;
  fixVersion: string | null;
  retest: string | null;
  source: string;
  history: { at: string; by: string; change: string }[];
}
export interface UatCycle {
  id: string;
  name: string;
  environment: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  businessOwner: string | null;
  coordinator: string | null;
  teams: string[];
  allocation: Record<ProgrammeCode, number | null>;
  pilotMembers: { memberId: string; programme: ProgrammeCode; status: "proposed" | "confirmed" | "withdrawn" }[];
  signOffAuthority: string | null;
  signOff: { status: "not_signed" | "signed" | "rejected"; by: string | null; at: string | null; comments: string; ref: string | null };
}
export interface UatCase {
  id: string;
  cycleId: string;
  area: string;
  programme: ProgrammeCode | "All";
  scenario: string;
  steps: string;
  expected: string;
  executions: { id: string; at: string; tester: string; actual: string; result: "pass" | "fail" | "blocked"; defectId: string | null; evidence: string; retestOf: string | null }[];
}
export interface GoLiveGate {
  id: string;
  check: string;
  owner: string;
  supporting: string;
  requiredEvidence: string;
  status: GateStatus;
  evidence: string[];
  validationDate: string | null;
  reviewer: string | null;
  signOffRef: string | null;
  remarks: string;
}
export interface ChecklistItem {
  id: string;
  group: "cutover" | "release" | "rollback";
  item: string;
  status: GateStatus;
  owner: string;
  evidence: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}
export interface MigrationException {
  id: string;
  kind: "missing_member" | "duplicate_member" | "member_mapping" | "wallet_difference" | "scheme_points_difference" | "tds_kitty_difference" | "missing_scan_history" | "missing_redemption_history" | "invalid_branch" | "invalid_programme";
  sourceRef: string;
  targetRef: string | null;
  difference: string;
  owner: string | null;
  status: "open" | "investigating" | "resolved" | "accepted";
  evidence: string | null;
  signOff: string | null;
}
export interface ErrorIncident {
  id: string;
  errorRef: string;
  technicalCode: string;
  module: string;
  at: string;
  memberRef: string | null;
  ticketRef: string | null;
  resolution: string | null;
}
export interface PlatformDecision {
  id: string;
  ref: string;
  module: string;
  description: string;
  impact: string;
  affected: string;
  businessOwner: string;
  technicalOwner: string;
  restriction: string;
  status: "open" | "under_review" | "decision_received" | "confirmed" | "implemented" | "deferred" | "out_of_scope" | "rejected";
  decisionDate: string | null;
  evidence: string;
}
export interface PlatformAudit {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  before: string | null;
  after: string | null;
  reason: string;
  result: "success" | "refused";
}

export interface PlatformState {
  viewAsIdleMinutes: number;
  themes: AppTheme[];
  measurements: Measurement[];
  evidence: EvidenceRecord[];
  defects: Defect[];
  uat: UatCycle[];
  uatCases: UatCase[];
  gates: GoLiveGate[];
  checklists: ChecklistItem[];
  migrationExceptions: MigrationException[];
  migrationScope: { programmes: Record<ProgrammeCode, "pending_confirmation" | "included" | "excluded">; owner: string | null; validationOwner: string | null; plannedCutover: string | null; status: "pending_business_confirmation" | "confirmed" };
  incidents: ErrorIncident[];
  decisions: PlatformDecision[];
  rollbackPlan: { documented: boolean; expectedRestoration: string | null; steps: string; testedAt: string | null; testResult: string | null };
  audit: PlatformAudit[];
}
