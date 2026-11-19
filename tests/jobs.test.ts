/**
 * Phase 14 — PROPOSED Module 12: Job Management & Field Tooling (Build Prompt 14, section 23,
 * scenarios 1–67).
 *   npm run test:jobs
 * Runs the real proposed-scope store against the access engine, Member Management, wallet, schemes
 * and comms stores in Node. All data is labelled demo data. The suite asserts that nothing goes live:
 * no real job allocation, no points credited, no customer message, and Super Admin-only access.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { accessStore } from "@/features/access/store";
import { hasPermission } from "@/features/access/engine";
import { memberStore } from "@/features/members/store";
import { walletStore } from "@/features/wallet/store";
import { schemeStore } from "@/features/schemes/store";
import { commsStore } from "@/features/comms/store";
import { memberBalances } from "@/features/wallet/engine";
import * as J from "@/features/jobs/store";
import { CAPABILITY_ASSESSMENT, DIRECT_ORDER_ASSESSMENT, FEATURE_GATES, MODULE12_DECISIONS, SALES_EXEC_ASSESSMENT, SCHEME_COMPATIBILITY } from "@/config/jobsCatalogue";
import { NAVIGATION } from "@/config/navigation";
import type { SiebelJobPayload } from "@/types/jobs";

const TANUJIT = "USR-1001", RAHUL = "USR-1003", SNEHA = "USR-1004", ANITA = "USR-2001", LAKSHMI = "USR-2003", KA_ADMIN = "USR-2004", VIKRAM = "USR-2006";
const js = () => J.jobsStore.get();
const mem = () => memberStore.get();
const START = { wallet: walletStore.get(), scheme: schemeStore.get(), comms: commsStore.get(), members: memberStore.get() };

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
const no = (r: { ok: boolean; errors: string[] }, what: string, match?: RegExp) => {
  expect(!r.ok, `${what} was allowed`);
  if (match) expect(r.errors.some((e) => match.test(e)), `${what}: unexpected reason ${r.errors.join("; ")}`);
};
const src = (p: string) => readFileSync(p, "utf8");
const job = (id: string) => js().jobs.find((j) => j.id === id)!;
const sub = (jobId: string) => js().submissions.filter((s) => s.jobId === jobId).slice(-1)[0];

const techs = J.technicians();
const tech = techs[0];
const payload = (ref: string, t = tech): SiebelJobPayload => ({ siebelJobRef: ref, jobType: "installation", customer: { ref: `CUST-T-${ref}`, name: `Demo Customer ${ref}`, contactRef: `CNT-T-${ref}99` }, address: { line: "Demo test address", pincode: t.addresses.working?.pincode ?? null, district: t.addresses.working?.district ?? null, state: t.addresses.working?.state ?? null }, product: { skuRef: null, name: "Demo product", categoryId: null }, warrantyRef: null, priority: null, branchCode: t.branchCode, extensions: {} });
/** Drives a fresh demo job to the given stage through the real functions. */
function drive(ref: string, upTo: "assigned" | "accepted" | "started" | "submitted") {
  const id = J.receiveSiebelJob(TANUJIT, payload(ref)).id!;
  ok(J.createDemoAssignment(TANUJIT, id, tech.id), `assign ${ref}`);
  if (upTo === "assigned") return id;
  ok(J.simulateTechnicianResponse(TANUJIT, id, "accepted"));
  if (upTo === "accepted") return id;
  ok(J.recordJobStart(TANUJIT, id, { selfieRef: `SELFIE-${ref}`, gps: { lat: 13.08, lng: 80.27 } }));
  if (upTo === "started") return id;
  ok(J.submitCompletion(TANUJIT, id, [{ ref: `PHOTO-${ref}`, category: "Installed product" }]));
  return id;
}

/* ======================= Job management (1–18) ======================= */

