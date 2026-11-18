import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Ban, Banknote, CheckCircle2, ClipboardList, Clock3, Coins, CreditCard, Hourglass, IndianRupee, Mail, PhoneCall, RotateCcw, Send, Undo2, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { EmptyState, SelectField, StatusBadge } from "@/components/ui/primitives";
import { RankedBars } from "@/components/ui/DataBars";
import { TrendChart } from "@/components/charts/Charts";
import { Checkbox, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { CHART } from "@/lib/chartColors";
import { CANCEL_REASONS, GIFT_CATALOGUE, GIFT_REASONS, PROGRAMMES, REDEMPTION_METHOD, STAGE, TDS_MODEL, fy } from "@/config/walletCatalogue";
import { memberById } from "@/features/members/engine";
import { autoReversalStatus, cancellationEligibility, limitCheck, redemptionBlockers } from "@/features/wallet/engine";
import { GIFT_CSV_HEADER, canCancelRedemption, recoverVoucher, requestCancellation, runAutoReversal, simulatePayoutCallback, submitGift, submitGiftBatch, submitLimitPolicy } from "@/features/wallet/store";
import { redemptionTds } from "@/features/wallet/tdsAdapter";
import type { PolicyValue, RedemptionLimitPolicy, RedemptionRequest } from "@/types/wallet";
import { Notice } from "@/pages/approvals/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { BcrTag, DecisionRef, FinKpiGrid, OpBadge, RBASE, StageBadge, TrackBadge, approvalLink, dt, inr, ledgerLink, memberLink, memberName, pts, redemptionLink, stateOf, useParam, useRun, useWalletView, userName, type WalletView } from "@/pages/wallet/shared";

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const useReds = (v: WalletView) => v.ws.redemptions.filter((r) => v.canOn("redemption", "view", r.memberId));

/* ======================= Overview ======================= */

export function RedemptionOverviewPage() {
  const v = useWalletView("redemption");
  const nav = useNavigate();
  const reds = useReds(v);
  const go = (q: string) => nav(`${RBASE}/requests${q}`);
  const stage = (...s: RedemptionRequest["stage"][]) => reds.filter((r) => s.includes(r.stage)).length;
  const live = reds.filter((r) => !["blocked", "reversed", "cancelled"].includes(r.stage));
  const months = Array.from(new Set(reds.map((r) => r.createdAt.slice(0, 7)))).sort().slice(-12);
  const data = months.map((m) => ({ key: m, label: monthLabel(m), pass: reds.filter((r) => r.createdAt.startsWith(m) && r.track === "pass").length, in_process: reds.filter((r) => r.createdAt.startsWith(m) && r.track === "in_process").length, fail: reds.filter((r) => r.createdAt.startsWith(m) && r.track === "fail").length }));
  return (
    <>
      <FinKpiGrid
        cols={4}
        items={[
          { id: "t", label: "Total redemption requests", value: reds.length, desc: "All methods and statuses in your scope", accent: "lead", icon: ClipboardList, onSelect: () => go("") },
          { id: "p", label: "Pending redemptions", value: reds.filter((r) => r.track === "in_process").length, desc: "Tracked as In process (SOW 5.7)", accent: "pending", icon: Hourglass, onSelect: () => go("?track=in_process") },
          { id: "ok", label: "Successful redemptions", value: reds.filter((r) => r.track === "pass").length, desc: "Pass: paid or delivered", accent: "available", icon: CheckCircle2, onSelect: () => go("?track=pass") },
          { id: "f", label: "Failed redemptions", value: reds.filter((r) => r.track === "fail").length, desc: "Fail: failed, blocked, reversed or cancelled", accent: "failed", icon: XCircle, onSelect: () => go("?track=fail") },
          { id: "ip", label: "In-process redemptions", value: stage("processing", "payout_initiated"), desc: "Processing or payout initiated", accent: "pending", icon: Clock3, onSelect: () => go("?stage=processing") },
          { id: "pts", label: "Total points redeemed", value: live.reduce((n, r) => n + r.points, 0), desc: "Excluding blocked, reversed and cancelled", accent: "paid", icon: Coins, onSelect: () => go("") },
          { id: "val", label: "Total redemption value", value: live.reduce((n, r) => n + r.grossInr, 0), format: "inr", desc: "Gross ₹ supplied by the wallet service (mock conversion, FD-07)", accent: "paid", icon: IndianRupee, onSelect: () => go("") },
          { id: "tds", label: "Total TDS deducted", value: reds.filter((r) => r.tds.status === "recorded").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0), format: "inr", desc: "Recorded redemption-time TDS (Retailer / ST / CS legacy records)", accent: "kitty", icon: IndianRupee, onSelect: () => nav("/wallet/tds?tab=redemption") },
          { id: "pay", label: "Pending payouts", value: v.ws.payouts.filter((p) => p.status === "in_process" || p.status === "initiated").length, desc: "DBT / UPI payouts without a final callback", accent: "pending", icon: Banknote, onSelect: () => nav(`${RBASE}/payouts`) },
          { id: "mv", label: "Pending manual validation", value: stage("manual_validation"), desc: "Above the single or monthly DBT/UPI threshold: call-centre validation", accent: "pending", icon: PhoneCall, onSelect: () => go("?stage=manual_validation") },
          { id: "mail", label: "Pending mail approval", value: stage("mail_approval"), desc: "Awaiting mail approval", accent: "pending", icon: Mail, onSelect: () => go("?stage=mail_approval") },
          { id: "can", label: "Pending redemption cancellation", value: stage("cancellation_pending"), desc: "Evolve Operations cancellation awaiting Finance approval", accent: "pending", icon: Ban, onSelect: () => nav(`${RBASE}/cancellation`) },
        ]}
      />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Redemption outcomes by month" subtitle="Pass, In process and Fail (SOW 5.7)">
          <TrendChart data={data} kind="stacked" series={[{ key: "pass", label: "Pass", color: CHART.positive }, { key: "in_process", label: "In process", color: CHART.warning }, { key: "fail", label: "Fail", color: CHART.negative }]} ariaLabel="Redemption outcomes by month" />
        </Panel>
        <Panel title="By method" subtitle="Requests">
          <RankedBars items={Object.entries(REDEMPTION_METHOD).map(([k, m]) => ({ key: k, label: m.label, value: reds.filter((r) => r.method === k).length }))} />
        </Panel>
      </div>
      <Panel title="Programme-wise breakdown">
        <table className="table table--compact">
          <thead><tr><th>Programme</th><th className="num">Requests</th><th className="num">Pass</th><th className="num">In process</th><th className="num">Fail</th><th className="num">Points</th><th className="num">Value</th><th>TDS model</th></tr></thead>
          <tbody>{PROGRAMMES.map((p) => { const x = reds.filter((r) => r.programme === p); return <tr key={p}><th scope="row">{p}</th><td className="num">{x.length}</td><td className="num">{x.filter((r) => r.track === "pass").length}</td><td className="num">{x.filter((r) => r.track === "in_process").length}</td><td className="num">{x.filter((r) => r.track === "fail").length}</td><td className="num">{pts(x.reduce((n, r) => n + r.points, 0))}</td><td className="num">{inr(x.reduce((n, r) => n + r.grossInr, 0))}</td><td className="small">{TDS_MODEL[p].model === "not_configured" ? <BcrTag>Not configured</BcrTag> : TDS_MODEL[p].label}</td></tr>; })}</tbody>
        </table>
      </Panel>
    </>
  );
}

