/**
 * PROPOSED Module 12 — Job Management & Field Tooling (SOW 12.1–12.11, pages 143–153). The whole
 * module is Proposed: not part of the agreed baseline. This catalogue holds the scope assessment,
 * the decision register, the draft (unapproved) integration contracts and the feature gates. Nothing
 * here is production configuration.
 */
import type { ProposedDecision } from "@/types/jobs";

export const JOBS_BASE = "/future/job-management";

/** How each capability stands in this repository. */
export type CapabilityClass = "existing" | "partially_existing" | "new_proposal" | "awaiting_confirmation" | "disabled_pending_approval";
export const CLASS_LABEL: Record<CapabilityClass, string> = { existing: "Existing", partially_existing: "Partially existing", new_proposal: "New proposal", awaiting_confirmation: "Awaiting business confirmation", disabled_pending_approval: "Disabled pending approval" };

/* ======================= 1.1 Existing capability assessment ======================= */

export interface CapabilityAssessment { id: string; capability: string; sowStatus: string; route: string; component: string; service: string; dataModel: string; apiContract: string; tests: string; missing: string; enhancement: string; rebuild: "No" | "Yes" | "Not determinable"; cls: CapabilityClass }
export const CAPABILITY_ASSESSMENT: CapabilityAssessment[] = [
  { id: "CA-01", capability: "Customer and warranty lookup through Siebel", sowStatus: "Existing integration scope", route: "/monitoring/integrations/other", component: "pages/ops/ConnectionPages.tsx (Other connections)", service: "features/ops (INT-SIEBEL mock adapter log)", dataModel: "IntegrationRequest (types/ops.ts)", apiContract: "None agreed — lookups are a mock adapter log", tests: "test:ops (integration directory, health, trace)", missing: "Job creation, completion submission and confirmation are not part of the lookup integration", enhancement: "A separate proposed Siebel Job Management integration (OP-52 / OP-55); lookup monitoring stays as is", rebuild: "No", cls: "existing" },
  { id: "CA-02", capability: "Selfie capture", sowStatus: "Partly exists", route: "/registration-kyc (selfie / liveness queue)", component: "pages/members/KycPages.tsx", service: "features/members/store (KYC documents, type selfie)", dataModel: "KycDocument type 'selfie' (types/members.ts)", apiContract: "services/memberApi.ts (mock)", tests: "Phase 5 KYC flows (no dedicated job-start test)", missing: "Selfie at job start is captured by the member app; the portal holds KYC selfie status only, not a per-job capture", enhancement: "Job start evidence reference (selfie ref + capture time) on the proposed job; reuse the KYC evidence pattern", rebuild: "No", cls: "partially_existing" },
  { id: "CA-03", capability: "Geo-location capture", sowStatus: "Partly exists", route: "/members/member/:id (working address)", component: "pages/members/Member360Page.tsx", service: "features/members (Address with lat / lng and geo_validated status)", dataModel: "Address.lat / lng / verification (types/members.ts)", apiContract: "services/memberApi.ts (mock)", tests: "Phase 5, Phase 10 geo checks", missing: "Per-job GPS at job start and a service-area validation rule", enhancement: "Store job start GPS as evidence; validation rule pending V-Guard", rebuild: "No", cls: "partially_existing" },
  { id: "CA-04", capability: "Installation completion photos", sowStatus: "Partly exists", route: "/schemes/incentives (campaign photo entries)", component: "pages/schemes/IncentivePages.tsx", service: "features/schemes (ContestEntry photoRef, capture, gps)", dataModel: "ContestEntry.photoRef / capture / gps (types/schemes.ts)", apiContract: "None for jobs", tests: "test:schemes (campaign entries)", missing: "Job-linked completion photo set, categories and review", enhancement: "CompletionPhoto reuses the photoRef + capture-source pattern; mandatory photo rules pending V-Guard", rebuild: "No", cls: "partially_existing" },
  { id: "CA-05", capability: "Points per job type", sowStatus: "Partly exists", route: "/schemes/new (Scheme Builder)", component: "pages/schemes/BuilderPage.tsx", service: "features/schemes/engine (earning on SourceTxn)", dataModel: "SourceTxn.kind: 'scan' | 'sales_return' (types/schemes.ts)", apiContract: "services/schemeApi.ts (mock)", tests: "test:schemes (119)", missing: "No job-completion earning event: the engine earns only on scans and sales returns", enhancement: "Add a 'job_confirmed' earning event to the Scheme Engine (OP-56) rather than a second incentive engine", rebuild: "No", cls: "partially_existing" },
  { id: "CA-06", capability: "Technician territory view", sowStatus: "Partly exists", route: "/masters/branches", component: "pages/masters/BranchesPage.tsx", service: "features/masters (branch hierarchy, pincodes) + access scope", dataModel: "Branch hierarchy, Member.branchCode", apiContract: "services/masterDataApi.ts (mock)", tests: "Phase 4 masters, scope tests in every suite", missing: "Technician service territory distinct from branch is not modelled", enhancement: "Use branch / district as the territory until OP-53 defines it", rebuild: "No", cls: "partially_existing" },
  { id: "CA-07", capability: "Technician tiers / certification", sowStatus: "Partly exists", route: "/schemes/tiers", component: "pages/schemes (Tier Master)", service: "features/schemes (Tier)", dataModel: "Tier (types/schemes.ts)", apiContract: "services/schemeApi.ts (mock)", tests: "test:schemes (tiers)", missing: "A V-Guard-granted Verified / Exclusive flag separate from earned tiers", enhancement: "Separate VerificationFlag entity (OP-58); never derived from tier", rebuild: "No", cls: "partially_existing" },
  { id: "CA-08", capability: "ST Direct Order & Direct Fulfilment", sowStatus: "Partly built (reported ~90% tested, never live)", route: "None in this repository", component: "None found", service: "None found", dataModel: "None found", apiContract: "None found", tests: "None", missing: "The legacy implementation (code, APIs, database, tests) has not been supplied to this project", enhancement: "Audit the legacy build once supplied (OP-63); do not rebuild here", rebuild: "Not determinable", cls: "awaiting_confirmation" },
  { id: "CA-09", capability: "Customer feedback survey", sowStatus: "Member survey capability exists", route: "/masters/communication (surveys)", component: "pages/comms (Survey management)", service: "features/comms (Survey, SurveyResponse, N06)", dataModel: "Survey / SurveyResponse (types/comms.ts)", apiContract: "services/commsApi.ts (mock)", tests: "test:comms", missing: "N06 surveys target loyalty members; there is no end-customer audience, public microsite or Happy Points", enhancement: "Separate Happy Points feedback model (OP-57); N06 is not reused without an approved mapping", rebuild: "No", cls: "partially_existing" },
  { id: "CA-10", capability: "Sales Executive portal and View-As", sowStatus: "Partly exists", route: "/members, /governance/platform/view-as, /reports/member-360", component: "Members pages, ViewAsPage, analytics Member 360", service: "features/members, features/platform (View-As), features/analytics", dataModel: "Member, ViewAsSession, analytics context", apiContract: "services/memberApi.ts, analyticsApi.ts (mock)", tests: "test:platform (View-As, scope), test:analytics", missing: "A single mapped-member workspace; a separate Sales Executive app is not agreed (OP-36 / OP-37)", enhancement: "Scoped workspace inside the portal reusing member, wallet and analytics services", rebuild: "No", cls: "partially_existing" },
];

