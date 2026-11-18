/**
 * Phase 11 — Integration management, data exchange, system health, live monitoring and technical
 * operations test suite (Build Prompt 11, section 27, scenarios 1–114).
 *   npm run test:ops
 * Runs the real ops store with Member Management, the wallet, schemes, masters, the Communication
 * Centre, Gift & Fulfilment, the risk store and the central approval engine in Node. SOW-defined
 * behaviour (the ten integrations, the eSeal date rule, SOW 11.5 exceptions, idempotent retries) is
 * asserted deterministically. Open decisions (OP-24, OP-SYNC1, OP-32 / OP-44, OP-45, OP-18,
 * OP-MON1, OP-DORM, OP-FLOAT) are asserted as pending, never as confirmed behaviour.
 */
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { riskStore } from "@/features/risk/store";
import { schemeStore } from "@/features/schemes/store";
import { commsStore } from "@/features/comms/store";
import * as O from "@/features/ops/store";
import * as E from "@/features/ops/engine";
import { DIRECTION, P95_TARGET_MS, SOW_BASELINES } from "@/config/opsCatalogue";
import type { Integration, IntegrationRequest } from "@/types/ops";

const RAHUL = "USR-1003", SNEHA = "USR-1004", ANITA = "USR-2001", LAKSHMI = "USR-2003", TANUJIT = "USR-1001", VIKRAM = "USR-2006";
const os = () => O.opsStore.get();
const mem = () => memberStore.get();
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string, action: "approve" | "reject" | "return" = "approve") => decideRequest(uid, id, action, "Reviewed in test", req(id).seq);
const NOW = "2026-11-09T14:30";

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
const no = (r: { ok: boolean }, what: string) => expect(!r.ok, `${what} was allowed`);
const audited = (action: string, entity?: string) => os().audit.some((a) => a.action === action && (!entity || a.entity === entity));
const reqs = (i: string, f: (r: IntegrationRequest) => boolean = () => true) => os().requests.filter((r) => r.integrationId === i && f(r));
const integ = (id: string) => os().integrations.find((i) => i.id === id)!;
const decision = (id: string) => os().decisions.find((d) => d.id === id)!;
const SOW_IDS = ["INT-SFDC", "INT-ESEAL", "INT-SIEBEL", "INT-RZP", "INT-DIGI", "INT-SIGNZY", "INT-WA", "INT-SMS", "INT-MAPS", "INT-LOGI"];

/* ======================= Integration registry (1–6) ======================= */

test(1, "All ten SOW integrations appear in the directory", "deterministic", () => {
  const ids = os().integrations.map((i) => i.id);
  expect(SOW_IDS.every((id) => ids.includes(id)), "missing SOW integration");
  expect(SOW_IDS.every((id) => integ(id).connection === "mock_adapter" && integ(id).environment === "development"), "SOW integrations must be development mock adapters");
  return `${SOW_IDS.length} SOW integrations + Channel Check placeholder`;
});
test(2, "Correct data direction is displayed", "deterministic", () => {
  const want: Record<string, Integration["direction"]> = { "INT-SFDC": "both", "INT-ESEAL": "in", "INT-WA": "out", "INT-SMS": "out", "INT-RZP": "both", "INT-MAPS": "in" };
  for (const [id, d] of Object.entries(want)) expect(integ(id).direction === d, `${id} direction ${integ(id).direction}`);
  expect(os().integrations.every((i) => DIRECTION[i.direction]), "direction label missing");
});
test(3, "Correct SOW frequency is represented", "deterministic", () => {
  expect(integ("INT-ESEAL").frequency === "Real time" && integ("INT-LOGI").frequency === "Regular polling" && /Scheduled sync/.test(integ("INT-SFDC").frequency), "frequency");
  expect(SOW_IDS.every((id) => integ(id).frequencyStatus === "sow") && integ("INT-CHANNEL").frequencyStatus === "business_confirmation_required", "frequency status");
});
test(4, "Integration ownership can be recorded", "governance", () => {
  no(O.recordOwnership(ANITA, "INT-SIEBEL", { business: "V-Guard service", technical: "", data: "", contractRef: "" }), "Client Admin ownership edit");
  no(O.recordOwnership(RAHUL, "INT-SIEBEL", { business: "V-Guard service", technical: "api_key=abc", data: "", contractRef: "" }), "secret in ownership");
  ok(O.recordOwnership(RAHUL, "INT-SIEBEL", { business: "V-Guard service desk (dev)", technical: "Evolve integration team (dev)", data: "V-Guard", contractRef: "DOC-DEV-SIEBEL-01" }));
  const i = integ("INT-SIEBEL");
  expect(i.ownership.technical === "Evolve integration team (dev)" && audited("ownership_recorded", "INT-SIEBEL"), "ownership");
  expect(i.contractStatus === "business_confirmation_required", "a recorded reference must not confirm the contract");
});
test(5, "Missing integration contract is visible", "blocked", () => {
  const missing = os().integrations.filter((i) => !i.contractRef);
  expect(missing.length >= 9 && os().integrations.every((i) => i.contractStatus === "business_confirmation_required"), "contract status");
  expect(os().integrations.every((i) => i.authType === null && i.retryPolicy === null && i.credentialRef === null), "invented auth / retry / credential");
  return `${missing.length} integrations without a contract reference`;
});
test(6, "Unconfigured integrations are not displayed as Healthy", "governance", () => {
  expect(O.healthFor("INT-CHANNEL") === "bcr", "placeholder health");
  const unconfigured: Integration = { ...integ("INT-SMS"), monitoring: "not_configured" };
  expect(E.healthOf(unconfigured, os().requests, os().jobs, NOW) === "not_configured", "not configured");
  expect(O.healthFor("INT-SIGNZY") === "unknown", "no recent request must be Unknown");
  const failingOnly = [{ ...os().requests[0], integrationId: "INT-X", at: E.hoursBefore(NOW, 1), status: "failed" as const }];
  expect(E.healthOf({ ...integ("INT-SMS"), id: "INT-X" }, failingOnly, [], NOW) === "failed", "no success must be Failed");
  return SOW_IDS.map((id) => `${id.slice(4)}:${O.healthFor(id)}`).join(" ");
});

