import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertOctagon, Archive, BadgeIndianRupee, CircleCheck, Coins, Hourglass, Landmark, Lock, PiggyBank, ReceiptIndianRupee, Scale, Sparkles, Wallet, XCircle, Clock3 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { TrendChart } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Segmented, SelectField } from "@/components/ui/primitives";
import { CHART } from "@/lib/chartColors";
import { GEOGRAPHY } from "@/config/geography";
import { LEDGER_TYPE, PROGRAMMES, TDS_MODEL, fy } from "@/config/walletCatalogue";
import { balancesFrom, reconcile } from "@/features/wallet/engine";
import type { LedgerEntry, LedgerType, WalletBalances } from "@/types/wallet";
import { BcrTag, BucketTag, FinKpiGrid, PointsCell, ServiceBanner, TypeTag, WBASE, RBASE, approvalLink, dt, inr, memberLink, pts, stateOf, useWalletView, userName, type FinKpi } from "./shared";

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

export function useFinTotals(lines: LedgerEntry[], memberOk: (id: string) => boolean, v: ReturnType<typeof useWalletView>) {
  return useMemo(() => {
    const byMember = new Map<string, LedgerEntry[]>();
    for (const l of lines) if (memberOk(l.memberId)) (byMember.get(l.memberId) ?? byMember.set(l.memberId, []).get(l.memberId)!).push(l);
    const total: WalletBalances = { lifetime: 0, available: 0, redeemed: 0, scheme: 0, pending: 0, tdsKitty: 0, tdsPaid: 0, gstLocked: 0, expired: 0, tdsDeductedPoints: 0, tdsDeductedInr: 0 };
    const perMember = new Map<string, WalletBalances>();
    for (const [id, ls] of byMember) {
      const b = balancesFrom(ls, v.ws.redemptions.filter((r) => r.memberId === id));
      perMember.set(id, b);
      (Object.keys(total) as (keyof WalletBalances)[]).forEach((k) => (total[k] += b[k]));
    }
    const schemeAccrued = lines.filter((l) => memberOk(l.memberId) && l.type === "scheme_accrual").reduce((n, l) => n + l.points, 0);
    return { total, perMember, schemeAccrued };
  }, [lines, memberOk, v.ws.redemptions]);
}

