/**
 * WALLET DEVELOPMENT SEED — deterministic demo data for all five programmes (development only).
 * Built from the Phase 5 member seed. Every figure is mock data: point amounts, UTRs, voucher
 * references, GSTINs and recorded TDS amounts are fictional. Legacy redemption TDS amounts are
 * "recorded by the source system" demo values, not calculated by any rate in this build.
 */
import { BUCKET, DEFAULT_CONFIG, FIN_DECISIONS, GST_SCHEME_CLASS, VOUCHER_PROVIDERS, BCR, NA, pv, fy } from "@/config/walletCatalogue";
import { hash01, pick } from "@/data/mock/random";
import { SEED_DOCUMENTS, SEED_IDENTITIES, SEED_MEMBERS, SEED_RESTRICTIONS } from "@/data/mock/memberSeed";
import type { MemberState } from "@/features/members/engine";
import type { SchemeState } from "@/types/schemes";
import type { AdjustmentBatch, EmiBurn, GstOverrideRequest, GstRecord, LedgerEntry, PayoutRecord, PointsAdjustment, PointsReversal, PointsTransfer, RedemptionCancellation, RedemptionLimitPolicy, RedemptionMethod, RedemptionRequest, RetailerReserve, TdsFyReconciliation, VoucherRecovery, WalletRecord, WalletState } from "@/types/wallet";
import { balancesFrom, cancellationEligibility, fyAssessment, linesOf, redemptionBlockers, validateBatch } from "./engine";
import { scanTdsSplit } from "./tdsAdapter";

export const SEED_NOW = "2026-11-09T14:30";
const MAKER = "USR-1004"; // Sneha Das, Evolve Operations + Maker (wallet modules)
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const SKUS = ["DEV-WIR-002-A", "DEV-STA-006-A", "DEV-FAN-012-A", "DEV-PUM-016-A", "DEV-SWI-009-A", "DEV-INV-021-A", "DEV-WHT-031-A", "DEV-SOL-040-A"];
const RANGE: Record<string, [number, number]> = { EP: [20, 240], ST: [30, 300], CS: [25, 260], Retailer: [300, 2600], DD: [100, 900] };
const METHODS: Record<string, RedemptionMethod[]> = { EP: ["dbt", "upi", "upi", "voucher", "product"], ST: ["dbt", "upi", "voucher"], CS: ["dbt", "upi", "vguard_com"], Retailer: ["dbt", "dbt", "voucher", "vguard_com", "product"], DD: [] };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) => Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000);
const time = (k: string) => `${String(9 + Math.floor(hash01(k) * 9)).padStart(2, "0")}:${pick(k + "m", ["05", "18", "32", "47"])}`;

export function seedMemberState(): MemberState {
  return { members: SEED_MEMBERS, identities: SEED_IDENTITIES, documents: SEED_DOCUMENTS, restrictions: SEED_RESTRICTIONS, events: [], notifications: [], mobileChanges: [], mpinResets: [], decisions: [] };
}
const EMPTY_SCHEMES = { accruals: [], releases: [], settlements: [] } as unknown as SchemeState;

