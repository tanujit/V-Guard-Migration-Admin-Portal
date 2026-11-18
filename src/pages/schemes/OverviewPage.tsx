import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlarmClock, Archive, BadgeCheck, CalendarClock, CircleDashed, ClipboardList, Coins, Flag, Gauge, Hourglass, Landmark, PauseCircle, PlusCircle, Users, Wallet } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DonutChart, TrendChart } from "@/components/charts/Charts";
import { RankedBars } from "@/components/ui/DataBars";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Segmented } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { SCHEME_STATUS } from "@/config/schemeCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { categoryById } from "@/features/masters/engine";
import { branchesInScope, displayVersion, eligiblePopulation, exposureOf } from "@/features/schemes/engine";
import type { Scheme, SchemeStatus } from "@/types/schemes";
import { KpiGrid, type Kpi } from "@/pages/masters/shared";
import { SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BASE, SchemeStatusBadge, pts, schemeLink, useSchemeView, type SchemeView } from "./shared";

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function useSchemeMetrics(v: SchemeView) {
  return useMemo(() => {
    const list = v.visible;
    const ids = new Set(list.map((x) => x.id));
    const count = (st: SchemeStatus[]) => list.filter((x) => st.includes(x.status)).length;
    const exp = new Map(list.map((x) => [x.id, exposureOf(v.s, x, v.today)]));
    const acc = v.s.accruals.filter((a) => ids.has(a.schemeId) && (a.result === "accrued" || a.result === "credited"));
    const schemeAcc = acc.filter((a) => a.bucket === "unsettled");
    const released = v.s.releases.filter((r) => ids.has(r.schemeId)).reduce((n, r) => n + r.releasedPoints, 0);
    const live = list.filter((x) => x.status === "active");
    const eligible = live.reduce((n, x) => n + eligiblePopulation(v.mem, v.ms, displayVersion(x).config).lowerBound, 0);
    const participating = new Set(acc.filter((a) => live.some((x) => x.id === a.schemeId)).map((a) => a.memberId)).size;
    const endingSoon = live.filter((x) => { const e = displayVersion(x).config.duration.end; return e >= v.today && e <= addDays(v.today, 30); });
    const budgetNear = list.filter((x) => ["active", "budget_exhausted"].includes(x.status) && (exp.get(x.id)!.nearExhaustion || exp.get(x.id)!.exhausted));
    const pendingSettle = v.s.settlements.filter((r) => ids.has(r.schemeId) && ["pending_approval", "partially_approved", "execution_failed"].includes(r.status));
    return {
      list, exp, acc, schemeAcc, released, eligible, participating, endingSoon, budgetNear, pendingSettle,
      total: list.length,
      draft: count(["draft", "review", "business_confirmation_required", "returned"]),
      pending: count(["pending_approval"]) + list.filter((x) => x.status !== "pending_approval" && x.versions.some((ver) => ver.status === "submitted")).length,
      approved: count(["approved"]),
      scheduled: count(["scheduled"]),
      active: count(["active"]),
      completed: count(["completed", "closed"]),
      deactivated: count(["deactivated"]),
      schemeAccrued: schemeAcc.reduce((n, a) => n + a.points, 0),
    };
  }, [v.visible, v.s, v.today, v.mem, v.ms]);
}

