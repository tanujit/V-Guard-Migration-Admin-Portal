/**
 * Integration operations configuration (Phase 11). The ten SOW 11.1 connections exactly as named,
 * the Channel Check placeholder (OP-45), SOW performance baselines and the open decision register.
 * No endpoint URL, authentication scheme, payload structure, owner or retry policy is invented: where
 * the SOW is silent the value is null and shown as Business Confirmation Required.
 */
import type { AlertType, HealthStatus, Integration, OpsDecision } from "@/types/ops";

const base = (p: Partial<Integration> & Pick<Integration, "id" | "code" | "name" | "category" | "source" | "target" | "direction" | "purpose" | "frequency" | "dataTypes">): Integration => ({
  frequencyStatus: "sow",
  sowRef: "SOW 11.1",
  environment: "development",
  connection: "mock_adapter",
  authType: null,
  contractRef: null,
  contractStatus: "business_confirmation_required",
  credentialRef: null,
  ownership: { business: null, technical: null, data: null },
  dataOwnership: "",
  failureHandling: "",
  retryPolicy: null,
  monitoring: "mock_telemetry",
  decisions: [],
  config: {},
  ...p,
});

export const SOW_INTEGRATIONS: Integration[] = [
  base({ id: "INT-SFDC", code: "SFDC", name: "Salesforce (SFDC)", category: "CRM / master data", source: "SFDC", target: "Rishta platform", direction: "both", purpose: "Member records for ST, CS, Retailer and DD; district, branch and ASM hierarchy; territory and sales data; registration results written back", frequency: "Scheduled sync + real-time callbacks", dataTypes: ["member", "hierarchy"], sowRef: "SOW 11.1 / 11.2", dataOwnership: "SFDC owns ST / CS / Retailer / DD source records and the hierarchy; Rishta owns registration outcomes", failureHandling: "Every validation or registration failure returns a clear error to SFDC (SOW 11.5)", decisions: ["OP-24", "OP-SYNC1", "OP-18", "OP-64"], config: { invitationTargetFrequency: null } }),
  base({ id: "INT-ESEAL", code: "ESEAL", name: "eSeal", category: "Product validation", source: "eSeal", target: "Rishta platform", direction: "in", purpose: "Product lookup at scan time: SKU, category, points, PIN requirement and customer-billed date", frequency: "Real time", dataTypes: ["scan"], sowRef: "SOW 11.1 / 11.3", dataOwnership: "eSeal is the source of truth for what a product is and whether it can earn points", failureHandling: "Scan cannot be validated without the lookup", decisions: ["OP-32"] }),
  base({ id: "INT-SIEBEL", code: "SIEBEL", name: "Siebel CRM", category: "Customer service", source: "Siebel CRM", target: "Rishta platform", direction: "in", purpose: "Customer data and warranty lookup", frequency: "Real time", dataTypes: ["ticket"], dataOwnership: "Siebel owns customer and warranty records. Service-job management is proposed separately (Module 12) and is not in scope", failureHandling: "Lookup failure shown to the user" }),
  base({ id: "INT-RZP", code: "RAZORPAY", name: "RazorPay", category: "Payments", source: "Rishta platform", target: "RazorPay", direction: "both", purpose: "Paying members by UPI, bank transfer and card; returns UTR reference", frequency: "Real time", dataTypes: ["redemption"], dataOwnership: "Payout records are owned by the Wallet & Redemption service (Phase 7); RazorPay owns the payment result and UTR", failureHandling: "Failed payouts are reversed through the wallet; daily reconciliation of sent versus paid" }),
  base({ id: "INT-DIGI", code: "DIGILOCKER", name: "DigiLocker / UIDAI", category: "Identity verification", source: "Rishta platform", target: "DigiLocker / UIDAI", direction: "both", purpose: "Aadhaar verification at KYC (verified name, date of birth, permanent address)", frequency: "Real time", dataTypes: ["kyc"], dataOwnership: "UIDAI owns identity data; the KYC module keeps the verification record", failureHandling: "KYC stays pending; member retries" }),
  base({ id: "INT-SIGNZY", code: "SIGNZY", name: "Signzy / NSDL", category: "Identity verification", source: "Rishta platform", target: "Signzy / NSDL", direction: "both", purpose: "PAN check and bank account verification (penny-less)", frequency: "Real time", dataTypes: ["kyc"], dataOwnership: "Verification results are kept by the KYC and Finance modules", failureHandling: "Verification stays pending or failed with the provider reason", decisions: ["OP-17"] }),
  base({ id: "INT-WA", code: "WHATSAPP", name: "WhatsApp Business API", category: "Communication", source: "Rishta platform", target: "WhatsApp Business API", direction: "out", purpose: "Messages, notifications and the bot", frequency: "Real time", dataTypes: ["communication"], dataOwnership: "Communication Centre (Phase 8) owns messages and templates", failureHandling: "SMS fallback for critical notifications (Phase 8)" }),
  base({ id: "INT-SMS", code: "SMS", name: "SMS Gateway", category: "Communication", source: "Rishta platform", target: "SMS Gateway", direction: "out", purpose: "Critical messages and login credentials for SR-created EPs", frequency: "Real time", dataTypes: ["communication"], dataOwnership: "Communication Centre (Phase 8)", failureHandling: "Delivery status from the provider; credentials never shown in monitoring" }),
  base({ id: "INT-MAPS", code: "GMAPS", name: "Google Maps", category: "Location", source: "Google Maps", target: "Rishta platform", direction: "in", purpose: "Address lookup and reverse geocoding; checking an address against the territory", frequency: "Real time", dataTypes: ["location"], dataOwnership: "Member Management owns member addresses and locations", failureHandling: "Address stays unverified" }),
  base({ id: "INT-LOGI", code: "LOGISTICS", name: "Logistics Partners", category: "Fulfilment", source: "Logistics partners", target: "Rishta platform", direction: "both", purpose: "Gift delivery tracking", frequency: "Regular polling", dataTypes: ["logistics"], dataOwnership: "Gift & Fulfilment (Phase 9) owns orders; partners own tracking status", failureHandling: "Tracking-unavailable exception on the order", decisions: ["OP-GIFT1"] }),
];

