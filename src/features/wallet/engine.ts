/**
 * WALLET ENGINE — pure functions over the wallet, member and scheme states (Phase 7).
 * Balances are always DERIVED from ledger lines; nothing here edits a balance. Phase 6 scheme
 * accruals and settlement releases are read into the same ledger view (no second settlement engine).
 * Values the SOW leaves open are reported as "business confirmation required", never assumed.
 */
import { BLOCK_REASON, BUCKET, GST_EXCEPTION_CLASSES, GST_SCHEME_CLASS, LEDGER_TYPE, RECON_TYPE, TDS_MODEL, fy } from "@/config/walletCatalogue";
import { activeRestrictions, docsOf, memberById, redemptionGaps, type MemberState } from "@/features/members/engine";
import type { Member, ProgrammeCode } from "@/types/members";
import type { SchemeState } from "@/types/schemes";
import type { ApprovalRequest } from "@/types/approval";
import type { BalanceView, BatchRow, Bucket, LedgerEntry, PointsTransfer, RedemptionMethod, RedemptionRequest, RedemptionLimitPolicy, ReconType, WalletBalances, WalletConfig, WalletState } from "@/types/wallet";
import { scanTdsSplit } from "./tdsAdapter";

export const panVerified = (mem: MemberState, memberId: string) => docsOf(mem, memberId).find((d) => d.type === "pan")?.status === "approved";
export const docOk = (mem: MemberState, memberId: string, type: "bank" | "upi") => docsOf(mem, memberId).find((d) => d.type === type)?.status === "approved";

/* ======================= Ledger composition ======================= */

/** Single-slot memo: recomputed only when one of the inputs changes identity. */
let memo: { key: unknown[]; value: LedgerEntry[] } | null = null;

/**
 * Ledger lines read from the Phase 6 scheme module: Base Points credits (redeemable), scheme points
 * accruals (unsettled) and settlement releases (unsettled → available, per accrual). EP Base Points
 * get the scan-time Kitty split; EP scheme points do not (FD-08 open).
 */
export function schemeLines(ss: SchemeState, mem: MemberState, cfg: WalletConfig): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const releaseOf = new Map<string, { settlementId: string; at: string; approvalRef: string; approvers: string[] }>();
  for (const st of ss.settlements) {
    const rel = ss.releases.find((r) => r.requestId === st.id);
    if (!rel) continue;
    for (const a of st.accrualIds) {
      const prev = releaseOf.get(a);
      if (!prev || prev.at < rel.settledAt) releaseOf.set(a, { settlementId: st.id, at: rel.settledAt, approvalRef: rel.approvalRef, approvers: rel.approvers });
    }
  }
  for (const a of ss.accruals) {
    if (!(a.result === "credited" || a.result === "accrued") || a.points <= 0) continue;
    const m = memberById(mem, a.memberId);
    if (!m) continue;
    const at = `${a.effectiveDate}T${a.calculatedAt.slice(11, 16) || "12:00"}`;
    const base = { memberId: a.memberId, programme: m.programme, branchCode: a.branchCode, at, schemeId: a.schemeId, schemeVersion: a.schemeVersion, categoryId: a.categoryId, skuCode: a.skuId, initiatedBy: "SYSTEM", origin: "scheme_module" as const, status: "completed" as const };
    if (a.bucket === "redeemable") {
      const split = scanTdsSplit(m.programme, panVerified(mem, a.memberId), a.points, cfg);
      out.push({ ...base, id: `LED-S-${a.id}`, ref: a.sourceRef, opKey: a.idempotencyKey, type: "base_credit", bucket: "available", points: split.net, gross: a.points, source: "scheme", channel: "scan", remarks: `Base Points from ${a.schemeId} v${a.schemeVersion}${split.applies ? ` · ${split.ratePct}% provisional TDS to Kitty` : ""}` });
      if (split.kitty > 0) out.push({ ...base, id: `LED-S-${a.id}-K`, ref: a.sourceRef, opKey: `${a.idempotencyKey}|KITTY`, type: "tds_kitty_deduction", bucket: "tds_kitty", points: split.kitty, source: "tds", channel: "system", remarks: `Scan-time provisional TDS ${split.ratePct}% (${panVerified(mem, a.memberId) ? "PAN verified" : "no verified PAN"})` });
    } else {
      out.push({ ...base, id: `LED-S-${a.id}`, ref: a.sourceRef, opKey: a.idempotencyKey, type: "scheme_accrual", bucket: "scheme_unsettled", points: a.points, source: "scheme", channel: "scheme", remarks: `${a.component} points · ${a.schemeId} v${a.schemeVersion} · unsettled until settlement` });
      if (a.releasedPoints > 0) {
        const r = releaseOf.get(a.id);
        const common = { ...base, at: r?.at ?? at, ref: r?.settlementId ?? "SETTLEMENT", settlementRef: r?.settlementId ?? null, approvalRequestId: r?.approvalRef ?? null, approvedBy: r?.approvers ?? [], source: "settlement" as const, channel: "system" as const, type: "settlement_release" as const };
        out.push({ ...common, id: `LED-S-${a.id}-R`, opKey: `${r?.settlementId}|${a.id}|OUT`, bucket: "scheme_unsettled", points: -a.releasedPoints, remarks: `Released from Scheme points by ${r?.settlementId}` });
        out.push({ ...common, id: `LED-S-${a.id}-A`, opKey: `${r?.settlementId}|${a.id}|IN`, bucket: "available", points: a.releasedPoints, remarks: `Settlement Release to Available · ${a.schemeId} v${a.schemeVersion}` });
      }
    }
  }
  return out;
}

