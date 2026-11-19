import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Ban, Eye, Lock } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { TextArea, TextField, SelectInput, Tabs } from "@/components/form/Form";
import { createThemeDraft, endViewAs, previewTheme, publishTheme, setViewAsIdle, startViewAs, submitThemeForApproval, updateTheme, usageView, validateViewAsAccess, viewAsHistory, viewAsMemberApp, decisionStatus, type ThemeInput } from "@/features/platform/store";
import { activeSession, durationSec } from "@/features/platform/viewAsSession";
import { SCREENS } from "@/features/platform/usage";
import { useSchemeState } from "@/features/schemes/store";
import { GEOGRAPHY } from "@/config/geography";
import { PROGRAMMES } from "@/config/platformCatalogue";
import type { AppTheme } from "@/types/platform";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, PBASE, Tile, dt, memberLink, usePlatformView, useParam, useRun, userName } from "./shared";

const secs = (n: number | null) => (n == null ? "Not available" : n >= 60 ? `${Math.floor(n / 60)} min ${Math.round(n % 60)} s` : `${Math.round(n)} s`);
const pct = (n: number | null) => (n == null ? "Not available" : `${(n * 100).toFixed(1)}%`);

/* ======================= View-As ======================= */

export function ViewAsPage() {
  const v = usePlatformView();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { result, run } = useRun();
  const [ref, setRef] = useState(params.get("member") ?? "");
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [idle, setIdle] = useState(String(v.va.idleMinutes));
  const check = ref.trim() ? validateViewAsAccess(v.uid, ref, override ? { reason } : undefined) : null;
  const h = viewAsHistory(v.uid);
  const s = activeSession(v.uid);
  const canOverride = v.can("view-as:override");
  return (
    <>
      <SectionTitle title="View-As" description="Show a member what their app looks like, or see what they see when they report a problem (SOW 10.7). Strictly read-only: every change is refused by the permission service, not just hidden. Aadhaar, PAN and bank account values are never shown" />
      {s && <Notice tone="warn"><strong>View-As session {s.id} is open</strong> for member {s.memberId}. <Link to={`${PBASE}/view-as/session`}>Open the member view</Link> or exit from the banner.</Notice>}
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Start a View-As session">
          <div className="form-grid">
            <TextField label="Member ID or registered mobile" value={ref} onChange={setRef} hint="Mobile search needs Member management: View sensitive" />
          </div>
          {canOverride && <label className="ana-check"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Use the HO / Admin override (outside my branch)</label>}
          {override && <TextArea label="Override reason (ticket or member request)" value={reason} onChange={setReason} rows={2} />}
          {check && (
            <p className={`small ${check.allowed ? "" : "text-warning"}`}>{check.allowed ? "✓ " : ""}{check.reason}</p>
          )}
          <button type="button" className="btn btn--primary btn--sm" disabled={!ref.trim()} onClick={() => { const r = run(startViewAs(v.uid, ref, { override: override ? { reason } : undefined }), "View-As session started"); if (r.ok) nav(`${PBASE}/view-as/session`); }}><Eye size={14} aria-hidden="true" />Start read-only session</button>
        </Panel>
        <Panel title="Session controls" subtitle="Inactivity period is a development setting (OP-VIEWAS1)">
          <dl className="dl-grid small">
            <dt>Inactivity timeout</dt><dd>{v.va.idleMinutes} minutes <BcrTag>OP-VIEWAS1</BcrTag></dd>
            <dt>Branch restriction</dt><dd>Own branch / scope only; HO / Admin override needs the override permission and a reason</dd>
            <dt>Disabled in View-As</dt><dd>Scanning, redeeming, KYC and bank edits, points adjustment, referrals, profile edits, messaging — and every other change</dd>
          </dl>
          {v.can("platform-admin:manage") && <div className="form-grid"><TextField label="Inactivity minutes" value={idle} onChange={setIdle} inputMode="numeric" /><div><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setViewAsIdle(v.uid, Number(idle)), "Timeout recorded")}>Save</button></div></div>}
        </Panel>
      </div>
      <Panel padded={false} title="View-As sessions" subtitle={v.can("platform-admin:view") ? "All staff" : "Your sessions"}>
        <DataTable rows={[...h.sessions].reverse()} rowKey={(x) => x.id} caption="View-As sessions" emptyTitle="No sessions yet" columns={[
          { key: "id", header: "Session", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
          { key: "a", header: "Staff member", value: (x) => x.adminId, render: (x) => <span className="small">{userName(v.acc, x.adminId)} · {x.role}</span> },
          { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => <span>{memberLink(x.memberId)} <span className="small muted">{x.programme} · {x.branchCode}</span></span> },
          { key: "s", header: "Started", value: (x) => x.startedAt, render: (x) => <span className="small">{dt(x.startedAt)}</span> },
          { key: "d", header: "Duration", value: (x) => durationSec(x), render: (x) => <span className="small">{secs(durationSec(x))}{x.endedAt ? "" : " (open)"}</span>, align: "right" },
          { key: "e", header: "Exit", value: (x) => x.exitReason ?? "", render: (x) => <span className="small">{x.exitReason?.replace(/_/g, " ") ?? "—"}</span> },
          { key: "o", header: "Override", value: (x) => x.override?.reason ?? "", render: (x) => (x.override ? <span className="small"><StatusBadge tone="warning">Override</StatusBadge> {x.override.reason}</span> : "—") },
          { key: "ip", header: "IP / device", value: (x) => `${x.ip} ${x.device}`, render: (x) => <span className="small muted">{x.ip} · {x.device}</span> },
        ]} />
      </Panel>
      <Panel padded={false} title="Attempts (including refused)">
        <DataTable rows={[...h.attempts].reverse()} rowKey={(x) => x.id} caption="View-As attempts" emptyTitle="No attempts yet" columns={[
          { key: "at", header: "At", value: (x) => x.at, render: (x) => <span className="small">{dt(x.at)}</span> },
          { key: "a", header: "Staff member", value: (x) => x.adminId, render: (x) => <span className="small">{userName(v.acc, x.adminId)}</span> },
          { key: "m", header: "Member reference", value: (x) => x.memberRef, render: (x) => <span className="mono small">{x.memberRef}</span> },
          { key: "r", header: "Result", value: (x) => x.result, render: (x) => <StatusBadge tone={x.result === "started" ? "positive" : "negative"}>{x.result}</StatusBadge> },
          { key: "re", header: "Reason", value: (x) => x.reason, render: (x) => <span className="small">{x.reason}</span> },
        ]} />
      </Panel>
    </>
  );
}