/* ======================= SFDC (7–22) ======================= */

const rec = (t: string, f: (r: ReturnType<typeof os>["sfdcRecords"][number]) => boolean = () => true) => os().sfdcRecords.filter((r) => r.recordType === t && f(r));
test(7, "ST invitation received", "deterministic", () => {
  expect(rec("st_invitation").length && rec("st_invitation").some((r) => r.externalRef === "INV-SFDC-990101" && r.processing === "pending"), "ST invitation");
});
test(8, "CS invitation received", "deterministic", () => {
  expect(rec("cs_invitation").some((r) => r.externalRef === "INV-SFDC-990102"), "CS invitation");
});
test(9, "Retailer record synchronised", "deterministic", () => {
  const r = reqs("INT-SFDC", (x) => x.operation === "Retailer record sync" && x.status === "success");
  expect(r.length && rec("retailer", (x) => x.processing === "synced").length, "retailer sync");
  return `${r.length} retailer records synced`;
});
test(10, "DD record synchronised", "deterministic", () => {
  expect(reqs("INT-SFDC", (x) => x.operation === "DD record sync" && x.status === "success").length && rec("dd", (x) => x.processing === "synced").length, "DD sync");
});
test(11, "Territory hierarchy received", "deterministic", () => {
  const h = os().batches.filter((b) => b.kind === "hierarchy_sync");
  expect(h.length && h.some((b) => b.succeeded > 0) && os().jobs.find((j) => j.id === "JOB-SFDC-HIER")!.runs.length === h.length, "hierarchy");
});
test(12, "Retailer PAN/GST/geo-location data received (masked)", "governance", () => {
  const r = reqs("INT-SFDC", (x) => x.operation === "Retailer record sync")[0];
  expect(r.sensitivePayload && ["pan", "gstin", "geoLocation"].every((k) => k in r.payload), "fields");
  expect(Object.values(r.payload).every((v) => !/[A-Z]{5}\d{4}[A-Z]/.test(String(v))), "complete PAN exposed");
  no(O.payloadFor(ANITA, r.id), "Client Admin sensitive payload");
  ok(O.payloadFor(RAHUL, r.id));
  expect(audited("payload_viewed", r.id), "payload view not audited");
});
test(13, "DD active product categories received", "deterministic", () => {
  const r = reqs("INT-SFDC", (x) => x.operation === "DD record sync")[0];
  expect(String(r.payload.activeProductCategories ?? "").length > 0, "categories");
  return String(r.payload.activeProductCategories);
});
const cb = (k: string, f: (c: ReturnType<typeof os>["callbacks"][number]) => boolean = () => true) => os().callbacks.filter((c) => c.kind === k && f(c));
test(14, "Registration success returned to SFDC", "deterministic", () => {
  expect(cb("registration_result", (c) => c.result === "Successful registration" && c.delivery === "acknowledged").length, "success callback");
});
test(15, "Registration rejection returned to SFDC", "deterministic", () => {
  expect(cb("registration_result", (c) => c.result === "Rejected" && !!c.reasonCode).length, "rejection callback");
});
test(16, "Profile status update sent", "deterministic", () => {
  expect(cb("status_update").length, "status update");
});
test(17, "GST certificate approval submission monitored", "deterministic", () => {
  expect(cb("gst_certificate", (c) => !!c.approval).length && reqs("INT-SFDC", (r) => r.operation === "GST certificate update").length, "GST callback");
});
test(18, "Callback failure detected", "deterministic", () => {
  expect(cb("registration_result", (c) => c.delivery === "failed").length && os().alerts.some((a) => a.type === "callback_failure" && !!a.commId), "callback failure alert");
});
test(19, "Callback retry history displayed", "governance", () => {
  const c = cb("registration_result", (x) => x.delivery === "failed")[0];
  const before = c.retries.length;
  expect(before >= 2, "seeded retries");
  no(O.retryCallback(ANITA, c.id, "Retry"), "Client Admin retry");
  ok(O.retryCallback(RAHUL, c.id, "Retry after SFDC rejection (test)"));
  const after = os().callbacks.find((x) => x.id === c.id)!;
  expect(after.retries.length === before + 1 && after.delivery === "failed" && audited("callback_retry", c.id), "retry history");
  return `${after.retries.length} retries; SFDC still rejects (contract open)`;
});
test(20, "OP-24 remains unresolved", "blocked", () => {
  expect(decision("OP-24").status === "open" && os().config.rejectionCodes.every((c) => c.status === "sow_example"), "OP-24 / codes");
});
test(21, "Current hourly invitation sync displayed without treating it as final", "blocked", () => {
  const j = os().jobs.find((x) => x.id === "JOB-SFDC-INV")!;
  expect(/Approximately hourly/.test(j.frequency) && j.frequencyStatus === "business_confirmation_required" && j.runs.length === 24, "sync frequency");
});
test(22, "OP-SYNC1 remains unresolved (approved target recorded, decision stays open)", "blocked", () => {
  expect(integ("INT-SFDC").config.invitationTargetFrequency == null, "target already set");
  no(O.requestConfigChange(ANITA, "INT-SFDC", "invitationTargetFrequency", "Every 30 minutes", "Test"), "Client Admin submit");
  const r = O.requestConfigChange(RAHUL, "INT-SFDC", "invitationTargetFrequency", "Every 30 minutes (development)", "Proposed target for review");
  ok(r);
  const p = os().pendingConfig.find((x) => x.id === r.id)!;
  expect(integ("INT-SFDC").config.invitationTargetFrequency == null, "applied before approval");
  no(O.requestConfigChange(RAHUL, "INT-SFDC", "invitationTargetFrequency", "Hourly", "Duplicate"), "second pending change");
  ok(decide(ANITA, p.approvalRequestId!));
  expect(integ("INT-SFDC").config.invitationTargetFrequency === "Every 30 minutes (development)" && audited("config_changed"), "not applied after approval");
  expect(decision("OP-SYNC1").status === "open", "approval must not close OP-SYNC1");
  return `${p.approvalRequestId} approved by Client Admin (WF-037)`;
});

