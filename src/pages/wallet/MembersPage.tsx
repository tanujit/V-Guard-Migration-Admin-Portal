import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftRight, Coins, Undo2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ProgrammeTag, SelectField, StatusBadge } from "@/components/ui/primitives";
import { TextField } from "@/components/form/Form";
import { GST_SCHEME_CLASS, LEDGER_TYPE, PROGRAMMES, TDS_MODEL, fy } from "@/config/walletCatalogue";
import { maskMobile, memberById, redemptionEligibility } from "@/features/members/engine";
import { balanceView, balancesFrom, classify, fyAssessment, gstGate, linesOf, redeemableAfterReserve, reserveFor, withRunningBalances, panVerified } from "@/features/wallet/engine";
import type { LedgerEntry, WalletBalances } from "@/types/wallet";
import { Notice } from "@/pages/approvals/shared";
import { BalanceReliability, BcrTag, BucketTag, DecisionRef, PERIOD_OPTIONS, PointsCell, ServiceBanner, TypeTag, WBASE, dt, inPeriod, inr, ledgerLink, memberLink, pts, stateOf, useWalletView, type Period } from "./shared";

export function MemberWalletsPage() {
  const v = useWalletView();
  const nav = useNavigate();
  const [prog, setProg] = useState("all");
  const [state, setState] = useState("all");
  const rows = useMemo(() => {
    const by = new Map<string, LedgerEntry[]>();
    for (const l of v.lines) (by.get(l.memberId) ?? by.set(l.memberId, []).get(l.memberId)!).push(l);
    return v.ws.wallets
      .filter((w) => v.inScope(w.memberId))
      .map((w) => {
        const m = memberById(v.mem, w.memberId)!;
        return { w, m, b: balancesFrom(by.get(w.memberId) ?? [], v.ws.redemptions.filter((r) => r.memberId === w.memberId)), elig: redemptionEligibility(v.mem, m) };
      })
      .filter((r) => (prog === "all" || r.m.programme === prog) && (state === "all" || stateOf(r.m.branchCode) === state));
  }, [v.ws, v.lines, v.mem, v.inScope, prog, state]);
  type Row = (typeof rows)[number];
  const live = v.ws.service.mode === "available";
  const bal = (r: Row, k: keyof WalletBalances) => (live ? r.b[k] : v.ws.snapshots[r.w.memberId]?.balances[k] ?? null);
  const cols: Column<Row>[] = [
    { key: "id", header: "Member ID", value: (r) => r.m.id, render: (r) => memberLink(r.m.id) },
    { key: "name", header: "Member", value: (r) => r.m.name },
    { key: "prog", header: "Programme", value: (r) => r.m.programme, render: (r) => <ProgrammeTag code={r.m.programme} size="sm" /> },
    { key: "wallet", header: "Wallet", value: (r) => r.w.status, render: (r) => <StatusBadge tone={r.w.status === "active" ? "positive" : "neutral"}>{r.w.status === "active" ? "Active" : "Not created"}</StatusBadge> },
    { key: "lifetime", header: "Lifetime", value: (r) => bal(r, "lifetime"), render: (r) => <span className="num">{pts(bal(r, "lifetime"))}</span>, align: "right" },
    { key: "available", header: "Available", value: (r) => bal(r, "available"), render: (r) => <span className="num amt-available">{pts(bal(r, "available"))}</span>, align: "right" },
    { key: "scheme", header: "Scheme (unsettled)", value: (r) => bal(r, "scheme"), render: (r) => <span className="num">{pts(bal(r, "scheme"))}</span>, align: "right" },
    { key: "kitty", header: "TDS Kitty", value: (r) => (r.m.programme === "EP" ? bal(r, "tdsKitty") : null), render: (r) => (r.m.programme === "EP" ? <span className="num">{pts(bal(r, "tdsKitty"))}</span> : <span className="muted small">n/a</span>), align: "right" },
    { key: "gst", header: "GST locked", value: (r) => (r.m.programme === "Retailer" ? bal(r, "gstLocked") : null), render: (r) => (r.m.programme === "Retailer" ? <span className="num">{pts(bal(r, "gstLocked"))}</span> : <span className="muted small">n/a</span>), align: "right" },
    { key: "redeemed", header: "Redeemed", value: (r) => bal(r, "redeemed"), render: (r) => <span className="num">{pts(bal(r, "redeemed"))}</span>, align: "right" },
    { key: "elig", header: "Redemption eligibility", value: (r) => r.elig.reason, render: (r) => <span className={`small ${r.elig.allowed ? "pos" : "warn-text"}`}>{r.elig.allowed ? "Eligible" : r.elig.reason}</span> },
  ];
  return (
    <>
      <ServiceBanner v={v} />
      {!live && <Notice tone="warn">Balances below are the last retrieved values; members never opened in this session show “—”, not zero.</Notice>}
      <Panel title="Member wallet directory" subtitle={`${rows.length} wallets in your scope · balances derived from the ledger`} actions={<div className="btn-row"><SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} /><SelectField label="State" value={state} onChange={setState} options={[{ value: "all", label: "All" }, ...Array.from(new Set(v.mem.members.map((m) => stateOf(m.branchCode)))).map((s) => ({ value: s, label: s }))]} /></div>}>
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.m.id} caption="Member wallets" searchPlaceholder="Search member ID or name" onRowClick={(r) => nav(`${WBASE}/member/${r.m.id}`)} exportName={v.can("wallet:export") ? "member-wallets" : undefined} initialSort={{ key: "available", dir: "desc" }} />
      </Panel>
    </>
  );
}

