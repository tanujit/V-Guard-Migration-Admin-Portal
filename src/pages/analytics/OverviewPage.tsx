import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { TrendChart } from "@/components/charts/Charts";
import { KPI_SEED } from "@/config/analyticsCatalogue";
import { channelView, engagement, fraudView, geoView, kpiValues, pointsFlowView, redemptionView, retentionView, schemeView, segmentationView, supportView, tierView } from "@/features/analytics/store";
import { SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ABASE, DashboardExport, DecisionRef, FilterBar, Freshness, KpiTile, Refresh, num, pct, useAnalyticsView, useFilters } from "./shared";

/** Business overview (SOW 13.3): panels A–M, each reading the same analytics service as its own tab. */
export function AnalyticsOverviewPage() {
  const v = useAnalyticsView();
  const nav = useNavigate();
  const { engine: f, range } = useFilters();
  const ref = useRef<HTMLDivElement>(null);
  const k = kpiValues(v.uid, f.to, f);
  const def = (id: string) => v.as.kpis.find((x) => x.id === id) ?? KPI_SEED.find((x) => x.id === id)!;
  const tileStatus = (id: string) => (k[id].value == null ? "bcr" : def(id).status === "confirmed" ? "confirmed" : "provisional") as "bcr" | "confirmed" | "provisional";
  const fmt = (id: string) => { const x = k[id].value; const u = def(id).unit; return x == null ? "Not available" : u === "percent" ? `${x.toFixed(1)}%` : num(x); };
  const eg = engagement(v.uid, f);
  const pf = pointsFlowView(v.uid, f);
  const fr = v.can("fraud-rules:view") ? fraudView(v.uid, f) : null;
  const sc = schemeView(v.uid, f);
  const ch = channelView(v.uid, f);
  const geo = geoView(v.uid, f, "district");
  const ti = tierView(v.uid, f);
  const su = supportView(v.uid, f);
  const rt = retentionView(v.uid, f);
  const rp = redemptionView(v.uid, f);
  const sg = segmentationView(v.uid, f);
  return (
    <>
      <SectionTitle title="Business overview" description={`Programme health, engagement, points, schemes, fraud, geography, retention and fulfilment for ${range.label.toLowerCase()} — every figure from the central KPI dictionary and the module that owns the data`} actions={<span className="btn-row"><Refresh /><DashboardExport reportId="RPT-OVERVIEW" target={ref} title="Business overview" /></span>} />
      <FilterBar applies={["date", "compare", "programme", "geo", "memberType", "category", "scheme"]} />
      <Notice tone="warn">KPI definitions are the SOW 13.1 wording used as provisional development measures, and no target is confirmed (<DecisionRef id="OP-KPI1" />). Measures whose inputs are not supplied show <strong>Not available</strong>, never zero.</Notice>
      <div ref={ref}>
        <div className="ana-tiles">
          {["KPI-DAU", "KPI-MAU", "KPI-A90", "KPI-PRR", "KPI-CHURN", "KPI-SCAN", "KPI-NPS", "KPI-FRAUD", "KPI-CAC", "KPI-LTV", "KPI-PAYBACK"].map((id) => (
            <KpiTile key={id} label={def(id).name} value={fmt(id)} period={id === "KPI-DAU" ? `On ${f.to}` : id === "KPI-A90" ? "Last 90 days" : id === "KPI-PRR" ? "Last 12 months" : id === "KPI-MAU" || id === "KPI-CHURN" ? `Month of ${f.to.slice(0, 7)}` : `${f.from} → ${f.to}`} status={tileStatus(id)} detail={k[id].detail} onSelect={() => nav(`${ABASE}/kpis?kpi=${id}`)} />
          ))}
        </div>
        <div className="grid-2 grid-2--wide-left">
          <Panel title="A · Member engagement" subtitle="Daily active users (2+ app actions)" actions={<Freshness domain="activity" />}>
            {eg.ok && "dau" in eg && <TrendChart data={eg.dau.map((x) => ({ ...x }))} kind="area" ariaLabel="Daily active users" series={[{ key: "dau", label: "DAU", color: "var(--vg-amber)" }]} onSelect={() => nav(`${ABASE}/engagement`)} />}
          </Panel>
          <Panel title="B · Points flow" subtitle="Issued vs redeemed (Wallet ledger)" actions={<Freshness domain="points" />}>
            {pf.ok && "total" in pf && <StatList items={[{ label: "Points issued", value: num(pf.total.issued), onSelect: () => nav(`${ABASE}/points`) }, { label: "Points redeemed", value: num(pf.total.redeemed) }, { label: "Scheme points accrued (unsettled stage)", value: num(pf.total.accrued) }, { label: "Available now (all time)", value: num(pf.total.available), note: "A stage, not added to issued" }]} />}
          </Panel>
        </div>
        <div className="grid-3">
          <Panel title="C · Revenue impact" actions={<Freshness domain="revenue" />}>
            <p className="small">Revenue linked to the programme is not calculated: no sales source is connected and the attribution method is not approved (<DecisionRef id="OP-REV1" />).</p>
          </Panel>
          <Panel title="D · Fraud" actions={fr ? <Freshness domain="fraud" /> : undefined}>
            {fr && fr.ok && "live" in fr ? <StatList items={[{ label: "Flagged (not yet investigated)", value: num(fr.live), onSelect: () => nav(`${ABASE}/fraud`) }, { label: "Under investigation", value: num(fr.investigating) }, { label: "Confirmed", value: num(fr.confirmed) }, { label: "Blocked accounts", value: num(fr.blockedAccounts) }]} /> : <p className="muted small">Fraud analytics needs Fraud & risk rules: View</p>}
          </Panel>
          <Panel title="E · Scheme scorecard" actions={<Freshness domain="schemes" />}>
            {sc.ok && "rows" in sc && <RankedBars items={sc.rows.filter((r) => r.participants).slice(0, 6).map((r) => ({ key: r.id, label: r.name, value: r.participants }))} onSelect={() => nav(`${ABASE}/schemes`)} />}
          </Panel>
        </div>
        <div className="grid-3">
          <Panel title="F · Channel performance" subtitle="Scan-Out points by recorded channel" actions={<Freshness domain="scans" />}>
            {ch.ok && "channels" in ch && <RankedBars items={ch.channels.map((c) => ({ key: c.key, label: c.label, value: c.pointsEarned }))} onSelect={() => nav(`${ABASE}/channels`)} />}
          </Panel>
          <Panel title="G · Geography" subtitle="Active members by district" actions={<Freshness domain="geography" />}>
            {geo.ok && "rows" in geo && <RankedBars items={geo.rows.slice(0, 6).map((r) => ({ key: r.key, label: r.name, value: r.active }))} onSelect={() => nav(`${ABASE}/geography`)} />}
          </Panel>
          <Panel title="H · Tier distribution" actions={<Freshness domain="tiers" />}>
            {ti.ok && "tiers" in ti && <RankedBars items={ti.tiers.slice(0, 6).map((t) => ({ key: t.id, label: `${t.programme} ${t.name}`, value: t.members }))} onSelect={() => nav(`${ABASE}/tiers`)} />}
          </Panel>
        </div>
        <div className="grid-3">
          <Panel title="I · Support queue" actions={<Freshness domain="support" />}>
            {su.ok && "total" in su && <StatList items={[{ label: "Tickets in period", value: num(su.total), onSelect: () => nav(`${ABASE}/support`) }, { label: "Open", value: num(su.open) }, { label: "Average resolution", value: su.avgResolutionHours == null ? "Not available" : `${su.avgResolutionHours} h` }, { label: "Satisfaction", value: "Not available", note: "No satisfaction responses recorded" }]} />}
          </Panel>
          <Panel title="J · Retention" subtitle="30 / 60 / 90-day cohort retention" actions={<Freshness domain="activity" />}>
            {rt.ok && "matrix" in rt && <StatList items={rt.matrix.slice(-4).map((m) => ({ label: `${m.cohort} (${m.members})`, value: [m.d30, m.d60, m.d90].map((x) => (x == null ? "—" : pct(x))).join(" · "), onSelect: () => nav(`${ABASE}/retention`) }))} />}
          </Panel>
          <Panel title="K · Acquisition cost" actions={<Freshness domain="marketing" />}>
            <p className="small">New members: <strong>{eg.ok && "signups" in eg ? num(eg.signups.total) : "—"}</strong> in the period. Marketing spend, CAC and payback are not calculated (<DecisionRef id="OP-CAC1" />).</p>
          </Panel>
        </div>
        <div className="grid-2">
          <Panel title="L · Redemption by product" actions={<Freshness domain="gifts" />}>
            {rp.ok && "items" in rp && <RankedBars items={rp.items.filter((i) => i.redemptions).slice(0, 6).map((i) => ({ key: i.id, label: i.name, value: i.redemptions }))} onSelect={() => nav(`${ABASE}/redemption`)} />}
          </Panel>
          <Panel title="M · Member segmentation" actions={<Freshness domain="members" />}>
            {sg.ok && "rows" in sg && (sg.classified ? <RankedBars items={(["active", "dormant", "churned", "never_logged_in"] as const).map((s) => ({ key: s, label: s.replace(/_/g, " "), value: sg.rows.filter((r) => r.segment === s).length }))} onSelect={() => nav(`${ABASE}/segmentation`)} /> : <p className="small">Active, dormant and churned are not classified until both inactivity thresholds are set (<DecisionRef id="OP-SEG1" />). Never logged in: <strong>{sg.rows.filter((r) => r.segment === "never_logged_in").length}</strong>.</p>)}
          </Panel>
        </div>
      </div>
    </>
  );
}