/* ======================= eSeal (23–32) ======================= */

const found = () => os().eseal.filter((l) => l.eseal);
test(23, "Real-time SKU lookup request", "deterministic", () => {
  expect(os().eseal.length && os().eseal.every((l) => os().requests.find((r) => r.id === l.requestId)?.integrationId === "INT-ESEAL"), "lookup requests");
});
test(24, "Category and sub-category response", "deterministic", () => {
  expect(found().length && found().every((l) => l.eseal!.category && l.eseal!.subCategory), "category");
});
test(25, "Points response", "deterministic", () => {
  expect(found().some((l) => typeof l.eseal!.points === "number"), "points");
});
test(26, "PIN requirement response", "deterministic", () => {
  expect(found().some((l) => typeof l.eseal!.pinRequired === "boolean"), "PIN flag");
});
test(27, "Customer-billed date received", "deterministic", () => {
  const l = found().find((x) => x.eseal!.billedDate && !x.eseal!.stockOut)!;
  expect(l && l.effectiveDate === l.eseal!.billedDate, "billed date used");
});
test(28, "Blank billed date", "deterministic", () => {
  const l = found().find((x) => !x.eseal!.billedDate && !x.eseal!.stockOut);
  expect(l && l.effectiveDate === l.eseal!.manufacturingDate && /Billed date blank/.test(l.dateReason), "blank billed fallback");
});
test(29, "Stock-out item", "deterministic", () => {
  const l = found().find((x) => x.eseal!.stockOut);
  expect(l && l.effectiveDate === l.eseal!.manufacturingDate && /stock-out/.test(l.dateReason), "stock-out fallback");
});
test(30, "Manufacturing-date fallback (SOW 11.3 rule)", "deterministic", () => {
  const base = { sku: "S", category: "C", subCategory: "SC", points: 10, pinRequired: false, parentSku: null };
  expect(E.effectiveDate({ ...base, billedDate: "2026-10-01", manufacturingDate: "2026-06-01", stockOut: false }).date === "2026-10-01", "billed");
  expect(E.effectiveDate({ ...base, billedDate: null, manufacturingDate: "2026-06-01", stockOut: false }).date === "2026-06-01", "blank");
  expect(E.effectiveDate({ ...base, billedDate: "2026-10-01", manufacturingDate: "2026-06-01", stockOut: true }).date === "2026-06-01", "stock-out");
  expect(E.effectiveDate({ ...base, billedDate: null, manufacturingDate: null, stockOut: false }).date === null, "neither date must not be invented");
});
test(31, "Parent-child mapping visibility", "deterministic", () => {
  expect(os().packs.length && os().packs.every((p) => p.parentSku && p.childSku) && os().packs.some((p) => p.status === "missing_child"), "packs");
});
test(32, "OP-32 / OP-44 remains visible", "blocked", () => {
  expect(decision("OP-32").status === "open" && /OP-44/.test(decision("OP-32").ref) && os().packs.some((p) => p.status === "source_unconfirmed"), "pack source");
});

/* ======================= Other integrations (33–49) ======================= */

