/**
 * EVENT BRIDGE — reads authoritative module states and emits Notification Catalogue events (Phase 8).
 * The Communication Centre never decides business status itself: it only listens.
 *
 *  N01 Member Management registration events   N07 Wallet redemption stage changes
 *  N02 KYC document reviews                     N08 TDS FY reconciliation / recorded redemption TDS
 *  N03 Ledger scan / Base Points credits        N09 Voucher issue, confirmed gift delivery
 *  N04 Scheme activation × eligible members     N11 Restrictions applied / lifted
 *  N05 Scheme milestone accruals                N06 / N10 are dispatched by Surveys / the scheduler
 *
 * Event IDs are derived from the source record, so the same source change always produces the same
 * ID: a redelivered event is recognised as a duplicate and never sends twice.
 */
import { displayVersion, eligiblePopulation } from "@/features/schemes/engine";
import type { MasterState } from "@/features/masters/engine";
import type { MemberState } from "@/features/members/engine";
import type { SchemeState } from "@/types/schemes";
import type { WalletState } from "@/types/wallet";
import type { NotificationEvent, NotificationId } from "@/types/comms";

type Draft = Omit<NotificationEvent, "status" | "commId" | "detail" | "receivedCount">;

export interface Sources {
  mem: MemberState;
  ws: WalletState;
  ss: SchemeState;
  ms: MasterState;
}

const ev = (id: string, notificationId: NotificationId, type: string, sourceModule: string, sourceRef: string, at: string, memberId: string | null, programme: Draft["programme"], payload: Draft["payload"]): Draft => ({ id, notificationId, type, sourceModule, sourceRef, at, memberId, programme, payload });