export function ViewAsSessionPage() {
  const v = usePlatformView();
  const nav = useNavigate();
  const [tab, setTab] = useParam("screen", "home");
  const r = viewAsMemberApp(v.uid);
  useEffect(() => {
    if (!r.ok) return;
    const t = window.setInterval(() => activeSession(v.uid), 15_000);
    return () => window.clearInterval(t);
  }, [r.ok, v.uid]);
  if (!r.ok || !r.app) return <><Notice tone="warn">{r.errors[0]}</Notice><Link to={`${PBASE}/view-as`}>Back to View-As</Link></>;
  const a = r.app;
  const blocked = (label: string) => <button key={label} type="button" className="btn btn--ghost btn--sm viewas-disabled" disabled title="Disabled in View-As"><Ban size={14} aria-hidden="true" />{label}</button>;
  return (
    <>
      <SectionTitle title={`${a.home.name} · member app (read-only)`} description={`Session ${a.session.id} · ${a.home.programme} · started ${dt(a.session.started)}${a.session.override ? ` · override: ${a.session.override.reason}` : ""}. The values come from the wallet, scheme and passbook services the app uses`} actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => { endViewAs(v.uid); nav(`${PBASE}/view-as`); }}>Exit View-As</button>} />
      <div className="viewas-app">
        <Tabs label="Member app screens" value={tab} onChange={setTab} tabs={[{ id: "home", label: "Home" }, { id: "schemes", label: "Schemes" }, { id: "passbook", label: "Passbook" }, { id: "wallet", label: "Wallet" }, { id: "settlement", label: "Settlement" }]} />
        <div className="viewas-app__screen">
          {tab === "home" && (
            <>
              {a.home.restrictions.length > 0 && <Notice tone="warn">Member restricted: {a.home.restrictions.join(", ")}. The app shows the restricted state.</Notice>}
              <div className="ana-tiles"><Tile label="Available points" value={a.home.available.toLocaleString("en-IN")} sub="Wallet service" /><Tile label="Lifetime points" value={a.home.lifetime.toLocaleString("en-IN")} sub="Wallet service" /><Tile label="Status" value={a.home.status} sub={a.home.memberType} /></div>
              <Panel title="KYC documents" subtitle="Status only: numbers are never shown in View-As">
                <StatList items={a.kyc.map((k) => ({ label: k.type, value: k.status }))} />
              </Panel>
            </>
          )}
          {tab === "schemes" && (
            <Panel title="Schemes" subtitle={`Active for ${a.home.programme}: ${a.schemes.active.join(", ") || "none"}`} padded={false}>
              <DataTable rows={a.schemes.progress} rowKey={(x) => x.schemeId} caption="Scheme progress" searchable={false} emptyTitle="No scheme activity" columns={[{ key: "n", header: "Scheme", value: (x) => x.name }, { key: "e", header: "Points earned", value: (x) => x.earned, align: "right" }, { key: "p", header: "Progress", value: (x) => x.achieved ?? -1, render: (x) => (x.achieved == null ? <span className="muted small">{x.note}</span> : x.next ? `${x.achieved} · ${x.next.remaining} more to ${x.next.name}` : `${x.achieved} · all milestones reached`) }]} />
            </Panel>
          )}
          {tab === "passbook" && (
            <Panel title="Passbook" subtitle="Latest 25 entries" padded={false}>
              <DataTable rows={a.passbook} rowKey={(x) => `${x.ref}${x.at}${x.type}`} caption="Passbook" searchable={false} columns={[{ key: "at", header: "Date", value: (x) => x.at, render: (x) => <span className="small">{dt(x.at)}</span> }, { key: "r", header: "Reference", value: (x) => x.ref, render: (x) => <span className="mono small">{x.ref}</span> }, { key: "t", header: "Entry", value: (x) => x.type.replace(/_/g, " ") }, { key: "p", header: "Points", value: (x) => x.points, align: "right" }, { key: "s", header: "Status", value: (x) => x.status }]} />
            </Panel>
          )}
          {tab === "wallet" && (
            <div className="ana-tiles"><Tile label="Available" value={a.wallet.available.toLocaleString("en-IN")} /><Tile label="Lifetime earned" value={a.wallet.lifetimeEarned.toLocaleString("en-IN")} /><Tile label="Redeemed (this year)" value={a.wallet.redeemed.toLocaleString("en-IN")} /><Tile label="Scheme points" value={a.wallet.schemePoints.toLocaleString("en-IN")} /><Tile label="TDS deducted (this year)" value={`${a.wallet.tdsDeductedPoints} pts · ₹${a.wallet.tdsDeductedInr.toLocaleString("en-IN")}`} /></div>
          )}
          {tab === "settlement" && (
            <Panel title="Scheme settlement"><StatList items={[{ label: "Unsettled scheme points", value: a.settlement.unsettledPoints.toLocaleString("en-IN") }, { label: "Scheme accruals", value: String(a.settlement.accruals) }, { label: "Released to Available", value: a.settlement.released.toLocaleString("en-IN") }]} /></Panel>
          )}
          <div className="viewas-app__actions" aria-label="Actions disabled in View-As"><Lock size={14} aria-hidden="true" /><span className="small muted">Disabled in View-As:</span>{a.disabled.map(blocked)}</div>
        </div>
      </div>
    </>
  );
}

