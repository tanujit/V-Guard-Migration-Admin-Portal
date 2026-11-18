/**
 * MOCK WALLET SERVICE — the in-browser stand-in for the backend wallet, ledger, payout, voucher,
 * tax-reconciliation and GST services (development only).
 *
 * Rules this mock enforces, as the real backend must:
 *  - Postings are append-only ledger lines. Nothing edits or deletes an existing line.
 *  - Every operation has an idempotency key; a repeated key posts nothing (duplicate protection).
 *  - Balances are re-validated from the ledger at execution time, never trusted from the screen.
 *  - Linked movements (transfer debit + credit, batch rows under the atomic policy) post together or
 *    not at all.
 *  - If the wallet service is unavailable, nothing posts and the operation can be retried.
 */
import { LEDGER_TYPE } from "@/config/walletCatalogue";
import { memberById, type MemberState } from "@/features/members/engine";
import type { SchemeState } from "@/types/schemes";
import type { FinAuditEvent, FinNotification, LedgerEntry, PointsAdjustment, AdjustmentBatch, PointsReversal, PointsTransfer, RedemptionRequest, WalletState, GiftRedemption, TdsFyReconciliation, GstOverrideRequest } from "@/types/wallet";
import { balancesFrom, fullLedger, linesOf, memberBalances } from "./engine";
import { redemptionTds } from "./tdsAdapter";

export interface SvcResult {
  state: WalletState;
  ok: boolean;
  message: string;
  ledgerIds: string[];
  duplicate?: boolean;
}

type Draft = Omit<LedgerEntry, "id" | "opKey" | "origin">;
const pad = (n: number, w = 6) => String(n).padStart(w, "0");

export function audit(ws: WalletState, e: Omit<FinAuditEvent, "id">): WalletState {
  return { ...ws, audit: [...ws.audit, { ...e, id: `FAE-${pad(ws.audit.length + 1)}` }] };
}
export function notify(ws: WalletState, e: Omit<FinNotification, "id" | "delivery" | "channels"> & { channels?: FinNotification["channels"] }): WalletState {
  return { ...ws, notifications: [...ws.notifications, { channels: ["portal"], ...e, id: `FNT-${pad(ws.notifications.length + 1)}`, delivery: "mock_recorded" }] };
}

/** Appends lines under one idempotency key. A key seen before posts nothing. */
export function post(ws: WalletState, opKey: string, drafts: Draft[]): SvcResult {
  if (ws.ledger.some((l) => l.opKey === `${opKey}#0`)) return { state: ws, ok: true, duplicate: true, ledgerIds: ws.ledger.filter((l) => l.opKey.startsWith(`${opKey}#`)).map((l) => l.id), message: `Operation ${opKey} was already posted; nothing posted twice` };
  let seq = ws.seq;
  const lines: LedgerEntry[] = drafts.map((d, i) => ({ ...d, id: `LED-${pad(++seq)}`, opKey: `${opKey}#${i}`, origin: "mock_service" }));
  return { state: { ...ws, ledger: [...ws.ledger, ...lines], seq }, ok: true, ledgerIds: lines.map((l) => l.id), message: `${lines.length} ledger line(s) posted` };
}

const down = (ws: WalletState): SvcResult | null => (ws.service.mode === "available" ? null : { state: ws, ok: false, ledgerIds: [], message: `Wallet service ${ws.service.mode === "timeout" ? "timed out" : "unavailable"} (simulated). Nothing was posted; retry under the same approval` });

interface ExecCtx {
  ss: SchemeState;
  mem: MemberState;
  now: string;
  requestId: string;
  approvers: string[];
}

const baseDraft = (mem: MemberState, memberId: string, ctx: ExecCtx) => {
  const m = memberById(mem, memberId)!;
  return { memberId, programme: m.programme, branchCode: m.branchCode, at: ctx.now, status: "completed" as const, initiatedBy: "SYSTEM", approvalRequestId: ctx.requestId, approvedBy: ctx.approvers };
};

