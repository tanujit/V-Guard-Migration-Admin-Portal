/**
 * Approval request specifications for wallet operations. Used by the wallet store when a Maker
 * submits, and by the precomputed approval scenario steps for the seeded requests, so both raise
 * identical requests. The Checker sees the original transaction, balances, reason and evidence.
 */
import { geoOfMember, memberById, type MemberState } from "@/features/members/engine";
import type { Attachment, FieldChange, ImpactSummary, RequestLocation } from "@/types/approval";
import type { AdjustmentBatch, GiftRedemption, GstOverrideRequest, LedgerEntry, PointsAdjustment, PointsReversal, PointsTransfer, RedemptionCancellation, RedemptionLimitPolicy, RedemptionRequest, RetailerReserve, TdsFyReconciliation, WalletBalances } from "@/types/wallet";

export interface WalletSpec {
  type: string;
  title: string;
  entity: string;
  programme: string | null;
  location: RequestLocation | null;
  amount: number | null;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
  attachments: Attachment[];
  impact: ImpactSummary | null;
}

const f = (key: string, label: string, kind: FieldChange["kind"], before: string | number | null, after: string | number | null, material = false): FieldChange => ({ key, label, kind, before, after, material });
const loc = (mem: MemberState, memberId: string): RequestLocation | null => {
  const m = memberById(mem, memberId);
  return m ? geoOfMember(m) : null;
};
const att = (names: string[], by: string, at: string): Attachment[] => names.map((n, i) => ({ id: `ATT-W-${by.slice(4)}-${at.replace(/\D/g, "").slice(-6)}-${i + 1}`, name: n, type: n.split(".").pop()!.toUpperCase(), sizeKb: 120 + i * 40, uploadedBy: by, uploadedAt: at, restricted: true }));

export function adjustmentSpec(mem: MemberState, a: PointsAdjustment, b: WalletBalances): WalletSpec {
  const bucket = a.category === "base" ? b.available : b.scheme;
  const after = a.direction === "add" ? bucket + a.points : bucket - a.points;
  return {
    type: "points_adjustment",
    title: `${a.direction === "add" ? "Add" : "Deduct"} ${a.points.toLocaleString("en-IN")} ${a.category} points · ${a.memberId}`,
    entity: a.id,
    programme: a.programme,
    location: loc(mem, a.memberId),
    amount: a.direction === "add" ? a.points : -a.points,
    fields: [f("member", "Member", "text", a.memberId, a.memberId), f("bucket", a.category === "base" ? "Available points" : "Scheme points", "points", bucket, after, true), f("adjustment", "Adjustment", "points", 0, a.direction === "add" ? a.points : -a.points, true), f("reasonCode", "Reason code", "text", null, a.reasonCode), f("approvalCode", "Approval code / reference", "text", null, a.approvalCode)],
    purpose: `Manual ${a.category} points ${a.direction === "add" ? "addition" : "deduction"} (SOW 10.5 AF04)`,
    reason: a.remarks,
    justification: `Wallet balance shown is the Maker's view; the wallet service re-validates at execution. Idempotency key ${a.opKey}`,
    attachments: [],
    impact: { affectedMembers: 1, pointsImpact: a.direction === "add" ? a.points : -a.points, affectedProgrammes: [a.programme] },
  };
}

export function batchSpec(b: AdjustmentBatch): WalletSpec {
  const valid = b.rows.filter((r) => r.result === "valid");
  const add = valid.filter((r) => r.direction.toLowerCase() === "add").reduce((n, r) => n + Number(r.points), 0);
  const ded = valid.filter((r) => r.direction.toLowerCase() === "deduct").reduce((n, r) => n + Number(r.points), 0);
  const progs = Array.from(new Set(valid.map((r) => r.programme)));
  return {
    type: "points_adjustment_bulk",
    title: `Bulk points adjustment ${b.id} · ${valid.length} rows`,
    entity: b.id,
    programme: progs.length === 1 ? progs[0] : progs.join(" + "),
    location: null,
    amount: add - ded,
    fields: [f("file", "File", "text", null, b.fileName), f("rows", "Valid rows to process", "number", null, valid.length, true), f("excluded", "Rows excluded (invalid or duplicate)", "number", null, b.rows.length - valid.length), f("added", "Points added", "points", 0, add, true), f("deducted", "Points deducted", "points", 0, ded, true), f("policy", "Batch policy", "text", null, b.policy === "atomic" ? "Atomic: all rows or none" : "Row-level")],
    purpose: "Bulk CSV points adjustment (SOW 10.5 AF04)",
    reason: b.remarks,
    justification: `Approval code ${b.approvalCode}. Batch approval does not prove each row executed: row results are recorded at execution`,
    attachments: [],
    impact: { affectedMembers: new Set(valid.map((r) => r.memberId)).size, pointsImpact: add - ded },
  };
}