/** The full ledger: wallet-service lines plus lines read from the scheme module. Cached per state pair. */
export function fullLedger(ws: WalletState, ss: SchemeState, mem: MemberState): LedgerEntry[] {
  const key = [ws.ledger, ws.config, ss.accruals, ss.releases, ss.settlements, mem.members, mem.documents];
  if (memo && memo.key.every((k, i) => k === key[i])) return memo.value;
  const value = [...ws.ledger, ...schemeLines(ss, mem, ws.config)].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  memo = { key, value };
  return value;
}

export const linesOf = (lines: LedgerEntry[], memberId: string) => lines.filter((l) => l.memberId === memberId);

/** Running bucket balances before and after each line (for the Previous / Updated balance columns). */
export function withRunningBalances(lines: LedgerEntry[]) {
  const bal = new Map<string, number>();
  return lines.map((l) => {
    const k = `${l.memberId}|${l.bucket}`;
    const prev = bal.get(k) ?? 0;
    const next = l.status === "completed" || l.bucket === "pending" ? prev + l.points : prev;
    bal.set(k, next);
    return { line: l, previous: prev, updated: next };
  });
}

/* ======================= Balances ======================= */

const EMPTY: WalletBalances = { lifetime: 0, available: 0, redeemed: 0, scheme: 0, pending: 0, tdsKitty: 0, tdsPaid: 0, gstLocked: 0, expired: 0, tdsDeductedPoints: 0, tdsDeductedInr: 0 };

export function balancesFrom(lines: LedgerEntry[], redemptions: RedemptionRequest[] = []): WalletBalances {
  const b = { ...EMPTY };
  const per: Record<Bucket, number> = { available: 0, pending: 0, scheme_unsettled: 0, tds_kitty: 0, tds_paid: 0, gst_locked: 0, redeemed: 0, expired: 0 };
  for (const l of lines) {
    if (l.status !== "completed" && !(l.status === "pending" && l.bucket === "pending")) continue;
    per[l.bucket] += l.points;
    const t = LEDGER_TYPE[l.type];
    if (t.earning && l.points > 0) b.lifetime += l.gross ?? l.points;
    if (t.earningReversal) b.lifetime += l.points; // negative
    if (l.type === "tds_kitty_deduction" && l.bucket === "tds_kitty") b.tdsDeductedPoints += l.points;
  }
  b.available = per.available;
  b.pending = per.pending;
  b.scheme = per.scheme_unsettled;
  b.tdsKitty = per.tds_kitty;
  b.tdsPaid = per.tds_paid;
  b.gstLocked = per.gst_locked;
  b.redeemed = per.redeemed;
  b.expired = per.expired;
  b.tdsDeductedInr = redemptions.filter((r) => r.tds.status === "recorded" && r.stage !== "reversed" && r.stage !== "cancelled").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0);
  return b;
}

export function memberBalances(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string): WalletBalances {
  return balancesFrom(linesOf(fullLedger(ws, ss, mem), memberId), ws.redemptions.filter((r) => r.memberId === memberId));
}

/**
 * SOW 5.1.1: what the wallet screen may show. When the wallet service is unavailable the last
 * successfully retrieved balance is shown and labelled; a missing snapshot shows "no balance", never 0.
 */
export function balanceView(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string, now: string): BalanceView {
  if (ws.service.mode === "available") {
    return { state: "live", balances: memberBalances(ws, ss, mem, memberId), retrievedAt: now, reconciledAt: ws.service.lastReconciledAt, message: "Live balance from the wallet service (mock)" };
  }
  const snap = ws.snapshots[memberId];
  const why = ws.service.mode === "timeout" ? "The wallet service timed out" : "The wallet service is unavailable";
  if (snap) return { state: "last_known", balances: snap.balances, retrievedAt: snap.retrievedAt, reconciledAt: snap.reconciledAt, message: `${why}. Showing the last balance retrieved; financial actions are validated by the wallet service when it responds` };
  return { state: "none", balances: null, retrievedAt: null, reconciledAt: null, message: `${why} and no earlier balance was retrieved in this session. The balance is unknown, not zero` };
}

/* ======================= Classification (SOW 5.1) ======================= */

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface Classification {
  key: string;
  label: string;
  points: number;
  redeemable: boolean;
  desc: string;
  source: string;
}

