import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, AlertTriangle, BadgeCheck, CalendarClock, ChevronRight, Hourglass, PauseCircle, RotateCcw, ScanLine, ShieldBan, Users, UserCheck, Wallet, Save } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { DonutChart, TrendChart } from "@/components/charts/Charts";
import { RankedBars } from "@/components/ui/DataBars";
import { SelectField } from "@/components/ui/primitives";
import { PROGRAMME_REQUIREMENTS, REG_STATUS, SOURCE_LABEL, KYC_OVERALL } from "@/config/memberProgrammes";
import { GEOGRAPHY } from "@/config/geography";
import { programmeColor } from "@/config/programmes";
import { CHART } from "@/lib/chartColors";
import { formatDateTime } from "@/lib/format";
import { demoNow } from "@/features/approvals/store";
import { activeRestrictions, ageingDays, branchInfo, kycOverall, redemptionEligibility, scanEligibility } from "@/features/members/engine";
import type { Member, MemberEvent } from "@/types/members";
import { SectionTitle } from "@/pages/users/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { memberCells, MemberEventsTable, useMemberView } from "./shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Preset = "all" | "active" | "scan" | "redemption" | "pending_reg" | "pending_kyc" | "blocked" | "hold" | "incomplete_kyc" | "recent" | "reinstatement" | "cross";

export function presetFilter(p: Preset, m: Member, s: ReturnType<typeof useMemberView>["s"], now: string) {
  switch (p) {
    case "active": return ["active_scan", "redemption_kyc_pending", "redemption_enabled", "provisioned"].includes(m.status) && !activeRestrictions(s, m).length;
    case "scan": return scanEligibility(s, m).allowed;
    case "redemption": return redemptionEligibility(s, m).allowed;
    case "pending_reg": return m.status === "pending" || m.status === "invited";
    case "pending_kyc": return s.documents.some((d) => d.memberId === m.id && ["pending", "under_review"].includes(d.status));
    case "blocked": return activeRestrictions(s, m).some((r) => r.type === "program_block");
    case "hold": return activeRestrictions(s, m).some((r) => r.type === "temporary_hold");
    case "incomplete_kyc": return kycOverall(s, m) !== "verified";
    case "recent": return ageingDays(m.registration.submittedAt, now) <= 30;
    case "reinstatement": return activeRestrictions(s, m).some((r) => r.status === "reinstatement_pending");
    case "cross": return s.members.filter((x) => x.identityId === m.identityId).length > 1;
    default: return true;
  }
}

