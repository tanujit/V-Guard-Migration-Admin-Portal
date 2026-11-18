/**
 * COMMUNICATION CENTRE DEVELOPMENT SEED (Phase 8). All content, conversations, queries and survey
 * responses are fictional development data. Hindi texts are development translations marked
 * "needs review"; other languages are deliberately missing so the missing-translation checks show.
 * Rule-based (event) communications are NOT seeded here: the store derives them from the Member,
 * KYC, Wallet and Scheme stores through the event bridge.
 */
import { CHANNEL, COMMS_DECISIONS, DEFAULT_POLICIES, SEED_CATALOGUE, SEED_LANGUAGES } from "@/config/commsCatalogue";
import { hash01, pick } from "@/data/mock/random";
import { SEED_MEMBERS } from "@/data/mock/memberSeed";
import { seedMemberState } from "@/features/wallet/seed";
import type { AudienceFilter, Banner, BotConversation, BotMenu, BotMenuItem, Channel, Communication, CommsState, Faq, HelpdeskQuery, HowToGuide, MediaAsset, MessageTemplate, NotificationId, RichContent, SocialLink, Survey, SurveyResponse, TemplateTranslation } from "@/types/comms";
import { EMPTY_FILTER, langOf, overallStatus, planAttempts, resolveAudience } from "./engine";

const T0 = "2026-10-20T10:00";
const RAHUL = "USR-1003";
const IMRAN = "USR-3001";
const tr = (lang: string, body: string, title = "", subject = "", status: TemplateTranslation["status"] = "complete"): TemplateTranslation => ({ lang, subject, title, body, status });

/** English base templates per N-entry and channel (development copy). */
const COPY: Record<NotificationId, { title: string; subject: string; body: string; deepLink: string | null; hi?: string }> = {
  N01: { title: "Registration update", subject: "Your Rishta registration", body: "Hi {{member_name}}, your Rishta registration ({{programme}}) is now: {{status}}.", deepLink: "rishta://profile/consent" },
  N02: { title: "KYC update", subject: "KYC document {{outcome}}", body: "Hi {{member_name}}, your {{document_type}} was {{outcome}}. {{rejection_reason}}", deepLink: "rishta://kyc/complete" },
  N03: { title: "Points credited", subject: "", body: "{{points}} points credited for scan {{scan_ref}}.", deepLink: "rishta://wallet", hi: "स्कैन {{scan_ref}} के लिए {{points}} पॉइंट जमा हुए।" },
  N04: { title: "New scheme for you", subject: "Scheme live: {{scheme_name}}", body: "{{scheme_name}} is live for you ({{scheme_period}}).", deepLink: "rishta://scheme/{scheme_id}" },
  N05: { title: "Milestone reached", subject: "", body: "Well done {{member_name}}! You reached {{milestone}} in {{scheme_name}}.", deepLink: "rishta://scheme/{scheme_id}" },
  N06: { title: "We value your feedback", subject: "Survey: {{survey_name}}", body: "Please take a short survey: {{survey_name}} {{survey_link}}", deepLink: "rishta://survey/{survey_id}" },
  N07: { title: "Redemption update", subject: "Redemption {{redemption_ref}}", body: "Redemption {{redemption_ref}} is {{redemption_status}}. {{utr}}", deepLink: "rishta://redemption/{redemption_ref}", hi: "रिडेम्पशन {{redemption_ref}} की स्थिति: {{redemption_status}}। {{utr}}" },
  N08: { title: "TDS update", subject: "TDS information for {{fy}}", body: "Your {{fy}} TDS update: {{tds_outcome}}.", deepLink: "rishta://wallet" },
  N09: { title: "Gift update", subject: "Your gift {{gift_ref}}", body: "Your gift/voucher {{gift_ref}} is {{gift_status}}. {{tracking_ref}}", deepLink: "rishta://gifts/{gift_ref}" },
  N10: { title: "Complete your KYC", subject: "", body: "Hi {{member_name}}, complete your KYC to start redeeming: {{pending_documents}}.", deepLink: "rishta://kyc/complete" },
  N11: { title: "Account status", subject: "Account status update", body: "Hi {{member_name}}, your account status changed: {{status_change}} from {{effective_date}}.", deepLink: null },
};

