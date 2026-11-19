/**
 * Application environment. Decided by build configuration (VITE_APP_ENV), never by a browser flag a
 * user could edit. "simulation" is the client demonstration build: seeded demo data, mock adapters,
 * simulated approvals, payouts and messages. "production" hides every simulation control; this
 * build has no production backend, so production mode is a placeholder for the real deployment.
 */
const raw = (() => {
  try {
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_APP_ENV;
  } catch {
    return undefined;
  }
})();
export const APP_ENV: "simulation" | "production" = raw === "production" ? "production" : "simulation";
export const IS_SIMULATION = APP_ENV === "simulation";
export const DEMO_DATASET = "V-Guard Rishta synthetic demo dataset v1 (development data)";
