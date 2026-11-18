/**
 * READ-ONLY LEDGER ABSTRACTION (mock). Points, scans, redemptions and TDS belong to the Wallet,
 * Scanning, Redemption and Finance modules. This adapter returns deterministic development figures
 * so Member 360 can show the shape of the data. No adjustment is possible here.
 */
import { hash01, pick } from "@/data/mock/random";
import type { Member } from "@/types/members";

export interface LedgerView {
  connected: false;
  earned: number;
  redeemed: number;
  balance: number;
  scans: { at: string; sku: string; points: number; status: "Accepted" | "Rejected" | "Reversed" }[];
  redemptions: { at: string; ref: string; points: number; status: "Delivered" | "Paid out" | "Pending" }[];
  tds: { fy: string; deducted: number; basis: string }[];
  pendingRedemption: number;
}

const SKUS = ["DEV-WIR-002-A", "DEV-STA-006-A", "DEV-FAN-012-A", "DEV-PUM-016-A", "DEV-SWI-009-A", "DEV-INV-021-A"];

export function memberLedger(m: Member): LedgerView {
  const active = ["active_scan", "redemption_kyc_pending", "redemption_enabled", "provisioned"].includes(m.status);
  if (!active) return { connected: false, earned: 0, redeemed: 0, balance: 0, scans: [], redemptions: [], tds: [], pendingRedemption: 0 };
  const k = (x: string) => hash01(m.id + x);
  const scans = Array.from({ length: 6 + Math.floor(k("n") * 14) }, (_, i) => {
    const day = 2 + i * (1 + Math.floor(k("gap" + i) * 9));
    const d = new Date(new Date("2026-11-08T12:00").getTime() - day * 86400000);
    const status: "Accepted" | "Rejected" | "Reversed" = k("s" + i) > 0.94 ? "Rejected" : k("s" + i) > 0.9 ? "Reversed" : "Accepted";
    return { at: d.toISOString().slice(0, 16), sku: pick(m.id + i, SKUS), points: status === "Accepted" ? 6 + Math.floor(k("p" + i) * 40) : 0, status };
  });
  const earned = 1800 + Math.floor(k("earned") * 24000);
  const canRedeem = m.status === "redemption_enabled" || m.status === "provisioned";
  const redemptions = canRedeem ? Array.from({ length: 1 + Math.floor(k("rn") * 5) }, (_, i) => ({ at: new Date(new Date("2026-10-30T12:00").getTime() - i * 37 * 86400000).toISOString().slice(0, 16), ref: `RED-${m.id.slice(4)}-${i + 1}`, points: 500 + Math.floor(k("rp" + i) * 3000), status: (i === 0 && k("pend") > 0.6 ? "Pending" : pick(m.id + "rs" + i, ["Delivered", "Paid out"])) as "Delivered" | "Paid out" | "Pending" })) : [];
  const redeemed = redemptions.filter((r) => r.status !== "Pending").reduce((n, r) => n + r.points, 0);
  return {
    connected: false,
    earned,
    redeemed,
    balance: Math.max(0, earned - redeemed),
    scans,
    redemptions,
    pendingRedemption: redemptions.filter((r) => r.status === "Pending").reduce((n, r) => n + r.points, 0),
    tds: canRedeem ? [{ fy: "FY 2025-26", deducted: Math.floor(redeemed * 0.04), basis: "Programme TDS model (Finance module)" }, { fy: "FY 2026-27 (to date)", deducted: Math.floor(redeemed * 0.02), basis: "Programme TDS model (Finance module)" }] : [],
  };
}