/* ======================= Decision register (SOW 12.x open points) ======================= */

const d = (x: Omit<ProposedDecision, "status" | "decisionDate" | "evidence">): ProposedDecision => ({ ...x, status: "open", decisionDate: null, evidence: "" });
export const MODULE12_DECISIONS: ProposedDecision[] = [
  d({ id: "OP-52", ref: "OP-52 / OP-55", sow: "12.2", question: "Full Job Management scope and the two-way Siebel handshake: job payload, completion payload, confirmation / rejection, timeouts and failure handling", affected: "Incoming jobs, completion submission, Siebel verification, rewards", dependency: "Siebel job APIs (inbound job, outbound completion, confirmation callback)", businessOwner: "V-Guard Service", technicalOwner: "V-Guard IT (Siebel) + Evolve", restriction: "Mock adapter only. No job is confirmed and no points are credited without an authoritative Siebel confirmation" }),
  d({ id: "OP-53", ref: "OP-53", sow: "12.3", question: "Allocation rules: territory, verification, skill and workload order; one or many technicians; acceptance window; what happens if nobody accepts", affected: "Job allocation workbench", dependency: "Technician skill master, territory definition, workload source", businessOwner: "V-Guard Service", technicalOwner: "Evolve", restriction: "Comparison only. No automatic allocation, no score, manual demo assignment only" }),
  d({ id: "OP-56", ref: "OP-56", sow: "12.4", question: "Reuse the Scheme Engine for job rewards or create a separate job reward set-up; job type, product, territory and campaign variations", affected: "Job reward configuration and processing", dependency: "Scheme Engine earning event for confirmed jobs", businessOwner: "V-Guard Business", technicalOwner: "Evolve", restriction: "Reward configuration stays draft; processing is simulated and never posts to the ledger" }),
  d({ id: "OP-58", ref: "OP-58", sow: "12.6", question: "Verified / Exclusive flag: who sets it, qualification, expiry, and which jobs, communications and customer opportunities it unlocks", affected: "Technician verification", dependency: "V-Guard verification criteria", businessOwner: "V-Guard Service", technicalOwner: "Evolve", restriction: "Demo flags only; no benefit is active" }),
  d({ id: "OP-57", ref: "OP-57", sow: "12.5", question: "Happy Points: how the link is sent (WhatsApp / SMS), microsite questions, conversion to Happy Points and who receives them", affected: "Happy Points, customer feedback", dependency: "Public microsite hosting, customer messaging provider, consent", businessOwner: "V-Guard Marketing", technicalOwner: "Evolve", restriction: "Preview and simulated submissions only; no link is sent, no points are calculated" }),
  d({ id: "OP-59", ref: "OP-59", sow: "12.7", question: "Technician E-ID card: card content, sent before or during the visit, channel, customer consent and retention", affected: "E-ID card delivery", dependency: "Customer consent mechanism (DPDP), WhatsApp business templates for non-members", businessOwner: "V-Guard Service + Legal", technicalOwner: "Evolve", restriction: "Preview only; delivery is blocked" }),
  d({ id: "OP-63", ref: "OP-63", sow: "12.8", question: "Existing ST Direct Order & Direct Fulfilment build: status, outstanding work, required tests, integration owner, business owner and go-live responsibility", affected: "Direct Order assessment", dependency: "Access to the legacy implementation and its test evidence", businessOwner: "V-Guard Sales", technicalOwner: "Legacy vendor / V-Guard IT", restriction: "Assessment only; no Direct Order implementation in this portal" }),
  d({ id: "OP-29", ref: "OP-29", sow: "12.9", question: "Quotation module: approval, required fields, calculation rules, tax treatment, output format and how it is shared with the customer", affected: "Electrician quotations", dependency: "Pricing source, tax rules", businessOwner: "V-Guard Sales", technicalOwner: "Evolve", restriction: "Drafts with description only; no prices, tax or dispatch" }),
  d({ id: "OP-27", ref: "OP-27", sow: "12.10", question: "Retailer tagging rules, default visibility radius, whether the radius is configurable, and the retailer location source", affected: "Retailer tagging and proximity", dependency: "Retailer location master", businessOwner: "V-Guard Sales", technicalOwner: "Evolve", restriction: "Demo tags only; radius unset and inactive" }),
  d({ id: "OP-28", ref: "OP-28", sow: "12.10", question: "Retailer-visit survey: approval, trigger distance, frequency per retailer, visit verification and survey ownership", affected: "Retailer visit surveys", dependency: "OP-27 retailer tagging", businessOwner: "V-Guard Sales", technicalOwner: "Evolve", restriction: "Rules inactive; no survey is triggered" }),
  d({ id: "OP-26", ref: "OP-26", sow: "12.10", question: "Frequent work-location changes: how often, whether approval is needed, and the effect on retailer tags, geo-fenced schemes and branch mapping", affected: "Work location governance", dependency: "Member working-location capture in the app", businessOwner: "V-Guard Sales", technicalOwner: "Evolve", restriction: "Changes recorded for review only; nothing downstream is recalculated" }),
  d({ id: "OP-36", ref: "OP-36 / OP-37", sow: "12.11", question: "Is a separate Sales Executive application needed, should it be web, mobile or PWA, and which functions go beyond the admin portal and View-As", affected: "Sales Executive workspace", dependency: "Business decision", businessOwner: "V-Guard Sales", technicalOwner: "Evolve", restriction: "Workspace inside the existing portal only; no separate application" }),
];