export function classify(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string, today: string): Classification[] {
  const lines = linesOf(fullLedger(ws, ss, mem), memberId);
  const b = balancesFrom(lines);
  const window = addDays(today, ws.config.expiringSoonDays);
  const expiringSoon = Math.min(
    Math.max(0, b.available),
    lines.filter((l) => l.status === "completed" && l.bucket === "available" && l.points > 0 && l.expiresOn && l.expiresOn > today && l.expiresOn <= window).reduce((n, l) => n + l.points, 0),
  );
  const m = memberById(mem, memberId);
  const holds = m ? activeRestrictions(mem, m) : [];
  return [
    { key: "available", label: "Available", points: b.available - expiringSoon, redeemable: true, desc: BUCKET.available.desc, source: "Ledger: available bucket" },
    { key: "expiring", label: "Expiring soon", points: expiringSoon, redeemable: true, desc: `Available points whose lot expires within ${ws.config.expiringSoonDays} days (display window pending FD-10)`, source: "Ledger: lot expiry from the wallet service" },
    { key: "pending", label: "Pending", points: b.pending, redeemable: false, desc: BUCKET.pending.desc, source: "Ledger: pending bucket" },
    { key: "expired", label: "Expired", points: b.expired, redeemable: false, desc: BUCKET.expired.desc, source: "Ledger: expired bucket" },
    { key: "scheme", label: "Scheme unsettled", points: b.scheme, redeemable: false, desc: BUCKET.scheme_unsettled.desc, source: "Phase 6 scheme accruals less releases" },
    { key: "kitty", label: "TDS Kitty", points: b.tdsKitty, redeemable: false, desc: BUCKET.tds_kitty.desc, source: "Ledger: TDS Kitty bucket (EP/IMP only)" },
    { key: "gst", label: "GST locked", points: b.gstLocked, redeemable: false, desc: BUCKET.gst_locked.desc, source: "Ledger: GST-locked bucket (Retailer only)" },
    { key: "hold", label: "Compliance / eligibility hold", points: holds.length ? Math.max(0, b.available) : 0, redeemable: false, desc: holds.length ? `Restriction in force (${holds.map((h) => h.id).join(", ")}): available points cannot be redeemed while it lasts. No points are moved` : "No restriction in force", source: "Member Management restrictions (no separate bucket)" },
  ];
}

/* ======================= Retailer reserve and GST gate ======================= */

export function reserveFor(ws: WalletState, memberId: string, programme: ProgrammeCode) {
  if (programme !== "Retailer") return { applies: false, reserveInr: 0, source: "Not applicable: the TDS reserve applies to Retailers only" };
  const own = ws.reserves.find((r) => r.memberId === memberId && r.status === "active");
  if (own) return { applies: true, reserveInr: own.reserveInr, source: `Retailer-specific reserve (${own.reason})` };
  return { applies: true, reserveInr: ws.config.retailerReserveDefaultInr, source: "Default Retailer reserve (SOW 5.4.2: ₹2,000)" };
}

/** SOW example: reserve ₹2,000, balance ₹2,900 → redeemable ₹900. */
export const redeemableAfterReserve = (availableInr: number, reserveInr: number) => Math.max(0, availableInr - reserveInr);

export interface GstGate {
  applies: boolean;
  verified: boolean;
  override: boolean;
  thresholdInr: number;
  availableInr: number;
  eligibleBaseInr: number;
  lockedBaseInr: number;
  lockedSchemePoints: number;
  exceptionSchemePoints: number;
  bySchemes: { schemeId: string; cls: string; points: number; locked: boolean }[];
  status: "not_applicable" | "verified" | "override" | "gated";
  message: string;
}

/**
 * SOW 5.5 GST gate for Retailers without a verified GSTIN: Base Points redeemable up to the
 * threshold (₹19,999, configurable); Base above it, milestone, cross-category and One VG points
 * locked. DU, Battery and WSSG schemes are exceptions, identified from the scheme classification table.
 * Unclassified Retailer scheme points are treated as locked (conservative).
 */
export function gstGate(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string, today: string): GstGate {
  const m = memberById(mem, memberId);
  const none: GstGate = { applies: false, verified: false, override: false, thresholdInr: ws.config.gst.thresholdInr, availableInr: 0, eligibleBaseInr: 0, lockedBaseInr: 0, lockedSchemePoints: 0, exceptionSchemePoints: 0, bySchemes: [], status: "not_applicable", message: "The GST gate applies to Retailers only" };
  if (!m || m.programme !== "Retailer") return none;
  const rec = ws.gst.find((g) => g.memberId === memberId);
  const b = memberBalances(ws, ss, mem, memberId);
  const v = ws.config.pointValueInr;
  const availableInr = (b.available + b.gstLocked) * v;
  const unsettled = new Map<string, number>();
  for (const l of linesOf(fullLedger(ws, ss, mem), memberId)) if (l.bucket === "scheme_unsettled" && l.schemeId) unsettled.set(l.schemeId, (unsettled.get(l.schemeId) ?? 0) + l.points);
  const bySchemes = [...unsettled].filter(([, p]) => p > 0).map(([schemeId, points]) => {
    const cls = GST_SCHEME_CLASS[schemeId]?.cls ?? "unclassified";
    return { schemeId, cls, points, locked: !(GST_EXCEPTION_CLASSES as readonly string[]).includes(cls) };
  });
  const verified = rec?.verification === "verified";
  const override = !!rec?.override && (!rec.override.until || rec.override.until >= today);
  const base = { ...none, applies: true, verified, override, availableInr, bySchemes, exceptionSchemePoints: bySchemes.filter((x) => !x.locked).reduce((n, x) => n + x.points, 0) };
  if (verified) return { ...base, eligibleBaseInr: availableInr, status: "verified", message: "Verified GSTIN: full redemption of eligible Base Points and settled scheme points, subject to KYC", bySchemes: bySchemes.map((x) => ({ ...x, locked: false })) };
  if (override) return { ...base, eligibleBaseInr: availableInr, status: "override", message: "Administrative GST unlock in force (approved override). The GSTIN itself is still not verified", bySchemes: bySchemes.map((x) => ({ ...x, locked: false })) };
  const t = ws.config.gst.thresholdInr;
  return {
    ...base,
    eligibleBaseInr: Math.min(availableInr, t),
    lockedBaseInr: Math.max(0, availableInr - t),
    lockedSchemePoints: bySchemes.filter((x) => x.locked).reduce((n, x) => n + x.points, 0),
    status: "gated",
    message: `GSTIN ${rec?.verification === "pending" ? "verification pending" : "not verified"}: Base Points redeemable up to ₹${t.toLocaleString("en-IN")} equivalent; the rest and non-exception scheme points stay locked`,
  };
}

