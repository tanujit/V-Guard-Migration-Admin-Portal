import { Info } from "lucide-react";
import { useSection } from "@/hooks/useSection";
import { useDrill } from "@/context/DrillContext";
import { findState } from "@/config/geography";
import { CASE_STATUSES, PRIORITIES, statusLabel } from "@/config/statuses";
import { Panel } from "@/components/ui/Panel";
import { FigureRow, RankedBars, ShareBar } from "@/components/ui/DataBars";
import { DataTable } from "@/components/ui/DataTable";
import { TrendChart } from "@/components/charts/Charts";
import { ProgrammeTag, StatusBadge } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { formatCompact, formatCount, formatDateTime } from "@/lib/format";
import type { ActivityRow, RiskAlert } from "@/types/dashboard";
import { DashboardSection, type SectionProps } from "../DashboardSection";

const priorityTone = (p: RiskAlert["priority"]) => PRIORITIES.find((x) => x.key === p)!.tone;

/* ------------------------------ O. Fraud & risk ------------------------------ */

export function RiskSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("risk", [], refreshToken);
  const { openDrill } = useDrill();
  const risk = (title: string, context: Record<string, string> = {}, value?: string) => openDrill({ module: "fraud-rules", title, context, value });

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${formatCompact(state.data.totals.pendingInvestigations)} pending investigations`}>
      {(d) => (
        <div className="grid grid--12">
          <Panel span={12} padded={false}>
            <div className="callout callout--quiet">
              <Info size={16} strokeWidth={1.5} aria-hidden="true" />
              <p>Summary only. Nothing here blocks members or decides a case. Actions on members go through Maker-Checker approval in a later phase. Case status names are subject to the final workflow.</p>
            </div>
            <FigureRow
              items={[
                { label: "Flagged in period", value: formatCount(d.totals.flagged), onSelect: () => risk("Flagged members", {}, formatCount(d.totals.flagged)) },
                { label: "Pending investigation", value: formatCount(d.totals.pendingInvestigations), tone: "accent", onSelect: () => risk("Pending investigations", { status: "New, Under review, Escalated" }, formatCount(d.totals.pendingInvestigations)) },
                { label: "Blocked members", value: formatCount(d.totals.blocked), sub: "As at period end", onSelect: () => openDrill({ module: "members", title: "Blocked members", context: { status: "Blocked" }, value: formatCount(d.totals.blocked) }) },
                { label: "Resolved cases", value: formatCount(d.totals.resolved), onSelect: () => risk("Resolved cases", { status: "Resolved" }, formatCount(d.totals.resolved)) },
              ]}
            />
          </Panel>
          <Panel span={5} title="Alerts by risk category">
            <RankedBars items={d.categories} onSelect={(i) => risk(`${i.label} alerts`, { category: i.label }, formatCount(i.value))} />
          </Panel>
          <Panel span={7} title="Alert trend" subtitle="Monthly">
            <TrendChart ariaLabel="Monthly fraud and risk alerts" data={d.trend} series={[{ key: "alerts", label: "Alerts raised", color: CHART.warning }]} height={200} legend={false} onSelect={(p) => risk(`Alerts · ${p.label}`, { month: String(p.label) }, formatCount(Number(p.alerts)))} />
          </Panel>
          <Panel span={7} title="Case status">
            <ShareBar label="Case status" items={d.statuses} onSelect={(i) => risk(`${i.label} cases`, { status: i.label }, formatCount(i.value))} />
          </Panel>
          <Panel span={5} title="Open investigations by age">
            <RankedBars items={d.ageing} onSelect={(i) => risk(`Open investigations · ${i.label}`, { ageing: i.label }, formatCount(i.value))} />
          </Panel>
          <Panel span={12} title="Recent high-priority alerts" subtitle="Open alerts with critical or high priority. Member references are masked" padded={false}>
            <DataTable
              rows={d.alerts}
              rowKey={(r) => r.id}
              caption="Recent high-priority alerts"
              searchPlaceholder="Search alerts"
              pageSize={8}
              exportName="high-priority-alerts"
              onRowClick={(r) => risk(`Alert ${r.id}`, { alert: r.id, category: r.category })}
              rowActionLabel={(r) => `Open alert ${r.id}`}
              emptyTitle="No open high-priority alerts"
              columns={[
                { key: "at", header: "Raised", value: (r) => r.raisedAt, render: (r) => <span className="num small">{formatDateTime(r.raisedAt)}</span> },
                { key: "id", header: "Alert", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
                { key: "category", header: "Category", value: (r) => r.category },
                { key: "programme", header: "Programme", value: (r) => r.programme, render: (r) => <ProgrammeTag code={r.programme} /> },
                { key: "state", header: "State", value: (r) => findState(r.state)?.name ?? r.state },
                { key: "member", header: "Member", value: (r) => r.memberRef, render: (r) => <span className="mono small">{r.memberRef}</span> },
                { key: "priority", header: "Priority", value: (r) => statusLabel(PRIORITIES, r.priority), render: (r) => <StatusBadge tone={priorityTone(r.priority)}>{statusLabel(PRIORITIES, r.priority)}</StatusBadge> },
                { key: "status", header: "Status", value: (r) => statusLabel(CASE_STATUSES, r.status), render: (r) => <StatusBadge tone={CASE_STATUSES.find((s) => s.key === r.status)!.tone}>{statusLabel(CASE_STATUSES, r.status)}</StatusBadge> },
              ]}
            />
          </Panel>
        </div>
      )}
    </DashboardSection>
  );
}

/* ------------------------------ P. Operational performance ------------------------------ */

const JOB_TONE = { on_time: "positive", delayed: "warning", failed: "negative" } as const;
const JOB_LABEL = { on_time: "On time", delayed: "Delayed", failed: "Failed" } as const;

export function OperationsSection({ refreshToken, ...props }: SectionProps) {
  const state = useSection("operations", [], refreshToken);
  const { openDrill } = useDrill();

  return (
    <DashboardSection {...props} state={state} summary={state.data && `${state.data.approvals.pending} approvals pending · ${state.data.tickets.slaBreaches} SLA breaches`}>
      {(d) => {
        const failedTxns = d.integrations.reduce((a, i) => a + i.failed, 0);
        const badJobs = d.jobs.filter((j) => j.status !== "on_time").length;
        return (
          <div className="grid grid--12">
            <Panel span={12} padded={false}>
              <FigureRow
                items={[
                  { label: "Pending approvals", value: String(d.approvals.pending), tone: "accent", onSelect: () => openDrill({ module: "approvals", title: "Pending approval requests", context: { status: "Pending approval" }, value: String(d.approvals.pending) }) },
                  { label: "Open support tickets", value: formatCount(d.tickets.open), onSelect: () => openDrill({ module: "tickets", title: "Open tickets", context: { status: "Open" }, value: formatCount(d.tickets.open) }) },
                  { label: "Escalated tickets", value: formatCount(d.tickets.escalated), onSelect: () => openDrill({ module: "tickets", title: "Escalated tickets", context: { status: "Escalated" }, value: formatCount(d.tickets.escalated) }) },
                  { label: "SLA breaches", value: formatCount(d.tickets.slaBreaches), tone: "negative", onSelect: () => openDrill({ module: "tickets", title: "SLA breaches", context: { sla: "Breached" }, value: formatCount(d.tickets.slaBreaches) }) },
                  { label: "Failed integration transactions", value: formatCount(failedTxns), sub: "Last 24 hours", onSelect: () => openDrill({ module: "integrations", title: "Failed integration transactions", value: formatCount(failedTxns) }) },
                  { label: "Jobs failed or delayed", value: String(badJobs), sub: `of ${d.jobs.length} scheduled`, onSelect: () => openDrill({ module: "health", title: "Scheduled jobs needing attention", value: String(badJobs) }) },
                ]}
              />
            </Panel>
            <Panel span={4} title="Approval requests by age">
              <RankedBars items={d.approvals.ageing} onSelect={(i) => openDrill({ module: "approvals", title: `Pending approvals · ${i.label}`, context: { ageing: i.label }, value: String(i.value) })} />
            </Panel>
            <Panel span={4} title="Integrations" subtitle="Failed transactions, last 24 hours">
              <ul className="ops-list">
                {d.integrations.map((i) => (
                  <li key={i.name}>
                    <button type="button" className="ops-list__item" onClick={() => openDrill({ module: "integrations", title: i.name, value: `${i.failed} failed` })}>
                      <span className="ops-list__name">{i.name}</span>
                      <span className={`num ${i.failed ? "neg" : "muted"}`}>{i.failed ? formatCount(i.failed) : "None"}</span>
                      <span className="ops-list__meta">{i.lastFailure ? `Last ${formatDateTime(i.lastFailure)}` : "No failures"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel span={4} title="Scheduled jobs">
              <ul className="ops-list">
                {d.jobs.map((j) => (
                  <li key={j.name}>
                    <button type="button" className="ops-list__item" onClick={() => openDrill({ module: "health", title: j.name, context: { schedule: j.schedule } })}>
                      <span className="ops-list__name">{j.name}</span>
                      <StatusBadge tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</StatusBadge>
                      <span className="ops-list__meta">
                        {j.schedule} · last {formatDateTime(j.lastRun)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel span={12} title="Recent system alerts">
              <ul className="alert-list">
                {d.alerts.map((a) => (
                  <li key={a.at + a.message} className="alert-list__row">
                    <span className="num small muted">{formatDateTime(a.at)}</span>
                    <StatusBadge tone={a.tone}>{a.tone === "negative" ? "Failure" : a.tone === "warning" ? "Warning" : "Recovered"}</StatusBadge>
                    <span>{a.message}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel span={12} title="Recent operational activity" subtitle="Demo activity log. Initiators are sample users" padded={false}>
              <DataTable<ActivityRow>
                rows={d.activities}
                rowKey={(r) => r.id}
                caption="Recent operational activity"
                searchPlaceholder="Search type, reference or person"
                pageSize={10}
                exportName="operational-activity"
                onRowClick={(r) => openDrill({ module: r.type.includes("ticket") ? "tickets" : r.type.includes("Fraud") ? "fraud-rules" : "audit", title: `${r.type} ${r.reference}`, context: { reference: r.reference, status: r.status } })}
                rowActionLabel={(r) => `Open ${r.reference}`}
                columns={[
                  { key: "at", header: "Date and time", value: (r) => r.at, render: (r) => <span className="num small">{formatDateTime(r.at)}</span> },
                  { key: "type", header: "Activity", value: (r) => r.type },
                  { key: "ref", header: "Reference", value: (r) => r.reference, render: (r) => <span className="mono small">{r.reference}</span> },
                  { key: "programme", header: "Programme", value: (r) => r.programme, render: (r) => (r.programme === "All" ? <span className="muted">All</span> : <ProgrammeTag code={r.programme} />) },
                  { key: "by", header: "Initiated by", value: (r) => r.initiatedBy },
                  { key: "status", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.statusTone}>{r.status}</StatusBadge> },
                  { key: "priority", header: "Priority", value: (r) => ["critical", "high", "medium", "low"].indexOf(r.priority), render: (r) => <StatusBadge tone={priorityTone(r.priority)}>{statusLabel(PRIORITIES, r.priority)}</StatusBadge> },
                ]}
              />
            </Panel>
          </div>
        );
      }}
    </DashboardSection>
  );
}