/* ======================= Feature gates ======================= */

export interface FeatureGate { id: string; feature: string; decisions: string[]; cls: CapabilityClass; productionActive: false; prototype: string }
export const FEATURE_GATES: FeatureGate[] = [
  { id: "FG-JOBS", feature: "Siebel job intake and job lifecycle", decisions: ["OP-52"], cls: "disabled_pending_approval", productionActive: false, prototype: "Mock Siebel adapter, demo jobs" },
  { id: "FG-ALLOC", feature: "Automatic technician allocation", decisions: ["OP-53"], cls: "disabled_pending_approval", productionActive: false, prototype: "Manual demo assignment" },
  { id: "FG-REWARD", feature: "Job reward crediting", decisions: ["OP-56", "OP-52"], cls: "disabled_pending_approval", productionActive: false, prototype: "Simulated eligibility and ledger reference" },
  { id: "FG-VERIFY", feature: "Verified / Exclusive technician benefits", decisions: ["OP-58"], cls: "disabled_pending_approval", productionActive: false, prototype: "Demo flags" },
  { id: "FG-HAPPY", feature: "Happy Points microsite and customer link", decisions: ["OP-57"], cls: "disabled_pending_approval", productionActive: false, prototype: "Preview and simulated submission" },
  { id: "FG-EID", feature: "E-ID card delivery to customers", decisions: ["OP-59"], cls: "disabled_pending_approval", productionActive: false, prototype: "Card preview" },
  { id: "FG-DO", feature: "ST Direct Order & Direct Fulfilment", decisions: ["OP-63"], cls: "awaiting_confirmation", productionActive: false, prototype: "Assessment only" },
  { id: "FG-QUOTE", feature: "Electrician quotations", decisions: ["OP-29"], cls: "disabled_pending_approval", productionActive: false, prototype: "Draft records and preview" },
  { id: "FG-TAG", feature: "Retailer tagging and proximity", decisions: ["OP-27"], cls: "disabled_pending_approval", productionActive: false, prototype: "Demo tags, valid-coordinate preview" },
  { id: "FG-VISIT", feature: "Retailer-visit survey trigger", decisions: ["OP-28", "OP-27"], cls: "disabled_pending_approval", productionActive: false, prototype: "Inactive rule configuration" },
  { id: "FG-WORKLOC", feature: "Work-location change governance", decisions: ["OP-26"], cls: "disabled_pending_approval", productionActive: false, prototype: "History and impact preview" },
  { id: "FG-SALESEXEC", feature: "Separate Sales Executive application", decisions: ["OP-36"], cls: "new_proposal", productionActive: false, prototype: "Workspace inside the portal" },
];

