import { useState } from "react";
import { Activity, BadgeCheck, CircleCheck, CircleX, ClipboardCheck, Coins, Crosshair, Gift, Hourglass, QrCode, ReceiptText, Users, Workflow, type LucideIcon } from "lucide-react";
import { useSection } from "@/hooks/useSection";
import { useDrill } from "@/context/DrillContext";
import { useFilters } from "@/context/FilterContext";
import { programmeColor } from "@/config/programmes";
import { KpiCard, type KpiTone, type KpiVariant } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { RankedBars } from "@/components/ui/DataBars";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { DonutChart } from "@/components/charts/Charts";
import { ProgrammeTag, SelectField } from "@/components/ui/primitives";
import { formatCompact, formatCount, formatValue } from "@/lib/format";
import type { KpiMetric, ProgrammeRow } from "@/types/dashboard";
import { DashboardSection, type SectionProps } from "../DashboardSection";

/* ------------------------------ A. Platform overview ------------------------------ */

/**
 * Card placement and treatment. Variants carry meaning: yellow for the headline figure of a row,
 * dark for prominent operational/financial figures, status tones only where the figure is a
 * success, backlog or failure count.
 */
const KPI_ROWS: { label: string; hint: string; cards: { id: string; variant: KpiVariant; tone?: KpiTone; icon: LucideIcon }[] }[] = [
  {
    label: "Members",
    hint: "As at the end of the selected period",
    cards: [
      { id: "registered", variant: "primary", icon: Users },
      { id: "active", variant: "light", icon: Activity },
      { id: "approved", variant: "light", icon: BadgeCheck },
      { id: "pending", variant: "status", tone: "warning", icon: Hourglass },
    ],
  },
  {
    label: "Today & approvals",
    hint: "Live day, not affected by the date range",
    cards: [
      { id: "scans-today", variant: "dark", icon: QrCode },
      { id: "scans-ok-today", variant: "status", tone: "positive", icon: CircleCheck },
      { id: "scans-failed-today", variant: "status", tone: "negative", icon: CircleX },
      { id: "pending-approvals", variant: "status", tone: "warning", icon: ClipboardCheck },
    ],
  },
  {
    label: "Points, redemption & schemes",
    hint: "Within the selected period",
    cards: [
      { id: "points-earned", variant: "primary", icon: Coins },
      { id: "points-redeemed", variant: "dark", icon: Gift },
      { id: "redemption-requests", variant: "light", icon: ReceiptText },
      { id: "active-schemes", variant: "light", icon: Workflow },
    ],
  },
];

export function OverviewSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("overview", [], refreshToken);
  const { openDrill } = useDrill();
  const onSelect = (m: KpiMetric) => openDrill({ ...m.drill, value: `${formatValue(m.value, m.format)}${m.format === "points" ? " pts" : ""}` });

  return (
    <DashboardSection
      {...props}
      state={state}
      summary={state.data && `${formatCompact(state.data.members[0].value)} registered · ${formatCompact(state.data.scansToday[0].value)} scans today`}
    >
      {(d) => {
        const byId = new Map([...d.members, ...d.scansToday, ...d.value, ...d.governance].map((m) => [m.id, m]));
        return (
          <div className="kpi-rows">
            {KPI_ROWS.map((row) => (
              <div key={row.label} className="kpi-row">
                <p className="kpi-row__label">
                  {row.label}
                  <span className="kpi-row__hint">{row.hint}</span>
                </p>
                <div className="kpi-grid">
                  {row.cards.map((c) => {
                    const m = byId.get(c.id);
                    return m ? <KpiCard key={c.id} metric={m} onSelect={onSelect} variant={c.variant} tone={c.tone} icon={c.icon} /> : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      }}
    </DashboardSection>
  );
}

/* ------------------------------ B. Programme distribution ------------------------------ */

const METRICS: { key: keyof Omit<ProgrammeRow, "code">; label: string; short: string }[] = [
  { key: "registered", label: "Registered members", short: "Registered" },
  { key: "active", label: "Active members", short: "Active" },
  { key: "approved", label: "Approved members", short: "Approved" },
  { key: "pending", label: "Pending registrations", short: "Pending" },
  { key: "scans", label: "QR scans in period", short: "QR scans" },
  { key: "pointsEarned", label: "Points earned in period", short: "Points earned" },
  { key: "pointsRedeemed", label: "Points redeemed in period", short: "Points redeemed" },
];

const METRIC_MODULE: Record<string, string> = { registered: "members", active: "members", approved: "members", pending: "registration-kyc", scans: "scanning", pointsEarned: "wallet", pointsRedeemed: "wallet" };

export function ProgrammeSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("programmeDistribution", [], refreshToken);
  const { openDrill } = useDrill();
  const { setFilter, filters } = useFilters();
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("scans");
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  const columns: Column<ProgrammeRow>[] = [
    { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
    ...METRICS.map((m) => ({ key: m.key, header: m.short, value: (r: ProgrammeRow) => r[m.key], render: (r: ProgrammeRow) => formatCount(r[m.key]), align: "right" as const })),
    {
      key: "focus",
      header: "",
      value: () => null,
      sortable: false,
      noSearch: true,
      render: (r) =>
        filters.programme === r.code ? (
          <span className="muted small">Filtered</span>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            onClick={(e) => {
              e.stopPropagation();
              setFilter("programme", r.code);
            }}
            aria-label={`Filter the dashboard to ${r.code}`}
          >
            <Crosshair size={14} strokeWidth={1.75} aria-hidden="true" />
            Focus
          </button>
        ),
    },
  ];

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${state.data.rows.length} programmes`}>
      {(d) => (
        <div className="grid grid--12">
          <Panel span={5} title="Registered members by programme" info="Members registered as at the end of the selected period. Each programme keeps its colour across the dashboard.">
            <DonutChart
              ariaLabel="Registered members by programme"
              centerLabel="members"
              items={d.rows.map((r) => ({ key: r.code, label: r.code, value: r.registered, color: programmeColor(r.code) }))}
              onSelect={(i) => openDrill({ module: "members", title: `${i.label} registered members`, context: { programme: i.label }, value: formatCount(i.value) })}
            />
          </Panel>
          <Panel span={7} title="Compare programmes" actions={<SelectField label="Metric" hideLabel value={metric} onChange={(v) => setMetric(v as typeof metric)} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />}>
            <RankedBars
              items={[...d.rows].sort((a, b) => b[metric] - a[metric]).map((r) => ({ key: r.code, label: r.code, value: r[metric], color: programmeColor(r.code) }))}
              onSelect={(i) => openDrill({ module: METRIC_MODULE[metric], title: `${i.label} · ${metricLabel}`, context: { programme: i.label }, value: formatCount(i.value) })}
            />
            <p className="panel__note">Programme list and rules come from the programme master configuration</p>
          </Panel>
          <Panel span={12} title="Programme summary" padded={false}>
            <DataTable
              rows={d.rows}
              columns={columns}
              rowKey={(r) => r.code}
              caption="Programme summary"
              searchable={false}
              exportName="programme-summary"
              onRowClick={(r) => openDrill({ module: "members", title: `Programme ${r.code}`, context: { programme: r.code }, value: `${formatCount(r.registered)} members` })}
              rowActionLabel={(r) => `Open ${r.code} details`}
              initialSort={{ key: "registered", dir: "desc" }}
            />
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}