/* ---------------- Snapshots (SOW 5.1.1) ---------------- */

export function fetchBalance(ws: WalletState, ss: SchemeState, mem: MemberState, memberId: string, now: string): WalletState {
  if (ws.service.mode !== "available") return ws;
  return { ...ws, snapshots: { ...ws.snapshots, [memberId]: { memberId, balances: memberBalances(ws, ss, mem, memberId), retrievedAt: now, reconciledAt: ws.service.lastReconciledAt, source: "live" } } };
}

/* ---------------- Adjustments ---------------- */

function adjustmentDrafts(ws: WalletState, ctx: ExecCtx, a: Pick<PointsAdjustment, "memberId" | "direction" | "category" | "points" | "reasonCode" | "remarks" | "id" | "createdBy">, spent: Map<string, number>): { drafts: Draft[]; error: string | null } {
  const m = memberById(ctx.mem, a.memberId);
  if (!m) return { drafts: [], error: `Member ${a.memberId} not found` };
  if (!ws.wallets.some((w) => w.memberId === m.id && w.status === "active")) return { drafts: [], error: `${m.id} has no active wallet` };
  const bucket = a.category === "base" ? "available" : "scheme_unsettled";
  if (a.direction === "deduct") {
    const b = balancesFrom(linesOf(fullLedger(ws, ctx.ss, ctx.mem), m.id));
    const k = `${m.id}|${bucket}`;
    const have = (bucket === "available" ? b.available : b.scheme) - (spent.get(k) ?? 0);
    if (a.points > have) return { drafts: [], error: `Insufficient ${bucket === "available" ? "available" : "scheme"} points for ${m.id}: ${have} now, ${a.points} to deduct. Negative balances are not allowed` };
    spent.set(k, (spent.get(k) ?? 0) + a.points);
  }
  return {
    error: null,
    drafts: [{ ...baseDraft(ctx.mem, m.id, ctx), ref: a.id, type: a.direction === "add" ? "manual_add" : "manual_deduct", bucket, points: a.direction === "add" ? a.points : -a.points, source: "manual", channel: "manual_adjustment", initiatedBy: a.createdBy, remarks: `${a.reasonCode}: ${a.remarks}` }],
  };
}

export function executeAdjustment(ws: WalletState, a: PointsAdjustment, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  const { drafts, error } = adjustmentDrafts(ws, ctx, a, new Map());
  if (error) return { state: ws, ok: false, ledgerIds: [], message: `Wallet service refused: ${error}. Nothing posted` };
  const r = post(ws, a.opKey, drafts);
  return { ...r, message: r.duplicate ? r.message : `${a.direction === "add" ? "Added" : "Deducted"} ${a.points.toLocaleString("en-IN")} ${a.category} points (${r.ledgerIds.join(", ")})` };
}

