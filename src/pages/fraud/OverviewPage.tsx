import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, Briefcase, CheckCircle2, Copy, Fingerprint, GitCompare, Inbox, MapPin, QrCode, ShieldAlert, Smartphone, Timer, UserX, Wallet } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars, StatList } from "@/components/ui/DataBars";
import { Segmented } from "@/components/ui/primitives";
import { TrendChart } from "@/components/charts/Charts";
import { OPEN_CASE, VECTOR } from "@/config/riskCatalogue";
import { findBranch } from "@/config/geography";
import { eventsFor } from "@/features/risk/store";
import type { FraudVector } from "@/types/risk";
import { KpiGrid } from "@/pages/masters/shared";
import { Notice } from "@/pages/approvals/shared";
import { CaseBadge, DecisionRef, EventStatus, FBASE, SeverityBadge, SourceTag, VectorTag, caseLink, dt, memberName, useFraudView, userName } from "./shared";

const day = (at: string) => at.slice(0, 10);
const weekOf = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };

export function FraudOverviewPage() {
  const v = useFraudView();
  const nav = useNavigate();
  const [grain, setGrain] = useState<"daily" | "weekly" | "monthly">("daily");
  const ev = eventsFor(v.uid);
  const cases = v.rs.cases;
  const q = (p: string) => () => nav(`${FBASE}/queue?${p}`);
  const vc = (x: FraudVector) => ev.filter((e) => e.vector === x).length;
  const openCases = cases.filter((c) => OPEN_CASE.includes(c.status));
  const sevCase = (s: string) => cases.filter((c) => OPEN_CASE.includes(c.status) && c.eventIds.some((id) => ev.find((e) => e.id === id)?.severity === s)).length;
  const bucket = (at: string) => (grain === "daily" ? day(at) : grain === "weekly" ? weekOf(day(at)) : at.slice(0, 7));
  const keys = [...new Set(ev.map((e) => bucket(e.detectedAt)))].sort().slice(-14);
  const trend = keys.map((k) => ({ key: k, label: k, events: ev.filter((e) => bucket(e.detectedAt) === k).length, resolved: ev.filter((e) => bucket(e.detectedAt) === k && e.status === "cleared").length }));
  const states = [...new Set(ev.map((e) => (e.branchCode ? findBranch(e.branchCode)?.state.code ?? "—" : "—")))];
  return (
    <>
      <Notice tone="warn">Every flag on this page comes from a mock detection service: it is a signal for review, not proof of fraud. Thresholds are not confirmed (<DecisionRef id="OP-02" />); predictive results are simulated and no model is trained. Risk scores and severities appear only where the source supplied them.</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "Total risk events", value: ev.length, desc: "All sources, in your scope", icon: ShieldAlert, variant: "primary", onSelect: q("") },
        { id: "n", label: "New risk flags", value: ev.filter((e) => e.status === "new").length, desc: "Not yet in a case", icon: Inbox, variant: "status", tone: "warning", onSelect: q("status=new") },
        { id: "p", label: "Pending investigations", value: openCases.length, desc: "Open risk cases", icon: Briefcase, variant: "light", onSelect: () => nav(`${FBASE}/cases?state=open`) },
        { id: "h", label: "High-risk cases", value: sevCase("high"), desc: "Source severity High", icon: AlertTriangle, variant: "status", tone: "warning", onSelect: () => nav(`${FBASE}/cases?severity=high`) },
        { id: "c", label: "Critical-risk cases", value: sevCase("critical"), desc: "Source severity Critical", icon: AlertTriangle, variant: "status", tone: "negative", onSelect: () => nav(`${FBASE}/cases?severity=critical`) },
        { id: "df", label: "Device farming alerts", value: vc("device_farming"), desc: "Device risk service", icon: Smartphone, variant: "light", onSelect: q("vector=device_farming") },
        { id: "sr", label: "Unusual scan-rate alerts", value: vc("scan_rate"), desc: "Rule-based and predictive", icon: Activity, variant: "light", onSelect: q("vector=scan_rate") },
        { id: "gv", label: "Geo-velocity alerts", value: vc("geo_velocity"), desc: "Consecutive-scan travel", icon: MapPin, variant: "light", onSelect: q("vector=geo_velocity") },
        { id: "bl", label: "Branch leakage alerts", value: vc("branch_leakage"), desc: "Outside mapped branch", icon: MapPin, variant: "light", onSelect: q("vector=branch_leakage") },
        { id: "da", label: "Duplicate account flags", value: vc("duplicate_identity") + vc("cross_programme_kyc"), desc: "Identity registry", icon: Fingerprint, variant: "light", onSelect: () => nav(`${FBASE}/identity`) },
        { id: "dq", label: "Duplicate QR rejections", value: vc("duplicate_qr"), desc: "Rejected at scan", icon: Copy, variant: "light", onSelect: () => nav(`${FBASE}/qr`) },
        { id: "tq", label: "Tampered QR cases", value: v.rs.tampered.length, desc: `${v.rs.tampered.filter((t) => t.status !== "closed").length} open`, icon: QrCode, variant: "light", onSelect: () => nav(`${FBASE}/qr?tab=tampered`) },
        { id: "rb", label: "Redemption risk blocks", value: v.rs.redemptionBlocks.filter((b) => b.blockStatus === "blocked").length, desc: "Admins warned", icon: Wallet, variant: "status", tone: "negative", onSelect: () => nav(`${FBASE}/redemption`) },
        { id: "db", label: "Active device blocks", value: v.rs.devices.filter((d) => d.status === "blocked").length, desc: "Device governance", icon: Smartphone, variant: "light", onSelect: () => nav(`${FBASE}/devices?status=blocked`) },
        { id: "mr", label: "Restrictions under review", value: v.mem.restrictions.filter((r) => r.status === "reinstatement_pending").length, desc: "Member Management reinstatements", icon: UserX, variant: "light", onSelect: () => nav("/members/restrictions") },
        { id: "re", label: "Open reconciliation exceptions", value: v.rs.validationExceptions.filter((x) => x.status !== "resolved").length + v.rs.mismatches.filter((m) => m.status !== "reconciled").length, desc: "Data integrity + SFDC", icon: GitCompare, variant: "light", onSelect: () => nav(`${FBASE}/data`) },
        { id: "rs", label: "Resolved risk cases", value: cases.filter((c) => c.status === "cleared" || c.status === "closed").length, desc: "Cleared or closed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => nav(`${FBASE}/history`) },
        { id: "od", label: "Overdue investigations", value: 0, desc: v.rs.config.investigationSlaDays == null ? "SLA not configured (RK-SLA)" : `Over ${v.rs.config.investigationSlaDays} days`, icon: Timer, variant: "light", onSelect: () => nav(`${FBASE}/config-history#RK-SLA`) },
      ]} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Risk event trend" subtitle="Events received and events cleared, by detection date" actions={<Segmented label="Grain" value={grain} onChange={setGrain} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />}>
          <TrendChart data={trend} kind="bar" ariaLabel="Risk events by period" series={[{ key: "events", label: "Risk events", color: "var(--vg-amber)" }, { key: "resolved", label: "Cleared", color: "var(--positive-strong)" }]} onSelect={(p) => nav(`${FBASE}/queue?from=${p.key}`)} />
        </Panel>
        <Panel title="Fraud vector distribution">
          <RankedBars items={(Object.keys(VECTOR) as FraudVector[]).map((x) => ({ key: x, label: VECTOR[x].label, value: vc(x) })).filter((x) => x.value)} onSelect={(x) => nav(`${FBASE}/queue?vector=${x.key}`)} />
        </Panel>
      </div>
      <div className="grid-3">
        <Panel title="Events by programme"><RankedBars items={["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ key: p, label: p, value: ev.filter((e) => e.programme === p).length }))} onSelect={(x) => nav(`${FBASE}/queue?programme=${x.key}`)} /></Panel>
        <Panel title="Events by region"><RankedBars items={states.map((st) => ({ key: st, label: st, value: ev.filter((e) => (e.branchCode ? findBranch(e.branchCode)?.state.code ?? "—" : "—") === st).length }))} onSelect={(x) => nav(`${FBASE}/queue?state=${x.key}`)} /></Panel>
        <Panel title="Cases: open versus resolved">
          <RankedBars items={[{ key: "open", label: "Open", value: openCases.length, tone: "warning" }, { key: "resolved", label: "Cleared / closed", value: cases.length - openCases.length, tone: "positive" }]} onSelect={(x) => nav(`${FBASE}/cases?state=${x.key}`)} />
          <StatList items={[{ label: "Redemption risk blocks", value: String(v.rs.redemptionBlocks.length), onSelect: () => nav(`${FBASE}/redemption`) }, { label: "Device-related alerts", value: String(v.rs.alerts.filter((a) => a.kind.startsWith("device")).length), onSelect: () => nav(`${FBASE}/devices`) }]} />
        </Panel>
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Recent risk activity" padded={false}>
          <DataTable rows={[...ev].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 10)} rowKey={(e) => e.id} caption="Recent risk events" searchable={false} onRowClick={(e) => nav(e.caseId ? `${FBASE}/cases/${e.caseId}` : `${FBASE}/queue?event=${e.id}`)} columns={[
            { key: "id", header: "Risk event", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
            { key: "m", header: "Member", value: (e) => e.memberId ?? "", render: (e) => <span className="small">{e.memberId ?? "—"} · {memberName(v.mem, e.memberId)}</span> },
            { key: "p", header: "Programme", value: (e) => e.programme ?? "—" },
            { key: "v", header: "Vector", value: (e) => e.vector, render: (e) => <VectorTag v={e.vector} /> },
            { key: "s", header: "Severity", value: (e) => e.severity ?? "", render: (e) => <SeverityBadge s={e.severity} /> },
            { key: "d", header: "Detected", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
            { key: "src", header: "Source", value: (e) => e.source, render: (e) => <SourceTag s={e.source} /> },
            { key: "st", header: "Status", value: (e) => e.status, render: (e) => <EventStatus s={e.status} /> },
            { key: "inv", header: "Investigator", value: (e) => v.rs.cases.find((c) => c.id === e.caseId)?.ownerId ?? "", render: (e) => <span className="small">{(() => { const c = v.rs.cases.find((x) => x.id === e.caseId); return c?.ownerId ? userName(v.acc, c.ownerId) : "—"; })()}</span> },
          ]} />
        </Panel>
        <Panel title="Risk operations summary" subtitle="Risk cases are separate from Program Block and Temporary Hold status">
          <StatList items={[
            { label: "Pending reviewer actions (new or awaiting assignment)", value: String(cases.filter((c) => c.status === "new" || c.status === "pending_assignment").length), onSelect: () => nav(`${FBASE}/cases?status=new`) },
            { label: "Awaiting additional evidence", value: String(cases.filter((c) => c.status === "awaiting_evidence").length), onSelect: () => nav(`${FBASE}/cases?status=awaiting_evidence`) },
            { label: "Awaiting member / SR clarification", value: String(cases.filter((c) => c.status === "awaiting_external").length), onSelect: () => nav(`${FBASE}/cases?status=awaiting_external`) },
            { label: "Awaiting reinstatement", value: String(cases.filter((c) => c.status === "reinstatement_requested").length), onSelect: () => nav(`${FBASE}/cases?status=reinstatement_requested`) },
            { label: "Unresolved data conflicts", value: String(v.rs.mismatches.filter((m) => m.status !== "reconciled").length), onSelect: () => nav(`${FBASE}/sfdc`) },
            { label: "Failed risk-rule processing", value: String(v.rs.validationBatches.filter((b) => b.status !== "completed").length), onSelect: () => nav(`${FBASE}/data`) },
          ]} />
          <ul className="activity-list">{cases.slice(-3).reverse().map((c) => <li key={c.id}>{caseLink(c.id)} {c.title} <CaseBadge s={c.status} /></li>)}</ul>
        </Panel>
      </div>
    </>
  );
}