/* ======================= Proposed Siebel Job Management integration ======================= */

export const SIEBEL_JOB_INTEGRATION = {
  ref: "INT-SIEBEL-JOBS (proposed)",
  name: "Siebel Job Management Integration — Proposed",
  source: "Siebel CRM",
  destination: "Rishta loyalty platform",
  inbound: "Job creation (Siebel → platform): proposed, not agreed",
  outbound: "Completion submission (platform → Siebel): proposed, not agreed",
  confirmation: "Confirmation / rejection (Siebel → platform): proposed, not agreed",
  auth: "Not defined (no credentials stored)",
  contract: "Draft — pending OP-52 / OP-55",
  health: "Not connected (mock adapter)",
  separateFrom: "INT-SIEBEL (customer and warranty lookup) — monitored in Integration Monitoring and unchanged",
};
export interface ContractField { field: string; meaning: string; status: "draft_pending_op52" }
const f = (field: string, meaning: string): ContractField => ({ field, meaning, status: "draft_pending_op52" });
export const INBOUND_CONTRACT: ContractField[] = [
  f("siebelJobRef", "Siebel job reference (SOW: job reference)"), f("jobType", "Installation or service (SOW: job type)"), f("customer.ref / name / contactRef", "Customer details (SOW: customer details)"), f("address.line / pincode / district / state", "Service / installation address"), f("product.skuRef / name / categoryId", "Product"), f("warrantyRef", "Warranty reference, where supplied"), f("priority", "Only if Siebel provides it"), f("branchCode", "Servicing branch, if supplied"), f("extensions{}", "Further attributes once confirmed; stored, not interpreted"),
];
export const OUTBOUND_CONTRACT: ContractField[] = [
  f("jobRef", "Siebel job reference"), f("technicianRef", "Technician member ID"), f("completedAt", "Job completion timestamp"), f("startEvidenceRef", "Job start selfie reference"), f("locationEvidenceRef", "Job start GPS evidence reference"), f("photoRefs[]", "Completion photo references"), f("completionStatus", "Completed"), f("supportingInfo", "Free text"),
];
export const SIEBEL_OUTCOMES = ["pending", "confirmed", "rejected", "integration_error", "timeout", "awaiting_manual_resolution"] as const;

