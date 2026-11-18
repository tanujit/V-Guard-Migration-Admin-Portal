/**
 * DEMO DATA ENGINE — development data only, not connected to any V-Guard system.
 *
 * Generates a fact table at programme × state × month grain, plus opening balances, and exposes
 * aggregation helpers that respect the dashboard filters. Engine parameters below shape the demo
 * and carry no business meaning; real figures come from the backend once integrated.
 */
import { PROGRAMMES } from "@/config/programmes";
import { GEOGRAPHY, findBranch, findCategory, findDistrict, PRODUCT_CATEGORIES } from "@/config/geography";
import type { DashboardFilters } from "@/types/dashboard";
import type { ProgrammeConfig } from "@/types/domain";
import { noise, hash01 } from "./random";
import {
  addDays,
  DATA_START,
  DEMO_AS_OF,
  DEMO_TODAY_FRACTION,
  daysInMonth,
  maxIso,
  minIso,
  monthKey,
  monthsBetween,
  toDate,
} from "./time";

export const FLOW_KEYS = [
  "registrations",
  "approvals",
  "rejections",
  "scans",
  "failedScans",
  "scanPoints",
  "welcomePoints",
  "schemePoints",
  "bonusPoints",
  "reversedPoints",
  "redeemedPoints",
  "redemptionRequests",
  "redemptionSuccess",
  "redemptionRejected",
  "redemptionCancelled",
  "tdsAccrual",
  "tdsRedemption",
  "kittyAdded",
  "kittyReleased",
  "referrals",
  "referralSuccess",
  "referralRejected",
  "referralPoints",
  "referralPointsRedeemed",
  "giftOrders",
  "fraudAlerts",
] as const;

export type FlowKey = (typeof FLOW_KEYS)[number];
export type Flows = Record<FlowKey, number>;

/** Keys that move with the product category filter. */
const CATEGORY_KEYS: FlowKey[] = ["scans", "failedScans", "scanPoints"];

interface EngineParams {
  monthlyRegistrations: number;
  openingMembers: number;
  approvalRate: number;
  activeRate: number;
  scansPerActive: number;
  failRate: number;
  welcomeBonus: number;
  redeemShare: number;
  avgRedemption: number;
}

/** Demo shaping parameters per programme. Unknown programmes fall back to DEFAULT_PARAMS. */
const PARAMS: Record<string, EngineParams> = {
  EP: { monthlyRegistrations: 9000, openingMembers: 312000, approvalRate: 0.82, activeRate: 0.36, scansPerActive: 7.5, failRate: 0.042, welcomeBonus: 100, redeemShare: 0.6, avgRedemption: 1400 },
  Retailer: { monthlyRegistrations: 4200, openingMembers: 128000, approvalRate: 0.78, activeRate: 0.5, scansPerActive: 11, failRate: 0.036, welcomeBonus: 200, redeemShare: 0.58, avgRedemption: 3200 },
  CS: { monthlyRegistrations: 2600, openingMembers: 64000, approvalRate: 0.86, activeRate: 0.29, scansPerActive: 4, failRate: 0.051, welcomeBonus: 50, redeemShare: 0.52, avgRedemption: 900 },
  ST: { monthlyRegistrations: 1800, openingMembers: 41000, approvalRate: 0.8, activeRate: 0.43, scansPerActive: 6, failRate: 0.047, welcomeBonus: 100, redeemShare: 0.63, avgRedemption: 1200 },
  DD: { monthlyRegistrations: 380, openingMembers: 6200, approvalRate: 0.9, activeRate: 0.68, scansPerActive: 2, failRate: 0.03, welcomeBonus: 0, redeemShare: 0.45, avgRedemption: 8000 },
};

const DEFAULT_PARAMS: EngineParams = { monthlyRegistrations: 1000, openingMembers: 20000, approvalRate: 0.8, activeRate: 0.4, scansPerActive: 5, failRate: 0.045, welcomeBonus: 100, redeemShare: 0.55, avgRedemption: 1500 };