/** Atomic policy: every valid row posts or none does. Row-level policy: valid rows post, failures are reported per row. */
export function executeBatch(ws: WalletState, b: AdjustmentBatch, ctx: ExecCtx): SvcResult & { rows: AdjustmentBatch["rows"] } {
  const d = down(ws);
  if (d) return { ...d, rows: b.rows };
  const spent = new Map<string, number>();
  const plan = b.rows.map((row) => {
    if (row.result !== "valid") return { row, drafts: [] as Draft[], error: null as string | null, skip: true };
    const { drafts, error } = adjustmentDrafts(ws, ctx, { id: `${b.id}-R${row.row}`, memberId: row.memberId, direction: row.direction.toLowerCase() as "add" | "deduct", category: row.category.toLowerCase() as "base" | "scheme", points: Number(row.points), reasonCode: row.reasonCode, remarks: row.remarks, createdBy: b.createdBy }, spent);
    return { row, drafts, error, skip: false };
  });
  const failures = plan.filter((p) => !p.skip && p.error);
  if (b.policy === "atomic" && failures.length) {
    return { state: ws, ok: false, ledgerIds: [], message: `Atomic batch refused: ${failures.length} row(s) failed re-validation. No row was posted`, rows: b.rows.map((row) => { const f = failures.find((x) => x.row.row === row.row); return row.result === "valid" ? { ...row, result: "not_executed", message: f ? f.error! : "Not executed: batch refused under the atomic policy" } : row; }) };
  }
  let s = ws;
  const ids: string[] = [];
  const rows = plan.map((p) => {
    if (p.skip) return p.row;
    if (p.error) return { ...p.row, result: "failed" as const, message: p.error };
    const r = post(s, `${b.opKey}|R${p.row.row}`, p.drafts);
    s = r.state;
    ids.push(...r.ledgerIds);
    return { ...p.row, result: "completed" as const, ledgerIds: r.ledgerIds, message: r.duplicate ? "Already posted" : `Posted ${r.ledgerIds.join(", ")}` };
  });
  const done = rows.filter((r) => r.result === "completed").length;
  return { state: s, ok: done > 0 || !rows.some((r) => r.result === "failed"), ledgerIds: ids, message: `${done} row(s) posted, ${rows.filter((r) => r.result === "failed").length} failed, ${rows.filter((r) => r.result === "invalid" || r.result === "duplicate").length} not processed (invalid or duplicate)`, rows };
}

/* ---------------- Reversals ---------------- */

const REVERSAL_LINE = { sales_return: "sales_return_reversal", invalid_claim: "invalid_claim_reversal", wrong_credit: "wrong_credit_reversal" } as const;

export function executeReversal(ws: WalletState, r: PointsReversal, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  const lines = fullLedger(ws, ctx.ss, ctx.mem);
  const o = lines.find((l) => l.id === r.originalLedgerId);
  if (!o) return { state: ws, ok: false, ledgerIds: [], message: `Original ${r.originalLedgerId} not found. Nothing posted` };
  const reversed = lines.filter((l) => l.originalId === o.id && l.status === "completed").reduce((n, l) => n - l.points, 0);
  if (r.points > o.points - reversed) return { state: ws, ok: false, ledgerIds: [], message: `Only ${o.points - reversed} points of ${o.id} remain to reverse. Nothing posted` };
  const have = balancesFrom(linesOf(lines, o.memberId))[o.bucket === "scheme_unsettled" ? "scheme" : "available"];
  if (r.points > have) return { state: ws, ok: false, ledgerIds: [], message: `Insufficient ${o.bucket === "scheme_unsettled" ? "scheme" : "available"} points (${have}). The reversal stays pending recovery; nothing posted and the balance was not made negative` };
  const p = post(ws, r.opKey, [{ ...baseDraft(ctx.mem, o.memberId, ctx), ref: r.id, type: REVERSAL_LINE[r.type], bucket: o.bucket, points: -r.points, source: "reversal", channel: "manual_adjustment", originalId: o.id, initiatedBy: r.createdBy, remarks: `${r.reasonCode}: ${r.comment}`, schemeId: o.schemeId ?? null }]);
  return { ...p, message: p.duplicate ? p.message : `Reversed ${r.points} points of ${o.id} (${p.ledgerIds[0]}). The original credit is preserved` };
}

/* ---------------- Transfers ---------------- */