let A = "";
test(1, "Mock Siebel job received", "deterministic", () => {
  const r = J.receiveSiebelJob(TANUJIT, payload("SBL-T-0001"));
  ok(r);
  A = r.id!;
  expect(job(A).status === "pending_allocation" && job(A).demo, "job not pending allocation");
  return A;
});
test(2, "Job reference recorded", "deterministic", () => {
  expect(job(A).siebelJobRef === "SBL-T-0001" && job(A).timeline[0].ref === "SBL-T-0001", "reference");
});
test(3, "Duplicate job rejected or identified", "deterministic", () => {
  const n = js().jobs.length;
  const r = J.receiveSiebelJob(TANUJIT, payload("SBL-T-0001"));
  no(r, "duplicate job", /Duplicate/);
  expect(r.id === A && js().jobs.length === n && js().inbound.some((m) => m.siebelJobRef === "SBL-T-0001" && m.result === "duplicate"), "duplicate created or not identified");
  expect(js().exceptions.some((x) => x.kind === "duplicate_inbound" && x.ref === "SBL-T-0001"), "no exception");
});
test(4, "Job appears in Incoming Jobs", "deterministic", () => {
  expect(js().inbound.some((m) => m.jobId === A && m.result === "accepted"), "not in incoming");
});
test(5, "Job details displayed", "deterministic", () => {
  const c = J.customerView(TANUJIT, job(A));
  expect(c.ref === "CUST-T-SBL-T-0001" && /masked/.test(c.name) && c.contact.startsWith("••••") && /Masked/.test(c.address), "customer details not masked");
  const inc = js().jobs.find((j) => j.issues.length)!;
  expect(inc.status === "received" && J.customerView(TANUJIT, inc).name === "Not supplied", "missing data invented");
  return `Incomplete job ${inc.id}: ${inc.issues.join(", ")}`;
});
test(6, "Job allocation candidates previewed", "deterministic", () => {
  const c = J.allocationCandidates(A);
  expect(c.length === techs.length && c.some((x) => x.territory === "yes") && c.every((x) => x.eligibility === "pending_rule"), "candidates");
  expect(c.every((x) => !("score" in x)), "a score was calculated");
});
test(7, "Demo technician assignment created", "deterministic", () => {
  const out = J.allocationCandidates(A).find((x) => x.territory === "no");
  if (out) no(J.createDemoAssignment(TANUJIT, A, out.technicianId), "out-of-territory assignment", /territory/);
  const r = J.createDemoAssignment(TANUJIT, A, tech.id);
  ok(r);
  const a = js().assignments.find((x) => x.id === r.id)!;
  expect(a.notification === "not_sent_demo" && a.mode === "manual_demo", "notification sent");
  no(J.createDemoAssignment(TANUJIT, A, tech.id), "duplicate assignment");
});
test(8, "Job acceptance simulated", "deterministic", () => {
  ok(J.simulateTechnicianResponse(TANUJIT, A, "accepted"));
  expect(job(A).status === "accepted", "not accepted");
});
test(9, "Job start evidence represented", "deterministic", () => {
  no(J.recordJobStart(TANUJIT, A, { selfieRef: "SELFIE-A", gps: null }), "start without GPS", /GPS unavailable/);
  no(J.recordJobStart(TANUJIT, A, { selfieRef: "", gps: { lat: 13, lng: 80 } }), "start without selfie", /Selfie/);
  ok(J.recordJobStart(TANUJIT, A, { selfieRef: "SELFIE-A", gps: { lat: 13.08, lng: 80.27 } }));
  expect(job(A).start?.selfieRef === "SELFIE-A" && job(A).start?.locationStatus === "not_validated", "start evidence");
});
test(10, "Completion photographs represented", "deterministic", () => {
  no(J.submitCompletion(TANUJIT, A, []), "completion without photos", /evidence missing/);
  ok(J.submitCompletion(TANUJIT, A, [{ ref: "PHOTO-A-1", category: "Installed product" }, { ref: "PHOTO-A-2", category: "Site" }]));
  expect(job(A).photos.length === 2 && job(A).photos.every((p) => p.capture === "source_unconfirmed"), "photos");
});
test(11, "Completion submitted to mock Siebel adapter", "deterministic", () => {
  const s = sub(A);
  expect(s.result === "pending" && s.payload.photoRefs.length === 2 && s.payload.startEvidenceRef === "SELFIE-A" && job(A).status === "awaiting_siebel", "submission");
  no(J.submitCompletion(TANUJIT, A, [{ ref: "PHOTO-A-3", category: "x" }]), "duplicate completion submission", /already submitted/);
  expect(js().submissions.filter((x) => x.jobId === A).length === 1, "duplicate submission sent");
});
test(13, "Reward becomes eligible only after confirmation", "deterministic", () => {
  expect(js().rewards.find((r) => r.jobId === A)?.status === "pending" && job(A).reward === "pending", "reward not pending before confirmation");
  no(J.simulateRewardProcessing(TANUJIT, A), "reward before confirmation", /not confirmed/);
  ok(J.siebelCallback(TANUJIT, { requestRef: sub(A).id, result: "confirmed", confirmationRef: "SBL-CNF-A" }));
  expect(js().rewards.find((r) => r.jobId === A)?.status === "eligible", "not eligible after confirmation");
});
test(12, "Siebel confirms completion", "deterministic", () => {
  expect(job(A).status === "confirmed" && job(A).siebel === "confirmed" && sub(A).confirmationRef === "SBL-CNF-A", "confirmation");
});
let B = "";
test(14, "Siebel rejects completion", "deterministic", () => {
  B = drive("SBL-T-0002", "submitted");
  ok(J.siebelCallback(TANUJIT, { requestRef: sub(B).id, result: "rejected", rejectionReason: "Demo: unit not visible" }));
  expect(job(B).status === "rejected" && sub(B).rejectionReason === "Demo: unit not visible", "rejection");
});
test(15, "Reward remains uncredited", "deterministic", () => {
  expect(js().rewards.find((r) => r.jobId === B)?.status === "not_eligible" && job(B).photos.length === 1 && job(B).start, "reward or evidence");
  no(J.simulateRewardProcessing(TANUJIT, B), "reward after rejection");
  no(J.overrideSiebelResult(TANUJIT, B), "manual confirmation of a rejected job", /Only Siebel/);
});
let C = "";
test(16, "Siebel does not respond", "deterministic", () => {
  C = drive("SBL-T-0003", "submitted");
  ok(J.recordSiebelTimeout(TANUJIT, sub(C).id));
  expect(sub(C).result === "timeout" && sub(C).retry === "awaiting_manual_resolution" && js().exceptions.some((x) => x.kind === "timeout" && x.jobId === C), "timeout handling");
});
test(17, "Job remains awaiting confirmation", "deterministic", () => {
  expect(job(C).status === "awaiting_siebel" && job(C).reward === "pending", `status ${job(C).status}`);
  no(J.overrideSiebelResult(TANUJIT, C), "manual confirmation of a pending job");
  const t = J.jobTrace(C);
  expect(t.inbound.length === 1 && t.submissions.length === 1 && t.exceptions.length === 1, "job not traceable");
});
test(18, "Duplicate callback does not create duplicate reward", "deterministic", () => {
  const n = js().rewards.length;
  const r = J.siebelCallback(TANUJIT, { requestRef: sub(A).id, result: "confirmed", confirmationRef: "SBL-CNF-A" });
  expect(r.ok && r.warnings.some((w) => /Duplicate/.test(w)) && js().callbacks.slice(-1)[0].outcome === "duplicate_ignored", "duplicate callback applied");
  expect(js().rewards.length === n && js().rewards.filter((x) => x.jobId === A).length === 1, "second reward created");
});

