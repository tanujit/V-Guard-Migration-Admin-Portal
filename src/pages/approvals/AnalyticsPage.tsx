import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DonutChart, TrendChart } from "@/components/charts/Charts";
import { FigureRow, RankedBars } from "@/components/ui/DataBars";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { PENDING } from "@/config/approvalCatalogue";
import { programmeColor } from "@/config/programmes";
import { CHART } from "@/lib/chartColors";
import { formatDateTime, formatPercent } from "@/lib/format";
import { addHours, ageHours, currentRun, formatAge, hoursBetween, isOverdue } from "@/features/approvals/engine";
import type { ApprovalAuditEvent, ApprovalRequest } from "@/types/approval";
import type { ShareItem } from "@/types/dashboard";
import { SectionTitle } from "@/pages/users/shared";
import { BASE, moduleLabel, orgLabel, useApprovalView, userLabel } from "./shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function countBy(rows: ApprovalRequest[], key: (r: ApprovalRequest) => string, label: (k: string) => string): ShareItem[] {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  return Array.from(m.entries())
    .map(([k, v]) => ({ key: k, label: label(k), value: v }))
    .sort((a, b) => b.value - a.value);
}

export function AnalyticsPage() {
  const view = useApprovalView();
  const { visible, acc, now, admin } = view;
  const navigate = useNavigate();

  const d = useMemo(() => {
    const submitted = visible.filter((r) => r.submittedAt);
    const decided = submitted.filter((r) => r.status === "approved" || r.status === "rejected");
    const approved = decided.filter((r) => r.status === "approved").length;
    const returnedOnce = submitted.filter((r) => r.stages.some((st) => st.decision === "returned") || r.versions.length > 1).length;
    const avg = decided.length ? decided.reduce((n, r) => n + ageHours(r, now), 0) / decided.length : 0;
    const pending = submitted.filter((r) => PENDING.includes(r.status));

    // Daily trend: last 14 days to the demo moment.
    const daily = Array.from({ length: 14 }, (_, i) => {
      const day = addHours(now, -24 * (13 - i)).slice(0, 10);
      return {
        key: day,
        label: formatDateTime(day).replace(/ 2026$/, ""),
        Submitted: submitted.filter((r) => r.submittedAt!.slice(0, 10) === day).length,
        Decided: decided.filter((r) => r.completedAt!.slice(0, 10) === day).length,
      };
    });
    // Monthly trend: from the first month with data to the demo month.
    const first = submitted.reduce((m, r) => (r.submittedAt! < m ? r.submittedAt! : m), now).slice(0, 7);
    const months: string[] = [];
    for (let [y, mo] = first.split("-").map(Number); `${y}-${String(mo).padStart(2, "0")}` <= now.slice(0, 7); mo === 12 ? ((mo = 1), y++) : mo++) months.push(`${y}-${String(mo).padStart(2, "0")}`);
    const monthly = months.map((m) => ({
      key: m,
      label: `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`,
      Approved: decided.filter((r) => r.status === "approved" && r.completedAt!.slice(0, 7) === m).length,
      Rejected: decided.filter((r) => r.status === "rejected" && r.completedAt!.slice(0, 7) === m).length,
      Submitted: submitted.filter((r) => r.submittedAt!.slice(0, 7) === m).length,
    }));

    const outcome: ShareItem[] = [
      { key: "approved", label: "Approved", value: approved, color: CHART.positive },
      { key: "rejected", label: "Rejected", value: decided.length - approved, color: CHART.negative },
      { key: "withdrawn", label: "Withdrawn", value: submitted.filter((r) => r.status === "withdrawn").length, color: CHART.neutral },
    ].filter((x) => x.value > 0);

    const pendingByModule = countBy(pending, (r) => r.module, moduleLabel);
    const pendingByProgramme = countBy(pending, (r) => r.programme ?? "All", (k) => (k === "All" ? "Not programme-specific" : k)).map((x) => ({ ...x, color: x.key === "All" ? undefined : programmeColor(x.key) }));
    const byOrg = countBy(submitted, (r) => r.makerOrgId, (k) => orgLabel(acc, k));
    const tatByModule = Array.from(new Set(decided.map((r) => r.module)))
      .map((m) => {
        const rs = decided.filter((r) => r.module === m);
        return { key: m, label: moduleLabel(m), value: Math.round(rs.reduce((n, r) => n + ageHours(r, now), 0) / rs.length) };
      })
      .sort((a, b) => b.value - a.value);
    const overdue = submitted.filter((r) => isOverdue(r, now));
    const overdueAgeing: ShareItem[] = [
      { key: "0-24", label: "Up to 1 day overdue", test: (h: number) => h < 24 },
      { key: "24-72", label: "1–3 days overdue", test: (h: number) => h >= 24 && h < 72 },
      { key: "72+", label: "Over 3 days overdue", test: (h: number) => h >= 72 },
    ].map((b) => ({ key: b.key, label: b.label, value: overdue.filter((r) => b.test(currentRun(r)?.dueAt ? hoursBetween(currentRun(r)!.dueAt!, now) : 0)).length, tone: b.key === "72+" ? ("negative" as const) : ("warning" as const) }));
    // Stage-wise: where pending requests sit now, and decisions recorded per stage.
    const stageWise = countBy(pending.filter((r) => currentRun(r)), (r) => currentRun(r)!.name, (k) => k);
    const stageDecisions = new Map<string, { approved: number; returned: number; rejected: number }>();
    submitted.forEach((r) =>
      r.stages.forEach((st) => {
        if (!st.decision) return;
        const e = stageDecisions.get(st.name) ?? { approved: 0, returned: 0, rejected: 0 };
        e[st.decision]++;
        stageDecisions.set(st.name, e);
      }),
    );
    return { submitted, decided, approved, returnedOnce, avg, pending, daily, monthly, outcome, pendingByModule, pendingByProgramme, byOrg, tatByModule, overdueAgeing, stageWise, stageDecisions: Array.from(stageDecisions.entries()), overdue };
  }, [visible, acc, now]);

  const ids = new Set(visible.map((r) => r.id));
  // Administrators also see configuration events (workflows, policies, governance decisions).
  const audit = view.s.audit.filter((e) => ids.has(e.requestId) || (admin && !e.requestId.startsWith("APR-")));
  const columns: Column<ApprovalAuditEvent>[] = [
    { key: "at", header: "Time", value: (e) => e.at, render: (e) => <span className="num small">{formatDateTime(e.at)}</span> },
    { key: "id", header: "Audit ID", value: (e) => e.id, render: (e) => <span className="mono small muted">{e.id}</span> },
    { key: "req", header: "Request", value: (e) => e.requestId, render: (e) => <span className="mono small">{e.requestId} · v{e.version}</span> },
    { key: "action", header: "Event", value: (e) => e.action, render: (e) => <span className={`mono small ${e.override || e.action === "decision.blocked" ? "neg" : ""}`}>{e.action}</span> },
    { key: "actor", header: "Actor", value: (e) => userLabel(acc, e.actorUserId), render: (e) => <span className="cell-2"><span className="cell-2__main small">{userLabel(acc, e.actorUserId)}</span><span className="cell-2__sub">{e.actorOrgId ? orgLabel(acc, e.actorOrgId) : "—"}</span></span> },
    { key: "profile", header: "Acting as", value: (e) => e.actorProfile, render: (e) => <span className="small muted">{e.actorProfile}</span> },
    { key: "module", header: "Module", value: (e) => moduleLabel(e.module), render: (e) => <span className="small">{moduleLabel(e.module)}</span> },
    { key: "stage", header: "Stage", value: (e) => e.stage ?? "" },
    { key: "status", header: "Status change", value: (e) => (e.previousStatus || e.newStatus ? `${e.previousStatus ?? "—"} → ${e.newStatus ?? "—"}` : "") },
    { key: "values", header: "Values", value: (e) => [e.previousValue, e.newValue].filter(Boolean).join(" → "), render: (e) => <span className="small">{[e.previousValue, e.newValue].filter(Boolean).join(" → ") || "—"}</span> },
    { key: "remarks", header: "Remarks", value: (e) => e.remarks, render: (e) => <span className="small cell-wrap">{e.remarks || "—"}</span> },
    { key: "ref", header: "Ref", value: (e) => e.ref, render: (e) => <span className="mono small muted">{e.ref}</span> },
  ];

  return (
    <>
      <SectionTitle title="Approval analytics" description={`Volumes, turnaround and outcomes for requests you can see${admin ? " across all organisations" : " within your scope"}. Development data`} />
      <Panel level={3}>
        <FigureRow
          items={[
            { label: "Decided requests", value: String(d.decided.length), sub: `${d.approved} approved` },
            { label: "Approval rate", value: d.decided.length ? formatPercent(d.approved / d.decided.length, 0) : "—", tone: "positive" },
            { label: "Returned at least once", value: d.submitted.length ? formatPercent(d.returnedOnce / d.submitted.length, 0) : "—", sub: `${d.returnedOnce} requests` },
            { label: "Average turnaround", value: formatAge(d.avg), sub: "Submission to final decision", tone: "accent" },
            { label: "Pending now", value: String(d.pending.length), onSelect: () => navigate(`${BASE}/all?status=pending`) },
            { label: "Overdue now", value: String(d.overdue.length), tone: d.overdue.length ? "negative" : undefined, onSelect: () => navigate(`${BASE}/overdue`) },
          ]}
        />
      </Panel>

      <div className="grid-2 grid-2--wide-left">
        <Panel title="Daily request trend" subtitle="Submitted and decided, last 14 days" level={3}>
          <TrendChart data={d.daily} series={[{ key: "Submitted", label: "Submitted", color: CHART.lead }, { key: "Decided", label: "Decided", color: CHART.support }]} kind="bar" height={240} ariaLabel="Daily submitted and decided approval requests" />
        </Panel>
        <Panel title="Approved versus rejected" subtitle="All final outcomes" level={3}>
          <DonutChart items={d.outcome} centerLabel="closed" ariaLabel="Approved, rejected and withdrawn requests" height={200} />
        </Panel>
      </div>

      <Panel title="Monthly request trend" subtitle="Submissions and final outcomes per month" level={3}>
        <TrendChart data={d.monthly} series={[{ key: "Submitted", label: "Submitted", color: CHART.lead }, { key: "Approved", label: "Approved", color: CHART.positive }, { key: "Rejected", label: "Rejected", color: CHART.negative }]} kind="bar" height={220} ariaLabel="Monthly approval requests and outcomes" />
      </Panel>

      <div className="grid-3">
        <Panel title="Pending by module" level={3}>
          {d.pendingByModule.length ? <RankedBars items={d.pendingByModule} onSelect={() => navigate(`${BASE}/all?status=pending`)} /> : <p className="muted small">Nothing pending</p>}
        </Panel>
        <Panel title="Pending by programme" level={3}>
          {d.pendingByProgramme.length ? <RankedBars items={d.pendingByProgramme} /> : <p className="muted small">Nothing pending</p>}
        </Panel>
        <Panel title="Requests by organisation" subtitle="Maker organisation, all submissions" level={3}>
          <RankedBars items={d.byOrg} />
        </Panel>
      </div>

      <div className="grid-3">
        <Panel title="Turnaround by module" subtitle="Average hours, submission to decision" level={3}>
          <RankedBars items={d.tatByModule} valueFormat={(n) => `${n}h`} />
        </Panel>
        <Panel title="Overdue approvals by ageing" subtitle="Time past the stage SLA" level={3}>
          {d.overdue.length ? <RankedBars items={d.overdueAgeing} onSelect={() => navigate(`${BASE}/overdue`)} /> : <p className="muted small">Nothing overdue</p>}
        </Panel>
        <Panel title="Stage-wise distribution" subtitle="Where pending requests are waiting" level={3}>
          {d.stageWise.length ? <RankedBars items={d.stageWise} /> : <p className="muted small">Nothing pending</p>}
        </Panel>
      </div>

      <Panel title="Decisions by stage" subtitle="Every recorded stage decision, including earlier versions" level={3} padded={false}>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Decisions by approval stage</caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col" className="is-right">Approved</th>
                <th scope="col" className="is-right">Returned</th>
                <th scope="col" className="is-right">Rejected</th>
                <th scope="col" className="is-right">Approval rate</th>
              </tr>
            </thead>
            <tbody>
              {d.stageDecisions.map(([name, v]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="is-right num">{v.approved}</td>
                  <td className="is-right num">{v.returned}</td>
                  <td className="is-right num">{v.rejected}</td>
                  <td className="is-right num">{formatPercent(v.approved / (v.approved + v.returned + v.rejected), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Approval audit log" subtitle="Immutable events: creation, routing, views, decisions, blocked attempts, execution and configuration changes. IP and device context are not captured until an audit service supplies them" padded={false} level={3}>
        <DataTable rows={audit} columns={columns} rowKey={(e) => e.id} caption="Approval audit log" searchPlaceholder="Search events" exportName="approval-audit" initialSort={{ key: "at", dir: "desc" }} onRowClick={(e) => e.requestId.startsWith("APR-") && navigate(`${BASE}/request/${e.requestId}`)} rowActionLabel={(e) => `Open ${e.requestId}`} />
      </Panel>
    </>
  );
}
