/**
 * Phase 7 — Wallet, Points, TDS, Redemption and Financial Operations test suite (Section 29, cases 1–92).
 * Runs the real wallet store, engine, mock wallet service and central approval engine in Node against
 * the development seed:
 *   npm run test:wallet
 * Rules fully defined by the SOW (10% / 20% scan-time rates, ₹20,000 FY threshold, ₹19,999 GST threshold,
 * ₹2,000 reserve, ₹10,000 / ₹30,000 DBT-UPI thresholds, same-programme transfers, no negative balance)
 * assert deterministic results. Unresolved rules (OP-TDS1, OP-08, OP-FIN1, FD-05) assert that the
 * operation is BLOCKED; no financial value is invented for them.
 */
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { schemeStore, createSettlementRequest } from "@/features/schemes/store";
import { settlementPreview, schemeById, displayVersion } from "@/features/schemes/engine";
import * as E from "@/features/wallet/engine";
import * as W from "@/features/wallet/store";
import { executeFyRefund } from "@/features/wallet/mockService";
import { redemptionTds, scanTdsSplit } from "@/features/wallet/tdsAdapter";
import { BUCKET, DEFAULT_CONFIG, GST_SCHEME_CLASS, TDS_MODEL, fy } from "@/config/walletCatalogue";
import type { RewardAccrual, SchemeState } from "@/types/schemes";
import type { WalletState } from "@/types/wallet";