/* ======================= Scheme Engine compatibility (OP-56) ======================= */

export const SCHEME_COMPATIBILITY = [
  { aspect: "Earning event", existing: "SourceTxn.kind is 'scan' or 'sales_return' (features/schemes)", fit: "no" as const, gap: "No job-completion event; the engine cannot interpret a confirmed job" },
  { aspect: "Qualification by product / SKU", existing: "Base points and targeting by SKU and category", fit: "yes" as const, gap: "Reusable if a job carries a product reference" },
  { aspect: "Qualification by territory / branch", existing: "Branch rows and geo targeting", fit: "yes" as const, gap: "Reusable with job branch / district" },
  { aspect: "Campaign period", existing: "Scheme start / end and campaigns", fit: "yes" as const, gap: "Reusable" },
  { aspect: "Points per job type", existing: "No job-type dimension", fit: "no" as const, gap: "Needs a job-type attribute on the earning event" },
  { aspect: "Crediting through the ledger", existing: "Wallet ledger with approvals, idempotent postings", fit: "yes" as const, gap: "Reusable; a job reference and Siebel confirmation reference must be carried on the line" },
  { aspect: "Settlement / budget / exposure", existing: "Scheme budget and exposure", fit: "yes" as const, gap: "Reusable once a job event exists" },
];

/* ======================= Direct Order (OP-63) and Sales Executive (OP-36 / 37) ======================= */

export const DIRECT_ORDER_ASSESSMENT = {
  repositorySearch: "src/ searched for 'direct order', 'direct fulfil' and 'directOrder': no implementation in this repository",
  componentsFound: [] as string[],
  apiContracts: [] as string[],
  stepsImplemented: [] as string[],
  stepsMissing: ["Legacy order capture (unknown)", "Fulfilment logic (unknown)", "Points or payment logic (unknown)", "Integrations (unknown)"],
  tests: "Reported ~90% tested in the legacy system; test evidence not supplied",
  defects: "Not supplied",
  dependencies: ["Legacy source code and database", "Legacy test evidence", "Distributor / fulfilment integrations (unknown)"],
  readiness: "Not determinable — the existing build has not been made available",
  owners: { integration: null as string | null, business: null as string | null, goLive: null as string | null },
};
export const SALES_EXEC_ASSESSMENT = [
  { need: "EP registration", existing: "Sales Rep can create members (members:create) — assisted registration", gap: "None for the portal" },
  { need: "Member support", existing: "Tickets (view / create), Member 360 (scoped)", gap: "None for the portal" },
  { need: "View-As", existing: "View-As own branch (Phase 13)", gap: "None" },
  { need: "Mapped-member performance", existing: "Member 360 analytics (member-analytics:view)", gap: "No single workspace across mapped members — prototype added" },
  { need: "Branch scope", existing: "Scope ceiling 'branch' enforced by the access engine", gap: "None" },
  { need: "Separate mobile / PWA app", existing: "None", gap: "Not agreed (OP-36 / OP-37)" },
];

