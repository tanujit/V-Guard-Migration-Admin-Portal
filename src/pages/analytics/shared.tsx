import { createContext, useContext, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AlertTriangle, BarChart3, BookOpen, CalendarClock, Download, FileBarChart2, FileImage, FileSpreadsheet, FileText, Gauge, Gift, History, Layers, LifeBuoy, Map, Medal, PieChart, QrCode, Radar, RefreshCw, Repeat, ShieldAlert, Siren, Trophy, UserRound, Users, Wallet, Workflow } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { DemoBadge, StatusBadge } from "@/components/ui/primitives";
import { DATE_PRESETS, FRESHNESS_LABEL, REPORTS, type DatePreset } from "@/config/analyticsCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { useAccessState } from "@/features/access/store";
import { demoNow } from "@/features/approvals/store";
import { exportReport, freshness, refreshAnalytics, useAnalyticsState } from "@/features/analytics/store";
import { comparisonRange, dateRange, type Filters } from "@/features/analytics/engine";
import { useMasterState } from "@/features/masters/store";
import { useMemberState } from "@/features/members/store";
import { useOpsState } from "@/features/ops/store";
import { useRiskState } from "@/features/risk/store";
import { useSchemeState } from "@/features/schemes/store";
import { useWalletState } from "@/features/wallet/store";
import { buildTestPdf } from "@/features/gifts/engine";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import type { ExportRecord, FilterSnapshot } from "@/types/analytics";
import type { ProgrammeCode } from "@/types/members";
import { AccessDenied, PolicyMessages } from "@/pages/users/shared";
import { userName } from "@/pages/masters/shared";

export { userName };
export { useParam, useRun } from "@/pages/comms/shared";
export const ABASE = "/reports";
const PROGRAMMES: ProgrammeCode[] = ["EP", "ST", "CS", "Retailer", "DD"];

/* ======================= Layout with grouped navigation ======================= */

type Tab = { to: string; label: string; icon: typeof BarChart3; perm?: string; end?: boolean };
export const GROUPS: { id: string; label: string; tabs: Tab[] }[] = [
  { id: "dash", label: "Dashboards", tabs: [
    { to: ABASE, end: true, label: "Business overview", icon: BarChart3 },
    { to: `${ABASE}/engagement`, label: "Engagement", icon: Users },
    { to: `${ABASE}/points`, label: "Points flow", icon: Wallet },
    { to: `${ABASE}/revenue`, label: "Revenue impact", icon: FileBarChart2 },
    { to: `${ABASE}/fraud`, label: "Fraud", icon: ShieldAlert, perm: "fraud-rules:view" },
    { to: `${ABASE}/schemes`, label: "Scheme performance", icon: Trophy },
    { to: `${ABASE}/channels`, label: "Channels", icon: Workflow },
    { to: `${ABASE}/geography`, label: "Geography", icon: Map },
    { to: `${ABASE}/tiers`, label: "Tiers", icon: Medal },
    { to: `${ABASE}/support`, label: "Support", icon: LifeBuoy },
    { to: `${ABASE}/retention`, label: "Retention & churn", icon: Repeat },
    { to: `${ABASE}/acquisition`, label: "Acquisition cost", icon: Radar },
    { to: `${ABASE}/redemption`, label: "Redemption by product", icon: Gift },
    { to: `${ABASE}/segmentation`, label: "Segmentation", icon: PieChart },
  ] },
  { id: "rep", label: "Member & operational reports", tabs: [
    { to: `${ABASE}/member-360`, label: "Member 360", icon: UserRound, perm: "member-analytics:view" },
    { to: `${ABASE}/scans`, label: "Scan & QR", icon: QrCode, perm: "scan-reports:view" },
    { to: `${ABASE}/finance`, label: "Finance reports", icon: FileSpreadsheet, perm: "finance-reports:view" },
    { to: `${ABASE}/programmes`, label: "Programme reports", icon: Layers },
  ] },
  { id: "gov", label: "Catalogue, delivery & governance", tabs: [
    { to: `${ABASE}/catalogue`, label: "Report catalogue", icon: BookOpen },
    { to: `${ABASE}/schedules`, label: "Scheduled reports", icon: CalendarClock },
    { to: `${ABASE}/alerts`, label: "Threshold alerts", icon: Siren, perm: "kpi-governance:view" },
    { to: `${ABASE}/kpis`, label: "KPI dictionary", icon: Gauge, perm: "kpi-governance:view" },
    { to: `${ABASE}/history`, label: "History & exports", icon: History },
  ] },
];

