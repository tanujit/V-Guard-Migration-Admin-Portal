/**
 * Scheme & Incentive Management service contracts — PLACEHOLDER for backend integration (Phase 6).
 *
 * The 20 services of the brief map onto the interfaces below. Screens call the in-browser store
 * (features/schemes/store.ts) and the pure engine; the mock implementation forwards to them. The
 * HTTP implementation throws ApiNotConnectedError: no scheme engine, wallet/ledger, settlement,
 * tier, referral, campaign or gamification service is connected, and no endpoint is invented here.
 * Paths documented in config/schemeCatalogue.ts (SERVICE_CONTRACTS) are proposals for the backend team.
 */
import * as store from "@/features/schemes/store";
import * as engine from "@/features/schemes/engine";
import type { PolicyResult } from "@/features/access/engine";
import type { RewardAccrual, Scheme, SchemeConfig, SettlementRelease } from "@/types/schemes";
import { ApiNotConnectedError } from "./api";

/** 2–4. Scheme configuration, rule registry and validation. */
export interface SchemeConfigurationService {
  listSchemes(): Promise<Scheme[]>;
  saveDraft(actorId: string, schemeId: string | null, config: SchemeConfig, reason: string): Promise<PolicyResult & { id?: string }>;
  validate(schemeId: string | null, config: SchemeConfig): Promise<engine.SchemeValidation>;
}
/** 9. Projected liability (OP-SB-LIAB): the interface exists, the formula does not. */
export interface ProjectedLiabilityAdapter {
  calculate(schemeId: string, version: number): Promise<ReturnType<typeof engine.projectedLiability>>;
}
/** 10–11. Approval engine and activation adapter. */
export interface SchemeLifecycleService {
  submit(actorId: string, schemeId: string): Promise<PolicyResult>;
  activate(actorId: string, schemeId: string): Promise<PolicyResult>;
  deactivate(actorId: string, schemeId: string, reason: string): Promise<PolicyResult>;
  close(actorId: string, schemeId: string, reason: string): Promise<PolicyResult>;
}
/** 5, 12–13. Rule evaluation, reward accrual and wallet/ledger (idempotent by key). */
export interface RewardAccrualAdapter {
  ledgerFor(schemeId: string): Promise<RewardAccrual[]>;
  postTransaction(actorId: string, txn: store.TxnInput): Promise<PolicyResult>;
}
/** 14. Settlement. */
export interface SettlementService {
  request(actorId: string, schemeId: string, trancheId: string, from: string, to: string): Promise<PolicyResult>;
  history(schemeId?: string): Promise<SettlementRelease[]>;
}

export type SchemeApi = SchemeConfigurationService & ProjectedLiabilityAdapter & SchemeLifecycleService & RewardAccrualAdapter & SettlementService;

const s = () => store.schemeStore.get();
const today = () => new Date().toISOString().slice(0, 10);

export const mockSchemeApi: SchemeApi = {
  listSchemes: async () => s().schemes,
  saveDraft: async (a, id, c, r) => store.saveSchemeDraft(a, id, c, r),
  validate: async (id, c) => engine.validateConfig(s(), (await import("@/features/masters/store")).masterStore.get(), id, c, { today: today() }),
  calculate: async (id, v) => engine.projectedLiability(s(), engine.schemeById(s(), id)!, v, null, new Date().toISOString()),
  submit: async (a, id) => store.submitScheme(a, id),
  activate: async (a, id) => store.activateScheme(a, id),
  deactivate: async (a, id, r) => store.requestDeactivation(a, id, r),
  close: async (a, id, r) => store.requestClosure(a, id, r),
  ledgerFor: async (id) => s().accruals.filter((x) => x.schemeId === id),
  postTransaction: async (a, t) => store.postMockTransaction(a, t),
  request: async (a, id, t, f, to) => store.createSettlementRequest(a, id, t, f, to),
  history: async (id) => s().releases.filter((r) => !id || r.schemeId === id),
};

const notConnected = (): never => {
  throw new ApiNotConnectedError("Scheme engine, ledger and settlement services are not connected");
};
export const httpSchemeApi: SchemeApi = {
  listSchemes: async () => notConnected(),
  saveDraft: async () => notConnected(),
  validate: async () => notConnected(),
  calculate: async () => notConnected(),
  submit: async () => notConnected(),
  activate: async () => notConnected(),
  deactivate: async () => notConnected(),
  close: async () => notConnected(),
  ledgerFor: async () => notConnected(),
  postTransaction: async () => notConnected(),
  request: async () => notConnected(),
  history: async () => notConnected(),
};

export const schemeApi: SchemeApi = mockSchemeApi;
