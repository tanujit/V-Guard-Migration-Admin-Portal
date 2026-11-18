import { ShieldCheck } from "lucide-react";
import { useSection } from "@/hooks/useSection";
import { useDrill } from "@/context/DrillContext";
import { useFilters } from "@/context/FilterContext";
import { KYC_CHECKS } from "@/config/statuses";
import { PROGRAMMES } from "@/config/programmes";
import { Panel } from "@/components/ui/Panel";
import { RankedBars, ShareBar } from "@/components/ui/DataBars";
import { DataTable } from "@/components/ui/DataTable";
import { TrendChart } from "@/components/charts/Charts";
import { ProgrammeTag } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { formatCompact, formatCount, formatInr } from "@/lib/format";
import { engineMeta } from "@/data/mock/engine";
import { longDate } from "@/data/mock/time";
import { DashboardSection, type SectionProps } from "../DashboardSection";

/* ------------------------------ J. KYC & verification ------------------------------ */

export function KycSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("kyc", [], refreshToken);
  const { openDrill } = useDrill();
  const kyc = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "registration-kyc", title, context, value });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.checks.reduce((a, c) => a + c.pending, 0))} checks pending`}>
      {(d) => (
        <div className="grid grid--12">
          <Panel span={12} padded={false}>
            <div className="callout callout--quiet">
              <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" />
              <p>Aggregated counts only. No Aadhaar, PAN or bank numbers are shown on the dashboard. Each programme counts only the checks in its own verification workflow, and members may not have submitted these details at registration.</p>
            </div>
          </Panel>
          <Panel span={8} title="Verification outcome by check" subtitle="Members past registration in programmes where the check applies">
            <div className="check-list">
              {d.checks.map((c) => (
                <div key={c.check} className="check-list__row">
                  <div className="check-list__head">
                    <span className="check-list__name">{c.label}</span>
                    <span className="check-list__progs">
                      {c.applicableProgrammes.map((p) => (
                        <ProgrammeTag key={p} code={p} size="sm" />
                      ))}
                    </span>
                  </div>
                  <ShareBar
                    label={`${c.label} verification`}
                    items={[
                      { key: "verified", label: "Verified", value: c.verified, tone: "positive" },
                      { key: "pending", label: "Pending", value: c.pending, tone: "warning" },
                      { key: "failed", label: "Failed", value: c.failed, tone: "negative" },
                      { key: "not_submitted", label: "Not yet submitted", value: c.notSubmitted, color: "var(--chart-neutral-3)" },
                    ]}
                    onSelect={(i) => kyc(`${c.label} · ${i.label}`, { check: c.label, outcome: i.label }, formatCount(i.value))}
                  />
                </div>
              ))}
            </div>
          </Panel>
          <Panel span={4} title="PAN operative status" info={KYC_CHECKS.find((c) => c.key === "pan_aadhaar_link")?.note}>
            <ShareBar
              label="PAN operative status"
              items={[
                { key: "operative", label: "Operative", value: d.panOperative.operative, tone: "positive" },
                { key: "inoperative", label: "Inoperative", value: d.panOperative.inoperative, tone: "negative" },
                { key: "unknown", label: "Status unavailable", value: d.panOperative.unknown, color: "var(--chart-neutral-3)" },
              ]}
              onSelect={(i) => kyc(`PAN ${i.label.toLowerCase()}`, { "PAN status": i.label }, formatCount(i.value))}
            />
            <h4 className="panel__h4">Pending verification by age</h4>
            <RankedBars items={d.ageing} onSelect={(i) => kyc(`Pending verifications · ${i.label}`, { ageing: i.label }, formatCount(i.value))} />
          </Panel>
          <Panel span={12} title="Verification by programme" padded={false}>
            <DataTable
              rows={d.byProgramme}
              rowKey={(r) => r.code}
              caption="Verification by programme"
              searchable={false}
              exportName="kyc-by-programme"
              onRowClick={(r) => kyc(`${r.code} verification queue`, { programme: r.code })}
              rowActionLabel={(r) => `Open ${r.code} verification queue`}
              columns={[
                { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                { key: "checks", header: "Checks in workflow", value: (r) => r.checks.map((c) => KYC_CHECKS.find((k) => k.key === c)?.label).join(", "), sortable: false },
                { key: "verified", header: "Verified", value: (r) => r.verified, render: (r) => formatCount(r.verified), align: "right" },
                { key: "pending", header: "Pending", value: (r) => r.pending, render: (r) => formatCount(r.pending), align: "right" },
                { key: "failed", header: "Failed", value: (r) => r.failed, render: (r) => formatCount(r.failed), align: "right" },
              ]}
            />
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}

/* ------------------------------ M. TDS & financial ------------------------------ */

export function TdsSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("tds", [], refreshToken);
  const { openDrill } = useDrill();
  const { period, filters } = useFilters();
  const fin = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "financial", title, context, value });
  const inScope = PROGRAMMES.filter((p) => filters.programme === "all" || p.code === filters.programme);
  const accrualProgs = inScope.filter((p) => p.tdsModel === "at_accrual").map((p) => p.code);
  const redemptionProgs = inScope.filter((p) => p.tdsModel === "at_redemption").map((p) => p.code);
  const kittyProgs = inScope.filter((p) => p.hasTdsKitty).map((p) => p.code);

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatInr(state.data.periodTds)} TDS in period`}>
      {(d) => (
        <div className="grid grid--12">
          <div className="tds-split" style={{ gridColumn: "span 12" }}>
            <button type="button" className="tds-card" onClick={() => fin("TDS deducted at scan or accrual", { model: "At accrual" }, formatInr(d.accrualTds))}>
              <span className="tds-card__label">TDS at scan / accrual</span>
              <span className="tds-card__value num">{formatInr(d.accrualTds)}</span>
              <span className="tds-card__note">In the period · {accrualProgs.join(", ") || "no programme"}</span>
            </button>
            <button type="button" className="tds-card" onClick={() => fin("TDS deducted at redemption", { model: "At redemption" }, formatInr(d.redemptionTds))}>
              <span className="tds-card__label">TDS at redemption</span>
              <span className="tds-card__value num">{formatInr(d.redemptionTds)}</span>
              <span className="tds-card__note">In the period · {redemptionProgs.join(", ") || "no programme"}</span>
            </button>
            <button type="button" className="tds-card" onClick={() => fin("TDS Kitty balance", {}, formatInr(d.kittyBalance))}>
              <span className="tds-card__label">TDS Kitty balance</span>
              <span className="tds-card__value num">{formatInr(d.kittyBalance)}</span>
              <span className="tds-card__note">As at {longDate(period.to)} · {kittyProgs.join(", ") || "no programme"}</span>
            </button>
            <button type="button" className="tds-card tds-card--ref" onClick={() => openDrill({ module: "wallet", title: "Points available for redemption", value: `${formatCount(d.availablePoints)} pts` })}>
              <span className="tds-card__label">Points available for redemption</span>
              <span className="tds-card__value num">{formatCount(d.availablePoints)} pts</span>
              <span className="tds-card__note">Reference only · excludes TDS Kitty</span>
            </button>
          </div>
          <Panel span={8} title="Monthly TDS by deduction model" subtitle={`Demo rates of ${engineMeta.demoRates.tdsAccrual * 100}% at accrual and ${engineMeta.demoRates.tdsRedemption * 100}% at redemption. Real rules belong to Financial configuration`}>
            <TrendChart
              ariaLabel="Monthly TDS by deduction model"
              data={d.monthly}
              series={[
                { key: "atAccrual", label: "At scan / accrual", color: CHART.lead },
                { key: "atRedemption", label: "At redemption", color: CHART.support },
              ]}
              kind="stacked"
              height={240}
              valueFormat={formatInr}
              onSelect={(p) => fin(`TDS · ${p.label}`, { month: String(p.label) })}
            />
          </Panel>
          <Panel span={4} title="PAN operative status" subtitle="Members with PAN on record">
            <ShareBar
              label="PAN operative versus inoperative"
              items={[
                { key: "operative", label: "Operative", value: d.panOperative.operative, tone: "positive" },
                { key: "inoperative", label: "Inoperative", value: d.panOperative.inoperative, tone: "negative" },
                { key: "unknown", label: "Status unavailable", value: d.panOperative.unknown, color: "var(--chart-neutral-3)" },
              ]}
              onSelect={(i) => fin(`PAN ${i.label.toLowerCase()} members`, { "PAN status": i.label }, formatCount(i.value))}
            />
            <h4 className="panel__h4">Pending TDS activities</h4>
            <ul className="task-list">
              {d.pendingActivities.map((a) => (
                <li key={a.label}>
                  <button type="button" className="task-list__item" onClick={() => openDrill({ module: a.module, title: a.label, value: a.count ? formatCount(a.count) : undefined })}>
                    <span>{a.label}</span>
                    <span className="num">{a.count ? formatCount(a.count) : "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel span={12} title="TDS by programme" padded={false} info="Each programme's TDS model comes from configuration. Values marked “To be confirmed” must be agreed against the SOW before go-live.">
            <DataTable
              rows={d.byProgramme}
              rowKey={(r) => r.code}
              caption="TDS by programme"
              searchable={false}
              exportName="tds-by-programme"
              onRowClick={(r) => fin(`${r.code} TDS ledger`, { programme: r.code })}
              rowActionLabel={(r) => `Open ${r.code} TDS ledger`}
              columns={[
                { key: "code", header: "Programme", value: (r) => r.code, render: (r) => <ProgrammeTag code={r.code} /> },
                { key: "model", header: "TDS model", value: (r) => r.model },
                { key: "accrual", header: "At accrual (₹)", value: (r) => r.accrual, render: (r) => (r.accrual ? formatCount(r.accrual) : <span className="muted">—</span>), align: "right" },
                { key: "redemption", header: "At redemption (₹)", value: (r) => r.redemption, render: (r) => (r.redemption ? formatCount(r.redemption) : <span className="muted">—</span>), align: "right" },
                { key: "kitty", header: "Kitty balance (₹)", value: (r) => r.kitty, render: (r) => (r.kitty === null ? <span className="muted">Not applicable</span> : formatCount(r.kitty)), align: "right" },
                { key: "pending", header: "Pending actions", value: (r) => r.pendingActions, align: "right" },
              ]}
            />
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}
