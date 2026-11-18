/**
 * Wallet, points, TDS, redemption and financial-operations service contracts — PLACEHOLDER for
 * backend integration (Phase 7).
 *
 * The 20 services of the brief (catalogued in config/walletCatalogue.ts → WALLET_SERVICES) map onto
 * the interfaces below. Screens use the in-browser wallet store, which hands approved operations to
 * the MOCK wallet service (features/wallet/mockService.ts). The HTTP implementation throws
 * ApiNotConnectedError: no wallet, ledger, payout, voucher, gift, tax, GST, settlement or financing
 * service is connected, and no endpoint is invented here.
 *
 * Contract rules the backend must honour (enforced by the mock today):
 *  - every financial operation carries an idempotency key; a repeated key never posts twice;
 *  - linked movements (transfer debit + credit) are one atomic operation;
 *  - balances are validated by the backend at execution, never trusted from the screen;
 *  - ledger lines are immutable; corrections are new adjustment / reversal lines;
 *  - the wallet balance response carries retrievedAt / reconciledAt so the UI never shows a false zero.
 */
import * as store from "@/features/wallet/store";
import * as engine from "@/features/wallet/engine";
import { memberStore } from "@/features/members/store";
import { schemeStore } from "@/features/schemes/store";
import { demoNow } from "@/features/approvals/store";
import type { PolicyResult } from "@/features/access/engine";
import type { BalanceView, FinancialException, GstOverrideRequest, LedgerEntry, PayoutRecord, RedemptionLimitPolicy, RedemptionRequest, TdsFyReconciliation, WalletState } from "@/types/wallet";
import { redemptionTds, scanTdsSplit } from "@/features/wallet/tdsAdapter";
import { ApiNotConnectedError } from "./api";

type Res = PolicyResult & { id?: string };

/** 1–2. Wallet and wallet balance (SOW 5.1, 5.1.1). */
export interface WalletService {
  wallet(memberId: string): Promise<WalletState["wallets"][number] | undefined>;
  balance(memberId: string): Promise<BalanceView>;
  refresh(actorId: string, memberId: string): Promise<Res>;
}
/** 3. Ledger (append-only). */
export interface LedgerService {
  lines(memberId?: string): Promise<LedgerEntry[]>;
}
/** 4–6. Adjustments, transfers, reversals: requests go to the Approval Engine; execution posts after approval. */
export interface PointsOperationsService {
  requestAdjustment(actorId: string, input: engine.AdjustmentInput & { evidence?: string[] }): Promise<Res>;
  validateBatch(actorId: string, fileName: string, csv: string): Promise<Res>;
  submitBatch(actorId: string, batchId: string, approvalCode: string, remarks: string): Promise<Res>;
  requestTransfer(actorId: string, input: Parameters<typeof store.submitTransfer>[1]): Promise<Res>;
  requestReversal(actorId: string, input: Parameters<typeof store.submitReversal>[1]): Promise<Res>;
}
/** 7–10. Redemption, payout, voucher and gift adapters. */
export interface RedemptionService {
  redemptions(): Promise<RedemptionRequest[]>;
  payouts(): Promise<PayoutRecord[]>;
  payoutCallback(actorId: string, payoutId: string, status: "success" | "failed", callbackId?: string): Promise<Res>;
  cancel(actorId: string, redemptionId: string, reasonCode: string, remarks: string): Promise<Res>;
  recoverVoucher(actorId: string, redemptionId: string, reason: string): Promise<Res>;
  giftOnBehalf(actorId: string, input: Parameters<typeof store.submitGift>[1]): Promise<Res>;
  limits(): Promise<RedemptionLimitPolicy[]>;
}
/** 11–12. TDS calculation and reconciliation (OP-TDS1 blocks unconfirmed slabs). */
export interface TdsService {
  scanSplit(programme: Parameters<typeof scanTdsSplit>[0], panVerified: boolean, points: number): Promise<ReturnType<typeof scanTdsSplit>>;
  redemptionTds(programme: Parameters<typeof redemptionTds>[0]): Promise<ReturnType<typeof redemptionTds>>;
  fyReconciliations(): Promise<TdsFyReconciliation[]>;
  initiateFy(actorId: string, memberId: string, fy: string): Promise<Res>;
}
/** 13. GST eligibility (SFDC source not connected, OP-RET1). */
export interface GstService {
  gate(memberId: string): Promise<engine.GstGate>;
  requestOverride(actorId: string, input: Omit<GstOverrideRequest, "id" | "gstStatus" | "currentGate" | "status" | "approvalRequestId" | "createdBy" | "createdAt" | "executedAt">): Promise<Res>;
}
/** 15–16. EMI financing (OP-FIN1) and financial reconciliation. */
export interface ReconciliationService {
  reconcile(): Promise<engine.ReconRow[]>;
  exceptions(): Promise<FinancialException[]>;
}

export type WalletApi = WalletService & LedgerService & PointsOperationsService & RedemptionService & TdsService & GstService & ReconciliationService;

const w = () => store.walletStore.get();
const ctx = () => ({ ss: schemeStore.get(), mem: memberStore.get() });

export const mockWalletApi: WalletApi = {
  wallet: async (id) => w().wallets.find((x) => x.memberId === id),
  balance: async (id) => engine.balanceView(w(), ctx().ss, ctx().mem, id, demoNow()),
  refresh: async (a, id) => store.refreshBalance(a, id),
  lines: async (id) => (id ? engine.linesOf(engine.fullLedger(w(), ctx().ss, ctx().mem), id) : engine.fullLedger(w(), ctx().ss, ctx().mem)),
  requestAdjustment: async (a, i) => store.submitAdjustment(a, i),
  validateBatch: async (a, f, c) => store.validateBatchFile(a, f, c),
  submitBatch: async (a, id, code, r) => store.submitBatch(a, id, code, r),
  requestTransfer: async (a, i) => store.submitTransfer(a, i),
  requestReversal: async (a, i) => store.submitReversal(a, i),
  redemptions: async () => w().redemptions,
  payouts: async () => w().payouts,
  payoutCallback: async (a, id, s, cb) => store.simulatePayoutCallback(a, id, s, cb),
  cancel: async (a, id, c, r) => store.requestCancellation(a, id, c, r),
  recoverVoucher: async (a, id, r) => store.recoverVoucher(a, id, r),
  giftOnBehalf: async (a, i) => store.submitGift(a, i),
  limits: async () => w().policies,
  scanSplit: async (p, pan, n) => scanTdsSplit(p, pan, n, w().config),
  redemptionTds: async (p) => redemptionTds(p),
  fyReconciliations: async () => w().tdsFy,
  initiateFy: async (a, id, fy) => store.initiateFyReconciliation(a, id, fy),
  gate: async (id) => engine.gstGate(w(), ctx().ss, ctx().mem, id, demoNow().slice(0, 10)),
  requestOverride: async (a, i) => store.submitGstOverride(a, i),
  reconcile: async () => engine.reconcile(w(), ctx().ss, ctx().mem, [], "To date"),
  exceptions: async () => w().exceptions,
};

const notConnected = (): never => {
  throw new ApiNotConnectedError("Wallet, ledger, payout, tax, GST and financing services are not connected");
};
/** Every operation of the HTTP implementation refuses until the backend exists. */
export const httpWalletApi = Object.fromEntries(Object.keys(mockWalletApi).map((k) => [k, async () => notConnected()])) as unknown as WalletApi;

export const walletApi: WalletApi = mockWalletApi;