export function MemberOverviewPage() {
  const v = useMemberView();
  const { s, visible } = v;
  const navigate = useNavigate();
  const now = demoNow();
  const [prog, setProg] = useState("all");
  const [range, setRange] = useState("180");
  const [geo, setGeo] = useState<{ state?: string; district?: string }>({});
  const count = (p: Preset) => visible.filter((m) => presetFilter(p, m, s, now)).length;
  const go = (p: Preset) => () => navigate(`/members/directory?preset=${p}`);
  const kpis = [
    { id: "all", label: "Total registered members", value: visible.length, desc: "Within your programme and geography scope", variant: "dark" as const, icon: Users, onSelect: go("all") },
    { id: "active", label: "Active members", value: count("active"), desc: "Active and not restricted", variant: "status" as const, tone: "positive" as const, icon: UserCheck, onSelect: go("active") },
    { id: "scan", label: "Scan-enabled members", value: count("scan"), desc: "Scanning currently allowed", variant: "primary" as const, icon: ScanLine, onSelect: go("scan") },
    { id: "redemption", label: "Redemption-enabled members", value: count("redemption"), desc: "Redemption currently allowed", variant: "light" as const, icon: Wallet, onSelect: go("redemption") },
    { id: "pending_reg", label: "Pending registrations", value: count("pending_reg"), desc: "Pending Stage 1 or invitation", variant: "status" as const, tone: "warning" as const, icon: Hourglass, onSelect: go("pending_reg") },
    { id: "pending_kyc", label: "Pending KYC", value: count("pending_kyc"), desc: "At least one document awaiting review", variant: "status" as const, tone: "warning" as const, icon: BadgeCheck, onSelect: go("pending_kyc") },
    { id: "blocked", label: "Program blocked members", value: count("blocked"), desc: "Blocked in one programme", variant: "status" as const, tone: "negative" as const, icon: ShieldBan, onSelect: go("blocked") },
    { id: "hold", label: "Members on temporary hold", value: count("hold"), desc: "Held across linked programmes", variant: "status" as const, tone: "negative" as const, icon: PauseCircle, onSelect: go("hold") },
    { id: "incomplete", label: "Members with incomplete KYC", value: count("incomplete_kyc"), desc: "Mandatory documents not all verified", variant: "light" as const, icon: AlertTriangle, onSelect: go("incomplete_kyc") },
    { id: "recent", label: "Recently registered", value: count("recent"), desc: "Registered in the last 30 days", variant: "light" as const, icon: CalendarClock, onSelect: go("recent") },
    { id: "reinst", label: "Pending reinstatement", value: count("reinstatement"), desc: "Reinstatement awaiting approval", variant: "light" as const, icon: RotateCcw, onSelect: go("reinstatement") },
    { id: "cross", label: "Cross-programme members", value: count("cross"), desc: "Identity linked to more than one programme", variant: "light" as const, icon: Activity, onSelect: go("cross") },
  ];
  const progRows = PROGRAMME_REQUIREMENTS.map((r) => {
    const ms = visible.filter((m) => m.programme === r.code);
    const c = (p: Preset) => ms.filter((m) => presetFilter(p, m, s, now)).length;
    return { code: r.code, label: r.label, total: ms.length, active: c("active"), pending: c("pending_reg"), scan: c("scan"), redemption: c("redemption"), kyc: c("pending_kyc"), blocked: c("blocked"), hold: c("hold") };
  });
  const scoped = visible.filter((m) => prog === "all" || m.programme === prog).filter((m) => ageingDays(m.registration.submittedAt, now) <= Number(range));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(new Date(now).getTime() - (29 - i) * 86400000).toISOString().slice(0, 10);
    return { key: d, label: `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`, Registrations: scoped.filter((m) => m.registration.submittedAt.slice(0, 10) === d).length };
  });
  const months = Array.from({ length: Math.min(18, Math.ceil(Number(range) / 30)) }, (_, i) => {
    const d = new Date(now.slice(0, 7) + "-01T00:00");
    d.setMonth(d.getMonth() - (Math.min(18, Math.ceil(Number(range) / 30)) - 1 - i));
    return d.toISOString().slice(0, 7);
  });
  const monthly = months.map((mo) => ({
    key: mo,
    label: `${MONTHS[Number(mo.slice(5)) - 1]} ${mo.slice(2, 4)}`,
    ...Object.fromEntries(PROGRAMME_REQUIREMENTS.map((r) => [r.code, scoped.filter((m) => m.programme === r.code && m.registration.submittedAt.slice(0, 7) === mo).length])),
    "KYC completed": scoped.filter((m) => m.registration.stage2?.at.slice(0, 7) === mo).length,
  }));
  const approvedVsPending = [
    { key: "approved", label: "Stage 1 approved / activated", value: scoped.filter((m) => m.registration.stage1 && m.registration.stage1.decision !== "rejected").length, color: CHART.positive },
    { key: "pending", label: "Pending", value: scoped.filter((m) => m.status === "pending" || m.status === "invited").length, color: CHART.warning },
    { key: "rejected", label: "Rejected", value: scoped.filter((m) => m.status === "rejected").length, color: CHART.negative },
  ].filter((x) => x.value);
  const level = geo.district ? "branch" : geo.state ? "district" : "state";
  const geoItems = useMemo(() => {
    const map = new Map<string, { label: string; members: Member[] }>();
    visible.forEach((m) => {
      const b = branchInfo(m);
      if (!b || (geo.state && b.state.code !== geo.state) || (geo.district && b.district.code !== geo.district)) return;
      const key = level === "state" ? b.state.code : level === "district" ? b.district.code : b.branch.code;
      const label = level === "state" ? b.state.name : level === "district" ? b.district.name : b.branch.name;
      const e = map.get(key) ?? { label, members: [] };
      e.members.push(m);
      map.set(key, e);
    });
    return Array.from(map.entries()).map(([key, e]) => ({ key, label: e.label, total: e.members.length, active: e.members.filter((m) => presetFilter("active", m, s, now)).length, kyc: e.members.filter((m) => presetFilter("pending_kyc", m, s, now)).length, byProg: PROGRAMME_REQUIREMENTS.map((r) => `${r.code} ${e.members.filter((m) => m.programme === r.code).length}`).join(" · ") })).sort((a, b) => b.total - a.total);
  }, [visible, geo, level, s, now]);
  const visibleIds = new Set(visible.map((m) => m.id));
  const recent = s.events.filter((e) => visibleIds.has(e.memberId) && ["registration", "kyc", "profile", "restriction", "mpin", "address"].includes(e.category));
  return (
    <>
      <SectionTitle title="Member overview" description="Development member data across the five programmes, limited to your scope" />
      <KpiGrid items={kpis} cols={4} />
      <Panel title="Programme-wise members" subtitle="From the central programme requirement model" level={3} padded={false}>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Programme summary</caption>
            <thead><tr><th scope="col">Programme</th>{["Total", "Active", "Pending", "Scan enabled", "Redemption enabled", "KYC pending", "Blocked", "On hold"].map((h) => <th key={h} scope="col" className="is-right">{h}</th>)}</tr></thead>
            <tbody>{progRows.map((r) => <tr key={r.code}><td><strong>{r.code}</strong> <span className="small muted">{r.label}</span></td>{[r.total, r.active, r.pending, r.scan, r.redemption, r.kyc, r.blocked, r.hold].map((n, i) => <td key={i} className="is-right num">{n}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <div className="grid-2">
        <Panel title="Programme distribution" level={3}><DonutChart items={progRows.map((r) => ({ key: r.code, label: r.code, value: r.total, color: programmeColor(r.code) }))} centerLabel="members" ariaLabel="Members by programme" height={200} /></Panel>
        <Panel title="Registration status" level={3}><RankedBars items={Object.entries(REG_STATUS).map(([k, v]) => ({ key: k, label: v.label, value: visible.filter((m) => m.status === k).length, tone: v.tone })).filter((x) => x.value)} /></Panel>
      </div>
      <Panel title="Registration and verification trend" level={3} actions={<div className="btn-row"><SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All programmes" }, ...PROGRAMME_REQUIREMENTS.map((r) => ({ value: r.code, label: r.code }))]} active={prog !== "all"} /><SelectField label="Period" value={range} onChange={setRange} options={[{ value: "90", label: "Last 90 days" }, { value: "180", label: "Last 6 months" }, { value: "365", label: "Last 12 months" }, { value: "540", label: "Last 18 months" }]} /></div>}>
        <div className="grid-2">
          <div><p className="small muted">Daily registrations, last 30 days</p><TrendChart data={daily} series={[{ key: "Registrations", label: "Registrations", color: CHART.lead }]} kind="bar" height={200} ariaLabel="Daily registrations" legend={false} /></div>
          <div><p className="small muted">Approved versus pending</p><DonutChart items={approvedVsPending} centerLabel="registrations" ariaLabel="Approved versus pending registrations" height={200} /></div>
        </div>
        <p className="small muted">Monthly registrations by programme, with KYC completions (Stage 2 = redemption eligibility)</p>
        <TrendChart data={monthly} series={[...PROGRAMME_REQUIREMENTS.map((r) => ({ key: r.code, label: r.code, color: programmeColor(r.code) })), { key: "KYC completed", label: "KYC completed / redemption enabled", color: CHART.positive, dashed: true }]} kind="line" height={240} ariaLabel="Monthly registrations and KYC completions" />
      </Panel>
      <Panel title="Geographic distribution" subtitle="Hierarchy from Branch & hierarchy. Select a row to drill down" level={3} actions={
        <nav className="geo-crumbs" aria-label="Geography level">
          <button type="button" className="link-btn" onClick={() => setGeo({})}>All states</button>
          {geo.state && <><ChevronRight size={12} aria-hidden="true" /><button type="button" className="link-btn" onClick={() => setGeo({ state: geo.state })}>{GEOGRAPHY.find((g) => g.code === geo.state)?.name}</button></>}
          {geo.district && <><ChevronRight size={12} aria-hidden="true" /><span className="small">{GEOGRAPHY.flatMap((g) => g.districts).find((d) => d.code === geo.district)?.name}</span></>}
        </nav>
      } padded={false}>
        <DataTable rows={geoItems} rowKey={(x) => x.key} caption="Members by geography" searchable={false} pageSize={8} onRowClick={(x) => level === "state" ? setGeo({ state: x.key }) : level === "district" ? setGeo({ ...geo, district: x.key }) : navigate(`/members/directory?branch=${x.key}`)} rowActionLabel={(x) => `Drill into ${x.label}`} initialSort={{ key: "total", dir: "desc" }} columns={[
          { key: "label", header: level === "state" ? "State" : level === "district" ? "District" : "Branch", value: (x) => x.label },
          { key: "total", header: "Members", value: (x) => x.total, align: "right" },
          { key: "active", header: "Active", value: (x) => x.active, align: "right" },
          { key: "kyc", header: "Pending KYC", value: (x) => x.kyc, align: "right" },
          { key: "prog", header: "By programme", value: (x) => x.byProg, render: (x) => <span className="small">{x.byProg}</span> },
        ] as Column<(typeof geoItems)[number]>[]} />
      </Panel>
      <MemberEventsTable events={recent} acc={v.acc} title="Recent member activity" showMember pageSize={8} />
    </>
  );
}

/* ---------------- Directory ---------------- */

const SAVED_KEY = "vg-rishta.member-directory-filter";

export function MemberDirectoryPage() {
  const v = useMemberView();
  const { s, visible, can } = v;
  const navigate = useNavigate();
  const now = demoNow();
  const [params, setParams] = useSearchParams();
  const initial = (() => { try { return JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null") as Record<string, string> | null; } catch { return null; } })();
  const [f, setF] = useState<Record<string, string>>(() => ({ q: "", prog: "all", source: "all", status: "all", scan: "all", red: "all", kyc: "all", block: "all", hold: "all", state: "all", district: "all", branch: params.get("branch") ?? "all", sr: "all", age: "all", from: "", to: "", ...(params.get("preset") || params.get("branch") ? {} : initial ?? {}) }));
  const [pageSize, setPageSize] = useState(10);
  const preset = (params.get("preset") as Preset) ?? "all";
  const set = (k: string, val: string) => setF((x) => ({ ...x, [k]: val, ...(k === "state" ? { district: "all", branch: "all" } : k === "district" ? { branch: "all" } : {}) }));
  const srs = Array.from(new Set(visible.map((m) => m.sr).filter(Boolean))) as string[];
  const rows = visible.filter((m) => {
    const t = f.q.trim().toLowerCase();
    if (t) {
      const digits = t.replace(/\D/g, "");
      const mobileHit = digits.length >= 4 && (v.sensitive(m) ? m.mobile.replace(/\D/g, "").includes(digits) : m.mobile.replace(/\D/g, "").endsWith(digits));
      const text = [m.id, m.name, m.programme, branchInfo(m)?.branch.name ?? "", m.sr ?? "", m.registration.sfdcRef ?? ""].join(" ").toLowerCase();
      if (!text.includes(t) && !mobileHit) return false;
    }
    const b = branchInfo(m);
    if (f.prog !== "all" && m.programme !== f.prog) return false;
    if (f.source !== "all" && m.registration.source !== f.source) return false;
    if (f.status !== "all" && m.status !== f.status) return false;
    if (f.scan !== "all" && String(scanEligibility(s, m).allowed) !== f.scan) return false;
    if (f.red !== "all" && String(redemptionEligibility(s, m).allowed) !== f.red) return false;
    if (f.kyc !== "all" && kycOverall(s, m) !== f.kyc) return false;
    if (f.block !== "all" && String(activeRestrictions(s, m).some((r) => r.type === "program_block")) !== f.block) return false;
    if (f.hold !== "all" && String(activeRestrictions(s, m).some((r) => r.type === "temporary_hold")) !== f.hold) return false;
    if (f.state !== "all" && b?.state.code !== f.state) return false;
    if (f.district !== "all" && b?.district.code !== f.district) return false;
    if (f.branch !== "all" && m.branchCode !== f.branch) return false;
    if (f.sr !== "all" && m.sr !== f.sr) return false;
    if (f.age !== "all" && ageingDays(m.registration.submittedAt, now) < Number(f.age)) return false;
    if (f.from && m.registration.submittedAt.slice(0, 10) < f.from) return false;
    if (f.to && m.registration.submittedAt.slice(0, 10) > f.to) return false;
    return presetFilter(preset, m, s, now);
  });
  const c = memberCells(s, v.sensitive);
  const cols: Column<Member>[] = [
    c.id, c.name, c.mobile, c.programme,
    { key: "type", header: "Member type", value: (m) => m.memberType, render: (m) => <span className="small">{m.memberType}</span> },
    { key: "state", header: "State", value: (m) => branchInfo(m)?.state.name ?? "" },
    { key: "district", header: "District", value: (m) => branchInfo(m)?.district.name ?? "" },
    { key: "branch", header: "Branch", value: (m) => branchInfo(m)?.branch.name ?? m.branchCode },
    { key: "sr", header: "Sales Rep", value: (m) => m.sr ?? "", render: (m) => <span className="small">{m.sr ?? "—"}</span> },
    c.source,
    { key: "date", header: "Registration date", value: (m) => m.registration.submittedAt, render: (m) => <span className="small num">{formatDateTime(m.registration.submittedAt).split(",")[0]}</span> },
    c.status, c.scan, c.redemption, c.kyc, c.restriction,
    { key: "act", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (m) => <Link to={`/members/member/${m.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>Member 360</Link> },
  ];
  const any = Object.entries(f).some(([k, val]) => (k === "q" || k === "from" || k === "to" ? !!val : val !== "all")) || preset !== "all";
  const sel = (k: string, label: string, options: { value: string; label: string }[]) => <SelectField label={label} value={f[k]} onChange={(x) => set(k, x)} options={[{ value: "all", label: "Any" }, ...options]} active={f[k] !== "all"} />;
  const yn = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
  return (
    <>
      <SectionTitle title="Member directory" description="Results are limited to your programme and geography scope. Mobile numbers are masked unless you hold View sensitive" />
      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={f.q} onChange={(x) => set("q", x)} placeholder="Member ID, name, mobile (last 4), branch, SR or SFDC ref" label="Search members" />
          {sel("prog", "Programme", PROGRAMME_REQUIREMENTS.map((r) => ({ value: r.code, label: r.code })))}
          {sel("source", "Registration source", Object.entries(SOURCE_LABEL).map(([k, l]) => ({ value: k, label: l })))}
          {sel("status", "Registration status", Object.entries(REG_STATUS).map(([k, x]) => ({ value: k, label: x.label })))}
          {sel("scan", "Scan allowed", yn)}
          {sel("red", "Redemption allowed", yn)}
          {sel("kyc", "KYC status", Object.entries(KYC_OVERALL).map(([k, x]) => ({ value: k, label: x.label })))}
          {sel("block", "Program block", yn)}
          {sel("hold", "Temporary hold", yn)}
          {sel("state", "State", GEOGRAPHY.map((g) => ({ value: g.code, label: g.name })))}
          {sel("district", "District", GEOGRAPHY.filter((g) => f.state === "all" || g.code === f.state).flatMap((g) => g.districts.map((d) => ({ value: d.code, label: d.name }))))}
          {sel("branch", "Branch", GEOGRAPHY.filter((g) => f.state === "all" || g.code === f.state).flatMap((g) => g.districts.filter((d) => f.district === "all" || d.code === f.district).flatMap((d) => d.branches.map((b) => ({ value: b.code, label: b.name })))))}
          {sel("sr", "Sales Rep", srs.map((x) => ({ value: x, label: x })))}
          {sel("age", "Registration ageing", [{ value: "7", label: "Older than 7 days" }, { value: "30", label: "Older than 30 days" }, { value: "180", label: "Older than 6 months" }])}
          <label className="field"><span className="field__label">Registered from</span><input type="date" className={`select ${f.from ? "is-set" : ""}`} value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
          <label className="field"><span className="field__label">Registered to</span><input type="date" className={`select ${f.to ? "is-set" : ""}`} value={f.to} onChange={(e) => set("to", e.target.value)} /></label>
          <div className="filters-bar__end">
            <SelectField label="Rows per page" value={String(pageSize)} onChange={(x) => setPageSize(Number(x))} options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(f)); } catch { /* storage unavailable */ } }} title="Remembered in this browser only"><Save size={14} strokeWidth={2} aria-hidden="true" />Save filter</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={!any} onClick={() => { setF({ q: "", prog: "all", source: "all", status: "all", scan: "all", red: "all", kyc: "all", block: "all", hold: "all", state: "all", district: "all", branch: "all", sr: "all", age: "all", from: "", to: "" }); setParams({}); try { window.localStorage.removeItem(SAVED_KEY); } catch { /* ignore */ } }}><RotateCcw size={14} strokeWidth={2} aria-hidden="true" />Clear all</button>
          </div>
        </div>
        <p className="filters-bar__count" aria-live="polite">{rows.length} of {visible.length} members in your scope{preset !== "all" ? ` · preset: ${preset.replace(/_/g, " ")}` : ""}</p>
        <DataTable key={pageSize} rows={rows} columns={cols} rowKey={(m) => m.id} caption="Member directory" searchable={false} pageSize={pageSize} exportName={can("members:export") ? "member-directory" : undefined} onRowClick={(m) => navigate(`/members/member/${m.id}`)} rowActionLabel={(m) => `Open Member 360 for ${m.id}`} initialSort={{ key: "date", dir: "desc" }} emptyTitle="No members match these filters" />
      </Panel>
    </>
  );
}

export function Member360Picker() {
  const v = useMemberView();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const hits = q.trim().length >= 2 ? v.visible.filter((m) => [m.id, m.name].join(" ").toLowerCase().includes(q.trim().toLowerCase()) || (q.replace(/\D/g, "").length >= 4 && m.mobile.replace(/\D/g, "").endsWith(q.replace(/\D/g, "")))).slice(0, 12) : [];
  return (
    <>
      <SectionTitle title="Member 360" description="Open the complete dossier for one member" />
      <Panel level={3}>
        <SearchInput value={q} onChange={setQ} placeholder="Member ID, name or last 4 digits of the mobile" label="Find member" />
        <ul className="ref-list ref-list--plain">
          {hits.map((m) => <li key={m.id}><button type="button" className="link-btn" onClick={() => navigate(`/members/member/${m.id}`)}><span className="mono">{m.id}</span> · {m.name} · {m.programme} · {branchInfo(m)?.branch.name}</button></li>)}
          {q.trim().length >= 2 && !hits.length && <li className="muted small">No member in your scope matches.</li>}
        </ul>
        <p className="small muted">Suggested scenario records: <Link to="/members/member/MBR-EP-0005">MBR-EP-0005</Link> (cross-programme, fully verified) · <Link to="/members/member/MBR-EP-0003">MBR-EP-0003</Link> (Stage 2 pending) · <Link to="/members/member/MBR-DD-0001">MBR-DD-0001</Link> (DD).</p>
      </Panel>
    </>
  );
}

export function MemberActivityPage() {
  const v = useMemberView();
  const ids = new Set(v.visible.map((m) => m.id));
  const [cat, setCat] = useState("all");
  const events = v.s.events.filter((e: MemberEvent) => ids.has(e.memberId) && (cat === "all" || e.category === cat));
  return (
    <>
      <SectionTitle title="Member activity history" description="Every recorded member event within your scope" actions={<SelectField label="Type" value={cat} onChange={setCat} options={[{ value: "all", label: "All types" }, ...["registration", "kyc", "profile", "address", "restriction", "mpin", "activity", "sfdc", "security"].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))]} active={cat !== "all"} />} />
      <MemberEventsTable events={events} acc={v.acc} title="Activity" showMember pageSize={15} />
      <Panel level={3} title="Notification events" subtitle="Recorded through the notification abstraction. Nothing is sent: in-app, email, SMS and dashboard channels are not connected" padded={false}>
        <DataTable rows={v.s.notifications.filter((n) => ids.has(n.memberId))} rowKey={(n) => n.id} caption="Notification events" searchPlaceholder="Search notifications" initialSort={{ key: "at", dir: "desc" }} emptyTitle="No notification events yet" columns={[
          { key: "at", header: "Time", value: (n) => n.at, render: (n) => <span className="small num">{formatDateTime(n.at)}</span> },
          { key: "member", header: "Member", value: (n) => n.memberId, render: (n) => <span className="mono small">{n.memberId}</span> },
          { key: "event", header: "Event", value: (n) => n.event },
          { key: "aud", header: "Audience", value: (n) => n.audience.replace("_", "/") },
          { key: "ch", header: "Channels", value: (n) => n.channels.join(", ") },
          { key: "msg", header: "Message", value: (n) => n.message, render: (n) => <span className="small cell-wrap">{n.message}</span> },
          { key: "del", header: "Delivery", value: () => "Recorded (mock)", render: () => <span className="small muted">Recorded, not sent</span> },
        ] as Column<(typeof v.s.notifications)[number]>[]} />
      </Panel>
    </>
  );
}


