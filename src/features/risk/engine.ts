/**
 * FRAUD & RISK ENGINE — pure functions (Phase 10).
 * Case state machine, limit comparison for the mock rule service, SOW-defined examples (geo-velocity,
 * 100 m geo-fence, store geo-validation gate, KYC retention) and impact analysis. No score, forecast,
 * distance or priority is computed here: those come from the detection services.
 */
import { findBranch } from "@/config/geography";
import { SOW, TRANSITIONS } from "@/config/riskCatalogue";
import { branchesInScope, displayVersion } from "@/features/schemes/engine";
import type { MemberState } from "@/features/members/engine";
import type { SchemeState } from "@/types/schemes";
import type { AnomalyRule, CaseStatus, HierarchyMismatch, Period, StoreGeoRecord } from "@/types/risk";

export const canTransition = (from: CaseStatus, to: CaseStatus) => TRANSITIONS[from].includes(to);

export const maskTail = (v: string, keep = 4) => (v.length <= keep ? "•".repeat(v.length) : `${"•".repeat(Math.min(8, v.length - keep))}${v.slice(-keep)}`);
export const maskMember = (id: string) => `${id.slice(0, 7)}••${id.slice(-2)}`;

/** Periods whose configured limit the reported activity exceeds (used by the mock rule service only). */
export function exceededPeriods(rule: AnomalyRule, counts: Partial<Record<Period, number>>): { period: Period; limit: number; observed: number }[] {
  const out: { period: Period; limit: number; observed: number }[] = [];
  for (const p of ["hour", "day", "week", "month"] as Period[]) {
    const limit = rule.limits[p];
    const observed = counts[p];
    if (limit != null && observed != null && observed > limit) out.push({ period: p, limit, observed });
  }
  return out;
}

export function validateRule(r: AnomalyRule): string[] {
  const e: string[] = [];
  if (!r.name.trim()) e.push("Name the rule");
  const set = (Object.values(r.limits) as (number | null)[]).filter((x) => x != null) as number[];
  if (!set.length) e.push("Enter at least one limit");
  if (set.some((x) => !Number.isInteger(x) || x < 1)) e.push("Limits must be whole numbers above zero");
  const { hour, day, week, month } = r.limits;
  if (hour != null && day != null && hour > day) e.push("The hourly limit cannot exceed the daily limit");
  if (day != null && week != null && day > week) e.push("The daily limit cannot exceed the weekly limit");
  if (week != null && month != null && week > month) e.push("The weekly limit cannot exceed the monthly limit");
  if (r.limits.hour != null && !r.categoryId) e.push("Hourly limits are category-level scan-rate controls: choose a product category");
  if (r.kind === "redemption" && r.limits.hour != null) e.push("Redemption checks are daily, weekly or monthly");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom)) e.push("Enter the effective start date");
  if (r.effectiveTo && r.effectiveTo < r.effectiveFrom) e.push("The end date is before the start date");
  return e;
}

/** The SOW example pattern, evaluated only on values the geo-velocity service supplied. */
export const sowGeoVelocityExample = (distanceKm: number | null, elapsedMin: number | null) => distanceKm != null && elapsedMin != null && distanceKm > SOW.geoVelocityExample.km && elapsedMin < SOW.geoVelocityExample.minutes;

/** SOW 9.1 store geo-validation gate for Retailer, DD and CS: five scans while pending, no redemption. */
export function storeGateScan(r: StoreGeoRecord): { allowed: boolean; message: string | null } {
  if (r.sfdcStatus === "validated") return { allowed: true, message: null };
  if (r.scanCount < SOW.storeGeoMaxScans) return { allowed: true, message: `Store geo-validation pending: ${SOW.storeGeoMaxScans - r.scanCount - 1} scan(s) left before scanning pauses` };
  return { allowed: false, message: "Your store location is not yet geo-validated. Please complete self geo-validation in the app to continue scanning" };
}
export function storeGateRedemption(r: StoreGeoRecord): { allowed: boolean; message: string | null } {
  return r.sfdcStatus === "validated" ? { allowed: true, message: null } : { allowed: false, message: "Redemption is paused until your store location is geo-validated. Please complete self geo-validation in the app" };
}

export function duplicateQrMessage(sameMember: boolean, firstMemberId: string, firstAt: string) {
  return sameMember ? `You already scanned this code on ${firstAt.slice(0, 10)}` : `This code was already scanned by another member (${maskMember(firstMemberId)}) on ${firstAt.slice(0, 10)}`;
}

/** SOW 9.7: KYC data kept for seven years after account closure. */
export const retentionEnd = (closedAt: string | null) => (closedAt ? `${Number(closedAt.slice(0, 4)) + SOW.kycRetentionYears}${closedAt.slice(4, 10)}` : null);

/** Members and branch-scoped schemes touched by a hierarchy mismatch (read from the authoritative stores). */
export function mismatchImpact(m: HierarchyMismatch, mem: MemberState, ss: SchemeState) {
  const codes = [m.platform.branch, m.sfdc.branch].filter(Boolean) as string[];
  const districts = [m.platform.district, m.sfdc.district].filter(Boolean) as string[];
  const members = mem.members.filter((x) => codes.includes(x.branchCode) || districts.includes(findBranch(x.branchCode)?.district.code ?? ""));
  const schemes = ss.schemes.filter((sc) => {
    const scope = displayVersion(sc)?.config?.eligibility?.branchScope;
    if (!scope) return false;
    const set = branchesInScope(scope);
    return codes.some((c) => set.has(c)) || (scope.districtCodes ?? []).some((d) => districts.includes(d));
  });
  return { members: [...new Set(members.map((x) => x.id))], schemes: schemes.map((s) => s.id) };
}