/* ======================= Redemption eligibility and limits ======================= */

export function activePolicy(ws: WalletState, programme: ProgrammeCode, method: RedemptionMethod, today: string): RedemptionLimitPolicy | undefined {
  const dbtUpi = method === "dbt" || method === "upi";
  return ws.policies.find((p) => p.status === "active" && p.programmes.includes(programme) && p.effectiveFrom <= today && (!p.effectiveTo || p.effectiveTo >= today) && (p.method === method || (p.method === "dbt_upi" && dbtUpi) || p.method === "all"));
}
export const policiesFor = (ws: WalletState, programme: ProgrammeCode, today: string) => ws.policies.filter((p) => p.status === "active" && p.programmes.includes(programme) && p.effectiveFrom <= today && (!p.effectiveTo || p.effectiveTo >= today));

export interface Blocker {
  code: keyof typeof BLOCK_REASON;
  reason: string;
  detail: string;
}

/**
 * Why a member cannot redeem `points` by `method` right now. Composes Member Management (restrictions,
 * KYC stage, documents) with wallet rules (balance, minimums, GST gate, reserve).
 */
export function redemptionBlockers(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string, method: RedemptionMethod, points: number, today: string): Blocker[] {
  const m = memberById(mem, memberId);
  if (!m) return [{ code: "kyc", reason: "Member not found", detail: memberId }];
  const out: Blocker[] = [];
  const push = (code: keyof typeof BLOCK_REASON, detail: string) => out.push({ code, reason: BLOCK_REASON[code], detail });
  if (m.programme === "DD") push("dd", "FD-11");
  const holds = activeRestrictions(mem, m);
  if (holds.length) push("restriction", holds.map((h) => `${h.id} ${h.type.replace("_", " ")}`).join(", "));
  if (holds.some((h) => h.dedup)) push("duplicate", holds.filter((h) => h.dedup).map((h) => `${h.dedup!.match} match`).join(", "));
  if (m.programme === "Retailer") {
    if (!panVerified(mem, m.id)) push("kyc", "PAN not verified in SFDC");
    if (m.addresses.working && m.addresses.working.verification !== "geo_validated" && m.addresses.working.verification !== "verified") push("geo", `Store address: ${m.addresses.working.verification.replace(/_/g, " ")}`);
  } else if (m.programme !== "DD") {
    if (m.status !== "redemption_enabled") {
      const gaps = redemptionGaps(mem, m).map((g) => g.type);
      push("kyc", gaps.length ? `Stage 2 pending: ${gaps.join(", ")}` : `Status ${m.status.replace(/_/g, " ")}`);
    }
  }
  if (method === "dbt" && !docOk(mem, m.id, "bank")) push("bank", "Bank account not verified");
  if (method === "upi" && !docOk(mem, m.id, "upi")) push("upi", "UPI ID not verified");
  const b = memberBalances(ws, ss, mem, memberId);
  const v = ws.config.pointValueInr;
  if (points > b.available) push("balance", `${points.toLocaleString("en-IN")} requested, ${b.available.toLocaleString("en-IN")} available`);
  const pol = activePolicy(ws, m.programme, method, today);
  const minPts = pol?.minTotalPoints;
  if (minPts && minPts.value != null && minPts.unit === "points" && b.available < minPts.value) push("minimum", `Minimum ${minPts.value.toLocaleString("en-IN")} points to redeem (${minPts.status === "sow_value" ? "SOW value" : "configured"})`);
  const minInr = pol?.minRedemptionInr;
  if (minInr && minInr.value != null && points * v < minInr.value) push("minimum", `Minimum redemption ₹${minInr.value} (SOW 5.3)`);
  if (m.programme === "Retailer") {
    const g = gstGate(ws, ss, mem, memberId, today);
    if (g.status === "gated" && points * v > g.eligibleBaseInr) push("gst", `Eligible ₹${g.eligibleBaseInr.toLocaleString("en-IN")} without verified GSTIN`);
    const r = reserveFor(ws, memberId, m.programme);
    if (r.applies && points * v > redeemableAfterReserve(b.available * v, r.reserveInr)) push("reserve", `Reserve ₹${r.reserveInr.toLocaleString("en-IN")}; redeemable ₹${redeemableAfterReserve(b.available * v, r.reserveInr).toLocaleString("en-IN")}`);
  }
  return out;
}

