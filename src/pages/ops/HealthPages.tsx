import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, Bug, Database, Gauge, Server, Smartphone, Timer } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { TrendChart } from "@/components/charts/Charts";
import { SelectInput, Tabs, TextArea } from "@/components/form/Form";
import { P95_TARGET_MS, SOW_BASELINES } from "@/config/opsCatalogue";
import { incidentSnapshot, setCrashStatus, viewStack } from "@/features/ops/store";
import { correlationAt, filterCrashes, hoursBefore } from "@/features/ops/engine";
import type { CrashRecord, ServiceHealth } from "@/types/ops";
import { KpiGrid } from "@/pages/masters/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { HealthBadge, OBASE, RunBadge, SimTag, dt, memberLink, ms, pct, useOpsView, useParam, useRun, type OpsView } from "./shared";

const sum = (s: ServiceHealth, k: "requests" | "failures") => s.series.reduce((n, p) => n + p[k], 0);
const worstP95 = (s: ServiceHealth) => Math.max(...s.series.map((p) => p.p95Ms));
const serviceStatus = (s: ServiceHealth) => {
  const last = s.series[s.series.length - 1];
  if (!last) return "unknown" as const;
  if (last.failures > 0 || last.p95Ms > P95_TARGET_MS) return "degraded" as const;
  return s.dependencies.some((d) => d.status === "failed" || d.status === "degraded") ? ("degraded" as const) : ("healthy" as const);
};

export function SystemHealthPage() {
  const v = useOpsView();
  const nav = useNavigate();
  const sv = v.os.services;
  const reqs = sv.reduce((n, s) => n + sum(s, "requests"), 0);
  const fails = sv.reduce((n, s) => n + sum(s, "failures"), 0);
  const e = (k: "http_5xx" | "database" | "dependency" | "timeout") => sv.reduce((n, s) => n + (s.errors[k] ?? 0), 0);
  return (
    <>
      <SectionTitle title="System health" description="Platform API services mapped to the service contracts in the codebase, their dependencies and errors over the last 24 hours" />
      <Notice tone="warn">Service telemetry is simulated by a mock adapter <SimTag />: it shows how monitoring will look, not how the production platform performs. SOW baselines are shown as targets and stay <strong>Not evaluated</strong> until production telemetry or load-test evidence exists.</Notice>
      <KpiGrid cols={5} items={[
        { id: "r", label: "API requests (24 h)", value: reqs, desc: `${sv.length} services`, icon: Activity, variant: "primary", onSelect: () => nav(`${OBASE}/api-performance`) },
        { id: "f", label: "Failed requests", value: fails, desc: pct(reqs ? fails / reqs : null), icon: AlertTriangle, variant: "status", tone: "warning", onSelect: () => nav(`${OBASE}/api-performance?tab=failures`) },
        { id: "5", label: "5xx errors", value: e("http_5xx"), desc: "Server errors", icon: Server, variant: "light", onSelect: () => nav(`${OBASE}/api-performance?tab=failures`) },
        { id: "db", label: "Database errors", value: e("database"), desc: "Query or connection", icon: Database, variant: "light", onSelect: () => nav(`${OBASE}/api-performance?tab=failures`) },
        { id: "dep", label: "Dependency errors", value: e("dependency"), desc: "Downstream services", icon: AlertTriangle, variant: "light", onSelect: () => nav(`${OBASE}/api-performance?tab=failures`) },
        { id: "to", label: "Timeouts", value: e("timeout"), desc: "No response", icon: Timer, variant: "light", onSelect: () => nav(`${OBASE}/api-performance?tab=failures`) },
        { id: "p", label: "Services above p95 target", value: sv.filter((s) => worstP95(s) > P95_TARGET_MS).length, desc: "At least one hour over 2 s", icon: Gauge, variant: "status", tone: "warning", onSelect: () => nav(`${OBASE}/api-performance`) },
        { id: "c", label: "Crash groups", value: v.os.crashes.length, desc: `${v.os.crashes.filter((c) => c.status !== "resolved").length} open`, icon: Bug, variant: "light", onSelect: () => nav(`${OBASE}/crashes`) },
      ]} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="API services" padded={false}>
          <DataTable rows={sv} rowKey={(s) => s.id} caption="API services" searchable={false} onRowClick={(s) => nav(`${OBASE}/api-performance?s=${s.id}`)} columns={[
            { key: "n", header: "Service", value: (s) => s.name, render: (s) => <span><strong>{s.name}</strong><br /><span className="mono small muted">{s.contract}</span></span> },
            { key: "g", header: "Group", value: (s) => s.group },
            { key: "h", header: "Status (latest hour)", value: (s) => serviceStatus(s), render: (s) => <HealthBadge h={serviceStatus(s)} /> },
            { key: "r", header: "Requests", value: (s) => sum(s, "requests"), align: "right" },
            { key: "f", header: "Failures", value: (s) => sum(s, "failures"), align: "right" },
            { key: "p", header: "Worst p95", value: (s) => worstP95(s), render: (s) => <span className={worstP95(s) > P95_TARGET_MS ? "text-warning" : ""}>{ms(worstP95(s))}</span>, align: "right" },
            { key: "d", header: "Dependencies", value: (s) => s.dependencies.map((d) => d.name).join(", "), render: (s) => <span className="small">{s.dependencies.map((d) => `${d.name}${d.status !== "healthy" ? ` (${d.status})` : ""}`).join(", ") || "—"}</span> },
            { key: "l", header: "Last success", value: (s) => s.lastSuccess ?? "", render: (s) => <span className="small">{dt(s.lastSuccess)}</span> },
          ]} />
        </Panel>
        <Panel title="SOW performance baselines" subtitle="Targets only. Nothing is marked Passed without telemetry or load-test evidence">
          <StatList items={SOW_BASELINES.map((b) => ({ label: b.metric, value: "Not evaluated", note: `Target: ${b.target}` }))} />
        </Panel>
      </div>
    </>
  );
}