const has = (i: string, op: string, f: (r: IntegrationRequest) => boolean = () => true) => expect(reqs(i, (r) => r.operation === op && f(r)).length, `${i} ${op}`);
test(33, "Siebel customer lookup", "deterministic", () => has("INT-SIEBEL", "Customer lookup"));
test(34, "Siebel warranty lookup", "deterministic", () => has("INT-SIEBEL", "Warranty lookup"));
test(35, "RazorPay UPI request", "deterministic", () => has("INT-RZP", "UPI payout", (r) => r.financial));
test(36, "RazorPay bank transfer request", "deterministic", () => has("INT-RZP", "Bank transfer payout", (r) => r.financial));
test(37, "RazorPay card request", "deterministic", () => has("INT-RZP", "Card payout", (r) => r.financial));
test(38, "UTR reference returned (masked)", "governance", () => {
  const r = reqs("INT-RZP", (x) => x.status === "success" && typeof x.payload.utr === "string");
  expect(r.length && r.every((x) => /^•+.{4}$/.test(String(x.payload.utr))), "UTR not masked");
});
test(39, "Daily RazorPay reconciliation mismatch", "deterministic", () => {
  expect(os().alerts.some((a) => a.type === "reconciliation_difference" && a.integrationId === "INT-RZP") || os().float.snapshots.some((s) => s.reconciliation === "difference"), "reconciliation difference");
  expect(os().jobs.find((j) => j.id === "JOB-RZP-RECON")!.runs.length === 4, "daily reconciliation job");
});
test(40, "DigiLocker verification response", "deterministic", () => has("INT-DIGI", "Aadhaar verification", (r) => r.status !== "pending"));
test(41, "Signzy / NSDL PAN response", "deterministic", () => has("INT-SIGNZY", "PAN check"));
test(42, "Signzy / NSDL bank verification response", "deterministic", () => has("INT-SIGNZY", "Penny-less bank verification"));
test(43, "WhatsApp dispatch status", "deterministic", () => {
  expect(reqs("INT-WA", (r) => r.status === "success").length && reqs("INT-WA", (r) => r.status === "failed").length, "WhatsApp outcomes");
});
test(44, "SMS dispatch status", "deterministic", () => {
  expect(reqs("INT-SMS").length === commsStore.get().attempts.filter((a) => a.channel === "sms").length, "SMS derived from Communication Centre");
});
test(45, "Google Maps reverse geocoding", "deterministic", () => has("INT-MAPS", "Reverse geocoding"));
test(46, "Territory validation result", "deterministic", () => has("INT-MAPS", "Territory validation"));
test(47, "Logistics tracking poll", "deterministic", () => has("INT-LOGI", "Tracking poll", (r) => r.status === "success"));
test(48, "Failed logistics poll", "deterministic", () => has("INT-LOGI", "Tracking poll", (r) => r.status === "failed"));
test(49, "Channel Check placeholder with OP-45", "blocked", () => {
  const c = integ("INT-CHANNEL");
  expect(c.connection === "placeholder" && c.decisions.includes("OP-45") && decision("OP-45").status === "open" && !reqs("INT-CHANNEL").length, "placeholder");
  no(O.requestConfigChange(RAHUL, "INT-CHANNEL", "frequency", "Daily", "Activate"), "placeholder activation");
});

/* ======================= Message trace and volume (50–63) ======================= */

const traced = os().sfdcRecords.find((r) => r.memberId && os().callbacks.some((c) => c.memberRef === r.memberId && c.retries.length))!.memberId!;
test(50, "Search by Member ID", "deterministic", () => {
  no(O.trace(VIKRAM, "member", traced), "trace without integrations:view");
  const t = O.trace(RAHUL, "member", traced);
  ok(t);
  expect(t.steps!.length >= 3 && audited("trace_viewed", `member:${traced}`), "member trace");
  return `${traced}: ${t.steps!.length} steps`;
});
test(51, "Search by Transaction ID", "deterministic", () => {
  const r = reqs("INT-RZP", (x) => !!x.payload.redemption)[0];
  const t = O.trace(RAHUL, "transaction", String(r.payload.redemption));
  ok(t);
  expect(t.requests!.some((x) => x.id === r.id), "payout request in trace");
});
test(52, "Search by Scheme ID", "deterministic", () => {
  const s = schemeStore.get().accruals[0].schemeId;
  const t = O.trace(RAHUL, "scheme", s);
  ok(t);
  expect(t.steps!.length > 0, "scheme steps");
  no(O.trace(RAHUL, "scheme", "SCH-DOES-NOT-EXIST"), "unknown scheme");
});
test(53, "Display multi-system timeline", "deterministic", () => {
  const t = O.trace(RAHUL, "member", traced);
  const systems = new Set(t.steps!.map((s) => s.system));
  expect(systems.size >= 3 && t.steps!.every((s, i, a) => i === 0 || a[i - 1].at <= s.at), "timeline order / systems");
  return [...systems].join(" | ");
});
test(54, "Show request / response timestamps", "deterministic", () => {
  const done = os().requests.filter((r) => r.status === "success");
  expect(done.every((r) => r.at && r.respondedAt && r.respondedAt >= r.at), "timestamps");
});
test(55, "Show failed records", "deterministic", () => {
  const f = os().requests.find((r) => r.status === "failed" && r.memberId)!;
  expect(O.trace(RAHUL, "member", f.memberId!).steps!.some((s) => s.status === "failed"), "failed step");
});
test(56, "Show successful records", "deterministic", () => {
  expect(O.trace(RAHUL, "member", traced).steps!.some((s) => s.status === "success"), "successful step");
});
test(57, "Display retry count", "deterministic", () => {
  expect(O.trace(RAHUL, "member", traced).steps!.some((s) => s.retryCount >= 2), "retry count");
});
const vt = () => E.volumeByType(os().requests);
const vol = (t: string) => vt().find((x) => x.type === t)?.total ?? 0;
test(58, "Show volume by member", "deterministic", () => {
  expect(vol("member") > 0, "member volume");
  return `member ${vol("member")}`;
});
test(59, "Show volume by scheme", "deterministic", () => {
  const v = E.volumeByScheme(os().requests, schemeStore.get().accruals);
  expect(v.length && v[0].total > 0, "scheme volume");
  return `${v.length} schemes; top ${v[0].schemeId} (${v[0].total})`;
});
test(60, "Show volume by scans", "deterministic", () => expect(vol("scan") === reqs("INT-ESEAL").length && vol("scan") > 0, "scan volume"));
test(61, "Show volume by redemption", "deterministic", () => expect(vol("redemption") === reqs("INT-RZP").length, "redemption volume"));
test(62, "Show volume by tickets", "deterministic", () => expect(vol("ticket") === reqs("INT-SIEBEL").length && vol("ticket") > 0, "ticket volume"));
test(63, "Display top failing integration", "deterministic", () => {
  const t = E.topFailing(os().integrations, os().requests, "failed");
  expect(t[0].rank === 1 && t.every((x, i) => i === 0 || t[i - 1].s.failed >= x.s.failed) && !t.some((x) => x.i.id === "INT-CHANNEL"), "ranking");
  return `${t[0].i.name} (${t[0].s.failed} failures)`;
});