/* ======================= App usage analytics ======================= */

export function AppUsagePage() {
  const v = usePlatformView();
  const [f, setF] = useState({ from: "", to: "", programme: "", role: "", state: "", appVersion: "", os: "" });
  const [stages, setStages] = useState("Home,Scan,Scan result,Wallet");
  const [metric, setMetric] = useState<"views" | "uniqueUsers" | "avgSec" | "exitRate">("views");
  const r = usageView(v.uid, { from: f.from || undefined, to: f.to || undefined, programmes: f.programme ? [f.programme] : [], role: f.role || undefined, state: f.state || undefined, appVersion: f.appVersion || undefined, os: f.os || undefined });
  if ("denied" in r) return <PolicyMessages result={r} />;
  const o = r.overview;
  const set = (k: keyof typeof f) => (x: string) => setF({ ...f, [k]: x });
  const ranked = [...r.screens].filter((s) => s.views).sort((a, b) => (metric === "exitRate" ? (b.exitRate ?? 0) - (a.exitRate ?? 0) : ((b[metric] as number | null) ?? -1) - ((a[metric] as number | null) ?? -1)));
  const fn = r.funnel(stages.split(",").map((x) => x.trim()).filter(Boolean));
  return (
    <>
      <SectionTitle title="Application usage analytics" description="How members use the apps — screens, sessions and modules (SOW 10.12). A module visit is not a business transaction: scans, redemptions and points are reported in Reports & analytics" />
      <Notice tone="warn">No app telemetry service is connected. Figures come from a <strong>mock telemetry adapter</strong> (development data). Its definitions — app open = session start, exit = last screen of a session, exit rate = exits ÷ page views — are pending <DecisionRef id="OP-USAGE1" />.</Notice>
      <Panel>
        <div className="form-grid">
          <TextField label="From" type="date" value={f.from} onChange={set("from")} />
          <TextField label="To" type="date" value={f.to} onChange={set("to")} />
          <SelectInput label="Programme" value={f.programme} onChange={set("programme")} options={[{ value: "", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
          <SelectInput label="Role (member type)" value={f.role} onChange={set("role")} options={[{ value: "", label: "All roles" }, ...["Influencer (IMP)", "Service technician", "Counter sales", "Retailer", "Direct dealer"].map((x) => ({ value: x, label: x }))]} />
          <SelectInput label="Region" value={f.state} onChange={set("state")} options={[{ value: "", label: "All regions" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} />
          <SelectInput label="App version" value={f.appVersion} onChange={set("appVersion")} options={[{ value: "", label: "All versions" }, ...r.byVersion.map((x) => ({ value: x.key, label: x.key }))]} />
          <SelectInput label="OS" value={f.os} onChange={set("os")} options={[{ value: "", label: "All" }, ...["Android 14", "Android 13", "Android 12", "iOS 17"].map((x) => ({ value: x, label: x }))]} />
        </div>
      </Panel>
      <div className="ana-tiles">
        <Tile label="Total app opens" value={o.appOpens.toLocaleString("en-IN")} sub="Sessions started" />
        <Tile label="Unique users" value={o.uniqueUsers.toLocaleString("en-IN")} />
        <Tile label="Average session length" value={secs(o.avgSessionSec)} sub={`Median ${secs(o.medianSessionSec)}`} />
        <Tile label="App opens per user" value={o.opensPerUser == null ? "Not available" : o.opensPerUser.toFixed(1)} />
        <Tile label="Screen views" value={o.pageViews.toLocaleString("en-IN")} />
        <Tile label="Average time per screen" value={secs(o.avgTimePerScreenSec)} sub="Timed events only" />
        <Tile label="Exit rate" value={pct(o.exitRate)} sub="Adapter definition (OP-USAGE1)" />
        <Tile label="Most visited screen" value={o.mostVisited ?? "—"} />
        <Tile label="Least visited screen" value={o.leastVisited ?? "—"} />
        <Tile label="Highest drop-off screen" value={o.highestDropOff ?? "—"} />
        {r.modules.map((m) => <Tile key={m.module} label={`Module usage — ${m.module}`} value={m.usageCount.toLocaleString("en-IN")} sub={`${m.uniqueUsers} users · screen visits, not transactions`} />)}
      </div>
      <Panel padded={false} title="Screens" subtitle="Landing count = sessions that started on the screen" actions={<SelectInput label="Rank by" value={metric} onChange={(x) => setMetric(x as typeof metric)} options={[{ value: "views", label: "Page views" }, { value: "uniqueUsers", label: "Unique users" }, { value: "avgSec", label: "Average time" }, { value: "exitRate", label: "Exit rate" }]} />}>
        <DataTable rows={ranked.map((s, i) => ({ ...s, rank: i + 1 }))} rowKey={(s) => s.screen} caption="Screen analytics" searchable={false} pageSize={12} columns={[
          { key: "r", header: "Rank", value: (s) => s.rank, align: "right" },
          { key: "s", header: "Screen", value: (s) => s.screen, render: (s) => <span><strong>{s.screen}</strong> <span className="muted small">{s.module}</span></span> },
          { key: "l", header: "Landing count", value: (s) => s.landing, align: "right" },
          { key: "u", header: "Unique users", value: (s) => s.uniqueUsers, align: "right" },
          { key: "v", header: "Page views", value: (s) => s.views, align: "right" },
          { key: "t", header: "Average time", value: (s) => s.avgSec ?? -1, render: (s) => secs(s.avgSec), align: "right" },
          { key: "e", header: "Exit rate", value: (s) => s.exitRate ?? -1, render: (s) => pct(s.exitRate), align: "right" },
          { key: "d", header: "Drop-off count", value: (s) => s.exits, align: "right" },
          { key: "ver", header: "App versions", value: (s) => s.versions.join(", "), render: (s) => <span className="small">{s.versions.join(", ")}</span> },
          { key: "p", header: "Programmes", value: (s) => s.programmes.join(" ") },
        ]} />
      </Panel>
      <div className="grid-2">
        <Panel title="Best performing screens" subtitle="By page views"><RankedBars items={[...r.screens].filter((s) => s.views).sort((a, b) => b.views - a.views).slice(0, 5).map((s) => ({ key: s.screen, label: s.screen, value: s.views }))} /></Panel>
        <Panel title="Worst performing screens" subtitle="By exit rate (low traffic is not a defect by itself)"><RankedBars items={[...r.screens].filter((s) => s.views).sort((a, b) => (b.exitRate ?? 0) - (a.exitRate ?? 0)).slice(0, 5).map((s) => ({ key: s.screen, label: `${s.screen} (${pct(s.exitRate)})`, value: Math.round((s.exitRate ?? 0) * 1000) / 10 }))} valueFormat={(n) => `${n}%`} /></Panel>
      </div>
      <Panel title="Journey funnel" subtitle="Users reaching each stage in order within a session (actual event sequences)" actions={<TextField label="Stages (comma separated)" value={stages} onChange={setStages} hint={SCREENS.map((s) => s.screen).join(", ")} />} padded={false}>
        <DataTable rows={fn} rowKey={(x) => x.stage} caption="Funnel" searchable={false} columns={[{ key: "s", header: "Stage", value: (x) => x.stage }, { key: "u", header: "Users", value: (x) => x.users, align: "right" }, { key: "c", header: "Continued from previous", value: (x) => x.continuation ?? -1, render: (x) => (x.continuation == null ? "—" : pct(x.continuation)), align: "right" }, { key: "l", header: "Left before next stage", value: (x) => x.left ?? -1, render: (x) => (x.left == null ? "—" : x.left), align: "right" }, { key: "t", header: "Average time from previous", value: (x) => x.avgSecFromPrevious ?? -1, render: (x) => secs(x.avgSecFromPrevious), align: "right" }]} />
      </Panel>
      <div className="grid-2">
        <Panel padded={false} title="Module usage" subtitle="Scan, Schemes, Wallet, Passbook">
          <DataTable rows={r.modules} rowKey={(m) => m.module} caption="Module usage" searchable={false} columns={[{ key: "m", header: "Module", value: (m) => m.module }, { key: "u", header: "Unique users", value: (m) => m.uniqueUsers, align: "right" }, { key: "c", header: "Usage count", value: (m) => m.usageCount, align: "right" }, { key: "f", header: "Visits per user", value: (m) => m.frequency ?? -1, render: (m) => (m.frequency == null ? "—" : m.frequency.toFixed(1)), align: "right" }, { key: "t", header: "Time spent", value: (m) => m.timeSpentSec ?? -1, render: (m) => secs(m.timeSpentSec), align: "right" }, { key: "e", header: "Top entry source", value: (m) => m.entrySources[0]?.source ?? "", render: (m) => <span className="small">{m.entrySources.slice(0, 2).map((x) => `${x.source} (${x.count})`).join(", ")}</span> }, { key: "x", header: "Exits", value: (m) => m.exits, align: "right" }]} />
        </Panel>
        <Panel padded={false} title="App version comparison" subtitle="Changes across versions are context, not proof of cause">
          <DataTable rows={r.byVersion} rowKey={(x) => x.key} caption="App versions" searchable={false} columns={[{ key: "v", header: "Version", value: (x) => x.key }, { key: "u", header: "Active users", value: (x) => x.users, align: "right" }, { key: "s", header: "Sessions", value: (x) => x.sessions, align: "right" }, { key: "w", header: "Screen views", value: (x) => x.views, align: "right" }, { key: "a", header: "Average session", value: (x) => x.avgSessionSec ?? -1, render: (x) => secs(x.avgSessionSec), align: "right" }, { key: "e", header: "Crash reports", value: (x) => x.errors, align: "right" }, { key: "d", header: "Single-screen sessions", value: (x) => x.exitsBeforeHome, align: "right" }]} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Sessions by programme"><RankedBars items={r.byProgramme.map((x) => ({ key: x.key, label: x.key, value: x.sessions }))} /></Panel>
        <Panel title="Sessions by region"><RankedBars items={r.byRegion.map((x) => ({ key: x.key, label: x.key, value: x.sessions }))} /></Panel>
      </div>
    </>
  );
}

/* ======================= App themes ======================= */

const BLANK: ThemeInput = { name: "", type: "tier", programmes: [], tierIds: [], eventRef: null, effectiveFrom: null, effectiveTo: null, tokens: { primary: "#F5B800", secondary: "#111318", background: "#FFFFFF", text: "#111318", accent: "#E5A000" }, assets: { background: null, banner: null }, screens: [] };
export function AppThemesPage() {
  const v = usePlatformView();
  const ss = useSchemeState();
  const { result, run } = useRun();
  const [sel, setSel] = useState<string | null>(null);
  const [t, setT] = useState<ThemeInput>(BLANK);
  const [reason, setReason] = useState("");
  const th = v.ps.themes.find((x) => x.id === sel);
  const pv = th ? previewTheme(th.id) : null;
  const set = <K extends keyof ThemeInput>(k: K, val: ThemeInput[K]) => setT({ ...t, [k]: val });
  const counts = (s: AppTheme["status"]) => v.ps.themes.filter((x) => x.status === s).length;
  const open = decisionStatus("OP-THEME1") !== "confirmed";
  return (
    <>
      <SectionTitle title="App theme management" description="Member app themes by tier or festival, changeable without an app release (SOW 10.8). This changes the member apps only — never the portal's V-Guard yellow, black and white design" />
      {open && <Notice tone="warn"><strong>Publishing is disabled.</strong> Whether tier and festival themes are needed now, and which app screens they affect, is pending <DecisionRef id="OP-THEME1" />. Themes can be drafted, previewed and approved, but not published.</Notice>}
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Theme configurations" value={v.ps.themes.length} /><Tile label="Published" value={counts("published")} /><Tile label="Drafts" value={counts("draft")} /><Tile label="Pending approval" value={counts("pending_approval")} /><Tile label="Approved, not published" value={counts("approved")} />
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title="Themes">
          <DataTable rows={v.ps.themes} rowKey={(x) => x.id} caption="Themes" emptyTitle="No themes yet" onRowClick={(x) => { setSel(x.id); setT({ name: x.name, type: x.type, programmes: x.programmes, tierIds: x.tierIds, eventRef: x.eventRef, effectiveFrom: x.effectiveFrom, effectiveTo: x.effectiveTo, tokens: x.tokens, assets: x.assets, screens: x.screens }); }} columns={[
            { key: "n", header: "Theme", value: (x) => x.name, render: (x) => <span><strong>{x.name}</strong><br /><span className="mono small muted">{x.id} · v{x.version}</span></span> },
            { key: "t", header: "Type", value: (x) => x.type },
            { key: "p", header: "Programmes", value: (x) => x.programmes.join(" ") },
            { key: "tg", header: "Tier / event", value: (x) => x.eventRef ?? x.tierIds.join(", ") },
            { key: "e", header: "Effective", value: (x) => x.effectiveFrom ?? "", render: (x) => <span className="small">{x.effectiveFrom ?? "—"} → {x.effectiveTo ?? "open"}</span> },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "published" ? "positive" : x.status === "approved" ? "info" : x.status === "rejected" ? "negative" : "warning"}>{x.status.replace(/_/g, " ")}</StatusBadge> },
          ]} />
        </Panel>
        {pv && th ? (
          <Panel title={`Preview · ${th.name} v${pv.version}`} subtitle={pv.note}>
            <div className="theme-preview" style={{ ["--tp" as string]: th.tokens.primary, ["--ts" as string]: th.tokens.secondary, ["--tb" as string]: th.tokens.background, ["--tt" as string]: th.tokens.text, ["--ta" as string]: th.tokens.accent }}>
              <div className="theme-preview__bar">Rishta app</div>
              <div className="theme-preview__card"><span>Available points</span><strong>12,450</strong><span className="theme-preview__chip">Sample value</span></div>
              <div className="theme-preview__btn">Scan QR</div>
            </div>
            <dl className="dl-grid small">
              <dt>Programmes</dt><dd>{pv.target.programmes.join(", ")}</dd>
              <dt>Tier / event</dt><dd>{pv.target.tiers.join(", ") || pv.target.event || "—"}</dd>
              <dt>Screens</dt><dd>{pv.screens.join(", ")}</dd>
              <dt>Effective period</dt><dd>{pv.period}</dd>
            </dl>
            <DataTable rows={[...th.versions].reverse()} rowKey={(x) => String(x.version)} caption="Versions" searchable={false} columns={[{ key: "v", header: "Version", value: (x) => x.version }, { key: "c", header: "Change", value: (x) => x.change }, { key: "s", header: "Status", value: (x) => x.status }, { key: "b", header: "By", value: (x) => x.by }]} />
            <div className="btn-row">
              {v.can("app-themes:submit") && th.status === "draft" && <><TextField label="Reason" value={reason} onChange={setReason} /><button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitThemeForApproval(v.uid, th.id, reason), "Submitted for approval")}>Submit for approval</button></>}
              {v.can("app-themes:publish") && <button type="button" className="btn btn--ghost btn--sm" disabled={open} title={open ? "OP-THEME1 open" : undefined} onClick={() => run(publishTheme(v.uid, th.id), "Published")}>Publish</button>}
            </div>
          </Panel>
        ) : <Panel title="Preview"><p className="muted small">Select a theme</p></Panel>}
      </div>
      {v.can("app-themes:create") && (
        <Panel title={th ? `Edit ${th.name} (new version)` : "New theme draft"}>
          <div className="form-grid">
            <TextField label="Theme name" value={t.name} onChange={(x) => set("name", x)} />
            <SelectInput label="Type" value={t.type} onChange={(x) => set("type", x as ThemeInput["type"])} options={[{ value: "tier", label: "Tier-based" }, { value: "festival", label: "Festival / event" }, { value: "default", label: "Default" }]} />
            <SelectInput label="Programme" value={t.programmes[0] ?? ""} onChange={(x) => set("programmes", x ? [x as never] : [])} options={[{ value: "", label: "Choose" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
            {t.type === "tier" && <SelectInput label="Tier (Tier Master)" value={t.tierIds[0] ?? ""} onChange={(x) => set("tierIds", x ? [x] : [])} options={[{ value: "", label: "Choose" }, ...ss.tiers.filter((x) => !t.programmes.length || (t.programmes as string[]).includes(x.programme)).map((x) => ({ value: x.id, label: `${x.programme} ${x.name}` }))]} />}
            {t.type === "festival" && <TextField label="Approved festival / event reference" value={t.eventRef ?? ""} onChange={(x) => set("eventRef", x || null)} />}
            <TextField label="Effective from" type="date" value={t.effectiveFrom ?? ""} onChange={(x) => set("effectiveFrom", x || null)} />
            <TextField label="Effective to" type="date" value={t.effectiveTo ?? ""} onChange={(x) => set("effectiveTo", x || null)} />
            {(Object.keys(t.tokens) as (keyof ThemeInput["tokens"])[]).map((k) => <TextField key={k} label={`Colour: ${k}`} value={t.tokens[k]} onChange={(x) => set("tokens", { ...t.tokens, [k]: x })} />)}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => (th ? run(updateTheme(v.uid, th.id, t, "Edited in theme manager"), "New version saved") : run(createThemeDraft(v.uid, t), "Draft created"))}>{th ? "Save new version" : "Create draft"}</button>
            {th && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setSel(null); setT(BLANK); }}>New theme instead</button>}
          </div>
        </Panel>
      )}
    </>
  );
}
