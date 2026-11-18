/**
 * MODULE-RAISED DEMO SCENARIOS — development only.
 * The Phase 4 scanning-configuration requests and the Phase 6 scheme, settlement and incentive
 * requests are raised from the master and scheme seeds. Building those seeds replays hundreds of
 * demo transactions, so the approval seed must not do it at start-up.
 *
 * This file records the scenario as a list of steps. `npm run seed:approval-steps` writes the steps
 * to `src/data/mock/generated/approvalModuleSteps.ts`, and `scenarios.ts` replays them through the
 * real approval engine. Test 119 fails if the generated file no longer matches these seeds.
 * Only this file and the generator import the master and scheme seeds.
 */
import type { Attachment, FieldChange, ImpactSummary, RequestLocation } from "@/types/approval";
import { branchLabel, pointsFields, ruleFields, versionsOf } from "@/features/masters/engine";
import { buildMasterState } from "@/features/masters/seed";
import { buildSchemeState } from "@/features/schemes/seed";
import { branchesInScope, configFields } from "@/features/schemes/engine";
import { findBranch } from "@/config/geography";
import { buildWalletSeed, seedMemberState } from "@/features/wallet/seed";
import { balancesFrom, linesOf, schemeLines } from "@/features/wallet/engine";
import { buildCommsSeed } from "@/features/comms/seed";
import { communicationSpec, contentSpec, surveySpec, templateSpec } from "@/features/comms/requests";
import { buildGiftSeed } from "@/features/gifts/seed";
import { buildRiskSeed } from "@/features/risk/seed";
import { thresholdSpec } from "@/features/risk/requests";
import { catalogueSpec, costSpec, insuranceBatchSpec, insurancePublishSpec, recoverySpec, type GiftSpec } from "@/features/gifts/requests";
import { adjustmentSpec, batchSpec, cancellationSpec, fyRefundSpec, gstOverrideSpec, reserveSpec, reversalSpec, transferSpec, type WalletSpec } from "@/features/wallet/requests";

const RAHUL = "USR-1003";
const ANITA = "USR-2001";
const LAKSHMI = "USR-2003";

export type Values = Record<string, [string | number | null, string | number | null]>;

export interface Spec {
  type: string;
  title: string;
  entity: string;
  programme: string | null;
  location: RequestLocation | null;
  amount?: number | null;
  values: Values;
  purpose: string;
  reason: string;
  justification?: string;
  attachments?: Attachment[];
  impact?: ImpactSummary | null;
  /** Field comparison supplied by the originating module instead of the type template. */
  fields?: FieldChange[];
}

/**
 * One replayable step. `at` is shifted by each value in `shift` (hours, applied in order with the
 * engine's addHours) at replay time, exactly as the original scenario computed it. `ref` is the
 * index of the raise step (within the same list) whose request the step acts on.
 */
export type ScenarioStep =
  | { k: "raise"; at: string; shift?: number[]; maker: string; spec: Spec }
  | { k: "decide"; at: string; shift?: number[]; who: string; ref: number; action: "approve" | "reject" | "return"; remarks: string }
  | { k: "execute"; at: string; shift?: number[]; ref: number };

export interface ModuleScenarioSteps {
  scanConfig: ScenarioStep[];
  schemes: ScenarioStep[];
  wallet: ScenarioStep[];
  comms: ScenarioStep[];
  gifts: ScenarioStep[];
  risk: ScenarioStep[];
}

function recorder() {
  const steps: ScenarioStep[] = [];
  let n = 0;
  const sh = (shift?: number[]) => (shift && shift.length ? { shift } : {});
  return {
    steps,
    raise: (at: string, maker: string, spec: Spec, shift?: number[]) => {
      steps.push({ k: "raise", at, ...sh(shift), maker, spec });
      return n++;
    },
    decide: (at: string, who: string, ref: number, action: "approve" | "reject" | "return", remarks = "", shift?: number[]) => {
      steps.push({ k: "decide", at, ...sh(shift), who, ref, action, remarks });
    },
    execute: (at: string, ref: number, shift?: number[]) => {
      steps.push({ k: "execute", at, ...sh(shift), ref });
    },
  };
}