export function buildWalletSeed(): WalletState {
  const mem = seedMemberState();
  const cfg = DEFAULT_CONFIG;
  const ledger: LedgerEntry[] = [];
  let seq = 0;
  const post = (d: Omit<LedgerEntry, "id" | "opKey" | "origin">, op: string) => {
    const id = `LED-${pad(++seq, 6)}`;
    ledger.push({ ...d, id, opKey: `${op}#0`, origin: "seed" });
    return id;
  };
  const wallets: WalletRecord[] = [];
  const redemptions: RedemptionRequest[] = [];
  const payouts: PayoutRecord[] = [];
  const emi: EmiBurn[] = [];
  const pan = (id: string) => SEED_DOCUMENTS.find((d) => d.memberId === id && d.type === "pan")?.status === "approved";
  const eligibleForRedemption = (id: string) => {
    const m = SEED_MEMBERS.find((x) => x.id === id)!;
    if (m.programme === "DD") return false;
    if (SEED_RESTRICTIONS.some((r) => r.status !== "lifted" && r.memberIds.includes(id))) return false;
    return m.programme === "Retailer" ? pan(id) : m.status === "redemption_enabled";
  };
  // One high-volume EP electrician registered before FY 2025-26, so the above-threshold Kitty case exists.
  const heavy = [...SEED_MEMBERS].filter((m) => m.programme === "EP" && m.status === "redemption_enabled").sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1))[0].id;
  let redSeq = 0;

  for (const m of SEED_MEMBERS) {
    const active = !["pending", "rejected", "invited"].includes(m.status);
    const created = m.createdAt.slice(0, 10) < "2025-04-01" ? "2025-04-01" : m.createdAt.slice(0, 10);
    wallets.push({ memberId: m.id, programme: m.programme, createdAt: `${created}T${time(m.id + "c")}`, updatedAt: SEED_NOW, status: active ? "active" : "not_created" });
    if (!active) continue;
    const base = { memberId: m.id, programme: m.programme, branchCode: m.branchCode, status: "completed" as const, initiatedBy: "SYSTEM", remarks: "" };
    let avail = 0;
    const span = Math.max(30, dayDiff(created, "2026-11-07"));
    const events: { at: string; kind: "bonus" | "scan" | "redeem" | "pending"; k: string }[] = [];
    if (m.programme !== "DD") events.push({ at: `${addDays(created, 1)}T10:00`, kind: "bonus", k: "bonus" });
    const n = 8 + Math.floor(hash01(m.id + "n") * 14);
    for (let i = 0; i < n; i++) {
      const d = addDays(created, Math.floor(((i + hash01(m.id + "d" + i)) / n) * span));
      events.push({ at: `${d}T${time(m.id + i)}`, kind: "scan", k: `s${i}` });
    }
    if (eligibleForRedemption(m.id)) {
      const rn = 1 + Math.floor(hash01(m.id + "rn") * 4);
      for (let i = 0; i < rn; i++) {
        const d = addDays(created, Math.floor(span * (0.45 + (0.55 * (i + hash01(m.id + "rd" + i))) / rn)));
        events.push({ at: `${d}T${time(m.id + "r" + i)}`, kind: "redeem", k: `r${i}` });
      }
    }
    if (hash01(m.id + "pend") < 0.35) events.push({ at: `2026-11-0${8 + Math.floor(hash01(m.id + "pd") * 2)}T${time(m.id + "p")}`, kind: "pending", k: "p" });
    events.sort((a, b) => (a.at < b.at ? -1 : 1));

    const lots: { at: string; net: number; expiresOn: string }[] = [];
    for (const e of events) {
      if (e.kind === "bonus") {
        post({ ...base, at: e.at, ref: `WB-${m.id}`, type: "welcome_bonus", bucket: "available", points: 100, source: "bonus", channel: "system", remarks: "Welcome bonus (demo value)" }, `WB|${m.id}`);
        avail += 100;
      } else if (e.kind === "scan" || e.kind === "pending") {
        const [lo, hi] = RANGE[m.programme];
        const gross = Math.round((lo + hash01(m.id + e.k + "pts") * (hi - lo)) * (m.id === heavy ? 300 : 1));
        const ref = `SCN-${m.id.slice(4)}-${e.k.toUpperCase()}`;
        const sku = pick(m.id + e.k + "sku", SKUS);
        if (e.kind === "pending") {
          post({ ...base, at: e.at, ref, type: "scan_credit", bucket: "pending", points: gross, gross, status: "pending", source: "scan", channel: "scan", skuCode: sku, remarks: "Scan awaiting validation (Kitty split applies on validation for EP)" }, `SCAN|${ref}`);
          continue;
        }
        const split = scanTdsSplit(m.programme, pan(m.id), gross, cfg);
        const expiresOn = addDays(e.at, 480);
        post({ ...base, at: e.at, ref, type: "scan_credit", bucket: "available", points: split.net, gross, source: "scan", channel: "scan", skuCode: sku, expiresOn, remarks: split.applies ? `Gross ${gross}; ${split.ratePct}% provisional TDS to Kitty` : "Scan credit" }, `SCAN|${ref}`);
        if (split.kitty) post({ ...base, at: e.at, ref, type: "tds_kitty_deduction", bucket: "tds_kitty", points: split.kitty, source: "tds", channel: "system", remarks: `Scan-time provisional TDS ${split.ratePct}% (${pan(m.id) ? "PAN verified" : "no verified PAN"})` }, `SCAN|${ref}|K`);
        avail += split.net;
        lots.push({ at: e.at, net: split.net, expiresOn });
        // Expire lots whose expiry date has passed (FIFO not modelled; never below zero).
        expire(e.at.slice(0, 10));
      } else {
        redeem(e);
      }
    }
    expire(SEED_NOW.slice(0, 10));
    function expire(upTo: string) {
        for (const lot of lots.filter((l) => l.expiresOn < upTo && l.net > 0)) {
          const x = Math.min(lot.net, avail);
          lot.net = 0;
          if (x <= 0) continue;
          const at = `${lot.expiresOn}T00:05`;
          post({ ...base, at, ref: `EXP-${m.id.slice(4)}-${lot.at.slice(0, 10)}`, type: "expiry", bucket: "available", points: -x, source: "expiry", channel: "system", remarks: "Lot expired (wallet service expiry date)" }, `EXP|${m.id}|${lot.at}`);
          post({ ...base, at, ref: `EXP-${m.id.slice(4)}-${lot.at.slice(0, 10)}`, type: "expiry", bucket: "expired", points: x, source: "expiry", channel: "system", remarks: "Lot expired" }, `EXP|${m.id}|${lot.at}|X`);
          avail -= x;
        }
    }
    function redeem(e: { at: string; k: string }) {
      {
        const methods = METHODS[m.programme];
        const method = pick(m.id + e.k + "meth", methods);
        const want = Math.round(avail * (0.25 + hash01(m.id + e.k + "amt") * 0.45));
        if (want < 500) return;
        const id = `RED-${pad(++redSeq, 5)}`;
        const points = want;
        const grossInr = points * cfg.pointValueInr;
        const tdsRecorded = m.programme !== "EP";
        const tdsInr = tdsRecorded ? Math.round(grossInr * (0.02 + hash01(id + "tds") * 0.06)) : null;
        const roll = hash01(id + "outcome");
        const isPayout = method === "dbt" || method === "upi";
        const recent = e.at >= "2026-10-25";
        let stage: RedemptionRequest["stage"] = isPayout ? "paid" : "delivered";
        if (isPayout && grossInr > 10000 && recent) stage = "manual_validation";
        else if (roll < 0.07) stage = "failed";
        else if (roll < 0.13 && isPayout) stage = "reversed";
        else if (recent && roll < 0.4) stage = isPayout ? "payout_initiated" : "processing";
        const debit = stage === "manual_validation" ? null : post({ ...base, at: e.at, ref: id, type: "redemption_debit", bucket: "available", points: -points, source: "redemption", channel: "redemption", remarks: `${method.toUpperCase()} redemption` }, `RED|${id}`);
        if (debit) post({ ...base, at: e.at, ref: id, type: "redemption_debit", bucket: "redeemed", points, source: "redemption", channel: "redemption", remarks: `${method.toUpperCase()} redemption` }, `RED|${id}|X`);
        if (debit) avail -= points;
        let reversalLedgerId: string | null = null;
        if (stage === "reversed") {
          const at = `${addDays(e.at, 1)}T09:10`;
          post({ ...base, at, ref: id, type: "redemption_reversal", bucket: "redeemed", points: -points, source: "redemption", channel: "redemption", originalId: debit, remarks: "Failed payout reversed (legacy record)" }, `AUTOREV|${id}#L`);
          reversalLedgerId = post({ ...base, at, ref: id, type: "redemption_reversal", bucket: "available", points, source: "redemption", channel: "redemption", originalId: debit, remarks: "Failed payout reversed (legacy record)" }, `AUTOREV|${id}#L2`);
          avail += points;
        }
        const track: RedemptionRequest["track"] = ["paid", "delivered"].includes(stage) ? "pass" : stage === "failed" || stage === "reversed" ? "fail" : "in_process";
        const r: RedemptionRequest = {
          id, memberId: m.id, programme: m.programme, branchCode: m.branchCode, method, points, grossInr,
          tds: { model: m.programme === "EP" ? "kitty_at_scan" : "on_redemption", status: tdsRecorded ? "recorded" : "not_applicable", panStatus: pan(m.id) ? "verified" : "not_verified", panSource: m.programme === "Retailer" ? "SFDC" : "Rishta KYC", ratePct: null, amountInr: tdsInr },
          netInr: grossInr - (tdsInr ?? 0), createdAt: e.at, updatedAt: e.at, stage, track, blockedReasons: [],
          manualValidation: stage === "manual_validation" ? { required: true, reason: `Single redemption ₹${grossInr.toLocaleString("en-IN")} above ₹10,000 (SOW 5.3)`, callCentreRef: hash01(id + "cc") > 0.5 ? `CC-${id.slice(4)}` : null, outcome: "pending" } : { required: false, reason: "", callCentreRef: null, outcome: null },
          fraudCheck: hash01(id + "fraud") > 0.95 ? "flagged" : "passed",
          utr: null, externalRef: null, provider: isPayout ? "Mock payout adapter" : method === "voucher" ? "Mock voucher adapter" : "Gift & Fulfilment (mock)",
          debitLedgerId: debit, reversalLedgerId, origin: "legacy_record",
        };
        if (method === "voucher") r.voucher = { provider: pick(id + "vp", VOUCHER_PROVIDERS), codeMasked: `XXXX-XXXX-${String(1000 + Math.floor(hash01(id + "vc") * 8999))}`, issuedAt: e.at, expiresOn: addDays(e.at, 365), delivery: stage === "failed" ? "failed" : stage === "processing" ? "pending" : "delivered", recovery: "none" };
        if (method === "product" || method === "vguard_com") r.product = { item: pick(id + "it", ["Tool kit (24 pieces)", "Digital multimeter", "Ceiling fan (V-Guard.com)", "Store display rack", "Water heater 15 L (V-Guard.com)"]), catalogueRef: `GFT-CAT-${String(100 + Math.floor(hash01(id + "cr") * 300))}`, fulfilment: stage === "processing" ? "ordered" : stage === "failed" ? "returned" : "delivered", delivery: stage === "processing" ? "in_transit" : stage === "failed" ? "failed" : "delivered" };
        if (isPayout && stage !== "manual_validation") {
          const pid = `PAY-${id.slice(4)}`;
          const utr = stage === "paid" && hash01(id + "utr") > 0.06 ? `UTR${String(Math.floor(hash01(id + "u") * 1e10)).padStart(10, "0")}` : null;
          const callbacks: PayoutRecord["callbacks"] = stage === "paid" ? [{ id: `CB-${id.slice(4)}-1`, at: addDays(e.at, 0) + "T" + e.at.slice(11), status: "success", utr, duplicate: false }] : stage === "failed" || stage === "reversed" ? [{ id: `CB-${id.slice(4)}-1`, at: e.at, status: "failed", utr: null, duplicate: false }] : [];
          if (stage === "paid" && hash01(id + "dupcb") > 0.9) callbacks.push({ id: `CB-${id.slice(4)}-2`, at: e.at, status: "success", utr, duplicate: true });
          r.utr = utr;
          r.externalRef = `PGW-${id.slice(4)}`;
          payouts.push({ id: pid, redemptionId: id, provider: "Mock payout adapter", amountInr: r.netInr ?? grossInr, initiatedAt: e.at, status: stage === "paid" ? "success" : stage === "failed" || stage === "reversed" ? "failed" : "in_process", utr, failureReason: stage === "failed" || stage === "reversed" ? "Beneficiary account closed (mock)" : null, reconciliation: stage === "paid" ? (utr ? (hash01(id + "unm") > 0.93 ? "unmatched_external" : "matched") : "missing_utr") : "pending", callbacks });
        }
        if (stage === "failed" && isPayout) r.stage = "reversal_pending";
        redemptions.push(r);
      }
    }
  }

  const memState = mem;
  const tmp = (): WalletState => ({ ...state, ledger: [...ledger], seq });
  let state: WalletState = {
    wallets, ledger, snapshots: {}, service: { mode: "available", lastReconciledAt: "2026-11-09T06:00" }, adjustments: [], batches: [], reversals: [], transfers: [], redemptions, payouts, recoveries: [], cancellations: [], gifts: [], giftBatches: [],
    policies: [], reserves: [], tdsFy: [], gst: [], gstOverrides: [], emi, exceptions: [], decisions: structuredClone(FIN_DECISIONS), notifications: [], audit: [], config: cfg, seq,
  };
  const bal = (id: string) => balancesFrom(linesOf(ledger, id));
  const wm = (pred: (id: string) => boolean, prog: string, skip = 0) => SEED_MEMBERS.filter((m) => m.programme === prog && wallets.find((w) => w.memberId === m.id)?.status === "active" && pred(m.id))[skip]?.id;
  const sysBase = (id: string) => { const m = SEED_MEMBERS.find((x) => x.id === id)!; return { memberId: id, programme: m.programme, branchCode: m.branchCode, status: "completed" as const }; };

  /* ---------------- Policies (AF22/AF23) ---------------- */
  const P = (p: Omit<RedemptionLimitPolicy, "version" | "approvalRequestId" | "updatedBy" | "updatedAt" | "effectiveTo" | "geography" | "memberType"> & Partial<RedemptionLimitPolicy>): RedemptionLimitPolicy => ({ version: 1, approvalRequestId: null, updatedBy: "USR-1001", updatedAt: "2026-10-01T10:00", effectiveTo: null, geography: "All", memberType: "All", ...p });
  state.policies = [
    P({ id: "RLP-0001", programmes: ["EP", "ST", "CS", "Retailer"], method: "dbt_upi", minTotalPoints: NA("points"), minBalance: BCR("points"), minRedemptionInr: pv(100, "inr", "sow_value", "SOW 5.3 minimum redemption amount"), singleRedemptionInr: pv(10000, "inr", "sow_value", "SOW 5.3: above this, manual validation by the call centre"), dailyValueInr: BCR("inr"), monthlyValueInr: pv(30000, "inr", "sow_value", "SOW 5.3 monthly combined DBT + UPI"), dailyCount: BCR("count"), monthlyCount: BCR("count"), effectiveFrom: "2026-04-01", status: "active" }),
    P({ id: "RLP-0002", programmes: ["EP", "ST", "CS"], method: "all", minTotalPoints: pv(1000, "points", "sow_value", "SOW 10.5: EP/ST/CS minimum redeemable threshold"), minBalance: BCR("points"), minRedemptionInr: pv(100, "inr", "sow_value", "SOW 5.3"), singleRedemptionInr: NA("inr"), dailyValueInr: BCR("inr"), monthlyValueInr: BCR("inr"), dailyCount: BCR("count"), monthlyCount: BCR("count"), effectiveFrom: "2026-04-01", status: "active" }),
    P({ id: "RLP-0003", programmes: ["Retailer"], method: "all", minTotalPoints: pv(2500, "inr", "business_confirmation_required", "SOW writes ₹2,500 under 'minimum points to redeem': unit to confirm (FD-06). Not enforced"), minBalance: BCR("inr"), minRedemptionInr: pv(100, "inr", "sow_value", "SOW 5.3"), singleRedemptionInr: NA("inr"), dailyValueInr: BCR("inr"), monthlyValueInr: BCR("inr"), dailyCount: BCR("count"), monthlyCount: BCR("count"), effectiveFrom: "2026-04-01", status: "active" }),
    P({ id: "RLP-0004", programmes: ["DD"], method: "all", minTotalPoints: BCR("points", "DD rules not established (FD-11)"), minBalance: BCR("points", "FD-11"), minRedemptionInr: BCR("inr", "FD-11"), singleRedemptionInr: BCR("inr", "FD-11"), dailyValueInr: BCR("inr"), monthlyValueInr: BCR("inr"), dailyCount: BCR("count"), monthlyCount: BCR("count"), effectiveFrom: "2026-04-01", status: "active" }),
  ];

  /* ---------------- GST records (SOW 5.5) ---------------- */
  for (const m of SEED_MEMBERS.filter((x) => x.programme === "Retailer")) {
    const g = m.retailer?.gstStatus ?? "not_provided";
    const verification: GstRecord["verification"] = g === "eligible" ? "verified" : g === "pending" ? "pending" : g === "not_eligible" ? "not_verified" : "missing";
    state.gst.push({ memberId: m.id, gstinMasked: verification === "missing" ? null : `${pick(m.id + "st", ["32", "33", "29", "37"])}XXXXX${String(1000 + Math.floor(hash01(m.id + "g") * 8999))}X1ZX`, verification, source: verification === "missing" ? "not_captured" : "sfdc", writeBack: "not_connected", lastVerifiedAt: verification === "verified" ? "2026-06-14T11:00" : null, updatedAt: "2026-10-30T09:00", override: null });
    const b = bal(m.id);
    if (verification !== "verified" && b.available * cfg.pointValueInr > cfg.gst.thresholdInr) {
      const x = b.available - Math.floor(cfg.gst.thresholdInr / cfg.pointValueInr);
      const ref = `GST-LOCK-${m.id.slice(4)}`;
      post({ ...sysBase(m.id), at: "2026-10-31T23:00", ref, type: "gst_lock", bucket: "available", points: -x, source: "gst", channel: "system", initiatedBy: "SYSTEM", remarks: `GSTIN ${verification.replace("_", " ")}: Base Points above ₹${cfg.gst.thresholdInr.toLocaleString("en-IN")} locked` }, `GSTLOCK|${m.id}`);
      post({ ...sysBase(m.id), at: "2026-10-31T23:00", ref, type: "gst_lock", bucket: "gst_locked", points: x, source: "gst", channel: "system", initiatedBy: "SYSTEM", remarks: "Locked until GSTIN verified (SOW 5.5)" }, `GSTLOCK|${m.id}|X`);
    }
  }

  /* ---------------- Retailer reserves (SOW 5.4.2) ---------------- */
  const rtA = wm((id) => pan(id), "Retailer", 0)!;
  const rtB = wm((id) => pan(id), "Retailer", 1)!;
  state.reserves = [
    { id: "RSV-0001", memberId: rtA, reserveInr: 3500, reason: "Higher-value gift tier for this Retailer (demo)", effectiveFrom: "2026-08-01", status: "active", approvalRequestId: null, updatedBy: MAKER, updatedAt: "2026-07-28T10:00" },
    { id: "RSV-0002", memberId: rtB, reserveInr: 5000, reason: "Eligible for gifts above ₹20,000 (demo)", effectiveFrom: "2026-11-15", status: "pending_approval", approvalRequestId: null, updatedBy: MAKER, updatedAt: "2026-11-08T12:00" },
  ];

  /* ---------------- Manual adjustments, batch, reversals, transfers ---------------- */
  const epA = wm((id) => eligibleForRedemption(id), "EP", 1)!;
  const epB = wm((id) => eligibleForRedemption(id), "EP", 2)!;
  const epC = wm((id) => eligibleForRedemption(id), "EP", 3)!;
  const stA = wm((id) => eligibleForRedemption(id), "ST", 0)!;
  const csA = wm((id) => eligibleForRedemption(id), "CS", 0)!;
  const adj = (a: Partial<PointsAdjustment> & Pick<PointsAdjustment, "id" | "memberId" | "direction" | "category" | "points" | "reasonCode" | "remarks" | "status" | "createdAt">): PointsAdjustment => ({ programme: SEED_MEMBERS.find((m) => m.id === a.memberId)!.programme, approvalCode: `VG-FIN-${a.id.slice(4)}`, evidence: [], batchId: null, opKey: `ADJ|${a.id}`, approvalRequestId: null, ledgerIds: [], createdBy: MAKER, executedAt: null, failure: null, ...a });
  state.adjustments = [
    adj({ id: "ADJ-0001", memberId: epA, direction: "add", category: "base", points: 500, reasonCode: "ADJ-SCAN-FAIL", remarks: "Five verified scans on 12 Oct did not post (ticket TCK-61022)", status: "completed", createdAt: "2026-10-14T10:20", executedAt: "2026-10-15T16:10" }),
    adj({ id: "ADJ-0002", memberId: stA, direction: "deduct", category: "base", points: 120, reasonCode: "ADJ-DUP-CREDIT", remarks: "Duplicate credit from the 2 Oct reprocessing job", status: "completed", createdAt: "2026-10-20T11:00", executedAt: "2026-10-21T15:30" }),
    adj({ id: "ADJ-0003", memberId: epB, direction: "add", category: "scheme", points: 300, reasonCode: "ADJ-SCHEME-CORR", remarks: "Milestone missed by a backdated scheme run (demo)", status: "pending_approval", createdAt: "2026-11-08T10:30" }),
    adj({ id: "ADJ-0004", memberId: csA, direction: "deduct", category: "base", points: 150, reasonCode: "ADJ-DUP-CREDIT", remarks: "Goodwill credit given twice", status: "pending_approval", createdAt: "2026-11-09T09:15" }),
    adj({ id: "ADJ-0005", memberId: epC, direction: "add", category: "base", points: 2000, reasonCode: "ADJ-GOODWILL", remarks: "Goodwill for delayed redemption", status: "rejected", createdAt: "2026-10-28T12:00" }),
  ];
  for (const a of state.adjustments.filter((x) => x.status === "completed")) {
    const id = post({ ...sysBase(a.memberId), at: a.executedAt!, ref: a.id, type: a.direction === "add" ? "manual_add" : "manual_deduct", bucket: "available", points: a.direction === "add" ? a.points : -a.points, source: "manual", channel: "manual_adjustment", initiatedBy: MAKER, approvedBy: ["USR-2003", "USR-2001"], remarks: `${a.reasonCode}: ${a.remarks}` }, a.opKey);
    a.ledgerIds = [id];
  }
  state = tmp();
  const memberPool = SEED_MEMBERS.filter((m) => wallets.find((w) => w.memberId === m.id)?.status === "active" && m.programme !== "DD");
  const csvRows = (rows: string[][]) => ["member_id,programme,points_category,adjustment_type,points,reason_code,remarks", ...rows.map((r) => r.join(","))].join("\n");
  const reasons = ["ADJ-SCAN-FAIL", "ADJ-GOODWILL", "ADJ-SCHEME-CORR", "ADJ-DUP-CREDIT", "ADJ-OTHER"];
  const b1 = memberPool.filter((m) => m.programme === "EP").slice(4, 7);
  const v1 = validateBatch(state, EMPTY_SCHEMES, memState, csvRows(b1.map((m) => [m.id, "EP", "base", "add", "250", "ADJ-SCAN-FAIL", "Scan outage 3 Oct"])), reasons);
  const b2 = memberPool.filter((m) => m.programme === "Retailer").slice(2, 6);
  const v2 = validateBatch(state, EMPTY_SCHEMES, memState, csvRows(b2.map((m, i) => [m.id, "Retailer", "base", "add", String(400 + i * 50), "ADJ-GOODWILL", "Dealer meet goodwill (demo)"])), reasons);
  const b3m = memberPool.filter((m) => m.programme === "ST");
  const v3 = validateBatch(state, EMPTY_SCHEMES, memState, csvRows([[b3m[0].id, "ST", "base", "add", "200", "ADJ-SCAN-FAIL", "Outage"], [b3m[0].id, "ST", "base", "add", "200", "ADJ-SCAN-FAIL", "Outage"], ["MBR-ST-9999", "ST", "base", "add", "200", "ADJ-SCAN-FAIL", "Unknown member"], [b3m[1]?.id ?? b3m[0].id, "EP", "base", "add", "200", "ADJ-SCAN-FAIL", "Wrong programme"], [b3m[1]?.id ?? b3m[0].id, "ST", "bonus", "add", "-5", "ADJ-XYZ", ""]]), reasons);
  const batch = (id: string, fileName: string, rows: AdjustmentBatch["rows"], status: AdjustmentBatch["status"], createdAt: string): AdjustmentBatch => ({ id, fileName, policy: "atomic", rows, approvalCode: `VG-FIN-${id.slice(4)}`, remarks: "Bulk adjustment from the operations tracker (demo)", status, approvalRequestId: null, opKey: `BAT|${id}`, createdBy: MAKER, createdAt, executedAt: null });
  state.batches = [batch("BAT-0001", "scan-outage-3oct.csv", v1.rows, "completed", "2026-10-06T10:00"), batch("BAT-0002", "dealer-meet-goodwill.csv", v2.rows, "pending_approval", "2026-11-08T15:00"), batch("BAT-0003", "st-outage-draft.csv", v3.rows, "draft", "2026-11-09T11:40")];
  const bt1 = state.batches[0];
  bt1.executedAt = "2026-10-07T17:00";
  bt1.rows = bt1.rows.map((r) => ({ ...r, result: "completed", ledgerIds: [post({ ...sysBase(r.memberId), at: "2026-10-07T17:00", ref: `${bt1.id}-R${r.row}`, type: "manual_add", bucket: "available", points: Number(r.points), source: "manual", channel: "manual_adjustment", initiatedBy: MAKER, approvedBy: ["USR-2003", "USR-2001"], remarks: `${r.reasonCode}: ${r.remarks}` }, `${bt1.opKey}|R${r.row}`)], message: "Posted" }));
  state = tmp();

  const scanOf = (id: string, skip = 0) => ledger.filter((l) => l.memberId === id && l.type === "scan_credit" && l.bucket === "available" && l.status === "completed")[skip];
  const s1 = scanOf(epA, 2)!;
  const s2 = scanOf(epB, 1)!;
  const s3 = scanOf(stA, 1)!;
  const rev = (r: Pick<PointsReversal, "id" | "type" | "reasonCode" | "comment" | "status" | "createdAt"> & { o: LedgerEntry; points: number }): PointsReversal => ({ id: r.id, originalLedgerId: r.o.id, memberId: r.o.memberId, programme: r.o.programme, sourceRef: r.o.ref, originalPoints: r.o.points, points: r.points, type: r.type, reasonCode: r.reasonCode, comment: r.comment, evidence: ["return-invoice.pdf"], opKey: `REV|${r.id}`, status: r.status, approvalRequestId: null, ledgerIds: [], createdBy: MAKER, createdAt: r.createdAt, executedAt: null, failure: null });
  state.reversals = [
    rev({ id: "REV-0001", o: s1, points: s1.points, type: "sales_return", reasonCode: "REV-SALES-RETURN", comment: "Distributor returned the carton; credit note CN-2210", status: "completed", createdAt: "2026-10-18T10:00" }),
    rev({ id: "REV-0002", o: s2, points: Math.min(s2.points, 40), type: "invalid_claim", reasonCode: "REV-INVALID-CLAIM", comment: "QR label reported stolen from the warehouse", status: "pending_approval", createdAt: "2026-11-08T16:20" }),
    rev({ id: "REV-0003", o: s3, points: s3.points, type: "wrong_credit", reasonCode: "REV-WRONG-CREDIT", comment: "Points credited to the wrong ST account", status: "rejected", createdAt: "2026-10-30T09:40" }),
  ];
  const r1 = state.reversals[0];
  r1.executedAt = "2026-10-19T12:00";
  r1.ledgerIds = [post({ ...sysBase(r1.memberId), at: r1.executedAt, ref: r1.id, type: "sales_return_reversal", bucket: "available", points: -r1.points, source: "reversal", channel: "manual_adjustment", originalId: r1.originalLedgerId, initiatedBy: MAKER, approvedBy: ["USR-2003", "USR-2001"], remarks: `${r1.reasonCode}: ${r1.comment}` }, r1.opKey)];

  const [tA, tB, tC, tD] = memberPool.filter((m) => m.programme === "EP" && eligibleForRedemption(m.id)).slice(5, 9).map((m) => m.id);
  const trf = (t: Pick<PointsTransfer, "id" | "fromMemberId" | "toMemberId" | "points" | "status" | "createdAt" | "comment">): PointsTransfer => ({ ...t, programme: "EP", reasonCode: "TRF-DISPUTE", evidence: ["qr-scan-photo.jpg"], opKey: `TRF|${t.id}`, approvalRequestId: null, ledgerIds: [], createdBy: MAKER, executedAt: null, failure: null });
  state.transfers = [
    trf({ id: "TRF-0001", fromMemberId: tA, toMemberId: tB, points: 180, status: "completed", createdAt: "2026-10-22T11:00", comment: "Shop helper scanned on the owner's account (ticket TCK-61540)" }),
    trf({ id: "TRF-0002", fromMemberId: tC, toMemberId: tD, points: 240, status: "pending_approval", createdAt: "2026-11-09T10:05", comment: "Scans made on a shared phone (ticket TCK-62011)" }),
  ];
  const t1 = state.transfers[0];
  t1.executedAt = "2026-10-23T15:00";
  t1.ledgerIds = [
    post({ ...sysBase(t1.fromMemberId), at: t1.executedAt, ref: t1.id, type: "transfer_debit", bucket: "available", points: -t1.points, source: "transfer", channel: "manual_adjustment", initiatedBy: MAKER, approvedBy: ["USR-2003", "USR-2001"], remarks: `To ${t1.toMemberId}` }, t1.opKey),
  ];
  ledger.push({ ...sysBase(t1.toMemberId), id: `LED-${pad(++seq, 6)}`, opKey: `${t1.opKey}#1`, origin: "seed", at: t1.executedAt, ref: t1.id, type: "transfer_credit", bucket: "available", points: t1.points, source: "transfer", channel: "manual_adjustment", initiatedBy: MAKER, approvedBy: ["USR-2003", "USR-2001"], remarks: `From ${t1.fromMemberId}` });
  t1.ledgerIds.push(ledger[ledger.length - 1].id);
  state = tmp();

  /* ---------------- Redemption cancellation, vouchers, EMI ---------------- */
  const cancelTarget = redemptions.find((r) => r.method === "product" && r.stage === "processing") ?? redemptions.find((r) => r.stage === "processing")!;
  const can: RedemptionCancellation = { id: "CAN-0001", redemptionId: cancelTarget.id, reason: "CAN-UNDELIVERABLE: courier cannot reach the address", eligibility: cancellationEligibility(state, cancelTarget), status: "pending_approval", approvalRequestId: null, reversalLedgerId: null, createdBy: "USR-1004", createdAt: "2026-11-08T17:30", executedAt: null, failure: null };
  cancelTarget.stage = "cancellation_pending";
  state.cancellations = [can];
  const v = redemptions.find((r) => r.method === "voucher" && r.voucher?.delivery === "delivered")!;
  v.voucher!.recovery = "recovered";
  state.recoveries = [{ id: "VRC-0001", redemptionId: v.id, memberId: v.memberId, reason: "Member deleted the SMS with the voucher code", requestedBy: "USR-1004", requestedAt: "2026-11-02T12:10", outcome: "recovered", message: "Voucher service re-sent the existing code to the registered mobile (no new voucher issued)", opKey: `VRC|${v.id}` }];

  const rts = SEED_MEMBERS.filter((m) => m.programme === "Retailer" && wallets.find((w) => w.memberId === m.id)?.status === "active").map((m) => m.id);
  const emiRows: [string, EmiBurn["status"], EmiBurn["reconciliation"], boolean][] = [["EMI-0001", "success", "matched", true], ["EMI-0002", "success", "matched", true], ["EMI-0003", "failed", "unmatched", false], ["EMI-0004", "success", "pending", true], ["EMI-0005", "reversed", "matched", true], ["EMI-0006", "pending", "pending", false]];
  emiRows.forEach(([id, status, reconciliation, ref], i) => {
    const memberId = rts[i % rts.length];
    const at = `2026-1${i < 3 ? 0 : 1}-0${2 + i}T11:00`;
    const points = 600 + i * 150;
    let ledgerId: string | null = null;
    if (status === "success" || status === "reversed") {
      ledgerId = post({ ...sysBase(memberId), at, ref: id, type: "emi_burn", bucket: "available", points: -points, source: "emi", channel: "redemption", initiatedBy: "SYSTEM", remarks: "EMI instalment paid with points (development record; no financing partner connected)" }, `EMI|${id}`);
      post({ ...sysBase(memberId), at, ref: id, type: "emi_burn", bucket: "redeemed", points, source: "emi", channel: "redemption", initiatedBy: "SYSTEM", remarks: "EMI point burn" }, `EMI|${id}|X`);
      if (status === "reversed") {
        post({ ...sysBase(memberId), at: at.replace("11:00", "15:00"), ref: id, type: "redemption_reversal", bucket: "redeemed", points: -points, source: "emi", channel: "redemption", originalId: ledgerId, initiatedBy: "SYSTEM", remarks: "EMI burn reversed: instalment rejected by financier (mock)" }, `EMIREV|${id}`);
        post({ ...sysBase(memberId), at: at.replace("11:00", "15:00"), ref: id, type: "redemption_reversal", bucket: "available", points, source: "emi", channel: "redemption", originalId: ledgerId, initiatedBy: "SYSTEM", remarks: "EMI burn reversed" }, `EMIREV|${id}|X`);
      }
    }
    emi.push({ id, memberId, loanRef: `LN-DEV-${4100 + i}`, instalmentRef: `INST-${4100 + i}-0${(i % 6) + 1}`, points, ledgerId, financingRef: ref ? `FIN-DEV-${7700 + i}` : null, at, status, reconciliation });
  });
  state = tmp();

  /* ---------------- GST overrides ---------------- */
  const gated = state.gst.filter((g) => g.verification !== "verified").map((g) => g.memberId);
  const ov = (o: Pick<GstOverrideRequest, "id" | "memberId" | "status" | "createdAt" | "remarks" | "requested" | "until">): GstOverrideRequest => ({ ...o, gstStatus: state.gst.find((g) => g.memberId === o.memberId)!.verification, currentGate: "Gated: Base above ₹19,999 and scheme points locked", reasonCode: "GST-SFDC-DELAY", evidence: ["gst-certificate.pdf"], approvalRequestId: null, createdBy: MAKER, executedAt: null });
  state.gstOverrides = [
    ov({ id: "GOV-0001", memberId: gated[0], status: "completed", createdAt: "2026-10-12T10:00", remarks: "GSTIN verified on the GST portal; SFDC update queued (OP-RET1)", requested: "unlock_until", until: "2026-12-31" }),
    ov({ id: "GOV-0002", memberId: gated[1] ?? gated[0], status: "pending_approval", createdAt: "2026-11-09T09:40", remarks: "Retailer submitted the certificate at the branch; SFDC write-back flow not confirmed", requested: "unlock_permanent_until_verified", until: null }),
  ];
  const o1 = state.gstOverrides[0];
  o1.executedAt = "2026-10-13T11:00";
  state.gst = state.gst.map((g) => (g.memberId === o1.memberId ? { ...g, override: { requestId: "", approvedAt: o1.executedAt!, until: o1.until, reason: o1.reasonCode } } : g));
  const lockedO1 = ledger.filter((l) => l.memberId === o1.memberId && l.bucket === "gst_locked").reduce((n, l) => n + l.points, 0);
  if (lockedO1 > 0) {
    post({ ...sysBase(o1.memberId), at: "2026-11-01T09:00", ref: o1.id, type: "gst_unlock", bucket: "gst_locked", points: -lockedO1, source: "gst", channel: "system", initiatedBy: "SYSTEM", remarks: `Administrative GST unlock ${o1.id}` }, `GSTUNLOCK|${o1.id}`);
    post({ ...sysBase(o1.memberId), at: "2026-11-01T09:00", ref: o1.id, type: "gst_unlock", bucket: "available", points: lockedO1, source: "gst", channel: "system", initiatedBy: "SYSTEM", remarks: `Administrative GST unlock ${o1.id}` }, `GSTUNLOCK|${o1.id}|X`);
  }
  state = tmp();

  /* ---------------- TDS FY 2025-26 reconciliation (EP/IMP) ---------------- */
  const epWithKitty = SEED_MEMBERS.filter((m) => m.programme === "EP" && ledger.some((l) => l.memberId === m.id && l.bucket === "tds_kitty" && fy(l.at) === "FY 2025-26"));
  const mk = (memberId: string, i: number, status: TdsFyReconciliation["status"]): TdsFyReconciliation => {
    const a = fyAssessment(state, EMPTY_SCHEMES, memState, memberId, "FY 2025-26");
    return { id: `TFY-${pad(i + 1)}`, memberId, fy: "FY 2025-26", kittyPoints: a.kittyPoints, kittyInr: a.kittyInr, thresholdInr: a.thresholdInr, outcome: a.outcome, calculation: a.calculation, slabRef: null, status: a.calculation === "business_confirmation_required" ? "business_confirmation_required" : status, approvalRequestId: null, ledgerIds: [], createdAt: "2026-04-05T10:00", executedAt: null, failure: null };
  };
  const others = epWithKitty.filter((m) => m.id !== heavy);
  state.tdsFy = [mk(heavy, 0, "pending_approval"), mk(others[0].id, 1, "completed"), mk(others[1].id, 2, "completed"), mk(others[2].id, 3, "pending_approval")];
  for (const r of state.tdsFy.filter((x) => x.status === "completed")) {
    r.executedAt = "2026-04-20T10:00";
    const base = { ...sysBase(r.memberId), at: r.executedAt, ref: r.id, type: "tds_kitty_refund" as const, source: "tds" as const, channel: "system" as const, initiatedBy: "SYSTEM", approvedBy: ["USR-2003"], remarks: `${r.fy}: TDS within ₹20,000, Kitty credited back` };
    r.ledgerIds = [post({ ...base, bucket: "tds_kitty", points: -r.kittyPoints }, `FYREFUND|${r.memberId}|${r.fy}`), post({ ...base, bucket: "available", points: r.kittyPoints }, `FYREFUND|${r.memberId}|${r.fy}|X`)];
  }
  state = tmp();

  /* ---------------- Blocked redemption attempts (member app) ---------------- */
  const blockedFor = SEED_MEMBERS.filter((m) => wallets.find((w) => w.memberId === m.id)?.status === "active" && !eligibleForRedemption(m.id) && m.programme !== "DD").slice(0, 6);
  blockedFor.forEach((m, i) => {
    const method = pick(m.id + "bm", METHODS[m.programme]);
    const points = 1200 + i * 150;
    const id = `RED-${pad(++redSeq, 5)}`;
    const reasons = redemptionBlockers(state, EMPTY_SCHEMES, memState, m.id, method, points, "2026-11-09").map((b) => `${b.reason}: ${b.detail}`);
    redemptions.push({ id, memberId: m.id, programme: m.programme, branchCode: m.branchCode, method, points, grossInr: points * cfg.pointValueInr, tds: { model: m.programme === "EP" ? "kitty_at_scan" : "on_redemption", status: m.programme === "EP" ? "not_applicable" : "bcr", panStatus: pan(m.id) ? "verified" : "not_verified", panSource: "Rishta KYC", ratePct: null, amountInr: null }, netInr: null, createdAt: `2026-11-0${3 + i}T12:00`, updatedAt: `2026-11-0${3 + i}T12:00`, stage: "blocked", track: "fail", blockedReasons: reasons.length ? reasons : ["Eligibility rule in force"], manualValidation: { required: false, reason: "", callCentreRef: null, outcome: null }, fraudCheck: "pending", utr: null, externalRef: null, provider: null, debitLedgerId: null, reversalLedgerId: null, origin: "mock_service" });
  });
  const mail = redemptions.find((r) => r.stage === "payout_initiated");
  if (mail) {
    mail.stage = "mail_approval";
    payouts.splice(payouts.findIndex((p) => p.redemptionId === mail.id), 1);
  }

  /* ---------------- Exceptions, notifications, audit ---------------- */
  const missingUtr = payouts.find((p) => p.reconciliation === "missing_utr");
  state.exceptions = [
    ...(missingUtr ? [{ id: "FEX-0001", reconType: "payout_utr" as const, ref: missingUtr.id, memberId: redemptions.find((r) => r.id === missingUtr.redemptionId)?.memberId ?? null, expected: 1, actual: 0, detail: "Payout success callback without UTR", owner: "USR-2003", status: "investigating" as const, resolutionRef: null, raisedAt: "2026-11-05T10:00", updatedAt: "2026-11-06T09:00" }] : []),
    { id: "FEX-0002", reconType: "emi_reference", ref: "EMI-0003", memberId: emi[2].memberId, expected: 1, actual: 0, detail: "EMI request failed without a financing reference", owner: "USR-1004", status: "open", resolutionRef: null, raisedAt: "2026-10-05T12:00", updatedAt: "2026-10-05T12:00" },
  ];
  const n = (at: string, event: string, ref: string, memberId: string | null, message: string) => state.notifications.push({ id: `FNT-${pad(state.notifications.length + 1, 6)}`, at, event, ref, memberId, message, channels: ["portal"], delivery: "mock_recorded" });
  n("2026-10-15T16:10", "Points manually added", "ADJ-0001", epA, `500 base points added to ${epA}`);
  n("2026-10-19T12:00", "Reversal approved", "REV-0001", r1.memberId, `Sales-return reversal of ${r1.points} points executed`);
  n("2026-10-23T15:00", "Point transfer completed", "TRF-0001", t1.fromMemberId, `180 points moved ${t1.fromMemberId} → ${t1.toMemberId}`);
  n("2026-11-02T12:10", "Voucher recovered", "VRC-0001", v.memberId, `Voucher for ${v.id} re-sent`);
  n("2026-11-08T17:30", "Redemption created", can.redemptionId, cancelTarget.memberId, `Cancellation requested for ${can.redemptionId}`);
  n("2026-11-09T09:40", "GST override requested", "GOV-0002", state.gstOverrides[1].memberId, "Override awaiting V-Guard approval");
  const au = (at: string, actor: string, entity: string, entityId: string, action: string, after: string, reason: string) => state.audit.push({ id: `FAE-${pad(state.audit.length + 1, 6)}`, at, actor, entity, entityId, action, before: null, after, reason, approvalRequestId: null });
  for (const a of state.adjustments) au(a.createdAt, MAKER, "adjustment", a.id, "submitted", `${a.direction} ${a.points} ${a.category}`, a.remarks);
  for (const b of state.batches) au(b.createdAt, MAKER, "batch", b.id, b.status === "draft" ? "validated" : "submitted", `${b.rows.length} rows`, b.remarks);
  for (const r of state.reversals) au(r.createdAt, MAKER, "reversal", r.id, "submitted", `${r.points} points of ${r.originalLedgerId}`, r.comment);
  for (const t of state.transfers) au(t.createdAt, MAKER, "transfer", t.id, "submitted", `${t.points} ${t.fromMemberId} → ${t.toMemberId}`, t.comment);
  au(can.createdAt, can.createdBy, "cancellation", can.id, "submitted", can.redemptionId, can.reason);
  for (const o of state.gstOverrides) au(o.createdAt, MAKER, "gst_override", o.id, "submitted", o.memberId, o.remarks);

  return { ...state, ledger: [...ledger], redemptions, payouts, emi, seq };
}

export const BUCKET_KEYS = Object.keys(BUCKET);
export const GST_CLASS_KEYS = Object.keys(GST_SCHEME_CLASS);
export type { WalletRecord };
export type { RetailerReserve, VoucherRecovery };
