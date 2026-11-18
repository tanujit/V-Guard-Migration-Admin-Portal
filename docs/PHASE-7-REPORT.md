# Phase 7 — Wallet, Points, TDS, Redemption and Financial Operations

Completion report and developer handover (Build Prompt 07, SOW Module 5 and 10.5).

> **Development build.** Every balance, ledger posting, payout, voucher, TDS figure, GSTIN, UTR and EMI
> record is mock data. A **mock wallet service** running in the browser stands in for the backend wallet,
> ledger, payout, voucher, tax, GST and financing systems. No bank payout, tax calculation, ledger
> posting, voucher issue, GST verification, EMI processing or TDS filing is operational.

## 1. Summary

| Area | Status |
| --- | --- |
| Wallet overview, member wallets, five headline values, classification | Built (mock wallet service) |
| Balance reliability (last-known balance, never a false zero) | Built; live atomic balance and ~2 s refresh are backend contracts only |
| Immutable points ledger, transaction detail, passbook and statements | Built |
| Manual adjustments (single and bulk CSV) through Maker-Checker | Built |
| Sales return / invalid claim / wrong credit reversals | Built |
| Member-to-member transfers (same programme, atomic debit + credit) | Built |
| Scheme settlement operations (Phase 6 settlement, two-level approval) | Built as a Finance view; no second settlement engine |
| EP/IMP TDS Kitty (10% / 20% provisional at scan) | Built (mock TDS adapter) |
| FY Kitty reconciliation ≤ ₹20,000 → refund | Built |
| FY reconciliation > ₹20,000 → TDS Paid | **Blocked: OP-TDS1** |
| Retailer / ST / CS TDS at redemption | Recorded values shown; **new calculation blocked: OP-TDS1** |
| Retailer TDS reserve (₹2,000 default, per-Retailer) | Built |
| Retailer GST gate, DU / Battery / WSSG exceptions, override | Built; SFDC source **not connected (OP-RET1)** |
| Redemption monitoring (DBT, UPI, voucher, V-Guard.com, product) | Built (mock records) |
| Blocked reasons, limits, manual validation | Built; OP-08 values **not invented** |
| Payout monitoring, daily reconciliation, duplicate-callback protection | Built (mock callbacks) |
| Failed redemption auto-reversal | Built; window **not configured (FD-05)** |
| Redemption cancellation (Evolve Operations only) | Built |
| Backend gift redemption (paid / FOC, single / bulk) | Built; Retailer / ST / CS execution blocked by OP-TDS1 |
| EMI via points monitoring | Monitoring only; **partner and rules open (OP-FIN1)**, disabled |
| Financial reports A–I, quarterly, 26Q layout | Built from recorded values; not statutory-ready |
| Financial reconciliation (10 views) and exceptions | Built |
| RBAC (29 permissions) and Approval Engine integration | Built |

Tests: **92 / 92** (`npm run test:wallet`). The Phase 6 suite is unchanged at **119 / 119**, and the
probes still report 12 of 14 gaps fixed. Typecheck and production build pass with no warnings.

## 2. Screens

Two navigation entries, each with secondary tabs:

- **Wallet & points** (`/wallet`): Overview · Member wallets · Points ledger (+ Passbook) ·
  Adjustments · Transfers · Sales return & reversals · Settlement · TDS · GST gate · Reports ·
  Reconciliation · Configuration.
- **Redemption & fulfilment** (`/redemption`): Overview · Requests · Payouts · Vouchers ·
  Products & V-Guard.com · Backend gifts · Cancellation · Limits & controls · EMI via points · History.

Fifty routes and tabs were checked on the production build: each renders its expected content with
no console errors. Screenshots were not captured this round because the browser pane was in use.

## 3. Wallet model (SOW 5.1, 5.1.1)

- **Balances are always derived from ledger lines.** No screen or store function edits a balance.
- **Five headline values:** Lifetime, Available, Redeemed, Scheme and TDS Deducted.
  - TDS Deducted is points for EP/IMP (Kitty model) and recorded ₹ for Retailer / ST / CS.
  - DD shows "Not configured".
- **Buckets:** available, pending, scheme_unsettled, tds_kitty, tds_paid, gst_locked, redeemed,
  expired. Each has its own colour and is never summed into another.
- **Classification:** Available, Expiring soon, Pending, Expired, Scheme unsettled, TDS Kitty,
  GST locked, and Compliance hold.
  - A compliance hold is a restriction read from Member Management. It does not move points.