const SNEHA = "USR-1004", LAKSHMI = "USR-2003", ANITA = "USR-2001", RAHUL = "USR-1003", TANUJIT = "USR-1001", VIKRAM = "USR-2006";
const TODAY = "2026-11-09";
const ws = () => W.walletStore.get();
const ss = () => schemeStore.get();
const mem = () => memberStore.get();
const lines = () => E.fullLedger(ws(), ss(), mem());
const bal = (id: string) => E.memberBalances(ws(), ss(), mem(), id);
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string, action: "approve" | "reject" | "return" = "approve", remarks = "Reviewed in test") => decideRequest(uid, id, action, remarks, req(id).seq);
const approve2 = (id: string) => { const a = decide(LAKSHMI, id); const b = decide(ANITA, id); return a.ok && b.ok; };

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: number; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
function test(n: number, name: string, kind: Kind, fn: () => string | void) {
  try {
    const d = fn();
    results.push({ n, name, kind, ok: true, detail: d ?? "" });
  } catch (e) {
    results.push({ n, name, kind, ok: false, detail: (e as Error).message });
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const seedLedger = JSON.stringify(ws().ledger);
const members = () => mem().members;
const eligibleEP = () => members().filter((m) => m.programme === "EP" && m.status === "redemption_enabled" && !mem().restrictions.some((r) => r.status !== "lifted" && r.memberIds.includes(m.id)));
const gatedRetailer = () => (ws().gst.find((g) => g.verification !== "verified" && !g.override && bal(g.memberId).gstLocked > 0) ?? ws().gst.find((g) => g.verification !== "verified" && !g.override))!.memberId;

/* ======================= Wallet model (1–8) ======================= */
test(1, "Lifetime, Available and Redeemed points derive from the ledger", "deterministic", () => {
  const m = eligibleEP().find((x) => ws().redemptions.some((r) => r.memberId === x.id && r.debitLedgerId))!;
  const ls = E.linesOf(lines(), m.id).filter((l) => l.status === "completed");
  const b = bal(m.id);
  const avail = ls.filter((l) => l.bucket === "available").reduce((n, l) => n + l.points, 0);
  const red = ls.filter((l) => l.bucket === "redeemed").reduce((n, l) => n + l.points, 0);
  expect(b.available === avail && b.redeemed === red && b.lifetime > 0 && b.available >= 0, `${b.available}/${avail} ${b.redeemed}/${red}`);
  return `${m.id}: lifetime ${b.lifetime}, available ${b.available}, redeemed ${b.redeemed} (sums of ledger lines)`;
});
test(2, "Scheme points stay unsettled and are not available", "deterministic", () => {
  const l = lines().find((x) => x.type === "scheme_accrual")!;
  const b = bal(l.memberId);
  expect(l.bucket === "scheme_unsettled" && b.scheme > 0, "scheme bucket");
  const blk = E.redemptionBlockers(ws(), ss(), mem(), l.memberId, "upi", b.available + 1, TODAY);
  expect(blk.some((x) => x.code === "balance"), "scheme points counted as redeemable");
  return `${l.memberId}: ${b.scheme} scheme points held; redeeming available + 1 is refused`;
});
test(3, "Available versus Pending classification", "deterministic", () => {
  const p = ws().ledger.find((l) => l.bucket === "pending")!;
  const c = E.classify(ws(), ss(), mem(), p.memberId, TODAY);
  const pending = c.find((x) => x.key === "pending")!;
  expect(pending.points >= p.points && !pending.redeemable && c.find((x) => x.key === "available")!.redeemable, "pending classification");
  return `${p.memberId}: ${pending.points} pending (not redeemable)`;
});
test(4, "Expiring Soon and Expired classification", "deterministic", () => {
  const expired = ws().ledger.find((l) => l.bucket === "expired")!;
  const ce = E.classify(ws(), ss(), mem(), expired.memberId, TODAY).find((x) => x.key === "expired")!;
  const soonMember = ws().ledger.find((l) => l.expiresOn && l.expiresOn > TODAY && l.expiresOn <= "2026-12-09" && bal(l.memberId).available > 0)!.memberId;
  const cs = E.classify(ws(), ss(), mem(), soonMember, TODAY).find((x) => x.key === "expiring")!;
  expect(ce.points > 0 && cs.points > 0 && cs.redeemable && !ce.redeemable, `expired ${ce.points}, soon ${cs.points}`);
  return `${expired.memberId} expired ${ce.points}; ${soonMember} expiring within 30 days ${cs.points}`;
});
test(5, "TDS Kitty is a separate bucket", "deterministic", () => {
  const k = ws().ledger.find((l) => l.type === "tds_kitty_deduction")!;
  const scan = ws().ledger.find((l) => l.ref === k.ref && l.type === "scan_credit")!;
  expect(k.bucket === "tds_kitty" && scan.bucket === "available" && scan.points + k.points === scan.gross, "split");
  expect(!BUCKET.tds_kitty.redeemable, "kitty redeemable");
  return `${k.ref}: gross ${scan.gross} = available ${scan.points} + Kitty ${k.points}`;
});
test(6, "GST-locked points stay separate", "deterministic", () => {
  const id = gatedRetailer();
  const c = E.classify(ws(), ss(), mem(), id, TODAY).find((x) => x.key === "gst")!;
  expect(c.points > 0 && !c.redeemable && !BUCKET.gst_locked.redeemable, "gst classification");
  return `${id}: ${c.points} GST-locked points, not redeemable`;
});
test(7, "Last-known balance is shown when the wallet service is unavailable", "deterministic", () => {
  const id = eligibleEP()[0].id;
  expect(W.refreshBalance(SNEHA, id).ok, "refresh");
  const live = bal(id).available;
  W.setServiceMode(SNEHA, "unavailable");
  const v = E.balanceView(ws(), ss(), mem(), id, `${TODAY}T15:00`);
  W.setServiceMode(SNEHA, "available");
  expect(v.state === "last_known" && v.balances!.available === live && !!v.retrievedAt, v.state);
  return `${id}: last known ${live} shown with retrieval time ${v.retrievedAt}`;
});
test(8, "Balance is never replaced by a false zero", "deterministic", () => {
  const id = eligibleEP()[3].id;
  W.setServiceMode(SNEHA, "timeout");
  const v = E.balanceView(ws(), ss(), mem(), id, `${TODAY}T15:00`);
  const r = W.refreshBalance(SNEHA, id);
  W.setServiceMode(SNEHA, "available");
  expect(v.state === "none" && v.balances === null && !r.ok, "false zero");
  return "No snapshot + timeout → balance unknown (null), refresh refused, not zero";
});

/* ======================= Manual points operations (9–17) ======================= */
let adjId = "";
test(9, "Single-member Base Points addition through approval", "governance", () => {
  const id = eligibleEP()[5].id;
  const before = bal(id).available;
  const r = W.submitAdjustment(SNEHA, { memberId: id, programme: "EP", direction: "add", category: "base", points: 200, reasonCode: "ADJ-SCAN-FAIL", remarks: "Test credit", approvalCode: "VG-T-9" });
  expect(r.ok, r.errors.join("; "));
  adjId = r.id!;
  expect(bal(id).available === before, "posted before approval");
  const a = ws().adjustments.find((x) => x.id === adjId)!;
  expect(approve2(a.approvalRequestId!), "approvals");
  const done = ws().adjustments.find((x) => x.id === adjId)!;
  expect(done.status === "completed" && bal(id).available === before + 200 && ws().ledger.find((l) => l.id === done.ledgerIds[0])?.type === "manual_add", done.status);
  return `${adjId}: +200 only after both approvals (${done.ledgerIds[0]})`;
});
test(10, "Single-member Scheme Points deduction", "governance", () => {
  const id = members().find((m) => bal(m.id).scheme >= 50 && m.programme !== "DD")!.id;
  const before = bal(id).scheme;
  const r = W.submitAdjustment(SNEHA, { memberId: id, programme: members().find((m) => m.id === id)!.programme, direction: "deduct", category: "scheme", points: 10, reasonCode: "ADJ-SCHEME-CORR", remarks: "Test", approvalCode: "VG-T-10" });
  expect(r.ok, r.errors.join("; "));
  expect(approve2(ws().adjustments.find((x) => x.id === r.id)!.approvalRequestId!), "approvals");
  expect(bal(id).scheme === before - 10, `${bal(id).scheme} vs ${before - 10}`);
  return `${id}: scheme ${before} → ${before - 10}`;
});
test(11, "Missing reason or remarks blocks submission", "blocked", () => {
  const id = eligibleEP()[0].id;
  const a = W.submitAdjustment(SNEHA, { memberId: id, programme: "EP", direction: "add", category: "base", points: 5, reasonCode: "", remarks: "", approvalCode: "X" });
  expect(!a.ok && a.errors.some((e) => e.includes("reason code")) && a.errors.some((e) => e.includes("Remarks")), a.errors.join("; "));
});
test(12, "Missing approval reference blocks submission", "blocked", () => {
  const a = W.submitAdjustment(SNEHA, { memberId: eligibleEP()[0].id, programme: "EP", direction: "add", category: "base", points: 5, reasonCode: "ADJ-OTHER", remarks: "x", approvalCode: "" });
  expect(!a.ok && a.errors.some((e) => e.includes("Approval code")), a.errors.join("; "));
});
test(13, "Maker cannot approve their own adjustment", "governance", () => {
  const r = W.submitAdjustment(SNEHA, { memberId: eligibleEP()[1].id, programme: "EP", direction: "add", category: "base", points: 15, reasonCode: "ADJ-OTHER", remarks: "x", approvalCode: "Y" });
  const q = ws().adjustments.find((x) => x.id === r.id)!.approvalRequestId!;
  const self = decide(SNEHA, q);
  expect(!self.ok && req(q).status === "pending_approval", self.errors.join("; "));
  return "Maker's decision refused by the approval engine";
});
const reasons = ["ADJ-SCAN-FAIL", "ADJ-GOODWILL", "ADJ-SCHEME-CORR", "ADJ-DUP-CREDIT", "ADJ-OTHER"];
const csv = (rows: string[][]) => ["member_id,programme,points_category,adjustment_type,points,reason_code,remarks", ...rows.map((r) => r.join(","))].join("\n");
test(14, "Bulk CSV validation", "deterministic", () => {
  const [a, b] = eligibleEP().slice(6, 8);
  const v = E.validateBatch(ws(), ss(), mem(), csv([[a.id, "EP", "base", "add", "50", "ADJ-SCAN-FAIL", "x"], [b.id, "EP", "base", "add", "60", "ADJ-SCAN-FAIL", "y"]]), reasons);
  expect(v.headerOk && v.rows.every((r) => r.result === "valid"), JSON.stringify(v.rows.map((r) => r.message)));
  const bad = E.validateBatch(ws(), ss(), mem(), "member,points\nX,1", reasons);
  expect(!bad.headerOk, "bad header accepted");
  return "2 valid rows; wrong header refused";
});
test(15, "Duplicate CSV rows are detected", "deterministic", () => {
  const a = eligibleEP()[6];
  const v = E.validateBatch(ws(), ss(), mem(), csv([[a.id, "EP", "base", "add", "50", "ADJ-SCAN-FAIL", "x"], [a.id, "EP", "base", "add", "50", "ADJ-SCAN-FAIL", "x"]]), reasons);
  expect(v.rows[1].result === "duplicate" && v.rows[1].duplicateOf === 2, v.rows[1].message);
});
test(16, "Invalid rows are reported, never processed silently", "deterministic", () => {
  const a = eligibleEP()[6];
  const v = E.validateBatch(ws(), ss(), mem(), csv([["MBR-XX-0000", "EP", "base", "add", "5", "ADJ-OTHER", "x"], [a.id, "ST", "base", "add", "5", "ADJ-OTHER", "x"], [a.id, "EP", "bonus", "add", "-5", "BAD", ""], [a.id, "EP", "base", "deduct", "99999999", "ADJ-OTHER", "x"]]), reasons);
  expect(v.rows.every((r) => r.result === "invalid" && r.errors.length > 0), JSON.stringify(v.rows.map((r) => r.result)));
  return v.rows.map((r) => `row ${r.row}: ${r.errors[0]}`).join(" | ");
});
test(17, "Approved batch execution is tracked per row; atomic policy refuses invalid files", "governance", () => {
  const [a, b] = eligibleEP().slice(6, 8);
  const bad = W.validateBatchFile(SNEHA, "bad.csv", csv([[a.id, "EP", "base", "add", "50", "ADJ-SCAN-FAIL", "x"], ["MBR-XX-1", "EP", "base", "add", "5", "ADJ-OTHER", "x"]]));
  expect(!W.submitBatch(SNEHA, bad.id!, "VG-B", "r").ok, "atomic batch with invalid rows submitted");
  const ok = W.validateBatchFile(SNEHA, "ok.csv", csv([[a.id, "EP", "base", "add", "50", "ADJ-SCAN-FAIL", "x"], [b.id, "EP", "base", "add", "60", "ADJ-SCAN-FAIL", "y"]]));
  expect(W.submitBatch(SNEHA, ok.id!, "VG-B2", "Outage").ok, "submit");
  const bt = ws().batches.find((x) => x.id === ok.id)!;
  expect(approve2(bt.approvalRequestId!), "approvals");
  const done = ws().batches.find((x) => x.id === ok.id)!;
  expect(done.status === "completed" && done.rows.every((r) => r.result === "completed" && r.ledgerIds.length === 1), JSON.stringify(done.rows.map((r) => r.result)));
  return `${ok.id}: 2 rows completed with their own ledger lines; ${bad.id} refused under the atomic policy`;
});

/* ======================= Reversals and transfers (18–27) ======================= */
const credit = (id: string, skip = 0) => ws().ledger.filter((l) => l.memberId === id && l.type === "scan_credit" && l.bucket === "available" && l.status === "completed" && !lines().some((x) => x.originalId === l.id))[skip];
function reverse(n: number, type: string, code: string) {
  const m = eligibleEP().find((x) => credit(x.id, 3) && bal(x.id).available > 500)!;
  const o = credit(m.id, 3 + n);
  const r = W.submitReversal(SNEHA, { originalLedgerId: o.id, points: Math.min(o.points, 20), reasonCode: code, comment: "Test reversal", evidence: ["note.pdf"] });
  expect(r.ok, r.errors.join("; "));
  expect(approve2(ws().reversals.find((x) => x.id === r.id)!.approvalRequestId!), "approvals");
  const rv = ws().reversals.find((x) => x.id === r.id)!;
  const line = ws().ledger.find((l) => l.id === rv.ledgerIds[0])!;
  expect(rv.status === "completed" && line.type === type && line.originalId === o.id && ws().ledger.some((l) => l.id === o.id), rv.status);
  return `${rv.id}: ${line.id} (${line.points}) references ${o.id}; original kept`;
}
test(18, "Sales-return reversal", "governance", () => reverse(0, "sales_return_reversal", "REV-SALES-RETURN"));
test(19, "Invalid-claim reversal", "governance", () => reverse(1, "invalid_claim_reversal", "REV-INVALID-CLAIM"));
test(20, "Wrong-credit reversal", "governance", () => reverse(2, "wrong_credit_reversal", "REV-WRONG-CREDIT"));
test(21, "Reversal needs a second person; one stage does not post", "governance", () => {
  const m = eligibleEP().find((x) => credit(x.id, 8))!;
  const o = credit(m.id, 8);
  const r = W.submitReversal(SNEHA, { originalLedgerId: o.id, points: 5, reasonCode: "REV-INVALID-CLAIM", comment: "x", evidence: [] });
  const q = ws().reversals.find((x) => x.id === r.id)!.approvalRequestId!;
  expect(!decide(SNEHA, q).ok, "maker approved");
  decide(LAKSHMI, q);
  expect(ws().reversals.find((x) => x.id === r.id)!.ledgerIds.length === 0 && req(q).status === "partially_approved", req(q).status);
  const noComment = W.submitReversal(SNEHA, { originalLedgerId: credit(m.id, 9).id, points: 5, reasonCode: "REV-INVALID-CLAIM", comment: "", evidence: [] });
  expect(!noComment.ok && noComment.errors.some((e) => e.includes("comment")), "comment optional");
  return "Maker refused; after stage 1 only, nothing posted; comment compulsory";
});
let trfId = "";
test(22, "Transfer within the same programme", "governance", () => {
  const [a, b] = eligibleEP().slice(10, 12);
  const [ba, bb] = [bal(a.id).available, bal(b.id).available];
  const r = W.submitTransfer(SNEHA, { fromMemberId: a.id, toMemberId: b.id, points: 50, reasonCode: "TRF-DISPUTE", comment: "Test", evidence: ["qr.jpg"] });
  expect(r.ok, r.errors.join("; "));
  trfId = r.id!;
  expect(approve2(ws().transfers.find((x) => x.id === trfId)!.approvalRequestId!), "approvals");
  expect(bal(a.id).available === ba - 50 && bal(b.id).available === bb + 50, "balances");
  return `${trfId}: ${a.id} −50, ${b.id} +50`;
});
test(23, "Cross-programme transfer is rejected", "blocked", () => {
  const st = members().find((m) => m.programme === "ST" && m.status === "redemption_enabled")!;
  const v = E.validateTransfer(ws(), ss(), mem(), { fromMemberId: eligibleEP()[0].id, toMemberId: st.id, points: 5, reasonCode: "TRF-DISPUTE", comment: "x", evidence: ["a"] });
  expect(!v.ok && v.errors.some((e) => e.includes("same programme")), v.errors.join("; "));
});
test(24, "Insufficient source balance is refused (no negative balance)", "blocked", () => {
  const [a, b] = eligibleEP().slice(10, 12);
  const v = E.validateTransfer(ws(), ss(), mem(), { fromMemberId: a.id, toMemberId: b.id, points: bal(a.id).available + 1, reasonCode: "TRF-DISPUTE", comment: "x", evidence: ["a"] });
  expect(!v.ok && v.errors.some((e) => e.includes("negative")), v.errors.join("; "));
});
test(25, "Debit and credit share the transfer reference", "deterministic", () => {
  const ls = ws().ledger.filter((l) => l.ref === trfId);
  expect(ls.length === 2 && ls.some((l) => l.type === "transfer_debit") && ls.some((l) => l.type === "transfer_credit") && ls.reduce((n, l) => n + l.points, 0) === 0, `${ls.length} lines`);
  return `${trfId}: ${ls.map((l) => l.id).join(" + ")} net zero`;
});
test(26, "Evidence attachment is required for a transfer", "blocked", () => {
  const [a, b] = eligibleEP().slice(10, 12);
  const v = E.validateTransfer(ws(), ss(), mem(), { fromMemberId: a.id, toMemberId: b.id, points: 5, reasonCode: "TRF-DISPUTE", comment: "x", evidence: [] });
  expect(!v.ok && v.errors.some((e) => e.includes("evidence")), v.errors.join("; "));
});
test(27, "Historical ledger entries are preserved", "deterministic", () => {
  const before = JSON.parse(seedLedger) as WalletState["ledger"];
  const now = new Map(ws().ledger.map((l) => [l.id, JSON.stringify(l)]));
  const changed = before.filter((l) => now.get(l.id) !== JSON.stringify(l));
  expect(changed.length === 0 && ws().ledger.length > before.length, `${changed.length} seed lines changed`);
  return `${before.length} seed lines unchanged; ${ws().ledger.length - before.length} new lines appended`;
});

/* ======================= Settlement (28–35) ======================= */
test(28, "Base Points are immediately redeemable (subject to eligibility)", "deterministic", () => {
  const b = lines().filter((l) => l.type === "base_credit");
  expect(b.length > 0 && b.every((l) => l.bucket === "available"), "base credit bucket");
  return `${b.length} Base Points credits from Phase 6 land in Available`;
});
test(29, "Scheme points remain unsettled until settlement", "deterministic", () => {
  const acc = ss().accruals.filter((a) => a.bucket === "unsettled" && (a.result === "accrued" || a.result === "credited") && a.points > 0);
  const out = lines().filter((l) => l.type === "settlement_release" && l.bucket === "available").reduce((n, l) => n + l.points, 0);
  expect(out === acc.reduce((n, a) => n + a.releasedPoints, 0), `${out}`);
  return `Only settlement releases (${out}) move scheme points to Available`;
});
test(30, "Partial settlement uses the configured percentage (not a 70/30 default)", "deterministic", () => {
  const sc = schemeById(ss(), "SCH-0002")!;
  const t = displayVersion(sc).config.settlement.tranches[0];
  const p = settlementPreview(ss(), sc, t.id, "2026-09-01", "2026-10-31", TODAY);
  expect(p.releasePct === t.pct && t.pct !== 70, `${p.releasePct}`);
  return `SCH-0002 ${t.label}: ${t.pct}% from the scheme configuration`;
});
test(31, "Two-level approval: one stage releases nothing", "governance", () => {
  const set = ss().settlements.find((s) => s.status === "pending_approval")!;
  decide(ANITA, set.approvalRequestId!);
  expect(!ss().releases.some((r) => r.requestId === set.id) && !lines().some((l) => l.settlementRef === set.id), "released after one stage");
  decide(LAKSHMI, set.approvalRequestId!);
  const after = ss().settlements.find((s) => s.id === set.id)!;
  expect(after.status === "executed" || after.status === "execution_failed", after.status);
  return `${set.id}: stage 1 → nothing; stage 2 → ${after.status}`;
});
test(32, "Failed settlement posts nothing", "governance", () => {
  const sc = schemeById(ss(), "SCH-0010")!;
  const t = displayVersion(sc).config.settlement.tranches.find((x) => x.trigger === "final_settlement") ?? displayVersion(sc).config.settlement.tranches[0];
  const cfg = displayVersion(sc).config;
  const r = createSettlementRequest(RAHUL, sc.id, t.id, cfg.duration.start, cfg.duration.end, true);
  if (!r.ok) return `No releasable points on SCH-0010 (${r.errors[0]}); failure path covered by Phase 6 test 111`;
  const set = ss().settlements.find((s) => s.id === r.id)!;
  decide(ANITA, set.approvalRequestId!);
  decide(LAKSHMI, set.approvalRequestId!);
  expect(ss().settlements.find((s) => s.id === set.id)!.status === "execution_failed" && !lines().some((l) => l.settlementRef === set.id), "failed settlement posted");
  return `${set.id}: execution failed (simulated), no release lines`;
});
test(33, "Settlement Release ledger entries", "deterministic", () => {
  const rel = ss().releases[0];
  const ls = lines().filter((l) => l.settlementRef === rel.requestId);
  expect(ls.some((l) => l.bucket === "available" && l.type === "settlement_release") && ls.some((l) => l.bucket === "scheme_unsettled" && l.points < 0), "release lines");
  return `${rel.requestId}: ${ls.length} settlement release lines (out of Scheme, into Available)`;
});
test(34, "Scheme and version references are preserved", "deterministic", () => {
  const ls = lines().filter((l) => l.type === "settlement_release");
  expect(ls.every((l) => l.schemeId && l.schemeVersion && l.settlementRef && l.approvalRequestId !== undefined), "references missing");
});
test(35, "Released points reconcile with the ledger", "deterministic", () => {
  const rows = E.reconcile(ws(), ss(), mem(), approvalStore.get().requests, "test").filter((r) => r.type === "settlement_release");
  expect(rows.length > 0 && rows.some((r) => r.status === "matched"), JSON.stringify(rows.map((r) => r.difference)));
  return rows.map((r) => `${r.ref}: ${r.status}`).join(", ");
});

/* ======================= EP/IMP TDS (36–44) ======================= */
test(36, "PAN available: provisional 10% at scan", "deterministic", () => {
  const s = scanTdsSplit("EP", true, 250, DEFAULT_CONFIG);
  expect(s.kitty === 25 && s.net === 225 && s.ratePct === 10, JSON.stringify(s));
});
test(37, "PAN unavailable: provisional 20% at scan", "deterministic", () => {
  const s = scanTdsSplit("EP", false, 250, DEFAULT_CONFIG);
  expect(s.kitty === 50 && s.net === 200 && s.ratePct === 20, JSON.stringify(s));
});
test(38, "Scan-time TDS is stored in the Kitty", "deterministic", () => {
  const ks = ws().ledger.filter((l) => l.type === "tds_kitty_deduction");
  const ok = ks.every((k) => { const s = ws().ledger.find((l) => l.ref === k.ref && l.type === "scan_credit")!; const pan = E.panVerified(mem(), k.memberId); return k.bucket === "tds_kitty" && k.points === Math.floor((s.gross! * (pan ? 10 : 20)) / 100); });
  expect(ks.length > 0 && ok, "kitty amounts");
  return `${ks.length} Kitty lines, each 10% / 20% of gross by PAN status`;
});
test(39, "Remaining scan points are credited separately", "deterministic", () => {
  const s = ws().ledger.find((l) => l.programme === "EP" && l.type === "scan_credit" && l.bucket === "available")!;
  const k = ws().ledger.find((l) => l.ref === s.ref && l.type === "tds_kitty_deduction")!;
  expect(s.points === s.gross! - k.points, "net");
});
test(40, "FY TDS at or below ₹20,000: Kitty credited back", "deterministic", () => {
  const r = ws().tdsFy.find((x) => x.status === "completed")!;
  const a = E.fyAssessment(ws(), ss(), mem(), r.memberId, r.fy);
  expect(r.outcome === "refund_kitty" && a.deductedInr <= 20000 && r.ledgerIds.length === 2, `${a.deductedInr}`);
  return `${r.memberId}: ₹${a.deductedInr} ≤ ₹20,000 → refund (${r.ledgerIds.join(", ")})`;
});
test(41, "FY TDS above ₹20,000 is identified", "deterministic", () => {
  const r = ws().tdsFy.find((x) => x.outcome === "tds_paid_bcr")!;
  const a = E.fyAssessment(ws(), ss(), mem(), r.memberId, r.fy);
  expect(a.deductedInr > 20000 && a.outcome === "tds_paid_bcr", `${a.deductedInr}`);
  return `${r.memberId}: ₹${a.deductedInr} > ₹20,000`;
});
test(42, "Above-threshold calculation stays blocked until the slab is configured", "blocked", () => {
  const r = ws().tdsFy.find((x) => x.outcome === "tds_paid_bcr")!;
  const out = executeFyRefund(ws(), r, { ss: ss(), mem: mem(), now: `${TODAY}T15:00`, requestId: "TEST", approvers: [] });
  expect(r.status === "business_confirmation_required" && !out.ok && out.message.includes("business confirmation") && !lines().some((l) => l.memberId === r.memberId && l.bucket === "tds_paid"), out.message);
  return out.message;
});
test(43, "Kitty refund through Finance approval", "governance", () => {
  const r = ws().tdsFy.find((x) => x.status === "pending_approval" && x.outcome === "refund_kitty")!;
  const before = bal(r.memberId).available;
  expect(decide(LAKSHMI, r.approvalRequestId!).ok, "decide");
  const done = ws().tdsFy.find((x) => x.id === r.id)!;
  expect(done.status === "completed" && bal(r.memberId).available === before + r.kittyPoints, done.status);
  return `${r.id}: ${r.kittyPoints} Kitty points credited back`;
});
test(44, "TDS Paid is a separate, non-redeemable classification", "deterministic", () => {
  expect(!BUCKET.tds_paid.redeemable && BUCKET.tds_paid !== BUCKET.tds_kitty, "tds paid");
  const paid = lines().filter((l) => l.bucket === "tds_paid").length;
  return `TDS Paid bucket kept apart from Kitty; ${paid} lines moved (none until OP-TDS1)`;
});

/* ======================= Retailer / ST / CS TDS (45–51) ======================= */
test(45, "No scan-time TDS outside EP/IMP", "deterministic", () => {
  expect(["ST", "CS", "Retailer"].every((p) => !scanTdsSplit(p as "ST", true, 100, DEFAULT_CONFIG).applies) && !lines().some((l) => l.bucket === "tds_kitty" && l.programme !== "EP"), "kitty outside EP");
});
test(46, "No TDS Kitty for Retailer / ST / CS", "deterministic", () => {
  const r = members().find((m) => m.programme === "Retailer")!;
  expect(bal(r.id).tdsKitty === 0 && TDS_MODEL.Retailer.model === "on_redemption" && TDS_MODEL.ST.model === "on_redemption" && TDS_MODEL.CS.model === "on_redemption", "kitty");
});
test(47, "TDS is recorded at redemption for Retailer / ST / CS", "deterministic", () => {
  const rs = ws().redemptions.filter((r) => ["ST", "CS", "Retailer"].includes(r.programme) && r.debitLedgerId);
  expect(rs.length > 0 && rs.every((r) => r.tds.model === "on_redemption" && r.tds.status === "recorded" && r.netInr === r.grossInr - (r.tds.amountInr ?? 0)), "records");
  return `${rs.length} legacy redemption records with recorded TDS; net = gross − TDS`;
});
test(48, "PAN validation status is taken from KYC", "deterministic", () => {
  const rs = ws().redemptions.filter((r) => r.origin === "legacy_record");
  expect(rs.every((r) => (r.tds.panStatus === "verified") === E.panVerified(mem(), r.memberId)), "pan");
});
test(49, "Missing redemption slab produces Business Confirmation Required", "blocked", () => {
  expect(["Retailer", "ST", "CS"].every((p) => redemptionTds(p as "ST").status === "bcr") && redemptionTds("DD").status === "bcr" && redemptionTds("EP").status === "not_applicable", "bcr");
  const rt = members().find((m) => m.programme === "Retailer" && E.panVerified(mem(), m.id) && bal(m.id).available > 400)!;
  const g = W.submitGift(SNEHA, { memberId: rt.id, catalogueRef: "GFT-CAT-0204", quantity: 1, foc: false, reason: "GFT-ON-BEHALF", remarks: "test", evidence: [] });
  expect(g.ok, g.errors.join("; "));
  decide(LAKSHMI, ws().gifts.find((x) => x.id === g.id)!.approvalRequestId!);
  expect(ws().gifts.find((x) => x.id === g.id)!.status === "business_confirmation_required", ws().gifts.find((x) => x.id === g.id)!.status);
  return "Retailer gift approved but execution held: TDS calculation, business confirmation required";
});
test(50, "Retailer reserve: SOW example ₹2,900 − ₹2,000 = ₹900", "deterministic", () => {
  const rt = members().find((m) => m.programme === "Retailer")!;
  const own = ws().reserves.find((r) => r.status === "active")!;
  expect(E.redeemableAfterReserve(2900, 2000) === 900 && E.reserveFor(ws(), "MBR-RT-NONE", "Retailer").reserveInr === 2000 && E.reserveFor(ws(), own.memberId!, "Retailer").reserveInr === own.reserveInr && !E.reserveFor(ws(), rt.id, "EP").applies, "reserve");
  return `₹900 redeemable; default ₹2,000; ${own.memberId} specific ₹${own.reserveInr}; not applied to EP`;
});
test(51, "Financial-year TDS summary", "deterministic", () => {
  const f = "FY 2025-26";
  const rec = ws().redemptions.filter((r) => r.tds.status === "recorded" && fy(r.createdAt) === f).reduce((n, r) => n + (r.tds.amountInr ?? 0), 0);
  const kitty = lines().filter((l) => l.type === "tds_kitty_deduction" && fy(l.at) === f).reduce((n, l) => n + l.points, 0);
  expect(rec > 0 && kitty > 0, `${rec} ${kitty}`);
  return `${f}: scan-time Kitty ${kitty} pts; redemption-time TDS ₹${rec} (kept apart)`;
});

/* ======================= GST eligibility (52–61) ======================= */
const fakeAccrual = (memberId: string, schemeId: string, points: number, i: number): RewardAccrual => ({ id: `T-ACC-${i}`, idempotencyKey: `T-${i}`, schemeId, schemeVersion: 1, ruleId: "R", ruleVersion: "1", component: "milestone", sourceRef: `T-SRC-${i}`, memberId, programme: "Retailer", branchCode: members().find((m) => m.id === memberId)!.branchCode, skuId: null, categoryId: null, effectiveDate: "2026-10-01", calculatedAt: "2026-10-01T10:00", result: "accrued", points, bucket: "unsettled", ledgerRef: null, reversalOf: null, reversalRef: null, releasedPoints: 0, note: "", origin: "seed" });
const withSchemes = (memberId: string, ids: string[]): SchemeState => ({ ...ss(), accruals: ids.map((s, i) => fakeAccrual(memberId, s, 100 + i, i)), releases: [], settlements: [] });
test(52, "Retailer without GST verification is gated", "deterministic", () => {
  const id = gatedRetailer();
  expect(E.gstGate(ws(), ss(), mem(), id, TODAY).status === "gated", "gate");
  return id;
});
test(53, "Base Points redeemable up to the ₹19,999 threshold", "deterministic", () => {
  const id = gatedRetailer();
  const g = E.gstGate(ws(), ss(), mem(), id, TODAY);
  expect(g.thresholdInr === 19999 && g.eligibleBaseInr === Math.min(g.availableInr, 19999), JSON.stringify(g).slice(0, 120));
  return `Eligible ₹${g.eligibleBaseInr} of ₹${g.availableInr}`;
});
test(54, "Base Points above the threshold are locked", "deterministic", () => {
  const id = gatedRetailer();
  const g = E.gstGate(ws(), ss(), mem(), id, TODAY);
  expect(g.lockedBaseInr === Math.max(0, g.availableInr - 19999) && bal(id).gstLocked > 0, `${g.lockedBaseInr}`);
  return `${id}: ${bal(id).gstLocked} points locked in the GST bucket`;
});
test(55, "Milestone, cross-category and unclassified (One VG) scheme points are locked", "deterministic", () => {
  const id = gatedRetailer();
  const g = E.gstGate(ws(), withSchemes(id, ["SCH-0002", "SCH-0007", "SCH-T-ONEVG"]), mem(), id, TODAY);
  expect(g.bySchemes.length === 3 && g.bySchemes.every((x) => x.locked) && g.lockedSchemePoints === 303, JSON.stringify(g.bySchemes));
});
function exception(cls: "du" | "battery" | "wssg", schemeId: string) {
  if (!GST_SCHEME_CLASS[schemeId]) GST_SCHEME_CLASS[schemeId] = { cls, note: "test classification" };
  const id = gatedRetailer();
  const g = E.gstGate(ws(), withSchemes(id, [schemeId]), mem(), id, TODAY);
  expect(GST_SCHEME_CLASS[schemeId].cls === cls && g.bySchemes[0].locked === false && g.exceptionSchemePoints === 100, JSON.stringify(g.bySchemes));
  return `${schemeId} (${cls}) not affected by the GST gate`;
}
test(56, "DU exception", "deterministic", () => exception("du", "SCH-T-DU"));
test(57, "Battery exception", "deterministic", () => exception("battery", "SCH-0016"));
test(58, "WSSG exception", "deterministic", () => exception("wssg", "SCH-0011"));
test(59, "GST verification unlocks full redemption", "deterministic", () => {
  const id = gatedRetailer();
  const w2 = { ...ws(), gst: ws().gst.map((g) => (g.memberId === id ? { ...g, verification: "verified" as const } : g)) };
  const g = E.gstGate(w2, withSchemes(id, ["SCH-0002"]), mem(), id, TODAY);
  expect(g.status === "verified" && g.bySchemes.every((x) => !x.locked) && g.eligibleBaseInr === g.availableInr, g.status);
});
let govId = "";
test(60, "GST override submission", "governance", () => {
  const id = ws().gst.find((g) => g.verification !== "verified" && !g.override && !ws().gstOverrides.some((o) => o.memberId === g.memberId && o.status === "pending_approval") && bal(g.memberId).gstLocked > 0)!.memberId;
  const r = W.submitGstOverride(SNEHA, { memberId: id, requested: "unlock_until", until: "2026-12-31", reasonCode: "GST-EXCEPTION", remarks: "Test", evidence: ["cert.pdf"] });
  expect(r.ok, r.errors.join("; "));
  govId = r.id!;
  const noRemarks = W.submitGstOverride(SNEHA, { memberId: gatedRetailer(), requested: "unlock_until", until: "2026-12-31", reasonCode: "GST-EXCEPTION", remarks: "", evidence: [] });
  expect(!noRemarks.ok, "remarks optional");
  return `${govId} pending V-Guard approval`;
});
test(61, "Maker cannot approve their own GST override; approval unlocks without verifying", "governance", () => {
  const o = ws().gstOverrides.find((x) => x.id === govId)!;
  expect(!decide(SNEHA, o.approvalRequestId!).ok, "maker approved");
  expect(decide(ANITA, o.approvalRequestId!).ok, "anita");
  const rec = ws().gst.find((g) => g.memberId === o.memberId)!;
  expect(rec.override && rec.verification !== "verified" && bal(o.memberId).gstLocked === 0, JSON.stringify(rec));
  return `${o.memberId}: override in force, GSTIN still ${rec.verification}`;
});

/* ======================= Redemption (62–80) ======================= */
const red = (pred: (r: WalletState["redemptions"][number]) => boolean) => ws().redemptions.find(pred);
test(62, "DBT redemption with payout and UTR", "deterministic", () => {
  const r = red((x) => x.method === "dbt" && x.stage === "paid" && !!x.utr)!;
  expect(ws().payouts.some((p) => p.redemptionId === r.id && p.status === "success"), "payout");
  return `${r.id} · UTR ${r.utr}`;
});
test(63, "UPI redemption", "deterministic", () => { const r = red((x) => x.method === "upi" && !!x.debitLedgerId)!; expect(!!r, "upi"); return r.id; });
test(64, "Voucher redemption keeps the code masked", "deterministic", () => {
  const vs = ws().redemptions.filter((x) => x.voucher);
  expect(vs.length > 0 && vs.every((x) => /^XXXX-XXXX-\d{4}$/.test(x.voucher!.codeMasked)), "masking");
  return `${vs.length} vouchers, codes masked`;
});
test(65, "V-Guard.com gift redemption", "deterministic", () => { const r = red((x) => x.method === "vguard_com" && !!x.product)!; expect(!!r.product!.catalogueRef, "catalogue"); return r.id; });
test(66, "Product redemption", "deterministic", () => { const r = red((x) => x.method === "product" && !!x.product)!; expect(!!r.product!.fulfilment, "fulfilment"); return r.id; });
test(67, "KYC-blocked redemption", "blocked", () => {
  const m = members().find((x) => x.programme === "EP" && x.status === "redemption_kyc_pending")!;
  expect(E.redemptionBlockers(ws(), ss(), mem(), m.id, "upi", 10, TODAY).some((b) => b.code === "kyc"), "kyc");
});
test(68, "Bank-verification-blocked redemption", "blocked", () => {
  const m = members().find((x) => x.programme === "EP" && mem().documents.find((d) => d.memberId === x.id && d.type === "bank")?.status !== "approved")!;
  expect(E.redemptionBlockers(ws(), ss(), mem(), m.id, "dbt", 10, TODAY).some((b) => b.code === "bank"), "bank");
});
test(69, "GST-blocked redemption above the eligible amount", "blocked", () => {
  const id = gatedRetailer();
  const g = E.gstGate(ws(), ss(), mem(), id, TODAY);
  expect(E.redemptionBlockers(ws(), ss(), mem(), id, "dbt", Math.floor(g.eligibleBaseInr) + 1, TODAY).some((b) => b.code === "gst" || b.code === "balance"), "gst");
});
test(70, "Duplicate-account restriction blocks redemption", "blocked", () => {
  expect(E.redemptionBlockers(ws(), ss(), mem(), "MBR-EP-0010", "upi", 10, TODAY).some((b) => b.code === "duplicate"), "dedup");
});
test(71, "Store geo-validation pending blocks a Retailer", "blocked", () => {
  const m = members().find((x) => x.programme === "Retailer")!;
  const mem2 = { ...mem(), members: mem().members.map((x) => (x.id === m.id ? { ...x, addresses: { ...x.addresses, working: { ...(x.addresses.working ?? x.addresses.home!), verification: "unverified" as const } } } : x)) };
  expect(E.redemptionBlockers(ws(), ss(), mem2, m.id, "dbt", 10, TODAY).some((b) => b.code === "geo"), "geo");
});
test(72, "Single DBT/UPI threshold ₹10,000", "deterministic", () => {
  const id = eligibleEP()[2].id;
  const over = E.limitCheck(ws(), "EP", id, "dbt", 10001, "2027-01-15T10:00");
  const at = E.limitCheck(ws(), "EP", id, "dbt", 10000, "2027-01-15T10:00");
  expect(over.manualValidation && !at.manualValidation, `${over.reasons}`);
  return "₹10,001 → manual validation; ₹10,000 → within limit";
});
test(73, "Monthly combined threshold ₹30,000", "deterministic", () => {
  const id = eligibleEP()[2].id;
  const base = ws().redemptions[0];
  const w2 = { ...ws(), redemptions: [...ws().redemptions, { ...base, id: "T-1", memberId: id, method: "dbt" as const, grossInr: 9000, createdAt: "2027-01-03T10:00", stage: "paid" as const }, { ...base, id: "T-2", memberId: id, method: "upi" as const, grossInr: 9000, createdAt: "2027-01-05T10:00", stage: "paid" as const }, { ...base, id: "T-3", memberId: id, method: "upi" as const, grossInr: 9000, createdAt: "2027-01-07T10:00", stage: "paid" as const }] };
  const r = E.limitCheck(w2, "EP", id, "upi", 4000, "2027-01-20T10:00");
  const ok = E.limitCheck(w2, "EP", id, "upi", 3000, "2027-01-20T10:00");
  expect(r.manualValidation && !ok.manualValidation && r.monthTotalInr === 27000, `${r.monthTotalInr}`);
  return "₹27,000 + ₹4,000 → manual validation; + ₹3,000 → within";
});
test(74, "Manual validation beyond the threshold is recorded", "deterministic", () => {
  const r = red((x) => x.stage === "manual_validation")!;
  expect(r.manualValidation.required && !r.debitLedgerId && r.track === "in_process", r.id);
  return `${r.id}: ${r.manualValidation.reason}`;
});
test(75, "Failed redemption keeps its debit until reversed", "deterministic", () => {
  const r = red((x) => x.stage === "reversal_pending")!;
  expect(!!r.debitLedgerId && !r.reversalLedgerId && r.track === "fail", r.id);
  return r.id;
});
test(76, "Auto-reversal runs only through a configured window, linked to the original", "governance", () => {
  const r = red((x) => x.stage === "reversal_pending")!;
  expect(!W.runAutoReversal(SNEHA, r.id).ok, "reversed without a window");
  expect(W.updateFinDecision(SNEHA, "FD-05", { status: "confirmed", answer: "48 hours (test value)" }).ok, "decision");
  expect(W.recordReversalWindow(SNEHA, 48).ok, "window");
  const before = bal(r.memberId).available;
  const out = W.runAutoReversal(SNEHA, r.id);
  const after = ws().redemptions.find((x) => x.id === r.id)!;
  const line = ws().ledger.find((l) => l.id === after.reversalLedgerId)!;
  expect(out.ok && after.stage === "reversed" && line.originalId === r.debitLedgerId && bal(r.memberId).available === before + r.points, out.errors.join("; "));
  expect(W.runAutoReversal(SNEHA, r.id).ok === false, "reversed twice");
  return `Refused without FD-05; with a confirmed window ${line.id} returns ${r.points} points linked to ${r.debitLedgerId}`;
});
test(77, "Duplicate payout callbacks never move points twice", "deterministic", () => {
  const p = ws().payouts.find((x) => x.status === "in_process")!;
  const n = ws().ledger.length;
  expect(W.simulatePayoutCallback(SNEHA, p.id, "success", "CB-T-1").ok, "first");
  const r2 = W.simulatePayoutCallback(SNEHA, p.id, "failed", "CB-T-2");
  const r3 = W.simulatePayoutCallback(SNEHA, p.id, "success", "CB-T-1");
  const after = ws().payouts.find((x) => x.id === p.id)!;
  expect(after.status === "success" && after.callbacks.filter((c) => c.duplicate).length === 2 && ws().ledger.length === n && r2.warnings.length > 0 && r3.warnings.length > 0, after.status);
  return `${p.id}: success, then a late failure and a repeat ignored; ledger unchanged`;
});
test(78, "UTR reconciliation flags missing UTRs", "deterministic", () => {
  const rows = E.reconcile(ws(), ss(), mem(), approvalStore.get().requests, "test").filter((r) => r.type === "payout_utr");
  expect(rows.some((r) => r.status === "difference") && rows.some((r) => r.status === "matched"), "utr");
  return `${rows.filter((r) => r.status === "difference").length} of ${rows.length} payouts without a matched UTR`;
});
test(79, "Redemption cancellation is restricted to Evolve Operations", "governance", () => {
  const id = eligibleEP()[0].id;
  const ok = W.canCancelRedemption(SNEHA, id).ok && W.canCancelRedemption(RAHUL, id).ok;
  const no = [LAKSHMI, ANITA, TANUJIT].every((u) => !W.canCancelRedemption(u, id).ok);
  expect(ok && no, "cancel permission");
  return "Evolve Operations (Sneha, Rahul) may; Finance, V-Guard Client Admin and Super Admin may not";
});
test(80, "Cancellation is blocked once the payout completed", "blocked", () => {
  const r = red((x) => x.stage === "paid")!;
  const out = W.requestCancellation(SNEHA, r.id, "CAN-MEMBER-REQUEST", "test");
  expect(!out.ok && out.errors.some((e) => e.includes("paid out")), out.errors.join("; "));
});

/* ======================= Administrative controls (81–88) ======================= */
test(81, "Backend gift redemption deducts points after approval", "governance", () => {
  const m = eligibleEP().find((x) => bal(x.id).available > 2000)!;
  const before = bal(m.id).available;
  const g = W.submitGift(SNEHA, { memberId: m.id, catalogueRef: "GFT-CAT-0102", quantity: 1, foc: false, reason: "GFT-ON-BEHALF", remarks: "Test", evidence: [] });
  expect(g.ok, g.errors.join("; "));
  decide(LAKSHMI, ws().gifts.find((x) => x.id === g.id)!.approvalRequestId!);
  const done = ws().gifts.find((x) => x.id === g.id)!;
  expect(done.status === "completed" && bal(m.id).available === before - 1200 && done.ledgerIds.length === 2, done.status);
  return `${g.id}: 1,200 points to Redeemed`;
});
test(82, "FOC gift deducts no points and needs justification", "governance", () => {
  const m = eligibleEP().find((x) => bal(x.id).available > 0)!;
  expect(!W.submitGift(SNEHA, { memberId: m.id, catalogueRef: "GFT-CAT-0204", quantity: 1, foc: true, reason: "GFT-SERVICE", remarks: "x", evidence: [] }).ok, "FOC without evidence");
  const before = bal(m.id).available;
  const g = W.submitGift(SNEHA, { memberId: m.id, catalogueRef: "GFT-CAT-0204", quantity: 2, foc: true, reason: "GFT-SERVICE", remarks: "Service recovery", evidence: ["approval-mail.pdf"] });
  decide(LAKSHMI, ws().gifts.find((x) => x.id === g.id)!.approvalRequestId!);
  const done = ws().gifts.find((x) => x.id === g.id)!;
  expect(done.status === "completed" && done.ledgerIds.length === 0 && bal(m.id).available === before && done.foc, done.status);
  return `${g.id}: FOC recorded separately, no ledger lines`;
});
test(83, "Bulk gift redemption with row results and duplicates", "deterministic", () => {
  const [a, b] = eligibleEP().slice(12, 14);
  const r = W.submitGiftBatch(SNEHA, "gifts.csv", `member_id,catalogue_ref,quantity,foc,reason_code,remarks\n${a.id},GFT-CAT-0204,1,no,GFT-CAMPAIGN,Event\n${b.id},GFT-CAT-0204,1,no,GFT-CAMPAIGN,Event\n${a.id},GFT-CAT-0204,1,no,GFT-CAMPAIGN,Event\nMBR-XX-1,GFT-CAT-0204,1,no,GFT-CAMPAIGN,Event`);
  expect(r.ok && r.rows!.map((x) => x.result).join() === "valid,valid,duplicate,invalid", r.rows!.map((x) => x.result).join());
  return "2 submitted, 1 duplicate not processed, 1 invalid";
});
test(84, "Transfer comment and evidence are validated", "blocked", () => {
  const [a, b] = eligibleEP().slice(10, 12);
  const v = E.validateTransfer(ws(), ss(), mem(), { fromMemberId: a.id, toMemberId: b.id, points: 5, reasonCode: "", comment: "", evidence: [] });
  expect(!v.ok && ["comment", "evidence", "reason"].every((k) => v.errors.some((e) => e.toLowerCase().includes(k))), v.errors.join("; "));
});
test(85, "Minimum points threshold (EP/ST/CS 1,000 points) is enforced", "blocked", () => {
  const m = eligibleEP().find((x) => bal(x.id).available < 1000);
  const id = m?.id ?? eligibleEP()[0].id;
  const w2 = m ? ws() : { ...ws(), policies: ws().policies.map((p) => (p.id === "RLP-0002" ? { ...p, minTotalPoints: { ...p.minTotalPoints, value: bal(id).available + 1 } } : p)) };
  expect(E.redemptionBlockers(w2, ss(), mem(), id, "upi", 10, TODAY).some((b) => b.code === "minimum"), "minimum");
  return `${id}: below the minimum redeemable threshold`;
});
test(86, "Daily / monthly OP-08 values are not invented or enforced", "blocked", () => {
  const p = ws().policies.find((x) => x.id === "RLP-0001")!;
  const lc = E.limitCheck(ws(), "EP", eligibleEP()[0].id, "dbt", 100, `${TODAY}T10:00`);
  expect(p.dailyValueInr.value === null && p.dailyValueInr.status === "business_confirmation_required" && lc.notEnforced.length >= 3, JSON.stringify(lc.notEnforced));
  const mixed = W.submitLimitPolicy(SNEHA, { ...p, programmes: ["EP", "Retailer"] });
  expect(!mixed.ok && mixed.errors[0].includes("Retailer"), "Retailer values applied to other programmes");
  const ret = ws().policies.find((x) => x.id === "RLP-0003")!;
  expect(ret.minTotalPoints.value === 2500 && ret.minTotalPoints.status === "business_confirmation_required", "Retailer unit");
  return "OP-08 values blank and unenforced; Retailer ₹2,500 preserved with its unit flagged";
});
test(87, "Temporary GST override expires", "deterministic", () => {
  const id = gatedRetailer();
  const w2 = { ...ws(), gst: ws().gst.map((g) => (g.memberId === id ? { ...g, override: { requestId: "T", approvedAt: "2026-10-01T10:00", until: "2026-11-01", reason: "x" } } : g)) };
  expect(E.gstGate(w2, ss(), mem(), id, TODAY).status === "gated" && E.gstGate(w2, ss(), mem(), id, "2026-10-15").status === "override", "expiry");
  return "Override until 1 Nov: in force on 15 Oct, expired on 9 Nov";
});
test(88, "Financial report export is restricted by permission and audited", "governance", () => {
  const no = W.recordExport(VIKRAM, "points-ledger", "passbook", 10);
  const n = ws().audit.length;
  const yes = W.recordExport(LAKSHMI, "tds", "26q", 10);
  expect(!no.ok && yes.ok && ws().audit.length === n + 1, no.errors.join("; "));
  return "Sales Rep refused; Finance export recorded in the audit trail";
});

/* ======================= EMI (89–92) ======================= */
test(89, "EMI point burn is a ledger line", "deterministic", () => {
  const e = ws().emi.find((x) => x.status === "success")!;
  expect(ws().ledger.find((l) => l.id === e.ledgerId)?.type === "emi_burn", e.id);
  return `${e.id} → ${e.ledgerId}`;
});
test(90, "External financing reference is recorded", "deterministic", () => {
  expect(ws().emi.filter((x) => x.status === "success").every((x) => !!x.financingRef), "ref");
});
test(91, "Failed EMI reconciliation is visible", "deterministic", () => {
  const rows = E.reconcile(ws(), ss(), mem(), approvalStore.get().requests, "t").filter((r) => r.type === "emi_reference" && r.status === "difference");
  expect(rows.some((r) => r.ref === "EMI-0003"), JSON.stringify(rows.map((r) => r.ref)));
  return rows.map((r) => r.ref).join(", ");
});
test(92, "Unresolved financing partner stays Business Confirmation Required", "blocked", () => {
  expect(ws().config.emi.partner === null && !ws().config.emi.enabled && ws().decisions.find((d) => d.ref === "OP-FIN1")!.status === "open", "emi");
});

/* ---------------- Report ---------------- */
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(2)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (pass !== results.length) process.exit(1);
