import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, Bell, CheckCircle2, CircleHelp, Clock, Inbox, ListChecks, Network, Repeat, Siren, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { Segmented } from "@/components/ui/primitives";
import { TrendChart } from "@/components/charts/Charts";
import { ALERT_TYPE } from "@/config/opsCatalogue";
import { healthFor, statsFor } from "@/features/ops/store";
import { hoursBefore, topFailing, volume, volumeByScheme, volumeByType, type Grain, type RankKey } from "@/features/ops/engine";
import { schemeStore } from "@/features/schemes/store";
import { KpiGrid } from "@/pages/masters/shared";
import { Notice } from "@/pages/approvals/shared";
import { DecisionRef, HealthBadge, OBASE, dt, intLink, ms, pct, useOpsView } from "./shared";

export function OpsOverviewPage() {
  const v = useOpsView();
  const nav = useNavigate();
  const [grain, setGrain] = useState<Grain>("hour");
  const [rank, setRank] = useState<RankKey>("failed");
  const live = v.os.integrations.filter((i) => i.connection !== "placeholder");
  const health = v.os.integrations.map((i) => ({ i, h: healthFor(i.id) }));
  const n = (f: (h: string) => boolean) => health.filter((x) => f(x.h)).length;
  const from24 = hoursBefore(v.now, 24);
  const day = v.os.requests.filter((r) => r.at >= from24 && r.at <= v.now);
  const windowReqs = v.os.requests.filter((r) => r.at >= (grain === "hour" ? from24 : grain === "day" ? hoursBefore(v.now, 24 * 14) : hoursBefore(v.now, 24 * 120)) && r.at <= v.now);
  const vol = volume(windowReqs, grain).slice(grain === "hour" ? -24 : -16);
  const openAlerts = v.os.alerts.filter((a) => a.status !== "closed" && a.status !== "resolved");
  const queued = v.os.queues.reduce((s, q) => s + q.pending, 0);
  return (
    <>
      <Notice tone="warn">Health is shown only where a recent request was recorded. An integration with no request in the last 24 hours shows <strong>Unknown</strong>, never Healthy. Thresholds and alert rules are a development setting until V-Guard and Evolve confirm them (<DecisionRef id="OP-MON1" />). Channel Check is a placeholder (<DecisionRef id="OP-45" />).</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "Integrations", value: v.os.integrations.length, desc: `${live.length} mock adapters, ${v.os.integrations.length - live.length} placeholder`, icon: Network, variant: "primary", onSelect: () => nav(`${OBASE}/directory`) },
        { id: "h", label: "Healthy", value: n((h) => h === "healthy"), desc: "Successful requests, no failures in 24 h", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => nav(`${OBASE}/connection-health?h=healthy`) },
        { id: "d", label: "Degraded or failed", value: n((h) => h === "degraded" || h === "failed"), desc: "Failures in the last 24 h", icon: XCircle, variant: "status", tone: "negative", onSelect: () => nav(`${OBASE}/connection-health?h=degraded`) },
        { id: "dl", label: "Delayed", value: n((h) => h === "delayed"), desc: "Missed or late scheduled run", icon: Clock, variant: "status", tone: "warning", onSelect: () => nav(`${OBASE}/connection-health?h=delayed`) },
        { id: "u", label: "Unknown or not configured", value: n((h) => h === "unknown" || h === "not_configured" || h === "bcr"), desc: "No current health information", icon: CircleHelp, variant: "light", onSelect: () => nav(`${OBASE}/connection-health?h=unknown`) },
        { id: "r", label: "Requests, last 24 h", value: day.length, desc: `${day.filter((r) => r.status === "success").length} successful`, icon: Activity, variant: "light", onSelect: () => nav(`${OBASE}/trace`) },
        { id: "f", label: "Failures, last 24 h", value: day.filter((r) => r.status === "failed" || r.status === "timeout").length, desc: "Failed or timed out", icon: AlertTriangle, variant: "status", tone: "warning", onSelect: () => nav(`${OBASE}/failures`) },
        { id: "cb", label: "Pending SFDC callbacks", value: v.os.callbacks.filter((c) => c.delivery !== "acknowledged").length, desc: "Pending or failed (OP-24)", icon: Inbox, variant: "light", onSelect: () => nav(`${OBASE}/sfdc?tab=callbacks`) },
        { id: "q", label: "Queued messages", value: queued, desc: `${v.os.queues.length} queues (aliases)`, icon: ListChecks, variant: "light", onSelect: () => nav(`${OBASE}/jobs?tab=queues`) },
        { id: "a", label: "Open alerts", value: openAlerts.length, desc: "Sent through the Communication Centre", icon: Bell, variant: "status", tone: "warning", onSelect: () => nav(`${OBASE}/incidents`) },
        { id: "x", label: "Open integration exceptions", value: v.os.exceptions.filter((x) => x.status !== "resolved").length, desc: "SOW 11.5 exception types", icon: AlertTriangle, variant: "light", onSelect: () => nav(`${OBASE}/failures?tab=exceptions`) },
        { id: "rt", label: "Retries recorded", value: v.os.retries.length, desc: `${v.os.retries.filter((r) => r.status.startsWith("refused")).length} refused (duplicate or financial)`, icon: Repeat, variant: "light", onSelect: () => nav(`${OBASE}/retry`) },
        { id: "i", label: "Open incidents", value: v.os.incidents.filter((i) => i.status !== "closed" && i.status !== "resolved").length, desc: "Incident management", icon: Siren, variant: "light", onSelect: () => nav(`${OBASE}/incidents?tab=incidents`) },
      ]} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Integration volume" subtitle="Requests recorded across all connections, successful and failed" actions={<Segmented label="Grain" value={grain} onChange={setGrain} options={[{ value: "hour", label: "Hourly" }, { value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />}>
          <TrendChart data={vol.map((x) => ({ key: x.key, label: grain === "hour" ? x.key.slice(11) + ":00" : x.label, success: x.success, failed: x.failed }))} kind="stacked" ariaLabel="Integration requests by period" series={[{ key: "success", label: "Successful", color: "var(--chart-neutral-1)" }, { key: "failed", label: "Failed", color: "var(--vg-amber)" }]} onSelect={() => nav(`${OBASE}/trace`)} />
        </Panel>
        <Panel title="Top failing connections" subtitle="All recorded requests" actions={<Segmented label="Rank by" value={rank} onChange={setRank} options={[{ value: "failed", label: "Failures" }, { value: "failureRate", label: "Rate" }, { value: "avgMs", label: "Latency" }, { value: "pending", label: "Pending" }]} />}>
          <RankedBars
            items={topFailing(v.os.integrations, v.os.requests, rank).slice(0, 6).map((x) => ({ key: x.i.id, label: x.i.name, value: rank === "failed" ? x.s.failed : rank === "failureRate" ? Math.round((x.s.failureRate ?? 0) * 1000) / 10 : rank === "avgMs" ? x.s.avgMs ?? 0 : x.s.pending }))}
            valueFormat={(n) => (rank === "failureRate" ? `${n}%` : rank === "avgMs" ? ms(n) : String(n))}
            onSelect={(x) => nav(`${OBASE}/directory/${x.key}`)}
          />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Volume by message type" subtitle="All recorded requests: member, scan, redemption, ticket and other exchanges">
          <RankedBars items={volumeByType(v.os.requests).map((x) => ({ key: x.type, label: `${x.type[0].toUpperCase()}${x.type.slice(1)} (${x.failed} failed)`, value: x.total }))} onSelect={() => nav(`${OBASE}/trace`)} />
        </Panel>
        <Panel title="Volume by scheme" subtitle="Requests whose transaction earned points under a scheme">
          <RankedBars items={volumeByScheme(v.os.requests, schemeStore.get().accruals).slice(0, 8).map((x) => ({ key: x.schemeId, label: `${x.schemeId} (${x.failed} failed)`, value: x.total }))} onSelect={(x) => nav(`${OBASE}/trace?kind=scheme&q=${x.key}`)} />
        </Panel>
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Connection status" subtitle="Current health over the last 24 hours; statistics over 7 days" padded={false}>
          <DataTable rows={health} rowKey={(x) => x.i.id} caption="Integration health" searchable={false} onRowClick={(x) => nav(`${OBASE}/directory/${x.i.id}`)} columns={[
            { key: "n", header: "Integration", value: (x) => x.i.name, render: (x) => intLink(v.os, x.i.id) },
            { key: "h", header: "Health", value: (x) => x.h, render: (x) => <HealthBadge h={x.h} /> },
            { key: "r", header: "Requests (7 d)", value: (x) => statsFor(x.i.id).total, align: "right" },
            { key: "f", header: "Failure rate", value: (x) => statsFor(x.i.id).failureRate ?? -1, render: (x) => pct(statsFor(x.i.id).failureRate), align: "right" },
            { key: "p", header: "p95", value: (x) => statsFor(x.i.id).p95Ms ?? -1, render: (x) => ms(statsFor(x.i.id).p95Ms), align: "right" },
            { key: "ls", header: "Last success", value: (x) => statsFor(x.i.id).lastSuccess ?? "", render: (x) => <span className="small">{dt(statsFor(x.i.id).lastSuccess)}</span> },
          ]} />
        </Panel>
        <Panel title="Sync health alerts" subtitle="Raised by the monitoring adapter and sent to staff through the Communication Centre">
          <StatList items={openAlerts.slice(0, 8).map((a) => ({ label: `${ALERT_TYPE[a.type]}${a.integrationId ? ` · ${v.os.integrations.find((i) => i.id === a.integrationId)?.name}` : a.service ? ` · ${a.service}` : ""}`, value: a.status, note: a.trigger, onSelect: () => nav(`${OBASE}/incidents?alert=${a.id}`) }))} />
        </Panel>
      </div>
    </>
  );
}
