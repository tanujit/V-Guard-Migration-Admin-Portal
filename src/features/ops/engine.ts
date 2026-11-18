/**
 * INTEGRATION OPERATIONS ENGINE — pure functions (Phase 11).
 * Health classification, request statistics from recorded measurements, the eSeal transaction-date
 * rule (SOW 11.3), ranking, volumes, correlation context and adoption lists. Nothing here forecasts or
 * invents a measurement: statistics are computed only from recorded values.
 */
import type { Member } from "@/types/members";
import type { AuthEvent, CrashRecord, EsealLookup, HealthStatus, Integration, IntegrationRequest, Job, MetricSeries } from "@/types/ops";

export const hoursBefore = (at: string, h: number) => new Date(Date.parse(`${at}:00Z`) - h * 3600_000).toISOString().slice(0, 16);
export const daysBetween = (a: string, b: string) => Math.floor((Date.parse(`${b.slice(0, 16)}:00Z`) - Date.parse(`${a.slice(0, 16)}:00Z`)) / 86400_000);

export function p95(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

export interface RequestStats {
  total: number;
  success: number;
  failed: number;
  pending: number;
  retried: number;
  failureRate: number | null;
  avgMs: number | null;
  p95Ms: number | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  primaryError: string | null;
  recentError: string | null;
}
export function stats(reqs: IntegrationRequest[]): RequestStats {
  const done = reqs.filter((r) => r.status !== "pending");
  const failed = reqs.filter((r) => r.status === "failed" || r.status === "timeout");
  const durations = done.map((r) => r.durationMs).filter((x): x is number => x != null);
  const cats: Record<string, number> = {};
  failed.forEach((r) => r.errorCategory && (cats[r.errorCategory] = (cats[r.errorCategory] ?? 0) + 1));
  const primary = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const last = (f: (r: IntegrationRequest) => boolean) => reqs.filter(f).map((r) => r.at).sort().slice(-1)[0] ?? null;
  return {
    total: reqs.length,
    success: reqs.filter((r) => r.status === "success").length,
    failed: failed.length,
    pending: reqs.filter((r) => r.status === "pending").length,
    retried: reqs.filter((r) => r.retryCount > 0).length,
    failureRate: done.length ? failed.length / done.length : null,
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    p95Ms: p95(durations),
    lastSuccess: last((r) => r.status === "success"),
    lastFailure: last((r) => r.status === "failed" || r.status === "timeout"),
    primaryError: primary,
    recentError: [...failed].sort((a, b) => b.at.localeCompare(a.at))[0]?.error ?? null,
  };
}

/**
 * Development health rule (OP-MON1 open), over the last 24 hours by default: placeholder → BCR; no
 * telemetry → not configured; no request in the window → unknown; a missed or delayed run (not yet
 * retried) → delayed; no success in the window → failed;
 * any failure → degraded; otherwise healthy. Never Healthy without a recent successful request.
 */
export function healthOf(i: Integration, reqs: IntegrationRequest[], jobs: Job[], now: string, windowH = 24): HealthStatus {
  if (i.connection === "placeholder") return "bcr";
  if (i.monitoring === "not_configured") return "not_configured";
  if (i.config.disconnected === "true") return "disconnected";
  const from = hoursBefore(now, windowH);
  const recent = reqs.filter((r) => r.integrationId === i.id && r.at >= from && r.at <= now);
  if (!recent.length) return "unknown";
  const runs = jobs.filter((j) => j.integrationId === i.id).flatMap((j) => j.runs.filter((r) => r.scheduledFor >= from && r.scheduledFor <= now && !r.retries.length));
  const s = stats(recent);
  if (!s.success) return "failed";
  if (runs.some((r) => r.status === "missed" || r.status === "delayed")) return "delayed";
  if (s.failed) return "degraded";
  return "healthy";
}

/** SOW 11.3: customer-billed date; if blank or stock-out, the manufacturing date. */
export function effectiveDate(e: NonNullable<EsealLookup["eseal"]>): { date: string | null; reason: string } {
  if (e.billedDate && !e.stockOut) return { date: e.billedDate, reason: "Customer-billed date from eSeal" };
  if (e.manufacturingDate) return { date: e.manufacturingDate, reason: e.stockOut ? "Item marked stock-out: manufacturing date used (SOW 11.3)" : "Billed date blank: manufacturing date used (SOW 11.3)" };
  return { date: null, reason: "Neither billed nor manufacturing date returned: scan cannot be date-validated" };
}

export type RankKey = "failed" | "failureRate" | "avgMs" | "pending";
export function topFailing(integrations: Integration[], reqs: IntegrationRequest[], key: RankKey = "failed") {
  const rows = integrations.filter((i) => i.connection !== "placeholder").map((i) => ({ i, s: stats(reqs.filter((r) => r.integrationId === i.id)) }));
  const v = (x: (typeof rows)[number]) => (key === "failed" ? x.s.failed : key === "failureRate" ? x.s.failureRate ?? -1 : key === "avgMs" ? x.s.avgMs ?? -1 : x.s.pending);
  return rows.sort((a, b) => v(b) - v(a)).map((x, n) => ({ rank: n + 1, ...x }));
}

export type Grain = "hour" | "day" | "week" | "month";
export function bucketOf(at: string, g: Grain) {
  if (g === "hour") return at.slice(0, 13);
  if (g === "day") return at.slice(0, 10);
  if (g === "month") return at.slice(0, 7);
  const d = new Date(`${at.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `W ${d.toISOString().slice(0, 10)}`;
}
export function volume(reqs: IntegrationRequest[], g: Grain) {
  const keys = [...new Set(reqs.map((r) => bucketOf(r.at, g)))].sort();
  return keys.map((k) => {
    const b = reqs.filter((r) => bucketOf(r.at, g) === k);
    return { key: k, label: k, success: b.filter((r) => r.status === "success").length, failed: b.filter((r) => r.status === "failed" || r.status === "timeout").length, pending: b.filter((r) => r.status === "pending").length, retried: b.filter((r) => r.retryCount > 0).length };
  });
}

/** Values of each metric around a moment: context for diagnosis, not a root cause. */
export function correlationAt(metrics: MetricSeries[], at: string, windowH = 1) {
  const from = hoursBefore(at, windowH);
  return metrics.map((m) => {
    const before = m.points.filter((p) => p.at < from).slice(-1)[0]?.v ?? null;
    const during = m.points.filter((p) => p.at >= from && p.at <= at);
    const peak = during.length ? Math.max(...during.map((p) => p.v)) : null;
    return { key: m.key, label: m.label, unit: m.unit, before, peak, change: before != null && peak != null ? Math.round((peak - before) * 10) / 10 : null };
  });
}

export function lastLogin(auth: AuthEvent[], memberId: string, fallback: string | null) {
  const s = auth.filter((a) => a.memberId === memberId && a.result === "success").map((a) => a.at).sort().slice(-1)[0];
  return s ?? fallback;
}
/** SOW 10.11: enrolled but never logged in, and dormant for X days (X only when configured). */
export function adoption(members: Member[], auth: AuthEvent[], now: string, dormancyDays: number | null) {
  // Enrolled: registration not pending or rejected (an SFDC invitation counts: the member was asked to log in).
  const enrolled = members.filter((m) => !["pending", "rejected"].includes(m.status));
  return enrolled.map((m) => {
    const last = lastLogin(auth, m.id, m.registration.firstLoginAt);
    const since = last ? daysBetween(last, now) : null;
    const status = !last ? "never_logged_in" : dormancyDays == null ? "threshold_not_set" : since! > dormancyDays ? "dormant" : "active";
    return { member: m, last, since, status: status as "never_logged_in" | "dormant" | "active" | "threshold_not_set" };
  });
}

/** Volume by business message type (member, scheme, scan, redemption, ticket, …), from recorded requests. */
export function volumeByType(reqs: IntegrationRequest[]) {
  const types = [...new Set(reqs.map((r) => r.messageType))].sort();
  return types.map((t) => {
    const b = reqs.filter((r) => r.messageType === t);
    return { type: t, total: b.length, success: b.filter((r) => r.status === "success").length, failed: b.filter((r) => r.status === "failed" || r.status === "timeout").length };
  });
}

export interface AuthFilter {
  programme?: string;
  branch?: string;
  appVersion?: string;
  deviceModel?: string;
  os?: string;
  result?: string;
  reason?: string;
}
/** Role here is the member type (programme): members have no portal role. */
export function filterAuth(events: AuthEvent[], f: AuthFilter) {
  return events.filter((a) => (!f.programme || a.programme === f.programme) && (!f.branch || a.branchCode === f.branch) && (!f.appVersion || a.appVersion === f.appVersion) && (!f.deviceModel || a.deviceModel === f.deviceModel) && (!f.os || a.os === f.os) && (!f.result || a.result === f.result) && (!f.reason || a.reason === f.reason));
}
export function filterCrashes(crashes: CrashRecord[], f: { deviceModel?: string; os?: string; version?: string; kind?: string }) {
  return crashes.filter((c) => (!f.deviceModel || c.deviceModel === f.deviceModel) && (!f.os || c.os === f.os) && (!f.version || c.version === f.version) && (!f.kind || c.kind === f.kind));
}

/** Volume by scheme: integration requests (eSeal lookups, payouts) whose business reference is a transaction a scheme accrued on. */
export function volumeByScheme(reqs: IntegrationRequest[], accruals: { schemeId: string; sourceRef: string }[]) {
  const refs = new Map<string, Set<string>>();
  for (const a of accruals) (refs.get(a.schemeId) ?? refs.set(a.schemeId, new Set()).get(a.schemeId)!).add(a.sourceRef);
  return [...refs.entries()].map(([schemeId, set]) => {
    const b = reqs.filter((r) => set.has(r.businessRef));
    return { schemeId, total: b.length, failed: b.filter((r) => r.status === "failed" || r.status === "timeout").length };
  }).filter((x) => x.total).sort((a, b) => b.total - a.total);
}