/* ======================= Jobs and queues (64–71) ======================= */

const inv = () => os().jobs.find((j) => j.id === "JOB-SFDC-INV")!;
test(64, "Scheduled sync completed", "deterministic", () => {
  expect(inv().runs.filter((r) => r.status === "success").length > 15, "completed runs");
});
test(65, "Scheduled sync missed (retried once through the scheduler)", "deterministic", () => {
  const m = inv().runs.find((r) => r.status === "missed")!;
  expect(m && os().alerts.some((a) => a.type === "sync_missed"), "missed run / alert");
  no(O.retryJobRun(ANITA, m.id, "Retry"), "Client Admin job retry");
  no(O.retryJobRun(RAHUL, m.id, ""), "retry without reason");
  ok(O.retryJobRun(RAHUL, m.id, "Missed hourly run (test)"));
  no(O.retryJobRun(RAHUL, m.id, "Again"), "second retry of the same run");
  expect(inv().runs.some((r) => r.id === `${m.id}-RT1` && r.status === "success") && inv().runs.find((r) => r.id === m.id)!.status === "missed", "original run overwritten");
});
test(66, "Real-time callback delayed", "deterministic", () => {
  const cbj = os().jobs.find((j) => j.id === "JOB-SFDC-CB")!;
  expect(cbj.type === "callback_processing" && cbj.runs.some((r) => r.status === "delayed"), "delayed callback run");
});
test(67, "Queue backlog detected (aliases, no dead-letter assumption)", "governance", () => {
  expect(os().alerts.some((a) => a.type === "queue_backlog") && os().queues.every((q) => q.deadLetter === null && /alias/.test(q.alias)), "queue");
  expect(!("purgeQueue" in O) && !("deleteQueued" in O), "queue purge exposed");
});
test(68, "Failed job listed", "deterministic", () => {
  expect(os().jobs.flatMap((j) => j.runs).some((r) => r.status === "failed" && !!r.error), "failed job run");
});
const target = () => os().requests.find((r) => r.integrationId === "INT-MAPS" && r.status === "timeout")!;
let retried = "";
test(69, "Retry initiated through mock backend adapter", "governance", () => {
  const t = target();
  no(O.retryRequest(ANITA, t.id, "Retry"), "Client Admin retry");
  no(O.retryRequest(TANUJIT, t.id, "Retry"), "Super Admin retry");
  no(O.retryRequest(RAHUL, t.id, " "), "retry without reason");
  const n = os().requests.length;
  const r = O.retryRequest(RAHUL, t.id, "Maps timeout (test)");
  ok(r);
  retried = r.id!;
  const x = os().retries.find((y) => y.id === retried)!;
  expect(x.status === "completed" && os().requests.length === n + 1 && os().requests.find((y) => y.id === t.id)!.status === "timeout", "original changed or no new request");
  expect(audited("retry_initiated", t.id), "retry audit");
});
test(70, "Duplicate reprocessing prevented", "governance", () => {
  const n = os().requests.length;
  no(O.retryRequest(RAHUL, target().id, "Again"), "duplicate retry");
  expect(os().requests.length === n && os().retries.some((r) => r.status === "refused_duplicate" && r.targetId === target().id), "duplicate");
});
test(71, "Financial record not reprocessed without idempotency validation", "governance", () => {
  const f = os().requests.find((r) => r.financial && r.status === "failed")!;
  const n = os().requests.length;
  no(O.retryRequest(RAHUL, f.id, "Payout failed (test)"), "financial retry");
  expect(os().requests.length === n && os().retries.some((r) => r.status === "refused_financial" && r.targetId === f.id), "financial refusal not recorded");
  no(O.retryJobRun(RAHUL, os().jobs.find((j) => j.id === "JOB-RZP-RECON")!.runs[0].id, "Recon"), "finance reconciliation re-run");
});

/* ======================= System health (72–81) ======================= */

