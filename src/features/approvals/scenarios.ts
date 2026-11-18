/**
 * DEMO SCENARIOS — development only.
 * Builds the initial approval state by running real engine operations against the Phase 2 access
 * seed, so every seeded request carries a consistent history, audit trail and notifications.
 * Scenario letters match the Phase 3 brief (A–I). Member references are masked and fictional.
 * Module-raised requests (Phase 4 scanning configuration, Phase 6 schemes and incentives) are
 * replayed from precomputed steps, so this file never builds the master or scheme seeds.
 */
import { requestTypeById } from "@/config/approvalCatalogue";
import { SEED_DECISIONS, SEED_POLICIES, SEED_WORKFLOWS } from "@/data/mock/approvalSeed";
import { hash01, pick } from "@/data/mock/random";
import type { AccessState } from "@/features/access/engine";
import type { Attachment, FieldChange } from "@/types/approval";
import { addHours, opCreate, opDecide, opExecFinish, opExecStart, opResubmit, opRunSla, opSubmit, opUpdateWorking, opView, opWithdraw, reqById, type ApprovalState, type RequestInput } from "./engine";
import { getAdapter } from "./execution";
import type { ScenarioStep, Spec, Values } from "./moduleScenarios";
import { MODULE_APPROVAL_STEPS } from "@/data/mock/generated/approvalModuleSteps";

const RAHUL = "USR-1003";
const SNEHA = "USR-1004";
const ANITA = "USR-2001";
const LAKSHMI = "USR-2003";
const JOSEPH = "USR-2004";
const IMRAN = "USR-3001";

export function fieldsFor(requestType: string, values: Values): FieldChange[] {
  const t = requestTypeById.get(requestType)!;
  return t.fields.filter((f) => f.key in values).map((f) => ({ key: f.key, label: f.label, kind: f.kind, material: f.material, before: values[f.key][0], after: values[f.key][1] }));
}

const att = (id: string, name: string, by: string, at: string, sizeKb = 180): Attachment => ({ id, name, type: name.split(".").pop()!.toUpperCase(), sizeKb, uploadedBy: by, uploadedAt: at });