/* ======================= Allocation (19–24) ======================= */

let D = "";
const cand = () => J.allocationCandidates(D).find((c) => c.technicianId === tech.id)!;
test(19, "Territory comparison displayed", "deterministic", () => {
  D = J.receiveSiebelJob(TANUJIT, payload("SBL-T-0004")).id!;
  expect(cand().territory === "yes" && J.allocationCandidates(D).some((c) => c.territory !== "yes"), "territory");
});
test(20, "Skill comparison displayed", "deterministic", () => { expect(J.allocationCandidates(D).every((c) => c.skill === "unknown"), "skill invented"); });
test(21, "Verified flag comparison displayed", "deterministic", () => {
  expect(cand().verified === "no", "verified before flag");
  ok(J.grantVerificationFlag(TANUJIT, tech.id, { reason: "Demo", effectiveFrom: "2026-12-01" }));
  expect(cand().verified === "yes", "flag not reflected");
});
test(22, "Workload comparison displayed", "deterministic", () => {
  const w = cand().workload;
  expect(Number.isInteger(w) && w === js().jobs.filter((j) => j.technicianId === tech.id && ["assigned", "accepted", "in_progress", "completion_submitted", "awaiting_siebel"].includes(j.status)).length, "workload");
  return `${tech.id}: ${w} active demo job(s)`;
});
test(23, "Multiple-technician rules remain inactive", "blocked", () => {
  expect(J.decisionOf("OP-53").status === "open" && !Object.keys(J).some((k) => /auto.?allocat|multi/i.test(k)), "automatic or multi allocation exists");
  no(J.activateFeature(TANUJIT, "FG-ALLOC"), "allocation activation", /OP-53/);
});
test(24, "No-acceptance workflow remains unresolved", "blocked", () => {
  ok(J.createDemoAssignment(TANUJIT, D, tech.id));
  const r = J.simulateTechnicianResponse(TANUJIT, D, "no_response");
  expect(r.ok && r.warnings.some((w) => /OP-53/.test(w)) && job(D).status === "pending_allocation" && !job(D).technicianId, "no-acceptance handling invented");
});

