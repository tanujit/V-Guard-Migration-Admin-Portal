/**
 * Client Demo Centre — simulated personas and the guided scenario library (Build Prompt 14A).
 * Personas are existing development identities with their real roles and scopes: switching persona
 * changes navigation, actions, scope, sensitive-data access and approval authority through the same
 * access engine. Scenario steps are performed by the presenter on the working screens; completion is
 * detected from changes in the shared demo state (metrics), or ticked by hand for viewing steps.
 */

export { DEMO_PERSONAS, personaOf, type DemoPersona } from "./demoPersonas";


/** Counters read from the shared demo state; a step is detected when its counter increases. */
export type DemoMetric =
  | "members" | "kycApproved" | "kycRejected" | "memberEvents" | "restrictionsActive" | "restrictionsLifted"
  | "scanCredits" | "scanRecords" | "duplicateQr" | "geoBlocked" | "scanRejected"
  | "schemes" | "schemesActive" | "schemeAccruals" | "settlements" | "settlementReleases"
  | "requests" | "approved" | "rejected" | "returned" | "executed"
  | "adjustments" | "reversals" | "transfers" | "redemptions" | "payoutsSuccess" | "payoutsFailed" | "redemptionReversals"
  | "giftItems" | "giftOrders" | "giftDelivered" | "vouchers" | "insuranceBatches"
  | "communications" | "commEvents" | "queries"
  | "riskEvents" | "riskCases" | "riskCasesClosed"
  | "opsRequests" | "opsFailed" | "opsRetries" | "incidents"
  | "viewAsSessions" | "viewAsRefused" | "exports"
  | "jobs" | "jobsConfirmed" | "jobsRejected" | "jobTimeouts" | "jobRewardsSimulated";

export interface ScenarioStep { title: string; persona: string; route: string; why: string; changes: string; audit: string; detect?: DemoMetric }
export interface DemoScenario { id: string; name: string; purpose: string; programme: string; start: string; expected: string; modules: string[]; proposed?: boolean; steps: ScenarioStep[] }