- **Balance reliability:** the wallet view shows live / last-known / unknown state, the retrieval
  time and the last reconciliation time.
  - A simulator switches the wallet service to unavailable or timed out.
  - With no earlier snapshot the balance shows "unknown, not zero" (tests 7 and 8).

## 4. Ledger architecture

- `features/wallet/engine.ts → fullLedger()` merges two sources:
  - The wallet-service lines.
  - Lines read from Phase 6: Base Points credits (with the EP Kitty split), scheme accruals
    (unsettled), and settlement releases (out of Scheme, into Available, per accrual).
- **23 ledger categories.** Every line carries:
  - An idempotency key (`opKey`), reference, bucket, source and channel.
  - Original / reversal links, settlement reference, approval request, approvers, origin and remarks.
- **Previous / updated balances** are running per-bucket balances.
- **Corrections** are new lines. Test 27 proves the seeded lines are byte-identical after every
  operation in the suite.

## 5. Adjustments, reversals and transfers

- **Adjustments (WF-001: Finance → V-Guard Client Admin):**
  - Compulsory remarks, reason code and approval code / reference.
  - Base or Scheme category; add or deduct. Deductions cannot make a balance negative.
- **Bulk CSV:** template, row-by-row validation (member, programme, category, type, points, reason,
  remarks), duplicate detection, and a running balance across rows.
  - Default batch policy is **atomic**: a file with invalid or duplicate rows cannot be submitted,
    and execution posts every row or none.
  - Row results are kept.
- **Reversals (WF-020):** linked to a valid ledger credit, cannot exceed the remaining reversible
  points, comment compulsory.
  - Scheme / milestone reversals are refused here (SCH-Q7).
  - Execution fails rather than make a balance negative.
- **Transfers (WF-021):**
  - Same programme only, with sufficient available points, evidence and comment, and duplicate
    detection.
  - Execution posts the debit and credit together under one transfer reference.

## 6. Scheme settlement integration

- The Settlement tab reads Phase 6 settlement requests, releases and accruals.
- **Initiation** links to the Scheme Builder's settlement service.
- **Stage tracking** shows stage 1 (V-Guard) or stage 2 (Finance) from WF-015.
- **Review** shows the Phase 6 checks plus two wallet-side checks:
  - A **GST gate check**, which flags Retailer scheme points that SOW 5.5 says must stay locked.
  - A **ledger reconciliation**.
- **Limitation:** the Phase 6 settlement service itself does not exclude GST-gated Retailer points.
  The wallet flags them; changing Phase 6 settlement selection was not in scope.

## 7. TDS

- **Programme matrix:**
  - EP/IMP: at scan, into the Kitty.
  - ST, CS and Retailer: at redemption.
  - DD: not established.
- **EP/IMP:** the mock TDS adapter applies the SOW provisional rates (10% with a verified PAN,
  20% without) at scan, splitting gross points into Kitty and member points.
- **FY reconciliation (WF-024):**
  - ≤ ₹20,000: the Kitty is credited back after Finance approval.
  - > ₹20,000: the record is held as **TDS calculation — Business Confirmation Required**. No slab
    is applied and nothing moves to TDS Paid (tests 41–42).
  - The register also flags whether the SOW's "total TDS deducted" or the value of benefits is the
    compared quantity (FD-09).
- **Retailer / ST / CS:**
  - Redemption TDS shows only amounts recorded on legacy development records. The rate is "held by
    the source system".
  - New calculations return Business Confirmation Required (OP-TDS1). No rate is inferred from the
    EP model.
- **Reports:** member-wise, quarterly statement, 26Q layout and extract, scheme-wise (scan-time
  only) and FY summary.
  - 26Q section, challan and PAN fields are not populated with invented values.

## 8. GST gate and reserve

- **Gate, without a verified GSTIN:**
  - Base Points are redeemable up to ₹19,999 equivalent; above that they are locked (the
    `gst_locked` bucket).
  - Milestone, cross-category, rider and unclassified Retailer scheme points are locked.
  - DU, Battery and WSSG schemes are exceptions, identified from `GST_SCHEME_CLASS` (business
    configuration), never from product names. The demo classifications are flagged for confirmation.
- **Overrides (WF-022, V-Guard governance):**
  - Recorded separately and time-bound or "until verified".
  - The GSTIN status is never changed (test 61). Expired overrides stop applying (test 87).