export function executeTransfer(ws: WalletState, t: PointsTransfer, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  const a = memberById(ctx.mem, t.fromMemberId);
  const b = memberById(ctx.mem, t.toMemberId);
  if (!a || !b) return { state: ws, ok: false, ledgerIds: [], message: "A member no longer exists. Nothing posted" };
  if (a.programme !== b.programme) return { state: ws, ok: false, ledgerIds: [], message: "Members are in different programmes. Nothing posted" };
  const have = memberBalances(ws, ctx.ss, ctx.mem, a.id).available;
  if (t.points > have) return { state: ws, ok: false, ledgerIds: [], message: `Source has ${have} available points; the transfer would make it negative. Nothing posted (neither debit nor credit)` };
  const p = post(ws, t.opKey, [
    { ...baseDraft(ctx.mem, a.id, ctx), ref: t.id, type: "transfer_debit", bucket: "available", points: -t.points, source: "transfer", channel: "manual_adjustment", initiatedBy: t.createdBy, remarks: `To ${b.id}: ${t.comment}` },
    { ...baseDraft(ctx.mem, b.id, ctx), ref: t.id, type: "transfer_credit", bucket: "available", points: t.points, source: "transfer", channel: "manual_adjustment", initiatedBy: t.createdBy, remarks: `From ${a.id}: ${t.comment}` },
  ]);
  return { ...p, message: p.duplicate ? p.message : `Debit ${p.ledgerIds[0]} and credit ${p.ledgerIds[1]} posted together under ${t.id}` };
}

/* ---------------- Redemption: cancellation, payout callbacks, auto-reversal ---------------- */

function reverseRedemption(ws: WalletState, red: RedemptionRequest, ctx: Pick<ExecCtx, "mem" | "now"> & { requestId: string | null; approvers: string[] }, opKey: string, why: string): SvcResult {
  if (!red.debitLedgerId) return { state: ws, ok: false, ledgerIds: [], message: "No redemption debit to reverse" };
  const m = memberById(ctx.mem, red.memberId)!;
  const base = { memberId: m.id, programme: m.programme, branchCode: m.branchCode, at: ctx.now, status: "completed" as const, initiatedBy: "SYSTEM", approvalRequestId: ctx.requestId, approvedBy: ctx.approvers, ref: red.id, type: "redemption_reversal" as const, source: "redemption" as const, channel: "redemption" as const, originalId: red.debitLedgerId, remarks: why };
  return post(ws, opKey, [
    { ...base, bucket: "redeemed", points: -red.points },
    { ...base, bucket: "available", points: red.points },
  ]);
}

export function executeCancellation(ws: WalletState, redemptionId: string, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  const red = ws.redemptions.find((r) => r.id === redemptionId);
  if (!red) return { state: ws, ok: false, ledgerIds: [], message: `Redemption ${redemptionId} not found` };
  const payout = ws.payouts.find((p) => p.redemptionId === red.id);
  if (payout?.status === "success" || red.stage === "paid" || red.stage === "delivered") return { state: ws, ok: false, ledgerIds: [], message: "Payout or fulfilment has completed since the request. Cancellation refused; nothing reversed" };
  const r = reverseRedemption(ws, red, ctx, `CANCEL|${red.id}`, `Redemption cancelled under ${ctx.requestId}`);
  if (!r.ok) return r;
  const s = { ...r.state, redemptions: r.state.redemptions.map((x) => (x.id === red.id ? { ...x, stage: "cancelled" as const, track: "fail" as const, reversalLedgerId: r.ledgerIds[1] ?? x.reversalLedgerId, updatedAt: ctx.now } : x)) };
  return { ...r, state: s, message: r.duplicate ? r.message : `Cancelled; ${red.points} points returned to Available (${r.ledgerIds.join(", ")})` };
}

