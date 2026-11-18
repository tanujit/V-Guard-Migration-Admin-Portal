/**
 * Mock implementation of the dashboard data source.
 * Every number here comes from the demo engine (data/mock) — never from a V-Guard system.
 */
import { PROGRAMMES, TDS_MODEL_LABEL } from "@/config/programmes";
import { findDistrict, findState, GEOGRAPHY, PRODUCT_CATEGORIES } from "@/config/geography";
import { AGEING_BUCKETS, FULFILMENT_STATUSES, KYC_CHECKS, REGISTRATION_STATUSES, CASE_STATUSES } from "@/config/statuses";
import { resolvePeriod } from "@/data/period";
import {
  dailyFlows,
  dauOn,
  engineMeta,
  geoNoise,
  mauAt,
  monthlyFlows,
  openingFor,
  scopeFromFilters,
  snapshotFor,
  sumFlows,
  sumStatus,
  withProgrammes,
  withStates,
  type Flows,
  type Scope,
  type Snapshot,
} from "@/data/mock/engine";
import { DEMO_ACTIVITIES, DEMO_GIFT_CATALOGUE, DEMO_INTEGRATIONS, DEMO_JOBS, DEMO_RISK_ALERTS, DEMO_SCHEMES, DEMO_SYSTEM_ALERTS, DEMO_TOP_PRODUCTS, RISK_CATEGORY_LIST, RISK_CATEGORY_WEIGHTS, categoryName } from "@/data/mock/catalog";
import { hash01, noise } from "@/data/mock/random";
import { addDays, addMonths, DATA_START, DEMO_AS_OF, DEMO_AS_OF_TIME, dayLabel, daysBetween, daysInMonth, eachDay, fyOf, fyRange, longDate, monthKey, monthLabel, monthsBetween, availableFinancialYears } from "@/data/mock/time";
import type {
  ActiveUsersData,
  DashboardFilters,
  GeoRow,
  GeographyData,
  GiftData,
  KpiMetric,
  KycCheckSummary,
  KycData,
  OperationsData,
  OverviewData,
  PointsData,
  ProgrammeDistributionData,
  RedemptionData,
  ReferralData,
  RegistrationAnalyticsData,
  RegistrationStatusData,
  RiskData,
  SchemeData,
  ScanningData,
  SeriesPoint,
  ShareItem,
  TdsData,
} from "@/types/dashboard";
import type { KycCheckKey, ProgrammeConfig } from "@/types/domain";
import type { DashboardDataSource, GeoDrill } from "./dashboardSource";

const r = Math.round;

function programmesIn(scope: Scope): ProgrammeConfig[] {
  return PROGRAMMES.filter((p) => scope.programmes.includes(p.code));
}

function earned(f: Flows) {
  return f.scanPoints + f.welcomePoints + f.schemePoints + f.bonusPoints + f.referralPoints;
}

function snapshots(scope: Scope, at: string): Snapshot[] {
  return programmesIn(scope).map((p) => snapshotFor(p, scope, at));
}

function total(snaps: Snapshot[], pick: (s: Snapshot) => number) {
  return snaps.reduce((a, s) => a + pick(s), 0);
}

function memberTypeSplit(p: ProgrammeConfig): number[] {
  if (p.memberTypes.length === 1) return [1];
  if (p.memberTypes.length === 2) return [0.72, 0.28];
  return p.memberTypes.map(() => 1 / p.memberTypes.length);
}

function monthSeries(scope: Scope, months: string[], map: (f: Flows, month: string) => Record<string, number>): SeriesPoint[] {
  return monthlyFlows(scope, months).map(({ month, flows }) => ({ key: month, label: monthLabel(month), ...roundAll(map(flows, month)) }));
}

function roundAll(o: Record<string, number>) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)]));
}

function ageing(totalValue: number, seed: string, skew = 0): ShareItem[] {
  const base = [0.38, 0.27, 0.17, 0.11, 0.07];
  const shares = base.map((b, i) => b * noise(`${seed}|${i}`, 0.15) * (1 + skew * i));
  const s = shares.reduce((a, b) => a + b, 0);
  return AGEING_BUCKETS.map((label, i) => ({ key: label, label, value: r((totalValue * shares[i]) / s), tone: i >= 3 ? "negative" : i === 2 ? "warning" : "neutral" }));
}

function lastFullDay(to: string) {
  return to === DEMO_AS_OF ? addDays(to, -1) : to;
}

/** Programme check for catalogue records (schemes, activities): honours the filter and the user's scope. "All" rows are cross-programme. */
function progOk(f: DashboardFilters, programme: string) {
  if (programme === "All") return !f.accessScope || f.accessScope.programmes === "all";
  if (f.programme !== "all" && programme !== f.programme) return false;
  const allowed = f.accessScope?.programmes;
  return !allowed || allowed === "all" || allowed.includes(programme);
}

/* ------------------------------------------------------------------ */

