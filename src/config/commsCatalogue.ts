/**
 * Communication Centre catalogue (Phase 8, SOW Module 7 and 10.8).
 * N01–N11 triggers, audiences and channels follow the SOW. Values the SOW leaves open (language
 * coverage per channel, SLA targets, retry counts, N10 cadence, survey authoring) are carried as
 * development settings with a visible decision, never as confirmed rules.
 */
import type { StatusTone } from "@/types/domain";
import type { ProgrammeCode } from "@/types/members";
import type { ApprovalPolicyKey, AttemptStatus, BotAction, Channel, CommDecision, CommStatus, DispatchMode, InboxCategory, LanguageConfig, NotificationEntry, NotificationId } from "@/types/comms";

export const PROGRAMMES: ProgrammeCode[] = ["EP", "ST", "CS", "Retailer", "DD"];

export const CHANNEL: Record<Channel, { label: string; short: string; sowUse: string; contact: "mobile" | "email" | "app" }> = {
  whatsapp: { label: "WhatsApp", short: "WA", sowUse: "Primary rich transactional and engagement channel (OTP support, voucher codes, KYC reminders, scheme announcements)", contact: "mobile" },
  sms: { label: "SMS", short: "SMS", sowUse: "Fallback for critical transactional messages when WhatsApp is unavailable (credentials, OTP, redemption confirmations)", contact: "mobile" },
  email: { label: "Email", short: "Email", sowUse: "Formal notifications and statements (KYC rejection reasons, employee reports)", contact: "email" },
  push: { label: "Push notification", short: "Push", sowUse: "Real-time app notifications (scan credited, scheme live, tier change)", contact: "app" },
  inapp: { label: "In-app banner / inbox", short: "In-app", sowUse: "Persistent announcements and message history", contact: "app" },
};
export const CHANNELS = Object.keys(CHANNEL) as Channel[];

export const DISPATCH_MODE: Record<DispatchMode, { label: string; detail: string }> = {
  rule: { label: "Rule-based", detail: "Triggered automatically by an authoritative platform event (for example points credited)" },
  scheduled: { label: "Event / scheduled", detail: "Sent at a configured future time (scheme launch, periodic KYC reminder)" },
  manual: { label: "Manual", detail: "Composed by an authorised operator for a validated audience" },
};

export const INBOX: Record<InboxCategory, string> = { transactional: "Transactional", schemes: "Schemes", alerts: "Alerts" };

export const COMM_STATUS: Record<CommStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved, not dispatched", tone: "accent" },
  scheduled: { label: "Scheduled", tone: "info" },
  queued: { label: "Queued", tone: "info" },
  sent: { label: "Sent (awaiting delivery)", tone: "info" },
  delivered: { label: "Delivered", tone: "positive" },
  partially_delivered: { label: "Partially delivered", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  rejected: { label: "Rejected", tone: "negative" },
};

export const ATTEMPT_STATUS: Record<AttemptStatus, { label: string; tone: StatusTone; meaning: string }> = {
  queued: { label: "Queued", tone: "neutral", meaning: "Waiting to be handed to the provider" },
  accepted: { label: "Request accepted", tone: "info", meaning: "Provider accepted the request. Not yet dispatched or delivered" },
  dispatched: { label: "Dispatched", tone: "info", meaning: "Provider reports the message sent. Delivery not confirmed" },
  delivered: { label: "Delivered", tone: "positive", meaning: "Provider delivery callback received" },
  failed: { label: "Failed", tone: "negative", meaning: "Provider reported a delivery failure" },
  provider_error: { label: "Provider error", tone: "negative", meaning: "Provider refused or errored on the request" },
  not_required: { label: "Not required", tone: "neutral", meaning: "Fallback not needed because the primary channel succeeded" },
  published: { label: "Published", tone: "positive", meaning: "Written to the member's in-app inbox service (mock)" },
};

/* ---------------- N01–N11 ---------------- */
const T0 = "2026-10-20T10:00";
const n = (e: Omit<NotificationEntry, "enabled" | "version" | "updatedBy" | "updatedAt">): NotificationEntry => ({ enabled: true, version: 1, updatedBy: "USR-1001", updatedAt: T0, ...e });