/** A payout callback. Repeated or late callbacks never post twice (duplicate protection). */
export function payoutCallback(ws: WalletState, payoutId: string, cb: { id: string; status: "success" | "failed"; utr: string | null }, now: string): SvcResult {
  const p = ws.payouts.find((x) => x.id === payoutId);
  if (!p) return { state: ws, ok: false, ledgerIds: [], message: `Payout ${payoutId} not found` };
  const terminal = p.status === "success" || p.status === "failed";
  const dup = p.callbacks.some((c) => c.id === cb.id) || terminal;
  const callbacks = [...p.callbacks, { ...cb, at: now, duplicate: dup }];
  if (dup) {
    const s = { ...ws, payouts: ws.payouts.map((x) => (x.id === p.id ? { ...x, callbacks } : x)) };
    return { state: audit(s, { at: now, actor: "SYSTEM", entity: "payout", entityId: p.id, action: "duplicate_callback_ignored", before: p.status, after: p.status, reason: `Callback ${cb.id} (${cb.status}) ignored: payout already ${p.status}`, approvalRequestId: null }), ok: true, duplicate: true, ledgerIds: [], message: `Duplicate callback ignored: payout already ${p.status}. No points moved` };
  }
  let s: WalletState = { ...ws, payouts: ws.payouts.map((x) => (x.id === p.id ? { ...x, callbacks, status: cb.status, utr: cb.utr ?? x.utr, failureReason: cb.status === "failed" ? "Beneficiary bank rejected the credit (mock)" : null, reconciliation: cb.status === "success" ? (cb.utr ? "matched" : "missing_utr") : "pending" } : x)) };
  s = { ...s, redemptions: s.redemptions.map((r) => (r.id === p.redemptionId ? { ...r, stage: cb.status === "success" ? "paid" : "reversal_pending", track: cb.status === "success" ? "pass" : "fail", utr: cb.utr ?? r.utr, updatedAt: now } : r)) };
  s = notify(s, { at: now, event: cb.status === "success" ? "Payout succeeded" : "Payout failed", ref: p.redemptionId, memberId: s.redemptions.find((r) => r.id === p.redemptionId)?.memberId ?? null, message: `${p.redemptionId}: payout ${cb.status}${cb.utr ? `, UTR ${cb.utr}` : ""}` });
  return { state: s, ok: true, ledgerIds: [], message: cb.status === "success" ? `Payout succeeded${cb.utr ? ` (UTR ${cb.utr})` : " without a UTR: flagged for reconciliation"}` : "Payout failed. Points stay deducted until the configured reversal runs (no window configured: FD-05)" };
}

/** Failed redemption reversal. Needs the configured window, or an explicit manual reversal by an operator. */
export function reverseFailedRedemption(ws: WalletState, redemptionId: string, mem: MemberState, now: string, actor: string, manual: boolean): SvcResult {
  const d = down(ws);
  if (d) return d;
  const red = ws.redemptions.find((r) => r.id === redemptionId);
  if (!red) return { state: ws, ok: false, ledgerIds: [], message: "Redemption not found" };
  if (red.stage !== "failed" && red.stage !== "reversal_pending") return { state: ws, ok: false, ledgerIds: [], message: `Redemption is ${red.stage}; only failed redemptions are reversed here` };
  if (!manual && ws.config.autoReversal.windowHours == null) return { state: ws, ok: false, ledgerIds: [], message: "Automatic reversal window is not configured (FD-05). Nothing reversed" };
  const r = reverseRedemption(ws, red, { mem, now, requestId: null, approvers: [] }, `AUTOREV|${red.id}`, manual ? `Failed redemption reversed by ${actor}` : "Automatic reversal of a failed redemption");
  if (!r.ok) return r;
  const s = { ...r.state, redemptions: r.state.redemptions.map((x) => (x.id === red.id ? { ...x, stage: "reversed" as const, reversalLedgerId: r.ledgerIds[1] ?? x.reversalLedgerId, updatedAt: now } : x)) };
  return { ...r, state: s, message: r.duplicate ? r.message : `${red.points} points returned to Available (${r.ledgerIds.join(", ")}), linked to ${red.debitLedgerId}` };
}

/* ---------------- Gifts ---------------- */

