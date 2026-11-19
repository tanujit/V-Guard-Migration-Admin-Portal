/**
 * APPLICATION USAGE ANALYTICS (SOW 10.12) — how members use the apps: screens, sessions and
 * modules. Different from business engagement (Phase 12): a module visit is not a scan, a
 * redemption or a points event.
 *
 * No app telemetry service is connected. `buildUsageSessions` is a MOCK telemetry adapter producing
 * labelled development sessions; its definitions (app open = session start, exit = last screen of a
 * session, exit rate = exits ÷ page views) are the adapter's own and stay pending OP-USAGE1.
 * Screens whose events carry no timing show average time as Not available.
 */
import { findBranch } from "@/config/geography";
import { hash01, pick } from "@/data/mock/random";
import type { Member } from "@/types/members";
import type { UsageSession } from "@/types/platform";

export const SCREENS: { screen: string; module: string }[] = [
  { screen: "Home", module: "Home" },
  { screen: "Scan", module: "Scanning" },
  { screen: "Scan result", module: "Scanning" },
  { screen: "Schemes", module: "Schemes" },
  { screen: "Scheme detail", module: "Schemes" },
  { screen: "Wallet", module: "Wallet" },
  { screen: "Redeem", module: "Wallet" },
  { screen: "Passbook", module: "Passbook" },
  { screen: "Gifts", module: "Gifts" },
  { screen: "Profile", module: "Profile" },
  { screen: "Help", module: "Support" },
];
const NEXT: Record<string, [string, number][]> = {
  Home: [["Scan", 0.34], ["Schemes", 0.16], ["Wallet", 0.18], ["Passbook", 0.1], ["Gifts", 0.05], ["Profile", 0.05], ["Help", 0.03], ["EXIT", 0.09]],
  Scan: [["Scan result", 0.82], ["Home", 0.08], ["EXIT", 0.1]],
  "Scan result": [["Scan", 0.35], ["Wallet", 0.2], ["Home", 0.2], ["EXIT", 0.25]],
  Schemes: [["Scheme detail", 0.55], ["Home", 0.2], ["EXIT", 0.25]],
  "Scheme detail": [["Schemes", 0.3], ["Scan", 0.2], ["Home", 0.15], ["EXIT", 0.35]],
  Wallet: [["Redeem", 0.32], ["Passbook", 0.28], ["Home", 0.15], ["EXIT", 0.25]],
  Redeem: [["Wallet", 0.35], ["Gifts", 0.15], ["EXIT", 0.5]],
  Passbook: [["Wallet", 0.25], ["Home", 0.25], ["EXIT", 0.5]],
  Gifts: [["Redeem", 0.3], ["Home", 0.2], ["EXIT", 0.5]],
  Profile: [["Home", 0.5], ["Help", 0.15], ["EXIT", 0.35]],
  Help: [["Home", 0.4], ["EXIT", 0.6]],
};
const DWELL: Record<string, [number, number]> = { Home: [8, 40], Scan: [5, 25], "Scan result": [3, 12], Schemes: [10, 60], "Scheme detail": [15, 90], Wallet: [8, 45], Redeem: [20, 120], Passbook: [10, 70], Gifts: [0, 0], Profile: [10, 50], Help: [15, 80] };
const VERSIONS = ["4.2.0 (mock)", "4.1.5 (mock)", "3.9.1 (mock)", "3.9.0 (mock)"];
const DEVICES = ["Model A (dev)", "Model B (dev)", "Model C (dev)", "Model D (dev)"];
const OSES = ["Android 14", "Android 13", "Android 12", "iOS 17"];
const addSec = (iso: string, s: number) => new Date(Date.parse(`${iso}:00Z`) + s * 1000).toISOString().slice(0, 16);