export const CHANNEL_CHECK: Integration = base({ id: "INT-CHANNEL", code: "CHANNELCHECK", name: "Channel Check API", category: "Requested data push", source: "To be confirmed", target: "Evolve", direction: "in", purpose: "Pushing Channel Check data to Evolve was requested; data, frequency and purpose are not confirmed", frequency: "Not confirmed", frequencyStatus: "business_confirmation_required", dataTypes: [], sowRef: "SOW 11.4 / OP-45", connection: "placeholder", monitoring: "not_configured", decisions: ["OP-45"], dataOwnership: "Not confirmed", failureHandling: "Not confirmed" });

export const HEALTH: Record<HealthStatus, { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "info" }> = {
  healthy: { label: "Healthy", tone: "positive" },
  degraded: { label: "Degraded", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  delayed: { label: "Delayed", tone: "warning" },
  disconnected: { label: "Disconnected", tone: "negative" },
  not_configured: { label: "Not configured", tone: "neutral" },
  bcr: { label: "Business confirmation required", tone: "neutral" },
  unknown: { label: "Unknown / no recent data", tone: "neutral" },
};
export const DIRECTION = { both: "Both ways", in: "Into platform", out: "Out of platform" } as const;

/** SOW 11.2 rejection examples. The final list is open (OP-24): these are examples, not production codes. */
export const SOW_REJECTIONS = [
  { code: "REJ-OTHER-PROGRAMME", label: "Already a member of another programme", status: "sow_example" as const },
  { code: "REJ-DUPLICATE-ACCOUNT", label: "Duplicate account details", status: "sow_example" as const },
  { code: "REJ-PAN-IN-USE", label: "PAN already used by another member", status: "sow_example" as const },
  { code: "REJ-VALIDATION", label: "Other validation failure", status: "sow_example" as const },
];

export const ALERT_TYPE: Record<AlertType, string> = {
  sync_missed: "Scheduled sync missed",
  sync_delayed: "Scheduled sync delayed",
  api_failure: "Real-time API failure",
  repeated_timeout: "Repeated API timeout",
  callback_failure: "Callback failure",
  wallet_delay: "Delayed wallet update",
  bot_notification_failed: "Failed bot notification",
  queue_backlog: "Queue backlog",
  provider_unavailable: "External provider unavailable",
  reconciliation_difference: "Reconciliation difference",
  repeated_record_failure: "Repeated record processing failure",
  db_error: "Database error",
  api_5xx: "API 5xx failure",
  high_latency: "High p95 response time",
  infra_utilisation: "High infrastructure utilisation",
  float_low: "Redemption float low",
  job_failed: "Failed scheduled job",
  crash_spike: "Crash spike",
  login_failure_spike: "Member login failure spike",
};

/** SOW performance and scale targets (references, not test results). */
export const SOW_BASELINES = [
  { key: "profiles", metric: "User profiles", target: "15 lakh" },
  { key: "scans", metric: "Daily scans", target: "1 lakh" },
  { key: "redemptions", metric: "Monthly redemptions", target: "1 lakh" },
  { key: "p95", metric: "API response", target: "p95 below 2 seconds" },
  { key: "concurrency", metric: "Concurrent users", target: "10,000 without degradation" },
  { key: "autoscale", metric: "Auto-scaling trigger", target: "CPU above 70%" },
  { key: "deploy", metric: "Deployment", target: "Zero downtime" },
];
export const P95_TARGET_MS = 2000;

export const OPS_DECISIONS: OpsDecision[] = [
  { id: "OP-24", ref: "OP-24", question: "SFDC callback contract: full rejection reason-code list, message format, callback API ownership (V-Guard or Evolve) and failure / retry policy", integration: "Salesforce (SFDC)", businessOwner: "V-Guard", technicalOwner: "Not confirmed", restriction: "Callbacks are monitored; the code list stays configurable and SOW examples are labelled as examples. No payload or owner is assumed", status: "open", answer: "" },
  { id: "OP-SYNC1", ref: "OP-SYNC1", question: "Final frequency for SFDC invitation synchronisation (currently about once per hour)", integration: "Salesforce (SFDC)", businessOwner: "V-Guard", technicalOwner: "Evolve", restriction: "Current approximately hourly behaviour is displayed; the target frequency changes only through an approved configuration request", status: "open", answer: "" },
  { id: "OP-32", ref: "OP-32 / OP-44", question: "Source of parent-child pack mapping in eSeal; whether Sales Office mapping must be added in eSeal", integration: "eSeal", businessOwner: "V-Guard", technicalOwner: "eSeal team", restriction: "Mappings are displayed with their source unconfirmed; no Sales Office field is created", status: "open", answer: "" },
  { id: "OP-45", ref: "OP-45", question: "Channel Check API: what data is pushed, how often and for what purpose", integration: "Channel Check API", businessOwner: "V-Guard", technicalOwner: "Not confirmed", restriction: "Placeholder registry entry only; not activated and no data flow exists", status: "open", answer: "" },
  { id: "OP-18", ref: "OP-18 / OP-19 / OP-20", question: "Source of truth for SFDC / Rishta mobile mismatch; permanent fix for 'mobile already registered'; SFDC-side blank-name validation", integration: "Salesforce (SFDC)", businessOwner: "V-Guard", technicalOwner: "V-Guard IT / Evolve", restriction: "Exceptions and comparisons are shown; neither system's value is overwritten and no member-facing resolution is invented", status: "open", answer: "" },
  { id: "OP-64", ref: "OP-64", question: "District / branch reconciliation ownership (dependency from Phase 10)", integration: "Salesforce (SFDC)", businessOwner: "V-Guard", technicalOwner: "Evolve", restriction: "Handled in Fraud & risk → SFDC reconciliation", status: "open", answer: "" },
  { id: "OP-MON1", ref: "OP-MON1", question: "Monitoring and alert thresholds per integration (failure rate, delay windows, latency, utilisation) and provider retry policies", integration: "All", businessOwner: "V-Guard", technicalOwner: "Evolve", restriction: "Health uses a labelled development rule; alert thresholds stay unset (Business Confirmation Required); retries need the backend idempotent contract", status: "open", answer: "" },
  { id: "OP-DORM", ref: "OP-DORM", question: "Dormancy threshold: members who have not logged in for X days", integration: "Adoption monitoring", businessOwner: "V-Guard", technicalOwner: "—", restriction: "X is not set; dormant members are listed only after a value is configured", status: "open", answer: "" },
  { id: "OP-FLOAT", ref: "OP-FLOAT", question: "Redemption float low-balance threshold and recipients", integration: "RazorPay / Finance", businessOwner: "V-Guard Finance", technicalOwner: "—", restriction: "No production threshold; a development setting can be recorded by Finance", status: "open", answer: "" },
];
