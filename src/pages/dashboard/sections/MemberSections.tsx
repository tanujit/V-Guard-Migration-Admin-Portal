import { useEffect, useState } from "react";
import { ChevronRight, Crosshair, MapPinned } from "lucide-react";
import { useSection } from "@/hooks/useSection";
import { useDrill } from "@/context/DrillContext";
import { useFilters } from "@/context/FilterContext";
import { getProgramme, programmeColor, PROGRAMMES } from "@/config/programmes";
import { REGISTRATION_STATUSES } from "@/config/statuses";
import { Panel } from "@/components/ui/Panel";
import { FigureRow, RankedBars, ShareBar } from "@/components/ui/DataBars";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { TrendChart } from "@/components/charts/Charts";
import { ProgrammeTag, Segmented } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { formatCompact, formatCount, formatPercent, percentChange, signedPercent } from "@/lib/format";
import { fyOf } from "@/data/mock/time";
import { DEMO_AS_OF } from "@/data/mock/time";
import type { GeoRow, StatusSummaryRow } from "@/types/dashboard";
import type { GeoDrill } from "@/services/dashboardSource";
import { DashboardSection, type SectionProps } from "../DashboardSection";

const CURRENT_FY = fyOf(DEMO_AS_OF);
const PREVIOUS_FY = `${Number(CURRENT_FY.slice(0, 4)) - 1}-${CURRENT_FY.slice(2, 4)}`;

/* ------------------------------ C. Registration analytics ------------------------------ */