/* ======================= Directory ======================= */

function redemptionColumns(v: WalletView): Column<RedemptionRequest>[] {
  const payout = (id: string) => v.ws.payouts.find((p) => p.redemptionId === id);
  return [
    { key: "id", header: "Redemption ID", value: (r) => r.id, render: (r) => redemptionLink(r.id) },
    { key: "m", header: "Member ID", value: (r) => r.memberId, render: (r) => memberLink(r.memberId) },
    { key: "name", header: "Member name", value: (r) => memberName(v.mem, r.memberId) },
    { key: "p", header: "Programme", value: (r) => r.programme },
    { key: "method", header: "Method", value: (r) => REDEMPTION_METHOD[r.method].label },
    { key: "gross", header: "Gross redemption", value: (r) => r.grossInr, render: (r) => inr(r.grossInr), align: "right" },
    { key: "pts", header: "Points deducted", value: (r) => (r.debitLedgerId ? r.points : 0), render: (r) => (r.debitLedgerId ? pts(r.points) : <span className="muted small">None</span>), align: "right" },
    { key: "tds", header: "TDS deducted", value: (r) => r.tds.amountInr ?? "", render: (r) => (r.tds.status === "recorded" ? inr(r.tds.amountInr) : r.tds.status === "bcr" ? <BcrTag>BCR</BcrTag> : <span className="small muted">At scan (Kitty)</span>), align: "right" },
    { key: "net", header: "Net payout", value: (r) => r.netInr ?? "", render: (r) => inr(r.netInr), align: "right" },
    { key: "at", header: "Request date", value: (r) => r.createdAt, render: (r) => <span className="num small">{dt(r.createdAt)}</span> },
    { key: "track", header: "Status", value: (r) => r.track, render: (r) => <><TrackBadge track={r.track} /> <span className="small muted">{STAGE[r.stage].label}</span></> },
    { key: "utr", header: "UTR", value: (r) => r.utr ?? "", render: (r) => <span className="mono small">{r.utr ?? "—"}</span> },
    { key: "pay", header: "Payout status", value: (r) => payout(r.id)?.status ?? "" },
    { key: "apr", header: "Approval status", value: (r) => v.ws.cancellations.find((c) => c.redemptionId === r.id)?.status ?? "" },
  ];
}

export function RedemptionRequestsPage() {
  const v = useWalletView("redemption");
  const nav = useNavigate();
  const [track, setTrack] = useParam("track", "all");
  const [stage, setStage] = useParam("stage", "all");
  const [prog, setProg] = useState("all");
  const [method, setMethod] = useState("all");
  const [state, setState] = useState("all");
  const [tds, setTds] = useState("all");
  const [period, setPeriod] = useState("all");
  const reds = useReds(v).filter((r) => (track === "all" || r.track === track) && (stage === "all" || r.stage === stage) && (prog === "all" || r.programme === prog) && (method === "all" || r.method === method) && (state === "all" || stateOf(r.branchCode) === state) && (tds === "all" || r.tds.status === tds) && (period === "all" || fy(r.createdAt) === period)).reverse();
  return (
    <>
      <div className="filters-bar">
        <SelectField label="Status" value={track} onChange={setTrack} options={[{ value: "all", label: "All" }, { value: "pass", label: "Pass" }, { value: "in_process", label: "In process" }, { value: "fail", label: "Fail" }]} />
        <SelectField label="Stage" value={stage} onChange={setStage} options={[{ value: "all", label: "All stages" }, ...Object.entries(STAGE).map(([k, s]) => ({ value: k, label: s.label }))]} />
        <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Method" value={method} onChange={setMethod} options={[{ value: "all", label: "All" }, ...Object.entries(REDEMPTION_METHOD).map(([k, m]) => ({ value: k, label: m.label }))]} />
        <SelectField label="State" value={state} onChange={setState} options={[{ value: "all", label: "All" }, ...Array.from(new Set(v.mem.members.map((m) => stateOf(m.branchCode)))).map((s) => ({ value: s, label: s }))]} />
        <SelectField label="TDS status" value={tds} onChange={setTds} options={[{ value: "all", label: "All" }, { value: "recorded", label: "Recorded" }, { value: "bcr", label: "Business confirmation required" }, { value: "not_applicable", label: "Not applicable (Kitty model)" }]} />
        <SelectField label="Financial year" value={period} onChange={setPeriod} options={[{ value: "all", label: "All" }, { value: "FY 2025-26", label: "FY 2025-26" }, { value: "FY 2026-27", label: "FY 2026-27" }]} />
      </div>
      <Panel title="Redemption directory" subtitle={`${reds.length} requests · search by redemption ID, member, UTR`}>
        <DataTable rows={reds} columns={redemptionColumns(v)} rowKey={(r) => r.id} caption="Redemption requests" searchPlaceholder="Search redemption ID, member or UTR" onRowClick={(r) => nav(`${RBASE}/request/${r.id}`)} exportName={v.can("redemption:export") ? "redemptions" : undefined} />
      </Panel>
    </>
  );
}

/* ======================= Detail ======================= */