export interface LimitResult {
  manualValidation: boolean;
  reasons: string[];
  notEnforced: string[];
  monthTotalInr: number;
}

/** SOW 5.3: single DBT/UPI ≤ ₹10,000 and monthly combined ≤ ₹30,000, else manual validation by the call centre. */
export function limitCheck(ws: WalletState, programme: ProgrammeCode, memberId: string, method: RedemptionMethod, amountInr: number, at: string, excludeId?: string): LimitResult {
  const pol = activePolicy(ws, programme, method, at.slice(0, 10));
  const res: LimitResult = { manualValidation: false, reasons: [], notEnforced: [], monthTotalInr: 0 };
  if (!pol) return res;
  const month = at.slice(0, 7);
  const dbtUpi = (x: RedemptionMethod) => x === "dbt" || x === "upi";
  res.monthTotalInr = ws.redemptions.filter((r) => r.id !== excludeId && r.memberId === memberId && dbtUpi(r.method) && r.createdAt.slice(0, 7) === month && !["failed", "reversed", "cancelled", "blocked"].includes(r.stage)).reduce((n, r) => n + r.grossInr, 0);
  if (dbtUpi(method)) {
    const single = pol.singleRedemptionInr;
    if (single.value != null && amountInr > single.value) {
      res.manualValidation = true;
      res.reasons.push(`Single redemption ₹${amountInr.toLocaleString("en-IN")} is above ₹${single.value.toLocaleString("en-IN")}`);
    }
    const monthly = pol.monthlyValueInr;
    if (monthly.value != null && res.monthTotalInr + amountInr > monthly.value) {
      res.manualValidation = true;
      res.reasons.push(`Monthly DBT/UPI total would be ₹${(res.monthTotalInr + amountInr).toLocaleString("en-IN")}, above ₹${monthly.value.toLocaleString("en-IN")}`);
    }
  }
  for (const [k, label] of [["dailyValueInr", "Daily value limit"], ["dailyCount", "Daily count limit"], ["monthlyCount", "Monthly count limit"]] as const) {
    if (pol[k].status === "business_confirmation_required") res.notEnforced.push(`${label}: business confirmation required (OP-08), not enforced`);
  }
  return res;
}

/* ======================= Validation of Maker requests ======================= */

export interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
const check = (errors: string[], warnings: string[] = []): Check => ({ ok: errors.length === 0, errors, warnings });

export interface AdjustmentInput {
  memberId: string;
  programme: string;
  direction: "add" | "deduct";
  category: "base" | "scheme";
  points: number;
  reasonCode: string;
  remarks: string;
  approvalCode: string;
}

export function validateAdjustment(ws: WalletState, ss: SchemeState, mem: MemberState, i: AdjustmentInput, validReasons: string[]): Check {
  const errors: string[] = [];
  const warnings: string[] = [];
  const m = memberById(mem, i.memberId.trim());
  if (!m) errors.push(`Member ${i.memberId || "(blank)"} not found`);
  else if (m.programme !== i.programme) errors.push(`Member ${m.id} belongs to ${m.programme}, not ${i.programme}`);
  else if (!ws.wallets.some((w) => w.memberId === m.id && w.status === "active")) errors.push(`${m.id} has no active wallet`);
  if (!["add", "deduct"].includes(i.direction)) errors.push("Adjustment type must be Add or Deduct");
  if (!["base", "scheme"].includes(i.category)) errors.push("Points category must be Base Points or Scheme Points");
  if (!Number.isInteger(i.points) || i.points <= 0) errors.push("Adjustment value must be a whole number of points above zero");
  if (!validReasons.includes(i.reasonCode)) errors.push("Choose a valid reason code");
  if (!i.remarks.trim()) errors.push("Remarks are compulsory");
  if (!i.approvalCode.trim()) errors.push("Approval code / reference is compulsory");
  if (m && i.direction === "deduct" && Number.isInteger(i.points) && i.points > 0) {
    const b = memberBalances(ws, ss, mem, m.id);
    const have = i.category === "base" ? b.available : b.scheme;
    if (i.points > have) errors.push(`Deduction of ${i.points.toLocaleString("en-IN")} would make the ${i.category === "base" ? "available" : "scheme"} balance negative (${have.toLocaleString("en-IN")} now)`);
    else warnings.push("The wallet service re-validates the balance when the approved adjustment executes");
  }
  return check(errors, warnings);
}

export const CSV_HEADER = ["member_id", "programme", "points_category", "adjustment_type", "points", "reason_code", "remarks"];