/** Illustrative demo rates only. Actual TDS rules belong to Financial configuration. */
const DEMO_TDS_RATE_ACCRUAL = 0.02;
const DEMO_TDS_RATE_REDEMPTION = 0.05;

const SEASON = [0.98, 1.0, 1.08, 0.95, 1.0, 0.92, 0.86, 0.92, 1.02, 1.14, 1.12, 1.0]; // Jan..Dec

export const AVG_POINTS_PER_SCAN = PRODUCT_CATEGORIES.reduce((s, c) => s + c.weight * c.pointsPerScan, 0);

export function paramsFor(code: string): EngineParams {
  return PARAMS[code] ?? DEFAULT_PARAMS;
}

interface Fact {
  programme: string;
  state: string;
  month: string;
  flows: Flows;
  mau: number;
}

interface Opening {
  members: number;
  points: number;
  kitty: number;
}

const ALL_MONTHS = monthsBetween(monthKey(DATA_START), monthKey(DEMO_AS_OF));

function emptyFlows(): Flows {
  return Object.fromEntries(FLOW_KEYS.map((k) => [k, 0])) as Flows;
}

function buildFacts(): { facts: Fact[]; opening: Map<string, Opening> } {
  const facts: Fact[] = [];
  const opening = new Map<string, Opening>();

  for (const p of PROGRAMMES) {
    const prm = paramsFor(p.code);
    for (const s of GEOGRAPHY) {
      const key = `${p.code}|${s.code}`;
      const openMembers = prm.openingMembers * s.weight * noise(`open|${key}`, 0.12);
      let members = openMembers;
      opening.set(key, {
        members: openMembers,
        points: openMembers * 0.7 * 140 * noise(`openpts|${key}`, 0.15),
        kitty: p.hasTdsKitty ? openMembers * 9 * noise(`kitty|${key}`, 0.2) : 0,
      });

      ALL_MONTHS.forEach((month, i) => {
        const seed = `${key}|${month}`;
        const season = SEASON[Number(month.slice(5, 7)) - 1];
        const growth = 1 + 0.018 * i;
        const f = emptyFlows();

        f.registrations = prm.monthlyRegistrations * s.weight * growth * season * noise(`reg|${seed}`, 0.14);
        f.approvals = f.registrations * prm.approvalRate * noise(`apr|${seed}`, 0.05);
        f.rejections = f.registrations * 0.06 * noise(`rej|${seed}`, 0.3);
        members += f.registrations;

        const mau = members * prm.activeRate * (0.9 + 0.1 * season) * noise(`mau|${seed}`, 0.06);
        const scans = mau * prm.scansPerActive * season * noise(`scan|${seed}`, 0.08);
        f.failedScans = scans * prm.failRate * noise(`fail|${seed}`, 0.25);
        f.scans = scans;
        const successful = scans - f.failedScans;
        f.scanPoints = successful * AVG_POINTS_PER_SCAN;
        f.welcomePoints = f.approvals * prm.welcomeBonus;
        f.schemePoints = f.scanPoints * 0.18 * noise(`sch|${seed}`, 0.3);
        f.bonusPoints = f.scanPoints * 0.05 * noise(`bon|${seed}`, 0.4);
        f.reversedPoints = f.scanPoints * 0.006 * noise(`revp|${seed}`, 0.5);

        if (p.referralEnabled) {
          f.referrals = f.registrations * 0.12 * noise(`ref|${seed}`, 0.2);
          f.referralSuccess = f.referrals * 0.6;
          f.referralRejected = f.referrals * 0.12;
          f.referralPoints = f.referralSuccess * 150;
          f.referralPointsRedeemed = f.referralPoints * 0.55;
        }

        const earned = f.scanPoints + f.welcomePoints + f.schemePoints + f.bonusPoints + f.referralPoints;
        f.redeemedPoints = earned * prm.redeemShare * noise(`red|${seed}`, 0.12);
        f.redemptionRequests = f.redeemedPoints / prm.avgRedemption;
        f.redemptionSuccess = f.redemptionRequests * 0.9;
        f.redemptionRejected = f.redemptionRequests * 0.035;
        f.redemptionCancelled = f.redemptionRequests * 0.025;

        const giftShare = p.redemption.gift ? (p.redemption.cash ? 0.22 : 1) : 0;
        f.giftOrders = f.redemptionRequests * giftShare;

        if (p.tdsModel === "at_accrual") f.tdsAccrual = (f.scanPoints + f.schemePoints + f.bonusPoints) * p.pointValueInr * DEMO_TDS_RATE_ACCRUAL;
        if (p.tdsModel === "at_redemption") f.tdsRedemption = f.redeemedPoints * p.pointValueInr * DEMO_TDS_RATE_REDEMPTION;
        if (p.hasTdsKitty) {
          f.kittyAdded = f.tdsAccrual * 0.4;
          f.kittyReleased = f.kittyAdded * 0.3;
        }
        f.fraudAlerts = scans * 0.0009 * noise(`fr|${seed}`, 0.3);

        facts.push({ programme: p.code, state: s.code, month, flows: f, mau });
      });
    }
  }
  return { facts, opening };
}

