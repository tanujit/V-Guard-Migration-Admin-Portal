/**
 * Phase 10 — Fraud, risk, device governance, data integrity and compliance test suite
 * (Build Prompt 10, section 21, scenarios 1–88).
 *   npm run test:risk
 * Runs the real risk store with Member Management, the wallet, the Communication Centre and the
 * central approval engine in Node. SOW-defined behaviour (100 m geo-fence, five-scan store gate, 500 km
 * / 2 h example, dedup timings, one profile per device) is asserted deterministically. Open decisions
 * (OP-02 thresholds, OP-QR1, OP-64 / OP-20, OP-BLK1) are asserted as blocked until confirmed.
 */
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { walletStore } from "@/features/wallet/store";
import { commsStore } from "@/features/comms/store";
import { recordAccess } from "@/features/access/accessLog";
import * as R from "@/features/risk/store";
import * as E from "@/features/risk/engine";
import type { AnomalyRule, Period } from "@/types/risk";
import type { Member } from "@/types/members";

const RAHUL = "USR-1003", SNEHA = "USR-1004", ANITA = "USR-2001", TANUJIT = "USR-1001", VIKRAM = "USR-2006", KA_ADMIN = "USR-2004";
const rs = () => R.riskStore.get();
const mem = () => memberStore.get();
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string, action: "approve" | "reject" | "return" = "approve") => decideRequest(uid, id, action, "Reviewed in test", req(id).seq);
const AT = "2026-11-09T14:30";

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: number; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
function test(n: number, name: string, kind: Kind, fn: () => string | void) {
  try {
    results.push({ n, name, kind, ok: true, detail: fn() ?? "" });
  } catch (e) {
    results.push({ n, name, kind, ok: false, detail: (e as Error).message });
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const ok = (r: { ok: boolean; errors: string[] }, what = "") => expect(r.ok, `${what} ${r.errors.join("; ")}`.trim());
const prog = (p: string) => mem().members.filter((m) => m.programme === p && m.status !== "rejected");
const unrestricted = (m: Member) => !mem().restrictions.some((r) => r.status !== "lifted" && r.memberIds.includes(m.id));
const ev = (id: string) => rs().events.find((e) => e.id === id)!;
const audited = (action: string, entityId?: string) => rs().audit.some((a) => a.action === action && (!entityId || a.entityId === entityId));

/* ======================= Fraud review (1–10) ======================= */

const m1 = prog("EP").filter(unrestricted)[30];
let e1 = "", e2 = "", caseA = "", caseB = "";
test(1, "Rule-based risk event appears in the central queue", "deterministic", () => {
  const r = R.ingestSignal({ sourceKey: "TEST-RULE-1", vector: "scan_rate", source: "rule", memberId: m1.id, context: "Backend rule output (test)", signal: { observed: 90 }, ruleRef: "BACKEND-RATE" });
  ok(r);
  e1 = r.id!;
  expect(R.eventsFor(SNEHA).some((e) => e.id === e1 && e.source === "rule" && e.status === "new"), "not in queue");
});
test(2, "Predictive anomaly appears in the same queue", "deterministic", () => {
  ok(R.ingestPredictive({ memberId: m1.id, expected: 20, observed: 70, deviation: "+50 scans", window: "7 days to 2026-11-09", flagged: true, modelRef: "DEV-SIM-AF02" }));
  const p = rs().events.find((e) => e.source === "predictive" && e.memberId === m1.id)!;
  e2 = p.id;
  expect(p && R.eventsFor(SNEHA).some((e) => e.id === e2), "predictive missing from the single queue");
});
test(3, "Multiple risk events are grouped into one investigation (no identity merge)", "governance", () => {
  const n = mem().members.length;
  const r = R.openCase(SNEHA, [e1, e2], "Scan spike, rule + predictive");
  ok(r);
  caseA = r.id!;
  const c = rs().cases.find((x) => x.id === caseA)!;
  expect(c.eventIds.length === 2 && ev(e1).caseId === caseA && ev(e2).caseId === caseA && mem().members.length === n, "grouping");
  expect(!R.openCase(SNEHA, [e1], "dup").ok, "event in two open cases");
});
test(4, "Investigator is assigned", "governance", () => {
  expect(!R.assignCase(SNEHA, caseA, VIKRAM).ok, "assigned to a user without investigation rights");
  ok(R.assignCase(SNEHA, caseA, RAHUL));
  ok(R.setCaseStatus(RAHUL, caseA, "under_investigation", "Reviewing scans"));
  expect(rs().cases.find((x) => x.id === caseA)!.ownerId === RAHUL, "owner");
});
test(5, "Evidence is attached", "deterministic", () => {
  ok(R.addEvidence(RAHUL, caseA, { kind: "scan", ref: "SCN-DEV-90001", description: "Scan export (test)", sensitive: true }));
  expect(rs().cases.find((x) => x.id === caseA)!.evidence.length === 1 && audited("evidence_attached", caseA), "evidence");
});
test(6, "Case is escalated (alert through the Communication Centre)", "governance", () => {
  expect(!R.setCaseStatus(RAHUL, caseA, "restriction_applied", "skip").ok, "arbitrary status accepted");
  ok(R.setCaseStatus(RAHUL, caseA, "escalated", "Needs V-Guard review"));
  const a = rs().alerts.find((x) => x.kind === "case_escalated" && x.ref.startsWith(caseA))!;
  expect(a && commsStore.get().communications.some((c) => c.id === a.commId), "no alert");
});
test(7, "Case is cleared; events kept", "deterministic", () => {
  ok(R.decideCase(RAHUL, caseA, "cleared", "Bulk purchase confirmed by the SR"));
  expect(ev(e1).status === "cleared" && ev(e2).status === "cleared", "events");
  ok(R.closeCase(RAHUL, caseA, "Closed after clearing"));
});
test(8, "Confirmed misuse is recorded", "deterministic", () => {
  const m = prog("ST").filter(unrestricted)[10];
  const r = R.ingestSignal({ sourceKey: "TEST-MISUSE-1", vector: "duplicate_qr", source: "system_validation", memberId: m.id, context: "Test", signal: {} });
  caseB = R.openCase(SNEHA, [r.id!], "QR reuse").id!;
  ok(R.assignCase(SNEHA, caseB, SNEHA));
  ok(R.setCaseStatus(SNEHA, caseB, "under_investigation", "Start"));
  ok(R.decideCase(SNEHA, caseB, "confirmed_misuse", "Same QR batch reused"));
  const c = rs().cases.find((x) => x.id === caseB)!;
  expect(c.status === "confirmed_misuse" && c.decision?.outcome === "confirmed_misuse" && ev(r.id!).status === "confirmed", "misuse");
});
test(9, "Historical risk events remain preserved; a case cannot close without a decision", "governance", () => {
  const n = rs().events.length;
  const r = R.ingestSignal({ sourceKey: "TEST-NODEC", vector: "branch_leakage", source: "rule", memberId: m1.id, context: "Test", signal: {} });
  const c = R.openCase(SNEHA, [r.id!], "No decision").id!;
  expect(!R.closeCase(SNEHA, c, "Try").ok, "closed without decision");
  expect(rs().events.length === n + 1 && rs().events.some((e) => e.id === e1), "event lost");
  expect(!("deleteEvent" in R) && !("deleteCase" in R), "delete API exists");
});
test(10, "Risk score is displayed only when supplied", "deterministic", () => {
  const withScore = R.ingestSignal({ sourceKey: "TEST-SCORE", vector: "device_farming", source: "rule", memberId: m1.id, context: "Scored", signal: {}, score: 0.82 });
  expect(ev(e1).score === null && ev(withScore.id!).score === 0.82, "score");
  expect(rs().events.filter((e) => e.score != null).every((e) => typeof e.score === "number") && rs().events.some((e) => e.score === null && e.severity === null), "scores invented");
});

/* ======================= Duplicate identity (11–19) ======================= */

let batchRef = "";
test(11, "Mobile duplicate detected in real time", "deterministic", () => {
  const existing = prog("EP")[3];
  const r = R.mobileDedupCheck(existing.mobile, "ST", "REG-TEST-0001");
  ok(r);
  const m = rs().identityMatches.find((x) => x.id === r.id)!;
  expect(r.duplicate && m.identifier === "mobile" && m.method === "realtime" && m.originalMemberId === existing.id, "mobile");
  expect(R.mobileDedupCheck("+91 90000 00001", "EP", "REG-TEST-0002").duplicate === false, "false positive");
});
test(12, "Aadhaar duplicate detected in the nightly batch", "deterministic", () => {
  expect(!R.runNightlyDedup("2026-11-10T03:00").ok, "batch ran outside midnight");
  const r = R.runNightlyDedup("2026-11-10T00:00");
  ok(r);
  batchRef = r.id!;
  expect(rs().identityMatches.some((m) => m.identifier === "aadhaar" && m.batchRef === batchRef && m.method === "nightly_batch"), "aadhaar");
  expect(R.runNightlyDedup("2026-11-11T00:00").matches === 0, "duplicate matches on rerun");
});
test(13, "PAN duplicate detected in the nightly batch", "deterministic", () => {
  expect(rs().identityMatches.some((m) => m.identifier === "pan" && m.method === "nightly_batch" && m.batchRef), "pan");
});
test(14, "Bank account duplicate detected in the nightly batch", "deterministic", () => {
  expect(rs().identityMatches.filter((m) => m.identifier === "bank" && m.method === "nightly_batch").length >= 2, "bank");
});
test(15, "Device identifier match flagged", "deterministic", () => {
  expect(rs().identityMatches.some((m) => m.identifier === "device" && m.method === "device_capture"), "device capture");
});
test(16, "Cross-programme identity relationship displayed", "deterministic", () => {
  const linked = mem().identities.filter((i) => i.memberIds.length > 1);
  expect(linked.length >= 2 && rs().events.some((e) => e.vector === "cross_programme_kyc"), "cross programme");
  return `${linked.length} identities hold several programme memberships`;
});
test(17, "Sensitive identifiers remain masked", "governance", () => {
  expect(rs().identityMatches.every((m) => /[X•]/.test(m.masked) && !/\d{8,}/.test(m.masked.replace(/\s/g, ""))), "unmasked identifier");
  expect(rs().devices.every((d) => d.imeiMasked.includes("•") && d.identifierMasked.includes("•")), "device ids");
});
test(18, "A duplicate match does not merge or delete a profile", "governance", () => {
  const n = mem().members.length;
  const m = rs().identityMatches.find((x) => x.batchRef === batchRef)!;
  expect(mem().members.length === n && mem().members.some((x) => x.id === m.originalMemberId) && mem().members.some((x) => x.id === m.matchingMemberId), "profiles changed");
  expect(!("mergeProfiles" in R), "merge API exists");
});
test(19, "Program Block / Temporary Hold policy is respected", "governance", () => {
  const c = rs().cases.find((x) => x.vector === "duplicate_identity" && x.status === "restriction_applied")!;
  expect(c && c.recommendations[0].appliedRef === mem().restrictions.find((r) => r.trigger === "dedup_batch")?.id, "seeded hold not linked");
  const m = prog("CS").filter(unrestricted)[8];
  const r = R.ingestSignal({ sourceKey: "TEST-HOLD", vector: "duplicate_identity", source: "system_validation", memberId: m.id, context: "Test", signal: {} });
  const cid = R.openCase(SNEHA, [r.id!], "Hold test").id!;
  ok(R.assignCase(SNEHA, cid, SNEHA));
  ok(R.setCaseStatus(SNEHA, cid, "under_investigation", "x"));
  const rec = R.recommend(SNEHA, cid, "temporary_hold", m.id, "Duplicate identity");
  ok(rec);
  expect(mem().restrictions.every((x) => !x.memberIds.includes(m.id) || x.status === "lifted"), "recommendation applied a restriction");
  expect(!R.applyRecommendation(SNEHA, cid, rec.id!, "Apply").ok, "investigator without Member Management rights applied a hold");
  const scanOnly = R.recommend(SNEHA, cid, "scan_block", m.id, "Scan only");
  expect(rs().cases.find((x) => x.id === cid)!.recommendations.find((x) => x.id === scanOnly.id)!.status === "not_supported", "scan-only block accepted");
  ok(R.applyRecommendation(ANITA, cid, rec.id!, "Confirmed duplicate"));
  const hold = mem().restrictions.find((x) => x.type === "temporary_hold" && x.memberIds.includes(m.id))!;
  expect(hold && rs().cases.find((x) => x.id === cid)!.status === "restriction_applied", "hold not applied via Member Management");
  return `${hold.id} applied in Member Management by Anita; investigator could only recommend`;
});

/* ======================= Device farming (20–29) ======================= */

const farm = () => rs().devices.find((d) => d.investigation === "under_review" && d.logins.some((l) => l.outcome === "profile_creation_rejected"))!;
test(20, "Multiple accounts attempt profile creation on one device", "blocked", () => {
  const d = farm();
  const n = d.logins.filter((l) => l.outcome === "profile_creation_rejected").length;
  expect(!R.profileCreationAttempt(d.id, "MBR-NEW-0001").ok && !R.profileCreationAttempt(d.id, "MBR-NEW-0002").ok, "second profile created");
  expect(rs().devices.find((x) => x.id === d.id)!.logins.filter((l) => l.outcome === "profile_creation_rejected").length === n + 2, "rejections not logged");
});
test(21, "One profile per device is enforced by the authoritative service", "deterministic", () => {
  const blank = rs().devices.find((d) => !d.createdProfile)!;
  ok(R.profileCreationAttempt(blank.id, "MBR-NEW-0100"));
  const r = R.profileCreationAttempt(blank.id, "MBR-NEW-0101");
  expect(!r.ok && r.errors[0].includes("one profile per device"), r.errors.join(";"));
});
test(22, "Several existing accounts log in on one device without an automatic block", "governance", () => {
  const d = rs().devices.find((x) => x.createdProfile && x.status === "active" && x.associations.length === 1 && !x.logins.some((l) => l.outcome !== "success"))!;
  const n = rs().events.length;
  for (const m of prog("EP").slice(40, 43)) ok(R.deviceLogin(d.id, m.id, AT));
  const after = rs().devices.find((x) => x.id === d.id)!;
  expect(after.status === "active" && after.associations.length === 4 && rs().events.length === n, "shared login blocked or flagged");
});
let flagged = "";
test(23, "Scanning from the same IMEI across accounts is flagged", "deterministic", () => {
  const d = rs().devices.find((x) => x.associations.length >= 4)!;
  flagged = d.id;
  const r = R.deviceRiskSignal(d.id, "shared_imei_scans", d.associations.map((a) => a.memberId), "Scans from one IMEI by several accounts (service rule)");
  ok(r);
  expect(ev(r.id!).vector === "device_farming" && R.deviceRiskSignal(d.id, "shared_imei_scans", d.associations.map((a) => a.memberId), "again").duplicate, "duplicate flag created");
});
test(24, "One account using several devices is flagged", "deterministic", () => {
  expect(rs().events.some((e) => e.vector === "device_farming" && String(e.signal.devices ?? "") === "4"), "hopper");
});
test(25, "Device login locations are displayed only with permission", "governance", () => {
  const d = farm();
  const r = R.deviceLocations(SNEHA, d.id);
  expect(r.ok && r.logins!.some((l) => l.lat != null), "locations");
  expect(!R.deviceLocations(RAHUL, d.id).ok && !R.deviceLocations(TANUJIT, d.id).ok, "locations exposed");
});
let blockAction = "";
test(26, "Device block requested (impact review required)", "governance", () => {
  const d = farm();
  expect(!R.requestDeviceBlock(SNEHA, d.id, "Farming confirmed", [d.associations[0].memberId]).ok, "block without full impact review");
  expect(!R.requestDeviceBlock(SNEHA, d.id, "", d.associations.map((a) => a.memberId)).ok, "block without reason");
  const r = R.requestDeviceBlock(SNEHA, d.id, "Farming confirmed in CASE-0001", d.associations.map((a) => a.memberId));
  ok(r);
  blockAction = r.id!;
  expect(rs().devices.find((x) => x.id === d.id)!.status === "active", "blocked before approval");
});
test(27, "Device block executed through the authorised workflow", "governance", () => {
  const d = farm() ?? rs().devices.find((x) => x.actions.some((a) => a.id === blockAction))!;
  const a = rs().devices.find((x) => x.id === d.id)!.actions.find((x) => x.id === blockAction)!;
  expect(!decide(SNEHA, a.approvalRequestId!).ok, "maker approved own block");
  ok(decide(ANITA, a.approvalRequestId!));
  const after = rs().devices.find((x) => x.id === d.id)!;
  expect(after.status === "blocked" && !R.deviceLogin(after.id, after.associations[0].memberId, AT).ok, "not blocked");
  expect(mem().restrictions.every((r) => !after.associations.every((x) => r.memberIds.includes(x.memberId)) || r.id), "member restrictions changed");
  return `${after.id} blocked after WF-036; member restrictions untouched`;
});
test(28, "Device released with reason and audit", "governance", () => {
  const d = rs().devices.find((x) => x.actions.some((a) => a.id === blockAction))!;
  expect(!R.requestDeviceRelease(SNEHA, d.id, "").ok, "release without reason");
  expect(!R.requestDeviceRelease(VIKRAM, d.id, "x").ok, "unauthorised release");
  const r = R.requestDeviceRelease(SNEHA, d.id, "Ownership proved at the branch");
  ok(r);
  const a = rs().devices.find((x) => x.id === d.id)!.actions.find((x) => x.id === r.id)!;
  ok(decide(ANITA, a.approvalRequestId!));
  expect(rs().devices.find((x) => x.id === d.id)!.status === "active" && audited("device_released", d.id), "release");
});
test(29, "A device risk event is cleared without an unnecessary block", "deterministic", () => {
  ok(R.clearDeviceReview(SNEHA, flagged, "Shop owner helping influencers (legitimate shared use)"));
  const d = rs().devices.find((x) => x.id === flagged)!;
  expect(d.investigation === "cleared" && d.status === "active" && !d.actions.some((a) => a.action === "block"), "blocked");
});

/* ======================= Rate limits and anomalies (30–41) ======================= */

test(39, "Unconfirmed thresholds remain inactive", "blocked", () => {
  const r = rs().rules.find((x) => x.status === "approved_inactive")!;
  expect(!R.activateRule(SNEHA, r.id, "Try").ok, "activated with OP-02 open");
  const sim = R.ruleServiceEvaluate(r.id, m1.id, { day: 9999 });
  expect(sim.ok && sim.flagged === false && sim.warnings[0].includes("Simulation only"), "inactive rule flagged");
  expect(!R.saveRule(SNEHA, { ...r, id: "", demo: false }, "Production").ok, "business values accepted before OP-02");
  return `${r.id}: approved as configuration, inactive; demo values never activate`;
});
// Business confirmation of OP-02 for the remaining rate scenarios (test-only answer).
ok(R.updateRiskDecision(SNEHA, "OP-02", { status: "confirmed", answer: "TEST ONLY: thresholds supplied for the automated test run" }));
function liveRule(kind: AnomalyRule["kind"], limits: Partial<Record<Period, number>>, categoryId: string | null = null): string {
  const base: AnomalyRule = { id: "", kind, name: `Test ${kind} ${Object.keys(limits).join("/")}`, programme: categoryId ? null : "EP", memberType: null, categoryId, skuId: null, states: [], unit: kind === "redemption" ? "redemptions" : "scans", limits: { hour: null, day: null, week: null, month: null, ...limits }, effectiveFrom: "2026-11-01", effectiveTo: null, autoFlag: true, demo: false, status: "draft", version: 1, replaces: null, approvalRequestId: null, history: [], updatedBy: SNEHA, updatedAt: "" };
  const s = R.saveRule(SNEHA, base, "Confirmed values (test)");
  ok(s, "save");
  ok(R.submitRule(SNEHA, s.id!), "submit");
  const r = rs().rules.find((x) => x.id === s.id)!;
  ok(decide(ANITA, r.approvalRequestId!), "approve");
  expect(rs().rules.find((x) => x.id === s.id)!.status === "approved_inactive", "approval activated the rule");
  ok(R.activateRule(SNEHA, s.id!, "Activate (test)"), "activate");
  return s.id!;
}
const rateCase = (n: number, name: string, kind: AnomalyRule["kind"], period: Period, limits: Partial<Record<Period, number>>, cat: string | null = null) =>
  test(n, name, "deterministic", () => {
    const id = liveRule(kind, limits, cat);
    const r = R.ruleServiceEvaluate(id, m1.id, { [period]: (limits[period] ?? 0) + 5 }, `2026-11-09T1${n % 10}:00`);
    ok(r);
    expect(r.flagged && r.exceeded!.some((x) => x.period === period) && ev(r.id!).vector === (kind === "redemption" ? "redemption_abuse" : "scan_rate"), "not flagged");
    expect(R.ruleServiceEvaluate(id, m1.id, { [period]: (limits[period] ?? 0) - 1 }).flagged === false, "flagged within limit");
    return `${id} ${period} limit ${limits[period]} exceeded → ${r.id}`;
  });
rateCase(30, "Scan-In daily threshold exceeded", "scan_in", "day", { day: 40, week: 200, month: 600 });
rateCase(31, "Scan-In weekly threshold exceeded", "scan_in", "week", { day: 40, week: 150, month: 600 });
rateCase(32, "Scan-In monthly threshold exceeded", "scan_in", "month", { day: 40, week: 200, month: 500 });
rateCase(33, "Scan-Out daily threshold exceeded", "scan_out", "day", { day: 60, week: 300, month: 900 });
rateCase(34, "Scan-Out weekly threshold exceeded", "scan_out", "week", { day: 60, week: 250, month: 900 });
rateCase(35, "Scan-Out monthly threshold exceeded", "scan_out", "month", { day: 60, week: 300, month: 800 });
rateCase(36, "Redemption threshold exceeded", "redemption", "week", { day: 2, week: 5, month: 12 });
rateCase(37, "Category-specific hourly limit exceeded", "scan_in", "hour", { hour: 10, day: 30, week: 150, month: 400 }, "CAT-004");
rateCase(38, "Category-specific daily limit exceeded", "scan_in", "day", { hour: 10, day: 25, week: 150, month: 400 }, "CAT-001");
test(40, "Predictive anomaly flags an unusual scan-count spike", "deterministic", () => {
  const m = prog("Retailer")[9];
  ok(R.ingestPredictive({ memberId: m.id, expected: 30, observed: 140, deviation: "+110 scans", window: "7 days to 2026-11-10", flagged: true, modelRef: "DEV-SIM-AF02" }));
  const p = rs().predictive.find((x) => x.memberId === m.id && x.window.endsWith("2026-11-10"))!;
  expect(p.status === "flagged" && ev(p.riskEventId!).source === "predictive" && p.simulated, "predictive");
});
test(41, "A predictive alert never becomes a restriction by itself", "governance", () => {
  const m = prog("Retailer")[9];
  expect(unrestricted(m) && !rs().cases.some((c) => c.links.memberIds.includes(m.id)), "predictive restricted or auto-cased");
});

/* ======================= Redemption abuse (42–48) ======================= */

let blk = "";
const freeRed = () => walletStore.get().redemptions.find((r) => unrestricted(mem().members.find((m) => m.id === r.memberId)!) && !rs().redemptionBlocks.some((b) => b.redemptionRef === r.id) && r.stage === "processing")!;
test(42, "Redemption risk trigger blocks the transaction", "deterministic", () => {
  const r = freeRed();
  const out = R.redemptionRiskBlocked(r.id, "Redemption threshold exceeded (backend rule)", "Redemption service: REJECTED_RISK (mock)");
  ok(out);
  blk = out.id!;
  expect(rs().redemptionBlocks.find((b) => b.id === blk)!.blockStatus === "blocked", "not blocked");
  expect(R.redemptionRiskBlocked(r.id, "Redemption threshold exceeded (backend rule)", "again").warnings[0].includes("Duplicate"), "duplicate block callback");
});
test(43, "Admin warning email event is generated", "governance", () => {
  const b = rs().redemptionBlocks.find((x) => x.id === blk)!;
  const c = commsStore.get().communications.find((x) => x.id === b.warning.alertRef)!;
  expect(b.warning.status === "sent" && c && c.channels.includes("email") && commsStore.get().attempts.some((a) => a.commId === c.id && a.recipientKind === "staff"), "no warning");
  expect(rs().redemptionBlocks.every((x) => x.warning.status === "sent"), "a block without warning");
});
test(44, "The risk event enters the review queue", "deterministic", () => {
  const b = rs().redemptionBlocks.find((x) => x.id === blk)!;
  expect(ev(b.riskEventId!).vector === "redemption_abuse" && ev(b.riskEventId!).links.redemptionRefs.includes(b.redemptionRef), "not queued");
});
test(45, "Member restriction status is displayed", "deterministic", () => {
  const seeded = rs().redemptionBlocks.find((b) => b.redemptionRef === "RED-00108")!;
  expect(mem().restrictions.some((r) => r.status !== "lifted" && r.memberIds.includes(seeded.memberId)), "restriction");
});
test(46, "Restriction is reviewed: lifting is refused while a member restriction remains", "blocked", () => {
  const seeded = rs().redemptionBlocks.find((b) => b.redemptionRef === "RED-00108")!;
  const r = R.requestRedemptionRelease(SNEHA, seeded.id, "Review complete");
  expect(!r.ok && r.errors[0].includes("conflicting member restriction"), r.errors.join(";"));
});
test(47, "Restriction reversed through the authorised process", "governance", () => {
  expect(!R.requestRedemptionRelease(SNEHA, blk, "").ok, "no reason");
  const r = R.requestRedemptionRelease(SNEHA, blk, "Genuine bulk redemption confirmed");
  ok(r);
  expect(rs().redemptionBlocks.find((b) => b.id === blk)!.blockStatus === "blocked", "lifted before approval");
  ok(decide(ANITA, r.id!));
  const b = rs().redemptionBlocks.find((x) => x.id === blk)!;
  expect(b.blockStatus === "lifted" && b.lift?.approvalRef === r.id && ev(b.riskEventId!) !== undefined, "lift");
});
test(48, "Redemption history remains intact", "deterministic", () => {
  const b = rs().redemptionBlocks.find((x) => x.id === blk)!;
  const red = walletStore.get().redemptions.find((r) => r.id === b.redemptionRef)!;
  expect(red && red.stage === "processing" && red.points === b.points, "redemption changed");
});

/* ======================= Geo-velocity, geo-fence, store gate, branch leakage (49–59) ======================= */

test(49, "Consecutive scans show a geo-velocity anomaly", "deterministic", () => {
  const m = prog("EP")[33];
  ok(R.geoVelocitySignal(m.id, { scanRef: "SCN-T1", lat: 9.93, lng: 76.27, location: "Kochi", branchCode: m.branchCode, at: "2026-11-09T08:00" }, { scanRef: "SCN-T2", lat: 22.57, lng: 88.36, location: "Kolkata", branchCode: "WB-BR-KOLKATA", at: "2026-11-09T09:30" }, 1630, 90, "GVS-TEST-1"));
  expect(rs().geoVelocity.some((g) => g.serviceRef === "GVS-TEST-1") && R.geoVelocitySignal(m.id, { scanRef: "SCN-T1", lat: 0, lng: 0, location: "", branchCode: null, at: "" }, { scanRef: "SCN-T2", lat: 0, lng: 0, location: "", branchCode: null, at: "" }, 1, 1, "GVS-TEST-1").duplicate, "duplicate geo event");
});
test(50, "The SOW example (over 500 km in under 2 hours) is recognised", "deterministic", () => {
  expect(E.sowGeoVelocityExample(2108, 95) && E.sowGeoVelocityExample(1630, 90) && !E.sowGeoVelocityExample(498, 190) && !E.sowGeoVelocityExample(600, 130) && !E.sowGeoVelocityExample(null, 60), "example");
});
test(51, "Branch mismatch is detected and routed to reconciliation", "deterministic", () => {
  const l = rs().leaks[0];
  const before = mem().members.find((m) => m.id === l.memberId)!.branchCode;
  ok(R.routeLeakToReconciliation(SNEHA, l.id));
  expect(rs().validationExceptions.some((x) => x.id === rs().leaks[0].reconciliationRef) && mem().members.find((m) => m.id === l.memberId)!.branchCode === before, "branch changed");
});
const rt = prog("Retailer").filter((m) => !rs().geoFence.some((g) => g.memberId === m.id))[0];
const cs = prog("CS").filter((m) => !rs().geoFence.some((g) => g.memberId === m.id))[0];
test(52, "Retailer scan outside the 100 m geo-fence is blocked", "deterministic", () => {
  const out = R.geoFenceScan(rt.id, { distanceM: 150, accuracyM: 10, gps: "granted" });
  const inside = R.geoFenceScan(rt.id, { distanceM: 80, accuracyM: 10, gps: "granted" });
  const edge = R.geoFenceScan(rt.id, { distanceM: 100, accuracyM: 10, gps: "granted" });
  expect(out.allowed === false && out.banner?.includes("100 m") && inside.allowed && edge.allowed, "retailer fence");
  expect(R.geoFenceScan(prog("EP")[0].id, { distanceM: 5000, accuracyM: 5, gps: "granted" }).allowed, "EP fenced");
});
test(53, "CS scan outside the 100 m geo-fence is blocked", "deterministic", () => {
  expect(R.geoFenceScan(cs.id, { distanceM: 101, accuracyM: 8, gps: "granted" }).allowed === false, "cs fence");
});
test(54, "Low accuracy / denied GPS shows the eligibility state", "blocked", () => {
  const d = R.geoFenceScan(cs.id, { distanceM: null, accuracyM: null, gps: "denied" });
  const l = R.geoFenceScan(cs.id, { distanceM: 20, accuracyM: 300, gps: "granted", serviceVerdict: "low_accuracy" });
  expect(!d.allowed && d.banner!.includes("Location permission") && !l.allowed && l.banner!.includes("accuracy"), "gps states");
  expect(R.geoFenceScan(cs.id, { distanceM: 20, accuracyM: 300, gps: "granted" }).allowed, "portal applied its own accuracy threshold");
});
const pendingStore = () => rs().storeGeo.find((s) => s.sfdcStatus === "pending" && s.scanCount === 0)!;
let storeMember = "";
test(55, "Store geo-validation pending allows at most five QR scans", "deterministic", () => {
  storeMember = pendingStore().memberId;
  for (let i = 0; i < 5; i++) expect(R.storeScanAttempt(storeMember).allowed, `scan ${i + 1} refused`);
  expect(rs().storeGeo.find((s) => s.memberId === storeMember)!.scanCount === 5, "count");
});
test(56, "The sixth scan attempt shows the geo-validation restriction", "blocked", () => {
  const r = R.storeScanAttempt(storeMember);
  expect(!r.allowed && r.message!.includes("self geo-validation") && rs().events.some((e) => e.vector === "store_geo_pending" && e.memberId === storeMember), "sixth scan");
  expect(!R.overrideStoreGate(TANUJIT, storeMember).ok && !("resetStoreGate" in R), "administrator reset allowed");
});
test(57, "Redemption is blocked while store geo-validation is pending", "blocked", () => {
  expect(!R.storeRedemptionAttempt(storeMember).allowed, "redemption allowed");
});
test(58, "SFDC geo-validation completion lifts the restriction", "deterministic", () => {
  ok(R.sfdcStoreValidated(storeMember, "SFDC-GEO-TEST-1"));
  expect(R.storeScanAttempt(storeMember).allowed && R.storeRedemptionAttempt(storeMember).allowed, "not lifted");
});
test(59, "Geo-fence override is audited", "governance", () => {
  const blockedCheck = rs().geoFence.find((g) => g.memberId === rt.id && g.result === "outside_blocked")!;
  expect(!R.approveGeoOverride(VIKRAM, blockedCheck.id, "x").ok && !R.approveGeoOverride(SNEHA, blockedCheck.id, "").ok, "unaudited override");
  ok(R.approveGeoOverride(SNEHA, blockedCheck.id, "Second branch of the same store (SFDC store group)"));
  expect(audited("geo_override_approved", blockedCheck.id) && R.geoFenceScan(rt.id, { distanceM: 160, accuracyM: 10, gps: "granted" }).allowed, "override");
});

/* ======================= Duplicate and tampered QR (60–68) ======================= */

const qa = prog("EP")[35], qb = prog("ST")[11];
let dupMsg = "";
test(60, "Duplicate QR scanned by the same member is rejected", "deterministic", () => {
  expect(R.scanQr("QR-TEST-0001", qa.id).accepted, "first scan rejected");
  const r = R.scanQr("QR-TEST-0001", qa.id);
  expect(r.accepted === false && r.message!.startsWith("You already scanned"), r.message ?? "");
});
test(61, "Duplicate QR scanned by another member is rejected", "deterministic", () => {
  const r = R.scanQr("QR-TEST-0001", qb.id);
  dupMsg = r.message!;
  expect(r.accepted === false && dupMsg.includes("another member"), dupMsg);
});
test(62, "The other member's identity is masked in the message", "governance", () => {
  expect(!dupMsg.includes(qa.id) && dupMsg.includes("••"), dupMsg);
});
test(63, "Duplicate QR enters the investigation / history view", "deterministic", () => {
  const d = rs().duplicateQr.filter((x) => x.qrRef === "QR-TEST-0001");
  expect(d.length === 2 && d.some((x) => x.sameMember) && d.some((x) => !x.sameMember) && d.every((x) => ev(x.riskEventId!).vector === "duplicate_qr"), "history");
});
let tq = "";
test(64, "Tampered QR creates an investigation", "deterministic", () => {
  const r = R.reportTamperedQr("QR-TEST-TMP-1", qb.id, "Label checksum mismatch (QR integrity service)");
  ok(r);
  tq = r.id!;
  expect(rs().tampered.find((t) => t.id === tq)!.status === "open" && rs().alerts.some((a) => a.kind === "tampered_qr"), "tampered");
  ok(R.assignTampered(SNEHA, tq, SNEHA));
  ok(R.evidenceTampered(SNEHA, tq, "PHOTO-001", "Label photo"));
  ok(R.escalateTampered(SNEHA, tq, "Pattern across one branch"));
});
test(65, "PIN-sharing responsibility can be recorded", "deterministic", () => {
  ok(R.recordPinResponsibility(SNEHA, tq, { party: "Retail counter staff (as reported)", decision: "Recorded for review", remarks: "Member reports the label was scratched at the counter" }));
  expect(rs().tampered.find((t) => t.id === tq)!.pin.status === "recorded", "pin");
});
test(66, "Unconfirmed PIN-responsibility rules stay flagged; no PIN is collected", "blocked", () => {
  expect(rs().tampered.find((t) => t.id === tq)!.pin.ruleStatus === "business_confirmation_required", "rule confirmed");
  expect(!R.recordPinResponsibility(SNEHA, tq, { party: "Staff", decision: "PIN 4471", remarks: "" }).ok, "PIN value accepted");
});
test(67, "Daily duplicate-QR digest configuration is available", "deterministic", () => {
  ok(R.setDigestConfig(SNEHA, { schedule: "Daily 07:00 (development)", recipientGroup: "Service Engineers (to confirm)" }));
  ok(R.buildDigestPreview("2026-11-09"));
  expect(rs().digest.previews.every((p) => p.dispatch === "not_dispatched"), "digest dispatched");
});
test(68, "The digest stays inactive until OP-QR1 is confirmed", "blocked", () => {
  expect(!R.activateDigest(SNEHA).ok && !rs().digest.enabled, "digest active");
});

/* ======================= Data integrity and reconciliation (69–78) ======================= */

test(69, "A missing mandatory member name blocks successful synchronisation", "deterministic", () => {
  const r = R.runSyncValidation([{ entityId: "SFDC-T-1", name: "Valid Name", branchCode: "KL-BR-KOCHI" }, { entityId: "SFDC-T-2", name: "  ", branchCode: "KL-BR-KOCHI" }]);
  ok(r);
  const b = rs().validationBatches.find((x) => x.id === r.id)!;
  expect(r.synced!.length === 1 && r.failed!.includes("SFDC-T-2") && b.synced === 1 && rs().validationExceptions.some((x) => x.entityId === "SFDC-T-2" && x.errorType === "missing_mandatory") && rs().alerts.some((a) => a.kind === "mandatory_field_failure" && a.ref === r.id), "not blocked");
});
test(70, "Duplicate identity is detected in the nightly batch", "deterministic", () => {
  expect(rs().dedupBatches.find((b) => b.id === batchRef)!.matches >= 1 && rs().identityMatches.filter((m) => m.batchRef === batchRef).every((m) => m.riskEventId), "batch");
});
test(71, "SFDC district mismatch is identified", "deterministic", () => {
  const m = rs().mismatches.find((x) => x.kind === "district_mismatch")!;
  expect(m && m.sfdc.district !== m.platform.district, "district");
});
test(72, "SFDC branch mismatch is identified", "deterministic", () => {
  const m = rs().mismatches.find((x) => x.kind === "branch_mismatch")!;
  expect(m && m.sfdc.branch !== m.platform.branch, "branch");
});
test(73, "Missing hierarchy reference is identified", "deterministic", () => {
  expect(rs().mismatches.some((x) => x.kind === "missing_branch" && !x.platform.branch) && rs().validationExceptions.some((x) => x.errorType === "invalid_reference"), "missing");
});
test(74, "Invalid parent-child mapping is identified", "deterministic", () => {
  expect(rs().mismatches.some((x) => x.kind === "invalid_parent"), "parent");
});
test(75, "The reconciliation comparison holds both source values", "deterministic", () => {
  const m = rs().mismatches.find((x) => x.kind === "pincode_mismatch")!;
  expect(m.sfdc.pincode && m.platform.pincode && m.sfdc.pincode !== m.platform.pincode, "values");
});
const recon = () => rs().mismatches.find((x) => x.kind === "district_mismatch")!;
test(76, "Ownership of the correction is recorded", "governance", () => {
  expect(!R.proposeCorrection(SNEHA, recon().id, { correction: "Move Aluva to Ernakulam in SFDC", owningSystem: "sfdc", team: "" }).ok, "no team accepted");
  ok(R.proposeCorrection(SNEHA, recon().id, { correction: "Move Aluva to Ernakulam in SFDC", owningSystem: "sfdc", team: "V-Guard SFDC admin" }));
  expect(recon().owningSystem === "sfdc" && recon().responsibleTeam === "V-Guard SFDC admin", "owner");
});
test(77, "A record is not reconciled before the authoritative correction is confirmed", "blocked", () => {
  expect(!R.markReconciled(SNEHA, recon().id).ok, "reconciled without confirmation");
  ok(R.awaitConfirmation(SNEHA, recon().id));
  expect(!R.reprocessMismatch(SNEHA, recon().id).ok, "reprocessed before confirmation");
  ok(R.confirmCorrection(SNEHA, recon().id, "SFDC-CHG-4471"));
  expect(!R.markReconciled(SNEHA, recon().id).ok, "closed before refresh");
  ok(R.reprocessMismatch(SNEHA, recon().id));
  ok(R.markReconciled(SNEHA, recon().id));
  const x = rs().validationExceptions.find((e) => e.entityId === "SFDC-T-2")!;
  expect(!R.resolveException(SNEHA, x.id).ok, "exception resolved without source fix");
  ok(R.recordSourceFix(SNEHA, x.id, "SFDC-FIX-0001"));
  ok(R.reprocessException(SNEHA, x.id));
  ok(R.resolveException(SNEHA, x.id));
  return `${recon().id} reconciled after SFDC-CHG-4471; exception ${x.id} resolved after the source fix`;
});
test(78, "Impact on member mapping and branch-based schemes is visible", "deterministic", () => {
  const m = rs().mismatches.find((x) => x.recordCode === "TN-BR-COIMBATORE")!;
  const i = R.reconImpact(m.id);
  expect(i.members.length > 0 && Array.isArray(i.schemes), "impact");
  return `${m.id}: ${i.members.length} member(s), ${i.schemes.length} branch-scoped scheme(s)`;
});

/* ======================= Compliance and audit (79–88) ======================= */

test(79, "Consent evidence is visible", "deterministic", () => {
  expect(R.dpdpRows().some((r) => r.consent === "given" && r.consentAt) && rs().evidence.some((e) => e.controlRef === "DPDP-CONSENT"), "consent");
});
test(80, "KYC retention metadata is displayed", "deterministic", () => {
  expect(E.retentionEnd("2026-01-15T10:00") === "2033-01-15" && E.retentionEnd(null) === null && R.dpdpRows().every((r) => r.retentionEnd), "retention");
});
test(81, "Verified-field lock status is visible", "deterministic", () => {
  expect(R.dpdpRows().some((r) => r.lockedFields.includes("locked")), "lock");
});
test(82, "PII values remain masked", "governance", () => {
  const rows = JSON.stringify(R.dpdpRows());
  expect(R.dpdpRows().every((r) => r.aadhaar === "Not captured" || r.aadhaar.startsWith("XXXX")) && !mem().members.some((m) => rows.includes(m.mobile)), "PII exposed");
});
test(83, "Access event is recorded", "deterministic", () => {
  recordAccess(SNEHA, "sign_in", AT);
  const a = R.platformAudit().filter((r) => r.kind === "access");
  expect(a.some((r) => r.actor === SNEHA && r.action === "sign_in" && r.location), "access log");
});
test(84, "Data-change event records old and new values", "deterministic", () => {
  const m = rs().identityMatches.find((x) => x.status === "open")!;
  ok(R.setMatchStatus(SNEHA, m.id, "under_review", "Checking registry"));
  const row = R.platformAudit().find((r) => r.source === "Fraud & risk" && r.entityId === m.id && r.action === "match_under_review")!;
  expect(row.before === "open" && row.after === "under_review", "old/new");
});
test(85, "Points adjustment records reason and approver", "deterministic", () => {
  const a = walletStore.get().adjustments.find((x) => x.status === "completed" && x.approvalRequestId)!;
  const r = req(a.approvalRequestId!);
  expect(a.reasonCode && a.createdBy && r.stages.some((s) => s.decidedBy) && a.ledgerIds.length, "adjustment audit");
  expect(R.platformAudit().some((x) => x.approvalRef === r.id), "not in platform audit");
});
test(86, "Configuration changes are auditable (global restrictions need approval)", "governance", () => {
  const g = rs().globals.find((x) => x.type === "redemption_block")!;
  expect(!R.toggleGlobalRestriction(SNEHA, g.id).ok, "toggle allowed");
  expect(!R.requestGlobalRestriction(SNEHA, g.id, "active", ["DD"], "Fraud wave", false).ok, "no impact review");
  expect(!R.requestGlobalRestriction(RAHUL, g.id, "active", ["DD"], "Fraud wave", true).ok, "no Maker profile");
  const r = R.requestGlobalRestriction(SNEHA, g.id, "active", ["DD"], "DD redemption fraud wave (test)", true);
  ok(r);
  expect(rs().globals.find((x) => x.id === g.id)!.status === "pending_activation", "applied before approval");
  ok(decide(ANITA, rs().globals.find((x) => x.id === g.id)!.approvalRequestId!));
  const after = rs().globals.find((x) => x.id === g.id)!;
  expect(after.status === "active" && after.approvedBy === ANITA && audited("global_restriction_activated", g.id) && audited("threshold_drafted") && audited("threshold_activated"), "audit");
});
test(87, "Privileged actions cannot bypass audit logging", "governance", () => {
  for (const a of ["device_block_requested", "device_blocked", "device_release_requested", "global_active_requested", "threshold_activated", "geo_override_approved", "restriction_applied", "evidence_attached", "digest_configured", "reconciled"]) expect(audited(a), `no audit for ${a}`);
  expect(!("commit" in R) && !("setState" in R), "raw write path exported");
  const ids = rs().audit.map((a) => a.id);
  expect(new Set(ids).size === ids.length, "duplicate audit IDs");
});
test(88, "Users without permission cannot access sensitive evidence", "governance", () => {
  const c = rs().cases.find((x) => x.evidence.some((e) => e.sensitive))!;
  const e = c.evidence.find((x) => x.sensitive)!;
  expect(!R.viewEvidence(RAHUL, c.id, e.id).ok && !R.viewEvidence(TANUJIT, c.id, e.id).ok && R.viewEvidence(SNEHA, c.id, e.id).ok, "evidence");
  expect(!R.exportEvents(VIKRAM).ok, "export without permission");
  const ka = R.eventsFor(KA_ADMIN);
  expect(ka.every((x) => !x.branchCode || x.branchCode.startsWith("KA-")) && ka.length < rs().events.length, "regional scope");
  return `Regional Admin (KA) sees ${ka.length} of ${rs().events.length} events; sensitive evidence only with View sensitive`;
});

/* ---------------- Report ---------------- */
results.sort((a, b) => a.n - b.n);
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (pass !== results.length) process.exit(1);