/* ======================= Workstream estimate (indicative) ======================= */

export const WORKSTREAMS = [
  { id: "WS-1", name: "Siebel two-way job integration", size: "Large", depends: "OP-52 / OP-55; Siebel team availability", assumption: "Siebel exposes job push and confirmation callback; one payload version" },
  { id: "WS-2", name: "Job lifecycle service and allocation", size: "Large", depends: "OP-53", assumption: "Single-technician acceptance; manual fallback when nobody accepts" },
  { id: "WS-3", name: "Technician app job screens (accept, start with selfie + GPS, completion photos)", size: "Large", depends: "OP-52, evidence rules", assumption: "Reuses the app's existing camera and location components" },
  { id: "WS-4", name: "Job reward earning event in the Scheme Engine", size: "Medium", depends: "OP-56", assumption: "Scheme Engine extended rather than a second engine" },
  { id: "WS-5", name: "Verified / Exclusive flag", size: "Small", depends: "OP-58", assumption: "Granted through a Maker-Checker workflow" },
  { id: "WS-6", name: "Happy Points microsite and customer messaging", size: "Medium", depends: "OP-57, OP-59 consent", assumption: "Hosted public page; WhatsApp business templates approved for non-members" },
  { id: "WS-7", name: "E-ID card", size: "Small", depends: "OP-59", assumption: "Card generated from member profile and flag" },
  { id: "WS-8", name: "Direct Order review", size: "Not estimable", depends: "OP-63", assumption: "Depends entirely on the legacy build supplied" },
  { id: "WS-9", name: "Quotations", size: "Medium", depends: "OP-29", assumption: "PDF output; pricing from a supplied price list" },
  { id: "WS-10", name: "Retailer tagging, proximity and visit surveys", size: "Medium", depends: "OP-27, OP-28", assumption: "Retailer coordinates available from a master" },
  { id: "WS-11", name: "Work-location governance", size: "Small", depends: "OP-26", assumption: "Approval-based changes" },
  { id: "WS-12", name: "Sales Executive app", size: "Not estimable", depends: "OP-36 / OP-37", assumption: "Not agreed" },
];

/** Sections of the proposed module (secondary navigation, grouped). */
export const JOB_SECTIONS: { group: string; items: { path: string; label: string }[] }[] = [
  { group: "Overview", items: [{ path: "", label: "Proposed scope overview" }, { path: "dashboard", label: "Job operations dashboard" }, { path: "decisions", label: "Proposed scope decisions" }] },
  { group: "Jobs", items: [{ path: "jobs", label: "Job management" }, { path: "incoming", label: "Incoming jobs" }, { path: "allocation", label: "Job allocation" }, { path: "execution", label: "Job execution monitoring" }, { path: "evidence", label: "Completion evidence" }, { path: "siebel", label: "Siebel job verification" }, { path: "rewards", label: "Job reward monitoring" }] },
  { group: "Technicians", items: [{ path: "technicians", label: "Technician directory" }, { path: "verification", label: "Technician verification status" }, { path: "performance", label: "Technician performance" }, { path: "eid", label: "Technician E-ID card" }] },
  { group: "Customers", items: [{ path: "happy-points", label: "Happy Points" }, { path: "feedback", label: "Customer feedback" }] },
  { group: "Field tooling", items: [{ path: "direct-order", label: "ST Direct Order assessment" }, { path: "quotations", label: "Electrician quotations" }, { path: "retailer-tagging", label: "Retailer tagging" }, { path: "visit-surveys", label: "Retailer visit surveys" }, { path: "work-location", label: "Work location governance" }, { path: "sales-executive", label: "Sales Executive scope" }] },
];
