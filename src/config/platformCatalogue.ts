/**
 * Platform administration catalogue (Phase 13). SOW targets and wording are kept as written; nothing
 * here is a measured result. Coverage rows record what was found in this repository on review —
 * routes, components, services, tests — and the integration state separately from the feature state.
 */
import type { CoverageStatus, PlatformDecision } from "@/types/platform";
import type { ProgrammeCode } from "@/types/members";

export const PROGRAMMES: ProgrammeCode[] = ["EP", "ST", "CS", "Retailer", "DD"];

/* ======================= SOW role baseline (Module 10.2) ======================= */

export const SOW_ROLES: { id: string; sowRole: string; responsibilities: string; portalRoles: string[]; mapping: "mapped" | "partial" | "business_confirmation_required"; note: string }[] = [
  { id: "SR-HO", sowRole: "HO Admin (Super Admin)", responsibilities: "Whole programme, all branches and member types; permitted overrides are audited", portalRoles: ["VGUARD_CLIENT_ADMIN", "EVOLVE_SUPER_ADMIN"], mapping: "business_confirmation_required", note: "HO business governance maps to V-Guard Client Admin; platform administration stays with Evolve Super Admin, which holds no approval rights. Confirm under OP-RBAC1" },
  { id: "SR-RA", sowRole: "Regional Admin", responsibilities: "Manages their region; approves members where no Sales Rep exists", portalRoles: ["REGIONAL_ADMIN"], mapping: "partial", note: "Region scope enforced; member approval where no SR exists needs a Checker profile on Registration & KYC (assigned per person)" },
  { id: "SR-BM", sowRole: "Branch Manager / PIC", responsibilities: "Oversees and approves within their branch", portalRoles: ["BRANCH_MANAGER_PIC"], mapping: "mapped", note: "Branch scope; Stage-1 approval through a branch-scoped Checker profile" },
  { id: "SR-SR", sowRole: "Sales Rep (SR)", responsibilities: "Field work, EP registration, branch support and View-As", portalRoles: ["SALES_REP"], mapping: "mapped", note: "Branch scope; View-As limited to own branch" },
  { id: "SR-EO", sowRole: "Evolve Operations", responsibilities: "Second-level KYC approval, redemption cancellation, settlement processing and support", portalRoles: ["EVOLVE_OPERATIONS"], mapping: "mapped", note: "Redemption cancellation held only by Evolve Operations (SOW 10.5); approvals through Checker profiles" },
  { id: "SR-FIN", sowRole: "Finance", responsibilities: "TDS, liability, provisioning and ageing reports", portalRoles: ["FINANCE"], mapping: "mapped", note: "Finance reports; PAN unmasking through a named direct grant" },
];
export const SOW_ACTIONS = ["view", "create", "edit", "approve", "disable"] as const;

/** Money or member-status actions that must have a second person and a reason (SOW 10.2). */
export const SECOND_PERSON_ACTIONS: { action: string; requestTypes: string[]; module: string }[] = [
  { action: "Points adjustment (single and bulk)", requestTypes: ["points_adjustment", "points_adjustment_bulk", "points_addition", "points_deduction"], module: "points-adjustment" },
  { action: "Redemption cancellation", requestTypes: ["redemption_cancellation"], module: "redemption" },
  { action: "Scheme settlement", requestTypes: ["scheme_settlement"], module: "scheme-settlement" },
  { action: "GST override", requestTypes: ["gst_override", "tds_gst_override"], module: "gst-gate" },
  { action: "Member block", requestTypes: ["member_block"], module: "members" },
  { action: "Temporary hold", requestTypes: ["temporary_hold_change"], module: "members" },
  { action: "Reinstatement", requestTypes: ["member_reinstate", "programme_block_removal"], module: "members" },
  { action: "Sensitive member profile override", requestTypes: ["member_info_correction", "kyc_status_override"], module: "members" },
  { action: "Insurance bulk upload", requestTypes: ["insurance_batch_upload"], module: "insurance" },
  { action: "Financial configuration change", requestTypes: ["financial_rule_change", "redemption_limit_change"], module: "financial" },
];

/* ======================= SOW Admin Feature coverage (Module 10) ======================= */

