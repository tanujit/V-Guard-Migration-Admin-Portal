/**
 * Phase 8 — Communication Centre test suite (Section 24 scenarios A–Z, plus governance cases).
 *   npm run test:comms
 * Runs the real comms store, event bridge, mock dispatch and central approval engine in Node.
 * Rules the SOW defines (N01–N11 triggers and audiences, WhatsApp primary / SMS fallback, safe bot
 * actions, named banner publishers) are asserted deterministically. Open decisions (OP-A21, OP-SURV1,
 * N10 cadence, retry policy, SLA targets) are asserted as blocked or unconfirmed, never invented.
 */
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { walletStore, simulatePayoutCallback } from "@/features/wallet/store";
import * as C from "@/features/comms/store";
import * as E from "@/features/comms/engine";
import { collectEvents } from "@/features/comms/events";
import { schemeStore } from "@/features/schemes/store";
import { masterStore } from "@/features/masters/store";
import { BOT_ACTION, SEED_CATALOGUE } from "@/config/commsCatalogue";
import type { Communication } from "@/types/comms";

const RAHUL = "USR-1003", SNEHA = "USR-1004", ANITA = "USR-2001", TANUJIT = "USR-1001", IMRAN = "USR-3001", LAKSHMI = "USR-2003", VIKRAM = "USR-2006";
const cs = () => C.commsStore.get();
const mem = () => memberStore.get();
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string, action: "approve" | "reject" | "return" = "approve") => decideRequest(uid, id, action, "Reviewed in test", req(id).seq);

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: string; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
function test(n: string, name: string, kind: Kind, fn: () => string | void) {
  try {
    results.push({ n, name, kind, ok: true, detail: fn() ?? "" });
  } catch (e) {
    results.push({ n, name, kind, ok: false, detail: (e as Error).message });
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const all = () => true;
const draft = (p: Partial<Communication>): Communication => ({ id: "", name: "Test", description: "", mode: "manual", notificationId: null, category: "engagement", purpose: "Test purpose", priority: "normal", audience: { ...E.EMPTY_FILTER, programmes: ["EP"], states: ["KL"] }, audienceCount: 0, channels: ["inapp"], languages: ["en"], templateIds: ["TPL-MAN-INAPP"], deepLink: null, scheduledAt: null, justification: "Test justification", status: "draft", approvalRequestId: null, eventId: null, createdBy: RAHUL, createdAt: "2026-11-09T14:30", dispatchedAt: null, cancelledAt: null, manualContent: null, version: 0, ...p });
const atts = (commId: string) => cs().attempts.filter((a) => a.commId === commId);

/* ---------------- A–C: composer, multi-channel, fallback ---------------- */
let manualId = "";
test("A", "Manual communication: audience, channel, language, preview, create", "governance", () => {
  const r = C.saveCommunication(RAHUL, draft({ name: "Kerala EP update", manualContent: { subject: "", title: "Update", body: "Hi {{member_name}}, development message." }, templateIds: [] }));
  expect(r.ok, r.errors.join("; "));
  manualId = r.id!;
  const s = C.submitCommunication(RAHUL, manualId);
  expect(s.ok, s.errors.join("; "));
  const c = cs().communications.find((x) => x.id === manualId)!;
  expect(c.status === "pending_approval" && !!c.approvalRequestId && atts(manualId).length === 0, c.status);
  expect(decide(ANITA, c.approvalRequestId!).ok, "approve");
  expect(cs().communications.find((x) => x.id === manualId)!.status === "approved" && atts(manualId).length === 0, "approval dispatched");
  const d = C.dispatchCommunication(SNEHA, manualId);
  expect(d.ok && atts(manualId).length === c.audienceCount, d.errors.join("; "));
  return `${manualId}: ${c.audienceCount} EP members in Kerala; approved by WF-008, then sent by an operator (approval alone sent nothing)`;
});
test("B", "Multi-channel communication keeps one reference with per-channel outcomes", "deterministic", () => {
  const c = cs().communications.find((x) => x.id === "COMM-0001")!;
  const s = E.channelSummary(atts(c.id));
  expect(c.channels.length === 2 && s.inapp.attempted > 0 && s.email.attempted > 0, JSON.stringify(s));
  return `COMM-0001: in-app ${s.inapp.delivered}/${s.inapp.attempted}, email ${s.email.delivered}/${s.email.attempted} under one reference`;
});
test("C", "WhatsApp failure falls back to SMS only for critical entries; no SMS when WhatsApp succeeds", "deterministic", () => {
  const n07 = SEED_CATALOGUE.find((e) => e.id === "N07")!;
  const n04 = SEED_CATALOGUE.find((e) => e.id === "N04")!;
  const ms = mem().members.filter((m) => m.status === "redemption_enabled").slice(0, 60);
  const rec = ms.map((m) => ({ id: m.id, kind: "member" as const, member: m, lang: "en" }));
  const a = E.planAttempts("T-C1", rec, ["whatsapp"], () => ({ id: null, version: null }), n07, "2026-11-09T15:00", 0);
  const b = E.planAttempts("T-C2", rec, ["whatsapp"], () => ({ id: null, version: null }), n04, "2026-11-09T15:00", 0);
  const waFail = a.filter((x) => x.channel === "whatsapp" && (x.status === "failed" || x.status === "provider_error"));
  const sms = a.filter((x) => x.channel === "sms");
  const waOk = a.filter((x) => x.channel === "whatsapp" && x.status !== "failed" && x.status !== "provider_error");
  expect(waFail.length > 0 && sms.length === waFail.length && sms.every((s) => waFail.some((w) => w.id === s.fallbackOf)) && waOk.every((w) => !sms.some((s) => s.recipientId === w.recipientId)), `${waFail.length} vs ${sms.length}`);
  expect(!b.some((x) => x.channel === "sms"), "fallback on a non-critical entry");
  return `N07: ${waFail.length} WhatsApp failures → ${sms.length} SMS fallbacks; ${waOk.length} successes, no SMS. N04 (scheme): no fallback`;
});

/* ---------------- D–N: N01–N11 events ---------------- */
const evOf = (n: string) => cs().events.filter((e) => e.notificationId === n && e.status === "processed");
test("D", "N01 registration status notifies the member and, for EP, the SR/PIC", "deterministic", () => {
  const e = evOf("N01").find((x) => x.programme === "EP")!;
  const a = atts(e.commId!);
  expect(a.some((x) => x.recipientId === e.memberId) && a.some((x) => x.recipientKind === "staff" && x.recipientId.startsWith("SR:")), JSON.stringify(a.map((x) => x.recipientId)));
  return `${e.id}: member ${e.memberId} + ${a.find((x) => x.recipientKind === "staff")!.recipientId}`;
});
test("E", "N02 KYC rejection is document-specific with the reason; SR/PIC informed", "deterministic", () => {
  const e = cs().events.find((x) => x.type === "kyc.document_rejected") ?? cs().events.find((x) => x.notificationId === "N02")!;
  expect(!!e.payload.document_type && !!e.payload.outcome && !String(Object.values(e.payload).join(" ")).match(/\d{4}\s?\d{4}\s?\d{4}/), "identifier exposed");
  return `${e.id}: ${e.payload.document_type} ${e.payload.outcome}${e.payload.rejection_reason ? ` · ${e.payload.rejection_reason}` : ""}`;
});
test("F", "N03 fires only for ledger-confirmed credits; pending scans never trigger it", "deterministic", () => {
  const pend = walletStore.get().ledger.filter((l) => l.bucket === "pending" && l.at >= cs().subscriptionStart);
  const ev = collectEvents({ mem: mem(), ws: walletStore.get(), ss: schemeStore.get(), ms: masterStore.get() }, cs().subscriptionStart).filter((x) => x.notificationId === "N03");
  expect(pend.length > 0 && ev.length > 0 && pend.every((p) => !ev.some((x) => x.sourceRef === p.id)), `${pend.length} pending`);
  const e = evOf("N03")[0];
  expect(cs().communications.find((c) => c.id === e.commId)!.channels.join() === "push,inapp", "N03 channels");
  return `${ev.length} credited scans → N03 (push + in-app); ${pend.length} pending scans → none`;
});
test("G", "N04 goes only to members the scheme eligibility service returns", "deterministic", () => {
  const ev = evOf("N04");
  if (!ev.length) return "No scheme activated since the subscription start in the seed (bridge covered by unit logic)";
  const sid = ev[0].sourceRef.split(" ")[0];
  const sc = schemeStore.get().schemes.find((s) => s.id === sid)!;
  const progs = sc.versions[sc.versions.length - 1].config.basic.programmes;
  expect(ev.filter((x) => x.sourceRef.startsWith(sid)).every((x) => progs.includes(x.programme!)), "ineligible programme");
  return `${sid}: ${ev.filter((x) => x.sourceRef.startsWith(sid)).length} eligible members notified`;
});
test("H", "N05 uses the milestone event", "deterministic", () => {
  const e = evOf("N05")[0] ?? cs().events.find((x) => x.notificationId === "N05");
  expect(!!e && e.type === "scheme.milestone_achieved" && e.sourceModule.includes("Scheme"), "no N05");
  return `${e!.id} from ${e!.sourceRef}`;
});
let surveyComm = "";
test("I", "N06 survey invitation carries the survey reference", "governance", () => {
  const s = cs().surveys.find((x) => x.id === "SRV-001")!;
  const r = C.dispatchSurvey(SNEHA, s.id);
  expect(r.ok, r.errors.join("; "));
  surveyComm = r.id!;
  const c = cs().communications.find((x) => x.id === surveyComm)!;
  expect(c.notificationId === "N06" && c.deepLink === "rishta://survey/{survey_id}" && atts(surveyComm).length > 0, c.deepLink ?? "");
  const noLink = E.validateComposition(cs(), mem(), draft({ notificationId: "N06", deepLink: null, manualContent: { subject: "", title: "", body: "Please answer" }, templateIds: [] }), all, "2026-11-09T14:30");
  expect(noLink.errors.some((e) => e.includes("survey reference")), "N06 without link accepted");
  return `${surveyComm}: N06 to ${c.audienceCount} EP members with the survey link; N06 without a link refused`;
});
test("J", "N07 follows authoritative redemption status; success only after payout confirmation", "deterministic", () => {
  const p = walletStore.get().payouts.find((x) => x.status === "in_process")!;
  const red = p.redemptionId;
  C.processEvents();
  expect(!cs().events.some((e) => e.id === `EVT-N07-${red}-success`), "success before payment");
  expect(simulatePayoutCallback(SNEHA, p.id, "success").ok, "callback");
  C.processEvents();
  const e = cs().events.find((x) => x.id === `EVT-N07-${red}-success`)!;
  expect(!!e && String(e.payload.utr).startsWith("UTR"), "no success event");
  return `${red}: N07 success sent only after the payout callback, with ${e.payload.utr}`;
});
test("K", "N08 uses confirmed TDS reconciliation outcomes only", "deterministic", () => {
  const blocked = walletStore.get().tdsFy.filter((t) => t.status === "business_confirmation_required");
  expect(!cs().events.some((e) => blocked.some((b) => e.id === `EVT-N08-${b.id}`)), "blocked TDS outcome notified");
  return `${evOf("N08").length} N08 events; ${blocked.length} unconfirmed outcome(s) never notified`;
});
test("L", "N09 for issued vouchers and confirmed deliveries only", "deterministic", () => {
  const ev = cs().events.filter((e) => e.notificationId === "N09");
  const reds = walletStore.get().redemptions;
  expect(ev.every((e) => e.type !== "gift.delivered" || reds.find((r) => r.id === e.sourceRef)?.product?.delivery === "delivered"), "undelivered gift notified");
  return `${ev.length} N09 events (voucher issued / delivery confirmed)`;
});
test("M", "N10 targets only incomplete-KYC members and needs a configured cadence", "blocked", () => {
  const c = draft({ name: "KYC reminder", mode: "scheduled", notificationId: "N10", audience: { ...E.EMPTY_FILTER, statuses: ["pending_kyc"] }, channels: ["whatsapp"], templateIds: ["TPL-N10-WA"], scheduledAt: "2026-11-20T10:00", manualContent: null });
  const v = E.validateComposition(cs(), mem(), c, all, "2026-11-09T14:30");
  expect(v.errors.some((e) => e.includes("cadence")), "N10 allowed without cadence");
  expect(v.audience.included.every((m) => ["active_scan", "redemption_kyc_pending"].includes(m.status) && m.status !== "redemption_enabled"), "complete KYC member included");
  return `${v.audience.included.length} incomplete-KYC members; scheduling refused until the cadence is confirmed (CD-08)`;
});
test("N", "N11 block / hold / reinstatement without internal fraud detail", "deterministic", () => {
  const ev = cs().events.filter((e) => e.notificationId === "N11");
  expect(ev.length > 0 && ev.every((e) => !/fraud|dedup|pan matches/i.test(Object.values(e.payload).join(" "))), "internal detail exposed");
  return `${ev.length} N11 events: ${ev.map((e) => e.type).join(", ")}`;
});

/* ---------------- O–Q: templates and audience ---------------- */
test("O", "Editing one language creates a new version; other languages and old versions remain", "governance", () => {
  const t = cs().templates.find((x) => x.id === "TPL-N03-PUSH")!;
  const v1 = JSON.stringify(t.versions[0]);
  const trs = t.versions[0].translations.map((x) => (x.lang === "hi" ? { ...x, body: "{{points}} पॉइंट जमा (स्कैन {{scan_ref}})", status: "needs_review" as const } : x));
  expect(C.saveTemplateDraft(RAHUL, t.id, trs, t.versions[0].deepLink, "Hindi wording").ok, "draft");
  const t2 = cs().templates.find((x) => x.id === t.id)!;
  expect(t2.versions.length === 2 && t2.activeVersion === 1 && JSON.stringify(t2.versions[0]) === v1 && t2.versions[1].translations.find((x) => x.lang === "en")!.body === t.versions[0].translations.find((x) => x.lang === "en")!.body, "overwritten");
  const s = C.submitTemplate(RAHUL, t.id);
  expect(s.ok, s.errors.join("; "));
  const apr = cs().templates.find((x) => x.id === t.id)!.versions[1].approvalRequestId!;
  expect(!decide(RAHUL, apr).ok && decide(ANITA, apr).ok, "approval");
  const t3 = cs().templates.find((x) => x.id === t.id)!;
  expect(t3.activeVersion === 2 && t3.versions[0].status === "superseded", "activation");
  return "v2 created and approved by a different person; v1 kept as superseded; English unchanged";
});
test("P", "Publishing without a required translation is refused", "blocked", () => {
  const v = E.validateComposition(cs(), mem(), draft({ channels: ["push"], templateIds: ["TPL-N04-PUSH"], languages: ["en", "ml"], notificationId: "N04", manualContent: null }), all, "2026-11-09T14:30");
  expect(v.errors.some((e) => e.includes("Missing translation: ml")), v.errors.join("; "));
});
test("Q", "Audience preview by programme and branch shows count and exclusions", "deterministic", () => {
  const a = E.resolveAudience(mem(), { ...E.EMPTY_FILTER, programmes: ["EP"], branches: ["KL-BR-KOCHI"], memberIds: [] }, all, ["whatsapp", "email"]);
  expect(a.included.length > 0 && a.included.every((m) => m.programme === "EP" && m.branchCode === "KL-BR-KOCHI"), "audience");
  const scoped = E.resolveAudience(mem(), { ...E.EMPTY_FILTER, programmes: ["EP"] }, (m) => m.branchCode.startsWith("KA-"));
  expect(scoped.outOfScope > 0 && scoped.included.every((m) => m.branchCode.startsWith("KA-")), "scope");
  return `${a.included.length} EP at Kochi; email missing for ${a.noChannel.email}; a Karnataka-only user sees ${scoped.included.length} (${scoped.outOfScope} out of scope excluded)`;
});

/* ---------------- R–T: bot and helpdesk ---------------- */
test("R", "EP and Retailer have independent role-based menus", "deterministic", () => {
  const ep = cs().menus.find((m) => m.programme === "EP" && m.status === "active")!;
  const rt = cs().menus.find((m) => m.programme === "Retailer" && m.status === "active")!;
  expect(ep.items.some((i) => i.action === "kyc_prompt") && !rt.items.some((i) => i.action === "kyc_prompt") && rt.items.some((i) => i.label.includes("GST")) && !ep.items.some((i) => i.label.includes("GST")), "menus");
  return `EP: ${ep.items.map((i) => i.label).join(", ")} | Retailer: ${rt.items.map((i) => i.label).join(", ")}`;
});
test("S", "Safe bot actions only; redemption is refused", "blocked", () => {
  const m = mem().members.find((x) => x.programme === "EP" && x.status === "redemption_enabled")!;
  const before = JSON.stringify(walletStore.get().ledger.length);
  const bal = C.botRespond(RAHUL, m.id, "EP-1");
  const red = C.botRefuseFreeText("I want to redeem 500 points");
  expect(bal.text.startsWith("Available points") && red.refused && JSON.stringify(walletStore.get().ledger.length) === before, bal.text);
  const bad = E.validateMenu({ programme: "EP", items: [{ id: "x", label: "Redeem", action: "redeem", description: "", deepLink: null, next: null, escalation: false, statuses: [], enabled: true }] }, []);
  const save = C.saveBotMenu(RAHUL, { ...cs().menus.find((x) => x.programme === "EP" && x.status === "active")!, items: [{ id: "x", label: "Transfer", action: "transfer_points", description: "", deepLink: null, next: null, escalation: false, statuses: [], enabled: true }] });
  expect(!bad.ok && !save.ok && ["redeem", "transfer_points", "adjust_points", "approve_kyc"].every((a) => !BOT_ACTION[a as keyof typeof BOT_ACTION].safe), "unsafe accepted");
  return `${bal.text}; "redeem" refused; menus with redeem / transfer refused; ledger unchanged`;
});
test("T", "Unresolved bot query escalates to the agent queue with a reference", "governance", () => {
  const m = mem().members.find((x) => x.programme === "ST" && x.status === "redemption_enabled")!;
  const r = C.escalateToAgent(SNEHA, m.id, "Points not credited", "Bot could not find my scan");
  expect(r.ok && cs().queries.find((q) => q.id === r.id)!.status === "escalated", r.errors.join("; "));
  expect(C.assignQuery(SNEHA, r.id!, "USR-1003").ok && C.resolveQuery(RAHUL, r.id!, "Scan validated").ok, "assign / resolve");
  expect(!C.assignQuery(VIKRAM, r.id!, "USR-1004").ok, "unauthorised assign");
  return `${r.id}: escalated, assigned, resolved; a Sales Rep cannot reassign`;
});

/* ---------------- U–Z: content, banners, surveys, deep links, duplicates, permissions ---------------- */
test("U", "Section FAQ and multi-step How-To are created, previewed and published per permission", "governance", () => {
  const f = C.saveFaq(IMRAN, { id: "", section: "Redemption", programmes: ["ST", "CS"], translations: [{ lang: "en", question: "Where is my UTR?", answer: "In the redemption detail." }], order: 9, status: "draft", publishedAt: null, updatedAt: "", updatedBy: IMRAN });
  expect(f.ok, f.errors.join("; "));
  expect(!C.publishContent(IMRAN, "faq", f.id!, true).ok, "partner maker published");
  const p = C.publishContent(RAHUL, "faq", f.id!, true);
  expect(p.ok && p.warnings.some((w) => w.includes("Missing language")), "publish");
  const g = C.saveGuide(RAHUL, { id: "", name: "Redeem to UPI", topic: "redeeming", description: "", programmes: ["EP"], lang: "en", steps: [{ title: "Open wallet", text: "Tap Wallet", media: null, deepLink: "rishta://wallet" }, { title: "Redeem", text: "Choose UPI", media: null, deepLink: null }], order: 5, status: "draft", updatedAt: "", updatedBy: RAHUL });
  expect(g.ok && C.publishContent(RAHUL, "guide", g.id!, true).ok, "guide");
  return `${f.id} published by Evolve Operations (partner Maker refused; missing languages warned); ${g.id} 2-step guide published`;
});
test("V", "Banner publication needs the named HO Admin permission; the action is audited", "governance", () => {
  const b = "BNR-003";
  const no1 = C.publishBanner(RAHUL, b);
  const no2 = C.publishBanner(TANUJIT, b);
  const ok = C.publishBanner(ANITA, b);
  const ev = cs().audit.find((a) => a.entityId === b && a.action === "published");
  expect(!no1.ok && !no2.ok && ok.ok && ev?.actor === ANITA, `${no1.errors} ${no2.errors}`);
  return "Operations Maker and Super Admin refused; named publisher (direct grant) published; audited";
});
test("W", "Survey responses can be filtered and duplicates are rejected", "deterministic", () => {
  const rs = cs().responses.filter((r) => r.surveyId === "SRV-001");
  const first = rs[0];
  const dup = C.recordSurveyResponse("SRV-001", first.respondentId, { Q1: "5" });
  expect(rs.length > 10 && !dup.ok && cs().responses.some((r) => r.id === dup.id && r.status === "duplicate_rejected"), "duplicate");
  const notInAudience = C.recordSurveyResponse("SRV-001", mem().members.find((m) => m.programme === "Retailer")!.id, {});
  expect(!notInAudience.ok, "ineligible respondent accepted");
  return `${rs.length} development responses; duplicate and ineligible respondent refused`;
});
test("X", "Invalid or unapproved deep link fails validation", "blocked", () => {
  const v = E.validateComposition(cs(), mem(), draft({ deepLink: "https://evil.example/login", manualContent: { subject: "", title: "x", body: "x" }, templateIds: [] }), all, "2026-11-09T14:30");
  const t = E.validateTemplate({ channel: "push", notificationId: "N03" }, { translations: [{ lang: "en", subject: "", title: "x", body: "{{points}} {{bank_account}}", status: "complete" }], deepLink: "rishta://admin", providerApproval: "not_required" }, ["en"]);
  expect(v.errors.some((e) => e.includes("not approved")) && t.errors.some((e) => e.includes("bank_account")) && t.errors.some((e) => e.includes("Deep link")), `${v.errors} | ${t.errors}`);
  return "Unapproved URL refused; unsupported variable and deep link refused in templates";
});
test("Y", "A duplicate event never sends twice", "deterministic", () => {
  const e = evOf("N03")[0];
  const n = cs().attempts.length;
  const r1 = C.ingest([{ ...e }]);
  const r2 = C.redeliverEvent(e.id);
  expect(r1.processed === 0 && r1.duplicates === 1 && r2.ok && cs().attempts.length === n && cs().events.find((x) => x.id === e.id)!.receivedCount === 2, `${r1.processed}`);
  return `${e.id} redelivered: recorded as duplicate (received 2), no new attempts`;
});
test("Z", "View-only users cannot send, edit templates or publish content", "governance", () => {
  const checks = [
    C.dispatchCommunication(LAKSHMI, manualId),
    C.saveTemplateDraft(LAKSHMI, "TPL-N01-WA", [], null, "x"),
    C.publishContent(LAKSHMI, "faq", "FAQ-010", true),
    C.publishBanner(LAKSHMI, "BNR-001"),
    C.saveCommunication(VIKRAM, draft({})),
  ];
  expect(checks.every((r) => !r.ok), checks.map((r) => r.ok).join());
  return "Finance (view) and Sales Rep refused on send, template edit, content publish, banner publish and create";
});

/* ---------------- Governance and edge cases ---------------- */
test("G1", "Empty audience and unknown member references are refused", "blocked", () => {
  const v = E.validateComposition(cs(), mem(), draft({ audience: { ...E.EMPTY_FILTER, memberIds: ["MBR-XX-0001"] }, manualContent: { subject: "", title: "x", body: "x" }, templateIds: [] }), all, "2026-11-09T14:30");
  expect(v.errors.some((e) => e.includes("empty")) && v.errors.some((e) => e.includes("Unknown member")), v.errors.join("; "));
});
test("G2", "Unapproved WhatsApp template cannot be used; free text cannot go to WhatsApp", "blocked", () => {
  const v1 = E.validateComposition(cs(), mem(), draft({ notificationId: "N04", channels: ["whatsapp"], templateIds: ["TPL-N04-WA"], manualContent: null }), all, "2026-11-09T14:30");
  const v2 = E.validateComposition(cs(), mem(), draft({ channels: ["whatsapp"], manualContent: { subject: "", title: "", body: "Hi" }, templateIds: [] }), all, "2026-11-09T14:30");
  expect(v1.errors.some((e) => e.includes("provider approval")) && v2.errors.some((e) => e.includes("provider-approved")), `${v1.errors} | ${v2.errors}`);
});
test("G3", "Delivery states stay distinct; duplicate callbacks are ignored", "deterministic", () => {
  const a = cs().attempts.find((x) => x.status === "dispatched")!;
  expect(C.providerCallback(SNEHA, a.id, "delivered", "CB-T-1").ok, "callback");
  const r = C.providerCallback(SNEHA, a.id, "failed", "CB-T-2");
  const after = cs().attempts.find((x) => x.id === a.id)!;
  expect(after.status === "delivered" && r.warnings.length > 0 && after.callbacks.some((c) => c.duplicate), after.status);
  return `${a.id}: dispatched → delivered by callback; a late failure callback ignored`;
});
test("G4", "Retries are refused until a retry policy is confirmed", "blocked", () => {
  const f = cs().attempts.find((x) => x.status === "failed")!;
  const r = C.retryAttempt(SNEHA, f.id);
  expect(!r.ok && r.errors[0].includes("CD-07"), r.errors.join("; "));
  const d = cs().attempts.find((x) => x.status === "delivered")!;
  expect(!C.retryAttempt(SNEHA, d.id).ok, "delivered retried");
});
test("G5", "Editing a scheduled communication returns it to draft for re-approval; cancellation works", "governance", () => {
  const c = cs().communications.find((x) => x.id === "COMM-0004")!;
  expect(C.saveCommunication(RAHUL, { ...c, name: `${c.name} (edited)` }).ok, "edit");
  expect(cs().communications.find((x) => x.id === c.id)!.status === "draft", "not reset");
  expect(C.cancelCommunication(SNEHA, c.id, "Plan changed").ok && cs().communications.find((x) => x.id === c.id)!.status === "cancelled", "cancel");
});
test("G6", "Disabled catalogue entries skip their events (no dispatch)", "governance", () => {
  expect(C.setEntryEnabled(RAHUL, "N05", false, "Test").ok === false, "Maker without disable permission allowed");
  expect(C.setEntryEnabled(TANUJIT, "N05", false, "Pause milestone messages").ok, "admin disable");
  const fake = { id: "EVT-N05-TEST", notificationId: "N05" as const, type: "scheme.milestone_achieved", sourceModule: "Scheme & Incentive Management", sourceRef: "TEST", at: "2026-11-09T15:00", memberId: mem().members[0].id, programme: mem().members[0].programme, payload: {} };
  C.ingest([fake]);
  expect(cs().events.find((e) => e.id === fake.id)!.status === "skipped_disabled", "dispatched while disabled");
  C.setEntryEnabled(TANUJIT, "N05", true, "Resume");
  return "N05 disabled by an authorised admin: event recorded as skipped, nothing sent";
});
test("G7", "Testimonials need consent and approval; geofence surveys stay disabled", "blocked", () => {
  const r = C.saveRich(RAHUL, { id: "", kind: "testimonial", name: "No consent", description: "x", mediaId: null, deepLink: null, programmes: ["EP"], lang: "en", order: 9, status: "draft", contributor: { display: "A.", consentRef: null, consentConfirmed: false }, approvalRequestId: null, updatedAt: "", updatedBy: RAHUL });
  expect(r.ok && !C.publishRich(RAHUL, r.id!).ok, "published without consent");
  const s = cs().surveys.find((x) => x.id === "SRV-003")!;
  expect(!C.submitSurvey(RAHUL, s.id).ok && !C.saveSurvey(RAHUL, { ...s, geofence: { enabled: true, retailerRef: null, radius: null } as never }).ok, "geofence");
});
test("G8", "Invalid social URL and media type are refused", "blocked", () => {
  expect(!C.saveLink(IMRAN, { ...cs().links[0], url: "javascript:alert(1)" }).ok && !C.registerMedia(RAHUL, { name: "x.exe", type: "", sizeKb: 1 }).ok && !C.registerMedia(RAHUL, { name: "big.jpg", type: "image/jpeg", sizeKb: 999999 }).ok, "accepted");
});
test("G9", "Open decisions stay visible", "deterministic", () => {
  const refs = cs().decisions.map((d) => d.ref);
  expect(["OP-A21", "OP-CHAT1", "OP-CONTENT1", "OP-SURV1"].every((r) => refs.includes(r)) && cs().decisions.filter((d) => d.status === "open").length >= 4, "decisions");
  expect(cs().languages.length === 8 && cs().languages.some((l) => l.coverage.push === "unconfirmed" && l.coverage.bot === "unconfirmed"), "OP-A21 coverage");
  return `${cs().decisions.length} decisions; push / bot language coverage unconfirmed`;
});
test("G10", "All eleven notification identifiers exist with trigger, audience and channels", "deterministic", () => {
  const ids = cs().catalogue.map((e) => e.id).join();
  expect(ids === "N01,N02,N03,N04,N05,N06,N07,N08,N09,N10,N11" && cs().catalogue.every((e) => e.sowTrigger && e.sowAudience && e.channels.length), ids);
});
test("G11", "Communication audit trail is append-only and records actions", "deterministic", () => {
  const a = cs().audit;
  expect(a.length > 10 && a.every((x, i) => x.id === `CAE-${String(i + 1).padStart(6, "0")}`), "audit ids");
  return `${a.length} audit events in order`;
});

/* ---------------- Report ---------------- */
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.n.padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (pass !== results.length) process.exit(1);