export function reversalSpec(mem: MemberState, r: PointsReversal, o: LedgerEntry, b: WalletBalances): WalletSpec {
  const bal = o.bucket === "scheme_unsettled" ? b.scheme : b.available;
  return {
    type: r.type === "sales_return" ? "sales_return_adjustment" : "points_reversal",
    title: `Reverse ${r.points} points · ${r.type.replace(/_/g, " ")} · ${r.memberId}`,
    entity: r.id,
    programme: r.programme,
    location: loc(mem, r.memberId),
    amount: -r.points,
    fields: [f("member", "Member", "text", r.memberId, r.memberId), f("original", "Original transaction", "text", null, `${o.id} · ${o.ref} · ${o.at.slice(0, 10)}`), f("originalPoints", "Original credited points", "points", null, r.originalPoints), f("points", "Proposed reversal", "points", 0, -r.points, true), f("bucket", o.bucket === "scheme_unsettled" ? "Scheme points (remaining)" : "Available points (remaining)", "points", bal, bal - r.points, true), f("reason", "Reason", "text", null, r.reasonCode)],
    purpose: "Negative points reversal linked to the original transaction (SOW 10.5)",
    reason: r.comment,
    justification: `Evidence: ${r.evidence.join(", ") || "none"}. The original credit is preserved; a new reversal line references it`,
    attachments: att(r.evidence, r.createdBy, r.createdAt),
    impact: { affectedMembers: 1, pointsImpact: -r.points },
  };
}

export function transferSpec(mem: MemberState, t: PointsTransfer, src: WalletBalances, dst: WalletBalances): WalletSpec {
  return {
    type: "points_transfer",
    title: `Transfer ${t.points.toLocaleString("en-IN")} points · ${t.fromMemberId} → ${t.toMemberId}`,
    entity: t.id,
    programme: t.programme,
    location: loc(mem, t.fromMemberId),
    amount: t.points,
    fields: [f("from", "From member", "text", null, t.fromMemberId), f("to", "To member", "text", null, t.toMemberId), f("points", "Points", "points", 0, t.points, true), f("fromBalance", "Source available", "points", src.available, src.available - t.points, true), f("toBalance", "Destination available", "points", dst.available, dst.available + t.points, true), f("reason", "Reason", "text", null, t.reasonCode)],
    purpose: "Member-to-member transfer for dispute resolution (SOW 10.5)",
    reason: t.comment,
    justification: `Debit and credit post together under ${t.id}. Evidence: ${t.evidence.join(", ")}`,
    attachments: att(t.evidence, t.createdBy, t.createdAt),
    impact: { affectedMembers: 2, pointsImpact: 0 },
  };
}

export function cancellationSpec(mem: MemberState, c: RedemptionCancellation, red: RedemptionRequest): WalletSpec {
  return {
    type: "redemption_cancellation",
    title: `Cancel redemption ${red.id} · ${red.memberId}`,
    entity: c.id,
    programme: red.programme,
    location: loc(mem, red.memberId),
    amount: red.points,
    fields: [f("redemption", "Redemption", "text", red.id, red.id), f("status", "Redemption status", "status", red.stage, "cancelled", true), f("points", "Points to return", "points", 0, red.points, true), f("value", "Value", "currency", red.grossInr, 0, true)],
    purpose: "Redemption cancellation (Evolve Operations only, SOW 10.5)",
    reason: c.reason,
    justification: c.eligibility.checks.map((x) => `${x.ok ? "✓" : "✗"} ${x.label}: ${x.detail}`).join("; "),
    attachments: [],
    impact: { affectedMembers: 1, pointsImpact: red.points },
  };
}

export function gstOverrideSpec(mem: MemberState, o: GstOverrideRequest): WalletSpec {
  return {
    type: "gst_override",
    title: `GST gate override · ${o.memberId}`,
    entity: o.id,
    programme: "Retailer",
    location: loc(mem, o.memberId),
    amount: null,
    fields: [f("member", "Retailer", "text", o.memberId, o.memberId), f("gst", "GSTIN verification", "status", o.gstStatus, o.gstStatus), f("gate", "GST gate", "status", o.currentGate, o.requested === "unlock_until" ? `Unlocked until ${o.until}` : "Unlocked until GSTIN verified", true), f("reason", "Reason code", "text", null, o.reasonCode)],
    purpose: "Administrative GST unlock for an exceptional case (SOW 5.5). Does not verify the GSTIN",
    reason: o.remarks,
    justification: `Evidence: ${o.evidence.join(", ") || "none"}`,
    attachments: att(o.evidence, o.createdBy, o.createdAt),
    impact: { affectedMembers: 1 },
  };
}

