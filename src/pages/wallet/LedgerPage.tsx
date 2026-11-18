import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, Lock, Printer } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, SelectField } from "@/components/ui/primitives";
import { Tabs, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { BUCKET, LEDGER_TYPE, PROGRAMMES } from "@/config/walletCatalogue";
import { withRunningBalances } from "@/features/wallet/engine";
import { recordExport } from "@/features/wallet/store";
import type { Bucket, LedgerEntry, LedgerType } from "@/types/wallet";
import { Notice } from "@/pages/approvals/shared";
import { PolicyMessages } from "@/pages/users/shared";
import { BucketTag, PERIOD_OPTIONS, PointsCell, TypeTag, WBASE, approvalLink, dt, inPeriod, ledgerLink, memberLink, memberName, pts, stateOf, useParam, useRun, useWalletView, userName, type Period } from "./shared";

export function LedgerPage() {
  const v = useWalletView("points-ledger");
  const nav = useNavigate();
  const { result, run } = useRun();
  const [tab, setTab] = useParam("tab", "ledger");
  const [bucket, setBucket] = useParam("bucket", "all");
  const [type, setType] = useParam("type", "all");
  const [member, setMember] = useParam("member", "");
  const [status, setStatus] = useState("all");
  const [prog, setProg] = useState("all");
  const [state, setState] = useState("all");
  const [source, setSource] = useState("all");
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(
    () =>
      withRunningBalances(v.lines)
        .filter(({ line: l }) => v.inScope(l.memberId) && (bucket === "all" || l.bucket === bucket) && (type === "all" || l.type === type) && (status === "all" || l.status === status) && (prog === "all" || l.programme === prog) && (state === "all" || stateOf(l.branchCode) === state) && (source === "all" || l.channel === source) && (!member.trim() || l.memberId.toLowerCase().includes(member.trim().toLowerCase())) && inPeriod(l.at, period, v.today, from, to))
        .reverse(),
    [v.lines, v.inScope, bucket, type, status, prog, state, source, member, period, from, to, v.today],
  );
  type Row = (typeof rows)[number];
  const canExport = v.can("points-ledger:export");
  const cols: Column<Row>[] = [
    { key: "id", header: "Transaction ID", value: (r) => r.line.id, render: (r) => ledgerLink(r.line.id) },
    { key: "ref", header: "Reference ID", value: (r) => r.line.ref, render: (r) => <span className="mono small">{r.line.ref}</span> },
    { key: "member", header: "Member ID", value: (r) => r.line.memberId, render: (r) => memberLink(r.line.memberId) },
    { key: "name", header: "Member name", value: (r) => memberName(v.mem, r.line.memberId) },
    { key: "prog", header: "Programme", value: (r) => r.line.programme },
    { key: "at", header: "Transaction date", value: (r) => r.line.at, render: (r) => <span className="num small">{dt(r.line.at)}</span> },
    { key: "type", header: "Transaction type", value: (r) => LEDGER_TYPE[r.line.type].label, render: (r) => <TypeTag type={r.line.type} /> },
    { key: "bucket", header: "Bucket", value: (r) => BUCKET[r.line.bucket].short, render: (r) => <BucketTag bucket={r.line.bucket} /> },
    { key: "pts", header: "Points", value: (r) => r.line.points, render: (r) => <PointsCell n={r.line.points} />, align: "right" },
    { key: "prev", header: "Previous balance", value: (r) => r.previous, render: (r) => <span className="num small muted">{pts(r.previous)}</span>, align: "right" },
    { key: "upd", header: "Updated balance", value: (r) => r.updated, render: (r) => <span className="num small">{pts(r.updated)}</span>, align: "right" },
    { key: "source", header: "Source", value: (r) => r.line.source },
    { key: "apr", header: "Approval reference", value: (r) => r.line.approvalRequestId ?? "", render: (r) => approvalLink(r.line.approvalRequestId) },
    { key: "status", header: "Status", value: (r) => r.line.status },
  ];
  const exportCsv = (name: string, list: Row[]) => {
    const res = run(recordExport(v.uid, "points-ledger", name, list.length), "Export recorded in the financial audit log");
    if (!res.ok) return;
    downloadCsv(`${name}.csv`, cols.map((c) => ({ header: c.header, value: (r: Row) => c.value(r) })), list, "Development data. Not a statutory statement");
  };
  const months = Array.from(new Set(rows.map((r) => r.line.at.slice(0, 7)))).sort().reverse();
  const [month, setMonth] = useState("");
  return (
    <>
      <Notice tone="info" icon={<Lock size={16} aria-hidden="true" />}>The ledger is append-only. Lines cannot be edited or deleted here; corrections are new adjustment or reversal lines with their own approval.</Notice>
      <PolicyMessages result={result} />
      <Tabs label="Ledger views" value={tab} onChange={setTab} tabs={[{ id: "ledger", label: "Ledger directory", count: rows.length }, { id: "passbook", label: "Passbook" }]} />
      <div className="filters-bar">
        <TextField label="Member ID" value={member} onChange={setMember} placeholder="MBR-…" />
        <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...Object.entries(LEDGER_TYPE).map(([k, t]) => ({ value: k, label: t.label }))]} />
        <SelectField label="Bucket" value={bucket} onChange={setBucket} options={[{ value: "all", label: "All buckets" }, ...Object.entries(BUCKET).map(([k, b]) => ({ value: k, label: b.short }))]} />
        <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, { value: "completed", label: "Completed" }, { value: "pending", label: "Pending" }, { value: "reversed", label: "Reversed" }, { value: "failed", label: "Failed" }]} />
        <SelectField label="Channel" value={source} onChange={setSource} options={[{ value: "all", label: "All" }, { value: "scan", label: "Scan" }, { value: "manual_adjustment", label: "Manual adjustment" }, { value: "scheme", label: "Scheme" }, { value: "redemption", label: "Redemption" }, { value: "system", label: "System" }]} />
        <SelectField label="State" value={state} onChange={setState} options={[{ value: "all", label: "All" }, ...Array.from(new Set(v.mem.members.map((m) => stateOf(m.branchCode)))).map((s) => ({ value: s, label: s }))]} />
        <SelectField label="Date" value={period} onChange={(x) => setPeriod(x as Period)} options={PERIOD_OPTIONS} />
        {period === "custom" && <><TextField label="From" type="date" value={from} onChange={setFrom} /><TextField label="To" type="date" value={to} onChange={setTo} /></>}
      </div>
      {tab === "ledger" ? (
        <Panel title="Ledger directory" subtitle="Wallet-service lines plus scheme accruals and settlement releases read from Phase 6" actions={canExport ? <button type="button" className="btn btn--secondary btn--sm" onClick={() => exportCsv("points-ledger", rows)}><Download size={14} aria-hidden="true" />Export CSV</button> : <span className="small muted">Export needs Points ledger: Export</span>}>
          <DataTable rows={rows} columns={cols} rowKey={(r) => r.line.id} caption="Points ledger" searchPlaceholder="Search transaction, member or reference ID" onRowClick={(r) => nav(`${WBASE}/ledger/${r.line.id}`)} pageSize={15} />
        </Panel>
      ) : (
        <Panel
          title="Passbook"
          subtitle="SOW 5.7: earning and redemption with full filters, latest first"
          actions={
            canExport ? (
              <div className="btn-row">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => exportCsv(`passbook-statement${member ? `-${member}` : ""}`, rows)}><Download size={14} aria-hidden="true" />Statement CSV</button>
                <SelectField label="Monthly statement" value={month} onChange={(x) => { setMonth(x); if (x) exportCsv(`passbook-${x}${member ? `-${member}` : ""}`, rows.filter((r) => r.line.at.startsWith(x))); }} options={[{ value: "", label: "Choose month" }, ...months.map((x) => ({ value: x, label: x }))]} />
                <button type="button" className="btn btn--tertiary btn--sm" onClick={() => { if (run(recordExport(v.uid, "points-ledger", "passbook-print", rows.length), "Print recorded").ok) window.print(); }}><Printer size={14} aria-hidden="true" />Print / save as PDF</button>
              </div>
            ) : (
              <span className="small muted">Statements need Points ledger: Export</span>
            )
          }
        >
          <DataTable
            rows={rows}
            rowKey={(r) => r.line.id}
            caption="Passbook"
            pageSize={15}
            onRowClick={(r) => nav(`${WBASE}/ledger/${r.line.id}`)}
            columns={[
              { key: "at", header: "Date", value: (r) => r.line.at, render: (r) => <span className="num small">{dt(r.line.at)}</span> },
              { key: "ref", header: "Reference", value: (r) => r.line.ref, render: (r) => <span className="mono small">{r.line.ref}</span> },
              { key: "member", header: "Member", value: (r) => r.line.memberId, render: (r) => memberLink(r.line.memberId) },
              { key: "prog", header: "Programme", value: (r) => r.line.programme },
              { key: "type", header: "Transaction type", value: (r) => LEDGER_TYPE[r.line.type].label },
              { key: "cr", header: "Credited", value: (r) => (r.line.points > 0 ? r.line.points : 0), render: (r) => (r.line.points > 0 ? <span className="num amt-credit">{pts(r.line.points)}</span> : ""), align: "right" },
              { key: "dr", header: "Debited", value: (r) => (r.line.points < 0 ? -r.line.points : 0), render: (r) => (r.line.points < 0 ? <span className="num amt-debit">{pts(-r.line.points)}</span> : ""), align: "right" },
              { key: "bucket", header: "Bucket", value: (r) => BUCKET[r.line.bucket].short, render: (r) => <BucketTag bucket={r.line.bucket} /> },
              { key: "cat", header: "Category / SKU", value: (r) => r.line.categoryId ?? r.line.skuCode ?? "" },
              { key: "scheme", header: "Scheme / campaign", value: (r) => r.line.schemeId ?? r.line.campaignId ?? "" },
              { key: "status", header: "Status", value: (r) => (r.line.status === "completed" ? "Credited" : r.line.status) },
              { key: "channel", header: "Channel", value: (r) => r.line.channel.replace("_", " ") },
              { key: "region", header: "Region", value: (r) => stateOf(r.line.branchCode) },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

export function LedgerDetailPage() {
  const { ledgerId = "" } = useParams();
  const v = useWalletView("points-ledger");
  const l = v.lines.find((x) => x.id === ledgerId);
  if (!l) return <EmptyState title="Transaction not found">No ledger line {ledgerId}</EmptyState>;
  if (!v.inScope(l.memberId)) return <Notice tone="warn">This transaction belongs to a member outside your Points ledger: View scope.</Notice>;
  const run = withRunningBalances(v.lines).find((x) => x.line.id === l.id)!;
  const linked = v.lines.filter((x) => x.ref === l.ref && x.id !== l.id);
  const reversals = v.lines.filter((x) => x.originalId === l.id);
  const original = l.originalId ? v.lines.find((x) => x.id === l.originalId) : undefined;
  const auditRows = v.ws.audit.filter((a) => a.entityId === l.ref || a.after?.includes(l.id));
  const row = (k: string, val: ReactNode) => (
    <div className="kv__row" key={k}>
      <dt>{k}</dt>
      <dd>{val}</dd>
    </div>
  );
  return (
    <>
      <p className="muted small"><Link to={`${WBASE}/ledger`}>Points ledger</Link> / {l.id}</p>
      <Notice tone="info" icon={<Lock size={16} aria-hidden="true" />}>Read only. Historical ledger lines cannot be edited or deleted through the portal.</Notice>
      <div className="grid-2 grid-2--wide-left">
        <Panel title={`${LEDGER_TYPE[l.type].label} · ${l.id}`} subtitle={l.origin === "scheme_module" ? "Read from the Phase 6 scheme module" : l.origin === "seed" ? "Development seed line" : "Posted by the mock wallet service"}>
          <dl className="kv kv--wide">
            {row("Transaction ID", <span className="mono">{l.id}</span>)}
            {row("Reference ID", <span className="mono">{l.ref}</span>)}
            {row("Member", <>{memberLink(l.memberId)} · {memberName(v.mem, l.memberId)}</>)}
            {row("Programme", l.programme)}
            {row("Transaction type", <TypeTag type={l.type as LedgerType} />)}
            {row("Date / time", <span className="num">{dt(l.at)}</span>)}
            {row("Points", <PointsCell n={l.points} />)}
            {l.gross != null && row("Gross points (before Kitty split)", <span className="num">{pts(l.gross)}</span>)}
            {row("Source / channel", `${l.source} · ${l.channel.replace("_", " ")}`)}
            {row("Bucket", <BucketTag bucket={l.bucket as Bucket} />)}
            {row("Previous → updated bucket balance", <span className="num">{pts(run.previous)} → {pts(run.updated)}</span>)}
            {row("Related scheme", l.schemeId ? <Link to={`/schemes/scheme/${l.schemeId}`} className="mono">{l.schemeId}</Link> : "—")}
            {row("Scheme version", l.schemeVersion ?? "—")}
            {row("Settlement reference", l.settlementRef ?? "—")}
            {row("Original transaction", original ? ledgerLink(original.id) : "—")}
            {row("Reversal reference", reversals.length ? reversals.map((x) => <span key={x.id}>{ledgerLink(x.id)} </span>) : "—")}
            {row("Approval request", approvalLink(l.approvalRequestId))}
            {row("Initiated by", userName(v.acc, l.initiatedBy))}
            {row("Approved by", l.approvedBy?.length ? l.approvedBy.map((u) => userName(v.acc, u)).join(", ") : "—")}
            {row("Idempotency key", <span className="mono small">{l.opKey}</span>)}
            {row("Expiry (lot)", l.expiresOn ?? "—")}
            {row("Remarks", l.remarks || "—")}
            {row("Status", l.status)}
          </dl>
        </Panel>
        <div className="stack">
          <Panel title="Linked lines" subtitle="Same business reference (for example both sides of a transfer)">
            {linked.length ? (
              <ul className="plain-list">
                {linked.map((x) => (
                  <li key={x.id}>{ledgerLink(x.id)} <TypeTag type={x.type} /> <BucketTag bucket={x.bucket} /> <PointsCell n={x.points} /> · {x.memberId}</li>
                ))}
              </ul>
            ) : (
              <p className="small muted">None</p>
            )}
          </Panel>
          <Panel title="Audit history">
            {auditRows.length ? (
              <ul className="plain-list small">
                {auditRows.map((a) => (
                  <li key={a.id}><span className="num">{dt(a.at)}</span> · {userName(v.acc, a.actor)} · {a.action.replace(/_/g, " ")} · {a.reason}</li>
                ))}
              </ul>
            ) : (
              <p className="small muted">{l.origin === "scheme_module" ? "See the scheme audit trail in Scheme & Incentive Management" : "Seeded line: no portal audit event"}</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

export type { LedgerEntry };