export function AnalyticsLayout() {
  const { can } = useSession();
  const { pathname } = useLocation();
  if (!can("reports:view") && !can("analytics:view")) {
    return (
      <PageContainer>
        <PageHeader title="Reports & analytics" />
        <AccessDenied message="You need Reports: View or Business analytics: View. Ask an Evolve Super Admin to review your access." />
      </PageContainer>
    );
  }
  const groups = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => (t.perm ? can(t.perm) : true) && (g.id !== "dash" || can("analytics:view"))) })).filter((g) => g.tabs.length);
  const all = groups.flatMap((g) => g.tabs);
  const active = [...all].sort((a, b) => b.to.length - a.to.length).find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)));
  const group = groups.find((g) => g.tabs.includes(active!)) ?? groups[0];
  return (
    <FilterProvider>
      <PageContainer>
        <PageHeader
          variant="hero"
          eyebrow="Intelligence & monitoring"
          title="Reports & analytics"
          description="One KPI dictionary behind every dashboard and report: engagement, points, schemes, fraud, geography, retention, scans, finance and programme reporting, with exports, schedules and threshold alerts (SOW Module 13)"
          meta={<><DemoBadge label="Development analytics data" /><span className="muted small">Development / demo data read from this browser's module stores. Nothing here is a live production dashboard, an approved KPI target or a validated finance report</span></>}
        />
        <nav className="ana-groups" aria-label="Analytics sections">
          {groups.map((g) => (
            <NavLink key={g.id} to={g.tabs[0].to} end={g.tabs[0].end} className={() => `ana-groups__btn ${g.id === group.id ? "is-active" : ""}`}>{g.label}</NavLink>
          ))}
        </nav>
        <nav className="subnav" aria-label={group.label}>
          <ul>
            {group.tabs.map((t) => (
              <li key={t.to}><NavLink to={t.to} end={t.end} className={() => `subnav__link ${active === t ? "is-active" : ""}`}><t.icon size={16} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink></li>
            ))}
          </ul>
        </nav>
        <div className="subnav-body"><Outlet /></div>
      </PageContainer>
    </FilterProvider>
  );
}

/* ======================= Global filters ======================= */