export function buildUsageSessions(members: Member[], now: string): UsageSession[] {
  const out: UsageSession[] = [];
  const end = Date.parse(`${now.slice(0, 10)}T23:59:00Z`);
  for (const m of members.filter((x) => !["pending", "rejected", "invited"].includes(x.status) && x.registration.firstLoginAt)) {
    const n = Math.floor(hash01(`${m.id}|sessions`) * 18);
    const version = m.programme === "Retailer" || m.programme === "DD" ? pick(`${m.id}|v`, VERSIONS.slice(2)) : pick(`${m.id}|v`, VERSIONS.slice(0, 2));
    for (let i = 0; i < n; i++) {
      const k = `${m.id}|${i}`;
      const start = new Date(end - Math.floor(hash01(`${k}|day`) * 30) * 86400_000 - Math.floor(hash01(`${k}|h`) * 14 + 7) * 3600_000).toISOString().slice(0, 16);
      const views: UsageSession["views"] = [];
      let screen = "Home";
      let at = start;
      for (let step = 0; step < 12; step++) {
        const [lo, hi] = DWELL[screen];
        const sec = Math.round(lo + hash01(`${k}|${step}|t`) * (hi - lo));
        views.push({ screen, module: SCREENS.find((s) => s.screen === screen)!.module, at, seconds: screen === "Gifts" ? null : sec });
        at = addSec(at, sec);
        const r = hash01(`${k}|${step}|n`);
        let acc = 0;
        const next = NEXT[screen].find(([, p]) => (acc += p) >= r)?.[0] ?? "EXIT";
        if (next === "EXIT") break;
        screen = next;
      }
      const g = findBranch(m.branchCode);
      out.push({ id: `USS-${String(out.length + 1).padStart(6, "0")}`, memberId: m.id, programme: m.programme, memberType: m.memberType, state: g?.state.code ?? "—", branchCode: m.branchCode, appVersion: version, deviceModel: pick(`${m.id}|d`, DEVICES), os: pick(`${m.id}|o`, OSES), start, durationSec: views.reduce((a, v) => a + (v.seconds ?? 0), 0), views, exitScreen: views[views.length - 1].screen });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/* ======================= Analytics (pure) ======================= */

export interface UsageFilter { from?: string; to?: string; programmes?: string[]; role?: string; state?: string; branch?: string; appVersion?: string; deviceModel?: string; os?: string }
export function filterSessions(s: UsageSession[], f: UsageFilter, memberIds?: Set<string>) {
  return s.filter((x) => (!memberIds || memberIds.has(x.memberId)) && (!f.from || x.start.slice(0, 10) >= f.from) && (!f.to || x.start.slice(0, 10) <= f.to) && (!f.programmes?.length || f.programmes.includes(x.programme)) && (!f.role || x.memberType === f.role) && (!f.state || x.state === f.state) && (!f.branch || x.branchCode === f.branch) && (!f.appVersion || x.appVersion === f.appVersion) && (!f.deviceModel || x.deviceModel === f.deviceModel) && (!f.os || x.os === f.os));
}
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function usageOverview(s: UsageSession[]) {
  const users = new Set(s.map((x) => x.memberId));
  const views = s.flatMap((x) => x.views);
  const timed = views.filter((v) => v.seconds != null).map((v) => v.seconds!);
  const screens = screenStats(s);
  const used = screens.filter((x) => x.views);
  return {
    appOpens: s.length,
    uniqueUsers: users.size,
    avgSessionSec: avg(s.map((x) => x.durationSec)),
    medianSessionSec: median(s.map((x) => x.durationSec)),
    opensPerUser: users.size ? s.length / users.size : null,
    pageViews: views.length,
    avgTimePerScreenSec: avg(timed),
    exitRate: views.length ? s.length / views.length : null,
    mostVisited: used.sort((a, b) => b.views - a.views)[0]?.screen ?? null,
    leastVisited: [...used].sort((a, b) => a.views - b.views)[0]?.screen ?? null,
    highestDropOff: [...used].sort((a, b) => (b.exitRate ?? 0) - (a.exitRate ?? 0))[0]?.screen ?? null,
  };
}
export function screenStats(s: UsageSession[]) {
  return SCREENS.map(({ screen, module }) => {
    const v = s.flatMap((x) => x.views.filter((y) => y.screen === screen).map((y) => ({ ...y, memberId: x.memberId })));
    const timed = v.filter((y) => y.seconds != null).map((y) => y.seconds!);
    const exits = s.filter((x) => x.exitScreen === screen).length;
    return { screen, module, landing: s.filter((x) => x.views[0]?.screen === screen).length, uniqueUsers: new Set(v.map((y) => y.memberId)).size, views: v.length, avgSec: timed.length ? avg(timed) : null, timed: timed.length === v.length, exits, exitRate: v.length ? exits / v.length : null, versions: [...new Set(s.filter((x) => x.views.some((y) => y.screen === screen)).map((x) => x.appVersion))], programmes: [...new Set(s.filter((x) => x.views.some((y) => y.screen === screen)).map((x) => x.programme))] };
  });
}
export type RankMetric = "views" | "uniqueUsers" | "avgSec" | "exitRate";
export function rankScreens(rows: ReturnType<typeof screenStats>, metric: RankMetric, worst = false) {
  const val = (r: (typeof rows)[number]) => (metric === "exitRate" ? -(r.exitRate ?? 0) : (r[metric] as number | null) ?? -1);
  return [...rows].filter((r) => r.views).sort((a, b) => (worst ? val(a) - val(b) : val(b) - val(a))).map((r, i) => ({ ...r, rank: i + 1 }));
}
/** Users reaching each stage in order within the same session (actual event sequences). */
export function funnel(s: UsageSession[], stages: string[]) {
  const reached = stages.map(() => new Set<string>());
  const gaps: number[][] = stages.map(() => []);
  for (const x of s) {
    let idx = -1, lastAt: string | null = null;
    for (const v of x.views) {
      if (v.screen === stages[idx + 1]) {
        idx++;
        reached[idx].add(x.memberId);
        if (lastAt && idx > 0) gaps[idx].push((Date.parse(`${v.at}:00Z`) - Date.parse(`${lastAt}:00Z`)) / 1000);
        lastAt = v.at;
        if (idx === stages.length - 1) break;
      }
    }
  }
  return stages.map((st, i) => ({ stage: st, users: reached[i].size, left: i < stages.length - 1 ? reached[i].size - reached[i + 1].size : null, continuation: i === 0 ? null : reached[i - 1].size ? reached[i].size / reached[i - 1].size : null, avgSecFromPrevious: avg(gaps[i]) }));
}
export function moduleUsage(s: UsageSession[], module: string) {
  const views = s.flatMap((x) => x.views.map((v, i) => ({ ...v, memberId: x.memberId, prev: i ? x.views[i - 1].screen : "App open" })).filter((v) => v.module === module));
  const users = new Set(views.map((v) => v.memberId));
  const timed = views.filter((v) => v.seconds != null).map((v) => v.seconds!);
  const entries = views.filter((v) => v.prev === "App open" || SCREENS.find((sc) => sc.screen === v.prev)?.module !== module);
  const src = new Map<string, number>();
  entries.forEach((e) => src.set(e.prev, (src.get(e.prev) ?? 0) + 1));
  return { module, uniqueUsers: users.size, usageCount: views.length, frequency: users.size ? views.length / users.size : null, timeSpentSec: timed.length ? timed.reduce((a, b) => a + b, 0) : null, entrySources: [...src.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ source: k, count: v })), exits: s.filter((x) => SCREENS.find((sc) => sc.screen === x.exitScreen)?.module === module).length };
}
export function groupSessions(s: UsageSession[], key: (x: UsageSession) => string) {
  const m = new Map<string, UsageSession[]>();
  s.forEach((x) => (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x));
  return [...m.entries()].map(([k, xs]) => ({ key: k, sessions: xs.length, users: new Set(xs.map((x) => x.memberId)).size, avgSessionSec: avg(xs.map((x) => x.durationSec)), views: xs.reduce((n, x) => n + x.views.length, 0), exitsBeforeHome: xs.filter((x) => x.views.length === 1).length })).sort((a, b) => b.sessions - a.sessions);
}