- **Reserve:** default ₹2,000, raisable per Retailer through WF-023, never applied to other
  programmes.
  - The SOW example ₹2,900 − ₹2,000 = ₹900 is test 50.

## 9. Redemption

- **Monitoring:** Pass / In process / Fail tracking, stage, UTR, provider, external reference,
  voucher (masked code), product fulfilment, TDS and net payout.
- **Blocked reasons** are composed from Member Management and wallet rules:
  - KYC / Stage 2, bank and UPI verification.
  - Duplicate account (de-dup restriction), store geo-validation.
  - Minimum points, GST gate, reserve, balance, DD.
- **Limits:**
  - SOW values are seeded with status "SOW value": ₹100, ₹10,000, ₹30,000, 1,000 points.
  - Retailer ₹2,500 is preserved as written with its unit flagged (FD-06).
  - OP-08 daily / monthly values are blank, unenforced and cannot be edited until the decision is
    recorded.
- **Payouts:** queue, daily reconciliation (missing UTR, unmatched external references, amount
  differences), and mock callbacks.
  - Late or repeated callbacks are ignored and audited; points never move twice (test 77).
- **Auto-reversal:** refuses while FD-05 is open. Once the window is confirmed, it posts a reversal
  linked to the original debit, once (test 76).
- **Cancellation:**
  - `redemption:cancel` is granted only to Evolve Operations. Primary organisation must be Evolve.
    Finance, V-Guard Client Admin and Super Admin cannot cancel.
  - Eligibility checks payout and fulfilment.
  - Finance approval (WF-007), then a reversal line.
- **Backend gifts (WF-025):** catalogue availability and programme checks, balance, duplicate
  detection.
  - FOC needs justification and posts no points.
  - Bulk CSV gives per-row results.

## 10. EMI, reports and reconciliation

- **EMI:** monitoring of burns (ledger lines), financing references and reconciliation. Partner,
  eligibility, limits and reversals are open (OP-FIN1); EMI stays disabled.
- **Reports A–I:** exports are checked against the module's Export permission and written to the
  financial audit trail.
- **Reconciliation:** ten views computed live. Wallet snapshot vs ledger, redemption vs payout, payout
  vs UTR, adjustment vs approval, transfer pairs, settlement vs release, Kitty vs FY record, TDS
  deducted vs paid, failed redemption vs reversal, and EMI vs reference.
  - Differences are never auto-corrected.
  - An exception can be resolved "by correction" only with a completed ADJ- or REV- reference.

## 11. RBAC and approvals

- **New permission modules:** `points-ledger`, `points-adjustment`, `points-reversal`,
  `points-transfer`, `tds`, `gst-gate`, `fin-reconciliation`, `gift-redemption`,
  `redemption-limits`, `emi`.
- **New actions:** `cancel` and `recover` on Redemption.
- **The `wallet` module** now carries view, export and view-sensitive.
- The 29 requested permissions are mapped in Configuration → Permissions (`FIN_PERMISSIONS`).
- **Role grants:**
  - Finance: view / export, plus reconciliation manage.
  - Evolve Operations: cancel, recover and execute.
  - Maker / Checker profiles cover the new modules.
- **Assignments updated:**
  - Sneha (Maker): wallet modules.
  - Lakshmi (Finance Checker): adjustments, reversals, transfers, TDS, gifts, limits.
  - Anita (V-Guard Checker): adjustments, reversals, transfers, GST, limits.
- **Request types:**
  - Moved to their own modules: `points_adjustment`, `points_reversal`, `points_transfer`,
    `sales_return_adjustment`.
  - Added: `points_adjustment_bulk`, `gst_override`, `tds_fy_reconciliation`, `gift_redemption`,
    `redemption_limit_change`, `retailer_reserve_change`.
- **Workflows:** WF-001 is re-scoped; WF-020 to WF-025 are new.
- **Lazy loading:** `ensureExecutionHandler` loads the wallet store before a decision on any wallet
  module, so execution runs even if the wallet pages were never opened.
- **Seeded wallet requests (35)** are precomputed steps (`approvalModuleSteps.ts`, regenerate with
  `npm run seed:approval-steps`). They are appended after the earlier scenarios, so existing request
  IDs are unchanged.