function seedTemplates(): MessageTemplate[] {
  const out: MessageTemplate[] = [];
  for (const e of SEED_CATALOGUE) {
    const chs: Channel[] = Array.from(new Set([...e.channels, ...(e.smsFallback ? (["sms"] as Channel[]) : [])]));
    for (const ch of chs) {
      const c = COPY[e.id];
      const translations = SEED_LANGUAGES.map((l) => (l.code === "en" ? tr("en", ch === "sms" ? c.body.slice(0, 150) : c.body, ch === "push" || ch === "inapp" ? c.title : "", ch === "email" ? c.subject : "") : l.code === "hi" && c.hi && ch !== "email" ? tr("hi", c.hi, ch === "push" || ch === "inapp" ? c.title : "", "", "needs_review") : tr(l.code, "", "", "", "missing")));
      out.push({ id: `TPL-${e.id}-${CHANNEL[ch].short.toUpperCase().replace("-", "")}`, notificationId: e.id, name: `${e.name} · ${CHANNEL[ch].label}`, category: e.inboxCategory, channel: ch, activeVersion: 1, updatedAt: T0, versions: [{ version: 1, translations, deepLink: ch === "sms" || ch === "email" ? null : c.deepLink, status: "active", providerApproval: ch === "whatsapp" ? (e.id === "N04" ? "pending" : "approved") : "not_required", changedBy: "USR-1001", changedAt: T0, reason: "Initial catalogue template (development copy)", approvalRequestId: null }] });
    }
  }
  // A pending new version of the N07 WhatsApp template (approval in the seed scenarios).
  const n07 = out.find((t) => t.id === "TPL-N07-WA")!;
  n07.versions.push({ ...n07.versions[0], version: 2, status: "pending_approval", translations: n07.versions[0].translations.map((x) => (x.lang === "en" ? { ...x, body: "Your redemption {{redemption_ref}} is {{redemption_status}}. Bank reference (UTR): {{utr}}" } : x)), changedBy: RAHUL, changedAt: "2026-11-08T15:00", reason: "Clarify UTR wording" });
  // A manual promotional template.
  out.push({ id: "TPL-MAN-INAPP", notificationId: null, name: "General announcement · In-app", category: "schemes", channel: "inapp", activeVersion: 1, updatedAt: T0, versions: [{ version: 1, translations: SEED_LANGUAGES.map((l) => (l.code === "en" ? tr("en", "Hi {{member_name}}, check the latest from V-Guard Rishta.", "V-Guard Rishta update") : tr(l.code, "", "", "", "missing"))), deepLink: null, status: "active", providerApproval: "not_required", changedBy: "USR-1001", changedAt: T0, reason: "Initial", approvalRequestId: null }] });
  return out;
}

const F = (f: Partial<AudienceFilter>): AudienceFilter => ({ ...EMPTY_FILTER, ...f });