/* ======================= Rewards (25–29) ======================= */

test(25, "Job reward configuration draft created", "deterministic", () => {
  no(J.createRewardConfigDraft(TANUJIT, { jobType: "service", points: 0, effectiveFrom: "2026-12-01" }), "zero points");
  const r = J.createRewardConfigDraft(TANUJIT, { jobType: "service", points: 40, effectiveFrom: "2026-12-01", territory: tech.branchCode });
  ok(r);
  expect(js().rewardConfigs.find((c) => c.id === r.id)?.status === "draft", "not draft");
  no(J.activateRewardConfig(TANUJIT, r.id!), "reward activation", /OP-56/);
});
test(26, "Existing Scheme Engine compatibility assessed", "governance", () => {
  expect(/kind: "scan" \| "sales_return"/.test(src("src/types/schemes.ts")), "scheme earning events changed: reassess");
  expect(SCHEME_COMPATIBILITY.find((x) => x.aspect === "Earning event")?.fit === "no" && SCHEME_COMPATIBILITY.some((x) => x.fit === "yes"), "assessment");
  expect(!/class .*Incentive|function .*evaluateScheme/.test(src("src/features/jobs/store.ts")), "second incentive engine");
});
test(27, "Job reward is not posted before Siebel confirmation", "blocked", () => {
  no(J.simulateRewardProcessing(TANUJIT, C), "reward while awaiting Siebel", /not confirmed/);
  no(J.creditJobReward(TANUJIT, A), "production credit", /disabled/);
  expect(walletStore.get() === START.wallet, "wallet store changed");
});
test(28, "Reward uses the existing Wallet/Ledger service in simulated mode", "deterministic", () => {
  const before = memberBalances(walletStore.get(), schemeStore.get(), mem(), tech.id).available;
  const r = J.simulateRewardProcessing(TANUJIT, A);
  ok(r);
  expect(r.warnings.some((w) => /Simulation/.test(w)) && memberBalances(walletStore.get(), schemeStore.get(), mem(), tech.id).available === before && walletStore.get() === START.wallet, "ledger changed");
  no(J.simulateRewardProcessing(TANUJIT, A), "second processing");
});
test(29, "Wallet reference is preserved", "deterministic", () => {
  const r = js().rewards.find((x) => x.jobId === A)!;
  expect(r.simulatedLedgerRef === `SIM-LED-${A}` && r.walletRef === `WAL-${tech.id}` && r.siebelConfirmationRef === "SBL-CNF-A" && job(A).timeline.some((e) => e.ref === r.simulatedLedgerRef), "references");
});

/* ======================= Verified technician (30–33) ======================= */