export function buildModuleScenarioSteps(): ModuleScenarioSteps {
  const ms = buildMasterState();

  /* ---------------- Phase 4: scanning configuration requests (module-raised) ---------------- */
  const p4 = recorder();
  {
    const r3 = ms.rules.find((r) => r.id === "SRR-0003")!;
    const v3 = versionsOf(r3.versions);
    p4.raise("2026-11-08T11:30", RAHUL, { type: "scan_rule_modify", title: "Extend stabilizer scan window rule to all Karnataka branches", entity: "SRR-0003 v2", programme: null, location: { state: "KA" }, values: {}, fields: ruleFields(ms, r3, v3.active!, v3.pending!), purpose: "Apply the same time restriction to every Karnataka branch and stabilizer SKU", reason: v3.pending!.justification, impact: { affectedBranches: v3.pending!.scope.branchCodes.map(branchLabel), operationalImpact: `Time restriction would apply to ${v3.pending!.scope.skuIds.length} SKUs at ${v3.pending!.scope.branchCodes.length} branches. The time window itself is still unconfigured` } });
    const r4 = ms.rules.find((r) => r.id === "SRR-0004")!;
    const K = p4.raise("2026-11-06T10:30", RAHUL, { type: "scan_rule_create", title: "Create solar kit parent-child scan rule", entity: "SRR-0004 v1", programme: null, location: null, values: {}, fields: ruleFields(ms, r4, null, r4.versions[0]), purpose: "Control kit scans for solar installations", reason: r4.versions[0].justification });
    p4.decide("2026-11-07T15:00", ANITA, K, "return", "The parent-child meaning is not confirmed. Limit the rule to the ST programme and describe the kit relationship before resubmitting");
    const c12 = ms.scanPoints.find((c) => c.id === "SPC-0012")!;
    p4.raise("2026-11-08T14:10", "USR-2004", { type: "scan_points_change", title: "Raise AC stabilizer Scan-In points in Karnataka", entity: "SPC-0012 v2", programme: null, location: { state: "KA" }, values: {}, fields: pointsFields(ms, c12, c12.versions[0], c12.versions[1]), purpose: "Karnataka summer push for AC stabilizers", reason: c12.versions[1].remarks, impact: { affectedBranches: c12.branchCodes.map(branchLabel), effectiveDate: "2026-12-01" } });
  }

  /* ---------------- Phase 6: scheme lifecycle, settlement and incentive requests (module-raised) ---------------- */
  const p6 = recorder();
  {
    const ss = buildSchemeState();
    const { raise, decide, execute } = p6;
    const route = (progs: string[], branches: string[]) => {
      const states = Array.from(new Set(branches.map((b) => findBranch(b)?.state.code).filter(Boolean))) as string[];
      return { programme: progs.length === 1 ? progs[0] : progs.join(" + "), location: states.length === 1 ? { state: states[0] } : states.length ? { state: "MULTI-STATE" } : null };
    };
    const approveExec = (at: string, id: number, remarks = "Configuration reviewed (demo)", shift: number[] = []) => {
      decide(at, ANITA, id, "approve", remarks, shift);
      execute(at, id, [...shift, 0.1]);
    };
    for (const sc of ss.schemes) {
      sc.versions.forEach((v, i) => {
        if (!v.submittedAt) return;
        const prior = i > 0 ? sc.versions[i - 1].config : null;
        const r = route(v.config.basic.programmes, [...branchesInScope(v.config.eligibility.branchScope)]);
        const id = raise(v.submittedAt, RAHUL, { type: prior ? "scheme_modify" : "scheme_create", title: `${prior ? "Modify" : "Create"} scheme ${v.config.basic.name} (v${v.version})`, entity: `${sc.id} v${v.version}`, programme: r.programme, location: r.location, amount: v.config.budget.amount, values: {}, fields: configFields(ss, ms, prior, v.config).filter((f) => !prior || String(f.before) !== String(f.after) || f.material), purpose: v.config.basic.description, reason: v.changeReason, impact: { affectedProgrammes: v.config.basic.programmes, pointsImpact: v.config.budget.amount ?? undefined, schemeImpact: "Projected liability: Pending business formula (OP-SB-LIAB)", effectiveDate: v.config.duration.start, operationalImpact: "Approval does not activate the scheme" } });
        if (v.approvedAt) approveExec(v.approvedAt, id);
        if (sc.id === "SCH-0013") decide("2026-11-06T12:00", ANITA, id, "return", "Budget sheet missing; confirm the Maharashtra branch list");
      });
    }
    const simpleField = (label: string, before: string | null, after: string) => [{ key: "x", label, kind: "text" as const, before, after, material: true }];
    const D = raise("2026-05-18T10:00", RAHUL, { type: "scheme_activation", title: "Deactivate scheme CS Solar Summer", entity: "SCH-0014:deactivate", programme: "CS", location: null, values: {}, fields: simpleField("Scheme status", "Active", "Deactivated"), purpose: "Stop the scheme earning", reason: "Stock constraint on solar SKUs (demo)" });
    approveExec("2026-05-20T11:00", D);
    const CL = raise("2026-10-13T10:00", RAHUL, { type: "scheme_closure", title: "Close scheme EP Switchgear Q2 · Karnataka", entity: "SCH-0010:close", programme: "EP", location: { state: "KA" }, values: {}, fields: simpleField("Scheme status", "Completed", "Closed"), purpose: "Close the scheme", reason: "Scheme period ended" });
    approveExec("2026-10-15T11:00", CL);
    const E1 = raise("2026-10-23T11:00", RAHUL, { type: "scheme_extension", title: "Extend EP Wires Base Points · Kerala to MBR-EP-0010", entity: "EXT-0001", programme: "EP", location: { state: "TN" }, values: {}, fields: simpleField("Additional member(s)", null, "MBR-EP-0010"), purpose: "Special-member extension (SOW 6.2.15)", reason: "Member relocated mid-scheme (demo)" });
    approveExec("2026-10-25T10:00", E1);
    raise("2026-11-08T16:00", RAHUL, { type: "scheme_extension", title: "Extend Retailer Fans Milestone · South to Vijayawada branch", entity: "EXT-0002", programme: "Retailer", location: { state: "AP" }, values: {}, fields: simpleField("Additional branch", null, "AP-BR-VIJAYAWADA"), purpose: "Special-member extension (SOW 6.2.15)", reason: "Pilot extension (demo)" });
    ["EXR-0001", "EXR-0002"].forEach((x, i) => {
      const id = raise(`2026-11-0${1 + i}T10:00`, RAHUL, { type: "scheme_exclusivity", title: `Exclusivity rule ${x}`, entity: x, programme: "EP", location: null, values: {}, fields: simpleField("Schemes", "Inclusive (default)", x === "EXR-0001" ? "SCH-0001 ⟂ SCH-0015" : "SCH-0015 ⟂ SCH-0005"), purpose: "Explicit exclusivity (SOW 6.2.16)", reason: "Demo exclusivity" });
      approveExec(`2026-11-0${1 + i}T15:00`, id);
    });
    for (const st of ss.settlements) {
      const sc = ss.schemes.find((x) => x.id === st.schemeId)!;
      const c = sc.versions.find((v) => v.version === st.schemeVersion)!.config;
      const r = route(c.basic.programmes, [...branchesInScope(c.eligibility.branchScope)]);
      const id = raise(st.createdAt, RAHUL, { type: "scheme_settlement", title: `Settle ${c.basic.name} · ${st.trancheLabel}`, entity: st.id, programme: r.programme, location: r.location, amount: st.releasePoints, values: {}, fields: [{ key: "range", label: "Earned date range", kind: "text", before: null, after: `${st.earnedFrom} to ${st.earnedTo}` }, { key: "unsettled", label: "Unsettled points", kind: "points", before: st.unsettledPoints, after: st.heldPoints, material: true }, { key: "release", label: `Release (${st.releasePct}%)`, kind: "points", before: 0, after: st.releasePoints, material: true }], purpose: "Move unsettled scheme points to the redeemable wallet (SOW 5.2)", reason: `${st.trancheLabel} for ${st.earnedFrom} to ${st.earnedTo}`, impact: { pointsImpact: st.releasePoints } });
      if (st.status === "executed") {
        const rel = ss.releases.find((x) => x.requestId === st.id)!;
        decide(rel.settledAt, ANITA, id, "approve", "Scheme closure / partial-release criteria verified", [-100]);
        decide(rel.settledAt, LAKSHMI, id, "approve", "Ledger reconciliation checked", [-4]);
        execute(rel.settledAt, id);
      }
    }
    for (const t of ss.tiers.filter((x) => x.status === "active" || x.status === "pending_approval")) {
      const id = raise(t.status === "active" ? "2026-10-10T10:00" : "2026-11-07T10:00", RAHUL, { type: "tier_config", title: `Tier ${t.name} (${t.programme}) v${t.version}`, entity: t.id, programme: t.programme, location: null, values: {}, fields: [{ key: "threshold", label: "Threshold", kind: "points", before: null, after: t.threshold, material: true }], purpose: "Tier configuration (SOW 6.3)", reason: "Demo tier setup" });
      if (t.status === "active") approveExec("2026-10-12T10:00", id);
    }
    for (const c of ss.campaigns.filter((x) => ["active", "scheduled", "completed"].includes(x.status))) {
      const base = `${c.start < "2026-11-01" ? c.start : "2026-10-28"}T10:00`;
      const id = raise(base, RAHUL, { type: "campaign_publish", title: `Publish campaign ${c.name}`, entity: c.id, programme: c.programmes.length === 1 ? c.programmes[0] : c.programmes.join(" + "), location: null, values: {}, fields: simpleField("Geography", null, c.allStates ? "All states" : c.stateCodes.join(", ")), purpose: "Campaign publication (SOW 6.5)", reason: "Demo campaign" }, [-72]);
      approveExec(base, id, undefined, [-24]);
    }
    for (const g of ss.games.filter((x) => x.status === "active")) {
      const id = raise("2026-10-25T10:00", RAHUL, { type: "gamification_config", title: `Publish ${g.kind} ${g.name}`, entity: g.id, programme: g.programmes.length === 1 ? g.programmes[0] : g.programmes.join(" + "), location: null, values: {}, fields: simpleField("Configuration", null, g.name), purpose: "Gamification (SOW 6.6)", reason: "Demo" });
      approveExec("2026-10-27T10:00", id);
    }
  }

  /* ---------------- Phase 7: wallet, TDS, GST and redemption requests (module-raised) ---------------- */
  const p7 = recorder();
  {
    const ws = buildWalletSeed();
    const mem = seedMemberState();
    const SNEHA = "USR-1004";
    // Balances shown to the Checker include the scheme module lines, as the live store does.
    const all = [...ws.ledger, ...schemeLines(buildSchemeState(), mem, ws.config)];
    const bal = (id: string) => balancesFrom(linesOf(all, id));
    const toSpec = (w: WalletSpec): Spec => ({ type: w.type, title: w.title, entity: w.entity, programme: w.programme, location: w.location, amount: w.amount, values: {}, fields: w.fields, purpose: w.purpose, reason: w.reason, justification: w.justification, attachments: w.attachments, impact: w.impact });
    const addH = (iso: string, h: number) => { const d = new Date(`${iso}:00Z`); d.setUTCMinutes(d.getUTCMinutes() + Math.round(h * 60)); return d.toISOString().slice(0, 16); };
    /** Two-stage wallet workflow: Finance (Lakshmi) then V-Guard governance (Anita), then execution. */
    const twoStage = (id: number, at: string, executedAt: string | null) => {
      p7.decide(addH(at, 3), LAKSHMI, id, "approve", "Balance, reason code and evidence checked");
      p7.decide(executedAt ? addH(executedAt, -1) : addH(at, 20), ANITA, id, "approve", "Approved");
      if (executedAt) p7.execute(executedAt, id);
    };
    for (const a of ws.adjustments) {
      const id = p7.raise(a.createdAt, SNEHA, toSpec(adjustmentSpec(mem, a, bal(a.memberId))));
      if (a.status === "completed") twoStage(id, a.createdAt, a.executedAt);
      if (a.status === "rejected") p7.decide(addH(a.createdAt, 4), LAKSHMI, id, "reject", "Goodwill above the delegated limit without a ticket reference");
    }
    for (const b of ws.batches.filter((x) => x.status !== "draft")) {
      const id = p7.raise(b.createdAt, SNEHA, toSpec(batchSpec(b)));
      if (b.status === "completed") twoStage(id, b.createdAt, b.executedAt);
    }
    for (const r of ws.reversals) {
      const o = ws.ledger.find((l) => l.id === r.originalLedgerId)!;
      const id = p7.raise(r.createdAt, SNEHA, toSpec(reversalSpec(mem, r, o, bal(r.memberId))));
      if (r.status === "completed") twoStage(id, r.createdAt, r.executedAt);
      if (r.status === "rejected") p7.decide(addH(r.createdAt, 5), LAKSHMI, id, "reject", "Credit was correct: the member owns the device. Close the ticket");
    }
    for (const t of ws.transfers) {
      const id = p7.raise(t.createdAt, SNEHA, toSpec(transferSpec(mem, t, bal(t.fromMemberId), bal(t.toMemberId))));
      if (t.status === "completed") twoStage(id, t.createdAt, t.executedAt);
    }
    for (const c of ws.cancellations) {
      const red = ws.redemptions.find((x) => x.id === c.redemptionId)!;
      p7.raise(c.createdAt, c.createdBy, toSpec(cancellationSpec(mem, c, { ...red, stage: "processing" })));
    }
    for (const o of ws.gstOverrides) {
      const id = p7.raise(o.createdAt, SNEHA, toSpec(gstOverrideSpec(mem, o)));
      if (o.status === "completed") {
        p7.decide(addH(o.executedAt!, -1), ANITA, id, "approve", "GST portal verification attached; unlock until 31 Dec");
        p7.execute(o.executedAt!, id);
      }
    }
    for (const r of ws.reserves.filter((x) => x.status === "pending_approval")) p7.raise(r.updatedAt, SNEHA, toSpec(reserveSpec(mem, r, ws.config.retailerReserveDefaultInr)));
    for (const r of ws.tdsFy.filter((x) => x.status === "completed" || x.status === "pending_approval")) {
      const id = p7.raise(r.createdAt, SNEHA, toSpec(fyRefundSpec(mem, r)));
      if (r.status === "completed") {
        p7.decide(addH(r.executedAt!, -2), LAKSHMI, id, "approve", "Kitty within the FY threshold; refund approved");
        p7.execute(r.executedAt!, id);
      }
    }
  }

  /* ---------------- Phase 8: Communication Centre requests ---------------- */
  const p8 = recorder();
  {
    const cs = buildCommsSeed();
    const spec = (x: { type: string; title: string; entity: string; programme: string | null; fields: Spec["fields"]; purpose: string; reason: string; justification: string }): Spec => ({ type: x.type, title: x.title, entity: x.entity, programme: x.programme, location: null, amount: null, values: {}, fields: x.fields, purpose: x.purpose, reason: x.reason, justification: x.justification, attachments: [], impact: null });
    for (const c of cs.communications.filter((x) => x.status === "pending_approval")) p8.raise(c.createdAt, c.createdBy, spec(communicationSpec(c)));
    for (const t of cs.templates) for (const v of t.versions.filter((x) => x.status === "pending_approval")) p8.raise(v.changedAt, v.changedBy, spec(templateSpec(t, v, t.versions.find((y) => y.status === "active"))));
    for (const r of cs.rich.filter((x) => x.status === "pending_approval")) p8.raise(r.updatedAt, RAHUL, spec(contentSpec(r)));
    for (const s of cs.surveys.filter((x) => x.status === "pending_approval")) p8.raise(s.updatedAt, RAHUL, spec(surveySpec(s)));
  }

  /* ---------------- Phase 9: Gift & Fulfilment and Insurance Card requests ---------------- */
  const p9 = recorder();
  {
    const mem = seedMemberState();
    const gs = buildGiftSeed(buildWalletSeed(), mem);
    const SNEHA = "USR-1004";
    const spec = (x: GiftSpec): Spec => ({ type: x.type, title: x.title, entity: x.entity, programme: x.programme, location: null, amount: x.amount, values: {}, fields: x.fields, purpose: x.purpose, reason: x.reason, justification: x.justification, attachments: [], impact: x.impact });
    const byId = new Map(mem.members.map((m) => [m.id, m]));
    const batchSpec9 = (id: string) => {
      const b = gs.batches.find((x) => x.id === id)!;
      const asValid = { ...b, rows: b.rows.map((r) => ({ ...r, result: "valid" as const })) };
      const ms = b.rows.map((r) => byId.get(r.values.member_id)!);
      return spec(insuranceBatchSpec(asValid, [...new Set(ms.map((m) => m.programme))], [...new Set(gs.cards.filter((c) => c.batchId === id).map((c) => c.region))], [...new Set(ms.map((m) => gs.config.tierAssignments[m.id]).filter(Boolean))], "Not configured (OP-INS1)"));
    };
    const b1 = p9.raise("2026-10-20T11:05", RAHUL, batchSpec9("INB-0001"));
    p9.decide("2026-10-21T10:00", ANITA, b1, "approve", "Records checked against the insurer list");
    p9.execute("2026-10-21T10:04", b1);
    const pub = gs.publications[0];
    const p1 = p9.raise(pub.requestedAt, RAHUL, spec(insurancePublishSpec(pub.id, gs.cards.filter((c) => pub.cardIds.includes(c.id)), "Not configured (OP-INS1)", "Business Confirmation Required (OP-INS1)")));
    p9.decide("2026-10-22T10:00", ANITA, p1, "approve", "Preview and test download reviewed");
    p9.execute("2026-10-22T10:04", p1);
    p9.raise("2026-11-08T15:00", RAHUL, batchSpec9("INB-0002"));
    const item = gs.items.find((i) => i.status === "pending_approval")!;
    p9.raise("2026-11-08T11:05", RAHUL, spec(catalogueSpec(item, undefined, gs)));
    const pc = gs.costs.find((c) => c.status === "pending_approval")!;
    p9.raise(pc.updatedAt, RAHUL, spec(costSpec(pc, gs.costs.find((c) => c.id === pc.replaces), gs.items.find((i) => i.id === pc.giftId))));
    for (const r of gs.recoveries.filter((x) => x.status === "pending_approval")) p9.raise(r.requestedAt, SNEHA, spec(recoverySpec(r, gs.vouchers.find((v) => v.id === r.voucherId)!)));
  }

  /* ---------------- Phase 10: fraud & risk requests ---------------- */
  const p10 = recorder();
  {
    const mem = seedMemberState();
    const rs = buildRiskSeed(mem, buildWalletSeed(), buildSchemeState(), buildMasterState());
    for (const r of rs.rules.filter((x) => x.status === "pending_approval")) {
      const x = thresholdSpec(r, undefined);
      p10.raise(r.updatedAt, "USR-1004", { type: x.type, title: x.title, entity: x.entity, programme: x.programme, location: null, amount: null, values: {}, fields: x.fields, purpose: x.purpose, reason: x.reason, justification: x.justification, attachments: [], impact: x.impact });
    }
  }

  return { scanConfig: p4.steps, schemes: p6.steps, wallet: p7.steps, comms: p8.steps, gifts: p9.steps, risk: p10.steps };
}