export function buildCommsSeed(): CommsState {
  const mem = seedMemberState();
  const templates = seedTemplates();
  const all = () => true;
  let seq = 0;
  const attempts: CommsState["attempts"] = [];
  const comm = (c: Partial<Communication> & Pick<Communication, "id" | "name" | "mode" | "audience" | "channels" | "status" | "createdAt" | "createdBy">): Communication => ({ description: "", notificationId: null, category: "scheme_announcement", purpose: c.name, priority: "normal", audienceCount: 0, languages: ["en"], templateIds: [], deepLink: null, scheduledAt: null, justification: "", approvalRequestId: null, eventId: null, dispatchedAt: null, cancelledAt: null, manualContent: null, version: 1, ...c });
  const send = (c: Communication) => {
    const a = resolveAudience(mem, c.audience, all, c.channels);
    const tFor = (ch: Channel) => { const t = templates.find((x) => c.templateIds.includes(x.id) && x.channel === ch); return { id: t?.id ?? null, version: t?.activeVersion ?? null }; };
    const planned = planAttempts(c.id, a.included.map((m) => ({ id: m.id, kind: "member" as const, member: m, lang: c.languages.includes(langOf(m)) ? langOf(m) : "en" })), c.channels, tFor, SEED_CATALOGUE.find((e) => e.id === c.notificationId), c.dispatchedAt!, seq);
    seq += planned.length;
    attempts.push(...planned);
    return { ...c, audienceCount: a.included.length, status: overallStatus(planned) };
  };
  const communications: Communication[] = [
    send(comm({ id: "COMM-0001", name: "EP Pumps Monsoon scheme announcement · Tamil Nadu", mode: "manual", category: "scheme_announcement", purpose: "Announce the TN pumps scheme to EP members", audience: F({ programmes: ["EP"], states: ["TN"] }), channels: ["inapp", "email"], templateIds: ["TPL-MAN-INAPP"], manualContent: { subject: "New pumps scheme", title: "Monsoon pumps scheme", body: "Hi {{member_name}}, the EP pumps monsoon scheme is live in Tamil Nadu (development message)." }, justification: "Regional sales request RS-TN-311", status: "delivered", createdAt: "2026-10-28T10:00", createdBy: RAHUL, dispatchedAt: "2026-10-29T09:00", approvalRequestId: null })),
    send(comm({ id: "COMM-0002", name: "ST service push · Maharashtra", mode: "manual", purpose: "Service technician engagement", audience: F({ programmes: ["ST"] }), channels: ["inapp"], templateIds: ["TPL-MAN-INAPP"], manualContent: { subject: "", title: "Service push", body: "Hi {{member_name}}, service jobs are open this week (development message)." }, justification: "Engagement calendar EC-11", status: "delivered", createdAt: "2026-11-03T11:00", createdBy: IMRAN, dispatchedAt: "2026-11-04T10:00" })),
    comm({ id: "COMM-0003", name: "Retailer year-end preview · Kerala", mode: "manual", purpose: "Preview of the year-end retailer scheme", audience: F({ programmes: ["Retailer"], states: ["KL"] }), channels: ["inapp", "email"], templateIds: ["TPL-MAN-INAPP"], manualContent: { subject: "Year-end preview", title: "Year-end preview", body: "Hi {{member_name}}, a year-end scheme is coming (development message)." }, justification: "Annual plan AP-RT-KL-04", status: "pending_approval", createdAt: "2026-11-08T16:00", createdBy: RAHUL }),
    comm({ id: "COMM-0004", name: "CS winter scheme launch", mode: "scheduled", purpose: "Launch announcement", audience: F({ programmes: ["CS"] }), channels: ["inapp"], templateIds: ["TPL-MAN-INAPP"], manualContent: { subject: "", title: "Winter scheme", body: "Hi {{member_name}}, the CS winter scheme starts soon (development message)." }, scheduledAt: "2026-11-20T09:00", status: "scheduled", createdAt: "2026-11-05T12:00", createdBy: RAHUL, justification: "Marketing calendar MC-CS-12" }),
    comm({ id: "COMM-0005", name: "Draft · EP Karnataka switchgear reminder", mode: "manual", purpose: "Reminder", audience: F({ programmes: ["EP"], states: ["KA"] }), channels: ["inapp"], templateIds: ["TPL-MAN-INAPP"], manualContent: { subject: "", title: "Switchgear", body: "Hi {{member_name}}, remember the switchgear scheme (development message)." }, status: "draft", createdAt: "2026-11-09T09:00", createdBy: IMRAN }),
  ];
  for (const c of communications.filter((x) => x.status !== "pending_approval" && x.status !== "scheduled" && x.status !== "draft")) c.audienceCount = c.audienceCount || resolveAudience(mem, c.audience, all).included.length;
  for (const c of communications.filter((x) => !x.audienceCount)) c.audienceCount = resolveAudience(mem, c.audience, all).included.length;

  /* ---------------- WhatsApp bot ---------------- */
  const item = (id: string, label: string, action: BotMenuItem["action"], description: string, deepLink: string | null = null, extra: Partial<BotMenuItem> = {}): BotMenuItem => ({ id, label, action, description, deepLink, next: null, escalation: action === "raise_query" || action === "escalate", statuses: [], enabled: true, ...extra });
  const base = (p: string) => [item(`${p}-1`, "Check balance", "check_balance", "Read-only wallet balance"), item(`${p}-2`, "View schemes", "view_schemes", "Schemes you are eligible for", "rishta://scheme/{scheme_id}"), item(`${p}-3`, "Update KYC", "kyc_prompt", "Opens KYC in the app", "rishta://kyc/complete"), item(`${p}-4`, "Update bank details", "bank_update_prompt", "Opens bank details in the app", "rishta://profile/consent"), item(`${p}-5`, "Raise a query", "raise_query", "Creates a helpdesk query")];
  const menus: BotMenu[] = (["EP", "ST", "CS", "Retailer", "DD"] as const).map((p) => ({ id: `BOT-${p.toUpperCase()}`, programme: p, name: `${p} main menu`, items: p === "Retailer" ? [...base(p).filter((x) => x.action !== "kyc_prompt"), item(`${p}-6`, "GST status help", "faq", "FAQ: GST gate for retailers")] : p === "DD" ? base(p).filter((x) => x.action !== "bank_update_prompt") : base(p), status: "active", version: 1, approvalRequestId: null, updatedBy: "USR-1001", updatedAt: T0 }));

  const members = SEED_MEMBERS.filter((m) => !["pending", "rejected", "invited"].includes(m.status));
  const conversations: BotConversation[] = members.slice(0, 12).map((m, i) => {
    const kind = i % 4;
    const at = `2026-11-0${1 + (i % 8)}T1${i % 10}:${String(10 + i).padStart(2, "0")}`;
    const msgs: BotConversation["messages"] = [{ at, from: "member", text: "Hi" }, { at, from: "bot", text: `${m.programme} menu: 1 Check balance · 2 View schemes · 3 Update KYC · 4 Raise a query` }];
    if (kind === 0) msgs.push({ at, from: "member", text: "1" }, { at, from: "bot", text: "Your available balance is shown in the app (read-only check, development)" });
    if (kind === 1) msgs.push({ at, from: "member", text: "Redeem 500 points" }, { at, from: "bot", text: "Redemption is not available on WhatsApp. Open the Rishta app to redeem." });
    if (kind === 2) msgs.push({ at, from: "member", text: "My points are missing for last week" }, { at, from: "bot", text: "I could not resolve this. Connecting you to an agent." });
    return { id: `CONV-${String(i + 1).padStart(4, "0")}`, memberId: m.id, programme: m.programme, startedAt: at, status: kind === 2 ? "escalated" : kind === 3 ? "unanswered" : "resolved", lastMessage: msgs[msgs.length - 1].text, step: kind === 2 ? "Escalated" : "Main menu", escalationQueryId: kind === 2 ? `HDQ-${String(i + 1).padStart(4, "0")}` : null, messages: msgs, fallbacks: kind === 3 ? 2 : kind === 1 ? 1 : 0 };
  });
  const queries: HelpdeskQuery[] = members.slice(0, 14).map((m, i) => {
    const status: HelpdeskQuery["status"] = pick(m.id + "hq", ["open", "assigned", "awaiting_member", "escalated", "resolved", "assigned"]);
    const received = `2026-11-0${1 + (i % 8)}T${String(9 + (i % 8)).padStart(2, "0")}:15`;
    const conv = conversations.find((c) => c.escalationQueryId === `HDQ-${String(i + 1).padStart(4, "0")}`);
    return { id: `HDQ-${String(i + 1).padStart(4, "0")}`, memberId: m.id, programme: m.programme, sourceChannel: conv ? "whatsapp" : pick(m.id + "src", ["whatsapp", "inapp", "email"] as const), category: pick(m.id + "cat", ["Points not credited", "Redemption status", "KYC / documents", "Bank details", "Scheme query", "App issue"]), receivedAt: received, agentId: status === "open" ? null : pick(m.id + "ag", ["USR-1003", "USR-1004"]), priority: pick(m.id + "pr", ["low", "medium", "high"] as const), status, conversationId: conv?.id ?? null, escalationReason: conv ? "Bot could not resolve" : "Raised by member", relatedRef: null, remarks: status === "open" ? [] : [{ at: received, by: "USR-1004", text: "Checking with the wallet team (development)", internal: true }], resolution: status === "resolved" ? "Explained the pending scan validation (development)" : null, resolvedAt: status === "resolved" ? `2026-11-0${2 + (i % 7)}T18:00` : null, firstResponseAt: status === "open" ? null : received };
  });

  /* ---------------- Content ---------------- */
  const faqs: Faq[] = [
    ["Scanning", "Why was my scan rejected?", "Scans are rejected when the QR is invalid, already scanned or outside the allowed window. Check the reason in your scan history."],
    ["Scanning", "When do scan points show in my wallet?", "Points show after the scan is validated. Pending scans appear as Pending points."],
    ["Wallet & points", "What is the TDS Kitty?", "For EP members, provisional TDS is held in the TDS Kitty and reconciled at the end of the financial year."],
    ["Wallet & points", "Why are some points unsettled?", "Scheme points stay unsettled until the scheme closes and settlement is approved."],
    ["Redemption", "How long does a bank transfer take?", "Transfers are processed after validation. Check the redemption status and UTR in the app."],
    ["Redemption", "Why is my redemption blocked?", "Common reasons: KYC pending, bank not verified, or minimum points not met."],
    ["Profile", "How do I change my mobile number?", "Raise a query; mobile changes need verification by the support team."],
    ["Registration & KYC", "Which documents do I need?", "The app shows the documents required for your programme."],
    ["Schemes", "How do I know which schemes I am in?", "Open Schemes in the app to see schemes you are eligible for."],
    ["Gifts", "I lost my voucher code", "Raise a query. The support team can ask the voucher partner to re-send the code."],
  ].map(([section, q, a], i) => ({ id: `FAQ-${String(i + 1).padStart(3, "0")}`, section, programmes: ["EP", "ST", "CS", "Retailer", "DD"], translations: [{ lang: "en", question: q, answer: a }], order: i + 1, status: i === 9 ? "draft" : "published", publishedAt: i === 9 ? null : "2026-10-22T10:00", updatedAt: "2026-10-22T10:00", updatedBy: IMRAN }));
  const guide = (id: string, name: string, topic: HowToGuide["topic"], steps: string[]): HowToGuide => ({ id, name, topic, description: `How to ${name.toLowerCase()} (development guide)`, programmes: ["EP", "ST", "CS", "Retailer", "DD"], lang: "en", steps: steps.map((s, i) => ({ title: `Step ${i + 1}`, text: s, media: null, deepLink: null })), order: 1, status: "published", updatedAt: T0, updatedBy: IMRAN });
  const guides = [guide("HOW-001", "Scan a product", "scanning", ["Open Scan in the app", "Point the camera at the QR label", "Check the confirmation"]), guide("HOW-002", "Redeem points", "redeeming", ["Open Wallet", "Choose Redeem and a method", "Confirm the request"]), guide("HOW-003", "Check points", "checking_points", ["Open Wallet", "See Available, Scheme and Pending points"]), { ...guide("HOW-004", "Update profile", "updating_profile", ["Open Profile", "Edit the field", "Save"]), status: "draft" as const }];
  const media: MediaAsset[] = [
    { id: "MED-001", name: "monsoon-pumps-banner.jpg", type: "image", sizeKb: 240, width: 1200, height: 400, storage: "mock_reference" },
    { id: "MED-002", name: "scan-tutorial.mp4", type: "video", sizeKb: 8400, width: 1280, height: 720, storage: "mock_reference" },
    { id: "MED-003", name: "festive-scroller.gif", type: "gif", sizeKb: 900, width: 800, height: 300, storage: "mock_reference" },
    { id: "MED-004", name: "testimonial-ep.jpg", type: "image", sizeKb: 180, width: 600, height: 600, storage: "mock_reference" },
  ];
  const rich: RichContent[] = [
    { id: "TUT-001", kind: "tutorial", name: "Scanning basics", description: "Short video on scanning", mediaId: "MED-002", deepLink: "rishta://video/{media_id}", programmes: ["EP", "ST"], lang: "en", order: 1, status: "published", approvalRequestId: null, updatedAt: T0, updatedBy: IMRAN },
    { id: "TUT-002", kind: "tutorial", name: "Checking your wallet", description: "Wallet walkthrough", mediaId: null, deepLink: "rishta://wallet", programmes: ["EP", "ST", "CS"], lang: "en", order: 2, status: "draft", approvalRequestId: null, updatedAt: T0, updatedBy: IMRAN },
    { id: "TST-001", kind: "testimonial", name: "Electrician story · Kochi", description: "Rishta helped me plan my purchases (development text)", mediaId: "MED-004", deepLink: null, programmes: ["EP"], lang: "en", order: 1, status: "published", contributor: { display: "R. K., Kochi", consentRef: "CONSENT-0091", consentConfirmed: true }, approvalRequestId: null, updatedAt: T0, updatedBy: IMRAN },
    { id: "TST-002", kind: "testimonial", name: "Retailer story · Chennai", description: "Development testimonial awaiting consent", mediaId: null, deepLink: null, programmes: ["Retailer"], lang: "en", order: 2, status: "pending_approval", contributor: { display: "S. M., Chennai", consentRef: "CONSENT-0102", consentConfirmed: true }, approvalRequestId: null, updatedAt: "2026-11-08T12:00", updatedBy: IMRAN },
    { id: "LBC-001", kind: "leaderboard", name: "Kerala EP leaderboard header", description: "Banner text above the scheme leaderboard", mediaId: null, deepLink: null, programmes: ["EP"], lang: "en", order: 1, status: "published", leaderboard: { gameId: "GAM-0006", geography: "KL", period: "Nov 2026" }, approvalRequestId: null, updatedAt: T0, updatedBy: IMRAN },
  ];
  const banners: Banner[] = [
    { id: "BNR-001", name: "Monsoon pumps", description: "Home banner", mediaId: "MED-001", mediaType: "image", programmes: ["EP"], placement: "home_banner", order: 1, startDate: "2026-10-25", endDate: "2026-12-31", deepLink: "rishta://scheme/{scheme_id}", status: "published", publishedBy: "USR-2001", publishedAt: "2026-10-25T10:00", updatedAt: "2026-10-24T10:00", updatedBy: RAHUL },
    { id: "BNR-002", name: "Festive scroller", description: "Home scroller", mediaId: "MED-003", mediaType: "gif", programmes: ["EP", "ST", "CS"], placement: "home_scroller", order: 1, startDate: "2026-10-01", endDate: "2026-11-05", deepLink: null, status: "expired", publishedBy: "USR-2001", publishedAt: "2026-10-01T10:00", updatedAt: "2026-09-30T10:00", updatedBy: RAHUL },
    { id: "BNR-003", name: "Scan tutorial video", description: "Scroller with video", mediaId: "MED-002", mediaType: "video", programmes: ["EP", "ST"], placement: "home_scroller", order: 2, startDate: "2026-11-15", endDate: "2026-12-15", deepLink: "rishta://video/{media_id}", status: "draft", publishedBy: null, publishedAt: null, updatedAt: "2026-11-08T10:00", updatedBy: RAHUL },
  ];
  const links: SocialLink[] = [
    { id: "LNK-001", type: "facebook", display: "Facebook", url: "https://www.facebook.com/example-vguard-rishta", placement: "Profile · Connect with us", programmes: ["EP", "ST", "CS", "Retailer", "DD"], order: 1, status: "published", updatedAt: T0, updatedBy: IMRAN },
    { id: "LNK-002", type: "instagram", display: "Instagram", url: "https://www.instagram.com/example-vguard-rishta", placement: "Profile · Connect with us", programmes: ["EP", "ST", "CS", "Retailer", "DD"], order: 2, status: "published", updatedAt: T0, updatedBy: IMRAN },
    { id: "LNK-003", type: "website", display: "Official website", url: "https://www.example-vguard.test", placement: "Profile · Connect with us", programmes: ["EP", "ST", "CS", "Retailer", "DD"], order: 3, status: "published", updatedAt: T0, updatedBy: IMRAN },
    { id: "LNK-004", type: "twitter_x", display: "X (Twitter)", url: "https://x.com/example-vguard", placement: "Profile · Connect with us", programmes: ["EP", "ST", "CS", "Retailer", "DD"], order: 4, status: "draft", updatedAt: T0, updatedBy: IMRAN },
  ];

  /* ---------------- Surveys ---------------- */
  const surveys: Survey[] = [
    { id: "SRV-001", name: "EP app experience (development)", type: "member", source: "portal", link: "rishta://survey/{survey_id}", questions: [{ id: "Q1", text: "How easy is scanning?", kind: "rating", options: ["1", "2", "3", "4", "5"] }, { id: "Q2", text: "Which feature do you use most?", kind: "choice", options: ["Scan", "Wallet", "Schemes", "Gifts"] }, { id: "Q3", text: "Any suggestion?", kind: "text", options: [] }], audience: F({ programmes: ["EP"] }), trigger: "manual", geofence: { enabled: false, retailerRef: null, radius: null }, status: "active", startDate: "2026-11-01", endDate: "2026-11-30", dispatchCommId: null, approvalRequestId: null, updatedAt: "2026-10-30T10:00", updatedBy: IMRAN },
    { id: "SRV-002", name: "Retailer feedback (external tool)", type: "retailer", source: "external_link", link: "https://survey.example-tool.test/rishta-retailer", questions: [], audience: F({ programmes: ["Retailer"] }), trigger: "scheduled", geofence: { enabled: false, retailerRef: null, radius: null }, status: "pending_approval", startDate: "2026-11-15", endDate: "2026-12-15", dispatchCommId: null, approvalRequestId: null, updatedAt: "2026-11-08T11:00", updatedBy: IMRAN },
    { id: "SRV-003", name: "Retailer visit feedback (geofence, disabled)", type: "retailer", source: "portal", link: null, questions: [{ id: "Q1", text: "Rate the visit", kind: "rating", options: ["1", "2", "3", "4", "5"] }], audience: F({ programmes: ["EP"] }), trigger: "geofence", geofence: { enabled: false, retailerRef: null, radius: null }, status: "draft", startDate: "2026-12-01", endDate: "2026-12-31", dispatchCommId: null, approvalRequestId: null, updatedAt: "2026-11-02T11:00", updatedBy: IMRAN },
  ];
  const eps = SEED_MEMBERS.filter((m) => m.programme === "EP" && m.status === "redemption_enabled").slice(0, 16);
  const responses: SurveyResponse[] = eps.map((m, i) => ({ id: `SRR-${String(i + 1).padStart(4, "0")}`, surveyId: "SRV-001", respondentId: m.id, programme: m.programme, submittedAt: `2026-11-0${2 + (i % 7)}T1${i % 9}:30`, status: i === 15 ? "partial" : "complete", answers: { Q1: String(2 + Math.floor(hash01(m.id + "q1") * 4)), Q2: pick(m.id + "q2", ["Scan", "Wallet", "Schemes", "Gifts"]), Q3: i % 3 ? "" : "More regional language content (development response)" }, origin: "mock_development" }));
  responses.push({ ...responses[0], id: "SRR-0017", submittedAt: "2026-11-08T10:00", status: "duplicate_rejected" });

  return {
    catalogue: structuredClone(SEED_CATALOGUE),
    templates,
    audiences: [
      { id: "AUD-001", name: "EP · Kerala · redemption eligible", filter: F({ programmes: ["EP"], states: ["KL"], statuses: ["redemption_eligible"] }), createdBy: RAHUL, updatedAt: T0 },
      { id: "AUD-002", name: "EP / ST / CS · KYC pending", filter: F({ programmes: ["EP", "ST", "CS"], statuses: ["pending_kyc"] }), createdBy: RAHUL, updatedAt: T0 },
      { id: "AUD-003", name: "Retailers · Tamil Nadu", filter: F({ programmes: ["Retailer"], states: ["TN"] }), createdBy: IMRAN, updatedAt: T0 },
    ],
    communications,
    attempts,
    events: [],
    menus,
    conversations,
    queries,
    sla: [
      { id: "SLA-01", category: "Points not credited", responseHours: 24, resolutionHours: 72, calendar: "business_hours", escalateTo: "Evolve operations lead", status: "development_example" },
      { id: "SLA-02", category: "Redemption status", responseHours: 12, resolutionHours: 48, calendar: "business_hours", escalateTo: "Evolve operations lead", status: "development_example" },
      { id: "SLA-03", category: "KYC / documents", responseHours: 24, resolutionHours: 96, calendar: "business_hours", escalateTo: "KYC desk lead", status: "development_example" },
      { id: "SLA-04", category: "Bank details", responseHours: null, resolutionHours: null, calendar: "business_hours", escalateTo: "", status: "development_example" },
    ],
    faqs,
    guides,
    media,
    rich,
    banners,
    links,
    surveys,
    responses,
    languages: structuredClone(SEED_LANGUAGES),
    profileActions: [
      { id: "PA-01", programmes: ["EP", "ST", "CS"], profileFields: ["Programme / role", "Status", "Tier", "Mapped branch", "Mapped Sales Rep", "KYC status"], action: "DPDP consent", deepLink: "rishta://profile/consent", notificationId: "N01", completionEvent: "member.consent_recorded", resultingEvent: "registration.stage_progress" },
      { id: "PA-02", programmes: ["EP", "ST", "CS"], profileFields: ["KYC status"], action: "KYC completion", deepLink: "rishta://kyc/complete", notificationId: "N02", completionEvent: "kyc.document_submitted", resultingEvent: "kyc.document_approved" },
      { id: "PA-03", programmes: ["Retailer", "DD"], profileFields: ["Status", "Mapped branch"], action: "Activation", deepLink: "rishta://profile/consent", notificationId: "N01", completionEvent: "member.activated", resultingEvent: "registration.activated" },
    ],
    policies: structuredClone(DEFAULT_POLICIES),
    retry: { maxAttempts: null, status: "business_confirmation_required" },
    subscriptionStart: "2026-11-01T00:00",
    decisions: structuredClone(COMMS_DECISIONS),
    audit: [],
    seq,
  };
}

export const SEED_COMMS_MAKER = RAHUL;
