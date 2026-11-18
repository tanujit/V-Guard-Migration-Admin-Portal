import { useSection } from "@/hooks/useSection";
import { useDrill } from "@/context/DrillContext";
import { SCHEME_STATUSES, statusLabel } from "@/config/statuses";
import { Panel } from "@/components/ui/Panel";
import { FigureRow, RankedBars, ShareBar } from "@/components/ui/DataBars";
import { DataTable } from "@/components/ui/DataTable";
import { TrendChart } from "@/components/charts/Charts";
import { ProgrammeTag, StatusBadge } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { programmeColor } from "@/config/programmes";
import { formatCompact, formatCount, formatDate, formatPercent } from "@/lib/format";
import type { SchemeRow } from "@/types/dashboard";
import { DashboardSection, type SectionProps } from "../DashboardSection";

/* ------------------------------ K. Scheme performance ------------------------------ */

export function SchemeSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("schemes", [], refreshToken);
  const { openDrill } = useDrill();
  const scheme = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "schemes", title, context, value });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${state.data.schemes.filter((s) => s.status === "active").length} active of ${state.data.schemes.length}`}>
      {(d) => {
        const count = (k: SchemeRow["status"]) => d.schemes.filter((s) => s.status === k).length;
        const issued = d.schemes.reduce((a, s) => a + s.pointsIssued, 0);
        const participants = d.schemes.filter((s) => s.status === "active" || s.status === "completed").reduce((a, s) => a + s.participants, 0);
        const tone = (k: SchemeRow["status"]) => SCHEME_STATUSES.find((s) => s.key === k)!.tone;
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "Schemes configured", value: String(d.schemes.length), onSelect: () => scheme("All schemes") },
                  ...SCHEME_STATUSES.map((s) => ({ label: s.label, value: String(count(s.key)), tone: s.key === "pending_approval" && count(s.key) ? ("accent" as const) : undefined, onSelect: () => scheme(`${s.label} schemes`, { status: s.label }, String(count(s.key))) })),
                ]}
              />
            </Panel>
            <Panel span={4} title="Status distribution">
              <ShareBar label="Scheme status" items={SCHEME_STATUSES.map((s) => ({ key: s.key, label: s.label, value: count(s.key), tone: s.tone }))} onSelect={(i) => scheme(`${i.label} schemes`, { status: i.label }, String(i.value))} />
              <dl className="kv kv--tight">
                <div className="kv__row">
                  <dt>Points issued through schemes</dt>
                  <dd className="num">{formatCount(issued)}</dd>
                </div>
                <div className="kv__row">
                  <dt>Members participating</dt>
                  <dd className="num">{formatCount(participants)}</dd>
                </div>
              </dl>
            </Panel>
            <Panel span={4} title="Scheme points issued" subtitle="Monthly">
              <TrendChart ariaLabel="Scheme points issued by month" data={d.pointsTrend} series={[{ key: "schemePoints", label: "Scheme points", color: CHART.lead }]} kind="bar" height={200} legend={false} highlightKey={d.pointsTrend[d.pointsTrend.length - 1]?.key} onSelect={(p) => scheme(`Scheme points · ${p.label}`, { month: String(p.label) }, formatCount(Number(p.schemePoints)))} />
            </Panel>
            <Panel span={4} title="Top schemes by points issued">
              <RankedBars
                items={[...d.schemes]
                  .filter((s) => s.pointsIssued > 0)
                  .sort((a, b) => b.pointsIssued - a.pointsIssued)
                  .slice(0, 5)
                  .map((s) => ({ key: s.id, label: s.name, value: s.pointsIssued, color: programmeColor(s.programme) }))}
                valueFormat={formatCompact}
                onSelect={(i) => scheme(i.label, { scheme: i.key }, `${formatCount(i.value)} pts`)}
              />
            </Panel>
            <Panel span={12} title="Scheme performance" subtitle="Scheme list is demo data. The Scheme Builder and its approval workflow arrive in a later phase" padded={false}>
              <DataTable
                rows={d.schemes}
                rowKey={(r) => r.id}
                caption="Scheme performance"
                searchPlaceholder="Search schemes"
                pageSize={8}
                exportName="scheme-performance"
                initialSort={{ key: "points", dir: "desc" }}
                onRowClick={(r) => scheme(r.name, { scheme: r.id, programme: r.programme })}
                rowActionLabel={(r) => `Open scheme ${r.name}`}
                columns={[
                  { key: "id", header: "ID", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
                  { key: "name", header: "Scheme", value: (r) => r.name },
                  { key: "programme", header: "Programme", value: (r) => r.programme, render: (r) => <ProgrammeTag code={r.programme} /> },
                  { key: "status", header: "Status", value: (r) => statusLabel(SCHEME_STATUSES, r.status), render: (r) => <StatusBadge tone={tone(r.status)}>{statusLabel(SCHEME_STATUSES, r.status)}</StatusBadge> },
                  { key: "window", header: "Window", value: (r) => r.start, render: (r) => <span className="small">{formatDate(r.start)} – {formatDate(r.end)}</span> },
                  { key: "participants", header: "Participants", value: (r) => r.participants, render: (r) => formatCount(r.participants), align: "right" },
                  { key: "points", header: "Points issued", value: (r) => r.pointsIssued, render: (r) => formatCount(r.pointsIssued), align: "right" },
                  {
                    key: "budget",
                    header: "Budget used",
                    value: (r) => (r.budget ? r.pointsIssued / r.budget : null),
                    align: "right",
                    render: (r) =>
                      r.budget ? (
                        <span className="budget">
                          <span className="budget__track" aria-hidden="true">
                            <span className="budget__fill" style={{ width: `${Math.min(100, (r.pointsIssued / r.budget) * 100)}%`, background: r.pointsIssued / r.budget > 0.9 ? "var(--warning-strong)" : "var(--grad-amber)" }} />
                          </span>
                          <span className="num">{formatPercent(r.pointsIssued / r.budget, 0)}</span>
                        </span>
                      ) : (
                        <span className="muted">No budget set</span>
                      ),
                  },
                  { key: "liability", header: "Open liability", value: (r) => (r.budget && (r.status === "active" || r.status === "scheduled") ? r.budget - r.pointsIssued : null), render: (r) => (r.budget && (r.status === "active" || r.status === "scheduled") ? formatCount(r.budget - r.pointsIssued) : <span className="muted">—</span>), align: "right" },
                ]}
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}

/* ------------------------------ L. Gifts & fulfilment ------------------------------ */

export function GiftSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("gifts", [], refreshToken);
  const { openDrill } = useDrill();
  const gift = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "redemption", title, context, value });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.requests)} gift orders`}>
      {(d) => {
        const pending = d.statuses.find((s) => s.key === "pending")?.value ?? 0;
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "Catalogue items", value: String(d.catalogue.total), onSelect: () => gift("Gift catalogue", { catalogue: "All items" }) },
                  { label: "Active items", value: String(d.catalogue.active), onSelect: () => gift("Active gift items", { catalogue: "Active" }) },
                  { label: "Out of stock", value: String(d.catalogue.outOfStock), tone: d.catalogue.outOfStock ? "negative" : undefined, onSelect: () => gift("Out-of-stock gift items", { catalogue: "Out of stock" }) },
                  { label: "Gift redemption requests", value: formatCount(d.requests), sub: "In the period" },
                  { label: "Pending fulfilment", value: formatCount(pending), tone: "accent", onSelect: () => gift("Gifts pending fulfilment", { fulfilment: "Pending" }, formatCount(pending)) },
                ]}
              />
            </Panel>
            <Panel span={5} title="Fulfilment status" subtitle="Gift orders raised in the period">
              <ShareBar label="Gift fulfilment status" items={d.statuses} onSelect={(i) => gift(`Gift orders · ${i.label}`, { fulfilment: i.label }, formatCount(i.value))} />
              <p className="panel__note">Catalogue figures are demo data. No external marketplace is assumed</p>
            </Panel>
            <Panel span={7} title="Gift orders by programme" subtitle="Programmes with gift redemption enabled" padded={false}>
              <DataTable
                rows={d.byProgramme}
                rowKey={(r) => r.code}
                caption="Gift orders by programme"
                searchable={false}
                exportName="gift-orders-by-programme"
                initialSort={{ key: "orders", dir: "desc" }}
                onRowClick={(r) => gift(`${r.code} gift orders`, { programme: r.code }, formatCount(r.orders))}
                rowActionLabel={(r) => `Open ${r.code} gift orders`}
                columns={[
                  { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                  { key: "orders", header: "Orders", value: (r) => r.orders, render: (r) => formatCount(r.orders), align: "right" },
                  { key: "pending", header: "Pending", value: (r) => r.pending, render: (r) => formatCount(r.pending), align: "right" },
                  { key: "dispatched", header: "Dispatched", value: (r) => r.dispatched, render: (r) => formatCount(r.dispatched), align: "right" },
                  { key: "delivered", header: "Delivered", value: (r) => r.delivered, render: (r) => formatCount(r.delivered), align: "right" },
                  { key: "failed", header: "Failed", value: (r) => r.failed, render: (r) => formatCount(r.failed), align: "right" },
                ]}
                emptyTitle="No programme in this selection offers gift redemption"
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}