const { facts: FACTS, opening: OPENING } = buildFacts();

/* ---------------- Day shares (how a month's flow is spread over its days) ---------------- */

const WEEKDAY_FACTOR = [0.62, 1.04, 1.06, 1.05, 1.07, 1.1, 1.0]; // Sun..Sat
const dayShareCache = new Map<string, number[]>();

function dayShares(month: string): number[] {
  const cached = dayShareCache.get(month);
  if (cached) return cached;
  const n = daysInMonth(month);
  const raw: number[] = [];
  for (let d = 1; d <= n; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    raw.push(WEEKDAY_FACTOR[toDate(iso).getUTCDay()] * noise(`day|${iso}`, 0.1));
  }
  const total = raw.reduce((a, b) => a + b, 0);
  const shares = raw.map((v) => v / total);
  // The as-of day is partial.
  if (month === monthKey(DEMO_AS_OF)) {
    const idx = Number(DEMO_AS_OF.slice(8, 10)) - 1;
    shares[idx] *= DEMO_TODAY_FRACTION;
  }
  dayShareCache.set(month, shares);
  return shares;
}

/** Fraction of a month's flow that falls within [from, to], clamped to the data window. */
function coverage(month: string, from: string, to: string): number {
  const start = maxIso(maxIso(from, `${month}-01`), DATA_START);
  const end = minIso(minIso(to, `${month}-${String(daysInMonth(month)).padStart(2, "0")}`), DEMO_AS_OF);
  if (start > end) return 0;
  const shares = dayShares(month);
  let sum = 0;
  for (let d = Number(start.slice(8, 10)); d <= Number(end.slice(8, 10)); d++) sum += shares[d - 1];
  return sum;
}

/* ---------------- Scope (filters → which facts and how they are scaled) ---------------- */

export interface Scope {
  programmes: string[];
  states: string[];
  geoFactor: number;
  category: { weight: number; pointsFactor: number } | null;
}

export function scopeFromFilters(f: Pick<DashboardFilters, "programme" | "state" | "district" | "branch" | "category" | "accessScope">): Scope {
  const scope = scopeFromFiltersUnclamped(f);
  // Clamp to the signed-in user's data scope (programme and state level in the demo data).
  const allowedP = f.accessScope?.programmes;
  const allowedS = f.accessScope?.states;
  return {
    ...scope,
    programmes: allowedP && allowedP !== "all" ? scope.programmes.filter((p) => allowedP.includes(p)) : scope.programmes,
    states: allowedS && allowedS !== "all" ? scope.states.filter((st) => allowedS.includes(st)) : scope.states,
  };
}

