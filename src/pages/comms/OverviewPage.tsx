import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertOctagon, Bell, CalendarClock, CheckCircle2, ClipboardCheck, Clock3, Headset, Mail, MessageCircle, MessageSquare, PenSquare, Smartphone, Send, XCircle, Zap, ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DonutChart, TrendChart } from "@/components/charts/Charts";
import { DataTable } from "@/components/ui/DataTable";
import { SelectField } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { CHANNEL, CHANNELS, DISPATCH_MODE, PROGRAMMES, SEED_CATALOGUE } from "@/config/commsCatalogue";
import { channelSummary } from "@/features/comms/engine";
import type { Communication } from "@/types/comms";
import { CBASE, ChannelTag, CommBadge, KpiRow, commLink, dt, useCommsView, userName } from "./shared";

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

export function CommsOverviewPage() {
  const v = useCommsView();
  const nav = useNavigate();
  const [prog, setProg] = useState("all");
  const [mode, setMode] = useState("all");
  const [nid, setNid] = useState("all");
  const [grain, setGrain] = useState("daily");
  const comms = useMemo(() => v.cs.communications.filter((c) => (mode === "all" || c.mode === mode) && (nid === "all" || c.notificationId === nid) && (prog === "all" || c.audience.programmes.includes(prog as never) || (c.audience.memberIds.length > 0 && v.mem.members.find((m) => m.id === c.audience.memberIds[0])?.programme === prog))), [v.cs.communications, mode, nid, prog, v.mem.members]);
  const ids = new Set(comms.map((c) => c.id));
  const attempts = v.cs.attempts.filter((a) => ids.has(a.commId));
  const sum = channelSummary(attempts);
  const today = v.now.slice(0, 10);
  const go = (q: string) => nav(`${CBASE}/history${q}`);
  const total = (k: "attempted" | "delivered" | "failed" | "pending") => CHANNELS.reduce((n, c) => n + sum[c][k], 0);
  const open = v.cs.queries.filter((q) => q.status !== "resolved");
  return (
    <>
      <div className="filters-bar">
        <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Dispatch mode" value={mode} onChange={setMode} options={[{ value: "all", label: "All" }, ...Object.entries(DISPATCH_MODE).map(([k, d]) => ({ value: k, label: d.label }))]} />
        <SelectField label="Notification" value={nid} onChange={setNid} options={[{ value: "all", label: "All" }, ...SEED_CATALOGUE.map((e) => ({ value: e.id, label: `${e.id} ${e.name}` }))]} />
      </div>
      <KpiRow
        items={[
          { id: "created", label: "Total messages created", value: comms.length, desc: "Business communications (dispatch requests), not channel attempts", icon: PenSquare, variant: "primary", onSelect: () => go("") },
          { id: "today", label: "Messages sent today", value: comms.filter((c) => c.dispatchedAt?.startsWith(today)).length, desc: "Dispatched today (demo clock)", icon: Send, onSelect: () => go("?date=today") },
          { id: "sched", label: "Messages scheduled", value: comms.filter((c) => c.status === "scheduled").length, desc: "Approved and waiting for the scheduler", icon: CalendarClock, onSelect: () => nav(`${CBASE}/scheduled`) },
          { id: "auto", label: "Automated notifications", value: comms.filter((c) => c.mode === "rule").length, desc: "Triggered by authoritative events (N01–N11)", icon: Zap, variant: "dark", onSelect: () => nav(`${CBASE}/rules`) },
          { id: "manual", label: "Manual communications", value: comms.filter((c) => c.mode !== "rule").length, desc: "Manual and scheduled", icon: PenSquare, onSelect: () => go("?mode=manual") },
          { id: "wa", label: "WhatsApp messages", value: sum.whatsapp.attempted, desc: "Channel attempts", icon: MessageCircle, onSelect: () => nav(`${CBASE}/delivery?channel=whatsapp`) },
          { id: "sms", label: "SMS messages", value: sum.sms.attempted, desc: "Including WhatsApp fallbacks", icon: MessageSquare, onSelect: () => nav(`${CBASE}/delivery?channel=sms`) },
          { id: "email", label: "Email messages", value: sum.email.attempted, desc: "Channel attempts", icon: Mail, onSelect: () => nav(`${CBASE}/delivery?channel=email`) },
          { id: "push", label: "Push notifications", value: sum.push.attempted, desc: "Channel attempts", icon: Bell, onSelect: () => nav(`${CBASE}/delivery?channel=push`) },
          { id: "inapp", label: "In-app messages", value: sum.inapp.attempted, desc: "Inbox publications", icon: Smartphone, onSelect: () => nav(`${CBASE}/delivery?channel=inapp`) },
          { id: "ok", label: "Successful deliveries", value: total("delivered"), desc: "Delivery callback received or published to the inbox", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => nav(`${CBASE}/delivery?status=delivered`) },
          { id: "failed", label: "Failed deliveries", value: total("failed"), desc: "Provider failure or no contact for the channel", icon: XCircle, variant: "status", tone: "negative", onSelect: () => nav(`${CBASE}/delivery?status=failed`) },
          { id: "pending", label: "Pending deliveries", value: total("pending"), desc: "Accepted or dispatched; no delivery callback yet", icon: Clock3, variant: "status", tone: "warning", onSelect: () => nav(`${CBASE}/delivery?status=pending`) },
          { id: "apr", label: "Messages awaiting approval", value: comms.filter((c) => c.status === "pending_approval").length, desc: "Routed to the Approval Engine", icon: ClipboardCheck, variant: "status", tone: "warning", onSelect: () => go("?status=pending_approval") },
          { id: "open", label: "Open helpdesk conversations", value: open.length, desc: "Not resolved", icon: Headset, onSelect: () => nav(`${CBASE}/helpdesk`) },
          { id: "esc", label: "Escalated support queries", value: open.filter((q) => q.status === "escalated").length, desc: "Waiting for a human agent", icon: AlertOctagon, variant: "status", tone: "negative", onSelect: () => nav(`${CBASE}/helpdesk?status=escalated`) },
        ]}
      />
      <div className="grid-2">
        <Panel title="Channel distribution" subtitle={`${attempts.length} channel attempts for ${comms.length} communications (one communication can use several channels)`}>
          <DonutChart items={CHANNELS.map((c, i) => ({ key: c, label: CHANNEL[c].label, value: sum[c].attempted, color: [CHART.positive, CHART.warning, CHART.info, CHART.lead, CHART.support][i] }))} centerLabel="attempts" ariaLabel="Attempts by channel" />
          <table className="table table--compact">
            <thead><tr><th>Channel</th><th className="num">Attempted</th><th className="num">Delivered</th><th className="num">Failed</th><th className="num">Pending</th></tr></thead>
            <tbody>{CHANNELS.map((c) => <tr key={c}><th scope="row"><ChannelTag ch={c} /></th><td className="num">{sum[c].attempted}</td><td className="num">{sum[c].delivered}</td><td className="num">{sum[c].failed}</td><td className="num">{sum[c].pending}</td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Communication trends" actions={<SelectField label="Grain" value={grain} onChange={setGrain} options={[{ value: "daily", label: "Daily (last 14 days)" }, { value: "monthly", label: "Monthly" }]} />}>
          <TrendSeries comms={comms} grain={grain} today={today} />
        </Panel>
      </div>
      <Panel title="Recent communication activity" subtitle="Select a row for the communication detail">
        <DataTable
          rows={[...comms].sort((a, b) => ((b.dispatchedAt ?? b.createdAt) < (a.dispatchedAt ?? a.createdAt) ? -1 : 1)).slice(0, 60)}
          rowKey={(c) => c.id}
          caption="Recent communications"
          onRowClick={(c) => nav(`${CBASE}/history/${c.id}`)}
          columns={[
            { key: "id", header: "Message reference", value: (c) => c.id, render: (c) => commLink(c.id) },
            { key: "n", header: "Notification", value: (c) => c.notificationId ?? "" },
            { key: "type", header: "Message type", value: (c) => c.name },
            { key: "aud", header: "Audience", value: (c) => c.audienceCount, align: "right" },
            { key: "ch", header: "Channels", value: (c) => c.channels.join(", "), render: (c) => <span className="chip-list">{c.channels.map((ch) => <ChannelTag key={ch} ch={ch} />)}</span> },
            { key: "mode", header: "Dispatch mode", value: (c) => DISPATCH_MODE[c.mode].label },
            { key: "by", header: "Initiated by", value: (c) => userName(v.acc, c.createdBy) },
            { key: "at", header: "Scheduled / sent", value: (c) => c.dispatchedAt ?? c.scheduledAt ?? "", render: (c) => <span className="num small">{dt(c.dispatchedAt ?? c.scheduledAt)}</span> },
            { key: "st", header: "Delivery status", value: (c) => c.status, render: (c) => <CommBadge status={c.status} /> },
          ]}
        />
      </Panel>
      <p className="small muted"><ArrowUpRight size={12} aria-hidden="true" /> Figures are development data from mock providers. No production message volume or delivery rate is implied.</p>
    </>
  );
}

function TrendSeries({ comms, grain, today }: { comms: Communication[]; grain: string; today: string }) {
  const keys = useMemo(() => {
    if (grain === "monthly") return Array.from(new Set(comms.map((c) => (c.dispatchedAt ?? c.createdAt).slice(0, 7)))).sort();
    const out: string[] = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - i); out.push(d.toISOString().slice(0, 10)); }
    return out;
  }, [comms, grain, today]);
  const data = keys.map((k) => {
    const xs = comms.filter((c) => (c.dispatchedAt ?? c.createdAt).startsWith(k));
    return { key: k, label: grain === "monthly" ? monthLabel(k) : k.slice(5), rule: xs.filter((c) => c.mode === "rule").length, scheduled: xs.filter((c) => c.mode === "scheduled").length, manual: xs.filter((c) => c.mode === "manual").length };
  });
  return <TrendChart data={data} kind="stacked" series={[{ key: "rule", label: "Rule-based", color: CHART.lead }, { key: "scheduled", label: "Scheduled", color: CHART.info }, { key: "manual", label: "Manual", color: CHART.support }]} ariaLabel="Communications by dispatch mode" />;
}