const t2 = techs[1];
test(30, "Verification record created in demo mode", "deterministic", () => {
  const f = js().flags.find((x) => x.technicianId === tech.id)!;
  expect(f.status === "demo_granted" && f.approval === "pending_op58", "flag");
  no(J.grantVerificationFlag(TANUJIT, J.electricians()[0].id, { reason: "x", effectiveFrom: "2026-12-01" }), "flag on a non-technician");
});
test(31, "Grant/revoke workflow previewed", "deterministic", () => {
  no(J.grantVerificationFlag(RAHUL, t2.id, { reason: "x", effectiveFrom: "2026-12-01" }), "Evolve Ops grant");
  const f = js().flags.find((x) => x.technicianId === tech.id)!;
  ok(J.revokeVerificationFlag(TANUJIT, f.id, "Demo revoke"));
  expect(js().flags.find((x) => x.id === f.id)!.history.length === 2, "history");
});
test(32, "Expiry configuration supported", "deterministic", () => {
  no(J.grantVerificationFlag(TANUJIT, t2.id, { reason: "x", effectiveFrom: "2026-12-01", expiresOn: "2026-11-01" }), "expiry before start");
  ok(J.grantVerificationFlag(TANUJIT, t2.id, { reason: "Demo", effectiveFrom: "2026-12-01", expiresOn: "2027-11-30" }));
  expect(js().flags.find((x) => x.technicianId === t2.id)?.expiresOn === "2027-11-30", "expiry");
});
test(33, "Benefits remain inactive pending OP-58", "blocked", () => {
  expect(J.FLAG_CAPABILITIES.every((c) => c.active === false) && J.decisionOf("OP-58").status === "open", "benefits");
  no(J.activateFeature(TANUJIT, "FG-VERIFY"), "benefit activation");
});

/* ======================= Happy Points (34–38) ======================= */

let link = "";
test(34, "Feedback microsite preview displayed", "governance", () => {
  expect(J.HAPPY_CONFIG.fields.some((f) => f.key === "rating") && /Preview only/.test(J.HAPPY_CONFIG.microsite), "preview config");
  expect(src("src/pages/jobs/TechnicianPages.tsx").includes("happy-preview"), "preview missing");
});
test(35, "Feedback submission simulated", "deterministic", () => {
  no(J.createFeedbackLink(TANUJIT, C), "link for an unconfirmed job");
  const l = J.createFeedbackLink(TANUJIT, A);
  ok(l);
  link = l.id!;
  ok(J.simulateFeedback(TANUJIT, link, 4, "Neat work (demo)"));
  no(J.simulateFeedback(TANUJIT, link, 5, "again"), "second submission");
});
test(36, "Feedback linked to Job and Technician", "deterministic", () => {
  const f = js().feedback.find((x) => x.linkId === link)!;
  expect(f.jobId === A && f.technicianId === tech.id && f.simulated, "linkage");
});
test(37, "No points awarded without approved conversion rule", "blocked", () => {
  expect(js().feedback.every((f) => f.happyPoints === "pending_decision") && J.HAPPY_CONFIG.conversion === null && walletStore.get() === START.wallet, "points awarded");
});
test(38, "Customer messaging remains disabled", "blocked", () => {
  no(J.sendFeedbackLink(TANUJIT, link), "send feedback link", /disabled/);
  expect(js().feedbackLinks.every((l) => l.delivery === "not_sent_disabled") && commsStore.get() === START.comms, "message sent");
});

/* ======================= E-ID card (39–42) ======================= */

