/**
 * Builds the development scheme state. A deterministic transaction feed is replayed through the mock
 * evaluation adapter, so every seeded accrual, budget figure and settlement release is traceable to a
 * scheme version, rule and source transaction exactly as live mock postings are.
 */
import { findBranch } from "@/config/geography";
import { hash01, pick } from "@/data/mock/random";
import { SEED_MEMBERS, SEED_RESTRICTIONS } from "@/data/mock/memberSeed";
import { ANITA, LAKSHMI, RAHUL, SEED_BONUSES, SEED_CAMPAIGNS, SEED_CONTEST_ENTRIES, SEED_EXCLUSIVITY, SEED_EXTENSIONS, SEED_FORMULAS, SEED_GAMES, SEED_REFERRAL_RULES, SEED_REFERRALS, SEED_SCHEME_DECISIONS, SEED_SCHEMES, SEED_TIERS, tierSnapshots } from "@/data/mock/schemeSeed";
import { buildMasterState } from "@/features/masters/seed";
import type { MasterState } from "@/features/masters/engine";
import type { SchemeAuditEvent, SchemeState, SettlementRelease, SettlementRequest, SourceTxn } from "@/types/schemes";
import { branchesInScope, settlementPreview, skusInScope } from "./engine";
import { evaluateTxn, postCandidates, postReversals, runPeriodEvaluation, type EngineCtx } from "./mockEngine";