export function RedemptionDetailPage() {
  const { redemptionId = "" } = useParams();
  const v = useWalletView("redemption");
  const { result, run } = useRun();
  const [cancelOpen, setCancelOpen] = useState(false);
  const r = v.ws.redemptions.find((x) => x.id === redemptionId);
  if (!r) return <EmptyState title="Redemption not found">{redemptionId}</EmptyState>;
  if (!v.canOn("redemption", "view", r.memberId)) return <Notice tone="warn">This redemption is outside your Redemption: View scope.</Notice>;
  const payout = v.ws.payouts.find((p) => p.redemptionId === r.id);
  const now = redemptionBlockers(v.ws, v.ss, v.mem, r.memberId, r.method, r.points, v.today);
  const lim = limitCheck(v.ws, r.programme, r.memberId, r.method, r.grossInr, r.createdAt, r.id);
  const may = canCancelRedemption(v.uid, r.memberId);
  const elig = cancellationEligibility(v.ws, r);
  const rev = autoReversalStatus(v.ws, r, v.now);
  const cancellations = v.ws.cancellations.filter((c) => c.redemptionId === r.id);
  const row = (k: string, val: ReactNode) => <div className="kv__row" key={k}><dt>{k}</dt><dd>{val}</dd></div>;
  return (
    <>
      <p className="muted small"><Link to={`${RBASE}/requests`}>Redemption requests</Link> / {r.id}</p>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title={`${REDEMPTION_METHOD[r.method].label} · ${r.id}`} subtitle={r.origin === "legacy_record" ? "Development record" : "Created in this environment (mock)"} actions={<><TrackBadge track={r.track} /> <StageBadge stage={r.stage} /></>}>
          <dl className="kv kv--wide">
            {row("Member", <>{memberLink(r.memberId)} · {memberName(v.mem, r.memberId)} · <Link to={`/members/member/${r.memberId}`}>Member 360</Link></>)}
            {row("Programme", r.programme)}
            {row("Points requested", pts(r.points))}
            {row("Points deducted", r.debitLedgerId ? <>{pts(r.points)} · {ledgerLink(r.debitLedgerId)}</> : "None")}
            {row("Gross value", inr(r.grossInr))}
            {row("TDS", r.tds.status === "recorded" ? `${inr(r.tds.amountInr)} (recorded by the source system)` : r.tds.status === "bcr" ? <><BcrTag /> <DecisionRef id="FD-01" label="OP-TDS1" /></> : "Not applicable: EP/IMP TDS deducted at scan into the Kitty")}
            {row("PAN status / source", `${r.tds.panStatus.replace("_", " ")} · ${r.tds.panSource}`)}
            {row("Net payout", inr(r.netInr))}
            {row("Minimum balance rule", lim.notEnforced.length ? <span className="small">{lim.notEnforced.join("; ")}</span> : "Per active policy")}
            {row("Limit check", lim.manualValidation ? <span className="warn-text">{lim.reasons.join("; ")} → manual validation</span> : `Within single / monthly DBT-UPI thresholds (month total ${inr(lim.monthTotalInr)})`)}
            {row("Manual validation", r.manualValidation.required ? `${r.manualValidation.reason} · call-centre ref ${r.manualValidation.callCentreRef ?? "not yet assigned"} · ${r.manualValidation.outcome}` : "Not required")}
            {row("Bank / UPI verification", r.method === "dbt" || r.method === "upi" ? (now.some((b) => b.code === "bank" || b.code === "upi") ? <span className="neg">Not verified</span> : "Verified") : "Not applicable")}
            {row("GST status", r.programme === "Retailer" ? (now.some((b) => b.code === "gst") ? <span className="warn-text">Gated</span> : "Passed") : "Not applicable")}
            {row("Fraud validation", r.fraudCheck)}
            {row("Payout status", payout ? `${payout.status} · ${payout.provider}` : "—")}
            {row("UTR", <span className="mono">{r.utr ?? "—"}</span>)}
            {row("External payment reference", <span className="mono">{r.externalRef ?? "—"}</span>)}
            {r.voucher && row("Voucher", `${r.voucher.provider} · ${r.voucher.codeMasked} · ${r.voucher.delivery} · recovery ${r.voucher.recovery}`)}
            {r.product && row("Product", `${r.product.item} (${r.product.catalogueRef}) · ${r.product.fulfilment} · delivery ${r.product.delivery}`)}
            {row("Reversal", r.reversalLedgerId ? ledgerLink(r.reversalLedgerId) : "—")}
            {row("Created", dt(r.createdAt))}
            {row("Last updated", dt(r.updatedAt))}
          </dl>
        </Panel>
        <div className="stack">
          <Panel title="Why it is blocked" subtitle="Reasons recorded at request time">
            {r.blockedReasons.length ? <ul className="plain-list small neg">{r.blockedReasons.map((b) => <li key={b}><AlertTriangle size={12} aria-hidden="true" /> {b}</li>)}</ul> : <p className="small muted">Not blocked</p>}
            <p className="small muted">If requested now: {now.length ? now.map((b) => `${b.reason} (${b.detail})`).join("; ") : "no blocking reason"}</p>
          </Panel>
          <Panel title="Cancellation" subtitle="SOW 10.5: Evolve Operations only, after checking the payout">
            <ul className="check-list small">{elig.checks.map((c) => <li key={c.label} className={c.ok ? "pos" : "neg"}>{c.ok ? "✓" : "✗"} {c.label}: {c.detail}</li>)}</ul>
            {cancellations.map((c) => <p key={c.id} className="small">{c.id} · <OpBadge status={c.status} /> {approvalLink(c.approvalRequestId)}</p>)}
            {may.ok ? (elig.ok && <button type="button" className="btn btn--danger btn--sm" onClick={() => setCancelOpen(true)}><Ban size={14} aria-hidden="true" />Request cancellation</button>) : <p className="small muted">{may.reason}</p>}
          </Panel>
          {(r.stage === "failed" || r.stage === "reversal_pending") && (
            <Panel title="Failed redemption reversal">
              <p className="small">{rev.detail}</p>
              {v.canOn("redemption", "execute", r.memberId) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(runAutoReversal(v.uid, r.id), "Points returned to Available")}><RotateCcw size={14} aria-hidden="true" />Run auto-reversal</button>}
            </Panel>
          )}
        </div>
      </div>
      {cancelOpen && <CancelDrawer v={v} r={r} onClose={() => setCancelOpen(false)} />}
    </>
  );
}