export function WalletOverviewPage() {
  const v = useWalletView();
  const nav = useNavigate();
  const [prog, setProg] = useState("all");
  const [state, setState] = useState("all");
  const [branch, setBranch] = useState("all");
  const [fyF, setFy] = useState("all");
  const [type, setType] = useState("all");
  const [chart, setChart] = useState("earned");
  const memberOk = useMemo(() => {
    const progOf = new Map(v.mem.members.map((m) => [m.id, m]));
    return (id: string) => {
      const m = progOf.get(id);
      return !!m && v.inScope(id) && (prog === "all" || m.programme === prog) && (state === "all" || stateOf(m.branchCode) === state) && (branch === "all" || m.branchCode === branch);
    };
  }, [v.mem.members, v.inScope, prog, state, branch]);
  const lines = useMemo(() => v.lines.filter((l) => memberOk(l.memberId) && (fyF === "all" || fy(l.at) === fyF)), [v.lines, memberOk, fyF]);
  const { total, schemeAccrued } = useFinTotals(lines, memberOk, v);
  const reds = v.ws.redemptions.filter((r) => memberOk(r.memberId) && (fyF === "all" || fy(r.createdAt) === fyF));
  const pendingOps = [...v.ws.adjustments, ...v.ws.batches, ...v.ws.reversals, ...v.ws.transfers].filter((x) => x.status === "pending_approval").length;
  const pendingSettle = v.ss.settlements.filter((s) => ["pending_approval", "partially_approved", "execution_failed"].includes(s.status)).length;
  const recon = useMemo(() => reconcile(v.ws, v.ss, v.mem, v.approvals.requests, "All"), [v.ws, v.ss, v.mem, v.approvals.requests]);
  const exceptions = v.ws.exceptions.filter((e) => e.status === "open" || e.status === "investigating").length + recon.filter((r) => r.status === "difference" && !v.ws.exceptions.some((e) => e.ref === r.ref)).length;
  const redTds = reds.filter((r) => r.tds.status === "recorded").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0);
  const kpis: FinKpi[] = [
    { id: "lifetime", label: "Total lifetime points", value: total.lifetime, desc: "Gross points earned (scan, base, scheme accrual, bonus, manual additions) less earning reversals", accent: "lead", icon: Sparkles, onSelect: () => nav(`${WBASE}/members?sort=lifetime`) },
    { id: "available", label: "Total available points", value: total.available, desc: "Redeemable bucket. Still subject to KYC, restrictions, the GST gate and the Retailer reserve", accent: "available", icon: Wallet, onSelect: () => nav(`${WBASE}/ledger?bucket=available`) },
    { id: "redeemed", label: "Total redeemed points", value: total.redeemed, desc: "Points consumed by redemptions, net of redemption reversals", accent: "paid", icon: Archive, onSelect: () => nav(`${WBASE}/ledger?bucket=redeemed`) },
    { id: "scheme", label: "Total scheme points", value: schemeAccrued, desc: "Scheme / milestone points accrued by the Phase 6 scheme engine", accent: "scheme", icon: Coins, onSelect: () => nav(`${WBASE}/ledger?type=scheme_accrual`) },
    { id: "unsettled", label: "Unsettled scheme points", value: total.scheme, desc: "Accrued, not yet released by two-level settlement. Not redeemable", accent: "scheme", icon: Hourglass, onSelect: () => nav(`${WBASE}/settlement`) },
    { id: "tdsk", label: "TDS deducted · Kitty model", value: total.tdsDeductedPoints, desc: "EP/IMP scan-time provisional TDS moved to the Kitty (points)", accent: "kitty", icon: ReceiptIndianRupee, onSelect: () => nav(`${WBASE}/tds?tab=kitty`) },
    { id: "tdsr", label: "TDS deducted · at redemption", value: redTds, format: "inr", desc: "Retailer / ST / CS TDS recorded on redemptions (legacy records). New calculations need OP-TDS1", accent: "kitty", icon: BadgeIndianRupee, onSelect: () => nav(`${WBASE}/tds?tab=redemption`) },
    { id: "kitty", label: "TDS Kitty balance", value: total.tdsKitty, desc: "Held until FY reconciliation. Not redeemable, not TDS paid", accent: "kitty", icon: PiggyBank, onSelect: () => nav(`${WBASE}/ledger?bucket=tds_kitty`) },
    { id: "gst", label: "GST-locked points", value: total.gstLocked, desc: "Retailer Base Points locked by the GST gate (SOW 5.5)", accent: "gst", icon: Lock, onSelect: () => nav(`${WBASE}/gst`) },
    { id: "pending-red", label: "Pending redemptions", value: reds.filter((r) => r.track === "in_process").length, desc: "In process: manual validation, mail approval, processing, payout initiated, reversal or cancellation pending", accent: "pending", icon: Clock3, onSelect: () => nav(`${RBASE}/requests?track=in_process`) },
    { id: "ok-red", label: "Successful redemptions", value: reds.filter((r) => r.track === "pass").length, desc: "Paid or delivered", accent: "available", icon: CircleCheck, onSelect: () => nav(`${RBASE}/requests?track=pass`) },
    { id: "fail-red", label: "Failed redemptions", value: reds.filter((r) => r.track === "fail").length, desc: "Failed, blocked, reversed or cancelled", accent: "failed", icon: XCircle, onSelect: () => nav(`${RBASE}/requests?track=fail`) },
    { id: "pending-adj", label: "Pending point adjustments", value: pendingOps, desc: "Adjustments, batches, reversals and transfers awaiting approval", accent: "pending", icon: Hourglass, onSelect: () => nav(`${WBASE}/adjustments?status=pending_approval`) },
    { id: "pending-set", label: "Pending settlement requests", value: pendingSettle, desc: "Awaiting stage 1, stage 2 or a retry (Phase 6 settlement)", accent: "pending", icon: Landmark, onSelect: () => nav(`${WBASE}/settlement`) },
    { id: "exceptions", label: "Financial exceptions", value: exceptions, desc: "Open exceptions plus reconciliation differences not yet raised", accent: "failed", icon: AlertOctagon, onSelect: () => nav(`${WBASE}/reconciliation`) },
  ];

  const months = useMemo(() => {
    const out: string[] = [];
    const d = new Date(`${v.today.slice(0, 7)}-01T00:00:00Z`);
    for (let i = 11; i >= 0; i--) {
      const x = new Date(d);
      x.setUTCMonth(x.getUTCMonth() - i);
      out.push(x.toISOString().slice(0, 7));
    }
    return out;
  }, [v.today]);
  const series = useMemo(() => {
    const sum = (pred: (l: LedgerEntry) => boolean, f: (l: LedgerEntry) => number = (l) => l.points) => months.map((m) => lines.filter((l) => l.at.slice(0, 7) === m && l.status === "completed" && pred(l)).reduce((n, l) => n + f(l), 0));
    const earning = (l: LedgerEntry) => !!LEDGER_TYPE[l.type].earning && l.points > 0;
    const data: Record<string, number[]> = {
      earned: sum(earning, (l) => l.gross ?? l.points),
      redeemed: sum((l) => l.bucket === "redeemed" && l.points > 0),
      toAvailable: sum((l) => l.bucket === "available" && l.points > 0 && l.type !== "redemption_reversal"),
      toScheme: sum((l) => l.type === "scheme_accrual"),
      kitty: sum((l) => l.type === "tds_kitty_deduction"),
      refund: sum((l) => l.type === "tds_kitty_refund" && l.bucket === "available"),
      release: sum((l) => l.type === "settlement_release" && l.bucket === "available"),
      madd: sum((l) => l.type === "manual_add"),
      mded: sum((l) => l.type === "manual_deduct", (l) => -l.points),
      rev: sum((l) => ["sales_return_reversal", "invalid_claim_reversal", "wrong_credit_reversal"].includes(l.type), (l) => -l.points),
      pass: months.map((m) => reds.filter((r) => r.createdAt.slice(0, 7) === m && r.track === "pass").length),
      fail: months.map((m) => reds.filter((r) => r.createdAt.slice(0, 7) === m && r.track === "fail").length),
      inproc: months.map((m) => reds.filter((r) => r.createdAt.slice(0, 7) === m && r.track === "in_process").length),
    };
    for (const p of PROGRAMMES) data[`p_${p}`] = sum((l) => earning(l) && l.programme === p, (l) => l.gross ?? l.points);
    return data;
  }, [lines, months, reds]);
  const CHARTS: Record<string, { label: string; kind: "line" | "bar" | "stacked" | "area"; series: { key: string; label: string; color: string }[] }> = {
    earned: { label: "Earned vs redeemed", kind: "area", series: [{ key: "earned", label: "Points earned", color: CHART.lead }, { key: "redeemed", label: "Points redeemed", color: CHART.support }] },
    avsch: { label: "Available vs scheme", kind: "bar", series: [{ key: "toAvailable", label: "Credited to Available", color: CHART.positive }, { key: "toScheme", label: "Accrued to Scheme (unsettled)", color: CHART.support }] },
    tds: { label: "TDS movement", kind: "bar", series: [{ key: "kitty", label: "Kitty deductions", color: CHART.warning }, { key: "refund", label: "Kitty refunds", color: CHART.info }] },
    red: { label: "Redemption outcomes", kind: "stacked", series: [{ key: "pass", label: "Pass", color: CHART.positive }, { key: "inproc", label: "In process", color: CHART.warning }, { key: "fail", label: "Fail", color: CHART.negative }] },
    settle: { label: "Settlement releases", kind: "bar", series: [{ key: "release", label: "Released to Available", color: CHART.lead }] },
    manual: { label: "Manual adjustments", kind: "bar", series: [{ key: "madd", label: "Added", color: CHART.positive }, { key: "mded", label: "Deducted", color: CHART.negative }] },
    reversals: { label: "Point reversals", kind: "bar", series: [{ key: "rev", label: "Reversed", color: CHART.negative }] },
    programme: { label: "By programme", kind: "stacked", series: PROGRAMMES.map((p, i) => ({ key: `p_${p}`, label: p, color: [CHART.lead, CHART.support, CHART.teal, CHART.warning, CHART.info][i] })) },
  };
  const def = CHARTS[chart];
  const data = months.map((m, i) => ({ key: m, label: monthLabel(m), ...Object.fromEntries(def.series.map((s) => [s.key, series[s.key][i]])) }));

  const distribution = PROGRAMMES.map((p) => {
    const pl = lines.filter((l) => l.programme === p);
    const b = balancesFrom(pl, reds.filter((r) => r.programme === p));
    return { p, b, scheme: pl.filter((l) => l.type === "scheme_accrual").reduce((n, l) => n + l.points, 0), pending: reds.filter((r) => r.programme === p && r.track === "in_process").length, tdsInr: reds.filter((r) => r.programme === p && r.tds.status === "recorded").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0) };
  });
  const recent = lines.filter((l) => type === "all" || l.type === type).slice(-80).reverse();
  const cols: Column<LedgerEntry>[] = [
    { key: "at", header: "Transaction date", value: (l) => l.at, render: (l) => <span className="num small">{dt(l.at)}</span> },
    { key: "ref", header: "Reference ID", value: (l) => l.ref, render: (l) => <span className="mono small">{l.ref}</span> },
    { key: "member", header: "Member", value: (l) => l.memberId, render: (l) => memberLink(l.memberId) },
    { key: "prog", header: "Programme", value: (l) => l.programme },
    { key: "type", header: "Activity", value: (l) => LEDGER_TYPE[l.type].label, render: (l) => <TypeTag type={l.type} /> },
    { key: "pts", header: "Points", value: (l) => l.points, render: (l) => <PointsCell n={l.points} />, align: "right" },
    { key: "bucket", header: "Bucket", value: (l) => l.bucket, render: (l) => <BucketTag bucket={l.bucket} /> },
    { key: "by", header: "Initiated by", value: (l) => l.initiatedBy, render: (l) => <span className="small">{userName(v.acc, l.initiatedBy)}</span> },
    { key: "apr", header: "Approval", value: (l) => l.approvalRequestId ?? "", render: (l) => approvalLink(l.approvalRequestId) },
    { key: "status", header: "Status", value: (l) => l.status },
  ];
  const states = GEOGRAPHY.filter((g) => v.mem.members.some((m) => stateOf(m.branchCode) === g.code));
  const branches = states.find((s) => s.code === state)?.districts.flatMap((d) => d.branches) ?? [];

  return (
    <>
      <ServiceBanner v={v} />
      <div className="filters-bar">
        <SelectField label="Financial year" value={fyF} onChange={setFy} options={[{ value: "all", label: "All years" }, { value: "FY 2025-26", label: "FY 2025-26" }, { value: "FY 2026-27", label: "FY 2026-27" }]} />
        <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All programmes" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="State" value={state} onChange={(x) => { setState(x); setBranch("all"); }} options={[{ value: "all", label: "All states" }, ...states.map((s) => ({ value: s.code, label: s.name }))]} />
        <SelectField label="Branch" value={branch} onChange={setBranch} disabled={state === "all"} options={[{ value: "all", label: "All branches" }, ...branches.map((b) => ({ value: b.code, label: b.name }))]} />
        <SelectField label="Transaction type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...Object.entries(LEDGER_TYPE).map(([k, t]) => ({ value: k, label: t.label }))]} />
      </div>
      <FinKpiGrid items={kpis} cols={5} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Financial trends" subtitle="Last 12 months · ledger lines within the filters" actions={<Segmented label="Trend" value={chart} onChange={setChart} options={Object.entries(CHARTS).map(([k, c]) => ({ value: k, label: c.label }))} />}>
          <TrendChart data={data} series={def.series} kind={def.kind} ariaLabel={def.label} />
        </Panel>
        <Panel title="Bucket composition" subtitle="Kept separate: never added together into one balance">
          <ul className="bucket-list">
            {([["available", total.available], ["pending", total.pending], ["scheme_unsettled", total.scheme], ["tds_kitty", total.tdsKitty], ["tds_paid", total.tdsPaid], ["gst_locked", total.gstLocked], ["redeemed", total.redeemed], ["expired", total.expired]] as const).map(([k, n]) => (
              <li key={k}>
                <BucketTag bucket={k} />
                <span className="num">{pts(n)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Programme-wise financial distribution" subtitle="TDS Kitty applies to EP/IMP only. DD tax treatment is not established in the SOW">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Programme</th><th className="num">Lifetime</th><th className="num">Available</th><th className="num">Redeemed</th><th className="num">Scheme accrued</th><th className="num">Unsettled</th><th>TDS model</th><th className="num">TDS deducted</th><th className="num">TDS Kitty</th><th className="num">GST locked</th><th className="num">Pending redemptions</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map(({ p, b, scheme, pending, tdsInr }) => (
                <tr key={p}>
                  <th scope="row">{p}</th>
                  <td className="num">{pts(b.lifetime)}</td>
                  <td className="num">{pts(b.available)}</td>
                  <td className="num">{pts(b.redeemed)}</td>
                  <td className="num">{pts(scheme)}</td>
                  <td className="num">{pts(b.scheme)}</td>
                  <td className="small">{TDS_MODEL[p].model === "not_configured" ? <BcrTag>Not configured</BcrTag> : TDS_MODEL[p].label}</td>
                  <td className="num">{p === "EP" ? `${pts(b.tdsDeductedPoints)} pts` : p === "DD" ? "—" : inr(tdsInr)}</td>
                  <td className="num">{p === "EP" ? pts(b.tdsKitty) : <span className="muted small">Not applicable</span>}</td>
                  <td className="num">{p === "Retailer" ? pts(b.gstLocked) : <span className="muted small">Not applicable</span>}</td>
                  <td className="num">{pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Recent financial activity" subtitle="Latest ledger lines. Select a row to open the transaction">
        <DataTable rows={recent} columns={cols} rowKey={(l) => l.id} caption="Recent financial activity" onRowClick={(l) => nav(`${WBASE}/ledger/${l.id}`)} pageSize={10} />
      </Panel>
      <p className="small muted"><Scale size={12} aria-hidden="true" /> Type filter: {type === "all" ? "all transaction types" : LEDGER_TYPE[type as LedgerType].label}. Figures exclude members outside your Wallet: View scope.</p>
    </>
  );
}