/** Minimal CSV parser (quoted fields, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Validates a bulk adjustment CSV. Rows are never silently dropped: every row has a result. */
export function validateBatch(ws: WalletState, ss: SchemeState, mem: MemberState, text: string, validReasons: string[]): { headerOk: boolean; headerError: string | null; rows: BatchRow[] } {
  const all = parseCsv(text);
  if (!all.length) return { headerOk: false, headerError: "The file is empty", rows: [] };
  const header = all[0].map((h) => h.trim().toLowerCase());
  if (CSV_HEADER.some((h, i) => header[i] !== h)) return { headerOk: false, headerError: `Header must be: ${CSV_HEADER.join(",")}`, rows: [] };
  const seen = new Map<string, number>();
  // Deductions draw on the same balance; keep a running view so two rows cannot both spend it.
  const spent = new Map<string, number>();
  const rows: BatchRow[] = all.slice(1).map((cells, idx) => {
    const [memberId = "", programme = "", category = "", direction = "", points = "", reasonCode = "", remarks = ""] = cells.map((c) => c.trim());
    const rowNo = idx + 2;
    const key = [memberId, programme, category, direction, points, reasonCode].join("|").toLowerCase();
    const dup = seen.get(key) ?? null;
    if (dup == null) seen.set(key, rowNo);
    const n = Number(points);
    const cat = category.toLowerCase() === "base" ? "base" : category.toLowerCase() === "scheme" ? "scheme" : (category as "base");
    const dir = direction.toLowerCase() === "add" ? "add" : direction.toLowerCase() === "deduct" ? "deduct" : (direction as "add");
    const v = validateAdjustment(ws, ss, mem, { memberId, programme, category: cat, direction: dir, points: n, reasonCode, remarks, approvalCode: "BATCH" }, validReasons);
    const errors = [...v.errors];
    if (!["base", "scheme"].includes(category.toLowerCase())) errors.push("points_category must be base or scheme");
    if (!["add", "deduct"].includes(direction.toLowerCase())) errors.push("adjustment_type must be add or deduct");
    if (dup == null && !errors.length && dir === "deduct") {
      const k = `${memberId}|${cat}`;
      const b = memberBalances(ws, ss, mem, memberId);
      const have = (cat === "base" ? b.available : b.scheme) - (spent.get(k) ?? 0);
      if (n > have) errors.push(`Together with earlier rows this deduction would make the balance negative (${have} left)`);
      else spent.set(k, (spent.get(k) ?? 0) + n);
    }
    return { row: rowNo, memberId, programme, category, direction, points, reasonCode, remarks, errors: Array.from(new Set(errors)), duplicateOf: dup, result: dup != null ? "duplicate" : errors.length ? "invalid" : "valid", ledgerIds: [], message: dup != null ? `Duplicate of row ${dup}` : errors.join("; ") };
  });
  return { headerOk: true, headerError: null, rows };
}

export function validateReversal(ws: WalletState, ss: SchemeState, mem: MemberState, i: { originalLedgerId: string; points: number; reasonCode: string; comment: string; evidence: string[] }): Check & { original?: LedgerEntry } {
  const lines = fullLedger(ws, ss, mem);
  const o = lines.find((l) => l.id === i.originalLedgerId.trim());
  const errors: string[] = [];
  if (!o) return { ...check([`Original transaction ${i.originalLedgerId || "(blank)"} not found in the ledger`]), original: undefined };
  const reversible = ["scan_credit", "base_credit", "scheme_accrual", "welcome_bonus", "other_bonus", "manual_add", "transfer_credit"];
  if (!reversible.includes(o.type) || o.points <= 0) errors.push(`${o.id} is a ${LEDGER_TYPE[o.type].label.toLowerCase()} and cannot be reversed here`);
  if (o.status !== "completed") errors.push(`${o.id} is ${o.status}`);
  const reversedPts = lines.filter((l) => l.originalId === o.id && l.status === "completed").reduce((n, l) => n - l.points, 0);
  if (ws.reversals.some((r) => r.originalLedgerId === o.id && ["pending_approval", "approved", "executing"].includes(r.status))) errors.push(`A reversal of ${o.id} is already awaiting approval or execution`);
  if (!Number.isInteger(i.points) || i.points <= 0) errors.push("Reversal points must be a whole number above zero");
  else if (i.points > o.points - reversedPts) errors.push(`At most ${(o.points - reversedPts).toLocaleString("en-IN")} points of ${o.id} remain to reverse`);
  if (!i.reasonCode) errors.push("Choose a reversal reason");
  if (!i.comment.trim()) errors.push("A comment is compulsory");
  if (o.type === "scheme_accrual") errors.push("Scheme / milestone reversals follow the Phase 6 scheme reversal process; the correction amount is not confirmed (SCH-Q7)");
  const warnings = o.bucket === "available" && i.points > memberBalances(ws, ss, mem, o.memberId).available ? ["The member's available balance is below the reversal amount. Execution will fail rather than make the balance negative"] : [];
  return { ...check(errors, warnings), original: o };
}