export function ApiPerformancePage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [sid, setSid] = useParam("s", v.os.services[0]?.id ?? "");
  const [tab, setTab] = useParam("tab", "latency");
  const [stack, setStack] = useState<{ id: string; text: string } | null>(null);
  const s = v.os.services.find((x) => x.id === sid) ?? v.os.services[0];
  const failures = v.os.services.flatMap((x) => x.failures.map((f) => ({ s: x, f }))).sort((a, b) => b.f.at.localeCompare(a.f.at));
  return (
    <>
      <SectionTitle title="API performance" description={`Hourly average and p95 response time against the SOW target of p95 below ${P95_TARGET_MS / 1000} seconds, with requests and failures`} actions={<SimTag />} />
      <PolicyMessages result={result} />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: "latency", label: "Latency" }, { id: "failures", label: "Failed requests", count: failures.length }]} />
      {tab === "latency" ? (
        <>
          <Panel><SelectInput label="Service" value={s.id} onChange={setSid} options={v.os.services.map((x) => ({ value: x.id, label: x.name }))} /></Panel>
          <div className="grid-2">
            <Panel title={`${s.name}: response time`} subtitle="Dashed line is the SOW p95 target">
              <TrendChart data={s.series.map((p) => ({ key: p.at, label: p.at.slice(11, 16), p95: p.p95Ms, avg: p.avgMs, target: P95_TARGET_MS }))} kind="line" ariaLabel={`${s.name} response time`} valueFormat={(n) => ms(n)} axisFormat={(n) => `${(n / 1000).toFixed(1)}s`} series={[{ key: "p95", label: "p95", color: "var(--vg-amber)" }, { key: "avg", label: "Average", color: "var(--chart-neutral-1)" }, { key: "target", label: "Target", color: "var(--chart-neutral-2)", dashed: true }]} />
            </Panel>
            <Panel title={`${s.name}: requests and failures`}>
              <TrendChart data={s.series.map((p) => ({ key: p.at, label: p.at.slice(11, 16), ok: p.requests - p.failures, failed: p.failures }))} kind="stacked" ariaLabel={`${s.name} requests`} series={[{ key: "ok", label: "Successful", color: "var(--chart-neutral-1)" }, { key: "failed", label: "Failed", color: "var(--vg-amber)" }]} />
            </Panel>
          </div>
          <Panel title="Errors by category"><RankedBars items={Object.entries(s.errors).map(([k, n]) => ({ key: k, label: k.replace(/_/g, " "), value: n ?? 0 }))} /></Panel>
        </>
      ) : (
        <div className="grid-2 grid-2--wide-left">
          <Panel padded={false} title="Failed API requests">
            <DataTable rows={failures} rowKey={(x) => x.f.id} caption="Failed API requests" exportName="api-failures" columns={[
              { key: "id", header: "Request", value: (x) => x.f.id, render: (x) => <span className="mono small">{x.f.id}</span> },
              { key: "s", header: "Service", value: (x) => x.s.name },
              { key: "c", header: "Correlation ID", value: (x) => x.f.correlationId, render: (x) => <span className="mono small">{x.f.correlationId}</span> },
              { key: "at", header: "At", value: (x) => x.f.at, render: (x) => <span className="small">{dt(x.f.at)}</span> },
              { key: "d", header: "Duration", value: (x) => x.f.durationMs, render: (x) => ms(x.f.durationMs), align: "right" },
              { key: "h", header: "HTTP", value: (x) => x.f.http ?? "", align: "right" },
              { key: "cat", header: "Category", value: (x) => x.f.category.replace(/_/g, " ") },
              { key: "dep", header: "Dependency", value: (x) => x.f.dependency ?? "" },
              { key: "m", header: "Member", value: (x) => x.f.memberId ?? "", render: (x) => memberLink(x.f.memberId) },
              { key: "r", header: "Resolution", value: (x) => x.f.resolution, render: (x) => <RunBadge s={x.f.resolution === "resolved" ? "completed" : "pending"} /> },
              { key: "st", header: "Stack trace", value: () => "", noSearch: true, render: (x) => (x.f.stackRef ? <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); const c = v.os.crashes.find((cr) => cr.stackRef === x.f.stackRef); if (!c) { setStack({ id: x.f.stackRef!, text: "Stack reference recorded; the trace is held by the logging service" }); return; } const r = run(viewStack(v.uid, c.id), "Stack trace shown"); if (r.ok && r.stack) setStack({ id: c.stackRef, text: r.stack }); }}>{x.f.stackRef}</button> : "—") },
            ]} />
          </Panel>
          <Panel title="Stack trace" subtitle={stack?.id ?? "Needs System health: View sensitive"}>{stack ? <pre className="ops-stack">{stack.text}</pre> : <p className="muted small">Select a stack reference. Every view is audited</p>}</Panel>
        </div>
      )}
    </>
  );
}