- **Phase 3 demo requests** for points adjustments, reversals and redemption cancellation have no
  Phase 7 record. If approved now, their execution fails with "no wallet record matches", and
  nothing is posted.
- **Storage keys bumped:** access store v9, approval store v6. The new wallet store is
  `vg-rishta.wallet-store.v1`.

## 12. Data models and service contracts

- **Models:** `src/types/wallet.ts` (wallet, snapshot, ledger entry, adjustment, batch, reversal,
  transfer, redemption, payout, voucher recovery, cancellation, gift, limit policy, reserve, TDS FY
  record, GST record and override, EMI burn, exception, decision, audit, notification).
- **Services:** `src/services/walletApi.ts` defines the backend-facing interfaces with a mock
  implementation and a not-connected HTTP implementation. No endpoints are invented. The 20 services
  and their idempotency keys are listed in Configuration → Service contracts.

| Layer | Where | Status |
| --- | --- | --- |
| Frontend screens | `src/pages/wallet`, `src/pages/redemption` | Built |
| Pure rules | `features/wallet/engine.ts` | Built |
| Mock backend (wallet, ledger, payout, voucher, gift, TDS reconciliation, GST) | `features/wallet/mockService.ts`, `tdsAdapter.ts` | Mock, in browser |
| Backend interface | `services/walletApi.ts` | Prepared, not connected |
| Live integration | — | None |

## 13. Tests (92)

| Group | Cases | Result |
| --- | --- | --- |
| Wallet model | 1–8 | Pass |
| Manual operations | 9–17 | Pass |
| Reversals and transfers | 18–27 | Pass |
| Settlement | 28–35 | Pass (32 uses Phase 6 failure simulation) |
| EP/IMP TDS | 36–44 | Pass (42 asserts the block) |
| Retailer / ST / CS TDS | 45–51 | Pass (49 asserts the block) |
| GST eligibility | 52–61 | Pass |
| Redemption | 62–80 | Pass |
| Administrative controls | 81–88 | Pass |
| EMI | 89–92 | Pass (92 asserts the block) |

The suite has 56 deterministic, 17 blocked-as-expected and 19 governance cases.

## 14. Open business decisions (Configuration → Business confirmation register)

| ID | Ref | Question |
| --- | --- | --- |
| FD-01 | OP-TDS1 | EP slab above ₹20,000; Retailer / ST / CS redemption slab and PAN treatment |
| FD-02 | OP-RET1 | GST certificate capture and SFDC write-back |
| FD-03 | OP-FIN1 | EMI partner, rail, eligibility, limits, reversals, reconciliation |
| FD-04 | OP-08 | Daily / monthly limits by value and scan count |
| FD-05 | SOW 5.3 | Failed redemption auto-reversal window |
| FD-06 | SOW 10.5 | Retailer ₹2,500 minimum: rupees or points |
| FD-07 | — | Point value (₹ per point); the mock uses 1 point = ₹1 |
| FD-08 | SOW 5.4.1 | Does scan-time TDS apply to EP scheme / milestone points? |
| FD-09 | SOW 5.4.1 | Compared quantity for the ₹20,000 threshold |
| FD-10 | SOW 5.1 | Expiry policy and the 30-day "expiring soon" window |
| FD-11 | SOW 5.4 | DD TDS and redemption rules |

## 15. Known limitations

- **₹ equivalents use a development conversion of 1 point = ₹1 (FD-07).** This affects every
  ₹-based threshold (GST, reserve, DBT / UPI limits).
- **Legacy redemption TDS amounts are development values** "recorded by the source system". They are
  not calculated.
- **Expiry** uses lot dates from the mock service. FIFO consumption is not modelled.
- **Phase 6 settlement** does not exclude GST-gated Retailer points; the wallet flags them (section 6).
- **Evidence uploads** record file names only.
- **Print / save as PDF** uses the browser print dialog with a print stylesheet.
- **Member 360's ledger panel** still shows the Phase 5 read-only abstraction. The full wallet is one
  click away in Wallet & points.
- **Approval-time balances** on seeded requests are those of the development seed at generation time.

## 16. Features blocked by unconfirmed financial rules

- Above-threshold FY TDS (TDS Paid).
- Redemption-time TDS calculation for Retailer / ST / CS, and the gift executions that depend on it.
- DD TDS and redemption.
- OP-08 daily / monthly limits.
- Automatic reversal until FD-05 is confirmed.
- EMI activation.