export function validateTransfer(ws: WalletState, ss: SchemeState, mem: MemberState, i: { fromMemberId: string; toMemberId: string; points: number; reasonCode: string; comment: string; evidence: string[] }, excludeId?: string): Check {
  const errors: string[] = [];
  const a = memberById(mem, i.fromMemberId.trim());
  const b = memberById(mem, i.toMemberId.trim());
  if (!a) errors.push(`Source member ${i.fromMemberId || "(blank)"} not found`);
  if (!b) errors.push(`Destination member ${i.toMemberId || "(blank)"} not found`);
  if (a && b && a.id === b.id) errors.push("Source and destination must be different members");
  if (a && b && a.programme !== b.programme) errors.push(`Transfers are only allowed within the same programme (${a.programme} → ${b.programme})`);
  for (const m of [a, b].filter(Boolean) as Member[]) {
    if (!ws.wallets.some((w) => w.memberId === m.id && w.status === "active")) errors.push(`${m.id} has no active wallet`);
    if (activeRestrictions(mem, m).length) errors.push(`${m.id} is under a restriction; transfers are not allowed (transfer policy)`);
  }
  if (!Number.isInteger(i.points) || i.points <= 0) errors.push("Points to transfer must be a whole number above zero");
  else if (a) {
    const have = memberBalances(ws, ss, mem, a.id).available;
    if (i.points > have) errors.push(`Source has ${have.toLocaleString("en-IN")} available points; the balance cannot go negative`);
  }
  if (!i.reasonCode) errors.push("Choose a transfer reason");
  if (!i.comment.trim()) errors.push("A comment is compulsory");
  if (!i.evidence.length) errors.push("Attach supporting evidence (for example the QR image)");
  if (a && b && ws.transfers.some((t: PointsTransfer) => t.id !== excludeId && t.fromMemberId === a.id && t.toMemberId === b.id && t.points === i.points && ["pending_approval", "approved", "executing"].includes(t.status))) errors.push("A transfer with the same members and points is already open (duplicate)");
  return check(errors);
}

/* ======================= Cancellation, auto-reversal and FY reconciliation ======================= */