export function WalletDetailPage() {
  const { memberId = "" } = useParams();
  const v = useWalletView();
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const m = memberById(v.mem, memberId);
  const wallet = v.ws.wallets.find((w) => w.memberId === memberId);
  const mine = useMemo(() => linesOf(v.lines, memberId), [v.lines, memberId]);
  if (!m || !wallet) return <EmptyState title="Wallet not found">No member {memberId}</EmptyState>;
  if (!v.inScope(m.id)) return <Notice tone="warn">This member is outside your Wallet: View programme and geography scope.</Notice>;
  const view = balanceView(v.ws, v.ss, v.mem, m.id, v.now);
  const b = view.balances;
  const elig = redemptionEligibility(v.mem, m);
  const cls = classify(v.ws, v.ss, v.mem, m.id, v.today);
  const gate = m.programme === "Retailer" ? gstGate(v.ws, v.ss, v.mem, m.id, v.today) : null;
  const reserve = reserveFor(v.ws, m.id, m.programme);
  const tdsModel = TDS_MODEL[m.programme];
  const fyNow = fy(v.today);
  const lastFy = `FY ${Number(fyNow.slice(3, 7)) - 1}-${fyNow.slice(5, 7)}`;
  const assess = m.programme === "EP" ? fyAssessment(v.ws, v.ss, v.mem, m.id, lastFy) : null;
  const unsettledBy = new Map<string, number>();
  for (const l of mine.filter((x) => x.bucket === "scheme_unsettled")) unsettledBy.set(l.schemeId ?? "—", (unsettledBy.get(l.schemeId ?? "—") ?? 0) + l.points);
  const releases = mine.filter((l) => l.type === "settlement_release" && l.bucket === "available");
  const history = withRunningBalances(mine).filter((x) => inPeriod(x.line.at, period, v.today, from, to)).reverse();
  const periodBal = balancesFrom(mine.filter((l) => inPeriod(l.at, period, v.today, from, to)));
  const head = (label: string, value: number | null | undefined, desc: string, cls2: string, unit = "pts") => (
    <div className={`headline headline--${cls2}`}>
      <span className="headline__label">{label}</span>
      <span className="headline__value num">{value == null ? "—" : unit === "inr" ? inr(value) : pts(value)}</span>
      <span className="headline__desc small">{desc}</span>
    </div>
  );
  const red = v.ws.redemptions.filter((r) => r.memberId === m.id);
  return (
    <>
      <ServiceBanner v={v} />
      <div className="wallet-head">
        <div>
          <p className="muted small">
            <Link to={`${WBASE}/members`}>Member wallets</Link> / {m.id}
          </p>
          <h2 className="wallet-head__title">
            {m.name} <ProgrammeTag code={m.programme} />
          </h2>
          <dl className="kv kv--tight kv--wide">
            <div className="kv__row"><dt>Member ID</dt><dd className="mono">{m.id} · <Link to={`/members/member/${m.id}`}>Member 360</Link></dd></div>
            <div className="kv__row"><dt>Mobile</dt><dd className="mono">{maskMobile(m.mobile)}</dd></div>
            <div className="kv__row"><dt>Member status</dt><dd>{m.status.replace(/_/g, " ")}</dd></div>
            <div className="kv__row"><dt>Redemption eligibility</dt><dd className={elig.allowed ? "pos" : "warn-text"}>{elig.allowed ? "Eligible" : elig.reason}</dd></div>
            <div className="kv__row"><dt>Wallet created</dt><dd className="num">{dt(wallet.createdAt)}</dd></div>
            <div className="kv__row"><dt>Last wallet update</dt><dd className="num">{dt(mine[mine.length - 1]?.at)}</dd></div>
          </dl>
        </div>
        <div className="btn-row">
          {v.canOn("points-adjustment", "create", m.id) && <Link className="btn btn--secondary btn--sm" to={`${WBASE}/adjustments?tab=new&member=${m.id}`}><Coins size={14} aria-hidden="true" />Adjust points</Link>}
          {v.canOn("points-reversal", "create", m.id) && <Link className="btn btn--secondary btn--sm" to={`${WBASE}/reversals?tab=new&member=${m.id}`}><Undo2 size={14} aria-hidden="true" />Reverse a credit</Link>}
          {v.canOn("points-transfer", "create", m.id) && <Link className="btn btn--secondary btn--sm" to={`${WBASE}/transfers?tab=new&from=${m.id}`}><ArrowLeftRight size={14} aria-hidden="true" />Transfer</Link>}
        </div>
      </div>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Five headline wallet values" subtitle="SOW 5.1. Five separate values, not five interchangeable buckets">
          <div className="headline-grid">
            {head("Lifetime points", b?.lifetime, "Earned over the account lifetime", "lead")}
            {head("Available points", b?.available, "Redeemable, subject to KYC and restrictions", "available")}
            {head("Redeemed points", b?.redeemed, "Already redeemed", "paid")}
            {head("Scheme points", b?.scheme, "Unsettled until scheme closure and settlement", "scheme")}
            {tdsModel.model === "kitty_at_scan" ? head("TDS deducted", b?.tdsDeductedPoints, "EP/IMP: at scan, held in the TDS Kitty (points)", "kitty") : tdsModel.model === "on_redemption" ? head("TDS deducted", b?.tdsDeductedInr, "Deducted at redemption (recorded ₹)", "kitty", "inr") : <div className="headline headline--kitty"><span className="headline__label">TDS deducted</span><BcrTag>Not configured for DD</BcrTag><DecisionRef id="FD-11" /></div>}
          </div>
        </Panel>
        <Panel title="Balance reliability" subtitle="SOW 5.1.1">
          <BalanceReliability v={v} memberId={m.id} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Point classification" subtitle="Each line maps to a wallet-service state">
          <table className="table table--compact">
            <thead><tr><th>Classification</th><th className="num">Points</th><th>Redeemable</th><th>Source</th></tr></thead>
            <tbody>
              {cls.map((c) => (
                <tr key={c.key} title={c.desc}>
                  <th scope="row">{c.label}</th>
                  <td className="num">{view.state === "live" ? pts(c.points) : "—"}</td>
                  <td>{c.redeemable ? <span className="pos small">Yes</span> : <span className="muted small">No</span>}</td>
                  <td className="small muted">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="TDS details" subtitle={tdsModel.label}>
          <p className="small">{tdsModel.detail}</p>
          {m.programme === "EP" && (
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>PAN status</dt><dd>{panVerified(v.mem, m.id) ? "Verified · provisional 10%" : "Not verified · provisional 20%"}</dd></div>
              <div className="kv__row"><dt>Current TDS Kitty</dt><dd className="num">{pts(b?.tdsKitty)}</dd></div>
              <div className="kv__row"><dt>TDS paid</dt><dd className="num">{pts(b?.tdsPaid)}</dd></div>
              {assess && <div className="kv__row"><dt>{lastFy} assessment</dt><dd className="small">{assess.calculation === "ready" ? assess.detail : <><BcrTag>TDS calculation · business confirmation required</BcrTag> <DecisionRef id="FD-01" label="OP-TDS1" /></>}</dd></div>}
            </dl>
          )}
          {tdsModel.model === "on_redemption" && (
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Scan-time TDS</dt><dd>None (no Kitty)</dd></div>
              <div className="kv__row"><dt>TDS recorded on redemptions</dt><dd className="num">{inr(b?.tdsDeductedInr)}</dd></div>
              <div className="kv__row"><dt>New redemption TDS</dt><dd><BcrTag /> <DecisionRef id="FD-01" label="OP-TDS1" /></dd></div>
            </dl>
          )}
        </Panel>
      </div>
      {m.programme === "Retailer" && gate && (
        <div className="grid-2">
          <Panel title="GST gate" subtitle="SOW 5.5">
            <p className="small">{gate.message}</p>
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Threshold</dt><dd className="num">{inr(gate.thresholdInr)}</dd></div>
              <div className="kv__row"><dt>Eligible Base Points (₹)</dt><dd className="num">{inr(gate.eligibleBaseInr)}</dd></div>
              <div className="kv__row"><dt>GST-locked Base Points</dt><dd className="num">{pts(b?.gstLocked)}</dd></div>
              <div className="kv__row"><dt>Locked scheme points</dt><dd className="num">{pts(gate.lockedSchemePoints)}</dd></div>
              <div className="kv__row"><dt>Exception scheme points (DU / Battery / WSSG)</dt><dd className="num">{pts(gate.exceptionSchemePoints)}</dd></div>
            </dl>
            <Link to={`${WBASE}/gst?member=${m.id}`} className="small">Open in GST gate</Link>
          </Panel>
          <Panel title="Retailer TDS reserve" subtitle="SOW 5.4.2: non-redeemable minimum reserve">
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Reserve</dt><dd className="num">{inr(reserve.reserveInr)}</dd></div>
              <div className="kv__row"><dt>Source</dt><dd className="small">{reserve.source}</dd></div>
              <div className="kv__row"><dt>Available (₹ equivalent)</dt><dd className="num">{inr(b ? b.available * v.ws.config.pointValueInr : null)}</dd></div>
              <div className="kv__row"><dt>Redeemable after reserve</dt><dd className="num">{inr(b ? redeemableAfterReserve(b.available * v.ws.config.pointValueInr, reserve.reserveInr) : null)}</dd></div>
            </dl>
            <p className="small muted">₹ equivalents use the mock service conversion (<DecisionRef id="FD-07" />).</p>
          </Panel>
        </div>
      )}
      <Panel title="Scheme settlement" subtitle="Scheme points stay unsettled until the Phase 6 two-level settlement releases them">
        {unsettledBy.size === 0 && releases.length === 0 ? (
          <p className="muted small">No scheme points for this member.</p>
        ) : (
          <table className="table table--compact">
            <thead><tr><th>Scheme</th><th className="num">Unsettled</th><th>GST classification</th><th className="num">Released to Available</th></tr></thead>
            <tbody>
              {Array.from(new Set([...unsettledBy.keys(), ...releases.map((r) => r.schemeId ?? "—")])).map((sid) => (
                <tr key={sid}>
                  <th scope="row"><Link to={`/schemes/scheme/${sid}`} className="mono small">{sid}</Link></th>
                  <td className="num">{pts(unsettledBy.get(sid) ?? 0)}</td>
                  <td className="small">{m.programme === "Retailer" ? GST_SCHEME_CLASS[sid]?.cls ?? "unclassified (treated as locked)" : "—"}</td>
                  <td className="num">{pts(releases.filter((r) => r.schemeId === sid).reduce((n, r) => n + r.points, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Transaction history" subtitle={`${history.length} ledger lines in the period · credited ${pts(periodBal.lifetime)} · redeemed ${pts(periodBal.redeemed)}`} actions={<div className="btn-row"><SelectField label="Period" value={period} onChange={(x) => setPeriod(x as Period)} options={PERIOD_OPTIONS} />{period === "custom" && <><TextField label="From" type="date" value={from} onChange={setFrom} /><TextField label="To" type="date" value={to} onChange={setTo} /></>}</div>}>
        <p className="small muted">Financial year runs April to March ({fyNow} now). Redemptions: {red.length}.</p>
        <DataTable
          rows={history}
          rowKey={(x) => x.line.id}
          caption="Wallet transaction history"
          pageSize={12}
          columns={[
            { key: "at", header: "Date", value: (x) => x.line.at, render: (x) => <span className="num small">{dt(x.line.at)}</span> },
            { key: "id", header: "Transaction", value: (x) => x.line.id, render: (x) => ledgerLink(x.line.id) },
            { key: "type", header: "Type", value: (x) => LEDGER_TYPE[x.line.type].label, render: (x) => <TypeTag type={x.line.type} /> },
            { key: "bucket", header: "Bucket", value: (x) => x.line.bucket, render: (x) => <BucketTag bucket={x.line.bucket} /> },
            { key: "pts", header: "Points", value: (x) => x.line.points, render: (x) => <PointsCell n={x.line.points} />, align: "right" },
            { key: "prev", header: "Previous", value: (x) => x.previous, render: (x) => <span className="num small muted">{pts(x.previous)}</span>, align: "right" },
            { key: "upd", header: "Updated", value: (x) => x.updated, render: (x) => <span className="num small">{pts(x.updated)}</span>, align: "right" },
            { key: "status", header: "Status", value: (x) => x.line.status },
          ]}
        />
      </Panel>
    </>
  );
}

export { memberLink };
