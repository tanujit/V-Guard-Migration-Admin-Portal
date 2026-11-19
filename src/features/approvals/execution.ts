/**
 * MOCK EXECUTION ADAPTERS.
 * After final approval, the originating module applies the approved change. Those modules are not
 * built yet, so each adapter here only simulates the result: no V-Guard system, ledger or member
 * record is changed. The idempotency key on the request (EXE-<id>-V<version>) is what a real
 * adapter would send so the same approved version is never applied twice.
 */
import { requestTypeById } from "@/config/approvalCatalogue";
import { moduleById } from "@/config/rbacCatalogue";
import type { ApprovalRequest } from "@/types/approval";

export interface ExecutionOutcome {
  ok: boolean;
  message: string;
}

export interface ExecutionAdapter {
  module: string;
  /** What the real adapter will do once the module exists. */
  intent: string;
  execute(r: ApprovalRequest): ExecutionOutcome;
}

const INTENT: Record<string, string> = {
  wallet: "Post the approved credit or debit to the points ledger",
  "points-adjustment": "Post the approved manual adjustment (single or batch) through the wallet service (mock)",
  "points-reversal": "Post a reversal line linked to the original transaction through the wallet service (mock)",
  "points-transfer": "Post the linked debit and credit under one transfer reference (mock)",
  "gst-gate": "Apply the approved GST unlock through the GST eligibility service (mock)",
  tds: "Run the approved FY Kitty outcome through the TDS reconciliation service (mock)",
  "gift-redemption": "Redeem the gift through the gift redemption adapter (mock)",
  "redemption-limits": "Activate the approved limit policy or Retailer reserve (development store)",
  "comm-templates": "Activate the approved template version (previous version kept)",
  surveys: "Activate the approved survey; invitations are sent separately through N06",
  "comm-bot": "Activate the approved bot menu (configuration only; bot not connected)",
  content: "Publish the approved content (mock content service)",
  "gift-catalogue": "Publish the approved catalogue version or segment point cost (development store)",
  vouchers: "Ask the voucher provider adapter to recover or reissue the code (mock)",
  insurance: "Create the approved card records or publish the approved cards (mock insurance-card service)",
  redemption: "Cancel the redemption and refund points through the redemption service",
  members: "Change member status in the member master",
  "registration-kyc": "Update registration or verification status",
  schemes: "Record the approved scheme version, deactivation, closure, extension or exclusivity rule (activation stays a separate engine step)",
  "scheme-budget": "Apply the approved budget or authorise the backdated run (development store)",
  "scheme-settlement": "Post the Settlement Release through the wallet/ledger adapter (mock)",
  tiers: "Publish the approved tier configuration (development store)",
  referrals: "Publish the approved referral rule (development store)",
  campaigns: "Publish the campaign or issue the approved gift entitlements (development store)",
  gamification: "Publish the approved gamification or bonus configuration (development store)",
  products: "Update the SKU master and scan point values",
  financial: "Apply the approved financial rule from its effective date",
  communication: "Queue the approved message for its channel",
  "scan-config": "Activate the approved scanning configuration version (development store; the mobile scan engine is not connected)",
  "fraud-rules": "Record the approved threshold (kept inactive until confirmed), global restriction or redemption block release (mock risk adapters)",
  devices: "Block or release the device through the device governance service (mock)",
  integrations: "Record the approved integration setting (mock configuration service; backend adapters are not connected)",
  "kpi-governance": "Record the confirmed KPI definition or target as a new version in the KPI dictionary",
  "app-themes": "Record the theme version as approved (publishing is a separate step, disabled until OP-THEME1)",
};

/**
 * Modules built in later phases register a real (still in-browser) handler that applies the approved
 * change to their own store. Modules without one keep the simulated adapter.
 */
const handlers = new Map<string, (r: ApprovalRequest) => ExecutionOutcome>();
export function registerExecutionHandler(module: string, fn: (r: ApprovalRequest) => ExecutionOutcome) {
  handlers.set(module, fn);
}
/**
 * Stores that register a handler when they load. Pages load per route (code splitting), so a
 * module's store may not be loaded yet when a request is decided on the approval pages.
 * ensureExecutionHandler loads it first, so the handler is registered before the decision.
 */
const HANDLER_STORES: Record<string, () => Promise<unknown>> = {
  "scan-config": () => import("@/features/masters/store"),
  "points-adjustment": () => import("@/features/wallet/store"),
  "points-reversal": () => import("@/features/wallet/store"),
  "points-transfer": () => import("@/features/wallet/store"),
  "gst-gate": () => import("@/features/wallet/store"),
  tds: () => import("@/features/wallet/store"),
  "gift-redemption": () => import("@/features/wallet/store"),
  "redemption-limits": () => import("@/features/wallet/store"),
  redemption: () => import("@/features/wallet/store"),
  "fraud-rules": () => import("@/features/risk/store"),
  devices: () => import("@/features/risk/store"),
  integrations: () => import("@/features/ops/store"),
  "kpi-governance": () => import("@/features/analytics/store"),
  "app-themes": () => import("@/features/platform/store"),
  "gift-catalogue": () => import("@/features/gifts/store"),
  vouchers: () => import("@/features/gifts/store"),
  insurance: () => import("@/features/gifts/store"),
  communication: () => import("@/features/comms/store"),
  "comm-templates": () => import("@/features/comms/store"),
  content: () => import("@/features/comms/store"),
  surveys: () => import("@/features/comms/store"),
  "comm-bot": () => import("@/features/comms/store"),
  members: () => import("@/features/members/store"),
  schemes: () => import("@/features/schemes/store"),
  "scheme-budget": () => import("@/features/schemes/store"),
  "scheme-settlement": () => import("@/features/schemes/store"),
  tiers: () => import("@/features/schemes/store"),
  referrals: () => import("@/features/schemes/store"),
  campaigns: () => import("@/features/schemes/store"),
  gamification: () => import("@/features/schemes/store"),
};
export async function ensureExecutionHandler(module: string): Promise<void> {
  await HANDLER_STORES[module]?.();
}
/** Modules whose handler runs automatically once the final approval is recorded. */
export const autoExecutes = (module: string) => handlers.has(module);

function adapterFor(module: string): ExecutionAdapter {
  const label = moduleById.get(module)?.label ?? module;
  return {
    module,
    intent: INTENT[module] ?? "Apply the approved change",
    execute(r) {
      const type = requestTypeById.get(r.requestType)?.label ?? r.requestType;
      if (r.execution.simulate === "fail_once" && r.execution.attempts.length === 0) {
        return { ok: false, message: `Mock ${label} adapter: simulated timeout from the downstream service. Nothing was applied; key ${r.execution.ref} can be retried safely` };
      }
      const handler = handlers.get(module);
      if (handler) return handler(r);
      return { ok: true, message: `Mock ${label} adapter recorded "${type}" under key ${r.execution.ref}. Development only: no V-Guard system was changed` };
    },
  };
}

export const executionAdapters = new Map(Object.keys(INTENT).map((m) => [m, adapterFor(m)]));
export const getAdapter = (module: string) => executionAdapters.get(module) ?? adapterFor(module);