export function cancellationEligibility(ws: WalletState, red: RedemptionRequest): { ok: boolean; checks: { label: string; ok: boolean; detail: string }[] } {
  const payout = ws.payouts.find((p) => p.redemptionId === red.id);
  const checks = [
    { label: "Redemption found", ok: true, detail: red.id },
    { label: "Not already cancelled or reversed", ok: !["cancelled", "reversed", "cancellation_pending"].includes(red.stage), detail: red.stage },
    { label: "Money not paid out", ok: !(payout?.status === "success" || red.stage === "paid"), detail: payout ? `Payout ${payout.status}${payout.utr ? `, UTR ${payout.utr}` : ""}` : "No payout record" },
    { label: "Not fulfilled or delivered", ok: !(red.stage === "delivered" || red.voucher?.delivery === "delivered" || red.product?.delivery === "delivered"), detail: red.voucher ? `Voucher ${red.voucher.delivery}` : red.product ? `Product ${red.product.delivery}` : "Not a voucher or product" },
    { label: "Points were deducted", ok: !!red.debitLedgerId, detail: red.debitLedgerId ?? "No debit line: nothing to refund" },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

export function autoReversalStatus(ws: WalletState, red: RedemptionRequest, now: string) {
  if (red.stage !== "failed" && red.stage !== "reversal_pending") return { eligible: false, detail: "Only failed redemptions are auto-reversed" };
  if (red.reversalLedgerId) return { eligible: false, detail: `Already reversed by ${red.reversalLedgerId}` };
  const w = ws.config.autoReversal.windowHours;
  if (w == null) return { eligible: false, detail: "Reversal window not configured (FD-05): waiting for business confirmation" };
  const failedAt = ws.payouts.find((p) => p.redemptionId === red.id)?.callbacks.find((c) => c.status === "failed")?.at ?? red.updatedAt;
  const due = new Date(new Date(failedAt).getTime() + w * 3600000).toISOString().slice(0, 16);
  return { eligible: true, detail: now >= due ? `Window of ${w} h passed at ${due}` : `Due by ${due} (${w} h window)` };
}

export function fyAssessment(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string, fyLabel: string) {
  const lines = linesOf(fullLedger(ws, ss, mem), memberId).filter((l) => fy(l.at) === fyLabel);
  const kittyPoints = lines.filter((l) => l.bucket === "tds_kitty").reduce((n, l) => n + l.points, 0);
  const deducted = lines.filter((l) => l.type === "tds_kitty_deduction").reduce((n, l) => n + l.points, 0);
  const earned = lines.filter((l) => LEDGER_TYPE[l.type].earning && l.points > 0).reduce((n, l) => n + (l.gross ?? l.points), 0);
  const v = ws.config.pointValueInr;
  const t = ws.config.ep.fyThresholdInr;
  const above = deducted * v > t;
  return {
    kittyPoints,
    kittyInr: kittyPoints * v,
    deductedInr: deducted * v,
    earnedInr: earned * v,
    thresholdInr: t,
    outcome: above ? ("tds_paid_bcr" as const) : ("refund_kitty" as const),
    calculation: above ? ("business_confirmation_required" as const) : ("ready" as const),
    detail: above ? `TDS deducted ₹${(deducted * v).toLocaleString("en-IN")} exceeds ₹${t.toLocaleString("en-IN")}: tax at the applicable slab, moved to TDS Paid. Slab not confirmed (OP-TDS1): TDS calculation, business confirmation required` : `TDS deducted ₹${(deducted * v).toLocaleString("en-IN")} does not exceed ₹${t.toLocaleString("en-IN")}: Kitty credited back to the wallet`,
  };
}

/* ======================= Reconciliation (computed, never auto-corrected) ======================= */

export interface ReconRow {
  id: string;
  type: ReconType;
  period: string;
  ref: string;
  memberId: string | null;
  expected: number;
  actual: number;
  difference: number;
  status: "matched" | "difference";
  exception: string;
}

export function reconcile(ws: WalletState, ss: SchemeState, mem: MemberState, approvals: ApprovalRequest[], period: string): ReconRow[] {
  const lines = fullLedger(ws, ss, mem);
  const rows: ReconRow[] = [];
  const add = (type: ReconType, ref: string, memberId: string | null, expected: number, actual: number, exception: string) => rows.push({ id: `REC-${type}-${ref}`, type, period, ref, memberId, expected, actual, difference: actual - expected, status: expected === actual ? "matched" : "difference", exception: expected === actual ? "" : exception });
  // 1 Wallet snapshot vs ledger
  for (const snap of Object.values(ws.snapshots)) add("wallet_ledger", snap.memberId, snap.memberId, balancesFrom(linesOf(lines, snap.memberId)).available, snap.balances.available, "Snapshot differs from the ledger (balance changed since retrieval or a posting is missing)");
  // 2 Redemption vs payout, 3 payout vs UTR
  for (const r of ws.redemptions.filter((x) => (x.method === "dbt" || x.method === "upi") && !["blocked", "manual_validation", "mail_approval", "cancelled"].includes(x.stage))) {
    const p = ws.payouts.find((x) => x.redemptionId === r.id);
    add("redemption_payout", r.id, r.memberId, r.netInr ?? r.grossInr, p ? p.amountInr : 0, p ? "Payout amount differs from the redemption" : "No payout record for the redemption");
    if (p && p.status === "success") add("payout_utr", p.id, r.memberId, 1, p.utr && p.reconciliation !== "unmatched_external" ? 1 : 0, !p.utr ? "Missing UTR" : "UTR not matched to the bank statement");
  }
  // 4 Adjustment vs approval
  for (const l of lines.filter((x) => (x.type === "manual_add" || x.type === "manual_deduct") && x.origin !== "scheme_module")) {
    const req = approvals.find((a) => a.id === l.approvalRequestId);
    add("adjustment_approval", l.id, l.memberId, 1, req && req.status === "approved" ? 1 : 0, req ? `Approval ${req.id} is ${req.status}` : "Posted without an approval reference");
  }
  // 5 Transfer pairs
  const trf = new Map<string, number>();
  for (const l of lines.filter((x) => x.type === "transfer_debit" || x.type === "transfer_credit")) trf.set(l.ref, (trf.get(l.ref) ?? 0) + l.points);
  for (const [ref, sum] of trf) add("transfer_pair", ref, null, 0, sum, "Debit and credit do not net to zero (one-sided transfer)");
  // 6 Settlement vs ledger release
  for (const rel of ss.releases) {
    const posted = lines.filter((l) => l.type === "settlement_release" && l.bucket === "available" && l.settlementRef === rel.requestId).reduce((n, l) => n + l.points, 0);
    add("settlement_release", rel.requestId, null, rel.releasedPoints, posted, "Released points differ from the release lines (a later release on the same accruals is reported cumulatively)");
  }
  // 7 Kitty vs FY reconciliation, 8 TDS deducted vs paid
  for (const r of ws.tdsFy) {
    const kitty = balancesFrom(linesOf(lines, r.memberId).filter((l) => fy(l.at) === r.fy)).tdsKitty;
    add("kitty_fy", r.id, r.memberId, r.kittyPoints, r.status === "completed" ? 0 : kitty, r.status === "completed" ? "Kitty still holds points after a completed reconciliation" : "Kitty changed after the reconciliation record was created");
    if (r.outcome === "tds_paid_bcr") add("tds_paid", r.id, r.memberId, r.kittyPoints, lines.filter((l) => l.memberId === r.memberId && l.type === "tds_paid" && l.bucket === "tds_paid").reduce((n, l) => n + l.points, 0), "Above-threshold outcome not moved to TDS Paid (slab pending OP-TDS1)");
  }
  // 9 Failed redemption vs reversal
  for (const r of ws.redemptions.filter((x) => x.stage === "failed" || x.stage === "reversal_pending" || (x.stage === "reversed" && x.track === "fail"))) add("failed_redemption_reversal", r.id, r.memberId, r.debitLedgerId ? r.points : 0, r.reversalLedgerId ? r.points : 0, "Failed redemption not yet reversed");
  // 10 EMI burn vs external reference
  for (const e of ws.emi) add("emi_reference", e.id, e.memberId, 1, e.financingRef && e.reconciliation === "matched" ? 1 : 0, e.financingRef ? "Financing reference not matched" : "No external financing reference");
  return rows;
}

export const RECON_LABEL = RECON_TYPE;

/* ======================= Approval request fields ======================= */

export const tdsModelOf = (p: ProgrammeCode) => TDS_MODEL[p];