export function CrashPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [sel, setSel] = useState<string | null>(null);
  const [dev, setDev] = useParam("device", "");
  const [os, setOs] = useParam("os", "");
  const [ver, setVer] = useParam("version", "");
  const c = v.os.crashes.find((x) => x.id === sel);
  const versions = [...new Set(v.os.crashes.map((x) => x.version))];
  const shown = filterCrashes(v.os.crashes, { deviceModel: dev, os, version: ver });
  const opt = (xs: string[]) => [{ value: "", label: "All" }, ...[...new Set(xs)].sort().map((x) => ({ value: x, label: x }))];
  return (
    <>
      <SectionTitle title="Crash & error analytics" description="Mobile app crashes and non-fatal errors grouped by error type, app version, device and module, with links to related API failures" actions={<SimTag />} />
      <PolicyMessages result={result} />
      <KpiGrid cols={4} items={[
        { id: "c", label: "Crash groups", value: v.os.crashes.filter((x) => x.kind === "crash").length, desc: "Fatal", icon: Bug, variant: "primary", onSelect: () => setSel(null) },
        { id: "n", label: "Non-fatal groups", value: v.os.crashes.filter((x) => x.kind === "non_fatal").length, desc: "Handled errors", icon: AlertTriangle, variant: "light", onSelect: () => setSel(null) },
        { id: "o", label: "Occurrences", value: v.os.crashes.reduce((n, x) => n + x.count, 0), desc: "All groups", icon: Activity, variant: "light", onSelect: () => setSel(null) },
        { id: "d", label: "Affected devices", value: v.os.crashes.reduce((n, x) => n + x.affectedDevices, 0), desc: "Counted per group", icon: Smartphone, variant: "light", onSelect: () => setSel(null) },
      ]} />
      <div className="grid-2">
        <Panel title="Occurrences by app version"><RankedBars items={versions.map((ver) => ({ key: ver, label: ver, value: v.os.crashes.filter((x) => x.version === ver).reduce((n, x) => n + x.count, 0) }))} /></Panel>
        <Panel title="Occurrences by module"><RankedBars items={[...new Set(v.os.crashes.map((x) => x.module))].map((m) => ({ key: m, label: m, value: v.os.crashes.filter((x) => x.module === m).reduce((n, x) => n + x.count, 0) }))} /></Panel>
      </div>
      <Panel>
        <div className="form-grid">
          <SelectInput label="Device model" value={dev} onChange={setDev} options={opt(v.os.crashes.map((x) => x.deviceModel))} />
          <SelectInput label="OS" value={os} onChange={setOs} options={opt(v.os.crashes.map((x) => x.os))} />
          <SelectInput label="App version" value={ver} onChange={setVer} options={opt(versions)} />
        </div>
      </Panel>
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false} title="Crash groups">
          <DataTable rows={shown} rowKey={(x) => x.id} caption="Crash groups" exportName="crash-groups" onRowClick={(x) => setSel(x.id)} columns={[
            { key: "id", header: "Group", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
            { key: "t", header: "Error type", value: (x) => x.errorType, render: (x) => <span><strong className="small">{x.errorType}</strong><br /><span className="muted small">{x.message}</span></span> },
            { key: "k", header: "Kind", value: (x) => x.kind, render: (x) => <StatusBadge tone={x.kind === "crash" ? "negative" : "warning"}>{x.kind === "crash" ? "Crash" : "Non-fatal"}</StatusBadge> },
            { key: "v", header: "Version", value: (x) => x.version },
            { key: "m", header: "Module", value: (x) => x.module },
            { key: "d", header: "Device / OS", value: (x) => `${x.deviceModel} ${x.os}`, render: (x) => <span className="small">{x.deviceModel} · {x.os}</span> },
            { key: "n", header: "Count", value: (x) => x.count, align: "right" },
            { key: "l", header: "Last seen", value: (x) => x.lastSeen, render: (x) => <span className="small">{dt(x.lastSeen)}</span> },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <RunBadge s={x.status === "resolved" ? "completed" : x.status === "investigating" ? "pending" : "held"} /> },
          ]} />
        </Panel>
        {c ? <CrashDetail v={v} c={c} run={run} /> : <Panel title="Crash detail"><p className="muted small">Select a crash group</p></Panel>}
      </div>
    </>
  );
}