export const SEED_AS_OF = "2026-11-08";
const TODAY = "2026-11-09";

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Scan feed for members inside each seeded scheme's scope (development data). */
function buildTxns(ms: MasterState): SourceTxn[] {
  const raw: Omit<SourceTxn, "id">[] = [];
  const HISTORY = ["SCH-0001", "SCH-0002", "SCH-0003", "SCH-0004", "SCH-0005", "SCH-0010", "SCH-0012", "SCH-0014", "SCH-0015", "SCH-0016"];
  for (const id of HISTORY) {
    const sc = SEED_SCHEMES.find((x) => x.id === id)!;
    const c = sc.versions[sc.versions.length - 1].config;
    const branches = branchesInScope(c.eligibility.branchScope);
    const skus = [...skusInScope(ms, c.products)].filter((k) => { const s = ms.skus.find((x) => x.id === k); return s?.status === "active" && c.basic.programmes.some((p) => s.programmes.includes(p)); });
    const members = SEED_MEMBERS.filter((m) => c.basic.programmes.includes(m.programme) && branches.has(m.branchCode) && !["pending", "rejected", "invited"].includes(m.status)).slice(0, 9);
    const end = c.duration.end < SEED_AS_OF ? c.duration.end : SEED_AS_OF;
    members.forEach((m) => {
      const eligibleSkus = skus.filter((k) => ms.skus.find((x) => x.id === k)!.programmes.includes(m.programme));
      if (!eligibleSkus.length) return;
      let d = addDays(c.duration.start, Math.floor(hash01(`${id}|${m.id}|start`) * 6));
      const gap = id === "SCH-0003" ? 4 : 5 + Math.floor(hash01(`${id}|${m.id}|gap`) * 6);
      while (d <= end) {
        raw.push({ kind: "scan", memberId: m.id, programme: m.programme, branchCode: m.branchCode, skuId: pick(`${id}|${m.id}|${d}|sku`, eligibleSkus), qty: 1 + Math.floor(hash01(`${id}|${m.id}|${d}|q`) * (id === "SCH-0003" ? 4 : 3)), date: d, originalTxnId: null });
        d = addDays(d, gap + Math.floor(hash01(`${id}|${m.id}|${d}|j`) * 3));
      }
    });
  }
  // Special-member extension EXT-0001: a Tamil Nadu member scanning Kerala-scheme wires after approval.
  ["2026-10-28", "2026-11-03", "2026-11-07"].forEach((d, i) => raw.push({ kind: "scan", memberId: "MBR-EP-0010", programme: "EP", branchCode: "TN-BR-CHENNAI-NORTH", skuId: i % 2 ? "SKU-00003" : "SKU-00001", qty: 2, date: d, originalTxnId: null }));
  raw.sort((a, b) => a.date.localeCompare(b.date) || a.memberId.localeCompare(b.memberId));
  const txns: SourceTxn[] = raw.map((t, i) => ({ ...t, id: `TXN-${String(i + 1).padStart(6, "0")}` }));
  // One sales return against an October pump scan in Tamil Nadu (reduces slab qualification).
  const orig = txns.find((t) => t.date >= "2026-10-01" && t.date <= "2026-10-31" && t.qty >= 2 && findBranch(t.branchCode)?.state.code === "TN" && ms.skus.find((k) => k.id === t.skuId)?.productId.match(/PRD-001[67]/));
  if (orig) txns.push({ id: `TXN-${String(txns.length + 1).padStart(6, "0")}`, kind: "sales_return", memberId: orig.memberId, programme: orig.programme, branchCode: orig.branchCode, skuId: orig.skuId, qty: 2, date: "2026-11-02", originalTxnId: orig.id });
  return txns.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function buildSchemeState(): SchemeState {
  const ms = buildMasterState();
  const memberOf = (id: string) => SEED_MEMBERS.find((m) => m.id === id);
  const txns = buildTxns(ms);
  let s: SchemeState = {
    schemes: structuredClone(SEED_SCHEMES),
    extensions: structuredClone(SEED_EXTENSIONS),
    exclusivity: structuredClone(SEED_EXCLUSIVITY),
    txns: [],
    accruals: [],
    settlements: [],
    releases: [],
    tiers: structuredClone(SEED_TIERS),
    tierSnapshots: tierSnapshots(),
    referralRules: structuredClone(SEED_REFERRAL_RULES),
    referrals: structuredClone(SEED_REFERRALS),
    campaigns: structuredClone(SEED_CAMPAIGNS),
    contestEntries: structuredClone(SEED_CONTEST_ENTRIES),
    giftBatches: [],
    backendRedemptions: [],
    games: structuredClone(SEED_GAMES),
    bonuses: structuredClone(SEED_BONUSES),
    decisions: structuredClone(SEED_SCHEME_DECISIONS),
    formulas: structuredClone(SEED_FORMULAS),
    audit: [],
    bannerTriggers: [],
  };
  // The scheduled scheme SCH-0016 starts later; replay skips it (no active version).
  const ctx = (date: string): EngineCtx => ({ ms, now: `${date}T20:00`, origin: "seed", memberOf, replay: true, restrictions: SEED_RESTRICTIONS });
  const monthEnd = (iso: string) => { const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  const periodRun = (asOf: string) => {
    for (const sc of s.schemes.filter((x) => x.activeVersion != null)) s = runPeriodEvaluation(s, ctx(asOf), sc, asOf).state;
  };
  let lastMonth = "";
  for (const t of txns) {
    const m = t.date.slice(0, 7);
    if (lastMonth && m !== lastMonth) periodRun(monthEnd(`${lastMonth}-01`));
    lastMonth = m;
    s = { ...s, txns: [...s.txns, t] };
    const ev = evaluateTxn(s, ctx(t.date), t);
    s = postCandidates(s, ctx(t.date), ev.candidates).state;
    s = postReversals(s, ev.reversals);
  }
  periodRun(SEED_AS_OF);

  /* ---------------- Settlements ---------------- */
  const settle = (id: string, schemeId: string, trancheId: string, from: string, to: string, createdAt: string, executedAt: string | null) => {
    const sc = s.schemes.find((x) => x.id === schemeId)!;
    const v = sc.versions.find((x) => x.version === sc.activeVersion)!;
    const t = v.config.settlement.tranches.find((x) => x.id === trancheId)!;
    // Same release rule as live requests (settlementPreview), so seed and runtime never diverge.
    const p = settlementPreview(s, sc, trancheId, from, to, TODAY);
    const accs = p.accruals;
    const lines = p.lines.map((l) => ({ ...l, open: accs.find((x) => x.id === l.id)!.points - accs.find((x) => x.id === l.id)!.releasedPoints }));
    const share = p.releasePct;
    const unsettled = p.unsettled;
    const release = p.releasePoints;
    const req: SettlementRequest = { id, schemeId, schemeVersion: v.version, trancheId, trancheLabel: t.label, earnedFrom: from, earnedTo: to, unsettledPoints: unsettled, releasePct: share, releasePoints: release, heldPoints: unsettled - release, residualHeld: Math.round(lines.reduce((n, l) => n + l.fraction, 0) * 100) / 100, accrualIds: accs.map((a) => a.id), checks: p.checks, status: executedAt ? "executed" : "pending_approval", approvalRequestId: null, createdBy: RAHUL, createdAt };
    s = { ...s, settlements: [...s.settlements, req] };
    if (executedAt) {
      const map = new Map(lines.map((l) => [l.id, l.release]));
      s = { ...s, accruals: s.accruals.map((a) => (map.has(a.id) ? { ...a, releasedPoints: a.releasedPoints + map.get(a.id)! } : a)) };
      const rel: SettlementRelease = { id: `REL-${id.slice(4)}`, requestId: id, schemeId, schemeVersion: v.version, earnedFrom: from, earnedTo: to, settledAt: executedAt, releasedPoints: release, heldPoints: unsettled - release, approvers: [ANITA, LAKSHMI], approvalRef: "", ledgerRef: `LDG-REL-${id.slice(4)}`, passbookLabel: `Settlement Release · ${v.config.basic.name} · ${t.label}` };
      s = { ...s, releases: [...s.releases, rel] };
    }
  };
  settle("SET-0001", "SCH-0010", "T1", "2026-07-01", "2026-09-30", "2026-10-16T10:00", "2026-10-22T15:00");
  settle("SET-0002", "SCH-0002", "T1", "2026-09-01", "2026-10-31", "2026-11-01T10:00", "2026-11-03T16:00");
  settle("SET-0003", "SCH-0004", "T1", "2026-07-01", "2026-09-30", "2026-11-07T11:00", null);

  /* ---------------- Audit ---------------- */
  const audit: SchemeAuditEvent[] = [];
  const add = (e: Omit<SchemeAuditEvent, "id" | "ref">) => audit.push({ ...e, id: `SAU-${String(audit.length + 1).padStart(6, "0")}`, ref: `SRF-${String(audit.length + 30001)}` });
  s.schemes.forEach((sc) => sc.versions.forEach((v) => {
    add({ entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: v.version === 1 ? "Scheme" : "Configuration version", oldValue: null, newValue: `v${v.version} draft · ${v.config.basic.name}`, by: v.createdBy, orgId: "ORG-0001", at: v.createdAt, changeType: v.version === 1 ? "created" : "version_created", reason: v.changeReason, approvalRequestId: null });
    if (v.submittedAt) add({ entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Status", oldValue: "Draft", newValue: "Pending approval", by: v.createdBy, orgId: "ORG-0001", at: v.submittedAt, changeType: "submitted", reason: "", approvalRequestId: null });
    if (v.approvedAt) add({ entity: "scheme", entityId: sc.id, schemeVersion: v.version, field: "Status", oldValue: "Pending approval", newValue: "Approved", by: v.approvedBy!, orgId: "ORG-0002", at: v.approvedAt, changeType: "approved", reason: "", approvalRequestId: null });
  }));
  s.schemes.forEach((sc) => sc.activations.forEach((a) => add({ entity: "scheme", entityId: sc.id, schemeVersion: a.version, field: "Activation", oldValue: "Approved", newValue: a.result === "success" ? "Active (development engine)" : "Activation failed", by: a.by, orgId: "ORG-0001", at: a.at, changeType: "activated", reason: a.message, approvalRequestId: null })));
  add({ entity: "scheme", entityId: "SCH-0014", schemeVersion: 1, field: "Status", oldValue: "Active", newValue: "Deactivated", by: "SYSTEM", orgId: null, at: "2026-05-20T12:00", changeType: "deactivated", reason: "Approved deactivation executed", approvalRequestId: null });
  add({ entity: "scheme", entityId: "SCH-0010", schemeVersion: 1, field: "Status", oldValue: "Completed", newValue: "Closed", by: "SYSTEM", orgId: null, at: "2026-10-15T12:00", changeType: "closed", reason: "Approved closure executed", approvalRequestId: null });
  add({ entity: "scheme", entityId: "SCH-0013", schemeVersion: 1, field: "Status", oldValue: "Pending approval", newValue: "Returned for correction", by: ANITA, orgId: "ORG-0002", at: "2026-11-06T12:00", changeType: "returned", reason: "Budget sheet missing; confirm the Maharashtra branch list", approvalRequestId: null });
  s.schemes.filter((x) => x.status === "budget_exhausted").forEach((x) => add({ entity: "scheme", entityId: x.id, schemeVersion: x.activeVersion, field: "Status", oldValue: "Active", newValue: "Budget exhausted", by: "SYSTEM", orgId: null, at: s.accruals.filter((a) => a.schemeId === x.id && a.result === "rejected_budget")[0]?.calculatedAt ?? TODAY, changeType: "auto_stopped", reason: "Budget cap reached (mock engine auto-stop)", approvalRequestId: null }));
  s.releases.forEach((r) => add({ entity: "settlement", entityId: r.requestId, schemeVersion: r.schemeVersion, field: "Settlement release", oldValue: `${r.releasedPoints + r.heldPoints} unsettled`, newValue: `${r.releasedPoints} released · ${r.heldPoints} held`, by: "SYSTEM", orgId: null, at: r.settledAt, changeType: "settlement_executed", reason: r.passbookLabel, approvalRequestId: null }));
  s = { ...s, audit: audit.sort((a, b) => a.at.localeCompare(b.at)) };
  return s;
}