function scopeFromFiltersUnclamped(f: Pick<DashboardFilters, "programme" | "state" | "district" | "branch" | "category">): Scope {
  const programmes = f.programme === "all" ? PROGRAMMES.map((p) => p.code) : [f.programme];
  let states = GEOGRAPHY.map((s) => s.code);
  let geoFactor = 1;

  if (f.branch !== "all") {
    const hit = findBranch(f.branch);
    if (hit) {
      states = [hit.state.code];
      geoFactor = hit.district.weight * noise(`d|${hit.district.code}`, 0.1) * hit.branch.weight * noise(`b|${hit.branch.code}`, 0.1);
    }
  } else if (f.district !== "all") {
    const hit = findDistrict(f.district);
    if (hit) {
      states = [hit.state.code];
      geoFactor = hit.district.weight * noise(`d|${hit.district.code}`, 0.1);
    }
  } else if (f.state !== "all") {
    states = [f.state];
  }

  let category: Scope["category"] = null;
  if (f.category !== "all") {
    const c = findCategory(f.category);
    if (c) category = { weight: c.weight, pointsFactor: c.pointsPerScan / AVG_POINTS_PER_SCAN };
  }
  return { programmes, states, geoFactor, category };
}

export function withProgrammes(scope: Scope, programmes: string[]): Scope {
  return { ...scope, programmes: scope.programmes.filter((p) => programmes.includes(p)) };
}

export function withStates(scope: Scope, states: string[], geoFactor = scope.geoFactor): Scope {
  return { ...scope, states, geoFactor };
}

function scaleInto(target: Flows, src: Flows, factor: number, scope: Scope) {
  for (const k of FLOW_KEYS) {
    let v = src[k] * factor;
    if (scope.category && CATEGORY_KEYS.includes(k)) {
      v *= scope.category.weight;
      if (k === "scanPoints") v *= scope.category.pointsFactor;
    }
    target[k] += v;
  }
}

function factsIn(scope: Scope) {
  const ps = new Set(scope.programmes);
  const ss = new Set(scope.states);
  return FACTS.filter((x) => ps.has(x.programme) && ss.has(x.state));
}

/** Sum of flows over a date span. */
export function sumFlows(scope: Scope, from: string, to: string): Flows {
  const out = emptyFlows();
  const months = new Set(monthsBetween(monthKey(maxIso(from, DATA_START)), monthKey(minIso(to, DEMO_AS_OF))));
  for (const fact of factsIn(scope)) {
    if (!months.has(fact.month)) continue;
    const c = coverage(fact.month, from, to);
    if (c > 0) scaleInto(out, fact.flows, c * scope.geoFactor, scope);
  }
  return out;
}

/** Flows per month (each clamped to the data window). */
export function monthlyFlows(scope: Scope, months: string[]): { month: string; flows: Flows }[] {
  const index = new Map(months.map((m) => [m, emptyFlows()]));
  for (const fact of factsIn(scope)) {
    const target = index.get(fact.month);
    if (!target) continue;
    const c = coverage(fact.month, `${fact.month}-01`, `${fact.month}-31`);
    scaleInto(target, fact.flows, c * scope.geoFactor, scope);
  }
  return months.map((m) => ({ month: m, flows: index.get(m)! }));
}

/** Flows per day for a span (monthly flow × the day's share). */
export function dailyFlows(scope: Scope, days: string[]): { day: string; flows: Flows }[] {
  const months = Array.from(new Set(days.map(monthKey)));
  const perMonth = new Map(monthlyFlows(scope, months).map((m) => [m.month, m]));
  return days.map((day) => {
    const m = monthKey(day);
    const monthFlows = perMonth.get(m)!.flows;
    const shares = dayShares(m);
    const monthCoverage = coverage(m, `${m}-01`, `${m}-31`) || 1;
    const share = shares[Number(day.slice(8, 10)) - 1] / monthCoverage;
    const flows = emptyFlows();
    if (day <= DEMO_AS_OF && day >= DATA_START) for (const k of FLOW_KEYS) flows[k] = monthFlows[k] * share;
    return { day, flows };
  });
}

