/**
 * API service layer — PLACEHOLDER.
 *
 * No V-Guard or Evolve endpoints have been agreed yet, so none are defined here. When the backend
 * contract is published, implement `httpDashboardSource` against it and switch `DATA_MODE`.
 * Until then every call is served by the mock source and labelled as demo data in the UI.
 */
import type { DashboardDataSource } from "./dashboardSource";

export type DataMode = "mock" | "http";

/** Single switch for the whole portal. Kept at "mock" for Phase 1. */
export const DATA_MODE: DataMode = "mock";

export interface ApiClientConfig {
  /** Base URL of the portal API gateway. To be provided by the platform team. */
  baseUrl: string | null;
  /** Token provider from the authentication service (later phase). */
  getAccessToken: () => Promise<string | null>;
}

export const apiConfig: ApiClientConfig = {
  baseUrl: null,
  getAccessToken: async () => null,
};

export class ApiNotConnectedError extends Error {
  constructor(operation: string) {
    super(`"${operation}" has no backend endpoint yet. The portal is running on demo data.`);
    this.name = "ApiNotConnectedError";
  }
}

function notConnected(operation: string): never {
  throw new ApiNotConnectedError(operation);
}

/**
 * Future HTTP implementation. Each method maps 1:1 to a dashboard section so the backend team can
 * agree endpoints section by section.
 */
export const httpDashboardSource: DashboardDataSource = {
  overview: async () => notConnected("dashboard.overview"),
  programmeDistribution: async () => notConnected("dashboard.programmeDistribution"),
  registrationAnalytics: async () => notConnected("dashboard.registrationAnalytics"),
  registrationStatus: async () => notConnected("dashboard.registrationStatus"),
  activeUsers: async () => notConnected("dashboard.activeUsers"),
  geography: async () => notConnected("dashboard.geography"),
  scanning: async () => notConnected("dashboard.scanning"),
  points: async () => notConnected("dashboard.points"),
  redemption: async () => notConnected("dashboard.redemption"),
  kyc: async () => notConnected("dashboard.kyc"),
  schemes: async () => notConnected("dashboard.schemes"),
  gifts: async () => notConnected("dashboard.gifts"),
  tds: async () => notConnected("dashboard.tds"),
  referrals: async () => notConnected("dashboard.referrals"),
  risk: async () => notConnected("dashboard.risk"),
  operations: async () => notConnected("dashboard.operations"),
};