export const mockDashboardSource: DashboardDataSource = {
  async overview(filters) {
    const scope = scopeFromFilters(filters);
    const period = resolvePeriod(filters);
    const now = snapshots(scope, period.to);
    const prev = period.previous ? snapshots(scope, period.previous.to) : null;
    const prevLabel = period.previous ? `vs ${longDate(period.previous.to)}` : "";
    const flows = sumFlows(scope, period.from, period.to);
    const prevFlows = period.previous ? sumFlows(scope, period.previous.from, period.previous.to) : null;
    const today = sumFlows(scope, DEMO_AS_OF, DEMO_AS_OF);
    const yesterday = sumFlows(scope, addDays(DEMO_AS_OF, -1), addDays(DEMO_AS_OF, -1));
    const endMonth = monthKey(period.to);
    const mau = mauAt(scope, endMonth);
    const prevMau = period.previous ? mauAt(scope, monthKey(period.previous.to)) : null;
    const pendingApprovals = DEMO_ACTIVITIES.filter((a) => a.status === "Pending approval" && progOk(filters, a.programme)).length;
    const schemes = DEMO_SCHEMES.filter((s) => progOk(filters, s.programme));
    const cmp = (v: number | null, label = prevLabel) => (v === null ? undefined : { previous: r(v), label });

    const members: KpiMetric[] = [
      { id: "registered", label: "Registered members", value: r(total(now, (s) => s.members)), format: "count", description: `All members registered as at ${longDate(period.to)}`, comparison: cmp(prev && total(prev, (s) => s.members)), goodDirection: "up", drill: { module: "members", title: "Registered members" } },
      { id: "active", label: "Active members", value: r(mau), format: "count", description: "At least one scan or redemption in the last 30 days of the period", comparison: cmp(prevMau), goodDirection: "up", drill: { module: "members", title: "Active members", context: { activity: "Active in last 30 days" } } },
      { id: "approved", label: "Approved members", value: r(total(now, (s) => s.status.approved ?? 0)), format: "count", description: "Members in Approved status", comparison: cmp(prev && total(prev, (s) => s.status.approved ?? 0)), goodDirection: "up", drill: { module: "members", title: "Approved members", context: { status: "Approved" } } },
      { id: "pending", label: "Pending registrations", value: r(total(now, (s) => s.pending)), format: "count", description: "Submitted, in verification, KYC or review", comparison: cmp(prev && total(prev, (s) => s.pending)), goodDirection: "down", drill: { module: "registration-kyc", title: "Pending registrations", context: { status: "Pending (all stages)" } } },
    ];

    const scansToday: KpiMetric[] = [
      { id: "scans-today", label: "QR scans today", value: r(today.scans), format: "count", description: `${longDate(DEMO_AS_OF)} up to ${DEMO_AS_OF_TIME}`, reference: `Yesterday ${r(yesterday.scans).toLocaleString("en-IN")} (full day)`, goodDirection: "up", drill: { module: "scanning", title: "Today's QR scans", context: { date: longDate(DEMO_AS_OF) } } },
      { id: "scans-ok-today", label: "Successful scans", value: r(today.scans - today.failedScans), format: "count", description: "Validated and credited", reference: `Yesterday ${r(yesterday.scans - yesterday.failedScans).toLocaleString("en-IN")}`, goodDirection: "up", drill: { module: "scanning", title: "Successful scans today", context: { date: longDate(DEMO_AS_OF), result: "Successful" } } },
      { id: "scans-failed-today", label: "Failed scans", value: r(today.failedScans), format: "count", description: "Rejected at validation", reference: `Yesterday ${r(yesterday.failedScans).toLocaleString("en-IN")}`, goodDirection: "down", drill: { module: "scanning", title: "Failed scans today", context: { date: longDate(DEMO_AS_OF), result: "Failed" } } },
    ];

    const value: KpiMetric[] = [
      { id: "points-earned", label: "Points earned", value: r(earned(flows)), format: "points", description: "Scan, welcome, scheme, bonus and referral points in the period", comparison: cmp(prevFlows && earned(prevFlows), period.previous ? `vs ${period.previous.label}` : ""), goodDirection: "up", drill: { module: "wallet", title: "Points earned", context: { movement: "Credits" } } },
      { id: "points-redeemed", label: "Points redeemed", value: r(flows.redeemedPoints), format: "points", description: "Points used in redemption requests in the period", comparison: cmp(prevFlows && prevFlows.redeemedPoints, period.previous ? `vs ${period.previous.label}` : ""), goodDirection: "neutral", drill: { module: "wallet", title: "Points redeemed", context: { movement: "Redemptions" } } },
      { id: "redemption-requests", label: "Redemption requests", value: r(flows.redemptionRequests), format: "count", description: "Cash and gift requests raised in the period", comparison: cmp(prevFlows && prevFlows.redemptionRequests, period.previous ? `vs ${period.previous.label}` : ""), goodDirection: "neutral", drill: { module: "redemption", title: "Redemption requests" } },
    ];

    const governance: KpiMetric[] = [
      { id: "pending-approvals", label: "Pending approvals", value: pendingApprovals, format: "count", description: "Maker requests waiting for a Checker. No history yet for comparison", goodDirection: "down", drill: { module: "approvals", title: "Pending approval requests", context: { status: "Pending approval" } } },
      { id: "active-schemes", label: "Active schemes", value: schemes.filter((s) => s.status === "active").length, format: "count", description: "Schemes live today", reference: `${schemes.filter((s) => s.status === "scheduled").length} scheduled, ${schemes.filter((s) => s.status === "pending_approval").length} pending approval`, goodDirection: "neutral", drill: { module: "schemes", title: "Active schemes", context: { status: "Active" } } },
    ];

    // Sparkline history, all from the same demo facts as the figures above.
    const months = period.trendMonths;
    const monthTrendLabel = months.length ? `Monthly, ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}` : undefined;
    const monthly = monthlyFlows(scope, months);
    const openMembers = openingFor(scope).members;
    const memberTrend = months.map((m) => openMembers + sumFlows(scope, DATA_START, `${m}-${String(daysInMonth(m)).padStart(2, "0")}`).registrations);
    const days = eachDay(addDays(DEMO_AS_OF, -14), addDays(DEMO_AS_OF, -1));
    const daily = dailyFlows(scope, days);
    const dayTrendLabel = "Previous 14 full days";
    const trends: Record<string, { trend: number[]; trendLabel?: string }> = {
      registered: { trend: memberTrend, trendLabel: monthTrendLabel },
      active: { trend: months.map((m) => mauAt(scope, m)), trendLabel: monthTrendLabel },
      approved: { trend: monthly.map((x) => x.flows.approvals), trendLabel: monthTrendLabel ? `New approvals, ${monthTrendLabel.toLowerCase()}` : undefined },
      "scans-today": { trend: daily.map((x) => x.flows.scans), trendLabel: dayTrendLabel },
      "scans-ok-today": { trend: daily.map((x) => x.flows.scans - x.flows.failedScans), trendLabel: dayTrendLabel },
      "scans-failed-today": { trend: daily.map((x) => x.flows.failedScans), trendLabel: dayTrendLabel },
      "points-earned": { trend: monthly.map((x) => earned(x.flows)), trendLabel: monthTrendLabel },
      "points-redeemed": { trend: monthly.map((x) => x.flows.redeemedPoints), trendLabel: monthTrendLabel },
      "redemption-requests": { trend: monthly.map((x) => x.flows.redemptionRequests), trendLabel: monthTrendLabel },
    };
    for (const k of [...members, ...scansToday, ...value, ...governance]) {
      const t = trends[k.id];
      if (t && t.trend.length > 1) Object.assign(k, { trend: t.trend.map(r), trendLabel: t.trendLabel });
    }

    return { members, scansToday, value, governance } satisfies OverviewData;
  },

  async programmeDistribution(filters) {
    const scope = scopeFromFilters(filters);
    const period = resolvePeriod(filters);
    const endMonth = monthKey(period.to);
    const rows = programmesIn(scope).map((p) => {
      const ps = withProgrammes(scope, [p.code]);
      const snap = snapshotFor(p, scope, period.to);
      const f = sumFlows(ps, period.from, period.to);
      return {
        code: p.code,
        registered: r(snap.members),
        active: r(mauAt(ps, endMonth)),
        approved: r(snap.status.approved ?? 0),
        pending: r(snap.pending),
        scans: r(f.scans),
        pointsEarned: r(earned(f)),
        pointsRedeemed: r(f.redeemedPoints),
      };
    });
    return { rows } satisfies ProgrammeDistributionData;
  },

  async registrationAnalytics(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const months = period.trendMonths;
    const lastYear = months.map((m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`);
    const lastYearFlows = new Map(monthlyFlows(scope, lastYear).map((x) => [x.month, x.flows]));
    const dataStartMonth = engineMeta.months[0];

    const monthly = monthlyFlows(scope, months).map(({ month, flows }, i) => {
      const ly = lastYear[i] >= dataStartMonth ? lastYearFlows.get(lastYear[i]) : undefined;
      return { key: month, label: monthLabel(month), registrations: r(flows.registrations), approvals: r(flows.approvals), lastYear: ly ? r(ly.registrations) : (null as unknown as number) };
    });

    const fys = availableFinancialYears();
    const yearly = fys.map((fy) => {
      const range = fyRange(fy);
      const f = sumFlows(scope, range.from, range.to);
      const toDate = fyOf(DEMO_AS_OF) === fy;
      return { key: fy, label: toDate ? `FY ${fy} (to date)` : `FY ${fy}`, registrations: r(f.registrations), approvals: r(f.approvals) };
    });

    const quarterFys = Array.from(new Set(months.map((m) => fyOf(`${m}-01`))));
    const quarterly: SeriesPoint[] = [];
    for (const fy of quarterFys) {
      const start = fyRange(fy).from.slice(0, 7);
      for (let q = 0; q < 4; q++) {
        const qMonths = [0, 1, 2].map((i) => addMonths(start, q * 3 + i));
        if (qMonths[0] > monthKey(DEMO_AS_OF)) continue;
        const f = monthlyFlows(scope, qMonths).reduce((a, x) => ({ reg: a.reg + x.flows.registrations, apr: a.apr + x.flows.approvals }), { reg: 0, apr: 0 });
        const partial = qMonths.includes(monthKey(DEMO_AS_OF));
        quarterly.push({ key: `${fy}-Q${q + 1}`, label: `Q${q + 1} ${fy.slice(2)}${partial ? " (to date)" : ""}`, registrations: r(f.reg), approvals: r(f.apr) });
      }
    }

    const byProgrammeMonthly = months.map((m) => ({ key: m, label: monthLabel(m) }) as SeriesPoint);
    for (const p of programmesIn(scope)) {
      monthlyFlows(withProgrammes(scope, [p.code]), months).forEach((x, i) => {
        byProgrammeMonthly[i][p.code] = r(x.flows.registrations);
      });
    }

    const typeTotals = new Map<string, number>();
    for (const p of programmesIn(scope)) {
      const f = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      memberTypeSplit(p).forEach((share, i) => {
        const t = p.memberTypes[i];
        typeTotals.set(t, (typeTotals.get(t) ?? 0) + f.registrations * share);
      });
    }
    const byMemberType = Array.from(typeTotals, ([label, v]) => ({ key: label, label, value: r(v) })).sort((a, b) => b.value - a.value);

    const cur = sumFlows(scope, period.from, period.to);
    const prev = period.previous ? sumFlows(scope, period.previous.from, period.previous.to) : null;
    const momRows = monthly.map((m, i) => {
      const prevVal = i > 0 ? (monthly[i - 1].registrations as number) : null;
      const val = m.registrations as number;
      return { month: m.label, registrations: val, previous: prevVal, change: prevVal ? (val - prevVal) / prevVal : null };
    });

    return {
      monthly,
      quarterly,
      yearly,
      byProgrammeMonthly,
      byMemberType,
      totals: { registrations: r(cur.registrations), approvals: r(cur.approvals), previousRegistrations: prev ? r(prev.registrations) : null },
      momRows,
    } satisfies RegistrationAnalyticsData;
  },

  async registrationStatus(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const progs = programmesIn(scope);
    const snaps = progs.map((p) => snapshotFor(p, scope, period.to));
    const totals = sumStatus(snaps);
    const overall: ShareItem[] = REGISTRATION_STATUSES.filter((s) => (totals[s.key] ?? 0) > 0).map((s) => ({ key: s.key, label: s.label, value: r(totals[s.key]), tone: s.tone }));
    const byProgramme = progs.map((p, i) => ({
      code: p.code,
      counts: Object.fromEntries(p.workflowStatuses.map((k) => [k, r(snaps[i].status[k] ?? 0)])),
      total: r(snaps[i].members),
    }));
    const approvalTrend = monthSeries(scope, period.trendMonths, (f) => ({ approved: f.approvals, rejected: f.rejections }));
    const pendingTotal = total(snaps, (s) => s.pending);
    const pendingByProgramme = progs.map((p, i) => ({ key: p.code, label: p.code, value: r(snaps[i].pending), color: p.color }));
    const states = GEOGRAPHY.filter((s) => scope.states.includes(s.code));
    const pendingByState = states
      .map((s) => {
        const ss = withStates(scope, [s.code]);
        const pending = programmesIn(ss).reduce((a, p) => a + snapshotFor(p, ss, period.to).pending, 0);
        const oldestIdx = Math.min(4, Math.floor(hash01(`old|${s.code}`) * 5));
        return { code: s.code, name: s.name, pending: r(pending), oldest: AGEING_BUCKETS[oldestIdx] };
      })
      .sort((a, b) => b.pending - a.pending);
    return { overall, byProgramme, approvalTrend, ageing: ageing(pendingTotal, "reg-age"), pendingByProgramme, pendingByState } satisfies RegistrationStatusData;
  },

  async activeUsers(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const end = lastFullDay(period.to);
    const days = eachDay(addDays(end, -29), end);
    const dailyActive = days.map((d) => ({ key: d, label: dayLabel(d), dau: r(dauOn(scope, d)) }));
    const monthlyActive = period.trendMonths.map((m) => ({ key: m, label: monthLabel(m), mau: r(mauAt(scope, m)) }));
    const periodMonths = monthsBetween(monthKey(period.from), monthKey(period.to));
    const peak = Math.max(...periodMonths.map((m) => mauAt(scope, m)));
    const snaps = snapshots(scope, period.to);
    const totalMembers = total(snaps, (s) => s.members);
    const unique = Math.min(totalMembers * 0.8, peak * (1 + 0.16 * (periodMonths.length - 1)));
    const endMonth = monthKey(period.to);
    const byProgramme = programmesIn(scope).map((p, i) => {
      const active = mauAt(withProgrammes(scope, [p.code]), endMonth);
      return { code: p.code, active: r(active), inactive: r(Math.max(0, snaps[i].members - active)) };
    });
    return {
      dailyActive,
      monthlyActive,
      latestDau: r(dauOn(scope, end)),
      latestMau: r(mauAt(scope, endMonth)),
      uniqueActiveInPeriod: r(unique),
      totalMembers: r(totalMembers),
      byProgramme,
    } satisfies ActiveUsersData;
  },

  async geography(filters, drill) {
    const base = scopeFromFilters({ ...filters, state: "all", district: "all", branch: "all", category: "all" });
    const period = resolvePeriod(filters);
    const endMonth = monthKey(period.to);

    const level: GeoDrill = drill ?? (filters.district !== "all" ? { level: "branch", parent: filters.district } : filters.state !== "all" ? { level: "district", parent: filters.state } : { level: "state" });

    const rowFor = (code: string, name: string, scope: Scope, childCount: number): GeoRow => {
      const snaps = programmesIn(scope).map((p) => snapshotFor(p, scope, period.to));
      const f = sumFlows(scope, period.from, period.to);
      const byProgramme: Record<string, number> = {};
      programmesIn(scope).forEach((p, i) => (byProgramme[p.code] = r(snaps[i].members)));
      return {
        code,
        name,
        members: r(total(snaps, (s) => s.members)),
        active: r(mauAt(scope, endMonth)),
        approved: r(total(snaps, (s) => s.status.approved ?? 0)),
        pending: r(total(snaps, (s) => s.pending)),
        scans: r(f.scans),
        childCount,
        byProgramme,
      };
    };

    if (level.level === "district" && level.parent) {
      const st = findState(level.parent);
      if (st && base.states.includes(st.code)) {
        const rows = st.districts.map((d) => rowFor(d.code, d.name, withStates(base, [st.code], d.weight * geoNoise(d.code)), d.branches.length));
        return { level: "district", parent: { code: st.code, name: st.name, level: "state" }, rows: rows.sort((a, b) => b.members - a.members) } satisfies GeographyData;
      }
    }
    if (level.level === "branch" && level.parent) {
      const hit = findDistrict(level.parent);
      if (hit && base.states.includes(hit.state.code)) {
        const dFactor = hit.district.weight * geoNoise(hit.district.code);
        const rows = hit.district.branches.map((b) => rowFor(b.code, b.name, withStates(base, [hit.state.code], dFactor * b.weight * geoNoise(b.code)), 0));
        return { level: "branch", parent: { code: hit.district.code, name: `${hit.district.name}, ${hit.state.name}`, level: "district" }, rows } satisfies GeographyData;
      }
    }
    const rows = GEOGRAPHY.filter((s) => base.states.includes(s.code)).map((s) => rowFor(s.code, s.name, withStates(base, [s.code], 1), s.districts.length));
    return { level: "state", rows: rows.sort((a, b) => b.members - a.members) } satisfies GeographyData;
  },

  async scanning(filters) {
    const scope = scopeFromFilters(filters);
    const period = resolvePeriod(filters);
    const f = sumFlows(scope, period.from, period.to);
    const prev = period.previous ? sumFlows(scope, period.previous.from, period.previous.to) : null;
    const endMonth = monthKey(period.to);
    const days = eachDay(addDays(period.to, -29), period.to);
    const daily = dailyFlows(scope, days).map(({ day, flows }) => ({ key: day, label: dayLabel(day), successful: r(flows.scans - flows.failedScans), failed: r(flows.failedScans), partial: day === DEMO_AS_OF ? 1 : 0 }));
    const monthly = monthSeries(scope, period.trendMonths, (x) => ({ successful: x.scans - x.failedScans, failed: x.failedScans }));

    const byProgramme = programmesIn(scope).map((p) => {
      const pf = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      return { code: p.code, total: r(pf.scans), successful: r(pf.scans - pf.failedScans), failed: r(pf.failedScans), points: r(pf.scanPoints), successRate: pf.scans ? (pf.scans - pf.failedScans) / pf.scans : 0 };
    });

    const noCat = { ...scope, category: null };
    const allScans = sumFlows(noCat, period.from, period.to).scans;
    const byCategory = PRODUCT_CATEGORIES.map((c) => ({ key: c.key, label: c.name, value: r(allScans * c.weight * noise(`cat|${c.key}|${period.from}`, 0.05)) })).sort((a, b) => b.value - a.value);

    const typeTotals = new Map<string, number>();
    for (const p of programmesIn(scope)) {
      const pf = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      memberTypeSplit(p).forEach((share, i) => typeTotals.set(p.memberTypes[i], (typeTotals.get(p.memberTypes[i]) ?? 0) + pf.scans * share));
    }
    const byMemberType = Array.from(typeTotals, ([label, v]) => ({ key: label, label, value: r(v) })).sort((a, b) => b.value - a.value);

    const catPoints = Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c.key, c.pointsPerScan]));
    const topProducts = DEMO_TOP_PRODUCTS.filter((p) => filters.category === "all" || p.category === filters.category)
      .map((p) => {
        const catScans = byCategory.find((c) => c.key === p.category)?.value ?? 0;
        const scans = r(catScans * (0.14 + 0.22 * hash01(`sku|${p.sku}`)));
        return { sku: p.sku, name: p.name, category: categoryName(p.category), scans, points: scans * catPoints[p.category] };
      })
      .sort((a, b) => b.scans - a.scans);

    const mau = mauAt(scope, endMonth);
    return {
      totals: { total: r(f.scans), successful: r(f.scans - f.failedScans), failed: r(f.failedScans), points: r(f.scanPoints), perActive: mau ? (f.scans - f.failedScans) / mau / Math.max(1, monthsBetween(monthKey(period.from), endMonth).length) : 0, previousTotal: prev ? r(prev.scans) : null },
      daily,
      monthly,
      byProgramme,
      byCategory,
      byMemberType,
      topProducts,
    } satisfies ScanningData;
  },

  async points(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const f = sumFlows(scope, period.from, period.to);
    const snaps = snapshots(scope, period.to);
    const open = openingFor(scope);
    const lifetimeEarned = open.points / 0.38 + total(snaps, (s) => earned(s.lifetime));
    const lastWeek = sumFlows(scope, addDays(period.to, -6), period.to);
    const movement = monthSeries(scope, period.trendMonths, (x) => ({ earned: earned(x), redeemed: x.redeemedPoints, reversed: x.reversedPoints }));
    const byProgramme = programmesIn(scope).map((p, i) => {
      const pf = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      return { code: p.code, earned: r(earned(pf)), redeemed: r(pf.redeemedPoints), available: r(snaps[i].availablePoints), tdsModel: TDS_MODEL_LABEL[p.tdsModel], kitty: p.hasTdsKitty ? r(snaps[i].kitty) : null };
    });
    return {
      lifetimeEarned: r(lifetimeEarned),
      available: r(total(snaps, (s) => s.availablePoints)),
      scanPoints: r(f.scanPoints),
      welcomeBonus: r(f.welcomePoints),
      schemePoints: r(f.schemePoints),
      bonusPoints: r(f.bonusPoints),
      redeemed: r(f.redeemedPoints),
      reversed: r(f.reversedPoints),
      pendingSettlement: r(lastWeek.redeemedPoints * 0.3),
      tdsDeducted: r(f.tdsAccrual + f.tdsRedemption),
      tdsKitty: r(total(snaps, (s) => s.kitty)),
      movement,
      byProgramme,
    } satisfies PointsData;
  },

  async redemption(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const f = sumFlows(scope, period.from, period.to);
    const recent = sumFlows(scope, addDays(period.to, -6), period.to);
    const progs = programmesIn(scope);
    let valueInr = 0;
    let pendingPayouts = 0;
    let pendingPayoutValue = 0;
    const byProgramme = progs.map((p) => {
      const pf = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      const rf = sumFlows(withProgrammes(scope, [p.code]), addDays(period.to, -6), period.to);
      const val = pf.redeemedPoints * p.pointValueInr;
      valueInr += val;
      if (p.redemption.cash) {
        const cashShare = p.redemption.gift ? 0.78 : 1;
        pendingPayouts += rf.redemptionSuccess * cashShare * 0.35;
        pendingPayoutValue += rf.redeemedPoints * cashShare * 0.35 * p.pointValueInr;
      }
      const modes = [p.redemption.cash && "Cash", p.redemption.gift && "Gift"].filter(Boolean).join(", ") || "Not configured";
      return { code: p.code, requests: r(pf.redemptionRequests), successful: r(pf.redemptionSuccess), pending: r(rf.redemptionRequests * 0.04 + pf.redemptionRequests * 0.04 * 0.1), points: r(pf.redeemedPoints), valueInr: r(val), modes };
    });
    const pending = f.redemptionRequests - f.redemptionSuccess - f.redemptionRejected - f.redemptionCancelled;
    const trend = monthSeries(scope, period.trendMonths, (x) => ({ successful: x.redemptionSuccess, other: x.redemptionRequests - x.redemptionSuccess }));
    return {
      totals: {
        requests: r(f.redemptionRequests),
        successful: r(f.redemptionSuccess),
        pending: r(pending),
        rejected: r(f.redemptionRejected),
        cancelled: r(f.redemptionCancelled),
        points: r(f.redeemedPoints),
        valueInr: r(valueInr),
        pendingPayouts: r(pendingPayouts),
        pendingPayoutValue: r(pendingPayoutValue),
        failedPayouts: r(recent.redemptionRequests * 0.006),
      },
      trend,
      byProgramme,
    } satisfies RedemptionData;
  },

  async kyc(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const progs = programmesIn(scope);
    const rates: Record<KycCheckKey, [number, number, number]> = { aadhaar: [0.86, 0.05, 0.025], pan: [0.74, 0.06, 0.03], pan_aadhaar_link: [0.69, 0.05, 0.02], bank: [0.71, 0.07, 0.04], gst: [0.64, 0.08, 0.05] };
    const acc = new Map<KycCheckKey, KycCheckSummary>();
    const byProgramme = progs.map((p) => {
      const snap = snapshotFor(p, scope, period.to);
      const eligible = snap.members - snap.pending + (snap.status.pending_kyc ?? 0) - (snap.status.rejected ?? 0);
      let v = 0,
        pe = 0,
        fa = 0;
      for (const check of p.kycChecks) {
        const [vr, pr, fr] = rates[check];
        const n = noise(`kyc|${p.code}|${check}`, 0.05);
        const verified = eligible * vr * n;
        const pending = eligible * pr * noise(`kp|${p.code}|${check}`, 0.2);
        const failed = eligible * fr * noise(`kf|${p.code}|${check}`, 0.3);
        const notSubmitted = Math.max(0, eligible - verified - pending - failed);
        const label = KYC_CHECKS.find((c) => c.key === check)!.label;
        const cur = acc.get(check) ?? { check, label, verified: 0, pending: 0, failed: 0, notSubmitted: 0, applicableProgrammes: [] };
        cur.verified += verified;
        cur.pending += pending;
        cur.failed += failed;
        cur.notSubmitted += notSubmitted;
        cur.applicableProgrammes.push(p.code);
        acc.set(check, cur);
        v += verified;
        pe += pending;
        fa += failed;
      }
      return { code: p.code, checks: p.kycChecks, verified: r(v), pending: r(pe), failed: r(fa) };
    });
    const checks = KYC_CHECKS.filter((c) => acc.has(c.key)).map((c) => {
      const x = acc.get(c.key)!;
      return { ...x, verified: r(x.verified), pending: r(x.pending), failed: r(x.failed), notSubmitted: r(x.notSubmitted) };
    });
    const pan = acc.get("pan");
    const panVerified = pan ? pan.verified : 0;
    const totalPending = checks.reduce((a, c) => a + c.pending, 0);
    return {
      checks,
      panOperative: { operative: r(panVerified * 0.91), inoperative: r(panVerified * 0.07), unknown: r(panVerified * 0.02) },
      ageing: ageing(totalPending, "kyc-age", 0.1),
      byProgramme,
    } satisfies KycData;
  },

  async schemes(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const schemes = DEMO_SCHEMES.filter((s) => progOk(filters, s.programme));
    const pointsTrend = monthSeries(scope, period.trendMonths, (x) => ({ schemePoints: x.schemePoints }));
    return { schemes, pointsTrend } satisfies SchemeData;
  },

  async gifts(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const shares = { delivered: 0.78, dispatched: 0.12, pending: 0.08, failed: 0.02 };
    const byProgramme = programmesIn(scope)
      .filter((p) => p.redemption.gift)
      .map((p) => {
        const orders = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to).giftOrders;
        const n = noise(`gift|${p.code}`, 0.1);
        return { code: p.code, orders: r(orders), pending: r(orders * shares.pending * n), dispatched: r(orders * shares.dispatched), delivered: r(orders * shares.delivered / n), failed: r(orders * shares.failed * n) };
      });
    const sum = (k: "pending" | "dispatched" | "delivered" | "failed") => byProgramme.reduce((a, x) => a + x[k], 0);
    const statuses = FULFILMENT_STATUSES.map((s) => ({ key: s.key, label: s.label, value: sum(s.key), tone: s.tone }));
    return { catalogue: DEMO_GIFT_CATALOGUE, statuses, requests: byProgramme.reduce((a, x) => a + x.orders, 0), byProgramme } satisfies GiftData;
  },

  async tds(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const f = sumFlows(scope, period.from, period.to);
    const snaps = snapshots(scope, period.to);
    const monthly = monthSeries(scope, period.trendMonths, (x) => ({ atAccrual: x.tdsAccrual, atRedemption: x.tdsRedemption }));
    const progs = programmesIn(scope);
    const byProgramme = progs.map((p, i) => {
      const pf = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      return { code: p.code, model: TDS_MODEL_LABEL[p.tdsModel], accrual: r(pf.tdsAccrual), redemption: r(pf.tdsRedemption), kitty: p.hasTdsKitty ? r(snaps[i].kitty) : null, pendingActions: Math.floor(hash01(`tdsact|${p.code}`) * 40) };
    });
    const panBase = total(snaps, (s) => s.members) * 0.62;
    return {
      accrualTds: r(f.tdsAccrual),
      redemptionTds: r(f.tdsRedemption),
      kittyBalance: r(total(snaps, (s) => s.kitty)),
      availablePoints: r(total(snaps, (s) => s.availablePoints)),
      periodTds: r(f.tdsAccrual + f.tdsRedemption),
      monthly,
      panOperative: { operative: r(panBase * 0.91), inoperative: r(panBase * 0.07), unknown: r(panBase * 0.02) },
      byProgramme,
      pendingActivities: [
        { label: "Accrual deductions on inoperative PAN awaiting review", count: r(panBase * 0.07 * 0.004), module: "financial" },
        { label: "TDS Kitty releases waiting for approval", count: Math.floor(hash01(`kitty-rel|${filters.programme}`) * 30) + 4, module: "approvals" },
        { label: "TDS certificates or statements (scope to be confirmed)", count: 0, module: "reports" },
      ],
    } satisfies TdsData;
  },

  async referrals(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const f = sumFlows(scope, period.from, period.to);
    const trend = monthSeries(scope, period.trendMonths, (x) => ({ successful: x.referralSuccess, pending: x.referrals - x.referralSuccess - x.referralRejected, rejected: x.referralRejected }));
    const byProgramme = programmesIn(scope).map((p) => {
      const pf = sumFlows(withProgrammes(scope, [p.code]), period.from, period.to);
      return { code: p.code, enabled: p.referralEnabled, total: r(pf.referrals), successful: r(pf.referralSuccess), pending: r(pf.referrals - pf.referralSuccess - pf.referralRejected), rejected: r(pf.referralRejected), pointsIssued: r(pf.referralPoints) };
    });
    return {
      totals: { total: r(f.referrals), successful: r(f.referralSuccess), pending: r(f.referrals - f.referralSuccess - f.referralRejected), rejected: r(f.referralRejected), pointsIssued: r(f.referralPoints), pointsRedeemed: r(f.referralPointsRedeemed) },
      trend,
      byProgramme,
    } satisfies ReferralData;
  },

  async risk(filters) {
    const scope = scopeFromFilters({ ...filters, category: "all" });
    const period = resolvePeriod(filters);
    const f = sumFlows(scope, period.from, period.to);
    const snaps = snapshots(scope, period.to);
    const flagged = f.fraudAlerts;
    const alerts = DEMO_RISK_ALERTS.filter((a) => scope.programmes.includes(a.programme) && scope.states.includes(a.state));
    const share = (keys: string[]) => (alerts.length ? alerts.filter((a) => keys.includes(a.status)).length / alerts.length : 0);
    const pendingShare = share(["new", "under_review", "escalated"]);
    const categories = RISK_CATEGORY_LIST.map((c) => ({ key: c, label: c, value: r(flagged * RISK_CATEGORY_WEIGHTS[c] * noise(`rc|${c}|${filters.programme}`, 0.1)) })).sort((a, b) => b.value - a.value);
    const statuses = CASE_STATUSES.map((s) => ({ key: s.key, label: s.label, value: r(flagged * share([s.key])), tone: s.tone }));
    return {
      totals: { flagged: r(flagged), pendingInvestigations: r(flagged * pendingShare), blocked: r(total(snaps, (s) => s.status.blocked ?? 0)), resolved: r(flagged * share(["resolved"])) },
      categories,
      statuses,
      trend: monthSeries(scope, period.trendMonths, (x) => ({ alerts: x.fraudAlerts })),
      ageing: ageing(flagged * pendingShare, "risk-age", 0.2),
      alerts: alerts.filter((a) => (a.priority === "critical" || a.priority === "high") && a.status !== "resolved" && a.status !== "dismissed").slice(0, 8),
    } satisfies RiskData;
  },

  async operations(filters) {
    const progFilter = (p: string) => progOk(filters, p);
    const acts = DEMO_ACTIVITIES.filter((a) => progFilter(a.programme));
    const pendingActs = acts.filter((a) => a.status === "Pending approval");
    const ageingBuckets: ShareItem[] = AGEING_BUCKETS.map((label, i) => ({ key: label, label, value: 0, tone: i >= 3 ? "negative" : i === 2 ? "warning" : "neutral" }));
    for (const a of pendingActs) {
      const d = daysBetween(a.at.slice(0, 10), DEMO_AS_OF);
      const idx = d <= 2 ? 0 : d <= 7 ? 1 : d <= 15 ? 2 : d <= 30 ? 3 : 4;
      ageingBuckets[idx].value += 1;
    }
    const scale = filters.programme === "all" ? 1 : 0.3;
    return {
      approvals: { pending: pendingActs.length, ageing: ageingBuckets },
      tickets: { open: r(342 * scale), escalated: r(37 * scale), slaBreaches: r(14 * scale) },
      integrations: DEMO_INTEGRATIONS,
      jobs: DEMO_JOBS,
      alerts: DEMO_SYSTEM_ALERTS,
      activities: acts,
    } satisfies OperationsData;
  },
};