export const SEED_CATALOGUE: NotificationEntry[] = [
  n({ id: "N01", name: "Registration / onboarding status", sowTrigger: "Enrolment, approval stages, member activation", sowAudience: "Member; for EP the relevant SR/PIC", sourceModule: "Member Management", events: ["registration.received", "registration.stage_progress", "registration.approved", "registration.activated", "registration.rejected"], channels: ["whatsapp", "push", "inapp"], sowChannels: null, inboxCategory: "transactional", policy: "transactional", smsFallback: true, audienceRule: "Member; EP members also notify the mapped SR/PIC" }),
  n({ id: "N02", name: "KYC status & rejection reason", sowTrigger: "Document approval or rejection", sowAudience: "Member (app + email); relevant SR/PIC", sourceModule: "Registration & KYC", events: ["kyc.document_approved", "kyc.document_rejected", "kyc.reupload_required"], channels: ["inapp", "email", "whatsapp"], sowChannels: ["inapp", "email"], inboxCategory: "transactional", policy: "critical", smsFallback: false, audienceRule: "Member and mapped SR/PIC. Document type and outcome only; identifiers never included" }),
  n({ id: "N03", name: "Scan credited", sowTrigger: "Successful scan and point credit", sowAudience: "Member", sourceModule: "Scanning / Wallet ledger", events: ["scan.points_credited"], channels: ["push", "inapp"], sowChannels: ["push", "inapp"], inboxCategory: "transactional", policy: "transactional", smsFallback: false, audienceRule: "Member whose credit the ledger confirmed. A received but uncredited scan never triggers N03" }),
  n({ id: "N04", name: "Scheme live / eligibility", sowTrigger: "A scheme the member qualifies for goes live", sowAudience: "Eligible member", sourceModule: "Scheme & Incentive Management", events: ["scheme.live"], channels: ["whatsapp", "push", "inapp"], sowChannels: null, inboxCategory: "schemes", policy: "scheme", smsFallback: false, audienceRule: "Only members the scheme eligibility service returns" }),
  n({ id: "N05", name: "Milestone / tier progress", sowTrigger: "Milestone progress, tier change", sowAudience: "Member", sourceModule: "Scheme & Incentive Management", events: ["scheme.milestone_achieved", "tier.changed"], channels: ["push", "inapp"], sowChannels: null, inboxCategory: "schemes", policy: "scheme", smsFallback: false, audienceRule: "Member named in the milestone or tier event" }),
  n({ id: "N06", name: "Survey / feedback request", sowTrigger: "Survey or feedback request", sowAudience: "Retailer and/or member per survey configuration", sourceModule: "Survey Management", events: ["survey.invitation"], channels: ["whatsapp", "inapp"], sowChannels: null, inboxCategory: "alerts", policy: "survey", smsFallback: false, audienceRule: "Survey audience. Never sent without a valid survey reference or link" }),
  n({ id: "N07", name: "Redemption status", sowTrigger: "Redemption requested, processing, success, failure", sowAudience: "Member", sourceModule: "Wallet / Redemption", events: ["redemption.requested", "redemption.processing", "redemption.success", "redemption.failure"], channels: ["whatsapp", "push", "inapp"], sowChannels: null, inboxCategory: "transactional", policy: "critical", smsFallback: true, audienceRule: "Member who raised the redemption. Success only after the payment service confirms" }),
  n({ id: "N08", name: "TDS / compliance", sowTrigger: "TDS deduction, FY reconciliation", sowAudience: "Member", sourceModule: "Finance / TDS", events: ["tds.deducted", "tds.fy_reconciled"], channels: ["email", "inapp"], sowChannels: null, inboxCategory: "transactional", policy: "critical", smsFallback: false, audienceRule: "Member. Only values confirmed by the financial service" }),
  n({ id: "N09", name: "Gift / voucher delivery", sowTrigger: "Voucher issued, gift dispatched, gift delivered, tracking updates", sowAudience: "Member", sourceModule: "Gift & Fulfilment", events: ["voucher.issued", "voucher.reissued", "gift.dispatched", "gift.delivered"], channels: ["whatsapp", "inapp"], sowChannels: null, inboxCategory: "transactional", policy: "transactional", smsFallback: true, audienceRule: "Member. Delivery notifications only after the partner confirms delivery" }),
  n({ id: "N10", name: "Incomplete KYC reminder", sowTrigger: "Periodic reminder to complete KYC (SOW example: monthly WhatsApp)", sowAudience: "Members with incomplete KYC", sourceModule: "Registration & KYC", events: ["kyc.reminder_due"], channels: ["whatsapp"], sowChannels: ["whatsapp"], inboxCategory: "alerts", policy: "transactional", smsFallback: false, audienceRule: "Members whose redemption KYC is incomplete; suppressed once complete", cadenceDays: null }),
  n({ id: "N11", name: "Block / status change", sowTrigger: "Account block, hold, reinstatement", sowAudience: "Member", sourceModule: "Member Management", events: ["member.blocked", "member.hold", "member.reinstated"], channels: ["whatsapp", "sms", "inapp"], sowChannels: null, inboxCategory: "alerts", policy: "critical", smsFallback: true, audienceRule: "Member. Internal fraud details are never included" }),
];

