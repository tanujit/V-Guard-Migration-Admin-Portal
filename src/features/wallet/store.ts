/**
 * WALLET STORE — in-browser mock repository for Wallet, Points, TDS, Redemption and Financial
 * Operations (Phase 7).
 *
 * Nothing here edits a balance. Makers create requests; the central approval engine routes them;
 * registered execution handlers hand approved operations to the MOCK wallet service, which posts
 * append-only ledger lines under an idempotency key and re-validates balances. Approval and execution
 * are recorded separately. Every action re-checks RBAC (module, action, programme, branch) and writes
 * an append-only financial audit event. Notifications are recorded, never sent.
 */
import { useSyncExternalStore } from "react";
import { ADJUSTMENT_REASONS, CANCEL_REASONS, GIFT_CATALOGUE, GIFT_REASONS, GST_OVERRIDE_REASONS, REVERSAL_REASONS, fy as fyOf } from "@/config/walletCatalogue";
import { ORG } from "@/data/mock/rbacSeed";
import { accessStore } from "@/features/access/store";
import { hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { geoOfMember, memberById } from "@/features/members/engine";
import { memberStore } from "@/features/members/store";
import { schemeStore } from "@/features/schemes/store";
import type { ApprovalRequest } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { ProgrammeCode } from "@/types/members";
import type { RedemptionRequest, FinancialException, GiftRedemption, GstOverrideRequest, PointsAdjustment, PointsReversal, PointsTransfer, RedemptionCancellation, RedemptionLimitPolicy, RetailerReserve, ServiceMode, TdsFyReconciliation, WalletState } from "@/types/wallet";
import { cancellationEligibility, fyAssessment, gstGate, memberBalances, redemptionBlockers, parseCsv, validateAdjustment, validateBatch, validateReversal, validateTransfer, type AdjustmentInput, type ReconRow } from "./engine";
import { audit, executeAdjustment, executeBatch, executeCancellation, executeFyRefund, executeGift, executeGstOverride, executeReversal, executeTransfer, fetchBalance, notify, payoutCallback, post, reverseFailedRedemption } from "./mockService";
import { adjustmentSpec, batchSpec, cancellationSpec, fyRefundSpec, giftSpec, gstOverrideSpec, limitSpec, reserveSpec, reversalSpec, transferSpec, type WalletSpec } from "./requests";
import { buildWalletSeed } from "./seed";
import { redemptionTds, scanTdsSplit } from "./tdsAdapter";

const STORAGE_KEY = "vg-rishta.wallet-store.v1";

/** Links seeded records to the approval requests raised for them in the approval seed. */
function linkApprovals(s: WalletState): WalletState {
  const reqs = approvalStore.get().requests;
  const find = (ref: string) => [...reqs].reverse().find((r) => r.entityRef === ref)?.id ?? null;
  const approvers = (id: string | null) => (id ? (reqs.find((r) => r.id === id)?.stages.map((x) => x.decidedBy).filter(Boolean) as string[]) : undefined);
  const link = <T extends { id: string; approvalRequestId: string | null }>(xs: T[]) => xs.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) }));
  const byRef = new Map<string, string | null>();
  const refOf = (ref: string) => {
    if (!byRef.has(ref)) byRef.set(ref, find(ref.replace(/-R\d+$/, "")));
    return byRef.get(ref)!;
  };
  return {
    ...s,
    adjustments: link(s.adjustments),
    batches: link(s.batches),
    reversals: link(s.reversals),
    transfers: link(s.transfers),
    cancellations: link(s.cancellations),
    gstOverrides: link(s.gstOverrides),
    tdsFy: link(s.tdsFy),
    reserves: link(s.reserves),
    gst: s.gst.map((g) => (g.override && !g.override.requestId ? { ...g, override: { ...g.override, requestId: find(s.gstOverrides.find((o) => o.memberId === g.memberId && o.status === "completed")?.id ?? "") ?? "" } } : g)),
    ledger: s.ledger.map((l) => {
      if (l.approvalRequestId || !["manual", "reversal", "transfer", "gst", "tds"].includes(l.source)) return l;
      const id = refOf(l.ref);
      return id ? { ...l, approvalRequestId: id, approvedBy: approvers(id) ?? l.approvedBy } : l;
    }),
  };
}
const build = (): WalletState => linkApprovals(buildWalletSeed());