export interface FilterState {
  preset: DatePreset;
  from: string;
  to: string;
  compare: "previous" | "last_year" | "none";
  programmes: ProgrammeCode[];
  state: string;
  district: string;
  branch: string;
  memberType: string;
  categoryId: string;
  schemeId: string;
}
const FKEY = "vg-rishta.analytics-filters.v1";
const DEFAULT: FilterState = { preset: "30d", from: "", to: "", compare: "previous", programmes: [], state: "", district: "", branch: "", memberType: "", categoryId: "", schemeId: "" };
const FilterCtx = createContext<{ f: FilterState; set: (p: Partial<FilterState>) => void } | null>(null);
function FilterProvider({ children }: { children: ReactNode }) {
  const [f, setF] = useState<FilterState>(() => {
    try {
      const raw = window.sessionStorage.getItem(FKEY);
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });
  const set = (p: Partial<FilterState>) => setF((x) => {
    const n = { ...x, ...p, ...(p.state !== undefined && p.state !== x.state ? { district: "", branch: "" } : {}), ...(p.district !== undefined && p.district !== x.district ? { branch: "" } : {}) };
    try { window.sessionStorage.setItem(FKEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  return <FilterCtx.Provider value={{ f, set }}>{children}</FilterCtx.Provider>;
}
export function useFilters() {
  const c = useContext(FilterCtx);
  const f = c?.f ?? DEFAULT;
  const range = dateRange(f.preset, demoNow(), f.preset === "custom" && f.from && f.to ? { from: f.from, to: f.to } : undefined);
  const cmp = comparisonRange(range, f.compare);
  const engine: Filters = { from: range.from, to: range.to, programmes: f.programmes, state: f.state || null, district: f.district || null, branch: f.branch || null, memberType: f.memberType || null, categoryId: f.categoryId || null, schemeId: f.schemeId || null };
  const snapshot: FilterSnapshot = { period: `${range.from} → ${range.to} (${range.label})`, comparison: cmp ? `${cmp.from} → ${cmp.to}` : null, programmes: f.programmes.length ? f.programmes : null, state: f.state || null, district: f.district || null, branch: f.branch || null, memberType: f.memberType || null, category: f.categoryId || null, scheme: f.schemeId || null };
  return { f, set: c?.set ?? (() => undefined), range, cmp, engine, snapshot };
}
export const snapshotText = (s: FilterSnapshot) => Object.entries(s).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ");

type FilterKey = "date" | "compare" | "programme" | "geo" | "memberType" | "category" | "scheme";
export function FilterBar({ applies, note }: { applies: FilterKey[]; note?: string }) {
  const { f, set, range, cmp } = useFilters();
  const ms = useMasterState();
  const mem = useMemberState();
  const ss = useSchemeState();
  const off = (k: FilterKey) => !applies.includes(k);
  const st = GEOGRAPHY.find((s) => s.code === f.state);
  const ds = st?.districts.find((d) => d.code === f.district);
  const types = useMemo(() => [...new Set(mem.members.map((m) => m.memberType))].sort(), [mem.members]);
  const sel = (label: string, k: FilterKey, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <label className={`ana-filter ${off(k) ? "is-off" : ""}`} title={off(k) ? "Does not apply to this view" : undefined}>
      <span>{label}</span>
      <select value={off(k) ? "" : value} disabled={off(k)} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {off(k) ? <option value="">Not applicable</option> : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="ana-filterbar" role="group" aria-label="Analytics filters">
      {sel("Period", "date", f.preset, (v) => set({ preset: v as DatePreset }), DATE_PRESETS.map((p) => ({ value: p.id, label: p.label })))}
      {f.preset === "custom" && !off("date") && (
        <>
          <label className="ana-filter"><span>From</span><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="ana-filter"><span>To</span><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
        </>
      )}
      {sel("Compare with", "compare", f.compare, (v) => set({ compare: v as FilterState["compare"] }), [{ value: "previous", label: "Previous period" }, { value: "last_year", label: "Same period last year" }, { value: "none", label: "No comparison" }])}
      <fieldset className={`ana-filter ana-filter--chips ${off("programme") ? "is-off" : ""}`} disabled={off("programme")}>
        <legend>Programme</legend>
        {PROGRAMMES.map((p) => (
          <label key={p} className={`ana-chip ${f.programmes.includes(p) ? "is-on" : ""}`}>
            <input type="checkbox" checked={f.programmes.includes(p)} onChange={() => set({ programmes: f.programmes.includes(p) ? f.programmes.filter((x) => x !== p) : [...f.programmes, p] })} />
            {p}
          </label>
        ))}
      </fieldset>
      {sel("State", "geo", f.state, (v) => set({ state: v }), [{ value: "", label: "All states" }, ...GEOGRAPHY.map((s) => ({ value: s.code, label: s.name }))])}
      {sel("District", "geo", f.district, (v) => set({ district: v }), [{ value: "", label: st ? "All districts" : "Choose a state" }, ...(st?.districts ?? []).map((d) => ({ value: d.code, label: d.name }))])}
      {sel("Branch", "geo", f.branch, (v) => set({ branch: v }), [{ value: "", label: ds ? "All branches" : "Choose a district" }, ...(ds?.branches ?? []).map((b) => ({ value: b.code, label: b.name }))])}
      {sel("Member type", "memberType", f.memberType, (v) => set({ memberType: v }), [{ value: "", label: "All member types" }, ...types.map((t) => ({ value: t, label: t }))])}
      {sel("Product category", "category", f.categoryId, (v) => set({ categoryId: v }), [{ value: "", label: "All categories" }, ...ms.categories.map((c) => ({ value: c.id, label: c.name }))])}
      {sel("Scheme / campaign", "scheme", f.schemeId, (v) => set({ schemeId: v }), [{ value: "", label: "All schemes" }, ...ss.schemes.map((s) => ({ value: s.id, label: s.id }))])}
      <div className="ana-filterbar__period">
        <strong>{range.from} → {range.to}</strong> <span className="muted">({range.label}{cmp && !off("compare") ? ` · compared with ${cmp.from} → ${cmp.to}` : ""})</span>
        {note && <span className="muted"> · {note}</span>}
        <button type="button" className="link-btn" onClick={() => set({ ...DEFAULT })}>Clear all</button>
      </div>
    </div>
  );
}

/* ======================= Shared view hook ======================= */

export function useAnalyticsView() {
  const as = useAnalyticsState();
  useMemberState();
  useWalletState();
  useSchemeState();
  useRiskState();
  useOpsState();
  const acc = useAccessState();
  const { user, can } = useSession();
  return { as, acc, uid: user!.id, can, now: demoNow() };
}

/* ======================= Status, freshness and KPI tiles ======================= */

export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso.length === 10 ? `${iso}T00:00` : iso) : "—");
export const num = (v: number | null | undefined, digits = 0) => (v == null ? "Not available" : v.toLocaleString("en-IN", { maximumFractionDigits: digits }));
export const pct = (v: number | null | undefined) => (v == null ? "Not available" : `${(v * 100).toFixed(1)}%`);
export const inr = (v: number | null | undefined) => (v == null ? "Not available" : `₹${Math.round(v).toLocaleString("en-IN")}`);
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;
export const ProvisionalTag = () => <span className="ana-prov" title="SOW definition used as a provisional development measure (OP-KPI1)">Provisional · OP-KPI1</span>;
export function DecisionRef({ id, label }: { id: string; label?: string }) {
  return <Link to={`${ABASE}/history?tab=decisions#${id}`} className="decision-ref mono">{label ?? id}</Link>;
}
export function Freshness({ domain }: { domain: string }) {
  useAnalyticsState();
  const fr = freshness(domain);
  const tone = fr.status === "stale" || fr.status === "unavailable" ? "warning" : fr.status === "scheduled" ? "neutral" : "info";
  return (
    <span className="ana-fresh" title={`Source: ${fr.source}`}>
      <StatusBadge tone={tone}>{FRESHNESS_LABEL[fr.status]}</StatusBadge>
      <span className="muted small">{fr.status === "stale" ? `Source unavailable · showing last refresh ${dt(fr.lastRefresh)}` : `Refreshed ${dt(fr.lastRefresh)}`}</span>
    </span>
  );
}
export function KpiTile({ label, value, period, status = "provisional", detail, onSelect, tone }: { label: string; value: string; period: string; status?: "provisional" | "confirmed" | "bcr" | "data"; detail?: string; onSelect?: () => void; tone?: "accent" | "warn" }) {
  const body = (
    <>
      <span className="ana-tile__label">{label}</span>
      <span className={`ana-tile__value num ${value === "Not available" ? "is-na" : ""}`}>{value}</span>
      <span className="ana-tile__period">{period}</span>
      {status === "provisional" && <ProvisionalTag />}
      {status === "bcr" && <BcrTag>Inputs not supplied</BcrTag>}
      {detail && <span className="ana-tile__detail">{detail}</span>}
    </>
  );
  return onSelect ? <button type="button" className={`ana-tile ana-tile--btn ${tone ? `ana-tile--${tone}` : ""}`} onClick={onSelect}>{body}</button> : <div className={`ana-tile ${tone ? `ana-tile--${tone}` : ""}`}>{body}</div>;
}
export function Refresh() {
  const { uid } = useAnalyticsView();
  const { notify } = useToast();
  return <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = refreshAnalytics(uid); notify(r.ok ? "Analytics refreshed from the module stores" : r.errors[0], r.ok ? "positive" : "negative"); }}><RefreshCw size={14} aria-hidden="true" />Refresh</button>;
}

/* ======================= Exports ======================= */

export interface Col<T> { header: string; value: (r: T) => string | number | null }
const xmlEsc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Excel workbook (SpreadsheetML 2003, opens in Excel): a "Report" sheet and a "Filters" sheet. */
export function downloadXls<T>(name: string, cols: Col<T>[], rows: T[], meta: [string, string][]) {
  const cell = (v: unknown) => (typeof v === "number" ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`);
  const sheet = (title: string, body: string) => `<Worksheet ss:Name="${xmlEsc(title)}"><Table>${body}</Table></Worksheet>`;
  const report = `<Row>${cols.map((c) => cell(c.header)).join("")}</Row>${rows.map((r) => `<Row>${cols.map((c) => cell(c.value(r))).join("")}</Row>`).join("")}`;
  const filters = meta.map(([k, v]) => `<Row>${cell(k)}${cell(v)}</Row>`).join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheet("Report", report)}${sheet("Filters", filters)}</Workbook>`;
  save(new Blob([xml], { type: "application/vnd.ms-excel" }), `${name}.xls`);
}
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const metaFor = (r: ExportRecord, title: string): [string, string][] => [["Report", title], ["Export reference", r.id], ["Generated", r.at], ["Generated by", r.by], ["Source data timestamp", r.sourceTimestamp], ...Object.entries(r.filters).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v ?? "All"] as [string, string]), ["Data", "DEVELOPMENT / DEMO DATA — not V-Guard production figures"]];

/** Export buttons for a report table. Permission and scope are re-checked by the analytics service. */
export function ExportButtons<T>({ reportId, name, cols, rows, extra, unmaskedOption, containsMembers }: { reportId: string; name: string; cols: Col<T>[]; rows: T[]; extra?: FilterSnapshot; unmaskedOption?: { label: string; cols: Col<T>[]; rows: T[] }; containsMembers?: boolean }) {
  const { uid } = useAnalyticsView();
  const { snapshot } = useFilters();
  const { notify } = useToast();
  const [result, setResult] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null);
  const def = REPORTS.find((r) => r.id === reportId)!;
  const go = (format: "csv" | "xlsx", unmasked = false) => {
    const filters = { ...snapshot, ...extra };
    const c = unmasked && unmaskedOption ? unmaskedOption.cols : cols;
    const data = unmasked && unmaskedOption ? unmaskedOption.rows : rows;
    const r = exportReport(uid, reportId, format, filters, data.length, { unmasked, containsMembers });
    setResult(r.ok ? null : r);
    if (!r.ok || !r.record) return;
    const meta = metaFor(r.record, def.name);
    if (format === "csv") downloadCsv(name, c, data, meta.map(([k, v]) => `${k}: ${v}`).join(" | "));
    else downloadXls(name, c, data, meta);
    notify(`${r.record.id}: ${data.length} rows exported`, "positive");
  };
  return (
    <span className="ana-export">
      {def.formats.includes("csv") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("csv")}><Download size={14} aria-hidden="true" />CSV</button>}
      {def.formats.includes("xlsx") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("xlsx")}><FileSpreadsheet size={14} aria-hidden="true" />Excel</button>}
      {unmaskedOption && <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("xlsx", true)}><FileSpreadsheet size={14} aria-hidden="true" />{unmaskedOption.label}</button>}
      {result && <PolicyMessages result={result} />}
    </span>
  );
}