/** Approved template-variable registry per notification. Templates may use nothing else. */
export const VARIABLES: Record<NotificationId | "manual", { name: string; label: string; required?: boolean }[]> = {
  N01: [{ name: "member_name", label: "Member name", required: true }, { name: "member_id", label: "Member ID" }, { name: "programme", label: "Programme" }, { name: "status", label: "Registration status", required: true }],
  N02: [{ name: "member_name", label: "Member name", required: true }, { name: "document_type", label: "KYC document type", required: true }, { name: "outcome", label: "Approved / rejected", required: true }, { name: "rejection_reason", label: "Rejection reason" }],
  N03: [{ name: "member_name", label: "Member name" }, { name: "points", label: "Points credited", required: true }, { name: "scan_ref", label: "Scan reference" }],
  N04: [{ name: "member_name", label: "Member name" }, { name: "scheme_name", label: "Scheme name", required: true }, { name: "scheme_period", label: "Scheme period", required: true }, { name: "programme", label: "Programme" }],
  N05: [{ name: "member_name", label: "Member name" }, { name: "scheme_name", label: "Scheme name" }, { name: "milestone", label: "Milestone / tier", required: true }],
  N06: [{ name: "member_name", label: "Member name" }, { name: "survey_name", label: "Survey name", required: true }, { name: "survey_link", label: "Survey link", required: true }],
  N07: [{ name: "member_name", label: "Member name" }, { name: "redemption_ref", label: "Redemption reference", required: true }, { name: "redemption_status", label: "Redemption status", required: true }, { name: "utr", label: "UTR" }],
  N08: [{ name: "member_name", label: "Member name" }, { name: "fy", label: "Financial year", required: true }, { name: "tds_outcome", label: "TDS outcome", required: true }],
  N09: [{ name: "member_name", label: "Member name" }, { name: "gift_ref", label: "Gift / voucher reference", required: true }, { name: "gift_status", label: "Status", required: true }, { name: "expiry", label: "Expiry" }, { name: "tracking_ref", label: "Tracking reference" }],
  N10: [{ name: "member_name", label: "Member name", required: true }, { name: "pending_documents", label: "Pending KYC documents" }],
  N11: [{ name: "member_name", label: "Member name", required: true }, { name: "status_change", label: "Status change", required: true }, { name: "effective_date", label: "Effective date", required: true }],
  manual: [{ name: "member_name", label: "Member name" }, { name: "member_id", label: "Member ID" }, { name: "programme", label: "Programme" }],
};