test(39, "E-ID card preview displayed", "deterministic", () => {
  const c = J.previewEidCard(tech.id)!;
  expect(c.name === tech.name && c.technicianId === tech.id && c.branding === "V-Guard", "preview");
  expect(J.previewEidCard(J.electricians()[0].id) === null, "card for a non-technician");
});
test(40, "Customer consent fields represented", "governance", () => {
  J.deliverEidCard(TANUJIT, A);
  const d = js().eidDeliveries.slice(-1)[0];
  expect(d && d.consent.status === "not_captured" && "purpose" in d.consent && "recordRef" in d.consent && "withdrawn" in d.consent, "consent fields");
});
test(41, "Message delivery remains disabled", "blocked", () => {
  no(J.deliverEidCard(TANUJIT, A), "E-ID delivery", /OP-59/);
  expect(js().eidDeliveries.every((d) => d.outcome === "blocked"), "delivered");
});
test(42, "No unapproved personal information is exposed", "deterministic", () => {
  const s = JSON.stringify(J.previewEidCard(tech.id));
  expect(!s.includes(tech.mobile) && !(tech.addresses.home && s.includes(tech.addresses.home.line)) && !(tech.addresses.working && s.includes(tech.addresses.working.pincode)), "PII in card");
  expect(/reference only/.test(J.previewEidCard(tech.id)!.photo), "photo exposed");
});

/* ======================= Direct Order (43–47) ======================= */

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const EXEMPT = /jobsCatalogue|platformCatalogue|analyticsCatalogue|[\\/]jobs[\\/]/;
test(43, "Existing implementation inspected", "governance", () => {
  const hits = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !EXEMPT.test(f) && /direct.?order|direct fulfil/i.test(readFileSync(f, "utf8").replace(/DirectOrderPage|direct-order/g, "")));
  expect(!hits.length, `Direct Order code found outside the assessment: ${hits.join(", ")} — update the assessment`);
  expect(/no implementation in this repository/.test(DIRECT_ORDER_ASSESSMENT.repositorySearch), "assessment text");
});
test(44, "Existing APIs and components inventoried", "governance", () => {
  expect(CAPABILITY_ASSESSMENT.length === 10 && CAPABILITY_ASSESSMENT.every((c) => c.route && c.component && c.service && c.dataModel && c.apiContract && c.tests && c.missing && c.enhancement), "inventory incomplete");
  expect(CAPABILITY_ASSESSMENT.find((c) => c.id === "CA-08")!.rebuild === "Not determinable" && CAPABILITY_ASSESSMENT.filter((c) => c.rebuild === "Yes").length === 0, "rebuild flags");
});
test(45, "Missing functionality identified", "governance", () => { expect(DIRECT_ORDER_ASSESSMENT.stepsMissing.length > 0 && /Not determinable/.test(DIRECT_ORDER_ASSESSMENT.readiness), "gaps"); });
test(46, "No duplicate Direct Order implementation created", "governance", () => {
  expect(!Object.keys(J).some((k) => /direct/i.test(k)) && FEATURE_GATES.find((g) => g.id === "FG-DO")!.prototype === "Assessment only", "Direct Order implemented");
});
test(47, "OP-63 remains visible", "governance", () => { expect(J.decisionOf("OP-63").status === "open" && src("src/pages/jobs/FieldPages.tsx").includes('DecisionLink id="OP-63"'), "OP-63"); });

/* ======================= Electrician tooling (48–55) ======================= */