const svc = (id: string) => os().services.find((s) => s.id === id)!;
test(72, "API latency above target", "deterministic", () => {
  expect(Math.max(...svc("SVC-WALLET").series.map((p) => p.p95Ms)) > P95_TARGET_MS && os().alerts.some((a) => a.type === "high_latency"), "latency");
});
test(73, "API 5xx failure spike", "deterministic", () => {
  const s = svc("SVC-MEMBER");
  expect((s.errors.http_5xx ?? 0) > 0 && s.series[18].failures > s.series[17].failures && os().alerts.some((a) => a.type === "api_5xx"), "5xx");
});
test(74, "Dependency failure", "deterministic", () => expect((svc("SVC-COMMS").errors.dependency ?? 0) > 0, "dependency errors"));
test(75, "Database timeout", "deterministic", () => expect((svc("SVC-SCHEME").errors.database ?? 0) > 0 && os().alerts.some((a) => a.type === "db_error"), "database"));
test(76, "p95 response-time dashboard (targets not marked Passed)", "governance", () => {
  expect(E.p95([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 5000]) === 1900 && E.p95([]) === null, "p95");
  expect(os().services.every((s) => s.series.length === 24 && s.series.every((p) => p.p95Ms >= p.avgMs)), "series");
  expect(SOW_BASELINES.every((b) => !("status" in b)), "baseline must not carry a pass result");
});
test(77, "Application crash event", "deterministic", () => expect(os().crashes.some((c) => c.kind === "crash"), "crash"));
test(78, "Non-fatal error event", "deterministic", () => expect(os().crashes.some((c) => c.kind === "non_fatal"), "non-fatal"));
test(79, "Stack trace shown to authorised user only", "governance", () => {
  const c = os().crashes[0];
  no(O.viewStack(ANITA, c.id), "Client Admin stack trace");
  no(O.viewStack(TANUJIT, c.id), "Super Admin stack trace");
  const r = O.viewStack(RAHUL, c.id);
  ok(r);
  expect(!!r.stack && audited("stack_trace_viewed", c.id), "stack / audit");
});
test(80, "Affected app version identified", "deterministic", () => {
  const spike = os().alerts.find((a) => a.type === "crash_spike")!;
  expect(/4\.2\.0/.test(spike.service ?? "") && E.filterCrashes(os().crashes, { version: "4.2.0 (mock)" }).length >= 2, "version");
});
test(81, "Device model and OS filter works", "deterministic", () => {
  const c = os().crashes[0];
  const f = E.filterCrashes(os().crashes, { deviceModel: c.deviceModel, os: c.os });
  expect(f.length >= 1 && f.every((x) => x.deviceModel === c.deviceModel && x.os === c.os), "filter");
});

/* ======================= Financial monitoring (82–86) ======================= */

test(82, "Redemption float displayed from mock finance source", "governance", () => {
  no(O.floatView(RAHUL), "Evolve Ops float");
  const f = O.floatView(LAKSHMI);
  ok(f);
  expect(/not connected/.test(f.view!.source) && f.view!.snapshots.length === 14 && audited("float_viewed"), "float");
  expect(f.view!.projectedBurn === null && f.view!.timeToThreshold === null, "forecast invented");
});
test(83, "Low-balance alert triggered by configured development threshold", "blocked", () => {
  expect(!os().alerts.some((a) => a.type === "float_low") && os().float.lowThreshold === null, "alert without a threshold");
  no(O.setFloatThreshold(RAHUL, 9_000_000), "Evolve Ops threshold");
  no(O.setFloatThreshold(TANUJIT, 9_000_000), "Super Admin threshold");
  const r = O.setFloatThreshold(LAKSHMI, 9_000_000);
  ok(r);
  const a = os().alerts.find((x) => x.type === "float_low")!;
  expect(a && !!a.commId && os().float.thresholdStatus === "development_setting" && decision("OP-FLOAT").status === "open", "low balance");
});
test(84, "Burn-rate trend displayed", "deterministic", () => {
  const f = O.floatData(LAKSHMI).view!;
  const last7 = f.snapshots.slice(-7);
  expect(f.burnRate === Math.round(last7.reduce((n, s) => n + s.payouts, 0) / 7), "burn rate");
  expect(f.snapshots.every((s) => s.closing === s.opening + s.incoming - s.payouts), "float arithmetic");
});
test(85, "TDS Kitty remains separate from payout float", "governance", () => {
  const k = O.kittySummary(LAKSHMI).view!;
  const f = O.floatData(LAKSHMI).view!;
  expect(typeof k.tdsKitty === "number" && !("tdsKitty" in f) && !("total" in k), "combined balances");
});
test(86, "Available Member Points remain separate from payout float", "governance", () => {
  const k = O.kittySummary(LAKSHMI).view!;
  const f = O.floatData(LAKSHMI).view!;
  expect(Object.keys(k).sort().join() === "available,scheme,tdsKitty", "kitty summary must hold three separate figures, no total");
  expect(!("scheme" in f) && !("tdsKitty" in f) && f.available === f.snapshots[f.snapshots.length - 1].closing, "float mixed with points balances");
});

/* ======================= Member diagnostics and authentication (87–96) ======================= */