/** Approved deep-link catalogue. Arbitrary URLs are refused. */
export const DEEP_LINKS: { id: string; label: string; target: string }[] = [
  { id: "rishta://scheme/{scheme_id}", label: "Scheme detail", target: "Scheme page" },
  { id: "rishta://kyc/complete", label: "KYC completion", target: "KYC" },
  { id: "rishta://redemption/{redemption_ref}", label: "Redemption status", target: "Redemption" },
  { id: "rishta://wallet", label: "Member wallet", target: "Wallet" },
  { id: "rishta://gifts/{gift_ref}", label: "Gift status", target: "Gifts history" },
  { id: "rishta://profile/consent", label: "Profile / consent action", target: "Profile" },
  { id: "rishta://survey/{survey_id}", label: "Survey", target: "Survey" },
  { id: "rishta://video/{media_id}", label: "Video", target: "Media player" },
];

export const SMS_SEGMENT = 160;
/** Channel format limits used by validation. Development values: confirm with each provider. */
export const CHANNEL_LIMITS: Record<Channel, { title?: number; body: number; note: string }> = {
  whatsapp: { body: 1024, note: "WhatsApp template body limit (provider constraint to confirm)" },
  sms: { body: SMS_SEGMENT * 3, note: "Up to three SMS segments (development setting)" },
  email: { body: 20000, note: "Email body (development setting)" },
  push: { title: 65, body: 240, note: "Push title / body length (development setting)" },
  inapp: { title: 80, body: 2000, note: "In-app message (development setting)" },
};

/**
 * Eight supported languages. The repository has no application language configuration yet, so this
 * development list stands in for it (FC-01). Coverage per channel beyond push / in-app / WhatsApp
 * templates is unconfirmed (OP-A21).
 */
const cov = (bot: "confirmed" | "unconfirmed" = "unconfirmed"): LanguageConfig["coverage"] => ({ whatsapp: "confirmed", sms: "confirmed", email: "confirmed", push: "unconfirmed", inapp: "confirmed", bot });
export const SEED_LANGUAGES: LanguageConfig[] = [
  { code: "en", name: "English", coverage: { whatsapp: "confirmed", sms: "confirmed", email: "confirmed", push: "confirmed", inapp: "confirmed", bot: "confirmed" } },
  { code: "hi", name: "Hindi", coverage: cov() },
  { code: "ml", name: "Malayalam", coverage: cov() },
  { code: "ta", name: "Tamil", coverage: cov() },
  { code: "kn", name: "Kannada", coverage: cov() },
  { code: "te", name: "Telugu", coverage: cov() },
  { code: "mr", name: "Marathi", coverage: cov() },
  { code: "bn", name: "Bengali", coverage: cov() },
];

/* ---------------- Bot ---------------- */
export const BOT_ACTION: Record<BotAction, { label: string; safe: boolean; detail: string }> = {
  check_balance: { label: "Check balance (read-only)", safe: true, detail: "Reads the wallet balance; never moves points" },
  view_schemes: { label: "View schemes", safe: true, detail: "Shows schemes the member is eligible for" },
  kyc_prompt: { label: "KYC completion prompt", safe: true, detail: "Deep link to KYC in the app" },
  bank_update_prompt: { label: "Bank update prompt", safe: true, detail: "Deep link to bank details in the app" },
  raise_query: { label: "Raise a query", safe: true, detail: "Creates a helpdesk query" },
  escalate: { label: "Escalate to human agent", safe: true, detail: "Hands the conversation to the agent queue" },
  faq: { label: "FAQ answer", safe: true, detail: "Section FAQ content" },
  submenu: { label: "Sub-menu", safe: true, detail: "Opens another menu" },
  redeem: { label: "Redeem points", safe: false, detail: "Not allowed on WhatsApp (SOW 7.3): redirect to the app" },
  transfer_points: { label: "Transfer points", safe: false, detail: "Value-moving: not allowed on the bot" },
  adjust_points: { label: "Add / deduct points", safe: false, detail: "Value-moving: not allowed on the bot" },
  approve_kyc: { label: "Approve KYC", safe: false, detail: "Sensitive: not allowed on the bot" },
};