export function executeGift(ws: WalletState, g: GiftRedemption, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  const m = memberById(ctx.mem, g.memberId);
  if (!m) return { state: ws, ok: false, ledgerIds: [], message: "Member not found" };
  const tds = redemptionTds(m.programme);
  if (tds.status === "bcr") return { state: ws, ok: false, ledgerIds: [], message: `Not executed: ${tds.message}` };
  if (g.foc) return { state: ws, ok: true, ledgerIds: [], message: `FOC gift recorded under ${g.id}; no points deducted. Fulfilment handed to the Gift & Fulfilment module (mock)` };
  const pts = g.quantity * g.pointsPerUnit;
  const have = memberBalances(ws, ctx.ss, ctx.mem, m.id).available;
  if (pts > have) return { state: ws, ok: false, ledgerIds: [], message: `Insufficient available points (${have}) for ${pts}. Nothing posted` };
  const base = { ...baseDraft(ctx.mem, m.id, ctx), ref: g.id, type: "redemption_debit" as const, source: "redemption" as const, channel: "redemption" as const, initiatedBy: g.createdBy, remarks: `Backend gift ${g.item} × ${g.quantity}` };
  return post(ws, g.opKey, [
    { ...base, bucket: "available", points: -pts },
    { ...base, bucket: "redeemed", points: pts },
  ]);
}

/* ---------------- TDS FY reconciliation ---------------- */

export function executeFyRefund(ws: WalletState, r: TdsFyReconciliation, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  if (r.outcome !== "refund_kitty" || r.calculation !== "ready") return { state: ws, ok: false, ledgerIds: [], message: "Above-threshold outcome: the TDS slab is not confirmed (OP-TDS1). TDS calculation: business confirmation required. Nothing moved" };
  const kitty = balancesFrom(linesOf(fullLedger(ws, ctx.ss, ctx.mem), r.memberId)).tdsKitty;
  const pts = Math.min(kitty, r.kittyPoints);
  if (pts <= 0) return { state: ws, ok: false, ledgerIds: [], message: "No Kitty balance to refund" };
  const base = { ...baseDraft(ctx.mem, r.memberId, ctx), ref: r.id, type: "tds_kitty_refund" as const, source: "tds" as const, channel: "system" as const, remarks: `${r.fy} reconciliation: TDS within ₹${r.thresholdInr.toLocaleString("en-IN")}, Kitty credited back` };
  return post(ws, `FYREFUND|${r.memberId}|${r.fy}`, [
    { ...base, bucket: "tds_kitty", points: -pts },
    { ...base, bucket: "available", points: pts },
  ]);
}

/* ---------------- GST override ---------------- */

export function executeGstOverride(ws: WalletState, o: GstOverrideRequest, ctx: ExecCtx): SvcResult {
  const d = down(ws);
  if (d) return d;
  const rec = ws.gst.find((g) => g.memberId === o.memberId);
  if (!rec) return { state: ws, ok: false, ledgerIds: [], message: "No GST record for the Retailer" };
  const locked = balancesFrom(linesOf(fullLedger(ws, ctx.ss, ctx.mem), o.memberId)).gstLocked;
  let s: WalletState = ws;
  let ids: string[] = [];
  if (locked > 0) {
    const base = { ...baseDraft(ctx.mem, o.memberId, ctx), ref: o.id, type: "gst_unlock" as const, source: "gst" as const, channel: "system" as const, remarks: `Administrative GST unlock ${o.id}. GSTIN remains ${rec.verification.replace("_", " ")}` };
    const p = post(ws, `GSTUNLOCK|${o.id}`, [
      { ...base, bucket: "gst_locked", points: -locked },
      { ...base, bucket: "available", points: locked },
    ]);
    s = p.state;
    ids = p.ledgerIds;
  }
  s = { ...s, gst: s.gst.map((g) => (g.memberId === o.memberId ? { ...g, override: { requestId: ctx.requestId, approvedAt: ctx.now, until: o.until, reason: o.reasonCode }, updatedAt: ctx.now } : g)) };
  return { state: s, ok: true, ledgerIds: ids, message: `Gate unlocked by override${locked ? `; ${locked} locked points returned to Available` : ""}. Verification status unchanged (${rec.verification.replace("_", " ")})` };
}

export const ledgerLabel = (l: LedgerEntry) => LEDGER_TYPE[l.type].label;