const ep = J.electricians().find((m) => m.addresses.working && typeof m.addresses.working.lat === "number")!;
test(48, "Quotation prototype created", "deterministic", () => {
  const r = J.createQuotationDraft(TANUJIT, { electricianId: ep.id, customerRef: "CUST-Q-1", description: "Fan installation, two rooms (demo)" });
  ok(r);
  expect(js().quotations.find((q) => q.id === r.id)?.status === "draft", "quotation");
});
test(49, "Quotation field requirements remain unresolved", "blocked", () => {
  no(J.createQuotationDraft(TANUJIT, { electricianId: ep.id, customerRef: "C", description: "d", price: 1200, gst: 18 }), "financial fields", /OP-29/);
  no(J.issueQuotation(TANUJIT, js().quotations[0].id), "issue quotation", /OP-29/);
  expect(js().quotations.every((q) => q.format === "pending_op29" && q.shared === "not_shared"), "format decided");
});
const withCoords = J.retailers().find((r) => r.addresses.working && typeof r.addresses.working.lat === "number");
const noCoords = J.retailers().find((r) => !r.addresses.working || typeof r.addresses.working.lat !== "number");
test(50, "Retailer tagging configuration displayed", "deterministic", () => {
  ok(J.createRetailerTag(TANUJIT, ep.id, (withCoords ?? J.retailers()[0]).id, "pincode"));
  no(J.createRetailerTag(TANUJIT, ep.id, (withCoords ?? J.retailers()[0]).id, "pincode"), "duplicate tag");
  if (noCoords) J.createRetailerTag(TANUJIT, ep.id, noCoords.id, "address");
});
test(51, "Radius configuration remains inactive", "blocked", () => {
  expect(MODULE12_DECISIONS && js().radius.radiusKm === null, "default radius invented");
  ok(J.saveRadiusDraft(TANUJIT, 5));
  expect(js().radius.status === "inactive", "radius active");
  no(J.activateFeature(TANUJIT, "FG-TAG"), "tagging activation");
});
test(52, "Retailer proximity preview uses only valid location data", "deterministic", () => {
  const p = J.retailerProximity(ep.id);
  expect(p.rows.length >= 1 && p.rows.every((r) => (r.distanceKm == null) === !/Calculated/.test(r.note)), "distance without coordinates");
  if (noCoords) expect(p.rows.find((r) => r.retailerId === noCoords.id)?.distanceKm === null, "distance for missing coordinates");
  return p.rows.map((r) => `${r.retailerId}: ${r.distanceKm ?? "not calculable"}`).join("; ");
});
test(53, "Retailer visit survey remains blocked until tagging/trigger decisions are confirmed", "blocked", () => {
  ok(J.saveVisitSurveyRule(TANUJIT, { triggerDistanceM: null }));
  expect(js().surveyRules.every((r) => r.status === "inactive"), "rule active");
  no(J.triggerVisitSurvey(TANUJIT, ep.id, js().tags[0].retailerId), "visit survey", /OP-27/);
});
test(54, "Work location history is preserved", "deterministic", () => {
  const before = JSON.stringify(ep.addresses.working);
  const r = J.recordWorkLocationChange(TANUJIT, ep.id, "Shop 9, New Market Road (demo)", "Moved site");
  ok(r);
  const c = js().workLocations.find((x) => x.id === r.id)!;
  expect(c.from && c.to.includes("New Market") && c.status === "recorded_pending_policy", "history");
  expect(JSON.stringify(mem().members.find((m) => m.id === ep.id)!.addresses.working) === before, "member location changed");
});
test(55, "Work location changes do not silently change geo-scheme eligibility", "deterministic", () => {
  expect(schemeStore.get() === START.scheme && memberStore.get() === START.members, "schemes or members changed");
  expect(/not recalculated/.test(J.workLocationImpact(ep.id).geoSchemes), "impact preview");
});

/* ======================= Sales Executive (56–60) ======================= */

const w = J.salesExecWorkspace(TANUJIT, VIKRAM);
test(56, "Existing portal capabilities reviewed", "governance", () => { expect(SALES_EXEC_ASSESSMENT.length >= 5 && CAPABILITY_ASSESSMENT.some((c) => c.id === "CA-10" && c.rebuild === "No"), "review"); });
test(57, "Member performance reuses existing analytics", "deterministic", () => {
  expect(w.ok && w.rows.length > 0, "workspace empty");
  expect(w.rows.every((r) => r.available === memberBalances(walletStore.get(), schemeStore.get(), mem(), r.memberId).available), "values not from the wallet service");
});
test(58, "View-As is reused", "governance", () => { expect(src("src/pages/jobs/FieldPages.tsx").includes("/governance/platform/view-as?member=") && hasPermission(accessStore.get(), VIKRAM, "view-as", "view").allowed, "View-As not reused"); });
test(59, "Out-of-branch access remains blocked", "deterministic", () => {
  const ka = mem().members.find((m) => m.branchCode.startsWith("KA-"))!;
  expect(!J.salesExecCanSee(VIKRAM, ka.id) && w.rows.every((r) => mem().members.find((m) => m.id === r.memberId)!.branchCode === "TN-BR-CHENNAI-NORTH"), "out-of-branch member visible");
});
test(60, "Separate Sales Executive application is not created without approval", "governance", () => {
  expect(!walk("src").some((f) => /sales-?exec.*app|pwa|service-?worker/i.test(f)) && FEATURE_GATES.find((g) => g.id === "FG-SALESEXEC")!.productionActive === false, "separate app");
});