export const FAQ_SECTIONS = ["Scanning", "Wallet & points", "Redemption", "Profile", "Registration & KYC", "Schemes", "Gifts"];
export const QUERY_CATEGORIES = ["Points not credited", "Redemption status", "KYC / documents", "Bank details", "Scheme query", "App issue", "Other"];

export const POLICY_LABEL: Record<ApprovalPolicyKey, string> = {
  transactional: "Transactional notifications",
  critical: "Critical compliance notifications",
  scheme: "Scheme announcements",
  manual: "Promotional / manual communication",
  banner: "Banners and home scrollers",
  faq: "FAQ and How-To content",
  testimonial: "Testimonials",
  social: "Social link changes",
  survey: "Survey publication",
  bot: "WhatsApp bot menus",
};
/** Development defaults: which categories go through the Approval Engine. Configurable, not SOW rules. */
export const DEFAULT_POLICIES: Record<ApprovalPolicyKey, { approval: boolean; note: string }> = {
  transactional: { approval: true, note: "Template changes need approval; automated dispatch of an approved template does not" },
  critical: { approval: true, note: "Template changes need approval and authorised publishing" },
  scheme: { approval: true, note: "Announcement content approved before dispatch" },
  manual: { approval: true, note: "WF-008: named V-Guard approver signs off member-facing communication" },
  banner: { approval: false, note: "Publishing restricted to named HO Admin publishers (separate permission)" },
  faq: { approval: false, note: "Publish permission required" },
  testimonial: { approval: true, note: "Member identity and consent checked before publication" },
  social: { approval: false, note: "Manage permission required" },
  survey: { approval: true, note: "Survey publication approved before N06 dispatch" },
  bot: { approval: true, note: "Menu changes approved before publication" },
};

export const COMMS_DECISIONS: CommDecision[] = [
  { id: "CD-01", ref: "OP-A21", question: "Do all eight languages extend to WhatsApp Bot responses and push / system notifications?", treatment: "Language coverage is configured per channel; push and bot coverage show Unconfirmed. Missing translations are reported, never silently replaced", module: "Templates, WhatsApp Bot", owner: "V-Guard Marketing", status: "open", answer: "" },
  { id: "CD-02", ref: "OP-CHAT1", question: "Is an in-app chatbot required in addition to the WhatsApp Bot?", treatment: "WhatsApp Bot is the base scope. The in-app chatbot option exists in configuration and stays inactive", module: "WhatsApp Bot", owner: "V-Guard / Evolve", status: "open", answer: "" },
  { id: "CD-03", ref: "OP-CONTENT1", question: "Exact social / contact links and placements; source of FAQ and How-To content", treatment: "Configurable link manager and content library; final source and placement pending", module: "Content, Social links", owner: "V-Guard Marketing", status: "open", answer: "" },
  { id: "CD-04", ref: "OP-SURV1", question: "Surveys authored in the portal or an external tool? Targeting and triggers? Geofence-triggered retailer feedback in scope now?", treatment: "Authoring source configurable (portal / external tool / link). Portal authoring is a labelled mock. Geofence trigger disabled", module: "Surveys", owner: "V-Guard Marketing", status: "open", answer: "" },
  { id: "CD-05", ref: "Not in SOW", question: "The application's eight-language list", treatment: "A development list stands in for the app language configuration until it is supplied", module: "Configuration", owner: "Evolve", status: "open", answer: "" },
  { id: "CD-06", ref: "SOW 7.4", question: "Helpdesk SLA targets (response, resolution) and escalation groups", treatment: "SLA policies exist with labelled development examples; no production target assumed", module: "Helpdesk", owner: "V-Guard / Evolve support", status: "open", answer: "" },
  { id: "CD-07", ref: "Not in SOW", question: "Retry count, interval and fallback conditions per provider", treatment: "Retries are manual until a policy is recorded; WhatsApp → SMS fallback only for entries flagged critical", module: "Delivery", owner: "Evolve", status: "open", answer: "" },
  { id: "CD-08", ref: "SOW 7.2 N10", question: "Incomplete-KYC reminder cadence (SOW example: monthly)", treatment: "Cadence configurable, not set by default; reminders cannot be scheduled until it is", module: "Notification catalogue", owner: "V-Guard", status: "open", answer: "" },
  { id: "CD-09", ref: "SOW 10.8 AF06", question: "Mapping of legacy 'named HO Admin' users to portal users", treatment: "Explicit Banner publish permission granted by direct grant to named users; the Client Admin role alone does not publish", module: "Banners", owner: "V-Guard HO", status: "under_review", answer: "" },
];