export function collectEvents(src: Sources, since: string): Draft[] {
  const out: Draft[] = [];
  const { mem, ws, ss, ms } = src;
  const prog = (id: string) => mem.members.find((m) => m.id === id)?.programme ?? null;
  const name = (id: string) => mem.members.find((m) => m.id === id)?.name ?? id;

  // N01 — registration and onboarding (Member Management events)
  for (const e of mem.events.filter((x) => x.category === "registration" && x.at >= since)) {
    const a = e.action.toLowerCase();
    const type = a.includes("submitted") || a.includes("created") || a.includes("invitation") ? "registration.received" : a.includes("stage-1 approved") ? "registration.approved" : a.includes("stage-2") ? "registration.activated" : a.includes("rejected") ? "registration.rejected" : "registration.stage_progress";
    out.push(ev(`EVT-N01-${e.id}`, "N01", type, "Member Management", e.id, e.at, e.memberId, e.programme, { member_name: name(e.memberId), member_id: e.memberId, programme: e.programme, status: e.newValue ?? e.action }));
  }
  // N02 — KYC document approved / rejected / re-upload (document and outcome only, never identifiers)
  for (const d of mem.documents.filter((x) => x.reviewedAt && x.reviewedAt >= since && ["approved", "rejected", "reupload_required"].includes(x.status))) {
    const type = d.status === "approved" ? "kyc.document_approved" : d.status === "rejected" ? "kyc.document_rejected" : "kyc.reupload_required";
    out.push(ev(`EVT-N02-${d.id}-${d.status}`, "N02", type, "Registration & KYC", d.id, d.reviewedAt!, d.memberId, prog(d.memberId), { member_name: name(d.memberId), document_type: d.type.toUpperCase(), outcome: d.status === "approved" ? "approved" : d.status === "rejected" ? "rejected" : "returned for re-upload", rejection_reason: d.rejectionReason ?? "" }));
  }
  // N03 — only credits the ledger confirms (pending scans never)
  for (const l of ws.ledger.filter((x) => x.at >= since && x.status === "completed" && x.bucket === "available" && x.type === "scan_credit")) {
    out.push(ev(`EVT-N03-${l.id}`, "N03", "scan.points_credited", "Scanning / Wallet ledger", l.id, l.at, l.memberId, l.programme, { points: l.points, scan_ref: l.ref, member_name: name(l.memberId) }));
  }
  // N04 — scheme goes live: one event per eligible member (scheme eligibility service)
  for (const sc of ss.schemes) {
    const act = sc.activations.filter((a) => a.result === "success" && a.at >= since).pop();
    if (!act) continue;
    const cfg = displayVersion(sc).config;
    const elig = eligiblePopulation(mem, ms, cfg);
    for (const m of elig.members) out.push(ev(`EVT-N04-${sc.id}-v${act.version}-${m.id}`, "N04", "scheme.live", "Scheme & Incentive Management", `${sc.id} v${act.version}`, act.at, m.id, m.programme, { scheme_name: cfg.basic.name, scheme_period: `${cfg.duration.start} to ${cfg.duration.end}`, programme: m.programme, member_name: m.name, scheme_id: sc.id }));
  }
  // N05 — milestone accruals
  for (const a of ss.accruals.filter((x) => x.component === "milestone" && (x.result === "accrued" || x.result === "credited") && `${x.effectiveDate}T23:59` >= since)) {
    const sc = ss.schemes.find((s) => s.id === a.schemeId);
    out.push(ev(`EVT-N05-${a.id}`, "N05", "scheme.milestone_achieved", "Scheme & Incentive Management", a.id, a.calculatedAt, a.memberId, prog(a.memberId), { member_name: name(a.memberId), scheme_name: sc ? displayVersion(sc).config.basic.name : a.schemeId, milestone: `${a.points} milestone points`, scheme_id: a.schemeId }));
  }
  // N07 / N09 — redemption stage changes and vouchers / deliveries
  for (const r of ws.redemptions.filter((x) => x.createdAt >= since || x.updatedAt >= since)) {
    if (r.stage === "blocked") continue;
    const base = { member_name: name(r.memberId), redemption_ref: r.id };
    if (r.createdAt >= since) out.push(ev(`EVT-N07-${r.id}-requested`, "N07", "redemption.requested", "Wallet / Redemption", r.id, r.createdAt, r.memberId, r.programme, { ...base, redemption_status: "requested", utr: "" }));
    if (["processing", "payout_initiated", "manual_validation", "mail_approval"].includes(r.stage)) out.push(ev(`EVT-N07-${r.id}-processing`, "N07", "redemption.processing", "Wallet / Redemption", r.id, r.updatedAt, r.memberId, r.programme, { ...base, redemption_status: "processing", utr: "" }));
    // Success only once the payment service confirmed (paid) or the gift was delivered.
    if (r.stage === "paid" || r.stage === "delivered") out.push(ev(`EVT-N07-${r.id}-success`, "N07", "redemption.success", "Wallet / Redemption", r.id, r.updatedAt, r.memberId, r.programme, { ...base, redemption_status: "successful", utr: r.utr ? `UTR ${r.utr}` : "" }));
    if (r.track === "fail" && ["failed", "reversal_pending", "reversed"].includes(r.stage)) out.push(ev(`EVT-N07-${r.id}-failure`, "N07", "redemption.failure", "Wallet / Redemption", r.id, r.updatedAt, r.memberId, r.programme, { ...base, redemption_status: "failed", utr: "" }));
    if (r.voucher && r.voucher.issuedAt >= since && r.voucher.delivery !== "failed") out.push(ev(`EVT-N09-${r.id}-voucher`, "N09", "voucher.issued", "Gift & Fulfilment", r.id, r.voucher.issuedAt, r.memberId, r.programme, { member_name: name(r.memberId), gift_ref: r.id, gift_status: "issued", expiry: r.voucher.expiresOn, tracking_ref: "" }));
    if (r.product && r.product.delivery === "delivered" && r.updatedAt >= since) out.push(ev(`EVT-N09-${r.id}-delivered`, "N09", "gift.delivered", "Gift & Fulfilment", r.id, r.updatedAt, r.memberId, r.programme, { member_name: name(r.memberId), gift_ref: r.id, gift_status: "delivered", expiry: "", tracking_ref: r.product.catalogueRef }));
    if (r.tds.status === "recorded" && r.createdAt >= since) out.push(ev(`EVT-N08-${r.id}-tds`, "N08", "tds.deducted", "Finance / TDS", r.id, r.createdAt, r.memberId, r.programme, { member_name: name(r.memberId), fy: "FY 2026-27", tds_outcome: `TDS of ₹${r.tds.amountInr} recorded on redemption ${r.id}` }));
  }
  // N08 — confirmed FY reconciliation outcomes only (blocked outcomes never notify)
  for (const t of ws.tdsFy.filter((x) => x.status === "completed" && x.executedAt && x.executedAt >= since)) {
    out.push(ev(`EVT-N08-${t.id}`, "N08", "tds.fy_reconciled", "Finance / TDS", t.id, t.executedAt!, t.memberId, prog(t.memberId), { member_name: name(t.memberId), fy: t.fy, tds_outcome: "TDS Kitty credited back to your wallet" }));
  }
  // N11 — restrictions applied and lifted (reason codes are not passed to the member)
  for (const r of mem.restrictions) {
    for (const id of r.memberIds) {
      if (r.appliedAt >= since) out.push(ev(`EVT-N11-${r.id}-${id}-applied`, "N11", r.type === "temporary_hold" ? "member.hold" : "member.blocked", "Member Management", r.id, r.appliedAt, id, prog(id), { member_name: name(id), status_change: r.type === "temporary_hold" ? "account on temporary hold" : "programme access blocked", effective_date: r.appliedAt.slice(0, 10) }));
      if (r.status === "lifted" && r.reinstatement?.liftedAt && r.reinstatement.liftedAt >= since) out.push(ev(`EVT-N11-${r.id}-${id}-lifted`, "N11", "member.reinstated", "Member Management", r.id, r.reinstatement.liftedAt, id, prog(id), { member_name: name(id), status_change: "account reinstated", effective_date: r.reinstatement.liftedAt.slice(0, 10) }));
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}