/** Monthly active members for the month containing `iso`. Category does not apply. */
export function mauAt(scope: Scope, month: string): number {
  let sum = 0;
  for (const fact of factsIn(scope)) if (fact.month === month) sum += fact.mau;
  return sum * scope.geoFactor;
}

/** Daily active members on a given day (demo: a share of that month's MAU). */
export function dauOn(scope: Scope, day: string): number {
  if (day > DEMO_AS_OF || day < DATA_START) return 0;
  const mau = mauAt(scope, monthKey(day));
  const wd = WEEKDAY_FACTOR[toDate(day).getUTCDay()];
  const partial = day === DEMO_AS_OF ? DEMO_TODAY_FRACTION : 1;
  return mau * 0.19 * wd * noise(`dau|${day}`, 0.06) * partial;
}

export function openingFor(scope: Scope): Opening {
  const out: Opening = { members: 0, points: 0, kitty: 0 };
  for (const p of scope.programmes)
    for (const s of scope.states) {
      const o = OPENING.get(`${p}|${s}`);
      if (!o) continue;
      out.members += o.members * scope.geoFactor;
      out.points += o.points * scope.geoFactor;
      out.kitty += o.kitty * scope.geoFactor;
    }
  return out;
}

/* ---------------- Stock (point-in-time) figures ---------------- */

export interface Snapshot {
  members: number;
  status: Record<string, number>;
  pending: number;
  availablePoints: number;
  kitty: number;
  lifetime: Flows;
}

const PENDING_WEIGHTS: Record<string, number> = { submitted: 0.3, pending_verification: 0.3, pending_kyc: 0.25, under_review: 0.15 };

/** Point-in-time view at the end of `at` for one programme within the scope. */
export function snapshotFor(programme: ProgrammeConfig, scope: Scope, at: string): Snapshot {
  const ps: Scope = { ...scope, programmes: [programme.code], category: null };
  const open = openingFor(ps);
  const life = sumFlows(ps, DATA_START, at);
  const recent = sumFlows(ps, addDays(at, -45), at);
  const members = open.members + life.registrations;

  const wf = programme.workflowStatuses;
  const pendingKeys = wf.filter((k) => k in PENDING_WEIGHTS);
  const pendingTotal = recent.registrations * 0.5;
  const weightSum = pendingKeys.reduce((s, k) => s + PENDING_WEIGHTS[k], 0) || 1;

  const status: Record<string, number> = {};
  for (const k of pendingKeys) status[k] = (pendingTotal * PENDING_WEIGHTS[k]) / weightSum;
  status.rejected = wf.includes("rejected") ? open.members * 0.035 + life.rejections : 0;
  status.blocked = wf.includes("blocked") ? members * 0.006 * noise(`blk|${programme.code}`, 0.2) : 0;
  status.inactive = wf.includes("inactive") ? members * 0.11 : 0;
  const allocated = Object.values(status).reduce((a, b) => a + b, 0);
  status.approved = Math.max(0, members - allocated);

  const prmValue = programme.pointValueInr || 1;
  const earned = life.scanPoints + life.welcomePoints + life.schemePoints + life.bonusPoints + life.referralPoints;
  const availablePoints = open.points + earned - life.redeemedPoints - life.reversedPoints - life.tdsAccrual / prmValue;
  const kitty = open.kitty + life.kittyAdded - life.kittyReleased;

  return { members, status, pending: pendingKeys.reduce((s, k) => s + status[k], 0), availablePoints, kitty, lifetime: life };
}

export function sumStatus(snaps: Snapshot[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of snaps) for (const [k, v] of Object.entries(s.status)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** A per-geography multiplier so child areas are not perfectly proportional to their weights. */
export function geoNoise(code: string) {
  return 0.9 + 0.2 * hash01(`geo|${code}`);
}

export const engineMeta = {
  months: ALL_MONTHS,
  demoRates: { tdsAccrual: DEMO_TDS_RATE_ACCRUAL, tdsRedemption: DEMO_TDS_RATE_REDEMPTION },
};
