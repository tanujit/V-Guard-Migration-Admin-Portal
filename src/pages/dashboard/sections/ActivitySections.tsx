import { useSection } from "@/hooks/useSection";
import { useDrill } from "@/context/DrillContext";
import { useFilters } from "@/context/FilterContext";
import { programmeColor } from "@/config/programmes";
import { Panel } from "@/components/ui/Panel";
import { FigureRow, RankedBars, ShareBar, StatList } from "@/components/ui/DataBars";
import { DataTable } from "@/components/ui/DataTable";
import { DonutChart, TrendChart } from "@/components/charts/Charts";
import { ProgrammeTag } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { formatCompact, formatCount, formatDecimal, formatInr, formatPercent, percentChange, signedPercent } from "@/lib/format";
import { longDate } from "@/data/mock/time";
import { DashboardSection, type SectionProps } from "../DashboardSection";

/* ------------------------------ G. Scanning analytics ------------------------------ */

export function ScanningSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("scanning", [], refreshToken);
  const { openDrill } = useDrill();
  const { filters, period } = useFilters();

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.totals.total)} scans · ${formatPercent(state.data.totals.total ? state.data.totals.successful / state.data.totals.total : 0)} successful`}>
      {(d) => {
        const t = d.totals;
        const change = t.previousTotal ? percentChange(t.total, t.previousTotal) : null;
        const scanDrill = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "scanning", title, context, value });
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "QR scans in period", value: formatCount(t.total), sub: change !== null ? `${signedPercent(change)} vs ${period.previous?.label}` : "No comparison available", onSelect: () => scanDrill("All QR scans", {}, formatCount(t.total)) },
                  { label: "Successful", value: formatCount(t.successful), sub: formatPercent(t.total ? t.successful / t.total : 0), onSelect: () => scanDrill("Successful scans", { result: "Successful" }, formatCount(t.successful)) },
                  { label: "Failed", value: formatCount(t.failed), sub: formatPercent(t.total ? t.failed / t.total : 0), tone: "negative", onSelect: () => scanDrill("Failed scans", { result: "Failed" }, formatCount(t.failed)) },
                  { label: "Scan points issued", value: `${formatCount(t.points)} pts`, onSelect: () => openDrill({ module: "wallet", title: "Scan points issued", context: { source: "QR scans" }, value: formatCount(t.points) }) },
                  { label: "Successful scans per active member", value: formatDecimal(t.perActive), sub: "Per month, average" },
                ]}
              />
            </Panel>
            <Panel span={8} title="Daily scans" subtitle={`30 days to ${longDate(period.to)}. The last day is partial when it is today`} className="panel--lead">
              <TrendChart
                ariaLabel="Daily successful and failed scans"
                data={d.daily}
                series={[
                  { key: "successful", label: "Successful", color: CHART.positive },
                  { key: "failed", label: "Failed", color: CHART.negative },
                ]}
                kind="area"
                height={280}
                onSelect={(p) => scanDrill(`Scans on ${p.label}`, { day: String(p.label) }, formatCount(Number(p.successful) + Number(p.failed)))}
              />
            </Panel>
            <Panel span={4} title="Success and failure" subtitle="Selected period">
              <DonutChart
                ariaLabel="Scan outcomes"
                centerLabel="scans"
                height={200}
                items={[
                  { key: "successful", label: "Successful", value: t.successful, color: CHART.positive },
                  { key: "failed", label: "Failed", value: t.failed, color: CHART.negative },
                ]}
                onSelect={(i) => scanDrill(`${i.label} scans`, { result: i.label }, formatCount(i.value))}
              />
            </Panel>
            <Panel span={6} title="Monthly scans">
              <TrendChart ariaLabel="Monthly successful and failed scans" data={d.monthly} series={[{ key: "successful", label: "Successful", color: CHART.positive }, { key: "failed", label: "Failed", color: CHART.negative }]} kind="stacked" height={220} onSelect={(p) => scanDrill(`Scans · ${p.label}`, { month: String(p.label) })} />
            </Panel>
            <Panel span={6} title="Scans by programme">
              <RankedBars items={d.byProgramme.map((p) => ({ key: p.code, label: p.code, value: p.total, color: programmeColor(p.code) })).sort((a, b) => b.value - a.value)} onSelect={(i) => scanDrill(`${i.label} scans`, { programme: i.label }, formatCount(i.value))} />
            </Panel>
            <Panel span={6} title="Scans by product category" info={filters.category !== "all" ? "The selected category is highlighted; other categories are shown for context" : undefined}>
              <RankedBars items={d.byCategory} highlightKey={filters.category !== "all" ? filters.category : undefined} onSelect={(i) => scanDrill(`${i.label} scans`, { category: i.label }, formatCount(i.value))} />
            </Panel>
            <Panel span={6} title="Scans by member type" info="Member types are configured per programme. Labels are demo values until confirmed.">
              <RankedBars items={d.byMemberType} onSelect={(i) => scanDrill(`Scans by ${i.label}`, { "member type": i.label }, formatCount(i.value))} />
            </Panel>
            <Panel span={12} title="Scan summary by programme" padded={false}>
              <DataTable
                rows={d.byProgramme}
                rowKey={(r) => r.code}
                caption="Scan summary by programme"
                searchable={false}
                exportName="scan-summary-by-programme"
                initialSort={{ key: "total", dir: "desc" }}
                onRowClick={(r) => scanDrill(`${r.code} scan records`, { programme: r.code }, formatCount(r.total))}
                rowActionLabel={(r) => `Open ${r.code} scan records`}
                columns={[
                  { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                  { key: "total", header: "Total scans", value: (r) => r.total, render: (r) => formatCount(r.total), align: "right" },
                  { key: "successful", header: "Successful", value: (r) => r.successful, render: (r) => formatCount(r.successful), align: "right" },
                  { key: "failed", header: "Failed", value: (r) => r.failed, render: (r) => formatCount(r.failed), align: "right" },
                  { key: "points", header: "Points generated", value: (r) => r.points, render: (r) => formatCount(r.points), align: "right" },
                  { key: "rate", header: "Success rate", value: (r) => r.successRate, render: (r) => formatPercent(r.successRate), align: "right" },
                ]}
              />
            </Panel>
            <Panel span={12} title="Top products by scan volume" subtitle="SKU list is demo data" padded={false}>
              <DataTable
                rows={d.topProducts}
                rowKey={(r) => r.sku}
                caption="Top products by scan volume"
                searchPlaceholder="Search SKU or product"
                pageSize={6}
                exportName="top-products-by-scans"
                initialSort={{ key: "scans", dir: "desc" }}
                onRowClick={(r) => openDrill({ module: "products", title: r.name, context: { sku: r.sku }, value: `${formatCount(r.scans)} scans` })}
                rowActionLabel={(r) => `Open ${r.name}`}
                columns={[
                  { key: "sku", header: "SKU", value: (r) => r.sku, render: (r) => <span className="mono small">{r.sku}</span> },
                  { key: "name", header: "Product", value: (r) => r.name },
                  { key: "category", header: "Category", value: (r) => r.category },
                  { key: "scans", header: "Scans", value: (r) => r.scans, render: (r) => formatCount(r.scans), align: "right" },
                  { key: "points", header: "Points", value: (r) => r.points, render: (r) => formatCount(r.points), align: "right" },
                ]}
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}

/* ------------------------------ H. Points summary ------------------------------ */

export function PointsSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("points", [], refreshToken);
  const { openDrill } = useDrill();
  const { period } = useFilters();
  const wallet = (title: string, value: number, context: Record<string, string> = {}) => openDrill({ module: "wallet", title, context, value: `${formatCount(value)} pts` });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.available)} pts available`}>
      {(d) => (
        <div className="grid grid--12">
          <Panel span={12} title={`Balances as at ${longDate(period.to)}`} padded={false} info="Point-in-time figures. TDS Kitty is held separately and is never part of the available balance.">
            <FigureRow
              items={[
                { label: "Lifetime points earned", value: formatCount(d.lifetimeEarned), onSelect: () => wallet("Lifetime points earned", d.lifetimeEarned) },
                { label: "Available for redemption", value: formatCount(d.available), tone: "accent", onSelect: () => wallet("Available points", d.available, { balance: "Available" }) },
                { label: "Pending settlement", value: formatCount(d.pendingSettlement), sub: "Redemptions not yet settled", onSelect: () => wallet("Points pending settlement", d.pendingSettlement, { balance: "Pending settlement" }) },
                { label: "TDS Kitty", value: d.tdsKitty ? `₹${formatCount(d.tdsKitty)}` : "—", sub: "Held separately, applicable programmes only", onSelect: () => openDrill({ module: "financial", title: "TDS Kitty balance", value: formatInr(d.tdsKitty) }) },
              ]}
            />
          </Panel>
          <Panel span={5} title="Movement in the selected period">
            <StatList
              items={[
                { label: "Points earned through QR scans", value: formatCount(d.scanPoints), onSelect: () => wallet("Scan points", d.scanPoints, { source: "QR scans" }) },
                { label: "Welcome bonus", value: formatCount(d.welcomeBonus), onSelect: () => wallet("Welcome bonus points", d.welcomeBonus, { source: "Welcome bonus" }) },
                { label: "Scheme points", value: formatCount(d.schemePoints), onSelect: () => wallet("Scheme points", d.schemePoints, { source: "Schemes" }) },
                { label: "Bonus points", value: formatCount(d.bonusPoints), onSelect: () => wallet("Bonus points", d.bonusPoints, { source: "Bonus" }) },
                { label: "Points redeemed", value: formatCount(d.redeemed), onSelect: () => wallet("Points redeemed", d.redeemed, { movement: "Redemptions" }) },
                { label: "Points reversed or adjusted", value: formatCount(d.reversed), note: "Demo figure; depends on source data", onSelect: () => wallet("Reversals and adjustments", d.reversed, { movement: "Reversals" }) },
                { label: "TDS deducted (₹)", value: formatCount(d.tdsDeducted), note: "Accrual and redemption models combined here; split in section M", onSelect: () => openDrill({ module: "financial", title: "TDS deducted", value: formatInr(d.tdsDeducted) }) },
              ]}
            />
          </Panel>
          <Panel span={7} title="Points movement" subtitle="Earned against redeemed, monthly">
            <TrendChart
              ariaLabel="Points earned and redeemed by month"
              data={d.movement}
              series={[
                { key: "earned", label: "Earned", color: CHART.lead },
                { key: "redeemed", label: "Redeemed", color: CHART.support },
                { key: "reversed", label: "Reversed", color: CHART.neutral },
              ]}
              height={260}
              onSelect={(p) => wallet(`Points movement · ${p.label}`, Number(p.earned), { month: String(p.label) })}
            />
          </Panel>
          <Panel span={12} title="Points by programme" padded={false} info="TDS model and Kitty applicability come from each programme's configuration and must be confirmed against the business rules.">
            <DataTable
              rows={d.byProgramme}
              rowKey={(r) => r.code}
              caption="Points by programme"
              searchable={false}
              exportName="points-by-programme"
              onRowClick={(r) => wallet(`${r.code} points ledger`, r.available, { programme: r.code })}
              rowActionLabel={(r) => `Open ${r.code} points ledger`}
              columns={[
                { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                { key: "earned", header: "Earned in period", value: (r) => r.earned, render: (r) => formatCount(r.earned), align: "right" },
                { key: "redeemed", header: "Redeemed in period", value: (r) => r.redeemed, render: (r) => formatCount(r.redeemed), align: "right" },
                { key: "available", header: "Available balance", value: (r) => r.available, render: (r) => formatCount(r.available), align: "right" },
                { key: "model", header: "TDS model", value: (r) => r.tdsModel },
                { key: "kitty", header: "TDS Kitty (₹)", value: (r) => r.kitty, render: (r) => (r.kitty === null ? <span className="muted">Not applicable</span> : formatCount(r.kitty)), align: "right" },
              ]}
            />
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}

/* ------------------------------ I. Redemption & payouts ------------------------------ */

export function RedemptionSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("redemption", [], refreshToken);
  const { openDrill } = useDrill();
  const red = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "redemption", title, context, value });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.totals.requests)} requests · ${formatCompact(state.data.totals.pending)} pending`}>
      {(d) => {
        const t = d.totals;
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "Redemption requests", value: formatCount(t.requests), onSelect: () => red("Redemption requests", {}, formatCount(t.requests)) },
                  { label: "Points redeemed", value: formatCount(t.points), onSelect: () => openDrill({ module: "wallet", title: "Points redeemed", value: formatCount(t.points) }) },
                  { label: "Redemption value", value: formatInr(t.valueInr), sub: "At configured point values" },
                  { label: "Pending payouts", value: formatCount(t.pendingPayouts), sub: formatInr(t.pendingPayoutValue), tone: "accent", onSelect: () => red("Pending payouts", { payout: "Pending" }, formatCount(t.pendingPayouts)) },
                  { label: "Failed payout transactions", value: formatCount(t.failedPayouts), sub: "Last 7 days", tone: "negative", onSelect: () => red("Failed payouts", { payout: "Failed" }, formatCount(t.failedPayouts)) },
                ]}
              />
            </Panel>
            <Panel span={5} title="Request status" subtitle="Requests raised in the selected period">
              <ShareBar
                label="Redemption status"
                items={[
                  { key: "successful", label: "Successful", value: t.successful, tone: "positive" },
                  { key: "pending", label: "Pending", value: t.pending, tone: "warning" },
                  { key: "rejected", label: "Rejected", value: t.rejected, tone: "negative" },
                  { key: "cancelled", label: "Cancelled", value: t.cancelled, tone: "neutral" },
                ]}
                onSelect={(i) => red(`${i.label} redemptions`, { status: i.label }, formatCount(i.value))}
              />
              <p className="panel__note">Payment partner and settlement method are not assumed. Payout figures will come from the confirmed V-Guard payout integration.</p>
            </Panel>
            <Panel span={7} title="Redemption trend">
              <TrendChart ariaLabel="Monthly redemption requests" data={d.trend} series={[{ key: "successful", label: "Successful", color: CHART.lead }, { key: "other", label: "Pending, rejected or cancelled", color: CHART.neutral }]} kind="stacked" height={230} onSelect={(p) => red(`Redemptions · ${p.label}`, { month: String(p.label) })} />
            </Panel>
            <Panel span={12} title="Redemption by programme" padded={false}>
              <DataTable
                rows={d.byProgramme}
                rowKey={(r) => r.code}
                caption="Redemption by programme"
                searchable={false}
                exportName="redemption-by-programme"
                initialSort={{ key: "requests", dir: "desc" }}
                onRowClick={(r) => red(`${r.code} redemptions`, { programme: r.code }, formatCount(r.requests))}
                rowActionLabel={(r) => `Open ${r.code} redemptions`}
                columns={[
                  { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                  { key: "modes", header: "Redemption options", value: (r) => r.modes },
                  { key: "requests", header: "Requests", value: (r) => r.requests, render: (r) => formatCount(r.requests), align: "right" },
                  { key: "successful", header: "Successful", value: (r) => r.successful, render: (r) => formatCount(r.successful), align: "right" },
                  { key: "pending", header: "Pending", value: (r) => r.pending, render: (r) => formatCount(r.pending), align: "right" },
                  { key: "points", header: "Points", value: (r) => r.points, render: (r) => formatCount(r.points), align: "right" },
                  { key: "value", header: "Value", value: (r) => r.valueInr, render: (r) => formatInr(r.valueInr), align: "right" },
                ]}
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}