export function RegistrationSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("registrationAnalytics", [], refreshToken);
  const { openDrill } = useDrill();
  const { filters, setFilters, period } = useFilters();
  const [view, setView] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [compare, setCompare] = useState(false);

  const quickRange = filters.period === "fy" ? (filters.fy === CURRENT_FY ? "cur" : filters.fy === PREVIOUS_FY ? "prev" : "other") : filters.period === "last_3_months" ? "l3" : "other";

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.totals.registrations)} registrations in period`}>
      {(d) => {
        const series = [
          { key: "registrations", label: "Registrations", color: CHART.lead },
          { key: "approvals", label: "Approvals", color: CHART.support },
          ...(compare && view === "monthly" ? [{ key: "lastYear", label: "Registrations, same month last year", color: CHART.neutral, dashed: true }] : []),
        ];
        const data = view === "monthly" ? d.monthly : view === "quarterly" ? d.quarterly : d.yearly;
        const change = d.totals.previousRegistrations ? percentChange(d.totals.registrations, d.totals.previousRegistrations) : null;
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "Registrations in period", value: formatCount(d.totals.registrations), sub: change !== null ? `${signedPercent(change)} vs ${period.previous?.label}` : "No comparison available", tone: "accent" },
                  { label: "Approvals in period", value: formatCount(d.totals.approvals) },
                  { label: "Approved per registration", value: formatPercent(d.totals.registrations ? d.totals.approvals / d.totals.registrations : 0), sub: "Approvals can relate to earlier registrations" },
                  { label: "Latest month", value: formatCount(Number(d.monthly[d.monthly.length - 1]?.registrations ?? 0)), sub: `${d.monthly[d.monthly.length - 1]?.label ?? ""}${d.monthly[d.monthly.length - 1]?.key === DEMO_AS_OF.slice(0, 7) ? " to date" : ""}` },
                ]}
              />
            </Panel>
            <Panel
              span={8}
              title="Registrations and approvals"
              subtitle={view === "yearly" ? "All financial years with data" : view === "quarterly" ? "Financial-year quarters" : `${d.monthly[0]?.label} – ${d.monthly[d.monthly.length - 1]?.label}`}
              actions={
                <>
                  <Segmented
                    label="Quick range"
                    value={quickRange}
                    onChange={(v) => {
                      if (v === "cur") setFilters({ period: "fy", fy: CURRENT_FY });
                      if (v === "prev") setFilters({ period: "fy", fy: PREVIOUS_FY });
                      if (v === "l3") setFilters({ period: "last_3_months" });
                    }}
                    options={[
                      { value: "cur", label: `FY ${CURRENT_FY.slice(2)}` },
                      { value: "prev", label: `FY ${PREVIOUS_FY.slice(2)}` },
                      { value: "l3", label: "3 months" },
                    ]}
                  />
                  <Segmented label="Granularity" value={view} onChange={setView} options={[{ value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "yearly", label: "Yearly" }]} />
                </>
              }
            >
              <TrendChart
                ariaLabel="Registrations and approvals"
                data={data}
                series={series}
                kind={view === "monthly" ? "line" : "bar"}
                height={280}
                onSelect={(p) => openDrill({ module: "registration-kyc", title: `Registrations · ${p.label}`, context: { period: String(p.label) }, value: `${formatCount(Number(p.registrations))} registrations` })}
              />
              {view === "monthly" && (
                <label className="check">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
                  Compare with the same month last year
                </label>
              )}
            </Panel>
            <Panel span={4} title="Registrations by member type" info="Member types are configured per programme. Labels are demo values until the SOW confirms them.">
              <RankedBars items={d.byMemberType} onSelect={(i) => openDrill({ module: "members", title: `${i.label} registrations`, context: { "member type": i.label }, value: formatCount(i.value) })} />
            </Panel>
            <Panel span={7} title="Registrations by programme" subtitle="Monthly, stacked">
              <TrendChart
                ariaLabel="Monthly registrations by programme"
                data={d.byProgrammeMonthly}
                series={PROGRAMMES.filter((p) => d.byProgrammeMonthly[0]?.[p.code] !== undefined).map((p) => ({ key: p.code, label: p.code, color: p.color }))}
                kind="stacked"
                height={240}
                onSelect={(p) => openDrill({ module: "registration-kyc", title: `Registrations by programme · ${p.label}`, context: { period: String(p.label) } })}
              />
            </Panel>
            <Panel span={5} title="Month-on-month" padded={false}>
              <DataTable
                rows={[...d.momRows].reverse()}
                rowKey={(r) => r.month}
                caption="Month-on-month registrations"
                searchable={false}
                pageSize={6}
                exportName="registrations-month-on-month"
                columns={[
                  { key: "month", header: "Month", value: (r) => r.month, sortable: false },
                  { key: "reg", header: "Registrations", value: (r) => r.registrations, render: (r) => formatCount(r.registrations), align: "right" },
                  { key: "chg", header: "vs prior month", value: (r) => r.change, render: (r) => (r.change === null ? "—" : <span className={r.change >= 0 ? "pos" : "neg"}>{signedPercent(r.change)}</span>), align: "right" },
                ]}
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}

/* ------------------------------ D. Registration & approval status ------------------------------ */

export function ApprovalStatusSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("registrationStatus", [], refreshToken);
  const { openDrill } = useDrill();

  const statusColumns: Column<StatusSummaryRow>[] = [
    { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
    ...REGISTRATION_STATUSES.map((s) => ({
      key: s.key,
      header: s.label,
      align: "right" as const,
      value: (r: StatusSummaryRow) => r.counts[s.key] ?? null,
      render: (r: StatusSummaryRow) =>
        r.counts[s.key] === undefined ? (
          <span className="muted" title={`${s.label} is not part of the ${r.code} workflow`}>
            n/a
          </span>
        ) : (
          formatCount(r.counts[s.key]!)
        ),
    })),
    { key: "total", header: "Total", value: (r) => r.total, render: (r) => formatCount(r.total), align: "right" },
  ];

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.pendingByProgramme.reduce((a, b) => a + b.value, 0))} pending`}>
      {(d) => (
        <div className="grid grid--12">
          <Panel span={12} title="Overall registration status" subtitle="As at the end of the selected period. Status labels are configurable per programme workflow">
            <ShareBar label="Registration status" items={d.overall} onSelect={(i) => openDrill({ module: "registration-kyc", title: `Registrations · ${i.label}`, context: { status: i.label }, value: formatCount(i.value) })} />
          </Panel>
          <Panel span={12} title="Status by programme" info="Each programme shows only the statuses in its own workflow. “n/a” means the status does not exist for that programme." padded={false}>
            <DataTable rows={d.byProgramme} columns={statusColumns} rowKey={(r) => r.code} caption="Registration status by programme" searchPlaceholder="Search programmes" exportName="registration-status-by-programme" onRowClick={(r) => openDrill({ module: "registration-kyc", title: `${r.code} registration status`, context: { programme: r.code } })} rowActionLabel={(r) => `Open ${r.code} registration queue`} />
          </Panel>
          <Panel span={6} title="Monthly approvals and rejections">
            <TrendChart ariaLabel="Monthly approvals and rejections" data={d.approvalTrend} series={[{ key: "approved", label: "Approved", color: CHART.positive }, { key: "rejected", label: "Rejected", color: CHART.negative }]} kind="bar" height={220} onSelect={(p) => openDrill({ module: "registration-kyc", title: `Approval decisions · ${p.label}`, context: { period: String(p.label) } })} />
          </Panel>
          <Panel span={3} title="Pending by age" info="Time since the registration was submitted">
            <RankedBars items={d.ageing} onSelect={(i) => openDrill({ module: "registration-kyc", title: `Pending registrations · ${i.label}`, context: { ageing: i.label }, value: formatCount(i.value) })} />
          </Panel>
          <Panel span={3} title="Pending by programme">
            <RankedBars items={d.pendingByProgramme} onSelect={(i) => openDrill({ module: "registration-kyc", title: `${i.label} pending registrations`, context: { programme: i.label, status: "Pending" }, value: formatCount(i.value) })} />
          </Panel>
          <Panel span={12} title="Pending cases by state" padded={false}>
            <DataTable
              rows={d.pendingByState}
              rowKey={(r) => r.code}
              caption="Pending registrations by state"
              searchPlaceholder="Search states"
              pageSize={8}
              exportName="pending-registrations-by-state"
              initialSort={{ key: "pending", dir: "desc" }}
              onRowClick={(r) => openDrill({ module: "registration-kyc", title: `Pending registrations · ${r.name}`, context: { state: r.name, status: "Pending" }, value: formatCount(r.pending) })}
              rowActionLabel={(r) => `Open pending registrations for ${r.name}`}
              columns={[
                { key: "name", header: "State", value: (r) => r.name },
                { key: "pending", header: "Pending", value: (r) => r.pending, render: (r) => formatCount(r.pending), align: "right" },
                { key: "oldest", header: "Oldest bucket", value: (r) => r.oldest },
              ]}
            />
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}

/* ------------------------------ E. Active members ------------------------------ */

const ACTIVE_DEFINITION = "A member is active when they complete at least one qualifying action (a QR scan or a redemption) in the window. Daily active counts members active on that day; monthly active counts members active in the 30 days to the month end. Neither is a count of registered members. Definition to be confirmed with V-Guard.";

export function ActiveUsersSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("activeUsers", [], refreshToken);
  const { openDrill } = useDrill();
  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.latestMau)} monthly active`}>
      {(d) => (
        <div className="grid grid--12">
          <Panel span={12} padded={false}>
            <FigureRow
              items={[
                { label: "Daily active members", value: formatCount(d.latestDau), sub: `${d.dailyActive[d.dailyActive.length - 1]?.label}, last full day` },
                { label: "Monthly active members", value: formatCount(d.latestMau), sub: "30 days to period end", tone: "accent" },
                { label: "Unique active in period", value: formatCount(d.uniqueActiveInPeriod), sub: "Each member counted once" },
                { label: "Active share of registered", value: formatPercent(d.totalMembers ? d.latestMau / d.totalMembers : 0), sub: `of ${formatCompact(d.totalMembers)} registered` },
              ]}
            />
          </Panel>
          <Panel span={7} title="Daily active members" subtitle="Last 30 days of the period" info={ACTIVE_DEFINITION}>
            <TrendChart ariaLabel="Daily active members, last 30 days" data={d.dailyActive} series={[{ key: "dau", label: "Daily active", color: CHART.lead }]} kind="area" height={220} legend={false} onSelect={(p) => openDrill({ module: "members", title: `Active members · ${p.label}`, context: { day: String(p.label) }, value: formatCount(Number(p.dau)) })} />
          </Panel>
          <Panel span={5} title="Monthly active members" info={ACTIVE_DEFINITION}>
            <TrendChart ariaLabel="Monthly active members" data={d.monthlyActive} series={[{ key: "mau", label: "Monthly active", color: CHART.lead }]} kind="bar" height={220} legend={false} highlightKey={d.monthlyActive[d.monthlyActive.length - 1]?.key} onSelect={(p) => openDrill({ module: "members", title: `Monthly active members · ${p.label}`, context: { month: String(p.label) }, value: formatCount(Number(p.mau)) })} />
          </Panel>
          <Panel span={12} title="Active and inactive members by programme" subtitle="Active in the last 30 days of the period, against all other registered members">
            <div className="prog-split">
              {d.byProgramme.map((p) => (
                <div key={p.code} className="prog-split__row">
                  <ProgrammeTag code={p.code} />
                  <ShareBar
                    label={`${p.code} active versus inactive`}
                    items={[
                      { key: "active", label: "Active", value: p.active, color: programmeColor(p.code) },
                      { key: "inactive", label: "Not active", value: p.inactive, color: "var(--chart-neutral-3)" },
                    ]}
                    onSelect={(i) => openDrill({ module: "members", title: `${p.code} · ${i.label} members`, context: { programme: p.code, activity: i.label }, value: formatCount(i.value) })}
                  />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}

/* ------------------------------ F. Geography ------------------------------ */

export function GeographySection({ refreshToken, ...props }: SectionProps) {
  const [drill, setDrill] = useState<GeoDrill | undefined>(undefined);
  const state = useSection("geography", drill ? [drill] : [], refreshToken);
  const { openDrill } = useDrill();
  const { setFilters, filters } = useFilters();

  // A change to the global geography filter takes over from any in-section drill-down.
  useEffect(() => setDrill(undefined), [filters.state, filters.district]);

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${state.data.rows.length} ${state.data.level === "state" ? "states" : state.data.level === "district" ? "districts" : "branches"}`}>
      {(d) => {
        const levelName = d.level === "state" ? "State" : d.level === "district" ? "District" : "Branch";
        const goDeeper = (r: GeoRow) => {
          if (d.level === "state") setDrill({ level: "district", parent: r.code });
          else if (d.level === "district") setDrill({ level: "branch", parent: r.code });
          else openDrill({ module: "geo", title: r.name, context: { branch: r.name }, value: `${formatCount(r.members)} members` });
        };
        const columns: Column<GeoRow>[] = [
          { key: "name", header: levelName, value: (r) => r.name, render: (r) => <span className="geo-name">{r.name}{d.level !== "branch" && <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />}</span> },
          { key: "members", header: "Members", value: (r) => r.members, render: (r) => formatCount(r.members), align: "right" },
          { key: "active", header: "Active", value: (r) => r.active, render: (r) => formatCount(r.active), align: "right" },
          { key: "approved", header: "Approved", value: (r) => r.approved, render: (r) => formatCount(r.approved), align: "right" },
          { key: "pending", header: "Pending", value: (r) => r.pending, render: (r) => formatCount(r.pending), align: "right" },
          { key: "scans", header: "Scans in period", value: (r) => r.scans, render: (r) => formatCount(r.scans), align: "right" },
          {
            key: "mix",
            header: "Programme mix",
            value: () => null,
            sortable: false,
            noSearch: true,
            render: (r) => {
              const tot = Object.values(r.byProgramme).reduce((a, b) => a + b, 0) || 1;
              return (
                <span className="mixbar" role="img" aria-label={Object.entries(r.byProgramme).map(([k, v]) => `${k} ${formatPercent(v / tot, 0)}`).join(", ")}>
                  {Object.entries(r.byProgramme).map(([k, v]) => (
                    <span key={k} style={{ flexGrow: v, background: getProgramme(k)?.color }} />
                  ))}
                </span>
              );
            },
          },
          ...(d.level !== "state" ? [] : [{ key: "children", header: "Districts", value: (r: GeoRow) => r.childCount, align: "right" as const }]),
        ];

        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <div className="geo-bar">
                <nav aria-label="Geography level" className="crumbs crumbs--inline">
                  <ol>
                    <li>
                      {d.level === "state" ? <span aria-current="page">All states</span> : <button type="button" className="link-btn" onClick={() => setDrill({ level: "state" })}>All states</button>}
                    </li>
                    {d.parent && (
                      <li aria-current="page">
                        <ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />
                        {d.parent.name}
                      </li>
                    )}
                  </ol>
                </nav>
                {d.parent && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => (d.parent!.level === "state" ? setFilters({ state: d.parent!.code }) : setFilters({ state: d.parent!.code.split("-")[0], district: d.parent!.code }))}
                  >
                    <Crosshair size={14} strokeWidth={1.75} aria-hidden="true" />
                    Filter dashboard to {d.parent.name.split(",")[0]}
                  </button>
                )}
              </div>
              <FigureRow
                items={[
                  { label: `${levelName === "Branch" ? "Branches" : levelName === "District" ? "Districts" : "States"} shown`, value: String(d.rows.length) },
                  { label: "Members", value: formatCount(d.rows.reduce((a, r) => a + r.members, 0)) },
                  { label: "Active", value: formatCount(d.rows.reduce((a, r) => a + r.active, 0)) },
                  { label: "Scans in period", value: formatCount(d.rows.reduce((a, r) => a + r.scans, 0)) },
                ]}
              />
            </Panel>
            <Panel span={4} title={`Members by ${levelName.toLowerCase()}`} subtitle="Top 10, select to go one level down">
              <RankedBars items={d.rows.slice(0, 10).map((r) => ({ key: r.code, label: r.name, value: r.members }))} highlightKey={d.rows[0]?.code} onSelect={(i) => goDeeper(d.rows.find((r) => r.code === i.key)!)} />
              <p className="panel__note map-note">
                <MapPinned size={14} strokeWidth={1.5} aria-hidden="true" />
                A map view needs an approved map provider and boundary data. Branch and pincode masters are read from SFDC and cannot be edited here.
              </p>
            </Panel>
            <Panel span={8} title={`${levelName}-wise distribution`} padded={false} info="Select a row to drill down from state to district to branch.">
              <DataTable rows={d.rows} columns={columns} rowKey={(r) => r.code} caption={`${levelName}-wise distribution`} searchPlaceholder={`Search ${levelName.toLowerCase()}s`} pageSize={8} exportName={`geography-${d.level}`} onRowClick={goDeeper} rowActionLabel={(r) => (d.level === "branch" ? `Open ${r.name}` : `Show ${r.name} breakdown`)} initialSort={{ key: "members", dir: "desc" }} />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}