export function fyRefundSpec(mem: MemberState, r: TdsFyReconciliation): WalletSpec {
  return {
    type: "tds_fy_reconciliation",
    title: `${r.fy} TDS Kitty reconciliation · ${r.memberId}`,
    entity: r.id,
    programme: "EP",
    location: loc(mem, r.memberId),
    amount: r.kittyPoints,
    fields: [f("member", "Member", "text", r.memberId, r.memberId), f("kitty", "TDS Kitty", "points", r.kittyPoints, r.outcome === "refund_kitty" ? 0 : r.kittyPoints, true), f("threshold", "FY threshold", "currency", null, r.thresholdInr), f("outcome", "Outcome", "text", null, r.outcome === "refund_kitty" ? "Credit Kitty back to the wallet" : "TDS Paid at slab (business confirmation required)", true)],
    purpose: "EP/IMP financial-year TDS Kitty reconciliation (SOW 5.4.1)",
    reason: `Kitty ₹${r.kittyInr.toLocaleString("en-IN")} assessed against ₹${r.thresholdInr.toLocaleString("en-IN")}`,
    justification: "Computation by the TDS reconciliation service (mock). Above-threshold slab is not configured (OP-TDS1)",
    attachments: [],
    impact: { affectedMembers: 1, pointsImpact: r.kittyPoints },
  };
}

export function giftSpec(mem: MemberState, g: GiftRedemption): WalletSpec {
  const pts = g.foc ? 0 : g.quantity * g.pointsPerUnit;
  return {
    type: "gift_redemption",
    title: `${g.foc ? "FOC gift" : "Gift redemption"} ${g.item} × ${g.quantity} · ${g.memberId}`,
    entity: g.id,
    programme: g.programme,
    location: loc(mem, g.memberId),
    amount: -pts,
    fields: [f("member", "Member", "text", g.memberId, g.memberId), f("item", "Gift", "text", null, `${g.item} (${g.catalogueRef})`), f("qty", "Quantity", "number", null, g.quantity), f("points", "Points deducted", "points", 0, -pts, true), f("foc", "Free of cost", "text", null, g.foc ? "Yes" : "No", true)],
    purpose: "Backend gift redemption on behalf of a member (SOW 10.5 AF03)",
    reason: `${g.reason}: ${g.remarks}`,
    justification: g.evidence.length ? `Evidence: ${g.evidence.join(", ")}` : "",
    attachments: att(g.evidence, g.createdBy, g.createdAt),
    impact: { affectedMembers: 1, pointsImpact: -pts },
  };
}

export function limitSpec(p: RedemptionLimitPolicy, prev: RedemptionLimitPolicy | undefined): WalletSpec {
  const v = (x: RedemptionLimitPolicy | undefined, k: keyof Pick<RedemptionLimitPolicy, "minTotalPoints" | "minBalance" | "minRedemptionInr" | "singleRedemptionInr" | "dailyValueInr" | "monthlyValueInr" | "dailyCount" | "monthlyCount">) => (x ? (x[k].value ?? "Not confirmed") : null);
  const keys = ["minTotalPoints", "minBalance", "minRedemptionInr", "singleRedemptionInr", "dailyValueInr", "monthlyValueInr", "dailyCount", "monthlyCount"] as const;
  return {
    type: "redemption_limit_change",
    title: `Redemption limit policy ${p.id} v${p.version} · ${p.programmes.join(", ")}`,
    entity: `${p.id} v${p.version}`,
    programme: p.programmes.length === 1 ? p.programmes[0] : p.programmes.join(" + "),
    location: null,
    amount: null,
    fields: keys.map((k) => f(k, k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), "text", v(prev, k), v(p, k), true)),
    purpose: "Redemption limits and minimum balance (SOW 10.5 AF22/AF23)",
    reason: `Effective ${p.effectiveFrom}`,
    justification: "Values marked not confirmed stay unenforced (OP-08)",
    attachments: [],
    impact: { affectedProgrammes: p.programmes, effectiveDate: p.effectiveFrom },
  };
}

export function reserveSpec(mem: MemberState, r: RetailerReserve, current: number): WalletSpec {
  return {
    type: "retailer_reserve_change",
    title: `Retailer TDS reserve ₹${r.reserveInr.toLocaleString("en-IN")} · ${r.memberId ?? "default"}`,
    entity: r.id,
    programme: "Retailer",
    location: r.memberId ? loc(mem, r.memberId) : null,
    amount: null,
    fields: [f("member", "Retailer", "text", r.memberId, r.memberId), f("reserve", "Non-redeemable TDS reserve", "currency", current, r.reserveInr, true), f("effective", "Effective from", "date", null, r.effectiveFrom)],
    purpose: "Retailer-specific minimum TDS reserve for higher gifts (SOW 5.4.2)",
    reason: r.reason,
    justification: "",
    attachments: [],
    impact: { affectedMembers: 1 },
  };
}