function load(): WalletState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WalletState;
  } catch {
    /* seed */
  }
  return build();
}
let state: WalletState = load();
const listeners = new Set<() => void>();
function commit(next: WalletState) {
  if (next === state) return;
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const walletStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useWalletState = () => useSyncExternalStore(walletStore.subscribe, walletStore.get, walletStore.get);
export const resetWalletDemoData = () => commit(build());

type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const ss = () => schemeStore.get();
const now = () => demoNow();
const today = () => demoNow().slice(0, 10);
const pad = (n: number) => String(n).padStart(4, "0");
const nextId = (prefix: string, list: { id: string }[]) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-")[1]) || 0), 0) + 1)}`;

/** RBAC for a member-scoped action: module, action, the member's programme and branch. */
function canFor(uid: string, module: string, action: ActionId, memberId?: string) {
  const m = memberId ? memberById(mem(), memberId) : undefined;
  return hasPermission(acc(), uid, module, action, m ? { programme: m.programme, geo: geoOfMember(m) } : {});
}
const label: Record<string, string> = { "points-adjustment": "Points adjustments", "points-reversal": "Sales return & reversals", "points-transfer": "Points transfers", "gst-gate": "Retailer GST gate", tds: "TDS management", "gift-redemption": "Backend gift redemption", "redemption-limits": "Redemption limits & controls", redemption: "Redemption & fulfilment", wallet: "Wallet & points", "fin-reconciliation": "Financial reconciliation", financial: "Financial configuration" };
const need = (module: string, action: string) => `You need ${label[module] ?? module}: ${action[0].toUpperCase()}${action.slice(1)} for this member's programme and branch`;

function raise(uid: string, spec: WalletSpec) {
  const { type, title, entity, programme, location, amount, fields, purpose, reason, justification, attachments, impact } = spec;
  return createRequest(uid, { requestType: type, title, entityRef: entity, programme, location, amount, fields, purpose, reason, justification, attachments, impact }, true);
}
const reqOf = (id: string | null) => (id ? approvalStore.get().requests.find((r) => r.id === id) : undefined);
const approversOf = (r: ApprovalRequest) => r.stages.map((x) => x.decidedBy).filter(Boolean) as string[];
const audited = (s: WalletState, actor: string, entity: string, entityId: string, action: string, after: string | null, reason: string, approvalRequestId: string | null = null, before: string | null = null) => audit(s, { at: now(), actor, entity, entityId, action, before, after, reason, approvalRequestId });

/* ======================= Wallet service simulation (SOW 5.1.1) ======================= */

/** Development control: simulate the wallet service being down, to show last-known balance handling. */
export function setServiceMode(uid: string, mode: ServiceMode): Res {
  if (!hasPermission(acc(), uid, "wallet", "view").allowed) return NO(need("wallet", "view"));
  commit(audited({ ...state, service: { ...state.service, mode } }, uid, "wallet_service", "WALLET-SVC", "simulation_changed", mode, "Development simulation of the wallet balance service"));
  return OK();
}
export function refreshBalance(uid: string, memberId: string): Res {
  if (!canFor(uid, "wallet", "view", memberId).allowed) return NO(need("wallet", "view"));
  if (state.service.mode !== "available") return NO(`Wallet service ${state.service.mode === "timeout" ? "timed out" : "unavailable"} (simulated). The last known balance is kept; nothing was replaced with zero`);
  commit(fetchBalance(state, ss(), mem(), memberId, now()));
  return OK();
}

/* ======================= Manual adjustments (AF04) ======================= */

const REASON_CODES = ADJUSTMENT_REASONS.map((r) => r.code);

export function submitAdjustment(uid: string, i: AdjustmentInput & { evidence?: string[] }): Res {
  const m = memberById(mem(), i.memberId.trim());
  if (!canFor(uid, "points-adjustment", "create", m?.id).allowed || !canFor(uid, "points-adjustment", "submit", m?.id).allowed) return NO(need("points-adjustment", "create and submit"));
  const v = validateAdjustment(state, ss(), mem(), i, REASON_CODES);
  if (!v.ok) return { ...NO(...v.errors) };
  const id = nextId("ADJ", state.adjustments);
  const a: PointsAdjustment = { id, memberId: m!.id, programme: m!.programme, direction: i.direction, category: i.category, points: i.points, reasonCode: i.reasonCode, remarks: i.remarks.trim(), approvalCode: i.approvalCode.trim(), evidence: i.evidence ?? [], batchId: null, opKey: `ADJ|${id}`, status: "pending_approval", approvalRequestId: null, ledgerIds: [], createdBy: uid, createdAt: now(), executedAt: null, failure: null };
  const r = raise(uid, adjustmentSpec(mem(), a, memberBalances(state, ss(), mem(), a.memberId)));
  if (!r.ok) return r;
  let s = { ...state, adjustments: [...state.adjustments, { ...a, approvalRequestId: r.id ?? null }] };
  s = audited(s, uid, "adjustment", id, "submitted", `${a.direction} ${a.points} ${a.category}`, a.remarks, r.id ?? null);
  s = notify(s, { at: now(), event: a.direction === "add" ? "Points manually added" : "Points manually deducted", ref: id, memberId: a.memberId, message: `${id} submitted for approval (${a.direction} ${a.points} ${a.category} points). Not posted until approved and executed` });
  commit(s);
  return OK(id, v.warnings);
}

export function validateBatchFile(uid: string, fileName: string, text: string): Res & { headerError?: string | null } {
  if (!hasPermission(acc(), uid, "points-adjustment", "create").allowed) return NO(need("points-adjustment", "create"));
  const v = validateBatch(state, ss(), mem(), text, REASON_CODES);
  if (!v.headerOk) return { ...NO(v.headerError!), headerError: v.headerError };
  if (!v.rows.length) return NO("The file has a header but no rows");
  const id = nextId("BAT", state.batches);
  const s = audited({ ...state, batches: [...state.batches, { id, fileName, policy: state.config.batchPolicy, rows: v.rows, approvalCode: "", remarks: "", status: "draft", approvalRequestId: null, opKey: `BAT|${id}`, createdBy: uid, createdAt: now(), executedAt: null }] }, uid, "batch", id, "validated", `${v.rows.filter((r) => r.result === "valid").length} valid of ${v.rows.length}`, fileName);
  commit(s);
  return OK(id);
}

export function submitBatch(uid: string, batchId: string, approvalCode: string, remarks: string): Res {
  const b = state.batches.find((x) => x.id === batchId);
  if (!b) return NO("Batch not found");
  if (b.status !== "draft") return NO(`Batch is ${b.status.replace(/_/g, " ")}`);
  const valid = b.rows.filter((r) => r.result === "valid");
  if (valid.some((r) => !canFor(uid, "points-adjustment", "submit", r.memberId).allowed)) return NO("At least one row is outside your Points adjustments: Submit scope (programme / branch)");
  if (!approvalCode.trim()) return NO("Approval code / reference is compulsory");
  if (!remarks.trim()) return NO("Remarks are compulsory");
  if (!valid.length) return NO("No valid rows to submit");
  if (b.policy === "atomic" && valid.length !== b.rows.length) return NO(`Atomic batch policy: ${b.rows.length - valid.length} invalid or duplicate row(s) must be corrected in the file before the batch can be submitted. Invalid rows are never processed silently`);
  const next = { ...b, approvalCode: approvalCode.trim(), remarks: remarks.trim(), status: "pending_approval" as const };
  const r = raise(uid, batchSpec(next));
  if (!r.ok) return r;
  commit(audited({ ...state, batches: state.batches.map((x) => (x.id === b.id ? { ...next, approvalRequestId: r.id ?? null } : x)) }, uid, "batch", b.id, "submitted", `${valid.length} rows`, remarks, r.id ?? null));
  return OK(b.id);
}

/* ======================= Reversals ======================= */

export function submitReversal(uid: string, i: { originalLedgerId: string; points: number; reasonCode: string; comment: string; evidence: string[] }): Res {
  const v = validateReversal(state, ss(), mem(), i);
  if (!v.original) return NO(...v.errors);
  if (!canFor(uid, "points-reversal", "create", v.original.memberId).allowed || !canFor(uid, "points-reversal", "submit", v.original.memberId).allowed) return NO(need("points-reversal", "create and submit"));
  if (!v.ok) return NO(...v.errors);
  const rc = REVERSAL_REASONS.find((x) => x.code === i.reasonCode)!;
  const id = nextId("REV", state.reversals);
  const o = v.original;
  const r: PointsReversal = { id, originalLedgerId: o.id, memberId: o.memberId, programme: o.programme, sourceRef: o.ref, originalPoints: o.points, points: i.points, type: rc.type, reasonCode: rc.code, comment: i.comment.trim(), evidence: i.evidence, opKey: `REV|${id}`, status: "pending_approval", approvalRequestId: null, ledgerIds: [], createdBy: uid, createdAt: now(), executedAt: null, failure: null };
  const q = raise(uid, reversalSpec(mem(), r, o, memberBalances(state, ss(), mem(), o.memberId)));
  if (!q.ok) return q;
  let s = { ...state, reversals: [...state.reversals, { ...r, approvalRequestId: q.id ?? null }] };
  s = audited(s, uid, "reversal", id, "submitted", `${r.points} of ${o.id}`, r.comment, q.id ?? null);
  s = notify(s, { at: now(), event: "Reversal initiated", ref: id, memberId: o.memberId, message: `${id}: reversal of ${r.points} points awaiting a second person's approval` });
  commit(s);
  return OK(id, v.warnings);
}

/* ======================= Transfers ======================= */

export function submitTransfer(uid: string, i: { fromMemberId: string; toMemberId: string; points: number; reasonCode: string; comment: string; evidence: string[] }): Res {
  const a = memberById(mem(), i.fromMemberId.trim());
  if (!canFor(uid, "points-transfer", "create", a?.id).allowed || !canFor(uid, "points-transfer", "submit", a?.id).allowed) return NO(need("points-transfer", "create and submit"));
  if (i.toMemberId.trim() && !canFor(uid, "points-transfer", "submit", i.toMemberId.trim()).allowed) return NO("The destination member is outside your Points transfers scope");
  const v = validateTransfer(state, ss(), mem(), i);
  if (!v.ok) return NO(...v.errors);
  const id = nextId("TRF", state.transfers);
  const t: PointsTransfer = { id, fromMemberId: a!.id, toMemberId: i.toMemberId.trim(), programme: a!.programme, points: i.points, reasonCode: i.reasonCode, comment: i.comment.trim(), evidence: i.evidence, opKey: `TRF|${id}`, status: "pending_approval", approvalRequestId: null, ledgerIds: [], createdBy: uid, createdAt: now(), executedAt: null, failure: null };
  const q = raise(uid, transferSpec(mem(), t, memberBalances(state, ss(), mem(), t.fromMemberId), memberBalances(state, ss(), mem(), t.toMemberId)));
  if (!q.ok) return q;
  let s = { ...state, transfers: [...state.transfers, { ...t, approvalRequestId: q.id ?? null }] };
  s = audited(s, uid, "transfer", id, "submitted", `${t.points} ${t.fromMemberId} → ${t.toMemberId}`, t.comment, q.id ?? null);
  s = notify(s, { at: now(), event: "Point transfer submitted", ref: id, memberId: t.fromMemberId, message: `${id} awaiting approval` });
  commit(s);
  return OK(id);
}

/* ======================= Redemption operations ======================= */

/** SOW 10.5: only Evolve Operations can cancel a redemption, after checking whether money was paid out. */
export function canCancelRedemption(uid: string, memberId: string): { ok: boolean; reason: string } {
  if (!canFor(uid, "redemption", "cancel", memberId).allowed) return { ok: false, reason: "You need Redemption & fulfilment: Cancel redemption (granted to Evolve Operations only)" };
  if (primaryOrg(acc(), uid)?.id !== ORG.EVOLVE) return { ok: false, reason: "Only Evolve Operations can cancel a redemption (SOW 10.5)" };
  return { ok: true, reason: "" };
}

export function requestCancellation(uid: string, redemptionId: string, reasonCode: string, remarks: string): Res {
  const red = state.redemptions.find((r) => r.id === redemptionId);
  if (!red) return NO("Redemption not found");
  const may = canCancelRedemption(uid, red.memberId);
  if (!may.ok) return NO(may.reason);
  if (!CANCEL_REASONS.some((c) => c.code === reasonCode)) return NO("Choose a cancellation reason");
  if (!remarks.trim()) return NO("A cancellation reason is mandatory");
  const elig = cancellationEligibility(state, red);
  if (!elig.ok) return NO(...elig.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`));
  const id = nextId("CAN", state.cancellations);
  const c: RedemptionCancellation = { id, redemptionId, reason: `${reasonCode}: ${remarks.trim()}`, eligibility: elig, status: "pending_approval", approvalRequestId: null, reversalLedgerId: null, createdBy: uid, createdAt: now(), executedAt: null, failure: null };
  const q = raise(uid, cancellationSpec(mem(), c, red));
  if (!q.ok) return q;
  let s: WalletState = { ...state, cancellations: [...state.cancellations, { ...c, approvalRequestId: q.id ?? null }], redemptions: state.redemptions.map((r) => (r.id === red.id ? { ...r, stage: "cancellation_pending", updatedAt: now() } : r)) };
  s = audited(s, uid, "cancellation", id, "submitted", redemptionId, c.reason, q.id ?? null, red.stage);
  commit(s);
  return OK(id);
}

export function recoverVoucher(uid: string, redemptionId: string, reason: string): Res {
  const red = state.redemptions.find((r) => r.id === redemptionId);
  if (!red?.voucher) return NO("Not a voucher redemption");
  if (!canFor(uid, "redemption", "recover", red.memberId).allowed) return NO("You need Redemption & fulfilment: Recover voucher");
  if (!reason.trim()) return NO("Give the reason for recovery");
  if (state.service.mode !== "available") return NO("Voucher service unavailable (simulated). Nothing was requested");
  const opKey = `VRC|${red.id}`;
  if (state.recoveries.some((r) => r.opKey === opKey && r.outcome !== "refused")) return NO("A recovery was already made for this voucher. The voucher service re-sends the same code; it never issues a duplicate voucher");
  const ok = red.voucher.delivery !== "failed" && red.stage !== "cancelled" && red.stage !== "reversed";
  const id = nextId("VRC", state.recoveries);
  let s: WalletState = { ...state, recoveries: [...state.recoveries, { id, redemptionId, memberId: red.memberId, reason: reason.trim(), requestedBy: uid, requestedAt: now(), outcome: ok ? "recovered" : "refused", message: ok ? "Voucher service re-sent the existing code to the registered mobile (mock). No new voucher issued" : "Refused: the voucher was never delivered or the redemption was reversed", opKey }], redemptions: state.redemptions.map((r) => (r.id === red.id ? { ...r, voucher: { ...r.voucher!, recovery: ok ? "recovered" : "refused" } } : r)) };
  s = audited(s, uid, "voucher_recovery", id, ok ? "recovered" : "refused", redemptionId, reason);
  if (ok) s = notify(s, { at: now(), event: "Voucher recovered", ref: redemptionId, memberId: red.memberId, message: `Voucher for ${redemptionId} re-sent (mock)` });
  commit(s);
  return ok ? OK(id) : NO("Recovery refused: the voucher was never delivered or the redemption was reversed");
}

/** Development control: deliver a mock payout callback (duplicates are ignored by the service). */
export function simulatePayoutCallback(uid: string, payoutId: string, status: "success" | "failed", callbackId?: string): Res {
  if (!hasPermission(acc(), uid, "redemption", "view").allowed) return NO(need("redemption", "view"));
  const p = state.payouts.find((x) => x.id === payoutId);
  if (!p) return NO("Payout not found");
  const cb = { id: callbackId ?? `CB-${payoutId.slice(4)}-${p.callbacks.length + 1}`, status, utr: status === "success" ? `UTR${String(Date.now()).slice(-10)}` : null };
  const r = payoutCallback(state, payoutId, cb, now());
  commit(r.state);
  return r.ok ? OK(payoutId, r.duplicate ? [r.message] : []) : NO(r.message);
}

/** Runs the automatic reversal for failed redemptions. Refuses while the window is not configured (FD-05). */
export function runAutoReversal(uid: string, redemptionId: string): Res {
  const red = state.redemptions.find((r) => r.id === redemptionId);
  if (!red) return NO("Redemption not found");
  if (!canFor(uid, "redemption", "execute", red.memberId).allowed) return NO("You need Redemption & fulfilment: Execute");
  const r = reverseFailedRedemption(state, redemptionId, mem(), now(), uid, false);
  if (!r.ok) return NO(r.message);
  let s = audited(r.state, uid, "redemption", redemptionId, "auto_reversed", r.ledgerIds.join(", "), r.message);
  s = notify(s, { at: now(), event: "Payout failed", ref: redemptionId, memberId: red.memberId, message: r.message });
  commit(s);
  return OK(redemptionId, r.duplicate ? [r.message] : []);
}

/** Records a confirmed reversal window. Allowed only after FD-05 is marked Confirmed in the register. */
export function recordReversalWindow(uid: string, hours: number): Res {
  if (!hasPermission(acc(), uid, "redemption-limits", "edit").allowed) return NO(need("redemption-limits", "edit"));
  const d = state.decisions.find((x) => x.id === "FD-05");
  if (d?.status !== "confirmed") return NO("FD-05 (automatic reversal window) is not confirmed. Record the business answer in the decision register first");
  if (!Number.isFinite(hours) || hours <= 0) return NO("Enter the confirmed window in hours");
  commit(audited({ ...state, config: { ...state.config, autoReversal: { windowHours: hours, status: "confirmed" } } }, uid, "config", "AUTO-REVERSAL", "window_recorded", `${hours} h`, `Confirmed under FD-05: ${d.answer}`));
  return OK();
}

/**
 * Fulfilment status reported back by the Gift & Fulfilment service (Phase 9) for a product redemption.
 * Only the product fulfilment fields change; points and ledger lines are untouched.
 */
export function updateProductFulfilment(redemptionId: string, patch: { fulfilment: "ordered" | "delivered" | "returned"; delivery: "in_transit" | "delivered" | "failed" }, at: string, sourceRef: string): Res {
  const r = state.redemptions.find((x) => x.id === redemptionId);
  if (!r?.product) return NO("Not a product redemption");
  if (r.product.fulfilment === patch.fulfilment && r.product.delivery === patch.delivery) return OK(redemptionId, ["No change"]);
  commit(audited({ ...state, redemptions: state.redemptions.map((x) => (x.id === redemptionId ? { ...x, product: { ...x.product!, ...patch }, stage: patch.delivery === "delivered" && x.stage === "processing" ? "delivered" : x.stage, updatedAt: at } : x)) }, "SYSTEM", "redemption", redemptionId, "fulfilment_updated", `${patch.fulfilment} / ${patch.delivery}`, `Gift & Fulfilment ${sourceRef}`));
  return OK(redemptionId);
}

/* ======================= Backend gift redemption (AF03) ======================= */

/** Catalogue item supplied by the Phase 9 Gift Catalogue service (point cost already resolved for the member). */
export interface GiftCatalogueItem {
  ref: string;
  item: string;
  points: number;
  available: boolean;
  programmes: ProgrammeCode[];
}
export function submitGift(uid: string, i: { memberId: string; catalogueRef: string; quantity: number; foc: boolean; reason: string; remarks: string; evidence: string[] }, batchId: string | null = null, catalogueItem?: GiftCatalogueItem): Res {
  const m = memberById(mem(), i.memberId.trim());
  if (!canFor(uid, "gift-redemption", "create", m?.id).allowed || !canFor(uid, "gift-redemption", "submit", m?.id).allowed) return NO(need("gift-redemption", "create and submit"));
  const errors: string[] = [];
  if (!m) errors.push(`Member ${i.memberId || "(blank)"} not found`);
  const item = catalogueItem && catalogueItem.ref === i.catalogueRef ? catalogueItem : GIFT_CATALOGUE.find((g) => g.ref === i.catalogueRef);
  if (!item) errors.push("Choose a catalogue item");
  else if (!item.available) errors.push(`${item.item} is not available in the catalogue service`);
  else if (m && !item.programmes.includes(m.programme)) errors.push(`${item.item} is not offered to ${m.programme}`);
  if (!Number.isInteger(i.quantity) || i.quantity < 1) errors.push("Quantity must be at least 1");
  if (!GIFT_REASONS.some((r) => r.code === i.reason)) errors.push("Choose a redemption reason");
  if (!i.remarks.trim()) errors.push("Remarks are compulsory");
  if (i.foc && !i.evidence.length) errors.push("FOC gifts need a business justification document");
  if (m && !ws().wallets.some((w) => w.memberId === m.id && w.status === "active")) errors.push(`${m.id} has no active wallet`);
  if (m && item && !i.foc && i.quantity * item.points > memberBalances(state, ss(), mem(), m.id).available) errors.push(`Insufficient available points: ${i.quantity * item.points} needed`);
  if (m && item && state.gifts.some((g) => g.memberId === m.id && g.catalogueRef === item.ref && g.status === "pending_approval")) errors.push("The same gift is already awaiting approval for this member (duplicate)");
  if (errors.length) return NO(...errors);
  const tds = redemptionTds(m!.programme);
  const warnings = tds.status === "bcr" ? [`${tds.message}. The request can be submitted, but execution stays blocked until the slab is confirmed`] : [];
  const id = nextId("GFT", state.gifts);
  const g: GiftRedemption = { id, memberId: m!.id, programme: m!.programme, item: item!.item, catalogueRef: item!.ref, quantity: i.quantity, pointsPerUnit: item!.points, foc: i.foc, reason: i.reason, remarks: i.remarks.trim(), evidence: i.evidence, batchId, opKey: `GFT|${id}`, status: "pending_approval", approvalRequestId: null, ledgerIds: [], createdBy: uid, createdAt: now(), executedAt: null, failure: null };
  const q = raise(uid, giftSpec(mem(), g));
  if (!q.ok) return q;
  commit(audited({ ...state, gifts: [...state.gifts, { ...g, approvalRequestId: q.id ?? null }] }, uid, "gift", id, "submitted", `${g.item} × ${g.quantity}${g.foc ? " (FOC)" : ""}`, g.remarks, q.id ?? null));
  return OK(id, warnings);
}
const ws = () => state;

export const GIFT_CSV_HEADER = ["member_id", "catalogue_ref", "quantity", "foc", "reason_code", "remarks"];
export function submitGiftBatch(uid: string, fileName: string, text: string): Res & { rows?: { row: number; result: string; message: string }[] } {
  if (!hasPermission(acc(), uid, "gift-redemption", "create").allowed) return NO(need("gift-redemption", "create"));
  const all = parseCsv(text);
  if (!all.length || GIFT_CSV_HEADER.some((h, i) => all[0][i]?.trim().toLowerCase() !== h)) return NO(`Header must be: ${GIFT_CSV_HEADER.join(",")}`);
  const id = nextId("GBT", state.giftBatches);
  const seen = new Set<string>();
  const rows: { row: number; result: string; message: string; giftId?: string }[] = [];
  for (const [i, c] of all.slice(1).entries()) {
    const [memberId = "", catalogueRef = "", quantity = "", foc = "", reason = "", remarks = ""] = c.map((x) => x.trim());
    const key = `${memberId}|${catalogueRef}`.toLowerCase();
    if (seen.has(key)) {
      rows.push({ row: i + 2, result: "duplicate", message: "Duplicate of an earlier row: not processed" });
      continue;
    }
    seen.add(key);
    const r = submitGift(uid, { memberId, catalogueRef, quantity: Number(quantity), foc: foc.toLowerCase() === "yes", reason, remarks, evidence: foc.toLowerCase() === "yes" ? [`${fileName} (FOC justification)`] : [] }, id);
    rows.push({ row: i + 2, result: r.ok ? "valid" : "invalid", message: r.ok ? `${r.id} submitted for approval` : r.errors.join("; "), giftId: r.id });
  }
  commit(audited({ ...state, giftBatches: [...state.giftBatches, { id, fileName, giftIds: rows.filter((r) => r.giftId).map((r) => r.giftId!), rows: rows.map((r) => ({ row: r.row, memberId: all[r.row - 1][0] ?? "", catalogueRef: all[r.row - 1][1] ?? "", quantity: all[r.row - 1][2] ?? "", foc: all[r.row - 1][3] ?? "", errors: r.result === "valid" ? [] : [r.message], result: r.result as "valid" })), status: "pending_approval", createdBy: uid, createdAt: now() }] }, uid, "gift_batch", id, "uploaded", `${rows.filter((r) => r.result === "valid").length} of ${rows.length} rows submitted`, fileName));
  return { ...OK(id), rows };
}

/* ======================= GST gate (SOW 5.5) ======================= */

export function submitGstOverride(uid: string, i: { memberId: string; requested: GstOverrideRequest["requested"]; until: string | null; reasonCode: string; remarks: string; evidence: string[] }): Res {
  const m = memberById(mem(), i.memberId);
  if (!m || m.programme !== "Retailer") return NO("GST overrides apply to Retailers only");
  if (!canFor(uid, "gst-gate", "create", m.id).allowed || !canFor(uid, "gst-gate", "submit", m.id).allowed) return NO(need("gst-gate", "create and submit"));
  const g = gstGate(state, ss(), mem(), m.id, today());
  const errors: string[] = [];
  if (g.status === "verified") errors.push("GSTIN is already verified: no override needed");
  if (g.status === "override") errors.push("An override is already in force");
  if (state.gstOverrides.some((o) => o.memberId === m.id && o.status === "pending_approval")) errors.push("An override for this Retailer is already awaiting approval");
  if (!GST_OVERRIDE_REASONS.some((r) => r.code === i.reasonCode)) errors.push("Choose a reason code");
  if (!i.remarks.trim()) errors.push("Remarks are mandatory");
  if (i.requested === "unlock_until" && (!i.until || i.until <= today())) errors.push("Give a future end date for a time-bound unlock");
  if (errors.length) return NO(...errors);
  const rec = state.gst.find((x) => x.memberId === m.id)!;
  const id = nextId("GOV", state.gstOverrides);
  const o: GstOverrideRequest = { id, memberId: m.id, gstStatus: rec.verification, currentGate: g.message, requested: i.requested, until: i.requested === "unlock_until" ? i.until : null, reasonCode: i.reasonCode, remarks: i.remarks.trim(), evidence: i.evidence, status: "pending_approval", approvalRequestId: null, createdBy: uid, createdAt: now(), executedAt: null };
  const q = raise(uid, gstOverrideSpec(mem(), o));
  if (!q.ok) return q;
  let s = { ...state, gstOverrides: [...state.gstOverrides, { ...o, approvalRequestId: q.id ?? null }] };
  s = audited(s, uid, "gst_override", id, "submitted", m.id, o.remarks, q.id ?? null);
  s = notify(s, { at: now(), event: "GST override requested", ref: id, memberId: m.id, message: `${id} awaiting V-Guard approval` });
  commit(s);
  return OK(id);
}

/* ======================= TDS FY reconciliation (SOW 5.4.1) ======================= */

export function initiateFyReconciliation(uid: string, memberId: string, fyLabel: string): Res {
  const m = memberById(mem(), memberId);
  if (!m || m.programme !== "EP") return NO("The TDS Kitty model applies to EP/IMP only");
  if (!canFor(uid, "tds", "submit", m.id).allowed) return NO(need("tds", "submit"));
  if (state.tdsFy.some((r) => r.memberId === m.id && r.fy === fyLabel && !["rejected", "withdrawn", "failed"].includes(r.status))) return NO(`A ${fyLabel} reconciliation already exists for ${m.id}`);
  if (fyLabel >= fyOf(today())) return NO(`${fyLabel} has not ended; FY reconciliation runs after the financial year closes`);
  const a = fyAssessment(state, ss(), mem(), m.id, fyLabel);
  if (a.kittyPoints <= 0) return NO(`No TDS Kitty balance for ${fyLabel}`);
  const id = nextId("TFY", state.tdsFy);
  const r: TdsFyReconciliation = { id, memberId: m.id, fy: fyLabel, kittyPoints: a.kittyPoints, kittyInr: a.kittyInr, thresholdInr: a.thresholdInr, outcome: a.outcome, calculation: a.calculation, slabRef: null, status: a.calculation === "business_confirmation_required" ? "business_confirmation_required" : "pending_approval", approvalRequestId: null, ledgerIds: [], createdAt: now(), executedAt: null, failure: null };
  let s: WalletState;
  if (r.status === "business_confirmation_required") {
    s = audited({ ...state, tdsFy: [...state.tdsFy, r] }, uid, "tds_fy", id, "blocked", "TDS calculation: business confirmation required", a.detail);
    s = notify(s, { at: now(), event: "TDS Kitty reconciliation initiated", ref: id, memberId: m.id, message: `${id}: above threshold; blocked pending OP-TDS1` });
    commit(s);
    return { ...OK(id, ["Above the ₹20,000 threshold: the applicable slab is not confirmed (OP-TDS1). The record is held as Business confirmation required; no request was raised"]) };
  }
  const q = raise(uid, fyRefundSpec(mem(), r));
  if (!q.ok) return q;
  s = audited({ ...state, tdsFy: [...state.tdsFy, { ...r, approvalRequestId: q.id ?? null }] }, uid, "tds_fy", id, "submitted", "Refund Kitty", a.detail, q.id ?? null);
  s = notify(s, { at: now(), event: "TDS Kitty reconciliation initiated", ref: id, memberId: m.id, message: `${id} awaiting Finance approval` });
  commit(s);
  return OK(id);
}

/* ======================= Limits and reserve (AF22/AF23) ======================= */

export function submitLimitPolicy(uid: string, p: RedemptionLimitPolicy): Res {
  if (!hasPermission(acc(), uid, "redemption-limits", "edit").allowed || !hasPermission(acc(), uid, "redemption-limits", "submit").allowed) return NO(need("redemption-limits", "edit and submit"));
  if (!p.programmes.length) return NO("Choose at least one programme");
  if (p.programmes.includes("Retailer") && p.programmes.some((x) => x !== "Retailer")) return NO("Retailer values are not applied to other programmes: configure Retailer separately");
  if (state.policies.some((x) => x.id === p.id && x.status === "pending_approval")) return NO("A change to this policy is already awaiting approval");
  const prev = state.policies.find((x) => x.id === p.id && x.status === "active");
  const next: RedemptionLimitPolicy = { ...p, version: (prev?.version ?? 0) + 1, status: "pending_approval", updatedBy: uid, updatedAt: now(), approvalRequestId: null };
  const q = raise(uid, limitSpec(next, prev));
  if (!q.ok) return q;
  commit(audited({ ...state, policies: [...state.policies, { ...next, approvalRequestId: q.id ?? null }] }, uid, "limit_policy", `${p.id} v${next.version}`, "submitted", null, "Redemption limit change", q.id ?? null));
  return OK(`${p.id} v${next.version}`);
}

export function submitReserve(uid: string, i: { memberId: string; reserveInr: number; reason: string; effectiveFrom: string }): Res {
  const m = memberById(mem(), i.memberId);
  if (!m || m.programme !== "Retailer") return NO("The TDS reserve applies to Retailers only");
  if (!canFor(uid, "redemption-limits", "edit", m.id).allowed) return NO(need("redemption-limits", "edit"));
  if (!Number.isFinite(i.reserveInr) || i.reserveInr < state.config.retailerReserveDefaultInr) return NO(`A Retailer-specific reserve can only raise the default ₹${state.config.retailerReserveDefaultInr.toLocaleString("en-IN")} (for higher gifts)`);
  if (!i.reason.trim()) return NO("Give the reason");
  if (state.reserves.some((r) => r.memberId === m.id && r.status === "pending_approval")) return NO("A reserve change is already awaiting approval");
  const id = nextId("RSV", state.reserves);
  const current = state.reserves.find((r) => r.memberId === m.id && r.status === "active")?.reserveInr ?? state.config.retailerReserveDefaultInr;
  const r: RetailerReserve = { id, memberId: m.id, reserveInr: i.reserveInr, reason: i.reason.trim(), effectiveFrom: i.effectiveFrom, status: "pending_approval", approvalRequestId: null, updatedBy: uid, updatedAt: now() };
  const q = raise(uid, reserveSpec(mem(), r, current));
  if (!q.ok) return q;
  commit(audited({ ...state, reserves: [...state.reserves, { ...r, approvalRequestId: q.id ?? null }] }, uid, "reserve", id, "submitted", `₹${i.reserveInr}`, i.reason, q.id ?? null, `₹${current}`));
  return OK(id);
}

/* ======================= Reconciliation exceptions ======================= */

export function raiseException(uid: string, row: ReconRow, owner: string): Res {
  if (!hasPermission(acc(), uid, "fin-reconciliation", "manage").allowed) return NO(need("fin-reconciliation", "manage"));
  if (state.exceptions.some((e) => e.ref === row.ref && e.reconType === row.type && e.status !== "accepted" && e.status !== "resolved_by_correction")) return NO("An open exception already exists for this item");
  const id = nextId("FEX", state.exceptions);
  const e: FinancialException = { id, reconType: row.type, ref: row.ref, memberId: row.memberId, expected: row.expected, actual: row.actual, detail: row.exception, owner, status: "open", resolutionRef: null, raisedAt: now(), updatedAt: now() };
  let s = audited({ ...state, exceptions: [...state.exceptions, e] }, uid, "exception", id, "raised", row.exception, `${row.type} ${row.ref}`);
  s = notify(s, { at: now(), event: "Financial reconciliation exception", ref: id, memberId: row.memberId, message: `${id}: ${row.exception}` });
  commit(s);
  return OK(id);
}

/** Exceptions are never corrected silently: resolving by correction needs the reference of an approved adjustment or reversal. */
export function updateException(uid: string, id: string, status: FinancialException["status"], resolutionRef: string, note: string): Res {
  if (!hasPermission(acc(), uid, "fin-reconciliation", "manage").allowed) return NO(need("fin-reconciliation", "manage"));
  const e = state.exceptions.find((x) => x.id === id);
  if (!e) return NO("Exception not found");
  if (!note.trim()) return NO("Add a note");
  if (status === "resolved_by_correction") {
    const ref = resolutionRef.trim();
    const corr = [...state.adjustments, ...state.reversals].find((x) => x.id === ref);
    if (!corr) return NO("Resolution by correction needs the ID of an adjustment or reversal (ADJ- / REV-)");
    if (corr.status !== "completed") return NO(`${ref} is ${corr.status.replace(/_/g, " ")}: the correction must be approved and executed first`);
  }
  commit(audited({ ...state, exceptions: state.exceptions.map((x) => (x.id === id ? { ...x, status, resolutionRef: resolutionRef.trim() || null, updatedAt: now() } : x)) }, uid, "exception", id, status, resolutionRef || null, note, null, e.status));
  return OK(id);
}

export function updateFinDecision(uid: string, id: string, patch: { status: WalletState["decisions"][number]["status"]; answer: string }): Res {
  if (!hasPermission(acc(), uid, "financial", "edit").allowed && !hasPermission(acc(), uid, "fin-reconciliation", "manage").allowed) return NO("You need Financial configuration: Edit to update the decision register");
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, uid, "decision", id, patch.status, patch.answer, d.question, null, d.status));
  return OK(id);
}

/** Exports are permission-checked and audited (reports, passbook statements, TDS, 26Q). */
export function recordExport(uid: string, module: string, report: string, rows: number): Res {
  if (!hasPermission(acc(), uid, module, "export").allowed) return NO(`You need ${label[module] ?? module}: Export`);
  commit(audited(state, uid, "export", report, "exported", `${rows} rows`, `CSV export of ${report}`));
  return OK();
}

/* ======================= Execution handlers (after final approval) ======================= */

function ctxOf(r: ApprovalRequest) {
  return { ss: ss(), mem: mem(), now: now(), requestId: r.id, approvers: approversOf(r) };
}
const notFound = (r: ApprovalRequest) => ({ ok: false, message: `Not executed: no Phase 7 wallet record matches ${r.entityRef} (earlier demo request). Nothing was posted to the ledger` });

function finish<T extends { id: string; status: string }>(list: T[], id: string, ok: boolean, patch: Partial<T>, failure: string): T[] {
  return list.map((x) => (x.id === id ? { ...x, ...patch, status: ok ? "completed" : "failed", ...(ok ? {} : { failure }) } : x));
}

function executeWallet(r: ApprovalRequest) {
  const ctx = ctxOf(r);
  const ref = r.entityRef;
  if (ref.startsWith("ADJ-")) {
    const a = state.adjustments.find((x) => x.id === ref);
    if (!a) return notFound(r);
    const out = executeAdjustment(state, a, ctx);
    let s = { ...out.state, adjustments: finish(out.state.adjustments, a.id, out.ok, { ledgerIds: out.ledgerIds, executedAt: ctx.now } as Partial<PointsAdjustment>, out.message) };
    s = audited(s, "SYSTEM", "adjustment", a.id, out.ok ? "executed" : "execution_failed", out.ledgerIds.join(", ") || null, out.message, r.id);
    if (out.ok && !out.duplicate) s = notify(s, { at: ctx.now, event: a.direction === "add" ? "Points manually added" : "Points manually deducted", ref: a.id, memberId: a.memberId, message: out.message });
    commit(s);
    return { ok: out.ok, message: out.message };
  }
  if (ref.startsWith("BAT-")) {
    const b = state.batches.find((x) => x.id === ref);
    if (!b) return notFound(r);
    const out = executeBatch(state, b, ctx);
    let s = { ...out.state, batches: out.state.batches.map((x) => (x.id === b.id ? { ...x, rows: out.rows, status: (out.ok ? "completed" : "failed") as typeof x.status, executedAt: ctx.now } : x)) };
    s = audited(s, "SYSTEM", "batch", b.id, out.ok ? "executed" : "execution_failed", `${out.ledgerIds.length} lines`, out.message, r.id);
    commit(s);
    return { ok: out.ok, message: out.message };
  }
  return notFound(r);
}

function executeReversalReq(r: ApprovalRequest) {
  const v = state.reversals.find((x) => x.id === r.entityRef);
  if (!v) return notFound(r);
  const ctx = ctxOf(r);
  const out = executeReversal(state, v, ctx);
  let s = { ...out.state, reversals: finish(out.state.reversals, v.id, out.ok, { ledgerIds: out.ledgerIds, executedAt: ctx.now } as Partial<PointsReversal>, out.message) };
  s = audited(s, "SYSTEM", "reversal", v.id, out.ok ? "executed" : "execution_failed", out.ledgerIds.join(", ") || null, out.message, r.id);
  if (out.ok) s = notify(s, { at: ctx.now, event: "Reversal approved", ref: v.id, memberId: v.memberId, message: out.message });
  commit(s);
  return { ok: out.ok, message: out.message };
}

function executeTransferReq(r: ApprovalRequest) {
  const t = state.transfers.find((x) => x.id === r.entityRef);
  if (!t) return notFound(r);
  const ctx = ctxOf(r);
  const out = executeTransfer(state, t, ctx);
  let s = { ...out.state, transfers: finish(out.state.transfers, t.id, out.ok, { ledgerIds: out.ledgerIds, executedAt: ctx.now } as Partial<PointsTransfer>, out.message) };
  s = audited(s, "SYSTEM", "transfer", t.id, out.ok ? "executed" : "execution_failed", out.ledgerIds.join(", ") || null, out.message, r.id);
  if (out.ok) s = notify(s, { at: ctx.now, event: "Point transfer completed", ref: t.id, memberId: t.fromMemberId, message: out.message });
  commit(s);
  return { ok: out.ok, message: out.message };
}

function executeRedemptionReq(r: ApprovalRequest) {
  const c = state.cancellations.find((x) => x.id === r.entityRef);
  if (!c) return notFound(r);
  const ctx = ctxOf(r);
  const out = executeCancellation(state, c.redemptionId, ctx);
  let s = { ...out.state, cancellations: finish(out.state.cancellations, c.id, out.ok, { reversalLedgerId: out.ledgerIds[1] ?? null, executedAt: ctx.now } as Partial<RedemptionCancellation>, out.message) };
  if (!out.ok) s = { ...s, redemptions: s.redemptions.map((x) => (x.id === c.redemptionId && x.stage === "cancellation_pending" ? { ...x, stage: "processing" as const } : x)) };
  s = audited(s, "SYSTEM", "cancellation", c.id, out.ok ? "executed" : "execution_failed", out.ledgerIds.join(", ") || null, out.message, r.id);
  commit(s);
  return { ok: out.ok, message: out.message };
}

function executeGstReq(r: ApprovalRequest) {
  const o = state.gstOverrides.find((x) => x.id === r.entityRef);
  if (!o) return notFound(r);
  const ctx = ctxOf(r);
  const out = executeGstOverride(state, o, ctx);
  let s = { ...out.state, gstOverrides: finish(out.state.gstOverrides, o.id, out.ok, { executedAt: ctx.now } as Partial<GstOverrideRequest>, out.message) };
  s = audited(s, "SYSTEM", "gst_override", o.id, out.ok ? "executed" : "execution_failed", out.ledgerIds.join(", ") || null, out.message, r.id);
  if (out.ok) {
    s = notify(s, { at: ctx.now, event: "GST override approved", ref: o.id, memberId: o.memberId, message: out.message });
    s = notify(s, { at: ctx.now, event: "GST gate updated", ref: o.memberId, memberId: o.memberId, message: "Gate unlocked by administrative override" });
  }
  commit(s);
  return { ok: out.ok, message: out.message };
}

function executeTdsReq(r: ApprovalRequest) {
  const t = state.tdsFy.find((x) => x.id === r.entityRef);
  if (!t) return notFound(r);
  const ctx = ctxOf(r);
  const out = executeFyRefund(state, t, ctx);
  let s = { ...out.state, tdsFy: finish(out.state.tdsFy, t.id, out.ok, { ledgerIds: out.ledgerIds, executedAt: ctx.now } as Partial<TdsFyReconciliation>, out.message) };
  s = audited(s, "SYSTEM", "tds_fy", t.id, out.ok ? "executed" : "execution_failed", out.ledgerIds.join(", ") || null, out.message, r.id);
  if (out.ok) s = notify(s, { at: ctx.now, event: "TDS Kitty refund completed", ref: t.id, memberId: t.memberId, message: out.message });
  commit(s);
  return { ok: out.ok, message: out.message };
}

function executeGiftReq(r: ApprovalRequest) {
  const g = state.gifts.find((x) => x.id === r.entityRef);
  if (!g) return notFound(r);
  const ctx = ctxOf(r);
  const out = executeGift(state, g, ctx);
  const blocked = out.message.includes("business confirmation");
  let s = { ...out.state, gifts: out.state.gifts.map((x) => (x.id === g.id ? { ...x, status: out.ok ? ("completed" as const) : blocked ? ("business_confirmation_required" as const) : ("failed" as const), ledgerIds: out.ledgerIds, executedAt: out.ok ? ctx.now : null, failure: out.ok ? null : out.message } : x)) };
  s = audited(s, "SYSTEM", "gift", g.id, out.ok ? "executed" : "execution_refused", out.ledgerIds.join(", ") || null, out.message, r.id);
  commit(s);
  return { ok: out.ok, message: out.message };
}

function executeLimitsReq(r: ApprovalRequest) {
  const ref = r.entityRef;
  if (ref.startsWith("RSV-")) {
    const v = state.reserves.find((x) => x.id === ref);
    if (!v) return notFound(r);
    let s: WalletState = { ...state, reserves: state.reserves.map((x) => (x.id === v.id ? { ...x, status: "active" as const, approvalRequestId: r.id } : x.memberId === v.memberId && x.status === "active" ? { ...x, status: "superseded" as const } : x)) };
    s = audited(s, "SYSTEM", "reserve", v.id, "activated", `₹${v.reserveInr}`, "Approved", r.id);
    commit(s);
    return { ok: true, message: `Reserve ₹${v.reserveInr.toLocaleString("en-IN")} active for ${v.memberId} from ${v.effectiveFrom}` };
  }
  const [pid, ver] = ref.split(" v");
  const p = state.policies.find((x) => x.id === pid && String(x.version) === ver);
  if (!p) return notFound(r);
  let s: WalletState = { ...state, policies: state.policies.map((x) => (x === p ? { ...x, status: "active" as const } : x.id === pid && x.status === "active" ? { ...x, status: "inactive" as const, effectiveTo: p.effectiveFrom } : x)) };
  s = audited(s, "SYSTEM", "limit_policy", ref, "activated", null, "Approved", r.id);
  commit(s);
  return { ok: true, message: `${ref} active from ${p.effectiveFrom}` };
}

registerExecutionHandler("points-adjustment", executeWallet);
registerExecutionHandler("points-reversal", executeReversalReq);
registerExecutionHandler("points-transfer", executeTransferReq);
registerExecutionHandler("redemption", executeRedemptionReq);
registerExecutionHandler("gst-gate", executeGstReq);
registerExecutionHandler("tds", executeTdsReq);
registerExecutionHandler("gift-redemption", executeGiftReq);
registerExecutionHandler("redemption-limits", executeLimitsReq);

/** Keeps request statuses in step with the approval engine (rejections, returns, withdrawals, approvals awaiting execution). */
function syncFromApprovals() {
  const reqs = approvalStore.get().requests;
  const map = (st: string, req: ApprovalRequest | undefined) => {
    if (!req || !["pending_approval", "approved", "returned", "executing"].includes(st)) return st;
    if (req.status === "rejected") return "rejected";
    if (req.status === "withdrawn" || req.status === "cancelled") return "withdrawn";
    if (req.status === "returned") return "returned";
    if (req.status === "approved" && req.execution.status !== "executed" && st === "pending_approval") return req.execution.status === "failed" ? "failed" : "approved";
    if (["pending_approval", "under_review", "partially_approved", "escalated", "resubmitted"].includes(req.status) && st === "returned") return "pending_approval";
    return st;
  };
  const upd = <T extends { status: string; approvalRequestId: string | null }>(xs: T[]) => {
    let changed = false;
    const out = xs.map((x) => {
      const next = map(x.status, reqs.find((r) => r.id === x.approvalRequestId));
      if (next === x.status) return x;
      changed = true;
      return { ...x, status: next };
    });
    return changed ? out : xs;
  };
  const next: WalletState = { ...state, adjustments: upd(state.adjustments), batches: upd(state.batches), reversals: upd(state.reversals), transfers: upd(state.transfers), cancellations: upd(state.cancellations), gstOverrides: upd(state.gstOverrides), gifts: upd(state.gifts), tdsFy: upd(state.tdsFy), reserves: state.reserves };
  // A cancellation that is rejected or withdrawn returns the redemption to its previous stage.
  next.redemptions = state.redemptions.map((red) => (red.stage === "cancellation_pending" && !next.cancellations.some((c) => c.redemptionId === red.id && ["pending_approval", "approved"].includes(c.status)) ? { ...red, stage: "processing" } : red));
  const same = (["adjustments", "batches", "reversals", "transfers", "cancellations", "gstOverrides", "gifts", "tdsFy"] as const).every((k) => next[k] === state[k]) && next.redemptions.every((r, i) => r === state.redemptions[i]);
  if (!same) commit(next);
}
approvalStore.subscribe(syncFromApprovals);
syncFromApprovals();

export const approvalFor = (id: string | null) => reqOf(id);
export const ledgerPost = post;

/* ======================= Scan-service adapter (simulation) ======================= */

/**
 * The scan service's credit for a validated Scan-Out (SOW 4, 5.1): one posting per scan reference
 * (idempotency key SCAN|ref), with the EP / IMP scan-time provisional TDS to the Kitty applied by the
 * same TDS adapter the seed uses. Called by the simulated scan pipeline only; it never edits a
 * balance directly: the mock wallet service appends ledger lines.
 */
export function ingestScanCredit(scan: { ref: string; memberId: string; skuCode: string; gross: number }): Res & { ledgerIds?: string[]; duplicate?: boolean; net?: number; kitty?: number } {
  const m = memberById(mem(), scan.memberId);
  if (!m) return NO("Member not found");
  if (!Number.isInteger(scan.gross) || scan.gross <= 0) return NO("No points to credit for this scan");
  if (state.service.mode !== "available") return NO(`Wallet service ${state.service.mode === "timeout" ? "timed out" : "unavailable"}: the scan is held for retry, nothing credited`);
  const panOk = mem().documents.some((d) => d.memberId === m.id && d.type === "pan" && d.status === "approved");
  const split = scanTdsSplit(m.programme, panOk, scan.gross, state.config);
  const at = now();
  const base = { memberId: m.id, programme: m.programme, branchCode: m.branchCode, at, status: "completed" as const, initiatedBy: "SCAN-SERVICE (simulated)", approvalRequestId: null, approvedBy: [] as string[] };
  const drafts: Parameters<typeof post>[2] = [{ ...base, ref: scan.ref, type: "scan_credit", bucket: "available", points: split.net, gross: scan.gross, source: "scan", channel: "scan", skuCode: scan.skuCode, remarks: split.applies ? `Gross ${scan.gross}; ${split.ratePct}% provisional TDS to Kitty (simulated scan)` : "Scan-Out credit (simulated scan)" }];
  if (split.kitty) drafts.push({ ...base, ref: scan.ref, type: "tds_kitty_deduction", bucket: "tds_kitty", points: split.kitty, source: "tds", channel: "system", skuCode: scan.skuCode, remarks: `Scan-time provisional TDS ${split.ratePct}%` });
  const r = post(state, `SCAN|${scan.ref}`, drafts);
  if (r.duplicate) return { ...OK(undefined, ["Duplicate scan reference: nothing credited twice"]), duplicate: true, ledgerIds: r.ledgerIds };
  commit(audited(r.state, "SCAN-SERVICE", "ledger", scan.ref, "scan_credit_posted", `${split.net} points${split.kitty ? ` + ${split.kitty} to TDS Kitty` : ""}`, "Simulated scan (Client Demo)"));
  return { ...OK(r.ledgerIds[0]), ledgerIds: r.ledgerIds, net: split.net, kitty: split.kitty };
}

/* ======================= Member-app redemption (simulation) ======================= */

/**
 * A UPI / bank (DBT) redemption as the member app would raise it (SOW 5.3): validated by the same
 * blockers the portal shows (balance, minimum, limits, KYC, bank, restrictions, GST gate), then debited
 * through the mock wallet service and handed to the mock payout adapter. Above ₹10,000 it waits for
 * manual validation. Redemption-time TDS stays Business confirmation required (OP-TDS1).
 */
export function simulateMemberRedemption(memberId: string, method: "dbt" | "upi", points: number): Res & { redemptionId?: string; payoutId?: string } {
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  if (!Number.isInteger(points) || points <= 0) return NO("Enter the points to redeem");
  if (state.service.mode !== "available") return NO("Wallet service unavailable: try again later");
  const blockers = redemptionBlockers(state, ss(), mem(), memberId, method, points, now().slice(0, 10));
  if (blockers.length) return NO(...blockers.map((b) => b.reason));
  const n = state.redemptions.reduce((x, r) => Math.max(x, Number(r.id.split("-").pop()) || 0), 0) + 1;
  const id = `RED-${String(n).padStart(5, "0")}`;
  const grossInr = points * state.config.pointValueInr;
  const tdsRes = redemptionTds(m.programme);
  const panOk = mem().documents.some((d) => d.memberId === m.id && d.type === "pan" && d.status === "approved");
  const manual = grossInr > 10000;
  const at = now();
  const base = { memberId: m.id, programme: m.programme, branchCode: m.branchCode, at, status: "completed" as const, initiatedBy: "MEMBER-APP (simulated)", approvalRequestId: null, approvedBy: [] as string[] };
  let s2 = state;
  let debit: string | null = null;
  if (!manual) {
    const r = post(s2, `RED|${id}`, [{ ...base, ref: id, type: "redemption_debit", bucket: "available", points: -points, source: "redemption", channel: "redemption", remarks: `${method.toUpperCase()} redemption (simulated)` }, { ...base, ref: id, type: "redemption_debit", bucket: "redeemed", points, source: "redemption", channel: "redemption", remarks: `${method.toUpperCase()} redemption (simulated)` }]);
    s2 = r.state;
    debit = r.ledgerIds[0];
  }
  const red: RedemptionRequest = {
    id, memberId: m.id, programme: m.programme, branchCode: m.branchCode, method, points, grossInr,
    tds: { model: m.programme === "EP" ? "kitty_at_scan" : m.programme === "DD" ? "not_configured" : "on_redemption", status: tdsRes.status === "not_applicable" ? "not_applicable" : "bcr", panStatus: panOk ? "verified" : "not_verified", panSource: m.programme === "Retailer" ? "SFDC" : "Rishta KYC", ratePct: null, amountInr: null },
    netInr: tdsRes.status === "not_applicable" ? grossInr : null, createdAt: at, updatedAt: at, stage: manual ? "manual_validation" : "payout_initiated", track: "in_process", blockedReasons: [],
    manualValidation: manual ? { required: true, reason: `Single redemption ₹${grossInr.toLocaleString("en-IN")} above ₹10,000 (SOW 5.3)`, callCentreRef: null, outcome: "pending" } : { required: false, reason: "", callCentreRef: null, outcome: null },
    fraudCheck: "passed", utr: null, externalRef: null, provider: "Mock payout adapter", debitLedgerId: debit, reversalLedgerId: null, origin: "mock_service",
  };
  const payoutId = manual ? undefined : `PAY-SIM-${String(n).padStart(5, "0")}`;
  s2 = { ...s2, redemptions: [...s2.redemptions, red], payouts: payoutId ? [...s2.payouts, { id: payoutId, redemptionId: id, provider: "Mock payout adapter", amountInr: red.netInr ?? grossInr, initiatedAt: at, status: "in_process", utr: null, failureReason: null, reconciliation: "pending", callbacks: [] }] : s2.payouts };
  commit(audited(s2, "MEMBER-APP", "redemption", id, "redemption_submitted", `${points} points · ${method.toUpperCase()}`, "Simulated member-app redemption (Client Demo)"));
  return { ...OK(id, [manual ? "Above ₹10,000: waiting for manual validation; nothing debited yet" : "SIMULATED FINANCIAL TRANSACTION — no actual payment will be made", ...(tdsRes.status === "bcr" ? [tdsRes.message] : [])]), redemptionId: id, payoutId };
}