export const COMMS_SERVICES: { service: string; status: string }[] = [
  { service: "Communication management", status: "Mock (browser)" },
  { service: "Notification catalogue", status: "Mock (browser)" },
  { service: "Template management", status: "Mock (browser)" },
  { service: "Localization", status: "Development language list (CD-05)" },
  { service: "Audience management", status: "Reads the development member master" },
  { service: "Message dispatch", status: "Simulated" },
  { service: "WhatsApp provider adapter", status: "Not connected (mock responses)" },
  { service: "SMS provider adapter", status: "Not connected (mock responses)" },
  { service: "Email provider adapter", status: "Not connected (mock responses)" },
  { service: "Push notification adapter", status: "Not connected (mock responses)" },
  { service: "In-app notification adapter", status: "Not connected (member inbox not built)" },
  { service: "Delivery tracking", status: "Mock callbacks" },
  { service: "Event processing", status: "Reads Member, KYC, Wallet, Scheme stores in the browser" },
  { service: "Fallback handling", status: "WhatsApp → SMS for critical entries (mock)" },
  { service: "WhatsApp bot", status: "Menu configuration and preview only; bot not operational" },
  { service: "Helpdesk integration", status: "Portal queue on the Tickets & support permission module" },
  { service: "Content management", status: "Mock (browser)" },
  { service: "Media upload", status: "File metadata only; no storage connected" },
  { service: "Deep link management", status: "Approved catalogue" },
  { service: "Survey integration", status: "Mock; authoring source open (OP-SURV1)" },
  { service: "Approval engine adapter", status: "Central approval engine" },
  { service: "Audit service", status: "Mock (browser)" },
  { service: "Reporting and export", status: "CSV from the mock store" },
];

export const COMMS_PERMISSIONS: { label: string; key: string; note?: string }[] = [
  { label: "Communication view", key: "communication:view" }, { label: "Communication create", key: "communication:create" }, { label: "Communication edit", key: "communication:edit" },
  { label: "Communication submit", key: "communication:submit" }, { label: "Communication approve", key: "communication:approve", note: "Checker profile (WF-008)" },
  { label: "Communication schedule / send", key: "communication:execute" }, { label: "Communication cancel", key: "communication:cancel" }, { label: "Audience manage", key: "communication:manage" },
  { label: "Delivery history / export", key: "communication:export" },
  { label: "Catalogue view", key: "comm-templates:view" }, { label: "Catalogue edit", key: "comm-templates:edit" }, { label: "Notification enable / disable", key: "comm-templates:disable" }, { label: "Template publish", key: "comm-templates:publish" },
  { label: "Content view / edit", key: "content:edit" }, { label: "Content publish", key: "content:publish" },
  { label: "Banner edit", key: "banners:edit" }, { label: "Banner publish", key: "banners:publish", note: "Named HO Admin publishers only, by direct grant" }, { label: "Social link manage", key: "content:manage" },
  { label: "Bot configuration view", key: "comm-bot:view" }, { label: "Bot menu edit", key: "comm-bot:edit" }, { label: "Bot publish", key: "comm-bot:publish" },
  { label: "Query view", key: "tickets:view" }, { label: "Query assign / SLA configuration", key: "tickets:manage" }, { label: "Internal remark / resolve", key: "tickets:edit" },
  { label: "Survey view", key: "surveys:view" }, { label: "Survey create / edit", key: "surveys:create" }, { label: "Survey publish", key: "surveys:publish" }, { label: "Survey response export", key: "surveys:export" },
];

export const FAQ_SECTION_LIST = FAQ_SECTIONS;
export type { NotificationId };