const authOk = () => os().auth.find((a) => a.result === "success")!;
test(87, "Member search (separate permission, reason recorded)", "governance", () => {
  const m = authOk().memberId;
  no(O.memberDiagnostic(ANITA, "member", m, "Ticket 1"), "Client Admin diagnostics");
  no(O.memberDiagnostic(TANUJIT, "member", m, "Ticket 1"), "Super Admin diagnostics");
  no(O.memberDiagnostic(RAHUL, "member", m, ""), "no reason");
  no(O.memberDiagnostic(SNEHA, "mobile", memberStore.get().members[0].mobile, "Ticket 2"), "mobile search without View sensitive");
  ok(O.memberDiagnostic(RAHUL, "member", m, "TCK-DEV-1001"));
  ok(O.memberDiagnostic(RAHUL, "mobile", memberStore.get().members.find((x) => x.id === m)!.mobile, "TCK-DEV-1002"));
  expect(os().audit.filter((a) => a.action === "diagnostic_accessed" && a.entity === m).length === 2, "access audit");
});
test(88, "Last login displayed", "deterministic", () => {
  const a = authOk();
  const v = O.memberDiagnostic(RAHUL, "member", a.memberId, "TCK-DEV-1003").view!;
  expect(v.lastLogin && v.lastLogin >= a.at, "last login");
});
test(89, "Recent API failures displayed", "deterministic", () => {
  const f = os().requests.find((r) => r.memberId && (r.status === "failed" || r.status === "timeout"))!;
  expect(O.memberDiagnostic(RAHUL, "member", f.memberId!, "TCK-DEV-1004").view!.apiFailures.some((x) => x.ref === f.id), "API failure");
});
test(90, "Device / IMEI history displayed", "deterministic", () => {
  const d = riskStore.get().devices.find((x) => x.associations.length)!;
  const v = O.memberDiagnostic(RAHUL, "member", d.associations[0].memberId, "TCK-DEV-1005").view!;
  expect(v.devices.some((x) => x.id === d.id), "device history");
});
const auth = () => O.authEvents(RAHUL).rows!;
test(91, "Successful login event", "deterministic", () => expect(auth().some((a) => a.result === "success"), "success"));
test(92, "Failed login event", "deterministic", () => expect(auth().some((a) => a.result === "failure"), "failure"));
test(93, "Wrong MPIN failure (outcome only)", "governance", () => {
  const w = auth().filter((a) => a.reason === "wrong_mpin");
  expect(w.length >= 3 && w.every((a) => !Object.keys(a).some((k) => /mpin|pin|password/i.test(k))), "MPIN captured");
});
test(94, "Blocked member login failure", "deterministic", () => expect(auth().some((a) => a.reason === "blocked_user"), "blocked user"));
test(95, "Blacklisted device login failure", "deterministic", () => expect(auth().some((a) => a.reason === "device_blacklisted" && a.deviceStatus === "blocked"), "blacklisted device"));
test(96, "Authentication filtering by member type, branch, app version, device and OS", "deterministic", () => {
  const a = auth()[0];
  const f = E.filterAuth(auth(), { programme: a.programme, branch: a.branchCode, appVersion: a.appVersion, deviceModel: a.deviceModel, os: a.os });
  expect(f.length >= 1 && f.every((x) => x.programme === a.programme && x.branchCode === a.branchCode && x.appVersion === a.appVersion && x.deviceModel === a.deviceModel && x.os === a.os), "filter");
  no(O.authEvents(VIKRAM), "Sales Rep authentication audit");
});

/* ======================= Adoption (97–101) ======================= */

const ad = () => O.adoptionRows(RAHUL);
test(97, "Enrolled but never logged in", "deterministic", () => {
  expect(ad().some((r) => r.status === "never_logged_in") && ad().every((r) => !["pending", "rejected"].includes(r.member.status)), "never logged in");
});
test(98, "Dormant member (only once X is set)", "blocked", () => {
  expect(os().config.dormancyDays === null && !ad().some((r) => r.status === "dormant" || r.status === "active"), "dormancy invented");
  ok(O.setDormancy(RAHUL, 3));
  expect(ad().some((r) => r.status === "dormant"), "no dormant member at 3 days");
  expect(decision("OP-DORM").status === "open" && os().config.dormancyStatus === "development_setting", "OP-DORM");
});
test(99, "X-day threshold configurable", "governance", () => {
  no(O.setDormancy(ANITA, 10), "Client Admin threshold");
  no(O.setDormancy(RAHUL, -2), "negative X");
  const d3 = ad().filter((r) => r.status === "dormant").length;
  ok(O.setDormancy(RAHUL, 1000));
  const d1000 = ad().filter((r) => r.status === "dormant").length;
  expect(d1000 < d3 && audited("dormancy_threshold_changed"), "threshold change");
  ok(O.setDormancy(RAHUL, null));
  expect(os().config.dormancyStatus === "business_confirmation_required", "clear");
  return `dormant at 3 days: ${d3}; at 1000 days: ${d1000}`;
});
test(100, "Telecalling / SR drill-down by branch", "deterministic", () => {
  const follow = ad().filter((r) => r.status === "never_logged_in");
  const b = follow[0].member.branchCode;
  const rows = follow.filter((r) => r.member.branchCode === b);
  expect(rows.length >= 1 && rows.every((r) => r.member.branchCode === b), "drill-down");
  const ka = O.adoptionRows("USR-2004");
  expect(ka.every((r) => r.member.branchCode.startsWith("KA-")) && ka.length < ad().length, "regional scope");
});
test(101, "Adoption export", "governance", () => {
  no(O.exportAdoption(VIKRAM, 5), "Sales Rep export");
  ok(O.exportAdoption(RAHUL, ad().length));
  expect(audited("adoption_exported"), "export audit");
});