export interface CoverageRow { ref: string; feature: string; sowLocation: string; phase: string; route: string; component: string; service: string; test: string; permission: string; audit: string; status: CoverageStatus; integration: "mock_service" | "prepared" | "live" | "none"; gap: string; remediation: string }
const r = (x: CoverageRow) => x;
export const AF_COVERAGE: CoverageRow[] = [
  r({ ref: "AF01", feature: "V-Guard Email Single Sign-On", sowLocation: "Module 10.2", phase: "Phase 2 / 13", route: "/signed-out (development sign-in)", component: "pages/SignedOut.tsx · Platform → Admin Access & SSO", service: "services/auth.ts (AUTH_CONFIG, SAML structure)", test: "platform.test 1–3", permission: "users:*", audit: "Access log (sign_in / identity_switch / sign_out)", status: "backend_integration_prepared", integration: "prepared", gap: "No identity provider connected; development identities only", remediation: "Connect V-Guard IdP (SAML values supplied at deployment)" }),
  r({ ref: "AF02", feature: "Predicting unusual scan counts", sowLocation: "Module 10.8 / 9", phase: "Phase 10", route: "/governance/fraud/anomaly", component: "pages/fraud/RulePages.tsx · AnomalyPage", service: "features/risk/store ingestPredictive", test: "risk.test 2, 30–36", permission: "fraud-rules", audit: "Risk audit", status: "fully_implemented", integration: "mock_service", gap: "Predictive model simulated; thresholds OP-02", remediation: "Connect the anomaly service" }),
  r({ ref: "AF03", feature: "Backend gift redemption, with or without points", sowLocation: "Module 10.5 / 5 / 8", phase: "Phases 7, 9", route: "/gifts/backend", component: "pages/gifts/BackendGiftPage.tsx", service: "features/wallet/store submitGift", test: "gifts.test, wallet.test", permission: "gift-redemption", audit: "Wallet + gift audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF04", feature: "Adding or deducting points with remarks", sowLocation: "Module 10.5", phase: "Phase 7", route: "/wallet/adjustments", component: "pages/wallet adjustments", service: "features/wallet/store submitAdjustment", test: "wallet.test", permission: "points-adjustment", audit: "Wallet audit + approval history", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF05", feature: "Product/SKU master, branch tagging and error settings", sowLocation: "Module 10.4", phase: "Phase 4", route: "/masters/products, /masters/scanning/exceptions", component: "pages/masters", service: "features/masters/store", test: "schemes.test (scan-config steps)", permission: "products, scan-config", audit: "Master audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF06", feature: "Banners: image, video, GIF and deep link", sowLocation: "Module 10.7 / 7", phase: "Phase 8", route: "/masters/communication/banners", component: "pages/comms/ContentPages.tsx", service: "features/comms/store", test: "comms.test", permission: "banners", audit: "Comms audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF07", feature: "Scheme setup by user, branch, PC/SPC, Rishta ID, geo-fence and behaviour", sowLocation: "Module 10.6 / 6", phase: "Phase 6", route: "/schemes/new", component: "pages/schemes builder", service: "features/schemes/engine (TARGET_DIMENSIONS)", test: "schemes.test", permission: "schemes", audit: "Scheme audit", status: "partially_implemented", integration: "mock_service", gap: "Some targeting dimensions have no source attribute (marked unavailable)", remediation: "Supply PC/SPC and behaviour attributes from source systems" }),
  r({ ref: "AF09", feature: "Blocking and unblocking a member", sowLocation: "Module 10.3 / 3", phase: "Phases 5, 10", route: "/members/restrictions", component: "pages/members", service: "features/members/store", test: "risk.test, schemes.test", permission: "members:disable, members:hold", audit: "Member events + approval history", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF10", feature: "Blocking redemption and scanning", sowLocation: "Module 10.5", phase: "Phases 7, 10", route: "/governance/fraud/redemption, /governance/fraud/rules", component: "pages/fraud/VectorPages.tsx", service: "features/risk/store (global restrictions, redemption blocks)", test: "risk.test 70–80", permission: "fraud-rules", audit: "Risk audit", status: "fully_implemented", integration: "mock_service", gap: "Handset/scan engine enforcement not connected", remediation: "Connect scan and redemption services" }),
  r({ ref: "AF11", feature: "Rule-based, event-based and manual communication", sowLocation: "Module 10.7 / 7", phase: "Phase 8", route: "/masters/communication/rules, /compose", component: "pages/comms", service: "features/comms/store", test: "comms.test", permission: "communication", audit: "Comms audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF12", feature: "Audit trail", sowLocation: "Module 10.10 / 9", phase: "Phases 2–13", route: "/governance/platform/audit", component: "pages/platform Audit console", service: "features/platform/store platformAuditEvents (reads every module audit)", test: "platform.test 59–67", permission: "platform-admin", audit: "All modules", status: "fully_implemented", integration: "mock_service", gap: "Audit lives in browser storage; immutable server store not connected", remediation: "Backend audit service" }),
  r({ ref: "AF13", feature: "Welcome Bonus, Assured Scratch and Mega Scratch", sowLocation: "Module 10.6 / 6", phase: "Phase 6", route: "/schemes/gamification", component: "pages/schemes IncentivePages", service: "features/schemes/store bonuses", test: "schemes.test", permission: "gamification", audit: "Scheme audit", status: "business_confirmation_required", integration: "mock_service", gap: "Bonus values and odds pending OP-SB-BONUS", remediation: "Confirm bonus rules" }),
  r({ ref: "AF14", feature: "Tier setup and branch-wise tier value", sowLocation: "Module 10.6 / 6", phase: "Phase 6", route: "/schemes/tiers", component: "pages/schemes tiers", service: "features/schemes/store tiers (TierBranchConfig)", test: "schemes.test", permission: "tiers", audit: "Scheme audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF15", feature: "Registration approval", sowLocation: "Module 10.3", phase: "Phase 5", route: "/registration-kyc/queue", component: "pages/members RegistrationPages", service: "features/members/store", test: "approval steps (schemes.test 119)", permission: "registration-kyc", audit: "Member events", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF16", feature: "Editing member details", sowLocation: "Module 10.3", phase: "Phase 5", route: "/members/member/:id", component: "pages/members/Member360Page.tsx", service: "features/members/store", test: "members via approval steps", permission: "members:edit, members:override", audit: "Member events", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF17", feature: "Full member history", sowLocation: "Module 10.3", phase: "Phase 5", route: "/members/activity, Member 360", component: "pages/members", service: "features/members/store events", test: "analytics.test 92", permission: "members:view", audit: "Member events", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF18", feature: "Social and contact links", sowLocation: "Module 10.7 / 7", phase: "Phase 8", route: "/masters/communication/links", component: "pages/comms/ContentPages.tsx", service: "features/comms/store", test: "comms.test", permission: "content", audit: "Comms audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF19", feature: "Tutorials, testimonials and leaderboard content", sowLocation: "Module 10.7 / 7", phase: "Phases 6, 8", route: "/masters/communication/content, /schemes/gamification", component: "pages/comms/ContentPages.tsx, IncentivePages", service: "features/comms/store, schemes games", test: "comms.test", permission: "content, gamification", audit: "Comms + scheme audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF20", feature: "Insurance card upload and administration", sowLocation: "Module 10.7 / 8", phase: "Phase 9", route: "/gifts/insurance", component: "pages/gifts/InsurancePages.tsx", service: "features/gifts/store", test: "gifts.test", permission: "insurance", audit: "Gift audit + approval", status: "fully_implemented", integration: "mock_service", gap: "Approval authority OP-INS1", remediation: "" }),
  r({ ref: "AF21", feature: "Rule-based unusual redemption, Scan-In and Scan-Out checks", sowLocation: "Module 10.8 / 9", phase: "Phase 10", route: "/governance/fraud/rules", component: "pages/fraud/RulePages.tsx", service: "features/risk/store saveRule / ruleServiceEvaluate", test: "risk.test", permission: "fraud-rules", audit: "Risk audit", status: "business_confirmation_required", integration: "mock_service", gap: "Thresholds unconfirmed (OP-02): rules stay inactive", remediation: "Confirm thresholds" }),
  r({ ref: "AF22", feature: "Minimum balance settings by value and scan count", sowLocation: "Module 10.5", phase: "Phase 7", route: "/redemption/limits", component: "pages/redemption/RedemptionPages.tsx", service: "features/wallet/store limits", test: "wallet.test", permission: "redemption-limits", audit: "Wallet audit + WF-023", status: "partially_implemented", integration: "mock_service", gap: "By-value limits implemented; by-scan-count limits pending OP-08", remediation: "Confirm scan-count limits (OP-08)" }),
  r({ ref: "AF23", feature: "Minimum total points balance", sowLocation: "Module 10.5", phase: "Phase 7", route: "/redemption/limits", component: "pages/redemption/RedemptionPages.tsx", service: "features/wallet/engine limitCheck", test: "wallet.test", permission: "redemption-limits", audit: "Wallet audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF24", feature: "Scheme settlement rules", sowLocation: "Module 10.6", phase: "Phases 6, 7", route: "/schemes/settlement, /wallet/settlement", component: "pages/schemes, pages/wallet", service: "features/schemes/store settlements", test: "schemes.test", permission: "scheme-settlement", audit: "Scheme audit + approval", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF25", feature: "AND/OR scanning restrictions", sowLocation: "Module 10.4 / 4", phase: "Phase 4", route: "/masters/scanning/rules", component: "pages/masters scanning rules", service: "features/masters/engine (RuleGroup)", test: "schemes.test (scan-config)", permission: "scan-config", audit: "Master audit", status: "fully_implemented", integration: "mock_service", gap: "", remediation: "" }),
  r({ ref: "AF26", feature: "Referral setup by rule, branch and role", sowLocation: "Module 10.6 / 6", phase: "Phase 6", route: "/schemes/referrals", component: "pages/schemes IncentivePages", service: "features/schemes/store referrals", test: "schemes.test", permission: "referrals", audit: "Scheme audit", status: "fully_implemented", integration: "mock_service", gap: "Retailer → Consumer referral excluded (inactive)", remediation: "" }),
  r({ ref: "AF27", feature: "Pincode master setup", sowLocation: "Module 10.4", phase: "Phase 4", route: "/masters/branches", component: "pages/masters/BranchesPage.tsx", service: "features/masters/store (pincode mapping, ownership setting)", test: "—", permission: "branches", audit: "Master audit", status: "partially_implemented", integration: "mock_service", gap: "Pincodes mapped per branch; ownership (SFDC vs portal) pending confirmation; no automated test", remediation: "Confirm pincode ownership" }),
  r({ ref: "AF28", feature: "Sales hierarchy setup", sowLocation: "Module 10.4", phase: "Phase 4", route: "/masters/branches", component: "pages/masters/BranchesPage.tsx", service: "features/masters/store hierarchy", test: "—", permission: "branches", audit: "Master audit", status: "partially_implemented", integration: "mock_service", gap: "State → district → branch hierarchy is managed; ASM / SR sales hierarchy above the member's SR mapping is not a separate master", remediation: "Confirm sales hierarchy levels and source (SFDC)" }),
];

/* ======================= Performance targets (SOW 14.1) ======================= */

export const PERF_TARGETS: { id: string; request: string; p95: string; p95Ms: number | null; p99: string; p99Ms: number | null; timeout: string; failure: string }[] = [
  { id: "PT-01", request: "App launch to home rendered", p95: "2 seconds", p95Ms: 2000, p99: "4 seconds", p99Ms: 4000, timeout: "Not specified", failure: "Show skeleton placeholders; never a blank screen" },
  { id: "PT-02", request: "Login — fingerprint / facial / MPIN", p95: "1 second", p95Ms: 1000, p99: "2 seconds", p99Ms: 2000, timeout: "Not specified", failure: "Clear retry message; routine login never depends on SMS" },
  { id: "PT-03", request: "OTP delivery", p95: "3 seconds", p95Ms: 3000, p99: "6 seconds", p99Ms: 6000, timeout: "30 seconds", failure: "Offer resend after 30 seconds and a support path" },
  { id: "PT-04", request: "Wallet balance", p95: "500 milliseconds", p95Ms: 500, p99: "1 second", p99Ms: 1000, timeout: "Not specified", failure: "Show last known balance with timestamp; never a false zero" },
  { id: "PT-05", request: "Scan acknowledgement on screen", p95: "300 milliseconds", p95Ms: 300, p99: "Not specified", p99Ms: null, timeout: "Not specified", failure: "Visible confirmation that the code was read, before point credit finishes" },
  { id: "PT-06", request: "Scan — points credited and wallet updated", p95: "500 milliseconds", p95Ms: 500, p99: "1 second", p99Ms: 1000, timeout: "3 seconds", failure: "Clear failure message with the scan reference" },
  { id: "PT-07", request: "Redemption — request accepted", p95: "1 second", p95Ms: 1000, p99: "2 seconds", p99Ms: 2000, timeout: "Not specified", failure: "Fail cleanly before payout if the request cannot be accepted" },
  { id: "PT-08", request: "Redemption — payout confirmed", p95: "As per Module 5.3", p95Ms: null, p99: "Not specified", p99Ms: null, timeout: "15 seconds", failure: "Failed payout follows automatic point reversal (Module 5.3)" },
  { id: "PT-09", request: "Scheme list", p95: "1 second", p95Ms: 1000, p99: "2 seconds", p99Ms: 2000, timeout: "Not specified", failure: "Show the cached list if a live fetch is unavailable" },
  { id: "PT-10", request: "Passbook / scan history — first page", p95: "1 second", p95Ms: 1000, p99: "2 seconds", p99Ms: 2000, timeout: "Not specified", failure: "Show cached entries; load older pages on scroll" },
  { id: "PT-11", request: "WhatsApp bot reply", p95: "2 seconds", p95Ms: 2000, p99: "4 seconds", p99Ms: 4000, timeout: "Not specified", failure: "Escalate to an agent if the bot cannot respond" },
  { id: "PT-12", request: "Admin portal — page load", p95: "2 seconds", p95Ms: 2000, p99: "4 seconds", p99Ms: 4000, timeout: "Not specified", failure: "Loading state rather than a blank screen" },
  { id: "PT-13", request: "Admin portal — report export", p95: "10 seconds", p95Ms: 10000, p99: "Not specified", p99Ms: null, timeout: "Beyond row ceiling: queue job and email link", failure: "Beyond the row ceiling, queue the export and email a link" },
];
export const PER_HOP = ["App to gateway", "Gateway to scan service", "Scan service to eSeal", "Ledger write", "Third-party calls"];

/* ======================= Capacity (SOW 14.2) and load tests (14.6) ======================= */

export const CAPACITY_TARGETS = [
  { id: "CP-01", metric: "Member profiles", target: "15 lakh" },
  { id: "CP-02", metric: "Scans per day", target: "1 lakh" },
  { id: "CP-03", metric: "Redemptions per month", target: "1 lakh" },
  { id: "CP-04", metric: "Concurrent users at peak", target: "10,000 without slowdown" },
  { id: "CP-05", metric: "Auto-scaling trigger", target: "CPU above 70%" },
  { id: "CP-06", metric: "API rate limit per member", target: "100 API calls per minute (beyond: refused with “try again shortly”)" },
  { id: "CP-07", metric: "Deployment", target: "Zero downtime" },
];
export const LOAD_SCENARIOS = [
  { id: "LT-A", name: "Scenario A — SOW load-test scenario (14.6)", users: "2,000 concurrent users", scans: "10,000 scans per hour", note: "Duration and ramp profile to agree with V-Guard IT" },
  { id: "LT-B", name: "Scenario B — Go-live capacity gate (14.7)", users: "10,000 users", scans: "1 lakh scans", note: "Interpretation of 10,000 users, duration and ramp to agree with V-Guard IT" },
];

/* ======================= Security (SOW 14.4) ======================= */

export const SECURITY_CONTROLS = [
  { id: "SC-01", requirement: "Personal data", spec: "Tokenised", backend: "Tokenisation service (not connected)", frontend: "Portal shows masked references only (PAN, Aadhaar, bank, mobile)" },
  { id: "SC-02", requirement: "Data in transit", spec: "TLS 1.3", backend: "Infrastructure / load balancer configuration", frontend: "Vercel preview serves HTTPS; TLS version not evidenced here" },
  { id: "SC-03", requirement: "Data at rest", spec: "AES-256", backend: "Database / storage encryption", frontend: "None (browser sessionStorage holds development data only)" },
  { id: "SC-04", requirement: "API device security", spec: "Every API call checks device fingerprint", backend: "API gateway / device service", frontend: "None: must not be enforced only in React" },
  { id: "SC-05", requirement: "Device fingerprint mismatch", spec: "End session and log security event", backend: "Session service + security event log", frontend: "Device governance views (Phase 10) read the events" },
  { id: "SC-06", requirement: "KYC data retention", spec: "Seven years after account closure", backend: "Retention policy in KYC store", frontend: "No KYC deletion action exists in the portal" },
  { id: "SC-07", requirement: "Scan history", spec: "Never deleted", backend: "Scan service", frontend: "No delete action exists for scans" },
  { id: "SC-08", requirement: "Transaction history", spec: "Never deleted", backend: "Ledger (immutable; corrections are new lines)", frontend: "Ledger has no delete; reversals are new lines" },
  { id: "SC-09", requirement: "Audit", spec: "Every important action is recorded", backend: "Audit service", frontend: "Module audits + central console" },
];

/* ======================= Acceptance criteria (SOW 14.5) ======================= */

export const ACCEPTANCE_CRITERIA = [
  { id: "AC-KYC-1", flow: "KYC", requirement: "An EP can complete Aadhaar, bank and PAN within 3 minutes", method: "Timed UAT session on the reference device" },
  { id: "AC-KYC-2", flow: "KYC", requirement: "SR/PIC approval takes effect within 10 seconds", method: "Timestamp from approval to member status change" },
  { id: "AC-KYC-3", flow: "KYC", requirement: "Evolve approval takes effect within 24 hours", method: "Queue SLA report" },
  { id: "AC-SCAN-1", flow: "Scan", requirement: "98% of QR codes scan successfully on the first attempt", method: "Scan service first-attempt success rate" },
  { id: "AC-SCAN-2", flow: "Scan", requirement: "Points credit within 500 milliseconds at p95", method: "Client-side measurement, reference device" },
  { id: "AC-SCAN-3", flow: "Scan", requirement: "Points credit within 1 second at p99", method: "Client-side measurement, reference device" },
  { id: "AC-SCAN-4", flow: "Scan", requirement: "A duplicate code is blocked within 1 second", method: "Duplicate-scan test" },
  { id: "AC-RED-1", flow: "Redemption", requirement: "Bank transfer completes within 1 minute", method: "Payout provider timestamps" },
  { id: "AC-RED-2", flow: "Redemption", requirement: "UTR appears in the passbook within 3 bank working days", method: "Passbook reconciliation" },
  { id: "AC-RED-3", flow: "Redemption", requirement: "Failed payout automatically reverses points within 24 hours", method: "Failed-payout test" },
  { id: "AC-ADM-1", flow: "Admin portal", requirement: "A scheme can be created within 5 minutes", method: "Timed UAT session" },
  { id: "AC-ADM-2", flow: "Admin portal", requirement: "Fraud alerts fire within 30 seconds of suspicious activity", method: "Detection-to-alert latency" },
  { id: "AC-ADM-3", flow: "Admin portal", requirement: "Reports export within 10 seconds (background job beyond the row ceiling)", method: "Export timing test" },
];

/* ======================= Go-live gates (SOW 14.7) ======================= */

export const GO_LIVE_GATES = [
  { id: "GL-01", check: "All critical bugs (P0 and P1) resolved", owner: "Evolve", supporting: "V-Guard IT", requiredEvidence: "Defect register with zero open P0/P1" },
  { id: "GL-02", check: "UAT signed off by business team", owner: "V-Guard Business", supporting: "Evolve", requiredEvidence: "Signed UAT cycle" },
  { id: "GL-03", check: "Load test passed — 10,000 users and 1 lakh scans", owner: "Evolve + V-Guard IT", supporting: "", requiredEvidence: "Load test report (Scenario B)" },
  { id: "GL-04", check: "Security audit passed, including DPDP compliance", owner: "V-Guard IT", supporting: "Evolve", requiredEvidence: "Security audit report" },
  { id: "GL-05", check: "Rollback plan documented, with expected restoration time", owner: "Evolve", supporting: "", requiredEvidence: "Rollback plan + rollback test" },
  { id: "GL-06", check: "Monitoring dashboards live — operations portal and fraud alerts", owner: "Evolve", supporting: "", requiredEvidence: "Live telemetry connected to Integration Monitoring and Fraud alerts" },
  { id: "GL-07", check: "Support teams trained — Evolve call centre and V-Guard admins", owner: "Both", supporting: "", requiredEvidence: "Training attendance records" },
  { id: "GL-08", check: "Data migration validated — existing members, wallet balances and TDS Kitty", owner: "Evolve + V-Guard", supporting: "", requiredEvidence: "Signed migration reconciliation" },
];
export const CUTOVER_ITEMS = ["Migration scope confirmed", "Programme scope confirmed", "Source snapshot approved", "Target environment ready", "Member migration validated", "Wallet reconciliation signed off", "TDS Kitty reconciliation signed off", "Scan history validated", "Redemption history validated", "Exception review completed", "Business validation completed", "Cutover plan approved", "Rollback plan approved"];
export const RELEASE_ITEMS = ["Application deployment (zero downtime)", "API compatibility", "Database migrations (backward compatible)", "Feature flags", "Health checks", "Rollback", "Session continuity", "Member-facing service availability"];

/* ======================= Error message catalogue (SOW 14.3) ======================= */

export const ERROR_CATALOGUE = [
  { id: "ERR-NET", category: "Network", code: "NETWORK_UNAVAILABLE", message: "Unable to connect. Please check your internet and try again.", module: "All", retry: "Retry button", support: "Retry", incident: false },
  { id: "ERR-5XX", category: "Server error", code: "HTTP_5XX", message: "Something went wrong. Our team is working on it. Please try again in a few minutes.", module: "All", retry: "Retry later", support: "Incident reference logged automatically", incident: true },
  { id: "ERR-TIMEOUT", category: "Network", code: "REQUEST_TIMEOUT / HTTP_504", message: "Unable to connect. Please check your internet and try again.", module: "All", retry: "Retry button", support: "Treated as a network problem", incident: false },
  { id: "ERR-4XX-AADHAAR", category: "Invalid request", code: "HTTP_400 INVALID_AADHAAR", message: "Invalid Aadhaar number.", module: "KYC", retry: "Correct and resubmit", support: "Help", incident: false },
  { id: "ERR-4XX-DUPQR", category: "Invalid request", code: "HTTP_409 QR_ALREADY_SCANNED", message: "QR already scanned.", module: "Scanning", retry: "None", support: "Raise a ticket if this is wrong", incident: false },
  { id: "ERR-4XX-BAL", category: "Invalid request", code: "HTTP_422 INSUFFICIENT_BALANCE", message: "Insufficient balance.", module: "Redemption", retry: "None", support: "View wallet", incident: false },
  { id: "ERR-RATE", category: "Rate limit", code: "HTTP_429", message: "Please try again shortly.", module: "All", retry: "Retry after a short wait", support: "SOW 14.2 rate limit", incident: false },
];
/** Technical words a member must never see (SOW 14.3). */
export const FORBIDDEN_TERMS = ["Gateway Timeout", "HTTP 504", "504", "Stack Trace", "Internal Server Error", "Exception", "HTTP 5"];

/* ======================= Testing and UAT (SOW 14.6) ======================= */

export const UAT_AREAS = ["Registration and KYC", "Login and device security", "Scanning", "Schemes", "Wallet and points", "Redemption", "TDS", "Gift catalogue", "Insurance", "Communication", "Fraud", "Member support", "Reports and analytics", "Application performance"];
export const INTEGRATION_TESTS: { id: string; integration: string; scenario: string; expected: string; mockCovered: string | null }[] = [
  ...["SFDC", "eSeal", "DigiLocker", "Payment gateway", "WhatsApp"].flatMap((i) => [
    ["Happy path", "Request accepted and recorded"], ["Timeout", "Marked timed out; never reported healthy"], ["Retry", "Idempotent retry through the backend contract"], ["Fallback", "Documented fallback or clear failure"], ["Callback failure", "Callback failure alert raised"], ["Duplicate callback", "Duplicate ignored"], ["Data validation failure", "Rejected with reason; not synced"], ["Provider unavailable", "Unknown / failed health; alert raised"],
  ].map(([s, e], n) => ({ id: `IT-${i.replace(/\W/g, "").toUpperCase().slice(0, 6)}-${n + 1}`, integration: i, scenario: s, expected: e, mockCovered: i === "SFDC" || i === "eSeal" || i === "WhatsApp" || i === "Payment gateway" ? (["Happy path", "Timeout", "Retry", "Callback failure"].includes(s) ? "ops.test (mock adapters)" : null) : s === "Happy path" ? "ops.test (mock adapters)" : null }))),
];

/* ======================= Scope control (Annexure A) ======================= */

export const OUT_OF_SCOPE = [
  { id: "EX-01", item: "Training & Certification Module", status: "excluded" as const, found: "Not implemented", refs: "Annexure A" },
  { id: "EX-02", item: "Consumer Loyalty Programme", status: "excluded" as const, found: "Not implemented", refs: "Annexure A" },
  { id: "EX-03", item: "Retailer → Consumer Referral", status: "excluded" as const, found: "Relationship exists in the referral catalogue as inactive (“future”); cannot be activated", refs: "Annexure A" },
  { id: "PR-12", item: "Module 12 — Job Management & Field Tooling (job allocation, technician workflows, job-based points, Happy Points, E-ID card, direct orders, quotations, retailer tagging, installation verification, separate Sales Executive app)", status: "proposed" as const, found: "Prototype and scope assessment only (Phase 14, Future scope → Job management & field tooling, Super Admin only, demo mode). Nothing is live; the analytics job dashboard stays a disabled placeholder", refs: "OP-52/OP-55, OP-53, OP-56, OP-58, OP-57, OP-59, OP-63, OP-29, OP-27/OP-28, OP-26, OP-36/OP-37" },
];

/* ======================= Phase 13 decisions ======================= */

const d = (x: Omit<PlatformDecision, "status" | "decisionDate" | "evidence">): PlatformDecision => ({ ...x, status: "open", decisionDate: null, evidence: "" });
export const PLATFORM_DECISIONS: PlatformDecision[] = [
  d({ id: "OP-RBAC1", ref: "OP-RBAC1", module: "Module 10.2", description: "Final role list and View / Create / Edit / Approve / Disable mapping, including who can reset an MPIN and cancel a redemption", impact: "Every permission", affected: "Role governance, Member 360 MPIN reset, redemption cancellation", businessOwner: "V-Guard HO", technicalOwner: "Evolve Platform Administration", restriction: "Role crosswalk kept; MPIN reset and cancellation stay with their current holders" }),
  d({ id: "OP-THEME1", ref: "OP-THEME1", module: "Module 10.8", description: "Whether tier and festival app themes are needed now, and which member app screens each affects", impact: "Member app theming", affected: "App Theme Management", businessOwner: "V-Guard Marketing", technicalOwner: "Evolve Technology", restriction: "Themes can be drafted and approved but not published" }),
  d({ id: "OP-TICKET1", ref: "OP-TICKET1", module: "Module 14.3", description: "Ticketing tool (Jira or similar), which V-Guard users see tickets, and who sees Evolve resolution comments", impact: "Incident visibility", affected: "Error catalogue incidents", businessOwner: "V-Guard IT", technicalOwner: "Evolve Operations", restriction: "Incidents recorded in the portal only; no ticketing integration" }),
  d({ id: "OP-UAT1", ref: "OP-UAT1", module: "Module 14.6", description: "UAT participants, the ~20 pilot members, programme allocation, the two-week window and final sign-off authority", impact: "UAT sign-off and go-live gate GL-02", affected: "Testing & UAT", businessOwner: "V-Guard Business", technicalOwner: "Evolve", restriction: "UAT cannot be signed off" }),
  d({ id: "OP-MIG1", ref: "OP-MIG1", module: "Module 14.8", description: "Programmes and member volumes to migrate, wallet and TDS Kitty reconciliation, validation owner and cutover sequencing", impact: "Go-live gate GL-08", affected: "Data Migration Readiness", businessOwner: "V-Guard Business + Finance", technicalOwner: "Evolve", restriction: "Migration gate stays blocked" }),
  d({ id: "OP-VIEWAS1", ref: "OP-VIEWAS1", module: "Module 10.7", description: "View-As inactivity timeout (not specified in the SOW) and which roles hold the HO override", impact: "View-As session security", affected: "View-As", businessOwner: "V-Guard IT", technicalOwner: "Evolve", restriction: "Development timeout in use; override held by Client Admin and Evolve Operations" }),
  d({ id: "OP-USAGE1", ref: "OP-USAGE1", module: "Module 10.12", description: "Definitions of bounce / exit rate, session and app open from the app telemetry instrumentation", impact: "Application usage analytics", affected: "App Usage Analytics", businessOwner: "V-Guard Product", technicalOwner: "Evolve Technology", restriction: "Mock telemetry definitions shown and labelled" }),
  d({ id: "OP-PERF1", ref: "OP-PERF1", module: "Module 14.1", description: "Reference low-end Android device and the per-hop latency budget including third-party calls", impact: "Performance acceptance", affected: "Performance & Capacity", businessOwner: "V-Guard IT", technicalOwner: "Evolve Technology", restriction: "Targets show Pending Engineering Evidence" }),
  d({ id: "OP-LOAD1", ref: "OP-LOAD1", module: "Module 14.6 / 14.7", description: "Duration, ramp profile and interpretation of 10,000 users / 1 lakh scans for the load tests", impact: "Go-live gate GL-03", affected: "Capacity test plan", businessOwner: "V-Guard IT", technicalOwner: "Evolve Technology", restriction: "Load tests not marked passed" }),
];

/* ======================= Operational governance register (SOW 10.13, Module 14) ======================= */

/** Who operates, approves and supports each function. Draft until OP-RBAC1 confirms the final roles. */
export const OPERATIONAL_OWNERSHIP: { id: string; area: string; operates: string; approves: string; supports: string; escalation: string; source: string }[] = [
  { id: "OG-01", area: "Admin access and roles", operates: "Evolve Super Admin", approves: "V-Guard Client Admin", supports: "V-Guard IT (SSO)", escalation: "V-Guard IT", source: "SOW 10.2" },
  { id: "OG-02", area: "Member registration and KYC queues", operates: "Evolve Operations", approves: "Branch PIC / Sales Rep (SR/PIC approvals), Evolve (final)", supports: "Evolve call centre", escalation: "Evolve Operations lead", source: "SOW 3, 14.5" },
  { id: "OG-03", area: "Scheme configuration", operates: "Evolve Operations (Maker)", approves: "V-Guard Business (Checker)", supports: "Evolve", escalation: "V-Guard Business owner", source: "SOW 6" },
  { id: "OG-04", area: "Points adjustments and settlements", operates: "Evolve Operations (Maker)", approves: "V-Guard Finance (Checker)", supports: "Evolve", escalation: "V-Guard Finance", source: "SOW 5, 10.3" },
  { id: "OG-05", area: "Redemption and payouts", operates: "Evolve Operations", approves: "V-Guard Finance", supports: "Payment gateway provider", escalation: "V-Guard Finance", source: "SOW 7" },
  { id: "OG-06", area: "TDS and kitty", operates: "Evolve Operations", approves: "V-Guard Finance", supports: "V-Guard Tax", escalation: "V-Guard Finance", source: "SOW 5.4" },
  { id: "OG-07", area: "Fraud review and blocks", operates: "Evolve Operations", approves: "V-Guard Client Admin", supports: "V-Guard Business", escalation: "V-Guard Client Admin", source: "SOW 9" },
  { id: "OG-08", area: "Communication templates and campaigns", operates: "Evolve Operations", approves: "V-Guard Business", supports: "WhatsApp / SMS providers", escalation: "V-Guard Marketing", source: "SOW 8" },
  { id: "OG-09", area: "Integration monitoring and incidents", operates: "Evolve Operations", approves: "—", supports: "V-Guard IT, integration providers", escalation: "Evolve on-call (ticketing tool pending OP-TICKET1)", source: "SOW 11, 14.3" },
  { id: "OG-10", area: "KPI definitions and thresholds", operates: "Evolve Operations", approves: "V-Guard Client Admin", supports: "V-Guard management", escalation: "V-Guard management", source: "SOW 10.9" },
  { id: "OG-11", area: "App themes", operates: "Evolve Operations (Maker)", approves: "V-Guard Client Admin", supports: "V-Guard Marketing", escalation: "V-Guard Marketing", source: "SOW 10.8 (OP-THEME1)" },
  { id: "OG-12", area: "Release, UAT and go-live", operates: "Evolve", approves: "V-Guard Business + V-Guard IT", supports: "Both", escalation: "Steering committee", source: "SOW 14.6, 14.7" },
];