const S = (title: string, persona: string, route: string, why: string, changes: string, audit: string, detect?: DemoMetric): ScenarioStep => ({ title, persona, route, why, changes, audit, detect });

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "SC-01", name: "New member registration and activation", purpose: "How an EP joins through a Sales Rep and becomes active after KYC review", programme: "EP", start: "Seed dataset", expected: "New member in the directory with approved KYC, registration history in Member 360 and the Maker / reviewer in the audit", modules: ["Members", "Registration & KYC", "Communication", "Audit"],
    steps: [
      S("Sales Rep registers a new EP member (assisted registration)", "sales_rep", "/registration-kyc/assisted", "Field registration by the mapped Sales Rep", "A new member record in Pending / KYC pending", "Member events (Member 360 → History)", "members"),
      S("Reviewer approves the KYC documents", "evolve_finance_ops", "/registration-kyc/kyc", "Evolve operations verify Aadhaar, PAN and bank", "Document status Approved; member moves towards activation", "Member events + central audit", "kycApproved"),
      S("Reject one document with a reason (optional)", "evolve_finance_ops", "/registration-kyc/kyc", "Shows the correction path", "Document Rejected with reason; member stays pending that document", "Member events", "kycRejected"),
      S("Registration notification (N01 / N02) appears in Communication history", "client_admin", "/masters/communication/history", "Notifications are generated from the member events, never sent", "N01 / N02 events in history (simulated delivery)", "Communication audit", "commEvents"),
      S("Open the member in Member 360", "client_admin", "/members/directory", "Shows the joined-up record", "Registration history, KYC and wallet in one place", "—"),
    ],
  },
  {
    id: "SC-02", name: "Scanning and point credit", purpose: "A valid Scan-Out credits points through eSeal, rule checks, QR integrity, ledger and wallet", programme: "EP / Retailer", start: "Active member with an approved Scan-Out points configuration for the SKU", expected: "Scan record, ledger credit, wallet balance, N03 event and analytics update; duplicates and violations rejected with clear messages", modules: ["Scanning", "Wallet", "Fraud", "Communication", "Analytics"],
    steps: [
      S("Simulate a valid Scan-Out in the Demo Centre scan simulator", "super_admin", "/governance/demo-centre?tab=scan", "Stands in for the member app's scan", "Scan accepted; ledger credit (with EP TDS Kitty split) posted once", "Wallet ledger + scan record", "scanCredits"),
      S("Repeat the same QR — duplicate rejected", "super_admin", "/governance/demo-centre?tab=scan", "QR integrity check", "Rejected; no second credit; duplicate-QR signal in Fraud", "Fraud & risk audit", "duplicateQr"),
      S("Scan outside the 100 m geo-fence (Retailer / CS)", "super_admin", "/governance/demo-centre?tab=scan", "Geo-validation", "Scan blocked with the SOW message; risk signal raised", "Fraud & risk audit", "geoBlocked"),
      S("Check the wallet ledger and Scan report", "client_admin", "/reports/scans", "The same scan appears everywhere", "Scan report row, points flow and wallet balance updated", "—", "scanRecords"),
      S("N03 notification in Communication history", "client_admin", "/masters/communication/history", "Points-credited notification from the ledger", "N03 event (simulated delivery)", "Communication audit", "commEvents"),
    ],
  },
  {
    id: "SC-03", name: "Scheme configuration and settlement", purpose: "Maker builds a scheme, Checker approves, activity accrues, two-level settlement releases points", programme: "Any", start: "Seed dataset", expected: "Active scheme with accruals, settlement through two approval stages and a release to the wallet", modules: ["Scheme Builder", "Approvals", "Wallet", "Reports"],
    steps: [
      S("Maker creates a scheme in the 21-component Scheme Builder", "evolve_maker", "/schemes/new", "Configuration is a Maker activity", "Draft scheme", "Scheme audit", "schemes"),
      S("Maker submits it for approval", "evolve_maker", "/schemes/list", "Maker-Checker", "Approval request Pending", "Approval history", "requests"),
      S("Checker approves in the Approval Centre", "client_admin", "/governance/approvals", "Second person approves", "Request Approved → executed", "Approval history", "approved"),
      S("Activate the scheme", "evolve_maker", "/schemes/list", "Approved schemes are activated by an engine operator", "Scheme Active", "Scheme audit", "schemesActive"),
      S("Simulate qualifying scans (Demo Centre scan simulator)", "super_admin", "/governance/demo-centre?tab=scan", "Activity drives accruals", "Scheme accruals and exposure increase", "Scheme ledger audit", "schemeAccruals"),
      S("Request settlement", "evolve_maker", "/schemes/settlement", "Unsettled scheme points need settlement", "Settlement request with two approval stages", "Approval history", "settlements"),
      S("Complete both approval stages", "client_admin", "/governance/approvals", "Two-level approval", "Points released to Available", "Approval + wallet audit", "settlementReleases"),
    ],
  },
  {
    id: "SC-04", name: "Financial adjustment and reversal", purpose: "Manual points addition and its correction, both through Maker-Checker, with the original preserved", programme: "Any", start: "Seed dataset", expected: "Two ledger events (credit and reversal); original retained; audit shows both", modules: ["Wallet", "Approvals", "Finance reports", "Audit"],
    steps: [
      S("Maker submits a manual points addition", "evolve_finance_ops", "/wallet/adjustments", "Manual credits always need a second person", "Adjustment Pending approval", "Financial audit", "adjustments"),
      S("Maker tries to approve it — blocked", "evolve_finance_ops", "/governance/approvals/mine", "No self-approval, whatever the role", "Refused with reason", "Approval history"),
      S("Checker approves", "vguard_checker", "/governance/approvals", "Finance approval", "Ledger credit posted; wallet updated", "Approval + financial audit", "executed"),
      S("Maker raises a wrong-credit reversal", "evolve_finance_ops", "/wallet/reversals", "Corrections are new entries", "Reversal Pending approval", "Financial audit", "reversals"),
      S("Checker approves the reversal", "vguard_checker", "/governance/approvals", "Second person approves", "Reversal posted as a new ledger line; original kept", "Financial audit", "approved"),
      S("Check the ledger and finance report", "client_admin", "/wallet/ledger", "Both lines visible and reconciled", "Credit and reversal linked by reference", "—"),
    ],
  },
  {
    id: "SC-05", name: "Redemption and payout failure", purpose: "A redemption whose payout fails and is reversed automatically", programme: "EP / Retailer", start: "Redemption-eligible member", expected: "Failed payout in monitoring, reversal ledger line, wallet restored, N07, reconciliation", modules: ["Redemption", "Wallet", "Communication", "Reconciliation"],
    steps: [
      S("Member submits a UPI / bank redemption (Demo Centre → Member app simulator)", "evolve_finance_ops", "/governance/demo-centre?tab=scan", "Validation: balance, limits, KYC, bank, GST", "Redemption Pending; points reserved / debited", "Financial audit", "redemptions"),
      S("Simulate a payout failure", "evolve_finance_ops", "/redemption/payouts", "Payout gateway is a mock adapter", "Payout Failed with reference", "Payout monitoring", "payoutsFailed"),
      S("Automatic reversal returns the points", "evolve_finance_ops", "/wallet/ledger", "Configured reversal on failure", "Redemption reversal ledger line; wallet restored", "Financial audit", "redemptionReversals"),
      S("N07 in Communication history and reconciliation status", "client_admin", "/wallet/reconciliation", "Member informed (simulated); finance reconciles", "N07 event; reconciliation row", "—", "commEvents"),
    ],
  },
  {
    id: "SC-06", name: "Gift redemption and delivery", purpose: "A gift is published through approval, ordered, dispatched and delivered", programme: "Any", start: "Seed dataset", expected: "Published gift, order with tracking milestones, N09, gift reports updated", modules: ["Gift catalogue", "Approvals", "Wallet", "Fulfilment", "Communication"],
    steps: [
      S("Maker creates a gift item", "evolve_maker", "/gifts/catalogue/new", "Catalogue changes go through approval", "Draft gift", "Gift audit", "giftItems"),
      S("Checker approves publication", "client_admin", "/governance/approvals", "Second person approves", "Gift published (simulated)", "Approval history", "approved"),
      S("Create a gift order for an eligible member", "evolve_finance_ops", "/gifts/orders", "Points deducted through the Wallet service", "Order placed; ledger debit", "Gift + financial audit", "giftOrders"),
      S("Advance the order to Delivered", "evolve_finance_ops", "/gifts/tracking", "Logistics milestones (mock partner)", "Dispatched → Out for delivery → Delivered; N09", "Gift audit", "giftDelivered"),
    ],
  },
  {
    id: "SC-07", name: "Fraud detection and investigation", purpose: "A suspicious signal becomes a case; a false positive is cleared and a confirmed case leads to an approved restriction and later reinstatement", programme: "Any", start: "Seed dataset", expected: "Review-queue event, case with evidence, restriction applied through approval, reinstatement, history kept", modules: ["Fraud & risk", "Members", "Approvals"],
    steps: [
      S("Generate suspicious QR activity (duplicate scan in the scan simulator)", "super_admin", "/governance/demo-centre?tab=scan", "Signals come from the scan pipeline", "Event in the central review queue", "Fraud audit", "riskEvents"),
      S("Open an investigation case and attach evidence", "evolve_maker", "/governance/fraud/queue", "Investigator works the case", "Case with evidence and remarks", "Fraud audit", "riskCases"),
      S("Recommend a restriction; Checker approves", "client_admin", "/governance/approvals", "Restrictions never apply without approval", "Programme Block / Temporary Hold applied", "Member events + approval history", "restrictionsActive"),
      S("Request and approve reinstatement", "client_admin", "/members/restrictions", "Reinstatement through the existing process", "Restriction lifted; history retained", "Member events", "restrictionsLifted"),
    ],
  },
  {
    id: "SC-08", name: "Failed integration and retry", purpose: "An SFDC record fails validation, is traced, corrected and reprocessed", programme: "ST / CS / Retailer / DD", start: "Seed dataset", expected: "Failure in monitoring and trace; retry recorded with both attempts", modules: ["Integration monitoring", "Message trace", "Audit"],
    steps: [
      S("Inject an SFDC validation error (Demo Centre → Integrations)", "tech_ops", "/governance/demo-centre?tab=integrations", "Presenter control on the mock adapter", "Failed request with error", "Integration audit", "opsFailed"),
      S("Find it in Failures and Message trace", "tech_ops", "/monitoring/integrations/failures", "Operations sees the failure", "Trace shows the failed attempt", "—"),
      S("Retry after correcting the source", "tech_ops", "/monitoring/integrations/retry", "Authorised reprocessing, idempotent", "Successful retry linked to the original", "Integration audit", "opsRetries"),
      S("Open an incident if needed", "tech_ops", "/monitoring/integrations/incidents", "Incident management", "Incident record", "Integration audit", "incidents"),
    ],
  },
  {
    id: "SC-09", name: "Maker-Checker governance", purpose: "The same governance for scheme configuration, a financial adjustment and a member restriction", programme: "Any", start: "Seed dataset", expected: "Three requests: Maker cannot approve; Checker approves or rejects; execution only after approval; history kept", modules: ["Approvals", "Schemes", "Wallet", "Members"],
    steps: [
      S("Makers submit a scheme (Evolve Maker), an adjustment and a reinstatement (Evolve Finance / Operations)", "evolve_finance_ops", "/wallet/adjustments", "Three categories through one engine", "Three Pending requests", "Approval history", "requests"),
      S("Maker attempts self-approval — blocked", "evolve_finance_ops", "/governance/approvals/mine", "Segregation of duties", "Refused", "Approval history"),
      S("Checker rejects one request", "client_admin", "/governance/approvals", "Rejection leaves the original unchanged", "Rejected; nothing executed", "Approval history", "rejected"),
      S("Checker approves the others", "client_admin", "/governance/approvals", "Execution follows approval", "Approved and executed", "Approval history", "executed"),
    ],
  },
  {
    id: "SC-10", name: "View-As and member support", purpose: "A Sales Rep sees a member's app read-only; another branch is blocked", programme: "EP", start: "Seed dataset", expected: "Read-only session with masked identity values and disabled actions; out-of-branch attempt refused; both audited", modules: ["View-As", "Members", "Audit"],
    steps: [
      S("Start View-As for a Chennai North member (e.g. MBR-EP-0010)", "sales_rep", "/governance/platform/view-as?member=MBR-EP-0010", "Support by seeing what the member sees", "Read-only session and banner", "View-As session audit", "viewAsSessions"),
      S("Try a member from another branch — refused", "sales_rep", "/governance/platform/view-as", "Branch restriction", "Refused attempt recorded", "View-As attempts", "viewAsRefused"),
      S("Exit View-As from the banner", "sales_rep", "/governance/platform/view-as/session", "Ends the session", "Session closed with duration", "View-As session audit"),
    ],
  },
  {
    id: "SC-11", name: "Reporting and management review", purpose: "Management reviews dashboards and reports that come from the same records", programme: "All", start: "After any of the scenarios above", expected: "Figures reflect the scenario activity; export recorded in history", modules: ["Reports & analytics"],
    steps: [
      S("Open the business overview with a date range and programme", "client_admin", "/reports", "Shared filters", "Overview for the selection", "—"),
      S("Open Points flow, Scheme performance and Fraud analytics", "client_admin", "/reports/points", "Drill-down", "Figures include the new activity", "—"),
      S("Open Scan-In / Scan-Out and finance reports", "client_admin", "/reports/scans", "Operational and finance reports", "Scan rows and liability figures", "—"),
      S("Export a report (Demo Data marked)", "client_admin", "/reports/scans", "Exports are permission-checked and audited", "Export in history", "Analytics audit", "exports"),
    ],
  },
  {
    id: "SC-12", name: "Proposed service technician job (Proposed / Demo only)", purpose: "The proposed Module 12 job flow: Siebel confirmation controls reward eligibility", programme: "ST", start: "Seed dataset", expected: "Confirmed job becomes reward-eligible and is processed (simulated); rejected and timed-out jobs earn nothing", modules: ["Job management (proposed)"], proposed: true,
    steps: [
      S("Receive a mock Siebel job", "super_admin", "/future/job-management/incoming", "Siebel is the system of record", "Job Pending allocation", "Module 12 prototype audit", "jobs"),
      S("Assign, accept, start and complete (allocation and execution pages)", "super_admin", "/future/job-management/allocation", "Demo assignment, simulated technician app", "Completion submitted to mock Siebel", "Module 12 prototype audit"),
      S("Mock Siebel confirms; simulate reward processing", "super_admin", "/future/job-management/siebel", "Reward only after confirmation", "Reward eligible → simulated ledger reference", "Module 12 prototype audit", "jobRewardsSimulated"),
      S("Repeat with a rejection", "super_admin", "/future/job-management/siebel", "No reward on rejection", "Job Rejected; reward not eligible", "Module 12 prototype audit", "jobsRejected"),
      S("Repeat with no response (timeout)", "super_admin", "/future/job-management/siebel", "No automatic decision", "Awaiting Siebel; exception raised", "Module 12 prototype audit", "jobTimeouts"),
    ],
  },
];
