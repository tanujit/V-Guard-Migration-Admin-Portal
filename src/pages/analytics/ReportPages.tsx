import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextField } from "@/components/form/Form";
import { GEOGRAPHY } from "@/config/geography";
import { CHANNEL_LABEL, REPORTS } from "@/config/analyticsCatalogue";
import { hasPermission } from "@/features/access/engine";
import { context, member360, member360List, parentChildReport, pointsAgeingReport, programmeReport, salesExecMembers, scanDetail, scanReport, tdsLiabilityReport } from "@/features/analytics/store";
import { categoryName, channelKey, channelLabel, day, geoOf, scanSuccess, type ScanFilter } from "@/features/analytics/engine";
import { analyticsApi } from "@/services/analyticsApi";
import { SectionTitle, PolicyMessages } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, ExportButtons, FilterBar, Freshness, KpiTile, dt, inr, num, pct, useAnalyticsView, useFilters, useParam, type Col } from "./shared";

const memberLink = (id: string) => <Link to={`/members/member/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>;
const maskMobile = (m: string) => `••••••${m.replace(/\D/g, "").slice(-4)}`;

/* ======================= Member 360 analytics ======================= */

export function Member360AnalyticsPage() {
  const v = useAnalyticsView();
  const [tab, setTab] = useParam("tab", "members");
  return (
    <>
      <SectionTitle title="Member 360 analytics" description="The reporting view for one member (SOW 13.4): points, activity, TDS by financial year, registration and approval, the three addresses and the complete change history. Member 360 itself stays in Member Management" />
      <Tabs label="Member 360 sections" value={tab} onChange={setTab} tabs={[{ id: "members", label: "Members" }, { id: "coverage", label: "Member app analytics coverage" }]} />
      {tab === "members" ? <Member360Members uid={v.uid} canExport={v.can("member-analytics:export")} /> : <MemberAppCoverage />}
    </>
  );
}

function Member360Members({ uid }: { uid: string; canExport: boolean }) {
  const [role, setRole] = useParam("role", "");
  const [branch, setBranch] = useParam("branch", "");
  const [district, setDistrict] = useParam("district", "");
  const [sr, setSr] = useParam("sr", "");
  const [prog, setProg] = useParam("programme", "");
  const [sel, setSel] = useParam("member", "");
  const all = member360List(uid, {});
  const rows = member360List(uid, { role: role || undefined, branch: branch || undefined, district: district || undefined, salesRep: sr || undefined, programme: prog || undefined });
  const opt = (xs: string[], all: string) => [{ value: "", label: all }, ...[...new Set(xs)].sort().map((x) => ({ value: x, label: x }))];
  const ctx = context();
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { header: "Member ID", value: (m) => m.id }, { header: "Name", value: (m) => m.name }, { header: "Programme", value: (m) => m.programme }, { header: "Role", value: (m) => m.memberType },
    { header: "Mobile (masked)", value: (m) => maskMobile(m.mobile) }, { header: "Branch", value: (m) => m.branchCode }, { header: "District", value: (m) => geoOf(m.branchCode).districtName }, { header: "Sales rep", value: (m) => m.sr ?? "" },
    { header: "Status", value: (m) => m.status }, { header: "Registered", value: (m) => m.registration.submittedAt },
  ];
  const d = sel ? member360(uid, sel) : null;
  return (
    <>
      <Panel>
        <div className="form-grid">
          <SelectInput label="Role" value={role} onChange={setRole} options={opt(all.map((m) => m.memberType), "All roles")} />
          <SelectInput label="District" value={district} onChange={setDistrict} options={[{ value: "", label: "All districts" }, ...[...new Set(all.map((m) => geoOf(m.branchCode).district))].sort().map((x) => ({ value: x, label: `${geoOf(all.find((m) => geoOf(m.branchCode).district === x)!.branchCode).districtName} (${x})` }))]} />
          <SelectInput label="Branch" value={branch} onChange={setBranch} options={opt(all.map((m) => m.branchCode), "All branches")} />
          <SelectInput label="Sales rep" value={sr} onChange={setSr} options={opt(all.map((m) => m.sr ?? "").filter(Boolean), "All sales reps")} />
          <SelectInput label="Programme" value={prog} onChange={setProg} options={opt(all.map((m) => m.programme), "All programmes")} />
        </div>
      </Panel>
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title={`${rows.length} members`} subtitle="In your programme and geography scope" actions={<ExportButtons reportId="RPT-M360" name="member-360" cols={cols} rows={rows} extra={{ role: role || null, branch: branch || null, district: district || null, salesRep: sr || null, programme: prog || null }} containsMembers />}>
          <DataTable rows={rows} rowKey={(m) => m.id} caption="Members" onRowClick={(m) => setSel(m.id)} columns={[
            { key: "id", header: "Member", value: (m) => m.id, render: (m) => <span className="mono small">{m.id}</span> },
            { key: "n", header: "Name", value: (m) => m.name },
            { key: "p", header: "Programme", value: (m) => m.programme },
            { key: "r", header: "Role", value: (m) => m.memberType },
            { key: "b", header: "Branch", value: (m) => m.branchCode, render: (m) => <span className="mono small">{m.branchCode}</span> },
            { key: "s", header: "Sales rep", value: (m) => m.sr ?? "", render: (m) => <span className="small">{m.sr ?? "—"}</span> },
          ]} />
        </Panel>
        {!d ? <Panel title="Member detail"><p className="muted small">Select a member. Opening a member is recorded in the analytics audit</p></Panel> : "denied" in d ? <PolicyMessages result={d} /> : (
          <div>
            <Panel title={`${d.member.name} · ${d.member.id}`} subtitle={`${d.member.programme} · ${d.member.memberType}`} actions={<Link to={`/members/member/${d.member.id}`} className="btn btn--ghost btn--sm">Open Member 360</Link>}>
              <div className="ana-tiles ana-tiles--compact">
                <KpiTile label="Lifetime points earned" value={num(d.points.lifetimeEarned)} period="Wallet & Ledger" status="data" />
                <KpiTile label="Lifetime points redeemed" value={num(d.points.lifetimeRedeemed)} period="Wallet & Ledger" status="data" />
                <KpiTile label="Available balance" value={num(d.points.available)} period={`As of ${dt(d.sourceTimestamp)}`} status="data" />
              </div>
              <dl className="dl-grid small">
                <dt>Last scan</dt><dd>{dt(d.lastScan)}</dd>
                <dt>Last redemption</dt><dd>{dt(d.lastRedemption)}</dd>
                <dt>Branch mapping</dt><dd>{d.mapping.branch} · {d.mapping.district}</dd>
                <dt>Sales rep</dt><dd>{d.mapping.salesRep ?? "—"}</dd>
                <dt>Registered by</dt><dd>{d.mapping.registeredBy} · {dt(d.mapping.registeredAt)}</dd>
                <dt>Approved by</dt><dd>{d.mapping.approvedBy ? `${d.mapping.approvedBy} · ${dt(d.mapping.approvedAt)}` : "Not approved yet"}</dd>
              </dl>
            </Panel>
            <Panel title="TDS by financial year" subtitle="TDS paid and TDS Kitty are separate">
              {d.tds.length ? (
                <DataTable rows={d.tds} rowKey={(t) => t.fy} caption="TDS by FY" searchable={false} columns={[{ key: "fy", header: "Financial year", value: (t) => t.fy }, { key: "p", header: "TDS paid (₹, redemption)", value: (t) => t.paidInr, render: (t) => inr(t.paidInr), align: "right" }, { key: "pp", header: "TDS paid (points)", value: (t) => t.paidPoints, align: "right" }, { key: "k", header: "TDS Kitty (points held)", value: (t) => t.kittyPoints, align: "right" }]} />
              ) : <p className="muted small">No TDS recorded for this member</p>}
            </Panel>
            <Panel title="Addresses" subtitle="Three separate addresses, never merged">
              {d.addresses.map((a) => <div key={a.kind} className="ana-addr"><strong>{a.label}</strong><span className="small">{a.address ? `${a.address.line}, ${a.address.district}, ${a.address.state} ${a.address.pincode}` : "Not captured"}</span><span className="muted small">Updated {dt(a.updatedAt)}</span></div>)}
            </Panel>
            <Panel title="Profile change history" padded={false}>
              <DataTable rows={d.changes} rowKey={(c) => `${c.at}${c.field}${c.updated}`} caption="Change history" searchable={false} emptyTitle="No changes recorded" columns={[{ key: "at", header: "Date / time", value: (c) => c.at, render: (c) => <span className="small">{dt(c.at)}</span> }, { key: "f", header: "Field", value: (c) => c.field }, { key: "p", header: "Previous", value: (c) => c.previous ?? "" }, { key: "u", header: "Updated", value: (c) => c.updated ?? "" }, { key: "b", header: "By", value: (c) => c.by }, { key: "r", header: "Reason", value: (c) => c.reason, render: (c) => <span className="small">{c.reason}</span> }]} />
            </Panel>
            <p className="muted small">Source data timestamp {dt(ctx.now)}</p>
          </div>
        )}
      </div>
    </>
  );
}

const COVERAGE = [
  { req: "Wallet with date filter (Lifetime, Available, Redeemed, Scheme, TDS deducted; day / week / month / year / custom)", contract: "analyticsApi.memberWallet(memberId, from, to)", source: "Wallet & Ledger (Phase 7)", fn: "wallet" },
  { req: "Earnings by product category", contract: "analyticsApi.memberEarningsByCategory(memberId, from, to)", source: "Earning ledger lines (never redemptions)", fn: "earn" },
  { req: "Scan history: every scan, latest first, filterable, geo-tagged, claim ID", contract: "analyticsApi.memberScanHistory(memberId, filters)", source: "Scanning Management (mock scan-service adapter)", fn: "scans" },
  { req: "Passbook: every earning and redemption, filters by date, scheme, category, status, channel, region", contract: "analyticsApi.memberPassbook(memberId, filters)", source: "Wallet passbook / ledger (Phase 7)", fn: "passbook" },
  { req: "Statement export for a date range in CSV and PDF", contract: "analyticsApi.memberStatement(memberId, from, to, csv | pdf)", source: "Statement service (CSV rows here; PDF layout by the statement service)", fn: "statement" },
  { req: "Scheme progress and milestone progress (how much more to qualify)", contract: "analyticsApi.memberSchemeProgress(memberId)", source: "Scheme & Incentive Management accruals and milestone rule", fn: "progress" },
  { req: "Home page filters by date, product and category", contract: "memberWallet / memberPassbook / memberEarningsByCategory date, SKU and category parameters", source: "Same contracts", fn: "home" },
];
function MemberAppCoverage() {
  const v = useAnalyticsView();
  const members = member360List(v.uid, {});
  const [id, setId] = useState(members.find((m) => m.status === "redemption_enabled")?.id ?? members[0]?.id ?? "");
  const [out, setOut] = useState<Record<string, string>>({});
  const check = async () => {
    const to = day(v.now), from = `${to.slice(0, 4)}-01-01`;
    const w = await analyticsApi.memberWallet(id, from, to);
    const e = await analyticsApi.memberEarningsByCategory(id, from, to);
    const s = await analyticsApi.memberScanHistory(id);
    const p = await analyticsApi.memberPassbook(id, { from, to });
    const st = await analyticsApi.memberStatement(id, from, to, "csv");
    const g = await analyticsApi.memberSchemeProgress(id);
    setOut({ wallet: `Lifetime ${num(w.lifetimeEarned)} · available ${num(w.available)} · redeemed ${num(w.redeemed)} · scheme ${num(w.schemePoints)} · TDS ${num(w.tdsDeductedPoints)} pts / ${inr(w.tdsDeductedInr)}`, earn: `${e.length} categories`, scans: `${s.length} scans, ${s.filter((x) => x.geoTagged).length} geo-tagged, latest ${s[0]?.claimId ?? "—"}`, passbook: `${p.length} entries`, statement: `${st.rows} rows (CSV)`, progress: `${g.length} schemes${g.find((x) => x.next) ? `; next milestone ${g.find((x) => x.next)!.next!.name} in ${g.find((x) => x.next)!.next!.remaining} points` : ""}`, home: "Date, product and category parameters accepted" });
  };
  return (
    <>
      <Notice tone="info">These are the service contracts the member apps use (SOW 13.2). This portal does not build member app screens, and the contract check below is a service response, not a member app preview.</Notice>
      <Panel title="Coverage" actions={<span className="btn-row"><SelectInput label="Member" value={id} onChange={setId} options={members.map((m) => ({ value: m.id, label: `${m.id} · ${m.programme}` }))} /><button type="button" className="btn btn--ghost btn--sm" onClick={check}>Run contract check</button></span>} padded={false}>
        <DataTable rows={COVERAGE} rowKey={(c) => c.fn} caption="Member app analytics coverage" searchable={false} columns={[
          { key: "r", header: "SOW 13.2 requirement", value: (c) => c.req, render: (c) => <span className="small">{c.req}</span> },
          { key: "c", header: "Service contract", value: (c) => c.contract, render: (c) => <span className="mono small">{c.contract}</span> },
          { key: "s", header: "Authoritative source", value: (c) => c.source, render: (c) => <span className="small">{c.source}</span> },
          { key: "st", header: "Status", value: () => "", render: () => <StatusBadge tone="info">Contract available · app screen not in this build</StatusBadge> },
          { key: "o", header: "Contract check", value: (c) => out[c.fn] ?? "", render: (c) => <span className="small">{out[c.fn] ?? "—"}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Scan & QR reports ======================= */

export function ScanReportsPage() {
  const v = useAnalyticsView();
  const { engine: g } = useFilters();
  const [tab, setTab] = useParam("tab", "all");
  const [f, setF] = useState<ScanFilter>({});
  const [size, setSize] = useState("25");
  const [sel, setSel] = useState<string | null>(null);
  const type = tab === "in" ? "scan_in" : tab === "out" ? "scan_out" : "";
  const filter: ScanFilter = { ...f, from: g.from, to: g.to, programmes: g.programmes, state: g.state ?? undefined, district: g.district ?? undefined, branch: g.branch ?? undefined, categoryId: g.categoryId ?? f.categoryId, type: type || f.type };
  const r = scanReport(v.uid, filter);
  if (!r.ok && !r.rows.length && tab !== "parent") return <PolicyMessages result={r} />;
  const rows = r.rows.sort((a, b) => b.at.localeCompare(a.at));
  const ctx = context();
  const so = scanSuccess(rows, "scan_out");
  const si = scanSuccess(rows, "scan_in");
  const reportId = tab === "in" ? "RPT-SCANIN" : tab === "out" ? "RPT-SCANOUT" : "RPT-QR";
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { header: "Scan transaction", value: (s) => s.id }, { header: "Claim ID", value: (s) => s.claimId }, { header: "QR reference (masked)", value: (s) => s.qrMasked }, { header: "Member ID", value: (s) => s.memberId }, { header: "Member name", value: (s) => ctx.members.find((m) => m.id === s.memberId)?.name ?? "" }, { header: "Programme", value: (s) => s.programme }, { header: "Scanned by", value: (s) => s.scannedBy },
    { header: "SKU", value: (s) => s.skuCode }, { header: "Category", value: (s) => categoryName(ctx.ms, s.categoryId) }, { header: "Sub-category", value: (s) => (s.subCategoryId ? ctx.ms.subCategories.find((x) => x.id === s.subCategoryId)?.name ?? s.subCategoryId : "") }, { header: "Scan type", value: (s) => (s.type === "scan_in" ? "Scan-In" : "Scan-Out") },
    { header: "Scan date", value: (s) => s.at.slice(0, 10) }, { header: "Scan time", value: (s) => s.at.slice(11, 16) }, { header: "Location", value: (s) => s.location.label }, { header: "Latitude", value: (s) => s.location.lat }, { header: "Longitude", value: (s) => s.location.lng },
    { header: "State", value: (s) => geoOf(s.branchCode).stateName }, { header: "District", value: (s) => geoOf(s.branchCode).districtName }, { header: "Branch", value: (s) => s.branchCode }, { header: "Salesperson", value: (s) => s.salesperson ?? "" }, { header: "Channel", value: (s) => channelLabel(channelKey(s.channel)) },
    { header: "Status", value: (s) => s.status }, { header: "Points earned", value: (s) => s.points }, { header: "Failure reason", value: (s) => s.failureReason ?? "" }, { header: "Scheme", value: (s) => s.schemeRef ?? "" },
  ];
  const set = (p: Partial<ScanFilter>) => setF((x) => ({ ...x, ...p }));
  return (
    <>
      <SectionTitle title="Scan & QR reports" description="Every scan attempt: what was scanned, by whom, when and where (SOW 13.5). Scan-In and Scan-Out are separate events reported separately, and only Scan-Out earns points. QR references are masked" />
      <Notice tone="info">Scan records come from a mock scan-service adapter built from the Wallet ledger and Phase 10 rejections (development data). The channel shown is the one the scan service recorded; a missing channel is Unknown / unmapped.</Notice>
      <Tabs label="Scan reports" value={tab} onChange={(t) => { setTab(t); setSel(null); }} tabs={[{ id: "all", label: "QR / scan report" }, { id: "out", label: "Scan-Out report" }, { id: "in", label: "Scan-In report" }, { id: "combined", label: "Combined view" }, { id: "parent", label: "Parent-child tracking" }]} />
      {tab === "parent" ? <ParentChild /> : tab === "combined" ? (
        <>
          <FilterBar applies={["date", "programme", "geo", "category"]} />
          <div className="grid-2">
            {(["scan_out", "scan_in"] as const).map((t) => { const x = scanSuccess(rows, t); return <Panel key={t} title={t === "scan_out" ? "Scan-Out" : "Scan-In"} subtitle={t === "scan_out" ? "Earns points" : "Never earns points"}><StatList items={[{ label: "Attempts", value: num(x.attempts) }, { label: "Successful", value: num(x.successful) }, { label: "Success rate", value: pct(x.rate) }, { label: "Points earned", value: t === "scan_out" ? num(rows.filter((s) => s.type === t).reduce((n, s) => n + s.points, 0)) : "Not applicable" }]} /></Panel>; })}
          </div>
          <Panel title="Daily Scan-In and Scan-Out" subtitle="Two separate series, never one combined count">
            <RankedBars items={[...new Set(rows.map((s) => s.at.slice(0, 10)))].sort().slice(-10).map((d) => ({ key: d, label: `${d} · in ${rows.filter((s) => s.type === "scan_in" && s.at.startsWith(d)).length}`, value: rows.filter((s) => s.type === "scan_out" && s.at.startsWith(d)).length }))} />
          </Panel>
        </>
      ) : (
        <>
          <FilterBar applies={["date", "programme", "geo", "category"]} />
          <Panel>
            <div className="form-grid">
              <TextField label="Member ID" value={f.memberId ?? ""} onChange={(x) => set({ memberId: x.trim() || undefined })} />
              <TextField label="Member name" value={f.memberName ?? ""} onChange={(x) => set({ memberName: x || undefined })} />
              <TextField label="QR reference" value={f.qr ?? ""} onChange={(x) => set({ qr: x || undefined })} />
              <TextField label="Claim ID" value={f.claimId ?? ""} onChange={(x) => set({ claimId: x.trim() || undefined })} />
              {tab === "all" && <SelectInput label="Scan type" value={f.type ?? ""} onChange={(x) => set({ type: (x || undefined) as ScanFilter["type"] })} options={[{ value: "", label: "All" }, { value: "scan_out", label: "Scan-Out" }, { value: "scan_in", label: "Scan-In" }]} />}
              <SelectInput label="Product (SKU)" value={f.skuCode ?? ""} onChange={(x) => set({ skuCode: x || undefined })} options={[{ value: "", label: "All products" }, ...[...new Set(ctx.scans.map((s) => s.skuCode).filter(Boolean))].sort().map((x) => ({ value: x, label: x }))]} />
              <SelectInput label="Scan status" value={f.status ?? ""} onChange={(x) => set({ status: x || undefined })} options={[{ value: "", label: "All" }, { value: "success", label: "Successful" }, { value: "failed", label: "Failed" }, { value: "pending_validation", label: "Pending validation" }]} />
              <SelectInput label="Scan channel" value={f.channel ?? ""} onChange={(x) => set({ channel: x || undefined })} options={[{ value: "", label: "All" }, ...Object.entries(CHANNEL_LABEL).map(([k, l]) => ({ value: k, label: l })), { value: "unmapped", label: "Unknown / unmapped" }]} />
              {r.preciseLocation && <SelectInput label="Salesperson" value={f.salesperson ?? ""} onChange={(x) => set({ salesperson: x || undefined })} options={[{ value: "", label: "All" }, ...[...new Set(ctx.scans.map((s) => s.salesperson ?? "").filter(Boolean))].sort().map((x) => ({ value: x, label: x }))]} />}
              <SelectInput label="Page size" value={size} onChange={setSize} options={["10", "25", "50", "100"].map((x) => ({ value: x, label: `${x} rows` }))} />
              <div><button type="button" className="link-btn" onClick={() => setF({})}>Clear all</button></div>
            </div>
          </Panel>
          <div className="ana-tiles">
            <KpiTile label={tab === "in" ? "Scan-In attempts" : tab === "out" ? "Scan-Out attempts" : "Scan attempts"} value={num(rows.length)} period={`${g.from} → ${g.to}`} status="data" />
            {tab !== "in" && <KpiTile label="Scan-Out success rate" value={pct(so.rate)} period={`${so.successful} of ${so.attempts}`} detail="KPI dictionary: successful ÷ attempts" />}
            {tab !== "out" && <KpiTile label="Scan-In success rate" value={pct(si.rate)} period={`${si.successful} of ${si.attempts}`} />}
            <KpiTile label="Points earned" value={tab === "in" ? "Not applicable" : num(rows.filter((s) => s.type === "scan_out").reduce((n, s) => n + s.points, 0))} period={tab === "in" ? "Scan-In never earns points" : "Scan-Out ledger credits"} status="data" />
          </div>
          {!r.preciseLocation && <Notice tone="info">Precise scan coordinates and the salesperson field need Scan & QR reports: View sensitive. Locations are shown at district level.</Notice>}
          {r.preciseLocation && r.salespersonField !== "confirmed" && <Notice tone="warn">Salesperson Name in the QR report is not confirmed (<DecisionRef id="OP-62" label="OP-62 / OP-32" />): shown only where Member Management has a mapped sales rep; no name is invented.</Notice>}
          <div className="grid-2 grid-2--wide-left">
            <Panel padded={false} actions={<span className="btn-row"><Freshness domain="scans" /><ExportButtons reportId={reportId} name={reportId.toLowerCase()} cols={cols} rows={rows} containsMembers /></span>}>
              <DataTable key={size} rows={rows} rowKey={(s) => s.id} caption="Scan records" pageSize={Number(size)} onRowClick={(s) => setSel(s.id)} columns={[
                { key: "id", header: "Scan", value: (s) => s.id, render: (s) => <span className="mono small">{s.id}</span> },
                { key: "c", header: "Claim ID", value: (s) => s.claimId, render: (s) => <span className="mono small">{s.claimId}</span> },
                { key: "q", header: "QR", value: (s) => s.qrMasked, render: (s) => <span className="mono small">{s.qrMasked}</span> },
                { key: "m", header: "Member", value: (s) => s.memberId, render: (s) => memberLink(s.memberId) },
                { key: "p", header: "Programme", value: (s) => s.programme },
                { key: "sku", header: "SKU", value: (s) => s.skuCode, render: (s) => <span className="mono small">{s.skuCode || "—"}</span> },
                { key: "cat", header: "Category", value: (s) => categoryName(ctx.ms, s.categoryId) },
                { key: "t", header: "Type", value: (s) => s.type, render: (s) => <StatusBadge tone={s.type === "scan_out" ? "info" : "neutral"}>{s.type === "scan_out" ? "Scan-Out" : "Scan-In"}</StatusBadge> },
                { key: "at", header: "Date / time", value: (s) => s.at, render: (s) => <span className="small">{dt(s.at)}</span> },
                { key: "loc", header: "Location", value: (s) => s.location.label, render: (s) => <span className="small">{s.location.label}{s.location.lat != null ? ` (${s.location.lat.toFixed(4)}, ${s.location.lng?.toFixed(4)})` : ""}</span> },
                { key: "b", header: "Branch", value: (s) => s.branchCode, render: (s) => <span className="mono small">{s.branchCode}</span> },
                ...(r.preciseLocation ? [{ key: "sp", header: "Salesperson", value: (s: R) => s.salesperson ?? "", render: (s: R) => <span className="small">{s.salesperson ?? "Not mapped"}</span> }] : []),
                { key: "ch", header: "Channel", value: (s) => channelKey(s.channel), render: (s) => (s.channel ? channelLabel(s.channel) : <span className="muted small">Unmapped</span>) },
                { key: "st", header: "Status", value: (s) => s.status, render: (s) => <StatusBadge tone={s.status === "success" ? "positive" : s.status === "failed" ? "negative" : "warning"}>{s.status.replace(/_/g, " ")}</StatusBadge> },
                { key: "pt", header: "Points", value: (s) => s.points, align: "right" },
              ]} />
            </Panel>
            {sel ? <ScanDetailPanel id={sel} /> : <Panel title="Scan detail"><p className="muted small">Select a scan to see the request, validation, ledger credit and scheme</p></Panel>}
          </div>
        </>
      )}
    </>
  );
}
function ScanDetailPanel({ id }: { id: string }) {
  const v = useAnalyticsView();
  const d = scanDetail(v.uid, id);
  if (!d.ok || !d.scan) return <PolicyMessages result={d} />;
  const s = d.scan;
  const ctx = context();
  return (
    <Panel title={`${s.id} · ${s.type === "scan_out" ? "Scan-Out" : "Scan-In"}`} subtitle={s.source}>
      <dl className="dl-grid small">
        <dt>Claim ID</dt><dd className="mono">{s.claimId}</dd>
        <dt>QR reference</dt><dd className="mono">{s.qrMasked}</dd>
        <dt>Member</dt><dd>{memberLink(s.memberId)} · {ctx.members.find((m) => m.id === s.memberId)?.name}</dd>
        <dt>Product / SKU</dt><dd>{s.skuCode || "Not supplied"} · {categoryName(ctx.ms, s.categoryId)}</dd>
        <dt>Scan request</dt><dd>{dt(s.at)} via {s.channel ? channelLabel(s.channel) : "Unknown / unmapped channel"}</dd>
        <dt>Location</dt><dd>{s.location.label} <span className="muted">({s.location.source})</span></dd>
        <dt>Validation result</dt><dd>{d.validation}</dd>
        <dt>Points credit</dt><dd>{s.type === "scan_in" ? "Scan-In never earns points" : d.ledger ? <Link to={`/wallet/ledger/${d.ledger.id}`}>{d.ledger.id} · {num(d.ledger.gross ?? d.ledger.points)} points ({d.ledger.status})</Link> : "No ledger credit"}</dd>
        <dt>Scheme</dt><dd>{s.schemeRef ? <Link to={`/schemes/scheme/${s.schemeRef}`}>{s.schemeRef}</Link> : "—"}</dd>
        <dt>Failure / exception</dt><dd>{s.failureReason ?? "—"}</dd>
        <dt>Parent pack</dt><dd>{d.children.length ? d.children.map((c) => `${c.parentPack} (${c.childUnit})`).join(", ") : "—"}</dd>
      </dl>
    </Panel>
  );
}
function ParentChild() {
  const v = useAnalyticsView();
  const r = parentChildReport(v.uid);
  if (!r.ok) return <PolicyMessages result={r} />;
  const parents = [...new Set(r.rows.map((x) => x.parentPack))];
  return (
    <>
      <Notice tone="warn">What parent-child tracking should show, and to whom, is not confirmed (<DecisionRef id="OP-62" label="OP-62 / OP-32" />). The mapping source in eSeal is also unconfirmed. Scanning member and precise location are shown only with Scan & QR reports: View sensitive.</Notice>
      <Panel padded={false} title="Parent packs and child units" actions={<ExportButtons reportId="RPT-PARENT" name="parent-child" cols={[{ header: "Parent pack", value: (x: (typeof r.rows)[number]) => x.parentPack }, { header: "Parent SKU", value: (x) => x.parentSku }, { header: "Child unit", value: (x) => x.childUnit }, { header: "Child SKU", value: (x) => x.childSku }, { header: "Child scan", value: (x) => x.childScanId ?? "" }, { header: "Scanned at", value: (x) => x.scan?.at ?? "" }, { header: "Location", value: (x) => x.scan?.location ?? "" }, { header: "Branch", value: (x) => x.scan?.branch ?? "" }, { header: "Status", value: (x) => x.status }]} rows={r.rows} />}>
        <table className="table">
          <thead><tr><th>Parent / child</th><th>SKU</th><th>Child scan</th><th>Scanning member</th><th>Scanned</th><th>Location</th><th>Branch</th><th>Status</th></tr></thead>
          <tbody>
            {parents.map((p) => { const kids = r.rows.filter((x) => x.parentPack === p); return (
              <Fragment key={p}>
                <tr className="ana-parent"><td colSpan={8}><strong className="mono">{p}</strong> · {kids[0].parentSku} · <span className="muted small">{kids[0].mappingSource}</span></td></tr>
                {kids.map((k) => (
                  <tr key={k.id}>
                    <td className="mono small">↳ {k.childUnit}</td><td className="mono small">{k.childSku}</td><td className="mono small">{k.childScanId ?? "—"}</td>
                    <td>{k.scan?.memberId ? memberLink(k.scan.memberId) : <span className="muted small">{k.scan ? "Restricted" : "—"}</span>}</td>
                    <td className="small">{dt(k.scan?.at)}</td><td className="small">{k.scan?.location ?? "—"}</td><td className="mono small">{k.scan?.branch ?? "—"}</td>
                    <td><StatusBadge tone={k.status === "scanned" ? "positive" : k.status === "mapping_missing" ? "negative" : "neutral"}>{k.status.replace(/_/g, " ")}</StatusBadge></td>
                  </tr>
                ))}
              </Fragment>
            ); })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/* ======================= Finance reports ======================= */

export function FinanceReportsPage() {
  const v = useAnalyticsView();
  const [tab, setTab] = useParam("tab", "ageing");
  return (
    <>
      <SectionTitle title="Finance reports" description="Points ageing and TDS monthly liability (SOW 13.6), built from recorded Wallet ledger and Phase 7 TDS values. Not validated by Finance and not statutory filing output" />
      <Tabs label="Finance reports" value={tab} onChange={setTab} tabs={[{ id: "ageing", label: "Points ageing" }, { id: "tds", label: "TDS monthly liability" }, { id: "links", label: "Other finance reports" }]} />
      {tab === "ageing" ? <Ageing uid={v.uid} /> : tab === "tds" ? <TdsLiability uid={v.uid} canUnmask={v.can("finance-reports:view_sensitive")} /> : (
        <Panel padded={false} title="Finance report catalogue" subtitle="Phase 7 reports are reused, not recalculated">
          <DataTable rows={REPORTS.filter((r) => r.category === "finance")} rowKey={(r) => r.id} caption="Finance reports" searchable={false} columns={[{ key: "n", header: "Report", value: (r) => r.name, render: (r) => <Link to={r.route}>{r.name}</Link> }, { key: "s", header: "Source", value: (r) => r.sourceModule }, { key: "p", header: "Permission", value: (r) => r.permission, render: (r) => <span className="mono small">{r.permission}</span> }, { key: "st", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "available" ? "positive" : "info"}>{r.status === "linked" ? "Phase 7 report" : r.status.replace(/_/g, " ")}</StatusBadge> }]} />
        </Panel>
      )}
    </>
  );
}
function Ageing({ uid }: { uid: string }) {
  const [asOn, setAsOn] = useParam("asOn", day(context().now));
  const [branch, setBranch] = useParam("branch", "");
  const [district, setDistrict] = useParam("district", "");
  const [role, setRole] = useParam("role", "");
  const [cat, setCat] = useParam("category", "");
  const [prog, setProg] = useParam("programme", "");
  const ctx = context();
  const r = pointsAgeingReport(uid, asOn, { branch: branch || undefined, district: district || undefined, role: role || undefined, categoryId: cat || undefined, programme: prog || undefined });
  const members = useMemo(() => ctx.members, [ctx.members]);
  if (!r.ok) return <PolicyMessages result={r} />;
  const rows = r.rows;
  type R = (typeof rows)[number];
  const totals = Object.fromEntries(r.buckets.map((b) => [b, rows.reduce((n, x) => n + x.buckets[b], 0)]));
  const cols: Col<R>[] = [{ header: "Member ID", value: (x) => x.memberId }, { header: "Member name", value: (x) => x.name }, { header: "Mobile (masked)", value: (x) => x.mobileMasked }, { header: "Programme", value: (x) => x.programme }, { header: "Role", value: (x) => x.role }, { header: "Branch", value: (x) => x.branchCode }, { header: "District", value: (x) => geoOf(x.branchCode).districtName }, { header: "Product category", value: (x) => x.categoryName }, ...r.buckets.map((b) => ({ header: b, value: (x: R) => x.buckets[b] })), { header: "Available points", value: (x) => x.total }, { header: "As-on date", value: () => asOn }];
  const opt = (xs: string[], all: string) => [{ value: "", label: all }, ...[...new Set(xs)].sort().map((x) => ({ value: x, label: x }))];
  return (
    <>
      <Notice tone="warn">{r.method}. The allocation method and any provisioning treatment are Finance decisions (<DecisionRef id="OP-AGE1" />).</Notice>
      <Panel>
        <div className="form-grid">
          <TextField label="As-on date" type="date" value={asOn} onChange={setAsOn} />
          <SelectInput label="District" value={district} onChange={setDistrict} options={[{ value: "", label: "All districts" }, ...GEOGRAPHY.flatMap((s) => s.districts).map((d) => ({ value: d.code, label: d.name }))]} />
          <SelectInput label="Branch" value={branch} onChange={setBranch} options={opt(members.map((m) => m.branchCode), "All branches")} />
          <SelectInput label="Role" value={role} onChange={setRole} options={opt(members.map((m) => m.memberType), "All roles")} />
          <SelectInput label="Product category" value={cat} onChange={setCat} options={[{ value: "", label: "All categories" }, ...ctx.ms.categories.map((c) => ({ value: c.id, label: c.name })), { value: "none", label: "Not product-linked" }]} />
          <SelectInput label="Programme" value={prog} onChange={setProg} options={opt(members.map((m) => m.programme), "All programmes")} />
        </div>
      </Panel>
      <Panel padded={false} title={`Points ageing as on ${asOn}`} subtitle="One row per member and product category; financial-year buckets from FY2021-22. Pivot-ready" actions={<span className="btn-row"><Freshness domain="points" /><ExportButtons reportId="RPT-AGEING" name={`points-ageing-${asOn}`} cols={cols} rows={rows} extra={{ asOn, branch: branch || null, district: district || null, role: role || null, category: cat || null, programme: prog || null }} containsMembers /></span>}>
        <DataTable rows={rows} rowKey={(x) => `${x.memberId}|${x.category}`} caption="Points ageing" footer={<div className="ana-total small">Total available: <strong>{num(rows.reduce((n, x) => n + x.total, 0))}</strong> · {r.buckets.map((b) => `${b} ${num(totals[b])}`).join(" · ")}</div>} columns={[
          { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => <span>{memberLink(x.memberId)}<br /><span className="small">{x.name}</span></span> },
          { key: "mob", header: "Mobile", value: (x) => x.mobileMasked, render: (x) => <span className="mono small">{x.mobileMasked}</span> },
          { key: "b", header: "Branch", value: (x) => x.branchCode, render: (x) => <span className="mono small">{x.branchCode}</span> },
          { key: "c", header: "Category", value: (x) => x.categoryName },
          ...r.buckets.map((b) => ({ key: b, header: b, value: (x: R) => x.buckets[b], align: "right" as const, render: (x: R) => (x.buckets[b] ? num(x.buckets[b]) : <span className="muted">0</span>) })),
          { key: "t", header: "Available", value: (x) => x.total, align: "right", render: (x) => <strong>{num(x.total)}</strong> },
        ]} />
      </Panel>
    </>
  );
}
function TdsLiability({ uid, canUnmask }: { uid: string; canUnmask: boolean }) {
  const ctx = context();
  const months = [...new Set([...ctx.ws.redemptions.map((r) => r.createdAt.slice(0, 7)), ...ctx.lines.filter((l) => l.type === "tds_kitty_deduction").map((l) => l.at.slice(0, 7))])].filter((m) => m <= day(ctx.now).slice(0, 7)).sort().reverse();
  const [month, setMonth] = useParam("month", months[0] ?? day(ctx.now).slice(0, 7));
  const [role, setRole] = useParam("role", "");
  const [branch, setBranch] = useParam("branch", "");
  const [prog, setProg] = useParam("programme", "");
  const [show, setShow] = useState(false);
  const f = { role: role || undefined, branch: branch || undefined, programme: prog || undefined };
  const r = tdsLiabilityReport(uid, month, f, show && canUnmask);
  if (!r.ok) return <PolicyMessages result={r} />;
  const rows = r.rows;
  type R = (typeof rows)[number];
  const cols = (unmasked: boolean): Col<R>[] => [{ header: "Member name", value: (x) => x.name }, { header: "Member ID", value: (x) => x.memberId }, { header: "Programme", value: (x) => x.programme }, { header: "Role", value: (x) => x.role }, { header: "Branch", value: (x) => x.branchCode }, { header: "TDS model", value: (x) => x.model }, { header: "Total redeem value (₹)", value: (x) => x.redeemValueInr }, { header: "Taxable value (₹)", value: () => "Not supplied (OP-TAXV)" }, { header: unmasked ? "PAN reference" : "PAN (masked)", value: (x) => x.pan ?? "Not verified" }, { header: "TDS rate (%)", value: (x) => x.ratePct }, { header: "TDS amount (₹)", value: (x) => x.tdsInr }, { header: "TDS Kitty points (EP)", value: (x) => x.kittyPoints }, { header: "Status", value: (x) => x.status }, { header: "Month", value: () => month }, { header: "Financial year", value: () => (r.ok && "fy" in r ? r.fy : "") }];
  const unmaskedRows = canUnmask ? tdsLiabilityReport(uid, month, f, false).rows.map((x) => ({ ...x, pan: x.pan })) : [];
  const phase7 = ctx.ws.redemptions.filter((x) => x.createdAt.startsWith(month) && x.tds.status === "recorded" && x.stage !== "reversed" && x.stage !== "cancelled").reduce((n, x) => n + (x.tds.amountInr ?? 0), 0);
  const reportTotal = rows.reduce((n, x) => n + (x.tdsInr ?? 0), 0);
  const opt = (xs: string[], all: string) => [{ value: "", label: all }, ...[...new Set(xs)].sort().map((x) => ({ value: x, label: x }))];
  return (
    <>
      <Notice tone="warn">{"note" in r ? r.note : ""}. EP/IMP TDS is deducted at scan and held in the Kitty; Retailer, ST and CS TDS is deducted at redemption. Each row uses only the values Phase 7 recorded (<DecisionRef id="OP-TAXV" />).</Notice>
      <Panel>
        <div className="form-grid">
          <SelectInput label="Month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: m }))} />
          <TextField label="Financial year" value={"fy" in r ? r.fy : ""} onChange={() => undefined} disabled />
          <SelectInput label="Role" value={role} onChange={setRole} options={opt(ctx.members.map((m) => m.memberType), "All roles")} />
          <SelectInput label="Branch" value={branch} onChange={setBranch} options={opt(ctx.members.map((m) => m.branchCode), "All branches")} />
          <SelectInput label="Programme" value={prog} onChange={setProg} options={opt(ctx.members.map((m) => m.programme), "All programmes")} />
          {canUnmask && <label className="ana-check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show PAN reference (audited)</label>}
        </div>
      </Panel>
      <div className="ana-tiles">
        <KpiTile label="TDS on redemption (₹)" value={inr(reportTotal)} period={month} status="data" detail={`Phase 7 recorded for ${month}: ${inr(phase7)}${phase7 === reportTotal ? " · reconciled" : " · difference"}`} />
        <KpiTile label="Members" value={num(rows.length)} period={month} status="data" />
        <KpiTile label="EP Kitty points held" value={num(rows.reduce((n, x) => n + (x.kittyPoints ?? 0), 0))} period="Deducted at scan" status="data" />
      </div>
      <Panel padded={false} title={`TDS monthly liability · ${month}`} actions={<ExportButtons reportId="RPT-TDSM" name={`tds-liability-${month}`} cols={cols(false)} rows={rows} extra={{ month, fy: "fy" in r ? r.fy : null, role: role || null, branch: branch || null, programme: prog || null }} unmaskedOption={canUnmask ? { label: "Excel with PAN reference", cols: cols(true), rows: unmaskedRows } : undefined} containsMembers />}>
        <DataTable rows={rows} rowKey={(x) => x.memberId} caption="TDS monthly liability" columns={[
          { key: "n", header: "Member", value: (x) => x.name, render: (x) => <span>{x.name}<br />{memberLink(x.memberId)}</span> },
          { key: "p", header: "Programme", value: (x) => x.programme },
          { key: "m", header: "TDS model", value: (x) => x.model, render: (x) => <span className="small">{x.model}</span> },
          { key: "rv", header: "Total redeem value", value: (x) => x.redeemValueInr ?? -1, render: (x) => (x.redeemValueInr == null ? "—" : inr(x.redeemValueInr)), align: "right" },
          { key: "tv", header: "Taxable value", value: () => "", render: () => <span className="muted small">Not supplied</span> },
          { key: "pan", header: "PAN", value: (x) => x.pan ?? "", render: (x) => <span className="mono small">{x.pan ?? "Not verified"}</span> },
          { key: "r", header: "TDS rate", value: (x) => x.ratePct ?? -1, render: (x) => (x.ratePct == null ? "—" : `${x.ratePct}%`), align: "right" },
          { key: "a", header: "TDS amount", value: (x) => x.tdsInr ?? -1, render: (x) => (x.tdsInr == null ? "—" : inr(x.tdsInr)), align: "right" },
          { key: "k", header: "Kitty points", value: (x) => x.kittyPoints ?? -1, render: (x) => (x.kittyPoints == null ? "—" : num(x.kittyPoints)), align: "right" },
          { key: "s", header: "Status", value: (x) => x.status, render: (x) => <span className="small">{x.status}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Programme reports ======================= */

export function ProgrammeReportsPage() {
  const v = useAnalyticsView();
  const [tab, setTab] = useParam("p", "EP");
  return (
    <>
      <SectionTitle title="Programme & member-type reports" description="Reports per programme (SOW 13.7), a dedicated Direct Dealer area, and sales-executive mapped-member performance" />
      <Tabs label="Programmes" value={tab} onChange={setTab} tabs={[{ id: "EP", label: "EP" }, { id: "ST", label: "ST" }, { id: "CS", label: "CS" }, { id: "Retailer", label: "Retailer" }, { id: "DD", label: "Direct Dealer" }, { id: "sales", label: "Sales executive" }, { id: "jobs", label: "Job dashboard" }]} />
      {tab === "sales" ? <SalesExec /> : tab === "jobs" ? (
        <Notice tone="warn"><strong>Proposed — change request required.</strong> The technician job dashboard (jobs completed, earnings, throughput) belongs to Module 12, which is proposed and not in this build (<DecisionRef id="MOD-12" label="Module 12" />). No job data is shown or treated as a business metric.</Notice>
      ) : <Programme programme={tab} uid={v.uid} />}
    </>
  );
}
function Programme({ programme, uid }: { programme: string; uid: string }) {
  const { engine: f } = useFilters();
  const r = programmeReport(uid, programme, f);
  if (!("members" in r)) return <PolicyMessages result={r} />;
  return (
    <>
      <FilterBar applies={["date", "geo", "memberType"]} note={`Programme fixed to ${programme}`} />
      {programme === "DD" && r.ddSpecific && <Notice tone="warn">Direct Dealers earn on a different slab structure, so DD has its own reporting area. Which DD reports differ from Retailer reports is not confirmed (<DecisionRef id="OP-43" />): the common figures below apply; DD-specific outputs are <strong>Business confirmation required</strong>. DD slab schemes: {r.ddSpecific.slabSchemes.join(", ") || "none configured"}.</Notice>}
      <div className="ana-tiles">
        <KpiTile label="Members" value={num(r.members)} period="In your scope" status="data" />
        <KpiTile label="Points issued" value={num(r.points.issued)} period={`${f.from} → ${f.to}`} status="data" />
        <KpiTile label="Points redeemed" value={num(r.points.redeemed)} period={`${f.from} → ${f.to}`} status="data" />
        <KpiTile label="Scan-Out success" value={pct(r.scanOut.rate)} period={`${r.scanOut.successful} of ${r.scanOut.attempts}`} status="data" />
        <KpiTile label="Scan-In success" value={pct(r.scanIn.rate)} period={`${r.scanIn.successful} of ${r.scanIn.attempts}`} status="data" />
        {programme === "DD" && <KpiTile label="DD financial summary" value="Not available" period="OP-43" status="bcr" />}
      </div>
      <div className="grid-3">
        <Panel title="Members by status"><RankedBars items={r.byStatus.map((x) => ({ key: x.key, label: x.label.replace(/_/g, " "), value: x.value }))} /></Panel>
        <Panel title="Points by product category"><RankedBars items={r.byCategory.map((x) => ({ key: x.key, label: x.key, value: x.issued }))} /></Panel>
        <Panel title="Top members by points issued"><StatList items={r.topMembers.map((m) => ({ label: `${m.id} · ${m.name}`, value: num(m.issued) }))} /></Panel>
      </div>
      <Panel padded={false} title={`${programme} schemes`}>
        <DataTable rows={r.schemes} rowKey={(s) => s.id} caption="Schemes" searchable={false} columns={[{ key: "n", header: "Scheme", value: (s) => s.name, render: (s) => <Link to={`/schemes/scheme/${s.id}`}>{s.name}</Link> }, { key: "p", header: "Participants", value: (s) => s.participants, align: "right" }, { key: "e", header: "Points earned", value: (s) => s.earned, align: "right" }, { key: "b", header: "Budget", value: (s) => s.budget ?? -1, render: (s) => (s.budget == null ? "Not set" : num(s.budget)), align: "right" }, { key: "st", header: "Status", value: (s) => s.status }]} />
      </Panel>
    </>
  );
}
function SalesExec() {
  const v = useAnalyticsView();
  const reps = v.acc.users.filter((u) => u.accountStatus === "active" && hasPermission(v.acc, u.id, "members", "view").allowed && u.designation?.toLowerCase().includes("sales"));
  const self = reps.find((u) => u.id === v.uid);
  const [sr, setSr] = useState(self?.id ?? reps[0]?.id ?? "");
  const r = salesExecMembers(v.uid, sr);
  if (!r.ok) return <PolicyMessages result={r} />;
  return (
    <>
      <Notice tone="info">Mapped members come from the Member Management sales-rep mapping and are limited to your own scope. Each member opens in Member 360. A separate field view for sales executives belongs to the proposed Module 12; the portal has no View-As feature (the header identity switcher is a development tool only).</Notice>
      <Panel actions={<SelectInput label="Sales executive" value={sr} onChange={setSr} options={reps.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.id})` }))} />} padded={false} title={`${r.rows.length} mapped members`}>
        <DataTable rows={r.rows} rowKey={(m) => m.id} caption="Mapped members" columns={[
          { key: "id", header: "Member", value: (m) => m.id, render: (m) => memberLink(m.id) },
          { key: "n", header: "Name", value: (m) => m.name },
          { key: "p", header: "Programme", value: (m) => m.programme },
          { key: "s", header: "Registration status", value: (m) => m.status.replace(/_/g, " ") },
          { key: "k", header: "KYC documents approved", value: (m) => m.kyc, align: "right" },
          { key: "l", header: "Last login", value: (m) => m.lastLogin ?? "", render: (m) => <span className="small">{dt(m.lastLogin)}</span> },
          { key: "sc", header: "Scans", value: (m) => m.scans, align: "right" },
          { key: "so", header: "Successful Scan-Out", value: (m) => m.scanOutOk, align: "right" },
          { key: "i", header: "Points issued", value: (m) => m.issued, align: "right" },
          { key: "r", header: "Redemptions", value: (m) => m.redemptions, align: "right" },
        ]} />
      </Panel>
      {!r.rows.length && <BcrTag>No members are mapped to this sales executive in your scope</BcrTag>}
    </>
  );
}