export function buildApprovalSeed(acc: AccessState): ApprovalState {
  let s: ApprovalState = { requests: [], workflows: SEED_WORKFLOWS, policies: SEED_POLICIES, decisions: SEED_DECISIONS, delegations: [], delegationEnabled: false, notifications: [], audit: [] };
  const ctx = (now: string) => ({ acc, now });
  const apply = (out: { state: ApprovalState; result: { ok: boolean; errors: string[] }; id?: string }, label: string, expectFail = false) => {
    if (!out.result.ok && !expectFail) console.warn(`[approval seed] ${label}:`, out.result.errors.join("; "));
    s = out.state;
    return out.id ?? "";
  };
  const input = (sp: Spec): RequestInput => ({ requestType: sp.type, title: sp.title, entityRef: sp.entity, programme: sp.programme, location: sp.location, amount: sp.amount ?? null, fields: sp.fields ?? fieldsFor(sp.type, sp.values), purpose: sp.purpose, reason: sp.reason, justification: sp.justification ?? "", attachments: sp.attachments ?? [], impact: sp.impact === undefined ? null : sp.impact });
  const raise = (at: string, maker: string, sp: Spec, submit = true) => {
    const id = apply(opCreate(s, ctx(at), maker, input(sp)), `create ${sp.title}`);
    if (submit) apply(opSubmit(s, ctx(addHours(at, 0.2)), maker, id), `submit ${id}`);
    return id;
  };
  const decide = (at: string, who: string, id: string, action: "approve" | "reject" | "return", remarks = "") => {
    apply(opView(s, ctx(addHours(at, -0.4)), who, id), `view ${id}`);
    apply(opDecide(s, ctx(at), who, id, action, remarks), `${action} ${id} by ${who}`);
  };
  const execute = (at: string, id: string, actor = "SYSTEM") => {
    apply(opExecStart(s, ctx(at), actor, id), `exec start ${id}`);
    const r = reqById(s, id)!;
    const outcome = getAdapter(r.module).execute(r);
    apply(opExecFinish(s, ctx(addHours(at, 0.05)), actor, id, outcome), `exec finish ${id}`, !outcome.ok);
  };
  /** Replays precomputed module-raised steps; `ref` points at the raise step's request. */
  const replay = (steps: ScenarioStep[]) => {
    const ids: string[] = [];
    for (const st of steps) {
      const at = (st.shift ?? []).reduce((t, h) => addHours(t, h), st.at);
      if (st.k === "raise") ids.push(raise(at, st.maker, st.spec));
      else if (st.k === "decide") decide(at, st.who, ids[st.ref], st.action, st.remarks);
      else execute(at, ids[st.ref]);
    }
  };

  /* ---------------- History: ~48 completed requests over the last ten weeks ---------------- */
  const PROGS = ["EP", "Retailer", "CS", "ST", "DD"];
  const STATES = ["KL", "TN", "KA", "MH", "AP", "TS"];
  const makers: { type: string; maker: string }[] = [
    { type: "scheme_modify", maker: RAHUL },
    { type: "points_adjustment", maker: SNEHA },
    { type: "redemption_cancellation", maker: SNEHA },
    { type: "sku_update", maker: RAHUL },
    { type: "points_reversal", maker: SNEHA },
    { type: "communication_publish", maker: IMRAN },
    { type: "financial_rule_change", maker: SNEHA },
    { type: "points_adjustment", maker: SNEHA },
  ];
  for (let i = 0; i < 48; i++) {
    const k = `hist-${i}`;
    const { type, maker } = makers[i % makers.length];
    const daysAgo = 70 - Math.floor(i * 1.25);
    const at = addHours(`2026-11-09T${String(9 + Math.floor(hash01(k) * 7)).padStart(2, "0")}:${pick(k + "m", ["05", "20", "35", "50"])}`, -24 * daysAgo);
    const prog = type === "communication_publish" ? pick(k + "p", ["ST", "CS"]) : type === "sku_update" ? null : type === "scheme_modify" ? pick(k + "p", ["EP", "EP", "Retailer", "ST"]) : pick(k + "p", PROGS);
    const state = type === "scheme_modify" ? (prog === "EP" ? pick(k + "s", ["KA", "KA", "KL"]) : pick(k + "s", STATES)) : type === "sku_update" || type === "communication_publish" || type === "financial_rule_change" ? null : pick(k + "s", STATES);
    const pts = 200 + Math.round(hash01(k + "pts") * 46) * 50;
    const member = `${prog ?? "EP"}-•••${String(1000 + Math.floor(hash01(k + "mem") * 8999))}`;
    const specs: Record<string, Spec> = {
      scheme_modify: { type, title: `Extend ${prog} festive scheme in ${state}`, entity: `SCH-${prog}-${state}-${200 + i}`, programme: prog, location: state ? { state } : null, values: { name: [`${prog} Festive Bonanza ${state}`, `${prog} Festive Bonanza ${state}`], end: ["2026-10-31", "2026-11-30"], multiplier: [1.5, 1.5 + (i % 3) * 0.25] }, purpose: "Extend scheme to cover the post-festive sell-through period", reason: "Regional sales request", impact: { affectedMembers: 800 + i * 37, pointsImpact: 120000 + i * 3100, effectiveDate: at.slice(0, 10) } },
      points_adjustment: { type, title: `Credit missed scan points · ${member}`, entity: `WAL-${member}-${i}`, programme: prog, location: state ? { state } : null, amount: pts, values: { member: [member, member], balance: [4200 + i * 11, 4200 + i * 11 + pts], adjustment: [0, pts], reasonCode: ["—", "Scan failed at upload"] }, purpose: "Restore points for a verified scan that failed to post", reason: "Ticket evidence confirms purchase", impact: { affectedMembers: 1, pointsImpact: pts, financialImpactInr: pts * 0.5 } },
      points_reversal: { type, title: `Reverse duplicate scan credit · ${member}`, entity: `WAL-REV-${member}-${i}`, programme: prog, location: state ? { state } : null, amount: -pts, values: { member: [member, member], scanRef: [`SCN-88${i}2`, `SCN-88${i}2`], points: [0, -pts], balance: [6100 + i, 6100 + i - pts] }, purpose: "Reverse a duplicate credit found in reconciliation", reason: "Duplicate QR credited twice", impact: { affectedMembers: 1, pointsImpact: -pts } },
      redemption_cancellation: { type, title: `Cancel undeliverable redemption · ${member}`, entity: `RED-26-${4400 + i}`, programme: prog, location: state ? { state } : null, amount: pts * 2, values: { redemption: [`RED-26-${4400 + i}`, `RED-26-${4400 + i}`], status: ["In transit", "Cancelled"], points: [0, pts * 2], value: [pts, 0] }, purpose: "Courier returned the gift as undeliverable", reason: "Address could not be verified", impact: { affectedMembers: 1, pointsImpact: pts * 2 } },
      sku_update: { type, title: `Revise scan points for SKU VG-${3100 + i}`, entity: `SKU-VG-${3100 + i}`, programme: null, location: null, values: { sku: [`VG-${3100 + i}`, `VG-${3100 + i}`], points: [20 + (i % 4) * 5, 25 + (i % 4) * 5], category: ["Wires", "Wires"] }, purpose: "Align scan points with the revised price list", reason: "Price revision effective this month", impact: null },
      communication_publish: { type, title: `${prog} monthly scheme reminder`, entity: `COM-${prog}-${900 + i}`, programme: prog, location: null, values: { title: [null, `${prog} scheme closes soon`], audience: [null, `All active ${prog} members`], channel: [null, "In-app notification"], sendOn: [null, at.slice(0, 10)] }, purpose: "Monthly reminder ahead of scheme close", reason: "Planned communication calendar", impact: { affectedMembers: 12000 + i * 140 } },
      financial_rule_change: { type, title: `Update ${prog} point value`, entity: `FIN-${prog}-PV-${i}`, programme: prog, location: null, values: { rule: ["Point value", "Point value"], programme: [prog, prog], rate: [0.5, 0.5 + (i % 2) * 0.05], effective: [null, at.slice(0, 10)] }, purpose: "Annual point value review", reason: "Approved in the quarterly finance review", impact: { financialImpactInr: 250000 + i * 5000 } },
    };
    const sp = specs[type];
    const id = raise(at, maker, sp);
    const roll = hash01(k + "outcome");
    let t = addHours(at, 2 + hash01(k + "d1") * 30);
    const firstApprover = () => {
      const r = reqById(s, id)!;
      const run = r.stages[r.currentStage];
      return run ? pick(k + "who" + r.currentStage, run.assignedTo) : undefined;
    };
    if (roll < 0.12) {
      const who = firstApprover();
      if (who) decide(t, who, id, "reject", pick(k + "rr", ["Evidence does not support the change", "Outside the scheme's approved budget", "Duplicate of an earlier request"]));
      continue;
    }
    if (roll < 0.28) {
      const who = firstApprover();
      if (who) {
        decide(t, who, id, "return", "Attach supporting evidence and confirm the figures");
        t = addHours(t, 3 + hash01(k + "d2") * 20);
        const cur = reqById(s, id)!;
        apply(opUpdateWorking(s, ctx(t), maker, id, { justification: "Evidence attached as requested", attachments: [att(`ATT-H${i}`, "supporting-evidence.pdf", maker, t)], fields: cur.versions[cur.versions.length - 1].fields }), `edit ${id}`);
        apply(opResubmit(s, ctx(addHours(t, 0.1)), maker, id), `resubmit ${id}`);
        t = addHours(t, 2 + hash01(k + "d3") * 16);
      }
    }
    // Approve each remaining stage.
    for (let guard = 0; guard < 3; guard++) {
      const r = reqById(s, id)!;
      if (!["pending_approval", "under_review", "partially_approved"].includes(r.status)) break;
      const who = firstApprover();
      if (!who) break;
      decide(t, who, id, "approve", "Checked against supporting records");
      t = addHours(t, 1 + hash01(k + "d4" + guard) * 18);
    }
    if (reqById(s, id)!.status === "approved") execute(addHours(t, 0.5), id);
  }

  /* ---------------- Scenario A: single-stage approval, executed ---------------- */
  const A = raise("2026-11-03T10:15", RAHUL, { type: "scheme_modify", title: "Extend EP Karnataka Diwali scheme by two weeks", entity: "SCH-EP-KA-0412", programme: "EP", location: { state: "KA" }, values: { name: ["EP Diwali Dhamaka Karnataka", "EP Diwali Dhamaka Karnataka"], end: ["2026-11-10", "2026-11-24"], multiplier: [2, 2], budget: [1800000, 2100000] }, purpose: "Distributors in Karnataka asked for more time to clear festive stock", reason: "Regional sales request RS-KA-118", justification: "Budget increase covers the projected two-week uplift", attachments: [att("ATT-A1", "ka-sales-request.pdf", RAHUL, "2026-11-03T10:10", 240)], impact: { affectedMembers: 3420, affectedProgrammes: ["EP"], affectedBranches: ["Bengaluru", "Mysuru", "Hubballi"], pointsImpact: 300000, financialImpactInr: 150000, schemeImpact: "End date +14 days; budget +3,00,000 points", effectiveDate: "2026-11-10" } });
  decide("2026-11-04T11:20", JOSEPH, A, "approve", "Within the regional budget");
  execute("2026-11-04T11:45", A);

  /* ---------------- Withdrawn before any decision ---------------- */
  const W = raise("2026-11-05T09:30", SNEHA, { type: "points_adjustment", title: "Goodwill credit · Retailer-•••7731", entity: "WAL-RT-7731-GW", programme: "Retailer", location: { state: "MH" }, amount: 500, values: { member: ["Retailer-•••7731", "Retailer-•••7731"], balance: [1250, 1750], adjustment: [0, 500], reasonCode: ["—", "Goodwill"] }, purpose: "Goodwill credit after a delayed ticket", reason: "Ticket TCK-55120 escalation", impact: { affectedMembers: 1, pointsImpact: 500, financialImpactInr: 250 } });
  apply(opWithdraw(s, ctx("2026-11-05T12:10"), SNEHA, W, "Ticket resolved through a gift replacement instead"), "withdraw");

  /* ---------------- Scenario D: rejected ---------------- */
  const D = raise("2026-11-06T10:05", SNEHA, { type: "redemption_cancellation", title: "Cancel redemption RED-26-5521 and refund points", entity: "RED-26-5521", programme: "EP", location: { state: "TN" }, amount: 6000, values: { redemption: ["RED-26-5521", "RED-26-5521"], status: ["Delivered", "Cancelled"], points: [0, 6000], value: [3000, 0] }, purpose: "Member says the gift was not received", reason: "Member complaint TCK-55871", impact: { affectedMembers: 1, pointsImpact: 6000, financialImpactInr: 3000 } });
  decide("2026-11-06T16:40", LAKSHMI, D, "reject", "Courier proof of delivery is signed by the member. Raise a delivery dispute instead");

  /* ---------------- Escalated and overdue (SLA) ---------------- */
  raise("2026-11-06T11:00", SNEHA, { type: "points_adjustment", title: "Restore expired points · CS-•••2290", entity: "WAL-CS-2290-EXP", programme: "CS", location: { state: "KL" }, amount: 1800, values: { member: ["CS-•••2290", "CS-•••2290"], balance: [0, 1800], adjustment: [0, 1800], reasonCode: ["—", "Expiry in error"] }, purpose: "Points expired although the member was inside the grace period", reason: "Expiry batch EXP-2610 used the wrong cut-off", impact: { affectedMembers: 1, pointsImpact: 1800, financialImpactInr: 900 } });
  raise("2026-11-07T09:00", SNEHA, { type: "redemption_cancellation", title: "Cancel redemption RED-26-5604 (out of stock)", entity: "RED-26-5604", programme: "Retailer", location: { state: "KA" }, amount: 4000, values: { redemption: ["RED-26-5604", "RED-26-5604"], status: ["Ordered", "Cancelled"], points: [0, 4000], value: [2000, 0] }, purpose: "Vendor cannot supply the item", reason: "Vendor stock-out notice", impact: { affectedMembers: 1, pointsImpact: 4000 } });

  /* ---------------- Scenario G: regional Checker cannot see an out-of-scope request ---------------- */
  const G = raise("2026-11-07T16:00", RAHUL, { type: "scheme_modify", title: "Raise ST Tamil Nadu monsoon multiplier", entity: "SCH-ST-TN-0388", programme: "ST", location: { state: "TN" }, values: { name: ["ST Monsoon Max Tamil Nadu", "ST Monsoon Max Tamil Nadu"], multiplier: [1.25, 1.5], budget: [900000, 1080000] }, purpose: "Competitive response in Tamil Nadu", reason: "Regional sales request RS-TN-204", impact: { affectedMembers: 2150, affectedProgrammes: ["ST"], pointsImpact: 180000, effectiveDate: "2026-11-15" } });
  apply(opView(s, ctx("2026-11-08T10:30"), ANITA, G), "view G");

  /* ---------------- Scenario H: approved through two stages, execution failed ---------------- */
  const H = raise("2026-11-07T11:30", SNEHA, { type: "points_reversal", title: "Reverse fraudulent scan credits · EP-•••6012", entity: "WAL-REV-EP-6012", programme: "EP", location: { state: "AP" }, amount: -2400, values: { member: ["EP-•••6012", "EP-•••6012"], scanRef: ["SCN-77120 to SCN-77131", "SCN-77120 to SCN-77131"], points: [0, -2400], balance: [3900, 1500] }, purpose: "Fraud review found twelve scans from cloned QR labels", reason: "Fraud case FRD-2611", attachments: [att("ATT-H1", "fraud-case-FRD-2611.pdf", SNEHA, "2026-11-07T11:20", 410)], impact: { affectedMembers: 1, pointsImpact: -2400, financialImpactInr: -1200 } });
  s = { ...s, requests: s.requests.map((r) => (r.id === H ? { ...r, execution: { ...r.execution, simulate: "fail_once" } } : r)) };
  decide("2026-11-07T15:10", LAKSHMI, H, "approve", "Fraud case evidence verified");
  decide("2026-11-08T10:05", ANITA, H, "approve", "Approved. Block the cloned label range as well");
  execute("2026-11-08T10:30", H);

  /* ---------------- Communication approved, awaiting execution ---------------- */
  const COM = raise("2026-11-07T14:20", IMRAN, { type: "communication_publish", title: "ST winter scheme launch announcement", entity: "COM-ST-1102", programme: "ST", location: null, values: { title: [null, "Winter scheme starts 15 November"], audience: [null, "All active ST members"], channel: [null, "In-app notification"], sendOn: [null, "2026-11-14"] }, purpose: "Announce the winter scheme", reason: "Marketing calendar item MC-ST-11", attachments: [att("ATT-C1", "creative-v3.png", IMRAN, "2026-11-07T14:00", 820)], impact: { affectedMembers: 18400, affectedProgrammes: ["ST"], effectiveDate: "2026-11-14" } });
  decide("2026-11-08T12:15", ANITA, COM, "approve", "Copy approved");

  /* ---------------- Scenario F: no eligible approver ---------------- */
  raise("2026-11-08T09:40", SNEHA, { type: "scan_restriction_change", title: "Lower daily scan limit for Andhra Pradesh electricians", entity: "FRD-SCANLIMIT-AP", programme: "EP", location: { state: "AP" }, values: { rule: ["Daily scan limit · AP", "Daily scan limit · AP"], limit: [60, 40], action: ["Flag for review", "Block and flag"] }, purpose: "Spike in scans from three AP districts", reason: "Fraud analytics alert FA-1108", impact: { affectedMembers: 9300, affectedProgrammes: ["EP"], operationalImpact: "Legitimate high-volume electricians may hit the limit" } });

  /* ---------------- Scenario I: workflow awaiting business confirmation ---------------- */
  raise("2026-11-08T11:15", SNEHA, { type: "member_block", title: "Block member EP-•••4821 pending fraud review", entity: "MBR-EP-4821", programme: "EP", location: { state: "KL", district: "KL-ERNAKULAM" }, values: { member: ["EP-•••4821 · R. K.", "EP-•••4821 · R. K."], status: ["Active", "Blocked"], scope: ["—", "Scanning and redemption"] }, purpose: "Member linked to the cloned-label case", reason: "Fraud case FRD-2611", impact: { affectedMembers: 1, operationalImpact: "Member cannot scan or redeem while blocked" } });

  /* ---------------- Financial rule pending at Finance ---------------- */
  raise("2026-11-08T15:00", SNEHA, { type: "financial_rule_change", title: "Revise DD TDS threshold notice", entity: "FIN-DD-TDS-2627", programme: "DD", location: null, values: { rule: ["TDS deduction rate", "TDS deduction rate"], programme: ["DD", "DD"], rate: [5, 2], effective: ["2026-04-01", "2026-12-01"] }, purpose: "Reflect the revised TDS rate", reason: "Tax advisory note TX-26-09", attachments: [att("ATT-F1", "tax-advisory-TX-26-09.pdf", SNEHA, "2026-11-08T14:50", 150)], impact: { affectedMembers: 5400, affectedProgrammes: ["DD"], financialImpactInr: -84000, effectiveDate: "2026-12-01", dependencies: ["TDS Kitty ledger", "Payout file format"] } });

  /* ---------------- Scenario E: Maker is also a Checker (separation of duties) ---------------- */
  raise("2026-11-08T16:30", RAHUL, { type: "sku_update", title: "Increase scan points for VG-PIPE-25 SKU", entity: "SKU-VG-PIPE-25", programme: null, location: null, values: { sku: ["VG-PIPE-25 · 25mm conduit", "VG-PIPE-25 · 25mm conduit"], points: [15, 20], category: ["Pipes & conduits", "Pipes & conduits"], status: ["Active", "Active"] }, purpose: "Push conduit sales in the quarter", reason: "Category plan Q3-PIPES", impact: null });

  /* ---------------- Scenario B: two-stage, stage 1 approved ---------------- */
  const B = raise("2026-11-08T17:10", SNEHA, { type: "points_adjustment", title: "Credit bulk-purchase bonus · EP-•••3307", entity: "WAL-EP-3307-BULK", programme: "EP", location: { state: "KL", district: "KL-ERNAKULAM", branch: "KL-BR-KOCHI" }, amount: 5000, values: { member: ["EP-•••3307 · S. P.", "EP-•••3307 · S. P."], balance: [12400, 17400], adjustment: [0, 5000], reasonCode: ["—", "Bulk purchase bonus"] }, purpose: "Bonus promised under the Kochi branch bulk-purchase offer", reason: "Branch offer BO-KOCHI-07, invoice INV-88213", attachments: [att("ATT-B1", "invoice-INV-88213.pdf", SNEHA, "2026-11-08T17:00", 95)], impact: { affectedMembers: 1, affectedBranches: ["Kochi"], pointsImpact: 5000, financialImpactInr: 2500 } });
  decide("2026-11-09T09:40", LAKSHMI, B, "approve", "Invoice and offer terms verified");

  /* ---------------- Scenario C: returned, corrected, resubmitted ---------------- */
  const C = raise("2026-11-08T12:00", RAHUL, { type: "scheme_create", title: "Create Retailer Kerala year-end scheme", entity: "SCH-RT-KL-NEW-01", programme: "Retailer", location: { state: "KL" }, values: { name: [null, "Retailer Year-End Kerala"], start: [null, "2026-12-01"], end: [null, "2027-01-31"], multiplier: [null, 2.5], budget: [null, 2500000] }, purpose: "Year-end retailer push for Kerala", reason: "Annual plan item AP-RT-KL-04", impact: { affectedMembers: 4100, affectedProgrammes: ["Retailer"], pointsImpact: 2500000, effectiveDate: "2026-12-01" } });
  decide("2026-11-08T18:20", ANITA, C, "return", "Multiplier 2.5 exceeds the 2x cap for retailer schemes. Revise and attach the budget sheet");
  {
    const cur = reqById(s, C)!;
    const fields = cur.versions[cur.versions.length - 1].fields.map((f) => (f.key === "multiplier" ? { ...f, after: 2 } : f.key === "budget" ? { ...f, after: 2000000 } : f));
    apply(opUpdateWorking(s, ctx("2026-11-09T09:15"), RAHUL, C, { fields, justification: "Multiplier reduced to the 2x cap; budget revised accordingly", attachments: [att("ATT-C2", "budget-sheet-v2.xlsx", RAHUL, "2026-11-09T09:10", 64)], impact: { affectedMembers: 4100, affectedProgrammes: ["Retailer"], pointsImpact: 2000000, effectiveDate: "2026-12-01" } }), "edit C");
    apply(opResubmit(s, ctx("2026-11-09T09:20"), RAHUL, C), "resubmit C");
  }

  /* ---------------- Draft ---------------- */
  raise("2026-11-09T11:00", RAHUL, { type: "scheme_activation", title: "Deactivate CS summer scheme early", entity: "SCH-CS-ALL-0301", programme: "CS", location: null, values: { name: ["CS Summer Shine", "CS Summer Shine"], status: ["Active", "Inactive"] }, purpose: "Budget exhausted ahead of schedule", reason: "" }, false);

  /* ---------------- Phase 4: scanning configuration requests (module-raised, precomputed) ---------------- */
  replay(MODULE_APPROVAL_STEPS.scanConfig);

  /* ---------------- Phase 6: scheme lifecycle, settlement and incentive requests (module-raised, precomputed) ---------------- */
  replay(MODULE_APPROVAL_STEPS.schemes);

  /* ---------------- Phase 7: wallet, TDS, GST and redemption requests (module-raised, precomputed) ---------------- */
  replay(MODULE_APPROVAL_STEPS.wallet);

  /* ---------------- Phase 8: Communication Centre requests (module-raised, precomputed) ---------------- */
  replay(MODULE_APPROVAL_STEPS.comms);

  /* ---------------- Phase 9: gift catalogue, voucher recovery and insurance card requests (module-raised, precomputed) ---------------- */
  replay(MODULE_APPROVAL_STEPS.gifts);

  /* ---------------- Phase 10: fraud & risk requests (module-raised, precomputed) ---------------- */
  replay(MODULE_APPROVAL_STEPS.risk);

  /* ---------------- SLA check as of the demo moment ---------------- */
  s = opRunSla(s, ctx("2026-11-09T14:00")).state;
  return s;
}