function CrashDetail({ v, c, run }: { v: OpsView; c: CrashRecord; run: ReturnType<typeof useRun>["run"] }) {
  const [stack, setStack] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [inc, setInc] = useState("");
  const edit = v.can("health:edit");
  return (
    <Panel title={`${c.id} · ${c.errorType}`} subtitle={c.message}>
      <dl className="dl-grid small">
        <dt>App / version</dt><dd>{c.app} {c.version}</dd>
        <dt>Device / OS</dt><dd>{c.deviceModel} · {c.os}</dd>
        <dt>First / last seen</dt><dd>{dt(c.firstSeen)} → {dt(c.lastSeen)}</dd>
        <dt>Occurrences</dt><dd>{c.count} on {c.affectedDevices} devices</dd>
        <dt>Steps to reproduce</dt><dd>{c.reproduce}</dd>
        <dt>Related API failures</dt><dd className="mono">{c.relatedFailures.join(", ") || "—"}</dd>
        <dt>Incident</dt><dd>{c.incidentId ?? "—"}</dd>
        <dt>Stack reference</dt><dd className="mono">{c.stackRef}</dd>
      </dl>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = run(viewStack(v.uid, c.id), "Stack trace shown"); if (r.ok && r.stack) setStack(r.stack); }}>View stack trace</button>
      {stack && <pre className="ops-stack">{stack}</pre>}
      {edit && c.status !== "resolved" && (
        <>
          <TextArea label="Remarks" value={remarks} onChange={setRemarks} rows={2} />
          <SelectInput label="Link to incident" value={inc} onChange={setInc} options={[{ value: "", label: "None" }, ...v.os.incidents.filter((i) => i.status !== "closed").map((i) => ({ value: i.id, label: `${i.id} · ${i.title}` }))]} />
          <div className="btn-row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setCrashStatus(v.uid, c.id, "investigating", remarks, inc || undefined), "Marked investigating")}>Investigating</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => run(setCrashStatus(v.uid, c.id, "resolved", remarks, inc || undefined), "Crash group resolved")}>Resolve</button>
          </div>
        </>
      )}
    </Panel>
  );
}