/** Dashboard export: the visible figures and charts, with the active filters printed on the image. */
export function DashboardExport({ reportId, target, title }: { reportId: string; target: RefObject<HTMLElement>; title: string }) {
  const { uid } = useAnalyticsView();
  const { snapshot } = useFilters();
  const { notify } = useToast();
  const [result, setResult] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null);
  const go = async (format: "pdf" | "png") => {
    if (!target.current) return;
    const r = exportReport(uid, reportId, format, snapshot, target.current.querySelectorAll(".ana-tile").length);
    setResult(r.ok ? null : r);
    if (!r.ok || !r.record) return;
    const canvas = await snapshotCanvas(target.current, title, snapshotText(snapshot), r.record);
    if (format === "png") canvas.toBlob((b) => b && save(b, `${reportId.toLowerCase()}-${r.record!.id}.png`), "image/png");
    else {
      const bytes = Uint8Array.from(atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]), (ch) => ch.charCodeAt(0));
      save(new Blob([buildTestPdf(bytes, canvas.width, canvas.height, "DEVELOPMENT DATA")], { type: "application/pdf" }), `${reportId.toLowerCase()}-${r.record.id}.pdf`);
    }
    notify(`${r.record.id}: dashboard exported as ${format.toUpperCase()}`, "positive");
  };
  return (
    <span className="ana-export">
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("pdf")}><FileText size={14} aria-hidden="true" />PDF</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("png")}><FileImage size={14} aria-hidden="true" />PNG</button>
      {result && <PolicyMessages result={result} />}
    </span>
  );
}
async function snapshotCanvas(el: HTMLElement, title: string, filters: string, rec: ExportRecord) {
  const W = 1400;
  const tiles = [...el.querySelectorAll<HTMLElement>(".ana-tile")].map((t) => ({ label: t.querySelector(".ana-tile__label")?.textContent ?? "", value: t.querySelector(".ana-tile__value")?.textContent ?? "", period: t.querySelector(".ana-tile__period")?.textContent ?? "" }));
  const svgs = [...el.querySelectorAll<SVGSVGElement>("svg.recharts-surface")].slice(0, 8);
  const imgs = await Promise.all(svgs.map((s) => new Promise<{ img: HTMLImageElement; w: number; h: number; title: string } | null>((res) => {
    const clone = s.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const w = s.clientWidth || Number(s.getAttribute("width")) || 600;
    const h = s.clientHeight || Number(s.getAttribute("height")) || 260;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    const xml = new XMLSerializer().serializeToString(clone).replace(/var\(--[^)]+\)/g, "#9a8a5c");
    const img = new Image();
    img.onload = () => res({ img, w, h, title: s.closest(".panel")?.querySelector("h2,h3,h4")?.textContent ?? "" });
    img.onerror = () => res(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  })));
  const charts = imgs.filter(Boolean) as { img: HTMLImageElement; w: number; h: number; title: string }[];
  const tileRows = Math.ceil(tiles.length / 5);
  const H = 150 + tileRows * 96 + Math.ceil(charts.length / 2) * 330 + 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#f5b800";
  g.fillRect(0, 0, W, 8);
  g.fillStyle = "#111318";
  g.font = "600 26px sans-serif";
  g.fillText(`V-Guard Rishta · ${title}`, 32, 50);
  g.font = "14px sans-serif";
  g.fillStyle = "#4a4d55";
  wrap(g, `Filters: ${filters}`, 32, 78, W - 64, 18);
  g.fillText(`${rec.id} · generated ${rec.at} by ${rec.by} · source data ${rec.sourceTimestamp} · DEVELOPMENT / DEMO DATA`, 32, 122);
  tiles.forEach((t, i) => {
    const x = 32 + (i % 5) * 268, y = 140 + Math.floor(i / 5) * 96;
    g.strokeStyle = "#e5e1d6";
    g.strokeRect(x, y, 256, 84);
    g.fillStyle = "#4a4d55";
    g.font = "13px sans-serif";
    g.fillText(t.label.slice(0, 34), x + 12, y + 22);
    g.fillStyle = "#111318";
    g.font = "600 24px sans-serif";
    g.fillText(t.value.slice(0, 18), x + 12, y + 54);
    g.fillStyle = "#7a7d85";
    g.font = "12px sans-serif";
    g.fillText(t.period.slice(0, 38), x + 12, y + 74);
  });
  const top = 150 + tileRows * 96;
  charts.forEach((ch, i) => {
    const x = 32 + (i % 2) * 676, y = top + Math.floor(i / 2) * 330;
    g.fillStyle = "#111318";
    g.font = "600 15px sans-serif";
    g.fillText(ch.title.slice(0, 70), x, y + 14);
    const s = Math.min(660 / ch.w, 290 / ch.h);
    g.drawImage(ch.img, x, y + 24, ch.w * s, ch.h * s);
  });
  return c;
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  let yy = y;
  for (const w of text.split(" ")) {
    if (g.measureText(`${line}${w} `).width > max) { g.fillText(line, x, yy); line = ""; yy += lh; }
    line += `${w} `;
  }
  g.fillText(line, x, yy);
}
