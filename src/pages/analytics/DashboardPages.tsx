import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { Segmented, StatusBadge } from "@/components/ui/primitives";
import { TrendChart } from "@/components/charts/Charts";
import { SelectInput, TextField } from "@/components/form/Form";
import { channelView, engagement, fraudView, geoView, kpiValues, pointsFlowView, redemptionView, retentionView, revenueView, schemeView, segmentationView, setAnalyticsConfig, supportView, tierView, acquisitionView, context } from "@/features/analytics/store";
import { categoryName, geoOf } from "@/features/analytics/engine";
import { SectionTitle, PolicyMessages } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ABASE, BcrTag, DashboardExport, DecisionRef, ExportButtons, FilterBar, Freshness, KpiTile, Refresh, dt, inr, num, pct, useAnalyticsView, useFilters, useRun } from "./shared";

const memberLink = (id: string) => <Link to={`/members/member/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>;
type MRow = { id: string; name: string; programme: string; joined: string; branch: string; lastLogin: string | null; lastActivity: string | null };
const MEMBER_COLS = [
  { header: "Member ID", value: (r: MRow) => r.id }, { header: "Name", value: (r: MRow) => r.name }, { header: "Programme", value: (r: MRow) => r.programme },
  { header: "Registered", value: (r: MRow) => r.joined }, { header: "Branch", value: (r: MRow) => r.branch }, { header: "Last login", value: (r: MRow) => r.lastLogin ?? "" }, { header: "Last activity", value: (r: MRow) => r.lastActivity ?? "" },
];
function MemberDrill({ rows, reportId, title }: { rows: MRow[]; reportId: string; title: string }) {
  return (
    <Panel title={title} subtitle="Members in your programme and geography scope" padded={false} actions={<ExportButtons reportId={reportId} name={`${reportId.toLowerCase()}-members`} cols={MEMBER_COLS} rows={rows} containsMembers />}>
      <DataTable rows={rows} rowKey={(r) => r.id} caption={title} columns={[
        { key: "id", header: "Member", value: (r) => r.id, render: (r) => memberLink(r.id) },
        { key: "n", header: "Name", value: (r) => r.name },
        { key: "p", header: "Programme", value: (r) => r.programme },
        { key: "j", header: "Registered", value: (r) => r.joined },
        { key: "b", header: "Branch", value: (r) => r.branch, render: (r) => <span className="mono small">{r.branch}</span> },
        { key: "l", header: "Last login", value: (r) => r.lastLogin ?? "", render: (r) => <span className="small">{dt(r.lastLogin)}</span> },
        { key: "a", header: "Last activity", value: (r) => r.lastActivity ?? "", render: (r) => <span className="small">{r.lastActivity ?? "—"}</span> },
      ]} />
    </Panel>
  );
}

/* ======================= Engagement ======================= */

export function EngagementPage() {
  const v = useAnalyticsView();
  const { engine: f, cmp } = useFilters();
  const ref = useRef<HTMLDivElement>(null);
  const [drill, setDrill] = useState<"active" | "signups">("active");
  const e = engagement(v.uid, f);
  if (!("dau" in e)) return <PolicyMessages result={e} />;
  const ce = cmp ? engagement(v.uid, { ...f, from: cmp.from, to: cmp.to }) : null;
  const mau = e.mau;
  const cur = mau[mau.length - 1]?.mau ?? 0, prev = mau[mau.length - 2]?.mau ?? 0;
  return (
    <>
      <SectionTitle title="Member engagement" description="Daily and monthly active users and new sign-ups. An active day means more than one app action (scan, redemption or login); a login alone does not count, and system events are never member actions" actions={<span className="btn-row"><Refresh /><DashboardExport reportId="RPT-ENGAGE" target={ref} title="Member engagement" /></span>} />
      <FilterBar applies={["date", "compare", "programme", "geo", "memberType", "category"]} />
      <div ref={ref}>
        <div className="ana-tiles">
          <KpiTile label="Daily active users" value={num(e.dauToday)} period={`On ${f.to}`} detail={ce && "dauToday" in ce ? `${num(ce.dauToday)} on ${cmp!.to}` : undefined} />
          <KpiTile label="Monthly active users" value={num(cur)} period={`Month of ${f.to.slice(0, 7)}`} detail={`Previous month ${num(prev)}${prev ? ` (${cur >= prev ? "+" : ""}${(((cur - prev) / prev) * 100).toFixed(0)}%)` : ""}`} />
          <KpiTile label="90-day active users" value={num(e.a90)} period="Last 90 days" />
          <KpiTile label="New sign-ups" value={num(e.signups.total)} period={`${f.from} → ${f.to}`} detail={ce && "signups" in ce ? `${num(ce.signups.total)} in comparison period` : undefined} status="data" onSelect={() => setDrill("signups")} />
        </div>
        <div className="grid-2 grid-2--wide-left">
          <Panel title="Daily active users" subtitle={`${f.from} → ${f.to}`} actions={<Freshness domain="activity" />}>
            <TrendChart data={e.dau} kind="area" ariaLabel="Daily active users" series={[{ key: "dau", label: "DAU", color: "var(--vg-amber)" }]} onSelect={() => setDrill("active")} />
          </Panel>
          <Panel title="Monthly active users" subtitle="Last 12 months">
            <TrendChart data={mau} kind="bar" ariaLabel="Monthly active users" series={[{ key: "mau", label: "MAU", color: "var(--chart-neutral-1)" }]} highlightKey={mau[mau.length - 1]?.key} />
          </Panel>
        </div>
        <div className="grid-2">
          <Panel title="7-day trend"><TrendChart data={e.trend7} kind="bar" height={180} ariaLabel="DAU last 7 days" legend={false} series={[{ key: "dau", label: "DAU", color: "var(--vg-amber)" }]} /></Panel>
          <Panel title="30-day trend"><TrendChart data={e.trend30} kind="line" height={180} ariaLabel="DAU last 30 days" legend={false} series={[{ key: "dau", label: "DAU", color: "var(--vg-amber)" }]} /></Panel>
        </div>
        <div className="grid-3">
          <Panel title="Active members by programme"><RankedBars items={e.byProgramme.map((x) => ({ key: x.key, label: x.label, value: x.value }))} /></Panel>
          <Panel title="Active members by region"><RankedBars items={e.byRegion.map((x) => ({ key: x.key, label: x.label, value: x.value }))} /></Panel>
          <Panel title="Scans by product category"><RankedBars items={e.byCategory.map((x) => ({ key: x.key, label: x.label, value: x.value }))} /></Panel>
        </div>
        <div className="grid-3">
          <Panel title="New sign-ups by programme"><RankedBars items={e.signups.byProgramme.map((x) => ({ key: x.key, label: x.label, value: x.value }))} onSelect={() => setDrill("signups")} /></Panel>
          <Panel title="New sign-ups by registration source"><RankedBars items={e.signups.bySource.map((x) => ({ key: x.key, label: x.label.replace(/_/g, " "), value: x.value }))} /></Panel>
          <Panel title="Registrations by month"><TrendChart data={e.signups.byMonth.slice(-12)} kind="bar" height={180} legend={false} ariaLabel="Registrations by month" series={[{ key: "value", label: "Registrations", color: "var(--chart-neutral-1)" }]} /></Panel>
        </div>
      </div>
      <Segmented label="Drill-down" value={drill} onChange={setDrill} options={[{ value: "active", label: "Active members in period" }, { value: "signups", label: "New sign-ups" }]} />
      <MemberDrill rows={e.drill(drill)} reportId="RPT-ENGAGE" title={drill === "active" ? "Active members" : "New sign-ups"} />
    </>
  );
}

/* ======================= Points flow ======================= */

export function PointsFlowPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const ref = useRef<HTMLDivElement>(null);
  const p = pointsFlowView(v.uid, f);
  if (!("total" in p)) return <PolicyMessages result={p} />;
  const t = p.total;
  const c = context();
  const grp = (rows: typeof p.byCategory) => rows.map((r) => ({ key: r.key, label: r.key, issued: r.issued, redeemed: r.redeemed, unsettled: r.unsettled }));
  return (
    <>
      <SectionTitle title="Points flow" description="Points issued against points redeemed, from the Wallet ledger (wallet service and scheme module lines). Accrued, credited, unsettled, settled and available are stages of the same earning: they are shown side by side and never added together" actions={<span className="btn-row"><Refresh /><DashboardExport reportId="RPT-POINTS" target={ref} title="Points flow" /></span>} />
      <FilterBar applies={["date", "programme", "geo", "memberType", "category", "scheme"]} />
      <div ref={ref}>
        <div className="ana-tiles">
          <KpiTile label="Points issued" value={num(t.issued)} period={`${f.from} → ${f.to}`} status="data" detail="Lifetime-earning lines, gross of kitty TDS" />
          <KpiTile label="Points redeemed" value={num(t.redeemed)} period={`${f.from} → ${f.to}`} status="data" />
          <KpiTile label="Base points" value={num(t.base)} period="Scan and base credits" status="data" />
          <KpiTile label="Scheme points accrued" value={num(t.scheme)} period="Unsettled stage" status="data" />
          <KpiTile label="Bonus points" value={num(t.bonus)} period="Welcome and other bonuses" status="data" />
        </div>
        <Panel title="Earning stages" subtitle="Overlapping stages of the same earning: not a sum" actions={<Freshness domain="points" />}>
          <StatList items={[{ label: "Accrued (scheme, before settlement)", value: num(t.accrued) }, { label: "Credited to Available", value: num(t.credited) }, { label: "Unsettled (scheme bucket balance)", value: num(t.unsettled) }, { label: "Settled (released to Available)", value: num(t.settled) }, { label: "Available balance movement", value: num(t.available) }, { label: "Redeemed", value: num(t.redeemed) }]} />
        </Panel>
        <div className="grid-2">
          <Panel title="Daily earning and redemption"><TrendChart data={p.daily} kind="line" ariaLabel="Daily points issued and redeemed" series={[{ key: "issued", label: "Issued", color: "var(--vg-amber)" }, { key: "redeemed", label: "Redeemed", color: "var(--chart-neutral-1)" }]} /></Panel>
          <Panel title="Monthly trend"><TrendChart data={p.monthly} kind="bar" ariaLabel="Monthly points issued and redeemed" series={[{ key: "issued", label: "Issued", color: "var(--vg-amber)" }, { key: "redeemed", label: "Redeemed", color: "var(--chart-neutral-1)" }]} /></Panel>
        </div>
        <div className="grid-2">
          {([["By product category", p.byCategory], ["By scheme", p.byScheme], ["By programme", p.byProgramme], ["By member type", p.byMemberType]] as const).map(([title, rows]) => (
            <Panel key={title} title={title} padded={false}>
              <DataTable rows={grp(rows)} rowKey={(r) => r.key} caption={title} searchable={false} pageSize={8} columns={[{ key: "k", header: "Group", value: (r) => r.label }, { key: "i", header: "Issued", value: (r) => r.issued, align: "right" }, { key: "r", header: "Redeemed", value: (r) => r.redeemed, align: "right" }, { key: "u", header: "Unsettled", value: (r) => r.unsettled, align: "right" }]} />
            </Panel>
          ))}
        </div>
      </div>
      <Panel title="Ledger drill-down" subtitle="Ledger lines behind the figures" padded={false} actions={<ExportButtons reportId="RPT-POINTS" name="points-flow-ledger" cols={[{ header: "Member", value: (l: (typeof p.lines)[number]) => l.memberId }, { header: "Reference", value: (l) => l.ref }, { header: "Type", value: (l) => l.type }, { header: "Bucket", value: (l) => l.bucket }, { header: "Points", value: (l) => l.points }, { header: "Category", value: (l) => categoryName(c.ms, l.categoryId ?? null) }, { header: "Scheme", value: (l) => l.schemeId ?? "" }, { header: "Date", value: (l) => l.at }, { header: "Status", value: (l) => l.status }]} rows={p.lines} containsMembers />}>
        <DataTable rows={[...p.lines].reverse()} rowKey={(l) => l.id} caption="Ledger lines" columns={[
          { key: "m", header: "Member", value: (l) => l.memberId, render: (l) => memberLink(l.memberId) },
          { key: "r", header: "Transaction reference", value: (l) => l.ref, render: (l) => <Link to={`/wallet/ledger/${l.id}`} className="mono small">{l.ref}</Link> },
          { key: "t", header: "Point type", value: (l) => l.type.replace(/_/g, " ") },
          { key: "b", header: "Bucket", value: (l) => l.bucket.replace(/_/g, " ") },
          { key: "p", header: "Points", value: (l) => l.points, align: "right" },
          { key: "c", header: "Category", value: (l) => categoryName(c.ms, l.categoryId ?? null) },
          { key: "s", header: "Scheme", value: (l) => l.schemeId ?? "" },
          { key: "d", header: "Date", value: (l) => l.at, render: (l) => <span className="small">{dt(l.at)}</span> },
          { key: "st", header: "Ledger status", value: (l) => l.status },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Revenue impact ======================= */

export function RevenuePage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const r = revenueView(v.uid, f);
  if (!("cohorts" in r)) return <PolicyMessages result={r} />;
  return (
    <>
      <SectionTitle title="Revenue impact" description="SOW 13.3: extra sales linked to the loyalty programme, grouped by the month members joined, with month-on-month growth" />
      <FilterBar applies={["programme", "geo", "memberType"]} />
      <Notice tone="warn"><strong>Revenue attribution method — Business Confirmation Required</strong> (<DecisionRef id="OP-REV1" />). No sales source is connected and no attribution method is approved, so no revenue, uplift or growth figure is shown. Scanned product sales are not treated as incremental revenue.</Notice>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Join cohorts" subtitle="Members acquired per joining month (Member Management)" padded={false} actions={<Freshness domain="revenue" />}>
          <DataTable rows={r.cohorts} rowKey={(c) => c.cohort} caption="Join cohorts" searchable={false} pageSize={24} columns={[
            { key: "c", header: "Join month", value: (c) => c.cohort },
            { key: "m", header: "Members acquired", value: (c) => c.members, align: "right" },
            { key: "r", header: "Revenue linked", value: () => "", render: () => <span className="muted small">Not available</span> },
            { key: "g", header: "Month-on-month growth", value: () => "", render: () => <span className="muted small">Not available</span> },
          ]} />
        </Panel>
        <Panel title="Methodology record">
          <dl className="dl-grid small">
            <dt>Status</dt><dd><BcrTag /></dd>
            <dt>Sales / transaction source</dt><dd>Not connected</dd>
            <dt>Attribution method</dt><dd>Not approved</dd>
            <dt>Cohort definition</dt><dd>Month of registration submission (Member Management)</dd>
            <dt>Calculation version</dt><dd>None</dd>
          </dl>
        </Panel>
      </div>
    </>
  );
}

/* ======================= Fraud ======================= */

export function FraudAnalyticsPage() {
  const v = useAnalyticsView();
  const nav = useNavigate();
  const { engine: f } = useFilters();
  const ref = useRef<HTMLDivElement>(null);
  const r = fraudView(v.uid, f);
  if (!("live" in r)) return <PolicyMessages result={r} />;
  const heat = (rows: typeof r.byDistrict, title: string) => (
    <Panel title={title} subtitle="Flagged, investigating, confirmed, cleared and resolved are separate states" padded={false}>
      <DataTable rows={rows} rowKey={(x) => x.key} caption={title} searchable={false} pageSize={10} columns={[
        { key: "k", header: title.includes("district") ? "District" : "Product category", value: (x) => x.key },
        ...(["flagged", "investigating", "confirmed", "cleared", "resolved"] as const).map((s) => ({ key: s, header: s[0].toUpperCase() + s.slice(1), value: (x: (typeof rows)[number]) => x[s], align: "right" as const, render: (x: (typeof rows)[number]) => <span className={`ana-heat ana-heat--${Math.min(4, x[s])}`}>{x[s]}</span> })),
        { key: "t", header: "Total flags", value: (x) => x.total, align: "right" },
      ]} />
    </Panel>
  );
  return (
    <>
      <SectionTitle title="Fraud analytics" description="Read from Fraud & Risk (Phase 10): risk events, cases and restrictions. A flag is a signal for review, not confirmed fraud" actions={<span className="btn-row"><Link to="/governance/fraud/queue" className="btn btn--ghost btn--sm">Open review queue</Link><DashboardExport reportId="RPT-FRAUD" target={ref} title="Fraud analytics" /></span>} />
      <FilterBar applies={["date", "programme"]} note="Fraud events are filtered by detection date and programme" />
      <div ref={ref}>
        <div className="ana-tiles">
          <KpiTile label="Live risk alerts" value={num(r.live)} period="Flagged, not in a case" status="data" onSelect={() => nav("/governance/fraud/queue?status=new")} />
          <KpiTile label="Under investigation" value={num(r.investigating)} period="Open cases" status="data" onSelect={() => nav("/governance/fraud/cases?state=open")} />
          <KpiTile label="Confirmed fraud" value={num(r.confirmed)} period="Case decision" status="data" tone="warn" />
          <KpiTile label="Cleared" value={num(r.cleared)} period="No misuse" status="data" />
          <KpiTile label="Blocked accounts" value={num(r.blockedAccounts)} period="Program Block / Temporary Hold" status="data" onSelect={() => nav("/members/restrictions")} />
          <KpiTile label="Flagged transactions" value={num(r.flaggedTransactions)} period="Events linked to scans, redemptions or ledger" status="data" />
          <KpiTile label="Fraud detection rate" value="Not available" period="SOW 13.1" status="bcr" detail="Total incidents (incl. undetected) not supplied" />
          <KpiTile label="Amount saved" value="Not available" period="Finance" status="bcr" detail="Not supplied by Fraud & Risk or Finance" />
        </div>
        <div className="grid-2">{heat(r.byDistrict, "Risk by district")}{heat(r.byProduct, "Risk by product category")}</div>
      </div>
      <Panel title="Risk events" padded={false} actions={<Freshness domain="fraud" />}>
        <DataTable rows={r.events} rowKey={(x) => x.e.id} caption="Risk events" onRowClick={(x) => nav(x.e.caseId ? `/governance/fraud/cases/${x.e.caseId}` : `/governance/fraud/queue?event=${x.e.id}`)} columns={[
          { key: "id", header: "Event", value: (x) => x.e.id, render: (x) => <span className="mono small">{x.e.id}</span> },
          { key: "m", header: "Member", value: (x) => x.e.memberId ?? "", render: (x) => (x.e.memberId ? memberLink(x.e.memberId) : "—") },
          { key: "v", header: "Vector", value: (x) => x.e.vector.replace(/_/g, " ") },
          { key: "d", header: "Detected", value: (x) => x.e.detectedAt, render: (x) => <span className="small">{dt(x.e.detectedAt)}</span> },
          { key: "s", header: "State", value: (x) => x.s, render: (x) => <StatusBadge tone={x.s === "confirmed" ? "negative" : x.s === "cleared" || x.s === "resolved" ? "positive" : x.s === "investigating" ? "info" : "warning"}>{x.s}</StatusBadge> },
          { key: "c", header: "Case", value: (x) => x.e.caseId ?? "" },
          { key: "r", header: "Scan / redemption", value: (x) => [...x.e.links.scanRefs, ...x.e.links.redemptionRefs].join(", "), render: (x) => <span className="mono small">{[...x.e.links.scanRefs, ...x.e.links.redemptionRefs].join(", ") || "—"}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Scheme performance ======================= */

export function SchemePerformancePage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const r = schemeView(v.uid, f);
  if (!("rows" in r)) return <PolicyMessages result={r} />;
  type Row = (typeof r.rows)[number];
  const cols = [{ header: "Scheme", value: (x: Row) => x.id }, { header: "Name", value: (x: Row) => x.name }, { header: "Programmes", value: (x: Row) => x.programmes.join(" ") }, { header: "Period", value: (x: Row) => x.period }, { header: "Participants", value: (x: Row) => x.participants }, { header: "Eligible", value: (x: Row) => x.eligible ?? "Not computable" }, { header: "Average points per member", value: (x: Row) => (x.avgPoints == null ? "" : Math.round(x.avgPoints)) }, { header: "Points earned", value: (x: Row) => x.earned }, { header: "Points settled", value: (x: Row) => x.settled }, { header: "Budget", value: (x: Row) => x.budget ?? "Not set" }, { header: "Exposure", value: (x: Row) => x.exposure }, { header: "Liability", value: () => "Pending business formula" }, { header: "Return on spend", value: () => "Business confirmation required" }, { header: "Acquisition cost", value: () => "Business confirmation required" }, { header: "Status", value: (x: Row) => x.status }];
  return (
    <>
      <SectionTitle title="Scheme performance scorecard" description="Consolidated from Scheme & Incentive Management (Phase 6): participation, points, budget and exposure from the scheme engine. Liability uses the scheme module's projection service, which has no approved formula" actions={<ExportButtons reportId="RPT-SCHEME" name="scheme-scorecard" cols={cols} rows={r.rows} />} />
      <FilterBar applies={["programme", "scheme"]} />
      <Notice tone="warn">Return on spend, scheme-attributed acquisition cost, incremental revenue and projected liability have no approved formula: they show <strong>Business confirmation required</strong> rather than a figure.</Notice>
      <Panel padded={false} actions={<Freshness domain="schemes" />}>
        <DataTable rows={r.rows} rowKey={(x) => x.id} caption="Scheme scorecard" columns={[
          { key: "n", header: "Scheme", value: (x) => x.name, render: (x) => <span><Link to={`/schemes/scheme/${x.id}`}><strong>{x.name}</strong></Link><br /><span className="mono small muted">{x.id}</span></span> },
          { key: "p", header: "Programmes", value: (x) => x.programmes.join(" ") },
          { key: "d", header: "Active period", value: (x) => x.period, render: (x) => <span className="small">{x.period}</span> },
          { key: "pt", header: "Participants", value: (x) => x.participants, align: "right" },
          { key: "el", header: "Eligible", value: (x) => x.eligible ?? -1, render: (x) => (x.eligible == null ? <span className="muted small">Not computable</span> : x.eligible), align: "right" },
          { key: "q", header: "Qualified", value: () => "", render: () => <span className="muted small">Not supplied</span> },
          { key: "a", header: "Avg points / member", value: (x) => x.avgPoints ?? -1, render: (x) => (x.avgPoints == null ? "—" : Math.round(x.avgPoints)), align: "right" },
          { key: "e", header: "Earned", value: (x) => x.earned, align: "right" },
          { key: "s", header: "Settled", value: (x) => x.settled, align: "right" },
          { key: "b", header: "Budget", value: (x) => x.budget ?? -1, render: (x) => (x.budget == null ? <span className="muted small">Not set</span> : num(x.budget)), align: "right" },
          { key: "x", header: "Exposure", value: (x) => x.exposure, align: "right" },
          { key: "l", header: "Liability", value: () => "", render: () => <BcrTag>Pending formula</BcrTag> },
          { key: "ros", header: "Return on spend", value: () => "", render: () => <BcrTag>Not approved</BcrTag> },
          { key: "st", header: "Status", value: (x) => x.status },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Channels ======================= */

export function ChannelPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const ref = useRef<HTMLDivElement>(null);
  const r = channelView(v.uid, f);
  if (!("channels" in r)) return <PolicyMessages result={r} />;
  const breakdown = (title: string, rows: typeof r.byProgramme) => (
    <Panel title={title} padded={false}>
      <DataTable rows={rows} rowKey={(x) => x.key} caption={title} searchable={false} pageSize={8} columns={[{ key: "k", header: "Group", value: (x) => x.key }, ...r.channels.map((c) => ({ key: c.key, header: c.label, value: (x: (typeof rows)[number]) => x.rows.find((y) => y.key === c.key)?.pointsEarned ?? 0, align: "right" as const }))]} />
    </Panel>
  );
  return (
    <>
      <SectionTitle title="Channel performance" description="Points earned and scan transactions by the channel the scan service recorded (App, Web, POS). A scan without a recorded channel is Unknown / unmapped: it is never assigned to App" actions={<DashboardExport reportId="RPT-OVERVIEW" target={ref} title="Channel performance" />} />
      <FilterBar applies={["date", "programme", "geo", "memberType", "category"]} />
      <div ref={ref}>
        <div className="ana-tiles">
          {r.channels.map((c) => <KpiTile key={c.key} label={c.label} value={num(c.pointsEarned)} period="Points earned (Scan-Out)" status="data" detail={`${c.transactions} scans · ${c.successful} successful`} tone={c.key === "unmapped" ? "warn" : undefined} />)}
        </div>
        <div className="grid-2 grid-2--wide-left">
          <Panel title="Daily points earned by channel" actions={<Freshness domain="scans" />}>
            <TrendChart data={r.daily as never} kind="stacked" ariaLabel="Daily points by channel" series={[{ key: "app", label: "App", color: "var(--vg-amber)" }, { key: "web", label: "Web", color: "var(--chart-neutral-1)" }, { key: "pos", label: "POS", color: "var(--vg-charcoal)" }, { key: "unmapped", label: "Unmapped", color: "var(--chart-neutral-2)" }]} />
          </Panel>
          <Panel title="Points redeemed by channel">
            <StatList items={r.redeemedByChannel.map((x) => ({ label: x.label, value: num(x.points), note: `${x.count} redemptions · ${x.note}` }))} />
          </Panel>
        </div>
        <div className="grid-3">{breakdown("By programme", r.byProgramme)}{breakdown("By member type", r.byMemberType)}{breakdown("By product category", r.byCategory)}</div>
      </div>
      <p className="small"><Link to={`${ABASE}/scans?tab=out`}>Open the Scan-Out records behind these figures</Link></p>
    </>
  );
}

/* ======================= Geography ======================= */

export function GeographyPage() {
  const v = useAnalyticsView();
  const { engine: f, set, f: fs } = useFilters();
  const [metric, setMetric] = useState<"active" | "scans" | "redemptions">("active");
  const level = fs.district ? "branch" : fs.state ? "district" : "state";
  const r = geoView(v.uid, f, level);
  if (!("rows" in r)) return <PolicyMessages result={r} />;
  const max = Math.max(1, ...r.rows.map((x) => x[metric]));
  return (
    <>
      <SectionTitle title="Geographic analytics" description="Active members, scans and redemptions by state, district and branch from the Branch & Hierarchy master. Click a tile to drill down; no coordinates are inferred and member-level locations are not shown here" actions={<Segmented label="Measure" value={metric} onChange={setMetric} options={[{ value: "active", label: "Active members" }, { value: "scans", label: "Scans" }, { value: "redemptions", label: "Redemptions" }]} />} />
      <FilterBar applies={["date", "programme", "geo", "memberType"]} note={`Showing ${level}s`} />
      <Panel title={`${metric === "active" ? "Active member" : metric === "scans" ? "Scan" : "Redemption"} density by ${level}`} actions={<Freshness domain="geography" />}>
        <div className="ana-geo">
          {r.rows.map((x) => (
            <button key={x.key} type="button" className="ana-geo__tile" style={{ ["--heat" as string]: String(x[metric] / max) }} disabled={level === "branch"} onClick={() => (level === "state" ? set({ state: x.key }) : set({ district: x.key }))}>
              <span className="ana-geo__name">{x.name}</span>
              <span className="ana-geo__value num">{num(x[metric])}</span>
              <span className="ana-geo__sub">{x.members} members</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel padded={false} title={`By ${level}`}>
        <DataTable rows={r.rows} rowKey={(x) => x.key} caption="Geographic breakdown" searchable={false} columns={[
          { key: "n", header: level[0].toUpperCase() + level.slice(1), value: (x) => x.name },
          { key: "m", header: "Members", value: (x) => x.members, align: "right" },
          { key: "a", header: "Active members", value: (x) => x.active, align: "right" },
          { key: "s", header: "Scans", value: (x) => x.scans, align: "right" },
          { key: "r", header: "Redemptions", value: (x) => x.redemptions, align: "right" },
          { key: "p", header: "Programme mix", value: (x) => Object.entries(x.programmes).map(([k, n]) => `${k} ${n}`).join(", "), render: (x) => <span className="small">{Object.entries(x.programmes).map(([k, n]) => `${k} ${n}`).join(" · ")}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Tiers ======================= */

export function TierPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const r = tierView(v.uid, f);
  if (!("tiers" in r)) return <PolicyMessages result={r} />;
  return (
    <>
      <SectionTitle title="Tier distribution" description="Members per tier and tier movement from the Tier service snapshots (Phase 6 Tier Master). Tier names and qualification rules come from the Tier Master; nothing is hardcoded" />
      <FilterBar applies={["programme", "geo"]} note="Tier snapshots cover the last 30 days" />
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title="Tiers" actions={<Freshness domain="tiers" />}>
          <DataTable rows={r.tiers} rowKey={(t) => t.id} caption="Tiers" searchable={false} columns={[
            { key: "p", header: "Programme", value: (t) => t.programme },
            { key: "n", header: "Tier", value: (t) => t.name },
            { key: "m", header: "Members", value: (t) => t.members, align: "right" },
            { key: "s", header: "Share", value: (t) => t.share ?? -1, render: (t) => pct(t.share), align: "right" },
            { key: "u", header: "Upgrades (30 d)", value: (t) => t.upgrades, align: "right" },
            { key: "d", header: "Downgrades (30 d)", value: (t) => t.downgrades, align: "right" },
            { key: "nn", header: "Near next tier", value: (t) => t.nearNext, align: "right" },
          ]} />
        </Panel>
        <Panel title="Members per tier"><RankedBars items={r.tiers.map((t) => ({ key: t.id, label: `${t.programme} ${t.name}`, value: t.members }))} /></Panel>
      </div>
      <Notice tone="info">{r.note}. Use <Link to="/schemes/tiers">Tiers in Schemes & incentives</Link> for qualification rules.</Notice>
      <Panel padded={false} title="By branch">
        <DataTable rows={r.byBranch} rowKey={(s) => `${s.tierId}-${s.branchCode}`} caption="Tier snapshots by branch" columns={[
          { key: "b", header: "Branch", value: (s) => s.branchCode, render: (s) => <span className="mono small">{s.branchCode}</span> },
          { key: "t", header: "Tier", value: (s) => r.tiers.find((t) => t.id === s.tierId)?.name ?? s.tierId },
          { key: "p", header: "Programme", value: (s) => s.programme },
          { key: "m", header: "Members", value: (s) => s.members, align: "right" },
          { key: "u", header: "Upgrades", value: (s) => s.upgrades30d, align: "right" },
          { key: "d", header: "Downgrades", value: (s) => s.downgrades30d, align: "right" },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Support ======================= */

export function SupportPage() {
  const v = useAnalyticsView();
  const nav = useNavigate();
  const { engine: f } = useFilters();
  const [type, setType] = useState("");
  const [prio, setPrio] = useState("");
  const [status, setStatus] = useState("");
  const r = supportView(v.uid, f);
  if (!("queries" in r)) return <PolicyMessages result={r} />;
  const qs = r.queries.filter((q) => (!type || q.category === type) && (!prio || q.priority === prio) && (!status || q.status === status));
  const days = [...new Set(r.queries.filter((q) => q.resolvedAt).map((q) => q.resolvedAt!.slice(0, 10)))].sort();
  return (
    <>
      <SectionTitle title="Support queue" description="Ticket volume, resolution time and satisfaction from the Helpdesk (Phase 8). Clicking a figure opens the Helpdesk queue" actions={<Link to="/masters/communication/helpdesk" className="btn btn--ghost btn--sm">Open Helpdesk</Link>} />
      <FilterBar applies={["date", "programme", "geo"]} />
      <div className="ana-tiles">
        <KpiTile label="Total tickets" value={num(r.total)} period={`${f.from} → ${f.to}`} status="data" onSelect={() => nav("/masters/communication/helpdesk")} />
        <KpiTile label="Open" value={num(r.open)} period="Open or reopened" status="data" />
        <KpiTile label="In progress" value={num(r.inProgress)} period="Assigned, awaiting member, escalated" status="data" />
        <KpiTile label="Resolved" value={num(r.resolved)} period="In period" status="data" />
        <KpiTile label="Overdue" value={num(r.overdue)} period="Past the development SLA" status="data" tone="warn" />
        <KpiTile label="Average resolution" value={r.avgResolutionHours == null ? "Not available" : `${r.avgResolutionHours} h`} period="Resolved tickets" status="data" />
        <KpiTile label="Satisfaction" value="Not available" period="By issue type" status="bcr" detail="No satisfaction responses are recorded" />
      </div>
      <div className="grid-2">
        <Panel title="Ticket volume by type" actions={<Freshness domain="support" />} padded={false}>
          <DataTable rows={r.byType} rowKey={(t) => t.type} caption="Tickets by type" searchable={false} onRowClick={(t) => setType(t.type)} columns={[{ key: "t", header: "Issue type", value: (t) => t.type }, { key: "c", header: "Tickets", value: (t) => t.count, align: "right" }, { key: "s", header: "Satisfaction", value: () => "", render: () => <span className="muted small">Not available</span> }]} />
        </Panel>
        <Panel title="Resolutions by day"><TrendChart data={days.map((d) => ({ key: d, label: d.slice(5), resolved: r.queries.filter((q) => q.resolvedAt?.startsWith(d)).length }))} kind="bar" ariaLabel="Resolved tickets by day" series={[{ key: "resolved", label: "Resolved", color: "var(--chart-neutral-1)" }]} /></Panel>
      </div>
      <Panel padded={false} title="Tickets" actions={<span className="btn-row">
        <SelectInput label="Type" value={type} onChange={setType} options={[{ value: "", label: "All types" }, ...r.byType.map((t) => ({ value: t.type, label: t.type }))]} />
        <SelectInput label="Priority" value={prio} onChange={setPrio} options={[{ value: "", label: "All" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
        <SelectInput label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, ...["open", "assigned", "awaiting_member", "escalated", "resolved", "reopened"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))]} />
      </span>}>
        <DataTable rows={qs} rowKey={(q) => q.id} caption="Helpdesk tickets" onRowClick={() => nav("/masters/communication/helpdesk")} columns={[
          { key: "id", header: "Ticket", value: (q) => q.id, render: (q) => <span className="mono small">{q.id}</span> },
          { key: "m", header: "Member", value: (q) => q.memberId, render: (q) => memberLink(q.memberId) },
          { key: "c", header: "Type", value: (q) => q.category },
          { key: "p", header: "Priority", value: (q) => q.priority },
          { key: "t", header: "Assigned", value: (q) => q.agentId ?? "", render: (q) => (q.agentId ? v.acc.users.find((u) => u.id === q.agentId)?.firstName ?? q.agentId : "—") },
          { key: "r", header: "Received", value: (q) => q.receivedAt, render: (q) => <span className="small">{dt(q.receivedAt)}</span> },
          { key: "s", header: "Status", value: (q) => q.status },
          { key: "res", header: "Resolved", value: (q) => q.resolvedAt ?? "", render: (q) => <span className="small">{dt(q.resolvedAt)}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Retention ======================= */

export function RetentionPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const r = retentionView(v.uid, f);
  if (!("matrix" in r)) return <PolicyMessages result={r} />;
  const cell = (x: number | null) => (x == null ? <span className="muted small">Not yet available</span> : <span className={`ana-heat ana-heat--${Math.min(4, Math.round(x * 4))}`}>{pct(x)}</span>);
  const k = kpiValues(v.uid, f.to, f)["KPI-CHURN"];
  const cur = r.churn[r.churn.length - 1];
  const members = context().members;
  return (
    <>
      <SectionTitle title="Retention & churn" description="Members who stay active 30, 60 and 90 days after joining, by joining cohort, and the 30-day churn rate from the KPI dictionary. A cohort is evaluated only once every member has had the full window" />
      <FilterBar applies={["programme", "geo", "memberType"]} note="Retention is evaluated to today" />
      <div className="ana-tiles">
        <KpiTile label="Churn rate (30-day)" value={k.value == null ? "Not available" : `${k.value.toFixed(1)}%`} period={`Month of ${cur.month}`} detail={k.detail} />
        <KpiTile label="Previous month active" value={num(cur.previousActive)} period={`Base for ${cur.month}`} status="data" />
        <KpiTile label="Went inactive" value={num(cur.churned)} period={cur.incomplete ? "Month in progress" : "Full month"} status="data" tone={cur.incomplete ? "warn" : undefined} />
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Cohort retention matrix" subtitle="Share of the cohort with an active day (2+ actions) in days 1–30, 31–60 and 61–90 after joining" padded={false} actions={<Freshness domain="activity" />}>
          <DataTable rows={r.matrix} rowKey={(m) => m.cohort} caption="Retention matrix" searchable={false} pageSize={24} columns={[
            { key: "c", header: "Join month", value: (m) => m.cohort },
            { key: "n", header: "New members", value: (m) => m.members, align: "right" },
            { key: "30", header: "30-day", value: (m) => m.d30 ?? -1, render: (m) => cell(m.d30), align: "right" },
            { key: "60", header: "60-day", value: (m) => m.d60 ?? -1, render: (m) => cell(m.d60), align: "right" },
            { key: "90", header: "90-day", value: (m) => m.d90 ?? -1, render: (m) => cell(m.d90), align: "right" },
          ]} />
        </Panel>
        <Panel title="Churn rate by month" subtitle="Inactive this month ÷ active last month">
          <TrendChart data={r.churn.map((c) => ({ key: c.month, label: c.month, rate: c.rate == null ? 0 : Math.round(c.rate * 1000) / 10 }))} kind="line" ariaLabel="Monthly churn rate" valueFormat={(n) => `${n}%`} series={[{ key: "rate", label: "Churn %", color: "var(--vg-amber)" }]} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Churn by programme" padded={false}><DataTable rows={r.churnByProgramme} rowKey={(x) => x.key} caption="Churn by programme" searchable={false} columns={[{ key: "k", header: "Programme", value: (x) => x.key }, { key: "p", header: "Previous active", value: (x) => x.previousActive, align: "right" }, { key: "c", header: "Went inactive", value: (x) => x.churned, align: "right" }, { key: "r", header: "Churn", value: (x) => x.rate ?? -1, render: (x) => pct(x.rate), align: "right" }]} /></Panel>
        <Panel title="Churn by state" padded={false}><DataTable rows={r.churnByState} rowKey={(x) => x.key} caption="Churn by state" searchable={false} columns={[{ key: "k", header: "State", value: (x) => x.key }, { key: "p", header: "Previous active", value: (x) => x.previousActive, align: "right" }, { key: "c", header: "Went inactive", value: (x) => x.churned, align: "right" }, { key: "r", header: "Churn", value: (x) => x.rate ?? -1, render: (x) => pct(x.rate), align: "right" }]} /></Panel>
      </div>
      <MemberDrill rows={members.filter((m) => cur.churnedIds.includes(m.id)).map((m) => ({ id: m.id, name: m.name, programme: m.programme, joined: m.registration.submittedAt.slice(0, 10), branch: m.branchCode, lastLogin: m.registration.firstLoginAt, lastActivity: null }))} reportId="RPT-RETENTION" title={`Members who went inactive in ${cur.month}`} />
    </>
  );
}

/* ======================= Acquisition ======================= */

export function AcquisitionPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const r = acquisitionView(v.uid, f);
  if (!("newMembers" in r)) return <PolicyMessages result={r} />;
  return (
    <>
      <SectionTitle title="Acquisition cost" description="Marketing spend against new members gained, cost per channel and payback forecast (SOW 13.3). New members come from Member Management; acquisition channels are the registration sources the platform records" />
      <FilterBar applies={["date", "programme", "geo", "memberType"]} />
      <Notice tone="warn">Marketing spend is not supplied by any connected source and there is no approved acquisition channel master or forecasting method (<DecisionRef id="OP-CAC1" />). CAC and payback show <strong>Not available</strong>.</Notice>
      <div className="ana-tiles">
        <KpiTile label="New members acquired" value={num(r.newMembers)} period={`${f.from} → ${f.to}`} status="data" />
        <KpiTile label="Marketing spend" value="Not available" period="Selected period" status="bcr" />
        <KpiTile label="Customer acquisition cost" value="Not available" period="Spend ÷ new members" status="bcr" />
        <KpiTile label="Payback forecast" value="Not available" period="Months to recover CAC" status="bcr" />
      </div>
      <div className="grid-2">
        <Panel title="New members by acquisition source" actions={<Freshness domain="members" />}><RankedBars items={r.bySource.map((x) => ({ key: x.key, label: x.label.replace(/_/g, " "), value: x.value }))} /></Panel>
        <Panel title="New members by programme"><RankedBars items={r.byProgramme.map((x) => ({ key: x.key, label: x.label, value: x.value }))} /></Panel>
        <Panel title="New members by region"><RankedBars items={r.byRegion.map((x) => ({ key: x.key, label: x.label, value: x.value }))} /></Panel>
        <Panel title="Join cohorts"><RankedBars items={r.byCohort.map((x) => ({ key: x.key, label: x.label, value: x.value }))} /></Panel>
      </div>
    </>
  );
}

/* ======================= Redemption by product ======================= */

export function RedemptionProductPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const { result, run } = useRun();
  const [days, setDays] = useState(v.as.config.slowMovingDays == null ? "" : String(v.as.config.slowMovingDays));
  const r = redemptionView(v.uid, f);
  if (!("items" in r)) return <PolicyMessages result={r} />;
  const giftCat = (id: string) => context().gs.categories.find((c) => c.id === id)?.name ?? id;
  const matrix = (m: Map<string, Map<string, number>>) => [...m.entries()].map(([k, inner]) => ({ key: k, cells: Object.fromEntries(inner) }));
  const cats = [...new Set(r.orders.map((o) => context().gs.items.find((i) => i.id === o.giftId)?.categoryId ?? "—"))];
  return (
    <>
      <SectionTitle title="Redemption by product" description="Most redeemed gifts and categories, slow-moving stock and which member types redeem what — from Gift & Fulfilment orders, gift inventory and Phase 7 redemptions. Patterns only: no suitability score or recommendation is generated" />
      <FilterBar applies={["date", "programme", "geo", "memberType"]} />
      <div className="grid-2">
        <Panel title="Redemptions by method" padded={false} actions={<Freshness domain="redemption" />}>
          <DataTable rows={r.methods} rowKey={(x) => x.method} caption="Redemptions by method" searchable={false} columns={[{ key: "m", header: "Method", value: (x) => x.method }, { key: "c", header: "Redemptions", value: (x) => x.count, align: "right" }, { key: "p", header: "Points used", value: (x) => x.points, align: "right" }, { key: "v", header: "Value", value: (x) => x.valueInr, render: (x) => inr(x.valueInr), align: "right" }]} />
        </Panel>
        <Panel title="Most redeemed gifts"><RankedBars items={r.items.filter((i) => i.redemptions).slice(0, 8).map((i) => ({ key: i.id, label: i.name, value: i.redemptions }))} /></Panel>
      </div>
      <PolicyMessages result={result} />
      <Panel padded={false} title="Gift items and stock" subtitle={r.slowThreshold == null ? "Slow-moving threshold not set (OP-SLOW1): items are not classified" : `Slow-moving: no redemption for over ${r.slowThreshold} days (development setting)`} actions={v.can("kpi-governance:manage") && <span className="btn-row"><TextField label="Slow-moving after (days)" value={days} onChange={setDays} inputMode="numeric" /><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setAnalyticsConfig(v.uid, "slowMovingDays", days.trim() ? Number(days) : null), "Threshold recorded")}>Save</button></span>}>
        <DataTable rows={r.items} rowKey={(i) => i.id} caption="Gift items" columns={[
          { key: "n", header: "Gift item", value: (i) => i.name },
          { key: "c", header: "Category", value: (i) => giftCat(i.categoryId) },
          { key: "t", header: "Type", value: (i) => i.type },
          { key: "s", header: "Available stock", value: (i) => i.stock ?? -1, render: (i) => (i.stock == null ? <span className="muted small">{i.stockSource === "not_supplied" ? "Not supplied" : "—"}</span> : num(i.stock)), align: "right" },
          { key: "r", header: "Redemptions (period)", value: (i) => i.redemptions, align: "right" },
          { key: "p", header: "Points used", value: (i) => i.points, align: "right" },
          { key: "l", header: "Last redemption", value: (i) => i.last ?? "", render: (i) => <span className="small">{dt(i.last)}</span> },
          { key: "sl", header: "Slow-moving", value: (i) => String(i.slow), render: (i) => (i.slow == null ? <span className="muted small">Not classified</span> : i.slow ? <StatusBadge tone="warning">Slow-moving</StatusBadge> : "No") },
        ]} />
      </Panel>
      <div className="grid-2">
        {([["Gift categories by member type", r.byMemberType], ["Gift categories by programme", r.byProgramme]] as const).map(([title, m]) => (
          <Panel key={title} title={title} padded={false}>
            <DataTable rows={matrix(m)} rowKey={(x) => x.key} caption={title} searchable={false} columns={[{ key: "k", header: "Group", value: (x) => x.key }, ...cats.map((c) => ({ key: c, header: giftCat(c), value: (x: { cells: Record<string, number> }) => x.cells[c] ?? 0, align: "right" as const }))]} />
          </Panel>
        ))}
      </div>
    </>
  );
}

/* ======================= Segmentation ======================= */

export function SegmentationPage() {
  const v = useAnalyticsView();
  const { engine: f } = useFilters();
  const { result, run } = useRun();
  const [y, setY] = useState(v.as.config.churnedDays == null ? "" : String(v.as.config.churnedDays));
  const [seg, setSeg] = useState("");
  const r = segmentationView(v.uid, f);
  if (!("rows" in r)) return <PolicyMessages result={r} />;
  const SEGS = ["active", "dormant", "churned", "never_logged_in", "not_classified"] as const;
  const all = r.rows;
  const by = (key: (x: (typeof all)[number]) => string) => { const ks = [...new Set(all.map(key))].sort(); return ks.map((k) => ({ key: k, ...Object.fromEntries(SEGS.map((s) => [s, all.filter((x) => key(x) === k && x.segment === s).length])) })) as ({ key: string } & Record<(typeof SEGS)[number], number>)[]; };
  const table = (title: string, rows: ReturnType<typeof by>) => (
    <Panel title={title} padded={false}>
      <DataTable rows={rows} rowKey={(x) => x.key} caption={title} searchable={false} pageSize={8} columns={[{ key: "k", header: "Group", value: (x) => x.key }, ...SEGS.map((s) => ({ key: s, header: s.replace(/_/g, " "), value: (x: (typeof rows)[number]) => x[s], align: "right" as const }))]} />
    </Panel>
  );
  const shown = r.rows.filter((x) => !seg || x.segment === seg);
  return (
    <>
      <SectionTitle title="Member segmentation" description="Active, dormant and churned members. Classification uses one rule for every view: days since the last login (the Adoption monitoring basis, SOW 10.11), with Dormant after X days (OP-DORM, shared with Integration monitoring → Adoption) and Churned after Y days (OP-SEG1)" />
      <FilterBar applies={["programme", "geo", "memberType"]} />
      {!r.classified && <Notice tone="warn">Members are <strong>not classified</strong> until both thresholds are set and Y is greater than X. X = {r.thresholds.dormantDays ?? "not set"} (set in <Link to="/monitoring/integrations/adoption">Adoption</Link>), Y = {r.thresholds.churnedDays ?? "not set"} (<DecisionRef id="OP-SEG1" />).</Notice>}
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        {SEGS.map((s) => <KpiTile key={s} label={s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} value={num(r.rows.filter((x) => x.segment === s).length)} period={`${pct(r.rows.length ? r.rows.filter((x) => x.segment === s).length / r.rows.length : null)} of enrolled members`} status="data" onSelect={() => setSeg(s)} />)}
      </div>
      {v.can("kpi-governance:manage") && (
        <Panel title="Churned threshold (Y days)" actions={<BcrTag>OP-SEG1 open</BcrTag>}>
          <div className="form-grid"><TextField label="Days without login before Churned" value={y} onChange={setY} inputMode="numeric" hint="Development setting until V-Guard confirms" /><div><button type="button" className="btn btn--primary btn--sm" onClick={() => run(setAnalyticsConfig(v.uid, "churnedDays", y.trim() ? Number(y) : null), "Threshold recorded")}>Save</button></div></div>
        </Panel>
      )}
      <div className="grid-3">{table("By programme", by((x) => x.member.programme))}{table("By region", by((x) => geoOf(x.member.branchCode).stateName))}{table("By join cohort", by((x) => x.member.registration.submittedAt.slice(0, 7)))}</div>
      {table("By branch", by((x) => x.member.branchCode))}
      <MemberDrill rows={shown.map((x) => ({ id: x.member.id, name: x.member.name, programme: x.member.programme, joined: x.member.registration.submittedAt.slice(0, 10), branch: x.member.branchCode, lastLogin: x.lastLogin, lastActivity: x.segment }))} reportId="RPT-SEGMENT" title={seg ? `Segment: ${seg.replace(/_/g, " ")}` : "All enrolled members"} />
    </>
  );
}