export function SchemeOverviewPage() {
  const v = useSchemeView();
  const nav = useNavigate();
  const m = useSchemeMetrics(v);
  const go = (q: string) => nav(`${BASE}/list${q}`);
  const kpis: Kpi[] = [
    { id: "total", label: "Total schemes", value: m.total, desc: "Within your programme scope", variant: "primary", icon: ClipboardList, onSelect: () => go("") },
    { id: "draft", label: "Draft schemes", value: m.draft, desc: "Draft, review, returned or awaiting business confirmation", variant: "light", icon: CircleDashed, onSelect: () => go("?status=draft") },
    { id: "pending", label: "Pending approval", value: m.pending, desc: "New schemes and new versions with a Checker", variant: "status", tone: "warning", icon: Hourglass, onSelect: () => go("?status=pending_approval") },
    { id: "approved", label: "Approved schemes", value: m.approved, desc: "Approved, not yet activated", variant: "light", icon: BadgeCheck, onSelect: () => go("?status=approved") },
    { id: "scheduled", label: "Scheduled schemes", value: m.scheduled, desc: "Activate on their start date", variant: "light", icon: CalendarClock, onSelect: () => go("?status=scheduled") },
    { id: "active", label: "Active schemes", value: m.active, desc: "Earning in the development engine", variant: "dark", icon: Activity, onSelect: () => go("?status=active") },
    { id: "completed", label: "Completed schemes", value: m.completed, desc: "Completed or closed", variant: "light", icon: Flag, onSelect: () => go("?status=completed") },
    { id: "deactivated", label: "Deactivated schemes", value: m.deactivated, desc: "Stopped after approval", variant: "light", icon: Archive, onSelect: () => go("?status=deactivated") },
    { id: "ending", label: "Approaching end date", value: m.endingSoon.length, desc: "Active, ending within 30 days", variant: "status", tone: "warning", icon: AlarmClock, onSelect: () => go("?status=ending") },
    { id: "budget", label: "Approaching budget limit", value: m.budgetNear.length, desc: "At or above the alert level, or exhausted", variant: "status", tone: "negative", icon: Gauge, onSelect: () => go("?status=budget") },
    ...(v.financial
      ? ([
          { id: "acc", label: "Scheme points accrued", value: m.schemeAccrued, desc: "Scheme / milestone points (unsettled bucket)", variant: "light", icon: Coins, onSelect: () => nav(`${BASE}/settlement?tab=reconciliation`) },
          { id: "settled", label: "Scheme points settled", value: m.released, desc: "Released through two-level approval", variant: "light", icon: Landmark, onSelect: () => nav(`${BASE}/settlement?tab=history`) },
          { id: "unsettled", label: "Unsettled scheme points", value: m.schemeAccrued - m.released, desc: "Accrued, not yet released", variant: "status", tone: "warning", icon: Wallet, onSelect: () => nav(`${BASE}/settlement?tab=pending`) },
        ] as Kpi[])
      : []),
    { id: "eligible", label: "Eligible members", value: m.eligible, desc: "Active schemes, development member master (lower bound)", variant: "light", icon: Users, onSelect: () => go("?status=active") },
    { id: "participating", label: "Participating members", value: m.participating, desc: "Earned at least one reward in an active scheme", variant: "light", icon: Users, onSelect: () => go("?status=active") },
    { id: "settle", label: "Pending settlement requests", value: m.pendingSettle.length, desc: "Awaiting stage 1, stage 2 or retry", variant: "status", tone: "warning", icon: PauseCircle, onSelect: () => nav(`${BASE}/settlement?tab=pending`) },
  ];

  const statusItems = (Object.keys(SCHEME_STATUS) as SchemeStatus[]).map((k) => ({ key: k, label: SCHEME_STATUS[k].label, value: m.list.filter((x) => x.status === k).length, tone: SCHEME_STATUS[k].tone })).filter((x) => x.value > 0);
  const progItems = ["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ key: p, label: p, value: m.list.filter((x) => displayVersion(x).config.basic.programmes.includes(p)).length }));
  const months = Array.from(new Set([...m.list.map((x) => monthKey(x.createdAt)), ...m.acc.map((a) => monthKey(a.effectiveDate))])).sort().slice(-8);
  const creation = months.map((ym) => ({ key: ym, label: monthLabel(ym), created: m.list.filter((x) => monthKey(x.createdAt) === ym).length }));
  const accrual = months.map((ym) => ({ key: ym, label: monthLabel(ym), base: m.acc.filter((a) => a.bucket === "redeemable" && monthKey(a.effectiveDate) === ym).reduce((n, a) => n + a.points, 0), scheme: m.schemeAcc.filter((a) => monthKey(a.effectiveDate) === ym).reduce((n, a) => n + a.points, 0), released: v.s.releases.filter((r) => monthKey(r.settledAt) === ym).reduce((n, r) => n + r.releasedPoints, 0) }));
  const participation = months.map((ym) => ({ key: ym, label: monthLabel(ym), members: new Set(m.acc.filter((a) => monthKey(a.effectiveDate) === ym).map((a) => a.memberId)).size }));
  const byState = GEOGRAPHY.map((g) => ({ key: g.code, label: g.name, value: m.list.filter((x) => [...branchesInScope(displayVersion(x).config.eligibility.branchScope)].some((b) => b.startsWith(`${g.code}-`))).length })).filter((x) => x.value).sort((a, b) => b.value - a.value);
  const byCat = Array.from(new Set(m.list.flatMap((x) => displayVersion(x).config.products.categoryIds))).map((c) => ({ key: c, label: categoryById(v.ms, c)?.name ?? c, value: m.list.filter((x) => displayVersion(x).config.products.categoryIds.includes(c)).length })).sort((a, b) => b.value - a.value);
  const utilisation = m.list.filter((x) => ["active", "budget_exhausted", "completed"].includes(x.status)).map((x) => ({ key: x.id, label: displayVersion(x).config.basic.name, value: Math.round(m.exp.get(x.id)!.utilisation * 100), tone: m.exp.get(x.id)!.exhausted ? ("negative" as const) : m.exp.get(x.id)!.nearExhaustion ? ("warning" as const) : undefined })).sort((a, b) => b.value - a.value);

  return (
    <>
      <SectionTitle title="Scheme overview" description="Status reflects approval and activation, not dates alone" actions={v.can("schemes:create") && <button type="button" className="btn btn--primary" onClick={() => nav(`${BASE}/new`)}><PlusCircle size={16} strokeWidth={2} aria-hidden="true" />Create scheme</button>} />
      <KpiGrid items={kpis} />
      {!v.financial && <Notice tone="info">Points accrued, settled and unsettled are hidden: they need Scheme builder: View financial exposure.</Notice>}
      <div className="grid-2 grid-2--wide-left">
        <Panel level={3} title="Points accrual" subtitle="Base Points credited, scheme points accrued and scheme points settled by month (mock ledger)">
          {v.financial ? <TrendChart data={accrual} kind="bar" series={[{ key: "base", label: "Base Points credited", color: CHART.support }, { key: "scheme", label: "Scheme points accrued", color: CHART.lead }, { key: "released", label: "Scheme points settled", color: CHART.positive }]} ariaLabel="Points accrual by month" /> : <p className="muted small">Needs View financial exposure.</p>}
        </Panel>
        <Panel level={3} title="Scheme status" subtitle="Select a segment to open the list">
          <DonutChart items={statusItems} centerLabel="schemes" ariaLabel="Scheme status distribution" onSelect={(i) => go(`?status=${i.key}`)} />
        </Panel>
      </div>
      <div className="grid-3">
        <Panel level={3} title="By programme"><RankedBars items={progItems} onSelect={(i) => go(`?programme=${i.key}`)} /></Panel>
        <Panel level={3} title="By state (branch applicability)"><RankedBars items={byState.slice(0, 8)} /></Panel>
        <Panel level={3} title="By product category"><RankedBars items={byCat} /></Panel>
      </div>
      <div className="grid-3">
        <Panel level={3} title="Monthly scheme creation"><TrendChart data={creation} kind="bar" height={200} series={[{ key: "created", label: "Schemes created", color: CHART.support }]} ariaLabel="Schemes created by month" legend={false} /></Panel>
        <Panel level={3} title="Participation trend" subtitle="Members earning any reward"><TrendChart data={participation} height={200} series={[{ key: "members", label: "Participating members", color: CHART.lead }]} ariaLabel="Participating members by month" legend={false} /></Panel>
        <Panel level={3} title="Budget utilisation" subtitle="Consumed / budget cap, %">{v.financial ? <ul className="util-list">{utilisation.map((u) => <li key={u.key}><button type="button" onClick={() => nav(`${BASE}/scheme/${u.key}?tab=budget`)}><span className="util-list__name">{u.label}</span><span className={`util-list__val num ${u.tone ?? ""}`}>{u.value}%</span><span className="util-list__track" aria-hidden="true"><span className={`util-list__fill ${u.tone ?? ""}`} style={{ width: `${Math.min(100, u.value)}%` }} /></span></button></li>)}</ul> : <p className="muted small">Needs View financial exposure.</p>}</Panel>
      </div>
      <div className="grid-2">
        <Panel level={3} title="Projected versus actual liability">
          <Notice tone="warn">Projected liability is <strong>Pending business formula (OP-SB-LIAB)</strong>. No projected figure is shown or compared until V-Guard approves the formula. Actual accrued exposure is on each scheme's Budget & exposure tab.</Notice>
        </Panel>
        <Panel level={3} title="Pending settlement activities" padded={false}>
          <DataTable rows={m.pendingSettle} rowKey={(r) => r.id} caption="Pending settlement requests" searchable={false} pageSize={5} emptyTitle="No settlement waiting" onRowClick={() => nav(`${BASE}/settlement?tab=pending`)} columns={[
            { key: "id", header: "Request", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
            { key: "s", header: "Scheme", value: (r) => r.schemeId, render: (r) => schemeLink(r.schemeId) },
            { key: "t", header: "Tranche", value: (r) => r.trancheLabel },
            { key: "p", header: "Release", align: "right", value: (r) => r.releasePoints, render: (r) => <span className="num">{v.financial ? pts(r.releasePoints) : "•••"}</span> },
            { key: "st", header: "Status", value: (r) => r.status, render: (r) => <span className="small">{r.status.replace(/_/g, " ")}</span> },
          ] as Column<(typeof m.pendingSettle)[number]>[]} />
        </Panel>
      </div>
    </>
  );
}

/* ======================= Calendar ======================= */

export function SchemeCalendarPage() {
  const v = useSchemeView();
  const [mode, setMode] = useState<"month" | "list">("month");
  const [ym, setYm] = useState(v.today.slice(0, 7));
  const shift = (n: number) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setYm(d.toISOString().slice(0, 7)); };
  const first = `${ym}-01`;
  const days = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  const last = `${ym}-${String(days).padStart(2, "0")}`;
  const SHOWN: SchemeStatus[] = ["approved", "scheduled", "active", "budget_exhausted", "completed", "closed", "deactivated"];
  const rows = v.visible.filter((x) => SHOWN.includes(x.status) || x.versions.some((ver) => ver.status === "approved"));
  const inMonth = rows.filter((x) => { const c = displayVersion(x).config.duration; return c.start <= last && c.end >= first; });
  const phase = (x: Scheme) => {
    const c = displayVersion(x).config.duration;
    if (x.status === "active" && c.end <= addDays(v.today, 30)) return "Ending soon";
    if (["approved", "scheduled"].includes(x.status) && c.start > v.today) return "Upcoming";
    return SCHEME_STATUS[x.status].label;
  };
  return (
    <>
      <SectionTitle title="Scheme calendar" description="Bars follow the approved effective period; colour follows approval and activation state" actions={<Segmented value={mode} onChange={setMode} label="Calendar view" options={[{ value: "month", label: "Month" }, { value: "list", label: "List" }]} />} />
      {mode === "month" ? (
        <Panel level={3} title={new Date(`${first}T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })} actions={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => shift(-1)}>Previous</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setYm(v.today.slice(0, 7))}>Today</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => shift(1)}>Next</button></div>}>
          <div className="sch-cal" style={{ ["--days" as string]: days }}>
            <div className="sch-cal__head">
              <span />
              {Array.from({ length: days }, (_, i) => <span key={i} className={`sch-cal__day ${`${ym}-${String(i + 1).padStart(2, "0")}` === v.today ? "is-today" : ""}`}>{i + 1}</span>)}
            </div>
            {inMonth.length === 0 && <p className="muted small">No approved, scheduled, active or completed scheme in this month.</p>}
            {inMonth.map((x) => {
              const c = displayVersion(x).config.duration;
              const s = c.start < first ? 1 : Number(c.start.slice(8));
              const e = c.end > last ? days : Number(c.end.slice(8));
              return (
                <div key={x.id} className="sch-cal__row">
                  <span className="sch-cal__name">{schemeLink(x.id, displayVersion(x).config.basic.name)}</span>
                  <span className={`sch-cal__bar sch-cal__bar--${x.status}`} style={{ gridColumn: `${s + 1} / ${e + 2}` }} title={`${c.start} to ${c.end} · ${phase(x)}`}>{phase(x)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : (
        <Panel level={3} padded={false}>
          <DataTable rows={rows} rowKey={(x) => x.id} caption="Scheme calendar list" initialSort={{ key: "start", dir: "asc" }} columns={[
            { key: "id", header: "Scheme", value: (x) => displayVersion(x).config.basic.name, render: (x) => schemeLink(x.id, displayVersion(x).config.basic.name) },
            { key: "start", header: "Start", value: (x) => displayVersion(x).config.duration.start, render: (x) => <span className="num small">{displayVersion(x).config.duration.start}</span> },
            { key: "end", header: "End", value: (x) => displayVersion(x).config.duration.end, render: (x) => <span className="num small">{displayVersion(x).config.duration.end}</span> },
            { key: "phase", header: "Calendar state", value: (x) => phase(x) },
            { key: "st", header: "Status", value: (x) => x.status, render: (x) => <SchemeStatusBadge status={x.status} /> },
          ] as Column<Scheme>[]} />
        </Panel>
      )}
    </>
  );
}