/* ======================= Governance (61–67) ======================= */

test(61, "Proposed Scope Overview displays all decision dependencies", "governance", () => {
  const refs = js().decisions.map((d) => d.ref);
  expect(["OP-52 / OP-55", "OP-53", "OP-56", "OP-58", "OP-57", "OP-59", "OP-63", "OP-29", "OP-27", "OP-28", "OP-26", "OP-36 / OP-37"].every((r) => refs.includes(r)), "missing decision");
  expect(J.module12Overview().openDecisions === 12, "decision closed");
});
test(62, "Proposed features are not visible as active production capabilities", "blocked", () => {
  const item = NAVIGATION.flatMap((g) => g.items.map((i) => ({ ...i, group: g.id }))).find((i) => i.path === "/future/job-management")!;
  expect(item.group === "future" && item.proposed && NAVIGATION.filter((g) => g.id !== "future").every((g) => g.items.every((i) => !i.path.startsWith("/future"))), "navigation");
  expect(FEATURE_GATES.every((g) => g.productionActive === false) && J.module12Overview().productionReady === false, "a feature is active");
  FEATURE_GATES.forEach((g) => no(J.activateFeature(TANUJIT, g.id), `activate ${g.id}`));
});
test(63, "Only authorised Evolve Super Admin users can access the prototype", "deterministic", () => {
  expect(hasPermission(accessStore.get(), TANUJIT, "proposed-scope", "view").allowed, "Super Admin denied");
  const others = [RAHUL, SNEHA, ANITA, LAKSHMI, KA_ADMIN, VIKRAM].filter((u) => hasPermission(accessStore.get(), u, "proposed-scope", "view").allowed);
  expect(!others.length, `granted to ${others.join(", ")}`);
  expect(!accessStore.get().users.some((u) => u.id !== TANUJIT && hasPermission(accessStore.get(), u.id, "proposed-scope", "edit").allowed && !accessStore.get().assignments.some((a) => a.userId === u.id && a.roleId === "ROLE-0001")), "edit held outside Super Admin");
  no(J.receiveSiebelJob(RAHUL, payload("SBL-T-9999")), "Evolve Ops job intake", /restricted/);
  expect(!hasPermission(accessStore.get(), TANUJIT, "proposed-scope", "view_sensitive").allowed, "customer data unmasked for Super Admin");
});
test(64, "All mock records are labelled", "governance", () => {
  expect(js().jobs.every((j) => j.demo && /DEMO|SBL-T-/.test(j.siebelJobRef)) && js().jobs.every((j) => !j.payload.customer.name || /Demo Customer/.test(j.payload.customer.name)), "unlabelled job");
  expect(["JobPages.tsx", "TechnicianPages.tsx", "FieldPages.tsx"].every((f) => src(`src/pages/jobs/${f}`).includes("<DemoTag />")), "demo tag missing");
});
test(65, "No real points are credited", "blocked", () => {
  expect(walletStore.get() === START.wallet && J.module12Overview().pointsCredited === 0 && js().rewards.every((r) => r.status !== "eligible" || !r.simulatedLedgerRef), "points credited");
});
test(66, "No real jobs are allocated", "blocked", () => {
  expect(js().assignments.every((a) => a.mode === "manual_demo" && a.notification === "not_sent_demo"), "real allocation");
});
test(67, "No live customer communications are sent", "blocked", () => {
  expect(commsStore.get() === START.comms && js().eidDeliveries.every((d) => d.outcome === "blocked") && js().feedbackLinks.every((l) => l.delivery === "not_sent_disabled"), "message sent");
  expect(js().audit.some((a) => a.result === "refused" && a.action === "customer_message_refused"), "refusal not audited");
});

/* ---------------- Report ---------------- */
results.sort((a, b) => a.n - b.n);
const passed = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${passed}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (results.length !== 67) console.log(`WARNING: ${results.length} scenarios registered, expected 67`);
if (passed !== results.length || results.length !== 67) process.exit(1);