/* ------------------------------ N. Referral programme ------------------------------ */

export function ReferralSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("referrals", [], refreshToken);
  const { openDrill } = useDrill();
  const ref = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "members", title, context: { ...context, journey: "Referral" }, value });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.totals.total)} referrals`}>
      {(d) => {
        const t = d.totals;
        const enabled = d.byProgramme.filter((p) => p.enabled);
        if (!enabled.length) {
          return (
            <Panel>
              <p className="drill__text">Referral is not enabled for the programmes in this selection. Referral types and eligible combinations are set per programme once confirmed by V-Guard.</p>
            </Panel>
          );
        }
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "Referrals", value: formatCount(t.total), onSelect: () => ref("All referrals", {}, formatCount(t.total)) },
                  { label: "Successful", value: formatCount(t.successful), sub: formatPercent(t.total ? t.successful / t.total : 0), onSelect: () => ref("Successful referrals", { status: "Successful" }, formatCount(t.successful)) },
                  { label: "Pending", value: formatCount(t.pending), onSelect: () => ref("Pending referrals", { status: "Pending" }, formatCount(t.pending)) },
                  { label: "Rejected", value: formatCount(t.rejected), tone: "negative", onSelect: () => ref("Rejected referrals", { status: "Rejected" }, formatCount(t.rejected)) },
                  { label: "Referral points issued", value: formatCount(t.pointsIssued) },
                  { label: "Referral points redeemed", value: formatCount(t.pointsRedeemed) },
                ]}
              />
            </Panel>
            <Panel span={7} title="Referral trend">
              <TrendChart
                ariaLabel="Monthly referrals by outcome"
                data={d.trend}
                series={[
                  { key: "successful", label: "Successful", color: CHART.positive },
                  { key: "pending", label: "Pending", color: CHART.warning },
                  { key: "rejected", label: "Rejected", color: CHART.negative },
                ]}
                kind="stacked"
                height={230}
                onSelect={(p) => ref(`Referrals · ${p.label}`, { month: String(p.label) })}
              />
            </Panel>
            <Panel span={5} title="Referrals by programme" padded={false} info="Programmes without an approved referral journey are listed as not enabled.">
              <DataTable
                rows={d.byProgramme}
                rowKey={(r) => r.code}
                caption="Referrals by programme"
                searchable={false}
                exportName="referrals-by-programme"
                onRowClick={(r) => r.enabled && ref(`${r.code} referrals`, { programme: r.code }, formatCount(r.total))}
                columns={[
                  { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                  { key: "total", header: "Referrals", value: (r) => (r.enabled ? r.total : null), render: (r) => (r.enabled ? formatCount(r.total) : <span className="muted">Not enabled</span>), align: "right" },
                  { key: "successful", header: "Successful", value: (r) => (r.enabled ? r.successful : null), render: (r) => (r.enabled ? formatCount(r.successful) : "—"), align: "right" },
                  { key: "points", header: "Points issued", value: (r) => (r.enabled ? r.pointsIssued : null), render: (r) => (r.enabled ? formatCount(r.pointsIssued) : "—"), align: "right" },
                ]}
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}
