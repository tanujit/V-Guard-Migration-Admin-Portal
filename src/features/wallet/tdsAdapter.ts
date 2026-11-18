/**
 * MOCK TDS CALCULATION ADAPTER — stands in for the backend tax service (development only).
 * Only the SOW-stated EP/IMP provisional scan-time rates are implemented (SOW 5.4.1: 10% with PAN,
 * 20% without). Redemption-time TDS for Retailer / ST / CS and the post-threshold FY slab are not
 * confirmed (OP-TDS1): the adapter returns "business confirmation required" for them and never
 * guesses a rate. DD has no established treatment (FD-11).
 */
import { TDS_MODEL } from "@/config/walletCatalogue";
import type { ProgrammeCode } from "@/types/members";
import type { WalletConfig } from "@/types/wallet";

export interface ScanTdsResult {
  applies: boolean;
  ratePct: number;
  kitty: number;
  net: number;
}

/** EP/IMP scan-time provisional TDS: splits earned points into TDS Kitty and the member bucket. */
export function scanTdsSplit(programme: ProgrammeCode, panVerified: boolean, gross: number, cfg: WalletConfig): ScanTdsResult {
  if (TDS_MODEL[programme].model !== "kitty_at_scan") return { applies: false, ratePct: 0, kitty: 0, net: gross };
  const ratePct = panVerified ? cfg.ep.panRatePct : cfg.ep.noPanRatePct;
  // Rounding policy of the real tax service is not specified; the mock rounds the Kitty share down.
  const kitty = Math.floor((gross * ratePct) / 100);
  return { applies: true, ratePct, kitty, net: gross - kitty };
}

export interface RedemptionTdsResult {
  status: "bcr" | "not_applicable";
  message: string;
}

/** Redemption-time TDS: the slab and PAN treatment are not confirmed, so nothing is calculated. */
export function redemptionTds(programme: ProgrammeCode): RedemptionTdsResult {
  const m = TDS_MODEL[programme].model;
  if (m === "kitty_at_scan") return { status: "not_applicable", message: "EP/IMP: TDS was deducted at scan into the TDS Kitty; no redemption-time TDS" };
  if (m === "not_configured") return { status: "bcr", message: "DD TDS treatment is not established in the SOW (FD-11). Business confirmation required" };
  return { status: "bcr", message: "Redemption TDS slab and PAN treatment are not confirmed (OP-TDS1). TDS calculation: business confirmation required" };
}
