/**
 * Communication Centre models (Phase 8, SOW Module 7 and 10.8).
 * Every communication is an instance of a Notification Catalogue entry or an approved manual
 * category. Providers (WhatsApp, SMS, email, push, in-app) are MOCK adapters in this build: a request
 * accepted by a mock provider is not a delivered message, and nothing is actually sent.
 */
import type { ProgrammeCode } from "./members";

export type Channel = "whatsapp" | "sms" | "email" | "push" | "inapp";
export type DispatchMode = "rule" | "scheduled" | "manual";
export type NotificationId = "N01" | "N02" | "N03" | "N04" | "N05" | "N06" | "N07" | "N08" | "N09" | "N10" | "N11";
export type InboxCategory = "transactional" | "schemes" | "alerts";
export type LangCode = string;

export type ApprovalPolicyKey = "transactional" | "critical" | "scheme" | "manual" | "banner" | "faq" | "testimonial" | "social" | "survey" | "bot";

/* ======================= Notification catalogue ======================= */

export interface NotificationEntry {
  id: NotificationId;
  name: string;
  sowTrigger: string;
  sowAudience: string;
  sourceModule: string;
  /** Event types the authoritative source can emit for this entry. */
  events: string[];
  channels: Channel[];
  /** Channels the SOW names for this entry (others may be added by configuration). */
  sowChannels: Channel[] | null;
  inboxCategory: InboxCategory;
  policy: ApprovalPolicyKey;
  /** SMS fallback when WhatsApp is unavailable (critical transactional only). */
  smsFallback: boolean;
  enabled: boolean;
  /** Audience rule beyond the event's own member, e.g. "member + SR/PIC for EP". */
  audienceRule: string;
  /** N10 only: reminder cadence in days, null until configured. */
  cadenceDays?: number | null;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

/* ======================= Templates ======================= */

export interface TemplateTranslation {
  lang: LangCode;
  subject: string;
  title: string;
  body: string;
  status: "complete" | "missing" | "needs_review";
}

export interface TemplateVersion {
  version: number;
  translations: TemplateTranslation[];
  deepLink: string | null;
  status: "draft" | "pending_approval" | "active" | "superseded" | "rejected";
  providerApproval: "approved" | "pending" | "rejected" | "not_required";
  changedBy: string;
  changedAt: string;
  reason: string;
  approvalRequestId: string | null;
}

export interface MessageTemplate {
  id: string;
  notificationId: NotificationId | null;
  name: string;
  category: string;
  channel: Channel;
  versions: TemplateVersion[];
  activeVersion: number | null;
  updatedAt: string;
}

/* ======================= Audience ======================= */

export interface AudienceFilter {
  programmes: ProgrammeCode[];
  states: string[];
  districts: string[];
  branches: string[];
  memberIds: string[];
  roles: string[];
  statuses: ("active" | "pending_kyc" | "redemption_eligible" | "scan_enabled")[];
}

export interface AudienceDefinition {
  id: string;
  name: string;
  filter: AudienceFilter;
  createdBy: string;
  updatedAt: string;
}

/* ======================= Communications and dispatch ======================= */

export type CommStatus = "draft" | "pending_approval" | "approved" | "scheduled" | "queued" | "sent" | "delivered" | "partially_delivered" | "failed" | "cancelled" | "rejected";

export interface Communication {
  id: string;
  name: string;
  description: string;
  mode: DispatchMode;
  notificationId: NotificationId | null;
  category: string;
  purpose: string;
  priority: "normal" | "high";
  audience: AudienceFilter;
  audienceCount: number;
  channels: Channel[];
  languages: LangCode[];
  templateIds: string[];
  deepLink: string | null;
  scheduledAt: string | null;
  justification: string;
  status: CommStatus;
  approvalRequestId: string | null;
  /** Event that triggered a rule-based communication. */
  eventId: string | null;
  createdBy: string;
  createdAt: string;
  dispatchedAt: string | null;
  cancelledAt: string | null;
  /** Content for manual messages without a catalogue template (validated against the variable registry). */
  manualContent?: { subject: string; title: string; body: string } | null;
  version: number;
}

export type AttemptStatus = "queued" | "accepted" | "dispatched" | "delivered" | "failed" | "not_required" | "provider_error" | "published";

export interface DeliveryAttempt {
  id: string;
  commId: string;
  recipientId: string;
  recipientKind: "member" | "staff";
  programme: ProgrammeCode | null;
  channel: Channel;
  lang: LangCode;
  templateId: string | null;
  templateVersion: number | null;
  attempt: number;
  idempotencyKey: string;
  providerRef: string | null;
  providerResponse: string;
  status: AttemptStatus;
  fallbackOf: string | null;
  error: string | null;
  at: string;
  updatedAt: string;
  callbacks: { id: string; at: string; status: "delivered" | "failed"; duplicate: boolean }[];
}

/* ======================= Events ======================= */

export interface NotificationEvent {
  id: string;
  type: string;
  sourceModule: string;
  sourceRef: string;
  programme: ProgrammeCode | null;
  memberId: string | null;
  at: string;
  notificationId: NotificationId;
  payload: Record<string, string | number | null>;
  status: "processed" | "skipped_disabled" | "skipped_ineligible" | "duplicate" | "failed";
  commId: string | null;
  detail: string;
  receivedCount: number;
}

/* ======================= WhatsApp bot and helpdesk ======================= */

export type BotAction = "check_balance" | "view_schemes" | "kyc_prompt" | "bank_update_prompt" | "raise_query" | "escalate" | "faq" | "submenu" | "redeem" | "transfer_points" | "adjust_points" | "approve_kyc";

export interface BotMenuItem {
  id: string;
  label: string;
  action: BotAction;
  description: string;
  deepLink: string | null;
  next: string | null;
  escalation: boolean;
  statuses: string[];
  enabled: boolean;
}

export interface BotMenu {
  id: string;
  programme: ProgrammeCode;
  name: string;
  items: BotMenuItem[];
  status: "draft" | "pending_approval" | "active" | "superseded" | "rejected";
  version: number;
  approvalRequestId: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface BotConversation {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  startedAt: string;
  status: "active" | "resolved" | "escalated" | "unanswered";
  lastMessage: string;
  step: string;
  escalationQueryId: string | null;
  messages: { at: string; from: "member" | "bot" | "agent"; text: string }[];
  fallbacks: number;
}

export interface HelpdeskQuery {
  id: string;
  memberId: string;
  programme: ProgrammeCode;
  sourceChannel: "whatsapp" | "inapp" | "email";
  category: string;
  receivedAt: string;
  agentId: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "assigned" | "awaiting_member" | "escalated" | "resolved" | "reopened";
  conversationId: string | null;
  escalationReason: string;
  relatedRef: string | null;
  remarks: { at: string; by: string; text: string; internal: boolean }[];
  resolution: string | null;
  resolvedAt: string | null;
  firstResponseAt: string | null;
}

export interface SlaPolicy {
  id: string;
  category: string;
  responseHours: number | null;
  resolutionHours: number | null;
  calendar: "business_hours" | "calendar_hours";
  escalateTo: string;
  status: "development_example" | "confirmed";
}

/* ======================= Content ======================= */

export type ContentStatus = "draft" | "pending_approval" | "published" | "inactive" | "expired";

export interface Faq {
  id: string;
  section: string;
  programmes: ProgrammeCode[];
  translations: { lang: LangCode; question: string; answer: string }[];
  order: number;
  status: ContentStatus;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface HowToGuide {
  id: string;
  name: string;
  topic: "scanning" | "redeeming" | "checking_points" | "updating_profile";
  description: string;
  programmes: ProgrammeCode[];
  lang: LangCode;
  steps: { title: string; text: string; media: string | null; deepLink: string | null }[];
  order: number;
  status: ContentStatus;
  updatedAt: string;
  updatedBy: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: "image" | "video" | "gif";
  sizeKb: number;
  width: number | null;
  height: number | null;
  storage: "mock_reference";
}

export interface RichContent {
  id: string;
  kind: "tutorial" | "testimonial" | "leaderboard";
  name: string;
  description: string;
  mediaId: string | null;
  deepLink: string | null;
  programmes: ProgrammeCode[];
  lang: LangCode;
  order: number;
  status: ContentStatus;
  /** Testimonials: contributor display and consent. */
  contributor?: { display: string; consentRef: string | null; consentConfirmed: boolean };
  /** Leaderboard: reference to the scheme leaderboard (no calculation here). */
  leaderboard?: { gameId: string; geography: string; period: string };
  approvalRequestId: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface Banner {
  id: string;
  name: string;
  description: string;
  mediaId: string;
  mediaType: "image" | "video" | "gif";
  programmes: ProgrammeCode[];
  placement: "home_banner" | "home_scroller";
  order: number;
  startDate: string;
  endDate: string;
  deepLink: string | null;
  status: ContentStatus;
  publishedBy: string | null;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface SocialLink {
  id: string;
  type: "facebook" | "instagram" | "website" | "twitter_x" | "other";
  display: string;
  url: string;
  placement: string;
  programmes: ProgrammeCode[];
  order: number;
  status: ContentStatus;
  updatedAt: string;
  updatedBy: string;
}

/* ======================= Surveys ======================= */

export interface Survey {
  id: string;
  name: string;
  type: "member" | "retailer";
  source: "portal" | "external_tool" | "external_link";
  link: string | null;
  questions: { id: string; text: string; kind: "rating" | "choice" | "text"; options: string[] }[];
  audience: AudienceFilter;
  trigger: "manual" | "scheduled" | "event" | "geofence";
  geofence: { enabled: false; retailerRef: string | null; radius: null };
  status: "draft" | "pending_approval" | "scheduled" | "active" | "completed";
  startDate: string;
  endDate: string;
  dispatchCommId: string | null;
  approvalRequestId: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  respondentId: string;
  programme: ProgrammeCode;
  submittedAt: string;
  status: "complete" | "partial" | "duplicate_rejected";
  answers: Record<string, string>;
  origin: "mock_development";
}

/* ======================= Configuration and governance ======================= */

export interface LanguageConfig {
  code: LangCode;
  name: string;
  /** Channel coverage: confirmed, unconfirmed (OP-A21) or not supported. */
  coverage: Record<Channel | "bot", "confirmed" | "unconfirmed">;
}

export interface ProfileAction {
  id: string;
  programmes: ProgrammeCode[];
  profileFields: string[];
  action: string;
  deepLink: string;
  notificationId: NotificationId;
  completionEvent: string;
  resultingEvent: string;
}

export interface CommDecision {
  id: string;
  ref: string;
  question: string;
  treatment: string;
  module: string;
  owner: string;
  status: "open" | "under_review" | "confirmed" | "deferred" | "out_of_scope";
  answer: string;
}

export interface CommAuditEvent {
  id: string;
  at: string;
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  before: string | null;
  after: string | null;
  reason: string;
  approvalRequestId: string | null;
}

export interface CommsState {
  catalogue: NotificationEntry[];
  templates: MessageTemplate[];
  audiences: AudienceDefinition[];
  communications: Communication[];
  attempts: DeliveryAttempt[];
  events: NotificationEvent[];
  menus: BotMenu[];
  conversations: BotConversation[];
  queries: HelpdeskQuery[];
  sla: SlaPolicy[];
  faqs: Faq[];
  guides: HowToGuide[];
  media: MediaAsset[];
  rich: RichContent[];
  banners: Banner[];
  links: SocialLink[];
  surveys: Survey[];
  responses: SurveyResponse[];
  languages: LanguageConfig[];
  profileActions: ProfileAction[];
  policies: Record<ApprovalPolicyKey, { approval: boolean; note: string }>;
  retry: { maxAttempts: number | null; status: "business_confirmation_required" | "confirmed" };
  /** Events before this moment are history; the centre processes events from here on. */
  subscriptionStart: string;
  decisions: CommDecision[];
  audit: CommAuditEvent[];
  seq: number;
}