export function InfrastructurePage() {
  const v = useOpsView();
  const moments = v.os.services.flatMap((s) => s.series.filter((p) => p.p95Ms > P95_TARGET_MS || p.failures > 3).map((p) => ({ at: p.at, label: `${p.at.slice(11, 16)} · ${s.name} (${p.p95Ms > P95_TARGET_MS ? `p95 ${ms(p.p95Ms)}` : `${p.failures} failures`})` })));
  const [at, setAt] = useState(moments[0]?.at ?? v.now);
  const corr = correlationAt(v.os.metrics, at, 1);
  const snap = incidentSnapshot(hoursBefore(at, 2), at);
  return (
    <>
      <SectionTitle title="Infrastructure" description="CPU, memory, disk, network, database connection pool and queue lag, with auto-scaling events. Correlation shows what moved around a moment: it is context for diagnosis, not a root cause" actions={<SimTag />} />
      <Notice tone="info">The SOW auto-scaling trigger (CPU above 70%) is a target. Whether production scaling meets it is <strong>Not evaluated</strong> without infrastructure telemetry.</Notice>
      <div className="grid-3">
        {v.os.metrics.map((m) => (
          <Panel key={m.key} title={m.label} subtitle={`${m.unit} · ${m.source}`}>
            <TrendChart data={m.points.map((p) => ({ key: p.at, label: p.at.slice(11, 16), v: p.v }))} kind="area" height={150} legend={false} ariaLabel={m.label} series={[{ key: "v", label: m.label, color: m.key === "cpu" ? "var(--vg-amber)" : "var(--chart-neutral-1)" }]} />
          </Panel>
        ))}
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Correlation around a moment" subtitle="Metric before the hour and peak during it" actions={moments.length ? <SelectInput label="Moment" value={at} onChange={setAt} options={moments.map((x) => ({ value: x.at, label: x.label }))} /> : undefined}>
          <DataTable rows={corr} rowKey={(c) => c.key} caption="Metric correlation" searchable={false} columns={[
            { key: "m", header: "Metric", value: (c) => c.label },
            { key: "b", header: "Before", value: (c) => c.before ?? -1, render: (c) => (c.before == null ? "—" : `${c.before} ${c.unit}`), align: "right" },
            { key: "p", header: "Peak", value: (c) => c.peak ?? -1, render: (c) => (c.peak == null ? "—" : `${c.peak} ${c.unit}`), align: "right" },
            { key: "c", header: "Change", value: (c) => c.change ?? 0, render: (c) => (c.change == null ? "—" : `${c.change > 0 ? "+" : ""}${c.change}`), align: "right" },
          ]} />
          <StatList items={[
            ...snap.deployments.map((d) => ({ label: `Deployment: ${d.title}`, value: dt(d.at) })),
            ...snap.schema.map((d) => ({ label: `Schema change: ${d.title}`, value: dt(d.at) })),
            ...snap.flags.map((d) => ({ label: `Feature flag: ${d.title}`, value: dt(d.at) })),
            ...snap.vendors.map((d) => ({ label: `Vendor outage: ${d.title}`, value: dt(d.at) })),
            ...snap.config.map((d) => ({ label: `Configuration: ${d.parameter} (${d.source})`, value: dt(d.at) })),
          ]} />
          {snap.missingDeployment && <p className="muted small">No deployment recorded in the two hours before this moment</p>}
        </Panel>
        <Panel title="Auto-scaling events" padded={false}>
          <DataTable rows={v.os.autoscaling} rowKey={(a) => a.id} caption="Auto-scaling events" searchable={false} columns={[
            { key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="small">{dt(a.at)}</span> },
            { key: "a", header: "Action", value: (a) => a.action.replace("_", " ") },
            { key: "n", header: "Instances", value: (a) => `${a.from} → ${a.to}` },
            { key: "r", header: "Reason", value: (a) => a.reason, render: (a) => <span className="small">{a.reason}</span> },
          ]} />
        </Panel>
      </div>
    </>
  );
}