function CancelDrawer({ v, r, onClose }: { v: WalletView; r: RedemptionRequest; onClose: () => void }) {
  const { result, run } = useRun();
  const [code, setCode] = useState("");
  const [remarks, setRemarks] = useState("");
  return (
    <Drawer open onClose={onClose} title={`Cancel ${r.id}`} subtitle="Cancellation is approved by Finance (WF-007). Points return only after the ledger reversal succeeds" footer={<button type="button" className="btn btn--danger" onClick={() => { const x = run(requestCancellation(v.uid, r.id, code, remarks), "Cancellation submitted for approval"); if (x.ok) onClose(); }}><Send size={14} aria-hidden="true" />Submit cancellation</button>}>
      <PolicyMessages result={result} />
      <SelectInput label="Cancellation reason" value={code} onChange={setCode} options={[{ value: "", label: "Choose" }, ...CANCEL_REASONS.map((c) => ({ value: c.code, label: c.label }))]} required />
      <TextArea label="Mandatory remarks" value={remarks} onChange={setRemarks} required />
      <p className="small muted">Acting user: {userName(v.acc, v.uid)}. The original redemption and the cancellation are both kept.</p>
    </Drawer>
  );
}

/* ======================= Payouts ======================= */

export function PayoutsPage() {
  const v = useWalletView("redemption");
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "queue");
  const pays = [...v.ws.payouts].reverse().filter((p) => { const r = v.ws.redemptions.find((x) => x.id === p.redemptionId); return !!r && v.canOn("redemption", "view", r.memberId); });
  const red = (id: string) => v.ws.redemptions.find((x) => x.id === id)!;
  const days = Array.from(new Set(pays.map((p) => p.initiatedAt.slice(0, 10)))).sort().reverse().slice(0, 30);
  const failed = v.ws.redemptions.filter((r) => (r.stage === "failed" || r.stage === "reversal_pending" || (r.track === "fail" && r.reversalLedgerId && r.stage === "reversed")) && v.canOn("redemption", "view", r.memberId));
  const dev = v.can("redemption:view");
  return (
    <>
      <SectionTitle title="Payout monitoring" description="DBT / UPI payouts, callbacks and UTRs from the mock payout adapter. SOW expectations (under one minute, daily reconciliation) are not claimed as live performance" />
      <PolicyMessages result={result} />
      <Tabs label="Payout sections" value={tab} onChange={setTab} tabs={[{ id: "queue", label: "Payout queue", count: pays.length }, { id: "daily", label: "Daily reconciliation" }, { id: "reversal", label: "Failed redemption reversal", count: failed.length }]} />
      {tab === "queue" && (
        <Panel title="Payout queue">
          <DataTable
            rows={pays}
            rowKey={(p) => p.id}
            caption="Payouts"
            columns={[
              { key: "r", header: "Redemption", value: (p) => p.redemptionId, render: (p) => redemptionLink(p.redemptionId) },
              { key: "prov", header: "Provider", value: (p) => p.provider },
              { key: "m", header: "Member", value: (p) => red(p.redemptionId).memberId, render: (p) => memberLink(red(p.redemptionId).memberId) },
              { key: "amt", header: "Amount", value: (p) => p.amountInr, render: (p) => inr(p.amountInr), align: "right" },
              { key: "at", header: "Initiated", value: (p) => p.initiatedAt, render: (p) => <span className="num small">{dt(p.initiatedAt)}</span> },
              { key: "s", header: "Payout status", value: (p) => p.status, render: (p) => <StatusBadge tone={p.status === "success" ? "positive" : p.status === "failed" ? "negative" : "warning"}>{p.status.replace("_", " ")}</StatusBadge> },
              { key: "utr", header: "UTR", value: (p) => p.utr ?? "", render: (p) => <span className="mono small">{p.utr ?? "—"}</span> },
              { key: "rec", header: "Reconciliation", value: (p) => p.reconciliation, render: (p) => <span className={`small ${p.reconciliation === "matched" ? "pos" : p.reconciliation === "pending" ? "muted" : "neg"}`}>{p.reconciliation.replace(/_/g, " ")}</span> },
              { key: "fail", header: "Failure reason", value: (p) => p.failureReason ?? "" },
              { key: "cb", header: "Callbacks", value: (p) => p.callbacks.length, render: (p) => <span className="small">{p.callbacks.length}{p.callbacks.some((c) => c.duplicate) ? " (duplicate ignored)" : ""}</span> },
              { key: "sim", header: "Simulate (dev)", value: () => "", render: (p) => dev ? <span className="btn-row"><button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(simulatePayoutCallback(v.uid, p.id, "success"), "Callback processed"); }}>Success</button><button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(simulatePayoutCallback(v.uid, p.id, "failed"), "Callback processed"); }}>Failed</button></span> : null },
            ]}
          />
          <p className="small muted">Simulation buttons send a mock callback. A callback after the payout is final, or with a repeated ID, is ignored and audited: no points move twice.</p>
        </Panel>
      )}
      {tab === "daily" && (
        <Panel title="Daily DBT / UPI reconciliation" subtitle="Mock data. The real view needs the payment service or bank reconciliation feed">
          <table className="table table--compact">
            <thead><tr><th>Date</th><th className="num">Payout requests</th><th className="num">Successful</th><th className="num">Failed</th><th className="num">In process</th><th className="num">Missing UTR</th><th className="num">Unmatched external ref.</th><th className="num">Amount differences</th></tr></thead>
            <tbody>{days.map((d) => { const x = pays.filter((p) => p.initiatedAt.startsWith(d)); return <tr key={d}><td className="num">{d}</td><td className="num">{x.length}</td><td className="num">{x.filter((p) => p.status === "success").length}</td><td className="num">{x.filter((p) => p.status === "failed").length}</td><td className="num">{x.filter((p) => p.status === "in_process" || p.status === "initiated").length}</td><td className={`num ${x.some((p) => p.reconciliation === "missing_utr") ? "neg" : ""}`}>{x.filter((p) => p.reconciliation === "missing_utr").length}</td><td className={`num ${x.some((p) => p.reconciliation === "unmatched_external") ? "neg" : ""}`}>{x.filter((p) => p.reconciliation === "unmatched_external").length}</td><td className="num">{x.filter((p) => p.amountInr !== (red(p.redemptionId).netInr ?? red(p.redemptionId).grossInr)).length}</td></tr>; })}</tbody>
          </table>
        </Panel>
      )}
      {tab === "reversal" && (
        <Panel title="Failed redemption auto-reversal" subtitle="Each reversal links to the original redemption debit and runs through the wallet service">
          <Notice tone="warn">The reversal window is not configured (<DecisionRef id="FD-05" />). Until it is, failed redemptions wait in Reversal pending; no window is assumed.</Notice>
          <DataTable
            rows={failed}
            rowKey={(r) => r.id}
            caption="Failed redemptions"
            columns={[
              { key: "id", header: "Failed redemption", value: (r) => r.id, render: (r) => redemptionLink(r.id) },
              { key: "pts", header: "Points deducted", value: (r) => r.points, align: "right" },
              { key: "debit", header: "Original debit", value: (r) => r.debitLedgerId ?? "", render: (r) => ledgerLink(r.debitLedgerId) },
              { key: "at", header: "Failure time", value: (r) => r.updatedAt, render: (r) => <span className="num small">{dt(r.updatedAt)}</span> },
              { key: "el", header: "Reversal eligibility", value: (r) => autoReversalStatus(v.ws, r, v.now).detail },
              { key: "win", header: "Window", value: () => v.ws.config.autoReversal.windowHours ?? "", render: () => (v.ws.config.autoReversal.windowHours == null ? <BcrTag>Not set</BcrTag> : `${v.ws.config.autoReversal.windowHours} h`) },
              { key: "s", header: "Reversal status", value: (r) => r.stage, render: (r) => <StageBadge stage={r.stage} /> },
              { key: "led", header: "Reversal ledger reference", value: (r) => r.reversalLedgerId ?? "", render: (r) => ledgerLink(r.reversalLedgerId) },
              { key: "act", header: "", value: () => "", render: (r) => (!r.reversalLedgerId && v.canOn("redemption", "execute", r.memberId) ? <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(runAutoReversal(v.uid, r.id), "Reversal posted")}><Undo2 size={12} aria-hidden="true" />Run</button> : null) },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

/* ======================= Vouchers ======================= */

export function VouchersPage() {
  const v = useWalletView("redemption");
  const { result, run } = useRun();
  const [open, setOpen] = useState<RedemptionRequest | null>(null);
  const [reason, setReason] = useState("");
  const list = useReds(v).filter((r) => r.voucher).reverse();
  return (
    <>
      <SectionTitle title="Voucher redemption" description="Amazon, Flipkart, BigBasket, BookMyShow, MMT. Codes are masked everywhere; recovery re-sends the existing code through the voucher service and never issues a duplicate voucher" />
      <PolicyMessages result={result} />
      <Panel title="Vouchers">
        <DataTable
          rows={list}
          rowKey={(r) => r.id}
          caption="Vouchers"
          columns={[
            { key: "prov", header: "Provider", value: (r) => r.voucher!.provider },
            { key: "m", header: "Member", value: (r) => r.memberId, render: (r) => memberLink(r.memberId) },
            { key: "id", header: "Redemption reference", value: (r) => r.id, render: (r) => redemptionLink(r.id) },
            { key: "code", header: "Voucher code", value: (r) => r.voucher!.codeMasked, render: (r) => <span className="mono small">{r.voucher!.codeMasked}</span> },
            { key: "iss", header: "Issued", value: (r) => r.voucher!.issuedAt, render: (r) => <span className="num small">{dt(r.voucher!.issuedAt)}</span> },
            { key: "exp", header: "Expiry", value: (r) => r.voucher!.expiresOn },
            { key: "del", header: "Delivery", value: (r) => r.voucher!.delivery },
            { key: "rec", header: "Recovery", value: (r) => r.voucher!.recovery },
            { key: "act", header: "", value: () => "", render: (r) => (v.canOn("redemption", "recover", r.memberId) && r.voucher!.recovery === "none" ? <button type="button" className="btn btn--secondary btn--xs" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>Recover</button> : null) },
          ]}
        />
      </Panel>
      <Panel title="Recovery log">
        <DataTable rows={[...v.ws.recoveries].reverse()} rowKey={(x) => x.id} caption="Voucher recoveries" columns={[{ key: "id", header: "Recovery", value: (x) => x.id }, { key: "r", header: "Original voucher", value: (x) => x.redemptionId, render: (x) => redemptionLink(x.redemptionId) }, { key: "m", header: "Member", value: (x) => x.memberId }, { key: "reason", header: "Reason", value: (x) => x.reason }, { key: "by", header: "Requested by", value: (x) => userName(v.acc, x.requestedBy) }, { key: "at", header: "At", value: (x) => x.requestedAt, render: (x) => <span className="num small">{dt(x.requestedAt)}</span> }, { key: "o", header: "Outcome", value: (x) => x.outcome }, { key: "msg", header: "Message", value: (x) => x.message }]} />
      </Panel>
      {open && (
        <Drawer open onClose={() => setOpen(null)} title={`Recover voucher ${open.id}`} footer={<button type="button" className="btn btn--primary" onClick={() => { const x = run(recoverVoucher(v.uid, open.id, reason), "Voucher re-sent (mock)"); if (x.ok) setOpen(null); }}>Request recovery</button>}>
          <p className="small">{open.voucher!.provider} · {open.voucher!.codeMasked} · status {open.voucher!.delivery}</p>
          <TextArea label="Reason" value={reason} onChange={setReason} required />
        </Drawer>
      )}
    </>
  );
}

/* ======================= Products and V-Guard.com ======================= */

export function ProductsPage() {
  const v = useWalletView("redemption");
  const list = useReds(v).filter((r) => r.product).reverse();
  return (
    <>
      <SectionTitle title="Product & V-Guard.com redemption" description="Monitoring only. The catalogue and fulfilment belong to the Gift & Fulfilment module; no catalogue master is duplicated here. SOW's 2–3 day product fulfilment is indicative, not a live SLA" />
      <Panel title="Product redemptions">
        <DataTable
          rows={list}
          rowKey={(r) => r.id}
          caption="Product redemptions"
          columns={[
            { key: "type", header: "Channel", value: (r) => REDEMPTION_METHOD[r.method].label },
            { key: "item", header: "Product", value: (r) => r.product!.item },
            { key: "m", header: "Member", value: (r) => r.memberId, render: (r) => memberLink(r.memberId) },
            { key: "pts", header: "Points used", value: (r) => r.points, align: "right" },
            { key: "at", header: "Redemption date", value: (r) => r.createdAt, render: (r) => <span className="num small">{dt(r.createdAt)}</span> },
            { key: "ful", header: "Fulfilment", value: (r) => r.product!.fulfilment },
            { key: "del", header: "Delivery", value: (r) => r.product!.delivery },
            { key: "cat", header: "Catalogue reference", value: (r) => r.product!.catalogueRef, render: (r) => <span className="mono small">{r.product!.catalogueRef}</span> },
            { key: "tx", header: "Transaction", value: (r) => r.debitLedgerId ?? "", render: (r) => ledgerLink(r.debitLedgerId) },
            { key: "id", header: "Redemption", value: (r) => r.id, render: (r) => redemptionLink(r.id) },
          ]}
        />
      </Panel>
    </>
  );
}

/* ======================= Backend gift redemption (AF03) ======================= */

export function GiftsPage() {
  const v = useWalletView("gift-redemption");
  const [tab, setTab] = useParam("tab", "list");
  const { result, run } = useRun();
  const [f, setF] = useState({ memberId: "", catalogueRef: "", quantity: "1", foc: false, reason: "", remarks: "" });
  const [evidence, setEvidence] = useState<string[]>([]);
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<{ row: number; result: string; message: string }[]>([]);
  const m = memberById(v.mem, f.memberId.trim());
  const tds = m ? redemptionTds(m.programme) : null;
  return (
    <>
      <SectionTitle title="Backend gift redemption" description="Gifts redeemed on behalf of a member, with points or free of cost (SOW 10.5 AF03). Approved through WF-025; executed by the gift redemption adapter (mock)" />
      <PolicyMessages result={result} />
      <Tabs label="Gift sections" value={tab} onChange={setTab} tabs={[{ id: "list", label: "Gift requests", count: v.ws.gifts.length }, { id: "new", label: "Single gift" }, { id: "bulk", label: "Bulk CSV", count: v.ws.giftBatches.length }]} />
      {tab === "list" && (
        <Panel title="Gift requests" subtitle="FOC gifts are recorded separately and never deduct points">
          <DataTable rows={[...v.ws.gifts].reverse()} rowKey={(g) => g.id} caption="Gift redemptions" columns={[{ key: "id", header: "Reference", value: (g) => g.id, render: (g) => <span className="mono small">{g.id}</span> }, { key: "m", header: "Member", value: (g) => g.memberId, render: (g) => memberLink(g.memberId) }, { key: "p", header: "Programme", value: (g) => g.programme }, { key: "item", header: "Gift", value: (g) => `${g.item} × ${g.quantity}` }, { key: "foc", header: "Type", value: (g) => (g.foc ? "FOC" : "Paid with points") }, { key: "pts", header: "Points", value: (g) => (g.foc ? 0 : g.quantity * g.pointsPerUnit), align: "right" }, { key: "batch", header: "Batch", value: (g) => g.batchId ?? "" }, { key: "apr", header: "Approval", value: (g) => g.approvalRequestId ?? "", render: (g) => approvalLink(g.approvalRequestId) }, { key: "s", header: "Status", value: (g) => g.status, render: (g) => <OpBadge status={g.status} /> }, { key: "f", header: "Result", value: (g) => g.failure ?? (g.ledgerIds[0] ?? "") }]} />
        </Panel>
      )}
      {tab === "new" && (
        <Panel title="Admin gift redemption">
          <div className="form-grid form-grid--3">
            <TextField label="Member ID" value={f.memberId} onChange={(x) => setF({ ...f, memberId: x })} required />
            <SelectInput label="Gift / catalogue item" value={f.catalogueRef} onChange={(x) => setF({ ...f, catalogueRef: x })} options={[{ value: "", label: "Choose" }, ...GIFT_CATALOGUE.map((g) => ({ value: g.ref, label: `${g.item} · ${g.points} pts${g.available ? "" : " (unavailable)"}` }))]} required />
            <TextField label="Quantity" value={f.quantity} onChange={(x) => setF({ ...f, quantity: x })} inputMode="numeric" />
          </div>
          {m && <p className="small">{m.name} · {m.programme}{tds?.status === "bcr" && <span className="warn-text"> · {tds.message}</span>}</p>}
          <Checkbox label="Free of cost (FOC)" checked={f.foc} onChange={(x) => setF({ ...f, foc: x })} description="No points deducted; needs a business justification document" />
          <div className="form-grid form-grid--2">
            <SelectInput label="Redemption reason" value={f.reason} onChange={(x) => setF({ ...f, reason: x })} options={[{ value: "", label: "Choose" }, ...GIFT_REASONS.map((r) => ({ value: r.code, label: r.label }))]} required />
            <TextField label="Remarks" value={f.remarks} onChange={(x) => setF({ ...f, remarks: x })} required />
          </div>
          <div className="field"><label className="field__label">Evidence {f.foc && <span className="field__req">*</span>}</label><input type="file" multiple onChange={(e) => setEvidence(Array.from(e.target.files ?? []).map((x) => x.name))} /><p className="field__hint">{evidence.join(", ") || "File names only in this build"}</p></div>
          <button type="button" className="btn btn--primary" onClick={() => { const r = run(submitGift(v.uid, { ...f, quantity: Number(f.quantity), evidence }), "Gift redemption submitted for approval"); if (r.ok) setTab("list"); }}><Send size={14} aria-hidden="true" />Submit for approval</button>
        </Panel>
      )}
      {tab === "bulk" && (
        <Panel title="Bulk gift redemption" subtitle={`Header: ${GIFT_CSV_HEADER.join(",")}. Each valid row becomes its own request; duplicate rows are not processed`}>
          <TextArea label="CSV content" value={csv} onChange={setCsv} rows={6} placeholder={GIFT_CSV_HEADER.join(",")} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(submitGiftBatch(v.uid, "gift-batch.csv", csv), "Batch processed: see row results"); setRows(r.rows ?? []); }}>Validate and submit rows</button>
          {rows.length > 0 && <table className="table table--compact"><thead><tr><th>Row</th><th>Result</th><th>Message</th></tr></thead><tbody>{rows.map((r) => <tr key={r.row}><td className="num">{r.row}</td><td>{r.result}</td><td className="small">{r.message}</td></tr>)}</tbody></table>}
          <h4 className="cfg-sub">Batch history</h4>
          <DataTable rows={[...v.ws.giftBatches].reverse()} rowKey={(b) => b.id} caption="Gift batches" columns={[{ key: "id", header: "Batch", value: (b) => b.id }, { key: "f", header: "File", value: (b) => b.fileName }, { key: "rows", header: "Rows", value: (b) => b.rows.length, align: "right" }, { key: "ok", header: "Submitted", value: (b) => b.giftIds.length, align: "right" }, { key: "by", header: "By", value: (b) => userName(v.acc, b.createdBy) }, { key: "at", header: "At", value: (b) => b.createdAt }]} />
        </Panel>
      )}
    </>
  );
}

/* ======================= Cancellation ======================= */

export function CancellationPage() {
  const v = useWalletView("redemption");
  const nav = useNavigate();
  const [id, setId] = useState("");
  const r = v.ws.redemptions.find((x) => x.id === id.trim());
  const may = r ? canCancelRedemption(v.uid, r.memberId) : canCancelRedemption(v.uid, "");
  return (
    <>
      <SectionTitle title="Redemption cancellation" description="Only Evolve Operations with Cancel redemption may initiate, because Evolve first verifies whether the money was already paid out (SOW 10.5). A cancelled redemption shows Reversed only after the ledger reversal succeeds" />
      {!may.ok && <Notice tone="info">{may.reason}. You can view cancellations but not initiate them.</Notice>}
      <Panel title="Cancellations">
        <DataTable rows={[...v.ws.cancellations].reverse()} rowKey={(c) => c.id} caption="Cancellations" onRowClick={(c) => nav(`${RBASE}/request/${c.redemptionId}`)} columns={[{ key: "id", header: "Cancellation", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> }, { key: "r", header: "Redemption", value: (c) => c.redemptionId, render: (c) => redemptionLink(c.redemptionId) }, { key: "reason", header: "Reason", value: (c) => c.reason }, { key: "by", header: "Acting user", value: (c) => userName(v.acc, c.createdBy) }, { key: "at", header: "Requested", value: (c) => c.createdAt, render: (c) => <span className="num small">{dt(c.createdAt)}</span> }, { key: "apr", header: "Approval", value: (c) => c.approvalRequestId ?? "", render: (c) => approvalLink(c.approvalRequestId) }, { key: "s", header: "Status", value: (c) => c.status, render: (c) => <OpBadge status={c.status} /> }, { key: "rev", header: "Reversal line", value: (c) => c.reversalLedgerId ?? "", render: (c) => ledgerLink(c.reversalLedgerId) }]} />
      </Panel>
      {may.ok && (
        <Panel title="Check a redemption for cancellation">
          <TextField label="Redemption ID" value={id} onChange={setId} placeholder="RED-…" />
          {r ? (
            <>
              <ul className="check-list small">{cancellationEligibility(v.ws, r).checks.map((c) => <li key={c.label} className={c.ok ? "pos" : "neg"}>{c.ok ? "✓" : "✗"} {c.label}: {c.detail}</li>)}</ul>
              <Link className="btn btn--secondary btn--sm" to={`${RBASE}/request/${r.id}`}>Open redemption to cancel</Link>
            </>
          ) : id && <p className="small neg">Redemption not found</p>}
        </Panel>
      )}
    </>
  );
}

/* ======================= Limits & controls (AF22/AF23) ======================= */

const VALUE_KEYS = [["minTotalPoints", "Minimum total points"], ["minBalance", "Minimum balance"], ["minRedemptionInr", "Minimum redemption amount"], ["singleRedemptionInr", "Single redemption limit"], ["dailyValueInr", "Daily value limit"], ["monthlyValueInr", "Monthly value limit"], ["dailyCount", "Daily count limit"], ["monthlyCount", "Monthly count limit"]] as const;
const fmtPv = (p: PolicyValue) => (p.status === "not_applicable" ? <span className="muted small">n/a</span> : p.value == null ? <BcrTag>BCR</BcrTag> : <span title={p.note}>{p.unit === "inr" ? inr(p.value) : `${pts(p.value)} ${p.unit === "points" ? "pts" : ""}`}{p.status === "sow_value" ? <span className="small muted"> SOW</span> : p.status === "business_confirmation_required" ? <> <BcrTag>unit?</BcrTag></> : null}</span>);

export function LimitsPage() {
  const v = useWalletView("redemption-limits");
  const [edit, setEdit] = useState<RedemptionLimitPolicy | null>(null);
  const op08 = v.ws.decisions.find((d) => d.id === "FD-04")?.status === "confirmed";
  return (
    <>
      <SectionTitle title="Redemption limits & controls" description="Configurable policies seeded with SOW values. OP-08 daily / monthly values stay Business confirmation required and are not enforced. Changes go through WF-023" />
      <Notice tone="warn">SOW values: minimum redemption ₹100; single DBT/UPI ₹10,000; monthly DBT/UPI ₹30,000 (beyond these: call-centre manual validation); EP/ST/CS minimum 1,000 points; Retailer ₹2,500 as written (unit pending <DecisionRef id="FD-06" />); Retailer reserve ₹2,000. Retailer values are never applied to other programmes. <DecisionRef id="FD-04" label="OP-08" /></Notice>
      <Panel title="Limit policies">
        <div className="table-wrap">
          <table className="table table--compact">
            <thead><tr><th>Policy</th><th>Programmes</th><th>Method</th>{VALUE_KEYS.map(([, l]) => <th key={l}>{l}</th>)}<th>Effective</th><th>Status</th><th /></tr></thead>
            <tbody>
              {v.ws.policies.map((p) => (
                <tr key={`${p.id}-${p.version}`}>
                  <th scope="row" className="mono small">{p.id} v{p.version}</th>
                  <td>{p.programmes.join(", ")}</td>
                  <td>{p.method === "dbt_upi" ? "DBT + UPI" : p.method}</td>
                  {VALUE_KEYS.map(([k]) => <td key={k}>{fmtPv(p[k])}</td>)}
                  <td className="small">{p.effectiveFrom}{p.effectiveTo ? ` – ${p.effectiveTo}` : ""}</td>
                  <td><StatusBadge tone={p.status === "active" ? "positive" : p.status === "pending_approval" ? "warning" : "neutral"}>{p.status.replace("_", " ")}</StatusBadge> {approvalLink(p.approvalRequestId)}</td>
                  <td>{p.status === "active" && v.can("redemption-limits:edit") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => setEdit(structuredClone(p))}>Change</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {edit && <LimitDrawer v={v} p={edit} op08={op08} onClose={() => setEdit(null)} />}
    </>
  );
}

function LimitDrawer({ v, p, op08, onClose }: { v: WalletView; p: RedemptionLimitPolicy; op08: boolean; onClose: () => void }) {
  const { result, run } = useRun();
  const [x, setX] = useState(p);
  const setVal = (k: (typeof VALUE_KEYS)[number][0], raw: string) => setX({ ...x, [k]: { ...x[k], value: raw === "" ? null : Number(raw), status: raw === "" ? "business_confirmation_required" : x[k].status === "sow_value" ? "sow_value" : "confirmed" } });
  return (
    <Drawer open onClose={onClose} width={640} title={`Change ${p.id}`} subtitle="Submitted for Finance and V-Guard approval; the current version stays active until then" footer={<button type="button" className="btn btn--primary" onClick={() => { const r = run(submitLimitPolicy(v.uid, x), "Limit change submitted for approval"); if (r.ok) onClose(); }}><Send size={14} aria-hidden="true" />Submit for approval</button>}>
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        {VALUE_KEYS.map(([k, l]) => {
          const bcr = p[k].status === "business_confirmation_required" && !op08;
          return x[k].status === "not_applicable" ? null : <TextField key={k} label={`${l} (${x[k].unit === "inr" ? "₹" : x[k].unit})`} value={x[k].value == null ? "" : String(x[k].value)} onChange={(raw) => setVal(k, raw)} disabled={bcr} hint={bcr ? "OP-08 / unit not confirmed: record the decision first" : x[k].note} inputMode="numeric" />;
        })}
        <TextField label="Effective from" type="date" value={x.effectiveFrom} onChange={(d) => setX({ ...x, effectiveFrom: d })} />
      </div>
    </Drawer>
  );
}

/* ======================= EMI via points (SOW 5.6) ======================= */

export function EmiPage() {
  const v = useWalletView("emi");
  const list = [...v.ws.emi].reverse();
  const k = (s: string) => list.filter((e) => e.status === s).length;
  return (
    <>
      <SectionTitle title="Retailer financing · EMI via points" description="Backend / SDK capability. The portal monitors point burns, external references and reconciliation only. The Retailer app EMI screen is not built" />
      <Notice tone="warn">Financing partner, payment rail, eligibility, limits, reversal rules and the reconciliation contract are open (<DecisionRef id="FD-03" label="OP-FIN1" />). EMI stays disabled; the records below are development data with no financing partner connected.</Notice>
      <FinKpiGrid items={[
        { id: "r", label: "EMI redemption requests", value: list.length, desc: "Development records", accent: "lead", icon: CreditCard, onSelect: () => undefined },
        { id: "s", label: "Successful EMI point burns", value: k("success"), desc: "Burned and posted", accent: "available", icon: CheckCircle2, onSelect: () => undefined },
        { id: "f", label: "Failed requests", value: k("failed"), desc: "No points burned", accent: "failed", icon: XCircle, onSelect: () => undefined },
        { id: "p", label: "Pending reconciliation", value: list.filter((e) => e.reconciliation !== "matched").length, desc: "Reference not matched or pending", accent: "pending", icon: Hourglass, onSelect: () => undefined },
        { id: "rv", label: "Reversed EMI transactions", value: k("reversed"), desc: "Burn reversed", accent: "neutral", icon: Undo2, onSelect: () => undefined },
        { id: "pts", label: "Total points used for EMI", value: list.filter((e) => e.status === "success").reduce((n, e) => n + e.points, 0), desc: "Net of reversals", accent: "paid", icon: Coins, onSelect: () => undefined },
      ]} />
      <Panel title="EMI transactions">
        <DataTable rows={list} rowKey={(e) => e.id} caption="EMI point burns" exportName={v.can("emi:export") ? "emi" : undefined} columns={[{ key: "id", header: "Reference", value: (e) => e.id }, { key: "m", header: "Retailer", value: (e) => e.memberId, render: (e) => memberLink(e.memberId) }, { key: "loan", header: "Loan reference", value: (e) => e.loanRef }, { key: "inst", header: "Instalment reference", value: (e) => e.instalmentRef }, { key: "pts", header: "Points redeemed", value: (e) => e.points, align: "right" }, { key: "led", header: "Ledger burn reference", value: (e) => e.ledgerId ?? "", render: (e) => ledgerLink(e.ledgerId) }, { key: "fin", header: "External financing reference", value: (e) => e.financingRef ?? "", render: (e) => e.financingRef ?? <span className="neg small">Missing</span> }, { key: "at", header: "Date", value: (e) => e.at }, { key: "s", header: "Status", value: (e) => e.status }, { key: "rec", header: "Reconciliation", value: (e) => e.reconciliation }]} />
      </Panel>
    </>
  );
}

/* ======================= History ======================= */

export function RedemptionHistoryPage() {
  const v = useWalletView("redemption");
  const nav = useNavigate();
  const list = useMemo(() => historyRows(v), [v]);
  return (
    <Panel title="Redemption history" subtitle="Completed, failed, reversed and cancelled redemptions. Original records are preserved alongside cancellations and reversals">
      <DataTable rows={list} columns={redemptionColumns(v)} rowKey={(r) => r.id} caption="Redemption history" onRowClick={(r) => nav(`${RBASE}/request/${r.id}`)} exportName={v.can("redemption:export") ? "redemption-history" : undefined} />
    </Panel>
  );
}
function historyRows(v: WalletView) {
  return v.ws.redemptions.filter((r) => v.canOn("redemption", "view", r.memberId) && ["paid", "delivered", "failed", "reversed", "cancelled", "blocked"].includes(r.stage)).slice().reverse();
}

export { AlertTriangle };