/* ======================= Infrastructure and incidents (102–114) ======================= */

const metric = (k: string) => os().metrics.find((m) => m.key === k);
test(102, "CPU metrics displayed", "deterministic", () => expect(metric("cpu")!.points.length >= 24, "cpu"));
test(103, "Memory metrics displayed", "deterministic", () => expect(metric("memory")!.points.length >= 24, "memory"));
test(104, "Disk metrics displayed", "deterministic", () => expect(metric("disk")!.points.length >= 24, "disk"));
test(105, "Network I/O displayed", "deterministic", () => expect(metric("net_in") && metric("net_out"), "network"));
test(106, "DB connection pool displayed", "deterministic", () => expect(metric("db_pool")!.points.length, "db pool"));
test(107, "Queue lag displayed", "deterministic", () => expect(metric("queue_lag")!.points.length && os().queues.every((q) => q.lagSeconds >= 0), "queue lag"));
test(108, "Autoscaling event displayed", "deterministic", () => expect(os().autoscaling.some((a) => a.action === "scale_out" && /CPU/.test(a.reason)), "autoscaling"));
const inc1 = () => os().incidents.find((i) => i.id === "INC-0001")!;
test(109, "Infrastructure correlation view", "deterministic", () => {
  const c = E.correlationAt(os().metrics, inc1().window.to, 2);
  expect(c.length === os().metrics.length && c.some((x) => x.change != null), "correlation");
});
test(110, "Deployment, configuration and schema changes shown in incident snapshot", "deterministic", () => {
  const s = O.incidentSnapshot(inc1().window.from, inc1().window.to);
  expect(s.deployments.length >= 1 && !s.missingDeployment, "deployment");
  const all = O.incidentSnapshot(E.hoursBefore(NOW, 24), NOW);
  expect(all.schema.length >= 1, "schema");
  const recent = O.incidentSnapshot(E.hoursBefore(NOW, 1), NOW);
  expect(recent.config.some((c) => /OP-FLOAT|OP-DORM|invitationTargetFrequency|INT-SFDC/.test(c.parameter)), "configuration change from module audits");
});
test(111, "Vendor outage displayed", "deterministic", () => expect(O.incidentSnapshot(E.hoursBefore(NOW, 2), NOW).vendors.some((v) => /WhatsApp/.test(v.title)), "vendor outage"));
test(112, "Active feature flag change displayed", "deterministic", () => {
  const f = O.incidentSnapshot(inc1().window.from, inc1().window.to).flags;
  expect(f.length && f[0].before === "false" && f[0].after === "true", "flag change");
});
let inc = "";
test(113, "Incident created and assigned", "governance", () => {
  no(O.createIncident(ANITA, { title: "x", from: E.hoursBefore(NOW, 1), to: NOW, services: [] }), "Client Admin incident");
  no(O.createIncident(RAHUL, { title: "Bad window", from: NOW, to: E.hoursBefore(NOW, 1), services: [] }), "inverted window");
  const alert = os().alerts.find((a) => a.type === "bot_notification_failed")!;
  const r = O.createIncident(RAHUL, { title: "WhatsApp delivery failures (test)", from: E.hoursBefore(NOW, 2), to: NOW, services: ["Communication API"], alertIds: [alert.id] });
  ok(r);
  inc = r.id!;
  ok(O.assignIncident(RAHUL, inc, RAHUL));
  ok(O.linkToIncident(RAHUL, inc, "changes", "CHG-VEN-01"));
  const i = os().incidents.find((x) => x.id === inc)!;
  expect(i.status === "assigned" && i.owner === RAHUL && os().alerts.find((a) => a.id === alert.id)!.incidentId === inc && i.changes.includes("CHG-VEN-01"), "incident");
  ok(O.updateAlert(RAHUL, alert.id, "acknowledged", "Linked to incident"));
});
test(114, "Incident resolved with history", "governance", () => {
  ok(O.setIncidentStatus(RAHUL, inc, "investigating", "Provider errors"));
  ok(O.addIncidentNote(RAHUL, inc, "Provider status page shows degradation (test)"));
  no(O.setIncidentStatus(RAHUL, inc, "resolved", ""), "resolve without resolution");
  ok(O.setIncidentStatus(RAHUL, inc, "resolved", "Provider recovered; no portal change"));
  ok(O.setIncidentStatus(RAHUL, inc, "closed", "Closed after monitoring"));
  const i = os().incidents.find((x) => x.id === inc)!;
  expect(i.status === "closed" && i.resolvedAt && i.history.map((h) => h.status).join(">") === "open>assigned>investigating>resolved>closed" && i.notes.length === 1, "history");
  no(O.addIncidentNote(RAHUL, inc, "after close"), "note on closed incident");
  const ids = os().audit.map((a) => a.id);
  expect(new Set(ids).size === ids.length && !("commit" in O) && !("setState" in O), "audit integrity / raw write path");
  return i.history.map((h) => h.status).join(" → ");
});

/* ---------------- Report ---------------- */
void mem;
results.sort((a, b) => a.n - b.n);
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (pass !== results.length) process.exit(1);
